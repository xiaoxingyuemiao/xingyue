// ================================
// 星月小窝 2.0 —— 首页脚本
// ================================

// ---------- 页面元素 ----------

const authScreen = document.querySelector(".auth-screen");
const homeScreen = document.querySelector(".home-screen");

const sidebar = document.querySelector(".sidebar");
const sidebarToggle = document.querySelector("#sidebar-toggle");
const sidebarMenu = document.querySelector(".sidebar-menu");
const sidebarUser = document.querySelector("#sidebar-user");
const userAvatarEl = document.querySelector("#user-avatar");
const userNameEl = document.querySelector("#user-name");
const guestButton = document.querySelector(".guest-button");
const loginButton = document.querySelector("#auth-login");
const registerButton = document.querySelector("#auth-register");

const chatInput = document.querySelector(".chat-input input");
const sendButton = document.querySelector(".chat-input button");
const messageList = document.querySelector(".message-list");

const chatRoleBtn = document.querySelector("#chat-role-btn");
const rolePicker = document.querySelector("#role-picker");
const rolePickerList = document.querySelector("#role-picker-list");

// ---------- 侧边栏：展开 / 收起 ----------
// 默认收起（44px 窄条）：鼠标移到窄条上自动展开，移出后 0.1s 内自动收回；
// 点击图标可手动切换（手动展开后鼠标移出不会自动收回）。

let collapseTimer = null;
let manualExpanded = false;

// 鼠标正停在「关于」或其右侧子菜单上（此时不自动收起，见下面的子菜单逻辑）
let submenuHover = false;

sidebar.addEventListener("mouseenter", () => {
    // 悬停在收起后的窄条上才展开（没有 hover 到就不展开）
    manualExpanded = false;
    if (collapseTimer) {
        clearTimeout(collapseTimer);
        collapseTimer = null;
    }
    homeScreen.classList.remove("sidebar-collapsed");
});

// 取消收起定时器并立刻展开（鼠标进入侧边栏 / 「关于」子菜单时用）
function openSidebarNow() {
    if (collapseTimer) {
        clearTimeout(collapseTimer);
        collapseTimer = null;
    }
    homeScreen.classList.remove("sidebar-collapsed");
}

// 0.1s 内自动收回
function scheduleCollapse() {
    if (collapseTimer) {
        clearTimeout(collapseTimer);
    }
    collapseTimer = setTimeout(() => {
        homeScreen.classList.add("sidebar-collapsed");
        collapseTimer = null;
    }, 100);
}

sidebar.addEventListener("mouseleave", () => {
    if (manualExpanded || submenuHover) {
        return;
    }
    scheduleCollapse();
});

// ---------- 「关于」子菜单（右侧的角色列表）----------
// 子菜单弹在侧边栏右侧 6px 处（那道空隙由 CSS 的伪元素桥接）。
// 这里再兜一层：鼠标停在「关于」或子菜单上期间不收起侧边栏，
// 指针离开这块区域（超出角色选择框）才恢复 0.1s 自动收起。

const submenuParent = document.querySelector(".sidebar-item-parent");
const submenu = document.querySelector(".sidebar-submenu");

if (submenuParent && submenu) {
    const holdSidebar = () => {
        submenuHover = true;
        openSidebarNow();
    };

    const releaseSidebar = () => {
        submenuHover = false;
        // 稍等一下再判断：可能只是从「关于」跨到子菜单、或从子菜单跨回「关于」的路上
        setTimeout(() => {
            if (!submenuHover && !manualExpanded && !sidebar.matches(":hover")) {
                scheduleCollapse();
            }
        }, 120);
    };

    submenuParent.addEventListener("mouseenter", holdSidebar);
    submenuParent.addEventListener("mouseleave", releaseSidebar);
    submenu.addEventListener("mouseenter", holdSidebar);
    submenu.addEventListener("mouseleave", releaseSidebar);
}

