# 星月小窝 —— 仓库约定（AGENTS.md）

> **给所有在这个仓库干活的 AI 助手看的常驻规则，开工前先读完本文件。**
> 人 + AI 的完整协作约定见 `docs/04-AI协作约定.md`；踩过的坑与已知问题见 `docs/08-踩坑与错误记录.md`。

---

## 一、这是个什么项目（30 秒看懂）

纯静态站点，**零构建、零依赖**，直接部署 GitHub Pages（`https://xiaoxingyuemiao.github.io/xingyue/`）。
技术栈就是原生 HTML + CSS + JS，**不要引入 npm 包、打包工具、框架、CDN 依赖**。

页面：`index.html`（登录 / 注册 / 找回密码 + 首页聊天 + Live2D 舞台）、`user.html`（个人中心四分区）、
`chahua.html`（插画画廊）、`zhoubian.html`、`dongtai.html`、`xingyao.html` / `yueci.html` / `xiaomiao.html`、
`live2d.html` / `live2d-guide.html`、`zidongyulan.html`（自动预览，暂空白）。

**回答与注释一律用简体中文**，代码、路径、变量名保持原样。

### 了解 / 检查仓库时，**优先读 `docs/`**，不要一上来就满仓库 grep

按这个顺序读，最快建立全局认识：

| 顺序 | 文件 | 读它能知道 |
| --- | --- | --- |
| 1 | `docs/01-网站定位.md` | 这个站是做什么的、给谁用 |
| 2 | `docs/02-网站结构.md` | 目录与页面职责、实现进度 |
| 3 | `docs/05-网站流程图.md` | 页面地图 / 登录 / 聊天 / 数据流程 + 改造进度 |
| 4 | `docs/04-AI协作约定.md` | 分工、铁律、公共文件边界 |
| 5 | `docs/07-云端同步.md` | 数据库表、uid 规则、隐私设计 |
| 6 | `docs/08-踩坑与错误记录.md` | 踩过的坑 + 已知问题清单 + 自查表 |

⚠️ **`docs/` 里的内容可能滞后于代码**（已发现多处：仍在写已删除的 `settings.html`、旧的 uid 规则等）。
**文档与代码冲突时以代码为准**，并到 `docs/08-踩坑与错误记录.md` 第四节登记一条，不要照抄文档下结论。

---

## 二、三条红线（先看这个）

1. **`docs/` 默认只读。**
   唯一允许写入的文件是 **`docs/08-踩坑与错误记录.md`**（白名单，用来追加踩坑记录）。
   `docs/` 里其它任何文件（包括 `docs/网站流程图.excalidraw` 这类流程图）**只能读**，要改先问站长。
2. **一个文件同一时间只由一个人的 AI 改。**
   动手前先 `git pull`，并在对话里说清「这次要改哪几个文件」；不要顺手改公共文件
   （`assets/css/home.css`、`assets/css/style.css`、`index.html`、`assets/js/common.js`）。
3. **永不 `git push --force`，永不批量 `git checkout --ours/--theirs`。** 这两条是唯一会造成真实数据丢失的操作。

---

## 三、技术约定（照做，别自创）

| 场景 | 约定 |
| --- | --- |
| 新页面 / 新模块的样式 | **写自己的独立 CSS 文件**（如 `assets/css/gallery.css`、`assets/css/auto-preview.css`），不要往 `home.css` 里追加 |
| 子页面的顶栏与页脚 | 用 `<div id="site-header"></div>` + `<div id="site-footer"></div>` 占位，由 `assets/js/common.js` 注入；并在引入它的 `<script>` 前定义 `const PAGE = "页面标识";` |
| 读写本地数据 | 走 `assets/js/store.js` 的键常量，不要手写 localStorage 字符串 |
| 第三方依赖 | 只有 `assets/vendor/oh-my-live2d.min.js`（已 vendor 化，离线可用），不要新增 |
| 取 DOM 元素 | **按钮一律按 `id` 取**。`querySelector(".某个容器 button")` 拿到的是文档顺序第一个，极易绑错元素（见踩坑记录 #01） |
| 动 Service Worker | 脚本位置（决定作用域上限）、`scope`、以及「等激活」的方式，**三件事必须一起看**（见踩坑记录 #02） |
| 新增图片 | 加自己的前缀（`a-xxx.png` / `b-xxx.png`），避免同名（二进制冲突只能二选一） |
| 改 flex 布局 | `flex: 1`（管自己作为子项长大）和 `display: flex`（管内部能否分配）是两件事，都要写（见踩坑记录 H03） |

