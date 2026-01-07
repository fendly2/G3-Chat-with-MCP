
# ==========================================
# FILE: backend/server.py
# ==========================================

import os
import uvicorn
from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import json
import asyncio
from openai import OpenAI

# Import local MCP Manager
from mcp_manager import MCPManager

app = FastAPI(title="DellTech AI Workspace API", version="2.0.0")

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize MCP Manager
mcp_manager = MCPManager(config_path="mcp_config.json")

# Models
class Message(BaseModel):
    role: str
    content: str | None
    tool_call_id: str | None = None

class ChatCompletionRequest(BaseModel):
    model: str
    messages: List[Message]
    stream: bool = False
    temperature: float = 0.7

class AddServerRequest(BaseModel):
    name: str
    command: str
    args: List[str] = []
    env: Dict[str, str] = {}

class ToggleServerRequest(BaseModel):
    enabled: bool

@app.on_event("startup")
async def startup_event():
    """Start MCP servers on backend startup with auto-discovery."""
    print("--- DellTech AI Backend Starting ---")
    await mcp_manager.start_all()

@app.on_event("shutdown")
async def shutdown_event():
    await mcp_manager.stop_all()

# --- WebSocket Endpoint for Remote Agents ---
@app.websocket("/ws/mcp")
async def websocket_mcp_endpoint(websocket: WebSocket):
    """
    Reverse WebSocket: The Laptop connects here.
    Server uses this socket to send commands TO the laptop.
    """
    await websocket.accept()
    client_host = websocket.client.host
    client_id = f"laptop-agent-{client_host}"
    print(f"[WS] Remote Agent connected: {client_id}")
    
    try:
        # Delegate the entire connection lifecycle to the Manager
        # This will block until the connection closes
        await mcp_manager.handle_remote_connection(client_id, websocket)
            
    except WebSocketDisconnect:
        print(f"[WS] Remote Agent disconnected (Standard): {client_id}")
    except Exception as e:
        print(f"[WS] Error in connection {client_id}: {e}")
    finally:
        # Ensure cleanup happens
        await mcp_manager.remove_remote_connection(client_id)

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

@app.get("/mcp/servers")
async def list_servers():
    return mcp_manager.list_servers_status()

@app.post("/mcp/servers")
async def add_server(req: AddServerRequest):
    await mcp_manager.add_server(req.name, {"command": req.command, "args": req.args, "env": req.env, "enabled": True})
    return {"status": "added", "name": req.name}

@app.patch("/mcp/servers/{name}")
async def toggle_server(name: str, req: ToggleServerRequest):
    await mcp_manager.toggle_server(name, req.enabled)
    return {"status": "updated", "name": name, "enabled": req.enabled}

@app.delete("/mcp/servers/{name}")
async def remove_server(name: str):
    await mcp_manager.remove_server(name)
    return {"status": "removed", "name": name}

# --- Core Chat Logic ---

