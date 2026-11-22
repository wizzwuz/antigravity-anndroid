(function(){
/**
 * core/namespace.js - bridge.core bundle scope.
 *
 * Runs first in the bridge.core.js IIFE. Declares the shared scope every other
 * core fragment attaches to: `global`, `CONFIG`, `VERSION`, `warn`, plus the
 * idempotency guard. Window globals stay compatible with the original
 * (`window.__agBridgeCore` is the public API, `window.__AG_BRIDGE_CORE__` the
 * guard).
 */
'use strict';

var AG = (window.__agCore = window.__agCore || {});

if (window.__AG_BRIDGE_CORE__) return;
window.__AG_BRIDGE_CORE__ = true;

var global = window;
var VERSION = '1.0.0';

// Live config: filled by config.js, then kept in sync by csrf.js/endpoints.js.
var CONFIG = window.__APP_CONFIG__ || {};

function warn(where, err) {
  try {
    console.warn('[AGY bridge.core] ' + where + ':', err && err.message ? err.message : err);
  } catch (e) {}
}

/**
 * core/polyfills-process.js - window.process polyfill.
 *
 * main.js assumes an Electron-ish `process`. Provide a POSIX-shaped stub
 * without clobbering a real one.
 */
try {
  if (!window.process || typeof window.process !== 'object') window.process = {};
  var p = window.process;
  if (!p.platform) p.platform = 'linux';
  if (!p.arch) p.arch = 'arm64';
  if (!p.type) p.type = 'renderer';
  p.browser = p.browser !== undefined ? p.browser : true;
  if (!p.env || typeof p.env !== 'object') p.env = {};
  if (!p.versions || typeof p.versions !== 'object') p.versions = {};
  if (typeof p.cwd !== 'function') p.cwd = function () { return CONFIG.workspaceRoot || '/'; };
  if (typeof p.nextTick !== 'function') {
    p.nextTick = function (cb) {
      var args = Array.prototype.slice.call(arguments, 1);
      if (typeof queueMicrotask === 'function') queueMicrotask(function () { cb.apply(null, args); });
      else Promise.resolve().then(function () { cb.apply(null, args); });
    };
  }
} catch (e) { warn('process polyfill', e); }

/**
 * core/config.js - window.__APP_CONFIG__ fill.
 *
 * Fill only missing keys, then publish the merged object back and rebind
 * CONFIG so later fragments see the resolved values.
 */
var appConfig = {
  productName: 'Antigravity',
  appName: 'AGY',
  appVersion: VERSION,
  version: VERSION,
  isStandalone: true,
  platform: 'android',
  arch: 'arm64',
  enginePort: null,
  engineReady: false,
  apiPrefix: '',
  csrfToken: '',
  workspaceRoot: (CONFIG.workspaceRoot || (window.process && window.process.env && window.process.env.HOME) || '/storage/emulated/0'),
  activeCascadeId: null,
  devMode: false
};

try {
  var injected = window.__APP_CONFIG__ || {};
  for (var k in injected) {
    if (Object.prototype.hasOwnProperty.call(injected, k)) appConfig[k] = injected[k];
  }
  window.__APP_CONFIG__ = appConfig;
  CONFIG = appConfig;
} catch (e) { warn('__APP_CONFIG__', e); }

/**
 * core/csrf.js - CSRF token resolution and cookie sync.
 *
 * Sources (first hit wins): explicit global, meta tag, generated fallback.
 * Publishes `csrfToken`/`csrf_token` cookies that main.js and native read.
 */
function readCsrf() {
  try {
    if (window.__AG_CSRF__) return String(window.__AG_CSRF__);
    var m = document.querySelector('meta[name="csrf-token"], meta[name="csrfToken"]');
    if (m && m.getAttribute('content')) return m.getAttribute('content');
  } catch (e) {}
  return CONFIG.csrfToken || 'agy-standalone-token';
}

function syncCsrf() {
  var token = readCsrf();
  CONFIG.csrfToken = token;
  CONFIG.csrf_token = token;
  try {
    if (document && document.cookie !== undefined) {
      document.cookie = 'csrfToken=' + token + '; path=/; SameSite=Lax';
      document.cookie = 'csrf_token=' + token + '; path=/; SameSite=Lax';
    }
  } catch (e) {}
  return token;
}

syncCsrf();

/**
 * core/endpoints.js - endpoint discovery + core origin resolution.
 *
 * Endpoints come from window.__AG_ENDPOINTS__ or the ?endpoints= query param.
 * `baseOrigin()` prefers a full injected URL, then a bare port mapped to
 * https. Also owns the CSRF header/query helpers shared with fetch-rewrite.
 */
function parseEndpointSpec(raw) {
  var out = {};
  if (!raw) return out;
  if (typeof raw === 'object') {
    for (var k in raw) { if (Object.prototype.hasOwnProperty.call(raw, k)) out[k] = String(raw[k]); }
    return out;
  }
  var s = String(raw).trim();
  if (!s) return out;
  // base64(JSON) or raw JSON
  if (s.charAt(0) === '{') {
    try { return parseEndpointSpec(JSON.parse(s)); } catch (e) {}
  }
  if (/^[A-Za-z0-9+/=]+$/.test(s) && s.length % 4 === 0) {
    try {
      var decoded = global.atob ? global.atob(s) : '';
      if (decoded && decoded.charAt(0) === '{') return parseEndpointSpec(JSON.parse(decoded));
    } catch (e) {}
  }
  // k=v,k2=v2  or k=v&k2=v2
  s.split(/[&,]/).forEach(function (pair) {
    var i = pair.indexOf('=');
    if (i > 0) {
      var k = decodeURIComponent(pair.slice(0, i).trim());
      var v = decodeURIComponent(pair.slice(i + 1).trim());
      if (k) out[k] = v;
    }
  });
  return out;
}

var ENDPOINTS = {};
try {
  ENDPOINTS = parseEndpointSpec(global.__AG_ENDPOINTS__);
  if (global.location && global.location.search) {
    var qp = new URLSearchParams(global.location.search);
    var q = qp.get('endpoints') || qp.get('ag_endpoints');
    if (q) {
      var fromQuery = parseEndpointSpec(q);
      for (var qk in fromQuery) { if (Object.prototype.hasOwnProperty.call(fromQuery, qk)) ENDPOINTS[qk] = fromQuery[qk]; }
    }
    var port = qp.get('port') || qp.get('enginePort');
    if (port) { ENDPOINTS.core_http = 'http://127.0.0.1:' + port; ENDPOINTS.enginePort = port; }
  }
} catch (e) { warn('endpoint parse', e); }
global.__AG_ENDPOINTS__ = ENDPOINTS;

function endpoint(name) {
  if (!name) return null;
  if (ENDPOINTS[name]) return ENDPOINTS[name];
  if (name === 'core' || name === 'core_http' || name === 'engine') return baseOrigin();
  return null;
}

function setEndpoint(name, value) {
  if (!name || value === undefined || value === null) return;
  ENDPOINTS[name] = String(value);
  global.__AG_ENDPOINTS__ = ENDPOINTS;
  return ENDPOINTS[name];
}

// The base origin of the core server. Prefer full injected URLs (the core
// serves ConnectRPC over TLS) over a bare port, which must map to https.
function baseOrigin() {
  if (CONFIG.engineBaseUrl) return String(CONFIG.engineBaseUrl).replace(/\/$/, '');
  if (ENDPOINTS.core) return String(ENDPOINTS.core).replace(/\/$/, '');
  if (ENDPOINTS.core_https) return String(ENDPOINTS.core_https).replace(/\/$/, '');
  if (CONFIG.apiPrefix) return String(CONFIG.apiPrefix).replace(/\/$/, '');
  if (ENDPOINTS.core_http) return String(ENDPOINTS.core_http).replace(/\/$/, '');
  if (CONFIG.enginePort) return 'https://127.0.0.1:' + CONFIG.enginePort;
  if (ENDPOINTS.enginePort) return 'https://127.0.0.1:' + ENDPOINTS.enginePort;
  return '';
}

function coreBase() {
  var p = (CONFIG.enginePort || ENDPOINTS.enginePort || (global.__APP_CONFIG__ && global.__APP_CONFIG__.enginePort) || (global.__AG_ENDPOINTS__ && global.__AG_ENDPOINTS__.enginePort) || 45157);
  return (baseOrigin() || ('https://127.0.0.1:' + p)).replace(/\/$/, '');
}

function ensureCsrf(headers) {
  try {
    if (headers && typeof headers.set === 'function'
        && typeof headers.has === 'function'
        && !headers.has('x-codeium-csrf-token')) {
      headers.set('x-codeium-csrf-token', syncCsrf());
    }
  } catch (e) {}
  return headers;
}

function appendCsrfQuery(url) {
  try {
    if (url.indexOf('csrf_token=') === -1) {
      url += (url.indexOf('?') === -1 ? '?' : '&')
          + 'csrf_token=' + encodeURIComponent(syncCsrf());
    }
  } catch (e) {}
  return url;
}

/**
 * core/fetch-rewrite.js - file:// WebView -> core origin fetch rewrite.
 *
 * The WebView loads from file:///android_asset/web/, so main.js builds its
 * transport from window.location.origin ("file://") and the Connect/grpc-web
 * transport then fetches e.g.
 *   file://exa.language_server_pb.languageserverservice/Method
 * which the WebView rejects: URL scheme "file" is not supported.
 *
 * Rewrite file:// or relative ConnectRPC URLs onto the core origin, preserving
 * method/headers/body and attaching the CSRF token. Idempotent and a no-op for
 * non-RPC / already-absolute http(s) URLs.
 *
 * The original periodic HEAD ping is not ported (it referenced an undefined
 * helper; see docs/DEADCODE.md).
 */
var RPC_MARKERS = ['exa.language_server_pb.', 'exa.host_bridge_pb.', '/exa.'];

// RPC path (no leading slash) when `url` is a file:// or relative ConnectRPC
// URL; null for anything else (http(s), blob, data, static assets).
function rpcPathFrom(url) {
  if (!url) return null;
  var s = String(url);
  if (/^(https?|blob|data|wss?|chrome-extension):/i.test(s)) return null;
  var best = -1;
  for (var i = 0; i < RPC_MARKERS.length; i++) {
    var at = s.indexOf(RPC_MARKERS[i]);
    if (at >= 0 && (best === -1 || at < best)) best = at;
  }
  if (best === -1) return null;
  return s.slice(best).replace(/^\/+/, '') || null;
}

function installFetchRewrite() {
  if (global.__AG_FETCH_REWRITE__ || typeof global.fetch !== 'function') return;
  var origFetch = global.fetch.bind(global);

  function fetchWithStartupRetry(u, opts, retries) {
    return origFetch(u, opts).catch(function (err) {
      if (retries > 0) {
        return new Promise(function (resolve) {
          setTimeout(function () {
            resolve(fetchWithStartupRetry(u, opts, retries - 1));
          }, 120);
        });
      }
      throw err;
    });
  }

  global.fetch = function (resource, init) {
    try {
      // Request object: rebuild against the core origin, keep method/body.
      if (resource && typeof resource === 'object' && typeof resource.url === 'string') {
        var rpath = rpcPathFrom(resource.url);
        if (rpath) {
          try {
            var targetUrl = appendCsrfQuery(coreBase() + '/' + rpath);
            var reqMethod = resource.method || (init && init.method) || 'POST';
            var reqHeaders = new Headers(resource.headers || (init && init.headers) || {});
            ensureCsrf(reqHeaders);

            var bodyPromise;
            if (init && init.body !== undefined) {
              bodyPromise = Promise.resolve(init.body);
            } else {
              try {
                bodyPromise = resource.clone().arrayBuffer().then(function (buf) {
                  return buf.byteLength > 0 ? buf : undefined;
                }).catch(function () { return undefined; });
              } catch (e) {
                bodyPromise = Promise.resolve(undefined);
              }
            }

            return bodyPromise.then(function (bodyData) {
              var nextOpts = {
                method: reqMethod,
                headers: reqHeaders,
                body: bodyData,
                credentials: 'omit'
              };
              return fetchWithStartupRetry(targetUrl, nextOpts, 30);
            });
          } catch (e) { warn('fetch rewrite (Request)', e); }
        }
        return origFetch(resource, init);
      }

      // String URL: the Connect/grpc-web transport's common path.
      if (typeof resource === 'string') {
        var path = rpcPathFrom(resource);
        if (path) {
          var url = appendCsrfQuery(coreBase() + '/' + path);
          var headers = new Headers((init && init.headers) || {});
          ensureCsrf(headers);
          var next = {};
          if (init) {
            for (var k in init) {
              if (Object.prototype.hasOwnProperty.call(init, k)) next[k] = init[k];
            }
          }
          next.headers = headers;

          return fetchWithStartupRetry(url, next, 30);
        }
      }
    } catch (e) { warn('fetch rewrite', e); }
    return origFetch(resource, init);
  };
  global.__AG_FETCH_REWRITE__ = true;
}

installFetchRewrite();

/**
 * core/polyfills-notification.js - Native Android Notification bridge & polyfill.
 * Routes window.Notification and agent completion/progress events to native Android channels:
 * 1. agent_completed_open_chat: Notification shade without a heads-up banner (when chat has focus)
 * 2. agent_completed: Floating notification / heads-up banner (when in background or needs attention)
 * 3. agent_progress: Silent progress for ongoing Antigravity tasks
 */
try {
  function dispatchNativeNotification(channel, title, message, cascadeId, ongoing, progress) {
    if (window.Android && typeof window.Android.postNotification === 'function') {
      try {
        window.Android.postNotification(channel, title || 'Antigravity', message || '', cascadeId || '', !!ongoing, progress != null ? progress : -1);
        return true;
      } catch (err) {
        console.warn('[AGY Notification] postNotification error:', err);
      }
    }
    return false;
  }

  function cancelNativeNotification(tag, id) {
    if (window.Android && typeof window.Android.cancelNotification === 'function') {
      try {
        window.Android.cancelNotification(tag || '', id || 0);
        return true;
      } catch (err) {
        console.warn('[AGY Notification] cancelNotification error:', err);
      }
    }
    return false;
  }

  // Provide window.Notification polyfill for WebView
  function PolyfillNotification(title, options) {
    options = options || {};
    this.title = title;
    this.body = options.body || '';
    this.tag = options.tag || '';
    this.silent = options.silent || false;
    this.data = options.data || {};

    var isChatOpen = typeof document !== 'undefined' && document.hasFocus && document.hasFocus();
    var defaultChannel = isChatOpen ? 'agent_completed_open_chat' : 'agent_completed';
    var channel = options.channel || options.category || defaultChannel;
    var cascadeId = options.cascadeId || (this.data && this.data.cascadeId) || '';

    dispatchNativeNotification(channel, title, this.body, cascadeId, false, -1);
  }

  PolyfillNotification.permission = 'granted';
  PolyfillNotification.requestPermission = function (callback) {
    var p = Promise.resolve('granted');
    if (typeof callback === 'function') callback('granted');
    return p;
  };

  if (typeof window !== 'undefined') {
    window.Notification = PolyfillNotification;
    window.__agyNotify = {
      post: dispatchNativeNotification,
      cancel: cancelNativeNotification
    };
    if (typeof window.__agyOpenConversation !== 'function') {
      window.__agyOpenConversation = function(cid) {
        if (typeof window.__agySwitchConvo === 'function') {
          try { window.__agySwitchConvo(cid); return; } catch (_) {}
        }
        window.__agyPendingCascadeId = cid;
        try { window.location.hash = '#/cascade/' + cid; } catch (_) {}
      };
    }
  }
} catch (e) {
  console.warn('[AGY Notification] polyfill error:', e);
}

/**
 * core/sidebar-gestures.js - Long-press gestures for Projects and Conversations in side menu.
 * 1. Holding "Projects" opens menu to create a new project or open a folder.
 * 2. Holding a conversation opens menu to add it to an existing project or create a new project.
 */
(function () {
  'use strict';

  if (typeof window === 'undefined') return;

  var LONG_PRESS_MS = 450;
  var MOVE_THRESHOLD = 12;

  var touchTimer = null;
  var startX = 0;
  var startY = 0;
  var activeTarget = null;

  function getProjectsList() {
    var projects = [];
    try {
      if (window.__agySidebarProvider && typeof window.__agySidebarProvider.getState === 'function') {
        var state = window.__agySidebarProvider.getState();
        if (state && Array.isArray(state.sidebarSections)) {
          for (var i = 0; i < state.sidebarSections.length; i++) {
            var sec = state.sidebarSections[i];
            if (sec && sec.uri && (sec.uri.startsWith('file://') || sec.sectionKind)) {
              var lbl = sec.label || sec.uri.split('/').pop() || 'Project ' + (i + 1);
              projects.push({ uri: sec.uri, label: lbl });
            }
          }
        }
      }
    } catch (_) {}

    // Fallback: collect project folders from DOM sidebar items
    if (projects.length === 0) {
      try {
        var links = document.querySelectorAll('button[data-testid*="project"], a[href*="section"]');
        for (var j = 0; j < links.length; j++) {
          var text = (links[j].textContent || '').trim();
          if (text && text !== 'Projects' && text !== 'Workspaces') {
            projects.push({ uri: 'section:' + text, label: text });
          }
        }
      } catch (_) {}
    }
    return projects;
  }

  function showModal(title, contentElem) {
    closeModal();
    var backdrop = document.createElement('div');
    backdrop.id = 'agy-gesture-backdrop';
    backdrop.style.cssText =
      'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.65);' +
      'backdrop-filter:blur(4px);z-index:999999;display:flex;align-items:center;justify-content:center;padding:16px;';

    var card = document.createElement('div');
    card.style.cssText =
      'background:#1e1e24;border:1px solid rgba(255,255,255,0.15);border-radius:16px;' +
      'width:100%;max-width:380px;box-shadow:0 20px 40px rgba(0,0,0,0.6);color:#f0f0f0;overflow:hidden;font-family:sans-serif;';

    var header = document.createElement('div');
    header.style.cssText =
      'display:flex;align-items:center;justify-content:between;padding:14px 18px;border-bottom:1px solid rgba(255,255,255,0.1);font-weight:600;font-size:15px;';
    header.innerHTML = '<span style="flex:1;">' + title + '</span>' +
      '<button id="agy-modal-close" style="background:none;border:none;color:#aaa;font-size:20px;cursor:pointer;padding:0 4px;line-height:1;">&times;</button>';

    var body = document.createElement('div');
    body.style.cssText = 'padding:14px 16px;max-height:60vh;overflow-y:auto;';
    body.appendChild(contentElem);

    card.appendChild(header);
    card.appendChild(body);
    backdrop.appendChild(card);
    document.body.appendChild(backdrop);

    document.getElementById('agy-modal-close').onclick = closeModal;
    backdrop.onclick = function (e) {
      if (e.target === backdrop) closeModal();
    };
  }

  function closeModal() {
    var el = document.getElementById('agy-gesture-backdrop');
    if (el && el.parentNode) {
      el.parentNode.removeChild(el);
    }
  }

  function showProjectsMenu() {
    var container = document.createElement('div');
    container.style.cssText = 'display:flex;flex-direction:column;gap:10px;';

    var desc = document.createElement('div');
    desc.style.cssText = 'font-size:12px;color:#999;margin-bottom:4px;';
    desc.innerText = 'Projects stored under /storage/emulated/0/Documents/';
    container.appendChild(desc);

    var createBtn = document.createElement('button');
    createBtn.style.cssText =
      'background:#2563eb;color:#fff;border:none;border-radius:10px;padding:12px 14px;' +
      'font-weight:600;font-size:14px;cursor:pointer;text-align:left;display:flex;align-items:center;gap:10px;';
    createBtn.innerHTML = '<span>➕</span><span>Create New Project</span>';
    createBtn.onclick = function () {
      promptCreateProject();
    };
    container.appendChild(createBtn);

    var openBtn = document.createElement('button');
    openBtn.style.cssText =
      'background:rgba(255,255,255,0.08);color:#eee;border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:12px 14px;' +
      'font-size:14px;cursor:pointer;text-align:left;display:flex;align-items:center;gap:10px;';
    openBtn.innerHTML = '<span>📁</span><span>Open Existing Folder</span>';
    openBtn.onclick = function () {
      closeModal();
      if (window.Android && typeof window.Android.openDirectoryPicker === 'function') {
        window.Android.openDirectoryPicker();
      } else {
        var addBtn = document.querySelector('button[aria-label*="Add Workspace"], button[aria-label*="Create New Project"]');
        if (addBtn) addBtn.click();
      }
    };
    container.appendChild(openBtn);

    showModal('Projects', container);
  }

  function promptCreateProject(onSuccess) {
    var container = document.createElement('div');
    container.style.cssText = 'display:flex;flex-direction:column;gap:12px;';

    var label = document.createElement('label');
    label.style.cssText = 'font-size:13px;color:#ccc;';
    label.innerText = 'Project Name:';

    var input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'e.g. MyAwesomeApp';
    input.style.cssText =
      'background:#121215;border:1px solid rgba(255,255,255,0.2);border-radius:8px;padding:10px;color:#fff;font-size:14px;outline:none;';

    var submitBtn = document.createElement('button');
    submitBtn.style.cssText =
      'background:#2563eb;color:#fff;border:none;border-radius:8px;padding:10px;font-weight:600;font-size:14px;cursor:pointer;';
    submitBtn.innerText = 'Create Project';

    submitBtn.onclick = function () {
      var name = input.value.trim();
      if (!name) return;
      var safeName = name.replace(/[^a-zA-Z0-9_.-]/g, '_');
      var path = '/storage/emulated/0/Documents/' + safeName;
      if (window.Android && typeof window.Android.createProjectFolder === 'function') {
        var created = window.Android.createProjectFolder(safeName);
        if (created) path = created;
      }
      var uri = 'file://' + path;

      if (window.__agySidebarProvider && typeof window.__agySidebarProvider.pushUpdate === 'function') {
        try {
          window.__agySidebarProvider.pushUpdate({ type: 'add', workspaceUri: uri });
        } catch (_) {}
      }

      if (typeof window.__agySwitchSection === 'function') {
        try { window.__agySwitchSection(uri); } catch (_) {}
      }

      closeModal();
      if (typeof onSuccess === 'function') {
        onSuccess(uri, safeName);
      }
    };

    container.appendChild(label);
    container.appendChild(input);
    container.appendChild(submitBtn);

    showModal('Create Project', container);
    setTimeout(function () { input.focus(); }, 100);
  }

  function showConversationActionsMenu(cascadeId, convoTitle) {
    var container = document.createElement('div');
    container.style.cssText = 'display:flex;flex-direction:column;gap:10px;';

    var projects = getProjectsList();

    // 1. Add to existing project
    var addExistBtn = document.createElement('button');
    addExistBtn.style.cssText =
      'background:rgba(255,255,255,0.08);color:#eee;border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:12px 14px;' +
      'font-size:14px;cursor:pointer;text-align:left;display:flex;align-items:center;gap:10px;';
    addExistBtn.innerHTML = '<span>📁</span><span>Add to Existing Project (' + projects.length + ')</span>';
    addExistBtn.onclick = function () {
      if (projects.length === 0) {
        promptCreateProject(function (uri, name) {
          assignConversationToProject(cascadeId, uri);
        });
        return;
      }
      showProjectPickerMenu(cascadeId, projects);
    };
    container.appendChild(addExistBtn);

    // 2. Create new project and add
    var createAndAddBtn = document.createElement('button');
    createAndAddBtn.style.cssText =
      'background:#2563eb;color:#fff;border:none;border-radius:10px;padding:12px 14px;' +
      'font-size:14px;cursor:pointer;text-align:left;display:flex;align-items:center;gap:10px;';
    createAndAddBtn.innerHTML = '<span>➕</span><span>Create New Project & Add</span>';
    createAndAddBtn.onclick = function () {
      promptCreateProject(function (uri, name) {
        assignConversationToProject(cascadeId, uri);
      });
    };
    container.appendChild(createAndAddBtn);

    showModal(convoTitle || 'Conversation Actions', container);
  }

  function showProjectPickerMenu(cascadeId, projects) {
    var container = document.createElement('div');
    container.style.cssText = 'display:flex;flex-direction:column;gap:8px;';

    for (var i = 0; i < projects.length; i++) {
      (function (proj) {
        var btn = document.createElement('button');
        btn.style.cssText =
          'background:rgba(255,255,255,0.06);color:#f0f0f0;border:1px solid rgba(255,255,255,0.08);border-radius:8px;' +
          'padding:10px 12px;font-size:13px;cursor:pointer;text-align:left;display:flex;align-items:center;gap:8px;';
        btn.innerHTML = '<span>📁</span><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' +
          proj.label + '</span>';
        btn.onclick = function () {
          assignConversationToProject(cascadeId, proj.uri);
          closeModal();
        };
        container.appendChild(btn);
      })(projects[i]);
    }

    showModal('Select Project', container);
  }

  function assignConversationToProject(cascadeId, projectUri) {
    try {
      if (window.__agySidebarProvider && typeof window.__agySidebarProvider.pushUpdate === 'function') {
        window.__agySidebarProvider.pushUpdate({
          type: 'addConversation',
          sectionUri: projectUri,
          conversationId: cascadeId
        });
      }
      try {
        localStorage.setItem('agy_convo_project_' + cascadeId, projectUri);
      } catch (_) {}
      if (typeof window.__agySwitchSection === 'function') {
        window.__agySwitchSection(projectUri);
      }
    } catch (e) {
      console.warn('[AGY] assignConversationToProject failed:', e);
    }
  }

  function findConversationInfo(elem) {
    var curr = elem;
    while (curr && curr !== document.body) {
      if (curr.getAttribute) {
        var cid = curr.getAttribute('data-cascade-id');
        if (cid) return { id: cid, title: (curr.textContent || '').trim() };
        var href = curr.getAttribute('href') || '';
        if (href.indexOf('/cascade/') !== -1) {
          cid = href.split('/cascade/').pop().split(/[?#]/)[0];
          return { id: cid, title: (curr.textContent || '').trim() };
        }
      }
      curr = curr.parentElement;
    }
    return null;
  }

  function isProjectsHeader(elem) {
    var curr = elem;
    for (var i = 0; i < 4 && curr; i++) {
      var txt = (curr.textContent || '').trim();
      var tid = curr.getAttribute ? curr.getAttribute('data-testid') : null;
      if (txt === 'Projects' || txt === 'Workspaces' || (tid && tid.indexOf('project') !== -1 && tid.indexOf('header') !== -1)) {
        return true;
      }
      curr = curr.parentElement;
    }
    return false;
  }

  function handleTouchStart(e) {
    if (!e.touches || e.touches.length !== 1) return;
    var touch = e.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    activeTarget = e.target;

    clearTimeout(touchTimer);
    touchTimer = setTimeout(function () {
      if (!activeTarget) return;

      if (isProjectsHeader(activeTarget)) {
        if (navigator.vibrate) try { navigator.vibrate(30); } catch (_) {}
        showProjectsMenu();
        clearTimeout(touchTimer);
        touchTimer = null;
        return;
      }

      var convo = findConversationInfo(activeTarget);
      if (convo && convo.id) {
        if (navigator.vibrate) try { navigator.vibrate(30); } catch (_) {}
        showConversationActionsMenu(convo.id, convo.title);
        clearTimeout(touchTimer);
        touchTimer = null;
      }
    }, LONG_PRESS_MS);
  }

  function handleTouchMove(e) {
    if (!touchTimer || !e.touches || e.touches.length !== 1) return;
    var touch = e.touches[0];
    var dx = Math.abs(touch.clientX - startX);
    var dy = Math.abs(touch.clientY - startY);
    if (dx > MOVE_THRESHOLD || dy > MOVE_THRESHOLD) {
      clearTimeout(touchTimer);
      touchTimer = null;
    }
  }

  function handleTouchEnd() {
    clearTimeout(touchTimer);
    touchTimer = null;
    activeTarget = null;
  }

  document.addEventListener('touchstart', handleTouchStart, { passive: true });
  document.addEventListener('touchmove', handleTouchMove, { passive: true });
  document.addEventListener('touchend', handleTouchEnd, { passive: true });
  document.addEventListener('touchcancel', handleTouchEnd, { passive: true });

  // Context menu fallback for long-press
  document.addEventListener('contextmenu', function (e) {
    if (isProjectsHeader(e.target)) {
      e.preventDefault();
      showProjectsMenu();
      return;
    }
    var convo = findConversationInfo(e.target);
    if (convo && convo.id) {
      e.preventDefault();
      showConversationActionsMenu(convo.id, convo.title);
    }
  });

  window.__agyShowProjectsMenu = showProjectsMenu;
  window.__agyShowConversationActions = showConversationActionsMenu;
})();

/**
 * core/sync-engine.js - Cross-device conversation sync via GitHub REST API.
 * 
 * Supports two-way conversation synchronization using personal GitHub repositories:
 * - Reads/writes compressed conversation archives (sync/sync_bundle.zip)
 * - Tracks connected devices and last sync timestamps (devices/{deviceId}.json)
 * - Dispatches 'agy:sync-progress' events with completion percentages (0-100%)
 * 
 * Strictly zero hardcoded tokens or repos: credentials are read exclusively
 * from user-configured local storage.
 */
(function() {
  if (typeof window === 'undefined') return;

  function getSyncConfig() {
    var devName = (localStorage.getItem('agy_device_name') || '').trim();
    if (!devName && window.Android && typeof window.Android.getDeviceName === 'function') {
      try { devName = window.Android.getDeviceName(); } catch (_) {}
    }
    if (!devName) devName = 'Android Device';

    var devId = (localStorage.getItem('agy_device_id') || '').trim();
    if (!devId && window.Android && typeof window.Android.getDeviceId === 'function') {
      try { devId = window.Android.getDeviceId(); } catch (_) {}
    }
    if (!devId) {
      devId = 'dev_' + Math.random().toString(36).substring(2, 10);
      try { localStorage.setItem('agy_device_id', devId); } catch (_) {}
    }

    return {
      token: (localStorage.getItem('agy_sync_token') || '').trim(),
      repo: (localStorage.getItem('agy_sync_repo') || '').trim(),
      branch: (localStorage.getItem('agy_sync_branch') || 'Antigravity').trim(),
      deviceName: devName,
      deviceId: devId
    };
  }

  function saveSyncConfig(token, repo, branch, deviceName) {
    try {
      if (token !== undefined) localStorage.setItem('agy_sync_token', (token || '').trim());
      if (repo !== undefined) localStorage.setItem('agy_sync_repo', (repo || '').trim());
      if (branch !== undefined) localStorage.setItem('agy_sync_branch', (branch || 'Antigravity').trim());
      if (deviceName !== undefined) localStorage.setItem('agy_device_name', (deviceName || '').trim());
    } catch (e) {
      console.warn('[AGY Sync] saveSyncConfig error:', e);
    }
  }

  function reportProgress(pct) {
    window.__agySyncPercent = pct != null ? pct : '';
    try {
      window.dispatchEvent(new CustomEvent('agy:sync-progress', { detail: pct }));
    } catch (_) {}
  }

  async function githubRequest(cfg, path, options) {
    options = options || {};
    var url = 'https://api.github.com/repos/' + cfg.repo + '/' + path;
    var headers = {
      'Authorization': 'token ' + cfg.token,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    };
    if (options.headers) {
      for (var k in options.headers) headers[k] = options.headers[k];
    }
    var res = await fetch(url, {
      method: options.method || 'GET',
      headers: headers,
      body: options.body ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)) : undefined
    });
    return res;
  }

  async function getFileSha(cfg, filePath) {
    try {
      var res = await githubRequest(cfg, 'contents/' + filePath + '?ref=' + encodeURIComponent(cfg.branch));
      if (res.ok) {
        var data = await res.json();
        return data.sha || null;
      }
    } catch (_) {}
    return null;
  }

  async function putFile(cfg, filePath, base64Content, message) {
    var sha = await getFileSha(cfg, filePath);
    var body = {
      message: message || ('Sync ' + filePath + ' from ' + cfg.deviceName),
      content: base64Content,
      branch: cfg.branch
    };
    if (sha) body.sha = sha;

    var res = await githubRequest(cfg, 'contents/' + filePath, {
      method: 'PUT',
      body: body
    });
    if (!res.ok) {
      var errText = await res.text();
      throw new Error('Failed to upload ' + filePath + ': HTTP ' + res.status + ' - ' + errText);
    }
    return await res.json();
  }

  async function getConnectedDevices() {
    var cfg = getSyncConfig();
    if (!cfg.token || !cfg.repo) return [];
    try {
      var res = await githubRequest(cfg, 'contents/devices?ref=' + encodeURIComponent(cfg.branch));
      if (!res.ok) return [];
      var items = await res.json();
      if (!Array.isArray(items)) return [];
      var devices = [];
      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        if (item.name && item.name.endsWith('.json') && item.download_url) {
          try {
            var devRes = await fetch(item.download_url, {
              headers: { 'Authorization': 'token ' + cfg.token }
            });
            if (devRes.ok) {
              var dev = await devRes.json();
              devices.push(dev);
            }
          } catch (_) {}
        }
      }
      return devices;
    } catch (e) {
      console.warn('[AGY Sync] getConnectedDevices error:', e);
      return [];
    }
  }

  async function syncConversations(onProgress) {
    var cfg = getSyncConfig();
    if (!cfg.token || !cfg.repo) {
      throw new Error('GitHub Sync not configured. Please add your GitHub Token and Repo in Settings -> Sync.');
    }

    function update(pct, message) {
      reportProgress(pct);
      if (typeof onProgress === 'function') onProgress(pct, message);
    }

    update(10, 'Connecting to GitHub repository...');
    var branchRes = await githubRequest(cfg, 'branches/' + encodeURIComponent(cfg.branch));
    if (!branchRes.ok) {
      throw new Error('Branch ' + cfg.branch + ' not found or token lacks access (HTTP ' + branchRes.status + ')');
    }

    update(25, 'Updating device heartbeat...');
    var devPayload = {
      id: cfg.deviceId,
      name: cfg.deviceName,
      platform: 'Android',
      lastSync: new Date().toISOString()
    };
    var devJsonBase64 = btoa(unescape(encodeURIComponent(JSON.stringify(devPayload, null, 2))));
    await putFile(cfg, 'devices/' + cfg.deviceId + '.json', devJsonBase64, 'Update device heartbeat: ' + cfg.deviceName);

    update(45, 'Checking remote conversations...');
    var remoteBundleRes = await githubRequest(cfg, 'contents/sync/sync_bundle.zip?ref=' + encodeURIComponent(cfg.branch));
    if (remoteBundleRes.ok) {
      update(60, 'Downloading remote conversations...');
      var bundleData = await remoteBundleRes.json();
      var base64Content = bundleData.content;
      if (base64Content && window.Android && typeof window.Android.applySyncArchiveBase64 === 'function') {
        base64Content = base64Content.replace(/\s+/g, '');
        window.Android.applySyncArchiveBase64(base64Content);
      }
    }

    update(75, 'Exporting local conversations...');
    if (window.Android && typeof window.Android.createSyncArchiveBase64 === 'function') {
      var localZipBase64 = window.Android.createSyncArchiveBase64();
      if (localZipBase64 && localZipBase64.length > 0) {
        update(88, 'Uploading conversations to GitHub...');
        await putFile(cfg, 'sync/sync_bundle.zip', localZipBase64, 'Sync conversation package from ' + cfg.deviceName);

        var manifestPayload = {
          updatedAt: new Date().toISOString(),
          updatedByDeviceId: cfg.deviceId,
          updatedByDeviceName: cfg.deviceName
        };
        var manifestBase64 = btoa(unescape(encodeURIComponent(JSON.stringify(manifestPayload, null, 2))));
        await putFile(cfg, 'sync/manifest.json', manifestBase64, 'Update sync manifest from ' + cfg.deviceName);
      }
    }

    update(100, 'Sync completed successfully!');
    setTimeout(function() {
      reportProgress(null);
    }, 2500);

    return true;
  }

  function triggerQuickSync() {
    var cfg = getSyncConfig();
    if (!cfg.token || !cfg.repo) {
      if (window.Android && typeof window.Android.postNotification === 'function') {
        window.Android.postNotification('agent_completed', 'Sync Not Configured', 'Please enter your GitHub Token and Repo in Settings -> Sync', '', false, -1);
      } else {
        alert('Please configure GitHub Token and Repo in Settings -> Sync.');
      }
      try {
        window.location.hash = '#/settings';
      } catch (_) {}
      return;
    }

    syncConversations(function(pct, msg) {
      console.log('[AGY QuickSync] ' + pct + '% - ' + msg);
    }).catch(function(err) {
      console.error('[AGY QuickSync] Error:', err);
      reportProgress(null);
      if (window.Android && typeof window.Android.postNotification === 'function') {
        window.Android.postNotification('agent_completed', 'Sync Failed', err.message || 'Unknown sync error', '', false, -1);
      } else {
        alert('Sync error: ' + (err.message || err));
      }
    });
  }

  window.__agySyncEngine = {
    getConfig: getSyncConfig,
    saveConfig: saveSyncConfig,
    sync: syncConversations,
    getConnectedDevices: getConnectedDevices,
    quickSync: triggerQuickSync
  };

  window.agySyncEngine = window.__agySyncEngine;
  window.__agyTriggerQuickSync = triggerQuickSync;
})();

/**
 * core/backup-bridge.js - mounts the native "Backup & Restore" section inside
 * Settings -> Application (#agy-settings-backup-section) directly beneath
 * #agy-settings-updates-section, backed by com.agy.backup.BackupManager.
 */

var lastBackupState = {
  type: 'idle',
  message: '',
  percent: 0,
  conversations: true,
  skillsPlugins: true,
  projects: true,
  statsReady: false,
  convBytes: 0,
  convFiles: 0,
  skillsBytes: 0,
  skillsFiles: 0,
  projBytes: 0,
  projFiles: 0
};
var backupStatsRequestedOnMount = false;

function formatBackupBytes(bytes) {
  var b = Number(bytes) || 0;
  if (b <= 0) return '0 B';
  if (b < 1024) return b + ' B';
  var kb = b / 1024;
  if (kb < 1024) return kb.toFixed(1) + ' KB';
  var mb = kb / 1024;
  if (mb < 1024) return mb.toFixed(1) + ' MB';
  return (mb / 1024).toFixed(2) + ' GB';
}

function readNativeBackupState() {
  try {
    if (window.Android && typeof window.Android.getBackupStateJson === 'function') {
      var raw = window.Android.getBackupStateJson();
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed.type === 'string') {
          lastBackupState = parsed;
        }
      }
    }
  } catch (e) {
    warn('backup.getState', e);
  }
  return lastBackupState;
}

