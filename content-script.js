// Content script (isolated world). Injects page-world script, relays
// captured entries to the background service worker and floating overlay.
(function () {
  try {
    const s = document.createElement("script");
    s.src = chrome.runtime.getURL("injected.js");
    s.async = false;
    (document.head || document.documentElement).appendChild(s);
    s.onload = () => s.remove();
  } catch (e) {
    // ignore
  }

  window.addEventListener("message", (ev) => {
    if (!ev.data || ev.source !== window) return;
    if (ev.data.source !== "__WEBDEBUG_PRO__") return;
    const entry = ev.data.entry;
    if (!entry) return;

    // Push to floating overlay immediately if available
    if (window.__WEBDEBUG_PRO_OVERLAY__) {
      window.__WEBDEBUG_PRO_OVERLAY__.pushEntry(entry);
    }

    try {
      chrome.runtime.sendMessage({ type: "wd:entry", entry }, () => void chrome.runtime.lastError);
    } catch (_) {}
  });

  // Listen for toggle requests from background (e.g. extension icon clicked or shortcut Alt+Shift+D)
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === "wd:toggleFloatingPanel") {
      if (window.__WEBDEBUG_PRO_OVERLAY__) {
        window.__WEBDEBUG_PRO_OVERLAY__.toggle();
        sendResponse({ ok: true });
      } else {
        sendResponse({ ok: false });
      }
      return true;
    }
  });
})();
