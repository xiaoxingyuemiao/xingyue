// ================================
// 星月小窝 —— 设置页面脚本
// API 提供商管理（DeepSeek / 通义千问 / OpenAI 兼容，点击卡片切换）
// 角色设定（多角色卡片管理）
// 对话（保留对数 + 清空 + 全部历史）
// 与首页聊天共用 localStorage
// ================================

const STORE_KEY = "xingyue_settings";
const PREFS_KEY = "xingyue_prefs";
const CHAT_KEY = "xingyue_chat";

// 注意：官方角色设定内容（System Prompt）不写在代码里，
// 由站长在 assets/data/official-roles.json 中维护（后台调整，推送 GitHub 即同步）。

// ---------- 页面元素 ----------

const navItems = document.querySelectorAll(".settings-nav-item");
const views = document.querySelectorAll(".settings-view");

const providerList = document.querySelector("#provider-list");
const providerAdd = document.querySelector("#provider-add");

const roleList = document.querySelector("#role-list");
const roleAdd = document.querySelector("#role-add");

const keepPairs = document.querySelector("#keep-pairs");
const keepSave = document.querySelector("#keep-save");
const keepStatus = document.querySelector("#keep-status");
const historyClear = document.querySelector("#history-clear");
const historyList = document.querySelector("#history-list");

const modalOverlay = document.querySelector("#modal-overlay");
const modalClose = document.querySelector("#modal-close");
const modalStatus = document.querySelector("#m-status");
const apiModalTitle = document.querySelector("#api-modal-title");

const mName = document.querySelector("#m-name");
const mType = document.querySelector("#m-type");
const mBaseUrl = document.querySelector("#m-base-url");
const mApiKey = document.querySelector("#m-api-key");
const mShowKey = document.querySelector("#m-show-key");
const mModel = document.querySelector("#m-model");
const mTest = document.querySelector("#m-test");
const mSave = document.querySelector("#m-save");

// API 服务商：自定义下拉（与页面风格统一）
const typeField = document.querySelector("#type-field");
const typePicker = document.querySelector("#type-picker");
const typeText = document.querySelector("#m-type-text");
const typeOptions = document.querySelectorAll(".select-option");
let currentType = "deepseek";

const modelField = document.querySelector(".model-field");
const modelPicker = document.querySelector("#model-picker");
const modelPickerList = document.querySelector("#model-picker-list");

const roleModalOverlay = document.querySelector("#role-modal-overlay");
const roleModalClose = document.querySelector("#role-modal-close");
const roleModalTitle = document.querySelector("#role-modal-title");
const rName = document.querySelector("#r-name");
const rPrompt = document.querySelector("#r-prompt");
const rModel = document.querySelector("#r-model");
const rSave = document.querySelector("#r-save");
const rStatus = document.querySelector("#r-status");

// 当前正在编辑的 id（null = 新增，有值 = 双击卡片进入编辑）
let editingProviderId = null;
let editingRoleId = null;

// ================================
// 左侧导航：切换视图（API 设置 / 角色设定 / 对话）
// ================================

function switchView(name) {
    for (const item of navItems) {
        item.classList.toggle("active", item.dataset.view === name);
    }
    for (const view of views) {
        view.hidden = view.id !== "view-" + name;
    }
    if (location.hash !== "#" + name) {
        history.replaceState(null, "", "#" + name);
    }
    // 切到"对话"视图时刷新历史列表；切到"角色设定"时检查站长口令
    if (name === "dialogue") {
        renderHistory();
        loadHistoryView();
    } else if (name === "role") {
        renderRoles();
    }
}

for (const item of navItems) {
    item.addEventListener("click", (event) => {
        event.preventDefault();
        switchView(item.dataset.view);
    });
}

// 打开页面时按 hash 定位视图（主页"对话"会跳到 #dialogue）
const initialView = (location.hash || "#api").slice(1);
switchView(initialView);