sidebarToggle.addEventListener("click", () => {
    const collapsed = homeScreen.classList.contains("sidebar-collapsed");
    manualExpanded = collapsed; // 点击展开 → 手动保持；点击收起 → 恢复悬停自动
    homeScreen.classList.toggle("sidebar-collapsed");
    if (collapseTimer) {
        clearTimeout(collapseTimer);
        collapseTimer = null;
    }
});

// ---------- 侧边栏菜单 ----------

sidebarMenu.addEventListener("click", (event) => {
    const item = event.target.closest(".sidebar-item");
    if (!item) {
        return;
    }

    // "关于"本身不可点击（hover 展开子菜单）
    if (item.classList.contains("sidebar-item-parent")) {
        return;
    }

    const targets = {
        "menu-settings": "settings.html",
        "menu-live2d": "live2d.html",
        "menu-gallery": "chahua.html",
        "menu-merch": "zhoubian.html",
        "menu-news": "dongtai.html",
    };

    const url = targets[item.id];
    if (url) {
        event.preventDefault();
        window.location.href = url;
    }
});

// ---------- 用户区域：邮箱登录 / 用户设置 ----------

const authPanel = document.querySelector("#auth-panel");
const authPanelClose = document.querySelector("#auth-panel-close");
const authPanelTitle = document.querySelector("#auth-panel-title");
const authStepEmail = document.querySelector("#auth-step-email");
const authStepCode = document.querySelector("#auth-step-code");
const authStepDone = document.querySelector("#auth-step-done");
const authEmail = document.querySelector("#auth-email");
const authCode = document.querySelector("#auth-code");
const authSend = document.querySelector("#auth-send");
const authVerify = document.querySelector("#auth-verify");
const authResend = document.querySelector("#auth-resend");
const authSignout = document.querySelector("#auth-signout");
const authDoneMail = document.querySelector("#auth-done-mail");
const authMsg = document.querySelector("#auth-msg");
const userStatusEl = document.querySelector(".user-status");

// 记住刚发送验证码的邮箱（登录时用）
let pendingEmail = "";

function setAuthMsg(text, kind) {
    authMsg.textContent = text || "";
    authMsg.className = "auth-msg" + (kind ? " auth-msg-" + kind : "");
}

// 侧边栏太窄，邮箱显示成前 10 个字符 + 省略号（完整邮箱放 title）
function shortEmail(email) {
    const name = String(email || "").split("@")[0];
    return name.length > 10 ? name.slice(0, 10) + "…" : name;
}

// 根据登录状态切换面板内容
function renderAuthPanel() {
    const user = window.Auth.current();
    authPanelTitle.textContent = user ? "已登录" : (authPanelMode === "register" ? "邮箱注册" : "邮箱登录");
    authStepDone.hidden = !user;
    if (user) {
        authStepEmail.hidden = true;
        authStepCode.hidden = true;
        authDoneMail.textContent = user.email;
    } else if (pendingEmail) {
        authStepEmail.hidden = true;
        authStepCode.hidden = false;
    } else {
        authStepEmail.hidden = false;
        authStepCode.hidden = true;
    }
}

// 侧边栏签名排版：每行最多 6 个字符、最多两行；
// 超过两行的容量时，第 2 行的最后一个字符位置换成省略号
const SIGNATURE_LINE_CHARS = 6;
const SIGNATURE_LINE_MAX = 2;

function formatSignature(text) {
    const chars = Array.from(String(text || ""));
    const capacity = SIGNATURE_LINE_CHARS * SIGNATURE_LINE_MAX;

    let shown = chars;
    if (chars.length > capacity) {
        shown = chars.slice(0, capacity - 1).concat("…");
    }

    const lines = [];
    for (let i = 0; i < shown.length; i += SIGNATURE_LINE_CHARS) {
        lines.push(shown.slice(i, i + SIGNATURE_LINE_CHARS).join(""));
    }
    return { text: lines.join("\n"), lines: lines.length };
}

