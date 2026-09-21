// ================================
// 生成 Excalidraw 网站流程图（node tools/make-flow-excalidraw.js）
//
// 产出：默认 docs/网站流程图-生成版.excalidraw
//   · 想写别的路径：node tools/make-flow-excalidraw.js 目标路径.excalidraw
// 用法：在 https://excalidraw.com 菜单 → Open → 选这个文件（或直接拖进画布）
// 说明：节点坐标在下面 NODES 里，改完重跑本脚本即可重新生成
//
// ⚠️⚠️ 默认**故意不写** docs/网站流程图.excalidraw：
//   那份是站长在 excalidraw.com 上手改过的成品，本脚本是整文件覆盖（writeFileSync），
//   一跑就把手改内容全冲掉、且无法恢复。要用脚本覆盖它必须显式加 --force。
//   （这条已登记在 docs/08 §4.2）
//
// ⚠️ 本脚本的节点表**可能滞后于代码**（它画的是某一次快照）。
//   改完页面流程后要么同步更新 NODES，要么以 docs/05-网站流程图.md 的 Mermaid 图为准。
// ================================

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

// 站长手改过的那份：只读，不能被本脚本覆盖
const HAND_EDITED = path.join(ROOT, "docs", "网站流程图.excalidraw");

const args = process.argv.slice(2);
const force = args.includes("--force");
const outArg = args.find((a) => !a.startsWith("--"));

const OUT = outArg
    ? path.resolve(outArg)
    : path.join(ROOT, "docs", "网站流程图-生成版.excalidraw");

if (path.resolve(OUT) === path.resolve(HAND_EDITED) && fs.existsSync(HAND_EDITED) && !force) {
    console.error("✗ 拒绝覆盖 docs/网站流程图.excalidraw");
    console.error("  那份是站长手改过的流程图，本脚本会整文件覆盖、覆盖后无法恢复。");
    console.error("  · 想生成：直接跑（默认写到 docs/网站流程图-生成版.excalidraw）");
    console.error("  · 确实要覆盖手改版：再加 --force");
    process.exit(1);
}

// ---------- 配色 ----------
const C = {
    page: { stroke: "#1971c2", fill: "#e7f5ff" },      // 页面
    ui: { stroke: "#f08c00", fill: "#fff9db" },        // 页面内的元素 / 浮层
    ext: { stroke: "#9c36b5", fill: "#f8f0fc" },       // 外部服务 / 外链
    start: { stroke: "#2f9e44", fill: "#ebfbee" },     // 起点
    zone: { stroke: "#adb5bd", fill: "transparent" },  // 区域框
    note: { stroke: "#868e96", fill: "#f8f9fa" },      // 说明块
};

// ---------- 区域框 ----------
const ZONES = [
    { id: "z1", x: 40, y: 60, w: 740, h: 600, title: "① 入口 · 登录流程" },
    { id: "z2", x: 820, y: 60, w: 760, h: 900, title: "② 首页 index.html" },
    { id: "z3", x: 1620, y: 60, w: 720, h: 830, title: "③ 子页面（共用顶部导航 + 页脚）" },
    { id: "z4", x: 40, y: 700, w: 740, h: 460, title: "④ 个人中心 user.html（settings.html 已删除）" },
    { id: "z5", x: 1620, y: 930, w: 720, h: 340, title: "⑤ 外部链接（点了会离开本站）" },
    { id: "z6", x: 820, y: 1000, w: 760, h: 270, title: "⑥ 数据存在哪" },
];

