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

const chatInput = document.querySelector(".chat-input input");
// 发送按钮必须按 id 取：.chat-input 里第一个 button 是角色按钮（#chat-role-btn），
// 用 querySelector(".chat-input button") 会拿到角色按钮，导致点 ➤ 不发送、点角色按钮反而发消息
const sendButton = document.querySelector("#chat-send");
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

// ---------- 用户区域：登录状态 / 个人中心 ----------

// 更新侧边栏底部的用户区域：只展示「头像 + 名字」
// 名字优先用用户设的昵称，没设过就用默认名（小窝第 N 成员）；未登录显示「点击登录」
function renderAuthState() {
    const user = window.Auth.current();
    const profile = window.Store.readJSON(window.Store.KEYS.user, null);
    const nickname = (profile && profile.nickname) || "";

    if (nickname) {
        userNameEl.textContent = nickname;
    } else if (user) {
        userNameEl.textContent = window.Auth.defaultDisplayName();
    } else {
        userNameEl.textContent = "点击登录";
    }

    // 不设 title：鼠标移到左下角用户栏时不再弹出提示框
    sidebarUser.removeAttribute("title");
}

sidebarUser.addEventListener("click", () => {
    const user = window.Auth.current();
    if (user) {
        // 已登录 → 进入个人中心（个人资料 + 设置）
        window.location.href = "user.html";
    } else {
        // 未登录（包括游客进入的）→ 回到起始屏，停在"登录"卡
        authScreen.style.display = "flex";
        showAuthCard("login");
        setCardMsg(loginMsg, "");
    }
});

// 登录 / 退出时刷新界面
// 登录 / 退出时刷新界面；登录成功后顺带拉一次云端资料
window.Auth.onChange(() => {
    renderAuthState();
    if (window.Auth.current()) {
        syncFromCloud();
    }
});

// 头像可能是 emoji 文字（默认 🐱），也可能是用户上传的图片（DataURL）。
// 异常值（既不是图片、也不像短 emoji）一律回退默认，避免显示出一长串乱码
function renderAvatar(el, avatar) {
    const value = String(avatar || "");

    if (value.indexOf("data:image") === 0) {
        el.textContent = "";
        el.style.backgroundImage = "url(" + value + ")";
        el.style.backgroundSize = "cover";
        el.style.backgroundPosition = "center";
        return;
    }

    el.style.backgroundImage = "";
    el.textContent = (value && Array.from(value).length <= 4) ? value : "🐱";
}

// 从本地读取头像（名字由 renderAuthState 负责）
function renderUserInfo() {
    const u = window.Store.readJSON(window.Store.KEYS.user, null);
    renderAvatar(userAvatarEl, u && u.avatar);
}

// 换账号时，先清掉上一个账号留在本机的数据（否则会"串台"）
// 只在「上一个账号 != 当前账号」时清；首次登录不动本地（游客时期的数据可以带进账号）
function clearPreviousAccountData() {
    const keys = window.Store.KEYS;
    for (const k of [keys.user, keys.uid, keys.chat, keys.chatRole, keys.settings, keys.memberNo]) {
        try {
            localStorage.removeItem(k);
        } catch (e) {
            // 忽略
        }
    }
    chatHistory = loadChat();
    renderBubble();
    renderUserInfo();
    renderAuthState();
}

