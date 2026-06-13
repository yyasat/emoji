/* phone_launcher_widgets.js - IDIC phone launcher layout widgets */
(function () {
  'use strict';

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function imageMarkup(src, className = '') {
    const value = String(src || '').trim();
    if (!value) return '';
    return `<img${className ? ` class="${escapeHtml(className)}"` : ''} src="${escapeHtml(value)}" alt="">`;
  }

  function firstPhoto(config) {
    return Array.isArray(config?.photos) ? String(config.photos[0] || '').trim() : '';
  }

  function photoPlaceholder(label) {
    return `<span class="plw-photo-placeholder">${escapeHtml(label)}</span>`;
  }

  function textAttrs(helpers, item, path) {
    return helpers && typeof helpers.text === 'function' ? helpers.text(item, path) : '';
  }

  function uploadAttrs(helpers, item, path) {
    return helpers && typeof helpers.upload === 'function' ? helpers.upload(item, path) : '';
  }

  const ICONS = {
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12.5 9 17l11-11"></path></svg>',
    calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 2v4M16 2v4M3 10h18"></path><rect x="3" y="4" width="18" height="18" rx="2"></rect></svg>',
    compass: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="m16.24 7.76-2.12 6.36-6.36 2.12 2.12-6.36z"></path></svg>',
    coffee: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 8h11v7a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z"></path><path d="M16 9h2a3 3 0 0 1 0 6h-2M8 3v2M12 3v2"></path></svg>',
    smile: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"></path></svg>',
    snow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 4.8 7 19.2M7 4.8l10 14.4M2 12h20"></path></svg>',
    truth: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 11 3 3L22 4"></path><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>',
    waves: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2M2 18c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2"></path></svg>',
    wind: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 8h11a4 4 0 1 0-4-4M3 12h17M3 16h11a4 4 0 1 1-4 4"></path></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>',
    stack: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="5" width="14" height="14" rx="2"></rect><path d="M3 9h2M19 9h2M3 15h2M19 15h2"></path></svg>',
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>',
    music: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>',
    image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"></rect><circle cx="9" cy="10" r="2"></circle><path d="m21 15-4-4-6 6-3-3-5 5"></path></svg>',
    id: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="M8 11h.01M12 10h5M12 14h5M8 15a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"></path></svg>'
  };

  const NEW_WIDGETS = [
    { id: 'todo', name: '\u5f85\u529e\u6e05\u5355', size: '4x2', w: 4, h: 2, icon: ICONS.check },
    { id: 'todoSmall', name: '\u5c0f\u5f85\u529e', size: '2x2', w: 2, h: 2, icon: ICONS.check },
    { id: 'idcard', name: '\u540d\u7247', size: '4x2', w: 4, h: 2, icon: ICONS.id },
    { id: 'photoBoard', name: '\u7167\u7247\u62fc\u8d34', size: '4x4', w: 4, h: 4, icon: ICONS.stack },
    { id: 'capsuleBoard', name: '\u80f6\u56ca\u7ec4\u4ef6', size: '4x2', w: 4, h: 2, icon: ICONS.user },
    { id: 'starProfileCalendar', name: '\u661f\u8f68\u540d\u7247', size: '4x2', w: 4, h: 2, icon: ICONS.id },
    { id: 'grayMusicPlayer', name: '\u7070\u8c03\u97f3\u4e50', size: '4x1', w: 4, h: 1, icon: ICONS.music },
    { id: 'grayMoodBoard', name: '\u7070\u8c03\u62fc\u8d34', size: '4x4', w: 4, h: 4, icon: ICONS.stack },
    { id: 'sageClock', name: '\u68ee\u7cfb\u65f6\u949f', size: '4x2', w: 4, h: 2, icon: ICONS.calendar },
    { id: 'sageTodo', name: '\u68ee\u7cfb\u5f85\u529e', size: '4x2', w: 4, h: 2, icon: ICONS.check },
    { id: 'iceProfile', name: '\u51b0\u84dd\u540d\u7247', size: '4x2', w: 4, h: 2, icon: ICONS.compass },
    { id: 'iceOrbit', name: '\u51b0\u84dd\u6807\u7b7e', size: '4x2', w: 4, h: 2, icon: ICONS.snow },
    { id: 'pastelCalendar', name: '\u7d2b\u7eff\u65e5\u5386', size: '4x2', w: 4, h: 2, icon: ICONS.calendar }
  ];

  const NEW_DEFAULTS = {
    todo: () => ({
      title: 'Something.',
      subtitle: 'Today',
      items: ['memo', 'photo', 'desk', 'tomorrow'],
      checked: [false, false, false, false]
    }),
    todoSmall: () => ({
      title: 'Today.',
      subtitle: 'Memo',
      items: ['water', 'reply', 'sleep'],
      checked: [false, false, false]
    }),
    idcard: () => ({
      avatar: '',
      banner: '',
      name: 'Name',
      handle: '@user',
      desc: 'signature',
      loc: 'location'
    }),
    clock: () => ({ quote: 'good things happen', style: 'analog', bg: '' }),
    weather: () => ({ style: 'xiaomi' }),
    polaroid: () => ({ photos: ['', '', ''], caption: 'Good Time' }),
    polaroidSmall: () => ({ photos: ['', '', ''], caption: 'Good Time' }),
    cd: () => ({ cover: '', centerRotate: true }),
    music: () => ({ cover: '', title: 'Untitled', artist: '', note: 'now playing' }),
    photoBoard: () => ({
      photos: ['', '', ''],
      title: 'Title',
      quote: 'short note',
      note: 'memo',
      caption: 'caption'
    }),
    capsuleBoard: () => ({
      avatar: '',
      centerText: 'center',
      leftTop: 'left',
      leftBottom: 'memo',
      rightTop: 'right',
      rightBottom: 'note'
    }),
    starProfileCalendar: () => ({
      avatar: '',
      name: 'Vertin',
      handle: '@stay_with_me',
      desc: '\u90a3\u4e00\u5929\u591c\u91cc\u7684\u96e8\uff0c\u843d\u5728\u4e86\u661f\u8f68\u4e2d\u592e\u3002'
    }),
    grayMusicPlayer: () => ({
      cover: '',
      title: 'Lucky to be loved',
      artist: 'K-ON Official'
    }),
    grayMoodBoard: () => ({
      title: 'Atmosphere',
      script: 'Good Time',
      meta: '* K-ON *',
      memoryPhoto: '',
      coffeePhoto: '',
      coffeeText: 'Coffee Time',
      quoteTitle: 'SELF LOVE',
      quote: '"Super happy Not in other people\'s comments."',
      foot: 'Daily Quote'
    }),
    sageClock: () => ({ themeLabel: 'GREEN THEME' }),
    sageTodo: () => ({
      cover: '',
      date: '2026-06-07',
      coverText: '\u613f\u6211\u4eec \u90fd\u80fd\u51ac\u5174',
      title: 'Something...',
      items: ['\u82e5\u4f60\u89c9\u5f97\u707f\u70c2', '\u5c71\u65e0\u906e\uff0c\u6d77\u65e0\u62e6', 'If you decide to shine'],
      checked: [true, false, true]
    }),
    iceProfile: () => ({
      avatar: '',
      banner: '',
      name: 'Three - Seven',
      tag: '\u4f26\u6566',
      handle: '@Three-_Seven',
      desc: '\u6211\u4eec\u7684\u672a\u6765 \u968f\u6f6e\u6c50\u6f02\u6d41\u81f3\u4e0d\u540c\u5c7f\u5cb8'
    }),
    iceOrbit: () => ({
      avatar: '',
      leftTop: 'Maths',
      leftBottom: 'Ocean',
      rightTop: 'Truth',
      rightBottom: 'Innocent',
      foot: '\u266a \u2727 \u2727 \u2727 \u266a'
    }),
    pastelCalendar: () => ({
      title: 'JULY 7\u6708\u65e5\u5386',
      badge: 'Good Luck',
      selected: '4'
    })
  };

  function renderTodoWidget(item, helpers) {
    const cfg = item.config || {};
    const rows = item.widgetId === 'todoSmall' ? 3 : 4;
    const items = Array.isArray(cfg.items) ? cfg.items.slice(0, rows) : [];
    const checked = Array.isArray(cfg.checked) ? cfg.checked : [];
    while (items.length < rows) items.push('');
    return `
      <button class="phone-launcher-widget plw-widget plw-todo ${item.widgetId === 'todoSmall' ? 'is-small' : ''}" type="button">
        <span class="plw-todo-head">
          <span>
            <span class="plw-title"${textAttrs(helpers, item, 'title')}>${escapeHtml(cfg.title || 'Something.')}</span>
            <span class="plw-subtitle"${textAttrs(helpers, item, 'subtitle')}>${escapeHtml(cfg.subtitle || '')}</span>
          </span>
        </span>
        <span class="plw-todo-list">
          ${items.map((txt, i) => `
            <span class="plw-todo-row">
              <span class="plw-check ${checked[i] ? 'is-done' : ''}"></span>
              <span${textAttrs(helpers, item, `items.${i}`)}>${escapeHtml(txt)}</span>
            </span>
          `).join('')}
        </span>
      </button>
    `;
  }

  function renderIdCardWidget(item, helpers) {
    const cfg = item.config || {};
    return `
      <button class="phone-launcher-widget plw-widget plw-idcard" type="button">
        <span class="plw-idcard-banner"${uploadAttrs(helpers, item, 'banner')}>
          ${cfg.banner ? imageMarkup(cfg.banner) : ''}
        </span>
        <span class="plw-idcard-panel">
          <span class="plw-idcard-avatar"${uploadAttrs(helpers, item, 'avatar')}>
            ${cfg.avatar ? imageMarkup(cfg.avatar) : ICONS.user}
          </span>
          <span class="plw-idcard-info">
            <span class="plw-idcard-name"${textAttrs(helpers, item, 'name')}>${escapeHtml(cfg.name || 'Name')}</span>
            <span class="plw-idcard-handle"${textAttrs(helpers, item, 'handle')}>${escapeHtml(cfg.handle || '')}</span>
            <span class="plw-idcard-desc"${textAttrs(helpers, item, 'desc')}>${escapeHtml(cfg.desc || '')}</span>
            <span class="plw-idcard-loc">${ICONS.pin}<span${textAttrs(helpers, item, 'loc')}>${escapeHtml(cfg.loc || '')}</span></span>
          </span>
        </span>
      </button>
    `;
  }

  function renderClockWidget(item, helpers) {
    const cfg = item.config || {};
    if (cfg.style === 'digital') {
      const dateText = new Date().toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit', weekday: 'short' });
      return `
        <button class="phone-launcher-widget plw-widget plw-clock-digital" type="button">
          <span class="plw-clock-bg"${uploadAttrs(helpers, item, 'bg')}>${cfg.bg ? imageMarkup(cfg.bg) : ''}</span>
          <span class="plw-clock-date">${escapeHtml(dateText)}</span>
          <span class="plw-clock-time" data-pl-clock>--:--</span>
          <span class="plw-clock-quote"${textAttrs(helpers, item, 'quote')}>${escapeHtml(cfg.quote || '')}</span>
        </button>
      `;
    }
    const romans = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
    return `
      <button class="phone-launcher-widget plw-widget plw-clock-analog" type="button">
        <span class="plw-analog-face">
          ${romans.map((label, i) => `<span class="plw-analog-number" style="--plw-angle:${i * 30}deg">${label}</span>`).join('')}
          ${Array.from({ length: 60 }).map((_, i) => `<span class="plw-analog-mark ${i % 5 === 0 ? 'is-hour' : ''}" style="transform: rotate(${i * 6}deg)"></span>`).join('')}
          <span class="plw-analog-hand plw-analog-hour"></span>
          <span class="plw-analog-hand plw-analog-min"></span>
          <span class="plw-analog-hand plw-analog-sec"></span>
          <span class="plw-analog-center"></span>
        </span>
      </button>
    `;
  }

  function renderWeatherWidget(item) {
    let weather = { city: '\u672a\u8bbe\u7f6e\u5730\u533a', temp: '--\u00b0', desc: '\u70b9\u51fb\u8bbe\u7f6e', forecast: [] };
    if (window.IDICPhoneLauncherBridge && typeof window.IDICPhoneLauncherBridge.getWeatherSummary === 'function') {
      weather = window.IDICPhoneLauncherBridge.getWeatherSummary();
    }
    const forecast = Array.isArray(weather.forecast) ? weather.forecast.slice(0, 4) : [];
    const hiLo = weather.lowHigh || (weather.today ? `${weather.today.tempMin || '--'}\u00b0/${weather.today.tempMax || '--'}\u00b0` : '--/--');
    const detail = escapeHtml(weather.desc);
    const range = weather.hasWeather ? escapeHtml(hiLo) : '';
    return `
      <button class="phone-launcher-widget plw-widget plw-weather-xiaomi" type="button" data-widget-open="weather">
        <span class="plw-weather-main">
          <span class="plw-weather-copy">
            <span class="plw-weather-city">${escapeHtml(weather.city)}</span>
            <span class="plw-weather-temp">${escapeHtml(weather.temp)}</span>
            <span class="plw-weather-desc"><span>${detail}</span>${range ? `<span>${range}</span>` : ''}</span>
          </span>
          <span class="plw-weather-orb">${weatherIconSvg(weather.iconCode || weather.desc)}</span>
        </span>
        <span class="plw-weather-hours">
          ${(forecast.length ? forecast : [{ dateLabel: '\u4eca\u5929', tempMax: '--', iconCode: weather.iconCode, description: weather.desc }, { dateLabel: '\u660e\u5929', tempMax: '--', iconCode: weather.iconCode, description: weather.desc }, { dateLabel: '\u540e\u5929', tempMax: '--', iconCode: weather.iconCode, description: weather.desc }, { dateLabel: '\u4e4b\u540e', tempMax: '--', iconCode: weather.iconCode, description: weather.desc }]).map((day) => `
            <span class="plw-weather-hour">
              <span>${escapeHtml(day.dateLabel || '')}</span>
              <span>${weatherIconSvg(day.iconCode || day.description)}</span>
              <span>${Number.isFinite(Number(day.tempMax)) ? `${Math.round(Number(day.tempMax))}\u00b0` : '--\u00b0'}</span>
            </span>
          `).join('')}
        </span>
      </button>
    `;
  }

  function weatherIconSvg(input) {
    const raw = String(input || '');
    if (/^\d{2}[dn]?$/.test(raw) && window.IDICPhoneLauncherBridge && typeof window.IDICPhoneLauncherBridge.getWeatherIconSvg === 'function') {
      return window.IDICPhoneLauncherBridge.getWeatherIconSvg(raw);
    }
    const value = raw.toLowerCase();
    const code = /^\d{2}/.test(value) ? value.slice(0, 2) : '';
    const isRain = code === '09' || code === '10' || /雨|rain|shower/.test(value);
    const isStorm = code === '11' || /雷|storm|thunder/.test(value);
    const isSnow = code === '13' || /雪|snow/.test(value);
    const isFog = code === '50' || /雾|霾|fog|mist|haze/.test(value);
    const isCloud = ['02', '03', '04'].includes(code) || /云|阴|cloud|overcast/.test(value);
    if (isStorm) return '<svg viewBox="0 0 48 48" fill="none"><path d="M9 30c-3-2.3-5-5.9-5-10C4 12.8 9.9 7 17.2 7c6 0 11.1 4 12.6 9.5a9 9 0 0 1 4.1-.9c5 0 9.1 4 9.1 9s-3.3 8.2-7.6 8.9" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><path d="m22 21-4 11h6l-3 10 11-14h-7l5-7z" fill="currentColor"/></svg>';
    if (isRain) return '<svg viewBox="0 0 48 48" fill="none"><path d="M9 30c-3-2.3-5-5.9-5-10C4 12.8 9.9 7 17.2 7c6 0 11.1 4 12.6 9.5a9 9 0 0 1 4.1-.9c5 0 9.1 4 9.1 9s-3.3 8.2-7.6 8.9" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><path d="M16 31v9M24 34v9M32 31v9" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>';
    if (isSnow) return '<svg viewBox="0 0 48 48" fill="none"><path d="M9 30c-3-2.3-5-5.9-5-10C4 12.8 9.9 7 17.2 7c6 0 11.1 4 12.6 9.5a9 9 0 0 1 4.1-.9c5 0 9.1 4 9.1 9s-3.3 8.2-7.6 8.9" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><path d="M18 27v8M14 31h8M31 30v8M27 34h8M24 37v7M20 41h8" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/></svg>';
    if (isFog) return '<svg viewBox="0 0 48 48" fill="none"><path d="M9 24c-3-2.3-5-5.2-5-9C4 8.4 9.9 4 17.2 4c6 0 11.1 3.3 12.6 8.6a10 10 0 0 1 4.1-.8c5 0 9.1 3.7 9.1 8.2 0 2.5-1.2 4.7-3.2 6.2" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><path d="M7 31h30M12 38h29M5 43h22" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>';
    if (isCloud) return '<svg viewBox="0 0 48 48" fill="none"><path d="M31 23a8 8 0 1 0-7.2-11.5" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><path d="M9 38c-3-2.3-5-5.9-5-10C4 20.8 9.9 15 17.2 15c6 0 11.1 4 12.6 9.5a9 9 0 0 1 4.1-.9c5 0 9.1 4 9.1 9 0 3.7-2.2 6.9-5.4 8.4" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>';
    return '<svg viewBox="0 0 48 48" fill="none"><circle cx="24" cy="24" r="12" fill="currentColor"/><path d="M24 3v6M24 39v6M3 24h6M39 24h6M9.1 9.1l4.2 4.2M34.7 34.7l4.2 4.2M38.9 9.1l-4.2 4.2M13.3 34.7l-4.2 4.2" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>';
  }

  function renderMusicWidget(item, helpers) {
    const cfg = item.config || {};
    return `
      <button class="phone-launcher-widget plw-widget plw-music-card" type="button">
        <span class="plw-music-icon">${ICONS.music}</span>
        <span class="plw-music-cover"${uploadAttrs(helpers, item, 'cover')}>
          ${cfg.cover ? imageMarkup(cfg.cover) : photoPlaceholder('cover')}
        </span>
        <span class="plw-music-body">
          <span class="plw-music-title"${textAttrs(helpers, item, 'title')}>${escapeHtml(cfg.title || 'Untitled')}</span>
          <span class="plw-music-note"${textAttrs(helpers, item, 'note')}>${escapeHtml(cfg.note || cfg.artist || '')}</span>
          <span class="plw-music-controls">
            <span>&lt;</span><span class="is-pause">||</span><span>&gt;</span>
          </span>
        </span>
      </button>
    `;
  }

  function renderCdWidget(item, helpers) {
    const cfg = item.config || {};
    return `
      <button class="phone-launcher-widget plw-widget plw-cd-player" type="button">
        <span class="plw-cd-label">CD</span>
        <span class="plw-cd-disc ${cfg.centerRotate === false ? 'is-still' : ''}"${uploadAttrs(helpers, item, 'cover')}>
          <span class="plw-cd-rings"></span>
          <span class="plw-cd-cover">${cfg.cover ? imageMarkup(cfg.cover) : photoPlaceholder('CD')}</span>
        </span>
        <span class="plw-tonearm"><span></span></span>
        <span class="plw-cd-knob"></span>
        <span class="plw-cd-switch"></span>
      </button>
    `;
  }

  function renderPolaroidWidget(item, helpers) {
    const cfg = item.config || {};
    const photos = Array.isArray(cfg.photos) ? cfg.photos : ['', '', ''];
    const small = item.widgetId === 'polaroidSmall';
    if (small) {
      const photo = firstPhoto(cfg);
      return `
        <button class="phone-launcher-widget plw-widget plw-polaroid-small" type="button">
          <span class="plw-polaroid-small-card">
            <span class="plw-tape"></span>
            <span class="plw-polaroid-small-photo"${uploadAttrs(helpers, item, 'photos.0')}>${photo ? imageMarkup(photo) : photoPlaceholder('photo')}</span>
            <span class="plw-polaroid-small-caption"${textAttrs(helpers, item, 'caption')}>${escapeHtml(cfg.caption || '')}</span>
          </span>
        </button>
      `;
    }
    return `
      <button class="phone-launcher-widget plw-widget plw-polaroid" type="button">
        ${[0, 1, 2].map((index) => `
          <span class="plw-polaroid-card is-${index + 1}">
            <span class="plw-tape"></span>
            <span class="plw-polaroid-photo"${uploadAttrs(helpers, item, `photos.${index}`)}>${photos[index] ? imageMarkup(photos[index]) : photoPlaceholder(`photo ${index + 1}`)}</span>
          </span>
        `).join('')}
        <span class="plw-polaroid-caption"${textAttrs(helpers, item, 'caption')}>${escapeHtml(cfg.caption || '')}</span>
      </button>
    `;
  }

  function renderPhotoBoardWidget(item, helpers) {
    const cfg = item.config || {};
    const photos = Array.isArray(cfg.photos) ? cfg.photos : [];
    return `
      <button class="phone-launcher-widget plw-widget plw-photo-board" type="button">
        <span class="plw-board-softbox">
          <span class="plw-board-title"${textAttrs(helpers, item, 'title')}>${escapeHtml(cfg.title || '')}</span>
          <span class="plw-board-quote"${textAttrs(helpers, item, 'quote')}>${escapeHtml(cfg.quote || '')}</span>
        </span>
        <span class="plw-board-stack is-one"${uploadAttrs(helpers, item, 'photos.0')}>${photos[0] ? imageMarkup(photos[0]) : photoPlaceholder('1')}</span>
        <span class="plw-board-stack is-two"${uploadAttrs(helpers, item, 'photos.1')}>${photos[1] ? imageMarkup(photos[1]) : photoPlaceholder('2')}</span>
        <span class="plw-board-stack is-three"${uploadAttrs(helpers, item, 'photos.2')}>${photos[2] ? imageMarkup(photos[2]) : photoPlaceholder('3')}</span>
        <span class="plw-board-note"${textAttrs(helpers, item, 'note')}>${escapeHtml(cfg.note || '')}</span>
        <span class="plw-board-caption"${textAttrs(helpers, item, 'caption')}>${escapeHtml(cfg.caption || '')}</span>
      </button>
    `;
  }

  function renderCapsuleBoardWidget(item, helpers) {
    const cfg = item.config || {};
    const pills = [
      ['is-left-top', 'leftTop', cfg.leftTop || 'left'],
      ['is-left-bottom', 'leftBottom', cfg.leftBottom || 'memo'],
      ['is-right-top', 'rightTop', cfg.rightTop || 'right'],
      ['is-right-bottom', 'rightBottom', cfg.rightBottom || 'note']
    ];
    return `
      <button class="phone-launcher-widget plw-widget plw-capsule-board" type="button">
        <span class="plw-capsule-avatar"${uploadAttrs(helpers, item, 'avatar')}>${cfg.avatar ? imageMarkup(cfg.avatar) : ICONS.user}</span>
        ${pills.map(([className, path, text]) => `<span class="plw-capsule-pill ${className}"${textAttrs(helpers, item, path)}>${escapeHtml(text)}</span>`).join('')}
        <span class="plw-capsule-text"${textAttrs(helpers, item, 'centerText')}>${escapeHtml(cfg.centerText || '')}</span>
      </button>
    `;
  }

  function renderStarProfileCalendarWidget(item, helpers) {
    const cfg = item.config || {};
    const days = [
      ['SUN', '8'],
      ['MON', '9'],
      ['TUE', '10'],
      ['WED', '11'],
      ['THU', '12'],
      ['FRI', '13'],
      ['SAT', '14']
    ];
    return `
      <button class="phone-launcher-widget plw-widget plw-ref-widget plw-star-profile-calendar" type="button">
        <span class="plw-star-profile-band"></span>
        <span class="plw-star-profile-avatar"${uploadAttrs(helpers, item, 'avatar')}>${cfg.avatar ? imageMarkup(cfg.avatar) : ICONS.smile}</span>
        <span class="plw-star-profile-copy">
          <span class="plw-star-profile-name"${textAttrs(helpers, item, 'name')}>${escapeHtml(cfg.name || 'Vertin')}</span>
          <span class="plw-star-profile-handle"${textAttrs(helpers, item, 'handle')}>${escapeHtml(cfg.handle || '@stay_with_me')}</span>
          <span class="plw-star-profile-desc"${textAttrs(helpers, item, 'desc')}>${escapeHtml(cfg.desc || '')}</span>
        </span>
        <span class="plw-star-calendar">
          ${days.map((day, index) => `
            <span class="plw-star-calendar-day ${index === 1 ? 'is-active' : ''}">
              <span>${day[0]}</span>
              <span>${day[1]}</span>
            </span>
          `).join('')}
        </span>
      </button>
    `;
  }

  function renderGrayMusicPlayerWidget(item, helpers) {
    const cfg = item.config || {};
    return `
      <button class="phone-launcher-widget plw-widget plw-ref-widget plw-gray-music-player" type="button">
        <span class="plw-gray-music-cover"${uploadAttrs(helpers, item, 'cover')}>${cfg.cover ? imageMarkup(cfg.cover) : ICONS.music}</span>
        <span class="plw-gray-music-copy">
          <span class="plw-gray-music-title"${textAttrs(helpers, item, 'title')}>${escapeHtml(cfg.title || 'Lucky to be loved')}</span>
          <span class="plw-gray-music-artist">${ICONS.music}<span${textAttrs(helpers, item, 'artist')}>${escapeHtml(cfg.artist || 'K-ON Official')}</span></span>
        </span>
        <span class="plw-gray-music-actions">
          <span>&lsaquo;</span>
          <span class="is-play">&#9654;</span>
          <span>&rsaquo;</span>
        </span>
      </button>
    `;
  }

  function renderGrayMoodBoardWidget(item, helpers) {
    const cfg = item.config || {};
    return `
      <button class="phone-launcher-widget plw-widget plw-ref-widget plw-gray-mood-board" type="button">
        <span class="plw-gray-mood-cell is-title">
          <span class="plw-gray-mood-title"${textAttrs(helpers, item, 'title')}>${escapeHtml(cfg.title || 'Atmosphere')}</span>
          <span class="plw-gray-mood-script"${textAttrs(helpers, item, 'script')}>${escapeHtml(cfg.script || 'Good Time')}</span>
          <span class="plw-gray-mood-meta"${textAttrs(helpers, item, 'meta')}>${escapeHtml(cfg.meta || '* K-ON *')}</span>
        </span>
        <span class="plw-gray-mood-cell is-memory">
          <span class="plw-gray-polaroid is-back">
            <span class="plw-gray-polaroid-photo"></span>
            <span>Rainy</span>
          </span>
          <span class="plw-gray-polaroid is-front"${uploadAttrs(helpers, item, 'memoryPhoto')}>
            <span class="plw-gray-polaroid-photo">${cfg.memoryPhoto ? imageMarkup(cfg.memoryPhoto) : ICONS.image}</span>
            <span>MEMORIES</span>
          </span>
        </span>
        <span class="plw-gray-mood-cell is-coffee">
          <span class="plw-gray-coffee-card"${uploadAttrs(helpers, item, 'coffeePhoto')}>
            <span class="plw-gray-coffee-photo">${cfg.coffeePhoto ? imageMarkup(cfg.coffeePhoto) : ICONS.coffee}</span>
            <span${textAttrs(helpers, item, 'coffeeText')}>${escapeHtml(cfg.coffeeText || 'Coffee Time')}</span>
          </span>
          <span class="plw-gray-mini-player">
            <span>&#9654;</span>
            <span><i></i></span>
            <span>01:12</span>
          </span>
        </span>
        <span class="plw-gray-mood-cell is-quote">
          <span class="plw-gray-quote-title"${textAttrs(helpers, item, 'quoteTitle')}>${escapeHtml(cfg.quoteTitle || 'SELF LOVE')}</span>
          <span class="plw-gray-quote-body"${textAttrs(helpers, item, 'quote')}>${escapeHtml(cfg.quote || '')}</span>
          <span class="plw-gray-quote-foot"${textAttrs(helpers, item, 'foot')}>${escapeHtml(cfg.foot || 'Daily Quote')}</span>
        </span>
      </button>
    `;
  }

  function renderSageClockWidget(item, helpers) {
    const cfg = item.config || {};
    const now = new Date();
    const period = now.getHours() >= 12 ? 'PM' : 'AM';
    const weekday = now.toLocaleDateString('zh-CN', { weekday: 'short' });
    const monthDay = now.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' });
    return `
      <button class="phone-launcher-widget plw-widget plw-ref-widget plw-sage-clock" type="button">
        <span class="plw-sage-clock-main">
          <span class="plw-sage-clock-time" data-pl-clock>--:--</span>
          <span class="plw-sage-clock-period">${period}</span>
        </span>
        <span class="plw-sage-clock-side">
          <span>${escapeHtml(weekday)}</span>
          <span>${escapeHtml(monthDay)}</span>
          <span${textAttrs(helpers, item, 'themeLabel')}>${escapeHtml(cfg.themeLabel || 'GREEN THEME')}</span>
        </span>
      </button>
    `;
  }

  function renderSageTodoWidget(item, helpers) {
    const cfg = item.config || {};
    const items = Array.isArray(cfg.items) ? cfg.items.slice(0, 3) : [];
    const checked = Array.isArray(cfg.checked) ? cfg.checked : [];
    while (items.length < 3) items.push('');
    return `
      <button class="phone-launcher-widget plw-widget plw-ref-widget plw-sage-todo" type="button">
        <span class="plw-sage-todo-cover"${uploadAttrs(helpers, item, 'cover')}>
          ${cfg.cover ? imageMarkup(cfg.cover) : ''}
          <span class="plw-sage-todo-date"${textAttrs(helpers, item, 'date')}>${escapeHtml(cfg.date || '2026-06-07')}</span>
          <span class="plw-sage-todo-cover-text"${textAttrs(helpers, item, 'coverText')}>${escapeHtml(cfg.coverText || '')}</span>
        </span>
        <span class="plw-sage-todo-body">
          <span class="plw-sage-todo-title"${textAttrs(helpers, item, 'title')}>${escapeHtml(cfg.title || 'Something...')}</span>
          <span class="plw-sage-todo-list">
            ${items.map((txt, i) => `
              <span class="plw-sage-todo-row ${checked[i] ? 'is-done' : ''}">
                <span></span>
                <span${textAttrs(helpers, item, `items.${i}`)}>${escapeHtml(txt)}</span>
              </span>
            `).join('')}
          </span>
        </span>
      </button>
    `;
  }

  function renderIceProfileWidget(item, helpers) {
    const cfg = item.config || {};
    return `
      <button class="phone-launcher-widget plw-widget plw-ref-widget plw-ice-profile" type="button">
        <span class="plw-ice-profile-banner"${uploadAttrs(helpers, item, 'banner')}>
          ${cfg.banner ? imageMarkup(cfg.banner) : ''}
          <span>${ICONS.wind}</span>
        </span>
        <span class="plw-ice-profile-body">
          <span class="plw-ice-profile-avatar"${uploadAttrs(helpers, item, 'avatar')}>${cfg.avatar ? imageMarkup(cfg.avatar) : ICONS.compass}</span>
          <span class="plw-ice-profile-name">
            <span${textAttrs(helpers, item, 'name')}>${escapeHtml(cfg.name || 'Three - Seven')}</span>
            <i${textAttrs(helpers, item, 'tag')}>${escapeHtml(cfg.tag || '')}</i>
          </span>
          <span class="plw-ice-profile-handle"${textAttrs(helpers, item, 'handle')}>${escapeHtml(cfg.handle || '@Three-_Seven')}</span>
          <span class="plw-ice-profile-desc"${textAttrs(helpers, item, 'desc')}>${escapeHtml(cfg.desc || '')}</span>
        </span>
      </button>
    `;
  }

  function renderIceOrbitWidget(item, helpers) {
    const cfg = item.config || {};
    const pills = [
      ['is-left-top', 'leftTop', cfg.leftTop || 'Maths', ICONS.compass],
      ['is-left-bottom', 'leftBottom', cfg.leftBottom || 'Ocean', ICONS.waves],
      ['is-right-top', 'rightTop', cfg.rightTop || 'Truth', ICONS.truth],
      ['is-right-bottom', 'rightBottom', cfg.rightBottom || 'Innocent', ICONS.snow]
    ];
    return `
      <button class="phone-launcher-widget plw-widget plw-ref-widget plw-ice-orbit" type="button">
        <span class="plw-ice-orbit-row">
          <span class="plw-ice-orbit-col">
            ${pills.slice(0, 2).map(([className, path, text, icon]) => `<span class="plw-ice-pill ${className}">${icon}<span${textAttrs(helpers, item, path)}>${escapeHtml(text)}</span></span>`).join('')}
          </span>
          <span class="plw-ice-orbit-avatar"${uploadAttrs(helpers, item, 'avatar')}>${cfg.avatar ? imageMarkup(cfg.avatar) : ICONS.smile}</span>
          <span class="plw-ice-orbit-col">
            ${pills.slice(2).map(([className, path, text, icon]) => `<span class="plw-ice-pill ${className}">${icon}<span${textAttrs(helpers, item, path)}>${escapeHtml(text)}</span></span>`).join('')}
          </span>
        </span>
        <span class="plw-ice-orbit-foot"${textAttrs(helpers, item, 'foot')}>${escapeHtml(cfg.foot || '')}</span>
      </button>
    `;
  }

  function renderPastelCalendarWidget(item, helpers) {
    const cfg = item.config || {};
    const days = ['\u65e5', '\u4e00', '\u4e8c', '\u4e09', '\u56db', '\u4e94', '\u516d'];
    const nums = ['29', '30', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
    const selected = String(cfg.selected || '4');
    return `
      <button class="phone-launcher-widget plw-widget plw-ref-widget plw-pastel-calendar" type="button">
        <span class="plw-pastel-calendar-head">
          <span${textAttrs(helpers, item, 'title')}>${escapeHtml(cfg.title || 'JULY 7\u6708\u65e5\u5386')}</span>
          <span${textAttrs(helpers, item, 'badge')}>${escapeHtml(cfg.badge || 'Good Luck')}</span>
        </span>
        <span class="plw-pastel-calendar-grid">
          ${days.map((day, index) => `<span class="${index === 0 || index === 6 ? 'is-muted' : ''}">${day}</span>`).join('')}
          ${nums.map((num, index) => `<span class="${num === selected ? 'is-selected' : ''} ${index < 2 ? 'is-muted' : ''}">${num}</span>`).join('')}
        </span>
      </button>
    `;
  }

  function renderTextField(renderWidgetTextField, item, path, label, value, placeholder = '') {
    return renderWidgetTextField(item, path, label, value, placeholder);
  }

  function renderPhotoFields(item, cfg, renderWidgetTextField, renderWidgetUploadButton, count) {
    const photos = Array.isArray(cfg.photos) ? cfg.photos : [];
    return Array.from({ length: count }).map((_, index) => `
      ${renderWidgetTextField(item, `photos.${index}`, `\u56fe\u7247 ${index + 1} URL`, photos[index])}
      <div class="phone-launcher-diy-row compact">${renderWidgetUploadButton(item, `photos.${index}`, `\u4e0a\u4f20\u56fe ${index + 1}`)}</div>
    `).join('');
  }

  window.IDICAestheticPack = {
    NEW_WIDGETS,
    NEW_DEFAULTS,
    renderWidget: function (item, helpers) {
      if (item.widgetId === 'todo' || item.widgetId === 'todoSmall') return renderTodoWidget(item, helpers);
      if (item.widgetId === 'idcard') return renderIdCardWidget(item, helpers);
      if (item.widgetId === 'clock') return renderClockWidget(item, helpers);
      if (item.widgetId === 'weather') return renderWeatherWidget(item, helpers);
      if (item.widgetId === 'music') return renderMusicWidget(item, helpers);
      if (item.widgetId === 'cd') return renderCdWidget(item, helpers);
      if (item.widgetId === 'polaroid' || item.widgetId === 'polaroidSmall') return renderPolaroidWidget(item, helpers);
      if (item.widgetId === 'photoBoard') return renderPhotoBoardWidget(item, helpers);
      if (item.widgetId === 'capsuleBoard') return renderCapsuleBoardWidget(item, helpers);
      if (item.widgetId === 'starProfileCalendar') return renderStarProfileCalendarWidget(item, helpers);
      if (item.widgetId === 'grayMusicPlayer') return renderGrayMusicPlayerWidget(item, helpers);
      if (item.widgetId === 'grayMoodBoard') return renderGrayMoodBoardWidget(item, helpers);
      if (item.widgetId === 'sageClock') return renderSageClockWidget(item, helpers);
      if (item.widgetId === 'sageTodo') return renderSageTodoWidget(item, helpers);
      if (item.widgetId === 'iceProfile') return renderIceProfileWidget(item, helpers);
      if (item.widgetId === 'iceOrbit') return renderIceOrbitWidget(item, helpers);
      if (item.widgetId === 'pastelCalendar') return renderPastelCalendarWidget(item, helpers);
      return null;
    },
    renderProps: function (item, renderWidgetTextField, renderWidgetUploadButton, renderWidgetHeader) {
      const cfg = item.config || {};
      if (item.widgetId === 'todo' || item.widgetId === 'todoSmall') {
        const rows = item.widgetId === 'todoSmall' ? [0, 1, 2] : [0, 1, 2, 3];
        return `
          ${renderWidgetHeader ? renderWidgetHeader(item.widgetId) : ''}
          ${renderTextField(renderWidgetTextField, item, 'title', '\u4e3b\u6807\u9898', cfg.title)}
          ${renderTextField(renderWidgetTextField, item, 'subtitle', '\u526f\u6807\u9898', cfg.subtitle)}
          ${rows.map((i) => renderTextField(renderWidgetTextField, item, `items.${i}`, `\u9879\u76ee ${i + 1}`, cfg.items?.[i])).join('')}
          <div class="phone-launcher-diy-row"><button class="phone-launcher-diy-btn danger" type="button" data-edit-action="remove">\u5220\u9664</button></div>
        `;
      }
      if (item.widgetId === 'idcard') {
        return `
          ${renderWidgetHeader ? renderWidgetHeader(item.widgetId) : ''}
          ${renderTextField(renderWidgetTextField, item, 'name', '\u540d\u5b57', cfg.name)}
          ${renderTextField(renderWidgetTextField, item, 'handle', '\u8d26\u53f7', cfg.handle)}
          ${renderTextField(renderWidgetTextField, item, 'desc', '\u7b7e\u540d', cfg.desc)}
          ${renderTextField(renderWidgetTextField, item, 'loc', '\u4f4d\u7f6e', cfg.loc)}
          ${renderWidgetTextField(item, 'avatar', '\u5934\u50cf URL', cfg.avatar)}
          ${renderWidgetTextField(item, 'banner', '\u9876\u90e8\u56fe\u7247 URL', cfg.banner)}
          <div class="phone-launcher-diy-row">
            ${renderWidgetUploadButton(item, 'avatar', '\u4e0a\u4f20\u5934\u50cf')}
            ${renderWidgetUploadButton(item, 'banner', '\u4e0a\u4f20\u9876\u90e8\u56fe')}
            <button class="phone-launcher-diy-btn danger" type="button" data-edit-action="remove">\u5220\u9664</button>
          </div>
        `;
      }
      if (item.widgetId === 'clock') {
        return `
          ${renderWidgetHeader ? renderWidgetHeader(item.widgetId) : ''}
          <label class="phone-launcher-diy-field">
            <span>\u98ce\u683c</span>
            <select data-widget-prop="${escapeHtml(item.id)}" data-widget-prop-path="style">
              <option value="analog" ${cfg.style !== 'digital' ? 'selected' : ''}>\u8868\u76d8</option>
              <option value="digital" ${cfg.style === 'digital' ? 'selected' : ''}>\u6570\u5b57</option>
            </select>
          </label>
          ${renderTextField(renderWidgetTextField, item, 'quote', '\u77ed\u53e5', cfg.quote)}
          ${renderWidgetTextField(item, 'bg', '\u80cc\u666f\u56fe URL', cfg.bg)}
          <div class="phone-launcher-diy-row">
            ${renderWidgetUploadButton(item, 'bg', '\u4e0a\u4f20\u80cc\u666f\u56fe')}
            <button class="phone-launcher-diy-btn danger" type="button" data-edit-action="remove">\u5220\u9664</button>
          </div>
        `;
      }
      if (item.widgetId === 'weather') {
        return `
          ${renderWidgetHeader ? renderWidgetHeader(item.widgetId) : ''}
          <label class="phone-launcher-diy-field">
            <span>\u5e03\u5c40</span>
            <select data-widget-prop="${escapeHtml(item.id)}" data-widget-prop-path="style">
              <option value="square" ${cfg.style !== 'bar' ? 'selected' : ''}>\u65b9\u5757</option>
              <option value="bar" ${cfg.style === 'bar' ? 'selected' : ''}>\u6a2a\u6761</option>
            </select>
          </label>
          <div class="phone-launcher-diy-row"><button class="phone-launcher-diy-btn danger" type="button" data-edit-action="remove">\u5220\u9664</button></div>
        `;
      }
      if (item.widgetId === 'music') {
        return `
          ${renderWidgetHeader ? renderWidgetHeader(item.widgetId) : ''}
          ${renderTextField(renderWidgetTextField, item, 'title', '\u6807\u9898', cfg.title)}
          ${renderTextField(renderWidgetTextField, item, 'artist', '\u526f\u6807\u9898', cfg.artist)}
          ${renderTextField(renderWidgetTextField, item, 'note', '\u88c5\u9970\u6587\u5b57', cfg.note)}
          ${renderWidgetTextField(item, 'cover', '\u5c01\u9762 URL', cfg.cover)}
          <div class="phone-launcher-diy-row">
            ${renderWidgetUploadButton(item, 'cover', '\u4e0a\u4f20\u5c01\u9762')}
            <button class="phone-launcher-diy-btn danger" type="button" data-edit-action="remove">\u5220\u9664</button>
          </div>
        `;
      }
      if (item.widgetId === 'cd') {
        return `
          ${renderWidgetHeader ? renderWidgetHeader(item.widgetId) : ''}
          ${renderWidgetTextField(item, 'cover', 'CD \u56fe\u7247 URL', cfg.cover)}
          <label class="phone-launcher-diy-check">
            <input type="checkbox" data-widget-check="${escapeHtml(item.id)}" data-widget-check-path="centerRotate" ${cfg.centerRotate !== false ? 'checked' : ''}>
            <span>\u5c01\u9762\u8ddf\u968f\u65cb\u8f6c</span>
          </label>
          <div class="phone-launcher-diy-row">
            ${renderWidgetUploadButton(item, 'cover', '\u4e0a\u4f20 CD \u56fe')}
            <button class="phone-launcher-diy-btn danger" type="button" data-edit-action="remove">\u5220\u9664</button>
          </div>
        `;
      }
      if (item.widgetId === 'polaroid' || item.widgetId === 'polaroidSmall') {
        return `
          ${renderWidgetHeader ? renderWidgetHeader(item.widgetId) : ''}
          ${renderTextField(renderWidgetTextField, item, 'caption', '\u7559\u8a00', cfg.caption)}
          ${renderWidgetTextField(item, 'photos.0', '\u56fe\u7247 URL', cfg.photos?.[0])}
          <div class="phone-launcher-diy-row">
            ${renderWidgetUploadButton(item, 'photos.0', '\u4e0a\u4f20\u56fe\u7247')}
            <button class="phone-launcher-diy-btn danger" type="button" data-edit-action="remove">\u5220\u9664</button>
          </div>
        `;
      }
      if (item.widgetId === 'photoBoard') {
        return `
          ${renderWidgetHeader ? renderWidgetHeader(item.widgetId) : ''}
          ${renderTextField(renderWidgetTextField, item, 'title', '\u6807\u9898', cfg.title)}
          ${renderTextField(renderWidgetTextField, item, 'quote', '\u77ed\u53e5', cfg.quote)}
          ${renderTextField(renderWidgetTextField, item, 'note', '\u65c1\u6ce8', cfg.note)}
          ${renderTextField(renderWidgetTextField, item, 'caption', '\u5e95\u90e8\u6587\u5b57', cfg.caption)}
          ${renderPhotoFields(item, cfg, renderWidgetTextField, renderWidgetUploadButton, 3)}
          <div class="phone-launcher-diy-row"><button class="phone-launcher-diy-btn danger" type="button" data-edit-action="remove">\u5220\u9664</button></div>
        `;
      }
      if (item.widgetId === 'capsuleBoard') {
        return `
          ${renderWidgetHeader ? renderWidgetHeader(item.widgetId) : ''}
          ${renderTextField(renderWidgetTextField, item, 'leftTop', '\u5de6\u4e0a', cfg.leftTop)}
          ${renderTextField(renderWidgetTextField, item, 'leftBottom', '\u5de6\u4e0b', cfg.leftBottom)}
          ${renderTextField(renderWidgetTextField, item, 'rightTop', '\u53f3\u4e0a', cfg.rightTop)}
          ${renderTextField(renderWidgetTextField, item, 'rightBottom', '\u53f3\u4e0b', cfg.rightBottom)}
          ${renderTextField(renderWidgetTextField, item, 'centerText', '\u4e2d\u95f4\u6587\u5b57', cfg.centerText)}
          ${renderWidgetTextField(item, 'avatar', '\u4e2d\u95f4\u56fe\u7247 URL', cfg.avatar)}
          <div class="phone-launcher-diy-row">
            ${renderWidgetUploadButton(item, 'avatar', '\u4e0a\u4f20\u4e2d\u95f4\u56fe')}
            <button class="phone-launcher-diy-btn danger" type="button" data-edit-action="remove">\u5220\u9664</button>
          </div>
        `;
      }
      if (item.widgetId === 'starProfileCalendar') {
        return `
          ${renderWidgetHeader ? renderWidgetHeader(item.widgetId) : ''}
          ${renderTextField(renderWidgetTextField, item, 'name', '\u540d\u5b57', cfg.name)}
          ${renderTextField(renderWidgetTextField, item, 'handle', '\u8d26\u53f7', cfg.handle)}
          ${renderTextField(renderWidgetTextField, item, 'desc', '\u63cf\u8ff0', cfg.desc)}
          ${renderWidgetTextField(item, 'avatar', '\u5934\u50cf URL', cfg.avatar)}
          <div class="phone-launcher-diy-row">
            ${renderWidgetUploadButton(item, 'avatar', '\u4e0a\u4f20\u5934\u50cf')}
            <button class="phone-launcher-diy-btn danger" type="button" data-edit-action="remove">\u5220\u9664</button>
          </div>
        `;
      }
      if (item.widgetId === 'grayMusicPlayer') {
        return `
          ${renderWidgetHeader ? renderWidgetHeader(item.widgetId) : ''}
          ${renderTextField(renderWidgetTextField, item, 'title', '\u6b4c\u540d', cfg.title)}
          ${renderTextField(renderWidgetTextField, item, 'artist', '\u827a\u672f\u5bb6', cfg.artist)}
          ${renderWidgetTextField(item, 'cover', '\u5c01\u9762 URL', cfg.cover)}
          <div class="phone-launcher-diy-row">
            ${renderWidgetUploadButton(item, 'cover', '\u4e0a\u4f20\u5c01\u9762')}
            <button class="phone-launcher-diy-btn danger" type="button" data-edit-action="remove">\u5220\u9664</button>
          </div>
        `;
      }
      if (item.widgetId === 'grayMoodBoard') {
        return `
          ${renderWidgetHeader ? renderWidgetHeader(item.widgetId) : ''}
          ${renderTextField(renderWidgetTextField, item, 'title', '\u5de6\u4e0a\u6807\u9898', cfg.title)}
          ${renderTextField(renderWidgetTextField, item, 'script', '\u5de6\u4e0a\u624b\u5199\u5b57', cfg.script)}
          ${renderTextField(renderWidgetTextField, item, 'meta', '\u5de6\u4e0b\u5c0f\u5b57', cfg.meta)}
          ${renderTextField(renderWidgetTextField, item, 'coffeeText', '\u5496\u5561\u56fe\u7247\u5b57', cfg.coffeeText)}
          ${renderTextField(renderWidgetTextField, item, 'quoteTitle', '\u53f3\u4e0b\u6807\u9898', cfg.quoteTitle)}
          ${renderTextField(renderWidgetTextField, item, 'quote', '\u53f3\u4e0b\u6587\u5b57', cfg.quote)}
          ${renderTextField(renderWidgetTextField, item, 'foot', '\u53f3\u4e0b\u5c0f\u5b57', cfg.foot)}
          ${renderWidgetTextField(item, 'memoryPhoto', '\u62cd\u7acb\u5f97 URL', cfg.memoryPhoto)}
          ${renderWidgetTextField(item, 'coffeePhoto', '\u5496\u5561\u56fe URL', cfg.coffeePhoto)}
          <div class="phone-launcher-diy-row">
            ${renderWidgetUploadButton(item, 'memoryPhoto', '\u4e0a\u4f20\u62cd\u7acb\u5f97')}
            ${renderWidgetUploadButton(item, 'coffeePhoto', '\u4e0a\u4f20\u5496\u5561\u56fe')}
            <button class="phone-launcher-diy-btn danger" type="button" data-edit-action="remove">\u5220\u9664</button>
          </div>
        `;
      }
      if (item.widgetId === 'sageClock') {
        return `
          ${renderWidgetHeader ? renderWidgetHeader(item.widgetId) : ''}
          ${renderTextField(renderWidgetTextField, item, 'themeLabel', '\u53f3\u4fa7\u6807\u7b7e', cfg.themeLabel)}
          <div class="phone-launcher-diy-row"><button class="phone-launcher-diy-btn danger" type="button" data-edit-action="remove">\u5220\u9664</button></div>
        `;
      }
      if (item.widgetId === 'sageTodo') {
        return `
          ${renderWidgetHeader ? renderWidgetHeader(item.widgetId) : ''}
          ${renderTextField(renderWidgetTextField, item, 'date', '\u65e5\u671f', cfg.date)}
          ${renderTextField(renderWidgetTextField, item, 'coverText', '\u5c01\u9762\u6587\u5b57', cfg.coverText)}
          ${renderTextField(renderWidgetTextField, item, 'title', '\u53f3\u4fa7\u6807\u9898', cfg.title)}
          ${[0, 1, 2].map((i) => renderTextField(renderWidgetTextField, item, `items.${i}`, `\u5f85\u529e ${i + 1}`, cfg.items?.[i])).join('')}
          ${renderWidgetTextField(item, 'cover', '\u5c01\u9762 URL', cfg.cover)}
          <div class="phone-launcher-diy-row">
            ${renderWidgetUploadButton(item, 'cover', '\u4e0a\u4f20\u5c01\u9762')}
            <button class="phone-launcher-diy-btn danger" type="button" data-edit-action="remove">\u5220\u9664</button>
          </div>
        `;
      }
      if (item.widgetId === 'iceProfile') {
        return `
          ${renderWidgetHeader ? renderWidgetHeader(item.widgetId) : ''}
          ${renderTextField(renderWidgetTextField, item, 'name', '\u540d\u5b57', cfg.name)}
          ${renderTextField(renderWidgetTextField, item, 'tag', '\u6807\u7b7e', cfg.tag)}
          ${renderTextField(renderWidgetTextField, item, 'handle', '\u8d26\u53f7', cfg.handle)}
          ${renderTextField(renderWidgetTextField, item, 'desc', '\u63cf\u8ff0', cfg.desc)}
          ${renderWidgetTextField(item, 'avatar', '\u5934\u50cf URL', cfg.avatar)}
          ${renderWidgetTextField(item, 'banner', '\u9876\u90e8\u56fe URL', cfg.banner)}
          <div class="phone-launcher-diy-row">
            ${renderWidgetUploadButton(item, 'avatar', '\u4e0a\u4f20\u5934\u50cf')}
            ${renderWidgetUploadButton(item, 'banner', '\u4e0a\u4f20\u9876\u90e8\u56fe')}
            <button class="phone-launcher-diy-btn danger" type="button" data-edit-action="remove">\u5220\u9664</button>
          </div>
        `;
      }
      if (item.widgetId === 'iceOrbit') {
        return `
          ${renderWidgetHeader ? renderWidgetHeader(item.widgetId) : ''}
          ${renderTextField(renderWidgetTextField, item, 'leftTop', '\u5de6\u4e0a', cfg.leftTop)}
          ${renderTextField(renderWidgetTextField, item, 'leftBottom', '\u5de6\u4e0b', cfg.leftBottom)}
          ${renderTextField(renderWidgetTextField, item, 'rightTop', '\u53f3\u4e0a', cfg.rightTop)}
          ${renderTextField(renderWidgetTextField, item, 'rightBottom', '\u53f3\u4e0b', cfg.rightBottom)}
          ${renderTextField(renderWidgetTextField, item, 'foot', '\u5e95\u90e8\u5b57', cfg.foot)}
          ${renderWidgetTextField(item, 'avatar', '\u4e2d\u95f4\u56fe\u7247 URL', cfg.avatar)}
          <div class="phone-launcher-diy-row">
            ${renderWidgetUploadButton(item, 'avatar', '\u4e0a\u4f20\u4e2d\u95f4\u56fe')}
            <button class="phone-launcher-diy-btn danger" type="button" data-edit-action="remove">\u5220\u9664</button>
          </div>
        `;
      }
      if (item.widgetId === 'pastelCalendar') {
        return `
          ${renderWidgetHeader ? renderWidgetHeader(item.widgetId) : ''}
          ${renderTextField(renderWidgetTextField, item, 'title', '\u6807\u9898', cfg.title)}
          ${renderTextField(renderWidgetTextField, item, 'badge', '\u6807\u7b7e', cfg.badge)}
          ${renderTextField(renderWidgetTextField, item, 'selected', '\u9009\u4e2d\u65e5\u671f', cfg.selected)}
          <div class="phone-launcher-diy-row"><button class="phone-launcher-diy-btn danger" type="button" data-edit-action="remove">\u5220\u9664</button></div>
        `;
      }
      return null;
    },
    updateAnalogClocks: function (container) {
      const now = new Date();
      const second = now.getSeconds();
      const minute = now.getMinutes();
      const hour = now.getHours();
      container.querySelectorAll('.plw-analog-sec').forEach((el) => {
        el.style.transform = `rotate(${second * 6}deg)`;
      });
      container.querySelectorAll('.plw-analog-min').forEach((el) => {
        el.style.transform = `rotate(${minute * 6 + second * 0.1}deg)`;
      });
      container.querySelectorAll('.plw-analog-hour').forEach((el) => {
        el.style.transform = `rotate(${(hour % 12) * 30 + minute * 0.5}deg)`;
      });
    }
  };
}());
