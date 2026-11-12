// ================================
// 建议网页 · 通用小工具（lib/util.js）
// JSON 响应、请求体读取、错误类型、文件保存、校验函数
// ================================

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// ---------- 业务错误 ----------

class ApiError extends Error {
    constructor(status, code, message) {
        super(message);
        this.name = "ApiError";
        this.status = status;
        this.code = code;
    }
}

const errors = {
    badRequest(message) {
        return new ApiError(400, "VALIDATION", message || "参数不正确");
    },
    unauthorized(message) {
        return new ApiError(401, "UNAUTHORIZED", message || "请先登录");
    },
    forbidden(message) {
        return new ApiError(403, "FORBIDDEN", message || "没有权限");
    },
    notFound(message) {
        return new ApiError(404, "NOT_FOUND", message || "数据不存在");
    },
    conflict(code, message) {
        return new ApiError(409, code || "CONFLICT", message || "数据冲突");
    },
    rateLimited(message) {
        return new ApiError(429, "RATE_LIMITED", message || "操作太频繁，请稍后再试");
    },
    server(message) {
        return new ApiError(500, "SERVER", message || "服务器内部错误");
    },
};

// ---------- 响应 ----------

function json(res, status, data) {
    const body = JSON.stringify(data === undefined ? null : data);
    res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
    });
    res.end(body);
}

function ok(res, data) {
    json(res, 200, data);
}

function fail(res, err) {
    const e = err instanceof ApiError ? err : errors.server(err && err.message);
    if (!(err instanceof ApiError)) {
        console.error("[500]", err);
    }
    json(res, e.status, { error: { code: e.code, message: e.message } });
}

// ---------- 请求体 ----------

function readBody(req, limit) {
    const max = limit || 1024 * 1024;
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        let done = false;

        req.on("data", (chunk) => {
            if (done) {
                return;
            }
            size += chunk.length;
            if (size > max) {
                done = true;
                reject(new ApiError(413, "TOO_LARGE", "上传内容太大（上限 " + Math.round(max / 1024 / 1024) + "MB）"));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });

        req.on("end", () => {
            if (!done) {
                resolve(Buffer.concat(chunks));
            }
        });

        req.on("error", (e) => {
            if (!done) {
                reject(e);
            }
        });
    });
}

async function readJson(req, limit) {
    const buf = await readBody(req, limit || 1024 * 1024);
    if (buf.length === 0) {
        return {};
    }
    let data;
    try {
        data = JSON.parse(buf.toString("utf8"));
    } catch (e) {
        throw errors.badRequest("请求内容不是合法的 JSON");
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) {
        throw errors.badRequest("请求内容格式不对");
    }
    return data;
}

// ---------- 文件发送 ----------

const MIME = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".mp3": "audio/mpeg",
    ".m4a": "audio/mp4",
    ".wav": "audio/wav",
    ".mp4": "video/mp4",
    ".zip": "application/zip",
    ".rar": "application/vnd.rar",
    ".7z": "application/x-7z-compressed",
    ".pdf": "application/pdf",
    ".txt": "text/plain; charset=utf-8",
};

function contentTypeOf(file) {
    return MIME[path.extname(file).toLowerCase()] || "application/octet-stream";
}

