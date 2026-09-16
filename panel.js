// WebDebug Pro - Panel UI (for DevTools and Detached Windows)
const state = {
  tabId: null,
  entries: [],
  filters: { log: true, info: true, warn: true, error: true, network: true },
  search: "",
  group: false,
  persist: false,
  expanded: new Set(),
  theme: "dark",
  blacklist: new Set(),
  pause: false,
  history: [],
  historyIndex: -1,
  activeTab: "logs",
};

const $ = (sel) => document.querySelector(sel);
const listEl = $("#list");
const countEl = $("#count");
const tabInfoEl = $("#tabinfo");

function getTabId() {
  // Query param (if opened via wd:openWindow)
  const params = new URLSearchParams(window.location.search);
  const paramTabId = parseInt(params.get("tabId"), 10);
  if (!isNaN(paramTabId) && paramTabId > 0) {
    return Promise.resolve(paramTabId);
  }

  // DevTools panel
  if (window.chrome?.devtools?.inspectedWindow?.tabId) {
    return Promise.resolve(chrome.devtools.inspectedWindow.tabId);
  }

  // Active tab query
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs && tabs[0] ? tabs[0].id : null);
    });
  });
}

function fmtTime(ts) {
  const d = new Date(ts);
  return d.toTimeString().slice(0, 8) + "." + String(d.getMilliseconds()).padStart(3, "0");
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function argToText(a) {
  if (a && typeof a === "object" && a.__type === "Error") {
    return `${a.name}: ${a.message}\n${a.stack || ""}`;
  }
  if (typeof a === "object") {
    try { return JSON.stringify(a, null, 2); } catch { return String(a); }
  }
  return String(a);
}

function renderJsonTree(obj, isRoot = true) {
  if (obj === null) return `<span class="json-val null">null</span>`;
  if (obj === undefined || obj === "undefined") return `<span class="json-val null" style="color:#94a3b8;">undefined</span>`;
  if (obj === "[Circular]") return `<span class="json-val" style="color:#f59e0b; font-style:italic;">[Circular]</span>`;
  if (typeof obj === "string") return `<span class="json-val string">"${escapeHtml(obj)}"</span>`;
  if (typeof obj === "number") return `<span class="json-val number">${obj}</span>`;
  if (typeof obj === "boolean") return `<span class="json-val boolean">${obj}</span>`;

  if (typeof obj === "object") {
    if (obj.__type === "Error") {
      return `<span class="json-val error" style="color:#ef4444; font-weight:600;">${escapeHtml(obj.name)}: ${escapeHtml(obj.message)}</span>`;
    }
    if (obj.__type === "Element") {
      return `<span style="color:#38bdf8; font-family:monospace; font-weight:600;">${escapeHtml(obj.preview || `<${obj.tagName}>`)}</span>`;
    }
    if (obj.__type === "Map") {
      return `<span style="color:#a78bfa; font-weight:600;">Map(${obj.size})</span> ` + renderJsonTree(obj.entries, false);
    }
    if (obj.__type === "Set") {
      return `<span style="color:#a78bfa; font-weight:600;">Set(${obj.size})</span> ` + renderJsonTree(obj.values, false);
    }

    const isArray = Array.isArray(obj);
    const keys = Object.keys(obj);
    if (keys.length === 0) return isArray ? "[]" : "{}";

    const open = isArray ? "[" : "{";
    const close = isArray ? "]" : "}";

    let html = `<span class="json-item ${isRoot ? "" : "json-collapsed"}"><span class="json-toggle">${open}</span><div class="json-children">`;
    for (const key of keys) {
      html += `<div class="json-node">
        ${isArray ? "" : `<span class="json-key">${escapeHtml(key)}:</span> `}
        ${renderJsonTree(obj[key], false)}
      </div>`;
    }
    html += `</div><span>${close}</span></span>`;
    return html;
  }
  return escapeHtml(String(obj));
}

function renderArg(a) {
  if (a && typeof a === "object" && a.__type === "Error") {
    return escapeHtml(`${a.name}: ${a.message}\n${a.stack || ""}`);
  }
  if (typeof a === "object") {
    try { return `<div class="json-tree">${renderJsonTree(a, true)}</div>`; } catch { return escapeHtml(String(a)); }
  }
  return escapeHtml(String(a));
}

function stackText(e) {
  const frames = (e.stack && e.stack.length ? e.stack : e.callStack) || [];
  if (!frames.length) return "";
  return "Stack trace:\n" + frames.map((f) => "    " + f).join("\n");
}

function entryToText(e) {
  const argsText = (e.args || []).map(argToText).join(" ");
  const detail = argsText && argsText !== e.message ? "\n" + argsText : "";
  const st = stackText(e);
  return `[${fmtTime(e.timestamp)}] [${e.severity.toUpperCase()}] ${e.message}${detail}${e.source ? "\n  at " + e.source : ""}${st ? "\n" + st : ""}`;
}

function computeVisible() {
  const q = state.search.trim();
  let regex = null;
  if (q.startsWith("/") && q.lastIndexOf("/") > 0) {
    try {
      const lastSlash = q.lastIndexOf("/");
      regex = new RegExp(q.substring(1, lastSlash), q.substring(lastSlash + 1));
    } catch (_) {}
  }
  const qLower = q.toLowerCase();

  let list = state.entries.filter((e) => {
    if (!state.filters[e.severity]) return false;
    if (e.source && state.blacklist.has(e.source)) return false;
    if (!q) return true;
    if (regex) {
      return regex.test(e.message) || (e.source && regex.test(e.source)) || regex.test(e.severity);
    }
    return (
      e.message.toLowerCase().includes(qLower) ||
      (e.source || "").toLowerCase().includes(qLower) ||
      e.severity.includes(qLower)
    );
  });

  if (state.group) {
    const map = new Map();
    for (const e of list) {
      const key = e.severity + "|" + e.message;
      if (!map.has(key)) map.set(key, { ...e, _count: 1, _ids: [e.id] });
      else {
        const g = map.get(key);
        g._count++;
        g._ids.push(e.id);
        g.timestamp = e.timestamp;
      }
    }
    list = Array.from(map.values());
  }

  list.sort((a, b) => b.timestamp - a.timestamp);
  return list;
}

let renderRaf = null;
function updateBadgeCounters() {
  const counts = { all: state.entries.length, log: 0, info: 0, warn: 0, error: 0, network: 0 };
  for (const e of state.entries) {
    if (counts[e.severity] !== undefined) counts[e.severity]++;
  }
  const cAll = $("#countAll"); if (cAll) cAll.textContent = counts.all;
  const cLog = $("#countLog"); if (cLog) cLog.textContent = counts.log;
  const cInfo = $("#countInfo"); if (cInfo) cInfo.textContent = counts.info;
  const cWarn = $("#countWarn"); if (cWarn) cWarn.textContent = counts.warn;
  const cErr = $("#countError"); if (cErr) cErr.textContent = counts.error;
  const cNet = $("#countNet"); if (cNet) cNet.textContent = counts.network;
}

function scheduleRender() {
  updateBadgeCounters();
  if (renderRaf) return;
  renderRaf = requestAnimationFrame(() => {
    renderRaf = null;
    render();
  });
}

function render() {
  updateBadgeCounters();

  const visible = computeVisible();
  countEl.textContent = `${visible.length} / ${state.entries.length} entries`;

  if (visible.length === 0) {
    listEl.innerHTML = `
      <div class="wd-empty">
        <div class="wd-empty-icon">📜</div>
        <div>No logs captured yet.</div>
        <div style="font-size:11px; opacity:0.8;">Interact with the page — console output, errors, and network calls will stream live here.</div>
      </div>
    `;
    return;
  }

  const html = visible.map((e) => {
    const st = stackText(e);
    const showArgs = e.args && e.args.length > 0 && e.args.map(argToText).join(" ").trim() !== e.message.trim();
    let detailHtml = "";
    if (showArgs) {
      detailHtml += (e.args || []).map(renderArg).join("<br>");
    }
    if (st) {
      detailHtml += (detailHtml ? "<br><br>" : "") + escapeHtml(st);
    }
    if (!detailHtml) {
      detailHtml = `
        <div style="font-family:var(--wd-mono, monospace); font-size:11px; opacity:0.85; line-height:1.6;">
          <div><strong>Timestamp:</strong> ${new Date(e.timestamp).toISOString()} (${fmtTime(e.timestamp)})</div>
          <div><strong>Severity:</strong> ${escapeHtml(e.severity.toUpperCase())}</div>
          ${e.source ? `<div><strong>Source:</strong> ${escapeHtml(e.source)}</div>` : ""}
          <div style="margin-top:4px;"><strong>Full Message:</strong> ${escapeHtml(e.message)}</div>
        </div>
      `;
    }
    const isExpanded = state.expanded.has(String(e.id));

    return `
      <div class="wd-entry sev-${e.severity} ${e.pinned ? "pinned" : ""}" data-id="${escapeHtml(String(e.id))}">
        <div class="wd-time">${fmtTime(e.timestamp)}</div>
        <div class="wd-sev">${e.severity === "network" ? "net" : e.severity}</div>
        <div class="wd-content">
          <div class="wd-msg">${escapeHtml(e.message)}${e._count > 1 ? `<span class="wd-count-badge">×${e._count}</span>` : ""}</div>
          ${e.source ? `<span class="wd-src" title="${escapeHtml(e.source)}">${escapeHtml(e.source)}</span>` : ""}
          ${isExpanded ? `<div class="wd-expanded-box">${detailHtml}</div>` : ""}
        </div>
        <div class="wd-row-actions">
          <button class="wd-act-btn ${isExpanded ? "act-active" : ""}" data-act="expand" title="${isExpanded ? "Collapse details" : "Expand details"}">${isExpanded ? "−" : "+"}</button>
          <button class="wd-act-btn" data-act="copy" title="Copy log">📋</button>
          ${st ? `<button class="wd-act-btn" data-act="copyStack" title="Copy stack trace">Stack</button>` : ""}
          <button class="wd-act-btn ${e.pinned ? "pin-active" : ""}" data-act="pin" title="${e.pinned ? "Unstar log" : "Star log"}">${e.pinned ? "★" : "☆"}</button>
          ${e.source ? `<button class="wd-act-btn" data-act="block" title="Block logs from this source">🚫</button>` : ""}
          <button class="wd-act-btn delete-btn" data-act="delete" title="Cancel/Remove this log">✕</button>
        </div>
      </div>
    `;
  }).join("");

  listEl.innerHTML = html;

  const blChip = $("#blacklistChip");
  if (blChip) {
    if (state.blacklist.size > 0) {
      blChip.style.display = "inline-flex";
      $("#blacklistCount").textContent = state.blacklist.size;
    } else {
      blChip.style.display = "none";
    }
  }
}

function toast(msg) {
  const el = document.createElement("div");
  el.className = "wd-toast";
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1600);
}

