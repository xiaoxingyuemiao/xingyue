# 建议网页 · 前后端接口契约（v1）

> 前端（`public/`）和后端（`server.js`）都按这份文档写，**任何一方改字段都必须同步改这里**。
> 服务默认地址：`http://127.0.0.1:8787`。前端页面同源访问，路径直接写 `/api/...`。

---

## 0. 总规则

- 请求 / 响应都是 **JSON**（文件下载接口除外）。
- 成功：HTTP 200/201，响应就是数据本身（对象）。
- 失败：HTTP 4xx/5xx，响应固定为：
  ```json
  { "error": { "code": "VALIDATION", "message": "标题不能为空" } }
  ```
- 登录态：登录成功后拿到 `token`，之后请求带 `Authorization: Bearer <token>`。
  前端把 token 存在 `localStorage["xingyue_jiangyi_token"]`（`api.js` 已封装）。
- 时间都是 ISO 字符串（如 `2026-11-12T23:10:00.000Z`）。
- 所有金额/积分都是整数（不用小数）。

### 错误 code 约定

| code | HTTP | 含义 |
| --- | --- | --- |
| `VALIDATION` | 400 | 参数不合法 |
| `UNAUTHORIZED` | 401 | 没登录 / token 失效 |
| `FORBIDDEN` | 403 | 不是管理员 / 账号被封 |
| `NOT_FOUND` | 404 | 数据不存在 |
| `CONFLICT` | 409 | 冲突（邮箱已注册、奖品库存不足等） |
| `RATE_LIMITED` | 429 | 操作太频繁 |
| `INSUFFICIENT_POINTS` | 400 | 积分不够 |
| `OUT_OF_STOCK` | 409 | 奖品没库存 |
| `SERVER` | 500 | 服务端异常 |

---

## 1. 数据结构

### 1.1 User

```json
{
  "id": 1,
  "email": "fan@example.com",
  "username": "xiaoxing",
  "displayName": "小星",
  "isAdmin": false,
  "createdAt": "2026-11-12T23:10:00.000Z",
  "points": 120
}
```

- `username` 可为 `null`（第一版先不发用户名，允许后期在个人设置里补）。
- `points` 是实时余额（积分流水求和），只在需要的地方返回。

### 1.2 Site（整站公开信息）

```json
{
  "siteTitle": "星月小窝 · 听歌说",
  "siteSubtitle": "给这首歌提建议，赚积分换奖品",
  "song": {
    "title": "歌曲名",
    "artist": "歌手",
    "url": "https://music.163.com/song?id=123456",
    "intro": "这首歌的创作想法……",
    "cover": "/uploads/public/cover-xxx.jpg"
  },
  "announcement": "公告文字（可空）",
  "rules": { "base": 5, "bonus": 50, "dailyLimit": 3 },
  "rulesText": "积分规则说明文字",
  "shopIntro": "奖品区说明（可空）",
  "stats": { "users": 8, "suggestions": 12, "adopted": 3, "pointsGiven": 260 },
  "prizes": [Prize]
}
```

### 1.3 Prize（奖品）

```json
{
  "id": 1,
  "name": "定制亚克力钥匙扣",
  "description": "兑换后私信站长填地址",
  "kind": "physical",
  "cost": 300,
  "stock": 5,
  "image": "/uploads/public/prize-xxx.jpg",
  "hasFile": false,
  "active": true,
  "sort": 0,
  "createdAt": "2026-11-12T23:10:00.000Z"
}
```

- `kind`：`physical`（实物，需要填地址，站长发货）或 `digital`（虚拟，兑换后立刻能下载）。
- `image` 可为空字符串（前端显示渐变占位）。
- `hasFile`：虚拟奖品是否已上传文件（实物恒为 false）。
- `active=false` 的奖品前台不显示。
- **仅管理员接口**额外返回：`filePath`（私有文件路径，如 `private/xxx.pdf`）、`fileName`（上传时文件名）、`updatedAt`。
  前台接口不返回这些私有字段。

### 1.4 Submission（建议）

