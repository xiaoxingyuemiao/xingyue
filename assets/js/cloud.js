// ================================
// 云端同步模块（assets/js/cloud.js）
// 用 Supabase 的 REST 接口读写「当前登录用户自己的」数据（配合数据库的行级安全 RLS）：
//   profiles       用户资料：uid / 昵称 / 头像 / 签名
//   user_settings  设置：API 提供商 + 我的角色（+ 用户选择同步的加密秘钥）
//   chat_sessions  对话记录：按角色分组
//
// 依赖：store.js（本地数据）、supabase-config.js（配置）、auth.js（拿登录凭证）
// 暴露：window.Cloud
// ================================

window.Cloud = (function () {

    // ---------- 基础 ----------

    function cfg() {
        return window.SUPABASE_CONFIG || {};
    }

    function isConfigured() {
        const c = cfg();
        return !!(c.url && c.anonKey);
    }

    // 已配置 + 已登录，才能读写云端
    function isReady() {
        return isConfigured() && !!window.Auth.current();
    }

    function restBase() {
        return String(cfg().url || "").replace(/\/+$/, "") + "/rest/v1/";
    }

    function authHeaders(extra) {
        const token = (window.Auth.accessToken && window.Auth.accessToken()) || cfg().anonKey;
        const base = {
            "apikey": cfg().anonKey,
            "Authorization": "Bearer " + token,
            "Content-Type": "application/json",
        };
        return Object.assign(base, extra || {});
    }

    async function request(path, options) {
        if (!isReady()) {
            throw new Error("未登录或未配置云端");
        }
        const res = await fetch(restBase() + path, Object.assign({ headers: authHeaders() }, options || {}));
        if (!res.ok) {
            let detail = "";
            try {
                detail = JSON.stringify(await res.json());
            } catch (e) {
                detail = "HTTP " + res.status;
            }
            throw new Error("云端请求失败：" + detail);
        }
        const text = await res.text();
        return text ? JSON.parse(text) : null;
    }

    // ---------- 用户资料 ----------

    // 读自己的资料行（返回 { uid, nickname, avatar, signature } 或 null）
    async function profile() {
        const user = window.Auth.current();
        if (!user) {
            return null;
        }
        const rows = await request("profiles?select=uid,nickname,avatar,signature&user_id=eq." + user.user_id);
        return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    }

    // 保存资料：只更新自己那一行
    // （行由数据库触发器在注册时创建；uid 只由数据库分配，前端不提供）
    async function saveProfile(data) {
        const user = window.Auth.current();
        if (!user) {
            throw new Error("未登录");
        }
        const rows = await request("profiles?user_id=eq." + user.user_id, {
            method: "PATCH",
            headers: authHeaders({ "Prefer": "return=representation" }),
            body: JSON.stringify({
                nickname: data.nickname || "",
                avatar: data.avatar || "",
                signature: data.signature || "",
                updated_at: new Date().toISOString(),
            }),
        });
        if (!Array.isArray(rows) || rows.length === 0) {
            throw new Error("云端还没有你的资料行（请在 Supabase SQL Editor 里执行 tools/supabase-schema.sql 的「补齐历史用户」那段）");
        }
        return rows[0];
    }

    // ---------- 用户设置（API 提供商 + 我的角色） ----------

    async function settings() {
        const user = window.Auth.current();
        if (!user) {
            return null;
        }
        const rows = await request("user_settings?select=data&user_id=eq." + user.user_id);
        return Array.isArray(rows) && rows.length > 0 ? (rows[0].data || {}) : null;
    }

    async function saveSettings(data) {
        const user = window.Auth.current();
        if (!user) {
            throw new Error("未登录");
        }
        await request("user_settings?on_conflict=user_id", {
            method: "POST",
            headers: authHeaders({ "Prefer": "resolution=merge-duplicates,return=minimal" }),
            body: JSON.stringify({
                user_id: user.user_id,
                data: data || {},
                updated_at: new Date().toISOString(),
            }),
        });
        return true;
    }

    // ---------- 对话记录 ----------

    async function sessions() {
        const user = window.Auth.current();
        if (!user) {
            return null;
        }
        const rows = await request("chat_sessions?select=role_key,messages");
        const out = {};
        for (const row of rows || []) {
            out[row.role_key] = row.messages || [];
        }
        return out;
    }

    async function saveSession(roleKey, messages) {
        const user = window.Auth.current();
        if (!user || !roleKey) {
            return false;
        }
        await request("chat_sessions?on_conflict=user_id,role_key", {
            method: "POST",
            headers: authHeaders({ "Prefer": "resolution=merge-duplicates,return=minimal" }),
            body: JSON.stringify({
                user_id: user.user_id,
                role_key: roleKey,
                messages: messages || [],
                updated_at: new Date().toISOString(),
            }),
        });
        return true;
    }

    // ---------- 设置整体同步（API 提供商 + 我的角色 + 秘钥勾选） ----------

    function keysSynced() {
        return !!window.Store.readJSON(window.Store.KEYS.syncKey, false);
    }

    // 本地设置 → 云端（秘钥按用户勾选决定是否加密上传）
    async function pushSettings() {
        if (!isReady()) {
            return false;
        }
        const store = window.Store.readSettings();
        const syncKeys = keysSynced();
        const providers = [];

        for (const p of store.providers) {
            providers.push({
                id: p.id,
                name: p.name,
                type: p.type,
                baseUrl: p.baseUrl,
                model: p.model,
                // 勾选了才加密上传；没勾就留空，云端拿不到明文秘钥
                apiKeyEnc: (syncKeys && p.apiKey) ? await encryptText(p.apiKey) : "",
            });
        }

        await saveSettings({
            providers: providers,
            roles: store.roles,
            syncKeys: syncKeys,
        });
        return true;
    }

    // 云端设置 → 本地（秘钥解密后填回 apiKey；云端没有的秘钥保留本地那份）
    async function pullSettings() {
        if (!isReady()) {
            return false;
        }
        const data = await settings();
        if (!data) {
            return false;
        }

        const local = window.Store.readSettings();
        const providers = [];

        for (const p of (data.providers || [])) {
            let apiKey = p.apiKeyEnc ? await decryptText(p.apiKeyEnc) : "";
            if (!apiKey) {
                const old = local.providers.find((x) => x.id === p.id);
                apiKey = (old && old.apiKey) || "";
            }
            providers.push({
                id: p.id,
                name: p.name,
                type: p.type,
                baseUrl: p.baseUrl,
                model: p.model,
                apiKey: apiKey,
            });
        }

        if (providers.length > 0) {
            local.providers = providers;
            if (!local.activeId || !providers.some((p) => p.id === local.activeId)) {
                local.activeId = providers[0].id;
            }
        }
        if (Array.isArray(data.roles) && data.roles.length > 0) {
            local.roles = data.roles;
            if (!local.activeRoleId || !local.roles.some((r) => r.id === local.activeRoleId)) {
                local.activeRoleId = local.roles[0].id;
            }
        }
        if (typeof data.syncKeys === "boolean") {
            window.Store.writeJSON(window.Store.KEYS.syncKey, data.syncKeys);
        }

        window.Store.writeSettings(local);
        return true;
    }

    // ---------- 注销账号 ----------
    // 删除 Supabase 账号：数据库触发器会把 uid 还回池子，
    // 资料 / 设置 / 对话记录会被级联删除
    async function deleteAccount() {
        const token = window.Auth.accessToken && window.Auth.accessToken();
        if (!token || !isConfigured()) {
            throw new Error("未登录或未配置云端");
        }
        const res = await fetch(String(cfg().url).replace(/\/+$/, "") + "/auth/v1/user", {
            method: "DELETE",
            headers: {
                "apikey": cfg().anonKey,
                "Authorization": "Bearer " + token,
            },
        });
        if (!res.ok) {
            throw new Error("注销失败（HTTP " + res.status + "）");
        }
        return true;
    }

    // ================================
    // 秘钥加密（用户选择「同步到云端」时才用）
    // 密钥由 uid + 登录邮箱推导，前端可重建；数据库里存的是密文。
    // 配合 RLS，别人本来就拿不到这行数据；加密是第二层防护。
    // ================================

    const FIELD_SALT = "xingyue-field-v1";

    async function fieldKey() {
        const user = window.Auth.current();
        if (!user) {
            throw new Error("未登录");
        }
        const raw = FIELD_SALT + "|" + (user.user_id || "") + "|" + (user.email || "");
        const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
        return crypto.subtle.importKey("raw", new Uint8Array(digest), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
    }

    function toBase64(bytes) {
        let s = "";
        for (const b of bytes) {
            s += String.fromCharCode(b);
        }
        return btoa(s);
    }

    function fromBase64(text) {
        const bin = atob(String(text || ""));
        const out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) {
            out[i] = bin.charCodeAt(i);
        }
        return out;
    }

    // 明文 → "v1.<base64(iv+cipher)>"
    async function encryptText(plain) {
        if (!plain) {
            return "";
        }
        const key = await fieldKey();
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const enc = new Uint8Array(await crypto.subtle.encrypt(
            { name: "AES-GCM", iv: iv },
            key,
            new TextEncoder().encode(String(plain))
        ));
        const joined = new Uint8Array(iv.length + enc.length);
        joined.set(iv, 0);
        joined.set(enc, iv.length);
        return "v1." + toBase64(joined);
    }

    // "v1.<base64>" → 明文（失败返回空串）
    async function decryptText(cipher) {
        const text = String(cipher || "");
        if (text.indexOf("v1.") !== 0) {
            return "";
        }
        try {
            const key = await fieldKey();
            const bytes = fromBase64(text.slice(3));
            const iv = bytes.subarray(0, 12);
            const data = bytes.subarray(12);
            const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, key, data);
            return new TextDecoder().decode(plain);
        } catch (e) {
            return ""; // 解不开（换了账号 / 数据损坏）就当没有
        }
    }

    return {
        isConfigured: isConfigured,
        isReady: isReady,
        profile: profile,
        saveProfile: saveProfile,
        settings: settings,
        saveSettings: saveSettings,
        pushSettings: pushSettings,
        pullSettings: pullSettings,
        keysSynced: keysSynced,
        sessions: sessions,
        saveSession: saveSession,
        deleteAccount: deleteAccount,
        encryptText: encryptText,
        decryptText: decryptText,
    };
})();
