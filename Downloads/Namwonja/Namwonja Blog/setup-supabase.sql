-- ============================================================================
-- Namwonja Heritage Journal — Complete Supabase Setup
-- ----------------------------------------------------------------------------
-- HOW TO USE:
--   1. Open your Supabase project → SQL Editor.
--   2. Copy the ENTIRE contents of this file.
--   3. Paste into the SQL Editor and click "Run".
--
-- This combined script:
--   (A) Creates / repairs all core tables (stories, comments, contact_messages,
--       mpesa_transactions, admins) + missing columns + indexes.
--   (B) Creates the admin support tables (authors, contributors, admin_users,
--       admin_roles, site_settings, audit_log).
--   (C) Seeds the 4 default roles.
--   (D) Sets up Row Level Security + public policies.
--   (E) Seeds all 12 static stories and populates content for the heritage story.
--
-- The script is idempotent — re-running it is safe and will not create
-- duplicates or errors.
-- ============================================================================

-- ============================================================================
-- (A) CORE TABLES
-- ============================================================================

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

-- ============================================================================
-- (B) ADMIN SUPPORT TABLES
-- ============================================================================

-- AUTHORS
create table if not exists public.authors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  bio text,
  avatar text,
  status text default 'active',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- CONTRIBUTORS
create table if not exists public.contributors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  bio text,
  status text default 'active',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ADMIN USERS
create table if not exists public.admin_users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  role text default 'author',
  status text default 'active',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ADMIN ROLES
create table if not exists public.admin_roles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  permissions text[] default '{}',
  status text default 'active',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- SITE SETTINGS (single-row store: id = 1, payload holds JSON)
create table if not exists public.site_settings (
  id integer primary key,
  payload jsonb default '{}'::jsonb,
  updated_at timestamptz default now()
);

-- AUDIT LOG
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor text,
  action text,
  target_type text,
  target_id text,
  details text,
  created_at timestamptz default now()
);

-- ============================================================================
-- (C) SEED DEFAULT ROLES (idempotent)
-- ============================================================================
insert into public.admin_roles (name, description, permissions)
select v.name, v.description, v.permissions
from (values
  ('Administrator', 'Full access to all features', array['read','write','delete','publish']),
  ('Editor', 'Can manage and publish content', array['read','write','publish']),
  ('Author', 'Can create and edit own stories', array['read','write']),
  ('Contributor', 'Can submit stories for review', array['read'])
) as v(name, description, permissions)
where not exists (
  select 1 from public.admin_roles r where r.name = v.name
);

-- ============================================================================
-- (D) ROW LEVEL SECURITY + POLICIES
-- ============================================================================

-- Enable RLS on all tables
alter table public.stories enable row level security;
alter table public.comments enable row level security;
alter table public.contact_messages enable row level security;
alter table public.mpesa_transactions enable row level security;
alter table public.admins enable row level security;
alter table public.authors enable row level security;
alter table public.contributors enable row level security;
alter table public.admin_users enable row level security;
alter table public.admin_roles enable row level security;
alter table public.site_settings enable row level security;
alter table public.audit_log enable row level security;

-- Public read published stories
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'stories' and policyname = 'Public read published stories') then
    create policy "Public read published stories" on public.stories for select using (is_published = true);
  end if;
end $$;

-- Public read approved comments (auto-detect approval column)
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
    execute 'drop policy if exists "Public read approved comments" on public.comments';
    execute format('create policy "Public read approved comments" on public.comments for select using (%I = true)', comment_col);
  end if;
end $$;

-- Public insert comments
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'comments' and policyname = 'Public insert comments') then
    create policy "Public insert comments" on public.comments for insert with check (true);
  end if;
end $$;

-- Public insert contact
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'contact_messages' and policyname = 'Public insert contact') then
    create policy "Public insert contact" on public.contact_messages for insert with check (true);
  end if;
end $$;

-- Public insert mpesa
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'mpesa_transactions' and policyname = 'Public insert mpesa') then
    create policy "Public insert mpesa" on public.mpesa_transactions for insert with check (true);
  end if;
end $$;