function createScopeCheckbox(id, labelSpanId, labelText, initialChecked, onChange) {
  var lbl = document.createElement('label');
  lbl.setAttribute('for', id);
  lbl.className = 'inline-flex items-center gap-2 text-xs select-none cursor-pointer py-1 pr-2';

  var inp = document.createElement('input');
  inp.type = 'checkbox';
  inp.id = id;
  inp.checked = !!initialChecked;
  inp.style.cssText = 'width:15px;height:15px;accent-color:#3b82f6;cursor:pointer;margin:0;';
  inp.addEventListener('change', onChange);

  var span = document.createElement('span');
  span.id = labelSpanId;
  span.textContent = labelText;

  lbl.appendChild(inp);
  lbl.appendChild(span);
  return lbl;
}

function syncBackupOptionsToNative() {
  var cEl = document.getElementById('agy-backup-opt-conv');
  var sEl = document.getElementById('agy-backup-opt-skills');
  var pEl = document.getElementById('agy-backup-opt-proj');
  var c = cEl ? !!cEl.checked : true;
  var s = sEl ? !!sEl.checked : true;
  var p = pEl ? !!pEl.checked : true;

  lastBackupState.conversations = c;
  lastBackupState.skillsPlugins = s;
  lastBackupState.projects = p;
  if (lastBackupState.type === 'success' || lastBackupState.type === 'error') {
    lastBackupState.type = 'idle';
    lastBackupState.message = '';
    lastBackupState.percent = 0;
  }
  renderSettingsBackupSection();

  try {
    if (window.Android && typeof window.Android.setBackupOptions === 'function') {
      window.Android.setBackupOptions(c, s, p);
    }
  } catch (e) {
    warn('backup.setOptions', e);
  }
}

