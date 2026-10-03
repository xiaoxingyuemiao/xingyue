// ================================
// 使用说明页：左侧文档目录（assets/js/live2d-guide.js）
//
// 做什么：
//   1. 右边正文滚到哪，左边对应的目录条目就高亮到哪（滚动监听，rAF 节流）
//   2. 高亮条目所在的折叠层自动展开（一级是 <details> 分组，二级是带子目录的条目）
//   3. 给「带子目录的二级条目」生成折叠按钮（按钮由本脚本创建，见下面的 foldParents）
//   4. 手机端点「文档目录」开合侧栏，点完条目自动收起
//   5. 点条目立刻高亮（配合 css 里的 scroll-behavior: smooth 平滑滚过去）
//
// 没有 JS 也能用：目录条目本身就是锚点链接，一级分组的折叠是 <details> 的原生行为；
// 二级条目在没有折叠按钮时子目录全部展开，不影响阅读与跳转。
//
// ⚠️ 这里按 id 取的两个元素（gd-side / gd-nav-toggle）必须在 live2d-guide.html 里存在 ——
//    tools/check.js 会把脚本里按 id 取的元素跟该页面的 id 逐个比对，少一个就报错。
//    （注释里也别写「querySelector + 井号 id」那样的字面量，检查脚本连注释一起搜。）
//    按钮一律按 id 取：不要用 querySelector 顺着容器找（踩坑记录 #01）。
// ================================

