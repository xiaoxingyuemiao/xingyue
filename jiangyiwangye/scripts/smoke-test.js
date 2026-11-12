// ================================
// 建议网页 · 接口冒烟测试（scripts/smoke-test.js）
// 用法：先启动服务（node server.js），再运行 node scripts/smoke-test.js
// 会真的往数据库里写测试数据；只建议在开发/测试库上跑，跑完可删 shujuku-1 重置
// ================================

const BASE = process.env.SMOKE_BASE || "http://127.0.0.1:8787";

let passed = 0;
let failed = 0;

function ok(name, condition, detail) {
    if (condition) {
        passed++;
        console.log("  ✓ " + name);
    } else {
        failed++;
        console.error("  ✗ " + name + (detail ? "  →  " + detail : ""));
    }
}

async function request(method, path, body, token) {
    const headers = {};
    if (body !== undefined) {
        headers["Content-Type"] = "application/json";
    }
    if (token) {
        headers["Authorization"] = "Bearer " + token;
    }
    const res = await fetch(BASE + path, {
        method: method,
        headers: headers,
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let data = null;
    try {
        data = text ? JSON.parse(text) : null;
    } catch (e) {
        data = text;
    }
    return { status: res.status, data: data, res: res };
}

async function main() {
    const stamp = Date.now().toString(36);
    console.log("冒烟测试目标：" + BASE);

    // 1. 站点信息 / 未登录拦截
    const site = await request("GET", "/api/site");
    ok("GET /api/site 返回 200", site.status === 200, "HTTP " + site.status);
    ok("站点标题存在", !!(site.data && site.data.siteTitle));
    ok("默认积分规则存在", !!(site.data && site.data.rules && site.data.rules.base >= 0));

    const anon = await request("GET", "/api/me/points");
    ok("未登录访问我的积分返回 401", anon.status === 401, "HTTP " + anon.status);

    // 静态资源（页面依赖的 css/js 必须能访问到）
    for (const asset of ["/assets/css/base.css", "/assets/css/app.css", "/assets/js/api.js", "/assets/js/app.js"]) {
        const res = await fetch(BASE + asset);
        ok("静态资源可访问 " + asset, res.status === 200, "HTTP " + res.status);
    }

    // 2. 管理员初始化
    const status = await request("GET", "/api/admin/status");
    ok("GET /api/admin/status 返回 needsSetup 布尔", status.status === 200 && typeof status.data.needsSetup === "boolean");

    let adminToken = null;
    if (status.data.needsSetup) {
        const setup = await request("POST", "/api/admin/setup", {
            email: "admin-" + stamp + "@example.com",
            username: "admin_" + stamp,
            password: "test1234",
            displayName: "测试站长",
        });
        ok("创建管理员成功", setup.status === 200 && !!setup.data.token, JSON.stringify(setup.data));
        adminToken = setup.data.token;
    } else {
        console.log("  - 已有管理员，跳过初始化（要跑完整测试请删掉 shujuku-1 重置后再试）");
    }

    // 3. 注册普通用户（开发模式验证码）
    const fanEmail = "fan-" + stamp + "@example.com";
    const codeRes = await request("POST", "/api/auth/send-code", { email: fanEmail, purpose: "register" });
    ok("发送注册验证码", codeRes.status === 200 && !!codeRes.data.devCode, JSON.stringify(codeRes.data));
    const fanCode = codeRes.data && codeRes.data.devCode;

    const reg = await request("POST", "/api/auth/register", {
        email: fanEmail,
        code: fanCode,
        displayName: "测试歌迷",
    });
    ok("注册并拿到 token", reg.status === 200 && !!reg.data.token, JSON.stringify(reg.data));
    const fanToken = reg.data.token;

    const badCode = await request("POST", "/api/auth/send-code", { email: fanEmail, purpose: "register" });
    ok("重复注册邮箱发码被拦", badCode.status === 409 || badCode.status === 400, "HTTP " + badCode.status);

    // 4. 提交建议
    const sub = await request(
        "POST",
        "/api/submissions",
        {
            title: "测试建议：副歌可以更亮",
            category: "编曲",
            content: "这是一条用于冒烟测试的建议正文，长度超过二十个字，应该可以正常提交。",
        },
        fanToken
    );
    ok("提交建议成功", sub.status === 200 && !!sub.data.submission, JSON.stringify(sub.data));
    const basePoints = sub.data && sub.data.pointsAwarded;
    const submissionId = sub.data && sub.data.submission && sub.data.submission.id;

    const points1 = await request("GET", "/api/me/points", undefined, fanToken);
    ok("查询积分流水", points1.status === 200 && Array.isArray(points1.data.entries));
    ok("余额等于基础分", points1.data.balance === basePoints, JSON.stringify(points1.data.balance));

    // 5. 密码登录
    const setPw = await request("POST", "/api/auth/set-password", { password: "fan12345" }, fanToken);
    ok("设置密码成功", setPw.status === 200 && setPw.data.ok === true, JSON.stringify(setPw.data));
    const pwLogin = await request("POST", "/api/auth/login-password", { account: fanEmail, password: "fan12345" });
    ok("密码登录成功", pwLogin.status === 200 && !!pwLogin.data.token, JSON.stringify(pwLogin.data));
    const wrongPw = await request("POST", "/api/auth/login-password", { account: fanEmail, password: "wrong123" });
    ok("错误密码被拒绝", wrongPw.status === 400, "HTTP " + wrongPw.status);

    if (!adminToken) {
        console.log("");
        console.log("通过 " + passed + " 项，失败 " + failed + " 项（无管理员 token，部分跳过）");
        process.exit(failed > 0 ? 1 : 0);
    }

    // 6. 管理员审核（采纳）
    const list = await request("GET", "/api/admin/submissions?status=pending", undefined, adminToken);
    ok("管理员能看到待审建议", list.status === 200 && list.data.items.some((x) => x.id === submissionId));

    const review = await request(
        "POST",
        "/api/admin/submissions/" + submissionId + "/review",
        { action: "approve", bonus: 50, note: "冒烟测试采纳" },
        adminToken
    );
    ok("采纳建议成功", review.status === 200 && review.data.submission.status === "approved", JSON.stringify(review.data));

    const points2 = await request("GET", "/api/me/points", undefined, fanToken);
    ok("采纳奖励到账", points2.data.balance === basePoints + 50, JSON.stringify(points2.data.balance));

    // 7. 驳回 + 删除扣回
    const sub2 = await request(
        "POST",
        "/api/submissions",
        { title: "第二条测试建议", category: "歌词", content: "第二条用于测试驳回和删除流程的建议正文，长度也超过二十个字。" },
        fanToken
    );
    const sub2Id = sub2.data.submission.id;
    ok("提交第二条建议", sub2.status === 200);
    const reject = await request(
        "POST",
        "/api/admin/submissions/" + sub2Id + "/review",
        { action: "reject", note: "测试驳回" },
        adminToken
    );
    ok("驳回建议成功", reject.status === 200 && reject.data.submission.status === "rejected");
    const points3 = await request("GET", "/api/me/points", undefined, fanToken);
    ok("驳回后基础分保留", points3.data.balance === basePoints + 50 + basePoints, JSON.stringify(points3.data.balance));

    const del = await request("DELETE", "/api/admin/submissions/" + sub2Id, undefined, adminToken);
    ok("删除建议成功并扣回基础分", del.status === 200 && del.data.deducted === basePoints, JSON.stringify(del.data));
    const points4 = await request("GET", "/api/me/points", undefined, fanToken);
    ok("删除后余额正确", points4.data.balance === basePoints + 50, JSON.stringify(points4.data.balance));

    // 8. 上传奖品图片 / 虚拟奖品文件
    const imageBase64 =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const imageUpload = await request(
        "POST",
        "/api/admin/upload",
        { filename: "test.png", mime: "image/png", data: "data:image/png;base64," + imageBase64 },
        adminToken
    );
    ok("上传奖品图片", imageUpload.status === 200 && !!imageUpload.data.url, JSON.stringify(imageUpload.data));

    const imageFetch = await fetch(BASE + imageUpload.data.url);
    ok("公开图片能直接访问", imageFetch.status === 200 && imageFetch.headers.get("content-type").indexOf("image/png") === 0);

    const fileBase64 = Buffer.from("hello digital prize file").toString("base64");
    const fileUpload = await request(
        "POST",
        "/api/admin/upload",
        { filename: "测试奖品.pdf", mime: "application/pdf", data: fileBase64 },
        adminToken
    );
    ok("上传虚拟奖品文件", fileUpload.status === 200 && !!fileUpload.data.path, JSON.stringify(fileUpload.data));

    const privateFetch = await fetch(BASE + "/uploads/" + fileUpload.data.path);
    ok("私有文件不能直接访问", privateFetch.status === 403 || privateFetch.status === 404, "HTTP " + privateFetch.status);

    const prize = await request(
        "POST",
        "/api/admin/prizes",
        {
            name: "测试虚拟奖品",
            description: "冒烟测试用，可删",
            kind: "digital",
            cost: 10,
            stock: 2,
            image: imageUpload.data.url,
            filePath: fileUpload.data.path,
            fileName: "测试奖品.pdf",
            sort: 0,
            active: true,
        },
        adminToken
    );
    ok("创建虚拟奖品", prize.status === 200 && !!prize.data.prize, JSON.stringify(prize.data));
    const prizeId = prize.data.prize.id;

    // 9. 用户兑换 + 下载
    const order = await request("POST", "/api/orders", { prizeId: prizeId }, fanToken);
    ok("兑换虚拟奖品", order.status === 200 && order.data.order.canDownload === true, JSON.stringify(order.data));
    const orderId = order.data.order.id;

    const download = await fetch(BASE + "/api/orders/" + orderId + "/file", {
        headers: { Authorization: "Bearer " + fanToken },
    });
    const text = await download.text();
    ok("下载虚拟奖品文件", download.status === 200 && text === "hello digital prize file", "HTTP " + download.status);

    // 10. 实物奖品完整流程（兑换 → 发货 → 取消退分）
    const physical = await request(
        "POST",
        "/api/admin/prizes",
        { name: "测试实物奖品", description: "", kind: "physical", cost: 20, stock: 1, sort: 1, active: true },
        adminToken
    );
    const physicalId = physical.data.prize.id;
    ok("创建实物奖品", physical.status === 200);

    const noAddress = await request("POST", "/api/orders", { prizeId: physicalId }, fanToken);
    ok("实物兑换缺地址被拒绝", noAddress.status === 400, "HTTP " + noAddress.status);

    const physOrder = await request(
        "POST",
        "/api/orders",
        { prizeId: physicalId, address: "浙江省杭州市测试路 1 号", contact: "微信 test123" },
        fanToken
    );
    ok("实物兑换成功（待处理）", physOrder.status === 200 && physOrder.data.order.status === "pending", JSON.stringify(physOrder.data));
    const physOrderId = physOrder.data.order.id;

    const adminOrders = await request("GET", "/api/admin/orders?status=pending", undefined, adminToken);
    const foundOrder = adminOrders.data.items.find((x) => x.id === physOrderId);
    ok("管理员订单列表包含下单人", !!foundOrder && !!foundOrder.user && !!foundOrder.user.displayName);

    const fulfill = await request(
        "POST",
        "/api/admin/orders/" + physOrderId + "/action",
        { action: "fulfill", trackingNo: "SF1234567890" },
        adminToken
    );
    ok("标记发货成功", fulfill.status === 200 && fulfill.data.order.status === "fulfilled");

    const beforeCancel = (await request("GET", "/api/me/points", undefined, fanToken)).data.balance;
    const cancel = await request("POST", "/api/admin/orders/" + physOrderId + "/action", { action: "cancel" }, adminToken);
    ok("取消订单成功", cancel.status === 200 && cancel.data.order.status === "cancelled");
    const afterCancel = (await request("GET", "/api/me/points", undefined, fanToken)).data.balance;
    ok("取消订单退回积分", afterCancel === beforeCancel + 20, JSON.stringify({ beforeCancel, afterCancel }));

    // 11. 网站内容设置
    const setRes = await request(
        "PUT",
        "/api/admin/settings",
        { song_title: "冒烟测试歌曲", points_base: "7", points_bonus: "77" },
        adminToken
    );
    ok("修改网站内容", setRes.status === 200 && setRes.data.settings.song_title === "冒烟测试歌曲");
    const site2 = await request("GET", "/api/site");
    ok("前台读到新歌名", site2.data.song.title === "冒烟测试歌曲");
    ok("前台读到新积分规则", site2.data.rules.base === 7 && site2.data.rules.bonus === 77);

    // 12. 每日提交上限
    const submit3 = await request(
        "POST",
        "/api/submissions",
        { title: "第三条测试建议", category: "其他", content: "第三条用于测试每日上限的建议正文，长度也超过二十个字。" },
        fanToken
    );
    ok("第三条建议提交成功", submit3.status === 200, JSON.stringify(submit3.data));
    const submit4 = await request(
        "POST",
        "/api/submissions",
        { title: "第四条测试建议", category: "其他", content: "第四条用于测试每日上限的建议正文，长度也超过二十个字。" },
        fanToken
    );
    ok("第四条建议提交成功", submit4.status === 200, JSON.stringify(submit4.data));
    const submit5 = await request(
        "POST",
        "/api/submissions",
        { title: "第五条测试建议", category: "其他", content: "第五条应该被每日上限拦住的建议正文，长度也超过二十个字。" },
        fanToken
    );
    ok("超过每日上限被拦住", submit5.status === 429, "HTTP " + submit5.status + " " + JSON.stringify(submit5.data));

    // 13. 管理员导出
    const exportRes = await request("GET", "/api/admin/export", undefined, adminToken);
    ok("管理员导出数据", exportRes.status === 200 && !!exportRes.data.data && Array.isArray(exportRes.data.data.users));

    console.log("");
    console.log("通过 " + passed + " 项，失败 " + failed + " 项");
    process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
    console.error("冒烟测试异常：", e);
    process.exit(1);
});
