// ================================
// 建议网页 · 验证码发送（lib/mail.js）
//
// 现在默认是「开发模式」：验证码直接打印到启动窗口 + 写进 shujuku-1/dev-codes.log，
// 同时接口响应里带 devCode，页面上也会显示，方便本机测试。
//
// 以后要真发邮件：把 config.local.json 里 devMode 改成 false，并填好 smtp 配置，
// 再补上下面 sendViaSmtp 的实现（QQ/163 邮箱用授权码，不是登录密码）。
// ================================

const fs = require("fs");
const config = require("./config");
const util = require("./util");

const paths = config.dataPaths();

function labelOf(purpose) {
    return purpose === "register" ? "注册" : "登录";
}

function sendCode(email, code, purpose) {
    const cfg = config.get();
    const label = labelOf(purpose);

    if (cfg.devMode) {
        const line = "[" + new Date().toLocaleString("zh-CN") + "] " + label + "验证码 " + code + "  →  " + email;
        console.log("\n  ★ 开发模式验证码：" + code + "   （" + label + " · " + email + "）\n");
        try {
            util.ensureDir(paths.dataDir);
            fs.appendFileSync(paths.devCodeLog, line + "\n", "utf8");
        } catch (e) {
            /* 写日志失败不影响发码流程 */
        }
        return { devCode: code };
    }

    // 正式模式：必须配置 SMTP 才能发；没配置时给明确提示
    if (!cfg.smtp || !cfg.smtp.host || !cfg.smtp.user || !cfg.smtp.pass) {
        throw util.errors.server(
            "邮件服务还没配置：请编辑 config.local.json 填好 smtp（QQ/163 邮箱的 SMTP 授权码），再把 devMode 改成 false；或者继续用 devMode 测试"
        );
    }

    return sendViaSmtp(cfg.smtp, email, code, purpose);
}

// 真正的 SMTP 发信：需要时再实现（node:tls 手写，或接入国内邮件 API）
function sendViaSmtp() {
    throw util.errors.server(
        "SMTP 发信还没接入。目前的开发模式（devMode=true）会把验证码显示在启动窗口，请先用它测试；" +
            "要正式发邮件时告诉开发方，把这段补上即可"
    );
}

module.exports = {
    sendCode,
};
