// Host environment for the single-process JavaScriptCore runtime. Wires JS globals to the Rust
// host functions installed by rust/src/jsc.rs, and is evaluated before the app bundle.
// JavaScriptCore provides ES built-ins (JSON, Promise + microtasks, Date, Map, etc.); this layer
// adds the browser/RN-ish globals the app expects: console, timers, rAF, performance.
(function () {
  var g = globalThis;

  // some libraries reference `global` / `process.env` / `self`.
  g.global = g;
  g.self = g;
  if (!g.process) g.process = { env: {} };
  if (!g.process.env) g.process.env = {};
  if (typeof g.process.exit !== 'function') {
    g.process.exit = function (code) { g.__rngpui_exit(String(code == null ? 0 : code | 0)); };
  }
  if (typeof g.process.kill !== 'function') {
    g.process.kill = function (pid, signal) {
      if (+pid !== g.process.pid) throw new Error('rngpui process.kill only supports the current process');
      if (signal === 'SIGUSR2') {
        g.__rngpui_reloadApp('');
        return true;
      }
      throw new Error('rngpui process.kill only supports SIGUSR2 reload');
    };
  }

  // console → host stderr sink.
  function fmt(args) {
    var parts = [];
    for (var i = 0; i < args.length; i++) {
      var a = args[i];
      if (typeof a === 'string') {
        parts.push(a);
      } else if (a instanceof Error) {
        parts.push(a.stack || a.message || String(a));
      } else {
        try { parts.push(JSON.stringify(a)); } catch (e) { parts.push(String(a)); }
      }
    }
    return parts.join(' ');
  }
  function mk(level) {
    return function () { g.__rngpui_log(level + ': ' + fmt(arguments)); };
  }
  g.console = { log: mk('log'), info: mk('info'), warn: mk('warn'), error: mk('error'), debug: mk('debug'), trace: mk('trace') };

  // performance.now() → monotonic ms from the host clock.
  g.performance = g.performance || { now: function () { return g.__rngpui_now(''); } };

  // timers — JS owns the id→callback map; the Rust event loop schedules + fires them.
  var timers = Object.create(null);
  var nextTimerId = 1;
  function schedule(cb, ms, repeat, extraArgs) {
    if (typeof cb !== 'function') return 0;
    var id = nextTimerId++;
    timers[id] = { cb: cb, args: extraArgs || [], repeat: !!repeat };
    g.__rngpui_setTimer(JSON.stringify([id, ms > 0 ? ms : 0, repeat ? 1 : 0]));
    return id;
  }
  g.setTimeout = function (cb, ms) { return schedule(cb, ms | 0, false, Array.prototype.slice.call(arguments, 2)); };
  g.setInterval = function (cb, ms) { return schedule(cb, ms | 0, true, Array.prototype.slice.call(arguments, 2)); };
  g.setImmediate = function (cb) { return schedule(cb, 0, false, Array.prototype.slice.call(arguments, 1)); };
  g.clearTimeout = function (id) {
    if (id && timers[id]) { delete timers[id]; g.__rngpui_clearTimer(JSON.stringify([id])); }
  };
  g.clearInterval = g.clearTimeout;
  g.clearImmediate = g.clearTimeout;

  // Rust calls this (with the id as a string) when a timer's deadline passes.
  g.__rngpui_fireTimer = function (idStr) {
    var id = +idStr;
    var t = timers[id];
    if (!t) return;
    if (!t.repeat) delete timers[id];
    try {
      t.cb.apply(null, t.args);
    } catch (e) {
      g.__rngpui_log('error: timer threw ' + ((e && e.stack) || e));
    }
  };

  // requestAnimationFrame rides the host's real vsync (rust frame_clock.rs /
  // CVDisplayLink): arming __rngpui_requestFrame gets ONE __rngpui_fireFrame back
  // on the next display refresh. At most one fire is in flight: __rafArmed is the
  // whole invariant, so arming twice is a no-op and a frame ends by re-arming only
  // if work is still queued. A fire runs callbacks, then finalizers. Both runtimes
  // (React + reanimated worklet/UI) get this same implementation here, before any
  // bundle evaluates.
  var __rafDebug = g.process && g.process.env && g.process.env.RNGPUI_RAF_DEBUG;
  var __rafSeq = 0;
  var __rafCallbacks = new Map();
  var __rafFinalizers = [];
  var __rafNextId = 1;
  var __rafArmed = false;
  function __rafArm() {
    if (__rafArmed) return;
    __rafArmed = true;
    g.__rngpui_requestFrame('');
  }
  g.requestAnimationFrame = function (cb) {
    var id = __rafNextId++;
    __rafCallbacks.set(id, cb);
    if (__rafDebug) { g.__rngpui_log('debug: rAF schedule #' + (++__rafSeq)); }
    __rafArm();
    return id;
  };
  g.cancelAnimationFrame = function (id) { __rafCallbacks.delete(id); };
  // reanimated 4.5+ requires this on the runtime its worklets run on: mappers.ts
  // reads it once as `schedulingFunction`, and scheduledMapperRun reschedules
  // itself through it after EVERY run, so it is the mapper loop's only clock.
  // animationsManager's scheduleFlush rides it too. Upstream's worklets runLoop
  // only pushes, because its UI-runtime frame loop reschedules unconditionally
  // and is therefore always running. Ours is armed on demand, so a finalizer has
  // to arm it as well or the loop stops the moment no ordinary callback is
  // outstanding, and reanimated silently stops applying updates.
  g.requestAnimationFrameFinalizer = function (cb) {
    if (typeof cb !== 'function') return;
    __rafFinalizers.push(cb);
    __rafArm();
  };
  g.__rngpui_fireFrame = function () {
    __rafArmed = false;
    // snapshot ids: callbacks registered DURING this frame run next frame, and a
    // callback cancelling a same-frame sibling must win (browser semantics).
    var ids = Array.from(__rafCallbacks.keys());
    var ts = g.__rngpui_now('');
    for (var i = 0; i < ids.length; i++) {
      var cb = __rafCallbacks.get(ids[i]);
      if (!cb) continue;
      __rafCallbacks.delete(ids[i]);
      try { cb(ts); } catch (e) { g.__rngpui_log('error: rAF callback threw ' + ((e && e.stack) || e)); }
    }
    // finalizers run after every callback of the same frame. One that queues
    // another finalizer (which is exactly what scheduledMapperRun does) lands in
    // the fresh array and waits for the next frame instead of spinning this one.
    // Upstream drains microtasks between the two phases; JavaScriptCore drains ours after
    // the Rust tick that called this, so a queueMicrotask'd mapper run lands one
    // phase later than on React Native.
    var finalizers = __rafFinalizers;
    __rafFinalizers = [];
    for (var j = 0; j < finalizers.length; j++) {
      try { finalizers[j](); } catch (e) { g.__rngpui_log('error: rAF finalizer threw ' + ((e && e.message) || e) + '\n' + ((e && e.stack) || '')); }
    }
    // registrations made while firing did not arm, since we were still armed.
    if (__rafCallbacks.size > 0 || __rafFinalizers.length > 0) __rafArm();
  };

  // queueMicrotask via Promise (JavaScriptCore drains microtasks after each Rust loop tick).
  if (typeof g.queueMicrotask !== 'function') {
    g.queueMicrotask = function (cb) { Promise.resolve().then(cb); };
  }

  function abortError() {
    var e = new Error('The operation was aborted');
    e.name = 'AbortError';
    return e;
  }
  if (typeof g.AbortController !== 'function') {
    function AbortSignal() {
      this.aborted = false;
      this.reason = undefined;
      this._listeners = [];
    }
    AbortSignal.prototype.addEventListener = function (type, cb, options) {
      if (type !== 'abort' || typeof cb !== 'function') return;
      this._listeners.push({ cb: cb, once: !!(options && options.once) });
    };
    AbortSignal.prototype.removeEventListener = function (type, cb) {
      if (type !== 'abort') return;
      this._listeners = this._listeners.filter(function (item) { return item.cb !== cb; });
    };
    AbortSignal.prototype._abort = function (reason) {
      if (this.aborted) return;
      this.aborted = true;
      this.reason = reason || abortError();
      var listeners = this._listeners.slice();
      this._listeners = listeners.filter(function (item) { return !item.once; });
      for (var i = 0; i < listeners.length; i++) {
        try { listeners[i].cb.call(this, { type: 'abort', target: this }); } catch (e) { g.__rngpui_log('error: abort listener threw ' + ((e && e.stack) || e)); }
      }
    };
    function AbortController() {
      this.signal = new AbortSignal();
    }
    AbortController.prototype.abort = function (reason) {
      this.signal._abort(reason);
    };
    g.AbortSignal = AbortSignal;
    g.AbortController = AbortController;
  }

  // fetch — bridged to the Rust host (ureq) on a worker thread. The Response carries the
  // status line, final url, every response header, and the body as text or bytes.
  var fetchSeq = 1;
  var fetchPending = Object.create(null);
  function collectRequestHeaders(source) {
    var headers = {};
    if (!source) return headers;
    function add(name, value) {
      name = String(name);
      value = String(value);
      var repeated = Object.prototype.hasOwnProperty.call(headers, name);
      headers[name] = repeated ? headers[name] + ', ' + value : value;
    }
    if (Array.isArray(source)) {
      for (var i = 0; i < source.length; i++) {
        if (source[i] && source[i].length >= 2) add(source[i][0], source[i][1]);
      }
    } else if (typeof source.forEach === 'function') {
      source.forEach(function (value, name) { add(name, value); });
    } else {
      for (var name in source) {
        if (Object.prototype.hasOwnProperty.call(source, name)) add(name, source[name]);
      }
    }
    return headers;
  }
  function hasHeader(headers, wanted) {
    for (var name in headers) {
      if (name.toLowerCase() === wanted) return true;
    }
    return false;
  }
  g.fetch = function (url, init) {
    init = init || {};
    var signal = init.signal;
    if (signal && signal.aborted) return Promise.reject(signal.reason || abortError());
    var id = fetchSeq++;
    var requestUrl = String(url);
    var headers = collectRequestHeaders(init.headers);
    return new Promise(function (resolve, reject) {
      var onAbort = function () {
        var p = fetchPending[id];
        if (!p) return;
        delete fetchPending[id];
        reject((signal && signal.reason) || abortError());
      };
      fetchPending[id] = { resolve: resolve, reject: reject, signal: signal, onAbort: onAbort, url: requestUrl };
      if (signal && typeof signal.addEventListener === 'function') signal.addEventListener('abort', onAbort, { once: true });
      // binary bodies (ArrayBuffer and its views) ride bodyBase64 so bytes survive the
      // string bridge; everything else stringifies.
      var body = null;
      var bodyBase64 = null;
      var source = init.body;
      if (source != null) {
        if (source instanceof ArrayBuffer) {
          bodyBase64 = g.__rngpui_bytesToBase64(new Uint8Array(source));
        } else if (ArrayBuffer.isView(source)) {
          bodyBase64 = g.__rngpui_bytesToBase64(new Uint8Array(source.buffer, source.byteOffset, source.byteLength));
        } else {
          var formBody = typeof g.URLSearchParams === 'function' && source instanceof g.URLSearchParams;
          if (formBody && !hasHeader(headers, 'content-type')) {
            headers['Content-Type'] = 'application/x-www-form-urlencoded;charset=UTF-8';
          }
          body = String(source);
        }
      }
      g.__rngpui_fetch(JSON.stringify({
        id: id,
        url: requestUrl,
        method: init.method || 'GET',
        headers: headers,
        body: body,
        bodyBase64: bodyBase64,
      }));
    });
  };

  // shared bytes→base64 (used by fetch binary bodies + binary WS frames). reuses the btoa
  // table below.
  g.__rngpui_bytesToBase64 = function (input) {
    var bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return g.btoa(bin);
  };
  // base64→Uint8Array (inbound binary WS frames). atob yields a binary string.
  g.__rngpui_base64ToBytes = function (b64) {
    var bin = g.atob(String(b64));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i) & 0xff;
    return bytes;
  };
  function makeResponse(r, requestUrl) {
    var headers = new Headers();
    var pairs = r.headers || [];
    for (var i = 0; i < pairs.length; i++) headers.append(pairs[i][0], pairs[i][1]);
    var binary = r.bodyBase64 != null;
    var text = null;
    var bytes = null;
    if (binary) bytes = g.__rngpui_base64ToBytes(r.bodyBase64);
    else text = r.body == null ? '' : String(r.body);
    function bodyText() {
      if (text === null) text = new g.TextDecoder().decode(bytes);
      return text;
    }
    function bodyBytes() {
      if (bytes === null) bytes = new g.TextEncoder().encode(text);
      return bytes;
    }
    var response = {
      ok: !!r.ok,
      status: r.status | 0,
      statusText: r.statusText || '',
      url: r.url || requestUrl,
      redirected: !!r.redirected,
      type: 'basic',
      headers: headers,
      bodyUsed: false,
      text: function () {
        response.bodyUsed = true;
        return Promise.resolve(bodyText());
      },
      json: function () {
        response.bodyUsed = true;
        try { return Promise.resolve(JSON.parse(bodyText())); } catch (e) { return Promise.reject(e); }
      },
      arrayBuffer: function () {
        response.bodyUsed = true;
        var view = bodyBytes();
        return Promise.resolve(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength));
      },
      clone: function () { return makeResponse(r, requestUrl); },
    };
    return response;
  }
  g.__rngpui_fetchDone = function (jsonStr) {
    var r = JSON.parse(jsonStr);
    var p = fetchPending[r.id];
    if (!p) return;
    delete fetchPending[r.id];
    if (p.signal && typeof p.signal.removeEventListener === 'function') p.signal.removeEventListener('abort', p.onAbort);
    if (r.error != null) { p.reject(new TypeError(r.error)); return; }
    p.resolve(makeResponse(r, p.url));
  };

  var platformSeq = 1;
  var platformPending = Object.create(null);
  g.__rngpui_platformRequest = function (op, args) {
    if (typeof g.__rngpui_platformCall !== 'function') {
      return Promise.reject(new Error('the native platform host is not available'));
    }
    var id = platformSeq++;
    return new Promise(function (resolve, reject) {
      platformPending[id] = { resolve: resolve, reject: reject };
      try {
        g.__rngpui_platformCall(JSON.stringify({ id: id, op: String(op), args: args == null ? null : args }));
      } catch (e) {
        delete platformPending[id];
        reject(e);
      }
    });
  };
  g.__rngpui_platformDone = function (jsonStr) {
    var r;
    try { r = JSON.parse(jsonStr); } catch (e) { return; }
    var p = platformPending[r.id];
    if (!p) return;
    delete platformPending[r.id];
    if (r.ok) p.resolve(r.value);
    else p.reject(new Error(r.error || 'platform call failed'));
  };

  // mic capture — bridged to the Rust cpal recorder (audio.rs). start/stop/cancel are
  // posted with an id; __rngpui_audioDone resolves the matching promise. a ~10Hz RMS
  // meter arrives via __rngpui_audioLevel and fans out to registered listeners.
  var audioSeq = 1;
  var audioPending = Object.create(null);
  var audioLevelListeners = [];
  g.__rngpui_audioStart = function () {
    if (typeof g.__rngpui_audio !== 'function') return Promise.reject(new Error('native mic host is not available'));
    var id = audioSeq++;
    return new Promise(function (resolve, reject) {
      audioPending[id] = { resolve: resolve, reject: reject };
      g.__rngpui_audio(JSON.stringify({ op: 'start', id: id }));
    });
  };
  g.__rngpui_audioStop = function () {
    if (typeof g.__rngpui_audio !== 'function') return Promise.reject(new Error('native mic host is not available'));
    var id = audioSeq++;
    return new Promise(function (resolve, reject) {
      audioPending[id] = { resolve: resolve, reject: reject };
      g.__rngpui_audio(JSON.stringify({ op: 'stop', id: id }));
    });
  };
  g.__rngpui_audioCancel = function () {
    if (typeof g.__rngpui_audio === 'function') g.__rngpui_audio(JSON.stringify({ op: 'cancel' }));
  };
  g.__rngpui_audioOnLevel = function (cb) {
    audioLevelListeners.push(cb);
    return function () {
      var i = audioLevelListeners.indexOf(cb);
      if (i >= 0) audioLevelListeners.splice(i, 1);
    };
  };
  g.__rngpui_audioDone = function (jsonStr) {
    var r = JSON.parse(jsonStr);
    var p = audioPending[r.id];
    if (!p) return;
    delete audioPending[r.id];
    if (r.error != null) { p.reject(new Error(r.error)); return; }
    p.resolve(r);
  };
  g.__rngpui_audioLevel = function (jsonStr) {
    var r;
    try { r = JSON.parse(jsonStr); } catch (e) { return; }
    var list = audioLevelListeners.slice();
    for (var i = 0; i < list.length; i++) {
      try { list[i](r.level); } catch (e) { g.__rngpui_log('error: audio level listener threw ' + ((e && e.stack) || e)); }
    }
  };

  // WebSocket — one Rust worker per connection; events arrive via __rngpui_wsEvent.
  var wsSeq = 1;
  var wsConns = Object.create(null);
  function WS(url, protocols) {
    this._id = wsSeq++;
    this.url = String(url);
    this.readyState = 0; // CONNECTING
    // 'arraybuffer' | 'blob' — what an inbound binary frame is delivered as. JavaScriptCore has no
    // Blob, so we hand back an ArrayBuffer regardless; default matches the browser default.
    this.binaryType = 'blob';
    this.onopen = null; this.onmessage = null; this.onclose = null; this.onerror = null;
    this._listeners = { open: [], message: [], close: [], error: [] };
    wsConns[this._id] = this;
    // Browsers accept either a single string or an array of strings for the
    // second WS arg, and send them as the Sec-WebSocket-Protocol header.
    // Zero uses this to smuggle its auth token, so the host worker MUST
    // forward the list — see ws_thread in jsc.rs.
    var protoList = null;
    if (typeof protocols === 'string') protoList = [protocols];
    else if (Array.isArray(protocols)) protoList = protocols.map(String);
    g.__rngpui_wsOpen(JSON.stringify({ id: this._id, url: this.url, protocols: protoList }));
  }
  WS.CONNECTING = 0; WS.OPEN = 1; WS.CLOSING = 2; WS.CLOSED = 3;
  WS.prototype.addEventListener = function (type, cb) { if (this._listeners[type]) this._listeners[type].push(cb); };
  WS.prototype.removeEventListener = function (type, cb) {
    var l = this._listeners[type]; if (!l) return;
    var i = l.indexOf(cb); if (i >= 0) l.splice(i, 1);
  };
  WS.prototype._emit = function (type, evt) {
    var on = this['on' + type]; if (typeof on === 'function') on.call(this, evt);
    var l = this._listeners[type] || [];
    for (var i = 0; i < l.length; i++) l[i].call(this, evt);
  };
  WS.prototype.send = function (data) {
    if (this.readyState !== 1) return;
    // binary frames (ArrayBuffer / typed-array / DataView) must NOT be String()'d — that
    // yields "[object ArrayBuffer]" and corrupts the payload. base64-encode the bytes and
    // flag the frame so the Rust side decodes + sends a real binary frame.
    if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
      var bytes = data instanceof ArrayBuffer
        ? new Uint8Array(data)
        : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      g.__rngpui_wsSend(JSON.stringify([this._id, g.__rngpui_bytesToBase64(bytes), true]));
    } else {
      g.__rngpui_wsSend(JSON.stringify([this._id, String(data), false]));
    }
  };
  WS.prototype.close = function () {
    if (this.readyState === 3 || this.readyState === 2) return;
    this.readyState = 2;
    g.__rngpui_wsClose(JSON.stringify([this._id]));
  };
  g.WebSocket = WS;
  g.__rngpui_wsEvent = function (jsonStr) {
    var e = JSON.parse(jsonStr);
    var ws = wsConns[e.id];
    if (!ws) return;
    if (e.type === 'open') { ws.readyState = 1; ws._emit('open', { type: 'open' }); }
    else if (e.type === 'message') {
      // an inbound binary frame arrives base64-encoded (Rust ws_thread encodes it); decode
      // to an ArrayBuffer so the consumer sees real bytes, not a base64 string. (binaryType
      // 'blob' has no Blob in JavaScriptCore, so we deliver an ArrayBuffer in both modes.)
      var data = e.binary ? g.__rngpui_base64ToBytes(e.data).buffer : e.data;
      ws._emit('message', { type: 'message', data: data });
    }
    else if (e.type === 'close') {
      ws.readyState = 3; delete wsConns[e.id];
      ws._emit('close', { type: 'close', code: e.code || 1000, reason: e.reason || '', wasClean: (e.code || 1000) === 1000 });
    }
  };

  // ── web globals JavaScriptCore doesn't ship (the app + RN APIs expect them) ─────────
  // Headers (used by the team-machine REST client — `new Headers()` per request).
  function Headers(init) {
    this._m = Object.create(null);
    if (init) {
      if (init instanceof Headers) { for (var k in init._m) this._m[k] = init._m[k]; }
      else if (Array.isArray(init)) { for (var i = 0; i < init.length; i++) this.append(init[i][0], init[i][1]); }
      else if (typeof init.forEach === 'function') { var s = this; init.forEach(function (v, k) { s.append(k, v); }); }
      else { for (var k2 in init) this.set(k2, init[k2]); }
    }
  }
  Headers.prototype.set = function (k, v) { this._m[String(k).toLowerCase()] = String(v); };
  Headers.prototype.get = function (k) { var v = this._m[String(k).toLowerCase()]; return v == null ? null : v; };
  Headers.prototype.has = function (k) { return Object.prototype.hasOwnProperty.call(this._m, String(k).toLowerCase()); };
  Headers.prototype.append = function (k, v) { var e = this.get(k); this.set(k, e != null ? e + ', ' + v : v); };
  Headers.prototype['delete'] = function (k) { delete this._m[String(k).toLowerCase()]; };
  Headers.prototype._names = function () { return Object.keys(this._m).sort(); };
  Headers.prototype.forEach = function (cb, thisArg) {
    var names = this._names();
    for (var i = 0; i < names.length; i++) cb.call(thisArg, this._m[names[i]], names[i], this);
  };
  Headers.prototype.entries = function () {
    var m = this._m;
    return this._names().map(function (name) { return [name, m[name]]; })[Symbol.iterator]();
  };
  Headers.prototype.keys = function () { return this._names()[Symbol.iterator](); };
  Headers.prototype.values = function () {
    var m = this._m;
    return this._names().map(function (name) { return m[name]; })[Symbol.iterator]();
  };
  Headers.prototype[Symbol.iterator] = Headers.prototype.entries;
  g.Headers = Headers;

  // base64
  var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  g.btoa = function (input) {
    input = String(input); var out = ''; var i = 0;
    while (i < input.length) {
      var c1 = input.charCodeAt(i++) & 0xff, c2 = input.charCodeAt(i++), c3 = input.charCodeAt(i++);
      var h2 = isNaN(c2), h3 = isNaN(c3); c2 = c2 & 0xff; c3 = c3 & 0xff;
      var e1 = c1 >> 2, e2 = ((c1 & 3) << 4) | (c2 >> 4), e3 = ((c2 & 15) << 2) | (c3 >> 6), e4 = c3 & 63;
      out += B64[e1] + B64[e2] + (h2 ? '=' : B64[e3]) + (h2 || h3 ? '=' : B64[e4]);
    }
    return out;
  };
  g.atob = function (input) {
    var str = String(input).replace(/[=]+$/, ''); var out = ''; var bc = 0, bs = 0, i = 0, ch;
    while ((ch = str.charAt(i++))) {
      var idx = B64.indexOf(ch); if (idx === -1) continue;
      bs = bc % 4 ? bs * 64 + idx : idx;
      if (bc++ % 4) out += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6)));
    }
    return out;
  };

  // UTF-8 TextEncoder/TextDecoder (JavaScriptCore has Uint8Array).
  if (typeof g.TextEncoder === 'undefined') {
    g.TextEncoder = function () {};
    g.TextEncoder.prototype.encode = function (str) {
      str = String(str); var b = [];
      for (var i = 0; i < str.length; i++) {
        var c = str.charCodeAt(i);
        if (c < 0x80) b.push(c);
        else if (c < 0x800) b.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
        else if (c >= 0xd800 && c <= 0xdbff) {
          var c2 = str.charCodeAt(++i), cp = 0x10000 + ((c & 0x3ff) << 10) + (c2 & 0x3ff);
          b.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
        } else b.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
      }
      return new Uint8Array(b);
    };
  }
  if (typeof g.TextDecoder === 'undefined') {
    g.TextDecoder = function () {};
    g.TextDecoder.prototype.decode = function (buf) {
      var b = buf instanceof Uint8Array ? buf : new Uint8Array(buf || []); var s = '', i = 0;
      while (i < b.length) {
        var c = b[i++];
        if (c < 0x80) s += String.fromCharCode(c);
        else if (c < 0xe0) s += String.fromCharCode(((c & 0x1f) << 6) | (b[i++] & 0x3f));
        else if (c < 0xf0) s += String.fromCharCode(((c & 0x0f) << 12) | ((b[i++] & 0x3f) << 6) | (b[i++] & 0x3f));
        else { var cp = ((c & 0x07) << 18) | ((b[i++] & 0x3f) << 12) | ((b[i++] & 0x3f) << 6) | (b[i++] & 0x3f); cp -= 0x10000; s += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff)); }
      }
      return s;
    };
  }

  // localStorage, persisted through __rngpui_storageWrite (rust/src/storage.rs) when the
  // host installs it; otherwise in memory.
  var storageSeed = g.__rngpuiStorage || null;
  try { delete g.__rngpuiStorage; } catch (e) { g.__rngpuiStorage = undefined; }
  var storageWrite = typeof g.__rngpui_storageWrite === 'function' ? g.__rngpui_storageWrite : null;
  var seededPath = storageSeed && storageSeed.path;
  g.__rngpui_storageInfo = {
    persistent: !!storageWrite,
    path: storageWrite && seededPath ? String(seededPath) : null,
  };
  if (typeof g.localStorage === 'undefined') {
    var storageEntries = new Map();
    var seedData = storageSeed && storageSeed.data;
    if (seedData) {
      for (var seedKey in seedData) {
        if (Object.prototype.hasOwnProperty.call(seedData, seedKey)) storageEntries.set(seedKey, String(seedData[seedKey]));
      }
    }
    var storageKeyList = null;
    function persistStorage(op) {
      storageKeyList = null;
      if (storageWrite) storageWrite(JSON.stringify(op));
    }
    g.localStorage = {
      getItem: function (k) {
        k = String(k);
        return storageEntries.has(k) ? storageEntries.get(k) : null;
      },
      setItem: function (k, v) {
        k = String(k);
        v = String(v);
        if (storageEntries.get(k) === v) return;
        storageEntries.set(k, v);
        persistStorage(['set', k, v]);
      },
      removeItem: function (k) {
        k = String(k);
        storageEntries['delete'](k);
        persistStorage(['remove', k]);
      },
      clear: function () {
        storageEntries.clear();
        persistStorage(['clear']);
      },
      key: function (i) {
        if (!storageKeyList) storageKeyList = Array.from(storageEntries.keys());
        var k = storageKeyList[i | 0];
        return k === undefined ? null : k;
      },
      get length() { return storageEntries.size; },
    };
  }

  var randomWord = typeof g.__rngpui_random32 === 'function' ? g.__rngpui_random32 : null;
  if (randomWord) {
    var cryptoApi = g.crypto || {};
    var INTEGER_ARRAYS = ['Int8Array', 'Uint8Array', 'Uint8ClampedArray', 'Int16Array', 'Uint16Array', 'Int32Array', 'Uint32Array', 'BigInt64Array', 'BigUint64Array'];
    var MAX_RANDOM_BYTES = 65536;
    function namedError(name, message) {
      var e = new Error(message);
      e.name = name;
      return e;
    }
    function fillRandom(bytes) {
      var n = bytes.length;
      for (var i = 0; i < n; i += 4) {
        var word = randomWord('') >>> 0;
        bytes[i] = word & 0xff;
        if (i + 1 < n) bytes[i + 1] = (word >>> 8) & 0xff;
        if (i + 2 < n) bytes[i + 2] = (word >>> 16) & 0xff;
        if (i + 3 < n) bytes[i + 3] = (word >>> 24) & 0xff;
      }
    }
    if (typeof cryptoApi.getRandomValues !== 'function') {
      cryptoApi.getRandomValues = function (array) {
        var tag = ArrayBuffer.isView(array) ? Object.prototype.toString.call(array).slice(8, -1) : '';
        if (INTEGER_ARRAYS.indexOf(tag) < 0) {
          throw namedError('TypeMismatchError', "Failed to execute 'getRandomValues' on 'Crypto': The provided ArrayBufferView is not an integer array type.");
        }
        if (array.byteLength > MAX_RANDOM_BYTES) {
          throw namedError('QuotaExceededError', "Failed to execute 'getRandomValues' on 'Crypto': The ArrayBufferView's byte length (" + array.byteLength + ') exceeds the number of bytes of entropy available via this API (65536).');
        }
        fillRandom(new Uint8Array(array.buffer, array.byteOffset, array.byteLength));
        return array;
      };
    }
    if (typeof cryptoApi.randomUUID !== 'function') {
      cryptoApi.randomUUID = function () {
        var bytes = new Uint8Array(16);
        fillRandom(bytes);
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        var out = '';
        for (var i = 0; i < 16; i++) {
          out += (bytes[i] + 0x100).toString(16).slice(1);
          if (i === 3 || i === 5 || i === 7 || i === 9) out += '-';
        }
        return out;
      };
    }
    g.crypto = cryptoApi;
  }

  if (typeof g.navigator === 'undefined') {
    g.navigator = { userAgent: 'rngpui-jsc', platform: 'MacIntel', language: 'en-US', onLine: true, product: 'ReactNative' };
  }

  // URLSearchParams (basic).
  if (typeof g.URLSearchParams === 'undefined') {
    function USP(init) {
      this._p = [];
      if (typeof init === 'string') {
        init = init.replace(/^\?/, '');
        if (init) init.split('&').forEach(function (pair) {
          var kv = pair.split('='); this._p.push([decodeURIComponent(kv[0]), decodeURIComponent(kv[1] || '')]);
        }, this);
      } else if (init) { for (var k in init) this._p.push([k, String(init[k])]); }
    }
    USP.prototype.get = function (k) { for (var i = 0; i < this._p.length; i++) if (this._p[i][0] === k) return this._p[i][1]; return null; };
    USP.prototype.getAll = function (k) { return this._p.filter(function (p) { return p[0] === k; }).map(function (p) { return p[1]; }); };
    USP.prototype.has = function (k) { return this.get(k) !== null; };
    USP.prototype.set = function (k, v) { this['delete'](k); this._p.push([k, String(v)]); };
    USP.prototype.append = function (k, v) { this._p.push([k, String(v)]); };
    USP.prototype['delete'] = function (k) { this._p = this._p.filter(function (p) { return p[0] !== k; }); };
    USP.prototype.forEach = function (cb, t) { this._p.forEach(function (p) { cb.call(t, p[1], p[0], this); }, this); };
    USP.prototype.toString = function () { return this._p.map(function (p) { return encodeURIComponent(p[0]) + '=' + encodeURIComponent(p[1]); }).join('&'); };
    g.URLSearchParams = USP;
  }

  // URL — JavaScriptCore ships no URL. The @rocicorp/zero client + on-zero http-pull transport
  // parse and MUTATE URLs (read .origin/.protocol/.host/.hostname/.port/.pathname/.search/
  // .searchParams/.href/.toString; assign .protocol to rewrite ws→http). This covers the
  // forms they use: absolute http(s)/ws(s) URLs and `new URL(absPathOrAbsURL, base)`.
  // Not a full WHATWG parser (no relative-path resolution, userinfo, default-port elision),
  // which neither library needs. searchParams is live-bound to .search.
  if (typeof g.URL === 'undefined') {
    var SPECIAL_PORT = { 'http:': '80', 'https:': '443', 'ws:': '80', 'wss:': '443', 'ftp:': '21' };
    function parseAbsolute(input) {
      // scheme://host[:port][/path][?query][#hash]
      var m = /^([a-zA-Z][a-zA-Z0-9+.-]*:)\/\/([^/?#]*)([^?#]*)(\?[^#]*)?(#.*)?$/.exec(input);
      if (!m) throw new TypeError('Invalid URL: ' + input);
      var protocol = m[1].toLowerCase();
      var authority = m[2];
      var pathname = m[3] || '/';
      var search = m[4] || '';
      var hash = m[5] || '';
      var hostname = authority, port = '';
      var colon = authority.lastIndexOf(':');
      // guard against IPv6 (has multiple colons inside [...]) — keep simple: only split a
      // trailing :digits.
      var pm = /^(.*):(\d+)$/.exec(authority);
      if (pm) { hostname = pm[1]; port = pm[2]; }
      if (pathname === '') pathname = '/';
      return { protocol: protocol, hostname: hostname, port: port, pathname: pathname, search: search, hash: hash };
    }
    function URLImpl(input, base) {
      input = String(input);
      var parts;
      if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(input)) {
        parts = parseAbsolute(input);
      } else if (base != null) {
        var b = parseAbsolute(String(base));
        if (input.charAt(0) === '/') {
          // absolute-path reference against base origin
          var pm2 = /^([^?#]*)(\?[^#]*)?(#.*)?$/.exec(input);
          parts = { protocol: b.protocol, hostname: b.hostname, port: b.port, pathname: pm2[1] || '/', search: pm2[2] || '', hash: pm2[3] || '' };
        } else {
          // relative path against base pathname directory
          var pm2 = /^([^?#]*)(\?[^#]*)?(#.*)?$/.exec(input);
          var relPath = pm2[1] || '';
          var baseDir = b.pathname.substring(0, b.pathname.lastIndexOf('/') + 1);
          var fullPath = baseDir + relPath;
          var segments = fullPath.split('/');
          var resolved = [];
          for (var i = 0; i < segments.length; i++) {
            var seg = segments[i];
            if (seg === '' && i > 0 && i < segments.length - 1) continue;
            if (seg === '.') continue;
            if (seg === '..') {
              if (resolved.length > 1) resolved.pop();
            } else {
              resolved.push(seg);
            }
          }
          parts = { protocol: b.protocol, hostname: b.hostname, port: b.port, pathname: resolved.join('/') || '/', search: pm2[2] || '', hash: pm2[3] || '' };
        }
      } else {
        throw new TypeError('Invalid URL (no base): ' + input);
      }
      this._protocol = parts.protocol;
      this._hostname = parts.hostname;
      this._port = parts.port;
      this._pathname = parts.pathname;
      this._hash = parts.hash;
      this.searchParams = new g.URLSearchParams(parts.search);
    }
    function portSuffix(u) {
      // omit the port when it's the scheme's default (WHATWG origin/host semantics).
      if (!u._port) return '';
      if (SPECIAL_PORT[u._protocol] === u._port) return '';
      return ':' + u._port;
    }
    Object.defineProperties(URLImpl.prototype, {
      protocol: {
        get: function () { return this._protocol; },
        set: function (v) { v = String(v); this._protocol = v.charAt(v.length - 1) === ':' ? v.toLowerCase() : v.toLowerCase() + ':'; },
      },
      hostname: { get: function () { return this._hostname; }, set: function (v) { this._hostname = String(v); } },
      port: { get: function () { return this._port; }, set: function (v) { this._port = v == null ? '' : String(v); } },
      host: { get: function () { return this._hostname + portSuffix(this); }, set: function (v) { var pm = /^(.*):(\d+)$/.exec(String(v)); if (pm) { this._hostname = pm[1]; this._port = pm[2]; } else { this._hostname = String(v); this._port = ''; } } },
      pathname: { get: function () { return this._pathname; }, set: function (v) { v = String(v); this._pathname = v.charAt(0) === '/' ? v : '/' + v; } },
      search: {
        get: function () { var s = this.searchParams.toString(); return s ? '?' + s : ''; },
        set: function (v) { this.searchParams = new g.URLSearchParams(String(v)); },
      },
      hash: { get: function () { return this._hash; }, set: function (v) { v = String(v); this._hash = v === '' ? '' : (v.charAt(0) === '#' ? v : '#' + v); } },
      origin: { get: function () { return this._protocol + '//' + this._hostname + portSuffix(this); } },
      href: {
        get: function () { return this.origin + this._pathname + this.search + this._hash; },
        set: function (v) { URLImpl.call(this, v); },
      },
    });
    URLImpl.prototype.toString = function () { return this.href; };
    URLImpl.prototype.toJSON = function () { return this.href; };
    g.URL = URLImpl;
  }
})();
