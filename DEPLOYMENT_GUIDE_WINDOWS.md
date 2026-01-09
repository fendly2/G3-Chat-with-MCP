# DellTech AI Workspace - Windows Server Deployment Guide

本文档旨在指导 IT 管理员在 Windows Server 2022/2025 环境下部署 **DellTech AI Workspace** 系统。

该系统包含两个主要部分：
1.  **Backend (Python FastAPI)**: 负责处理 AI 逻辑、MCP 工具调用（Playwright/Time）以及 WebSocket 连接。
2.  **Frontend (React)**: 用户交互界面。

---

## 1. 服务器环境准备 (Prerequisites)

请确保服务器满足以下要求：

*   **OS**: Windows Server 2019 / 2022 / 2025
*   **Network**: 
    *   需要互联网访问（用于下载 Python 包、Node 包以及前端 CDN 资源）。
    *   如果不允许外网访问，需要配置内部 PyPI 镜像源和前端本地化改造。

### 1.1 安装 Python
1.  下载 **Python 3.11+** (推荐 3.11 或 3.12) 安装包。
2.  **重要**: 安装时勾选 **"Add Python to PATH"**。
3.  安装完成后，打开 PowerShell 验证：
    ```powershell
    python --version
    pip --version
    ```

### 1.2 安装 Node.js
后端使用了 Playwright (浏览器自动化) 和 Node.js 运行时。
1.  下载 **Node.js LTS** 版本 (例如 v18 或 v20) 的 `.msi` 安装包。
2.  默认安装即可，确保自动添加到 PATH。
3.  验证：
    ```powershell
    node -v
    npm -v
    npx -v
    ```

---

## 2. 后端部署 (Backend Setup)

假设项目源码位于 `C:\App\DellTechAI`。

### 2.1 安装依赖
在项目根目录下打开 PowerShell：

```powershell
cd C:\App\DellTechAI

# 1. 升级 pip
python -m pip install --upgrade pip

# 2. 安装后端核心库
pip install fastapi uvicorn[standard] openai websockets pydantic requests

# 3. 安装 MCP 相关库
pip install mcp-server-time

# 4. 初始化 Playwright (首次运行必须)
# 注意：此步骤会下载 Chromium 浏览器内核，可能耗时几分钟
npx -y @playwright/mcp@latest install
```

### 2.2 验证配置
检查 `backend/mcp_config.json` 文件。针对 Windows Server，推荐配置如下（代码库中已默认配置）：

```json
{
  "servers": {
    "mcp-time": {
      "command": "python",
      "args": ["-m", "mcp_server_time", "--local-timezone=Asia/Shanghai"],
      "enabled": true
    },
    "mcp-playwright": {
      "command": "npx.cmd", 
      "args": ["-y", "@playwright/mcp@latest"],
      "env": { "HEADLESS": "true" },
      "enabled": true
    }
  }
}
```
*注意：在 Windows 上必须使用 `npx.cmd` 而非 `npx`。*

### 2.3 启动后端测试
```powershell
# 必须在项目根目录运行，以便 python 能找到 backend 模块
python backend/server.py
```
若看到 `Uvicorn running on http://0.0.0.0:8000` 且无报错，说明启动成功。

---

## 3. 前端部署 (Frontend Hosting)

该项目当前采用了轻量级 No-Build 架构（基于 ES Modules 和 CDN）。

### 3.1 简单静态服务 (推荐)
为了在局域网内访问，我们需要一个静态文件服务器。

1.  全局安装 `serve` 工具：
    ```powershell
    npm install -g serve
    ```
2.  启动前端：
    ```powershell
    # 在项目根目录运行，端口设为 3000
    serve -s . -p 3000
    ```

此时，访问 `http://<服务器IP>:3000` 即可看到界面。

---

## 4. 生产环境服务化 (Service Automation)

为了防止服务器重启后服务中断，建议使用 **NSSM (Non-Sucking Service Manager)** 将 Python 后端和前端注册为 Windows 服务。

### 4.1 下载 NSSM
下载 nssm.exe 并解压到 `C:\Windows\System32` 或项目工具目录。

### 4.2 注册后端服务
```powershell
nssm install DellAI_Backend
```
在弹出的窗口中配置：
*   **Path**: `python.exe` (填入 python 的完整路径，如 `C:\Python311\python.exe`)
*   **Startup directory**: `C:\App\DellTechAI` (项目根目录)
*   **Arguments**: `backend/server.py`
*   **Dependencies**: (可选) 确保网络服务已启动

点击 "Install service"，然后启动：
```powershell
nssm start DellAI_Backend
```

### 4.3 注册前端服务
```powershell
nssm install DellAI_Frontend
```
配置：
*   **Path**: `C:\Program Files\nodejs\npx.cmd` (指向 npx.cmd)
*   **Startup directory**: `C:\App\DellTechAI`
*   **Arguments**: `serve -s . -p 3000`

启动：
```powershell
nssm start DellAI_Frontend
```

---

## 5. 网络与防火墙 (Network & Firewall)

请确保 Windows 防火墙允许以下入站规则：

1.  **Port 8000 (TCP)**: 用于后端 API 和 WebSocket 连接。
    *   允许范围：`Domain` 或 `Private` (建议限制在公司内网网段)。
2.  **Port 3000 (TCP)**: 用于访问 Web 界面。
    *   允许范围：`Domain` 或 `Private`。

**PowerShell 快速配置命令：**
```powershell
New-NetFirewallRule -DisplayName "DellAI Backend" -Direction Inbound -LocalPort 8000 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "DellAI Frontend" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow
```

---

## 6. 客户端 Agent 配置 (Client Configuration)

对于需要集成 Outlook 的员工笔记本电脑（Client）：

1.  在员工电脑上安装 Python。
2.  将 `client_agent.py` 发送给员工。
3.  安装依赖：`pip install websockets pywin32`。
4.  运行命令连接服务器：
    ```powershell
    python client_agent.py --server ws://<服务器IP>:8000/ws/mcp
    ```

---

## 7. 故障排查 (Troubleshooting)

*   **Playwright 报错**: 如果日志显示 `npx` 找不到，请检查 `backend/mcp_config.json` 中是否写的是 `npx.cmd`。
*   **Windows 异步错误**: 如果遇到 `NotImplementedError`，请确认 `backend/server.py` 中是否包含 `asyncio.WindowsProactorEventLoopPolicy` 代码段（新版本已包含）。
*   **界面白屏**: 按 F12 查看 Console。如果提示 `Failed to fetch`，请检查浏览器是否能访问 `http://<服务器IP>:8000`。