// ---------- 节点 ----------
// kind: page 页面 / ui 页面内元素 / ext 外部 / start 起点 / note 说明
const NODES = [
    // ===== ① 入口 · 登录流程 =====
    { id: "start", x: 80, y: 150, w: 150, h: 56, kind: "start", text: "打开网站" },
    { id: "login", x: 300, y: 140, w: 210, h: 76, kind: "page", text: "index.html · 登录页\n（插画背景轮播：星瑶/月瓷 5 秒切换）" },
    { id: "card1", x: 300, y: 235, w: 210, h: 90, kind: "ui", text: "登录卡（进站直接就是这张）\n邮箱 + 密码 → [登录]\n[改用验证码登录] ｜ [忘记密码？]\n[没有账号？去注册一个吧] ｜ [先随便逛逛]" },
    { id: "cardReg", x: 300, y: 345, w: 210, h: 86, kind: "ui", text: "注册卡\n邮箱 + 密码 + 确认密码\n+ 验证码 [发送] → [注册]" },
    { id: "cardForgot", x: 300, y: 451, w: 210, h: 72, kind: "ui", text: "找回密码卡\n邮箱 + 验证码 → 新密码\n[重置密码] → 回登录卡" },
    { id: "guest", x: 80, y: 235, w: 170, h: 74, kind: "ui", text: "游客进入\n（不登录，只写 visited 标记）" },
    { id: "supabase", x: 590, y: 340, w: 160, h: 60, kind: "ext", text: "Supabase Auth\n发验证码 / 验密码" },
    { id: "mail", x: 590, y: 430, w: 160, h: 56, kind: "ext", text: "邮箱收到\n8 位验证码" },
    { id: "cred", x: 590, y: 235, w: 160, h: 70, kind: "ext", text: "登录凭证\n存本地\nxingyue_auth" },
    { id: "enterHome", x: 300, y: 545, w: 210, h: 56, kind: "page", text: "→ 进入首页\n（登录或游客都能进）" },

    // ===== ② 首页 =====
    { id: "sidebarZone", x: 850, y: 140, w: 320, h: 790, kind: "note", text: "左侧浮层侧边栏（可收起）" },
    { id: "sbToggle", x: 870, y: 190, w: 280, h: 46, kind: "ui", text: "[网站图标] 点击展开 / 收起侧边栏" },
    { id: "sbHome", x: 870, y: 246, w: 280, h: 42, kind: "ui", text: "[首页] 当前页，不跳转" },
    { id: "sbGallery", x: 870, y: 298, w: 280, h: 42, kind: "ui", text: "[插画] → chahua.html" },
    { id: "sbMerch", x: 870, y: 350, w: 280, h: 42, kind: "ui", text: "[周边] → zhoubian.html" },
    { id: "sbNews", x: 870, y: 402, w: 280, h: 42, kind: "ui", text: "[动态] → dongtai.html" },
    { id: "sbAbout", x: 870, y: 454, w: 280, h: 42, kind: "ui", text: "[关于] 鼠标悬停展开子菜单" },
    { id: "sbXy", x: 890, y: 506, w: 260, h: 38, kind: "ui", text: "↳ [星瑶] → xingyao.html" },
    { id: "sbYc", x: 890, y: 548, w: 260, h: 38, kind: "ui", text: "↳ [月瓷] → yueci.html" },
    { id: "sbXm", x: 890, y: 590, w: 260, h: 38, kind: "ui", text: "↳ [小喵] → xiaomiao.html" },
    { id: "sbL2d", x: 870, y: 638, w: 280, h: 42, kind: "ui", text: "[Live2D] → live2d.html" },
    { id: "sbUser", x: 870, y: 690, w: 280, h: 44, kind: "ui", text: "[左下角用户区]（头像 + 名字）" },
    { id: "sbUserNo", x: 870, y: 742, w: 280, h: 38, kind: "ui", text: "未登录时点击 → 回登录卡" },
    { id: "sbUserYes", x: 870, y: 784, w: 280, h: 38, kind: "ui", text: "已登录时点击 → user.html 个人中心" },
    { id: "sbZoneTip", x: 870, y: 832, w: 280, h: 48, kind: "note", text: "「设置」菜单项已删除\n设置只在个人中心里（入口＝左下角用户区）" },

    { id: "mainZone", x: 1195, y: 140, w: 365, h: 790, kind: "note", text: "主空间（app-space）" },
    { id: "mBg", x: 1215, y: 190, w: 325, h: 46, kind: "ui", text: "[背景图] 桌面 zhushitu / 手机 supingbeijing" },
    { id: "mL2d", x: 1215, y: 246, w: 325, h: 58, kind: "ui", text: "[Live2D 模型窗口]\n鼠标拖动 / 滚轮缩放 / Ctrl+滚轮旋转" },
    { id: "mBubble", x: 1215, y: 314, w: 325, h: 58, kind: "ui", text: "[聊天气泡]\n桌面显示 2 轮 ｜ 手机 1 轮 + 10 秒消失" },
    { id: "mRoleBtn", x: 1215, y: 382, w: 325, h: 46, kind: "ui", text: "[角色按钮] 打开角色选择面板" },
    { id: "mInput", x: 1215, y: 438, w: 325, h: 46, kind: "ui", text: "[输入框] 回车或点 ➤ 发送消息" },
    { id: "mPanel", x: 1215, y: 500, w: 325, h: 46, kind: "ui", text: "[角色选择面板（浮层）]" },
    { id: "mPanel1", x: 1235, y: 556, w: 305, h: 46, kind: "ui", text: "↳ 选择角色：同时切换 Live2D 模型 + 对话历史" },
    { id: "mPanel2", x: 1235, y: 612, w: 305, h: 46, kind: "ui", text: "↳ [添加人物] → user.html#role" },
    { id: "mChatFlow", x: 1215, y: 674, w: 325, h: 100, kind: "note", text: "发消息后的流程：\n写入本地历史 → 组装(角色设定+情绪规则+最近N对) → 调 API\n→ 解析【情绪：X】→ 刷新气泡 + 播放 Live2D 表情动作" },

    // ===== ③ 子页面 =====
    { id: "pNav", x: 1650, y: 130, w: 660, h: 84, kind: "note", text: "所有子页面共用顶部导航（common.js 注入）：\n[星月 logo]→首页 ｜ 插画 ｜ 周边 ｜ 动态 ｜ Live2D ｜ 关于▾\n当前所在页面的入口会自动隐藏" },
    { id: "pFoot", x: 1650, y: 224, w: 660, h: 62, kind: "note", text: "所有子页面共用页脚：\n[联系站长]→bilibili ｜ [友情赞助] ｜ [不要点]→B站视频 ｜ 版权归属" },
    { id: "pGallery", x: 1650, y: 300, w: 205, h: 70, kind: "page", text: "chahua.html\n插画（16 个画框 · 固定布局）" },
    { id: "pMerch", x: 1878, y: 300, w: 205, h: 70, kind: "page", text: "zhoubian.html\n周边（深色 + 粒子背景）" },
    { id: "pNews", x: 2106, y: 300, w: 204, h: 70, kind: "page", text: "dongtai.html\n动态（占位）" },
    { id: "pXy", x: 1650, y: 390, w: 205, h: 70, kind: "page", text: "xingyao.html\n关于 · 星瑶" },
    { id: "pYc", x: 1878, y: 390, w: 205, h: 70, kind: "page", text: "yueci.html\n关于 · 月瓷" },
    { id: "pXm", x: 2106, y: 390, w: 204, h: 70, kind: "page", text: "xiaomiao.html\n关于 · 小喵" },
    { id: "pL2d", x: 1650, y: 480, w: 660, h: 80, kind: "page", text: "live2d.html · Live2D Param 介绍 + 下载（专属顶栏）\n[软件图标+名字]（不可点） ｜ [网站图标] → 首页" },
    { id: "pL2dBody", x: 1660, y: 570, w: 640, h: 58, kind: "ui", text: "正文：[GitHub 按钮]→仓库外链 ｜ [下载（敬请期待）]灰色不可点\n邮箱 abcd_9866@qq.com（点击发邮件）" },
    { id: "pL2dFoot", x: 1660, y: 638, w: 640, h: 70, kind: "ui", text: "底栏三列：[关于 Live2d Param 使用说明] → guide ｜ [主页] → 首页\n[bilibili] ｜ [github] ｜ [赞助]（暂空）｜ [不要点] → B站视频" },
    { id: "pGuide", x: 1650, y: 720, w: 660, h: 66, kind: "page", text: "live2d-guide.html · 使用说明（占位）\n[← 返回 Live2D Param] → live2d.html" },
    { id: "zdyPage", x: 1650, y: 800, w: 660, h: 66, kind: "page", text: "zidongyulan.html · 自动预览（临时幻灯片）\nimages/ 全部图片循环播放 ｜ 17 种翻折/平移切换效果" },

    // ===== ④ 个人中心（settings.html 已删除，四个分区都并进 user.html）=====
    { id: "userPage", x: 80, y: 770, w: 320, h: 62, kind: "page", text: "user.html 个人中心\n[← 返回] 圆形按钮 → 首页" },
    { id: "userNav", x: 80, y: 842, w: 320, h: 48, kind: "ui", text: "左侧分区导航：① 个人资料 ② API 设置 ③ 角色设定 ④ 对话记录" },
    { id: "userInfo", x: 80, y: 900, w: 320, h: 74, kind: "ui", text: "① 个人资料：头像（上传 / 恢复默认）\n昵称（最多 12 字）· 个性签名 → 保存写本地 + 云端" },
    { id: "userApi", x: 80, y: 984, w: 320, h: 74, kind: "ui", text: "② API 设置：提供商卡片 切换 / 编辑 / 测试 / 拉模型列表\n[√] 同步秘钥到云端（勾选才 AES-GCM 加密上传）" },
    { id: "userRole", x: 80, y: 1068, w: 320, h: 74, kind: "ui", text: "③ 角色设定：我的角色增删改 · 模型配置\n填模型（官方名 / 在线URL / 导入本地文件夹）" },
    { id: "userChat", x: 430, y: 770, w: 320, h: 62, kind: "ui", text: "④ 对话记录：角色记忆对数 ｜ 清空历史\n全部对话列表（可展开、修改、删除）" },
    { id: "userOut", x: 430, y: 842, w: 320, h: 58, kind: "ui", text: "[退出登录] → 原地确认 → 清凭证 → 回登录卡" },
    { id: "userDel", x: 430, y: 910, w: 320, h: 74, kind: "ui", text: "[注销账号] 需 密码 + 邮箱验证码\n→ 删账号 + 清本地 + 释放 uid（不可恢复）" },
    { id: "userSync", x: 430, y: 994, w: 320, h: 74, kind: "note", text: "登录后自动拉云端：uid → 默认名「小窝第 N 成员」\n改资料 / 角色 / 对话 → 静默同步（对话防抖 3 秒）" },

    // ===== ⑤ 外部链接 =====
    { id: "eRepo", x: 1650, y: 1010, w: 320, h: 54, kind: "ext", text: "github.com/xiaoxingyuemiao/Live2D-Param" },
    { id: "eBili", x: 1650, y: 1074, w: 320, h: 54, kind: "ext", text: "bilibili 空间（联系站长）" },
    { id: "eVideo", x: 1650, y: 1138, w: 320, h: 54, kind: "ext", text: "B站视频（不要点）" },
    { id: "eMail", x: 1990, y: 1010, w: 320, h: 54, kind: "ext", text: "邮箱 abcd_9866@qq.com（mailto）" },
    { id: "eSupabase", x: 1990, y: 1074, w: 320, h: 54, kind: "ext", text: "Supabase（登录 / 验证码服务）" },
    { id: "ePages", x: 1990, y: 1138, w: 320, h: 54, kind: "ext", text: "GitHub Pages（网站托管）" },

    // ===== ⑥ 数据存储 =====
    { id: "dLocal", x: 850, y: 1050, w: 700, h: 84, kind: "note", text: "localStorage（13 个键，浏览器本地）\n设置 / 偏好 / 对话历史 / 当前角色 / 用户资料 / 登录凭证 / 上次邮箱 / 编号 memberNo / uid / syncKey / lastUser / 是否来过" },
    { id: "dCloud", x: 850, y: 1150, w: 340, h: 76, kind: "ext", text: "Supabase 云端\nprofiles 资料 ｜ user_settings 设置\nchat_sessions 对话 ｜ uid_pool 编号池" },
    { id: "dGitHub", x: 1210, y: 1150, w: 340, h: 62, kind: "ext", text: "GitHub 仓库\n代码 / Live2D 模型 / 图片" },
];

