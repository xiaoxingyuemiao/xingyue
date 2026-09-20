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

    // 当前登录凭证（云端读写要用它做 Authorization）
    function accessToken() {
        const s = readSession();
        return (s && s.access_token) || "";
    }

    // ---------- 默认显示名：小窝第 N 成员 ----------
    // N 优先用云端分配的 uid（登录后由 cloud.js 同步到本地）；
    // 没有云端编号时，退回本机随机编号（保证界面总有名字可显示）。
    function memberNo() {
        const cloudUid = window.Store.readJSON(window.Store.KEYS.uid, 0);
        if (Number.isFinite(cloudUid) && cloudUid > 0) {
            return cloudUid;
        }
        let no = window.Store.readJSON(window.Store.KEYS.memberNo, 0);
        if (!Number.isFinite(no) || no <= 0) {
            no = Math.floor(Math.random() * 9000) + 1000;
            window.Store.writeJSON(window.Store.KEYS.memberNo, no);
        }
        return no;
    }

    function defaultDisplayName() {
        return "小窝第" + memberNo() + "成员";
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

    // 从错误响应里取出可读信息（英文 → 中文）
    async function errorText(res) {
        try {
            const data = await res.json();
            const raw = data.msg || data.error_description || data.error || data.message || ("HTTP " + res.status);
            return friendlyError(raw);
        } catch (e) {
            return "请求失败（HTTP " + res.status + "）";
        }
    }

    // Supabase 的英文错误 → 中文提示
    function friendlyError(raw) {
        const m = String(raw || "");
        const rules = [
            // 发信相关
            [/error sending confirmation email|error sending magic link|error sending email/i,
                "验证码邮件发送失败：请检查邮箱 SMTP 配置（授权码是否正确、端口是否为 465、发件邮箱是否与登录邮箱一致）"],
            [/error sending recovery email/i,
                "找回密码邮件发送失败，请检查邮箱配置"],
            // 密钥 / 配置
            [/invalid api key|no api key found|invalid apikey/i,
                "接口密钥无效：请检查 assets/data/supabase-config.js 里的配置"],
            // 验证码
            [/token has expired or is invalid|invalid token|otp_expired|invalid otp|invalid claim/i,
                "验证码错误或已过期，请重新获取（验证码 10 分钟内有效）"],
            [/email link is invalid or has expired/i,
                "链接已失效，请重新获取验证码"],
            // 频率限制
            [/for security purposes.*after (\d+) seconds|only request this after (\d+) seconds/i,
                "操作太频繁啦，请稍等一会儿再试"],
            [/email rate limit exceeded|over_email_send_rate_limit|rate limit/i,
                "验证码发送次数已达上限，请稍后再试"],
            // 账号
            [/user already registered/i,
                "这个邮箱已经注册过了，直接登录就行（或点「忘记密码」重置）"],
            [/signups not allowed/i,
                "当前设置不允许注册新用户"],
            [/unable to validate email|invalid format|email address.*invalid/i,
                "邮箱格式不正确，请检查后重试"],
            [/email not confirmed/i,
                "邮箱还没有验证，请先完成邮箱验证"],
            [/user not found/i,
                "这个邮箱还没有注册过，先去注册一个吧"],
            // 密码
            [/invalid login credentials/i,
                "邮箱或密码不正确，请检查后重试"],
            [/password should be at least (\d+) characters/i,
                "密码太短了，至少要 6 位"],
            [/new password should be different/i,
                "新密码不能和原密码一样"],
            [/weak password|password.*too weak/i,
                "密码强度太弱，换一个复杂点的吧"],
            [/auth session missing|session.*not found|invalid refresh token/i,
                "登录状态已失效，请重新登录"],
            // 网络
            [/failed to fetch|networkerror|load failed|network request failed/i,
                "网络连接失败，请检查网络后重试"],
        ];
        for (const [re, text] of rules) {
            if (re.test(m)) {
                return text;
            }
        }
        // 没匹配到：显示中文前缀 + 原文，方便排查
        return "操作失败（" + m + "）";
    }

    // 带网络异常处理的 fetch
    async function apiFetch(url, options) {
        try {
            return await fetch(url, options);
        } catch (e) {
            throw new Error("网络连接失败，请检查网络后重试");
        }
    }

    // ---------- 发送验证码（登录 / 注册用）----------

    async function sendCode(email) {
        if (!isConfigured()) {
            throw new Error("还没有配置 Supabase（见 assets/data/supabase-config.js）");
        }
        const res = await apiFetch(apiBase() + "/auth/v1/otp", {
            method: "POST",
            headers: headers(),
            body: JSON.stringify({ email: email, create_user: true }),
        });
        if (!res.ok) {
            throw new Error(await errorText(res));
        }
        return true;
    }

    // ---------- 统一的凭证保存 ----------

    function saveSessionFromAuth(data, fallbackEmail) {
        writeSession({
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            expires_at: Date.now() + (data.expires_in || 3600) * 1000,
            email: (data.user && data.user.email) || fallbackEmail,
            user_id: data.user && data.user.id,
        });
        emit();
        return current();
    }

    // 校验验证码（type: email 登录 / signup 注册确认 / recovery 找回密码）
    async function verifyToken(email, token, type) {
        if (!isConfigured()) {
            throw new Error("还没有配置 Supabase");
        }
        const res = await apiFetch(apiBase() + "/auth/v1/verify", {
            method: "POST",
            headers: headers(),
            body: JSON.stringify({ email: email, token: token, type: type }),
        });
        if (!res.ok) {
            throw new Error(await errorText(res));
        }
        return await res.json();
    }

    // ---------- 验证码登录 ----------

    async function verifyCode(email, token) {
        const data = await verifyToken(email, token, "email");
        return saveSessionFromAuth(data, email);
    }

    // ---------- 密码登录 ----------

    async function signInWithPassword(email, password) {
        if (!isConfigured()) {
            throw new Error("还没有配置 Supabase");
        }
        const res = await apiFetch(apiBase() + "/auth/v1/token?grant_type=password", {
            method: "POST",
            headers: headers(),
            body: JSON.stringify({ email: email, password: password }),
        });
        if (!res.ok) {
            throw new Error(await errorText(res));
        }
        const data = await res.json();
        return saveSessionFromAuth(data, email);
    }

    // ---------- 注册（邮箱 + 密码）----------
    // 返回 { needVerify: true } 表示还需要填邮件里的验证码
    // 返回 { needVerify: false } 表示项目没开邮箱确认，已经直接登录了

    async function signUp(email, password) {
        if (!isConfigured()) {
            throw new Error("还没有配置 Supabase");
        }
        const res = await apiFetch(apiBase() + "/auth/v1/signup", {
            method: "POST",
            headers: headers(),
            body: JSON.stringify({ email: email, password: password }),
        });
        if (!res.ok) {
            throw new Error(await errorText(res));
        }
        const data = await res.json();
        if (data.access_token) {
            saveSessionFromAuth(data, email);
            return { needVerify: false };
        }
        return { needVerify: true };
    }

    // 注册后的验证码确认（type: signup）
    async function verifySignup(email, token) {
        const data = await verifyToken(email, token, "signup");
        return saveSessionFromAuth(data, email);
    }

    // ---------- 忘记密码 ----------

    // 发重置密码邮件（邮件模板里的验证码来自 Reset password 模板）
    async function sendRecovery(email) {
        if (!isConfigured()) {
            throw new Error("还没有配置 Supabase");
        }
        const res = await apiFetch(apiBase() + "/auth/v1/recover", {
            method: "POST",
            headers: headers(),
            body: JSON.stringify({ email: email }),
        });
        if (!res.ok) {
            throw new Error(await errorText(res));
        }
        return true;
    }

    // 用找回验证码换取临时登录态（type: recovery）
    async function verifyRecovery(email, token) {
        const data = await verifyToken(email, token, "recovery");
        return saveSessionFromAuth(data, email);
    }

    // 修改当前登录用户的密码（需要已有登录凭证）
    async function updatePassword(newPassword) {
        const s = readSession();
        if (!s || !s.access_token) {
            throw new Error("登录状态已失效，请重新登录");
        }
        const res = await apiFetch(apiBase() + "/auth/v1/user", {
            method: "PUT",
            headers: headers(s.access_token),
            body: JSON.stringify({ password: newPassword }),
        });
        if (!res.ok) {
            throw new Error(await errorText(res));
        }
        return true;
    }

    // ---------- 刷新过期凭证 ----------

    async function refresh() {
        const s = readSession();
        if (!s || !s.refresh_token) {
            return null;
        }
        try {
            const res = await apiFetch(apiBase() + "/auth/v1/token?grant_type=refresh_token", {
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
                await apiFetch(apiBase() + "/auth/v1/logout", {
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
        accessToken: accessToken,
        defaultDisplayName: defaultDisplayName,
        onChange: onChange,
        sendCode: sendCode,
        verifyCode: verifyCode,
        refresh: refresh,
        signOut: signOut,
        init: init,
        // 密码 / 注册 / 找回密码
        signInWithPassword: signInWithPassword,
        signUp: signUp,
        verifySignup: verifySignup,
        sendRecovery: sendRecovery,
        verifyRecovery: verifyRecovery,
        updatePassword: updatePassword,
    };
})();
