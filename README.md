# DellTech AI Workspace

![Status](https://img.shields.io/badge/Status-Production%20Ready-success)
![Architecture](https://img.shields.io/badge/Architecture-Hybrid%20MCP-blue)
![Platform](https://img.shields.io/badge/Platform-Windows%20Enterprise-blue)

**DellTech AI Workspace** 是一个企业级 AI 助手平台，采用 **Hybrid MCP (Model Context Protocol)** 架构，旨在打通服务器端强大的计算能力与员工端（Laptop）的本地数据上下文。

---

## 🏗️ 系统架构 (System Architecture)

本系统由三个核心部分组成：

1.  **AI Hub (Backend & Web)**: 
    *   部署在 Windows Server 上。
    *   **核心引擎**: FastAPI + MCP Orchestrator。
    *   **本地能力**: 运行高负载工具，如 **Playwright (浏览器自动化)** 和 **Time (时区计算)**。
    *   **前端**: React 构建的现代化 Chat UI。

2.  **Edge Agent (Client)**:
    *   运行在员工笔记本电脑 (Windows) 上。
    *   通过 WebSocket 反向连接至 Server。
    *   **边缘能力**: 提供 **Outlook (邮件/日历)** 和 **System (系统状态)** 访问权限。

3.  **LLM Layer**:
    *   兼容 OpenAI / Azure OpenAI / DeepSeek / Local LLM (Ollama)。

---

## 📂 项目结构 (Project Structure)

```text
DellTechAI/
├── frontend/               # [React] 现代化 Web 界面
│   ├── dist/               # 构建后的静态文件 (部署用)
│   └── src/                # 源代码
├── backend/                # [Python] AI Hub & MCP 编排器
│   ├── server.py           # 主服务 (禁用 Reload 以支持 Windows 子进程)
│   ├── mcp_manager.py      # MCP 协议握手与工具路由逻辑
│   └── mcp_config.json     # 本地 MCP 服务器配置
└── client/                 # [Python] 员工端代理
    └── client_agent.py     # Outlook 集成代理 (运行在员工电脑)
```

## 🚀 快速开始 (Quick Start)

### 1. 服务器端启动 (Server Setup)

**环境要求**: Python 3.11+, Node.js 18+

```bash
# A. 后端
cd backend
pip install -r requirements.txt
playwright install  # 安装浏览器内核
python server.py
# 成功日志: [MCP] Server Initialized: Playwright

# B. 前端 (开发模式)
cd frontend
npm install
npm run dev
# 访问: http://localhost:3000
```

### 2. 客户端连接 (Client Connection)

在**员工笔记本电脑**上运行：

```bash
# 安装依赖
pip install websockets pywin32

# 启动代理 (将 localhost 替换为服务器 IP)
python client/client_agent.py --server ws://localhost:8000/ws/mcp
```

---

## ✨ 功能清单 (Capabilities)

| 类别 | 工具名称 | 运行位置 | 描述 |
| :--- | :--- | :--- | :--- |
| **办公** | `read_emails`, `send_email` | 💻 Client (Laptop) | 访问 Outlook 收件箱、发送邮件、管理日历 |
| **办公** | `search_emails` | 💻 Client (Laptop) | 使用 SQL 语法快速检索邮件 |
| **Web** | `navigate`, `screenshot` | ☁️ Server | 服务器端控制浏览器访问内网或公网页面 |
| **工具** | `get_current_time` | ☁️ Server | 精确时区时间计算 |
| **系统** | `get_laptop_status` | 💻 Client (Laptop) | 获取员工电脑健康状态 |

---

## 📦 部署 (Deployment)

请查阅 [DEPLOYMENT_GUIDE_WINDOWS.md](./DEPLOYMENT_GUIDE_WINDOWS.md) 获取详细的 Windows Server + Nginx 生产环境部署指南。