// Edit these and reinstall (tools/install.sh) to change location or defaults.
window.TV_HOME_CONFIG = {
  // Weather location. Find coordinates at https://open-meteo.com/en/docs (search a city).
  location: { name: 'Sydney', latitude: -33.8688, longitude: 151.2093 },
  locale: 'en-AU',
  weatherRefreshMinutes: 15,
  // Tiles pinned first, in this order. List installed app IDs with:
  //   ~/tizen-studio/tools/sdb -s <tv-ip>:26101 shell 0 vd_applist   (use the app_tizen_id lines)
  // `name` and `icon` are optional and override what the TV reports.
  // Inputs are not apps: give them an `input.*` id and a `source`.
  homeApps: [
    { id: 'com.samsung.tv.csfs', name: 'Smart Hub' },
    // { id: 'org.tizen.netflix-app', name: 'Netflix' },
    // { id: 'input.hdmi1', name: 'Game console', icon: 'css/app-icons/hdmi.svg', source: { type: 'HDMI', number: 1 } },
    // { id: 'input.hdmi2', name: 'HDMI 2', icon: 'css/app-icons/hdmi.svg', source: { type: 'HDMI', number: 2 } }
  ],
  // Apps whose id or name contains one of these come first, in this order.
  favoriteOrder: [
    'smarthub', 'netflix', 'youtube', 'prime', 'amazon', 'apple', 'disney', 'hbo', 'max',
    'stremio', 'hulu', 'peacock', 'spotify', 'twitch', 'plex', 'jellyfin', 'browser'
  ],
  // language: 'en-GB' or 'pt-PT'. hidden: [] shows every installed app on first run;
  // null hides everything not listed in homeApps. Viewers can change all of these in Settings.
  defaults: { language: 'en-GB', unit: 'C', clock: '24', scenery: 'auto', effects: true, hidden: [] }
};
