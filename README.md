# gh-proxy

GitHub 下载代理加速工具。通过 URL 重写方式代理 GitHub Releases/Raw/Archive 等各种文件的下载。

```
https://你的域名/https://github.com/user/repo/releases/download/v1.0.0/app.zip
```

## 支持的文件类型

| 类型 | 示例 URL |
|------|---------|
| Releases 下载 | `/https://github.com/user/repo/releases/download/v1.0.0/file` |
| Raw 文件 | `/https://github.com/user/repo/raw/main/README.md` |
| 仓库 tar.gz 归档 | `/https://github.com/user/repo/archive/refs/tags/v1.0.0.tar.gz` |
| 仓库 zip 归档 | `/https://github.com/user/repo/archive/refs/heads/main.zip` |
| 分支 zip | `/https://github.com/user/repo/zipball/main` |
| 分支 tar | `/https://github.com/user/repo/tarball/main` |
| Git Clone | `/https://github.com/user/repo.git` |
| 仓库主页 | `/https://github.com/user/repo` → 自动跳转下载 main.zip |
| 短格式 | `/github/user/repo` 或 `/gh/user/repo` |

## 部署方式

### 🚀 Cloudflare Workers（免费计划：10万请求/天）

**方式一：wrangler CLI**
```bash
npm install -g wrangler
cd gh-proxy
wrangler login
wrangler deploy src/cf-worker.js --name gh-proxy
```

**方式二：Workers Dashboard 直接粘贴**
打开 [Cloudflare Workers Dashboard](https://dash.cloudflare.com/?to=workers)，创建新 Worker，将 `src/cf-worker.js` 的全部内容粘贴到代码编辑器即可。

> ⚠️ `src/cf-worker.js` 是自包含单文件，同时适用于 CLI 和 Dashboard。

### ▲ Vercel（免费计划）

```bash
# Fork 或 clone 本仓库
npm install -g vercel
cd gh-proxy
vercel deploy
```

或直接导入 GitHub 仓库到 [vercel.com/new](https://vercel.com/new)。

### ☁️ Netlify（免费计划）

```bash
# Deploy with Netlify CLI
npm install -g netlify-cli
cd gh-proxy
ntl deploy --prod
```

或直接在 Netlify Dashboard 连接 GitHub 仓库自动部署。

### 🐳 Docker

```bash
docker build -t gh-proxy gh-proxy/
docker run -d -p 8080:8080 gh-proxy
# 使用: http://localhost:8080/https://github.com/...
```

或使用 Docker Compose：

```yaml
services:
  gh-proxy:
    build: ./gh-proxy
    ports:
      - "8080:8080"
    restart: unless-stopped
```

### Railway / Koyeb / Fly.io 等

直接部署 `src/docker-server.js`（需要 Node 22+ runtime），启动命令：

```bash
node src/docker-server.js
```

默认监听 `0.0.0.0:8080`，可通过 `PORT` 环境变量配置端口。

## URL 格式

支持以下路径格式：

```
/https://github.com/user/repo/raw/main/file.js    ← 标准格式
/github/user/repo/raw/main/file.js                ← 短格式
/gh/user/repo                                     ← 更短格式
```

所有格式均自动添加 `https://` 协议前缀。

## 工作原理

1. 请求进入 → 从路径中提取 GitHub 完整 URL
2. 转发请求到 GitHub（透传必要的请求头）
3. 处理 GitHub 的 302 重定向（如 Releases 跳转 CDN）
4. 返回响应（流式传输大文件 + CORS + 缓存头）

## 测试

```bash
node test/proxy-core.test.mjs
```

## License

MIT
