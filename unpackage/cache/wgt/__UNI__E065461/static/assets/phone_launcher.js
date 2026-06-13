/* phone_launcher.js - IDIC phone launcher shell */
(function () {
  'use strict';

  const DEFAULT_DOCK = ['chat', 'settings', 'gps', 'weather'];
  const GRID_COLS = 4;
  const GRID_ROWS = 7;

  const WIDGET_ICONS = {
    image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><path d="M21 15l-5-5L5 21"></path></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path></svg>',
    photos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="15" height="15" rx="2"></rect><path d="M8 3h11a2 2 0 0 1 2 2v11"></path><circle cx="8.5" cy="10.5" r="1.5"></circle><path d="M21 15l-5-5L5 21"></path></svg>',
    music: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>',
    weather: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9z"></path><path d="M12 2v2"></path><path d="m4.93 4.93 1.41 1.41"></path><path d="M2 12h2"></path></svg>',
    prev: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zM9 12l9-6v12z"></path></svg>',
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"></path></svg>',
    next: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 6h2v12h-2zM6 18l9-6-9-6z"></path></svg>'
  };

  const EDIT_ICONS = {
    add: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"></path><path d="M5 12h14"></path></svg>',
    done: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg>',
    image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"></rect><circle cx="8.5" cy="10.5" r="1.5"></circle><path d="m21 15-4-4-6 6-3-3-5 5"></path></svg>',
    reset: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"></path><path d="M3 4v6h6"></path></svg>',
    restore: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"></path><path d="M4 9h11a5 5 0 1 1 0 10h-2"></path></svg>',
    remove: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>'
  };

  const WIDGET_REGISTRY = [
    { id: 'weather', name: '\u5929\u6c14', size: '4x2', w: 4, h: 2, icon: WIDGET_ICONS.weather, singleton: true },
    { id: 'clock', name: '\u65f6\u95f4', size: '2x2', w: 2, h: 2, icon: WIDGET_ICONS.clock },
    { id: 'image', name: '\u56fe\u7247', size: '2x2', w: 2, h: 2, icon: WIDGET_ICONS.image },
    { id: 'polaroid', name: '\u76f8\u518c', size: '4x2', w: 4, h: 2, icon: WIDGET_ICONS.photos },
    { id: 'polaroidSmall', name: '\u5c0f\u76f8\u518c', size: '2x2', w: 2, h: 2, icon: WIDGET_ICONS.photos },
    { id: 'music', name: '\u97f3\u4e50', size: '4x1', w: 4, h: 1, icon: WIDGET_ICONS.music },
    { id: 'cd', name: 'CD', size: '2x2', w: 2, h: 2, icon: WIDGET_ICONS.music }
  ];

  const DEFAULT_WIDGET_CONFIG = {
    weather: () => ({}),
    image: () => ({ src: '' }),
    clock: () => ({ quote: '\u613f\u4eca\u5929\u4e5f\u6709\u597d\u4e8b\u53d1\u751f' }),
    polaroid: () => ({ photos: ['', '', ''] }),
    polaroidSmall: () => ({ photos: ['', '', ''] }),
    music: () => ({ cover: '', title: '\u672a\u547d\u540d\u6b4c\u66f2', artist: '\u672a\u77e5\u827a\u672f\u5bb6' }),
    cd: () => ({ cover: '', centerRotate: true })
  };

  const DEFAULT_STATE = {
    mode: 'classic',
    enabled: false,
    viewMode: 'phone-shell',
    themeMode: 'day',
    wallpaper: '',
    themeProfiles: {
      day: { wallpaper: '', iconStyle: null, widgetStyles: {} },
      night: { wallpaper: '', iconStyle: null, widgetStyles: {} }
    },
    customIcons: {},
    customAppNames: {},
    launcherPresets: [],
    showFullscreenStatusBar: true,
    pages: [
      {
        id: 'page_home',
        items: [
          { id: 'widget_weather', kind: 'widget', widgetId: 'weather', x: 0, y: 0, w: 4, h: 2 },
          { id: 'app_weibo', kind: 'app', appId: 'weibo', x: 1, y: 1 },
          { id: 'app_music', kind: 'app', appId: 'music', x: 2, y: 1 },
          { id: 'app_wallet', kind: 'app', appId: 'wallet', x: 0, y: 2 },
          { id: 'app_ledger', kind: 'app', appId: 'ledger', x: 1, y: 2 },
          { id: 'app_favorites', kind: 'app', appId: 'favorites', x: 2, y: 2 },
          { id: 'app_diary', kind: 'app', appId: 'diary', x: 3, y: 2 },
          { id: 'app_theme', kind: 'app', appId: 'theme', x: 0, y: 3 },
          { id: 'app_galaxy', kind: 'app', appId: 'galaxy', x: 1, y: 3 },
          { id: 'app_forum', kind: 'app', appId: 'forum', x: 2, y: 3 },
          { id: 'app_food', kind: 'app', appId: 'food', x: 3, y: 3 },
          { id: 'app_movie', kind: 'app', appId: 'movie', x: 1, y: 4 },
          { id: 'app_pet', kind: 'app', appId: 'pet', x: 3, y: 4 }
        ]
      }
    ],
    dock: DEFAULT_DOCK.slice()
  };

  const STYLE_DEFAULTS = {
    icon: {
      bgOpacity: 100,
      glass: false,
      border: false,
      borderWidth: 1,
      shadow: true,
      shadowDirection: 'down-right',
      shadowBlur: 16,
      shadowDepth: 18,
      shadowOpacity: 42,
      shadowSolid: true,
      shadowGlobal: false,
      glassGlobal: false,
      borderGlobal: false
    },
    widget: {
      bgOpacity: 86,
      glass: true,
      border: true,
      borderWidth: 1,
      shadow: true,
      shadowDirection: 'down',
      shadowBlur: 26,
      shadowDepth: 18,
      shadowOpacity: 36,
      shadowSolid: true,
      shadowGlobal: false,
      glassGlobal: false,
      borderGlobal: false
    }
  };

  const APP_REGISTRY = [
    { id: 'chat', name: '\u901a\u8baf', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>' },
    { id: 'wallet', name: '\u94b1\u5305', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"></path><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"></path><path d="M18 12a2 2 0 0 0 0 4h4v-4h-4z"></path></svg>' },
    { id: 'ledger', name: '\u8d26\u672c', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>' },
    { id: 'favorites', name: '\u6536\u85cf', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>' },
    { id: 'diary', name: '\u65e5\u8bb0', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>' },
    { id: 'weibo', name: '\u7a7a\u95f4\u7ad9', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M2 12h20"></path><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10A15.3 15.3 0 0 1 12 2z"></path></svg>' },
    { id: 'theme', name: '\u88c5\u626e', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"></path></svg>' },
    { id: 'galaxy', name: '\u8054\u673a', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>' },
    { id: 'forum', name: '\u7532\u677f', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>' },
    { id: 'settings', name: '\u8bbe\u7f6e', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06A2 2 0 0 1 7.04 4.3l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.14.31.49 1 1.51 1H21a2 2 0 0 1 0 4h-.09A1.65 1.65 0 0 0 19.4 15z"></path></svg>' },
    { id: 'weather', name: '\u5929\u6c14', icon: WIDGET_ICONS.weather },
    { id: 'food', name: '\u5916\u5356', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"></path><path d="M7 2v20"></path><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"></path></svg>' },
    { id: 'movie', name: '\u7535\u5f71', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="18" rx="2"></rect><path d="M7 3v18"></path><path d="M17 3v18"></path><path d="M2 8h5"></path><path d="M17 8h5"></path><path d="M2 16h5"></path><path d="M17 16h5"></path></svg>' },
    { id: 'gps', name: 'GPS', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>' },
    { id: 'pet', name: '\u5ba0\u7269', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="4" r="2"></circle><circle cx="18" cy="8" r="2"></circle><circle cx="20" cy="16" r="2"></circle><path d="M9 10a5 5 0 0 0-5 5v1.5A3.5 3.5 0 0 0 7.5 20H14a4 4 0 0 0 4-4 6 6 0 0 0-6-6H9z"></path></svg>' },
    { id: 'music', name: '\u97f3\u4e50', icon: WIDGET_ICONS.music }
  ];

  let editMode = false;
  let selectedEditTarget = null;
  let draggedEditTarget = null;
  let ignoreLauncherClickUntil = 0;
  let ignoreLauncherClickPoint = null;
  let currentPageIndex = 0;
  let editPanelTab = '';
  let launcherMenu = null;
  let editingWidgetId = '';
  let styleEditingTarget = null;
  let svgEditingAppId = '';
  let renamingAppId = '';
  let pendingWidgetUpload = null;
  let pointerDragTarget = null;
  let pointerDragStart = null;
  let pointerDragOrigin = null;
  let pointerDragPointerId = null;
  let activeDragElement = null;
  let pointerDragging = false;
  let dragEdgeTimer = null;
  let dragEdgeDirection = 0;
  let pointerDragLast = null;
  let dragPreviewSlot = null;
  let pageTransitionDirection = '';
  let pageTransitionTimer = null;
  let styleSaveTimer = null;
  let longPressTimer = null;
  let longPressReadyTarget = null;
  let longPressReady = false;
  let longPressTriggeredAt = 0;
  let lastLongPressMenuAt = 0;
  let swipeStart = null;
  let clockTicker = null;
  let cropSession = null;
  let cropPointer = null;

  function getBridge() {
    return window.IDICPhoneLauncherBridge || null;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeCssIdent(value) {
    if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(String(value || ''));
    return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  }

  function makeId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function isLegacyDock(dock) {
    return Array.isArray(dock)
      && dock.length === 4
      && dock[0] === 'chat'
      && dock[1] === 'weibo'
      && dock[2] === 'music'
      && dock[3] === 'settings';
  }

  function clampNumber(value, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) return min;
    return Math.max(min, Math.min(max, Math.round(number)));
  }

  function getPhoneAppById(appId) {
    return APP_REGISTRY.find((app) => app.id === appId) || null;
  }

  function getWidgetDef(widgetId) {
    if (window.IDICAestheticPack && Array.isArray(window.IDICAestheticPack.NEW_WIDGETS)) {
      const w = window.IDICAestheticPack.NEW_WIDGETS.find((item) => item.id === widgetId);
      if (w) return w;
    }
    return WIDGET_REGISTRY.find((widget) => widget.id === widgetId) || null;
  }

  function getPhoneAppName(app, state) {
    if (!app) return '';
    const customName = state.customAppNames && state.customAppNames[app.id];
    return String(customName || app.name || '').trim() || app.id;
  }

  function getWidgetName(widgetId) {
    return getWidgetDef(widgetId)?.name || widgetId;
  }

  function getWidgetDefaultConfig(widgetId) {
    if (window.IDICAestheticPack && window.IDICAestheticPack.NEW_DEFAULTS?.[widgetId]) {
      return window.IDICAestheticPack.NEW_DEFAULTS[widgetId]();
    }
    const factory = DEFAULT_WIDGET_CONFIG[widgetId];
    return factory ? factory() : {};
  }

  function sanitizeHex(value, fallback) {
    const raw = String(value || '').trim();
    if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toLowerCase();
    if (/^#[0-9a-fA-F]{3}$/.test(raw)) {
      return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`.toLowerCase();
    }
    return fallback;
  }

  function normalizeStyleConfig(style, type) {
    const defaults = STYLE_DEFAULTS[type === 'icon' ? 'icon' : 'widget'];
    const source = style && typeof style === 'object' ? style : {};
    const normalized = {
      bgColor: sanitizeHex(source.bgColor, ''),
      bgOpacity: clampNumber(source.bgOpacity ?? defaults.bgOpacity, 0, 100),
      glass: source.glass == null ? defaults.glass : source.glass !== false,
      border: source.border == null ? defaults.border : source.border !== false,
      borderWidth: clampNumber(source.borderWidth ?? defaults.borderWidth, 0, 8),
      borderColor: sanitizeHex(source.borderColor, ''),
      shadow: source.shadow == null ? defaults.shadow : source.shadow !== false,
      shadowDirection: ['down', 'down-right', 'down-left', 'up', 'flat'].includes(source.shadowDirection) ? source.shadowDirection : defaults.shadowDirection,
      shadowBlur: clampNumber(source.shadowBlur ?? defaults.shadowBlur, 0, 60),
      shadowDepth: clampNumber(source.shadowDepth ?? defaults.shadowDepth, 0, 60),
      shadowOpacity: clampNumber(source.shadowOpacity ?? defaults.shadowOpacity, 0, 100),
      shadowSolid: source.shadowSolid == null ? defaults.shadowSolid : source.shadowSolid !== false,
      shadowGlobal: source.shadowGlobal === true,
      shadowColor: sanitizeHex(source.shadowColor, ''),
      textColor: sanitizeHex(source.textColor, ''),
      accentColor: sanitizeHex(source.accentColor, ''),
      glassGlobal: source.glassGlobal === true,
      borderGlobal: source.borderGlobal === true
    };
    return normalized;
  }

  function getDefaultStyleForState(state, type) {
    const night = state?.themeMode === 'night';
    const defaults = STYLE_DEFAULTS[type === 'icon' ? 'icon' : 'widget'];
    return normalizeStyleConfig({
      bgColor: type === 'icon'
        ? (night ? '#151823' : '#e6e9f0')
        : (night ? '#151823' : '#ffffff'),
      borderColor: night ? '#343a4f' : '#ffffff',
      shadowColor: night ? '#000000' : '#6b7280',
      textColor: night ? '#d8dee9' : '#4a4e69',
      accentColor: state?.themeMode === 'night' ? '#9bb7d4' : '#81a1c1',
      ...defaults
    }, type);
  }

  function getThemeKey(state) {
    return state?.themeMode === 'night' ? 'night' : 'day';
  }

  function createThemeProfile() {
    return { wallpaper: '', iconStyle: null, widgetStyles: {} };
  }

  function normalizeThemeProfile(profile) {
    const safe = profile && typeof profile === 'object' ? profile : createThemeProfile();
    if (typeof safe.wallpaper !== 'string') safe.wallpaper = '';
    safe.iconStyle = safe.iconStyle && typeof safe.iconStyle === 'object' ? normalizeStyleConfig(safe.iconStyle, 'icon') : null;
    if (!safe.widgetStyles || typeof safe.widgetStyles !== 'object') safe.widgetStyles = {};
    Object.keys(safe.widgetStyles).forEach((itemId) => {
      if (!safe.widgetStyles[itemId] || typeof safe.widgetStyles[itemId] !== 'object') {
        delete safe.widgetStyles[itemId];
      } else {
        safe.widgetStyles[itemId] = normalizeStyleConfig(safe.widgetStyles[itemId], 'widget');
      }
    });
    return safe;
  }

  function ensureThemeProfile(state, mode = getThemeKey(state)) {
    if (!state.themeProfiles || typeof state.themeProfiles !== 'object') state.themeProfiles = {};
    const key = mode === 'night' ? 'night' : 'day';
    state.themeProfiles[key] = normalizeThemeProfile(state.themeProfiles[key]);
    return state.themeProfiles[key];
  }

  function getActiveThemeProfile(state) {
    return ensureThemeProfile(state, getThemeKey(state));
  }

  function getActiveWallpaper(state) {
    return getActiveThemeProfile(state).wallpaper || '';
  }

  function setActiveWallpaper(state, value) {
    getActiveThemeProfile(state).wallpaper = String(value || '');
    state.wallpaper = getActiveThemeProfile(state).wallpaper;
  }

  function getActiveIconStyle(state) {
    return getActiveThemeProfile(state).iconStyle || null;
  }

  function setActiveIconStyle(state, value) {
    getActiveThemeProfile(state).iconStyle = value ? normalizeStyleConfig(value, 'icon') : null;
    state.iconStyle = getActiveThemeProfile(state).iconStyle;
  }

  function getActiveWidgetStyles(state) {
    const profile = getActiveThemeProfile(state);
    if (!profile.widgetStyles || typeof profile.widgetStyles !== 'object') profile.widgetStyles = {};
    return profile.widgetStyles;
  }

  function getActiveWidgetStyle(state, itemId) {
    return getActiveWidgetStyles(state)[String(itemId || '')] || null;
  }

  function setActiveWidgetStyle(state, itemId, value) {
    const safeId = String(itemId || '');
    if (!safeId) return;
    const styles = getActiveWidgetStyles(state);
    if (value) styles[safeId] = normalizeStyleConfig(value, 'widget');
    else delete styles[safeId];
    state.widgetStyles = getActiveWidgetStyles(state);
  }

  function deleteWidgetStyleFromAllThemes(state, itemId) {
    const safeId = String(itemId || '');
    if (!safeId) return;
    ['day', 'night'].forEach((mode) => {
      const profile = ensureThemeProfile(state, mode);
      delete profile.widgetStyles[safeId];
    });
    syncActiveThemeAliases(state);
  }

  function syncActiveThemeAliases(state) {
    const profile = getActiveThemeProfile(state);
    state.wallpaper = profile.wallpaper || '';
    state.iconStyle = profile.iconStyle || null;
    state.widgetStyles = profile.widgetStyles || {};
  }

  function getEditableStyle(state, target) {
    if (!target) return null;
    if (target.type === 'icon') return normalizeStyleConfig(getActiveIconStyle(state) || getDefaultStyleForState(state, 'icon'), 'icon');
    const itemId = String(target.itemId || '');
    return normalizeStyleConfig(getActiveWidgetStyle(state, itemId) || getDefaultStyleForState(state, 'widget'), 'widget');
  }

  const STYLE_PART_FIELDS = {
    glass: ['glass'],
    border: ['border', 'borderWidth', 'borderColor'],
    shadow: ['shadow', 'shadowDirection', 'shadowBlur', 'shadowDepth', 'shadowOpacity', 'shadowSolid', 'shadowColor']
  };

  function copyStylePart(target, source, part) {
    const fields = STYLE_PART_FIELDS[part] || [];
    fields.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(source, field)) target[field] = source[field];
    });
  }

  function applyGlobalStyleParts(state, sourceStyle) {
    if (!sourceStyle) return false;
    const parts = [];
    if (sourceStyle.glassGlobal) parts.push('glass');
    if (sourceStyle.borderGlobal) parts.push('border');
    if (sourceStyle.shadowGlobal) parts.push('shadow');
    if (!parts.length) return false;

    const iconStyle = normalizeStyleConfig(getActiveIconStyle(state) || getDefaultStyleForState(state, 'icon'), 'icon');
    parts.forEach((part) => copyStylePart(iconStyle, sourceStyle, part));
    setActiveIconStyle(state, iconStyle);

    getAllPageItems(state).forEach((item) => {
      if (!item || item.kind !== 'widget') return;
      const widgetStyle = normalizeStyleConfig(getActiveWidgetStyle(state, item.id) || getDefaultStyleForState(state, 'widget'), 'widget');
      parts.forEach((part) => copyStylePart(widgetStyle, sourceStyle, part));
      setActiveWidgetStyle(state, item.id, widgetStyle);
    });
    return true;
  }

  function hexToRgb(value) {
    const hex = sanitizeHex(value, '#000000').slice(1);
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16)
    };
  }

  function rgbaFromHex(hex, opacity = 100) {
    const rgb = hexToRgb(hex);
    const alpha = Math.max(0, Math.min(1, Number(opacity) / 100));
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha.toFixed(3)})`;
  }

  function getShadowOffsets(direction, depth) {
    const value = Math.max(0, Number(depth) || 0);
    if (direction === 'down-right') return { x: Math.round(value * 0.45), y: Math.round(value * 0.45) };
    if (direction === 'down-left') return { x: -Math.round(value * 0.45), y: Math.round(value * 0.45) };
    if (direction === 'up') return { x: 0, y: -Math.round(value * 0.42) };
    if (direction === 'flat') return { x: 0, y: 0 };
    return { x: 0, y: Math.round(value * 0.5) };
  }

  function styleToCss(style, type, state) {
    if (!style) return '';
    const normalized = normalizeStyleConfig(style, type);
    const fallback = getDefaultStyleForState(state, type);
    const bg = rgbaFromHex(normalized.bgColor || fallback.bgColor, normalized.bgOpacity);
    const border = normalized.border
      ? `${normalized.borderWidth}px solid ${normalized.borderColor || fallback.borderColor}`
      : '0 solid transparent';
    const shadowOffsets = getShadowOffsets(normalized.shadowDirection, normalized.shadowDepth);
    const shadowOpacity = clampNumber(normalized.shadowOpacity, 0, 100);
    const shadowColor = rgbaFromHex(normalized.shadowColor || fallback.shadowColor, shadowOpacity);
    const shadow = normalized.shadow
      ? `${shadowOffsets.x}px ${shadowOffsets.y}px ${normalized.shadowBlur}px ${shadowColor}, ${Math.round(shadowOffsets.x * 0.35)}px ${Math.round(shadowOffsets.y * 0.35)}px ${Math.max(8, Math.round(normalized.shadowBlur * 0.45))}px ${rgbaFromHex(normalized.shadowColor || fallback.shadowColor, Math.min(100, Math.max(0, shadowOpacity * 0.58)))}`
      : 'none';
    const blur = normalized.glass ? 'blur(18px) saturate(150%)' : 'none';
    const vars = [
      `--pl-custom-bg:${bg}`,
      `--pl-custom-border:${border}`,
      `--pl-custom-shadow:${shadow}`,
      `--pl-custom-shadow-blend:${normalized.shadowSolid ? 'normal' : 'multiply'}`,
      `--pl-custom-backdrop:${blur}`
    ];
    if (normalized.textColor) vars.push(`--pl-custom-text:${normalized.textColor}`);
    if (normalized.textColor) vars.push(`--pl-text-main:${normalized.textColor};--plw-text:${normalized.textColor}`);
    if (normalized.accentColor) vars.push(`--pl-accent:${normalized.accentColor};--pl-custom-accent:${normalized.accentColor}`);
    return vars.join(';');
  }

  function getItemSize(item) {
    if (!item || item.kind === 'app') return { w: 1, h: 1 };
    const def = getWidgetDef(item.widgetId);
    const forceDefSize = ['weather', 'clock', 'polaroid', 'polaroidSmall'].includes(item.widgetId);
    return {
      w: clampNumber(forceDefSize ? (def?.w || 1) : (item.w || def?.w || 1), 1, GRID_COLS),
      h: clampNumber(forceDefSize ? (def?.h || 1) : (item.h || def?.h || 1), 1, GRID_ROWS)
    };
  }

  function normalizeWidgetConfig(item) {
    const base = getWidgetDefaultConfig(item.widgetId);
    const config = item.config && typeof item.config === 'object' ? { ...item.config } : {};
    if (item.widgetId === 'image' && !config.src && item.image) config.src = item.image;
    const merged = { ...base, ...config };
    if (item.widgetId === 'polaroid' || item.widgetId === 'polaroidSmall') {
      const photos = Array.isArray(merged.photos) ? merged.photos.slice(0, 3) : [];
      while (photos.length < 3) photos.push('');
      merged.photos = photos;
    }
    if (item.widgetId === 'cd') merged.centerRotate = merged.centerRotate !== false;
    return merged;
  }

  function normalizeLauncherItem(item) {
    if (!item || typeof item !== 'object') return null;
    if (item.kind === 'app') {
      const appId = String(item.appId || '').trim();
      if (!getPhoneAppById(appId)) return null;
      return { ...item, id: item.id || makeId(`app_${appId}`), kind: 'app', appId, w: 1, h: 1 };
    }
    if (item.kind === 'widget') {
      const widgetId = String(item.widgetId || '').trim();
      const def = getWidgetDef(widgetId);
      if (!def) return null;
      const size = getItemSize({ ...item, widgetId });
      return {
        ...item,
        id: item.id || makeId(`widget_${widgetId}`),
        kind: 'widget',
        widgetId,
        config: normalizeWidgetConfig({ ...item, widgetId }),
        w: size.w,
        h: size.h
      };
    }
    return null;
  }

  function flattenLauncherItems(state) {
    if (!state || !Array.isArray(state.pages)) return [];
    return state.pages.flatMap((page) => (Array.isArray(page?.items) ? page.items : []));
  }

  function canPlaceItem(matrix, x, y, w, h) {
    if (x < 0 || y < 0 || x + w > GRID_COLS || y + h > GRID_ROWS) return false;
    for (let row = y; row < y + h; row += 1) {
      for (let col = x; col < x + w; col += 1) {
        if (matrix[row]?.[col]) return false;
      }
    }
    return true;
  }

  function buildPageMatrix(items, ignoreId = '') {
    const matrix = Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(false));
    (Array.isArray(items) ? items : []).forEach((item) => {
      if (!item || item.id === ignoreId) return;
      const size = getItemSize(item);
      occupyItem(
        matrix,
        clampNumber(item.x || 0, 0, GRID_COLS - size.w),
        clampNumber(item.y || 0, 0, GRID_ROWS - size.h),
        size.w,
        size.h
      );
    });
    return matrix;
  }

  function occupyItem(matrix, x, y, w, h) {
    for (let row = y; row < y + h; row += 1) {
      for (let col = x; col < x + w; col += 1) matrix[row][col] = true;
    }
  }

  function createPage(index) {
    return {
      id: index === 0 ? 'page_home' : `page_${index + 1}`,
      items: [],
      matrix: Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(false))
    };
  }

  function placeItemOnPage(page, item) {
    const size = getItemSize(item);
    const wantedX = clampNumber(item.x || 0, 0, GRID_COLS - size.w);
    const wantedY = clampNumber(item.y || 0, 0, GRID_ROWS - size.h);
    if (canPlaceItem(page.matrix, wantedX, wantedY, size.w, size.h)) {
      occupyItem(page.matrix, wantedX, wantedY, size.w, size.h);
      page.items.push({ ...item, x: wantedX, y: wantedY, w: size.w, h: size.h });
      return true;
    }
    for (let row = 0; row <= GRID_ROWS - size.h; row += 1) {
      for (let col = 0; col <= GRID_COLS - size.w; col += 1) {
        if (!canPlaceItem(page.matrix, col, row, size.w, size.h)) continue;
        occupyItem(page.matrix, col, row, size.w, size.h);
        page.items.push({ ...item, x: col, y: row, w: size.w, h: size.h });
        return true;
      }
    }
    return false;
  }

  function packItemsToPages(items) {
    const sourceItems = Array.isArray(items) ? items.map(normalizeLauncherItem).filter(Boolean) : [];
    const pages = [createPage(0)];
    sourceItems.forEach((item) => {
      let placed = false;
      for (let index = 0; index < pages.length; index += 1) {
        if (placeItemOnPage(pages[index], item)) {
          placed = true;
          break;
        }
      }
      if (!placed) {
        const page = createPage(pages.length);
        placeItemOnPage(page, item);
        pages.push(page);
      }
    });
    return pages.map((page) => ({ id: page.id, items: page.items }));
  }

  function normalizePagesInPlace(pages) {
    const safePages = Array.isArray(pages) && pages.length ? pages : clone(DEFAULT_STATE.pages);
    const normalizedPages = [];
    const overflowItems = [];
    safePages.forEach((page, pageIndex) => {
      const nextPage = { id: page?.id || createPage(pageIndex).id, items: [] };
      const matrix = Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(false));
      (Array.isArray(page?.items) ? page.items : []).forEach((rawItem) => {
        const item = normalizeLauncherItem(rawItem);
        if (!item) return;
        const size = getItemSize(item);
        const wantedX = clampNumber(item.x || 0, 0, GRID_COLS - size.w);
        const wantedY = clampNumber(item.y || 0, 0, GRID_ROWS - size.h);
        if (canPlaceItem(matrix, wantedX, wantedY, size.w, size.h)) {
          occupyItem(matrix, wantedX, wantedY, size.w, size.h);
          nextPage.items.push({ ...item, x: wantedX, y: wantedY, w: size.w, h: size.h });
          return;
        }
        const tempPage = { matrix, items: nextPage.items };
        if (!placeItemOnPage(tempPage, item)) overflowItems.push(item);
      });
      normalizedPages.push(nextPage);
    });
    overflowItems.forEach((item) => {
      let placed = false;
      for (let index = 0; index < normalizedPages.length; index += 1) {
        const page = normalizedPages[index];
        const tempPage = { items: page.items, matrix: buildPageMatrix(page.items) };
        if (placeItemOnPage(tempPage, item)) {
          placed = true;
          break;
        }
      }
      if (!placed) {
        const page = createPage(normalizedPages.length);
        placeItemOnPage(page, item);
        normalizedPages.push({ id: page.id, items: page.items });
      }
    });
    return normalizedPages.length ? normalizedPages : packItemsToPages([]);
  }

  function getAllPageItems(state) {
    return flattenLauncherItems(state);
  }

  function setAllPageItems(state, items) {
    state.pages = packItemsToPages(items);
    currentPageIndex = clampNumber(currentPageIndex, 0, Math.max(0, state.pages.length - 1));
  }

  function getCurrentPage(state) {
    if (!Array.isArray(state.pages) || !state.pages.length) state.pages = packItemsToPages([]);
    currentPageIndex = clampNumber(currentPageIndex, 0, Math.max(0, state.pages.length - 1));
    return state.pages[currentPageIndex] || state.pages[0];
  }

  function getItemPageIndex(state, itemId) {
    const safeId = String(itemId || '');
    return (state.pages || []).findIndex((page) => Array.isArray(page.items) && page.items.some((item) => item.id === safeId));
  }

  function normalizeLauncherState(state) {
    const safe = state && typeof state === 'object' ? state : clone(DEFAULT_STATE);
    if (!safe.customIcons || typeof safe.customIcons !== 'object') safe.customIcons = {};
    if (!safe.customAppNames || typeof safe.customAppNames !== 'object') safe.customAppNames = {};
    if (!Array.isArray(safe.launcherPresets)) safe.launcherPresets = [];
    safe.launcherPresets = safe.launcherPresets
      .filter((preset) => preset && typeof preset === 'object' && preset.data && typeof preset.data === 'object')
      .map((preset) => ({
        id: String(preset.id || makeId('preset')),
        name: String(preset.name || '\u672a\u547d\u540d\u9884\u8bbe'),
        createdAt: String(preset.createdAt || new Date().toISOString()),
        data: preset.data
      }));
    safe.themeMode = safe.themeMode === 'night' ? 'night' : 'day';

    const legacyWallpaper = typeof safe.wallpaper === 'string' ? safe.wallpaper : '';
    const legacyIconStyle = safe.iconStyle && typeof safe.iconStyle === 'object' ? normalizeStyleConfig(safe.iconStyle, 'icon') : null;
    const legacyWidgetStyles = {};
    if (safe.widgetStyles && typeof safe.widgetStyles === 'object') {
      Object.keys(safe.widgetStyles).forEach((itemId) => {
        if (safe.widgetStyles[itemId] && typeof safe.widgetStyles[itemId] === 'object') {
          legacyWidgetStyles[itemId] = normalizeStyleConfig(safe.widgetStyles[itemId], 'widget');
        }
      });
    }

    if (!safe.themeProfiles || typeof safe.themeProfiles !== 'object') safe.themeProfiles = {};
    if (!safe.themeProfiles.day) {
      safe.themeProfiles.day = {
        wallpaper: legacyWallpaper,
        iconStyle: legacyIconStyle,
        widgetStyles: legacyWidgetStyles
      };
    }
    if (!safe.themeProfiles.night) safe.themeProfiles.night = createThemeProfile();
    safe.themeProfiles.day = normalizeThemeProfile(safe.themeProfiles.day);
    safe.themeProfiles.night = normalizeThemeProfile(safe.themeProfiles.night);

    const legacyProfile = ensureThemeProfile(safe, 'day');
    if (!legacyProfile.wallpaper && legacyWallpaper && !safe.themeProfiles.__migratedLegacy) legacyProfile.wallpaper = legacyWallpaper;
    if (!legacyProfile.iconStyle && legacyIconStyle && !safe.themeProfiles.__migratedLegacy) legacyProfile.iconStyle = legacyIconStyle;
    if (!safe.themeProfiles.__migratedLegacy) {
      Object.keys(legacyWidgetStyles).forEach((itemId) => {
        if (!legacyProfile.widgetStyles[itemId]) legacyProfile.widgetStyles[itemId] = legacyWidgetStyles[itemId];
      });
      safe.themeProfiles.__migratedLegacy = true;
    }

    ['day', 'night'].forEach((mode) => {
      const profile = ensureThemeProfile(safe, mode);
      Object.keys(profile.widgetStyles).forEach((itemId) => {
        if (!profile.widgetStyles[itemId] || typeof profile.widgetStyles[itemId] !== 'object') {
          delete profile.widgetStyles[itemId];
        } else {
          profile.widgetStyles[itemId] = normalizeStyleConfig(profile.widgetStyles[itemId], 'widget');
        }
      });
    });

    syncActiveThemeAliases(safe);

    if (safe.themeProfiles && typeof safe.themeProfiles === 'object') {
      Object.keys(safe.themeProfiles).forEach((key) => {
        if (key !== 'day' && key !== 'night' && key !== '__migratedLegacy') {
          delete safe.themeProfiles[key];
        }
      });
      if (safe.themeProfiles.__migratedLegacy !== true) safe.themeProfiles.__migratedLegacy = true;
    }
    safe.showFullscreenStatusBar = safe.showFullscreenStatusBar !== false;
    if (!Array.isArray(safe.pages) || !safe.pages.length) safe.pages = clone(DEFAULT_STATE.pages);
    if (!Array.isArray(safe.dock) || isLegacyDock(safe.dock)) safe.dock = DEFAULT_DOCK.slice();
    safe.dock = safe.dock
      .map((appId) => String(appId || '').trim())
      .filter((appId, index, all) => appId && getPhoneAppById(appId) && all.indexOf(appId) === index)
      .slice(0, 4);

    const dockedApps = new Set(safe.dock);
    const seenGridApps = new Set();
    const seenSingletonWidgets = new Set();
    safe.pages = normalizePagesInPlace(safe.pages).map((page) => ({
      ...page,
      items: page.items.filter((item) => {
        if (item.kind === 'app') {
          if (dockedApps.has(item.appId) || seenGridApps.has(item.appId)) return false;
          seenGridApps.add(item.appId);
          return true;
        }
        const def = getWidgetDef(item.widgetId);
        if (def?.singleton) {
          if (seenSingletonWidgets.has(item.widgetId)) return false;
          seenSingletonWidgets.add(item.widgetId);
        }
        return true;
      })
    })).filter((page, index) => index === 0 || page.items.length);
    const liveItemIds = new Set(flattenLauncherItems(safe).map((item) => item.id));
    ['day', 'night'].forEach((mode) => {
      const profile = ensureThemeProfile(safe, mode);
      Object.keys(profile.widgetStyles).forEach((itemId) => {
        if (!liveItemIds.has(itemId)) delete profile.widgetStyles[itemId];
      });
    });
    syncActiveThemeAliases(safe);
    currentPageIndex = clampNumber(currentPageIndex, 0, Math.max(0, safe.pages.length - 1));
    return safe;
  }

  function ensureLauncherState() {
    const bridge = getBridge();
    const state = bridge && typeof bridge.ensureState === 'function' ? bridge.ensureState() : clone(DEFAULT_STATE);
    return normalizeLauncherState(state);
  }

  function saveState() {
    const bridge = getBridge();
    if (bridge && typeof bridge.save === 'function') bridge.save();
  }

  function scheduleStyleSave() {
    if (styleSaveTimer) window.clearTimeout(styleSaveTimer);
    styleSaveTimer = window.setTimeout(() => {
      styleSaveTimer = null;
      saveState();
    }, 120);
  }

  function suppressImmediateLauncherClick(event, duration = 220) {
    ignoreLauncherClickUntil = Date.now() + duration;
    const clientX = event ? (event.clientX ?? event.x ?? 0) : 0;
    const clientY = event ? (event.clientY ?? event.y ?? 0) : 0;
    ignoreLauncherClickPoint = event
      ? { x: Number(clientX || 0), y: Number(clientY || 0) }
      : null;
  }

  function shouldIgnoreLauncherClick(event) {
    if (!ignoreLauncherClickUntil || Date.now() > ignoreLauncherClickUntil) {
      ignoreLauncherClickUntil = 0;
      ignoreLauncherClickPoint = null;
      return false;
    }
    if (!ignoreLauncherClickPoint) return true;
    const dx = Number(event.clientX || 0) - ignoreLauncherClickPoint.x;
    const dy = Number(event.clientY || 0) - ignoreLauncherClickPoint.y;
    return Math.hypot(dx, dy) <= 26;
  }

  function findItem(state, itemId) {
    return getAllPageItems(state).find((item) => item.id === itemId) || null;
  }

  function getSelectedItem(state) {
    if (!selectedEditTarget) return null;
    if (selectedEditTarget.region === 'grid') return findItem(state, selectedEditTarget.id);
    if (selectedEditTarget.region === 'dock') return { kind: 'dock', appId: selectedEditTarget.appId };
    return null;
  }

  function isSameEditTarget(a, b) {
    if (!a || !b || a.region !== b.region) return false;
    if (a.region === 'grid') return a.id === b.id;
    if (a.region === 'dock') return a.appId === b.appId;
    return false;
  }

  function isTargetActive(target) {
    if (!target) return false;
    if (selectedEditTarget && isSameEditTarget(target, selectedEditTarget)) return true;
    if (launcherMenu?.target && isSameEditTarget(target, launcherMenu.target)) return true;
    if (longPressReadyTarget && isSameEditTarget(target, longPressReadyTarget)) return true;
    if (target.region === 'grid' && editingWidgetId && target.id === editingWidgetId) return true;
    if (target.region === 'grid' && styleEditingTarget?.type === 'widget' && styleEditingTarget.itemId === target.id) return true;
    return false;
  }

  function closestLauncherElement(target, selector) {
    const element = target && target.nodeType === 1 ? target : target?.parentElement;
    return element && typeof element.closest === 'function' ? element.closest(selector) : null;
  }

  function readEditTargetFromElement(element) {
    if (!element) return null;
    const dockTarget = closestLauncherElement(element, '[data-dock-app-id]');
    if (dockTarget) return { region: 'dock', appId: dockTarget.dataset.dockAppId };
    const gridTarget = closestLauncherElement(element, '[data-item-id]');
    if (gridTarget) return { region: 'grid', id: gridTarget.dataset.itemId };
    return null;
  }

  function getRenderedEditElement(target) {
    const root = document.getElementById('phone-launcher-view');
    if (!root || !target) return null;
    if (target.region === 'grid') {
      return Array.from(root.querySelectorAll('[data-item-id]')).find((item) => item.dataset.itemId === target.id) || null;
    }
    if (target.region === 'dock') {
      return Array.from(root.querySelectorAll('[data-dock-app-id]')).find((item) => item.dataset.dockAppId === target.appId) || null;
    }
    return null;
  }

  function getLauncherMenuMetrics(type = launcherMenu?.type) {
    if (type === 'desktop') return { width: 292, height: 520 };
    if (type === 'widget') return { width: 188, height: 156 };
    if (type === 'app') return { width: 230, height: 258 };
    return { width: 230, height: 206 };
  }

  function getLauncherMenuAnchor(type, target, event) {
    const fallback = {
      x: event?.clientX || Math.round(window.innerWidth / 2),
      y: event?.clientY || Math.round(window.innerHeight / 2),
      placement: 'below'
    };
    if (type === 'desktop' || !target) {
      const metrics = getLauncherMenuMetrics(type);
      const x = fallback.x;
      const y = fallback.y;
      const roomAbove = y;
      const roomBelow = window.innerHeight - y;
      const placement = roomBelow >= metrics.height + 18 || roomBelow >= roomAbove ? 'below' : 'above';
      return { x, y, placement };
    }

    const element = getRenderedEditElement(target);
    const rect = element?.getBoundingClientRect?.();
    if (!rect) return fallback;

    const metrics = getLauncherMenuMetrics(type);
    const roomAbove = rect.top;
    const roomBelow = window.innerHeight - rect.bottom;
    const placement = roomAbove >= metrics.height + 18 || roomAbove > roomBelow ? 'above' : 'below';
    return {
      x: rect.left + rect.width / 2,
      y: placement === 'above' ? rect.top : rect.bottom,
      placement
    };
  }

  function getPageStartIndex(state, pageIndex = currentPageIndex) {
    return state.pages.slice(0, pageIndex).reduce((sum, page) => sum + (page.items?.length || 0), 0);
  }

  function findFreeSlotOnPage(page, item, preferredX = 0, preferredY = 0, ignoreId = '') {
    const size = getItemSize(item);
    const matrix = buildPageMatrix(page?.items || [], ignoreId);
    const wantedX = clampNumber(preferredX, 0, GRID_COLS - size.w);
    const wantedY = clampNumber(preferredY, 0, GRID_ROWS - size.h);
    if (canPlaceItem(matrix, wantedX, wantedY, size.w, size.h)) return { x: wantedX, y: wantedY };

    const candidates = [];
    for (let row = 0; row <= GRID_ROWS - size.h; row += 1) {
      for (let col = 0; col <= GRID_COLS - size.w; col += 1) {
        if (!canPlaceItem(matrix, col, row, size.w, size.h)) continue;
        candidates.push({ x: col, y: row, distance: Math.abs(col - wantedX) + Math.abs(row - wantedY) });
      }
    }
    candidates.sort((a, b) => a.distance - b.distance || a.y - b.y || a.x - b.x);
    return candidates[0] || null;
  }

  function placeNewItemOnCurrentPage(state, item, preferredX = 0, preferredY = 0) {
    const page = getCurrentPage(state);
    const slot = findFreeSlotOnPage(page, item, preferredX, preferredY);
    if (!slot) {
      const nextPage = createPage(state.pages.length);
      state.pages.push({ id: nextPage.id, items: [] });
      currentPageIndex = state.pages.length - 1;
      const fallback = findFreeSlotOnPage(state.pages[currentPageIndex], item, 0, 0) || { x: 0, y: 0 };
      state.pages[currentPageIndex].items.push({ ...item, x: fallback.x, y: fallback.y, w: getItemSize(item).w, h: getItemSize(item).h });
      return item;
    }
    page.items.push({ ...item, x: slot.x, y: slot.y, w: getItemSize(item).w, h: getItemSize(item).h });
    return item;
  }

  function findSlotInMatrix(matrix, item, preferredX = 0, preferredY = 0) {
    const size = getItemSize(item);
    const wantedX = clampNumber(preferredX, 0, GRID_COLS - size.w);
    const wantedY = clampNumber(preferredY, 0, GRID_ROWS - size.h);
    if (canPlaceItem(matrix, wantedX, wantedY, size.w, size.h)) return { x: wantedX, y: wantedY };
    const candidates = [];
    for (let row = 0; row <= GRID_ROWS - size.h; row += 1) {
      for (let col = 0; col <= GRID_COLS - size.w; col += 1) {
        if (!canPlaceItem(matrix, col, row, size.w, size.h)) continue;
        candidates.push({ x: col, y: row, distance: Math.abs(col - wantedX) + Math.abs(row - wantedY) });
      }
    }
    candidates.sort((a, b) => a.distance - b.distance || a.y - b.y || a.x - b.x);
    return candidates[0] || null;
  }

  function swapGridItemsOnPage(page, sourceItem, targetItem) {
    if (!page || !sourceItem || !targetItem || sourceItem.id === targetItem.id) return false;
    const sourceSize = getItemSize(sourceItem);
    const targetSize = getItemSize(targetItem);
    const sourcePos = { x: sourceItem.x || 0, y: sourceItem.y || 0 };
    const targetPos = { x: targetItem.x || 0, y: targetItem.y || 0 };
    const matrix = buildPageMatrix(page.items.filter((item) => item.id !== sourceItem.id && item.id !== targetItem.id));
    const sourceSlot = findSlotInMatrix(matrix, sourceItem, targetPos.x, targetPos.y);
    if (!sourceSlot) return false;
    occupyItem(matrix, sourceSlot.x, sourceSlot.y, sourceSize.w, sourceSize.h);
    const targetSlot = findSlotInMatrix(matrix, targetItem, sourcePos.x, sourcePos.y);
    if (!targetSlot) return false;
    sourceItem.x = clampNumber(sourceSlot.x, 0, GRID_COLS - sourceSize.w);
    sourceItem.y = clampNumber(sourceSlot.y, 0, GRID_ROWS - sourceSize.h);
    targetItem.x = clampNumber(targetSlot.x, 0, GRID_COLS - targetSize.w);
    targetItem.y = clampNumber(targetSlot.y, 0, GRID_ROWS - targetSize.h);
    return true;
  }

  function showLauncherToast(message, type) {
    const bridge = getBridge();
    if (bridge && typeof bridge.showToast === 'function') {
      bridge.showToast(message, type || 'info');
      return;
    }
    console.warn('[PhoneLauncher]', message);
  }

  async function openIdicPhoneApp(appId) {
    const bridge = getBridge();
    if (!bridge || typeof bridge.openApp !== 'function') {
      showLauncherToast('\u684c\u9762\u6865\u63a5\u8fd8\u6ca1\u52a0\u8f7d\u5b8c\u3002', 'error');
      return false;
    }
    try {
      return await bridge.openApp(appId);
    } catch (error) {
      console.error('[PhoneLauncher] open app failed:', appId, error);
      showLauncherToast('\u5e94\u7528\u6253\u5f00\u5931\u8d25\u3002', 'error');
      return false;
    }
  }

  function applyLauncherClasses(view, state) {
    view.classList.remove(
      'phone-launcher-theme-day',
      'phone-launcher-theme-night',
      'phone-launcher-mode-shell',
      'phone-launcher-mode-fullscreen',
      'phone-launcher-hide-fullscreen-statusbar',
      'phone-launcher-editing',
      'phone-launcher-edge-left',
      'phone-launcher-edge-right',
      'phone-launcher-page-next',
      'phone-launcher-page-prev'
    );
    view.classList.add(`phone-launcher-theme-${state.themeMode === 'night' ? 'night' : 'day'}`);
    view.classList.add(`phone-launcher-mode-${state.viewMode === 'phone-fullscreen' ? 'fullscreen' : 'shell'}`);
    if (state.viewMode === 'phone-fullscreen' && state.showFullscreenStatusBar === false) {
      view.classList.add('phone-launcher-hide-fullscreen-statusbar');
    }
    if (editMode) view.classList.add('phone-launcher-editing');
    view.classList.toggle('phone-launcher-menu-open', Boolean(launcherMenu));
    if (pageTransitionDirection) view.classList.add(pageTransitionDirection === 'next' ? 'phone-launcher-page-next' : 'phone-launcher-page-prev');
  }

  function getWeatherSummary() {
    const bridge = getBridge();
    if (bridge && typeof bridge.getWeatherSummary === 'function') return bridge.getWeatherSummary();
    return { city: '\u672a\u8bbe\u7f6e\u5730\u533a', temp: '--\u00b0', desc: '\u70b9\u51fb\u8bbe\u7f6e', hasWeather: false };
  }

  function renderIconGraphic(app, state) {
    const customIcon = state.customIcons && state.customIcons[app.id];
    if (customIcon) {
      if (/^\s*<svg[\s>]/i.test(customIcon)) return customIcon;
      return `<img src="${escapeHtml(customIcon)}" alt="">`;
    }
    return app.icon;
  }

  function imageMarkup(src, fallback = '') {
    const value = String(src || '').trim();
    if (!value) return fallback;
    return `<img src="${escapeHtml(value)}" alt="">`;
  }

  function inlineWidgetTextAttrs(item, path) {
    if (!item?.id || !path || editingWidgetId !== item.id) return '';
    return ` contenteditable="plaintext-only" spellcheck="false" data-inline-widget-text="${escapeHtml(item.id)}" data-inline-widget-path="${escapeHtml(path)}"`;
  }

  function inlineWidgetUploadAttrs(item, path) {
    if (!item?.id || !path || editingWidgetId !== item.id) return '';
    return ` data-inline-widget-upload="${escapeHtml(item.id)}" data-inline-widget-path="${escapeHtml(path)}"`;
  }

  function inlineAppIconAttrs(app, options) {
    if (!editMode || !app) return '';
    const itemAttr = options.itemId ? ` data-inline-item-id="${escapeHtml(options.itemId)}"` : '';
    return ` data-inline-app-icon="${escapeHtml(app.id)}" data-inline-region="${escapeHtml(options.region || 'grid')}"${itemAttr}`;
  }

  function inlineAppNameAttrs(app, options) {
    if (!app || renamingAppId !== app.id) return '';
    const itemAttr = options.itemId ? ` data-inline-item-id="${escapeHtml(options.itemId)}"` : '';
    return ` contenteditable="plaintext-only" spellcheck="false" data-inline-app-name="${escapeHtml(app.id)}" data-inline-region="${escapeHtml(options.region || 'grid')}"${itemAttr}`;
  }

  function renderWeatherWidget(item) {
    const weather = getWeatherSummary();
    return `
      <button class="phone-launcher-widget phone-launcher-widget-weather" type="button" data-widget-open="weather">
        <span class="phone-launcher-weather-left">
          <span class="phone-launcher-weather-city">${escapeHtml(weather.city)}</span>
          <span class="phone-launcher-weather-desc">${escapeHtml(weather.desc)}</span>
        </span>
        <span class="phone-launcher-weather-temp">${escapeHtml(weather.temp)}</span>
      </button>
    `;
  }

  function renderImageWidget(item) {
    const src = item.config?.src || item.image || '';
    return `
      <button class="phone-launcher-widget phone-launcher-widget-image" type="button">
        <span class="phone-launcher-widget-image-target"${inlineWidgetUploadAttrs(item, 'src')}>
          ${src ? imageMarkup(src) : '<span>+</span>'}
        </span>
      </button>
    `;
  }

  function renderClockWidget(item) {
    return `
      <button class="phone-launcher-widget phone-launcher-widget-clock" type="button">
        <span class="phone-launcher-clock-time" data-pl-clock>--:--</span>
        <span class="phone-launcher-clock-quote"${inlineWidgetTextAttrs(item, 'quote')}>${escapeHtml(item.config?.quote || '')}</span>
      </button>
    `;
  }

  function renderPolaroidWidget(item) {
    const photos = Array.isArray(item.config?.photos) ? item.config.photos : ['', '', ''];
    const small = item.widgetId === 'polaroidSmall';
    const positions = small
      ? [['7%', '12%', '34%', '65%', '-7deg', 2], ['34%', '8%', '34%', '65%', '5deg', 3], ['59%', '15%', '34%', '65%', '-3deg', 1]]
      : [['8%', '9%', '30%', '58%', '-7deg', 2], ['34%', '22%', '30%', '58%', '5deg', 3], ['59%', '10%', '30%', '58%', '-3deg', 1]];
    return `
      <button class="phone-launcher-widget phone-launcher-widget-polaroid ${small ? 'small' : ''}" type="button">
        ${positions.map((position, index) => `
          <span class="phone-launcher-polaroid-photo" style="left:${position[0]};top:${position[1]};width:${position[2]};height:${position[3]};transform:rotate(${position[4]});z-index:${position[5]}"${inlineWidgetUploadAttrs(item, `photos.${index}`)}>
            ${photos[index] ? imageMarkup(photos[index]) : `<span class="phone-launcher-widget-placeholder">\u56fe${index + 1}</span>`}
          </span>
        `).join('')}
      </button>
    `;
  }

  function renderMusicWidget(item) {
    const cfg = item.config || {};
    return `
      <button class="phone-launcher-widget phone-launcher-widget-music" type="button">
        <span class="phone-launcher-music-cover"${inlineWidgetUploadAttrs(item, 'cover')}>${cfg.cover ? imageMarkup(cfg.cover) : WIDGET_ICONS.music}</span>
        <span class="phone-launcher-music-info">
          <span class="phone-launcher-music-title"${inlineWidgetTextAttrs(item, 'title')}>${escapeHtml(cfg.title || '')}</span>
          <span class="phone-launcher-music-artist"${inlineWidgetTextAttrs(item, 'artist')}>${escapeHtml(cfg.artist || '')}</span>
          <span class="phone-launcher-music-progress"><span></span></span>
        </span>
        <span class="phone-launcher-music-controls">
          <span>${WIDGET_ICONS.prev}</span>
          <span class="play">${WIDGET_ICONS.play}</span>
          <span>${WIDGET_ICONS.next}</span>
        </span>
      </button>
    `;
  }

  function renderCdWidget(item) {
    const cfg = item.config || {};
    return `
      <button class="phone-launcher-widget phone-launcher-widget-cd" type="button">
        <span class="phone-launcher-cd-disc ${cfg.centerRotate === false ? 'center-still' : ''}"${inlineWidgetUploadAttrs(item, 'cover')}>
          ${cfg.cover ? imageMarkup(cfg.cover) : WIDGET_ICONS.music}
        </span>
      </button>
    `;
  }

  function renderWidget(item) {
    if (window.IDICAestheticPack && typeof window.IDICAestheticPack.renderWidget === 'function') {
      const customHTML = window.IDICAestheticPack.renderWidget(item, {
        editMode,
        text: inlineWidgetTextAttrs,
        upload: inlineWidgetUploadAttrs
      });
      if (customHTML) return customHTML;
    }
    if (item.widgetId === 'weather') return renderWeatherWidget(item);
    if (item.widgetId === 'image') return renderImageWidget(item);
    if (item.widgetId === 'clock') return renderClockWidget(item);
    if (item.widgetId === 'polaroid' || item.widgetId === 'polaroidSmall') return renderPolaroidWidget(item);
    if (item.widgetId === 'music') return renderMusicWidget(item);
    if (item.widgetId === 'cd') return renderCdWidget(item);
    return '';
  }

  function renderAppIcon(appId, state, options = {}) {
    const app = getPhoneAppById(appId);
    if (!app) return '';
    const appName = getPhoneAppName(app, state);
    const target = options.region === 'dock'
      ? { region: 'dock', appId }
      : (options.itemId ? { region: 'grid', id: options.itemId } : null);
    const selected = isTargetActive(target);
    const attrs = options.region === 'dock'
      ? `data-dock-app-id="${escapeHtml(app.id)}" draggable="false"`
      : `data-app-id="${escapeHtml(app.id)}"`;
    const activeIconStyle = getActiveIconStyle(state);
    const iconVars = activeIconStyle ? styleToCss(activeIconStyle, 'icon', state) : '';
    const iconStyle = iconVars ? ` style="${iconVars}"` : '';
    const appStyle = iconVars ? ` style="${iconVars}"` : '';
    const customIconClass = activeIconStyle ? ' has-custom-icon-style' : '';
    return `
      <button class="phone-launcher-app${customIconClass} ${selected ? 'is-selected' : ''}" type="button" ${attrs} title="${escapeHtml(appName)}"${appStyle}>
        <span class="phone-launcher-app-icon"${inlineAppIconAttrs(app, options)}${iconStyle}>${renderIconGraphic(app, state)}</span>
        <span class="phone-launcher-app-label"${inlineAppNameAttrs(app, options)}>${escapeHtml(appName)}</span>
      </button>
    `;
  }

  function renderGridItem(item, state) {
    const size = getItemSize(item);
    const selected = isTargetActive({ region: 'grid', id: item.id });
    const widgetStyle = item.kind === 'widget' ? getActiveWidgetStyle(state, item.id) : null;
    const customStyle = widgetStyle
      ? `;${styleToCss(widgetStyle, 'widget', state)}`
      : '';
    const style = `grid-column:${Number(item.x || 0) + 1} / span ${size.w};grid-row:${Number(item.y || 0) + 1} / span ${size.h}${customStyle};`;
    const hasCustomStyle = item.kind === 'widget' && Boolean(widgetStyle);
    const content = item.kind === 'app'
      ? renderAppIcon(item.appId, state, { region: 'grid', itemId: item.id })
      : renderWidget(item);
    return `
      <div class="phone-launcher-grid-item ${item.kind === 'widget' ? `is-widget is-${escapeHtml(item.widgetId)} ${hasCustomStyle ? 'has-custom-style' : ''} ${editingWidgetId === item.id ? 'is-widget-editing' : ''}` : 'is-app'} ${selected ? 'is-selected' : ''}"
        data-item-id="${escapeHtml(item.id)}"
        draggable="false"
        style="${style}">
        ${content}
      </div>
    `;
  }

  function renderLauncherItems(state) {
    const page = getCurrentPage(state);
    const itemsHTML = (page.items || []).map((item) => renderGridItem(item, state)).join('');
    if (!dragPreviewSlot || dragPreviewSlot.pageIndex !== currentPageIndex) return itemsHTML;
    const style = `grid-column:${dragPreviewSlot.x + 1} / span ${dragPreviewSlot.w};grid-row:${dragPreviewSlot.y + 1} / span ${dragPreviewSlot.h};`;
    return `${itemsHTML}<div class="phone-launcher-grid-placeholder" style="${style}"></div>`;
  }

  function renderLauncherDock(state) {
    const dock = Array.isArray(state.dock) ? state.dock : DEFAULT_DOCK;
    return dock.slice(0, 4).map((appId) => {
      const selected = isTargetActive({ region: 'dock', appId });
      const activeIconStyle = getActiveIconStyle(state);
      return `
        <div class="phone-launcher-dock-item ${activeIconStyle ? 'has-custom-icon-style' : ''} ${selected ? 'is-selected' : ''}">
          ${renderAppIcon(appId, state, { region: 'dock' })}
        </div>
      `;
    }).join('');
  }

  function renderPageDots(state) {
    const pages = Array.isArray(state.pages) && state.pages.length ? state.pages : [{ id: 'page_home', items: [] }];
    return `
      <div class="phone-launcher-page-dots">
        ${pages.map((page, index) => `
          <button type="button" class="${index === currentPageIndex ? 'active' : ''}" data-page-dot="${index}" aria-label="page ${index + 1}"></button>
        `).join('')}
      </div>
    `;
  }

  function getUsedAppIds(state) {
    const ids = new Set((state.dock || []).map((appId) => String(appId || '').trim()).filter(Boolean));
    getAllPageItems(state).forEach((item) => {
      if (item && item.kind === 'app' && item.appId) ids.add(String(item.appId));
    });
    return ids;
  }

  function renderEditorLibrary(state) {
    const usedApps = getUsedAppIds(state);
    const availableApps = APP_REGISTRY.filter((app) => !usedApps.has(app.id));
    let ALL_WIDGETS = WIDGET_REGISTRY;
    if (window.IDICAestheticPack && Array.isArray(window.IDICAestheticPack.NEW_WIDGETS)) {
      ALL_WIDGETS = ALL_WIDGETS.concat(window.IDICAestheticPack.NEW_WIDGETS);
    }
    const widgetTiles = ALL_WIDGETS.map((widget) => {
      const existing = widget.singleton ? getAllPageItems(state).find((item) => item.kind === 'widget' && item.widgetId === widget.id) : null;
      return `
        <button class="phone-launcher-diy-tile" type="button" data-add-widget="${escapeHtml(widget.id)}">
          <span class="phone-launcher-diy-tile-icon">${widget.icon}</span>
          <span class="phone-launcher-diy-tile-name">${escapeHtml(widget.name)}</span>
          <span class="phone-launcher-diy-tile-size">${existing ? '\u5df2\u6709' : escapeHtml(widget.size)}</span>
        </button>
      `;
    }).join('');
    const appTiles = availableApps.map((app) => `
      <button class="phone-launcher-diy-tile" type="button" data-add-app="${escapeHtml(app.id)}">
        <span class="phone-launcher-diy-tile-icon">${renderIconGraphic(app, state)}</span>
        <span class="phone-launcher-diy-tile-name">${escapeHtml(getPhoneAppName(app, state))}</span>
        <span class="phone-launcher-diy-tile-size">APP</span>
      </button>
    `).join('');
    return `<div class="phone-launcher-diy-library">${widgetTiles}${appTiles}</div>`;
  }

  function renderWallpaperEditor(state) {
    return `
      <label class="phone-launcher-diy-field">
        <span>\u58c1\u7eb8 URL</span>
        <input type="text" data-wallpaper-url value="${getActiveWallpaper(state) && /^https?:\/\//.test(getActiveWallpaper(state)) ? escapeHtml(getActiveWallpaper(state)) : ''}" placeholder="https://...">
      </label>
      <div class="phone-launcher-diy-row">
        <button class="phone-launcher-diy-btn" type="button" data-edit-action="wallpaper">\u4e0a\u4f20\u58c1\u7eb8</button>
        <button class="phone-launcher-diy-btn danger" type="button" data-edit-action="clear-wallpaper">\u6e05\u9664</button>
      </div>
    `;
  }

  function renderWidgetHeader(widgetId) {
    const def = getWidgetDef(widgetId);
    return `
      <div class="phone-launcher-diy-selected-head">
        <span class="phone-launcher-diy-selected-icon">${def?.icon || ''}</span>
        <span><strong>${escapeHtml(def?.name || widgetId)}</strong><small>${escapeHtml(def?.size || '')}</small></span>
      </div>
    `;
  }

  function renderWidgetTextField(item, path, label, value, placeholder = 'https://...') {
    return `
      <label class="phone-launcher-diy-field">
        <span>${escapeHtml(label)}</span>
        <input type="text" data-widget-prop="${escapeHtml(item.id)}" data-widget-prop-path="${escapeHtml(path)}" value="${escapeHtml(value || '')}" placeholder="${escapeHtml(placeholder)}">
      </label>
    `;
  }

  function renderWidgetUploadButton(item, path, label) {
    return `<button class="phone-launcher-diy-btn" type="button" data-edit-action="widget-upload" data-widget-upload-item="${escapeHtml(item.id)}" data-widget-upload-path="${escapeHtml(path)}">${escapeHtml(label)}</button>`;
  }

  function renderStyleField(state, type, field, label, inputType, extra = '') {
    const style = getEditableStyle(state, styleEditingTarget);
    const defaults = getDefaultStyleForState(state, type);
    const value = style?.[field];
    if (inputType === 'color') {
      const color = value || defaults[field] || '#ffffff';
      return `
        <label class="phone-launcher-style-field is-color">
          <span>${escapeHtml(label)}</span>
          <span class="phone-launcher-style-color-row">
            <input type="color" data-style-field="${escapeHtml(field)}" value="${escapeHtml(color)}">
            <input type="text" data-style-field="${escapeHtml(field)}" data-style-color-text="1" value="${escapeHtml(color)}" spellcheck="false" inputmode="text">
          </span>
        </label>
      `;
    }
    if (inputType === 'checkbox') {
      return `
        <label class="phone-launcher-style-check">
          <input type="checkbox" data-style-field="${escapeHtml(field)}" ${value ? 'checked' : ''}>
          <span>${escapeHtml(label)}</span>
        </label>
      `;
    }
    if (inputType === 'select') {
      const options = [
        ['down', '\u5411\u4e0b'],
        ['down-right', '\u53f3\u4e0b'],
        ['down-left', '\u5de6\u4e0b'],
        ['up', '\u5411\u4e0a'],
        ['flat', '\u5c45\u4e2d']
      ];
      return `
        <label class="phone-launcher-style-field">
          <span>${escapeHtml(label)}</span>
          <select data-style-field="${escapeHtml(field)}">
            ${options.map(([key, text]) => `<option value="${key}" ${value === key ? 'selected' : ''}>${text}</option>`).join('')}
          </select>
        </label>
      `;
    }
    const attrs = extra || 'min="0" max="100" step="1"';
    return `
      <label class="phone-launcher-style-field">
        <span>${escapeHtml(label)}<b data-style-value="${escapeHtml(field)}">${escapeHtml(value)}</b></span>
        <input type="${escapeHtml(inputType)}" data-style-field="${escapeHtml(field)}" value="${escapeHtml(value)}" ${attrs}>
      </label>
    `;
  }

  function updateStylePanelValue(field, value) {
    const panel = document.querySelector('#phone-launcher-view .phone-launcher-style-panel');
    if (!panel) return;
    panel.querySelectorAll(`[data-style-value="${escapeCssIdent(field)}"]`).forEach((item) => {
      item.textContent = String(value);
    });
  }

  function applyCurrentStyleToDom(state) {
    if (!styleEditingTarget) return;
    const type = styleEditingTarget.type === 'icon' ? 'icon' : 'widget';
    if (type === 'icon') {
      const activeIconStyle = getActiveIconStyle(state);
      const styleText = activeIconStyle ? styleToCss(activeIconStyle, 'icon', state) : '';
      document.querySelectorAll('#phone-launcher-view .phone-launcher-app-icon').forEach((icon) => {
        if (styleText) icon.setAttribute('style', styleText);
        else icon.removeAttribute('style');
      });
      document.querySelectorAll('#phone-launcher-view .phone-launcher-app').forEach((app) => {
        app.classList.toggle('has-custom-icon-style', Boolean(styleText));
        if (styleText) app.setAttribute('style', styleText);
        else app.removeAttribute('style');
      });
      return;
    }
    const itemId = styleEditingTarget.itemId;
    const item = itemId ? findItem(state, itemId) : null;
    const target = itemId ? document.querySelector(`#phone-launcher-view [data-item-id="${escapeCssIdent(itemId)}"]`) : null;
    if (!target || !item) return;
    const widgetStyle = getActiveWidgetStyle(state, itemId);
    const styleText = widgetStyle ? styleToCss(widgetStyle, 'widget', state) : '';
    const size = getItemSize(item);
    const positionStyle = `grid-column:${Number(item.x || 0) + 1} / span ${size.w};grid-row:${Number(item.y || 0) + 1} / span ${size.h};`;
    target.setAttribute('style', `${positionStyle}${styleText ? `;${styleText}` : ''}`);
    target.classList.toggle('has-custom-style', Boolean(styleText));
  }

  function applyAllCurrentStylesToDom(state) {
    const activeIconStyle = getActiveIconStyle(state);
    const iconStyleText = activeIconStyle ? styleToCss(activeIconStyle, 'icon', state) : '';
    document.querySelectorAll('#phone-launcher-view .phone-launcher-app-icon').forEach((icon) => {
      if (iconStyleText) icon.setAttribute('style', iconStyleText);
      else icon.removeAttribute('style');
    });
    document.querySelectorAll('#phone-launcher-view .phone-launcher-app').forEach((app) => {
      app.classList.toggle('has-custom-icon-style', Boolean(iconStyleText));
      if (iconStyleText) app.setAttribute('style', iconStyleText);
      else app.removeAttribute('style');
    });
    getAllPageItems(state).forEach((item) => {
      if (!item || item.kind !== 'widget') return;
      const target = document.querySelector(`#phone-launcher-view [data-item-id="${escapeCssIdent(item.id)}"]`);
      if (!target) return;
      const widgetStyle = getActiveWidgetStyle(state, item.id);
      const styleText = widgetStyle ? styleToCss(widgetStyle, 'widget', state) : '';
      const size = getItemSize(item);
      const positionStyle = `grid-column:${Number(item.x || 0) + 1} / span ${size.w};grid-row:${Number(item.y || 0) + 1} / span ${size.h};`;
      target.setAttribute('style', `${positionStyle}${styleText ? `;${styleText}` : ''}`);
      target.classList.toggle('has-custom-style', Boolean(styleText));
    });
  }

  function renderStyleEditor(state) {
    if (!styleEditingTarget) return '';
    const type = styleEditingTarget.type === 'icon' ? 'icon' : 'widget';
    if (type === 'widget' && !findItem(state, styleEditingTarget.itemId)) return '';
    return `
      <div class="phone-launcher-style-panel" data-style-panel="1">
        <div class="phone-launcher-style-head">
          <strong>${type === 'icon' ? '\u56fe\u6807\u989c\u8272' : '\u7ec4\u4ef6\u914d\u8272'}</strong>
          <span>
            <button type="button" data-style-action="reset">\u590d\u539f</button>
            <button type="button" data-style-action="close">\u786e\u5b9a</button>
          </span>
        </div>
        <div class="phone-launcher-style-grid">
          ${renderStyleField(state, type, 'bgColor', '\u5e95\u8272', 'color')}
          ${renderStyleField(state, type, 'bgOpacity', '\u4e0d\u900f\u660e\u5ea6', 'range', 'min="0" max="100" step="1"')}
          ${renderStyleField(state, type, 'textColor', '\u6587\u5b57', 'color')}
          ${renderStyleField(state, type, 'accentColor', '\u70b9\u7f00', 'color')}
          ${renderStyleField(state, type, 'glass', '\u6bdb\u73bb\u7483', 'checkbox')}
          ${renderStyleField(state, type, 'glassGlobal', '\u6bdb\u73bb\u7483\u5e94\u7528\u5168\u5c40', 'checkbox')}
          ${renderStyleField(state, type, 'border', '\u63cf\u8fb9', 'checkbox')}
          ${renderStyleField(state, type, 'borderWidth', '\u63cf\u8fb9\u7c97\u7ec6', 'range', 'min="0" max="8" step="1"')}
          ${renderStyleField(state, type, 'borderColor', '\u63cf\u8fb9\u8272', 'color')}
          ${renderStyleField(state, type, 'borderGlobal', '\u63cf\u8fb9\u5e94\u7528\u5168\u5c40', 'checkbox')}
          ${renderStyleField(state, type, 'shadow', '\u6295\u5f71', 'checkbox')}
          ${renderStyleField(state, type, 'shadowDirection', '\u65b9\u5411', 'select')}
          ${renderStyleField(state, type, 'shadowBlur', '\u8303\u56f4', 'range', 'min="0" max="60" step="1"')}
          ${renderStyleField(state, type, 'shadowDepth', '\u6df1\u6d45', 'range', 'min="0" max="60" step="1"')}
          ${renderStyleField(state, type, 'shadowOpacity', '\u900f\u660e\u5ea6', 'range', 'min="0" max="100" step="1"')}
          ${renderStyleField(state, type, 'shadowColor', '\u6295\u5f71\u8272', 'color')}
          ${renderStyleField(state, type, 'shadowSolid', '\u5b9e\u8272', 'checkbox')}
          ${renderStyleField(state, type, 'shadowGlobal', '\u6295\u5f71\u5e94\u7528\u5168\u5c40', 'checkbox')}
        </div>
      </div>
    `;
  }

  function renderSvgEditor(state) {
    if (!svgEditingAppId) return '';
    const app = getPhoneAppById(svgEditingAppId);
    if (!app) return '';
    const value = state.customIcons?.[svgEditingAppId] || '';
    return `
      <div class="phone-launcher-svg-panel" data-svg-panel="1">
        <div class="phone-launcher-style-head">
          <strong>\u66f4\u6539 SVG</strong>
          <span>
            <button type="button" data-svg-action="reset">\u6e05\u9664</button>
            <button type="button" data-svg-action="save">\u786e\u5b9a</button>
          </span>
        </div>
        <textarea data-svg-icon-input="${escapeHtml(svgEditingAppId)}" spellcheck="false" placeholder="&lt;svg ...&gt;">${escapeHtml(value && /^\s*<svg[\s>]/i.test(value) ? value : '')}</textarea>
      </div>
    `;
  }

  function renderSelectedProps(state) {
    const selected = getSelectedItem(state);
    if (!selected) return '<div class="phone-launcher-diy-empty">\u672a\u9009\u4e2d</div>';

    if (window.IDICAestheticPack && selected.kind === 'widget' && typeof window.IDICAestheticPack.renderProps === 'function') {
      const customProps = window.IDICAestheticPack.renderProps(
        selected,
        renderWidgetTextField,
        renderWidgetUploadButton,
        renderWidgetHeader
      );
      if (customProps) return customProps;
    }

    if (selected.kind === 'app' || selected.kind === 'dock') {
      const app = getPhoneAppById(selected.appId);
      const customIcon = state.customIcons && state.customIcons[selected.appId] ? state.customIcons[selected.appId] : '';
      const customName = state.customAppNames && state.customAppNames[selected.appId] ? state.customAppNames[selected.appId] : '';
      const dockFull = Array.isArray(state.dock) && state.dock.length >= 4 && !state.dock.includes(selected.appId);
      return `
        <div class="phone-launcher-diy-selected-head">
          <span class="phone-launcher-diy-selected-icon">${app ? renderIconGraphic(app, state) : ''}</span>
          <span><strong>${escapeHtml(app ? getPhoneAppName(app, state) : selected.appId)}</strong><small>APP</small></span>
        </div>
        <label class="phone-launcher-diy-field">
          <span>\u5e94\u7528\u540d</span>
          <input type="text" data-app-name="${escapeHtml(selected.appId)}" value="${escapeHtml(customName)}" placeholder="${escapeHtml(app?.name || '')}">
        </label>
        <label class="phone-launcher-diy-field">
          <span>\u56fe\u6807 URL / SVG</span>
          <input type="text" data-custom-icon-app="${escapeHtml(selected.appId)}" value="${escapeHtml(customIcon)}" placeholder="https://... \u6216 <svg>">
        </label>
        <div class="phone-launcher-diy-row">
          <button class="phone-launcher-diy-btn" type="button" data-edit-action="icon">\u4e0a\u4f20\u56fe\u6807</button>
          <button class="phone-launcher-diy-btn" type="button" data-edit-action="clear-icon">\u6062\u590d</button>
        </div>
        <div class="phone-launcher-diy-row">
          ${selected.kind === 'app'
            ? `<button class="phone-launcher-diy-btn" type="button" data-edit-action="dock" ${dockFull ? 'disabled' : ''}>\u653e\u5230\u5e95\u680f</button>`
            : '<button class="phone-launcher-diy-btn" type="button" data-edit-action="dock">\u79fb\u51fa\u5e95\u680f</button>'}
          <button class="phone-launcher-diy-btn danger" type="button" data-edit-action="remove">\u5220\u9664</button>
        </div>
      `;
    }

    if (selected.kind !== 'widget') return '<div class="phone-launcher-diy-empty">\u65e0\u5c5e\u6027</div>';

    const cfg = selected.config || {};
    if (selected.widgetId === 'weather') {
      return `
        ${renderWidgetHeader(selected.widgetId)}
        <div class="phone-launcher-diy-row">
          <button class="phone-launcher-diy-btn danger" type="button" data-edit-action="remove">\u5220\u9664</button>
        </div>
      `;
    }
    if (selected.widgetId === 'image') {
      return `
        ${renderWidgetHeader(selected.widgetId)}
        ${renderWidgetTextField(selected, 'src', '\u56fe\u7247 URL', cfg.src)}
        <div class="phone-launcher-diy-row">
          ${renderWidgetUploadButton(selected, 'src', '\u4e0a\u4f20\u56fe\u7247')}
          <button class="phone-launcher-diy-btn danger" type="button" data-edit-action="remove">\u5220\u9664</button>
        </div>
      `;
    }
    if (selected.widgetId === 'clock') {
      return `
        ${renderWidgetHeader(selected.widgetId)}
        ${renderWidgetTextField(selected, 'quote', '\u5e95\u90e8\u6587\u5b57', cfg.quote, '')}
        <div class="phone-launcher-diy-row">
          <button class="phone-launcher-diy-btn danger" type="button" data-edit-action="remove">\u5220\u9664</button>
        </div>
      `;
    }
    if (selected.widgetId === 'polaroid' || selected.widgetId === 'polaroidSmall') {
      const photos = Array.isArray(cfg.photos) ? cfg.photos : ['', '', ''];
      return `
        ${renderWidgetHeader(selected.widgetId)}
        ${[0, 1, 2].map((index) => `
          ${renderWidgetTextField(selected, `photos.${index}`, `\u56fe\u7247 ${index + 1} URL`, photos[index])}
          <div class="phone-launcher-diy-row compact">${renderWidgetUploadButton(selected, `photos.${index}`, `\u4e0a\u4f20\u56fe${index + 1}`)}</div>
        `).join('')}
        <div class="phone-launcher-diy-row">
          <button class="phone-launcher-diy-btn danger" type="button" data-edit-action="remove">\u5220\u9664</button>
        </div>
      `;
    }
    if (selected.widgetId === 'music') {
      return `
        ${renderWidgetHeader(selected.widgetId)}
        ${renderWidgetTextField(selected, 'title', '\u6b4c\u540d', cfg.title, '')}
        ${renderWidgetTextField(selected, 'artist', '\u827a\u672f\u5bb6', cfg.artist, '')}
        ${renderWidgetTextField(selected, 'cover', '\u5c01\u9762 URL', cfg.cover)}
        <div class="phone-launcher-diy-row">
          ${renderWidgetUploadButton(selected, 'cover', '\u4e0a\u4f20\u5c01\u9762')}
          <button class="phone-launcher-diy-btn danger" type="button" data-edit-action="remove">\u5220\u9664</button>
        </div>
      `;
    }
    if (selected.widgetId === 'cd') {
      return `
        ${renderWidgetHeader(selected.widgetId)}
        ${renderWidgetTextField(selected, 'cover', 'CD \u56fe\u7247 URL', cfg.cover)}
        <label class="phone-launcher-diy-check">
          <input type="checkbox" data-widget-check="${escapeHtml(selected.id)}" data-widget-check-path="centerRotate" ${cfg.centerRotate !== false ? 'checked' : ''}>
          <span>\u5c01\u9762\u8ddf\u968f\u65cb\u8f6c</span>
        </label>
        <div class="phone-launcher-diy-row">
          ${renderWidgetUploadButton(selected, 'cover', '\u4e0a\u4f20 CD \u56fe')}
          <button class="phone-launcher-diy-btn danger" type="button" data-edit-action="remove">\u5220\u9664</button>
        </div>
      `;
    }

    return '<div class="phone-launcher-diy-empty">\u65e0\u5c5e\u6027</div>';
  }

  function renderPhoneLauncherEditor(state) {
    const popover = editPanelTab === 'add'
      ? `<div class="phone-launcher-diy-popover">${renderEditorLibrary(state)}</div>`
      : '';
    return `${renderLauncherContextMenu(state)}${popover}${renderStyleEditor(state)}${renderSvgEditor(state)}${renderCropModal()}`;
  }

  function renderCropModal() {
    if (!cropSession) return '';
    const aspect = Number(cropSession.aspect || 1);
    const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
    return `
      <div class="phone-launcher-crop-modal" data-crop-modal="1">
        <div class="phone-launcher-crop-box">
          <div class="phone-launcher-crop-frame" style="aspect-ratio:${safeAspect}">
            <img src="${escapeHtml(cropSession.src)}" alt="" style="--pl-crop-x:${Number(cropSession.x || 0)}px;--pl-crop-y:${Number(cropSession.y || 0)}px;--pl-crop-scale:${Number(cropSession.scale || 1)};">
          </div>
          <input class="phone-launcher-crop-range" type="range" min="1" max="3" step="0.01" value="${Number(cropSession.scale || 1)}" data-crop-scale="1" aria-label="scale">
          <div class="phone-launcher-crop-actions">
            <button type="button" data-crop-action="cancel">\u53d6\u6d88</button>
            <button type="button" data-crop-action="confirm">\u786e\u5b9a</button>
          </div>
        </div>
      </div>
    `;
  }

  function renderItemMiniActions() {
    return '';
  }

  function getLauncherMenuStyle() {
    if (!launcherMenu) return '';
    const metrics = getLauncherMenuMetrics(launcherMenu.type);
    const preferredWidth = metrics.width;
    const menuWidth = Math.min(preferredWidth, Math.max(180, window.innerWidth - 28));
    const halfWidth = Math.ceil(menuWidth / 2) + 10;
    const x = clampNumber(launcherMenu.x || 0, halfWidth, Math.max(halfWidth, window.innerWidth - halfWidth));
    let minY = 12;
    let maxY = Math.max(12, window.innerHeight - 12);
    if (launcherMenu.placement === 'above') {
      minY = Math.min(maxY, metrics.height + 18);
    } else if (launcherMenu.placement === 'below') {
      maxY = Math.max(minY, window.innerHeight - metrics.height - 18);
    }
    const y = clampNumber(launcherMenu.y || 0, minY, maxY);
    return ` style="--pl-menu-x:${x}px;--pl-menu-y:${y}px;--pl-menu-width:${menuWidth}px"`;
  }

  function getLauncherMenuClass(baseClass = '') {
    const placement = launcherMenu?.placement || 'point';
    return `${baseClass} is-${placement}`.trim();
  }

  function getLauncherMenuLayerClass() {
    const type = launcherMenu?.type || 'desktop';
    return `phone-launcher-menu-layer is-${type}-layer`;
  }

  function renderLauncherContextMenu(state) {
    if (!launcherMenu) return '';
    const target = launcherMenu.target || null;
    const selected = target ? getSelectedItem(state) : null;
    if (launcherMenu.type === 'desktop') {
      const themeMode = state.themeMode === 'night' ? 'night' : 'day';
      const viewMode = state.viewMode === 'phone-fullscreen' ? 'phone-fullscreen' : 'phone-shell';
      const statusMode = state.showFullscreenStatusBar === false ? 'hide' : 'show';
      const presets = Array.isArray(state.launcherPresets) ? state.launcherPresets : [];
      return `
        <div class="${getLauncherMenuLayerClass()}" data-menu-layer="1">
          <div class="${getLauncherMenuClass('phone-launcher-context-menu is-desktop')}"${getLauncherMenuStyle()}>
            <div class="phone-launcher-context-section">
              <button type="button" data-edit-action="add">${EDIT_ICONS.add}<span>\u6dfb\u52a0\u7ec4\u4ef6</span></button>
              <button type="button" data-edit-action="wallpaper">${EDIT_ICONS.image}<span>\u66f4\u6362\u58c1\u7eb8</span></button>
              <button type="button" data-edit-action="icon-style">${EDIT_ICONS.restore}<span>\u66f4\u6539\u56fe\u6807\u989c\u8272</span></button>
              <button type="button" data-edit-action="save-preset">${EDIT_ICONS.done}<span>\u4fdd\u5b58\u9884\u8bbe</span></button>
              <button type="button" data-edit-action="export-preset">${EDIT_ICONS.restore}<span>\u5bfc\u51fa\u9884\u8bbe</span></button>
              <button type="button" data-edit-action="import-preset">${EDIT_ICONS.image}<span>\u5bfc\u5165\u9884\u8bbe</span></button>
              <button class="is-danger" type="button" data-edit-action="reset">${EDIT_ICONS.reset}<span>\u6062\u590d\u9ed8\u8ba4</span></button>
            </div>
            ${presets.length ? `
              <div class="phone-launcher-context-setting is-preset">
                <span>\u9884\u8bbe</span>
                <span class="phone-launcher-preset-select-row">
                  <select data-preset-select>
                    ${presets.map((preset) => `<option value="${escapeHtml(preset.id)}">${escapeHtml(preset.name)}</option>`).join('')}
                  </select>
                  <button type="button" data-edit-action="load-preset">\u9009\u62e9</button>
                </span>
              </div>
            ` : ''}
            <div class="phone-launcher-context-setting">
              <span>\u4e3b\u9898</span>
              <span class="phone-launcher-menu-segment">
                <button class="${themeMode === 'day' ? 'active' : ''}" type="button" data-theme-mode="day">\u65e5\u95f4</button>
                <button class="${themeMode === 'night' ? 'active' : ''}" type="button" data-theme-mode="night">\u591c\u95f4</button>
              </span>
            </div>
            <div class="phone-launcher-context-setting">
              <span>\u663e\u793a</span>
              <span class="phone-launcher-menu-segment">
                <button class="${viewMode === 'phone-shell' ? 'active' : ''}" type="button" data-view-mode="phone-shell">\u5e26\u58f3</button>
                <button class="${viewMode === 'phone-fullscreen' ? 'active' : ''}" type="button" data-view-mode="phone-fullscreen">\u5168\u5c4f</button>
              </span>
            </div>
            <div class="phone-launcher-context-setting phone-launcher-fullscreen-status-row">
              <span>\u9876\u90e8\u680f</span>
              <span class="phone-launcher-menu-segment">
                <button class="${statusMode === 'show' ? 'active' : ''}" type="button" data-fullscreen-status-bar="show">\u663e\u793a</button>
                <button class="${statusMode === 'hide' ? 'active' : ''}" type="button" data-fullscreen-status-bar="hide">\u9690\u85cf</button>
              </span>
            </div>
          </div>
        </div>
      `;
    }
    if (launcherMenu.type === 'app' && selected?.appId) {
      const app = getPhoneAppById(selected.appId);
      return `
        <div class="${getLauncherMenuLayerClass()}" data-menu-layer="1">
          <div class="${getLauncherMenuClass('phone-launcher-context-menu is-app')}"${getLauncherMenuStyle()}>
            <button type="button" data-menu-action="change-icon">${EDIT_ICONS.image}<span>\u66f4\u6539\u56fe\u6807</span></button>
            <button type="button" data-menu-action="change-svg">${EDIT_ICONS.restore}<span>\u66f4\u6539 SVG</span></button>
            <button type="button" data-menu-action="rename">${EDIT_ICONS.done}<span>\u66f4\u6539\u540d\u5b57</span></button>
            <button class="is-danger" type="button" data-menu-action="remove">${EDIT_ICONS.remove}<span>\u79fb\u9664app</span></button>
            <button type="button" data-menu-action="restore">${EDIT_ICONS.restore}<span>\u590d\u539f\u8bbe\u7f6e</span></button>
          </div>
        </div>
      `;
    }
    if (launcherMenu.type === 'widget' && selected?.kind === 'widget') {
      return `
        <div class="${getLauncherMenuLayerClass()}" data-menu-layer="1">
          <div class="${getLauncherMenuClass('phone-launcher-context-menu is-widget')}"${getLauncherMenuStyle()}>
            <button type="button" data-menu-action="edit-widget">${EDIT_ICONS.done}<span>\u7f16\u8f91\u7ec4\u4ef6</span></button>
            <button type="button" data-menu-action="style-widget">${EDIT_ICONS.restore}<span>\u66f4\u6539\u914d\u8272</span></button>
            <button class="is-danger" type="button" data-menu-action="remove">${EDIT_ICONS.remove}<span>\u79fb\u9664\u7ec4\u4ef6</span></button>
          </div>
        </div>
      `;
    }
    return '';
  }

  function updateClock(container) {
    const now = new Date();
    const value = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const time = container.querySelector('#pl-time');
    if (time) time.textContent = value;
    container.querySelectorAll('[data-pl-clock]').forEach((item) => {
      item.textContent = value;
    });
    if (window.IDICAestheticPack && window.IDICAestheticPack.updateAnalogClocks) {
      window.IDICAestheticPack.updateAnalogClocks(container);
    }
  }

  function startClockTicker() {
    if (clockTicker) return;
    clockTicker = window.setInterval(() => {
      const view = document.getElementById('phone-launcher-view');
      if (!view || view.classList.contains('hidden')) return;
      updateClock(view);
    }, 1000);
  }

  function renderPhoneLauncherDOM(container, state) {
    const activeWallpaper = getActiveWallpaper(state);
    const wallpaperStyle = activeWallpaper ? ` style="background-image:url('${escapeHtml(activeWallpaper)}')"` : '';
    container.innerHTML = `
      <div class="phone-launcher-container">
        <div class="phone-launcher-wallpaper-layer"${wallpaperStyle}></div>
        <div class="phone-launcher-notch"></div>
        <div class="phone-launcher-content">
          <div class="phone-launcher-statusbar">
            <span class="phone-launcher-time" id="pl-time">--:--</span>
            <span class="phone-launcher-status-icons">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M2 20h20v2H2zM4 16h3v3H4zM9 12h3v7H9zM14 8h3v11h-3zM19 4h3v15h-3z"/></svg>
              100%
            </span>
          </div>
          <div class="phone-launcher-grid" id="pl-grid">${renderLauncherItems(state)}</div>
          ${renderPageDots(state)}
        </div>
        <div class="phone-launcher-dock" id="pl-dock">${renderLauncherDock(state)}</div>
        <div class="phone-launcher-home-indicator"></div>
      </div>
      ${renderPhoneLauncherEditor(state)}
      <input id="pl-wallpaper-file" type="file" accept="image/*" hidden>
      <input id="pl-icon-file" type="file" accept="image/*" hidden>
      <input id="pl-widget-file" type="file" accept="image/*" hidden>
      <input id="pl-preset-file" type="file" accept="application/json,.json" hidden>
      <div class="phone-launcher-settings-modal" id="pl-settings-modal">
        <div class="phone-launcher-settings-content">
          <div class="phone-launcher-settings-title">\u684c\u9762</div>
          <div class="phone-launcher-setting-row">
            <span>\u4e3b\u9898</span>
            <div class="phone-launcher-segment">
              <button class="phone-launcher-toggle-btn" type="button" data-theme-mode="day">\u65e5\u95f4</button>
              <button class="phone-launcher-toggle-btn" type="button" data-theme-mode="night">\u591c\u95f4</button>
            </div>
          </div>
          <div class="phone-launcher-setting-row">
            <span>\u663e\u793a</span>
            <div class="phone-launcher-segment">
              <button class="phone-launcher-toggle-btn" type="button" data-view-mode="phone-shell">\u5e26\u58f3</button>
              <button class="phone-launcher-toggle-btn" type="button" data-view-mode="phone-fullscreen">\u5168\u5c4f</button>
            </div>
          </div>
          <div class="phone-launcher-setting-row phone-launcher-fullscreen-status-row">
            <span>\u9876\u90e8\u680f</span>
            <div class="phone-launcher-segment">
              <button class="phone-launcher-toggle-btn" type="button" data-fullscreen-status-bar="show">\u663e\u793a</button>
              <button class="phone-launcher-toggle-btn" type="button" data-fullscreen-status-bar="hide">\u9690\u85cf</button>
            </div>
          </div>
          <div class="phone-launcher-setting-row">
            <span>\u5e03\u5c40</span>
            <div class="phone-launcher-segment">
              <button class="phone-launcher-toggle-btn" type="button" data-edit-action="edit">\u7f16\u8f91</button>
              <button class="phone-launcher-toggle-btn" type="button" data-edit-action="reset">\u91cd\u7f6e</button>
            </div>
          </div>
          <button class="phone-launcher-close-settings" type="button" data-close-settings="1">\u786e\u5b9a</button>
        </div>
      </div>
    `;

    bindLauncherEvents(container);
    updateClock(container);
    startClockTicker();
    updateSettingsButtons(container, state);
  }

  function rerenderLauncher() {
    const state = ensureLauncherState();
    const view = document.getElementById('phone-launcher-view');
    if (!view) return;
    applyLauncherClasses(view, state);
    renderPhoneLauncherDOM(view, state);
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      if (!file) {
        resolve('');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('file read failed'));
      reader.readAsDataURL(file);
    });
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      if (!file) {
        resolve('');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('file read failed'));
      reader.readAsText(file);
    });
  }

  function persistAndRender() {
    saveState();
    rerenderLauncher();
  }

  function createLauncherPresetSnapshot(state) {
    const safe = normalizeLauncherState(state);
    return {
      type: 'idic-phone-launcher-preset',
      version: 1,
      exportedAt: new Date().toISOString(),
      mode: safe.mode === 'classic' ? 'classic' : safe.mode,
      enabled: safe.enabled === true,
      viewMode: safe.viewMode === 'phone-fullscreen' ? 'phone-fullscreen' : 'phone-shell',
      themeMode: safe.themeMode === 'night' ? 'night' : 'day',
      showFullscreenStatusBar: safe.showFullscreenStatusBar !== false,
      themeProfiles: {
        day: clone(ensureThemeProfile(safe, 'day')),
        night: clone(ensureThemeProfile(safe, 'night'))
      },
      customIcons: clone(safe.customIcons || {}),
      customAppNames: clone(safe.customAppNames || {}),
      pages: clone(safe.pages || DEFAULT_STATE.pages),
      dock: clone(safe.dock || DEFAULT_DOCK)
    };
  }

  function unwrapLauncherPresetData(raw) {
    const source = raw && typeof raw === 'object' ? raw : null;
    if (!source) return null;
    if (source.type === 'idic-phone-launcher-preset' && source.pages) return source;
    if (source.type === 'idic-phone-launcher-preset' && source.data) return unwrapLauncherPresetData(source.data);
    if (source.data && typeof source.data === 'object' && source.data.pages) return source.data;
    if (source.pages && source.themeProfiles) return source;
    return null;
  }

  function applyLauncherPresetData(state, rawData) {
    const data = unwrapLauncherPresetData(rawData);
    if (!data) return false;
    const presets = Array.isArray(state.launcherPresets) ? state.launcherPresets : [];
    state.mode = data.mode || state.mode || DEFAULT_STATE.mode;
    state.enabled = data.enabled === true ? true : state.enabled === true;
    state.viewMode = data.viewMode === 'phone-fullscreen' ? 'phone-fullscreen' : 'phone-shell';
    state.themeMode = data.themeMode === 'night' ? 'night' : 'day';
    state.showFullscreenStatusBar = data.showFullscreenStatusBar !== false;
    state.customIcons = data.customIcons && typeof data.customIcons === 'object' ? clone(data.customIcons) : {};
    state.customAppNames = data.customAppNames && typeof data.customAppNames === 'object' ? clone(data.customAppNames) : {};
    state.themeProfiles = data.themeProfiles && typeof data.themeProfiles === 'object'
      ? clone(data.themeProfiles)
      : clone(DEFAULT_STATE.themeProfiles);
    state.pages = Array.isArray(data.pages) && data.pages.length ? clone(data.pages) : clone(DEFAULT_STATE.pages);
    state.dock = Array.isArray(data.dock) ? clone(data.dock) : DEFAULT_DOCK.slice();
    state.launcherPresets = presets;
    normalizeLauncherState(state);
    syncActiveThemeAliases(state);
    currentPageIndex = 0;
    selectedEditTarget = null;
    launcherMenu = null;
    editPanelTab = '';
    editingWidgetId = '';
    styleEditingTarget = null;
    svgEditingAppId = '';
    renamingAppId = '';
    editMode = false;
    return true;
  }

  function saveLauncherPreset() {
    const state = ensureLauncherState();
    const name = String(window.prompt('\u9884\u8bbe\u540d\u79f0', '') || '').trim();
    if (!name) return;
    const preset = {
      id: makeId('preset'),
      name,
      createdAt: new Date().toISOString(),
      data: createLauncherPresetSnapshot(state)
    };
    state.launcherPresets = (state.launcherPresets || []).filter((item) => item.name !== name);
    state.launcherPresets.push(preset);
    launcherMenu = null;
    showLauncherToast('\u5df2\u4fdd\u5b58\u9884\u8bbe\u3002', 'success');
    persistAndRender();
  }

  function loadLauncherPreset(presetId) {
    const state = ensureLauncherState();
    const preset = (state.launcherPresets || []).find((item) => item.id === presetId);
    if (!preset || !applyLauncherPresetData(state, preset.data)) {
      showLauncherToast('\u6ca1\u627e\u5230\u8fd9\u4e2a\u9884\u8bbe\u3002', 'error');
      return;
    }
    showLauncherToast('\u5df2\u5207\u6362\u9884\u8bbe\u3002', 'success');
    persistAndRender();
  }

  function exportLauncherPreset() {
    const state = ensureLauncherState();
    const snapshot = createLauncherPresetSnapshot(state);
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    link.href = url;
    link.download = `idic-phone-launcher-preset-${stamp}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    launcherMenu = null;
    rerenderLauncher();
  }

  async function importLauncherPreset(file) {
    try {
      const text = await readFileAsText(file);
      const raw = JSON.parse(text);
      const state = ensureLauncherState();
      if (!applyLauncherPresetData(state, raw)) {
        showLauncherToast('\u9884\u8bbe\u6587\u4ef6\u4e0d\u5bf9\u3002', 'error');
        return;
      }
      showLauncherToast('\u5df2\u5bfc\u5165\u9884\u8bbe\u3002', 'success');
      persistAndRender();
    } catch (error) {
      console.error('[PhoneLauncher] import preset failed:', error);
      showLauncherToast('\u9884\u8bbe\u5bfc\u5165\u5931\u8d25\u3002', 'error');
    }
  }

  function getCurrentPageInsertIndex(state, atStart) {
    const pageIndex = clampNumber(currentPageIndex, 0, Math.max(0, state.pages.length - 1));
    const before = state.pages.slice(0, pageIndex).reduce((sum, page) => sum + (page.items?.length || 0), 0);
    return before + (atStart ? 0 : (state.pages[pageIndex]?.items?.length || 0));
  }

  function setCurrentPage(index) {
    const state = ensureLauncherState();
    const previous = currentPageIndex;
    currentPageIndex = clampNumber(index, 0, Math.max(0, state.pages.length - 1));
    if (currentPageIndex !== previous) {
      schedulePageTransition(currentPageIndex > previous ? 'next' : 'prev');
    }
    rerenderLauncher();
  }

  function schedulePageTransition(direction) {
    pageTransitionDirection = direction || '';
    if (pageTransitionTimer) window.clearTimeout(pageTransitionTimer);
    pageTransitionTimer = window.setTimeout(() => {
      pageTransitionDirection = '';
      const view = document.getElementById('phone-launcher-view');
      if (view) view.classList.remove('phone-launcher-page-next', 'phone-launcher-page-prev');
    }, 150);
  }

  function selectEditTarget(target) {
    if (!editMode || !target) return;
    const state = ensureLauncherState();
    selectedEditTarget = target;
    editPanelTab = '';
    if (target.region === 'grid') {
      const pageIndex = getItemPageIndex(state, target.id);
      if (pageIndex >= 0) currentPageIndex = pageIndex;
    }
    rerenderLauncher();
  }

  function moveEditTarget(source, target) {
    if (!source || !target) return;
    const state = ensureLauncherState();
    if (source.region === 'grid' && target.region === 'grid' && source.id !== target.id) {
      const page = getCurrentPage(state);
      const sourceItem = page.items.find((item) => item.id === source.id);
      const targetItem = page.items.find((item) => item.id === target.id);
      if (sourceItem && targetItem) {
        swapGridItemsOnPage(page, sourceItem, targetItem);
        selectedEditTarget = { region: 'grid', id: source.id };
        editPanelTab = '';
        persistAndRender();
      }
      return;
    }
    if (source.region === 'dock' && target.region === 'dock' && source.appId !== target.appId) {
      const fromIndex = state.dock.indexOf(source.appId);
      const toIndex = state.dock.indexOf(target.appId);
      if (fromIndex >= 0 && toIndex >= 0) {
        const [item] = state.dock.splice(fromIndex, 1);
        state.dock.splice(toIndex, 0, item);
        selectedEditTarget = { region: 'dock', appId: source.appId };
        editPanelTab = '';
        persistAndRender();
      }
    }
  }

  function moveGridItemToPage(source, targetPageIndex) {
    if (!source || source.region !== 'grid') return false;
    const state = ensureLauncherState();
    const pageCount = Math.max(1, state.pages.length);
    const safePage = clampNumber(targetPageIndex, 0, pageCount - 1);
    const fromPageIndex = getItemPageIndex(state, source.id);
    if (fromPageIndex < 0) return false;
    const fromPage = state.pages[fromPageIndex];
    const fromItemIndex = fromPage.items.findIndex((item) => item.id === source.id);
    if (fromItemIndex < 0) return false;
    const [item] = fromPage.items.splice(fromItemIndex, 1);
    const targetPage = state.pages[safePage];
    const slot = findFreeSlotOnPage(targetPage, item, item.x || 0, item.y || 0);
    if (!slot) {
      fromPage.items.splice(fromItemIndex, 0, item);
      return false;
    }
    targetPage.items.push({ ...item, x: slot.x, y: slot.y });
    schedulePageTransition(safePage > currentPageIndex ? 'next' : 'prev');
    currentPageIndex = safePage;
    selectedEditTarget = { region: 'grid', id: source.id };
    editPanelTab = '';
    saveState();
    rerenderLauncher();
    return true;
  }

  function moveGridItemToPoint(source, clientX, clientY) {
    if (!source || source.region !== 'grid') return false;
    const grid = document.querySelector('#phone-launcher-view .phone-launcher-grid');
    if (!grid) return false;
    const rect = grid.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return false;
    const state = ensureLauncherState();
    const page = getCurrentPage(state);
    const item = page.items.find((entry) => entry.id === source.id);
    if (!item) return false;
    const size = getItemSize(item);
    const cellW = rect.width / GRID_COLS;
    const cellH = rect.height / GRID_ROWS;
    const col = clampNumber(Math.floor((clientX - rect.left) / cellW), 0, GRID_COLS - size.w);
    const row = clampNumber(Math.floor((clientY - rect.top) / cellH), 0, GRID_ROWS - size.h);
    const matrix = buildPageMatrix(page.items, item.id);
    if (canPlaceItem(matrix, col, row, size.w, size.h)) {
      item.x = col;
      item.y = row;
    } else {
      const blocking = (page.items || []).find((entry) => {
        if (!entry || entry.id === item.id) return false;
        const entrySize = getItemSize(entry);
        return col < (entry.x || 0) + entrySize.w
          && col + size.w > (entry.x || 0)
          && row < (entry.y || 0) + entrySize.h
          && row + size.h > (entry.y || 0);
      });
      if (!blocking || !swapGridItemsOnPage(page, item, blocking)) {
        const slot = findFreeSlotOnPage(page, item, col, row, item.id);
        if (!slot) return false;
        item.x = slot.x;
        item.y = slot.y;
      }
    }
    selectedEditTarget = { region: 'grid', id: source.id };
    editPanelTab = '';
    persistAndRender();
    return true;
  }

  function updateDragPreviewSlot(clientX, clientY) {
    dragPreviewSlot = null;
    if (!pointerDragTarget || pointerDragTarget.region !== 'grid') return;
    const grid = document.querySelector('#phone-launcher-view .phone-launcher-grid');
    if (!grid) return;
    const rect = grid.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return;
    const state = ensureLauncherState();
    const page = getCurrentPage(state);
    const item = page.items.find((entry) => entry.id === pointerDragTarget.id);
    if (!item) return;
    const size = getItemSize(item);
    const col = clampNumber(Math.floor((clientX - rect.left) / (rect.width / GRID_COLS)), 0, GRID_COLS - size.w);
    const row = clampNumber(Math.floor((clientY - rect.top) / (rect.height / GRID_ROWS)), 0, GRID_ROWS - size.h);
    dragPreviewSlot = { pageIndex: currentPageIndex, x: col, y: row, w: size.w, h: size.h };
    let preview = grid.querySelector('.phone-launcher-grid-placeholder');
    if (!preview) {
      preview = document.createElement('div');
      preview.className = 'phone-launcher-grid-placeholder';
      grid.appendChild(preview);
    }
    preview.style.gridColumn = `${col + 1} / span ${size.w}`;
    preview.style.gridRow = `${row + 1} / span ${size.h}`;
  }

  function addAppToPage(appId) {
    const state = ensureLauncherState();
    const safeAppId = String(appId || '').trim();
    if (!getPhoneAppById(safeAppId)) return;
    if (getUsedAppIds(state).has(safeAppId)) return;
    const item = { id: makeId(`app_${safeAppId}`), kind: 'app', appId: safeAppId };
    placeNewItemOnCurrentPage(state, item);
    selectedEditTarget = { region: 'grid', id: item.id };
    currentPageIndex = Math.max(0, getItemPageIndex(state, item.id));
    editPanelTab = '';
    persistAndRender();
  }

  function addWidgetToPage(widgetId) {
    const state = ensureLauncherState();
    const def = getWidgetDef(String(widgetId || '').trim());
    if (!def) return;
    if (def.singleton) {
      const items = getAllPageItems(state);
      const existing = items.find((item) => item.kind === 'widget' && item.widgetId === def.id);
      if (existing) {
        selectedEditTarget = { region: 'grid', id: existing.id };
        currentPageIndex = Math.max(0, getItemPageIndex(state, existing.id));
        editPanelTab = '';
        rerenderLauncher();
        return;
      }
    }
    const item = {
      id: makeId(`widget_${def.id}`),
      kind: 'widget',
      widgetId: def.id,
      w: def.w,
      h: def.h,
      config: getWidgetDefaultConfig(def.id)
    };
    placeNewItemOnCurrentPage(state, item);
    selectedEditTarget = { region: 'grid', id: item.id };
    currentPageIndex = Math.max(0, getItemPageIndex(state, item.id));
    editPanelTab = '';
    persistAndRender();
  }

  function removeSelectedTarget() {
    const state = ensureLauncherState();
    if (!selectedEditTarget) return;
    if (selectedEditTarget.region === 'grid') {
      const removedId = selectedEditTarget.id;
      state.pages.forEach((page) => {
        page.items = (page.items || []).filter((item) => item.id !== removedId);
      });
      deleteWidgetStyleFromAllThemes(state, removedId);
      if (editingWidgetId === removedId) editingWidgetId = '';
      if (styleEditingTarget?.itemId === removedId) styleEditingTarget = null;
      state.pages = state.pages.filter((page, index) => index === 0 || page.items.length);
      currentPageIndex = clampNumber(currentPageIndex, 0, Math.max(0, state.pages.length - 1));
    }
    if (selectedEditTarget.region === 'dock') {
      state.dock = state.dock.filter((appId) => appId !== selectedEditTarget.appId);
    }
    selectedEditTarget = null;
    editPanelTab = '';
    persistAndRender();
  }

  function restoreSelectedTarget() {
    const state = ensureLauncherState();
    const selected = getSelectedItem(state);
    if (!selected) return;
    if (selected.kind === 'app' || selected.kind === 'dock') {
      delete state.customIcons[selected.appId];
      delete state.customAppNames[selected.appId];
      setActiveIconStyle(state, null);
      persistAndRender();
      return;
    }
    if (selected.kind === 'widget') {
      selected.config = getWidgetDefaultConfig(selected.widgetId);
      setActiveWidgetStyle(state, selected.id, null);
      persistAndRender();
    }
  }

  function toggleSelectedDock() {
    const state = ensureLauncherState();
    const selected = getSelectedItem(state);
    if (!selected || (selected.kind !== 'app' && selected.kind !== 'dock')) return;
    const appId = selected.appId;
    const items = getAllPageItems(state);
    if (selected.kind === 'dock' || state.dock.includes(appId)) {
      state.dock = state.dock.filter((item) => item !== appId);
      if (!items.some((item) => item.kind === 'app' && item.appId === appId)) {
        const item = { id: makeId(`app_${appId}`), kind: 'app', appId };
        placeNewItemOnCurrentPage(state, item);
        selectedEditTarget = { region: 'grid', id: item.id };
        currentPageIndex = Math.max(0, getItemPageIndex(state, item.id));
      }
    } else {
      if (state.dock.length >= 4) {
        showLauncherToast('\u5e95\u680f\u6700\u591a\u653e 4 \u4e2a\u5e94\u7528\u3002', 'info');
        return;
      }
      state.dock.push(appId);
      state.pages.forEach((page) => {
        page.items = (page.items || []).filter((item) => !(item.kind === 'app' && item.appId === appId));
      });
      state.pages = state.pages.filter((page, index) => index === 0 || page.items.length);
      selectedEditTarget = { region: 'dock', appId };
    }
    editPanelTab = '';
    persistAndRender();
  }

  function resetLauncherLayout() {
    const state = ensureLauncherState();
    const defaults = clone(DEFAULT_STATE);
    state.pages = packItemsToPages(defaults.pages[0].items);
    state.dock = defaults.dock;
    state.customIcons = {};
    state.customAppNames = {};
    state.themeProfiles = clone(DEFAULT_STATE.themeProfiles);
    syncActiveThemeAliases(state);
    selectedEditTarget = null;
    currentPageIndex = 0;
    editPanelTab = '';
    launcherMenu = null;
    editingWidgetId = '';
    styleEditingTarget = null;
    svgEditingAppId = '';
    renamingAppId = '';
    editMode = false;
    persistAndRender();
  }

  function setEditMode(next) {
    editMode = Boolean(next);
    selectedEditTarget = null;
    editPanelTab = '';
    launcherMenu = null;
    editingWidgetId = '';
    styleEditingTarget = null;
    svgEditingAppId = '';
    renamingAppId = '';
    stopPointerDrag();
    closeLauncherSettings();
    rerenderLauncher();
  }

  function closeLauncherMenu(options = {}) {
    const hadMenu = Boolean(launcherMenu || editPanelTab || renamingAppId || editMode || editingWidgetId || styleEditingTarget || svgEditingAppId);
    if (hadMenu) flushActiveInlineEdit();
    launcherMenu = null;
    editPanelTab = '';
    renamingAppId = '';
    styleEditingTarget = null;
    svgEditingAppId = '';
    if (options.keepWidgetEditing !== true) editingWidgetId = '';
    if (options.keepEditMode !== true) {
      editMode = false;
      selectedEditTarget = null;
    }
    if (options.render === false) {
      removeLauncherFloatingChrome();
      return;
    }
    if (hadMenu) rerenderLauncher();
  }

  function removeLauncherFloatingChrome() {
    document.querySelectorAll('#phone-launcher-view .phone-launcher-menu-layer, #phone-launcher-view .phone-launcher-diy-popover, #phone-launcher-view .phone-launcher-style-panel, #phone-launcher-view .phone-launcher-svg-panel').forEach((element) => {
      element.remove();
    });
  }

  function openLauncherMenu(type, target, event, options = {}) {
    selectedEditTarget = target ? target : null;
    editMode = false;
    editPanelTab = '';
    editingWidgetId = '';
    styleEditingTarget = null;
    svgEditingAppId = '';
    renamingAppId = '';
    closeLauncherSettings();
    const anchor = getLauncherMenuAnchor(type, target, event);
    launcherMenu = {
      type,
      target: target ? { ...target } : null,
      x: anchor.x,
      y: anchor.y,
      placement: anchor.placement,
      openedAt: Date.now()
    };
    if (options.render === false) {
      const root = document.getElementById('phone-launcher-view');
      const state = ensureLauncherState();
      removeLauncherFloatingChrome();
      root?.insertAdjacentHTML('beforeend', renderLauncherContextMenu(state));
      applyLauncherClasses(root, state);
      return;
    }
    rerenderLauncher();
  }

  function renameSelectedAppInline() {
    const state = ensureLauncherState();
    const selected = getSelectedItem(state);
    if (!selected?.appId) return;
    renamingAppId = selected.appId;
    launcherMenu = null;
    editPanelTab = '';
    editMode = false;
    rerenderLauncher();
    window.setTimeout(() => {
      const root = document.getElementById('phone-launcher-view');
      const target = root?.querySelector(`[data-inline-app-name="${escapeCssIdent(selected.appId)}"]`);
      if (target) focusInlineText(target);
    }, 0);
  }

  function editSelectedWidgetInline() {
    const state = ensureLauncherState();
    const selected = getSelectedItem(state);
    if (!selected || selected.kind !== 'widget') return;
    editingWidgetId = selected.id;
    selectedEditTarget = { region: 'grid', id: selected.id };
    launcherMenu = null;
    editPanelTab = '';
    styleEditingTarget = null;
    editMode = false;
    rerenderLauncher();
  }

  function openStyleEditor(target) {
    const state = ensureLauncherState();
    if (!target) return;
    if (target.type === 'icon') {
      styleEditingTarget = { type: 'icon' };
    } else {
      const item = findItem(state, target.itemId || selectedEditTarget?.id || '');
      if (!item || item.kind !== 'widget') return;
      styleEditingTarget = { type: 'widget', itemId: item.id };
      selectedEditTarget = { region: 'grid', id: item.id };
    }
    launcherMenu = null;
    editPanelTab = '';
    editingWidgetId = '';
    editMode = false;
    rerenderLauncher();
  }

  function closeStyleEditor() {
    if (!styleEditingTarget) return;
    styleEditingTarget = null;
    selectedEditTarget = null;
    saveState();
    rerenderLauncher();
  }

  function resetStyleEditor() {
    const state = ensureLauncherState();
    if (!styleEditingTarget) return;
    if (styleEditingTarget.type === 'icon') {
      setActiveIconStyle(state, null);
    } else if (styleEditingTarget.itemId) {
      setActiveWidgetStyle(state, styleEditingTarget.itemId, null);
    }
    styleEditingTarget = null;
    selectedEditTarget = null;
    persistAndRender();
  }

  function openSvgEditorForSelectedApp() {
    const selected = getSelectedItem(ensureLauncherState());
    if (!selected?.appId) return;
    svgEditingAppId = selected.appId;
    launcherMenu = null;
    editPanelTab = '';
    editingWidgetId = '';
    styleEditingTarget = null;
    editMode = false;
    rerenderLauncher();
    window.setTimeout(() => {
      const input = document.querySelector('#phone-launcher-view [data-svg-icon-input]');
      if (input) input.focus({ preventScroll: true });
    }, 0);
  }

  function closeSvgEditor(save) {
    if (!svgEditingAppId) return;
    const appId = svgEditingAppId;
    const state = ensureLauncherState();
    const input = document.querySelector('#phone-launcher-view [data-svg-icon-input]');
    if (save) {
      const value = String(input?.value || '').trim();
      if (value) {
        if (!/^\s*<svg[\s>]/i.test(value)) {
          showLauncherToast('\u8bf7\u586b\u5165 SVG \u4ee3\u7801\u3002', 'error');
          return;
        }
        state.customIcons[appId] = value;
      }
    }
    svgEditingAppId = '';
    selectedEditTarget = null;
    persistAndRender();
  }

  function resetSvgEditor() {
    if (!svgEditingAppId) return;
    const appId = svgEditingAppId;
    const state = ensureLauncherState();
    delete state.customIcons[appId];
    svgEditingAppId = '';
    selectedEditTarget = null;
    persistAndRender();
  }

  function handleMenuAction(action) {
    const root = document.getElementById('phone-launcher-view');
    if (!root) return;
    if (action === 'change-icon') {
      launcherMenu = null;
      editPanelTab = '';
      editMode = false;
      rerenderLauncher();
      window.setTimeout(() => {
        document.querySelector('#phone-launcher-view #pl-icon-file')?.click();
      }, 0);
      return;
    }
    if (action === 'rename') {
      renameSelectedAppInline();
      return;
    }
    if (action === 'change-svg') {
      openSvgEditorForSelectedApp();
      return;
    }
    if (action === 'remove') {
      launcherMenu = null;
      editPanelTab = '';
      removeSelectedTarget();
      return;
    }
    if (action === 'edit-widget') {
      editSelectedWidgetInline();
      return;
    }
    if (action === 'style-widget') {
      const selected = getSelectedItem(ensureLauncherState());
      if (selected?.kind === 'widget') openStyleEditor({ type: 'widget', itemId: selected.id });
      return;
    }
    if (action === 'restore') {
      launcherMenu = null;
      editPanelTab = '';
      restoreSelectedTarget();
    }
  }

  async function uploadWallpaper(file) {
    const dataUrl = await readFileAsDataUrl(file);
    if (!dataUrl) return;
    const state = ensureLauncherState();
    setActiveWallpaper(state, dataUrl);
    persistAndRender();
  }

  async function uploadIcon(file) {
    const dataUrl = await readFileAsDataUrl(file);
    if (!dataUrl) return;
    const state = ensureLauncherState();
    const selected = getSelectedItem(state);
    if (!selected || !selected.appId) return;
    state.customIcons[selected.appId] = dataUrl;
    persistAndRender();
  }

  function setConfigPath(config, path, value) {
    const parts = String(path || '').split('.').filter(Boolean);
    if (!parts.length) return;
    let cursor = config;
    parts.slice(0, -1).forEach((part, index) => {
      const nextPart = parts[index + 1];
      if (cursor[part] == null) cursor[part] = /^\d+$/.test(nextPart) ? [] : {};
      cursor = cursor[part];
    });
    const last = parts[parts.length - 1];
    cursor[/^\d+$/.test(last) ? Number(last) : last] = value;
  }

  async function uploadWidgetImage(file) {
    const input = document.querySelector('#phone-launcher-view #pl-widget-file');
    const uploadTarget = pendingWidgetUpload || (input
      ? { itemId: input.dataset.widgetUploadItem || '', path: input.dataset.widgetUploadPath || '' }
      : null);
    const dataUrl = await readFileAsDataUrl(file);
    if (!dataUrl) return;
    if (!uploadTarget || !uploadTarget.itemId || !uploadTarget.path) {
      pendingWidgetUpload = null;
      showLauncherToast('\u6ca1\u627e\u5230\u8981\u4e0a\u4f20\u7684\u7ec4\u4ef6\u4f4d\u7f6e\u3002', 'error');
      return;
    }
    const state = ensureLauncherState();
    const item = findItem(state, uploadTarget.itemId);
    if (!item || item.kind !== 'widget') {
      pendingWidgetUpload = null;
      showLauncherToast('\u6ca1\u627e\u5230\u8fd9\u4e2a\u7ec4\u4ef6\u3002', 'error');
      return;
    }
    cropSession = {
      itemId: uploadTarget.itemId,
      path: uploadTarget.path,
      src: dataUrl,
      x: 0,
      y: 0,
      scale: 1,
      aspect: getCropAspectForWidget(item, uploadTarget.path)
    };
    pendingWidgetUpload = null;
    if (input) {
      input.dataset.widgetUploadItem = '';
      input.dataset.widgetUploadPath = '';
    }
    rerenderLauncher();
  }

  function getCropAspectForWidget(item, path) {
    if (!item) return 1;
    const widgetId = String(item.widgetId || '');
    const safePath = String(path || '');
    if (/avatar/i.test(safePath)) return 1;
    if (/banner|background/i.test(safePath)) return widgetId === 'iceProfile' || widgetId === 'idcard' ? 3.4 : 2.6;
    if (widgetId === 'polaroid' && /^photos\./.test(safePath)) return 0.74;
    if (widgetId === 'polaroidSmall' && /^photos\./.test(safePath)) return 0.84;
    if (widgetId === 'photoBoard' && /^photos\./.test(safePath)) return safePath.endsWith('.1') ? 0.8 : 1;
    if (widgetId === 'grayMoodBoard') {
      if (safePath === 'memoryPhoto') return 0.74;
      if (safePath === 'coffeePhoto') return 1.12;
    }
    if (widgetId === 'sageTodo' && safePath === 'cover') return 0.88;
    if (widgetId === 'image' && safePath === 'src') return 1;
    if (/cover|photo|src|bg/i.test(safePath)) return 1;
    const size = getItemSize(item);
    return Math.max(0.6, Math.min(3.4, size.w / Math.max(1, size.h)));
  }

  function cancelCropSession() {
    cropSession = null;
    rerenderLauncher();
  }

  function setCropScale(value) {
    if (!cropSession) return;
    const number = Number(value);
    cropSession.scale = Number.isFinite(number) ? Math.max(1, Math.min(3, number)) : 1;
    clampCropSessionToFrame();
    updateCropImageTransform();
  }

  function clampCropSessionToFrame() {
    if (!cropSession) return;
    const frame = document.querySelector('#phone-launcher-view .phone-launcher-crop-frame');
    const img = frame?.querySelector('img');
    if (!frame || !img || !img.naturalWidth || !img.naturalHeight) return;
    const rect = frame.getBoundingClientRect();
    const frameW = Math.max(1, rect.width);
    const frameH = Math.max(1, rect.height);
    const scale = Math.max(1, Number(cropSession.scale || 1));
    const displayScale = Math.max(frameW / img.naturalWidth, frameH / img.naturalHeight) * scale;
    const maxX = Math.max(0, (img.naturalWidth * displayScale - frameW) / 2);
    const maxY = Math.max(0, (img.naturalHeight * displayScale - frameH) / 2);
    cropSession.x = Math.max(-maxX, Math.min(maxX, Number(cropSession.x || 0)));
    cropSession.y = Math.max(-maxY, Math.min(maxY, Number(cropSession.y || 0)));
  }

  function updateCropImageTransform() {
    const img = document.querySelector('#phone-launcher-view .phone-launcher-crop-frame img');
    if (!img || !cropSession) return;
    clampCropSessionToFrame();
    img.style.setProperty('--pl-crop-x', `${Number(cropSession.x || 0)}px`);
    img.style.setProperty('--pl-crop-y', `${Number(cropSession.y || 0)}px`);
    img.style.setProperty('--pl-crop-scale', String(Number(cropSession.scale || 1)));
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('image load failed'));
      img.src = src;
    });
  }

  async function confirmCropSession() {
    if (!cropSession) return;
    const session = { ...cropSession };
    const frame = document.querySelector('#phone-launcher-view .phone-launcher-crop-frame');
    if (!frame) return cancelCropSession();
    try {
      const img = await loadImage(session.src);
      const rect = frame.getBoundingClientRect();
      const frameW = Math.max(1, rect.width);
      const frameH = Math.max(1, rect.height);
      const baseScale = Math.max(frameW / img.naturalWidth, frameH / img.naturalHeight);
      const displayScale = baseScale * Math.max(1, Number(session.scale || 1));
      const displayW = img.naturalWidth * displayScale;
      const displayH = img.naturalHeight * displayScale;
      const left = (frameW - displayW) / 2 + Number(session.x || 0);
      const top = (frameH - displayH) / 2 + Number(session.y || 0);
      const sx = Math.max(0, Math.min(img.naturalWidth - 1, -left / displayScale));
      const sy = Math.max(0, Math.min(img.naturalHeight - 1, -top / displayScale));
      const sw = Math.min(img.naturalWidth - sx, frameW / displayScale);
      const sh = Math.min(img.naturalHeight - sy, frameH / displayScale);
      const outW = Math.round(Math.min(1080, Math.max(480, frameW * 2)));
      const outH = Math.round(outW / (frameW / frameH));
      const canvas = document.createElement('canvas');
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
      const state = ensureLauncherState();
      const item = findItem(state, session.itemId);
      if (item && item.kind === 'widget') {
        item.config = normalizeWidgetConfig(item);
        setConfigPath(item.config, session.path, dataUrl);
        cropSession = null;
        persistAndRender();
      } else {
        cancelCropSession();
      }
    } catch (error) {
      console.error('[PhoneLauncher] crop failed:', error);
      showLauncherToast('\u56fe\u7247\u88c1\u526a\u5931\u8d25\u3002', 'error');
      cancelCropSession();
    }
  }

  function clearWallpaper() {
    const state = ensureLauncherState();
    setActiveWallpaper(state, '');
    persistAndRender();
  }

  function clearSelectedIcon() {
    const state = ensureLauncherState();
    const selected = getSelectedItem(state);
    if (!selected || !selected.appId) return;
    delete state.customIcons[selected.appId];
    persistAndRender();
  }

  function selectInlineAppTarget(element) {
    const appId = String(element?.dataset.inlineAppIcon || element?.dataset.inlineAppName || '').trim();
    if (!appId) return;
    const region = element.dataset.inlineRegion === 'dock' ? 'dock' : 'grid';
    selectedEditTarget = region === 'dock'
      ? { region: 'dock', appId }
      : { region: 'grid', id: element.dataset.inlineItemId || readEditTargetFromElement(element)?.id || '' };
  }

  function saveInlineAppName(element, shouldRender = true) {
    const appId = String(element?.dataset.inlineAppName || '').trim();
    if (!appId) return;
    const app = getPhoneAppById(appId);
    const value = String(element.textContent || '').trim();
    const state = ensureLauncherState();
    if (value && value !== (app?.name || '')) state.customAppNames[appId] = value;
    else delete state.customAppNames[appId];
    renamingAppId = '';
    saveState();
    if (shouldRender) rerenderLauncher();
  }

  function saveInlineWidgetText(element, shouldRender) {
    const itemId = String(element?.dataset.inlineWidgetText || '').trim();
    const path = String(element?.dataset.inlineWidgetPath || '').trim();
    if (!itemId || !path) return;
    const state = ensureLauncherState();
    const item = findItem(state, itemId);
    if (!item || item.kind !== 'widget') return;
    item.config = normalizeWidgetConfig(item);
    setConfigPath(item.config, path, String(element.textContent || '').trim());
    saveState();
    if (shouldRender) rerenderLauncher();
  }

  function flushActiveInlineEdit() {
    const active = document.activeElement;
    const appName = closestLauncherElement(active, '[data-inline-app-name]');
    if (appName) {
      saveInlineAppName(appName, false);
      return;
    }
    const widgetText = closestLauncherElement(active, '[data-inline-widget-text]');
    if (widgetText) saveInlineWidgetText(widgetText, false);
  }

  function focusInlineText(element) {
    if (!element || typeof element.focus !== 'function') return;
    element.focus({ preventScroll: true });
    const selection = window.getSelection && window.getSelection();
    if (!selection || !document.createRange) return;
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function openInlineUpload(element) {
    const root = document.getElementById('phone-launcher-view');
    if (!root || !element) return;
    const appIcon = closestLauncherElement(element, '[data-inline-app-icon]');
    if (appIcon) {
      selectInlineAppTarget(appIcon);
      root.querySelector('#pl-icon-file')?.click();
      return;
    }
    const widgetUpload = closestLauncherElement(element, '[data-inline-widget-upload]');
    if (widgetUpload) {
      pendingWidgetUpload = {
        itemId: widgetUpload.dataset.inlineWidgetUpload || '',
        path: widgetUpload.dataset.inlineWidgetPath || ''
      };
      const input = root.querySelector('#pl-widget-file');
      if (input) {
        input.dataset.widgetUploadItem = pendingWidgetUpload.itemId;
        input.dataset.widgetUploadPath = pendingWidgetUpload.path;
        input.click();
      }
    }
  }

  function handleEditAction(action, button) {
    const root = document.getElementById('phone-launcher-view');
    if (!root) return null;
    if (action === 'edit') {
      closeLauncherSettings();
      return openLauncherMenu('desktop', null, { clientX: window.innerWidth / 2, clientY: window.innerHeight / 2 });
    }
    if (action === 'done') return setEditMode(false);
    if (action === 'add') {
      editPanelTab = editPanelTab === 'add' ? '' : 'add';
      launcherMenu = null;
      editMode = false;
      return rerenderLauncher();
    }
    if (action === 'remove') return removeSelectedTarget();
    if (action === 'restore') return restoreSelectedTarget();
    if (action === 'dock') return toggleSelectedDock();
    if (action === 'reset') return resetLauncherLayout();
    if (action === 'icon-style') {
      return openStyleEditor({ type: 'icon' });
    }
    if (action === 'save-preset') return saveLauncherPreset();
    if (action === 'load-preset') {
      const presetId = root.querySelector('[data-preset-select]')?.value || '';
      return loadLauncherPreset(presetId);
    }
    if (action === 'export-preset') return exportLauncherPreset();
    if (action === 'import-preset') {
      launcherMenu = null;
      editPanelTab = '';
      editMode = false;
      rerenderLauncher();
      window.setTimeout(() => {
        document.querySelector('#phone-launcher-view #pl-preset-file')?.click();
      }, 0);
      return;
    }
    if (action === 'wallpaper') {
      launcherMenu = null;
      editPanelTab = '';
      editMode = false;
      rerenderLauncher();
      window.setTimeout(() => {
        document.querySelector('#phone-launcher-view #pl-wallpaper-file')?.click();
      }, 0);
      return;
    }
    if (action === 'clear-wallpaper') return clearWallpaper();
    if (action === 'icon') return root.querySelector('#pl-icon-file')?.click();
    if (action === 'clear-icon') return clearSelectedIcon();
    if (action === 'widget-upload') {
      pendingWidgetUpload = {
        itemId: button?.dataset.widgetUploadItem || selectedEditTarget?.id || '',
        path: button?.dataset.widgetUploadPath || ''
      };
      const input = root.querySelector('#pl-widget-file');
      if (input) {
        input.dataset.widgetUploadItem = pendingWidgetUpload.itemId;
        input.dataset.widgetUploadPath = pendingWidgetUpload.path;
        input.click();
      }
      return null;
    }
    return null;
  }

  function syncEditorField(input) {
    const state = ensureLauncherState();
    if (input.matches('[data-style-field]')) {
      syncStyleField(state, input);
      return;
    }
    if (input.matches('[data-wallpaper-url]')) {
      setActiveWallpaper(state, input.value.trim());
      persistAndRender();
      return;
    }
    if (input.matches('[data-custom-icon-app]')) {
      const appId = String(input.dataset.customIconApp || '').trim();
      if (!appId) return;
      const value = input.value.trim();
      if (value) state.customIcons[appId] = value;
      else delete state.customIcons[appId];
      persistAndRender();
      return;
    }
    if (input.matches('[data-app-name]')) {
      const appId = String(input.dataset.appName || '').trim();
      if (!appId) return;
      const value = input.value.trim();
      if (value) state.customAppNames[appId] = value;
      else delete state.customAppNames[appId];
      persistAndRender();
      return;
    }
    if (input.matches('[data-widget-prop]')) {
      const item = findItem(state, input.dataset.widgetProp || '');
      if (!item || item.kind !== 'widget') return;
      item.config = normalizeWidgetConfig(item);
      setConfigPath(item.config, input.dataset.widgetPropPath || '', input.value.trim());
      persistAndRender();
      return;
    }
    if (input.matches('[data-widget-check]')) {
      const item = findItem(state, input.dataset.widgetCheck || '');
      if (!item || item.kind !== 'widget') return;
      item.config = normalizeWidgetConfig(item);
      setConfigPath(item.config, input.dataset.widgetCheckPath || '', input.checked);
      persistAndRender();
    }
  }

  function syncStyleField(state, input) {
    if (!styleEditingTarget) return;
    const field = String(input.dataset.styleField || '').trim();
    if (!field) return;
    const type = styleEditingTarget.type === 'icon' ? 'icon' : 'widget';
    let style = getEditableStyle(state, styleEditingTarget);
    if (!style) return;
    if (input.type === 'checkbox') {
      style[field] = input.checked;
    } else if (input.type === 'range' || input.type === 'number') {
      style[field] = clampNumber(input.value, 0, field === 'borderWidth' ? 8 : 100);
      if (field === 'shadowBlur' || field === 'shadowDepth') style[field] = clampNumber(input.value, 0, 60);
    } else if (input.type === 'color') {
      style[field] = sanitizeHex(input.value, style[field] || '#ffffff');
    } else {
      style[field] = input.value;
    }
    style = normalizeStyleConfig(style, type);
    if (type === 'icon') {
      setActiveIconStyle(state, style);
    } else if (styleEditingTarget.itemId) {
      setActiveWidgetStyle(state, styleEditingTarget.itemId, style);
    }
    updateStylePanelValue(field, style[field]);
    if (applyGlobalStyleParts(state, style)) applyAllCurrentStylesToDom(state);
    else applyCurrentStyleToDom(state);
    scheduleStyleSave();
  }

  function clearPressTimer() {
    if (longPressTimer) window.clearTimeout(longPressTimer);
    longPressTimer = null;
    longPressReadyTarget = null;
    longPressReady = false;
  }

  function clearDragEdgeTimer() {
    if (dragEdgeTimer) window.clearTimeout(dragEdgeTimer);
    dragEdgeTimer = null;
    dragEdgeDirection = 0;
    const view = document.getElementById('phone-launcher-view');
    if (view) view.classList.remove('phone-launcher-edge-left', 'phone-launcher-edge-right');
  }

  function stopPointerDrag() {
    clearDragEdgeTimer();
    document.querySelector('#phone-launcher-view .phone-launcher-grid-placeholder')?.remove();
    if (activeDragElement) {
      activeDragElement.classList.remove('is-dragging', 'is-longpress-ready');
      activeDragElement.style.removeProperty('--pl-drag-x');
      activeDragElement.style.removeProperty('--pl-drag-y');
    }
    if (pointerDragPointerId != null) {
      try {
        activeDragElement?.releasePointerCapture?.(pointerDragPointerId);
      } catch (error) {
        // Pointer capture can already be gone after rerender.
      }
    }
    pointerDragTarget = null;
    pointerDragStart = null;
    pointerDragOrigin = null;
    pointerDragPointerId = null;
    pointerDragLast = null;
    dragPreviewSlot = null;
    activeDragElement = null;
    pointerDragging = false;
    longPressReadyTarget = null;
    longPressReady = false;
  }

  function startEdgePageTimer(direction) {
    if (!direction || direction === dragEdgeDirection) return;
    clearDragEdgeTimer();
    dragEdgeDirection = direction;
    const view = document.getElementById('phone-launcher-view');
    if (view) view.classList.add(direction < 0 ? 'phone-launcher-edge-left' : 'phone-launcher-edge-right');
    dragEdgeTimer = window.setTimeout(() => {
      const state = ensureLauncherState();
      if (direction > 0 && currentPageIndex === state.pages.length - 1) {
        const page = createPage(state.pages.length);
        state.pages.push({ id: page.id, items: [] });
      }
      const targetPage = clampNumber(currentPageIndex + direction, 0, Math.max(0, state.pages.length - 1));
      editMode = false;
      selectedEditTarget = null;
      if (targetPage !== currentPageIndex && moveGridItemToPage(pointerDragTarget, targetPage)) {
        suppressImmediateLauncherClick(null, 360);
      }
      stopPointerDrag();
    }, 280);
  }

  function updatePointerDrag(event) {
    if (!pointerDragTarget || !pointerDragStart) return;
    const dx = event.clientX - pointerDragStart.x;
    const dy = event.clientY - pointerDragStart.y;
    if (!pointerDragging && Math.hypot(dx, dy) <= 8) return;
    pointerDragging = true;
    if (longPressTimer) window.clearTimeout(longPressTimer);
    longPressTimer = null;
    pointerDragLast = { x: event.clientX, y: event.clientY };
    if (activeDragElement) {
      activeDragElement.classList.add('is-dragging');
      activeDragElement.style.setProperty('--pl-drag-x', `${dx}px`);
      activeDragElement.style.setProperty('--pl-drag-y', `${dy}px`);
    }
    updateDragPreviewSlot(event.clientX, event.clientY);
    const containerRect = document.querySelector('#phone-launcher-view .phone-launcher-container')?.getBoundingClientRect();
    const state = ensureLauncherState();
    if (!containerRect || pointerDragTarget.region !== 'grid') {
      clearDragEdgeTimer();
      return;
    }
    const edgeSize = Math.min(58, Math.max(34, containerRect.width * 0.14));
    if (event.clientX < containerRect.left + edgeSize) startEdgePageTimer(-1);
    else if (event.clientX > containerRect.right - edgeSize) startEdgePageTimer(1);
    else clearDragEdgeTimer();
  }

  function isUiChromeTarget(target) {
    return Boolean(closestLauncherElement(target, [
      '.phone-launcher-diy-sheet',
      '.phone-launcher-diy-toolbar',
      '.phone-launcher-diy-popover',
      '.phone-launcher-edit-controls',
      '.phone-launcher-item-mini-actions',
      '.phone-launcher-context-menu',
      '.phone-launcher-crop-modal',
      '.phone-launcher-style-panel',
      '.phone-launcher-svg-panel',
      '.phone-launcher-settings-modal',
      '[data-menu-action]',
      '[data-style-action]',
      '[data-svg-action]',
      '[data-edit-action]',
      '[data-edit-tab]',
      '[data-add-app]',
      '[data-add-widget]',
      '[data-page-dot]',
      '[contenteditable="plaintext-only"]',
      'input',
      'select',
      'textarea'
    ].join(',')));
  }

  function bindLauncherEvents(container) {
    if (container.dataset.phoneLauncherBound === '1') return;
    container.dataset.phoneLauncherBound = '1';

    container.addEventListener('click', (event) => {
      if (shouldIgnoreLauncherClick(event)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      const menuAction = closestLauncherElement(event.target, '[data-menu-action]');
      if (menuAction) {
        event.preventDefault();
        event.stopPropagation();
        handleMenuAction(menuAction.dataset.menuAction);
        return;
      }

      const cropAction = closestLauncherElement(event.target, '[data-crop-action]');
      if (cropAction) {
        event.preventDefault();
        event.stopPropagation();
        if (cropAction.dataset.cropAction === 'confirm') void confirmCropSession();
        else cancelCropSession();
        return;
      }

      const styleAction = closestLauncherElement(event.target, '[data-style-action]');
      if (styleAction) {
        event.preventDefault();
        event.stopPropagation();
        if (styleAction.dataset.styleAction === 'reset') resetStyleEditor();
        else closeStyleEditor();
        return;
      }

      const svgAction = closestLauncherElement(event.target, '[data-svg-action]');
      if (svgAction) {
        event.preventDefault();
        event.stopPropagation();
        if (svgAction.dataset.svgAction === 'reset') resetSvgEditor();
        else closeSvgEditor(true);
        return;
      }

      if (closestLauncherElement(event.target, '[data-menu-layer]') && !closestLauncherElement(event.target, '.phone-launcher-context-menu')) {
        closeLauncherMenu();
        return;
      }

      const pageDot = closestLauncherElement(event.target, '[data-page-dot]');
      if (pageDot) {
        closeLauncherMenu({ render: false });
        setCurrentPage(Number(pageDot.dataset.pageDot));
        return;
      }

      const editAction = closestLauncherElement(event.target, '[data-edit-action]');
      if (editAction) {
        handleEditAction(editAction.dataset.editAction, editAction);
        return;
      }

      const themeButton = closestLauncherElement(event.target, '[data-theme-mode]');
      if (themeButton) {
        toggleLauncherTheme(themeButton.dataset.themeMode);
        return;
      }

      const viewModeButton = closestLauncherElement(event.target, '[data-view-mode]');
      if (viewModeButton) {
        toggleLauncherViewMode(viewModeButton.dataset.viewMode);
        return;
      }

      const fullscreenStatusButton = closestLauncherElement(event.target, '[data-fullscreen-status-bar]');
      if (fullscreenStatusButton) {
        toggleFullscreenStatusBar(fullscreenStatusButton.dataset.fullscreenStatusBar);
        return;
      }

      const addButton = closestLauncherElement(event.target, '[data-add-app]');
      if (addButton) {
        addAppToPage(addButton.dataset.addApp);
        return;
      }

      const widgetButton = closestLauncherElement(event.target, '[data-add-widget]');
      if (widgetButton) {
        addWidgetToPage(widgetButton.dataset.addWidget);
        return;
      }

      const inlineWidgetText = closestLauncherElement(event.target, '[data-inline-widget-text]');
      if (inlineWidgetText) {
        const target = readEditTargetFromElement(inlineWidgetText);
        if (target) selectedEditTarget = target;
        closeLauncherMenu({ render: false, keepWidgetEditing: true, keepEditMode: true });
        focusInlineText(inlineWidgetText);
        return;
      }

      const inlineWidgetUpload = closestLauncherElement(event.target, '[data-inline-widget-upload]');
      if (inlineWidgetUpload) {
        event.preventDefault();
        closeLauncherMenu({ render: false, keepWidgetEditing: true, keepEditMode: true });
        openInlineUpload(inlineWidgetUpload);
        return;
      }

      const inlineAppName = closestLauncherElement(event.target, '[data-inline-app-name]');
      if (inlineAppName) {
        selectInlineAppTarget(inlineAppName);
        focusInlineText(inlineAppName);
        return;
      }

      if (closestLauncherElement(event.target, '.phone-launcher-context-menu, .phone-launcher-diy-popover, .phone-launcher-style-panel, .phone-launcher-svg-panel')) return;

      if (launcherMenu || editPanelTab || editMode || editingWidgetId || styleEditingTarget || svgEditingAppId) {
        closeLauncherMenu();
        return;
      }

      const appButton = closestLauncherElement(event.target, '[data-app-id], [data-dock-app-id]');
      if (appButton) {
        openIdicPhoneApp(appButton.dataset.appId || appButton.dataset.dockAppId);
        return;
      }

      const widgetOpen = closestLauncherElement(event.target, '[data-widget-open]');
      if (widgetOpen && widgetOpen.dataset.widgetOpen === 'weather') {
        openIdicPhoneApp('weather');
        return;
      }

      if (closestLauncherElement(event.target, '[data-close-settings]')) closeLauncherSettings();
    });

    container.addEventListener('dragstart', (event) => {
      event.preventDefault();
    });

    container.addEventListener('dragover', (event) => {
      event.preventDefault();
    });

    container.addEventListener('drop', (event) => {
      event.preventDefault();
      draggedEditTarget = null;
    });

    container.addEventListener('dragend', () => {
      draggedEditTarget = null;
    });

    container.addEventListener('change', (event) => {
      const input = event.target;
      if (input instanceof HTMLInputElement && input.files && input.files[0]) {
        if (input.id === 'pl-wallpaper-file') void uploadWallpaper(input.files[0]);
        if (input.id === 'pl-icon-file') void uploadIcon(input.files[0]);
        if (input.id === 'pl-widget-file') void uploadWidgetImage(input.files[0]);
        if (input.id === 'pl-preset-file') void importLauncherPreset(input.files[0]);
        input.value = '';
        return;
      }
      if (input instanceof HTMLInputElement || input instanceof HTMLSelectElement) {
        if (input instanceof HTMLInputElement && input.dataset.styleColorText && !/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(input.value.trim())) return;
        syncEditorField(input);
      }
    });

    container.addEventListener('input', (event) => {
      const input = event.target;
      if (input instanceof HTMLInputElement && input.matches('[data-crop-scale]')) {
        setCropScale(input.value);
        return;
      }
      if ((input instanceof HTMLInputElement || input instanceof HTMLSelectElement) && input.matches('[data-style-field]')) {
        if (input instanceof HTMLInputElement && input.dataset.styleColorText) return;
        syncEditorField(input);
      }
    });

    container.addEventListener('contextmenu', (event) => {
      if (isUiChromeTarget(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      const now = Date.now();
      if (now - longPressTriggeredAt < 900 || now - lastLongPressMenuAt < 900 || (launcherMenu && now - (launcherMenu.openedAt || 0) < 900)) return;
      clearPressTimer();
      lastLongPressMenuAt = now;
      suppressImmediateLauncherClick(event);
      const target = readEditTargetFromElement(event.target);
      if (target) {
        const state = ensureLauncherState();
        const item = target.region === 'grid' ? findItem(state, target.id) : null;
        openLauncherMenu(item?.kind === 'widget' ? 'widget' : 'app', target, event);
      } else {
        openLauncherMenu('desktop', null, event);
      }
    });

    container.addEventListener('pointerdown', (event) => {
      const cropFrame = closestLauncherElement(event.target, '.phone-launcher-crop-frame');
      if (cropFrame && cropSession) {
        event.preventDefault();
        cropPointer = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          originX: Number(cropSession.x || 0),
          originY: Number(cropSession.y || 0)
        };
        cropFrame.setPointerCapture?.(event.pointerId);
        return;
      }
      if (editingWidgetId && closestLauncherElement(event.target, '[data-inline-widget-text], [data-inline-widget-upload], input, select, textarea')) return;
      if (isUiChromeTarget(event.target)) return;
      const target = readEditTargetFromElement(event.target);
      const hadFloatingChrome = Boolean(launcherMenu || editPanelTab || editMode || editingWidgetId || styleEditingTarget || svgEditingAppId);
      if (hadFloatingChrome && editingWidgetId && !target) {
        closeLauncherMenu();
        swipeStart = null;
        return;
      }
      if (!(editingWidgetId && target)) closeLauncherMenu({ render: false });
      pointerDragTarget = null;
      pointerDragStart = target ? { x: event.clientX, y: event.clientY } : null;
      pointerDragLast = pointerDragStart;
      pointerDragPointerId = null;
      activeDragElement = null;
      pointerDragOrigin = null;
      pointerDragging = false;
      swipeStart = { x: event.clientX, y: event.clientY };
      clearPressTimer();
      longPressTimer = window.setTimeout(() => {
        longPressTriggeredAt = Date.now();
        longPressReady = true;
        longPressReadyTarget = target ? { ...target } : null;
        if (target) {
          selectedEditTarget = target;
          editMode = true;
          activeDragElement = closestLauncherElement(event.target, target.region === 'grid' ? '[data-item-id]' : '[data-dock-app-id]') || getRenderedEditElement(target);
          pointerDragTarget = target;
          pointerDragStart = { x: event.clientX, y: event.clientY };
          pointerDragLast = pointerDragStart;
          pointerDragPointerId = event.pointerId;
          activeDragElement?.setPointerCapture?.(event.pointerId);
          const state = ensureLauncherState();
          const item = target.region === 'grid' ? findItem(state, target.id) : null;
          pointerDragOrigin = item ? { x: item.x || 0, y: item.y || 0 } : null;
          activeDragElement?.classList.add('is-longpress-ready');
          openLauncherMenu(item?.kind === 'widget' ? 'widget' : 'app', target, event, { render: false });
        } else {
          openLauncherMenu('desktop', null, event, { render: false });
        }
      }, 520);
    });

    container.addEventListener('pointermove', (event) => {
      if (cropPointer && cropSession && cropPointer.pointerId === event.pointerId) {
        event.preventDefault();
        cropSession.x = cropPointer.originX + event.clientX - cropPointer.startX;
        cropSession.y = cropPointer.originY + event.clientY - cropPointer.startY;
        updateCropImageTransform();
        return;
      }
      if (longPressReady && pointerDragTarget) {
        if (pointerDragStart && !pointerDragging) {
          const dx = event.clientX - pointerDragStart.x;
          const dy = event.clientY - pointerDragStart.y;
          if (Math.hypot(dx, dy) <= 8) return;
        }
        launcherMenu = null;
        editPanelTab = '';
        editMode = true;
        removeLauncherFloatingChrome();
        document.getElementById('phone-launcher-view')?.classList.remove('phone-launcher-menu-open');
        updatePointerDrag(event);
        return;
      }
      if (longPressTimer && swipeStart) {
        const dx = Math.abs(event.clientX - swipeStart.x);
        const dy = Math.abs(event.clientY - swipeStart.y);
        const cancelDistance = target ? 24 : 10;
        if (dx > cancelDistance || dy > cancelDistance) clearPressTimer();
      }
    });

    container.addEventListener('pointerup', (event) => {
      if (cropPointer && cropPointer.pointerId === event.pointerId) {
        cropPointer = null;
        return;
      }
      const wasLongPressReady = longPressReady;
      const readyTarget = longPressReadyTarget ? { ...longPressReadyTarget } : null;
      if (longPressTimer) {
        window.clearTimeout(longPressTimer);
        longPressTimer = null;
      }
      if (wasLongPressReady && pointerDragTarget && pointerDragStart) {
        const dx = event.clientX - pointerDragStart.x;
        const dy = event.clientY - pointerDragStart.y;
        if (pointerDragging || Math.hypot(dx, dy) > 22) {
          suppressImmediateLauncherClick(event);
          if (activeDragElement) {
            activeDragElement.style.removeProperty('--pl-drag-x');
            activeDragElement.style.removeProperty('--pl-drag-y');
            activeDragElement.classList.remove('is-dragging');
          }
          const dropElement = document.elementFromPoint(event.clientX, event.clientY);
          const target = readEditTargetFromElement(dropElement);
          if (target && !(target.region === pointerDragTarget.region && (target.id === pointerDragTarget.id || target.appId === pointerDragTarget.appId))) {
            moveEditTarget(pointerDragTarget, target);
          } else {
            moveGridItemToPoint(pointerDragTarget, event.clientX, event.clientY);
          }
          editMode = false;
          selectedEditTarget = null;
          stopPointerDrag();
          rerenderLauncher();
          swipeStart = null;
          return;
        } else if (readyTarget) {
          suppressImmediateLauncherClick(event);
        }
        stopPointerDrag();
      } else if (wasLongPressReady && !readyTarget) {
        suppressImmediateLauncherClick(event);
      } else if (swipeStart) {
        const state = ensureLauncherState();
        const dx = event.clientX - swipeStart.x;
        const dy = event.clientY - swipeStart.y;
        if (Math.abs(dx) > 34 && Math.abs(dy) < 64 && state.pages.length > 1) {
          setCurrentPage(currentPageIndex + (dx < 0 ? 1 : -1));
          suppressImmediateLauncherClick(event);
        }
      }
      stopPointerDrag();
      swipeStart = null;
    });

    ['pointercancel', 'pointerleave'].forEach((eventName) => {
      container.addEventListener(eventName, () => {
        cropPointer = null;
        clearPressTimer();
        stopPointerDrag();
        swipeStart = null;
      });
    });

    container.addEventListener('blur', (event) => {
      const appName = closestLauncherElement(event.target, '[data-inline-app-name]');
      if (appName) {
        saveInlineAppName(appName);
        return;
      }
      const widgetText = closestLauncherElement(event.target, '[data-inline-widget-text]');
      if (widgetText) saveInlineWidgetText(widgetText, false);
    }, true);

    container.addEventListener('keydown', (event) => {
      const inlineText = closestLauncherElement(event.target, '[data-inline-app-name], [data-inline-widget-text]');
      if (!inlineText) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        inlineText.blur();
      }
    });
  }

  function updateSettingsButtons(container, state) {
    const root = container || document.getElementById('phone-launcher-view');
    if (!root) return;
    root.querySelectorAll('[data-theme-mode]').forEach((button) => {
      button.classList.toggle('active', button.dataset.themeMode === state.themeMode);
    });
    root.querySelectorAll('[data-view-mode]').forEach((button) => {
      button.classList.toggle('active', button.dataset.viewMode === state.viewMode);
    });
    const statusValue = state.showFullscreenStatusBar === false ? 'hide' : 'show';
    root.querySelectorAll('[data-fullscreen-status-bar]').forEach((button) => {
      button.classList.toggle('active', button.dataset.fullscreenStatusBar === statusValue);
    });
  }

  function openPhoneLauncher() {
    const state = ensureLauncherState();
    const view = document.getElementById('phone-launcher-view');
    if (!view) return;
    applyLauncherClasses(view, state);
    renderPhoneLauncherDOM(view, state);

    const bridge = getBridge();
    if (bridge && typeof bridge.switchToView === 'function') bridge.switchToView('phone-launcher-view');
    else view.classList.remove('hidden');
  }

  function openLauncherSettings() {
    const modal = document.getElementById('pl-settings-modal');
    if (modal) modal.classList.add('active');
  }

  function closeLauncherSettings() {
    const modal = document.getElementById('pl-settings-modal');
    if (modal) modal.classList.remove('active');
  }

  function toggleLauncherTheme(mode) {
    const state = ensureLauncherState();
    state.themeMode = mode === 'night' ? 'night' : 'day';
    syncActiveThemeAliases(state);
    saveState();
    rerenderLauncher();
  }

  function toggleLauncherViewMode(mode) {
    const state = ensureLauncherState();
    state.viewMode = mode === 'phone-fullscreen' ? 'phone-fullscreen' : 'phone-shell';
    saveState();
    rerenderLauncher();
  }

  function toggleFullscreenStatusBar(mode) {
    const state = ensureLauncherState();
    state.showFullscreenStatusBar = mode !== 'hide';
    saveState();
    rerenderLauncher();
  }

  window.openPhoneLauncher = openPhoneLauncher;
  window.openIdicPhoneApp = openIdicPhoneApp;
  window.openLauncherSettings = openLauncherSettings;
  window.closeLauncherSettings = closeLauncherSettings;
  window.toggleLauncherTheme = toggleLauncherTheme;
  window.toggleLauncherViewMode = toggleLauncherViewMode;
  window.toggleFullscreenStatusBar = toggleFullscreenStatusBar;
  window.updatePhoneLauncherHomeFab = function (currentViewId) {
    const bridge = getBridge();
    if (bridge && typeof bridge.updateHomeFab === 'function') bridge.updateHomeFab(currentViewId || '');
  };
}());
