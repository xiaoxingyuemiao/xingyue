// ================================
// 用户设置页（assets/js/user.js）
// 「基本资料」卡：头像 / 昵称 / 个性签名，保存在浏览器本地，已登录时同步云端；
// 「账号安全」卡（登录后显示）：修改邮箱（当前密码+新邮箱验证码）、
// 修改密码（当前密码+新密码）、退出登录、注销账号；
// 首页侧边栏会自动读取显示；当前登录邮箱显示在卡片顶部
// ================================

const USER_KEY = window.Store.KEYS.user;

const avatarPreview = document.querySelector("#avatar-preview");
const uAvatarPick = document.querySelector("#u-avatar-pick");
const uAvatarReset = document.querySelector("#u-avatar-reset");
const uAvatarFile = document.querySelector("#u-avatar-file");
const uNickname = document.querySelector("#u-nickname");
const uSignature = document.querySelector("#u-signature");
const uSave = document.querySelector("#u-save");
const uStatus = document.querySelector("#u-status");

// 退出登录（卡片最下方）：点一下先在原地问一次，确认后才真的退
const uSignoutArea = document.querySelector("#u-signout-area");
const uSignout = document.querySelector("#u-signout");
const uSignoutConfirm = document.querySelector("#u-signout-confirm");
const uSignoutYes = document.querySelector("#u-signout-yes");
const uSignoutNo = document.querySelector("#u-signout-no");

// 注销账号（危险操作）
const uDangerArea = document.querySelector("#u-danger-area");
const uDelete = document.querySelector("#u-delete");
const uDeleteConfirm = document.querySelector("#u-delete-confirm");
const uDeleteYes = document.querySelector("#u-delete-yes");
const uDeleteNo = document.querySelector("#u-delete-no");

// 账号安全卡片（改邮箱 / 改密码；整卡仅登录后可见）
const uSecurityArea = document.querySelector("#u-security-area");
const uEmailText = document.querySelector("#u-email-text");

const uEmailToggle = document.querySelector("#u-email-toggle");
const uEmailForm = document.querySelector("#u-email-form");
const uEmailNew = document.querySelector("#u-email-new");
const uEmailCode = document.querySelector("#u-email-code");
const uEmailSend = document.querySelector("#u-email-send");
const uEmailPassword = document.querySelector("#u-email-password");
const uEmailSubmit = document.querySelector("#u-email-submit");
const uEmailCancel = document.querySelector("#u-email-cancel");
const uEmailStatus = document.querySelector("#u-email-status");

const uPwdToggle = document.querySelector("#u-pwd-toggle");
const uPwdForm = document.querySelector("#u-pwd-form");
const uPwdOld = document.querySelector("#u-pwd-old");
const uPwdNew = document.querySelector("#u-pwd-new");
const uPwdNew2 = document.querySelector("#u-pwd-new2");
const uPwdSave = document.querySelector("#u-pwd-save");
const uPwdCancel = document.querySelector("#u-pwd-cancel");
const uPwdStatus = document.querySelector("#u-pwd-status");

const DEFAULT_AVATAR = "🐱"; // 默认头像：没上传过图片时用它
const AVATAR_SIZE = 128; // 上传的图片会居中裁成正方形并缩到这个尺寸再保存

// 已保存的头像 + 本次新选的头像（DataURL 或 emoji）
let savedAvatar = DEFAULT_AVATAR;
let pickedAvatar = "";

// 头像可能是 emoji 文字，也可能是上传的图片（DataURL），这里统一渲染。
// 遇到既不是图片、又长得不像 emoji 的异常值（例如被当文本渲染的一长串数据），
// 一律回退默认头像，避免显示出乱码
//
// ⚠️ 函数名带 User 前缀：main.js 里也有一个 renderAvatar（首页侧边栏用）。
// 两个文件现在不同页加载，但顶层 function 声明是全局的，同页引入会互相覆盖（见 docs/08 §4.2）
function renderUserAvatar(el, avatar) {
    const value = String(avatar || "");

    if (value.indexOf("data:image") === 0) {
        el.textContent = "";
        el.style.backgroundImage = "url(" + value + ")";
        el.style.backgroundSize = "cover";
        el.style.backgroundPosition = "center";
        return;
    }

    el.style.backgroundImage = "";
    el.textContent = (value && Array.from(value).length <= 4) ? value : DEFAULT_AVATAR;
}

