/**
 * 初始化模块导出壳子。
 * 这是海马体客户端文件的最外层包装，兼容浏览器全局和 CommonJS。
 */
(function initHippocampusClientModule(root) {
    try {
        const api = createHippocampusClient(root);

        if (typeof module === 'object' && module.exports) {
            module.exports = api;
        }

        if (root && typeof root === 'object') {
            root.HippocampusClient = api;
            root.__idicHippocampusClientBootStatus = {
                ok: true,
                registered: true,
                version: '20260428b',
                at: Date.now()
            };
        }
    } catch (error) {
        if (root && typeof root === 'object') {
            root.__idicHippocampusClientBootStatus = {
                ok: false,
                registered: false,
                version: '20260428b',
                message: error && error.message ? error.message : String(error || 'unknown_error'),
                stack: error && error.stack ? error.stack : '',
                at: Date.now()
            };
        }
        if (root && root.console && typeof root.console.error === 'function') {
            root.console.error('[海马体][客户端] 初始化失败：', error);
        }
    }
}(typeof globalThis !== 'undefined' ? globalThis : this));

/**
 * 创建海马体客户端实例。
 * 这里封装所有状态、Supabase 调用和对外 API。
 */
function createHippocampusClient(root) {
    const EMBEDDING_DIMENSION = 1536;
    const WRITE_WINDOW_MS = 10 * 60 * 1000;
    const WRITE_LIMIT = 2;
    const WARM_EVENT_RECALL_COOLDOWN_MS = 20 * 60 * 1000;
    const INTRUSIVE_EVENT_RECALL_COOLDOWN_MS = 2 * 60 * 60 * 1000;
    const RIPPLE_EVENT_ACTIVATION_COOLDOWN_MS = 20 * 60 * 1000;
    const RIPPLE_EVENT_REENTRY_SUPPRESSION_MS = 3 * 60 * 1000;
    const RIPPLE_BATCH_HISTORY_TTL_MS = 30 * 60 * 1000;
    const EVENT_RIPPLE_RPC_RETRY_PROBE_MS = 6 * 60 * 60 * 1000;
    const EVENT_RIPPLE_RPC_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
    const EVENT_RIPPLE_RPC_CACHE_KEY_PREFIX = 'hippocampus:event-ripple-rpc:';
    const EVENT_SEARCH_RPC_RETRY_PROBE_MS = 15 * 60 * 1000;
    const EVENT_SEARCH_RPC_CACHE_KEY_PREFIX = 'hippocampus:event-search-rpc:';
    const EVENT_TABLE_SELECT_FIELDS = 'id,user_id,char_id,room_id,context_scope,title,summary,status,depth,event_date,fragment_count,is_unresolved,continuation_key,salience_score,depth_score,event_is_flashbulb,anchor_memory_id,memory_ids,detail_memory_ids,event_flashbulb_memory_ids,start_at,end_at,last_related_at,manual_edited,manual_note,metadata,updated_at';
    const EVENT_TABLE_SELECT_FIELDS_LEGACY = 'id,user_id,char_id,room_id,context_scope,title,summary,status,depth,event_date,fragment_count,is_unresolved,continuation_key,salience_score,depth_score,anchor_memory_id,memory_ids,detail_memory_ids,start_at,end_at,last_related_at,manual_edited,manual_note,metadata,updated_at';
    const TRIGGER_SINGLE_CHAR_STOP_WORDS = new Set([
        '我', '你', '他', '她', '它', '们', '的', '了', '呢', '啊', '吧', '吗', '嘛',
        '是', '有', '在', '就', '都', '也', '又', '很'
    ]);
    const console = createHippoScopedConsole(root, '客户端');

    /**
     * 创建模块级日志代理：优先走 HippocampusLogger，缺失时回退原生 console。
     */
    function createHippoScopedConsole(rootObject, moduleName) {
        const logger = rootObject && rootObject.HippocampusLogger ? rootObject.HippocampusLogger : null;
        const nativeConsole = (rootObject && rootObject.console) ? rootObject.console : globalThis.console;

        /**
         * 将日志参数拼成可读文本，供 logger detail 使用。
         */
        function stringifyArgs(args) {
            const list = Array.isArray(args) ? args : [];
            return list.map(function mapArg(item) {
                if (typeof item === 'string') return item;
                try {
                    return JSON.stringify(item);
                } catch (_) {
                    return String(item);
                }
            }).join(' ');
        }

        return {
            log: function log() {
                const args = Array.prototype.slice.call(arguments);
                if (logger && typeof logger.hippoLog === 'function') {
                    logger.hippoLog(moduleName, '日志', stringifyArgs(args));
                    return;
                }
                nativeConsole.log.apply(nativeConsole, args);
            },
            warn: function warn() {
                const args = Array.prototype.slice.call(arguments);
                if (logger && typeof logger.hippoWarn === 'function') {
                    logger.hippoWarn(moduleName, '日志', stringifyArgs(args));
                    return;
                }
                nativeConsole.warn.apply(nativeConsole, args);
            },
            error: function error() {
                const args = Array.prototype.slice.call(arguments);
                if (logger && typeof logger.hippoError === 'function') {
                    logger.hippoError(moduleName, '日志', stringifyArgs(args));
                    return;
                }
                nativeConsole.error.apply(nativeConsole, args);
            },
            time: function time(label) {
                if (logger && typeof logger.hippoTime === 'function') {
                    logger.hippoTime(moduleName, label);
                    return;
                }
                nativeConsole.time(label);
            },
            timeEnd: function timeEnd(label) {
                if (logger && typeof logger.hippoTimeEnd === 'function') {
                    logger.hippoTimeEnd(moduleName, label);
                    return;
                }
                nativeConsole.timeEnd(label);
            }
        };
    }

    const state = {
        supabase: null,
        settings: {
            hippocampusEnabled: false
        },
        writeTimestamps: new Map(),
        eventRecallCooldownLedger: new Map(),
        warmEventRecallHistory: new Map(),
        intrusiveEventRecallHistory: new Map(),
        rippleEventActivationHistory: new Map(),
        rippleBatchActivationHistory: new Map(),
        eventSearchRpcAvailability: new Map(),
        eventRippleRpcAvailable: null,
        eventRippleRpcCheckedAt: 0,
        eventRippleRpcProjectKey: ''
    };

    /**
     * 判断当前功能开关是否开启。
     */
    function isEnabled() {
        return !!(state.settings && state.settings.hippocampusEnabled);
    }

    /**
     * 将任意值转换为布尔值，兼容常见字符串配置。
     */
    function toBoolean(value) {
        if (typeof value === 'boolean') return value;
        if (typeof value === 'number') return value !== 0;
        if (typeof value === 'string') {
            const normalized = value.trim().toLowerCase();
            return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
        }
        return false;
    }

    /**
     * 将任意值转换为有限数字，不合法时回退到默认值。
     */
    function toFiniteNumber(value, fallback) {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : fallback;
    }

    /**
     * 将数值夹在指定区间内，区间边界与 SQL 约束保持一致。
     */
    function clampNumber(value, min, max, fallback) {
        const numeric = toFiniteNumber(value, fallback);
        return Math.min(max, Math.max(min, numeric));
    }

    function normalizeReconsolidationBatchMode(value) {
        const source = toTrimmedString(value).toLowerCase();
        if (source === 'off' || source === 'false' || source === 'single') return 'off';
        if (source === 'event' || source === 'batch' || source === 'always' || source === 'aggressive') return 'event';
        return 'auto';
    }

    /**
     * 从对象上读取第一个非空字段。
     */
    function readFirstDefined(source, keys, fallback) {
        if (!source || typeof source !== 'object') return fallback;

        for (let i = 0; i < keys.length; i += 1) {
            const key = keys[i];
            const value = source[key];
            if (value !== undefined && value !== null && value !== '') {
                return value;
            }
        }

        return fallback;
    }

    /**
     * 合并多个 ID 列表并去重，保留出现顺序。
     */
    function getHippoStorage() {
        try {
            if (root && root.localStorage) return root.localStorage;
        } catch (_) {
            // ignore storage access errors
        }
        try {
            if (typeof localStorage !== 'undefined') return localStorage;
        } catch (_) {
            // ignore storage access errors
        }
        return null;
    }

    function getHippoRpcCacheProjectKey(supabase, prefix) {
        const client = supabase && typeof supabase === 'object' ? supabase : {};
        const restClient = client.rest && typeof client.rest === 'object' ? client.rest : {};
        const safePrefix = toTrimmedString(prefix) || 'hippocampus:rpc:';
        const rawUrl = toTrimmedString(
            readFirstDefined(client, ['supabaseUrl', 'url'], '')
            || readFirstDefined(restClient, ['url'], '')
        );
        if (!rawUrl) return `${safePrefix}default`;
        try {
            return `${safePrefix}${new URL(rawUrl).origin.toLowerCase()}`;
        } catch (_) {
            return `${safePrefix}${rawUrl.toLowerCase()}`;
        }
    }

    function getEventRippleRpcCacheProjectKey(supabase) {
        return getHippoRpcCacheProjectKey(supabase, EVENT_RIPPLE_RPC_CACHE_KEY_PREFIX);
    }

    function getEventSearchRpcCacheProjectKey(supabase) {
        return getHippoRpcCacheProjectKey(supabase, EVENT_SEARCH_RPC_CACHE_KEY_PREFIX);
    }

    function loadEventRippleRpcCacheSnapshot(cacheKey) {
        const storage = getHippoStorage();
        if (!storage || !cacheKey) return null;
        try {
            const raw = storage.getItem(cacheKey);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return null;
            const available = typeof parsed.available === 'boolean' ? parsed.available : null;
            const checkedAt = Number(parsed.checkedAt);
            if (available === null || !Number.isFinite(checkedAt) || checkedAt <= 0) return null;
            if ((Date.now() - checkedAt) > EVENT_RIPPLE_RPC_CACHE_TTL_MS) {
                storage.removeItem(cacheKey);
                return null;
            }
            return {
                available: available,
                checkedAt: checkedAt
            };
        } catch (_) {
            return null;
        }
    }

    function persistEventRippleRpcCacheSnapshot(cacheKey, available, checkedAt) {
        const storage = getHippoStorage();
        if (!storage || !cacheKey || typeof available !== 'boolean') return;
        try {
            storage.setItem(cacheKey, JSON.stringify({
                available: available,
                checkedAt: checkedAt
            }));
        } catch (_) {
            // ignore storage quota / privacy mode errors
        }
    }

    function syncEventRippleRpcAvailability(supabase) {
        const cacheKey = getEventRippleRpcCacheProjectKey(supabase);
        if (!cacheKey) return;
        if (
            state.eventRippleRpcProjectKey === cacheKey
            && (state.eventRippleRpcAvailable === true || state.eventRippleRpcAvailable === false)
            && Number.isFinite(state.eventRippleRpcCheckedAt)
            && state.eventRippleRpcCheckedAt > 0
        ) {
            return;
        }

        state.eventRippleRpcProjectKey = cacheKey;
        const snapshot = loadEventRippleRpcCacheSnapshot(cacheKey);
        if (snapshot) {
            state.eventRippleRpcAvailable = snapshot.available;
            state.eventRippleRpcCheckedAt = snapshot.checkedAt;
            return;
        }

        state.eventRippleRpcAvailable = null;
        state.eventRippleRpcCheckedAt = 0;
    }

    function markEventRippleRpcAvailability(supabase, available, nowMs) {
        const cacheKey = getEventRippleRpcCacheProjectKey(supabase);
        const checkedAt = Number.isFinite(nowMs) ? nowMs : Date.now();
        state.eventRippleRpcProjectKey = cacheKey;
        state.eventRippleRpcAvailable = typeof available === 'boolean' ? available : null;
        state.eventRippleRpcCheckedAt = checkedAt;
        if (typeof available === 'boolean') {
            persistEventRippleRpcCacheSnapshot(cacheKey, available, checkedAt);
        }
    }

    function shouldProbeEventRippleRpc(supabase, eventId, nowMs) {
        if (!toTrimmedString(eventId)) return false;
        syncEventRippleRpcAvailability(supabase);
        if (state.eventRippleRpcAvailable !== false) return true;
        const now = Number.isFinite(nowMs) ? nowMs : Date.now();
        const checkedAt = Number(state.eventRippleRpcCheckedAt);
        if (!Number.isFinite(checkedAt) || checkedAt <= 0) return true;
        return (now - checkedAt) >= EVENT_RIPPLE_RPC_RETRY_PROBE_MS;
    }

    function markEventSearchRpcAvailability(supabase, available, nowMs) {
        const cacheKey = getEventSearchRpcCacheProjectKey(supabase);
        if (!cacheKey || typeof available !== 'boolean') return;
        state.eventSearchRpcAvailability.set(cacheKey, {
            available: available,
            checkedAt: Number.isFinite(nowMs) ? nowMs : Date.now()
        });
    }

    function shouldProbeEventSearchRpc(supabase, nowMs) {
        const cacheKey = getEventSearchRpcCacheProjectKey(supabase);
        if (!cacheKey) return true;
        const snapshot = state.eventSearchRpcAvailability instanceof Map
            ? state.eventSearchRpcAvailability.get(cacheKey)
            : null;
        if (!snapshot || snapshot.available !== false) return true;
        const checkedAt = Number(snapshot.checkedAt);
        const now = Number.isFinite(nowMs) ? nowMs : Date.now();
        if (!Number.isFinite(checkedAt) || checkedAt <= 0) return true;
        return (now - checkedAt) >= EVENT_SEARCH_RPC_RETRY_PROBE_MS;
    }

    function mergeUniqueIds(primary, secondary, maxCount) {
        const result = [];
        const seen = new Set();
        const limit = Number.isFinite(maxCount) ? Math.max(0, Math.floor(maxCount)) : Number.POSITIVE_INFINITY;

        [primary, secondary].forEach(function consume(list) {
            const source = Array.isArray(list) ? list : [];
            for (let i = 0; i < source.length; i += 1) {
                const id = toTrimmedString(source[i]);
                if (!id || seen.has(id)) continue;
                seen.add(id);
                result.push(id);
                if (result.length >= limit) return;
            }
        });

        return result;
    }

    /**
     * 规范化初始化配置，兼容多种可能的字段名。
     */
    function normalizeSettings(settings) {
        const source = settings && typeof settings === 'object' ? settings : {};
        const embeddingSource = source.hippocampusEmbedding && typeof source.hippocampusEmbedding === 'object'
            ? source.hippocampusEmbedding
            : {};

        const normalized = {
            hippocampusEnabled: toBoolean(
                readFirstDefined(source, [
                    'hippocampusEnabled',
                    'enableHippocampus',
                    'hippoEnabled'
                ], false)
            ),
            hippocampusV2Enabled: toBoolean(
                readFirstDefined(source, [
                    'hippocampusV2Enabled',
                    'v2Enabled'
                ], false)
            ),
            embeddingApiUrl: String(readFirstDefined(embeddingSource, [
                'apiUrl',
                'url'
            ], readFirstDefined(source, [
                'hippocampusEmbeddingApiUrl',
                'embeddingApiUrl',
                'embeddingUrl'
            ], '')) || '').trim(),
            embeddingApiKey: String(readFirstDefined(embeddingSource, [
                'apiKey',
                'key'
            ], readFirstDefined(source, [
                'hippocampusEmbeddingApiKey',
                'embeddingApiKey',
                'embeddingKey'
            ], '')) || '').trim(),
            embeddingModel: String(readFirstDefined(embeddingSource, [
                'model',
                'modelName'
            ], readFirstDefined(source, [
                'hippocampusEmbeddingModel',
                'embeddingModel'
            ], '')) || '').trim(),
            embeddingHeaders: readFirstDefined(embeddingSource, [
                'headers'
            ], readFirstDefined(source, [
                'hippocampusEmbeddingHeaders',
                'embeddingHeaders'
            ], {})),
            embeddingRequestBody: readFirstDefined(embeddingSource, [
                'requestBody'
            ], readFirstDefined(source, [
                'hippocampusEmbeddingRequestBody',
                'embeddingRequestBody'
            ], {})),
            surfaceCooldownMinutes: toFiniteNumber(
                readFirstDefined(source, [
                    'hippocampusSurfaceCooldownMinutes'
                ], 30),
                30
            ),
            surfaceMinScore: toFiniteNumber(
                readFirstDefined(source, [
                    'hippocampusSurfaceMinScore'
                ], 0.15),
                0.15
            ),
            vectorMinSimilarity: toFiniteNumber(
                readFirstDefined(source, [
                    'hippocampusVectorMinSimilarity'
                ], 0.3),
                0.3
            ),
            ruminationTendency: clampNumber(
                readFirstDefined(source, [
                    'hippocampusRuminationTendency',
                    'ruminationTendency'
                ], 0.3),
                0,
                1,
                0.3
            ),
            recallStyle: readFirstDefined(source, [
                'hippocampusRecallStyle',
                'recallStyle'
            ], 'emotional'),
            attachmentStyle: toTrimmedString(
                readFirstDefined(source, [
                    'hippocampusAttachmentStyle',
                    'attachmentStyle'
                ], 'secure')
            ).toLowerCase() || 'secure',
            enableReconsolidation: toBoolean(
                readFirstDefined(source, [
                    'hippocampusEnableReconsolidation',
                    'enableReconsolidation'
                ], true)
            ),
            reconsolidationBatchMode: normalizeReconsolidationBatchMode(
                readFirstDefined(source, [
                    'hippocampusReconsolidationBatchMode',
                    'reconsolidationBatchMode'
                ], 'auto')
            ),
            reconsolidationTriggerChance: clampNumber(
                readFirstDefined(source, [
                    'hippocampusReconsolidationTriggerChance',
                    'reconsolidationTriggerChance'
                ], 0.2),
                0,
                1,
                0.2
            ),
            enableRumination: toBoolean(
                readFirstDefined(source, [
                    'hippocampusEnableRumination',
                    'enableRumination'
                ], true)
            ),
            enableRipple: toBoolean(
                readFirstDefined(source, [
                    'hippocampusEnableRipple',
                    'enableRipple'
                ], true)
            ),
            enableDiffuse: toBoolean(
                readFirstDefined(source, [
                    'hippocampusEnableDiffuse',
                    'enableDiffuse'
                ], true)
            ),
            enableAttachmentAdjust: toBoolean(
                readFirstDefined(source, [
                    'hippocampusEnableAttachmentAdjust',
                    'enableAttachmentAdjust'
                ], true)
            ),
            enableSensoryTrigger: toBoolean(
                readFirstDefined(source, [
                    'hippocampusEnableSensoryTrigger',
                    'enableSensoryTrigger'
                ], true)
            ),
            enableEventMixedRecall: toBoolean(
                readFirstDefined(source, [
                    'hippocampusEnableEventMixedRecall',
                    'enableEventMixedRecall'
                ], true)
            ),
            memoryPromptTokenBudget: Math.max(
                800,
                Math.min(
                    10000,
                    Math.floor(
                        toFiniteNumber(
                            readFirstDefined(source, [
                                'hippocampusMemoryPromptTokenBudget',
                                'memoryPromptTokenBudget'
                            ], 10000),
                            10000
                        )
                    )
                )
            )
        };

        if (
            normalized.recallStyle
            && typeof normalized.recallStyle === 'object'
            && !Array.isArray(normalized.recallStyle)
        ) {
            normalized.recallStyle = Object.assign({}, normalized.recallStyle);
        } else {
            normalized.recallStyle = toTrimmedString(normalized.recallStyle).toLowerCase() || 'emotional';
            if (
                normalized.recallStyle !== 'emotional'
                && normalized.recallStyle !== 'narrative'
                && normalized.recallStyle !== 'analytical'
                && normalized.recallStyle !== 'imagery'
            ) {
                normalized.recallStyle = 'emotional';
            }
        }

        if (
            normalized.attachmentStyle !== 'secure'
            && normalized.attachmentStyle !== 'anxious'
            && normalized.attachmentStyle !== 'avoidant'
            && normalized.attachmentStyle !== 'disorganized'
        ) {
            normalized.attachmentStyle = 'secure';
        }

        normalized.reconsolidationBatchMode = normalizeReconsolidationBatchMode(
            normalized.reconsolidationBatchMode
        );

        if (!normalized.hippocampusV2Enabled) {
            normalized.enableReconsolidation = false;
            normalized.reconsolidationBatchMode = 'off';
            normalized.enableRumination = false;
            normalized.enableRipple = false;
            normalized.enableDiffuse = false;
            normalized.enableAttachmentAdjust = false;
            normalized.enableSensoryTrigger = false;
            normalized.enableEventMixedRecall = false;
        }

        if (!normalized.hippocampusEnabled) {
            normalized.embeddingApiUrl = '';
            normalized.embeddingApiKey = '';
            normalized.embeddingModel = '';
        }

        return normalized;
    }

    /**
     * 获取已初始化的 Supabase 客户端。
     */
    function getSupabaseClient() {
        if (state.supabase) return state.supabase;

        console.warn('[海马体] 尚未初始化 Supabase 客户端，已静默跳过。');
        return null;
    }

    /**
     * 判断当前是否具备可用的 Embedding 配置。
     */
    function hasEmbeddingConfig() {
        return !!(state.settings && state.settings.embeddingApiUrl && state.settings.embeddingModel);
    }

    /**
     * 判断海马体 v2 子能力是否开启。
     */
    function isV2Enabled() {
        return !!(state.settings && state.settings.hippocampusV2Enabled);
    }

    /**
     * 把任意 recallStyle 配置归一化为可执行结构（字符串或权重对象）。
     */
    function normalizeRecallStyleConfig(recallStyle) {
        const source = recallStyle !== undefined ? recallStyle : (state.settings ? state.settings.recallStyle : 'emotional');
        if (source && typeof source === 'object' && !Array.isArray(source)) {
            const weights = {};
            const keys = ['emotional', 'narrative', 'analytical', 'imagery'];
            let total = 0;

            keys.forEach(function normalizeWeight(key) {
                const value = Math.max(0, toFiniteNumber(source[key], 0));
                if (value <= 0) return;
                weights[key] = value;
                total += value;
            });

            if (total > 0) {
                keys.forEach(function scaleWeight(key) {
                    if (!weights[key]) return;
                    weights[key] = weights[key] / total;
                });
                return weights;
            }
        }

        const style = toTrimmedString(source).toLowerCase();
        if (style === 'narrative' || style === 'analytical' || style === 'imagery') return style;
        return 'emotional';
    }

    /**
     * 从 recallStyle 配置中抽样本轮扩散路径，同时返回 roll 便于日志观察。
     */
    function pickRecallStyle(recallStyle) {
        const normalized = normalizeRecallStyleConfig(recallStyle);
        if (typeof normalized === 'string') {
            return {
                style: normalized,
                roll: null,
                isMixed: false
            };
        }

        const roll = Math.random();
        let cumulative = 0;
        let selected = 'emotional';
        ['emotional', 'narrative', 'analytical', 'imagery'].forEach(function resolveStyle(key) {
            if (selected !== 'emotional') return;
            cumulative += toFiniteNumber(normalized[key], 0);
            if (roll <= cumulative) {
                selected = key;
            }
        });

        return {
            style: selected,
            roll: roll,
            isMixed: true
        };
    }

    /**
     * 获取当前环境中的 fetch 实现。
     */
    function getFetchImplementation() {
        if (typeof fetch === 'function') return fetch.bind(root);
        if (root && typeof root.fetch === 'function') return root.fetch.bind(root);
        return null;
    }

    /**
     * 将向量转成 Supabase / Postgres vector 可接受的文本字面量。
     */
    function vectorToLiteral(vector) {
        if (!Array.isArray(vector) || vector.length !== EMBEDDING_DIMENSION) return null;
        return `[${vector.join(',')}]`;
    }

    /**
     * 将任意向量规范化为固定 1536 维。
     */
    function normalizeEmbeddingVector(value) {
        if (!Array.isArray(value) || value.length === 0) return null;

        const vector = new Array(EMBEDDING_DIMENSION);

        for (let i = 0; i < EMBEDDING_DIMENSION; i += 1) {
            const numeric = toFiniteNumber(value[i], 0);
            vector[i] = Number.isFinite(numeric) ? numeric : 0;
        }

        return vector;
    }

    /**
     * 从常见 Embedding API 响应结构中提取向量。
     */
    function extractEmbeddingVector(payload) {
        if (!payload || typeof payload !== 'object') return null;

        if (Array.isArray(payload.embedding)) {
            return normalizeEmbeddingVector(payload.embedding);
        }

        if (Array.isArray(payload.vector)) {
            return normalizeEmbeddingVector(payload.vector);
        }

        if (payload.data && Array.isArray(payload.data) && payload.data[0]) {
            if (Array.isArray(payload.data[0].embedding)) {
                return normalizeEmbeddingVector(payload.data[0].embedding);
            }

            if (Array.isArray(payload.data[0].vector)) {
                return normalizeEmbeddingVector(payload.data[0].vector);
            }
        }

        if (payload.result && Array.isArray(payload.result.embedding)) {
            return normalizeEmbeddingVector(payload.result.embedding);
        }

        if (payload.vectors && Array.isArray(payload.vectors) && Array.isArray(payload.vectors[0])) {
            return normalizeEmbeddingVector(payload.vectors[0]);
        }

        return null;
    }

    /**
     * 提取 Embedding 上游错误详情，便于控制台快速定位配置问题。
     */
    function extractEmbeddingErrorDetail(payload) {
        if (typeof payload === 'string') {
            return toTrimmedString(payload);
        }
        if (!payload || typeof payload !== 'object') return '';

        const errorNode = payload.error && typeof payload.error === 'object' ? payload.error : {};
        const detail = toTrimmedString(
            errorNode.message
            || errorNode.msg
            || errorNode.detail
            || payload.message
            || payload.msg
            || payload.detail
        );
        const code = toTrimmedString(errorNode.code || errorNode.type || payload.code || payload.type);
        if (code && detail) return `${code}: ${detail}`;
        return detail || code;
    }

    /**
     * 为向量请求构造最终请求体，并优先兼容当前库要求的 1536 维。
     */
    function buildEmbeddingRequestBody(cleanText) {
        const requestBody = Object.assign(
            {},
            state.settings.embeddingRequestBody && typeof state.settings.embeddingRequestBody === 'object'
                ? state.settings.embeddingRequestBody
                : {},
            {
                input: cleanText,
                model: state.settings.embeddingModel
            }
        );
        const modelId = toTrimmedString(state.settings.embeddingModel).toLowerCase();

        if (
            requestBody.dimensions === undefined
            && modelId === 'text-embedding-v4'
        ) {
            requestBody.dimensions = EMBEDDING_DIMENSION;
        }

        return requestBody;
    }

    /**
     * 读取字符串字段并去除首尾空白。
     */
    function toTrimmedString(value) {
        return String(value === undefined || value === null ? '' : value).trim();
    }

    /**
     * 判断当前错误是否属于“数据库尚未补齐事件字段”导致的缺列错误。
     */
    function isMissingEventColumnError(error) {
        const code = toTrimmedString(error && error.code).toUpperCase();
        const combined = [
            error && error.message,
            error && error.details,
            error && error.hint
        ].map(function collectText(part) {
            return toTrimmedString(part);
        }).filter(Boolean).join(' | ').toLowerCase();

        if (!combined && !code) return false;

        const mentionsEventColumns = combined.includes('event_')
            || combined.includes('continuation_key')
            || combined.includes('hippocampus_memory_events');

        if (code === '42703' || code === 'PGRST204') {
            return mentionsEventColumns || combined.includes('schema cache');
        }

        return mentionsEventColumns && (
            combined.includes('column')
            || combined.includes('schema cache')
            || combined.includes('could not find')
            || combined.includes('does not exist')
        );
    }

    /**
     * 判断当前错误是否属于“事件表尚未落库/迁移”导致的缺表错误。
     */
    function isMissingEventTableError(error) {
        const message = toTrimmedString(error && error.message).toLowerCase();
        if (!message) return false;
        const mentionsEventTable = message.includes('hippocampus_memory_events') || message.includes('memory_events');
        return mentionsEventTable && (message.includes('relation') || message.includes('schema cache') || message.includes('does not exist'));
    }

    function isMissingRpcFunctionError(error, functionName) {
        const safeFunctionName = toTrimmedString(functionName).toLowerCase();
        const code = toTrimmedString(error && error.code).toUpperCase();
        const message = toTrimmedString(error && error.message).toLowerCase();
        if (!safeFunctionName) return false;
        if (code === '42883' || code === 'PGRST202') {
            return !message || message.includes(safeFunctionName) || message.includes('schema cache');
        }
        return message.includes(safeFunctionName)
            && (
                message.includes('does not exist')
                || message.includes('schema cache')
                || message.includes('could not find the function')
                || message.includes('function')
            );
    }

    function isMissingEventRippleRpcError(error) {
        return isMissingRpcFunctionError(error, 'ripple_activate_event_nearby');
    }

    async function runEventTableQueryWithFallback(queryFactory, logLabel) {
        const safeLabel = toTrimmedString(logLabel) || '事件表';
        let response = await queryFactory(EVENT_TABLE_SELECT_FIELDS);
        if (response && response.error && isMissingEventColumnError(response.error)) {
            console.log(`[海马体][${safeLabel}] 检测到事件表缺少扩展字段，回退到旧字段查询。`);
            response = await queryFactory(EVENT_TABLE_SELECT_FIELDS_LEGACY);
        }
        return response;
    }

    async function runEventTableTaskBatchWithFallback(taskFactory, logLabel) {
        const safeLabel = toTrimmedString(logLabel) || '事件表';
        let settled = await Promise.allSettled(taskFactory(EVENT_TABLE_SELECT_FIELDS));
        const shouldFallback = settled.some(function needFallback(item) {
            return item.status === 'fulfilled'
                && !!(item.value && item.value.error && isMissingEventColumnError(item.value.error));
        });
        if (shouldFallback) {
            console.log(`[海马体][${safeLabel}] 检测到事件表缺少扩展字段，回退到旧字段查询。`);
            settled = await Promise.allSettled(taskFactory(EVENT_TABLE_SELECT_FIELDS_LEGACY));
        }
        return settled;
    }

    /**
     * 根据 room_id 和显式 scope 推断最终上下文作用域。
     */
    function resolveContextScope(memoryData, roomId) {
        const source = memoryData && typeof memoryData === 'object' ? memoryData : {};
        const explicitScope = toTrimmedString(
            readFirstDefined(source, [
                'context_scope',
                'contextScope',
                'scope'
            ], '')
        ).toLowerCase();

        if (explicitScope === 'private') return 'private';
        if (explicitScope === 'room') return roomId ? 'room' : null;

        return roomId ? 'room' : 'private';
    }

    /**
     * 规范化 metadata，确保最终一定是普通对象。
     */
    function normalizeMetadata(value) {
        if (value && typeof value === 'object' && !Array.isArray(value)) return value;

        if (typeof value === 'string' && value.trim()) {
            try {
                const parsed = JSON.parse(value);
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                    return parsed;
                }
            } catch (_) {
                return {};
            }
        }

        return {};
    }

    /**
     * 将事件版本留痕里的长文本裁成适合 metadata 保存的长度。
     */
    function clipMetadataHistoryText(value, maxLength) {
        const text = toTrimmedString(value).replace(/\s+/g, ' ');
        if (!text) return '';
        const limit = Math.max(24, Math.floor(toFiniteNumber(maxLength, 160)));
        return text.length > limit ? `${text.slice(0, limit)}...` : text;
    }

    /**
     * 向 metadata 里追加一条有限长度的历史记录，并保留最近几次版本变化。
     */
    function appendMetadataHistoryEntry(metadata, historyKey, entry, maxEntries) {
        const safeMetadata = Object.assign({}, normalizeMetadata(metadata));
        const key = toTrimmedString(historyKey) || 'history';
        const safeEntry = entry && typeof entry === 'object' ? Object.assign({}, entry) : null;
        if (!safeEntry) return safeMetadata;

        const limit = Math.max(1, Math.floor(toFiniteNumber(maxEntries, 8)));
        const history = Array.isArray(safeMetadata[key])
            ? safeMetadata[key].filter(function keepEntry(item) {
                return !!item && typeof item === 'object';
            }).slice(-(limit - 1))
            : [];
        history.push(safeEntry);
        safeMetadata[key] = history;

        const changedAt = toTrimmedString(
            safeEntry.changed_at
            || safeEntry.created_at
            || safeEntry.refreshed_at
        );
        if (changedAt) {
            safeMetadata.last_event_version_at = changedAt;
        }
        const source = toTrimmedString(safeEntry.source);
        if (source) {
            safeMetadata.last_event_version_source = source;
        }
        const changeFields = Array.isArray(safeEntry.change_fields)
            ? safeEntry.change_fields.map(toTrimmedString).filter(Boolean).slice(0, 8)
            : [];
        if (changeFields.length > 0) {
            safeMetadata.last_event_version_fields = changeFields;
        }
        return safeMetadata;
    }

    function appendLimitedMetadataEntries(metadata, historyKey, entry, maxEntries) {
        const safeMetadata = Object.assign({}, normalizeMetadata(metadata));
        const key = toTrimmedString(historyKey) || 'history';
        const safeEntry = entry && typeof entry === 'object' ? Object.assign({}, entry) : null;
        if (!safeEntry) return safeMetadata;

        const limit = Math.max(1, Math.floor(toFiniteNumber(maxEntries, 8)));
        const history = Array.isArray(safeMetadata[key])
            ? safeMetadata[key].filter(function keepEntry(item) {
                return !!item && typeof item === 'object';
            }).slice(-(limit - 1))
            : [];
        history.push(safeEntry);
        safeMetadata[key] = history;
        return safeMetadata;
    }

    /**
     * 将关键词输入规范化为去重后的短词数组。
     */
    function normalizeTriggerKeywords(value) {
        const list = [];
        const seen = new Set();
        let rawList = [];

        /**
         * 将候选关键词清洗为可存储文本，过滤单字和明显噪声。
         */
        function sanitizeKeyword(rawKeyword) {
            const cleaned = toTrimmedString(rawKeyword).replace(/^[\s"'“”‘’《》「」【】（）()]+|[\s"'“”‘’《》「」【】（）()]+$/g, '');
            if (!cleaned) return '';
            if (cleaned.length > 16) return '';
            if (cleaned.length === 1 && TRIGGER_SINGLE_CHAR_STOP_WORDS.has(cleaned)) return '';
            if (cleaned.length < 1) return '';
            if (!/[A-Za-z0-9\u4e00-\u9fa5]/.test(cleaned)) return '';
            if (/^[0-9]+$/.test(cleaned)) return '';
            return cleaned;
        }

        if (Array.isArray(value)) {
            rawList = value;
        } else if (typeof value === 'string' && value.trim()) {
            rawList = value.split(/[,\n，、;；\s]+/);
        }

        for (let i = 0; i < rawList.length; i += 1) {
            const keyword = sanitizeKeyword(rawList[i]);
            if (!keyword || seen.has(keyword)) continue;
            seen.add(keyword);
            list.push(keyword);
            if (list.length >= 20) break;
        }

        return list;
    }

    /**
     * 对关键词做轻量语义扩展，补齐更容易被用户提问命中的别名词。
     */
    function expandTriggerKeywordAliases(keywords) {
        const source = Array.isArray(keywords) ? keywords : [];
        const result = [];

        /**
         * 追加候选关键词（原始值，后续统一交给 normalize 做过滤去重）。
         */
        function append(rawKeyword) {
            const value = toTrimmedString(rawKeyword);
            if (!value) return;
            result.push(value);
        }

        source.forEach(function expandOne(rawKeyword) {
            const keyword = toTrimmedString(rawKeyword);
            if (!keyword) return;

            append(keyword);

            if (/(听歌|歌曲|音乐|歌单|唱歌)/.test(keyword)) {
                append('听歌');
                append('歌曲');
                append('音乐');
                append('歌');
            }

            if (/(分手|分开|分离)/.test(keyword)) {
                append('分手');
                append('分开');
            }

            if (/(复合|和好)/.test(keyword)) {
                append('复合');
                append('和好');
            }

            if (/(吵架|争吵|冷战)/.test(keyword)) {
                append('吵架');
                append('争吵');
                append('冷战');
            }
        });

        return result;
    }

    /**
     * 从记忆文本中提取简易关键词，提升中文检索的兜底召回能力。
     */
    function extractContentKeywords(content) {
        const source = toTrimmedString(content);
        if (!source) return [];

        const stopWords = new Set([
            '我们', '你们', '他们', '今天', '昨天', '刚刚', '就是', '然后', '这个', '那个',
            '事情', '自己', '一下', '已经', '还是', '还有', '真的', '突然', '感觉', '告诉'
        ]);
        const topicKeywords = [
            '分手', '复合', '吵架', '和好', '冷战', '误会', '道歉', '承诺', '约定', '背叛',
            '吃醋', '告白', '表白', '约会', '见面', '离开', '重逢', '拉黑', '删好友',
            '听歌', '歌曲', '音乐', '生日', '礼物', '旅行', '生病', '住院', '失眠'
        ];
        const result = [];
        const seen = new Set();

        /**
         * 追加一条“可读关键词”，自动过滤单字与噪声。
         */
        function pushKeyword(rawKeyword) {
            const keyword = toTrimmedString(rawKeyword).replace(/^[\s"'“”‘’《》「」【】（）()]+|[\s"'“”‘’《》「」【】（）()]+$/g, '');
            if (!keyword) return;
            if (keyword.length > 12) return;
            if (
                keyword.length === 1
                && TRIGGER_SINGLE_CHAR_STOP_WORDS.has(keyword)
            ) {
                return;
            }
            if (stopWords.has(keyword) || seen.has(keyword)) return;
            if (!/[A-Za-z0-9\u4e00-\u9fa5]/.test(keyword)) return;
            if (/^[0-9]+$/.test(keyword)) return;
            seen.add(keyword);
            result.push(keyword);
        }

        // 优先识别引号/书名号里的短语，比如歌名、事件名。
        const quotedMatches = source.match(/(?:《[^》]{1,20}》|“[^”]{1,20}”|'[^']{1,20}'|"[^"]{1,20}")/g) || [];
        quotedMatches.forEach(function appendQuoted(matchText) {
            pushKeyword(matchText.replace(/^[《“"'‘’]|[》”"'‘’]$/g, ''));
        });

        // 再从常见情感事件词典中补关键词，避免“整句切块”。
        topicKeywords.forEach(function appendTopicKeyword(keyword) {
            if (source.includes(keyword)) {
                pushKeyword(keyword);
            }
        });

        // 最后仅保留简短自然片段，不再按字符拆分，防止出现“一字一词”。
        source
            .split(/[，。！？；、\n\r\t]/)
            .map(function normalizeSegment(segment) {
                return toTrimmedString(segment);
            })
            .filter(Boolean)
            .forEach(function appendSegment(segment) {
                if (segment.length <= 8) {
                    pushKeyword(segment);
                }
            });

        return result.slice(0, 20);
    }

    /**
     * 合并 metadata 与 trigger_keywords，确保关键词稳定落库。
     */
    function normalizeEvidenceMessageIds(value, maxCount) {
        const limit = Math.max(1, Math.floor(toFiniteNumber(maxCount, 24)));
        const result = [];
        const seen = new Set();
        const rawList = Array.isArray(value)
            ? value
            : (typeof value === 'string' && value.trim() ? value.split(/[,\s]+/) : []);

        for (let i = 0; i < rawList.length; i += 1) {
            const messageId = toTrimmedString(rawList[i]);
            if (!messageId || seen.has(messageId)) continue;
            seen.add(messageId);
            result.push(messageId);
            if (result.length >= limit) break;
        }

        return result;
    }

    function normalizeEvidenceAliases(value, maxCount) {
        const limit = Math.max(1, Math.floor(toFiniteNumber(maxCount, 12)));
        const rawList = Array.isArray(value)
            ? value
            : (typeof value === 'string' && value.trim() ? [value] : []);
        return normalizeTriggerKeywords(
            expandTriggerKeywordAliases(rawList)
        ).slice(0, limit);
    }

    function mergeEvidenceTimeBoundary(primary, secondary, mode) {
        const direction = mode === 'max' ? 'max' : 'min';
        const values = [primary, secondary].map(toTrimmedString).filter(Boolean);
        if (values.length === 0) return '';

        let bestText = values[0];
        let bestTs = Date.parse(bestText);
        if (Number.isFinite(bestTs)) {
            bestText = new Date(bestTs).toISOString();
        }

        for (let i = 1; i < values.length; i += 1) {
            const candidateText = values[i];
            const candidateTs = Date.parse(candidateText);
            if (!Number.isFinite(candidateTs)) continue;

            if (
                !Number.isFinite(bestTs)
                || (direction === 'max' ? candidateTs > bestTs : candidateTs < bestTs)
            ) {
                bestTs = candidateTs;
                bestText = new Date(candidateTs).toISOString();
            }
        }

        return bestText;
    }

    function buildSourceEvidenceMetadata(payloadSource, baseMetadata, fallbackAliases) {
        const safePayload = payloadSource && typeof payloadSource === 'object' ? payloadSource : {};
        const safeBaseMetadata = normalizeMetadata(baseMetadata);
        const sourceMessageIds = mergeUniqueIds(
            normalizeEvidenceMessageIds(
                readFirstDefined(safePayload, ['source_message_ids', 'sourceMessageIds'], []),
                24
            ),
            normalizeEvidenceMessageIds(
                readFirstDefined(safeBaseMetadata, ['source_message_ids', 'sourceMessageIds'], []),
                24
            ),
            24
        );
        const surfaceAliases = normalizeEvidenceAliases(
            []
                .concat(readFirstDefined(safePayload, ['surface_aliases', 'surfaceAliases'], []))
                .concat(readFirstDefined(safeBaseMetadata, ['surface_aliases', 'surfaceAliases'], []))
                .concat(Array.isArray(fallbackAliases) ? fallbackAliases : []),
            12
        );
        const sourceTimeStart = mergeEvidenceTimeBoundary(
            readFirstDefined(safePayload, ['source_time_start', 'sourceTimeStart'], ''),
            readFirstDefined(safeBaseMetadata, ['source_time_start', 'sourceTimeStart'], ''),
            'min'
        );
        const sourceTimeEnd = mergeEvidenceTimeBoundary(
            readFirstDefined(safePayload, ['source_time_end', 'sourceTimeEnd'], ''),
            readFirstDefined(safeBaseMetadata, ['source_time_end', 'sourceTimeEnd'], ''),
            'max'
        );
        const nextMetadata = {};
        if (sourceMessageIds.length > 0) {
            nextMetadata.source_message_ids = sourceMessageIds;
        }
        if (surfaceAliases.length > 0) {
            nextMetadata.surface_aliases = surfaceAliases;
        }
        if (sourceTimeStart) {
            nextMetadata.source_time_start = sourceTimeStart;
        }
        if (sourceTimeEnd) {
            nextMetadata.source_time_end = sourceTimeEnd;
        }
        return nextMetadata;
    }

    function collectSourceEvidenceMetadata(rows, fallbackMetadata) {
        const safeRows = Array.isArray(rows) ? rows : [];
        const safeFallbackMetadata = normalizeMetadata(fallbackMetadata);
        let sourceMessageIds = normalizeEvidenceMessageIds(
            readFirstDefined(safeFallbackMetadata, ['source_message_ids', 'sourceMessageIds'], []),
            24
        );
        let sourceTimeStart = mergeEvidenceTimeBoundary(
            '',
            readFirstDefined(safeFallbackMetadata, ['source_time_start', 'sourceTimeStart'], ''),
            'min'
        );
        let sourceTimeEnd = mergeEvidenceTimeBoundary(
            '',
            readFirstDefined(safeFallbackMetadata, ['source_time_end', 'sourceTimeEnd'], ''),
            'max'
        );
        const aliasSeed = []
            .concat(readFirstDefined(safeFallbackMetadata, ['surface_aliases', 'surfaceAliases'], []))
            .concat(readFirstDefined(safeFallbackMetadata, ['trigger_keywords', 'triggerKeywords'], []));

        safeRows.forEach(function collectFromRow(row) {
            if (!row || typeof row !== 'object') return;
            const rowMetadata = normalizeMetadata(row.metadata);
            sourceMessageIds = mergeUniqueIds(
                sourceMessageIds,
                normalizeEvidenceMessageIds(
                    readFirstDefined(row, ['source_message_ids', 'sourceMessageIds'], readFirstDefined(rowMetadata, ['source_message_ids', 'sourceMessageIds'], [])),
                    24
                ),
                24
            );
            aliasSeed.push.apply(aliasSeed,
                []
                    .concat(readFirstDefined(row, ['surface_aliases', 'surfaceAliases'], readFirstDefined(rowMetadata, ['surface_aliases', 'surfaceAliases'], [])))
                    .concat(readFirstDefined(row, ['trigger_keywords', 'triggerKeywords'], readFirstDefined(rowMetadata, ['trigger_keywords', 'triggerKeywords'], [])))
            );
            sourceTimeStart = mergeEvidenceTimeBoundary(
                sourceTimeStart,
                readFirstDefined(row, ['source_time_start', 'sourceTimeStart'], readFirstDefined(rowMetadata, ['source_time_start', 'sourceTimeStart'], '')),
                'min'
            );
            sourceTimeEnd = mergeEvidenceTimeBoundary(
                sourceTimeEnd,
                readFirstDefined(row, ['source_time_end', 'sourceTimeEnd'], readFirstDefined(rowMetadata, ['source_time_end', 'sourceTimeEnd'], '')),
                'max'
            );
        });

        return {
            source_message_ids: sourceMessageIds,
            source_time_start: sourceTimeStart,
            source_time_end: sourceTimeEnd,
            surface_aliases: normalizeEvidenceAliases(aliasSeed, 12)
        };
    }

    function buildMemoryMetadata(payloadSource, content) {
        const baseMetadata = normalizeMetadata(payloadSource && payloadSource.metadata);
        const explicitKeywords = normalizeTriggerKeywords(
            readFirstDefined(payloadSource, [
                'trigger_keywords',
                'triggerKeywords',
                'keywords',
                'triggers'
            ], [])
        );
        const metadataKeywords = normalizeTriggerKeywords(baseMetadata.trigger_keywords);
        const contentKeywords = extractContentKeywords(content);
        const mergedKeywords = normalizeTriggerKeywords(
            expandTriggerKeywordAliases(
                []
                    .concat(explicitKeywords)
                    .concat(metadataKeywords)
                    .concat(contentKeywords)
            )
        );

        const anchors = normalizeTriggerKeywords(
            readFirstDefined(payloadSource, [
                'sensory_anchors',
                'sensoryAnchors'
            ], baseMetadata.sensory_anchors || [])
        );
        const sourceEvidenceMetadata = buildSourceEvidenceMetadata(payloadSource, baseMetadata, mergedKeywords);
        const nextMetadata = Object.assign({}, baseMetadata, sourceEvidenceMetadata);
        if (mergedKeywords.length > 0) {
            nextMetadata.trigger_keywords = mergedKeywords;
        }
        if (anchors.length > 0) {
            nextMetadata.sensory_anchors = anchors;
        }
        return nextMetadata;
    }

    /**
     * 将数据库返回的行统一整形成客户端使用的记忆对象。
     */
    function normalizeMemoryRow(row) {
        if (!row || typeof row !== 'object') return null;

        const metadata = normalizeMetadata(row.metadata);
        const memoryId = row.memory_id || row.id || null;
        const score = toFiniteNumber(
            readFirstDefined(row, [
                'score',
                'final_score',
                'combined_score',
                'text_score',
                'vector_similarity',
                'decay_score'
            ], 0),
            0
        );
        const eventId = toTrimmedString(
            readFirstDefined(row, [
                'event_id',
                'eventId'
            ], readFirstDefined(metadata, [
                'event_id',
                'eventId',
                'memory_event_id',
                'cluster_id',
                'memory_cluster_id'
            ], ''))
        ) || null;
        const eventTitle = toTrimmedString(
            readFirstDefined(row, [
                'event_title',
                'eventTitle'
            ], readFirstDefined(metadata, [
                'event_title',
                'eventTitle'
            ], ''))
        ) || null;
        const eventSummary = toTrimmedString(
            readFirstDefined(row, [
                'event_summary',
                'eventSummary'
            ], readFirstDefined(metadata, [
                'event_summary',
                'eventSummary'
            ], ''))
        ) || null;
        const eventStatus = toTrimmedString(
            readFirstDefined(row, [
                'event_status',
                'eventStatus'
            ], readFirstDefined(metadata, [
                'event_status',
                'eventStatus'
            ], ''))
        ) || null;
        const eventIsUnresolved = toBoolean(
            readFirstDefined(row, [
                'event_is_unresolved',
                'eventIsUnresolved'
            ], readFirstDefined(metadata, [
                'event_is_unresolved',
                'eventIsUnresolved',
                'is_unresolved',
                'unresolved'
            ], false))
        );
        const eventDepthScore = toFiniteNumber(
            readFirstDefined(row, [
                'event_depth_score',
                'eventDepthScore'
            ], readFirstDefined(metadata, [
                'event_depth_score',
                'eventDepthScore',
                'depth_score',
                'cluster_depth_snapshot'
            ], null)),
            null
        );
        const eventSalienceScore = toFiniteNumber(
            readFirstDefined(row, [
                'event_salience_score',
                'eventSalienceScore'
            ], readFirstDefined(metadata, [
                'event_salience_score',
                'eventSalienceScore',
                'salience_score'
            ], null)),
            null
        );
        const eventDate = toTrimmedString(
            readFirstDefined(row, [
                'event_date',
                'eventDate'
            ], readFirstDefined(metadata, [
                'event_date',
                'occurred_at',
                'event_time',
                'happened_at',
                'date'
            ], ''))
        ) || null;
        const continuationKey = toTrimmedString(
            readFirstDefined(row, [
                'continuation_key',
                'continuationKey'
            ], readFirstDefined(metadata, [
                'continuation_key',
                'continuationKey'
            ], ''))
        ) || null;
        const eventAnchorMemoryId = toTrimmedString(
            readFirstDefined(row, [
                'event_anchor_memory_id',
                'eventAnchorMemoryId'
            ], readFirstDefined(metadata, [
                'event_anchor_memory_id',
                'eventAnchorMemoryId',
                'anchor_memory_id',
                'anchorMemoryId'
            ], ''))
        ) || null;
        const eventDetailMemoryIds = (
            Array.isArray(row.event_detail_memory_ids)
                ? row.event_detail_memory_ids
                : Array.isArray(metadata.event_detail_memory_ids)
                    ? metadata.event_detail_memory_ids
                    : Array.isArray(metadata.detail_memory_ids)
                        ? metadata.detail_memory_ids
                        : []
        )
            .map(toTrimmedString)
            .filter(Boolean)
            .slice(0, 16);
        const eventFlashbulbMemoryIds = (
            Array.isArray(row.event_flashbulb_memory_ids)
                ? row.event_flashbulb_memory_ids
                : Array.isArray(metadata.event_flashbulb_memory_ids)
                    ? metadata.event_flashbulb_memory_ids
                    : []
        )
            .map(toTrimmedString)
            .filter(Boolean)
            .slice(0, 16);
        const eventIsFlashbulb = toBoolean(
            readFirstDefined(row, [
                'event_is_flashbulb',
                'eventIsFlashbulb'
            ], readFirstDefined(metadata, [
                'event_is_flashbulb',
                'eventIsFlashbulb'
            ], eventFlashbulbMemoryIds.length > 0 || !!row.is_flashbulb))
        );
        const recallHitMode = toTrimmedString(
            readFirstDefined(row, [
                'recall_hit_mode',
                'recallHitMode'
            ], readFirstDefined(metadata, [
                'recall_hit_mode',
                'recallHitMode'
            ], ''))
        );
        const eventMemoryLayer = normalizeMemoryLayerName(
            readFirstDefined(row, [
                'event_memory_layer',
                'eventMemoryLayer'
            ], readFirstDefined(metadata, [
                'event_memory_layer',
                'eventMemoryLayer'
            ], ''))
        ) || null;
        const eventSensoryAnchor = toTrimmedString(
            readFirstDefined(row, [
                'event_sensory_anchor',
                'eventSensoryAnchor'
            ], readFirstDefined(metadata, [
                'event_sensory_anchor',
                'eventSensoryAnchor'
            ], ''))
        ) || null;
        const sourceMessageIds = normalizeEvidenceMessageIds(
            readFirstDefined(row, [
                'source_message_ids',
                'sourceMessageIds'
            ], readFirstDefined(metadata, [
                'source_message_ids',
                'sourceMessageIds'
            ], [])),
            24
        );
        const surfaceAliases = normalizeEvidenceAliases(
            []
                .concat(readFirstDefined(row, [
                    'surface_aliases',
                    'surfaceAliases'
                ], readFirstDefined(metadata, [
                    'surface_aliases',
                    'surfaceAliases'
                ], [])))
                .concat(readFirstDefined(row, [
                    'trigger_keywords',
                    'triggerKeywords'
                ], readFirstDefined(metadata, [
                    'trigger_keywords',
                    'triggerKeywords'
                ], []))),
            12
        );
        const sourceTimeStart = mergeEvidenceTimeBoundary(
            readFirstDefined(row, [
                'source_time_start',
                'sourceTimeStart'
            ], ''),
            readFirstDefined(metadata, [
                'source_time_start',
                'sourceTimeStart'
            ], ''),
            'min'
        );
        const sourceTimeEnd = mergeEvidenceTimeBoundary(
            readFirstDefined(row, [
                'source_time_end',
                'sourceTimeEnd'
            ], ''),
            readFirstDefined(metadata, [
                'source_time_end',
                'sourceTimeEnd'
            ], ''),
            'max'
        );
        const rawEventSignalProfile = row.event_signal_profile && typeof row.event_signal_profile === 'object'
            ? row.event_signal_profile
            : (metadata.event_signal_profile && typeof metadata.event_signal_profile === 'object'
                ? metadata.event_signal_profile
                : null);
        const eventSignalProfile = rawEventSignalProfile
            ? Object.assign({}, rawEventSignalProfile)
            : null;
        const eventSignalTags = normalizeTriggerKeywords(
            []
                .concat(readFirstDefined(row, ['event_signal_tags', 'eventSignalTags'], []))
                .concat(readFirstDefined(metadata, ['event_signal_tags', 'eventSignalTags'], []))
                .concat(Array.isArray(eventSignalProfile && eventSignalProfile.reasonTags) ? eventSignalProfile.reasonTags : [])
        ).slice(0, 12);
        const eventConflictScore = clampNumber(
            readFirstDefined(row, ['event_conflict_score', 'eventConflictScore'], readFirstDefined(metadata, [
                'event_conflict_score',
                'eventConflictScore'
            ], eventSignalProfile && eventSignalProfile.conflictScore)),
            0,
            1,
            clampNumber(eventSignalProfile && eventSignalProfile.conflictScore, 0, 1, 0)
        );
        const eventAttachmentScore = clampNumber(
            readFirstDefined(row, ['event_attachment_score', 'eventAttachmentScore'], readFirstDefined(metadata, [
                'event_attachment_score',
                'eventAttachmentScore'
            ], eventSignalProfile && eventSignalProfile.attachmentScore)),
            0,
            1,
            clampNumber(eventSignalProfile && eventSignalProfile.attachmentScore, 0, 1, 0)
        );
        const eventPriorityBucket = toTrimmedString(
            readFirstDefined(row, ['event_priority_bucket', 'eventPriorityBucket'], readFirstDefined(metadata, [
                'event_priority_bucket',
                'eventPriorityBucket'
            ], ''))
        ) || null;
        const adjustedScoreValue = readFirstDefined(row, [
            'adjustedScore',
            'adjusted_score'
        ], undefined);
        const moodAdjustedScoreValue = readFirstDefined(row, [
            'mood_adjusted_score',
            'moodAdjustedScore'
        ], undefined);
        const hybridRankScoreValue = readFirstDefined(row, [
            'hybrid_rank_score',
            'hybridRankScore'
        ], undefined);
        const keywordScoreValue = readFirstDefined(row, [
            'keyword_score',
            'keywordScore'
        ], undefined);
        const vectorScoreValue = readFirstDefined(row, [
            'vector_score',
            'vectorScore'
        ], undefined);
        const hitKeyword = toTrimmedString(
            readFirstDefined(row, [
                '_hitKeyword',
                'hit_keyword',
                'hitKeyword'
            ], readFirstDefined(metadata, [
                'hit_keyword',
                'hitKeyword'
            ], ''))
        );
        const hitSensoryAnchor = toTrimmedString(
            readFirstDefined(row, [
                '_hitSensoryAnchor',
                'hit_sensory_anchor',
                'hitSensoryAnchor'
            ], readFirstDefined(metadata, [
                'hit_sensory_anchor',
                'hitSensoryAnchor',
                'event_sensory_anchor',
                'eventSensoryAnchor'
            ], ''))
        );

        return {
            id: memoryId,
            memory_id: memoryId,
            user_id: toTrimmedString(row.user_id || row.userId) || null,
            char_id: toTrimmedString(row.char_id || row.charId) || null,
            is_event_cluster: !!row.is_event_cluster || !!row.isEventCluster,
            context_scope: row.context_scope || row.scope || 'private',
            room_id: row.room_id || null,
            content: row.content || '',
            valence: toFiniteNumber(row.valence, 0),
            arousal: toFiniteNumber(row.arousal, 0),
            importance: toFiniteNumber(row.importance, 5),
            activation_count: toFiniteNumber(row.activation_count, 1),
            resolved: !!row.resolved,
            memory_layer: toTrimmedString(row.memory_layer || row.layer || 'buffer') || 'buffer',
            is_flashbulb: !!row.is_flashbulb,
            score: score,
            surface_reason: row.surface_reason || null,
            text_score: row.text_score !== undefined ? toFiniteNumber(row.text_score, 0) : null,
            final_score: row.final_score !== undefined ? toFiniteNumber(row.final_score, 0) : null,
            vector_similarity: row.vector_similarity !== undefined ? toFiniteNumber(row.vector_similarity, 0) : null,
            decay_score: row.decay_score !== undefined ? toFiniteNumber(row.decay_score, 0) : null,
            combined_score: row.combined_score !== undefined ? toFiniteNumber(row.combined_score, 0) : null,
            recall_hit_mode: recallHitMode,
            hybrid_rank_score: hybridRankScoreValue !== undefined ? toFiniteNumber(hybridRankScoreValue, score) : null,
            keyword_score: keywordScoreValue !== undefined ? toFiniteNumber(keywordScoreValue, 0) : null,
            vector_score: vectorScoreValue !== undefined ? toFiniteNumber(vectorScoreValue, 0) : null,
            adjustedScore: adjustedScoreValue !== undefined ? toFiniteNumber(adjustedScoreValue, score) : undefined,
            mood_adjusted_score: moodAdjustedScoreValue !== undefined ? toFiniteNumber(moodAdjustedScoreValue, score) : null,
            mood_reorder_multiplier: row.mood_reorder_multiplier !== undefined ? toFiniteNumber(row.mood_reorder_multiplier, 1) : null,
            mood_resonance: row.mood_resonance !== undefined ? toBoolean(row.mood_resonance) : false,
            mood_contrast: row.mood_contrast !== undefined ? toBoolean(row.mood_contrast) : false,
            hit_by_sensory: !!row.hit_by_sensory,
            _hitByKeyword: toBoolean(readFirstDefined(row, ['_hitByKeyword', 'hit_by_keyword', 'hitByKeyword'], false)),
            _hitByVector: toBoolean(readFirstDefined(row, ['_hitByVector', 'hit_by_vector', 'hitByVector'], false)),
            _hitBySensory: toBoolean(readFirstDefined(row, ['_hitBySensory', 'hit_by_sensory', 'hitBySensory'], false)),
            _hitKeyword: hitKeyword,
            _hitSensoryAnchor: hitSensoryAnchor,
            _isIntrusive: toBoolean(readFirstDefined(row, ['_isIntrusive', 'is_intrusive', 'isIntrusive'], false)),
            created_at: row.created_at || null,
            last_active_at: row.last_active_at || null,
            last_injected_at: row.last_injected_at || null,
            source_type: row.source_type || row.sourceType || null,
            source_ref: row.source_ref || row.sourceRef || null,
            event_id: eventId,
            event_title: eventTitle,
            event_summary: eventSummary,
            event_status: eventStatus,
            event_date: eventDate,
            event_is_unresolved: eventIsUnresolved,
            event_depth_score: eventDepthScore,
            event_salience_score: eventSalienceScore,
            event_conflict_score: eventConflictScore,
            event_attachment_score: eventAttachmentScore,
            continuation_key: continuationKey,
            event_depth: toTrimmedString(row.event_depth || row.eventDepth || readFirstDefined(metadata, ['event_depth', 'cluster_depth_snapshot'], '')) || null,
            event_fragment_count: Math.max(0, Math.floor(toFiniteNumber(
                row.event_fragment_count !== undefined ? row.event_fragment_count : readFirstDefined(metadata, ['event_fragment_count', 'fragment_count'], 0),
                0
            ))),
            event_memory_layer: eventMemoryLayer,
            event_layer_mixed: toBoolean(readFirstDefined(row, ['event_layer_mixed', 'eventLayerMixed'], readFirstDefined(metadata, ['event_layer_mixed', 'eventLayerMixed'], false))),
            event_sensory_anchor: eventSensoryAnchor,
            event_anchor_memory_id: eventAnchorMemoryId,
            event_detail_memory_ids: eventDetailMemoryIds,
            event_flashbulb_memory_ids: eventFlashbulbMemoryIds,
            event_is_flashbulb: eventIsFlashbulb,
            source_message_ids: sourceMessageIds,
            source_time_start: sourceTimeStart || null,
            source_time_end: sourceTimeEnd || null,
            surface_aliases: surfaceAliases,
            event_detail_memories: Array.isArray(row.event_detail_memories)
                ? row.event_detail_memories.slice(0, 8)
                : [],
            event_signal_profile: eventSignalProfile,
            event_signal_tags: eventSignalTags,
            event_priority_bucket: eventPriorityBucket,
            metadata: metadata
        };
    }

    /**
     * 规范化真实事件表记录，供召回候选池优先使用。
     */
    function normalizeEventRecordRow(row) {
        if (!row || typeof row !== 'object') return null;

        const eventId = toTrimmedString(row.id || row.event_id);
        if (!eventId) return null;

        const depth = toTrimmedString(row.depth || row.event_depth).toLowerCase() || 'low';
        const status = toTrimmedString(row.status || row.event_status).toLowerCase() || 'closed';
        const metadata = normalizeMetadata(row.metadata);
        const memoryIds = (Array.isArray(row.memory_ids) ? row.memory_ids : [])
            .map(toTrimmedString)
            .filter(Boolean);
        const detailMemoryIds = mergeUniqueIds(
            []
                .concat(Array.isArray(row.detail_memory_ids) ? row.detail_memory_ids : [])
                .concat(Array.isArray(row.event_detail_memory_ids) ? row.event_detail_memory_ids : [])
                .concat(Array.isArray(metadata.event_detail_memory_ids) ? metadata.event_detail_memory_ids : [])
                .concat(Array.isArray(metadata.detail_memory_ids) ? metadata.detail_memory_ids : []),
            [],
            24
        );
        const eventFlashbulbMemoryIds = (
            Array.isArray(row.event_flashbulb_memory_ids)
                ? row.event_flashbulb_memory_ids
                : Array.isArray(metadata.event_flashbulb_memory_ids)
                    ? metadata.event_flashbulb_memory_ids
                    : []
        )
            .map(toTrimmedString)
            .filter(Boolean)
            .slice(0, 24);
        const eventIsFlashbulb = toBoolean(
            readFirstDefined(row, [
                'event_is_flashbulb',
                'eventIsFlashbulb',
                'is_flashbulb'
            ], readFirstDefined(metadata, [
                'event_is_flashbulb',
                'eventIsFlashbulb',
                'is_flashbulb'
            ], eventFlashbulbMemoryIds.length > 0))
        );
        const sourceMessageIds = normalizeEvidenceMessageIds(
            readFirstDefined(row, [
                'source_message_ids',
                'sourceMessageIds'
            ], readFirstDefined(metadata, [
                'source_message_ids',
                'sourceMessageIds'
            ], [])),
            24
        );
        const surfaceAliases = normalizeEvidenceAliases(
            []
                .concat(readFirstDefined(row, [
                    'surface_aliases',
                    'surfaceAliases'
                ], readFirstDefined(metadata, [
                    'surface_aliases',
                    'surfaceAliases'
                ], [])))
                .concat(readFirstDefined(metadata, [
                    'trigger_keywords',
                    'triggerKeywords'
                ], [])),
            12
        );
        const sourceTimeStart = mergeEvidenceTimeBoundary(
            readFirstDefined(row, [
                'source_time_start',
                'sourceTimeStart'
            ], ''),
            readFirstDefined(metadata, [
                'source_time_start',
                'sourceTimeStart'
            ], ''),
            'min'
        );
        const sourceTimeEnd = mergeEvidenceTimeBoundary(
            readFirstDefined(row, [
                'source_time_end',
                'sourceTimeEnd'
            ], ''),
            readFirstDefined(metadata, [
                'source_time_end',
                'sourceTimeEnd'
            ], ''),
            'max'
        );
        const rawEventSignalProfile = row.event_signal_profile && typeof row.event_signal_profile === 'object'
            ? row.event_signal_profile
            : (metadata.event_signal_profile && typeof metadata.event_signal_profile === 'object'
                ? metadata.event_signal_profile
                : null);
        const eventSignalProfile = rawEventSignalProfile
            ? Object.assign({}, rawEventSignalProfile)
            : null;
        const eventSignalTags = normalizeTriggerKeywords(
            []
                .concat(readFirstDefined(row, ['event_signal_tags', 'eventSignalTags'], []))
                .concat(readFirstDefined(metadata, ['event_signal_tags', 'eventSignalTags'], []))
                .concat(Array.isArray(eventSignalProfile && eventSignalProfile.reasonTags) ? eventSignalProfile.reasonTags : [])
        ).slice(0, 12);
        const eventConflictScore = clampNumber(
            readFirstDefined(row, ['event_conflict_score', 'eventConflictScore'], readFirstDefined(metadata, [
                'event_conflict_score',
                'eventConflictScore'
            ], eventSignalProfile && eventSignalProfile.conflictScore)),
            0,
            1,
            clampNumber(eventSignalProfile && eventSignalProfile.conflictScore, 0, 1, 0)
        );
        const eventAttachmentScore = clampNumber(
            readFirstDefined(row, ['event_attachment_score', 'eventAttachmentScore'], readFirstDefined(metadata, [
                'event_attachment_score',
                'eventAttachmentScore'
            ], eventSignalProfile && eventSignalProfile.attachmentScore)),
            0,
            1,
            clampNumber(eventSignalProfile && eventSignalProfile.attachmentScore, 0, 1, 0)
        );
        const eventPriorityBucket = toTrimmedString(
            readFirstDefined(row, ['event_priority_bucket', 'eventPriorityBucket'], readFirstDefined(metadata, [
                'event_priority_bucket',
                'eventPriorityBucket'
            ], ''))
        ) || null;

        return {
            id: eventId,
            event_id: eventId,
            user_id: toTrimmedString(row.user_id || row.userId) || null,
            char_id: toTrimmedString(row.char_id || row.charId) || null,
            title: toTrimmedString(row.title || row.event_title),
            summary: toTrimmedString(row.summary || row.event_summary),
            status: status,
            depth: depth,
            event_date: toTrimmedString(row.event_date) || null,
            fragment_count: Math.max(0, Math.floor(toFiniteNumber(row.fragment_count, memoryIds.length))),
            is_unresolved: row.is_unresolved !== undefined
                ? toBoolean(row.is_unresolved)
                : status === 'open',
            continuation_key: toTrimmedString(row.continuation_key) || null,
            salience_score: clampNumber(row.salience_score, 0, 1, 0.4),
            depth_score: clampNumber(
                row.depth_score,
                0,
                1,
                depth === 'high' ? 1 : (depth === 'medium' ? 0.68 : 0.36)
            ),
            event_conflict_score: eventConflictScore,
            event_attachment_score: eventAttachmentScore,
            event_is_flashbulb: eventIsFlashbulb,
            event_flashbulb_memory_ids: eventFlashbulbMemoryIds,
            anchor_memory_id: toTrimmedString(row.anchor_memory_id) || null,
            memory_ids: memoryIds,
            detail_memory_ids: detailMemoryIds,
            room_id: toTrimmedString(row.room_id) || null,
            context_scope: toTrimmedString(row.context_scope) || (row.room_id ? 'room' : 'private'),
            start_at: toTrimmedString(row.start_at) || null,
            end_at: toTrimmedString(row.end_at) || null,
            last_related_at: toTrimmedString(row.last_related_at) || null,
            source_message_ids: sourceMessageIds,
            source_time_start: sourceTimeStart || null,
            source_time_end: sourceTimeEnd || null,
            surface_aliases: surfaceAliases,
            manual_edited: !!row.manual_edited,
            manual_note: toTrimmedString(row.manual_note),
            event_signal_profile: eventSignalProfile,
            event_signal_tags: eventSignalTags,
            event_priority_bucket: eventPriorityBucket,
            metadata: metadata,
            updated_at: toTrimmedString(row.updated_at) || null
        };
    }

    function isRetiredEventRecord(eventRecord) {
        const safeRecord = eventRecord && typeof eventRecord === 'object' ? eventRecord : {};
        const metadata = normalizeMetadata(safeRecord.metadata);
        if (toBoolean(readFirstDefined(safeRecord, ['digest_retired', 'digestRetired'], false))) {
            return true;
        }
        if (toBoolean(readFirstDefined(metadata, ['digest_retired', 'digestRetired'], false))) {
            return true;
        }
        return !!toTrimmedString(
            readFirstDefined(
                safeRecord,
                ['digest_retired_at', 'digestRetiredAt'],
                readFirstDefined(metadata, ['digest_retired_at', 'digestRetiredAt'], '')
            )
        );
    }

    function getEventLayerScoreSnapshot(layer) {
        const safeLayer = normalizeMemoryLayerName(layer);
        if (safeLayer === 'shadow') return 0.96;
        if (safeLayer === 'wish') return 0.82;
        if (safeLayer === 'core') return 0.68;
        if (safeLayer === 'cortex') return 0.52;
        return 0.28;
    }

    function normalizeEventSignalProfileSnapshot(profile, fallback) {
        const source = profile && typeof profile === 'object' ? profile : {};
        const safeFallback = fallback && typeof fallback === 'object' ? fallback : {};
        return {
            salienceScore: clampNumber(readFirstDefined(source, ['salienceScore', 'salience_score'], safeFallback.salienceScore), 0, 1, 0),
            emotionScore: clampNumber(readFirstDefined(source, ['emotionScore', 'emotion_score'], safeFallback.emotionScore), 0, 1, 0),
            significanceScore: clampNumber(readFirstDefined(source, ['significanceScore', 'significance_score'], safeFallback.significanceScore), 0, 1, 0),
            contrastScore: clampNumber(readFirstDefined(source, ['contrastScore', 'contrast_score'], safeFallback.contrastScore), 0, 1, 0),
            detailScore: clampNumber(readFirstDefined(source, ['detailScore', 'detail_score'], safeFallback.detailScore), 0, 1, 0),
            recurrenceScore: clampNumber(readFirstDefined(source, ['recurrenceScore', 'recurrence_score'], safeFallback.recurrenceScore), 0, 1, 0),
            conflictScore: clampNumber(readFirstDefined(source, ['conflictScore', 'conflict_score'], safeFallback.conflictScore), 0, 1, 0),
            attachmentScore: clampNumber(readFirstDefined(source, ['attachmentScore', 'attachment_score'], safeFallback.attachmentScore), 0, 1, 0),
            unresolvedScore: clampNumber(readFirstDefined(source, ['unresolvedScore', 'unresolved_score'], safeFallback.unresolvedScore), 0, 1, 0),
            layerScore: clampNumber(readFirstDefined(source, ['layerScore', 'layer_score'], safeFallback.layerScore), 0, 1, 0),
            densityScore: clampNumber(readFirstDefined(source, ['densityScore', 'density_score'], safeFallback.densityScore), 0, 1, 0),
            positivePeak: clampNumber(readFirstDefined(source, ['positivePeak', 'positive_peak'], safeFallback.positivePeak), 0, 1, 0),
            negativePeak: clampNumber(readFirstDefined(source, ['negativePeak', 'negative_peak'], safeFallback.negativePeak), 0, 1, 0),
            depth: toTrimmedString(readFirstDefined(source, ['depth'], safeFallback.depth)).toLowerCase() || 'low',
            isUnresolved: !!readFirstDefined(source, ['isUnresolved', 'is_unresolved'], safeFallback.isUnresolved)
        };
    }

    function collectEventSignalTags(memory, eventRecord, signalProfile) {
        const source = memory && typeof memory === 'object' ? memory : {};
        const record = eventRecord && typeof eventRecord === 'object' ? eventRecord : {};
        const metadata = normalizeMetadata(source.metadata);
        const recordMetadata = normalizeMetadata(record.metadata);
        const profile = signalProfile && typeof signalProfile === 'object'
            ? signalProfile
            : normalizeEventSignalProfileSnapshot(null, null);
        const tags = normalizeTriggerKeywords(
            []
                .concat(Array.isArray(source.event_signal_tags) ? source.event_signal_tags : [])
                .concat(Array.isArray(record.event_signal_tags) ? record.event_signal_tags : [])
                .concat(Array.isArray(metadata.event_signal_tags) ? metadata.event_signal_tags : [])
                .concat(Array.isArray(recordMetadata.event_signal_tags) ? recordMetadata.event_signal_tags : [])
                .concat(Array.isArray(profile.reasonTags) ? profile.reasonTags : [])
        );
        const syntheticTags = [];
        if (profile.conflictScore >= 0.62) syntheticTags.push('high_conflict');
        if (profile.attachmentScore >= 0.64) syntheticTags.push('high_attachment');
        if (profile.conflictScore >= 0.72 && profile.isUnresolved) syntheticTags.push('grievance_pull');
        if (profile.attachmentScore >= 0.72 && (profile.isUnresolved || profile.recurrenceScore >= 0.58)) syntheticTags.push('attachment_pull');
        if (profile.positivePeak >= 0.62 && profile.attachmentScore >= 0.62 && !profile.isUnresolved) syntheticTags.push('bonded');
        return normalizeTriggerKeywords(syntheticTags.concat(tags)).slice(0, 12);
    }

    function hasEventSignalTag(tags, tag) {
        const safeTag = toTrimmedString(tag);
        if (!safeTag) return false;
        return (Array.isArray(tags) ? tags : []).some(function hasTag(value) {
            return toTrimmedString(value) === safeTag;
        });
    }

    function getEventSignalProfileSnapshot(memory, eventRecord) {
        const source = memory && typeof memory === 'object' ? memory : {};
        const record = eventRecord && typeof eventRecord === 'object' ? eventRecord : {};
        const metadata = normalizeMetadata(source.metadata);
        const recordMetadata = normalizeMetadata(record.metadata);
        const detailCount = Math.max(
            Array.isArray(source.event_detail_memories) ? source.event_detail_memories.length : 0,
            Array.isArray(source.event_detail_memory_ids) ? source.event_detail_memory_ids.length : 0,
            Array.isArray(record.detail_memory_ids) ? record.detail_memory_ids.length : 0
        );
        const activationCount = Math.max(0, toFiniteNumber(source.activation_count, 0));
        const valence = clampNumber(toFiniteNumber(source.valence, 0), -1, 1, 0);
        const arousal = clampNumber(toFiniteNumber(source.arousal, 0), 0, 1, 0);
        const importance = clampNumber(toFiniteNumber(source.importance, 5), 1, 10, 5);
        const depth = toTrimmedString(
            source.event_depth
            || record.depth
            || readFirstDefined(metadata, ['event_depth', 'cluster_depth_snapshot'], '')
            || readFirstDefined(recordMetadata, ['event_depth', 'cluster_depth_snapshot'], '')
        ).toLowerCase() || 'low';
        const depthScore = clampNumber(
            source.event_depth_score !== undefined && source.event_depth_score !== null
                ? source.event_depth_score
                : readFirstDefined(record, ['depth_score', 'event_depth_score'], (
                    depth === 'high' ? 1 : (depth === 'medium' ? 0.68 : 0.36)
                )),
            0,
            1,
            depth === 'high' ? 1 : (depth === 'medium' ? 0.68 : 0.36)
        );
        const unresolved = !!(
            source.event_is_unresolved
            || record.is_unresolved
            || toTrimmedString(source.event_status).toLowerCase() === 'open'
            || toTrimmedString(record.status).toLowerCase() === 'open'
            || readFirstDefined(metadata, ['event_is_unresolved', 'is_unresolved'], false)
            || readFirstDefined(recordMetadata, ['event_is_unresolved', 'is_unresolved'], false)
        );
        const salienceScore = clampNumber(
            source.event_salience_score !== undefined && source.event_salience_score !== null
                ? source.event_salience_score
                : readFirstDefined(record, ['salience_score', 'event_salience_score'], 0),
            0,
            1,
            0
        );
        const recurrenceScore = clampNumber(Math.log1p(activationCount) / Math.log(6), 0, 1, 0);
        const detailScore = clampNumber(
            readFirstDefined(metadata, ['detail_score', 'detailScore'], Math.min(1, detailCount / 4)),
            0,
            1,
            Math.min(1, detailCount / 4)
        );
        const positivePeak = clampNumber(Math.max(0, valence), 0, 1, 0);
        const negativePeak = clampNumber(Math.max(0, -valence), 0, 1, 0);
        const contrastScore = clampNumber(
            readFirstDefined(metadata, ['contrast_score', 'contrastScore'], (
                (Math.abs(valence) * 0.42)
                + (arousal * 0.18)
                + (unresolved ? 0.12 : 0)
            )),
            0,
            1,
            0
        );
        const emotionScore = clampNumber(
            readFirstDefined(metadata, ['emotion_score', 'emotionScore'], (
                (Math.abs(valence) * 0.56)
                + (arousal * 0.44)
            )),
            0,
            1,
            0
        );
        const densityScore = clampNumber(
            readFirstDefined(metadata, ['density_score', 'densityScore'], Math.min(1, Math.max(0, detailCount - 1) / 4)),
            0,
            1,
            Math.min(1, Math.max(0, detailCount - 1) / 4)
        );
        const layerScore = clampNumber(
            readFirstDefined(metadata, ['layer_score', 'layerScore'], getEventLayerScoreSnapshot(
                source.event_memory_layer
                || source.memory_layer
                || record.event_memory_layer
                || record.memory_layer
            )),
            0,
            1,
            0
        );
        const significanceScore = clampNumber(
            readFirstDefined(metadata, ['significance_score', 'significanceScore'], (
                (salienceScore * 0.34)
                + ((importance / 10) * 0.24)
                + (depthScore * 0.14)
                + (detailScore * 0.10)
                + (recurrenceScore * 0.10)
                + (unresolved ? 0.08 : 0)
            )),
            0,
            1,
            0
        );
        const conflictScore = clampNumber(
            readFirstDefined(source, ['event_conflict_score', 'eventConflictScore'], readFirstDefined(metadata, [
                'event_conflict_score',
                'eventConflictScore'
            ], (
                (negativePeak * 0.34)
                + (contrastScore * 0.18)
                + (unresolved ? 0.16 : 0)
                + (arousal * 0.16)
                + (emotionScore * 0.10)
            ))),
            0,
            1,
            0
        );
        const attachmentScore = clampNumber(
            readFirstDefined(source, ['event_attachment_score', 'eventAttachmentScore'], readFirstDefined(metadata, [
                'event_attachment_score',
                'eventAttachmentScore'
            ], (
                (significanceScore * 0.28)
                + (recurrenceScore * 0.18)
                + (detailScore * 0.16)
                + (unresolved ? 0.16 : 0)
                + (Math.max(positivePeak, negativePeak * 0.9) * 0.10)
                + (densityScore * 0.06)
                + (emotionScore * 0.06)
            ))),
            0,
            1,
            0
        );
        const rawProfile = source.event_signal_profile && typeof source.event_signal_profile === 'object'
            ? source.event_signal_profile
            : record.event_signal_profile && typeof record.event_signal_profile === 'object'
                ? record.event_signal_profile
                : metadata.event_signal_profile && typeof metadata.event_signal_profile === 'object'
                    ? metadata.event_signal_profile
                    : recordMetadata.event_signal_profile && typeof recordMetadata.event_signal_profile === 'object'
                        ? recordMetadata.event_signal_profile
                        : null;

        return normalizeEventSignalProfileSnapshot(rawProfile, {
            salienceScore: salienceScore,
            emotionScore: emotionScore,
            significanceScore: significanceScore,
            contrastScore: contrastScore,
            detailScore: detailScore,
            recurrenceScore: recurrenceScore,
            conflictScore: conflictScore,
            attachmentScore: attachmentScore,
            unresolvedScore: unresolved ? 1 : 0,
            layerScore: layerScore,
            densityScore: densityScore,
            positivePeak: positivePeak,
            negativePeak: negativePeak,
            depth: depth,
            isUnresolved: unresolved
        });
    }

    function deriveEventPriorityProfile(memory, eventRecord) {
        const signalProfile = getEventSignalProfileSnapshot(memory, eventRecord);
        const signalTags = collectEventSignalTags(memory, eventRecord, signalProfile);
        const source = memory && typeof memory === 'object' ? memory : {};
        const record = eventRecord && typeof eventRecord === 'object' ? eventRecord : {};
        const flashbulb = !!(
            source.event_is_flashbulb
            || record.event_is_flashbulb
            || hasEventSignalTag(signalTags, 'fragment_flashbulb')
            || hasEventSignalTag(signalTags, 'existing_flashbulb')
        );
        const depth = toTrimmedString(source.event_depth || record.depth || signalProfile.depth).toLowerCase() || 'low';
        const hasHighConflict = hasEventSignalTag(signalTags, 'high_conflict') || signalProfile.conflictScore >= 0.62;
        const hasHighAttachment = hasEventSignalTag(signalTags, 'high_attachment') || signalProfile.attachmentScore >= 0.64;
        const hasLingeringGrievance = hasEventSignalTag(signalTags, 'grievance_pull');
        const hasLingeringAttachment = hasEventSignalTag(signalTags, 'attachment_pull');
        let priorityBucket = 'background';
        if (hasHighConflict || hasHighAttachment) {
            priorityBucket = 'conflict_attachment';
        } else if (signalProfile.isUnresolved || hasEventSignalTag(signalTags, 'open_loop')) {
            priorityBucket = 'open_loop';
        } else if (flashbulb || signalProfile.salienceScore >= 0.64 || depth === 'high') {
            priorityBucket = 'salience';
        }
        const bucketBonus = priorityBucket === 'conflict_attachment'
            ? 0.12
            : priorityBucket === 'open_loop'
                ? 0.08
                : priorityBucket === 'salience'
                    ? 0.05
                    : 0;
        const priorityScore = clampNumber(
            (signalProfile.salienceScore * 0.24)
            + (signalProfile.conflictScore * 0.24)
            + (signalProfile.attachmentScore * 0.22)
            + (signalProfile.recurrenceScore * 0.08)
            + (signalProfile.detailScore * 0.06)
            + (signalProfile.isUnresolved ? 0.08 : 0)
            + (flashbulb ? 0.05 : 0)
            + (depth === 'high' ? 0.04 : (depth === 'medium' ? 0.02 : 0))
            + bucketBonus
            + ((hasHighConflict && hasHighAttachment) ? 0.06 : 0)
            + ((hasLingeringGrievance || hasLingeringAttachment) ? 0.04 : 0),
            0,
            1,
            0
        );

        return {
            signalProfile: signalProfile,
            signalTags: signalTags,
            conflictScore: signalProfile.conflictScore,
            attachmentScore: signalProfile.attachmentScore,
            priorityBucket: priorityBucket,
            priorityScore: priorityScore,
            isUnresolved: signalProfile.isUnresolved,
            flashbulb: flashbulb,
            depth: depth,
            hasHighConflict: hasHighConflict,
            hasHighAttachment: hasHighAttachment,
            hasLingeringGrievance: hasLingeringGrievance,
            hasLingeringAttachment: hasLingeringAttachment
        };
    }

    /**
     * 尝试把任意时间值解析为毫秒时间戳，失败时返回 NaN。
     */
    function parseTimestampMs(value) {
        const source = toTrimmedString(value);
        if (!source) return NaN;

        // 避免 Date.parse('YYYY-MM-DD') 的时区歧义，优先按本地日期构造。
        const ymd = source.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (ymd) {
            const year = Number(ymd[1]);
            const month = Number(ymd[2]);
            const day = Number(ymd[3]);
            if (
                Number.isFinite(year)
                && Number.isFinite(month)
                && Number.isFinite(day)
                && month >= 1 && month <= 12
                && day >= 1 && day <= 31
            ) {
                const localDate = new Date(year, month - 1, day);
                if (
                    localDate.getFullYear() === year
                    && localDate.getMonth() === month - 1
                    && localDate.getDate() === day
                ) {
                    return localDate.getTime();
                }
            }
        }

        const timestamp = Date.parse(source);
        return Number.isFinite(timestamp) ? timestamp : NaN;
    }

    /**
     * 从记忆对象里选取第一个可用时间戳，按字段顺序回退。
     */
    function getMemoryTimestamp(memory, orderedFields) {
        const safeMemory = memory && typeof memory === 'object' ? memory : {};
        const fields = Array.isArray(orderedFields) && orderedFields.length > 0
            ? orderedFields
            : ['created_at', 'last_active_at', 'last_injected_at'];

        for (let i = 0; i < fields.length; i += 1) {
            const ts = parseTimestampMs(safeMemory[fields[i]]);
            if (Number.isFinite(ts)) return ts;
        }

        return NaN;
    }

    /**
     * 优先从顶层事件字段读取事件发生时间，再回退 metadata（例如 YAML 迁移回填的 event_date）。
     */
    function getMemoryEventTimestamp(memory) {
        const safeMemory = memory && typeof memory === 'object' ? memory : {};
        const directFields = ['event_date', 'eventDate'];
        for (let i = 0; i < directFields.length; i += 1) {
            const ts = parseTimestampMs(safeMemory[directFields[i]]);
            if (Number.isFinite(ts)) return ts;
        }
        const metadata = normalizeMetadata(safeMemory.metadata);
        const fields = ['event_date', 'occurred_at', 'event_time', 'happened_at', 'date'];
        for (let i = 0; i < fields.length; i += 1) {
            const ts = parseTimestampMs(metadata[fields[i]]);
            if (Number.isFinite(ts)) return ts;
        }
        return NaN;
    }

    /**
     * 将记忆时间戳格式化为中文日期，便于在 Prompt 中表达“何时发生”。
     */
    function formatMemoryDateLabel(memory) {
        const safeMemory = memory && typeof memory === 'object' ? memory : {};
        const eventTimestamp = getMemoryEventTimestamp(memory);
        if (Number.isFinite(eventTimestamp)) {
            const date = new Date(eventTimestamp);
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}年${month}月${day}日`;
        }

        // YAML 迁移记忆如果没有 event_date，就不要用数据库写入时间冒充事件时间。
        const sourceType = toTrimmedString(safeMemory.source_type || safeMemory.sourceType);
        if (sourceType === 'yaml_migration') return '';

        const timestamp = getMemoryTimestamp(safeMemory, ['created_at', 'last_active_at', 'last_injected_at']);
        if (!Number.isFinite(timestamp)) return '';

        const date = new Date(timestamp);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}年${month}月${day}日`;
    }

    function getMemoryPromptTimestamp(memory) {
        const safeMemory = memory && typeof memory === 'object' ? memory : {};
        const metadata = normalizeMetadata(safeMemory.metadata);
        const candidates = [
            getMemoryEventTimestamp(safeMemory),
            parseTimestampMs(safeMemory.source_time_start),
            parseTimestampMs(metadata.source_time_start),
            parseTimestampMs(safeMemory.source_time_end),
            parseTimestampMs(metadata.source_time_end),
            getMemoryTimestamp(safeMemory, ['created_at', 'last_active_at', 'last_injected_at'])
        ];
        for (let i = 0; i < candidates.length; i += 1) {
            if (Number.isFinite(candidates[i])) return candidates[i];
        }
        return NaN;
    }

    function formatPromptRelativeTimeLabel(timestampMs, options) {
        const safeOptions = options && typeof options === 'object' ? options : {};
        const stamp = Number(timestampMs);
        if (!Number.isFinite(stamp) || stamp <= 0) return '';
        const nowMs = Number.isFinite(safeOptions.nowMs) ? safeOptions.nowMs : Date.now();
        const date = new Date(stamp);
        const today = new Date(nowMs);
        const todayStartMs = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
        const targetStartMs = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
        const diffDays = Math.round((todayStartMs - targetStartMs) / (24 * 60 * 60 * 1000));

        if (diffDays === 0) return '今天';
        if (diffDays === 1) return '昨天';
        if (diffDays === 2) return '前天';
        if (diffDays > 2 && diffDays <= 6) return `${diffDays}天前`;
        if (diffDays >= 7 && diffDays <= 13) return '上周';
        if (diffDays >= 14 && diffDays <= 20) return '半个月前';
        if (diffDays > 20 && diffDays <= 31) return `${Math.round(diffDays / 7)}周前`;
        if (diffDays > 31 && diffDays <= 93) return `${Math.round(diffDays / 30)}个月前`;
        return '';
    }

    function formatMemoryPromptTimeLead(memory, options) {
        const timestamp = getMemoryPromptTimestamp(memory);
        if (!Number.isFinite(timestamp)) return '';
        const exactLabel = formatMemoryDateLabel(memory);
        const relativeLabel = formatPromptRelativeTimeLabel(timestamp, options);
        if (relativeLabel && exactLabel) {
            return `${relativeLabel}（${exactLabel}）· `;
        }
        if (relativeLabel) {
            return `${relativeLabel}· `;
        }
        if (exactLabel) {
            return `${exactLabel}· `;
        }
        return '';
    }

    function isMemoryInsideTimeWindow(memory, startMs, endMs) {
        const safeStartMs = Number(startMs);
        const safeEndMs = Number(endMs);
        if (!Number.isFinite(safeStartMs) || !Number.isFinite(safeEndMs) || safeEndMs <= safeStartMs) {
            return false;
        }

        const safeMemory = memory && typeof memory === 'object' ? memory : {};
        const metadata = normalizeMetadata(safeMemory.metadata);
        const primaryStamp = getMemoryPromptTimestamp(safeMemory);
        if (Number.isFinite(primaryStamp) && primaryStamp >= safeStartMs && primaryStamp < safeEndMs) {
            return true;
        }

        const sourceStart = parseTimestampMs(safeMemory.source_time_start || metadata.source_time_start);
        const sourceEnd = parseTimestampMs(safeMemory.source_time_end || metadata.source_time_end);
        if (Number.isFinite(sourceStart) && Number.isFinite(sourceEnd)) {
            return sourceStart < safeEndMs && sourceEnd >= safeStartMs;
        }
        return false;
    }

    /**
     * 提取记忆所属事件 ID，兼容多种字段别名。
     */
    function getMemoryEventId(memory) {
        const safeMemory = memory && typeof memory === 'object' ? memory : {};
        const direct = toTrimmedString(
            safeMemory.event_id
            || safeMemory.eventId
            || safeMemory.cluster_id
            || safeMemory.clusterId
        );
        if (direct) return direct;

        const metadata = normalizeMetadata(safeMemory.metadata);
        return toTrimmedString(readFirstDefined(metadata, [
            'event_id',
            'eventId',
            'memory_event_id',
            'cluster_id',
            'memory_cluster_id'
        ], ''));
    }

    /**
     * 规范化记忆层级文本；非法值返回空字符串，便于上层回退到默认行为。
     */
    function normalizeMemoryLayerName(value) {
        const normalized = toTrimmedString(value).toLowerCase();
        return ['buffer', 'core', 'cortex', 'shadow', 'wish'].includes(normalized) ? normalized : '';
    }

    /**
     * 为事件候选推断一个“事件主层级”，让事件也能继续被层级/依恋/情绪系统消费。
     */
    function deriveEventMainLayer(fragments, eventRecord) {
        const safeRecord = eventRecord && typeof eventRecord === 'object' ? eventRecord : null;
        const recordMetadata = normalizeMetadata(safeRecord && safeRecord.metadata);
        const explicitLayer = normalizeMemoryLayerName(
            (safeRecord && (safeRecord.memory_layer || safeRecord.event_memory_layer || safeRecord.layer))
            || recordMetadata.event_memory_layer
            || recordMetadata.memory_layer
            || recordMetadata.layer
        );
        if (explicitLayer) {
            return {
                layer: explicitLayer,
                mixed: false,
                distribution: { [explicitLayer]: 1 },
                source: 'event_record'
            };
        }

        const anchorId = toTrimmedString(safeRecord && safeRecord.anchor_memory_id);
        const counts = {};
        const weights = {};
        const priority = {
            shadow: 5,
            wish: 4,
            core: 3,
            cortex: 2,
            buffer: 1
        };

        (Array.isArray(fragments) ? fragments : []).forEach(function consumeFragment(fragment) {
            if (!fragment || typeof fragment !== 'object') return;
            const metadata = normalizeMetadata(fragment.metadata);
            const memoryId = toTrimmedString(fragment.memory_id || fragment.id);
            const layer = normalizeMemoryLayerName(
                fragment.memory_layer
                || metadata.memory_layer
                || metadata.layer
            );
            if (!layer) return;

            counts[layer] = (counts[layer] || 0) + 1;

            let weight = 1 + Math.min(1.4, Math.max(0, toFiniteNumber(fragment.importance, 0)) / 7);
            if (memoryId && memoryId === anchorId) weight += 0.8;
            weight += Math.max(0, getRecallHitRank(fragment)) * 0.25;
            if ((layer === 'shadow' || layer === 'wish') && !toBoolean(fragment.resolved)) {
                weight += 0.18;
            }

            weights[layer] = (weights[layer] || 0) + weight;
        });

        const layers = Object.keys(weights);
        if (layers.length === 0) {
            return {
                layer: 'buffer',
                mixed: false,
                distribution: { buffer: 1 },
                source: 'fallback'
            };
        }

        layers.sort(function sortLayers(left, right) {
            if ((weights[right] || 0) !== (weights[left] || 0)) {
                return (weights[right] || 0) - (weights[left] || 0);
            }
            if ((counts[right] || 0) !== (counts[left] || 0)) {
                return (counts[right] || 0) - (counts[left] || 0);
            }
            return (priority[right] || 0) - (priority[left] || 0);
        });

        return {
            layer: layers[0] || 'buffer',
            mixed: layers.length > 1,
            distribution: counts,
            source: 'fragments'
        };
    }

    /**
     * 根据命中来源恢复 recall_hit_mode，避免事件候选只继承锚点碎片的命中信息。
     */
    function buildRecallHitModeFromFlags(keywordHit, vectorHit) {
        if (keywordHit && vectorHit) return 'keyword+vector';
        if (vectorHit) return 'vector';
        if (keywordHit) return 'keyword';
        return '';
    }

    /**
     * 汇总事件候选的命中来源、代表性关键词与感官锚点。
     */
    function collectEventRecallSignals(fragments) {
        const result = {
            keywordHit: false,
            vectorHit: false,
            sensoryHit: false,
            hitKeyword: '',
            hitSensoryAnchor: '',
            triggerKeywords: [],
            sensoryAnchors: [],
            recallHitMode: ''
        };
        const triggerBuffer = [];
        const sensoryBuffer = [];

        (Array.isArray(fragments) ? fragments : []).forEach(function consumeFragment(fragment) {
            if (!fragment || typeof fragment !== 'object') return;

            const metadata = normalizeMetadata(fragment.metadata);
            triggerBuffer.push.apply(triggerBuffer, normalizeTriggerKeywords(metadata.trigger_keywords || []));
            sensoryBuffer.push.apply(sensoryBuffer, normalizeTriggerKeywords(metadata.sensory_anchors || []));

            const mode = toTrimmedString(fragment.recall_hit_mode);
            const keywordHit = !!fragment._hitByKeyword || mode === 'keyword' || mode === 'keyword+vector';
            const vectorHit = !!fragment._hitByVector || mode === 'vector' || mode === 'keyword+vector';
            const sensoryHit = !!fragment._hitBySensory || !!fragment.hit_by_sensory;

            if (keywordHit) {
                result.keywordHit = true;
                if (!result.hitKeyword) {
                    result.hitKeyword = toTrimmedString(fragment._hitKeyword);
                }
            }
            if (vectorHit) {
                result.vectorHit = true;
            }
            if (sensoryHit) {
                result.sensoryHit = true;
                if (!result.hitSensoryAnchor) {
                    result.hitSensoryAnchor = toTrimmedString(fragment._hitSensoryAnchor);
                }
            }
        });

        result.triggerKeywords = normalizeTriggerKeywords(triggerBuffer).slice(0, 8);
        result.sensoryAnchors = normalizeTriggerKeywords(sensoryBuffer).slice(0, 8);
        result.recallHitMode = buildRecallHitModeFromFlags(result.keywordHit, result.vectorHit);
        return result;
    }

    function deriveEventFlashbulbState(fragments, eventRecord) {
        const safeRecord = eventRecord && typeof eventRecord === 'object' ? eventRecord : null;
        const recordMetadata = normalizeMetadata(safeRecord && safeRecord.metadata);
        const fragmentIds = [];
        let fragmentFlashbulb = false;

        (Array.isArray(fragments) ? fragments : []).forEach(function collectFlashbulb(fragment) {
            if (!fragment || typeof fragment !== 'object') return;
            const metadata = normalizeMetadata(fragment.metadata);
            const memoryId = toTrimmedString(fragment.memory_id || fragment.id);
            const isFlashbulb = toBoolean(
                fragment.is_flashbulb
                || readFirstDefined(metadata, ['is_flashbulb', 'event_is_flashbulb'], false)
            );
            if (!isFlashbulb) return;
            fragmentFlashbulb = true;
            if (memoryId) fragmentIds.push(memoryId);
        });

        const persistedIds = (
            Array.isArray(safeRecord && safeRecord.event_flashbulb_memory_ids)
                ? safeRecord.event_flashbulb_memory_ids
                : Array.isArray(recordMetadata.event_flashbulb_memory_ids)
                    ? recordMetadata.event_flashbulb_memory_ids
                    : []
        ).map(toTrimmedString).filter(Boolean);
        const mergedIds = mergeUniqueIds(fragmentIds, persistedIds, 24);
        const persistedFlag = toBoolean(
            (safeRecord && safeRecord.event_is_flashbulb)
            || readFirstDefined(recordMetadata, ['event_is_flashbulb', 'is_flashbulb'], false)
        );

        return {
            isFlashbulb: fragmentFlashbulb || persistedFlag || mergedIds.length > 0,
            memoryIds: mergedIds
        };
    }

    /**
     * 计算当前心境对一条召回项的加权结果。
     */
    function computeMoodReorderMetrics(memory, currentValence, currentArousal) {
        const safeMemory = memory && typeof memory === 'object' ? memory : {};
        const safeCurrentValence = Number(currentValence);
        const safeCurrentArousal = Number(currentArousal);
        const hasCurrentValence = Number.isFinite(safeCurrentValence);
        const hasCurrentArousal = Number.isFinite(safeCurrentArousal);
        const baseScore = toFiniteNumber(
            safeMemory.adjustedScore !== undefined
                ? safeMemory.adjustedScore
                : (safeMemory.score !== undefined
                    ? safeMemory.score
                    : (toFiniteNumber(safeMemory.importance, 0) / 10)),
            0
        );
        const valence = clampNumber(safeMemory.valence, -1, 1, 0);
        const arousal = clampNumber(safeMemory.arousal, 0, 1, 0);
        const layer = normalizeMemoryLayerName(safeMemory.memory_layer || safeMemory.event_memory_layer);

        let multiplier = 1;
        let resonance = false;
        let contrast = false;

        if (hasCurrentValence && (safeCurrentValence * valence) > 0 && Math.abs(safeCurrentValence - valence) < 0.4) {
            resonance = true;
            multiplier *= 1.3;
            if (hasCurrentArousal && Math.abs(safeCurrentArousal - arousal) < 0.25) {
                multiplier *= 1.04;
            }
        } else if (hasCurrentArousal && Math.abs(safeCurrentArousal - arousal) < 0.15) {
            multiplier *= 1.06;
        }

        if (hasCurrentValence && safeCurrentValence > 0.6 && valence < -0.6 && layer === 'shadow') {
            contrast = true;
            multiplier *= 1.15;
        }

        return {
            baseScore: baseScore,
            adjustedScore: baseScore * multiplier,
            multiplier: multiplier,
            resonance: resonance,
            contrast: contrast
        };
    }

    /**
     * 当前情绪会先作用于“事件内部细节顺序”，再决定最终呈现给 Prompt 的展开顺序。
     */
    function reorderEventDetailsByCurrentMood(details, currentValence, currentArousal) {
        const source = Array.isArray(details) ? details.filter(Boolean) : [];
        if (source.length <= 1) return source.slice();

        return source.slice().map(function decorateDetail(item) {
            const metrics = computeMoodReorderMetrics(item, currentValence, currentArousal);
            return Object.assign({}, item, {
                mood_adjusted_score: metrics.adjustedScore + (item && item.is_anchor ? 0.08 : 0)
            });
        }).sort(function sortDetails(left, right) {
            const scoreDiff = toFiniteNumber(right && right.mood_adjusted_score, 0) - toFiniteNumber(left && left.mood_adjusted_score, 0);
            if (scoreDiff !== 0) return scoreDiff;
            if (!!(left && left.is_anchor) !== !!(right && right.is_anchor)) {
                return left && left.is_anchor ? -1 : 1;
            }
            if (toFiniteNumber(right && right.importance, 0) !== toFiniteNumber(left && left.importance, 0)) {
                return toFiniteNumber(right && right.importance, 0) - toFiniteNumber(left && left.importance, 0);
            }
            return getMemoryTimestamp(right, ['created_at', 'last_active_at', 'last_injected_at'])
                - getMemoryTimestamp(left, ['created_at', 'last_active_at', 'last_injected_at']);
        });
    }

    /**
     * 对事件/碎片混合召回结果做“当前情绪重排”：先改事件顺序，再改事件内部条目顺序。
     */
    function applyCurrentMoodReorder(memories, currentValence, currentArousal, sourceLabel) {
        const source = Array.isArray(memories) ? memories.filter(Boolean) : [];
        const safeCurrentValence = Number(currentValence);
        const safeCurrentArousal = Number(currentArousal);
        if (source.length === 0) return [];
        if (!Number.isFinite(safeCurrentValence) && !Number.isFinite(safeCurrentArousal)) {
            return source.slice();
        }

        const label = toTrimmedString(sourceLabel) || 'surface';
        let resonanceCount = 0;
        let contrastCount = 0;

        const reordered = source.slice().map(function decorateMemory(memory) {
            const metrics = computeMoodReorderMetrics(memory, safeCurrentValence, safeCurrentArousal);
            if (metrics.resonance) resonanceCount += 1;
            if (metrics.contrast) contrastCount += 1;

            return Object.assign({}, memory, {
                score: metrics.adjustedScore,
                adjustedScore: metrics.adjustedScore,
                mood_reorder_multiplier: metrics.multiplier,
                mood_resonance: metrics.resonance,
                mood_contrast: metrics.contrast,
                event_detail_memories: Array.isArray(memory && memory.event_detail_memories)
                    ? reorderEventDetailsByCurrentMood(memory.event_detail_memories, safeCurrentValence, safeCurrentArousal)
                    : []
            });
        }).sort(function sortMemories(left, right) {
            if (toFiniteNumber(right && right.score, 0) !== toFiniteNumber(left && left.score, 0)) {
                return toFiniteNumber(right && right.score, 0) - toFiniteNumber(left && left.score, 0);
            }
            return getMemoryTimestamp(right, ['last_active_at', 'created_at', 'last_injected_at'])
                - getMemoryTimestamp(left, ['last_active_at', 'created_at', 'last_injected_at']);
        });

        console.log(
            `[海马体][${label}] 情绪重排 -> currentValence=${Number.isFinite(safeCurrentValence) ? safeCurrentValence.toFixed(2) : 'null'}, 共振加权${resonanceCount}条, 对比加权${contrastCount}条`
        );
        return reordered;
    }

    /**
     * 为事件候选生成一个简洁摘要，优先使用已有事件摘要字段。
     */
    function buildEventSummaryFromFragments(fragments) {
        const list = Array.isArray(fragments) ? fragments.filter(Boolean) : [];
        if (list.length === 0) return '';

        const first = list[0];
        const firstMetadata = normalizeMetadata(first.metadata);
        const explicitSummary = toTrimmedString(
            first.event_summary
            || readFirstDefined(firstMetadata, ['event_summary', 'eventSummary'], '')
        );
        if (explicitSummary) return explicitSummary;

        const firstContent = toTrimmedString(first.content);
        const secondContent = toTrimmedString(list[1] && list[1].content);
        if (firstContent && secondContent) {
            const clippedFirst = firstContent.length > 30 ? `${firstContent.slice(0, 30)}…` : firstContent;
            const clippedSecond = secondContent.length > 24 ? `${secondContent.slice(0, 24)}…` : secondContent;
            return `${clippedFirst}；后来又出现了「${clippedSecond}」这样的细节。`;
        }
        if (!firstContent) return '';
        return firstContent.length > 56 ? `${firstContent.slice(0, 56)}…` : firstContent;
    }

    /**
     * 按事件成员碎片估算事件深度与综合分，供“事件 + 碎片混合召回”使用。
     */
    function estimateEventProfile(fragments) {
        const list = Array.isArray(fragments) ? fragments.filter(Boolean) : [];
        if (list.length === 0) {
            return {
                depth: 'low',
                score: 0,
                importance: 0,
                valence: 0,
                arousal: 0,
                unresolved: false,
                salienceScore: 0,
                depthScore: 0
            };
        }

        let maxImportance = 0;
        let avgValence = 0;
        let avgArousal = 0;
        let salienceScore = 0;
        let depthScore = 0;
        let unresolved = false;

        list.forEach(function consumeFragment(fragment) {
            const metadata = normalizeMetadata(fragment.metadata);
            const importance = toFiniteNumber(fragment.importance, 0);
            const valence = clampNumber(fragment.valence, -1, 1, 0);
            const arousal = clampNumber(fragment.arousal, 0, 1, 0);
            const fragmentSalience = toFiniteNumber(
                fragment.event_salience_score !== null && fragment.event_salience_score !== undefined
                    ? fragment.event_salience_score
                    : readFirstDefined(metadata, ['event_salience_score', 'salience_score'], 0),
                0
            );
            const fragmentDepth = toFiniteNumber(
                fragment.event_depth_score !== null && fragment.event_depth_score !== undefined
                    ? fragment.event_depth_score
                    : readFirstDefined(metadata, ['event_depth_score', 'depth_score'], 0),
                0
            );
            const isUnresolved = toBoolean(
                fragment.event_is_unresolved
                || readFirstDefined(metadata, ['event_is_unresolved', 'is_unresolved', 'unresolved'], false)
            );

            if (importance > maxImportance) maxImportance = importance;
            avgValence += valence;
            avgArousal += arousal;
            salienceScore = Math.max(salienceScore, fragmentSalience);
            depthScore = Math.max(depthScore, fragmentDepth);
            unresolved = unresolved || isUnresolved;
        });

        avgValence = avgValence / list.length;
        avgArousal = avgArousal / list.length;
        const countBonus = Math.min(1, list.length / 6);
        const emotionScore = Math.min(1, (Math.abs(avgValence) * 0.55) + (avgArousal * 0.45));
        const importanceScore = Math.min(1, maxImportance / 10);
        const unresolvedScore = unresolved ? 1 : 0;
        const profileScore = (
            0.30 * emotionScore
            + 0.24 * importanceScore
            + 0.18 * salienceScore
            + 0.14 * depthScore
            + 0.08 * unresolvedScore
            + 0.06 * countBonus
        );

        let depth = 'low';
        if (profileScore >= 0.72 || maxImportance >= 8 || depthScore >= 0.75) {
            depth = 'high';
        } else if (profileScore >= 0.46 || maxImportance >= 6 || list.length >= 2) {
            depth = 'medium';
        }

        return {
            depth: depth,
            score: profileScore,
            importance: maxImportance,
            valence: avgValence,
            arousal: avgArousal,
            unresolved: unresolved,
            salienceScore: salienceScore,
            depthScore: depthScore
        };
    }

    /**
     * 粗略估算一条召回项注入到 Prompt 后的 token 开销（字符数 / 2.2）。
     */
    function estimateRecallPromptTokens(memory) {
        if (!memory || typeof memory !== 'object') return 0;
        const isEvent = !!memory.is_event_cluster || toTrimmedString(memory.source_type) === 'event_cluster';
        if (isEvent) {
            const summary = toTrimmedString(memory.event_summary || memory.content);
            const title = toTrimmedString(memory.event_title);
            const detailList = Array.isArray(memory.event_detail_memories) ? memory.event_detail_memories : [];
            const detailText = detailList.map(function mapDetail(item) {
                if (!item || typeof item !== 'object') return '';
                return toTrimmedString(item.content || item.summary || item.text);
            }).filter(Boolean).join(' ');
            const totalChars = title.length + summary.length + detailText.length + 42;
            return Math.max(16, Math.ceil(totalChars / 2.2));
        }
        const content = toTrimmedString(memory.content);
        const totalChars = content.length + 28;
        return Math.max(12, Math.ceil(totalChars / 2.2));
    }

    /**
     * 在不改变主排序的前提下，对事件细节做预算压缩。
     */
    function compactEventDetailsByBudget(eventMemory, maxDetail) {
        if (!eventMemory || typeof eventMemory !== 'object') return eventMemory;
        const optionsSource = arguments[2] && typeof arguments[2] === 'object' ? arguments[2] : {};
        const detailSource = sortEventDetailMemoriesByPriority(
            Array.isArray(eventMemory.event_detail_memories) ? eventMemory.event_detail_memories : [],
            eventMemory
        );
        const safeMaxDetail = Math.max(1, Math.floor(toFiniteNumber(maxDetail, detailSource.length || 1)));
        const nextEvent = Object.assign({}, eventMemory, {
            event_detail_memories: detailSource.slice(0, safeMaxDetail)
        });
        return applyEventCompressionMetadata(nextEvent, eventMemory, optionsSource);
    }

    /**
     * 事件级 token 预算压缩器：优先保留命中事件/未了结事件，低权重条目在预算紧张时降级或裁剪。
     */
    function compressMixedRecallCandidatesByTokenBudget(rows, tokenBudget) {
        const source = Array.isArray(rows) ? rows.filter(Boolean) : [];
        if (source.length === 0) return [];
        const bucketOrder = ['current_hit', 'open_loop', 'anchor', 'high_impact', 'background'];

        function isEventRow(item) {
            return !!item && (!!item.is_event_cluster || toTrimmedString(item.source_type) === 'event_cluster');
        }

        function isMustKeepRow(item) {
            return !!item && (
                !!item._isIntrusive
                || !!item._hitByKeyword
                || !!item._hitByVector
                || !!item._hitBySensory
                || !!item.event_is_unresolved
                || toTrimmedString(item.event_priority_bucket).toLowerCase() === 'conflict_attachment'
            );
        }

        function isCurrentHitRow(item) {
            return !!item && (
                !!item._isIntrusive
                || !!item._hitByKeyword
                || !!item._hitByVector
                || !!item._hitBySensory
            );
        }

        function isOpenLoopRow(item) {
            return !!item && (
                !!item.event_is_unresolved
                || toTrimmedString(item.event_status).toLowerCase() === 'open'
            );
        }

        function isAnchorPriorityRow(item) {
            if (!item || typeof item !== 'object') return false;
            const metadata = item.metadata && typeof item.metadata === 'object' && !Array.isArray(item.metadata)
                ? item.metadata
                : {};
            if (isEventRow(item)) {
                return !!(
                    item._eventAnchorFragment
                    || item.is_anchor
                    || item.anchor_priority
                    || metadata.anchor_priority
                );
            }
            if (item._eventAnchorFragment || item.is_anchor) return true;
            const memoryId = toTrimmedString(item.memory_id || item.id);
            const anchorId = toTrimmedString(item.event_anchor_memory_id);
            return !!memoryId && !!anchorId && memoryId === anchorId;
        }

        function getBudgetBucket(item) {
            const depth = toTrimmedString(item && item.event_depth).toLowerCase();
            if (isCurrentHitRow(item)) return 'current_hit';
            if (toTrimmedString(item && item.event_priority_bucket).toLowerCase() === 'conflict_attachment') return 'open_loop';
            if (isOpenLoopRow(item)) return 'open_loop';
            if (isAnchorPriorityRow(item)) return 'anchor';
            if (!!(item && item.event_is_flashbulb) || depth === 'high') return 'high_impact';
            return 'background';
        }

        function getBucketCompressionProfile(item) {
            const bucket = getBudgetBucket(item);
            const depth = toTrimmedString(item && item.event_depth).toLowerCase();
            const flashbulb = !!(item && item.event_is_flashbulb);
            const loadedMemberCount = Math.max(
                Array.isArray(item && item.event_detail_memories) ? item.event_detail_memories.length : 0,
                Math.floor(toFiniteNumber(item && item.event_loaded_member_count, 0))
            );

            let baselineMax = depth === 'high' ? 4 : (depth === 'medium' ? 3 : 2);
            let focusMax = 2;
            let summaryMax = 88;
            let minimalSummaryMax = 72;

            if (bucket === 'current_hit') {
                baselineMax += 2;
                focusMax = 4;
                summaryMax = 144;
                minimalSummaryMax = 84;
            } else if (bucket === 'open_loop') {
                baselineMax += 1;
                focusMax = 3;
                summaryMax = 124;
                minimalSummaryMax = 88;
            } else if (bucket === 'anchor') {
                baselineMax += 1;
                focusMax = 2;
                summaryMax = 108;
                minimalSummaryMax = 80;
            } else if (bucket === 'high_impact') {
                baselineMax += 1;
                focusMax = 3;
                summaryMax = 120;
                minimalSummaryMax = 84;
            } else {
                focusMax = 1;
                summaryMax = 72;
                minimalSummaryMax = 60;
            }

            if (flashbulb) baselineMax += 1;
            if (loadedMemberCount > baselineMax) {
                baselineMax = Math.min(baselineMax + 1, Math.max(loadedMemberCount, baselineMax));
            }

            const maxDetails = Math.max(1, Math.min(6, baselineMax));
            const focusedDetails = Math.max(1, Math.min(maxDetails, focusMax));
            return {
                bucket: bucket,
                baselineMax: maxDetails,
                focusedMax: focusedDetails,
                summaryMax: summaryMax,
                minimalSummaryMax: minimalSummaryMax,
                minimalMax: bucket === 'current_hit' ? 2 : 1
            };
        }

        function truncateEventSummary(item, maxChars) {
            const summary = toTrimmedString(item && (item.event_summary || item.content));
            const safeMax = Math.max(32, Math.floor(toFiniteNumber(maxChars, 72)));
            if (!summary || summary.length <= safeMax) return item;
            return Object.assign({}, item, {
                event_summary: `${summary.slice(0, safeMax)}...`,
                content: `${summary.slice(0, safeMax)}...`
            });
        }

        function buildEventCompressionVariants(item) {
            const depth = toTrimmedString(item && item.event_depth).toLowerCase();
            const flashbulb = !!(item && item.event_is_flashbulb);
            const critical = isMustKeepRow(item) || depth === 'high' || flashbulb;
            const profile = getBucketCompressionProfile(item);
            const variants = [];

            function pushVariant(candidate) {
                if (!candidate || typeof candidate !== 'object') return;
                const signature = JSON.stringify({
                    summary: toTrimmedString(candidate.event_summary || candidate.content),
                    detailCount: Array.isArray(candidate.event_detail_memories) ? candidate.event_detail_memories.length : 0
                });
                if (variants.some(function hasSameVariant(entry) { return entry.signature === signature; })) return;
                variants.push({
                    signature: signature,
                    value: candidate
                });
            }

            const baseline = compactEventDetailsByBudget(item, profile.baselineMax, {
                bucket: profile.bucket,
                compressionLevel: 'baseline'
            });
            pushVariant(baseline);
            pushVariant(compactEventDetailsByBudget(item, Math.max(profile.focusedMax, critical ? 2 : 1), {
                bucket: profile.bucket,
                compressionLevel: 'focused'
            }));
            pushVariant(truncateEventSummary(
                compactEventDetailsByBudget(item, Math.max(profile.minimalMax, critical ? 2 : 1), {
                    bucket: profile.bucket,
                    compressionLevel: 'minimal'
                }),
                Math.max(profile.minimalSummaryMax, critical ? 64 : 56)
            ));
            pushVariant(applyEventCompressionMetadata(Object.assign({}, truncateEventSummary(item, critical ? 80 : 56), {
                event_detail_memories: []
            }), item, {
                bucket: profile.bucket,
                compressionLevel: 'summary_only'
            }));
            if (critical) {
                pushVariant(applyEventCompressionMetadata(Object.assign({}, truncateEventSummary(item, Math.min(profile.summaryMax, 64)), {
                    event_detail_memories: []
                }), item, {
                    bucket: profile.bucket,
                    compressionLevel: 'summary_only_strict'
                }));
            }

            return variants.map(function pickValue(entry) {
                return entry.value;
            });
        }

        function getCompressionPriority(item) {
            if (!item || typeof item !== 'object') return 0;
            let score = toFiniteNumber(item.score, 0);
            if (isEventRow(item)) score += 1.2;
            if (isCurrentHitRow(item)) score += 1.1;
            if (item.event_is_unresolved) score += 0.9;
            if (toTrimmedString(item.event_priority_bucket).toLowerCase() === 'conflict_attachment') score += 0.85;
            if (isAnchorPriorityRow(item)) score += 0.45;
            if (item.event_is_flashbulb) score += 0.45;
            if (item._hitByKeyword || item._hitByVector || item._hitBySensory || item._isIntrusive) score += 0.7;
            const depth = toTrimmedString(item.event_depth).toLowerCase();
            if (depth === 'high') score += 0.4;
            if (depth === 'medium') score += 0.2;
            return score;
        }

        function buildBucketBudgetPlan(entriesByBucket, totalBudget) {
            const safeEntriesByBucket = entriesByBucket instanceof Map ? entriesByBucket : new Map();
            const safeTotalBudget = Math.max(0, Math.floor(toFiniteNumber(totalBudget, 0)));
            const bucketProfiles = {
                current_hit: { ratio: 0.38, minReserve: 96 },
                open_loop: { ratio: 0.24, minReserve: 68 },
                anchor: { ratio: 0.14, minReserve: 52 },
                high_impact: { ratio: 0.14, minReserve: 44 },
                background: { ratio: 0.10, minReserve: 28 }
            };
            const plan = {
                totalBudget: safeTotalBudget,
                buckets: {}
            };
            const activeBuckets = bucketOrder.filter(function keepBucket(bucketKey) {
                const entries = safeEntriesByBucket.get(bucketKey) || [];
                return entries.length > 0;
            });

            bucketOrder.forEach(function initBucket(bucketKey) {
                const entries = safeEntriesByBucket.get(bucketKey) || [];
                plan.buckets[bucketKey] = {
                    key: bucketKey,
                    entryCount: entries.length,
                    mustKeepCount: entries.filter(isMustKeepRow).length,
                    minReserve: 0,
                    plannedBudget: 0,
                    weight: 0
                };
            });

            if (activeBuckets.length <= 0 || safeTotalBudget <= 0) {
                return plan;
            }

            const totalMinReserve = activeBuckets.reduce(function sumMin(total, bucketKey) {
                return total + toFiniteNumber(bucketProfiles[bucketKey] && bucketProfiles[bucketKey].minReserve, 0);
            }, 0);
            const minScale = totalMinReserve > safeTotalBudget
                ? (safeTotalBudget / totalMinReserve)
                : 1;

            let allocated = 0;
            activeBuckets.forEach(function assignMinimum(bucketKey) {
                const bucketPlan = plan.buckets[bucketKey];
                const profile = bucketProfiles[bucketKey] || bucketProfiles.background;
                const minReserve = Math.max(0, Math.floor(profile.minReserve * minScale));
                const weight = profile.ratio
                    + Math.min(0.06, bucketPlan.entryCount * 0.01)
                    + Math.min(0.08, bucketPlan.mustKeepCount * 0.02);
                bucketPlan.minReserve = minReserve;
                bucketPlan.plannedBudget = minReserve;
                bucketPlan.weight = weight;
                allocated += minReserve;
            });

            const totalWeight = activeBuckets.reduce(function sumWeight(total, bucketKey) {
                return total + toFiniteNumber(plan.buckets[bucketKey] && plan.buckets[bucketKey].weight, 0);
            }, 0);
            let remainder = Math.max(0, safeTotalBudget - allocated);

            activeBuckets.forEach(function assignWeightedShare(bucketKey) {
                if (remainder <= 0) return;
                const bucketPlan = plan.buckets[bucketKey];
                const share = totalWeight > 0
                    ? Math.floor((remainder * bucketPlan.weight) / totalWeight)
                    : Math.floor(remainder / Math.max(1, activeBuckets.length));
                bucketPlan.plannedBudget += Math.max(0, share);
            });

            allocated = activeBuckets.reduce(function sumPlanned(total, bucketKey) {
                return total + toFiniteNumber(plan.buckets[bucketKey] && plan.buckets[bucketKey].plannedBudget, 0);
            }, 0);
            remainder = Math.max(0, safeTotalBudget - allocated);

            const spillOrder = activeBuckets.slice().sort(function sortBuckets(left, right) {
                const weightDiff = toFiniteNumber(plan.buckets[right] && plan.buckets[right].weight, 0)
                    - toFiniteNumber(plan.buckets[left] && plan.buckets[left].weight, 0);
                if (weightDiff !== 0) return weightDiff;
                return bucketOrder.indexOf(left) - bucketOrder.indexOf(right);
            });

            let spillCursor = 0;
            while (remainder > 0 && spillOrder.length > 0) {
                const bucketKey = spillOrder[spillCursor % spillOrder.length];
                plan.buckets[bucketKey].plannedBudget += 1;
                spillCursor += 1;
                remainder -= 1;
            }

            return plan;
        }

        function pickCompressedCandidate(item, availableBudget) {
            const isEvent = isEventRow(item);
            if (!isEvent) {
                return {
                    candidate: item,
                    estimated: estimateRecallPromptTokens(item)
                };
            }

            const variants = buildEventCompressionVariants(item);
            const safeAvailable = Math.max(0, Math.floor(toFiniteNumber(availableBudget, 0)));
            let pickedVariant = variants[variants.length - 1] || item;
            let estimated = estimateRecallPromptTokens(pickedVariant);

            for (let v = 0; v < variants.length; v += 1) {
                const variant = variants[v];
                const variantEstimated = estimateRecallPromptTokens(variant);
                pickedVariant = variant;
                estimated = variantEstimated;
                if (variantEstimated <= safeAvailable) {
                    break;
                }
            }

            return {
                candidate: pickedVariant,
                estimated: estimated
            };
        }

        function consumeBucket(entries, bucketBudget, totalRemaining) {
            const accepted = [];
            const skipped = [];
            const safeEntries = Array.isArray(entries) ? entries.filter(Boolean) : [];
            let bucketRemaining = Math.max(0, Math.floor(toFiniteNumber(bucketBudget, 0)));
            let globalRemaining = Math.max(0, Math.floor(toFiniteNumber(totalRemaining, 0)));
            let usedTokens = 0;

            for (let i = 0; i < safeEntries.length; i += 1) {
                const item = safeEntries[i];
                const isMustKeep = isMustKeepRow(item);
                const availableBudget = Math.max(0, Math.min(bucketRemaining, globalRemaining));
                const variantBudget = isMustKeep
                    ? globalRemaining
                    : (availableBudget > 0 ? availableBudget : globalRemaining);
                const compressed = pickCompressedCandidate(
                    item,
                    variantBudget
                );
                const candidate = compressed.candidate;
                const estimated = compressed.estimated;

                if (estimated > globalRemaining) {
                    skipped.push(item);
                    continue;
                }

                if (estimated > bucketRemaining && !isMustKeep) {
                    skipped.push(item);
                    continue;
                }

                accepted.push(candidate);
                usedTokens += estimated;
                globalRemaining = Math.max(0, globalRemaining - estimated);
                bucketRemaining = Math.max(0, bucketRemaining - estimated);
                if (globalRemaining <= 0) {
                    skipped.push.apply(skipped, safeEntries.slice(i + 1));
                    break;
                }
            }

            return {
                accepted: accepted,
                skipped: skipped,
                usedTokens: usedTokens
            };
        }

        const safeBudget = Math.max(240, Math.floor(toFiniteNumber(tokenBudget, 10000)));
        let remaining = safeBudget;
        const kept = [];
        const bucketMap = new Map();
        const deferredMap = new Map();
        bucketOrder.forEach(function initBucket(bucketKey) {
            bucketMap.set(bucketKey, []);
            deferredMap.set(bucketKey, []);
        });

        source.forEach(function placeIntoBucket(item) {
            bucketMap.get(getBudgetBucket(item)).push(item);
        });

        const budgetPlan = buildBucketBudgetPlan(bucketMap, safeBudget);
        const bucketUsage = [];

        bucketOrder.forEach(function consumePrimaryBucket(bucketKey) {
            const entries = bucketMap.get(bucketKey) || [];
            const planBucket = budgetPlan.buckets && budgetPlan.buckets[bucketKey]
                ? budgetPlan.buckets[bucketKey]
                : { plannedBudget: 0, minReserve: 0, entryCount: 0, mustKeepCount: 0 };
            const reserved = Math.max(0, Math.floor(toFiniteNumber(planBucket.plannedBudget, 0)));

            if (remaining <= 0) {
                deferredMap.set(bucketKey, entries.slice());
                bucketUsage.push(`${bucketKey}:0/${reserved},keep=0,skip=${entries.length}`);
                return;
            }

            if (entries.length === 0) {
                bucketUsage.push(`${bucketKey}:0/${reserved},keep=0,skip=0`);
                return;
            }

            const bucketBudget = Math.max(0, Math.min(remaining, reserved));
            const outcome = consumeBucket(entries, bucketBudget, remaining);
            kept.push.apply(kept, outcome.accepted);
            deferredMap.set(bucketKey, outcome.skipped);
            remaining = Math.max(0, remaining - outcome.usedTokens);
            bucketUsage.push(`${bucketKey}:${outcome.usedTokens}/${bucketBudget},keep=${outcome.accepted.length},skip=${outcome.skipped.length}`);
        });

        if (remaining > 0) {
            const deferredEntries = [];
            bucketOrder.forEach(function collectDeferred(bucketKey) {
                const deferred = deferredMap.get(bucketKey) || [];
                deferred.forEach(function pushDeferred(item) {
                    deferredEntries.push({
                        bucketKey: bucketKey,
                        item: item
                    });
                });
            });

            const sortedDeferred = deferredEntries.slice().sort(function sortDeferred(left, right) {
                const priorityDiff = getCompressionPriority(right.item) - getCompressionPriority(left.item);
                if (priorityDiff !== 0) return priorityDiff;
                const bucketDiff = bucketOrder.indexOf(left.bucketKey) - bucketOrder.indexOf(right.bucketKey);
                if (bucketDiff !== 0) return bucketDiff;
                return estimateRecallPromptTokens(left.item) - estimateRecallPromptTokens(right.item);
            }).map(function pluckItem(entry) {
                return entry.item;
            });

            const outcome = consumeBucket(sortedDeferred, remaining, remaining);
            kept.push.apply(kept, outcome.accepted);
            remaining = Math.max(0, remaining - outcome.usedTokens);
            if (outcome.accepted.length > 0) {
                bucketUsage.push(`spill:${outcome.usedTokens}/${outcome.accepted.length}`);
            }
        }

        const budgetPlanText = bucketOrder.map(function formatBucket(bucketKey) {
            const bucket = budgetPlan.buckets && budgetPlan.buckets[bucketKey]
                ? budgetPlan.buckets[bucketKey]
                : null;
            if (!bucket) return `${bucketKey}:0`;
            return `${bucketKey}:${bucket.plannedBudget}(${bucket.entryCount}/${bucket.mustKeepCount})`;
        }).join(', ');
        console.log(`[海马体][预算压缩] tokenBudget=${safeBudget}, used=${safeBudget - remaining}, plan=${budgetPlanText}, buckets=${bucketUsage.join(', ')}`);
        return kept;
    }

    /**
     * 把碎片候选整理为“事件 + 碎片”的混合结果，且控制总注入条数。
     */
    function buildMixedRecallCandidates(memories, options) {
        const source = (Array.isArray(memories) ? memories : [])
            .map(normalizeMemoryRow)
            .filter(Boolean);
        if (source.length === 0) return [];

        const optionsSource = options && typeof options === 'object' ? options : {};
        const maxTotal = Math.max(1, Math.min(12, Math.floor(toFiniteNumber(optionsSource.maxTotal, source.length))));
        const tokenBudget = Math.max(
            240,
            Math.floor(
                toFiniteNumber(
                    optionsSource.tokenBudget,
                    state.settings && state.settings.memoryPromptTokenBudget !== undefined
                        ? state.settings.memoryPromptTokenBudget
                        : 10000
                )
            )
        );
        if (!state.settings.enableEventMixedRecall) {
            return compressMixedRecallCandidatesByTokenBudget(source.slice(0, maxTotal), tokenBudget).slice(0, maxTotal);
        }

        const eventRecordMap = toEventRecordMap(optionsSource.eventRecords);
        const eventMap = new Map();
        const standalone = [];

        source.forEach(function classifyMemory(memory) {
            const eventId = getMemoryEventId(memory);
            if (!eventId) {
                standalone.push(memory);
                return;
            }
            if (!eventMap.has(eventId)) {
                eventMap.set(eventId, []);
            }
            eventMap.get(eventId).push(memory);
        });

        const eventCandidates = [];
        const eventAnchors = [];
        eventMap.forEach(function buildEventCandidate(group, eventId) {
            const candidate = buildEventCandidateFromFragments(eventId, group, {
                detailPerEvent: optionsSource.detailPerEvent,
                eventRecords: eventRecordMap,
                detailRows: optionsSource.detailRows
            });
            if (!candidate) {
                standalone.push.apply(standalone, group);
                return;
            }
            eventCandidates.push(candidate);

            const anchorId = toTrimmedString(candidate.event_anchor_memory_id || candidate.memory_id || candidate.id);
            const anchorFragment = group.find(function findAnchor(item) {
                return toTrimmedString(item && (item.memory_id || item.id)) === anchorId;
            });
            if (anchorFragment) {
                eventAnchors.push(Object.assign({}, anchorFragment, {
                    _belongsToEvent: true,
                    _eventId: eventId,
                    _eventDepth: candidate.event_depth,
                    _eventAnchorFragment: true
                }));
            }
        });

        const usedMemoryIds = new Set();
        const usedEventIds = new Set();
        const result = [];

        eventCandidates.sort(function sortEvents(left, right) {
            if (toFiniteNumber(right.score, 0) !== toFiniteNumber(left.score, 0)) {
                return toFiniteNumber(right.score, 0) - toFiniteNumber(left.score, 0);
            }
            return getMemoryTimestamp(right, ['last_active_at', 'created_at', 'last_injected_at'])
                - getMemoryTimestamp(left, ['last_active_at', 'created_at', 'last_injected_at']);
        }).forEach(function appendEvent(eventCandidate) {
            if (result.length >= maxTotal) return;
            result.push(eventCandidate);
            usedEventIds.add(toTrimmedString(eventCandidate.event_id));
            const memoryId = toTrimmedString(eventCandidate.memory_id || eventCandidate.id);
            if (memoryId) usedMemoryIds.add(memoryId);
        });

        standalone.slice().sort(function sortStandalone(left, right) {
            const rankDiff = getRecallHitRank(right) - getRecallHitRank(left);
            if (rankDiff !== 0) return rankDiff;
            if (toFiniteNumber(right.score, 0) !== toFiniteNumber(left.score, 0)) {
                return toFiniteNumber(right.score, 0) - toFiniteNumber(left.score, 0);
            }
            return getMemoryTimestamp(right, ['last_active_at', 'created_at', 'last_injected_at'])
                - getMemoryTimestamp(left, ['last_active_at', 'created_at', 'last_injected_at']);
        }).forEach(function appendStandalone(fragment) {
            if (result.length >= maxTotal) return;
            const memoryId = toTrimmedString(fragment.memory_id || fragment.id);
            if (memoryId && usedMemoryIds.has(memoryId)) return;
            result.push(fragment);
            if (memoryId) usedMemoryIds.add(memoryId);
        });

        eventAnchors.sort(function sortAnchors(left, right) {
            if (toFiniteNumber(right.score, 0) !== toFiniteNumber(left.score, 0)) {
                return toFiniteNumber(right.score, 0) - toFiniteNumber(left.score, 0);
            }
            return toFiniteNumber(right.importance, 0) - toFiniteNumber(left.importance, 0);
        }).forEach(function appendAnchor(fragment) {
            if (result.length >= maxTotal) return;
            const memoryId = toTrimmedString(fragment.memory_id || fragment.id);
            if (!memoryId || usedMemoryIds.has(memoryId)) return;
            if (!usedEventIds.has(toTrimmedString(fragment._eventId))) return;
            result.push(fragment);
            usedMemoryIds.add(memoryId);
        });

        return compressMixedRecallCandidatesByTokenBudget(result.slice(0, maxTotal), tokenBudget).slice(0, maxTotal);
    }

    /**
     * 生成“温记忆事件”冷却去重键，避免短时间反复注入同一事件。
     */
    function makeWarmEventRecallKey(userId, charId, eventId) {
        return `${toTrimmedString(userId)}::${toTrimmedString(charId)}::${toTrimmedString(eventId)}`;
    }

    function makeEventRecallCooldownLedgerKey(userId, charId, eventId) {
        return `${toTrimmedString(userId)}::${toTrimmedString(charId)}::${toTrimmedString(eventId)}`;
    }

    function getEventRecallCooldownLedgerEntry(userId, charId, eventId) {
        const key = makeEventRecallCooldownLedgerKey(userId, charId, eventId);
        const value = state.eventRecallCooldownLedger.get(key);
        return value && typeof value === 'object' ? value : null;
    }

    function deriveEventRecallCooldownMs(channel, priorityProfile) {
        const safeChannel = toTrimmedString(channel).toLowerCase();
        const safeProfile = priorityProfile && typeof priorityProfile === 'object'
            ? priorityProfile
            : {};
        const base = safeChannel === 'intrusive'
            ? INTRUSIVE_EVENT_RECALL_COOLDOWN_MS
            : safeChannel === 'ripple'
                ? RIPPLE_EVENT_ACTIVATION_COOLDOWN_MS
                : WARM_EVENT_RECALL_COOLDOWN_MS;
        let factor = 1;
        const bucket = toTrimmedString(safeProfile.priorityBucket).toLowerCase();
        if (bucket === 'conflict_attachment') {
            factor *= 0.58;
        } else if (bucket === 'open_loop') {
            factor *= 0.78;
        } else if (bucket === 'salience') {
            factor *= 0.92;
        } else {
            factor *= 1.08;
        }
        if (safeProfile.hasHighConflict) {
            factor *= safeChannel === 'intrusive' ? 0.78 : 0.88;
        }
        if (safeProfile.hasHighAttachment) {
            factor *= safeChannel === 'warm' ? 0.82 : 0.90;
        }
        if (safeProfile.hasLingeringGrievance || safeProfile.hasLingeringAttachment) {
            factor *= 0.86;
        }
        if (toFiniteNumber(safeProfile.priorityScore, 0) <= 0.34) {
            factor *= 1.18;
        }
        const minFactor = safeChannel === 'intrusive' ? 0.38 : 0.45;
        const maxFactor = 1.4;
        return Math.max(
            Math.floor(base * minFactor),
            Math.min(
                Math.floor(base * maxFactor),
                Math.round(base * clampNumber(factor, minFactor, maxFactor, 1))
            )
        );
    }

    function isEventRecallChannelCooling(userId, charId, eventId, channel, nowMs, priorityProfile) {
        const safeEventId = toTrimmedString(eventId);
        if (!safeEventId) return false;
        const now = Number.isFinite(nowMs) ? nowMs : Date.now();
        const ledger = getEventRecallCooldownLedgerEntry(userId, charId, safeEventId);
        const channelKey = toTrimmedString(channel).toLowerCase();
        const entry = ledger && ledger.channels && ledger.channels[channelKey]
            ? ledger.channels[channelKey]
            : null;
        const last = Number(entry && entry.at);
        if (!Number.isFinite(last) || last <= 0) return false;
        return (now - last) < deriveEventRecallCooldownMs(channelKey, priorityProfile);
    }

    function markEventRecallChannel(userId, charId, eventId, channel, payload) {
        const safeEventId = toTrimmedString(eventId);
        if (!safeEventId) return;
        const key = makeEventRecallCooldownLedgerKey(userId, charId, safeEventId);
        const safePayload = payload && typeof payload === 'object' ? payload : {};
        const channelKey = toTrimmedString(channel).toLowerCase() || 'warm';
        const now = Number.isFinite(safePayload.at) ? safePayload.at : Date.now();
        const existing = getEventRecallCooldownLedgerEntry(userId, charId, safeEventId) || {
            eventId: safeEventId,
            channels: {}
        };
        const next = Object.assign({}, existing, {
            eventId: safeEventId,
            channels: Object.assign({}, existing.channels, {
                [channelKey]: {
                    at: now,
                    priorityScore: clampNumber(safePayload.priorityScore, 0, 1, 0),
                    priorityBucket: toTrimmedString(safePayload.priorityBucket) || null,
                    reasonTags: Array.isArray(safePayload.reasonTags)
                        ? safePayload.reasonTags.map(toTrimmedString).filter(Boolean).slice(0, 8)
                        : []
                }
            })
        });
        state.eventRecallCooldownLedger.set(key, next);

        if (state.eventRecallCooldownLedger.size <= 240) return;
        state.eventRecallCooldownLedger.forEach(function prune(value, ledgerKey) {
            const channels = value && value.channels && typeof value.channels === 'object'
                ? value.channels
                : {};
            const latest = Object.keys(channels).reduce(function pickLatest(maxValue, channelName) {
                const channelEntry = channels[channelName];
                const at = Number(channelEntry && channelEntry.at);
                if (!Number.isFinite(at)) return maxValue;
                return !Number.isFinite(maxValue) || at > maxValue ? at : maxValue;
            }, Number.NaN);
            if (!Number.isFinite(latest) || (now - latest) > (12 * INTRUSIVE_EVENT_RECALL_COOLDOWN_MS)) {
                state.eventRecallCooldownLedger.delete(ledgerKey);
            }
        });
    }

    /**
     * 判断温记忆事件是否仍在注入冷却期。
     */
    function isWarmEventRecallCooling(userId, charId, eventId, nowMs, priorityProfile) {
        if (isEventRecallChannelCooling(userId, charId, eventId, 'warm', nowMs, priorityProfile)) {
            return true;
        }
        const key = makeWarmEventRecallKey(userId, charId, eventId);
        const now = Number.isFinite(nowMs) ? nowMs : Date.now();
        const last = Number(state.warmEventRecallHistory.get(key));
        if (!Number.isFinite(last) || last <= 0) return false;
        return (now - last) < deriveEventRecallCooldownMs('warm', priorityProfile);
    }

    /**
     * 记录温记忆事件本次已注入，供冷却判重使用。
     */
    function markWarmEventRecalled(userId, charId, eventId, nowMs, priorityProfile) {
        const key = makeWarmEventRecallKey(userId, charId, eventId);
        const now = Number.isFinite(nowMs) ? nowMs : Date.now();
        state.warmEventRecallHistory.set(key, now);
        markEventRecallChannel(userId, charId, eventId, 'warm', {
            at: now,
            priorityScore: toFiniteNumber(priorityProfile && priorityProfile.priorityScore, 0),
            priorityBucket: toTrimmedString(priorityProfile && priorityProfile.priorityBucket),
            reasonTags: Array.isArray(priorityProfile && priorityProfile.signalTags) ? priorityProfile.signalTags : []
        });

        // 轻量清理过期记录，避免会话长期运行时 map 无限增长。
        if (state.warmEventRecallHistory.size <= 200) return;
        state.warmEventRecallHistory.forEach(function prune(value, recallKey) {
            const timestamp = Number(value);
            if (!Number.isFinite(timestamp) || (now - timestamp) > (12 * WARM_EVENT_RECALL_COOLDOWN_MS)) {
                state.warmEventRecallHistory.delete(recallKey);
            }
        });
    }

    function makeIntrusiveEventRecallKey(userId, charId, eventId) {
        return `${toTrimmedString(userId)}::${toTrimmedString(charId)}::${toTrimmedString(eventId)}`;
    }

    function isIntrusiveEventRecallCooling(userId, charId, eventId, nowMs, priorityProfile) {
        if (isEventRecallChannelCooling(userId, charId, eventId, 'intrusive', nowMs, priorityProfile)) {
            return true;
        }
        const key = makeIntrusiveEventRecallKey(userId, charId, eventId);
        const now = Number.isFinite(nowMs) ? nowMs : Date.now();
        const last = Number(state.intrusiveEventRecallHistory.get(key));
        if (!Number.isFinite(last) || last <= 0) return false;
        return (now - last) < deriveEventRecallCooldownMs('intrusive', priorityProfile);
    }

    function markIntrusiveEventRecalled(userId, charId, eventId, nowMs, priorityProfile) {
        const key = makeIntrusiveEventRecallKey(userId, charId, eventId);
        const now = Number.isFinite(nowMs) ? nowMs : Date.now();
        state.intrusiveEventRecallHistory.set(key, now);
        markEventRecallChannel(userId, charId, eventId, 'intrusive', {
            at: now,
            priorityScore: toFiniteNumber(priorityProfile && priorityProfile.priorityScore, 0),
            priorityBucket: toTrimmedString(priorityProfile && priorityProfile.priorityBucket),
            reasonTags: Array.isArray(priorityProfile && priorityProfile.signalTags) ? priorityProfile.signalTags : []
        });

        if (state.intrusiveEventRecallHistory.size <= 200) return;
        state.intrusiveEventRecallHistory.forEach(function prune(value, recallKey) {
            const timestamp = Number(value);
            if (!Number.isFinite(timestamp) || (now - timestamp) > (12 * INTRUSIVE_EVENT_RECALL_COOLDOWN_MS)) {
                state.intrusiveEventRecallHistory.delete(recallKey);
            }
        });
    }

    function makeRippleEventActivationKey(userId, charId, groupKey) {
        return `${toTrimmedString(userId)}::${toTrimmedString(charId)}::${toTrimmedString(groupKey)}`;
    }

    function getRippleEventActivationRecord(userId, charId, groupKey) {
        const key = makeRippleEventActivationKey(userId, charId, groupKey);
        const value = state.rippleEventActivationHistory.get(key);
        return value && typeof value === 'object' ? value : null;
    }

    function deriveRippleReentrySuppressionMs(priorityProfile) {
        const bucket = toTrimmedString(priorityProfile && priorityProfile.priorityBucket).toLowerCase();
        if (bucket === 'conflict_attachment') {
            return Math.max(60 * 1000, Math.floor(RIPPLE_EVENT_REENTRY_SUPPRESSION_MS * 0.65));
        }
        if (bucket === 'open_loop') {
            return Math.max(90 * 1000, Math.floor(RIPPLE_EVENT_REENTRY_SUPPRESSION_MS * 0.75));
        }
        if (bucket === 'salience') {
            return Math.max(2 * 60 * 1000, Math.floor(RIPPLE_EVENT_REENTRY_SUPPRESSION_MS * 0.9));
        }
        return RIPPLE_EVENT_REENTRY_SUPPRESSION_MS;
    }

    function isRippleActivationReentrySuppressed(userId, charId, groupKey, nowMs, priorityProfile) {
        const now = Number.isFinite(nowMs) ? nowMs : Date.now();
        const record = getRippleEventActivationRecord(userId, charId, groupKey);
        const last = Number(record && record.at);
        if (!Number.isFinite(last) || last <= 0) return false;
        return (now - last) < deriveRippleReentrySuppressionMs(priorityProfile);
    }

    function makeRippleBatchActivationKey(userId, charId, batchId, groupKey) {
        return `${toTrimmedString(userId)}::${toTrimmedString(charId)}::${toTrimmedString(batchId)}::${toTrimmedString(groupKey)}`;
    }

    function hasRippleBatchActivation(userId, charId, batchId, groupKey, nowMs) {
        const safeBatchId = toTrimmedString(batchId);
        const safeGroupKey = toTrimmedString(groupKey);
        if (!safeBatchId || !safeGroupKey) return false;
        const key = makeRippleBatchActivationKey(userId, charId, safeBatchId, safeGroupKey);
        const value = state.rippleBatchActivationHistory.get(key);
        const last = Number(value && value.at);
        const now = Number.isFinite(nowMs) ? nowMs : Date.now();
        if (!Number.isFinite(last) || last <= 0) {
            state.rippleBatchActivationHistory.delete(key);
            return false;
        }
        if ((now - last) > RIPPLE_BATCH_HISTORY_TTL_MS) {
            state.rippleBatchActivationHistory.delete(key);
            return false;
        }
        return true;
    }

    function markRippleBatchActivation(userId, charId, batchId, groupKey, meta) {
        const safeBatchId = toTrimmedString(batchId);
        const safeGroupKey = toTrimmedString(groupKey);
        if (!safeBatchId || !safeGroupKey) return;
        const payload = meta && typeof meta === 'object' ? meta : {};
        const now = Number.isFinite(payload.at) ? payload.at : Date.now();
        const key = makeRippleBatchActivationKey(userId, charId, safeBatchId, safeGroupKey);
        state.rippleBatchActivationHistory.set(key, {
            at: now,
            eventId: toTrimmedString(payload.eventId) || null,
            seedMemoryId: toTrimmedString(payload.seedMemoryId) || null,
            status: toTrimmedString(payload.status) || 'attempted'
        });

        if (state.rippleBatchActivationHistory.size <= 400) return;
        state.rippleBatchActivationHistory.forEach(function prune(value, historyKey) {
            const timestamp = Number(value && value.at);
            if (!Number.isFinite(timestamp) || (now - timestamp) > RIPPLE_BATCH_HISTORY_TTL_MS) {
                state.rippleBatchActivationHistory.delete(historyKey);
            }
        });
    }

    function isRippleEventActivationCooling(userId, charId, groupKey, nowMs, eventId, priorityProfile) {
        if (toTrimmedString(eventId) && isEventRecallChannelCooling(userId, charId, eventId, 'ripple', nowMs, priorityProfile)) {
            return true;
        }
        const now = Number.isFinite(nowMs) ? nowMs : Date.now();
        const record = getRippleEventActivationRecord(userId, charId, groupKey);
        const last = Number(record && record.at);
        if (!Number.isFinite(last) || last <= 0) return false;
        return (now - last) < deriveEventRecallCooldownMs('ripple', priorityProfile);
    }

    function markRippleEventActivated(userId, charId, groupKey, meta) {
        const key = makeRippleEventActivationKey(userId, charId, groupKey);
        const payload = meta && typeof meta === 'object' ? meta : {};
        const now = Number.isFinite(payload.at) ? payload.at : Date.now();
        state.rippleEventActivationHistory.set(key, {
            at: now,
            priority: clampNumber(payload.priority, 0, 1, 0),
            eventId: toTrimmedString(payload.eventId) || null,
            seedMemoryId: toTrimmedString(payload.seedMemoryId) || null,
            affected: Math.max(0, Math.floor(toFiniteNumber(payload.affected, 0))),
            reasonTags: Array.isArray(payload.reasonTags)
                ? payload.reasonTags.map(toTrimmedString).filter(Boolean).slice(0, 8)
                : []
        });
        if (toTrimmedString(payload.eventId)) {
            markEventRecallChannel(userId, charId, payload.eventId, 'ripple', {
                at: now,
                priorityScore: clampNumber(payload.priority, 0, 1, 0),
                priorityBucket: toTrimmedString(payload.priorityBucket),
                reasonTags: Array.isArray(payload.reasonTags) ? payload.reasonTags : []
            });
        }

        if (state.rippleEventActivationHistory.size <= 200) return;
        state.rippleEventActivationHistory.forEach(function prune(value, recallKey) {
            const timestamp = Number(value && value.at);
            if (!Number.isFinite(timestamp) || (now - timestamp) > (12 * RIPPLE_EVENT_ACTIVATION_COOLDOWN_MS)) {
                state.rippleEventActivationHistory.delete(recallKey);
            }
        });
    }

    /**
     * 从候选事件中做加权抽样，权重使用 recall_score^2。
     */
    async function fetchRecentRippleCooldownLogMap(supabase, userId, charId, eventIds, options) {
        const safeUserId = toTrimmedString(userId);
        const safeCharId = toTrimmedString(charId);
        const ids = mergeUniqueIds(eventIds, [], 60);
        const optionSource = options && typeof options === 'object' ? options : {};
        const sinceMs = Number.isFinite(optionSource.sinceMs) ? optionSource.sinceMs : Number.NaN;
        const maxRows = Math.max(12, Math.min(360, Math.floor(toFiniteNumber(optionSource.maxRows, ids.length * 6))));
        if (!supabase || !safeUserId || !safeCharId || ids.length === 0 || !Number.isFinite(sinceMs) || sinceMs <= 0) {
            return new Map();
        }

        try {
            const sinceIso = new Date(sinceMs).toISOString();
            const responses = await Promise.all([
                supabase
                    .from('hippocampus_event_ripple_log')
                    .select('source_event_id,created_at')
                    .eq('user_id', safeUserId)
                    .eq('char_id', safeCharId)
                    .eq('ripple_kind', 'seed')
                    .in('source_event_id', ids)
                    .gte('created_at', sinceIso)
                    .order('created_at', { ascending: false })
                    .limit(maxRows),
                supabase
                    .from('hippocampus_event_ripple_log')
                    .select('target_event_id,created_at')
                    .eq('user_id', safeUserId)
                    .eq('char_id', safeCharId)
                    .eq('ripple_kind', 'target_event')
                    .in('target_event_id', ids)
                    .gte('created_at', sinceIso)
                    .order('created_at', { ascending: false })
                    .limit(maxRows)
            ]);
            const seedResponse = responses[0];
            const targetResponse = responses[1];
            if (seedResponse && seedResponse.error) {
                throw seedResponse.error;
            }
            if (targetResponse && targetResponse.error) {
                throw targetResponse.error;
            }
            const map = new Map();

            function rememberLatest(eventId, createdAt, kind) {
                const safeCreatedAt = toTrimmedString(createdAt);
                const createdAtMs = safeCreatedAt ? new Date(safeCreatedAt).getTime() : Number.NaN;
                if (!eventId || !Number.isFinite(createdAtMs)) return;
                const existing = map.get(eventId) || {
                    eventId: eventId,
                    createdAt: '',
                    createdAtMs: Number.NaN,
                    seedCreatedAt: '',
                    seedCreatedAtMs: Number.NaN,
                    targetCreatedAt: '',
                    targetCreatedAtMs: Number.NaN
                };
                if (kind === 'seed') {
                    if (!Number.isFinite(existing.seedCreatedAtMs) || createdAtMs > existing.seedCreatedAtMs) {
                        existing.seedCreatedAt = safeCreatedAt;
                        existing.seedCreatedAtMs = createdAtMs;
                    }
                } else if (kind === 'target_event') {
                    if (!Number.isFinite(existing.targetCreatedAtMs) || createdAtMs > existing.targetCreatedAtMs) {
                        existing.targetCreatedAt = safeCreatedAt;
                        existing.targetCreatedAtMs = createdAtMs;
                    }
                }
                if (!Number.isFinite(existing.createdAtMs) || createdAtMs > existing.createdAtMs) {
                    existing.createdAt = safeCreatedAt;
                    existing.createdAtMs = createdAtMs;
                }
                map.set(eventId, existing);
            }

            const seedRows = seedResponse && Array.isArray(seedResponse.data) ? seedResponse.data : [];
            seedRows.forEach(function rememberSeedRow(row) {
                rememberLatest(
                    toTrimmedString(row && row.source_event_id),
                    toTrimmedString(row && row.created_at),
                    'seed'
                );
            });
            const targetRows = targetResponse && Array.isArray(targetResponse.data) ? targetResponse.data : [];
            targetRows.forEach(function rememberTargetRow(row) {
                rememberLatest(
                    toTrimmedString(row && row.target_event_id),
                    toTrimmedString(row && row.created_at),
                    'target_event'
                );
            });
            return map;
        } catch (error) {
            console.warn('[海马体][搜索] 涟漪日志冷却查询失败，已回退到前端内存冷却。', error && error.message ? error.message : error);
            return new Map();
        }
    }

    function sampleWarmEventsByWeight(candidates, maxCount) {
        const pool = Array.isArray(candidates) ? candidates.filter(Boolean) : [];
        const count = Math.max(0, Math.min(pool.length, Math.floor(toFiniteNumber(maxCount, 0))));
        if (count <= 0) return [];

        const picked = [];
        while (picked.length < count && pool.length > 0) {
            let totalWeight = 0;
            pool.forEach(function sumWeight(item) {
                const score = clampNumber(item && item.recall_score, 0, 1, 0);
                totalWeight += Math.max(0.0001, score * score);
            });
            if (totalWeight <= 0) break;

            const roll = Math.random() * totalWeight;
            let cursor = 0;
            let pickedIndex = 0;
            for (let i = 0; i < pool.length; i += 1) {
                const score = clampNumber(pool[i] && pool[i].recall_score, 0, 1, 0);
                cursor += Math.max(0.0001, score * score);
                if (roll <= cursor) {
                    pickedIndex = i;
                    break;
                }
            }

            picked.push(pool[pickedIndex]);
            pool.splice(pickedIndex, 1);
        }

        return picked;
    }

    /**
     * 对 24h-72h 温记忆做事件级概率召回。
     */
    function buildWarmWindowEventRecall(memories, userId, charId, options) {
        const source = (Array.isArray(memories) ? memories : [])
            .map(normalizeMemoryRow)
            .filter(Boolean);
        if (source.length === 0) return [];

        const optionsSource = options && typeof options === 'object' ? options : {};
        const nowMs = Number.isFinite(optionsSource.nowMs) ? optionsSource.nowMs : Date.now();
        const maxWarmEvents = Math.max(0, Math.min(2, Math.floor(toFiniteNumber(optionsSource.maxWarmEvents, 2))));
        const maxWarmStandalone = Math.max(0, Math.min(2, Math.floor(toFiniteNumber(optionsSource.maxWarmStandalone, 1))));
        const maxTotal = Math.max(
            0,
            Math.min(
                6,
                Math.floor(toFiniteNumber(optionsSource.maxTotal, maxWarmEvents + maxWarmStandalone))
            )
        );
        if (maxTotal <= 0) return [];
        const semanticHint = clampNumber(
            toFiniteNumber(optionsSource.semanticHint, 0.5),
            0,
            1,
            0.5
        );
        const eventRecordMap = toEventRecordMap(optionsSource.eventRecords);

        const eventMap = new Map();
        const standalone = [];
        source.forEach(function splitByEvent(memory) {
            const eventId = getMemoryEventId(memory);
            if (!eventId) {
                standalone.push(memory);
                return;
            }
            if (!eventMap.has(eventId)) {
                eventMap.set(eventId, []);
            }
            eventMap.get(eventId).push(memory);
        });

        const warmEventCandidates = [];
        eventMap.forEach(function buildCandidate(group, eventId) {
            const eventCandidate = buildEventCandidateFromFragments(eventId, group, {
                detailPerEvent: 3,
                eventRecords: eventRecordMap,
                detailRows: optionsSource.detailRows
            });
            if (!eventCandidate) return;
            const priorityProfile = deriveEventPriorityProfile(
                eventCandidate,
                eventRecordMap.get(toTrimmedString(eventId))
            );

            const latestTs = getEventRecordTimestamp(
                eventRecordMap.get(toTrimmedString(eventId)),
                getMemoryTimestamp(eventCandidate, ['last_active_at', 'created_at', 'last_injected_at'])
            );
            if (!Number.isFinite(latestTs)) return;

            const ageHours = Math.max(24, (nowMs - latestTs) / (60 * 60 * 1000));
            const recencyScore = clampNumber(1 - ((ageHours - 24) / 48), 0, 1, 0);
            const emotionScore = clampNumber(
                (Math.abs(toFiniteNumber(eventCandidate.valence, 0)) * 0.55) + (clampNumber(eventCandidate.arousal, 0, 1, 0) * 0.45),
                0,
                1,
                0
            );
            const openLoopScore = eventCandidate.event_is_unresolved ? 1 : 0;
            const flashbulbScore = eventCandidate.event_is_flashbulb ? 1 : 0;
            const salienceScore = clampNumber(eventCandidate.event_salience_score, 0, 1, 0);
            const depthScore = clampNumber(
                eventCandidate.event_depth_score,
                0,
                1,
                toTrimmedString(eventCandidate.event_depth) === 'high'
                    ? 0.8
                    : (toTrimmedString(eventCandidate.event_depth) === 'medium' ? 0.5 : 0.2)
            );

            const recallScore = (
                (0.26 * semanticHint)
                + (0.20 * emotionScore)
                + (0.14 * openLoopScore)
                + (0.10 * salienceScore)
                + (0.08 * depthScore)
                + (0.06 * recencyScore)
                + (0.03 * flashbulbScore)
                + (0.07 * priorityProfile.conflictScore)
                + (0.04 * priorityProfile.attachmentScore)
                + (0.02 * (priorityProfile.priorityBucket === 'conflict_attachment' ? 1 : 0))
            );

            if (recallScore < 0.28) return;
            const cooling = isWarmEventRecallCooling(userId, charId, eventId, nowMs, priorityProfile);
            if (cooling && recallScore < 0.75) return;

            warmEventCandidates.push({
                event_id: eventId,
                recall_score: clampNumber(recallScore, 0, 1, 0),
                fragments: group,
                priority_bucket: priorityProfile.priorityBucket,
                signal_tags: priorityProfile.signalTags
            });
        });

        const sampledEvents = sampleWarmEventsByWeight(
            warmEventCandidates.sort(function sortByScore(left, right) {
                return clampNumber(right.recall_score, 0, 1, 0) - clampNumber(left.recall_score, 0, 1, 0);
            }),
            maxWarmEvents
        );

        const selectedRows = [];
        sampledEvents.forEach(function appendEventCandidate(item) {
            if (!item || !Array.isArray(item.fragments)) return;
            markWarmEventRecalled(userId, charId, item.event_id, nowMs, {
                priorityScore: item.recall_score,
                priorityBucket: item.priority_bucket,
                signalTags: item.signal_tags
            });
            selectedRows.push.apply(selectedRows, item.fragments);
        });

        standalone.sort(function sortStandalone(left, right) {
            const scoreDiff = toFiniteNumber(right.score, 0) - toFiniteNumber(left.score, 0);
            if (scoreDiff !== 0) return scoreDiff;
            return getMemoryTimestamp(right, ['last_active_at', 'created_at', 'last_injected_at'])
                - getMemoryTimestamp(left, ['last_active_at', 'created_at', 'last_injected_at']);
        }).slice(0, maxWarmStandalone).forEach(function appendStandalone(item) {
            selectedRows.push(item);
        });

        return buildMixedRecallCandidates(selectedRows, {
            source: 'recent_warm',
            maxTotal: maxTotal,
            detailPerEvent: 3,
            eventRecords: eventRecordMap,
            detailRows: optionsSource.detailRows
        });
    }

    /**
     * 近期召回分层策略：24h 强召回 + 24h-72h 概率召回。
     */
    function buildRecentWindowMixedRecall(memories, userId, charId, limit, options) {
        const source = (Array.isArray(memories) ? memories : [])
            .map(normalizeMemoryRow)
            .filter(Boolean);
        const optionsSource = options && typeof options === 'object' ? options : {};
        const directEventRows = (Array.isArray(optionsSource.directEventRows) ? optionsSource.directEventRows : [])
            .map(normalizeMemoryRow)
            .filter(Boolean);
        if (source.length === 0 && directEventRows.length === 0) return [];
        const eventRecordMap = toEventRecordMap(optionsSource.eventRecords);
        const detailRowMap = toMemoryRowMap(optionsSource.detailRows);
        const safeLimit = Math.max(1, Math.min(10, Math.floor(toFiniteNumber(limit, 5))));
        const nowMs = Number.isFinite(optionsSource.nowMs) ? optionsSource.nowMs : Date.now();
        const hotCutoff = nowMs - (24 * 60 * 60 * 1000);

        const hotRows = [];
        const warmRows = [];
        source.forEach(function splitByAge(item) {
            const ts = getMemoryTimestamp(item, ['last_active_at', 'created_at', 'last_injected_at']);
            if (!Number.isFinite(ts) || ts >= hotCutoff) {
                hotRows.push(item);
                return;
            }
            warmRows.push(item);
        });

        const reservedTailSlots = (warmRows.length > 0 || directEventRows.length > 0) ? 1 : 0;
        const hotBudget = Math.max(
            1,
            Math.min(
                safeLimit,
                Math.floor(
                    toFiniteNumber(
                        optionsSource.hotBudget,
                        Math.max(1, safeLimit - reservedTailSlots)
                    )
                )
            )
        );
        const hotMixed = buildMixedRecallCandidates(hotRows, {
            source: 'recent_hot',
            maxTotal: hotBudget,
            detailPerEvent: 4,
            eventRecords: eventRecordMap,
            detailRows: detailRowMap
        });

        const warmBudget = Math.max(0, safeLimit - hotMixed.length);
        const warmMixed = warmBudget > 0 && warmRows.length > 0
            ? buildWarmWindowEventRecall(warmRows, userId, charId, {
                nowMs: nowMs,
                maxWarmEvents: Math.min(2, warmBudget),
                maxWarmStandalone: Math.min(1, warmBudget),
                maxTotal: warmBudget,
                semanticHint: toFiniteNumber(optionsSource.semanticHint, 0.5),
                eventRecords: eventRecordMap,
                detailRows: detailRowMap
            })
            : [];

        return mergeFinalRecallCandidates(
            [hotMixed, warmMixed, directEventRows],
            {
                maxTotal: safeLimit,
                tokenBudget: optionsSource.tokenBudget
            }
        );
    }

    /**
     * 生成当前角色的限流键，避免不同用户角色互相干扰。
     */
    function makeWriteBucketKey(userId, charId) {
        return `${toTrimmedString(userId)}::${toTrimmedString(charId)}`;
    }

    /**
     * 清理限流窗口外的旧时间戳。
     */
    function pruneWriteTimestamps(key, now) {
        const existing = state.writeTimestamps.get(key) || [];
        const filtered = existing.filter(function keepRecent(timestamp) {
            return now - timestamp < WRITE_WINDOW_MS;
        });

        state.writeTimestamps.set(key, filtered);
        return filtered;
    }

    /**
     * 判断当前角色是否命中 10 分钟最多 2 条写入的限流规则。
     */
    function isWriteRateLimited(userId, charId) {
        const key = makeWriteBucketKey(userId, charId);
        const timestamps = pruneWriteTimestamps(key, Date.now());
        return timestamps.length >= WRITE_LIMIT;
    }

    /**
     * 在写入成功后登记一次新的时间戳。
     */
    function recordWriteTimestamp(userId, charId) {
        const key = makeWriteBucketKey(userId, charId);
        const now = Date.now();
        const timestamps = pruneWriteTimestamps(key, now);
        timestamps.push(now);
        state.writeTimestamps.set(key, timestamps);
    }

    /**
     * 合并两条同 ID 记忆，优先保留主记录，同时尽量补齐缺失字段。
     */
    function mergeMemoryFields(primary, fallback) {
        const master = primary && typeof primary === 'object' ? primary : {};
        const extra = fallback && typeof fallback === 'object' ? fallback : {};
        const merged = Object.assign({}, master);

        const textFields = [
            'content',
            'context_scope',
            'room_id',
            'surface_reason',
            'source_type',
            'source_ref'
        ];
        textFields.forEach(function fillTextField(field) {
            if (!toTrimmedString(merged[field]) && toTrimmedString(extra[field])) {
                merged[field] = extra[field];
            }
        });

        const timestampFields = ['created_at', 'last_active_at', 'last_injected_at'];
        timestampFields.forEach(function fillTimestampField(field) {
            if (!toTrimmedString(merged[field]) && toTrimmedString(extra[field])) {
                merged[field] = extra[field];
            }
        });

        if (!toTrimmedString(merged.memory_layer) && toTrimmedString(extra.memory_layer)) {
            merged.memory_layer = extra.memory_layer;
        }
        if (!merged.is_flashbulb && extra.is_flashbulb) {
            merged.is_flashbulb = true;
        }
        if (!merged.hit_by_sensory && extra.hit_by_sensory) {
            merged.hit_by_sensory = true;
        }

        if (merged.score === undefined || merged.score === null) {
            merged.score = toFiniteNumber(extra.score, 0);
        }

        const eventTextFields = [
            'event_id',
            'event_title',
            'event_summary',
            'event_status',
            'event_depth',
            'event_date',
            'continuation_key',
            'event_anchor_memory_id',
            'event_priority_bucket'
        ];
        eventTextFields.forEach(function fillEventField(field) {
            if (!toTrimmedString(merged[field]) && toTrimmedString(extra[field])) {
                merged[field] = extra[field];
            }
        });

        const eventNumberFields = [
            'event_fragment_count',
            'event_depth_score',
            'event_salience_score',
            'event_conflict_score',
            'event_attachment_score'
        ];
        eventNumberFields.forEach(function fillEventNumber(field) {
            const current = merged[field];
            if (current === undefined || current === null || Number.isNaN(Number(current))) {
                const incoming = extra[field];
                if (incoming !== undefined && incoming !== null && !Number.isNaN(Number(incoming))) {
                    merged[field] = toFiniteNumber(incoming, incoming);
                }
            }
        });

        if (!merged.event_is_unresolved && extra.event_is_unresolved) {
            merged.event_is_unresolved = true;
        }
        if (!merged.event_is_flashbulb && extra.event_is_flashbulb) {
            merged.event_is_flashbulb = true;
        }
        if (!Array.isArray(merged.event_detail_memories) && Array.isArray(extra.event_detail_memories)) {
            merged.event_detail_memories = extra.event_detail_memories.slice(0, 8);
        }
        if ((!Array.isArray(merged.event_detail_memory_ids) || merged.event_detail_memory_ids.length === 0) && Array.isArray(extra.event_detail_memory_ids)) {
            merged.event_detail_memory_ids = extra.event_detail_memory_ids.slice(0, 24);
        }
        if ((!Array.isArray(merged.event_flashbulb_memory_ids) || merged.event_flashbulb_memory_ids.length === 0) && Array.isArray(extra.event_flashbulb_memory_ids)) {
            merged.event_flashbulb_memory_ids = extra.event_flashbulb_memory_ids.slice(0, 24);
        }
        if ((!merged.event_signal_profile || typeof merged.event_signal_profile !== 'object') && extra.event_signal_profile && typeof extra.event_signal_profile === 'object') {
            merged.event_signal_profile = Object.assign({}, extra.event_signal_profile);
        }
        if ((!Array.isArray(merged.event_signal_tags) || merged.event_signal_tags.length === 0) && Array.isArray(extra.event_signal_tags)) {
            merged.event_signal_tags = extra.event_signal_tags.slice(0, 12);
        }

        const mergedMetadataSnapshot = normalizeMetadata(merged.metadata);
        const extraMetadataSnapshot = normalizeMetadata(extra.metadata);
        const mergedSourceMessageIds = mergeUniqueIds(
            mergeUniqueIds(
                normalizeEvidenceMessageIds(merged.source_message_ids, 24),
                normalizeEvidenceMessageIds(mergedMetadataSnapshot.source_message_ids, 24),
                24
            ),
            mergeUniqueIds(
                normalizeEvidenceMessageIds(extra.source_message_ids, 24),
                normalizeEvidenceMessageIds(extraMetadataSnapshot.source_message_ids, 24),
                24
            ),
            24
        );
        if (mergedSourceMessageIds.length > 0) {
            merged.source_message_ids = mergedSourceMessageIds;
        }

        const mergedSurfaceAliases = normalizeEvidenceAliases(
            []
                .concat(Array.isArray(merged.surface_aliases) ? merged.surface_aliases : [])
                .concat(Array.isArray(extra.surface_aliases) ? extra.surface_aliases : [])
                .concat(mergedMetadataSnapshot.surface_aliases || [])
                .concat(extraMetadataSnapshot.surface_aliases || []),
            12
        );
        if (mergedSurfaceAliases.length > 0) {
            merged.surface_aliases = mergedSurfaceAliases;
        }

        const mergedSourceTimeStart = mergeEvidenceTimeBoundary(
            mergeEvidenceTimeBoundary(
                merged.source_time_start,
                mergedMetadataSnapshot.source_time_start,
                'min'
            ),
            mergeEvidenceTimeBoundary(
                extra.source_time_start,
                extraMetadataSnapshot.source_time_start,
                'min'
            ),
            'min'
        );
        const mergedSourceTimeEnd = mergeEvidenceTimeBoundary(
            mergeEvidenceTimeBoundary(
                merged.source_time_end,
                mergedMetadataSnapshot.source_time_end,
                'max'
            ),
            mergeEvidenceTimeBoundary(
                extra.source_time_end,
                extraMetadataSnapshot.source_time_end,
                'max'
            ),
            'max'
        );
        if (mergedSourceTimeStart) {
            merged.source_time_start = mergedSourceTimeStart;
        }
        if (mergedSourceTimeEnd) {
            merged.source_time_end = mergedSourceTimeEnd;
        }
        const masterMetadata = mergedMetadataSnapshot;
        const extraMetadata = extraMetadataSnapshot;
        const mergedSignalTags = normalizeTriggerKeywords(
            []
                .concat(Array.isArray(merged.event_signal_tags) ? merged.event_signal_tags : [])
                .concat(Array.isArray(extra.event_signal_tags) ? extra.event_signal_tags : [])
                .concat(masterMetadata && Array.isArray(masterMetadata.event_signal_tags) ? masterMetadata.event_signal_tags : [])
                .concat(extraMetadata && Array.isArray(extraMetadata.event_signal_tags) ? extraMetadata.event_signal_tags : [])
        ).slice(0, 12);
        if (mergedSignalTags.length > 0) {
            merged.event_signal_tags = mergedSignalTags;
        }

        const mergedMetadata = Object.assign({}, extraMetadata, masterMetadata);
        const mergedKeywords = normalizeTriggerKeywords(
            []
                .concat(masterMetadata.trigger_keywords || [])
                .concat(extraMetadata.trigger_keywords || [])
        );
        if (mergedKeywords.length > 0) {
            mergedMetadata.trigger_keywords = mergedKeywords;
        }
        if (mergedSourceMessageIds.length > 0) {
            mergedMetadata.source_message_ids = mergedSourceMessageIds;
        }
        if (mergedSurfaceAliases.length > 0) {
            mergedMetadata.surface_aliases = mergedSurfaceAliases;
        }
        if (mergedSourceTimeStart) {
            mergedMetadata.source_time_start = mergedSourceTimeStart;
        }
        if (mergedSourceTimeEnd) {
            mergedMetadata.source_time_end = mergedSourceTimeEnd;
        }
        if (merged.event_signal_profile && typeof merged.event_signal_profile === 'object') {
            mergedMetadata.event_signal_profile = Object.assign({}, merged.event_signal_profile);
        } else if (extra.event_signal_profile && typeof extra.event_signal_profile === 'object') {
            mergedMetadata.event_signal_profile = Object.assign({}, extra.event_signal_profile);
        }
        if (mergedSignalTags.length > 0) {
            mergedMetadata.event_signal_tags = mergedSignalTags;
        }
        merged.metadata = mergedMetadata;

        return merged;
    }

    function mergeFinalRecallCandidates(groups, options) {
        const optionsSource = options && typeof options === 'object' ? options : {};
        const maxTotal = Math.max(1, Math.min(12, Math.floor(toFiniteNumber(optionsSource.maxTotal, 6))));
        const tokenBudget = Math.max(
            240,
            Math.floor(
                toFiniteNumber(
                    optionsSource.tokenBudget,
                    state.settings && state.settings.memoryPromptTokenBudget !== undefined
                        ? state.settings.memoryPromptTokenBudget
                        : 10000
                )
            )
        );
        const sourceGroups = Array.isArray(groups) ? groups : [];
        const mergedMap = new Map();

        sourceGroups.forEach(function consumeGroup(rows) {
            (Array.isArray(rows) ? rows : []).forEach(function consumeRow(row) {
                const normalized = normalizeMemoryRow(row);
                const key = toTrimmedString(
                    normalized && (
                        normalized.event_id
                        || normalized.memory_id
                        || normalized.id
                    )
                );
                if (!normalized || !key) return;
                if (!mergedMap.has(key)) {
                    mergedMap.set(key, normalized);
                    return;
                }

                const existing = mergedMap.get(key);
                const incomingPriority = getRecallHitRank(normalized) + (toFiniteNumber(normalized.score, 0) * 2);
                const existingPriority = getRecallHitRank(existing) + (toFiniteNumber(existing.score, 0) * 2);
                const incomingDetails = Array.isArray(normalized.event_detail_memories) ? normalized.event_detail_memories.length : 0;
                const existingDetails = Array.isArray(existing.event_detail_memories) ? existing.event_detail_memories.length : 0;
                const preferIncoming = incomingPriority > existingPriority
                    || (
                        incomingPriority === existingPriority
                        && incomingDetails > existingDetails
                    )
                    || (
                        incomingPriority === existingPriority
                        && incomingDetails === existingDetails
                        && getMemoryTimestamp(normalized, ['last_active_at', 'created_at', 'last_injected_at'])
                            > getMemoryTimestamp(existing, ['last_active_at', 'created_at', 'last_injected_at'])
                    );
                const primary = preferIncoming ? normalized : existing;
                const fallback = preferIncoming ? existing : normalized;
                mergedMap.set(key, mergeMemoryFields(primary, fallback));
            });
        });

        const sorted = Array.from(mergedMap.values()).sort(function sortRows(left, right) {
            const hitRankDiff = getRecallHitRank(right) - getRecallHitRank(left);
            if (hitRankDiff !== 0) return hitRankDiff;
            if (toFiniteNumber(right && right.score, 0) !== toFiniteNumber(left && left.score, 0)) {
                return toFiniteNumber(right && right.score, 0) - toFiniteNumber(left && left.score, 0);
            }
            return getMemoryTimestamp(right, ['last_active_at', 'created_at', 'last_injected_at'])
                - getMemoryTimestamp(left, ['last_active_at', 'created_at', 'last_injected_at']);
        });

        return compressMixedRecallCandidatesByTokenBudget(sorted.slice(0, maxTotal), tokenBudget).slice(0, maxTotal);
    }

    /**
     * 将“关键词/向量”命中模式转换成可排序的优先级。
     */
    function getRecallHitRank(memory) {
        const mode = toTrimmedString(memory && memory.recall_hit_mode);
        if (mode === 'time_window' || mode === 'time_window_event' || mode === 'time_window_fragment') return 4;
        if (mode === 'keyword+vector') return 3;
        if (mode === 'vector') return 2;
        if (mode === 'keyword') return 1;
        return 0;
    }

    /**
     * 规范化事件记录查找表，兼容 Map / 数组 / 普通对象。
     */
    function toEventRecordMap(source) {
        if (source instanceof Map) return source;

        const map = new Map();
        if (Array.isArray(source)) {
            source.forEach(function pushRow(row) {
                const normalized = normalizeEventRecordRow(row);
                if (!normalized || isRetiredEventRecord(normalized)) return;
                map.set(normalized.id, normalized);
            });
            return map;
        }

        if (source && typeof source === 'object') {
            Object.keys(source).forEach(function pushKey(key) {
                const normalized = normalizeEventRecordRow(source[key]);
                if (!normalized || isRetiredEventRecord(normalized)) return;
                map.set(normalized.id, normalized);
            });
        }
        return map;
    }

    /**
     * 规范化记忆行查找表，兼容 Map / 数组 / 普通对象。
     */
    function toMemoryRowMap(source) {
        if (source instanceof Map) return source;

        const map = new Map();
        if (Array.isArray(source)) {
            source.forEach(function pushRow(row) {
                const normalized = normalizeMemoryRow(row);
                if (!normalized || !normalized.memory_id) return;
                map.set(normalized.memory_id, normalized);
            });
            return map;
        }

        if (source && typeof source === 'object') {
            Object.keys(source).forEach(function pushKey(key) {
                const normalized = normalizeMemoryRow(source[key]);
                if (!normalized || !normalized.memory_id) return;
                map.set(normalized.memory_id, normalized);
            });
        }
        return map;
    }

    /**
     * 读取事件记录的代表时间，用于排序与 warm recall 打分。
     */
    function getEventRecordTimestamp(eventRecord, fallbackTs) {
        const source = eventRecord && typeof eventRecord === 'object' ? eventRecord : {};
        const candidates = [
            source.last_related_at,
            source.end_at,
            source.start_at,
            source.event_date,
            source.updated_at
        ];
        for (let i = 0; i < candidates.length; i += 1) {
            const ts = parseTimestampMs(candidates[i]);
            if (Number.isFinite(ts)) return ts;
        }
        return Number.isFinite(fallbackTs) ? fallbackTs : Number.NaN;
    }

    /**
     * 按真实事件记录中的锚点 / 细节顺序排列碎片，命中更强的碎片仍会优先靠前。
     */
    function sortEventFragmentsForRecord(fragments, eventRecord) {
        const list = Array.isArray(fragments) ? fragments.filter(Boolean) : [];
        if (list.length <= 1) return list.slice();

        const safeRecord = eventRecord && typeof eventRecord === 'object' ? eventRecord : null;
        const orderMap = new Map();
        const anchorId = toTrimmedString(safeRecord && safeRecord.anchor_memory_id);
        if (anchorId) orderMap.set(anchorId, -1);
        const detailIds = Array.isArray(safeRecord && safeRecord.detail_memory_ids) ? safeRecord.detail_memory_ids : [];
        detailIds.forEach(function registerDetail(id, index) {
            const safeId = toTrimmedString(id);
            if (!safeId || orderMap.has(safeId)) return;
            orderMap.set(safeId, index);
        });
        const flashbulbIds = Array.isArray(safeRecord && safeRecord.event_flashbulb_memory_ids)
            ? safeRecord.event_flashbulb_memory_ids
            : [];
        flashbulbIds.forEach(function registerFlashbulb(id, index) {
            const safeId = toTrimmedString(id);
            if (!safeId || orderMap.has(safeId)) return;
            orderMap.set(safeId, detailIds.length + index + 1);
        });

        return list.slice().sort(function sortFragments(left, right) {
            const leftId = toTrimmedString(left && (left.memory_id || left.id));
            const rightId = toTrimmedString(right && (right.memory_id || right.id));
            const leftOrder = orderMap.has(leftId) ? orderMap.get(leftId) : Number.POSITIVE_INFINITY;
            const rightOrder = orderMap.has(rightId) ? orderMap.get(rightId) : Number.POSITIVE_INFINITY;
            if (leftOrder !== rightOrder) return leftOrder - rightOrder;

            const rankDiff = getRecallHitRank(right) - getRecallHitRank(left);
            if (rankDiff !== 0) return rankDiff;
            if (toFiniteNumber(right.score, 0) !== toFiniteNumber(left.score, 0)) {
                return toFiniteNumber(right.score, 0) - toFiniteNumber(left.score, 0);
            }
            if (toFiniteNumber(right.importance, 0) !== toFiniteNumber(left.importance, 0)) {
                return toFiniteNumber(right.importance, 0) - toFiniteNumber(left.importance, 0);
            }
            return getMemoryTimestamp(right, ['last_active_at', 'created_at', 'last_injected_at'])
                - getMemoryTimestamp(left, ['last_active_at', 'created_at', 'last_injected_at']);
        });
    }

    function collectEventFragmentReferenceIds(eventRecord, options) {
        const safeRecord = eventRecord && typeof eventRecord === 'object' ? eventRecord : null;
        if (!safeRecord || isRetiredEventRecord(safeRecord)) return [];

        const optionsSource = options && typeof options === 'object' ? options : {};
        const memberLimit = Math.max(0, Math.min(96, Math.floor(toFiniteNumber(optionsSource.memberLimit, 12))));
        const totalLimit = Math.max(
            1,
            Math.min(
                96,
                Math.floor(
                    toFiniteNumber(
                        optionsSource.totalLimit,
                        Math.max(8, Math.min(24, memberLimit + 6))
                    )
                )
            )
        );
        const detailLimit = Math.max(0, Math.min(24, Math.floor(toFiniteNumber(optionsSource.detailLimit, Math.min(12, totalLimit)))));
        const flashbulbLimit = Math.max(0, Math.min(24, Math.floor(toFiniteNumber(optionsSource.flashbulbLimit, Math.min(8, totalLimit)))));
        const includeMembers = optionsSource.includeMembers !== false;
        const orderedIds = [];

        const anchorId = toTrimmedString(safeRecord.anchor_memory_id);
        if (anchorId) orderedIds.push(anchorId);
        mergeUniqueIds(
            Array.isArray(safeRecord.detail_memory_ids) ? safeRecord.detail_memory_ids : [],
            [],
            detailLimit
        ).forEach(function pushDetail(id) {
            orderedIds.push(id);
        });
        mergeUniqueIds(
            Array.isArray(safeRecord.event_flashbulb_memory_ids) ? safeRecord.event_flashbulb_memory_ids : [],
            [],
            flashbulbLimit
        ).forEach(function pushFlashbulb(id) {
            orderedIds.push(id);
        });
        if (includeMembers && memberLimit > 0) {
            mergeUniqueIds(
                Array.isArray(safeRecord.memory_ids) ? safeRecord.memory_ids : [],
                [],
                memberLimit
            ).forEach(function pushMember(id) {
                orderedIds.push(id);
            });
        }
        return mergeUniqueIds(orderedIds, [], totalLimit);
    }

    function buildEventDetailIdSet(eventMemory) {
        const safeEvent = eventMemory && typeof eventMemory === 'object' ? eventMemory : {};
        return new Set(
            (Array.isArray(safeEvent.event_detail_memory_ids) ? safeEvent.event_detail_memory_ids : [])
                .concat(Array.isArray(safeEvent.detail_memory_ids) ? safeEvent.detail_memory_ids : [])
                .map(toTrimmedString)
                .filter(Boolean)
        );
    }

    function buildEventFlashbulbIdSet(eventMemory) {
        const safeEvent = eventMemory && typeof eventMemory === 'object' ? eventMemory : {};
        return new Set(
            (Array.isArray(safeEvent.event_flashbulb_memory_ids) ? safeEvent.event_flashbulb_memory_ids : [])
                .map(toTrimmedString)
                .filter(Boolean)
        );
    }

    function buildEventDetailRoleTags(detail, eventMemory) {
        const safeDetail = detail && typeof detail === 'object' ? detail : {};
        const safeEvent = eventMemory && typeof eventMemory === 'object' ? eventMemory : {};
        const memoryId = toTrimmedString(safeDetail.id || safeDetail.memory_id);
        const anchorId = toTrimmedString(
            safeDetail.event_anchor_memory_id
            || safeEvent.event_anchor_memory_id
            || safeEvent.anchor_memory_id
            || safeEvent.memory_id
            || safeEvent.id
        );
        const detailIdSet = buildEventDetailIdSet(safeEvent);
        const flashbulbIdSet = buildEventFlashbulbIdSet(safeEvent);
        const recallMode = toTrimmedString(safeDetail.recall_hit_mode).toLowerCase();
        const currentHit = !!(
            safeDetail._isIntrusive
            || safeDetail._hitByKeyword
            || safeDetail._hitByVector
            || safeDetail._hitBySensory
            || recallMode === 'keyword+vector'
            || recallMode === 'keyword'
            || recallMode === 'vector'
        );
        const flashbulb = !!(
            safeDetail.is_flashbulb
            || safeDetail.event_is_flashbulb
            || (!!memoryId && flashbulbIdSet.has(memoryId))
        );
        const eventOpenLoop = !!(
            safeEvent.event_is_unresolved
            || safeEvent.is_unresolved
            || toTrimmedString(safeEvent.event_status || safeEvent.status).toLowerCase() === 'open'
        );
        const selfOpenLoop = !!(
            safeDetail.is_open_loop
            || safeDetail.event_is_unresolved
            || safeDetail.is_unresolved
            || safeDetail.resolved === false
            || toTrimmedString(safeDetail.event_status || safeDetail.status).toLowerCase() === 'open'
        );
        const anchor = !!(
            safeDetail.is_anchor
            || (!!memoryId && !!anchorId && memoryId === anchorId)
        );
        const tags = [];
        if (anchor) tags.push('anchor');
        if (currentHit) tags.push('current_hit');
        if (flashbulb) tags.push('flashbulb');
        if (selfOpenLoop || (eventOpenLoop && (anchor || currentHit || flashbulb))) tags.push('open_loop');
        if (!!memoryId && detailIdSet.has(memoryId) && !anchor) tags.push('detail');
        if (tags.length === 0) tags.push('member');
        return Array.from(new Set(tags));
    }

    function scoreEventDetailPriority(detail, eventMemory) {
        const safeDetail = detail && typeof detail === 'object' ? detail : {};
        const roleTags = Array.isArray(safeDetail.detail_role_tags) && safeDetail.detail_role_tags.length > 0
            ? safeDetail.detail_role_tags
            : buildEventDetailRoleTags(safeDetail, eventMemory);
        let score = 0;
        if (roleTags.includes('anchor')) score += 120;
        if (roleTags.includes('current_hit')) score += 86;
        if (roleTags.includes('flashbulb')) score += 58;
        if (roleTags.includes('open_loop')) score += 34;
        if (roleTags.includes('detail')) score += 14;
        if (roleTags.includes('member')) score += 4;
        score += clampNumber(toFiniteNumber(safeDetail.importance, 0) / 10, 0, 1, 0) * 16;
        score += clampNumber(
            toFiniteNumber(
                safeDetail.adjustedScore !== undefined ? safeDetail.adjustedScore : safeDetail.score,
                0
            ),
            0,
            1,
            0
        ) * 12;
        score += clampNumber(toFiniteNumber(safeDetail.activation_count, 0) / 6, 0, 1, 0) * 5;
        const recencyTs = getMemoryTimestamp(safeDetail, ['last_active_at', 'created_at', 'last_injected_at']);
        if (Number.isFinite(recencyTs)) {
            const ageHours = Math.max(0, (Date.now() - recencyTs) / (60 * 60 * 1000));
            score += clampNumber(1 - (ageHours / (14 * 24)), 0, 1, 0) * 4;
        }
        return score;
    }

    function annotateEventDetailMemory(detail, eventMemory, orderIndex) {
        const safeDetail = detail && typeof detail === 'object' ? detail : {};
        const safeOrder = Number.isFinite(orderIndex) ? orderIndex : 0;
        const roleTags = buildEventDetailRoleTags(safeDetail, eventMemory);
        return Object.assign({}, safeDetail, {
            is_anchor: !!safeDetail.is_anchor || roleTags.includes('anchor'),
            is_current_hit: !!safeDetail.is_current_hit || roleTags.includes('current_hit'),
            is_flashbulb: !!safeDetail.is_flashbulb || roleTags.includes('flashbulb'),
            is_open_loop: !!safeDetail.is_open_loop || roleTags.includes('open_loop'),
            detail_role: roleTags[0] || 'member',
            detail_role_tags: roleTags,
            detail_order: safeDetail.detail_order !== undefined
                ? Math.max(0, Math.floor(toFiniteNumber(safeDetail.detail_order, safeOrder)))
                : safeOrder,
            detail_priority: Number(scoreEventDetailPriority(safeDetail, eventMemory).toFixed(3))
        });
    }

    function sortEventDetailMemoriesByPriority(details, eventMemory) {
        const source = Array.isArray(details) ? details.filter(Boolean) : [];
        if (source.length === 0) return [];
        return source
            .map(function annotateDetail(detail, index) {
                return annotateEventDetailMemory(detail, eventMemory, index);
            })
            .sort(function sortDetails(left, right) {
                const priorityDiff = toFiniteNumber(right && right.detail_priority, 0) - toFiniteNumber(left && left.detail_priority, 0);
                if (priorityDiff !== 0) return priorityDiff;
                const leftTs = getMemoryTimestamp(left, ['last_active_at', 'created_at', 'last_injected_at']);
                const rightTs = getMemoryTimestamp(right, ['last_active_at', 'created_at', 'last_injected_at']);
                if (Number.isFinite(rightTs) && Number.isFinite(leftTs) && rightTs !== leftTs) {
                    return rightTs - leftTs;
                }
                return toFiniteNumber(left && left.detail_order, 0) - toFiniteNumber(right && right.detail_order, 0);
            });
    }

    function collectEventDetailFocusTags(details, limit) {
        const source = Array.isArray(details) ? details : [];
        const maxCount = Math.max(1, Math.min(8, Math.floor(toFiniteNumber(limit, 4))));
        const tags = [];
        source.forEach(function collectTags(detail) {
            const roleTags = Array.isArray(detail && detail.detail_role_tags) ? detail.detail_role_tags : [];
            roleTags.forEach(function pushRole(role) {
                const safeRole = toTrimmedString(role);
                if (!safeRole || tags.includes(safeRole)) return;
                tags.push(safeRole);
            });
        });
        return tags.slice(0, maxCount);
    }

    function formatEventDetailRoleLabel(detail) {
        const roleTags = Array.isArray(detail && detail.detail_role_tags) ? detail.detail_role_tags : [];
        if (roleTags.includes('anchor')) return '锚点';
        if (roleTags.includes('current_hit')) return '当前触发';
        if (roleTags.includes('flashbulb')) return '强印象';
        if (roleTags.includes('open_loop')) return '挂念点';
        if (roleTags.includes('detail')) return '细节';
        return '片段';
    }

    function applyEventCompressionMetadata(eventMemory, originalEventMemory, options) {
        const safeEvent = eventMemory && typeof eventMemory === 'object' ? eventMemory : {};
        const originalEvent = originalEventMemory && typeof originalEventMemory === 'object' ? originalEventMemory : safeEvent;
        const optionsSource = options && typeof options === 'object' ? options : {};
        const detailMemories = sortEventDetailMemoriesByPriority(
            Array.isArray(safeEvent.event_detail_memories) ? safeEvent.event_detail_memories : [],
            originalEvent
        );
        const originalDetailCount = Array.isArray(originalEvent.event_detail_memories) ? originalEvent.event_detail_memories.length : 0;
        const keptTags = collectEventDetailFocusTags(detailMemories, 6);
        const metadata = Object.assign({}, normalizeMetadata(safeEvent.metadata));
        metadata.event_detail_original_count = originalDetailCount;
        metadata.event_detail_kept_count = detailMemories.length;
        metadata.event_detail_focus_tags = keptTags;
        if (optionsSource.bucket) metadata.event_budget_bucket = toTrimmedString(optionsSource.bucket);
        if (optionsSource.compressionLevel) metadata.event_compression_level = toTrimmedString(optionsSource.compressionLevel);
        return Object.assign({}, safeEvent, {
            event_detail_memories: detailMemories,
            event_detail_focus_tags: keptTags,
            event_detail_original_count: originalDetailCount,
            event_detail_kept_count: detailMemories.length,
            event_budget_bucket: toTrimmedString(optionsSource.bucket) || toTrimmedString(safeEvent.event_budget_bucket) || null,
            event_compression_level: toTrimmedString(optionsSource.compressionLevel) || toTrimmedString(safeEvent.event_compression_level) || null,
            metadata: metadata
        });
    }

    /**
     * 根据真实事件记录优先挑选锚点和 detail，避免继续完全依赖碎片临时拼装。
     */
    function pickEventDetailMemories(fragments, eventRecord, maxCount) {
        const ordered = sortEventFragmentsForRecord(fragments, eventRecord);
        const safeRecord = eventRecord && typeof eventRecord === 'object' ? eventRecord : null;
        const safeMax = Math.max(1, Math.floor(toFiniteNumber(maxCount, 3)));
        const detailIds = Array.isArray(safeRecord && safeRecord.detail_memory_ids) ? safeRecord.detail_memory_ids : [];
        const detailIdSet = new Set(detailIds.map(toTrimmedString).filter(Boolean));
        const anchorId = toTrimmedString(safeRecord && safeRecord.anchor_memory_id);
        const picked = [];
        const used = new Set();

        function appendFragment(fragment) {
            const memoryId = toTrimmedString(fragment && (fragment.memory_id || fragment.id));
            const content = toTrimmedString(fragment && fragment.content);
            if (!memoryId || !content || used.has(memoryId)) return;
            const metadata = normalizeMetadata(fragment && fragment.metadata);
            used.add(memoryId);
            picked.push({
                id: memoryId,
                memory_id: memoryId,
                content: content,
                importance: toFiniteNumber(fragment && fragment.importance, 0),
                created_at: fragment && fragment.created_at ? fragment.created_at : null,
                last_active_at: fragment && fragment.last_active_at ? fragment.last_active_at : null,
                last_injected_at: fragment && fragment.last_injected_at ? fragment.last_injected_at : null,
                is_anchor: !!anchorId && memoryId === anchorId,
                resolved: fragment && fragment.resolved,
                valence: clampNumber(fragment && fragment.valence, -1, 1, 0),
                arousal: clampNumber(fragment && fragment.arousal, 0, 1, 0),
                activation_count: toFiniteNumber(fragment && fragment.activation_count, 0),
                _hitByKeyword: !!(fragment && fragment._hitByKeyword),
                _hitByVector: !!(fragment && fragment._hitByVector),
                _hitBySensory: !!(fragment && fragment._hitBySensory),
                _isIntrusive: !!(fragment && fragment._isIntrusive),
                recall_hit_mode: toTrimmedString(fragment && fragment.recall_hit_mode) || '',
                is_flashbulb: !!(
                    fragment && (
                        fragment.is_flashbulb
                        || fragment.event_is_flashbulb
                        || readFirstDefined(metadata, ['is_flashbulb', 'event_is_flashbulb'], false)
                    )
                ),
                memory_layer: normalizeMemoryLayerName(
                    fragment && fragment.memory_layer
                    || metadata.memory_layer
                    || metadata.layer
                ) || 'buffer',
                score: toFiniteNumber(
                    fragment && (fragment.adjustedScore !== undefined ? fragment.adjustedScore : fragment.score),
                    toFiniteNumber(fragment && fragment.importance, 0) / 10
                )
            });
        }

        if (anchorId) {
            const anchorFragment = ordered.find(function findAnchor(item) {
                return toTrimmedString(item && (item.memory_id || item.id)) === anchorId;
            });
            if (anchorFragment) appendFragment(anchorFragment);
        }

        ordered.forEach(function appendPreferred(fragment) {
            const memoryId = toTrimmedString(fragment && (fragment.memory_id || fragment.id));
            if (detailIdSet.size > 0 && !detailIdSet.has(memoryId) && memoryId !== anchorId) return;
            appendFragment(fragment);
        });

        ordered.forEach(function appendFallback(fragment) {
            appendFragment(fragment);
        });

        return sortEventDetailMemoriesByPriority(picked, safeRecord).slice(0, safeMax);
    }

    function resolveEventHydrationExpansion(eventRecord, fragments, options) {
        const safeRecord = eventRecord && typeof eventRecord === 'object' ? eventRecord : {};
        const optionsSource = options && typeof options === 'object' ? options : {};
        const metadata = normalizeMetadata(safeRecord.metadata);
        const memoryIds = (Array.isArray(safeRecord.memory_ids) ? safeRecord.memory_ids : [])
            .map(toTrimmedString)
            .filter(Boolean);
        const detailIds = (Array.isArray(safeRecord.detail_memory_ids) ? safeRecord.detail_memory_ids : [])
            .map(toTrimmedString)
            .filter(Boolean);
        const flashbulbIds = (Array.isArray(safeRecord.event_flashbulb_memory_ids) ? safeRecord.event_flashbulb_memory_ids : [])
            .map(toTrimmedString)
            .filter(Boolean);
        const fragmentCount = Math.max(
            memoryIds.length,
            Math.floor(toFiniteNumber(safeRecord.fragment_count, 0)),
            Array.isArray(fragments) ? fragments.length : 0
        );
        const depth = toTrimmedString(safeRecord.depth || safeRecord.event_depth).toLowerCase();
        const unresolved = !!(
            safeRecord.is_unresolved
            || safeRecord.event_is_unresolved
            || toTrimmedString(safeRecord.status || safeRecord.event_status).toLowerCase() === 'open'
        );
        const flashbulb = !!(
            safeRecord.event_is_flashbulb
            || (Array.isArray(safeRecord.event_flashbulb_memory_ids) && safeRecord.event_flashbulb_memory_ids.length > 0)
        );
        const salienceScore = clampNumber(
            safeRecord.salience_score !== undefined ? safeRecord.salience_score : metadata.event_salience_score,
            0,
            1,
            0
        );
        const directHydration = !!(
            optionsSource.preferCompleteEventMembers
            || readFirstDefined(
                metadata,
                [
                    'hydration_prefer_complete_event',
                    'recall_prefer_complete_event',
                    'hydration_direct_search_event',
                    'hydration_direct_surface_event',
                    'hydration_direct_recent_event'
                ],
                false
            )
        );
        const explicitLimit = Math.max(
            0,
            Math.floor(
                toFiniteNumber(
                    optionsSource.memberLimit !== undefined
                        ? optionsSource.memberLimit
                        : readFirstDefined(metadata, ['recall_full_member_limit', 'hydration_full_member_limit'], 0),
                    0
                )
            )
        );
        const currentHitCount = (Array.isArray(fragments) ? fragments : []).reduce(function countCurrentHit(total, item) {
            const normalized = normalizeMemoryRow(item);
            const recallMode = toTrimmedString(normalized && normalized.recall_hit_mode).toLowerCase();
            const hit = !!(
                normalized
                && (
                    normalized._hitByKeyword
                    || normalized._hitByVector
                    || normalized._hitBySensory
                    || normalized._isIntrusive
                    || recallMode === 'keyword'
                    || recallMode === 'vector'
                    || recallMode === 'keyword+vector'
                )
            );
            return total + (hit ? 1 : 0);
        }, 0);
        const currentHit = currentHitCount > 0;
        const keyDetailCount = mergeUniqueIds(detailIds, flashbulbIds, 48).length;

        let memberLimit = explicitLimit;
        const reasonTags = [];
        const appliedTags = [];

        function rememberReason(tag, applied) {
            if (!tag) return;
            if (!reasonTags.includes(tag)) {
                reasonTags.push(tag);
            }
            if (applied && !appliedTags.includes(tag)) {
                appliedTags.push(tag);
            }
        }

        function widen(limit, tag) {
            const safeLimit = Math.max(0, Math.floor(toFiniteNumber(limit, 0)));
            rememberReason(tag, false);
            if (safeLimit <= memberLimit) return;
            memberLimit = safeLimit;
            rememberReason(tag, true);
        }

        if (explicitLimit > 0) rememberReason('manual_limit', true);
        if (directHydration) rememberReason('direct_event', false);
        if (currentHitCount >= 2) rememberReason('multi_hit', false);
        if (keyDetailCount >= 3) rememberReason('dense_key_details', false);
        if (currentHit) widen(Math.min(8, Math.max(3, Math.min(fragmentCount, 6))), 'current_hit');
        if (unresolved) widen(Math.min(6, Math.max(2, Math.min(fragmentCount, 4))), 'open_loop');
        if (flashbulb) widen(Math.min(5, Math.max(2, Math.min(fragmentCount, 3))), 'flashbulb');
        if (depth === 'high') {
            widen(Math.min(5, Math.max(2, Math.min(fragmentCount, 3))), 'high_depth');
        } else if (depth === 'medium') {
            widen(Math.min(4, Math.max(1, Math.min(fragmentCount, 2))), 'medium_depth');
        }

        if ((currentHit || unresolved || flashbulb || depth === 'high') && fragmentCount > 0 && fragmentCount <= 6) {
            widen(Math.min(6, fragmentCount), 'small_event');
        }
        if (
            directHydration
            && fragmentCount > 0
            && fragmentCount <= 12
            && (currentHit || unresolved || flashbulb || depth === 'high' || salienceScore >= 0.72)
        ) {
            widen(fragmentCount, 'direct_complete_event');
        }
        if (currentHitCount >= 2 && fragmentCount > 0 && fragmentCount <= 10) {
            widen(fragmentCount, 'multi_hit_full');
        }
        if (
            keyDetailCount >= 3
            && fragmentCount > 0
            && fragmentCount <= 8
            && (unresolved || flashbulb || depth === 'high')
        ) {
            widen(fragmentCount, 'dense_detail_full');
        }

        return {
            memberLimit: memberLimit,
            totalLimit: Math.min(
                24,
                Math.max(
                    8,
                    memberLimit + 8,
                    fragmentCount > 0 ? Math.min(fragmentCount + 4, 24) : 0
                )
            ),
            reasonTags: reasonTags,
            appliedTags: appliedTags,
            currentHitCount: currentHitCount,
            directHydration: directHydration,
            fullCoverage: fragmentCount > 0 && memberLimit >= fragmentCount,
            keyDetailCount: keyDetailCount
        };
    }

    /**
     * 优先使用真实事件表字段构建事件候选；若缺失则回退到碎片聚合估算。
     */
    function buildEventRecordSnapshotFragment(eventRecord, fragments, options) {
        const safeRecord = eventRecord && typeof eventRecord === 'object' ? eventRecord : null;
        if (!safeRecord || isRetiredEventRecord(safeRecord)) return null;

        const optionsSource = options && typeof options === 'object' ? options : {};
        const metadata = Object.assign({}, normalizeMetadata(safeRecord.metadata));
        const fallbackIdCandidates = [];
        const anchorId = toTrimmedString(safeRecord.anchor_memory_id);
        if (anchorId) fallbackIdCandidates.push(anchorId);

        [
            Array.isArray(safeRecord.detail_memory_ids) ? safeRecord.detail_memory_ids : [],
            Array.isArray(safeRecord.event_flashbulb_memory_ids) ? safeRecord.event_flashbulb_memory_ids : [],
            Array.isArray(safeRecord.memory_ids) ? safeRecord.memory_ids : []
        ].forEach(function appendIds(list) {
            list.forEach(function appendId(value) {
                const safeId = toTrimmedString(value);
                if (!safeId) return;
                fallbackIdCandidates.push(safeId);
            });
        });
        (Array.isArray(fragments) ? fragments : []).forEach(function appendFragmentId(fragment) {
            const safeId = toTrimmedString(fragment && (fragment.memory_id || fragment.id));
            if (!safeId) return;
            fallbackIdCandidates.push(safeId);
        });

        const memoryId = mergeUniqueIds(fallbackIdCandidates, [], 12)[0] || '';
        if (!memoryId) return null;

        const summary = toTrimmedString(safeRecord.summary);
        const title = toTrimmedString(safeRecord.title);
        const depth = toTrimmedString(safeRecord.depth).toLowerCase() || 'low';
        const depthScore = clampNumber(
            safeRecord.depth_score,
            0,
            1,
            depth === 'high' ? 1 : (depth === 'medium' ? 0.68 : 0.36)
        );
        const salienceScore = clampNumber(safeRecord.salience_score, 0, 1, 0.4);
        const unresolved = !!(
            safeRecord.is_unresolved
            || toTrimmedString(safeRecord.status).toLowerCase() === 'open'
        );
        const flashbulb = !!(
            safeRecord.event_is_flashbulb
            || (Array.isArray(safeRecord.event_flashbulb_memory_ids) && safeRecord.event_flashbulb_memory_ids.length > 0)
            || readFirstDefined(metadata, ['event_is_flashbulb', 'is_flashbulb'], false)
        );
        const eventTs = getEventRecordTimestamp(safeRecord);
        const eventIso = Number.isFinite(eventTs) ? new Date(eventTs).toISOString() : null;
        const eventLayer = normalizeMemoryLayerName(
            safeRecord.event_memory_layer
            || safeRecord.memory_layer
            || metadata.event_memory_layer
            || metadata.memory_layer
            || metadata.layer
        ) || 'buffer';
        const importance = clampNumber(
            readFirstDefined(metadata, ['event_importance', 'importance'], (
                ((salienceScore * 0.5) + (depthScore * 0.24) + (unresolved ? 0.14 : 0) + (flashbulb ? 0.12 : 0)) * 10
            )),
            0,
            10,
            4
        );
        const snapshotScore = clampNumber(
            0.16
            + (salienceScore * 0.34)
            + (depthScore * 0.18)
            + (clampNumber(importance / 10, 0, 1, 0.4) * 0.08)
            + (unresolved ? 0.12 : 0)
            + (flashbulb ? 0.08 : 0),
            0,
            1,
            0.34
        );
        const snapshotReason = toTrimmedString(optionsSource.reason) || 'event_record_snapshot';
        const snapshotMetadata = Object.assign({}, metadata, {
            event_record_snapshot: true,
            event_sparse_snapshot: true,
            event_snapshot_reason: snapshotReason,
            event_title: title || toTrimmedString(metadata.event_title),
            event_summary: summary || toTrimmedString(metadata.event_summary),
            event_depth: depth,
            event_depth_score: depthScore,
            event_salience_score: salienceScore,
            event_is_unresolved: unresolved,
            event_is_flashbulb: flashbulb,
            event_anchor_memory_id: anchorId || memoryId
        });

        return normalizeMemoryRow({
            id: memoryId,
            memory_id: memoryId,
            user_id: safeRecord.user_id || null,
            char_id: safeRecord.char_id || null,
            room_id: safeRecord.room_id || null,
            context_scope: safeRecord.context_scope || (safeRecord.room_id ? 'room' : 'private'),
            content: summary || title || `记忆事件(${toTrimmedString(safeRecord.id).slice(0, 8)})`,
            valence: clampNumber(readFirstDefined(metadata, ['event_valence', 'valence'], 0), -1, 1, 0),
            arousal: clampNumber(readFirstDefined(metadata, ['event_arousal', 'arousal'], 0), 0, 1, 0),
            importance: importance,
            activation_count: Math.max(0, Math.floor(toFiniteNumber(readFirstDefined(metadata, ['activation_count'], 0), 0))),
            resolved: !unresolved,
            memory_layer: eventLayer,
            is_flashbulb: flashbulb,
            score: snapshotScore,
            adjustedScore: snapshotScore,
            recall_hit_mode: '',
            created_at: eventIso,
            last_active_at: eventIso,
            last_injected_at: null,
            source_type: 'event_record_snapshot',
            source_ref: toTrimmedString(safeRecord.id),
            event_id: toTrimmedString(safeRecord.id),
            event_title: title,
            event_summary: summary,
            event_status: toTrimmedString(safeRecord.status) || (unresolved ? 'open' : 'closed'),
            event_date: toTrimmedString(safeRecord.event_date) || null,
            event_is_unresolved: unresolved,
            event_depth: depth,
            event_depth_score: depthScore,
            event_salience_score: salienceScore,
            event_conflict_score: clampNumber(safeRecord.event_conflict_score, 0, 1, 0),
            event_attachment_score: clampNumber(safeRecord.event_attachment_score, 0, 1, 0),
            continuation_key: toTrimmedString(safeRecord.continuation_key) || null,
            event_fragment_count: Math.max(
                Array.isArray(safeRecord.memory_ids) ? safeRecord.memory_ids.length : 0,
                Math.floor(toFiniteNumber(safeRecord.fragment_count, 0))
            ),
            event_memory_layer: eventLayer,
            event_anchor_memory_id: anchorId || memoryId,
            event_detail_memory_ids: mergeUniqueIds(
                Array.isArray(safeRecord.detail_memory_ids) ? safeRecord.detail_memory_ids : [],
                [],
                24
            ),
            event_flashbulb_memory_ids: mergeUniqueIds(
                Array.isArray(safeRecord.event_flashbulb_memory_ids) ? safeRecord.event_flashbulb_memory_ids : [],
                [],
                24
            ),
            event_is_flashbulb: flashbulb,
            source_message_ids: Array.isArray(safeRecord.source_message_ids) ? safeRecord.source_message_ids : [],
            source_time_start: toTrimmedString(safeRecord.source_time_start) || null,
            source_time_end: toTrimmedString(safeRecord.source_time_end) || null,
            surface_aliases: Array.isArray(safeRecord.surface_aliases) ? safeRecord.surface_aliases : [],
            event_signal_profile: safeRecord.event_signal_profile && typeof safeRecord.event_signal_profile === 'object'
                ? Object.assign({}, safeRecord.event_signal_profile)
                : null,
            event_signal_tags: Array.isArray(safeRecord.event_signal_tags) ? safeRecord.event_signal_tags.slice(0, 12) : [],
            event_priority_bucket: toTrimmedString(safeRecord.event_priority_bucket) || null,
            metadata: snapshotMetadata
        });
    }

    function buildEventCandidateFromFragments(eventId, fragments, options) {
        const optionsSource = options && typeof options === 'object' ? options : {};
        const safeEventId = toTrimmedString(eventId);
        if (!(optionsSource.eventRecords instanceof Map) && optionsSource.eventRecords) {
            const rawSource = Array.isArray(optionsSource.eventRecords)
                ? optionsSource.eventRecords
                : Object.keys(optionsSource.eventRecords).map(function mapKey(key) {
                    return optionsSource.eventRecords[key];
                });
            const hasRetiredMatch = rawSource.some(function hasRetiredRecord(row) {
                const normalized = normalizeEventRecordRow(row);
                return !!(normalized && normalized.id === safeEventId && isRetiredEventRecord(normalized));
            });
            if (hasRetiredMatch) return null;
        }
        const eventRecordMap = toEventRecordMap(optionsSource.eventRecords);
        const detailRowMap = toMemoryRowMap(optionsSource.detailRows);
        const eventRecord = eventRecordMap.get(safeEventId) || null;
        if (eventRecord && isRetiredEventRecord(eventRecord)) return null;
        const eventMetadata = normalizeMetadata(eventRecord && eventRecord.metadata);
        const hydrationProfile = resolveEventHydrationExpansion(eventRecord, fragments, optionsSource);
        const expandedMemberLimit = Math.max(0, hydrationProfile.memberLimit);
        const referencedIds = collectEventFragmentReferenceIds(eventRecord, {
            memberLimit: expandedMemberLimit,
            totalLimit: hydrationProfile.totalLimit,
            detailLimit: 12,
            flashbulbLimit: 8
        });
        const fragmentUniverseMap = new Map();
        (Array.isArray(fragments) ? fragments : []).forEach(function putHitFragment(item) {
            const normalized = normalizeMemoryRow(item);
            const memoryId = toTrimmedString(normalized && (normalized.memory_id || normalized.id));
            if (!normalized || !memoryId) return;
            fragmentUniverseMap.set(memoryId, normalized);
        });
        referencedIds.forEach(function putReferencedFragment(id) {
            const safeId = toTrimmedString(id);
            if (!safeId || fragmentUniverseMap.has(safeId)) return;
            const referencedRow = detailRowMap.get(safeId);
            if (!referencedRow) return;
            fragmentUniverseMap.set(safeId, referencedRow);
        });
        const loadedMemberCount = fragmentUniverseMap.size;
        const loadedReferenceIds = referencedIds.filter(function hasLoadedReference(id) {
            return !!(id && fragmentUniverseMap.has(toTrimmedString(id)));
        });
        const missingReferenceIds = referencedIds.filter(function hasMissingReference(id) {
            return !!id && !fragmentUniverseMap.has(toTrimmedString(id));
        });
        const anchorId = toTrimmedString(eventRecord && eventRecord.anchor_memory_id);
        let snapshotInjected = false;
        const snapshotFragment = buildEventRecordSnapshotFragment(eventRecord, Array.from(fragmentUniverseMap.values()), {
            reason: loadedMemberCount > 0 ? 'missing_anchor' : 'record_only'
        });
        const snapshotMemoryId = toTrimmedString(snapshotFragment && (snapshotFragment.memory_id || snapshotFragment.id));
        if (
            snapshotFragment
            && snapshotMemoryId
            && !fragmentUniverseMap.has(snapshotMemoryId)
            && (
                loadedMemberCount === 0
                || (!!anchorId && snapshotMemoryId === anchorId && !loadedReferenceIds.includes(anchorId))
            )
        ) {
            fragmentUniverseMap.set(snapshotMemoryId, snapshotFragment);
            snapshotInjected = true;
        }

        const ordered = sortEventFragmentsForRecord(Array.from(fragmentUniverseMap.values()), eventRecord);
        if (ordered.length === 0) return null;

        const recallSignals = collectEventRecallSignals(ordered);
        const intrusive = ordered.some(function hasIntrusiveSeed(item) {
            return !!(item && item._isIntrusive);
        });
        const eventLayerInfo = deriveEventMainLayer(ordered, eventRecord);
        const profile = estimateEventProfile(ordered);
        const anchor = ordered.find(function findAnchor(item) {
            return toTrimmedString(item && (item.memory_id || item.id)) === anchorId;
        }) || ordered[0];
        const anchorMemoryId = toTrimmedString(anchor && (anchor.memory_id || anchor.id));
        if (!anchorMemoryId) return null;

        const safeDepth = toTrimmedString(eventRecord && eventRecord.depth || anchor.event_depth || profile.depth).toLowerCase() || 'low';
        const depthScore = clampNumber(
            eventRecord && eventRecord.depth_score !== undefined && eventRecord.depth_score !== null
                ? eventRecord.depth_score
                : profile.depthScore,
            0,
            1,
            safeDepth === 'high' ? 1 : (safeDepth === 'medium' ? 0.68 : 0.36)
        );
        const unresolved = eventRecord
            ? (!!eventRecord.is_unresolved || toTrimmedString(eventRecord.status) === 'open')
            : profile.unresolved;
        const salienceScore = clampNumber(
            eventRecord && eventRecord.salience_score !== undefined && eventRecord.salience_score !== null
                ? eventRecord.salience_score
                : profile.salienceScore,
            0,
            1,
            0
        );
        const flashbulbInfo = deriveEventFlashbulbState(ordered, eventRecord);
        const detailCount = Math.max(
            2,
            Math.min(
                flashbulbInfo.isFlashbulb ? 6 : 5,
                Math.floor(toFiniteNumber(optionsSource.detailPerEvent, 3))
                    + (flashbulbInfo.isFlashbulb ? 1 : 0)
                    + (expandedMemberLimit > 0 ? 1 : 0)
            )
        );
        const detailMemories = pickEventDetailMemories(ordered, eventRecord, detailCount);
        const detailFocusTags = collectEventDetailFocusTags(detailMemories, 6);
        const fallbackSummary = buildEventSummaryFromFragments(ordered);
        const summary = toTrimmedString(eventRecord && eventRecord.summary)
            || toTrimmedString(anchor && anchor.event_summary)
            || fallbackSummary
            || toTrimmedString(anchor && anchor.content);
        const title = toTrimmedString(eventRecord && eventRecord.title)
            || toTrimmedString(anchor && anchor.event_title)
            || `记忆事件(${toTrimmedString(eventId).slice(0, 8)})`;
        const fallbackTs = getMemoryTimestamp(anchor, ['last_active_at', 'created_at', 'last_injected_at']);
        const eventTs = getEventRecordTimestamp(eventRecord, fallbackTs);
        const anchorScore = toFiniteNumber(anchor && anchor.score, 0);
        const eventFragmentCount = Math.max(
            Array.isArray(eventRecord && eventRecord.memory_ids) ? eventRecord.memory_ids.length : ordered.length,
            Math.floor(toFiniteNumber(eventRecord && eventRecord.fragment_count, ordered.length))
        );
        const candidateSignalSource = Object.assign({}, anchor, {
            event_id: safeEventId,
            event_title: title,
            event_summary: summary,
            event_depth: safeDepth,
            event_depth_score: depthScore,
            event_salience_score: salienceScore,
            event_is_unresolved: unresolved,
            event_is_flashbulb: flashbulbInfo.isFlashbulb,
            event_status: toTrimmedString(eventRecord && eventRecord.status || anchor.event_status) || (unresolved ? 'open' : 'closed'),
            event_fragment_count: eventFragmentCount,
            event_memory_layer: eventLayerInfo.layer,
            event_detail_memories: detailMemories,
            event_detail_memory_ids: detailMemories.map(function mapDetailId(item) {
                return toTrimmedString(item && (item.id || item.memory_id));
            }).filter(Boolean),
            valence: profile.valence,
            arousal: profile.arousal,
            importance: Math.max(profile.importance, toFiniteNumber(anchor && anchor.importance, 0)),
            metadata: Object.assign({}, eventMetadata)
        });
        const priorityProfile = deriveEventPriorityProfile(candidateSignalSource, eventRecord);
        const eventScore = Math.min(
            1,
            Math.max(
                anchorScore,
                (profile.score * 0.32)
                    + (salienceScore * 0.18)
                    + (depthScore * 0.10)
                    + (unresolved ? 0.10 : 0)
                    + (anchorScore * 0.16)
                    + (flashbulbInfo.isFlashbulb ? 0.06 : 0)
                    + (priorityProfile.conflictScore * 0.14)
                    + (priorityProfile.attachmentScore * 0.10)
                    + (priorityProfile.priorityScore * 0.08)
                    + (priorityProfile.priorityBucket === 'conflict_attachment' ? 0.08 : 0)
                    + (priorityProfile.priorityBucket === 'open_loop' ? 0.04 : 0)
            )
        );
        const recallHitMode = recallSignals.recallHitMode
            || toTrimmedString(anchor && anchor.recall_hit_mode)
            || '';
        const sourceEvidence = collectSourceEvidenceMetadata(ordered, eventMetadata);
        const finalEventMetadata = Object.assign(
            {},
            normalizeMetadata(anchor.metadata),
            eventMetadata,
            {
                event_id: toTrimmedString(eventId),
                event_title: title,
                event_summary: summary,
                event_depth: safeDepth,
                event_fragment_count: eventFragmentCount,
                event_is_flashbulb: flashbulbInfo.isFlashbulb,
                event_flashbulb_memory_ids: flashbulbInfo.memoryIds,
                event_signal_profile: priorityProfile.signalProfile,
                event_signal_tags: priorityProfile.signalTags,
                event_priority_bucket: priorityProfile.priorityBucket,
                event_conflict_score: priorityProfile.conflictScore,
                event_attachment_score: priorityProfile.attachmentScore,
                event_memory_layer: eventLayerInfo.layer,
                event_layer_mixed: eventLayerInfo.mixed,
                event_layer_distribution: eventLayerInfo.distribution,
                event_loaded_member_count: loadedMemberCount,
                event_sparse_snapshot_used: snapshotInjected,
                event_anchor_loaded: !anchorId || loadedReferenceIds.includes(anchorId),
                event_hydration_expanded: expandedMemberLimit > 0,
                event_hydration_full_member_limit: expandedMemberLimit > 0 ? expandedMemberLimit : null,
                event_hydration_reason_tags: hydrationProfile.reasonTags,
                event_hydration_applied_tags: hydrationProfile.appliedTags,
                event_hydration_current_hit_count: Math.max(0, Math.floor(toFiniteNumber(hydrationProfile.currentHitCount, 0))),
                event_hydration_direct_mode: !!hydrationProfile.directHydration,
                event_hydration_full_coverage: !!hydrationProfile.fullCoverage,
                event_hydration_key_detail_count: Math.max(0, Math.floor(toFiniteNumber(hydrationProfile.keyDetailCount, 0))),
                event_reference_count: referencedIds.length,
                event_missing_reference_ids: missingReferenceIds,
                event_missing_reference_count: missingReferenceIds.length,
                event_hydration_coverage_ratio: referencedIds.length > 0
                    ? Number((loadedReferenceIds.length / referencedIds.length).toFixed(3))
                    : 1,
                event_detail_focus_tags: detailFocusTags,
                event_detail_original_count: detailMemories.length,
                event_detail_kept_count: detailMemories.length
            }
        );
        if (sourceEvidence.source_message_ids.length > 0) {
            finalEventMetadata.source_message_ids = sourceEvidence.source_message_ids;
        }
        if (sourceEvidence.surface_aliases.length > 0) {
            finalEventMetadata.surface_aliases = sourceEvidence.surface_aliases;
        }
        if (sourceEvidence.source_time_start) {
            finalEventMetadata.source_time_start = sourceEvidence.source_time_start;
        }
        if (sourceEvidence.source_time_end) {
            finalEventMetadata.source_time_end = sourceEvidence.source_time_end;
        }
        if (recallSignals.triggerKeywords.length > 0) {
            finalEventMetadata.trigger_keywords = recallSignals.triggerKeywords;
        }
        if (recallSignals.sensoryAnchors.length > 0) {
            finalEventMetadata.sensory_anchors = recallSignals.sensoryAnchors;
        }
        if (recallSignals.hitKeyword) {
            finalEventMetadata.hit_keyword = recallSignals.hitKeyword;
        }
        if (recallSignals.hitSensoryAnchor) {
            finalEventMetadata.event_sensory_anchor = recallSignals.hitSensoryAnchor;
        }

        return {
            id: anchorMemoryId,
            memory_id: anchorMemoryId,
            user_id: toTrimmedString(eventRecord && eventRecord.user_id) || toTrimmedString(anchor && anchor.user_id) || null,
            char_id: toTrimmedString(eventRecord && eventRecord.char_id) || toTrimmedString(anchor && anchor.char_id) || null,
            is_event_cluster: true,
            event_id: toTrimmedString(eventId),
            event_title: title,
            event_summary: summary,
            event_depth: safeDepth,
            event_depth_score: depthScore,
            event_salience_score: salienceScore,
            event_conflict_score: priorityProfile.conflictScore,
            event_attachment_score: priorityProfile.attachmentScore,
            event_is_unresolved: unresolved,
            event_is_flashbulb: flashbulbInfo.isFlashbulb,
            event_status: toTrimmedString(eventRecord && eventRecord.status || anchor.event_status) || (unresolved ? 'open' : 'closed'),
            event_fragment_count: Math.max(
                Array.isArray(eventRecord && eventRecord.memory_ids) ? eventRecord.memory_ids.length : ordered.length,
                Math.floor(toFiniteNumber(eventRecord && eventRecord.fragment_count, ordered.length))
            ),
            event_anchor_memory_id: toTrimmedString(eventRecord && eventRecord.anchor_memory_id) || anchorMemoryId,
            event_detail_memory_ids: mergeUniqueIds(
                Array.isArray(eventRecord && eventRecord.detail_memory_ids) ? eventRecord.detail_memory_ids : [],
                detailMemories.map(function mapDetail(item) { return item.id; }),
                24
            ),
            event_flashbulb_memory_ids: flashbulbInfo.memoryIds,
            event_detail_memories: detailMemories,
            event_detail_focus_tags: detailFocusTags,
            event_detail_original_count: detailMemories.length,
            event_detail_kept_count: detailMemories.length,
            event_loaded_member_count: loadedMemberCount,
            event_sparse_snapshot_used: snapshotInjected,
            event_anchor_loaded: !anchorId || loadedReferenceIds.includes(anchorId),
            event_hydration_expanded: expandedMemberLimit > 0,
            event_hydration_reason_tags: hydrationProfile.reasonTags,
            event_hydration_applied_tags: hydrationProfile.appliedTags,
            event_hydration_current_hit_count: Math.max(0, Math.floor(toFiniteNumber(hydrationProfile.currentHitCount, 0))),
            event_hydration_direct_mode: !!hydrationProfile.directHydration,
            event_hydration_full_coverage: !!hydrationProfile.fullCoverage,
            event_hydration_key_detail_count: Math.max(0, Math.floor(toFiniteNumber(hydrationProfile.keyDetailCount, 0))),
            event_reference_count: referencedIds.length,
            event_missing_reference_ids: missingReferenceIds,
            event_missing_reference_count: missingReferenceIds.length,
            event_hydration_coverage_ratio: referencedIds.length > 0
                ? Number((loadedReferenceIds.length / referencedIds.length).toFixed(3))
                : 1,
            source_message_ids: sourceEvidence.source_message_ids,
            source_time_start: sourceEvidence.source_time_start || null,
            source_time_end: sourceEvidence.source_time_end || null,
            surface_aliases: sourceEvidence.surface_aliases,
            event_date: toTrimmedString(eventRecord && eventRecord.event_date)
                || toTrimmedString(anchor && anchor.event_date)
                || null,
            continuation_key: toTrimmedString(eventRecord && eventRecord.continuation_key)
                || toTrimmedString(anchor && anchor.continuation_key)
                || null,
            event_signal_profile: priorityProfile.signalProfile,
            event_signal_tags: priorityProfile.signalTags,
            event_priority_bucket: priorityProfile.priorityBucket,
            context_scope: toTrimmedString(eventRecord && eventRecord.context_scope)
                || anchor.context_scope,
            room_id: toTrimmedString(eventRecord && eventRecord.room_id)
                || anchor.room_id,
            content: summary || toTrimmedString(anchor && anchor.content),
            valence: profile.valence,
            arousal: profile.arousal,
            importance: Math.max(profile.importance, toFiniteNumber(anchor && anchor.importance, 0)),
            memory_layer: eventLayerInfo.layer,
            is_flashbulb: flashbulbInfo.isFlashbulb,
            event_memory_layer: eventLayerInfo.layer,
            event_layer_mixed: eventLayerInfo.mixed,
            score: eventScore,
            recall_hit_mode: recallHitMode,
            event_sensory_anchor: recallSignals.hitSensoryAnchor || (recallSignals.sensoryAnchors[0] || '') || null,
            _hitByKeyword: recallSignals.keywordHit,
            _hitByVector: recallSignals.vectorHit,
            _hitBySensory: recallSignals.sensoryHit,
            _hitKeyword: recallSignals.hitKeyword || (recallSignals.triggerKeywords[0] || ''),
            _hitSensoryAnchor: recallSignals.hitSensoryAnchor || (recallSignals.sensoryAnchors[0] || ''),
            _isIntrusive: intrusive,
            created_at: Number.isFinite(eventTs) ? new Date(eventTs).toISOString() : (anchor.created_at || null),
            last_active_at: Number.isFinite(eventTs) ? new Date(eventTs).toISOString() : (anchor.last_active_at || anchor.created_at || null),
            last_injected_at: anchor.last_injected_at || null,
            source_type: 'event_cluster',
            source_ref: toTrimmedString(eventId),
            metadata: finalEventMetadata
        };
    }

    /**
     * 对搜索结果按 memory_id 去重，并把“关键词+向量双命中”提升到更高优先级。
     */
    function mergeSearchResults(keywordRows, vectorRows) {
        const merged = new Map();

        /**
         * 把一条记录并入指定通道，并记录命中来源和通道分数。
         */
        function mergeByChannel(row, channel) {
            const normalized = normalizeMemoryRow(row);
            if (!normalized || !normalized.memory_id) return;

            const id = normalized.memory_id;
            const existing = merged.get(id);

            if (!existing) {
                merged.set(id, Object.assign({}, normalized, {
                    _keyword_hit: channel === 'keyword',
                    _vector_hit: channel === 'vector',
                    _keyword_score: channel === 'keyword' ? toFiniteNumber(normalized.score, 0) : Number.NEGATIVE_INFINITY,
                    _vector_score: channel === 'vector' ? toFiniteNumber(normalized.score, 0) : Number.NEGATIVE_INFINITY
                }));
                return;
            }

            const nextKeywordHit = existing._keyword_hit || channel === 'keyword';
            const nextVectorHit = existing._vector_hit || channel === 'vector';
            const nextKeywordScore = channel === 'keyword'
                ? Math.max(toFiniteNumber(existing._keyword_score, Number.NEGATIVE_INFINITY), toFiniteNumber(normalized.score, 0))
                : toFiniteNumber(existing._keyword_score, Number.NEGATIVE_INFINITY);
            const nextVectorScore = channel === 'vector'
                ? Math.max(toFiniteNumber(existing._vector_score, Number.NEGATIVE_INFINITY), toFiniteNumber(normalized.score, 0))
                : toFiniteNumber(existing._vector_score, Number.NEGATIVE_INFINITY);

            const preferIncoming = toFiniteNumber(normalized.score, 0) > toFiniteNumber(existing.score, 0);
            const primary = preferIncoming ? normalized : existing;
            const fallback = preferIncoming ? existing : normalized;
            const combined = mergeMemoryFields(primary, fallback);

            merged.set(id, Object.assign({}, combined, {
                _keyword_hit: nextKeywordHit,
                _vector_hit: nextVectorHit,
                _keyword_score: nextKeywordScore,
                _vector_score: nextVectorScore
            }));
        }

        (Array.isArray(keywordRows) ? keywordRows : []).forEach(function forEachKeywordRow(row) {
            mergeByChannel(row, 'keyword');
        });
        (Array.isArray(vectorRows) ? vectorRows : []).forEach(function forEachVectorRow(row) {
            mergeByChannel(row, 'vector');
        });

        return Array.from(merged.values())
            .map(function mapMergedMemory(memory) {
                const keywordHit = !!memory._keyword_hit;
                const vectorHit = !!memory._vector_hit;
                const hitMode = keywordHit && vectorHit
                    ? 'keyword+vector'
                    : (vectorHit ? 'vector' : 'keyword');
                // 双命中加一点排序权重，让“关键词+语义都命中”的结果优先浮现。
                const weightedScore = toFiniteNumber(memory.score, 0) + (keywordHit && vectorHit ? 0.12 : 0);

                const normalized = Object.assign({}, memory, {
                    recall_hit_mode: hitMode,
                    score: weightedScore,
                    hybrid_rank_score: weightedScore,
                    keyword_score: Number.isFinite(memory._keyword_score) && memory._keyword_score > Number.NEGATIVE_INFINITY
                        ? memory._keyword_score
                        : null,
                    vector_score: Number.isFinite(memory._vector_score) && memory._vector_score > Number.NEGATIVE_INFINITY
                        ? memory._vector_score
                        : null
                });

                delete normalized._keyword_hit;
                delete normalized._vector_hit;
                delete normalized._keyword_score;
                delete normalized._vector_score;
                return normalized;
            })
            .sort(function sortByScore(a, b) {
                const hitRankDiff = getRecallHitRank(b) - getRecallHitRank(a);
                if (hitRankDiff !== 0) return hitRankDiff;
                if (b.score !== a.score) return b.score - a.score;
                const aTime = getMemoryTimestamp(a, ['last_active_at', 'created_at', 'last_injected_at']);
                const bTime = getMemoryTimestamp(b, ['last_active_at', 'created_at', 'last_injected_at']);
                if (!Number.isFinite(aTime) && !Number.isFinite(bTime)) return 0;
                if (!Number.isFinite(aTime)) return 1;
                if (!Number.isFinite(bTime)) return -1;
                return bTime - aTime;
            })
            .slice(0, state.settings && state.settings.enableEventMixedRecall ? 6 : 3);
    }

    /**
     * 以后台任务方式回写 embedding，失败时只记录警告，不阻塞主流程。
     */
    async function updateMemoryEmbedding(memoryId, userId, embeddingVector) {
        const supabase = getSupabaseClient();
        if (!supabase || !memoryId || !userId || !embeddingVector) return;

        try {
            const { error } = await supabase
                .from('hippocampus_memories')
                .update({
                    embedding: vectorToLiteral(embeddingVector)
                })
                .eq('id', memoryId)
                .eq('user_id', userId);

            if (error) throw error;
        } catch (error) {
            console.warn('[海马体] 回写 embedding 失败，已保留空向量:', error && error.message ? error.message : error);
        }
    }

    /**
     * 初始化海马体客户端，保存 Supabase 实例与设置快照。
     */
    function initHippocampus(supabaseClient, settings) {
        const normalizedSettings = normalizeSettings(settings);

        state.supabase = supabaseClient || null;
        state.settings = normalizedSettings;
        state.writeTimestamps.clear();
        syncEventRippleRpcAvailability(state.supabase);

        if (!normalizedSettings.hippocampusEnabled) return publicApi;

        return publicApi;
    }

    /**
     * 读取命中碎片关联的真实事件记录，供事件级召回候选池优先使用。
     */
    async function fetchEventRecordsMap(supabase, userId, charId, eventIds) {
        const safeUserId = toTrimmedString(userId);
        const safeCharId = toTrimmedString(charId);
        const ids = mergeUniqueIds(eventIds, [], 60);
        if (!supabase || !safeUserId || !safeCharId || ids.length === 0) {
            return new Map();
        }

        try {
            const response = await runEventTableQueryWithFallback(function buildEventQuery(fields) {
                return supabase
                    .from('hippocampus_memory_events')
                    .select(fields)
                    .eq('user_id', safeUserId)
                    .eq('char_id', safeCharId)
                    .in('id', ids);
            }, '事件表');

            if (response && response.error) {
                throw response.error;
            }

            const map = new Map();
            const rows = response && Array.isArray(response.data) ? response.data : [];
            rows.forEach(function putEvent(row) {
                const normalized = normalizeEventRecordRow(row);
                if (!normalized || isRetiredEventRecord(normalized)) return;
                map.set(normalized.id, normalized);
            });
            return map;
        } catch (error) {
            const missingTable = isMissingEventTableError(error);
            if (!missingTable) {
                console.warn('[海马体] 事件表读取失败，已回退到碎片聚合模式:', error && error.message ? error.message : error);
            }
            return new Map();
        }
    }

    /**
     * 按 ID 批量回查记忆碎片内容，供真实事件记录补齐 anchor/detail 文本。
     */
    async function fetchMemoryRowsMapByIds(supabase, userId, charId, memoryIds) {
        const safeUserId = toTrimmedString(userId);
        const safeCharId = toTrimmedString(charId);
        const ids = mergeUniqueIds(memoryIds, [], 96);
        if (!supabase || !safeUserId || !safeCharId || ids.length === 0) {
            return new Map();
        }

        const selectFields = 'id,user_id,char_id,room_id,context_scope,content,valence,arousal,importance,activation_count,resolved,memory_layer,is_flashbulb,event_id,event_title,event_summary,event_status,event_depth,event_date,event_fragment_count,event_is_unresolved,event_salience_score,event_depth_score,continuation_key,event_anchor_memory_id,event_detail_memory_ids,metadata,created_at,last_active_at,last_injected_at';

        try {
            const response = await supabase
                .from('hippocampus_memories')
                .select(selectFields)
                .eq('user_id', safeUserId)
                .eq('char_id', safeCharId)
                .in('id', ids);

            if (response && response.error) {
                throw response.error;
            }

            const map = new Map();
            const rows = response && Array.isArray(response.data) ? response.data : [];
            rows.forEach(function putMemory(row) {
                const normalized = normalizeMemoryRow(row);
                if (!normalized || !normalized.memory_id) return;
                map.set(normalized.memory_id, normalized);
            });
            return map;
        } catch (error) {
            console.warn('[海马体] 事件细节碎片回查失败，已回退为命中碎片模式:', error && error.message ? error.message : error);
            return new Map();
        }
    }

    /**
     * 为一批命中记忆补齐真实事件记录与 detail/anchor 碎片文本。
     */
    function deriveEventHydrationExpansionPlan(memories, eventRecordMap, options) {
        const source = (Array.isArray(memories) ? memories : []).map(normalizeMemoryRow).filter(Boolean);
        const safeEventRecordMap = toEventRecordMap(eventRecordMap);
        const optionsSource = options && typeof options === 'object' ? options : {};
        const maxExpandedEvents = Math.max(1, Math.min(6, Math.floor(toFiniteNumber(optionsSource.maxExpandedEvents, 4))));
        const maxFullMembersPerEvent = Math.max(6, Math.min(16, Math.floor(toFiniteNumber(optionsSource.maxFullMembersPerEvent, 12))));
        const baseDetailLimit = Math.max(2, Math.min(8, Math.floor(toFiniteNumber(optionsSource.maxDetailsPerEvent, 6))));
        if (source.length === 0 || safeEventRecordMap.size === 0) return new Map();

        const grouped = new Map();
        source.forEach(function groupMemory(item) {
            const eventId = getMemoryEventId(item);
            if (!eventId || !safeEventRecordMap.has(eventId)) return;
            if (!grouped.has(eventId)) {
                grouped.set(eventId, []);
            }
            grouped.get(eventId).push(item);
        });
        if (grouped.size === 0) return new Map();

        const scored = [];
        grouped.forEach(function evaluateGroup(group, eventId) {
            const record = safeEventRecordMap.get(eventId) || null;
            const fragmentCount = Math.max(
                Math.floor(toFiniteNumber(record && record.fragment_count, 0)),
                Array.isArray(record && record.memory_ids) ? record.memory_ids.length : 0
            );
            if (fragmentCount <= baseDetailLimit) return;

            const directHit = group.some(function hasDirectHit(item) {
                return !!(item && (item._hitByKeyword || item._hitByVector || item._hitBySensory || item._isIntrusive));
            });
            const unresolved = !!(record && record.is_unresolved) || group.some(function hasUnresolved(item) {
                return !!(item && item.event_is_unresolved);
            });
            const flashbulb = !!(record && record.event_is_flashbulb) || group.some(function hasFlashbulb(item) {
                return !!(item && item.event_is_flashbulb);
            });
            const depth = toTrimmedString(record && record.depth || (group[0] && group[0].event_depth)).toLowerCase();
            const highDepth = depth === 'high';

            let score = 0;
            score += directHit ? 3.4 : 0;
            score += unresolved ? 2.0 : 0;
            score += flashbulb ? 1.5 : 0;
            score += highDepth ? 1.2 : (depth === 'medium' ? 0.5 : 0);
            score += Math.min(1.5, group.length * 0.45);
            score += clampNumber(record && record.salience_score, 0, 1, 0) * 1.2;
            if (score < 2.2) return;

            let memberLimit = baseDetailLimit;
            if (directHit) memberLimit += 4;
            if (unresolved) memberLimit += 2;
            if (flashbulb || highDepth) memberLimit += 2;
            memberLimit = Math.max(baseDetailLimit, Math.min(maxFullMembersPerEvent, memberLimit, fragmentCount));
            const shouldCompleteSmallEvent = fragmentCount > 0
                && fragmentCount <= maxFullMembersPerEvent
                && (
                    directHit
                    || (unresolved && highDepth)
                    || (flashbulb && group.length >= 2)
                );
            if (shouldCompleteSmallEvent) {
                memberLimit = fragmentCount;
            }

            const reasons = [];
            if (directHit) reasons.push('current_hit');
            if (unresolved) reasons.push('open_loop');
            if (flashbulb) reasons.push('flashbulb');
            if (highDepth) reasons.push('high_depth');
            if (shouldCompleteSmallEvent) reasons.push('full_event');
            if (reasons.length === 0) reasons.push('semantic_context');

            scored.push({
                eventId: eventId,
                memberLimit: memberLimit,
                reason: reasons.join('+'),
                score: score
            });
        });

        return new Map(
            scored
                .sort(function sortPlan(left, right) {
                    if (right.score !== left.score) return right.score - left.score;
                    return right.memberLimit - left.memberLimit;
                })
                .slice(0, maxExpandedEvents)
                .map(function toEntry(item) {
                    return [item.eventId, item];
                })
        );
    }

    async function fetchEventRecallHydrationBundle(supabase, userId, charId, memories, options) {
        const source = (Array.isArray(memories) ? memories : []).map(normalizeMemoryRow).filter(Boolean);
        if (source.length === 0) {
            return {
                eventRecords: new Map(),
                detailRows: new Map()
            };
        }

        const optionsSource = options && typeof options === 'object' ? options : {};
        const maxDetailsPerEvent = Math.max(2, Math.min(8, Math.floor(toFiniteNumber(optionsSource.maxDetailsPerEvent, 6))));
        const eventIds = source.map(function mapEventId(item) {
            return getMemoryEventId(item);
        }).filter(Boolean);
        const eventRecordMap = await fetchEventRecordsMap(supabase, userId, charId, eventIds);
        if (eventRecordMap.size === 0) {
            return {
                eventRecords: eventRecordMap,
                detailRows: new Map()
            };
        }
        const expansionPlan = deriveEventHydrationExpansionPlan(source, eventRecordMap, {
            maxDetailsPerEvent: maxDetailsPerEvent,
            maxExpandedEvents: optionsSource.maxExpandedEvents,
            maxFullMembersPerEvent: optionsSource.maxFullMembersPerEvent
        });
        const hydratedEventRecordMap = new Map();

        const referencedMemoryIds = [];
        eventRecordMap.forEach(function collectMemoryIds(record, eventId) {
            const plan = expansionPlan.get(eventId) || null;
            const analysisMemberLimit = Math.max(
                maxDetailsPerEvent,
                plan ? plan.memberLimit + 4 : (maxDetailsPerEvent + 2)
            );
            const metadata = Object.assign(
                {},
                normalizeMetadata(record && record.metadata),
                plan ? {
                    recall_full_member_limit: Math.max(maxDetailsPerEvent, plan.memberLimit),
                    recall_full_member_reason: plan.reason,
                    recall_full_member_score: Number(plan.score.toFixed(3))
                } : {}
            );
            hydratedEventRecordMap.set(eventId, Object.assign({}, record, { metadata: metadata }));
            collectEventFragmentReferenceIds(record, {
                memberLimit: analysisMemberLimit,
                totalLimit: Math.min(24, analysisMemberLimit + 6),
                detailLimit: Math.max(maxDetailsPerEvent, 6),
                flashbulbLimit: 8
            }).forEach(function pushReferencedId(id) {
                referencedMemoryIds.push(id);
            });
        });

        const detailRows = await fetchMemoryRowsMapByIds(supabase, userId, charId, referencedMemoryIds);
        return {
            eventRecords: hydratedEventRecordMap,
            detailRows: detailRows
        };
    }

    function scoreRecentDirectEventCandidate(candidate, eventRecord, recentHours, nowMs) {
        const safeCandidate = candidate && typeof candidate === 'object' ? candidate : {};
        const safeRecord = eventRecord && typeof eventRecord === 'object' ? eventRecord : {};
        const safeNowMs = Number.isFinite(nowMs) ? nowMs : Date.now();
        const safeRecentHours = Math.max(1, Math.min(168, Math.floor(toFiniteNumber(recentHours, 48))));
        const eventTs = getEventRecordTimestamp(safeRecord, getMemoryTimestamp(safeCandidate, ['last_active_at', 'created_at', 'last_injected_at']));
        const ageHours = Number.isFinite(eventTs)
            ? Math.max(0, (safeNowMs - eventTs) / (60 * 60 * 1000))
            : safeRecentHours;
        const recencyScore = clampNumber(1 - (ageHours / Math.max(12, safeRecentHours * 1.1)), 0, 1, 0);
        const unresolved = !!(
            safeCandidate.event_is_unresolved
            || safeRecord.is_unresolved
            || toTrimmedString(safeCandidate.event_status || safeRecord.status).toLowerCase() === 'open'
        );
        const flashbulb = !!(safeCandidate.event_is_flashbulb || safeRecord.event_is_flashbulb);
        const depth = toTrimmedString(safeCandidate.event_depth || safeRecord.depth).toLowerCase();
        const depthScore = clampNumber(
            safeCandidate.event_depth_score !== undefined && safeCandidate.event_depth_score !== null
                ? safeCandidate.event_depth_score
                : safeRecord.depth_score,
            0,
            1,
            depth === 'high' ? 1 : (depth === 'medium' ? 0.68 : 0.36)
        );
        const salienceScore = clampNumber(
            safeCandidate.event_salience_score !== undefined && safeCandidate.event_salience_score !== null
                ? safeCandidate.event_salience_score
                : safeRecord.salience_score,
            0,
            1,
            0
        );
        const memberCount = Math.max(
            Math.floor(toFiniteNumber(safeCandidate.event_loaded_member_count, 0)),
            Math.floor(toFiniteNumber(safeCandidate.event_fragment_count, 0))
        );
        const memberRichness = clampNumber(memberCount / 12, 0, 1, 0);
        return clampNumber(
            0.16
            + (recencyScore * 0.34)
            + (salienceScore * 0.18)
            + (depthScore * 0.12)
            + (memberRichness * 0.08)
            + (unresolved ? 0.10 : 0)
            + (flashbulb ? 0.08 : 0),
            0,
            1,
            0
        );
    }

    function sanitizeDirectEventSearchNeedle(rawNeedle) {
        return toTrimmedString(rawNeedle)
            .replace(/[%_(),"'\\]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 24);
    }

    function buildDirectEventSearchNeedles(query) {
        const needles = [];
        const seen = new Set();

        function pushNeedle(rawNeedle) {
            const normalized = sanitizeDirectEventSearchNeedle(rawNeedle);
            const lower = normalized.toLowerCase();
            if (!normalized || seen.has(lower)) return;
            seen.add(lower);
            needles.push(normalized);
        }

        const cleanQuery = toTrimmedString(query).replace(/\s+/g, ' ').trim();
        pushNeedle(cleanQuery);
        normalizeTriggerKeywords(cleanQuery).slice(0, 4).forEach(pushNeedle);

        return needles.slice(0, 4);
    }

    function buildDirectEventSearchOrClause(needles) {
        const source = Array.isArray(needles) ? needles : [];
        const clauses = [];

        source.forEach(function appendNeedle(rawNeedle) {
            const needle = sanitizeDirectEventSearchNeedle(rawNeedle);
            if (!needle) return;
            const like = `%${needle}%`;
            clauses.push(`title.ilike.${like}`);
            clauses.push(`summary.ilike.${like}`);
            if (needle.length >= 2) {
                clauses.push(`continuation_key.ilike.${like}`);
            }
        });

        return clauses.join(',');
    }

    function extractSearchDirectEventRpcScore(source) {
        const safeSource = source && typeof source === 'object' ? source : {};
        const metadata = normalizeMetadata(safeSource.metadata);
        return clampNumber(
            readFirstDefined(safeSource, [
                'rpc_final_score',
                'final_score',
                'search_direct_rpc_score'
            ], readFirstDefined(metadata, [
                'search_direct_rpc_score',
                'search_rpc_score'
            ], 0)),
            0,
            1,
            0
        );
    }

    function decorateSearchDirectEventRpcRow(row) {
        const source = row && typeof row === 'object' ? row : {};
        const metadata = normalizeMetadata(source.metadata);
        const rpcTextScore = clampNumber(
            readFirstDefined(source, ['rpc_text_score', 'text_score'], readFirstDefined(metadata, [
                'search_direct_rpc_text_score',
                'search_rpc_text_score'
            ], 0)),
            0,
            1,
            0
        );
        const rpcScore = extractSearchDirectEventRpcScore(source);
        const rpcHitFields = normalizeTriggerKeywords(
            readFirstDefined(source, ['rpc_hit_fields', 'hit_fields'], readFirstDefined(metadata, [
                'search_direct_rpc_hit_fields',
                'search_rpc_hit_fields'
            ], []))
        ).slice(0, 8);
        const rpcHitTerms = normalizeTriggerKeywords(
            readFirstDefined(source, ['rpc_hit_terms', 'hit_terms'], readFirstDefined(metadata, [
                'search_direct_rpc_hit_terms',
                'search_rpc_hit_terms'
            ], []))
        ).slice(0, 8);

        return Object.assign({}, source, {
            metadata: Object.assign({}, metadata, {
                search_direct_rpc: true,
                search_direct_rpc_score: rpcScore,
                search_direct_rpc_text_score: rpcTextScore,
                search_direct_rpc_hit_fields: rpcHitFields,
                search_direct_rpc_hit_terms: rpcHitTerms
            })
        });
    }

    async function fetchSearchDirectEventRowsViaRpc(supabase, userId, charId, roomId, query, limit, options) {
        const safeUserId = toTrimmedString(userId);
        const safeCharId = toTrimmedString(charId);
        const safeRoomId = toTrimmedString(roomId);
        const cleanQuery = toTrimmedString(query);
        const safeLimit = Math.max(1, Math.min(24, Math.floor(toFiniteNumber(limit, 12))));
        const optionsSource = options && typeof options === 'object' ? options : {};
        const requestTs = Number.isFinite(optionsSource.nowMs) ? optionsSource.nowMs : Date.now();
        if (!supabase || typeof supabase.rpc !== 'function' || !safeUserId || !safeCharId || !cleanQuery) {
            return [];
        }
        if (!shouldProbeEventSearchRpc(supabase, requestTs)) {
            return null;
        }

        try {
            const response = await supabase.rpc('search_hippocampus_events', {
                p_user_id: safeUserId,
                p_char_id: safeCharId,
                p_query: cleanQuery,
                p_room_id: safeRoomId || null,
                p_limit: safeLimit,
                p_include_private_when_room: true
            });
            if (response && response.error) {
                throw response.error;
            }
            markEventSearchRpcAvailability(supabase, true, requestTs);
            return Array.isArray(response && response.data)
                ? response.data.map(decorateSearchDirectEventRpcRow)
                : [];
        } catch (error) {
            if (isMissingRpcFunctionError(error, 'search_hippocampus_events')) {
                markEventSearchRpcAvailability(supabase, false, requestTs);
                console.log('[海马体][搜索] 事件搜索 RPC 未就绪，已回退旧版事件表查询。');
                return null;
            }
            throw error;
        }
    }

    function buildMemorySearchQueryProfile(query, options) {
        const cleanQuery = toTrimmedString(query);
        const optionsSource = options && typeof options === 'object' ? options : {};
        const profileSource = optionsSource.queryProfile && typeof optionsSource.queryProfile === 'object'
            ? optionsSource.queryProfile
            : {};
        const derivedTerms = normalizeTriggerKeywords(extractContentKeywords(cleanQuery).slice(0, 6));
        const focusTerms = normalizeTriggerKeywords(
            []
                .concat(Array.isArray(profileSource.focusTerms) ? profileSource.focusTerms : [])
                .concat(Array.isArray(profileSource.primaryTerms) ? profileSource.primaryTerms : [])
                .concat(Array.isArray(profileSource.currentTerms) ? profileSource.currentTerms : [])
        ).slice(0, 6);
        const supportTerms = normalizeTriggerKeywords(
            []
                .concat(Array.isArray(profileSource.supportTerms) ? profileSource.supportTerms : [])
                .concat(Array.isArray(profileSource.contextTerms) ? profileSource.contextTerms : [])
        )
            .filter(function filterSupportTerm(term) {
                return !focusTerms.includes(term);
            })
            .slice(0, 6);
        const scopeTerms = normalizeTriggerKeywords(
            []
                .concat(Array.isArray(profileSource.scopeTerms) ? profileSource.scopeTerms : [])
                .concat(focusTerms)
                .concat(supportTerms)
                .concat(derivedTerms)
        ).slice(0, 10);

        return {
            normalizedQuery: cleanQuery,
            focusTerms: focusTerms.length > 0 ? focusTerms : derivedTerms.slice(0, 4),
            supportTerms: supportTerms,
            scopeTerms: scopeTerms.length > 0 ? scopeTerms : derivedTerms.slice(0, 6),
            ambiguousReference: toBoolean(profileSource.ambiguousReference),
            preferSupportContext: toBoolean(profileSource.preferSupportContext),
            shortFollowup: toBoolean(profileSource.shortFollowup),
            reactionMode: toBoolean(profileSource.reactionMode)
        };
    }

    function countSearchTermOverlap(leftTerms, rightTerms) {
        const left = Array.isArray(leftTerms) ? leftTerms.map(toTrimmedString).filter(Boolean) : [];
        const rightSet = new Set(
            (Array.isArray(rightTerms) ? rightTerms : [])
                .map(toTrimmedString)
                .filter(Boolean)
        );
        if (left.length === 0 || rightSet.size === 0) return 0;
        let count = 0;
        left.forEach(function countOne(term) {
            if (rightSet.has(term)) count += 1;
        });
        return count;
    }

    function collectMemoryContextTermSets(candidate, eventRecord) {
        const safeCandidate = candidate && typeof candidate === 'object' ? candidate : {};
        const safeRecord = eventRecord && typeof eventRecord === 'object' ? eventRecord : {};
        const candidateMetadata = normalizeMetadata(safeCandidate.metadata);
        const recordMetadata = normalizeMetadata(safeRecord.metadata);
        const focusTerms = normalizeTriggerKeywords(
            []
                .concat(readFirstDefined(candidateMetadata, ['context_focus_terms', 'contextFocusTerms'], []))
                .concat(readFirstDefined(recordMetadata, ['context_focus_terms', 'contextFocusTerms'], []))
                .concat(extractContentKeywords(safeCandidate.content || '').slice(0, 4))
        ).slice(0, 8);
        const supportTerms = normalizeTriggerKeywords(
            []
                .concat(readFirstDefined(candidateMetadata, ['context_support_terms', 'contextSupportTerms'], []))
                .concat(readFirstDefined(recordMetadata, ['context_support_terms', 'contextSupportTerms'], []))
        )
            .filter(function filterSupportTerm(term) {
                return !focusTerms.includes(term);
            })
            .slice(0, 8);
        const entityTerms = normalizeTriggerKeywords(
            []
                .concat(Array.isArray(safeRecord.surface_aliases) ? safeRecord.surface_aliases : [])
                .concat(Array.isArray(safeCandidate.surface_aliases) ? safeCandidate.surface_aliases : [])
                .concat(readFirstDefined(candidateMetadata, ['surface_aliases', 'surfaceAliases'], []))
                .concat(readFirstDefined(recordMetadata, ['surface_aliases', 'surfaceAliases'], []))
                .concat(readFirstDefined(candidateMetadata, ['trigger_keywords', 'triggerKeywords'], []))
                .concat(readFirstDefined(recordMetadata, ['trigger_keywords', 'triggerKeywords'], []))
        ).slice(0, 12);
        const scopeTerms = normalizeTriggerKeywords(
            []
                .concat(readFirstDefined(candidateMetadata, ['context_scope_terms', 'contextScopeTerms'], []))
                .concat(readFirstDefined(recordMetadata, ['context_scope_terms', 'contextScopeTerms'], []))
                .concat(supportTerms)
                .concat(focusTerms)
                .concat(entityTerms)
                .concat(extractContentKeywords(
                    [
                        safeCandidate.event_title || safeRecord.title || '',
                        safeCandidate.event_summary || safeRecord.summary || ''
                    ].filter(Boolean).join(' ')
                ).slice(0, 6))
        ).slice(0, 16);

        return {
            focusTerms: focusTerms,
            supportTerms: supportTerms,
            scopeTerms: scopeTerms,
            entityTerms: entityTerms
        };
    }

    function computeMemorySearchContextAdjustment(candidate, queryProfile, eventRecord) {
        const profile = queryProfile && typeof queryProfile === 'object' ? queryProfile : null;
        if (!profile) {
            return {
                bonus: 0,
                reasonTags: []
            };
        }

        const candidateTerms = collectMemoryContextTermSets(candidate, eventRecord);
        const focusOverlap = countSearchTermOverlap(
            profile.focusTerms,
            candidateTerms.focusTerms.concat(candidateTerms.entityTerms)
        );
        const supportOverlap = countSearchTermOverlap(
            profile.supportTerms,
            candidateTerms.supportTerms.concat(candidateTerms.scopeTerms)
        );
        const scopeOverlap = countSearchTermOverlap(profile.scopeTerms, candidateTerms.scopeTerms);
        const entityOverlap = countSearchTermOverlap(profile.scopeTerms, candidateTerms.entityTerms);
        const needsSupportContext = !!(
            profile.preferSupportContext
            && Array.isArray(profile.supportTerms)
            && profile.supportTerms.length > 0
        );
        const reasonTags = [];
        let bonus = 0;

        if (focusOverlap > 0) {
            bonus += Math.min(0.12, 0.04 + (focusOverlap * 0.03));
            reasonTags.push('focus_match');
        }
        if (supportOverlap > 0) {
            bonus += Math.min(0.10, supportOverlap * 0.04);
            reasonTags.push('support_match');
        }
        if (scopeOverlap > 0) {
            bonus += Math.min(0.08, scopeOverlap * 0.025);
            reasonTags.push('scope_match');
        }
        if (needsSupportContext && entityOverlap > 0 && supportOverlap === 0) {
            bonus -= Math.min(
                0.28,
                0.16
                + (entityOverlap * 0.04)
                + (focusOverlap > 0 ? 0.04 : 0)
            );
            reasonTags.push('support_missing');
        } else if (profile.ambiguousReference && needsSupportContext && supportOverlap === 0 && focusOverlap === 0) {
            bonus -= 0.09;
            reasonTags.push('ambiguous_off_scope');
        }

        return {
            bonus: clampNumber(bonus, -0.28, 0.22, 0),
            reasonTags: reasonTags,
            focusOverlap: focusOverlap,
            supportOverlap: supportOverlap,
            scopeOverlap: scopeOverlap,
            entityOverlap: entityOverlap
        };
    }

    function scoreSearchDirectEventCandidate(candidate, eventRecord, query, options) {
        const safeCandidate = candidate && typeof candidate === 'object' ? candidate : {};
        const safeRecord = eventRecord && typeof eventRecord === 'object' ? eventRecord : {};
        const optionsSource = options && typeof options === 'object' ? options : {};
        const safeNowMs = Number.isFinite(optionsSource.nowMs) ? optionsSource.nowMs : Date.now();
        const queryProfile = buildMemorySearchQueryProfile(query, optionsSource);
        const needles = buildDirectEventSearchNeedles(query);
        const fullQuery = toTrimmedString(query).toLowerCase();
        const metadata = normalizeMetadata(safeRecord.metadata || safeCandidate.metadata);
        const title = toTrimmedString(safeCandidate.event_title || safeRecord.title).toLowerCase();
        const summary = toTrimmedString(safeCandidate.event_summary || safeRecord.summary).toLowerCase();
        const continuationKey = toTrimmedString(safeCandidate.continuation_key || safeRecord.continuation_key).toLowerCase();
        const eventDate = toTrimmedString(safeCandidate.event_date || safeRecord.event_date).toLowerCase();
        const aliasText = normalizeTriggerKeywords(
            []
                .concat(Array.isArray(safeRecord.surface_aliases) ? safeRecord.surface_aliases : [])
                .concat(Array.isArray(safeCandidate.surface_aliases) ? safeCandidate.surface_aliases : [])
                .concat(readFirstDefined(metadata, ['surface_aliases', 'surfaceAliases'], []))
                .concat(readFirstDefined(metadata, ['trigger_keywords', 'triggerKeywords'], []))
                .concat(readFirstDefined(metadata, ['event_stability_terms', 'eventStabilityTerms'], []))
                .concat(readFirstDefined(metadata, ['search_direct_rpc_hit_terms', 'searchRpcHitTerms'], []))
        ).join(' ').toLowerCase();
        const sensoryText = normalizeTriggerKeywords(
            readFirstDefined(metadata, ['sensory_anchors', 'sensoryAnchors'], [])
        ).join(' ').toLowerCase();
        const rpcScore = extractSearchDirectEventRpcScore({
            metadata: metadata
        });
        const eventTs = getEventRecordTimestamp(
            safeRecord,
            getMemoryTimestamp(safeCandidate, ['last_active_at', 'created_at', 'last_injected_at'])
        );
        const ageDays = Number.isFinite(eventTs)
            ? Math.max(0, (safeNowMs - eventTs) / (24 * 60 * 60 * 1000))
            : 14;
        const recencyScore = clampNumber(1 - (ageDays / 30), 0, 1, 0);
        const unresolved = !!(
            safeCandidate.event_is_unresolved
            || safeRecord.is_unresolved
            || toTrimmedString(safeCandidate.event_status || safeRecord.status).toLowerCase() === 'open'
        );
        const flashbulb = !!(safeCandidate.event_is_flashbulb || safeRecord.event_is_flashbulb);
        const depth = toTrimmedString(safeCandidate.event_depth || safeRecord.depth).toLowerCase();
        const depthScore = clampNumber(
            safeCandidate.event_depth_score !== undefined && safeCandidate.event_depth_score !== null
                ? safeCandidate.event_depth_score
                : safeRecord.depth_score,
            0,
            1,
            depth === 'high' ? 1 : (depth === 'medium' ? 0.68 : 0.36)
        );
        const salienceScore = clampNumber(
            safeCandidate.event_salience_score !== undefined && safeCandidate.event_salience_score !== null
                ? safeCandidate.event_salience_score
                : safeRecord.salience_score,
            0,
            1,
            0
        );
        const memberCount = Math.max(
            Math.floor(toFiniteNumber(safeCandidate.event_loaded_member_count, 0)),
            Math.floor(toFiniteNumber(safeCandidate.event_fragment_count, 0))
        );
        const memberRichness = clampNumber(memberCount / 10, 0, 1, 0);

        const tokenCount = Math.max(1, needles.length);
        const titleHits = needles.filter(function countTitleHit(needle) {
            return title.indexOf(needle.toLowerCase()) >= 0;
        }).length;
        const summaryHits = needles.filter(function countSummaryHit(needle) {
            return summary.indexOf(needle.toLowerCase()) >= 0;
        }).length;
        const continuationHits = needles.filter(function countContinuationHit(needle) {
            return continuationKey.indexOf(needle.toLowerCase()) >= 0;
        }).length;
        const aliasHits = needles.filter(function countAliasHit(needle) {
            return aliasText.indexOf(needle.toLowerCase()) >= 0;
        }).length;
        const sensoryHits = needles.filter(function countSensoryHit(needle) {
            return sensoryText.indexOf(needle.toLowerCase()) >= 0;
        }).length;
        const dateHits = needles.filter(function countDateHit(needle) {
            return eventDate.indexOf(needle.toLowerCase()) >= 0;
        }).length;

        let lexicalScore = 0;
        if (fullQuery && title.indexOf(fullQuery) >= 0) lexicalScore += 0.34;
        if (fullQuery && summary.indexOf(fullQuery) >= 0) lexicalScore += 0.22;
        if (fullQuery && continuationKey.indexOf(fullQuery) >= 0) lexicalScore += 0.12;
        if (fullQuery && aliasText.indexOf(fullQuery) >= 0) lexicalScore += 0.16;
        if (fullQuery && sensoryText.indexOf(fullQuery) >= 0) lexicalScore += 0.08;
        if (fullQuery && eventDate.indexOf(fullQuery) >= 0) lexicalScore += 0.06;
        lexicalScore += (titleHits / tokenCount) * 0.26;
        lexicalScore += (summaryHits / tokenCount) * 0.18;
        lexicalScore += (continuationHits / tokenCount) * 0.08;
        lexicalScore += (aliasHits / tokenCount) * 0.14;
        lexicalScore += (sensoryHits / tokenCount) * 0.08;
        lexicalScore += (dateHits / tokenCount) * 0.06;
        const contextAdjustment = computeMemorySearchContextAdjustment(safeCandidate, queryProfile, safeRecord);

        const baseScore = clampNumber(
            0.08
            + lexicalScore
            + (rpcScore * 0.18)
            + (salienceScore * 0.16)
            + (depthScore * 0.10)
            + (recencyScore * 0.08)
            + (memberRichness * 0.06)
            + (unresolved ? 0.08 : 0)
            + (flashbulb ? 0.04 : 0),
            0,
            1,
            0
        );
        return clampNumber(baseScore + contextAdjustment.bonus, 0, 1, 0);
    }

    async function fetchSearchDirectEventCandidates(supabase, userId, charId, roomId, query, limit, options) {
        const safeUserId = toTrimmedString(userId);
        const safeCharId = toTrimmedString(charId);
        const safeRoomId = toTrimmedString(roomId);
        const cleanQuery = toTrimmedString(query);
        const safeLimit = Math.max(1, Math.min(4, Math.floor(toFiniteNumber(limit, 2))));
        if (!supabase || !safeUserId || !safeCharId || !cleanQuery) {
            return [];
        }

        const optionsSource = options && typeof options === 'object' ? options : {};
        const nowMs = Number.isFinite(optionsSource.nowMs) ? optionsSource.nowMs : Date.now();
        const queryProfile = buildMemorySearchQueryProfile(cleanQuery, optionsSource);
        const memberLimit = Math.max(6, Math.min(16, Math.floor(toFiniteNumber(optionsSource.maxMembersPerEvent, 10))));
        const analysisMemberLimit = Math.max(memberLimit, Math.min(24, memberLimit + 4));
        const detailPerEvent = Math.max(3, Math.min(6, Math.floor(toFiniteNumber(optionsSource.detailPerEvent, 4))));
        const perScopeLimit = Math.max(safeLimit * 5, 12);
        const needles = buildDirectEventSearchNeedles(cleanQuery);
        const orClause = buildDirectEventSearchOrClause(needles);
        if (!orClause) return [];

        function buildEventScopeQuery(contextScope, fields) {
            let queryBuilder = supabase
                .from('hippocampus_memory_events')
                .select(fields)
                .eq('user_id', safeUserId)
                .eq('char_id', safeCharId)
                .eq('context_scope', contextScope)
                .or(orClause);
            if (contextScope === 'room') {
                queryBuilder = queryBuilder.eq('room_id', safeRoomId);
            }
            return queryBuilder
                .order('last_related_at', { ascending: false })
                .limit(perScopeLimit);
        }

        function buildEventTasks(fields) {
            const tasks = [buildEventScopeQuery('private', fields)];
            if (safeRoomId) {
                tasks.push(buildEventScopeQuery('room', fields));
            }
            return tasks;
        }

        try {
            const settled = await runEventTableTaskBatchWithFallback(buildEventTasks, '搜索事件');
            const rpcRows = await fetchSearchDirectEventRowsViaRpc(
                supabase,
                safeUserId,
                safeCharId,
                safeRoomId,
                cleanQuery,
                perScopeLimit,
                {
                    nowMs: nowMs
                }
            );
            const useEventTableFallback = !Array.isArray(rpcRows);
            const settledRows = useEventTableFallback ? settled : [];
            let eventRows = Array.isArray(rpcRows) ? rpcRows.slice() : [];
            settledRows.forEach(function consumeResult(item, index) {
                if (item.status !== 'fulfilled') {
                    console.warn(`[海马体][搜索事件] 第 ${index + 1} 路事件查询失败:`, item.reason && item.reason.message ? item.reason.message : item.reason);
                    return;
                }
                if (item.value && item.value.error) {
                    throw item.value.error;
                }
                eventRows = eventRows.concat(item.value && Array.isArray(item.value.data) ? item.value.data : []);
            });

            const recordMap = new Map();
            eventRows
                .map(normalizeEventRecordRow)
                .filter(function keepRecord(record) {
                    return !!record
                        && !isRetiredEventRecord(record)
                        && isEventRecordRelevantToContext(record, safeRoomId || null);
                })
                .forEach(function putRecord(record) {
                    if (!record || !record.id || recordMap.has(record.id)) return;
                    recordMap.set(record.id, record);
                });
            if (recordMap.size === 0) return [];

            const referencedMemoryIds = [];
            recordMap.forEach(function collectIds(record) {
                const hydratedRecord = Object.assign({}, record, {
                    metadata: Object.assign({}, normalizeMetadata(record.metadata), {
                        hydration_full_member_limit: memberLimit,
                        hydration_prefer_complete_event: true,
                        hydration_direct_search_event: true,
                        search_needles: needles.slice(0, 4)
                    })
                });
                recordMap.set(record.id, hydratedRecord);
                collectEventFragmentReferenceIds(hydratedRecord, {
                    memberLimit: analysisMemberLimit,
                    totalLimit: Math.min(24, analysisMemberLimit + 6),
                    detailLimit: Math.max(detailPerEvent, 6),
                    flashbulbLimit: 8
                }).forEach(function pushId(id) {
                    referencedMemoryIds.push(id);
                });
            });

            const detailRows = await fetchMemoryRowsMapByIds(supabase, safeUserId, safeCharId, referencedMemoryIds);
            const candidates = [];
            recordMap.forEach(function buildCandidate(record) {
                const fragmentIds = collectEventFragmentReferenceIds(record, {
                    memberLimit: analysisMemberLimit,
                    totalLimit: Math.min(24, analysisMemberLimit + 6),
                    detailLimit: Math.max(detailPerEvent, 6),
                    flashbulbLimit: 8
                });
                const fragments = fragmentIds
                    .map(function mapId(id) {
                        return detailRows.get(toTrimmedString(id)) || null;
                    })
                    .filter(Boolean);

                const candidate = buildEventCandidateFromFragments(record.id, fragments, {
                    detailPerEvent: detailPerEvent,
                    eventRecords: [record],
                    detailRows: detailRows
                });
                if (!candidate) return;

                const directScore = scoreSearchDirectEventCandidate(candidate, record, cleanQuery, {
                    nowMs: nowMs,
                    queryProfile: queryProfile
                });
                if (directScore < 0.26) return;
                const contextAdjustment = computeMemorySearchContextAdjustment(candidate, queryProfile, record);

                const mergedMetadata = Object.assign({}, normalizeMetadata(candidate.metadata), {
                    search_direct_event: true,
                    search_direct_event_needles: needles.slice(0, 4),
                    search_direct_event_score: Number(directScore.toFixed(3)),
                    search_direct_event_context_match_bonus: Number(toFiniteNumber(contextAdjustment.bonus, 0).toFixed(3)),
                    search_direct_event_context_match_reasons: Array.isArray(contextAdjustment.reasonTags)
                        ? contextAdjustment.reasonTags.slice(0, 4)
                        : []
                });
                candidates.push(Object.assign({}, candidate, {
                    score: directScore,
                    adjustedScore: directScore,
                    recall_hit_mode: toTrimmedString(candidate.recall_hit_mode) || 'keyword',
                    _hitByKeyword: true,
                    _hitKeyword: toTrimmedString(needles[0]) || cleanQuery.slice(0, 24),
                    _isSearchDirectEvent: true,
                    _contextMatchBonus: toFiniteNumber(contextAdjustment.bonus, 0),
                    _contextMatchReasons: Array.isArray(contextAdjustment.reasonTags)
                        ? contextAdjustment.reasonTags.slice(0, 4)
                        : [],
                    metadata: mergedMetadata
                }));
            });

            return candidates
                .sort(function sortCandidates(left, right) {
                    if (toFiniteNumber(right && right.score, 0) !== toFiniteNumber(left && left.score, 0)) {
                        return toFiniteNumber(right && right.score, 0) - toFiniteNumber(left && left.score, 0);
                    }
                    return getMemoryTimestamp(right, ['last_active_at', 'created_at', 'last_injected_at'])
                        - getMemoryTimestamp(left, ['last_active_at', 'created_at', 'last_injected_at']);
                })
                .slice(0, safeLimit);
        } catch (error) {
            if (!isMissingEventTableError(error)) {
                console.warn('[海马体][搜索事件] 事件直出候选构建失败，已回退碎片搜索:', error && error.message ? error.message : error);
            }
            return [];
        }
    }

    function scoreSurfaceDirectEventCandidate(candidate, eventRecord, currentValence, currentArousal, nowMs) {
        const safeCandidate = candidate && typeof candidate === 'object' ? candidate : {};
        const safeRecord = eventRecord && typeof eventRecord === 'object' ? eventRecord : {};
        const safeNowMs = Number.isFinite(nowMs) ? nowMs : Date.now();
        const eventTs = getEventRecordTimestamp(
            safeRecord,
            getMemoryTimestamp(safeCandidate, ['last_active_at', 'created_at', 'last_injected_at'])
        );
        const ageHours = Number.isFinite(eventTs)
            ? Math.max(0, (safeNowMs - eventTs) / (60 * 60 * 1000))
            : 168;
        const recencyScore = clampNumber(1 - (ageHours / 120), 0, 1, 0);
        const unresolved = !!(
            safeCandidate.event_is_unresolved
            || safeRecord.is_unresolved
            || toTrimmedString(safeCandidate.event_status || safeRecord.status).toLowerCase() === 'open'
        );
        const flashbulb = !!(safeCandidate.event_is_flashbulb || safeRecord.event_is_flashbulb);
        const depth = toTrimmedString(safeCandidate.event_depth || safeRecord.depth).toLowerCase();
        const depthScore = clampNumber(
            safeCandidate.event_depth_score !== undefined && safeCandidate.event_depth_score !== null
                ? safeCandidate.event_depth_score
                : safeRecord.depth_score,
            0,
            1,
            depth === 'high' ? 1 : (depth === 'medium' ? 0.68 : 0.36)
        );
        const salienceScore = clampNumber(
            safeCandidate.event_salience_score !== undefined && safeCandidate.event_salience_score !== null
                ? safeCandidate.event_salience_score
                : safeRecord.salience_score,
            0,
            1,
            0
        );
        const memberCount = Math.max(
            Math.floor(toFiniteNumber(safeCandidate.event_loaded_member_count, 0)),
            Math.floor(toFiniteNumber(safeCandidate.event_fragment_count, 0))
        );
        const memberRichness = clampNumber(memberCount / 10, 0, 1, 0);

        const hasMood = Number.isFinite(Number(currentValence)) || Number.isFinite(Number(currentArousal));
        let moodResonance = 0.5;
        if (hasMood) {
            const valenceMatch = Number.isFinite(Number(currentValence))
                ? clampNumber(1 - (Math.abs(toFiniteNumber(safeCandidate.valence, 0) - Number(currentValence)) / 2), 0, 1, 0.5)
                : 0.5;
            const arousalMatch = Number.isFinite(Number(currentArousal))
                ? clampNumber(1 - (Math.abs(toFiniteNumber(safeCandidate.arousal, 0) - Number(currentArousal)) / 2), 0, 1, 0.5)
                : 0.5;
            moodResonance = clampNumber((valenceMatch * 0.58) + (arousalMatch * 0.42), 0, 1, 0.5);
        }

        return clampNumber(
            0.08
            + (recencyScore * 0.22)
            + (salienceScore * 0.18)
            + (depthScore * 0.12)
            + (moodResonance * 0.14)
            + (memberRichness * 0.06)
            + (unresolved ? 0.08 : 0)
            + (flashbulb ? 0.10 : 0),
            0,
            1,
            0
        );
    }

    async function fetchSurfaceDirectEventCandidates(supabase, userId, charId, roomId, surfacedRows, currentValence, currentArousal, limit, options) {
        const safeUserId = toTrimmedString(userId);
        const safeCharId = toTrimmedString(charId);
        const safeRoomId = toTrimmedString(roomId);
        const safeLimit = Math.max(1, Math.min(2, Math.floor(toFiniteNumber(limit, 1))));
        if (!supabase || !safeUserId || !safeCharId) {
            return [];
        }

        const surfaced = (Array.isArray(surfacedRows) ? surfacedRows : []).map(normalizeMemoryRow).filter(Boolean);
        const excludeMemoryIds = new Set(surfaced.map(function mapId(item) {
            return toTrimmedString(item && item.memory_id);
        }).filter(Boolean));
        const excludeEventIds = new Set(surfaced.map(function mapEventId(item) {
            return getMemoryEventId(item);
        }).filter(Boolean));
        const optionsSource = options && typeof options === 'object' ? options : {};
        const nowMs = Number.isFinite(optionsSource.nowMs) ? optionsSource.nowMs : Date.now();
        const memberLimit = Math.max(6, Math.min(16, Math.floor(toFiniteNumber(optionsSource.maxMembersPerEvent, 10))));
        const analysisMemberLimit = Math.max(memberLimit, Math.min(24, memberLimit + 4));
        const detailPerEvent = Math.max(3, Math.min(6, Math.floor(toFiniteNumber(optionsSource.detailPerEvent, 4))));
        function buildEventScopeQuery(contextScope, fields) {
            let queryBuilder = supabase
                .from('hippocampus_memory_events')
                .select(fields)
                .eq('user_id', safeUserId)
                .eq('char_id', safeCharId)
                .eq('context_scope', contextScope);
            if (contextScope === 'room') {
                queryBuilder = queryBuilder.eq('room_id', safeRoomId);
            }
            return queryBuilder
                .order('last_related_at', { ascending: false })
                .limit(18);
        }

        function buildEventTasks(fields) {
            const tasks = [buildEventScopeQuery('private', fields)];
            if (safeRoomId) {
                tasks.push(buildEventScopeQuery('room', fields));
            }
            return tasks;
        }

        try {
            const settled = await runEventTableTaskBatchWithFallback(buildEventTasks, '浮现事件');
            let eventRows = [];
            settled.forEach(function consumeResult(item, index) {
                if (item.status !== 'fulfilled') {
                    console.warn(`[海马体][浮现事件] 第 ${index + 1} 路事件查询失败:`, item.reason && item.reason.message ? item.reason.message : item.reason);
                    return;
                }
                if (item.value && item.value.error) {
                    throw item.value.error;
                }
                eventRows = eventRows.concat(item.value && Array.isArray(item.value.data) ? item.value.data : []);
            });

            const recordMap = new Map();
            eventRows
                .map(normalizeEventRecordRow)
                .filter(function keepRecord(record) {
                    return !!record
                        && !excludeEventIds.has(toTrimmedString(record.id))
                        && !isRetiredEventRecord(record)
                        && isEventRecordRelevantToContext(record, safeRoomId || null);
                })
                .forEach(function putRecord(record) {
                    if (!record || !record.id || recordMap.has(record.id)) return;
                    recordMap.set(record.id, record);
                });
            if (recordMap.size === 0) return [];

            const referencedMemoryIds = [];
            recordMap.forEach(function collectIds(record) {
                const hydratedRecord = Object.assign({}, record, {
                    metadata: Object.assign({}, normalizeMetadata(record.metadata), {
                        hydration_full_member_limit: memberLimit,
                        hydration_prefer_complete_event: true,
                        hydration_direct_surface_event: true
                    })
                });
                recordMap.set(record.id, hydratedRecord);
                collectEventFragmentReferenceIds(hydratedRecord, {
                    memberLimit: analysisMemberLimit,
                    totalLimit: Math.min(24, analysisMemberLimit + 6),
                    detailLimit: Math.max(detailPerEvent, 6),
                    flashbulbLimit: 8
                }).forEach(function pushId(id) {
                    referencedMemoryIds.push(id);
                });
            });

            const memoryRowMap = await fetchMemoryRowsMapByIds(
                supabase,
                safeUserId,
                safeCharId,
                referencedMemoryIds
            );
            const candidates = [];

            recordMap.forEach(function buildCandidate(record) {
                const fragmentIds = collectEventFragmentReferenceIds(record, {
                    memberLimit: analysisMemberLimit,
                    totalLimit: Math.min(24, analysisMemberLimit + 6),
                    detailLimit: Math.max(detailPerEvent, 6),
                    flashbulbLimit: 8
                });
                const fragments = fragmentIds
                    .map(function mapId(id) {
                        return memoryRowMap.get(toTrimmedString(id)) || null;
                    })
                    .filter(Boolean);

                const candidate = buildEventCandidateFromFragments(record.id, fragments, {
                    detailPerEvent: detailPerEvent,
                    eventRecords: [record],
                    detailRows: memoryRowMap
                });
                if (!candidate) return;

                const anchorMemoryId = toTrimmedString(candidate.event_anchor_memory_id || candidate.memory_id);
                if (anchorMemoryId && excludeMemoryIds.has(anchorMemoryId)) return;

                const directScore = scoreSurfaceDirectEventCandidate(
                    candidate,
                    record,
                    currentValence,
                    currentArousal,
                    nowMs
                );
                if (directScore < Math.max(0.28, toFiniteNumber(state.settings.surfaceMinScore, 0.42) - 0.1)) {
                    return;
                }

                const mergedMetadata = Object.assign({}, normalizeMetadata(candidate.metadata), {
                    surface_direct_event: true,
                    surface_direct_event_score: Number(directScore.toFixed(3))
                });
                candidates.push(Object.assign({}, candidate, {
                    score: Math.max(toFiniteNumber(candidate.score, 0), directScore),
                    adjustedScore: Math.max(toFiniteNumber(candidate.adjustedScore, 0), directScore),
                    recall_hit_mode: toTrimmedString(candidate.recall_hit_mode) || 'surface_event',
                    _isSurfaceDirectEvent: true,
                    metadata: mergedMetadata
                }));
            });

            return candidates
                .sort(function sortCandidates(left, right) {
                    if (toFiniteNumber(right && right.score, 0) !== toFiniteNumber(left && left.score, 0)) {
                        return toFiniteNumber(right && right.score, 0) - toFiniteNumber(left && left.score, 0);
                    }
                    return getMemoryTimestamp(right, ['last_active_at', 'created_at', 'last_injected_at'])
                        - getMemoryTimestamp(left, ['last_active_at', 'created_at', 'last_injected_at']);
                })
                .slice(0, safeLimit);
        } catch (error) {
            if (!isMissingEventTableError(error)) {
                console.warn('[海马体][浮现事件] 事件直出候选构建失败，已回退碎片浮现:', error && error.message ? error.message : error);
            }
            return [];
        }
    }

    async function fetchRecentDirectEventCandidates(supabase, userId, charId, roomId, hours, limit, options) {
        const safeUserId = toTrimmedString(userId);
        const safeCharId = toTrimmedString(charId);
        const safeRoomId = toTrimmedString(roomId);
        const safeHours = Math.max(1, Math.min(168, Math.floor(toFiniteNumber(hours, 48))));
        const safeLimit = Math.max(1, Math.min(8, Math.floor(toFiniteNumber(limit, 3))));
        if (!supabase || !safeUserId || !safeCharId || safeLimit <= 0) return [];

        const optionsSource = options && typeof options === 'object' ? options : {};
        const nowMs = Number.isFinite(optionsSource.nowMs) ? optionsSource.nowMs : Date.now();
        const cutoffMs = nowMs - (safeHours * 60 * 60 * 1000);
        const perScopeLimit = Math.max(safeLimit * 4, 12);
        const memberLimit = Math.max(6, Math.min(16, Math.floor(toFiniteNumber(optionsSource.maxMembersPerEvent, 10))));
        const analysisMemberLimit = Math.max(memberLimit, Math.min(24, memberLimit + 4));
        const detailPerEvent = Math.max(3, Math.min(6, Math.floor(toFiniteNumber(optionsSource.detailPerEvent, 4))));
        function buildEventScopeQuery(contextScope, fields) {
            let query = supabase
                .from('hippocampus_memory_events')
                .select(fields)
                .eq('user_id', safeUserId)
                .eq('char_id', safeCharId)
                .eq('context_scope', contextScope);
            if (contextScope === 'room') {
                query = query.eq('room_id', safeRoomId);
            }
            return query
                .order('last_related_at', { ascending: false })
                .limit(perScopeLimit);
        }

        function buildEventTasks(fields) {
            const tasks = [buildEventScopeQuery('private', fields)];
            if (safeRoomId) {
                tasks.push(buildEventScopeQuery('room', fields));
            }
            return tasks;
        }

        try {
            const settled = await runEventTableTaskBatchWithFallback(buildEventTasks, '近期事件');
            let eventRows = [];
            settled.forEach(function consumeResult(item, index) {
                if (item.status !== 'fulfilled') {
                    console.warn(`[海马体][近期事件] 第 ${index + 1} 路事件查询失败:`, item.reason && item.reason.message ? item.reason.message : item.reason);
                    return;
                }
                if (item.value && item.value.error) {
                    throw item.value.error;
                }
                eventRows = eventRows.concat(item.value && Array.isArray(item.value.data) ? item.value.data : []);
            });

            const eventRecords = eventRows
                .map(normalizeEventRecordRow)
                .filter(function keepEvent(record) {
                    if (!record) return false;
                    if (isRetiredEventRecord(record)) return false;
                    if (!isEventRecordRelevantToContext(record, safeRoomId || null)) return false;
                    const eventTs = getEventRecordTimestamp(record);
                    if (!Number.isFinite(eventTs)) return false;
                    return eventTs >= cutoffMs;
                });
            if (eventRecords.length === 0) return [];

            const recordMap = new Map();
            eventRecords.forEach(function putRecord(record) {
                if (!record || !record.id || recordMap.has(record.id)) return;
                recordMap.set(record.id, record);
            });

            const referencedMemoryIds = [];
            recordMap.forEach(function collectIds(record) {
                const safeRecord = record && typeof record === 'object' ? record : {};
                const hydratedRecord = Object.assign({}, safeRecord, {
                    metadata: Object.assign({}, normalizeMetadata(safeRecord.metadata), {
                        hydration_full_member_limit: memberLimit,
                        hydration_prefer_complete_event: true,
                        hydration_direct_recent_event: true
                    })
                });
                recordMap.set(safeRecord.id, hydratedRecord);
                collectEventFragmentReferenceIds(hydratedRecord, {
                    memberLimit: analysisMemberLimit,
                    totalLimit: Math.min(24, analysisMemberLimit + 6),
                    detailLimit: Math.max(detailPerEvent, 6),
                    flashbulbLimit: 8
                }).forEach(function pushId(id) {
                    referencedMemoryIds.push(id);
                });
            });

            const detailRows = await fetchMemoryRowsMapByIds(supabase, safeUserId, safeCharId, referencedMemoryIds);
            const candidates = [];
            recordMap.forEach(function buildCandidate(record) {
                const fragmentIds = collectEventFragmentReferenceIds(record, {
                    memberLimit: analysisMemberLimit,
                    totalLimit: Math.min(24, analysisMemberLimit + 6),
                    detailLimit: Math.max(detailPerEvent, 6),
                    flashbulbLimit: 8
                });
                const fragments = fragmentIds
                    .map(function mapId(id) {
                        return detailRows.get(toTrimmedString(id)) || null;
                    })
                    .filter(Boolean);

                const candidate = buildEventCandidateFromFragments(record.id, fragments, {
                    detailPerEvent: detailPerEvent,
                    eventRecords: [record],
                    detailRows: detailRows
                });
                if (!candidate) return;

                const directScore = scoreRecentDirectEventCandidate(candidate, record, safeHours, nowMs);
                const mergedMetadata = Object.assign({}, normalizeMetadata(candidate.metadata), {
                    recent_direct_event: true,
                    recent_direct_event_score: Number(directScore.toFixed(3))
                });
                candidates.push(Object.assign({}, candidate, {
                    score: Math.max(toFiniteNumber(candidate.score, 0), directScore),
                    adjustedScore: Math.max(toFiniteNumber(candidate.adjustedScore, 0), directScore),
                    recall_hit_mode: toTrimmedString(candidate.recall_hit_mode) || 'recent_event',
                    _isRecentEventDirect: true,
                    metadata: mergedMetadata
                }));
            });

            return candidates
                .sort(function sortCandidates(left, right) {
                    if (toFiniteNumber(right && right.score, 0) !== toFiniteNumber(left && left.score, 0)) {
                        return toFiniteNumber(right && right.score, 0) - toFiniteNumber(left && left.score, 0);
                    }
                    return getMemoryTimestamp(right, ['last_active_at', 'created_at', 'last_injected_at'])
                        - getMemoryTimestamp(left, ['last_active_at', 'created_at', 'last_injected_at']);
                })
                .slice(0, safeLimit);
        } catch (error) {
            if (!isMissingEventTableError(error)) {
                console.warn('[海马体][近期事件] 事件直出候选构建失败，已回退碎片时间窗:', error && error.message ? error.message : error);
            }
            return [];
        }
    }

    /**
     * 判断一条事件记录是否属于当前可见上下文，避免 room 事件串到无关会话里。
     */
    function isEventRecordRelevantToContext(eventRecord, roomId) {
        const safeRecord = eventRecord && typeof eventRecord === 'object' ? eventRecord : {};
        if (isRetiredEventRecord(safeRecord)) return false;
        const safeRoomId = toTrimmedString(roomId);
        const recordScope = toTrimmedString(safeRecord.context_scope);
        const recordRoomId = toTrimmedString(safeRecord.room_id);

        if (!safeRoomId) {
            return recordScope !== 'room' || !recordRoomId;
        }
        if (recordScope !== 'room') return true;
        return !recordRoomId || recordRoomId === safeRoomId;
    }

    /**
     * 从一组候选碎片里挑一个最适合作为代表种子/锚点的记忆。
     */
    function pickRepresentativeMemoryByScore(rows) {
        const source = Array.isArray(rows) ? rows.filter(Boolean) : [];
        if (source.length === 0) return null;

        return source.slice().sort(function sortRows(left, right) {
            const hitRankDiff = getRecallHitRank(right) - getRecallHitRank(left);
            if (hitRankDiff !== 0) return hitRankDiff;
            if (toFiniteNumber(right && right.score, 0) !== toFiniteNumber(left && left.score, 0)) {
                return toFiniteNumber(right && right.score, 0) - toFiniteNumber(left && left.score, 0);
            }
            return getMemoryTimestamp(right, ['last_active_at', 'created_at', 'last_injected_at'])
                - getMemoryTimestamp(left, ['last_active_at', 'created_at', 'last_injected_at']);
        })[0] || null;
    }

    /**
     * 读取一组碎片里最近一次被真正注入 Prompt 的时间，供事件级 cooldown 使用。
     */
    function getLatestInjectedTimestampFromRows(rows, fallbackMemory) {
        let latest = getMemoryTimestamp(fallbackMemory, ['last_injected_at']);
        (Array.isArray(rows) ? rows : []).forEach(function consumeRow(row) {
            const ts = getMemoryTimestamp(row, ['last_injected_at']);
            if (!Number.isFinite(ts)) return;
            if (!Number.isFinite(latest) || ts > latest) {
                latest = ts;
            }
        });
        return latest;
    }

    /**
     * 事件化反刍：优先从未了结事件里挑一个“会突然闯回脑海”的事件候选。
     */
    function deriveRippleSeedPlan(group, eventRecord, representativeHit, anchorRow, nowMs) {
        const safeNowMs = Number.isFinite(nowMs) ? nowMs : Date.now();
        const eventId = toTrimmedString(group && group.eventId);
        const safeGroupKey = toTrimmedString(group && group.groupKey);
        const representative = representativeHit && typeof representativeHit === 'object' ? representativeHit : null;
        const priorityProfile = deriveEventPriorityProfile(representative, eventRecord);
        const hitRankScore = Math.min(1, Math.max(0, getRecallHitRank(representative) / 3));
        const hitScore = clampNumber(toFiniteNumber(representative && representative.score, 0), 0, 1, 0);
        const unresolved = !!(
            (eventRecord && eventRecord.is_unresolved)
            || (representative && representative.event_is_unresolved)
            || toTrimmedString(representative && representative.event_status).toLowerCase() === 'open'
        );
        const depth = toTrimmedString(
            (eventRecord && eventRecord.depth)
            || (representative && representative.event_depth)
        ).toLowerCase();
        const depthScore = clampNumber(
            readFirstDefined(eventRecord || representative || {}, ['depth_score', 'event_depth_score'], (
                depth === 'high' ? 1 : (depth === 'medium' ? 0.68 : 0.36)
            )),
            0,
            1,
            depth === 'high' ? 1 : (depth === 'medium' ? 0.68 : 0.36)
        );
        const salienceScore = clampNumber(
            readFirstDefined(eventRecord || representative || {}, ['salience_score', 'event_salience_score'], 0),
            0,
            1,
            0
        );
        const continuationKey = toTrimmedString(
            (eventRecord && eventRecord.continuation_key)
            || (representative && representative.continuation_key)
        );
        const eventMeta = normalizeMetadata(eventRecord && eventRecord.metadata);
        const representativeMeta = normalizeMetadata(representative && representative.metadata);
        const flashbulb = !!(
            (eventRecord && eventRecord.event_is_flashbulb)
            || (representative && representative.event_is_flashbulb)
            || readFirstDefined(eventMeta, ['event_is_flashbulb', 'is_flashbulb'], false)
            || readFirstDefined(representativeMeta, ['event_is_flashbulb', 'is_flashbulb'], false)
        );
        const fallbackTs = getMemoryTimestamp(anchorRow || representative, ['last_active_at', 'created_at', 'last_injected_at']);
        const eventTs = getEventRecordTimestamp(eventRecord, fallbackTs);
        const ageHours = Number.isFinite(eventTs)
            ? Math.max(0, (safeNowMs - eventTs) / (60 * 60 * 1000))
            : Number.POSITIVE_INFINITY;
        const freshnessScore = !Number.isFinite(ageHours)
            ? 0.18
            : (ageHours <= 24 ? 1 : (ageHours <= 72 ? 0.72 : (ageHours <= 168 ? 0.42 : 0.18)));
        const reasonTags = [];
        if (hitRankScore > 0) reasonTags.push('direct_hit');
        if (unresolved) reasonTags.push('open_loop');
        if (depth === 'high') reasonTags.push('high_depth');
        if (flashbulb) reasonTags.push('flashbulb');
        if (salienceScore >= 0.6) reasonTags.push('salient');
        if (continuationKey) reasonTags.push('continuation');
        if (freshnessScore >= 0.7) reasonTags.push('recent');
        if (priorityProfile.hasHighConflict) reasonTags.push('high_conflict');
        if (priorityProfile.hasHighAttachment) reasonTags.push('high_attachment');
        if (priorityProfile.hasLingeringGrievance) reasonTags.push('grievance_pull');
        if (priorityProfile.hasLingeringAttachment) reasonTags.push('attachment_pull');

        const priority = clampNumber(
            (hitScore * 0.22)
            + (hitRankScore * 0.18)
            + ((unresolved ? 1 : 0) * 0.14)
            + (depthScore * 0.10)
            + (salienceScore * 0.10)
            + ((flashbulb ? 1 : 0) * 0.06)
            + ((continuationKey ? 1 : 0) * 0.02)
            + (freshnessScore * 0.02)
            + (priorityProfile.conflictScore * 0.08)
            + (priorityProfile.attachmentScore * 0.06)
            + (priorityProfile.priorityBucket === 'conflict_attachment' ? 0.08 : 0)
            + (reasonTags.indexOf('direct_hit') >= 0 ? 0.04 : 0),
            0,
            1,
            0
        );

        return {
            groupKey: safeGroupKey,
            eventId: eventId,
            priority: priority,
            reasonTags: normalizeTriggerKeywords(reasonTags).slice(0, 8),
            priorityBucket: priorityProfile.priorityBucket,
            signalTags: priorityProfile.signalTags,
            priorityProfile: priorityProfile,
            allowCooldownBypass: priority >= 0.82
                || (!!eventId && unresolved && hitRankScore >= 0.34)
                || priorityProfile.priorityBucket === 'conflict_attachment',
            eventSeed: !!eventId
        };
    }

    async function pickIntrusiveEventCandidate(supabase, userId, charId, roomId, surfacedRows, currentValence, currentArousal) {
        const safeUserId = toTrimmedString(userId);
        const safeCharId = toTrimmedString(charId);
        if (!supabase || !safeUserId || !safeCharId) return null;
        const nowMs = Date.now();

        const surfaced = (Array.isArray(surfacedRows) ? surfacedRows : []).map(normalizeMemoryRow).filter(Boolean);
        const excludeMemoryIds = new Set(surfaced.map(function mapId(item) {
            return toTrimmedString(item && item.memory_id);
        }).filter(Boolean));
        const excludeEventIds = new Set(surfaced.map(function mapEventId(item) {
            return getMemoryEventId(item);
        }).filter(Boolean));
        try {
            const response = await runEventTableQueryWithFallback(function buildIntrusiveQuery(fields) {
                return supabase
                    .from('hippocampus_memory_events')
                    .select(fields)
                    .eq('user_id', safeUserId)
                    .eq('char_id', safeCharId)
                    .or('is_unresolved.eq.true,status.eq.open')
                    .order('last_related_at', { ascending: false })
                    .limit(18);
            }, '反刍事件');

            if (response && response.error) {
                throw response.error;
            }

            const eventRecords = (response && Array.isArray(response.data) ? response.data : [])
                .map(normalizeEventRecordRow)
                .filter(function keepRecord(record) {
                    return !!record
                        && !excludeEventIds.has(toTrimmedString(record.id))
                        && !isRetiredEventRecord(record)
                        && isEventRecordRelevantToContext(record, roomId);
                });
            if (eventRecords.length === 0) return null;

            const referencedMemoryIds = [];
            eventRecords.forEach(function collectIds(record) {
                collectEventFragmentReferenceIds(record, {
                    memberLimit: 16,
                    totalLimit: 24,
                    detailLimit: 8,
                    flashbulbLimit: 8
                }).forEach(function pushId(id) {
                    referencedMemoryIds.push(id);
                });
            });

            const memoryRowMap = await fetchMemoryRowsMapByIds(
                supabase,
                safeUserId,
                safeCharId,
                referencedMemoryIds
            );
            const candidates = [];

            eventRecords.forEach(function buildCandidate(record) {
                const fragmentIds = collectEventFragmentReferenceIds(record, {
                    memberLimit: 16,
                    totalLimit: 24,
                    detailLimit: 8,
                    flashbulbLimit: 8
                });
                const fragments = fragmentIds
                    .map(function mapId(id) {
                        return memoryRowMap.get(toTrimmedString(id)) || null;
                    })
                    .filter(Boolean);
                if (fragments.length === 0) return;

                const candidate = buildEventCandidateFromFragments(record.id, fragments, {
                    detailPerEvent: 4,
                    eventRecords: [record],
                    detailRows: memoryRowMap
                });
                if (!candidate) return;
                const priorityProfile = deriveEventPriorityProfile(candidate, record);

                const anchorMemoryId = toTrimmedString(candidate.event_anchor_memory_id || candidate.memory_id);
                if (anchorMemoryId && excludeMemoryIds.has(anchorMemoryId)) return;

                const latestInjectedTs = getLatestInjectedTimestampFromRows(fragments, candidate);
                if (
                    Number.isFinite(latestInjectedTs)
                    && (nowMs - latestInjectedTs) < (24 * 60 * 60 * 1000)
                    && priorityProfile.priorityBucket !== 'conflict_attachment'
                    && priorityProfile.priorityScore < 0.84
                ) {
                    return;
                }

                const moodMetrics = computeMoodReorderMetrics(candidate, currentValence, currentArousal);
                const depthScore = clampNumber(
                    candidate.event_depth_score,
                    0,
                    1,
                    toTrimmedString(candidate.event_depth) === 'high'
                        ? 1
                        : (toTrimmedString(candidate.event_depth) === 'medium' ? 0.68 : 0.36)
                );
                const salienceScore = clampNumber(candidate.event_salience_score, 0, 1, 0);
                const negativePull = clampNumber(
                    (Math.max(0, -toFiniteNumber(candidate.valence, 0)) * 0.62)
                    + (clampNumber(candidate.arousal, 0, 1, 0) * 0.38),
                    0,
                    1,
                    0
                );
                const layer = normalizeMemoryLayerName(candidate.memory_layer || candidate.event_memory_layer);
                const layerBoost = layer === 'shadow'
                    ? 0.16
                    : (layer === 'wish' ? 0.08 : 0);
                const eventTs = getEventRecordTimestamp(record, getMemoryTimestamp(candidate, ['last_active_at', 'created_at']));
                const ageDays = Number.isFinite(eventTs)
                    ? Math.max(0, (Date.now() - eventTs) / (24 * 60 * 60 * 1000))
                    : 14;
                const recencyScore = clampNumber(1 - (ageDays / 21), 0, 1, 0);
                const recallScore = clampNumber(
                    0.24
                    + (candidate.event_is_unresolved ? 0.22 : 0)
                    + (negativePull * 0.16)
                    + (salienceScore * 0.10)
                    + (depthScore * 0.08)
                    + (moodMetrics.contrast ? 0.08 : 0)
                    + (moodMetrics.resonance ? 0.05 : 0)
                    + layerBoost
                    + (candidate.continuation_key ? 0.05 : 0)
                    + (recencyScore * 0.04)
                    + (priorityProfile.conflictScore * 0.10)
                    + (priorityProfile.attachmentScore * 0.06)
                    + (priorityProfile.priorityBucket === 'conflict_attachment' ? 0.08 : 0),
                    0,
                    1,
                    0
                );
                const cooling = isIntrusiveEventRecallCooling(safeUserId, safeCharId, record.id, nowMs, priorityProfile);
                if (cooling && recallScore < 0.86) {
                    return;
                }

                candidates.push(Object.assign({}, candidate, {
                    _isIntrusive: true,
                    recall_score: recallScore,
                    priority_bucket: priorityProfile.priorityBucket,
                    signal_tags: priorityProfile.signalTags,
                    _intrusiveCooling: cooling,
                    last_injected_at: Number.isFinite(latestInjectedTs)
                        ? new Date(latestInjectedTs).toISOString()
                        : candidate.last_injected_at
                }));
            });

            if (candidates.length === 0) return null;
            candidates.sort(function sortCandidates(left, right) {
                if (toFiniteNumber(right && right.recall_score, 0) !== toFiniteNumber(left && left.recall_score, 0)) {
                    return toFiniteNumber(right && right.recall_score, 0) - toFiniteNumber(left && left.recall_score, 0);
                }
                return getMemoryTimestamp(right, ['last_active_at', 'created_at', 'last_injected_at'])
                    - getMemoryTimestamp(left, ['last_active_at', 'created_at', 'last_injected_at']);
            });

            const picked = sampleWarmEventsByWeight(candidates, 1)[0] || candidates[0] || null;
            if (picked) {
                console.log(
                    `[海马体][浮现] 事件化反刍命中：event=${toTrimmedString(picked.event_id) || 'unknown'}, bucket=${toTrimmedString(picked.priority_bucket) || 'background'}, score=${toFiniteNumber(picked.recall_score, 0).toFixed(2)}, title="${toTrimmedString(picked.event_title).slice(0, 18)}"`
                );
            }
            return picked;
        } catch (error) {
            if (!isMissingEventTableError(error)) {
                console.warn('[海马体][浮现] 事件化反刍候选读取失败，已回退单条 shadow 记忆:', error && error.message ? error.message : error);
            }
            return null;
        }
    }

    /**
     * 事件化时间涟漪：同一事件只打一次激活，优先使用事件锚点/事件时间做代表种子。
     */
    function normalizeRippleActivationRpcResult(payload) {
        const row = Array.isArray(payload)
            ? (payload[0] || null)
            : (payload && typeof payload === 'object' ? payload : null);

        if (row && typeof row === 'object') {
            return {
                affected: toFiniteNumber(
                    readFirstDefined(row, ['affected_memory_count', 'affected', 'affected_count', 'affectedTotal'], 0),
                    0
                ),
                targetEventCount: toFiniteNumber(
                    readFirstDefined(row, ['target_event_count', 'targetEventCount', 'target_events', 'event_count'], 0),
                    0
                ),
                rippleLogCount: toFiniteNumber(
                    readFirstDefined(row, ['ripple_log_count', 'rippleLogCount', 'log_count'], 0),
                    0
                ),
                targetEventIds: (Array.isArray(row.target_event_ids) ? row.target_event_ids : (Array.isArray(row.targetEventIds) ? row.targetEventIds : []))
                    .map(toTrimmedString)
                    .filter(Boolean)
            };
        }

        return {
            affected: toFiniteNumber(payload, 0),
            targetEventCount: 0,
            rippleLogCount: 0,
            targetEventIds: []
        };
    }

    async function invokeRippleActivationRpc(supabase, userId, charId, plan, rippleRangeDays, nowMs) {
        const eventId = toTrimmedString(plan && plan.eventId);
        const requestTs = Number.isFinite(nowMs) ? nowMs : Date.now();
        const legacyParams = {
            p_user_id: userId,
            p_char_id: charId,
            p_seed_memory_id: plan.seedMemoryId,
            p_seed_created_at: plan.seedAt,
            p_range_days: rippleRangeDays
        };
        const shouldTryEventRpc = shouldProbeEventRippleRpc(supabase, eventId, requestTs);

        if (eventId && shouldTryEventRpc) {
            try {
                const eventResponse = await supabase.rpc('ripple_activate_event_nearby', {
                    p_user_id: userId,
                    p_char_id: charId,
                    p_source_event_id: eventId,
                    p_seed_memory_id: plan.seedMemoryId,
                    p_seed_created_at: plan.seedAt,
                    p_range_days: rippleRangeDays,
                    p_priority_score: toFiniteNumber(plan && plan.priority, 0),
                    p_priority_bucket: toTrimmedString(plan && plan.priorityBucket) || null,
                    p_reason_tags: Array.isArray(plan && plan.reasonTags) ? plan.reasonTags : []
                });
                if (eventResponse && eventResponse.error) {
                    throw eventResponse.error;
                }
                markEventRippleRpcAvailability(supabase, true, requestTs);
                return Object.assign(
                    { rpcMode: 'event' },
                    normalizeRippleActivationRpcResult(eventResponse && eventResponse.data)
                );
            } catch (error) {
                if (isMissingEventRippleRpcError(error)) {
                    markEventRippleRpcAvailability(supabase, false, requestTs);
                    console.log('[海马体][搜索] 事件涟漪 RPC 未就绪，已回退旧版 ripple_activate_nearby。');
                } else {
                    throw error;
                }
            }
        }

        const legacyResponse = await supabase.rpc('ripple_activate_nearby', legacyParams);
        if (legacyResponse && legacyResponse.error) {
            throw legacyResponse.error;
        }
        return Object.assign(
            { rpcMode: eventId && !shouldTryEventRpc ? 'legacy_cached_missing' : 'legacy' },
            normalizeRippleActivationRpcResult(legacyResponse && legacyResponse.data)
        );
    }

    async function runRippleActivation(supabase, userId, charId, memories, options) {
        const source = (Array.isArray(memories) ? memories : []).map(normalizeMemoryRow).filter(Boolean);
        if (!supabase || source.length === 0) {
            return {
                seedCount: 0,
                eventSeedCount: 0,
                affectedTotal: 0,
                dbCooldownSkipped: 0,
                dbSeedCooldownSkipped: 0,
                dbTargetCooldownSkipped: 0,
                dbOverlapCooldownSkipped: 0,
                batchSkipped: 0,
                recentSuppressedCount: 0,
                targetEventCount: 0,
                rippleLogCount: 0,
                eventRpcCount: 0,
                legacyRpcCount: 0,
                cachedLegacyRpcCount: 0,
                rpcProbeSuppressedCount: 0
            };
        }

        const optionsSource = options && typeof options === 'object' ? options : {};
        const rippleRangeDays = Math.max(1, Math.min(7, Math.floor(toFiniteNumber(optionsSource.rippleRangeDays, 3))));
        const nowMs = Number.isFinite(optionsSource.nowMs) ? optionsSource.nowMs : Date.now();
        const maxSeedGroups = Math.max(1, Math.min(4, Math.floor(toFiniteNumber(optionsSource.maxSeedGroups, 3))));
        const rippleBatchId = toTrimmedString(optionsSource.rippleBatchId || optionsSource.searchBatchId);
        const groupedSeeds = new Map();
        source.forEach(function groupMemory(memory) {
            const eventId = getMemoryEventId(memory);
            const memoryId = toTrimmedString(memory && memory.memory_id);
            const groupKey = eventId ? `event:${eventId}` : `memory:${memoryId}`;
            if (!groupKey || groupKey.endsWith(':')) return;
            if (!groupedSeeds.has(groupKey)) {
                groupedSeeds.set(groupKey, {
                    groupKey: groupKey,
                    eventId: eventId,
                    hits: []
                });
            }
            groupedSeeds.get(groupKey).hits.push(memory);
        });
        if (groupedSeeds.size === 0) {
            return {
                seedCount: 0,
                eventSeedCount: 0,
                affectedTotal: 0,
                dbCooldownSkipped: 0,
                dbSeedCooldownSkipped: 0,
                dbTargetCooldownSkipped: 0,
                dbOverlapCooldownSkipped: 0,
                batchSkipped: 0,
                recentSuppressedCount: 0,
                targetEventCount: 0,
                rippleLogCount: 0,
                eventRpcCount: 0,
                legacyRpcCount: 0,
                cachedLegacyRpcCount: 0,
                rpcProbeSuppressedCount: 0
            };
        }

        const groups = Array.from(groupedSeeds.values());
        const eventIds = groups.map(function mapEventId(item) {
            return toTrimmedString(item && item.eventId);
        }).filter(Boolean);
        const eventRecordMap = eventIds.length > 0
            ? await fetchEventRecordsMap(supabase, userId, charId, eventIds)
            : new Map();
        const anchorIds = [];
        eventRecordMap.forEach(function collectAnchorId(record) {
            const anchorId = toTrimmedString(record && record.anchor_memory_id);
            if (anchorId) anchorIds.push(anchorId);
        });
        const anchorRowMap = anchorIds.length > 0
            ? await fetchMemoryRowsMapByIds(supabase, userId, charId, anchorIds)
            : new Map();
        const seedPlans = groups.map(function buildSeedPlan(group) {
            const representativeHit = pickRepresentativeMemoryByScore(group && group.hits);
            const eventId = toTrimmedString(group && group.eventId);
            const eventRecord = eventId ? (eventRecordMap.get(eventId) || null) : null;
            const anchorMemoryId = toTrimmedString(eventRecord && eventRecord.anchor_memory_id);
            const anchorRow = anchorMemoryId ? (anchorRowMap.get(anchorMemoryId) || null) : null;
            const seedMemoryId = anchorMemoryId || toTrimmedString(representativeHit && representativeHit.memory_id);
            const fallbackTs = getMemoryTimestamp(anchorRow || representativeHit, ['created_at', 'last_active_at', 'last_injected_at']);
            const eventTs = getEventRecordTimestamp(eventRecord, fallbackTs);
            const seedAt = Number.isFinite(eventTs)
                ? new Date(eventTs).toISOString()
                : toTrimmedString(
                    (anchorRow && (anchorRow.created_at || anchorRow.last_active_at))
                    || (representativeHit && (representativeHit.created_at || representativeHit.last_active_at))
                );
            const priorityPlan = deriveRippleSeedPlan(group, eventRecord, representativeHit, anchorRow, nowMs);
            const cooling = isRippleEventActivationCooling(
                userId,
                charId,
                priorityPlan.groupKey,
                nowMs,
                eventId,
                priorityPlan.priorityProfile
            );

            return {
                group: group,
                representativeHit: representativeHit,
                eventId: eventId,
                eventRecord: eventRecord,
                anchorRow: anchorRow,
                seedMemoryId: seedMemoryId,
                seedAt: seedAt,
                priority: priorityPlan.priority,
                reasonTags: priorityPlan.reasonTags,
                priorityBucket: priorityPlan.priorityBucket,
                priorityProfile: priorityPlan.priorityProfile,
                eventSeed: priorityPlan.eventSeed,
                allowCooldownBypass: priorityPlan.allowCooldownBypass,
                cooling: cooling
            };
        }).sort(function sortPlans(left, right) {
            if (toFiniteNumber(right && right.priority, 0) !== toFiniteNumber(left && left.priority, 0)) {
                return toFiniteNumber(right && right.priority, 0) - toFiniteNumber(left && left.priority, 0);
            }
            return getMemoryTimestamp(right && (right.anchorRow || right.representativeHit), ['last_active_at', 'created_at', 'last_injected_at'])
                - getMemoryTimestamp(left && (left.anchorRow || left.representativeHit), ['last_active_at', 'created_at', 'last_injected_at']);
        });

        const selectedPlans = seedPlans.slice(0, maxSeedGroups);
        const selectedEventIds = selectedPlans.map(function mapSelectedEventId(plan) {
            return toTrimmedString(plan && plan.eventId);
        }).filter(Boolean);
        const maxDbRippleCooldownMs = selectedPlans.reduce(function pickMaxCooldown(maxValue, plan) {
            return Math.max(maxValue, deriveEventRecallCooldownMs('ripple', plan && plan.priorityProfile));
        }, 0);
        const dbRippleCooldownLogMap = selectedEventIds.length > 0 && maxDbRippleCooldownMs > 0
            ? await fetchRecentRippleCooldownLogMap(supabase, userId, charId, selectedEventIds, {
                sinceMs: nowMs - maxDbRippleCooldownMs,
                maxRows: selectedEventIds.length * 6
            })
            : new Map();
        const rippleResults = await Promise.all(selectedPlans.map(function queueRipple(plan) {
            const eventId = toTrimmedString(plan && plan.eventId);
            const groupKey = toTrimmedString(plan && plan.group && plan.group.groupKey);
            const batchDuplicate = hasRippleBatchActivation(userId, charId, rippleBatchId, groupKey, nowMs);
            const recentSuppressed = isRippleActivationReentrySuppressed(
                userId,
                charId,
                groupKey,
                nowMs,
                plan && plan.priorityProfile
            );
            const rippleCooldownMs = deriveEventRecallCooldownMs('ripple', plan && plan.priorityProfile);
            const dbRippleLogEntry = eventId ? (dbRippleCooldownLogMap.get(eventId) || null) : null;
            const dbSeedCooling = !!(dbRippleLogEntry
                && Number.isFinite(dbRippleLogEntry.seedCreatedAtMs)
                && (nowMs - dbRippleLogEntry.seedCreatedAtMs) < rippleCooldownMs);
            const dbTargetCooling = !!(dbRippleLogEntry
                && Number.isFinite(dbRippleLogEntry.targetCreatedAtMs)
                && (nowMs - dbRippleLogEntry.targetCreatedAtMs) < rippleCooldownMs);
            const dbCooling = !!(dbSeedCooling || dbTargetCooling);
            const cooling = !!(plan && plan.cooling) || dbCooling;
            const shouldSkipForCooldown = !!(cooling && !(plan && plan.allowCooldownBypass));

            if (batchDuplicate) {
                return Promise.resolve({
                    skipped: true,
                    affected: 0,
                    eventSeed: !!eventId,
                    cooling: cooling,
                    dbCooling: dbCooling,
                    dbSeedCooling: dbSeedCooling,
                    dbTargetCooling: dbTargetCooling,
                    coolingBypassed: false,
                    batchSkipped: true,
                    recentSuppressed: false,
                    rpcProbeSuppressed: false,
                    priority: toFiniteNumber(plan && plan.priority, 0),
                    priorityBucket: toTrimmedString(plan && plan.priorityBucket),
                    reasonTags: Array.isArray(plan && plan.reasonTags) ? plan.reasonTags : [],
                    targetEventCount: 0,
                    rippleLogCount: 0,
                    targetEventIds: [],
                    rpcMode: 'batch_skip'
                });
            }

            if (recentSuppressed) {
                return Promise.resolve({
                    skipped: true,
                    affected: 0,
                    eventSeed: !!eventId,
                    cooling: cooling,
                    dbCooling: dbCooling,
                    dbSeedCooling: dbSeedCooling,
                    dbTargetCooling: dbTargetCooling,
                    coolingBypassed: false,
                    batchSkipped: false,
                    recentSuppressed: true,
                    rpcProbeSuppressed: false,
                    priority: toFiniteNumber(plan && plan.priority, 0),
                    priorityBucket: toTrimmedString(plan && plan.priorityBucket),
                    reasonTags: Array.isArray(plan && plan.reasonTags) ? plan.reasonTags : [],
                    targetEventCount: 0,
                    rippleLogCount: 0,
                    targetEventIds: [],
                    rpcMode: 'recent_skip'
                });
            }

            if (shouldSkipForCooldown) {
                return Promise.resolve({
                    skipped: true,
                    affected: 0,
                    eventSeed: !!eventId,
                    cooling: true,
                    dbCooling: dbCooling,
                    dbSeedCooling: dbSeedCooling,
                    dbTargetCooling: dbTargetCooling,
                    coolingBypassed: false,
                    batchSkipped: false,
                    recentSuppressed: false,
                    rpcProbeSuppressed: false,
                    priority: toFiniteNumber(plan && plan.priority, 0),
                    priorityBucket: toTrimmedString(plan && plan.priorityBucket),
                    reasonTags: Array.isArray(plan && plan.reasonTags) ? plan.reasonTags : [],
                    targetEventCount: 0,
                    rippleLogCount: 0,
                    targetEventIds: [],
                    rpcMode: 'cooldown_skip'
                });
            }

            if (!plan || !plan.seedMemoryId || !plan.seedAt) {
                return Promise.resolve({
                    skipped: true,
                    affected: 0,
                    eventSeed: !!eventId,
                    cooling: cooling,
                    dbCooling: dbCooling,
                    dbSeedCooling: dbSeedCooling,
                    dbTargetCooling: dbTargetCooling,
                    coolingBypassed: false,
                    batchSkipped: false,
                    recentSuppressed: false,
                    rpcProbeSuppressed: false,
                    priority: toFiniteNumber(plan && plan.priority, 0),
                    priorityBucket: toTrimmedString(plan && plan.priorityBucket),
                    reasonTags: Array.isArray(plan && plan.reasonTags) ? plan.reasonTags : [],
                    targetEventCount: 0,
                    rippleLogCount: 0,
                    targetEventIds: [],
                    rpcMode: 'invalid_seed'
                });
            }

            markRippleBatchActivation(userId, charId, rippleBatchId, groupKey, {
                at: nowMs,
                eventId: eventId,
                seedMemoryId: plan.seedMemoryId,
                status: 'attempted'
            });

            return invokeRippleActivationRpc(supabase, userId, charId, plan, rippleRangeDays, nowMs).then(function onRippleDone(result) {
                const normalized = normalizeRippleActivationRpcResult(result);
                const affected = toFiniteNumber(normalized && normalized.affected, 0);
                const targetEventCount = toFiniteNumber(normalized && normalized.targetEventCount, 0);
                const rippleLogCount = toFiniteNumber(normalized && normalized.rippleLogCount, 0);
                const targetEventIds = Array.isArray(normalized && normalized.targetEventIds)
                    ? normalized.targetEventIds
                    : [];
                const rpcMode = toTrimmedString(result && result.rpcMode) || 'legacy';
                markRippleEventActivated(userId, charId, groupKey, {
                    at: nowMs,
                    priority: plan.priority,
                    priorityBucket: plan.priorityBucket,
                    eventId: eventId,
                    seedMemoryId: plan.seedMemoryId,
                    affected: affected,
                    reasonTags: plan.reasonTags,
                    targetEventCount: targetEventCount,
                    rippleLogCount: rippleLogCount,
                    rpcMode: rpcMode
                });
                return {
                    skipped: false,
                    affected: affected,
                    eventSeed: !!eventId,
                    cooling: cooling,
                    dbCooling: dbCooling,
                    dbSeedCooling: dbSeedCooling,
                    dbTargetCooling: dbTargetCooling,
                    coolingBypassed: cooling && !!plan.allowCooldownBypass,
                    batchSkipped: false,
                    recentSuppressed: false,
                    rpcProbeSuppressed: rpcMode === 'legacy_cached_missing',
                    priority: toFiniteNumber(plan.priority, 0),
                    priorityBucket: toTrimmedString(plan.priorityBucket),
                    reasonTags: Array.isArray(plan.reasonTags) ? plan.reasonTags : [],
                    targetEventCount: targetEventCount,
                    rippleLogCount: rippleLogCount,
                    targetEventIds: targetEventIds,
                    rpcMode: rpcMode
                };
            }).catch(function onRippleFailed(error) {
                console.warn('[海马体][搜索] 时间涟漪调用失败，已跳过:', error && error.message ? error.message : error);
                return {
                    skipped: true,
                    affected: 0,
                    eventSeed: !!eventId,
                    cooling: cooling,
                    dbCooling: dbCooling,
                    dbSeedCooling: dbSeedCooling,
                    dbTargetCooling: dbTargetCooling,
                    coolingBypassed: false,
                    batchSkipped: false,
                    recentSuppressed: false,
                    rpcProbeSuppressed: false,
                    priority: toFiniteNumber(plan && plan.priority, 0),
                    priorityBucket: toTrimmedString(plan && plan.priorityBucket),
                    reasonTags: Array.isArray(plan && plan.reasonTags) ? plan.reasonTags : [],
                    targetEventCount: 0,
                    rippleLogCount: 0,
                    targetEventIds: [],
                    rpcMode: 'failed'
                };
            });
        }));

        const affectedTotal = rippleResults.reduce(function sumAffected(total, item) {
            return total + toFiniteNumber(item && item.affected, 0);
        }, 0);
        const eventSeedCount = rippleResults.reduce(function countEventSeeds(total, item) {
            return total + (item && item.eventSeed ? 1 : 0);
        }, 0);
        const coolingSkipped = rippleResults.reduce(function countCooling(total, item) {
            return total + (item && item.cooling && item.skipped ? 1 : 0);
        }, 0);
        const dbCooldownSkipped = rippleResults.reduce(function countDbCooling(total, item) {
            return total + (item && item.dbCooling && item.skipped ? 1 : 0);
        }, 0);
        const dbSeedCooldownSkipped = rippleResults.reduce(function countDbSeedCooling(total, item) {
            return total + (item && item.dbSeedCooling && item.skipped ? 1 : 0);
        }, 0);
        const dbTargetCooldownSkipped = rippleResults.reduce(function countDbTargetCooling(total, item) {
            return total + (item && item.dbTargetCooling && item.skipped ? 1 : 0);
        }, 0);
        const dbOverlapCooldownSkipped = rippleResults.reduce(function countDbOverlapCooling(total, item) {
            return total + (item && item.dbSeedCooling && item.dbTargetCooling && item.skipped ? 1 : 0);
        }, 0);
        const coolingBypassed = rippleResults.reduce(function countBypass(total, item) {
            return total + (item && item.coolingBypassed ? 1 : 0);
        }, 0);
        const batchSkipped = rippleResults.reduce(function countBatchSkipped(total, item) {
            return total + (item && item.batchSkipped ? 1 : 0);
        }, 0);
        const recentSuppressedCount = rippleResults.reduce(function countRecentSuppressed(total, item) {
            return total + (item && item.recentSuppressed ? 1 : 0);
        }, 0);
        const targetEventCount = rippleResults.reduce(function sumTargetEvents(total, item) {
            return total + toFiniteNumber(item && item.targetEventCount, 0);
        }, 0);
        const rippleLogCount = rippleResults.reduce(function sumRippleLogs(total, item) {
            return total + toFiniteNumber(item && item.rippleLogCount, 0);
        }, 0);
        const eventRpcCount = rippleResults.reduce(function countEventRpc(total, item) {
            return total + (toTrimmedString(item && item.rpcMode) === 'event' ? 1 : 0);
        }, 0);
        const legacyRpcCount = rippleResults.reduce(function countLegacyRpc(total, item) {
            const mode = toTrimmedString(item && item.rpcMode);
            return total + (mode === 'legacy' || mode === 'legacy_cached_missing' ? 1 : 0);
        }, 0);
        const cachedLegacyRpcCount = rippleResults.reduce(function countCachedLegacyRpc(total, item) {
            return total + (toTrimmedString(item && item.rpcMode) === 'legacy_cached_missing' ? 1 : 0);
        }, 0);
        const rpcProbeSuppressedCount = rippleResults.reduce(function countProbeSuppressed(total, item) {
            return total + (item && item.rpcProbeSuppressed ? 1 : 0);
        }, 0);
        console.log(
            `[海马体][搜索] 时间涟漪：执行${rippleResults.length}/${seedPlans.length}轮，事件种子${eventSeedCount}个，碎片种子${Math.max(0, rippleResults.length - eventSeedCount)}个，冷却跳过${coolingSkipped}个，批内去重${batchSkipped}个，再压制${recentSuppressedCount}个，强穿冷却${coolingBypassed}个，影响${affectedTotal}条，命中事件${targetEventCount}个，落库日志${rippleLogCount}条，eventRPC=${eventRpcCount}，legacyRPC=${legacyRpcCount}，cachedLegacy=${cachedLegacyRpcCount}，probeSkip=${rpcProbeSuppressedCount}。`
        );
        if (dbCooldownSkipped > 0) {
            console.log(`[海马体][搜索] 时间涟漪库冷却额外拦截 ${dbCooldownSkipped} 个事件种子（seed=${dbSeedCooldownSkipped}, target=${dbTargetCooldownSkipped}, both=${dbOverlapCooldownSkipped}）。`);
        }
        return {
            seedCount: rippleResults.length,
            eventSeedCount: eventSeedCount,
            affectedTotal: affectedTotal,
            coolingSkipped: coolingSkipped,
            dbCooldownSkipped: dbCooldownSkipped,
            dbSeedCooldownSkipped: dbSeedCooldownSkipped,
            dbTargetCooldownSkipped: dbTargetCooldownSkipped,
            dbOverlapCooldownSkipped: dbOverlapCooldownSkipped,
            batchSkipped: batchSkipped,
            recentSuppressedCount: recentSuppressedCount,
            coolingBypassed: coolingBypassed,
            targetEventCount: targetEventCount,
            rippleLogCount: rippleLogCount,
            eventRpcCount: eventRpcCount,
            legacyRpcCount: legacyRpcCount,
            cachedLegacyRpcCount: cachedLegacyRpcCount,
            rpcProbeSuppressedCount: rpcProbeSuppressedCount
        };
    }

    /**
     * 拉取自动浮现的表层记忆，默认最多返回 3 条。
     */
    async function getSurfaceMemories(userId, charId, roomId, currentValence, currentArousal, options) {
        if (!isEnabled()) return [];

        const supabase = getSupabaseClient();
        if (!supabase) return [];

        const optionsSource = options && typeof options === 'object'
            ? options
            : (currentArousal && typeof currentArousal === 'object'
                ? currentArousal
                : (currentValence && typeof currentValence === 'object'
                    ? currentValence
                    : {}));
        const safeCurrentValence = Number.isFinite(Number(currentValence))
            ? Number(currentValence)
            : toFiniteNumber(optionsSource.currentValence, null);
        const safeCurrentArousal = Number.isFinite(Number(currentArousal))
            ? Number(currentArousal)
            : toFiniteNumber(optionsSource.currentArousal, null);

        try {
            console.log(`[海马体][浮现] 开始浮现，charId=${toTrimmedString(charId) || 'unknown'}，roomId=${toTrimmedString(roomId) || 'private'}`);
            const { data, error } = await supabase.rpc('pull_surface_memories', {
                p_user_id: userId,
                p_char_id: charId,
                p_room_id: roomId || null,
                p_limit: 3,
                p_include_private_when_room: true,
                p_include_resolved: false,
                p_min_score: state.settings.surfaceMinScore,
                p_cooldown_minutes: state.settings.surfaceCooldownMinutes,
                p_current_valence: Number.isFinite(safeCurrentValence) ? safeCurrentValence : null,
                p_current_arousal: Number.isFinite(safeCurrentArousal) ? safeCurrentArousal : null
            });

            if (error) throw error;

            const surfaced = (data || [])
                .map(normalizeMemoryRow)
                .filter(Boolean)
                .slice(0, 3);
            const surfacedHydration = await fetchEventRecallHydrationBundle(
                supabase,
                userId,
                charId,
                surfaced
            );
            const shouldFetchSurfaceDirectEvents = state.settings.enableEventMixedRecall
                && (
                    surfaced.length < 3
                    || surfaced.some(function hasStandalone(row) {
                        return !getMemoryEventId(row);
                    })
                );
            const surfaceDirectEvents = shouldFetchSurfaceDirectEvents
                ? await fetchSurfaceDirectEventCandidates(
                    supabase,
                    userId,
                    charId,
                    roomId || null,
                    surfaced,
                    safeCurrentValence,
                    safeCurrentArousal,
                    1,
                    {
                        nowMs: Date.now(),
                        maxMembersPerEvent: 10,
                        detailPerEvent: 4
                    }
                )
                : [];
            console.log(`[海马体][浮现] RPC 调用成功，返回 ${surfaced.length} 条。`);

            function finalizeSurfaceRows(rows, hydrationBundle, directEventRows) {
                const mixedRows = buildMixedRecallCandidates(rows, {
                    source: 'surface',
                    maxTotal: 3,
                    eventRecords: hydrationBundle.eventRecords,
                    detailRows: hydrationBundle.detailRows
                });
                return applyCurrentMoodReorder(
                    mergeFinalRecallCandidates(
                        [mixedRows, directEventRows],
                        {
                            maxTotal: 3
                        }
                    ),
                    safeCurrentValence,
                    safeCurrentArousal,
                    '浮现'
                );
            }

            if (!isV2Enabled() || !state.settings.enableRumination) {
                return finalizeSurfaceRows(surfaced, surfacedHydration, surfaceDirectEvents);
            }

            const tendency = clampNumber(
                readFirstDefined(optionsSource, ['ruminationTendency'], state.settings.ruminationTendency),
                0,
                1,
                0.3
            );
            const probability = tendency * 0.2;
            const roll = Math.random();
            const hit = roll < probability;
            console.log(`[海马体][浮现] 反刍检查：tendency=${tendency.toFixed(2)}, 概率=${probability.toFixed(2)}, roll=${roll.toFixed(4)}, 命中=${hit}`);

            if (!hit) {
                return finalizeSurfaceRows(surfaced, surfacedHydration, surfaceDirectEvents);
            }
            let intrusiveMemory = await pickIntrusiveEventCandidate(
                supabase,
                userId,
                charId,
                roomId,
                surfaced,
                safeCurrentValence,
                safeCurrentArousal
            );

            if (!intrusiveMemory) {
                const excludeIds = surfaced
                    .map(function mapId(item) {
                        return toTrimmedString(item && item.memory_id);
                    })
                    .filter(Boolean);

                const shadowResult = await supabase.rpc('get_random_shadow_memory', {
                    p_user_id: userId,
                    p_char_id: charId,
                    p_exclude_ids: excludeIds
                });
                if (shadowResult && shadowResult.error) throw shadowResult.error;

                const shadowRaw = Array.isArray(shadowResult && shadowResult.data) && shadowResult.data[0]
                    ? shadowResult.data[0]
                    : null;
                intrusiveMemory = normalizeMemoryRow(shadowRaw);
                if (!intrusiveMemory) {
                    return finalizeSurfaceRows(surfaced, surfacedHydration, surfaceDirectEvents);
                }

                const lastInjectedTs = getMemoryTimestamp(intrusiveMemory, ['last_injected_at']);
                if (
                    Number.isFinite(lastInjectedTs)
                    && (Date.now() - lastInjectedTs) < (24 * 60 * 60 * 1000)
                ) {
                    console.log('[海马体][浮现] 反刍命中但触发 cooldown，24 小时内已注入过该阴影记忆。');
                    return finalizeSurfaceRows(surfaced, surfacedHydration, surfaceDirectEvents);
                }
                intrusiveMemory._isIntrusive = true;
            }

            const combined = surfaced.slice();
            const intrusiveEventId = getMemoryEventId(intrusiveMemory);
            if (!combined.some(function hasSameId(item) {
                const memoryId = toTrimmedString(item && item.memory_id);
                const eventId = getMemoryEventId(item);
                return memoryId === toTrimmedString(intrusiveMemory.memory_id)
                    || (!!intrusiveEventId && eventId === intrusiveEventId);
            })) {
                combined.push(intrusiveMemory);
            }
            if (intrusiveEventId) {
                const intrusivePriorityProfile = deriveEventPriorityProfile(intrusiveMemory, null);
                markIntrusiveEventRecalled(userId, charId, intrusiveEventId, Date.now(), intrusivePriorityProfile);
            }
            const combinedHydration = await fetchEventRecallHydrationBundle(
                supabase,
                userId,
                charId,
                combined
            );
            return finalizeSurfaceRows(combined, {
                eventRecords: combinedHydration.eventRecords.size > 0
                    ? combinedHydration.eventRecords
                    : surfacedHydration.eventRecords,
                detailRows: combinedHydration.detailRows.size > 0
                    ? combinedHydration.detailRows
                    : surfacedHydration.detailRows
            }, surfaceDirectEvents);
        } catch (error) {
            console.warn('[海马体] 浮现记忆失败，已静默跳过:', error && error.message ? error.message : error);
            return [];
        }
    }

    /**
     * 拉取最近 48 小时内的记忆，帮助模型维持“最近发生的事更清晰”的体验。
     */
    async function getRecentMemories(userId, charId, roomId, hours, limit) {
        if (!isEnabled()) return [];

        const supabase = getSupabaseClient();
        if (!supabase) return [];

        const safeUserId = toTrimmedString(userId);
        const safeCharId = toTrimmedString(charId);
        const safeRoomId = toTrimmedString(roomId);
        const safeHours = Math.max(1, Math.min(168, Math.floor(toFiniteNumber(hours, 48))));
        const safeLimit = Math.max(1, Math.min(10, Math.floor(toFiniteNumber(limit, 3))));
        const cutoffIso = new Date(Date.now() - safeHours * 60 * 60 * 1000).toISOString();

        if (!safeUserId || !safeCharId) return [];

        console.log(`[海马体][近期记忆] 开始拉取最近 ${safeHours} 小时记忆，角色=${safeCharId}`);

        const selectFields = 'id,user_id,char_id,room_id,context_scope,content,valence,arousal,importance,activation_count,resolved,event_id,event_title,event_summary,event_status,event_depth,event_date,event_fragment_count,event_is_unresolved,event_salience_score,event_depth_score,continuation_key,event_anchor_memory_id,event_detail_memory_ids,metadata,created_at,last_active_at,last_injected_at';
        const legacySelectFields = 'id,user_id,char_id,room_id,context_scope,content,valence,arousal,importance,activation_count,resolved,metadata,created_at,last_active_at,last_injected_at';

        function buildRecentQuery(contextScope, fields) {
            let query = supabase
                .from('hippocampus_memories')
                .select(fields)
                .eq('user_id', safeUserId)
                .eq('char_id', safeCharId)
                .eq('context_scope', contextScope);
            if (contextScope === 'room') {
                query = query.eq('room_id', safeRoomId);
            }
            return query
                .gte('created_at', cutoffIso)
                .order('created_at', { ascending: false })
                .limit(safeLimit * 3);
        }

        function buildRecentTasks(fields) {
            const nextTasks = [
                buildRecentQuery('private', fields)
            ];
            if (safeRoomId) {
                nextTasks.push(buildRecentQuery('room', fields));
            }
            return nextTasks;
        }

        try {
            let settled = await Promise.allSettled(buildRecentTasks(selectFields));
            const shouldFallbackToLegacyFields = settled.some(function needLegacy(item) {
                if (item.status !== 'fulfilled') return false;
                return !!(item.value && item.value.error && isMissingEventColumnError(item.value.error));
            });
            if (shouldFallbackToLegacyFields) {
                console.log('[海马体][近期记忆] 检测到数据库尚未补齐事件字段，回退到旧字段查询。');
                settled = await Promise.allSettled(buildRecentTasks(legacySelectFields));
            }
            let rows = [];

            settled.forEach(function consumeResult(item, index) {
                if (item.status !== 'fulfilled') {
                    console.warn(`[海马体][近期记忆] 第 ${index + 1} 路查询失败:`, item.reason && item.reason.message ? item.reason.message : item.reason);
                    return;
                }

                if (item.value && item.value.error) {
                    console.warn(`[海马体][近期记忆] 第 ${index + 1} 路查询返回错误:`, item.value.error.message || item.value.error);
                    return;
                }

                rows = rows.concat(item.value && Array.isArray(item.value.data) ? item.value.data : []);
            });

            const merged = new Map();
            rows.forEach(function mergeRow(row) {
                const normalized = normalizeMemoryRow(row);
                if (!normalized || !normalized.memory_id) return;
                if (!merged.has(normalized.memory_id)) {
                    merged.set(normalized.memory_id, normalized);
                    return;
                }

                const existing = merged.get(normalized.memory_id);
                const existingTs = getMemoryTimestamp(existing, ['created_at', 'last_active_at', 'last_injected_at']);
                const incomingTs = getMemoryTimestamp(normalized, ['created_at', 'last_active_at', 'last_injected_at']);
                if (incomingTs > existingTs) {
                    merged.set(normalized.memory_id, normalized);
                }
            });

            const recentPoolLimit = Math.max(safeLimit, Math.min(48, safeLimit * 6));
            const result = Array.from(merged.values())
                .sort(function sortByCreatedAtDesc(a, b) {
                    const aTime = getMemoryTimestamp(a, ['created_at', 'last_active_at', 'last_injected_at']);
                    const bTime = getMemoryTimestamp(b, ['created_at', 'last_active_at', 'last_injected_at']);
                    if (!Number.isFinite(aTime) && !Number.isFinite(bTime)) return 0;
                    if (!Number.isFinite(aTime)) return 1;
                    if (!Number.isFinite(bTime)) return -1;
                    return bTime - aTime;
                })
                .slice(0, recentPoolLimit);
            const recentHydration = await fetchEventRecallHydrationBundle(
                supabase,
                safeUserId,
                safeCharId,
                result,
                {
                    maxDetailsPerEvent: 6
                }
            );
            const recentDirectEvents = await fetchRecentDirectEventCandidates(
                supabase,
                safeUserId,
                safeCharId,
                safeRoomId || null,
                safeHours,
                Math.max(1, Math.min(3, safeLimit)),
                {
                    nowMs: Date.now(),
                    maxMembersPerEvent: 10,
                    detailPerEvent: 4
                }
            );

            console.log(`[海马体][近期记忆] 拉取完成，碎片池 ${result.length} 条，事件直出 ${recentDirectEvents.length} 条。`);
            return buildRecentWindowMixedRecall(result, safeUserId, safeCharId, safeLimit, {
                semanticHint: 0.5,
                eventRecords: recentHydration.eventRecords,
                detailRows: recentHydration.detailRows,
                directEventRows: recentDirectEvents
            });
        } catch (error) {
            console.warn('[海马体][近期记忆] 拉取失败，已静默跳过:', error && error.message ? error.message : error);
            return [];
        }
    }

    /**
     * 仅按时间窗抓取记忆候选，作为“你记得几号/几天前那件事吗”这类提问的兜底召回。
     */
    async function fetchTimeWindowRecallCandidates(supabase, userId, charId, roomId, startIso, endIso, limit) {
        const safeUserId = toTrimmedString(userId);
        const safeCharId = toTrimmedString(charId);
        const safeRoomId = toTrimmedString(roomId);
        const startStamp = Date.parse(toTrimmedString(startIso));
        const endStamp = Date.parse(toTrimmedString(endIso));
        const safeLimit = Math.max(1, Math.min(8, Math.floor(toFiniteNumber(limit, 4))));
        if (!supabase || !safeUserId || !safeCharId) return [];
        if (!Number.isFinite(startStamp) || !Number.isFinite(endStamp) || endStamp <= startStamp) return [];

        const selectFields = 'id,user_id,char_id,room_id,context_scope,content,valence,arousal,importance,activation_count,resolved,event_id,event_title,event_summary,event_status,event_depth,event_date,event_fragment_count,event_is_unresolved,event_salience_score,event_depth_score,continuation_key,event_anchor_memory_id,event_detail_memory_ids,metadata,created_at,last_active_at,last_injected_at';
        const legacySelectFields = 'id,user_id,char_id,room_id,context_scope,content,valence,arousal,importance,activation_count,resolved,metadata,created_at,last_active_at,last_injected_at';
        const exactStartIso = new Date(startStamp).toISOString();
        const exactEndIso = new Date(endStamp).toISOString();
        const paddedStartIso = new Date(startStamp - (2 * 24 * 60 * 60 * 1000)).toISOString();
        const paddedEndIso = new Date(endStamp + (2 * 24 * 60 * 60 * 1000)).toISOString();
        const perScopeMemoryLimit = Math.max(safeLimit * 10, 24);
        const perScopeEventLimit = Math.max(safeLimit * 6, 18);

        function buildWindowDateKeys(windowStartMs, windowEndMs) {
            const safeStartMs = Number(windowStartMs);
            const safeEndMs = Number(windowEndMs);
            if (!Number.isFinite(safeStartMs) || !Number.isFinite(safeEndMs) || safeEndMs <= safeStartMs) {
                return [];
            }

            const result = [];
            const cursor = new Date(safeStartMs);
            cursor.setHours(0, 0, 0, 0);
            const lastDay = new Date(safeEndMs - 1);
            lastDay.setHours(0, 0, 0, 0);
            while (cursor.getTime() <= lastDay.getTime() && result.length < 14) {
                const year = cursor.getFullYear();
                const month = String(cursor.getMonth() + 1).padStart(2, '0');
                const day = String(cursor.getDate()).padStart(2, '0');
                result.push(`${year}-${month}-${day}`);
                cursor.setDate(cursor.getDate() + 1);
            }
            return result;
        }

        const windowDateKeys = buildWindowDateKeys(startStamp, endStamp);

        function buildScopedMemoryQuery(contextScope, fields, mode) {
            let query = supabase
                .from('hippocampus_memories')
                .select(fields)
                .eq('user_id', safeUserId)
                .eq('char_id', safeCharId)
                .eq('context_scope', contextScope);
            if (contextScope === 'room') {
                query = query.eq('room_id', safeRoomId);
            }

            if (mode === 'event_date') {
                return query
                    .in('event_date', windowDateKeys)
                    .order('last_active_at', { ascending: false })
                    .limit(perScopeMemoryLimit);
            }

            return query
                .gte('created_at', paddedStartIso)
                .lt('created_at', paddedEndIso)
                .order('created_at', { ascending: false })
                .limit(perScopeMemoryLimit);
        }

        function buildMemoryTasks(fields) {
            const scopes = ['private'].concat(safeRoomId ? ['room'] : []);
            const tasks = [];
            scopes.forEach(function appendScopeTasks(contextScope) {
                if (windowDateKeys.length > 0) {
                    tasks.push(buildScopedMemoryQuery(contextScope, fields, 'event_date'));
                }
                tasks.push(buildScopedMemoryQuery(contextScope, fields, 'created_at_pad'));
            });
            return tasks;
        }

        function buildScopedEventQuery(contextScope, fields, mode) {
            let query = supabase
                .from('hippocampus_memory_events')
                .select(fields)
                .eq('user_id', safeUserId)
                .eq('char_id', safeCharId)
                .eq('context_scope', contextScope);
            if (contextScope === 'room') {
                query = query.eq('room_id', safeRoomId);
            }

            if (mode === 'event_date') {
                return query
                    .in('event_date', windowDateKeys)
                    .order('updated_at', { ascending: false })
                    .limit(perScopeEventLimit);
            }
            if (mode === 'start_at') {
                return query
                    .gte('start_at', exactStartIso)
                    .lt('start_at', exactEndIso)
                    .order('start_at', { ascending: false })
                    .limit(perScopeEventLimit);
            }
            if (mode === 'end_at') {
                return query
                    .gte('end_at', exactStartIso)
                    .lt('end_at', exactEndIso)
                    .order('end_at', { ascending: false })
                    .limit(perScopeEventLimit);
            }

            return query
                .gte('last_related_at', exactStartIso)
                .lt('last_related_at', exactEndIso)
                .order('last_related_at', { ascending: false })
                .limit(perScopeEventLimit);
        }

        function buildEventTasks(fields) {
            const scopes = ['private'].concat(safeRoomId ? ['room'] : []);
            const tasks = [];
            scopes.forEach(function appendScopeTasks(contextScope) {
                if (windowDateKeys.length > 0) {
                    tasks.push(buildScopedEventQuery(contextScope, fields, 'event_date'));
                }
                tasks.push(buildScopedEventQuery(contextScope, fields, 'start_at'));
                tasks.push(buildScopedEventQuery(contextScope, fields, 'end_at'));
                tasks.push(buildScopedEventQuery(contextScope, fields, 'last_related_at'));
            });
            return tasks;
        }

        function isEventRecordInsideWindow(record) {
            const safeRecord = record && typeof record === 'object' ? record : {};
            const metadata = normalizeMetadata(safeRecord.metadata);

            function overlaps(startMs, endMs) {
                return Number.isFinite(startMs)
                    && Number.isFinite(endMs)
                    && startMs < endStamp
                    && endMs >= startStamp;
            }

            const eventDateTs = parseTimestampMs(safeRecord.event_date || metadata.event_date);
            if (Number.isFinite(eventDateTs) && eventDateTs >= startStamp && eventDateTs < endStamp) {
                return true;
            }

            const directStart = parseTimestampMs(safeRecord.start_at);
            const directEnd = parseTimestampMs(safeRecord.end_at);
            if (overlaps(directStart, directEnd)) return true;
            if (Number.isFinite(directStart) && directStart >= startStamp && directStart < endStamp) return true;
            if (Number.isFinite(directEnd) && directEnd >= startStamp && directEnd < endStamp) return true;

            const sourceStart = parseTimestampMs(safeRecord.source_time_start || metadata.source_time_start);
            const sourceEnd = parseTimestampMs(safeRecord.source_time_end || metadata.source_time_end);
            if (overlaps(sourceStart, sourceEnd)) return true;
            if (Number.isFinite(sourceStart) && sourceStart >= startStamp && sourceStart < endStamp) return true;
            if (Number.isFinite(sourceEnd) && sourceEnd >= startStamp && sourceEnd < endStamp) return true;

            const lastRelated = parseTimestampMs(safeRecord.last_related_at);
            return Number.isFinite(lastRelated) && lastRelated >= startStamp && lastRelated < endStamp;
        }

        function decorateTimeWindowHits(rows) {
            return rows.map(function decorateTimeWindowHit(item) {
                const metadata = Object.assign({}, normalizeMetadata(item && item.metadata), {
                    time_window_hit: true,
                    time_window_start: exactStartIso,
                    time_window_end: exactEndIso,
                    time_window_dates: windowDateKeys.slice(0, 7)
                });
                const boostedScore = Math.max(toFiniteNumber(item && item.score, 0), 0.58);
                return Object.assign({}, item, {
                    metadata: metadata,
                    score: boostedScore,
                    adjustedScore: Math.max(toFiniteNumber(item && item.adjustedScore, 0), boostedScore),
                    recall_hit_mode: toTrimmedString(item && item.recall_hit_mode) || 'time_window'
                });
            });
        }

        try {
            let settled = await Promise.allSettled(buildMemoryTasks(selectFields));
            const shouldFallbackToLegacyFields = settled.some(function needLegacy(item) {
                if (item.status !== 'fulfilled') return false;
                return !!(item.value && item.value.error && isMissingEventColumnError(item.value.error));
            });
            if (shouldFallbackToLegacyFields) {
                settled = await Promise.allSettled(buildMemoryTasks(legacySelectFields));
            }

            const merged = new Map();
            settled.forEach(function consumeResult(item, index) {
                if (item.status !== 'fulfilled') {
                    console.warn(`[海马体][时间窗] 记忆查询任务 ${index + 1} 失败，已跳过:`, item.reason && item.reason.message ? item.reason.message : item.reason);
                    return;
                }
                if (item.value && item.value.error) {
                    console.warn('[海马体][时间窗] 记忆查询返回错误，已跳过:', item.value.error && item.value.error.message ? item.value.error.message : item.value.error);
                    return;
                }

                const rows = item.value && Array.isArray(item.value.data) ? item.value.data : [];
                rows.forEach(function mergeRow(row) {
                    const normalized = normalizeMemoryRow(row);
                    if (!normalized || !normalized.memory_id) return;
                    const existing = merged.get(normalized.memory_id);
                    if (!existing) {
                        merged.set(normalized.memory_id, normalized);
                        return;
                    }
                    const existingTs = getMemoryPromptTimestamp(existing);
                    const incomingTs = getMemoryPromptTimestamp(normalized);
                    if (!Number.isFinite(existingTs) || incomingTs > existingTs) {
                        merged.set(normalized.memory_id, normalized);
                    }
                });
            });

            const eventRecordMap = new Map();
            const eventSettled = await runEventTableTaskBatchWithFallback(buildEventTasks, '时间窗');
            eventSettled.forEach(function consumeEventResult(item, index) {
                if (item.status !== 'fulfilled') {
                    console.warn(`[海马体][时间窗] 事件查询任务 ${index + 1} 失败，已跳过:`, item.reason && item.reason.message ? item.reason.message : item.reason);
                    return;
                }
                if (item.value && item.value.error) {
                    if (!isMissingEventTableError(item.value.error)) {
                        console.warn('[海马体][时间窗] 事件查询返回错误，已跳过:', item.value.error && item.value.error.message ? item.value.error.message : item.value.error);
                    }
                    return;
                }

                const rows = item.value && Array.isArray(item.value.data) ? item.value.data : [];
                rows.forEach(function mergeEventRow(row) {
                    const normalized = normalizeEventRecordRow(row);
                    if (!normalized || !normalized.id) return;
                    if (isRetiredEventRecord(normalized)) return;
                    if (!isEventRecordRelevantToContext(normalized, safeRoomId || null)) return;
                    if (!isEventRecordInsideWindow(normalized)) return;

                    const existing = eventRecordMap.get(normalized.id);
                    if (!existing) {
                        eventRecordMap.set(normalized.id, normalized);
                        return;
                    }
                    const existingTs = getEventRecordTimestamp(existing);
                    const incomingTs = getEventRecordTimestamp(normalized);
                    if (!Number.isFinite(existingTs) || incomingTs > existingTs) {
                        eventRecordMap.set(normalized.id, normalized);
                    }
                });
            });

            const directEventReferencedIds = [];
            eventRecordMap.forEach(function collectIds(record) {
                collectEventFragmentReferenceIds(record, {
                    memberLimit: 16,
                    totalLimit: 24,
                    detailLimit: 8,
                    flashbulbLimit: 8
                }).forEach(function pushId(id) {
                    directEventReferencedIds.push(id);
                });
            });
            const directEventDetailRows = await fetchMemoryRowsMapByIds(
                supabase,
                safeUserId,
                safeCharId,
                directEventReferencedIds
            );
            const directEventRows = [];
            eventRecordMap.forEach(function buildDirectEvent(record) {
                const fragmentIds = collectEventFragmentReferenceIds(record, {
                    memberLimit: 16,
                    totalLimit: 24,
                    detailLimit: 8,
                    flashbulbLimit: 8
                });
                const fragments = fragmentIds
                    .map(function mapId(id) {
                        return directEventDetailRows.get(toTrimmedString(id)) || null;
                    })
                    .filter(Boolean);
                if (fragments.length === 0) return;

                const candidate = buildEventCandidateFromFragments(record.id, fragments, {
                    detailPerEvent: 4,
                    eventRecords: [record],
                    detailRows: directEventDetailRows
                });
                if (!candidate) return;

                const eventTs = getEventRecordTimestamp(record, getMemoryPromptTimestamp(candidate));
                const distanceScore = Number.isFinite(eventTs)
                    ? clampNumber(
                        1 - (Math.abs(eventTs - startStamp) / Math.max((endStamp - startStamp), 24 * 60 * 60 * 1000)),
                        0,
                        1,
                        0.45
                    )
                    : 0.45;
                const depthValue = toTrimmedString(record.depth).toLowerCase();
                const depthScore = clampNumber(
                    record.depth_score,
                    0,
                    1,
                    depthValue === 'high' ? 1 : (depthValue === 'medium' ? 0.68 : 0.36)
                );
                const salienceScore = clampNumber(record.salience_score, 0, 1, 0.35);
                const timeWindowScore = clampNumber(
                    0.56
                    + (distanceScore * 0.14)
                    + (depthScore * 0.08)
                    + (salienceScore * 0.12)
                    + (record.is_unresolved ? 0.06 : 0),
                    0,
                    1,
                    0.64
                );
                directEventRows.push(Object.assign({}, candidate, {
                    score: Math.max(toFiniteNumber(candidate.score, 0), timeWindowScore),
                    adjustedScore: Math.max(toFiniteNumber(candidate.adjustedScore, 0), timeWindowScore),
                    recall_hit_mode: 'time_window_event',
                    metadata: Object.assign({}, normalizeMetadata(candidate.metadata), {
                        time_window_hit: true,
                        time_window_direct_event: true,
                        time_window_start: exactStartIso,
                        time_window_end: exactEndIso,
                        time_window_dates: windowDateKeys.slice(0, 7)
                    })
                }));
            });

            const pool = Array.from(merged.values())
                .filter(function keepRow(row) {
                    return isMemoryInsideTimeWindow(row, startStamp, endStamp);
                })
                .sort(function sortRows(left, right) {
                    const leftTs = getMemoryPromptTimestamp(left);
                    const rightTs = getMemoryPromptTimestamp(right);
                    if (!Number.isFinite(leftTs) && !Number.isFinite(rightTs)) return 0;
                    if (!Number.isFinite(leftTs)) return 1;
                    if (!Number.isFinite(rightTs)) return -1;
                    return rightTs - leftTs;
                })
                .slice(0, Math.max(safeLimit * 4, 12));
            if (pool.length === 0 && directEventRows.length === 0) return [];

            const hydration = pool.length > 0
                ? await fetchEventRecallHydrationBundle(
                    supabase,
                    safeUserId,
                    safeCharId,
                    pool,
                    {
                        maxDetailsPerEvent: 6
                    }
                )
                : {
                    eventRecords: new Map(),
                    detailRows: new Map()
                };

            const mergedEventRecords = new Map();
            eventRecordMap.forEach(function putRecord(record, eventId) {
                mergedEventRecords.set(eventId, record);
            });
            hydration.eventRecords.forEach(function putHydrated(record, eventId) {
                mergedEventRecords.set(eventId, record);
            });

            const mergedDetailRows = new Map();
            directEventDetailRows.forEach(function putDetail(row, memoryId) {
                mergedDetailRows.set(memoryId, row);
            });
            hydration.detailRows.forEach(function putHydratedDetail(row, memoryId) {
                mergedDetailRows.set(memoryId, row);
            });

            console.log(`[海马体][时间窗] 发生时间命中碎片池 ${pool.length} 条，事件直出 ${directEventRows.length} 条。`);

            return decorateTimeWindowHits(buildRecentWindowMixedRecall(pool, safeUserId, safeCharId, safeLimit, {
                nowMs: endStamp,
                semanticHint: 0.55,
                eventRecords: mergedEventRecords,
                detailRows: mergedDetailRows,
                directEventRows: directEventRows
            }));
        } catch (error) {
            console.warn('[海马体][时间窗] 时间窗召回失败，已静默跳过:', error && error.message ? error.message : error);
            return [];
        }
    }

    /**
     * 并行执行关键词搜索与向量搜索，并按 memory_id 去重后返回 Top 3。
     */
    async function searchMemories(userId, charId, query, roomId, options) {
        if (!isEnabled()) return [];

        const supabase = getSupabaseClient();
        if (!supabase) return [];

        const optionsSource = options && typeof options === 'object' ? options : {};
        const cleanQuery = toTrimmedString(query);
        const queryProfile = buildMemorySearchQueryProfile(cleanQuery, optionsSource);
        const maxTotal = Math.max(1, Math.min(6, Math.floor(toFiniteNumber(optionsSource.maxTotal, 3))));
        const timeWindowStart = toTrimmedString(optionsSource.timeWindowStart || optionsSource.time_window_start);
        const timeWindowEnd = toTrimmedString(optionsSource.timeWindowEnd || optionsSource.time_window_end);
        const timeWindowStartMs = Date.parse(timeWindowStart);
        const timeWindowEndMs = Date.parse(timeWindowEnd);
        const hasTimeWindow = Number.isFinite(timeWindowStartMs) && Number.isFinite(timeWindowEndMs) && timeWindowEndMs > timeWindowStartMs;
        if (!cleanQuery) return [];

        try {
            console.log(`[海马体][向量] 开始记忆搜索，query="${cleanQuery}"。`);
            console.log(`[海马体][向量] Embedding 配置状态：${hasEmbeddingConfig() ? '已配置，启用双通道' : '未配置，仅关键词通道'}`);
            if (hasTimeWindow) {
                console.log(`[海马体][时间窗] 已激活时间检索，query="${cleanQuery}"，窗口=${timeWindowStart} ~ ${timeWindowEnd}`);
            }

            const keywordPromise = supabase.rpc('search_hippocampus_memories', {
                p_user_id: userId,
                    p_char_id: charId,
                    p_query: cleanQuery,
                    p_room_id: roomId || null,
                    p_limit: 5,
                    p_include_private_when_room: true,
                    p_include_resolved: true
                });
            console.log('[海马体][向量] 关键词通道已发起。');

            const timeWindowPromise = hasTimeWindow
                ? fetchTimeWindowRecallCandidates(
                    supabase,
                    userId,
                    charId,
                    roomId || null,
                    timeWindowStart,
                    timeWindowEnd,
                    Math.max(2, Math.min(4, maxTotal))
                )
                : Promise.resolve([]);

            const vectorPromise = (async function runVectorSearch() {
                if (!hasEmbeddingConfig()) {
                    console.log('[海马体][向量] 跳过语义通道：未配置 Embedding API。');
                    return { data: [], error: null };
                }

                const embedding = await callEmbeddingAPI(cleanQuery);
                if (!embedding) {
                    console.log('[海马体][向量] 跳过语义通道：query 向量生成失败。');
                    return { data: [], error: null };
                }

                console.log('[海马体][向量] 语义通道已发起 RPC：vector_search_hippo_memories。');

                return supabase.rpc('vector_search_hippo_memories', {
                    p_user_id: userId,
                    p_char_id: charId,
                    p_query_embedding: vectorToLiteral(embedding),
                    p_room_id: roomId || null,
                    p_limit: 5,
                    p_include_resolved: true,
                    p_min_similarity: state.settings.vectorMinSimilarity
                });
            }());

            const results = await Promise.allSettled([keywordPromise, vectorPromise, timeWindowPromise]);
            const keywordResult = results[0];
            const vectorResult = results[1];
            const timeWindowResult = results[2];

            let keywordRows = [];
            let vectorRows = [];
            let timeWindowRows = [];

            if (keywordResult.status === 'fulfilled') {
                if (keywordResult.value && keywordResult.value.error) {
                    throw keywordResult.value.error;
                }
                keywordRows = keywordResult.value && keywordResult.value.data ? keywordResult.value.data : [];
                console.log(`[海马体][向量] 关键词通道返回 ${keywordRows.length} 条。`);
            } else {
                throw keywordResult.reason;
            }

            if (vectorResult.status === 'fulfilled') {
                if (vectorResult.value && vectorResult.value.error) {
                    console.warn('[海马体] 向量搜索失败，已自动降级为关键词搜索:', vectorResult.value.error.message || vectorResult.value.error);
                } else {
                    vectorRows = vectorResult.value && vectorResult.value.data ? vectorResult.value.data : [];
                    console.log(`[海马体][向量] 语义通道返回 ${vectorRows.length} 条。`);
                }
            } else {
                console.warn('[海马体] 向量搜索失败，已自动降级为关键词搜索:', vectorResult.reason && vectorResult.reason.message ? vectorResult.reason.message : vectorResult.reason);
            }

            if (timeWindowResult && timeWindowResult.status === 'fulfilled') {
                timeWindowRows = Array.isArray(timeWindowResult.value) ? timeWindowResult.value : [];
                if (hasTimeWindow) {
                    console.log(`[海马体][时间窗] 额外召回 ${timeWindowRows.length} 条。`);
                }
            } else if (timeWindowResult && hasTimeWindow) {
                console.warn('[海马体][时间窗] 时间窗召回失败，已忽略:', timeWindowResult.reason && timeWindowResult.reason.message ? timeWindowResult.reason.message : timeWindowResult.reason);
            }

            const merged = mergeSearchResults(keywordRows, vectorRows).map(function decorateHitFlags(item) {
                const mode = toTrimmedString(item && item.recall_hit_mode);
                const serverSensoryHit = !!(item && item.hit_by_sensory);
                const localSensoryHit = !serverSensoryHit
                    && isV2Enabled()
                    && state.settings.enableSensoryTrigger
                    && hasLocalSensoryAnchorHit(cleanQuery, item);
                const hitBySensory = serverSensoryHit || localSensoryHit;
                const explicitHitKeyword = (mode === 'keyword' || mode === 'keyword+vector')
                    ? toTrimmedString(cleanQuery).slice(0, 24)
                    : '';
                const explicitSensoryAnchor = hitBySensory
                    ? toTrimmedString(cleanQuery).slice(0, 24)
                    : '';
                const isTimeHit = hasTimeWindow && isMemoryInsideTimeWindow(item, timeWindowStartMs, timeWindowEndMs);
                const baseScore = toFiniteNumber(
                    item && item.adjustedScore !== undefined
                        ? item.adjustedScore
                        : (item && item.score),
                    0
                );
                const contextAdjustment = computeMemorySearchContextAdjustment(item, queryProfile);
                const boostedScore = clampNumber(
                    baseScore
                    + (isTimeHit ? 0.09 : 0)
                    + toFiniteNumber(contextAdjustment.bonus, 0),
                    0,
                    1,
                    baseScore
                );
                const decorated = Object.assign({}, item, {
                    _hitByKeyword: mode === 'keyword' || mode === 'keyword+vector',
                    _hitByVector: mode === 'vector' || mode === 'keyword+vector',
                    _hitBySensory: hitBySensory,
                    _hitKeyword: explicitHitKeyword,
                    _hitSensoryAnchor: explicitSensoryAnchor,
                    _contextMatchBonus: toFiniteNumber(contextAdjustment.bonus, 0),
                    _contextMatchReasons: Array.isArray(contextAdjustment.reasonTags)
                        ? contextAdjustment.reasonTags.slice(0, 4)
                        : [],
                    score: boostedScore,
                    adjustedScore: boostedScore
                });
                if (decorated._hitBySensory) {
                    const source = serverSensoryHit ? 'SQL' : '本地兜底';
                    console.log(`[海马体][搜索] 感官触发命中（${source}），记忆ID=${toTrimmedString(decorated.memory_id) || 'unknown'}`);
                }
                return decorated;
            });
            const bothHitCount = merged.filter(function countBothHit(item) {
                return toTrimmedString(item && item.recall_hit_mode) === 'keyword+vector';
            }).length;
            console.log(`[海马体][向量] 合并去重后返回 ${merged.length} 条（双命中 ${bothHitCount} 条）。`);

            const directEventRows = await fetchSearchDirectEventCandidates(
                supabase,
                userId,
                charId,
                roomId || null,
                cleanQuery,
                Math.max(1, Math.min(2, maxTotal)),
                {
                    nowMs: Date.now(),
                    maxMembersPerEvent: 10,
                    detailPerEvent: 4,
                    queryProfile: queryProfile
                }
            );
            console.log(`[海马体][向量] 搜索事件直出补入 ${directEventRows.length} 条。`);

            const rippleGateV2 = isV2Enabled();
            const rippleGateEnabled = !!(state.settings && state.settings.enableRipple);
            const rippleGateSkip = toBoolean(optionsSource.skipRipple);
            const rippleSeedCount = merged.length + directEventRows.length;
            if (
                rippleGateV2
                && rippleGateEnabled
                && !rippleGateSkip
                && rippleSeedCount > 0
            ) {
                await runRippleActivation(supabase, userId, charId, merged.concat(directEventRows), {
                    rippleRangeDays: optionsSource.rippleRangeDays
                });
            } else {
                console.log(
                    `[海马体][搜索] 时间涟漪跳过：v2=${rippleGateV2 ? 1 : 0}, enableRipple=${rippleGateEnabled ? 1 : 0}, skipRipple=${rippleGateSkip ? 1 : 0}, seeds=${rippleSeedCount}`
                );
            }

            const searchHydration = await fetchEventRecallHydrationBundle(
                supabase,
                userId,
                charId,
                merged,
                {
                    maxDetailsPerEvent: 6
                }
            );
            const fragmentMixedRows = buildMixedRecallCandidates(merged, {
                source: 'search',
                maxTotal: maxTotal,
                eventRecords: searchHydration.eventRecords,
                detailRows: searchHydration.detailRows
            });
            return mergeFinalRecallCandidates(
                [fragmentMixedRows, directEventRows, timeWindowRows],
                {
                    maxTotal: maxTotal,
                    tokenBudget: optionsSource.tokenBudget
                }
            );
        } catch (error) {
            console.warn('[海马体] 记忆搜索失败，已静默跳过:', error && error.message ? error.message : error);
            return [];
        }
    }

    /**
     * 根据 recallStyle 对首批种子记忆做一次二次联想扩散，返回额外召回结果。
     */
    async function diffuseActivation(seedMemories, recallStyle, userId, charId, roomId) {
        if (!isEnabled()) return [];
        if (!isV2Enabled() || !state.settings.enableDiffuse) return [];

        const seeds = (Array.isArray(seedMemories) ? seedMemories : [])
            .map(normalizeMemoryRow)
            .filter(function keepSeed(item) {
                return !!(item && toTrimmedString(item.memory_id || item.id));
            });
        if (seeds.length === 0) return [];

        /**
         * 尝试收集一个扩散检索词，并在本轮里去重。
         */
        function pushDiffuseQuery(target, seen, rawQuery) {
            const value = toTrimmedString(rawQuery).replace(/\s+/g, ' ').trim();
            if (!value || seen.has(value)) return;
            seen.add(value);
            target.push(value);
        }

        /**
         * 按扩散路径生成二次搜索查询词；事件候选会额外贡献“事件标题/摘要/细节”查询。
         */
        function buildDiffuseQueries(seed, style) {
            const metadata = normalizeMetadata(seed && seed.metadata);
            const keywords = normalizeTriggerKeywords(metadata.trigger_keywords || []);
            const anchors = normalizeTriggerKeywords(metadata.sensory_anchors || []);
            const dateLabel = formatMemoryDateLabel(seed);
            const content = toTrimmedString(seed && seed.content);
            const title = toTrimmedString(seed && seed.event_title);
            const summary = toTrimmedString(seed && seed.event_summary) || content;
            const continuationKey = toTrimmedString(seed && seed.continuation_key);
            const valence = toFiniteNumber(seed && seed.valence, 0);
            const detailTexts = Array.isArray(seed && seed.event_detail_memories)
                ? seed.event_detail_memories.map(function mapDetail(item) {
                    return toTrimmedString(item && item.content);
                }).filter(Boolean)
                : [];
            const isEventSeed = !!(seed && (seed.is_event_cluster || toTrimmedString(seed.source_type) === 'event_cluster'));
            const queries = [];
            const seen = new Set();
            const summarySnippet = summary.slice(0, 24);
            const detailSnippet = detailTexts[0] ? detailTexts[0].slice(0, 20) : '';

            if (style === 'analytical') {
                pushDiffuseQuery(queries, seen, keywords.slice(0, 3).join(' '));
                if (isEventSeed) {
                    pushDiffuseQuery(queries, seen, [title, continuationKey || keywords[0] || detailSnippet].filter(Boolean).join(' '));
                }
                pushDiffuseQuery(queries, seen, summarySnippet || content.slice(0, 24));
            } else if (style === 'narrative') {
                if (isEventSeed) {
                    pushDiffuseQuery(queries, seen, [dateLabel, title].filter(Boolean).join(' '));
                } else {
                    pushDiffuseQuery(queries, seen, dateLabel);
                }
                pushDiffuseQuery(queries, seen, keywords.slice(0, 2).join(' '));
                pushDiffuseQuery(queries, seen, summarySnippet || content.slice(0, 24));
            } else if (style === 'imagery') {
                pushDiffuseQuery(queries, seen, anchors.slice(0, 3).join(' '));
                if (isEventSeed) {
                    pushDiffuseQuery(queries, seen, [detailSnippet, title].filter(Boolean).join(' '));
                } else {
                    pushDiffuseQuery(queries, seen, keywords.slice(0, 2).join(' '));
                }
                pushDiffuseQuery(queries, seen, summarySnippet || content.slice(0, 24));
            } else {
                pushDiffuseQuery(queries, seen, keywords.slice(0, 2).join(' '));
                if (isEventSeed) {
                    pushDiffuseQuery(queries, seen, [title, detailSnippet].filter(Boolean).join(' '));
                }
                if (valence >= 0.2) {
                    pushDiffuseQuery(queries, seen, '开心 感动 温暖');
                } else if (valence <= -0.2) {
                    pushDiffuseQuery(queries, seen, '委屈 难过 生气');
                }
                pushDiffuseQuery(queries, seen, summarySnippet || content.slice(0, 24));
            }

            return queries.filter(Boolean).slice(0, 2);
        }

        const picked = pickRecallStyle(recallStyle !== undefined ? recallStyle : state.settings.recallStyle);
        if (picked.isMixed) {
            console.log(`[海马体][扩散] 混合模式：roll=${picked.roll.toFixed(4)}，选择=${picked.style}`);
        }

        const rankedSeeds = seeds.slice(0, Math.min(2, seeds.length));
        const diffuseQueries = [];
        const diffuseQuerySeen = new Set();
        rankedSeeds.forEach(function collectSeedQueries(seed) {
            buildDiffuseQueries(seed, picked.style).forEach(function appendQuery(query) {
                pushDiffuseQuery(diffuseQueries, diffuseQuerySeen, query);
            });
        });
        if (diffuseQueries.length === 0) return [];

        const searchResults = await Promise.allSettled(
            diffuseQueries.map(function runDiffuseSearch(query) {
                return searchMemories(
                    userId,
                    charId,
                    query,
                    roomId,
                    {
                        skipRipple: true,
                        maxTotal: 4
                    }
                );
            })
        );
        const seedIdSet = new Set(seeds.map(function mapSeedId(item) {
            return toTrimmedString(item && item.memory_id);
        }).filter(Boolean));
        const seedEventIdSet = new Set(seeds.map(function mapSeedEventId(item) {
            return getMemoryEventId(item);
        }).filter(Boolean));
        const merged = new Map();

        searchResults.forEach(function consumeResult(item) {
            if (item.status !== 'fulfilled' || !Array.isArray(item.value)) return;
            item.value.forEach(function mergeResult(row) {
                const memoryId = toTrimmedString(row && row.memory_id);
                const eventId = getMemoryEventId(row);
                if (memoryId && seedIdSet.has(memoryId)) return;
                if (eventId && seedEventIdSet.has(eventId)) return;

                const dedupeKey = eventId || memoryId;
                if (!dedupeKey) return;
                const existing = merged.get(dedupeKey);
                if (!existing || toFiniteNumber(row && row.score, 0) > toFiniteNumber(existing && existing.score, 0)) {
                    merged.set(dedupeKey, row);
                }
            });
        });

        const expanded = Array.from(merged.values())
            .sort(function sortExpanded(left, right) {
                if (toFiniteNumber(right && right.score, 0) !== toFiniteNumber(left && left.score, 0)) {
                    return toFiniteNumber(right && right.score, 0) - toFiniteNumber(left && left.score, 0);
                }
                return getMemoryTimestamp(right, ['last_active_at', 'created_at', 'last_injected_at'])
                    - getMemoryTimestamp(left, ['last_active_at', 'created_at', 'last_injected_at']);
            })
            .slice(0, 3);

        const seedPreview = rankedSeeds.map(function mapSeedPreview(seed) {
            return toTrimmedString(seed && (seed.event_title || seed.content)).slice(0, 18);
        }).filter(Boolean).join(' / ');
        console.log(`[海马体][扩散] 性格类型=${picked.style}，种子="${seedPreview || 'unknown'}"，查询${diffuseQueries.length}个，二次搜索返回${expanded.length}条。`);
        return expanded;
    }

    /**
     * 写入一条新记忆，并在后台尽力补上 embedding，不阻塞主流程。
     */
    async function writeMemory(userId, charId, memoryData, roomId) {
        if (!isEnabled()) return null;

        const supabase = getSupabaseClient();
        if (!supabase) return null;

        const cleanUserId = toTrimmedString(userId);
        const cleanCharId = toTrimmedString(charId);
        const cleanRoomId = toTrimmedString(roomId || (memoryData && (memoryData.room_id || memoryData.roomId)) || '') || null;
        const payloadSource = memoryData && typeof memoryData === 'object' ? memoryData : {};
        const content = toTrimmedString(payloadSource.content || payloadSource.memory_content || payloadSource.text);
        console.log(`[海马体][写入] 准备写入记忆，角色=${cleanCharId}，内容长度=${content.length}。`);

        if (!cleanUserId || !cleanCharId || !content) return null;
        if (isWriteRateLimited(cleanUserId, cleanCharId)) {
            console.log('[海马体][写入] 命中 10 分钟 2 条限流，本次跳过。');
            return {
                skipped: true,
                reason: 'rate_limited'
            };
        }

        const contextScope = resolveContextScope(payloadSource, cleanRoomId);
        if (!contextScope) {
            console.warn('[海马体] room 作用域写入缺少 room_id，已跳过。');
            return null;
        }

        const finalRoomId = contextScope === 'room' ? cleanRoomId : null;
        const embeddingPromise = hasEmbeddingConfig() ? callEmbeddingAPI(content) : Promise.resolve(null);

        const insertPayload = {
            user_id: cleanUserId,
            char_id: cleanCharId,
            room_id: finalRoomId,
            context_scope: contextScope,
            content: content,
            valence: clampNumber(payloadSource.valence, -1, 1, 0),
            arousal: clampNumber(payloadSource.arousal, 0, 1, 0),
            importance: clampNumber(payloadSource.importance, 1, 10, 5),
            activation_count: Math.max(1, toFiniteNumber(payloadSource.activation_count, 1)),
            resolved: !!payloadSource.resolved,
            dedupe_key: toTrimmedString(payloadSource.dedupe_key || payloadSource.dedupeKey) || null,
            source_type: toTrimmedString(payloadSource.source_type || payloadSource.sourceType) || 'chat_turn',
            source_ref: toTrimmedString(payloadSource.source_ref || payloadSource.sourceRef) || null,
            metadata: buildMemoryMetadata(payloadSource, content)
        };

        try {
            const { data, error } = await supabase
                .from('hippocampus_memories')
                .insert([insertPayload])
                .select('id,user_id,char_id,room_id,context_scope,content,valence,arousal,importance,activation_count,resolved,metadata,created_at,last_active_at,last_injected_at')
                .single();

            if (error) throw error;

            recordWriteTimestamp(cleanUserId, cleanCharId);
            console.log(`[海马体][写入] 记忆写入成功，id=${data && data.id ? data.id : 'unknown'}。`);

            const inserted = normalizeMemoryRow(data);
            if (inserted && inserted.memory_id) {
                void embeddingPromise.then(function handleEmbedding(vector) {
                    if (!vector) {
                        console.log('[海马体][向量] 写入后向量回写跳过：未拿到可用向量。');
                        return null;
                    }
                    console.log(`[海马体][向量] 写入后开始回写 embedding，memory_id=${inserted.memory_id}。`);
                    return updateMemoryEmbedding(inserted.memory_id, cleanUserId, vector);
                });
            }

            return inserted;
        } catch (error) {
            console.warn('[海马体] 写入记忆失败，已静默跳过:', error && error.message ? error.message : error);
            return null;
        }
    }

    /**
     * 刷新若干记忆的激活状态，用于真正注入 Prompt 之后的激活计数更新。
     */
    async function activateMemories(userId, memoryIds) {
        if (!isEnabled()) return 0;

        const supabase = getSupabaseClient();
        if (!supabase) return 0;

        const ids = Array.isArray(memoryIds) ? memoryIds.filter(Boolean) : [];
        if (ids.length === 0) return 0;

        try {
            const { data, error } = await supabase.rpc('activate_hippo_memories', {
                p_user_id: userId,
                p_memory_ids: ids,
                p_touch_injected: true
            });

            if (error) throw error;
            return toFiniteNumber(data, 0);
        } catch (error) {
            console.warn('[海马体] 激活记忆失败，已静默跳过:', error && error.message ? error.message : error);
            return 0;
        }
    }

    /**
     * 激活记忆后按 20% 概率执行“记忆重构”，把旧版本写入 metadata.history 审计轨迹。
     */
    function isEventClusterMemory(memory) {
        return !!memory && (
            !!memory.is_event_cluster
            || !!memory.isEventCluster
            || toTrimmedString(memory.source_type || memory.sourceType) === 'event_cluster'
            || (toTrimmedString(memory.event_id) && Array.isArray(memory.event_detail_memories) && memory.event_detail_memories.length > 0)
        );
    }

    function scoreReconsolidationTargetCandidate(row, normalizedEventMemory, anchorId, flashbulbIdSet) {
        const candidate = normalizeMemoryRow(row);
        if (!candidate || isEventClusterMemory(candidate)) return Number.NEGATIVE_INFINITY;

        const memoryId = toTrimmedString(candidate.memory_id || candidate.id);
        const eventMemoryId = toTrimmedString(normalizedEventMemory && (normalizedEventMemory.memory_id || normalizedEventMemory.id));
        const importanceScore = clampNumber(toFiniteNumber(candidate.importance, 0) / 10, 0, 1, 0);
        const hitRankScore = Math.min(1, Math.max(0, getRecallHitRank(candidate) / 3));
        const flashbulbScore = flashbulbIdSet.has(memoryId) || !!candidate.is_flashbulb ? 1 : 0;
        const unresolvedScore = !!candidate.event_is_unresolved || toTrimmedString(candidate.event_status).toLowerCase() === 'open' ? 1 : 0;
        const activationScore = clampNumber(toFiniteNumber(candidate.activation_count, 0) / 6, 0, 1, 0);
        const recencyTs = getMemoryTimestamp(candidate, ['last_active_at', 'created_at', 'last_injected_at']);
        const nowMs = Date.now();
        const recencyScore = Number.isFinite(recencyTs)
            ? clampNumber(1 - ((nowMs - recencyTs) / (14 * 24 * 60 * 60 * 1000)), 0, 1, 0)
            : 0;

        let score = 0;
        if (memoryId && memoryId === eventMemoryId) score += 0.42;
        if (memoryId && memoryId === anchorId) score += 0.24;
        score += importanceScore * 0.16;
        score += hitRankScore * 0.10;
        score += flashbulbScore * 0.10;
        score += unresolvedScore * 0.06;
        score += activationScore * 0.05;
        score += recencyScore * 0.05;
        return score;
    }

    async function resolveReconsolidationTargetMemory(supabase, memory, userId, charId) {
        const normalized = normalizeMemoryRow(memory);
        if (!normalized) return null;
        if (!isEventClusterMemory(memory)) {
            return normalized;
        }

        const safeUserId = toTrimmedString(userId || normalized.user_id || memory.user_id || memory.userId);
        const safeCharId = toTrimmedString(charId || normalized.char_id || memory.char_id || memory.charId);
        const detailMemories = Array.isArray(memory && memory.event_detail_memories) ? memory.event_detail_memories : [];
        const anchorId = toTrimmedString(
            normalized.event_anchor_memory_id
            || memory.event_anchor_memory_id
            || normalized.memory_id
            || normalized.id
        );
        const flashbulbIdSet = new Set(
            (Array.isArray(normalized.event_flashbulb_memory_ids) ? normalized.event_flashbulb_memory_ids : [])
                .map(toTrimmedString)
                .filter(Boolean)
        );
        const preferredIds = mergeUniqueIds(
            [anchorId, toTrimmedString(normalized.memory_id || normalized.id)],
            mergeUniqueIds(
                Array.isArray(normalized.event_detail_memory_ids) ? normalized.event_detail_memory_ids : [],
                detailMemories.map(function mapDetailId(item) {
                    return toTrimmedString(item && (item.id || item.memory_id));
                }),
                24
            ),
            24
        );

        if (supabase && safeUserId && safeCharId && preferredIds.length > 0) {
            const fetchedMap = await fetchMemoryRowsMapByIds(supabase, safeUserId, safeCharId, preferredIds);
            const fetchedCandidates = preferredIds
                .map(function mapFetched(id) {
                    return fetchedMap.get(id) || null;
                })
                .filter(Boolean)
                .sort(function sortFetched(left, right) {
                    return scoreReconsolidationTargetCandidate(right, normalized, anchorId, flashbulbIdSet)
                        - scoreReconsolidationTargetCandidate(left, normalized, anchorId, flashbulbIdSet);
                });
            if (fetchedCandidates[0] && !isEventClusterMemory(fetchedCandidates[0])) {
                return fetchedCandidates[0];
            }
        }

        const fallbackDetail = detailMemories
            .map(normalizeMemoryRow)
            .filter(function keepDetail(item) {
                return !!item && !isEventClusterMemory(item);
            })
            .sort(function sortFallback(left, right) {
                return scoreReconsolidationTargetCandidate(right, normalized, anchorId, flashbulbIdSet)
                    - scoreReconsolidationTargetCandidate(left, normalized, anchorId, flashbulbIdSet);
            })[0] || null;
        if (fallbackDetail && !isEventClusterMemory(fallbackDetail)) {
            return Object.assign({}, fallbackDetail, {
                user_id: safeUserId || fallbackDetail.user_id,
                char_id: safeCharId || fallbackDetail.char_id,
                event_id: getMemoryEventId(normalized) || getMemoryEventId(fallbackDetail)
            });
        }

        return null;
    }

    function deriveReconsolidationFragmentLoadLimit(eventRecord, targetMemory) {
        const depth = toTrimmedString(
            (eventRecord && eventRecord.depth)
            || (targetMemory && targetMemory.event_depth)
        ).toLowerCase();
        const unresolved = !!(
            (eventRecord && eventRecord.is_unresolved)
            || (targetMemory && targetMemory.event_is_unresolved)
            || toTrimmedString(eventRecord && eventRecord.status).toLowerCase() === 'open'
        );
        const flashbulb = !!(
            (eventRecord && eventRecord.event_is_flashbulb)
            || (targetMemory && targetMemory.event_is_flashbulb)
            || readFirstDefined(normalizeMetadata(eventRecord && eventRecord.metadata), ['event_is_flashbulb', 'is_flashbulb'], false)
        );
        const fragmentCount = Math.max(
            Math.floor(toFiniteNumber(eventRecord && eventRecord.fragment_count, 0)),
            Array.isArray(eventRecord && eventRecord.memory_ids) ? eventRecord.memory_ids.length : 0,
            Array.isArray(eventRecord && eventRecord.detail_memory_ids) ? eventRecord.detail_memory_ids.length : 0,
            1
        );

        let limit = 6;
        if (depth === 'medium') limit = 8;
        if (depth === 'high' || unresolved || flashbulb) limit = 12;
        if (fragmentCount >= 10) limit += 2;
        return Math.max(4, Math.min(14, limit));
    }

    function deriveReconsolidationContextProfile(targetMemory, contextBundle) {
        const bundle = contextBundle && typeof contextBundle === 'object' ? contextBundle : null;
        const eventRecord = bundle && bundle.eventRecord ? bundle.eventRecord : null;
        const target = normalizeMemoryRow(targetMemory);
        if (!eventRecord) {
            return {
                mode: 'fragment_strict',
                targetRole: 'fragment',
                targetRoleLabel: '普通碎片',
                contextFragmentCount: 0,
                reasonTags: [],
                eventWeight: 0
            };
        }

        const targetMemoryId = toTrimmedString(
            (bundle && bundle.targetMemoryId)
            || (target && (target.memory_id || target.id))
        );
        const anchorId = toTrimmedString(eventRecord.anchor_memory_id);
        const flashbulbIds = new Set(
            (Array.isArray(eventRecord.event_flashbulb_memory_ids) ? eventRecord.event_flashbulb_memory_ids : [])
                .map(toTrimmedString)
                .filter(Boolean)
        );
        const unresolved = !!eventRecord.is_unresolved || toTrimmedString(eventRecord.status).toLowerCase() === 'open';
        const flashbulb = !!eventRecord.event_is_flashbulb || flashbulbIds.size > 0;
        const depth = toTrimmedString(eventRecord.depth).toLowerCase();
        const depthScore = clampNumber(
            toFiniteNumber(eventRecord.depth_score, depth === 'high' ? 1 : (depth === 'medium' ? 0.68 : 0.36)),
            0,
            1,
            depth === 'high' ? 1 : (depth === 'medium' ? 0.68 : 0.36)
        );
        const salienceScore = clampNumber(toFiniteNumber(eventRecord.salience_score, 0), 0, 1, 0);
        const fragmentCount = Math.max(
            Math.floor(toFiniteNumber(eventRecord.fragment_count, 0)),
            Array.isArray(bundle && bundle.fragments) ? bundle.fragments.length : 0,
            1
        );
        const eventWeight = clampNumber(
            ((unresolved ? 1 : 0) * 0.30)
            + ((flashbulb ? 1 : 0) * 0.22)
            + (depthScore * 0.18)
            + (salienceScore * 0.16)
            + (Math.min(1, fragmentCount / 8) * 0.14),
            0,
            1,
            0
        );

        let mode = 'event_balanced';
        let contextFragmentCount = 4;
        if (eventWeight >= 0.66 || depth === 'high' || (unresolved && flashbulb)) {
            mode = 'event_deep';
            contextFragmentCount = 6;
        } else if (eventWeight <= 0.24 && depth === 'low' && !unresolved && !flashbulb) {
            mode = 'fragment_strict';
            contextFragmentCount = 2;
        }

        let targetRole = 'detail';
        let targetRoleLabel = '事件细节';
        if (targetMemoryId && targetMemoryId === anchorId) {
            targetRole = 'anchor';
            targetRoleLabel = '事件锚点';
        } else if (targetMemoryId && flashbulbIds.has(targetMemoryId)) {
            targetRole = 'flashbulb_detail';
            targetRoleLabel = '印象很深的细节';
        }

        const reasonTags = [];
        if (mode === 'event_deep') reasonTags.push('event_deep');
        if (mode === 'fragment_strict') reasonTags.push('fragment_strict');
        if (unresolved) reasonTags.push('open_loop');
        if (flashbulb) reasonTags.push('flashbulb');
        if (depth === 'high') reasonTags.push('high_depth');
        if (salienceScore >= 0.6) reasonTags.push('salient');

        return {
            mode: mode,
            targetRole: targetRole,
            targetRoleLabel: targetRoleLabel,
            contextFragmentCount: contextFragmentCount,
            reasonTags: reasonTags,
            eventWeight: eventWeight
        };
    }

    function selectReconsolidationReferenceFragments(targetMemory, contextBundle, profile) {
        const bundle = contextBundle && typeof contextBundle === 'object' ? contextBundle : null;
        const eventRecord = bundle && bundle.eventRecord ? bundle.eventRecord : null;
        if (!eventRecord) return [];

        const safeProfile = profile && typeof profile === 'object'
            ? profile
            : deriveReconsolidationContextProfile(targetMemory, bundle);
        const targetMemoryId = toTrimmedString(
            (bundle && bundle.targetMemoryId)
            || (targetMemory && (targetMemory.memory_id || targetMemory.id))
        );
        const anchorId = toTrimmedString(eventRecord.anchor_memory_id);
        const flashbulbIds = new Set(
            (Array.isArray(eventRecord.event_flashbulb_memory_ids) ? eventRecord.event_flashbulb_memory_ids : [])
                .map(toTrimmedString)
                .filter(Boolean)
        );

        return (Array.isArray(bundle && bundle.fragments) ? bundle.fragments : [])
            .filter(function filterFragment(row) {
                const memoryId = toTrimmedString(row && (row.memory_id || row.id));
                return !!memoryId && memoryId !== targetMemoryId;
            })
            .map(function scoreRow(row) {
                const memoryId = toTrimmedString(row && (row.memory_id || row.id));
                const importanceScore = clampNumber(toFiniteNumber(row && row.importance, 0) / 10, 0, 1, 0);
                const activationScore = clampNumber(toFiniteNumber(row && row.activation_count, 0) / 6, 0, 1, 0);
                const recencyTs = getMemoryTimestamp(row, ['last_active_at', 'created_at', 'last_injected_at']);
                const recencyScore = Number.isFinite(recencyTs)
                    ? clampNumber(1 - ((Date.now() - recencyTs) / (14 * 24 * 60 * 60 * 1000)), 0, 1, 0)
                    : 0;
                let score = 0;
                if (memoryId && memoryId === anchorId) score += 0.34;
                if (memoryId && flashbulbIds.has(memoryId)) score += 0.22;
                if (!!row && !!row.resolved === false) score += 0.10;
                score += importanceScore * 0.18;
                score += activationScore * 0.08;
                score += recencyScore * 0.08;
                return {
                    row: row,
                    score: score
                };
            })
            .sort(function sortRows(left, right) {
                if (toFiniteNumber(right && right.score, 0) !== toFiniteNumber(left && left.score, 0)) {
                    return toFiniteNumber(right && right.score, 0) - toFiniteNumber(left && left.score, 0);
                }
                return getMemoryTimestamp(right && right.row, ['last_active_at', 'created_at', 'last_injected_at'])
                    - getMemoryTimestamp(left && left.row, ['last_active_at', 'created_at', 'last_injected_at']);
            })
            .slice(0, Math.max(0, Math.floor(toFiniteNumber(safeProfile.contextFragmentCount, 0))))
            .map(function unwrap(item) {
                return item.row;
            });
    }

    function deriveReconsolidationBatchPlan(targetMemory, contextBundle, profile, options) {
        const primaryTarget = normalizeMemoryRow(targetMemory);
        const bundle = contextBundle && typeof contextBundle === 'object' ? contextBundle : null;
        const eventRecord = bundle && bundle.eventRecord ? bundle.eventRecord : null;
        const safeProfile = profile && typeof profile === 'object'
            ? profile
            : deriveReconsolidationContextProfile(primaryTarget, bundle);
        const safeOptions = options && typeof options === 'object' ? options : {};
        const batchMode = normalizeReconsolidationBatchMode(
            readFirstDefined(
                safeOptions,
                ['batchMode'],
                state.settings ? state.settings.reconsolidationBatchMode : 'auto'
            )
        );
        const baseReasonTags = Array.isArray(safeProfile.reasonTags)
            ? safeProfile.reasonTags.map(toTrimmedString).filter(Boolean)
            : [];

        if (!primaryTarget) {
            return {
                scope: 'single_fragment',
                strategy: toTrimmedString(safeProfile.mode) || 'fragment_strict',
                batchMode: batchMode,
                targets: [],
                reasonTags: baseReasonTags,
                targetCount: 0
            };
        }

        if (!eventRecord) {
            return {
                scope: 'single_fragment',
                strategy: toTrimmedString(safeProfile.mode) || 'fragment_strict',
                batchMode: batchMode,
                targets: [primaryTarget],
                reasonTags: baseReasonTags,
                targetCount: 1
            };
        }

        const targetMemoryId = toTrimmedString(
            (bundle && bundle.targetMemoryId)
            || primaryTarget.memory_id
            || primaryTarget.id
        );
        const anchorId = toTrimmedString(eventRecord.anchor_memory_id);
        const flashbulbIdSet = new Set(
            (Array.isArray(eventRecord.event_flashbulb_memory_ids) ? eventRecord.event_flashbulb_memory_ids : [])
                .map(toTrimmedString)
                .filter(Boolean)
        );
        const fragmentRows = (Array.isArray(bundle && bundle.fragments) ? bundle.fragments : [])
            .map(normalizeMemoryRow)
            .filter(function keepRow(row) {
                return !!row && !isEventClusterMemory(row);
            });
        const fragmentMap = new Map();
        fragmentRows.forEach(function putRow(row) {
            const rowId = toTrimmedString(row && (row.memory_id || row.id));
            if (!rowId || fragmentMap.has(rowId)) return;
            fragmentMap.set(rowId, row);
        });

        const primaryRow = fragmentMap.get(targetMemoryId) || primaryTarget;
        const eventWeight = clampNumber(toFiniteNumber(safeProfile.eventWeight, 0), 0, 1, 0);
        const shouldBatch = batchMode === 'event'
            ? fragmentMap.size > 1
            : (
                batchMode !== 'off'
                && fragmentMap.size > 1
                && (
                    toTrimmedString(safeProfile.mode) === 'event_deep'
                    || toTrimmedString(safeProfile.targetRole) === 'anchor'
                    || eventWeight >= 0.74
                )
            );
        const shouldCompleteSmallEvent = shouldBatch
            && fragmentMap.size > 1
            && fragmentMap.size <= 4
            && (
                batchMode === 'event'
                || toTrimmedString(safeProfile.mode) === 'event_deep'
                || toTrimmedString(safeProfile.targetRole) === 'anchor'
                || eventWeight >= 0.82
            );
        const maxTargets = shouldBatch
            ? Math.max(
                2,
                Math.min(
                    shouldCompleteSmallEvent ? fragmentMap.size : 3,
                    toTrimmedString(safeProfile.mode) === 'event_deep'
                        ? (shouldCompleteSmallEvent ? fragmentMap.size : 3)
                        : (shouldCompleteSmallEvent ? fragmentMap.size : 2),
                    fragmentMap.size
                )
            )
            : 1;

        const targets = [];
        const seen = new Set();
        function pushTarget(row) {
            const normalized = normalizeMemoryRow(row);
            const rowId = toTrimmedString(normalized && (normalized.memory_id || normalized.id));
            if (!normalized || !rowId || seen.has(rowId) || isEventClusterMemory(normalized)) return;
            seen.add(rowId);
            targets.push(normalized);
        }

        pushTarget(primaryRow);
        if (shouldBatch && targetMemoryId !== anchorId && anchorId) {
            pushTarget(fragmentMap.get(anchorId) || null);
        }
        if (shouldBatch && (toTrimmedString(safeProfile.mode) === 'event_deep' || toTrimmedString(safeProfile.targetRole) === 'anchor')) {
            const flashbulbTarget = Array.from(flashbulbIdSet).map(function mapFlashbulbId(id) {
                return fragmentMap.get(id) || null;
            }).find(Boolean) || null;
            pushTarget(flashbulbTarget);
        }

        if (shouldBatch && shouldCompleteSmallEvent && targets.length < maxTargets) {
            sortEventFragmentsForRecord(Array.from(fragmentMap.values()), eventRecord).forEach(function pushOrdered(row) {
                if (targets.length >= maxTargets) return;
                pushTarget(row);
            });
        }
        if (shouldBatch && targets.length < maxTargets) {
            const widenedProfile = Object.assign({}, safeProfile, {
                contextFragmentCount: Math.max(
                    Math.floor(toFiniteNumber(safeProfile.contextFragmentCount, 0)),
                    maxTargets + 1
                )
            });
            const referenceRows = selectReconsolidationReferenceFragments(primaryRow, bundle, widenedProfile);
            for (let i = 0; i < referenceRows.length && targets.length < maxTargets; i += 1) {
                pushTarget(referenceRows[i]);
            }
        }

        const reasonTags = baseReasonTags.slice();
        if (targets.length > 1) {
            reasonTags.push('event_batch');
            if (batchMode === 'event') reasonTags.push('forced_batch');
            if (targetMemoryId && targetMemoryId === anchorId) reasonTags.push('anchor_batch');
            if (flashbulbIdSet.has(targetMemoryId)) reasonTags.push('flashbulb_batch');
            if (shouldCompleteSmallEvent && targets.length >= fragmentMap.size) reasonTags.push('complete_event_batch');
        } else {
            reasonTags.push('single_target');
        }

        return {
            scope: targets.length > 1 ? 'event_batch' : 'single_fragment',
            strategy: targets.length > 1
                ? `${toTrimmedString(safeProfile.mode) || 'event_balanced'}_batch`
                : (toTrimmedString(safeProfile.mode) || 'fragment_strict'),
            batchMode: batchMode,
            targets: targets,
            reasonTags: Array.from(new Set(reasonTags)).filter(Boolean).slice(0, 10),
            targetCount: targets.length
        };
    }

    function normalizeReconsolidationCompareText(value) {
        return toTrimmedString(value)
            .toLowerCase()
            .replace(/[^a-z0-9\u4e00-\u9fa5]/g, '');
    }

    function buildReconsolidationTextTokenSet(value) {
        const normalized = normalizeReconsolidationCompareText(value);
        const tokens = new Set();
        if (!normalized) return tokens;

        const unit = normalized.length <= 8 ? 1 : 2;
        if (normalized.length <= unit) {
            tokens.add(normalized);
            return tokens;
        }

        for (let i = 0; i <= normalized.length - unit; i += 1) {
            tokens.add(normalized.slice(i, i + unit));
        }
        if (tokens.size === 0) {
            tokens.add(normalized);
        }
        return tokens;
    }

    function computeReconsolidationTextSimilarity(left, right) {
        const leftTokens = buildReconsolidationTextTokenSet(left);
        const rightTokens = buildReconsolidationTextTokenSet(right);
        if (leftTokens.size === 0 || rightTokens.size === 0) return 0;

        let overlap = 0;
        leftTokens.forEach(function countOverlap(token) {
            if (rightTokens.has(token)) overlap += 1;
        });
        if (overlap <= 0) return 0;

        const union = leftTokens.size + rightTokens.size - overlap;
        if (union <= 0) return 0;
        return overlap / union;
    }

    function collectReconsolidationSafetyKeywords(targetMemory, originalContent) {
        const metadata = normalizeMetadata(targetMemory && targetMemory.metadata);
        return normalizeTriggerKeywords(
            []
                .concat(Array.isArray(metadata.trigger_keywords) ? metadata.trigger_keywords : [])
                .concat(Array.isArray(metadata.sensory_anchors) ? metadata.sensory_anchors : [])
                .concat(extractContentKeywords(originalContent).slice(0, 8))
        ).slice(0, 8);
    }

    function computeReconsolidationKeywordCoverage(keywords, nextContent) {
        const normalizedNext = normalizeReconsolidationCompareText(nextContent);
        const relevant = (Array.isArray(keywords) ? keywords : [])
            .map(normalizeReconsolidationCompareText)
            .filter(function keepKeyword(keyword) {
                return !!keyword && keyword.length >= 2;
            });
        if (relevant.length === 0) {
            return {
                checkedCount: 0,
                coveredCount: 0,
                coverage: 1
            };
        }

        let coveredCount = 0;
        relevant.forEach(function countCovered(keyword) {
            if (normalizedNext.includes(keyword)) {
                coveredCount += 1;
            }
        });

        return {
            checkedCount: relevant.length,
            coveredCount: coveredCount,
            coverage: relevant.length > 0 ? (coveredCount / relevant.length) : 1
        };
    }

    function buildReconsolidationGuardMetadataSnapshot(report, status, checkedAt) {
        const safeReport = report && typeof report === 'object' ? report : {};
        return {
            status: toTrimmedString(status) || 'accepted',
            checked_at: toTrimmedString(checkedAt) || new Date().toISOString(),
            guard_level: toTrimmedString(safeReport.guardLevel) || 'balanced',
            mode: toTrimmedString(safeReport.mode) || '',
            target_role: toTrimmedString(safeReport.targetRole) || '',
            original_similarity: Number(clampNumber(safeReport.originalSimilarity, 0, 1, 0).toFixed(3)),
            summary_similarity: Number(clampNumber(safeReport.summarySimilarity, 0, 1, 0).toFixed(3)),
            reference_similarity: Number(clampNumber(safeReport.referenceSimilarity, 0, 1, 0).toFixed(3)),
            reference_memory_id: toTrimmedString(safeReport.referenceMemoryId) || null,
            keyword_coverage: Number(clampNumber(safeReport.keywordCoverage, 0, 1, 1).toFixed(3)),
            checked_keyword_count: Math.max(0, Math.floor(toFiniteNumber(safeReport.checkedKeywordCount, 0))),
            covered_keyword_count: Math.max(0, Math.floor(toFiniteNumber(safeReport.coveredKeywordCount, 0))),
            length_ratio: Number(Math.max(0, toFiniteNumber(safeReport.lengthRatio, 1)).toFixed(3)),
            reasons: Array.isArray(safeReport.reasons)
                ? safeReport.reasons.map(toTrimmedString).filter(Boolean).slice(0, 6)
                : []
        };
    }

    async function persistReconsolidationGuardRejection(supabase, userId, charId, targetMemory, profile, guardReport, options) {
        const safeTarget = normalizeMemoryRow(targetMemory);
        const targetMemoryId = toTrimmedString(safeTarget && (safeTarget.memory_id || safeTarget.id));
        const safeUserId = toTrimmedString(userId || safeTarget && safeTarget.user_id);
        const safeCharId = toTrimmedString(charId || safeTarget && safeTarget.char_id);
        if (!supabase || !safeUserId || !targetMemoryId) return false;

        const safeProfile = profile && typeof profile === 'object' ? profile : {};
        const safeOptions = options && typeof options === 'object' ? options : {};
        const rejectedAt = new Date().toISOString();
        const metadata = normalizeMetadata(safeTarget && safeTarget.metadata);
        const skippedReason = toTrimmedString(safeOptions.skippedReason) || 'guard_rejected';
        const reconScope = toTrimmedString(safeOptions.scope);
        const batchSize = Math.max(0, Math.floor(toFiniteNumber(safeOptions.batchSize, 0)));
        const batchTargetIds = mergeUniqueIds(
            Array.isArray(safeOptions.batchTargetIds) ? safeOptions.batchTargetIds : [],
            [],
            12
        );
        const guardSnapshot = buildReconsolidationGuardMetadataSnapshot(
            guardReport,
            'rejected',
            rejectedAt
        );

        let nextMetadata = Object.assign({}, metadata, {
            last_reconsolidation_attempt_at: rejectedAt,
            last_reconsolidation_skipped_at: rejectedAt,
            last_reconsolidation_skipped_reason: skippedReason,
            last_reconsolidation_strategy: toTrimmedString(safeProfile.mode) || toTrimmedString(metadata.last_reconsolidation_strategy),
            last_reconsolidation_target_role: toTrimmedString(safeProfile.targetRole) || toTrimmedString(metadata.last_reconsolidation_target_role),
            last_reconsolidation_context_fragment_count: safeProfile.contextFragmentCount !== undefined
                ? Math.max(0, Math.floor(toFiniteNumber(safeProfile.contextFragmentCount, 0)))
                : Math.max(0, Math.floor(toFiniteNumber(metadata.last_reconsolidation_context_fragment_count, 0))),
            last_reconsolidation_reason_tags: Array.isArray(safeProfile.reasonTags)
                ? safeProfile.reasonTags.map(toTrimmedString).filter(Boolean).slice(0, 8)
                : (Array.isArray(metadata.last_reconsolidation_reason_tags) ? metadata.last_reconsolidation_reason_tags.slice(0, 8) : []),
            last_reconsolidation_guard: guardSnapshot
        });
        if (reconScope) nextMetadata.last_reconsolidation_scope = reconScope;
        if (batchSize > 0) nextMetadata.last_reconsolidation_batch_size = batchSize;
        if (batchTargetIds.length > 0) nextMetadata.last_reconsolidation_batch_target_ids = batchTargetIds.slice(0, 12);

        nextMetadata = appendLimitedMetadataEntries(
            nextMetadata,
            'reconsolidation_guard_history',
            {
                changed_at: rejectedAt,
                source: 'reconsolidation_guard',
                skipped_reason: skippedReason,
                scope: reconScope || '',
                batch_size: batchSize,
                batch_target_ids: batchTargetIds.slice(0, 12),
                strategy: toTrimmedString(safeProfile.mode),
                target_role: toTrimmedString(safeProfile.targetRole),
                context_fragment_count: safeProfile.contextFragmentCount !== undefined
                    ? Math.max(0, Math.floor(toFiniteNumber(safeProfile.contextFragmentCount, 0)))
                    : 0,
                guard_level: guardSnapshot.guard_level,
                reasons: Array.isArray(guardSnapshot.reasons) ? guardSnapshot.reasons.slice(0, 6) : [],
                original_similarity: guardSnapshot.original_similarity,
                summary_similarity: guardSnapshot.summary_similarity,
                reference_similarity: guardSnapshot.reference_similarity,
                keyword_coverage: guardSnapshot.keyword_coverage,
                length_ratio: guardSnapshot.length_ratio
            },
            8
        );

        try {
            let updateQuery = supabase
                .from('hippocampus_memories')
                .update({
                    metadata: nextMetadata
                })
                .eq('id', targetMemoryId)
                .eq('user_id', safeUserId);
            if (safeCharId) {
                updateQuery = updateQuery.eq('char_id', safeCharId);
            }
            const { error } = await updateQuery.select('id').limit(1);
            if (error) throw error;
            return true;
        } catch (error) {
            console.warn('[海马体][重构] 写入护栏拒绝留痕失败，已跳过:', error && error.message ? error.message : error);
            return false;
        }
    }

    function evaluateReconsolidationRewriteSafety(targetMemory, nextContent, contextBundle, profile) {
        const originalContent = toTrimmedString(targetMemory && targetMemory.content);
        const rewrittenContent = toTrimmedString(nextContent);
        const bundle = contextBundle && typeof contextBundle === 'object' ? contextBundle : null;
        const eventRecord = bundle && bundle.eventRecord ? bundle.eventRecord : null;
        const safeProfile = profile && typeof profile === 'object'
            ? profile
            : deriveReconsolidationContextProfile(targetMemory, bundle);
        const normalizedOriginal = normalizeReconsolidationCompareText(originalContent);
        const normalizedRewritten = normalizeReconsolidationCompareText(rewrittenContent);
        const summaryText = toTrimmedString(eventRecord && eventRecord.summary);
        const referenceFragments = selectReconsolidationReferenceFragments(targetMemory, bundle, safeProfile);

        const originalSimilarity = computeReconsolidationTextSimilarity(originalContent, rewrittenContent);
        const summarySimilarity = summaryText
            ? computeReconsolidationTextSimilarity(rewrittenContent, summaryText)
            : 0;

        let referenceSimilarity = 0;
        let referenceMemoryId = '';
        referenceFragments.forEach(function scanReference(row) {
            const text = toTrimmedString(row && (row.content || row.summary || row.text));
            if (!text) return;
            const similarity = computeReconsolidationTextSimilarity(rewrittenContent, text);
            if (similarity > referenceSimilarity) {
                referenceSimilarity = similarity;
                referenceMemoryId = toTrimmedString(row && (row.memory_id || row.id));
            }
        });

        const keywordCoverage = computeReconsolidationKeywordCoverage(
            collectReconsolidationSafetyKeywords(targetMemory, originalContent),
            rewrittenContent
        );
        const originalLength = Math.max(1, normalizedOriginal.length);
        const rewrittenLength = Math.max(1, normalizedRewritten.length);
        const lengthRatio = rewrittenLength / originalLength;

        let minOriginalSimilarity = 0.12;
        if (safeProfile.mode === 'fragment_strict') {
            minOriginalSimilarity = 0.18;
        } else if (safeProfile.mode === 'event_deep') {
            minOriginalSimilarity = 0.10;
        }
        if (safeProfile.targetRole === 'anchor') {
            minOriginalSimilarity += 0.04;
        } else if (safeProfile.targetRole === 'flashbulb_detail') {
            minOriginalSimilarity += 0.03;
        }

        const reasons = [];
        if (!rewrittenContent || !normalizedRewritten) {
            reasons.push('empty_rewrite');
        } else if (normalizedOriginal && normalizedOriginal === normalizedRewritten) {
            reasons.push('no_meaningful_change');
        }
        if (summaryText && summarySimilarity >= 0.88 && summarySimilarity > originalSimilarity + 0.12) {
            reasons.push('summary_copy_risk');
        }
        if (referenceSimilarity >= 0.92 && referenceSimilarity > originalSimilarity + 0.18) {
            reasons.push('reference_copy_risk');
        }
        if (safeProfile.mode === 'fragment_strict' && lengthRatio > 2.4) {
            reasons.push('over_expanded');
        }
        if (lengthRatio < 0.38) {
            reasons.push('over_compressed');
        }
        if (originalSimilarity < minOriginalSimilarity && keywordCoverage.coverage < 0.34) {
            reasons.push('fact_drift_risk');
        }
        if (safeProfile.targetRole === 'anchor' && originalSimilarity < minOriginalSimilarity + 0.04 && keywordCoverage.coverage < 0.5) {
            reasons.push('anchor_drift_risk');
        }

        return {
            safe: reasons.length === 0,
            guardLevel: safeProfile.mode === 'event_deep' || safeProfile.targetRole === 'anchor'
                ? 'strict'
                : 'balanced',
            mode: safeProfile.mode || '',
            targetRole: safeProfile.targetRole || '',
            originalSimilarity: originalSimilarity,
            summarySimilarity: summarySimilarity,
            referenceSimilarity: referenceSimilarity,
            referenceMemoryId: referenceMemoryId || null,
            keywordCoverage: keywordCoverage.coverage,
            checkedKeywordCount: keywordCoverage.checkedCount,
            coveredKeywordCount: keywordCoverage.coveredCount,
            lengthRatio: lengthRatio,
            reasons: Array.from(new Set(reasons)).slice(0, 6)
        };
    }

    async function buildReconsolidationEventContext(supabase, memory, userId, charId) {
        const normalized = normalizeMemoryRow(memory);
        if (!normalized) return null;

        const safeUserId = toTrimmedString(userId || normalized.user_id || memory.user_id || memory.userId);
        const safeCharId = toTrimmedString(charId || normalized.char_id || memory.char_id || memory.charId);
        const eventId = getMemoryEventId(normalized);
        if (!supabase || !safeUserId || !safeCharId || !eventId) return null;

        const eventRecordMap = await fetchEventRecordsMap(supabase, safeUserId, safeCharId, [eventId]);
        const eventRecord = eventRecordMap.get(eventId) || null;
        if (!eventRecord) return null;

        const targetMemoryId = toTrimmedString(normalized.memory_id || normalized.id);
        const fragmentLoadLimit = deriveReconsolidationFragmentLoadLimit(eventRecord, normalized);
        const fragmentIds = mergeUniqueIds(
            [targetMemoryId],
            collectEventFragmentReferenceIds(eventRecord, {
                memberLimit: fragmentLoadLimit,
                totalLimit: fragmentLoadLimit,
                detailLimit: Math.min(12, fragmentLoadLimit),
                flashbulbLimit: Math.min(8, fragmentLoadLimit)
            }),
            fragmentLoadLimit
        );
        if (fragmentIds.length === 0) {
            const emptyBundle = {
                eventRecord: eventRecord,
                fragments: [],
                targetMemoryId: targetMemoryId
            };
            return {
                eventRecord: eventRecord,
                fragments: [],
                targetMemoryId: targetMemoryId,
                profile: deriveReconsolidationContextProfile(normalized, emptyBundle)
            };
        }

        const fragmentMap = await fetchMemoryRowsMapByIds(supabase, safeUserId, safeCharId, fragmentIds);
        const ordered = sortEventFragmentsForRecord(Array.from(fragmentMap.values()), eventRecord)
            .filter(function keepRow(row) {
                return !!row && !isEventClusterMemory(row);
            })
            .slice(0, fragmentLoadLimit);
        const bundle = {
            eventRecord: eventRecord,
            fragments: ordered,
            targetMemoryId: targetMemoryId
        };

        return {
            eventRecord: eventRecord,
            fragments: ordered,
            targetMemoryId: targetMemoryId,
            profile: deriveReconsolidationContextProfile(normalized, bundle)
        };
    }

    function buildReconsolidationEventContextLines(targetMemory, contextBundle, profile) {
        const bundle = contextBundle && typeof contextBundle === 'object' ? contextBundle : null;
        const eventRecord = bundle && bundle.eventRecord ? bundle.eventRecord : null;
        if (!eventRecord) return [];

        const safeProfile = profile && typeof profile === 'object'
            ? profile
            : (bundle && bundle.profile ? bundle.profile : deriveReconsolidationContextProfile(targetMemory, bundle));
        const targetMemoryId = toTrimmedString(
            (bundle && bundle.targetMemoryId)
            || (targetMemory && (targetMemory.memory_id || targetMemory.id))
        );
        const title = toTrimmedString(eventRecord.title) || '这段记忆事件';
        const summary = toTrimmedString(eventRecord.summary);
        const statusLabel = (eventRecord.is_unresolved || toTrimmedString(eventRecord.status).toLowerCase() === 'open')
            ? '这件事还没有真正结束'
            : '这件事大体已经落定';
        const depth = toTrimmedString(eventRecord.depth).toLowerCase();
        const depthLabel = depth === 'high'
            ? '你对这段经历记得很深'
            : (depth === 'medium' ? '你对这段经历有比较完整的印象' : '你只记得这段经历的大概轮廓');
        const flashbulbFlag = !!eventRecord.event_is_flashbulb
            || !!readFirstDefined(normalizeMetadata(eventRecord.metadata), ['event_is_flashbulb', 'is_flashbulb'], false);
        const referenceFragments = selectReconsolidationReferenceFragments(targetMemory, bundle, safeProfile);
        const fragmentLines = referenceFragments
            .map(function mapFragment(row, index) {
                const memoryId = toTrimmedString(row && (row.memory_id || row.id));
                const text = toTrimmedString(row && (row.content || row.summary || row.text));
                if (!text) return null;
                const prefix = memoryId && memoryId === toTrimmedString(eventRecord.anchor_memory_id)
                    ? '锚点片段'
                    : `相关片段${index + 1}`;
                return `- ${prefix}：${text}`;
            })
            .filter(Boolean);
        const modeLabel = safeProfile.mode === 'event_deep'
            ? '高深度事件重构'
            : (safeProfile.mode === 'fragment_strict' ? '轻上下文碎片重构' : '平衡事件重构');

        const lines = [
            '这条记忆属于同一段更大的记忆事件，改写时必须和整段事件保持事实一致。',
            `重构策略：${modeLabel}`,
            `事件标题：${title}`,
            summary ? `事件摘要：${summary}` : '',
            `目标碎片角色：${safeProfile.targetRoleLabel || '事件细节'}；事件状态：${statusLabel}；记忆深度：${depthLabel}${flashbulbFlag ? '；这是一段印象很深的事件' : ''}`,
            safeProfile.mode === 'event_deep'
                ? '这件事的上下文很重要。你可以参考更多相关碎片，保住关键因果、转折和情绪线，但输出仍然只能改写目标碎片本身。'
                : (safeProfile.mode === 'fragment_strict'
                    ? '这件事只需要轻量上下文校验。其他碎片只用于避免事实跑偏，不要把它们拼成整段事件摘要。'
                    : '其他碎片用于辅助校验事实与语气，不要把整件事重新压成一条总摘要。'),
            fragmentLines.length > 0 ? '同一事件里的其他相关碎片如下，它们只用于约束事实，不要整段照抄进输出：' : ''
        ].filter(Boolean);

        return lines.concat(fragmentLines);
    }

    function buildReconsolidationRequestPrompt(targetMemory, currentMood, contextBundle, profile, batchPlan) {
        const mood = currentMood && typeof currentMood === 'object' ? currentMood : {};
        const moodLabel = toTrimmedString(mood.label) || '平静';
        const moodValence = clampNumber(mood.valence, -1, 1, 0);
        const moodArousal = clampNumber(mood.arousal, 0, 1, 0);
        const safeProfile = profile && typeof profile === 'object'
            ? profile
            : deriveReconsolidationContextProfile(targetMemory, contextBundle);
        const safePlan = batchPlan && typeof batchPlan === 'object'
            ? batchPlan
            : deriveReconsolidationBatchPlan(targetMemory, contextBundle, safeProfile);
        const eventContextLines = buildReconsolidationEventContextLines(
            targetMemory,
            contextBundle,
            safeProfile
        );

        if (Array.isArray(safePlan.targets) && safePlan.targets.length > 1) {
            const targetLines = safePlan.targets.map(function mapTarget(row, index) {
                const normalized = normalizeMemoryRow(row);
                if (!normalized) return null;
                const rowId = toTrimmedString(normalized.memory_id || normalized.id);
                if (!rowId) return null;
                const rowProfile = deriveReconsolidationContextProfile(
                    normalized,
                    Object.assign({}, contextBundle || {}, { targetMemoryId: rowId })
                );
                const roleLabel = toTrimmedString(rowProfile.targetRoleLabel) || `事件片段${index + 1}`;
                const text = toTrimmedString(normalized.content);
                return `- memory_id=${rowId} | role=${roleLabel} | 原文=${text}`;
            }).filter(Boolean);

            return [
                '你正在执行“记忆事件级重构”任务。',
                `当前心情：${moodLabel}（valence=${moodValence.toFixed(2)}, arousal=${moodArousal.toFixed(2)}）`,
                ...eventContextLines,
                '下面这些都是真实碎片。请分别改写每一条，不能把它们合并成事件摘要，也不能遗漏任何一个目标 memory_id。',
                targetLines.length > 0 ? targetLines.join('\n') : '',
                '输出 JSON 对象，字段仅允许：rewrites。',
                'rewrites 必须是数组；每项仅允许：memory_id, content, valence, arousal。',
                '每条改写都必须保留该碎片本身的事实、主语和因果，不得替换成别的碎片内容。',
                '不要输出解释，不要输出 Markdown 代码块。'
            ].filter(Boolean).join('\n');
        }

        const originalContent = toTrimmedString(targetMemory && targetMemory.content);
        return [
            '你正在执行“记忆重构”任务。',
            `当前心情：${moodLabel}（valence=${moodValence.toFixed(2)}, arousal=${moodArousal.toFixed(2)}）`,
            ...eventContextLines,
            `原始记忆：${originalContent}`,
            '如果这条记忆属于某个记忆事件，请只改写这一条碎片本身，不要把其他碎片硬拼成整段事件摘要。',
            '请在不改变基本事实的前提下，用当前心境重写这条记忆。',
            '输出 JSON 对象，字段仅允许：content, valence, arousal。',
            '不要输出解释，不要输出 Markdown 代码块。'
        ].join('\n');
    }

    function extractReconsolidationRewritePayloads(parsed, batchPlan, primaryTargetMemoryId) {
        const safeParsed = parsed && typeof parsed === 'object' ? parsed : {};
        const safePlan = batchPlan && typeof batchPlan === 'object' ? batchPlan : {};
        const normalizedPrimaryTargetId = toTrimmedString(primaryTargetMemoryId);
        const allowedTargetIds = new Set(
            (Array.isArray(safePlan.targets) ? safePlan.targets : [])
                .map(function mapTarget(row) {
                    return toTrimmedString(row && (row.memory_id || row.id));
                })
                .filter(Boolean)
        );
        if (normalizedPrimaryTargetId) {
            allowedTargetIds.add(normalizedPrimaryTargetId);
        }

        const rewrites = Array.isArray(safeParsed.rewrites) ? safeParsed.rewrites : [];
        const normalizedRewrites = rewrites.map(function normalizeRewrite(item) {
            const payload = item && typeof item === 'object' ? item : {};
            const memoryId = toTrimmedString(payload.memory_id || payload.id);
            const content = toTrimmedString(payload.content);
            if (!memoryId || !content || (allowedTargetIds.size > 0 && !allowedTargetIds.has(memoryId))) {
                return null;
            }
            return {
                memory_id: memoryId,
                content: content,
                valence: payload.valence,
                arousal: payload.arousal
            };
        }).filter(Boolean);
        if (normalizedRewrites.length > 0) {
            return normalizedRewrites;
        }

        const fallbackContent = toTrimmedString(safeParsed.content);
        if (!fallbackContent || !normalizedPrimaryTargetId) {
            return [];
        }

        return [{
            memory_id: normalizedPrimaryTargetId,
            content: fallbackContent,
            valence: safeParsed.valence,
            arousal: safeParsed.arousal
        }];
    }

    async function applyReconsolidationRewriteBatch(
        supabase,
        userId,
        charId,
        sourceMemory,
        targetMemory,
        targetMemoryId,
        sourceMemoryId,
        batchPlan,
        reconsolidationContext,
        reconsolidationProfile,
        rewritePayloads
    ) {
        const safePlan = batchPlan && typeof batchPlan === 'object' ? batchPlan : {};
        const targetRows = Array.isArray(safePlan.targets) && safePlan.targets.length > 0
            ? safePlan.targets
            : [targetMemory];
        const batchTargetIds = mergeUniqueIds(
            targetRows.map(function mapTarget(row) {
                return toTrimmedString(row && (row.memory_id || row.id));
            }),
            [],
            12
        );
        const reconstructedAt = new Date().toISOString();
        const acceptedUpdates = [];
        const rejectedWrites = [];
        let latestGuardReport = null;

        for (let rewriteIndex = 0; rewriteIndex < rewritePayloads.length; rewriteIndex += 1) {
            const rewrite = rewritePayloads[rewriteIndex];
            const rewriteTargetId = toTrimmedString(rewrite && rewrite.memory_id);
            const currentTarget = normalizeMemoryRow(
                targetRows.find(function findTarget(row) {
                    return toTrimmedString(row && (row.memory_id || row.id)) === rewriteTargetId;
                }) || (rewriteTargetId === targetMemoryId ? targetMemory : null)
            );
            if (!currentTarget || !rewriteTargetId) continue;

            const currentOriginalContent = toTrimmedString(currentTarget.content);
            const nextContent = toTrimmedString(rewrite && rewrite.content);
            if (!currentOriginalContent || !nextContent) continue;

            const targetBundle = Object.assign({}, reconsolidationContext || {}, {
                targetMemoryId: rewriteTargetId
            });
            const targetProfile = deriveReconsolidationContextProfile(currentTarget, targetBundle);
            const eventSummaryText = toTrimmedString(
                targetBundle && targetBundle.eventRecord
                    ? targetBundle.eventRecord.summary
                    : (sourceMemory.event_summary || sourceMemory.content)
            );
            if (eventSummaryText && eventSummaryText !== currentOriginalContent && nextContent === eventSummaryText) {
                const summaryCopyGuard = {
                    guardLevel: targetProfile.mode === 'event_deep' || targetProfile.targetRole === 'anchor'
                        ? 'strict'
                        : 'balanced',
                    mode: targetProfile.mode,
                    targetRole: targetProfile.targetRole,
                    reasons: ['summary_copy_risk'],
                    originalSimilarity: 0,
                    summarySimilarity: 1,
                    referenceSimilarity: 0,
                    keywordCoverage: 0,
                    checkedKeywordCount: 0,
                    coveredKeywordCount: 0,
                    lengthRatio: 1
                };
                await persistReconsolidationGuardRejection(
                    supabase,
                    userId,
                    charId,
                    currentTarget,
                    targetProfile,
                    summaryCopyGuard,
                    {
                        skippedReason: 'summary_copy_risk',
                        scope: safePlan.scope,
                        batchSize: safePlan.targetCount,
                        batchTargetIds: batchTargetIds
                    }
                );
                rejectedWrites.push({
                    memoryId: rewriteTargetId,
                    reason: 'summary_copy_risk'
                });
                continue;
            }

            const guardReport = evaluateReconsolidationRewriteSafety(
                currentTarget,
                nextContent,
                targetBundle,
                targetProfile
            );
            if (!guardReport.safe) {
                console.log(
                    `[海马体][重构] 跳过片段 ${rewriteTargetId}：guard=${guardReport.guardLevel}, reasons=${Array.isArray(guardReport.reasons) ? guardReport.reasons.join(',') : ''}`
                );
                await persistReconsolidationGuardRejection(
                    supabase,
                    userId,
                    charId,
                    currentTarget,
                    targetProfile,
                    guardReport,
                    {
                        skippedReason: 'guard_rejected',
                        scope: safePlan.scope,
                        batchSize: safePlan.targetCount,
                        batchTargetIds: batchTargetIds
                    }
                );
                rejectedWrites.push({
                    memoryId: rewriteTargetId,
                    reason: 'guard_rejected'
                });
                continue;
            }

            const nextValence = clampNumber(
                rewrite.valence,
                -1,
                1,
                toFiniteNumber(currentTarget.valence, 0)
            );
            const nextArousal = clampNumber(
                rewrite.arousal,
                0,
                1,
                toFiniteNumber(currentTarget.arousal, 0)
            );
            const metadata = normalizeMetadata(currentTarget.metadata);
            const history = Array.isArray(metadata.history) ? metadata.history.slice(-4) : [];
            const guardSnapshot = buildReconsolidationGuardMetadataSnapshot(
                guardReport,
                'accepted',
                reconstructedAt
            );
            history.push({
                content: currentOriginalContent,
                valence: toFiniteNumber(currentTarget.valence, 0),
                arousal: toFiniteNumber(currentTarget.arousal, 0),
                reconstructed_at: reconstructedAt,
                strategy: safePlan.strategy || targetProfile.mode,
                target_role: targetProfile.targetRole,
                context_fragment_count: targetProfile.contextFragmentCount,
                event_id: getMemoryEventId(currentTarget) || getMemoryEventId(sourceMemory),
                scope: safePlan.scope,
                batch_size: safePlan.targetCount,
                batch_index: rewriteIndex + 1,
                batch_target_ids: batchTargetIds.slice(0, 12)
            });

            const mergedReasonTags = Array.from(new Set(
                []
                    .concat(Array.isArray(targetProfile.reasonTags) ? targetProfile.reasonTags : [])
                    .concat(Array.isArray(safePlan.reasonTags) ? safePlan.reasonTags : [])
            )).map(toTrimmedString).filter(Boolean).slice(0, 8);
            const nextMetadata = Object.assign({}, metadata, {
                history: history,
                last_reconsolidated_at: reconstructedAt,
                last_reconsolidation_strategy: safePlan.strategy || targetProfile.mode,
                last_reconsolidation_target_role: targetProfile.targetRole,
                last_reconsolidation_context_fragment_count: targetProfile.contextFragmentCount,
                last_reconsolidation_reason_tags: mergedReasonTags,
                last_reconsolidation_guard: guardSnapshot,
                last_reconsolidation_scope: safePlan.scope,
                last_reconsolidation_batch_size: safePlan.targetCount,
                last_reconsolidation_batch_target_ids: batchTargetIds.slice(0, 12)
            });

            const safeCurrentCharId = charId || toTrimmedString(currentTarget.char_id || currentTarget.charId);
            let updateQuery = supabase
                .from('hippocampus_memories')
                .update({
                    content: nextContent,
                    valence: nextValence,
                    arousal: nextArousal,
                    metadata: nextMetadata
                })
                .eq('id', rewriteTargetId)
                .eq('user_id', userId);
            if (safeCurrentCharId) {
                updateQuery = updateQuery.eq('char_id', safeCurrentCharId);
            }
            const { error } = await updateQuery;
            if (error) throw error;

            latestGuardReport = guardReport;
            acceptedUpdates.push(Object.assign({}, currentTarget, {
                content: nextContent,
                valence: nextValence,
                arousal: nextArousal,
                metadata: nextMetadata
            }));
        }

        if (acceptedUpdates.length === 0) {
            return {
                reconstructed: false,
                reconsolidationStrategy: safePlan.strategy || reconsolidationProfile.mode,
                reconsolidationScope: safePlan.scope,
                skippedReason: rejectedWrites[0] ? rejectedWrites[0].reason : 'no_valid_rewrite'
            };
        }

        const primaryUpdatedMemory = acceptedUpdates.find(function findPrimary(item) {
            return toTrimmedString(item && (item.memory_id || item.id)) === targetMemoryId;
        }) || acceptedUpdates[0];
        const safeTargetCharId = charId || toTrimmedString(targetMemory.char_id || targetMemory.charId);
        await refreshEventSummaryAfterFragmentReconsolidation(
            supabase,
            userId,
            safeTargetCharId,
            getMemoryEventId(targetMemory) || getMemoryEventId(sourceMemory),
            {
                strategy: safePlan.strategy || reconsolidationProfile.mode,
                targetRole: reconsolidationProfile.targetRole,
                targetMemoryId: targetMemoryId,
                sourceMemoryId: sourceMemoryId,
                contextFragmentCount: reconsolidationProfile.contextFragmentCount,
                reasonTags: Array.from(new Set(
                    []
                        .concat(Array.isArray(reconsolidationProfile.reasonTags) ? reconsolidationProfile.reasonTags : [])
                        .concat(Array.isArray(safePlan.reasonTags) ? safePlan.reasonTags : [])
                )).map(toTrimmedString).filter(Boolean).slice(0, 8),
                guardReport: latestGuardReport,
                scope: safePlan.scope,
                batchSize: safePlan.targetCount,
                batchAcceptedCount: acceptedUpdates.length,
                batchTargetIds: batchTargetIds
            }
        );

        console.log(
            `[海马体][重构] 重构完成：strategy=${safePlan.strategy || reconsolidationProfile.mode}, accepted=${acceptedUpdates.length}/${Math.max(safePlan.targetCount || 0, rewritePayloads.length)}`
        );
        return {
            reconstructed: true,
            reconstructedCount: acceptedUpdates.length,
            rejectedCount: rejectedWrites.length,
            reconsolidationStrategy: safePlan.strategy || reconsolidationProfile.mode,
            reconsolidationScope: safePlan.scope,
            reconsolidationGuard: latestGuardReport,
            memory: primaryUpdatedMemory,
            memories: acceptedUpdates
        };
    }

    async function refreshEventSummaryAfterFragmentReconsolidation(supabase, userId, charId, eventId, options) {
        const safeUserId = toTrimmedString(userId);
        const safeCharId = toTrimmedString(charId);
        const safeEventId = toTrimmedString(eventId);
        if (!supabase || !safeUserId || !safeCharId || !safeEventId) return false;

        const eventRecordMap = await fetchEventRecordsMap(supabase, safeUserId, safeCharId, [safeEventId]);
        const eventRecord = eventRecordMap.get(safeEventId) || null;
        if (!eventRecord || eventRecord.manual_edited) return false;

        const fragmentIds = collectEventFragmentReferenceIds(eventRecord, {
            memberLimit: 96,
            totalLimit: 96,
            detailLimit: 24,
            flashbulbLimit: 24
        });
        if (fragmentIds.length === 0) return false;

        const fragmentMap = await fetchMemoryRowsMapByIds(supabase, safeUserId, safeCharId, fragmentIds);
        const ordered = sortEventFragmentsForRecord(Array.from(fragmentMap.values()), eventRecord);
        if (ordered.length === 0) return false;

        const anchorId = toTrimmedString(eventRecord.anchor_memory_id);
        const anchor = ordered.find(function findAnchor(row) {
            return toTrimmedString(row && row.memory_id) === anchorId;
        }) || ordered[0] || null;
        const nextSummary = buildEventSummaryFromFragments(ordered);
        const flashbulbInfo = deriveEventFlashbulbState(ordered, eventRecord);
        const optionsSource = options && typeof options === 'object' ? options : {};
        const refreshedAt = new Date().toISOString();
        const previousMetadata = normalizeMetadata(eventRecord.metadata);
        const previousFlashbulbIds = mergeUniqueIds(
            Array.isArray(eventRecord.event_flashbulb_memory_ids)
                ? eventRecord.event_flashbulb_memory_ids
                : readFirstDefined(previousMetadata, ['event_flashbulb_memory_ids', 'eventFlashbulbMemoryIds'], []),
            [],
            24
        );
        const nextMetadata = Object.assign(
            {},
            previousMetadata,
            {
                event_is_flashbulb: flashbulbInfo.isFlashbulb,
                event_flashbulb_memory_ids: flashbulbInfo.memoryIds,
                summary_refreshed_at: refreshedAt
            }
        );
        const strategy = toTrimmedString(optionsSource.strategy);
        const targetRole = toTrimmedString(optionsSource.targetRole);
        const targetMemoryId = toTrimmedString(optionsSource.targetMemoryId);
        const sourceMemoryId = toTrimmedString(optionsSource.sourceMemoryId);
        const reconScope = toTrimmedString(optionsSource.scope);
        const batchSize = Math.max(0, Math.floor(toFiniteNumber(optionsSource.batchSize, 0)));
        const batchAcceptedCount = Math.max(0, Math.floor(toFiniteNumber(optionsSource.batchAcceptedCount, 0)));
        const batchTargetIds = mergeUniqueIds(
            Array.isArray(optionsSource.batchTargetIds) ? optionsSource.batchTargetIds : [],
            [],
            12
        );
        if (strategy) nextMetadata.last_reconsolidation_strategy = strategy;
        if (targetRole) nextMetadata.last_reconsolidation_target_role = targetRole;
        if (targetMemoryId) nextMetadata.last_reconsolidated_fragment_id = targetMemoryId;
        if (sourceMemoryId) nextMetadata.last_reconsolidation_source_memory_id = sourceMemoryId;
        if (reconScope) nextMetadata.last_reconsolidation_scope = reconScope;
        if (batchSize > 0) nextMetadata.last_reconsolidation_batch_size = batchSize;
        if (batchAcceptedCount > 0) nextMetadata.last_reconsolidation_batch_accepted_count = batchAcceptedCount;
        if (batchTargetIds.length > 0) nextMetadata.last_reconsolidation_batch_target_ids = batchTargetIds.slice(0, 12);
        if (optionsSource.contextFragmentCount !== undefined) {
            nextMetadata.last_reconsolidation_context_fragment_count = Math.max(0, Math.floor(toFiniteNumber(optionsSource.contextFragmentCount, 0)));
        }
        if (Array.isArray(optionsSource.reasonTags) && optionsSource.reasonTags.length > 0) {
            nextMetadata.last_reconsolidation_reason_tags = optionsSource.reasonTags.map(toTrimmedString).filter(Boolean).slice(0, 8);
        }
        if (optionsSource.guardReport && typeof optionsSource.guardReport === 'object') {
            nextMetadata.last_reconsolidation_guard = buildReconsolidationGuardMetadataSnapshot(
                optionsSource.guardReport,
                'event_refresh',
                refreshedAt
            );
        }
        nextMetadata.last_reconsolidated_at = refreshedAt;
        const nextTitle = toTrimmedString(eventRecord.title)
            || toTrimmedString(anchor && anchor.content).slice(0, 20)
            || `记忆事件(${safeEventId.slice(0, 8)})`;
        const titleChanged = toTrimmedString(eventRecord.title) !== toTrimmedString(nextTitle);
        const summaryChanged = toTrimmedString(eventRecord.summary) !== toTrimmedString(nextSummary);
        const flashbulbStateChanged = !!eventRecord.event_is_flashbulb !== !!flashbulbInfo.isFlashbulb;
        const flashbulbMembersChanged = JSON.stringify(previousFlashbulbIds) !== JSON.stringify(flashbulbInfo.memoryIds || []);
        const changeFields = [];
        if (titleChanged) changeFields.push('title');
        if (summaryChanged) changeFields.push('summary');
        if (flashbulbStateChanged) changeFields.push('flashbulb');
        if (flashbulbMembersChanged) changeFields.push('flashbulb_members');
        if (changeFields.length > 0) {
            const versionEntry = {
                changed_at: refreshedAt,
                source: 'reconsolidation_refresh',
                change_fields: changeFields,
                previous_title: clipMetadataHistoryText(eventRecord.title, 80),
                next_title: clipMetadataHistoryText(nextTitle, 80),
                previous_summary: clipMetadataHistoryText(eventRecord.summary, 180),
                next_summary: clipMetadataHistoryText(nextSummary, 180),
                previous_flashbulb: !!eventRecord.event_is_flashbulb,
                next_flashbulb: !!flashbulbInfo.isFlashbulb,
                previous_flashbulb_memory_ids: previousFlashbulbIds.slice(0, 12),
                next_flashbulb_memory_ids: mergeUniqueIds(flashbulbInfo.memoryIds, [], 12)
            };
            if (strategy) versionEntry.strategy = strategy;
            if (targetRole) versionEntry.target_role = targetRole;
            if (targetMemoryId) versionEntry.target_memory_id = targetMemoryId;
            if (sourceMemoryId) versionEntry.source_memory_id = sourceMemoryId;
            if (reconScope) versionEntry.scope = reconScope;
            if (batchSize > 0) versionEntry.batch_size = batchSize;
            if (batchAcceptedCount > 0) versionEntry.batch_accepted_count = batchAcceptedCount;
            if (batchTargetIds.length > 0) versionEntry.batch_target_ids = batchTargetIds.slice(0, 12);
            if (optionsSource.contextFragmentCount !== undefined) {
                versionEntry.context_fragment_count = Math.max(0, Math.floor(toFiniteNumber(optionsSource.contextFragmentCount, 0)));
            }
            if (Array.isArray(optionsSource.reasonTags) && optionsSource.reasonTags.length > 0) {
                versionEntry.reason_tags = optionsSource.reasonTags.map(toTrimmedString).filter(Boolean).slice(0, 8);
            }
            if (optionsSource.guardReport && typeof optionsSource.guardReport === 'object') {
                versionEntry.guard_level = toTrimmedString(optionsSource.guardReport.guardLevel) || 'balanced';
                versionEntry.guard_reasons = Array.isArray(optionsSource.guardReport.reasons)
                    ? optionsSource.guardReport.reasons.map(toTrimmedString).filter(Boolean).slice(0, 4)
                    : [];
            }
            nextMetadata.event_version_history = appendMetadataHistoryEntry(
                { event_version_history: previousMetadata.event_version_history },
                'event_version_history',
                versionEntry,
                10
            ).event_version_history;
            nextMetadata.last_event_version_at = refreshedAt;
            nextMetadata.last_event_version_source = 'reconsolidation_refresh';
            nextMetadata.last_event_version_fields = changeFields.slice(0, 8);
        }
        if (!summaryChanged && !flashbulbStateChanged && !flashbulbMembersChanged && JSON.stringify(nextMetadata) === JSON.stringify(previousMetadata)) {
            return false;
        }

        try {
            const response = await supabase
                .from('hippocampus_memory_events')
                .update({
                    title: nextTitle,
                    summary: nextSummary,
                    metadata: nextMetadata
                })
                .eq('id', safeEventId)
                .eq('user_id', safeUserId)
                .eq('char_id', safeCharId)
                .eq('manual_edited', false)
                .select('id')
                .limit(1);

            if (response && response.error) {
                throw response.error;
            }
            return Array.isArray(response && response.data) && response.data.length > 0;
        } catch (error) {
            console.warn('[海马体][重构] 事件摘要刷新失败，已跳过:', error && error.message ? error.message : error);
            return false;
        }
    }

    async function activateWithReconsolidation(memory, currentMood, apiConfig, options) {
        if (!isEnabled()) return { activatedCount: 0, reconstructed: false };
        if (!memory || typeof memory !== 'object') return { activatedCount: 0, reconstructed: false };

        const memoryId = toTrimmedString(memory.memory_id || memory.id);
        const userId = toTrimmedString(memory.user_id || memory.userId);
        const charId = toTrimmedString(memory.char_id || memory.charId);
        if (!memoryId || !userId) return { activatedCount: 0, reconstructed: false };
        const optionSource = options && typeof options === 'object' ? options : {};
        const forceReconsolidation = !!readFirstDefined(optionSource, ['force', 'manual'], false);

        const activatedCount = await activateMemories(userId, [memoryId]);
        if (!isV2Enabled() || !state.settings.enableReconsolidation) {
            if (!forceReconsolidation) {
                return { activatedCount: activatedCount, reconstructed: false };
            }
        }

        if (!isV2Enabled() && !forceReconsolidation) {
            return { activatedCount: activatedCount, reconstructed: false };
        }

        const chanceThreshold = clampNumber(
            readFirstDefined(
                optionSource,
                ['triggerChance', 'chance'],
                state.settings && state.settings.reconsolidationTriggerChance !== undefined
                    ? state.settings.reconsolidationTriggerChance
                    : 0.2
            ),
            0,
            1,
            0.2
        );
        if (!forceReconsolidation) {
            const roll = Math.random();
            const shouldReconstruct = roll < chanceThreshold;
            console.log(`[海马体][重构] 概率检查：roll=${roll.toFixed(4)}，阈值=${chanceThreshold.toFixed(2)}，触发=${shouldReconstruct}`);
            if (!shouldReconstruct) {
                return { activatedCount: activatedCount, reconstructed: false };
            }
        } else {
            console.log(`[海马体][重构] 手动触发：跳过概率门控，阈值配置=${chanceThreshold.toFixed(2)}`);
        }

        const config = apiConfig && typeof apiConfig === 'object' ? apiConfig : {};
        const apiUrl = toTrimmedString(config.apiUrl || config.url || config.baseUrl).replace(/\/+$/, '');
        const apiKey = toTrimmedString(config.apiKey || config.key);
        const model = toTrimmedString(config.model || config.modelName);
        const fetchImpl = getFetchImplementation();
        const supabase = getSupabaseClient();
        if (!fetchImpl || !supabase || !apiUrl || !model) {
            return { activatedCount: activatedCount, reconstructed: false };
        }

        const targetMemory = await resolveReconsolidationTargetMemory(supabase, memory, userId, charId);
        if (!targetMemory) {
            console.log('[海马体][重构] 跳过：未能解析到可安全重构的真实碎片');
            return { activatedCount: activatedCount, reconstructed: false };
        }
        const targetMemoryId = toTrimmedString(targetMemory.memory_id || targetMemory.id);
        if (!targetMemoryId) {
            return { activatedCount: activatedCount, reconstructed: false };
        }

        const requestUrl = apiUrl.endsWith('/chat/completions') ? apiUrl : `${apiUrl}/chat/completions`;
        if (!toTrimmedString(targetMemory.content)) return { activatedCount: activatedCount, reconstructed: false };
        const reconsolidationContext = await buildReconsolidationEventContext(supabase, targetMemory, userId, charId);
        const reconsolidationProfile = reconsolidationContext && reconsolidationContext.profile
            ? reconsolidationContext.profile
            : deriveReconsolidationContextProfile(targetMemory, reconsolidationContext);
        const batchPlan = deriveReconsolidationBatchPlan(
            targetMemory,
            reconsolidationContext,
            reconsolidationProfile,
            {
                batchMode: readFirstDefined(
                    optionSource,
                    ['batchMode', 'reconsolidationBatchMode'],
                    state.settings ? state.settings.reconsolidationBatchMode : 'auto'
                )
            }
        );
        if (forceReconsolidation) {
            batchPlan.reasonTags = Array.from(new Set(
                []
                    .concat(Array.isArray(batchPlan.reasonTags) ? batchPlan.reasonTags : [])
                    .concat(['manual_trigger'])
            )).map(toTrimmedString).filter(Boolean).slice(0, 10);
        }
        const prompt = buildReconsolidationRequestPrompt(
            targetMemory,
            currentMood,
            reconsolidationContext,
            reconsolidationProfile,
            batchPlan
        );
        if (batchPlan && batchPlan.scope === 'event_batch') {
            console.log(
                `[海马体][重构] 事件级批量计划：targets=${batchPlan.targets.map((row) => toTrimmedString(row && (row.memory_id || row.id))).filter(Boolean).join(',')}, strategy=${batchPlan.strategy}`
            );
        }

        const headers = {
            'Content-Type': 'application/json'
        };
        if (apiKey) {
            headers.Authorization = `Bearer ${apiKey}`;
        }

        /**
         * 从模型响应中提取文本正文，兼容常见 OpenAI 风格返回。
         */
        function extractText(payload) {
            if (typeof payload === 'string') return payload;
            if (!payload || typeof payload !== 'object') return '';
            if (typeof payload.output_text === 'string') return payload.output_text;
            if (Array.isArray(payload.choices) && payload.choices[0] && payload.choices[0].message) {
                const content = payload.choices[0].message.content;
                if (typeof content === 'string') return content;
                if (Array.isArray(content)) {
                    return content.map(function mapPart(part) {
                        if (typeof part === 'string') return part;
                        if (part && typeof part.text === 'string') return part.text;
                        return '';
                    }).join('');
                }
            }
            if (typeof payload.content === 'string') return payload.content;
            if (typeof payload.text === 'string') return payload.text;
            return '';
        }

        try {
            const response = await fetchImpl(requestUrl, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    model: model,
                    temperature: 0.4,
                    max_tokens: 600,
                    messages: [
                        {
                            role: 'user',
                            content: prompt
                        }
                    ]
                })
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const payload = await response.json();
            const rawText = toTrimmedString(extractText(payload));
            if (!rawText) {
                return { activatedCount: activatedCount, reconstructed: false };
            }

            const jsonCandidateMatch = rawText.match(/\{[\s\S]*\}/);
            const candidate = jsonCandidateMatch ? jsonCandidateMatch[0] : rawText;
            const parsed = JSON.parse(candidate);
            const rewritePayloads = extractReconsolidationRewritePayloads(parsed, batchPlan, targetMemoryId);
            if (rewritePayloads.length === 0) {
                return { activatedCount: activatedCount, reconstructed: false };
            }

            const rewriteResult = await applyReconsolidationRewriteBatch(
                supabase,
                userId,
                charId,
                memory,
                targetMemory,
                targetMemoryId,
                memoryId,
                batchPlan,
                reconsolidationContext,
                reconsolidationProfile,
                rewritePayloads
            );
            return Object.assign({
                activatedCount: activatedCount
            }, rewriteResult);
        } catch (error) {
            console.warn('[海马体][重构] 重构失败，已跳过:', error && error.message ? error.message : error);
            return { activatedCount: activatedCount, reconstructed: false };
        }
    }

    /**
     * 批量标记记忆是否已释怀。
     */
    async function resolveMemories(userId, memoryIds, resolved) {
        if (!isEnabled()) return 0;

        const supabase = getSupabaseClient();
        if (!supabase) return 0;

        const ids = Array.isArray(memoryIds) ? memoryIds.filter(Boolean) : [];
        if (ids.length === 0) return 0;

        try {
            const { data, error } = await supabase.rpc('set_hippo_memories_resolved', {
                p_user_id: userId,
                p_memory_ids: ids,
                p_resolved: !!resolved
            });

            if (error) throw error;
            return toFiniteNumber(data, 0);
        } catch (error) {
            console.warn('[海马体] 更新记忆释怀状态失败，已静默跳过:', error && error.message ? error.message : error);
            return 0;
        }
    }

    /**
     * 从记忆元数据中提取一个最适合“关键词命中提示”的词。
     */
    function getMemoryRecallKeyword(memory) {
        const metadata = normalizeMetadata(memory && memory.metadata);
        const explicit = toTrimmedString(memory && memory._hitKeyword);
        if (explicit) return explicit;

        const keywords = normalizeTriggerKeywords(metadata.trigger_keywords || []);
        return keywords[0] || '';
    }

    /**
     * 从记忆元数据中提取一个最适合“感官触发提示”的锚点词。
     */
    function getMemorySensoryAnchor(memory) {
        const explicit = toTrimmedString(memory && (memory._hitSensoryAnchor || memory.event_sensory_anchor));
        if (explicit) return explicit;

        const metadata = normalizeMetadata(memory && memory.metadata);
        const anchors = normalizeTriggerKeywords(metadata.sensory_anchors || []);
        return anchors[0] || '';
    }

    /**
     * 规范化感官文本，去掉空白与标点，便于本地兜底匹配。
     */
    function normalizeSensoryText(text) {
        return toTrimmedString(text)
            .toLowerCase()
            .replace(/[\u3000\s]+/g, '')
            .replace(/[^a-z0-9\u4e00-\u9fa5]/g, '');
    }

    /**
     * 计算两个字符串的最长公共连续子串长度。
     */
    function getLongestCommonSubstringLength(leftText, rightText) {
        const left = toTrimmedString(leftText);
        const right = toTrimmedString(rightText);
        if (!left || !right) return 0;

        const dp = new Array(right.length + 1).fill(0);
        let maxLength = 0;

        for (let i = 1; i <= left.length; i += 1) {
            for (let j = right.length; j >= 1; j -= 1) {
                if (left.charCodeAt(i - 1) === right.charCodeAt(j - 1)) {
                    dp[j] = dp[j - 1] + 1;
                    if (dp[j] > maxLength) {
                        maxLength = dp[j];
                    }
                } else {
                    dp[j] = 0;
                }
            }
        }

        return maxLength;
    }

    /**
     * 当 SQL 的 hit_by_sensory 未命中时，做一次本地感官锚点弱匹配兜底。
     */
    function hasLocalSensoryAnchorHit(query, memory) {
        const normalizedQuery = normalizeSensoryText(query);
        if (!normalizedQuery) return false;

        const metadata = normalizeMetadata(memory && memory.metadata);
        const anchors = normalizeTriggerKeywords(metadata.sensory_anchors || []);
        if (anchors.length === 0) return false;

        for (let i = 0; i < anchors.length; i += 1) {
            const normalizedAnchor = normalizeSensoryText(anchors[i]);
            if (!normalizedAnchor) continue;

            if (normalizedQuery.includes(normalizedAnchor) || normalizedAnchor.includes(normalizedQuery)) {
                return true;
            }

            const lcsLength = getLongestCommonSubstringLength(normalizedQuery, normalizedAnchor);
            if (lcsLength >= 2) {
                const hasSensoryHint = /[冷热痛酸甜苦麻痒香臭味声光雨风湿干硬软烫凉]/.test(normalizedQuery + normalizedAnchor);
                if (hasSensoryHint) return true;
            }
        }

        return false;
    }

    /**
     * 将海马体的情绪数值转成自然中文描述，供 Prompt 注入使用。
     */
    function formatEventSignalHint(memory) {
        if (!memory || typeof memory !== 'object') return '';
        const metadata = normalizeMetadata(memory.metadata);
        const tags = (Array.isArray(metadata.event_signal_tags)
            ? metadata.event_signal_tags
            : Array.isArray(memory.event_signal_tags)
                ? memory.event_signal_tags
                : []
        ).map(toTrimmedString).filter(Boolean);
        if (tags.length === 0) return '';

        const tagSet = new Set(tags);
        if (tagSet.has('high_conflict') && tagSet.has('high_attachment')) {
            return '这件事既很牵挂你，也夹着明显的冲突和不甘';
        }
        if (tagSet.has('grievance_pull')) {
            return '这件事里还压着没散掉的委屈和冲突';
        }
        if (tagSet.has('attachment_pull')) {
            return '这件事你一直挂在心上，很难一下放掉';
        }
        if (tagSet.has('high_conflict')) {
            return '这件事带着明显的冲突感';
        }
        if (tagSet.has('high_attachment')) {
            return '这件事对你来说牵挂很深';
        }
        if (tagSet.has('emotionally_intense') && tagSet.has('contrast')) {
            return '这件事的情绪和反差都很强';
        }
        if (tagSet.has('painful') && tagSet.has('open_loop')) {
            return '这件事还带着明显的不甘或委屈';
        }
        if (tagSet.has('warm')) {
            return '这是一段带着温度的回忆';
        }
        if (tagSet.has('contrast')) {
            return '这件事有很强的反差感';
        }
        if (tagSet.has('vivid_details')) {
            return '你对这件事的细节记得很清楚';
        }
        if (tagSet.has('recurrent')) {
            return '这件事最近总会反复想起';
        }
        if (tagSet.has('emotionally_intense')) {
            return '这件事仍然很牵动你的情绪';
        }
        return '';
    }

    function normalizeMemorySourceChannel(value) {
        const normalized = toTrimmedString(value).toLowerCase();
        if (normalized === 'st_companion' || normalized === 'sillytavern' || normalized === 'sillytavern_sidecar' || normalized === 'sillytavern_companion_text') {
            return 'sillytavern_companion';
        }
        if (normalized === 'offline' || normalized === 'offline_chat') {
            return 'offline_mode';
        }
        if (normalized === 'voice_call_text' || normalized === 'voice_call_record') {
            return 'voice_call';
        }
        if (normalized === 'video_call_text' || normalized === 'video_call_record') {
            return 'video_call';
        }
        if (normalized === 'voice_call' || normalized === 'video_call' || normalized === 'text_chat' || normalized === 'offline_mode' || normalized === 'sillytavern_companion') {
            return normalized;
        }
        return '';
    }

    function collectMemorySourceChannels(memory) {
        const safeMemory = memory && typeof memory === 'object' ? memory : {};
        const metadata = normalizeMetadata(safeMemory.metadata);
        const channels = [];
        const seen = new Set();

        function push(raw) {
            const normalized = normalizeMemorySourceChannel(raw);
            if (!normalized || seen.has(normalized)) return;
            seen.add(normalized);
            channels.push(normalized);
        }

        push(safeMemory.source_channel);
        push(safeMemory.sourceChannel);
        push(metadata.source_channel);
        push(metadata.sourceChannel);
        push(safeMemory.source_type);
        push(safeMemory.sourceType);
        push(metadata.source_type);
        push(metadata.sourceType);

        []
            .concat(Array.isArray(safeMemory.source_channels) ? safeMemory.source_channels : [])
            .concat(Array.isArray(safeMemory.sourceChannels) ? safeMemory.sourceChannels : [])
            .concat(Array.isArray(metadata.source_channels) ? metadata.source_channels : [])
            .concat(Array.isArray(metadata.sourceChannels) ? metadata.sourceChannels : [])
            .forEach(push);

        if (channels.length === 0) {
            const details = Array.isArray(safeMemory.event_detail_memories) ? safeMemory.event_detail_memories : [];
            details.forEach(function pushDetailChannels(detail) {
                if (!detail || typeof detail !== 'object') return;
                const detailMetadata = normalizeMetadata(detail.metadata);
                push(detail.source_channel);
                push(detail.sourceChannel);
                push(detailMetadata.source_channel);
                push(detailMetadata.sourceChannel);
                []
                    .concat(Array.isArray(detail.source_channels) ? detail.source_channels : [])
                    .concat(Array.isArray(detail.sourceChannels) ? detail.sourceChannels : [])
                    .concat(Array.isArray(detailMetadata.source_channels) ? detailMetadata.source_channels : [])
                    .concat(Array.isArray(detailMetadata.sourceChannels) ? detailMetadata.sourceChannels : [])
                    .forEach(push);
            });
        }

        return channels;
    }

    function formatMemorySourceChannelLead(memory) {
        const channels = collectMemorySourceChannels(memory);
        if (channels.length === 0) return '';
        const metadata = normalizeMetadata(memory && memory.metadata);
        const location = toTrimmedString(
            memory && (memory.source_location || memory.sourceLocation)
            || metadata.source_location
            || metadata.sourceLocation
            || (Array.isArray(metadata.source_locations) ? metadata.source_locations[0] : '')
        );
        if (channels.includes('offline_mode')) return location ? `[线下模式·${location}] ` : '[线下模式] ';
        if (channels.includes('sillytavern_companion')) return '[酒馆陪读] ';
        if (channels.includes('video_call') && channels.includes('voice_call')) return '[语音/视频通话] ';
        if (channels.includes('video_call')) return '[视频通话] ';
        if (channels.includes('voice_call')) return '[语音通话] ';
        return '';
    }

    function formatMemoryForPrompt(memory) {
        if (!isEnabled()) return '';
        if (!memory || typeof memory !== 'object') return '';

        const metadata = normalizeMetadata(memory.metadata);
        const isEventCluster = !!memory.is_event_cluster
            || toTrimmedString(memory.source_type) === 'event_cluster'
            || (toTrimmedString(memory.event_id) && Array.isArray(memory.event_detail_memories) && memory.event_detail_memories.length > 0);
        const timeLead = formatMemoryPromptTimeLead(memory);
        const sourceLead = formatMemorySourceChannelLead(memory);

        if (isEventCluster) {
            const flashbulbLabel = memory.event_is_flashbulb ? ' [flashbulb]' : '';
            const title = `${toTrimmedString(memory.event_title) || '记忆事件'}${flashbulbLabel}`;
            const summary = toTrimmedString(memory.event_summary || memory.content);
            const unresolved = !!memory.event_is_unresolved || toTrimmedString(memory.event_status).toLowerCase() === 'open';
            const depth = toTrimmedString(memory.event_depth).toLowerCase();
            const depthLabel = depth === 'high'
                ? '你对这件事记得非常深'
                : depth === 'medium'
                    ? '你对这件事有比较完整的印象'
                    : '你对这件事记得大概轮廓';
            const signalHint = formatEventSignalHint(memory);
            const detailSource = sortEventDetailMemoriesByPriority(
                Array.isArray(memory.event_detail_memories) ? memory.event_detail_memories : [],
                memory
            );
            const prioritizedDetailItems = detailSource
                .map(function mapDetail(item) {
                    if (!item || typeof item !== 'object') return null;
                    const text = toTrimmedString(item.content || item.summary || item.text);
                    if (!text) return null;
                    const label = formatEventDetailRoleLabel(item);
                    return {
                        text: text,
                        isAnchor: !!item.is_anchor,
                        label: label
                    };
                })
                .filter(Boolean);
            const highlightedDetailCount = prioritizedDetailItems.filter(function countHighlighted(item) {
                return !!item && !!item.label && item.label !== '细节' && item.label !== '片段';
            }).length;
            const detailItems = prioritizedDetailItems.slice(0, depth === 'high'
                ? (highlightedDetailCount >= 3 ? 3 : 4)
                : 3);
            const anchorItem = detailItems.find(function findAnchor(item) {
                return !!(item && item.isAnchor);
            }) || null;
            const anchorLine = anchorItem ? anchorItem.text : '';
            const extraLines = detailItems
                .filter(function filterExtra(item) {
                    if (!item) return false;
                    if (anchorItem && item.text === anchorItem.text && item.isAnchor === anchorItem.isAnchor) return false;
                    return true;
                })
                .map(function mapExtra(item) {
                    if (item.label && item.label !== '细节' && item.label !== '片段') {
                        return `${item.label}: ${item.text}`;
                    }
                    return item.text;
                });

            const detailTail = extraLines.length > 0 ? ` [细节] ${extraLines.join(' / ')}` : '';
            const anchorTail = anchorLine ? ` [锚点] ${anchorLine}` : '';
            if (memory._isIntrusive) {
                const intrusiveLead = unresolved
                    ? '那件一直没真正放下的事又涌了上来'
                    : '某件旧事忽然闯进了脑海';
                return `${timeLead}${sourceLead}（${intrusiveLead}：“${title}”${summary ? `，${summary}` : ''}）${anchorTail}${detailTail}`;
            }
            if (memory._hitBySensory) {
                const sensoryAnchor = getMemorySensoryAnchor(memory) || '某个感觉';
                return `${timeLead}${sourceLead}（${sensoryAnchor}一下子把你带回了“${title}”这件事：${summary || '你想起了一段相关经历。'}）${anchorTail}${detailTail}`;
            }
            if (memory._hitByKeyword) {
                const keyword = getMemoryRecallKeyword(memory) || '某个词';
                return `${timeLead}${sourceLead}（"${keyword}"这个词一下子勾起了“${title}”这件事：${summary || '你想起了一段相关经历。'}）${anchorTail}${detailTail}`;
            }

            let output = `${timeLead}${sourceLead}[记忆事件]${title}：${summary || '你想起了一段相关经历。'}（${depthLabel}${unresolved ? '，这件事还没完全放下' : ''}${signalHint ? `，${signalHint}` : ''}）`;
            if (anchorLine) {
                output = `${output} [锚点] ${anchorLine}`;
            }
            if (extraLines.length > 0) {
                output = `${output} [细节] ${extraLines.join(' / ')}`;
            }
            return output;
        }

        const content = toTrimmedString(memory.content);
        if (!content) return '';

        const sensorySnapshot = toTrimmedString(metadata.sensory_snapshot || metadata.sensorySnapshot);
        const isIntrusive = !!memory._isIntrusive;
        const isSensoryHit = !!memory._hitBySensory;
        const isKeywordHit = !!memory._hitByKeyword;
        let formatType = 'normal';
        let output = '';

        if (isIntrusive) {
            formatType = 'intrusive';
            output = `${timeLead}${sourceLead}（突然闪过一个画面：${content}）`;
        } else if (isSensoryHit) {
            formatType = 'sensory';
            const anchor = getMemorySensoryAnchor(memory) || '某个感觉';
            output = `${timeLead}${sourceLead}（${anchor}让你想起了——${content}）`;
        } else if (isKeywordHit) {
            formatType = 'keyword';
            const keyword = getMemoryRecallKeyword(memory) || '某个词';
            output = `${timeLead}${sourceLead}（"${keyword}"这个词一下子让你想起了——${content}）`;
        } else {
            const valence = toFiniteNumber(memory.valence, 0);
            const arousal = toFiniteNumber(memory.arousal, 0);
            let emotionalHint = '（你隐约记得这件事）';

            if (valence < -0.5 && arousal > 0.6) {
                emotionalHint = '（这件事至今让你感到强烈的痛苦或愤怒）';
            } else if (valence < -0.5 && arousal <= 0.6) {
                emotionalHint = '（这件事让你隐隐不舒服，但已经没那么激动了）';
            } else if (valence > 0.5 && arousal > 0.6) {
                emotionalHint = '（想起这件事你现在还是很激动很开心）';
            } else if (valence > 0.5 && arousal <= 0.6) {
                emotionalHint = '（这是一段温暖的回忆）';
            } else if (valence >= -0.5 && valence <= 0.5 && arousal > 0.6) {
                emotionalHint = '（这件事让你心情复杂，难以平静）';
            }

            output = `${timeLead}${sourceLead}${content}${emotionalHint}`;
        }

        if (sensorySnapshot) {
            output = `${output}（现在想起来，那个画面还是很清晰——${sensorySnapshot}）`;
        }

        console.log(
            `[海马体][格式化] 记忆ID=${toTrimmedString(memory.memory_id || memory.id) || 'unknown'} -> 类型=${formatType}, 附带感官快照=${sensorySnapshot ? 'true' : 'false'}`
        );
        return output;
    }

    /**
     * 调用用户配置的 Embedding API，将文本转成 1536 维向量。
     */
    async function callEmbeddingAPI(text) {
        if (!isEnabled()) return null;

        const fetchImpl = getFetchImplementation();
        if (!fetchImpl || !hasEmbeddingConfig()) return null;

        const cleanText = toTrimmedString(text);
        if (!cleanText) return null;
        console.log(`[海马体][向量] 开始请求 Embedding，文本长度=${cleanText.length}，模型=${state.settings.embeddingModel || '未填写'}。`);

        const headers = Object.assign(
            {
                'Content-Type': 'application/json'
            },
            state.settings.embeddingHeaders && typeof state.settings.embeddingHeaders === 'object'
                ? state.settings.embeddingHeaders
                : {}
        );

        if (state.settings.embeddingApiKey && !headers.Authorization && !headers.authorization) {
            headers.Authorization = `Bearer ${state.settings.embeddingApiKey}`;
        }

        const requestBody = buildEmbeddingRequestBody(cleanText);

        try {
            const response = await fetchImpl(state.settings.embeddingApiUrl, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                let errorDetail = '';
                try {
                    const rawErrorText = await response.text();
                    let parsedError = rawErrorText;
                    try {
                        parsedError = JSON.parse(rawErrorText);
                    } catch (_) {
                        parsedError = rawErrorText;
                    }
                    errorDetail = extractEmbeddingErrorDetail(parsedError);
                } catch (_) {
                    errorDetail = '';
                }
                throw new Error(errorDetail ? `HTTP ${response.status}: ${errorDetail}` : `HTTP ${response.status}`);
            }
            console.log(`[海马体][向量] Embedding 接口返回 HTTP ${response.status}。`);

            const payload = await response.json();
            const vector = extractEmbeddingVector(payload);
            if (!vector) {
                throw new Error('Embedding 响应缺少可用向量');
            }

            console.log(`[海马体][向量] Embedding 解析成功，维度=${vector.length}。`);

            return vector;
        } catch (error) {
            console.warn('[海马体] Embedding API 调用失败，已自动降级:', error && error.message ? error.message : error);
            return null;
        }
    }

    /**
     * 判断当前数据库错误是否属于 dedupe_key 唯一索引命中的重复写入。
     */
    function isDuplicateMemoryInsertError(error) {
        const code = toTrimmedString(error && error.code);
        const message = toTrimmedString(error && error.message).toLowerCase();
        return code === '23505'
            || message.includes('duplicate key value')
            || message.includes('idx_hippo_dedupe_unique');
    }

    /**
     * 重新定义记忆写入流程，让 dedupe_key 命中时优雅跳过而不是把重复事件当成失败。
     */
    async function writeMemory(userId, charId, memoryData, roomId) {
        if (!isEnabled()) return null;

        const supabase = getSupabaseClient();
        if (!supabase) return null;

        const cleanUserId = toTrimmedString(userId);
        const cleanCharId = toTrimmedString(charId);
        const cleanRoomId = toTrimmedString(roomId || (memoryData && (memoryData.room_id || memoryData.roomId)) || '') || null;
        const payloadSource = memoryData && typeof memoryData === 'object' ? memoryData : {};
        const content = toTrimmedString(payloadSource.content || payloadSource.memory_content || payloadSource.text);
        const dedupeKey = toTrimmedString(payloadSource.dedupe_key || payloadSource.dedupeKey) || null;
        const valence = clampNumber(payloadSource.valence, -1, 1, 0);
        const arousal = clampNumber(payloadSource.arousal, 0, 1, 0);
        const importance = clampNumber(payloadSource.importance, 1, 10, 5);
        const rawLayer = toTrimmedString(payloadSource.memory_layer || payloadSource.memoryLayer).toLowerCase();
        const memoryLayer = ['buffer', 'core', 'cortex', 'shadow', 'wish'].includes(rawLayer) ? rawLayer : 'buffer';
        const isFlashbulb = toBoolean(payloadSource.is_flashbulb || payloadSource.isFlashbulb) || arousal >= 0.9;
        console.log(`[海马体][写入] 准备写入记忆，角色=${cleanCharId}，内容长度=${content.length}。`);
        if (isV2Enabled()) {
            console.log(`[海马体][写入] 层级判定：memory_layer=${memoryLayer}, is_flashbulb=${isFlashbulb}`);
        }

        if (!cleanUserId || !cleanCharId || !content) return null;
        if (isWriteRateLimited(cleanUserId, cleanCharId)) {
            console.log('[海马体][写入] 命中 10 分钟 2 条限流，本次跳过。');
            return {
                skipped: true,
                reason: 'rate_limited'
            };
        }

        const contextScope = resolveContextScope(payloadSource, cleanRoomId);
        if (!contextScope) {
            console.warn('[海马体] room 作用域写入缺少 room_id，已跳过。');
            return null;
        }

        const finalRoomId = contextScope === 'room' ? cleanRoomId : null;
        const embeddingPromise = hasEmbeddingConfig() ? callEmbeddingAPI(content) : Promise.resolve(null);

        const insertPayload = {
            user_id: cleanUserId,
            char_id: cleanCharId,
            room_id: finalRoomId,
            context_scope: contextScope,
            content: content,
            valence: valence,
            arousal: arousal,
            importance: importance,
            activation_count: Math.max(1, toFiniteNumber(payloadSource.activation_count, 1)),
            resolved: !!payloadSource.resolved,
            dedupe_key: dedupeKey,
            source_type: toTrimmedString(payloadSource.source_type || payloadSource.sourceType) || 'chat_turn',
            source_ref: toTrimmedString(payloadSource.source_ref || payloadSource.sourceRef) || null,
            metadata: buildMemoryMetadata(payloadSource, content),
            memory_layer: memoryLayer,
            is_flashbulb: isFlashbulb
        };

        try {
            const { data, error } = await supabase
                .from('hippocampus_memories')
                .insert([insertPayload])
                .select('id,user_id,char_id,room_id,context_scope,content,valence,arousal,importance,activation_count,resolved,memory_layer,is_flashbulb,metadata,created_at,last_active_at,last_injected_at')
                .single();

            if (error) throw error;

            recordWriteTimestamp(cleanUserId, cleanCharId);
            console.log(`[海马体][写入] 记忆写入成功，id=${data && data.id ? data.id : 'unknown'}。`);

            const inserted = normalizeMemoryRow(data);
            if (inserted && inserted.memory_id) {
                void embeddingPromise.then(function handleEmbedding(vector) {
                    if (!vector) {
                        console.log('[海马体][向量] 写入后向量回写跳过：未拿到可用向量。');
                        return null;
                    }
                    console.log(`[海马体][向量] 写入后开始回写 embedding，memory_id=${inserted.memory_id}。`);
                    return updateMemoryEmbedding(inserted.memory_id, cleanUserId, vector);
                });
            }

            if (isV2Enabled()) {
                try {
                    const promoteResult = await supabase.rpc('promote_buffer_memories', {
                        p_user_id: cleanUserId,
                        p_char_id: cleanCharId
                    });
                    if (promoteResult && promoteResult.error) {
                        throw promoteResult.error;
                    }
                    const promoteRow = Array.isArray(promoteResult && promoteResult.data) && promoteResult.data[0]
                        ? promoteResult.data[0]
                        : {};
                    console.log(`[海马体][写入] 晋升检查：晋升${toFiniteNumber(promoteRow.promoted_count, 0)}条，坠入${toFiniteNumber(promoteRow.shadowed_count, 0)}条。`);
                } catch (promoteError) {
                    console.warn('[海马体][写入] 晋升检查失败，已跳过:', promoteError && promoteError.message ? promoteError.message : promoteError);
                }
            }

            return inserted;
        } catch (error) {
            if (insertPayload.dedupe_key && isDuplicateMemoryInsertError(error)) {
                console.log(`[海马体][写入] 命中 dedupe_key 去重，已跳过重复事件：${insertPayload.dedupe_key}`);
                return {
                    skipped: true,
                    reason: 'duplicate',
                    dedupe_key: insertPayload.dedupe_key
                };
            }

            console.warn('[海马体] 写入记忆失败，已静默跳过:', error && error.message ? error.message : error);
            return null;
        }
    }

    const publicApi = {
        initHippocampus: initHippocampus,
        getSurfaceMemories: getSurfaceMemories,
        getRecentMemories: getRecentMemories,
        getRecentEventCandidates: fetchRecentDirectEventCandidates,
        getSearchEventCandidates: fetchSearchDirectEventCandidates,
        searchMemories: searchMemories,
        diffuseActivation: diffuseActivation,
        writeMemory: writeMemory,
        activateMemories: activateMemories,
        activateWithReconsolidation: activateWithReconsolidation,
        resolveMemories: resolveMemories,
        formatMemoryForPrompt: formatMemoryForPrompt,
        callEmbeddingAPI: callEmbeddingAPI,
        __debug: {
            isRetiredEventRecord: isRetiredEventRecord,
            isMissingEventRippleRpcError: isMissingEventRippleRpcError,
            extractSearchDirectEventRpcScore: extractSearchDirectEventRpcScore,
            decorateSearchDirectEventRpcRow: decorateSearchDirectEventRpcRow,
            fetchSearchDirectEventRowsViaRpc: fetchSearchDirectEventRowsViaRpc,
            scoreSearchDirectEventCandidate: scoreSearchDirectEventCandidate,
            buildMemorySearchQueryProfile: buildMemorySearchQueryProfile,
            computeMemorySearchContextAdjustment: computeMemorySearchContextAdjustment,
            getEventSignalProfileSnapshot: getEventSignalProfileSnapshot,
            deriveEventPriorityProfile: deriveEventPriorityProfile,
            deriveEventRecallCooldownMs: deriveEventRecallCooldownMs,
            deriveReconsolidationContextProfile: deriveReconsolidationContextProfile,
            deriveReconsolidationBatchPlan: deriveReconsolidationBatchPlan,
            sortEventFragmentsForRecord: sortEventFragmentsForRecord,
            collectEventFragmentReferenceIds: collectEventFragmentReferenceIds,
            sortEventDetailMemoriesByPriority: sortEventDetailMemoriesByPriority,
            compactEventDetailsByBudget: compactEventDetailsByBudget,
            compressMixedRecallCandidatesByTokenBudget: compressMixedRecallCandidatesByTokenBudget,
            resolveEventHydrationExpansion: resolveEventHydrationExpansion,
            buildEventCandidateFromFragments: buildEventCandidateFromFragments,
            normalizeRippleActivationRpcResult: normalizeRippleActivationRpcResult,
            runRippleActivation: runRippleActivation
        }
    };

    return publicApi;
}
