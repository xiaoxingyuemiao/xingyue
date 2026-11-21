// ================================
// 星月小窝 —— 设置页面脚本
// API 提供商管理（DeepSeek / 通义千问 / OpenAI 兼容，点击卡片切换）
// 角色设定（多角色卡片管理，支持导入本地 Live2D 模型）
// 对话（保留对数 + 清空 + 全部历史）
// 数据读写统一走 assets/js/store.js（与首页聊天共用 localStorage）
// ================================

// 注意：官方角色设定内容（System Prompt）不写在代码里，
// 由站长在 assets/data/official-roles.js 中维护（后台调整，推送 GitHub 即同步）。

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

// 角色搜索 / 角色导入导出
const roleSearch = document.querySelector("#role-search");
const roleExport = document.querySelector("#role-export");
const roleImportBtn = document.querySelector("#role-import-btn");
const roleImportFile = document.querySelector("#role-import-file");
const roleIoStatus = document.querySelector("#role-io-status");

// 对话记录导入
const historyImportBtn = document.querySelector("#history-import-btn");
const historyImportFile = document.querySelector("#history-import-file");

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
const rImport = document.querySelector("#r-import");
const rImportInput = document.querySelector("#r-import-input");
const rImportStatus = document.querySelector("#r-import-status");

// 当前正在编辑的 id（null = 新增，有值 = 双击卡片进入编辑）
let editingProviderId = null;
let editingRoleId = null;

// 角色搜索关键词（须在页面首次渲染前声明）
let roleQuery = "";

// 展开中的会话卡片（按角色 id 记住，重新渲染后不收起）
const expandedSessions = new Set();

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
    } else if (name === "points" && window.Points) {
        // 积分余额、商城、兑换单都要现取现显示
        window.Points.refresh();
    }
}

for (const item of navItems) {
    item.addEventListener("click", (event) => {
        event.preventDefault();
        switchView(item.dataset.view);
    });
}

// 打开页面时按 hash 定位视图（默认个人资料；#role / #api / #dialogue 可直达）
const initialView = (location.hash || "#profile").slice(1);
switchView(initialView);

// ================================
// 通用站内确认弹窗（替代浏览器原生 window.confirm，风格与站内弹窗一致）
// ================================

const confirmOverlay = document.querySelector("#confirm-overlay");
const confirmTitle = document.querySelector("#confirm-title");
const confirmText = document.querySelector("#confirm-text");
const confirmOk = document.querySelector("#confirm-ok");
const confirmCancel = document.querySelector("#confirm-cancel");
const confirmClose = document.querySelector("#confirm-close");

let confirmResolve = null;

// 返回 Promise<boolean>：true=点「确定」；取消 / 关闭 / Esc / 点遮罩均为 false
function confirmBox(message, options) {
    const opts = options || {};
    return new Promise((resolve) => {
        confirmTitle.textContent = opts.title || "请确认";
        confirmText.textContent = message;
        confirmOk.textContent = opts.okText || "确定";
        confirmOverlay.classList.add("open");
        confirmResolve = resolve;
        confirmOk.focus();
    });
}

function settleConfirm(value) {
    if (!confirmResolve) {
        return;
    }
    const resolve = confirmResolve;
    confirmResolve = null;
    confirmOverlay.classList.remove("open");
    resolve(value);
}

confirmOk.addEventListener("click", () => settleConfirm(true));
confirmCancel.addEventListener("click", () => settleConfirm(false));
confirmClose.addEventListener("click", () => settleConfirm(false));

confirmOverlay.addEventListener("click", (event) => {
    if (event.target === confirmOverlay) {
        settleConfirm(false);
    }
});

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && confirmOverlay.classList.contains("open")) {
        settleConfirm(false);
    }
});

// ================================
// 数据
// ================================

function loadStore() {
    // 归一化与旧版迁移统一在 store.js 里处理
    const store = window.Store.readSettings();
    window.Store.writeSettings(store);
    return store;
}

function saveStore(store) {
    window.Store.writeSettings(store);
}

function loadPrefs() {
    return window.Store.readPrefs();
}

// ================================
// 云端同步（设置 + 秘钥）
//   具体读写逻辑在 assets/js/cloud.js（首页也会用到），这里只做界面提示
// ================================

