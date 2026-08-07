// Blog template — loads a story from the DB by ?slug= and renders it.
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

  function getSlug() {
    var params = new URLSearchParams(window.location.search);
    var qs = params.get("slug");
    if (qs) return qs;

    var path = window.location.pathname;
    var file = path.replace(/^.*[\\/]/, "").replace(/\?.*$/, "");
    if (!file) return "";
    var slug = file.replace(/\.html?$/i, "");
    if (!slug) return "";

    var nonStoryPages = ["index", "about", "category", "contact", "support", "admin", "blog"];
    if (nonStoryPages.indexOf(slug) !== -1) return "";

    return slug;
  }

  function fmtDate(s) {
    if (!s) return "";
    var d = new Date(s);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  }

  ready(function () {
    var slug = getSlug();
    if (!slug) {
      document.getElementById("storyTitle").textContent = "Story not found";
      var c = document.getElementById("storyContent");
      if (c) c.innerHTML = '<p class="mag-lead">No story was specified. <a href="category.html">Browse all stories</a>.</p>';
      return;
    }

    document.getElementById("commentsSection").setAttribute("data-story", slug);

    fetch("/api/stories?slug=" + encodeURIComponent(slug) + "&_=" + Date.now())
      .then(function (r) {
        console.log("[blog.js] API response status:", r.status, "for slug:", slug);
        return r.json();
      })
      .then(function (res) {
        var story = Array.isArray(res) ? res[0] : res;
        console.log("[blog.js] Fetched story:", story ? { slug: story.slug, title: story.title, hasContent: !!story.content_html, contentLength: (story.content_html || "").length } : "NOT FOUND");
        if (!story || story.error) {
          document.getElementById("storyTitle").textContent = "Story not found";
          var c2 = document.getElementById("storyContent");
          if (c2) c2.innerHTML = '<p class="mag-lead">Sorry, we couldn\'t find that story. <a href="category.html">Browse all stories</a>.</p>';
          return;
        }

document.title = story.title + " | Namwonja Heritage Journal";

        // Title — use the standard element, or fall back to the page's first H1
        // (covers the profile pages that use a different hero markup).
        var titleEl = document.getElementById("storyTitle");
        if (!titleEl) titleEl = document.querySelector("h1");
        if (titleEl) titleEl.textContent = story.title;

        // Meta description (helps keep the tab/social preview in sync).
        var metaDesc = document.querySelector('meta[name="description"]');
        if (metaDesc) metaDesc.setAttribute("content", story.excerpt || story.title || "");

        var excerptEl = document.getElementById("storyExcerpt");
        if (excerptEl) excerptEl.textContent = story.excerpt || "";

        var excerptSideEl = document.getElementById("storyExcerptSide");
        if (excerptSideEl) excerptSideEl.textContent = story.excerpt || "";

        var dateEl = document.getElementById("storyDate");
        if (dateEl) dateEl.textContent = fmtDate(story.published_at || story.created_at);

        var authorEl = document.getElementById("storyAuthor");
        if (authorEl) authorEl.textContent = story.author || "Namwonja Heritage Journal";

        var catEl = document.getElementById("storyCategoryLink");
        if (catEl) catEl.textContent = story.category || "Story";

        var img = document.getElementById("storyFigureImg");
        if (img) {
          img.src = story.cover_image || "images/blog/Paul Khasamba.jpeg";
          img.alt = story.title || "Story cover image";
        } else {
          // Profile pages: update the first hero <img> + the og:image meta tag.
          var heroImg = document.querySelector(".mag-profile-photo img, .mag-story-figure img, figure img");
          if (heroImg && story.cover_image) {
            heroImg.src = story.cover_image;
            heroImg.alt = story.title || "Story cover image";
          }
          var ogImg = document.querySelector('meta[property="og:image"]');
          if (ogImg && story.cover_image) ogImg.setAttribute("content", story.cover_image);
        }

var content = document.getElementById("storyContent");
        if (content) {
          // DB-first rendering: always show the live DB content so admin edits
          // reflect on the public site. Never leave stale hardcoded HTML on screen.
          if (story.content_html && story.content_html.trim()) {
            content.innerHTML = story.content_html;
          } else {
            content.innerHTML =
              '<section class="mag-section"><div class="mag-container">' +
              '<p class="mag-lead">This story has no body content yet. ' +
              'An administrator can add content from the <a href="admin.html">Admin dashboard</a>.</p>' +
              '</div></section>';
          }
        }

        // Share links
        var url = encodeURIComponent(window.location.href);
        var shareFb = document.getElementById("shareFb");
        if (shareFb) shareFb.setAttribute("href", "https://www.facebook.com/sharer/sharer.php?u=" + url);
        var shareTw = document.getElementById("shareTw");
        if (shareTw) shareTw.setAttribute("href", "https://twitter.com/intent/tweet?url=" + url + "&text=" + encodeURIComponent(story.title));
        var shareWa = document.getElementById("shareWa");
        if (shareWa) shareWa.setAttribute("href", "https://api.whatsapp.com/send?text=" + encodeURIComponent(story.title) + "%20" + url);

        // Initialize reveal animations for newly injected content
        if (window.initMagReveal) {
          window.initMagReveal();
        }
      })
      .catch(function () {
        document.getElementById("storyTitle").textContent = "Could not load story";
        var c3 = document.getElementById("storyContent");
        if (c3) c3.innerHTML = '<p class="mag-lead">There was a problem loading this story. Please try again later.</p>';
      });
  });
})();

