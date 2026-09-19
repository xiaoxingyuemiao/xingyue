# Live2D 模型放置说明

把模型文件夹放进 `assets/live2d/`，提交推送后全站生效。

## 目录结构

```
assets/live2d/
└── default/      ← 默认模型（所有角色没有单独配置模型时使用）
```

## 每个模型目录需要什么

Live2D 模型（Cubism 2 / 4 / 5 都支持，即不同 SDK 版本导出的模型都能用）：

```
default/
├── xxx.model3.json   ← 模型配置文件（Cubism 2 是 model.json）
├── *.moc / *.moc3    ← 模型文件
├── *.png             ← 贴图
├── expressions/      ← 表情文件（可选）
└── motions/          ← 动作文件（可选）
```

## 怎么加一个新模型

1. 把模型文件夹放进 `assets/live2d/<模型名>/`（比如 `assets/live2d/hiyori/`）
2. 在 `assets/data/models.js` 里加一段配置（照 `default` 那段写，`path` 指向 `.model3.json`）
3. 在 `assets/js/live2d.js` 的 `MODEL_NAMES` 里加上模型名
4. 在角色配置里填这个模型名：
   - 官方角色（星瑶/月瓷）→ `assets/data/official-roles.js` 的 `model` 字段
   - 我的角色 → 设置页 → 角色设定 → 编辑角色的模型字段

## 没有模型时会怎样

- 角色没配置模型 / 模型名填错 → 自动使用 `default/` 的模型
- 目录里也没有 → 模型不显示（页面不会报错）

## 模型从哪来

- 官方示例模型：Cubism 官网（Live2D 株式会社）发布的免费示例（如 Hiyori / Mao 等）
- 社区模型：B 站 / 小红书等平台有很多免费 Live2D 模型资源
