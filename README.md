# DellTech AI Workspace

![Status](https://img.shields.io/badge/Status-Active-success)
![Structure](https://img.shields.io/badge/Structure-Monorepo-orange)

**DellTech AI Workspace** 是一个企业级 AI 助手平台，通过 **Model Context Protocol (MCP)** 集成企业工具与 Outlook。

---

## 📂 项目结构 (Project Structure)

```text
DellTechAI/
├── frontend/               # React Web Application
│   ├── src/                # 源代码
│   └── dist/               # 构建产物 (Nginx Root)
├── backend/                # FastAPI Server
│   ├── server.py           # 主服务
│   └── mcp_manager.py      # MCP 核心逻辑
└── client/                 # Client Tools
    └── client_agent.py     # 员工电脑运行的 Outlook 代理
```

## 🚀 开发指南 (Development)

1.  **启动后端**:
    ```bash
    pip install -r backend/requirements.txt
    python backend/server.py
    ```
2.  **启动前端**:
    ```bash
    cd frontend
    npm install
    npm run dev
    ```
    访问 `http://localhost:3000`

## 📦 生产部署 (Production)

请参阅 [DEPLOYMENT_GUIDE_WINDOWS.md](./DEPLOYMENT_GUIDE_WINDOWS.md) 了解 Nginx + Windows Server 部署方案。