-- ============================================================================
-- ENSURE REQUIRED COLUMNS EXIST + INDEXES
-- ============================================================================

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

-- Comments: ensure email column exists
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

-- Comments: approval index (auto-detect)
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

-- ============================================================================
-- (E) SEED STORIES
-- ============================================================================
INSERT INTO public.stories
  (slug, title, excerpt, category, cover_image, author, published_at, is_published)
VALUES
  -- 1. Cover Story — Paul Khasamba Namwonja Mukudi
  (
    'cover-story',
    'Paul Khasamba Namwonja Mukudi: A Pre-Colonial Sovereign of the Kavirondo Gulf and His Enduring Legacy',
    'Explore the enduring legacy of Paul Khasamba Namwonja Mukudi — a pre-colonial monarch whose influence stretched across the Kavirondo Gulf, Lake Victoria, and the diaspora of his bloodline.',
    'Cover Story',
    'images/blog/Paul Khasamba.jpeg',
    'Namwonja Heritage Journal',
    now() - interval '1 day',
    true
  ),

  -- 2. Leadership Story
  (
    'leadership-story',
    'The Principles That Shaped Chief Namwonja Mukudi''s Vision',
    'His leadership was rooted in service, discipline, and a steady commitment to uplifting the people around him.',
    'Leadership',
    'images/blog/BLog.jpeg',
    'Namwonja Heritage Journal',
    now() - interval '31 days',
    true
  ),

  -- 3. Senior Chief Mukudi
  (
    'senior-chief-mukudi',
    'Senior Chief Mukudi: The Oath, the Prison, and the Liberation of Bunyala',
    'The son of Namwonja swore the Mau Mau oath even in retirement, orchestrating the movement across Bunyala until his arrest at Kajiado Prison in 1954.',
    'Resistance',
    'images/blog/Mukudi1.jpeg',
    'Namwonja Heritage Journal',
    now() - interval '76 days',
    true
  ),

  -- 4. Heritage Story
  (
    'heritage-story',
    'How Tradition and Modern Leadership Meet in His Legacy',
    'Chief Namwonja Mukudi carried cultural pride into every decision, proving that heritage can guide progress.',
    'Heritage',
    'images/blog/blog (2).jpeg',
    'Namwonja Heritage Journal',
    now() - interval '34 days',
    true
  ),

  -- 5. Community Story
  (
    'community-story',
    'The Community Spirit That Defined His Influence',
    'His impact was never only personal; it was felt in families, gatherings, and the steady growth of the wider community.',
    'Community',
    'images/blog/blog (3).jpeg',
    'Namwonja Heritage Journal',
    now() - interval '43 days',
    true
  ),

  -- 6. Story 4 — Diplomacy and Memory
  (
    'story-4',
    'Family and Service: The Quiet Strength Behind the Legacy',
    'Family values shaped the inner strength behind the public life and wider influence of the legacy.',
    'Diplomacy',
    'images/blog/Paul Khasamba.jpeg',
    'Namwonja Heritage Journal',
    now() - interval '51 days',
    true
  ),

  -- 7. Story 5 — Encounter with Colonialism
  (
    'story-5',
    'Continuing the Legacy: Memory, Teaching, and Renewal',
    'The story survives through teaching, remembrance, and the quiet influence of lived values.',
    'History',
    'images/blog/Paul Khasamba.jpeg',
    'Namwonja Heritage Journal',
    now() - interval '58 days',
    true
  ),

  -- 8. Single Blog — Legacy Reflection
  (
    'single-blog',
    'Chief Namwonja Mukudi: A Legacy of Courage, Wisdom, and Service',
    'A reflection on the values, influence, and legacy of Chief Namwonja Mukudi.',
    'Leadership',
    'images/blog/Paul Khasamba.jpeg',
    'Namwonja Heritage Journal',
    now() - interval '31 days',
    true
  ),

  -- 9. Agnes Ogula Ludaava (Notable Figure)
  (
    'agnes-ogula-ludaava',
    'Agnes Ogula Ludaava: Communication Scholar and Public Servant',
    'A renowned Kenyan communication scholar, journalist, trainer, and former Assistant Director of Information.',
    'Notable Figures',
    'images/about/Agnes Ogula.jpeg',
    'Namwonja Heritage Journal',
    now() - interval '90 days',
    true
  ),

  -- 10. Dollrose Mukudi (Notable Figure)
  (
    'dollrose-mukudi',
    'Dollrose Mukudi: Educator, Mentor, and Community Leader',
    'Founder of Lakebreeze Academy in Port Victoria — a respected educator, mentor, and community leader.',
    'Notable Figures',
    'images/about/Dollrose Mukudi.png',
    'Namwonja Heritage Journal',
    now() - interval '90 days',
    true
  ),

  -- 11. Prof. Edith Sumba Mukudi Omwami (Notable Figure)
  (
    'edith-sumba-mukudi-omwami',
    'Prof. Edith Sumba Mukudi Omwami: Professor of Education, UCLA',
    'Professor of Education at UCLA whose research focuses on educational access, equity, and international development.',
    'Notable Figures',
    'images/about/Prof.Edith Mukudi.png',
    'Namwonja Heritage Journal',
    now() - interval '90 days',
    true
  ),

  -- 12. Prof. Paul Ogula Namwonza (Notable Figure)
  (
    'prof-paul-ogula-namwonza',
    'Prof. Paul Ogula Namwonza: Scholar and Leader in Education',
    'Former Head of Research and Evaluation at the Kenya Institute of Education and chairman of the Society of Educational Research and Evaluation in Kenya.',
    'Notable Figures',
    'images/blog/blog-thum-1.jpeg',
    'Namwonja Heritage Journal',
    now() - interval '90 days',
    true
  )
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title,
  excerpt = EXCLUDED.excerpt,
  category = EXCLUDED.category,
  cover_image = EXCLUDED.cover_image,
  author = EXCLUDED.author,
  is_published = EXCLUDED.is_published;

