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
const sendButton = document.querySelector(".chat-input button");
const messageList = document.querySelector(".message-list");
const chatExpandBtn = document.querySelector("#chat-expand");

const chatRoleBtn = document.querySelector("#chat-role-btn");
const rolePicker = document.querySelector("#role-picker");
const rolePickerList = document.querySelector("#role-picker-list");

// ---------- 侧边栏：展开 / 收起 ----------
// 默认收起（44px 窄条）：鼠标移到窄条上自动展开，移出后 0.1s 内自动收回；
// 点击图标可手动切换（手动展开后鼠标移出不会自动收回）。

let collapseTimer = null;
let manualExpanded = false;

sidebar.addEventListener("mouseenter", () => {
    // 悬停在收起后的窄条上才展开（没有 hover 到就不展开）
    manualExpanded = false;
    if (collapseTimer) {
        clearTimeout(collapseTimer);
        collapseTimer = null;
    }
    homeScreen.classList.remove("sidebar-collapsed");
});

sidebar.addEventListener("mouseleave", () => {
    if (manualExpanded) {
        return;
    }
    // 0.1s 内自动收回
    collapseTimer = setTimeout(() => {
        homeScreen.classList.add("sidebar-collapsed");
        collapseTimer = null;
    }, 100);
});

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

// ---------- 用户区域：点击进入用户设置 ----------

sidebarUser.addEventListener("click", () => {
    window.location.href = "user.html";
});

// 从本地读取用户信息（昵称 / 头像），没有就保持默认
function renderUserInfo() {
    try {
        const u = JSON.parse(localStorage.getItem("xingyue_user"));
        if (u && u.nickname) {
            userNameEl.textContent = u.nickname;
        }
        if (u && u.avatar) {
            userAvatarEl.textContent = u.avatar;
        }
    } catch {
        // 读取失败就用默认
    }
}

// ---------- 游客进入 ----------

guestButton.addEventListener("click", () => {
    // 记录用户已经完成启动流程
    localStorage.setItem("xingyue_visited", "true");

    // 隐藏登录页面，显示首页
    authScreen.style.display = "none";
    homeScreen.style.display = "flex";
});

// ================================
// 设置（与设置页面共用 localStorage）
// ================================

const SETTINGS_KEY = "xingyue_settings";
const PREFS_KEY = "xingyue_prefs";
const PANEL_KEY = "xingyue_panel";

// 读取当前正在使用的 API 提供商（设置页面里添加并选择）
function getActiveProvider() {
    try {
        const store = JSON.parse(localStorage.getItem(SETTINGS_KEY));
        if (!store) {
            return null;
        }

        let provider = null;
        if (Array.isArray(store.providers)) {
            // 新版：providers 列表
            provider = store.providers.find((p) => p.id === store.activeId) || store.providers[0] || null;
        } else if (store.baseUrl) {
            // 旧版：单个配置对象（兼容）
            provider = {
                name: "DeepSeek",
                baseUrl: store.baseUrl,
                apiKey: store.apiKey || "",
                model: store.model || "deepseek-chat",
            };
        }
        return provider;
    } catch {
        return null;
    }
}

// ================================
// 聊天角色（输入框左侧按钮选择：官方星瑶/月瓷 + 我的角色）
// ================================

const CHAT_ROLE_KEY = "xingyue_chat_role";

// 当前聊天角色：{ kind: "official"|"local", id: 角色id(官方为null), name: 名字 }
function getChatRole() {
    try {
        const saved = JSON.parse(localStorage.getItem(CHAT_ROLE_KEY));
        if (saved && saved.kind && saved.name) {
            return saved;
        }
    } catch {
        // 读取失败用默认
    }
    return { kind: "official", id: null, name: "星瑶" };
}

function saveChatRole(role) {
    localStorage.setItem(CHAT_ROLE_KEY, JSON.stringify(role));
}

// 当前角色的显示名（聊天气泡用）
function getChatRoleName() {
    const role = getChatRole();
    if (role.kind === "official") {
        return role.name;
    }
    try {
        const store = JSON.parse(localStorage.getItem(SETTINGS_KEY));
        if (store && Array.isArray(store.roles)) {
            const r = store.roles.find((x) => x.id === role.id);
            if (r && r.name) {
                return r.name;
            }
        }
    } catch {
        // 忽略
    }
    return "星瑶";
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

    try {
        const store = JSON.parse(localStorage.getItem(SETTINGS_KEY));
        if (store && Array.isArray(store.roles)) {
            const r = store.roles.find((x) => x.id === role.id);
            if (r && r.prompt) {
                return r.prompt;
            }
        }
    } catch {
        // 读取失败用空
    }
    return "";
}

