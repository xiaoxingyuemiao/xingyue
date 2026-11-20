// ================================
// 云端同步模块（assets/js/cloud.js）
// 读写本地 xingyue-api 的「当前登录用户自己的」数据（/me/*，服务端按 token 强制过滤）：
//   GET/PUT  /me/profile    用户资料：uid / 昵称 / 头像 / 签名
//   GET/PUT  /me/settings   设置：API 提供商 + 我的角色（+ 用户选择同步的加密秘钥）
//   GET/PUT  /me/sessions   对话记录：按角色分组
//   POST     /me/delete     注销账号（需当前密码 + 邮箱验证码）
//
// 依赖：store.js（本地数据）、api-config.js（后端地址）、auth.js（拿登录凭证）
// 暴露：window.Cloud
// ================================

window.Cloud = (function () {

    // ---------- 基础 ----------

    function base() {
        return (window.XY_API && window.XY_API.base) || "";
    }

    function isConfigured() {
        return !!base();
    }

    // 已配置 + 已登录，才能读写云端
    function isReady() {
        return isConfigured() && !!window.Auth.current();
    }

    async function request(path, options) {
        if (!isReady()) {
            throw new Error("未登录或未配置后端");
        }
        const opts = Object.assign({}, options || {});
        opts.headers = Object.assign(
            {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + window.Auth.accessToken(),
            },
            opts.headers || {}
        );
        let res;
        try {
            res = await fetch(base() + path, opts);
        } catch (e) {
            throw new Error("连不上后端服务（" + base() + "），请确认 xingyue-api 已启动");
        }
        if (!res.ok) {
            let detail = "HTTP " + res.status;
            try {
                const data = await res.json();
                detail = data.msg || detail;
            } catch (e) {
                // 非 JSON 响应
            }
            throw new Error(detail);
        }
        const text = await res.text();
        return text ? JSON.parse(text) : null;
    }

    // ---------- 用户资料 ----------

    // 读自己的资料（返回 { uid, nickname, avatar, signature }）
    async function profile() {
        if (!isReady()) {
            return null;
        }
        return await request("/me/profile");
    }

    // 保存资料（uid 由后端分配，前端不提供）
    async function saveProfile(data) {
        return await request("/me/profile", {
            method: "PUT",
            body: JSON.stringify({
                nickname: data.nickname || "",
                avatar: data.avatar || "",
                signature: data.signature || "",
            }),
        });
    }

    // ---------- 用户设置（API 提供商 + 我的角色） ----------

    async function settings() {
        if (!isReady()) {
            return null;
        }
        return await request("/me/settings");
    }

    async function saveSettings(data) {
        await request("/me/settings", {
            method: "PUT",
            body: JSON.stringify({ data: data || {} }),
        });
        return true;
    }

    // ---------- 对话记录 ----------

    async function sessions() {
        if (!isReady()) {
            return null;
        }
        return await request("/me/sessions");
    }

    async function saveSession(roleKey, messages) {
        if (!roleKey) {
            return false;
        }
        await request("/me/sessions", {
            method: "PUT",
            body: JSON.stringify({ role_key: roleKey, messages: messages || [] }),
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
    // 后端一次校验「当前密码 + delete 场景邮箱验证码」，通过后回收 uid 并级联删除全部数据

    async function deleteAccount(password, code) {
        await request("/me/delete", {
            method: "POST",
            body: JSON.stringify({ password: password, code: code }),
        });
        return true;
    }

    // ================================
    // 秘钥加密（用户选择「同步到云端」时才用）
    // 密钥由 uid + 登录邮箱推导，前端可重建；数据库里存的是密文。
    // 服务端本来就只允许本人读写这行数据；加密是第二层防护。
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