-- ============================================================================
-- (F) POPULATE CONTENT FOR HERITAGE STORY
-- ============================================================================
UPDATE public.stories
SET content_html = $story$
<h2>Diaspora of Blood</h2>
<p class="mag-lead">Today, the Luhyas, Luos, and Baganda carry the bloodline of Namwonja Mukudi across the vast reaches of his former empire.</p>
<p>His descendants are found across two counties and many locations:</p>
<ul>
  <li><strong>Siaya County:</strong> Mulambo Majimbo, Yimbo Kadimo, Bukhwaya in Osieko (present-day Bondo Sub-County), Busonga Bumwango Mwango hill in Alego Usonga, and Odiado (Ugenya Sub-County).</li>
  <li><strong>Busia County:</strong> Bukangala and Bukhekhe in Samia (Samia Sub-County), Bukhayo in Matayos Sub-County, and Buongo, Mundika, and Bukhuma in Bunyala Sub-County.</li>
</ul>
<h2>Dynastic Lineage</h2>
<p>Paul Nawonja Mukudi was a hereditary king from the ruling dynasty of the Abamulembo clan. He was the firstborn son of Omwami Mukudi Khainja and Akelo, daughter of Agalo Omunyekera of the Abayima sub-clan of the Abanyekera clan, and Kombo Nabukaki, from the Ababukaki (Luo Kaugagi) clan.</p>
<p>To rule was not merely to hold power; it was to carry a trust — a trust that Namwonja Mukudi honored through service, reform, and the elevation of his people.</p>
<h2>Lake Victoria and Island Sovereignty</h2>
<p>On Lake Victoria, Namwonja Mukudi's rule extended over the islands of Sigulu, Khama, Sumba, Makera (Mageta), Jagusi, Wayasi, Lolwe, Siro, Migingo, Ringiti, and Oyamo. He maintained diplomatic and kinship relations across these islands through strategic intermarriages.</p>
<p>Sigulu Island was divided into eastern and western sectors. The River Somokho, flowing through Bukhoba, Buyanga, and Somokho, served as the boundary: the eastern portion fell under Kenyan jurisdiction, while the western portion belonged to Uganda.</p>
$story$
WHERE slug = 'heritage-story';

-- ============================================================================
-- DONE — Your Supabase database is fully configured.
-- ============================================================================
