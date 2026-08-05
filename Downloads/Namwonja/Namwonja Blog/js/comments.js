// Comments module - loads and submits comments for a story page.
(function () {
  "use strict";

  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  // Determine the story slug from the current page filename
  function getStorySlug() {
    var path = window.location.pathname.split("/").pop() || "index.html";
    return path.replace(/\.html$/, "");
  }

  ready(function () {
    var container = document.getElementById("commentsSection");
    if (!container) return;

    var storySlug = container.getAttribute("data-story") || getStorySlug();
    var list = document.getElementById("commentsList");
    var form = document.getElementById("commentForm");
    var status = document.getElementById("commentStatus");

    // ---- Load comments ----
    function loadComments() {
      fetch("/api/comments?story=" + encodeURIComponent(storySlug))
        .then(function (r) { return r.json(); })
        .then(function (comments) {
          if (!list) return;
          list.innerHTML = "";
          if (!comments || !comments.length) {
            list.innerHTML = '<p class="no-comments">No comments yet. Be the first to share your thoughts.</p>';
            return;
          }
          comments.forEach(function (c) {
            var div = document.createElement("div");
            div.className = "comment-item";
            var time = new Date(c.created_at).toLocaleDateString("en-US", {
              year: "numeric", month: "long", day: "numeric"
            });
            div.innerHTML =
              '<div class="comment-head"><strong>' + escapeHtml(c.name) + '</strong>' +
              '<span class="comment-date">' + time + '</span></div>' +
              '<p class="comment-body">' + escapeHtml(c.message) + '</p>';
            list.appendChild(div);
          });
        })
        .catch(function () {
          if (list) list.innerHTML = '<p class="no-comments">Could not load comments.</p>';
        });
    }

    // ---- Submit comment ----
    if (form) {
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var name = document.getElementById("commentName").value.trim();
        var email = document.getElementById("commentEmail").value.trim();
        var message = document.getElementById("commentMessage").value.trim();

        if (!name || !message) {
          if (status) status.textContent = "Please fill in your name and message.";
          return;
        }

        if (status) {
          status.textContent = "Submitting...";
          status.className = "comment-status";
        }

        fetch("/api/comments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ story_slug: storySlug, name: name, email: email, message: message })
        })
        .then(function (r) {
          return r.json().then(function (data) { return { ok: r.ok, status: r.status, data: data }; });
        })
        .then(function (res) {
          if (res.ok && res.data && !res.data.error) {
            if (status) {
              status.textContent = res.data.message || "Thank you! Your comment has been submitted for review.";
              status.className = "comment-status success";
            }
            form.reset();
          } else {
            if (status) {
              status.textContent = (res.data && res.data.error) || "Could not submit your comment. Please try again.";
              status.className = "comment-status error";
            }
          }
        })
        .catch(function () {
          if (status) {
            status.textContent = "Something went wrong. Please try again.";
            status.className = "comment-status error";
          }
        });
      });
    }

    loadComments();
  });

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }
})();
