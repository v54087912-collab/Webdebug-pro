// WebDebug Pro - Background service worker (MV3).
const MAX_ENTRIES = 1000;
const logsByTab = new Map(); // tabId -> { entries: [], pinned: Set<id> }
const settingsByTab = new Map(); // tabId -> { persist: bool }
let nextId = 1;

function getBucket(tabId) {
  let b = logsByTab.get(tabId);
  if (!b) {
    b = { entries: [] };
    logsByTab.set(tabId, b);
  }
  return b;
}

function getSettings(tabId) {
  let s = settingsByTab.get(tabId);
  if (!s) {
    s = { persist: false };
    settingsByTab.set(tabId, s);
  }
  return s;
}

function updateBadge(tabId) {
  const bucket = logsByTab.get(tabId);
  const count = bucket ? bucket.entries.length : 0;
  const errors = bucket ? bucket.entries.filter((e) => e.severity === "error" || e.severity === "network").length : 0;
  const text = count === 0 ? "" : count > 999 ? "999+" : String(count);
  try {
    chrome.action.setBadgeText({ tabId, text });
    chrome.action.setBadgeBackgroundColor({
      tabId,
      color: errors > 0 ? "#dc2626" : "#2563eb",
    });
  } catch (_) {}
}

function pushEntry(tabId, entry) {
  const bucket = getBucket(tabId);
  if (!entry.id) {
    entry.id = nextId++;
  }
  entry.tabId = tabId;

  // Prevent duplicate insertion if already in bucket
  if (bucket.entries.some((e) => e.id === entry.id)) {
    return;
  }

  bucket.entries.push(entry);
  if (bucket.entries.length > MAX_ENTRIES) {
    const trim = bucket.entries.length - MAX_ENTRIES;
    // Keep pinned entries; drop oldest non-pinned first.
    let removed = 0;
    for (let i = 0; i < bucket.entries.length && removed < trim; i++) {
      if (!bucket.entries[i].pinned) {
        bucket.entries.splice(i, 1);
        i--;
        removed++;
      }
    }
  }
  updateBadge(tabId);
  broadcast(tabId, { type: "wd:new", entry });
}

const panelPorts = new Map(); // tabId -> Set<port>

function broadcast(tabId, msg) {
  const set = panelPorts.get(tabId);
  if (!set) return;
  for (const port of Array.from(set)) {
    try {
      port.postMessage(msg);
    } catch (_) {
      // Consume lastError and cleanup dead/cached port
      const _err = chrome.runtime.lastError;
      set.delete(port);
    }
  }
  if (set.size === 0) panelPorts.delete(tabId);
}