// 登录后从云端同步一次：资料（uid / 昵称 / 头像 / 签名）+ 设置 + 对话记录
// 本地只是缓存，云端才是"跟着账号走"的那一份
async function syncFromCloud() {
    if (!window.Cloud || !window.Cloud.isReady()) {
        return;
    }

    const user = window.Auth.current();
    const lastUserId = window.Store.readJSON(window.Store.KEYS.lastUser, "");

    // 0. 换账号了？先把上一个账号的本地残留清掉
    if (user && user.user_id && lastUserId && lastUserId !== user.user_id) {
        console.log("🔁 检测到换账号，已清掉上一个账号的本地数据");
        clearPreviousAccountData();
    }
    if (user && user.user_id) {
        window.Store.writeJSON(window.Store.KEYS.lastUser, user.user_id);
    }

    // 1. 资料
    try {
        const p = await window.Cloud.profile();
        if (p) {
            if (p.uid) {
                window.Store.writeJSON(window.Store.KEYS.uid, p.uid);
            }
            const local = window.Store.readJSON(window.Store.KEYS.user, null) || {};
            window.Store.writeJSON(window.Store.KEYS.user, {
                nickname: p.nickname || local.nickname || "",
                avatar: p.avatar || local.avatar || "🐱",
                signature: p.signature || local.signature || "",
            });
            renderUserInfo();
            renderAuthState();
            console.log("☁️ 云端资料已同步（uid: " + p.uid + "）");
        } else {
            console.warn("云端没有这个账号的资料行（可执行 tools/supabase-schema.sql 里的「补齐历史用户」）");
        }
    } catch (e) {
        console.warn("云端资料同步失败（不影响本地使用）：", e);
    }

    // 2. 设置（API 提供商 + 我的角色 + 秘钥）
    try {
        await window.Cloud.pullSettings();
        renderRolePickerSoon();
    } catch (e) {
        console.warn("云端设置同步失败：", e);
    }

    // 3. 对话记录：云端有、本地没有的角色直接拿过来（本地已有内容的以本地为准，避免覆盖新消息）
    try {
        const cloudSessions = await window.Cloud.sessions();
        if (cloudSessions) {
            const local = window.Store.readSessions();
            let changed = false;
            for (const roleId of Object.keys(cloudSessions)) {
                const msgs = cloudSessions[roleId];
                if (Array.isArray(msgs) && msgs.length > 0 && (!Array.isArray(local[roleId]) || local[roleId].length === 0)) {
                    local[roleId] = msgs;
                    changed = true;
                }
            }
            if (changed) {
                window.Store.writeSessions(local);
                chatHistory = loadChat();
                renderBubble();
                console.log("☁️ 云端对话记录已同步");
            }
        }
    } catch (e) {
        console.warn("云端对话同步失败：", e);
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

// ================================
// 起始屏：三张卡（登录 / 注册 / 找回密码）
// 进入网站直接显示登录卡；登录支持邮箱+密码、邮箱+验证码两种方式
// ================================

const authCards = {
    login: document.querySelector("#start-step-login"),
    register: document.querySelector("#start-step-register"),
    forgot: document.querySelector("#start-step-forgot"),
};

// ---- 登录卡 ----
const loginEmail = document.querySelector("#login-email");
const loginPassword = document.querySelector("#login-password");
const loginModePassword = document.querySelector("#login-mode-password");
const loginModeCode = document.querySelector("#login-mode-code");
const loginCode = document.querySelector("#login-code");
const loginSend = document.querySelector("#login-send");
const loginSubmit = document.querySelector("#login-submit");
const loginSwitch = document.querySelector("#login-switch");
const loginForgot = document.querySelector("#login-forgot");
const loginToRegister = document.querySelector("#login-to-register");
const loginMsg = document.querySelector("#login-msg");

// ---- 注册卡 ----
const regEmail = document.querySelector("#reg-email");
const regPassword = document.querySelector("#reg-password");
const regPassword2 = document.querySelector("#reg-password2");
const regCode = document.querySelector("#reg-code");
const regSend = document.querySelector("#reg-send");
const regSubmit = document.querySelector("#reg-submit");
const regToLogin = document.querySelector("#reg-to-login");
const regMsg = document.querySelector("#reg-msg");

// ---- 找回密码卡 ----
const fgEmail = document.querySelector("#fg-email");
const fgCode = document.querySelector("#fg-code");
const fgSend = document.querySelector("#fg-send");
const fgPassword = document.querySelector("#fg-password");
const fgPassword2 = document.querySelector("#fg-password2");
const fgSubmit = document.querySelector("#fg-submit");
const fgBack = document.querySelector("#fg-back");
const fgMsg = document.querySelector("#fg-msg");

// 状态
let loginUseCode = false;   // 登录方式：false = 密码，true = 验证码
const resendTimers = { login: null, reg: null, forgot: null };

function isEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || "").trim());
}