// 更新侧边栏底部的用户区域
function renderAuthState() {
    const user = window.Auth.current();
    const profile = window.Store.readJSON(window.Store.KEYS.user, null);
    const nickname = (profile && profile.nickname) || "";
    const signature = (profile && profile.signature) || "";

    // 名字下面：优先显示个性签名（每行 6 个字符、最多两行），
    // 没写签名时才回退到邮箱前缀（已登录）/「点击登录」
    if (signature) {
        const sig = formatSignature(signature);
        userStatusEl.textContent = sig.text;
        // 两行签名时整块往上挪一点点（见 home.css 的 .sidebar-user.two-lines）
        sidebarUser.classList.toggle("two-lines", sig.lines > 1);
    } else {
        sidebarUser.classList.remove("two-lines");
        userStatusEl.textContent = user ? shortEmail(user.email) : "点击登录";
    }

    // 名字太长会被省略号截断，完整信息放进 title 悬停可见
    if (user) {
        sidebarUser.title = (nickname ? nickname + " · " : "") + user.email + "（点击打开用户设置）";
    } else {
        sidebarUser.title = (nickname ? nickname + " · " : "") + "邮箱登录";
    }

    renderAuthPanel();
}

// 面板模式：login（登录）/ register（注册）——两者都是邮箱验证码流程，
// 区别只是标题与提示语（未注册的邮箱由 Supabase 自动创建账号）
let authPanelMode = "login";

function openAuthPanel(mode) {
    authPanelMode = mode === "register" ? "register" : "login";
    authPanel.hidden = false;
    setAuthMsg(authPanelMode === "register"
        ? "输入邮箱获取验证码，第一次登录会自动创建账号"
        : "");
    // 自动填入上次用过的邮箱
    if (!authEmail.value) {
        authEmail.value = window.Store.readJSON(window.Store.KEYS.lastEmail, "") || "";
    }
    renderAuthPanel();
    if (!window.Auth.isConfigured()) {
        setAuthMsg("还没配置 Supabase（见 assets/data/supabase-config.js）", "error");
    }
}

function closeAuthPanel() {
    authPanel.hidden = true;
    authCode.value = "";
    setAuthMsg("");
}

// 重发倒计时（Supabase 有 60 秒冷却，避免用户点了被报"太频繁"）
let resendTimer = null;

function startResendCountdown(seconds) {
    if (resendTimer) {
        clearInterval(resendTimer);
    }
    let left = seconds;
    authResend.disabled = true;
    authResend.textContent = "没收到？" + left + " 秒后可重发";
    resendTimer = setInterval(() => {
        left--;
        if (left <= 0) {
            clearInterval(resendTimer);
            resendTimer = null;
            authResend.disabled = false;
            authResend.textContent = "没收到？重新发送";
        } else {
            authResend.textContent = "没收到？" + left + " 秒后可重发";
        }
    }, 1000);
}

sidebarUser.addEventListener("click", () => {
    const user = window.Auth.current();
    if (user) {
        // 已登录 → 进入用户设置页
        window.location.href = "user.html";
    } else if (authPanel.hidden) {
        openAuthPanel();
    } else {
        closeAuthPanel();
    }
});

authPanelClose.addEventListener("click", closeAuthPanel);

// 第 1 步：发送验证码
authSend.addEventListener("click", async () => {
    const email = authEmail.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setAuthMsg("请输入正确的邮箱地址", "error");
        return;
    }
    authSend.disabled = true;
    authSend.textContent = "发送中……";
    try {
        await window.Auth.sendCode(email);
        pendingEmail = email;
        window.Store.writeJSON(window.Store.KEYS.lastEmail, email);
        setAuthMsg("验证码已发送到 " + email + "，请查收（可能在垃圾邮件里）", "ok");
        renderAuthPanel();
        authCode.focus();
        startResendCountdown(60);
    } catch (e) {
        setAuthMsg(e.message || "发送失败，请稍后再试", "error");
    } finally {
        authSend.disabled = false;
        authSend.textContent = "发送验证码";
    }
});

