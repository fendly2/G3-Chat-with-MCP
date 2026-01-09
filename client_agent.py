
# ==========================================
# FILE: client_agent.py
# Usage: python client_agent.py --server ws://SERVER_IP:8000/ws/mcp
# ==========================================

import asyncio
import json
import logging
import argparse
import sys
import platform
import os
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional

# Check dependencies
try:
    import websockets
except ImportError:
    print("Error: 'websockets' module not found. Please run: pip install websockets")
    sys.exit(1)

# Check Windows dependencies (Only needed for Outlook)
try:
    if platform.system() == "Windows":
        import pythoncom
        import win32com.client
    else:
        pythoncom = None
        win32com = None
except ImportError:
    pythoncom = None
    win32com = None

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# ==========================================
# ⚙️ CONFIGURATION & UTILS
# ==========================================

ATTACHMENT_SAVE_DIR = os.path.join(os.path.expanduser("~"), "Downloads", "DellAI_Attachments")

class OutlookScope:
    """
    Context Manager to ensure Thread-Safe COM handling.
    Industry standard for running win32com in async/threaded environments.
    """
    def __enter__(self):
        if platform.system() == "Windows" and pythoncom:
            pythoncom.CoInitialize()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if platform.system() == "Windows" and pythoncom:
            pythoncom.CoUninitialize()

def get_folder_id(name: str) -> int:
    """Map friendly names to Outlook MAPI Folder IDs"""
    mapping = {
        "inbox": 6, 
        "drafts": 16, 
        "sent": 5, 
        "deleted": 3, 
        "outbox": 4, 
        "calendar": 9, 
        "contacts": 10,
        "junk": 23
    }
    return mapping.get(name.lower(), 6)

def parse_email_summary(msg) -> Dict:
    """Safe extraction of email summary"""
    try:
        return {
            "id": msg.EntryID,
            "subject": msg.Subject,
            "sender": msg.SenderName,
            "received": str(msg.ReceivedTime),
            "preview": msg.Body[:100].replace("\r", " ").replace("\n", " ") + "...",
            "has_attachments": msg.Attachments.Count > 0
        }
    except Exception:
        return {"subject": "Error reading email item"}

# ==========================================
# 🛠️ TOOL IMPLEMENTATIONS
# ==========================================

# --- 1. Email Reading & Search ---

def tool_read_emails(folder: str = "inbox", count: int = 5, unread_only: bool = False):
    if not pythoncom: return {"error": "Windows/Outlook required"}
    
    with OutlookScope():
        try:
            outlook = win32com.client.Dispatch("Outlook.Application").GetNamespace("MAPI")
            f_id = get_folder_id(folder)
            folder_obj = outlook.GetDefaultFolder(f_id)
            items = folder_obj.Items
            items.Sort("[ReceivedTime]", True)
            
            if unread_only:
                items = items.Restrict("[Unread] = True")
            
            results = []
            # Iterate safely with a cap
            item_count = 0
            for item in items:
                if item_count >= count: break
                # Ensure it's a MailItem (Class 43) to avoid calendar items in inbox
                if getattr(item, "Class", 0) == 43: 
                    results.append(parse_email_summary(item))
                    item_count += 1
            return results
        except Exception as e:
            return {"error": str(e)}

def tool_search_emails(query: str, count: int = 5):
    """Robust search using DASL/SQL filter for performance"""
    if not pythoncom: return {"error": "Windows/Outlook required"}
    
    with OutlookScope():
        try:
            outlook = win32com.client.Dispatch("Outlook.Application").GetNamespace("MAPI")
            inbox = outlook.GetDefaultFolder(6)
            
            # Search in Subject OR Body
            # Schema Ref: http://schemas.microsoft.com/mapi/proptag/
            filter_str = (
                f"@SQL=\"urn:schemas:httpmail:subject\" LIKE '%{query}%' "
                f"OR \"urn:schemas:httpmail:textdescription\" LIKE '%{query}%'"
            )
            
            items = inbox.Items.Restrict(filter_str)
            items.Sort("[ReceivedTime]", True)
            
            results = []
            for i in range(min(count, 20)):
                if i >= len(items): break
                results.append(parse_email_summary(items[i]))
            return results
        except Exception as e:
            return {"error": str(e)}

