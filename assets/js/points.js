// ================================
// 个人中心 · 积分页（user.html 的 #view-points）
// 余额 / 每日签到 / 积分用途 / 挂出兑换物 / 我挂的兑换物 / 兑换单 / 积分明细
//
// 依赖：store.js、auth.js、cloud.js（积分只存后端，本机不落库）
// 暴露：window.Points.refresh()（settings.js 切到积分视图时调用）
// ================================

window.Points = (function () {

    const LOG_SIZE = 10;

    const el = {
        balance: document.getElementById("points-balance"),
        dailyText: document.getElementById("points-daily-text"),
        dailyBtn: document.getElementById("points-daily-btn"),

        mineList: document.getElementById("points-mine"),
        mineEmpty: document.getElementById("points-mine-empty"),

        orders: document.getElementById("points-orders"),
        ordersEmpty: document.getElementById("points-orders-empty"),

        logs: document.getElementById("points-logs"),
        logsEmpty: document.getElementById("points-logs-empty"),
        logsMore: document.getElementById("points-logs-more"),

        publishBtn: document.getElementById("points-publish-btn"),

        publish: {
            overlay: document.getElementById("publish-overlay"),
            title: document.getElementById("publish-title"),
            desc: document.getElementById("publish-desc"),
            price: document.getElementById("publish-price"),
            stock: document.getElementById("publish-stock"),
            delivery: document.getElementById("publish-delivery"),
            wait: document.getElementById("publish-wait"),
            imageBtn: document.getElementById("publish-image-btn"),
            imageFile: document.getElementById("publish-image-file"),
            preview: document.getElementById("publish-preview"),
            ok: document.getElementById("publish-ok"),
            cancel: document.getElementById("publish-cancel"),
            close: document.getElementById("publish-close"),
            status: document.getElementById("publish-status")
        }
    };

    let logsPage = 1;
    let logsTotal = 0;
    let dailyPoints = 1;
    let coverImage = "";  // 挂兑换物时上传好的封面地址

    const ready = () => window.Cloud && window.Cloud.isReady();

    // ---------- 小工具 ----------

    function say(node, text, ok) {
        node.textContent = text || "";
        node.style.color = ok ? "#2e9e5b" : "#d24b4b";
    }

    function clearSay(node) {
        node.textContent = "";
        node.style.color = "";
    }

    function openOverlay(overlay) {
        overlay.classList.add("open");
    }

    function closeOverlay(overlay) {
        overlay.classList.remove("open");
    }

    // 一行：左边名称 + 备注/时间，右边可选的徽标或数额
    function row(name, note, extra) {
        const box = document.createElement("div");
        box.className = "points-row";

        const main = document.createElement("div");
        main.className = "points-row-main";

        const title = document.createElement("span");
        title.className = "points-row-name";
        title.textContent = name;
        main.appendChild(title);

        if (note) {
            const sub = document.createElement("span");
            sub.className = "points-row-note";
            sub.textContent = note;
            main.appendChild(sub);
        }
        box.appendChild(main);

        if (extra) {
            box.appendChild(extra);
        }
        return box;
    }

    function tag(className, text) {
        const node = document.createElement("span");
        node.className = className;
        node.textContent = text;
        return node;
    }

    // 积分流水的右侧：数额在上、时间在下
    function amountCell(amount, createdAt) {
        const box = document.createElement("div");
        box.className = "points-row-side";
        box.appendChild(tag("points-amount " + (amount > 0 ? "plus" : "minus"),
            (amount > 0 ? "+" : "") + amount));
        box.appendChild(tag("points-time", String(createdAt || "").slice(0, 16)));
        return box;
    }

    // ---------- 余额 + 明细（后端一个接口给两组数据） ----------

    async function loadLogs(reset) {
        if (!ready()) {
            el.dailyText.textContent = "登录后才能看积分（余额由后端按账号存）";
            el.dailyBtn.disabled = true;
            return;
        }

        const page = reset ? 1 : logsPage + 1;
        let data;
        try {
            data = await window.Cloud.points(page, LOG_SIZE);
        } catch (e) {
            el.dailyText.textContent = "读积分失败：" + e.message;
            return;
        }

        logsPage = page;
        logsTotal = data.total;
        dailyPoints = data.daily_points;

        el.balance.textContent = data.balance;

        if (data.today_signed) {
            el.dailyText.textContent = "今天的 " + dailyPoints + " 分已经领过啦，明天再来～";
            el.dailyBtn.textContent = "今日已领";
            el.dailyBtn.disabled = true;
        } else {
            el.dailyText.textContent = "每天登录小窝自动 +" + dailyPoints + " 分，点右边按钮领今天的";
            el.dailyBtn.textContent = "领取今日积分";
            el.dailyBtn.disabled = false;
        }

        if (reset) {
            el.logs.textContent = "";
        }
        for (const log of data.logs) {
            el.logs.appendChild(row(log.reason_name, log.remark || "", amountCell(log.amount, log.created_at)));
        }

        el.logsEmpty.hidden = data.total > 0;
        el.logsMore.hidden = logsPage * LOG_SIZE >= logsTotal;
    }

    // ---------- 每日签到 ----------

    async function dailyLogin() {
        el.dailyBtn.disabled = true;
        try {
            const data = await window.Cloud.dailyLogin();
            if (!data.awarded) {
                el.dailyText.textContent = "今天的 " + dailyPoints + " 分已经领过啦，明天再来～";
            }
            await loadLogs(true);
        } catch (e) {
            el.dailyText.textContent = "领取失败：" + e.message;
            el.dailyBtn.disabled = false;
        }
    }

    // 我挂出来的兑换物（含待审核 / 已下架）
    async function loadMine() {
        if (!ready()) {
            return;
        }
        let data;
        try {
            data = await window.Cloud.myItems();
        } catch (e) {
            return;
        }

        const names = { on: "已上架", off: "已下架", pending: "待站长审核" };
        el.mineList.textContent = "";
        for (const item of data.items) {
            el.mineList.appendChild(row(
                item.title,
                item.price_points + " 分 · " + (item.stock < 0 ? "不限量" : "剩 " + item.stock + " 份")
                    + " · " + (item.delivery === "auto" ? "虚拟自动发放" : "实物需发放"),
                tag("points-state " + item.status, names[item.status] || item.status)
            ));
        }
        el.mineEmpty.hidden = data.items.length > 0;
    }

    // ---------- 我的兑换单 ----------

    async function loadOrders() {
        if (!ready()) {
            return;
        }
        let data;
        try {
            data = await window.Cloud.myRedemptions(1, 20);
        } catch (e) {
            return;
        }

        el.orders.textContent = "";
        for (const order of data.redemptions) {
            const box = document.createElement("div");
            box.className = "points-row";

            const auto = order.status === "done" && order.delivery === "auto";
            let note = "-" + order.amount + " 分 · " + String(order.created_at).slice(0, 16);
            if (order.status === "pending" && order.wait_days > 0) {
                note += " · 预计 " + order.wait_days + " 天内发放";
            }

            const main = document.createElement("div");
            main.className = "points-row-main";
            main.appendChild(tag("points-row-name", order.item_title));
            main.appendChild(tag("points-row-note", note));
            box.appendChild(main);

            const side = document.createElement("div");
            side.className = "points-row-side";
            side.appendChild(tag("points-state " + order.status,
                auto ? "已自动发放" : order.status_name));
            // 虚拟物品到账了就直接给下载入口，不用回插画页找
            if (auto && order.item_image) {
                const dl = document.createElement("a");
                dl.className = "order-download";
                dl.href = window.Cloud.assetUrl(order.item_image);
                dl.setAttribute("download", order.item_title || "兑换物");
                dl.textContent = "下载";
                side.appendChild(dl);
            }
            box.appendChild(side);

            el.orders.appendChild(box);
        }
        el.ordersEmpty.hidden = data.redemptions.length > 0;
    }

    // ---------- 挂兑换物弹窗 ----------

    function openPublish() {
        el.publish.title.value = "";
        el.publish.desc.value = "";
        el.publish.price.value = "";
        el.publish.stock.value = "";
        el.publish.wait.value = "";
        for (const box of el.publish.delivery.querySelectorAll("input")) {
            box.checked = box.value === "manual";
        }
        coverImage = "";
        el.publish.preview.textContent = "";
        el.publish.preview.style.backgroundImage = "";
        clearSay(el.publish.status);
        openOverlay(el.publish.overlay);
    }

    async function pickCover() {
        const file = el.publish.imageFile.files && el.publish.imageFile.files[0];
        if (!file) {
            return;
        }
        say(el.publish.status, "正在上传封面…", true);
        try {
            const data = await window.Cloud.uploadImage(file);
            coverImage = data.url;
            el.publish.preview.textContent = "";
            el.publish.preview.style.backgroundImage = "url(\"" + window.Cloud.assetUrl(coverImage) + "\")";
            clearSay(el.publish.status);
        } catch (e) {
            say(el.publish.status, "封面上传失败：" + e.message, false);
        }
        el.publish.imageFile.value = "";
    }

    async function doPublish() {
        const title = el.publish.title.value.trim();
        if (!title) {
            say(el.publish.status, "名称要填一下", false);
            return;
        }
        const price = parseInt(el.publish.price.value, 10);
        if (!price || price < 1) {
            say(el.publish.status, "所需积分至少填 1", false);
            return;
        }
        const stockRaw = el.publish.stock.value.trim();
        const stock = stockRaw === "" ? -1 : parseInt(stockRaw, 10);
        if (stockRaw !== "" && !(stock >= 1)) {
            say(el.publish.status, "份数要么空着（不限量），要么填 1 以上的数字", false);
            return;
        }
        const checked = el.publish.delivery.querySelector("input:checked");
        const delivery = checked ? checked.value : "manual";
        const waitRaw = el.publish.wait.value.trim();
        const waitDays = delivery === "auto" || waitRaw === "" ? 0 : parseInt(waitRaw, 10);
        if (delivery === "manual" && waitRaw !== "" && !(waitDays >= 0 && waitDays <= 365)) {
            say(el.publish.status, "预计发货天数填 0 ~ 365 之间的整数", false);
            return;
        }

        el.publish.ok.disabled = true;
        say(el.publish.status, "正在提交…", true);
        try {
            const item = await window.Cloud.publishItem({
                title: title,
                description: el.publish.desc.value.trim(),
                image: coverImage,
                price_points: price,
                stock: stock,
                delivery: delivery,
                wait_days: waitDays
            });
            await loadMine();
            say(el.publish.status,
                "已提交「" + item.title + "」，当前状态：" +
                (item.status === "pending" ? "待站长审核，通过后自动上架" : "已上架") +
                "。可以在下面的「我挂出来的兑换物」里看到。", true);
        } catch (e) {
            say(el.publish.status, e.message, false);
        }
        el.publish.ok.disabled = false;
    }

    // ---------- 汇总刷新 ----------

    async function refresh() {
        await Promise.all([loadLogs(true), loadMine(), loadOrders()]);
    }

    // ---------- 事件绑定 ----------

    el.dailyBtn.addEventListener("click", dailyLogin);
    el.logsMore.addEventListener("click", () => loadLogs(false));
    el.publishBtn.addEventListener("click", openPublish);
    el.publish.ok.addEventListener("click", doPublish);

    el.publish.cancel.addEventListener("click", () => closeOverlay(el.publish.overlay));
    el.publish.close.addEventListener("click", () => closeOverlay(el.publish.overlay));
    // 点遮罩空白处也能关
    el.publish.overlay.addEventListener("click", (event) => {
        if (event.target === el.publish.overlay) {
            closeOverlay(el.publish.overlay);
        }
    });
    el.publish.imageBtn.addEventListener("click", () => el.publish.imageFile.click());
    el.publish.imageFile.addEventListener("change", pickCover);

    // 带 #points 直接打开时，settings.js 的钩子在本文件加载前就跑过了，这里自己刷一次
    if ((location.hash || "") === "#points") {
        refresh();
    }

    return { refresh: refresh };
})();
