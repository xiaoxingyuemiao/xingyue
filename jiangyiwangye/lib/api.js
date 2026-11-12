// ================================
// 建议网页 · 所有 /api 接口（lib/api.js）
// 路由 + 业务逻辑；接口文档见 jiangyiwangye/API.md
// ================================

const path = require("path");
const fs = require("fs");
const config = require("./config");
const db = require("./db");
const auth = require("./auth");
const mail = require("./mail");
const util = require("./util");

const paths = config.dataPaths();
const UPLOADS_BASE = path.dirname(paths.uploadPublicDir); // shujuku-1/uploads
const HANDLED = Symbol("response-handled");

const CATEGORIES = ["旋律", "歌词", "编曲", "演唱", "整体感受", "其他"];
const SUGGESTION_MAX_IMAGE = 8 * 1024 * 1024;

// ---------- 通用小工具 ----------

function pointsOf(userId) {
    return db.userPoints(userId);
}

function userPayload(row, points) {
    if (!row) {
        return null;
    }
    const p = points === undefined ? (row.points !== undefined ? Number(row.points) : pointsOf(row.id)) : points;
    return {
        id: Number(row.id),
        email: row.email,
        username: row.username || null,
        displayName: row.display_name,
        isAdmin: !!row.is_admin,
        status: row.status,
        createdAt: row.created_at,
        points: Number(p) || 0,
    };
}

function getUserById(id) {
    return db.queryGet("SELECT * FROM users WHERE id = ?", [id]);
}

function prizePayload(row, includePrivate) {
    if (!row) {
        return null;
    }
    const data = {
        id: Number(row.id),
        name: row.name,
        description: row.description,
        kind: row.kind,
        cost: Number(row.cost),
        stock: Number(row.stock),
        image: row.image || "",
        hasFile: !!(row.file_path && row.file_path.length > 0),
        active: !!row.active,
        sort: Number(row.sort),
        createdAt: row.created_at,
    };
    if (includePrivate) {
        data.filePath = row.file_path || "";
        data.fileName = row.file_name || "";
        data.updatedAt = row.updated_at;
    }
    return data;
}

function getPrizeById(id) {
    return db.queryGet("SELECT * FROM prizes WHERE id = ?", [id]);
}

function submissionPayload(row) {
    if (!row) {
        return null;
    }
    return {
        id: Number(row.id),
        title: row.title,
        category: row.category,
        content: row.content,
        image: row.image || "",
        status: row.status,
        basePoints: Number(row.base_points),
        bonusPoints: Number(row.bonus_points),
        adminNote: row.admin_note || "",
        createdAt: row.created_at,
        reviewedAt: row.reviewed_at || null,
        user: {
            id: Number(row.user_id),
            displayName: row.display_name || "用户" + row.user_id,
            email: row.email || undefined,
        },
    };
}

const ORDER_SELECT =
    "SELECT o.*, p.kind AS prize_kind, p.image AS prize_image, p.file_path AS prize_file_path, " +
    "p.file_name AS prize_file_name, p.name AS prize_name_db";

function orderPayload(row) {
    if (!row) {
        return null;
    }
    const canDownload =
        row.prize_kind === "digital" && row.status !== "cancelled" && !!(row.prize_file_path && row.prize_file_path.length > 0);
    return {
        id: Number(row.id),
        prizeId: Number(row.prize_id),
        prize: {
            id: Number(row.prize_id),
            name: row.prize_name_db || row.prize_name,
            kind: row.prize_kind || "physical",
            image: row.prize_image || "",
        },
        cost: Number(row.cost),
        status: row.status,
        address: row.address || "",
        contact: row.contact || "",
        note: row.note || "",
        trackingNo: row.tracking_no || "",
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        canDownload: canDownload,
        user:
            row.user_display_name !== undefined
                ? { id: Number(row.user_id), displayName: row.user_display_name, email: row.user_email }
                : undefined,
    };
}

function getOrderById(id) {
    return db.queryGet(ORDER_SELECT + " FROM orders o JOIN prizes p ON p.id = o.prize_id WHERE o.id = ?", [id]);
}

function getSubmissionById(id) {
    return db.queryGet(
        "SELECT s.*, u.display_name, u.email FROM suggestions s JOIN users u ON u.id = s.user_id WHERE s.id = ?",
        [id]
    );
}

function addPoints(userId, delta, type, note, refType, refId) {
    const value = Number(delta) || 0;
    if (value === 0) {
        return;
    }
    db.run(
        "INSERT INTO point_ledger (user_id, delta, type, note, ref_type, ref_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [userId, value, type, note || "", refType || null, refId || null, util.nowISO()]
    );
}

function settingsNumber(key, fallback) {
    const value = Number(db.getSetting(key, ""));
    return Number.isFinite(value) ? Math.trunc(value) : fallback;
}

function parseId(value) {
    const n = Number(value);
    if (!Number.isInteger(n) || n <= 0) {
        throw util.errors.badRequest("编号不正确");
    }
    return n;
}

// 必填文本：去首尾空格 + 长度校验
function requiredText(value, label, min, max) {
    const s = String(value === undefined || value === null ? "" : value).trim();
    const len = util.textLength(s);
    if (len < min) {
        throw util.errors.badRequest((label || "内容") + "至少 " + min + " 个字");
    }
    if (len > max) {
        throw util.errors.badRequest((label || "内容") + "最多 " + max + " 个字");
    }
    return s;
}

function optionalText(value, label, max) {
    const s = String(value === undefined || value === null ? "" : value).trim();
    if (util.textLength(s) > max) {
        throw util.errors.badRequest((label || "内容") + "最多 " + max + " 个字");
    }
    return s;
}

function requireInt(value, label, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < min || n > max) {
        throw util.errors.badRequest(label + "必须是 " + min + " ~ " + max + " 之间的整数");
    }
    return n;
}

// ---------- 路由表 ----------

const routes = [];

function route(method, pattern, opts, handler) {
    routes.push({ method, pattern: new RegExp("^" + pattern + "$"), opts: opts || {}, handler });
}

