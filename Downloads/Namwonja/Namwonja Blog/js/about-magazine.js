/* ==========================================================================
   Namwonja Heritage Journal — About · Magazine Interactions
   Vanilla JS (no jQuery) · Progressive enhancement with graceful fallbacks
   ========================================================================== */
(function () {
  "use strict";

  var prefersReducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ------------------------------------------------------------------------
     Utilities
     ------------------------------------------------------------------------ */
  function ready(fn) {
    if (document.readyState !== "loading") { fn(); }
    else { document.addEventListener("DOMContentLoaded", fn); }
  }

  function closest(el, selector) {
    while (el && el.nodeType === 1) {
      if (el.matches(selector)) return el;
      el = el.parentElement;
    }
    return null;
  }

  /* ------------------------------------------------------------------------
     1. Copyright year
     ------------------------------------------------------------------------ */
  ready(function () {
    var yearEl = document.getElementById("copyrightYear");
    if (yearEl) yearEl.textContent = new Date().getFullYear();
  });

/* ------------------------------------------------------------------------
     2. Mobile navigation toggle
     ------------------------------------------------------------------------ */
  ready(function () {
    var toggle = document.getElementById("magNavToggle");
    var menu = document.getElementById("magMenu");
    if (!toggle || !menu) return;

    toggle.addEventListener("click", function () {
      var open = menu.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      toggle.setAttribute("aria-label", open ? "Close navigation menu" : "Toggle navigation menu");
    });

    // Close menu when a link is chosen
    menu.addEventListener("click", function (e) {
      if (e.target.closest("a")) {
        menu.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
        toggle.setAttribute("aria-label", "Toggle navigation menu");
      }
    });

    // Close on outside click
    document.addEventListener("click", function (e) {
      if (menu.classList.contains("is-open") && !closest(e.target, ".mag-nav")) {
        menu.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
      }
    });

    // Close on Escape
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && menu.classList.contains("is-open")) {
        menu.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
        toggle.focus();
      }
    });
  });

  /* ------------------------------------------------------------------------
     3. Sticky nav shadow + reading progress bar + back-to-top
     ------------------------------------------------------------------------ */
  ready(function () {
    var nav = document.getElementById("magNav");
    var progress = document.getElementById("readingProgress");
    var toTop = document.getElementById("toTop");

    function onScroll() {
      var y = window.pageYOffset || document.documentElement.scrollTop;
      var docHeight = Math.max(
        document.body.scrollHeight,
        document.body.offsetHeight,
        document.documentElement.clientHeight,
        document.documentElement.scrollHeight,
        document.documentElement.offsetHeight
      ) - window.innerHeight;

      if (nav) nav.classList.toggle("is-scrolled", y > 10);

      if (progress && docHeight > 0) {
        var pct = Math.min(100, Math.max(0, (y / docHeight) * 100));
        progress.style.width = pct + "%";
      }

      if (toTop) toTop.classList.toggle("show", y > 600);
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    if (toTop) {
      toTop.addEventListener("click", function () {
        window.scrollTo({ top: 0, behavior: prefersReducedMotion ? "auto" : "smooth" });
      });
    }
  });

  /* ------------------------------------------------------------------------
     4. Smooth scroll for in-page TOC / anchor links
     ------------------------------------------------------------------------ */
  ready(function () {
    if (prefersReducedMotion) return;
    document.querySelectorAll('a[href^="#"]').forEach(function (link) {
      link.addEventListener("click", function (e) {
        var id = link.getAttribute("href");
        if (id.length < 2) return;
        var target = document.querySelector(id);
        if (!target) return;
        e.preventDefault();
        var headerOffset = 90;
        var top = target.getBoundingClientRect().top + window.pageYOffset - headerOffset;
        window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
        history.replaceState(null, "", id);
      });
    });
  });

  /* ------------------------------------------------------------------------
     5. Scrollspy — highlight active TOC link based on scroll position
     ------------------------------------------------------------------------ */
  ready(function () {
    var tocGroups = document.querySelectorAll(".mag-toc nav");
    if (!tocGroups.length) return;
    var allLinks = Array.prototype.slice.call(document.querySelectorAll('.mag-toc a[data-spy]'));

    function spy() {
      var pos = (window.pageYOffset || document.documentElement.scrollTop) + 130;
      var current = null;
      var sections = document.querySelectorAll("[data-section]");
      sections.forEach(function (sec) {
        if (sec.offsetTop <= pos) current = sec.getAttribute("data-section");
      });

      allLinks.forEach(function (link) {
        var target = link.getAttribute("data-spy");
        link.classList.toggle("active", target === current);
      });
    }

    window.addEventListener("scroll", spy, { passive: true });
    spy();
  });

  /* ------------------------------------------------------------------------
     6. Scroll reveal (data-reveal) via IntersectionObserver
     ------------------------------------------------------------------------ */
  ready(function () {
    var els = document.querySelectorAll("[data-reveal]");
    if (!els.length) return;

    if (!("IntersectionObserver" in window) || prefersReducedMotion) {
      els.forEach(function (el) { el.classList.add("revealed"); });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("revealed");
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });

    els.forEach(function (el) { io.observe(el); });
  });

  /* ------------------------------------------------------------------------
     7. Member card reveal (data-member)
     ------------------------------------------------------------------------ */
  ready(function () {
    var cards = document.querySelectorAll("[data-member]");
    if (!cards.length) return;

    if (!("IntersectionObserver" in window) || prefersReducedMotion) {
      cards.forEach(function (c) { c.classList.add("is-visible"); });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: "0px 0px -40px 0px" });

    cards.forEach(function (c) { io.observe(c); });
  });

  /* ------------------------------------------------------------------------
     8. Animated counters
     ------------------------------------------------------------------------ */
  ready(function () {
    var counters = document.querySelectorAll("[data-count]");
    if (!counters.length) return;

    function animate(el) {
      var target = parseInt(el.getAttribute("data-count"), 10) || 0;
      var suffix = el.getAttribute("data-suffix") || "";
      var duration = 1800;
      var start = null;

      function frame(ts) {
        if (!start) start = ts;
        var progress = Math.min((ts - start) / duration, 1);
        // easeOutExpo for a premium feel
        var eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
        var value = Math.round(target * eased);
        el.innerHTML = value.toLocaleString() + "<span class=\"plus\">" + suffix + "</span>";
        if (progress < 1) requestAnimationFrame(frame);
      }

      requestAnimationFrame(frame);
    }

    if (prefersReducedMotion) {
      counters.forEach(function (el) {
        var target = parseInt(el.getAttribute("data-count"), 10) || 0;
        var suffix = el.getAttribute("data-suffix") || "";
        el.innerHTML = target.toLocaleString() + "<span class=\"plus\">" + suffix + "</span>";
      });
      return;
    }

    if (!("IntersectionObserver" in window)) {
      counters.forEach(animate);
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          animate(entry.target);
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.4 });

    counters.forEach(function (el) { io.observe(el); });
  });

  /* ------------------------------------------------------------------------
     9. Gallery lightbox
     ------------------------------------------------------------------------ */
  ready(function () {
    var lightbox = document.getElementById("magLightbox");
    var lightboxImg = document.getElementById("lightboxImg");
    var lightboxCap = document.getElementById("lightboxCap");
    if (!lightbox || !lightboxImg) return;

    var items = Array.prototype.slice.call(document.querySelectorAll("[data-lightbox]"));
    var current = 0;
    var lastFocused = null;

    function open(index) {
      if (!items.length) return;
      current = (index + items.length) % items.length;
      var item = items[current];
      lastFocused = document.activeElement;
      lightboxImg.src = item.getAttribute("data-img");
      lightboxImg.alt = item.getAttribute("data-caption") || "Gallery image";
      if (lightboxCap) lightboxCap.textContent = item.getAttribute("data-caption") || "";
      lightbox.classList.add("open");
      document.body.style.overflow = "hidden";
      var close = document.getElementById("lightboxClose");
      if (close) close.focus();
    }

    function close() {
      lightbox.classList.remove("open");
      document.body.style.overflow = "";
      lightboxImg.src = "";
      if (lastFocused) lastFocused.focus();
    }

    function next() { open(current + 1); }
    function prev() { open(current - 1); }

    items.forEach(function (item, i) {
      item.addEventListener("click", function () { open(i); });
    });

    document.getElementById("lightboxClose").addEventListener("click", close);
    document.getElementById("lightboxNext").addEventListener("click", next);
    document.getElementById("lightboxPrev").addEventListener("click", prev);

    lightbox.addEventListener("click", function (e) {
      if (e.target === lightbox) close();
    });

    document.addEventListener("keydown", function (e) {
      if (!lightbox.classList.contains("open")) return;
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    });
  });