// ---------- 箭头 ----------
// label 会显示在箭头中点
const ARROWS = [
    // 入口 → 登录页
    { from: "start", to: "login", label: "访问网址" },
    { from: "login", to: "card1", label: "显示登录卡" },
    { from: "card1", to: "cardReg", label: "点[没有账号？去注册一个吧]" },
    { from: "cardReg", to: "card1", label: "点[已经有账号了？去登录吧]", dashed: true },
    { from: "card1", to: "cardForgot", label: "点[忘记密码？]" },
    { from: "cardForgot", to: "card1", label: "重置成功 → 回登录卡", dashed: true },
    { from: "card1", to: "guest", label: "点[先随便逛逛]" },
    { from: "card1", to: "supabase", label: "密码登录 / 点[发送]" },
    { from: "cardReg", to: "supabase", label: "点[发送]发验证码" },
    { from: "cardForgot", to: "supabase", label: "点[发送]发验证码" },
    { from: "supabase", to: "mail", label: "邮件送达" },
    { from: "card1", to: "cred", label: "验证通过 → 存凭证" },
    { from: "guest", to: "enterHome", label: "进首页" },
    { from: "cred", to: "enterHome", label: "拉云端资料 → 进首页" },

    // 首页内部
    { from: "sbToggle", to: "sbHome", label: "展开后的菜单项" },
    { from: "sbUser", to: "sbUserNo" },
    { from: "sbUser", to: "sbUserYes" },

    // 侧边栏 → 子页面（跨区）
    { from: "sbGallery", to: "pGallery" },
    { from: "sbMerch", to: "pMerch" },
    { from: "sbNews", to: "pNews" },
    { from: "sbXy", to: "pXy" },
    { from: "sbYc", to: "pYc" },
    { from: "sbXm", to: "pXm" },
    { from: "sbL2d", to: "pL2d" },
    { from: "sbUserYes", to: "userPage" },
    { from: "sbUserNo", to: "card1", label: "回登录卡", dashed: true },

    // 子页面互相跳转
    { from: "pNav", to: "pGallery", label: "顶栏菜单" },
    { from: "pL2d", to: "pL2dBody", label: "页面正文" },
    { from: "pL2dBody", to: "pL2dFoot", label: "往下滚动" },
    { from: "pL2dFoot", to: "pGuide", label: "点[使用说明]" },
    { from: "pGuide", to: "pL2d", label: "点[← 返回]", dashed: true },
    { from: "pGallery", to: "zdyPage", label: "点[进入自动预览]" },
    { from: "pNav", to: "login", label: "点[星月 logo] 回首页", dashed: true },

    // 外部链接
    { from: "pL2dBody", to: "eRepo", label: "点[GitHub]" },
    { from: "pL2dBody", to: "eMail", label: "点邮箱" },
    { from: "pL2dFoot", to: "eBili", label: "点[bilibili]" },
    { from: "pL2dFoot", to: "eVideo", label: "点[不要点]" },
    { from: "pFoot", to: "eBili", label: "点[联系站长]", dashed: true },
    { from: "supabase", to: "eSupabase", label: "登录服务", dashed: true },

    // 个人中心内部（四个分区 + 退出 / 注销）
    { from: "userPage", to: "userNav", label: "四个分区" },
    { from: "userNav", to: "userInfo" },
    { from: "userNav", to: "userApi" },
    { from: "userNav", to: "userRole" },
    { from: "userNav", to: "userChat" },
    { from: "userInfo", to: "userOut", label: "往下滚动" },
    { from: "userOut", to: "userDel", label: "再往下" },
    { from: "userOut", to: "card1", label: "清凭证 → 回登录卡", dashed: true },
    { from: "userDel", to: "card1", label: "注销后回登录卡", dashed: true },
    { from: "mPanel2", to: "userRole", label: "去添加角色" },

    // 数据
    { from: "dLocal", to: "dCloud", label: "登录后同步资料 / 设置 / 对话", dashed: true },
    { from: "dGitHub", to: "pGallery", label: "页面与资源来自仓库", dashed: true },
];

