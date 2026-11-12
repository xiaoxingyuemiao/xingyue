// ================================
// 建议网页 · 管理后台脚本（public/assets/js/admin.js）
// 负责：管理员初始化 / 登录、概览、建议审核、奖品管理、兑换订单、用户与积分、网站内容
// 依赖：assets/js/api.js（window.API）与 API.md 契约；零第三方库
// 约定：所有用户内容渲染都走 API.escapeHtml；页面按钮按 id 绑定
// ================================

(function () {
    "use strict";

    // ================================
    // 一、常量与状态
    // ================================

    const PAGE_SIZE = 50; // 列表每页条数（超过时显示「加载更多」）
    const DEFAULT_BONUS = 50; // 设置读取失败时的默认采纳奖励分
    const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

    // 后台分区：key 同时用于 #view-xxx / #nav-xxx 的元素 id 和地址 hash
    const VIEW_TITLES = {
        overview: "概览",
        submissions: "建议审核",
        prizes: "奖品管理",
        orders: "兑换订单",
        users: "用户与积分",
        settings: "网站内容",
    };

    const SUB_STATUS = {
        pending: { label: "待审核", cls: "badge-warn" },
        approved: { label: "已采纳", cls: "badge-ok" },
        rejected: { label: "未采纳", cls: "badge-danger" },
    };

    const ORDER_STATUS = {
        pending: { label: "待处理", cls: "badge-warn" },
        fulfilled: { label: "已完成", cls: "badge-ok" },
        cancelled: { label: "已取消", cls: "badge-muted" },
    };

    const state = {
        me: null, // 当前管理员
        settings: {}, // /api/admin/settings 缓存（审核默认奖励分等要用）
        settingsLoaded: false,
        currentView: "overview",
        busyLogin: 0, // > 0 表示正在初始化 / 登录，此时 401 由表单自己提示
        confirmResolve: null, // 确认弹窗的 Promise resolve
        review: { item: null, action: "approve" },
        prize: { editingId: null, imageUrl: "", filePath: "", fileName: "", hasFile: false },
        editingUser: null,
        shippingOrder: null,
        prizes: [],
        lists: {
            submissions: { items: [], total: 0, offset: 0, status: "", q: "" },
            orders: { items: [], total: 0, offset: 0, status: "" },
            users: { items: [], total: 0, offset: 0, q: "" },
        },
        // 请求序号：防止上一次筛选的慢响应覆盖新结果
        seq: { overview: 0, submissions: 0, orders: 0, users: 0 },
    };

    // ================================
    // 二、通用小工具
    // ================================

    function el(id) {
        return document.getElementById(id);
    }

    function esc(value) {
        return API.escapeHtml(value);
    }

    function show(node) {
        if (node) {
            node.classList.remove("hidden");
        }
    }

    function hide(node) {
        if (node) {
            node.classList.add("hidden");
        }
    }

    function toast(message, type) {
        const wrap = el("toast-wrap");
        if (!wrap) {
            return;
        }
        const node = document.createElement("div");
        node.className = "toast" + (type ? " " + type : "");
        node.textContent = String(message === null || message === undefined ? "" : message);
        wrap.appendChild(node);
        setTimeout(function () {
            node.remove();
        }, 2800);
    }

    // 数字兜底：接口偶尔给 null / 字符串
    function toCount(value) {
        const num = Number(value);
        return Number.isFinite(num) ? num : 0;
    }

    // 读取整数输入框；空 / 小数 / 非数字统一返回 NaN
    function readInt(id) {
        const raw = el(id).value.trim();
        if (raw === "") {
            return NaN;
        }
        const value = Number(raw);
        return Number.isInteger(value) ? value : NaN;
    }

    function displayNameOf(user) {
        if (!user) {
            return "用户";
        }
        return user.displayName || user.username || user.email || "用户 #" + toCount(user.id);
    }

    function statusMeta(status, table) {
        return table[status] || { label: status || "未知", cls: "badge-muted" };
    }

    // 只放行本站上传目录、http(s) 链接和 data 图片，避免把奇怪字符串塞进 img src
    function safeImageUrl(value) {
        if (!value) {
            return "";
        }
        const url = String(value).trim();
        if (!url) {
            return "";
        }
        if (/^\/uploads\//i.test(url)) {
            return url;
        }
        if (/^https?:\/\//i.test(url)) {
            return url;
        }
        if (/^data:image\//i.test(url)) {
            return url;
        }
        return "";
    }

    // 正文里的换行转成 <br>（先转义再替换，顺序不能反）
    function multiline(value) {
        return esc(value).replace(/\r?\n/g, "<br>");
    }

    function settingText(value) {
        return value === null || value === undefined ? "" : String(value);
    }

    function pad2(num) {
        return String(num).padStart(2, "0");
    }

    function formatClock(date) {
        return pad2(date.getHours()) + ":" + pad2(date.getMinutes()) + ":" + pad2(date.getSeconds());
    }

    function formatStamp(date) {
        return (
            date.getFullYear() +
            pad2(date.getMonth() + 1) +
            pad2(date.getDate()) +
            "-" +
            pad2(date.getHours()) +
            pad2(date.getMinutes()) +
            pad2(date.getSeconds())
        );
    }

    function isEmail(text) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text);
    }

    function isStrongPassword(password) {
        return typeof password === "string" && password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password);
    }

    function errorBlock(err) {
        return '<div class="empty admin-empty-error">' + esc((err && err.message) || "加载失败") + "</div>";
    }

    function setBusy(button, busy, busyText) {
        if (!button) {
            return;
        }
        if (busy) {
            if (!button.dataset.originalText) {
                button.dataset.originalText = button.textContent;
            }
            button.disabled = true;
            if (busyText) {
                button.textContent = busyText;
            }
        } else {
            button.disabled = false;
            if (button.dataset.originalText) {
                button.textContent = button.dataset.originalText;
            }
        }
    }

    function openModal(id) {
        const mask = el(id);
        if (mask) {
            mask.classList.add("open");
        }
    }

    function closeModal(id) {
        const mask = el(id);
        if (mask) {
            mask.classList.remove("open");
        }
    }

    function closeAllModals() {
        if (state.confirmResolve) {
            const resolve = state.confirmResolve;
            state.confirmResolve = null;
            resolve(false);
        }
        const masks = document.querySelectorAll(".modal-mask.open");
        for (const mask of masks) {
            mask.classList.remove("open");
        }
    }

    // 通用确认弹窗：返回 Promise<boolean>
    function openConfirm(options) {
        const opts = options || {};
        el("confirm-title").textContent = opts.title || "确认操作";
        el("confirm-message").textContent = opts.message || "";
        const okButton = el("confirm-ok");
        okButton.textContent = opts.okText || "确定";
        okButton.className = "btn " + (opts.danger ? "btn-danger" : "btn-primary");

        return new Promise(function (resolve) {
            state.confirmResolve = resolve;
            openModal("confirm-modal");
        });
    }

    function closeConfirm(result) {
        closeModal("confirm-modal");
        if (state.confirmResolve) {
            const resolve = state.confirmResolve;
            state.confirmResolve = null;
            resolve(!!result);
        }
    }

    // ================================
    // 三、入口：初始化 / 登录 / 权限
    // ================================

    function setGate(title, sub) {
        el("gate-title").textContent = title;
        el("gate-sub").textContent = sub;
    }

    function showGateError(message) {
        const node = el("gate-error");
        if (!message) {
            node.textContent = "";
            hide(node);
            return;
        }
        node.textContent = message;
        show(node);
    }

    function showSetupPanel(message) {
        show(el("admin-gate"));
        hide(el("admin-app"));
        hide(el("login-panel"));
        show(el("setup-form"));
        hide(el("gate-retry"));
        setGate("创建管理员", "第一次使用后台，先创建唯一的管理员账号（创建成功后该入口会自动关闭）。");
        showGateError(message || "");
        el("setup-email").focus();
    }

    function showLoginPanel(message) {
        show(el("admin-gate"));
        hide(el("admin-app"));
        hide(el("setup-form"));
        show(el("login-panel"));
        hide(el("gate-retry"));
        switchLoginTab("password");
        setGate("管理员登录", "请使用管理员账号登录管理后台。");
        showGateError(message || "");
        el("login-account").focus();
    }

    function switchLoginTab(tab) {
        const isPassword = tab !== "code";
        el("login-tab-password").classList.toggle("active", isPassword);
        el("login-tab-code").classList.toggle("active", !isPassword);
        el("login-tab-password").setAttribute("aria-selected", isPassword ? "true" : "false");
        el("login-tab-code").setAttribute("aria-selected", isPassword ? "false" : "true");
        el("login-password-form").classList.toggle("hidden", !isPassword);
        el("login-code-form").classList.toggle("hidden", isPassword);
    }

    async function withLoginBusy(fn) {
        state.busyLogin += 1;
        try {
            return await fn();
        } finally {
            state.busyLogin -= 1;
        }
    }

    async function boot() {
        hide(el("setup-form"));
        hide(el("login-panel"));
        hide(el("gate-retry"));
        showGateError("");
        show(el("admin-gate"));
        hide(el("admin-app"));
        setGate("管理后台", "正在检查后台状态…");

        let status = null;
        try {
            status = await API.admin.status();
        } catch (err) {
            setGate("无法连接后台", "请确认「启动建议网页.bat」的窗口还开着，然后点下面的按钮重试。");
            showGateError((err && err.message) || "连不上后台服务");
            show(el("gate-retry"));
            return;
        }

        if (status && status.needsSetup) {
            showSetupPanel("");
            return;
        }

        if (!API.isLoggedIn()) {
            showLoginPanel("");
            return;
        }

        await verifyAdmin();
    }

    async function verifyAdmin() {
        setGate("管理后台", "正在校验管理员身份…");
        showGateError("");
        try {
            const result = await API.auth.me();
            const user = result && result.user;
            if (!user || !user.isAdmin) {
                await handleNotAdmin();
                return;
            }
            enterAdmin(user);
        } catch (err) {
            if (err && err.status === 401) {
                showLoginPanel("登录已失效，请重新登录。");
                return;
            }
            showLoginPanel((err && err.message) || "校验管理员身份失败");
        }
    }

    async function handleNotAdmin(message) {
        try {
            await API.auth.logout();
        } catch (err) {
            API.clearToken();
        }
        showLoginPanel(message || "当前账号不是管理员，已退出登录。请使用管理员账号登录。");
        toast("当前账号不是管理员", "err");
    }

    // 登录 / 初始化成功后统一校验 isAdmin，然后再进后台
    async function checkAdminAndEnter() {
        const result = await API.auth.me();
        const user = result && result.user;
        if (!user || !user.isAdmin) {
            await handleNotAdmin();
            return false;
        }
        enterAdmin(user);
        return true;
    }

    function enterAdmin(user) {
        state.me = user;
        hide(el("admin-gate"));
        show(el("admin-app"));
        el("admin-name").textContent = displayNameOf(user);
        el("admin-avatar").textContent = displayNameOf(user).slice(0, 1);
        el("logout-btn").disabled = false;

        // 支持 /admin#prizes 之类的地址：刷新后回到原来的分区
        const initial = (location.hash || "").replace("#", "");
        switchView(VIEW_TITLES[initial] ? initial : "overview");

        // 静默缓存设置（审核弹窗要用 points_bonus 默认值）
        ensureSettings().catch(function () {
            /* 设置读取失败不阻塞后台 */
        });
    }

    async function logout() {
        el("logout-btn").disabled = true;
        try {
            await API.auth.logout();
        } catch (err) {
            API.clearToken();
        }
        state.me = null;
        state.settingsLoaded = false;
        closeAllModals();
        showLoginPanel("已退出登录，请重新登录。");
        toast("已退出登录", "ok");
    }

    // 401 统一回登录卡（登录过程中的 401 交给表单提示，避免误报「登录失效」）
    function handleUnauthorized() {
        if (state.busyLogin > 0 || !state.me) {
            return;
        }
        state.me = null;
        state.settingsLoaded = false;
        closeAllModals();
        showLoginPanel("登录已失效，请重新登录。");
        toast("登录已失效，请重新登录", "err");
    }

    function handleError(err) {
        if (err && err.status === 401) {
            // 已由 onUnauthorized 统一处理
            return;
        }
        if (err && err.status === 403) {
            toast("当前账号不是管理员", "err");
            return;
        }
        toast((err && err.message) || "操作失败，请稍后重试", "err");
    }

    // ---------- 初始化提交 ----------

    async function submitSetup(event) {
        if (event) {
            event.preventDefault();
        }
        const email = el("setup-email").value.trim();
        const username = el("setup-username").value.trim();
        const password = el("setup-password").value;
        const displayName = el("setup-display-name").value.trim();
        const statusNode = el("setup-status");

        if (!isEmail(email)) {
            statusNode.textContent = "请填写正确的邮箱地址";
            el("setup-email").focus();
            return;
        }
        if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) {
            statusNode.textContent = "用户名需 3~20 位，只能包含字母、数字、下划线";
            el("setup-username").focus();
            return;
        }
        if (!isStrongPassword(password)) {
            statusNode.textContent = "密码至少 8 位，并且同时包含字母和数字";
            el("setup-password").focus();
            return;
        }
        if (!displayName) {
            statusNode.textContent = "请填写管理员昵称";
            el("setup-display-name").focus();
            return;
        }

        statusNode.textContent = "";
        setBusy(el("setup-submit"), true, "创建中…");
        await withLoginBusy(async function () {
            try {
                await API.admin.setup({
                    email: email,
                    username: username,
                    password: password,
                    displayName: displayName,
                });
                const entered = await checkAdminAndEnter();
                if (entered) {
                    toast("管理员创建成功，欢迎回来", "ok");
                }
            } catch (err) {
                if (err && err.status === 403) {
                    showLoginPanel("后台初始化入口已关闭（已有管理员），请直接登录。");
                } else {
                    statusNode.textContent = (err && err.message) || "创建管理员失败";
                }
            }
        });
        setBusy(el("setup-submit"), false, "创建管理员");
    }

    // ---------- 密码登录 ----------

    async function submitPasswordLogin(event) {
        if (event) {
            event.preventDefault();
        }
        const account = el("login-account").value.trim();
        const password = el("login-password").value;
        const statusNode = el("login-password-status");

        if (!account) {
            statusNode.textContent = "请填写邮箱或用户名";
            el("login-account").focus();
            return;
        }
        if (!password) {
            statusNode.textContent = "请填写密码";
            el("login-password").focus();
            return;
        }

        statusNode.textContent = "";
        showGateError("");
        setBusy(el("login-password-submit"), true, "登录中…");
        await withLoginBusy(async function () {
            try {
                await API.auth.loginPassword(account, password);
                const entered = await checkAdminAndEnter();
                if (entered) {
                    toast("欢迎回来", "ok");
                }
            } catch (err) {
                statusNode.textContent = (err && err.message) || "登录失败";
            }
        });
        setBusy(el("login-password-submit"), false);
    }

    // ---------- 邮箱验证码登录 ----------

    let codeTimer = null;

    function startCodeCooldown(seconds) {
        if (codeTimer) {
            clearInterval(codeTimer);
            codeTimer = null;
        }
        let left = Math.max(1, Math.min(600, toCount(seconds) || 60));
        const button = el("login-code-send");
        button.disabled = true;
        button.textContent = left + " 秒后重发";
        codeTimer = setInterval(function () {
            left -= 1;
            if (left <= 0) {
                clearInterval(codeTimer);
                codeTimer = null;
                button.disabled = false;
                button.textContent = "发送验证码";
                return;
            }
            button.textContent = left + " 秒后重发";
        }, 1000);
    }

    async function sendLoginCode() {
        const email = el("login-code-email").value.trim();
        const statusNode = el("login-code-status");
        if (!isEmail(email)) {
            statusNode.textContent = "请先填写正确的邮箱地址";
            el("login-code-email").focus();
            return;
        }
        statusNode.textContent = "";
        el("login-code-send").disabled = true;
        try {
            const result = await API.auth.sendCode(email, "login");
            const devCode = result && result.devCode ? String(result.devCode) : "";
            const devNode = el("login-devcode");
            if (devCode) {
                devNode.textContent = "开发模式验证码：" + devCode;
            } else {
                devNode.textContent = "验证码已发送，请查收邮件（开发模式下会显示在启动窗口）";
            }
            show(devNode);
            toast("验证码已发送", "ok");
            startCodeCooldown(result && result.cooldown ? result.cooldown : 60);
        } catch (err) {
            el("login-code-send").disabled = false;
            statusNode.textContent = (err && err.message) || "发送验证码失败";
            handleError(err);
        }
    }

    async function submitCodeLogin(event) {
        if (event) {
            event.preventDefault();
        }
        const email = el("login-code-email").value.trim();
        const code = el("login-code-input").value.trim();
        const statusNode = el("login-code-status");

        if (!isEmail(email)) {
            statusNode.textContent = "请填写正确的邮箱地址";
            el("login-code-email").focus();
            return;
        }
        if (!code) {
            statusNode.textContent = "请填写邮箱验证码";
            el("login-code-input").focus();
            return;
        }

        statusNode.textContent = "";
        showGateError("");
        setBusy(el("login-code-submit"), true, "登录中…");
        await withLoginBusy(async function () {
            try {
                await API.auth.loginCode(email, code);
                const entered = await checkAdminAndEnter();
                if (entered) {
                    toast("欢迎回来", "ok");
                }
            } catch (err) {
                statusNode.textContent = (err && err.message) || "验证码登录失败";
            }
        });
        setBusy(el("login-code-submit"), false);
    }

    // ================================
    // 四、分区切换
    // ================================

    function switchView(name) {
        if (!VIEW_TITLES[name]) {
            name = "overview";
        }
        state.currentView = name;

        for (const key of Object.keys(VIEW_TITLES)) {
            const view = el("view-" + key);
            const nav = el("nav-" + key);
            if (view) {
                view.classList.toggle("hidden", key !== name);
            }
            if (nav) {
                nav.classList.toggle("active", key === name);
            }
        }

        el("current-section").textContent = VIEW_TITLES[name];
        try {
            if (location.hash !== "#" + name) {
                history.replaceState(null, "", "#" + name);
            }
        } catch (err) {
            /* 某些环境（如 file://）不允许改 hash，忽略即可 */
        }

        if (name === "overview") {
            loadOverview();
        } else if (name === "submissions") {
            loadSubmissions(true);
        } else if (name === "prizes") {
            loadPrizes();
        } else if (name === "orders") {
            loadOrders(true);
        } else if (name === "users") {
            loadUsers(true);
        } else if (name === "settings") {
            loadSiteSettings();
        }
    }

    // ================================
    // 五、概览
    // ================================

    function loadOverview() {
        const seq = ++state.seq.overview;
        el("overview-stats").innerHTML = '<div class="loading">正在加载概览…</div>';
        el("overview-submissions").innerHTML = '<div class="loading">加载中…</div>';
        el("overview-orders").innerHTML = '<div class="loading">加载中…</div>';

        API.admin.overview()
            .then(function (data) {
                if (seq !== state.seq.overview) {
                    return;
                }
                renderOverview(data || {});
            })
            .catch(function (err) {
                if (seq !== state.seq.overview) {
                    return;
                }
                el("overview-stats").innerHTML = "";
                el("overview-submissions").innerHTML = errorBlock(err);
                el("overview-orders").innerHTML = errorBlock(err);
                handleError(err);
            });
    }

    function renderOverview(data) {
        const stats = data.stats || {};
        const cards = [
            { label: "用户数", value: stats.users },
            { label: "建议数", value: stats.suggestions },
            { label: "待审核", value: stats.pending, tone: "warn" },
            { label: "已采纳", value: stats.adopted, tone: "ok" },
            { label: "发放积分", value: stats.pointsGiven },
            { label: "订单数", value: stats.orders },
            { label: "待处理订单", value: stats.pendingOrders, tone: "danger" },
        ];
        el("overview-stats").innerHTML = cards
            .map(function (card) {
                const tone = card.tone ? " admin-stat-" + card.tone : "";
                return (
                    '<div class="admin-stat' + tone + '">' +
                    '<span class="admin-stat-label">' + esc(card.label) + "</span>" +
                    '<strong class="admin-stat-value">' + toCount(card.value) + "</strong>" +
                    "</div>"
                );
            })
            .join("");

        const submissions = Array.isArray(data.recentSubmissions) ? data.recentSubmissions : [];
        el("overview-submissions").innerHTML = submissions.length
            ? submissions.map(overviewSubmissionRow).join("")
            : '<div class="empty">暂无待审建议</div>';

        const orders = Array.isArray(data.recentOrders) ? data.recentOrders : [];
        el("overview-orders").innerHTML = orders.length
            ? orders.map(overviewOrderRow).join("")
            : '<div class="empty">暂无订单</div>';
    }

    function overviewSubmissionRow(item) {
        const meta = statusMeta(item.status, SUB_STATUS);
        return (
            '<div class="admin-row" data-goto="submissions" role="button" tabindex="0">' +
            '<div class="admin-row-main">' +
            '<div class="admin-row-title">' + esc(item.title || "（无标题）") + "</div>" +
            '<div class="admin-row-meta">' +
            esc(displayNameOf(item.user)) +
            " · " +
            esc(API.formatTime(item.createdAt)) +
            "</div>" +
            "</div>" +
            '<span class="badge ' + meta.cls + '">' + meta.label + "</span>" +
            "</div>"
        );
    }

    function overviewOrderRow(order) {
        const meta = statusMeta(order.status, ORDER_STATUS);
        const prizeName = (order.prize && order.prize.name) || "奖品";
        const who = order.user ? displayNameOf(order.user) + " · " : "";
        return (
            '<div class="admin-row" data-goto="orders" role="button" tabindex="0">' +
            '<div class="admin-row-main">' +
            '<div class="admin-row-title">' +
            esc(prizeName) +
            " · " +
            toCount(order.cost) +
            " 积分</div>" +
            '<div class="admin-row-meta">' +
            esc(who) +
            "订单 #" +
            toCount(order.id) +
            " · " +
            esc(API.formatTime(order.createdAt)) +
            "</div>" +
            "</div>" +
            '<span class="badge ' + meta.cls + '">' + meta.label + "</span>" +
            "</div>"
        );
    }

    function gotoSubmissionsPending() {
        state.lists.submissions.status = "pending";
        state.lists.submissions.q = "";
        el("submission-status").value = "pending";
        el("submission-search").value = "";
        switchView("submissions");
    }

    // ================================
    // 六、建议审核
    // ================================

    function loadSubmissions(reset) {
        const list = state.lists.submissions;
        if (reset) {
            list.offset = 0;
            list.items = [];
        } else {
            list.offset = list.items.length;
        }
        const seq = ++state.seq.submissions;
        const container = el("submission-list");
        if (reset) {
            container.innerHTML = '<div class="loading">正在加载建议…</div>';
        }
        hide(el("submission-more-wrap"));

        API.admin
            .submissions({
                status: list.status,
                q: list.q,
                limit: PAGE_SIZE,
                offset: list.offset,
            })
            .then(function (data) {
                if (seq !== state.seq.submissions) {
                    return;
                }
                const items = Array.isArray(data.items) ? data.items : [];
                list.total = toCount(data.total);
                list.items = reset ? items : list.items.concat(items);
                renderSubmissions();
            })
            .catch(function (err) {
                if (seq !== state.seq.submissions) {
                    return;
                }
                if (reset) {
                    container.innerHTML = errorBlock(err);
                }
                el("submission-count").textContent = "";
                handleError(err);
            });
    }

    function renderSubmissions() {
        const list = state.lists.submissions;
        const container = el("submission-list");
        el("submission-count").textContent = list.total
            ? "共 " + list.total + " 条，已显示 " + list.items.length + " 条"
            : "";

        if (!list.items.length) {
            container.innerHTML = '<div class="empty">没有符合条件的建议</div>';
            hide(el("submission-more-wrap"));
            return;
        }

        container.innerHTML = list.items.map(submissionCard).join("");
        const hasMore = list.items.length < list.total && list.items.length >= PAGE_SIZE;
        el("submission-more-wrap").classList.toggle("hidden", !hasMore);
    }

    function submissionCard(item) {
        const meta = statusMeta(item.status, SUB_STATUS);
        const image = safeImageUrl(item.image);
        const category = item.category
            ? '<span class="badge badge-brand">' + esc(item.category) + "</span>"
            : "";
        const note = item.adminNote
            ? '<div class="admin-item-note">管理员备注：' + multiline(item.adminNote) + "</div>"
            : "";
        return (
            '<article class="admin-item">' +
            '<div class="admin-item-head">' +
            '<div class="admin-item-title">' + esc(item.title || "（无标题）") + "</div>" +
            '<div class="admin-item-badges">' +
            category +
            '<span class="badge ' + meta.cls + '">' + meta.label + "</span>" +
            "</div>" +
            "</div>" +
            '<div class="admin-item-meta">' +
            esc(displayNameOf(item.user)) +
            " · " +
            esc(API.formatTime(item.createdAt)) +
            "</div>" +
            '<p class="admin-item-content">' + multiline(item.content || "") + "</p>" +
            (image
                ? '<a class="admin-item-image" href="' + esc(image) + '" target="_blank" rel="noopener noreferrer">' +
                  '<img src="' + esc(image) + '" alt="建议配图" loading="lazy"></a>'
                : "") +
            '<div class="admin-item-points">' +
            '<span class="admin-point-chip">基础分 <strong>' + toCount(item.basePoints) + "</strong></span>" +
            '<span class="admin-point-chip ok">奖励分 <strong>' + toCount(item.bonusPoints) + "</strong></span>" +
            (item.reviewedAt ? "<span class=\"admin-point-chip\">审核时间 " + esc(API.formatTime(item.reviewedAt)) + "</span>" : "") +
            "</div>" +
            note +
            '<div class="admin-item-actions">' +
            '<button type="button" class="btn btn-primary btn-sm" data-action="approve" data-id="' + toCount(item.id) + '">通过</button>' +
            '<button type="button" class="btn btn-danger btn-sm" data-action="reject" data-id="' + toCount(item.id) + '">不通过</button>' +
            '<button type="button" class="btn btn-ghost btn-sm" data-action="delete" data-id="' + toCount(item.id) + '">删除</button>' +
            "</div>" +
            "</article>"
        );
    }

    function applySubmissionFilter() {
        const list = state.lists.submissions;
        list.status = el("submission-status").value;
        list.q = el("submission-search").value.trim();
        loadSubmissions(true);
    }

    function resetSubmissionFilter() {
        el("submission-status").value = "";
        el("submission-search").value = "";
        applySubmissionFilter();
    }

    async function openReview(item, action) {
        state.review.item = item;
        state.review.action = action === "reject" ? "reject" : "approve";
        const approve = state.review.action === "approve";

        el("review-modal-title").textContent = approve ? "通过建议" : "不通过建议";
        el("review-modal-sub").textContent =
            "建议：" + (item.title || "（无标题）") + " · 用户：" + displayNameOf(item.user);
        el("review-bonus-field").classList.toggle("hidden", !approve);
        el("review-note-label").textContent = approve ? "管理员备注（可选）" : "不通过原因（必填）";
        el("review-note").placeholder = approve ? "例如：写得好，采纳了" : "例如：这个方向暂时不合适";
        el("review-modal-hint").textContent = approve
            ? "通过后会按奖励分给用户加分，备注会显示在管理后台。"
            : "不通过不会加分，原因会写进管理员备注。";
        el("review-submit").textContent = approve ? "确认通过" : "确认不通过";
        el("review-note").value = item.adminNote || "";

        if (approve) {
            let defaultBonus = DEFAULT_BONUS;
            try {
                await ensureSettings();
                const configured = Number(state.settings.points_bonus);
                if (Number.isFinite(configured) && configured >= 0) {
                    defaultBonus = configured;
                }
            } catch (err) {
                /* 读取设置失败时用默认 50 分 */
            }
            // 等待期间如果登录失效，已经回到登录卡，不再弹审核框
            if (!state.me) {
                return;
            }
            el("review-bonus").value = String(defaultBonus);
        }

        openModal("review-modal");
        el("review-note").focus();
    }

    function closeReview() {
        closeModal("review-modal");
        state.review.item = null;
    }

    async function submitReview() {
        const item = state.review.item;
        if (!item) {
            return;
        }
        const approve = state.review.action === "approve";
        const note = el("review-note").value.trim();
        const body = { action: approve ? "approve" : "reject" };

        if (approve) {
            const rawBonus = el("review-bonus").value.trim();
            if (rawBonus !== "") {
                const bonus = Number(rawBonus);
                if (!Number.isInteger(bonus) || bonus < 0) {
                    toast("奖励分必须是 0 或正整数", "err");
                    el("review-bonus").focus();
                    return;
                }
                body.bonus = bonus;
            }
        } else if (!note) {
            toast("请填写不通过原因", "err");
            el("review-note").focus();
            return;
        }
        if (note) {
            body.note = note;
        }

        setBusy(el("review-submit"), true, "提交中…");
        try {
            await API.admin.review(item.id, body);
            closeReview();
            toast(approve ? "已通过该建议" : "已标记为不通过", "ok");
            await loadSubmissions(true);
        } catch (err) {
            handleError(err);
        } finally {
            setBusy(el("review-submit"), false, approve ? "确认通过" : "确认不通过");
        }
    }

    async function deleteSubmission(item) {
        const confirmed = await openConfirm({
            title: "删除建议",
            message:
                "确定删除建议「" +
                (item.title || "无标题") +
                "」吗？删除后会扣回该建议发过的基础分（最多扣到 0），且不可恢复。",
            okText: "删除",
            danger: true,
        });
        if (!confirmed) {
            return;
        }
        try {
            const result = await API.admin.removeSubmission(item.id);
            const deducted = result && Number.isFinite(Number(result.deducted)) ? Number(result.deducted) : 0;
            toast(deducted > 0 ? "已删除建议，扣回 " + deducted + " 分" : "已删除建议", "ok");
            await loadSubmissions(true);
        } catch (err) {
            handleError(err);
        }
    }

    // ================================
    // 七、奖品管理
    // ================================

    function loadPrizes() {
        const container = el("prize-list");
        container.innerHTML = '<div class="loading">正在加载奖品…</div>';
        API.admin
            .prizes()
            .then(function (data) {
                state.prizes = Array.isArray(data && data.prizes) ? data.prizes : [];
                renderPrizes(state.prizes);
            })
            .catch(function (err) {
                container.innerHTML = errorBlock(err);
                handleError(err);
            });
    }

    function renderPrizes(prizes) {
        const container = el("prize-list");
        if (!prizes.length) {
            container.innerHTML = '<div class="card empty">还没有奖品，点右上角「新增奖品」创建第一个吧。</div>';
            return;
        }
        container.innerHTML =
            '<div class="admin-table-wrap">' +
            '<table class="admin-table">' +
            "<thead><tr>" +
            "<th>奖品</th><th>类型</th><th>积分</th><th>库存</th><th>状态</th><th>操作</th>" +
            "</tr></thead>" +
            "<tbody>" +
            prizes.map(prizeRow).join("") +
            "</tbody>" +
            "</table>" +
            "</div>";
    }

    function prizeRow(prize) {
        const image = safeImageUrl(prize.image);
        const thumb = image
            ? '<img class="admin-thumb" src="' + esc(image) + '" alt="">'
            : '<div class="admin-thumb admin-thumb-placeholder">' + esc(String(prize.name || "奖").slice(0, 1)) + "</div>";
        const kindLabel = prize.kind === "digital" ? "虚拟" : "实物";
        const fileTitle = prize.hasFile && prize.fileName ? ' title="' + esc(prize.fileName) + '"' : "";
        const fileBadge =
            prize.kind === "digital"
                ? ' <span class="badge ' +
                  (prize.hasFile ? "badge-ok" : "badge-muted") +
                  '"' +
                  fileTitle +
                  ">" +
                  (prize.hasFile ? "有文件" : "无文件") +
                  "</span>"
                : "";
        const activeBadge =
            prize.active === false
                ? '<span class="badge badge-muted">已下架</span>'
                : '<span class="badge badge-ok">上架中</span>';
        const stock = toCount(prize.stock);
        const stockHtml = stock === 0 ? '<span class="badge badge-danger">无库存</span>' : String(stock);
        const id = toCount(prize.id);

        return (
            "<tr>" +
            '<td><div class="admin-cell-main">' +
            thumb +
            "<div>" +
            '<div class="admin-cell-name">' + esc(prize.name || "（未命名）") + "</div>" +
            '<div class="admin-cell-desc">' + esc(prize.description || "—") + "</div>" +
            "</div></div></td>" +
            '<td><span class="badge badge-brand">' + kindLabel + "</span>" + fileBadge + "</td>" +
            "<td>" + toCount(prize.cost) + "</td>" +
            "<td>" + stockHtml + "</td>" +
            "<td>" + activeBadge + "</td>" +
            '<td><div class="admin-table-actions">' +
            '<button type="button" class="btn btn-soft btn-sm" data-action="edit-prize" data-id="' + id + '">编辑</button>' +
            '<button type="button" class="btn btn-danger btn-sm" data-action="delete-prize" data-id="' + id + '">删除</button>' +
            "</div></td>" +
            "</tr>"
        );
    }

    function openPrizeModal(prize) {
        state.prize.editingId = prize ? prize.id : null;
        state.prize.imageUrl = prize && prize.image ? prize.image : "";
        state.prize.filePath = "";
        state.prize.fileName = prize && prize.fileName ? prize.fileName : "";
        state.prize.hasFile = !!(prize && prize.hasFile);

        el("prize-modal-title").textContent = prize ? "编辑奖品" : "新增奖品";
        el("prize-name").value = prize ? prize.name || "" : "";
        el("prize-description").value = prize ? prize.description || "" : "";
        el("prize-kind").value = prize && prize.kind === "digital" ? "digital" : "physical";
        el("prize-cost").value = String(prize ? toCount(prize.cost) : 100);
        el("prize-stock").value = String(prize ? toCount(prize.stock) : 1);
        el("prize-sort").value = String(prize ? toCount(prize.sort) : 0);
        el("prize-active").checked = !(prize && prize.active === false);
        el("prize-image-status").textContent = "支持 jpg / png / webp / gif，不超过 8MB。";
        el("prize-file-input").value = "";
        el("prize-image-file").value = "";
        el("prize-modal-status").textContent = "";

        renderPrizeImage();
        updatePrizeFileField();
        openModal("prize-modal");
        el("prize-name").focus();
    }

    function closePrizeModal() {
        closeModal("prize-modal");
        state.prize.editingId = null;
    }

    function renderPrizeImage() {
        const box = el("prize-image-preview");
        const image = safeImageUrl(state.prize.imageUrl);
        box.innerHTML = image
            ? '<img src="' + esc(image) + '" alt="奖品图片预览">'
            : "未设置图片";
    }

    function updatePrizeFileField() {
        const isDigital = el("prize-kind").value === "digital";
        el("prize-file-field").classList.toggle("hidden", !isDigital);
        if (!isDigital) {
            return;
        }
        const prize = state.prize;
        let text = "未上传文件";
        if (prize.filePath) {
            text = "已选择：" + (prize.fileName || "上传文件");
        } else if (prize.hasFile) {
            text = "已上传文件：" + (prize.fileName || "（后台未记录文件名）") + "，重新选择会覆盖";
        }
        el("prize-file-status").textContent = text;
    }

    function validateImageFile(file) {
        if (IMAGE_TYPES.indexOf(file.type) === -1) {
            return "图片只支持 jpg / png / webp / gif";
        }
        if (file.size > 8 * 1024 * 1024) {
            return "图片不能超过 8MB";
        }
        return "";
    }

    async function uploadPrizeImage(file) {
        if (!file) {
            return;
        }
        const problem = validateImageFile(file);
        if (problem) {
            toast(problem, "err");
            el("prize-image-file").value = "";
            return;
        }
        el("prize-image-status").textContent = "正在上传图片…";
        try {
            const result = await API.admin.upload(file);
            if (!result || !result.url) {
                throw new Error("上传成功但没拿到图片地址");
            }
            state.prize.imageUrl = result.url;
            renderPrizeImage();
            el("prize-image-status").textContent = "图片已上传（点「保存奖品」后生效）";
            toast("图片已上传", "ok");
        } catch (err) {
            el("prize-image-status").textContent = "上传失败";
            handleError(err);
        } finally {
            el("prize-image-file").value = "";
        }
    }

    async function uploadPrizeFile(file) {
        if (!file) {
            return;
        }
        if (file.size > 30 * 1024 * 1024) {
            toast("奖品文件不能超过 30MB", "err");
            el("prize-file-input").value = "";
            return;
        }
        el("prize-file-status").textContent = "正在上传文件…";
        try {
            const result = await API.admin.upload(file);
            if (!result || !result.path) {
                throw new Error("上传成功但没拿到文件路径");
            }
            state.prize.filePath = result.path;
            state.prize.fileName = file.name || "";
            updatePrizeFileField();
            toast("奖品文件已上传（点「保存奖品」后生效）", "ok");
        } catch (err) {
            updatePrizeFileField();
            handleError(err);
        } finally {
            el("prize-file-input").value = "";
        }
    }

    async function savePrize() {
        const name = el("prize-name").value.trim();
        const cost = readInt("prize-cost");
        const stock = readInt("prize-stock");
        const sort = readInt("prize-sort");
        const statusNode = el("prize-modal-status");

        if (!name) {
            statusNode.textContent = "请填写奖品名称";
            el("prize-name").focus();
            return;
        }
        if (!Number.isInteger(cost) || cost < 0) {
            statusNode.textContent = "积分价格必须是非负整数";
            el("prize-cost").focus();
            return;
        }
        if (!Number.isInteger(stock) || stock < 0) {
            statusNode.textContent = "库存必须是非负整数";
            el("prize-stock").focus();
            return;
        }
        if (!Number.isInteger(sort)) {
            statusNode.textContent = "排序必须是整数";
            el("prize-sort").focus();
            return;
        }

        const kind = el("prize-kind").value === "digital" ? "digital" : "physical";
        const body = {
            name: name,
            description: el("prize-description").value.trim(),
            kind: kind,
            cost: cost,
            stock: stock,
            sort: sort,
            active: el("prize-active").checked,
            image: state.prize.imageUrl || "",
        };
        // 只有虚拟奖品重新上传了文件才传 filePath / fileName（不传表示保留原文件）
        if (kind === "digital" && state.prize.filePath) {
            body.filePath = state.prize.filePath;
            body.fileName = state.prize.fileName;
        }

        statusNode.textContent = "";
        setBusy(el("prize-save"), true, "保存中…");
        try {
            if (state.prize.editingId) {
                await API.admin.updatePrize(state.prize.editingId, body);
                toast("奖品已保存", "ok");
            } else {
                await API.admin.createPrize(body);
                toast("奖品已创建", "ok");
            }
            closePrizeModal();
            await loadPrizes();
        } catch (err) {
            handleError(err);
        } finally {
            setBusy(el("prize-save"), false, "保存奖品");
        }
    }

    async function deletePrizeItem(prize) {
        const confirmed = await openConfirm({
            title: "删除奖品",
            message:
                "确定删除奖品「" +
                (prize.name || "未命名") +
                "」吗？如果已有兑换订单引用它，会自动改为下架（不会真删）。",
            okText: "删除",
            danger: true,
        });
        if (!confirmed) {
            return;
        }
        try {
            const result = await API.admin.deletePrize(prize.id);
            if (result && result.deactivated) {
                toast("该奖品已有订单引用，已改为下架", "ok");
            } else {
                toast("奖品已删除", "ok");
            }
            await loadPrizes();
        } catch (err) {
            handleError(err);
        }
    }

    // ================================
    // 八、兑换订单
    // ================================

    function loadOrders(reset) {
        const list = state.lists.orders;
        if (reset) {
            list.offset = 0;
            list.items = [];
        } else {
            list.offset = list.items.length;
        }
        const seq = ++state.seq.orders;
        const container = el("order-list");
        if (reset) {
            container.innerHTML = '<div class="loading">正在加载订单…</div>';
        }
        hide(el("order-more-wrap"));

        API.admin
            .orders({
                status: list.status,
                limit: PAGE_SIZE,
                offset: list.offset,
            })
            .then(function (data) {
                if (seq !== state.seq.orders) {
                    return;
                }
                const items = Array.isArray(data.items) ? data.items : [];
                list.total = toCount(data.total);
                list.items = reset ? items : list.items.concat(items);
                renderOrders();
            })
            .catch(function (err) {
                if (seq !== state.seq.orders) {
                    return;
                }
                if (reset) {
                    container.innerHTML = errorBlock(err);
                }
                el("order-count").textContent = "";
                handleError(err);
            });
    }

    function renderOrders() {
        const list = state.lists.orders;
        const container = el("order-list");
        el("order-count").textContent = list.total ? "共 " + list.total + " 单，已显示 " + list.items.length + " 单" : "";

        if (!list.items.length) {
            container.innerHTML = '<div class="empty">没有符合条件的订单</div>';
            hide(el("order-more-wrap"));
            return;
        }

        container.innerHTML = list.items.map(orderCard).join("");
        const hasMore = list.items.length < list.total && list.items.length >= PAGE_SIZE;
        el("order-more-wrap").classList.toggle("hidden", !hasMore);
    }

    function kv(label, value) {
        return (
            '<div class="admin-kv">' +
            '<span class="admin-kv-label">' + esc(label) + "</span>" +
            '<span class="admin-kv-value">' + esc(value === null || value === undefined || value === "" ? "—" : value) + "</span>" +
            "</div>"
        );
    }

    function orderCard(order) {
        const meta = statusMeta(order.status, ORDER_STATUS);
        const prize = order.prize || {};
        const isDigital = prize.kind === "digital";
        const image = safeImageUrl(prize.image);
        const thumb = image
            ? '<img class="admin-thumb" src="' + esc(image) + '" alt="">'
            : '<div class="admin-thumb admin-thumb-placeholder">' + esc(String(prize.name || "奖").slice(0, 1)) + "</div>";

        const details = [];
        details.push(kv("下单人", order.user ? displayNameOf(order.user) : "—"));
        if (order.user && order.user.email) {
            details.push(kv("联系邮箱", order.user.email));
        }
        details.push(kv("消耗积分", toCount(order.cost) + " 分"));
        details.push(kv("下单时间", API.formatTime(order.createdAt)));
        if (!isDigital) {
            details.push(kv("收货地址", order.address));
            details.push(kv("联系方式", order.contact));
        }
        if (order.note) {
            details.push(kv("用户备注", order.note));
        }
        if (order.trackingNo) {
            details.push(kv("快递单号", order.trackingNo));
        }

        const id = toCount(order.id);
        let actions = "";
        if (order.status === "pending") {
            actions +=
                '<button type="button" class="btn btn-primary btn-sm" data-action="ship-order" data-id="' + id + '">标记发货</button>' +
                '<button type="button" class="btn btn-danger btn-sm" data-action="cancel-order" data-id="' + id + '">取消并退分</button>';
        }
        if (order.canDownload) {
            actions +=
                '<button type="button" class="btn btn-soft btn-sm" data-action="download-order" data-id="' + id + '">下载文件</button>';
        }

        return (
            '<article class="admin-item">' +
            '<div class="admin-item-head">' +
            '<div class="admin-item-title">' +
            '<span class="admin-order-title">' +
            thumb +
            "<span>订单 #" + id + "</span></span>" +
            "</div>" +
            '<div class="admin-item-badges">' +
            '<span class="badge badge-brand">' +
            (isDigital ? "虚拟奖品" : "实物奖品") +
            "</span>" +
            '<span class="badge ' + meta.cls + '">' + meta.label + "</span>" +
            (order.trackingNo ? '<span class="badge badge-ok">已发货</span>' : "") +
            "</div>" +
            "</div>" +
            '<div class="admin-item-meta">' + esc(prize.name || "（奖品已删除）") + "</div>" +
            '<div class="admin-kv-grid">' + details.join("") + "</div>" +
            (actions ? '<div class="admin-item-actions">' + actions + "</div>" : "") +
            "</article>"
        );
    }

    function openShipModal(order) {
        state.shippingOrder = order;
        el("ship-order-sub").textContent =
            "订单 #" + toCount(order.id) + " · " + ((order.prize && order.prize.name) || "奖品");
        el("ship-tracking").value = order.trackingNo || "";
        el("ship-modal-status").textContent = "";
        openModal("ship-modal");
        el("ship-tracking").focus();
    }

    async function submitShip() {
        const order = state.shippingOrder;
        if (!order) {
            return;
        }
        const trackingNo = el("ship-tracking").value.trim();
        const body = { action: "fulfill" };
        if (trackingNo) {
            body.trackingNo = trackingNo;
        }
        setBusy(el("ship-submit"), true, "提交中…");
        try {
            await API.admin.orderAction(order.id, body);
            closeModal("ship-modal");
            state.shippingOrder = null;
            toast("订单已标记为已完成", "ok");
            await loadOrders(true);
        } catch (err) {
            handleError(err);
        } finally {
            setBusy(el("ship-submit"), false, "确认发货");
        }
    }

    async function cancelOrder(order) {
        const confirmed = await openConfirm({
            title: "取消订单",
            message:
                "确定取消订单 #" +
                toCount(order.id) +
                " 吗？会退回 " +
                toCount(order.cost) +
                " 积分并恢复奖品库存。",
            okText: "取消订单并退分",
            danger: true,
        });
        if (!confirmed) {
            return;
        }
        try {
            await API.admin.orderAction(order.id, { action: "cancel" });
            toast("订单已取消，积分已退回", "ok");
            await loadOrders(true);
        } catch (err) {
            handleError(err);
        }
    }

    async function downloadOrder(order) {
        try {
            await API.admin.downloadOrderFile(order);
            toast("已开始下载奖品文件", "ok");
        } catch (err) {
            handleError(err);
        }
    }

    // ================================
    // 九、用户与积分
    // ================================

    function loadUsers(reset) {
        const list = state.lists.users;
        if (reset) {
            list.offset = 0;
            list.items = [];
        } else {
            list.offset = list.items.length;
        }
        const seq = ++state.seq.users;
        const container = el("user-list");
        if (reset) {
            container.innerHTML = '<div class="loading">正在加载用户…</div>';
        }
        hide(el("user-more-wrap"));

        API.admin
            .users({ q: list.q, limit: PAGE_SIZE, offset: list.offset })
            .then(function (data) {
                if (seq !== state.seq.users) {
                    return;
                }
                const items = Array.isArray(data.items) ? data.items : [];
                list.total = toCount(data.total);
                list.items = reset ? items : list.items.concat(items);
                renderUsers();
            })
            .catch(function (err) {
                if (seq !== state.seq.users) {
                    return;
                }
                if (reset) {
                    container.innerHTML = errorBlock(err);
                }
                el("user-count").textContent = "";
                handleError(err);
            });
    }

    function renderUsers() {
        const list = state.lists.users;
        const container = el("user-list");
        el("user-count").textContent = list.total
            ? "共 " + list.total + " 位用户，已显示 " + list.items.length + " 位"
            : "";

        if (!list.items.length) {
            container.innerHTML = '<div class="card empty">没有找到用户</div>';
            hide(el("user-more-wrap"));
            return;
        }

        const rows = list.items
            .map(function (user) {
                const id = toCount(user.id);
                const role = user.isAdmin
                    ? '<span class="badge badge-brand">管理员</span>'
                    : '<span class="badge badge-muted">普通用户</span>';
                return (
                    "<tr>" +
                    '<td><div class="admin-cell-name">' + esc(displayNameOf(user)) + "</div></td>" +
                    "<td>" + esc(user.email || "—") + "</td>" +
                    "<td>" + esc(user.username || "—") + "</td>" +
                    "<td><strong>" + toCount(user.points) + "</strong></td>" +
                    "<td>" + role + "</td>" +
                    '<td class="muted text-sm">' + esc(API.formatTime(user.createdAt)) + "</td>" +
                    '<td><div class="admin-table-actions">' +
                    '<button type="button" class="btn btn-soft btn-sm" data-action="adjust-points" data-id="' + id + '">调整积分</button>' +
                    '<button type="button" class="btn btn-ghost btn-sm" data-action="reset-password" data-id="' + id + '">重置密码</button>' +
                    "</div></td>" +
                    "</tr>"
                );
            })
            .join("");

        container.innerHTML =
            '<div class="admin-table-wrap">' +
            '<table class="admin-table">' +
            "<thead><tr>" +
            "<th>昵称</th><th>邮箱</th><th>用户名</th><th>余额</th><th>身份</th><th>注册时间</th><th>操作</th>" +
            "</tr></thead>" +
            "<tbody>" + rows + "</tbody>" +
            "</table>" +
            "</div>";

        const hasMore = list.items.length < list.total && list.items.length >= PAGE_SIZE;
        el("user-more-wrap").classList.toggle("hidden", !hasMore);
    }

    function applyUserSearch() {
        state.lists.users.q = el("user-search").value.trim();
        loadUsers(true);
    }

    function resetUserSearch() {
        el("user-search").value = "";
        applyUserSearch();
    }

    function openPointsModal(user) {
        state.editingUser = user;
        el("points-user-name").textContent =
            "用户：" + displayNameOf(user) + "（" + (user.email || "无邮箱") + "），当前余额 " + toCount(user.points) + " 分";
        el("points-delta").value = "";
        el("points-note").value = "";
        el("points-modal-status").textContent = "";
        openModal("points-modal");
        el("points-delta").focus();
    }

    async function submitPointsAdjust() {
        const user = state.editingUser;
        if (!user) {
            return;
        }
        const delta = readInt("points-delta");
        const note = el("points-note").value.trim();
        const statusNode = el("points-modal-status");

        if (!Number.isInteger(delta) || delta === 0) {
            statusNode.textContent = "请填写非 0 的整数（正数加分，负数扣分）";
            el("points-delta").focus();
            return;
        }

        statusNode.textContent = "";
        setBusy(el("points-submit"), true, "提交中…");
        try {
            const result = await API.admin.adjustPoints(user.id, { delta: delta, note: note });
            const balance =
                result && result.balance !== undefined && result.balance !== null
                    ? Number(result.balance)
                    : null;
            closeModal("points-modal");
            state.editingUser = null;
            toast(
                balance === null || !Number.isFinite(balance)
                    ? "积分已调整"
                    : "积分已调整，当前余额 " + balance + " 分",
                "ok"
            );
            await loadUsers(true);
        } catch (err) {
            handleError(err);
        } finally {
            setBusy(el("points-submit"), false, "确认调整");
        }
    }

    function openPasswordModal(user) {
        state.editingUser = user;
        el("password-user-name").textContent =
            "用户：" + displayNameOf(user) + "（" + (user.email || "无邮箱") + "）";
        el("password-new").value = "";
        el("password-confirm").value = "";
        el("password-modal-status").textContent = "";
        openModal("password-modal");
        el("password-new").focus();
    }

    async function submitResetPassword() {
        const user = state.editingUser;
        if (!user) {
            return;
        }
        const password = el("password-new").value;
        const confirm = el("password-confirm").value;
        const statusNode = el("password-modal-status");

        if (!isStrongPassword(password)) {
            statusNode.textContent = "新密码至少 8 位，并且同时包含字母和数字";
            el("password-new").focus();
            return;
        }
        if (password !== confirm) {
            statusNode.textContent = "两次输入的密码不一致";
            el("password-confirm").focus();
            return;
        }

        statusNode.textContent = "";
        setBusy(el("password-submit"), true, "提交中…");
        try {
            await API.admin.resetPassword(user.id, { password: password });
            closeModal("password-modal");
            state.editingUser = null;
            toast("密码已重置，请把新密码告诉用户", "ok");
        } catch (err) {
            handleError(err);
        } finally {
            setBusy(el("password-submit"), false, "确认重置");
        }
    }

    // ================================
    // 十、网站内容
    // ================================

    async function ensureSettings(force) {
        if (state.settingsLoaded && !force) {
            return state.settings;
        }
        const result = await API.admin.settings();
        state.settings = (result && result.settings) || {};
        state.settingsLoaded = true;
        return state.settings;
    }

    function loadSiteSettings() {
        el("settings-status").textContent = "正在加载设置…";
        ensureSettings(true)
            .then(function (settings) {
                fillSettingsForm(settings);
                el("settings-status").textContent = "加载完成";
            })
            .catch(function (err) {
                el("settings-status").textContent = "";
                handleError(err);
            });
    }

    function fillSettingsForm(settings) {
        const data = settings || {};
        el("settings-site-title").value = settingText(data.site_title);
        el("settings-site-subtitle").value = settingText(data.site_subtitle);
        el("settings-song-title").value = settingText(data.song_title);
        el("settings-song-artist").value = settingText(data.song_artist);
        el("settings-song-url").value = settingText(data.song_url);
        el("settings-song-intro").value = settingText(data.song_intro);
        el("settings-song-cover").value = settingText(data.song_cover);
        el("settings-announcement").value = settingText(data.announcement);
        el("settings-rules-text").value = settingText(data.rules_text);
        el("settings-shop-intro").value = settingText(data.shop_intro);
        el("settings-points-base").value = settingText(data.points_base);
        el("settings-points-bonus").value = settingText(data.points_bonus);
        el("settings-daily-limit").value = settingText(data.submit_daily_limit);
        renderCoverPreview();
    }

    function renderCoverPreview() {
        const box = el("settings-cover-preview");
        const image = safeImageUrl(el("settings-song-cover").value.trim());
        box.innerHTML = image ? '<img src="' + esc(image) + '" alt="封面预览">' : "未设置封面";
    }

    async function uploadCoverFile(file) {
        if (!file) {
            return;
        }
        const problem = validateImageFile(file);
        if (problem) {
            toast(problem, "err");
            el("settings-cover-file").value = "";
            return;
        }
        el("settings-cover-status").textContent = "正在上传封面…";
        try {
            const result = await API.admin.upload(file);
            if (!result || !result.url) {
                throw new Error("上传成功但没拿到图片地址");
            }
            el("settings-song-cover").value = result.url;
            renderCoverPreview();
            el("settings-cover-status").textContent = "封面已上传（点「保存设置」后生效）";
            toast("封面已上传，记得保存设置", "ok");
        } catch (err) {
            el("settings-cover-status").textContent = "上传失败";
            handleError(err);
        } finally {
            el("settings-cover-file").value = "";
        }
    }

    async function saveSiteSettings(event) {
        if (event) {
            event.preventDefault();
        }
        const base = readInt("settings-points-base");
        const bonus = readInt("settings-points-bonus");
        const dailyLimit = readInt("settings-daily-limit");
        const statusNode = el("settings-status");

        if (!Number.isInteger(base) || base < 0) {
            statusNode.textContent = "提交基础分必须是非负整数";
            el("settings-points-base").focus();
            return;
        }
        if (!Number.isInteger(bonus) || bonus < 0) {
            statusNode.textContent = "采纳奖励分必须是非负整数";
            el("settings-points-bonus").focus();
            return;
        }
        if (!Number.isInteger(dailyLimit) || dailyLimit < 0) {
            statusNode.textContent = "每日提交上限必须是非负整数";
            el("settings-daily-limit").focus();
            return;
        }

        const payload = {
            site_title: el("settings-site-title").value.trim(),
            site_subtitle: el("settings-site-subtitle").value.trim(),
            song_title: el("settings-song-title").value.trim(),
            song_artist: el("settings-song-artist").value.trim(),
            song_url: el("settings-song-url").value.trim(),
            song_intro: el("settings-song-intro").value.trim(),
            song_cover: el("settings-song-cover").value.trim(),
            announcement: el("settings-announcement").value.trim(),
            rules_text: el("settings-rules-text").value.trim(),
            shop_intro: el("settings-shop-intro").value.trim(),
            points_base: String(base),
            points_bonus: String(bonus),
            submit_daily_limit: String(dailyLimit),
        };

        statusNode.textContent = "";
        setBusy(el("settings-save-btn"), true, "保存中…");
        try {
            const result = await API.admin.saveSettings(payload);
            if (result && result.settings) {
                state.settings = result.settings;
            } else {
                state.settings = Object.assign({}, state.settings, payload);
            }
            state.settingsLoaded = true;
            statusNode.textContent = "已保存（" + formatClock(new Date()) + "）";
            toast("网站内容已保存", "ok");
        } catch (err) {
            handleError(err);
        } finally {
            setBusy(el("settings-save-btn"), false, "保存设置");
        }
    }

    async function exportAllData() {
        setBusy(el("export-btn"), true, "导出中…");
        try {
            const data = await API.admin.exportData();
            const text = JSON.stringify(data, null, 2);
            const blob = new Blob([text], { type: "application/json;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = "建议网页数据备份-" + formatStamp(new Date()) + ".json";
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(function () {
                URL.revokeObjectURL(url);
            }, 30000);
            toast("数据备份已开始下载", "ok");
        } catch (err) {
            handleError(err);
        } finally {
            setBusy(el("export-btn"), false, "导出全部数据");
        }
    }

    // ================================
    // 十一、列表事件委托（动态按钮）
    // ================================

    function handleSubmissionListClick(event) {
        const button = event.target.closest("[data-action]");
        if (!button) {
            return;
        }
        const id = toCount(button.getAttribute("data-id"));
        const item = state.lists.submissions.items.find(function (entry) {
            return entry.id === id;
        });
        if (!item) {
            return;
        }
        const action = button.getAttribute("data-action");
        if (action === "approve") {
            openReview(item, "approve");
        } else if (action === "reject") {
            openReview(item, "reject");
        } else if (action === "delete") {
            deleteSubmission(item);
        }
    }

    function handlePrizeListClick(event) {
        const button = event.target.closest("[data-action]");
        if (!button) {
            return;
        }
        const id = toCount(button.getAttribute("data-id"));
        const prize = state.prizes.find(function (entry) {
            return entry.id === id;
        });
        if (!prize) {
            return;
        }
        const action = button.getAttribute("data-action");
        if (action === "edit-prize") {
            openPrizeModal(prize);
        } else if (action === "delete-prize") {
            deletePrizeItem(prize);
        }
    }

    function handleOrderListClick(event) {
        const button = event.target.closest("[data-action]");
        if (!button) {
            return;
        }
        const id = toCount(button.getAttribute("data-id"));
        const order = state.lists.orders.items.find(function (entry) {
            return entry.id === id;
        });
        if (!order) {
            return;
        }
        const action = button.getAttribute("data-action");
        if (action === "ship-order") {
            openShipModal(order);
        } else if (action === "cancel-order") {
            cancelOrder(order);
        } else if (action === "download-order") {
            downloadOrder(order);
        }
    }

    function handleUserListClick(event) {
        const button = event.target.closest("[data-action]");
        if (!button) {
            return;
        }
        const id = toCount(button.getAttribute("data-id"));
        const user = state.lists.users.items.find(function (entry) {
            return entry.id === id;
        });
        if (!user) {
            return;
        }
        const action = button.getAttribute("data-action");
        if (action === "adjust-points") {
            openPointsModal(user);
        } else if (action === "reset-password") {
            openPasswordModal(user);
        }
    }

    // ================================
    // 十二、事件绑定
    // ================================

    function bindEvents() {
        // ---- 入口 ----
        el("gate-retry").addEventListener("click", function () {
            boot();
        });
        el("setup-form").addEventListener("submit", submitSetup);
        el("login-tab-password").addEventListener("click", function () {
            switchLoginTab("password");
        });
        el("login-tab-code").addEventListener("click", function () {
            switchLoginTab("code");
        });
        el("login-password-form").addEventListener("submit", submitPasswordLogin);
        el("login-code-form").addEventListener("submit", submitCodeLogin);
        el("login-code-send").addEventListener("click", sendLoginCode);

        // ---- 导航与退出 ----
        for (const key of Object.keys(VIEW_TITLES)) {
            const nav = el("nav-" + key);
            if (nav) {
                nav.addEventListener("click", function () {
                    switchView(key);
                });
            }
        }
        el("logout-btn").addEventListener("click", logout);

        // ---- 概览 ----
        el("overview-refresh").addEventListener("click", loadOverview);
        el("overview-review-link").addEventListener("click", gotoSubmissionsPending);
        el("overview-orders-link").addEventListener("click", function () {
            switchView("orders");
        });
        el("overview-submissions").addEventListener("click", function (event) {
            if (event.target.closest("[data-goto]")) {
                gotoSubmissionsPending();
            }
        });
        el("overview-orders").addEventListener("click", function (event) {
            if (event.target.closest("[data-goto]")) {
                switchView("orders");
            }
        });

        // ---- 建议审核 ----
        el("submission-status").addEventListener("change", applySubmissionFilter);
        el("submission-search-btn").addEventListener("click", applySubmissionFilter);
        el("submission-reset-btn").addEventListener("click", resetSubmissionFilter);
        el("submission-search").addEventListener("keydown", function (event) {
            if (event.key === "Enter") {
                event.preventDefault();
                applySubmissionFilter();
            }
        });
        el("submission-more").addEventListener("click", function () {
            loadSubmissions(false);
        });
        el("submission-list").addEventListener("click", handleSubmissionListClick);

        // ---- 奖品管理 ----
        el("prize-refresh-btn").addEventListener("click", loadPrizes);
        el("prize-add-btn").addEventListener("click", function () {
            openPrizeModal(null);
        });
        el("prize-list").addEventListener("click", handlePrizeListClick);
        el("prize-kind").addEventListener("change", updatePrizeFileField);
        el("prize-image-file").addEventListener("change", function () {
            const file = this.files && this.files[0];
            uploadPrizeImage(file);
        });
        el("prize-image-clear").addEventListener("click", function () {
            state.prize.imageUrl = "";
            renderPrizeImage();
            el("prize-image-status").textContent = "已移除图片（点「保存奖品」后生效）";
        });
        el("prize-file-input").addEventListener("change", function () {
            const file = this.files && this.files[0];
            uploadPrizeFile(file);
        });
        el("prize-save").addEventListener("click", savePrize);
        el("prize-cancel").addEventListener("click", closePrizeModal);
        el("prize-close").addEventListener("click", closePrizeModal);

        // ---- 兑换订单 ----
        el("order-status").addEventListener("change", function () {
            state.lists.orders.status = el("order-status").value;
            loadOrders(true);
        });
        el("order-refresh-btn").addEventListener("click", function () {
            loadOrders(true);
        });
        el("order-more").addEventListener("click", function () {
            loadOrders(false);
        });
        el("order-list").addEventListener("click", handleOrderListClick);
        el("ship-submit").addEventListener("click", submitShip);
        el("ship-cancel").addEventListener("click", function () {
            closeModal("ship-modal");
            state.shippingOrder = null;
        });
        el("ship-close").addEventListener("click", function () {
            closeModal("ship-modal");
            state.shippingOrder = null;
        });

        // ---- 用户与积分 ----
        el("user-search-btn").addEventListener("click", applyUserSearch);
        el("user-reset-btn").addEventListener("click", resetUserSearch);
        el("user-search").addEventListener("keydown", function (event) {
            if (event.key === "Enter") {
                event.preventDefault();
                applyUserSearch();
            }
        });
        el("user-more").addEventListener("click", function () {
            loadUsers(false);
        });
        el("user-list").addEventListener("click", handleUserListClick);
        el("points-submit").addEventListener("click", submitPointsAdjust);
        el("points-cancel").addEventListener("click", function () {
            closeModal("points-modal");
            state.editingUser = null;
        });
        el("points-close").addEventListener("click", function () {
            closeModal("points-modal");
            state.editingUser = null;
        });
        el("password-submit").addEventListener("click", submitResetPassword);
        el("password-cancel").addEventListener("click", function () {
            closeModal("password-modal");
            state.editingUser = null;
        });
        el("password-close").addEventListener("click", function () {
            closeModal("password-modal");
            state.editingUser = null;
        });

        // ---- 网站内容 ----
        el("settings-form").addEventListener("submit", saveSiteSettings);
        el("settings-song-cover").addEventListener("input", renderCoverPreview);
        el("settings-cover-clear").addEventListener("click", function () {
            el("settings-song-cover").value = "";
            renderCoverPreview();
            el("settings-cover-status").textContent = "已清除封面（点「保存设置」后生效）";
        });
        el("settings-cover-file").addEventListener("change", function () {
            const file = this.files && this.files[0];
            uploadCoverFile(file);
        });
        el("export-btn").addEventListener("click", exportAllData);

        // ---- 审核弹窗 ----
        el("review-submit").addEventListener("click", submitReview);
        el("review-cancel").addEventListener("click", closeReview);
        el("review-close").addEventListener("click", closeReview);

        // ---- 确认弹窗 ----
        el("confirm-ok").addEventListener("click", function () {
            closeConfirm(true);
        });
        el("confirm-cancel").addEventListener("click", function () {
            closeConfirm(false);
        });
        el("confirm-close").addEventListener("click", function () {
            closeConfirm(false);
        });

        // ---- 弹窗遮罩点击关闭 ----
        const masks = document.querySelectorAll(".modal-mask");
        for (const mask of masks) {
            mask.addEventListener("click", function (event) {
                if (event.target !== mask) {
                    return;
                }
                if (mask.id === "confirm-modal") {
                    closeConfirm(false);
                } else {
                    mask.classList.remove("open");
                }
            });
        }

        // ---- Esc 关闭弹窗 ----
        document.addEventListener("keydown", function (event) {
            if (event.key !== "Escape") {
                return;
            }
            if (el("confirm-modal").classList.contains("open")) {
                closeConfirm(false);
                return;
            }
            const openMasks = document.querySelectorAll(".modal-mask.open");
            for (const mask of openMasks) {
                mask.classList.remove("open");
            }
        });
    }

    // ================================
    // 十三、启动
    // ================================

    function init() {
        API.onUnauthorized(handleUnauthorized);
        bindEvents();
        boot();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
