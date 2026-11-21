# 星月小窝开发日记

> **协作规则见 `AGENTS.md`**（动代码前先读它）；踩过的坑与已知问题见 `docs/08-踩坑与错误记录.md`。

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
| `user.html` | **个人中心**：个人资料 / API 设置 / 角色设定 / 对话记录 / **积分**（余额、明细、挂兑换物、兑换单）+ 退出登录 |
| `chahua.html` | 插画页（一排自动排序、按图片真实比例自动换行的图墙 + 点开看大图，大图里可跳周边页兑换） |
| `zhoubian.html` / `dongtai.html` | **周边**（站内唯一的兑换物浏览页：类型筛选 + 卡片标注「虚拟自动到账 / 实物待发放」+ 就地弹框用积分兑换）/ 社区（发布动态、配图、点赞、看大图） |
| `xingyao.html` / `yueci.html` / `xiaomiao.html` | 关于页（三个角色）|
| `live2d.html` / `live2d-guide.html` | Live2D Param 介绍下载页 / **使用说明**（左边一层叠一层的目录 + 右边正文的文档页） |
| `assets/js/store.js` | **数据层**：localStorage key 常量 + 读写封装 + 旧数据迁移（各页共用） |
| `assets/js/auth.js` | **登录模块**：Supabase 邮箱验证码 / 密码登录 / 注册 / 找回密码（REST，零依赖） |
| `assets/js/cloud.js` | **云端同步**：个人资料 / API 设置 / 对话记录的云端读写 + 秘钥加密上传 + 注销账号 + 积分 / 兑换 / 社区动态 / 图片上传 |
| `assets/js/main.js` | 首页逻辑：登录流程、聊天、角色切换、情绪解析 |
| `assets/js/live2d.js` | **Live2D 业务模块**：模型加载 / 角色切换模型 / 情绪表情动作 / 窗口交互 |
| `assets/js/live2d-custom.js` | 自定义模型导入（文件夹 → 浏览器缓存 → 虚拟路径加载） |
| `l2d-sw.js`（站点根目录） | Service Worker：拦截自定义模型虚拟路径，从缓存返回（**必须在站点根目录**，作用域才能覆盖各页面） |
| `assets/js/net-mock.js` | 网络拦截：屏蔽 SDK 的 unpkg / 一言请求（必须在 SDK 前加载） |
| `assets/js/settings.js` | 个人中心的 API / 角色 / 对话分区逻辑 |
| `assets/js/user.js` | 个人中心的个人资料 + 退出登录逻辑 |
| `assets/js/gallery.js` | 插画画廊逻辑 |
| `assets/js/points.js` | 个人中心「积分」分区：余额与明细、每日签到、挂兑换物（可选虚拟/实物与预计发货天数）、兑换单（虚拟单直接给下载入口；浏览与兑换已搬到周边页） |
| `assets/js/community.js` | 社区页逻辑：发布动态（含配图上传）、列表与加载更多、点赞、删除、看大图 |
| `assets/js/merch.js` | 周边页逻辑：按类型筛选兑换物、拼卡片（含发货方式标注）、就地弹兑换确认框下单、带物品 id 深链自动打开确认框 |
| `assets/js/live2d-guide.js` | 使用说明页的左侧目录：滚动高亮 / 分组折叠 / 手机端开合（页面没有它也照样能靠锚点跳转） |
| `assets/js/common.js` | 子页面共用的导航栏 / 页脚 |
| `assets/data/official-roles.js` | 官方角色设定（后台维护，push 即生效） |
| `assets/data/models.js` | **模型配置**：每个模型的缩放 / 锚点 / 表情与动作映射 |
| `assets/data/supabase-config.js` | Supabase 登录服务配置（Project URL + Publishable key） |
| `assets/css/` | 各页面样式：`style.css`（全站公共）、`home.css`（首页）、`settings.css`（个人中心）、`live2d.css`（Live2D Param 两页公共）、`live2d-guide.css`（使用说明页的文档版面）、`gallery.css`（插画）、`community.css`（社区）、`merch.css`（周边） |
| `assets/vendor/oh-my-live2d.min.js` | 唯一第三方依赖（已 vendor 化，自包含 SDK） |
| `assets/live2d/` | 模型文件：`default/`（其他模型按需添加） |
| `docs/` | 网站定位、结构、Git 协作指南、AI 协作约定、流程图、云端同步、踩坑与错误记录（`docs/08-踩坑与错误记录.md` 是该目录**唯一可写**的文件） |
| `tools/` | `tools/check.js`（唯一检查脚本）、`tools/hooks/`（防密钥钩子）、`tools/make-flow-excalidraw.js` / `tools/inspect-excalidraw.js`（流程图生成 / 查看）、`tools/supabase-schema.sql`（建表 SQL） |
| `.hintrc` | webhint 配置（编辑器可选，不参与构建、不影响运行） |
| `package.json` | 项目声明（零依赖）：`npm start` / `npm run check` / `npm run hooks` |
| `README.md` | 本文件：项目说明、目录结构、本地开发与部署 |
| `AGENTS.md` | **仓库级协作规则**（AI 每次会话自动读）：红线 / 技术约定 / 改完必做的三件事 |