const syncKeyRow = document.querySelector("#sync-key-row");
const syncKeysBox = document.querySelector("#sync-keys");
const syncKeyStatus = document.querySelector("#sync-key-status");

function keysSynced() {
    return !!window.Store.readJSON(window.Store.KEYS.syncKey, false);
}

// 勾选框：切换「秘钥是否上云」
if (syncKeysBox) {
    syncKeysBox.checked = keysSynced();

    syncKeysBox.addEventListener("change", async () => {
        window.Store.writeJSON(window.Store.KEYS.syncKey, syncKeysBox.checked);

        if (!window.Cloud || !window.Cloud.isReady()) {
            syncKeyStatus.textContent = syncKeysBox.checked
                ? "已记住这个选择；登录后会自动同步到云端"
                : "已关闭：秘钥只留在本机";
            return;
        }

        syncKeyStatus.textContent = "正在同步……";
        try {
            await window.Cloud.pushSettings();
            syncKeyStatus.textContent = syncKeysBox.checked
                ? "已开启 ✓ 秘钥已加密上传到云端"
                : "已关闭 ✓ 云端上的秘钥已清空";
        } catch (e) {
            syncKeyStatus.textContent = "同步失败：" + (e.message || e);
        }
    });
}

// 静默同步：改了提供商 / 角色之后后台推一次（失败不打扰用户）
function syncSettingsQuietly() {
    if (!window.Cloud || !window.Cloud.isReady()) {
        return;
    }
    window.Cloud.pushSettings().catch((e) => {
        console.warn("设置同步到云端失败：", e);
    });
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
        card.title = "单击切换当前使用，点「编辑」修改";

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
                syncSettingsQuietly();
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

        // 测试按钮：直接用已保存的配置试一次，结果短暂显示在按钮上（完整原因看悬停提示）
        const testBtn = document.createElement("button");
        testBtn.className = "provider-btn";
        testBtn.textContent = "测试";
        testBtn.title = "用已保存的配置测试连接";
        testBtn.addEventListener("click", async (event) => {
            event.stopPropagation();
            testBtn.disabled = true;
            testBtn.textContent = "测试中…";
            const result = await testChatEndpoint(p);
            testBtn.textContent = result.indexOf("连接成功") === 0 ? "✓ 可用" : "✗ 失败";
            testBtn.title = result;
            setTimeout(() => {
                testBtn.disabled = false;
                testBtn.textContent = "测试";
                testBtn.title = "用已保存的配置测试连接";
            }, 4000);
        });

        // 编辑按钮（触屏可用；点击不触发切换）
        const editBtn = document.createElement("button");
        editBtn.className = "provider-btn";
        editBtn.textContent = "编辑";
        editBtn.addEventListener("click", (event) => {
            event.stopPropagation();
            openModal(p);
        });

        // 删除按钮（点击不触发切换）
        const delBtn = document.createElement("button");
        delBtn.className = "provider-btn provider-btn-del";
        delBtn.textContent = "删除";
        delBtn.addEventListener("click", async (event) => {
            event.stopPropagation();
            const ok = await confirmBox("确定删除「" + p.name + "」吗？API 秘钥会一并从本机删除。", { title: "删除 API", okText: "删除" });
            if (!ok) {
                return;
            }
            const s = loadStore();
            s.providers = s.providers.filter((x) => x.id !== p.id);
            if (s.activeId === p.id) {
                s.activeId = s.providers[0] ? s.providers[0].id : null;
            }
            saveStore(s);
            renderProviders();
            syncSettingsQuietly();
        });

        const actions = document.createElement("div");
        actions.className = "provider-card-actions";
        actions.appendChild(testBtn);
        actions.appendChild(editBtn);
        actions.appendChild(delBtn);

        card.appendChild(info);
        card.appendChild(actions);
        providerList.appendChild(card);
    }
}

// ================================
// 视图二：角色设定（多角色卡片，点击切换）
// ================================

