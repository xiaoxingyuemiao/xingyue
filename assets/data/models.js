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
        // 显示大小：模型原始尺寸是 3600×6700，乘这个系数就是屏幕上的像素大小。
        //   0.10 → 360×670（角色本体高约 519px）
        //   0.13 → 468×871（角色本体高约 675px）← 当前
        // 想让皮套更大 / 更小，改这一个数（模型框尺寸、下面的补偿 y 都要跟着等比变）。
        scale: 0.13,
        anchor: [0, 0],
        // 模型"框"的中心已经对齐窗口正中心（由 home.css 里 #oml2d-stage 的居中规则保证），
        // 但本模型框底部有约 19.7% 的透明留白、角色像素中心落在框高的 41.6% 处，
        // 所以要把模型往下压「(50% − 41.6%) × 框高」才能让角色视觉上真正居中。
        // scale 0.10 时框高 670 → 压 56；scale 0.13 时框高 871 → 压 73。
        // 实测（scale 0.10）：压之前角色像素中心相对画布中心是 (0, −55.5)，12 次采样摆动仅 ±1.5px。
        // 想让皮套再往下 / 往上一点，直接改这个 y（正数 = 往下）。
        position: { x: 0, y: 73 },
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
