/**
 * 初始化移动端控制台查看器（仅手机端显示）。
 * 目标：在不改业务逻辑的前提下，让手机也能实时查看 console 输出。
 */
(function initMobileConsoleModule(root) {
    const api = createMobileConsole(root);

    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }

    if (root && typeof root === 'object') {
        root.IDICMobileConsole = api;
    }

    /**
     * 在 DOM 就绪后自动初始化，保证按钮和面板能挂到页面上。
     */
    function bootstrap() {
        try {
            api.init();
        } catch (_) {
            // 移动日志面板失败时不影响主应用。
        }
    }

    if (root && root.document) {
        if (root.document.readyState === 'loading') {
            bootstrap();
            root.document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
        } else {
            bootstrap();
        }
    }
}(typeof globalThis !== 'undefined' ? globalThis : this));

/**
 * 创建移动端控制台查看器实例。
 */
function createMobileConsole(root) {
    const MOBILE_QUERY = '(max-width: 900px)';
    const MAX_ENTRIES = 600;
    const PANEL_ID = 'idic-mobile-console-panel';
    const TOGGLE_ID = 'idic-mobile-console-toggle';
    const LOG_LIST_ID = 'idic-mobile-console-log-list';
    const STYLE_ID = 'idic-mobile-console-style';
    const CONSOLE_PATCH_FLAG = '__idicMobileConsolePatched';
    const TOGGLE_POSITION_KEY = 'idic-mobile-console-toggle-position';
    const LONG_PRESS_MS = 520;
    const MOVE_CANCEL_DISTANCE = 9;

    const state = {
        initialized: false,
        visible: false,
        entries: [],
        originalConsole: {},
        hasErrorHook: false,
        stickToBottom: true,
        togglePress: null
    };

    /**
     * 判断当前是否手机/窄屏环境。
     */
    function isMobileEnvironment() {
        if (!root || !root.matchMedia) return false;
        try {
            return !!root.matchMedia(MOBILE_QUERY).matches;
        } catch (_) {
            return false;
        }
    }

    /**
     * 将任意值安全转为字符串。
     */
    function stringifyValue(value) {
        if (typeof value === 'string') return value;
        if (typeof value === 'number' || typeof value === 'boolean' || value === null || value === undefined) {
            return String(value);
        }
        if (value instanceof Error) {
            return `${value.name || 'Error'}: ${value.message || ''}\n${value.stack || ''}`.trim();
        }
        try {
            return JSON.stringify(value);
        } catch (_) {
            try {
                return String(value);
            } catch (__) {
                return '[Unserializable]';
            }
        }
    }

    /**
     * 把 console 参数列表拼接成可读文本。
     */
    function stringifyArgs(args) {
        const list = Array.isArray(args) ? args : [];
        return list.map((item) => stringifyValue(item)).join(' ');
    }

    /**
     * 生成 HH:mm:ss 时间戳文本。
     */
    function formatTime(date) {
        const d = date instanceof Date ? date : new Date();
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        const ss = String(d.getSeconds()).padStart(2, '0');
        return `${hh}:${mm}:${ss}`;
    }

    function isNearBottom(element) {
        if (!element) return true;
        const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
        return distance <= 24;
    }

    function syncStickToBottomState(list) {
        state.stickToBottom = isNearBottom(list);
    }

    function scrollListToBottom(list) {
        if (!list) return;
        list.scrollTop = list.scrollHeight;
    }

    function clampNumber(value, min, max) {
        const number = Number(value);
        if (!Number.isFinite(number)) return min;
        return Math.min(max, Math.max(min, number));
    }

    function getPointerPoint(event) {
        const source = event && event.touches && event.touches[0]
            ? event.touches[0]
            : (event && event.changedTouches && event.changedTouches[0] ? event.changedTouches[0] : event);
        return {
            x: Number(source && source.clientX) || 0,
            y: Number(source && source.clientY) || 0
        };
    }

    function notify(message) {
        if (!root || !root.document) return;
        const text = String(message || '');
        if (!text) return;
        let tip = root.document.getElementById('idic-mobile-console-tip');
        if (!tip) {
            tip = root.document.createElement('div');
            tip.id = 'idic-mobile-console-tip';
            root.document.body.appendChild(tip);
        }
        tip.textContent = text;
        tip.classList.add('show');
        root.clearTimeout(tip._hideTimer);
        tip._hideTimer = root.setTimeout(() => {
            tip.classList.remove('show');
        }, 1500);
    }

    function copyText(text) {
        const value = String(text || '');
        if (!value) return Promise.resolve(false);
        const fallbackCopy = () => {
            const area = root.document.createElement('textarea');
            area.value = value;
            area.style.position = 'fixed';
            area.style.left = '-9999px';
            area.style.top = '0';
            area.style.opacity = '0';
            root.document.body.appendChild(area);
            area.focus();
            area.select();
            let ok = false;
            try {
                ok = root.document.execCommand('copy');
            } catch (_) {
                ok = false;
            }
            if (area.parentNode) area.parentNode.removeChild(area);
            return ok;
        };
        if (root.navigator && root.navigator.clipboard && typeof root.navigator.clipboard.writeText === 'function') {
            return root.navigator.clipboard.writeText(value).then(() => true).catch(() => fallbackCopy());
        }
        return Promise.resolve(fallbackCopy());
    }

    /**
     * 追加一条日志到内存与面板。
     */
    function appendEntry(level, args) {
        const entry = {
            time: new Date(),
            level: String(level || 'log').toLowerCase(),
            text: stringifyArgs(Array.isArray(args) ? args : [args])
        };

        state.entries.push(entry);
        if (state.entries.length > MAX_ENTRIES) {
            state.entries.splice(0, state.entries.length - MAX_ENTRIES);
        }

        const list = root.document.getElementById(LOG_LIST_ID);
        if (!list) return;
        const shouldStick = state.stickToBottom || isNearBottom(list);
        list.appendChild(renderEntryNode(entry));
        if (list.childElementCount > MAX_ENTRIES) {
            list.removeChild(list.firstChild);
        }
        if (shouldStick) {
            scrollListToBottom(list);
            state.stickToBottom = true;
        }
    }

    /**
     * 创建单条日志 DOM 节点。
     */
    function renderEntryNode(entry) {
        const row = root.document.createElement('div');
        row.className = `idic-mobile-console-row level-${entry.level}`;
        row.dataset.copyText = `${formatTime(entry.time)} [${entry.level.toUpperCase()}] ${entry.text}`;
        row.title = '长按复制这一条日志';

        const meta = root.document.createElement('div');
        meta.className = 'idic-mobile-console-meta';
        meta.textContent = `${formatTime(entry.time)} [${entry.level.toUpperCase()}]`;

        const text = root.document.createElement('div');
        text.className = 'idic-mobile-console-text';
        text.textContent = entry.text;

        row.appendChild(meta);
        row.appendChild(text);
        return row;
    }

    /**
     * 把当前缓存日志重绘到面板。
     */
    function renderEntries() {
        const list = root.document.getElementById(LOG_LIST_ID);
        if (!list) return;
        list.innerHTML = '';
        state.entries.forEach((entry) => list.appendChild(renderEntryNode(entry)));
        if (state.stickToBottom) {
            scrollListToBottom(list);
        }
    }

    /**
     * 注入移动端日志面板样式。
     */
    function ensureStyle() {
        if (!root.document || root.document.getElementById(STYLE_ID)) return;

        const style = root.document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
#${TOGGLE_ID}{
  position:fixed;right:10px;bottom:76px;z-index:2147483000;
  width:auto;min-width:38px;height:26px;border-radius:9px;border:1px solid rgba(255,255,255,.2);
  padding:0 9px;background:rgba(22,28,43,.84);color:#fff;font-size:12px;font-weight:700;
  box-shadow:0 4px 14px rgba(0,0,0,.24);opacity:.82;touch-action:none;
  user-select:none;-webkit-user-select:none;
}
#${TOGGLE_ID}.dragging{
  opacity:.96;transform:scale(1.03);box-shadow:0 8px 22px rgba(0,0,0,.34);
}
#${PANEL_ID}{
  position:fixed;left:0;right:0;bottom:0;z-index:2147483001;
  height:56vh;max-height:70vh;background:rgba(6,8,14,.96);color:#dbe5ff;
  border-top:1px solid rgba(255,255,255,.12);display:none;
  font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
}
#${PANEL_ID}.open{display:flex;flex-direction:column;}
#${PANEL_ID} .idic-mobile-console-header{
  display:flex;align-items:center;justify-content:space-between;
  padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.1);font-size:12px;
}
#${PANEL_ID} .idic-mobile-console-actions{display:flex;gap:8px;}
#${PANEL_ID} .idic-mobile-console-btn{
  border:1px solid rgba(255,255,255,.24);background:transparent;color:#fff;
  border-radius:8px;padding:4px 8px;font-size:12px;
}
#${LOG_LIST_ID}{
  flex:1;overflow:auto;padding:10px 12px 14px;line-height:1.35;
}
#${PANEL_ID} .idic-mobile-console-row{
  padding:7px 0;border-bottom:1px dashed rgba(255,255,255,.08);
  user-select:text;-webkit-user-select:text;
  -webkit-touch-callout:none;
}
#${PANEL_ID} .idic-mobile-console-row.copying{
  background:rgba(255,255,255,.07);
  margin:0 -8px;padding-left:8px;padding-right:8px;border-radius:8px;
}
#${PANEL_ID} .idic-mobile-console-meta{font-size:11px;opacity:.78;margin-bottom:4px;}
#${PANEL_ID} .idic-mobile-console-text{
  white-space:pre-wrap;word-break:break-word;font-size:12px;color:#e9eeff;
}
#${PANEL_ID} .level-warn .idic-mobile-console-meta{color:#ffd469;}
#${PANEL_ID} .level-error .idic-mobile-console-meta{color:#ff8f8f;}
#idic-mobile-console-tip{
  position:fixed;left:50%;bottom:calc(56vh + 14px);z-index:2147483002;
  transform:translateX(-50%) translateY(8px);opacity:0;pointer-events:none;
  padding:7px 10px;border-radius:999px;background:rgba(18,24,38,.92);color:#fff;
  font-size:12px;transition:opacity .18s ease,transform .18s ease;
  box-shadow:0 8px 24px rgba(0,0,0,.25);
}
#idic-mobile-console-tip.show{
  opacity:1;transform:translateX(-50%) translateY(0);
}
        `;
        root.document.head.appendChild(style);
    }

    function readSavedTogglePosition() {
        if (!root.localStorage) return null;
        try {
            const raw = root.localStorage.getItem(TOGGLE_POSITION_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            const left = Number(parsed && parsed.left);
            const top = Number(parsed && parsed.top);
            if (!Number.isFinite(left) || !Number.isFinite(top)) return null;
            return { left, top };
        } catch (_) {
            return null;
        }
    }

    function saveTogglePosition(left, top) {
        if (!root.localStorage) return;
        try {
            root.localStorage.setItem(TOGGLE_POSITION_KEY, JSON.stringify({
                left: Math.round(left),
                top: Math.round(top)
            }));
        } catch (_) {}
    }

    function applyTogglePosition(toggle, position) {
        if (!toggle || !position) return;
        const rect = toggle.getBoundingClientRect();
        const width = rect.width || toggle.offsetWidth || 44;
        const height = rect.height || toggle.offsetHeight || 28;
        const maxLeft = Math.max(8, root.innerWidth - width - 8);
        const maxTop = Math.max(8, root.innerHeight - height - 8);
        const left = clampNumber(position.left, 8, maxLeft);
        const top = clampNumber(position.top, 8, maxTop);
        toggle.style.left = `${left}px`;
        toggle.style.top = `${top}px`;
        toggle.style.right = 'auto';
        toggle.style.bottom = 'auto';
    }

    function bindToggleLongPressDrag(toggle) {
        if (!toggle || toggle.dataset.longPressDragBound) return;
        toggle.dataset.longPressDragBound = 'true';

        const cleanup = () => {
            const press = state.togglePress;
            if (!press) return;
            root.clearTimeout(press.timer);
            root.removeEventListener('mousemove', handleMove, true);
            root.removeEventListener('mouseup', handleEnd, true);
            root.removeEventListener('touchmove', handleMove, true);
            root.removeEventListener('touchend', handleEnd, true);
            root.removeEventListener('touchcancel', handleEnd, true);
            toggle.classList.remove('dragging');
            state.togglePress = null;
        };

        function startDrag(press) {
            if (!press || press.cancelled || press.dragging) return;
            const rect = toggle.getBoundingClientRect();
            press.dragging = true;
            press.baseLeft = rect.left;
            press.baseTop = rect.top;
            toggle.classList.add('dragging');
        }

        function handleDown(event) {
            if (event.button !== undefined && event.button !== 0) return;
            const point = getPointerPoint(event);
            cleanup();
            state.togglePress = {
                startX: point.x,
                startY: point.y,
                lastX: point.x,
                lastY: point.y,
                baseLeft: 0,
                baseTop: 0,
                dragging: false,
                cancelled: false,
                suppressClick: false,
                timer: root.setTimeout(() => {
                    startDrag(state.togglePress);
                }, LONG_PRESS_MS)
            };
            root.addEventListener('mousemove', handleMove, true);
            root.addEventListener('mouseup', handleEnd, true);
            root.addEventListener('touchmove', handleMove, { capture: true, passive: false });
            root.addEventListener('touchend', handleEnd, true);
            root.addEventListener('touchcancel', handleEnd, true);
        }

        function handleMove(event) {
            const press = state.togglePress;
            if (!press) return;
            const point = getPointerPoint(event);
            press.lastX = point.x;
            press.lastY = point.y;
            const dx = point.x - press.startX;
            const dy = point.y - press.startY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (!press.dragging && distance > MOVE_CANCEL_DISTANCE) {
                press.cancelled = true;
                press.suppressClick = true;
                root.clearTimeout(press.timer);
            }
            if (!press.dragging) return;
            if (event.cancelable) event.preventDefault();
            const rect = toggle.getBoundingClientRect();
            const width = rect.width || toggle.offsetWidth || 44;
            const height = rect.height || toggle.offsetHeight || 28;
            const left = clampNumber(press.baseLeft + dx, 8, root.innerWidth - width - 8);
            const top = clampNumber(press.baseTop + dy, 8, root.innerHeight - height - 8);
            toggle.style.left = `${left}px`;
            toggle.style.top = `${top}px`;
            toggle.style.right = 'auto';
            toggle.style.bottom = 'auto';
            press.suppressClick = true;
        }

        function handleEnd(event) {
            const press = state.togglePress;
            if (!press) return;
            const wasDragging = !!press.dragging;
            if (wasDragging) {
                if (event && event.cancelable) event.preventDefault();
                const rect = toggle.getBoundingClientRect();
                saveTogglePosition(rect.left, rect.top);
                press.suppressClick = true;
            }
            if (press.suppressClick) {
                toggle.dataset.ignoreNextClick = 'true';
                root.setTimeout(() => {
                    delete toggle.dataset.ignoreNextClick;
                }, 420);
            }
            cleanup();
        }

        toggle.addEventListener('mousedown', handleDown);
        toggle.addEventListener('touchstart', handleDown, { passive: true });
        toggle.addEventListener('click', (event) => {
            if (toggle.dataset.ignoreNextClick === 'true') {
                event.preventDefault();
                event.stopPropagation();
                return;
            }
            setVisible(!state.visible);
        });

        root.addEventListener('resize', () => {
            const rect = toggle.getBoundingClientRect();
            applyTogglePosition(toggle, { left: rect.left, top: rect.top });
        });
    }

    function bindLogEntryLongPressCopy(list) {
        if (!list || list.dataset.longPressCopyBound) return;
        list.dataset.longPressCopyBound = 'true';
        let press = null;

        const cleanup = () => {
            if (!press) return;
            root.clearTimeout(press.timer);
            if (press.row) press.row.classList.remove('copying');
            press = null;
        };

        function handleStart(event) {
            const row = event.target && event.target.closest
                ? event.target.closest('.idic-mobile-console-row')
                : null;
            if (!row || !list.contains(row)) return;
            const point = getPointerPoint(event);
            cleanup();
            press = {
                row,
                startX: point.x,
                startY: point.y,
                copied: false,
                timer: root.setTimeout(() => {
                    if (!press || press.row !== row) return;
                    press.copied = true;
                    row.classList.add('copying');
                    copyText(row.dataset.copyText || row.textContent || '').then((ok) => {
                        notify(ok ? '已复制这一条日志' : '复制失败，请手动复制');
                    });
                }, LONG_PRESS_MS)
            };
        }

        function handleMove(event) {
            if (!press) return;
            const point = getPointerPoint(event);
            const dx = point.x - press.startX;
            const dy = point.y - press.startY;
            if (Math.sqrt(dx * dx + dy * dy) > MOVE_CANCEL_DISTANCE) {
                cleanup();
            }
        }

        function handleEnd(event) {
            if (press && press.copied && event && event.cancelable) {
                event.preventDefault();
                event.stopPropagation();
            }
            cleanup();
        }

        list.addEventListener('mousedown', handleStart);
        list.addEventListener('touchstart', handleStart, { passive: true });
        list.addEventListener('mousemove', handleMove, true);
        list.addEventListener('touchmove', handleMove, { capture: true, passive: true });
        list.addEventListener('mouseup', handleEnd, true);
        list.addEventListener('mouseleave', cleanup, true);
        list.addEventListener('touchend', handleEnd, true);
        list.addEventListener('touchcancel', cleanup, true);
    }

    /**
     * 创建悬浮按钮与面板 DOM。
     */
    function ensureDom() {
        if (!root.document) return;
        ensureStyle();

        let toggle = root.document.getElementById(TOGGLE_ID);
        if (!toggle) {
            toggle = root.document.createElement('button');
            toggle.id = TOGGLE_ID;
            toggle.type = 'button';
            toggle.textContent = '日志';
            toggle.title = '打开移动日志';
            root.document.body.appendChild(toggle);
        }
        root.requestAnimationFrame(() => applyTogglePosition(toggle, readSavedTogglePosition()));
        bindToggleLongPressDrag(toggle);

        let panel = root.document.getElementById(PANEL_ID);
        if (!panel) {
            panel = root.document.createElement('div');
            panel.id = PANEL_ID;
            panel.innerHTML = `