// ================================
// 生成 Excalidraw JSON
// ================================

const elements = [];
let seed = 1234567;
let nonce = 1;

function nextSeed() {
    seed = (seed * 1103515245 + 12345) % 2147483647;
    return Math.abs(seed);
}

function base(type, x, y, w, h, extra) {
    const el = {
        id: "el-" + (elements.length + 1),
        type: type,
        x: Math.round(x),
        y: Math.round(y),
        width: Math.round(w),
        height: Math.round(h),
        angle: 0,
        strokeColor: "#1e1e1e",
        backgroundColor: "transparent",
        fillStyle: "solid",
        strokeWidth: 2,
        strokeStyle: "solid",
        roughness: 1,
        opacity: 100,
        groupIds: [],
        frameId: null,
        roundness: type === "rectangle" ? { type: 3 } : null,
        seed: nextSeed(),
        version: 1,
        versionNonce: nonce++,
        isDeleted: false,
        boundElements: [],
        updated: 1,
        link: null,
        locked: false,
    };
    return Object.assign(el, extra || {});
}

const byId = {};

// 文本换行估算高度
function textHeight(text, fontSize) {
    const lines = String(text).split("\n").length;
    return Math.ceil(lines * fontSize * 1.28);
}

// 加一个带文字的矩形节点
function addNode(n) {
    const color = C[n.kind] || C.ui;
    const fontSize = n.kind === "note" ? 13 : 14;
    const rectId = "node-" + n.id;
    const textId = "label-" + n.id;

    const rect = base("rectangle", n.x, n.y, n.w, n.h, {
        id: rectId,
        strokeColor: color.stroke,
        backgroundColor: color.fill,
        strokeStyle: n.kind === "note" ? "dashed" : "solid",
        strokeWidth: n.kind === "note" ? 1 : 2,
        roughness: n.kind === "note" ? 0 : 1,
        roundness: { type: 3 },
        boundElements: [{ type: "text", id: textId }],
    });

    const th = textHeight(n.text, fontSize);
    const text = base("text", n.x + 8, n.y + Math.max(4, (n.h - th) / 2), n.w - 16, th, {
        id: textId,
        strokeColor: "#1e1e1e",
        fontSize: fontSize,
        fontFamily: 2,
        text: n.text,
        originalText: n.text,
        textAlign: "center",
        verticalAlign: "middle",
        containerId: rectId,
        lineHeight: 1.28,
        roundness: null,
        boundElements: [],
    });

    elements.push(rect, text);
    byId[n.id] = { rect: rect, text: text, node: n };
}