function GET(pattern, opts, handler) {
    route("GET", pattern, opts, handler);
}

function POST(pattern, opts, handler) {
    route("POST", pattern, opts, handler);
}

function PATCH(pattern, opts, handler) {
    route("PATCH", pattern, opts, handler);
}

function PUT(pattern, opts, handler) {
    route("PUT", pattern, opts, handler);
}

function DELETE(pattern, opts, handler) {
    route("DELETE", pattern, opts, handler);
}

// ---------- 公开接口 ----------

GET("/api/site", {}, () => {
    const s = db.getSettings();
    const prizes = db.queryAll("SELECT * FROM prizes WHERE active = 1 ORDER BY sort ASC, id ASC").map((row) => prizePayload(row));
    return {
        siteTitle: s.site_title,
        siteSubtitle: s.site_subtitle,
        song: {
            title: s.song_title,
            artist: s.song_artist,
            url: s.song_url,
            intro: s.song_intro,
            cover: s.song_cover,
        },
        announcement: s.announcement,
        rules: {
            base: settingsNumber("points_base", 5),
            bonus: settingsNumber("points_bonus", 50),
            dailyLimit: settingsNumber("submit_daily_limit", 3),
        },
        rulesText: s.rules_text,
        shopIntro: s.shop_intro,
        stats: {
            users: Number(db.scalar("SELECT COUNT(*) AS n FROM users WHERE is_admin = 0 AND status = 'active'")) || 0,
            suggestions: Number(db.scalar("SELECT COUNT(*) AS n FROM suggestions")) || 0,
            adopted: Number(db.scalar("SELECT COUNT(*) AS n FROM suggestions WHERE status = 'approved'")) || 0,
            pointsGiven: Number(db.scalar("SELECT COALESCE(SUM(delta), 0) AS n FROM point_ledger WHERE delta > 0")) || 0,
        },
        prizes: prizes,
    };
});

GET("/api/prizes", {}, () => {
    const prizes = db.queryAll("SELECT * FROM prizes WHERE active = 1 ORDER BY sort ASC, id ASC").map((row) => prizePayload(row));
    return { prizes: prizes };
});

GET("/api/leaderboard", {}, () => {
    const rows = db.queryAll(
        "SELECT u.id, u.display_name, COALESCE(SUM(l.delta), 0) AS points, " +
            "(SELECT COUNT(*) FROM suggestions s WHERE s.user_id = u.id AND s.status = 'approved') AS adopted " +
            "FROM users u LEFT JOIN point_ledger l ON l.user_id = u.id " +
            "WHERE u.is_admin = 0 AND u.status = 'active' " +
            "GROUP BY u.id HAVING COALESCE(SUM(l.delta), 0) > 0 " +
            "ORDER BY points DESC, u.id ASC LIMIT 10"
    );
    return {
        items: rows.map((row) => ({
            id: Number(row.id),
            displayName: row.display_name,
            points: Number(row.points) || 0,
            adopted: Number(row.adopted) || 0,
        })),
    };
});

// ---------- 登录注册 ----------

POST("/api/auth/send-code", { bodyLimit: 64 * 1024 }, (ctx) => {
    const email = String(ctx.body.email || "").trim().toLowerCase();
    const purpose = ctx.body.purpose === "login" ? "login" : "register";
    if (!util.isEmail(email)) {
        throw util.errors.badRequest("邮箱格式不正确，请检查");
    }

    const exists = db.queryGet("SELECT id FROM users WHERE email = ?", [email]);
    if (purpose === "register" && exists) {
        throw util.errors.conflict("EMAIL_TAKEN", "这个邮箱已经注册过了，直接登录吧");
    }
    if (purpose === "login" && !exists) {
        throw util.errors.badRequest("这个邮箱还没有注册过，先去注册一个吧");
    }

    const code = auth.issueCode(email, purpose, ctx.ip);
    const result = mail.sendCode(email, code, purpose) || {};
    return { ok: true, devCode: result.devCode, cooldown: 60 };
});

POST("/api/auth/register", { bodyLimit: 64 * 1024 }, (ctx) => {
    const email = String(ctx.body.email || "").trim().toLowerCase();
    const code = String(ctx.body.code || "").trim();
    if (!util.isEmail(email)) {
        throw util.errors.badRequest("邮箱格式不正确，请检查");
    }
    if (!/^\d{4,10}$/.test(code)) {
        throw util.errors.badRequest("请输入验证码");
    }

    const rawName = String(ctx.body.displayName || "").trim();
    let displayName = rawName;
    if (!displayName) {
        displayName = email.split("@")[0].slice(0, 20);
    }
    if (util.textLength(displayName) < 1 || util.textLength(displayName) > 20) {
        throw util.errors.badRequest("昵称需要 1~20 个字");
    }

    let username = String(ctx.body.username || "").trim();
    if (username) {
        if (!util.isUsername(username)) {
            throw util.errors.badRequest("用户名要 3~20 位，只能是字母、数字、下划线");
        }
    } else {
        username = "";
    }

    if (db.queryGet("SELECT id FROM users WHERE email = ?", [email])) {
        throw util.errors.conflict("EMAIL_TAKEN", "这个邮箱已经注册过了，直接登录吧");
    }
    if (username && db.queryGet("SELECT id FROM users WHERE username = ?", [username])) {
        throw util.errors.conflict("USERNAME_TAKEN", "这个用户名已经被用了，换一个吧");
    }

    auth.verifyCode(email, "register", code);

    const now = util.nowISO();
    let userId;
    db.tx(() => {
        const result = db.run(
            "INSERT INTO users (email, username, display_name, password_hash, is_admin, status, created_at, last_login_at) VALUES (?, ?, ?, NULL, 0, 'active', ?, ?)",
            [email, username || null, displayName, now, now]
        );
        userId = Number(result.lastInsertRowid);
    });

    const token = auth.createSession(userId, ctx.req);
    return { token: token, user: userPayload(getUserById(userId)) };
});

