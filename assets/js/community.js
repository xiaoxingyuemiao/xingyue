// ================================
// 社区动态页（dongtai.html）
// 看别人的动态 / 发自己的动态（文字 + 最多 9 张图）/ 点赞 / 删自己的动态
//
// 数据都走 window.Cloud：
//   GET    /posts            时间线（分页）
//   POST   /posts            发动态
//   POST   /posts/:id/like   点赞 / 取消赞
//   DELETE /posts/:id        删自己的动态
//   POST   /upload/image     配图先上传，拿到 URL 再发
// ================================

window.Community = (function () {

    const PAGE_SIZE = 10;
    const MAX_IMAGES = 9;
    const MAX_LEN = 1000;

    const el = {
        list: document.getElementById("post-list"),

        empty: document.getElementById("post-empty"),
        more: document.getElementById("post-more"),

        avatar: document.getElementById("publish-avatar"),
        input: document.getElementById("post-input"),
        images: document.getElementById("post-images"),
        imageBtn: document.getElementById("post-image-btn"),
        imageFile: document.getElementById("post-image-file"),
        tip: document.getElementById("post-count-tip"),
        submit: document.getElementById("post-submit"),
        status: document.getElementById("post-status"),

        viewer: document.getElementById("viewer"),
        viewerMask: document.getElementById("viewer-mask"),
        viewerImg: document.getElementById("viewer-img"),
        viewerClose: document.getElementById("viewer-close"),
        viewerIndex: document.getElementById("viewer-index"),
        viewerPrev: document.getElementById("viewer-prev"),
        viewerNext: document.getElementById("viewer-next")
    };

    let page = 1;
    let posts = [];
    let loading = false;

    // 待发布的配图：{ url: 上传后的地址, uploading: 是否还在传 }
    let picked = [];

    const ready = () => window.Cloud && window.Cloud.isReady();

    // ---------- 小工具 ----------

    function say(text, color) {
        el.status.textContent = text || "";
        el.status.style.color = color || "#8a9099";
    }

    // 「2026-11-21 11:24:43」→ 刚刚 / 5 分钟前 / 3 小时前 / 昨天 11:24 / 11-20
    function timeAgo(text) {
        const time = new Date(String(text).replace(" ", "T"));
        if (isNaN(time.getTime())) {
            return String(text).slice(0, 16);
        }
        const diff = Date.now() - time.getTime();
        if (diff < 60000) {
            return "刚刚";
        }
        if (diff < 3600000) {
            return Math.floor(diff / 60000) + " 分钟前";
        }
        if (diff < 86400000) {
            return Math.floor(diff / 3600000) + " 小时前";
        }
        if (diff < 172800000) {
            return "昨天 " + String(time.getHours()).padStart(2, "0") + ":" + String(time.getMinutes()).padStart(2, "0");
        }
        const now = new Date();
        const md = String(time.getMonth() + 1).padStart(2, "0") + "-" + String(time.getDate()).padStart(2, "0");
        return (time.getFullYear() === now.getFullYear() ? "" : time.getFullYear() + "-") + md;
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

    // 头像：图片走背景图，emoji / 文字直接显示（和首页同一套归一化）
    function paintAvatar(box, avatar, nickname) {
        const value = window.Store.resolveAvatar(avatar);
        if (window.Store.isAvatarImage(value)) {
            box.textContent = "";
            box.style.backgroundImage = "url(\"" + window.Cloud.assetUrl(value) + "\")";
            return;
        }
        box.style.backgroundImage = "";
        box.textContent = value || (nickname || "窝").slice(0, 1);
    }

    // ---------- 时间线 ----------

    async function loadPosts(reset) {
        if (!ready()) {
            renderGuestState();
            return;
        }
        if (loading) {
            return;
        }
        loading = true;
        const target = reset ? 1 : page + 1;
        try {
            const data = await window.Cloud.posts(target, PAGE_SIZE);
            page = data.page;

            if (reset) {
                posts = [];
                el.list.textContent = "";
            }
            for (const post of data.posts) {
                posts.push(post);
                el.list.appendChild(postCard(post));
            }

            el.empty.hidden = posts.length > 0;
            if (!posts.length) {
                el.empty.textContent = "社区还空着，发第一条动态吧～";
            }
            el.more.hidden = !data.has_more;
        } catch (e) {
            say("动态没加载出来：" + e.message, "#d24b4b");
        }
        loading = false;
    }

    // 游客：动态接口要登录才给看，这里给一句说明 + 去登录的按钮
    function renderGuestState() {
        posts = [];
        el.list.textContent = "";
        el.more.hidden = true;

        el.empty.hidden = false;
        el.empty.textContent = "登录后就能看小窝成员发的动态，也能点赞和发布～";
        const link = node("a", "empty-btn", "去登录");
        link.href = "login.html";
        el.empty.appendChild(link);
    }

    function postCard(post) {
        const card = node("article", "post-card");

        const avatar = node("div", "post-avatar");
        paintAvatar(avatar, post.author && post.author.avatar, post.author && post.author.nickname);
        card.appendChild(avatar);

        const body = node("div", "post-body");

        const head = node("div", "post-head");
        head.appendChild(node("span", "post-author", (post.author && post.author.nickname) || "小窝成员"));
        if (post.author && post.author.uid) {
            head.appendChild(node("span", "post-uid", "UID " + post.author.uid));
        }
        head.appendChild(node("span", "post-time", timeAgo(post.created_at)));
        body.appendChild(head);

        if (post.content) {
            body.appendChild(node("p", "post-text", post.content));
        }

        const urls = post.images || [];
        if (urls.length) {
            const grid = node("div", "post-imgs " + gridClass(urls.length));
            urls.forEach((url, index) => {
                const cell = node("div", "post-img");
                cell.style.backgroundImage = "url(\"" + window.Cloud.assetUrl(url) + "\")";
                cell.addEventListener("click", () => openViewer(urls, index));
                grid.appendChild(cell);
            });
            body.appendChild(grid);
        }

        const bar = node("div", "post-bar");

        const like = node("button", "post-action" + (post.liked ? " active" : ""));
        like.type = "button";
        like.textContent = "❤ " + (post.like_count || 0);
        like.addEventListener("click", () => toggleLike(post, like));
        bar.appendChild(like);

        if (post.is_mine) {
            const del = node("button", "post-action danger");
            del.type = "button";
            del.textContent = "删除";
            del.addEventListener("click", () => removePost(post, card, del));
            bar.appendChild(del);
        }

        body.appendChild(bar);
        card.appendChild(body);
        return card;
    }

    // 一张铺满、四张两列、其余三列（和 B 站的九宫格一致）
    function gridClass(n) {
        if (n === 1) {
            return "one";
        }
        if (n === 4) {
            return "two";
        }
        return "three";
    }

    // ---------- 点赞 / 删除 ----------

    async function toggleLike(post, button) {
        if (!ready()) {
            say("登录后才能点赞哦～", "#d24b4b");
            return;
        }
        button.disabled = true;
        try {
            const data = await window.Cloud.likePost(post.id);
            post.liked = data.liked;
            post.like_count = data.like_count;
            button.textContent = "❤ " + data.like_count;
            button.classList.toggle("active", data.liked);
        } catch (e) {
            say("点赞失败：" + e.message, "#d24b4b");
        }
        button.disabled = false;
    }

    // 删除要按两下：第一下变成「确认删除？」，四秒不点就恢复
    function removePost(post, card, button) {
        if (button.dataset.confirm !== "1") {
            button.dataset.confirm = "1";
            button.textContent = "确认删除？";
            setTimeout(() => {
                button.dataset.confirm = "";
                button.textContent = "删除";
            }, 4000);
            return;
        }
        button.disabled = true;
        window.Cloud.deletePost(post.id).then(() => {
            card.remove();
            posts = posts.filter((x) => x.id !== post.id);
            el.empty.hidden = posts.length > 0;
        }).catch((e) => {
            say("删除失败：" + e.message, "#d24b4b");
            button.disabled = false;
            button.dataset.confirm = "";
            button.textContent = "删除";
        });
    }

    // ---------- 发动态 ----------

    function renderPicked() {
        el.images.textContent = "";
        picked.forEach((item, index) => {
            const cell = node("div", "pick-cell" + (item.uploading ? " loading" : ""));
            if (!item.uploading) {
                cell.style.backgroundImage = "url(\"" + window.Cloud.assetUrl(item.url) + "\")";
            }
            const x = node("button", "pick-remove", "✕");
            x.type = "button";
            x.addEventListener("click", () => {
                picked.splice(index, 1);
                renderPicked();
            });
            cell.appendChild(x);
            el.images.appendChild(cell);
        });
    }

    async function uploadFiles(files) {
        for (const file of files) {
            if (picked.length >= MAX_IMAGES) {
                say("最多配 " + MAX_IMAGES + " 张图，已经帮你留着前面的了", "#e07b20");
                return;
            }
            const slot = { url: "", uploading: true };
            picked.push(slot);
            renderPicked();

            try {
                const data = await window.Cloud.uploadImage(file);
                slot.url = data.url;
            } catch (e) {
                say("第 " + (picked.length) + " 张没传上去：" + e.message, "#d24b4b");
                picked = picked.filter((x) => x !== slot);
            }
            slot.uploading = false;
            renderPicked();
        }
    }

    async function publish() {
        if (!ready()) {
            say("登录后才能发动态哦～", "#d24b4b");
            setTimeout(() => { window.location.href = "login.html"; }, 800);
            return;
        }
        const content = el.input.value.trim();
        if (!content && !picked.length) {
            say("说点什么再发吧，文字和图片不能都空着", "#d24b4b");
            return;
        }
        if (picked.some((x) => x.uploading)) {
            say("图片还在上传，稍等一下下～", "#e07b20");
            return;
        }

        el.submit.disabled = true;
        say("正在发布…", "#2e9e5b");
        try {
            const post = await window.Cloud.createPost(content, picked.map((x) => x.url));
            el.input.value = "";
            picked = [];
            renderPicked();
            updateTip();
            say("", "");

            posts.unshift(post);
            el.list.insertBefore(postCard(post), el.list.firstChild);
            el.empty.hidden = true;
            say("发出去啦～", "#2e9e5b");
            setTimeout(() => say("", ""), 2500);
        } catch (e) {
            say("发布失败：" + e.message, "#d24b4b");
        }
        el.submit.disabled = false;
    }

    function updateTip() {
        el.tip.textContent = el.input.value.length + " / " + MAX_LEN;
    }

    // 发布卡上的头像跟着当前登录账号走
    // 只看 Auth.current()：本机的资料缓存（KEYS.user）可能还没同步过，不能拿它判断登录态
    function renderSelf() {
        const user = window.Auth.current();
        if (!user) {
            el.avatar.style.backgroundImage = "";
            el.avatar.textContent = "🌙";
            el.input.placeholder = "登录后就能发动态啦～";
            return;
        }

        const local = window.Store.readJSON(window.Store.KEYS.user, null) || {};
        paintAvatar(el.avatar, local.avatar, local.nickname || window.Auth.defaultDisplayName());
        el.input.placeholder = "分享你的插画、周边或者今天的心情～";
    }

    // ---------- 大图查看 ----------

    let viewerUrls = [];
    let viewerIndex = 0;

    function openViewer(urls, index) {
        viewerUrls = urls;
        viewerIndex = index;
        paintViewer();
        el.viewer.classList.add("open");
        document.body.classList.add("no-scroll");
    }

    function paintViewer() {
        el.viewerImg.src = window.Cloud.assetUrl(viewerUrls[viewerIndex]);
        el.viewerIndex.textContent = (viewerIndex + 1) + " / " + viewerUrls.length;
        el.viewerPrev.hidden = viewerUrls.length < 2;
        el.viewerNext.hidden = viewerUrls.length < 2;
    }

    function closeViewer() {
        el.viewer.classList.remove("open");
        document.body.classList.remove("no-scroll");
    }

    function stepViewer(delta) {
        const n = viewerUrls.length;
        if (n < 2) {
            return;
        }
        viewerIndex = (viewerIndex + delta + n) % n;
        paintViewer();
    }

    // ---------- 事件绑定 ----------

    el.more.addEventListener("click", () => loadPosts(false));

    el.input.addEventListener("input", updateTip);
    el.submit.addEventListener("click", publish);

    el.imageBtn.addEventListener("click", () => {
        if (!ready()) {
            say("登录后才能发动态哦～", "#d24b4b");
            return;
        }
        if (picked.length >= MAX_IMAGES) {
            say("最多配 " + MAX_IMAGES + " 张图～", "#e07b20");
            return;
        }
        el.imageFile.click();
    });

    el.imageFile.addEventListener("change", () => {
        const files = [...el.imageFile.files].slice(0, MAX_IMAGES - picked.length);
        el.imageFile.value = "";
        if (files.length) {
            uploadFiles(files);
        }
    });

    el.viewerClose.addEventListener("click", closeViewer);
    el.viewerMask.addEventListener("click", closeViewer);
    el.viewerPrev.addEventListener("click", () => stepViewer(-1));
    el.viewerNext.addEventListener("click", () => stepViewer(1));

    document.addEventListener("keydown", (event) => {
        if (!el.viewer.classList.contains("open")) {
            return;
        }
        if (event.key === "Escape") {
            closeViewer();
        } else if (event.key === "ArrowLeft") {
            stepViewer(-1);
        } else if (event.key === "ArrowRight") {
            stepViewer(1);
        }
    });

    // Ctrl+Enter 快速发布
    el.input.addEventListener("keydown", (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
            publish();
        }
    });

    // 登录状态变了（换账号 / 退出）：换头像，并把时间线重新拉一遍
    window.Auth.onChange(() => {
        renderSelf();
        loadPosts(true);
    });

    // ---------- 起始加载 ----------

    renderSelf();
    updateTip();
    loadPosts(true);

    return { loadPosts: loadPosts };
})();
