# 建议网页（jiangyiwangye）

给站长的歌写建议 → 赚积分 → 换奖品的独立小网页。

- 目前**独立运行**，不接主站导航，也不改主站任何文件；以后主站的登录会换成同一套账号（接口已按可共用设计）。
- 纯本地：后台跑在你自己的 Windows 电脑上，数据存在本机文件夹；以后把整个 `jiangyiwangye` 文件夹搬到服务器就能继续用。
- 零依赖：不用 npm install，不用数据库软件，只用电脑上已有的 Node.js。

---

## 一、怎么启动（本机使用）

1. 双击 **`启动建议网页.bat`**
2. 浏览器打开 **http://127.0.0.1:8787**
3. 第一次用后台：打开 **http://127.0.0.1:8787/admin** → 按提示创建管理员账号（邮箱 / 用户名 / 密码）

启动窗口要一直开着；关掉窗口 = 网站关闭。窗口里会打印：
- 本机访问地址
- 局域网访问地址（手机连同一个 Wi-Fi 可以打开，方便真机测试）
- 开发模式下发的验证码（会显示在这里）

> 第一次启动时 Windows 防火墙可能弹窗，允许「专用网络」访问即可（否则手机打不开）。

## 二、登录方式（第一版）

- **邮箱 + 验证码**（主推）：点「发送验证码」→ 开发模式下验证码显示在启动窗口和页面提示里 → 填进去登录/注册。
- **密码登录**：登录页可切「密码登录」，用邮箱或用户名 + 密码。
- 用户登录后可以在「我的 → 账号设置」里补用户名、设置密码，之后就能用密码登录。
- 以后上线：把 `config.local.json` 里的 `devMode` 改成 `false`，验证码就会走真正的邮件服务
  （SMTP 部分预留了接口，需要时再接；也可以继续只用密码登录）。

## 三、数据存在哪（重要）

```
jiangyiwangye/
  shujuku-1/                ← 数据库 + 上传的文件，**不会上传到 GitHub**
    app.db                  ← SQLite 数据库（全部数据）
    uploads/public/         ← 图片等公开文件（封面、奖品图、建议配图）
    uploads/private/        ← 虚拟奖品文件（只能兑换后下载）
    dev-codes.log           ← 开发模式验证码记录（方便查）
  config.local.json         ← 本机配置（端口、开发模式、管理员初始化等），**不会上传**
```

- `.gitignore` 已把 `shujuku-1/` 和 `config.local.json` 排除，**不会被 git 提交**。
- **备份**：直接把整个 `shujuku-1` 文件夹复制一份即可（关掉服务再复制更稳）。
- **迁移服务器**：把整个 `jiangyiwangye` 文件夹（含 `shujuku-1`）复制过去，
  装好 Node.js（22.5 以上，推荐 24），运行 `node server.js` 即可；记得改端口 / 域名 / 安全设置。

## 四、管理员能做什么

打开 `/admin`，登录后：

| 分区 | 功能 |
| --- | --- |
| 概览 | 用户数、建议数、待审数、已采纳、发放积分、待处理订单 |
| 建议审核 | 看每条建议（含配图），通过（加采纳奖励分）/ 不通过 / 删除（扣回基础分） |
| 奖品管理 | 新增 / 编辑 / 上下架 / 删除奖品；上传奖品图片；给虚拟奖品上传文件 |
| 兑换订单 | 看实物订单（地址、联系方式），标记发货 / 取消并退分；虚拟订单可下载文件 |
| 用户与积分 | 搜用户、看余额、手动加/扣积分、重置密码 |
| 网站内容 | 歌名、歌手、网易云链接、封面、歌曲介绍、公告、积分规则、每日上限 |

上传支持：封面/奖品图（jpg/png/webp/gif，≤8MB）、虚拟奖品文件（zip/pdf/mp3/m4a/wav/mp4 等，≤30MB）。

## 五、本机技术结构

