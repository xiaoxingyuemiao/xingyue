// ================================
// 自动预览页：临时幻灯片（assets/js/auto-preview.js）
//
// 站长要求：先把 images/ 里的图片都塞进来，按顺序以 PPT 的形式循环播放。
//   · 每张停留 3~6 秒（每张都是随机时长）
//   · 切换效果从 17 种里随机挑一种：
//       ① 八向翻折：上 / 下 / 左 / 右 / 左上 / 右上 / 左下 / 右下
//       ② 八向平移：同样这八个方向
//       ③ 慢慢淡出 + 慢慢出现
//
// ⚠️ 这是**临时**实现（先看看效果）。以后做正式的自动预览时，整个文件替换掉即可。
// ================================

(function () {

    // ---------- 播放清单：images/ 里的全部图片 ----------
    // 想增减或调整顺序，改这个数组就行（按文件名顺序排的）
    const SLIDES = [
        "images/live2d-param.png",
        "images/shuruokuangrewu.png",
        "images/supingbeijing.jpg",
        "images/wangzhanmeiye.png",
        "images/xingyao-avatar.jpg",
        "images/xingyao-bg.jpg",
        "images/xingyao.png",
        "images/yueci-avatar.jpg",
        "images/yueci-bg.jpg",
        "images/yueci.png",
        "images/zhushitu.jpg",
    ];

    // ---------- 时间参数 ----------
    const HOLD_MIN = 3000; // 每张最少停留 3 秒
    const HOLD_MAX = 6000; // 每张最多停留 6 秒
    const FOLD_MS = 900; // 翻折 / 平移的用时
    const FADE_MS = 1800; // 淡出淡入的用时（「慢慢」淡出、慢慢出现）

    // ---------- 八向翻折 ----------
    // origin：从哪条边 / 哪个角折起；in：折进来的起始角度；out：折出去的角度
    const FOLD = {
        top: { origin: "center top", in: "rotateX(-90deg)", out: "rotateX(90deg)" },
        bottom: { origin: "center bottom", in: "rotateX(90deg)", out: "rotateX(-90deg)" },
        left: { origin: "left center", in: "rotateY(-90deg)", out: "rotateY(90deg)" },
        right: { origin: "right center", in: "rotateY(90deg)", out: "rotateY(-90deg)" },
        "top-left": { origin: "left top", in: "rotate3d(1,-1,0,90deg)", out: "rotate3d(1,-1,0,-90deg)" },
        "top-right": { origin: "right top", in: "rotate3d(1,1,0,-90deg)", out: "rotate3d(1,1,0,90deg)" },
        "bottom-left": { origin: "left bottom", in: "rotate3d(1,1,0,90deg)", out: "rotate3d(1,1,0,-90deg)" },
        "bottom-right": { origin: "right bottom", in: "rotate3d(1,-1,0,-90deg)", out: "rotate3d(1,-1,0,90deg)" },
    };

    // ---------- 八向平移 ----------
    // in：新图从哪边进来；out：旧图往哪边出去（方向相反，看着像被推走）
    const PAN = {
        left: { in: "translateX(-100%)", out: "translateX(100%)" },
        right: { in: "translateX(100%)", out: "translateX(-100%)" },
        top: { in: "translateY(-100%)", out: "translateY(100%)" },
        bottom: { in: "translateY(100%)", out: "translateY(-100%)" },
        "top-left": { in: "translate(-100%, -100%)", out: "translate(100%, 100%)" },
        "top-right": { in: "translate(100%, -100%)", out: "translate(-100%, 100%)" },
        "bottom-left": { in: "translate(-100%, 100%)", out: "translate(100%, -100%)" },
        "bottom-right": { in: "translate(100%, 100%)", out: "translate(-100%, -100%)" },
    };

    const DIRECTIONS = Object.keys(FOLD); // 八个方向，翻折和平移共用

    // ---------- 元素 ----------
    const stage = document.querySelector("#ap-stage");

    if (!stage) {
        return;
    }

    // ---------- 小工具 ----------
    function rand(min, max) {
        return min + Math.random() * (max - min);
    }

    function pickEffect() {
        // 17 种效果等概率随机（8 翻折 + 8 平移 + 1 淡入淡出）
        // 想让「淡出淡入」更常出现，就把下面的 16 / 17 改小、8 / 17 改成 1 / 3 之类的比例
        const roll = Math.random();

        if (roll < 8 / 17) {
            return { kind: "fold", dir: DIRECTIONS[Math.floor(Math.random() * 8)] };
        }
        if (roll < 16 / 17) {
            return { kind: "pan", dir: DIRECTIONS[Math.floor(Math.random() * 8)] };
        }
        return { kind: "fade" };
    }

    function makeSlide(src) {
        const box = document.createElement("div");
        box.className = "ap-slide";

        const img = document.createElement("img");
        img.src = src;
        img.alt = "自动预览的图片";
        img.draggable = false;

        box.appendChild(img);
        return box;
    }

    // 给一层套上「进入 / 离开」的动画，返回动画时长（毫秒）
    function applyEffect(el, effect, phase) {
        const incoming = phase === "in";

        if (effect.kind === "fade") {
            el.style.setProperty("--ap-dur", FADE_MS + "ms");
            el.classList.add(incoming ? "ap-fade-in" : "ap-fade-out");
            return FADE_MS;
        }

        if (effect.kind === "fold") {
            const conf = FOLD[effect.dir];
            el.style.setProperty("--ap-dur", FOLD_MS + "ms");
            el.style.setProperty("--ap-origin", conf.origin);
            el.style.setProperty("--ap-rot", incoming ? conf.in : conf.out);
            el.classList.add(incoming ? "ap-fold-in" : "ap-fold-out");
            return FOLD_MS;
        }

        const conf = PAN[effect.dir];
        el.style.setProperty("--ap-dur", FOLD_MS + "ms");
        el.style.setProperty("--ap-from", incoming ? conf.in : conf.out);
        el.classList.add(incoming ? "ap-pan-in" : "ap-pan-out");
        return FOLD_MS;
    }

    // ---------- 播放 ----------
    let index = 0;
    let current = null;
    let timer = null;

    function show(src) {
        const effect = pickEffect();

        const incoming = makeSlide(src);
        const duration = applyEffect(incoming, effect, "in");
        stage.appendChild(incoming);

        if (current) {
            const outgoing = current;
            applyEffect(outgoing, effect, "out");
            // 等动画放完再移除旧层，免得叠在上面挡住新图
            setTimeout(() => outgoing.remove(), duration + 80);
        }

        current = incoming;
    }

    function tick() {
        show(SLIDES[index]);
        index = (index + 1) % SLIDES.length; // 循环播放

        timer = setTimeout(tick, rand(HOLD_MIN, HOLD_MAX));
    }

    // ---------- 启动 ----------
    // 第一张加载完就立刻开播（不等全部）—— 一共约 3MB，全等完首屏会空白好几秒。
    // 其余的图在后台继续预加载，后面切到它们时基本都已经就位。
    const first = new Image();
    first.onload = first.onerror = () => tick();
    first.src = SLIDES[0];

    SLIDES.slice(1).forEach((src) => {
        const img = new Image();
        img.src = src;
    });

    window.addEventListener("pagehide", () => {
        if (timer) {
            clearTimeout(timer);
        }
    });
})();
