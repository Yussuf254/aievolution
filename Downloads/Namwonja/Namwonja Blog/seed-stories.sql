-- ============================================================
-- Seed Story Index — Link existing static stories to the Admin dashboard
-- ============================================================
-- These INSERTs populate the `stories` table with metadata for the
-- existing static story pages on the site. The admin dashboard's
-- Stories tab (`/api/admin?type=stories`) reads from this table, so
-- once seeded the stories will appear and can be managed there.
--
-- IMPORTANT: The story *content* still lives in the static HTML pages
-- on the site. The `slug` for each row matches the static page name so
-- that the site's dynamic viewer (blog.html?slug=...) and the stories
-- grid (category.html / index.html) can resolve them consistently.
--
-- Run this in the Supabase SQL Editor (Dashboard -> SQL Editor).
-- The script is idempotent: re-running it will not create duplicates.
-- ============================================================

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
  -- If a row already exists for the slug, refresh its metadata so it stays
  -- in sync with any edits made in the admin dashboard.
  title = EXCLUDED.title,
  excerpt = EXCLUDED.excerpt,
  category = EXCLUDED.category,
  cover_image = EXCLUDED.cover_image,
  author = EXCLUDED.author,
  is_published = EXCLUDED.is_published;
