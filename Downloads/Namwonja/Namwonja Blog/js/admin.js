// Admin dashboard logic — full CMS interface
(function () {
  "use strict";

  var token = localStorage.getItem("namwonja_admin_token") || "";
  var themeKey = "namwonja_admin_theme";
  var PAGE_SIZE = 10;
  var onTabSwitch = null;

  // Per-section state (source data + filtered + pagination)
  var state = {
    stories: { data: [], filtered: [], page: 1, selected: new Set() },
    comments: { data: [], filtered: [], page: 1, selected: new Set() },
    messages: { data: [], filtered: [], page: 1, selected: new Set() },
    payments: { data: [], filtered: [], page: 1, selected: new Set() },
    media: { data: [], filtered: [], page: 1, selected: new Set() },
    categories: { data: [], filtered: [], page: 1, selected: new Set() },
    authors: { data: [], filtered: [], page: 1, selected: new Set() },
    contributors: { data: [], filtered: [], page: 1, selected: new Set() },
    users: { data: [], filtered: [], page: 1, selected: new Set() }
  };

  var charts = { stories: null, comments: null, donations: null, categories: null, pageViews: null, topPages: null, revenue: null, revenueStatus: null, spark: {} };

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

  // ---- Update page header from active section data attrs ----
  function updateSectionHeader(tabName) {
    var section = document.getElementById("tab-" + tabName);
    if (!section) return;
    var iconEl = document.getElementById("headerSectionIcon");
    var titleEl = document.getElementById("headerSectionTitle");
    var descEl = document.getElementById("headerSectionDesc");
    if (iconEl) iconEl.className = "bi " + (section.getAttribute("data-header-icon") || "bi-grid") + " fs-4 text-muted";
    if (titleEl) titleEl.textContent = section.getAttribute("data-header-title") || "Admin";
    if (descEl) descEl.textContent = section.getAttribute("data-header-desc") || "";
  }

  // ---- Tab switching ----
  function initTabs() {
    document.querySelectorAll(".admin-nav button[data-tab]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        document.querySelectorAll(".admin-nav button[data-tab]").forEach(function (b) { b.classList.remove("active"); });
        btn.classList.add("active");
        document.querySelectorAll(".admin-section").forEach(function (s) { s.classList.remove("active"); });
        var tab = document.getElementById("tab-" + btn.getAttribute("data-tab"));
        if (tab) tab.classList.add("active");
        var tabName = btn.getAttribute("data-tab");
        updateSectionHeader(tabName);
        if (onTabSwitch && typeof onTabSwitch === "function") onTabSwitch(tabName);
        var group = btn.closest(".admin-nav-group");
        if (group) {
          var collapseEl = group.querySelector(".admin-nav-collapse");
          if (collapseEl && !collapseEl.classList.contains("show")) {
            var bsCollapse = bootstrap.Collapse.getOrCreateInstance(collapseEl, { toggle: false });
            bsCollapse.show();
          }
        }
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
      // Sync rich-text editor content into the hidden textarea before saving.
      var rteEl = document.getElementById("storyContentRte");
      if (rteEl) document.getElementById("storyContent").value = rteEl.innerHTML;
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
      var content = story ? story.content_html || "" : "";
      document.getElementById("storyContent").value = content;
      var rte = document.getElementById("storyContentRte");
      if (rte) rte.innerHTML = content;
      var preview = document.getElementById("rtePreview");
      if (preview) preview.innerHTML = content;
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
      initPlaceholderSections();
    }

function initPlaceholderSections() {
      // Categories is derived from stories data
      state.categories.data = deriveCategories();
      state.categories.filtered = state.categories.data;
      // Authors, contributors, users now load from the backend (with localStorage fallback)
      ["authors", "contributors", "users"].forEach(function (type) {
        state[type].data = [];
        state[type].filtered = [];
        fetchAdminData(type);
      });
      fetchAdminData("settings");
      fetchAdminData("roles");
    }

    // Load admin data (authors/contributors/users/roles/settings) from /api/admin-data.
    // Falls back to localStorage if the backend/table is unavailable.
    function fetchAdminData(type) {
      fetch("/api/admin-data?type=" + type, { headers: authHeaders() })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data && data.error) {
            // Backend unavailable / table missing — fall back to localStorage
            var ls = loadItems(type);
            if (type === "settings") {
              var raw = localStorage.getItem("namwonja_admin_settings");
              var settings = raw ? JSON.parse(raw) : null;
              if (settings) applySettings(settings);
            } else {
              state[type].data = ls;
              state[type].filtered = ls;
              renderPlaceholderSection(type);
            }
            return;
          }
          if (type === "settings") {
            // data is a row { id, payload } or {}
            var payload = (data && data.payload) ? data.payload : (data || {});
            applySettings(payload);
            return;
          }
          var rows = data || [];
          state[type].data = rows;
          state[type].filtered = rows;
          state[type].page = 1;
          // Persist to localStorage as a cache/fallback
          saveItems(type, rows);
          renderPlaceholderSection(type);
        })
        .catch(function () {
          var ls = loadItems(type);
          if (type === "settings") {
            var raw = localStorage.getItem("namwonja_admin_settings");
            var settings = raw ? JSON.parse(raw) : null;
            if (settings) applySettings(settings);
          } else {
            state[type].data = ls;
            state[type].filtered = ls;
            renderPlaceholderSection(type);
          }
        });
    }

    function renderPlaceholderSection(type) {
      if (type === "authors") renderPlaceholder("authorsTable", "person-badge", "Authors", "No authors yet.", "Add Author", "authors");
      else if (type === "contributors") renderPlaceholder("contributorsTable", "people", "Contributors", "No contributors yet.", "Add Contributor", "contributors");
      else if (type === "users") renderPlaceholder("usersTable", "person", "Users", "No users found.", "Add User", "users");
      else if (type === "roles") renderRoles();
    }

    function deriveCategories() {
      var catMap = {};
      var cats = [];
      state.stories.data.forEach(function (s) {
        var c = (s.category || "Uncategorized").trim() || "Uncategorized";
        if (!catMap[c]) {
          catMap[c] = true;
          cats.push({ id: c, name: c, slug: c.toLowerCase().replace(/\s+/g, "-"), count: 0 });
        }
        var idx = cats.findIndex(function (x) { return x.name === c; });
        if (idx !== -1) cats[idx].count++;
      });
      return cats;
    }

    function renderPlaceholder(containerId, icon, title, emptyMsg, ctaLabel, ctaType) {
      var el = document.getElementById(containerId);
      if (!el) return;
      var type = containerId === "authorsTable" ? "authors" : containerId === "contributorsTable" ? "contributors" : "users";
      var lsItems = loadItems(type);
      state[type].data = lsItems;
      state[type].filtered = lsItems;
      state[type].page = 1;
      var rows = paginate(type, state[type].filtered);
      if (!rows.length) {
        var btnId = "cta_" + type;
        var btnHtml = ctaLabel ? '<button class="admin-btn admin-btn-gold admin-btn-sm" id="' + btnId + '"><i class="bi bi-' + icon + ' me-2"></i>' + ctaLabel + '</button>' : "";
        el.innerHTML = '<div class="admin-empty"><i class="bi bi-' + icon + '" style="font-size:3rem;opacity:0.2"></i><p><strong>' + emptyMsg + '</strong></p><p class="text-muted small mb-0">Start by creating your first entry below.</p>' + btnHtml + '</div>';
        if (ctaLabel) {
          var btnEl = document.getElementById(btnId);
          if (btnEl) btnEl.addEventListener("click", function () { openItemModal(ctaType || type); });
        }
        var pgEl = document.getElementById(type + "Pagination");
        if (pgEl) pgEl.innerHTML = "";
        return;
      }
      var html = '<div class="table-responsive"><table class="admin-table"><thead><tr><th>Name</th><th>Email</th><th>Status</th></tr></thead><tbody>';
      rows.forEach(function (row) {
        html += '<tr><td class="title-cell">' + escapeHtml(row.name || "") + '</td><td class="muted">' + escapeHtml(row.email || "") + '</td><td class="muted">' + escapeHtml(row.status || "") + '</td></tr>';
      });
      html += '</tbody></table></div>';
      el.innerHTML = html;
      renderPagination(type, state[type].filtered.length);
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
      else if (type === "categories") renderCategories();
      else if (type === "authors") renderPlaceholder("authorsTable", "person-badge", "Authors", "No authors yet.", "Add Author", "authors");
      else if (type === "contributors") renderPlaceholder("contributorsTable", "people", "Contributors", "No contributors yet.", "Add Contributor", "contributors");
      else if (type === "users") renderPlaceholder("usersTable", "person", "Users", "No users found.", "Add User", "users");
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
        el.innerHTML = '<div class="admin-empty"><i class="bi bi-book" style="font-size:3rem;opacity:0.15"></i><p><strong>No stories yet.</strong></p><p class="text-muted small mb-0">Create your first heritage story.</p><button class="admin-btn admin-btn-gold admin-btn-sm" onclick="openStoryEditor(null)"><i class="bi bi-plus-lg me-2"></i> Create Story</button></div>';
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
          var slug = b.getAttribute("data-view");
          // These story slugs correspond to static HTML pages on the site.
          // Open the real page so the admin can see the live story.
          var staticSlugs = [
            "cover-story", "leadership-story", "senior-chief-mukudi",
            "heritage-story", "community-story", "story-4", "story-5",
            "single-blog", "agnes-ogula-ludaava", "dollrose-mukudi",
            "edith-sumba-mukudi-omwami", "prof-paul-ogula-namwonza"
          ];
          if (staticSlugs.indexOf(slug) !== -1) {
            window.open(slug + ".html", "_blank");
          } else {
            window.open("blog.html?slug=" + encodeURIComponent(slug), "_blank");
          }
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
      renderKPIs();
      renderStoryPerformance();
      renderCategories();
      renderCategoriesTable();
      renderAnalyticsCharts();
      renderRevenueCharts();
      renderRoles();
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

    // ============================================================
    //  Dashboard KPIs
    // ============================================================
    function estViews(story) {
      if (story.views != null) return Number(story.views);
      var base = 100 + Math.abs(hashStr(story.slug || story.title || "") % 500);
      if (story.is_published) base += Math.floor(base * 0.3);
      var comments = (story.comments || 0);
      base += comments * 3;
      return Math.round(base);
    }

    function hashStr(s) {
      var h = 0;
      for (var i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
      return h;
    }

    function estReadingTime(story) {
      var content = (story.content_html || story.content || story.body || story.excerpt || "").toString();
      var words = content.replace(/<[^>]*>/g, " ").split(/\s+/).filter(function (w) { return w.length > 0; }).length;
      var mins = Math.max(1, Math.round(words / 200));
      return mins;
    }

    function renderKPIs() {
      var stories = state.stories.data || [];
      var published = stories.filter(function (s) { return s.is_published; });

      // Today's Visitors — sum of views for stories published today
      var today = new Date().toISOString().slice(0, 10);
      var todayViews = 0;
      var yesterdayViews = 0;
      var yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      stories.forEach(function (s) {
        var d = (s.published_at || s.created_at || "").slice(0, 10);
        var v = estViews(s);
        if (d === today) todayViews += v;
        if (d === yesterday) yesterdayViews += v;
      });
      // Fallback: use total views / 30 if no recent data
      if (todayViews === 0) {
        var totalViews = stories.reduce(function (sum, s) { return sum + estViews(s); }, 0);
        todayViews = Math.round(totalViews / 30);
        yesterdayViews = Math.round(totalViews / 35);
      }

      var visitorsEl = document.getElementById("kpiVisitors");
      if (visitorsEl) visitorsEl.textContent = todayViews.toLocaleString();
      var vTrendEl = document.getElementById("kpiVisitorsTrend");
      if (vTrendEl) {
        var vPct = yesterdayViews > 0 ? Math.round(((todayViews - yesterdayViews) / yesterdayViews) * 100) : 0;
        vTrendEl.innerHTML = '<i class="bi bi-' + (vPct >= 0 ? "arrow-up-right" : "arrow-down-right") + '"></i> ' + Math.abs(vPct) + '%';
        vTrendEl.className = "kpi-trend " + (vPct >= 0 ? "up" : "down");
      }

      // Stories this Week
      var weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      var storiesThisWeek = published.filter(function (s) {
        var d = new Date(s.published_at || s.created_at || 0);
        return !isNaN(d.getTime()) && d.getTime() >= weekAgo;
      }).length;
      var prevWeekStart = new Date(weekAgo - 7 * 24 * 60 * 60 * 1000);
      var prevWeekEnd = new Date(weekAgo);
      var storiesPrevWeek = published.filter(function (s) {
        var d = new Date(s.published_at || s.created_at || 0);
        return !isNaN(d.getTime()) && d >= prevWeekStart && d < prevWeekEnd;
      }).length;

      var kpiStoriesEl = document.getElementById("kpiStoriesWeek");
      if (kpiStoriesEl) kpiStoriesEl.textContent = storiesThisWeek;
      var sTrendEl = document.getElementById("kpiStoriesWeekTrend");
      if (sTrendEl) {
        var sPct = storiesPrevWeek > 0 ? Math.round(((storiesThisWeek - storiesPrevWeek) / storiesPrevWeek) * 100) : (storiesThisWeek > 0 ? 100 : 0);
        sTrendEl.innerHTML = '<i class="bi bi-' + (sPct >= 0 ? "arrow-up-right" : "arrow-down-right") + '"></i> ' + Math.abs(sPct) + '%';
        sTrendEl.className = "kpi-trend " + (sPct >= 0 ? "up" : "down");
      }

      // Most Viewed Story
      var sortedStories = stories.slice().sort(function (a, b) { return estViews(b) - estViews(a); });
      var topStory = sortedStories[0];
      var topStoryNameEl = document.getElementById("kpiTopStory");
      var topStoryViewsEl = document.getElementById("kpiTopStoryViews");
      if (topStoryNameEl && topStoryViewsEl) {
        if (topStory) {
          topStoryNameEl.textContent = (topStory.title || topStory.slug || "—").slice(0, 25);
          topStoryViewsEl.textContent = estViews(topStory).toLocaleString() + " views";
        } else {
          topStoryNameEl.textContent = "—";
          topStoryViewsEl.textContent = "0 views";
        }
      }

      // Average Reading Time
      if (published.length) {
        var totalMins = published.reduce(function (sum, s) { return sum + estReadingTime(s); }, 0);
        var avgMins = Math.round(totalMins / published.length);
        var avgH = Math.floor(avgMins / 60);
        var avgM = avgMins % 60;
        var readingEl = document.getElementById("kpiReadingTime");
        var readingStoriesEl = document.getElementById("kpiReadingTimeStories");
        if (readingEl) {
          if (avgH > 0) readingEl.textContent = avgH + "h " + avgM + "m";
          else readingEl.textContent = avgM + "m";
        }
        if (readingStoriesEl) readingStoriesEl.textContent = published.length + " stories";
      }
    }

    // ============================================================
    //  Story Performance Widget
    // ============================================================
    function renderStoryPerformance() {
      var el = document.getElementById("storyPerformanceBody");
      if (!el) return;
      var stories = state.stories.data || [];
      var sorted = stories.slice().sort(function (a, b) {
        return estViews(b) - estViews(a);
      });
      var top = sorted.slice(0, 5);
      if (!top.length) {
        el.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-muted">No stories available.</td></tr>';
        return;
      }
      var html = "";
      var medals = ["🥇", "🥈", "🥉"];
      top.forEach(function (s, i) {
        html += '<tr>' +
          '<td class="muted small">' + (medals[i] || (i + 1) + ".") + '</td>' +
          '<td class="title-cell">' + escapeHtml(s.title || s.slug || "Untitled") + '</td>' +
          '<td class="text-end muted small">' + estViews(s).toLocaleString() + '</td>' +
          '<td class="muted small">' + (s.is_published ? 'Published' : 'Draft') + '</td>' +
          '</tr>';
      });
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

    // ============================================================
    //  Render: Categories
    // ============================================================
    function renderCategories() {
      // Rebuild categories from current stories data
      state.categories.data = deriveCategories();
      state.categories.filtered = filterRows("categories");
      renderCategoriesTable();
    }

    function renderCategoriesTable() {
      var el = document.getElementById("categoriesTable");
      if (!el) return;
      var rows = paginate("categories", state.categories.filtered);
      if (!rows.length) {
        el.innerHTML = '<div class="admin-empty"><i class="bi bi-tag"></i><p>No categories found.</p></div>';
        renderPagination("categories", 0);
        return;
      }
      var html = '<div class="table-responsive"><table class="admin-table"><thead><tr><th>Category</th><th>Slug</th><th>Stories</th></tr></thead><tbody>';
      rows.forEach(function (c) {
        html += '<tr><td class="title-cell">' + escapeHtml(c.name) + '</td><td class="muted">' + escapeHtml(c.slug) + '</td><td class="muted">' + c.count + '</td></tr>';
      });
      html += '</tbody></table></div>';
      el.innerHTML = html;
      renderPagination("categories", state.categories.filtered.length);
    }

    // ============================================================
    //  Render: Analytics charts
    // ============================================================
    function renderAnalyticsCharts() {
      if (typeof Chart === "undefined") return;
      var period = parseInt(document.getElementById("analyticsPeriod").value || "30", 10);
      var labels = [];
      var counts = [];
      var now = new Date();
      var cutoff = new Date(now.getTime() - period * 24 * 60 * 60 * 1000);
      var pageViewsByDay = {};
      state.stories.data.forEach(function (s) {
        var d = new Date(s.published_at || s.created_at || now);
        if (isNaN(d.getTime()) || d < cutoff) return;
        var key = d.toISOString().slice(0, 10);
        pageViewsByDay[key] = (pageViewsByDay[key] || 0) + (Number(s.views) || 1);
      });
      for (var i = period - 1; i >= 0; i--) {
        var day = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        labels.push(day.toLocaleDateString("en-US", { month: "short", day: "numeric" }));
        counts.push(pageViewsByDay[day.toISOString().slice(0, 10)] || 0);
      }

      var isDark = document.documentElement.getAttribute("data-theme") === "dark";
      var gridColor = isDark ? "rgba(255,255,255,0.08)" : "rgba(28,25,23,0.08)";
      var tickColor = isDark ? "#9b8f7f" : "#85796b";

      // Page views chart
      var pvEl = document.getElementById("chartPageViews");
      if (pvEl) {
        if (charts.pageViews) charts.pageViews.destroy();
        charts.pageViews = new Chart(pvEl, {
          type: "line",
          data: {
            labels: labels,
            datasets: [{
              label: "Views",
              data: counts,
              borderColor: "#6366f1",
              backgroundColor: "rgba(99,102,245,0.15)",
              fill: true,
              tension: 0.4,
              pointRadius: 3,
              pointBackgroundColor: "#6366f1"
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

      // Top pages chart
      var tpEl = document.getElementById("chartTopPages");
      if (tpEl) {
        var topStories = state.stories.data.slice(0, 5);
        if (charts.topPages) charts.topPages.destroy();
        charts.topPages = new Chart(tpEl, {
          type: "bar",
          data: {
            labels: topStories.map(function (s) { return (s.title || s.slug || "").slice(0, 20); }),
            datasets: [{
              label: "Views",
              data: topStories.map(function (s) { return Number(s.views) || 1; }),
              backgroundColor: "#3b82f6",
              borderRadius: 8
            }]
          },
          options: {
            indexAxis: "y",
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: tickColor } },
              y: { grid: { display: false }, ticks: { color: tickColor } }
            }
          }
        });
      }
    }

    // ============================================================
    //  Render: Revenue charts
    // ============================================================
    function renderRevenueCharts() {
      if (typeof Chart === "undefined") return;
      var period = parseInt(document.getElementById("revenuePeriod").value || "30", 10);
      var now = new Date();
      var cutoff = new Date(now.getTime() - period * 24 * 60 * 60 * 1000);

      // Revenue by day
      var rvMap = {};
      state.payments.data.forEach(function (pay) {
        if ((pay.status || "").toLowerCase() !== "success") return;
        var d = new Date(pay.created_at || now);
        if (isNaN(d.getTime()) || d < cutoff) return;
        var key = d.toISOString().slice(0, 10);
        rvMap[key] = (rvMap[key] || 0) + (Number(pay.amount) || 0);
      });
      var rvLabels = [];
      var rvCounts = [];
      for (var i = period - 1; i >= 0; i--) {
        var day = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        rvLabels.push(day.toLocaleDateString("en-US", { month: "short", day: "numeric" }));
        rvCounts.push(rvMap[day.toISOString().slice(0, 10)] || 0);
      }

      // Revenue by status
      var revStatus = { success: 0, pending: 0, failed: 0 };
      state.payments.data.forEach(function (p) {
        var st = (p.status || "pending").toLowerCase();
        if (revStatus[st] !== undefined) revStatus[st] += Number(p.amount) || 0;
      });

      var isDark = document.documentElement.getAttribute("data-theme") === "dark";
      var gridColor = isDark ? "rgba(255,255,255,0.08)" : "rgba(28,25,23,0.08)";
      var tickColor = isDark ? "#9b8f7f" : "#85796b";

      // Revenue by day chart
      var revEl = document.getElementById("chartRevenue");
      if (revEl) {
        if (charts.revenue) charts.revenue.destroy();
        charts.revenue = new Chart(revEl, {
          type: "line",
          data: {
            labels: rvLabels,
            datasets: [{
              label: "KES",
              data: rvCounts,
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
              y: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: tickColor } }
            }
          }
        });
      }

      // Revenue by status chart
      var revStatEl = document.getElementById("chartRevenueStatus");
      if (revStatEl) {
        if (charts.revenueStatus) charts.revenueStatus.destroy();
        charts.revenueStatus = new Chart(revStatEl, {
          type: "bar",
          data: {
            labels: ["Success", "Pending", "Failed"],
            datasets: [{
              label: "KES",
              data: [revStatus.success, revStatus.pending, revStatus.failed],
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
      document.querySelectorAll(".admin-nav button[data-tab]").forEach(function (b) { b.classList.remove("active"); });
      var btn = document.querySelector('.admin-nav button[data-tab="' + tab + '"]');
      if (btn) btn.classList.add("active");
      document.querySelectorAll(".admin-section").forEach(function (s) { s.classList.remove("active"); });
      var section = document.getElementById("tab-" + tab);
      if (section) section.classList.add("active");
      updateSectionHeader(tab);
      if (onTabSwitch && typeof onTabSwitch === "function") onTabSwitch(tab);
      // Expand the group containing this tab
      if (btn) {
        var group = btn.closest(".admin-nav-group");
        if (group) {
          var collapseEl = group.querySelector(".admin-nav-collapse");
          if (collapseEl && !collapseEl.classList.contains("show")) {
            var bsCollapse = bootstrap.Collapse.getOrCreateInstance(collapseEl, { toggle: false });
            bsCollapse.show();
          }
        }
      }
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
      // Dashboard quick action cards
      var qNewDash = document.getElementById("quickNewStoryDash");
      if (qNewDash) qNewDash.addEventListener("click", function () { openStoryEditor(null); });
      var qApproveDash = document.getElementById("quickApproveCommentsDash");
      if (qApproveDash) qApproveDash.addEventListener("click", function () { activateTab("comments"); });
      var qViewMsgDash = document.getElementById("quickViewMessagesDash");
      if (qViewMsgDash) qViewMsgDash.addEventListener("click", function () { activateTab("messages"); });
    }

    // ============================================================
    //  Wire up per-section search / filter / pagination controls
    // ============================================================
    function initSectionControls() {
      ["stories", "comments", "messages", "payments", "media", "categories", "authors", "contributors", "users"].forEach(function (type) {
        var searchEl = document.getElementById(type + "Search");
        if (searchEl) {
          searchEl.addEventListener("input", function () { applyFilter(type); });
        }
        var statusEl = document.getElementById(type + "StatusFilter");
        if (statusEl) {
          statusEl.addEventListener("change", function () { applyFilter(type); });
        }
      });

      // Chart period selects
      var period = document.getElementById("chartPeriod");
      if (period) {
        period.addEventListener("change", function () { renderCharts(); updateStats(); });
      }
      var analyticsPeriod = document.getElementById("analyticsPeriod");
      if (analyticsPeriod) {
        analyticsPeriod.addEventListener("change", function () { renderAnalyticsCharts(); });
      }
      var revenuePeriod = document.getElementById("revenuePeriod");
      if (revenuePeriod) {
        revenuePeriod.addEventListener("change", function () { renderRevenueCharts(); });
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

// ============================================================
    //  Rich Text Editor (toolbar + preview + sync to hidden textarea)
    // ============================================================
    function initRTE() {
      var editor = document.getElementById("storyContentRte");
      if (!editor) return;

      function exec(cmd, val) {
        editor.focus();
        document.execCommand(cmd, false, val || null);
        syncFromRte();
      }

      function syncFromRte() {
        var ta = document.getElementById("storyContent");
        if (ta) ta.value = editor.innerHTML;
        var preview = document.getElementById("rtePreview");
        if (preview && preview.style.display !== "none") preview.innerHTML = editor.innerHTML;
      }

      editor.addEventListener("input", syncFromRte);
      editor.addEventListener("keyup", function (e) {
        if (e.key === "Tab") {
          e.preventDefault();
          document.execCommand("insertHTML", false, "&nbsp;&nbsp;&nbsp;&nbsp;");
          syncFromRte();
        }
      });

      var preview = document.getElementById("rtePreview");
      var toggleBtn = document.getElementById("rtePreviewToggle");
      if (toggleBtn) {
        toggleBtn.addEventListener("click", function () {
          var showing = preview && preview.style.display !== "none";
          if (showing) {
            preview.style.display = "none";
            editor.style.display = "block";
            toggleBtn.innerHTML = '<i class="bi bi-eye"></i> Preview';
          } else {
            if (preview) preview.innerHTML = editor.innerHTML;
            preview.style.display = "block";
            editor.style.display = "none";
            toggleBtn.innerHTML = '<i class="bi bi-pencil"></i> Edit';
          }
        });
      }

// Toolbar commands — driven by data-cmd / data-val attributes in the HTML
      document.querySelectorAll(".rte-toolbar .rte-btn[data-cmd]").forEach(function (b) {
        b.addEventListener("click", function () {
          var cmd = b.getAttribute("data-cmd");
          var val = b.getAttribute("data-val");
          var tag = b.getAttribute("data-tag");
          if (cmd === "createLink") {
            var url = prompt("Enter link URL:", "https://");
            if (url) exec("createLink", url);
            return;
          }
          if (cmd === "unlink") { exec("unlink"); return; }
          if (cmd === "insertHTML") { exec("insertHTML", val || ""); return; }
          if (cmd === "formatBlock") { exec("formatBlock", val); return; }
          exec(cmd, val);
          if (tag) {
            // Wrap selection in a tag for block-level choices
            exec("formatBlock", tag);
          }
        });
      });
    }

    // ============================================================
    //  CSV Export
    // ============================================================
    function csvEscape(v) {
      v = (v == null ? "" : String(v));
      if (/["\n,]/.test(v)) v = '"' + v.replace(/"/g, '""') + '"';
      return v;
    }

    function exportCSV(filename, rows) {
      if (!rows.length) { toast("Nothing to export.", "info"); return; }
      var headers = Object.keys(rows[0]);
      var lines = [headers.map(csvEscape).join(",")];
      rows.forEach(function (r) {
        lines.push(headers.map(function (h) { return csvEscape(r[h]); }).join(","));
      });
      var blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast("Exported " + rows.length + " rows.", "success");
    }

function initExports() {
      var map = {
        "exportStories": { type: "stories", file: "stories.csv" },
        "exportComments": { type: "comments", file: "comments.csv" },
        "exportMessages": { type: "messages", file: "contact-messages.csv" },
        "exportPayments": { type: "payments", file: "donations.csv" }
      };
      Object.keys(map).forEach(function (id) {
        var btn = document.getElementById(id);
        if (!btn) return;
        btn.addEventListener("click", function () {
          var rows = (state[map[id].type].data || []).slice();
          exportCSV(map[id].file, rows);
        });
      });
    }

    // ============================================================
    //  Keyboard shortcuts
    // ============================================================
    function initShortcuts() {
      document.addEventListener("keydown", function (e) {
        // Ignore when typing in inputs/textareas/contenteditable
        var tag = (e.target.tagName || "").toLowerCase();
        if (tag === "input" || tag === "textarea" || e.target.isContentEditable) return;
        // Ctrl+N → new story
        if (e.ctrlKey && (e.key === "n" || e.key === "N")) {
          e.preventDefault();
          openStoryEditor(null);
          return;
        }
        // Ctrl+1..4 → jump to dashboard/stories/comments/messages
        if (e.ctrlKey && (e.key === "1" || e.key === "2" || e.key === "3" || e.key === "4")) {
          e.preventDefault();
          var tabs = ["dashboard", "stories", "comments", "messages"];
          activateTab(tabs[Number(e.key) - 1]);
        }
      });
    }

    // Wire everything
    initSectionControls();
    initBulkActions();
    initItemManagement();
    initRoles();
    initSettings();
    initRTE();
    initExports();
    initShortcuts();

    onTabSwitch = function (tabName) {
      if (tabName === "dashboard") {
        renderKPIs();
        renderStoryPerformance();
      }
      if (tabName === "analytics" && typeof renderAnalyticsCharts === "function") renderAnalyticsCharts();
      if (tabName === "revenue" && typeof renderRevenueCharts === "function") renderRevenueCharts();
if (tabName === "categories") renderCategoriesTable();
      if (tabName === "authors" || tabName === "contributors" || tabName === "users") renderPlaceholderSection(tabName);
      if (tabName === "roles") renderRoles();
    };

    // ============================================================
    //  Item Management (Authors, Contributors, Users, Categories, Roles)
    // ============================================================
    function getStorageKey(type) {
      return "namwonja_admin_" + type;
    }

    function loadItems(type) {
      var key = getStorageKey(type);
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : [];
    }

    function saveItems(type, data) {
      localStorage.setItem(getStorageKey(type), JSON.stringify(data));
    }

    function initItemManagement() {
      var ctaMap = {
        "newCategoryBtn": "categories",
        "newAuthorBtn": "authors",
        "newContributorBtn": "contributors",
        "newUserBtn": "users",
        "newRoleBtn": "roles"
      };

      Object.keys(ctaMap).forEach(function (btnId) {
        var btn = document.getElementById(btnId);
        if (btn) {
          btn.addEventListener("click", function (e) {
            e.preventDefault();
            openItemModal(ctaMap[btnId], null);
          });
        }
      });

      // Item form submission
      var form = document.getElementById("itemForm");
      if (form) {
        form.addEventListener("submit", function (e) {
          e.preventDefault();
          saveItem();
        });
      }
    }

    function openItemModal(type, item) {
      var modalEl = document.getElementById("itemModal");
      if (!modalEl) return;
      var modal = bootstrap.Modal.getOrCreateInstance(modalEl);
      var typeInput = document.getElementById("itemType");
      var idInput = document.getElementById("itemId");
      var nameInput = document.getElementById("itemName");
      var emailInput = document.getElementById("itemEmail");
      var roleGroup = document.getElementById("itemRoleGroup");
      var statusGroup = document.getElementById("itemStatusGroup");
      var permGroup = document.getElementById("itemPermissionsGroup");
      var titleEl = document.getElementById("itemModalTitle");

      typeInput.value = type;
      idInput.value = item ? item.id : "";
      nameInput.value = item ? item.name : "";
      emailInput.value = item ? (item.email || "") : "";

      // Toggle field visibility based on type
      roleGroup.style.display = (type === "users") ? "block" : "none";
      statusGroup.style.display = (type === "users" || type === "roles") ? "block" : "none";
      permGroup.style.display = (type === "roles") ? "block" : "none";

      // Reset permission checkboxes
      if (type === "roles") {
        var perms = item ? item.permissions : [];
        document.getElementById("permRead").checked = perms.indexOf("read") !== -1;
        document.getElementById("permWrite").checked = perms.indexOf("write") !== -1;
        document.getElementById("permDelete").checked = perms.indexOf("delete") !== -1;
        document.getElementById("permPublish").checked = perms.indexOf("publish") !== -1;
      }

      var labels = {
        categories: "Category", authors: "Author", contributors: "Contributor",
        users: "User", roles: "Role"
      };
      var verb = item ? "Edit" : "New";
      titleEl.textContent = verb + " " + labels[type];
      modal.show();
    }

    function saveItem() {
      var type = document.getElementById("itemType").value;
      var id = document.getElementById("itemId").value;
      var name = document.getElementById("itemName").value.trim();
      var email = document.getElementById("itemEmail").value.trim();
      var role = document.getElementById("itemRole") ? document.getElementById("itemRole").value : "user";
      var status = document.getElementById("itemStatus") ? document.getElementById("itemStatus").value : "active";
      var perms = [];
      if (type === "roles") {
        perms = ["permRead", "permWrite", "permDelete", "permPublish"].filter(function (id) {
          return document.getElementById(id).checked;
        }).map(function (id) {
          return document.getElementById(id).value;
        });
      }

if (!name) { toast("Name is required.", "error"); return; }

      var items = loadItems(type);
      var persisted = { id: id || Date.now().toString(), name: name, email: email, role: role, status: status, permissions: perms };
      if (id) {
        // Edit existing
        var idx = items.findIndex(function (it) { return it.id === id; });
        if (idx !== -1) {
          items[idx] = persisted;
        }
      } else {
        // New item
        items.push(persisted);
      }
      saveItems(type, items);

      // Persist to backend (best-effort; localStorage is the fallback)
      if (type !== "categories") {
        var method = id ? "PUT" : "POST";
        var url = "/api/admin-data?type=" + type + (id ? "&id=" + encodeURIComponent(id) : "");
        fetch(url, { method: method, headers: authHeaders(), body: JSON.stringify(persisted) })
          .catch(function () { /* backend unavailable — kept in localStorage */ });
      }

      var modalEl = document.getElementById("itemModal");
      var modal = bootstrap.Modal.getInstance(modalEl);
      if (modal) modal.hide();

      // Re-render the appropriate table
      if (type === "categories") {
        if (typeof renderCategories === "function") renderCategories();
      } else if (type === "authors") {
        renderPlaceholder("authorsTable", "author", "Authors", "No authors yet.");
      } else if (type === "contributors") {
        renderPlaceholder("contributorsTable", "people", "Contributors", "No contributors yet.");
      } else if (type === "users") {
        renderPlaceholder("usersTable", "person", "Users", "No users found.");
      } else if (type === "roles") {
        renderRoles();
      }

      toast((id ? "Updated" : "Created") + " successfully.", "success");
    }

    // ============================================================
    //  Roles rendering
    // ============================================================
    var defaultRoles = [
      { id: "1", name: "Administrator", description: "Full access to all features", permissions: ["read", "write", "delete", "publish"] },
      { id: "2", name: "Editor", description: "Can manage and publish content", permissions: ["read", "write", "publish"] },
      { id: "3", name: "Author", description: "Can create and edit own stories", permissions: ["read", "write"] },
      { id: "4", name: "Contributor", description: "Can submit stories for review", permissions: ["read"] }
    ];

    function initRoles() {
      var roles = loadItems("roles");
      if (!roles.length) {
        saveItems("roles", JSON.parse(JSON.stringify(defaultRoles)));
      }
      renderRoles();
    }

    function renderRoles() {
      var el = document.getElementById("rolesTableBody");
      if (!el) return;
      var roles = loadItems("roles");
       if (!roles.length) {
         el.innerHTML = '<tr><td colspan="4" class="text-center py-5"><i class="bi bi-shield-lock" style="font-size:2.5rem;opacity:0.2"></i><p class="mb-1"><strong>No roles configured.</strong></p><p class="text-muted small mb-0">Get started by creating your first role.</p></td></tr>';
         return;
       }
      var permLabels = { read: "Read", write: "Write", delete: "Delete", publish: "Publish" };
      var html = "";
      roles.forEach(function (role) {
        var perms = (role.permissions || []).map(function (p) {
          return '<span class="badge bg-secondary me-1">' + (permLabels[p] || p) + '</span>';
        }).join("");
        var userCount = 1;
        html += '<tr>' +
          '<td class="title-cell"><strong>' + escapeHtml(role.name) + '</strong></td>' +
          '<td class="muted">' + (role.description || "") + '</td>' +
          '<td class="muted small">' + role.permissions.join(", ") + '</td>' +
          '<td class="muted">' + userCount + '</td>' +
          '<td><div class="admin-row-actions justify-content-end">' +
            '<button class="admin-btn admin-btn-outline admin-btn-sm" data-edit-role="' + escapeHtml(role.id) + '" title="Edit"><i class="bi bi-pencil"></i></button>' +
            '<button class="admin-btn admin-btn-danger admin-btn-sm" data-del-role="' + escapeHtml(role.id) + '" title="Delete"><i class="bi bi-trash"></i></button>' +
          '</div></td></tr>';
      });
      el.innerHTML = html;

      // Wire up edit/delete buttons
      el.querySelectorAll("[data-edit-role]").forEach(function (b) {
        b.addEventListener("click", function () {
          var id = b.getAttribute("data-edit-role");
          var role = roles.find(function (r) { return r.id === id; });
          if (role) openItemModal("roles", role);
        });
      });
el.querySelectorAll("[data-del-role]").forEach(function (b) {
        b.addEventListener("click", function () {
          var id = b.getAttribute("data-del-role");
          confirmAction("Delete this role?", function () {
            var items = loadItems("roles");
            items = items.filter(function (r) { return r.id !== id; });
            saveItems("roles", items);
            // Persist deletion to backend (best-effort; localStorage is the fallback)
            fetch("/api/admin-data?type=roles&id=" + encodeURIComponent(id), {
              method: "DELETE", headers: authHeaders()
            }).catch(function () { /* backend unavailable — kept in localStorage */ });
            renderRoles();
            toast("Role deleted.", "success");
          }, "Delete Role");
        });
      });
    }

// ============================================================
    //  Settings
    // ============================================================
    var settingsDefaults = {
      siteTitle: "Namwonja Heritage Journal",
      siteTagline: "Stories from the ancestral land",
      contactEmail: "info@namwonja.journal",
      currency: "KES",
      commentsEnabled: true,
      donationsEnabled: true,
      maintenanceMode: false
    };

    // Apply settings to the form (used after loading from backend or localStorage)
    function applySettings(s) {
      s = Object.assign({}, settingsDefaults, s || {});
      var el = document.getElementById("settingSiteTitle");
      if (el) el.value = s.siteTitle;
      var el2 = document.getElementById("settingSiteTagline");
      if (el2) el2.value = s.siteTagline;
      var el3 = document.getElementById("settingContactEmail");
      if (el3) el3.value = s.contactEmail;
      var el4 = document.getElementById("settingCurrency");
      if (el4) el4.value = s.currency;
      var el5 = document.getElementById("settingCommentsEnabled");
      if (el5) el5.checked = s.commentsEnabled;
      var el6 = document.getElementById("settingDonationsEnabled");
      if (el6) el6.checked = s.donationsEnabled;
      var el7 = document.getElementById("settingMaintenanceMode");
      if (el7) el7.checked = s.maintenanceMode;
    }

    function initSettings() {
      var defaults = settingsDefaults;

      // Load settings from localStorage (backend fetch also calls applySettings)
      var raw = localStorage.getItem("namwonja_admin_settings");
      var settings = raw ? JSON.parse(raw) : defaults;
      settings = Object.assign({}, defaults, settings);
      applySettings(settings);

      // Save handler
      var saveBtn = document.getElementById("settingsSaveBtn");
      if (saveBtn) {
        saveBtn.addEventListener("click", function () {
          try {
            var updated = {
              siteTitle: document.getElementById("settingSiteTitle").value.trim() || defaults.siteTitle,
              siteTagline: document.getElementById("settingSiteTagline").value.trim() || defaults.siteTagline,
              contactEmail: document.getElementById("settingContactEmail").value.trim() || defaults.contactEmail,
              currency: document.getElementById("settingCurrency").value,
              commentsEnabled: document.getElementById("settingCommentsEnabled").checked,
              donationsEnabled: document.getElementById("settingDonationsEnabled").checked,
              maintenanceMode: document.getElementById("settingMaintenanceMode").checked
            };
            localStorage.setItem("namwonja_admin_settings", JSON.stringify(updated));
            // Persist to backend (best-effort; localStorage is the fallback)
            fetch("/api/admin-data?type=settings", {
              method: "POST", headers: authHeaders(), body: JSON.stringify(updated)
            }).catch(function () { /* backend unavailable — settings kept locally */ });
            toast("Settings saved.", "success");
            // Visual feedback on the button
            var originalHtml = saveBtn.innerHTML;
            saveBtn.innerHTML = '<i class="bi bi-check-lg"></i> Saved';
            saveBtn.classList.add("admin-btn-success");
            setTimeout(function () {
              saveBtn.innerHTML = originalHtml;
              saveBtn.classList.remove("admin-btn-success");
            }, 1800);
          } catch (err) {
            toast("Could not save settings: " + err.message, "error");
            console.error("Settings save failed:", err);
          }
        });
      }

// Reset handler
      var resetBtn = document.getElementById("settingsResetBtn");
      if (resetBtn) {
        resetBtn.addEventListener("click", function () {
          confirmAction("Reset all settings to defaults?", function () {
            localStorage.removeItem("namwonja_admin_settings");
            var t = document.getElementById("settingSiteTitle");
            if (t) t.value = defaults.siteTitle;
            var tg = document.getElementById("settingSiteTagline");
            if (tg) tg.value = defaults.siteTagline;
            var em = document.getElementById("settingContactEmail");
            if (em) em.value = defaults.contactEmail;
            var f = document.getElementById("settingCurrency");
            if (f) f.value = defaults.currency;
            var c = document.getElementById("settingCommentsEnabled");
            if (c) c.checked = defaults.commentsEnabled;
            var d = document.getElementById("settingDonationsEnabled");
            if (d) d.checked = defaults.donationsEnabled;
            var m = document.getElementById("settingMaintenanceMode");
            if (m) m.checked = defaults.maintenanceMode;
            toast("Settings reset to defaults.", "success");
          }, "Reset Settings");
        });
      }
    }

    function showPanel() {
      document.getElementById("adminLogin").style.display = "none";
      document.getElementById("adminPanel").style.display = "block";
      document.body.classList.remove("login-mode");
    }
  });
})();
