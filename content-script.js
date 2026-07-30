// Content script (isolated world). Injects page-world script and relays
// captured entries to the background service worker.
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
    try {
      chrome.runtime.sendMessage({ type: "wd:entry", entry }, () => void chrome.runtime.lastError);
    } catch (_) {}
  });
})();
