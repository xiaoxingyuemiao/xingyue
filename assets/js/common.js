// ================================
// 星月小窝 —— 公共导航栏 & 页脚
// 关于页（星瑶 / 月瓷 / 小喵）共用
// ================================
//
// 使用方法（在每个关于页里）：
//   1. 在 <body> 里放两个占位：
//        <div id="site-header"></div>
//        <div id="site-footer"></div>
//   2. 在引入本脚本前，定义当前页面（用于高亮"关于"菜单）：
//        <script>const PAGE = "xingyao";</script>
//        <script src="assets/js/common.js"></script>
//   以后想改导航栏或页脚，只需要改这一个文件！

(function () {
    const page = typeof PAGE !== "undefined" ? PAGE : "";

    // ---------- 顶部导航栏（只保留：插画 / 周边 / 动态 / 关于） ----------

    document.getElementById("site-header").innerHTML = `
        <header>
            <nav>
                <a class="logo" href="index.html">星月</a>

                <ul class="nav-menu">
                    <li><a class="nav-link" href="chahua.html">插画</a></li>
                    <li><a class="nav-link" href="zhoubian.html">周边</a></li>
                    <li><a class="nav-link" href="dongtai.html">动态</a></li>

                    <li class="nav-item dropdown">
                        <a class="nav-link">关于</a>

                        <ul class="dropdown-menu">
                            <li><a href="xingyao.html" data-page="xingyao">星瑶</a></li>
                            <li><a href="yueci.html" data-page="yueci">月瓷</a></li>
                            <li><a href="xiaomiao.html" data-page="xiaomiao">小喵</a></li>
                        </ul>
                    </li>
                </ul>
            </nav>
        </header>
    `;

    // 高亮"关于"菜单里当前的角色
    const activeLink = document.querySelector('.dropdown-menu a[data-page="' + page + '"]');
    if (activeLink) {
        activeLink.classList.add("active");
    }

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