function renderRoles() {
    const store = loadStore();
    roleList.innerHTML = "";

    // 空状态
    if (store.roles.length === 0) {
        const empty = document.createElement("div");
        empty.className = "provider-empty";
        empty.textContent = "还没有添加任何角色，点击下方按钮添加一个吧～";
        roleList.appendChild(empty);
        return;
    }

    // 搜索过滤（名字 / 设定内容，忽略大小写）
    const query = roleQuery.trim().toLowerCase();
    const shown = query
        ? store.roles.filter((r) =>
            String(r.name).toLowerCase().indexOf(query) !== -1 ||
            String(r.prompt).toLowerCase().indexOf(query) !== -1)
        : store.roles;

    if (shown.length === 0) {
        const empty = document.createElement("div");
        empty.className = "provider-empty";
        empty.textContent = "没有匹配「" + roleQuery.trim() + "」的角色，换个关键词试试";
        roleList.appendChild(empty);
        return;
    }

    for (const role of shown) {
        const card = document.createElement("div");
        card.className = "role-card" + (role.id === store.activeRoleId ? " role-card-active" : "");
        card.title = "单击切换当前角色，点「编辑」修改";

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
                syncSettingsQuietly();
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

        // 编辑按钮（触屏可用；点击不触发切换）
        const editBtn = document.createElement("button");
        editBtn.className = "provider-btn";
        editBtn.textContent = "编辑";
        editBtn.addEventListener("click", (event) => {
            event.stopPropagation();
            openRoleModal(role);
        });

        const delBtn = document.createElement("button");
        delBtn.className = "provider-btn provider-btn-del";
        delBtn.textContent = "删除";
        delBtn.addEventListener("click", async (event) => {
            event.stopPropagation();
            const ok = await confirmBox("确定删除角色「" + role.name + "」吗？该角色的对话历史仍会保留，导入的本地模型会被清理。", { title: "删除角色", okText: "删除" });
            if (!ok) {
                return;
            }
            const s = loadStore();
            s.roles = s.roles.filter((x) => x.id !== role.id);
            if (s.activeRoleId === role.id) {
                s.activeRoleId = s.roles[0] ? s.roles[0].id : null;
            }
            saveStore(s);
            renderRoles();
            syncSettingsQuietly();
            // 清理该角色导入的本地模型缓存（如果有）
            if (window.L2D_CUSTOM) {
                window.L2D_CUSTOM.clearRole(role.id).catch(() => {});
            }
        });

        const actions = document.createElement("div");
        actions.className = "provider-card-actions";
        actions.appendChild(editBtn);
        actions.appendChild(delBtn);

        card.appendChild(info);
        card.appendChild(actions);
        roleList.appendChild(card);
    }
}

// ---------- 角色搜索 / 导出 / 导入 ----------

roleSearch.addEventListener("input", () => {
    roleQuery = roleSearch.value;
    renderRoles();
});

// 导出为 JSON 文件（备份 / 分享用；导入的本地 Live2D 模型只在本机可用，不随文件走）
roleExport.addEventListener("click", () => {
    const store = loadStore();
    if (store.roles.length === 0) {
        roleIoStatus.textContent = "还没有角色可以导出";
        return;
    }
    const payload = {
        app: "xingyue-roles",
        exported_at: new Date().toISOString(),
        roles: store.roles.map((r) => ({ name: r.name, prompt: r.prompt, model: r.model || "" })),
    };
    downloadFile("星月小窝-角色-" + fileDateTag() + ".json",
        JSON.stringify(payload, null, 2), "application/json");
    roleIoStatus.textContent = "已导出 " + payload.roles.length + " 个角色 ✓";
});

roleImportBtn.addEventListener("click", () => {
    roleImportFile.click();
});