// 第 2 步：验证码登录
authVerify.addEventListener("click", async () => {
    // 验证码长度由 Supabase 决定（常见 6~8 位），这里放宽到 4~10 位
    const token = authCode.value.trim();
    if (!/^\d{4,10}$/.test(token)) {
        setAuthMsg("请输入邮件里的数字验证码", "error");
        return;
    }
    authVerify.disabled = true;
    authVerify.textContent = "验证中……";
    try {
        await window.Auth.verifyCode(pendingEmail || authEmail.value.trim(), token);
        pendingEmail = "";
        authCode.value = "";
        setAuthMsg("登录成功 ✓", "ok");
        if (resendTimer) {
            clearInterval(resendTimer);
            resendTimer = null;
            authResend.disabled = false;
            authResend.textContent = "没收到？重新发送";
        }
        // 让"登录成功"提示停留一下，再切成已登录状态
        setTimeout(() => {
            if (!authPanel.hidden) {
                renderAuthPanel();
            }
        }, 900);
    } catch (e) {
        setAuthMsg(e.message || "验证码不正确", "error");
        authCode.select();
    } finally {
        authVerify.disabled = false;
        authVerify.textContent = "登录";
    }
});

// 重新发送
authResend.addEventListener("click", () => {
    authSend.click();
});

// 回车键快捷操作
authEmail.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !authSend.disabled) {
        authSend.click();
    }
});

authCode.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !authVerify.disabled) {
        authVerify.click();
    }
});

// 退出登录
authSignout.addEventListener("click", async () => {
    if (!window.confirm("确定要退出登录吗？")) {
        return;
    }
    await window.Auth.signOut();
    setAuthMsg("已退出登录", "ok");
});

// 登录 / 退出时刷新界面
window.Auth.onChange(renderAuthState);

// 从本地读取用户信息（昵称 / 头像），没有就保持默认
function renderUserInfo() {
    const u = window.Store.readJSON(window.Store.KEYS.user, null);
    if (u && u.nickname) {
        userNameEl.textContent = u.nickname;
    }
    if (u && u.avatar) {
        userAvatarEl.textContent = u.avatar;
    }
}

// ---------- 起始屏：游客进入 / 登录 / 注册 ----------

// 隐藏起始屏、显示首页（三个入口共用）
function enterHomeScreen() {
    // 记录用户已经完成启动流程
    localStorage.setItem(window.Store.KEYS.visited, "true");

    authScreen.style.display = "none";
    homeScreen.style.display = "flex";
}

guestButton.addEventListener("click", () => {
    enterHomeScreen();
});

// 「登录」「注册」：直接进入首页并打开左下角的邮箱验证码面板（与侧边栏用户区同一个面板）
function startEmailAuth(mode) {
    enterHomeScreen();
    openAuthPanel(mode);
    // 面板在首页左下角，等页面显示后自动聚焦邮箱输入框
    setTimeout(() => {
        authEmail.focus();
    }, 50);
}

if (loginButton) {
    loginButton.addEventListener("click", () => {
        startEmailAuth("login");
    });
}

if (registerButton) {
    registerButton.addEventListener("click", () => {
        startEmailAuth("register");
    });
}

// ================================
// 设置（与设置页面共用 localStorage，读写统一走 assets/js/store.js）
// ================================

// 读取当前正在使用的 API 提供商（设置页面里添加并选择）
function getActiveProvider() {
    const store = window.Store.readSettings();
    return store.providers.find((p) => p.id === store.activeId) || store.providers[0] || null;
}

// ================================
// 聊天角色（输入框左侧按钮选择：官方星瑶/月瓷 + 我的角色）
// ================================