```
jiangyiwangye/
  server.js               ← 启动入口：HTTP 服务 + 静态文件 + API 路由
  lib/
    db.js                 ← SQLite 建表 / 默认设置 / 查询封装
    auth.js               ← 验证码、密码哈希、登录会话、权限
    api.js                ← 所有 /api 接口
    util.js               ← JSON、请求体解析、文件、限流等小工具
    mail.js               ← 验证码发送（开发模式打印；以后接 SMTP）
  public/
    index.html            ← 前台页
    admin.html            ← 管理后台
    assets/css/base.css   ← 公共设计变量与基础组件
    assets/css/app.css    ← 前台样式
    assets/css/admin.css  ← 后台样式
    assets/js/api.js      ← 前端统一接口封装（token、下载、上传）
    assets/js/app.js      ← 前台逻辑
    assets/js/admin.js    ← 后台逻辑
  scripts/                ← 辅助脚本（备份、初始化管理员等，按需）
  API.md                  ← 前后端接口契约
  config.local.json       ← 首次启动自动生成（端口 / 开发模式 / 会话密钥）
  .gitignore              ← 排除 shujuku-1、config.local.json
  启动建议网页.bat         ← 双击启动
```

### 本机要求

- Node.js **24**（推荐；本项目用 Node 内置的 `node:sqlite`，23.4 以上已无需额外参数；
  Node 22.5~23.3 需要在启动命令后加 `--experimental-sqlite`，不建议）
- 不需要 npm install，不需要额外软件

### 常用命令

```powershell
node server.js            # 启动服务（默认 8787 端口）
node --check server.js    # 检查语法
```

## 六、以后接主站（现在不改主站）

等服务器上线、有了公网地址后：

1. 在 `config.local.json` 的 `corsOrigins` 里加上 `https://xiaoxingyuemiao.github.io`；
2. 主站把 `assets/js/auth.js` 的登录请求换成这套接口（邮箱验证码 / 密码 / token），
   token 同样存 localStorage，就能做到「主站登录 == 建议页登录」；
3. 主站是 HTTPS，后端也必须是 HTTPS（服务器上挂证书或用反向代理），否则浏览器会拦混合内容。

## 七、安全提醒

- 后台**只在自己电脑上开着**时问题不大；一旦放到公网，必须：
  - 先把管理员账号创建好（`/admin` 的初始化只会在没有管理员时出现）；
  - 给服务器配 HTTPS；
  - 不要把 `shujuku-1/` 和 `config.local.json` 传到 GitHub；
  - 管理员密码别用弱密码。
- 开发模式（`devMode=true`）会把验证码直接显示出来，**只适合本机测试**，公网部署前一定改成 `false`。
- 用户上传的文件会做类型/大小校验；虚拟奖品文件不会公开暴露，只能通过订单下载。
- **管理员初始化默认只允许本机（127.0.0.1）操作**：如果以后部署在服务器上、需要在远程浏览器里创建管理员，
  临时把 `config.local.json` 的 `allowRemoteSetup` 改成 `true`，创建完立刻改回 `false`。

## 八、开发自检命令

```powershell
# 1. 语法检查（所有后端 JS）
node --check server.js

# 2. 前端静态自查（重复 id / JS 引用的 id / 本地资源 / 脚本顺序）
node scripts/check-pages.js

# 3. 接口冒烟测试（需先启动服务；会写测试数据，跑完可删 shujuku-1 重置）
node scripts/smoke-test.js

# 4. 真实浏览器截图（需要本机装 Edge/Chrome；会输出到 shujuku-1/shots/）
#    普通用户 / 管理员账号通过环境变量传入；不传就只截未登录页面
$env:ADMIN_EMAIL="..."; $env:ADMIN_PASSWORD="..."; $env:FAN_EMAIL="..."; $env:FAN_PASSWORD="..."
node scripts/ui-screenshot.js
```

> 冒烟测试和截图脚本都会往数据库里写测试数据，**正式使用前请把 `shujuku-1` 删掉**（会自动重建空库）。