POST("/api/auth/login-code", { bodyLimit: 64 * 1024 }, (ctx) => {
    const email = String(ctx.body.email || "").trim().toLowerCase();
    const code = String(ctx.body.code || "").trim();
    if (!util.isEmail(email)) {
        throw util.errors.badRequest("邮箱格式不正确");
    }
    if (!/^\d{4,10}$/.test(code)) {
        throw util.errors.badRequest("请输入验证码");
    }

    const user = db.queryGet("SELECT * FROM users WHERE email = ?", [email]);
    if (!user) {
        throw util.errors.badRequest("这个邮箱还没有注册过，先去注册一个吧");
    }
    if (user.status !== "active") {
        throw util.errors.forbidden("账号已被禁用，请联系站长");
    }

    auth.verifyCode(email, "login", code);
    db.run("UPDATE users SET last_login_at = ? WHERE id = ?", [util.nowISO(), user.id]);
    const token = auth.createSession(user.id, ctx.req);
    return { token: token, user: userPayload(getUserById(user.id)) };
});

POST("/api/auth/login-password", { bodyLimit: 64 * 1024 }, (ctx) => {
    const account = String(ctx.body.account || "").trim();
    const password = String(ctx.body.password || "");
    if (!account || !password) {
        throw util.errors.badRequest("请填写账号和密码");
    }

    let user = null;
    if (account.indexOf("@") >= 0) {
        user = db.queryGet("SELECT * FROM users WHERE email = ?", [account.toLowerCase()]);
    } else {
        user = db.queryGet("SELECT * FROM users WHERE username = ?", [account]);
    }

    if (!user) {
        throw util.errors.badRequest("邮箱/用户名或密码不正确");
    }
    if (!user.password_hash) {
        throw util.errors.badRequest("这个账号还没设置密码，请用邮箱验证码登录，登录后在「账号设置」里设一个密码");
    }
    if (!auth.verifyPassword(password, user.password_hash)) {
        throw util.errors.badRequest("邮箱/用户名或密码不正确");
    }
    if (user.status !== "active") {
        throw util.errors.forbidden("账号已被禁用，请联系站长");
    }

    db.run("UPDATE users SET last_login_at = ? WHERE id = ?", [util.nowISO(), user.id]);
    const token = auth.createSession(user.id, ctx.req);
    return { token: token, user: userPayload(getUserById(user.id)) };
});

GET("/api/auth/me", { auth: true }, (ctx) => {
    return { user: userPayload(ctx.user) };
});

POST("/api/auth/logout", { auth: true, bodyLimit: 8 * 1024 }, (ctx) => {
    auth.deleteSession(ctx.req);
    return { ok: true };
});

POST("/api/auth/set-password", { auth: true, bodyLimit: 64 * 1024 }, (ctx) => {
    const password = String(ctx.body.password || "");
    if (!util.isPassword(password)) {
        throw util.errors.badRequest("密码至少 8 位，并且要同时包含字母和数字");
    }
    db.run("UPDATE users SET password_hash = ? WHERE id = ?", [auth.hashPassword(password), ctx.user.id]);
    return { ok: true };
});

PATCH("/api/auth/me", { auth: true, bodyLimit: 64 * 1024 }, (ctx) => {
    const fields = [];
    const params = [];

    if (ctx.body.displayName !== undefined) {
        const name = requiredText(ctx.body.displayName, "昵称", 1, 20);
        fields.push("display_name = ?");
        params.push(name);
    }

    if (ctx.body.username !== undefined) {
        const username = String(ctx.body.username || "").trim();
        if (username) {
            if (!util.isUsername(username)) {
                throw util.errors.badRequest("用户名要 3~20 位，只能是字母、数字、下划线");
            }
            const taken = db.queryGet("SELECT id FROM users WHERE username = ? AND id <> ?", [username, ctx.user.id]);
            if (taken) {
                throw util.errors.conflict("USERNAME_TAKEN", "这个用户名已经被用了，换一个吧");
            }
            fields.push("username = ?");
            params.push(username);
        }
    }

    if (fields.length > 0) {
        params.push(ctx.user.id);
        db.run("UPDATE users SET " + fields.join(", ") + " WHERE id = ?", params);
    }

    return { user: userPayload(getUserById(ctx.user.id)) };
});

// ---------- 我的：积分 / 建议 / 兑换 ----------

GET("/api/me/points", { auth: true }, (ctx) => {
    const { limit, offset } = util.parseQuery(ctx.query);
    const total = Number(db.scalar("SELECT COUNT(*) AS n FROM point_ledger WHERE user_id = ?", [ctx.user.id]));
    const rows = db.queryAll("SELECT * FROM point_ledger WHERE user_id = ? ORDER BY id DESC LIMIT ? OFFSET ?", [
        ctx.user.id,
        limit,
        offset,
    ]);
    return {
        balance: pointsOf(ctx.user.id),
        total: total,
        entries: rows.map((row) => ({
            id: Number(row.id),
            delta: Number(row.delta),
            type: row.type,
            note: row.note,
            createdAt: row.created_at,
        })),
    };
});

GET("/api/me/submissions", { auth: true }, (ctx) => {
    const { limit, offset } = util.parseQuery(ctx.query);
    const total = Number(db.scalar("SELECT COUNT(*) AS n FROM suggestions WHERE user_id = ?", [ctx.user.id]));
    const rows = db.queryAll(
        "SELECT s.*, u.display_name, u.email FROM suggestions s JOIN users u ON u.id = s.user_id WHERE s.user_id = ? ORDER BY s.id DESC LIMIT ? OFFSET ?",
        [ctx.user.id, limit, offset]
    );
    return { items: rows.map((row) => submissionPayload(row)), total: total };
});

GET("/api/me/orders", { auth: true }, (ctx) => {
    const { limit, offset } = util.parseQuery(ctx.query);
    const total = Number(db.scalar("SELECT COUNT(*) AS n FROM orders WHERE user_id = ?", [ctx.user.id]));
    const rows = db.queryAll(
        ORDER_SELECT + " FROM orders o JOIN prizes p ON p.id = o.prize_id WHERE o.user_id = ? ORDER BY o.id DESC LIMIT ? OFFSET ?",
        [ctx.user.id, limit, offset]
    );
    return { items: rows.map((row) => orderPayload(row)), total: total };
});

