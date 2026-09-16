// WebDebug Pro - High-Fidelity Page-World Injected Script (MAIN world).
// Full real-time interception of all console methods, runtime errors, resource failures,
// unhandled promise rejections, fetch calls, XHR requests, and beacon transmissions.
(function () {
  if (window.__WEBDEBUG_PRO_INJECTED__) return;
  window.__WEBDEBUG_PRO_INJECTED__ = true;

  const TAG = "__WEBDEBUG_PRO__";

  // Unique ID generator for perfect deduplication across content-script, background, and overlay
  function generateId() {
    return "wd_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  // Safe PostMessage dispatcher with fallback
  function send(entry) {
    if (!entry) return;
    if (!entry.id) entry.id = generateId();
    if (!entry.timestamp) entry.timestamp = Date.now();
    try {
      window.postMessage({ source: TAG, entry }, "*");
    } catch (_) {
      // If structured clone fails due to any edge-case non-clonable object, sterilize to string and retry
      try {
        const safeEntry = {
          id: entry.id,
          timestamp: entry.timestamp,
          severity: entry.severity || "log",
          message: String(entry.message || ""),
          args: (entry.args || []).map(a => typeof a === "string" ? a : safeStringify(a)),
          source: String(entry.source || ""),
          stack: Array.isArray(entry.stack) ? entry.stack.map(String) : [],
          kind: entry.kind || "console",
        };
        window.postMessage({ source: TAG, entry: safeEntry }, "*");
      } catch (e) {}
    }
  }

  // Deep Object Serializer (Handles circular refs, DOM elements, Errors, Maps, Sets, BigInt, Symbols)
  function serializeArg(val, depth = 0, seen = new WeakSet()) {
    try {
      if (val === null) return null;
      if (val === undefined) return "undefined";
      if (typeof val === "boolean" || typeof val === "number") return val;
      if (typeof val === "string") return val;
      if (typeof val === "bigint") return val.toString() + "n";
      if (typeof val === "symbol") return val.toString();

      if (typeof val === "function") {
        return `ƒ ${val.name || "anonymous"}()`;
      }

      // Check depth limit
      if (depth > 4) {
        return Array.isArray(val) ? "[Array]" : "[Object]";
      }

      // Circular reference guard
      if (typeof val === "object") {
        if (seen.has(val)) return "[Circular]";
        seen.add(val);
      }

      // Error objects
      if (val instanceof Error) {
        return {
          __type: "Error",
          name: val.name || "Error",
          message: val.message || "",
          stack: val.stack || "",
        };
      }

      // DOM Elements & Nodes
      if (typeof Node !== "undefined" && val instanceof Node) {
        if (val.nodeType === 1) { // ELEMENT_NODE
          const el = val;
          const attrs = {};
          if (el.attributes) {
            for (let i = 0; i < Math.min(el.attributes.length, 8); i++) {
              attrs[el.attributes[i].name] = el.attributes[i].value;
            }
          }
          const idStr = el.id ? `#${el.id}` : "";
          const classStr = el.className && typeof el.className === "string" ? `.${el.className.trim().split(/\s+/).join(".")}` : "";
          return {
            __type: "Element",
            tagName: el.tagName.toLowerCase(),
            id: el.id || "",
            className: el.className || "",
            attributes: attrs,
            preview: `<${el.tagName.toLowerCase()}${idStr}${classStr}>`,
            text: el.textContent ? el.textContent.slice(0, 50).trim() : "",
          };
        } else if (val.nodeType === 9) { // DOCUMENT_NODE
          return "#document";
        }
        return `[Node: ${val.nodeName}]`;
      }

      // Window / Document special case
      if (typeof window !== "undefined" && val === window) return "[Window]";
      if (typeof document !== "undefined" && val === document) return "[Document]";

      // Date
      if (val instanceof Date) {
        return `Date(${val.toISOString()})`;
      }

      // RegExp
      if (val instanceof RegExp) {
        return val.toString();
      }

      // Map
      if (typeof Map !== "undefined" && val instanceof Map) {
        const entries = [];
        let count = 0;
        for (const [k, v] of val.entries()) {
          if (count++ > 50) break;
          entries.push([serializeArg(k, depth + 1, seen), serializeArg(v, depth + 1, seen)]);
        }
        return { __type: "Map", size: val.size, entries };
      }

      // Set
      if (typeof Set !== "undefined" && val instanceof Set) {
        const values = [];
        let count = 0;
        for (const item of val.values()) {
          if (count++ > 50) break;
          values.push(serializeArg(item, depth + 1, seen));
        }
        return { __type: "Set", size: val.size, values };
      }

      // Promise
      if (typeof Promise !== "undefined" && val instanceof Promise) {
        return "[Promise]";
      }

      // Arrays
      if (Array.isArray(val)) {
        const arr = [];
        const limit = Math.min(val.length, 100);
        for (let i = 0; i < limit; i++) {
          arr.push(serializeArg(val[i], depth + 1, seen));
        }
        if (val.length > limit) arr.push(`... ${val.length - limit} more items`);
        return arr;
      }

      // Plain Objects
      if (typeof val === "object") {
        const obj = {};
        const keys = Object.keys(val);
        const limit = Math.min(keys.length, 80);
        for (let i = 0; i < limit; i++) {
          const k = keys[i];
          try {
            obj[k] = serializeArg(val[k], depth + 1, seen);
          } catch (_) {
            obj[k] = "[Inaccessible]";
          }
        }
        if (keys.length > limit) obj["__more_keys__"] = `... ${keys.length - limit} more keys`;
        return obj;
      }

      return String(val);
    } catch (_) {
      return String(val);
    }
  }

  function safeStringify(v) {
    if (v === null) return "null";
    if (v === undefined) return "undefined";
    if (typeof v === "string") return v;
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    if (v && v.__type === "Element") return v.preview || `<${v.tagName}>`;
    if (v && v.__type === "Error") return `${v.name}: ${v.message}`;
    try {
      return JSON.stringify(v);
    } catch (_) {
      return String(v);
    }
  }

  function formatMessage(args) {
    if (!args || !args.length) return "";
    return args
      .map((a) => {
        if (typeof a === "string") return a;
        if (a && a.__type === "Element") return a.preview || `<${a.tagName}>`;
        if (a && a.__type === "Error") return `${a.name}: ${a.message}`;
        return safeStringify(a);
      })
      .join(" ");
  }

  // Call stack capturer
  function captureStack() {
    const err = new Error();
    const raw = (err.stack || "").split("\n");
    const frames = raw
      .filter((l) => /^\s*(at |.*@)/.test(l))
      .filter((l) => !/injected\.js/.test(l) && !/chrome-extension:\/\//.test(l))
      .map((l) => l.trim());
    return frames;
  }

  function firstLocation(frames) {
    for (const line of frames) {
      const m = line.match(/(https?:\/\/[^\s):]+:\d+:\d+|file:\/\/[^\s):]+:\d+:\d+)/);
      if (m) return m[0];
    }
    return "";
  }

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

  // -------------------------------------------------------------
  // Console Interception (log, info, warn, error, debug, table, dir, dirxml, trace, assert, count, time)
  // -------------------------------------------------------------
  const countsMap = new Map();
  const timersMap = new Map();

  // Safe invoker for original methods: prevents Function.prototype tampering and catches internal errors
  function safeApply(fn, thisArg, args) {
    if (typeof fn !== "function") return;
    try {
      if (typeof Reflect !== "undefined" && Reflect.apply) {
        return Reflect.apply(fn, thisArg, args);
      }
      return fn.apply(thisArg, args);
    } catch (_) {
      try {
        return fn(...args);
      } catch (_) {}
    }
  }

  let inConsoleHook = false;

  const standardLevels = ["log", "warn", "error", "info", "debug"];
  standardLevels.forEach((level) => {
    const original = console[level];
    if (typeof original !== "function") return;

    console[level] = function (...args) {
      if (inConsoleHook) {
        return safeApply(original, console, args);
      }
      inConsoleHook = true;
      try {
        const callFrames = captureStack();
        const stack = stackFromArgs(args, callFrames);
        const serialized = args.map((a) => serializeArg(a));
        send({
          severity: level === "debug" ? "info" : level,
          message: formatMessage(serialized),
          args: serialized,
          source: firstLocation(stack) || firstLocation(callFrames),
          stack,
          callStack: callFrames,
          timestamp: Date.now(),
          kind: "console",
        });
      } catch (_) {
      } finally {
        inConsoleHook = false;
      }
      return safeApply(original, console, args);
    };
  });

  // console.table
  const origTable = console.table;
  console.table = function (data, columns) {
    if (inConsoleHook) return safeApply(origTable, console, arguments);
    inConsoleHook = true;
    try {
      const callFrames = captureStack();
      const serialized = serializeArg(data);
      send({
        severity: "info",
        message: "[Table] " + (Array.isArray(data) ? `Array(${data.length})` : typeof data === "object" ? "Object" : safeStringify(data)),
        args: [serialized],
        source: firstLocation(callFrames),
        stack: callFrames,
        timestamp: Date.now(),
        kind: "table",
      });
    } catch (_) {
    } finally {
      inConsoleHook = false;
    }
    return safeApply(origTable, console, arguments);
  };

  // console.dir & console.dirxml
  ["dir", "dirxml"].forEach((m) => {
    const orig = console[m];
    if (typeof orig !== "function") return;
    console[m] = function (...args) {
      if (inConsoleHook) return safeApply(orig, console, args);
      inConsoleHook = true;
      try {
        const callFrames = captureStack();
        const serialized = args.map((a) => serializeArg(a));
        send({
          severity: "info",
          message: `[${m}] ` + formatMessage(serialized),
          args: serialized,
          source: firstLocation(callFrames),
          stack: callFrames,
          timestamp: Date.now(),
          kind: m,
        });
      } catch (_) {
      } finally {
        inConsoleHook = false;
      }
      return safeApply(orig, console, args);
    };
  });

  // console.trace
  const origTrace = console.trace;
  console.trace = function (...args) {
    if (inConsoleHook) return safeApply(origTrace, console, args);
    inConsoleHook = true;
    try {
      const callFrames = captureStack();
      const serialized = args.map((a) => serializeArg(a));
      send({
        severity: "info",
        message: "console.trace " + formatMessage(serialized),
        args: serialized,
        source: firstLocation(callFrames),
        stack: callFrames,
        timestamp: Date.now(),
        kind: "trace",
      });
    } catch (_) {
    } finally {
      inConsoleHook = false;
    }
    return safeApply(origTrace, console, args);
  };

  // console.assert
  const origAssert = console.assert;
  console.assert = function (assertion, ...args) {
    if (!assertion && !inConsoleHook) {
      inConsoleHook = true;
      try {
        const callFrames = captureStack();
        const msg = args.length ? formatMessage(args.map((a) => serializeArg(a))) : "Assertion failed";
        send({
          severity: "error",
          message: `Assertion failed: ${msg}`,
          args: args.map((a) => serializeArg(a)),
          source: firstLocation(callFrames),
          stack: callFrames,
          timestamp: Date.now(),
          kind: "assert",
        });
      } catch (_) {
      } finally {
        inConsoleHook = false;
      }
    }
    return safeApply(origAssert, console, arguments);
  };

  // console.count & countReset
  const origCount = console.count;
  console.count = function (label = "default") {
    const cur = (countsMap.get(label) || 0) + 1;
    countsMap.set(label, cur);
    if (!inConsoleHook) {
      inConsoleHook = true;
      try {
        send({
          severity: "info",
          message: `${label}: ${cur}`,
          args: [`${label}: ${cur}`],
          source: firstLocation(captureStack()),
          timestamp: Date.now(),
          kind: "count",
        });
      } catch (_) {
      } finally {
        inConsoleHook = false;
      }
    }
    return safeApply(origCount, console, arguments);
  };

  const origCountReset = console.countReset;
  console.countReset = function (label = "default") {
    countsMap.set(label, 0);
    return safeApply(origCountReset, console, arguments);
  };

  // console.time & timeEnd & timeLog
  const origTime = console.time;
  console.time = function (label = "default") {
    timersMap.set(label, performance.now());
    return safeApply(origTime, console, arguments);
  };

  const origTimeLog = console.timeLog;
  console.timeLog = function (label = "default", ...args) {
    const start = timersMap.get(label);
    if (start != null && !inConsoleHook) {
      const ms = (performance.now() - start).toFixed(2);
      inConsoleHook = true;
      try {
        send({
          severity: "info",
          message: `${label}: ${ms}ms ${formatMessage(args.map(serializeArg))}`,
          args: [`${label}: ${ms}ms`, ...args.map(serializeArg)],
          source: firstLocation(captureStack()),
          timestamp: Date.now(),
          kind: "time",
        });
      } catch (_) {
      } finally {
        inConsoleHook = false;
      }
    }
    return safeApply(origTimeLog, console, arguments);
  };

  const origTimeEnd = console.timeEnd;
  console.timeEnd = function (label = "default") {
    const start = timersMap.get(label);
    if (start != null) {
      const ms = (performance.now() - start).toFixed(2);
      timersMap.delete(label);
      if (!inConsoleHook) {
        inConsoleHook = true;
        try {
          send({
            severity: "info",
            message: `${label}: ${ms}ms`,
            args: [`${label}: ${ms}ms`],
            source: firstLocation(captureStack()),
            timestamp: Date.now(),
            kind: "time",
          });
        } catch (_) {
        } finally {
          inConsoleHook = false;
        }
      }
    }
    return safeApply(origTimeEnd, console, arguments);
  };

  // console.group & groupEnd
  const origGroup = console.group;
  console.group = function (...args) {
    if (!inConsoleHook) {
      inConsoleHook = true;
      try {
        send({
          severity: "log",
          message: "▼ " + (args.length ? formatMessage(args.map(serializeArg)) : "Group"),
          args: args.map(serializeArg),
          source: firstLocation(captureStack()),
          timestamp: Date.now(),
          kind: "group",
        });
      } catch (_) {
      } finally {
        inConsoleHook = false;
      }
    }
    return safeApply(origGroup, console, args);
  };

  const origGroupCollapsed = console.groupCollapsed;
  console.groupCollapsed = function (...args) {
    if (!inConsoleHook) {
      inConsoleHook = true;
      try {
        send({
          severity: "log",
          message: "▶ " + (args.length ? formatMessage(args.map(serializeArg)) : "Group (Collapsed)"),
          args: args.map(serializeArg),
          source: firstLocation(captureStack()),
          timestamp: Date.now(),
          kind: "groupCollapsed",
        });
      } catch (_) {
      } finally {
        inConsoleHook = false;
      }
    }
    return safeApply(origGroupCollapsed, console, args);
  };

  const origGroupEnd = console.groupEnd;
  console.groupEnd = function () {
    return safeApply(origGroupEnd, console, arguments);
  };

  // console.clear
  const origClear = console.clear;
  console.clear = function () {
    if (!inConsoleHook) {
      inConsoleHook = true;
      try {
        send({
          severity: "info",
          message: "Console was cleared",
          args: ["Console was cleared"],
          timestamp: Date.now(),
          kind: "clear",
        });
      } catch (_) {
      } finally {
        inConsoleHook = false;
      }
    }
    return safeApply(origClear, console, arguments);
  };

  // -------------------------------------------------------------
  // Global Uncaught Errors & Resource Load Failures
  // -------------------------------------------------------------
  window.addEventListener(
    "error",
    (ev) => {
      // 1. Check for resource load failure (<script>, <link>, <img>, etc.)
      const target = ev.target;
      if (target && target !== window && (target.src || target.href)) {
        const url = target.src || target.href;
        const tag = target.tagName ? target.tagName.toLowerCase() : "element";
        send({
          severity: "error",
          message: `Failed to load resource: net::ERR_LOAD_FAILED <${tag}> from ${url}`,
          args: [{ url, tag, error: "Resource load failure" }],
          source: url,
          timestamp: Date.now(),
          kind: "resource-error",
        });
        return;
      }

      // 2. JavaScript runtime error
      const stack = ev.error && ev.error.stack ? String(ev.error.stack).split("\n").slice(1).map((l) => l.trim()) : [];
      send({
        severity: "error",
        message: ev.message || (ev.error ? ev.error.message : "Uncaught error"),
        args: [
          ev.error
            ? serializeArg(ev.error)
            : String(ev.message || "Unknown error"),
        ],
        source: `${ev.filename || ""}:${ev.lineno || 0}:${ev.colno || 0}`,
        stack,
        timestamp: Date.now(),
        kind: "uncaught",
      });
    },
    true
  );

  // Unhandled promise rejections
  window.addEventListener("unhandledrejection", (ev) => {
    const r = ev.reason;
    const stack = r && r.stack ? String(r.stack).split("\n").slice(1).map((l) => l.trim()) : [];
    send({
      severity: "error",
      message: "Unhandled promise rejection: " + (r && r.message ? r.message : safeStringify(serializeArg(r))),
      args: [serializeArg(r)],
      source: r && r.stack ? String(r.stack).split("\n")[1] || "" : "",
      stack,
      timestamp: Date.now(),
      kind: "unhandledrejection",
    });
  });

  // -------------------------------------------------------------
  // Real-Time Network Interception: window.fetch
  // -------------------------------------------------------------
  const origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function (...args) {
      const url = typeof args[0] === "string" ? args[0] : (args[0] && args[0].url) || "";
      const method = ((args[1] && args[1].method) || (args[0] && args[0].method) || "GET").toUpperCase();
      let reqHeaders = {};
      try { reqHeaders = (args[1] && args[1].headers) || (args[0] && args[0].headers) || {}; } catch (_) {}
      let reqBody = null;
      try {
        reqBody = (args[1] && args[1].body) || null;
        if (typeof reqBody === "string") try { reqBody = JSON.parse(reqBody); } catch (_) {}
      } catch (_) {}

      const start = Date.now();
      return origFetch.apply(this, args).then(
        (res) => {
          const duration = Date.now() - start;
          // Clone to read payload safely without consuming original stream
          res
            .clone()
            .text()
            .then((text) => {
              let resData = text;
              try { resData = JSON.parse(text); } catch (_) {}
              let resHeaders = {};
              try { resHeaders = Object.fromEntries(res.headers.entries()); } catch (_) {}

              send({
                severity: res.ok ? "network" : "error",
                message: `${method} ${url} → ${res.status} ${res.statusText || ""} (${duration}ms)`,
                args: [
                  {
                    url,
                    method,
                    status: res.status,
                    duration,
                    request: { headers: reqHeaders, body: reqBody },
                    response: { headers: resHeaders, data: resData },
                  },
                ],
                source: url,
                timestamp: start,
                kind: "fetch",
              });
            })
            .catch(() => {
              send({
                severity: res.ok ? "network" : "error",
                message: `${method} ${url} → ${res.status} ${res.statusText || ""} (${duration}ms)`,
                args: [{ url, method, status: res.status, duration }],
                source: url,
                timestamp: start,
                kind: "fetch",
              });
            });
          return res;
        },
        (err) => {
          const duration = Date.now() - start;
          send({
            severity: "error",
            message: `${method} ${url} → FAILED (${duration}ms): ${err && err.message ? err.message : "NetworkError"}`,
            args: [{ url, method, duration, error: err && err.message, request: { headers: reqHeaders, body: reqBody } }],
            source: url,
            timestamp: start,
            kind: "fetch-error",
          });
          throw err;
        }
      );
    };
  }

  // -------------------------------------------------------------
  // Real-Time Network Interception: XMLHttpRequest
  // -------------------------------------------------------------
  const OrigXHR = window.XMLHttpRequest;
  if (OrigXHR) {
    const origOpen = OrigXHR.prototype.open;
    const origSend = OrigXHR.prototype.send;
    const origSetReqHeader = OrigXHR.prototype.setRequestHeader;

    OrigXHR.prototype.open = function (method, url) {
      this.__wd = {
        method: (method || "GET").toUpperCase(),
        url: String(url || ""),
        start: Date.now(),
        headers: {},
      };
      return origOpen.apply(this, arguments);
    };

    OrigXHR.prototype.setRequestHeader = function (header, value) {
      if (this.__wd && this.__wd.headers) this.__wd.headers[header] = value;
      return origSetReqHeader.apply(this, arguments);
    };

    OrigXHR.prototype.send = function (body) {
      const xhr = this;
      let reqBody = body;
      if (typeof reqBody === "string") try { reqBody = JSON.parse(reqBody); } catch (_) {}

      xhr.addEventListener("loadend", () => {
        const info = xhr.__wd || { method: "XHR", url: "", start: Date.now(), headers: {} };
        const duration = Date.now() - (info.start || Date.now());

        let resData;
        try {
          if (!xhr.responseType || xhr.responseType === "text") {
            resData = xhr.responseText;
            try { resData = JSON.parse(resData); } catch (_) {}
          } else {
            resData = xhr.response;
          }
        } catch (_) {
          resData = "<binary or inaccessible response>";
        }

        let resHeaders = {};
        try {
          const rawH = xhr.getAllResponseHeaders() || "";
          rawH.trim().split(/[\r\n]+/).forEach((line) => {
            const parts = line.split(": ");
            if (parts.length >= 2) resHeaders[parts.shift()] = parts.join(": ");
          });
        } catch (_) {}

        const isOk = xhr.status >= 200 && xhr.status < 400;
        send({
          severity: isOk ? "network" : "error",
          message: `${info.method || "XHR"} ${info.url || ""} → ${xhr.status || "ERR"} ${xhr.statusText || ""} (${duration}ms)`,
          args: [
            {
              url: info.url,
              method: info.method,
              status: xhr.status,
              duration,
              request: { headers: info.headers, body: reqBody },
              response: { headers: resHeaders, data: resData },
            },
          ],
          source: info.url || "",
          timestamp: info.start || Date.now(),
          kind: "xhr",
        });
      });

      return origSend.apply(this, arguments);
    };
  }

  // -------------------------------------------------------------
  // Real-Time Beacon Interception: navigator.sendBeacon
  // -------------------------------------------------------------
  if (typeof navigator !== "undefined" && navigator.sendBeacon) {
    const origBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function (url, data) {
      try {
        send({
          severity: "network",
          message: `POST (Beacon) ${url}`,
          args: [{ url, method: "POST", kind: "beacon", data: serializeArg(data) }],
          source: url,
          timestamp: Date.now(),
          kind: "beacon",
        });
      } catch (_) {}
      return origBeacon.apply(navigator, arguments);
    };
  }
})();
