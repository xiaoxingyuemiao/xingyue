// ================================
// 个人中心 · 积分页（user.html 的 #view-points）
// 余额 / 每日签到 / 积分用途 / 积分商城 / 我挂的兑换物 / 兑换单 / 积分明细
//
// 依赖：store.js、auth.js、cloud.js（积分只存后端，本机不落库）
// 暴露：window.Points.refresh()（settings.js 切到积分视图时调用）
// ================================

window.Points = (function () {

    const SHOP_SIZE = 12;
    const LOG_SIZE = 10;

    const el = {
        balance: document.getElementById("points-balance"),
        dailyText: document.getElementById("points-daily-text"),
        dailyBtn: document.getElementById("points-daily-btn"),

        chips: document.getElementById("points-chips"),
        shopList: document.getElementById("points-shop-list"),
        shopEmpty: document.getElementById("points-shop-empty"),
        shopMore: document.getElementById("points-shop-more"),

        mineList: document.getElementById("points-mine"),
        mineEmpty: document.getElementById("points-mine-empty"),

        orders: document.getElementById("points-orders"),
        ordersEmpty: document.getElementById("points-orders-empty"),

        logs: document.getElementById("points-logs"),
        logsEmpty: document.getElementById("points-logs-empty"),
        logsMore: document.getElementById("points-logs-more"),

        publishBtn: document.getElementById("points-publish-btn"),

        redeem: {
            overlay: document.getElementById("redeem-overlay"),
            text: document.getElementById("redeem-text"),
            contact: document.getElementById("redeem-contact"),
            ok: document.getElementById("redeem-ok"),
            cancel: document.getElementById("redeem-cancel"),
            close: document.getElementById("redeem-close"),
            status: document.getElementById("redeem-status")
        },

        publish: {
            overlay: document.getElementById("publish-overlay"),
            title: document.getElementById("publish-title"),
            desc: document.getElementById("publish-desc"),
            price: document.getElementById("publish-price"),
            stock: document.getElementById("publish-stock"),
            imageBtn: document.getElementById("publish-image-btn"),
            imageFile: document.getElementById("publish-image-file"),
            preview: document.getElementById("publish-preview"),
            ok: document.getElementById("publish-ok"),
            cancel: document.getElementById("publish-cancel"),
            close: document.getElementById("publish-close"),
            status: document.getElementById("publish-status")
        }
    };

    let kind = "";        // 商城当前筛选类别（"" = 全部）
    let shopPage = 1;
    let shopTotal = 0;
    let logsPage = 1;
    let logsTotal = 0;
    let balance = 0;
    let dailyPoints = 1;
    let buying = null;    // 兑换弹窗里正在确认的兑换物
    let coverImage = "";  // 挂兑换物时上传好的封面地址

    // 别的页面（插画页、积分商城链接）带过来的 ?redeem=物品id：商城首页加载完直接帮他把确认框打开
    let pendingRedeem = parseInt(new URLSearchParams(location.search).get("redeem"), 10) || 0;

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
        balance = data.balance;
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

    // ---------- 积分商城 ----------

    async function loadShop(reset) {
        if (!ready()) {
            el.shopEmpty.hidden = false;
            el.shopEmpty.textContent = "登录后才能逛积分商城";
            return;
        }

        const page = reset ? 1 : shopPage + 1;
        let data;
        try {
            data = await window.Cloud.shopItems(kind, page, SHOP_SIZE);
        } catch (e) {
            el.shopEmpty.hidden = false;
            el.shopEmpty.textContent = "读商城失败：" + e.message;
            return;
        }

        shopPage = page;
        shopTotal = data.total;

        if (reset) {
            el.shopList.textContent = "";
        }
        for (const item of data.items) {
            el.shopList.appendChild(shopCard(item));
        }

        el.shopEmpty.hidden = data.total > 0;
        if (data.total > 0) {
            el.shopEmpty.textContent = "还没有上架的兑换物，等站长或成员挂出来～";
        }
        el.shopMore.hidden = shopPage * SHOP_SIZE >= shopTotal;

        if (reset) {
            openPending();
        }
    }

    // 从别的页面带 ?redeem=id 过来：找到那张卡片，替他点一下「兑换」
    function openPending() {
        if (!pendingRedeem) {
            return;
        }
        const button = el.shopList.querySelector('button[data-id="' + pendingRedeem + '"]');
        pendingRedeem = 0;
        // 参数只用一次，立刻抹掉，免得翻页或刷新又弹一遍
        const query = new URLSearchParams(location.search);
        query.delete("redeem");
        const tail = query.toString();
        history.replaceState(null, "", location.pathname + (tail ? "?" + tail : "") + location.hash);
        if (button && !button.disabled) {
            button.click();
        } else {
            el.dailyText.textContent = "那件兑换物已经下架或兑完啦，在商城里看看别的～";
        }
    }

    function shopCard(item) {
        const card = document.createElement("div");
        card.className = "shop-card";

        const cover = document.createElement("div");
        cover.className = "shop-cover";
        if (item.image) {
            cover.style.backgroundImage = "url(\"" + window.Cloud.assetUrl(item.image) + "\")";
        } else {
            cover.textContent = item.kind === "merch" ? "🎁" : "🖼️";
        }
        card.appendChild(cover);

        const info = document.createElement("div");
        info.className = "shop-info";

        const title = document.createElement("p");
        title.className = "shop-title";
        title.textContent = item.title;
        info.appendChild(title);

        if (item.description) {
            const desc = document.createElement("p");
            desc.className = "shop-desc";
            desc.textContent = item.description;
            info.appendChild(desc);
        }

        info.appendChild(tag("shop-from", item.official
            ? "官方出品"
            : "成员 " + (item.creator_nickname || "小窝成员") + " 出品"));

        card.appendChild(info);

        const side = document.createElement("div");
        side.className = "shop-side";
        side.appendChild(tag("shop-price", item.price_points + " 分"));
        side.appendChild(tag("shop-stock", item.stock < 0 ? "不限量" : "剩 " + item.stock + " 份"));

        const buy = document.createElement("button");
        buy.type = "button";
        buy.className = "settings-btn settings-btn-primary";
        buy.dataset.id = item.id;
        buy.dataset.price = item.price_points;
        buy.dataset.title = item.title;
        buy.disabled = item.stock === 0;
        buy.textContent = buy.disabled ? "已兑完" : "兑换";
        side.appendChild(buy);

        card.appendChild(side);
        return card;
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
                item.price_points + " 分 · " + (item.stock < 0 ? "不限量" : "剩 " + item.stock + " 份"),
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

            const main = document.createElement("div");
            main.className = "points-row-main";
            main.appendChild(tag("points-row-name", order.item_title));
            main.appendChild(tag("points-row-note", "-" + order.amount + " 分 · " + String(order.created_at).slice(0, 16)));
            box.appendChild(main);

            const side = document.createElement("div");
            side.className = "points-row-side";
            side.appendChild(tag("points-state " + order.status, order.status_name));
            box.appendChild(side);

            el.orders.appendChild(box);
        }
        el.ordersEmpty.hidden = data.redemptions.length > 0;
    }

    // ---------- 兑换确认弹窗 ----------

    function openRedem(item) {
        buying = item;
        const enough = balance >= item.price;
        el.redeem.text.textContent = enough
            ? "「" + item.title + "」需要 " + item.price + " 分，你现在有 " + balance + " 分。"
            : "「" + item.title + "」需要 " + item.price + " 分，你现在只有 " + balance + " 分，还差 " + (item.price - balance) + " 分。";
        el.redeem.ok.disabled = !enough;
        el.redeem.contact.value = "";
        clearSay(el.redeem.status);
        openOverlay(el.redeem.overlay);
    }

    async function doRedeem() {
        if (!buying) {
            return;
        }
        el.redeem.ok.disabled = true;
        say(el.redeem.status, "正在下单…", true);
        try {
            const data = await window.Cloud.redeem(buying.id, el.redeem.contact.value.trim());
            buying = null;
            await refresh();
            // 弹窗留着说结果，避免「点了没反应」；确认按钮保持禁用，防止重复下单
            say(el.redeem.status,
                "兑换单 #" + data.id + " 已生成（待发放），扣了 " + data.amount + " 分，余额 " + data.balance + " 分。" +
                "站长发放后会按你留的联系方式联系你～", true);
        } catch (e) {
            say(el.redeem.status, e.message, false);
            el.redeem.ok.disabled = false;
        }
    }

    // ---------- 挂兑换物弹窗 ----------

    function openPublish() {
        el.publish.title.value = "";
        el.publish.desc.value = "";
        el.publish.price.value = "";
        el.publish.stock.value = "";
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

        el.publish.ok.disabled = true;
        say(el.publish.status, "正在提交…", true);
        try {
            const item = await window.Cloud.publishItem({
                title: title,
                description: el.publish.desc.value.trim(),
                image: coverImage,
                price_points: price,
                stock: stock
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
        await Promise.all([loadLogs(true), loadShop(true), loadMine(), loadOrders()]);
    }

    // ---------- 事件绑定 ----------

    el.dailyBtn.addEventListener("click", dailyLogin);
    el.logsMore.addEventListener("click", () => loadLogs(false));
    el.shopMore.addEventListener("click", () => loadShop(false));
    el.publishBtn.addEventListener("click", openPublish);

    el.chips.addEventListener("click", (event) => {
        const chip = event.target.closest(".points-chip");
        if (!chip) {
            return;
        }
        for (const node of el.chips.children) {
            node.classList.toggle("active", node === chip);
        }
        kind = chip.dataset.kind || "";
        loadShop(true);
    });

    // 兑换按钮在动态生成的卡片里，用事件委托
    el.shopList.addEventListener("click", (event) => {
        const buy = event.target.closest("button[data-id]");
        if (!buy || buy.disabled) {
            return;
        }
        openRedem({
            id: parseInt(buy.dataset.id, 10),
            title: buy.dataset.title,
            price: parseInt(buy.dataset.price, 10)
        });
    });

    for (const key of ["redeem", "publish"]) {
        const box = el[key];
        box.cancel.addEventListener("click", () => closeOverlay(box.overlay));
        box.close.addEventListener("click", () => closeOverlay(box.overlay));
        // 点遮罩空白处也能关
        box.overlay.addEventListener("click", (event) => {
            if (event.target === box.overlay) {
                closeOverlay(box.overlay);
            }
        });
    }

    el.redeem.ok.addEventListener("click", doRedeem);

    el.publish.ok.addEventListener("click", doPublish);
    el.publish.imageBtn.addEventListener("click", () => el.publish.imageFile.click());
    el.publish.imageFile.addEventListener("change", pickCover);

    // 带 #points 直接打开时，settings.js 的钩子在本文件加载前就跑过了，这里自己刷一次
    if ((location.hash || "") === "#points") {
        refresh();
    }

    return { refresh: refresh };
})();
