-- ============================================================
-- Namwonja Heritage Journal - Supabase Schema
-- Run this in the Supabase SQL Editor (Dashboard -> SQL Editor)
-- ============================================================

-- 1. STORIES
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

-- 2. COMMENTS
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  story_slug text not null,
  name text not null,
  email text,
  message text not null,
  is_approved boolean default false,
  created_at timestamptz default now()
);

-- 3. CONTACT MESSAGES
create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  subject text,
  message text not null,
  created_at timestamptz default now()
);

-- 4. MPESA TRANSACTIONS
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

-- 5. ADMINS
create table if not exists public.admins (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  password_hash text not null,
  created_at timestamptz default now()
);

-- ============================================================
-- Row Level Security (RLS)
-- Public reads for published stories; everything else protected.
-- ============================================================
alter table public.stories enable row level security;
alter table public.comments enable row level security;
alter table public.contact_messages enable row level security;
alter table public.mpesa_transactions enable row level security;
alter table public.admins enable row level security;

-- Public can read published stories (anon key)
create policy "Public read published stories" on public.stories
  for select using (is_published = true);

-- Public can read approved comments (anon key)
create policy "Public read approved comments" on public.comments
  for select using (is_approved = true);

-- Public can insert comments (anon key)
create policy "Public insert comments" on public.comments
  for insert with check (true);

-- Public can insert contact messages (anon key)
create policy "Public insert contact" on public.contact_messages
  for insert with check (true);

-- Public can insert mpesa transactions (anon key)
create policy "Public insert mpesa" on public.mpesa_transactions
  for insert with check (true);

-- NOTE: Admin operations (create/update/delete stories, approve comments,
-- view messages & payments) should use the SERVICE ROLE key, which bypasses
-- RLS entirely. That is handled in the serverless functions.

-- ============================================================
-- STORAGE BUCKET (for story cover images)
-- The /api/upload serverless function auto-creates a public bucket
-- named "covers" on first use. To create it manually in the
-- Supabase Dashboard -> Storage, create a PUBLIC bucket named "covers".
-- No extra RLS policies are needed because uploads use the SERVICE
-- ROLE key (bypasses RLS) and the bucket is public for reads.
-- ============================================================