```json
{
  "id": 1,
  "title": "副歌可以再亮一点",
  "category": "编曲",
  "content": "正文……",
  "image": "/uploads/public/sug-xxx.jpg",
  "status": "pending",
  "basePoints": 5,
  "bonusPoints": 0,
  "adminNote": "",
  "createdAt": "2026-11-12T23:10:00.000Z",
  "reviewedAt": null,
  "user": { "id": 1, "displayName": "小星" }
}
```

- `status`：`pending` 待审核 / `approved` 已采纳 / `rejected` 未采纳。
- `category` 允许值：`旋律` / `歌词` / `编曲` / `演唱` / `整体感受` / `其他`。

### 1.5 Order（兑换订单）

```json
{
  "id": 1,
  "prizeId": 3,
  "prize": { "id": 3, "name": "高清壁纸包", "kind": "digital", "image": "..." },
  "cost": 100,
  "status": "pending",
  "address": "",
  "contact": "",
  "note": "",
  "trackingNo": "",
  "createdAt": "2026-11-12T23:10:00.000Z",
  "updatedAt": "2026-11-12T23:10:00.000Z",
  "canDownload": false,
  "user": { "id": 1, "displayName": "小星", "email": "fan@example.com" }
}
```

- `status`：`pending` 待处理（实物）、`fulfilled` 已完成、`cancelled` 已取消（积分已退回）。
- 虚拟奖品兑换后直接是 `fulfilled`，`canDownload=true`。
- 实物奖励兑换时 `address` 必须填。
- `user` 字段**只在管理员订单接口**里返回；前台「我的兑换」不需要（也没有）。

### 1.6 LedgerEntry（积分流水）

```json
{ "id": 1, "delta": 5, "type": "submit_base", "note": "提交建议", "createdAt": "..." }
```

`type`：`submit_base` 提交基础分 / `adopt_bonus` 采纳奖励 / `redeem` 兑换扣除 /
`refund` 取消退回 / `admin_adjust` 管理员调整 / `revoke` 删除建议扣回。

---

## 2. 公开 / 登录接口

### GET `/api/site`
整站信息（见 1.2）。不需要登录。

### GET `/api/prizes`
```json
{ "prizes": [Prize] }
```
只返回上架奖品。不需要登录。

### GET `/api/leaderboard`
```json
{ "items": [{ "id": 2, "displayName": "小星", "points": 260, "adopted": 3 }] }
```
按积分前 10 名。不需要登录。

### POST `/api/auth/send-code`
```json
{ "email": "fan@example.com", "purpose": "register" }
```
- `purpose`：`register`（注册）或 `login`（登录）。
- 邮箱格式校验；`register` 要求邮箱未注册，`login` 要求已注册。
- 同一邮箱 60 秒内只能发一次，每天/每小时有次数上限。

响应：
```json
{ "ok": true, "devCode": "123456", "cooldown": 60 }
```
- **开发模式**（`config.local.json` 的 `devMode=true`，默认）：`devCode` 直接返回，页面提示里显示；
  同时服务端窗口也会打印。正式上线后 `devMode=false`，响应里没有 `devCode`，改为发真邮件。

### POST `/api/auth/register`
```json
{ "email": "fan@example.com", "code": "123456", "displayName": "小星", "username": "xiaoxing" }
```
- `displayName` 可空（默认取邮箱 @ 前面一段）。
- `username` 可空；填了要 3~20 位，只能字母/数字/下划线，且唯一。
- 注册成功直接返回登录态。

响应：`{ "token": "....", "user": User }`

### POST `/api/auth/login-code`
```json
{ "email": "fan@example.com", "code": "123456" }
```
响应：`{ "token": "...", "user": User }`

### POST `/api/auth/login-password`
```json
{ "account": "fan@example.com", "password": "abc12345" }
```
- `account` 可以是邮箱，也可以是用户名。
- 密码规则：至少 8 位，且同时含字母和数字。

响应：`{ "token": "...", "user": User }`

### GET `/api/auth/me`（需登录）
响应：`{ "user": User }`

### POST `/api/auth/logout`（需登录）
响应：`{ "ok": true }`

