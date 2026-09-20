// ================================
// 用户设置页（assets/js/user.js）
// 昵称 / 头像 / 个性签名，保存在浏览器本地；首页侧边栏自动读取显示
// 已登录时页面顶部显示邮箱账号
// ================================

const USER_KEY = window.Store.KEYS.user;

const avatarPreview = document.querySelector("#avatar-preview");
const uAvatar = document.querySelector("#u-avatar");
const uNickname = document.querySelector("#u-nickname");
const uSignature = document.querySelector("#u-signature");
const uSave = document.querySelector("#u-save");
const uStatus = document.querySelector("#u-status");
const uAccount = document.querySelector("#u-account");

// 顶部显示登录状态
function renderAccount() {
    if (!uAccount) {
        return;
    }
    const user = window.Auth && window.Auth.current ? window.Auth.current() : null;
    if (user) {
        uAccount.textContent = "已登录：" + user.email;
        uAccount.className = "user-account user-account-on";
    } else {
        uAccount.textContent = "未登录 —— 回首页点侧边栏底部即可用邮箱登录";
        uAccount.className = "user-account";
    }
}

// 昵称最多 6 个字（汉字算 1 个）；个性签名不限长度
const NICKNAME_MAX = 6;

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
        uStatus.textContent = "昵称最多 " + NICKNAME_MAX + " 个字，超出的部分已自动去掉";
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

// 载入已保存的信息（以前存进去的超长昵称也顺手规范一下）
function loadUser() {
    const u = window.Store.readJSON(USER_KEY, null);
    if (!u) {
        return;
    }
    if (u.avatar) {
        uAvatar.value = u.avatar;
        avatarPreview.textContent = u.avatar;
    }
    if (u.nickname) {
        uNickname.value = cutNickname(u.nickname);
    }
    if (u.signature) {
        uSignature.value = u.signature;
    }
}

// 输入头像时实时预览
uAvatar.addEventListener("input", () => {
    avatarPreview.textContent = uAvatar.value.trim() || "🐱";
});

// 保存：昵称先规范到 6 个字以内并写回输入框，签名不限制长度
uSave.addEventListener("click", () => {
    limitNicknameInput();
    const nickname = uNickname.value.trim() || "小喵";
    uNickname.value = nickname;

    window.Store.writeJSON(USER_KEY, {
        avatar: uAvatar.value.trim() || "🐱",
        nickname: nickname,
        signature: uSignature.value.trim() || "",
    });
    uStatus.textContent = "已保存 ✓ 首页侧边栏会自动更新";
});

loadUser();
renderAccount();

// 刷新一次过期凭证后再更新显示
if (window.Auth && window.Auth.init) {
    window.Auth.init().then(renderAccount);
}
