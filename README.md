# WebDebug Pro 🚀

[![Version](https://img.shields.io/badge/version-1.5.0-blue.svg)](manifest.json)
[![Manifest](https://img.shields.io/badge/manifest-V3-success.svg)](manifest.json)
[![Chrome](https://img.shields.io/badge/chrome-111%2B-orange.svg)](manifest.json)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A lightweight, high-performance Manifest V3 browser extension that brings a mini DevTools panel directly inside any webpage. It captures real-time console logs, uncaught exceptions, resource loading failures, and network traffic with interactive JSON exploration, DOM inspection, storage management, and comprehensive bug export utilities.

---

## 🌟 What's New in Version 1.5.0

Version 1.5.0 brings major architectural enhancements, stability improvements, and a completely overhauled user experience:

- 🖱️ **Free Drag & Multi-Directional Resize:**
  - Hold the mouse cursor on the top header bar (`⋮⋮`) to drag the panel freely across the viewport without boundary issues or getting stuck.
  - Multi-directional resizing from all 8 directions (top, bottom, left, right, and all 4 corners).
- 🔒 **Persistent In-Page Debugging:**
  - Clicking on the host webpage no longer closes or dismisses the extension panel.
  - Added a dedicated **Close (`✕`)** button to dismiss the overlay, a **Minimize (`—`)** button to collapse it, and a **Pop-out (`⧉`)** button for a detached window.
- 🎈 **Draggable Floating Launcher Bubble:**
  - When minimized, the panel collapses into a sleek floating badge with a code icon (`{;}`).
  - Users can click and hold the bubble to drag it anywhere across the screen; releasing drops it precisely at the new coordinates.
  - Intelligent gesture separation: drag-and-drop moves the bubble, while a stationary click smoothly restores the full panel. Bubble position persists across page navigations in `localStorage`.
- ⚡ **Real-Time DevTools-Grade Engine (`MAIN` World Injection):**
  - Registered `injected.js` directly in the Chrome `MAIN` execution world (`run_at: "document_start"`), completely immune to strict site Content Security Policies (CSP) that previously blocked `<script>` tags.
  - Hooks into all native `console` methods: `log`, `info`, `warn`, `error`, `debug`, `table`, `dir`, `trace`, `assert`, `count`, `time`/`timeEnd`, `group`/`groupEnd`, and `clear`.
  - Captures resource loading errors (`<script>`, `<img>`, `<link>`) and unhandled promise rejections in real time.
- 🔄 **Circular-Safe High-Fidelity Serializer:**
  - Full support for circular object references, DOM elements (`<div#id.class>`), Maps, Sets, BigInts, Symbols, and Error objects with complete stack traces without throwing `TypeError: Converting circular structure to JSON`.
  - Console REPL evaluator (`wd:eval`) is completely circular-safe when inspecting `document`, `window`, or nested DOM nodes.
- 🛡️ **Bfcache & Shadow DOM Resilience:**
  - Resolved `Unchecked runtime.lastError: The page keeping the extension port is moved into back/forward cache` by listening to `port.onDisconnect`, clearing stale ports in `background.js`, and automatically reconnecting on `pageshow`.
  - Fixed `DOMException: Shadow root cannot be created on a host which already hosts a shadow tree` by safely reusing existing shadow hosts during script re-injections and hot-reloads.
  - Silky-smooth 60fps streaming log updates using `requestAnimationFrame` batched rendering.

---

## 🛠️ Features

### Core Real-Time Debugging
- **DevTools-Grade Console Overrides:** Intercepts `log`, `warn`, `error`, `info`, `debug`, `table`, `dir`, `trace`, `assert`, `count`, `time`, `group`, and `clear` while preserving native browser devtools output.
- **Error & Exception Tracking:** Listens to `window.onerror`, unhandled promise rejections (`unhandledrejection`), and resource loading failures.
- **Interactive Collapsible JSON Viewer:** Explore deeply nested objects, arrays, and complex data structures in a tree UI with one-click copy.
- **DOM Element Inspector:** Hover and click on any element on the page to view its tag name, IDs, classes, attributes, and inner HTML.

### Network & Performance
- **Network Request Interceptor:** Tracks both `fetch` and `XMLHttpRequest` calls with request/response headers, status codes, payload bodies, and timing.
- **Live Performance Monitor:** Real-time HUD tracking Page Load Time and JavaScript Heap Memory usage.

### Execution & Storage
- **In-Page JavaScript Console (REPL):** Execute JavaScript expressions directly in the context of the host webpage with circular-safe result rendering.
- **Storage Manager:** Dedicated tab to inspect, refresh, edit, and clear `localStorage`, `sessionStorage`, and `cookies`.

### Window Management & UI Aesthetics
- **Draggable & 8-Way Resizable:** Freely reposition by dragging the top bar; resize from any edge or corner handle.
- **Floating Launcher Bubble:** Collapses into a draggable floating bubble with persistent coordinates.
- **Persistent State:** Host page clicks do not dismiss the panel. Explicit Close (`✕`), Minimize (`—`), and Pop-out (`⧉`) buttons.
- **Dark & Light Modes:** Sleek glassmorphic theme with glowing severity pills and customizable UI opacity.
- **Keyboard Shortcut:** Toggle panel instantly on any page with `Alt+Shift+D`.
- **Search, Filter & Blacklist:** Regex search, severity filters, and a blacklist (🚫) button to hide spammy scripts.
- **Pause Live Stream:** Freeze auto-scrolling to inspect high-frequency logs in real time.
- **Bug Report Export:** Export captured logs as **JSON**, **TXT**, **CSV**, or a self-contained **HTML Bug Report** with an automatic screenshot of the visible tab.

---

## 🏗️ Architecture & How It Works

WebDebug Pro employs an isolated multi-tiered Manifest V3 architecture designed for speed, security, and zero interference with host web applications:

```
┌─────────────────────────────────────────────────────────────┐
│                       HOST WEBPAGE                          │
│                                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │             injected.js (MAIN World)                │   │
│   │  - Hooks console.*, window.onerror, unhandledrejection│ │
│   │  - Intercepts fetch, XHR, resource errors           │   │
│   │  - Circular-Safe Serializer (DOM, Map, Set, BigInt) │   │
│   └──────────────────────────┬──────────────────────────┘   │
│                              │ window.postMessage           │
│                              ▼                              │
│   ┌─────────────────────────────────────────────────────┐   │
│   │         content-script.js (ISOLATED World)          │   │
│   │  - Secure event relay                               │   │
│   │  - Port lifecycle & bfcache reconnect handler       │   │
│   └──────────────────────────┬──────────────────────────┘   │
│                              │ chrome.runtime.connect       │
└──────────────────────────────┼──────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│            background.js (MV3 Service Worker)               │
│  - Per-tab circular buffer (capped at 1,000 entries)        │
│  - webRequest observer for HTTP 4xx/5xx & network drops     │
│  - Port broadcast manager with dead-port cleanup            │
│  - Circular-safe REPL script evaluator                      │
└──────────────────────────────┬──────────────────────────────┘
                               │ Streams via chrome.runtime Port
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                   PRESENTATION LAYERS                       │
│                                                             │
│  ┌───────────────────────┐       ┌────────────────────────┐ │
│  │ overlay.js (Shadow DOM│       │ panel.html / panel.js  │ │
│  │ In-Page Draggable HUD │       │ DevTools / Standalone  │ │
│  │ & Launcher Bubble)    │       │ Window Panel           │ │
│  └───────────────────────┘       └────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

1. **`injected.js` (Main World):**
   Runs directly in the page's execution environment (`"world": "MAIN"`). Overrides native `console` methods, captures resource errors, and proxies `fetch`/`XHR`. Safely serializes objects and dispatches them via `window.postMessage`.
2. **`content-script.js` (Isolated World):**
   Listens for messages from `injected.js`, maintains the connection port with the background worker, and manages the lifecycle of the in-page overlay.
3. **`background.js` (Service Worker):**
   Maintains tab-scoped log buffers, captures lower-level network failures via `chrome.webRequest`, monitors extension badge counts, and securely evaluates REPL expressions.
4. **`overlay.js` (Shadow DOM UI):**
   Renders the floating panel inside an isolated Shadow DOM container to prevent host site CSS from breaking the debugger UI. Implements 8-way resizing, pointer capture dragging, and the draggable floating launcher bubble.
5. **`panel.html` / `panel.js` / `panel.css` (DevTools & Popup):**
   Provides a standalone window and an integrated Chrome DevTools panel with deep inspection, storage management, and HTML bug report generation.

---

## 📥 Installation & Setup

1. Clone or download this repository.
2. Open Google Chrome, Microsoft Edge, or any Chromium-based browser.
3. Navigate to `chrome://extensions` (or `edge://extensions`).
4. Enable **Developer mode** using the toggle in the top-right corner.
5. Click **Load unpacked** and select the `Webdebug-pro-main` project folder.
6. The WebDebug Pro icon will appear in your extensions toolbar. Pin it for quick access!

---

## ⌨️ Shortcuts & Controls

| Action | Shortcut / Control |
|---|---|
| **Toggle Floating Panel** | `Alt + Shift + D` or Click Toolbar Icon |
| **Move Panel** | Hold mouse cursor on the top bar (`⋮⋮`) and drag |
| **Resize Panel** | Drag any of the 4 borders or 4 corner handles |
| **Minimize to Bubble** | Click Minimize (`—`) button on top-right |
| **Move Minimized Bubble** | Hold mouse cursor on bubble and drag; release to drop |
| **Restore from Bubble** | Single click on the floating bubble |
| **Close Panel** | Click Close (`✕`) button on top-right |
| **Pop-out to Window** | Click Pop-out (`⧉`) button on top-right |

---

## 🔒 Permissions & Security

- `activeTab` & `scripting`: Inject and control the debug overlay on the current tab.
- `storage`: Store theme preferences, blacklist filters, and window positions.
- `downloads`: Export log files and HTML bug reports.
- `webRequest`: Observe network response status codes and failed network requests.
- `tabs`: Query active tab information for targeted log buffering.
- `host_permissions: ["<all_urls>"]`: Enables full real-time network and log capture across any website.

---

## 📁 Project Structure

```text
Webdebug-pro-main/
├── manifest.json        # Extension Manifest V3 configuration (v1.5.0)
├── background.js        # Background Service Worker, buffer & port manager
├── content-script.js    # Isolated-world bridge & overlay lifecycle controller
├── injected.js          # Main-world real-time console & network hook engine
├── overlay.js           # In-page floating panel & bubble (Shadow DOM)
├── devtools.html        # DevTools page initializer
├── devtools.js          # Registers panel in Chrome DevTools
├── panel.html           # DevTools & Standalone Window UI
├── panel.js             # UI logic, JSON tree viewer, storage manager & REPL
├── panel.css            # Glassmorphic dark/light UI styling
├── icons/               # Extension icons (16px, 48px, 128px)
├── README.md            # Documentation & release guide
└── LICENSE              # MIT License
```

---

## 👨‍💻 Connect with the Developer

- **Portfolio:** [aboutmee.pages.dev](https://aboutmee.pages.dev/)
- **GitHub:** [@v54087912-collab](https://github.com/v54087912-collab)
- **Contact Developer (Telegram):** [@R3V_X](https://t.me/R3V_X)
- **Community Group (Telegram):** [Join Community](https://t.me/allinformation0173)
- **Instagram:** [@opeditzxx](https://www.instagram.com/opeditzxx/?utm_source=qr&r=nametag)

---

## 📄 License

This project is open-source software licensed under the [MIT License](LICENSE). Contributions, bug reports, and feature requests are welcome!