function contentDisposition(filename) {
    const name = String(filename || "download").replace(/[\r\n"]/g, "_");
    const ascii = name.replace(/[^\x20-\x7E]/g, "_");
    return 'attachment; filename="' + ascii + '"; filename*=UTF-8\'\'' + encodeURIComponent(name);
}

function sendFile(res, filePath, options) {
    const opt = options || {};
    let stat;
    try {
        stat = fs.statSync(filePath);
    } catch (e) {
        json(res, 404, { error: { code: "NOT_FOUND", message: "文件不存在" } });
        return;
    }
    if (!stat.isFile()) {
        json(res, 404, { error: { code: "NOT_FOUND", message: "文件不存在" } });
        return;
    }

    const headers = {
        "Content-Type": opt.contentType || contentTypeOf(filePath),
        "Content-Length": stat.size,
        "Cache-Control": opt.cache || "no-store",
        "X-Content-Type-Options": "nosniff",
    };
    if (opt.download) {
        headers["Content-Disposition"] = contentDisposition(opt.filename || path.basename(filePath));
    }
    res.writeHead(200, headers);
    if (opt.headOnly) {
        res.end();
        return;
    }
    fs.createReadStream(filePath).pipe(res);
}

// ---------- 目录 / 文件名 ----------

function ensureDir(dir) {
    fs.mkdirSync(dir, { recursive: true });
}

function randomName(ext) {
    return Date.now().toString(36) + "-" + crypto.randomBytes(8).toString("hex") + (ext || "");
}

// 防止路径穿越：确认 target 在 root 里面
function isInside(root, target) {
    const r = path.resolve(root);
    const t = path.resolve(target);
    return t === r || t.startsWith(r + path.sep);
}

// ---------- 上传内容解析 ----------

const IMAGE_MIMES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
};

const FILE_MIMES = {
    "application/zip": ".zip",
    "application/pdf": ".pdf",
    "audio/mpeg": ".mp3",
    "audio/mp4": ".m4a",
    "audio/x-m4a": ".m4a",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "video/mp4": ".mp4",
    "application/vnd.rar": ".rar",
    "application/x-7z-compressed": ".7z",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
};

// dataURL 或裸 base64 → Buffer；mime 以声明值为准，声明不合法就报错
function decodeUpload(data, mime, maxBytes) {
    if (typeof data !== "string" || !data) {
        throw errors.badRequest("没有收到文件内容");
    }

    let base64 = data;
    let realMime = String(mime || "").toLowerCase();

    const match = data.match(/^data:([^;,]+)?;base64,(.*)$/s);
    if (match) {
        realMime = String(match[1] || realMime).toLowerCase();
        base64 = match[2];
    }

    let buf;
    try {
        buf = Buffer.from(base64, "base64");
    } catch (e) {
        throw errors.badRequest("文件内容不是合法的 Base64");
    }
    if (!buf || buf.length === 0) {
        throw errors.badRequest("文件内容是空的");
    }
    if (buf.length > maxBytes) {
        throw new ApiError(413, "TOO_LARGE", "文件太大（上限 " + Math.round(maxBytes / 1024 / 1024) + "MB）");
    }

    return { buffer: buf, mime: realMime };
}

function saveBuffer(buffer, dir, ext) {
    ensureDir(dir);
    const name = randomName(ext);
    fs.writeFileSync(path.join(dir, name), buffer);
    return name;
}

// ---------- 校验 ----------

function isEmail(value) {
    const s = String(value || "").trim();
    return s.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
}

function isPassword(value) {
    const s = String(value || "");
    return s.length >= 8 && s.length <= 64 && /[A-Za-z]/.test(s) && /[0-9]/.test(s);
}

function isUsername(value) {
    return /^[A-Za-z0-9_]{3,20}$/.test(String(value || ""));
}

function textLength(value) {
    return Array.from(String(value || "")).length;
}

function intInRange(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) {
        return fallback;
    }
    const i = Math.trunc(n);
    if (i < min || i > max) {
        return fallback;
    }
    return i;
}

// ---------- 杂项 ----------

function nowISO() {
    return new Date().toISOString();
}

function sha256(text) {
    return crypto.createHash("sha256").update(String(text)).digest("hex");
}

function randomCode() {
    return String(crypto.randomInt(100000, 1000000));
}

function parseQuery(searchParams) {
    const limit = intInRange(searchParams.get("limit"), 1, 100, 50);
    const offset = intInRange(searchParams.get("offset"), 0, 1000000, 0);
    return { limit, offset };
}

function localDayRange() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { startISO: start.toISOString(), endISO: end.toISOString() };
}

module.exports = {
    ApiError,
    errors,
    json,
    ok,
    fail,
    readBody,
    readJson,
    sendFile,
    contentTypeOf,
    contentDisposition,
    ensureDir,
    isInside,
    decodeUpload,
    saveBuffer,
    randomName,
    IMAGE_MIMES,
    FILE_MIMES,
    isEmail,
    isPassword,
    isUsername,
    textLength,
    intInRange,
    nowISO,
    sha256,
    randomCode,
    parseQuery,
    localDayRange,
};