// ================================
// 数据
// ================================

function loadStore() {
    let raw = null;
    try {
        raw = JSON.parse(localStorage.getItem(STORE_KEY));
    } catch {
        // 读取失败当作空
    }

    if (!raw) {
        return {
            providers: [],
            activeId: null,
            roles: [],
            activeRoleId: null,
        };
    }

    const store = { ...raw };

    // 旧版：单个配置对象 → 迁移成列表
    if (!Array.isArray(store.providers)) {
        if (store.baseUrl) {
            store.providers = [{
                id: "p-" + Date.now(),
                name: "DeepSeek",
                type: store.provider === "custom" ? "custom" : "deepseek",
                baseUrl: store.baseUrl,
                apiKey: store.apiKey || "",
                model: store.model || "deepseek-chat",
            }];
            store.activeId = store.providers[0].id;
        } else {
            store.providers = [];
            store.activeId = null;
        }
    }

    // 角色：不再自动创建默认角色（角色内容由站长在口令解锁后维护）
    if (!Array.isArray(store.roles)) {
        store.roles = [];
        store.activeRoleId = null;
    }
    if (!store.activeRoleId && store.roles.length > 0) {
        store.activeRoleId = store.roles[0].id;
    }

    saveStore(store);
    return store;
}

function saveStore(store) {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
}

function loadPrefs() {
    try {
        const prefs = JSON.parse(localStorage.getItem(PREFS_KEY));
        if (prefs && Number.isFinite(prefs.chatKeepPairs) && prefs.chatKeepPairs >= 1) {
            return prefs;
        }
    } catch {
        // 读取失败用默认
    }
    return { chatKeepPairs: 3 };
}

// ================================
// 视图一：API 设置（提供商卡片，点击卡片切换当前使用）
// ================================

function renderProviders() {
    const store = loadStore();
    providerList.innerHTML = "";

    // 空状态
    if (store.providers.length === 0) {
        const empty = document.createElement("div");
        empty.className = "provider-empty";
        empty.textContent = "还没有添加任何 API，点击下方按钮添加一个吧～";
        providerList.appendChild(empty);
        return;
    }

    for (const p of store.providers) {
        const card = document.createElement("div");
        card.className = "provider-card" + (p.id === store.activeId ? " provider-card-active" : "");
        card.title = "单击切换当前使用，双击编辑";

        // 单击切换当前使用（延迟执行，避免双击时误切换）
        let cardClickTimer = null;
        card.addEventListener("click", () => {
            if (cardClickTimer) {
                clearTimeout(cardClickTimer);
            }
            cardClickTimer = setTimeout(() => {
                const s = loadStore();
                s.activeId = p.id;
                saveStore(s);
                renderProviders();
            }, 250);
        });

        // 双击卡片打开编辑
        card.addEventListener("dblclick", () => {
            if (cardClickTimer) {
                clearTimeout(cardClickTimer);
                cardClickTimer = null;
            }
            openModal(p);
        });

        // 信息区
        const info = document.createElement("div");
        info.className = "provider-info";

        const nameRow = document.createElement("div");
        nameRow.className = "provider-name-row";

        const nameEl = document.createElement("span");
        nameEl.className = "provider-name";
        nameEl.textContent = p.name;
        nameRow.appendChild(nameEl);

        if (p.id === store.activeId) {
            const badge = document.createElement("span");
            badge.className = "provider-badge";
            badge.textContent = "当前使用";
            nameRow.appendChild(badge);
        }

        const typeName = p.type === "deepseek" ? "DeepSeek" : p.type === "qwen" ? "通义千问" : "OpenAI 兼容";
        const typeEl = document.createElement("span");
        typeEl.className = "provider-type";
        typeEl.textContent = typeName;
        nameRow.appendChild(typeEl);

        info.appendChild(nameRow);

        const meta = document.createElement("div");
        meta.className = "provider-meta";
        meta.textContent = p.model + " · " + p.baseUrl;
        info.appendChild(meta);

        // 删除按钮（点击不触发切换）
        const delBtn = document.createElement("button");
        delBtn.className = "provider-btn provider-btn-del";
        delBtn.textContent = "删除";
        delBtn.addEventListener("click", (event) => {
            event.stopPropagation();
            if (!window.confirm("确定删除「" + p.name + "」吗？")) {
                return;
            }
            const s = loadStore();
            s.providers = s.providers.filter((x) => x.id !== p.id);
            if (s.activeId === p.id) {
                s.activeId = s.providers[0] ? s.providers[0].id : null;
            }
            saveStore(s);
            renderProviders();
        });

        card.appendChild(info);
        card.appendChild(delBtn);
        providerList.appendChild(card);
    }
}

