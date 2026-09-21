// ================================
// 插画页：横向长画廊（assets/js/gallery.js）
//
// 做什么：
//   1. 高度按顶栏/页脚实测值算，不会和它们叠在一起
//   2. 背景撒花草树木（网格抖动分布，均匀不挤，且躲开所有画框和按钮）
//   3. 画框沿 x 轴从左到右排开（x 轴互不重合）：9:16 占一半，16:9 和 20:9 各占四分之一
//   4. 第 3 个画框固定是 9:16（手机竖屏），「进入自动预览」按钮就挂在它正上方
//   5. 整套布局是**固定**的：每次刷新完全一样（固定随机种子，想换一套改 LAYOUT_SEED）
//   6. 每个画框按从左到右编号 1、2、3……但编号只写在 data-frame 上，不显示出来
//   7. 底部是毛线球滚动条：拖动它、点轨道、滚轮、触屏滑动都能移动画廊
//
// 怎么挂画：把图片放进 images/，在下面 ARTWORKS 里加一行（写清宽高）——
// 代码按「比例最接近」自动给它找画框，比例不合的部分按画框比例居中裁剪（cover）。
// ================================

(function () {

    // ---------- 可调参数 ----------
    const FRAME_COUNT = 16; // 画框数量（能被 4 整除：一半竖屏 + 两个四分之一）
    const FRAME_HEIGHT = 250; // 画框统一高度（宽度按比例算出来）

    // 三种比例：手机竖屏占一半，另两种各占四分之一
    const RATIO_PHONE = [9, 16]; // 手机竖屏（第 3 个画框固定是这个）
    const RATIO_LANDSCAPE = [16, 9]; // 横屏
    const RATIO_WIDE = [20, 9]; // 宽横屏

    // 固定随机种子：同一个种子每次都生成同一套画廊（想整套换掉就改这个数字）
    const LAYOUT_SEED = 20260921;
    const GAP_MIN = 90; // 画框之间的随机间距（最小）
    const GAP_MAX = 320; // 画框之间的随机间距（最大）
    const EDGE = 130; // 画布左右两端留白

    const ACTION_FRAME = 3; // 「进入自动预览」按钮挂在第几个画框上方
    const ACTION_SPACE = 62; // 这个画框上方要多留的高度（够放按钮 + 间距）
    const ACTION_GAP = 14; // 按钮底边与画框顶边之间的距离
    const ACTION_TOP = 8; // 画布太矮时按钮最多贴到这么高（不跑出画布）

    const CELL_W = 175; // 背景花草的分布网格（越小越密）
    const CELL_H = 125;
    const CELL_SKIP = 0.42; // 每个格子空着的概率（越大越稀疏）
    const DECO_PAD = 34; // 花草与画框之间至少留这么远

    // ---------- 临时挂的画 ----------
    // images/ 里的图先临时挂进画廊：代码会按「比例最接近」自动给每张图找画框，
    // 不用手工指定编号。以后有正式插画了，直接改这个列表即可。
    //
    // 三个注意点：
    //   1. 写清每张图的原始宽高（w/h），代码靠它算比例 —— 图换了记得一起改；
    //   2. 每种比例的画框**有配额**（9:16 有 8 个，16:9 / 20:9 各 4 个）：
    //      配额占满后，剩下的图**不挂**，画框保持木色占位（不硬塞比例差太多的图）；
    //   3. 比例对不上的部分由 CSS 的 object-fit: cover 按画框比例居中裁掉。
    //
    // 没挂的几张是故意排除的：网站图标（wangzhanmeiye.png）、输入框角色按钮
    // （shuruokuangrewu.png）、Live2D Param 图标（live2d-param.png）是界面素材；
    // xingyao-avatar.jpg / yueci-avatar.jpg 与各自的 -bg.jpg 是同一张图（重复）。
    const ARTWORKS = [
        { src: "images/xingyao.png", w: 2067, h: 2067 }, // 星瑶立绘（正方形画布，裁成竖条）
        { src: "images/yueci.png", w: 2067, h: 2067 }, // 月瓷立绘
        { src: "images/supingbeijing.jpg", w: 690, h: 1200 }, // 手机背景（0.575 ≈ 9:16）
        { src: "images/xingyao-bg.jpg", w: 732, h: 732 }, // 星瑶背景图
        { src: "images/yueci-bg.jpg", w: 874, h: 874 }, // 月瓷背景图
        { src: "images/zhushitu.jpg", w: 1200, h: 658 }, // 首页主视图（1.82 ≈ 16:9）
    ];

    const PLANTS = ["🌿", "🍃", "🌱", "🌷", "🌻", "🌼", "🍀", "🌳", "🌲", "🪴", "🌾", "🍄", "🪷", "🌺"];

    // ---------- 元素 ----------
    const galleryEl = document.querySelector(".gallery");
    const viewport = document.querySelector("#gallery-viewport");
    const canvas = document.querySelector("#gallery-canvas");
    const decoLayer = document.querySelector("#gallery-deco");
    const frameLayer = document.querySelector("#gallery-frames");
    const yarnBar = document.querySelector("#yarn-bar");
    const yarnBall = document.querySelector("#yarn-ball");
    const frameAction = document.querySelector("#frame-action");

    if (!galleryEl || !viewport || !canvas || !decoLayer || !frameLayer || !yarnBar || !yarnBall) {
        return;
    }

    // ---------- 固定随机源 ----------
    // 以前画廊每次刷新都变（直接用 Math.random），现在换成「固定种子的伪随机」：
    // 种子不变 → 画框比例、位置、间距、花草分布每次刷新都完全一样。
    // 想换一套布局：改上面的 LAYOUT_SEED，再打开页面看一眼好不好看。
    function makeRandom(seed) {
        let s = seed >>> 0 || 1;

        return function () {
            // xorshift32：轻量、确定性的伪随机
            s ^= s << 13;
            s >>>= 0;
            s ^= s >>> 17;
            s ^= s << 5;
            s >>>= 0;
            return s / 4294967296;
        };
    }

    let random = makeRandom(LAYOUT_SEED);

    // ---------- 小工具 ----------
    function rand(min, max) {
        return min + random() * (max - min);
    }

    function randInt(min, max) {
        return Math.floor(rand(min, max + 1));
    }

    function pick(list) {
        return list[randInt(0, list.length - 1)];
    }

    // ---------- 0) 高度自适应 ----------
    // 顶栏和页脚都是 common.js 同步注入的，所以这里量得到真实高度；
    // 用实测值算画廊高度，就不会出现"画廊压住页脚"这种重叠。
    function fitHeight() {
        const header = document.querySelector("#site-header");
        const footer = document.querySelector("#site-footer");
        const used = ((header && header.offsetHeight) || 0) + ((footer && footer.offsetHeight) || 0);

        galleryEl.style.height = Math.max(360, window.innerHeight - used - 26) + "px";
    }

    // ---------- 1) 画框比例分配表 ----------
    // 数量是**精确分配**的（不靠随机碰运气）：手机竖屏一半，另两种各四分之一。
    // 排布顺序用固定随机源打乱 —— 看着自然，但每次刷新都一样。
    function buildRatioPlan() {
        const phoneCount = Math.round(FRAME_COUNT / 2);
        const landscapeCount = Math.round(FRAME_COUNT / 4);
        const wideCount = Math.max(0, FRAME_COUNT - phoneCount - landscapeCount);

        const plan = [];
        for (let i = 0; i < phoneCount; i++) {
            plan.push(RATIO_PHONE);
        }
        for (let i = 0; i < landscapeCount; i++) {
            plan.push(RATIO_LANDSCAPE);
        }
        for (let i = 0; i < wideCount; i++) {
            plan.push(RATIO_WIDE);
        }

        // Fisher-Yates 洗牌（用固定随机源 → 结果固定）
        for (let i = plan.length - 1; i > 0; i--) {
            const j = Math.floor(random() * (i + 1));
            const tmp = plan[i];
            plan[i] = plan[j];
            plan[j] = tmp;
        }

        // 第 3 个画框必须是手机竖屏：和它后面某个竖屏画框换位置（三种数量都不变）
        const idx = ACTION_FRAME - 1;
        if (idx >= 0 && idx < plan.length && plan[idx] !== RATIO_PHONE) {
            for (let i = idx + 1; i < plan.length; i++) {
                if (plan[i] === RATIO_PHONE) {
                    plan[i] = plan[idx];
                    plan[idx] = RATIO_PHONE;
                    break;
                }
            }
        }

        return plan;
    }

    // ---------- 2) 画作分配 ----------
    // 每张图按「比例最接近」归到三种画框之一，再用该比例的画框配额去分。
    // 匹配得越准的图越优先拿到画框；配额满了的图就不挂（返回结果里没有它）。
    function assignArtworks(ratioPlan) {
        // 每种比例画框的配额 + 它们的编号（从左到右）
        const pools = new Map();
        ratioPlan.forEach((ratio, i) => {
            if (!pools.has(ratio)) {
                pools.set(ratio, []);
            }
            pools.get(ratio).push(i + 1);
        });

        // 按「竖屏 → 横屏 → 宽横屏」固定顺序比较：
        // 正方形图（1:1）离 9:16 和 16:9 一样远，严格小于保证它会归到竖屏（立绘竖着裁更合适）
        const order = [RATIO_PHONE, RATIO_LANDSCAPE, RATIO_WIDE];

        const ranked = ARTWORKS.map((art) => {
            const r = art.w / art.h;
            let best = null;

            for (const ratio of order) {
                if (!pools.has(ratio)) {
                    continue; // 这次布局里没有这种比例的画框
                }
                const target = ratio[0] / ratio[1];
                const error = Math.abs(Math.log(r) - Math.log(target));
                if (!best || error < best.error) {
                    best = { ratio, error };
                }
            }

            return best ? { art, ratio: best.ratio, error: best.error } : null;
        }).filter(Boolean).sort((a, b) => a.error - b.error);

        const picked = new Map(); // 画框编号 → 图片路径

        for (const item of ranked) {
            const pool = pools.get(item.ratio);
            if (!pool || pool.length === 0) {
                continue; // 这种比例的画框已经挂满 → 这张图不挂
            }
            picked.set(pool.shift(), item.art.src);
        }

        return picked;
    }

    // ---------- 3) 画框 ----------
    function buildFrames() {
        frameLayer.textContent = "";

        const canvasHeight = canvas.clientHeight || 520;
        const marginY = 42;
        const usableY = Math.max(0, canvasHeight - FRAME_HEIGHT - marginY * 2);

        const ratioPlan = buildRatioPlan();
        const artOf = assignArtworks(ratioPlan);

        let x = EDGE;
        const frag = document.createDocumentFragment();

        for (let index = 1; index <= FRAME_COUNT; index++) {
            const ratio = ratioPlan[index - 1] || RATIO_PHONE;
            const width = Math.round((FRAME_HEIGHT * ratio[0]) / ratio[1]);

            // 第 3 个画框上方要放按钮，所以它的可选范围整体往下挪一点
            // （上限仍然是原来的最大值，底部留白不会变少）
            const extraTop = index === ACTION_FRAME ? Math.min(ACTION_SPACE, usableY) : 0;
            const y = Math.round(marginY + extraTop + rand(0, Math.max(0, usableY - extraTop)));

            const box = document.createElement("div");
            box.className = "frame";

            box.style.left = x + "px";
            box.style.top = y + "px";
            box.style.width = width + "px";
            box.style.height = FRAME_HEIGHT + "px";

            // 编号只写在 data 属性里（不显示），以后挂画靠它对应
            box.dataset.frame = String(index);
            box.dataset.ratio = ratio[0] + ":" + ratio[1];

            const art = document.createElement("div");
            art.className = "frame-art";

            const src = artOf.get(index);
            if (src) {
                const img = document.createElement("img");
                img.src = src;
                img.alt = "插画 " + index;
                art.appendChild(img);
            }

            box.appendChild(art);
            frag.appendChild(box);

            // 下一个画框从它右边接着排 —— 所以 x 轴永远不会重合
            x += width + randInt(GAP_MIN, GAP_MAX);
        }

        frameLayer.appendChild(frag);

        // 画布宽度 = 最后一个画框右边缘 + 右侧留白
        canvas.style.width = x + EDGE + "px";
    }

    // ---------- 4) 「进入自动预览」按钮 ----------
    // 按钮在 chahua.html 里写好，这里只负责把它摆到第 3 个画框的正上方：
    // 横向与画框居中对齐，纵向贴在画框顶边上面一点点。
    function placeAction() {
        if (!frameAction) {
            return;
        }

        const target = frameLayer.querySelector('[data-frame="' + ACTION_FRAME + '"]');
        if (!target) {
            // 画框数量被改到不足 3 个时，按钮没有可挂的位置，先收起来
            frameAction.style.display = "none";
            return;
        }

        frameAction.style.display = "";

        const frameLeft = parseFloat(target.style.left) || 0;
        const frameTop = parseFloat(target.style.top) || 0;

        frameAction.style.left = Math.max(0, Math.round(frameLeft + (target.offsetWidth - frameAction.offsetWidth) / 2)) + "px";

        // 画布太矮时上面放不下，就贴到画布顶部（至少不会跑出去被裁掉）
        frameAction.style.top = Math.max(ACTION_TOP, Math.round(frameTop - frameAction.offsetHeight - ACTION_GAP)) + "px";
    }

    // ---------- 5) 背景花草 ----------
    function buildDeco() {
        decoLayer.textContent = "";

        const canvasWidth = parseFloat(canvas.style.width) || 2000;
        const canvasHeight = canvas.clientHeight || 520;

        // 装饰层比画布宽一些（CSS 里是 118%），滚动视差平移时右边不会露白
        const decoWidth = canvasWidth * 1.18;

        // 先把所有画框的矩形记下来，花草要躲开它们
        const boxes = [];
        for (const el of frameLayer.children) {
            boxes.push({
                x: parseFloat(el.style.left) || 0,
                y: parseFloat(el.style.top) || 0,
                w: el.offsetWidth,
                h: el.offsetHeight,
            });
        }

        // 「进入自动预览」按钮也躲开，别让花草压在按钮上
        if (frameAction && frameAction.offsetWidth > 0) {
            boxes.push({
                x: parseFloat(frameAction.style.left) || 0,
                y: parseFloat(frameAction.style.top) || 0,
                w: frameAction.offsetWidth,
                h: frameAction.offsetHeight,
            });
        }

        function hitsFrame(x, y) {
            for (const b of boxes) {
                if (
                    x > b.x - DECO_PAD && x < b.x + b.w + DECO_PAD &&
                    y > b.y - DECO_PAD && y < b.y + b.h + DECO_PAD
                ) {
                    return true;
                }
            }
            return false;
        }

        // 网格抖动分布：比纯随机均匀，不会几个花草挤成一团
        const cols = Math.ceil(decoWidth / CELL_W);
        const rows = Math.ceil((canvasHeight + 60) / CELL_H);
        const frag = document.createDocumentFragment();

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (random() < CELL_SKIP) {
                    continue; // 留些空位，显得自然
                }

                const x = c * CELL_W + rand(16, CELL_W - 34);
                const y = r * CELL_H + rand(8, CELL_H - 44);

                if (hitsFrame(x, y)) {
                    continue; // 和画框重叠的格子直接跳过
                }

                const el = document.createElement("span");
                el.className = "deco-item";
                el.textContent = pick(PLANTS);

                el.style.left = Math.round(x) + "px";
                el.style.top = Math.round(y) + "px";
                el.style.fontSize = randInt(20, 52) + "px";
                el.style.opacity = rand(0.34, 0.78).toFixed(2);
                el.style.setProperty("--rot", rand(-14, 14).toFixed(1) + "deg");
                el.style.animationDuration = rand(3.6, 7.6).toFixed(2) + "s";
                el.style.animationDelay = "-" + rand(0, 6).toFixed(2) + "s";

                frag.appendChild(el);
            }
        }

        decoLayer.appendChild(frag);
    }

    // ---------- 6) 毛线球滚动条 ----------
    function maxScroll() {
        return Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    }

    function rangeOf(rect) {
        return Math.max(1, rect.width - yarnBall.offsetWidth);
    }

    function moveBall(px) {
        yarnBall.style.setProperty("--ball-x", Math.round(px) + "px");
    }

    // 滚动位置 → 毛线球位置（拖动时不用管，球直接跟手）
    function syncBall() {
        if (dragging) {
            return;
        }
        const max = maxScroll();
        const ratio = max > 0 ? viewport.scrollLeft / max : 0;
        moveBall(ratio * rangeOf(yarnBar.getBoundingClientRect()));
    }

    let dragging = false;
    let dragRect = null; // 拖动期间缓存轨道位置，避免每帧都取（会强制重排）
    let pendingX = null;
    let rafId = null;

    // 每帧最多处理一次，高速拖动也不会堆积
    function applyDrag() {
        rafId = null;
        if (pendingX === null || !dragRect) {
            return;
        }

        const range = rangeOf(dragRect);
        const px = Math.min(range, Math.max(0, pendingX - dragRect.left - yarnBall.offsetWidth / 2));

        moveBall(px); // 球跟手
        viewport.scrollLeft = (px / range) * maxScroll(); // 画廊跟着走
        pendingX = null;
    }

    function queueDrag(clientX) {
        pendingX = clientX;
        if (rafId === null) {
            rafId = requestAnimationFrame(applyDrag);
        }
    }

    yarnBall.addEventListener("pointerdown", function (event) {
        dragging = true;
        dragRect = yarnBar.getBoundingClientRect();

        // 关键：拖动期间关掉平滑滚动。
        // 否则每设一次 scrollLeft 都要跑一遍平滑动画，和拖动互相打架，手感发黏。
        viewport.style.scrollBehavior = "auto";

        yarnBall.classList.add("dragging");
        yarnBall.setPointerCapture(event.pointerId);
        event.preventDefault();
    });

    yarnBall.addEventListener("pointermove", function (event) {
        if (dragging) {
            queueDrag(event.clientX);
        }
    });

    function endDrag(event) {
        if (!dragging) {
            return;
        }
        dragging = false;
        dragRect = null;

        if (rafId !== null) {
            cancelAnimationFrame(rafId);
            rafId = null;
        }
        pendingX = null;

        yarnBall.classList.remove("dragging");

        // 还回 CSS 里的平滑滚动（滚轮与点轨道继续用它）
        viewport.style.scrollBehavior = "";

        if (yarnBall.hasPointerCapture(event.pointerId)) {
            yarnBall.releasePointerCapture(event.pointerId);
        }
        syncBall();
    }

    yarnBall.addEventListener("pointerup", endDrag);
    yarnBall.addEventListener("pointercancel", endDrag);

    // 点轨道上别处 = 让毛线球平滑跳过去（这里保留平滑，看着舒服）
    yarnBar.addEventListener("pointerdown", function (event) {
        if (event.target === yarnBall) {
            return;
        }
        const rect = yarnBar.getBoundingClientRect();
        const range = rangeOf(rect);
        const ratio = (event.clientX - rect.left - yarnBall.offsetWidth / 2) / range;
        viewport.scrollLeft = Math.min(1, Math.max(0, ratio)) * maxScroll();
    });

    // 纵向滚轮改成横向滚动，手感更顺
    viewport.addEventListener("wheel", function (event) {
        if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
            event.preventDefault();
            viewport.scrollLeft += event.deltaY;
        }
    }, { passive: false });

    // 滚动时：同步毛线球 + 背景视差
    viewport.addEventListener("scroll", function () {
        syncBall();
        decoLayer.style.transform = "translateX(" + (-viewport.scrollLeft * 0.12).toFixed(1) + "px)";
    });

    // 键盘左右方向键也能逛
    document.addEventListener("keydown", function (event) {
        if (event.key === "ArrowRight") {
            viewport.scrollLeft += 240;
        } else if (event.key === "ArrowLeft") {
            viewport.scrollLeft -= 240;
        }
    });

    // ---------- 7) 启动 ----------
    function layout() {
        // 每次都从同一个种子重新开始 —— 否则 resize 之后随机序列已经走远，布局会跟着变
        random = makeRandom(LAYOUT_SEED);

        fitHeight();
        buildFrames();
        placeAction(); // 要在花草之前算好位置，花草才知道该躲哪
        buildDeco();
        syncBall();
    }

    layout();

    // 窗口尺寸变化或手机横竖屏切换后重新排布
    let resizeTimer = null;
    window.addEventListener("resize", function () {
        if (resizeTimer) {
            clearTimeout(resizeTimer);
        }
        resizeTimer = setTimeout(layout, 200);
    });
})();
