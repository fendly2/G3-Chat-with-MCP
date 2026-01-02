import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { 
  MessageSquare, 
  Settings, 
  Plus, 
  Bot, 
  User, 
  ChevronDown, 
  ChevronRight, 
  Loader2, 
  TerminalSquare, 
  Check,
  Menu,
  X,
  Zap,
  Send,
  LayoutDashboard,
  Mail,
  Sparkles,
  Cpu,
  Info,
  Trash2,
  Play,
  Square, // Used for Stop
  Power,
  Server,
  Wrench, // Icon for tools
  Activity,
  ShieldCheck
} from "lucide-react";

// --- Constants & Config ---
const BACKEND_URL = "http://localhost:8000";

// --- Types ---
interface Message {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  timestamp: number;
  toolCall?: {
    name: string;
    description?: string;
    status: "running" | "complete" | "error";
    result?: string;
  }; 
}

interface AppSettings {
  apiKey: string;
  llmBaseUrl: string; 
  model: string;
}

interface MCPServer {
  id: string;
  name: string;
  status: "running" | "stopped";
  tools: any[];
}

const DEFAULT_SETTINGS: AppSettings = {
  apiKey: "", 
  llmBaseUrl: "https://api.openai.com/v1",
  model: "gpt-4o",
};

// --- API Layer ---
async function streamChat(
  messages: Message[], 
  settings: AppSettings, 
  onUpdate: (chunk: string, eventType: "text" | "tool_start" | "tool_end" | "error", metadata?: any) => void
) {
  const apiMessages = messages.map(m => ({ role: m.role, content: m.content || "" }));

  try {
    const res = await fetch(`${BACKEND_URL}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${settings.apiKey || "dummy"}`, // Allow empty key for local LLMs
        "X-LLM-Base-URL": settings.llmBaseUrl
      },
      body: JSON.stringify({
        model: settings.model,
        messages: apiMessages,
        stream: true
      })
    });

    if (!res.ok) throw new Error((await res.json()).detail || "Connection Failed");
    if (!res.body) throw new Error("No Readable Stream");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n").filter(l => l.trim() !== "");

      for (const line of lines) {
        if (line === "data: [DONE]") return;
        if (line.startsWith("data: ")) {
          try {
            const json = JSON.parse(line.slice(6));
            
            if (json.type === "tool_start") {
              onUpdate("", "tool_start", json.tool);
            } else if (json.type === "tool_end") {
              onUpdate(json.result, "tool_end");
            } else if (json.error) {
              onUpdate(json.error, "error");
            } else {
              const content = json.choices?.[0]?.delta?.content;
              if (content) onUpdate(content, "text");
            }
          } catch (e) {
            console.warn("Stream Parse Error", e);
          }
        }
      }
    }
  } catch (err: any) {
    onUpdate(err.message, "error");
  }
}

// --- Components ---