// ================================
// 视图二：角色设定（多角色卡片，点击切换）
// ================================

function renderRoles() {
    const store = loadStore();
    roleList.innerHTML = "";

    for (const role of store.roles) {
        const card = document.createElement("div");
        card.className = "role-card" + (role.id === store.activeRoleId ? " role-card-active" : "");
        card.title = "单击切换当前角色，双击编辑";

        // 单击切换当前角色（延迟执行，避免双击时误切换）
        let roleClickTimer = null;
        card.addEventListener("click", () => {
            if (roleClickTimer) {
                clearTimeout(roleClickTimer);
            }
            roleClickTimer = setTimeout(() => {
                const s = loadStore();
                s.activeRoleId = role.id;
                saveStore(s);
                renderRoles();
            }, 250);
        });

        // 双击卡片打开编辑
        card.addEventListener("dblclick", () => {
            if (roleClickTimer) {
                clearTimeout(roleClickTimer);
                roleClickTimer = null;
            }
            openRoleModal(role);
        });

        const info = document.createElement("div");
        info.className = "provider-info";

        const nameRow = document.createElement("div");
        nameRow.className = "provider-name-row";

        const nameEl = document.createElement("span");
        nameEl.className = "provider-name";
        nameEl.textContent = role.name;
        nameRow.appendChild(nameEl);

        if (role.id === store.activeRoleId) {
            const badge = document.createElement("span");
            badge.className = "provider-badge";
            badge.textContent = "当前使用";
            nameRow.appendChild(badge);
        }

        info.appendChild(nameRow);

        const preview = document.createElement("div");
        preview.className = "provider-meta role-preview";
        preview.textContent = role.prompt.length > 60 ? role.prompt.slice(0, 60) + "……" : role.prompt;
        info.appendChild(preview);

        const delBtn = document.createElement("button");
        delBtn.className = "provider-btn provider-btn-del";
        delBtn.textContent = "删除";
        delBtn.addEventListener("click", (event) => {
            event.stopPropagation();
            if (!window.confirm("确定删除角色「" + role.name + "」吗？")) {
                return;
            }
            const s = loadStore();
            s.roles = s.roles.filter((x) => x.id !== role.id);
            if (s.activeRoleId === role.id) {
                s.activeRoleId = s.roles[0] ? s.roles[0].id : null;
            }
            saveStore(s);
            renderRoles();
        });

        card.appendChild(info);
        card.appendChild(delBtn);
        roleList.appendChild(card);
    }
}

// ---------- 添加角色弹窗 ----------

// 打开添加 / 编辑角色弹窗（传入 role 时进入编辑模式）
function openRoleModal(role) {
    rName.value = role ? role.name : "";
    rPrompt.value = role ? role.prompt : "";
    rModel.value = role ? role.model || "" : "";
    rStatus.textContent = "";
    editingRoleId = role ? role.id : null;
    roleModalTitle.textContent = role ? "编辑角色" : "添加角色";
    roleModalOverlay.classList.add("open");
}

function closeRoleModal() {
    roleModalOverlay.classList.remove("open");
}

roleAdd.addEventListener("click", () => openRoleModal());
roleModalClose.addEventListener("click", closeRoleModal);