// 密码规则：至少 8 位，且同时包含字母和数字
function passwordProblem(pwd) {
    const value = String(pwd || "");
    if (value.length < 8) {
        return "密码至少 8 位";
    }
    if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) {
        return "密码要同时包含字母和数字";
    }
    return "";
}

// ---------- 密码框：小眼睛（显示 / 隐藏）+ 实时规则提示 ----------

// 线条风格的眼睛图标（和浏览器原生那个观感一致）
const EYE_OPEN_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">' +
    '<path d="M2.5 12S6 6.6 12 6.6 21.5 12 21.5 12 18 17.4 12 17.4 2.5 12 2.5 12z"/>' +
    '<circle cx="12" cy="12" r="2.6"/></svg>';

const EYE_CLOSED_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">' +
    '<path d="M2.5 12S6 6.6 12 6.6 21.5 12 21.5 12 18 17.4 12 17.4 2.5 12 2.5 12z"/>' +
    '<circle cx="12" cy="12" r="2.6"/>' +
    '<line x1="4" y1="20" x2="20" y2="4"/></svg>';

// 小眼睛：点击切换明文 / 密文
for (const eye of document.querySelectorAll(".auth-eye")) {
    eye.innerHTML = EYE_OPEN_SVG;
    eye.addEventListener("click", () => {
        const input = document.getElementById(eye.dataset.target);
        if (!input) {
            return;
        }
        const show = input.type === "password";
        input.type = show ? "text" : "password";
        eye.innerHTML = show ? EYE_CLOSED_SVG : EYE_OPEN_SVG;
        eye.setAttribute("aria-label", show ? "隐藏密码" : "显示密码");
        input.focus();
    });
}

// 实时校验（规则 / 一致性）：
//   不符合 → 下面出现一行 ✗ 提示，输入框描红
//   符合   → 提示行隐藏、输入框描绿
function applyPasswordCheck(input, hintEl, ok) {
    if (ok) {
        hintEl.hidden = true;
        hintEl.textContent = "";
        input.classList.add("auth-input-ok");
        input.classList.remove("auth-input-bad");
    } else {
        hintEl.hidden = false;
        input.classList.add("auth-input-bad");
        input.classList.remove("auth-input-ok");
    }
}

function clearPasswordCheck(input, hintEl) {
    hintEl.hidden = true;
    hintEl.textContent = "";
    input.classList.remove("auth-input-ok", "auth-input-bad");
}

// 规则校验：至少 8 位、含字母和数字
function watchPasswordRule(input, hintEl) {
    if (!input || !hintEl) {
        return;
    }
    input.addEventListener("input", () => {
        if (!input.value) {
            clearPasswordCheck(input, hintEl);
            return;
        }
        const problem = passwordProblem(input.value);
        if (problem) {
            hintEl.className = "auth-hint auth-hint-bad";
            hintEl.textContent = "✗ " + problem;
            applyPasswordCheck(input, hintEl, false);
        } else {
            applyPasswordCheck(input, hintEl, true);
        }
    });
}

// 一致性校验：两次输入是否相同
function watchPasswordMatch(input, otherInput, hintEl) {
    if (!input || !otherInput || !hintEl) {
        return;
    }
    const check = () => {
        if (!input.value) {
            clearPasswordCheck(input, hintEl);
            return;
        }
        if (input.value === otherInput.value) {
            applyPasswordCheck(input, hintEl, true);
        } else {
            hintEl.className = "auth-hint auth-hint-bad";
            hintEl.textContent = "✗ 两次输入的密码不一样";
            applyPasswordCheck(input, hintEl, false);
        }
    };
    input.addEventListener("input", check);
    otherInput.addEventListener("input", check);
}

