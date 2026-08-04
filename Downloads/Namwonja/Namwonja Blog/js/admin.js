// Admin dashboard logic — full CMS interface
(function () {
  "use strict";

  var token = localStorage.getItem("namwonja_admin_token") || "";
  var themeKey = "namwonja_admin_theme";
  var PAGE_SIZE = 10;

  // Per-section state (source data + filtered + pagination)
  var state = {
    stories: { data: [], filtered: [], page: 1, selected: new Set() },
    comments: { data: [], filtered: [], page: 1, selected: new Set() },
    messages: { data: [], filtered: [], page: 1, selected: new Set() },
    payments: { data: [], filtered: [], page: 1, selected: new Set() },
    media: { data: [], filtered: [], page: 1, selected: new Set() }
  };

var charts = { stories: null, comments: null, donations: null, categories: null, spark: {} };

  function timeAgo(s) {
    if (!s) return "";
    var d = new Date(s);
    if (isNaN(d.getTime())) return "";
    var diff = Date.now() - d.getTime();
    var mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return mins + "m ago";
    var hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + "h ago";
    var days = Math.floor(hrs / 24);
    if (days < 7) return days + "d ago";
    var wks = Math.floor(days / 7);
    if (wks < 5) return wks + "w ago";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  function fmtMoney(n) {
    n = Number(n) || 0;
    if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
    return String(Math.round(n));
  }

  // Given a list of items with a date field, return per-day counts for the last `period` days.
  function countsByDay(items, dateField, period) {
    var now = new Date();
    var cutoff = new Date(now.getTime() - period * 24 * 60 * 60 * 1000);
    var map = {};
    (items || []).forEach(function (it) {
      var d = new Date(it[dateField] || it.created_at || now);
      if (isNaN(d.getTime()) || d < cutoff) return;
      var key = d.toISOString().slice(0, 10);
      map[key] = (map[key] || 0) + 1;
    });
    var labels = [], counts = [];
    for (var i = period - 1; i >= 0; i--) {
      var day = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      var key = day.toISOString().slice(0, 10);
      labels.push(day.toLocaleDateString("en-US", { month: "short", day: "numeric" }));
      counts.push(map[key] || 0);
    }
    return { labels: labels, counts: counts };
  }

  // Trend %: compare last half vs previous half of the period.
  function trendPct(counts) {
    if (!counts || counts.length < 2) return 0;
    var half = Math.floor(counts.length / 2);
    var recent = 0, prev = 0;
    for (var i = half; i < counts.length; i++) recent += counts[i];
    for (var i = 0; i < half; i++) prev += counts[i];
    if (prev === 0) return recent > 0 ? 100 : 0;
    return Math.round(((recent - prev) / prev) * 100);
  }

  function setTrend(elId, pct, val) {
    var el = document.getElementById(elId);
    if (!el) return;
    var up = pct >= 0;
    el.classList.remove("up", "down");
    el.classList.add(up ? "up" : "down");
    el.innerHTML = '<i class="bi bi-arrow-' + (up ? "up" : "down") + '-right"></i> <span>' + (val != null ? val : Math.abs(pct)) + '%</span>';
  }

  function renderSparkline(canvasId, data, color) {
    if (typeof Chart === "undefined" || !document.getElementById(canvasId)) return;
    if (charts.spark[canvasId]) charts.spark[canvasId].destroy();
    charts.spark[canvasId] = new Chart(document.getElementById(canvasId), {
      type: "line",
      data: {
        labels: data.map(function (_, i) { return i; }),
        datasets: [{
          data: data,
          borderColor: color,
          backgroundColor: color,
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.4,
          fill: false
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: { x: { display: false }, y: { display: false } },
        elements: { line: { borderWidth: 2 } }
      }
    });
  }

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

  function fmtDateTime(s) {
    if (!s) return "—";
    var d = new Date(s);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) +
      " · " + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  }

  function buildLazyImg(cssClass, src, alt) {
    var cls = cssClass + ' img-lazy';
    return '<img class="' + cls + '" src="' + escapeHtml(src) + '" alt="' + escapeHtml(alt || "") + '" loading="lazy" decoding="async" onload="this.classList.add(\'loadable\')" />';
  }

  // ---- Toast notifications ----
  function toast(message, type) {
    var container = document.getElementById("toastContainer");
    if (!container) return;
    type = type || "info";
    var el = document.createElement("div");
    el.className = "toast align-items-center toast-" + type;
    el.setAttribute("role", "alert");
    el.innerHTML =
      '<div class="d-flex"><div class="toast-body">' + escapeHtml(message) + '</div>' +
      '<button type="button" class="btn-close me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button></div>';
    container.appendChild(el);
    var t = new bootstrap.Toast(el, { delay: 3500 });
    t.show();
    el.addEventListener("hidden.bs.toast", function () { el.remove(); });
  }

  // ---- Reusable confirmation dialog ----
  var confirmCallback = null;
  function confirmAction(message, callback, title) {
    var modalEl = document.getElementById("confirmModal");
    if (!modalEl) { if (callback) callback(); return; }
    document.getElementById("confirmModalTitle").textContent = title || "Confirm";
    document.getElementById("confirmModalBody").textContent = message;
    confirmCallback = callback;
    var modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
  }

  // ---- Theme toggle ----
  function applyTheme(theme) {
    if (theme === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
      document.body.setAttribute("data-theme", "dark");
    } else {
      document.documentElement.removeAttribute("data-theme");
      document.body.removeAttribute("data-theme");
    }
    var btn = document.getElementById("darkModeToggle");
    if (btn) {
      var icon = btn.querySelector("i");
      if (icon) icon.className = theme === "dark" ? "bi bi-sun" : "bi bi-moon";
      btn.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
    }
  }

  function initTheme() {
    var saved = localStorage.getItem(themeKey) || "light";
    applyTheme(saved);
  }

  // ---- Sidebar toggle (mobile) ----
  function initSidebar() {
    var toggle = document.querySelector(".sidebar-toggle");
    var sidebar = document.getElementById("adminSidebar");
    if (!toggle || !sidebar) return;
    toggle.addEventListener("click", function () {
      sidebar.classList.toggle("show");
      var expanded = sidebar.classList.contains("show");
      toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
    });
  }

  // ---- Tab switching ----
  function initTabs() {
    document.querySelectorAll(".admin-nav button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        document.querySelectorAll(".admin-nav button").forEach(function (b) { b.classList.remove("active"); });
        btn.classList.add("active");
        document.querySelectorAll(".admin-section").forEach(function (s) { s.classList.remove("active"); });
        var tab = document.getElementById("tab-" + btn.getAttribute("data-tab"));
        if (tab) tab.classList.add("active");
        // Close mobile sidebar after navigation
        var sidebar = document.getElementById("adminSidebar");
        if (sidebar) sidebar.classList.remove("show");
      });
    });
  }

  // ============================================================
  //  Login / Logout / Panel
  // ============================================================
  ready(function () {
initTheme();
    initSidebar();
    initTabs();
    initDarkModeToggle();
    initNotifications();
    initGlobalSearch();
    initWelcome();
    initQuickActions();

    var login = document.getElementById("adminLogin");
    var panel = document.getElementById("adminPanel");

    if (token) { showPanel(); loadAll(); }

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
          toast("Welcome back!", "success");
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

    document.getElementById("profileLogout").addEventListener("click", function (e) {
      e.preventDefault();
      token = "";
      localStorage.removeItem("namwonja_admin_token");
      document.body.classList.add("login-mode");
      login.style.display = "block";
      panel.style.display = "none";
      toast("Logged out", "info");
    });

    // ============================================================
    //  Story editor: image upload
    // ============================================================
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

    // ============================================================
    //  Story editor: create / edit / save
    // ============================================================
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
        author: document.getElementById("storyAuthor").value.trim() || "Namwonja Heritage Journal",
        is_published: document.getElementById("storyPublished").checked
      };
      var editing = document.getElementById("storyForm").getAttribute("data-editing") === "true";
      var url = editing ? "/api/stories?slug=" + encodeURIComponent(slug) : "/api/stories";
      var method = editing ? "PUT" : "POST";

      fetch(url, { method: method, headers: authHeaders(), body: JSON.stringify(payload) })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.error) { toast(data.error, "error"); return; }
          var modalEl = document.getElementById("storyModal");
          var modal = bootstrap.Modal.getInstance(modalEl);
          if (modal) modal.hide();
          clearUploadStatus();
          toast(editing ? "Story updated." : "Story created.", "success");
          loadAdmin("stories");
        })
        .catch(function () { toast("Could not save story", "error"); });
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
      document.getElementById("storyAuthor").value = (story && story.author) || "Namwonja Heritage Journal";
      document.getElementById("storyPublished").checked = story ? story.is_published : true;
      setCoverPreview(story && story.cover_image ? story.cover_image : null);
      clearUploadStatus();
      if (coverFile) coverFile.value = "";
      var modalEl = document.getElementById("storyModal");
      var modal = bootstrap.Modal.getOrCreateInstance(modalEl);
      modal.show();
    }

    // ============================================================
    //  Data loading
    // ============================================================
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
          if (data.error) { console.error(data.error); toast(data.error, "error"); return; }
          var rows = data || [];
          state[type].data = rows;
          state[type].selected = new Set();
          applyFilter(type);
          updateStats();
          renderCharts();
          renderMedia();
        })
        .catch(function (e) { console.error(e); toast("Failed to load " + type, "error"); });
    }

    // ============================================================
    //  Filter / search / pagination engine
    // ============================================================
    function filterRows(type) {
      var query = "";
      var statusFilter = "all";
      var searchEl = document.getElementById(type + "Search");
      var statusEl = document.getElementById(type + "StatusFilter");
      if (searchEl) query = searchEl.value.trim().toLowerCase();
      if (statusEl) statusFilter = statusEl.value;

      return state[type].data.filter(function (row) {
        // Status filter
        if (statusFilter !== "all") {
          if (type === "stories") {
            var isPub = !!row.is_published;
            if (statusFilter === "published" && !isPub) return false;
            if (statusFilter === "draft" && isPub) return false;
          } else if (type === "comments") {
            var isAppr = !!row.is_approved;
            if (statusFilter === "approved" && !isAppr) return false;
            if (statusFilter === "pending" && isAppr) return false;
          } else if (type === "payments") {
            var st = (row.status || "").toLowerCase();
            if (st !== statusFilter) return false;
          }
        }
        // Text search
        if (!query) return true;
        var haystack = "";
        Object.keys(row).forEach(function (k) {
          var v = row[k];
          if (v != null) haystack += " " + String(v);
        });
        return haystack.toLowerCase().indexOf(query) !== -1;
      });
    }

    function applyFilter(type) {
      state[type].filtered = filterRows(type);
      state[type].page = 1;
      renderSection(type);
      updateBulkButtons(type);
    }

    function renderSection(type) {
      if (type === "stories") renderStories();
      else if (type === "comments") renderComments();
      else if (type === "messages") renderMessages();
      else if (type === "payments") renderPayments();
      else if (type === "media") renderMedia();
    }

    function paginate(type, rows) {
      var start = (state[type].page - 1) * PAGE_SIZE;
      return rows.slice(start, start + PAGE_SIZE);
    }

    function renderPagination(type, total) {
      var el = document.getElementById(type + "Pagination");
      if (!el) return;
      var pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
      var page = state[type].page;
      var start = (page - 1) * PAGE_SIZE + 1;
      var end = Math.min(page * PAGE_SIZE, total);
      var html = '<span class="info">Showing ' + (total === 0 ? 0 : start) + '–' + end + ' of ' + total + '</span>';
      html += '<div class="d-flex align-items-center gap-2">';
      html += '<button class="btn btn-sm btn-outline" data-pg="prev" ' + (page <= 1 ? 'disabled' : '') + '>Previous</button>';
      html += '<span class="info">Page ' + page + ' of ' + pages + '</span>';
      html += '<button class="btn btn-sm btn-outline" data-pg="next" ' + (page >= pages ? 'disabled' : '') + '>Next</button>';
      html += '</div>';
      el.innerHTML = html;

      el.querySelectorAll("[data-pg]").forEach(function (b) {
        b.addEventListener("click", function () {
          if (b.disabled) return;
          if (b.getAttribute("data-pg") === "prev") state[type].page--;
          else state[type].page++;
          renderSection(type);
        });
      });
    }

    // Generic checkbox helper for bulk selection
    function bindRowSelect(type, tableEl, rowId) {
      var checkboxes = tableEl.querySelectorAll("input[data-row]");
      checkboxes.forEach(function (cb) {
        cb.addEventListener("change", function () {
          var id = cb.getAttribute("data-row");
          if (cb.checked) state[type].selected.add(id);
          else state[type].selected.delete(id);
          updateBulkButtons(type);
        });
      });
      var selectAll = document.getElementById("selectAll" + cap(type));
      if (selectAll) {
        selectAll.addEventListener("change", function () {
          var pageRows = paginate(type, state[type].filtered);
          pageRows.forEach(function (row) {
            var id = row.id;
            if (selectAll.checked) state[type].selected.add(id);
            else state[type].selected.delete(id);
          });
          // Reflect on page checkboxes
          tableEl.querySelectorAll("input[data-row]").forEach(function (cb) {
            cb.checked = selectAll.checked;
          });
          updateBulkButtons(type);
        });
      }
    }

    function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

    function updateBulkButtons(type) {
      var count = state[type].selected.size;
      var btn = null;
      if (type === "stories") btn = document.getElementById("bulkDeleteBtn");
      else if (type === "comments") {
        btn = document.getElementById("bulkApproveBtn");
        var del = document.getElementById("bulkDeleteCommentsBtn");
        if (del) del.disabled = count === 0;
      } else if (type === "messages") btn = document.getElementById("bulkDeleteMessagesBtn");
      if (btn) btn.disabled = count === 0;
    }

    // ============================================================
    //  Render: Stories
    // ============================================================
    function renderStories() {
      var el = document.getElementById("storiesTable");
      var rows = paginate("stories", state.stories.filtered);
      if (!rows.length) {
        el.innerHTML = '<div class="admin-empty"><i class="bi bi-book"></i><p>No stories yet. Click « New Story » to create one.</p></div>';
        renderPagination("stories", state.stories.filtered.length);
        return;
      }
      var html = '<div class="table-responsive"><table class="admin-table"><thead><tr>' +
        '<th style="width:40px"><div class="form-check"><input class="form-check-input" type="checkbox" id="pageSelectAllStories" /></div></th>' +
        '<th>Story</th><th>Category</th><th>Status</th><th>Date</th><th class="text-end">Actions</th>' +
        '</tr></thead><tbody>';
      rows.forEach(function (s) {
        var img = s.cover_image
          ? buildLazyImg("thumb", s.cover_image, s.title || "")
          : buildLazyImg("thumb", "images/blog/Paul Khasamba.jpeg", s.title || "");
        var status = s.is_published
          ? '<span class="status-badge approved">Published</span>'
          : '<span class="status-badge new">Draft</span>';
        var checked = state.stories.selected.has(s.id) ? "checked" : "";
        html += '<tr>' +
          '<td><div class="form-check"><input class="form-check-input" type="checkbox" data-row="' + escapeHtml(s.id) + '" ' + checked + ' /></div></td>' +
          '<td><div class="d-flex align-items-center gap-3" style="min-width:260px">' + img +
            '<div><div class="title-cell">' + escapeHtml(s.title) + '</div>' +
            '<div class="muted small">' + escapeHtml(s.slug) + '</div></div></div></td>' +
          '<td>' + escapeHtml(s.category || "—") + '</td>' +
          '<td>' + status + '</td>' +
          '<td class="muted">' + fmtDate(s.published_at) + '</td>' +
          '<td><div class="admin-row-actions justify-content-end">' +
            '<button class="admin-btn admin-btn-outline admin-btn-sm" data-view="' + escapeHtml(s.slug) + '" title="View on site">View</button>' +
            '<button class="admin-btn admin-btn-outline admin-btn-sm" data-edit="' + escapeHtml(s.slug) + '" title="Edit">Edit</button>' +
            '<button class="admin-btn admin-btn-danger admin-btn-sm" data-del="' + escapeHtml(s.slug) + '" title="Delete">Delete</button>' +
          '</div></td></tr>';
      });
      html += '</tbody></table></div>';
      el.innerHTML = html;

      el.querySelectorAll("img.img-lazy").forEach(function (img) {
        if (img.complete && img.naturalWidth > 0) img.classList.add("loadable");
      });

      // Page-level select-all
      var pageSelectAll = el.querySelector("#pageSelectAllStories");
      if (pageSelectAll) {
        pageSelectAll.addEventListener("change", function () {
          rows.forEach(function (s) {
            if (pageSelectAll.checked) state.stories.selected.add(s.id);
            else state.stories.selected.delete(s.id);
          });
          el.querySelectorAll("input[data-row]").forEach(function (cb) { cb.checked = pageSelectAll.checked; });
          updateBulkButtons("stories");
        });
      }
      bindRowSelect("stories", el, "id");

      el.querySelectorAll("[data-edit]").forEach(function (b) {
        b.addEventListener("click", function () {
          var story = state.stories.data.find(function (s) { return s.slug === b.getAttribute("data-edit"); });
          openStoryEditor(story);
        });
      });
      el.querySelectorAll("[data-del]").forEach(function (b) {
        b.addEventListener("click", function () {
          var slug = b.getAttribute("data-del");
          confirmAction("Delete this story? This cannot be undone.", function () {
            fetch("/api/stories?slug=" + encodeURIComponent(slug), {
              method: "DELETE", headers: authHeaders()
            }).then(function () { toast("Story deleted.", "success"); loadAdmin("stories"); });
          }, "Delete Story");
        });
      });
      el.querySelectorAll("[data-view]").forEach(function (b) {
        b.addEventListener("click", function () {
          window.open("blog.html?slug=" + encodeURIComponent(b.getAttribute("data-view")), "_blank");
        });
      });

      renderPagination("stories", state.stories.filtered.length);
    }

    // ============================================================
    //  Render: Comments
    // ============================================================
    function storySlugFor(c) {
      return c.story_slug || c.post_slug || c.article_slug || c.story_id ||
        c.post_id || c.story || c.post || c.article || c.slug || "—";
    }

    function renderComments() {
      var el = document.getElementById("commentsTable");
      var rows = paginate("comments", state.comments.filtered);
      if (!rows.length) {
        el.innerHTML = '<div class="admin-empty"><i class="bi bi-chat-left-text"></i><p>No comments yet.</p></div>';
        renderPagination("comments", state.comments.filtered.length);
        return;
      }
      var html = '<div class="table-responsive"><table class="admin-table"><thead><tr>' +
        '<th style="width:40px"><div class="form-check"><input class="form-check-input" type="checkbox" id="pageSelectAllComments" /></div></th>' +
        '<th>Story</th><th>Name</th><th>Message</th><th>Status</th><th>Date</th><th class="text-end">Actions</th>' +
        '</tr></thead><tbody>';
      rows.forEach(function (c) {
        var status = c.is_approved
          ? '<span class="status-badge approved">Approved</span>'
          : '<span class="status-badge new">Pending</span>';
        var msg = escapeHtml(c.message || "");
        msg = msg.length > 90 ? msg.slice(0, 90) + "…" : msg;
        var checked = state.comments.selected.has(c.id) ? "checked" : "";
        html += '<tr>' +
          '<td><div class="form-check"><input class="form-check-input" type="checkbox" data-row="' + escapeHtml(c.id) + '" ' + checked + ' /></div></td>' +
          '<td class="muted">' + escapeHtml(storySlugFor(c)) + '</td>' +
          '<td class="title-cell">' + escapeHtml(c.name) + '</td>' +
          '<td style="max-width:320px">' + msg + '</td>' +
          '<td>' + status + '</td>' +
          '<td class="muted">' + fmtDate(c.created_at) + '</td>' +
          '<td><div class="admin-row-actions justify-content-end">' +
            (!c.is_approved ? '<button class="admin-btn admin-btn-success admin-btn-sm" data-approve="' + escapeHtml(c.id) + '">Approve</button>' : '') +
            '<button class="admin-btn admin-btn-danger admin-btn-sm" data-delc="' + escapeHtml(c.id) + '">Delete</button>' +
          '</div></td></tr>';
      });
      html += '</tbody></table></div>';
      el.innerHTML = html;

      var pageSelectAll = el.querySelector("#pageSelectAllComments");
      if (pageSelectAll) {
        pageSelectAll.addEventListener("change", function () {
          rows.forEach(function (c) {
            if (pageSelectAll.checked) state.comments.selected.add(c.id);
            else state.comments.selected.delete(c.id);
          });
          el.querySelectorAll("input[data-row]").forEach(function (cb) { cb.checked = pageSelectAll.checked; });
          updateBulkButtons("comments");
        });
      }
      bindRowSelect("comments", el, "id");

      el.querySelectorAll("[data-approve]").forEach(function (b) {
        b.addEventListener("click", function () {
          fetch("/api/admin?type=comments&id=" + b.getAttribute("data-approve"), {
            method: "PUT", headers: authHeaders()
          }).then(function () { toast("Comment approved.", "success"); loadAdmin("comments"); });
        });
      });
      el.querySelectorAll("[data-delc]").forEach(function (b) {
        b.addEventListener("click", function () {
          var id = b.getAttribute("data-delc");
          confirmAction("Delete this comment?", function () {
            fetch("/api/admin?type=comments&id=" + id, {
              method: "DELETE", headers: authHeaders()
            }).then(function () { toast("Comment deleted.", "success"); loadAdmin("comments"); });
          }, "Delete Comment");
        });
      });

      renderPagination("comments", state.comments.filtered.length);
    }

    // ============================================================
    //  Render: Messages
    // ============================================================
    function renderMessages() {
      var el = document.getElementById("messagesTable");
      var rows = paginate("messages", state.messages.filtered);
      if (!rows.length) {
        el.innerHTML = '<div class="admin-empty"><i class="bi bi-envelope"></i><p>No contact messages.</p></div>';
        renderPagination("messages", state.messages.filtered.length);
        return;
      }
      var html = '<div class="table-responsive"><table class="admin-table"><thead><tr>' +
        '<th style="width:40px"><div class="form-check"><input class="form-check-input" type="checkbox" id="pageSelectAllMessages" /></div></th>' +
        '<th>Name</th><th>Email</th><th>Subject</th><th>Message</th><th>Date</th>' +
        '</tr></thead><tbody>';
      rows.forEach(function (m) {
        var msg = escapeHtml(m.message || "");
        msg = msg.length > 90 ? msg.slice(0, 90) + "…" : msg;
        var checked = state.messages.selected.has(m.id) ? "checked" : "";
        html += '<tr>' +
          '<td><div class="form-check"><input class="form-check-input" type="checkbox" data-row="' + escapeHtml(m.id) + '" ' + checked + ' /></div></td>' +
          '<td class="title-cell">' + escapeHtml(m.name) + '</td>' +
          '<td class="muted">' + escapeHtml(m.email) + '</td>' +
          '<td>' + escapeHtml(m.subject || "—") + '</td>' +
          '<td style="max-width:320px">' + msg + '</td>' +
          '<td class="muted">' + fmtDate(m.created_at) + '</td></tr>';
      });
      html += '</tbody></table></div>';
      el.innerHTML = html;

      var pageSelectAll = el.querySelector("#pageSelectAllMessages");
      if (pageSelectAll) {
        pageSelectAll.addEventListener("change", function () {
          rows.forEach(function (m) {
            if (pageSelectAll.checked) state.messages.selected.add(m.id);
            else state.messages.selected.delete(m.id);
          });
          el.querySelectorAll("input[data-row]").forEach(function (cb) { cb.checked = pageSelectAll.checked; });
          updateBulkButtons("messages");
        });
      }
      bindRowSelect("messages", el, "id");

      renderPagination("messages", state.messages.filtered.length);
    }

    // ============================================================
    //  Render: Payments
    // ============================================================
    function renderPayments() {
      var el = document.getElementById("paymentsTable");
      var rows = paginate("payments", state.payments.filtered);
      if (!rows.length) {
        el.innerHTML = '<div class="admin-empty"><i class="bi bi-phone"></i><p>No donations yet.</p></div>';
        renderPagination("payments", state.payments.filtered.length);
        return;
      }
      var html = '<div class="table-responsive"><table class="admin-table"><thead><tr>' +
        '<th>Phone</th><th>Amount</th><th>Status</th><th>Receipt</th><th>Date</th>' +
        '</tr></thead><tbody>';
      rows.forEach(function (p) {
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
      renderPagination("payments", state.payments.filtered.length);
    }

    // ============================================================
    //  Stats
    // ============================================================
function updateStats() {
      var period = parseInt(document.getElementById("chartPeriod").value || "30", 10);

      // Total stories
      var totalStories = state.stories.data.length;
      var s = document.getElementById("statStories");
      if (s) s.textContent = totalStories;

      // Published vs drafts
      var published = state.stories.data.filter(function (st) { return st.is_published; }).length;
      var pub = document.getElementById("statPublished");
      if (pub) pub.textContent = published;

      // Pending comments
      var pending = state.comments.data.filter(function (c) { return !c.is_approved; }).length;
      var p = document.getElementById("statPendingComments");
      if (p) p.textContent = pending;
      var badge = document.getElementById("badgeComments");
      if (badge) badge.textContent = pending;

      // Messages
      var m = document.getElementById("statMessages");
      if (m) m.textContent = state.messages.data.length;

      // Donations count + revenue
      var d = document.getElementById("statDonations");
      if (d) d.textContent = state.payments.data.length;
      var revenue = 0;
      state.payments.data.forEach(function (pay) {
        if ((pay.status || "").toLowerCase() === "success") revenue += Number(pay.amount) || 0;
      });
      var rev = document.getElementById("statRevenue");
      if (rev) rev.textContent = fmtMoney(revenue);

      // ---- Sparklines + trends (derived from per-day counts) ----
      var storiesByDay = countsByDay(state.stories.data, "published_at", period);
      var publishedByDay = countsByDay(state.stories.data.filter(function (st) { return st.is_published; }), "published_at", period);
      var commentsByDay = countsByDay(state.comments.data, "created_at", period);
      var messagesByDay = countsByDay(state.messages.data, "created_at", period);
      var donationsByDay = countsByDay(state.payments.data, "created_at", period);
      var revenueByDay = { counts: [], labels: [] };
      (function () {
        var now = new Date();
        var cutoff = new Date(now.getTime() - period * 24 * 60 * 60 * 1000);
        var map = {};
        state.payments.data.forEach(function (pay) {
          if ((pay.status || "").toLowerCase() !== "success") return;
          var d2 = new Date(pay.created_at || now);
          if (isNaN(d2.getTime()) || d2 < cutoff) return;
          var key = d2.toISOString().slice(0, 10);
          map[key] = (map[key] || 0) + (Number(pay.amount) || 0);
        });
        for (var i = period - 1; i >= 0; i--) {
          var day = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
          revenueByDay.counts.push(map[day.toISOString().slice(0, 10)] || 0);
        }
      })();

      renderSparkline("sparkStories", storiesByDay.counts, "#6366f1");
      renderSparkline("sparkPublished", publishedByDay.counts, "#10b981");
      renderSparkline("sparkComments", commentsByDay.counts, "#f59e0b");
      renderSparkline("sparkMessages", messagesByDay.counts, "#3b82f6");
      renderSparkline("sparkDonations", donationsByDay.counts, "#8b5cf6");
      renderSparkline("sparkRevenue", revenueByDay.counts, "#b08d4f");

      setTrend("trendStories", trendPct(storiesByDay.counts));
      setTrend("trendPublished", trendPct(publishedByDay.counts));
      setTrend("trendComments", trendPct(commentsByDay.counts));
      setTrend("trendMessages", trendPct(messagesByDay.counts));
      setTrend("trendDonations", trendPct(donationsByDay.counts));
      setTrend("trendRevenue", trendPct(revenueByDay.counts));

      renderActivityFeed();
      renderNotifications();
    }

    function renderActivityFeed() {
      var el = document.getElementById("activityFeed");
      if (!el) return;
      var items = [];

      (state.stories.data || []).slice(0, 3).forEach(function (st) {
        items.push({
          icon: "book",
          title: "Story published",
          desc: st.title || st.slug,
          time: st.published_at || st.created_at
        });
      });
      (state.comments.data || []).slice(0, 3).forEach(function (c) {
        items.push({
          icon: "comment",
          title: (c.is_approved ? "Comment approved" : "New comment") + " · " + (c.name || "Reader"),
          desc: storySlugFor(c),
          time: c.created_at
        });
      });
      (state.messages.data || []).slice(0, 3).forEach(function (msg) {
        items.push({
          icon: "message",
          title: "New message from " + (msg.name || "Reader"),
          desc: msg.subject || msg.email || "Contact form",
          time: msg.created_at
        });
      });
      (state.payments.data || []).slice(0, 3).forEach(function (pay) {
        items.push({
          icon: "donation",
          title: "Donation of KES " + (pay.amount || 0),
          desc: (pay.status || "pending") + " · " + (pay.phone || ""),
          time: pay.created_at
        });
      });

      items.sort(function (a, b) { return new Date(b.time || 0) - new Date(a.time || 0); });
      items = items.slice(0, 8);

      if (!items.length) {
        el.innerHTML = '<div class="admin-activity-empty"><i class="bi bi-clock-history"></i><p>No activity yet.</p></div>';
        return;
      }
      var html = '<div class="admin-activity">';
      items.forEach(function (it) {
        html += '<div class="admin-activity-item">' +
          '<div class="a-icon ' + it.icon + '"><i class="bi bi-' + (it.icon === "book" ? "book" : it.icon === "comment" ? "chat-left-text" : it.icon === "message" ? "envelope" : "phone") + '"></i></div>' +
          '<div><strong>' + escapeHtml(it.title) + '</strong>' +
          '<small>' + escapeHtml(it.desc || "") + ' · ' + timeAgo(it.time) + '</small></div>' +
        '</div>';
      });
      html += '</div>';
      el.innerHTML = html;
    }

    function renderNotifications() {
      var list = document.getElementById("notificationList");
      if (!list) return;
      var pending = state.comments.data.filter(function (c) { return !c.is_approved; }).length;
      var badge = document.getElementById("notificationBadge");
      if (badge) {
        badge.style.display = pending > 0 ? "inline-block" : "none";
        badge.textContent = pending;
      }
      var html = "";
      if (pending > 0) {
        html += '<div class="notification-item"><div class="n-icon"><i class="bi bi-chat-left-text"></i></div>' +
          '<div><strong>' + pending + ' comment(s) pending</strong><small>Awaiting your moderation</small></div></div>';
      }
      if (state.messages.data.length) {
        html += '<div class="notification-item"><div class="n-icon"><i class="bi bi-envelope"></i></div>' +
          '<div><strong>' + state.messages.data.length + ' contact message(s)</strong><small>In your inbox</small></div></div>';
      }
      if (!html) html = '<div class="admin-dropdown-empty">No notifications yet.</div>';
      list.innerHTML = html;
    }

    // ============================================================
    //  Charts (Chart.js)
    // ============================================================
    function renderCharts() {
      if (typeof Chart === "undefined") return;
      var period = parseInt(document.getElementById("chartPeriod").value || "30", 10);
      var now = new Date();
      var cutoff = new Date(now.getTime() - period * 24 * 60 * 60 * 1000);

      // Stories published per day
      var storiesByDay = {};
      state.stories.data.forEach(function (st) {
        var d = new Date(st.published_at || st.created_at || now);
        if (isNaN(d.getTime()) || d < cutoff) return;
        var key = d.toISOString().slice(0, 10);
        storiesByDay[key] = (storiesByDay[key] || 0) + 1;
      });

      // Comments approved vs pending total
      var approved = state.comments.data.filter(function (c) { return c.is_approved; }).length;
      var pendingC = state.comments.data.length - approved;

      // Donations by status
      var donationStatus = { success: 0, pending: 0, failed: 0 };
      state.payments.data.forEach(function (p) {
        var st = (p.status || "pending").toLowerCase();
        if (donationStatus[st] !== undefined) donationStatus[st] += Number(p.amount) || 0;
      });

      // Build labels for the last period days
      var labels = [];
      var counts = [];
      for (var i = period - 1; i >= 0; i--) {
        var day = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        var key = day.toISOString().slice(0, 10);
        labels.push(day.toLocaleDateString("en-US", { month: "short", day: "numeric" }));
        counts.push(storiesByDay[key] || 0);
      }

      var isDark = document.documentElement.getAttribute("data-theme") === "dark";
      var gridColor = isDark ? "rgba(255,255,255,0.08)" : "rgba(28,25,23,0.08)";
      var tickColor = isDark ? "#9b8f7f" : "#85796b";

      // Stories chart
      var chartStoriesEl = document.getElementById("chartStories");
      if (chartStoriesEl) {
        if (charts.stories) charts.stories.destroy();
        charts.stories = new Chart(chartStoriesEl, {
          type: "line",
          data: {
            labels: labels,
            datasets: [{
              label: "Stories",
              data: counts,
              borderColor: "#b08d4f",
              backgroundColor: "rgba(176,141,79,0.15)",
              fill: true,
              tension: 0.4,
              pointRadius: 3,
              pointBackgroundColor: "#b08d4f"
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: { grid: { color: gridColor }, ticks: { color: tickColor } },
              y: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: tickColor, precision: 0 } }
            }
          }
        });
      }

      // Comments chart (doughnut)
      var chartCommentsEl = document.getElementById("chartComments");
      if (chartCommentsEl) {
        if (charts.comments) charts.comments.destroy();
        charts.comments = new Chart(chartCommentsEl, {
          type: "doughnut",
          data: {
labels: ["Approved", "Pending"],
            datasets: [{
              data: [approved, pendingC],
              backgroundColor: ["#10b981", "#f59e0b"],
              borderWidth: 0
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: "bottom", labels: { color: tickColor } } }
          }
        });
      }

// Donations chart (bar)
      var chartDonationsEl = document.getElementById("chartDonations");
      if (chartDonationsEl) {
        if (charts.donations) charts.donations.destroy();
        charts.donations = new Chart(chartDonationsEl, {
          type: "bar",
          data: {
            labels: ["Success", "Pending", "Failed"],
            datasets: [{
              label: "KES",
              data: [donationStatus.success, donationStatus.pending, donationStatus.failed],
              backgroundColor: ["#4ade80", "#f59e0b", "#ef4444"],
              borderRadius: 8
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: { grid: { color: gridColor }, ticks: { color: tickColor } },
              y: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: tickColor } }
            }
          }
        });
      }

      // Top categories chart (horizontal bar)
      var chartCategoriesEl = document.getElementById("chartCategories");
      if (chartCategoriesEl) {
        var catMap = {};
        state.stories.data.forEach(function (st) {
          var c = (st.category || "Uncategorized").trim() || "Uncategorized";
          catMap[c] = (catMap[c] || 0) + 1;
        });
        var cats = Object.keys(catMap).map(function (k) { return { name: k, count: catMap[k] }; });
        cats.sort(function (a, b) { return b.count - a.count; });
        cats = cats.slice(0, 6);
        if (charts.categories) charts.categories.destroy();
        charts.categories = new Chart(chartCategoriesEl, {
          type: "bar",
          data: {
            labels: cats.map(function (c) { return c.name; }),
            datasets: [{
              label: "Stories",
              data: cats.map(function (c) { return c.count; }),
              backgroundColor: ["#6366f1", "#8b5cf6", "#3b82f6", "#10b981", "#f59e0b", "#b08d4f"],
              borderRadius: 8
            }]
          },
          options: {
            indexAxis: "y",
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: tickColor, precision: 0 } },
              y: { grid: { display: false }, ticks: { color: tickColor } }
            }
          }
        });
      }
    }

    // ============================================================
    //  Media Library (from story cover images)
    // ============================================================
    function renderMedia() {
      var el = document.getElementById("mediaGallery");
      if (!el) return;
      // Build media list from existing story cover images (deduplicated)
      var media = [];
      var seen = {};
      state.stories.data.forEach(function (s) {
        var url = s.cover_image;
        if (!url || seen[url]) return;
        seen[url] = true;
        media.push({ url: url, title: s.title || "Cover image", slug: s.slug });
      });
      state.media.data = media;
      state.media.filtered = filterMedia(media);
      state.media.page = 1;

      var rows = paginate("media", state.media.filtered);
      if (!rows.length) {
        el.innerHTML = '<div class="admin-empty"><i class="bi bi-image"></i><p>No media yet. Upload a cover image when creating a story.</p></div>';
        renderPagination("media", state.media.filtered.length);
        return;
      }
      var html = '<div class="admin-media-grid">';
      rows.forEach(function (m) {
        html += '<div class="admin-media-item">' +
          '<img src="' + escapeHtml(m.url) + '" alt="' + escapeHtml(m.title) + '" loading="lazy" decoding="async" />' +
          '<div class="admin-media-overlay">' +
            '<button data-copy="' + escapeHtml(m.url) + '" title="Copy URL"><i class="bi bi-link-45deg"></i></button>' +
            '<button data-open="' + escapeHtml(m.url) + '" title="Open in new tab"><i class="bi bi-box-arrow-up-right"></i></button>' +
          '</div></div>';
      });
      html += '</div>';
      el.innerHTML = html;

      el.querySelectorAll("[data-copy]").forEach(function (b) {
        b.addEventListener("click", function () {
          var url = b.getAttribute("data-copy");
          if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { toast("URL copied.", "success"); });
          else toast("Could not copy URL.", "error");
        });
      });
      el.querySelectorAll("[data-open]").forEach(function (b) {
        b.addEventListener("click", function () {
          window.open(b.getAttribute("data-open"), "_blank");
        });
      });

      renderPagination("media", state.media.filtered.length);
    }

    function filterMedia(media) {
      var query = "";
      var searchEl = document.getElementById("mediaSearch");
      if (searchEl) query = searchEl.value.trim().toLowerCase();
      if (!query) return media;
      return media.filter(function (m) {
        return (m.title + " " + m.url).toLowerCase().indexOf(query) !== -1;
      });
    }

    // ============================================================
    //  Bulk actions
    // ============================================================
    function initBulkActions() {
      // Stories bulk delete
      var bulkDel = document.getElementById("bulkDeleteBtn");
      if (bulkDel) {
        bulkDel.addEventListener("click", function () {
          var ids = Array.from(state.stories.selected);
          if (!ids.length) return;
          confirmAction("Delete " + ids.length + " selected story(ies)?", function () {
            var slugs = state.stories.data.filter(function (s) { return ids.indexOf(s.id) !== -1; }).map(function (s) { return s.slug; });
            var promises = slugs.map(function (slug) {
              return fetch("/api/stories?slug=" + encodeURIComponent(slug), { method: "DELETE", headers: authHeaders() });
            });
            Promise.all(promises).then(function () {
              toast("Deleted " + slugs.length + " story(ies).", "success");
              loadAdmin("stories");
            });
          }, "Bulk Delete");
        });
      }

      // Comments bulk approve
      var bulkApprove = document.getElementById("bulkApproveBtn");
      if (bulkApprove) {
        bulkApprove.addEventListener("click", function () {
          var ids = Array.from(state.comments.selected);
          if (!ids.length) return;
          confirmAction("Approve " + ids.length + " selected comment(s)?", function () {
            var promises = ids.map(function (id) {
              return fetch("/api/admin?type=comments&id=" + id, { method: "PUT", headers: authHeaders() });
            });
            Promise.all(promises).then(function () {
              toast("Approved " + ids.length + " comment(s).", "success");
              loadAdmin("comments");
            });
          }, "Bulk Approve");
        });
      }

      // Comments bulk delete
      var bulkDelComments = document.getElementById("bulkDeleteCommentsBtn");
      if (bulkDelComments) {
        bulkDelComments.addEventListener("click", function () {
          var ids = Array.from(state.comments.selected);
          if (!ids.length) return;
          confirmAction("Delete " + ids.length + " selected comment(s)?", function () {
            var promises = ids.map(function (id) {
              return fetch("/api/admin?type=comments&id=" + id, { method: "DELETE", headers: authHeaders() });
            });
            Promise.all(promises).then(function () {
              toast("Deleted " + ids.length + " comment(s).", "success");
              loadAdmin("comments");
            });
          }, "Bulk Delete");
        });
      }

      // Messages bulk delete
      var bulkDelMessages = document.getElementById("bulkDeleteMessagesBtn");
      if (bulkDelMessages) {
        bulkDelMessages.addEventListener("click", function () {
          var ids = Array.from(state.messages.selected);
          if (!ids.length) return;
          confirmAction("Delete " + ids.length + " selected message(s)?", function () {
            // No bulk delete API for messages; delete one by one via /api/contact
            var promises = ids.map(function (id) {
              return fetch("/api/contact?id=" + id, { method: "DELETE", headers: authHeaders() });
            });
            Promise.all(promises).then(function () {
              toast("Deleted " + ids.length + " message(s).", "success");
              loadAdmin("messages");
            });
          }, "Bulk Delete");
        });
      }
    }

    // ============================================================
    //  Global search form (navigates to relevant section)
    // ============================================================
    function initGlobalSearch() {
      var form = document.getElementById("adminSearchForm");
      if (!form) return;
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var q = document.getElementById("adminSearch").value.trim();
        if (!q) return;
        // Search in all sections, activate the first tab that has a match
        ["stories", "comments", "messages", "payments"].forEach(function (type) {
          var searchEl = document.getElementById(type + "Search");
          if (searchEl) searchEl.value = q;
        });
        var found = false;
        ["stories", "comments", "messages", "payments"].forEach(function (type) {
          if (found) return;
          if (filterRows(type).length) {
            activateTab(type);
            found = true;
          }
        });
        if (!found) {
          activateTab("stories");
          toast("No matches found.", "info");
        }
      });
    }

    function activateTab(tab) {
      document.querySelectorAll(".admin-nav button").forEach(function (b) { b.classList.remove("active"); });
      var btn = document.querySelector('.admin-nav button[data-tab="' + tab + '"]');
      if (btn) btn.classList.add("active");
      document.querySelectorAll(".admin-section").forEach(function (s) { s.classList.remove("active"); });
      var section = document.getElementById("tab-" + tab);
      if (section) section.classList.add("active");
    }

    // ============================================================
    //  Dark mode toggle
    // ============================================================
        function initDarkModeToggle() {
      var btn = document.getElementById("darkModeToggle");
      if (!btn) return;
      btn.addEventListener("click", function () {
        var isDark = document.documentElement.getAttribute("data-theme") === "dark";
        var next = isDark ? "light" : "dark";
        localStorage.setItem(themeKey, next);
        applyTheme(next);
        renderCharts();
      });
    }