function renderAvatarPreview() {
    renderUserAvatar(avatarPreview, pickedAvatar || savedAvatar);
}

// 「账号安全」整卡（含改邮箱/改密码/退出/注销）只在登录后出现，收起各表单回到初始状态
function renderAccount() {
    const user = window.Auth && window.Auth.current ? window.Auth.current() : null;

    if (uSecurityArea) {
        uSecurityArea.hidden = !user;
    }
    if (uEmailText) {
        uEmailText.textContent = user ? user.email : "—";
    }
    if (!user) {
        closeEmailForm();
        closePwdForm();
    }

    if (uSignoutArea) {
        uSignoutArea.hidden = !user;
        uSignout.hidden = false;
        uSignoutConfirm.hidden = true;
    }

    // 「注销账号」同理：未登录就不该出现（否则点了只会提示登录状态已失效）
    if (uDangerArea) {
        uDangerArea.hidden = !user;
        uDelete.hidden = false;
        uDeleteConfirm.hidden = true;
    }
}

// 点「退出登录」→ 先在原地问一次（不用浏览器原生弹窗）
uSignout.addEventListener("click", () => {
    uSignout.hidden = true;
    uSignoutConfirm.hidden = false;
});

// 取消 → 把确认收回去
uSignoutNo.addEventListener("click", () => {
    uSignoutConfirm.hidden = true;
    uSignout.hidden = false;
});

// 确定 → 真的退出，然后回到第一次进来那个登录页（第一张卡）
uSignoutYes.addEventListener("click", async () => {
    await window.Auth.signOut();

    // 清掉"已经进过首页"的标记：这样回到 index.html 时会重新显示登录页
    localStorage.removeItem(window.Store.KEYS.visited);

    window.location.href = "index.html";
});

// 昵称最多 12 个字符（汉字、字母、数字都算 1 个）；个性签名不限长度
const NICKNAME_MAX = 12;

// 按「字符」截断：用 Array.from 而不是 slice，免得把 emoji 这种字符切成两半
function cutNickname(text) {
    return Array.from(String(text || "")).slice(0, NICKNAME_MAX).join("");
}

// 中文输入法在拼字过程中会绕过 maxlength，所以输入结束后再强制截断一次，
// 并把结果写回输入框（所见即所存）
function limitNicknameInput() {
    const cut = cutNickname(uNickname.value);
    if (cut !== uNickname.value) {
        uNickname.value = cut;
        uStatus.textContent = "昵称最多 " + NICKNAME_MAX + " 个字符，超出的部分已自动去掉";
    }
}

uNickname.addEventListener("input", (event) => {
    if (event.isComposing) {
        return; // 输入法还在拼字，先别动它，等 compositionend
    }
    limitNicknameInput();
});
uNickname.addEventListener("compositionend", limitNicknameInput);
uNickname.addEventListener("blur", limitNicknameInput);

// ---------- 上传头像 ----------

// 把选中的图片居中裁成正方形并缩放，返回 DataURL
// （缩到 128×128 是为了让 localStorage 放得下，原图可能好几 MB）
function shrinkImage(file) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();

        img.onload = () => {
            try {
                const side = Math.min(img.width, img.height);
                const sx = (img.width - side) / 2;
                const sy = (img.height - side) / 2;

                const canvas = document.createElement("canvas");
                canvas.width = AVATAR_SIZE;
                canvas.height = AVATAR_SIZE;

                const ctx = canvas.getContext("2d");
                ctx.drawImage(img, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);

                URL.revokeObjectURL(url);
                resolve(canvas.toDataURL("image/png"));
            } catch (e) {
                URL.revokeObjectURL(url);
                reject(e);
            }
        };

        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("图片读取失败"));
        };

        img.src = url;
    });
}

uAvatarPick.addEventListener("click", () => {
    uAvatarFile.click();
});

uAvatarFile.addEventListener("change", () => {
    const file = uAvatarFile.files && uAvatarFile.files[0];
    if (!file) {
        return;
    }

    if (!/^image\//.test(file.type)) {
        uStatus.textContent = "请选择图片文件（png / jpg / gif 等）";
        uAvatarFile.value = "";
        return;
    }

    shrinkImage(file)
        .then((dataUrl) => {
            pickedAvatar = dataUrl;
            renderAvatarPreview();
            uStatus.textContent = "新头像已就绪，点最下面的「保存」生效 ✓";
        })
        .catch(() => {
            uStatus.textContent = "这张图片读不出来，换一张试试";
        })
        .finally(() => {
            uAvatarFile.value = ""; // 清空后，同一个文件再选一次也能触发 change
        });
});