function renderSettingsBackupSection() {
  if (typeof document === 'undefined') return;
  var container = document.getElementById('agy-application-settings-anchor');
  if (!container) {
    backupStatsRequestedOnMount = false;
    return;
  }
  if (!backupStatsRequestedOnMount) {
    backupStatsRequestedOnMount = true;
    try {
      if (window.Android && typeof window.Android.refreshBackupStats === 'function') {
        window.Android.refreshBackupStats(false);
      }
    } catch (e) {}
  }

  var updatesSec = document.getElementById('agy-settings-updates-section');
  var sec = document.getElementById('agy-settings-backup-section');
  if (!sec) {
    sec = document.createElement('div');
    sec.id = 'agy-settings-backup-section';
    sec.className = 'space-y-2';

    var hdrWrap = document.createElement('div');
    hdrWrap.className = 'flex flex-col gap-1';
    var hdrRow = document.createElement('div');
    hdrRow.className = 'flex items-center justify-between';
    var h3 = document.createElement('h3');
    h3.className = 'm-0 font-medium';
    h3.textContent = 'test backup/restore';
    hdrRow.appendChild(h3);
    hdrWrap.appendChild(hdrRow);

    var card = document.createElement('div');
    card.className = 'agy-card bg-transparent rounded-xl border border-border overflow-hidden divide-y divide-border';

    // Top row: summary + Export / Restore buttons
    var topRow = document.createElement('div');
    topRow.className = 'py-2.5 px-3 w-full bg-transparent flex flex-wrap justify-between gap-3 items-center';

    var left = document.createElement('div');
    left.className = 'flex-1 min-w-[200px] flex flex-col gap-0.5';

    var titleLine = document.createElement('div');
    titleLine.className = 'flex items-center gap-1.5 flex-wrap';

    var labelSpan = document.createElement('span');
    labelSpan.textContent = 'Portable User Data';

    var badgeSpan = document.createElement('span');
    badgeSpan.id = 'agy-settings-backup-badge';
    badgeSpan.className = 'text-[10px] font-semibold leading-none bg-secondary text-secondary-foreground px-1.5 py-0.5 rounded-full select-none border border-border';
    badgeSpan.textContent = '.zip';

    titleLine.appendChild(labelSpan);
    titleLine.appendChild(badgeSpan);

    var descSpan = document.createElement('span');
    descSpan.id = 'agy-settings-backup-desc';
    descSpan.className = 'text-sm text-muted-foreground';

    var progWrap = document.createElement('div');
    progWrap.id = 'agy-settings-backup-prog-wrap';
    progWrap.style.cssText = 'display:none;width:100%;height:4px;border-radius:9999px;background:rgba(128,128,128,0.2);overflow:hidden;margin-top:4px;';
    var progBar = document.createElement('div');
    progBar.id = 'agy-settings-backup-prog-bar';
    progBar.style.cssText = 'width:0%;height:100%;background:#3b82f6;border-radius:9999px;';
    progWrap.appendChild(progBar);

    left.appendChild(titleLine);
    left.appendChild(descSpan);
    left.appendChild(progWrap);

    var btnGroup = document.createElement('div');
    btnGroup.className = 'flex items-center gap-2 flex-wrap shrink-0';

    var exportBtn = document.createElement('button');
    exportBtn.id = 'agy-settings-backup-export-btn';
    exportBtn.type = 'button';
    exportBtn.setAttribute('data-testid', 'agy-settings-backup-export-btn');
    exportBtn.textContent = 'Export Backup';
    exportBtn.addEventListener('click', function() {
      var cEl = document.getElementById('agy-backup-opt-conv');
      var sEl = document.getElementById('agy-backup-opt-skills');
      var pEl = document.getElementById('agy-backup-opt-proj');
      var c = cEl ? !!cEl.checked : false;
      var s = sEl ? !!sEl.checked : false;
      var p = pEl ? !!pEl.checked : false;
      if (!c && !s && !p) return;
      try {
        if (window.Android && typeof window.Android.exportBackup === 'function') {
          window.Android.exportBackup(c, s, p);
        }
      } catch (e) {
        warn('backup.export', e);
      }
    });

    var restoreBtn = document.createElement('button');
    restoreBtn.id = 'agy-settings-backup-restore-btn';
    restoreBtn.type = 'button';
    restoreBtn.setAttribute('data-testid', 'agy-settings-backup-restore-btn');
    restoreBtn.textContent = 'Restore Backup';
    restoreBtn.addEventListener('click', function() {
      try {
        if (window.Android && typeof window.Android.restoreBackup === 'function') {
          window.Android.restoreBackup();
        }
      } catch (e) {
        warn('backup.restore', e);
      }
    });

    btnGroup.appendChild(exportBtn);
    btnGroup.appendChild(restoreBtn);
    topRow.appendChild(left);
    topRow.appendChild(btnGroup);

    // Bottom row: scope toggles + security notice
    var bottomRow = document.createElement('div');
    bottomRow.className = 'py-2 px-3 w-full bg-transparent flex flex-col gap-1.5';

    var checksWrap = document.createElement('div');
    checksWrap.className = 'flex items-center gap-3 flex-wrap';
    checksWrap.appendChild(createScopeCheckbox(
      'agy-backup-opt-conv',
      'agy-backup-opt-conv-lbl',
      'Conversations & Artifacts',
      lastBackupState.conversations !== false,
      syncBackupOptionsToNative
    ));
    checksWrap.appendChild(createScopeCheckbox(
      'agy-backup-opt-skills',
      'agy-backup-opt-skills-lbl',
      'Skills, Rules & Plugins',
      lastBackupState.skillsPlugins !== false,
      syncBackupOptionsToNative
    ));
    checksWrap.appendChild(createScopeCheckbox(
      'agy-backup-opt-proj',
      'agy-backup-opt-proj-lbl',
      'Projects & Settings',
      lastBackupState.projects !== false,
      syncBackupOptionsToNative
    ));

    var secNote = document.createElement('span');
    secNote.className = 'text-xs text-muted-foreground opacity-80';
    secNote.textContent = 'OAuth sign-in tokens, private keys (.jks, .netrc, SSH/ADB), and scratch caches are excluded.';

    bottomRow.appendChild(checksWrap);
    bottomRow.appendChild(secNote);

    card.appendChild(topRow);
    card.appendChild(bottomRow);
    sec.appendChild(hdrWrap);
    sec.appendChild(card);
  }

  // Ensure #agy-settings-backup-section stays directly after #agy-settings-updates-section
  var validUpdatesSec = (updatesSec && updatesSec.parentElement === container) ? updatesSec : null;
  var desiredNext = validUpdatesSec ? validUpdatesSec.nextSibling : container.firstChild;
  if (sec.parentElement !== container || (validUpdatesSec && sec.previousSibling !== validUpdatesSec)) {
    container.insertBefore(sec, desiredNext);
  }

  var st = lastBackupState || { type: 'idle' };
  var isBusy = st.type === 'exporting' || st.type === 'restoring';

  var descEl = document.getElementById('agy-settings-backup-desc');
  var badgeEl = document.getElementById('agy-settings-backup-badge');
  var expEl = document.getElementById('agy-settings-backup-export-btn');
  var resEl = document.getElementById('agy-settings-backup-restore-btn');
  var pWrap = document.getElementById('agy-settings-backup-prog-wrap');
  var pBar = document.getElementById('agy-settings-backup-prog-bar');
  var cInput = document.getElementById('agy-backup-opt-conv');
  var sInput = document.getElementById('agy-backup-opt-skills');
  var pInput = document.getElementById('agy-backup-opt-proj');
  var cLbl = document.getElementById('agy-backup-opt-conv-lbl');
  var sLbl = document.getElementById('agy-backup-opt-skills-lbl');
  var pLbl = document.getElementById('agy-backup-opt-proj-lbl');

  if (!descEl || !expEl || !resEl) return;

  if (cInput && typeof st.conversations === 'boolean' && cInput.checked !== st.conversations) {
    cInput.checked = st.conversations;
  }
  if (sInput && typeof st.skillsPlugins === 'boolean' && sInput.checked !== st.skillsPlugins) {
    sInput.checked = st.skillsPlugins;
  }
  if (pInput && typeof st.projects === 'boolean' && pInput.checked !== st.projects) {
    pInput.checked = st.projects;
  }

  var cChecked = cInput ? !!cInput.checked : (st.conversations !== false);
  var sChecked = sInput ? !!sInput.checked : (st.skillsPlugins !== false);
  var pChecked = pInput ? !!pInput.checked : (st.projects !== false);
  var noneSelected = !cChecked && !sChecked && !pChecked;

  if (st.statsReady) {
    setTextIfChanged(cLbl, 'Conversations & Artifacts (' + formatBackupBytes(st.convBytes) + ')');
    setTextIfChanged(sLbl, 'Skills, Rules & Plugins (' + formatBackupBytes(st.skillsBytes) + ')');
    setTextIfChanged(pLbl, 'Projects & Settings (' + formatBackupBytes(st.projBytes) + ')');
  } else {
    setTextIfChanged(cLbl, 'Conversations & Artifacts');
    setTextIfChanged(sLbl, 'Skills, Rules & Plugins');
    setTextIfChanged(pLbl, 'Projects & Settings');
  }

  if (isBusy) {
    setTextIfChanged(descEl, st.message || (st.type === 'exporting' ? 'Exporting backup\u2026' : 'Restoring backup\u2026'));
    setClassIfChanged(descEl, 'text-sm text-muted-foreground');
    setTextIfChanged(badgeEl, st.type === 'exporting' ? 'Exporting' : 'Restoring');
  } else if (st.type === 'error' && st.message) {
    setTextIfChanged(descEl, String(st.message));
    setClassIfChanged(descEl, 'text-sm text-destructive');
    setTextIfChanged(badgeEl, 'Error');
  } else if (st.type === 'success' && st.message && !noneSelected) {
    setTextIfChanged(descEl, String(st.message));
    setClassIfChanged(descEl, 'text-sm text-muted-foreground');
    setTextIfChanged(badgeEl, 'Done');
  } else if (noneSelected) {
    setTextIfChanged(descEl, 'Select at least one category below to export.');
    setClassIfChanged(descEl, 'text-sm text-muted-foreground');
    setTextIfChanged(badgeEl, '0 B');
  } else if (st.statsReady) {
    var selBytes = (cChecked ? (Number(st.convBytes) || 0) : 0)
                 + (sChecked ? (Number(st.skillsBytes) || 0) : 0)
                 + (pChecked ? (Number(st.projBytes) || 0) : 0);
    var selFiles = (cChecked ? (Number(st.convFiles) || 0) : 0)
                 + (sChecked ? (Number(st.skillsFiles) || 0) : 0)
                 + (pChecked ? (Number(st.projFiles) || 0) : 0);
    setTextIfChanged(descEl, 'Selected: ' + formatBackupBytes(selBytes) + ' uncompressed (' + selFiles + ' files) \u00b7 compressed into .zip on save.');
    setClassIfChanged(descEl, 'text-sm text-muted-foreground');
    setTextIfChanged(badgeEl, '.zip \u00b7 ' + formatBackupBytes(selBytes));
  } else {
    setTextIfChanged(descEl, 'Calculating category sizes\u2026');
    setClassIfChanged(descEl, 'text-sm text-muted-foreground');
    setTextIfChanged(badgeEl, '.zip');
  }

  if (pWrap && pBar) {
    if (isBusy) {
      var pct = Math.max(2, Math.min(100, Number(st.percent) || 5));
      setCssIfChanged(pWrap, 'display:block;width:100%;height:4px;border-radius:9999px;background:rgba(128,128,128,0.2);overflow:hidden;margin-top:4px;');
      setCssIfChanged(pBar, 'width:' + pct + '%;height:100%;background:#3b82f6;border-radius:9999px;');
    } else {
      setCssIfChanged(pWrap, 'display:none;');
    }
  }

  var btnActiveCls = 'px-3 py-1.5 rounded-full text-xs font-medium bg-secondary text-secondary-foreground hover:opacity-90 border border-border cursor-pointer';
  var btnDisabledCls = 'px-3 py-1.5 rounded-full text-xs font-medium bg-secondary text-muted-foreground border border-border opacity-50 cursor-not-allowed';

  var exportDisabled = isBusy || noneSelected;
  if (expEl.disabled !== exportDisabled) expEl.disabled = exportDisabled;
  if (resEl.disabled !== isBusy) resEl.disabled = isBusy;
  if (cInput && cInput.disabled !== isBusy) cInput.disabled = isBusy;
  if (sInput && sInput.disabled !== isBusy) sInput.disabled = isBusy;
  if (pInput && pInput.disabled !== isBusy) pInput.disabled = isBusy;

  setClassIfChanged(expEl, exportDisabled ? btnDisabledCls : btnActiveCls);
  setClassIfChanged(resEl, isBusy ? btnDisabledCls : btnActiveCls);
  setTextIfChanged(expEl, st.type === 'exporting' ? 'Exporting\u2026' : 'Export Backup');
  setTextIfChanged(resEl, st.type === 'restoring' ? 'Restoring\u2026' : 'Restore Backup');
}

