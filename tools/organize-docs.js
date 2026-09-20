// ================================
// docs 目录整理（node tools/organize-docs.js）
// 目标：减少重复文件
//   ① 03-协作指南 + 04-双人协同操作手册  →  03-Git协作指南（合并去重）
//   ② 05-AI协作约定                        →  04-AI协作约定（改编号 + 更新引用）
//   ③ 06-网站流程图                        →  05-网站流程图（改编号 + 更新引用）
//   ④ 07-页面结构改造                       →  删除（决策已完成，结论已并入 05）
// 幂等：源文件不存在时跳过对应步骤
// ================================

const fs = require("fs");
const path = require("path");

const DOCS = path.join(__dirname, "..", "docs");

function exists(f) {
    return fs.existsSync(path.join(DOCS, f));
}
function read(f) {
    return fs.readFileSync(path.join(DOCS, f), "utf8");
}
function write(f, s) {
    fs.writeFileSync(path.join(DOCS, f), s, "utf8");
    console.log("✎ 写入 " + f);
}
function del(f) {
    fs.unlinkSync(path.join(DOCS, f));
    console.log("✗ 删除 " + f);
}

// ---------- ① 合并 03 + 04 ----------
if (exists("03-协作指南.md") && exists("04-双人协同操作手册.md")) {
    const d03 = read("03-协作指南.md");
    const d04 = read("04-双人协同操作手册.md");

    // 从 03 取"第一次准备"部分（第 1 步 ~ GitHub Desktop 结尾）
    const prepStart = d03.indexOf("## 第 1 步");
    const prepEnd = d03.indexOf("## 不想敲命令");
    const prep = prepStart >= 0 && prepEnd > prepStart ? d03.slice(prepStart, prepEnd).trim() : "";
    const desktop = prepEnd >= 0 ? d03.slice(prepEnd).trim() : "";

    // 从 04 取正文（跳过原标题与引言、去掉末尾"相关文档"）
    const bodyStart = d04.indexOf("## 一、");
    let body = bodyStart >= 0 ? d04.slice(bodyStart) : d04;
    const relStart = body.indexOf("## 七、相关文档");
    if (relStart > 0) {
        body = body.slice(0, relStart).trim();
    }

    const parts = [
        "# Git 协作指南（环境准备 · 日常协同 · 冲突处理）",
        "",
        "> 适用仓库：`https://github.com/xiaoxingyuemiao/xingyue.git`（私有仓库，主分支 `main`）",
        "> 本文合并了原来的《协作指南》和《双人协同操作手册》，一篇看完就够，不用翻两份。",
        "> 命令都可以在 **Git Bash / PowerShell / 终端**里直接执行。",
        "",
        "---",
        "",
        "## 第一部分：第一次准备（新成员从这里开始，只做一次）",
        "",
        prep,
        "",
        desktop,
        "",
        "---",
        "",
        "## 第二部分：日常协同与冲突处理",
        "",
        body,
        "",
        "---",
        "",
        "## 相关文档",
        "",
        "- `docs/01-网站定位.md`：这个站是做什么的",
        "- `docs/02-网站结构.md`：目录结构、页面清单、实现进度",
        "- `docs/03-Git协作指南.md`：本文（环境准备 + 日常协同 + 冲突处理）",
        "- `docs/04-AI协作约定.md`：两个人各自用 AI 写代码时的分工与规则",
        "- `docs/05-网站流程图.md`：网站流程图（现状 + 改造目标）",
        "",
    ];

    write("03-Git协作指南.md", parts.join("\n"));
    del("03-协作指南.md");
    del("04-双人协同操作手册.md");
} else {
    console.log("· 跳过 ①（源文件已合并过）");
}

// ---------- ② 05 → 04 ----------
if (exists("05-AI协作约定.md")) {
    let s = read("05-AI协作约定.md");
    s = s
        .replace(/docs\/03-协作指南\.md/g, "docs/03-Git协作指南.md")
        .replace(/docs\/04-双人协同操作手册\.md/g, "docs/03-Git协作指南.md")
        .replace(/docs\/05-AI协作约定\.md/g, "docs/04-AI协作约定.md")
        .replace(/docs\/06-网站流程图\.md/g, "docs/05-网站流程图.md")
        .replace(/`docs\/04-双人协同操作手册\.md` 第四节/g, "`docs/03-Git协作指南.md` 的冲突处理一节");
    write("04-AI协作约定.md", s);
    del("05-AI协作约定.md");
} else {
    console.log("· 跳过 ②（已改过编号）");
}