// 注册卡 + 找回密码卡的实时提示
watchPasswordRule(regPassword, document.querySelector("#reg-password-hint"));
watchPasswordMatch(regPassword2, regPassword, document.querySelector("#reg-password2-hint"));
watchPasswordRule(fgPassword, document.querySelector("#fg-password-hint"));
watchPasswordMatch(fgPassword2, fgPassword, document.querySelector("#fg-password2-hint"));

function setCardMsg(el, text, kind) {
    el.textContent = text || "";
    el.className = "auth-msg" + (kind ? " auth-msg-" + kind : "");
}

function rememberEmail(email) {
    window.Store.writeJSON(window.Store.KEYS.lastEmail, email);
}

function lastEmail() {
    return window.Store.readJSON(window.Store.KEYS.lastEmail, "") || "";
}

// 切换显示的卡片
function showAuthCard(name) {
    for (const key of Object.keys(authCards)) {
        authCards[key].hidden = key !== name;
    }
    if (name === "login") {
        if (!loginEmail.value) {
            loginEmail.value = lastEmail();
        }
        loginEmail.focus();
    } else if (name === "register") {
        regEmail.focus();
    } else if (name === "forgot") {
        if (!fgEmail.value) {
            fgEmail.value = lastEmail();
        }
        fgEmail.focus();
    }
}

// 通用的重发倒计时（按钮上显示剩余秒数）
function startResendCountdown(key, btn, normalText) {
    if (resendTimers[key]) {
        clearInterval(resendTimers[key]);
    }
    let left = 60;
    btn.disabled = true;
    btn.textContent = left + "s";
    resendTimers[key] = setInterval(() => {
        left--;
        if (left <= 0) {
            clearInterval(resendTimers[key]);
            resendTimers[key] = null;
            btn.disabled = false;
            btn.textContent = normalText;
        } else {
            btn.textContent = left + "s";
        }
    }, 1000);
}

// 登录成功后统一收尾
function authSuccess(text, msgEl) {
    setCardMsg(msgEl, text + " ✓ 正在进入……", "ok");
    setTimeout(enterHomeScreen, 600);
}

// ---------- 游客进入（登录卡底部的文字链接）----------

guestButton.addEventListener("click", () => {
    enterHomeScreen();
});

// ---------- 登录卡：两种方式切换 ----------

function applyLoginMode() {
    loginModePassword.hidden = loginUseCode;
    loginModeCode.hidden = !loginUseCode;
    loginSwitch.textContent = loginUseCode ? "改用密码登录" : "改用验证码登录";
}

loginSwitch.addEventListener("click", () => {
    loginUseCode = !loginUseCode;
    applyLoginMode();
    setCardMsg(loginMsg, "");
});

// 发送验证码（登录用）
loginSend.addEventListener("click", async () => {
    const email = loginEmail.value.trim();
    if (!isEmail(email)) {
        setCardMsg(loginMsg, "请输入正确的邮箱地址", "error");
        return;
    }
    loginSend.disabled = true;
    loginSend.textContent = "…";
    try {
        await window.Auth.sendCode(email);
        rememberEmail(email);
        setCardMsg(loginMsg, "验证码已发送到 " + email + "，请查收（可能在垃圾邮件里）", "ok");
        loginCode.focus();
        startResendCountdown("login", loginSend, "发送");
    } catch (e) {
        setCardMsg(loginMsg, e.message || "发送失败，请稍后再试", "error");
        loginSend.disabled = false;
        loginSend.textContent = "发送";
    }
});

// 登录提交
loginSubmit.addEventListener("click", async () => {
    const email = loginEmail.value.trim();
    if (!isEmail(email)) {
        setCardMsg(loginMsg, "请输入正确的邮箱地址", "error");
        return;
    }

    loginSubmit.disabled = true;
    loginSubmit.textContent = "登录中……";
    try {
        if (loginUseCode) {
            const token = loginCode.value.trim();
            if (!/^\d{4,10}$/.test(token)) {
                throw new Error("请输入邮件里的数字验证码");
            }
            await window.Auth.verifyCode(email, token);
            rememberEmail(email);
        } else {
            const password = loginPassword.value;
            if (!password) {
                throw new Error("请输入密码（也可以改用验证码登录）");
            }
            await window.Auth.signInWithPassword(email, password);
            rememberEmail(email);
        }
        loginPassword.value = "";
        loginCode.value = "";
        authSuccess("登录成功", loginMsg);
    } catch (e) {
        setCardMsg(loginMsg, e.message || "登录失败，请检查邮箱和密码", "error");
    } finally {
        loginSubmit.disabled = false;
        loginSubmit.textContent = "登录";
    }
});

