-- ============================================================================
-- Namwonja Heritage Journal — Supabase Schema Fix (combined)
-- ----------------------------------------------------------------------------
-- Paste this entire script into Supabase SQL Editor and run it once.
-- It creates any missing tables, adds missing columns, and sets up RLS.
-- Safe to re-run — idempotent.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. STORIES
-- ----------------------------------------------------------------------------
create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  excerpt text,
  content_html text,
  category text,
  cover_image text,
  author text default 'Namwonja Heritage Journal',
  published_at timestamptz default now(),
  is_published boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ----------------------------------------------------------------------------
-- 2. COMMENTS
-- ----------------------------------------------------------------------------
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  story_slug text not null,
  name text not null,
  email text,
  message text not null,
  is_approved boolean default false,
  created_at timestamptz default now()
);

-- ----------------------------------------------------------------------------
-- 3. CONTACT MESSAGES
-- ----------------------------------------------------------------------------
create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  subject text,
  message text not null,
  created_at timestamptz default now()
);

-- ----------------------------------------------------------------------------
-- 4. MPESA TRANSACTIONS
-- ----------------------------------------------------------------------------
create table if not exists public.mpesa_transactions (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  amount numeric not null,
  checkout_request_id text,
  mpesa_receipt text,
  status text default 'pending',
  result_desc text,
  created_at timestamptz default now()
);

-- ----------------------------------------------------------------------------
-- 5. ADMINS
-- ----------------------------------------------------------------------------
create table if not exists public.admins (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  password_hash text not null,
  created_at timestamptz default now()
);

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
alter table public.stories enable row level security;
alter table public.comments enable row level security;
alter table public.contact_messages enable row level security;
alter table public.mpesa_transactions enable row level security;
alter table public.admins enable row level security;

-- Policies (idempotent — skipped if they already exist)
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'stories' and policyname = 'Public read published stories') then
    create policy "Public read published stories" on public.stories for select using (is_published = true);
  end if;
end $$;

do $$
declare
  comment_col text;
begin
  comment_col := null;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'comments' and column_name = 'is_approved') then
    comment_col := 'is_approved';
  elsif exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'comments' and column_name = 'approved') then
    comment_col := 'approved';
  end if;

  if comment_col is not null and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'comments' and policyname = 'Public read approved comments') then
    execute format('create policy "Public read approved comments" on public.comments for select using (%I = true)', comment_col);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'comments' and policyname = 'Public insert comments') then
    create policy "Public insert comments" on public.comments for insert with check (true);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'contact_messages' and policyname = 'Public insert contact') then
    create policy "Public insert contact" on public.contact_messages for insert with check (true);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'mpesa_transactions' and policyname = 'Public insert mpesa') then
    create policy "Public insert mpesa" on public.mpesa_transactions for insert with check (true);
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 6. ENSURE REQUIRED COLUMNS EXIST (fix-supabase-schema.sql logic)
-- ----------------------------------------------------------------------------

-- Comments: ensure story_slug exists and is populated
do $$
declare
  src_col text;
  col_ok boolean;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'comments' and column_name = 'story_slug'
  ) then
    alter table public.comments add column story_slug text;
  end if;

  foreach src_col in array array['post_slug','article_slug','story_id','post_id','story','post','article','slug']
  loop
    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'comments' and column_name = src_col
    ) into col_ok;

    if col_ok then
      execute format(
        'update public.comments set story_slug = coalesce(nullif(story_slug,''''), %I::text) where story_slug is null or story_slug = ''''',
        src_col
      );
    end if;
  end loop;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'comments' and column_name = 'story_slug'
  ) then
    alter table public.comments alter column story_slug drop not null;
    update public.comments set story_slug = 'unknown' where story_slug is null or story_slug = '';
    alter table public.comments alter column story_slug set not null;
  end if;
end $$;

create index if not exists idx_comments_story_slug on public.comments (story_slug);

-- Comments: ensure email column exists (some live schemas lack it, which caused
-- comment inserts to fail with a 500 and made the admin Comments tab appear empty).
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'comments'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'comments' and column_name = 'email'
  ) then
    alter table public.comments add column email text;
  end if;
end $$;

do $$
declare
  comment_col text;
begin
  comment_col := null;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'comments' and column_name = 'is_approved') then
    comment_col := 'is_approved';
  elsif exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'comments' and column_name = 'approved') then
    comment_col := 'approved';
  end if;

  if comment_col is not null then
    execute format('create index if not exists idx_comments_approved on public.comments (%I)', comment_col);
  end if;
end $$;

-- Stories: ensure required columns exist
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'stories'
  ) then
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'stories' and column_name = 'slug'
    ) then
      alter table public.stories add column slug text;
    end if;

    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'stories' and column_name = 'is_published'
    ) then
      alter table public.stories add column is_published boolean default true;
    end if;

    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'stories' and column_name = 'content_html'
    ) then
      alter table public.stories add column content_html text;
    end if;

    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'stories' and column_name = 'cover_image'
    ) then
      alter table public.stories add column cover_image text;
    end if;

    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'stories' and column_name = 'published_at'
    ) then
      alter table public.stories add column published_at timestamptz default now();
    end if;

    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'stories' and column_name = 'created_at'
    ) then
      alter table public.stories add column created_at timestamptz default now();
    end if;

    create index if not exists idx_stories_slug on public.stories (slug);
  end if;
end $$;

-- Contact messages: ensure created_at exists
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'contact_messages'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'contact_messages' and column_name = 'created_at'
  ) then
    alter table public.contact_messages add column created_at timestamptz default now();
  end if;
end $$;

-- MPESA transactions: ensure created_at exists
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'mpesa_transactions'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'mpesa_transactions' and column_name = 'created_at'
  ) then
    alter table public.mpesa_transactions add column created_at timestamptz default now();
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- DONE
-- ----------------------------------------------------------------------------