const ToolCard = ({ toolCall }: { toolCall: NonNullable<Message['toolCall']> }) => {
  const [expanded, setExpanded] = useState(false);
  const isRunning = toolCall.status === 'running';
  const isError = toolCall.status === 'error';

  const statusColor = isRunning 
    ? 'border-blue-200 bg-blue-50/50 text-blue-700' 
    : isError 
      ? 'border-red-200 bg-red-50/50 text-red-700' 
      : 'border-emerald-200 bg-emerald-50/50 text-emerald-700';

  const iconColor = isRunning 
    ? 'bg-blue-100 text-blue-600' 
    : isError 
      ? 'bg-red-100 text-red-600' 
      : 'bg-emerald-100 text-emerald-600';

  return (
    <div className={`my-4 rounded-2xl border backdrop-blur-md transition-all duration-500 overflow-hidden font-sans max-w-2xl ${statusColor} ${expanded ? 'shadow-xl' : 'shadow-sm'}`}>
      <button 
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-4 text-sm transition-colors hover:bg-white/40"
      >
        <div className="flex items-center space-x-4 flex-1 min-w-0">
          <div className={`w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center shadow-sm transition-transform duration-300 ${iconColor} ${isRunning ? 'animate-pulse scale-110' : ''}`}>
            {isRunning ? <Loader2 size={20} className="animate-spin" /> : <TerminalSquare size={20} />}
          </div>
          <div className="flex flex-col items-start text-left min-w-0 flex-1">
             <div className="flex items-center gap-2 w-full">
               <span className="font-bold tracking-tight text-base text-gray-900 truncate">{toolCall.name}</span>
               {toolCall.description && (
                  <span className="hidden sm:inline-block text-xs text-gray-500/80 font-medium truncate border-l border-gray-300 pl-2">
                    {toolCall.description}
                  </span>
               )}
             </div>
             <div className="flex items-center gap-2 mt-1">
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${isRunning ? 'bg-blue-200/50' : isError ? 'bg-red-200/50' : 'bg-emerald-200/50'}`}>
                  {isRunning ? "Running" : isError ? "Error" : "Complete"}
                </span>
                {toolCall.description && (
                  <span className="sm:hidden text-[10px] text-gray-500 font-medium truncate max-w-[150px]">
                    {toolCall.description}
                  </span>
               )}
             </div>
          </div>
        </div>
        <div className={`p-1.5 rounded-full flex-shrink-0 transition-all duration-300 ml-3 ${expanded ? 'rotate-180 bg-black/10' : 'bg-black/5 hover:bg-black/10'}`}>
           <ChevronDown size={18} className="opacity-60" />
        </div>
      </button>
      
      {(expanded || isRunning) && (
        <div className="border-t border-black/5 bg-white/80 backdrop-blur-xl p-5 animate-fade-in">
          <div className="flex items-center gap-2 mb-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
            <Info size={12} /> System Output
          </div>
          <div className="text-xs font-mono text-gray-700 whitespace-pre-wrap max-h-96 overflow-y-auto custom-scrollbar leading-relaxed bg-black/5 p-4 rounded-xl border border-black/5">
             {isRunning ? "Awaiting stream from enterprise middleware..." : toolCall.result || "Execution successful. No log output provided."}
          </div>
        </div>
      )}
    </div>
  );
};

const SettingsModal = ({ open, onClose, settings, setSettings }: any) => {
  const [activeTab, setActiveTab] = useState<'general' | 'integrations'>('general');
  const [mcpServers, setMcpServers] = useState<MCPServer[]>([]);
  const [newServer, setNewServer] = useState({ name: '', command: '', args: '' });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && activeTab === 'integrations') {
      fetchMCPServers();
    }
  }, [open, activeTab]);

  const fetchMCPServers = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/mcp/servers`);
      if (res.ok) setMcpServers(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const addServer = async () => {
    if (!newServer.name || !newServer.command) return;
    setLoading(true);
    try {
      await fetch(`${BACKEND_URL}/mcp/servers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newServer.name,
          command: newServer.command,
          args: newServer.args.split(" ").filter(Boolean),
          env: {}
        })
      });
      setNewServer({ name: '', command: '', args: '' });
      fetchMCPServers();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const toggleServer = async (name: string, currentStatus: string) => {
    const isRunning = currentStatus === 'running';
    try {
      await fetch(`${BACKEND_URL}/mcp/servers/${name}`, { 
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: !isRunning })
      });
      fetchMCPServers();
    } catch (e) { console.error(e); }
  };

  const removeServer = async (name: string) => {
    try {
      await fetch(`${BACKEND_URL}/mcp/servers/${name}`, { method: "DELETE" });
      fetchMCPServers();
    } catch (e) { console.error(e); }
  };

  if (!open) return null;
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/80 backdrop-blur-md animate-fade-in p-4">
      <div className="bg-white/95 backdrop-blur-2xl w-full max-w-lg rounded-[2rem] shadow-2xl flex flex-col overflow-hidden border border-white/20 transform transition-all ring-1 ring-black/10 max-h-[90vh]">
        
        {/* Header */}
        <div className="px-8 py-6 border-b border-gray-100 flex justify-between items-center bg-gradient-to-r from-gray-50/50 to-white">
          <h2 className="text-lg font-black text-gray-900 flex items-center gap-3 tracking-tighter">
            <div className="p-2 bg-black text-white rounded-xl"><Settings size={20} /></div>
            SETTINGS
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-900 hover:bg-gray-100 p-2 rounded-full transition-all"><X size={24} /></button>
        </div>

        {/* Tabs */}
        <div className="px-8 pt-6 pb-2">
            <div className="flex p-1 bg-gray-100 rounded-xl">
                <button 
                    onClick={() => setActiveTab('general')}
                    className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${activeTab === 'general' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    General
                </button>
                <button 
                    onClick={() => setActiveTab('integrations')}
                    className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${activeTab === 'integrations' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    Integrations
                </button>
            </div>
        </div>

        {/* Content */}
        <div className="p-8 space-y-8 overflow-y-auto custom-scrollbar">
          
          {activeTab === 'general' ? (
              <>
                {/* System Status Indicator - Replaces the Toggle */}
                <div className="p-5 rounded-2xl bg-blue-50/50 border border-blue-100 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
                            <ShieldCheck size={20} />
                        </div>
                        <div>
                            <div className="text-sm font-bold text-gray-900">Agentic Capabilities</div>
                            <div className="text-[10px] text-gray-500 font-medium mt-0.5">Tools & Skills System Active</div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-full border border-blue-100 shadow-sm">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-[10px] font-bold text-gray-600 uppercase tracking-wider">Enabled</span>
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-1">AI Engine Identity</label>
                    <input className="w-full px-5 py-4 bg-gray-100/50 border border-transparent focus:bg-white rounded-2xl focus:ring-4 focus:ring-blue-500/5 focus:border-blue-400 outline-none text-base transition-all font-bold text-gray-800 placeholder-gray-300"
                    value={settings.model} onChange={e => setSettings({...settings, model: e.target.value})} placeholder="gpt-4o, deepseek-r1, llama3..." />
                </div>
                
                <div className="space-y-2">
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-1">Network Gateway (Base URL)</label>
                    <input className="w-full px-5 py-4 bg-gray-100/50 border border-transparent focus:bg-white rounded-2xl focus:ring-4 focus:ring-blue-500/5 focus:border-blue-400 outline-none text-base font-mono text-gray-500 transition-all"
                    value={settings.llmBaseUrl} onChange={e => setSettings({...settings, llmBaseUrl: e.target.value})} placeholder="https://api.openai.com/v1" />
                    <p className="px-1 text-[10px] text-gray-400 font-medium">Compatible with OpenAI, DeepSeek, Ollama, vLLM, etc.</p>
                </div>

                <div className="space-y-2">
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-1">Master Key (Auth)</label>
                    <input type="password" className="w-full px-5 py-4 bg-gray-100/50 border border-transparent focus:bg-white rounded-2xl focus:ring-4 focus:ring-blue-500/5 focus:border-blue-400 outline-none text-base font-mono transition-all text-gray-800"
                    value={settings.apiKey} onChange={e => setSettings({...settings, apiKey: e.target.value})} placeholder="Optional for local models" />
                </div>
              </>
          ) : (
              <div className="space-y-6">
                 
                 {/* List */}
                 <div className="space-y-3">
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-1">Active Integrations</label>
                    {mcpServers.length === 0 && (
                        <div className="p-8 rounded-2xl bg-gray-50 border border-dashed border-gray-200 text-center flex flex-col items-center justify-center gap-3">
                            <Activity size={24} className="text-gray-300" />
                            <span className="text-xs text-gray-400 font-medium">No active integrations found.</span>
                        </div>
                    )}
                    {mcpServers.map(s => (
                        <div key={s.id} className={`flex items-center justify-between p-4 bg-white border rounded-2xl shadow-sm hover:shadow-md transition-all ${s.status === 'running' ? 'border-emerald-100/50' : 'border-gray-100'}`}>
                            <div className="flex items-center gap-4">
                                <div className={`w-3 h-3 rounded-full transition-all duration-500 ${s.status === 'running' ? 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.5)]' : 'bg-gray-200'}`} />
                                <div>
                                    <div className="font-bold text-gray-800 text-sm flex items-center gap-2">
                                        {s.name}
                                        {s.status === 'running' && <span className="text-[10px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Active</span>}
                                    </div>
                                    <div className="text-[10px] text-gray-400 font-mono mt-0.5">
                                        {s.status === 'running' ? `${s.tools.length} functions loaded` : 'Service paused'}
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button 
                                    onClick={() => toggleServer(s.name, s.status)}
                                    className={`p-2.5 rounded-xl transition-all ${s.status === 'running' ? 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100' : 'text-gray-400 bg-gray-50 hover:bg-gray-100 hover:text-gray-600'}`}
                                    title={s.status === 'running' ? "Pause Service" : "Start Service"}
                                >
                                    {s.status === 'running' ? <Square size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
                                </button>
                                <button onClick={() => removeServer(s.name)} className="p-2.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all" title="Uninstall Service">
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>
                    ))}
                 </div>

                 {/* Add New */}
                 <div className="pt-6 border-t border-gray-100 space-y-4">
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-1">Install Custom Tool</label>
                    <div className="grid grid-cols-2 gap-3">
                        <input className="px-4 py-3 bg-gray-100/50 rounded-xl text-sm font-medium outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/10" 
                            placeholder="Name (e.g. Weather)" value={newServer.name} onChange={e => setNewServer({...newServer, name: e.target.value})} />
                        <input className="px-4 py-3 bg-gray-100/50 rounded-xl text-sm font-medium outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/10" 
                            placeholder="Command (e.g. python)" value={newServer.command} onChange={e => setNewServer({...newServer, command: e.target.value})} />
                    </div>
                    <input className="w-full px-4 py-3 bg-gray-100/50 rounded-xl text-sm font-medium outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/10" 
                            placeholder="Arguments (e.g. script.py)" value={newServer.args} onChange={e => setNewServer({...newServer, args: e.target.value})} />
                    
                    <button 
                        onClick={addServer}
                        disabled={loading || !newServer.name || !newServer.command}
                        className="w-full py-4 bg-black text-white rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex justify-center items-center gap-2"
                    >
                        {loading && <Loader2 size={14} className="animate-spin" />} Install & Activate
                    </button>
                 </div>
              </div>
          )}

        </div>

        {/* Footer */}
        {activeTab === 'general' && (
            <div className="p-8 bg-gray-50/50 border-t border-gray-100">
            <button className="w-full py-5 bg-black hover:bg-blue-600 text-white rounded-2xl font-black text-sm transition-all shadow-xl hover:shadow-blue-500/20 active:scale-[0.98] uppercase tracking-widest" 
                onClick={() => {
                localStorage.setItem('dell_ai_settings', JSON.stringify(settings));
                onClose();
            }}>Synchronize Changes</button>
            </div>
        )}
      </div>
    </div>
  );
};