// 回车提交
for (const el of [loginEmail, loginPassword, loginCode]) {
    el.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            loginSubmit.click();
        }
    });
}

loginForgot.addEventListener("click", () => {
    showAuthCard("forgot");
    setCardMsg(fgMsg, "");
});

loginToRegister.addEventListener("click", () => {
    showAuthCard("register");
    setCardMsg(regMsg, "");
    if (!regEmail.value && loginEmail.value.trim()) {
        regEmail.value = loginEmail.value.trim();
    }
});

// ---------- 注册卡 ----------

// 发送注册验证码（创建账号 + 发确认码）
regSend.addEventListener("click", async () => {
    const email = regEmail.value.trim();
    const pwd = regPassword.value;
    const pwd2 = regPassword2.value;

    if (!isEmail(email)) {
        setCardMsg(regMsg, "请输入正确的邮箱地址", "error");
        return;
    }
    const problem = passwordProblem(pwd);
    if (problem) {
        setCardMsg(regMsg, problem, "error");
        return;
    }
    if (pwd !== pwd2) {
        setCardMsg(regMsg, "两次输入的密码不一样，请检查", "error");
        return;
    }

    regSend.disabled = true;
    regSend.textContent = "…";
    try {
        const result = await window.Auth.signUp(email, pwd);
        rememberEmail(email);
        if (result.needVerify === false) {
            // 项目没开邮箱确认，注册即登录
            authSuccess("注册成功", regMsg);
            return;
        }
        setCardMsg(regMsg, "验证码已发送到 " + email + "，请填入后点「注册」", "ok");
        regCode.focus();
        startResendCountdown("reg", regSend, "发送");
    } catch (e) {
        setCardMsg(regMsg, e.message || "发送失败，请稍后再试", "error");
        regSend.disabled = false;
        regSend.textContent = "发送";
    }
});

// 注册提交（用验证码完成注册）
regSubmit.addEventListener("click", async () => {
    const email = regEmail.value.trim();
    const token = regCode.value.trim();

    if (!isEmail(email)) {
        setCardMsg(regMsg, "请输入正确的邮箱地址", "error");
        return;
    }
    const problem = passwordProblem(regPassword.value);
    if (problem) {
        setCardMsg(regMsg, problem, "error");
        return;
    }
    if (regPassword.value !== regPassword2.value) {
        setCardMsg(regMsg, "两次输入的密码不一样，请检查", "error");
        return;
    }
    if (!/^\d{4,10}$/.test(token)) {
        setCardMsg(regMsg, "请先点「发送」获取验证码，再填入邮件里的验证码", "error");
        return;
    }

    regSubmit.disabled = true;
    regSubmit.textContent = "注册中……";
    try {
        await window.Auth.verifySignup(email, token);
        authSuccess("注册成功", regMsg);
    } catch (e) {
        setCardMsg(regMsg, e.message || "注册失败，请检查验证码", "error");
    } finally {
        regSubmit.disabled = false;
        regSubmit.textContent = "注册";
    }
});

for (const el of [regEmail, regPassword, regPassword2, regCode]) {
    el.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            regSubmit.click();
        }
    });
}

regToLogin.addEventListener("click", () => {
    showAuthCard("login");
    setCardMsg(loginMsg, "");
    if (!loginEmail.value && regEmail.value.trim()) {
        loginEmail.value = regEmail.value.trim();
    }
});

// ---------- 找回密码卡 ----------