**依赖声明**：运行时唯一外部依赖是 oh-my-live2d（已放进 `assets/vendor/`，离线可用；index.html 里留有 CDN 兜底）。

**脚本加载顺序**：

> 为简洁起见下面只写文件名：`store.js` / `auth.js` / `cloud.js` / `live2d.js` / `live2d-custom.js` / `main.js` / `net-mock.js` 在 `assets/js/`；`official-roles.js` / `models.js` / `supabase-config.js` 在 `assets/data/`；SDK 是 `assets/vendor/oh-my-live2d.min.js`。

- `index.html`：`net-mock.js` → SDK（vendor，缺失时回退 CDN）→ `store.js` → `official-roles.js` → `models.js` → `supabase-config.js` → `auth.js` → `cloud.js` → `live2d.js` → `live2d-custom.js` → `main.js`
- `user.html`：`store.js` → `api-config.js` → `auth.js` → `cloud.js` → `live2d-custom.js` → `settings.js` → `user.js` → `points.js`
- 其余子页面：`common.js`（插画页多一个 `gallery.js`，社区页多 `store.js` → `api-config.js` → `auth.js` → `cloud.js` → `community.js`，周边页同理换成 `merch.js`）；`live2d.html` 不加载任何脚本；`live2d-guide.html` 只多加载 `live2d-guide.js`（左侧目录）

**顺序有讲究**：`net-mock.js` 必须在 SDK 之前（拦截 SDK 的外网请求）；`supabase-config.js` 必须在 `auth.js` / `cloud.js` 之前；`store.js` 必须在 `cloud.js` 之前。

## 本地开发（可复现环境）

零安装：浏览器 + 任意静态文件服务器即可。

⚠️ **不要双击 `index.html` 打开**（地址栏是 `file://`）：浏览器会拦掉 Live2D SDK 发出的 `fetch`，
读不到 `model3.json` / `.moc3` / 贴图，**模型必然显示不出来**；`file://` 也不算安全上下文，
本地导入模型用的 Service Worker 同样注册不了。这不是站点的 bug，是浏览器的安全策略，
换成本机 http 打开就一切正常（与线上 GitHub Pages 行为一致）。

    # 方式一（推荐，零依赖、自动开浏览器、改完刷新即生效）
    Windows：双击仓库根目录的「启动本地预览.bat」
    命令行：node tools/serve.js        # 默认 http://127.0.0.1:5173，端口被占用会自动往后试
                                       # 加 --no-open 不自动开浏览器；--port 8080 指定端口

    # 方式二
    npm start                          # 等同于 node tools/serve.js

    # 方式三：VS Code 安装 Live Server 插件后点 Go Live

语法检查（**改动后必须跑，全绿才算过**）：检查 `assets/js` 与 `assets/data` 下所有脚本的语法、Live2D 模型 JSON 及其引用、每个页面的本地链接与资源是否存在、`querySelector("#id")` 指向的元素是否存在、页面内是否有重复 id、多份同名常量是否一致。

    npm run check

启用防密钥钩子（提交 / 推送前自动扫描，防止把 API 秘钥推上去）：

    npm run hooks

部署：推送到 `main` 分支 → GitHub Pages 自动发布到
`https://xiaoxingyuemiao.github.io/xingyue/`（等 1~2 分钟，硬刷新 Ctrl+F5）。

版权所有 © 小星月喵
