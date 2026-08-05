// Contact form submission -> saves message to DB via /api/contact
(function () {
  "use strict";

  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  ready(function () {
    var form = document.getElementById("contactForm");
    if (!form) return;

    var status = document.getElementById("contactStatus");

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var name = document.getElementById("name").value.trim();
      var email = document.getElementById("email").value.trim();
      var subject = document.getElementById("subject").value.trim();
      var message = document.getElementById("message").value.trim();

      if (status) {
        status.textContent = "Sending...";
        status.className = "comment-status";
      }

      fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name, email: email, subject: subject, message: message })
      })
      .then(function (r) {
        return r.json().then(function (data) {
          return { ok: r.ok, data: data };
        });
      })
      .then(function (res) {
        var data = res.data || {};
        // Only treat the submission as successful when the HTTP status is OK
        // AND the API did not return an error. Previously a failed DB insert
        // (e.g. missing contact_messages table) still showed "success".
        if (res.ok && !data.error) {
          if (status) {
            status.textContent = data.message || "Message sent successfully!";
            status.className = "comment-status success";
          }
          form.reset();
        } else {
          if (status) {
            status.textContent = data.error || "Something went wrong. Please try again.";
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
  });
})();
