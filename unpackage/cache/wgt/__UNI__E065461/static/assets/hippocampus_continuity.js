/**
 * Hippocampus continuity layer.
 * Keeps a rolling 48h narrative summary plus long-running open threads.
 */
(function initHippocampusContinuityModule(root) {
    const api = createHippocampusContinuity(root);

    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }

    if (root && typeof root === 'object') {
        root.HippocampusContinuity = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this));

function createHippocampusContinuity(root) {
    const STORAGE_PREFIX = 'idic_hippocampus_continuity_v1';
    const VERSION = 1;
    const WINDOW_HOURS = 48;
    const DEFAULT_UPDATE_MESSAGE_THRESHOLD = 200;
    const MAX_ROLLING_ITEMS = 10;
    const MAX_THREADS = 8;
    const PROMPT_THREAD_LIMIT = 4;
    const CONTINUITY_API_RETRY_LIMIT = 3;
    const THREAD_GENERIC_TOKENS = new Set([
        '用户', '角色', '持续', '线索', '最近', '目前', '正在', '开始', '继续',
        '事情', '聊天', '状态', '项目', '工作', '学习', '测试', '处理'
    ]);

    function toTrimmedString(value) {
        return String(value === null || value === undefined ? '' : value).trim();
    }

    function isPlainObject(value) {
        return !!value && typeof value === 'object' && !Array.isArray(value);
    }

    function toFiniteNumber(value, fallback) {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : fallback;
    }

    function normalizeIso(value) {
        if (value instanceof Date) {
            const time = value.getTime();
            return Number.isFinite(time) ? value.toISOString() : '';
        }
        if (typeof value === 'number') {
            return Number.isFinite(value) && value > 0 ? new Date(value).toISOString() : '';
        }
        const text = toTrimmedString(value);
        if (!text) return '';
        const time = Date.parse(text);
        return Number.isFinite(time) ? new Date(time).toISOString() : '';
    }

    function timestampMs(value) {
        const iso = normalizeIso(value);
        const time = Date.parse(iso);
        return Number.isFinite(time) ? time : 0;
    }

    function normalizeStringArray(value, limit) {
        const max = Math.max(0, Math.floor(Number(limit) || 0)) || 8;
        const source = Array.isArray(value) ? value : [];
        const result = [];
        const seen = new Set();
        source.forEach(function eachItem(item) {
            const text = toTrimmedString(item).replace(/\s+/g, ' ');
            if (!text) return;
            const key = text.toLowerCase();
            if (seen.has(key)) return;
            seen.add(key);
            result.push(text.slice(0, 40));
        });
        return result.slice(0, max);
    }

    function getStorage() {
        if (root && root.localStorage) return root.localStorage;
        return null;
    }

    function buildStorageKey(userId, charId) {
        return `${STORAGE_PREFIX}:${toTrimmedString(userId) || 'local'}:${toTrimmedString(charId)}`;
    }

    function createEmptySnapshot(userId, charId) {
        return {
            version: VERSION,
            userId: toTrimmedString(userId),
            charId: toTrimmedString(charId),
            updatedAt: '',
            source: '',
            lastMessageCount: 0,
            lastSourceHash: '',
            rollingWindow: {
                windowHours: WINDOW_HOURS,
                sourceStartAt: '',
                sourceEndAt: '',
                summaryText: '',
                items: []
            },
            ongoingThreads: [],
            metadata: {}
        };
    }

    function normalizeRollingItem(item) {
        if (!isPlainObject(item)) return null;
        const title = toTrimmedString(item.title || item.theme || item.topic).slice(0, 60);
        const detail = toTrimmedString(item.detail || item.summary || item.content).replace(/\s+/g, ' ').slice(0, 520);
        if (!title && !detail) return null;
        return {
            title: title || detail.slice(0, 24),
            timeRange: toTrimmedString(item.timeRange || item.time_range || item.date || '').slice(0, 60),
            keywords: normalizeStringArray(item.keywords || item.trigger_keywords || item.triggers, 8),
            detail: detail,
            sourceMessageIds: normalizeStringArray(item.sourceMessageIds || item.source_message_ids, 12)
        };
    }

    function normalizeThread(item, fallbackNow) {
        if (!isPlainObject(item)) return null;
        const title = toTrimmedString(item.title || item.topic || item.name).slice(0, 80);
        const summary = toTrimmedString(item.summary || item.detail || item.content).replace(/\s+/g, ' ').slice(0, 520);
        if (!title && !summary) return null;
        const firstSeenAt = normalizeIso(item.firstSeenAt || item.first_seen_at || item.startedAt || item.started_at) || fallbackNow || '';
        const lastSeenAt = normalizeIso(item.lastSeenAt || item.last_seen_at || item.updatedAt || item.updated_at) || firstSeenAt || fallbackNow || '';
        const idSeed = toTrimmedString(item.id || item.threadId || item.thread_id)
            || `${title || summary.slice(0, 24)}:${firstSeenAt}`.toLowerCase();
        const ended = item.ended === true || item.isClosed === true || item.closed === true || !!normalizeIso(item.endedAt || item.ended_at);
        return {
            id: sanitizeId(idSeed),
            title: title || summary.slice(0, 28),
            summary: summary,
            keywords: normalizeStringArray(item.keywords || item.trigger_keywords || item.triggers, 10),
            firstSeenAt: firstSeenAt,
            lastSeenAt: lastSeenAt,
            status: toTrimmedString(item.status || (ended ? 'closed' : 'open')).slice(0, 40) || 'open',
            ended: ended,
            endedAt: normalizeIso(item.endedAt || item.ended_at),
            confidence: normalizeConfidence(item.confidence),
            sourceMessageIds: normalizeStringArray(item.sourceMessageIds || item.source_message_ids, 12)
        };
    }

    function normalizeConfidence(value) {
        const text = toTrimmedString(value).toLowerCase();
        if (text === 'high' || text === 'medium' || text === 'low') return text;
        return 'medium';
    }

    function sanitizeId(value) {
        const text = toTrimmedString(value).toLowerCase();
        const ascii = text.replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 64);
        if (ascii) return ascii;
        let hash = 2166136261;
        for (let i = 0; i < text.length; i += 1) {
            hash ^= text.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return `thread_${(hash >>> 0).toString(36)}`;
    }

    function normalizeSnapshot(value, userId, charId) {
        const empty = createEmptySnapshot(userId, charId);
        const source = isPlainObject(value) ? value : {};
        const rollingSource = isPlainObject(source.rollingWindow || source.rolling_window)
            ? (source.rollingWindow || source.rolling_window)
            : {};
        const now = normalizeIso(source.updatedAt || source.updated_at) || new Date().toISOString();
        const items = Array.isArray(rollingSource.items)
            ? rollingSource.items.map(normalizeRollingItem).filter(Boolean).slice(0, MAX_ROLLING_ITEMS)
            : [];
        const threads = Array.isArray(source.ongoingThreads || source.ongoing_threads)
            ? (source.ongoingThreads || source.ongoing_threads).map(function mapThread(item) {
                return normalizeThread(item, now);
            }).filter(Boolean)
            : [];

        return {
            version: Math.max(1, Math.floor(toFiniteNumber(source.version, VERSION))),
            userId: toTrimmedString(source.userId || source.user_id || userId),
            charId: toTrimmedString(source.charId || source.char_id || charId),
            updatedAt: now,
            source: toTrimmedString(source.source),
            lastMessageCount: Math.max(0, Math.floor(toFiniteNumber(source.lastMessageCount || source.last_message_count, 0))),
            lastSourceHash: toTrimmedString(source.lastSourceHash || source.last_source_hash),
            rollingWindow: {
                windowHours: WINDOW_HOURS,
                sourceStartAt: normalizeIso(rollingSource.sourceStartAt || rollingSource.source_start_at),
                sourceEndAt: normalizeIso(rollingSource.sourceEndAt || rollingSource.source_end_at),
                summaryText: toTrimmedString(rollingSource.summaryText || rollingSource.summary_text).slice(0, 2200),
                items: items
            },
            ongoingThreads: mergeThreads([], threads),
            metadata: isPlainObject(source.metadata) ? source.metadata : empty.metadata
        };
    }

    function readSnapshot(userId, charId) {
        const safeUserId = toTrimmedString(userId);
        const safeCharId = toTrimmedString(charId);
        if (!safeCharId) return createEmptySnapshot(safeUserId, safeCharId);
        const storage = getStorage();
        if (!storage) return createEmptySnapshot(safeUserId, safeCharId);
        try {
            const raw = storage.getItem(buildStorageKey(safeUserId, safeCharId));
            if (!raw) return createEmptySnapshot(safeUserId, safeCharId);
            return normalizeSnapshot(JSON.parse(raw), safeUserId, safeCharId);
        } catch (_) {
            return createEmptySnapshot(safeUserId, safeCharId);
        }
    }

    function writeSnapshot(snapshot) {
        const normalized = normalizeSnapshot(snapshot, snapshot && snapshot.userId, snapshot && snapshot.charId);
        const storage = getStorage();
        if (!storage || !normalized.charId) return normalized;
        try {
            storage.setItem(buildStorageKey(normalized.userId, normalized.charId), JSON.stringify(normalized));
        } catch (_) {
            // Ignore quota/storage failures; caller still receives the normalized snapshot.
        }
        return normalized;
    }

    function extractMessageText(message) {
        if (!isPlainObject(message)) return '';
        return toTrimmedString(message.content || message.text || message.message || message.body)
            .replace(/\s+/g, ' ');
    }

    function normalizeRole(message) {
        const role = toTrimmedString(message && (message.role || message.senderType || message.type)).toLowerCase();
        if (role === 'user' || role === 'human') return 'user';
        if (role === 'system' || role === 'thought' || role === 'recalled') return 'system';
        return 'assistant';
    }

    function resolveMessageTimestamp(message, fallbackMs) {
        const value = message && (
            message.timestamp !== undefined
                ? message.timestamp
                : (message.created_at !== undefined ? message.created_at : message.createdAt)
        );
        const parsed = timestampMs(value);
        return parsed > 0 ? parsed : fallbackMs;
    }

    function normalizeMessageRows(chatHistory) {
        const source = Array.isArray(chatHistory) ? chatHistory : [];
        const now = Date.now();
        const fallbackStart = now - Math.max(1, source.length) * 60 * 1000;
        const rows = [];
        source.forEach(function eachMessage(message, index) {
            const text = extractMessageText(message);
            const role = normalizeRole(message);
            if (!text || role === 'system') return;
            const timestamp = resolveMessageTimestamp(message, fallbackStart + index * 60 * 1000);
            rows.push({
                id: toTrimmedString(message && message.id) || `msg_${index}`,
                role: role,
                label: role === 'user' ? '用户' : '角色',
                content: text,
                timestampMs: timestamp,
                timestamp: new Date(timestamp).toISOString(),
                sourceChannel: normalizeSourceChannel(message)
            });
        });
        return rows;
    }

    function normalizeSourceChannel(message) {
        const type = toTrimmedString(message && message.type).toLowerCase();
        if (type === 'voice_call_text' || type === 'voice_call_record') return 'voice_call';
        if (type === 'video_call_text' || type === 'video_call_record') return 'video_call';
        return 'text_chat';
    }

    function selectRecentRows(rows, nowMs) {
        const cutoff = nowMs - WINDOW_HOURS * 60 * 60 * 1000;
        return rows.filter(function filterRecent(row) {
            return row && row.timestampMs >= cutoff;
        });
    }

    function formatDateTime(iso) {
        const time = Date.parse(iso);
        if (!Number.isFinite(time)) return '';
        const date = new Date(time);
        const pad = function pad(value) {
            return String(value).padStart(2, '0');
        };
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }

    function formatCoarseTimeBucket(iso, nowMs) {
        const time = Date.parse(iso);
        if (!Number.isFinite(time)) return '时间未知';
        const date = new Date(time);
        const nowDate = new Date(Number.isFinite(nowMs) ? nowMs : Date.now());
        const startOfDay = function startOfDay(value) {
            return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
        };
        const dayDiff = Math.round((startOfDay(nowDate) - startOfDay(date)) / (24 * 60 * 60 * 1000));
        let dayLabel = `${date.getMonth() + 1}月${date.getDate()}日`;
        if (dayDiff === 0) dayLabel = '今天';
        else if (dayDiff === 1) dayLabel = '昨天';
        else if (dayDiff === 2) dayLabel = '前天';

        const hour = date.getHours();
        let period = '晚上';
        if (hour < 5) period = '凌晨';
        else if (hour < 11) period = '上午';
        else if (hour < 14) period = '中午';
        else if (hour < 18) period = '下午';
        return `${dayLabel}${period}`;
    }

    function formatAge(iso, nowMs) {
        const time = Date.parse(iso);
        if (!Number.isFinite(time) || time <= 0) return '时间未知';
        const diffMs = Math.max(0, nowMs - time);
        const hours = Math.floor(diffMs / (60 * 60 * 1000));
        if (hours < 1) return '不到1小时前';
        if (hours < 24) return `${hours}小时前`;
        const days = Math.floor(hours / 24);
        if (days < 30) return `${days}天前`;
        const months = Math.floor(days / 30);
        if (months < 12) return `${months}个月前`;
        return `${Math.floor(months / 12)}年前`;
    }

    function buildTranscript(rows) {
        return rows.map(function mapRow(row) {
            const channel = row.sourceChannel && row.sourceChannel !== 'text_chat' ? `/${row.sourceChannel}` : '';
            return `[${formatDateTime(row.timestamp)}][${row.label}${channel}][${row.id}] ${row.content}`;
        }).join('\n');
    }

    function hashRows(rows) {
        const text = rows.map(function mapRow(row) {
            return `${row.id}|${row.timestamp}|${row.role}|${row.content}`;
        }).join('\n');
        let hash = 2166136261;
        for (let i = 0; i < text.length; i += 1) {
            hash ^= text.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0).toString(36);
    }

    function compactThreadTitleFromKeywords(keywords, fallbackText) {
        const source = Array.isArray(keywords) ? keywords : [];
        const selected = source.filter(function keepKeyword(keyword) {
            const text = toTrimmedString(keyword);
            return text && !THREAD_GENERIC_TOKENS.has(text);
        }).slice(0, 3);
        if (selected.length > 0) return selected.join(' / ');
        return toTrimmedString(fallbackText).slice(0, 28) || '持续线索';
    }

    function scoreThreadKeywordOverlap(thread, keywords, content) {
        const keywordSet = new Set(normalizeStringArray(keywords, 10).map(function normalizeKeyword(keyword) {
            return keyword.toLowerCase();
        }));
        const safeContent = toTrimmedString(content).toLowerCase();
        const threadKeywords = normalizeStringArray(thread && thread.keywords, 10);
        let score = 0;
        threadKeywords.forEach(function eachKeyword(keyword) {
            const key = keyword.toLowerCase();
            if (keywordSet.has(key)) score += 1;
            else if (key && safeContent.includes(key)) score += 1;
        });
        const title = toTrimmedString(thread && thread.title).toLowerCase();
        if (title && safeContent.includes(title)) score += 2;
        return score;
    }

    function looksLikeFragmentedContinuityText(text) {
        const safeText = toTrimmedString(text);
        if (!safeText) return false;
        const markerMatches = safeText.match(/用户提到|角色提到|关键词：|首次提到：|最近提到：|当前连续线索|# 自动总结|日期:|地点:|事件:|范围：|更新：|说明：这是最近48小时|<CurrentTopicScope>|<SelfAwareness>|如果旧记忆只是词面相似|当前这轮更像是在说/g) || [];
        if (markerMatches.length >= 3) return true;
        const timestampMatches = safeText.match(/\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/g) || [];
        if (timestampMatches.length >= 8 && markerMatches.length >= 1) return true;
        const semicolonCount = (safeText.match(/[；;]/g) || []).length;
        const longRawLines = safeText.split(/\n+/).filter(function keepLongRawLine(line) {
            return line.length >= 220 && /[；;]/.test(line);
        });
        if (semicolonCount >= 18 || longRawLines.length >= 2) return true;
        return false;
    }

    function shouldUpdateSnapshot(snapshot, rows, options) {
        const safeOptions = isPlainObject(options) ? options : {};
        if (safeOptions.force === true) return true;
        if (!rows.length) return false;
        const safeSnapshot = normalizeSnapshot(snapshot, safeOptions.userId, safeOptions.charId);
        if (looksLikeFragmentedContinuityText(safeSnapshot.rollingWindow.summaryText)) return true;
        const messageCount = Math.max(0, Math.floor(toFiniteNumber(safeSnapshot.lastMessageCount, 0)));
        const newCount = Math.max(0, rows.length - messageCount);
        const updateMessageThreshold = Math.max(
            1,
            Math.floor(toFiniteNumber(safeOptions.updateMessageThreshold || safeOptions.contextLimit, DEFAULT_UPDATE_MESSAGE_THRESHOLD))
        );
        if (!safeSnapshot.rollingWindow.summaryText && safeSnapshot.ongoingThreads.length <= 0) return true;
        if (newCount >= updateMessageThreshold) return true;
        return false;
    }

    function buildContinuityPrompt(options) {
        const source = isPlainObject(options) ? options : {};
        const previous = normalizeSnapshot(source.previousSnapshot, source.userId, source.charId);
        const rows = Array.isArray(source.recentRows) ? source.recentRows : [];
        const transcript = buildTranscript(rows);
        const previousForPrompt = {
            rollingWindow: previous.rollingWindow,
            ongoingThreads: previous.ongoingThreads
        };
        return [
            '# Role: 近两天叙事概要整理器',
            '',
            '你负责把角色与用户最近48小时的聊天整理成主聊天可读的背景概要。',
            '你的任务是“叙事压缩”，不是摘抄、不是分块、不是检索索引。',
            '',
            'rollingWindow.summaryText 是给主聊天模型看的“近两天叙事概要”：',
            '- 不要套固定模板，不要写“# 自动总结”、日期字段、时间字段、地点字段。',
            '- 必须先根据真实时间戳把聊天归类到粗时间段，例如“今天凌晨 / 今天上午 / 今天下午 / 今天晚上 / 昨天上午 / 昨天下午 / 昨天晚上”。',
            '- 输出成分组格式：先写粗时间段标题，下一行开始写该时间段的项目符号。',
            '- 只列有聊天内容的时间段，用户没上线/没聊天的时间段不要列。',
            '- 每个时间段按明显不同事件/主题拆项目符号：只有一件主事就 1 条；聊了很多不同事就多写几条。',
            '- 不要为了凑数量拆碎，也不要为了限制条数漏掉重要事件。',
            '- 每条项目符号都是高度概括的叙事句，合并同一主题下的多轮对话。',
            '- 高强度聊天也必须压缩主题，不要逐句复述。',
            '- 禁止把原文按 200 字左右切片；禁止连续使用原话短句；禁止把十几句原文用分号串起来。',
            '- 每条项目符号必须能回答“这一段整体发生了什么”，而不是“他们分别说了哪些句子”。',
            '- 代词必须消解清楚：如果谈的是用户的朋友、客户、路人、作品角色或第三方，必须写明“用户的朋友/某位客户/剧中角色/第三方”，不要用“她/他”让主聊天误以为是用户或当前角色。',
            '- 用户转述他人观点、吐槽别人经历、讨论影视/游戏/朋友关系时，不要改写成用户本人的长期心理状态。',
            '- 重点保留：发生了什么、双方状态、重要约定、冲突/安抚、现实处境、项目进展、新信息。',
            '- 不要输出“用户提到：... / 角色提到：...”这种逐句摘录。',
            '- 不要输出每一句聊天的时间戳、关键词清单、检索索引。',
            '- 不要编造输入里没有的事实、时间、因果和承诺。',
            '- 可以使用用户和角色在聊天里出现的称呼；不确定时用“用户/角色”。',
            '- 好的项目符号示例风格：用户因现实事务、身体状态或创作任务产生某种处境，角色如何回应、安抚、调侃或推进约定。不要照抄这个句式。',
            '',
            'rollingWindow.items 只供后台检索，可以给 0-6 个粗粒度主题项；禁止一条聊天生成一个 item。',
            '',
            'ongoingThreads 是给主聊天模型看的“用户长期状态/用户未结束事项”的来源，但必须非常克制：',
            '- 最多 4 条，只保留用户自己的、现实层面的、跨天仍相关的持续事项。',
            '- 每条都必须以用户为主体：用户正在做/正在经历/需要处理/仍受影响。不要记录角色自己的状态。',
            '- 只有以下类型可以进入 ongoingThreads：用户明确持续的项目/工作/创作/健康恢复/照护责任/订单或交付压力/旅行安排/还没解决的现实问题。',
            '- 角色对用户做出的承诺、未来幻想、情话、关系表态、物质支持承诺、亲密约定，不要进入 ongoingThreads；这些如果确实影响最近氛围，只能写进 summaryText。',
            '- 必须有 firstSeenAt 和 lastSeenAt，因为主聊天需要知道什么时候开始、已经持续多久、最近何时提到。',
            '- summary 写一句完整概要，解释这个用户状态为什么仍可能影响当前对话。',
            '- 短暂情绪、一次性身体不适、刚发生的小事、单轮吐槽不要写成 ongoingThreads，它们应写进 summaryText。',
            '- 影视剧情、游戏吐槽、朋友八卦、第三方恋爱观、天气、吃药、临时身体不适、单次“想选漂亮/吐槽AI/喝感冒灵”都不是长期状态。',
            '- 不要把“用户转述朋友不需要跟 AI 谈恋爱”写成用户本人的状态；这只能在 summaryText 里作为第三方观点出现，通常不进入 ongoingThreads。',
            '- 旧线索如果本轮没有提到，不要刷新 lastSeenAt。',
            '- 只有用户明确说结束、放弃、完成、通关、停止或换成别的，才标 ended=true。',
            '- 如果没有真正长期事项，ongoingThreads 输出空数组。',
            '',
            '只输出 JSON，不要 Markdown。格式：',
            '{',
            '  "rollingWindow": {',
            '    "summaryText": "昨天晚上：\\n- 叙事概要1\\n- 叙事概要2\\n\\n今天上午：\\n- 叙事概要3",',
            '    "items": [',
            '      { "title": "粗粒度主题", "timeRange": "时间范围", "keywords": ["关键词"], "detail": "高度概括的一句话", "sourceMessageIds": ["msg_id"] }',
            '    ]',
            '  },',
            '  "ongoingThreads": [',
            '    { "id": "stable_id", "title": "用户长期状态标题", "summary": "一句完整概要", "keywords": ["关键词"], "firstSeenAt": "ISO时间", "lastSeenAt": "ISO时间", "status": "open", "ended": false, "endedAt": "", "confidence": "high|medium|low", "sourceMessageIds": ["msg_id"] }',
            '  ]',
            '}',
            '',
            `角色名：${toTrimmedString(source.charName || source.charId || '角色')}`,
            '',
            '已有连续记忆快照（只用于判断旧长期线索，不要照抄进 summaryText）：',
            JSON.stringify(previousForPrompt, null, 2),
            '',
            '最近48小时聊天原文：',
            transcript || '（无）'
        ].join('\n');
    }

    function normalizeApiConfig(apiConfig) {
        const source = isPlainObject(apiConfig) ? apiConfig : {};
        const rawMaxTokens = source.maxTokens !== undefined ? source.maxTokens : source.max_tokens;
        const normalizedMaxTokens = Math.floor(toFiniteNumber(rawMaxTokens, 0));
        return {
            apiUrl: toTrimmedString(source.apiUrl || source.url || source.baseUrl),
            apiKey: toTrimmedString(source.apiKey || source.key),
            model: toTrimmedString(source.model || source.modelName),
            temperature: Number.isFinite(Number(source.temperature)) ? Number(source.temperature) : 0.2,
            hasMaxTokens: normalizedMaxTokens > 0,
            maxTokens: normalizedMaxTokens > 0 ? normalizedMaxTokens : null,
            headers: isPlainObject(source.headers) ? source.headers : {},
            requestBody: isPlainObject(source.requestBody || source.body) ? (source.requestBody || source.body) : {}
        };
    }

    function normalizeChatCompletionsUrl(apiUrl) {
        const clean = toTrimmedString(apiUrl).replace(/\/+$/g, '');
        if (!clean) return '';
        if (/\/chat\/completions$/i.test(clean)) return clean;
        if (/\/v1$/i.test(clean)) return `${clean}/chat/completions`;
        return `${clean}/chat/completions`;
    }

    function extractResponseText(payload) {
        if (typeof payload === 'string') return payload;
        if (!isPlainObject(payload)) return '';
        if (typeof payload.output_text === 'string') return payload.output_text;
        const choices = Array.isArray(payload.choices) ? payload.choices : [];
        for (let i = 0; i < choices.length; i += 1) {
            const choice = choices[i];
            const message = choice && choice.message;
            if (message && typeof message.content === 'string') return message.content;
            if (message && Array.isArray(message.content)) {
                const parts = message.content.map(function mapPart(part) {
                    if (typeof part === 'string') return part;
                    if (part && typeof part.text === 'string') return part.text;
                    return '';
                }).filter(Boolean);
                if (parts.length) return parts.join('\n');
            }
            if (typeof (choice && choice.text) === 'string') return choice.text;
        }
        return '';
    }

    function extractJsonCandidate(text) {
        const raw = toTrimmedString(text);
        if (!raw) return '';
        const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
        if (fenced && fenced[1]) return fenced[1].trim();
        const start = raw.indexOf('{');
        const end = raw.lastIndexOf('}');
        if (start >= 0 && end > start) return raw.slice(start, end + 1);
        return raw;
    }

    async function requestContinuityModel(prompt, apiConfig) {
        const config = normalizeApiConfig(apiConfig);
        const requestUrl = normalizeChatCompletionsUrl(config.apiUrl);
        const fetchImpl = root && typeof root.fetch === 'function'
            ? root.fetch.bind(root)
            : (typeof fetch === 'function' ? fetch : null);
        if (!fetchImpl || !requestUrl || !config.model) return null;

        const headers = Object.assign({ 'Content-Type': 'application/json' }, config.headers);
        if (config.apiKey && !headers.Authorization && !headers.authorization) {
            headers.Authorization = `Bearer ${config.apiKey}`;
        }
        const body = Object.assign({}, config.requestBody, {
            model: config.model,
            messages: [{ role: 'user', content: prompt }],
            temperature: config.temperature
        });
        if (config.hasMaxTokens) {
            body.max_tokens = config.maxTokens;
        }

        let response = null;
        try {
            response = await fetchImpl(requestUrl, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(body)
            });
        } catch (error) {
            const message = error && error.message ? error.message : String(error);
            throw new Error(`continuity_fetch_failed:${message}; url=${requestUrl}; prompt_chars=${prompt.length}`);
        }
        if (!response || !response.ok) {
            let errorText = '';
            try {
                errorText = response && typeof response.text === 'function' ? await response.text() : '';
            } catch (_) { }
            const detail = errorText ? `; detail=${errorText.slice(0, 300)}` : '';
            throw new Error(`continuity_request_failed:${response ? response.status : 'no_response'}; url=${requestUrl}; prompt_chars=${prompt.length}${detail}`);
        }
        const rawText = await response.text();
        let payload = rawText;
        try {
            payload = JSON.parse(rawText);
        } catch (_) {
            payload = rawText;
        }
        const modelText = extractResponseText(payload);
        const jsonText = extractJsonCandidate(modelText || rawText);
        try {
            return JSON.parse(jsonText);
        } catch (error) {
            const finishReason = isPlainObject(payload) && Array.isArray(payload.choices) && payload.choices[0]
                ? toTrimmedString(payload.choices[0].finish_reason || payload.choices[0].finishReason)
                : '';
            const message = error && error.message ? error.message : String(error);
            throw new Error(`continuity_json_parse_failed:${message}; url=${requestUrl}; prompt_chars=${prompt.length}; raw_chars=${rawText.length}; json_chars=${jsonText.length}${finishReason ? `; finish_reason=${finishReason}` : ''}`);
        }
    }

    async function requestContinuityModelWithRetry(prompt, apiConfig) {
        let lastError = null;
        for (let attempt = 1; attempt <= CONTINUITY_API_RETRY_LIMIT; attempt += 1) {
            try {
                const decision = await requestContinuityModel(prompt, apiConfig);
                if (!decision || typeof decision !== 'object') {
                    throw new Error('continuity_empty_decision');
                }
                const rolling = isPlainObject(decision.rollingWindow || decision.rolling_window)
                    ? (decision.rollingWindow || decision.rolling_window)
                    : {};
                const summaryText = toTrimmedString(rolling.summaryText || rolling.summary_text);
                if (!summaryText) {
                    throw new Error('continuity_empty_summary');
                }
                if (looksLikeFragmentedContinuityText(summaryText)) {
                    throw new Error('continuity_fragmented_summary');
                }
                return {
                    decision: decision,
                    attempts: attempt
                };
            } catch (error) {
                lastError = error;
                if (root && root.console && typeof root.console.warn === 'function') {
                    root.console.warn('[海马体][连续] API 调用失败，准备重试。attempt=' + attempt, error && error.message ? error.message : error);
                }
                if (attempt < CONTINUITY_API_RETRY_LIMIT) {
                    await new Promise(function waitRetry(resolve) {
                        setTimeout(resolve, 500 * attempt);
                    });
                }
            }
        }
        const message = lastError && lastError.message ? lastError.message : String(lastError || 'unknown_error');
        const finalError = new Error('continuity_api_failed_after_retries: ' + message);
        finalError.cause = lastError;
        finalError.attempts = CONTINUITY_API_RETRY_LIMIT;
        throw finalError;
    }

    function writeFailureMetadata(previousSnapshot, recentRows, allRows, prompt, error, options) {
        const source = isPlainObject(options) ? options : {};
        const previous = normalizeSnapshot(previousSnapshot, source.userId, source.charId);
        const message = toTrimmedString(error && error.message ? error.message : error).slice(0, 800);
        const nowIso = new Date().toISOString();
        const attempts = Math.max(1, Math.floor(toFiniteNumber(error && error.attempts, CONTINUITY_API_RETRY_LIMIT)));
        return writeSnapshot({
            version: previous.version || VERSION,
            userId: previous.userId || toTrimmedString(source.userId),
            charId: previous.charId || toTrimmedString(source.charId),
            updatedAt: previous.updatedAt,
            source: previous.source,
            lastMessageCount: previous.lastMessageCount,
            lastSourceHash: previous.lastSourceHash,
            rollingWindow: previous.rollingWindow,
            ongoingThreads: previous.ongoingThreads,
            metadata: Object.assign({}, previous.metadata || {}, {
                lastError: message || 'continuity_api_failed',
                lastErrorAt: nowIso,
                lastApiAttempts: attempts,
                lastFailedPromptCharLength: Math.max(0, Number(prompt && prompt.length) || 0),
                lastFailureSourceMessageCount: Array.isArray(recentRows) ? recentRows.length : 0,
                lastFailureTotalMessageCount: Array.isArray(allRows) ? allRows.length : 0,
                lastFailureSourceHash: hashRows(Array.isArray(recentRows) ? recentRows : []),
                lastFailureSource: toTrimmedString(source.source) || 'model'
            })
        });
    }

    function extractKeywords(text, limit) {
        const clean = toTrimmedString(text)
            .replace(/[^\u4e00-\u9fa5a-zA-Z0-9_\s-]+/g, ' ')
            .replace(/\s+/g, ' ');
        const tokens = clean.match(/[\u4e00-\u9fa5]{2,8}|[a-zA-Z][a-zA-Z0-9_-]{2,24}/g) || [];
        const stop = new Set(['用户', '角色', '这个', '那个', '今天', '昨天', '刚才', '事情', '感觉', '因为', '所以', '但是', '如果']);
        const seen = new Set();
        const result = [];
        tokens.forEach(function eachToken(token) {
            const value = toTrimmedString(token);
            if (!value || stop.has(value)) return;
            const key = value.toLowerCase();
            if (seen.has(key)) return;
            seen.add(key);
            result.push(value);
        });
        return result.slice(0, Math.max(1, Math.floor(Number(limit) || 6)));
    }

    function buildFallbackDecision(previousSnapshot, recentRows, options) {
        const previous = normalizeSnapshot(previousSnapshot, options && options.userId, options && options.charId);
        const previousSummary = toTrimmedString(previous.rollingWindow.summaryText);
        const safePreviousSummary = looksLikeFragmentedContinuityText(previousSummary) ? '' : previousSummary;
        const safePreviousThreads = (Array.isArray(previous.ongoingThreads) ? previous.ongoingThreads : []).filter(function keepThread(thread) {
            return thread
                && !thread.ended
                && thread.confidence !== 'low'
                && toTrimmedString(thread.summary)
                && !looksLikeFragmentedContinuityText(thread.summary);
        });

        return {
            rollingWindow: {
                summaryText: safePreviousSummary.slice(0, 1800),
                items: Array.isArray(previous.rollingWindow.items) ? previous.rollingWindow.items : []
            },
            ongoingThreads: safePreviousThreads
        };
    }

    function looksLikeInvalidOngoingThread(thread) {
        const title = toTrimmedString(thread && thread.title);
        const summary = toTrimmedString(thread && thread.summary);
        const combined = `${title}\n${summary}`;
        if (!combined.trim()) return true;
        if (looksLikeFragmentedContinuityText(combined)) return true;
        if (/：\s*开始于\s*\d{4}-\d{2}-\d{2}|概要：|最近提到\s*\d{4}-\d{2}-\d{2}/.test(combined)) return true;
        if (/[\/／]\s*[^，。；\n]{2,24}\s*[:：]/.test(title)) return true;
        if (/[\/／]\s*[^，。；\n]{2,24}\s*[:：]/.test(summary)) return true;
        if (/你是我的唯一价值|赚钱就是给你花|包揽.*海鲜|海鲜盛宴|经济支持承诺|被偏爱确认|深度自卑|想选漂亮/.test(combined)) return true;
        if (/^(为什么我看了之后|还是想选漂亮|最近这两天嗓子|一直干痛)\s*$/.test(title)) return true;
        return false;
    }

    function filterOngoingThreadsForPrompt(threads) {
        return (Array.isArray(threads) ? threads : [])
            .map(function mapThread(item) {
                return normalizeThread(item, new Date().toISOString());
            })
            .filter(function keepThread(thread) {
                return thread && !looksLikeInvalidOngoingThread(thread);
            })
            .slice(0, MAX_THREADS);
    }

    function normalizeDecision(decision, previousSnapshot, recentRows, options) {
        const previous = normalizeSnapshot(previousSnapshot, options && options.userId, options && options.charId);
        const source = isPlainObject(decision) ? decision : {};
        const rolling = isPlainObject(source.rollingWindow || source.rolling_window)
            ? (source.rollingWindow || source.rolling_window)
            : {};
        const fallback = buildFallbackDecision(previous, recentRows, options);
        const items = Array.isArray(rolling.items)
            ? rolling.items.map(normalizeRollingItem).filter(Boolean).slice(0, MAX_ROLLING_ITEMS)
            : fallback.rollingWindow.items;
        const hasModelThreads = Array.isArray(source.ongoingThreads || source.ongoing_threads);
        const nextThreads = hasModelThreads
            ? filterOngoingThreadsForPrompt(source.ongoingThreads || source.ongoing_threads)
            : filterOngoingThreadsForPrompt(fallback.ongoingThreads);
        return {
            rollingWindow: {
                summaryText: toTrimmedString(rolling.summaryText || rolling.summary_text || fallback.rollingWindow.summaryText).slice(0, 2200),
                items: items
            },
            ongoingThreads: nextThreads
        };
    }

    function mergeThreads(existingThreads, incomingThreads) {
        const map = new Map();
        function upsert(thread) {
            const normalized = normalizeThread(thread);
            if (!normalized) return;
            const existing = map.get(normalized.id);
            if (!existing) {
                map.set(normalized.id, normalized);
                return;
            }
            map.set(normalized.id, {
                id: existing.id,
                title: normalized.title || existing.title,
                summary: normalized.summary || existing.summary,
                keywords: normalizeStringArray(existing.keywords.concat(normalized.keywords), 10),
                firstSeenAt: timestampMs(existing.firstSeenAt) <= timestampMs(normalized.firstSeenAt) ? existing.firstSeenAt : normalized.firstSeenAt,
                lastSeenAt: timestampMs(existing.lastSeenAt) >= timestampMs(normalized.lastSeenAt) ? existing.lastSeenAt : normalized.lastSeenAt,
                status: normalized.status || existing.status,
                ended: normalized.ended || existing.ended,
                endedAt: normalized.endedAt || existing.endedAt,
                confidence: normalized.confidence || existing.confidence,
                sourceMessageIds: normalizeStringArray(existing.sourceMessageIds.concat(normalized.sourceMessageIds), 12)
            });
        }
        (Array.isArray(existingThreads) ? existingThreads : []).forEach(upsert);
        (Array.isArray(incomingThreads) ? incomingThreads : []).forEach(upsert);
        return Array.from(map.values()).sort(function sortThreads(left, right) {
            if (left.ended !== right.ended) return left.ended ? 1 : -1;
            return timestampMs(right.lastSeenAt) - timestampMs(left.lastSeenAt);
        }).slice(0, MAX_THREADS);
    }

    async function updateFromChatHistory(options) {
        const source = isPlainObject(options) ? options : {};
        const userId = toTrimmedString(source.userId || source.user_id);
        const charId = toTrimmedString(source.charId || source.char_id);
        if (!charId) {
            return { ok: false, error: 'missing_char_id', snapshot: createEmptySnapshot(userId, charId) };
        }

        const rows = normalizeMessageRows(source.chatHistory || source.messages || []);
        const nowMs = Date.now();
        const recentRows = selectRecentRows(rows, nowMs);
        const previous = readSnapshot(userId, charId);
        if (!shouldUpdateSnapshot(previous, rows, {
            force: source.force === true,
            userId: userId,
            charId: charId,
            contextLimit: source.contextLimit,
            updateMessageThreshold: source.updateMessageThreshold
        })) {
            return { ok: true, skipped: true, reason: 'not_due', snapshot: previous };
        }

        let decision = null;
        let apiAttempts = 0;
        const prompt = buildContinuityPrompt({
            previousSnapshot: previous,
            recentRows: recentRows,
            userId: userId,
            charId: charId,
            charName: source.charName || source.char_name
        });
        let apiResult = null;
        try {
            apiResult = await requestContinuityModelWithRetry(prompt, source.apiConfig || source.api_config || {});
        } catch (error) {
            writeFailureMetadata(previous, recentRows, rows, prompt, error, {
                userId: userId,
                charId: charId,
                source: source.source || 'model'
            });
            throw error;
        }
        decision = apiResult.decision;
        apiAttempts = apiResult.attempts;

        const normalizedDecision = normalizeDecision(decision, previous, recentRows, source);
        const sourceStartAt = recentRows.length > 0 ? recentRows[0].timestamp : '';
        const sourceEndAt = recentRows.length > 0 ? recentRows[recentRows.length - 1].timestamp : '';
        const snapshot = writeSnapshot({
            version: VERSION,
            userId: userId,
            charId: charId,
            updatedAt: new Date(nowMs).toISOString(),
            source: toTrimmedString(source.source) || 'model',
            lastMessageCount: rows.length,
            lastSourceHash: hashRows(recentRows),
            rollingWindow: {
                windowHours: WINDOW_HOURS,
                sourceStartAt: sourceStartAt,
                sourceEndAt: sourceEndAt,
                summaryText: normalizedDecision.rollingWindow.summaryText,
                items: normalizedDecision.rollingWindow.items
            },
            ongoingThreads: normalizedDecision.ongoingThreads,
            metadata: {
                usedFallback: false,
                apiAttempts: apiAttempts,
                promptCharLength: prompt.length,
                sourceMessageCount: recentRows.length,
                lastError: '',
                lastErrorAt: '',
                lastApiAttempts: apiAttempts
            }
        });

        return {
            ok: true,
            skipped: false,
            usedFallback: false,
            apiAttempts: apiAttempts,
            snapshot: snapshot
        };
    }

    function buildPromptBlock(snapshotInput, options) {
        const snapshot = normalizeSnapshot(snapshotInput, options && options.userId, options && options.charId);
        const nowMs = Date.now();
        const rolling = snapshot.rollingWindow || {};
        const summaryText = toTrimmedString(rolling.summaryText);
        const safeSummaryText = looksLikeFragmentedContinuityText(summaryText) ? '' : summaryText;
        const activeThreads = filterOngoingThreadsForPrompt(snapshot.ongoingThreads)
            .filter(function keepThread(thread) {
                return thread && !thread.ended;
            })
            .sort(function sortThread(left, right) {
                return timestampMs(right.lastSeenAt) - timestampMs(left.lastSeenAt);
            })
            .slice(0, PROMPT_THREAD_LIMIT);
        if (!safeSummaryText && activeThreads.length <= 0) return '';

        const parts = [];
        if (safeSummaryText) {
            const lines = ['【近两天叙事概要】'];
            if (rolling.sourceStartAt || rolling.sourceEndAt) {
                lines.push(`范围：${formatDateTime(rolling.sourceStartAt) || '未知'} 至 ${formatDateTime(rolling.sourceEndAt) || '未知'}；更新：${formatAge(snapshot.updatedAt, nowMs)}`);
            }
            lines.push('说明：这是最近48小时聊天按粗时间段整理的高度概括，不是逐句记录，也不是永久事实；用于理解最近背景。');
            lines.push(safeSummaryText);
            parts.push(lines.join('\n'));
        }

        if (activeThreads.length > 0) {
            const lines = ['【长期状态】'];
            lines.push('说明：这些是用户自己的长期现实状态或未结束事项，可能影响当前对话；注意开始时间、已持续多久和最近提到时间。');
            activeThreads.forEach(function appendThread(thread) {
                const firstSeen = formatDateTime(thread.firstSeenAt) || '未知';
                const lastSeen = formatDateTime(thread.lastSeenAt) || '未知';
                const duration = timestampMs(thread.firstSeenAt) ? formatAge(thread.firstSeenAt, nowMs) : '时间未知';
                const recent = timestampMs(thread.lastSeenAt) ? formatAge(thread.lastSeenAt, nowMs) : '时间未知';
                const title = toTrimmedString(thread.title) || '未命名状态';
                const summary = toTrimmedString(thread.summary);
                lines.push(`- ${title}：开始于 ${firstSeen}（已持续 ${duration}）；最近提到 ${lastSeen}（${recent}）。${summary ? `概要：${summary}` : ''}`);
            });
            parts.push(lines.join('\n'));
        }

        return parts.join('\n\n');
    }

    async function fetchPromptSnapshot(_supabase, userId, charId) {
        const snapshot = readSnapshot(userId, charId);
        const text = buildPromptBlock(snapshot, { userId: userId, charId: charId });
        return {
            text: text,
            promptText: text,
            snapshot: snapshot,
            record: snapshot,
            isEmpty: !text
        };
    }

    return {
        readSnapshot: readSnapshot,
        writeSnapshot: writeSnapshot,
        updateFromChatHistory: updateFromChatHistory,
        buildPromptBlock: buildPromptBlock,
        fetchPromptSnapshot: fetchPromptSnapshot,
        shouldUpdateSnapshot: shouldUpdateSnapshot,
        __debug: {
            normalizeMessageRows: normalizeMessageRows,
            selectRecentRows: selectRecentRows,
            buildFallbackDecision: buildFallbackDecision,
            normalizeDecision: normalizeDecision,
            buildContinuityPrompt: buildContinuityPrompt
        }
    };
}