POST("/api/submissions", { auth: true, bodyLimit: 12 * 1024 * 1024 }, (ctx) => {
    const title = requiredText(ctx.body.title, "标题", 2, 60);
    const content = requiredText(ctx.body.content, "建议内容", 20, 2000);
    const category = String(ctx.body.category || "其他").trim();
    if (CATEGORIES.indexOf(category) < 0) {
        throw util.errors.badRequest("分类不对，只能选：" + CATEGORIES.join(" / "));
    }

    // 每日上限
    const { startISO, endISO } = util.localDayRange();
    const todayCount = Number(
        db.scalar("SELECT COUNT(*) AS n FROM suggestions WHERE user_id = ? AND created_at >= ? AND created_at < ?", [
            ctx.user.id,
            startISO,
            endISO,
        ])
    );
    const dailyLimit = settingsNumber("submit_daily_limit", 3);
    if (todayCount >= dailyLimit) {
        throw util.errors.rateLimited("今天已经提交 " + todayCount + " 条建议啦（每天最多 " + dailyLimit + " 条），明天再来吧");
    }

    // 可选配图
    let image = "";
    if (ctx.body.image) {
        const decoded = util.decodeUpload(ctx.body.image, "", SUGGESTION_MAX_IMAGE);
        const ext = util.IMAGE_MIMES[decoded.mime];
        if (!ext) {
            throw util.errors.badRequest("配图只支持 jpg / png / webp / gif");
        }
        const name = util.saveBuffer(decoded.buffer, paths.uploadPublicDir, ext);
        image = "/uploads/public/" + name;
    }

    const basePoints = settingsNumber("points_base", 5);
    let submissionId = 0;
    const now = util.nowISO();

    db.tx(() => {
        const result = db.run(
            "INSERT INTO suggestions (user_id, title, category, content, image, status, base_points, bonus_points, admin_note, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?, 0, '', ?)",
            [ctx.user.id, title, category, content, image, basePoints, now]
        );
        submissionId = Number(result.lastInsertRowid);
        addPoints(ctx.user.id, basePoints, "submit_base", "提交建议", "suggestion", submissionId);
    });

    return {
        submission: submissionPayload(getSubmissionById(submissionId)),
        pointsAwarded: basePoints,
        balance: pointsOf(ctx.user.id),
    };
});

POST("/api/orders", { auth: true, bodyLimit: 64 * 1024 }, (ctx) => {
    const prizeId = parseId(ctx.body.prizeId);
    const prize = getPrizeById(prizeId);
    if (!prize) {
        throw util.errors.notFound("奖品不存在");
    }
    if (!prize.active) {
        throw util.errors.badRequest("这个奖品已经下架了");
    }
    if (prize.kind !== "physical" && prize.kind !== "digital") {
        throw util.errors.badRequest("奖品类型不正确");
    }
    if (Number(prize.stock) <= 0) {
        throw util.errors.conflict("OUT_OF_STOCK", "这个奖品已经被兑完了");
    }
    if (prize.kind === "digital" && !prize.file_path) {
        throw util.errors.conflict("PRIZE_FILE_MISSING", "这个虚拟奖品还没上传文件，请联系站长");
    }

    const address = optionalText(ctx.body.address, "收货地址", 200);
    const contact = optionalText(ctx.body.contact, "联系方式", 100);
    const note = optionalText(ctx.body.note, "备注", 200);

    if (prize.kind === "physical") {
        if (util.textLength(address) < 5) {
            throw util.errors.badRequest("请填写完整的收货地址（至少 5 个字）");
        }
        if (util.textLength(contact) < 2) {
            throw util.errors.badRequest("请填写联系方式（微信 / QQ / 手机号）");
        }
    }

    const cost = Number(prize.cost) || 0;
    const balance = pointsOf(ctx.user.id);
    if (balance < cost) {
        throw new util.ApiError(400, "INSUFFICIENT_POINTS", "积分不够，还差 " + (cost - balance) + " 分");
    }

    const status = prize.kind === "digital" ? "fulfilled" : "pending";
    const now = util.nowISO();
    let orderId = 0;

    db.tx(() => {
        const stockResult = db.run("UPDATE prizes SET stock = stock - 1, updated_at = ? WHERE id = ? AND stock > 0", [
            now,
            prize.id,
        ]);
        if (Number(stockResult.changes) === 0) {
            throw util.errors.conflict("OUT_OF_STOCK", "这个奖品刚刚被抢光了");
        }
        addPoints(ctx.user.id, -cost, "redeem", "兑换奖品：" + prize.name, "prize", prize.id);
        const result = db.run(
            "INSERT INTO orders (user_id, prize_id, prize_name, cost, status, address, contact, note, tracking_no, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?)",
            [
                ctx.user.id,
                prize.id,
                prize.name,
                cost,
                status,
                prize.kind === "physical" ? address : "",
                prize.kind === "physical" ? contact : "",
                note,
                now,
                now,
            ]
        );
        orderId = Number(result.lastInsertRowid);
    });

    return { order: orderPayload(getOrderById(orderId)), balance: pointsOf(ctx.user.id) };
});

GET("/api/orders/(\\d+)/file", { auth: true }, (ctx, match) => {
    const order = getOrderById(parseId(match[1]));
    if (!order) {
        throw util.errors.notFound("订单不存在");
    }
    if (Number(order.user_id) !== Number(ctx.user.id) && !ctx.user.is_admin) {
        throw util.errors.forbidden("这不是你的订单");
    }
    if (order.status === "cancelled") {
        throw util.errors.badRequest("订单已取消，不能下载");
    }
    if (order.prize_kind !== "digital" || !order.prize_file_path) {
        throw util.errors.badRequest("这个订单没有可下载的文件");
    }

    const fullPath = path.join(UPLOADS_BASE, order.prize_file_path);
    if (!util.isInside(UPLOADS_BASE, fullPath) || !fs.existsSync(fullPath)) {
        throw util.errors.notFound("文件不存在，请联系站长");
    }

    util.sendFile(ctx.res, fullPath, {
        download: true,
        filename: order.prize_file_name || String(order.prize_name_db || "奖品") + path.extname(fullPath),
    });
    return HANDLED;
});