roleModalOverlay.addEventListener("click", (event) => {
    if (event.target === roleModalOverlay) {
        closeRoleModal();
    }
});

rSave.addEventListener("click", () => {
    const name = rName.value.trim() || "未命名角色";
    const prompt = rPrompt.value.trim();
    const model = rModel.value.trim();
    if (!prompt) {
        rStatus.textContent = "请填写角色设定内容";
        return;
    }

    const store = loadStore();

    // 角色名重名时自动编号（编辑时排除自己）
    const baseName = name;
    let finalName = baseName;
    let count = 2;
    while (store.roles.some((x) => x.id !== editingRoleId && x.name === finalName)) {
        finalName = baseName + "(" + count + ")";
        count++;
    }

    if (editingRoleId) {
        // 编辑已有角色
        const idx = store.roles.findIndex((x) => x.id === editingRoleId);
        if (idx !== -1) {
            store.roles[idx] = { ...store.roles[idx], name: finalName, prompt: prompt, model: model };
        }
    } else {
        // 新增角色
        store.roles.push({ id: "role-" + Date.now(), name: finalName, prompt: prompt, model: model });
        if (!store.activeRoleId) {
            store.activeRoleId = store.roles[store.roles.length - 1].id;
        }
    }
    saveStore(store);
    renderRoles();
    closeRoleModal();
});

// ================================
// 视图三：对话（保留对数 + 清空 + 全部历史）
// ================================

function loadHistoryView() {
    keepPairs.value = loadPrefs().chatKeepPairs;
    keepStatus.textContent = "";
}

keepSave.addEventListener("click", () => {
    let n = parseInt(keepPairs.value, 10);
    if (!Number.isFinite(n) || n < 1) {
        n = 1;
    }
    if (n > 20) {
        n = 20;
    }
    keepPairs.value = n;
    localStorage.setItem(PREFS_KEY, JSON.stringify({ chatKeepPairs: n }));
    keepStatus.textContent = "已保存 ✓ 首页将只展示最近 " + n + " 对对话";
});

historyClear.addEventListener("click", () => {
    if (!window.confirm("确定清空所有角色的全部对话历史吗？此操作不可恢复。")) {
        return;
    }
    localStorage.setItem(CHAT_KEY, JSON.stringify({ sessions: {} }));
    keepStatus.textContent = "对话历史已清空 ✓";
    renderHistory();
});

// 读取本地全部会话（按角色分组）
function loadSessions() {
    try {
        const saved = JSON.parse(localStorage.getItem(CHAT_KEY));
        if (saved && saved.sessions && typeof saved.sessions === "object") {
            return saved.sessions;
        }
        // 旧格式：无分组的数组 → 迁移到当前角色的会话
        if (Array.isArray(saved)) {
            const store = loadStore();
            const roleId = store.activeRoleId || (store.roles[0] && store.roles[0].id) || "role-default";
            return { [roleId]: saved };
        }
    } catch {
        // 读取失败当作空
    }
    return {};
}

function saveSessions(sessions) {
    localStorage.setItem(CHAT_KEY, JSON.stringify({ sessions: sessions }));
}

