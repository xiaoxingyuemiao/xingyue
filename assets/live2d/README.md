# Live2D 模型放置说明

把模型文件放到对应角色的目录里，提交推送后全站生效。

## 目录结构

```
assets/live2d/
├── xingyao/      ← 星瑶的模型
├── yueci/        ← 月瓷的模型
└── default/      ← 默认模型（角色没有配置模型时使用）
```

## 每个模型目录需要什么

Live2D 模型（Cubism 2 / 4 / 5 都支持，即不同 SDK 版本导出的模型都能用）：

```
xingyao/
├── model.json        ← 模型配置文件（Cubism 4/5 是 model3.json）
├── *.moc / *.moc3    ← 模型文件
├── *.png             ← 贴图
└── motions/          ← 动作文件（可选）
    └── *.motion3.json
```

## 没有模型时会怎样

- 找不到对应模型 → 自动使用 `default/` 目录的模型
- 目录里也没有 → 显示占位文字（页面不会报错）

## 模型从哪来

- 官方示例模型：Cubism 官网（Live2D 株式会社）发布的免费示例（如 Hiyori / Mao 等）
- 社区模型：B 站 / 小红书等平台有很多免费 Live2D 模型资源

## 提示

- 角色切换时模型自动跟随（星瑶 → xingyao/，月瓷 → yueci/，我的角色用自己配置的模型）
- **模型名**：对应 `assets/live2d/` 下的目录名（`default` / `xingyao` / `yueci`）；新增模型时把目录放进 `assets/live2d/`，然后在角色配置里填目录名
- 官方角色（星瑶/月瓷）的模型在 `assets/data/official-roles.js` 的 `model` 字段配置（后台维护，页面不展示）：填模型名，留空或填错则使用 default 模型
- 「我的角色」在设置页 → 角色设定 → 编辑角色 的模型字段里填模型名（留空使用 default 模型）