---

## 四、改完必须做的三件事

1. **跑 `node tools/check.js`**，必须全绿（它检查 JS 语法、页面本地链接与资源、`querySelector("#id")` 是否存在、页面内重复 id、Live2D 模型引用）。
2. **渲染类改动要真实看一眼**，不能只看「属性有没有生效」：
   - 无头浏览器在沙箱里需要**一次性提权**（受限令牌创建不了命名管道，会报 `mojo platform_channel Check failed`）；
   - **不要用 `--virtual-time-budget` 测真实异步**（它会快进定时器，SW / 缓存 / 网络会被误判成超时）。
   - 详见 `docs/08-踩坑与错误记录.md` 的 #03。
3. **踩到新坑就追加一条**到 `docs/08-踩坑与错误记录.md`，写清「现象 / 根因 / 修法 / 怎么避免」四件事 —— 只写现象等于没记。

---

## 五、提交与推送

- ⛔ **默认不要自动上传**（站长的要求，**优先于** `docs/04-AI协作约定.md` 里「改完就提交推送」那条 —— 那是双人协作的通用建议）：
  正确的收工动作是 → 跑 `node tools/check.js` → 做验证 → **把改动留在工作区** → 列出改动文件清单。
  全程**不要** `git add`、**不要** `git commit`、**不要** `git push`，暂存区也要保持干净。
- 只有站长明确说「上传」「提交」「推送」时才动手，而且**只提交这次说过的东西**，不要顺手把别的改动一起带上。
- 站长让上传时的规矩：提交信息写「改了什么 + 为什么」；**不要带 BOM**（PowerShell 的 `Set-Content -Encoding UTF8` 会加），见踩坑记录 H08。
- Git 在沙箱里推送需要提权（schannel 报 `SEC_E_NO_CREDENTIALS`），见踩坑记录 H10。
- ⛔ **不要自动去核对线上**：推送完就收工，**不要**主动访问 GitHub Pages 站点、也不要拉线上文件来验证部署结果。
  要看线上效果**站长会自己说**「核对线上」。判断推送成功与否，看 `git push` 的输出（`xxx..yyy  main -> main`）或远端 hash 就够了。

---

## 六、文件地图（改之前先确认改的是对的文件）

| 路径 | 职责 |
| --- | --- |
| `index.html` + `assets/js/main.js` | 登录 / 注册 / 找回密码 + 首页聊天（`main.js` 很大，改前先搜函数名） |
| `user.html` + `assets/js/settings.js` / `user.js` | 个人中心：个人资料 / API 设置 / 角色设定 / 对话记录 |
| `assets/js/common.js` | **所有子页面共用的顶栏与页脚**（改一处，全站生效） |
| `assets/js/store.js` | 数据层：localStorage 键常量 + 读写 + 旧数据迁移 |
| `assets/js/auth.js` / `cloud.js` | Supabase 登录（REST，零依赖）/ 云端资料与对话同步 |
| `assets/js/live2d.js` / `live2d-custom.js` + `l2d-sw.js` | Live2D 业务 / 本地模型导入 / **Service Worker（必须在站点根目录）** |
| `assets/data/official-roles.js` / `models.js` | 官方角色设定 / 模型缩放锚点与表情动作映射 |
| `assets/js/gallery.js` + `assets/css/gallery.css` | 插画画廊（画框、背景花草、毛线球滚动条、「进入自动预览」按钮） |
| `tools/check.js` | 唯一的检查脚本（`npm run check`） |
| `tools/hooks/` | 防密钥钩子（`git config core.hooksPath tools/hooks`） |
| `docs/08-踩坑与错误记录.md` | **唯一可写的 docs 文件**：踩坑记录 + 已知问题清单 + 提交前自查表 |

---

## 七、环境相关的已知限制（别当成故障排查）

- 沙箱用**受限令牌**启动命令：HTTPS 请求走 schannel 一律失败（`SEC_E_NO_CREDENTIALS`），
  **这是沙箱预期行为，不要去改系统 TLS / 证书存储 / SCHANNEL 注册表**。需要用 git/curl 时改走 OpenSSL 后端。
- 浏览器进程、`sh`、命名管道在受限令牌下起不来 → 涉及这些的验证**一次性提权**即可，别反复重试。
- 大仓库下载一律加 `--depth 1 --single-branch`。
