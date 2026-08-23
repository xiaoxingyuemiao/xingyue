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

// 读取当前正在使用的角色设定（设置页"角色设定"里添加并切换）
function getActiveRoleId() {
    try {
        const store = JSON.parse(localStorage.getItem(SETTINGS_KEY));
        if (store && Array.isArray(store.roles)) {
            const role = store.roles.find((r) => r.id === store.activeRoleId) || store.roles[0];
            if (role && role.id) {
                return role.id;
            }
        }
    } catch {
        // 读取失败用默认
    }
    return "role-default";
}

function getActiveRolePrompt() {
    try {
        const store = JSON.parse(localStorage.getItem(SETTINGS_KEY));
        if (store && Array.isArray(store.roles)) {
            const role = store.roles.find((r) => r.id === store.activeRoleId) || store.roles[0];
            if (role && role.prompt) {
                return role.prompt;
            }
        }
    } catch {
        // 读取失败用默认
    }
    return "";
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
    nameEl.textContent = "星瑶";

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
        addMessage("星瑶", "还没有配置 API 秘钥哦～去「设置」页面添加一个 API Key，就能和我聊天啦！", false);
        return;
    }

    // 先显示三点跳动的等待气泡
    const typingEl = appendTypingElement();

    // 组装消息：当前角色设定 + 最近 20 条对话
    const messages = [
        { role: "system", content: getActiveRolePrompt() },
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
        addMessage("星瑶", reply, false);
    } catch (error) {
        typingEl.remove();
        addMessage("星瑶", "呜……连接失败了（" + error.message + "）。去「设置」页面检查一下 API 配置吧～", false);
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
