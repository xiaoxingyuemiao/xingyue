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

// 顶部不再显示登录状态；「退出登录」整块只在登录后出现，且每次都回到未确认状态
function renderAccount() {
    const user = window.Auth && window.Auth.current ? window.Auth.current() : null;

    if (uSignoutArea) {
        uSignoutArea.hidden = !user;
        uSignout.hidden = false;
        uSignoutConfirm.hidden = true;
    }

    // 「注销账号」整块同理：未登录就不该出现（否则点了只会提示登录状态已失效）
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

// ---------- 注销账号（危险操作：先验密码 + 邮箱验证码） ----------

const uDeletePassword = document.querySelector("#u-delete-password");
const uDeleteCode = document.querySelector("#u-delete-code");
const uDeleteSend = document.querySelector("#u-delete-send");
const uDeleteStatus = document.querySelector("#u-delete-status");

let deleteTimer = null;

function startDeleteCountdown() {
    if (deleteTimer) {
        clearInterval(deleteTimer);
    }
    let left = 60;
    uDeleteSend.disabled = true;
    uDeleteSend.textContent = left + "s";
    deleteTimer = setInterval(() => {
        left--;
        if (left <= 0) {
            clearInterval(deleteTimer);
            deleteTimer = null;
            uDeleteSend.disabled = false;
            uDeleteSend.textContent = "发送";
        } else {
            uDeleteSend.textContent = left + "s";
        }
    }, 1000);
}

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
        await window.Auth.sendCode(user.email);
        uDeleteStatus.textContent = "验证码已发送到 " + user.email + "，请查收";
        uDeleteCode.focus();
        startDeleteCountdown();
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
        // 1. 验证密码（密码不对会报错）
        uDeleteYes.textContent = "验证密码……";
        await window.Auth.signInWithPassword(user.email, password);

        // 2. 验证邮箱验证码
        uDeleteYes.textContent = "验证验证码……";
        await window.Auth.verifyCode(user.email, code);

        // 3. 删除账号（数据库函数会把 uid 还回池子并级联删除数据）
        uDeleteYes.textContent = "注销中……";
        if (window.Cloud && window.Cloud.isReady()) {
            await window.Cloud.deleteAccount();
        }

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
