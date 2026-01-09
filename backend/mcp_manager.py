
# ==========================================
# FILE: backend/mcp_manager.py
# ==========================================

import asyncio
import json
import os
import shutil
from typing import Dict, Any, List, Optional
import sys
from fastapi import WebSocket, WebSocketDisconnect

class MCPManager:
    def __init__(self, config_path: str = None):
        # Intelligent path resolution:
        # If no path provided, look for 'mcp_config.json' in the same directory as this script
        if not config_path:
            base_dir = os.path.dirname(os.path.abspath(__file__))
            config_path = os.path.join(base_dir, "mcp_config.json")
            
        self.config_path = config_path
        self.processes: Dict[str, asyncio.subprocess.Process] = {}
        self.config = self._load_config()
        self.tool_cache = {}
        
        # Store Remote Agent Connections
        # Format: { "client_id": { "ws": WebSocket, "tools": [], "futures": { msg_id: Future } } }
        self.remote_agents: Dict[str, Any] = {}
        self.msg_counter = 0

    def _load_config(self) -> Dict[str, Any]:
        if not os.path.exists(self.config_path):
            print(f"[MCP] Config not found at {self.config_path}, creating empty default.")
            return {"servers": {}}
        try:
            with open(self.config_path, 'r') as f:
                return json.load(f)
        except Exception as e:
            print(f"[MCP] Error loading config: {e}")
            return {"servers": {}}

    def save_config(self):
        try:
            with open(self.config_path, 'w') as f:
                json.dump(self.config, f, indent=2)
        except Exception as e:
            print(f"[MCP] Error saving config: {e}")

    # --- Remote Agent Management (WebSocket) ---
    
    async def handle_remote_connection(self, client_id: str, websocket: WebSocket):
        """
        Main Blocking Loop for a Remote Client.
        This replaces the background task approach to ensure lifecycle is tightly controlled.
        """
        # 1. Register
        self.remote_agents[client_id] = {
            "ws": websocket,
            "tools": [],
            "futures": {},
        }
        print(f"[MCP] Remote Agent Registered: {client_id}")

        # 2. Trigger initial Tool Discovery (Fire and Forget initially)
        asyncio.create_task(self._send_remote_json_rpc(client_id, "tools/list"))

        # 3. Blocking Receive Loop
        try:
            while True:
                # Wait for messages from the laptop
                text = await websocket.receive_text()
                
                try:
                    data = json.loads(text)
                except json.JSONDecodeError:
                    continue

                # Is this a response to a request we sent?
                if "id" in data:
                    msg_id = data["id"]
                    agent = self.remote_agents.get(client_id)
                    
                    if agent and msg_id in agent["futures"]:
                        future = agent["futures"].pop(msg_id)
                        if not future.done():
                            future.set_result(data)
                    
                    # Special Logic: If this is the tool list, update our cache immediately
                    if "result" in data and "tools" in data["result"]:
                        if agent:
                            tools = data["result"]["tools"]
                            agent["tools"] = tools
                            print(f"[MCP] Agent {client_id} loaded {len(tools)} tools: {[t['name'] for t in tools]}")
                
                # Is this a heartbeat/ping?
                if data.get("method") == "ping":
                    await websocket.send_text(json.dumps({"jsonrpc": "2.0", "result": "pong", "id": data.get("id")}))

        except WebSocketDisconnect:
            print(f"[MCP] Agent {client_id} disconnected normally.")
            raise 
        except Exception as e:
            print(f"[MCP] Agent {client_id} error: {e}")
            raise

    async def remove_remote_connection(self, client_id: str):
        if client_id in self.remote_agents:
            # Cancel any pending futures to unblock awaiting coroutines
            for f in self.remote_agents[client_id]["futures"].values():
                if not f.done():
                    f.cancel()
            del self.remote_agents[client_id]
            print(f"[MCP] Agent {client_id} removed from registry.")

    async def _send_remote_json_rpc(self, client_id: str, method: str, params: Any = None):
        agent = self.remote_agents.get(client_id)
        if not agent: 
            print(f"[MCP] Cannot send to {client_id}, agent not found.")
            return None
        
        self.msg_counter += 1
        msg_id = self.msg_counter
        
        req = {"jsonrpc": "2.0", "method": method, "params": params or {}, "id": msg_id}
        
        loop = asyncio.get_running_loop()
        future = loop.create_future()
        agent["futures"][msg_id] = future
        
        try:
            await agent["ws"].send_text(json.dumps(req))
            response = await asyncio.wait_for(future, timeout=30.0)
            return response
        except asyncio.TimeoutError:
            print(f"[MCP] Remote Call Timeout: {method}")
            if msg_id in agent["futures"]: del agent["futures"][msg_id]
            return None
        except Exception as e:
            print(f"[MCP] Remote Send Error: {e}")
            return None

    # --- Local Process Management (Subprocess) ---

    async def add_server(self, name: str, config: Dict):
        self.config["servers"][name] = config
        self.save_config()
        await self.start_server(name, config)

    async def toggle_server(self, name: str, enabled: bool):
        if name in self.config.get("servers", {}):
            self.config["servers"][name]["enabled"] = enabled
            self.save_config()
            
            if enabled:
                await self.start_server(name, self.config["servers"][name])
            else:
                await self.stop_server(name)

    async def remove_server(self, name: str):
        await self.stop_server(name)
        if "servers" in self.config and name in self.config["servers"]:
            del self.config["servers"][name]
            self.save_config()
        if name in self.tool_cache:
            del self.tool_cache[name]

    async def start_all(self):
        if "servers" not in self.config: self.config["servers"] = {}
        for name, cfg in self.config.get("servers", {}).items():
            if cfg.get("enabled", True):
                await self.start_server(name, cfg)

    async def start_server(self, name: str, config: Dict):
        if name in self.processes: return
        cmd = config["command"]
        args = config["args"]
        env = os.environ.copy()
        env.update(config.get("env", {}))
        
        print(f"[MCP] Launching Local Server: {name}...")
        try:
            # Resolve Python executable
            if cmd == "python":
                if shutil.which("python3"): cmd = "python3"
                elif shutil.which("python"): cmd = "python"
                
            # Ensure args is a flat list of strings
            final_args = [str(a) for a in args]
            
            process = await asyncio.create_subprocess_exec(
                cmd, *final_args,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=env
            )
            self.processes[name] = process
            
            # --- CRITICAL: MCP Protocol Handshake ---
            # 1. Initialize
            print(f"[MCP] Handshaking with {name}...")
            await self._perform_handshake(process)
            
            # 2. List Tools
            await self._refresh_tools(name)
            
        except Exception as e:
            print(f"[MCP] Failed to start {name}: {e}")

    async def _perform_handshake(self, process):
        """Performs the standard MCP initialization sequence."""
        # A. Send 'initialize'
        init_payload = {
            "protocolVersion": "2024-11-05",
            "capabilities": {
                "roots": {"listChanged": True},
                "sampling": {}
            },
            "clientInfo": {"name": "DellTechHost", "version": "0.1.0"}
        }
        
        init_response = await self._send_json_rpc(process, "initialize", init_payload, id=0)
        if not init_response:
             print("[MCP] Handshake failed: No response to initialize.")
             return
        
        server_info = init_response.get("result", {}).get("serverInfo", {})
        print(f"[MCP] Server Initialized: {server_info.get('name', 'Unknown')}")
        
        # B. Send 'notifications/initialized'
        # This is a notification, so we DO NOT await a response (it would deadlock)
        await self._send_notification(process, "notifications/initialized")

    async def stop_server(self, name: str):
        if name in self.processes:
            try:
                self.processes[name].terminate()
                await self.processes[name].wait()
            except: pass
            del self.processes[name]
            if name in self.tool_cache: del self.tool_cache[name]

    async def stop_all(self):
        for name in list(self.processes.keys()):
            await self.stop_server(name)

    # --- Communication Layer (Local) ---

    async def _send_json_rpc(self, process, method: str, params: Any = None, id: int = 1):
        if not process.stdin: return None
        req = {"jsonrpc": "2.0", "method": method, "params": params or {}, "id": id}
        try:
            data = json.dumps(req).encode() + b"\n"
            process.stdin.write(data)
            await process.stdin.drain()
            
            line = await process.stdout.readline()
            if not line: return None
            return json.loads(line.decode())
        except Exception as e:
            print(f"[MCP] RPC Error: {e}")
            return None

    async def _send_notification(self, process, method: str, params: Any = None):
        """Sends a JSON-RPC notification (no ID, no response expected)."""
        if not process.stdin: return
        req = {"jsonrpc": "2.0", "method": method, "params": params or {}}
        try:
            data = json.dumps(req).encode() + b"\n"
            process.stdin.write(data)
            await process.stdin.drain()
            # DO NOT READ STDOUT HERE
        except Exception as e:
            print(f"[MCP] Notification Error: {e}")

    async def _refresh_tools(self, server_name: str):
        proc = self.processes.get(server_name)
        if not proc: return
        resp = await self._send_json_rpc(proc, "tools/list")
        if resp and "result" in resp:
            tools = resp["result"].get("tools", [])
            self.tool_cache[server_name] = tools
            print(f"[MCP] {server_name} registered {len(tools)} tools.")

    # --- Unified Execution ---

    async def get_all_tools_definitions(self) -> List[Dict]:
        """Combine Local + Remote tools into OpenAI format"""
        definitions = []
        
        # 1. Local Tools
        for server, tools in self.tool_cache.items():
            for tool in tools:
                definitions.append({
                    "type": "function",
                    "function": {
                        "name": tool["name"],
                        "description": tool.get("description", ""),
                        "parameters": tool.get("inputSchema", {})
                    }
                })
        
        # 2. Remote Tools
        for agent_id, agent_data in self.remote_agents.items():
            for tool in agent_data["tools"]:
                 definitions.append({
                    "type": "function",
                    "function": {
                        "name": tool["name"],
                        "description": tool.get("description", ""),
                        "parameters": tool.get("inputSchema", {})
                    }
                })
                
        return definitions

    async def execute_tool(self, tool_name: str, args: Dict) -> str:
        # A. Check Remote Agents first
        for client_id, agent_data in self.remote_agents.items():
            if any(t['name'] == tool_name for t in agent_data["tools"]):
                print(f"[MCP] Routing {tool_name} to Remote Agent {client_id}")
                resp = await self._send_remote_json_rpc(client_id, "tools/call", {"name": tool_name, "arguments": args})
                return self._parse_mcp_result(resp)

        # B. Check Local Servers
        server_name = next((s for s, tools in self.tool_cache.items() if any(t['name'] == tool_name for t in tools)), None)
        if server_name:
            proc = self.processes.get(server_name)
            if proc:
                resp = await self._send_json_rpc(proc, "tools/call", {"name": tool_name, "arguments": args})
                return self._parse_mcp_result(resp)
            
        return "Tool not found or agent disconnected."

    def _parse_mcp_result(self, resp) -> str:
        # Improved error handling: Raise exception if RPC returned error
        if resp and "error" in resp:
             error_msg = resp['error'].get('message', 'Unknown RPC Error')
             code = resp['error'].get('code', 'N/A')
             raise Exception(f"MCP Error ({code}): {error_msg}")
             
        if resp and "result" in resp:
            content = resp["result"].get("content", [])
            text_content = [c["text"] for c in content if c.get("type") == "text"]
            return "\n".join(text_content)
            
        return "Empty response."

    def list_servers_status(self):
        # Local
        local = [{
            "id": k, 
            "name": k, 
            "status": "running" if k in self.processes else "stopped",
            "tools": self.tool_cache.get(k, [])
        } for k in self.config.get("servers", {})]
        
        # Remote
        remote = [{
            "id": k,
            "name": f"Remote ({k.split('-')[-1]})",
            "status": "running",
            "tools": v["tools"]
        } for k, v in self.remote_agents.items()]
        
        return local + remote
