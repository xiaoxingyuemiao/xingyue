// ================================
// 模型配置（assets/data/models.js）
// 每个官方模型独立的显示配置 + 情绪 → 表情/动作 映射
// 情绪枚举与聊天情绪规则一致：开心、难过、生气、害羞、惊讶、委屈、平静
// 表情名 = model3.json 里 Expressions 的 Name；动作 = { group, index }
// ================================

window.MODEL_CONFIGS = {

    // ---- 默认模型（ARGNori）----
    default: {
        path: "assets/live2d/default/ARGNori.model3.json",
        scale: 0.1,
        anchor: [0, 0],
        position: null, // { x, y } 偏移，null = 不设置（保持锚点位置）
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

    // ---- 星瑶（Coffee）----
    xingyao: {
        path: "assets/live2d/xingyao/Coffee.model3.json",
        scale: 0.1,
        anchor: [0, 0],
        position: null,
        expressions: {
            开心: "爱心",
            难过: "哭哭",
            生气: "》《",
            害羞: "0.0",
            惊讶: "0.0",
            委屈: "哭哭",
            平静: "0.0",
        },
        motions: null, // 该模型没有动作文件
    },

    // ---- 月瓷（kuma maid）----
    yueci: {
        path: "assets/live2d/yueci/kuma maid.model3.json",
        scale: 0.1,
        anchor: [0, 0],
        position: null,
        expressions: {
            开心: "Dot face",
            难过: "Cry",
            生气: "Angry",
            害羞: "blush",
            惊讶: "Star mouth",
            委屈: "Cry",
            平静: "Form1",
        },
        motions: {
            平静: { group: "Idle", index: 0 }, // Scene1
        },
    },
};