fgSend.addEventListener("click", async () => {
    const email = fgEmail.value.trim();
    if (!isEmail(email)) {
        setCardMsg(fgMsg, "请输入邮箱", "error");
        return;
    }
    fgSend.disabled = true;
    fgSend.textContent = "…";
    try {
        await window.Auth.sendRecovery(email);
        rememberEmail(email);
        setCardMsg(fgMsg, "验证码已发送到 " + email + "，请查收（可能在垃圾邮件里）", "ok");
        fgCode.focus();
        startResendCountdown("forgot", fgSend, "发送");
    } catch (e) {
        setCardMsg(fgMsg, e.message || "发送失败，请稍后再试", "error");
        fgSend.disabled = false;
        fgSend.textContent = "发送";
    }
});

fgSubmit.addEventListener("click", async () => {
    const email = fgEmail.value.trim();
    const token = fgCode.value.trim();

    if (!isEmail(email)) {
        setCardMsg(fgMsg, "请输入邮箱", "error");
        return;
    }
    if (!/^\d{4,10}$/.test(token)) {
        setCardMsg(fgMsg, "请输入邮件里的数字验证码", "error");
        return;
    }
    const problem = passwordProblem(fgPassword.value);
    if (problem) {
        setCardMsg(fgMsg, problem, "error");
        return;
    }
    if (fgPassword.value !== fgPassword2.value) {
        setCardMsg(fgMsg, "两次输入的新密码不一样，请检查", "error");
        return;
    }

    fgSubmit.disabled = true;
    fgSubmit.textContent = "重置中……";
    try {
        // 1. 校验验证码（会拿到一个临时登录态）
        await window.Auth.verifyRecovery(email, token);
        // 2. 用这个登录态设置新密码
        await window.Auth.updatePassword(fgPassword.value);
        // 3. 退出临时登录态，让用户用新密码正式登录
        await window.Auth.signOut();
        rememberEmail(email);

        fgCode.value = "";
        fgPassword.value = "";
        fgPassword2.value = "";
        showAuthCard("login");
        loginUseCode = false;
        applyLoginMode();
        loginEmail.value = email;
        setCardMsg(loginMsg, "密码已重置 ✓ 请用新密码登录", "ok");
    } catch (e) {
        setCardMsg(fgMsg, e.message || "重置失败，请检查验证码", "error");
    } finally {
        fgSubmit.disabled = false;
        fgSubmit.textContent = "重置密码";
    }
});

for (const el of [fgEmail, fgCode, fgPassword, fgPassword2]) {
    el.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            fgSubmit.click();
        }
    });
}

fgBack.addEventListener("click", () => {
    showAuthCard("login");
    setCardMsg(loginMsg, "");
});

// 初始状态：登录卡默认密码方式
applyLoginMode();

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
        // 去个人中心的「角色设定」分区
        window.location.href = "user.html#role";
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
    scheduleChatSync();
}

// 对话记录同步到云端：防抖 3 秒，避免每打一句就请求一次
let chatSyncTimer = null;

function scheduleChatSync() {
    if (!window.Cloud || !window.Cloud.isReady()) {
        return;
    }
    if (chatSyncTimer) {
        clearTimeout(chatSyncTimer);
    }
    const roleId = getActiveRoleId();
    const snapshot = chatHistory.slice();
    chatSyncTimer = setTimeout(() => {
        chatSyncTimer = null;
        window.Cloud.saveSession(roleId, snapshot).catch((e) => {
            console.warn("对话同步到云端失败：", e);
        });
    }, 3000);
}

// 云端设置拉下来之后，角色面板要跟着刷新（如果面板开着）
function renderRolePickerSoon() {
    if (typeof renderRolePicker === "function" && rolePicker && !rolePicker.hidden) {
        renderRolePicker();
    }
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

// 登录状态：先按本地凭证渲染一次，再异步刷新过期凭证 + 拉一次云端资料
renderAuthState();
window.Auth.init().then(() => {
    if (window.Auth.current()) {
        syncFromCloud();
    }
});

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