// 区域框（只有标题，无填充）
function addZone(z) {
    const rect = base("rectangle", z.x, z.y, z.w, z.h, {
        id: "zone-" + z.id,
        strokeColor: C.zone.stroke,
        backgroundColor: "transparent",
        strokeStyle: "dashed",
        strokeWidth: 2,
        roughness: 0,
        roundness: { type: 3 },
        boundElements: [{ type: "text", id: "zonelabel-" + z.id }],
    });
    const text = base("text", z.x + 14, z.y + 10, 340, 22, {
        id: "zonelabel-" + z.id,
        strokeColor: "#495057",
        fontSize: 16,
        fontFamily: 2,
        text: z.title,
        originalText: z.title,
        textAlign: "left",
        verticalAlign: "top",
        containerId: rect.id,
        lineHeight: 1.25,
        roundness: null,
    });
    elements.push(rect, text);
}

// 计算从 a 指向 b 时，a 边界上的出发点
function edgePoint(a, b) {
    const ac = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
    const bc = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    const dx = bc.x - ac.x;
    const dy = bc.y - ac.y;
    if (Math.abs(dx) >= Math.abs(dy)) {
        return { x: dx > 0 ? a.x + a.w : a.x, y: ac.y };
    }
    return { x: ac.x, y: dy > 0 ? a.y + a.h : a.y };
}