roleImportFile.addEventListener("change", async () => {
    const file = roleImportFile.files && roleImportFile.files[0];
    roleImportFile.value = "";
    if (!file) {
        return;
    }

    let list;
    try {
        const data = JSON.parse(await file.text());
        list = Array.isArray(data) ? data : data.roles;
        if (!Array.isArray(list)) {
            throw new Error("文件里找不到角色列表");
        }
    } catch (e) {
        roleIoStatus.textContent = "✗ 读取失败：" + (e.message || e);
        return;
    }

    const valid = list.filter((r) =>
        r && typeof r.name === "string" && typeof r.prompt === "string" && r.prompt.trim());

    if (valid.length === 0) {
        roleIoStatus.textContent = "✗ 文件里没有有效角色（需要 name + prompt）";
        return;
    }

    const ok = await confirmBox("从文件读到 " + valid.length + " 个角色，确定导入吗？同名角色会自动编号，不会覆盖。", { title: "导入角色", okText: "导入" });
    if (!ok) {
        return;
    }

    const store = loadStore();
    let added = 0;
    for (const r of valid) {
        const baseName = String(r.name).trim().slice(0, 30) || "未命名角色";
        let finalName = baseName;
        let count = 2;
        while (store.roles.some((x) => x.name === finalName)) {
            finalName = baseName + "(" + count + ")";
            count++;
        }
        store.roles.push({
            id: "role-" + Date.now() + "-" + added,
            name: finalName,
            prompt: String(r.prompt).trim(),
            model: typeof r.model === "string" ? r.model.slice(0, 300) : "",
        });
        added++;
    }
    if (!store.activeRoleId) {
        store.activeRoleId = store.roles[store.roles.length - 1].id;
    }
    saveStore(store);
    renderRoles();
    syncSettingsQuietly();
    roleIoStatus.textContent = "✓ 已导入 " + added + " 个角色";
});

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

// ---------- 导入本地 Live2D 模型文件夹 ----------

// 点击按钮 → 打开文件夹选择（webkitdirectory 支持选整个文件夹）
rImport.addEventListener("click", () => {
    rImportInput.click();
});

rImportInput.addEventListener("change", async () => {
    const files = rImportInput.files;
    rImportInput.value = "";
    if (!files || files.length === 0) {
        return;
    }
    rImportStatus.textContent = "正在导入模型文件（大模型需要一点时间）……";
    const roleId = editingRoleId || "role-" + Date.now();
    try {
        const entry = await window.L2D_CUSTOM.importFolder(roleId, files);
        if (entry) {
            rModel.value = "custom:" + entry;
            rImportStatus.textContent = "✓ 模型导入成功：" + entry + "（保存角色后生效，仅本浏览器可用）";
        } else {
            rImportStatus.textContent = "✗ 没找到 model3.json / model.json，请选择完整的模型文件夹";
        }
    } catch (e) {
        console.warn("模型导入失败：", e);
        rImportStatus.textContent = "✗ 导入失败：" + (e.message || e);
    }
});

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
    syncSettingsQuietly();
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
    window.Store.writePrefs({ chatKeepPairs: n });
    keepStatus.textContent = "已保存 ✓ 聊天时会带上最近 " + n + " 对对话作为上下文";
});

historyClear.addEventListener("click", async () => {
    const ok = await confirmBox("确定清空所有角色的全部对话历史吗？此操作不可恢复。", { title: "清空对话历史", okText: "清空" });
    if (!ok) {
        return;
    }
    window.Store.writeSessions({});
    keepStatus.textContent = "对话历史已清空 ✓";
    renderHistory();
});

// 读取本地全部会话（按角色分组）
function loadSessions() {
    // 旧格式：无分组的数组 → 归到当前角色名下
    const legacy = window.Store.readLegacyChat();
    if (legacy) {
        const store = loadStore();
        const roleId = store.activeRoleId || (store.roles[0] && store.roles[0].id) || "role-default";
        return { [roleId]: legacy };
    }
    return window.Store.readSessions();
}

function saveSessions(sessions) {
    window.Store.writeSessions(sessions);
}

// ---------- 导出 / 导入的小工具 ----------