// --- Main App ---

const App = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Initialization
  useEffect(() => {
    const stored = localStorage.getItem('dell_ai_settings');
    if (stored) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(stored) });
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  const sendMessage = async () => {
    if (!input.trim() || streaming) return;
    
    const userMsg: Message = { id: Date.now().toString(), role: "user", content: input, timestamp: Date.now() };
    const newHistory = [...messages, userMsg];
    
    setMessages(newHistory);
    setInput("");
    setStreaming(true);

    const assistantId = "ai-" + Date.now();
    let currentContent = "";

    await streamChat(newHistory, settings, (chunk, type, meta) => {
      setMessages(prev => {
        const list = [...prev];
        let aiMsg = list.find(m => m.id === assistantId);
        
        if (!aiMsg) {
          aiMsg = { id: assistantId, role: "assistant", content: "", timestamp: Date.now() };
          list.push(aiMsg);
        }

        if (type === "text") {
          currentContent += chunk;
          aiMsg.content = currentContent;
        } else if (type === "tool_start") {
          const toolDescriptions: Record<string, string> = {
            "read_outlook_emails": "Retrieving latest communications from your Outlook secure inbox.",
            "read_recent_emails": "Scanning MAPI folders for recent exchange items.",
            "draft_email": "Composing a new message draft based on current workspace context.",
            "get_calendar": "Accessing scheduling data to synchronize your agenda.",
          };
          aiMsg.toolCall = { 
            name: meta, 
            description: toolDescriptions[meta] || "Initiating an integrated enterprise utility function.",
            status: "running" 
          };
        } else if (type === "tool_end") {
           if (aiMsg.toolCall) aiMsg.toolCall.status = "complete";
        } else if (type === "error") {
           aiMsg.content += `\n\n**Error**: ${chunk}`;
        }
        return list;
      });
    });

    setStreaming(false);
  };

  return (
    <div className="flex h-screen bg-[#FBFBFD] font-sans text-gray-900 selection:bg-blue-100 selection:text-blue-900 overflow-hidden">
      
      {/* Sidebar - The "Jobs" Pro Aesthetic */}
      <aside className="w-[300px] bg-[#1C1C1E] text-white flex flex-col flex-shrink-0 hidden md:flex shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-[300px] bg-gradient-to-b from-blue-600/20 to-transparent pointer-events-none" />
        
        <div className="p-6 relative z-10">
          <div className="mb-8 flex items-center gap-3 font-bold tracking-tight text-lg">
             <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/30 ring-1 ring-white/10">
               <Cpu size={20} className="text-white" />
             </div>
             <span className="bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">DellTech AI</span>
          </div>

          <button 
            onClick={() => setMessages([])}
            className="w-full flex items-center justify-between px-5 py-4 bg-white/10 hover:bg-white/20 text-white rounded-2xl transition-all group border border-white/5 hover:border-white/20 shadow-lg hover:shadow-xl backdrop-blur-md active:scale-[0.98]"
          >
            <div className="flex items-center text-sm font-semibold"><Plus size={18} className="mr-3 text-blue-400"/> New Workspace</div>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-2 relative z-10 custom-scrollbar">
          <div className="px-4 pb-4 text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">Recent Sessions</div>
          {messages.length > 0 ? (
            <button className="w-full text-left px-5 py-4 text-sm text-gray-300 hover:bg-white/10 hover:text-white rounded-2xl truncate transition-all flex items-center group border border-transparent hover:border-white/5">
              <MessageSquare size={16} className="mr-3 text-gray-600 group-hover:text-blue-400 transition-colors" />
              <span className="truncate font-medium">{messages[0].content}</span>
            </button>
          ) : (
             <div className="px-5 py-10 text-center border-2 border-dashed border-white/5 rounded-2xl m-2">
                <span className="text-gray-600 text-xs font-medium">No history available</span>
             </div>
          )}
        </div>

        <div className="p-6 border-t border-white/5 relative z-10 bg-black/20 backdrop-blur-xl">
           <button onClick={() => setShowSettings(true)} className="flex items-center w-full px-5 py-4 text-sm text-gray-400 hover:text-white hover:bg-white/10 rounded-2xl transition-colors font-medium">
             <Settings size={18} className="mr-3" /> System Preferences
           </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative min-w-0 bg-white/50 backdrop-blur-3xl">
        {/* Background Mesh Gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-50/40 via-white to-blue-50/40 pointer-events-none" />
        
        {/* Header - Minimal */}
        <header className="h-16 flex items-center justify-between px-6 border-b border-gray-100 md:hidden bg-white/80 backdrop-blur-xl sticky top-0 z-10">
          <span className="font-bold text-gray-900 flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-blue-600"></div> DellTech AI
          </span>
          <button onClick={() => setShowSettings(true)}><Settings size={20} className="text-gray-500" /></button>
        </header>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto scroll-smooth relative z-10">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center animate-fade-in">
              <div className="w-24 h-24 bg-gradient-to-tr from-blue-50 to-indigo-50 rounded-[2rem] flex items-center justify-center mb-10 shadow-2xl shadow-blue-100/50 ring-1 ring-black/5">
                <Sparkles className="text-blue-600" size={48} />
              </div>
              <h2 className="text-4xl font-black text-gray-900 mb-4 tracking-tight">DellTech Intelligence</h2>
              <p className="text-gray-500 max-w-lg mb-12 text-lg leading-relaxed font-medium">Secure, integrated enterprise AI workspace connected to your daily tools.</p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-3xl w-full">
                <button onClick={() => setInput("Check my latest emails from the team")} className="p-6 rounded-[1.5rem] border border-gray-100 bg-white hover:border-blue-200 hover:shadow-xl hover:shadow-blue-500/10 text-left transition-all group relative overflow-hidden active:scale-[0.99]">
                  <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity transform group-hover:scale-110 duration-500"><Mail size={64} /></div>
                  <div className="font-bold text-gray-900 text-base mb-1 group-hover:text-blue-600 transition-colors">Check Outlook</div>
                  <div className="text-sm text-gray-500 font-medium">"Read latest 5 emails..."</div>
                </button>
                <button onClick={() => setInput("Draft a summary of pending tasks")} className="p-6 rounded-[1.5rem] border border-gray-100 bg-white hover:border-purple-200 hover:shadow-xl hover:shadow-purple-500/10 text-left transition-all group relative overflow-hidden active:scale-[0.99]">
                  <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity transform group-hover:scale-110 duration-500"><LayoutDashboard size={64} /></div>
                  <div className="font-bold text-gray-900 text-base mb-1 group-hover:text-purple-600 transition-colors">Draft Report</div>
                  <div className="text-sm text-gray-500 font-medium">"Create a task summary..."</div>
                </button>
              </div>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto py-12 px-4 md:px-8">
              {messages.map((m, i) => (
                <div key={i} className={`mb-10 animate-fade-in group flex gap-6 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  
                  {/* Avatar */}
                  <div className="flex-shrink-0 mt-1">
                    {m.role === 'user' ? (
                      <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-gray-800 to-black flex items-center justify-center shadow-lg shadow-gray-300 ring-2 ring-white">
                         <User size={20} className="text-white" />
                      </div>
                    ) : (
                      <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-200 ring-2 ring-white">
                         <Bot size={20} className="text-white" />
                      </div>
                    )}
                  </div>
                  
                  {/* Content Bubble */}
                  <div className={`flex-1 min-w-0 flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                     <div className={`text-[10px] font-black mb-2 opacity-40 uppercase tracking-[0.1em] ${m.role === 'user' ? 'mr-1' : 'ml-1'}`}>
                       {m.role === 'user' ? 'You' : 'DellTech AI'}
                     </div>

                     {m.toolCall && (
                       <div className="w-full mb-3">
                         <ToolCard toolCall={m.toolCall} />
                       </div>
                     )}

                     {m.content && (
                       <div className={`prose prose-slate prose-base max-w-none leading-relaxed whitespace-pre-wrap px-7 py-5 rounded-[2rem] shadow-sm ${
                         m.role === 'user' 
                           ? 'bg-white text-gray-900 rounded-tr-none border border-gray-200/50 shadow-gray-200/50' 
                           : 'bg-white/80 backdrop-blur-md text-gray-900 rounded-tl-none border border-white/50 shadow-gray-100/50'
                       }`}>
                         {m.content}
                       </div>
                     )}
                  </div>
                </div>
              ))}
              <div ref={scrollRef} className="h-12" />
            </div>
          )}
        </div>

        {/* Input Area - Centered & Floating Glass */}
        <div className="p-4 md:pb-10 md:pt-4 bg-transparent relative z-20 pointer-events-none">
          <div className="max-w-3xl mx-auto relative pointer-events-auto">
             <div className={`relative flex flex-col bg-white/80 backdrop-blur-2xl border transition-all duration-300 rounded-[2rem] overflow-hidden ${streaming ? 'border-blue-100 shadow-none' : 'border-white/50 shadow-2xl shadow-blue-900/10 hover:bg-white hover:shadow-blue-900/15 focus-within:ring-4 focus-within:ring-blue-500/10 focus-within:border-blue-300'}`}>
                <textarea
                  className="w-full max-h-52 min-h-[64px] py-5 pl-7 pr-16 bg-transparent outline-none text-gray-900 placeholder-gray-400 resize-none text-lg font-medium"
                  placeholder="Ask DellTech AI..."
                  rows={1}
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    e.target.style.height = 'auto';
                    e.target.style.height = e.target.scrollHeight + 'px';
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                  disabled={streaming}
                />
                
                <div className="absolute bottom-3 right-3">
                    <button 
                    onClick={sendMessage}
                    disabled={!input.trim() || streaming}
                    className={`p-3 rounded-2xl transition-all duration-300 flex items-center justify-center ${
                        input.trim() && !streaming 
                        ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/30 transform hover:scale-105 hover:-translate-y-0.5' 
                        : 'bg-gray-100 text-gray-300 cursor-not-allowed'
                    }`}
                    >
                    {streaming ? <Loader2 size={22} className="animate-spin" /> : <Send size={22} className={input.trim() ? "ml-0.5" : ""} />}
                    </button>
                </div>
             </div>
             <div className="text-center mt-4">
               <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] opacity-60">Authorized Use Only • Dell Technologies</p>
             </div>
          </div>
        </div>

      </SettingsModal>
    </div>
  );
};

const root = createRoot(document.getElementById("root")!);
root.render(<App />);