// ================================
// 星月小窝 —— 公共导航栏 & 页脚
// 所有子页面共用（Live2D / 插画 / 周边 / 动态 / 关于三页）
// ================================
//
// 使用方法（在每个子页面里）：
//   1. 在 <body> 里放两个占位：
//        <div id="site-header"></div>
//        <div id="site-footer"></div>
//   2. 在引入本脚本前，定义当前页面标识（用于隐藏"自己"的入口）：
//        <script>const PAGE = "chahua";</script>
//        <script src="assets/js/common.js"></script>
//   以后想改导航栏或页脚，只需要改这一个文件！

(function () {
    const page = typeof PAGE !== "undefined" ? PAGE : "";

    // 子页面菜单（按钮集中在中间；当前所在页面的按钮不显示）
    const PAGES = [
        { id: "live2d", name: "Live2D", href: "live2d.html" },
        { id: "chahua", name: "插画", href: "chahua.html" },
        { id: "zhoubian", name: "周边", href: "zhoubian.html" },
        { id: "dongtai", name: "动态", href: "dongtai.html" },
    ];

    // "关于"下拉里的角色页
    const ABOUT = [
        { id: "xingyao", name: "星瑶", href: "xingyao.html" },
        { id: "yueci", name: "月瓷", href: "yueci.html" },
        { id: "xiaomiao", name: "小喵", href: "xiaomiao.html" },
    ];

    // ---------- 顶部导航栏 ----------

    const menuItems = PAGES
        .filter((p) => p.id !== page)
        .map((p) => '<li><a class="nav-link" href="' + p.href + '">' + p.name + "</a></li>")
        .join("\n                    ");

    const aboutItems = ABOUT
        .filter((p) => p.id !== page)
        .map((p) => '<li><a href="' + p.href + '">' + p.name + "</a></li>")
        .join("\n                            ");

    document.getElementById("site-header").innerHTML = `
        <header>
            <nav>
                <a class="logo" href="index.html">星月</a>

                <ul class="nav-menu">
                    ${menuItems}

                    <li class="nav-item dropdown">
                        <a class="nav-link">关于</a>

                        <ul class="dropdown-menu">
                            ${aboutItems}
                        </ul>
                    </li>
                </ul>

                <!-- 右侧占位：与左侧 logo 等宽，让菜单真正居中 -->
                <div class="nav-side"></div>
            </nav>
        </header>
    `;

    // ---------- 页脚 ----------

    document.getElementById("site-footer").innerHTML = `
        <footer>
            <div class="footer-content">

                <ul class="footer-menu">
                    <li><a class="footer-link" href="https://space.bilibili.com/1124976899?spm_id_from=333.1007.0.0">联系站长</a></li>
                    <li><a class="footer-link" href="#">友情赞助</a></li>
                    <li><a class="footer-link" href="https://www.bilibili.com/video/BV1GJ411x7h7/?spm_id_from=333.337.search-card.all.click&vd_source=710e320d34b83c8454c441692f5eee47">不要点！</a></li>
                </ul>

                <div class="footer-bottom">
                    网页所有版权归属于 ©小星月喵
                </div>
            </div>
        </footer>
    `;
})();