// 读取官方角色的设定（站长在后台 assets/data/official-roles.js 维护，
// 通过 <script> 标签加载，本地双击打开和线上部署都能读取）
async function getOfficialRolePrompt(name) {
    const roles = window.OFFICIAL_ROLES && Array.isArray(window.OFFICIAL_ROLES.roles)
        ? window.OFFICIAL_ROLES.roles
        : [];
    const r = roles.find((x) => x.name === name);
    if (r && r.prompt) {
        return r.prompt;
    }
    return "";
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

// 选中角色：保存 → 关闭面板 → 加载该角色的对话历史
// （Live2D 模型切换功能后续再加）
function pickRole(role) {
    saveChatRole({ kind: role.kind, id: role.id, name: role.name });
    closeRolePicker();
    chatHistory = loadChat();
    renderChat();
    updateExpandBtn();
}

function renderRolePicker() {
    rolePickerList.innerHTML = "";
    const current = getChatRole();

    // 官方角色（星瑶、月瓷 在最上面）
    const officialRoles = ["星瑶", "月瓷"].map((name) => ({
        kind: "official",
        id: null,
        name: name,
    }));

    // 我的角色（按创建顺序）
    let localRoles = [];
    try {
        const store = JSON.parse(localStorage.getItem(SETTINGS_KEY));
        if (store && Array.isArray(store.roles)) {
            localRoles = store.roles;
        }
    } catch {
        // 忽略
    }
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

    const nameSpan = document.createElement("span");
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

// ================================
// Live2D 管理器（oh-my-live2d 0.19）
// 加载/切换模型、居中显示、用户交互（拖动 / 中键缩放 / Ctrl+中键旋转）、
// 情绪动作驱动。所有 WebGL 资源在重建前释放，防止上下文泄漏。
// ================================

// ================================
// Live2D（最简版：只负责把模型加载显示出来）
// 先让模型出现，后续再逐步添加：居中适配 / 交互 / 情绪动作
// ================================

// ================================
// Live2D：模型固定渲染在"窗口"（画布）上，
// 鼠标操作的是窗口本身（拖动 / 中键缩放 / Ctrl+中键旋转）
// ================================

const Live2D = {
    om: null,

    // 窗口状态：拖动偏移 / 缩放 / 旋转
    win: {
        dx: 0,
        dy: 0,
        scale: 1,
        rotation: 0,
        dragging: false,
        startX: 0,
        startY: 0,
        startDx: 0,
        startDy: 0,
        bound: false,
    },

    async init() {
        // SDK 已由 index.html 加载（window.OML2D.loadOml2d）
        const factory = window.OML2D && window.OML2D.loadOml2d;
        if (!factory) {
            console.warn("Live2D SDK 未加载");
            return;
        }
        const container = document.getElementById("live2d-container");
        if (!container) {
            return;
        }
        try {
            // 解密官方模型（.l2d 加密容器 → blob URL），当前固定加载 default
            let modelInfo = null;
            try {
                modelInfo = await window.L2DModels.ensure("default");
            } catch (e) {
                console.warn("官方模型解密加载失败：", e);
            }
            this.om = factory({
                el: container,
                parentElement: container,
                models: [{
                    path: modelInfo ? modelInfo.entryUrl : "assets/live2d/default/ARGNori.model3.json",
                    scale: modelInfo ? modelInfo.scale : 0.1,
                    // 锚点左上角：模型固定渲染，位置由"窗口"控制
                    anchor: [0, 0],
                }],
                // 关闭 SDK 自带 UI
                statusBar: { disable: true },
                menus: { disable: true },
                tips: { disable: true },
                sayHello: false,
            });
            window.__om = this.om; // 调试钩子
            console.log("Live2D 模型加载中……");
            this.setModelAnchor();
            this.bindWindowInteractions();
        } catch (error) {
            console.warn("Live2D 加载失败：", error);
        }
    },

    // 设置模型锚点 (0, 0)：运行时调用，模型对象未就绪时自动重试
    setModelAnchor(attempts) {
        const om = this.om;
        if (!om || typeof om.setModelAnchor !== "function") {
            return;
        }
        const count = attempts || 0;
        try {
            om.setModelAnchor({ x: 0, y: 0 });
            console.log("模型锚点已设置 (0, 0)");
        } catch (error) {
            if (count < 20) {
                // 模型对象还没创建完成，稍后重试（最多 10 秒）
                setTimeout(() => this.setModelAnchor(count + 1), 500);
            } else {
                console.warn("模型锚点设置失败：", error);
            }
        }
    },

    // 应用窗口变换：窗口（容器）固定在整个网页正中间，
    // 拖动 / 缩放 / 旋转叠加在居中偏移上（操作容器，SDK 只渲染画布，互不干扰）
    applyWin() {
        const container = document.getElementById("live2d-container");
        if (!container) {
            return;
        }
        const w = this.win;
        if (container.style.transformOrigin !== "center center") {
            container.style.transformOrigin = "center center";
        }
        // 居中（-50%）+ 拖动偏移 + 缩放 + 旋转
        const transform =
            "translate(-50%, -50%) " +
            "translate(" + w.dx + "px, " + w.dy + "px) " +
            "scale(" + w.scale + ") rotate(" + w.rotation + "deg)";
        if (container.style.transform !== transform) {
            container.style.transform = transform;
        }
    },

    // 鼠标动"窗口"：拖动 / 中键缩放 / Ctrl+中键旋转（捕获阶段，避免被 SDK 拦截）
    bindWindowInteractions() {
        if (this.win.bound) {
            return;
        }
        this.win.bound = true;

        const stageEl = document.querySelector(".live2d-stage") || document.getElementById("live2d-container");
        if (!stageEl) {
            return;
        }
        const w = this.win;

        stageEl.addEventListener("pointerdown", (e) => {
            w.dragging = true;
            w.startX = e.clientX;
            w.startY = e.clientY;
            w.startDx = w.dx;
            w.startDy = w.dy;
            e.preventDefault();
        }, true);

        window.addEventListener("pointermove", (e) => {
            if (!w.dragging) {
                return;
            }
            w.dx = w.startDx + (e.clientX - w.startX);
            w.dy = w.startDy + (e.clientY - w.startY);
            this.applyWin();
        }, true);

        window.addEventListener("pointerup", () => {
            w.dragging = false;
        }, true);

        stageEl.addEventListener("wheel", (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -1 : 1;
            if (e.ctrlKey) {
                // 旋转窗口
                w.rotation = Math.round((w.rotation + delta * 5) * 10) / 10;
            } else {
                // 缩放窗口
                const factor = delta > 0 ? 0.93 : 1.07;
                w.scale = Math.min(5, Math.max(0.1, w.scale * factor));
            }
            this.applyWin();
        }, { passive: false, capture: true });
    },
};

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
    try {
        const prefs = JSON.parse(localStorage.getItem(PREFS_KEY));
        if (prefs && Number.isFinite(prefs.chatKeepPairs) && prefs.chatKeepPairs >= 1) {
            return prefs.chatKeepPairs;
        }
    } catch {
        // 读取失败用默认
    }
    return 3;
}

// ================================
// 聊天（按角色会话分组存储：不同角色有各自的对话历史）
// ================================

const CHAT_KEY = "xingyue_chat";

// 当前角色的会话消息（完整保存在浏览器本地，隐私数据不会上传）
let chatHistory = loadChat();

// 对话面板是否展开全部历史（默认展开显示全部消息，可点按钮收起只显示设置的对数）
let chatExpanded = loadPanelState();

function loadPanelState() {
    try {
        const s = JSON.parse(localStorage.getItem(PANEL_KEY));
        if (s && typeof s.expanded === "boolean") {
            return s.expanded;
        }
    } catch {
        // 读取失败用默认
    }
    return true; // 默认展开全部
}

function savePanelState() {
    localStorage.setItem(PANEL_KEY, JSON.stringify({ expanded: chatExpanded }));
}

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
    try {
        const saved = JSON.parse(localStorage.getItem(CHAT_KEY));

        // 新格式：按角色会话分组
        if (saved && saved.sessions && typeof saved.sessions === "object") {
            const list = saved.sessions[getActiveRoleId()];
            return Array.isArray(list) ? cleanLegacy(list) : [];
        }

        // 旧格式：无分组的数组 → 迁移到当前角色的会话
        if (Array.isArray(saved)) {
            const list = cleanLegacy(saved);
            migrateChatToSessions(getActiveRoleId(), list);
            return list;
        }
    } catch {
        // 读取失败就当作空
    }
    return [];
}