<div class="idic-mobile-console-header">
  <strong>移动端日志</strong>
  <div class="idic-mobile-console-actions">
    <button type="button" class="idic-mobile-console-btn" data-action="copy">复制</button>
    <button type="button" class="idic-mobile-console-btn" data-action="clear">清空</button>
    <button type="button" class="idic-mobile-console-btn" data-action="close">关闭</button>
  </div>
</div>
<div id="${LOG_LIST_ID}"></div>
`.trim();
            panel.addEventListener('click', handlePanelClick);
            root.document.body.appendChild(panel);
        }

        const list = panel.querySelector(`#${LOG_LIST_ID}`);
        if (list && !list.dataset.scrollBound) {
            list.dataset.scrollBound = 'true';
            list.addEventListener('scroll', function handleLogScroll() {
                syncStickToBottomState(list);
            }, { passive: true });
        }
        bindLogEntryLongPressCopy(list);

        renderEntries();
    }

    /**
     * 处理面板按钮事件。
     */
    function handlePanelClick(event) {
        const button = event.target && event.target.closest ? event.target.closest('button[data-action]') : null;
        if (!button) return;
        const action = String(button.getAttribute('data-action') || '').trim();
        if (action === 'close') {
            setVisible(false);
            return;
        }
        if (action === 'clear') {
            clearEntries();
            return;
        }
        if (action === 'copy') {
            copyEntries();
        }
    }

    /**
     * 清空日志缓存与面板。
     */
    function clearEntries() {
        state.entries = [];
        state.stickToBottom = true;
        renderEntries();
    }

    /**
     * 复制日志文本到剪贴板。
     */
    function copyEntries() {
        const text = state.entries
            .map((entry) => `${formatTime(entry.time)} [${entry.level.toUpperCase()}] ${entry.text}`)
            .join('\n');
        if (!text) return;
        copyText(text).then((ok) => {
            notify(ok ? '已复制全部日志' : '复制失败，请手动复制');
        });
    }

    /**
     * 控制日志面板显示/隐藏。
     */
    function setVisible(visible) {
        state.visible = !!visible;
        const panel = root.document.getElementById(PANEL_ID);
        if (!panel) return;
        if (state.visible) {
            panel.classList.add('open');
            state.stickToBottom = true;
            renderEntries();
        } else {
            panel.classList.remove('open');
        }
    }

    /**
     * 覆盖 console 方法并保留原始输出。
     */
    function patchConsole() {
        if (!root.console || root.console[CONSOLE_PATCH_FLAG]) return;

        const methods = ['log', 'info', 'warn', 'error', 'debug'];
        methods.forEach((method) => {
            const original = typeof root.console[method] === 'function'
                ? root.console[method].bind(root.console)
                : function noop() {};
            state.originalConsole[method] = original;

            root.console[method] = function wrappedConsole() {
                const args = Array.prototype.slice.call(arguments);
                try {
                    appendEntry(method, args);
                } catch (_) {
                    // 日志镜像失败不能影响原 console。
                }
                return original.apply(root.console, args);
            };
        });

        root.console[CONSOLE_PATCH_FLAG] = true;
    }

    /**
     * 监听全局异常，方便手机排障。
     */
    function patchGlobalError() {
        if (state.hasErrorHook || !root.addEventListener) return;
        root.addEventListener('error', function onError(event) {
            const message = event && event.message ? event.message : 'Unknown error';
            const source = event && event.filename ? `${event.filename}:${event.lineno || 0}` : '';
            appendEntry('error', [`[window.onerror] ${message}`, source]);
        });
        root.addEventListener('unhandledrejection', function onUnhandled(event) {
            const reason = event && event.reason ? event.reason : 'Unknown promise rejection';
            appendEntry('error', ['[unhandledrejection]', reason]);
        });
        state.hasErrorHook = true;
    }

    /**
     * 初始化移动日志查看器。
     */
    function init() {
        if (state.initialized) return;
        if (!isMobileEnvironment()) return;
        if (!root.document || !root.document.body) return;

        patchConsole();
        patchGlobalError();
        ensureDom();
        state.initialized = true;

        appendEntry('info', ['[移动日志] 已启用，可在手机端查看 console 输出。']);
    }

    /**
     * 手动打开日志面板。
     */
    function show() {
        if (!state.initialized) init();
        setVisible(true);
    }

    /**
     * 手动关闭日志面板。
     */
    function hide() {
        setVisible(false);
    }

    /**
     * 切换日志面板开关状态。
     */
    function toggle() {
        if (!state.initialized) init();
        setVisible(!state.visible);
    }

    return {
        init: init,
        show: show,
        hide: hide,
        toggle: toggle,
        append: appendEntry
    };
}