// ---------- 管理员：初始化 / 概览 ----------

GET("/api/admin/status", {}, () => {
    return { needsSetup: db.adminCount() === 0 };
});

POST("/api/admin/setup", { bodyLimit: 64 * 1024 }, (ctx) => {
    if (db.adminCount() > 0) {
        throw util.errors.forbidden("管理员已经创建过了，请直接登录");
    }

    // 安全：默认只允许本机创建管理员，防止局域网 / 公网上被人抢先注册
    const cfg = config.get();
    const ip = String(ctx.ip || "");
    const isLoopback = ip === "127.0.0.1" || ip === "::1" || ip.indexOf("::ffff:127.") === 0;
    if (!cfg.allowRemoteSetup && !isLoopback) {
        throw util.errors.forbidden(
            "为了安全，管理员账号只能在本机（127.0.0.1）创建；确实需要远程初始化，请把 config.local.json 里的 allowRemoteSetup 临时改成 true，创建完再改回 false"
        );
    }

    const email = String(ctx.body.email || "").trim().toLowerCase();
    const username = String(ctx.body.username || "").trim();
    const password = String(ctx.body.password || "");
    const displayName = String(ctx.body.displayName || "站长").trim() || "站长";

    if (!util.isEmail(email)) {
        throw util.errors.badRequest("管理员邮箱格式不正确");
    }
    if (!util.isPassword(password)) {
        throw util.errors.badRequest("密码至少 8 位，并且要同时包含字母和数字");
    }
    if (username && !util.isUsername(username)) {
        throw util.errors.badRequest("用户名要 3~20 位，只能是字母、数字、下划线");
    }
    if (util.textLength(displayName) < 1 || util.textLength(displayName) > 20) {
        throw util.errors.badRequest("昵称需要 1~20 个字");
    }
    if (db.queryGet("SELECT id FROM users WHERE email = ?", [email])) {
        throw util.errors.conflict("EMAIL_TAKEN", "这个邮箱已经被用了");
    }
    if (username && db.queryGet("SELECT id FROM users WHERE username = ?", [username])) {
        throw util.errors.conflict("USERNAME_TAKEN", "这个用户名已经被用了");
    }

    const now = util.nowISO();
    let userId = 0;
    db.tx(() => {
        const result = db.run(
            "INSERT INTO users (email, username, display_name, password_hash, is_admin, status, created_at, last_login_at) VALUES (?, ?, ?, ?, 1, 'active', ?, ?)",
            [email, username || null, displayName, auth.hashPassword(password), now, now]
        );
        userId = Number(result.lastInsertRowid);
    });

    const token = auth.createSession(userId, ctx.req);
    return { token: token, user: userPayload(getUserById(userId)) };
});

GET("/api/admin/overview", { admin: true }, () => {
    const stats = {
        users: Number(db.scalar("SELECT COUNT(*) AS n FROM users")) || 0,
        suggestions: Number(db.scalar("SELECT COUNT(*) AS n FROM suggestions")) || 0,
        pending: Number(db.scalar("SELECT COUNT(*) AS n FROM suggestions WHERE status = 'pending'")) || 0,
        adopted: Number(db.scalar("SELECT COUNT(*) AS n FROM suggestions WHERE status = 'approved'")) || 0,
        pointsGiven: Number(db.scalar("SELECT COALESCE(SUM(delta), 0) AS n FROM point_ledger WHERE delta > 0")) || 0,
        orders: Number(db.scalar("SELECT COUNT(*) AS n FROM orders")) || 0,
        pendingOrders: Number(db.scalar("SELECT COUNT(*) AS n FROM orders WHERE status = 'pending'")) || 0,
    };

    const recentSubmissions = db
        .queryAll(
            "SELECT s.*, u.display_name, u.email FROM suggestions s JOIN users u ON u.id = s.user_id ORDER BY s.id DESC LIMIT 5"
        )
        .map((row) => submissionPayload(row));

    const recentOrders = db
        .queryAll(
            ORDER_SELECT +
                ", u.display_name AS user_display_name, u.email AS user_email FROM orders o JOIN prizes p ON p.id = o.prize_id JOIN users u ON u.id = o.user_id ORDER BY o.id DESC LIMIT 5"
        )
        .map((row) => orderPayload(row));

    return { stats: stats, recentSubmissions: recentSubmissions, recentOrders: recentOrders };
});

// ---------- 管理员：建议审核 ----------

GET("/api/admin/submissions", { admin: true }, (ctx) => {
    const { limit, offset } = util.parseQuery(ctx.query);
    const status = String(ctx.query.get("status") || "").trim();
    const q = String(ctx.query.get("q") || "").trim();

    const where = [];
    const params = [];
    if (status) {
        if (["pending", "approved", "rejected"].indexOf(status) < 0) {
            throw util.errors.badRequest("状态筛选不对");
        }
        where.push("s.status = ?");
        params.push(status);
    }
    if (q) {
        where.push("(s.title LIKE ? OR s.content LIKE ? OR u.display_name LIKE ? OR u.email LIKE ?)");
        const like = "%" + q + "%";
        params.push(like, like, like, like);
    }
    const whereSql = where.length > 0 ? " WHERE " + where.join(" AND ") : "";

    const total = Number(
        db.scalar("SELECT COUNT(*) AS n FROM suggestions s JOIN users u ON u.id = s.user_id" + whereSql, params)
    );
    const rows = db.queryAll(
        "SELECT s.*, u.display_name, u.email FROM suggestions s JOIN users u ON u.id = s.user_id" +
            whereSql +
            " ORDER BY s.id DESC LIMIT ? OFFSET ?",
        params.concat([limit, offset])
    );
    return { items: rows.map((row) => submissionPayload(row)), total: total };
});

