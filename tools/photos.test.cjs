const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadPhotos(initialStorage = {}) {
  const store = { ...initialStorage };
  const localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; }
  };
  const context = vm.createContext({
    window: { TV_HOME_CONFIG: { googlePhotosAlbumUrl: '' } },
    localStorage,
    Date,
    Math,
    setTimeout,
    clearTimeout
  });
  const code = fs.readFileSync(path.join(__dirname, '../js/photos.js'), 'utf8');
  vm.runInContext(code, context);
  return { TVPhotos: context.window.TVPhotos, store };
}

test('normalizeAlbumUrl handles full URLs, short prefixes and plain short codes', () => {
  const { TVPhotos } = loadPhotos();
  assert.equal(TVPhotos.normalizeAlbumUrl(''), '');
  assert.equal(TVPhotos.normalizeAlbumUrl(null), '');
  assert.equal(TVPhotos.normalizeAlbumUrl('https://photos.app.goo.gl/XYZ123'), 'https://photos.app.goo.gl/XYZ123');
  assert.equal(TVPhotos.normalizeAlbumUrl('http://photos.app.goo.gl/XYZ123'), 'http://photos.app.goo.gl/XYZ123');
  assert.equal(TVPhotos.normalizeAlbumUrl('photos.app.goo.gl/XYZ123'), 'https://photos.app.goo.gl/XYZ123');
  assert.equal(TVPhotos.normalizeAlbumUrl('https://photos.google.com/share/XYZ?key=123'), 'https://photos.google.com/share/XYZ?key=123');
  assert.equal(TVPhotos.normalizeAlbumUrl('AbCdEf12345'), 'https://photos.app.goo.gl/AbCdEf12345');
});

test('extractPhotoUrls extracts unique Google Photos CDN URLs with 4K UHD dimensions', () => {
  const { TVPhotos } = loadPhotos();
  const sampleHtml = `
    <html><body>
      <script>
        AF_initDataCallback({key: 'ds:0', data: [
          "https://lh3.googleusercontent.com/pw/AP1GczO1234567890abcdefghijklmnopqrstuvwxyz_ABCD=w1024-h768",
          "https://lh3.googleusercontent.com/pw/AP1GczO1234567890abcdefghijklmnopqrstuvwxyz_ABCD=w800",
          "https://lh3.googleusercontent.com/pw/AP1GczO9876543210zyxwvutsrqponmlkjihgfedcba_WXYZ=s0",
          "https://lh3.googleusercontent.com/avatar/tiny=s32-p"
        ]});
      </script>
    </body></html>
  `;
  const urls = TVPhotos.extractPhotoUrls(sampleHtml);
  assert.equal(urls.length, 2, 'Should extract only the 2 valid unique photo media URLs');
  assert.equal(urls[0], 'https://lh3.googleusercontent.com/pw/AP1GczO1234567890abcdefghijklmnopqrstuvwxyz_ABCD=w3840-h2160');
  assert.equal(urls[1], 'https://lh3.googleusercontent.com/pw/AP1GczO9876543210zyxwvutsrqponmlkjihgfedcba_WXYZ=w3840-h2160');
});

test('extractPhotoUrls excludes video items when ds:1 contains video metadata', () => {
  const { TVPhotos } = loadPhotos();
  const ds1Html = `
    AF_initDataCallback({key: 'ds:1', hash: '1', data:[null,[
      ["video_item_1", ["https://lh3.googleusercontent.com/pw/VIDEO_PREVIEW_1"], 1700000000, "", 0, 0, [], [], 2, {"76647426": [12000]}],
      ["photo_item_1", ["https://lh3.googleusercontent.com/pw/PHOTO_ACTUAL_1"], 1700000000, "", 0, 0, [], [], 2, {"15": 12345}],
      ["video_item_2", ["https://lh3.googleusercontent.com/pw/VIDEO_PREVIEW_2"], 1700000000, "", 0, 0, [], [], 2, {"76647426": [8500]}],
      ["photo_item_2", ["https://lh3.googleusercontent.com/pw/PHOTO_ACTUAL_2"], 1700000000, "", 0, 0, [], [], 2, {}]
    ]], sideChannel: {}});
  `;
  const urls = TVPhotos.extractPhotoUrls(ds1Html);
  assert.equal(urls.length, 2, 'Should filter out both videos and return only the 2 photos');
  assert.equal(urls[0], 'https://lh3.googleusercontent.com/pw/PHOTO_ACTUAL_1=w3840-h2160');
  assert.equal(urls[1], 'https://lh3.googleusercontent.com/pw/PHOTO_ACTUAL_2=w3840-h2160');
});

