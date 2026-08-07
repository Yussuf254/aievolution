// Stories module - loads published stories from the DB and renders cards.
// Used by category.html and index.html (featured grid).
(function () {
  "use strict";

  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  // Build a single story card from a DB row. Links go to blog.html?slug= so the
  // public site renders the live DB content (reflecting admin edits).
  function buildCard(story) {
    var card = document.createElement("article");
    card.className = "mag-story-card revealed"; // revealed => visible even though snippet adds data-reveal
    card.setAttribute("data-reveal", "fade");
    var img = story.cover_image || "images/blog/Paul Khasamba.jpeg";
    var date = new Date(story.published_at).toLocaleDateString("en-US", {
      year: "numeric", month: "long", day: "numeric"
    });
    var href = "blog.html?slug=" + encodeURIComponent(story.slug);
    card.innerHTML =
      '<div class="mag-story-card-thumb">' +
        '<img src="' + escapeHtml(img) + '" alt="' + escapeHtml(story.title) + '" loading="lazy" />' +
      '</div>' +
      '<div class="mag-story-card-body">' +
        '<div class="mag-story-card-meta">' +
          '<span>By ' + escapeHtml(story.author || 'Namwonja Heritage Journal') + '</span>' +
          '<span><i class="fa fa-clock-o"></i> ' + date + '</span>' +
        '</div>' +
        '<h3><a href="' + escapeHtml(href) + '">' + escapeHtml(story.title) + '</a></h3>' +
        '<p>' + escapeHtml(story.excerpt || '') + '</p>' +
        '<a href="' + escapeHtml(href) + '" class="mag-story-card-link">Read more <i class="fa fa-arrow-right"></i></a>' +
      '</div>';
    return card;
  }

  ready(function () {
    var grid = document.getElementById("storiesGrid");
    if (!grid) return;

    var staticSlugs = [
      "cover-story", "leadership-story", "senior-chief-mukudi",
      "heritage-story", "community-story", "story-4", "story-5",
      "single-blog", "agnes-ogula-ludaava", "dollrose-mukudi",
      "edith-sumba-mukudi-omwami", "prof-paul-ogula-namwonza"
    ];

    // Cache-bust every request so the grids never show stale DB content
    // after an admin edit.
    fetch("/api/stories?_=" + Date.now())
      .then(function (r) { return r.json(); })
      .then(function (stories) {
        if (!stories || !stories.length) return;
        // DB is the source of truth — rebuild the grid entirely so admin edits
        // (titles, excerpts, new stories) always reflect on the site.
        grid.innerHTML = "";
        stories.forEach(function (story) {
          if (story.is_published === false) return;
          grid.appendChild(buildCard(story));
        });
      })
      .catch(function () {
        // Only on a genuine API failure do we keep any pre-rendered static cards.
        // Update their links so they still route to the DB-driven blog.html viewer.
        grid.querySelectorAll("h3 a, .mag-story-card-link").forEach(function (a) {
          var href = a.getAttribute("href") || "";
          var slug = href.replace(/\.html?$/i, "").replace(/^.*\//, "");
          if (staticSlugs.indexOf(slug) !== -1) {
            a.setAttribute("href", "blog.html?slug=" + encodeURIComponent(slug));
          }
        });
      });
  });
})();

