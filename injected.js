// WebDebug Pro - Page-world injected script.
// Overrides console methods, window.onerror, unhandledrejection, fetch, XHR.
// Forwards events to the isolated content script via window.postMessage.
(function () {
  if (window.__WEBDEBUG_PRO_INJECTED__) return;
  window.__WEBDEBUG_PRO_INJECTED__ = true;

  const TAG = "__WEBDEBUG_PRO__";

  function send(entry) {
    try {
      window.postMessage({ source: TAG, entry }, "*");
    } catch (_) {}
  }

  function serializeArg(a) {
    try {
      if (a instanceof Error) {
        return { __type: "Error", name: a.name, message: a.message, stack: a.stack };
      }
      if (typeof a === "function") return `[Function ${a.name || "anonymous"}]`;
      if (typeof a === "undefined") return "undefined";
      if (typeof a === "object" && a !== null) {
        try {
          return JSON.parse(JSON.stringify(a));
        } catch (_) {
          return String(a);
        }
      }
      return a;
    } catch (_) {
      return String(a);
    }
  }

  function captureStack() {
    const err = new Error();
    const raw = (err.stack || "").split("\n");
    // Drop the "Error" header and this file's own frames (captureStack + console wrapper).
    const frames = raw
      .filter((l) => /^\s*(at |.*@)/.test(l))
      .filter((l) => !/injected\.js/.test(l) && !/chrome-extension:\/\//.test(l))
      .map((l) => l.trim());
    return frames;
  }

  function firstLocation(frames) {
    for (const line of frames) {
      const m = line.match(/https?:\/\/[^\s):]+:\d+:\d+/);
      if (m) return m[0];
    }
    return "";
  }

  // Prefer a real Error's own stack when one was logged.
  function stackFromArgs(args, fallback) {
    for (const a of args) {
      if (a instanceof Error && a.stack) {
        return String(a.stack)
          .split("\n")
          .slice(1)
          .map((l) => l.trim())
          .filter(Boolean);
      }
    }
    return fallback;
  }

  // Console overrides
  ["log", "warn", "error", "info", "debug"].forEach((level) => {
    const original = console[level].bind(console);
    console[level] = function (...args) {
      try {
        const callFrames = captureStack();
        const stack = stackFromArgs(args, callFrames);
        send({
          severity: level,
          message: args.map((a) => (typeof a === "string" ? a : safeStringify(serializeArg(a)))).join(" "),
          args: args.map(serializeArg),
          source: firstLocation(stack) || firstLocation(callFrames),
          stack,
          callStack: callFrames,
          timestamp: Date.now(),
        });
      } catch (_) {}
      return original.apply(console, args);
    };
  });

  function safeStringify(v) {
    try {
      return typeof v === "string" ? v : JSON.stringify(v);
    } catch (_) {
      return String(v);
    }
  }

  // Uncaught errors
  window.addEventListener(
    "error",
    (ev) => {
      send({
        severity: "error",
        message: ev.message || "Uncaught error",
        args: [
          ev.error
            ? { __type: "Error", name: ev.error.name, message: ev.error.message, stack: ev.error.stack }
            : String(ev.message),
        ],
        source: `${ev.filename || ""}:${ev.lineno || 0}:${ev.colno || 0}`,
        stack: ev.error && ev.error.stack ? String(ev.error.stack).split("\n").slice(1).map((l) => l.trim()) : [],
        timestamp: Date.now(),
        kind: "uncaught",
      });
    },
    true
  );

  // Unhandled promise rejections
  window.addEventListener("unhandledrejection", (ev) => {
    const r = ev.reason;
    send({
      severity: "error",
      message: "Unhandled promise rejection: " + (r && r.message ? r.message : safeStringify(serializeArg(r))),
      args: [serializeArg(r)],
      source: r && r.stack ? String(r.stack).split("\n")[1] || "" : "",
      stack: r && r.stack ? String(r.stack).split("\n").slice(1).map((l) => l.trim()) : [],
      timestamp: Date.now(),
      kind: "unhandledrejection",
    });
  });

  // fetch hook
  const origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function (...args) {
      const url = typeof args[0] === "string" ? args[0] : args[0] && args[0].url;
      const method = (args[1] && args[1].method) || (args[0] && args[0].method) || "GET";
      let reqHeaders = {};
      try { reqHeaders = (args[1] && args[1].headers) || (args[0] && args[0].headers) || {}; } catch(e){}
      let reqBody = null;
      try { reqBody = (args[1] && args[1].body) || null; if (typeof reqBody === 'string') try { reqBody = JSON.parse(reqBody); } catch(e){} } catch(e){}

      const start = Date.now();
      return origFetch.apply(this, args).then(
        (res) => {
          res.clone().text().then(text => {
            let resData = text;
            try { resData = JSON.parse(text); } catch(e){}
            let resHeaders = {};
            try { resHeaders = Object.fromEntries(res.headers.entries()); } catch(e){}
            
            send({
              severity: res.ok ? "network" : "error",
              message: `${method} ${url} → ${res.status} ${res.statusText}`,
              args: [{ url, method, status: res.status, request: { headers: reqHeaders, body: reqBody }, response: { headers: resHeaders, data: resData } }],
              source: url,
              timestamp: start,
              kind: "fetch",
            });
          }).catch(err => {
             send({
               severity: res.ok ? "network" : "error",
               message: `${method} ${url} → ${res.status} ${res.statusText}`,
               args: [{ url, method, status: res.status }],
               source: url,
               timestamp: start,
               kind: "fetch",
             });
          });
          return res;
        },
        (err) => {
          send({
            severity: "error",
            message: `${method} ${url} → FAILED ${err && err.message ? err.message : ""}`,
            args: [{ url, method, error: err && err.message, request: { headers: reqHeaders, body: reqBody } }],
            source: url,
            timestamp: start,
            kind: "fetch-error",
          });
          throw err;
        }
      );
    };
  }

  // XHR hook
  const OrigXHR = window.XMLHttpRequest;
  if (OrigXHR) {
    const open = OrigXHR.prototype.open;
    const sendM = OrigXHR.prototype.send;
    const setReqHeader = OrigXHR.prototype.setRequestHeader;
    
    OrigXHR.prototype.open = function (method, url) {
      this.__wd = { method, url, start: Date.now(), headers: {} };
      return open.apply(this, arguments);
    };
    OrigXHR.prototype.setRequestHeader = function (header, value) {
      if (this.__wd) this.__wd.headers[header] = value;
      return setReqHeader.apply(this, arguments);
    };
    OrigXHR.prototype.send = function (body) {
      const xhr = this;
      let reqBody = body;
      if (typeof reqBody === 'string') try { reqBody = JSON.parse(reqBody); } catch(e){}
      
      xhr.addEventListener("loadend", () => {
        const info = xhr.__wd || {};
        let resData;
        try {
          if (!xhr.responseType || xhr.responseType === "text") {
            resData = xhr.responseText;
            try { resData = JSON.parse(resData); } catch(e){}
          } else {
            resData = xhr.response;
          }
        } catch(e) { resData = "<binary or inaccessible response>"; }
        
        let resHeaders = {};
        try {
          xhr.getAllResponseHeaders().trim().split(/[\r\n]+/).forEach(line => {
            const parts = line.split(': ');
            if (parts.length >= 2) resHeaders[parts.shift()] = parts.join(': ');
          });
        } catch(e){}

        const isOk = xhr.status >= 200 && xhr.status < 400;
        send({
          severity: isOk ? "network" : "error",
          message: `${info.method || "?"} ${info.url || ""} → ${xhr.status} ${xhr.statusText || ""}`,
          args: [{ url: info.url, method: info.method, status: xhr.status, request: { headers: info.headers, body: reqBody }, response: { headers: resHeaders, data: resData } }],
          source: info.url || "",
          timestamp: info.start || Date.now(),
          kind: "xhr",
        });
      });
      return sendM.apply(this, arguments);
    };
  }
})();
