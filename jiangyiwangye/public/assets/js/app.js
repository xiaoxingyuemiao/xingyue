// ================================
// 星月小窝 · 建议网页 —— 前台页面逻辑（public/assets/js/app.js）
// 依赖：assets/js/api.js 暴露的 window.API；样式见 base.css / app.css
// 接口契约：jiangyiwangye/API.md（所有请求都走 API.auth / API.site / API.me）
// 约定：所有用户内容都用 textContent 或 API.escapeHtml 转义，禁止直接拼 innerHTML
// ================================

(function () {
    "use strict";

    // 依赖检查：api.js 必须在 app.js 之前加载
    if (!window.API) {
        console.error("[建议网页] api.js 未加载，页面无法请求接口");
        return;
    }

    const API = window.API;

    // ---------- 常量 ----------

    const LAST_EMAIL_KEY = "xingyue_jiangyi_last_email";
    // 校验规则与后端 lib/util.js 保持一致，避免用户填完才被服务端打回
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    const EMAIL_MAX = 120;
    const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;
    const PASSWORD_RE = /^(?=.*[A-Za-z])(?=.*\d).{8,64}$/;
    const CODE_RE = /^\d{4,8}$/;
    const NAME_MAX = 20;
    const SUBMIT_MIN = 20;
    const SUBMIT_MAX = 2000;
    const TITLE_MIN = 2;
    const TITLE_MAX = 60;
    const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
    const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

    // 积分流水类型文案（对齐 API.md 1.6）
    const LEDGER_LABELS = {
        submit_base: "提交建议",
        adopt_bonus: "采纳奖励",
        redeem: "兑换奖品",
        refund: "取消退回",
        admin_adjust: "管理员调整",
        revoke: "删除建议扣回",
    };

    // 建议状态（对齐 API.md 1.4）
    const SUB_STATUS = {
        pending: { text: "待审核", cls: "badge-warn" },
        approved: { text: "已采纳", cls: "badge-ok" },
        rejected: { text: "未采纳", cls: "badge-muted" },
    };

    // 兑换订单状态（对齐 API.md 1.5）
    const ORDER_STATUS = {
        pending: { text: "待发货", cls: "badge-warn" },
        fulfilled: { text: "已完成", cls: "badge-ok" },
        cancelled: { text: "已取消", cls: "badge-muted" },
    };

    // 动态列表里的占位星标（静态字符串，不含用户内容）
    const STAR_ICON =
        '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
        '<path d="M12 2.6l2.3 6.9 6.9 2.3-6.9 2.3L12 21.4l-2.3-7.3-6.9-2.3 6.9-2.3Z" fill="currentColor"/>' +
        "</svg>";

    // ---------- 页面状态 ----------

    const STATE = {
        site: null,
        me: null,
        prizes: [],
        balance: 0,
        lastEmail: "",
        codeMode: "login", // login | register
        cooldownLeft: 0,
        cooldownTimer: null,
        pendingSubmit: false, // 未登录点提交 → 登录后自动提交
        pendingRedeemId: null, // 未登录点兑换 → 登录后自动打开兑换弹窗
        currentPrize: null,
        successOrder: null,
        imageFile: null,
        imagePreviewUrl: "",
        activeTab: "points",
        submittingLogin: false,
        submittingSubmit: false,
        submittingRedeem: false,
        confirmResolve: null,
    };

    // ================================
    // 一、通用小工具
    // ================================

    function $(id) {
        return document.getElementById(id);
    }

    // show / hide 支持传 id 或元素
    function toNode(target) {
        return typeof target === "string" ? $(target) : target;
    }

    function show(target) {
        const node = toNode(target);
        if (node) {
            node.classList.remove("hidden");
        }
    }

    function hide(target) {
        const node = toNode(target);
        if (node) {
            node.classList.add("hidden");
        }
    }

    function toggle(target, visible) {
        if (visible) {
            show(target);
        } else {
            hide(target);
        }
    }

    // 设置纯文本内容（自动转义，用户内容一律走这里）
    function setText(id, value) {
        const node = $(id);
        if (!node) {
            return;
        }
        node.textContent = value === null || value === undefined ? "" : String(value);
    }

    const esc = API.escapeHtml;

    // 按 Unicode 码点计数，和后端 util.textLength 保持一致（emoji 算 1 个字）
    function textLength(value) {
        return Array.from(String(value === null || value === undefined ? "" : value)).length;
    }

    function isValidEmail(value) {
        const email = String(value || "").trim();
        return email.length <= EMAIL_MAX && EMAIL_RE.test(email);
    }

    function formatInt(value) {
        const n = Number(value);
        if (!isFinite(n)) {
            return "0";
        }
        return n.toLocaleString("zh-CN");
    }

    function formatFileSize(size) {
        const n = Number(size) || 0;
        if (n >= 1024 * 1024) {
            return (n / (1024 * 1024)).toFixed(1) + "MB";
        }
        return Math.max(1, Math.round(n / 1024)) + "KB";
    }

    function numberOr(value, fallback) {
        const n = Number(value);
        return isFinite(n) ? n : fallback;
    }

    function errorMessage(error) {
        if (!error) {
            return "操作失败，请稍后再试";
        }
        return error.message || "操作失败，请稍后再试";
    }

    // 页面内 toast（不用 alert）
    function toast(message, type, duration) {
        const wrap = $("toast-wrap");
        if (!wrap) {
            return;
        }
        const item = document.createElement("div");
        item.className = "toast" + (type === "ok" ? " ok" : type === "err" ? " err" : "");
        item.textContent = String(message || "");
        wrap.appendChild(item);
        const ms = duration || (type === "err" ? 4200 : 3000);
        setTimeout(function () {
            item.classList.add("toast-out");
            setTimeout(function () {
                item.remove();
            }, 240);
        }, ms);
    }

    // 把按钮置为“处理中”，返回恢复函数
    function setBusy(button, busyText) {
        if (!button) {
            return function () {};
        }
        const original = button.innerHTML;
        button.disabled = true;
        button.textContent = busyText || "处理中…";
        return function restore() {
            button.disabled = false;
            button.innerHTML = original;
        };
    }

    function bindClick(id, handler) {
        const node = $(id);
        if (!node) {
            console.warn("[建议网页] 找不到按钮：", id);
            return;
        }
        node.addEventListener("click", handler);
    }

    function onEnter(ids, handler) {
        for (const id of ids) {
            const node = $(id);
            if (!node) {
                continue;
            }
            node.addEventListener("keydown", function (event) {
                if (event.key === "Enter") {
                    event.preventDefault();
                    handler();
                }
            });
        }
    }

    // ================================
    // 二、弹窗 / 确认框
    // ================================

    function openModal(id) {
        const mask = $(id);
        if (!mask) {
            return;
        }
        mask.classList.add("open");
        document.body.classList.add("modal-open");
    }

    function closeModal(id) {
        const mask = $(id);
        if (!mask) {
            return;
        }
        mask.classList.remove("open");
        // 关闭确认框 = 用户取消
        if (id === "confirm-modal" && STATE.confirmResolve) {
            const resolve = STATE.confirmResolve;
            STATE.confirmResolve = null;
            resolve(false);
        }
        if (!document.querySelector(".modal-mask.open")) {
            document.body.classList.remove("modal-open");
        }
    }

    function settleConfirm(value) {
        const resolve = STATE.confirmResolve;
        STATE.confirmResolve = null;
        closeModal("confirm-modal");
        if (resolve) {
            resolve(value);
        }
    }

    // 返回 Promise<boolean>，页面内二次确认
    function confirmAction(options) {
        const opt = options || {};
        if (STATE.confirmResolve) {
            // 极少数情况下上一次确认还悬着，先按取消处理，避免 Promise 泄漏
            STATE.confirmResolve(false);
            STATE.confirmResolve = null;
        }
        setText("confirm-title", opt.title || "确认操作");
        setText("confirm-message", opt.message || "确定要继续吗？");
        const okBtn = $("btn-confirm-ok");
        okBtn.textContent = opt.okText || "确认";
        okBtn.className = "btn " + (opt.danger ? "btn-danger" : "btn-primary");
        openModal("confirm-modal");
        return new Promise(function (resolve) {
            STATE.confirmResolve = resolve;
        });
    }

    function openImageViewer(src) {
        if (!src) {
            return;
        }
        $("image-viewer-img").src = src;
        openModal("image-modal");
    }

    // ================================
    // 三、本地记忆（上次邮箱）
    // ================================

    function restoreLastEmail() {
        try {
            STATE.lastEmail = localStorage.getItem(LAST_EMAIL_KEY) || "";
        } catch (e) {
            STATE.lastEmail = "";
        }
    }

    function saveLastEmail(email) {
        STATE.lastEmail = email || "";
        try {
            localStorage.setItem(LAST_EMAIL_KEY, STATE.lastEmail);
        } catch (e) {
            /* 隐私模式下写不了 localStorage，忽略即可 */
        }
    }

    // ================================
    // 四、站点信息 / 歌曲 / 统计 / 规则
    // ================================

    async function loadSite(options) {
        const silent = !!(options && options.silent);
        try {
            const site = await API.site.get();
            applySite(site);
        } catch (error) {
            hide($("prize-loading"));
            setText("prize-empty-text", "奖品信息加载失败：请确认后台已经启动，然后刷新页面。");
            show($("prize-empty"));
            if (!silent) {
                toast("连不上后台：请先双击「启动建议网页.bat」，再刷新页面。", "err", 6000);
            }
        }
    }

    function applySite(site) {
        if (!site || typeof site !== "object") {
            return;
        }
        STATE.site = site;

        const title = site.siteTitle || "星月小窝 · 听歌说";
        document.title = title;
        setText("site-title", title);
        setText("site-subtitle", site.siteSubtitle || "给这首歌提建议，赚积分换奖品");

        renderSong(site.song || {});
        renderRules(site);
        renderStats(site.stats || {});

        if (site.announcement) {
            setText("announcement-text", site.announcement);
            show($("announcement"));
        } else {
            hide($("announcement"));
        }

        if (site.shopIntro) {
            setText("shop-intro", site.shopIntro);
            show($("shop-intro"));
        } else {
            hide($("shop-intro"));
        }

        STATE.prizes = Array.isArray(site.prizes) ? site.prizes : [];
        hide($("prize-loading"));
        renderPrizes();
    }

    function renderSong(song) {
        setText("song-title", song.title || "歌曲名待填写");

        const artist = song.artist ? String(song.artist) : "";
        if (artist) {
            setText("song-artist", "演唱 / " + artist);
            show($("song-artist"));
        } else {
            setText("song-artist", "");
            hide($("song-artist"));
        }

        const intro = song.intro ? String(song.intro) : "";
        if (intro) {
            setText("song-intro", intro);
            show($("song-intro"));
        } else {
            setText("song-intro", "");
            hide($("song-intro"));
        }

        // 网易云外链：只有站长填了 http(s) 链接才显示
        const link = $("song-link");
        const url = typeof song.url === "string" ? song.url.trim() : "";
        if (/^https?:\/\//i.test(url)) {
            link.href = url;
            show(link);
        } else {
            link.removeAttribute("href");
            hide(link);
        }

        applyCover(song.cover ? String(song.cover) : "");
    }

    function applyCover(url) {
        const img = $("song-cover");
        const placeholder = $("song-cover-placeholder");
        if (!url) {
            img.classList.add("hidden");
            img.removeAttribute("src");
            placeholder.classList.remove("hidden");
            return;
        }
        img.classList.add("hidden");
        placeholder.classList.remove("hidden");
        img.onload = function () {
            img.classList.remove("hidden");
            placeholder.classList.add("hidden");
        };
        img.onerror = function () {
            img.classList.add("hidden");
            placeholder.classList.remove("hidden");
        };
        img.src = url;
        if (img.complete && img.naturalWidth > 0) {
            img.classList.remove("hidden");
            placeholder.classList.add("hidden");
        }
    }

    function renderRules(site) {
        const rules = (site && site.rules) || {};
        setText("rule-base", "+" + numberOr(rules.base, 5) + " 积分");
        setText("rule-bonus", "再 +" + numberOr(rules.bonus, 50) + " 积分");
        setText("rule-limit", numberOr(rules.dailyLimit, 3) + " 条");
        if (site && site.rulesText) {
            setText("rules-text", site.rulesText);
            show($("rules-text"));
        } else {
            setText("rules-text", "");
            hide($("rules-text"));
        }
    }

    function renderStats(stats) {
        setText("stat-suggestions", formatInt(stats.suggestions));
        setText("stat-adopted", formatInt(stats.adopted));
        setText("stat-points", formatInt(stats.pointsGiven));
    }

    // ================================
    // 五、奖品商店
    // ================================

    function renderPrizes() {
        const list = $("prize-list");
        if (!list) {
            return;
        }
        const prizes = (STATE.prizes || []).filter(function (prize) {
            return prize && prize.active !== false;
        });
        hide($("prize-loading"));

        if (!prizes.length) {
            list.innerHTML = "";
            show($("prize-empty"));
            return;
        }

        hide($("prize-empty"));
        list.innerHTML = prizes.map(prizeCardHtml).join("");

        // 按 id 精确绑定按钮，避免依赖文档顺序
        for (const prize of prizes) {
            const prizeId = Number(prize.id) || 0;
            const button = $("btn-redeem-prize-" + prizeId);
            if (button) {
                button.addEventListener("click", function () {
                    openRedeem(prize);
                });
            }
        }
        // 奖品图挂了就藏起来，露出下面的渐变占位
        for (const img of list.querySelectorAll("img.prize-img")) {
            img.addEventListener("error", function () {
                img.style.display = "none";
            });
        }
    }

    function prizeCardHtml(prize) {
        const prizeId = Number(prize.id) || 0;
        const cost = Math.max(0, Number(prize.cost) || 0);
        const stock = Math.max(0, Number(prize.stock) || 0);
        const soldOut = stock <= 0;
        const isDigital = prize.kind === "digital";
        const noFile = isDigital && prize.hasFile === false;
        const loggedIn = !!STATE.me;
        const affordable = !loggedIn || STATE.balance >= cost;
        const disabled = soldOut || noFile || (loggedIn && !affordable);

        let buttonText = "兑换奖品";
        if (soldOut) {
            buttonText = "已兑完";
        } else if (noFile) {
            buttonText = "暂未开放";
        } else if (!loggedIn) {
            buttonText = "登录后兑换";
        } else if (!affordable) {
            buttonText = "积分不足";
        }

        let hint = "";
        if (soldOut) {
            hint = "让站长补货后再来吧";
        } else if (noFile) {
            hint = "站长还在准备兑换文件";
        } else if (loggedIn && !affordable) {
            hint = "还差 " + (cost - STATE.balance) + " 积分";
        } else if (!loggedIn) {
            hint = "登录后就能用积分兑换";
        }

        const kindLabel = isDigital ? "虚拟奖品" : "实物奖品";
        const kindClass = isDigital ? "badge-brand" : "badge-warn";
        const placeholder = '<span class="prize-ph" aria-hidden="true">' + STAR_ICON + "</span>";
        const imageHtml = prize.image
            ? '<img class="prize-img" src="' + esc(prize.image) + '" alt="' + esc(prize.name) + '" loading="lazy">'
            : "";
        const description = prize.description
            ? '<p class="prize-desc">' + esc(prize.description) + "</p>"
            : '<p class="prize-desc muted">站长还没写说明，兑换后可以直接问站长。</p>';

        return (
            '<article class="prize-card card">' +
                '<div class="prize-media">' +
                    placeholder +
                    imageHtml +
                    '<span class="badge ' + kindClass + ' prize-kind">' + kindLabel + "</span>" +
                "</div>" +
                '<div class="prize-body">' +
                    '<h3 class="prize-name">' + esc(prize.name) + "</h3>" +
                    description +
                    '<div class="prize-meta">' +
                        '<span class="prize-cost">✦ ' + cost + " 积分</span>" +
                        '<span class="prize-stock' + (soldOut ? " sold-out" : "") + '">' +
                            (soldOut ? "已兑完" : "剩余 " + stock + " 件") +
                        "</span>" +
                    "</div>" +
                    '<button id="btn-redeem-prize-' + prizeId + '" class="btn ' +
                        (disabled ? "btn-ghost" : "btn-primary") +
                        ' btn-block" type="button"' + (disabled ? " disabled" : "") + ">" + buttonText + "</button>" +
                    (hint ? '<p class="prize-hint">' + esc(hint) + "</p>" : "") +
                "</div>" +
            "</article>"
        );
    }

    function findPrize(prizeId) {
        const target = Number(prizeId);
        for (const prize of STATE.prizes || []) {
            if (Number(prize.id) === target) {
                return prize;
            }
        }
        return null;
    }

    // ================================
    // 六、登录状态与顶栏
    // ================================

    function renderAuth() {
        const loggedIn = !!STATE.me;
        if (loggedIn) {
            hide($("auth-guest"));
            show($("auth-user"));
            setText("user-name", STATE.me.displayName || "星友");
            setText("user-points", formatInt(STATE.balance));
            setText("my-welcome", STATE.me.displayName || "星友");
            setText("my-balance", formatInt(STATE.balance));
            setText("my-points", formatInt(STATE.balance));
            show($("my-area"));
            show($("my-points-box"));
        } else {
            show($("auth-guest"));
            hide($("auth-user"));
            hide($("my-area"));
            hide($("my-points-box"));
            closeUserMenu();
        }
        if (STATE.site) {
            renderPrizes();
        }
    }

    // 用户对象可能不带 points，按契约用积分接口兜底
    async function applyMe(user) {
        STATE.me = user || null;
        if (!STATE.me) {
            STATE.balance = 0;
            renderAuth();
            return;
        }
        let balance = typeof STATE.me.points === "number" ? STATE.me.points : null;
        if (balance === null) {
            try {
                const data = await API.me.points({ limit: 1 });
                balance = typeof data.balance === "number" ? data.balance : 0;
            } catch (e) {
                balance = 0;
            }
        }
        STATE.balance = Math.max(0, Number(balance) || 0);
        STATE.me.points = STATE.balance;
        renderAuth();
    }

    async function loadMe() {
        try {
            const data = await API.auth.me();
            await applyMe(data.user);
            loadMyArea();
        } catch (error) {
            STATE.me = null;
            STATE.balance = 0;
            renderAuth();
            if (!error || error.status !== 401) {
                toast(errorMessage(error), "err");
            }
        }
    }

    // 更新积分余额（顶栏、我的区域、兑换按钮状态一起刷新）
    function setBalance(value) {
        STATE.balance = Math.max(0, Number(value) || 0);
        if (!STATE.me) {
            return;
        }
        STATE.me.points = STATE.balance;
        setText("user-points", formatInt(STATE.balance));
        setText("my-balance", formatInt(STATE.balance));
        setText("my-points", formatInt(STATE.balance));
        if (STATE.site) {
            renderPrizes();
        }
    }

    // 登录失效统一处理（api.js 在 401 时会触发）
    let unauthorizedNotifiedAt = 0;
    function handleUnauthorized() {
        const wasLoggedIn = !!STATE.me;
        STATE.me = null;
        STATE.balance = 0;
        STATE.pendingSubmit = false;
        STATE.pendingRedeemId = null;
        clearMyLists();
        renderAuth();
        const now = Date.now();
        if (wasLoggedIn && now - unauthorizedNotifiedAt > 4000) {
            unauthorizedNotifiedAt = now;
            toast("登录状态已过期，请重新登录", "err");
        }
    }

    // ---------- 用户菜单 ----------

    function toggleUserMenu(force) {
        const box = $("auth-user");
        if (!box) {
            return;
        }
        const open = typeof force === "boolean" ? force : !box.classList.contains("open");
        box.classList.toggle("open", open);
        $("user-menu-btn").setAttribute("aria-expanded", open ? "true" : "false");
    }

    function closeUserMenu() {
        toggleUserMenu(false);
    }

    // ================================
    // 七、登录 / 注册弹窗
    // ================================

    function openLogin(mode) {
        if (STATE.me) {
            return;
        }
        if (mode === "register") {
            setLoginTab("code");
            setCodeMode("register");
        } else if (mode === "password") {
            setLoginTab("password");
        } else {
            setLoginTab("code");
            setCodeMode("login");
        }

        // 预填上次登录的邮箱
        if (STATE.lastEmail) {
            if (!$("code-email").value) {
                $("code-email").value = STATE.lastEmail;
            }
            if (!$("pwd-account").value) {
                $("pwd-account").value = STATE.lastEmail;
            }
        }

        hide($("forgot-tip"));
        updateSendCodeButton();
        openModal("login-modal");

        // 打开后聚焦到最该填的输入框
        setTimeout(function () {
            const target = $("login-panel-password").classList.contains("hidden")
                ? $("code-email")
                : $("pwd-account");
            if (target) {
                target.focus();
            }
        }, 30);
    }

    function setLoginTab(tab) {
        const isCode = tab !== "password";
        $("login-tab-code").classList.toggle("active", isCode);
        $("login-tab-code").setAttribute("aria-selected", isCode ? "true" : "false");
        $("login-tab-password").classList.toggle("active", !isCode);
        $("login-tab-password").setAttribute("aria-selected", isCode ? "false" : "true");
        toggle($("login-panel-code"), isCode);
        toggle($("login-panel-password"), !isCode);
        hide($("forgot-tip"));
        updateLoginText();
    }

    function setCodeMode(mode) {
        STATE.codeMode = mode === "register" ? "register" : "login";
        const isRegister = STATE.codeMode === "register";

        $("code-mode-login").classList.toggle("active", !isRegister);
        $("code-mode-login").setAttribute("aria-selected", isRegister ? "false" : "true");
        $("code-mode-register").classList.toggle("active", isRegister);
        $("code-mode-register").setAttribute("aria-selected", isRegister ? "true" : "false");
        toggle($("wrap-display-name"), isRegister);
        toggle($("wrap-username"), isRegister);
        $("btn-code-submit").textContent = isRegister ? "注册并登录" : "登录";

        // 切换登录 / 注册后旧验证码不再适用，清掉提示
        hideDevCode();
        hide($("forgot-tip"));
        updateLoginText();
    }

    function updateLoginText() {
        const isPassword = !$("login-panel-password").classList.contains("hidden");
        if (isPassword) {
            setText("login-modal-title", "密码登录");
            setText("login-modal-sub", "用邮箱或用户名 + 密码登录；忘了密码可以切回验证码登录");
            return;
        }
        if (STATE.codeMode === "register") {
            setText("login-modal-title", "加入星月小窝");
            setText("login-modal-sub", "注册后就能提交建议、赚积分换奖品");
        } else {
            setText("login-modal-title", "欢迎回来");
            setText("login-modal-sub", "用邮箱验证码登录，也可以切换密码登录");
        }
    }

    // 发送验证码
    async function handleSendCode() {
        if (STATE.cooldownLeft > 0) {
            return;
        }
        const email = $("code-email").value.trim();
        if (!isValidEmail(email)) {
            toast("请先填一个正确的邮箱地址", "err");
            $("code-email").focus();
            return;
        }

        const button = $("btn-send-code");
        button.disabled = true;
        button.textContent = "发送中…";
        try {
            const data = await API.auth.sendCode(email, STATE.codeMode);
            saveLastEmail(email);
            if (data && data.devCode) {
                showDevCode(data.devCode);
            } else {
                hideDevCode();
                toast("验证码已发送，请查收邮件", "ok");
            }
            startCooldown(data && data.cooldown ? data.cooldown : 60);
        } catch (error) {
            button.disabled = false;
            button.textContent = "发送验证码";
            toast(errorMessage(error), "err");
        }
    }

    function startCooldown(seconds) {
        STATE.cooldownLeft = Math.max(1, Number(seconds) || 60);
        updateSendCodeButton();
        if (STATE.cooldownTimer) {
            clearInterval(STATE.cooldownTimer);
        }
        STATE.cooldownTimer = setInterval(function () {
            STATE.cooldownLeft -= 1;
            if (STATE.cooldownLeft <= 0) {
                STATE.cooldownLeft = 0;
                clearInterval(STATE.cooldownTimer);
                STATE.cooldownTimer = null;
            }
            updateSendCodeButton();
        }, 1000);
    }

    function updateSendCodeButton() {
        const button = $("btn-send-code");
        if (!button) {
            return;
        }
        if (STATE.cooldownLeft > 0) {
            button.disabled = true;
            button.textContent = STATE.cooldownLeft + " 秒后重发";
        } else {
            button.disabled = false;
            button.textContent = "发送验证码";
        }
    }

    // 开发模式验证码：明显展示，点击可填入
    function showDevCode(code) {
        setText("dev-code-value", String(code));
        show($("dev-code-tip"));
        toast("开发模式：邮箱验证码是 " + code + "（点橙色提示可自动填入）", "ok", 8000);
    }

    function hideDevCode() {
        setText("dev-code-value", "");
        hide($("dev-code-tip"));
    }

    function fillDevCode() {
        const code = $("dev-code-value").textContent.trim();
        if (!code) {
            return;
        }
        $("code-code").value = code;
        toast("验证码已填入", "ok", 1600);
    }

    // 验证码登录 / 注册
    async function handleCodeSubmit() {
        if (STATE.submittingLogin) {
            return;
        }
        const email = $("code-email").value.trim();
        const code = $("code-code").value.trim();
        if (!isValidEmail(email)) {
            toast("请先填一个正确的邮箱地址", "err");
            $("code-email").focus();
            return;
        }
        if (!CODE_RE.test(code)) {
            toast("请输入收到的验证码（4~8 位数字）", "err");
            $("code-code").focus();
            return;
        }

        const isRegister = STATE.codeMode === "register";
        let displayName = "";
        let username = "";
        if (isRegister) {
            displayName = $("code-display-name").value.trim();
            username = $("code-username").value.trim();
            if (textLength(displayName) > NAME_MAX) {
                toast("昵称最多 " + NAME_MAX + " 个字", "err");
                $("code-display-name").focus();
                return;
            }
            if (username && !USERNAME_RE.test(username)) {
                toast("用户名要 3~20 位，只能用字母、数字、下划线", "err");
                $("code-username").focus();
                return;
            }
        }

        const button = $("btn-code-submit");
        const restore = setBusy(button, isRegister ? "注册中…" : "登录中…");
        STATE.submittingLogin = true;
        try {
            let data;
            if (isRegister) {
                const payload = { email: email, code: code };
                if (displayName) {
                    payload.displayName = displayName;
                }
                if (username) {
                    payload.username = username;
                }
                data = await API.auth.register(payload);
            } else {
                data = await API.auth.loginCode(email, code);
            }
            saveLastEmail(email);
            $("code-code").value = "";
            hideDevCode();
            await onLoginSuccess(data, isRegister ? "注册成功，欢迎加入星月小窝 ✨" : "登录成功，欢迎回来");
        } catch (error) {
            toast(errorMessage(error), "err");
        } finally {
            STATE.submittingLogin = false;
            restore();
            // 请求期间用户可能切换了登录/注册，按钮文案按当前模式兜底
            $("btn-code-submit").textContent = STATE.codeMode === "register" ? "注册并登录" : "登录";
        }
    }

    // 密码登录
    async function handlePwdSubmit() {
        if (STATE.submittingLogin) {
            return;
        }
        const account = $("pwd-account").value.trim();
        const password = $("pwd-password").value;
        if (!account) {
            toast("请填写邮箱或用户名", "err");
            $("pwd-account").focus();
            return;
        }
        if (!password) {
            toast("请填写密码", "err");
            $("pwd-password").focus();
            return;
        }

        const button = $("btn-pwd-submit");
        const restore = setBusy(button, "登录中…");
        STATE.submittingLogin = true;
        try {
            const data = await API.auth.loginPassword(account, password);
            // 账号可能是用户名，只有邮箱才记下来做下次预填
            if (isValidEmail(account)) {
                saveLastEmail(account);
            }
            $("pwd-password").value = "";
            await onLoginSuccess(data, "登录成功，欢迎回来");
        } catch (error) {
            toast(errorMessage(error), "err");
        } finally {
            STATE.submittingLogin = false;
            restore();
        }
    }

    // 登录成功后的统一处理（登录 / 注册共用）
    async function onLoginSuccess(data, message) {
        if (!data || !data.user) {
            throw new Error("登录响应异常：没有拿到用户信息");
        }
        closeModal("login-modal");
        hideDevCode();
        await applyMe(data.user);
        loadMyArea();

        const name = STATE.me && STATE.me.displayName ? "，" + STATE.me.displayName : "";
        toast(message + name, "ok");

        // 登录前挂起的动作，登录后继续
        if (STATE.pendingSubmit) {
            STATE.pendingSubmit = false;
            submitSuggestion();
        }
        if (STATE.pendingRedeemId) {
            const prizeId = STATE.pendingRedeemId;
            STATE.pendingRedeemId = null;
            const prize = findPrize(prizeId);
            if (prize) {
                openRedeem(prize);
            }
        }
    }

    function toggleForgotTip() {
        const tip = $("forgot-tip");
        if (tip.classList.contains("hidden")) {
            show(tip);
            toast("暂时没有邮箱找回功能：可以改用密码登录，或联系站长帮忙", "ok", 5000);
        } else {
            hide(tip);
        }
    }

    // ================================
    // 八、账号设置
    // ================================

    function openSettings() {
        if (!STATE.me) {
            openLogin("login");
            return;
        }
        setText("set-email", STATE.me.email || "—");
        $("set-display-name").value = STATE.me.displayName || "";
        $("set-username").value = STATE.me.username || "";
        $("set-password").value = "";
        $("set-password-confirm").value = "";
        hide($("forgot-tip"));
        openModal("settings-modal");
    }

    async function saveProfile() {
        if (!STATE.me) {
            openLogin("login");
            return;
        }
        const displayName = $("set-display-name").value.trim();
        const username = $("set-username").value.trim();
        const nameLength = textLength(displayName);
        if (nameLength < 1) {
            toast("昵称不能为空", "err");
            $("set-display-name").focus();
            return;
        }
        if (nameLength > NAME_MAX) {
            toast("昵称最多 " + NAME_MAX + " 个字", "err");
            $("set-display-name").focus();
            return;
        }
        if (username && !USERNAME_RE.test(username)) {
            toast("用户名要 3~20 位，只能用字母、数字、下划线", "err");
            $("set-username").focus();
            return;
        }

        const sameName = displayName === (STATE.me.displayName || "");
        const sameUsername = username === (STATE.me.username || "");
        if (sameName && sameUsername) {
            toast("资料没有变化", "ok");
            return;
        }

        const payload = { displayName: displayName };
        if (username) {
            payload.username = username;
        }

        const button = $("btn-save-profile");
        const restore = setBusy(button, "保存中…");
        try {
            const data = await API.auth.updateProfile(payload);
            await applyMe(data.user);
            toast("资料已保存", "ok");
        } catch (error) {
            toast(errorMessage(error), "err");
        } finally {
            restore();
        }
    }

    async function savePassword() {
        if (!STATE.me) {
            openLogin("login");
            return;
        }
        const password = $("set-password").value;
        const confirmPassword = $("set-password-confirm").value;
        if (!PASSWORD_RE.test(password)) {
            toast("密码要 8~64 位，且同时包含字母和数字", "err");
            $("set-password").focus();
            return;
        }
        if (password !== confirmPassword) {
            toast("两次输入的密码不一致", "err");
            $("set-password-confirm").focus();
            return;
        }

        const button = $("btn-save-password");
        const restore = setBusy(button, "保存中…");
        try {
            await API.auth.setPassword(password);
            $("set-password").value = "";
            $("set-password-confirm").value = "";
            toast("密码已设置，以后可以用密码登录了", "ok");
        } catch (error) {
            toast(errorMessage(error), "err");
        } finally {
            restore();
        }
    }

    async function handleLogout() {
        closeUserMenu();
        const ok = await confirmAction({
            title: "退出登录",
            message: "确定要退出当前账号吗？退出后需要重新登录才能提交建议和兑换奖品。",
            okText: "退出登录",
            danger: true,
        });
        if (!ok) {
            return;
        }
        await API.auth.logout();
        STATE.me = null;
        STATE.balance = 0;
        STATE.pendingSubmit = false;
        STATE.pendingRedeemId = null;
        STATE.submittingRedeem = false;
        STATE.currentPrize = null;
        STATE.successOrder = null;
        closeModal("settings-modal");
        clearMyLists();
        renderAuth();
        toast("已退出登录，期待下次见 🌙", "ok");
    }

    // ================================
    // 九、提交建议
    // ================================

    function updateContentCounter() {
        const length = textLength($("sug-content").value.trim());
        const counter = $("content-count");
        const hint = $("content-hint");
        counter.textContent = length + " / " + SUBMIT_MIN + "~" + SUBMIT_MAX + " 字";
        counter.classList.toggle("error", length > SUBMIT_MAX);
        hint.classList.remove("ok", "error");
        if (length === 0) {
            hint.textContent = "至少 " + SUBMIT_MIN + " 字，最多 " + SUBMIT_MAX + " 字；写具体一点更容易被采纳。";
        } else if (length < SUBMIT_MIN) {
            hint.textContent = "再写 " + (SUBMIT_MIN - length) + " 个字就可以提交了。";
        } else if (length > SUBMIT_MAX) {
            hint.textContent = "超过 " + SUBMIT_MAX + " 字了，稍微精简一下。";
            hint.classList.add("error");
        } else {
            hint.textContent = "字数刚好，可以提交啦 ✨";
            hint.classList.add("ok");
        }
    }

    function handleImagePick(event) {
        const file = event.target.files && event.target.files[0];
        event.target.value = ""; // 允许重新选择同一张图片
        if (!file) {
            return;
        }
        if (IMAGE_TYPES.indexOf(file.type) === -1) {
            toast("只支持 jpg / png / webp / gif 格式的图片", "err");
            return;
        }
        if (file.size > IMAGE_MAX_BYTES) {
            toast("图片不能超过 8MB，换一张小一点的吧", "err");
            return;
        }

        clearImagePreview();
        STATE.imageFile = file;
        STATE.imagePreviewUrl = URL.createObjectURL(file);
        $("image-preview").src = STATE.imagePreviewUrl;
        setText("image-name", file.name + " · " + formatFileSize(file.size));
        show($("image-preview-wrap"));
    }

    function clearImagePreview() {
        if (STATE.imagePreviewUrl) {
            URL.revokeObjectURL(STATE.imagePreviewUrl);
            STATE.imagePreviewUrl = "";
        }
        STATE.imageFile = null;
        const preview = $("image-preview");
        if (preview) {
            preview.removeAttribute("src");
        }
        setText("image-name", "");
        hide($("image-preview-wrap"));
    }

    function resetSuggestionForm() {
        $("sug-title").value = "";
        $("sug-content").value = "";
        $("sug-category").value = "旋律";
        clearImagePreview();
        updateContentCounter();
    }

    async function submitSuggestion() {
        if (STATE.submittingSubmit) {
            return;
        }
        const title = $("sug-title").value.trim();
        const category = $("sug-category").value || "其他";
        const content = $("sug-content").value.trim();
        const titleLength = textLength(title);
        const contentLength = textLength(content);

        if (titleLength < TITLE_MIN) {
            toast("标题至少 " + TITLE_MIN + " 个字，短短一句也行", "err");
            $("sug-title").focus();
            return;
        }
        if (titleLength > TITLE_MAX) {
            toast("标题最多 " + TITLE_MAX + " 个字，长内容可以写进正文", "err");
            $("sug-title").focus();
            return;
        }
        if (contentLength < SUBMIT_MIN) {
            toast("正文至少 " + SUBMIT_MIN + " 字，再写一点点吧", "err");
            $("sug-content").focus();
            return;
        }
        if (contentLength > SUBMIT_MAX) {
            toast("正文最多 " + SUBMIT_MAX + " 字，稍微精简一下", "err");
            $("sug-content").focus();
            return;
        }

        // 未登录：先登录，登录成功后自动提交（内容在表单里不会丢）
        if (!API.isLoggedIn() || !STATE.me) {
            STATE.pendingSubmit = true;
            openLogin("login");
            toast("登录后会自动帮你提交这条建议，内容不会丢", "ok", 4500);
            return;
        }

        const button = $("btn-submit-suggestion");
        STATE.submittingSubmit = true;
        const restore = setBusy(button, "提交中…");
        try {
            const payload = {
                title: title,
                category: category,
                content: content,
            };
            if (STATE.imageFile) {
                payload.image = await API.fileToDataURL(STATE.imageFile);
            }
            const data = await API.me.submit(payload);
            const awarded = numberOr(data.pointsAwarded, 0);
            toast("建议提交成功，+" + awarded + " 积分，谢谢你的认真 ✨", "ok");
            resetSuggestionForm();
            if (typeof data.balance === "number") {
                setBalance(data.balance);
            }
            loadMyArea();
            loadSite({ silent: true });
        } catch (error) {
            if (error && error.status === 401) {
                STATE.pendingSubmit = true;
                openLogin("login");
                toast("登录状态过期了，重新登录后会继续提交", "err");
            } else {
                toast(errorMessage(error), "err");
            }
        } finally {
            STATE.submittingSubmit = false;
            restore();
        }
    }

    // ================================
    // 十、兑换奖品
    // ================================

    function openRedeem(prize) {
        if (!prize) {
            return;
        }
        if (!STATE.me) {
            STATE.pendingRedeemId = Number(prize.id) || null;
            openLogin("login");
            toast("登录后就能兑换奖品啦", "ok");
            return;
        }
        const cost = Math.max(0, Number(prize.cost) || 0);
        const stock = Math.max(0, Number(prize.stock) || 0);
        if (stock <= 0) {
            toast("这件奖品已经兑完啦", "err");
            return;
        }
        if (prize.kind === "digital" && prize.hasFile === false) {
            toast("这件奖品还在整理文件，晚一点再来吧", "err");
            return;
        }
        if (STATE.balance < cost) {
            toast("积分不足，还差 " + (cost - STATE.balance) + " 积分", "err");
            return;
        }

        STATE.currentPrize = prize;
        const isDigital = prize.kind === "digital";
        setText("redeem-prize-name", prize.name || "奖品");
        const kind = $("redeem-prize-kind");
        kind.textContent = isDigital ? "虚拟奖品" : "实物奖品";
        kind.className = "badge " + (isDigital ? "badge-brand" : "badge-warn");
        setText("redeem-cost", formatInt(cost));
        setText("redeem-balance", formatInt(STATE.balance));
        toggle($("redeem-digital-tip"), isDigital);
        toggle($("wrap-redeem-address"), !isDigital);
        toggle($("wrap-redeem-contact"), !isDigital);
        $("redeem-address").value = "";
        $("redeem-contact").value = "";
        $("redeem-note").value = "";
        show($("redeem-form"));
        hide($("redeem-success"));
        openModal("redeem-modal");
    }

    async function submitRedeem() {
        const prize = STATE.currentPrize;
        if (!prize || !STATE.me || STATE.submittingRedeem) {
            return;
        }
        const isDigital = prize.kind === "digital";
        let address = "";
        let contact = "";
        if (!isDigital) {
            address = $("redeem-address").value.trim();
            contact = $("redeem-contact").value.trim();
            if (textLength(address) < 5) {
                toast("请填写完整的收货地址（至少 5 个字）", "err");
                $("redeem-address").focus();
                return;
            }
            if (textLength(contact) < 2) {
                toast("请填写联系方式（微信 / QQ / 手机号）", "err");
                $("redeem-contact").focus();
                return;
            }
        }
        const note = $("redeem-note").value.trim();
        const cost = Math.max(0, Number(prize.cost) || 0);

        // 二次确认
        const ok = await confirmAction({
            title: "确认兑换",
            message: "确认用 " + cost + " 积分兑换「" + (prize.name || "奖品") + "」吗？兑换后积分会立即扣除。",
            okText: "确认兑换",
        });
        if (!ok) {
            return;
        }

        const button = $("btn-redeem-submit");
        const restore = setBusy(button, "兑换中…");
        STATE.submittingRedeem = true;
        try {
            const payload = { prizeId: prize.id };
            if (!isDigital) {
                payload.address = address;
                payload.contact = contact;
            }
            if (note) {
                payload.note = note;
            }
            const data = await API.me.redeem(payload);
            if (typeof data.balance === "number") {
                setBalance(data.balance);
            }
            showRedeemSuccess(data.order, prize);
            loadSite({ silent: true }); // 刷新库存
            loadMyArea(); // 刷新兑换记录
        } catch (error) {
            toast(errorMessage(error), "err");
        } finally {
            STATE.submittingRedeem = false;
            restore();
        }
    }

    function showRedeemSuccess(order, prize) {
        STATE.successOrder = order || null;
        hide($("redeem-form"));
        show($("redeem-success"));
        const isDigital = !!prize && prize.kind === "digital";
        const name = (prize && prize.name) || "奖品";
        setText("redeem-success-title", "兑换成功 🎉");
        if (isDigital) {
            setText("redeem-success-text", "「" + name + "」已经放进你的兑换记录，点击下面的按钮下载文件。");
            show($("btn-success-download"));
        } else {
            setText(
                "redeem-success-text",
                "「" + name + "」兑换成功，站长会尽快打包发货；可以在「我的兑换」里查看快递单号。"
            );
            hide($("btn-success-download"));
        }
        toast("兑换成功，积分已扣除", "ok");
    }

    async function downloadOrder(order, button) {
        if (!order) {
            return;
        }
        const restore = button ? setBusy(button, "下载中…") : function () {};
        try {
            await API.me.downloadOrder(order);
            toast("开始下载，请查看浏览器下载列表", "ok");
        } catch (error) {
            toast(errorMessage(error), "err");
        } finally {
            restore();
        }
    }

    async function downloadSuccessOrder() {
        if (!STATE.successOrder) {
            return;
        }
        await downloadOrder(STATE.successOrder, $("btn-success-download"));
    }

    // ================================
    // 十一、我的区域（积分流水 / 我的建议 / 我的兑换）
    // ================================

    const TABS = [
        { name: "points", button: "tab-btn-points", panel: "tab-panel-points" },
        { name: "submissions", button: "tab-btn-submissions", panel: "tab-panel-submissions" },
        { name: "orders", button: "tab-btn-orders", panel: "tab-panel-orders" },
    ];

    function switchTab(name) {
        const exists = TABS.some(function (tab) {
            return tab.name === name;
        });
        if (!exists) {
            name = "points";
        }
        STATE.activeTab = name;
        for (const tab of TABS) {
            const active = tab.name === name;
            const button = $(tab.button);
            const panel = $(tab.panel);
            if (button) {
                button.classList.toggle("active", active);
                button.setAttribute("aria-selected", active ? "true" : "false");
            }
            toggle(panel, active);
        }
    }

    function loadPanel(name) {
        if (name === "points") {
            loadPoints();
        } else if (name === "submissions") {
            loadSubmissions();
        } else if (name === "orders") {
            loadOrders();
        }
    }

    function loadMyArea() {
        if (!STATE.me) {
            return;
        }
        loadPoints();
        loadSubmissions();
        loadOrders();
    }

    function goMyRecords(tab) {
        closeUserMenu();
        if (!STATE.me) {
            openLogin("login");
            return;
        }
        switchTab(tab || "submissions");
        loadMyArea();
        const area = $("my-area");
        if (area && area.scrollIntoView) {
            area.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    }

    function clearMyLists() {
        $("points-list").innerHTML = "";
        $("submissions-list").innerHTML = "";
        $("orders-list").innerHTML = "";
        hide($("points-list"));
        hide($("submissions-list"));
        hide($("orders-list"));
        hide($("points-empty"));
        hide($("submissions-empty"));
        hide($("orders-empty"));
        show($("points-loading"));
        hide($("submissions-loading"));
        hide($("orders-loading"));
    }

    async function loadPoints() {
        if (!STATE.me) {
            return;
        }
        const loading = $("points-loading");
        const list = $("points-list");
        const empty = $("points-empty");
        show(loading);
        hide(list);
        hide(empty);
        try {
            const data = await API.me.points({ limit: 50 });
            if (typeof data.balance === "number") {
                setBalance(data.balance);
            }
            renderPoints(Array.isArray(data.entries) ? data.entries : []);
            hide(loading);
        } catch (error) {
            hide(loading);
            setText("points-empty-text", "积分流水加载失败：" + errorMessage(error));
            show(empty);
        }
    }

    function renderPoints(entries) {
        const list = $("points-list");
        if (!entries.length) {
            list.innerHTML = "";
            hide(list);
            setText("points-empty-text", "还没有积分记录，提交第一条建议就会有了 ✨");
            show($("points-empty"));
            return;
        }
        hide($("points-empty"));
        const rows = entries
            .map(function (entry) {
                const delta = Number(entry.delta) || 0;
                const deltaText = (delta > 0 ? "+" : "") + delta;
                const typeText = LEDGER_LABELS[entry.type] || entry.type || "积分变动";
                return (
                    '<li class="ledger-item">' +
                        '<div class="ledger-left">' +
                            '<span class="ledger-type">' + esc(typeText) + "</span>" +
                            '<span class="ledger-note">' + esc(entry.note || "") + "</span>" +
                        "</div>" +
                        '<div class="ledger-right">' +
                            '<strong class="ledger-delta ' + (delta >= 0 ? "delta-up" : "delta-down") + '">' + deltaText + "</strong>" +
                            '<span class="text-xs muted">' + esc(API.formatTime(entry.createdAt)) + "</span>" +
                        "</div>" +
                    "</li>"
                );
            })
            .join("");
        list.innerHTML = '<ul class="ledger-list">' + rows + "</ul>";
        show(list);
    }

    async function loadSubmissions() {
        if (!STATE.me) {
            return;
        }
        const loading = $("submissions-loading");
        const list = $("submissions-list");
        const empty = $("submissions-empty");
        show(loading);
        hide(list);
        hide(empty);
        try {
            const data = await API.me.submissions({ limit: 50 });
            renderSubmissions(Array.isArray(data.items) ? data.items : []);
            hide(loading);
        } catch (error) {
            hide(loading);
            setText("submissions-empty-text", "我的建议加载失败：" + errorMessage(error));
            show(empty);
        }
    }

    function renderSubmissions(items) {
        const list = $("submissions-list");
        if (!items.length) {
            list.innerHTML = "";
            hide(list);
            setText("submissions-empty-text", "还没有提交过建议，写下第一条吧 ✨");
            show($("submissions-empty"));
            return;
        }
        hide($("submissions-empty"));
        list.innerHTML = items.map(submissionCardHtml).join("");
        // 配图挂了就藏起来（不阻塞其他内容）
        for (const img of list.querySelectorAll("img.sub-thumb")) {
            img.addEventListener("error", function () {
                img.style.display = "none";
            });
        }
        show(list);
    }

    function submissionCardHtml(item) {
        const status = SUB_STATUS[item.status] || { text: item.status || "未知状态", cls: "badge-muted" };
        const base = numberOr(item.basePoints, 0);
        const bonus = numberOr(item.bonusPoints, 0);
        const pointsText = "基础 +" + base + (bonus ? " · 采纳奖励 +" + bonus : "") + " 积分";
        const reviewed = item.reviewedAt ? " · 审核于 " + API.formatTime(item.reviewedAt) : "";
        const imageHtml = item.image
            ? '<img class="sub-thumb" src="' + esc(item.image) + '" alt="建议配图">'
            : "";
        const noteHtml = item.adminNote
            ? '<div class="sub-note"><strong>站长备注</strong><span>' + esc(item.adminNote) + "</span></div>"
            : "";

        return (
            '<article class="sub-card">' +
                '<div class="sub-head">' +
                    '<h3 class="sub-title">' + esc(item.title) + "</h3>" +
                    '<div class="sub-badges">' +
                        '<span class="badge badge-brand">' + esc(item.category || "其他") + "</span>" +
                        '<span class="badge ' + status.cls + '">' + esc(status.text) + "</span>" +
                    "</div>" +
                "</div>" +
                '<p class="sub-meta">' + esc(API.formatTime(item.createdAt)) + esc(reviewed) + " · " + pointsText + "</p>" +
                '<p class="sub-content">' + esc(item.content) + "</p>" +
                imageHtml +
                noteHtml +
            "</article>"
        );
    }

    async function loadOrders() {
        if (!STATE.me) {
            return;
        }
        const loading = $("orders-loading");
        const list = $("orders-list");
        const empty = $("orders-empty");
        show(loading);
        hide(list);
        hide(empty);
        try {
            const data = await API.me.orders({ limit: 50 });
            renderOrders(Array.isArray(data.items) ? data.items : []);
            hide(loading);
        } catch (error) {
            hide(loading);
            setText("orders-empty-text", "兑换记录加载失败：" + errorMessage(error));
            show(empty);
        }
    }

    function renderOrders(items) {
        const list = $("orders-list");
        if (!items.length) {
            list.innerHTML = "";
            hide(list);
            setText("orders-empty-text", "还没有兑换过奖品，去奖品商店逛逛吧 ✨");
            show($("orders-empty"));
            return;
        }
        hide($("orders-empty"));
        list.innerHTML = items.map(orderCardHtml).join("");
        show(list);

        // 下载按钮按订单 id 精确绑定
        for (const order of items) {
            if (!order.canDownload) {
                continue;
            }
            const orderId = Number(order.id) || 0;
            const button = $("btn-download-order-" + orderId);
            if (button) {
                button.addEventListener("click", function () {
                    downloadOrder(order, button);
                });
            }
        }
        for (const img of list.querySelectorAll(".order-media img")) {
            img.addEventListener("error", function () {
                img.style.display = "none";
            });
        }
    }

    function orderCardHtml(order) {
        const prize = order.prize || {};
        const isDigital = prize.kind === "digital";
        const status = orderStatusInfo(order, isDigital);
        const cost = numberOr(order.cost, 0);
        const orderId = Number(order.id) || 0;

        const imageHtml = prize.image
            ? '<img src="' + esc(prize.image) + '" alt="">'
            : '<span class="order-ph" aria-hidden="true">' + STAR_ICON + "</span>";

        const lines = [];
        if (!isDigital && order.address) {
            lines.push('<p class="order-line"><span>收货地址</span><strong>' + esc(order.address) + "</strong></p>");
        }
        if (!isDigital && order.contact) {
            lines.push('<p class="order-line"><span>联系方式</span><strong>' + esc(order.contact) + "</strong></p>");
        }
        if (order.trackingNo) {
            lines.push('<p class="order-line"><span>快递单号</span><strong>' + esc(order.trackingNo) + "</strong></p>");
        }
        if (order.note) {
            lines.push('<p class="order-line"><span>备注</span><strong>' + esc(order.note) + "</strong></p>");
        }

        const downloadButton = order.canDownload
            ? '<button id="btn-download-order-' + orderId + '" class="btn btn-soft btn-sm" type="button">下载奖品</button>'
            : "";

        return (
            '<article class="order-card">' +
                '<div class="order-media">' + imageHtml + "</div>" +
                '<div class="order-body">' +
                    '<div class="order-head">' +
                        '<h3 class="order-title">' + esc(prize.name || "奖品已下架") + "</h3>" +
                        '<span class="badge ' + status.cls + '">' + esc(status.text) + "</span>" +
                    "</div>" +
                    '<p class="order-meta">' + esc(API.formatTime(order.createdAt)) + " · 花费 " + cost + " 积分</p>" +
                    lines.join("") +
                    (downloadButton ? '<div class="order-actions">' + downloadButton + "</div>" : "") +
                "</div>" +
            "</article>"
        );
    }

    function orderStatusInfo(order, isDigital) {
        const status = ORDER_STATUS[order.status] || { text: order.status || "未知状态", cls: "badge-muted" };
        if (isDigital && order.status === "fulfilled") {
            return { text: "已完成", cls: "badge-ok" };
        }
        if (!isDigital && order.status === "fulfilled") {
            return { text: "已发货", cls: "badge-ok" };
        }
        return status;
    }

    // ================================
    // 十二、事件绑定
    // ================================

    function bindHeaderEvents() {
        bindClick("btn-open-login", function () {
            openLogin("login");
        });
        bindClick("btn-open-register", function () {
            openLogin("register");
        });
        bindClick("user-menu-btn", function () {
            toggleUserMenu();
        });
        bindClick("menu-my", function () {
            goMyRecords("submissions");
        });
        bindClick("menu-settings", function () {
            closeUserMenu();
            openSettings();
        });
        bindClick("menu-logout", handleLogout);
        bindClick("btn-go-my", function () {
            goMyRecords("submissions");
        });
    }

    function bindSubmitEvents() {
        bindClick("btn-pick-image", function () {
            $("sug-image").click();
        });
        const fileInput = $("sug-image");
        if (fileInput) {
            fileInput.addEventListener("change", handleImagePick);
        }
        bindClick("btn-remove-image", clearImagePreview);
        bindClick("btn-submit-suggestion", submitSuggestion);
        const content = $("sug-content");
        if (content) {
            content.addEventListener("input", updateContentCounter);
        }
    }

    function bindLoginEvents() {
        bindClick("btn-login-close", function () {
            closeModal("login-modal");
        });
        bindClick("login-tab-code", function () {
            setLoginTab("code");
        });
        bindClick("login-tab-password", function () {
            setLoginTab("password");
        });
        bindClick("code-mode-login", function () {
            setCodeMode("login");
        });
        bindClick("code-mode-register", function () {
            setCodeMode("register");
        });
        bindClick("btn-send-code", handleSendCode);
        bindClick("btn-code-submit", handleCodeSubmit);
        bindClick("btn-pwd-submit", handlePwdSubmit);
        bindClick("btn-forgot", toggleForgotTip);
        bindClick("dev-code-tip", fillDevCode);

        onEnter(["code-email"], handleSendCode);
        onEnter(["code-code"], handleCodeSubmit);
        onEnter(["pwd-account", "pwd-password"], handlePwdSubmit);
    }

    function bindSettingsEvents() {
        bindClick("btn-settings-close", function () {
            closeModal("settings-modal");
        });
        bindClick("btn-save-profile", saveProfile);
        bindClick("btn-save-password", savePassword);
        bindClick("btn-settings-logout", handleLogout);
    }

    function bindRedeemEvents() {
        bindClick("btn-redeem-close", function () {
            closeModal("redeem-modal");
        });
        bindClick("btn-redeem-submit", submitRedeem);
        bindClick("btn-success-close", function () {
            closeModal("redeem-modal");
        });
        bindClick("btn-success-download", downloadSuccessOrder);
    }

    function bindMyAreaEvents() {
        bindClick("tab-btn-points", function () {
            switchTab("points");
            loadPanel("points");
        });
        bindClick("tab-btn-submissions", function () {
            switchTab("submissions");
            loadPanel("submissions");
        });
        bindClick("tab-btn-orders", function () {
            switchTab("orders");
            loadPanel("orders");
        });
        bindClick("btn-refresh-my", function () {
            loadMyArea();
            toast("已刷新", "ok", 1500);
        });

        const submissionsList = $("submissions-list");
        if (submissionsList) {
            submissionsList.addEventListener("click", function (event) {
                const img = event.target.closest("img.sub-thumb");
                if (img) {
                    openImageViewer(img.getAttribute("src"));
                }
            });
        }
    }

    function bindGlobalEvents() {
        bindClick("btn-confirm-ok", function () {
            settleConfirm(true);
        });
        bindClick("btn-confirm-cancel", function () {
            settleConfirm(false);
        });
        bindClick("btn-image-close", function () {
            closeModal("image-modal");
        });

        // 点遮罩关闭弹窗
        for (const mask of document.querySelectorAll(".modal-mask")) {
            mask.addEventListener("click", function (event) {
                if (event.target === mask) {
                    closeModal(mask.id);
                }
            });
        }

        // Esc 关闭最上层弹窗 / 菜单
        document.addEventListener("keydown", function (event) {
            if (event.key !== "Escape") {
                return;
            }
            if ($("confirm-modal").classList.contains("open")) {
                settleConfirm(false);
                return;
            }
            const opened = document.querySelector(".modal-mask.open");
            if (opened) {
                closeModal(opened.id);
                return;
            }
            closeUserMenu();
        });

        // 点空白处收起用户菜单
        document.addEventListener("click", function (event) {
            const box = $("auth-user");
            if (!box || box.classList.contains("hidden")) {
                return;
            }
            if (!box.contains(event.target)) {
                closeUserMenu();
            }
        });
    }

    // ================================
    // 十三、启动
    // ================================

    function init() {
        bindHeaderEvents();
        bindSubmitEvents();
        bindLoginEvents();
        bindSettingsEvents();
        bindRedeemEvents();
        bindMyAreaEvents();
        bindGlobalEvents();

        restoreLastEmail();
        API.onUnauthorized(handleUnauthorized);
        renderAuth();
        updateContentCounter();
        loadSite();

        if (API.isLoggedIn()) {
            loadMe();
        }
    }

    init();
})();
