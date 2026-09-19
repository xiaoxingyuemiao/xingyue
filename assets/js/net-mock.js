// ================================
// 网络请求拦截（assets/js/net-mock.js）
// 必须在 Live2D SDK 之前加载执行。
//
// 原因：oh-my-live2d 初始化时会请求两个外部接口，国内网络无法访问，
// 请求失败会中断 SDK 初始化（画布尺寸为 0、模型不显示）：
//   1) unpkg.com  —— 检查 SDK 最新版本
//   2) v1.hitokoto.cn —— 一言（欢迎语内容）
// 这里拦截并返回模拟响应，让 SDK 正常初始化。
//
// 以后 SDK 官方支持关闭这两个请求、或换用无需联网的配置时，可以删掉本文件。
// ================================

(function () {
    // 需要拦截的地址 → 模拟响应体
    function mockResp(url) {
        if (url.indexOf("unpkg.com") !== -1) {
            return JSON.stringify({ name: "oh-my-live2d", version: "0.19.3" });
        }
        if (url.indexOf("hitokoto.cn") !== -1) {
            return JSON.stringify({ hitokoto: "欢迎来到星月小窝", from: "星月小窝", from_who: "" });
        }
        return null;
    }

    // 1) 拦截 fetch
    const realFetch = window.fetch;
    window.fetch = function (input, init) {
        const url = typeof input === "string" ? input : (input && input.url) || "";
        const body = mockResp(url);
        if (body !== null) {
            return Promise.resolve(new Response(body, {
                status: 200,
                headers: { "Content-Type": "application/json" },
            }));
        }
        return realFetch.apply(this, arguments);
    };

    // 2) 拦截 XMLHttpRequest（双保险，SDK 内部可能用 XHR）
    const realOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
        const body = typeof url === "string" ? mockResp(url) : null;
        if (body === null) {
            return realOpen.apply(this, arguments);
        }
        const self = this;
        try {
            Object.defineProperty(self, "responseText", { get: () => body });
            Object.defineProperty(self, "response", { get: () => body });
            Object.defineProperty(self, "status", { get: () => 200 });
        } catch (e) {
            // 只读属性定义失败时忽略（走下面的回调即可）
        }
        setTimeout(() => {
            try {
                if (self.onreadystatechange) {
                    self.readyState = 4;
                    self.onreadystatechange.call(self);
                }
                if (self.onload) {
                    self.onload.call(self);
                }
            } catch (e) {
                // 忽略回调异常
            }
        }, 0);
    };
})();