// 当前聊天角色：{ kind: "official"|"local", id: 角色id(官方为null), name: 名字 }
function getChatRole() {
    return window.Store.readChatRole();
}

function saveChatRole(role) {
    window.Store.writeChatRole(role);
}

// 当前角色的显示名（聊天气泡用）
function getChatRoleName() {
    const role = getChatRole();
    if (role.kind === "official") {
        return role.name;
    }
    const r = window.Store.findRole(role.id);
    return (r && r.name) || "星瑶";
}

// 当前角色的会话 id（不同角色各自的对话历史）
function getActiveRoleId() {
    const role = getChatRole();
    return role.kind === "official" ? "official-" + role.name : role.id;
}

// 聊天用的 System Prompt：跟随当前选择的聊天角色
async function getActiveSystemPrompt() {
    const role = getChatRole();

    if (role.kind === "official") {
        return getOfficialRolePrompt(role.name);
    }

    const r = window.Store.findRole(role.id);
    return (r && r.prompt) || "";
}

// 读取官方角色的设定（站长在后台 assets/data/official-roles.js 维护，
// 通过 <script> 标签加载，本地双击打开和线上部署都能读取）
async function getOfficialRolePrompt(name) {
    const r = getOfficialRole(name);
    return (r && r.prompt) || "";
}

// 官方角色配置（assets/data/official-roles.js）
function getOfficialRole(name) {
    const roles = window.OFFICIAL_ROLES && Array.isArray(window.OFFICIAL_ROLES.roles)
        ? window.OFFICIAL_ROLES.roles
        : [];
    return roles.find((x) => x.name === name) || null;
}

// 当前聊天角色对应的模型名：
// 官方角色 → official-roles.js 的 model 字段；我的角色 → 设置页的模型字段；
// 支持：模型名（如 default）、在线 URL、本地导入（custom:）
// 留空 / 填错 / 未配置时自动用 default
function getRoleModelName() {
    const role = getChatRole();
    let modelName = "";

    if (role.kind === "official") {
        const r = getOfficialRole(role.name);
        modelName = r ? r.model : "";
    } else {
        const r = window.Store.findRole(role.id);
        modelName = r ? r.model : "";
    }

    if (Live2D.MODEL_NAMES.indexOf(modelName) >= 0) {
        return modelName;
    }
    // 自定义模型（在线 URL / 本地导入）：注册名为 custom-<角色id>
    if (modelName && role.kind === "local") {
        const customName = "custom-" + role.id;
        if (Live2D.MODEL_NAMES.indexOf(customName) >= 0) {
            return customName;
        }
    }
    return "default";
}

// ================================
// 角色选择面板（输入框左侧按钮打开）
// ================================

function openRolePicker() {
    renderRolePicker();
    rolePicker.hidden = false;
}

function closeRolePicker() {
    rolePicker.hidden = true;
}

chatRoleBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    if (rolePicker.hidden) {
        openRolePicker();
    } else {
        closeRolePicker();
    }
});

// 点击面板外部区域关闭
document.addEventListener("click", (event) => {
    if (rolePicker.hidden) {
        return;
    }
    if (rolePicker.contains(event.target) || chatRoleBtn.contains(event.target)) {
        return;
    }
    closeRolePicker();
});

// 选中角色：保存 → 关闭面板 → 加载该角色的对话历史 → 切换 Live2D 模型
function pickRole(role) {
    saveChatRole({ kind: role.kind, id: role.id, name: role.name });
    closeRolePicker();
    chatHistory = loadChat();
    renderBubble();
    // Live2D：模型跟随角色切换（角色配置了模型就切，否则用 default）
    Live2D.switchModel(getRoleModelName());
}