// 渲染对话记录：每个角色一个会话卡片（整个会话折叠成一个卡片），
// 点击卡片展开显示该会话全部消息，消息支持修改 / 删除
function renderHistory() {
    historyList.innerHTML = "";

    const sessions = loadSessions();
    const store = loadStore();

    // 角色 id → 角色名
    const roleNameById = {};
    for (const r of store.roles) {
        roleNameById[r.id] = r.name;
    }

    const roleIds = Object.keys(sessions);
    if (roleIds.length === 0) {
        const empty = document.createElement("div");
        empty.className = "history-empty";
        empty.textContent = "还没有对话记录，回首页和星瑶聊聊天吧～";
        historyList.appendChild(empty);
        return;
    }

    for (const roleId of roleIds) {
        const messages = sessions[roleId];
        if (!Array.isArray(messages) || messages.length === 0) {
            continue;
        }

        const card = document.createElement("div");
        card.className = "session-card";

        // 卡片头：角色名 + 消息数 + 删除会话（点击卡片展开 / 折叠）
        const head = document.createElement("div");
        head.className = "session-card-head";
        head.title = "点击展开 / 折叠整个会话";

        const info = document.createElement("div");
        info.className = "session-card-info";

        const nameEl = document.createElement("span");
        nameEl.className = "session-card-name";
        nameEl.textContent = roleNameById[roleId] ||
            (roleId.indexOf("official-") === 0 ? roleId.slice("official-".length) + "（官方）" : "角色");
        info.appendChild(nameEl);

        const countEl = document.createElement("span");
        countEl.className = "session-card-count";
        countEl.textContent = messages.length + " 条消息";
        info.appendChild(countEl);

        head.appendChild(info);

        const delSessionBtn = document.createElement("button");
        delSessionBtn.type = "button";
        delSessionBtn.className = "history-item-btn history-item-btn-del";
        delSessionBtn.textContent = "删除会话";
        delSessionBtn.addEventListener("click", (event) => {
            event.stopPropagation();
            if (!window.confirm("确定删除这个角色的全部对话历史吗？")) {
                return;
            }
            const s = loadSessions();
            delete s[roleId];
            saveSessions(s);
            renderHistory();
        });
        head.appendChild(delSessionBtn);

        head.addEventListener("click", () => {
            card.classList.toggle("expanded");
        });

        // 卡片体：该会话的全部消息（默认折叠隐藏）
        const body = document.createElement("div");
        body.className = "session-card-body";

        messages.forEach((m, index) => {
            const msg = document.createElement("div");
            msg.className = "session-message";

            const textEl = document.createElement("div");
            textEl.className = "session-message-text";
            textEl.textContent = (m.isUser ? "小喵" : "星瑶") + "：" + m.text;
            msg.appendChild(textEl);

            const actions = document.createElement("div");
            actions.className = "history-item-actions";

            const editBtn = document.createElement("button");
            editBtn.type = "button";
            editBtn.className = "history-item-btn";
            editBtn.textContent = "修改";
            actions.appendChild(editBtn);

            const saveBtn = document.createElement("button");
            saveBtn.type = "button";
            saveBtn.className = "history-item-btn history-item-btn-primary";
            saveBtn.textContent = "保存";
            saveBtn.style.display = "none";
            actions.appendChild(saveBtn);

            const cancelBtn = document.createElement("button");
            cancelBtn.type = "button";
            cancelBtn.className = "history-item-btn";
            cancelBtn.textContent = "取消";
            cancelBtn.style.display = "none";
            actions.appendChild(cancelBtn);

            const delBtn = document.createElement("button");
            delBtn.type = "button";
            delBtn.className = "history-item-btn history-item-btn-del";
            delBtn.textContent = "删除";
            actions.appendChild(delBtn);

            // 修改：文本变为输入框
            editBtn.addEventListener("click", () => {
                textEl.innerHTML = "";
                const ta = document.createElement("textarea");
                ta.className = "history-edit-input";
                ta.value = m.text;
                textEl.appendChild(ta);
                editBtn.style.display = "none";
                saveBtn.style.display = "";
                cancelBtn.style.display = "";
            });

            saveBtn.addEventListener("click", () => {
                const ta = textEl.querySelector(".history-edit-input");
                const newText = ta ? ta.value.trim() : "";
                if (!newText) {
                    return;
                }
                const s = loadSessions();
                const list = s[roleId];
                if (list && list[index]) {
                    list[index] = { ...list[index], text: newText };
                    saveSessions(s);
                }
                renderHistory();
            });

            cancelBtn.addEventListener("click", () => {
                renderHistory();
            });

            // 删除单条消息
            delBtn.addEventListener("click", () => {
                if (!window.confirm("确定删除这条对话消息吗？")) {
                    return;
                }
                const s = loadSessions();
                const list = s[roleId];
                if (list) {
                    list.splice(index, 1);
                    saveSessions(s);
                }
                renderHistory();
            });

            msg.appendChild(textEl);
            msg.appendChild(actions);
            body.appendChild(msg);
        });

        card.appendChild(head);
        card.appendChild(body);
        historyList.appendChild(card);
    }
}

