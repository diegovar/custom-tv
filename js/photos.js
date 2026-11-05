// Google Photos Shared Album background loader and rotation queue.
(function () {
  'use strict';

  var CACHE_KEY = 'tvhome.photos.v1';
  var albumUrl = '';
  var allUrls = [];
  var shuffled = [];
  var queueIndex = 0;
  var lastRotatedAt = 0;
  var currentPhotoUrl = null;
  var isFetching = false;
  var lastFetchedAt = 0;

  function normalizeAlbumUrl(input) {
    if (!input) return '';
    var s = String(input).trim();
    if (!s) return '';
    if (/^https?:\/\//i.test(s)) return s;
    if (/^photos\.app\.goo\.gl\//i.test(s)) return 'https://' + s;
    if (/^photos\.google\.com\//i.test(s)) return 'https://' + s;
    // Short code (e.g. "AbCdEf1234")
    return 'https://photos.app.goo.gl/' + s;
  }

  function format4K(base) {
    // Strip existing trailing =... modifiers and append 4K dimensions.
    var clean = base.replace(/=.*$/, '');
    return clean + '=w3840-h2160';
  }

  function extractPhotoUrls(html) {
    if (!html || typeof html !== 'string') return [];
    // Match Google Photos CDN media URLs
    var regex = /https?:\/\/[a-z0-9-]+\.googleusercontent\.com\/(?:pw\/)?[A-Za-z0-9_-]{30,}/g;
    var matches = html.match(regex) || [];
    var seen = {};
    var result = [];

    for (var i = 0; i < matches.length; i++) {
      var raw = matches[i];
      var base = raw.replace(/=.*$/, '');
      // Avoid tiny avatars or icons
      if (seen[base]) continue;
      seen[base] = true;
      result.push(format4K(base));
    }
    return result;
  }

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = a[i];
      a[i] = a[j];
      a[j] = tmp;
    }
    return a;
  }

  function setQueue(urls) {
    allUrls = (urls || []).slice();
    if (allUrls.length === 0) {
      shuffled = [];
      queueIndex = 0;
      currentPhotoUrl = null;
      return;
    }
    shuffled = shuffle(allUrls);
    queueIndex = 0;
    currentPhotoUrl = shuffled[0] || null;
    lastRotatedAt = Date.now();
  }

  function loadCache() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return false;
      var data = JSON.parse(raw);
      if (data && Array.isArray(data.urls) && data.urls.length > 0) {
        albumUrl = data.albumUrl || '';
        lastFetchedAt = data.fetchedAt || 0;
        setQueue(data.urls);
        return true;
      }
    } catch (e) {
      /* parse error */
    }
    return false;
  }

  function saveCache(url, urls) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        albumUrl: url,
        urls: urls,
        fetchedAt: Date.now()
      }));
    } catch (e) {
      /* storage full */
    }
  }

  function clearAlbum() {
    albumUrl = '';
    allUrls = [];
    shuffled = [];
    queueIndex = 0;
    lastRotatedAt = 0;
    currentPhotoUrl = null;
    lastFetchedAt = 0;
    try { localStorage.removeItem(CACHE_KEY); } catch (e) {}
  }

  function fetchAlbum(input) {
    var targetUrl = normalizeAlbumUrl(input);
    if (!targetUrl) return Promise.reject(new Error('No album URL provided'));
    isFetching = true;

    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl && setTimeout(function () { ctrl.abort(); }, 20000);

    var resolver = (window.TV_HOME_CONFIG && window.TV_HOME_CONFIG.photosResolverUrl) || '';
    var requestUrl = resolver
      ? (resolver.replace(/\/+$/, '') + '?url=' + encodeURIComponent(targetUrl))
      : targetUrl;

    return fetch(requestUrl, ctrl ? { signal: ctrl.signal } : {})
      .then(function (res) {
        if (!res.ok) throw new Error('Could not access Google Photos album (HTTP ' + res.status + ')');
        return resolver ? res.json() : res.text();
      })
      .then(function (payload) {
        var urls = [];
        if (typeof payload === 'object' && payload && Array.isArray(payload.photos)) {
          urls = payload.photos;
        } else if (typeof payload === 'string') {
          urls = extractPhotoUrls(payload);
        }
        if (!urls.length) throw new Error('No photos found in this shared album. Make sure link sharing is turned on.');
        albumUrl = targetUrl;
        lastFetchedAt = Date.now();
        saveCache(targetUrl, urls);
        setQueue(urls);
        return { count: urls.length, urls: urls };
      })
      .finally(function () {
        if (timer) clearTimeout(timer);
        isFetching = false;
      });
  }

  function hasPhotos() {
    return allUrls.length > 0;
  }

  function getInfo() {
    return {
      albumUrl: albumUrl,
      count: allUrls.length,
      currentPhoto: currentPhotoUrl,
      fetchedAt: lastFetchedAt,
      isFetching: isFetching
    };
  }

  function nextPhoto() {
    if (!shuffled.length) return null;
    queueIndex++;
    if (queueIndex >= shuffled.length) {
      var last = shuffled[shuffled.length - 1];
      shuffled = shuffle(allUrls);
      // Ensure the boundary doesn't repeat the exact same photo if > 1 photo available
      if (shuffled.length > 1 && shuffled[0] === last) {
        var swapIdx = 1 + Math.floor(Math.random() * (shuffled.length - 1));
        var tmp = shuffled[0];
        shuffled[0] = shuffled[swapIdx];
        shuffled[swapIdx] = tmp;
      }
      queueIndex = 0;
    }
    currentPhotoUrl = shuffled[queueIndex];
    lastRotatedAt = Date.now();
    return currentPhotoUrl;
  }

  function prevPhoto() {
    if (!shuffled.length) return null;
    queueIndex = (queueIndex - 1 + shuffled.length) % shuffled.length;
    currentPhotoUrl = shuffled[queueIndex];
    lastRotatedAt = Date.now();
    return currentPhotoUrl;
  }

  function currentPhoto(now, intervalMinutes) {
    if (!shuffled.length) return null;
    if (!currentPhotoUrl) {
      currentPhotoUrl = shuffled[0];
      lastRotatedAt = now ? now.getTime() : Date.now();
      return currentPhotoUrl;
    }
    var intervalMs = Math.max(1, (intervalMinutes || 5)) * 60e3;
    var currentTime = now ? now.getTime() : Date.now();
    if (currentTime - lastRotatedAt >= intervalMs) {
      return nextPhoto();
    }
    return currentPhotoUrl;
  }

  function sync(force) {
    var target = albumUrl || (window.TV_HOME_CONFIG && window.TV_HOME_CONFIG.googlePhotosAlbumUrl);
    if (!target) return Promise.resolve(null);
    var age = Date.now() - lastFetchedAt;
    var due = force || age > 60 * 60e3;
    if (!due || isFetching) return Promise.resolve(null);
    return fetchAlbum(target).catch(function () {
      /* keep using cached photos if background sync fails */
      return null;
    });
  }

  // Initialize from cache on startup
  loadCache();

  window.TVPhotos = {
    normalizeAlbumUrl: normalizeAlbumUrl,
    extractPhotoUrls: extractPhotoUrls,
    fetchAlbum: fetchAlbum,
    hasPhotos: hasPhotos,
    getInfo: getInfo,
    nextPhoto: nextPhoto,
    prevPhoto: prevPhoto,
    currentPhoto: currentPhoto,
    clearAlbum: clearAlbum,
    sync: sync
  };
})();
