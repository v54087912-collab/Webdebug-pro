# WebDebug Pro

A lightweight Manifest V3 Chrome/Edge extension that acts as a mini DevTools panel. It captures console output, uncaught errors, unhandled promise rejections and failed network requests from the active tab, with copy, filter and export utilities.

## Features

**Core Debugging**
- **Console Overrides:** Captures `log`, `warn`, `error`, `info`, `debug` (native behavior preserved).
- **Error Tracking:** Captures `window.onerror` and `unhandledrejection`.
- **Interactive JSON Viewer:** View deeply nested objects and arrays in a collapsible tree UI.
- **DOM Element Inspector:** Hover and click on any page element to log its tag, classes, ID, attributes, and innerHTML.

**Network & Performance**
- **Advanced Network Inspector:** Captures all `fetch` / `XMLHttpRequest` requests including Request/Response Headers and Payloads.
- **Performance Widget:** Live indicator showing Page Load Time and JS Memory Usage (Heap).

**Execution & Storage**
- **JavaScript Console:** Evaluate JS expressions directly within the page context from the panel.
- **Storage Manager:** Dedicated tab to view, refresh, and clear `localStorage`, `sessionStorage`, and `cookies`.

**UI & Workflow**
- **Regex Search & Blacklisting:** Support for Regex queries, plus a 🚫 button to hide logs from noisy scripts.
- **Pause Updates:** Freeze the UI to read fast-moving logs without them auto-scrolling.
- **Bug Report Export:** Export logs as JSON, TXT, CSV, or a comprehensive **HTML Bug Report** that includes a screenshot of the visible tab.
- **Smart Log Management:** Per-tab memory buffer (capped at 1000), grouped duplicates, pinned entries, and persistence across navigations.
- **Cross-context Support:** Works as a toolbar **popup** and as a native **DevTools panel**.

## Architecture & How It Works

WebDebug Pro uses a multi-layered Manifest V3 architecture to safely and effectively capture logs from the host page without compromising security or performance.

1. **Injected Script (`injected.js`)**
   - **Environment**: Runs in the **Main World** (the same execution environment as the host page).
   - **Role**: Overrides native `console` methods (`log`, `warn`, `error`, etc.), hooks into `window.onerror` and `unhandledrejection`, and intercepts `fetch` and `XMLHttpRequest` calls.
   - **Data Flow**: Serializes the captured data (handling circular references and DOM elements) and dispatches a custom `window.postMessage()` to the content script.

2. **Content Script (`content-script.js`)**
   - **Environment**: Runs in the **Isolated World**.
   - **Role**: Acts as a secure bridge. It listens for the `message` events dispatched by `injected.js`.
   - **Data Flow**: Forwards the sanitized data securely to the background service worker using `chrome.runtime.sendMessage`.

3. **Background Service Worker (`background.js`)**
   - **Environment**: Runs in the background (MV3 Service Worker).
   - **Role**: Maintains a per-tab, in-memory buffer of logs (capped at 1000 entries to prevent memory leaks). It also directly intercepts failed network requests via `chrome.webRequest` (catching CORS and 4xx/5xx errors).
   - **Data Flow**: Connects to the UI via `chrome.runtime.connect` and streams logs in real-time.

4. **UI Panel (`panel.html` / `panel.js` / `panel.css`)**
   - **Environment**: Runs as an Extension Popup or natively within the Chrome DevTools panel.
   - **Role**: Renders the interactive JSON trees, manages storage, executes JavaScript commands via `chrome.scripting`, and handles Bug Report generation.

## Load unpacked

1. Download and unzip the extension.
2. Open `chrome://extensions` (or `edge://extensions`).
3. Enable **Developer mode** (toggle top right).
4. Click **Load unpacked** and select the unzipped `extension/` folder.
5. Pin the WebDebug Pro icon to your toolbar, or open DevTools on any page and switch to the **WebDebug Pro** tab.

## Permissions

- `activeTab`, `scripting`, `storage`, `downloads`, `webRequest`, `tabs`
- `host_permissions: <all_urls>` — required for the content script + `webRequest` observation to work on any site. Remove it from `manifest.json` if you only want the extension active on the current tab (you will lose network capture on unvisited hosts).

## Files

- `manifest.json` — MV3 manifest
- `background.js` — service worker, per-tab log buffer, webRequest capture, badge
- `content-script.js` — isolated-world relay
- `injected.js` — page-world console/error/fetch/XHR hooks
- `devtools.html` / `devtools.js` — registers the DevTools panel
- `panel.html` / `panel.js` / `panel.css` — shared UI (popup + panel)

## Connect with the Developer

- **Portfolio**: [https://aboutmee.pages.dev/](https://aboutmee.pages.dev/)
- **GitHub**: [https://github.com/v54087912-collab](https://github.com/v54087912-collab)
- **Contact Developer (Telegram)**: [@R3V_X](https://t.me/R3V_X)
- **Community Link (Telegram)**: [Join Group](https://t.me/allinformation0173)
- **Instagram**: [opeditzxx](https://www.instagram.com/opeditzxx/?utm_source=qr&r=nametag)

## Open Source
- Want to contribute? Check out the [CONTRIBUTING.md](CONTRIBUTING.md) guide.
- This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
