// M-Pesa donation module - loads donation projects, opens the donation modal,
// initiates STK push and polls status.
(function () {
  "use strict";

  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  ready(function () {
    // -------------------------------------------------------------
    //  Donation projects (public site)
    // -------------------------------------------------------------
    var grid = document.getElementById("donationProjectsGrid");
    var cachedProjects = [];

    function loadProjects() {
      if (!grid) return;
      fetch("/api/donation-projects", { cache: "no-store" })
        .then(function (r) { return r.json(); })
        .then(function (projects) {
          if (!Array.isArray(projects)) throw new Error("Invalid response");
          if (!projects.length) {
            cachedProjects = [];
            grid.innerHTML =
              '<div class="mag-projects-empty"><i class="fa fa-heart" aria-hidden="true"></i>' +
              '<p><strong>No active projects right now.</strong></p>' +
              '<p class="text-muted small">Check back soon for new causes, or make a general donation below.</p></div>';
            return;
          }
          cachedProjects = projects;
          renderProjects(projects);
        })
        .catch(function () {
          if (!cachedProjects.length) {
            grid.innerHTML =
              '<div class="mag-projects-empty"><i class="fa fa-heart" aria-hidden="true"></i>' +
              '<p><strong>Projects are temporarily unavailable.</strong></p>' +
              '<p class="text-muted small">You can still make a general donation below.</p></div>';
          }
        });
    }

    function money(n) {
      n = Number(n) || 0;
      return "KES " + n.toLocaleString("en-KE");
    }

    function renderProjects(projects) {
      var html = "";
      projects.forEach(function (p) {
        var cover = p.cover_image || "images/blog/Paul Khasamba.jpeg";
        var raised = Number(p.raised_amount) || 0;
        var target = Number(p.target_amount) || 0;
        var pct = p.progress_pct != null ? p.progress_pct : (target > 0 ? Math.min(100, Math.round((raised / target) * 100)) : 0);
        var statusBadge = "";
        if ((p.status || "active") === "completed") statusBadge = '<span class="mag-project-status complete">Completed</span>';
        else if ((p.status || "active") === "paused") statusBadge = '<span class="mag-project-status paused">Paused</span>';
        var donateLabel = (p.status || "active") === "active" ? "Donate Now" : "View Details";
        html +=
          '<article class="mag-project-card" data-reveal="fade">' +
            '<div class="mag-project-thumb">' +
              '<img src="' + escapeAttr(cover) + '" alt="' + escapeAttr(p.name) + '" loading="lazy" decoding="async" />' +
              statusBadge +
            '</div>' +
            '<div class="mag-project-body">' +
              '<h3>' + escapeHtml(p.name) + '</h3>' +
              '<p>' + escapeHtml(p.description || "") + '</p>' +
              '<div class="mag-project-progress">' +
                '<div class="mag-project-progress-bar" style="width:' + pct + '%"></div>' +
              '</div>' +
              '<div class="mag-project-stats">' +
                '<span><strong>' + escapeHtml(money(raised)) + '</strong> raised</span>' +
                '<span class="mag-project-pct">' + pct + '%</span>' +
              '</div>' +
              '<div class="mag-project-stats mag-project-stats-sub">' +
                '<span class="text-muted small">Target: ' + escapeHtml(money(target)) + '</span>' +
                '<span class="text-muted small">' + (Number(p.donation_count) || 0) + ' donation(s)</span>' +
              '</div>' +
              '<button type="button" class="mag-btn mag-btn-solid mag-project-donate" data-project-id="' + escapeAttr(p.id) + '">' +
                '<i class="fa fa-heart" aria-hidden="true"></i> ' + donateLabel +
              '</button>' +
            '</div>' +
          '</article>';
      });
      grid.innerHTML = html;
      grid.querySelectorAll("[data-project-id]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var id = btn.getAttribute("data-project-id");
          var p = null;
          for (var i = 0; i < cachedProjects.length; i++) {
            if (String(cachedProjects[i].id) === String(id)) { p = cachedProjects[i]; break; }
          }
          openDonationModal(p);
        });
      });
      // Reveal animation fallback
      var revealEls = grid.querySelectorAll("[data-reveal]");
      revealEls.forEach(function (el) { el.classList.add("revealed"); });
    }

    function escapeHtml(s) {
      var div = document.createElement("div");
      div.textContent = s == null ? "" : String(s);
      return div.innerHTML;
    }

    function escapeAttr(s) {
      return escapeHtml(s).replace(/"/g, String.fromCharCode(38) + "quot;");
    }

    // -------------------------------------------------------------
    //  Donation modal (project-specific)
    // -------------------------------------------------------------
    var modalEl = document.getElementById("donationModal");
    var modalForm = document.getElementById("donationModalForm");
    var modalStatus = document.getElementById("donationModalStatus");
    var modalBtn = document.getElementById("donationModalBtn");
    var selectedProject = null;

    function openDonationModal(project) {
      if (!modalEl) return;
      selectedProject = project || null;
      var title = document.getElementById("donationModalTitle");
      var desc = document.getElementById("donationModalDesc");
      var projId = document.getElementById("donationModalProjectId");
      var projSlug = document.getElementById("donationModalProjectSlug");
      var summary = document.getElementById("donationModalSummary");
      var projName = document.getElementById("donationModalProjectName");
      var projThumb = document.getElementById("donationModalThumb");
      var progText = document.getElementById("donationModalProgressText");

      if (project) {
        if (title) title.textContent = project.name;
        if (desc) desc.textContent = (project.description || "").slice(0, 140);
        if (projId) projId.value = project.id || "";
        if (projSlug) projSlug.value = project.slug || "";
        if (summary) {
          summary.style.display = "flex";
          if (projName) projName.textContent = project.name;
          if (projThumb) {
            var cover = project.cover_image || "images/blog/Paul Khasamba.jpeg";
            projThumb.style.backgroundImage = "url('" + cover.replace(/'/g, "\\'") + "')";
          }
          if (progText) {
            var raised = Number(project.raised_amount) || 0;
            var target = Number(project.target_amount) || 0;
            var pct = project.progress_pct != null ? project.progress_pct : (target > 0 ? Math.min(100, Math.round((raised / target) * 100)) : 0);
            progText.textContent = money(raised) + " raised of " + money(target) + " (" + pct + "%)";
          }
        }
      } else {
        if (title) title.textContent = "Donate";
        if (desc) desc.textContent = "Your contribution helps bring this project to life.";
        if (projId) projId.value = "";
        if (projSlug) projSlug.value = "";
        if (summary) summary.style.display = "none";
      }

      if (modalStatus) { modalStatus.textContent = ""; modalStatus.className = "mpesa-status"; }
      if (modalBtn) { modalBtn.disabled = false; modalBtn.innerHTML = '<i class="fa fa-mobile" aria-hidden="true"></i> Donate Now'; }
      var amountEl = document.getElementById("donationModalAmount");
      if (amountEl) amountEl.value = "";
      var phoneEl = document.getElementById("donationModalPhone");
      if (phoneEl) phoneEl.value = "";

      var modal = bootstrap.Modal.getOrCreateInstance(modalEl);
      modal.show();
    }

    if (modalForm) {
      modalForm.addEventListener("submit", function (e) {
        e.preventDefault();
        var phone = document.getElementById("donationModalPhone").value.trim();
        var amount = document.getElementById("donationModalAmount").value.trim();
        var projectId = document.getElementById("donationModalProjectId").value;
        var projectName = (selectedProject && selectedProject.name) || "";

        if (modalStatus) {
          modalStatus.textContent = "Sending STK push to your phone...";
          modalStatus.className = "mpesa-status";
        }
        if (modalBtn) { modalBtn.disabled = true; modalBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status"></span> Processing...'; }

        fetch("/api/stkpush", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: phone, amount: amount, projectId: projectId, projectName: projectName })
        })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.ok && data.CheckoutRequestID) {
            if (modalStatus) {
              modalStatus.textContent = data.message + " Enter your M-Pesa PIN when prompted.";
              modalStatus.className = "mpesa-status success";
            }
            pollStatus(data.CheckoutRequestID, function (msg, isError) {
              if (modalStatus) {
                modalStatus.textContent = msg;
                modalStatus.className = "mpesa-status " + (isError ? "error" : "success");
              }
              if (modalBtn) { modalBtn.disabled = false; modalBtn.innerHTML = '<i class="fa fa-mobile" aria-hidden="true"></i> Donate Now'; }
              if (!isError) {
                loadProjects(); // refresh progress bar
              }
            });
          } else {
            if (modalStatus) {
              modalStatus.textContent = data.error || "Could not initiate payment.";
              modalStatus.className = "mpesa-status error";
            }
            if (modalBtn) { modalBtn.disabled = false; modalBtn.innerHTML = '<i class="fa fa-mobile" aria-hidden="true"></i> Donate Now'; }
          }
        })
        .catch(function () {
          if (modalStatus) {
            modalStatus.textContent = "Network error. Please try again.";
            modalStatus.className = "mpesa-status error";
          }
          if (modalBtn) { modalBtn.disabled = false; modalBtn.innerHTML = '<i class="fa fa-mobile" aria-hidden="true"></i> Donate Now'; }
        });
      });
    }

    // Quick-amount chips
    var chips = document.getElementById("donationModalChips");
    if (chips) {
      chips.addEventListener("click", function (e) {
        var chip = e.target.closest(".mag-amount-chip");
        if (!chip) return;
        var amount = chip.getAttribute("data-amount");
        var amountEl = document.getElementById("donationModalAmount");
        if (amountEl) amountEl.value = amount;
        chips.querySelectorAll(".mag-amount-chip").forEach(function (c) { c.classList.remove("active"); });
        chip.classList.add("active");
      });
      var amountInput = document.getElementById("donationModalAmount");
      if (amountInput) {
        amountInput.addEventListener("input", function () {
          chips.querySelectorAll(".mag-amount-chip").forEach(function (c) { c.classList.remove("active"); });
        });
      }
    }

    // -------------------------------------------------------------
    //  General donation form (below the projects section)
    // -------------------------------------------------------------
    var form = document.getElementById("mpesaForm");
    if (!form) return;

    var status = document.getElementById("mpesaStatus");
    var btn = document.getElementById("mpesaBtn");

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var phone = document.getElementById("mpesaPhone").value.trim();
      var amount = document.getElementById("mpesaAmount").value.trim();
      var projectId = document.getElementById("mpesaProjectId").value || "";
      var projectName = document.getElementById("mpesaProjectName").value || "";

      if (status) {
        status.textContent = "Sending STK push to your phone...";
        status.className = "mpesa-status";
      }
      if (btn) { btn.disabled = true; btn.textContent = "Processing..."; }

      fetch("/api/stkpush", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone, amount: amount, projectId: projectId, projectName: projectName })
      })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.ok && data.CheckoutRequestID) {
          if (status) {
            status.textContent = data.message + " Enter your M-Pesa PIN when prompted.";
            status.className = "mpesa-status success";
          }
          // Poll for status
          pollStatus(data.CheckoutRequestID, function (msg, isError) {
            setDone(msg, isError);
          });
        } else {
          if (status) {
            status.textContent = data.error || "Could not initiate payment.";
            status.className = "mpesa-status error";
          }
          if (btn) { btn.disabled = false; btn.textContent = "Donate"; }
        }
      })
      .catch(function () {
        if (status) {
          status.textContent = "Network error. Please try again.";
          status.className = "mpesa-status error";
        }
        if (btn) { btn.disabled = false; btn.textContent = "Donate"; }
      });
    });

    function setDone(msg, isError) {
      if (status) {
        status.textContent = msg;
        status.className = "mpesa-status " + (isError ? "error" : "success");
      }
      if (btn) { btn.disabled = false; btn.textContent = "Donate"; }
    }

    // -------------------------------------------------------------
    //  Shared STK status polling
    // -------------------------------------------------------------
    function pollStatus(checkoutRequestId, done) {
      var attempts = 0;
      var maxAttempts = 20; // ~80 seconds
      var timer = setInterval(function () {
        attempts++;
        fetch("/api/stkquery", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ checkoutRequestId: checkoutRequestId })
        })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.ok) {
            clearInterval(timer);
            done("Thank you for your generous support! Your donation has been received successfully.", false);
          } else if (attempts >= maxAttempts) {
            clearInterval(timer);
            done("We're still confirming your payment. If you completed the M-Pesa prompt, your donation has been received — thank you!", false);
          } else if (data.status === "pending") {
            // Keep polling but show a friendly "still waiting" note
            if (status) {
              status.textContent = "STK push sent. Please check your phone and enter your M-Pesa PIN (if not already done).";
              status.className = "mpesa-status";
            }
          } else {
            clearInterval(timer);
            done(data.error || "Payment was not completed. Please try again.", true);
          }
        })
        .catch(function () {
          if (attempts >= maxAttempts) {
            clearInterval(timer);
            done("Network error while checking payment. Please check your M-Pesa messages.", true);
          }
        });
      }, 4000);
    }

    // Auto-refresh projects when the page/tab becomes visible again (e.g. after
    // an admin saves a project in another tab), so progress bars and the donate
    // modal always reflect the latest data — no manual refresh required.
    window.addEventListener("pageshow", function (e) {
      if (e.persisted) loadProjects();
    });
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") loadProjects();
    });

    // Load projects on page load
    loadProjects();
  });
})();

