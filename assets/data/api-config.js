// ================================
// 后端接口配置（assets/data/api-config.js）
// 全站唯一的后端地址出口：auth.js / cloud.js / login.js 都读这里
// 本地调试：FlyEnv 起的 xingyue-api（php think run -p 8000）
// 上线时改成正式域名（并同步 xingyue-api/.env 的 CORS_ORIGINS）
// ================================

window.XY_API = {
    base: "http://127.0.0.1:8000",
};