def tool_get_email_detail(entry_id: str):
    """Fetch full body and attachment info"""
    if not pythoncom: return {"error": "Windows/Outlook required"}
    
    with OutlookScope():
        try:
            outlook = win32com.client.Dispatch("Outlook.Application").GetNamespace("MAPI")
            msg = outlook.GetItemFromID(entry_id)
            
            attachments = []
            for i in range(msg.Attachments.Count):
                att = msg.Attachments[i+1] # 1-based index
                attachments.append({
                    "index": i+1,
                    "filename": att.FileName,
                    "size": f"{att.Size / 1024:.1f} KB"
                })

            return {
                "id": msg.EntryID,
                "subject": msg.Subject,
                "sender": msg.SenderName,
                "to": msg.To,
                "cc": msg.CC,
                "received": str(msg.ReceivedTime),
                "body": msg.Body, # Full text body
                "attachments": attachments
            }
        except Exception as e:
            return {"error": str(e)}

# --- 2. Email Actions (Send/Reply/Forward) ---

def tool_send_email(to: str, subject: str, body: str, cc: str = None, attachments: List[str] = None):
    if not pythoncom: return {"error": "Windows/Outlook required"}
    
    with OutlookScope():
        try:
            outlook = win32com.client.Dispatch("Outlook.Application")
            mail = outlook.CreateItem(0) # 0 = MailItem
            mail.To = to
            mail.Subject = subject
            mail.Body = body
            if cc: mail.CC = cc
            
            if attachments:
                for path in attachments:
                    # Clean path
                    clean_path = path.strip().strip("'").strip('"')
                    if os.path.exists(clean_path):
                        mail.Attachments.Add(os.path.abspath(clean_path))
                    else:
                        print(f"⚠️ Attachment not found: {clean_path}")
            
            mail.Send()
            return {"status": "sent", "recipient": to}
        except Exception as e:
            return {"error": str(e)}

def tool_reply_email(entry_id: str, body: str, reply_all: bool = False):
    if not pythoncom: return {"error": "Windows/Outlook required"}
    
    with OutlookScope():
        try:
            outlook = win32com.client.Dispatch("Outlook.Application").GetNamespace("MAPI")
            original = outlook.GetItemFromID(entry_id)
            
            reply = original.ReplyAll() if reply_all else original.Reply()
            
            # Preservation of Signature:
            # We insert the new body *before* the existing HTML body (which contains signature + original thread)
            # Simple conversion of new lines to HTML breaks
            html_content = body.replace("\n", "<br>")
            reply.HTMLBody = f"<div style='font-family: Calibri, sans-serif; font-size: 11pt;'>{html_content}</div><br>" + reply.HTMLBody
            
            reply.Send()
            return {"status": "replied", "mode": "reply_all" if reply_all else "reply"}
        except Exception as e:
            return {"error": str(e)}

def tool_forward_email(entry_id: str, to: str, body: str = ""):
    if not pythoncom: return {"error": "Windows/Outlook required"}
    
    with OutlookScope():
        try:
            outlook = win32com.client.Dispatch("Outlook.Application").GetNamespace("MAPI")
            original = outlook.GetItemFromID(entry_id)
            fwd = original.Forward()
            fwd.To = to
            if body:
                fwd.HTMLBody = f"<p>{body}</p><br>" + fwd.HTMLBody
            
            fwd.Send()
            return {"status": "forwarded", "recipient": to}
        except Exception as e:
            return {"error": str(e)}

# --- 3. Calendar Management ---

def tool_read_calendar(range_str: str = "today"):
    """
    range_str: 'today', 'tomorrow', 'week'
    """
    if not pythoncom: return {"error": "Windows/Outlook required"}
    
    with OutlookScope():
        try:
            outlook = win32com.client.Dispatch("Outlook.Application").GetNamespace("MAPI")
            calendar = outlook.GetDefaultFolder(9) # 9 = Calendar
            items = calendar.Items
            items.Sort("[Start]")
            items.IncludeRecurrences = True
            
            now = datetime.now()
            start_dt = now.replace(hour=0, minute=0, second=0, microsecond=0)
            
            if range_str == "tomorrow":
                start_dt += timedelta(days=1)
                end_dt = start_dt + timedelta(days=1)
            elif range_str == "week":
                end_dt = start_dt + timedelta(days=7)
            else: # today
                end_dt = start_dt + timedelta(days=1)

            # Restrict is efficient but locale-sensitive on dates. 
            # We iterate manually since the range is small (performance impact negligible for day/week view)
            results = []
            for item in items:
                try:
                    # Filter items in range
                    # Note: item.Start is a pywin32 time object, needs comparison handling
                    # We cast to string for safety in this demo, or use direct comparison if supported
                    if item.Start >= start_dt and item.Start < end_dt:
                        results.append({
                            "subject": item.Subject,
                            "start": str(item.Start),
                            "end": str(item.End),
                            "location": item.Location,
                            "organizer": item.Organizer,
                            "body": item.Body[:200] if item.Body else ""
                        })
                    if item.Start > end_dt:
                        break # Stop iteration
                except: continue
                
            return results
        except Exception as e:
            return {"error": str(e)}

