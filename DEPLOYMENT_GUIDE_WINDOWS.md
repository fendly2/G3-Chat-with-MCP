# DellTech AI Workspace - Windows Server Deployment Guide

本文档旨在指导 IT 管理员在 Windows Server 2022/2025 环境下部署 **DellTech AI Workspace** 系统。

---

## 1. 服务器环境准备 (Prerequisites)

请确保服务器满足以下要求：

*   **OS**: Windows Server 2019 / 2022 / 2025
*   **Node.js**: 需安装 v18+ (用于构建前端)。
*   **Python**: 需安装 3.11+ (用于后端 API)。

---

## 2. 前端构建 (Frontend Build) - **生成静态文件**

为了在 Nginx 上部署，您需要先进入 `frontend` 目录并将源代码编译为静态文件。

1.  **进入前端目录**:
    ```powershell
    cd frontend
    ```

2.  **安装依赖**:
    ```powershell
    npm install
    ```

3.  **执行构建**:
    ```powershell
    npm run build
    ```
    
4.  **获取构建产物**:
    构建完成后，`frontend/dist` 文件夹里的内容就是您需要提供给 Nginx 的“静态文件”。

---

## 3. 后端部署 (Backend Setup)

假设项目源码位于 `C:\App\DellTechAI`。

1.  **进入后端目录**:
    ```powershell
    cd ..\backend
    ```

2.  **安装 Python 依赖**:
    ```powershell
    pip install -r requirements.txt
    ```

3.  **初始化 Playwright (首次运行)**:
    ```powershell
    playwright install
    npx -y @playwright/mcp@latest install
    ```

4.  **注册为 Windows 服务 (推荐)**:
    使用 NSSM 将 `python backend/server.py` 注册为服务。
    *   **Startup Directory**: `C:\App\DellTechAI` (注意：建议设为根目录，以便 server.py 能正确找到同级模块)
    *   **Arguments**: `backend/server.py`

---

## 4. Nginx 配置 (Nginx Configuration)

使用 Nginx 将前端（端口 80）和后端（端口 8000）合并。

**`C:\nginx\conf\nginx.conf` 核心配置:**

```nginx
server {
    listen       80;
    server_name  localhost;

    # === 关键：指向 frontend/dist 目录 ===
    root   C:/App/DellTechAI/frontend/dist;
    index  index.html;

    # 1. 前端静态文件支持 (SPA 模式)
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 2. API 反向代理 (指向 Python 后端)
    location /v1/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
    }

    # 3. MCP 接口代理
    location /mcp/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
    }

    # 4. WebSocket 代理
    location /ws/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
    }
}
```

---

## 5. 客户端 (Client)

分发 `client/client_agent.py` 给员工。
