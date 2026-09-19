// ================================
// Supabase 配置（邮箱验证码登录）
// ================================
//
// 【怎么填】
// 1. 打开 https://supabase.com → 注册（免费，不用绑卡）→ New project
//    - Region 选「Southeast Asia (Singapore)」或「Northeast Asia (Tokyo)」（离国内近）
// 2. 项目建好后进 Settings → API Keys，复制两个值填到下面：
//    - Project URL      → 填到 url
//    - anon / public key → 填到 anonKey（这个 key 是公开的，放前端没问题）
// 3. 进 Authentication → Email Templates → 「Magic Link」模板，
//    把正文改成包含 {{ .Token }}（否则邮件里只有链接、看不到 6 位验证码）
// 4. 保存后刷新网页即可用邮箱验证码登录
//
// 留空 = 登录功能关闭（点击用户区域会提示未配置，其他功能不受影响）
// ================================

window.SUPABASE_CONFIG = {
    // Project URL：形如 https://abcdefghijklmn.supabase.co
    // （在 Settings → API Keys / Data API 页面能找到）
    url: "",

    // Publishable key（新版名字，等同于旧版的 anon key，可公开）
    // ⚠️ 绝对不要填 Secret key / service_role key（那是管理员钥匙，会泄露全部用户数据）
    anonKey: "sb_publishable_n_uzg4yMYrNkXpyf-34Vhw_J21g7ioI",
};