POST("/api/admin/submissions/(\\d+)/review", { admin: true, bodyLimit: 64 * 1024 }, (ctx, match) => {
    const id = parseId(match[1]);
    const row = db.queryGet("SELECT * FROM suggestions WHERE id = ?", [id]);
    if (!row) {
        throw util.errors.notFound("建议不存在");
    }

    const action = String(ctx.body.action || "");
    if (action !== "approve" && action !== "reject") {
        throw util.errors.badRequest("操作只能是 approve 或 reject");
    }
    const note = optionalText(ctx.body.note, "管理员备注", 300);

    const defaultBonus = settingsNumber("points_bonus", 50);
    const bonus = action === "approve" ? util.intInRange(ctx.body.bonus, 0, 10000, defaultBonus) : 0;
    const now = util.nowISO();

    db.tx(() => {
        // 之前已经采纳过 → 先撤回上一次的奖励分
        if (row.status === "approved" && Number(row.bonus_points) > 0) {
            addPoints(row.user_id, -Number(row.bonus_points), "revoke", "重新审核，撤回上次采纳奖励", "suggestion", id);
        }

        if (action === "approve") {
            db.run("UPDATE suggestions SET status = 'approved', bonus_points = ?, admin_note = ?, reviewed_at = ? WHERE id = ?", [
                bonus,
                note,
                now,
                id,
            ]);
            addPoints(row.user_id, bonus, "adopt_bonus", "建议被采纳" + (note ? "：" + note : ""), "suggestion", id);
        } else {
            db.run("UPDATE suggestions SET status = 'rejected', bonus_points = 0, admin_note = ?, reviewed_at = ? WHERE id = ?", [
                note,
                now,
                id,
            ]);
        }
    });

    return { submission: submissionPayload(getSubmissionById(id)) };
});

DELETE("/api/admin/submissions/(\\d+)", { admin: true, bodyLimit: 8 * 1024 }, (ctx, match) => {
    const id = parseId(match[1]);
    const row = db.queryGet("SELECT * FROM suggestions WHERE id = ?", [id]);
    if (!row) {
        throw util.errors.notFound("建议不存在");
    }

    const awarded = Number(row.base_points) + Number(row.bonus_points);
    const balance = Math.max(0, pointsOf(row.user_id));
    const deducted = Math.min(awarded, balance);

    db.tx(() => {
        db.run("DELETE FROM suggestions WHERE id = ?", [id]);
        if (deducted > 0) {
            addPoints(row.user_id, -deducted, "revoke", "删除建议，扣回已发积分", "suggestion", id);
        }
    });

    return { ok: true, deducted: deducted };
});

// ---------- 管理员：奖品 ----------

function readPrizeFields(body, existing) {
    const out = {};
    if (body.name !== undefined) {
        out.name = requiredText(body.name, "奖品名称", 1, 50);
    }
    if (body.description !== undefined) {
        out.description = optionalText(body.description, "奖品说明", 1000);
    }
    if (body.kind !== undefined) {
        if (["physical", "digital"].indexOf(body.kind) < 0) {
            throw util.errors.badRequest("奖品类型只能是 physical（实物）或 digital（虚拟）");
        }
        out.kind = body.kind;
    }
    if (body.cost !== undefined) {
        out.cost = requireInt(body.cost, "积分价格", 0, 100000);
    }
    if (body.stock !== undefined) {
        out.stock = requireInt(body.stock, "库存", 0, 100000);
    }
    if (body.image !== undefined) {
        const image = String(body.image || "").trim();
        if (image && image.indexOf("/uploads/public/") !== 0) {
            throw util.errors.badRequest("奖品图片必须是上传接口返回的地址");
        }
        out.image = image;
    }
    if (body.filePath !== undefined) {
        const filePath = String(body.filePath || "").trim();
        if (filePath && !/^private\/[A-Za-z0-9._-]+$/.test(filePath)) {
            throw util.errors.badRequest("文件路径不合法（应使用上传接口返回的 path）");
        }
        out.file_path = filePath;
    }
    if (body.fileName !== undefined) {
        out.file_name = optionalText(body.fileName, "文件名", 200);
    }
    if (body.active !== undefined) {
        out.active = body.active ? 1 : 0;
    }
    if (body.sort !== undefined) {
        out.sort = requireInt(body.sort, "排序", -10000, 10000);
    }

    // 新建时的默认值
    if (!existing) {
        out.name = out.name !== undefined ? out.name : requiredText("", "奖品名称", 1, 50);
        out.description = out.description !== undefined ? out.description : "";
        out.kind = out.kind !== undefined ? out.kind : "physical";
        out.cost = out.cost !== undefined ? out.cost : 0;
        out.stock = out.stock !== undefined ? out.stock : 0;
        out.image = out.image !== undefined ? out.image : "";
        out.file_path = out.file_path !== undefined ? out.file_path : "";
        out.file_name = out.file_name !== undefined ? out.file_name : "";
        out.active = out.active !== undefined ? out.active : 1;
        out.sort = out.sort !== undefined ? out.sort : 0;
    }

    if (out.kind === "digital" && existing && existing.kind !== "digital") {
        // 实物改成虚拟时，必须重新上传文件才能兑换；这里不强制，由兑换接口兜底
    }

    return out;
}

GET("/api/admin/prizes", { admin: true }, () => {
    const prizes = db.queryAll("SELECT * FROM prizes ORDER BY sort ASC, id ASC").map((row) => prizePayload(row, true));
    return { prizes: prizes };
});

POST("/api/admin/prizes", { admin: true, bodyLimit: 64 * 1024 }, (ctx) => {
    const data = readPrizeFields(ctx.body, null);
    const now = util.nowISO();
    const result = db.run(
        "INSERT INTO prizes (name, description, kind, cost, stock, image, file_path, file_name, active, sort, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
            data.name,
            data.description,
            data.kind,
            data.cost,
            data.stock,
            data.image,
            data.file_path,
            data.file_name,
            data.active,
            data.sort,
            now,
            now,
        ]
    );
    return { prize: prizePayload(getPrizeById(Number(result.lastInsertRowid)), true) };
});