// 恢复默认头像：和选图一样先预览，点「保存」才真正写入
uAvatarReset.addEventListener("click", () => {
    pickedAvatar = DEFAULT_AVATAR;
    renderAvatarPreview();
    uStatus.textContent = "已切回默认头像，点最下面的「保存」生效 ✓";
});

// 载入已保存的信息（以前存进去的超长昵称也顺手规范一下）
function loadUser() {
    const u = window.Store.readJSON(USER_KEY, null);
    if (u) {
        if (u.avatar) {
            savedAvatar = u.avatar;
        }
        if (u.nickname) {
            uNickname.value = cutNickname(u.nickname);
        }
        if (u.signature) {
            uSignature.value = u.signature;
        }
    }
    renderAvatarPreview();
}

// 保存：昵称先规范到 12 个字符以内并写回输入框，签名不限制长度
// 没填昵称时用默认名（小窝第 N 成员）；登录状态下同时同步到云端
uSave.addEventListener("click", async () => {
    limitNicknameInput();
    const fallback = (window.Auth && window.Auth.defaultDisplayName)
        ? window.Auth.defaultDisplayName()
        : "小窝成员";
    const nickname = uNickname.value.trim() || fallback;
    uNickname.value = nickname;

    const avatar = pickedAvatar || savedAvatar || DEFAULT_AVATAR;
    const signature = uSignature.value.trim() || "";

    // 1. 先存本地（立刻生效）
    window.Store.writeJSON(USER_KEY, {
        avatar: avatar,
        nickname: nickname,
        signature: signature,
    });

    savedAvatar = avatar;
    pickedAvatar = "";
    renderAvatarPreview();
    uStatus.textContent = "已保存 ✓ 首页侧边栏会自动更新";

    // 2. 已登录就同步到云端（失败不影响本地）
    if (window.Cloud && window.Cloud.isReady()) {
        uStatus.textContent = "已存到本地，正在同步云端……";
        try {
            await window.Cloud.saveProfile({
                nickname: nickname,
                avatar: avatar,
                signature: signature,
            });
            uStatus.textContent = "已保存 ✓ 本地 + 云端都更新了";
        } catch (e) {
            uStatus.textContent = "已存到本地 ✓（云端同步失败：" + (e.message || e) + "）";
            console.warn("云端资料保存失败：", e);
        }
    }
});

// ---------- 账号安全：修改邮箱 / 修改密码 ----------

// 邮箱格式先在本机粗检一遍（最终以服务端校验为准），避免空跑一次发送
function isEmailLike(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

// 强度规则和登录页一致（main.js 的 passwordProblem 同逻辑，加前缀避免同页覆盖）
function userPasswordProblem(pwd) {
    const value = String(pwd || "");
    if (value.length < 8) {
        return "密码至少 8 位";
    }
    if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) {
        return "密码要同时包含字母和数字";
    }
    return "";
}

// 验证码 60 秒重发倒计时（改邮箱 / 注销共用，每个按钮各一个）
const sendTimers = { email: null, del: null };

function startCountdown(btn, which) {
    if (sendTimers[which]) {
        clearInterval(sendTimers[which]);
    }
    let left = 60;
    btn.disabled = true;
    btn.textContent = left + "s";
    sendTimers[which] = setInterval(() => {
        left--;
        if (left <= 0) {
            clearInterval(sendTimers[which]);
            sendTimers[which] = null;
            btn.disabled = false;
            btn.textContent = "发送";
        } else {
            btn.textContent = left + "s";
        }
    }, 1000);
}

// 离开页面时收掉倒计时（不然它会一直空转到 60 秒）
window.addEventListener("pagehide", (event) => {
    if (event.persisted) {
        return;
    }
    for (const which of Object.keys(sendTimers)) {
        if (sendTimers[which]) {
            clearInterval(sendTimers[which]);
            sendTimers[which] = null;
        }
    }
});

// 改邮箱表单：收起并清掉敏感输入（验证码留着没意义）
function closeEmailForm() {
    if (!uEmailForm) {
        return;
    }
    uEmailForm.hidden = true;
    uEmailToggle.hidden = false;
    uEmailCode.value = "";
    uEmailPassword.value = "";
}

