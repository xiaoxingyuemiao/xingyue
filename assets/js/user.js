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

// 载入已保存的信息
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
        uNickname.value = u.nickname;
    }
    if (u.signature) {
        uSignature.value = u.signature;
    }
}

// 输入头像时实时预览
uAvatar.addEventListener("input", () => {
    avatarPreview.textContent = uAvatar.value.trim() || "🐱";
});

// 保存
uSave.addEventListener("click", () => {
    window.Store.writeJSON(USER_KEY, {
        avatar: uAvatar.value.trim() || "🐱",
        nickname: uNickname.value.trim() || "小喵",
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
