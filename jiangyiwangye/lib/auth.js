// ================================
// 建议网页 · 账号安全（lib/auth.js）
// 验证码、密码哈希、登录会话、取当前登录用户
// ================================

const crypto = require("crypto");
const config = require("./config");
const db = require("./db");
const util = require("./util");

const CODE_TTL_MS = 10 * 60 * 1000; // 验证码 10 分钟有效
const CODE_COOLDOWN_MS = 60 * 1000; // 同一邮箱 60 秒才能再发
const CODE_MAX_ATTEMPTS = 5;
const SESSION_TTL_MS = 30 * 24 * 3600 * 1000; // 登录 30 天

// ---------- 密码 ----------

function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
    return "scrypt$" + salt + "$" + hash;
}

function verifyPassword(password, stored) {
    try {
        const parts = String(stored || "").split("$");
        if (parts.length !== 3 || parts[0] !== "scrypt") {
            return false;
        }
        const salt = parts[1];
        const expected = Buffer.from(parts[2], "hex");
        const actual = crypto.scryptSync(String(password), salt, 64);
        if (actual.length !== expected.length) {
            return false;
        }
        return crypto.timingSafeEqual(actual, expected);
    } catch (e) {
        return false;
    }
}

// ---------- 验证码 ----------

function codeHash(email, purpose, code) {
    const secret = config.get().sessionSecret;
    return util.sha256(code + "|" + email + "|" + purpose + "|" + secret);
}

function issueCode(email, purpose, ip) {
    const now = Date.now();

    // 冷却：同一邮箱同一用途 60 秒一次
    const last = db.queryGet(
        "SELECT created_at FROM email_codes WHERE email = ? AND purpose = ? ORDER BY id DESC LIMIT 1",
        [email, purpose]
    );
    if (last && now - Number(last.created_at) < CODE_COOLDOWN_MS) {
        const wait = Math.ceil((CODE_COOLDOWN_MS - (now - Number(last.created_at))) / 1000);
        throw util.errors.rateLimited("验证码刚发过，请 " + wait + " 秒后再试");
    }

    // 频率限制：同一邮箱 1 小时 8 次，同一 IP 1 小时 30 次
    const hourAgo = now - 3600 * 1000;
    const emailCount = Number(
        db.scalar("SELECT COUNT(*) AS n FROM email_codes WHERE email = ? AND created_at > ?", [email, hourAgo])
    );
    if (emailCount >= 8) {
        throw util.errors.rateLimited("这个邮箱发验证码太频繁了，请过一会儿再试");
    }
    const ipCount = Number(
        db.scalar("SELECT COUNT(*) AS n FROM email_codes WHERE ip = ? AND created_at > ?", [ip || "", hourAgo])
    );
    if (ipCount >= 30) {
        throw util.errors.rateLimited("操作太频繁，请过一会儿再试");
    }

    const code = util.randomCode();
    const codeHashValue = codeHash(email, purpose, code);
    const expiresAt = now + CODE_TTL_MS;

    // 只保留最新一条，旧的作废
    db.run("DELETE FROM email_codes WHERE email = ? AND purpose = ?", [email, purpose]);
    db.run(
        "INSERT INTO email_codes (email, purpose, code_hash, expires_at, attempts, created_at, ip) VALUES (?, ?, ?, ?, 0, ?, ?)",
        [email, purpose, codeHashValue, expiresAt, now, ip || ""]
    );

    return code;
}

function verifyCode(email, purpose, code) {
    const row = db.queryGet(
        "SELECT * FROM email_codes WHERE email = ? AND purpose = ? AND expires_at > ? ORDER BY id DESC LIMIT 1",
        [email, purpose, Date.now()]
    );
    if (!row) {
        throw util.errors.badRequest("验证码不存在或已过期，请重新获取");
    }
    if (Number(row.attempts) >= CODE_MAX_ATTEMPTS) {
        throw util.errors.badRequest("验证码输错次数太多，请重新获取");
    }

    const expected = Buffer.from(String(row.code_hash), "hex");
    const actual = Buffer.from(codeHash(email, purpose, String(code || "").trim()), "hex");
    const same = expected.length === actual.length && crypto.timingSafeEqual(expected, actual);

    if (!same) {
        db.run("UPDATE email_codes SET attempts = attempts + 1 WHERE id = ?", [row.id]);
        throw util.errors.badRequest("验证码不正确，请检查后重试");
    }

    db.run("DELETE FROM email_codes WHERE email = ? AND purpose = ?", [email, purpose]);
    return true;
}

// ---------- 登录会话 ----------

function clientIp(req) {
    const forwarded = req.headers["x-forwarded-for"];
    if (forwarded) {
        return String(forwarded).split(",")[0].trim();
    }
    return (req.socket && req.socket.remoteAddress) || "";
}

function createSession(userId, req) {
    const token = crypto.randomBytes(32).toString("hex");
    const now = Date.now();
    db.run(
        "INSERT INTO sessions (user_id, token_hash, expires_at, created_at, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?)",
        [
            userId,
            util.sha256(token),
            now + SESSION_TTL_MS,
            now,
            clientIp(req),
            String(req.headers["user-agent"] || "").slice(0, 200),
        ]
    );
    return token;
}

function tokenFromRequest(req) {
    const header = String(req.headers["authorization"] || "");
    if (!header.startsWith("Bearer ")) {
        return "";
    }
    return header.slice(7).trim();
}

// 取当前登录用户（未登录 / 过期 / 被封禁返回 null）
function getSessionUser(req) {
    const token = tokenFromRequest(req);
    if (!token) {
        return null;
    }
    const row = db.queryGet(
        "SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?",
        [util.sha256(token), Date.now()]
    );
    if (!row || row.status !== "active") {
        return null;
    }
    return row;
}

function deleteSession(req) {
    const token = tokenFromRequest(req);
    if (!token) {
        return;
    }
    db.run("DELETE FROM sessions WHERE token_hash = ?", [util.sha256(token)]);
}

module.exports = {
    hashPassword,
    verifyPassword,
    issueCode,
    verifyCode,
    createSession,
    getSessionUser,
    deleteSession,
    clientIp,
};