PATCH("/api/admin/prizes/(\\d+)", { admin: true, bodyLimit: 64 * 1024 }, (ctx, match) => {
    const id = parseId(match[1]);
    const existing = getPrizeById(id);
    if (!existing) {
        throw util.errors.notFound("奖品不存在");
    }

    const data = readPrizeFields(ctx.body, existing);
    const keys = Object.keys(data);
    if (keys.length === 0) {
        return { prize: prizePayload(existing, true) };
    }
    const sets = keys.map((key) => key + " = ?");
    const params = keys.map((key) => data[key]);
    params.push(util.nowISO(), id);
    db.run("UPDATE prizes SET " + sets.join(", ") + ", updated_at = ? WHERE id = ?", params);
    return { prize: prizePayload(getPrizeById(id), true) };
});

DELETE("/api/admin/prizes/(\\d+)", { admin: true, bodyLimit: 8 * 1024 }, (ctx, match) => {
    const id = parseId(match[1]);
    const existing = getPrizeById(id);
    if (!existing) {
        throw util.errors.notFound("奖品不存在");
    }

    const orderCount = Number(db.scalar("SELECT COUNT(*) AS n FROM orders WHERE prize_id = ?", [id]));
    if (orderCount > 0) {
        db.run("UPDATE prizes SET active = 0, updated_at = ? WHERE id = ?", [util.nowISO(), id]);
        return { ok: true, deactivated: true };
    }

    db.run("DELETE FROM prizes WHERE id = ?", [id]);
    return { ok: true, deactivated: false };
});

// ---------- 管理员：上传 ----------

POST("/api/admin/upload", { admin: true, bodyLimit: 45 * 1024 * 1024 }, (ctx) => {
    const filename = String(ctx.body.filename || "文件").slice(0, 200);
    const declaredMime = String(ctx.body.mime || "").toLowerCase();
    const decoded = util.decodeUpload(ctx.body.data, declaredMime, 30 * 1024 * 1024);

    const imageExt = util.IMAGE_MIMES[decoded.mime];
    if (imageExt) {
        if (decoded.buffer.length > 8 * 1024 * 1024) {
            throw new util.ApiError(413, "TOO_LARGE", "图片最大 8MB");
        }
        const name = util.saveBuffer(decoded.buffer, paths.uploadPublicDir, imageExt);
        return { path: "public/" + name, url: "/uploads/public/" + name, kind: "image" };
    }

    const fileExt = util.FILE_MIMES[decoded.mime];
    if (!fileExt) {
        throw util.errors.badRequest("不支持的文件类型：" + (decoded.mime || "未知") + "（支持图片、zip、pdf、mp3/m4a/wav、mp4）");
    }
    const name = util.saveBuffer(decoded.buffer, paths.uploadPrivateDir, fileExt);
    return { path: "private/" + name, url: null, kind: "file", fileName: filename };
});

// ---------- 管理员：兑换订单 ----------

GET("/api/admin/orders", { admin: true }, (ctx) => {
    const { limit, offset } = util.parseQuery(ctx.query);
    const status = String(ctx.query.get("status") || "").trim();
    const q = String(ctx.query.get("q") || "").trim();

    const where = [];
    const params = [];
    if (status) {
        if (["pending", "fulfilled", "cancelled"].indexOf(status) < 0) {
            throw util.errors.badRequest("状态筛选不对");
        }
        where.push("o.status = ?");
        params.push(status);
    }
    if (q) {
        where.push("(o.prize_name LIKE ? OR u.display_name LIKE ? OR u.email LIKE ? OR u.username LIKE ?)");
        const like = "%" + q + "%";
        params.push(like, like, like, like);
    }
    const whereSql = where.length > 0 ? " WHERE " + where.join(" AND ") : "";

    const total = Number(
        db.scalar(
            "SELECT COUNT(*) AS n FROM orders o JOIN users u ON u.id = o.user_id JOIN prizes p ON p.id = o.prize_id" + whereSql,
            params
        )
    );

    const rows = db.queryAll(
        ORDER_SELECT +
            ", u.display_name AS user_display_name, u.email AS user_email FROM orders o JOIN prizes p ON p.id = o.prize_id JOIN users u ON u.id = o.user_id" +
            whereSql +
            " ORDER BY o.id DESC LIMIT ? OFFSET ?",
        params.concat([limit, offset])
    );

    return { items: rows.map((row) => orderPayload(row)), total: total };
});

POST("/api/admin/orders/(\\d+)/action", { admin: true, bodyLimit: 64 * 1024 }, (ctx, match) => {
    const id = parseId(match[1]);
    const order = getOrderById(id);
    if (!order) {
        throw util.errors.notFound("订单不存在");
    }

    const action = String(ctx.body.action || "");
    const now = util.nowISO();

    if (action === "fulfill") {
        if (order.status !== "pending") {
            throw util.errors.badRequest("只有「待处理」的订单才能标记完成");
        }
        const trackingNo = optionalText(ctx.body.trackingNo, "快递单号", 100);
        db.run("UPDATE orders SET status = 'fulfilled', tracking_no = ?, updated_at = ? WHERE id = ?", [trackingNo, now, id]);
    } else if (action === "cancel") {
        if (order.status === "cancelled") {
            throw util.errors.conflict("订单已经取消过了");
        }
        db.tx(() => {
            db.run("UPDATE orders SET status = 'cancelled', updated_at = ? WHERE id = ?", [now, id]);
            addPoints(order.user_id, Number(order.cost), "refund", "订单取消，退回积分", "order", id);
            db.run("UPDATE prizes SET stock = stock + 1, updated_at = ? WHERE id = ?", [now, order.prize_id]);
        });
    } else {
        throw util.errors.badRequest("操作只能是 fulfill（完成/发货）或 cancel（取消退分）");
    }

    return { order: orderPayload(getOrderById(id)) };
});

// ---------- 管理员：用户与积分 ----------

