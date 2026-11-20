// ================================
// 登录页逻辑（login.html 专用）
// 对接 xingyue-api（ThinkPHP 8）后端：
//   登录：邮箱或手机号 + 密码
//   注册：邮箱 + 密码 + 邮箱验证码，手机号选填
//   找回密码：邮箱验证码 → 新密码
// 登录凭证写进 store.js 的 KEYS.auth（与全站共用同一份键）
// 依赖：store.js（必须先加载）
// ================================

(function () {

    // 后端地址：本地调试用 127.0.0.1:8000，上线改成正式域名
    const API_BASE = "http://127.0.0.1:8000";

    const PHONE_RE = /^1[3-9]\d{9}$/;
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    function $id(id) {
        return document.getElementById(id);
    }

    // ---------- 卡片切换 ----------

    const cards = ["login-card", "register-card", "forgot-card"];

    function showCard(id) {
        for (const c of cards) {
            $id(c).hidden = (c !== id);
        }
    }

    // ---------- 提示信息 ----------

    function msg(id, text, ok) {
        const el = $id(id);
        el.textContent = text || "";
        el.className = "login-msg" + (text ? (ok ? " ok" : " err") : "");
    }

    // ---------- 请求封装 ----------

    async function api(path, body, token) {
        let res;
        try {
            res = await fetch(API_BASE + path, {
                method: "POST",
                headers: Object.assign(
                    { "Content-Type": "application/json" },
                    token ? { "Authorization": "Bearer " + token } : {}
                ),
                body: JSON.stringify(body || {}),
            });
        } catch (e) {
            throw new Error("连不上后端服务（" + API_BASE + "），请确认它已启动");
        }
        let data = null;
        try {
            data = await res.json();
        } catch (e) {
            // 非 JSON 响应
        }
        if (!res.ok) {
            throw new Error((data && data.msg) || "请求失败（HTTP " + res.status + "）");
        }
        return data;
    }

    // ---------- 凭证保存（与 auth.js 的结构一致） ----------

    function saveSession(data) {
        window.Store.writeJSON(window.Store.KEYS.auth, {
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            expires_at: Date.now() + (data.expires_in || 3600) * 1000,
            email: data.user && data.user.email,
            user_id: data.user && data.user.id,
        });
        // 顺手拉一次云端编号，「小窝第 N 成员」才有得显示（失败不影响登录）
        fetch(API_BASE + "/me/profile", {
            headers: { "Authorization": "Bearer " + data.access_token },
        }).then(function (r) {
            return r.ok ? r.json() : null;
        }).then(function (p) {
            if (p && p.uid) {
                window.Store.writeJSON(window.Store.KEYS.uid, p.uid);
            }
        }).catch(function () { });
    }

    // ---------- 密码规则：至少 8 位，含字母和数字 ----------

    function checkPassword(pw, pw2, msgId) {
        if (pw.length < 8 || !/[a-zA-Z]/.test(pw) || !/\d/.test(pw)) {
            msg(msgId, "密码至少 8 位，且要同时包含字母和数字");
            return false;
        }
        if (pw !== pw2) {
            msg(msgId, "两次输入的密码不一致");
            return false;
        }
        return true;
    }

    // ---------- 验证码倒计时 ----------

    function countdown(btnId) {
        const btn = $id(btnId);
        let left = 60;
        btn.disabled = true;
        btn.textContent = left + "s";
        const timer = setInterval(function () {
            left -= 1;
            if (left <= 0) {
                clearInterval(timer);
                btn.disabled = false;
                btn.textContent = "发送";
            } else {
                btn.textContent = left + "s";
            }
        }, 1000);
    }

    // 发送验证码；本地调试模式（后端 MAIL_DEV=true）会把验证码直接显示出来
    async function sendCode(emailInputId, scene, btnId, msgId) {
        const email = $id(emailInputId).value.trim();
        if (!EMAIL_RE.test(email)) {
            msg(msgId, "请先填写正确的邮箱");
            return;
        }
        try {
            const data = await api("/auth/send-code", { email: email, scene: scene });
            countdown(btnId);
            msg(msgId, data.dev_code
                ? "本地调试验证码：" + data.dev_code + "（10 分钟内有效）"
                : "验证码已发送，去邮箱看看（10 分钟内有效）", true);
        } catch (e) {
            msg(msgId, e.message);
        }
    }

    // ---------- 眼睛按钮 ----------

    const eyes = document.querySelectorAll(".login-eye");
    for (const eye of eyes) {
        eye.addEventListener("click", function () {
            const input = $id(eye.getAttribute("data-target"));
            const show = input.type === "password";
            input.type = show ? "text" : "password";
            eye.classList.toggle("on", show);
        });
    }

    // ---------- 登录 ----------

    async function doLogin() {
        const account = $id("login-account").value.trim();
        const password = $id("login-password").value;
        if (!account) {
            msg("login-msg", "请填写邮箱或手机号");
            return;
        }
        if (!PHONE_RE.test(account) && !EMAIL_RE.test(account)) {
            msg("login-msg", "账号格式不对：填邮箱或 11 位手机号");
            return;
        }
        if (!password) {
            msg("login-msg", "请填写密码");
            return;
        }
        const btn = $id("login-submit");
        btn.disabled = true;
        try {
            const data = await api("/auth/login", { account: account, password: password });
            saveSession(data);
            msg("login-msg", "登录成功 ✓ 欢迎回窝～", true);
            $id("login-enter").hidden = false;
        } catch (e) {
            msg("login-msg", e.message);
        } finally {
            btn.disabled = false;
        }
    }

    // ---------- 注册 ----------

    async function doRegister() {
        const email = $id("reg-email").value.trim();
        const phone = $id("reg-phone").value.trim();
        const pw = $id("reg-password").value;
        const pw2 = $id("reg-password2").value;
        const code = $id("reg-code").value.trim();

        if (!EMAIL_RE.test(email)) {
            msg("reg-msg", "请填写正确的邮箱");
            return;
        }
        if (phone && !PHONE_RE.test(phone)) {
            msg("reg-msg", "手机号格式不对（11 位，1 开头）；不填也可以");
            return;
        }
        if (!checkPassword(pw, pw2, "reg-msg")) {
            return;
        }
        if (!/^\d{6}$/.test(code)) {
            msg("reg-msg", "请填写 6 位邮箱验证码");
            return;
        }
        const btn = $id("reg-submit");
        btn.disabled = true;
        try {
            const body = { email: email, password: pw, code: code };
            if (phone) {
                body.phone = phone;
            }
            const data = await api("/auth/register", body);
            saveSession(data);
            showCard("login-card");
            msg("login-msg", "注册成功 ✓ 已自动登录，欢迎入住小窝～", true);
            $id("login-enter").hidden = false;
        } catch (e) {
            msg("reg-msg", e.message);
        } finally {
            btn.disabled = false;
        }
    }

    // ---------- 找回密码 ----------

    async function doReset() {
        const email = $id("fg-email").value.trim();
        const code = $id("fg-code").value.trim();
        const pw = $id("fg-password").value;
        const pw2 = $id("fg-password2").value;

        if (!EMAIL_RE.test(email)) {
            msg("fg-msg", "请填写正确的邮箱");
            return;
        }
        if (!/^\d{6}$/.test(code)) {
            msg("fg-msg", "请填写 6 位邮箱验证码");
            return;
        }
        if (!checkPassword(pw, pw2, "fg-msg")) {
            return;
        }
        const btn = $id("fg-submit");
        btn.disabled = true;
        try {
            await api("/auth/reset-password", { email: email, code: code, password: pw });
            showCard("login-card");
            msg("login-msg", "密码已重置 ✓ 用新密码登录吧", true);
        } catch (e) {
            msg("fg-msg", e.message);
        } finally {
            btn.disabled = false;
        }
    }

    // ---------- 事件绑定（按钮一律按 id 取） ----------

    $id("login-submit").addEventListener("click", doLogin);
    $id("login-password").addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
            doLogin();
        }
    });
    $id("login-to-register").addEventListener("click", function () {
        showCard("register-card");
    });
    $id("login-to-forgot").addEventListener("click", function () {
        showCard("forgot-card");
    });

    $id("reg-send").addEventListener("click", function () {
        sendCode("reg-email", "register", "reg-send", "reg-msg");
    });
    $id("reg-submit").addEventListener("click", doRegister);
    $id("reg-to-login").addEventListener("click", function () {
        showCard("login-card");
    });

    $id("fg-send").addEventListener("click", function () {
        sendCode("fg-email", "reset", "fg-send", "fg-msg");
    });
    $id("fg-submit").addEventListener("click", doReset);
    $id("fg-back").addEventListener("click", function () {
        showCard("login-card");
    });

})();