// ============================================================
    //  Notifications (pending comments count + dropdown)
    // ============================================================
    function initNotifications() {
      var btn = document.getElementById("notificationsBtn");
      if (!btn) return;
      btn.addEventListener("click", function () {
        renderNotifications();
        var pending = state.comments.data.filter(function (c) { return !c.is_approved; }).length;
        if (pending === 0) toast("No pending comments.", "info");
      });
    }

    // ============================================================
    //  Welcome header + date
    // ============================================================
    function initWelcome() {
      var dateEl = document.getElementById("todayDate");
      if (dateEl) {
        dateEl.textContent = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
      }
      var greetEl = document.getElementById("welcomeGreeting");
      if (greetEl) {
        var h = new Date().getHours();
        var msg = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
        greetEl.textContent = msg;
      }
    }

    // ============================================================
    //  Quick actions + profile dropdown wiring
    // ============================================================
    function initQuickActions() {
      var qNew = document.getElementById("quickNewStory");
      if (qNew) qNew.addEventListener("click", function (e) { e.preventDefault(); openStoryEditor(null); });
      var hNew = document.getElementById("headerNewStory");
      if (hNew) hNew.addEventListener("click", function () { openStoryEditor(null); });
      var qComments = document.getElementById("quickComments");
      if (qComments) qComments.addEventListener("click", function (e) { e.preventDefault(); activateTab("comments"); });
      var qMessages = document.getElementById("quickMessages");
      if (qMessages) qMessages.addEventListener("click", function (e) { e.preventDefault(); activateTab("messages"); });
      var qDonations = document.getElementById("quickDonations");
      if (qDonations) qDonations.addEventListener("click", function (e) { e.preventDefault(); activateTab("payments"); });
    }

    // ============================================================
    //  Wire up per-section search / filter / pagination controls
    // ============================================================
    function initSectionControls() {
      ["stories", "comments", "messages", "payments", "media"].forEach(function (type) {
        var searchEl = document.getElementById(type + "Search");
        if (searchEl) {
          searchEl.addEventListener("input", function () { applyFilter(type); });
        }
        var statusEl = document.getElementById(type + "StatusFilter");
        if (statusEl) {
          statusEl.addEventListener("change", function () { applyFilter(type); });
        }
      });

      // Chart period select
      var period = document.getElementById("chartPeriod");
      if (period) {
        period.addEventListener("change", function () { renderCharts(); updateStats(); });
      }

      // Confirm modal confirm button
      var confirmBtn = document.getElementById("confirmModalConfirm");
      if (confirmBtn) {
        confirmBtn.addEventListener("click", function () {
          var modalEl = document.getElementById("confirmModal");
          var modal = bootstrap.Modal.getInstance(modalEl);
          if (modal) modal.hide();
          if (confirmCallback) { var cb = confirmCallback; confirmCallback = null; cb(); }
        });
      }
    }

    // Wire everything
    initSectionControls();
    initBulkActions();

    function showPanel() {
      document.getElementById("adminLogin").style.display = "none";
      document.getElementById("adminPanel").style.display = "block";
      document.body.classList.remove("login-mode");
    }
  });
})();
