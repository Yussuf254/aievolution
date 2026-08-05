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

  ready(function () {
    var grid = document.getElementById("storiesGrid");
    if (!grid) return;

    fetch("/api/stories")
      .then(function (r) { return r.json(); })
      .then(function (stories) {
        if (!stories || !stories.length) return;
        grid.innerHTML = "";
        stories.forEach(function (story) {
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
          grid.appendChild(card);
        });
      })
      .catch(function () {
        // If API fails, keep static content (graceful fallback)
      });
  });
})();

