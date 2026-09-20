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
| `index.html` | 首页入口：**登录 / 注册 / 找回密码**（起始屏）+ 聊天 + Live2D 舞台 |
| `user.html` | **个人中心**：个人资料 / API 设置 / 角色设定 / 对话记录 + 退出登录 |
| `chahua.html` | 插画页（横向长画廊） |
| `zhoubian.html` / `dongtai.html` | 周边 / 动态（占位） |
| `xingyao.html` / `yueci.html` / `xiaomiao.html` | 关于页（三个角色）|
| `live2d.html` / `live2d-guide.html` | Live2D Param 介绍下载页 / 使用说明 |
| `assets/js/store.js` | **数据层**：localStorage key 常量 + 读写封装 + 旧数据迁移（各页共用） |
| `assets/js/auth.js` | **登录模块**：Supabase 邮箱验证码 / 密码登录 / 注册 / 找回密码（REST，零依赖） |
| `assets/js/main.js` | 首页逻辑：登录流程、聊天、角色切换、情绪解析 |
| `assets/js/live2d.js` | **Live2D 业务模块**：模型加载 / 角色切换模型 / 情绪表情动作 / 窗口交互 |
| `assets/js/live2d-custom.js` | 自定义模型导入（文件夹 → 浏览器缓存 → 虚拟路径加载） |
| `assets/js/l2d-sw.js` | Service Worker：拦截自定义模型虚拟路径，从缓存返回 |
| `assets/js/net-mock.js` | 网络拦截：屏蔽 SDK 的 unpkg / 一言请求（必须在 SDK 前加载） |
| `assets/js/settings.js` | 个人中心的 API / 角色 / 对话分区逻辑 |
| `assets/js/user.js` | 个人中心的个人资料 + 退出登录逻辑 |
| `assets/js/gallery.js` | 插画画廊逻辑 |
| `assets/js/common.js` | 子页面共用的导航栏 / 页脚 |
| `assets/data/official-roles.js` | 官方角色设定（后台维护，push 即生效） |
| `assets/data/models.js` | **模型配置**：每个模型的缩放 / 锚点 / 表情与动作映射 |
| `assets/data/supabase-config.js` | Supabase 登录服务配置（Project URL + Publishable key） |
| `assets/css/` | 各页面样式（style / home / settings / live2d / gallery） |
| `assets/vendor/oh-my-live2d.min.js` | 唯一第三方依赖（已 vendor 化，自包含 SDK） |
| `assets/live2d/` | 模型文件：`default/`（其他模型按需添加） |
| `docs/` | 网站定位、结构、协作指南、流程图等文档 |
| `tools/` | 检查脚本、防密钥钩子、流程图生成脚本 |
| `package.json` | 项目声明（零依赖） |

**依赖声明**：运行时唯一外部依赖是 oh-my-live2d（已放进 `assets/vendor/`，离线可用；index.html 里留有 CDN 兜底）。

**脚本加载顺序**（index.html）：`net-mock.js` → SDK → `store.js` → `official-roles.js` → `models.js` → `live2d.js` → `live2d-custom.js` → `main.js`

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
