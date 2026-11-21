// ================================
// 登录态模块（assets/js/auth.js）
// 对接本地 xingyue-api（ThinkPHP 8）的 /auth/* 接口（原生 fetch，无需 SDK）：
//   POST /auth/send-code       发送邮箱验证码（scene：register / login / reset / delete / change_email）
//   PUT  /auth/password        修改密码（需登录，带当前密码）
//   POST /auth/login           邮箱或手机号 + 密码登录
//   POST /auth/login-code      邮箱验证码登录（未注册邮箱自动注册）
//   POST /auth/register        注册（邮箱 + 密码 + 验证码，手机号选填）
//   POST /auth/reset-password  找回密码（验证码 + 新密码，成功后直接是登录态）
//   POST /auth/refresh         过期凭证换新（旧的即作废）
//   POST /auth/logout          退出并作废刷新凭证
// 配置在 assets/data/api-config.js（window.XY_API.base）
// 暴露：window.Auth
// ================================

window.Auth = (function () {

    // 登录凭证的 localStorage 键。
    // ⚠️ 必须走 store.js 的 KEYS.auth，**不要在这里另写一份字符串** ——
    // 两处一旦不一致，注销 / 换账号时"清本地"就会漏掉登录凭证（见 docs/08 §4.2）。
    // 各页面都是先加载 store.js 再加载本文件，所以这里必然拿得到。
    const LS_KEY = window.Store.KEYS.auth;

    const listeners = [];

    function base() {
        return (window.XY_API && window.XY_API.base) || "";
    }

    // 是否已配置后端（没配置时登录功能关闭）
    function isConfigured() {
        return !!base();
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
    // N 优先用后端分配的 uid（登录后由 cloud.js 同步到本地）；
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

    // ---------- 请求封装 ----------

    // 通用请求封装（默认 POST）；后端错误响应形如 { error_code, msg }，msg 已是中文
    async function api(path, body, token, method) {
        let res;
        try {
            res = await fetch(base() + path, {
                method: method || "POST",
                headers: Object.assign(
                    { "Content-Type": "application/json" },
                    token ? { "Authorization": "Bearer " + token } : {}
                ),
                body: JSON.stringify(body || {}),
            });
        } catch (e) {
            throw new Error("连不上后端服务（" + base() + "），请确认 xingyue-api 已启动");
        }
        let data = null;
        try {
            data = await res.json();
        } catch (e) {
            // 非 JSON 响应
        }
        if (!res.ok) {
            if (data && data.msg) {
                throw new Error(data.msg);
            }
            throw new Error("请求失败（HTTP " + res.status + "）");
        }
        return data;
    }

    // 统一的凭证保存（后端返回结构与原 Supabase 对齐）
    function saveSessionFromAuth(data, fallbackEmail) {
        writeSession({
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            expires_at: Date.now() + (data.expires_in || 3600) * 1000,
            email: (data.user && data.user.email) || fallbackEmail,
            user_id: data.user && data.user.id,
            phone: (data.user && data.user.phone) || "",
            // 验证码登录可能进到一个从没设过密码的账号，界面据此区分「设置 / 修改密码」
            has_password: !(data.user && data.user.has_password === false),
        });
        emit();
        return current();
    }

    // ---------- 验证码 ----------

    // scene：register 注册 / login 验证码登录 / reset 找回密码 / delete 注销 / change_email 改邮箱（发往新邮箱）
    // 返回后端响应（本地调试 MAIL_DEV=true 时含 dev_code，可直接显示给用户）
    async function sendCode(email, scene) {
        return await api("/auth/send-code", { email: email, scene: scene || "login" });
    }

    // 验证码登录（未注册邮箱会自动注册）
    async function verifyCode(email, code) {
        const data = await api("/auth/login-code", { email: email, code: code });
        return saveSessionFromAuth(data, email);
    }

    // ---------- 密码登录 ----------

    async function signInWithPassword(account, password) {
        const data = await api("/auth/login", { account: account, password: password });
        return saveSessionFromAuth(data, account);
    }

    // ---------- 注册（邮箱 + 密码 + 验证码，手机号选填）----------
    // 后端一次完成「验码 + 建号 + 发凭证」，成功即已登录

    async function signUp(email, password, code, phone) {
        const body = { email: email, password: password, code: code };
        if (phone) {
            body.phone = phone;
        }
        const data = await api("/auth/register", body);
        return saveSessionFromAuth(data, email);
    }

    // ---------- 找回密码（验证码 + 新密码一次提交，成功即已登录）----------

    async function resetPassword(email, code, password) {
        const data = await api("/auth/reset-password", { email: email, code: code, password: password });
        return saveSessionFromAuth(data, email);
    }

    // ---------- 账号安全（需登录） ----------

    function requireSession() {
        const s = readSession();
        if (!s || !s.access_token) {
            throw new Error("登录状态已失效，请重新登录");
        }
        return s;
    }

    // 修改密码：后端校验当前密码（验证码登录、从未设过密码的账号可直接设置）
    async function changePassword(currentPassword, newPassword) {
        const s = requireSession();
        await api("/auth/password",
            { current_password: currentPassword, password: newPassword },
            s.access_token, "PUT");
        writeSession(Object.assign({}, s, { has_password: true }));
        emit();
    }

    // 改邮箱：当前密码 + 发往新邮箱的验证码；成功后把本地会话里的邮箱也换掉
    async function changeEmail(newEmail, code, password) {
        const s = requireSession();
        const data = await api("/me/email",
            { email: newEmail, code: code, password: password },
            s.access_token);
        const next = Object.assign({}, s, { email: data.email || newEmail });
        if (data.user && data.user.id) {
            next.user_id = data.user.id;
        }
        writeSession(next);
        emit();
        return data;
    }

    // ---------- 刷新过期凭证 ----------

    async function refresh() {
        const s = readSession();
        if (!s || !s.refresh_token) {
            return null;
        }
        try {
            const data = await api("/auth/refresh", { refresh_token: s.refresh_token });
            writeSession({
                access_token: data.access_token,
                refresh_token: data.refresh_token,
                expires_at: Date.now() + (data.expires_in || 3600) * 1000,
                email: (data.user && data.user.email) || s.email,
                user_id: (data.user && data.user.id) || s.user_id,
                phone: (data.user && data.user.phone) || s.phone || "",
            });
            emit();
            return current();
        } catch (e) {
            if (/失效|重新登录|HTTP 4/.test(String(e.message || ""))) {
                writeSession(null);
                emit();
            }
            return null; // 网络问题时保持现状
        }
    }

    // ---------- 退出登录 ----------

    async function signOut() {
        const s = readSession();
        if (s && s.access_token && isConfigured()) {
            try {
                await api("/auth/logout", {}, s.access_token);
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
        init: init,
        refresh: refresh,
        signOut: signOut,
        sendCode: sendCode,
        verifyCode: verifyCode,
        signInWithPassword: signInWithPassword,
        signUp: signUp,
        resetPassword: resetPassword,
        changePassword: changePassword,
        changeEmail: changeEmail,
    };
})();