// ================================
// 用户设置页（assets/js/user.js）
// 头像（可上传图片，默认 🐱）/ 昵称 / 个性签名，保存在浏览器本地；
// 首页侧边栏会自动读取显示；已登录时页面顶部显示邮箱账号
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
const uAccount = document.querySelector("#u-account");

const DEFAULT_AVATAR = "🐱"; // 默认头像：没上传过图片时用它
const AVATAR_SIZE = 128; // 上传的图片会居中裁成正方形并缩到这个尺寸再保存

// 已保存的头像 + 本次新选的头像（DataURL 或 emoji）
let savedAvatar = DEFAULT_AVATAR;
let pickedAvatar = "";

// 头像可能是 emoji 文字，也可能是上传的图片（DataURL），这里统一渲染。
// 遇到既不是图片、又长得不像 emoji 的异常值（例如被当文本渲染的一长串数据），
// 一律回退默认头像，避免显示出乱码
function renderAvatar(el, avatar) {
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
    renderAvatar(avatarPreview, pickedAvatar || savedAvatar);
}

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

// 保存：昵称先规范到 6 个字以内并写回输入框，签名不限制长度
uSave.addEventListener("click", () => {
    limitNicknameInput();
    const nickname = uNickname.value.trim() || "小喵";
    uNickname.value = nickname;

    const avatar = pickedAvatar || savedAvatar || DEFAULT_AVATAR;

    window.Store.writeJSON(USER_KEY, {
        avatar: avatar,
        nickname: nickname,
        signature: uSignature.value.trim() || "",
    });

    savedAvatar = avatar;
    pickedAvatar = "";
    renderAvatarPreview();
    uStatus.textContent = "已保存 ✓ 首页侧边栏会自动更新";
});

loadUser();
renderAccount();

// 刷新一次过期凭证后再更新显示
if (window.Auth && window.Auth.init) {
    window.Auth.init().then(renderAccount);
}