def tool_create_event(subject: str, start_time: str, duration_minutes: int, body: str = ""):
    """
    start_time: 'YYYY-MM-DD HH:MM' format string (e.g., '2023-10-25 14:00')
    """
    if not pythoncom: return {"error": "Windows/Outlook required"}
    
    with OutlookScope():
        try:
            outlook = win32com.client.Dispatch("Outlook.Application")
            appt = outlook.CreateItem(1) # 1 = Appointment
            appt.Subject = subject
            appt.Start = start_time 
            appt.Duration = duration_minutes
            appt.Body = body
            appt.Save()
            return {"status": "created", "subject": subject, "start": start_time}
        except Exception as e:
            return {"error": str(e)}

# --- 4. Attachments ---

def tool_download_attachment(entry_id: str, attachment_index: int):
    if not pythoncom: return {"error": "Windows/Outlook required"}
    
    with OutlookScope():
        try:
            outlook = win32com.client.Dispatch("Outlook.Application").GetNamespace("MAPI")
            msg = outlook.GetItemFromID(entry_id)
            
            if attachment_index < 1 or attachment_index > msg.Attachments.Count:
                return {"error": f"Invalid index. Email has {msg.Attachments.Count} attachments."}
            
            att = msg.Attachments[attachment_index]
            
            if not os.path.exists(ATTACHMENT_SAVE_DIR):
                os.makedirs(ATTACHMENT_SAVE_DIR)
                
            file_path = os.path.join(ATTACHMENT_SAVE_DIR, att.FileName)
            att.SaveAsFile(file_path)
            
            return {"status": "downloaded", "path": file_path}
        except Exception as e:
            return {"error": str(e)}

def tool_get_system_info():
    """Basic laptop health check"""
    return {
        "os": platform.system(),
        "release": platform.release(),
        "machine": platform.machine(),
        "time": str(datetime.now())
    }

# ==========================================
# 📚 TOOL REGISTRY
# ==========================================