readNativeBackupState();

window.__agOnBackupStateChanged = function(nextState) {
  try {
    var parsed = typeof nextState === 'string' ? JSON.parse(nextState) : nextState;
    if (!parsed || typeof parsed.type !== 'string') return;
    lastBackupState = parsed;
    if (typeof scheduleUpdaterDomSync === 'function') {
      scheduleUpdaterDomSync();
    } else {
      renderSettingsBackupSection();
    }
  } catch (e) {
    warn('backup.onStateChanged', e);
  }
};

window.addEventListener('agy:host-resume', function() {
  readNativeBackupState();
  renderSettingsBackupSection();
});
document.addEventListener('visibilitychange', function() {
  if (document.visibilityState === 'visible') {
    readNativeBackupState();
    renderSettingsBackupSection();
  }
});

window.renderSettingsBackupSection = renderSettingsBackupSection;
window.readNativeBackupState = readNativeBackupState;
window.syncBackupOptionsToNative = syncBackupOptionsToNative;

/**
 * core/public-api.js - expose window.__agBridgeCore.
 *
 * Dead entries listed in docs/DEADCODE.md are not ported.
 */
var api = {
  version: VERSION,
  config: CONFIG,
  endpoints: ENDPOINTS,
  endpoint: endpoint,
  setEndpoint: setEndpoint,
  baseOrigin: baseOrigin,
  syncCsrf: syncCsrf,
  parseEndpointSpec: parseEndpointSpec
};

window.__agBridgeCore = api;

try { console.log('[AGY bridge.core] ready (endpoints: ' + Object.keys(ENDPOINTS).length + ')'); } catch (e) {}


})();