// ================================
// 添加 API 弹窗
// ================================

// 打开添加 / 编辑 API 弹窗（传入 provider 时进入编辑模式）
function openModal(provider) {
    mName.value = provider ? provider.name : "";
    currentType = provider ? provider.type : "deepseek";
    typeText.textContent = provider ? typeNameOf(provider.type) : "DeepSeek";
    typePicker.hidden = true;
    mBaseUrl.value = provider ? provider.baseUrl : "https://api.deepseek.com";
    mApiKey.value = provider ? provider.apiKey : "";
    mModel.value = provider ? provider.model : "deepseek-chat";
    mShowKey.checked = false;
    mApiKey.type = "password";
    modelPicker.hidden = true;
    modalStatus.textContent = "";
    editingProviderId = provider ? provider.id : null;
    apiModalTitle.textContent = provider ? "编辑 API" : "添加 API";
    modalOverlay.classList.add("open");
}

function typeNameOf(type) {
    return type === "deepseek" ? "DeepSeek" : type === "qwen" ? "通义千问" : "OpenAI 兼容";
}

function closeModal() {
    modalOverlay.classList.remove("open");
}

// 注意：用箭头函数包装，避免把点击事件对象误当成 provider 参数
providerAdd.addEventListener("click", () => openModal());
modalClose.addEventListener("click", closeModal);

// 点击遮罩空白处自动关闭
modalOverlay.addEventListener("click", (event) => {
    if (event.target === modalOverlay) {
        closeModal();
    }
});

// 按 Esc 关闭弹窗
document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
        closeModal();
        closeRoleModal();
    }
});

// API 服务商：自定义下拉选择，选中后自动填默认地址和模型
function applyTypeDefaults() {
    modelPicker.hidden = true;
    if (currentType === "deepseek") {
        mBaseUrl.value = "https://api.deepseek.com";
        mModel.value = "deepseek-chat";
    } else if (currentType === "qwen") {
        mBaseUrl.value = "https://dashscope.aliyuncs.com/compatible-mode/v1";
        mModel.value = "qwen-plus";
    } else {
        mBaseUrl.value = "";
        mModel.value = "";
    }
}

mType.addEventListener("click", () => {
    typePicker.hidden = !typePicker.hidden;
});

for (const option of typeOptions) {
    option.addEventListener("click", () => {
        currentType = option.dataset.type;
        typeText.textContent = option.textContent;
        typePicker.hidden = true;
        applyTypeDefaults();
    });
}

// 点击下拉外部区域关闭
document.addEventListener("click", (event) => {
    if (!typeField.contains(event.target)) {
        typePicker.hidden = true;
    }
});

// 显示 / 隐藏秘钥
mShowKey.addEventListener("change", () => {
    mApiKey.type = mShowKey.checked ? "text" : "password";
});

function readModalForm() {
    return {
        name: mName.value.trim(),
        type: currentType,
        baseUrl: mBaseUrl.value.trim(),
        apiKey: mApiKey.value.trim(),
        model: mModel.value.trim(),
    };
}

// ---------- 模型：点击输入框自动获取服务商模型列表 ----------