test('rotation queue advances after interval and cycles without crashing', () => {
  const cachedData = JSON.stringify({
    albumUrl: 'https://photos.app.goo.gl/test',
    urls: [
      'https://lh3.googleusercontent.com/pw/photo1=w3840-h2160',
      'https://lh3.googleusercontent.com/pw/photo2=w3840-h2160',
      'https://lh3.googleusercontent.com/pw/photo3=w3840-h2160'
    ],
    fetchedAt: Date.now()
  });
  const { TVPhotos } = loadPhotos({ 'tvhome.photos.v1': cachedData });
  assert.equal(TVPhotos.hasPhotos(), true);

  const t0 = new Date('2026-11-01T10:00:00Z');
  const p1 = TVPhotos.currentPhoto(t0, 5);
  assert.ok(p1, 'First photo selected');

  // 4 minutes later: same photo
  const t1 = new Date('2026-11-01T10:04:00Z');
  assert.equal(TVPhotos.currentPhoto(t1, 5), p1, 'Same photo before interval expires');

  // 5 minutes later: advances to next photo
  const t2 = new Date('2026-11-01T10:05:01Z');
  const p2 = TVPhotos.currentPhoto(t2, 5);
  assert.ok(p2, 'Advanced to next photo');

  // Manual nextPhoto
  const p3 = TVPhotos.nextPhoto();
  assert.ok(p3);
});

test('landscape renderer displays photoUrl with natural colors (filter: none)', () => {
  const images = [];
  const context = vm.createContext({
    window: {},
    Image: function () { images.push(this); }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/landscape.js'), 'utf8'), context);
  const layers = [{ style: {} }, { style: {} }];
  const element = { dataset: { weather: 'fog', scene: 'overcast' }, querySelectorAll: () => layers };

  const photoUrl = 'https://lh3.googleusercontent.com/pw/sample=w3840-h2160';
  context.window.TVLandscape.render(element, { phase: 'night', kind: 'rain', photoUrl: photoUrl });

  assert.equal(images.length, 1);
  assert.equal(images[0].src, photoUrl);

  // Trigger image load
  images[0].onload();

  assert.equal(element.dataset.scene, 'photo');
  assert.equal(element.dataset.weather, undefined, 'Weather haze should be removed for photos');
  assert.equal(layers[0].style.backgroundImage, `url("${photoUrl}")`);
  assert.equal(layers[0].style.filter, 'none', 'Natural colors: no filter applied');
  assert.equal(layers[0].style.opacity, '1');
});

test('fetchAlbum uses photosResolverUrl when configured and parses photo list', async () => {
  let calledUrl = '';
  const fakeFetch = async (url) => {
    calledUrl = url;
    return {
      ok: true,
      json: async () => ({
        photos: [
          'https://lh3.googleusercontent.com/pw/photo1=w3840-h2160',
          'https://lh3.googleusercontent.com/pw/photo2=w3840-h2160'
        ],
        count: 2
      })
    };
  };

  const store = {};
  const localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; }
  };
  const context = vm.createContext({
    window: {
      TV_HOME_CONFIG: {
        photosResolverUrl: 'https://test-resolver.run.app'
      }
    },
    localStorage,
    fetch: fakeFetch,
    Date,
    Math,
    setTimeout,
    clearTimeout
  });
  const code = fs.readFileSync(path.join(__dirname, '../js/photos.js'), 'utf8');
  vm.runInContext(code, context);

  const res = await context.window.TVPhotos.fetchAlbum('https://photos.app.goo.gl/sample123');
  assert.equal(res.count, 2);
  assert.equal(
    calledUrl,
    'https://test-resolver.run.app?url=https%3A%2F%2Fphotos.app.goo.gl%2Fsample123'
  );
  assert.equal(context.window.TVPhotos.hasPhotos(), true);
  assert.ok(context.window.TVPhotos.currentPhoto());
});