GET("/api/admin/users", { admin: true }, (ctx) => {
    const { limit, offset } = util.parseQuery(ctx.query);
    const q = String(ctx.query.get("q") || "").trim();

    const where = [];
    const params = [];
    if (q) {
        where.push("(u.email LIKE ? OR u.display_name LIKE ? OR COALESCE(u.username, '') LIKE ?)");
        const like = "%" + q + "%";
        params.push(like, like, like);
    }
    const whereSql = where.length > 0 ? " WHERE " + where.join(" AND ") : "";

    const total = Number(db.scalar("SELECT COUNT(*) AS n FROM users u" + whereSql, params));
    const rows = db.queryAll(
        "SELECT u.*, COALESCE((SELECT SUM(l.delta) FROM point_ledger l WHERE l.user_id = u.id), 0) AS points FROM users u" +
            whereSql +
            " ORDER BY u.id DESC LIMIT ? OFFSET ?",
        params.concat([limit, offset])
    );

    return { items: rows.map((row) => userPayload(row)), total: total };
});

POST("/api/admin/users/(\\d+)/adjust-points", { admin: true, bodyLimit: 64 * 1024 }, (ctx, match) => {
    const id = parseId(match[1]);
    const user = getUserById(id);
    if (!user) {
        throw util.errors.notFound("用户不存在");
    }
    const delta = requireInt(ctx.body.delta, "调整值", -100000, 100000);
    if (delta === 0) {
        throw util.errors.badRequest("调整值不能是 0");
    }
    const note = optionalText(ctx.body.note, "备注", 200) || "管理员调整";

    db.tx(() => {
        addPoints(id, delta, "admin_adjust", note, "user", id);
    });

    return { user: userPayload(getUserById(id)), balance: pointsOf(id) };
});

POST("/api/admin/users/(\\d+)/reset-password", { admin: true, bodyLimit: 64 * 1024 }, (ctx, match) => {
    const id = parseId(match[1]);
    const user = getUserById(id);
    if (!user) {
        throw util.errors.notFound("用户不存在");
    }
    const password = String(ctx.body.password || "");
    if (!util.isPassword(password)) {
        throw util.errors.badRequest("密码至少 8 位，并且要同时包含字母和数字");
    }
    db.run("UPDATE users SET password_hash = ? WHERE id = ?", [auth.hashPassword(password), id]);
    return { ok: true };
});

// ---------- 管理员：网站内容 / 导出 ----------

const SETTING_RULES = {
    site_title: { max: 60 },
    site_subtitle: { max: 80 },
    song_title: { max: 80 },
    song_artist: { max: 60 },
    song_url: { max: 500, http: true },
    song_intro: { max: 2000 },
    song_cover: { max: 300, cover: true },
    announcement: { max: 1000 },
    rules_text: { max: 2000 },
    shop_intro: { max: 1000 },
    points_base: { int: [0, 10000] },
    points_bonus: { int: [0, 10000] },
    submit_daily_limit: { int: [1, 50] },
};

GET("/api/admin/settings", { admin: true }, () => {
    return { settings: db.getSettings() };
});

PUT("/api/admin/settings", { admin: true, bodyLimit: 256 * 1024 }, (ctx) => {
    const updates = {};
    const body = ctx.body || {};

    for (const key of Object.keys(SETTING_RULES)) {
        if (body[key] === undefined) {
            continue;
        }
        const rule = SETTING_RULES[key];
        const raw = body[key];

        if (rule.int) {
            updates[key] = String(requireInt(raw, key, rule.int[0], rule.int[1]));
            continue;
        }

        const value = String(raw === undefined || raw === null ? "" : raw).trim();
        if (util.textLength(value) > rule.max) {
            throw util.errors.badRequest(key + " 最多 " + rule.max + " 个字");
        }
        if (rule.http && value && !/^https?:\/\/\S+$/i.test(value)) {
            throw util.errors.badRequest(key + " 必须是 http(s) 链接");
        }
        if (rule.cover && value && value.indexOf("/uploads/public/") !== 0) {
            throw util.errors.badRequest("封面图必须是上传接口返回的地址");
        }
        updates[key] = value;
    }

    if (Object.keys(updates).length > 0) {
        db.setSettings(updates);
    }
    return { settings: db.getSettings() };
});

GET("/api/admin/export", { admin: true }, () => {
    const users = db.queryAll(
        "SELECT id, email, username, display_name, is_admin, status, created_at, last_login_at FROM users ORDER BY id ASC"
    );
    return {
        exportedAt: util.nowISO(),
        data: {
            users: users,
            suggestions: db.queryAll("SELECT * FROM suggestions ORDER BY id ASC"),
            point_ledger: db.queryAll("SELECT * FROM point_ledger ORDER BY id ASC"),
            prizes: db.queryAll("SELECT * FROM prizes ORDER BY id ASC"),
            orders: db.queryAll("SELECT * FROM orders ORDER BY id ASC"),
            settings: db.getSettings(),
        },
    };
});

// ---------- 路由分发 ----------

async function handle(req, res, url) {
    const pathname = url.pathname;

    for (const item of routes) {
        if (item.method !== req.method) {
            continue;
        }
        const match = pathname.match(item.pattern);
        if (!match) {
            continue;
        }

        const ctx = {
            req: req,
            res: res,
            url: url,
            query: url.searchParams,
            ip: auth.clientIp(req),
            body: {},
            user: null,
        };

        if (item.opts.auth || item.opts.admin) {
            ctx.user = auth.getSessionUser(req);
            if (!ctx.user) {
                throw util.errors.unauthorized();
            }
            if (item.opts.admin && !ctx.user.is_admin) {
                throw util.errors.forbidden("这个操作需要管理员权限");
            }
        }

        if (item.opts.bodyLimit) {
            ctx.body = await util.readJson(req, item.opts.bodyLimit);
        }

        const result = await item.handler(ctx, match);
        if (result === HANDLED || res.writableEnded) {
            return true;
        }
        util.ok(res, result);
        return true;
    }

    return false;
}

module.exports = {
    handle,
    CATEGORIES,
};
