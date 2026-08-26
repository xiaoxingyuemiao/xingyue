# 星月小窝开发日记

## 主要内容

    1.我想怎么做就怎么做。
    2.是我突发奇想的一个项目，会长期维护。
    3.如果你感兴趣，请一定联系我啊qwq。
        联系方式：以后再给
    4.为了给我的两个小家伙（oc）而做的网站，是我自己喜欢的东西，不接受任何反驳！

## 开发程度

    用deepseek harness开发

## 如何预览

    1. 到https://xiaoxingyuemiao.github.io/xingyue/查看

## 当前进度

    不知道

## 项目结构（技术说明）

纯静态站点，**零构建**（不需要 npm install / vite / webpack），直接部署 GitHub Pages：

| 路径 | 职责 |
|---|---|
| `index.html` | 首页入口：聊天 + Live2D 舞台（含 unpkg/一言 网络拦截脚本） |
| `settings.html` | 设置页：API 提供商 / 角色设定 / 对话历史 |
| `assets/js/main.js` | 首页逻辑：聊天、角色切换、会话存储 |
| `assets/js/live2d.js` | **Live2D 业务模块**：模型加载 / 角色切换模型 / 窗口交互 |
| `assets/js/settings.js` | 设置页逻辑 |
| `assets/data/official-roles.js` | 官方角色设定（后台维护，push 即生效） |
| `assets/css/` | 各页面样式 |
| `assets/vendor/oh-my-live2d.min.js` | 唯一第三方依赖（已 vendor 化，自包含 SDK） |
| `assets/live2d/` | 模型文件：`default/` `xingyao/` `yueci/` |
| `tools/` | 开发辅助脚本 |
| `package.json` | 项目声明（零依赖） |

**依赖声明**：运行时唯一外部依赖是 oh-my-live2d（已放进 `assets/vendor/`，离线可用；index.html 里留有 CDN 兜底）。

## 本地开发（可复现环境）

零安装：浏览器 + 任意静态文件服务器即可。

    # 方式一：Node（npx 自动拉取 serve，首次稍慢）
    npm start

    # 方式二：Python
    python -m http.server 8080

    # 方式三：VS Code 安装 Live Server 插件后点 Go Live

语法检查：

    npm run check

部署：推送到 `main` 分支 → GitHub Pages 自动发布到
`https://xiaoxingyuemiao.github.io/xingyue/`（等 1~2 分钟，硬刷新 Ctrl+F5）。

版权所有 © 小星月喵
