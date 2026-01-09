# DellTech AI Workspace - Windows Server Deployment Guide

**版本**: 2.0 (Windows Asyncio Fixed)  
**适用对象**: IT 管理员 / 系统集成商  

本文档详细说明如何在 **Windows Server 2019/2022/2025** 环境下部署全套 DellTech AI Workspace 系统。

---

## 🛠️ 1. 环境准备 (Prerequisites)

请在服务器上安装以下基础软件：

1.  **Python 3.11+**: [下载链接](https://www.python.org/downloads/windows/)
    *   *注意*: 安装时勾选 "Add Python to PATH"。
2.  **Node.js (LTS)**: [下载链接](https://nodejs.org/)
    *   用于构建前端和运行 Playwright MCP 服务。
3.  **Nginx for Windows**: [下载链接](http://nginx.org/en/download.html)
    *   用于反向代理和静态文件托管。
4.  **Git** (可选): 用于拉取代码。

---

## 📦 2. 部署后端 (Backend Service)

假设项目根目录为 `C:\App\DellTechAI`。

### 2.1 安装依赖与初始化

以管理员身份打开 PowerShell：

```powershell
cd C:\App\DellTechAI\backend

# 1. 创建虚拟环境 (推荐)
python -m venv venv
.\venv\Scripts\Activate.ps1

# 2. 安装 Python 依赖
pip install -r requirements.txt

# 3. 初始化 Playwright (必须执行)
# 这会下载 Chromium 浏览器内核
playwright install
python -m playwright install chromium

# 4. 初始化 MCP Node 依赖
# 确保 npx 命令可用
npx -y @playwright/mcp@latest install
```

### 2.2 验证运行 (关键步骤)

在配置为服务前，**必须**手动运行一次以验证 MCP 握手是否成功：

```powershell
python server.py
```

**观察控制台输出**：
*   ✅ `[MCP] Handshaking with mcp-playwright...`
*   ✅ `[MCP] Server Initialized: Playwright`
*   ✅ `[MCP] mcp-playwright registered 22 tools.`
*   ✅ `Uvicorn running on http://0.0.0.0:8000`

如果看到以上信息，按 `Ctrl+C` 停止。

### 2.3 注册为 Windows 服务 (NSSM)

推荐使用 **NSSM** (Non-Sucking Service Manager) 将其变为后台服务，确保开机自启。

1.  下载 NSSM 并解压到 `C:\nssm\`.
2.  执行命令：
    ```powershell
    C:\nssm\win64\nssm.exe install DellAIBackend
    ```
3.  **Application 选项卡**:
    *   **Path**: `C:\App\DellTechAI\backend\venv\Scripts\python.exe`
    *   **Startup directory**: `C:\App\DellTechAI\backend`
    *   **Arguments**: `server.py`
4.  点击 "Install service"。
5.  启动服务：`Start-Service DellAIBackend`

---

## 🎨 3. 部署前端 (Frontend Static)

### 3.1 编译构建

```powershell
cd C:\App\DellTechAI\frontend

# 安装依赖
npm install

# 编译 (生成 dist 目录)
npm run build
```

构建完成后，确保 `C:\App\DellTechAI\frontend\dist` 目录存在且包含 `index.html`。

---

## 🌐 4. 配置反向代理 (Nginx)

Nginx 将统一管理 HTTP (80) 流量，并转发 API 和 WebSocket 请求。

编辑 `C:\nginx\conf\nginx.conf`:

```nginx
worker_processes  1;

events {
    worker_connections  1024;
}

http {
    include       mime.types;
    default_type  application/octet-stream;
    sendfile        on;
    keepalive_timeout  65;

    # 允许上传大文件（如果需要）
    client_max_body_size 50M;

    server {
        listen       80;
        server_name  localhost; # 或服务器的 DNS/IP

        # === 1. 前端静态文件 ===
        root   "C:/App/DellTechAI/frontend/dist"; # 注意使用正斜杠 /
        index  index.html;

        location / {
            try_files $uri $uri/ /index.html;
        }

        # === 2. API 代理 ===
        location /v1/ {
            proxy_pass http://127.0.0.1:8000;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }

        # === 3. MCP 状态接口 ===
        location /mcp/ {
            proxy_pass http://127.0.0.1:8000;
        }

        # === 4. WebSocket (关键) ===
        # 员工电脑 Agent 连接此路径
        location /ws/ {
            proxy_pass http://127.0.0.1:8000;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "Upgrade";
            proxy_read_timeout 86400; # 防止长连接断开
        }
    }
}
```

启动 Nginx:
```powershell
cd C:\nginx
.\nginx.exe
```

---

## 💻 5. 员工端分发 (Client Agent)

IT 部门需将 `client` 文件夹分发给需要使用 Outlook 功能的员工。

### 5.1 员工电脑配置
1.  安装 Python 3.10+。
2.  安装依赖：`pip install websockets pywin32`。
3.  **启动脚本**:
    创建一个 `Connect-DellAI.bat` 文件方便员工点击：
    ```batch
    @echo off
    echo Connecting to DellTech AI Workspace...
    python C:\Path\To\client_agent.py --server ws://<SERVER_IP_OR_DOMAIN>/ws/mcp
    pause
    ```

---

## ❓ 故障排查 (Troubleshooting)

### Q1: 后端日志显示 `NotImplementedError` 或 `Loop` 错误
*   **原因**: Windows 下 asyncio 事件循环与 uvicorn reload 冲突。
*   **解决**: 确保 `server.py` 中 `uvicorn.run(..., reload=False)` 参数为 False。我们已在 v2.0 代码中强制修复此问题。

### Q2: Playwright 工具未显示
*   **原因**: MCP 握手失败或 npx 路径问题。
*   **解决**: 
    1. 检查 `backend/mcp_config.json` 中的命令路径是否正确。
    2. 确保手动运行 `npx @playwright/mcp@latest install` 已成功。

### Q3: 员工端显示 "Connection Error"
*   **原因**: 防火墙阻止了 80 端口或 WebSocket。
*   **解决**: 
    1. 在服务器 Windows Defender 防火墙中添加入站规则，允许 TCP 80 和 8000。
    2. 确保 Nginx 正在运行。

### Q4: Outlook 操作失败 "Access Denied"
*   **原因**: Windows 安全中心阻挡或 Outlook 未运行。
*   **解决**: 确保 Outlook 桌面版已打开，且 Python 脚本有权限调用 COM 接口。