-- ============================================================================
-- Namwonja Heritage Journal — Donation Projects (DB migration)
-- ----------------------------------------------------------------------------
-- HOW TO USE:
--   1. Open your Supabase project → SQL Editor.
--   2. Copy the ENTIRE contents of this file.
--   3. Paste into the SQL Editor and click "Run".
--
-- This script:
--   (A) Creates the `donation_projects` table.
--   (B) Adds `project_id` + `project_name` columns to `mpesa_transactions`.
--   (C) Enables Row Level Security + public read policy for active projects.
--   (D) Seeds a starter project: "Building the Mausoleum of Chief Namwonja
--       Mukudi" (target KES 2,000,000).
--
-- The script is idempotent — re-running it is safe.
-- ============================================================================

-- (A) DONATION PROJECTS TABLE
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

-- (B) LINK MPESA TRANSACTIONS TO A PROJECT
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

-- Index for fast per-project raised-amount aggregation
create index if not exists idx_mpesa_transactions_project on public.mpesa_transactions (project_id);
create index if not exists idx_mpesa_transactions_project_status on public.mpesa_transactions (project_id, status);

-- (C) ROW LEVEL SECURITY + PUBLIC POLICIES
alter table public.donation_projects enable row level security;

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

-- (D) SEED STARTER PROJECT (idempotent)
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

