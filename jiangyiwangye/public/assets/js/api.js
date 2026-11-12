// ================================
// 建议网页 · 前端统一接口封装（public/assets/js/api.js）
// 所有页面共用：token 管理、JSON 请求、文件上传、虚拟奖品下载
// 依赖：无（原生 fetch）；暴露：window.API
// 接口文档：见仓库根目录 jiangyiwangye/API.md
// ================================

window.API = (function () {
    const TOKEN_KEY = "xingyue_jiangyi_token";
    const BASE = ""; // 与页面同源；以后主站接入时改成后端公网地址

    // ---------- token ----------

    function getToken() {
        try {
            return localStorage.getItem(TOKEN_KEY) || "";
        } catch (e) {
            return "";
        }
    }

    function setToken(token) {
        try {
            if (token) {
                localStorage.setItem(TOKEN_KEY, token);
            } else {
                localStorage.removeItem(TOKEN_KEY);
            }
        } catch (e) {
            console.warn("保存登录状态失败", e);
        }
    }

    function clearToken() {
        setToken(null);
    }

    function isLoggedIn() {
        return !!getToken();
    }

    // 统一的“登录失效”事件：页面监听 API.onUnauthorized(fn) 即可
    const unauthorizedHandlers = [];

    function onUnauthorized(fn) {
        unauthorizedHandlers.push(fn);
    }

    function emitUnauthorized() {
        for (const fn of unauthorizedHandlers) {
            try {
                fn();
            } catch (e) {
                console.warn("登录失效回调出错", e);
            }
        }
    }

    // ---------- 请求 ----------

    async function request(path, options) {
        const opt = options || {};
        const method = opt.method || "GET";
        const headers = Object.assign({}, opt.headers || {});
        const token = getToken();
        if (token) {
            headers["Authorization"] = "Bearer " + token;
        }
        let body;
        if (opt.body !== undefined && opt.body !== null) {
            headers["Content-Type"] = "application/json";
            body = JSON.stringify(opt.body);
        }

        const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
        const timer = controller
            ? setTimeout(() => controller.abort(), opt.timeout || 20000)
            : null;

        let res;
        try {
            res = await fetch(BASE + path, {
                method: method,
                headers: headers,
                body: body,
                signal: controller ? controller.signal : undefined,
            });
        } catch (e) {
            if (timer) {
                clearTimeout(timer);
            }
            const err = new Error(
                e && e.name === "AbortError"
                    ? "请求超时：请确认后台窗口还开着、没有卡住"
                    : "连不上后台服务：请确认「启动建议网页.bat」的窗口还开着"
            );
            err.code = e && e.name === "AbortError" ? "TIMEOUT" : "NETWORK";
            throw err;
        }

        let text = "";
        try {
            text = await res.text();
        } catch (e) {
            text = "";
        } finally {
            if (timer) {
                clearTimeout(timer);
            }
        }

        let data = null;
        if (text) {
            try {
                data = JSON.parse(text);
            } catch (e) {
                data = null;
            }
        }

        if (!res.ok) {
            if (res.status === 401) {
                clearToken();
                emitUnauthorized();
            }
            const message =
                (data && data.error && data.error.message) ||
                (res.status === 404 ? "接口不存在（后台版本可能太旧）" : "请求失败（HTTP " + res.status + "）");
            const err = new Error(message);
            err.status = res.status;
            err.code = (data && data.error && data.error.code) || "HTTP_" + res.status;
            err.data = data;
            throw err;
        }

        return data;
    }

    // ---------- 小工具 ----------

    function formatTime(iso) {
        if (!iso) {
            return "";
        }
        const d = new Date(iso);
        if (isNaN(d.getTime())) {
            return String(iso);
        }
        const pad = (n) => String(n).padStart(2, "0");
        return (
            d.getFullYear() +
            "-" +
            pad(d.getMonth() + 1) +
            "-" +
            pad(d.getDate()) +
            " " +
            pad(d.getHours()) +
            ":" +
            pad(d.getMinutes())
        );
    }

    function escapeHtml(text) {
        return String(text === null || text === undefined ? "" : text).replace(/[&<>"']/g, (ch) => {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
        });
    }

    // File → dataURL（上传头像 / 封面 / 配图用）
    function fileToDataURL(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error("读取文件失败"));
            reader.readAsDataURL(file);
        });
    }

    // 带登录态下载二进制文件（虚拟奖品）
    async function downloadFile(path, fallbackName) {
        const token = getToken();
        let res;
        try {
            res = await fetch(BASE + path, {
                headers: token ? { Authorization: "Bearer " + token } : {},
            });
        } catch (e) {
            throw new Error("下载失败：连不上后台服务");
        }
        if (!res.ok) {
            let message = "下载失败（HTTP " + res.status + "）";
            try {
                const data = await res.json();
                message = (data && data.error && data.error.message) || message;
            } catch (e) {
                /* 响应不是 JSON，保留默认提示 */
            }
            throw new Error(message);
        }
        const blob = await res.blob();
        const disposition = res.headers.get("Content-Disposition") || "";
        let name = fallbackName || "download";
        const match = disposition.match(/filename\*=UTF-8''([^;]+)/i) || disposition.match(/filename="?([^";]+)"?/i);
        if (match) {
            try {
                name = decodeURIComponent(match[1]);
            } catch (e) {
                name = match[1];
            }
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
    }

    // ---------- 登录 / 账号 ----------

    const auth = {
        sendCode(email, purpose) {
            return request("/api/auth/send-code", {
                method: "POST",
                body: { email: email, purpose: purpose || "register" },
            });
        },

        async register(data) {
            const res = await request("/api/auth/register", { method: "POST", body: data });
            if (res && res.token) {
                setToken(res.token);
            }
            return res;
        },

        async loginCode(email, code) {
            const res = await request("/api/auth/login-code", {
                method: "POST",
                body: { email: email, code: code },
            });
            if (res && res.token) {
                setToken(res.token);
            }
            return res;
        },

        async loginPassword(account, password) {
            const res = await request("/api/auth/login-password", {
                method: "POST",
                body: { account: account, password: password },
            });
            if (res && res.token) {
                setToken(res.token);
            }
            return res;
        },

        me() {
            return request("/api/auth/me");
        },

        async logout() {
            try {
                if (isLoggedIn()) {
                    await request("/api/auth/logout", { method: "POST" });
                }
            } catch (e) {
                /* 本地退出即可，不阻塞 */
            }
            clearToken();
        },

        setPassword(password) {
            return request("/api/auth/set-password", { method: "POST", body: { password: password } });
        },

        updateProfile(data) {
            return request("/api/auth/me", { method: "PATCH", body: data });
        },
    };

    // ---------- 公开信息 ----------

    const site = {
        get() {
            return request("/api/site");
        },
        prizes() {
            return request("/api/prizes");
        },
        leaderboard() {
            return request("/api/leaderboard");
        },
    };

    // ---------- 登录用户的建议 / 积分 / 兑换 ----------

    const me = {
        points(params) {
            const q = params || {};
            return request("/api/me/points?limit=" + (q.limit || 50) + "&offset=" + (q.offset || 0));
        },
        submissions(params) {
            const q = params || {};
            return request("/api/me/submissions?limit=" + (q.limit || 50) + "&offset=" + (q.offset || 0));
        },
        orders(params) {
            const q = params || {};
            return request("/api/me/orders?limit=" + (q.limit || 50) + "&offset=" + (q.offset || 0));
        },
        submit(data) {
            return request("/api/submissions", { method: "POST", body: data });
        },
        redeem(data) {
            return request("/api/orders", { method: "POST", body: data });
        },
        downloadOrder(order) {
            const prizeName = (order && order.prize && order.prize.name) || "奖品文件";
            return downloadFile("/api/orders/" + order.id + "/file", prizeName);
        },
    };

    // ---------- 管理员 ----------

    const admin = {
        status() {
            return request("/api/admin/status");
        },
        async setup(data) {
            const res = await request("/api/admin/setup", { method: "POST", body: data });
            if (res && res.token) {
                setToken(res.token);
            }
            return res;
        },
        overview() {
            return request("/api/admin/overview");
        },
        submissions(params) {
            const q = params || {};
            return request(
                "/api/admin/submissions?status=" +
                    encodeURIComponent(q.status || "") +
                    "&q=" +
                    encodeURIComponent(q.q || "") +
                    "&limit=" +
                    (q.limit || 50) +
                    "&offset=" +
                    (q.offset || 0)
            );
        },
        review(id, data) {
            return request("/api/admin/submissions/" + id + "/review", { method: "POST", body: data });
        },
        removeSubmission(id) {
            return request("/api/admin/submissions/" + id, { method: "DELETE" });
        },
        prizes() {
            return request("/api/admin/prizes");
        },
        createPrize(data) {
            return request("/api/admin/prizes", { method: "POST", body: data });
        },
        updatePrize(id, data) {
            return request("/api/admin/prizes/" + id, { method: "PATCH", body: data });
        },
        deletePrize(id) {
            return request("/api/admin/prizes/" + id, { method: "DELETE" });
        },
        // 上传文件：file 为 <input type=file> 拿到的那一个文件对象
        async upload(file) {
            const dataUrl = await fileToDataURL(file);
            return request("/api/admin/upload", {
                method: "POST",
                timeout: 60000,
                body: {
                    filename: file.name,
                    mime: file.type || "application/octet-stream",
                    data: dataUrl,
                },
            });
        },
        orders(params) {
            const q = params || {};
            return request(
                "/api/admin/orders?status=" +
                    encodeURIComponent(q.status || "") +
                    "&q=" +
                    encodeURIComponent(q.q || "") +
                    "&limit=" +
                    (q.limit || 50) +
                    "&offset=" +
                    (q.offset || 0)
            );
        },
        orderAction(id, data) {
            return request("/api/admin/orders/" + id + "/action", { method: "POST", body: data });
        },
        downloadOrderFile(order) {
            const prizeName = (order && order.prize && order.prize.name) || "奖品文件";
            return downloadFile("/api/orders/" + order.id + "/file", prizeName);
        },
        users(params) {
            const q = params || {};
            return request(
                "/api/admin/users?q=" + encodeURIComponent(q.q || "") + "&limit=" + (q.limit || 50) + "&offset=" + (q.offset || 0)
            );
        },
        adjustPoints(id, data) {
            return request("/api/admin/users/" + id + "/adjust-points", { method: "POST", body: data });
        },
        resetPassword(id, data) {
            return request("/api/admin/users/" + id + "/reset-password", { method: "POST", body: data });
        },
        settings() {
            return request("/api/admin/settings");
        },
        saveSettings(data) {
            return request("/api/admin/settings", { method: "PUT", body: data });
        },
        exportData() {
            return request("/api/admin/export");
        },
    };

    // ---------- 对外暴露 ----------

    return {
        getToken: getToken,
        setToken: setToken,
        clearToken: clearToken,
        isLoggedIn: isLoggedIn,
        onUnauthorized: onUnauthorized,
        request: request,
        formatTime: formatTime,
        escapeHtml: escapeHtml,
        fileToDataURL: fileToDataURL,
        downloadFile: downloadFile,
        auth: auth,
        site: site,
        me: me,
        admin: admin,
    };
})();
