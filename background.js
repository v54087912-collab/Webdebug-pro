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
  entry.id = nextId++;
  entry.tabId = tabId;
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
  for (const port of set) {
    try {
      port.postMessage(msg);
    } catch (_) {}
  }
}

chrome.runtime.onConnect.addListener((port) => {
  if (!port.name.startsWith("wd-panel:")) return;
  const tabId = parseInt(port.name.split(":")[1], 10);
  if (!panelPorts.has(tabId)) panelPorts.set(tabId, new Set());
  panelPorts.get(tabId).add(port);
  port.onDisconnect.addListener(() => {
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

  if (msg.type === "wd:getState") {
    const tabId = msg.tabId;
    const bucket = getBucket(tabId);
    const settings = getSettings(tabId);
    sendResponse({ entries: bucket.entries, settings, max: MAX_ENTRIES });
    return true;
  }

  if (msg.type === "wd:clear") {
    const tabId = msg.tabId;
    const bucket = getBucket(tabId);
    bucket.entries = bucket.entries.filter((e) => e.pinned);
    updateBadge(tabId);
    broadcast(tabId, { type: "wd:reset", entries: bucket.entries });
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === "wd:setPinned") {
    const bucket = getBucket(msg.tabId);
    const entry = bucket.entries.find((e) => e.id === msg.id);
    if (entry) entry.pinned = !!msg.pinned;
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === "wd:setSettings") {
    const s = getSettings(msg.tabId);
    Object.assign(s, msg.settings || {});
    sendResponse({ ok: true, settings: s });
    return true;
  }

  if (msg.type === "wd:capture") {
    chrome.tabs.get(msg.tabId, (tab) => {
       if (tab) {
         chrome.tabs.captureVisibleTab(tab.windowId, {format: "jpeg", quality: 70}, (dataUrl) => {
           sendResponse({dataUrl: chrome.runtime.lastError ? null : dataUrl});
         });
       } else sendResponse({dataUrl: null});
    });
    return true;
  }
});

// Failed network requests via webRequest (catches CORS/blocked + non-2xx).
chrome.webRequest.onCompleted.addListener(
  (details) => {
    if (details.tabId < 0) return;
    if (details.statusCode >= 400) {
      pushEntry(details.tabId, {
        severity: "network",
        message: `${details.method} ${details.url} → ${details.statusCode}`,
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
