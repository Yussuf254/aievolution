-- ============================================================================
-- Namwonja Heritage Journal — Donation Projects (Complete, Self-Contained Setup)
-- ----------------------------------------------------------------------------
-- HOW TO USE:
--   1. Open your Supabase project → SQL Editor.
--   2. Copy the ENTIRE contents of this file.
--   3. Paste into the SQL Editor and click "Run".
--
-- This script is fully self-contained and idempotent (safe to re-run). It:
--   (A) Ensures the `mpesa_transactions` table exists (with project_id +
--       project_name columns) so donations can be linked to a project.
--   (B) Creates the `donation_projects` table.
--   (C) Enables Row Level Security + a public read policy for active projects.
--   (D) Seeds a starter project: "Building the Mausoleum of Chief Namwonja
--       Mukudi" (target KES 2,000,000).
-- ============================================================================

-- ============================================================================
-- (A) MPESA TRANSACTIONS TABLE (ensures it exists + project columns)
-- ============================================================================
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

-- Add the project link columns if they don't already exist.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'mpesa_transactions' and column_name = 'project_id'
  ) then
    alter table public.mpesa_transactions add column project_id uuid;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'mpesa_transactions' and column_name = 'project_name'
  ) then
    alter table public.mpesa_transactions add column project_name text;
  end if;
end $$;

-- ============================================================================
-- (B) DONATION PROJECTS TABLE
-- ============================================================================
create table if not exists public.donation_projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  description text,
  cover_image text,
  target_amount numeric default 0,
  status text default 'active',
  sort_order int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Indexes for fast per-project raised-amount aggregation.
create index if not exists idx_mpesa_transactions_project on public.mpesa_transactions (project_id);
create index if not exists idx_mpesa_transactions_project_status on public.mpesa_transactions (project_id, status);

-- ============================================================================
-- (C) ROW LEVEL SECURITY + PUBLIC POLICIES
-- ============================================================================

-- Ensure created_at exists on mpesa_transactions (for revenue/date charts).
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

-- Public anonymous insert policy (so the STK push can record a transaction).
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'mpesa_transactions' and policyname = 'Public insert mpesa'
  ) then
    create policy "Public insert mpesa"
      on public.mpesa_transactions for insert with check (true);
  end if;
end $$;

-- RLS on the new table.
alter table public.donation_projects enable row level security;

-- Public read only active projects.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'donation_projects' and policyname = 'Public read active donation projects'
  ) then
    create policy "Public read active donation projects"
      on public.donation_projects for select using (status = 'active');
  end if;
end $$;

-- Admin CRUD goes through the service-role key (bypasses RLS), so no
-- additional policies are required for admin writes.

-- ============================================================================
-- (D) SEED STARTER PROJECT (idempotent)
-- ============================================================================
insert into public.donation_projects (name, slug, description, cover_image, target_amount, status, sort_order)
values (
  'Building the Mausoleum of Chief Namwonja Mukudi',
  'mausoleum-chief-namwonja-mukudi',
  'Support the construction of a lasting mausoleum to honour Chief Namwonja Mukudi — a pre-colonial sovereign of the Kavirondo Gulf. Your contribution will preserve his legacy for generations.',
  'images/blog/Mukudi1.jpeg',
  2000000,
  'active',
  1
)
on conflict (slug) do update set
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  cover_image = EXCLUDED.cover_image,
  target_amount = EXCLUDED.target_amount,
  status = EXCLUDED.status,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

-- ============================================================================
-- DONE — Donation projects are fully configured.
-- ============================================================================