chrome.runtime.onConnect.addListener((port) => {
  if (!port.name.startsWith("wd-panel:")) return;
  let tabId = parseInt(port.name.split(":")[1], 10);
  if ((isNaN(tabId) || !tabId) && port.sender?.tab?.id) {
    tabId = port.sender.tab.id;
  }
  if (!tabId) return;
  if (!panelPorts.has(tabId)) panelPorts.set(tabId, new Set());
  panelPorts.get(tabId).add(port);

  port.onDisconnect.addListener(() => {
    // Check and consume runtime.lastError to prevent unchecked error warnings when tabs enter bfcache or close
    const _ignored = chrome.runtime.lastError;
    const s = panelPorts.get(tabId);
    if (s) {
      s.delete(port);
      if (s.size === 0) panelPorts.delete(tabId);
    }
  });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return;
  const senderTabId = sender.tab && sender.tab.id;

  if (msg.type === "wd:entry" && senderTabId != null) {
    pushEntry(senderTabId, msg.entry);
    return;
  }

  if (msg.type === "wd:getTabId") {
    sendResponse({ tabId: senderTabId || null });
    return true;
  }

  if (msg.type === "wd:openWindow") {
    const tabId = msg.tabId || senderTabId;
    chrome.windows.create({
      url: chrome.runtime.getURL(`panel.html?tabId=${tabId || ""}`),
      type: "popup",
      width: 850,
      height: 600,
    });
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === "wd:getState") {
    const tabId = msg.tabId != null ? msg.tabId : senderTabId;
    const bucket = getBucket(tabId);
    const settings = getSettings(tabId);
    sendResponse({ entries: bucket.entries, settings, max: MAX_ENTRIES });
    return true;
  }

  if (msg.type === "wd:clear") {
    const tabId = msg.tabId != null ? msg.tabId : senderTabId;
    const bucket = getBucket(tabId);
    bucket.entries = bucket.entries.filter((e) => e.pinned);
    updateBadge(tabId);
    broadcast(tabId, { type: "wd:reset", entries: bucket.entries });
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === "wd:setPinned") {
    const tabId = msg.tabId != null ? msg.tabId : senderTabId;
    const bucket = getBucket(tabId);
    const entry = bucket.entries.find((e) => String(e.id) === String(msg.id));
    if (entry) {
      entry.pinned = !!msg.pinned;
      broadcast(tabId, { type: "wd:entryPinned", id: msg.id, pinned: entry.pinned });
    }
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === "wd:deleteEntry") {
    const tabId = msg.tabId != null ? msg.tabId : senderTabId;
    const bucket = getBucket(tabId);
    bucket.entries = bucket.entries.filter((e) => String(e.id) !== String(msg.id));
    updateBadge(tabId);
    broadcast(tabId, { type: "wd:entryDeleted", id: msg.id });
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === "wd:setSettings") {
    const tabId = msg.tabId != null ? msg.tabId : senderTabId;
    const s = getSettings(tabId);
    Object.assign(s, msg.settings || {});
    sendResponse({ ok: true, settings: s });
    return true;
  }

  if (msg.type === "wd:capture") {
    const tabId = msg.tabId != null ? msg.tabId : senderTabId;
    if (!tabId) {
      sendResponse({ dataUrl: null });
      return true;
    }
    chrome.tabs.get(tabId, (tab) => {
      if (tab && tab.windowId) {
        chrome.tabs.captureVisibleTab(tab.windowId, { format: "jpeg", quality: 70 }, (dataUrl) => {
          sendResponse({ dataUrl: chrome.runtime.lastError ? null : dataUrl });
        });
      } else sendResponse({ dataUrl: null });
    });
    return true;
  }

  if (msg.type === "wd:eval") {
    const tabId = msg.tabId != null ? msg.tabId : senderTabId;
    if (!tabId) {
      sendResponse({ err: { name: "Error", message: "No active tab detected" } });
      return true;
    }
    chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: (c) => {
        function serialize(v, d = 0, seen = new WeakSet()) {
          try {
            if (v === null || v === undefined) return v;
            if (typeof v === "boolean" || typeof v === "number" || typeof v === "string") return v;
            if (typeof v === "bigint") return v.toString() + "n";
            if (typeof v === "symbol") return v.toString();
            if (typeof v === "function") return `ƒ ${v.name || "anonymous"}()`;
            if (v instanceof Error) return { __type: "Error", name: v.name, message: v.message, stack: v.stack };
            if (v instanceof Date) return `Date(${v.toISOString()})`;
            if (v instanceof RegExp) return v.toString();
            if (typeof Node !== "undefined" && v instanceof Node) {
              if (v.nodeType === 1) {
                const el = v;
                return {
                  __type: "Element",
                  tagName: el.tagName.toLowerCase(),
                  id: el.id,
                  className: el.className,
                  preview: `<${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className ? '.' + el.className.split(' ').join('.') : ''}>`,
                  text: el.textContent ? el.textContent.slice(0, 50).trim() : "",
                };
              }
              return `[Node: ${v.nodeName}]`;
            }
            if (d > 3) return Array.isArray(v) ? "[Array]" : "[Object]";
            if (typeof v === "object") {
              if (seen.has(v)) return "[Circular]";
              seen.add(v);
              if (Array.isArray(v)) return v.slice(0, 50).map((x) => serialize(x, d + 1, seen));
              const out = {};
              const keys = Object.keys(v).slice(0, 50);
              for (const k of keys) {
                try { out[k] = serialize(v[k], d + 1, seen); } catch (_) { out[k] = "[Inaccessible]"; }
              }
              return out;
            }
            return String(v);
          } catch (_) { return String(v); }
        }

        try {
          const raw = window.eval(c);
          return { res: serialize(raw) };
        } catch (err) {
          return { err: { name: err ? err.name : "Error", message: err ? err.message : String(err), stack: err ? err.stack : "" } };
        }
      },
      args: [msg.code],
    }).then(results => {
      const frame = results && results[0];
      sendResponse(frame ? frame.result : { res: undefined });
    }).catch(e => {
      sendResponse({ err: { name: "Error", message: e.message } });
    });
    return true;
  }

  if (msg.type === "wd:getStorage") {
    const tabId = msg.tabId != null ? msg.tabId : senderTabId;
    if (!tabId) {
      sendResponse({ err: "No tabId" });
      return true;
    }
    chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: () => ({
        ls: { ...localStorage },
        ss: { ...sessionStorage },
        cookies: document.cookie
      })
    }).then(results => {
      sendResponse(results && results[0] ? results[0].result : { ls: {}, ss: {}, cookies: "" });
    }).catch(e => {
      sendResponse({ err: e.message });
    });
    return true;
  }

  if (msg.type === "wd:clearStorage") {
    const tabId = msg.tabId != null ? msg.tabId : senderTabId;
    if (!tabId) {
      sendResponse({ err: "No tabId" });
      return true;
    }
    chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: (t) => {
        if (t === 'ls') localStorage.clear();
        if (t === 'ss') sessionStorage.clear();
        if (t === 'cookies') {
          const cookies = document.cookie.split(";");
          for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i];
            const eqPos = cookie.indexOf("=");
            const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();
            document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
          }
        }
      },
      args: [msg.storageType]
    }).then(() => {
      sendResponse({ ok: true });
    }).catch(e => {
      sendResponse({ err: e.message });
    });
    return true;
  }
});