function addArrow(a) {
    const A = byId[a.from];
    const B = byId[a.to];
    if (!A || !B) {
        console.warn("跳过找不到的箭头：" + a.from + " → " + a.to);
        return;
    }
    const p1 = edgePoint(A.node, B.node);
    const p2 = edgePoint(B.node, A.node);
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;

    const arrow = base("arrow", p1.x, p1.y, Math.abs(dx), Math.abs(dy), {
        id: "arrow-" + elements.length,
        strokeColor: a.dashed ? "#adb5bd" : "#495057",
        strokeStyle: a.dashed ? "dashed" : "solid",
        strokeWidth: 2,
        roughness: 1,
        roundness: { type: 2 },
        points: [[0, 0], [Math.round(dx), Math.round(dy)]],
        startBinding: { elementId: A.rect.id, focus: 0, gap: 6 },
        endBinding: { elementId: B.rect.id, focus: 0, gap: 6 },
        startArrowhead: null,
        endArrowhead: "arrow",
    });
    elements.push(arrow);

    // 把箭头登记进两端矩形，拖动节点时箭头会跟着走
    A.rect.boundElements.push({ type: "arrow", id: arrow.id });
    B.rect.boundElements.push({ type: "arrow", id: arrow.id });

    // 箭头上的说明文字（独立小字，放在中点稍偏上）
    if (a.label) {
        const label = base("text", p1.x + dx / 2 - 90, p1.y + dy / 2 - 22, 180, 20, {
            id: "alabel-" + elements.length,
            strokeColor: "#868e96",
            fontSize: 12,
            fontFamily: 2,
            text: a.label,
            originalText: a.label,
            textAlign: "center",
            verticalAlign: "middle",
            containerId: null,
            lineHeight: 1.25,
            roundness: null,
        });
        elements.push(label);
    }
}