### POST `/api/auth/set-password`（需登录）
```json
{ "password": "abc12345" }
```
响应：`{ "ok": true }`

### PATCH `/api/auth/me`（需登录）
```json
{ "displayName": "新名字", "username": "xiaoxing" }
```
字段都可选。响应：`{ "user": User }`

---

## 3. 建议 / 积分 / 兑换接口（需登录）

### GET `/api/me/points?limit=50&offset=0`
```json
{ "balance": 120, "entries": [LedgerEntry], "total": 8 }
```

### GET `/api/me/submissions?limit=50&offset=0`
```json
{ "items": [Submission], "total": 2 }
```

### GET `/api/me/orders?limit=50&offset=0`
```json
{ "items": [Order], "total": 1 }
```

### POST `/api/submissions`
```json
{
  "title": "副歌可以再亮一点",
  "category": "编曲",
  "content": "正文，20~2000 字",
  "image": "data:image/jpeg;base64,...."
}
```
- `image` 可选：单张图片，≤8MB，只能是 jpg/png/webp/gif。
- 每人每天最多提交 `rules.dailyLimit` 条（默认 3）。
- 提交成功立刻加基础分 `rules.base`。

响应：
```json
{ "submission": Submission, "pointsAwarded": 5, "balance": 125 }
```

### POST `/api/orders`
```json
{ "prizeId": 3, "address": "浙江省杭州市……", "contact": "微信 xxx", "note": "" }
```
- 实物奖品 `address` / `contact` 必填；虚拟奖品不用。
- 服务端在一个事务里：校验库存 → 校验余额 → 扣分 → 减库存 → 建单。
- 虚拟奖品直接 `fulfilled`；实物奖品是 `pending`。

响应：`{ "order": Order, "balance": 20 }`

### GET `/api/orders/:id/file`（需登录）
下载虚拟奖品的文件（只允许订单本人或管理员）。响应是二进制文件，带
`Content-Disposition: attachment`。前端用 `fetch` + blob 下载（`api.js` 已封装）。

---

## 4. 管理员接口（需登录 + `isAdmin=true`）

### GET `/api/admin/status`（公开）
```json
{ "needsSetup": true }
```
- `needsSetup=true` 表示数据库里还没有管理员，管理页应显示「创建管理员」表单。

### POST `/api/admin/setup`（公开，仅在无管理员时可用）
```json
{ "email": "admin@example.com", "username": "admin", "password": "abc12345", "displayName": "站长" }
```
响应：`{ "token": "...", "user": User }`。成功后该账号就是管理员。

### GET `/api/admin/overview`
```json
{
  "stats": { "users": 12, "suggestions": 20, "pending": 4, "adopted": 6, "pointsGiven": 300, "orders": 3, "pendingOrders": 1 },
  "recentSubmissions": [Submission],
  "recentOrders": [Order]
}
```

### GET `/api/admin/submissions?status=pending&q=&limit=50&offset=0`
```json
{ "items": [Submission], "total": 4 }
```
`status` 可为 `pending` / `approved` / `rejected` / 空（全部）；`q` 搜索标题/正文/用户。

### POST `/api/admin/submissions/:id/review`
```json
{ "action": "approve", "bonus": 50, "note": "写得好" }
```
- `action`：`approve`（采纳，加奖励分）或 `reject`（不采纳）。
- `bonus` 不传时用设置里的默认 `rules.bonus`；可传 0。
- 重复审核同一条：以后一次为准（会先撤回上一次的奖励分再记新的）。

响应：`{ "submission": Submission }`

### DELETE `/api/admin/submissions/:id`
删除建议，并**扣回**该建议发过的基础分（余额最多扣到 0）。
响应：`{ "ok": true, "deducted": 5 }`

### GET `/api/admin/prizes`
```json
{ "prizes": [Prize] }
```
管理员能看到上架 + 下架的全部奖品。

### POST `/api/admin/prizes`
```json
{ "name": "钥匙扣", "description": "", "kind": "physical", "cost": 300, "stock": 5, "image": "/uploads/public/xx.jpg", "sort": 0, "active": true }
```
响应：`{ "prize": Prize }`

