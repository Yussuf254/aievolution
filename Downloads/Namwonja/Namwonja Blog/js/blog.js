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
    return params.get("slug") || "";
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

    fetch("/api/stories?slug=" + encodeURIComponent(slug))
      .then(function (r) { return r.json(); })
      .then(function (res) {
        var story = Array.isArray(res) ? res[0] : res;
        if (!story || story.error) {
          document.getElementById("storyTitle").textContent = "Story not found";
          var c2 = document.getElementById("storyContent");
          if (c2) c2.innerHTML = '<p class="mag-lead">Sorry, we couldn\'t find that story. <a href="category.html">Browse all stories</a>.</p>';
          return;
        }

        document.title = story.title + " | Namwonja Heritage Journal";

        document.getElementById("storyTitle").textContent = story.title;
        document.getElementById("storyExcerpt").textContent = story.excerpt || "";
        document.getElementById("storyExcerptSide").textContent = story.excerpt || "";
        document.getElementById("storyDate").textContent = fmtDate(story.published_at || story.created_at);
        document.getElementById("storyAuthor").textContent = story.author || "Namwonja Heritage Journal";
        document.getElementById("storyCategoryLink").textContent = story.category || "Story";

        var img = document.getElementById("storyFigureImg");
        img.src = story.cover_image || "images/blog/Paul Khasamba.jpeg";
        img.alt = story.title;

        // Render content HTML (admin-entered). Sanitize links? Keep simple: allow HTML from admin.
        var content = document.getElementById("storyContent");
        content.innerHTML = story.content_html || "<p></p>";

        // Share links
        var url = encodeURIComponent(window.location.href);
        document.getElementById("shareFb").setAttribute("href", "https://www.facebook.com/sharer/sharer.php?u=" + url);
        document.getElementById("shareTw").setAttribute("href", "https://twitter.com/intent/tweet?url=" + url + "&text=" + encodeURIComponent(story.title));
        document.getElementById("shareWa").setAttribute("href", "https://api.whatsapp.com/send?text=" + encodeURIComponent(story.title) + "%20" + url);

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