// 把旧格式的历史迁移到指定角色的会话
function migrateChatToSessions(roleId, list) {
    try {
        const saved = JSON.parse(localStorage.getItem(CHAT_KEY)) || {};
        const sessions = saved && saved.sessions && typeof saved.sessions === "object" ? saved.sessions : {};
        sessions[roleId] = list;
        localStorage.setItem(CHAT_KEY, JSON.stringify({ sessions: sessions }));
    } catch {
        localStorage.setItem(CHAT_KEY, JSON.stringify({ sessions: { [roleId]: list } }));
    }
}

function saveChat() {
    try {
        const saved = JSON.parse(localStorage.getItem(CHAT_KEY)) || {};
        const sessions = saved && saved.sessions && typeof saved.sessions === "object" ? saved.sessions : {};
        sessions[getActiveRoleId()] = chatHistory;
        localStorage.setItem(CHAT_KEY, JSON.stringify({ sessions: sessions }));
    } catch {
        localStorage.setItem(CHAT_KEY, JSON.stringify({ sessions: { [getActiveRoleId()]: chatHistory } }));
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

// 等待回复的气泡：三个点上下跳动
function appendTypingElement() {
    const message = document.createElement("div");
    message.className = "message message-character";

    const nameEl = document.createElement("div");
    nameEl.className = "message-name";
    nameEl.textContent = getChatRoleName();

    const bubble = document.createElement("div");
    bubble.className = "message-bubble typing-bubble";
    for (let i = 0; i < 3; i++) {
        const dot = document.createElement("span");
        dot.className = "typing-dot";
        bubble.appendChild(dot);
    }

    message.appendChild(nameEl);
    message.appendChild(bubble);
    messageList.appendChild(message);
    messageList.scrollTop = messageList.scrollHeight;

    return message;
}

// 写入历史并显示
function addMessage(name, text, isUser) {
    chatHistory.push({ name, text, isUser });
    saveChat();
    appendMessageElement(name, text, isUser);
    messageList.scrollTop = messageList.scrollHeight;
}

// 渲染聊天记录：
// 收起时只展示最近 N 对对话（默认 3 对，设置页可调），
// 展开时显示全部历史消息；每次打开浏览器自动接续上次的对话
function renderChat() {
    messageList.innerHTML = "";

    const keepPairs = getChatKeepPairs();
    const visible = chatExpanded ? chatHistory : chatHistory.slice(-keepPairs * 2);

    visible.forEach((m, i) => {
        const el = appendMessageElement(m.name, m.text, m.isUser);
        // 历史较多时只给前几条错峰动画
        if (i < 10) {
            el.style.animationDelay = i * 50 + "ms";
        }
    });
    messageList.scrollTop = messageList.scrollHeight;
}

// 工具栏：展开 / 收起（默认展开全部历史）
function updateExpandBtn() {
    if (chatExpanded) {
        chatExpandBtn.textContent = "收起 ▲";
        chatExpandBtn.disabled = false;
    } else {
        const keepPairs = getChatKeepPairs();
        const extra = chatHistory.length - keepPairs * 2;
        chatExpandBtn.textContent = extra > 0 ? "展开全部（+" + extra + "）" : "展开全部";
        chatExpandBtn.disabled = extra <= 0;
    }
}

chatExpandBtn.addEventListener("click", () => {
    chatExpanded = !chatExpanded;
    savePanelState();
    renderChat();
    updateExpandBtn();
});

function sendMessage() {
    const text = chatInput.value.trim();
    if (text === "") {
        return;
    }

    chatInput.value = "";
    addMessage("小喵", text, true);
    askXingyao();
    updateExpandBtn();
}

// 让星瑶回答（调用当前选择的 API 提供商 + 当前角色设定）
async function askXingyao() {
    const provider = getActiveProvider();

    // 没配置秘钥时给个提示
    if (!provider || !provider.apiKey) {
        addMessage(getChatRoleName(), "还没有配置 API 秘钥哦～去「设置」页面添加一个 API Key，就能和我聊天啦！", false);
        return;
    }

    // 先显示三点跳动的等待气泡
    const typingEl = appendTypingElement();

    // 组装消息：当前角色设定（附加情绪规则）+ 最近 20 条对话
    const basePrompt = await getActiveSystemPrompt();
    const systemPrompt = basePrompt +
        "\n\n【情绪规则】每次回复的开头先用【情绪：X】标记你此刻的情绪（X 从：开心、难过、生气、害羞、惊讶、委屈、平静 中选择一个），随后才是回复内容。例如：【情绪：开心】今天天气不错呀。";

    const messages = [
        { role: "system", content: systemPrompt },
        ...chatHistory.slice(-20).map((m) => ({
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

        typingEl.remove();

        // 解析情绪标记（正文去掉标记显示；Live2D 表情动作后续再加）
        const parsed = parseEmotion(reply);
        addMessage(getChatRoleName(), parsed.text || "……", false);
    } catch (error) {
        typingEl.remove();
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

renderChat();
updateExpandBtn();
renderUserInfo();

// 初始化 Live2D（异步加载默认模型，不影响页面进入）
Live2D.init();

// 检查用户是否第一次访问网站
const isFirstVisit = localStorage.getItem("xingyue_visited");

if (isFirstVisit === null) {
    // 第一次访问：直接显示登录页
    console.log("🌙 第一次来到星月小窝");
    authScreen.style.display = "flex";
} else {
    // 老用户：直接进入首页
    console.log("🌙 欢迎回来");
    homeScreen.style.display = "flex";
}