uEmailToggle.addEventListener("click", () => {
    uEmailToggle.hidden = true;
    uEmailForm.hidden = false;
    uEmailStatus.textContent = "";
    uEmailNew.value = "";
    uEmailCode.value = "";
    uEmailPassword.value = "";
    uEmailNew.focus();
});

uEmailCancel.addEventListener("click", closeEmailForm);

// 发送验证码到新邮箱（scene=change_email；服务端会拒绝已注册的邮箱）
uEmailSend.addEventListener("click", async () => {
    const email = uEmailNew.value.trim().toLowerCase();
    const user = window.Auth.current();

    if (!user) {
        uEmailStatus.textContent = "登录状态已失效，请重新登录";
        return;
    }
    if (!isEmailLike(email)) {
        uEmailStatus.textContent = "请先填写正确的「新邮箱」，再发送验证码";
        return;
    }
    if (email === String(user.email).toLowerCase()) {
        uEmailStatus.textContent = "新邮箱和当前邮箱一样，不用改啦";
        return;
    }

    uEmailSend.disabled = true;
    uEmailSend.textContent = "…";
    try {
        const res = await window.Auth.sendCode(email, "change_email");
        uEmailStatus.textContent = res && res.dev_code
            ? "本地调试验证码：" + res.dev_code
            : "验证码已发送到 " + email + "，请查收";
        uEmailCode.focus();
        startCountdown(uEmailSend, "email");
    } catch (e) {
        uEmailStatus.textContent = e.message || "发送失败，请稍后再试";
        uEmailSend.disabled = false;
        uEmailSend.textContent = "发送";
    }
});

// 确认修改：新邮箱 + 验证码 + 当前密码，一次提交
uEmailSubmit.addEventListener("click", async () => {
    const email = uEmailNew.value.trim().toLowerCase();
    const code = uEmailCode.value.trim();
    const password = uEmailPassword.value;

    if (!isEmailLike(email)) {
        uEmailStatus.textContent = "新邮箱格式不正确，请检查后重试";
        return;
    }
    if (!/^\d{4,10}$/.test(code)) {
        uEmailStatus.textContent = "请先点「发送」，再填入新邮箱收到的验证码";
        return;
    }
    if (!password) {
        uEmailStatus.textContent = "请输入当前密码（验证身份用）";
        return;
    }

    uEmailSubmit.disabled = true;
    uEmailSubmit.textContent = "提交中……";
    try {
        const data = await window.Auth.changeEmail(email, code, password);
        // 会话里的邮箱已由 auth.js 更新，这里只刷新显示；表单留着让用户看到成功提示
        renderAccount();
        uEmailCode.value = "";
        uEmailPassword.value = "";
        uEmailStatus.textContent = "✓ 邮箱已改为 " + (data.email || email) + "，以后请用新邮箱登录";
    } catch (e) {
        uEmailStatus.textContent = "✗ " + (e.message || "修改失败，请稍后再试");
    } finally {
        uEmailSubmit.disabled = false;
        uEmailSubmit.textContent = "确认修改";
    }
});

// 改密码表单
function closePwdForm() {
    if (!uPwdForm) {
        return;
    }
    uPwdForm.hidden = true;
    uPwdToggle.hidden = false;
    uPwdOld.value = "";
    uPwdNew.value = "";
    uPwdNew2.value = "";
}

uPwdToggle.addEventListener("click", () => {
    uPwdToggle.hidden = true;
    uPwdForm.hidden = false;
    uPwdStatus.textContent = "";
    uPwdOld.value = "";
    uPwdNew.value = "";
    uPwdNew2.value = "";
    uPwdOld.focus();
});

uPwdCancel.addEventListener("click", closePwdForm);

uPwdSave.addEventListener("click", async () => {
    const oldPwd = uPwdOld.value;
    const newPwd = uPwdNew.value;

    const problem = userPasswordProblem(newPwd);
    if (problem) {
        uPwdStatus.textContent = problem;
        return;
    }
    if (newPwd !== uPwdNew2.value) {
        uPwdStatus.textContent = "两次输入的新密码不一样，请检查后再保存";
        return;
    }

    uPwdSave.disabled = true;
    uPwdSave.textContent = "保存中……";
    try {
        await window.Auth.changePassword(oldPwd, newPwd);
        uPwdOld.value = "";
        uPwdNew.value = "";
        uPwdNew2.value = "";
        uPwdStatus.textContent = "✓ 密码已更新，下次登录请用新密码";
    } catch (e) {
        uPwdStatus.textContent = "✗ " + (e.message || "修改失败，请稍后再试");
    } finally {
        uPwdSave.disabled = false;
        uPwdSave.textContent = "保存新密码";
    }
});

