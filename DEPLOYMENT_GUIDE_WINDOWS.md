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

为了在 Nginx 上部署，您需要先将源代码编译为静态文件（HTML/JS/CSS）。

1.  **安装前端依赖**:
    在项目根目录下运行 PowerShell：
    ```powershell
    npm install
    ```

2.  **执行构建**:
    ```powershell
    npm run build
    ```
    
3.  **获取构建产物**:
    构建完成后，会在根目录下生成一个名为 **`dist`** 的文件夹。
    *   这个 `dist` 文件夹里的内容就是您需要提供给 Nginx 的“静态文件”。
    *   它包含了 `index.html` 以及编译后的 `assets/` 目录。

---

## 3. 后端部署 (Backend Setup)

假设项目源码位于 `C:\App\DellTechAI`。

1.  **安装 Python 依赖**:
    ```powershell
    cd C:\App\DellTechAI
    pip install fastapi uvicorn[standard] openai websockets pydantic requests mcp-server-time
    ```

2.  **初始化 Playwright (首次运行)**:
    ```powershell
    npx -y @playwright/mcp@latest install
    ```

3.  **注册为 Windows 服务 (推荐)**:
    使用 NSSM 将 `python backend/server.py` 注册为服务，确保开机自启（参考旧版文档或 NSSM 使用手册）。

---

## 4. Nginx 配置 (Nginx Configuration)

使用 Nginx 将前端（端口 80）和后端（端口 8000）合并。

**`C:\nginx\conf\nginx.conf` 核心配置:**

```nginx
server {
    listen       80;
    server_name  localhost;

    # === 关键：指向 npm run build 生成的 dist 目录 ===
    root   C:/App/DellTechAI/dist;
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

## 5. 验证部署

1.  启动 Python 后端 (端口 8000)。
2.  启动 Nginx (端口 80)。
3.  访问 `http://localhost` 或服务器 IP。

此时，您应该能看到界面，并且 API 调用会自动路由到后端，无需配置 IP 地址。
