// ================================
// 周边页（zhoubian.html）
// 列出积分商城里 kind=merch 的官方周边，点「用积分兑换」跳到个人中心的积分页并自动打开确认框
//
// 依赖：store.js、api-config.js、auth.js、cloud.js
// ================================

window.Merch = (function () {

    const el = {
        count: document.getElementById("merch-count"),
        list: document.getElementById("merch-list"),
        empty: document.getElementById("merch-empty"),
        status: document.getElementById("merch-status")
    };

    const ready = () => window.Cloud && window.Cloud.isReady();

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

    function card(item) {
        const box = node("div", "merch-card");

        const cover = node("div", "merch-cover");
        if (item.image) {
            cover.style.backgroundImage = "url(\"" + window.Cloud.assetUrl(item.image) + "\")";
        } else {
            cover.textContent = "🎁";
        }
        box.appendChild(cover);

        const info = node("div", "merch-info");
        info.appendChild(node("p", "merch-title", item.title));

        if (item.description) {
            info.appendChild(node("p", "merch-desc", item.description));
        }

        const meta = node("div", "merch-meta");
        meta.appendChild(node("span", "merch-price", item.price_points + " 积分"));
        meta.appendChild(node("span", "merch-stock", item.stock < 0 ? "不限量" : "剩 " + item.stock + " 份"));
        info.appendChild(meta);

        // 兑换统一在个人中心的积分页完成：这里带上物品 id，过去直接弹确认框
        const soldOut = item.stock === 0;
        const buy = node("a", "merch-buy" + (soldOut ? " sold" : ""), soldOut ? "已兑完" : "用积分兑换");
        if (!soldOut) {
            buy.href = "user.html?redeem=" + item.id + "#points";
        } else {
            buy.href = "user.html#points";
        }
        info.appendChild(buy);

        box.appendChild(info);
        return box;
    }

    async function load() {
        if (!ready()) {
            el.list.textContent = "";
            el.count.textContent = "";
            el.empty.hidden = false;
            say("登录后就能看有哪些周边可以兑换啦～", "");
            return;
        }

        try {
            const data = await window.Cloud.shopItems("merch", 1, 50);
            el.list.textContent = "";
            for (const item of data.items) {
                el.list.appendChild(card(item));
            }
            el.count.textContent = data.items.length > 0 ? "共 " + data.items.length + " 款周边" : "";
            el.empty.hidden = data.items.length > 0;
            say("", "");
        } catch (e) {
            el.empty.hidden = false;
            say("周边没加载出来：" + e.message, "#e08b8b");
        }
    }

    window.Auth.onChange(load);

    load();

    return { load: load };
})();
