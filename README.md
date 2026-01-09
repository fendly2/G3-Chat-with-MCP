# DellTech AI Workspace

![Status](https://img.shields.io/badge/Status-Active-success)
![Stack](https://img.shields.io/badge/Stack-React_|_FastAPI_|_MCP-blue)
![Platform](https://img.shields.io/badge/Platform-Windows_Server-win)

**DellTech AI Workspace** 是一个企业级 AI 助手平台，旨在通过 **Model Context Protocol (MCP)** 将大语言模型 (LLM) 与企业内部工具、本地数据和远程设备深度集成。

与传统 Chatbot 不同，本项目不仅支持服务端工具（如浏览器自动化、时间查询），还支持通过 WebSocket 连接的 **Remote Client Agents**，允许 AI 直接安全地操作员工笔记本电脑上的应用程序（如 Microsoft Outlook）。

---

## 🚀 核心功能 (Key Features)

*   **⚡️ 智能工具编排 (MCP Orchestration)**
    *   基于 Model Context Protocol 标准构建。
    *   支持动态加载、启用/禁用 AI 工具，无需重启服务。
*   **🔌 混合架构 (Hybrid Architecture)**
    *   **Local Server Tools**: 直接在服务器运行的工具（例如：`mcp-server-time` 用于时区转换，`playwright` 用于网页抓取）。
    *   **Remote Client Agents**: 通过 WebSocket 反向连接的客户端代理。
*   **📧 Outlook 深度集成**
    *   AI 可以读取邮件、搜索历史、撰写草稿、发送邮件以及管理日历。
    *   所有操作均在用户本地客户端执行，确保数据隐私与权限合规。
*   **🖥️ 企业级前端**
    *   基于 React + Tailwind CSS 的现代化界面。
    *   支持流式响应 (Streaming)、工具执行状态可视化、多会话管理。
*   **🛡️ Windows Server 优化**
    *   专为 Windows Server 2022/2025 环境优化。
    *   解决了 Windows 异步子进程 (Asyncio Subprocess) 兼容性问题。

---

## 🏗️ 系统架构 (Architecture)

```mermaid
graph TD
    User[User (Browser)] <-->|HTTP/Stream| Frontend[React App]
    Frontend <-->|REST API| Backend[FastAPI Server]
    
    subgraph "Backend Server (Windows)"
        Backend <-->|MCP Protocol| MCP_Manager[MCP Orchestrator]
        MCP_Manager <-->|StdIO| Local_Tool1[Time Server]
        MCP_Manager <-->|StdIO| Local_Tool2[Playwright]
    end
    
    subgraph "Employee Laptop (Client)"
        Remote_Agent[Python Client Agent] <-->|COM/MAPI| Outlook[Microsoft Outlook]
    end
    
    MCP_Manager <-->|WebSocket| Remote_Agent
    Backend <-->|API| LLM[OpenAI / Enterprise LLM]
```

---

## 🛠️ 快速开始 (Quick Start)

### 1. 后端设置 (Backend)

项目依赖 Python 3.11+ 和 Node.js (用于 Playwright)。

```powershell
# 1. 进入后端目录
cd backend

# 2. 安装 Python 依赖
pip install fastapi uvicorn[standard] openai websockets pydantic requests mcp-server-time

# 3. 安装 Playwright 依赖 (首次运行需要)
pip install playwright
playwright install

# 4. 启动服务器
# 注意：务必在项目根目录运行，以便正确加载模块
cd ..
python backend/server.py
```

### 2. 前端运行 (Frontend)

本项目采用轻量级 No-Build 架构（ES Modules），无需复杂的 Webpack 配置。

```powershell
# 使用 serve 或任意静态服务器工具
npx serve -s . -p 3000
```

访问 `http://localhost:3000` 即可使用。

---

## 💻 客户端接入 (Client Agent)

为了让 AI 能够操作您的 Outlook，请在您的笔记本电脑上运行客户端代理：

1.  确保安装 Python 和 `pywin32`：
    ```bash
    pip install websockets pywin32
    ```
2.  运行 Agent 并指向服务器 IP：
    ```bash
    python client_agent.py --server ws://<YOUR_SERVER_IP>:8000/ws/mcp
    ```

连接成功后，AI 即可自动发现并使用 Outlook 相关工具（阅读邮件、发送邮件、日程管理等）。

---

## 📂 项目结构

```text
DellTechAI/
├── index.html              # 前端入口
├── index.tsx               # 前端核心逻辑 (React)
├── client_agent.py         # 运行在员工电脑上的 Outlook 代理
├── DEPLOYMENT_GUIDE_WINDOWS.md # 详细部署文档
├── backend/
│   ├── server.py           # FastAPI 主服务 (含 Windows 异步修复)
│   ├── mcp_manager.py      # MCP 协议管理器 (核心)
│   └── mcp_config.json     # 本地工具配置文件
└── ...
```

---

## 📖 部署文档

详细的 Windows Server 生产环境部署指南（包含防火墙设置、服务自启动配置 NSSM 等），请参阅：

👉 [**DEPLOYMENT_GUIDE_WINDOWS.md**](./DEPLOYMENT_GUIDE_WINDOWS.md)

---

## 🔒 安全说明

*   **API Key**: 请在 Web 设置界面输入您的 LLM API Key，它仅存储在本地浏览器缓存中。
*   **内网部署**: 建议将此服务部署在企业内网 (Intranet)，并通过 VPN 访问。
*   **Outlook 权限**: 客户端代理使用当前登录用户的权限运行，遵循 Outlook 的安全模型。

---

*Powered by Dell Technologies - AI Solution Architecture Team*
