// ================================
// 建议网页 · 数据库（lib/db.js）
// 用 Node 内置 node:sqlite 建表 / 读写；数据文件在 shujuku-1/app.db
// ================================

const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");
const config = require("./config");
const util = require("./util");

const paths = config.dataPaths();

let db = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
    username      TEXT UNIQUE COLLATE NOCASE,
    display_name  TEXT NOT NULL,
    password_hash TEXT,
    is_admin      INTEGER NOT NULL DEFAULT 0,
    status        TEXT NOT NULL DEFAULT 'active',
    created_at    TEXT NOT NULL,
    last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS email_codes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    email      TEXT NOT NULL COLLATE NOCASE,
    purpose    TEXT NOT NULL,
    code_hash  TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    attempts   INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    ip         TEXT
);
CREATE INDEX IF NOT EXISTS idx_email_codes_lookup ON email_codes(email, purpose, created_at);

CREATE TABLE IF NOT EXISTS sessions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    ip         TEXT,
    user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);

CREATE TABLE IF NOT EXISTS suggestions (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title        TEXT NOT NULL,
    category     TEXT NOT NULL DEFAULT '其他',
    content      TEXT NOT NULL,
    image        TEXT NOT NULL DEFAULT '',
    status       TEXT NOT NULL DEFAULT 'pending',
    base_points  INTEGER NOT NULL DEFAULT 0,
    bonus_points INTEGER NOT NULL DEFAULT 0,
    admin_note   TEXT NOT NULL DEFAULT '',
    created_at   TEXT NOT NULL,
    reviewed_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_suggestions_user ON suggestions(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_suggestions_status ON suggestions(status, created_at);

CREATE TABLE IF NOT EXISTS point_ledger (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    delta      INTEGER NOT NULL,
    type       TEXT NOT NULL,
    note       TEXT NOT NULL DEFAULT '',
    ref_type   TEXT,
    ref_id     INTEGER,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ledger_user ON point_ledger(user_id, id);

CREATE TABLE IF NOT EXISTS prizes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    kind        TEXT NOT NULL DEFAULT 'physical',
    cost        INTEGER NOT NULL DEFAULT 0,
    stock       INTEGER NOT NULL DEFAULT 0,
    image       TEXT NOT NULL DEFAULT '',
    file_path   TEXT NOT NULL DEFAULT '',
    file_name   TEXT NOT NULL DEFAULT '',
    active      INTEGER NOT NULL DEFAULT 1,
    sort        INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    prize_id    INTEGER NOT NULL REFERENCES prizes(id),
    prize_name  TEXT NOT NULL DEFAULT '',
    cost        INTEGER NOT NULL DEFAULT 0,
    status      TEXT NOT NULL DEFAULT 'pending',
    address     TEXT NOT NULL DEFAULT '',
    contact     TEXT NOT NULL DEFAULT '',
    note        TEXT NOT NULL DEFAULT '',
    tracking_no TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id, id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status, id);

CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT ''
);
`;

const DEFAULT_SETTINGS = {
    site_title: "星月小窝 · 听歌说",
    site_subtitle: "给这首歌提建议，赚积分换奖品",
    song_title: "歌曲名待填写",
    song_artist: "",
    song_url: "",
    song_intro: "站长还没有填写歌曲介绍～",
    song_cover: "",
    announcement: "",
    rules_text: "提交一条建议得 5 积分；被采纳再得 50 积分；每人每天最多提交 3 条。积分可以兑换下方奖品。",
    shop_intro: "积分可以兑换以下奖品。实物奖品需要填写收货地址，虚拟奖品兑换后可直接下载。",
    points_base: "5",
    points_bonus: "50",
    submit_daily_limit: "3",
};

function init() {
    util.ensureDir(paths.dataDir);
    util.ensureDir(paths.uploadPublicDir);
    util.ensureDir(paths.uploadPrivateDir);

    db = new DatabaseSync(paths.dbFile);
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec("PRAGMA foreign_keys = ON;");
    db.exec("PRAGMA busy_timeout = 5000;");
    db.exec(SCHEMA);

    // 默认设置：只补缺失的，不覆盖站长改过的
    const insert = db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)");
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        insert.run(key, value);
    }

    // 顺手清理过期验证码 / 过期登录会话（保留数据不膨胀）
    const now = Date.now();
    db.prepare("DELETE FROM email_codes WHERE expires_at < ?").run(now - 24 * 3600 * 1000);
    db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(now);

    console.log("数据库已就绪：" + paths.dbFile);
    return db;
}

function conn() {
    if (!db) {
        throw new Error("数据库尚未初始化");
    }
    return db;
}

// 说明：node:sqlite 的 prepare 每次返回新语句，这里统一包一层
function queryAll(sql, params) {
    const stmt = conn().prepare(sql);
    return stmt.all.apply(stmt, params || []);
}

function queryGet(sql, params) {
    const stmt = conn().prepare(sql);
    return stmt.get.apply(stmt, params || []);
}

function run(sql, params) {
    const stmt = conn().prepare(sql);
    return stmt.run.apply(stmt, params || []);
}

function scalar(sql, params) {
    const row = queryGet(sql, params);
    if (!row) {
        return null;
    }
    const keys = Object.keys(row);
    return keys.length > 0 ? row[keys[0]] : null;
}

// 事务：同步执行 fn，出错自动回滚
function tx(fn) {
    const c = conn();
    c.exec("BEGIN IMMEDIATE");
    try {
        const result = fn();
        c.exec("COMMIT");
        return result;
    } catch (e) {
        try {
            c.exec("ROLLBACK");
        } catch (rollbackError) {
            console.error("回滚失败：", rollbackError);
        }
        throw e;
    }
}

function close() {
    if (db) {
        try {
            db.close();
        } catch (e) {
            /* 忽略关闭异常 */
        }
        db = null;
    }
}

// ---------- 设置 ----------

function getSettings() {
    const rows = queryAll("SELECT key, value FROM settings");
    const out = {};
    for (const row of rows) {
        out[row.key] = row.value;
    }
    return out;
}

function getSetting(key, fallback) {
    const row = queryGet("SELECT value FROM settings WHERE key = ?", [key]);
    return row ? row.value : fallback;
}

function setSettings(data) {
    const stmt = conn().prepare(
        "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    );
    for (const [key, value] of Object.entries(data || {})) {
        stmt.run(key, String(value));
    }
}

// ---------- 常用查询 ----------

function userPoints(userId) {
    const v = scalar("SELECT COALESCE(SUM(delta), 0) AS points FROM point_ledger WHERE user_id = ?", [userId]);
    return Number(v) || 0;
}

function adminCount() {
    return Number(scalar("SELECT COUNT(*) AS n FROM users WHERE is_admin = 1")) || 0;
}

module.exports = {
    init,
    close,
    get conn() {
        return conn();
    },
    queryAll,
    queryGet,
    run,
    scalar,
    tx,
    getSettings,
    getSetting,
    setSettings,
    userPoints,
    adminCount,
    paths,
};
