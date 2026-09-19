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
    url: "",     // 例：https://abcdefghijklmn.supabase.co
    anonKey: "", // 例：eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
};