function downloadFile(filename, text, mime) {
    const blob = new Blob([text], { type: mime || "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function fileDateTag() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate());
}

// 文件名里去掉浏览器 / 文件系统不接受的字符
function safeFileName(name) {
    return String(name || "角色").replace(/[\\/:*?"<>|\s]+/g, "_").slice(0, 40);
}

// 按天分组用的标签；老消息没有 time 字段时归入「更早」
function dayLabel(ts) {
    if (!Number.isFinite(ts)) {
        return "更早（未记录时间）";
    }
    const d = new Date(ts);
    const now = new Date();
    const sameDay = (a, b) =>
        a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    const label = d.getFullYear() + "年" + (d.getMonth() + 1) + "月" + d.getDate() + "日";
    if (sameDay(d, now)) {
        return "今天 · " + label;
    }
    if (sameDay(d, new Date(now.getTime() - 86400000))) {
        return "昨天 · " + label;
    }
    return label;
}

function buildSessionTxt(title, messages) {
    const lines = [
        "星月小窝对话记录 · " + title,
        "导出时间：" + new Date().toLocaleString("zh-CN"),
    ];
    let lastDay = null;
    for (const m of messages) {
        const day = dayLabel(m.time);
        if (day !== lastDay) {
            lines.push("", "———— " + day + " ————");
            lastDay = day;
        }
        lines.push((m.isUser ? "小喵" : "星瑶") + "：" + m.text);
    }
    return lines.join("\n") + "\n";
}

// 渲染对话记录：每个角色一张会话卡片（点击展开 / 折叠，展开状态会记住），
// 卡片头可导出该会话为 TXT / JSON，消息按天分组，单条支持修改 / 删除
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
        card.className = "session-card" + (expandedSessions.has(roleId) ? " expanded" : "");

        // 卡片头：角色名 + 消息数 + 导出 / 删除（点击卡片展开 / 折叠）
        const head = document.createElement("div");
        head.className = "session-card-head";
        head.title = "点击展开 / 折叠整个会话";

        const info = document.createElement("div");
        info.className = "session-card-info";

        const sessionTitle = roleNameById[roleId] ||
            (roleId.indexOf("official-") === 0 ? roleId.slice("official-".length) + "（官方）" : "角色");

        const nameEl = document.createElement("span");
        nameEl.className = "session-card-name";
        nameEl.textContent = sessionTitle;
        info.appendChild(nameEl);

        const countEl = document.createElement("span");
        countEl.className = "session-card-count";
        countEl.textContent = messages.length + " 条消息";
        info.appendChild(countEl);

        head.appendChild(info);

        const headActions = document.createElement("div");
        headActions.className = "session-card-actions";

        const fileTag = safeFileName(sessionTitle) + "-" + fileDateTag();

        const exportTxtBtn = document.createElement("button");
        exportTxtBtn.type = "button";
        exportTxtBtn.className = "history-item-btn";
        exportTxtBtn.textContent = "导出 TXT";
        exportTxtBtn.title = "导出为纯文本，方便直接阅读";
        exportTxtBtn.addEventListener("click", (event) => {
            event.stopPropagation();
            downloadFile("星月小窝对话-" + fileTag + ".txt",
                buildSessionTxt(sessionTitle, messages), "text/plain;charset=utf-8");
        });
        headActions.appendChild(exportTxtBtn);

        const exportJsonBtn = document.createElement("button");
        exportJsonBtn.type = "button";
        exportJsonBtn.className = "history-item-btn";
        exportJsonBtn.textContent = "导出 JSON";
        exportJsonBtn.title = "导出为 JSON，之后可用「导入记录」导回";
        exportJsonBtn.addEventListener("click", (event) => {
            event.stopPropagation();
            downloadFile("星月小窝对话-" + fileTag + ".json", JSON.stringify({
                app: "xingyue-chat",
                exported_at: new Date().toISOString(),
                sessions: { [roleId]: messages }
            }, null, 2), "application/json");
        });
        headActions.appendChild(exportJsonBtn);

        const delSessionBtn = document.createElement("button");
        delSessionBtn.type = "button";
        delSessionBtn.className = "history-item-btn history-item-btn-del";
        delSessionBtn.textContent = "删除";
        delSessionBtn.addEventListener("click", async (event) => {
            event.stopPropagation();
            const ok = await confirmBox("确定删除这个角色的全部对话历史吗？可先用「导出」留个备份。", { title: "删除会话", okText: "删除" });
            if (!ok) {
                return;
            }
            const s = loadSessions();
            delete s[roleId];
            expandedSessions.delete(roleId);
            saveSessions(s);
            renderHistory();
        });
        headActions.appendChild(delSessionBtn);

        head.appendChild(headActions);

        head.addEventListener("click", () => {
            const opened = card.classList.toggle("expanded");
            if (opened) {
                expandedSessions.add(roleId);
            } else {
                expandedSessions.delete(roleId);
            }
        });

        // 卡片体：该会话的全部消息（按天分组，默认折叠隐藏）
        const body = document.createElement("div");
        body.className = "session-card-body";

        let lastDay = null;

        messages.forEach((m, index) => {
            const day = dayLabel(m.time);
            if (day !== lastDay) {
                const dateEl = document.createElement("div");
                dateEl.className = "history-date";
                dateEl.textContent = day;
                body.appendChild(dateEl);
                lastDay = day;
            }

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
            delBtn.addEventListener("click", async () => {
                const ok = await confirmBox("确定删除这条对话消息吗？", { title: "删除消息", okText: "删除" });
                if (!ok) {
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

// 导入对话记录：从「导出 JSON」得到的文件导回，同名角色的记录会被覆盖
historyImportBtn.addEventListener("click", () => {
    historyImportFile.click();
});

historyImportFile.addEventListener("change", async () => {
    const file = historyImportFile.files && historyImportFile.files[0];
    historyImportFile.value = "";
    if (!file) {
        return;
    }

    let data;
    try {
        data = JSON.parse(await file.text());
    } catch (e) {
        keepStatus.textContent = "这个文件读不出 JSON，请确认是用「导出 JSON」导出的文件";
        return;
    }

    // 兼容两种形态：整包 { sessions: {roleId: [messages]} }，或直接 {roleId: [messages]}
    const groups = data && data.sessions && typeof data.sessions === "object" ? data.sessions : data;
    if (!groups || typeof groups !== "object" || Array.isArray(groups)) {
        keepStatus.textContent = "文件里没有识别出对话记录";
        return;
    }

    const store = loadStore();
    const imported = {};
    for (const roleId of Object.keys(groups)) {
        const list = Array.isArray(groups[roleId]) ? groups[roleId] : [];
        const clean = [];
        for (const m of list) {
            if (!m || typeof m.text !== "string" || !m.text.trim()) {
                continue;
            }
            const one = {
                name: typeof m.name === "string" ? m.name : (m.isUser ? "小喵" : "星瑶"),
                text: m.text,
                isUser: !!m.isUser
            };
            if (Number.isFinite(m.time)) {
                one.time = m.time;
            }
            clean.push(one);
        }
        if (clean.length > 0) {
            imported[roleId] = clean;
        }
    }

    const ids = Object.keys(imported);
    if (ids.length === 0) {
        keepStatus.textContent = "文件里没有可用的对话消息";
        return;
    }

    const names = ids.map((id) => {
        const r = store.roles.find((item) => item.id === id);
        if (r) {
            return r.name;
        }
        return id.indexOf("official-") === 0 ? id.slice("official-".length) + "（官方）" : "未知角色";
    });

    const ok = await confirmBox(
        "将导入 " + ids.length + " 个角色的记录（" + names.join("、") + "），同名角色的现有记录会被覆盖。确定吗？",
        { title: "导入对话记录", okText: "导入" }
    );
    if (!ok) {
        return;
    }

    const sessions = loadSessions();
    Object.assign(sessions, imported);
    saveSessions(sessions);
    for (const id of ids) {
        expandedSessions.delete(id);
    }
    renderHistory();
    keepStatus.textContent = "✓ 已导入 " + ids.length + " 个角色的对话记录";
});

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
        // 用 textContent 而不是 innerHTML：error.message 里可能含用户自己填的 baseUrl，
        // 拼进 innerHTML 等于给自己开了个注入口（见 docs/08 §4.2）
        modelPickerList.innerHTML = "";
        const hint = document.createElement("div");
        hint.className = "model-hint";
        hint.textContent = "获取失败：" + error.message;
        modelPickerList.appendChild(hint);
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
    syncSettingsQuietly();
    closeModal();
});

// ---------- 测试连接（弹窗表单与卡片共用同一套请求） ----------

// 发一条最短对话验证地址 + 秘钥 + 模型可用；返回一句可直接展示的结果文本
async function testChatEndpoint(p) {
    if (!p.baseUrl || !p.apiKey) {
        return "请先填写 API 地址和秘钥";
    }

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

        return "连接成功 ✓";
    } catch (error) {
        return "连接失败：" + error.message + "（如果提示跨域，请换支持跨域的中转地址）";
    }
}

mTest.addEventListener("click", async () => {
    modalStatus.textContent = "正在测试……";
    modalStatus.textContent = await testChatEndpoint(readModalForm());
});

// ================================
// 初始化
// ================================

renderProviders();

// 角色设定视图（我的角色）由 switchView 在切换时渲染
if (initialView === "role") {
    renderRoles();
}