### PATCH `/api/admin/prizes/:id`
同 POST 的字段，全部可选。响应：`{ "prize": Prize }`

### DELETE `/api/admin/prizes/:id`
- 没有订单引用 → 真删除；
- 有订单引用 → 自动改成下架（`active=false`），返回 `{ "ok": true, "deactivated": true }`。

### POST `/api/admin/upload`
```json
{ "filename": "cover.jpg", "mime": "image/jpeg", "data": "data:image/jpeg;base64,...." }
```
- `data` 可带 `data:...;base64,` 前缀，也可直接是 base64。
- 图片（jpg/png/webp/gif）：≤8MB，存到 `shujuku-1/uploads/public/`，返回公开可访问地址。
- 其它文件（zip/pdf/mp3/m4a/wav/mp4/图片）：≤30MB，存到 `shujuku-1/uploads/private/`，
  **只能通过订单下载接口取**。

响应：`{ "path": "public/cover-xxx.jpg", "url": "/uploads/public/cover-xxx.jpg", "kind": "image" }`
- 私有文件 `url` 为 `null`，把 `path` 填进奖品的 `filePath`。

### GET `/api/admin/orders?status=&q=&limit=50&offset=0`
```json
{ "items": [Order], "total": 3 }
```

### POST `/api/admin/orders/:id/action`
```json
{ "action": "fulfill", "trackingNo": "SF1234567890" }
```
- `action`：`fulfill`（完成/发货）或 `cancel`（取消并退回积分、恢复库存）。
响应：`{ "order": Order }`

### GET `/api/admin/users?q=&limit=50&offset=0`
```json
{ "items": [User], "total": 12 }
```
`q` 搜索邮箱/用户名/昵称；`User` 里带 `points`。

### POST `/api/admin/users/:id/adjust-points`
```json
{ "delta": 50, "note": "活动补偿" }
```
响应：`{ "user": User, "balance": 170 }`

### POST `/api/admin/users/:id/reset-password`
```json
{ "password": "abc12345" }
```
响应：`{ "ok": true }`

### GET `/api/admin/settings`
```json
{ "settings": { "site_title": "...", "song_title": "...", "...": "..." } }
```
全部按字符串键值返回（前端自己转数字/布尔）。

### PUT `/api/admin/settings`
```json
{ "site_title": "星月小窝 · 听歌说", "points_base": "5" }
```
只更新传了的键。响应：`{ "settings": {...} }`

### GET `/api/admin/export`
返回整库 JSON（用户、建议、流水、奖品、订单、设置），用于备份。
响应：`{ "exportedAt": "...", "data": { ... } }`

---

## 5. 设置键（settings 表）

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `site_title` | 星月小窝 · 听歌说 | 页面标题 |
| `site_subtitle` | 给这首歌提建议，赚积分换奖品 | 副标题 |
| `song_title` | 歌曲名待填写 | 歌名 |
| `song_artist` |  | 歌手 |
| `song_url` |  | 网易云链接 |
| `song_intro` |  | 歌曲介绍 / 创作想法 |
| `song_cover` |  | 封面图地址（上传接口返回的 url） |
| `announcement` |  | 公告，可空 |
| `rules_text` | 提交建议得 5 分，被采纳再得 50 分…… | 积分规则说明 |
| `shop_intro` |  | 奖品区说明 |
| `points_base` | 5 | 提交基础分 |
| `points_bonus` | 50 | 采纳奖励分 |
| `submit_daily_limit` | 3 | 每人每天最多几条建议 |

---

## 6. 本地开发约定

- 后端零依赖：只用 Node 内置模块（`node:http` / `node:sqlite` / `node:crypto` / `node:fs`）。
- 数据库和上传文件都在 `jiangyiwangye/shujuku-1/`，**这个目录不会进 git**。
- 前端零依赖：原生 HTML/CSS/JS，不用 npm / 框架 / CDN。
- 改完 JS 用 `node --check 文件` 自查语法。