/* ------------------------------------------------------------------------
     10. Dynamic publication dates — auto-updates each day
     ------------------------------------------------------------------------ */
  ready(function () {
    var dateEls = document.querySelectorAll(".mag-date");
    if (!dateEls.length) return;

    var now = new Date();
    dateEls.forEach(function (el) {
      var offset = parseInt(el.getAttribute("data-offset"), 10);
      if (isNaN(offset)) return;

      var d = new Date(now);
      d.setDate(d.getDate() - offset);

      var months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
      var formatted = months[d.getMonth()] + " " + d.getDate() + ", " + d.getFullYear();
      el.textContent = formatted;
    });
  });

  /* ------------------------------------------------------------------------
     11. Copy share link
     ------------------------------------------------------------------------ */
  ready(function () {
    var copyBtn = document.getElementById("copyShareLink");
    if (!copyBtn) return;

    copyBtn.addEventListener("click", function () {
      var url = window.location.href;
      var done = function () {
        copyBtn.classList.add("is-copied");
        copyBtn.setAttribute("aria-label", "Link copied");
        setTimeout(function () {
          copyBtn.classList.remove("is-copied");
          copyBtn.setAttribute("aria-label", "Copy link to this story");
        }, 2000);
      };

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(done).catch(function () { fallbackCopy(url, done); });
      } else {
        fallbackCopy(url, done);
      }
    });

    function fallbackCopy(text, done) {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); done(); } catch (err) {}
      document.body.removeChild(ta);
    }
  });
})();

