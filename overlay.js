// WebDebug Pro - In-Page Floating Draggable Debugger Component
(function () {
  if (window.__WEBDEBUG_PRO_OVERLAY__) {
    return;
  }

  const state = {
    tabId: null,
    visible: false,
    minimized: false,
    entries: [],
    filters: { log: true, info: true, warn: true, error: true, network: true },
    search: "",
    group: false,
    persist: false,
    pause: false,
    theme: "dark",
    expanded: new Set(),
    blacklist: new Set(),
    activeTab: "logs",
    inspecting: false,
    history: [],
    historyIndex: -1,
    unreadErrors: 0,
    pos: {
      left: Math.max(20, window.innerWidth - 760),
      top: 60,
      width: Math.min(740, window.innerWidth - 40),
      height: Math.min(520, window.innerHeight - 80),
    },
    bubblePos: {
      left: null,
      top: null,
      right: 20,
      bottom: 24,
    },
  };

  // Restore saved position and preferences
  try {
    const savedPos = localStorage.getItem("__wd_panel_pos");
    if (savedPos) {
      const p = JSON.parse(savedPos);
      if (p && typeof p.left === "number" && typeof p.top === "number") {
        state.pos.left = Math.max(0, Math.min(window.innerWidth - 200, p.left));
        state.pos.top = Math.max(0, Math.min(window.innerHeight - 100, p.top));
        if (p.width) state.pos.width = Math.max(460, Math.min(window.innerWidth, p.width));
        if (p.height) state.pos.height = Math.max(280, Math.min(window.innerHeight, p.height));
      }
    }
    const savedBubblePos = localStorage.getItem("__wd_bubble_pos");
    if (savedBubblePos) {
      const bp = JSON.parse(savedBubblePos);
      if (bp && typeof bp.left === "number" && typeof bp.top === "number") {
        state.bubblePos.left = Math.max(0, Math.min(window.innerWidth - 60, bp.left));
        state.bubblePos.top = Math.max(0, Math.min(window.innerHeight - 60, bp.top));
      }
    }
    const savedTheme = localStorage.getItem("__wd_theme");
    if (savedTheme) state.theme = savedTheme;
  } catch (_) {}

  // Create or clean Root Container and attach Shadow DOM
  let hostEl = document.getElementById("webdebug-pro-root");
  let shadow;

  if (hostEl && hostEl.shadowRoot) {
    shadow = hostEl.shadowRoot;
    // Clear any existing children from prior injection
    while (shadow.firstChild) {
      shadow.removeChild(shadow.firstChild);
    }
  } else {
    if (hostEl) {
      try { hostEl.remove(); } catch (_) {}
    }
    hostEl = document.createElement("div");
    hostEl.id = "webdebug-pro-root";
    hostEl.style.cssText = "position:absolute;top:0;left:0;width:0;height:0;z-index:2147483647;pointer-events:none;";
    try {
      shadow = hostEl.attachShadow({ mode: "open" });
    } catch (_) {
      shadow = hostEl.shadowRoot || hostEl;
    }
  }

  function ensureHostAttached() {
    if (!hostEl.parentNode) {
      const target = document.body || document.documentElement;
      if (target) {
        target.appendChild(hostEl);
      } else {
        document.addEventListener("DOMContentLoaded", () => {
          (document.body || document.documentElement)?.appendChild(hostEl);
        }, { once: true });
      }
    }
  }
  ensureHostAttached();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureHostAttached, { once: true });
  }

  // CSS Stylesheet injected into Shadow DOM
  const styleEl = document.createElement("style");
  styleEl.textContent = `
    :root, .theme-light {
      --bg: #ffffff;
      --bg-translucent: rgba(255, 255, 255, 0.94);
      --fg: #0f172a;
      --muted: #64748b;
      --subtle: #94a3b8;
      --border: rgba(15, 23, 42, 0.12);
      --border-subtle: rgba(15, 23, 42, 0.06);
      --card: #f8fafc;
      --card-hover: #f1f5f9;
      --hover: #e2e8f0;
      --accent: #2563eb;
      --accent-hover: #1d4ed8;
      --accent-glow: rgba(37, 99, 235, 0.15);
      --log: #64748b;
      --log-bg: rgba(100, 116, 139, 0.12);
      --info: #0284c7;
      --info-bg: rgba(2, 132, 199, 0.12);
      --warn: #d97706;
      --warn-bg: rgba(217, 119, 6, 0.12);
      --error: #dc2626;
      --error-bg: rgba(220, 38, 38, 0.12);
      --network: #7c3aed;
      --network-bg: rgba(124, 58, 237, 0.12);
      --pin: #f59e0b;
      --shadow-window: 0 20px 50px rgba(0, 0, 0, 0.28), 0 0 0 1px rgba(0, 0, 0, 0.1);
      --shadow-bubble: 0 10px 25px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.1);
    }
    .theme-dark {
      --bg: #0b0f19;
      --bg-translucent: rgba(11, 15, 25, 0.95);
      --fg: #f1f5f9;
      --muted: #94a3b8;
      --subtle: #475569;
      --border: rgba(255, 255, 255, 0.12);
      --border-subtle: rgba(255, 255, 255, 0.06);
      --card: #131b2e;
      --card-hover: #1c2742;
      --hover: #1e293b;
      --accent: #38bdf8;
      --accent-hover: #0ea5e9;
      --accent-glow: rgba(56, 189, 248, 0.2);
      --log: #94a3b8;
      --log-bg: rgba(148, 163, 184, 0.14);
      --info: #38bdf8;
      --info-bg: rgba(56, 189, 248, 0.14);
      --warn: #fbbf24;
      --warn-bg: rgba(251, 191, 36, 0.14);
      --error: #f87171;
      --error-bg: rgba(248, 113, 113, 0.16);
      --network: #c084fc;
      --network-bg: rgba(192, 132, 252, 0.14);
      --pin: #fbbf24;
      --shadow-window: 0 25px 60px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.14);
      --shadow-bubble: 0 12px 30px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 255, 255, 0.15);
    }
    * { box-sizing: border-box; }
    .wd-shell {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", sans-serif;
      font-size: 12px;
      line-height: 1.45;
      color: var(--fg);
      pointer-events: auto;
    }
    ::-webkit-scrollbar { width: 7px; height: 7px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }
    ::-webkit-scrollbar-thumb:hover { background: var(--muted); }

    /* Window Container */
    .wd-window {
      position: fixed;
      display: flex;
      flex-direction: column;
      background: var(--bg-translucent);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
      border-radius: 12px;
      box-shadow: var(--shadow-window);
      border: 1px solid var(--border);
      overflow: hidden;
      z-index: 2147483647;
      min-width: 460px;
      min-height: 280px;
      transition: opacity 0.15s ease, transform 0.15s ease;
    }
    .wd-window.hidden {
      display: none !important;
    }

    /* Header Bar */
    .wd-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      background: var(--card);
      border-bottom: 1px solid var(--border);
      cursor: grab;
      user-select: none;
      touch-action: none;
    }
    .wd-header.dragging {
      cursor: grabbing !important;
    }
    .wd-header-left {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .wd-drag-handle {
      display: inline-flex;
      align-items: center;
      color: var(--muted);
      font-size: 14px;
      letter-spacing: -2px;
      cursor: grab;
      opacity: 0.8;
    }
    .wd-header:hover .wd-drag-handle {
      color: var(--accent);
      opacity: 1;
    }
    .wd-logo {
      width: 18px;
      height: 18px;
      border-radius: 4px;
    }
    .wd-title {
      font-weight: 700;
      font-size: 13px;
      letter-spacing: -0.01em;
      color: var(--fg);
    }
    .wd-pill-tab {
      font-size: 10px;
      font-weight: 600;
      color: var(--muted);
      background: var(--hover);
      padding: 2px 6px;
      border-radius: 10px;
    }
    .wd-live-pill {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      color: #10b981;
      background: rgba(16, 185, 129, 0.12);
      padding: 2px 6px;
      border-radius: 999px;
      letter-spacing: 0.05em;
    }
    .wd-live-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #10b981;
      box-shadow: 0 0 8px #10b981;
      animation: wd-pulse 1.8s infinite ease-in-out;
    }
    @keyframes wd-pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.85); }
    }
    .wd-header-right {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .wd-perf {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-right: 6px;
      font-size: 10px;
      font-weight: 600;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    }
    .wd-perf-pill {
      padding: 2px 6px;
      border-radius: 4px;
      background: var(--hover);
      color: var(--muted);
    }
    .wd-perf-pill.accent {
      color: var(--accent);
      background: var(--accent-glow);
    }
    .wd-win-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 26px;
      height: 26px;
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      background: var(--card);
      color: var(--muted);
      cursor: pointer;
      font-size: 12px;
      transition: all 0.15s ease;
      padding: 0;
    }
    .wd-win-btn:hover {
      background: var(--hover);
      color: var(--fg);
    }
    .wd-win-btn.close:hover {
      background: #ef4444 !important;
      color: #ffffff !important;
      border-color: #ef4444 !important;
    }

    /* Toolbar */
    .wd-toolbar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
      padding: 8px 12px;
      background: var(--bg);
      border-bottom: 1px solid var(--border);
    }
    .wd-search-wrap {
      display: flex;
      align-items: center;
      flex: 1;
      min-width: 140px;
      position: relative;
    }
    .wd-search-icon {
      position: absolute;
      left: 8px;
      color: var(--muted);
      font-size: 11px;
      pointer-events: none;
    }
    .wd-search {
      width: 100%;
      padding: 5px 24px 5px 26px;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: var(--card);
      color: var(--fg);
      font-size: 11px;
      outline: none;
      transition: border-color 0.15s ease;
    }
    .wd-search:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 2px var(--accent-glow);
    }
    .wd-search-clear {
      position: absolute;
      right: 6px;
      color: var(--muted);
      cursor: pointer;
      font-size: 11px;
      background: none;
      border: none;
      display: none;
      padding: 0 2px;
    }
    .wd-chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 3px 8px;
      border: 1px solid var(--border);
      border-radius: 999px;
      background: var(--card);
      color: var(--muted);
      cursor: pointer;
      user-select: none;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.02em;
      transition: all 0.15s ease;
    }
    .wd-chip:hover { border-color: var(--muted); color: var(--fg); }
    .wd-chip.active { background: var(--hover); color: var(--fg); }
    .wd-chip-count {
      font-size: 9px;
      padding: 0 4px;
      border-radius: 8px;
      background: var(--border);
      font-variant-numeric: tabular-nums;
    }
    .wd-chip.chip-log.active { color: var(--log); border-color: var(--log); background: var(--log-bg); }
    .wd-chip.chip-info.active { color: var(--info); border-color: var(--info); background: var(--info-bg); }
    .wd-chip.chip-warn.active { color: var(--warn); border-color: var(--warn); background: var(--warn-bg); }
    .wd-chip.chip-error.active { color: var(--error); border-color: var(--error); background: var(--error-bg); }
    .wd-chip.chip-net.active { color: var(--network); border-color: var(--network); background: var(--network-bg); }

    .wd-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 8px;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: var(--card);
      color: var(--fg);
      cursor: pointer;
      font-size: 11px;
      font-weight: 500;
      transition: all 0.15s ease;
      white-space: nowrap;
    }
    .wd-btn:hover { background: var(--hover); }
    .wd-btn.active { background: var(--accent); color: #fff; border-color: var(--accent); }
    .wd-btn.danger { color: var(--error); }
    .wd-btn.danger:hover { background: var(--error-bg); border-color: var(--error); }

    .wd-export { position: relative; }
    .wd-export-menu {
      display: none;
      position: absolute;
      right: 0;
      top: 100%;
      margin-top: 4px;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 8px;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
      overflow: hidden;
      z-index: 50;
      min-width: 140px;
    }
    .wd-export.open .wd-export-menu { display: block; }
    .wd-export-menu button {
      display: block;
      width: 100%;
      border: 0;
      padding: 7px 12px;
      text-align: left;
      background: transparent;
      color: var(--fg);
      font-size: 11px;
      cursor: pointer;
    }
    .wd-export-menu button:hover { background: var(--hover); color: var(--accent); }

    /* Status & Tabs */
    .wd-statusbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 4px 12px;
      background: var(--card);
      border-bottom: 1px solid var(--border);
      font-size: 11px;
      color: var(--muted);
    }
    .wd-tabs { display: flex; align-items: center; gap: 4px; }
    .wd-tab-btn {
      background: transparent;
      border: none;
      padding: 3px 10px;
      border-radius: 5px;
      color: var(--muted);
      cursor: pointer;
      font-size: 11px;
      font-weight: 600;
    }
    .wd-tab-btn:hover { background: var(--hover); color: var(--fg); }
    .wd-tab-btn.active { background: var(--hover); color: var(--accent); }

    /* Log Stream */
    .wd-list {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      padding: 0;
      background: var(--bg);
    }
    .wd-empty {
      padding: 48px 20px;
      text-align: center;
      color: var(--muted);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
    }
    .wd-entry {
      display: grid;
      grid-template-columns: 74px 58px 1fr auto;
      gap: 8px;
      padding: 6px 12px;
      border-bottom: 1px solid var(--border-subtle);
      align-items: start;
      cursor: pointer;
      transition: background 0.1s ease;
    }
    .wd-entry:hover { background: var(--card-hover); }
    .wd-entry.pinned {
      background: rgba(245, 158, 11, 0.08);
      border-left: 3px solid var(--pin);
    }
    .wd-time {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 10.5px;
      color: var(--muted);
      font-variant-numeric: tabular-nums;
      margin-top: 1px;
    }
    .wd-sev {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      padding: 2px 6px;
      border-radius: 4px;
      letter-spacing: 0.04em;
      margin-top: 1px;
    }
    .wd-entry.sev-log .wd-sev { color: var(--log); background: var(--log-bg); }
    .wd-entry.sev-info .wd-sev { color: var(--info); background: var(--info-bg); }
    .wd-entry.sev-warn .wd-sev { color: var(--warn); background: var(--warn-bg); }
    .wd-entry.sev-error .wd-sev { color: var(--error); background: var(--error-bg); }
    .wd-entry.sev-network .wd-sev { color: var(--network); background: var(--network-bg); }

    .wd-content { overflow: hidden; }
    .wd-msg {
      white-space: pre-wrap;
      word-break: break-word;
      font-family: ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, Consolas, monospace;
      font-size: 11.5px;
      line-height: 1.45;
      color: var(--fg);
    }
    .wd-count-badge {
      display: inline-block;
      min-width: 18px;
      padding: 0 5px;
      background: var(--accent);
      color: #fff;
      border-radius: 9px;
      font-size: 9.5px;
      font-weight: 700;
      text-align: center;
      margin-left: 6px;
    }
    .wd-src {
      display: block;
      color: var(--muted);
      font-size: 10px;
      font-family: ui-monospace, monospace;
      margin-top: 2px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .wd-row-actions {
      display: flex;
      align-items: center;
      gap: 3px;
      opacity: 0;
      transition: opacity 0.15s ease;
    }
    .wd-entry:hover .wd-row-actions,
    .wd-entry.pinned .wd-row-actions { opacity: 1; }
    .wd-act-btn {
      padding: 2px 6px;
      border: 1px solid var(--border);
      border-radius: 4px;
      background: var(--card);
      color: var(--muted);
      cursor: pointer;
      font-size: 10px;
      font-weight: 500;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 20px;
      height: 20px;
      user-select: none;
      transition: all 0.15s ease;
    }
    .wd-act-btn:hover { background: var(--hover); color: var(--fg); border-color: var(--accent); }
    .wd-act-btn:active { transform: scale(0.92); }
    .wd-act-btn.pin-active { color: var(--pin); border-color: var(--pin); background: rgba(234, 179, 8, 0.15); }
    .wd-act-btn.act-active { color: var(--accent); border-color: var(--accent); background: rgba(56, 189, 248, 0.15); }
    .wd-act-btn.delete-btn:hover { color: #f43f5e; border-color: #f43f5e; background: rgba(244, 63, 94, 0.15); }

    .wd-expanded-box {
      margin-top: 6px;
      padding: 8px;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 6px;
      white-space: pre-wrap;
      font-family: ui-monospace, monospace;
      font-size: 11px;
      max-height: 240px;
      overflow-y: auto;
    }

    /* JSON Tree */
    .json-tree { font-family: ui-monospace, monospace; font-size: 11px; line-height: 1.5; }
    .json-node { margin-left: 14px; }
    .json-key { color: var(--accent); }
    .json-val.string { color: #10b981; }
    .json-val.number { color: var(--info); }
    .json-val.boolean { color: var(--warn); }
    .json-val.null { color: var(--muted); }
    .json-val.error { color: var(--error); font-weight: 600; }
    .json-toggle { cursor: pointer; user-select: none; font-weight: bold; color: var(--muted); }
    .json-toggle:hover { color: var(--accent); }
    .json-collapsed > .json-children { display: none; }
    .json-collapsed > .json-toggle::after { content: " {...}"; color: var(--muted); font-weight: normal; }

    /* Console REPL */
    .wd-console-input {
      display: flex;
      align-items: center;
      border-top: 1px solid var(--border);
      background: var(--card);
      padding: 6px 12px;
    }
    .wd-console-prompt {
      color: var(--accent);
      font-weight: 800;
      font-family: ui-monospace, monospace;
      font-size: 14px;
      margin-right: 8px;
    }
    #wdJsInput {
      flex: 1;
      border: none;
      background: transparent;
      color: var(--fg);
      font-family: ui-monospace, monospace;
      font-size: 12px;
      outline: none;
    }

    /* Storage View */
    .wd-view-storage {
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      flex: 1;
      overflow-y: auto;
      background: var(--bg);
    }
    .wd-storage-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 12px;
    }
    .wd-storage-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    .wd-storage-header h3 {
      margin: 0;
      font-size: 12px;
      font-weight: 700;
      color: var(--fg);
    }
    .wd-storage-actions { display: flex; gap: 4px; }
    .wd-storage-body {
      min-height: 40px;
      max-height: 180px;
      overflow-y: auto;
      padding: 8px;
      background: var(--bg);
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
    }

    /* Multi-directional Resizing on All 4 Sides and 4 Corners */
    .wd-resizer {
      position: absolute;
      z-index: 40;
      touch-action: none;
      user-select: none;
      background: transparent;
      transition: background 0.15s ease;
    }
    .wd-resizer:hover {
      background: rgba(56, 189, 248, 0.25);
    }
    /* Edges */
    .wd-resizer-r {
      top: 0;
      bottom: 0;
      right: 0;
      width: 8px;
      cursor: ew-resize;
    }
    .wd-resizer-l {
      top: 0;
      bottom: 0;
      left: 0;
      width: 8px;
      cursor: ew-resize;
    }
    .wd-resizer-b {
      left: 0;
      right: 0;
      bottom: 0;
      height: 8px;
      cursor: ns-resize;
    }
    .wd-resizer-t {
      left: 0;
      right: 0;
      top: 0;
      height: 8px;
      cursor: ns-resize;
    }
    /* Corners */
    .wd-resizer-br {
      right: 0;
      bottom: 0;
      width: 16px;
      height: 16px;
      cursor: nwse-resize;
      z-index: 41;
    }
    .wd-resizer-bl {
      left: 0;
      bottom: 0;
      width: 16px;
      height: 16px;
      cursor: nesw-resize;
      z-index: 41;
    }
    .wd-resizer-tr {
      right: 0;
      top: 0;
      width: 16px;
      height: 16px;
      cursor: nesw-resize;
      z-index: 41;
    }
    .wd-resizer-tl {
      left: 0;
      top: 0;
      width: 16px;
      height: 16px;
      cursor: nwse-resize;
      z-index: 41;
    }
    .wd-resizer-br::after {
      content: "";
      position: absolute;
      right: 4px;
      bottom: 4px;
      width: 6px;
      height: 6px;
      border-right: 2px solid var(--muted);
      border-bottom: 2px solid var(--muted);
      opacity: 0.6;
    }
    .wd-resizer-br:hover::after {
      border-color: var(--accent);
      opacity: 1;
    }

    /* Launcher Bubble */
    .wd-bubble {
      position: fixed;
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: var(--bg-translucent);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      box-shadow: var(--shadow-bubble);
      border: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: grab;
      z-index: 2147483646;
      user-select: none;
      touch-action: none;
      transition: transform 0.15s ease, box-shadow 0.15s ease;
    }
    .wd-bubble img {
      pointer-events: none;
      user-select: none;
      -webkit-user-drag: none;
    }
    .wd-bubble:hover {
      transform: scale(1.08);
      box-shadow: 0 16px 36px rgba(0, 0, 0, 0.45);
    }
    .wd-bubble.dragging {
      cursor: grabbing !important;
      transform: scale(1.12) !important;
      box-shadow: 0 20px 45px rgba(0, 0, 0, 0.6) !important;
      transition: none !important;
    }
    .wd-bubble.hidden { display: none !important; }
    .wd-bubble-badge {
      position: absolute;
      top: -2px;
      right: -2px;
      min-width: 16px;
      height: 16px;
      padding: 0 4px;
      border-radius: 8px;
      background: #ef4444;
      color: #ffffff;
      font-size: 9px;
      font-weight: 800;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 5px rgba(239, 68, 68, 0.6);
    }

    /* Toast */
    .wd-toast {
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: #0f172a;
      color: #fff;
      padding: 6px 14px;
      border-radius: 6px;
      z-index: 2147483647;
      font-size: 11px;
      font-weight: 600;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
      pointer-events: none;
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
  `;
  shadow.appendChild(styleEl);

  // Shell Root
  const shellEl = document.createElement("div");
  shellEl.className = `wd-shell theme-${state.theme}`;
  shadow.appendChild(shellEl);

  // Safe Chrome API helpers (protect against context invalidation or running outside extension context)
  function getAssetUrl(path) {
    try {
      if (typeof chrome !== "undefined" && chrome && chrome.runtime && typeof chrome.runtime.getURL === "function") {
        return chrome.runtime.getURL(path);
      }
    } catch (_) {}
    return "";
  }

  function safeSendMessage(msg, cb) {
    try {
      if (typeof chrome !== "undefined" && chrome && chrome.runtime && typeof chrome.runtime.sendMessage === "function") {
        chrome.runtime.sendMessage(msg, (res) => {
          if (chrome.runtime.lastError) {
            if (cb) cb(null);
            return;
          }
          if (cb) cb(res);
        });
        return;
      }
    } catch (_) {}
    if (cb) cb(null);
  }

  // Window HTML Template
  shellEl.innerHTML = `
    <!-- Floating Window -->
    <div class="wd-window hidden" id="wdWindow">
      <!-- Top Draggable Header -->
      <div class="wd-header" id="wdHeader" title="Click and hold to drag anywhere">
        <div class="wd-header-left">
          <span class="wd-drag-handle" title="Hold & Drag">⋮⋮</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>
          <span class="wd-title">WebDebug Pro</span>
          <span class="wd-pill-tab" id="wdTabBadge">tab #...</span>
          <span class="wd-live-pill"><span class="wd-live-dot"></span> LIVE</span>
        </div>
        <div class="wd-header-right">
          <div class="wd-perf">
            <span class="wd-perf-pill accent" id="wdMemPill">Mem: --</span>
            <span class="wd-perf-pill" id="wdLoadPill">Load: --</span>
          </div>
          <button class="wd-win-btn" id="wdBtnPopout" title="Pop out into detached window">⧉</button>
          <button class="wd-win-btn" id="wdBtnMinimize" title="Minimize to bubble">—</button>
          <button class="wd-win-btn close" id="wdBtnClose" title="Close WebDebug Pro (✕)">✕</button>
        </div>
      </div>

      <!-- Toolbar -->
      <div class="wd-toolbar">
        <div class="wd-search-wrap">
          <span class="wd-search-icon">🔍</span>
          <input type="search" class="wd-search" id="wdSearch" placeholder="Filter logs (text or /regex/)..." spellcheck="false" />
          <button class="wd-search-clear" id="wdSearchClear">✕</button>
        </div>
        <div class="wd-filters-wrap">
          <button class="wd-chip active" data-filter="all">ALL <span class="wd-chip-count" id="countAll">0</span></button>
          <button class="wd-chip active chip-log" data-filter="log">LOG <span class="wd-chip-count" id="countLog">0</span></button>
          <button class="wd-chip active chip-info" data-filter="info">INFO <span class="wd-chip-count" id="countInfo">0</span></button>
          <button class="wd-chip active chip-warn" data-filter="warn">WARN <span class="wd-chip-count" id="countWarn">0</span></button>
          <button class="wd-chip active chip-error" data-filter="error">ERR <span class="wd-chip-count" id="countError">0</span></button>
          <button class="wd-chip active chip-net" data-filter="network">NET <span class="wd-chip-count" id="countNet">0</span></button>
        </div>
        <div class="wd-actions-wrap">
          <button class="wd-btn" id="wdBtnGroup" title="Group duplicate entries">Group</button>
          <button class="wd-btn" id="wdBtnPersist" title="Persist across page navigations">Persist</button>
          <button class="wd-btn" id="wdBtnPause" title="Pause live updates">Pause</button>
          <button class="wd-btn danger" id="wdBtnBlacklist" style="display:none;" title="Click to clear blocked sources">Unblock (<span id="wdBlacklistCount">0</span>)</button>
          <button class="wd-btn" id="wdBtnInspect" title="Inspect DOM element on page">🔍 Inspect</button>
          <button class="wd-btn" id="wdBtnCopyAll" title="Copy all visible logs">📋 Copy</button>
          <div class="wd-export" id="wdExportWrap">
            <button class="wd-btn" id="wdBtnExport">Export ▾</button>
            <div class="wd-export-menu" id="wdExportMenu">
              <button data-fmt="json">JSON</button>
              <button data-fmt="txt">TXT</button>
              <button data-fmt="csv">CSV</button>
              <button data-fmt="bugreport">HTML Bug Report</button>
            </div>
          </div>
          <button class="wd-btn danger" id="wdBtnClear" title="Clear non-pinned logs">🗑 Clear</button>
          <button class="wd-btn" id="wdBtnTheme" title="Toggle Light/Dark Theme">🌓</button>
        </div>
      </div>

      <!-- Statusbar & Navigation Tabs -->
      <div class="wd-statusbar">
        <div class="wd-tabs">
          <button class="wd-tab-btn active" id="wdTabLogs">Logs</button>
          <button class="wd-tab-btn" id="wdTabStorage">Storage Manager</button>
        </div>
        <div>
          <span id="wdCountSummary">0 entries</span>
        </div>
      </div>

      <!-- Logs View -->
      <div id="wdViewLogs" style="display:flex; flex-direction:column; flex:1; overflow:hidden;">
        <main class="wd-list" id="wdList"></main>
        <div class="wd-console-input">
          <span class="wd-console-prompt">&gt;</span>
          <input type="text" id="wdJsInput" placeholder="Evaluate JavaScript in page context (Press Enter)..." autocomplete="off" spellcheck="false" />
        </div>
      </div>

      <!-- Storage View -->
      <main class="wd-view-storage" id="wdViewStorage" style="display:none;">
        <div class="wd-storage-card">
          <div class="wd-storage-header">
            <h3>Local Storage</h3>
            <div class="wd-storage-actions">
              <button class="wd-btn" id="wdRefreshLocal">Refresh</button>
              <button class="wd-btn danger" id="wdClearLocal">Clear</button>
            </div>
          </div>
          <div class="wd-storage-body" id="wdOutLocal"></div>
        </div>

        <div class="wd-storage-card">
          <div class="wd-storage-header">
            <h3>Session Storage</h3>
            <div class="wd-storage-actions">
              <button class="wd-btn" id="wdRefreshSession">Refresh</button>
              <button class="wd-btn danger" id="wdClearSession">Clear</button>
            </div>
          </div>
          <div class="wd-storage-body" id="wdOutSession"></div>
        </div>

        <div class="wd-storage-card">
          <div class="wd-storage-header">
            <h3>Cookies</h3>
            <div class="wd-storage-actions">
              <button class="wd-btn" id="wdRefreshCookies">Refresh</button>
              <button class="wd-btn danger" id="wdClearCookies">Clear</button>
            </div>
          </div>
          <div class="wd-storage-body" id="wdOutCookies"></div>
        </div>
      </main>

      <!-- Multi-directional Resize Handles (All 4 Edges and 4 Corners) -->
      <div class="wd-resizer wd-resizer-r" data-dir="r" title="Drag edge to resize"></div>
      <div class="wd-resizer wd-resizer-l" data-dir="l" title="Drag edge to resize"></div>
      <div class="wd-resizer wd-resizer-b" data-dir="b" title="Drag edge to resize"></div>
      <div class="wd-resizer wd-resizer-t" data-dir="t" title="Drag edge to resize"></div>
      <div class="wd-resizer wd-resizer-br" data-dir="br" title="Drag corner to resize"></div>
      <div class="wd-resizer wd-resizer-bl" data-dir="bl" title="Drag corner to resize"></div>
      <div class="wd-resizer wd-resizer-tr" data-dir="tr" title="Drag corner to resize"></div>
      <div class="wd-resizer wd-resizer-tl" data-dir="tl" title="Drag corner to resize"></div>
    </div>

    <!-- Floating Launcher Bubble (shown when minimized) -->
    <div class="wd-bubble hidden" id="wdBubble" title="Click to restore WebDebug Pro (hold & drag anywhere)">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>
      <div class="wd-bubble-badge" id="wdBubbleBadge" style="display:none;">0</div>
    </div>
  `;

  // Element Selectors
  const windowEl = shadow.getElementById("wdWindow");
  const headerEl = shadow.getElementById("wdHeader");
  const bubbleEl = shadow.getElementById("wdBubble");
  const bubbleBadgeEl = shadow.getElementById("wdBubbleBadge");
  const listEl = shadow.getElementById("wdList");
  const searchInput = shadow.getElementById("wdSearch");
  const searchClearBtn = shadow.getElementById("wdSearchClear");
  const countSummaryEl = shadow.getElementById("wdCountSummary");
  const tabBadgeEl = shadow.getElementById("wdTabBadge");
  const jsInput = shadow.getElementById("wdJsInput");
  const viewLogs = shadow.getElementById("wdViewLogs");
  const viewStorage = shadow.getElementById("wdViewStorage");
  const tabLogs = shadow.getElementById("wdTabLogs");
  const tabStorage = shadow.getElementById("wdTabStorage");
  const exportWrap = shadow.getElementById("wdExportWrap");

  // Apply Initial Position & Size
  function applyWindowPos() {
    windowEl.style.left = `${state.pos.left}px`;
    windowEl.style.top = `${state.pos.top}px`;
    windowEl.style.width = `${state.pos.width}px`;
    windowEl.style.height = `${state.pos.height}px`;
  }
  applyWindowPos();

  function applyBubblePos() {
    if (typeof state.bubblePos.left === "number" && typeof state.bubblePos.top === "number") {
      bubbleEl.style.left = `${state.bubblePos.left}px`;
      bubbleEl.style.top = `${state.bubblePos.top}px`;
      bubbleEl.style.right = "auto";
      bubbleEl.style.bottom = "auto";
    } else {
      bubbleEl.style.left = "auto";
      bubbleEl.style.top = "auto";
      bubbleEl.style.right = `${state.bubblePos.right}px`;
      bubbleEl.style.bottom = `${state.bubblePos.bottom}px`;
    }
  }
  applyBubblePos();

  function savePosition() {
    try {
      localStorage.setItem("__wd_panel_pos", JSON.stringify(state.pos));
    } catch (_) {}
  }

  // Toast Helper
  function toast(msg) {
    const t = document.createElement("div");
    t.className = "wd-toast";
    t.textContent = msg;
    shadow.appendChild(t);
    setTimeout(() => t.remove(), 1600);
  }

  // Clipboard Copy Helper
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

  // Format Time
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

  // Filter Computation
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
    const cAll = shadow.getElementById("countAll"); if (cAll) cAll.textContent = counts.all;
    const cLog = shadow.getElementById("countLog"); if (cLog) cLog.textContent = counts.log;
    const cInfo = shadow.getElementById("countInfo"); if (cInfo) cInfo.textContent = counts.info;
    const cWarn = shadow.getElementById("countWarn"); if (cWarn) cWarn.textContent = counts.warn;
    const cErr = shadow.getElementById("countError"); if (cErr) cErr.textContent = counts.error;
    const cNet = shadow.getElementById("countNet"); if (cNet) cNet.textContent = counts.network;

    const errors = counts.error + counts.network;
    if (bubbleBadgeEl) {
      if (errors > 0) {
        bubbleBadgeEl.style.display = "flex";
        bubbleBadgeEl.textContent = errors > 99 ? "99+" : errors;
      } else {
        bubbleBadgeEl.style.display = "none";
      }
    }
  }

  function scheduleRender() {
    updateBadgeCounters();
    if (renderRaf) return;
    renderRaf = requestAnimationFrame(() => {
      renderRaf = null;
      render();
    });
  }

  // Render Log Entries
  function render() {
    updateBadgeCounters();

    const visible = computeVisible();
    countSummaryEl.textContent = `${visible.length} / ${state.entries.length} entries`;

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

    const blBtn = shadow.getElementById("wdBtnBlacklist");
    if (blBtn) {
      if (state.blacklist.size > 0) {
        blBtn.style.display = "inline-flex";
        shadow.getElementById("wdBlacklistCount").textContent = state.blacklist.size;
      } else {
        blBtn.style.display = "none";
      }
    }
  }

  // Dragging Top Header Logic
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let initialLeft = 0;
  let initialTop = 0;

  headerEl.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button, input, a, .wd-win-btn")) return;
    isDragging = true;
    try { headerEl.setPointerCapture(e.pointerId); } catch (_) {}
    headerEl.classList.add("dragging");
    const rect = windowEl.getBoundingClientRect();
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    initialLeft = rect.left;
    initialTop = rect.top;
    e.preventDefault();
  });

  headerEl.addEventListener("pointermove", (e) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    let newLeft = initialLeft + dx;
    let newTop = initialTop + dy;

    // Viewport clamping
    const winW = window.innerWidth;
    const winH = window.innerHeight;
    const panelW = windowEl.offsetWidth;
    const panelH = windowEl.offsetHeight;

    newLeft = Math.max(0, Math.min(winW - Math.min(panelW, 200), newLeft));
    newTop = Math.max(0, Math.min(winH - 40, newTop));

    state.pos.left = newLeft;
    state.pos.top = newTop;
    windowEl.style.left = `${newLeft}px`;
    windowEl.style.top = `${newTop}px`;
  });

  const stopDrag = (e) => {
    if (!isDragging) return;
    isDragging = false;
    try { headerEl.releasePointerCapture(e.pointerId); } catch (_) {}
    headerEl.classList.remove("dragging");
    savePosition();
  };
  headerEl.addEventListener("pointerup", stopDrag);
  headerEl.addEventListener("pointercancel", stopDrag);

  // Multi-directional Resizing on All 4 Sides and 4 Corners
  let isResizing = false;
  let currentResizeDir = null;
  let resizeActiveEl = null;
  let resizeStartX = 0;
  let resizeStartY = 0;
  let resizeStartLeft = 0;
  let resizeStartTop = 0;
  let resizeStartWidth = 0;
  let resizeStartHeight = 0;

  function onResizePointerDown(e) {
    const dir = e.currentTarget.dataset.dir;
    if (!dir) return;
    isResizing = true;
    currentResizeDir = dir;
    resizeActiveEl = e.currentTarget;
    try { resizeActiveEl.setPointerCapture(e.pointerId); } catch (_) {}

    resizeStartX = e.clientX;
    resizeStartY = e.clientY;
    resizeStartLeft = state.pos.left;
    resizeStartTop = state.pos.top;
    resizeStartWidth = windowEl.offsetWidth;
    resizeStartHeight = windowEl.offsetHeight;

    e.preventDefault();
    e.stopPropagation();
  }

  function onResizePointerMove(e) {
    if (!isResizing || !currentResizeDir) return;
    const dx = e.clientX - resizeStartX;
    const dy = e.clientY - resizeStartY;

    const minW = 440;
    const minH = 260;
    const winW = window.innerWidth;
    const winH = window.innerHeight;

    // Width adjustments
    if (currentResizeDir.includes("r")) {
      const maxAvailableW = winW - resizeStartLeft - 10;
      const newW = Math.max(minW, Math.min(maxAvailableW, resizeStartWidth + dx));
      state.pos.width = newW;
    } else if (currentResizeDir.includes("l")) {
      let newW = resizeStartWidth - dx;
      let newLeft = resizeStartLeft + dx;
      if (newW < minW) {
        newLeft = resizeStartLeft + (resizeStartWidth - minW);
        newW = minW;
      }
      if (newLeft < 0) {
        newW += newLeft;
        newLeft = 0;
      }
      state.pos.width = Math.max(minW, newW);
      state.pos.left = newLeft;
    }

    // Height adjustments
    if (currentResizeDir.includes("b")) {
      const maxAvailableH = winH - resizeStartTop - 10;
      const newH = Math.max(minH, Math.min(maxAvailableH, resizeStartHeight + dy));
      state.pos.height = newH;
    } else if (currentResizeDir.includes("t")) {
      let newH = resizeStartHeight - dy;
      let newTop = resizeStartTop + dy;
      if (newH < minH) {
        newTop = resizeStartTop + (resizeStartHeight - minH);
        newH = minH;
      }
      if (newTop < 0) {
        newH += newTop;
        newTop = 0;
      }
      state.pos.height = Math.max(minH, newH);
      state.pos.top = newTop;
    }

    applyWindowPos();
  }

  function onResizePointerUp(e) {
    if (!isResizing) return;
    isResizing = false;
    currentResizeDir = null;
    if (resizeActiveEl) {
      try { resizeActiveEl.releasePointerCapture(e.pointerId); } catch (_) {}
      resizeActiveEl = null;
    }
    savePosition();
  }

  shadow.querySelectorAll(".wd-resizer").forEach((el) => {
    el.addEventListener("pointerdown", onResizePointerDown);
    el.addEventListener("pointermove", onResizePointerMove);
    el.addEventListener("pointerup", onResizePointerUp);
    el.addEventListener("pointercancel", onResizePointerUp);
  });

  // Window Controls
  // Dedicated Cancel / Close Button
  shadow.getElementById("wdBtnClose").addEventListener("click", (e) => {
    e.stopPropagation();
    state.visible = false;
    state.minimized = false;
    windowEl.classList.add("hidden");
    bubbleEl.classList.add("hidden");
  });

  // Dedicated Minimize Button
  shadow.getElementById("wdBtnMinimize").addEventListener("click", (e) => {
    e.stopPropagation();
    state.minimized = true;
    windowEl.classList.add("hidden");
    bubbleEl.classList.remove("hidden");
  });

  // Detached Popout Button
  shadow.getElementById("wdBtnPopout").addEventListener("click", (e) => {
    e.stopPropagation();
    state.visible = false;
    windowEl.classList.add("hidden");
    bubbleEl.classList.add("hidden");
    safeSendMessage({ type: "wd:openWindow", tabId: state.tabId });
  });

  // Draggable Bubble with smooth Drag-and-Drop & Drop Persistence
  let isBubbleDragging = false;
  let bubbleHasMoved = false;
  let bubbleGrabOffsetX = 0;
  let bubbleGrabOffsetY = 0;
  let bubbleDownX = 0;
  let bubbleDownY = 0;
  let justDraggedBubble = false;

  bubbleEl.addEventListener("pointerdown", (e) => {
    isBubbleDragging = true;
    bubbleHasMoved = false;
    try { bubbleEl.setPointerCapture(e.pointerId); } catch (_) {}

    const rect = bubbleEl.getBoundingClientRect();
    bubbleGrabOffsetX = e.clientX - rect.left;
    bubbleGrabOffsetY = e.clientY - rect.top;
    bubbleDownX = e.clientX;
    bubbleDownY = e.clientY;

    e.preventDefault();
  });

  bubbleEl.addEventListener("pointermove", (e) => {
    if (!isBubbleDragging) return;
    const dist = Math.hypot(e.clientX - bubbleDownX, e.clientY - bubbleDownY);
    if (dist > 3) {
      bubbleHasMoved = true;
      bubbleEl.classList.add("dragging");

      const bubbleW = bubbleEl.offsetWidth || 48;
      const bubbleH = bubbleEl.offsetHeight || 48;
      const winW = window.innerWidth || 1024;
      const winH = window.innerHeight || 768;

      let newLeft = e.clientX - bubbleGrabOffsetX;
      let newTop = e.clientY - bubbleGrabOffsetY;

      // Clamp within viewport
      newLeft = Math.max(0, Math.min(winW - bubbleW, newLeft));
      newTop = Math.max(0, Math.min(winH - bubbleH, newTop));

      state.bubblePos.left = newLeft;
      state.bubblePos.top = newTop;

      bubbleEl.style.left = `${newLeft}px`;
      bubbleEl.style.top = `${newTop}px`;
      bubbleEl.style.right = "auto";
      bubbleEl.style.bottom = "auto";
    }
  });

  function onBubblePointerEnd(e) {
    if (!isBubbleDragging) return;
    isBubbleDragging = false;
    bubbleEl.classList.remove("dragging");
    try { bubbleEl.releasePointerCapture(e.pointerId); } catch (_) {}

    if (bubbleHasMoved) {
      justDraggedBubble = true;
      setTimeout(() => { justDraggedBubble = false; }, 180);

      // Save dropped position
      try {
        localStorage.setItem("__wd_bubble_pos", JSON.stringify({
          left: state.bubblePos.left,
          top: state.bubblePos.top,
        }));
      } catch (_) {}
    }
  }

  bubbleEl.addEventListener("pointerup", onBubblePointerEnd);
  bubbleEl.addEventListener("pointercancel", onBubblePointerEnd);

  // Click Bubble to Restore (Only when clicked, NOT when dragged & dropped!)
  bubbleEl.addEventListener("click", (e) => {
    if (justDraggedBubble || bubbleHasMoved) {
      e.stopPropagation();
      e.preventDefault();
      return;
    }
    state.minimized = false;
    state.visible = true;
    bubbleEl.classList.add("hidden");
    windowEl.classList.remove("hidden");
    clampToViewport();
    render();
  });

  // Toolbar Event Listeners
  searchInput.addEventListener("input", (e) => {
    state.search = e.target.value;
    searchClearBtn.style.display = state.search ? "block" : "none";
    render();
  });
  searchClearBtn.addEventListener("click", () => {
    searchInput.value = "";
    state.search = "";
    searchClearBtn.style.display = "none";
    render();
  });

  // Filter Chips
  shadow.querySelectorAll(".wd-chip[data-filter]").forEach((chip) => {
    chip.addEventListener("click", () => {
      const f = chip.dataset.filter;
      if (f === "all") {
        const allOn = Object.values(state.filters).every(Boolean);
        Object.keys(state.filters).forEach((k) => (state.filters[k] = !allOn));
        shadow.querySelectorAll(".wd-chip[data-filter]").forEach((c) => {
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

  // Quick Action Buttons
  const btnGroup = shadow.getElementById("wdBtnGroup");
  btnGroup.addEventListener("click", () => {
    state.group = !state.group;
    btnGroup.classList.toggle("active", state.group);
    render();
  });

  const btnPersist = shadow.getElementById("wdBtnPersist");
  btnPersist.addEventListener("click", () => {
    state.persist = !state.persist;
    btnPersist.classList.toggle("active", state.persist);
    safeSendMessage({
      type: "wd:setSettings",
      tabId: state.tabId,
      settings: { persist: state.persist },
    });
  });

  const btnPause = shadow.getElementById("wdBtnPause");
  btnPause.addEventListener("click", () => {
    state.pause = !state.pause;
    btnPause.classList.toggle("active", state.pause);
    if (!state.pause) render();
  });

  shadow.getElementById("wdBtnBlacklist").addEventListener("click", () => {
    state.blacklist.clear();
    render();
  });

  shadow.getElementById("wdBtnClear").addEventListener("click", () => {
    safeSendMessage({ type: "wd:clear", tabId: state.tabId });
    state.entries = state.entries.filter((e) => e.pinned);
    render();
  });

  shadow.getElementById("wdBtnCopyAll").addEventListener("click", () => {
    copyText(computeVisible().map(entryToText).join("\n\n"));
  });

  // Theme Toggle
  const btnTheme = shadow.getElementById("wdBtnTheme");
  btnTheme.addEventListener("click", () => {
    state.theme = state.theme === "dark" ? "light" : "dark";
    shellEl.className = `wd-shell theme-${state.theme}`;
    try { localStorage.setItem("__wd_theme", state.theme); } catch (_) {}
  });

  // Export Menu
  const btnExport = shadow.getElementById("wdBtnExport");
  btnExport.addEventListener("click", (e) => {
    e.stopPropagation();
    exportWrap.classList.toggle("open");
  });
  shadow.addEventListener("click", () => exportWrap.classList.remove("open"));

  function downloadFile(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 15000);
  }

  function exportLogs(fmt) {
    const visible = computeVisible();
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    if (fmt === "json") {
      downloadFile(`webdebug-${stamp}.json`, JSON.stringify(visible, null, 2), "application/json");
    } else if (fmt === "txt") {
      downloadFile(`webdebug-${stamp}.txt`, visible.map(entryToText).join("\n\n"), "text/plain");
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
      downloadFile(`webdebug-${stamp}.csv`, csv, "text/csv");
    } else if (fmt === "bugreport") {
      safeSendMessage({ type: "wd:capture", tabId: state.tabId }, (res) => {
        const img = res && res.dataUrl
          ? `<img src="${res.dataUrl}" style="max-width:100%; border:1px solid #ccc; box-shadow: 0 4px 6px rgba(0,0,0,0.1); margin-bottom: 20px;"/>`
          : "<p><i>Screenshot not available</i></p>";
        const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Bug Report - ${stamp}</title>
<style>body{font-family:-apple-system, sans-serif; max-width:1000px; margin:20px auto; padding:0 20px; background:#f8fafc; color:#0f172a;} pre{background:#ffffff; border:1px solid #e2e8f0; padding:15px; border-radius:6px; overflow:auto; font-size:12px;}</style>
</head><body>
<h1>WebDebug Pro - Bug Report</h1>
<p>Generated at: ${new Date().toLocaleString()}</p>
<h2>Page Screenshot</h2>
${img}
<h2>Console Logs (${visible.length})</h2>
<pre>${escapeHtml(JSON.stringify(visible, null, 2))}</pre>
</body></html>`;
        downloadFile(`bugreport-${stamp}.html`, html, "text/html");
      });
    }
  }

  shadow.getElementById("wdExportMenu").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-fmt]");
    if (b) {
      exportLogs(b.dataset.fmt);
      exportWrap.classList.remove("open");
    }
  });

  // DOM Inspect Mode
  const btnInspect = shadow.getElementById("wdBtnInspect");
  btnInspect.addEventListener("click", () => {
    if (state.inspecting) return;
    state.inspecting = true;
    btnInspect.classList.add("active");
    toast("Hover & click any page element to inspect");

    const overlayBox = document.createElement("div");
    Object.assign(overlayBox.style, {
      position: "fixed",
      pointerEvents: "none",
      zIndex: "2147483640",
      border: "2px solid #38bdf8",
      background: "rgba(56, 189, 248, 0.2)",
      borderRadius: "3px",
      transition: "all 0.08s ease",
      display: "none",
    });
    document.body.appendChild(overlayBox);

    function onMove(e) {
      const el = e.target;
      if (el === overlayBox || hostEl.contains(el)) {
        overlayBox.style.display = "none";
        return;
      }
      const r = el.getBoundingClientRect();
      Object.assign(overlayBox.style, {
        display: "block",
        left: r.left + "px",
        top: r.top + "px",
        width: r.width + "px",
        height: r.height + "px",
      });
    }

    function cleanup() {
      state.inspecting = false;
      btnInspect.classList.remove("active");
      if (overlayBox.parentNode) overlayBox.remove();
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKey, true);
    }

    function onClick(e) {
      if (hostEl.contains(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      const el = e.target;
      cleanup();

      const attrs = {};
      for (let i = 0; i < el.attributes.length; i++) {
        attrs[el.attributes[i].name] = el.attributes[i].value;
      }
      const info = {
        tagName: el.tagName.toLowerCase(),
        id: el.id || "",
        className: el.className || "",
        attributes: attrs,
        innerHTML: el.innerHTML.substring(0, 250) + (el.innerHTML.length > 250 ? "..." : ""),
      };

      state.entries.push({
        id: Date.now() + Math.random(),
        timestamp: Date.now(),
        severity: "info",
        message: `Inspected <${info.tagName}${info.id ? "#" + info.id : ""}>`,
        args: [info],
        source: "DOM Inspector",
      });
      render();
    }

    function onKey(e) {
      if (e.key === "Escape") cleanup();
    }

    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKey, true);
  });

  // Console REPL Input
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

      // Echo command
      state.entries.push({
        id: Date.now() + Math.random(),
        timestamp: Date.now(),
        severity: "info",
        message: "> " + code,
        args: [],
        source: "console",
      });
      render();

      // Execute in Page Context via Service Worker
      safeSendMessage({ type: "wd:eval", tabId: state.tabId, code }, (res) => {
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

  // Navigation Tabs: Logs vs Storage
  tabLogs.addEventListener("click", () => {
    tabLogs.classList.add("active");
    tabStorage.classList.remove("active");
    viewLogs.style.display = "flex";
    viewStorage.style.display = "none";
    state.activeTab = "logs";
  });
  tabStorage.addEventListener("click", () => {
    tabStorage.classList.add("active");
    tabLogs.classList.remove("active");
    viewStorage.style.display = "flex";
    viewLogs.style.display = "none";
    state.activeTab = "storage";
    refreshStorage();
  });

  // Storage Manager Helpers
  function refreshStorage() {
    safeSendMessage({ type: "wd:getStorage", tabId: state.tabId }, (res) => {
      if (!res) return;
      shadow.getElementById("wdOutLocal").innerHTML = `<div class="json-tree">${renderJsonTree(res.ls || {}, true)}</div>`;
      shadow.getElementById("wdOutSession").innerHTML = `<div class="json-tree">${renderJsonTree(res.ss || {}, true)}</div>`;

      const cobj = {};
      if (res.cookies) {
        res.cookies.split(";").forEach((c) => {
          const parts = c.split("=");
          if (parts[0]) cobj[parts[0].trim()] = decodeURIComponent(parts.slice(1).join("=") || "");
        });
      }
      shadow.getElementById("wdOutCookies").innerHTML = `<div class="json-tree">${renderJsonTree(cobj, true)}</div>`;
    });
  }

  function clearStorage(type) {
    safeSendMessage({ type: "wd:clearStorage", tabId: state.tabId, storageType: type }, () => {
      toast("Storage cleared");
      refreshStorage();
    });
  }

  shadow.getElementById("wdRefreshLocal").addEventListener("click", refreshStorage);
  shadow.getElementById("wdRefreshSession").addEventListener("click", refreshStorage);
  shadow.getElementById("wdRefreshCookies").addEventListener("click", refreshStorage);

  shadow.getElementById("wdClearLocal").addEventListener("click", () => clearStorage("ls"));
  shadow.getElementById("wdClearSession").addEventListener("click", () => clearStorage("ss"));
  shadow.getElementById("wdClearCookies").addEventListener("click", () => clearStorage("cookies"));

  // Log Item Click Handlers (Expand, Copy, Pin, Block, Delete/Cancel)
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
      safeSendMessage({ type: "wd:setPinned", tabId: state.tabId, id: entry.id, pinned: entry.pinned });
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
        safeSendMessage({ type: "wd:deleteEntry", tabId: state.tabId, id: entry.id });
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

  // Performance Monitoring
  setInterval(() => {
    if (!state.visible && !state.minimized) return;
    try {
      if (performance.memory && performance.memory.usedJSHeapSize) {
        const mb = (performance.memory.usedJSHeapSize / 1048576).toFixed(1);
        shadow.getElementById("wdMemPill").textContent = `Mem: ${mb}MB`;
      }
      if (performance.timing && performance.timing.loadEventEnd > 0) {
        const loadTime = performance.timing.loadEventEnd - performance.timing.navigationStart;
        shadow.getElementById("wdLoadPill").textContent = `Load: ${loadTime}ms`;
      }
    } catch (_) {}
  }, 2000);

  // Initialize Overlay & Connect with Background Service Worker
  function initOverlay() {
    safeSendMessage({ type: "wd:getTabId" }, (res) => {
      state.tabId = res && res.tabId ? res.tabId : null;
      if (state.tabId) {
        tabBadgeEl.textContent = `tab #${state.tabId}`;

        // Get initial state
        safeSendMessage({ type: "wd:getState", tabId: state.tabId }, (r) => {
          if (!r || !r.entries) return;
          const idSet = new Set(state.entries.map((e) => e.id));
          for (const entry of r.entries) {
            if (!idSet.has(entry.id)) {
              state.entries.push(entry);
              idSet.add(entry.id);
            }
          }
          state.entries.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
          state.persist = !!(r.settings && r.settings.persist);
          btnPersist.classList.toggle("active", state.persist);
          scheduleRender();
        });

        // Open live streaming port
        try {
          if (typeof chrome !== "undefined" && chrome && chrome.runtime && typeof chrome.runtime.connect === "function") {
            const port = chrome.runtime.connect({ name: "wd-panel:" + state.tabId });
            port.onMessage.addListener((msg) => {
              if (msg.type === "wd:new" && msg.entry) {
                // Avoid duplicate if received via window message already
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

            // Consume lastError so bfcache transition does not log unchecked runtime.lastError
            port.onDisconnect.addListener(() => {
              const _ignored = chrome.runtime.lastError;
            });
          }
        } catch (_) {}
      }
    });
  }

  initOverlay();

  // Re-establish connection if page is restored from Back/Forward Cache (bfcache)
  window.addEventListener("pageshow", (e) => {
    if (e.persisted) {
      initOverlay();
    }
  });

  function clampToViewport() {
    const winW = window.innerWidth || document.documentElement.clientWidth || 1024;
    const winH = window.innerHeight || document.documentElement.clientHeight || 768;

    if (state.pos.width > winW) state.pos.width = Math.max(440, winW - 20);
    if (state.pos.height > winH) state.pos.height = Math.max(260, winH - 20);

    if (state.pos.left < 0 || state.pos.left > winW - 120) {
      state.pos.left = Math.max(10, winW - state.pos.width - 20);
    }
    if (state.pos.top < 0 || state.pos.top > winH - 60) {
      state.pos.top = Math.max(10, Math.min(60, winH - state.pos.height - 20));
    }
    applyWindowPos();
  }

  // Public Controller attached to Window
  window.__WEBDEBUG_PRO_OVERLAY__ = {
    toggle() {
      ensureHostAttached();
      if (!state.visible || state.minimized) {
        state.visible = true;
        state.minimized = false;
        windowEl.classList.remove("hidden");
        bubbleEl.classList.add("hidden");
        clampToViewport();
        render();
      } else {
        state.visible = false;
        state.minimized = false;
        windowEl.classList.add("hidden");
        bubbleEl.classList.add("hidden");
      }
    },
    show() {
      ensureHostAttached();
      state.visible = true;
      state.minimized = false;
      windowEl.classList.remove("hidden");
      bubbleEl.classList.add("hidden");
      clampToViewport();
      render();
    },
    hide() {
      state.visible = false;
      state.minimized = false;
      windowEl.classList.add("hidden");
      bubbleEl.classList.add("hidden");
    },
    pushEntry(entry) {
      if (!entry) return;
      if (!entry.id) entry.id = "wd_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
      // Avoid duplicate
      if (state.entries.some((e) => String(e.id) === String(entry.id))) return;
      state.entries.push(entry);
      if (state.entries.length > 1000) state.entries.shift();
      if (!state.pause) scheduleRender();
      else updateBadgeCounters();
    },
    render() {
      render();
    },
    getState() {
      return state;
    },
  };
})();
