# Live2D SDK 本地文件（oh-my-live2d）

由于 CDN（jsdelivr 等）在国内可能无法访问，网站会**优先加载这里的本地 SDK 文件**。

## 需要下载两个文件（放到本目录）

1. `oh-my-live2d.min.js`
2. `oh-my-live2d.min.css`

## 下载地址（任选一个来源）

### 来源一：淘宝 npm 镜像（国内速度快，推荐）
- https://registry.npmmirror.com/oh-my-live2d/0.19.3/files/dist/index.min.js
- https://registry.npmmirror.com/oh-my-live2d/0.19.3/files/dist/index.min.css

### 来源二：GitHub 仓库
- https://raw.githubusercontent.com/Eikanya/oh-my-live2d/main/dist/index.min.js
- https://raw.githubusercontent.com/Eikanya/oh-my-live2d/main/dist/index.min.css

## 操作步骤

1. 用浏览器打开上面的链接（npmmirror 的会直接显示文件内容）
2. 鼠标右键 → 「另存为」/「保存页面为」
3. 保存到项目目录：`D:\xingyue\assets\vendor\`
   - JS 文件保存为：`oh-my-live2d.min.js`
   - CSS 文件保存为：`oh-my-live2d.min.css`
4. 在 VS Code 里「提交 + 同步」推送到 GitHub

## 说明

- 放好后，网站会从自己的服务器加载 SDK，不再依赖外部 CDN
- 如果没有放这两个文件，网站会自动尝试 CDN 备用加载（网络不通时显示提示）
