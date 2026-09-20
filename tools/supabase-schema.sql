-- ============================================================
-- 星月小窝 · 云端数据库结构（Supabase）
-- ============================================================
-- 【怎么执行】
--   1. 打开 Supabase 后台 → 左侧 SQL Editor → New query
--   2. 把本文件全部内容粘进去 → 点 Run
--   3. 看到 Success 就完成了（可以重复执行，不会报错）
--
-- 【建了什么】
--   uid_pool        uid 池（1~2000，记录每个 uid 被谁占用 / 是否空闲）
--   profiles        用户资料（uid、昵称、头像、签名）
--   user_settings   用户设置（API 提供商、我的角色）
--   chat_sessions   对话记录（按角色分组）
--   + 两个触发器：新用户注册自动分配 uid；注销账号自动释放 uid
--
-- 【隐私设计】
--   1. 三张数据表都开了 RLS（行级安全）：每个人**只能读写自己那一行**
--   2. uid_pool 不给任何客户端权限，只有触发器（security definer）能改
--   3. 前端只带 Publishable key，拿不到别人的数据
-- ============================================================


-- ------------------------------------------------------------
-- ① uid 池：1 ~ 2000，user_id 为 null 表示空闲
-- ------------------------------------------------------------
create table if not exists public.uid_pool (
    uid         int primary key,
    user_id     uuid unique,
    assigned_at timestamptz
);

-- 预生成编号（已存在的会跳过）
insert into public.uid_pool (uid)
select generate_series(1, 2000)
on conflict (uid) do nothing;


-- ------------------------------------------------------------
-- ② 用户资料
-- ------------------------------------------------------------
create table if not exists public.profiles (
    user_id    uuid primary key references auth.users(id) on delete cascade,
    uid        int unique not null,
    nickname   text default '',
    avatar     text default '',          -- emoji 或 data:image/... （Base64）
    signature  text default '',
    updated_at timestamptz default now()
);


-- ------------------------------------------------------------
-- ③ 用户设置（API 提供商 + 我的角色）
--    用 jsonb 存，以后加字段不用改表
--    ⚠️ API 秘钥不存这里，只存在浏览器本地
-- ------------------------------------------------------------
create table if not exists public.user_settings (
    user_id    uuid primary key references auth.users(id) on delete cascade,
    data       jsonb not null default '{}'::jsonb,
    updated_at timestamptz default now()
);


-- ------------------------------------------------------------
-- ④ 对话记录（按角色分组，一个角色一行）
-- ------------------------------------------------------------
create table if not exists public.chat_sessions (
    user_id    uuid not null references auth.users(id) on delete cascade,
    role_key   text not null,            -- 角色标识：official-星瑶 / role-1735...
    messages   jsonb not null default '[]'::jsonb,
    updated_at timestamptz default now(),
    primary key (user_id, role_key)
);


-- ------------------------------------------------------------
-- ⑤ 新用户注册 → 自动分配一个空闲 uid（随机挑，注销空出来的会优先被复用）
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    picked int;
begin
    -- 从池子里随机挑一个空闲编号
    select uid into picked
    from public.uid_pool
    where user_id is null
    order by random()
    limit 1;

    if picked is null then
        -- 池子用完了：往后加一个（并顺便扩容到 2000 以上）
        select coalesce(max(uid), 0) + 1 into picked from public.uid_pool;
        insert into public.uid_pool (uid, user_id, assigned_at)
        values (picked, new.id, now())
        on conflict (uid) do update set user_id = new.id, assigned_at = now();
    else
        update public.uid_pool
        set user_id = new.id, assigned_at = now()
        where uid = picked;
    end if;

    -- 顺手建好资料行（昵称为空，前端用「小窝第 N 成员」显示）
    insert into public.profiles (user_id, uid)
    values (new.id, picked)
    on conflict (user_id) do nothing;

    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();


-- ------------------------------------------------------------
-- ⑥ 注销账号 → 把 uid 还回池子（空出来的编号会给下一个新用户）
-- ------------------------------------------------------------
create or replace function public.handle_user_deleted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    update public.uid_pool
    set user_id = null, assigned_at = null
    where user_id = old.id;

    return old;
end;
$$;

drop trigger if exists on_auth_user_deleted on auth.users;
create trigger on_auth_user_deleted
after delete on auth.users
for each row execute function public.handle_user_deleted();


-- ------------------------------------------------------------
-- ⑦ 行级安全（RLS）：每个人只能碰自己那一行
-- ------------------------------------------------------------
alter table public.profiles      enable row level security;
alter table public.user_settings enable row level security;
alter table public.chat_sessions enable row level security;

-- profiles
drop policy if exists "own profile select" on public.profiles;
create policy "own profile select" on public.profiles
    for select using (auth.uid() = user_id);

drop policy if exists "own profile insert" on public.profiles;
create policy "own profile insert" on public.profiles
    for insert with check (auth.uid() = user_id);

drop policy if exists "own profile update" on public.profiles;
create policy "own profile update" on public.profiles
    for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- user_settings
drop policy if exists "own settings select" on public.user_settings;
create policy "own settings select" on public.user_settings
    for select using (auth.uid() = user_id);

drop policy if exists "own settings insert" on public.user_settings;
create policy "own settings insert" on public.user_settings
    for insert with check (auth.uid() = user_id);

drop policy if exists "own settings update" on public.user_settings;
create policy "own settings update" on public.user_settings
    for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- chat_sessions
drop policy if exists "own chat select" on public.chat_sessions;
create policy "own chat select" on public.chat_sessions
    for select using (auth.uid() = user_id);

drop policy if exists "own chat insert" on public.chat_sessions;
create policy "own chat insert" on public.chat_sessions
    for insert with check (auth.uid() = user_id);

drop policy if exists "own chat update" on public.chat_sessions;
create policy "own chat update" on public.chat_sessions
    for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own chat delete" on public.chat_sessions;
create policy "own chat delete" on public.chat_sessions
    for delete using (auth.uid() = user_id);

-- uid_pool 不开任何策略：客户端完全读不到、也改不了（只有触发器能动）


-- ------------------------------------------------------------
-- ⑧ 自检：看看建好了没
-- ------------------------------------------------------------
-- 空闲编号数量（应该接近 2000）
-- select count(*) as free_uids from public.uid_pool where user_id is null;
--
-- 已注册用户与他们的编号
-- select p.uid, p.nickname, u.email, u.created_at
-- from public.profiles p join auth.users u on u.id = p.user_id
-- order by p.uid;