TOOLS_REGISTRY = {
    # --- Reading ---
    "read_emails": {
        "func": tool_read_emails,
        "blocking": True,
        "schema": {
            "name": "read_emails",
            "description": "Read recent emails from Outlook folders.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "folder": {"type": "string", "enum": ["inbox", "sent", "drafts", "deleted"], "default": "inbox"},
                    "count": {"type": "integer", "default": 5},
                    "unread_only": {"type": "boolean", "default": False}
                }
            }
        }
    },
    "search_emails": {
        "func": tool_search_emails,
        "blocking": True,
        "schema": {
            "name": "search_emails",
            "description": "Search for emails by keyword in subject or body.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "query": {"type": "string"},
                    "count": {"type": "integer", "default": 5}
                },
                "required": ["query"]
            }
        }
    },
    "get_email_detail": {
        "func": tool_get_email_detail,
        "blocking": True,
        "schema": {
            "name": "get_email_detail",
            "description": "Get full body content and attachment list of a specific email.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "entry_id": {"type": "string", "description": "The unique ID of the email"}
                },
                "required": ["entry_id"]
            }
        }
    },
    # --- Writing ---
    "send_email": {
        "func": tool_send_email,
        "blocking": True,
        "schema": {
            "name": "send_email",
            "description": "Send a new email via Outlook.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "to": {"type": "string", "description": "Semicolon separated email addresses"},
                    "subject": {"type": "string"},
                    "body": {"type": "string"},
                    "cc": {"type": "string"},
                    "attachments": {"type": "array", "items": {"type": "string"}, "description": "List of local file paths"}
                },
                "required": ["to", "subject", "body"]
            }
        }
    },
    "reply_email": {
        "func": tool_reply_email,
        "blocking": True,
        "schema": {
            "name": "reply_email",
            "description": "Reply to an email.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "entry_id": {"type": "string"},
                    "body": {"type": "string"},
                    "reply_all": {"type": "boolean", "default": False}
                },
                "required": ["entry_id", "body"]
            }
        }
    },
    "forward_email": {
        "func": tool_forward_email,
        "blocking": True,
        "schema": {
            "name": "forward_email",
            "description": "Forward an email to someone.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "entry_id": {"type": "string"},
                    "to": {"type": "string"},
                    "body": {"type": "string", "description": "Optional message to add"}
                },
                "required": ["entry_id", "to"]
            }
        }
    },
    # --- Calendar ---
    "read_calendar": {
        "func": tool_read_calendar,
        "blocking": True,
        "schema": {
            "name": "read_calendar",
            "description": "List calendar events.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "range_str": {"type": "string", "enum": ["today", "tomorrow", "week"], "default": "today"}
                }
            }
        }
    },
    "create_event": {
        "func": tool_create_event,
        "blocking": True,
        "schema": {
            "name": "create_event",
            "description": "Create a calendar appointment.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "subject": {"type": "string"},
                    "start_time": {"type": "string", "description": "Format: YYYY-MM-DD HH:MM"},
                    "duration_minutes": {"type": "integer"},
                    "body": {"type": "string"}
                },
                "required": ["subject", "start_time", "duration_minutes"]
            }
        }
    },
    # --- Attachments ---
    "download_attachment": {
        "func": tool_download_attachment,
        "blocking": True,
        "schema": {
            "name": "download_attachment",
            "description": f"Download attachment to {ATTACHMENT_SAVE_DIR}",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "entry_id": {"type": "string"},
                    "attachment_index": {"type": "integer", "description": "1-based index from get_email_detail"}
                },
                "required": ["entry_id", "attachment_index"]
            }
        }
    },
    # --- System ---
    "get_laptop_status": {
        "func": tool_get_system_info,
        "blocking": False,
        "schema": {
            "name": "get_laptop_status",
            "description": "Get system info.",
            "inputSchema": {"type": "object", "properties": {}}
        }
    }
}

# ==========================================
# 🔌 AGENT COMMUNICATION CORE
# ==========================================

async def heartbeat(ws):
    try:
        while True:
            await asyncio.sleep(30)
            await ws.send(json.dumps({"method": "ping", "id": -1}))
    except Exception: pass

async def agent_loop(server_uri):
    print(f"🔌 Connecting to DellTech AI Server: {server_uri}")
    print(f"🛠️  Loaded {len(TOOLS_REGISTRY)} Tools: {list(TOOLS_REGISTRY.keys())}")
    
    while True:
        try:
            async with websockets.connect(server_uri) as websocket:
                print("✅ Connected! Waiting for commands...")
                heartbeat_task = asyncio.create_task(heartbeat(websocket))
                try:
                    async for message in websocket:
                        data = json.loads(message)
                        await handle_message(websocket, data)
                except websockets.ConnectionClosed:
                    print("⚠️ Connection lost.")
                finally:
                    heartbeat_task.cancel()
        except Exception as e:
            print(f"❌ Connection Error: {e}")
            await asyncio.sleep(5)

async def handle_message(ws, data):
    msg_id = data.get("id")
    method = data.get("method")
    params = data.get("params", {})
    
    if method == "ping" or data.get("result") == "pong": return
    
    logging.info(f"Command: {method}")
    response = {"jsonrpc": "2.0", "id": msg_id}
    
    if method == "tools/list":
        response["result"] = {"tools": [t["schema"] for t in TOOLS_REGISTRY.values()]}
        
    elif method == "tools/call":
        name = params.get("name")
        args = params.get("arguments", {})
        tool = TOOLS_REGISTRY.get(name)
        
        if tool:
            print(f"🤖 Executing: {name} {args}")
            try:
                # Run blocking tools in thread pool to keep WS alive
                if tool["blocking"]:
                    result = await asyncio.to_thread(tool["func"], **args)
                else:
                    result = tool["func"](**args)
                
                response["result"] = {"content": [{"type": "text", "text": json.dumps(result, default=str)}]}
            except Exception as e:
                response["error"] = {"code": -32000, "message": str(e)}
        else:
            response["error"] = {"code": -32601, "message": "Tool not found"}
            
    await ws.send(json.dumps(response))

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--server", type=str, required=True, help="WS Server URI")
    args = parser.parse_args()
    try:
        asyncio.run(agent_loop(args.server))
    except KeyboardInterrupt:
        print("\n🛑 Stopped.")