function openWindowFallback(tabId) {
  chrome.windows.create({
    url: chrome.runtime.getURL(`panel.html?tabId=${tabId || ""}`),
    type: "popup",
    width: 850,
    height: 600,
  });
}

function isRestrictedUrl(url) {
  if (!url) return false;
  return (
    url.startsWith("chrome://") ||
    url.startsWith("edge://") ||
    url.startsWith("chrome-extension://") ||
    url.startsWith("about:") ||
    url.startsWith("view-source:") ||
    url.includes("chromewebstore.google.com") ||
    url.includes("chrome.google.com/webstore")
  );
}

async function togglePanelOnTab(tab) {
  if (!tab || !tab.id) return;
  const url = tab.url || "";
  if (isRestrictedUrl(url)) {
    openWindowFallback(tab.id);
    return;
  }

  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type: "wd:toggleFloatingPanel" });
    if (!res || !res.ok) {
      throw new Error("Overlay not ready");
    }
  } catch (_) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["overlay.js", "content-script.js"],
      });
      setTimeout(async () => {
        try {
          const res2 = await chrome.tabs.sendMessage(tab.id, { type: "wd:toggleFloatingPanel" });
          if (!res2 || !res2.ok) openWindowFallback(tab.id);
        } catch (e) {
          openWindowFallback(tab.id);
        }
      }, 80);
    } catch (err) {
      openWindowFallback(tab.id);
    }
  }
}

chrome.action.onClicked.addListener((tab) => {
  togglePanelOnTab(tab);
});

chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-debug-panel") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0]) togglePanelOnTab(tabs[0]);
    });
  }
});

// Failed network requests via webRequest (catches CORS/blocked + non-2xx).
chrome.webRequest.onCompleted.addListener(
  (details) => {
    if (details.tabId < 0) return;
    const isError = details.statusCode >= 400;
    // Capture errors and critical web asset requests (script, stylesheet, font, sub_frame, websocket)
    if (isError || ["script", "stylesheet", "font", "sub_frame", "websocket"].includes(details.type)) {
      pushEntry(details.tabId, {
        severity: isError ? "error" : "network",
        message: `${details.method} ${details.url} → ${details.statusCode} (${details.type})`,
        args: [{ url: details.url, method: details.method, status: details.statusCode, type: details.type }],
        source: details.url,
        timestamp: Date.now(),
        kind: "webRequest",
      });
    }
  },
  { urls: ["<all_urls>"] }
);

chrome.webRequest.onErrorOccurred.addListener(
  (details) => {
    if (details.tabId < 0) return;
    pushEntry(details.tabId, {
      severity: "network",
      message: `${details.method} ${details.url} → ${details.error}`,
      args: [{ url: details.url, method: details.method, error: details.error, type: details.type }],
      source: details.url,
      timestamp: Date.now(),
      kind: "webRequest-error",
    });
  },
  { urls: ["<all_urls>"] }
);

// Clear on navigation unless persist is on.
chrome.webNavigation?.onBeforeNavigate?.addListener((details) => {
  if (details.frameId !== 0) return;
  const s = getSettings(details.tabId);
  if (s.persist) return;
  const bucket = getBucket(details.tabId);
  bucket.entries = bucket.entries.filter((e) => e.pinned);
  updateBadge(details.tabId);
  broadcast(details.tabId, { type: "wd:reset", entries: bucket.entries });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  logsByTab.delete(tabId);
  settingsByTab.delete(tabId);
  panelPorts.delete(tabId);
});