async def smart_stream_generator(request: ChatCompletionRequest, req: Request):
    """
    The Brain. Orchestrates the conversation between User, LLM, and MCP Tools.
    """
    api_key = req.headers.get("Authorization", "").replace("Bearer ", "")
    llm_base_url = req.headers.get("X-LLM-Base-URL", "https://api.openai.com/v1")
    
    # COMPATIBILITY FIX: Allow empty API keys for local LLMs
    if not api_key: 
        api_key = "dummy-key-for-local-llm"

    try:
        client = OpenAI(api_key=api_key, base_url=llm_base_url)
        
        # 1. Fetch available tools dynamically from MCP Manager (Local + Remote)
        tools = await mcp_manager.get_all_tools_definitions()
        
        # Create a lookup map for tool descriptions: { "tool_name": "Description..." }
        tool_descriptions_map = {}
        if tools:
            for t in tools:
                if "function" in t:
                    tool_descriptions_map[t["function"]["name"]] = t["function"].get("description", "")

        messages = [{"role": m.role, "content": m.content, "tool_call_id": m.tool_call_id} for m in request.messages]
        
        # SYSTEM PROMPT OPTIMIZATION: Discourage filler text
        system_instruction = (
            "You are a helpful Dell Tech assistant. You have access to tools. "
            "IMPORTANT: When you need to use a tool, use it DIRECTLY immediately. "
            "Do NOT output conversational filler like 'Let me check that' or 'I will look for you' before calling the tool. "
            "Just call the function."
        )

        if messages and messages[0]['role'] != 'system':
            messages.insert(0, {"role": "system", "content": system_instruction})
        elif messages and messages[0]['role'] == 'system':
            # Append instruction to existing system prompt if possible, or just rely on it
            messages[0]['content'] += " " + system_instruction

        # --- Round 1: Initial Query ---
        stream = client.chat.completions.create(
            model=request.model,
            messages=messages,
            tools=tools if tools else None,
            stream=True,
            temperature=request.temperature
        )
        
        tool_calls = []
        text_buffer = "" # BUFFER STRATEGY: Hold text until we know if it's a tool call
        is_tool_mode = False
        
        for chunk in stream:
            delta = chunk.choices[0].delta
            
            # A. Check for Tools
            if delta.tool_calls:
                # If we detect a tool call, we enter "Tool Mode"
                if not is_tool_mode:
                    is_tool_mode = True
                    text_buffer = "" # SCRUBBING: Discard any "Let me check..." filler text
                
                for tc in delta.tool_calls:
                    if tc.index is not None:
                         while len(tool_calls) <= tc.index:
                             # CRITICAL FIX: OpenAI requires 'type': 'function' in history
                             tool_calls.append({
                                 "id": "", 
                                 "type": "function", 
                                 "function": {"name": "", "arguments": ""}
                             })
                         if tc.id: tool_calls[tc.index]["id"] = tc.id
                         if tc.function.name: tool_calls[tc.index]["function"]["name"] = tc.function.name
                         if tc.function.arguments: tool_calls[tc.index]["function"]["arguments"] += tc.function.arguments
            
            # B. Check for Content
            if delta.content:
                if is_tool_mode:
                    # If we are already building a tool, ignore any content (usually hallucinated or redundant)
                    pass 
                else:
                    text_buffer += delta.content
                    # Heuristic: If buffer gets too long (> 60 chars), it's probably not just filler, flush it.
                    if len(text_buffer) > 60:
                        yield f"data: {json.dumps({'choices': [{'delta': {'content': text_buffer}}]})}\n\n"
                        text_buffer = ""

        # End of Loop Processing
        
        # If we have residual text in buffer and NO tool was called, flush it now
        if text_buffer and not tool_calls:
             yield f"data: {json.dumps({'choices': [{'delta': {'content': text_buffer}}]})}\n\n"

        # --- Round 2: Tool Execution ---
        if tool_calls:
             # Add the assistant's thought process (tool call request) to history
             # Note: We set content to None or "" because we scrubbed the filler from the user view.
             # OpenAI accepts content=None when tool_calls are present.
             messages.append({"role": "assistant", "content": None, "tool_calls": tool_calls})
             
             for tc in tool_calls:
                 func_name = tc["function"]["name"]
                 call_id = tc["id"]
                 
                 # Look up dynamic description
                 desc = tool_descriptions_map.get(func_name, "Executing enterprise utility function...")
                 
                 # Notify Frontend: Tool Started (With Description)
                 yield f"data: {json.dumps({'type': 'tool_start', 'tool': func_name, 'description': desc})}\n\n"
                 
                 try:
                     args = json.loads(tc["function"]["arguments"])
                     print(f"[Orchestrator] Executing {func_name} with {args}")
                     
                     # CALL MCP (Manager routes to Local or Remote automatically)
                     result_str = await mcp_manager.execute_tool(func_name, args)
                     
                     # Notify Frontend: Tool Success
                     yield f"data: {json.dumps({'type': 'tool_end', 'result': result_str})}\n\n"
                     
                     messages.append({"role": "tool", "tool_call_id": call_id, "content": str(result_str)})
                     
                 except Exception as e:
                     err_msg = str(e)
                     print(f"[Orchestrator] Tool Error: {err_msg}")
                     # Notify Frontend: Tool Error
                     yield f"data: {json.dumps({'type': 'error', 'message': err_msg})}\n\n"
                     messages.append({"role": "tool", "tool_call_id": call_id, "content": f"Error: {err_msg}"})

             # Request final response from LLM with tool outputs
             stream2 = client.chat.completions.create(
                model=request.model,
                messages=messages,
                stream=True
             )
             
             for chunk in stream2:
                 yield f"data: {json.dumps(chunk.model_dump())}\n\n"
                 
        yield "data: [DONE]\n\n"

    except Exception as e:
        print(f"Server Error: {e}")
        # Send a generic error event if the whole stream fails
        yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

@app.post("/v1/chat/completions")
async def chat_completions(request: ChatCompletionRequest, req: Request):
    return StreamingResponse(smart_stream_generator(request, req), media_type="text/event-stream")

if __name__ == "__main__":
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
