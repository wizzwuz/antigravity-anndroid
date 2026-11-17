// Workaround for custom elements in overlay bundle.
// Re-defining an already-registered custom element throws; swallow the second
// define so both the host and the overlay bundle can register safely.
if (window.customElements) {
  var originalDefine = window.customElements.define;
  window.customElements.define = function (name, constructor, options) {
    if (!window.customElements.get(name)) {
      originalDefine.call(window.customElements, name, constructor, options);
    }
  };
}

// Native Android Notification polyfill for WebView
if (typeof window !== "undefined") {
  (function () {
    function AGYNotification(title, options) {
      this.title = title || "Antigravity";
      this.options = options || {};
      var self = this;
      try {
        if (window.Android && typeof window.Android.postNotification === "function") {
          var tag = self.options.tag || "agy_notify";
          var body = self.options.body || "";
          var ongoing = !!self.options.ongoing;
          var channel = self.options.channel || (ongoing ? "task_progress" : "task_alerts_completion");
          var cid = (self.options.payload && self.options.payload.cascadeId) || self.options.cascadeId || "";
          window.Android.postNotification(channel, self.title, body, cid, ongoing, -1);
        }
      } catch (_) {}
      setTimeout(function () {
        try { self.onshow && self.onshow(); } catch (_) {}
      }, 50);
    }
    AGYNotification.permission = "granted";
    AGYNotification.requestPermission = function (cb) {
      if (typeof cb === "function") cb("granted");
      return Promise.resolve("granted");
    };
    AGYNotification.prototype.close = function () {
      try {
        if (window.Android && typeof window.Android.cancelNotification === "function") {
          var tag = (this.options && this.options.tag) || "agy_notify";
          var cid = (this.options && this.options.payload && this.options.payload.cascadeId) || (this.options && this.options.cascadeId) || "";
          if (cid) {
            window.Android.cancelNotification("cascade_prog_" + cid, 0);
            window.Android.cancelNotification("cascade_done_" + cid, 0);
          } else {
            window.Android.cancelNotification(tag, 0);
          }
        }
      } catch (_) {}
      try { this.onclose && this.onclose(); } catch (_) {}
    };
    AGYNotification.prototype.addEventListener = function () {};
    AGYNotification.prototype.removeEventListener = function () {};
    try {
      window.Notification = AGYNotification;
    } catch (_) {}
  })();

  window.__agyPendingCascadeId = window.__agyPendingCascadeId || null;
  try {
    if (!window.__agyPendingCascadeId && window.Android && typeof window.Android.getPendingCascadeId === "function") {
      var _initialCid = window.Android.getPendingCascadeId();
      if (_initialCid) {
        window.__agyPendingCascadeId = _initialCid;
      }
    }
  } catch (_) {}
  if (typeof window.__agyOpenConversation !== "function") {
    window.__agyOpenConversation = function (cid) {
      if (!cid) return;
      var c = String(cid).trim();
      window.__agyPendingCascadeId = c;
      if (typeof window.__agySwitchConversation === "function") {
        try { window.__agySwitchConversation(c); } catch (_) {}
      }
    };
  }
}
