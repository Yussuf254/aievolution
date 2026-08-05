// M-Pesa donation module - initiates STK push and polls status.
(function () {
  "use strict";

  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  ready(function () {
    var form = document.getElementById("mpesaForm");
    if (!form) return;

    var status = document.getElementById("mpesaStatus");
    var btn = document.getElementById("mpesaBtn");

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var phone = document.getElementById("mpesaPhone").value.trim();
      var amount = document.getElementById("mpesaAmount").value.trim();

      if (status) {
        status.textContent = "Sending STK push to your phone...";
        status.className = "mpesa-status";
      }
      if (btn) { btn.disabled = true; btn.textContent = "Processing..."; }

      fetch("/api/stkpush", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone, amount: amount })
      })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.ok && data.CheckoutRequestID) {
          if (status) {
            status.textContent = data.message + " Enter your M-Pesa PIN when prompted.";
            status.className = "mpesa-status success";
          }
          // Poll for status
          pollStatus(data.CheckoutRequestID);
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

    function pollStatus(checkoutRequestId) {
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
            setDone(
              "Thank you for your generous support! Your donation has been received successfully.",
              false
            );
          } else if (attempts >= maxAttempts) {
            clearInterval(timer);
            // If the payment was actually made but the callback was slow, don't
            // show a scary error. Encourage them to check M-Pesa.
            setDone(
              "We're still confirming your payment. If you completed the M-Pesa prompt, your donation has been received — thank you!",
              false
            );
          } else if (data.status === "pending") {
            // Keep polling but show a friendly "still waiting" note
            if (status) {
              status.textContent = "STK push sent. Please check your phone and enter your M-Pesa PIN (if not already done).";
              status.className = "mpesa-status";
            }
          } else {
            // Payment failed (e.g. cancelled, declined)
            clearInterval(timer);
            setDone(data.error || "Payment was not completed. Please try again.", true);
          }
        })
        .catch(function () {
          if (attempts >= maxAttempts) {
            clearInterval(timer);
            setDone("Network error while checking payment. Please check your M-Pesa messages.", true);
          }
        });
      }, 4000);
    }
  });
})();