function renderRolePicker() {
    rolePickerList.innerHTML = "";
    const current = getChatRole();

    // 官方角色（星瑶、月瓷 在最上面）：avatar 是名字左边的头像
    const officialRoles = [
        { name: "星瑶", avatar: "images/xingyao-avatar.jpg" },
        { name: "月瓷", avatar: "images/yueci-avatar.jpg" },
    ].map((r) => ({
        kind: "official",
        id: null,
        name: r.name,
        avatar: r.avatar,
    }));

    // 我的角色（按创建顺序）
    const localRoles = window.Store.readSettings().roles;
    const localItems = localRoles.map((r) => ({
        kind: "local",
        id: r.id,
        name: r.name,
    }));

    const isCurrent = (x) =>
        x.kind === current.kind &&
        (x.kind === "official" ? x.name === current.name : x.id === current.id);

    // 1) 当前选中的角色排到最上面
    const currentItem = [...officialRoles, ...localItems].find(isCurrent);
    if (currentItem) {
        rolePickerList.appendChild(roleItemEl(currentItem, true));
    }

    // 2) 官方角色
    const officialRest = officialRoles.filter((x) => !isCurrent(x));
    if (officialRest.length > 0) {
        rolePickerList.appendChild(groupTitle("官方角色"));
        for (const r of officialRest) {
            rolePickerList.appendChild(roleItemEl(r, false));
        }
    }

    // 3) 我的角色
    const localRest = localItems.filter((x) => !isCurrent(x));
    if (localRest.length > 0) {
        rolePickerList.appendChild(groupTitle("我的角色"));
        for (const r of localRest) {
            rolePickerList.appendChild(roleItemEl(r, false));
        }
    }

    // 4) 添加人物（跳转角色设定页面）
    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "role-picker-item role-picker-add";
    const addText = document.createElement("span");
    addText.textContent = "添加人物";
    const addIcon = document.createElement("span");
    addIcon.className = "role-picker-add-icon";
    addIcon.textContent = "＋";
    addBtn.appendChild(addText);
    addBtn.appendChild(addIcon);
    addBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        window.location.href = "settings.html#role";
    });
    rolePickerList.appendChild(addBtn);
}

function groupTitle(text) {
    const div = document.createElement("div");
    div.className = "role-picker-group-title";
    div.textContent = text;
    return div;
}

function roleItemEl(role, active) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "role-picker-item" + (active ? " active" : "");

    // 有头像的角色（官方角色）：头像排在名字左边，把名字往右推
    if (role.avatar) {
        const avatar = document.createElement("img");
        avatar.className = "role-picker-avatar";
        avatar.src = role.avatar;
        avatar.alt = "";
        btn.appendChild(avatar);
    }

    const nameSpan = document.createElement("span");
    nameSpan.className = "role-picker-name";
    nameSpan.textContent = role.name;
    btn.appendChild(nameSpan);

    if (active) {
        const mark = document.createElement("span");
        mark.textContent = "✓";
        btn.appendChild(mark);
    }

    btn.addEventListener("click", (event) => {
        event.stopPropagation();
        pickRole(role);
    });
    return btn;
}

// ================================
// Live2D 管理器
// （oh-my-live2d SDK，支持 Cubism 2 / 4 / 5 各版本模型；
//   封装了加载 / 切换 / 情绪动作，个别 API 不可用时优雅降级）
// ================================

// 解析回复开头的情绪标记：【情绪：开心】正文……
function parseEmotion(reply) {
    const match = reply.match(/^【情绪[:：]([^】]+)】/);
    if (match) {
        return {
            emotion: match[1].trim(),
            text: reply.slice(match[0].length).trim(),
        };
    }
    return { emotion: null, text: reply };
}

// 历史对话保留对数（设置页可调整，默认 3 对）
function getChatKeepPairs() {
    return window.Store.readPrefs().chatKeepPairs;
}

// ================================
// 聊天（按角色会话分组存储：不同角色有各自的对话历史）
// ================================