// ---------- 组装 ----------
for (const z of ZONES) {
    addZone(z);
}
for (const n of NODES) {
    addNode(n);
}
for (const a of ARROWS) {
    addArrow(a);
}

// 标题
elements.push(base("text", 40, 6, 900, 34, {
    id: "title",
    strokeColor: "#1971c2",
    fontSize: 26,
    fontFamily: 2,
    text: "星月小窝 · 网站流程总图（现状）",
    originalText: "星月小窝 · 网站流程总图（现状）",
    textAlign: "left",
    verticalAlign: "top",
    containerId: null,
    lineHeight: 1.25,
    roundness: null,
}));

elements.push(base("text", 1620, 6, 720, 40, {
    id: "legend",
    strokeColor: "#868e96",
    fontSize: 13,
    fontFamily: 2,
    text: "图例：蓝色=页面 ｜ 黄色=页面内元素/浮层 ｜ 紫色=外部服务/外链 ｜ 灰色虚线=说明或回退路径",
    originalText: "图例：蓝色=页面 ｜ 黄色=页面内元素/浮层 ｜ 紫色=外部服务/外链 ｜ 灰色虚线=说明或回退路径",
    textAlign: "left",
    verticalAlign: "top",
    containerId: null,
    lineHeight: 1.25,
    roundness: null,
}));

const scene = {
    type: "excalidraw",
    version: 2,
    source: "https://excalidraw.com",
    elements: elements,
    appState: {
        gridSize: null,
        viewBackgroundColor: "#ffffff",
    },
    files: {},
};

fs.writeFileSync(OUT, JSON.stringify(scene, null, 2), "utf8");

const stats = {
    节点: NODES.length,
    箭头: ARROWS.length,
    元素总数: elements.length,
};
console.log("✓ 已生成 " + path.relative(ROOT, OUT));
console.log("  " + JSON.stringify(stats, null, 0));

// 自检：能否重新解析 + 引用完整性（Excalidraw 导入时要靠这些引用）
const check = JSON.parse(fs.readFileSync(OUT, "utf8"));
const problems = [];

if (!Array.isArray(check.elements) || check.elements.length !== elements.length) {
    problems.push("元素数量不一致");
}

const ids = new Set();
for (const el of check.elements) {
    if (!el.id) {
        problems.push("有元素缺 id");
        continue;
    }
    if (ids.has(el.id)) {
        problems.push("id 重复：" + el.id);
    }
    ids.add(el.id);
}

for (const el of check.elements) {
    if (el.containerId && !ids.has(el.containerId)) {
        problems.push(el.id + " 的 containerId 指向不存在的元素：" + el.containerId);
    }
    for (const b of el.boundElements || []) {
        if (!ids.has(b.id)) {
            problems.push(el.id + " 绑定了不存在的元素：" + b.id);
        }
    }
    for (const key of ["startBinding", "endBinding"]) {
        const bind = el[key];
        if (bind && bind.elementId && !ids.has(bind.elementId)) {
            problems.push(el.id + " 的 " + key + " 指向不存在的元素：" + bind.elementId);
        }
    }
    if (el.type === "arrow" && (!Array.isArray(el.points) || el.points.length < 2)) {
        problems.push(el.id + " 缺少 points");
    }
}

if (problems.length > 0) {
    console.error("✗ 自检发现问题：");
    for (const p of problems.slice(0, 10)) {
        console.error("  - " + p);
    }
    process.exit(1);
}
console.log("✓ 自检通过（" + ids.size + " 个唯一元素 id、引用完整）");
