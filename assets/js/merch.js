// ================================
// 周边页（zhoubian.html）
// 站内唯一的兑换物浏览页：按类型筛选（全部 / 插画 / 周边 / 成员出品），点「用积分兑换」就地弹确认框下单
//
// 依赖：store.js、api-config.js、auth.js、cloud.js
// ================================

window.Merch = (function () {

    const PAGE_SIZE = 12;

    const el = {
        count: document.getElementById("merch-count"),
        chips: document.getElementById("merch-chips"),
        list: document.getElementById("merch-list"),
        empty: document.getElementById("merch-empty"),
        more: document.getElementById("merch-more-btn"),
        status: document.getElementById("merch-status"),

        redeem: {
            overlay: document.getElementById("redeem-overlay"),
            text: document.getElementById("redeem-text"),
            contact: document.getElementById("redeem-contact"),
            ok: document.getElementById("redeem-ok"),
            cancel: document.getElementById("redeem-cancel"),
            close: document.getElementById("redeem-close"),
            status: document.getElementById("redeem-status")
        }
    };

    let kind = "";        // 当前筛选类别（"" = 全部）
    let page = 1;
    let total = 0;
    let balance = null;   // 我的积分，弹确认框时才拉
    let buying = null;    // 确认框里正在下单的兑换物

    // 别的页面（插画页大图）带过来的 ?redeem=物品id：列表加载完直接帮他把确认框打开
    let pending = parseInt(new URLSearchParams(location.search).get("redeem"), 10) || 0;

    const byId = new Map();   // 已经见过的兑换物，深链找它时用

    const ready = () => window.Cloud && window.Cloud.isReady();

    // ---------- 小工具 ----------

    function say(text, color) {
        el.status.textContent = text || "";
        el.status.style.color = color || "";
    }

    function node(tag, className, text) {
        const box = document.createElement(tag);
        if (className) {
            box.className = className;
        }
        if (text !== undefined) {
            box.textContent = text;
        }
        return box;
    }

    // ---------- 卡片 ----------

    function card(item) {
        const box = node("div", "merch-card");

        const cover = node("div", "merch-cover");
        if (item.image) {
            cover.style.backgroundImage = "url(\"" + window.Cloud.assetUrl(item.image) + "\")";
        } else {
            cover.textContent = item.kind === "merch" ? "🎁" : "🖼️";
        }
        box.appendChild(cover);

        const info = node("div", "merch-info");
        info.appendChild(node("p", "merch-title", item.title));

        if (item.description) {
            info.appendChild(node("p", "merch-desc", item.description));
        }

        info.appendChild(node("p", "merch-from", item.official
            ? "官方出品"
            : "成员 " + (item.creator_nickname || "小窝成员") + " 出品"));

        const meta = node("div", "merch-meta");
        meta.appendChild(node("span", "merch-price", item.price_points + " 积分"));
        meta.appendChild(node("span", "merch-stock", item.stock < 0 ? "不限量" : "剩 " + item.stock + " 份"));
        info.appendChild(meta);

        const soldOut = item.stock === 0;
        const buy = node("button", "merch-buy" + (soldOut ? " sold" : ""), soldOut ? "已兑完" : "用积分兑换");
        buy.type = "button";
        buy.disabled = soldOut;
        buy.addEventListener("click", () => {
            openRedeem(item);
        });
        info.appendChild(buy);

        box.appendChild(info);
        return box;
    }

    const EMPTY_TEXT = "这里还没有上架的兑换物，等站长或成员挂出来～";

    // 空状态：换掉那句话再显示（游客、真的没货、加载失败都走这里）
    function showEmpty(text) {
        el.empty.querySelector("p").textContent = text;
        el.empty.hidden = false;
    }

    // ---------- 列表 ----------

    function remember(items) {
        for (const item of items) {
            byId.set(item.id, item);
        }
    }

    async function load(reset) {
        if (!ready()) {
            el.list.textContent = "";
            el.count.textContent = "";
            el.more.hidden = true;
            showEmpty("登录后就能看有哪些兑换物可以兑换啦～");
            say("", "");
            return;
        }

        const next = reset ? 1 : page + 1;
        let data;
        try {
            data = await window.Cloud.shopItems(kind, next, PAGE_SIZE);
        } catch (e) {
            showEmpty("兑换物没加载出来，稍后再试试～");
            say(e.message, "#d24b4b");
            return;
        }

        page = next;
        total = data.total;
        remember(data.items);

        if (reset) {
            el.list.textContent = "";
        }
        for (const item of data.items) {
            el.list.appendChild(card(item));
        }

        el.count.textContent = total > 0 ? "共 " + total + " 件可兑换" : "";
        el.empty.hidden = total > 0;
        if (!total) {
            showEmpty(EMPTY_TEXT);
        }
        el.more.hidden = page * PAGE_SIZE >= total;
        say("", "");

        if (reset) {
            openPending();
        }
    }

    // 带 ?redeem=id 过来：翻遍已经拿到的列表找不到，再整页捞一次，然后替他弹确认框
    async function openPending() {
        if (!pending) {
            return;
        }
        const id = pending;
        pending = 0;
        // 参数只用一次，立刻抹掉，免得翻页或刷新又弹一遍
        const query = new URLSearchParams(location.search);
        query.delete("redeem");
        const tail = query.toString();
        history.replaceState(null, "", location.pathname + (tail ? "?" + tail : "") + location.hash);

        let item = byId.get(id);
        if (!item) {
            try {
                const data = await window.Cloud.shopItems("", 1, 50);
                remember(data.items);
                item = byId.get(id);
            } catch (e) {
                item = null;
            }
        }
        if (!item || item.stock === 0) {
            say("那件兑换物已经下架或兑完啦，在列表里看看别的～", "#d24b4b");
            return;
        }
        openRedeem(item);
    }

    // ---------- 余额 + 兑换确认 ----------

    async function loadBalance() {
        if (balance !== null) {
            return;
        }
        try {
            const data = await window.Cloud.points(1, 1);
            balance = data.balance;
        } catch (e) {
            balance = 0;
        }
    }

    async function openRedeem(item) {
        buying = item;
        await loadBalance();
        const enough = balance >= item.price_points;
        el.redeem.text.textContent = enough
            ? "「" + item.title + "」需要 " + item.price_points + " 分，你现在有 " + balance + " 分。"
            : "「" + item.title + "」需要 " + item.price_points + " 分，你现在只有 " + balance + " 分，还差 "
                + (item.price_points - balance) + " 分。";
        el.redeem.ok.disabled = !enough;
        el.redeem.contact.value = "";
        el.redeem.status.textContent = "";
        el.redeem.status.style.color = "";
        el.redeem.overlay.classList.add("open");
    }

    function closeRedeem() {
        el.redeem.overlay.classList.remove("open");
        buying = null;
    }

    async function doRedeem() {
        if (!buying) {
            return;
        }
        el.redeem.ok.disabled = true;
        el.redeem.status.textContent = "正在下单…";
        el.redeem.status.style.color = "#2e9e5b";
        try {
            const data = await window.Cloud.redeem(buying.id, el.redeem.contact.value.trim());
            buying = null;
            balance = data.balance;
            await load(true);
            // 弹窗留着说结果，避免「点了没反应」；确认按钮保持禁用，防止重复下单
            el.redeem.status.textContent =
                "兑换单 #" + data.id + " 已生成（待发放），扣了 " + data.amount + " 分，余额 " + data.balance + " 分。" +
                "站长发放后会按你留的联系方式联系你～";
            el.redeem.status.style.color = "#2e9e5b";
        } catch (e) {
            el.redeem.status.textContent = e.message;
            el.redeem.status.style.color = "#d24b4b";
            el.redeem.ok.disabled = false;
        }
    }

    // ---------- 事件绑定 ----------

    el.chips.addEventListener("click", (event) => {
        const chip = event.target.closest(".merch-chip");
        if (!chip) {
            return;
        }
        for (const box of el.chips.children) {
            box.classList.toggle("active", box === chip);
        }
        kind = chip.dataset.kind || "";
        load(true);
    });

    el.more.addEventListener("click", () => load(false));
    el.redeem.ok.addEventListener("click", doRedeem);
    el.redeem.cancel.addEventListener("click", closeRedeem);
    el.redeem.close.addEventListener("click", closeRedeem);
    // 点遮罩空白处也能关
    el.redeem.overlay.addEventListener("click", (event) => {
        if (event.target === el.redeem.overlay) {
            closeRedeem();
        }
    });

    window.Auth.onChange(() => {
        balance = null;
        byId.clear();
        load(true);
    });

    load(true);

    return { load: load };
})();
