// Admin dashboard logic
(function () {
  "use strict";

  var token = localStorage.getItem("namwonja_admin_token") || "";

  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  function authHeaders() {
    return { "Content-Type": "application/json", "Authorization": "Basic " + token };
  }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  function fmtDate(s) {
    if (!s) return "—";
    var d = new Date(s);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  }

  // Build a lazy-loaded <img> tag with a blur-up / shimmer placeholder
  function buildLazyImg(cssClass, src, alt) {
    var cls = cssClass + ' img-lazy';
    return '<img class="' + cls + '" src="' + escapeHtml(src) + '" alt="' + escapeHtml(alt || "") + '" loading="lazy" decoding="async" onload="this.classList.add(\'loadable\')" />';
  }

  ready(function () {
    var login = document.getElementById("adminLogin");
    var panel = document.getElementById("adminPanel");

    if (token) { showPanel(); loadAll(); }

    // ---- Login ----
    document.getElementById("adminLoginForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var username = document.getElementById("adminUser").value.trim();
      var password = document.getElementById("adminPass").value;
      var status = document.getElementById("adminLoginStatus");

      status.textContent = "Signing in…";
      status.className = "comment-status";

      fetch("/api/admin-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username, password: password })
      })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.ok && data.token) {
          token = data.token;
          localStorage.setItem("namwonja_admin_token", token);
          showPanel();
          loadAll();
        } else {
          status.textContent = data.error || "Invalid credentials";
          status.className = "comment-status error";
        }
      })
      .catch(function () {
        status.textContent = "Network error";
        status.className = "comment-status error";
      });
    });

    // ---- Logout ----
    document.getElementById("adminLogout").addEventListener("click", function () {
      token = "";
      localStorage.removeItem("namwonja_admin_token");
      login.style.display = "block";
      panel.style.display = "none";
    });

    // ---- Tabs ----
    document.querySelectorAll(".admin-nav button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        document.querySelectorAll(".admin-nav button").forEach(function (b) { b.classList.remove("active"); });
        btn.classList.add("active");
        document.querySelectorAll(".admin-section").forEach(function (s) { s.classList.remove("active"); });
        var tab = document.getElementById("tab-" + btn.getAttribute("data-tab"));
        if (tab) tab.classList.add("active");
      });
    });

    // ---- Story editor: image upload ----
    var coverDrop = document.getElementById("storyCoverDrop");
    var coverFile = document.getElementById("storyCoverFile");
    var coverPreview = document.getElementById("storyCoverPreview");
    var coverInput = document.getElementById("storyCover");
    var uploadStatus = document.getElementById("uploadStatus");
    var pendingUpload = null;

    function setCoverPreview(url) {
      if (url) {
        coverPreview.src = url;
        coverPreview.classList.add("show");
      } else {
        coverPreview.classList.remove("show");
        coverPreview.removeAttribute("src");
      }
    }

    function clearUploadStatus() {
      if (uploadStatus) {
        uploadStatus.textContent = "";
        uploadStatus.className = "admin-upload-status";
      }
    }

    function failUpload(msg) {
      if (uploadStatus) {
        uploadStatus.textContent = msg;
        uploadStatus.className = "admin-upload-status";
      }
    }

    function successUpload(msg) {
      if (uploadStatus) {
        uploadStatus.textContent = msg;
        uploadStatus.className = "admin-upload-status success";
      }
    }

    if (coverDrop && coverFile) {
      coverDrop.addEventListener("click", function () { coverFile.click(); });
      coverDrop.addEventListener("dragover", function (e) {
        e.preventDefault();
        coverDrop.classList.add("over");
      });
      coverDrop.addEventListener("dragleave", function () { coverDrop.classList.remove("over"); });
      coverDrop.addEventListener("drop", function (e) {
        e.preventDefault();
        coverDrop.classList.remove("over");
        if (e.dataTransfer.files && e.dataTransfer.files.length) {
          handleCoverFile(e.dataTransfer.files[0]);
        }
      });
      coverFile.addEventListener("change", function () {
        if (coverFile.files && coverFile.files.length) {
          handleCoverFile(coverFile.files[0]);
        }
      });
    }

    function handleCoverFile(file) {
      if (!uploadStatus) return;
      var type = (file.type || "").toLowerCase();
      var okTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
      if (okTypes.indexOf(type) === -1) {
        failUpload("Unsupported file type. Use JPG, PNG, WebP, or GIF.");
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        failUpload("Image exceeds 5 MB limit.");
        return;
      }

      var reader = new FileReader();
      reader.onload = function () {
        var base64 = reader.result;
        setCoverPreview(base64);
        uploadStatus.textContent = "Uploading image…";
        uploadStatus.className = "admin-upload-status";

        fetch("/api/upload", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ data: base64, fileName: file.name, mime: file.type })
        })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.error) { failUpload(data.error); return; }
          if (data.url) {
            coverInput.value = data.url;
            pendingUpload = data.url;
            setCoverPreview(data.url);
            successUpload("Image uploaded successfully.");
          } else {
            failUpload("Upload failed unexpectedly.");
          }
        })
        .catch(function () { failUpload("Upload failed. Check your connection."); });
      };
      reader.onerror = function () { failUpload("Could not read the file."); };
      reader.readAsDataURL(file);
    }

    document.getElementById("storyCoverClear").addEventListener("click", function () {
      coverInput.value = "";
      setCoverPreview(null);
      pendingUpload = null;
      clearUploadStatus();
      if (coverFile) coverFile.value = "";
    });

    coverInput.addEventListener("input", function () {
      var v = coverInput.value.trim();
      setCoverPreview(v ? v : null);
      pendingUpload = null;
    });

    // ---- Story editor ----
    document.getElementById("newStoryBtn").addEventListener("click", function () {
      openStoryEditor(null);
    });

    document.getElementById("storyForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var slug = document.getElementById("storySlug").value.trim();
      var payload = {
        slug: slug,
        title: document.getElementById("storyTitle").value.trim(),
        excerpt: document.getElementById("storyExcerpt").value.trim(),
        content_html: document.getElementById("storyContent").value,
        category: document.getElementById("storyCategory").value.trim(),
        cover_image: document.getElementById("storyCover").value.trim(),
        is_published: document.getElementById("storyPublished").checked
      };
      var editing = document.getElementById("storyForm").getAttribute("data-editing") === "true";
      var url = editing ? "/api/stories?slug=" + encodeURIComponent(slug) : "/api/stories";
      var method = editing ? "PUT" : "POST";

      fetch(url, { method: method, headers: authHeaders(), body: JSON.stringify(payload) })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.error) { alert(data.error); return; }
          var modalEl = document.getElementById("storyModal");
          var modal = bootstrap.Modal.getInstance(modalEl);
          if (modal) modal.hide();
          clearUploadStatus();
          loadAdmin("stories");
        })
        .catch(function () { alert("Could not save story"); });
    });

    function openStoryEditor(story) {
      document.getElementById("storyForm").setAttribute("data-editing", story ? "true" : "false");
      document.getElementById("storyModalTitle").textContent = story ? "Edit Story" : "New Story";
      document.getElementById("storySlug").value = story ? story.slug : "";
      document.getElementById("storyTitle").value = story ? story.title : "";
      document.getElementById("storyExcerpt").value = story ? story.excerpt || "" : "";
      document.getElementById("storyContent").value = story ? story.content_html || "" : "";
      document.getElementById("storyCategory").value = story ? story.category || "" : "";
      document.getElementById("storyCover").value = story ? story.cover_image || "" : "";
      document.getElementById("storyPublished").checked = story ? story.is_published : true;
      setCoverPreview(story && story.cover_image ? story.cover_image : null);
      clearUploadStatus();
      if (coverFile) coverFile.value = "";
      var modalEl = document.getElementById("storyModal");
      var modal = bootstrap.Modal.getOrCreateInstance(modalEl);
      modal.show();
    }

    // ---- Load all sections ----
    function loadAll() {
      loadAdmin("stories");
      loadAdmin("comments");
      loadAdmin("messages");
      loadAdmin("payments");
    }

    function loadAdmin(type) {
      var el = document.getElementById(type + "Table");
      if (el) el.innerHTML = '<div class="admin-loading"><div class="spinner-border" role="status"></div></div>';

      fetch("/api/admin?type=" + type, { headers: authHeaders() })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.error) { console.error(data.error); return; }
          if (type === "stories") renderStories(data);
          else if (type === "comments") renderComments(data);
          else if (type === "messages") renderMessages(data);
          else if (type === "payments") renderPayments(data);
        })
        .catch(function (e) { console.error(e); });
    }

    // ---- Render: Stories ----
    function renderStories(stories) {
      var el = document.getElementById("storiesTable");
      var stat = document.getElementById("statStories");
      if (stat) stat.textContent = stories ? stories.length : 0;
      if (!stories || !stories.length) {
        el.innerHTML = '<div class="admin-empty"><i class="fa fa-book"></i><p>No stories yet. Click &laquo; New Story &raquo; to create one.</p></div>';
        return;
      }
      var html = '<div class="table-responsive"><table class="admin-table"><thead><tr>' +
        '<th>Story</th><th>Category</th><th>Status</th><th>Date</th><th class="text-end">Actions</th>' +
        '</tr></thead><tbody>';
      stories.forEach(function (s) {
        var img = s.cover_image
          ? buildLazyImg("thumb", s.cover_image, s.title || "")
          : buildLazyImg("thumb", "images/blog/Paul Khasamba.jpeg", s.title || "");
        var status = s.is_published
          ? '<span class="status-badge approved">Published</span>'
          : '<span class="status-badge new">Draft</span>';
        html += '<tr>' +
          '<td><div class="d-flex align-items-center gap-3" style="min-width:260px">' + img +
            '<div><div class="title-cell">' + escapeHtml(s.title) + '</div>' +
            '<div class="muted small">' + escapeHtml(s.slug) + '</div></div></div></td>' +
          '<td>' + escapeHtml(s.category || "—") + '</td>' +
          '<td>' + status + '</td>' +
          '<td class="muted">' + fmtDate(s.published_at) + '</td>' +
          '<td><div class="admin-row-actions justify-content-end">' +
            '<button class="admin-btn admin-btn-outline admin-btn-sm" data-view="' + s.slug + '" title="View on site">View</button>' +
            '<button class="admin-btn admin-btn-outline admin-btn-sm" data-edit="' + s.slug + '" title="Edit">Edit</button>' +
            '<button class="admin-btn admin-btn-danger admin-btn-sm" data-del="' + s.slug + '" title="Delete">Delete</button>' +
          '</div></td></tr>';
      });
      html += '</tbody></table></div>';
      el.innerHTML = html;

      // Reveal any images that loaded from cache before the onload handler attached
      el.querySelectorAll("img.img-lazy").forEach(function (img) {
        if (img.complete && img.naturalWidth > 0) img.classList.add("loadable");
      });

      el.querySelectorAll("[data-edit]").forEach(function (b) {
        b.addEventListener("click", function () {
          var story = stories.find(function (s) { return s.slug === b.getAttribute("data-edit"); });
          openStoryEditor(story);
        });
      });
      el.querySelectorAll("[data-del]").forEach(function (b) {
        b.addEventListener("click", function () {
          if (!confirm("Delete this story?")) return;
          fetch("/api/stories?slug=" + encodeURIComponent(b.getAttribute("data-del")), {
            method: "DELETE", headers: authHeaders()
          }).then(function () { loadAdmin("stories"); loadStatsPartial(); });
        });
      });
      el.querySelectorAll("[data-view]").forEach(function (b) {
        b.addEventListener("click", function () {
          window.open("blog.html?slug=" + encodeURIComponent(b.getAttribute("data-view")), "_blank");
        });
      });
    }

    // ---- Render: Comments ----
    function storySlugFor(c) {
      return c.story_slug || c.post_slug || c.article_slug || c.story_id ||
        c.post_id || c.story || c.post || c.article || c.slug || "—";
    }

    function renderComments(comments) {
      var el = document.getElementById("commentsTable");
      var stat = document.getElementById("statPendingComments");
      var badge = document.getElementById("badgeComments");
      if (!comments) comments = [];
      var pending = comments.filter(function (c) { return !c.is_approved; }).length;
      if (stat) stat.textContent = pending;
      if (badge) badge.textContent = pending;

      if (!comments.length) {
        el.innerHTML = '<div class="admin-empty"><i class="fa fa-comments"></i><p>No comments yet.</p></div>';
        return;
      }
      var html = '<div class="table-responsive"><table class="admin-table"><thead><tr>' +
        '<th>Story</th><th>Name</th><th>Message</th><th>Status</th><th>Date</th><th class="text-end">Actions</th>' +
        '</tr></thead><tbody>';
      comments.forEach(function (c) {
        var status = c.is_approved
          ? '<span class="status-badge approved">Approved</span>'
          : '<span class="status-badge new">Pending</span>';
        var msg = escapeHtml(c.message || "");
        msg = msg.length > 90 ? msg.slice(0, 90) + "…" : msg;
        html += '<tr>' +
          '<td class="muted">' + escapeHtml(storySlugFor(c)) + '</td>' +
          '<td class="title-cell">' + escapeHtml(c.name) + '</td>' +
          '<td style="max-width:320px">' + msg + '</td>' +
          '<td>' + status + '</td>' +
          '<td class="muted">' + fmtDate(c.created_at) + '</td>' +
          '<td><div class="admin-row-actions justify-content-end">' +
            (!c.is_approved ? '<button class="admin-btn admin-btn-success admin-btn-sm" data-approve="' + c.id + '">Approve</button>' : '') +
            '<button class="admin-btn admin-btn-danger admin-btn-sm" data-delc="' + c.id + '">Delete</button>' +
          '</div></td></tr>';
      });
      html += '</tbody></table></div>';
      el.innerHTML = html;

      el.querySelectorAll("[data-approve]").forEach(function (b) {
        b.addEventListener("click", function () {
          fetch("/api/admin?type=comments&id=" + b.getAttribute("data-approve"), {
            method: "PUT", headers: authHeaders()
          }).then(function () { loadAdmin("comments"); loadAdmin("stories"); });
        });
      });
      el.querySelectorAll("[data-delc]").forEach(function (b) {
        b.addEventListener("click", function () {
          if (!confirm("Delete this comment?")) return;
          fetch("/api/admin?type=comments&id=" + b.getAttribute("data-delc"), {
            method: "DELETE", headers: authHeaders()
          }).then(function () { loadAdmin("comments"); });
        });
      });
    }

    // ---- Render: Messages ----
    function renderMessages(messages) {
      var el = document.getElementById("messagesTable");
      var stat = document.getElementById("statMessages");
      if (stat) stat.textContent = messages ? messages.length : 0;
      if (!messages || !messages.length) {
        el.innerHTML = '<div class="admin-empty"><i class="fa fa-envelope"></i><p>No contact messages.</p></div>';
        return;
      }
      var html = '<div class="table-responsive"><table class="admin-table"><thead><tr>' +
        '<th>Name</th><th>Email</th><th>Subject</th><th>Message</th><th>Date</th>' +
        '</tr></thead><tbody>';
      messages.forEach(function (m) {
        var msg = escapeHtml(m.message || "");
        msg = msg.length > 90 ? msg.slice(0, 90) + "…" : msg;
        html += '<tr>' +
          '<td class="title-cell">' + escapeHtml(m.name) + '</td>' +
          '<td class="muted">' + escapeHtml(m.email) + '</td>' +
          '<td>' + escapeHtml(m.subject || "—") + '</td>' +
          '<td style="max-width:320px">' + msg + '</td>' +
          '<td class="muted">' + fmtDate(m.created_at) + '</td></tr>';
      });
      html += '</tbody></table></div>';
      el.innerHTML = html;
    }

    // ---- Render: Payments ----
    function renderPayments(payments) {
      var el = document.getElementById("paymentsTable");
      var stat = document.getElementById("statDonations");
      if (stat) stat.textContent = payments ? payments.length : 0;
      if (!payments || !payments.length) {
        el.innerHTML = '<div class="admin-empty"><i class="fa fa-mobile"></i><p>No donations yet.</p></div>';
        return;
      }
      var html = '<div class="table-responsive"><table class="admin-table"><thead><tr>' +
        '<th>Phone</th><th>Amount</th><th>Status</th><th>Receipt</th><th>Date</th>' +
        '</tr></thead><tbody>';
      payments.forEach(function (p) {
        var cls = p.status === "success" ? "success" : (p.status === "pending" ? "pending" : "failed");
        html += '<tr>' +
          '<td class="title-cell">' + escapeHtml(p.phone) + '</td>' +
          '<td>KES ' + escapeHtml(String(p.amount)) + '</td>' +
          '<td><span class="status-badge ' + cls + '">' + escapeHtml(p.status) + '</span></td>' +
          '<td class="muted">' + escapeHtml(p.mpesa_receipt || "—") + '</td>' +
          '<td class="muted">' + fmtDate(p.created_at) + '</td></tr>';
      });
      html += '</tbody></table></div>';
      el.innerHTML = html;
    }

    // Quick helper: refresh only stats after an action
    function loadStatsPartial() {
      fetch("/api/admin?type=stories", { headers: authHeaders() })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (!data.error) {
            var s = document.getElementById("statStories");
            if (s) s.textContent = data.length;
          }
        }).catch(function () {});
    }

    function showPanel() {
      document.getElementById("adminLogin").style.display = "none";
      document.getElementById("adminPanel").style.display = "block";
    }
  });
})();