async function copyText(t) {
  let copied = false;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(t);
      copied = true;
    }
  } catch (_) {}

  if (!copied) {
    try {
      const ta = document.createElement("textarea");
      ta.value = t;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      ta.style.left = "-9999px";
      (document.body || document.documentElement).appendChild(ta);
      ta.focus();
      ta.select();
      copied = document.execCommand("copy");
      ta.remove();
    } catch (_) {}
  }

  if (copied) {
    toast("Copied to clipboard");
  } else {
    toast("Failed to copy");
  }
}

function download(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  chrome.downloads.download({ url, filename, saveAs: true }, () => {
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  });
}

function exportAs(fmt) {
  const visible = computeVisible();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  if (fmt === "json") {
    download(`webdebug-${stamp}.json`, JSON.stringify(visible, null, 2), "application/json");
  } else if (fmt === "txt") {
    download(`webdebug-${stamp}.txt`, visible.map(entryToText).join("\n\n"), "text/plain");
  } else if (fmt === "csv") {
    const rows = [["timestamp", "severity", "message", "source", "stack"]];
    for (const e of visible) {
      rows.push([
        new Date(e.timestamp).toISOString(),
        e.severity,
        e.message,
        e.source || "",
        ((e.stack && e.stack.length ? e.stack : e.callStack) || []).join(" | "),
      ]);
    }
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    download(`webdebug-${stamp}.csv`, csv, "text/csv");
  } else if (fmt === "bugreport") {
    chrome.runtime.sendMessage({ type: "wd:capture", tabId: state.tabId }, (res) => {
      const img = res && res.dataUrl
        ? `<img src="${res.dataUrl}" style="max-width:100%; border:1px solid #ccc; box-shadow: 0 4px 6px rgba(0,0,0,0.1); margin-bottom: 20px;"/>`
        : "<p><i>Screenshot not available</i></p>";
      const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Bug Report - ${stamp}</title>
<style>body{font-family:-apple-system, sans-serif; max-width:1000px; margin:20px auto; padding:0 20px; background:#f8fafc; color:#0f172a;} pre{background:#ffffff; border:1px solid #e2e8f0; padding:15px; border-radius:6px; overflow:auto; font-size:12px;}</style>
</head><body>
<h1>WebDebug Pro - Bug Report</h1>
<p>Generated at: ${new Date().toLocaleString()}</p>
<h2>Screenshot</h2>
${img}
<h2>Console Logs (${visible.length})</h2>
<pre>${escapeHtml(JSON.stringify(visible, null, 2))}</pre>
</body></html>`;
      download(`bugreport-${stamp}.html`, html, "text/html");
    });
  }
}

function bindUI() {
  const searchEl = $("#search");
  const searchClear = $("#searchClear");
  if (searchEl) {
    searchEl.addEventListener("input", (e) => {
      state.search = e.target.value;
      if (searchClear) searchClear.style.display = state.search ? "block" : "none";
      render();
    });
  }
  if (searchClear) {
    searchClear.addEventListener("click", () => {
      if (searchEl) searchEl.value = "";
      state.search = "";
      searchClear.style.display = "none";
      render();
    });
  }

  // Filter chips
  document.querySelectorAll(".wd-chip[data-filter]").forEach((chip) => {
    chip.addEventListener("click", () => {
      const f = chip.dataset.filter;
      if (f === "all") {
        const allOn = Object.values(state.filters).every(Boolean);
        Object.keys(state.filters).forEach((k) => (state.filters[k] = !allOn));
        document.querySelectorAll(".wd-chip[data-filter]").forEach((c) => {
          if (!allOn) c.classList.add("active");
          else c.classList.remove("active");
        });
      } else {
        state.filters[f] = !state.filters[f];
        chip.classList.toggle("active", state.filters[f]);
      }
      render();
    });
  });

  const btnGroup = $("#group");
  if (btnGroup) {
    btnGroup.addEventListener("click", () => {
      state.group = !state.group;
      btnGroup.classList.toggle("active", state.group);
      render();
    });
  }

  const btnPersist = $("#persist");
  if (btnPersist) {
    btnPersist.addEventListener("click", () => {
      state.persist = !state.persist;
      btnPersist.classList.toggle("active", state.persist);
      chrome.runtime.sendMessage({
        type: "wd:setSettings",
        tabId: state.tabId,
        settings: { persist: state.persist },
      });
    });
  }

  const btnPause = $("#pause");
  if (btnPause) {
    btnPause.addEventListener("click", () => {
      state.pause = !state.pause;
      btnPause.classList.toggle("active", state.pause);
      if (!state.pause) render();
    });
  }

  $("#clear")?.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "wd:clear", tabId: state.tabId }, () => {});
    state.entries = state.entries.filter((e) => e.pinned);
    render();
  });

  $("#copyAll")?.addEventListener("click", () => {
    copyText(computeVisible().map(entryToText).join("\n\n"));
  });

  const exp = document.querySelector(".wd-export");
  $("#exportBtn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    exp?.classList.toggle("open");
  });
  document.addEventListener("click", () => exp?.classList.remove("open"));

  $("#exportMenu")?.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-fmt]");
    if (b) {
      exportAs(b.dataset.fmt);
      exp?.classList.remove("open");
    }
  });

  $("#theme")?.addEventListener("click", () => {
    state.theme = state.theme === "light" ? "dark" : "light";
    document.body.className = "theme-" + state.theme;
    chrome.storage.local.set({ theme: state.theme });
  });

  $("#blacklistChip")?.addEventListener("click", () => {
    state.blacklist.clear();
    render();
  });

  // DOM Inspect Mode
  const btnInspect = $("#btnInspect");
  if (btnInspect) {
    btnInspect.addEventListener("click", () => {
      chrome.scripting.executeScript({
        target: { tabId: state.tabId },
        world: "MAIN",
        func: () => {
          if (window.__WD_INSPECTING) return;
          window.__WD_INSPECTING = true;

          const overlay = document.createElement("div");
          Object.assign(overlay.style, {
            position: "fixed",
            pointerEvents: "none",
            zIndex: "2147483647",
            border: "2px solid #38bdf8",
            background: "rgba(56, 189, 248, 0.2)",
            borderRadius: "3px",
            transition: "all 0.08s ease",
            display: "none",
          });
          document.body.appendChild(overlay);

          function onMove(e) {
            const el = e.target;
            if (el === overlay) return;
            const r = el.getBoundingClientRect();
            Object.assign(overlay.style, {
              display: "block",
              left: r.left + "px",
              top: r.top + "px",
              width: r.width + "px",
              height: r.height + "px",
            });
          }
          function onClick(e) {
            e.preventDefault();
            e.stopPropagation();
            cleanup();

            const el = e.target;
            const attrs = {};
            for (let i = 0; i < el.attributes.length; i++) {
              attrs[el.attributes[i].name] = el.attributes[i].value;
            }
            const info = {
              tagName: el.tagName.toLowerCase(),
              id: el.id,
              className: el.className,
              attributes: attrs,
              innerHTML: el.innerHTML.substring(0, 200) + (el.innerHTML.length > 200 ? "..." : ""),
            };
            console.log("Inspected Element:", info);
          }
          function cleanup() {
            window.__WD_INSPECTING = false;
            if (overlay.parentNode) overlay.remove();
            document.removeEventListener("mousemove", onMove, true);
            document.removeEventListener("click", onClick, true);
          }
          document.addEventListener("mousemove", onMove, true);
          document.addEventListener("click", onClick, true);
        },
      }).then(() => toast("Hover & click an element on the page")).catch(() => toast("Error starting inspect mode"));
    });
  }

  // Console REPL
  const jsInput = $("#jsInput");
  if (jsInput) {
    jsInput.addEventListener("keydown", (e) => {
      if (e.key === "ArrowUp") {
        if (state.history.length > 0) {
          if (state.historyIndex === -1) state.historyIndex = state.history.length - 1;
          else state.historyIndex = Math.max(0, state.historyIndex - 1);
          jsInput.value = state.history[state.historyIndex] || "";
        }
        e.preventDefault();
      } else if (e.key === "ArrowDown") {
        if (state.historyIndex !== -1) {
          state.historyIndex = Math.min(state.history.length, state.historyIndex + 1);
          jsInput.value = state.history[state.historyIndex] || "";
        }
        e.preventDefault();
      } else if (e.key === "Enter" && jsInput.value.trim()) {
        const code = jsInput.value.trim();
        jsInput.value = "";
        state.history.push(code);
        state.historyIndex = -1;

        state.entries.push({
          id: Date.now() + Math.random(),
          timestamp: Date.now(),
          severity: "info",
          message: "> " + code,
          args: [],
          source: "console",
        });
        render();

        chrome.runtime.sendMessage({ type: "wd:eval", tabId: state.tabId, code }, (res) => {
          if (!res) return;
          const entry = {
            id: Date.now() + Math.random(),
            timestamp: Date.now(),
            severity: res.err ? "error" : "log",
            message: res.err ? (res.err.message || res.err.name || "Error") : (typeof res.res === "object" ? "" : String(res.res)),
            args: res.err ? [{ __type: "Error", ...res.err }] : [res.res],
            source: "console",
          };
          state.entries.push(entry);
          render();
        });
      }
    });
  }

  // Tabs: Logs vs Storage
  const tabLogs = $("#tabLogs");
  const tabStorage = $("#tabStorage");
  const viewLogs = $("#viewLogs");
  const viewStorage = $("#viewStorage");

  if (tabLogs && tabStorage) {
    tabLogs.addEventListener("click", () => {
      tabLogs.classList.add("active");
      tabStorage.classList.remove("active");
      viewLogs.style.display = "flex";
      viewStorage.style.display = "none";
    });
    tabStorage.addEventListener("click", () => {
      tabStorage.classList.add("active");
      tabLogs.classList.remove("active");
      viewStorage.style.display = "flex";
      viewLogs.style.display = "none";
      refreshStorage();
    });
  }

  function refreshStorage() {
    chrome.runtime.sendMessage({ type: "wd:getStorage", tabId: state.tabId }, (res) => {
      if (!res) return;
      $("#outLocal").innerHTML = `<div class="json-tree">${renderJsonTree(res.ls || {}, true)}</div>`;
      $("#outSession").innerHTML = `<div class="json-tree">${renderJsonTree(res.ss || {}, true)}</div>`;
      const cobj = {};
      if (res.cookies) {
        res.cookies.split(";").forEach((c) => {
          const parts = c.split("=");
          if (parts[0]) cobj[parts[0].trim()] = decodeURIComponent(parts.slice(1).join("=") || "");
        });
      }
      $("#outCookies").innerHTML = `<div class="json-tree">${renderJsonTree(cobj, true)}</div>`;
    });
  }

  function clearStorage(type) {
    chrome.runtime.sendMessage({ type: "wd:clearStorage", tabId: state.tabId, storageType: type }, () => {
      toast("Storage cleared");
      refreshStorage();
    });
  }

  $("#btnRefreshLocal")?.addEventListener("click", refreshStorage);
  $("#btnRefreshSession")?.addEventListener("click", refreshStorage);
  $("#btnRefreshCookies")?.addEventListener("click", refreshStorage);

  $("#btnClearLocal")?.addEventListener("click", () => clearStorage("ls"));
  $("#btnClearSession")?.addEventListener("click", () => clearStorage("ss"));
  $("#btnClearCookies")?.addEventListener("click", () => clearStorage("cookies"));

  listEl.addEventListener("click", (e) => {
    if (e.target.classList.contains("json-toggle")) {
      const parent = e.target.closest(".json-item");
      if (parent) parent.classList.toggle("json-collapsed");
      return;
    }
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    e.stopPropagation();

    const entryEl = btn.closest(".wd-entry");
    if (!entryEl) return;
    const id = String(entryEl.dataset.id);
    const entry = state.entries.find((x) => String(x.id) === id) || computeVisible().find((x) => String(x.id) === id);
    if (!entry) return;

    const act = btn.dataset.act;
    if (act === "copy") {
      copyText(entryToText(entry));
    } else if (act === "copyStack") {
      const frames = (entry.stack && entry.stack.length ? entry.stack : entry.callStack) || [];
      if (!frames.length) { toast("No stack trace available"); return; }
      copyText(frames.join("\n"));
    } else if (act === "pin") {
      entry.pinned = !entry.pinned;
      chrome.runtime.sendMessage({ type: "wd:setPinned", tabId: state.tabId, id: entry.id, pinned: entry.pinned });
      toast(entry.pinned ? "Log starred (pinned)" : "Log unstarred");
      render();
    } else if (act === "expand") {
      const idStr = String(entry.id);
      if (state.expanded.has(idStr)) state.expanded.delete(idStr);
      else state.expanded.add(idStr);
      render();
    } else if (act === "delete" || act === "cancel") {
      const idStr = String(entry.id);
      state.expanded.delete(idStr);
      const idx = state.entries.findIndex((x) => String(x.id) === idStr);
      if (idx !== -1) {
        state.entries.splice(idx, 1);
        chrome.runtime.sendMessage({ type: "wd:deleteEntry", tabId: state.tabId, id: entry.id });
        toast("Log removed");
        scheduleRender();
      }
    } else if (act === "block") {
      if (entry.source) {
        state.blacklist.add(entry.source);
        toast(`Blocked logs from ${entry.source}`);
        scheduleRender();
      }
    }
  });
}

async function init() {
  const { theme } = await chrome.storage.local.get("theme");
  if (theme) {
    state.theme = theme;
    document.body.className = "theme-" + theme;
  }

  state.tabId = await getTabId();
  if (state.tabId == null) {
    listEl.innerHTML = `<div class="wd-empty"><div class="wd-empty-icon">⚠️</div><div>Could not detect an active tab.</div></div>`;
    return;
  }
  tabInfoEl.textContent = `tab #${state.tabId}`;

  bindUI();

  chrome.runtime.sendMessage({ type: "wd:getState", tabId: state.tabId }, (res) => {
    if (!res || !res.entries) return;
    const idSet = new Set(state.entries.map((e) => e.id));
    for (const entry of res.entries) {
      if (!idSet.has(entry.id)) {
        state.entries.push(entry);
        idSet.add(entry.id);
      }
    }
    state.entries.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    state.persist = !!(res.settings && res.settings.persist);
    const btnP = $("#persist");
    if (btnP) btnP.classList.toggle("active", state.persist);
    scheduleRender();
  });

  const port = chrome.runtime.connect({ name: "wd-panel:" + state.tabId });
  port.onMessage.addListener((msg) => {
    if (msg.type === "wd:new" && msg.entry) {
      if (!state.entries.some((e) => String(e.id) === String(msg.entry.id))) {
        state.entries.push(msg.entry);
        if (state.entries.length > 1000) state.entries.shift();
        if (!state.pause) scheduleRender();
        else updateBadgeCounters();
      }
    } else if (msg.type === "wd:reset") {
      state.entries = msg.entries || [];
      if (!state.pause) scheduleRender();
      else updateBadgeCounters();
    } else if (msg.type === "wd:entryDeleted") {
      state.entries = state.entries.filter((e) => String(e.id) !== String(msg.id));
      if (!state.pause) scheduleRender();
      else updateBadgeCounters();
    } else if (msg.type === "wd:entryPinned") {
      const target = state.entries.find((e) => String(e.id) === String(msg.id));
      if (target) {
        target.pinned = !!msg.pinned;
        if (!state.pause) scheduleRender();
      }
    }
  });

  port.onDisconnect.addListener(() => {
    const _ignored = chrome.runtime.lastError;
  });

  // Performance metrics polling
  setInterval(() => {
    if (!state.tabId) return;
    chrome.scripting.executeScript({
      target: { tabId: state.tabId },
      world: "MAIN",
      func: () => {
        let mem = "";
        let load = "";
        try {
          const p = performance.memory;
          if (p && p.usedJSHeapSize) mem = (p.usedJSHeapSize / 1048576).toFixed(1);
        } catch (_) {}
        try {
          const t = performance.timing;
          if (t && t.loadEventEnd > 0) load = String(t.loadEventEnd - t.navigationStart);
        } catch (_) {}
        return { mem, load };
      },
    }).then((r) => {
      const data = r && r[0] && r[0].result;
      if (data) {
        const perfEl = document.getElementById("perfWidget");
        if (perfEl && data.mem) perfEl.textContent = `Mem: ${data.mem}MB`;
        const loadEl = document.getElementById("loadWidget");
        if (loadEl && data.load) loadEl.textContent = `Load: ${data.load}ms`;
      }
    }).catch(() => {});
  }, 2000);
}

init();
