// ================================
// 邮箱验证码登录（assets/js/auth.js）
// 用 Supabase Auth 的 REST 接口实现（原生 fetch，无需 SDK）：
//   1. 输入邮箱 → POST /auth/v1/otp      发送 6 位验证码
//   2. 输入验证码 → POST /auth/v1/verify  换取登录凭证
//   3. 会自动刷新过期凭证，支持退出登录
// 配置写在 assets/data/supabase-config.js（留空则登录功能关闭）
// 暴露：window.Auth
// ================================

window.Auth = (function () {

    const LS_KEY = "xingyue_auth"; // 登录凭证（存在浏览器本地）

    const listeners = [];

    function cfg() {
        return window.SUPABASE_CONFIG || {};
    }

    // 是否已配置 Supabase（没配置时登录功能关闭）
    function isConfigured() {
        const c = cfg();
        return !!(c.url && c.anonKey);
    }

    function apiBase() {
        return String(cfg().url || "").replace(/\/+$/, "");
    }

    function headers(token) {
        return {
            "Content-Type": "application/json",
            "apikey": cfg().anonKey,
            // 新版密钥要求带上 Bearer：未登录时用 publishable key，登录后用 access_token
            "Authorization": "Bearer " + (token || cfg().anonKey),
        };
    }

    // ---------- 凭证读写 ----------

    function readSession() {
        return window.Store.readJSON(LS_KEY, null);
    }

    function writeSession(session) {
        if (session) {
            window.Store.writeJSON(LS_KEY, session);
        } else {
            try {
                localStorage.removeItem(LS_KEY);
            } catch (e) {
                // 忽略
            }
        }
    }

    // 当前登录用户（未登录返回 null）
    function current() {
        const s = readSession();
        return s && s.email ? s : null;
    }

    function emit() {
        for (const cb of listeners) {
            try {
                cb(current());
            } catch (e) {
                console.warn("登录状态回调出错：", e);
            }
        }
    }

    // 监听登录状态变化
    function onChange(cb) {
        listeners.push(cb);
    }

    // 从错误响应里取出可读信息
    async function errorText(res) {
        try {
            const data = await res.json();
            return data.msg || data.error_description || data.error || ("请求失败（HTTP " + res.status + "）");
        } catch (e) {
            return "请求失败（HTTP " + res.status + "）";
        }
    }

    // ---------- 发送验证码 ----------

    async function sendCode(email) {
        if (!isConfigured()) {
            throw new Error("还没有配置 Supabase（见 assets/data/supabase-config.js）");
        }
        const res = await fetch(apiBase() + "/auth/v1/otp", {
            method: "POST",
            headers: headers(),
            body: JSON.stringify({ email: email, create_user: true }),
        });
        if (!res.ok) {
            throw new Error(await errorText(res));
        }
        return true;
    }

    // ---------- 验证码登录 ----------

    async function verifyCode(email, token) {
        if (!isConfigured()) {
            throw new Error("还没有配置 Supabase");
        }
        const res = await fetch(apiBase() + "/auth/v1/verify", {
            method: "POST",
            headers: headers(),
            body: JSON.stringify({ email: email, token: token, type: "email" }),
        });
        if (!res.ok) {
            throw new Error(await errorText(res));
        }
        const data = await res.json();
        writeSession({
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            expires_at: Date.now() + (data.expires_in || 3600) * 1000,
            email: (data.user && data.user.email) || email,
            user_id: data.user && data.user.id,
        });
        emit();
        return current();
    }

    // ---------- 刷新过期凭证 ----------

    async function refresh() {
        const s = readSession();
        if (!s || !s.refresh_token) {
            return null;
        }
        try {
            const res = await fetch(apiBase() + "/auth/v1/token?grant_type=refresh_token", {
                method: "POST",
                headers: headers(),
                body: JSON.stringify({ refresh_token: s.refresh_token }),
            });
            if (!res.ok) {
                writeSession(null);
                emit();
                return null;
            }
            const data = await res.json();
            writeSession({
                access_token: data.access_token,
                refresh_token: data.refresh_token,
                expires_at: Date.now() + (data.expires_in || 3600) * 1000,
                email: (data.user && data.user.email) || s.email,
                user_id: (data.user && data.user.id) || s.user_id,
            });
            emit();
            return current();
        } catch (e) {
            return null; // 网络问题时保持现状
        }
    }

    // ---------- 退出登录 ----------

    async function signOut() {
        const s = readSession();
        if (s && s.access_token && isConfigured()) {
            try {
                await fetch(apiBase() + "/auth/v1/logout", {
                    method: "POST",
                    headers: headers(s.access_token),
                });
            } catch (e) {
                // 网络失败也照样本地退出
            }
        }
        writeSession(null);
        emit();
    }

    // 页面启动时：凭证过期就先刷新一次
    async function init() {
        const s = readSession();
        if (s && s.expires_at && s.expires_at < Date.now() + 60000) {
            await refresh();
        }
        emit();
    }

    return {
        isConfigured: isConfigured,
        current: current,
        onChange: onChange,
        sendCode: sendCode,
        verifyCode: verifyCode,
        refresh: refresh,
        signOut: signOut,
        init: init,
    };
})();