// 当前角色的会话消息（完整保存在浏览器本地，隐私数据不会上传）
let chatHistory = loadChat();

// 旧版本的三条示例对话不再需要，自动清掉
function cleanLegacy(list) {
    const LEGACY_DEFAULT = JSON.stringify([
        { name: "星瑶", text: "小喵回来啦？", isUser: false },
        { name: "小喵", text: "嗯嗯！", isUser: true },
        { name: "星瑶", text: "那就陪我待一会儿吧～", isUser: false },
    ]);
    if (list.length === 3 && JSON.stringify(list) === LEGACY_DEFAULT) {
        return [];
    }
    return list;
}

function loadChat() {
    // 旧格式（无分组数组）→ 迁移到当前角色的会话
    const legacy = window.Store.readLegacyChat();
    if (legacy) {
        const list = cleanLegacy(legacy);
        window.Store.setSession(getActiveRoleId(), list);
        return list;
    }
    return cleanLegacy(window.Store.getSession(getActiveRoleId()));
}

function saveChat() {
    window.Store.setSession(getActiveRoleId(), chatHistory);
}

// 追加一条消息气泡（不写入历史）
function appendMessageElement(name, text, isUser) {
    const message = document.createElement("div");
    message.className = "message " + (isUser ? "message-user" : "message-character");

    const nameEl = document.createElement("div");
    nameEl.className = "message-name";
    nameEl.textContent = name;

    const bubble = document.createElement("div");
    bubble.className = "message-bubble";
    bubble.textContent = text;

    message.appendChild(nameEl);
    message.appendChild(bubble);
    messageList.appendChild(message);

    return message;
}

// ================================
// 常驻气泡：展示最近的若干轮完整对话（你说的话 + 角色的回复）
// 电脑端：2 轮（第 3 轮出现时第 1 轮滑出）
// 手机端：1 轮，显示 10 秒后自动消失
// ================================

// 电脑端展示的对话轮数（想多显示几轮改这里）
const DESKTOP_ROUNDS = 2;

// 手机端判定（与 CSS 的移动端断点保持一致）
function isMobileView() {
    return window.matchMedia("(max-width: 768px)").matches;
}

// 最近 N 轮对话，按时间顺序摊平返回
// （一轮 = 一条用户消息 + 紧跟的角色回复）
function latestRounds(count) {
    const rounds = [];
    let i = chatHistory.length - 1;

    while (i >= 0 && rounds.length < count) {
        // 末尾还没被回复的用户消息：跳过
        if (chatHistory[i].isUser) {
            i--;
            continue;
        }
        const reply = chatHistory[i];
        const round = [];
        if (i > 0 && chatHistory[i - 1].isUser) {
            round.push(chatHistory[i - 1]); // 你说的话
            i -= 2;
        } else {
            i -= 1;
        }
        round.push(reply); // 角色的回复
        rounds.unshift(round);
    }

    return rounds.flat();
}

let bubbleTimer = null;

// 渲染气泡（新一轮上滑顶掉最旧一轮）
function renderBubble() {
    if (bubbleTimer) {
        clearTimeout(bubbleTimer);
        bubbleTimer = null;
    }

    messageList.innerHTML = "";

    const mobile = isMobileView();
    const msgs = latestRounds(mobile ? 1 : DESKTOP_ROUNDS);
    if (msgs.length === 0) {
        return;
    }

    // 只有最后两条（最新一轮）播放入场动画，更早的静止显示
    const animateFrom = Math.max(0, msgs.length - 2);

    msgs.forEach((m, i) => {
        const el = appendMessageElement(m.name, m.text, m.isUser);
        if (i >= animateFrom) {
            el.style.animationDelay = (i - animateFrom) * 90 + "ms";
        } else {
            el.classList.add("message-static");
        }
    });

    // 手机端：10 秒后自动消失（上滑淡出）
    if (mobile) {
        bubbleTimer = setTimeout(() => {
            for (const el of Array.from(messageList.children)) {
                el.classList.add("message-fade-out");
            }
            setTimeout(() => {
                messageList.innerHTML = "";
            }, 400);
        }, 10000);
    }
}