(function () {
    "use strict";

    const side = document.querySelector("#gd-side");
    const toggle = document.querySelector("#gd-nav-toggle");

    if (!side) {
        return;
    }

    // 目录条目 → 正文里对应的小节（href="#id"）
    const items = Array.from(side.querySelectorAll("a.gd-link"))
        .map((link) => {
            const id = (link.getAttribute("href") || "").replace(/^#/, "");
            const section = id ? document.getElementById(id) : null;
            return section ? { link: link, section: section } : null;
        })
        .filter(Boolean)
        // 按小节在文档里的先后排一遍：滚动判断靠「最后一个越过视线的条目」
        .sort(
            (a, b) =>
                a.section.getBoundingClientRect().top - b.section.getBoundingClientRect().top
        );

    const MOBILE = "(max-width: 900px)";

    // ---------- 带子目录的二级条目：生成折叠按钮 ----------
    // HTML 里不写这些按钮：没有 JS 时子目录照常全部显示，只是不能折叠。
    // 按钮的点击不会走到下面的「点条目」逻辑 —— 那里只认 a.gd-link。
    const foldParents = Array.from(side.querySelectorAll(".gd-item")).filter((li) => {
        const sub = li.querySelector(".gd-sublist");
        return sub && sub.parentElement === li;
    });

    for (const li of foldParents) {
        const link = li.querySelector("a.gd-link");
        const fold = document.createElement("button");

        fold.type = "button";
        fold.className = "gd-fold";
        fold.setAttribute("aria-expanded", "true");
        fold.setAttribute(
            "aria-label",
            "展开或收起" + (link ? "「" + link.textContent.trim() + "」" : "") + "的子目录"
        );

        fold.addEventListener("click", () => {
            const collapsed = li.classList.toggle("gd-collapsed");
            setFoldState(li, !collapsed);
        });

        li.classList.add("gd-has-sub");
        li.insertBefore(fold, li.firstChild);
    }

    // 点了目录之后，平滑滚动期间不要再让「按滚动位置高亮」抢走高亮，
    // 否则高亮会在途经的小节之间闪一下（实测：点完立刻读到的可能是中间那节）。
    const CLICK_LOCK_MS = 700;

    let current = null;
    let ticking = false;
    let lockUntil = 0;
    let lockTimer = 0;

    // ---------- 高亮 ----------

    // 把某个条目所在的折叠层全部展开：
    //   一级分组 = <details>；二级条目 = 带 .gd-collapsed 的 <li>
    function expandFolded(link) {
        for (let node = link.parentElement; node && node !== side; node = node.parentElement) {
            if (node.tagName === "DETAILS" && !node.open) {
                node.open = true;
            }

            if (node.classList && node.classList.contains("gd-collapsed")) {
                node.classList.remove("gd-collapsed");
                setFoldState(node, true);
            }
        }
    }

    // 同步二级条目折叠按钮的展开状态
    function setFoldState(li, expanded) {
        const fold = li.querySelector(".gd-fold");

        if (fold) {
            fold.setAttribute("aria-expanded", expanded ? "true" : "false");
        }
    }

    function markActive(item) {
        if (current === item) {
            return;
        }

        if (current) {
            current.link.classList.remove("active");
        }

        current = item;

        if (!current) {
            return;
        }

        current.link.classList.add("active");

        // 高亮的那条藏在收起的折叠层里 → 逐层展开
        expandFolded(current.link);

        keepVisible(current.link);
    }

    // 让高亮条目在目录自己的滚动区里可见（只滚目录，不滚整个页面）
    function keepVisible(link) {
        const box = side.getBoundingClientRect();
        const rect = link.getBoundingClientRect();

        if (rect.top < box.top + 8) {
            side.scrollTop -= box.top + 8 - rect.top;
        } else if (rect.bottom > box.bottom - 8) {
            side.scrollTop += rect.bottom - (box.bottom - 8);
        }
    }

    function updateActive() {
        ticking = false;

        // 刚点过目录：这段时间以「点的那个」为准，等滚动停下来再交还给滚动监听
        if (Date.now() < lockUntil) {
            // 锁一过期补算一次，免得「最后一次滚动事件正好被锁挡住」之后再也不更新
            if (!lockTimer) {
                lockTimer = window.setTimeout(() => {
                    lockTimer = 0;
                    onScroll();
                }, lockUntil - Date.now() + 30);
            }
            return;
        }

        // 视口上方 30% 处那条「视线」：最后一个越过它的小节就是当前小节
        const line = window.innerHeight * 0.3;
        let found = null;

        for (const item of items) {
            if (item.section.getBoundingClientRect().top <= line) {
                found = item;
            } else {
                break; // 小节本来就是按文档顺序排的
            }
        }

        // 滚到底时最后几节可能太短、越不过视线 → 直接亮最后一个
        const atBottom =
            window.innerHeight + window.scrollY >= document.body.scrollHeight - 4;

        if (found || atBottom) {
            markActive(atBottom && items.length > 0 ? items[items.length - 1] : found);
        }
    }

    function onScroll() {
        if (ticking) {
            return;
        }

        ticking = true;
        window.requestAnimationFrame(updateActive);
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    // ---------- 点目录条目 ----------

    side.addEventListener("click", (event) => {
        const link = event.target.closest ? event.target.closest("a.gd-link") : null;

        if (!link) {
            return;
        }

        // 立刻高亮，并且压住「按滚动位置高亮」一小会儿，
        // 免得平滑滚动途经的小节把高亮抢过去闪一下
        const hit = items.filter((item) => item.link === link)[0];

        if (hit) {
            lockUntil = Date.now() + CLICK_LOCK_MS;
            markActive(hit);
        }

        // 点的是带子目录的条目 → 把它自己的子目录展开，方便接着往下点
        const parentItem = link.parentElement;

        if (parentItem && parentItem.classList.contains("gd-collapsed")) {
            parentItem.classList.remove("gd-collapsed");
            setFoldState(parentItem, true);
        }

        // 手机端点完就把目录收起来，好腾出屏幕看正文
        if (window.matchMedia(MOBILE).matches) {
            setOpen(false);
        }
    });

    // ---------- 手机端开合 ----------

    function setOpen(open) {
        side.classList.toggle("gd-open", open);

        if (toggle) {
            toggle.setAttribute("aria-expanded", open ? "true" : "false");
        }
    }

    if (toggle) {
        toggle.addEventListener("click", () => {
            setOpen(!side.classList.contains("gd-open"));
        });
    }

    // ---------- 起手 ----------

    window.addEventListener("load", updateActive);
    updateActive();
})();
