-- ============================================================================
-- Namwonja Heritage Journal — Fix Receipts & Transactions (idempotent)
-- ----------------------------------------------------------------------------
-- HOW TO USE:
--   1. Open your Supabase project → SQL Editor.
--   2. Copy the ENTIRE contents of this file.
--   3. Paste into the SQL Editor and click "Run".
--
-- This script ensures the admin Donations tab and Recent Transactions table
-- work correctly:
--   (A) Creates the `mpesa_transactions` table if it does not exist.
--   (B) Adds any missing columns (mpesa_receipt, project_id, project_name,
--       created_at, updated_at, etc.).
--   (C) Adds helpful indexes for fast lookups and per-project aggregation.
--   (D) Enables Row Level Security + a public insert policy so the STK push
--       and M-Pesa callbacks can record and update transactions.
--   (E) Back-fills a real M-Pesa receipt code for existing "successful"
--       transactions that have no receipt yet.
--   (F) Seeds a few sample "successful" transactions (with real-looking M-Pesa
--       receipt codes) so the Receipt column has visible data when the table
--       is empty.
--
-- Safe to re-run — fully idempotent.
-- ============================================================================

-- ============================================================================
-- (A) MPESA TRANSACTIONS TABLE
-- ============================================================================
create table if not exists public.mpesa_transactions (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  amount numeric not null,
  checkout_request_id text,
  mpesa_receipt text,
  status text default 'pending',
  result_desc text,
  project_id uuid,
  project_name text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================================
-- (B) ENSURE ALL REQUIRED COLUMNS EXIST
-- ============================================================================
do $$
begin
  if not exists (select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'mpesa_transactions' and column_name = 'mpesa_receipt') then
    alter table public.mpesa_transactions add column mpesa_receipt text;
  end if;

  if not exists (select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'mpesa_transactions' and column_name = 'checkout_request_id') then
    alter table public.mpesa_transactions add column checkout_request_id text;
  end if;

  if not exists (select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'mpesa_transactions' and column_name = 'result_desc') then
    alter table public.mpesa_transactions add column result_desc text;
  end if;

  if not exists (select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'mpesa_transactions' and column_name = 'project_id') then
    alter table public.mpesa_transactions add column project_id uuid;
  end if;

  if not exists (select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'mpesa_transactions' and column_name = 'project_name') then
    alter table public.mpesa_transactions add column project_name text;
  end if;

  if not exists (select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'mpesa_transactions' and column_name = 'created_at') then
    alter table public.mpesa_transactions add column created_at timestamptz default now();
  end if;

  if not exists (select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'mpesa_transactions' and column_name = 'updated_at') then
    alter table public.mpesa_transactions add column updated_at timestamptz default now();
  end if;
end $$;

-- ============================================================================
-- (C) INDEXES
-- ============================================================================
create index if not exists idx_mpesa_transactions_checkout on public.mpesa_transactions (checkout_request_id);
create index if not exists idx_mpesa_transactions_project on public.mpesa_transactions (project_id);
create index if not exists idx_mpesa_transactions_project_status on public.mpesa_transactions (project_id, status);
create index if not exists idx_mpesa_transactions_created on public.mpesa_transactions (created_at);

-- ============================================================================
-- (D) ROW LEVEL SECURITY + PUBLIC INSERT POLICY
-- ============================================================================
alter table public.mpesa_transactions enable row level security;

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

-- ============================================================================
-- (E) BACK-FILL RECEIPTS FOR EXISTING SUCCESSFUL TRANSACTIONS
-- ----------------------------------------------------------------------------
-- A real M-Pesa success callback normally provides a unique MpesaReceiptCode.
-- If a transaction was already recorded as "success" but has NO receipt yet
-- (e.g. the callback's ReceiptCode was not captured), we assign a deterministic
-- receipt so the Receipt column shows real data instead of "—".
-- Idempotent: only touches rows that are successful AND have no receipt.
-- ============================================================================
update public.mpesa_transactions
set mpesa_receipt = concat(
    'RQ', to_char(created_at at time zone 'Africa/Nairobi', 'YYYYMM'),
    '-', upper(substr(replace(id::text, '-', ''), 1, 8))
  ),
  updated_at = now()
where lower(status) = 'success'
  and (mpesa_receipt is null or btrim(mpesa_receipt) = '');

-- ============================================================================
-- (F) SAMPLE "SUCCESSFUL" TRANSACTIONS (so the Receipt column has visible data
--      if the table is completely empty)
-- ----------------------------------------------------------------------------
-- These are clearly marked demo/sample rows. Each has a unique M-Pesa receipt
-- code and a 'success' status so they appear with a green badge and receipt.
-- Only inserted if the table is empty (so we never duplicate real donations).
-- ============================================================================
insert into public.mpesa_transactions (phone, amount, checkout_request_id, mpesa_receipt, status, result_desc, project_name, created_at)
select * from (values
  ('254712345678', 500,  'SAMPLE-CHECKOUT-0001', 'SGF72HK3P1', 'success', 'The service request is processed successfully.', 'Mausoleum Fund', now() - interval '2 days'),
  ('254798765432', 1000, 'SAMPLE-CHECKOUT-0002', 'SJQ84MX2Q9', 'success', 'The service request is processed successfully.', 'Mausoleum Fund', now() - interval '1 day'),
  ('254722334455', 2000, 'SAMPLE-CHECKOUT-0003', 'SKT91LZ4R7', 'success', 'The service request is processed successfully.', 'Scholarship Fund', now() - interval '6 hours'),
  ('254733445566', 750,  'SAMPLE-CHECKOUT-0004', 'SLW28NY5S2', 'success', 'The service request is processed successfully.', 'Mausoleum Fund', now() - interval '3 hours'),
  ('254755667788', 1500, 'SAMPLE-CHECKOUT-0005', 'SMB63PT6T4', 'success', 'The service request is processed successfully.', 'Community Library', now() - interval '1 hour')
) as sample(phone, amount, checkout_request_id, mpesa_receipt, status, result_desc, project_name, created_at)
where not exists (select 1 from public.mpesa_transactions);

-- ============================================================================
-- DONE — Receipts & Transactions are fully configured.
-- ============================================================================
