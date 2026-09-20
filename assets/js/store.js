// ================================
// 数据层（assets/js/store.js）
// 统一管理 localStorage：key 常量、读写封装、旧数据迁移
// 所有页面共用（index.html / user.html / 各子页面）
// ================================

window.Store = (function () {

    // 全部 localStorage key（只在这里定义一次）
    const KEYS = {
        settings: "xingyue_settings",   // API 提供商 + 我的角色
        prefs: "xingyue_prefs",         // 偏好（对话保留对数等）
        chat: "xingyue_chat",           // 对话历史（按角色会话分组）
        chatRole: "xingyue_chat_role",  // 当前聊天角色
        panel: "xingyue_panel",         // 面板状态
        user: "xingyue_user",           // 用户昵称 / 头像
        visited: "xingyue_visited",     // 是否已进入过首页
        lastEmail: "xingyue_last_email",// 上次登录用的邮箱（下次自动填充）
        memberNo: "xingyue_member_no",  // 默认显示名里的编号（小窝第 N 成员）
    };

    // ---------- 基础读写 ----------

    function readJSON(key, fallback) {
        try {
            const value = JSON.parse(localStorage.getItem(key));
            return value === null || value === undefined ? fallback : value;
        } catch {
            return fallback;
        }
    }

    function writeJSON(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (e) {
            console.warn("写入本地数据失败：" + key, e);
        }
    }

    // ---------- 设置（API 提供商 + 我的角色）----------

    // 读取设置并归一化（兼容旧版单提供商格式）
    function readSettings() {
        const raw = readJSON(KEYS.settings, null);
        if (!raw || typeof raw !== "object") {
            return { providers: [], activeId: null, roles: [], activeRoleId: null };
        }
        const store = { ...raw };

        // 旧版：单个配置对象 → providers 列表
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

        // 角色列表兜底
        if (!Array.isArray(store.roles)) {
            store.roles = [];
            store.activeRoleId = null;
        }
        if (!store.activeRoleId && store.roles.length > 0) {
            store.activeRoleId = store.roles[0].id;
        }
        return store;
    }

    function writeSettings(store) {
        writeJSON(KEYS.settings, store);
    }

    // 按 id 找"我的角色"
    function findRole(roleId) {
        if (!roleId) {
            return null;
        }
        const store = readSettings();
        return store.roles.find((r) => r.id === roleId) || null;
    }

    // ---------- 偏好 ----------

    function readPrefs() {
        const prefs = readJSON(KEYS.prefs, null);
        if (prefs && Number.isFinite(prefs.chatKeepPairs) && prefs.chatKeepPairs >= 1) {
            return prefs;
        }
        return { chatKeepPairs: 3 }; // 默认保留 3 对
    }

    function writePrefs(prefs) {
        writeJSON(KEYS.prefs, prefs);
    }

    // ---------- 对话历史（按角色会话分组）----------

    // 全部会话：{ 角色id: [消息...] }
    function readSessions() {
        const saved = readJSON(KEYS.chat, null);
        if (saved && saved.sessions && typeof saved.sessions === "object") {
            return saved.sessions;
        }
        return {};
    }

    // 旧格式（没有分组的消息数组）；没有则返回 null
    function readLegacyChat() {
        const saved = readJSON(KEYS.chat, null);
        return Array.isArray(saved) ? saved : null;
    }

    function writeSessions(sessions) {
        writeJSON(KEYS.chat, { sessions: sessions });
    }

    // 某个角色的会话（一定是数组）
    function getSession(roleId) {
        const list = readSessions()[roleId];
        return Array.isArray(list) ? list : [];
    }

    function setSession(roleId, list) {
        const sessions = readSessions();
        sessions[roleId] = list;
        writeSessions(sessions);
    }

    // ---------- 当前聊天角色 ----------

    function readChatRole() {
        const saved = readJSON(KEYS.chatRole, null);
        if (saved && saved.kind && saved.name) {
            return saved;
        }
        return { kind: "official", id: null, name: "星瑶" };
    }

    function writeChatRole(role) {
        writeJSON(KEYS.chatRole, role);
    }

    return {
        KEYS: KEYS,
        readJSON: readJSON,
        writeJSON: writeJSON,
        readSettings: readSettings,
        writeSettings: writeSettings,
        findRole: findRole,
        readPrefs: readPrefs,
        writePrefs: writePrefs,
        readSessions: readSessions,
        readLegacyChat: readLegacyChat,
        writeSessions: writeSessions,
        getSession: getSession,
        setSession: setSession,
        readChatRole: readChatRole,
        writeChatRole: writeChatRole,
    };
})();
