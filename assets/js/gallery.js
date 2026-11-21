// ================================
// 插画页（chahua.html）
// 图片来源：assets/data/artworks.js 里的 window.XY_ARTWORKS
//
// 排版：一排自动排序 —— 每张图排成同一个高度，宽度按图片真实比例算，
//       排满一行自动换行（CSS 的 flex-wrap + aspect-ratio，宽度由这里读到的尺寸决定）
// ================================

(function () {
    const list = document.getElementById("art-list");
    const empty = document.getElementById("art-empty");
    const count = document.getElementById("art-count");

    const lightbox = document.getElementById("lightbox");
    const lightboxMask = document.getElementById("lightbox-mask");
    const lightboxBox = document.querySelector(".lightbox-box");
    const bigImg = document.getElementById("lightbox-img");
    const bigTitle = document.getElementById("lightbox-title");
    const bigBy = document.getElementById("lightbox-by");
    const bigIndex = document.getElementById("lightbox-index");
    const bigDownload = document.getElementById("lightbox-download");

    const prevBtn = document.getElementById("lightbox-prev");
    const nextBtn = document.getElementById("lightbox-next");
    const closeBtn = document.getElementById("lightbox-close");
    const bigRedeem = document.getElementById("lightbox-redeem");

    // 大图里就地兑换的确认弹层
    const redeemMask = document.getElementById("redeem-mask");
    const redeemText = document.getElementById("redeem-text");
    const redeemOk = document.getElementById("redeem-ok");
    const redeemCancel = document.getElementById("redeem-cancel");
    const redeemClose = document.getElementById("redeem-close");
    const redeemStatus = document.getElementById("redeem-status");

    let buying = null;    // 弹层里正在兑换的兑换物
    let balance = null;   // 我的积分，打开确认框时才拉

    // 只留 src 在的条目：宽、高不用写，由图片自己load出来
    const ARTWORKS = (window.XY_ARTWORKS || []).filter((a) => a && a.src);

    let current = -1;

    // 在售的插画兑换物：图片路径 -> 物品，大图里命中就提示「可积分兑换」
    const shopByImage = new Map();

    // ---------- 图墙 ----------

    function addItem(art, index) {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "art-item";
        // 尺寸还没读出来时先占一个比例，图片load完立刻换成真实宽高比
        item.style.setProperty("--ar", "1");

        const caption = document.createElement("span");
        caption.className = "art-caption";
        caption.textContent = art.title || "未命名";

        const img = document.createElement("img");
        img.alt = art.title || "";
        // 不能用 lazy：图片真实尺寸是排版依据，没加载出来的图会一直占着 1:1 的宽度
        img.decoding = "async";
        img.draggable = false;
        img.src = art.src;

        img.addEventListener("load", () => {
            // 真实宽高比 = 宽 / 高，CSS 里 height 固定，宽度由这个比例算出来
            const ratio = img.naturalWidth / img.naturalHeight;
            if (ratio > 0) item.style.setProperty("--ar", String(ratio));
        });

        // 图坏了就别留空位
        img.addEventListener("error", () => {
            console.warn("插画加载失败，已从页面移除：", art.src);
            item.remove();
        });

        item.append(img, caption);
        item.addEventListener("click", () => openLightbox(index));

        list.appendChild(item);
    }

    function render() {
        ARTWORKS.forEach(addItem);

        if (!ARTWORKS.length) {
            empty.hidden = false;
        } else {
            empty.hidden = true;
        }

        updateCount();
    }

    function updateCount() {
        count.textContent = "共 " + ARTWORKS.length + " 张";
    }

    // ---------- 大图查看 ----------

    function openLightbox(index) {
        current = index;
        paint();
        lightbox.classList.add("open");
        lightbox.setAttribute("aria-hidden", "false");
        document.body.classList.add("no-scroll");
    }

    function closeLightbox() {
        lightbox.classList.remove("open");
        lightbox.setAttribute("aria-hidden", "true");
        document.body.classList.remove("no-scroll");
        current = -1;
    }

    function step(delta) {
        if (current < 0 || !ARTWORKS.length) return;
        const n = ARTWORKS.length;
        current = (current + delta + n) % n;
        paint();
    }

    function paint() {
        const art = ARTWORKS[current];
        if (!art) return;

        bigImg.src = art.src;
        bigImg.alt = art.title || "";

        bigTitle.textContent = art.title || "未命名";
        bigBy.textContent = art.by ? "绘制：" + art.by : "";
        bigIndex.textContent = current + 1 + " / " + ARTWORKS.length;

        bigDownload.href = art.src;
        // 外链图片浏览器不认 download，这时候就当普通链接打开
        if (/^https?:\/\//i.test(art.src) && !isSameOrigin(art.src)) {
            bigDownload.removeAttribute("download");
        } else {
            bigDownload.setAttribute("download", art.title || "artwork");
        }
        paintRedeem(art);
    }

    function isSameOrigin(url) {
        try {
            return new URL(url, location.href).origin === location.origin;
        } catch (e) {
            return false;
        }
    }

    // ---------- 积分兑换 ----------

    // 站内图片和兑换物封面存的路径可能一个带域名一个不带，只比路径
    function pathKey(url) {
        try {
            return new URL(url, location.href).pathname;
        } catch (e) {
            return String(url || "");
        }
    }

    async function loadShopItems() {
        if (!window.Cloud) {
            return;
        }
        try {
            // 不限类型：只要兑换物填的封面就是这张图，大图里就给入口
            // 目录接口游客也能读，所以未登录时照样知道哪张要积分
            const data = await window.Cloud.shopItems("", 1, 50);
            shopByImage.clear();
            ((data && data.items) || []).forEach((item) => {
                if (item.image) {
                    shopByImage.set(pathKey(item.image), item);
                }
            });
            if (current >= 0) paint();
        } catch (e) {
            console.warn("兑换物列表没拿到（不影响看图）：", e);
        }
    }

    function currentShopItem() {
        const art = ARTWORKS[current];
        return art ? shopByImage.get(pathKey(art.src)) || null : null;
    }

    // 要积分的图藏下载、给兑换入口；兑过之后反过来
    function paintRedeem(art) {
        if (!bigRedeem) {
            return;
        }
        const item = shopByImage.get(pathKey(art.src));
        if (!item || item.redeemed) {
            bigRedeem.hidden = true;
            bigDownload.hidden = false;
            return;
        }

        bigDownload.hidden = true;
        bigRedeem.hidden = false;
        bigRedeem.disabled = item.stock === 0;

        if (item.stock === 0) {
            bigRedeem.textContent = "这一份已经兑完了";
        } else if (!window.Auth.current()) {
            bigRedeem.textContent = "登录后可用 " + item.price_points + " 积分兑换";
        } else {
            bigRedeem.textContent = "可 " + item.price_points + " 积分兑换";
        }
    }

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
        redeemText.textContent = enough
            ? "「" + item.title + "」需要 " + item.price_points + " 分，你现在有 " + balance + " 分。"
            : "「" + item.title + "」需要 " + item.price_points + " 分，你现在只有 " + balance
                + " 分，还差 " + (item.price_points - balance) + " 分。";
        redeemOk.disabled = !enough;
        redeemOk.textContent = "确认兑换";
        redeemCancel.textContent = "再想想";
        redeemStatus.textContent = "";
        redeemStatus.style.color = "";
        redeemMask.classList.add("open");
    }

    function closeRedeem() {
        redeemMask.classList.remove("open");
        buying = null;
    }

    async function doRedeem() {
        if (!buying) {
            return;
        }
        const item = buying;
        redeemOk.disabled = true;
        redeemOk.textContent = "正在下单…";
        try {
            // 虚拟插画不用填收货信息，下单即发放
            const data = await window.Cloud.redeem(item.id, "");
            balance = data.balance;
            item.redeemed = true;
            if (item.stock > 0) {
                item.stock -= 1;
            }
            // 大图立刻换成「下载原图」，兑换按钮收起来
            paint();
            // 弹层留着说结果，避免「点了没反应」；确认按钮保持禁用，防止重复下单
            redeemOk.textContent = "已兑换";
            redeemCancel.textContent = "知道了";
            redeemStatus.textContent = "扣了 " + data.amount + " 分，余额 " + data.balance
                + " 分，这张图已经发放到你的「我的兑换单」～";
            redeemStatus.style.color = "#2e9e5b";
        } catch (e) {
            redeemOk.textContent = "确认兑换";
            redeemOk.disabled = false;
            redeemStatus.textContent = e.message;
            redeemStatus.style.color = "#d24b4b";
        }
    }

    // ---------- 交互 ----------

    prevBtn.addEventListener("click", () => step(-1));
    nextBtn.addEventListener("click", () => step(1));
    closeBtn.addEventListener("click", closeLightbox);

    // 点空白处关闭：用 click 冒泡，不要用 mousedown——拖完图松手会误关
    lightboxMask.addEventListener("click", closeLightbox);
    lightboxBox.addEventListener("click", (e) => {
        if (e.target === lightboxBox) closeLightbox();
    });

    bigRedeem.addEventListener("click", () => {
        const item = currentShopItem();
        if (!item || item.stock === 0) {
            return;
        }
        // 游客：兑换要登录，说一句就去登录页
        if (!window.Auth.current()) {
            bigRedeem.textContent = "登录后才能兑换，正在去登录…";
            setTimeout(() => { window.location.href = "login.html"; }, 800);
            return;
        }
        openRedeem(item);
    });

    redeemOk.addEventListener("click", doRedeem);
    redeemCancel.addEventListener("click", closeRedeem);
    redeemClose.addEventListener("click", closeRedeem);
    redeemMask.addEventListener("click", (e) => {
        if (e.target === redeemMask) closeRedeem();
    });

    document.addEventListener("keydown", (e) => {
        // 确认框开着时，Esc 只关确认框，左右键也别翻图
        if (redeemMask.classList.contains("open")) {
            if (e.key === "Escape") closeRedeem();
            return;
        }
        if (!lightbox.classList.contains("open")) return;
        if (e.key === "Escape") closeLightbox();
        else if (e.key === "ArrowLeft") step(-1);
        else if (e.key === "ArrowRight") step(1);
    });

    render();

    // 兑换物要按人来标 redeemed，凭证刷新（Auth.init / 登录回来）后重新拿一次
    if (window.Cloud && window.Auth) {
        window.Auth.onChange(() => {
            shopByImage.clear();
            balance = null;
            loadShopItems();
        });
        loadShopItems();
    }
})();