// ---------- ③ 06 → 05（并把 07 的决策结论并进来） ----------
if (exists("06-网站流程图.md")) {
    let s = read("06-网站流程图.md");
    s = s
        .replace(/# 网站流程图（现状版）/g, "# 网站流程图（现状 + 改造目标）")
        .replace(/docs\/03-协作指南\.md/g, "docs/03-Git协作指南.md")
        .replace(/docs\/04-双人协同操作手册\.md/g, "docs/03-Git协作指南.md")
        .replace(/docs\/05-AI协作约定\.md/g, "docs/04-AI协作约定.md")
        .replace(/docs\/06-网站流程图\.md/g, "docs/05-网站流程图.md")
        .replace(/docs\/07-页面结构改造\.md[^\n]*/g, "")
        .replace(/`docs\/06-网站流程图\.md`：本文（现状流程图 \+ 可改动点）/g, "`docs/05-网站流程图.md`：本文（现状 + 改造目标）")
        .replace(/`docs\/07-页面结构改造\.md`：本文/g, "");

    // 追加"改造目标"一节
    const plan = [
        "",
        "---",
        "",
        "## 八、改造目标（已确认的方向）",
        "",
        "> 2026-09 确认：页面结构与登录流程重做。下面是定稿的方向，实现完成后本节内容会变成新的「现状」。",
        "",
        "### 8.1 登录 / 注册（重做）",
        "",
        "```mermaid",
        "flowchart TD",
        '    A["第一张卡<br/>登录 ｜ 注册 ｜ 游客进入"] --> B["登录卡"]',
        '    A --> C["注册卡"]',
        '    B <-->|"没有账号？去注册一个吧 / 已经有账号了？去登录吧"| C',
        "",
        '    B --> B1["方式一：邮箱 + 密码 → [登录]（回车可提交）"]',
        '    B --> B2["方式二：邮箱 + [发送验证码] + 验证码 → [登录]"]',
        '    B --> B3["[忘记密码？] → 邮箱验证码 → 设置新密码"]',
        "",
        '    C --> C1["[邮箱] + [密码] + [再次输入密码] + [验证码] → [注册]"]',
        "",
        '    B1 --> H["进首页（凭证存本地，定时续期）"]',
        '    B2 --> H',
        '    B3 --> B',
        '    C1 --> H',
        '    A --> G["游客进入 → 首页（未登录）"]',
        "```",
        "",
        "要点：",
        "- 登录卡**同时支持密码和验证码**两种方式（卡内切换）",
        "- 注册卡 = 邮箱 + 密码 + 确认密码 + 邮箱验证码",
        "- 新增**忘记密码**流程（邮箱验证码重置）",
        "- 技术：Supabase `signUp` / `signInWithPassword` / `verifyOtp` / `resetPasswordForEmail`",
        "",
        "### 8.2 个人页面（原设置页并入）",
        "",
        "```mermaid",
        "flowchart TD",
        '    U["个人中心 user.html"] --> S1["① 个人资料<br/>头像（上传/默认）· 昵称 · 签名"]',
        '    U --> S2["② API 设置<br/>提供商卡片 · 切换 · 编辑 · 测试"]',
        '    U --> S3["③ 角色设定<br/>我的角色增删改 · 模型配置 · 导入本地模型"]',
        '    U --> S4["④ 对话记录<br/>记忆对数 · 清空 · 历史列表"]',
        '    U --> S5["底部：退出登录"]',
        "```",
        "",
        "要点：",
        "- `settings.html` **删除**，全部设置并入个人页面（四个分区）",
        "- 侧边栏的「设置」菜单项**删除**，入口只有左下角用户区",
        "- 角色面板里的「+ 添加人物」→ 跳到个人页面的角色分区",
        "- 个人页面以后还会按站长的设计图再改（先搭临时版本）",
        "",
        "### 8.3 连带影响",
        "",
        "| 原来 | 改成 |",
        "| --- | --- |",
        "| 侧边栏「设置」→ settings.html | 删除该项；左下角用户区 → 个人中心 |",
        "| settings.html（三视图）| 并入 user.html（四分区）|",
        "| 登录只有验证码 | 密码 / 验证码双方式 + 忘记密码 |",
        "| 角色面板「+ 添加人物」→ settings.html#role | → 个人中心角色分区 |",
        "",
    ].join("\n");

    s = s.trimEnd() + "\n" + plan;
    write("05-网站流程图.md", s);
    del("06-网站流程图.md");
} else {
    console.log("· 跳过 ③（已改过编号）");
}

// ---------- ④ 删除 07 ----------
if (exists("07-页面结构改造.md")) {
    del("07-页面结构改造.md");
} else {
    console.log("· 跳过 ④（已删除）");
}

console.log("\n整理后的 docs 目录：");
for (const f of fs.readdirSync(DOCS).sort()) {
    const size = (fs.statSync(path.join(DOCS, f)).size / 1024).toFixed(1);
    console.log("  " + f.padEnd(34) + size + " KB");
}