// 写入历史并刷新气泡
function addMessage(name, text, isUser) {
    chatHistory.push({ name, text, isUser });
    saveChat();
    // 只有角色回复才刷新气泡：一轮对话在角色回复后整体显示
    if (!isUser) {
        renderBubble();
    }
}

function sendMessage() {
    const text = chatInput.value.trim();
    if (text === "") {
        return;
    }

    chatInput.value = "";
    addMessage("小喵", text, true);
    askCharacter();
}

// 让星瑶回答（调用当前选择的 API 提供商 + 当前角色设定）
async function askCharacter() {
    const provider = getActiveProvider();

    // 没配置秘钥时给个提示
    if (!provider || !provider.apiKey) {
        addMessage(getChatRoleName(), "还没有配置 API 秘钥哦～去「设置」页面添加一个 API Key，就能和我聊天啦！", false);
        return;
    }

    // 组装消息：当前角色设定（附加情绪规则）+ 最近 N 对对话作为上下文
    // （历史全部保留在本地，这里只决定带多少给模型）
    const basePrompt = await getActiveSystemPrompt();
    const systemPrompt = basePrompt +
        "\n\n【情绪规则】每次回复的开头先用【情绪：X】标记你此刻的情绪（X 从：开心、难过、生气、害羞、惊讶、委屈、平静 中选择一个），随后才是回复内容。例如：【情绪：开心】今天天气不错呀。";

    const messages = [
        { role: "system", content: systemPrompt },
        ...chatHistory.slice(-getChatKeepPairs() * 2).map((m) => ({
            role: m.isUser ? "user" : "assistant",
            content: m.text,
        })),
    ];

    try {
        const response = await fetch(provider.baseUrl.replace(/\/+$/, "") + "/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + provider.apiKey,
            },
            body: JSON.stringify({
                model: provider.model,
                messages: messages,
                temperature: 0.8,
                max_tokens: 512,
            }),
        });

        if (!response.ok) {
            throw new Error("HTTP " + response.status);
        }

        const data = await response.json();
        const reply = data.choices?.[0]?.message?.content?.trim() || "……（没有收到回复）";

        // 解析情绪标记（正文去掉标记显示）
        const parsed = parseEmotion(reply);
        addMessage(getChatRoleName(), parsed.text || "……", false);
        // Live2D：播放情绪对应的表情/动作
        if (parsed.emotion) {
            Live2D.playEmotion(parsed.emotion);
        }
    } catch (error) {
        addMessage(getChatRoleName(), "呜……连接失败了（" + error.message + "）。去「设置」页面检查一下 API 配置吧～", false);
    }
}

sendButton.addEventListener("click", sendMessage);
chatInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        sendMessage();
    }
});

// ================================
// 启动流程（无开场动画）
// ================================

renderBubble();
renderUserInfo();

// 登录状态：先按本地凭证渲染一次，再异步刷新过期凭证
renderAuthState();
window.Auth.init();

// 页面长时间挂着时，定期续期登录凭证（每 30 分钟）
setInterval(() => {
    if (window.Auth.current()) {
        window.Auth.refresh();
    }
}, 30 * 60 * 1000);

// 初始化 Live2D（异步加载默认模型，不影响页面进入）
Live2D.init();

// 检查用户是否第一次访问网站
const isFirstVisit = localStorage.getItem(window.Store.KEYS.visited);

if (isFirstVisit === null) {
    // 第一次访问：直接显示登录页
    console.log("🌙 第一次来到星月小窝");
    authScreen.style.display = "flex";
} else {
    // 老用户：直接进入首页
    console.log("🌙 欢迎回来");
    homeScreen.style.display = "flex";
}
