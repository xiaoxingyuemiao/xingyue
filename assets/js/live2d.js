// ================================
// Live2D 业务模块（assets/js/live2d.js）
// 负责：模型加载 / 按角色切换模型 / 锚点设置 / 窗口交互（拖动、中键缩放、Ctrl+中键旋转）
// 依赖：
//   - window.OML2D：oh-my-live2d SDK（index.html 引入 assets/vendor/oh-my-live2d.min.js）
//   - getRoleModelName()：角色 → 模型名解析（定义在 main.js，页面加载完成后才调用）
// 暴露：window.Live2D
// ================================

window.Live2D = {
    om: null,

    // 官方模型清单：聊天角色按名字切换（角色 → 模型在 getRoleModelName 里解析）
    MODEL_NAMES: ["default", "xingyao", "yueci"],
    MODELS: [
        { name: "default", path: "assets/live2d/default/ARGNori.model3.json", scale: 0.1, anchor: [0, 0] },
        { name: "xingyao", path: "assets/live2d/xingyao/Coffee.model3.json", scale: 0.1, anchor: [0, 0] },
        { name: "yueci", path: "assets/live2d/yueci/kuma maid.model3.json", scale: 0.1, anchor: [0, 0] },
    ],
    // 当前显示的模型
    currentModelName: "default",

    // 窗口状态：拖动偏移 / 缩放 / 旋转
    win: {
        dx: 0,
        dy: 0,
        scale: 1,
        rotation: 0,
        dragging: false,
        startX: 0,
        startY: 0,
        startDx: 0,
        startDy: 0,
        bound: false,
    },

    async init() {
        // SDK 已由 index.html 加载（window.OML2D.loadOml2d）
        const factory = window.OML2D && window.OML2D.loadOml2d;
        if (!factory) {
            console.warn("Live2D SDK 未加载");
            return;
        }
        const container = document.getElementById("live2d-container");
        if (!container) {
            return;
        }
        try {
            this.om = factory({
                el: container,
                parentElement: container,
                models: this.MODELS,
                // 关闭 SDK 自带 UI
                statusBar: { disable: true },
                menus: { disable: true },
                tips: { disable: true },
                sayHello: false,
            });
            window.__om = this.om; // 调试钩子
            console.log("Live2D 模型加载中……");
            this.setModelAnchor();
            this.bindWindowInteractions();
            // 页面加载后，跟随当前聊天角色切换到对应模型
            this.switchModel(getRoleModelName());
        } catch (error) {
            console.warn("Live2D 加载失败：", error);
        }
    },

    // 切换模型（按名字在官方模型清单里找；同名不重复切换）
    async switchModel(name) {
        const om = this.om;
        if (!om || typeof om.loadModelByIndex !== "function") {
            return;
        }
        const idx = this.MODEL_NAMES.indexOf(name);
        if (idx < 0) {
            console.warn("未知模型名: " + name);
            return;
        }
        if (name === this.currentModelName) {
            return;
        }
        try {
            await om.loadModelByIndex(idx);
            this.currentModelName = name;
            console.log("模型已切换: " + name);
            // 新模型就绪后重新设置锚点
            this.setModelAnchor();
        } catch (error) {
            console.warn("模型切换失败: " + name, error);
        }
    },

    // 设置模型锚点 (0, 0)：运行时调用，模型对象未就绪时自动重试
    setModelAnchor(attempts) {
        const om = this.om;
        if (!om || typeof om.setModelAnchor !== "function") {
            return;
        }
        const count = attempts || 0;
        try {
            om.setModelAnchor({ x: 0, y: 0 });
            console.log("模型锚点已设置 (0, 0)");
        } catch (error) {
            if (count < 20) {
                // 模型对象还没创建完成，稍后重试（最多 10 秒）
                setTimeout(() => this.setModelAnchor(count + 1), 500);
            } else {
                console.warn("模型锚点设置失败：", error);
            }
        }
    },

    // 应用窗口变换：窗口（容器）固定在整个网页正中间，
    // 拖动 / 缩放 / 旋转叠加在居中偏移上（操作容器，SDK 只渲染画布，互不干扰）
    applyWin() {
        const container = document.getElementById("live2d-container");
        if (!container) {
            return;
        }
        const w = this.win;
        if (container.style.transformOrigin !== "center center") {
            container.style.transformOrigin = "center center";
        }
        // 居中（-50%）+ 拖动偏移 + 缩放 + 旋转
        const transform =
            "translate(-50%, -50%) " +
            "translate(" + w.dx + "px, " + w.dy + "px) " +
            "scale(" + w.scale + ") rotate(" + w.rotation + "deg)";
        if (container.style.transform !== transform) {
            container.style.transform = transform;
        }
    },

    // 鼠标动"窗口"：拖动 / 中键缩放 / Ctrl+中键旋转（捕获阶段，避免被 SDK 拦截）
    bindWindowInteractions() {
        if (this.win.bound) {
            return;
        }
        this.win.bound = true;

        const stageEl = document.querySelector(".live2d-stage") || document.getElementById("live2d-container");
        if (!stageEl) {
            return;
        }
        const w = this.win;

        stageEl.addEventListener("pointerdown", (e) => {
            w.dragging = true;
            w.startX = e.clientX;
            w.startY = e.clientY;
            w.startDx = w.dx;
            w.startDy = w.dy;
            e.preventDefault();
        }, true);

        window.addEventListener("pointermove", (e) => {
            if (!w.dragging) {
                return;
            }
            w.dx = w.startDx + (e.clientX - w.startX);
            w.dy = w.startDy + (e.clientY - w.startY);
            this.applyWin();
        }, true);

        window.addEventListener("pointerup", () => {
            w.dragging = false;
        }, true);

        stageEl.addEventListener("wheel", (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -1 : 1;
            if (e.ctrlKey) {
                // 旋转窗口
                w.rotation = Math.round((w.rotation + delta * 5) * 10) / 10;
            } else {
                // 缩放窗口
                const factor = delta > 0 ? 0.93 : 1.07;
                w.scale = Math.min(5, Math.max(0.1, w.scale * factor));
            }
            this.applyWin();
        }, { passive: false, capture: true });
    },
};
