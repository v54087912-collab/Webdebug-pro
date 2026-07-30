// WebDebug Pro - Panel UI
const state = {
  tabId: null,
  entries: [],
  filters: { log: true, info: true, warn: true, error: true, network: true },
  search: "",
  group: false,
  persist: false,
  expanded: new Set(),
  theme: "light",
  blacklist: new Set(),
  pause: false,
};

const $ = (sel) => document.querySelector(sel);
const listEl = $("#list");
const countEl = $("#count");
const tabInfoEl = $("#tabinfo");

function getTabId() {
  // DevTools panel
  if (window.chrome?.devtools?.inspectedWindow?.tabId) {
    return Promise.resolve(chrome.devtools.inspectedWindow.tabId);
  }
  // Popup: use active tab
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs[0] ? tabs[0].id : null);
    });
  });
}

function fmtTime(ts) {
  const d = new Date(ts);
  return d.toTimeString().slice(0, 8) + "." + String(d.getMilliseconds()).padStart(3, "0");
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
  if (typeof obj === "string") return `<span class="json-val string">"${escapeHtml(obj)}"</span>`;
  if (typeof obj === "number") return `<span class="json-val number">${obj}</span>`;
  if (typeof obj === "boolean") return `<span class="json-val boolean">${obj}</span>`;
  
  if (typeof obj === "object") {
    if (obj.__type === "Error") {
       return `<span class="json-val error">${escapeHtml(obj.name)}: ${escapeHtml(obj.message)}</span>`;
    }
    const isArray = Array.isArray(obj);
    const keys = Object.keys(obj);
    if (keys.length === 0) return isArray ? "[]" : "{}";
    
    const open = isArray ? "[" : "{";
    const close = isArray ? "]" : "}";
    
    let html = `<span class="json-item ${isRoot ? '' : 'json-collapsed'}"><span class="json-toggle">${open}</span><div class="json-children">`;
    for (const key of keys) {
      html += `<div class="json-node">
        ${isArray ? '' : `<span class="json-key">${escapeHtml(key)}:</span> `}
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
     } catch(e) {}
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
  // newest at top
  list.sort((a, b) => b.timestamp - a.timestamp);
  return list;
}

function render() {
  const visible = computeVisible();
  countEl.textContent = `${visible.length} / ${state.entries.length} entries`;
  if (visible.length === 0) {
    listEl.innerHTML = `<div class="empty">No logs yet. Interact with the page — console output, errors and failed network requests will stream in here.</div>`;
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
    const showExpand = !!detailHtml;
    const isExpanded = state.expanded.has(e.id);
    return `
      <div class="entry sev-${e.severity} ${e.pinned ? "pinned" : ""}" data-id="${e.id}">
        <div class="time">${fmtTime(e.timestamp)}</div>
        <div class="sev">${e.severity}</div>
        <div>
          <div class="msg">${escapeHtml(e.message)}${e._count > 1 ? `<span class="badge">×${e._count}</span>` : ""}</div>
          ${e.source ? `<span class="src">${escapeHtml(e.source)}</span>` : ""}
          ${isExpanded && showExpand ? `<div class="expanded">${detailHtml}</div>` : ""}
        </div>
        <div class="actions">
          ${showExpand ? `<button data-act="expand" title="Show stack trace">${isExpanded ? "−" : "+"}</button>` : ""}
          <button data-act="copy">Copy</button>
          ${st ? `<button data-act="copyStack" title="Copy only the stack trace">Copy Stack</button>` : ""}
          <button data-act="pin" class="${e.pinned ? "pin" : ""}">${e.pinned ? "★" : "☆"}</button>
          ${e.source ? `<button data-act="block" title="Hide logs from this source">🚫</button>` : ""}
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

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function toast(msg) {
  const el = document.createElement("div");
  el.textContent = msg;
  el.style.cssText = "position:fixed;bottom:12px;left:50%;transform:translateX(-50%);background:#111;color:#fff;padding:6px 12px;border-radius:6px;z-index:100;font-size:12px;";
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1500);
}

async function copyText(t) {
  try {
    await navigator.clipboard.writeText(t);
    toast("Copied");
  } catch {
    const ta = document.createElement("textarea");
    ta.value = t; document.body.appendChild(ta); ta.select();
    document.execCommand("copy"); ta.remove(); toast("Copied");
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
      rows.push([new Date(e.timestamp).toISOString(), e.severity, e.message, e.source || "", ((e.stack && e.stack.length ? e.stack : e.callStack) || []).join(" | ")]);
    }
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    download(`webdebug-${stamp}.csv`, csv, "text/csv");
  } else if (fmt === "bugreport") {
    chrome.runtime.sendMessage({type: "wd:capture", tabId: state.tabId}, (res) => {
      const img = res && res.dataUrl ? `<img src="${res.dataUrl}" style="max-width:100%; border:1px solid #ccc; box-shadow: 0 4px 6px rgba(0,0,0,0.1); margin-bottom: 20px;"/>` : "<p><i>Screenshot not available</i></p>";
      const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Bug Report - ${stamp}</title>
<style>body{font-family:-apple-system, sans-serif; max-width:1000px; margin:20px auto; padding:0 20px;} pre{background:#f1f5f9; padding:15px; border-radius:6px; overflow:auto; font-size:12px;}</style>
</head><body>
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
  $("#search").addEventListener("input", (e) => { state.search = e.target.value; render(); });
  document.querySelectorAll("[data-filter]").forEach((cb) => {
    cb.addEventListener("change", () => { state.filters[cb.dataset.filter] = cb.checked; render(); });
  });
  $("#group").addEventListener("change", (e) => { state.group = e.target.checked; render(); });
  $("#persist")?.addEventListener("change", (e) => {
    state.persist = e.target.checked;
    chrome.runtime.sendMessage({ type: "wd:setSettings", tabId: state.tabId, settings: { persist: state.persist } });
  });
  $("#pause")?.addEventListener("change", (e) => {
    state.pause = e.target.checked;
    if (!state.pause) render();
  });
  $("#clear")?.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "wd:clear", tabId: state.tabId }, () => {});
  });
  $("#copyAll").addEventListener("click", () => {
    copyText(computeVisible().map(entryToText).join("\n\n"));
  });
  const exp = document.querySelector(".export");
  $("#exportBtn").addEventListener("click", (e) => { e.stopPropagation(); exp.classList.toggle("open"); });
  document.addEventListener("click", () => exp.classList.remove("open"));
  $("#exportMenu").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-fmt]");
    if (b) { exportAs(b.dataset.fmt); exp.classList.remove("open"); }
  });
  $("#theme").addEventListener("click", () => {
    state.theme = state.theme === "light" ? "dark" : "light";
    document.body.className = "theme-" + state.theme;
    chrome.storage.local.set({ theme: state.theme });
  });

  $("#blacklistChip")?.addEventListener("click", () => {
    state.blacklist.clear();
    render();
  });

  $("#btnInspect")?.addEventListener("click", () => {
    chrome.scripting.executeScript({
      target: { tabId: state.tabId },
      world: "MAIN",
      func: () => {
        if (window.__WD_INSPECTING) return;
        window.__WD_INSPECTING = true;
        
        let overlay = document.createElement("div");
        Object.assign(overlay.style, {
          position: "fixed", pointerEvents: "none", zIndex: "2147483647",
          border: "2px solid #2563eb", background: "rgba(37,99,235,0.2)",
          transition: "all 0.1s ease", display: "none"
        });
        document.body.appendChild(overlay);

        function onMove(e) {
          const el = e.target;
          if (el === overlay) return;
          const r = el.getBoundingClientRect();
          Object.assign(overlay.style, {
            display: "block", left: r.left + "px", top: r.top + "px",
            width: r.width + "px", height: r.height + "px"
          });
        }
        function onClick(e) {
          e.preventDefault();
          e.stopPropagation();
          cleanup();
          
          const el = e.target;
          let attrs = {};
          for (let i = 0; i < el.attributes.length; i++) {
             attrs[el.attributes[i].name] = el.attributes[i].value;
          }
          const info = {
             tagName: el.tagName.toLowerCase(),
             id: el.id,
             className: el.className,
             attributes: attrs,
             innerHTML: el.innerHTML.substring(0, 200) + (el.innerHTML.length > 200 ? "..." : "")
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
      }
    }).then(() => toast("Hover and click an element")).catch(e => toast("Error starting inspect mode"));
  });

  const jsInput = $("#jsInput");
  if (jsInput) {
    jsInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && e.target.value.trim()) {
        const code = e.target.value.trim();
        e.target.value = "";
        
        state.entries.push({
          id: Date.now() + Math.random(),
          timestamp: Date.now(),
          severity: "info",
          message: "> " + code,
          args: [],
          source: ""
        });
        render();

        if (chrome.devtools && chrome.devtools.inspectedWindow) {
          chrome.devtools.inspectedWindow.eval(code, (res, err) => {
            if (err || typeof res !== "undefined") {
              const entry = {
                id: Date.now() + Math.random(),
                timestamp: Date.now(),
                severity: err ? "error" : "log",
                message: err ? (err.value || err.description || "Error") : "",
                args: err ? [] : [res],
                source: "console"
              };
              if (!err && typeof res !== 'object') entry.message = String(res);
              state.entries.push(entry);
              render();
            }
          });
        } else {
          chrome.scripting.executeScript({
            target: { tabId: state.tabId },
            world: "MAIN",
            func: (c) => {
              try { return { res: window.eval(c) }; }
              catch(err) { return { err: { name: err.name, message: err.message, stack: err.stack } }; }
            },
            args: [code]
          }).then(results => {
            const frame = results[0];
            if (frame && frame.result) {
              const {res, err} = frame.result;
              if (err || typeof res !== "undefined") {
                const entry = {
                  id: Date.now() + Math.random(),
                  timestamp: Date.now(),
                  severity: err ? "error" : "log",
                  message: err ? err.message : "",
                  args: err ? [{__type:"Error", ...err}] : [res],
                  source: "console",
                };
                if (!err && typeof res !== 'object') entry.message = String(res);
                state.entries.push(entry);
                render();
              }
            }
          }).catch(e => toast("Error: " + e.message));
        }
      }
    });
  }

  // Storage Manager Tabs
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
    chrome.scripting.executeScript({
      target: { tabId: state.tabId },
      world: "MAIN",
      func: () => {
        const ls = { ...localStorage };
        const ss = { ...sessionStorage };
        const cookies = document.cookie;
        return { ls, ss, cookies };
      }
    }).then(results => {
      if (results && results[0] && results[0].result) {
        const data = results[0].result;
        $("#outLocal").innerHTML = `<div class="json-tree">${renderJsonTree(data.ls, true)}</div>`;
        $("#outSession").innerHTML = `<div class="json-tree">${renderJsonTree(data.ss, true)}</div>`;
        let cobj = {};
        if (data.cookies) {
          data.cookies.split(';').forEach(c => {
             const parts = c.split('=');
             if(parts[0]) cobj[parts[0].trim()] = decodeURIComponent(parts.slice(1).join('=') || '');
          });
        }
        $("#outCookies").innerHTML = `<div class="json-tree">${renderJsonTree(cobj, true)}</div>`;
      }
    }).catch(e => toast("Error fetching storage"));
  }

  function clearStorage(type) {
    chrome.scripting.executeScript({
      target: { tabId: state.tabId },
      world: "MAIN",
      func: (t) => {
        if (t === 'ls') localStorage.clear();
        if (t === 'ss') sessionStorage.clear();
        if (t === 'cookies') {
           const cookies = document.cookie.split(";");
           for (let i = 0; i < cookies.length; i++) {
              const cookie = cookies[i];
              const eqPos = cookie.indexOf("=");
              const name = eqPos > -1 ? cookie.substr(0, eqPos) : cookie;
              document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
           }
        }
      },
      args: [type]
    }).then(() => {
      toast("Cleared");
      refreshStorage();
    }).catch(e => toast("Error clearing storage"));
  }

  const btnRL = $("#btnRefreshLocal"); if(btnRL) btnRL.addEventListener("click", refreshStorage);
  const btnRS = $("#btnRefreshSession"); if(btnRS) btnRS.addEventListener("click", refreshStorage);
  const btnRC = $("#btnRefreshCookies"); if(btnRC) btnRC.addEventListener("click", refreshStorage);
  
  const btnCL = $("#btnClearLocal"); if(btnCL) btnCL.addEventListener("click", () => clearStorage('ls'));
  const btnCS = $("#btnClearSession"); if(btnCS) btnCS.addEventListener("click", () => clearStorage('ss'));
  const btnCC = $("#btnClearCookies"); if(btnCC) btnCC.addEventListener("click", () => clearStorage('cookies'));

  listEl.addEventListener("click", (e) => {
    if (e.target.classList.contains("json-toggle")) {
      const parent = e.target.closest(".json-item");
      if (parent) parent.classList.toggle("json-collapsed");
      return;
    }
    const entryEl = e.target.closest(".entry");
    if (!entryEl) return;
    const id = parseInt(entryEl.dataset.id, 10);
    const entry = state.entries.find((x) => x.id === id) ||
      computeVisible().find((x) => x.id === id);
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === "copy") {
      copyText(entryToText(entry));
    } else if (act === "copyStack") {
      const frames = (entry.stack && entry.stack.length ? entry.stack : entry.callStack) || [];
      if (!frames.length) { toast("No stack trace"); return; }
      copyText(frames.join("\n"));
    } else if (act === "pin") {
      const target = state.entries.find((x) => x.id === id);
      if (target) {
        target.pinned = !target.pinned;
        chrome.runtime.sendMessage({ type: "wd:setPinned", tabId: state.tabId, id, pinned: target.pinned });
        render();
      }
    } else if (act === "expand") {
      if (state.expanded.has(id)) state.expanded.delete(id);
      else state.expanded.add(id);
      render();
    } else if (act === "block") {
      if (entry.source) {
        state.blacklist.add(entry.source);
        render();
      }
    }
  });
}