// ---------- 注销账号（危险操作：先验密码 + 邮箱验证码） ----------

const uDeletePassword = document.querySelector("#u-delete-password");
const uDeleteCode = document.querySelector("#u-delete-code");
const uDeleteSend = document.querySelector("#u-delete-send");
const uDeleteStatus = document.querySelector("#u-delete-status");

uDelete.addEventListener("click", () => {
    uDelete.hidden = true;
    uDeleteConfirm.hidden = false;
    uDeleteStatus.textContent = "";
    uDeletePassword.value = "";
    uDeleteCode.value = "";
    uDeletePassword.focus();
});

uDeleteNo.addEventListener("click", () => {
    uDeleteConfirm.hidden = true;
    uDelete.hidden = false;
    uDeletePassword.value = "";
    uDeleteCode.value = "";
    uDeleteStatus.textContent = "";
});

// 发送注销验证码（发到当前账号的邮箱）
uDeleteSend.addEventListener("click", async () => {
    const user = window.Auth.current();
    if (!user) {
        uDeleteStatus.textContent = "登录状态已失效，请重新登录";
        return;
    }
    uDeleteSend.disabled = true;
    uDeleteSend.textContent = "…";
    try {
        const res = await window.Auth.sendCode(user.email, "delete");
        uDeleteStatus.textContent = res && res.dev_code
            ? "本地调试验证码：" + res.dev_code
            : "验证码已发送到 " + user.email + "，请查收";
        uDeleteCode.focus();
        startCountdown(uDeleteSend, "del");
    } catch (e) {
        uDeleteStatus.textContent = e.message || "发送失败，请稍后再试";
        uDeleteSend.disabled = false;
        uDeleteSend.textContent = "发送";
    }
});

// 确定注销：密码 + 验证码都过了才真的删
uDeleteYes.addEventListener("click", async () => {
    const user = window.Auth.current();
    if (!user) {
        uDeleteStatus.textContent = "登录状态已失效，请重新登录";
        return;
    }

    const password = uDeletePassword.value;
    const code = uDeleteCode.value.trim();

    if (!password) {
        uDeleteStatus.textContent = "请输入当前账号的密码";
        return;
    }
    if (!/^\d{4,10}$/.test(code)) {
        uDeleteStatus.textContent = "请先点「发送」，再填入邮箱里的验证码";
        return;
    }

    uDeleteYes.disabled = true;

    try {
        // 后端一次校验「当前密码 + 注销验证码」，通过后回收 uid 并级联删除全部数据
        uDeleteYes.textContent = "注销中……";
        if (!window.Cloud || !window.Cloud.isReady()) {
            throw new Error("未登录或未配置后端");
        }
        await window.Cloud.deleteAccount(password, code);

        // 4. 清掉本地与这个账号有关的数据，回登录页
        localStorage.removeItem(USER_KEY);
        localStorage.removeItem(window.Store.KEYS.uid);
        localStorage.removeItem(window.Store.KEYS.memberNo);
        localStorage.removeItem(window.Store.KEYS.auth);
        localStorage.removeItem(window.Store.KEYS.visited);
        localStorage.removeItem(window.Store.KEYS.lastUser);
        window.location.href = "index.html";
    } catch (e) {
        // 密码错、验证码错、验证码过期……一律提示同一句，不区分是哪个不对
        const msg = String(e.message || "");
        const isVerifyFail = /密码|验证码|credentials|token|expired|incorrect/i.test(msg);
        uDeleteStatus.textContent = isVerifyFail
            ? "✗ 密码或验证码不正确，请检查后重试"
            : "✗ 注销失败：" + msg;
        uDeleteYes.disabled = false;
        uDeleteYes.textContent = "确定注销";
    }
});

loadUser();
renderAccount();

// 刷新一次过期凭证后再更新显示
if (window.Auth && window.Auth.init) {
    window.Auth.init().then(renderAccount);
}