async function loadModelList() {
    const p = readModalForm();

    if (!p.baseUrl || !p.apiKey) {
        modelPicker.hidden = false;
        modelPickerList.innerHTML = "<div class='model-hint'>请先填写 API 地址和秘钥</div>";
        return;
    }

    modelPicker.hidden = false;
    modelPickerList.innerHTML = "<div class='model-hint'>正在获取模型列表……</div>";

    try {
        const response = await fetch(p.baseUrl.replace(/\/+$/, "") + "/models", {
            headers: {
                "Authorization": "Bearer " + p.apiKey,
            },
        });

        if (!response.ok) {
            throw new Error("HTTP " + response.status);
        }

        const data = await response.json();
        const models = (data.data || []).map((m) => m.id).filter(Boolean);

        if (models.length === 0) {
            throw new Error("没有获取到模型");
        }

        modelPickerList.innerHTML = "";
        for (const id of models) {
            const item = document.createElement("button");
            item.type = "button";
            item.className = "model-item";
            item.textContent = id;
            item.addEventListener("click", () => {
                mModel.value = id;
                modelPicker.hidden = true;
            });
            modelPickerList.appendChild(item);
        }
    } catch (error) {
        modelPickerList.innerHTML = "<div class='model-hint'>获取失败：" + error.message + "</div>";
    }
}

mModel.addEventListener("focus", loadModelList);
mModel.addEventListener("input", () => {
    // 手动输入时收起模型列表
    modelPicker.hidden = true;
});

// 点击弹窗外区域关闭模型列表
document.addEventListener("click", (event) => {
    if (!modelField.contains(event.target)) {
        modelPicker.hidden = true;
    }
});

// ---------- 保存：加入列表（重名自动编号） ----------

mSave.addEventListener("click", () => {
    const p = readModalForm();

    if (!p.baseUrl) {
        modalStatus.textContent = "请填写 API 地址";
        return;
    }
    if (!p.model) {
        modalStatus.textContent = "请填写模型名称";
        return;
    }
    if (!p.apiKey) {
        modalStatus.textContent = "请填写 API 秘钥";
        return;
    }

    const store = loadStore();

    // 名称默认"模型名字"，重名时在后面加第几个的数字（编辑时排除自己）
    const baseName = p.name || "模型名字";
    let name = baseName;
    let count = 2;
    while (store.providers.some((x) => x.id !== editingProviderId && x.name === name)) {
        name = baseName + "(" + count + ")";
        count++;
    }

    if (editingProviderId) {
        // 编辑已有 API
        const idx = store.providers.findIndex((x) => x.id === editingProviderId);
        if (idx !== -1) {
            store.providers[idx] = {
                ...store.providers[idx],
                name: name,
                type: p.type,
                baseUrl: p.baseUrl,
                apiKey: p.apiKey,
                model: p.model,
            };
        }
    } else {
        // 新增
        const provider = { ...p, id: "p-" + Date.now(), name: name };
        store.providers.push(provider);
        if (!store.activeId) {
            store.activeId = provider.id;
        }
    }
    saveStore(store);
    renderProviders();
    closeModal();
});

// ---------- 测试连接（用弹窗里当前填的内容） ----------

mTest.addEventListener("click", async () => {
    const p = readModalForm();

    if (!p.baseUrl || !p.apiKey) {
        modalStatus.textContent = "请先填写 API 地址和秘钥";
        return;
    }

    modalStatus.textContent = "正在测试……";

    try {
        const response = await fetch(p.baseUrl.replace(/\/+$/, "") + "/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + p.apiKey,
            },
            body: JSON.stringify({
                model: p.model,
                messages: [{ role: "user", content: "你好" }],
                max_tokens: 4,
            }),
        });

        if (!response.ok) {
            throw new Error("HTTP " + response.status);
        }

        modalStatus.textContent = "连接成功 ✓";
    } catch (error) {
        modalStatus.textContent = "连接失败：" + error.message + "（如果提示跨域，请换支持跨域的中转地址）";
    }
});

// ================================
// 初始化
// ================================

renderProviders();

// 角色设定视图（我的角色）由 switchView 在切换时渲染
if (initialView === "role") {
    renderRoles();
}