async function init() {
  const { theme } = await chrome.storage.local.get("theme");
  if (theme) { state.theme = theme; document.body.className = "theme-" + theme; }

  state.tabId = await getTabId();
  if (state.tabId == null) {
    listEl.innerHTML = `<div class="empty">Could not detect an active tab.</div>`;
    return;
  }
  tabInfoEl.textContent = `tab #${state.tabId}`;

  bindUI();

  chrome.runtime.sendMessage({ type: "wd:getState", tabId: state.tabId }, (res) => {
    if (!res) return;
    state.entries = res.entries || [];
    state.persist = !!(res.settings && res.settings.persist);
    $("#persist").checked = state.persist;
    render();
  });

  const port = chrome.runtime.connect({ name: "wd-panel:" + state.tabId });
  port.onMessage.addListener((msg) => {
    if (msg.type === "wd:new") {
      state.entries.push(msg.entry);
      if (!state.pause) render();
    } else if (msg.type === "wd:reset") {
      state.entries = msg.entries || [];
      if (!state.pause) render();
    }
  });

  setInterval(() => {
    if (!state.tabId) return;
    chrome.scripting.executeScript({
      target: { tabId: state.tabId },
      world: "MAIN",
      func: () => {
        let text = "";
        try {
           const p = performance.memory;
           if (p && p.usedJSHeapSize) text += `Mem: ${(p.usedJSHeapSize / 1048576).toFixed(1)}MB`;
        } catch(e){}
        try {
           const t = performance.timing;
           if (t && t.loadEventEnd > 0) {
              const loadTime = t.loadEventEnd - t.navigationStart;
              text += (text ? " | " : "") + `Load: ${loadTime}ms`;
           }
        } catch(e){}
        return text;
      }
    }).then(r => {
       if (r && r[0] && typeof r[0].result === "string") {
          const perfEl = document.getElementById("perfWidget");
          if (perfEl) perfEl.textContent = r[0].result;
       }
    }).catch(e=>{});
  }, 2000);
}

init();
