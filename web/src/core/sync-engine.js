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
