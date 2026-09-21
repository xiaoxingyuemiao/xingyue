// ================================
// 模型配置（assets/data/models.js）
// 每个模型独立的显示配置 + 情绪 → 表情/动作 映射
// 情绪枚举与聊天情绪规则一致：开心、难过、生气、害羞、惊讶、委屈、平静
// 表情名 = model3.json 里 Expressions 的 Name；动作 = { group, index }
//
// 想加新模型：
//   1. 把模型文件夹放进 assets/live2d/<模型名>/
//   2. 在下面 MODEL_CONFIGS 里加一段（照 default 写）
//   3. 在 assets/js/live2d.js 的 MODEL_NAMES 里加上模型名
// ================================

window.MODEL_CONFIGS = {

    // ---- 默认模型（ARGNori）----
    default: {
        path: "assets/live2d/default/ARGNori.model3.json",
        scale: 0.1,
        anchor: [0, 0],
        // 模型"框"的中心已经对齐窗口正中心（由 home.css 里 #oml2d-stage 的居中规则保证），
        // 但本模型框底部有约 132px 的透明留白，角色实际像素中心会比框中心高约 55px，
        // 所以这里往下压 55，让角色视觉上真正居中。
        // 实测：压之前角色像素中心相对画布中心是 (0, -55.5)，12 次采样摆动仅 ±1.5px。
        // 想让皮套再往下 / 往上一点，改这个 y 就行（正数 = 往下）。
        position: { x: 0, y: 55 },
        expressions: {
            开心: "13_Happy",
            难过: "08_Tears",
            生气: "03_Angry",
            害羞: "04_Shy",
            惊讶: "14_Surprised",
            委屈: "09_Troubled",
            平静: "00_Default",
        },
        motions: {
            开心: { group: "Reactions", index: 2 }, // 兴奋
            难过: { group: "Reactions", index: 4 }, // 困扰
            生气: { group: "Reactions", index: 3 }, // 生气
            害羞: { group: "Idle", index: 0 },
            惊讶: { group: "Reactions", index: 5 }, // 晕
            委屈: { group: "Reactions", index: 4 },
            平静: { group: "Idle", index: 0 },
        },
    },
};
