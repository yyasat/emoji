/**
 * 初始化海马体认知消化模块导出壳子。
 * 兼容浏览器全局和 CommonJS 两种加载方式。
 */
(function initHippocampusDigestModule(root) {
    const api = createHippocampusDigest(root);

    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }

    if (root && typeof root === 'object') {
        root.HippocampusDigest = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this));

/**
 * 创建海马体认知消化模块。
 * 负责触发判定、候选拉取、LLM 判定和层级迁移执行。
 */
function createHippocampusDigest(root) {
    const DIGEST_INTERVAL_MS = 24 * 60 * 60 * 1000;
    const DIGEST_MESSAGE_THRESHOLD = 100;
    const VALID_LAYERS = new Set(['buffer', 'core', 'cortex', 'shadow', 'wish']);
    const EVENT_STATUS_VALUES = new Set(['open', 'closed']);
    const EVENT_DEPTH_VALUES = new Set(['low', 'medium', 'high']);
    const MANUAL_EVENT_GUARD_FIELDS = ['title', 'summary', 'status', 'depth', 'unresolved', 'continuation', 'salience', 'depth_score'];
    const DIGEST_EVENT_CARRY_FORWARD_PRESERVE_ALL_THRESHOLD = 12;
    const DIGEST_EVENT_CARRY_FORWARD_PRESERVED_LIMIT = 24;
    const DIGEST_EVENT_CARRY_FORWARD_EXTRA_MEMBER_LIMIT = 4;
    const DIGEST_STABILITY_LARGE_EVENT_THRESHOLD = 12;
    const DIGEST_STABILITY_WIDE_SPAN_HOURS = 72;
    const DIGEST_STABILITY_ATTENTION_RISK_MIN = 3;
    const DIGEST_STABILITY_HIGH_RISK_MIN = 6;
    const DIGEST_RECENT_OUTCOME_HOURS = 18;
    const DIGEST_RECENT_REPEAT_RATIO = 0.72;
    const DIGEST_EVENT_MEMBER_COHERENCE_MIN = 0.26;
    const DIGEST_EVENT_MEMBER_COHERENCE_CARRY_MIN = 0.34;
    const console = createHippoScopedConsole(root, '消化');

    /**
     * 创建模块级日志代理：优先走 HippocampusLogger，缺失时回退原生 console。
     */
    function createHippoScopedConsole(rootObject, moduleName) {
        const logger = rootObject && rootObject.HippocampusLogger ? rootObject.HippocampusLogger : null;
        const nativeConsole = (rootObject && rootObject.console) ? rootObject.console : globalThis.console;

        /**
         * 将日志参数拼成可读文本。
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

    /**
     * 将任意值转换成去首尾空白字符串。
     */
    function toTrimmedString(value) {
        return String(value === undefined || value === null ? '' : value).trim();
    }

    /**
     * 将任意值转换为有限数字，不合法时回退默认值。
     */
    function toFiniteNumber(value, fallback) {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : fallback;
    }

    /**
     * 将数值裁剪到区间内，避免写入非法配置。
     */
    function clampNumber(value, min, max, fallback) {
        const numeric = toFiniteNumber(value, fallback);
        return Math.min(max, Math.max(min, numeric));
    }

    /**
     * 将任意输入规范为布尔值。
     */
    function toBoolean(value) {
        if (typeof value === 'boolean') return value;
        if (typeof value === 'number') return value !== 0;
        const normalized = toTrimmedString(value).toLowerCase();
        if (!normalized) return false;
        return normalized === 'true'
            || normalized === '1'
            || normalized === 'yes'
            || normalized === 'open'
            || normalized === 'unresolved';
    }

    /**
     * 将 metadata 规范化为可写对象。
     */
    function normalizeMetadata(value) {
        return value && typeof value === 'object' && !Array.isArray(value)
            ? Object.assign({}, value)
            : {};
    }

    /**
     * 从对象中按顺序读取第一个已定义且非空的字段。
     */
    function readFirstDefined(source, keys, fallback) {
        if (!source || typeof source !== 'object') return fallback;

        const safeKeys = Array.isArray(keys) ? keys : [];
        for (let index = 0; index < safeKeys.length; index += 1) {
            const key = safeKeys[index];
            const value = source[key];
            if (value !== undefined && value !== null && value !== '') {
                return value;
            }
        }

        return fallback;
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
     * 向 metadata 里追加一条有限长度的版本历史记录，保留最近几次关键变化。
     */
    function appendBoundedMetadataHistory(metadata, historyKey, entry, maxEntries) {
        const safeMetadata = normalizeMetadata(metadata);
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

    function appendMetadataHistoryEntry(metadata, historyKey, entry, maxEntries) {
        const safeMetadata = appendBoundedMetadataHistory(metadata, historyKey, entry, maxEntries);
        const safeEntry = entry && typeof entry === 'object' ? Object.assign({}, entry) : null;
        if (!safeEntry) return safeMetadata;

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

    /**
     * 合并多个 ID 列表并去重，保留出现顺序。
     */
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

    function deriveDigestEventCarryForwardState(existingRecord, options) {
        const existing = existingRecord && typeof existingRecord === 'object' ? existingRecord : null;
        const optionsSource = options && typeof options === 'object' ? options : {};
        const safeMaxCount = Math.max(1, Math.floor(toFiniteNumber(optionsSource.maxCount, 96)));
        const preserveAllThreshold = Math.min(safeMaxCount, DIGEST_EVENT_CARRY_FORWARD_PRESERVE_ALL_THRESHOLD);
        const preservedCap = Math.min(safeMaxCount, DIGEST_EVENT_CARRY_FORWARD_PRESERVED_LIMIT);
        const existingMemberIds = mergeUniqueIds(
            Array.isArray(optionsSource.existingMemberIds)
                ? optionsSource.existingMemberIds
                : (existing ? existing.memory_ids : []),
            [],
            safeMaxCount
        );
        const detailMemoryIds = mergeUniqueIds(
            Array.isArray(optionsSource.detailMemoryIds)
                ? optionsSource.detailMemoryIds
                : (existing ? existing.detail_memory_ids : []),
            [],
            24
        );
        const flashbulbMemoryIds = mergeUniqueIds(
            Array.isArray(optionsSource.flashbulbMemoryIds)
                ? optionsSource.flashbulbMemoryIds
                : (existing ? existing.event_flashbulb_memory_ids : []),
            [],
            24
        );
        const anchorMemoryId = toTrimmedString(
            optionsSource.anchorMemoryId !== undefined
                ? optionsSource.anchorMemoryId
                : (existing && existing.anchor_memory_id)
        ) || null;
        const manualEdited = !!(existing && existing.manual_edited);

        const emptyState = {
            manualEdited: manualEdited,
            trimmed: false,
            reason: existing ? 'empty_existing_event' : 'no_existing_event',
            anchorMemoryId: anchorMemoryId,
            existingMemberIds: existingMemberIds,
            preservedMemberIds: [],
            structuralMemberIds: [],
            carriedExtraMemberIds: [],
            detailMemoryIds: detailMemoryIds,
            flashbulbMemoryIds: flashbulbMemoryIds,
            existingMemberCount: existingMemberIds.length,
            preservedMemberCount: 0,
            structuralMemberCount: 0,
            entry: null
        };
        if (existingMemberIds.length <= 0) {
            return emptyState;
        }

        if (manualEdited || existingMemberIds.length <= preserveAllThreshold) {
            const preservedMemberIds = existingMemberIds.slice(0, safeMaxCount);
            return {
                manualEdited: manualEdited,
                trimmed: false,
                reason: manualEdited ? 'manual_edited' : 'small_existing_event',
                anchorMemoryId: anchorMemoryId || preservedMemberIds[0] || null,
                existingMemberIds: existingMemberIds,
                preservedMemberIds: preservedMemberIds,
                structuralMemberIds: [],
                carriedExtraMemberIds: [],
                detailMemoryIds: detailMemoryIds,
                flashbulbMemoryIds: flashbulbMemoryIds,
                existingMemberCount: existingMemberIds.length,
                preservedMemberCount: preservedMemberIds.length,
                structuralMemberCount: 0,
                entry: null
            };
        }

        const structuralMemberIds = mergeUniqueIds(
            mergeUniqueIds(anchorMemoryId ? [anchorMemoryId] : [], detailMemoryIds, preservedCap),
            flashbulbMemoryIds,
            preservedCap
        );
        const minimumExtraLimit = structuralMemberIds.length > 0 ? 0 : Math.min(12, preservedCap);
        const extraLimit = Math.max(
            minimumExtraLimit,
            Math.min(
                DIGEST_EVENT_CARRY_FORWARD_EXTRA_MEMBER_LIMIT,
                Math.max(0, preservedCap - structuralMemberIds.length)
            )
        );
        const seenStructuralIds = new Set(structuralMemberIds);
        const carriedExtraMemberIds = existingMemberIds.filter(function keepExtra(id) {
            return !seenStructuralIds.has(id);
        }).slice(0, extraLimit);
        const preservedMemberIds = mergeUniqueIds(
            structuralMemberIds,
            carriedExtraMemberIds,
            preservedCap
        );
        const trimmed = preservedMemberIds.length < existingMemberIds.length;

        return {
            manualEdited: manualEdited,
            trimmed: trimmed,
            reason: trimmed ? 'oversized_existing_event' : 'bounded_existing_event',
            anchorMemoryId: anchorMemoryId || preservedMemberIds[0] || null,
            existingMemberIds: existingMemberIds,
            preservedMemberIds: preservedMemberIds,
            structuralMemberIds: structuralMemberIds,
            carriedExtraMemberIds: carriedExtraMemberIds,
            detailMemoryIds: detailMemoryIds,
            flashbulbMemoryIds: flashbulbMemoryIds,
            existingMemberCount: existingMemberIds.length,
            preservedMemberCount: preservedMemberIds.length,
            structuralMemberCount: structuralMemberIds.length,
            entry: trimmed ? {
                changed_at: new Date().toISOString(),
                source: 'digest_event_plan',
                trimmed: true,
                reason: 'oversized_existing_event',
                previous_member_count: existingMemberIds.length,
                preserved_member_count: preservedMemberIds.length,
                structural_member_count: structuralMemberIds.length,
                carried_extra_member_count: carriedExtraMemberIds.length,
                preserved_anchor_memory_id: anchorMemoryId || null,
                preserved_detail_count: detailMemoryIds.length,
                preserved_flashbulb_count: flashbulbMemoryIds.length
            } : null
        };
    }

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
            : (typeof value === 'string' && value.trim() ? value.split(/[,\n，、\s]+/) : []);
        const result = [];
        const seen = new Set();

        for (let i = 0; i < rawList.length; i += 1) {
            const alias = toTrimmedString(rawList[i]).replace(/^[\s"'“”‘’「」『』（）()]+|[\s"'“”‘’「」『』（）()]+$/g, '');
            if (!alias || seen.has(alias)) continue;
            if (alias.length > 24) continue;
            if (!/[A-Za-z0-9\u4e00-\u9fa5]/.test(alias)) continue;
            seen.add(alias);
            result.push(alias);
            if (result.length >= limit) break;
        }

        return result;
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

    function collectEventSourceEvidenceMetadata(memberRows, fallbackMetadata) {
        const safeRows = Array.isArray(memberRows) ? memberRows : [];
        const safeFallbackMetadata = normalizeMetadata(fallbackMetadata);
        function readEvidenceTermList(source, keys) {
            const value = source && typeof source === 'object'
                ? readFirstDefined(source, keys, [])
                : [];
            return Array.isArray(value) ? value : [];
        }
        let sourceMessageIds = normalizeEvidenceMessageIds(safeFallbackMetadata.source_message_ids, 24);
        let sourceTimeStart = mergeEvidenceTimeBoundary('', safeFallbackMetadata.source_time_start, 'min');
        let sourceTimeEnd = mergeEvidenceTimeBoundary('', safeFallbackMetadata.source_time_end, 'max');
        const aliasSeed = []
            .concat(Array.isArray(safeFallbackMetadata.surface_aliases) ? safeFallbackMetadata.surface_aliases : [])
            .concat(Array.isArray(safeFallbackMetadata.trigger_keywords) ? safeFallbackMetadata.trigger_keywords : []);
        const contextFocusSeed = []
            .concat(readEvidenceTermList(safeFallbackMetadata, ['context_focus_terms', 'contextFocusTerms']));
        const contextScopeSeed = []
            .concat(readEvidenceTermList(safeFallbackMetadata, ['context_scope_terms', 'contextScopeTerms']));
        const contextSupportSeed = []
            .concat(readEvidenceTermList(safeFallbackMetadata, ['context_support_terms', 'contextSupportTerms']));

        safeRows.forEach(function collectFromMember(row) {
            if (!row || typeof row !== 'object') return;
            const rowMetadata = normalizeMetadata(row.metadata);
            sourceMessageIds = mergeUniqueIds(
                sourceMessageIds,
                normalizeEvidenceMessageIds(
                    row.source_message_ids !== undefined
                        ? row.source_message_ids
                        : rowMetadata.source_message_ids,
                    24
                ),
                24
            );
            aliasSeed.push.apply(aliasSeed,
                []
                    .concat(Array.isArray(row.surface_aliases) ? row.surface_aliases : (Array.isArray(rowMetadata.surface_aliases) ? rowMetadata.surface_aliases : []))
                    .concat(Array.isArray(row.trigger_keywords) ? row.trigger_keywords : (Array.isArray(rowMetadata.trigger_keywords) ? rowMetadata.trigger_keywords : []))
            );
            sourceTimeStart = mergeEvidenceTimeBoundary(
                sourceTimeStart,
                row.source_time_start || rowMetadata.source_time_start || '',
                'min'
            );
            sourceTimeEnd = mergeEvidenceTimeBoundary(
                sourceTimeEnd,
                row.source_time_end || rowMetadata.source_time_end || '',
                'max'
            );
            contextFocusSeed.push.apply(contextFocusSeed,
                []
                    .concat(readEvidenceTermList(row, ['context_focus_terms', 'contextFocusTerms']))
                    .concat(readEvidenceTermList(rowMetadata, ['context_focus_terms', 'contextFocusTerms']))
            );
            contextScopeSeed.push.apply(contextScopeSeed,
                []
                    .concat(readEvidenceTermList(row, ['context_scope_terms', 'contextScopeTerms']))
                    .concat(readEvidenceTermList(rowMetadata, ['context_scope_terms', 'contextScopeTerms']))
            );
            contextSupportSeed.push.apply(contextSupportSeed,
                []
                    .concat(readEvidenceTermList(row, ['context_support_terms', 'contextSupportTerms']))
                    .concat(readEvidenceTermList(rowMetadata, ['context_support_terms', 'contextSupportTerms']))
            );
        });

        return {
            source_message_ids: sourceMessageIds,
            source_time_start: sourceTimeStart,
            source_time_end: sourceTimeEnd,
            surface_aliases: normalizeEvidenceAliases(aliasSeed, 12),
            context_focus_terms: normalizeEvidenceAliases(contextFocusSeed, 6),
            context_scope_terms: normalizeEvidenceAliases(contextScopeSeed, 12),
            context_support_terms: normalizeEvidenceAliases(contextSupportSeed, 8)
        };
    }

    function collectDigestStabilityTextTerms(text, limit) {
        const safeLimit = Math.max(1, Math.floor(toFiniteNumber(limit, 4)));
        const source = toTrimmedString(text).replace(/\s+/g, ' ').trim();
        if (!source) return [];

        const seeds = [];
        const pieces = source
            .split(/[\s,，。！？!?、/|;；:：“”"'‘’()\[\]{}<>《》\-]+/)
            .map(toTrimmedString)
            .filter(Boolean);
        if (pieces.length > 0) {
            pieces.slice(0, safeLimit).forEach(function pushPiece(piece) {
                if (piece.length > 18) {
                    seeds.push(piece.slice(0, 18));
                    return;
                }
                seeds.push(piece);
            });
        } else {
            seeds.push(source.length > 18 ? source.slice(0, 18) : source);
        }

        return normalizeEvidenceAliases(seeds, safeLimit);
    }

    function computeDigestAliasOverlapStats(leftValues, rightValues) {
        const left = normalizeEvidenceAliases(leftValues, 24);
        const right = normalizeEvidenceAliases(rightValues, 24);
        if (left.length === 0 || right.length === 0) {
            return {
                count: 0,
                leftRatio: 0,
                rightRatio: 0
            };
        }

        const rightSet = new Set(right);
        let overlap = 0;
        left.forEach(function countOverlap(item) {
            if (rightSet.has(item)) overlap += 1;
        });

        return {
            count: overlap,
            leftRatio: left.length > 0 ? (overlap / left.length) : 0,
            rightRatio: right.length > 0 ? (overlap / right.length) : 0
        };
    }

    function computeDigestTimeWindowStats(leftStart, leftEnd, rightStart, rightEnd) {
        const rawLeftStart = Date.parse(toTrimmedString(leftStart));
        const rawLeftEnd = Date.parse(toTrimmedString(leftEnd));
        const rawRightStart = Date.parse(toTrimmedString(rightStart));
        const rawRightEnd = Date.parse(toTrimmedString(rightEnd));
        const leftRangeStart = Number.isFinite(rawLeftStart) ? rawLeftStart : rawLeftEnd;
        const leftRangeEnd = Number.isFinite(rawLeftEnd) ? rawLeftEnd : rawLeftStart;
        const rightRangeStart = Number.isFinite(rawRightStart) ? rawRightStart : rawRightEnd;
        const rightRangeEnd = Number.isFinite(rawRightEnd) ? rawRightEnd : rawRightStart;
        if (
            !Number.isFinite(leftRangeStart)
            || !Number.isFinite(leftRangeEnd)
            || !Number.isFinite(rightRangeStart)
            || !Number.isFinite(rightRangeEnd)
        ) {
            return {
                overlapHours: 0,
                distanceHours: Number.POSITIVE_INFINITY,
                sameDay: false
            };
        }

        const overlapMs = Math.min(leftRangeEnd, rightRangeEnd) - Math.max(leftRangeStart, rightRangeStart);
        const distanceMs = overlapMs >= 0
            ? 0
            : Math.max(rightRangeStart - leftRangeEnd, leftRangeStart - rightRangeEnd, 0);
        const sameDay = new Date(leftRangeEnd).toISOString().slice(0, 10) === new Date(rightRangeEnd).toISOString().slice(0, 10);
        return {
            overlapHours: overlapMs > 0 ? (overlapMs / (60 * 60 * 1000)) : 0,
            distanceHours: distanceMs / (60 * 60 * 1000),
            sameDay: sameDay
        };
    }

    function buildDigestEventStabilityProfile(memberRows, existingRecord, options) {
        const safeRows = Array.isArray(memberRows) ? memberRows.filter(Boolean) : [];
        const safeExistingRecord = existingRecord && typeof existingRecord === 'object' ? existingRecord : null;
        const safeOptions = options && typeof options === 'object' ? options : {};
        const existingMetadata = normalizeMetadata(safeExistingRecord && safeExistingRecord.metadata);
        const sourceEvidence = safeOptions.sourceEvidence && typeof safeOptions.sourceEvidence === 'object'
            ? safeOptions.sourceEvidence
            : collectEventSourceEvidenceMetadata(safeRows, existingMetadata);
        const mergedSourceEvidence = {
            source_message_ids: normalizeEvidenceMessageIds(
                []
                    .concat(Array.isArray(sourceEvidence.source_message_ids) ? sourceEvidence.source_message_ids : [])
                    .concat(Array.isArray(safeExistingRecord && safeExistingRecord.event_stability_source_message_ids) ? safeExistingRecord.event_stability_source_message_ids : [])
                    .concat(Array.isArray(existingMetadata.event_stability_source_message_ids) ? existingMetadata.event_stability_source_message_ids : []),
                24
            ),
            source_time_start: mergeEvidenceTimeBoundary(
                sourceEvidence.source_time_start || '',
                (safeExistingRecord && safeExistingRecord.event_stability_time_start) || existingMetadata.event_stability_time_start || '',
                'min'
            ),
            source_time_end: mergeEvidenceTimeBoundary(
                sourceEvidence.source_time_end || '',
                (safeExistingRecord && safeExistingRecord.event_stability_time_end) || existingMetadata.event_stability_time_end || '',
                'max'
            ),
            surface_aliases: normalizeEvidenceAliases(
                []
                    .concat(Array.isArray(sourceEvidence.surface_aliases) ? sourceEvidence.surface_aliases : [])
                    .concat(Array.isArray(safeExistingRecord && safeExistingRecord.event_stability_terms) ? safeExistingRecord.event_stability_terms : [])
                    .concat(Array.isArray(existingMetadata.event_stability_terms) ? existingMetadata.event_stability_terms : [])
                    .concat(Array.isArray(existingMetadata.surface_aliases) ? existingMetadata.surface_aliases : [])
                    .concat(Array.isArray(existingMetadata.trigger_keywords) ? existingMetadata.trigger_keywords : []),
                12
            )
        };

        const aliasSeed = []
            .concat(Array.isArray(mergedSourceEvidence.surface_aliases) ? mergedSourceEvidence.surface_aliases : [])
            .concat(Array.isArray(safeExistingRecord && safeExistingRecord.event_stability_terms) ? safeExistingRecord.event_stability_terms : [])
            .concat(Array.isArray(existingMetadata.event_stability_terms) ? existingMetadata.event_stability_terms : [])
            .concat(Array.isArray(existingMetadata.surface_aliases) ? existingMetadata.surface_aliases : [])
            .concat(Array.isArray(existingMetadata.trigger_keywords) ? existingMetadata.trigger_keywords : []);

        const continuationKey = toTrimmedString(
            safeOptions.continuationKey
            || (safeExistingRecord && safeExistingRecord.continuation_key)
            || existingMetadata.continuation_key
            || existingMetadata.continuationKey
        );
        if (continuationKey) aliasSeed.push(continuationKey);

        collectDigestStabilityTextTerms(
            safeOptions.title || (safeExistingRecord && safeExistingRecord.title) || '',
            3
        ).forEach(function pushTitleTerm(item) {
            aliasSeed.push(item);
        });
        collectDigestStabilityTextTerms(
            safeOptions.summary || (safeExistingRecord && safeExistingRecord.summary) || '',
            3
        ).forEach(function pushSummaryTerm(item) {
            aliasSeed.push(item);
        });
        collectDigestStabilityTextTerms(
            safeOptions.anchorText || '',
            2
        ).forEach(function pushAnchorTerm(item) {
            aliasSeed.push(item);
        });

        safeRows.forEach(function collectRowTerms(row) {
            if (!row || typeof row !== 'object') return;
            const metadata = normalizeMetadata(row.metadata);
            aliasSeed.push.apply(aliasSeed,
                []
                    .concat(Array.isArray(row.surface_aliases) ? row.surface_aliases : [])
                    .concat(Array.isArray(metadata.surface_aliases) ? metadata.surface_aliases : [])
                    .concat(Array.isArray(row.trigger_keywords) ? row.trigger_keywords : [])
                    .concat(Array.isArray(metadata.trigger_keywords) ? metadata.trigger_keywords : [])
            );
            collectDigestStabilityTextTerms(row.content || row.summary || '', 2).forEach(function pushRowTerm(item) {
                aliasSeed.push(item);
            });
        });

        const terms = normalizeEvidenceAliases(aliasSeed, 12);
        const primaryTerm = toTrimmedString(
            safeOptions.primaryTerm
            || (safeExistingRecord && safeExistingRecord.event_stability_primary_term)
            || existingMetadata.event_stability_primary_term
            || existingMetadata.event_stability_primary_alias
            || continuationKey
            || terms[0]
            || collectDigestStabilityTextTerms(
                safeOptions.title || (safeExistingRecord && safeExistingRecord.title) || '',
                1
            )[0]
            || ''
        );
        const signature = normalizeContinuationLookupKey(
            safeOptions.signature
            || (safeExistingRecord && safeExistingRecord.event_stability_signature)
            || existingMetadata.event_stability_signature
            || continuationKey
            || primaryTerm
        );

        return {
            terms: terms,
            primaryTerm: primaryTerm || '',
            signature: signature || '',
            sourceMessageIds: normalizeEvidenceMessageIds(mergedSourceEvidence.source_message_ids, 24),
            sourceTimeStart: mergeEvidenceTimeBoundary(
                '',
                mergedSourceEvidence.source_time_start || existingMetadata.event_stability_time_start || '',
                'min'
            ),
            sourceTimeEnd: mergeEvidenceTimeBoundary(
                '',
                mergedSourceEvidence.source_time_end || existingMetadata.event_stability_time_end || '',
                'max'
            )
        };
    }

    function computeDigestStabilitySpanHours(startAt, endAt) {
        const start = Date.parse(toTrimmedString(startAt) || '');
        const end = Date.parse(toTrimmedString(endAt) || '');
        if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
        return Math.max(0, Math.abs(end - start) / (60 * 60 * 1000));
    }

    function deriveDigestStabilityTierFromRisk(riskScore) {
        const safeRisk = Math.max(0, toFiniteNumber(riskScore, 0));
        if (safeRisk >= DIGEST_STABILITY_HIGH_RISK_MIN) return 'high_risk';
        if (safeRisk >= DIGEST_STABILITY_ATTENTION_RISK_MIN) return 'attention';
        return 'stable';
    }

    function deriveDigestEventStabilityAssessment(stabilityProfile, memberRows, existingRecord, options) {
        const safeProfile = stabilityProfile && typeof stabilityProfile === 'object'
            ? stabilityProfile
            : buildDigestEventStabilityProfile(memberRows, existingRecord, options);
        const safeRows = Array.isArray(memberRows) ? memberRows.filter(Boolean) : [];
        const safeExistingRecord = existingRecord && typeof existingRecord === 'object' ? existingRecord : null;
        const safeOptions = options && typeof options === 'object' ? options : {};
        const aliasCount = Array.isArray(safeProfile.terms) ? safeProfile.terms.length : 0;
        const sourceMessageCount = Array.isArray(safeProfile.sourceMessageIds) ? safeProfile.sourceMessageIds.length : 0;
        const sourceSpanHours = computeDigestStabilitySpanHours(
            safeProfile.sourceTimeStart,
            safeProfile.sourceTimeEnd
        );
        const inferredMemberCount = Math.max(
            safeRows.length,
            Array.isArray(safeExistingRecord && safeExistingRecord.memory_ids)
                ? safeExistingRecord.memory_ids.length
                : 0,
            Array.isArray(safeExistingRecord && safeExistingRecord.detail_memory_ids)
                ? safeExistingRecord.detail_memory_ids.length
                : 0
        );
        const memberCount = Math.max(
            0,
            Math.floor(
                toFiniteNumber(
                    safeOptions.memberCount,
                    inferredMemberCount
                )
            )
        );
        const reasonTags = [];
        let riskScore = 0;

        if (!toTrimmedString(safeProfile.signature)) {
            reasonTags.push('missing_signature');
            riskScore += 3;
        }
        if (!toTrimmedString(safeProfile.primaryTerm)) {
            reasonTags.push('missing_primary_term');
            riskScore += 2;
        }
        if (sourceMessageCount <= 0) {
            reasonTags.push('missing_source_messages');
            riskScore += 3;
        } else if (sourceMessageCount === 1) {
            reasonTags.push('single_source_message');
            riskScore += 2;
        }
        if (aliasCount <= 0) {
            reasonTags.push('thin_alias_coverage');
            riskScore += 2;
        } else if (aliasCount === 1 && sourceMessageCount <= 1) {
            reasonTags.push('thin_alias_coverage');
            riskScore += 1;
        }
        if (memberCount >= DIGEST_STABILITY_LARGE_EVENT_THRESHOLD && sourceMessageCount <= 1) {
            reasonTags.push('member_overflow_with_thin_evidence');
            riskScore += 2;
        }
        if (sourceSpanHours >= DIGEST_STABILITY_WIDE_SPAN_HOURS && sourceMessageCount <= 1) {
            reasonTags.push('wide_time_span_with_thin_evidence');
            riskScore += 1;
        }

        return {
            tier: deriveDigestStabilityTierFromRisk(riskScore),
            riskScore: Math.max(0, Math.round(riskScore * 10) / 10),
            reasonTags: Array.from(new Set(reasonTags)).slice(0, 8),
            aliasCount: aliasCount,
            sourceMessageCount: sourceMessageCount,
            sourceSpanHours: Number.isFinite(sourceSpanHours) ? Number(sourceSpanHours.toFixed(1)) : 0,
            memberCount: memberCount
        };
    }

    /**
     * 读取记忆时间戳（优先 created_at）。
     */
    function getMemoryTimestamp(memory) {
        const source = memory && typeof memory === 'object' ? memory : {};
        const candidate = source.created_at || source.last_active_at || source.updated_at;
        const timestamp = Date.parse(candidate);
        return Number.isFinite(timestamp) ? timestamp : Number.NaN;
    }

    /**
     * 规范化真实事件表记录，供 digest 提示词与回写链路复用。
     */
    function normalizeExistingEventRecord(row) {
        const source = row && typeof row === 'object' ? row : {};
        const eventId = toTrimmedString(source.id || source.event_id);
        if (!eventId) return null;

        const metadata = normalizeMetadata(source.metadata);
        const memoryIds = (Array.isArray(source.memory_ids) ? source.memory_ids : [])
            .map(toTrimmedString)
            .filter(Boolean);
        const detailMemoryIds = mergeUniqueIds(
            Array.isArray(source.detail_memory_ids) ? source.detail_memory_ids : [],
            memoryIds,
            24
        );
        const eventFlashbulbMemoryIds = mergeUniqueIds(
            Array.isArray(source.event_flashbulb_memory_ids)
                ? source.event_flashbulb_memory_ids
                : (Array.isArray(metadata.event_flashbulb_memory_ids)
                    ? metadata.event_flashbulb_memory_ids
                    : []),
            [],
            24
        );
        const depth = normalizeEventDepth(source.depth);
        const status = normalizeEventStatus(source.status);
        const sourceEvidence = collectEventSourceEvidenceMetadata([], metadata);
        const stabilityProfile = buildDigestEventStabilityProfile([], {
            title: toTrimmedString(source.title),
            summary: toTrimmedString(source.summary),
            continuation_key: toTrimmedString(source.continuation_key),
            metadata: metadata
        }, {
            sourceEvidence: sourceEvidence,
            title: toTrimmedString(source.title),
            summary: toTrimmedString(source.summary),
            continuationKey: toTrimmedString(source.continuation_key),
            primaryTerm: toTrimmedString(
                metadata.event_stability_primary_term
                || metadata.event_stability_primary_alias
            ),
            signature: toTrimmedString(metadata.event_stability_signature)
        });
        const stabilityAssessment = deriveDigestEventStabilityAssessment(stabilityProfile, [], {
            memory_ids: memoryIds,
            detail_memory_ids: detailMemoryIds
        }, {
            memberCount: Math.max(
                detailMemoryIds.length,
                memoryIds.length,
                Math.floor(toFiniteNumber(source.fragment_count, memoryIds.length))
            )
        });
        const storedStabilityTier = toTrimmedString(
            source.event_stability_tier
            || metadata.event_stability_tier
            || metadata.eventStabilityTier
        ).toLowerCase();
        const rawStabilityReasonTags = source.event_stability_reason_tags !== undefined
            ? source.event_stability_reason_tags
            : (
                metadata.event_stability_reason_tags !== undefined
                    ? metadata.event_stability_reason_tags
                    : metadata.eventStabilityReasonTags
            );
        const storedStabilityReasonTags = Array.from(new Set(
            (Array.isArray(rawStabilityReasonTags)
                ? rawStabilityReasonTags
                : (typeof rawStabilityReasonTags === 'string' && rawStabilityReasonTags.trim()
                    ? rawStabilityReasonTags.split(/[,\s]+/)
                    : [])
            ).map(toTrimmedString).filter(Boolean)
        )).slice(0, 12);
        const storedStabilityRiskScoreRaw = toFiniteNumber(
            source.event_stability_risk_score !== undefined
                ? source.event_stability_risk_score
                : (
                    metadata.event_stability_risk_score !== undefined
                        ? metadata.event_stability_risk_score
                        : metadata.eventStabilityRiskScore
                ),
            Number.NaN
        );
        const resolvedStabilityTier = storedStabilityTier === 'high_risk'
            || storedStabilityTier === 'attention'
            || storedStabilityTier === 'stable'
            ? storedStabilityTier
            : stabilityAssessment.tier;
        const resolvedStabilityReasonTags = storedStabilityReasonTags.length > 0
            ? storedStabilityReasonTags
            : stabilityAssessment.reasonTags;
        const resolvedStabilityRiskScore = Number.isFinite(storedStabilityRiskScoreRaw)
            ? Math.max(0, Number(storedStabilityRiskScoreRaw.toFixed(1)))
            : stabilityAssessment.riskScore;

        return {
            id: eventId,
            event_id: eventId,
            user_id: toTrimmedString(source.user_id),
            char_id: toTrimmedString(source.char_id),
            room_id: toTrimmedString(source.room_id) || null,
            context_scope: toTrimmedString(source.context_scope) || (source.room_id ? 'room' : 'private'),
            title: toTrimmedString(source.title),
            summary: toTrimmedString(source.summary),
            status: status,
            depth: depth,
            event_date: toTrimmedString(source.event_date) || null,
            fragment_count: Math.max(0, Math.floor(toFiniteNumber(source.fragment_count, memoryIds.length))),
            is_unresolved: source.is_unresolved !== undefined
                ? toBoolean(source.is_unresolved)
                : status === 'open',
            continuation_key: toTrimmedString(source.continuation_key) || null,
            salience_score: clampNumber(source.salience_score, 0, 1, 0.4),
            depth_score: clampNumber(source.depth_score, 0, 1, mapEventDepthToScore(depth)),
            event_is_flashbulb: toBoolean(source.event_is_flashbulb || metadata.event_is_flashbulb || eventFlashbulbMemoryIds.length > 0),
            event_flashbulb_memory_ids: eventFlashbulbMemoryIds,
            anchor_memory_id: toTrimmedString(source.anchor_memory_id) || null,
            memory_ids: memoryIds,
            detail_memory_ids: detailMemoryIds,
            start_at: toTrimmedString(source.start_at) || null,
            end_at: toTrimmedString(source.end_at) || null,
            last_related_at: toTrimmedString(source.last_related_at) || null,
            manual_edited: !!source.manual_edited,
            manual_note: toTrimmedString(source.manual_note),
            metadata: metadata,
            updated_at: toTrimmedString(source.updated_at) || null,
            event_stability_terms: Array.isArray(stabilityProfile.terms) ? stabilityProfile.terms.slice(0, 12) : [],
            event_stability_primary_term: toTrimmedString(stabilityProfile.primaryTerm),
            event_stability_signature: toTrimmedString(stabilityProfile.signature),
            event_stability_time_start: toTrimmedString(stabilityProfile.sourceTimeStart) || null,
            event_stability_time_end: toTrimmedString(stabilityProfile.sourceTimeEnd) || null,
            event_stability_source_message_ids: Array.isArray(stabilityProfile.sourceMessageIds)
                ? stabilityProfile.sourceMessageIds.slice(0, 24)
                : [],
            event_stability_tier: resolvedStabilityTier,
            event_stability_reason_tags: resolvedStabilityReasonTags,
            event_stability_risk_score: resolvedStabilityRiskScore
        };
    }

    function getEventRecordTimestamp(record) {
        const source = record && typeof record === 'object' ? record : {};
        const candidate = source.last_related_at
            || source.updated_at
            || source.end_at
            || source.event_date
            || source.start_at;
        const timestamp = Date.parse(candidate);
        return Number.isFinite(timestamp) ? timestamp : Number.NaN;
    }

    function isDigestRetiredEventRecord(record) {
        const source = record && typeof record === 'object' ? record : {};
        const metadata = normalizeMetadata(source.metadata);
        if (toBoolean(readFirstDefined(metadata, ['digest_retired', 'digestRetired'], false))) {
            return true;
        }
        return !!toTrimmedString(readFirstDefined(metadata, ['digest_retired_at', 'digestRetiredAt'], ''));
    }

    function normalizeDigestEventMatchText(value) {
        return toTrimmedString(value)
            .toLowerCase()
            .replace(/[\s`~!@#$%^&*()_\-+=[\]{}\\|;:'",.<>/?，。、《》？；：‘’“”【】（）…·、]+/g, '');
    }

    function buildDigestTextTokenSet(value) {
        const normalized = normalizeDigestEventMatchText(value);
        const tokens = new Set();
        if (!normalized) return tokens;

        const unit = normalized.length <= 6 ? 1 : 2;
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

    function computeDigestTextSimilarity(left, right) {
        const leftTokens = buildDigestTextTokenSet(left);
        const rightTokens = buildDigestTextTokenSet(right);
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

    function computeDigestIdOverlapStats(leftIds, rightIds) {
        const leftList = Array.isArray(leftIds)
            ? leftIds.map(toTrimmedString).filter(Boolean)
            : [];
        const rightList = Array.isArray(rightIds)
            ? rightIds.map(toTrimmedString).filter(Boolean)
            : [];
        if (leftList.length === 0 || rightList.length === 0) {
            return {
                count: 0,
                leftRatio: 0,
                rightRatio: 0
            };
        }

        const rightSet = new Set(rightList);
        let overlap = 0;
        leftList.forEach(function countOverlap(id) {
            if (rightSet.has(id)) overlap += 1;
        });

        return {
            count: overlap,
            leftRatio: overlap / leftList.length,
            rightRatio: overlap / rightList.length
        };
    }

    function roundDigestSignalValue(value, digits) {
        if (!Number.isFinite(value)) return 0;
        const precision = Number.isFinite(digits) ? Math.max(0, Math.floor(digits)) : 4;
        return Number(value.toFixed(precision));
    }

    function getDigestEventMemberRows(memoryIds, candidateMap) {
        if (!(candidateMap instanceof Map)) return [];
        return (Array.isArray(memoryIds) ? memoryIds : [])
            .map(function mapMember(memoryId) {
                return candidateMap.get(toTrimmedString(memoryId)) || null;
            })
            .filter(Boolean);
    }

    function collectDigestEventCoherenceTerms(source, extraTexts, maxCount) {
        const safeSource = source && typeof source === 'object' ? source : {};
        const metadata = normalizeMetadata(safeSource.metadata);
        const seeds = []
            .concat(Array.isArray(safeSource.surface_aliases) ? safeSource.surface_aliases : [])
            .concat(Array.isArray(safeSource.trigger_keywords) ? safeSource.trigger_keywords : [])
            .concat(Array.isArray(metadata.surface_aliases) ? metadata.surface_aliases : [])
            .concat(Array.isArray(metadata.trigger_keywords) ? metadata.trigger_keywords : [])
            .concat(Array.isArray(readFirstDefined(metadata, ['context_focus_terms', 'contextFocusTerms'], []))
                ? readFirstDefined(metadata, ['context_focus_terms', 'contextFocusTerms'], [])
                : [])
            .concat(Array.isArray(readFirstDefined(metadata, ['context_scope_terms', 'contextScopeTerms'], []))
                ? readFirstDefined(metadata, ['context_scope_terms', 'contextScopeTerms'], [])
                : [])
            .concat(Array.isArray(readFirstDefined(metadata, ['context_support_terms', 'contextSupportTerms'], []))
                ? readFirstDefined(metadata, ['context_support_terms', 'contextSupportTerms'], [])
                : [])
            .concat(Array.isArray(readFirstDefined(metadata, ['existing_event_stability_terms', 'event_stability_terms'], []))
                ? readFirstDefined(metadata, ['existing_event_stability_terms', 'event_stability_terms'], [])
                : []);

        (Array.isArray(extraTexts) ? extraTexts : []).forEach(function collectTextTerms(text) {
            collectDigestStabilityTextTerms(text, 3).forEach(function pushTerm(term) {
                seeds.push(term);
            });
        });

        return normalizeEvidenceAliases(seeds, Math.max(4, Math.floor(toFiniteNumber(maxCount, 12))));
    }

    function buildDigestEventMemberCoherenceReference(memberIds, candidateMap, options) {
        const safeOptions = options && typeof options === 'object' ? options : {};
        const uniqueMemberIds = mergeUniqueIds(
            Array.isArray(memberIds) ? memberIds : [],
            [],
            96
        );
        const planMemberIds = mergeUniqueIds(
            Array.isArray(safeOptions.planMemoryIds) ? safeOptions.planMemoryIds : [],
            [],
            96
        );
        const detailMemoryIds = mergeUniqueIds(
            Array.isArray(safeOptions.detailMemoryIds) ? safeOptions.detailMemoryIds : [],
            planMemberIds,
            24
        );
        const flashbulbMemoryIds = mergeUniqueIds(
            Array.isArray(safeOptions.flashbulbMemoryIds) ? safeOptions.flashbulbMemoryIds : [],
            [],
            24
        );
        const anchorMemoryId = toTrimmedString(safeOptions.anchorMemoryId)
            || uniqueMemberIds[0]
            || '';
        const candidateAnchorRow = candidateMap instanceof Map
            ? (candidateMap.get(anchorMemoryId) || null)
            : null;
        const memberRows = getDigestEventMemberRows(uniqueMemberIds, candidateMap);
        const anchorRow = candidateAnchorRow || memberRows[0] || null;
        const anchorText = toTrimmedString(anchorRow && anchorRow.content);
        const title = toTrimmedString(safeOptions.title);
        const summary = toTrimmedString(safeOptions.summary);
        const anchorSeedTerms = collectDigestEventCoherenceTerms(anchorRow, [title, summary, anchorText], 12);
        const alignedSeedRows = memberRows
            .filter(function excludeAnchor(row) {
                return toTrimmedString(row && (row.id || row.memory_id)) !== anchorMemoryId;
            })
            .map(function scoreSeedRow(row) {
                const rowText = toTrimmedString(row && row.content);
                const rowTerms = collectDigestEventCoherenceTerms(row, [rowText], 8);
                const anchorTermOverlap = computeDigestAliasOverlapStats(rowTerms, anchorSeedTerms);
                const alignmentScore = Math.max(
                    computeDigestTextSimilarity(rowText, anchorText),
                    computeDigestTextSimilarity(rowText, title),
                    computeDigestTextSimilarity(rowText, summary)
                ) + anchorTermOverlap.leftRatio + (anchorTermOverlap.count > 0 ? 0.12 : 0);
                return {
                    row: row,
                    alignmentScore: alignmentScore
                };
            })
            .filter(function keepSeed(item) {
                return item
                    && item.row
                    && item.alignmentScore >= 0.18;
            })
            .sort(function sortSeed(left, right) {
                return toFiniteNumber(right && right.alignmentScore, 0) - toFiniteNumber(left && left.alignmentScore, 0);
            })
            .slice(0, 2)
            .map(function extractRow(item) {
                return item.row;
            });
        const referenceRows = anchorRow
            ? [anchorRow].concat(alignedSeedRows)
            : memberRows.slice(0, 2);
        const existingRecord = safeOptions.existingRecord && typeof safeOptions.existingRecord === 'object'
            ? safeOptions.existingRecord
            : null;
        const existingMetadata = normalizeMetadata(existingRecord && existingRecord.metadata);
        const referenceTerms = normalizeEvidenceAliases(
            []
                .concat(collectDigestEventCoherenceTerms(anchorRow, [title, summary, anchorText], 16))
                .concat(referenceRows.reduce(function concatTerms(list, row) {
                    return list.concat(collectDigestEventCoherenceTerms(row, [row && row.content], 8));
                }, []))
                .concat(collectDigestStabilityTextTerms(title, 3))
                .concat(collectDigestStabilityTextTerms(summary, 4))
                .concat(Array.isArray(existingRecord && existingRecord.event_stability_terms)
                    ? existingRecord.event_stability_terms
                    : [])
                .concat(Array.isArray(existingMetadata.event_stability_terms)
                    ? existingMetadata.event_stability_terms
                    : []),
            16
        );
        const referenceEvidence = collectEventSourceEvidenceMetadata(
            referenceRows,
            existingMetadata
        );
        const structuralSet = new Set(
            mergeUniqueIds(
                mergeUniqueIds(anchorMemoryId ? [anchorMemoryId] : [], detailMemoryIds, 24),
                flashbulbMemoryIds,
                32
            )
        );
        const carryForwardIds = new Set(
            Array.isArray(safeOptions.carryForwardMemberIds)
                ? safeOptions.carryForwardMemberIds.map(toTrimmedString).filter(Boolean)
                : []
        );

        return {
            eventId: toTrimmedString(safeOptions.eventId),
            continuationKey: normalizeContinuationLookupKey(safeOptions.continuationKey),
            anchorMemoryId: anchorMemoryId,
            anchorText: anchorText,
            title: title,
            summary: summary,
            coreText: [title, summary, anchorText].filter(Boolean).join(' '),
            terms: referenceTerms,
            sourceMessageIds: Array.isArray(referenceEvidence.source_message_ids)
                ? referenceEvidence.source_message_ids.slice(0, 24)
                : [],
            timeStart: toTrimmedString(referenceEvidence.source_time_start),
            timeEnd: toTrimmedString(referenceEvidence.source_time_end),
            planMemberSet: new Set(planMemberIds),
            structuralSet: structuralSet,
            carryForwardSet: carryForwardIds
        };
    }

    function evaluateDigestEventMemberCoherence(row, reference) {
        const safeRow = row && typeof row === 'object' ? row : {};
        const safeReference = reference && typeof reference === 'object' ? reference : {};
        const memoryId = toTrimmedString(safeRow.id || safeRow.memory_id);
        const metadata = normalizeMetadata(safeRow.metadata);
        const rowText = toTrimmedString(safeRow.content || safeRow.summary || safeRow.event_summary);
        const contentSimilarity = Math.max(
            computeDigestTextSimilarity(rowText, safeReference.coreText),
            computeDigestTextSimilarity(rowText, safeReference.anchorText),
            computeDigestTextSimilarity(rowText, safeReference.title),
            computeDigestTextSimilarity(rowText, safeReference.summary)
        );
        const inheritedSimilarity = Math.max(
            computeDigestTextSimilarity(
                toTrimmedString(safeRow.existing_event_title || safeRow.event_title || metadata.event_title || ''),
                safeReference.title
            ),
            computeDigestTextSimilarity(
                toTrimmedString(safeRow.existing_event_summary || safeRow.event_summary || metadata.event_summary || ''),
                safeReference.summary
            )
        );
        const rowTerms = collectDigestEventCoherenceTerms(safeRow, [rowText], 12);
        const termOverlap = computeDigestAliasOverlapStats(rowTerms, safeReference.terms);
        const rowSourceMessageIds = normalizeEvidenceMessageIds(
            []
                .concat(Array.isArray(safeRow.source_message_ids) ? safeRow.source_message_ids : [])
                .concat(Array.isArray(metadata.source_message_ids) ? metadata.source_message_ids : []),
            24
        );
        const sourceOverlap = computeDigestIdOverlapStats(rowSourceMessageIds, safeReference.sourceMessageIds);
        const timeWindow = computeDigestTimeWindowStats(
            safeRow.source_time_start || metadata.source_time_start || '',
            safeRow.source_time_end || metadata.source_time_end || '',
            safeReference.timeStart,
            safeReference.timeEnd
        );
        const existingEventId = toTrimmedString(
            safeRow.existing_event_id
            || safeRow.event_id
            || metadata.event_id
            || metadata.memory_event_id
        );
        const continuationKey = normalizeContinuationLookupKey(
            safeRow.existing_continuation_key
            || safeRow.continuation_key
            || metadata.continuation_key
            || metadata.continuationKey
        );
        const sameEventId = !!(safeReference.eventId && existingEventId && safeReference.eventId === existingEventId);
        const continuationMatch = !!(safeReference.continuationKey && continuationKey && safeReference.continuationKey === continuationKey);
        const structural = safeReference.structuralSet instanceof Set && safeReference.structuralSet.has(memoryId);
        const carryOnly = safeReference.planMemberSet instanceof Set
            ? !safeReference.planMemberSet.has(memoryId)
            : false;

        let score = 0;
        score += contentSimilarity * 0.48;
        score += inheritedSimilarity * 0.18;
        score += termOverlap.leftRatio * 0.16;
        score += Math.min(0.12, termOverlap.count * 0.04);
        score += sourceOverlap.leftRatio * 0.18;
        if (sourceOverlap.count > 0) score += 0.12;
        if (timeWindow.overlapHours > 0) {
            score += 0.08;
        } else if (timeWindow.sameDay) {
            score += 0.04;
        }
        if (sameEventId) score += 0.12;
        if (continuationMatch) score += 0.08;
        if (structural) score += 0.05;
        if (toBoolean(safeRow.is_flashbulb || metadata.is_flashbulb || metadata.event_is_flashbulb)) {
            score += 0.04;
        }
        if (
            carryOnly
            && contentSimilarity < 0.08
            && inheritedSimilarity < 0.10
            && termOverlap.count === 0
            && sourceOverlap.count === 0
        ) {
            score -= 0.12;
        }
        score = clampNumber(score, 0, 1, 0);

        const threshold = carryOnly
            ? (structural ? 0.28 : DIGEST_EVENT_MEMBER_COHERENCE_CARRY_MIN)
            : (structural ? 0.22 : DIGEST_EVENT_MEMBER_COHERENCE_MIN);
        const directEvidence = sourceOverlap.count > 0
            || (timeWindow.overlapHours > 0 && contentSimilarity >= 0.10);
        const linkedEvidence = sameEventId && (
            termOverlap.count >= 1
            || contentSimilarity >= 0.18
            || inheritedSimilarity >= 0.22
        );
        const keep = score >= threshold || directEvidence || linkedEvidence;

        const reasonTags = [];
        if (contentSimilarity >= 0.18) reasonTags.push('content_match');
        if (termOverlap.count >= 1) reasonTags.push('term_match');
        if (sourceOverlap.count >= 1) reasonTags.push('source_overlap');
        if (timeWindow.overlapHours > 0) reasonTags.push('time_overlap');
        if (sameEventId) reasonTags.push('same_event');
        if (continuationMatch) reasonTags.push('same_continuation');
        if (structural) reasonTags.push('structural_member');
        if (carryOnly) reasonTags.push('carry_member');
        if (!keep) reasonTags.push('off_track');

        return {
            id: memoryId,
            keep: keep,
            score: score,
            carryOnly: carryOnly,
            structural: structural,
            reasonTags: reasonTags
        };
    }

    function filterDigestEventMembersByCoherence(memoryIds, candidateMap, options) {
        const safeOptions = options && typeof options === 'object' ? options : {};
        const reference = buildDigestEventMemberCoherenceReference(memoryIds, candidateMap, safeOptions);
        const orderedIds = mergeUniqueIds(Array.isArray(memoryIds) ? memoryIds : [], [], 96);
        const keptIds = [];
        const detailIds = [];
        const droppedIds = [];
        const evaluations = [];
        const detailSet = new Set(
            mergeUniqueIds(
                Array.isArray(safeOptions.detailMemoryIds) ? safeOptions.detailMemoryIds : [],
                [],
                24
            )
        );

        orderedIds.forEach(function inspectMember(memoryId) {
            const safeMemoryId = toTrimmedString(memoryId);
            if (!safeMemoryId) return;
            if (safeMemoryId === reference.anchorMemoryId) {
                keptIds.push(safeMemoryId);
                evaluations.push({
                    id: safeMemoryId,
                    keep: true,
                    score: 1,
                    carryOnly: false,
                    structural: true,
                    reasonTags: ['anchor']
                });
                if (detailSet.has(safeMemoryId)) detailIds.push(safeMemoryId);
                return;
            }

            const row = candidateMap instanceof Map ? (candidateMap.get(safeMemoryId) || null) : null;
            if (!row) {
                const structuralWithoutRow = reference.structuralSet instanceof Set && reference.structuralSet.has(safeMemoryId);
                if (structuralWithoutRow) {
                    keptIds.push(safeMemoryId);
                    evaluations.push({
                        id: safeMemoryId,
                        keep: true,
                        score: 0.62,
                        carryOnly: !(reference.planMemberSet instanceof Set && reference.planMemberSet.has(safeMemoryId)),
                        structural: true,
                        reasonTags: ['structural_no_row']
                    });
                    if (detailSet.has(safeMemoryId)) detailIds.push(safeMemoryId);
                } else {
                    droppedIds.push(safeMemoryId);
                    evaluations.push({
                        id: safeMemoryId,
                        keep: false,
                        score: 0,
                        carryOnly: true,
                        structural: false,
                        reasonTags: ['missing_row']
                    });
                }
                return;
            }

            const evaluation = evaluateDigestEventMemberCoherence(row, reference);
            evaluations.push(evaluation);
            if (evaluation.keep) {
                keptIds.push(safeMemoryId);
                if (detailSet.has(safeMemoryId)) detailIds.push(safeMemoryId);
                return;
            }
            droppedIds.push(safeMemoryId);
        });

        if (keptIds.length === 1 && orderedIds.length > 1) {
            const rescue = evaluations
                .filter(function findDroppedPlanMember(item) {
                    return item
                        && !item.keep
                        && !item.carryOnly
                        && toFiniteNumber(item.score, 0) >= 0.18
                        && toTrimmedString(item.id) !== reference.anchorMemoryId;
                })
                .sort(function sortByScore(left, right) {
                    return toFiniteNumber(right && right.score, 0) - toFiniteNumber(left && left.score, 0);
                })[0];
            if (rescue && !keptIds.includes(rescue.id)) {
                keptIds.push(rescue.id);
                if (detailSet.has(rescue.id)) detailIds.push(rescue.id);
                const rescueEval = evaluations.find(function findEvaluation(item) {
                    return item && item.id === rescue.id;
                });
                if (rescueEval) {
                    rescueEval.keep = true;
                    rescueEval.reasonTags = Array.from(new Set((rescueEval.reasonTags || []).concat(['rescued'])));
                }
                const dropIndex = droppedIds.indexOf(rescue.id);
                if (dropIndex >= 0) droppedIds.splice(dropIndex, 1);
            }
        }

        const normalizedKeptIds = mergeUniqueIds(keptIds, [], 96);
        const normalizedDetailIds = mergeUniqueIds(detailIds, normalizedKeptIds, 24);
        const keptScores = evaluations
            .filter(function pickKept(item) {
                return item && item.keep;
            })
            .map(function mapScore(item) {
                return clampNumber(item.score, 0, 1, 0);
            });
        const coherenceScore = keptScores.length > 0
            ? roundDigestSignalValue(
                keptScores.reduce(function sum(total, value) {
                    return total + value;
                }, 0) / keptScores.length,
                4
            )
            : 0;
        const mixedRisk = droppedIds.length > 0 && normalizedKeptIds.length > 0;
        const reasonTags = [];
        if (mixedRisk) reasonTags.push('mixed_members_trimmed');
        if (droppedIds.length > 0) reasonTags.push('outlier_removed');
        if (coherenceScore >= 0.52) reasonTags.push('cohesive');
        if (coherenceScore < 0.34) reasonTags.push('fragile_coherence');

        return {
            anchorMemoryId: normalizedKeptIds.includes(reference.anchorMemoryId)
                ? reference.anchorMemoryId
                : (normalizedDetailIds[0] || normalizedKeptIds[0] || null),
            memoryIds: normalizedKeptIds,
            detailMemoryIds: normalizedDetailIds,
            droppedMemoryIds: mergeUniqueIds(droppedIds, [], 96),
            coherenceScore: coherenceScore,
            mixedRisk: mixedRisk,
            reasonTags: reasonTags,
            evaluations: evaluations
        };
    }

    function sanitizeDigestEventSignalProfile(profile) {
        const source = profile && typeof profile === 'object' ? profile : {};
        return {
            salienceScore: roundDigestSignalValue(clampNumber(source.salienceScore, 0, 1, 0.4), 4),
            emotionScore: roundDigestSignalValue(clampNumber(source.emotionScore, 0, 1, 0), 4),
            significanceScore: roundDigestSignalValue(clampNumber(source.significanceScore, 0, 1, 0), 4),
            contrastScore: roundDigestSignalValue(clampNumber(source.contrastScore, 0, 1, 0), 4),
            detailScore: roundDigestSignalValue(clampNumber(source.detailScore, 0, 1, 0), 4),
            recurrenceScore: roundDigestSignalValue(clampNumber(source.recurrenceScore, 0, 1, 0), 4),
            conflictScore: roundDigestSignalValue(clampNumber(source.conflictScore, 0, 1, 0), 4),
            attachmentScore: roundDigestSignalValue(clampNumber(source.attachmentScore, 0, 1, 0), 4),
            unresolvedScore: roundDigestSignalValue(clampNumber(source.unresolvedScore, 0, 1, 0), 4),
            layerScore: roundDigestSignalValue(clampNumber(source.layerScore, 0, 1, 0), 4),
            densityScore: roundDigestSignalValue(clampNumber(source.densityScore, 0, 1, 0), 4),
            positivePeak: roundDigestSignalValue(clampNumber(source.positivePeak, 0, 1, 0), 4),
            negativePeak: roundDigestSignalValue(clampNumber(source.negativePeak, 0, 1, 0), 4),
            maxImportance: roundDigestSignalValue(clampNumber(source.maxImportance, 1, 10, 5), 2),
            maxArousal: roundDigestSignalValue(clampNumber(source.maxArousal, 0, 1, 0), 4),
            maxAbsValence: roundDigestSignalValue(clampNumber(source.maxAbsValence, 0, 1, 0), 4),
            memberCount: Math.max(0, Math.floor(toFiniteNumber(source.memberCount, 0))),
            depth: normalizeEventDepth(source.depth),
            isUnresolved: !!source.isUnresolved,
            fragmentFlashbulb: !!source.fragmentFlashbulb,
            existingFlashbulb: !!source.existingFlashbulb,
            reasonTags: Array.isArray(source.reasonTags)
                ? source.reasonTags.map(toTrimmedString).filter(Boolean).slice(0, 10)
                : []
        };
    }

    function deriveDigestEventSignalProfile(memberRows, options) {
        const source = Array.isArray(memberRows) ? memberRows.filter(Boolean) : [];
        const safeOptions = options && typeof options === 'object' ? options : {};
        const existingRecord = safeOptions.existingRecord && typeof safeOptions.existingRecord === 'object'
            ? safeOptions.existingRecord
            : null;
        const existingMetadata = normalizeMetadata(existingRecord && existingRecord.metadata);
        const existingSignalProfile = existingMetadata.event_signal_profile
            && typeof existingMetadata.event_signal_profile === 'object'
            ? existingMetadata.event_signal_profile
            : {};
        const depth = normalizeEventDepth(
            safeOptions.depth
            || (existingRecord && existingRecord.depth)
        );
        const unresolved = safeOptions.isUnresolved !== undefined
            ? toBoolean(safeOptions.isUnresolved)
            : safeOptions.unresolved !== undefined
                ? toBoolean(safeOptions.unresolved)
                : (
                    existingRecord
                        ? !!existingRecord.is_unresolved
                        : source.some(function hasUnresolved(item) {
                            const layer = toTrimmedString(item && item.memory_layer).toLowerCase();
                            return !toBoolean(item && item.resolved) || layer === 'shadow' || layer === 'wish';
                        })
                );

        if (source.length === 0) {
            return sanitizeDigestEventSignalProfile({
                salienceScore: clampNumber(existingRecord && existingRecord.salience_score, 0, 1, 0.4),
                emotionScore: clampNumber(existingSignalProfile.emotionScore, 0, 1, 0),
                significanceScore: clampNumber(existingSignalProfile.significanceScore, 0, 1, 0),
                contrastScore: clampNumber(existingSignalProfile.contrastScore, 0, 1, 0),
                detailScore: clampNumber(existingSignalProfile.detailScore, 0, 1, 0),
                recurrenceScore: clampNumber(existingSignalProfile.recurrenceScore, 0, 1, 0),
                conflictScore: clampNumber(existingSignalProfile.conflictScore, 0, 1, 0),
                attachmentScore: clampNumber(existingSignalProfile.attachmentScore, 0, 1, 0),
                unresolvedScore: unresolved ? 1 : 0,
                layerScore: clampNumber(existingSignalProfile.layerScore, 0, 1, 0),
                densityScore: clampNumber(existingSignalProfile.densityScore, 0, 1, 0),
                positivePeak: clampNumber(existingSignalProfile.positivePeak, 0, 1, 0),
                negativePeak: clampNumber(existingSignalProfile.negativePeak, 0, 1, 0),
                maxImportance: 1,
                maxArousal: 0,
                maxAbsValence: 0,
                memberCount: 0,
                depth: depth,
                isUnresolved: unresolved,
                fragmentFlashbulb: false,
                existingFlashbulb: toBoolean(
                    (existingRecord && existingRecord.event_is_flashbulb)
                    || existingMetadata.event_is_flashbulb
                    || existingMetadata.is_flashbulb
                ),
                reasonTags: unresolved ? ['open_loop'] : []
            });
        }

        let maxArousal = 0;
        let sumArousal = 0;
        let maxImportance = 1;
        let sumImportance = 0;
        let maxAbsValence = 0;
        let sumAbsValence = 0;
        let minValence = 1;
        let maxValence = -1;
        let positivePeak = 0;
        let negativePeak = 0;
        let activationPeak = 0;
        let layerScore = 0;
        let keywordDensity = 0;
        let sensoryDensity = 0;
        let fragmentFlashbulb = false;

        source.forEach(function scanMember(item) {
            const metadata = normalizeMetadata(item && item.metadata);
            const valence = clampNumber(item && item.valence, -1, 1, 0);
            const arousal = clampNumber(item && item.arousal, 0, 1, 0);
            const importance = clampNumber(item && item.importance, 1, 10, 5);
            const absValence = Math.abs(valence);
            const activationCount = Math.max(0, toFiniteNumber(item && item.activation_count, 0));
            const layer = toTrimmedString(item && item.memory_layer).toLowerCase();

            maxArousal = Math.max(maxArousal, arousal);
            sumArousal += arousal;
            maxImportance = Math.max(maxImportance, importance);
            sumImportance += importance;
            maxAbsValence = Math.max(maxAbsValence, absValence);
            sumAbsValence += absValence;
            minValence = Math.min(minValence, valence);
            maxValence = Math.max(maxValence, valence);
            activationPeak = Math.max(activationPeak, activationCount);

            if (valence >= 0.12) positivePeak = Math.max(positivePeak, valence);
            if (valence <= -0.12) negativePeak = Math.max(negativePeak, Math.abs(valence));

            if (layer === 'shadow') {
                layerScore = Math.max(layerScore, 0.96);
            } else if (layer === 'wish') {
                layerScore = Math.max(layerScore, 0.82);
            } else if (layer === 'core') {
                layerScore = Math.max(layerScore, 0.68);
            } else if (layer === 'cortex') {
                layerScore = Math.max(layerScore, 0.52);
            } else {
                layerScore = Math.max(layerScore, 0.28);
            }

            const keywordCount = Array.isArray(metadata.trigger_keywords)
                ? metadata.trigger_keywords.map(toTrimmedString).filter(Boolean).length
                : 0;
            const sensoryCount = Array.isArray(metadata.sensory_anchors)
                ? metadata.sensory_anchors.map(toTrimmedString).filter(Boolean).length
                : 0;
            keywordDensity = Math.max(keywordDensity, Math.min(keywordCount, 6) / 6);
            sensoryDensity = Math.max(sensoryDensity, Math.min(sensoryCount, 5) / 5);

            if (toBoolean(
                (item && item.is_flashbulb)
                || metadata.is_flashbulb
                || metadata.event_is_flashbulb
            )) {
                fragmentFlashbulb = true;
            }
        });

        const memberCount = source.length;
        const avgArousal = sumArousal / memberCount;
        const avgImportance = sumImportance / memberCount;
        const avgAbsValence = sumAbsValence / memberCount;
        const valenceSpread = clampNumber((maxValence - minValence) / 2, 0, 1, 0);
        const mixedEmotion = positivePeak >= 0.26 && negativePeak >= 0.26 ? 1 : 0;
        const recurrenceScore = clampNumber(Math.log1p(activationPeak) / Math.log(6), 0, 1, 0);
        const densityScore = clampNumber((memberCount - 1) / 5, 0, 1, 0);
        const detailScore = clampNumber((sensoryDensity * 0.58) + (keywordDensity * 0.42), 0, 1, 0);
        const contrastScore = clampNumber(
            (valenceSpread * 0.48)
            + (mixedEmotion * 0.34)
            + (Math.abs(positivePeak - negativePeak) * 0.18),
            0,
            1,
            0
        );
        const emotionScore = clampNumber(
            (maxArousal * 0.34)
            + (avgArousal * 0.14)
            + (maxAbsValence * 0.30)
            + (avgAbsValence * 0.22),
            0,
            1,
            0.4
        );
        const significanceScore = clampNumber(
            ((maxImportance / 10) * 0.38)
            + ((avgImportance / 10) * 0.16)
            + (layerScore * 0.16)
            + (recurrenceScore * 0.14)
            + (densityScore * 0.10)
            + (detailScore * 0.06),
            0,
            1,
            0.4
        );
        const unresolvedScore = unresolved ? 1 : 0;
        const depthScore = depth === 'high'
            ? 1
            : depth === 'medium'
                ? 0.56
                : 0.18;
        const existingFlashbulb = toBoolean(
            (existingRecord && existingRecord.event_is_flashbulb)
            || existingMetadata.event_is_flashbulb
            || existingMetadata.is_flashbulb
        );
        const salienceScore = clampNumber(
            (emotionScore * 0.52)
            + (significanceScore * 0.22)
            + (contrastScore * 0.10)
            + (detailScore * 0.08)
            + (unresolvedScore * 0.05)
            + (depthScore * 0.03),
            0,
            1,
            0.4
        );
        const conflictScore = clampNumber(
            (negativePeak * 0.32)
            + (contrastScore * 0.20)
            + (unresolvedScore * 0.16)
            + (emotionScore * 0.12)
            + (avgArousal * 0.10)
            + (mixedEmotion * 0.06)
            + (recurrenceScore * 0.04),
            0,
            1,
            0
        );
        const attachmentScore = clampNumber(
            (significanceScore * 0.24)
            + (recurrenceScore * 0.18)
            + (detailScore * 0.16)
            + (unresolvedScore * 0.14)
            + (emotionScore * 0.10)
            + (densityScore * 0.08)
            + (Math.max(positivePeak, negativePeak * 0.92) * 0.10),
            0,
            1,
            0
        );

        const reasonTags = [];
        if (existingFlashbulb) reasonTags.push('existing_flashbulb');
        if (fragmentFlashbulb) reasonTags.push('fragment_flashbulb');
        if (emotionScore >= 0.72) reasonTags.push('emotionally_intense');
        if (positivePeak >= 0.58 && avgArousal <= 0.78) reasonTags.push('warm');
        if (negativePeak >= 0.58) reasonTags.push('painful');
        if (contrastScore >= 0.52) reasonTags.push('contrast');
        if (significanceScore >= 0.66) reasonTags.push('high_significance');
        if (detailScore >= 0.58) reasonTags.push('vivid_details');
        if (recurrenceScore >= 0.52) reasonTags.push('recurrent');
        if (unresolved) reasonTags.push('open_loop');
        if (layerScore >= 0.82) reasonTags.push('deep_layer');
        if (mixedEmotion) reasonTags.push('mixed_emotions');
        if (densityScore >= 0.68 || (detailScore >= 0.48 && memberCount >= 3)) reasonTags.push('rich_episode');
        if (conflictScore >= 0.62) reasonTags.push('high_conflict');
        if (attachmentScore >= 0.64) reasonTags.push('high_attachment');
        if (conflictScore >= 0.72 && unresolved) reasonTags.push('grievance_pull');
        if (attachmentScore >= 0.72 && (unresolved || recurrenceScore >= 0.58)) reasonTags.push('attachment_pull');
        if (positivePeak >= 0.62 && attachmentScore >= 0.62 && !unresolved) reasonTags.push('bonded');

        return sanitizeDigestEventSignalProfile({
            salienceScore: salienceScore,
            emotionScore: emotionScore,
            significanceScore: significanceScore,
            contrastScore: contrastScore,
            detailScore: detailScore,
            recurrenceScore: recurrenceScore,
            conflictScore: conflictScore,
            attachmentScore: attachmentScore,
            unresolvedScore: unresolvedScore,
            layerScore: layerScore,
            densityScore: densityScore,
            positivePeak: positivePeak,
            negativePeak: negativePeak,
            maxImportance: maxImportance,
            maxArousal: maxArousal,
            maxAbsValence: maxAbsValence,
            memberCount: memberCount,
            depth: depth,
            isUnresolved: unresolved,
            fragmentFlashbulb: fragmentFlashbulb,
            existingFlashbulb: existingFlashbulb,
            reasonTags: Array.from(new Set(reasonTags))
        });
    }

    function deriveDigestPlanReference(plan, candidateMap) {
        const normalizedPlan = plan && typeof plan === 'object' ? plan : {};
        const memoryIds = Array.isArray(normalizedPlan.memoryIds)
            ? normalizedPlan.memoryIds.map(toTrimmedString).filter(Boolean)
            : [];
        const detailMemoryIds = mergeUniqueIds(
            Array.isArray(normalizedPlan.detailMemoryIds)
                ? normalizedPlan.detailMemoryIds
                : [],
            memoryIds,
            24
        );
        const anchorMemoryId = toTrimmedString(normalizedPlan.anchorMemoryId)
            || memoryIds[0]
            || '';
        const memberRows = memoryIds
            .map(function mapMemberRow(id) {
                return candidateMap instanceof Map ? (candidateMap.get(id) || null) : null;
            })
            .filter(Boolean);
        const anchorRow = (candidateMap instanceof Map ? (candidateMap.get(anchorMemoryId) || null) : null)
            || memberRows[0]
            || null;
        const inheritedTitle = pickDominantCountKey(
            collectCandidateValueCounts(memoryIds, candidateMap, 'existing_event_title')
        );
        const inheritedSummary = pickDominantCountKey(
            collectCandidateValueCounts(memoryIds, candidateMap, 'existing_event_summary')
        );
        const inheritedRoomId = pickDominantCountKey(
            collectCandidateValueCounts(memoryIds, candidateMap, 'room_id')
        );
        const inheritedContextScope = pickDominantCountKey(
            collectCandidateValueCounts(memoryIds, candidateMap, 'context_scope')
        );
        const anchorText = toTrimmedString(anchorRow && anchorRow.content);
        const title = toTrimmedString(normalizedPlan.title)
            || inheritedTitle
            || anchorText.slice(0, 20);
        const summary = toTrimmedString(normalizedPlan.summary)
            || inheritedSummary
            || anchorText.slice(0, 120);

        let startTs = Number.POSITIVE_INFINITY;
        let endTs = Number.NEGATIVE_INFINITY;
        memberRows.forEach(function countRange(row) {
            const ts = getMemoryTimestamp(row);
            if (!Number.isFinite(ts)) return;
            if (ts < startTs) startTs = ts;
            if (ts > endTs) endTs = ts;
        });
        const stabilityProfile = buildDigestEventStabilityProfile(memberRows, null, {
            title: title,
            summary: summary,
            anchorText: anchorText,
            continuationKey: toTrimmedString(normalizedPlan.continuationKey)
        });

        return {
            memoryIds: memoryIds,
            detailMemoryIds: detailMemoryIds,
            anchorMemoryId: anchorMemoryId,
            anchorText: anchorText,
            title: title,
            summary: summary,
            combinedText: [title, summary, anchorText].filter(Boolean).join(' '),
            roomId: toTrimmedString(anchorRow && anchorRow.room_id)
                || inheritedRoomId
                || '',
            contextScope: toTrimmedString(anchorRow && anchorRow.context_scope)
                || inheritedContextScope
                || '',
            stabilityTerms: Array.isArray(stabilityProfile.terms) ? stabilityProfile.terms.slice(0, 12) : [],
            stabilityPrimaryTerm: toTrimmedString(stabilityProfile.primaryTerm),
            stabilitySignature: toTrimmedString(stabilityProfile.signature),
            stabilitySourceMessageIds: Array.isArray(stabilityProfile.sourceMessageIds)
                ? stabilityProfile.sourceMessageIds.slice(0, 24)
                : [],
            stabilityTimeStart: toTrimmedString(stabilityProfile.sourceTimeStart),
            stabilityTimeEnd: toTrimmedString(stabilityProfile.sourceTimeEnd),
            startTs: Number.isFinite(startTs) ? startTs : Number.NaN,
            endTs: Number.isFinite(endTs) ? endTs : Number.NaN
        };
    }

    function getExistingEventLinkTagPriority(tags) {
        const tagSet = tags instanceof Set ? tags : new Set(Array.isArray(tags) ? tags : []);
        if (tagSet.has('explicit_id')) return 4;
        if (tagSet.has('inherited_id')) return 3;
        if (tagSet.has('continuation')) return 2;
        return 1;
    }

    function scoreExistingEventLinkCandidate(planReference, existingRecord, tags) {
        const record = normalizeExistingEventRecord(existingRecord);
        if (!record) return null;

        const tagSet = tags instanceof Set ? tags : new Set(Array.isArray(tags) ? tags : []);
        const existingExpandedIds = mergeUniqueIds(
            Array.isArray(record.detail_memory_ids) ? record.detail_memory_ids : [],
            Array.isArray(record.memory_ids) ? record.memory_ids : [],
            96
        );
        const planExpandedIds = mergeUniqueIds(
            Array.isArray(planReference && planReference.detailMemoryIds) ? planReference.detailMemoryIds : [],
            Array.isArray(planReference && planReference.memoryIds) ? planReference.memoryIds : [],
            24
        );
        const memberOverlap = computeDigestIdOverlapStats(
            planReference && planReference.memoryIds,
            record.memory_ids
        );
        const detailOverlap = computeDigestIdOverlapStats(
            planExpandedIds,
            existingExpandedIds
        );
        const anchorMemoryId = toTrimmedString(planReference && planReference.anchorMemoryId);
        const existingAnchorId = toTrimmedString(record.anchor_memory_id);
        const anchorExact = !!anchorMemoryId && !!existingAnchorId && anchorMemoryId === existingAnchorId;
        const anchorContained = !!anchorMemoryId && existingExpandedIds.includes(anchorMemoryId);
        const reverseAnchorContained = !!existingAnchorId && planExpandedIds.includes(existingAnchorId);
        const titleSimilarity = computeDigestTextSimilarity(
            planReference && planReference.title,
            record.title
        );
        const summarySimilarity = computeDigestTextSimilarity(
            planReference && planReference.summary,
            record.summary
        );
        const combinedSimilarity = computeDigestTextSimilarity(
            planReference && planReference.combinedText,
            [record.title, record.summary].filter(Boolean).join(' ')
        );
        const anchorSimilarity = Math.max(
            computeDigestTextSimilarity(planReference && planReference.anchorText, record.title),
            computeDigestTextSimilarity(planReference && planReference.anchorText, record.summary)
        );
        const roomMatch = !!(planReference && planReference.roomId && record.room_id && planReference.roomId === record.room_id);
        const scopeMatch = !!(planReference && planReference.contextScope && record.context_scope && planReference.contextScope === record.context_scope);
        const stabilityOverlap = computeDigestAliasOverlapStats(
            planReference && planReference.stabilityTerms,
            record.event_stability_terms
        );
        const stabilitySignatureMatch = !!(
            planReference
            && planReference.stabilitySignature
            && record.event_stability_signature
            && normalizeContinuationLookupKey(planReference.stabilitySignature) === normalizeContinuationLookupKey(record.event_stability_signature)
        );
        const stabilityPrimaryMatch = !!(
            planReference
            && planReference.stabilityPrimaryTerm
            && record.event_stability_primary_term
            && toTrimmedString(planReference.stabilityPrimaryTerm) === toTrimmedString(record.event_stability_primary_term)
        );
        const stabilitySourceOverlap = computeDigestIdOverlapStats(
            planReference && planReference.stabilitySourceMessageIds,
            record.event_stability_source_message_ids
        );
        const stabilityTimeWindow = computeDigestTimeWindowStats(
            planReference && planReference.stabilityTimeStart,
            planReference && planReference.stabilityTimeEnd,
            record.event_stability_time_start,
            record.event_stability_time_end
        );
        const planEndTs = Number.isFinite(planReference && planReference.endTs)
            ? planReference.endTs
            : (Number.isFinite(planReference && planReference.startTs) ? planReference.startTs : Number.NaN);
        const recordTs = getEventRecordTimestamp(record);
        const deltaHours = Number.isFinite(planEndTs) && Number.isFinite(recordTs)
            ? Math.abs(planEndTs - recordTs) / (60 * 60 * 1000)
            : Number.POSITIVE_INFINITY;

        const trustedLinkTag = tagSet.has('explicit_id')
            || tagSet.has('inherited_id')
            || tagSet.has('continuation');
        let score = 0;
        if (tagSet.has('explicit_id')) score += 100;
        if (tagSet.has('inherited_id')) score += 86;
        if (tagSet.has('continuation')) score += 72;
        score += memberOverlap.count * 2.4;
        score += detailOverlap.count * 0.9;
        score += memberOverlap.leftRatio * 4.6;
        score += memberOverlap.rightRatio * 2.8;
        score += detailOverlap.leftRatio * 2.3;
        score += detailOverlap.rightRatio * 1.6;
        if (anchorExact) score += 6.2;
        if (anchorContained) score += 4.4;
        if (reverseAnchorContained) score += 3.1;
        score += titleSimilarity * 4.2;
        score += summarySimilarity * 3.1;
        score += combinedSimilarity * 2.8;
        score += anchorSimilarity * 2.2;
        if (stabilitySignatureMatch) score += 4.8;
        if (stabilityPrimaryMatch) score += 1.8;
        score += stabilityOverlap.count * 1.6;
        score += stabilityOverlap.leftRatio * 2.4;
        score += stabilityOverlap.rightRatio * 1.5;
        score += stabilitySourceOverlap.count * 2.1;
        score += stabilitySourceOverlap.leftRatio * 2.8;
        score += stabilitySourceOverlap.rightRatio * 1.9;
        if (stabilityTimeWindow.overlapHours > 0) {
            score += Math.min(2.6, 0.8 + (stabilityTimeWindow.overlapHours / 12));
        } else if (stabilityTimeWindow.distanceHours <= 24) {
            score += 1.05;
        } else if (stabilityTimeWindow.distanceHours <= 72) {
            score += 0.45;
        }
        if (stabilityTimeWindow.sameDay) score += 0.35;
        if (roomMatch) score += 0.85;
        if (scopeMatch) score += 0.35;
        if (record.manual_edited) score += 0.5;
        if (record.is_unresolved) score += 0.45;
        if (record.event_is_flashbulb) score += 0.2;
        if (deltaHours <= 24) {
            score += 0.95;
        } else if (deltaHours <= 72) {
            score += 0.55;
        } else if (deltaHours <= 168) {
            score += 0.2;
        }

        const strongStructural = memberOverlap.count >= 2
            || memberOverlap.leftRatio >= 0.5
            || detailOverlap.leftRatio >= 0.6
            || anchorExact
            || anchorContained
            || reverseAnchorContained;
        const stabilityAliasSupport = stabilityOverlap.leftRatio >= 0.5
            || (stabilityOverlap.count >= 2 && stabilityOverlap.rightRatio >= 0.34);
        const strongStability = stabilitySignatureMatch
            || (stabilityPrimaryMatch && stabilityOverlap.count >= 1)
            || stabilitySourceOverlap.count >= 1
            || stabilitySourceOverlap.leftRatio >= 0.5
            || stabilityTimeWindow.overlapHours > 0
            || (stabilityTimeWindow.sameDay && stabilityOverlap.count >= 1);
        const strongText = titleSimilarity >= 0.72
            || summarySimilarity >= 0.68
            || combinedSimilarity >= 0.6
            || (titleSimilarity >= 0.5 && summarySimilarity >= 0.38)
            || (titleSimilarity >= 0.48 && anchorSimilarity >= 0.34);
        const manualGuardSatisfied = !record.manual_edited
            || tagSet.has('explicit_id')
            || tagSet.has('inherited_id')
            || tagSet.has('continuation')
            || memberOverlap.count >= 2
            || memberOverlap.leftRatio >= 0.45
            || detailOverlap.leftRatio >= 0.55
            || anchorExact
            || anchorContained
            || reverseAnchorContained
            || strongStability
            || (score >= 8.4 && strongText && combinedSimilarity >= 0.72);
        const fuzzyTextOnly = !trustedLinkTag && strongText && !strongStructural && !strongStability;
        if (fuzzyTextOnly) {
            score -= 2.4;
        }
        const fuzzyReuseAllowed = trustedLinkTag
            || strongStructural
            || strongStability
            || (
                strongText
                && (
                    (titleSimilarity >= 0.78 && summarySimilarity >= 0.62)
                    || anchorSimilarity >= 0.72
                )
                && (
                    (stabilityAliasSupport && titleSimilarity >= 0.82)
                    || stabilityOverlap.count >= 1
                    || stabilitySourceOverlap.count >= 1
                    || deltaHours <= 12
                )
            );
        const usable = (
            trustedLinkTag
            || (score >= 6.4 && fuzzyReuseAllowed)
        ) && manualGuardSatisfied;
        const linkSource = tagSet.has('explicit_id')
            ? 'explicit_id'
            : (tagSet.has('inherited_id')
                ? 'inherited_id'
                : (tagSet.has('continuation')
                        ? 'continuation'
                        : (stabilitySignatureMatch
                            ? 'stability_signature'
                            : (stabilitySourceOverlap.count >= 1
                                ? 'stability_source'
                        : ((strongStability || stabilityAliasSupport)
                            ? 'stability_alias'
                            : (strongStructural ? 'fuzzy_structure' : 'fuzzy_text'))))));

        return {
            record: record,
            score: score,
            usable: usable,
            tags: tagSet,
            overlapCount: memberOverlap.count + detailOverlap.count,
            structuralSignals: (strongStructural ? 1 : 0) + (anchorExact ? 1 : 0) + (anchorContained ? 1 : 0) + (strongStability ? 1 : 0),
            timestamp: recordTs,
            linkSource: linkSource,
            titleSimilarity: titleSimilarity,
            summarySimilarity: summarySimilarity,
            combinedSimilarity: combinedSimilarity,
            anchorSimilarity: anchorSimilarity,
            stabilityOverlapCount: stabilityOverlap.count,
            stabilityOverlapLeftRatio: stabilityOverlap.leftRatio,
            stabilityOverlapRightRatio: stabilityOverlap.rightRatio,
            stabilitySignatureMatch: stabilitySignatureMatch,
            stabilitySourceOverlapCount: stabilitySourceOverlap.count,
            stabilitySourceOverlapLeftRatio: stabilitySourceOverlap.leftRatio,
            stabilitySourceOverlapRightRatio: stabilitySourceOverlap.rightRatio,
            stabilityTimeOverlapHours: stabilityTimeWindow.overlapHours,
            stabilityTimeDistanceHours: stabilityTimeWindow.distanceHours,
            memberOverlapCount: memberOverlap.count,
            memberOverlapLeftRatio: memberOverlap.leftRatio,
            memberOverlapRightRatio: memberOverlap.rightRatio,
            detailOverlapCount: detailOverlap.count,
            detailOverlapLeftRatio: detailOverlap.leftRatio,
            detailOverlapRightRatio: detailOverlap.rightRatio,
            deltaHours: deltaHours
        };
    }

    function pickPreferredExistingEventLinkMatch(currentMatch, nextMatch) {
        if (!currentMatch) return nextMatch;
        if (!nextMatch) return currentMatch;
        if (nextMatch.score !== currentMatch.score) {
            return nextMatch.score > currentMatch.score ? nextMatch : currentMatch;
        }

        const currentPriority = getExistingEventLinkTagPriority(currentMatch.tags);
        const nextPriority = getExistingEventLinkTagPriority(nextMatch.tags);
        if (nextPriority !== currentPriority) {
            return nextPriority > currentPriority ? nextMatch : currentMatch;
        }

        if (nextMatch.overlapCount !== currentMatch.overlapCount) {
            return nextMatch.overlapCount > currentMatch.overlapCount ? nextMatch : currentMatch;
        }

        if (nextMatch.structuralSignals !== currentMatch.structuralSignals) {
            return nextMatch.structuralSignals > currentMatch.structuralSignals ? nextMatch : currentMatch;
        }

        const currentManual = currentMatch.record && currentMatch.record.manual_edited ? 1 : 0;
        const nextManual = nextMatch.record && nextMatch.record.manual_edited ? 1 : 0;
        if (nextManual !== currentManual) {
            return nextManual > currentManual ? nextMatch : currentMatch;
        }

        if (Number.isFinite(nextMatch.timestamp) && Number.isFinite(currentMatch.timestamp) && nextMatch.timestamp !== currentMatch.timestamp) {
            return nextMatch.timestamp > currentMatch.timestamp ? nextMatch : currentMatch;
        }

        const currentId = toTrimmedString(currentMatch.record && currentMatch.record.id);
        const nextId = toTrimmedString(nextMatch.record && nextMatch.record.id);
        return nextId && (!currentId || nextId < currentId) ? nextMatch : currentMatch;
    }

    function buildDigestEventLinkMeta(match) {
        if (!match || !match.record) return null;
        const tags = Array.from(match.tags instanceof Set ? match.tags : new Set(Array.isArray(match.tags) ? match.tags : []))
            .map(toTrimmedString)
            .filter(Boolean);
        return {
            source: toTrimmedString(match.linkSource) || 'unknown',
            score: Number(toFiniteNumber(match.score, 0).toFixed(3)),
            tags: tags,
            eventId: toTrimmedString(match.record && match.record.id) || null,
            manualEdited: !!(match.record && match.record.manual_edited),
            titleSimilarity: Number(clampNumber(match.titleSimilarity, 0, 1, 0).toFixed(3)),
            summarySimilarity: Number(clampNumber(match.summarySimilarity, 0, 1, 0).toFixed(3)),
            combinedSimilarity: Number(clampNumber(match.combinedSimilarity, 0, 1, 0).toFixed(3)),
            anchorSimilarity: Number(clampNumber(match.anchorSimilarity, 0, 1, 0).toFixed(3)),
            stabilityOverlapCount: Math.max(0, Math.floor(toFiniteNumber(match.stabilityOverlapCount, 0))),
            stabilityOverlapRatio: Number(clampNumber(match.stabilityOverlapLeftRatio, 0, 1, 0).toFixed(3)),
            stabilitySignatureMatch: !!match.stabilitySignatureMatch,
            memberOverlapCount: Math.max(0, Math.floor(toFiniteNumber(match.memberOverlapCount, 0))),
            memberOverlapRatio: Number(clampNumber(match.memberOverlapLeftRatio, 0, 1, 0).toFixed(3)),
            detailOverlapCount: Math.max(0, Math.floor(toFiniteNumber(match.detailOverlapCount, 0))),
            detailOverlapRatio: Number(clampNumber(match.detailOverlapLeftRatio, 0, 1, 0).toFixed(3)),
            deltaHours: Number.isFinite(match.deltaHours) ? Number(Math.max(0, match.deltaHours).toFixed(2)) : null
        };
    }

    function pickPreferredDigestLinkMeta(leftMeta, rightMeta) {
        const left = leftMeta && typeof leftMeta === 'object' ? leftMeta : null;
        const right = rightMeta && typeof rightMeta === 'object' ? rightMeta : null;
        if (!left) return right;
        if (!right) return left;
        const leftScore = toFiniteNumber(left.score, 0);
        const rightScore = toFiniteNumber(right.score, 0);
        if (rightScore !== leftScore) return rightScore > leftScore ? right : left;
        const leftOverlap = toFiniteNumber(left.memberOverlapCount, 0) + toFiniteNumber(left.detailOverlapCount, 0);
        const rightOverlap = toFiniteNumber(right.memberOverlapCount, 0) + toFiniteNumber(right.detailOverlapCount, 0);
        if (rightOverlap !== leftOverlap) return rightOverlap > leftOverlap ? right : left;
        return toTrimmedString(right.eventId) && !toTrimmedString(left.eventId) ? right : left;
    }

    function scoreDigestCarryExistingEvent(record, candidateWindowEndTs) {
        const normalized = normalizeExistingEventRecord(record);
        if (!normalized) return Number.NEGATIVE_INFINITY;
        if (isDigestRetiredEventRecord(normalized)) return Number.NEGATIVE_INFINITY;

        let score = 0;
        if (normalized.manual_edited) score += 2.5;
        if (normalized.is_unresolved) score += 2.2;
        if (toTrimmedString(normalized.continuation_key)) score += 1.1;
        if (normalized.event_is_flashbulb) score += 0.8;
        score += clampNumber(normalized.salience_score, 0, 1, 0) * 1.4;
        score += clampNumber(normalized.depth_score, 0, 1, mapEventDepthToScore(normalized.depth)) * 0.9;

        const recordTs = getEventRecordTimestamp(normalized);
        if (Number.isFinite(recordTs) && Number.isFinite(candidateWindowEndTs)) {
            const deltaHours = Math.abs(candidateWindowEndTs - recordTs) / (60 * 60 * 1000);
            if (deltaHours <= 24) {
                score += 1.2;
            } else if (deltaHours <= 72) {
                score += 0.85;
            } else if (deltaHours <= 168) {
                score += 0.45;
            } else if (deltaHours <= 336) {
                score += 0.15;
            }
        }

        return score;
    }

    /**
     * 判断错误是否来自“事件字段尚未迁移到数据库”。
     */
    function isMissingEventColumnError(error) {
        const text = toTrimmedString(
            error && (error.message || error.details || error.hint || error)
        ).toLowerCase();
        if (!text) return false;
        return (text.includes('column') || text.includes('schema cache')) && (
            text.includes('event_')
            || text.includes('continuation_key')
        );
    }

    /**
     * 把 digest 候选记忆补成“带已有事件快照”的结构，供 prompt / 旧事件复用链路共用。
     */
    function decorateDigestCandidateRow(row) {
        const source = row && typeof row === 'object' ? row : {};
        const metadata = normalizeMetadata(source.metadata);
        const existingEventId = toTrimmedString(
            source.event_id
            || metadata.event_id
            || metadata.eventId
            || metadata.memory_event_id
        ) || null;
        const detailMemoryIds = (
            Array.isArray(source.event_detail_memory_ids)
                ? source.event_detail_memory_ids
                : Array.isArray(metadata.event_detail_memory_ids)
                    ? metadata.event_detail_memory_ids
                    : Array.isArray(metadata.detail_memory_ids)
                        ? metadata.detail_memory_ids
                        : []
        ).map(toTrimmedString).filter(Boolean).slice(0, 24);
        const triggerKeywords = Array.isArray(metadata.trigger_keywords)
            ? metadata.trigger_keywords.map(toTrimmedString).filter(Boolean).slice(0, 6)
            : [];
        const sensoryAnchors = Array.isArray(metadata.sensory_anchors)
            ? metadata.sensory_anchors.map(toTrimmedString).filter(Boolean).slice(0, 6)
            : [];
        const existingStabilityTerms = normalizeEvidenceAliases(
            []
                .concat(Array.isArray(source.existing_event_stability_terms) ? source.existing_event_stability_terms : [])
                .concat(Array.isArray(source.event_stability_terms) ? source.event_stability_terms : [])
                .concat(Array.isArray(readFirstDefined(metadata, ['existing_event_stability_terms', 'event_stability_terms'], []))
                    ? readFirstDefined(metadata, ['existing_event_stability_terms', 'event_stability_terms'], [])
                    : []),
            12
        );
        const existingStabilitySourceMessageIds = normalizeEvidenceMessageIds(
            []
                .concat(Array.isArray(source.existing_event_stability_source_message_ids) ? source.existing_event_stability_source_message_ids : [])
                .concat(Array.isArray(source.event_stability_source_message_ids) ? source.event_stability_source_message_ids : [])
                .concat(Array.isArray(readFirstDefined(metadata, ['existing_event_stability_source_message_ids', 'event_stability_source_message_ids', 'source_message_ids'], []))
                    ? readFirstDefined(metadata, ['existing_event_stability_source_message_ids', 'event_stability_source_message_ids', 'source_message_ids'], [])
                    : []),
            24
        );
        const existingStabilityTimeStart = mergeEvidenceTimeBoundary(
            source.existing_event_stability_time_start || source.event_stability_time_start || '',
            readFirstDefined(metadata, ['existing_event_stability_time_start', 'event_stability_time_start', 'source_time_start'], ''),
            'min'
        );
        const existingStabilityTimeEnd = mergeEvidenceTimeBoundary(
            source.existing_event_stability_time_end || source.event_stability_time_end || '',
            readFirstDefined(metadata, ['existing_event_stability_time_end', 'event_stability_time_end', 'source_time_end'], ''),
            'max'
        );

        return Object.assign({}, source, {
            metadata: metadata,
            trigger_keywords: triggerKeywords,
            sensory_anchors: sensoryAnchors,
            existing_event_id: existingEventId,
            existing_event_title: toTrimmedString(source.event_title || metadata.event_title || metadata.eventTitle) || null,
            existing_event_summary: toTrimmedString(source.event_summary || metadata.event_summary || metadata.eventSummary) || null,
            existing_event_status: toTrimmedString(source.event_status || metadata.event_status || metadata.eventStatus).toLowerCase() || null,
            existing_event_depth: toTrimmedString(source.event_depth || metadata.event_depth || metadata.cluster_depth_snapshot).toLowerCase() || null,
            existing_event_is_unresolved: source.event_is_unresolved !== undefined
                ? toBoolean(source.event_is_unresolved)
                : toBoolean(metadata.event_is_unresolved || metadata.is_unresolved || metadata.unresolved),
            existing_event_manual_edited: source.existing_event_manual_edited !== undefined
                ? toBoolean(source.existing_event_manual_edited)
                : toBoolean(
                    readFirstDefined(metadata, ['existing_event_manual_edited', 'event_manual_edited'], false)
                ),
            existing_continuation_key: toTrimmedString(
                source.continuation_key
                || metadata.continuation_key
                || metadata.continuationKey
            ) || null,
            existing_event_anchor_memory_id: toTrimmedString(
                source.event_anchor_memory_id
                || metadata.event_anchor_memory_id
                || metadata.anchor_memory_id
                || metadata.anchorMemoryId
            ) || null,
            existing_event_detail_memory_ids: detailMemoryIds,
            existing_event_stability_signature: normalizeContinuationLookupKey(
                source.existing_event_stability_signature
                || source.event_stability_signature
                || readFirstDefined(metadata, ['existing_event_stability_signature', 'event_stability_signature'], '')
            ) || null,
            existing_event_stability_terms: existingStabilityTerms,
            existing_event_stability_source_message_ids: existingStabilitySourceMessageIds,
            existing_event_stability_time_start: existingStabilityTimeStart || null,
            existing_event_stability_time_end: existingStabilityTimeEnd || null
        });
    }

    /**
     * 事件状态标准化。
     */
    function normalizeEventStatus(value) {
        const normalized = toTrimmedString(value).toLowerCase();
        if (!normalized) return 'closed';
        if (normalized === 'unresolved' || normalized === 'pending' || normalized === 'active') return 'open';
        return EVENT_STATUS_VALUES.has(normalized) ? normalized : 'closed';
    }

    /**
     * 事件深度标准化。
     */
    function normalizeEventDepth(value) {
        const normalized = toTrimmedString(value).toLowerCase();
        if (!normalized) return 'low';
        if (normalized === 'shallow') return 'low';
        if (normalized === 'normal') return 'medium';
        if (normalized === 'deep') return 'high';
        return EVENT_DEPTH_VALUES.has(normalized) ? normalized : 'low';
    }

    /**
     * 深度标签转分值。
     */
    function mapEventDepthToScore(depth) {
        const safeDepth = normalizeEventDepth(depth);
        if (safeDepth === 'high') return 1;
        if (safeDepth === 'medium') return 0.68;
        return 0.36;
    }

    function createEventManualGuardComparableState(source) {
        const safeSource = source && typeof source === 'object' ? source : {};
        const depth = normalizeEventDepth(
            readFirstDefined(safeSource, ['depth', 'event_depth'], 'low')
        );
        const unresolved = safeSource.isUnresolved !== undefined
            ? toBoolean(safeSource.isUnresolved)
            : (
                safeSource.event_is_unresolved !== undefined
                    ? toBoolean(safeSource.event_is_unresolved)
                    : toBoolean(readFirstDefined(safeSource, ['is_unresolved'], false))
            );

        return {
            title: toTrimmedString(readFirstDefined(safeSource, ['title', 'event_title'], '')),
            summary: toTrimmedString(readFirstDefined(safeSource, ['summary', 'event_summary'], '')),
            status: normalizeEventStatus(readFirstDefined(safeSource, ['status', 'event_status'], 'closed')),
            depth: depth,
            unresolved: unresolved,
            continuationKey: toTrimmedString(readFirstDefined(safeSource, ['continuationKey', 'continuation_key'], '')),
            salienceScore: clampNumber(
                readFirstDefined(safeSource, ['salienceScore', 'event_salience_score', 'salience_score'], 0.4),
                0,
                1,
                0.4
            ),
            depthScore: clampNumber(
                readFirstDefined(safeSource, ['depthScore', 'event_depth_score', 'depth_score'], mapEventDepthToScore(depth)),
                0,
                1,
                mapEventDepthToScore(depth)
            )
        };
    }

    function buildEventManualGuardState(existingRecord, attemptedState, options) {
        const manualEdited = !!(existingRecord && existingRecord.manual_edited);
        if (!manualEdited) {
            return {
                applied: false,
                source: null,
                fields: [],
                blockedFields: [],
                entry: null
            };
        }

        const existing = createEventManualGuardComparableState(existingRecord);
        const attempted = createEventManualGuardComparableState(attemptedState);
        const blockedFields = [];

        if (existing.title !== attempted.title) blockedFields.push('title');
        if (existing.summary !== attempted.summary) blockedFields.push('summary');
        if (existing.status !== attempted.status) blockedFields.push('status');
        if (existing.depth !== attempted.depth) blockedFields.push('depth');
        if (existing.unresolved !== attempted.unresolved) blockedFields.push('unresolved');
        if (existing.continuationKey !== attempted.continuationKey) blockedFields.push('continuation');
        if (Math.abs(existing.salienceScore - attempted.salienceScore) > 0.0001) blockedFields.push('salience');
        if (Math.abs(existing.depthScore - attempted.depthScore) > 0.0001) blockedFields.push('depth_score');

        let entry = null;
        if (blockedFields.length > 0) {
            const optionSource = options && typeof options === 'object' ? options : {};
            entry = {
                changed_at: toTrimmedString(optionSource.changedAt) || new Date().toISOString(),
                source: toTrimmedString(optionSource.source) || 'digest_event_plan',
                guard_source: 'manual_edited_event',
                blocked_fields: blockedFields.slice(0, 8)
            };
            if (blockedFields.includes('title')) {
                entry.existing_title = clipMetadataHistoryText(existing.title, 80);
                entry.attempted_title = clipMetadataHistoryText(attempted.title, 80);
            }
            if (blockedFields.includes('summary')) {
                entry.existing_summary = clipMetadataHistoryText(existing.summary, 180);
                entry.attempted_summary = clipMetadataHistoryText(attempted.summary, 180);
            }
            if (blockedFields.includes('status')) {
                entry.existing_status = existing.status;
                entry.attempted_status = attempted.status;
            }
            if (blockedFields.includes('depth')) {
                entry.existing_depth = existing.depth;
                entry.attempted_depth = attempted.depth;
            }
            if (blockedFields.includes('unresolved')) {
                entry.existing_unresolved = existing.unresolved;
                entry.attempted_unresolved = attempted.unresolved;
            }
            if (blockedFields.includes('continuation')) {
                entry.existing_continuation_key = existing.continuationKey;
                entry.attempted_continuation_key = attempted.continuationKey;
            }
            if (blockedFields.includes('salience')) {
                entry.existing_salience_score = existing.salienceScore;
                entry.attempted_salience_score = attempted.salienceScore;
            }
            if (blockedFields.includes('depth_score')) {
                entry.existing_depth_score = existing.depthScore;
                entry.attempted_depth_score = attempted.depthScore;
            }

            const planReason = toTrimmedString(optionSource.planReason);
            const linkSource = toTrimmedString(optionSource.linkSource);
            const modelPlanId = toTrimmedString(optionSource.modelPlanId);
            if (planReason) entry.event_plan_reason = clipMetadataHistoryText(planReason, 120);
            if (linkSource) entry.link_source = linkSource;
            if (modelPlanId) entry.event_model_plan_id = modelPlanId;
        }

        return {
            applied: true,
            source: 'manual_edited_event',
            fields: MANUAL_EVENT_GUARD_FIELDS.slice(),
            blockedFields: blockedFields,
            entry: entry
        };
    }

    /**
     * 生成稳定但轻量的事件 ID。
     */
    function createStableEventId(charId, memoryIds, index) {
        const safeCharId = toTrimmedString(charId) || 'char';
        const ids = Array.isArray(memoryIds) ? memoryIds.map(toTrimmedString).filter(Boolean).sort() : [];
        const seed = `${safeCharId}|${ids.join(',')}|${Math.max(0, Math.floor(toFiniteNumber(index, 0)))}`;
        let hash = 0;
        for (let i = 0; i < seed.length; i += 1) {
            hash = (hash * 131 + seed.charCodeAt(i)) >>> 0;
        }
        return `evt_${safeCharId.slice(0, 12)}_${hash.toString(36)}`;
    }

    /**
     * 从环境读取 fetch 实现。
     */
    function getFetchImplementation() {
        if (typeof fetch === 'function') return fetch.bind(root);
        if (root && typeof root.fetch === 'function') return root.fetch.bind(root);
        return null;
    }

    /**
     * 从 Bridge 读取 Supabase 客户端实例。
     */
    function getSupabaseClient() {
        const bridge = root && root.IDIC_HippocampusBridge;
        if (!bridge || typeof bridge.getSupabaseClient !== 'function') return null;
        return bridge.getSupabaseClient();
    }

    /**
     * 将 API URL 规范化为 OpenAI 兼容 chat/completions 端点。
     */
    function normalizeChatCompletionsUrl(rawUrl) {
        const url = toTrimmedString(rawUrl).replace(/\/+$/, '');
        if (!url) return '';
        if (url.endsWith('/chat/completions')) return url;
        if (url.endsWith('/chat')) return `${url}/completions`;
        return `${url}/chat/completions`;
    }

    /**
     * 规范化认知消化模型配置。
     */
    function normalizeApiConfig(apiConfig) {
        const source = apiConfig && typeof apiConfig === 'object' ? apiConfig : {};
        return {
            apiUrl: toTrimmedString(source.apiUrl || source.url || source.baseUrl),
            apiKey: toTrimmedString(source.apiKey || source.key),
            model: toTrimmedString(source.model || source.modelName),
            temperature: clampNumber(source.temperature, 0, 2, 0.2),
            maxTokens: Math.max(256, Math.floor(toFiniteNumber(source.maxTokens || source.max_tokens, 2048))),
            headers: source.headers && typeof source.headers === 'object' ? source.headers : {},
            requestBody: source.requestBody && typeof source.requestBody === 'object' ? source.requestBody : {}
        };
    }

    /**
     * 从任意上游响应中提取模型正文。
     */
    function extractResponseText(payload) {
        if (typeof payload === 'string') return payload;
        if (!payload || typeof payload !== 'object') return '';

        if (typeof payload.output_text === 'string') return payload.output_text;
        if (typeof payload.content === 'string') return payload.content;
        if (typeof payload.text === 'string') return payload.text;

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

        if (Array.isArray(payload.candidates) && payload.candidates[0]) {
            const candidate = payload.candidates[0];
            const candidateText = extractResponseText(candidate);
            if (candidateText) return candidateText;
        }

        return '';
    }

    /**
     * 从模型文本中提取 JSON 片段。
     */
    function extractJsonCandidate(rawText) {
        const source = toTrimmedString(rawText);
        if (!source) return '';

        const fenced = source.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
        const unfenced = fenced ? toTrimmedString(fenced[1]) : source;
        if (!unfenced) return '';

        const objectMatch = unfenced.match(/\{[\s\S]*\}/);
        if (objectMatch) return objectMatch[0];

        return '';
    }

    /**
     * 判断当前是否应该触发认知消化。
     */
    function shouldTriggerDigestion(lastDigestTime, totalMessageCount) {
        const messageCount = Math.max(0, Math.floor(toFiniteNumber(totalMessageCount, 0)));
        let elapsedMs = Number.NEGATIVE_INFINITY;
        let hasDigestReference = false;

        if (lastDigestTime) {
            let timestamp = Number.NaN;
            if (lastDigestTime instanceof Date) {
                timestamp = lastDigestTime.getTime();
            } else {
                const numericStamp = Number(lastDigestTime);
                if (Number.isFinite(numericStamp) && numericStamp > 0) {
                    // 兼容毫秒/秒时间戳两种格式，避免 Date.parse(数字) 解析失败。
                    timestamp = numericStamp >= 1e11 ? numericStamp : (numericStamp >= 1e9 ? numericStamp * 1000 : Number.NaN);
                }
                if (!Number.isFinite(timestamp)) {
                    timestamp = Date.parse(lastDigestTime);
                }
            }
            if (Number.isFinite(timestamp)) {
                elapsedMs = Date.now() - timestamp;
                hasDigestReference = true;
            }
        }

        const byTime = !hasDigestReference || (Number.isFinite(elapsedMs) && elapsedMs >= DIGEST_INTERVAL_MS);
        const byCount = messageCount > DIGEST_MESSAGE_THRESHOLD;
        const shouldTrigger = byTime && byCount;
        const elapsedHours = Number.isFinite(elapsedMs) ? Math.floor(elapsedMs / (60 * 60 * 1000)) : null;

        console.log(
            `[海马体][消化] ✅ 触发检查 -> 距上次=${elapsedHours === null ? 'unknown' : `${elapsedHours}h`}, 累计=${messageCount}轮, 触发=${shouldTrigger}`
        );
        return shouldTrigger;
    }

    /**
     * 生成认知消化 Prompt。
     */
    function generateDigestPrompt(candidates, charName, char, existingEvents) {
        const safeName = toTrimmedString(charName) || '角色';
        const safeChar = char && typeof char === 'object' ? char : {};
        const currentRumination = clampNumber(
            safeChar.ruminationTendency !== undefined ? safeChar.ruminationTendency : safeChar.hippocampusRuminationTendency,
            0,
            1,
            0.3
        );
        const currentRecallStyle = safeChar.recallStyle !== undefined
            ? safeChar.recallStyle
            : (safeChar.hippocampusRecallStyle !== undefined ? safeChar.hippocampusRecallStyle : 'emotional');

        const rows = (Array.isArray(candidates) ? candidates : []).map(function mapCandidate(row) {
            const metadata = normalizeMetadata(row && row.metadata);
            const triggerKeywords = Array.isArray(metadata.trigger_keywords)
                ? metadata.trigger_keywords.map(toTrimmedString).filter(Boolean).slice(0, 6)
                : [];
            const sensoryAnchors = Array.isArray(metadata.sensory_anchors)
                ? metadata.sensory_anchors.map(toTrimmedString).filter(Boolean).slice(0, 6)
                : [];
            return {
                id: toTrimmedString(row.id),
                memory_layer: toTrimmedString(row.memory_layer || 'buffer'),
                content: toTrimmedString(row.content),
                valence: toFiniteNumber(row.valence, 0),
                arousal: toFiniteNumber(row.arousal, 0),
                importance: toFiniteNumber(row.importance, 5),
                activation_count: toFiniteNumber(row.activation_count, 0),
                resolved: !!row.resolved,
                created_at: row.created_at || null,
                trigger_keywords: triggerKeywords,
                sensory_anchors: sensoryAnchors,
                existing_event_id: toTrimmedString(row.existing_event_id || row.event_id || metadata.event_id || metadata.eventId || metadata.memory_event_id) || null,
                existing_event_title: toTrimmedString(row.existing_event_title || row.event_title || metadata.event_title || metadata.eventTitle) || null,
                existing_event_summary: toTrimmedString(row.existing_event_summary || row.event_summary || metadata.event_summary || metadata.eventSummary) || null,
                existing_event_status: toTrimmedString(row.existing_event_status || row.event_status || metadata.event_status || metadata.eventStatus).toLowerCase() || null,
                existing_event_depth: toTrimmedString(row.existing_event_depth || row.event_depth || metadata.event_depth || metadata.cluster_depth_snapshot).toLowerCase() || null,
                existing_event_is_unresolved: row.existing_event_is_unresolved !== undefined
                    ? !!row.existing_event_is_unresolved
                    : (row.event_is_unresolved !== undefined ? !!row.event_is_unresolved : false),
                existing_event_manual_edited: row.existing_event_manual_edited !== undefined
                    ? !!row.existing_event_manual_edited
                    : !!readFirstDefined(metadata, ['existing_event_manual_edited', 'event_manual_edited'], false),
                existing_continuation_key: toTrimmedString(
                    row.existing_continuation_key
                    || row.continuation_key
                    || metadata.continuation_key
                    || metadata.continuationKey
                ) || null,
                existing_event_anchor_memory_id: toTrimmedString(
                    row.existing_event_anchor_memory_id
                    || row.event_anchor_memory_id
                    || metadata.event_anchor_memory_id
                    || metadata.anchor_memory_id
                    || metadata.anchorMemoryId
                ) || null,
                existing_event_detail_memory_ids: Array.isArray(row.existing_event_detail_memory_ids)
                    ? row.existing_event_detail_memory_ids.slice(0, 8)
                    : (Array.isArray(row.event_detail_memory_ids) ? row.event_detail_memory_ids.slice(0, 8) : [])
            };
        }).filter(function filterCandidate(item) {
            return !!item.id && !!item.content;
        }).slice(0, 80);
        const eventRows = (Array.isArray(existingEvents) ? existingEvents : []).map(function mapEvent(row) {
            const normalized = normalizeExistingEventRecord(row);
            if (!normalized) return null;
            return {
                id: normalized.id,
                title: normalized.title,
                summary: normalized.summary,
                status: normalized.status,
                depth: normalized.depth,
                is_unresolved: normalized.is_unresolved,
                continuation_key: normalized.continuation_key,
                anchor_memory_id: normalized.anchor_memory_id,
                detail_memory_ids: normalized.detail_memory_ids.slice(0, 8),
                memory_ids: normalized.memory_ids.slice(0, 12),
                manual_edited: normalized.manual_edited,
                manual_note: normalized.manual_note
            };
        }).filter(Boolean).slice(0, 30);

        return [
            `你是角色“${safeName}”的认知消化器。请审视记忆并判断是否需要迁移层级、微调特质、以及整理记忆事件。`,
            '你必须只输出 JSON 对象，不要输出解释，不要输出代码块。',
            '允许输出字段：migrations, ruminationTendency, recallStyle, attachmentStyle, selfInsight, digestSummary, eventChanges, fragmentChanges, eventPlans。',
            'migrations 的每项格式：{ "id": "...", "newLayer": "buffer|core|cortex|shadow|wish", "reason": "简短原因" }。',
            'eventPlans 的每项格式：{ "title": "...", "summary": "...", "status": "open|closed", "depth": "low|medium|high", "isUnresolved": true/false, "salienceScore": 0~1, "continuationKey": "...", "memoryIds": ["id1","id2"], "anchorMemoryId": "id1", "detailMemoryIds": ["id1","id2"], "reason": "简短说明" }。',
            'eventPlans 只允许引用给定候选记忆 id，不允许虚构不存在的 id。',
            'salienceScore 要优先反映情绪浓度与记忆刺痛感/温度/反差感，importance 只是辅助，不要机械按“人生大事”打高分。',
            '如果一段经历包含明显的委屈、愤怒、温暖、惊喜、失望、反差，即使不是宏大事件，也可以有较高 salienceScore。',
            '只有真的会记住很多细节、后续容易被整段带回来的事件，才给 high depth 或接近 flashbulb 的倾向。',
            'ruminationTendency 范围必须在 0 到 1。',
            'recallStyle 可以是字符串（emotional/narrative/analytical/imagery）或比例对象。',
            'attachmentStyle 只能是 secure/anxious/avoidant/disorganized；只有当长期关系模式确实改变时才输出。',
            'selfInsight 是一句不超过 60 字的中文自我认知，没有则返回空字符串。',
            'digestSummary / eventChanges / fragmentChanges 都要简短、可给用户直接读懂。',
            '',
            `当前 ruminationTendency: ${currentRumination.toFixed(2)}`,
            `当前 recallStyle: ${typeof currentRecallStyle === 'string' ? currentRecallStyle : JSON.stringify(currentRecallStyle)}`,
            `当前 attachmentStyle: ${toTrimmedString(safeChar.attachmentStyle || safeChar.hippocampusAttachmentStyle || 'secure')}`,
            '',
            '候选记忆（JSON）：',
            JSON.stringify(rows)
        ].join('\n');
    }

    /**
     * 在基础 digest prompt 之上补充已有事件记录，帮助模型沿用既有事件并减少重复建簇。
     */
    function generateDigestPromptWithEvents(candidates, charName, char, existingEvents) {
        const basePrompt = generateDigestPrompt(candidates, charName, char, existingEvents);
        const eventRows = (Array.isArray(existingEvents) ? existingEvents : []).map(function mapEvent(row) {
            const normalized = normalizeExistingEventRecord(row);
            if (!normalized) return null;
            return {
                id: normalized.id,
                title: normalized.title,
                summary: normalized.summary,
                status: normalized.status,
                depth: normalized.depth,
                is_unresolved: normalized.is_unresolved,
                continuation_key: normalized.continuation_key,
                anchor_memory_id: normalized.anchor_memory_id,
                detail_memory_ids: normalized.detail_memory_ids.slice(0, 8),
                memory_ids: normalized.memory_ids.slice(0, 12),
                manual_edited: normalized.manual_edited,
                manual_note: normalized.manual_note
            };
        }).filter(Boolean).slice(0, 30);

        return [
            basePrompt,
            '',
            'If a candidate already belongs to an existing event, prefer reusing that existing event id in eventPlans.id.',
            'If an existing event is manual_edited=true, keep its title and summary stable unless the current evidence clearly requires a structural change.',
            '',
            '已有记忆事件（JSON）：',
            JSON.stringify(eventRows)
        ].join('\n');
    }

    /**
     * 规范化 digest 返回的 eventPlans 字段。
     */
    /**
     * 拉取与本轮 digest 候选相关的真实事件记录，供 LLM 更新已有事件和保护人工编辑使用。
     */
    async function fetchExistingEventRecords(supabase, userId, charId, candidates, explicitEventIds) {
        const safeUserId = toTrimmedString(userId);
        const safeCharId = toTrimmedString(charId);
        if (!supabase || !safeUserId || !safeCharId) {
            return {
                list: [],
                map: new Map()
            };
        }

        const candidateList = Array.isArray(candidates) ? candidates : [];
        const candidateWindowEndTs = candidateList.reduce(function pickLatestTs(maxValue, item) {
            const ts = getMemoryTimestamp(item);
            return Number.isFinite(ts) && ts > maxValue ? ts : maxValue;
        }, Number.NEGATIVE_INFINITY);
        const candidateIdSet = new Set(
            candidateList
                .map(function mapCandidateId(item) {
                    return toTrimmedString(item && item.id);
                })
                .filter(Boolean)
        );
        const eventIdSet = new Set(
            (Array.isArray(explicitEventIds) ? explicitEventIds : [])
                .map(toTrimmedString)
                .filter(Boolean)
        );
        candidateList.forEach(function collectExistingEventId(item) {
            const eventId = toTrimmedString(item && item.existing_event_id);
            if (eventId) eventIdSet.add(eventId);
        });

        if (candidateIdSet.size === 0 && eventIdSet.size === 0) {
            return {
                list: [],
                map: new Map()
            };
        }

        const selectFields = 'id,user_id,char_id,room_id,context_scope,title,summary,status,depth,event_date,fragment_count,is_unresolved,continuation_key,salience_score,depth_score,anchor_memory_id,memory_ids,detail_memory_ids,start_at,end_at,last_related_at,manual_edited,manual_note,metadata,updated_at';
        const tasks = [];
        const explicitIds = Array.from(eventIdSet).slice(0, 60);
        if (explicitIds.length > 0) {
            tasks.push(
                supabase
                    .from('hippocampus_memory_events')
                    .select(selectFields)
                    .eq('user_id', safeUserId)
                    .eq('char_id', safeCharId)
                    .in('id', explicitIds)
            );
        }
        tasks.push(
            supabase
                .from('hippocampus_memory_events')
                .select(selectFields)
                .eq('user_id', safeUserId)
                .eq('char_id', safeCharId)
                .order('updated_at', { ascending: false })
                .limit(Math.max(24, Math.min(120, Math.max(explicitIds.length * 3, candidateIdSet.size * 2))))
        );

        try {
            const settled = await Promise.allSettled(tasks);
            const eventMap = new Map();
            const carryRecords = [];

            settled.forEach(function consumeResult(item) {
                if (item.status !== 'fulfilled') {
                    console.warn('[海马体][消化] ⚠️ 事件表读取失败，已跳过。', item.reason && item.reason.message ? item.reason.message : item.reason);
                    return;
                }
                if (item.value && item.value.error) {
                    console.warn('[海马体][消化] ⚠️ 事件表读取失败，已跳过。', item.value.error.message || item.value.error);
                    return;
                }

                const rows = item.value && Array.isArray(item.value.data) ? item.value.data : [];
                rows.forEach(function collectEvent(row) {
                    const normalized = normalizeExistingEventRecord(row);
                    if (!normalized) return;
                    if (isDigestRetiredEventRecord(normalized)) return;
                    const intersectsCandidate = normalized.memory_ids.some(function hasMember(id) {
                        return candidateIdSet.has(id);
                    }) || normalized.detail_memory_ids.some(function hasDetail(id) {
                        return candidateIdSet.has(id);
                    }) || candidateIdSet.has(normalized.anchor_memory_id);
                    if (intersectsCandidate || eventIdSet.has(normalized.id)) {
                        eventMap.set(normalized.id, normalized);
                        return;
                    }

                    const carryScore = scoreDigestCarryExistingEvent(normalized, candidateWindowEndTs);
                    if (carryScore >= 3.6) {
                        carryRecords.push({
                            record: normalized,
                            score: carryScore
                        });
                    }
                });
            });

            carryRecords
                .sort(function sortCarry(left, right) {
                    if (right.score !== left.score) return right.score - left.score;

                    const leftManual = left.record && left.record.manual_edited ? 1 : 0;
                    const rightManual = right.record && right.record.manual_edited ? 1 : 0;
                    if (rightManual !== leftManual) return rightManual - leftManual;

                    const leftTs = getEventRecordTimestamp(left.record);
                    const rightTs = getEventRecordTimestamp(right.record);
                    if (Number.isFinite(rightTs) && Number.isFinite(leftTs) && rightTs !== leftTs) {
                        return rightTs - leftTs;
                    }
                    return toTrimmedString(left.record && left.record.id)
                        .localeCompare(toTrimmedString(right.record && right.record.id));
                })
                .slice(0, 16)
                .forEach(function keepCarry(item) {
                    const record = item && item.record;
                    const eventId = toTrimmedString(record && record.id);
                    if (!record || !eventId || eventMap.has(eventId)) return;
                    eventMap.set(eventId, record);
                });

            const list = Array.from(eventMap.values());
            if (list.length > 0) {
                console.log(`[海马体][消化] ✅ 命中已有事件 ${list.length} 个，已纳入本轮 digest 参考。`);
            }
            return {
                list: list,
                map: eventMap
            };
        } catch (error) {
            console.warn('[海马体][消化] ⚠️ 事件表读取失败，已回退为无历史事件模式。', error && error.message ? error.message : error);
            return {
                list: [],
                map: new Map()
            };
        }
    }

    function normalizeDigestEventPlans(value) {
        let source = value;
        if (!source || (typeof source !== 'object' && !Array.isArray(source))) return [];
        if (!Array.isArray(source)) {
            if (Array.isArray(source.eventPlans)) {
                source = source.eventPlans;
            } else if (Array.isArray(source.events)) {
                source = source.events;
            } else {
                source = [];
            }
        }

        return source.map(function mapPlan(item) {
            const memoryIdsSource = Array.isArray(item && (item.memoryIds || item.memory_ids))
                ? (item.memoryIds || item.memory_ids)
                : Array.isArray(item && item.ids)
                    ? item.ids
                    : Array.isArray(item && item.members)
                        ? item.members
                        : [];
            const memoryIds = memoryIdsSource
                .map(toTrimmedString)
                .filter(Boolean);
            if (memoryIds.length === 0) return null;

            const detailMemoryIds = Array.isArray(item && (item.detailMemoryIds || item.detail_memory_ids))
                ? (item.detailMemoryIds || item.detail_memory_ids).map(toTrimmedString).filter(Boolean)
                : [];
            const anchorMemoryId = toTrimmedString(
                item && (
                    item.anchorMemoryId
                    || item.anchor_memory_id
                    || item.anchorId
                    || item.anchor_id
                )
            ) || memoryIds[0];
            const status = normalizeEventStatus(item && item.status);
            const isUnresolved = item && (item.isUnresolved !== undefined || item.is_unresolved !== undefined)
                ? toBoolean(item.isUnresolved !== undefined ? item.isUnresolved : item.is_unresolved)
                : status === 'open';

            return {
                id: toTrimmedString(item && item.id) || '',
                title: toTrimmedString(item && item.title),
                summary: toTrimmedString(item && item.summary),
                status: status,
                depth: normalizeEventDepth(item && item.depth),
                salienceScore: clampNumber(item && (item.salienceScore !== undefined ? item.salienceScore : item.salience_score), 0, 1, 0.4),
                isUnresolved: isUnresolved,
                continuationKey: toTrimmedString(item && (item.continuationKey || item.continuation_key)),
                memoryIds: memoryIds,
                anchorMemoryId: anchorMemoryId,
                detailMemoryIds: detailMemoryIds,
                reason: toTrimmedString(item && item.reason)
            };
        }).filter(Boolean);
    }

    function normalizeContinuationLookupKey(value) {
        return toTrimmedString(value).toLowerCase();
    }

    function buildDigestCandidateMap(candidates) {
        const map = new Map();
        (Array.isArray(candidates) ? candidates : []).forEach(function putCandidate(item) {
            const id = toTrimmedString(item && item.id);
            if (!id) return;
            map.set(id, item);
        });
        return map;
    }

    function normalizeExistingEventContext(existingEventRecords) {
        const list = [];
        const pushRecord = function pushRecord(row) {
            const normalized = normalizeExistingEventRecord(row);
            if (!normalized) return;
            list.push(normalized);
        };

        if (existingEventRecords && Array.isArray(existingEventRecords.list)) {
            existingEventRecords.list.forEach(pushRecord);
        } else if (Array.isArray(existingEventRecords)) {
            existingEventRecords.forEach(pushRecord);
        } else if (existingEventRecords && existingEventRecords.map instanceof Map) {
            existingEventRecords.map.forEach(pushRecord);
        }

        const map = new Map();
        list.forEach(function putRecord(record) {
            if (!record || !record.id || map.has(record.id)) return;
            map.set(record.id, record);
        });

        const continuationMap = new Map();
        list.forEach(function putContinuation(record) {
            const key = normalizeContinuationLookupKey(record && record.continuation_key);
            if (!key) return;

            const existing = continuationMap.get(key);
            if (!existing) {
                continuationMap.set(key, record);
                return;
            }

            const existingScore = (existing.is_unresolved ? 3 : 0)
                + (existing.manual_edited ? 2 : 0)
                + clampNumber(existing.salience_score, 0, 1, 0);
            const nextScore = (record.is_unresolved ? 3 : 0)
                + (record.manual_edited ? 2 : 0)
                + clampNumber(record.salience_score, 0, 1, 0);
            if (nextScore > existingScore) {
                continuationMap.set(key, record);
            }
        });

        return {
            list: list,
            map: map,
            continuationMap: continuationMap
        };
    }

    function pickDominantCountKey(countMap) {
        let pickedKey = '';
        let pickedCount = 0;
        countMap.forEach(function pickValue(count, key) {
            const safeKey = toTrimmedString(key);
            if (!safeKey || count < pickedCount) return;
            if (count === pickedCount && pickedKey) return;
            pickedKey = safeKey;
            pickedCount = count;
        });
        return pickedKey;
    }

    function collectDominantDigestOwnershipTarget(memoryIds, ownershipMap, currentEventId) {
        const counts = new Map();
        const safeCurrentEventId = toTrimmedString(currentEventId);
        (Array.isArray(memoryIds) ? memoryIds : []).forEach(function countOwner(value) {
            const memoryId = toTrimmedString(value);
            if (!memoryId) return;
            const ownerEventId = ownershipMap instanceof Map ? toTrimmedString(ownershipMap.get(memoryId)) : '';
            if (!ownerEventId || ownerEventId === safeCurrentEventId) return;
            counts.set(ownerEventId, (counts.get(ownerEventId) || 0) + 1);
        });
        return pickDominantCountKey(counts);
    }

    function collectCandidateValueCounts(memoryIds, candidateMap, fieldName) {
        const counts = new Map();
        (Array.isArray(memoryIds) ? memoryIds : []).forEach(function countValue(memoryId) {
            const safeId = toTrimmedString(memoryId);
            if (!safeId) return;
            const value = toTrimmedString(candidateMap.get(safeId) && candidateMap.get(safeId)[fieldName]);
            if (!value) return;
            counts.set(value, (counts.get(value) || 0) + 1);
        });
        return counts;
    }

    function resolveExistingEventLink(plan, candidateMap, existingEventRecords) {
        const normalizedPlan = plan && typeof plan === 'object' ? plan : {};
        const existingContext = normalizeExistingEventContext(existingEventRecords);
        const memoryIds = Array.isArray(normalizedPlan.memoryIds) ? normalizedPlan.memoryIds : [];
        const explicitPlanId = toTrimmedString(normalizedPlan.id);
        const inheritedEventId = pickDominantCountKey(
            collectCandidateValueCounts(memoryIds, candidateMap, 'existing_event_id')
        );
        const inheritedContinuationKey = pickDominantCountKey(
            collectCandidateValueCounts(memoryIds, candidateMap, 'existing_continuation_key')
        );

        let eventId = explicitPlanId || inheritedEventId || '';
        let existingRecord = eventId ? (existingContext.map.get(eventId) || null) : null;
        const continuationCandidates = [
            toTrimmedString(normalizedPlan.continuationKey),
            inheritedContinuationKey,
            toTrimmedString(existingRecord && existingRecord.continuation_key)
        ];
        const planReference = deriveDigestPlanReference(
            Object.assign({}, normalizedPlan, {
                memoryIds: memoryIds
            }),
            candidateMap
        );
        const candidateMatches = new Map();

        const addCandidateMatch = function addCandidateMatch(record, tag) {
            const normalizedRecord = normalizeExistingEventRecord(record);
            const safeTag = toTrimmedString(tag);
            if (!normalizedRecord || !normalizedRecord.id) return;

            const existingMatch = candidateMatches.get(normalizedRecord.id);
            if (existingMatch) {
                if (safeTag) existingMatch.tags.add(safeTag);
                return;
            }

            candidateMatches.set(normalizedRecord.id, {
                record: normalizedRecord,
                tags: new Set(safeTag ? [safeTag] : [])
            });
        };

        if (explicitPlanId) {
            addCandidateMatch(existingContext.map.get(explicitPlanId) || null, 'explicit_id');
        }
        if (inheritedEventId) {
            addCandidateMatch(existingContext.map.get(inheritedEventId) || null, 'inherited_id');
        }

        for (let i = 0; i < continuationCandidates.length; i += 1) {
            const key = normalizeContinuationLookupKey(continuationCandidates[i]);
            if (!key) continue;
            addCandidateMatch(existingContext.continuationMap.get(key) || null, 'continuation');
        }

        existingContext.list.forEach(function addFuzzyCandidate(record) {
            addCandidateMatch(record, 'fuzzy');
        });

        let bestMatch = null;
        candidateMatches.forEach(function evaluateCandidate(match) {
            const scored = scoreExistingEventLinkCandidate(
                planReference,
                match.record,
                match.tags
            );
            if (!scored || !scored.usable) return;
            bestMatch = pickPreferredExistingEventLinkMatch(bestMatch, scored);
        });

        if (bestMatch && bestMatch.record) {
            eventId = toTrimmedString(bestMatch.record.id) || eventId;
            existingRecord = bestMatch.record;
        }

        return {
            eventId: eventId,
            existingRecord: existingRecord,
            linkMeta: buildDigestEventLinkMeta(bestMatch),
            continuationKey: toTrimmedString(normalizedPlan.continuationKey)
                || toTrimmedString(existingRecord && existingRecord.continuation_key)
                || inheritedContinuationKey
                || ''
        };
    }

    function pickDigestEventFlashbulbMemoryIds(memberRows, preferredIds, maxCount) {
        const preferredSet = new Set(
            (Array.isArray(preferredIds) ? preferredIds : [])
                .map(toTrimmedString)
                .filter(Boolean)
        );
        const limit = Number.isFinite(maxCount) ? Math.max(1, Math.floor(maxCount)) : 3;
        const scored = (Array.isArray(memberRows) ? memberRows : []).map(function scoreMember(row) {
            const memoryId = toTrimmedString(row && (row.id || row.memory_id));
            if (!memoryId) return null;

            const metadata = normalizeMetadata(row && row.metadata);
            let score = 0;
            score += clampNumber(row && row.arousal, 0, 1, 0) * 0.40;
            score += (clampNumber(row && row.importance, 1, 10, 5) / 10) * 0.34;
            score += Math.abs(clampNumber(row && row.valence, -1, 1, 0)) * 0.14;
            score += clampNumber(Math.log1p(Math.max(0, toFiniteNumber(row && row.activation_count, 0))) / Math.log(6), 0, 1, 0) * 0.08;
            if (preferredSet.has(memoryId)) score += 0.22;
            if (toBoolean(
                (row && row.is_flashbulb)
                || metadata.is_flashbulb
                || metadata.event_is_flashbulb
            )) {
                score += 0.40;
            }

            return {
                id: memoryId,
                score: score
            };
        }).filter(Boolean);

        return scored
            .sort(function sortByScore(left, right) {
                return right.score - left.score;
            })
            .slice(0, limit)
            .map(function mapResult(item) {
                return item.id;
            });
    }

    function deriveDigestEventFlashbulbState(memberRows, existingRecord, options) {
        const safeOptions = options && typeof options === 'object' ? options : {};
        const signalProfile = safeOptions.signalProfile && typeof safeOptions.signalProfile === 'object'
            ? safeOptions.signalProfile
            : deriveDigestEventSignalProfile(memberRows, {
                existingRecord: existingRecord,
                depth: safeOptions.depth,
                unresolved: safeOptions.unresolved
            });
        const fragmentIds = [];
        let fragmentFlashbulb = !!signalProfile.fragmentFlashbulb;

        (Array.isArray(memberRows) ? memberRows : []).forEach(function collectFlashbulb(row) {
            if (!row || typeof row !== 'object') return;
            const metadata = normalizeMetadata(row.metadata);
            const isFlashbulb = toBoolean(
                row.is_flashbulb
                || metadata.is_flashbulb
                || metadata.event_is_flashbulb
            );
            if (!isFlashbulb) return;
            fragmentFlashbulb = true;
            const memoryId = toTrimmedString(row.id || row.memory_id);
            if (memoryId) fragmentIds.push(memoryId);
        });

        const existingMetadata = normalizeMetadata(existingRecord && existingRecord.metadata);
        const persistedIds = (
            Array.isArray(existingRecord && existingRecord.event_flashbulb_memory_ids)
                ? existingRecord.event_flashbulb_memory_ids
                : (Array.isArray(existingMetadata.event_flashbulb_memory_ids)
                    ? existingMetadata.event_flashbulb_memory_ids
                    : [])
        ).map(toTrimmedString).filter(Boolean);
        const persistedFlag = toBoolean(
            (existingRecord && existingRecord.event_is_flashbulb)
            || existingMetadata.event_is_flashbulb
            || existingMetadata.is_flashbulb
        );
        const heuristicFlag = signalProfile.salienceScore >= 0.86
            && signalProfile.emotionScore >= 0.74
            && (
                signalProfile.isUnresolved
                || signalProfile.depth === 'high'
                || signalProfile.maxImportance >= 8.8
                || (signalProfile.contrastScore >= 0.72 && signalProfile.detailScore >= 0.52)
            );
        const preferredIds = mergeUniqueIds(
            [safeOptions.anchorMemoryId],
            Array.isArray(safeOptions.detailMemoryIds) ? safeOptions.detailMemoryIds : [],
            8
        );
        const promotedIds = (persistedFlag || heuristicFlag || fragmentFlashbulb)
            ? pickDigestEventFlashbulbMemoryIds(memberRows, preferredIds, 4)
            : [];
        const mergedIds = mergeUniqueIds(
            mergeUniqueIds(fragmentIds, persistedIds, 24),
            promotedIds,
            24
        );
        const reasonTags = [];
        if (persistedFlag) reasonTags.push('existing_flashbulb');
        if (fragmentFlashbulb) reasonTags.push('fragment_flashbulb');
        if (heuristicFlag) reasonTags.push('promoted_flashbulb');
        if (signalProfile.emotionScore >= 0.80) reasonTags.push('emotionally_intense');
        if (signalProfile.contrastScore >= 0.62) reasonTags.push('contrast');
        if (signalProfile.significanceScore >= 0.74) reasonTags.push('high_significance');
        if (signalProfile.isUnresolved) reasonTags.push('open_loop');
        if (signalProfile.depth === 'high') reasonTags.push('high_depth');
        if (signalProfile.detailScore >= 0.60) reasonTags.push('vivid_details');

        return {
            isFlashbulb: fragmentFlashbulb || persistedFlag || heuristicFlag || mergedIds.length > 0,
            memoryIds: mergedIds,
            score: roundDigestSignalValue(
                Math.max(
                    signalProfile.salienceScore,
                    fragmentFlashbulb || persistedFlag || heuristicFlag || mergedIds.length > 0 ? 0.86 : 0
                ),
                4
            ),
            reasonTags: Array.from(new Set(reasonTags)).slice(0, 8)
        };
    }

    function scoreDigestEventAssignment(memoryRow, patch) {
        if (!patch || typeof patch !== 'object') return Number.NEGATIVE_INFINITY;
        const row = memoryRow && typeof memoryRow === 'object' ? memoryRow : {};
        const metadata = normalizeMetadata(row.metadata);
        const existingEventId = toTrimmedString(
            row.existing_event_id
            || row.event_id
            || metadata.event_id
            || metadata.memory_event_id
        );
        const existingContinuationKey = normalizeContinuationLookupKey(
            row.existing_continuation_key
            || row.continuation_key
            || metadata.continuation_key
            || metadata.continuationKey
        );
        const patchEventId = toTrimmedString(patch.event_id);
        const patchContinuationKey = normalizeContinuationLookupKey(patch.continuation_key);
        const existingStabilitySignature = normalizeContinuationLookupKey(
            readFirstDefined(metadata, ['existing_event_stability_signature', 'event_stability_signature'], '')
        );
        const patchStabilitySignature = normalizeContinuationLookupKey(
            patch.event_stability_signature
        );
        const existingStabilityTerms = normalizeEvidenceAliases(
            row.existing_event_stability_terms
            || 
            readFirstDefined(metadata, ['existing_event_stability_terms', 'event_stability_terms'], []),
            12
        );
        const patchStabilityTerms = normalizeEvidenceAliases(
            patch.event_stability_terms,
            12
        );
        const stabilityOverlap = computeDigestAliasOverlapStats(existingStabilityTerms, patchStabilityTerms);
        const existingStabilitySourceMessageIds = normalizeEvidenceMessageIds(
            row.existing_event_stability_source_message_ids
            || readFirstDefined(metadata, ['existing_event_stability_source_message_ids', 'event_stability_source_message_ids', 'source_message_ids'], []),
            24
        );
        const patchStabilitySourceMessageIds = normalizeEvidenceMessageIds(
            patch.event_stability_source_message_ids,
            24
        );
        const stabilitySourceOverlap = computeDigestIdOverlapStats(
            existingStabilitySourceMessageIds,
            patchStabilitySourceMessageIds
        );
        const stabilityTimeWindow = computeDigestTimeWindowStats(
            row.existing_event_stability_time_start
            || readFirstDefined(metadata, ['existing_event_stability_time_start', 'event_stability_time_start', 'source_time_start'], ''),
            row.existing_event_stability_time_end
            || readFirstDefined(metadata, ['existing_event_stability_time_end', 'event_stability_time_end', 'source_time_end'], ''),
            patch.event_stability_time_start,
            patch.event_stability_time_end
        );
        const existingEventManualEdited = row.existing_event_manual_edited !== undefined
            ? toBoolean(row.existing_event_manual_edited)
            : toBoolean(
                readFirstDefined(metadata, ['existing_event_manual_edited', 'event_manual_edited'], false)
            );
        const patchLinkSource = toTrimmedString(patch.event_link_source || patch.link_source).toLowerCase();
        const patchOverlapCount = Math.max(0, Math.floor(toFiniteNumber(patch.event_link_overlap_count, 0)));

        let score = 0;
        if (existingEventId && patchEventId && patchEventId === existingEventId) score += 6;
        if (existingContinuationKey && patchContinuationKey && patchContinuationKey === existingContinuationKey) score += 3;
        if (existingStabilitySignature && patchStabilitySignature && patchStabilitySignature === existingStabilitySignature) {
            score += 2.8;
        }
        score += stabilityOverlap.count * 0.9;
        score += stabilityOverlap.leftRatio * 1.4;
        score += stabilitySourceOverlap.count * 1.2;
        score += stabilitySourceOverlap.leftRatio * 1.6;
        score += stabilitySourceOverlap.rightRatio * 1.1;
        if (stabilityTimeWindow.overlapHours > 0) {
            score += Math.min(1.6, 0.5 + (stabilityTimeWindow.overlapHours / 12));
        } else if (stabilityTimeWindow.distanceHours <= 24) {
            score += 0.4;
        }
        if (existingEventManualEdited) {
            if (existingEventId && patchEventId && patchEventId === existingEventId) {
                score += 4.6;
            } else if (existingEventId && patchEventId && patchEventId !== existingEventId) {
                score -= 5.4;
                if (patchLinkSource === 'explicit_id' || patchLinkSource === 'inherited_id' || patchLinkSource === 'continuation') {
                    score += 2.4;
                } else if (patchLinkSource === 'fuzzy_structure') {
                    score += 1.2;
                }
                if (existingContinuationKey && patchContinuationKey && patchContinuationKey === existingContinuationKey) {
                    score += 1.8;
                }
                if (patchOverlapCount >= 2) {
                    score += 1.4;
                }
                if (existingStabilitySignature && patchStabilitySignature && patchStabilitySignature === existingStabilitySignature) {
                    score += 1.4;
                }
                if (stabilitySourceOverlap.count >= 1 || stabilityTimeWindow.overlapHours > 0) {
                    score += 1.3;
                }
            }
        }
        if (toBoolean(patch.event_is_unresolved)) score += 0.6;
        if (toBoolean(patch.event_is_flashbulb)) score += 0.35;
        score += clampNumber(patch.event_depth_score, 0, 1, mapEventDepthToScore(patch.event_depth));
        score += clampNumber(patch.event_salience_score, 0, 1, 0.4);
        score += Math.min(0.6, Math.max(0, toFiniteNumber(patch.event_fragment_count, 0) / 16));
        return score;
    }

    function pickPreferredDigestEventPatch(memoryId, currentPatch, nextPatch, candidateMap) {
        if (!currentPatch) return nextPatch;
        if (!nextPatch) return currentPatch;

        const candidateRow = candidateMap instanceof Map
            ? (candidateMap.get(toTrimmedString(memoryId)) || null)
            : null;
        const currentScore = scoreDigestEventAssignment(candidateRow, currentPatch);
        const nextScore = scoreDigestEventAssignment(candidateRow, nextPatch);
        if (nextScore > currentScore) return nextPatch;
        if (currentScore > nextScore) return currentPatch;

        const currentTs = Date.parse(toTrimmedString(currentPatch.event_date));
        const nextTs = Date.parse(toTrimmedString(nextPatch.event_date));
        if (Number.isFinite(nextTs) && (!Number.isFinite(currentTs) || nextTs > currentTs)) {
            return nextPatch;
        }
        if (Number.isFinite(currentTs) && (!Number.isFinite(nextTs) || currentTs > nextTs)) {
            return currentPatch;
        }

        const currentEventId = toTrimmedString(currentPatch.event_id);
        const nextEventId = toTrimmedString(nextPatch.event_id);
        if (currentEventId && nextEventId) {
            return currentEventId <= nextEventId ? currentPatch : nextPatch;
        }
        return currentEventId ? currentPatch : nextPatch;
    }

    function filterEventIdsByIncomingOwnership(memoryIds, currentEventId, ownershipMap, maxCount) {
        const result = [];
        const seen = new Set();
        const safeEventId = toTrimmedString(currentEventId);
        const limit = Number.isFinite(maxCount) ? Math.max(0, Math.floor(maxCount)) : Number.POSITIVE_INFINITY;

        (Array.isArray(memoryIds) ? memoryIds : []).forEach(function filterId(value) {
            const memoryId = toTrimmedString(value);
            if (!memoryId || seen.has(memoryId)) return;
            const ownerEventId = ownershipMap instanceof Map ? toTrimmedString(ownershipMap.get(memoryId)) : '';
            if (ownerEventId && safeEventId && ownerEventId !== safeEventId) return;
            seen.add(memoryId);
            result.push(memoryId);
        });

        return result.slice(0, limit);
    }

    function buildRetiredDigestEventRows(existingEventMap, touchedExistingEventIds, ownershipMap, incomingEventIds, options) {
        const existingMap = existingEventMap instanceof Map ? existingEventMap : new Map();
        const incomingSet = incomingEventIds instanceof Set
            ? incomingEventIds
            : new Set(Array.isArray(incomingEventIds) ? incomingEventIds.map(toTrimmedString).filter(Boolean) : []);
        const touchedIds = Array.isArray(touchedExistingEventIds)
            ? touchedExistingEventIds.map(toTrimmedString).filter(Boolean)
            : Array.from(touchedExistingEventIds instanceof Set ? touchedExistingEventIds : []).map(toTrimmedString).filter(Boolean);
        const optionSource = options && typeof options === 'object' ? options : {};
        const safeUserId = toTrimmedString(optionSource.userId);
        const safeCharId = toTrimmedString(optionSource.charId);
        const retiredAt = toTrimmedString(optionSource.retiredAt) || new Date().toISOString();
        const retiredRows = [];
        const seen = new Set();

        touchedIds.forEach(function buildRetiredRow(eventId) {
            const safeEventId = toTrimmedString(eventId);
            if (!safeEventId || seen.has(safeEventId) || incomingSet.has(safeEventId)) return;
            seen.add(safeEventId);

            const existingRecord = normalizeExistingEventRecord(existingMap.get(safeEventId) || null);
            if (!existingRecord) return;
            if (existingRecord.manual_edited) return;
            if (isDigestRetiredEventRecord(existingRecord)) return;

            const remainingMemberIds = filterEventIdsByIncomingOwnership(
                existingRecord.memory_ids,
                safeEventId,
                ownershipMap,
                96
            );
            if (remainingMemberIds.length > 0) return;

            const supersededByEventId = collectDominantDigestOwnershipTarget(
                existingRecord.memory_ids,
                ownershipMap,
                safeEventId
            ) || collectDominantDigestOwnershipTarget(
                existingRecord.detail_memory_ids,
                ownershipMap,
                safeEventId
            );
            const previousContinuationKey = toTrimmedString(existingRecord.continuation_key) || null;
            const previousAnchorMemoryId = toTrimmedString(existingRecord.anchor_memory_id) || null;
            let nextMetadata = Object.assign(
                {},
                normalizeMetadata(existingRecord.metadata),
                {
                    source: 'digest_event_plan',
                    event_is_flashbulb: false,
                    event_flashbulb_memory_ids: [],
                    digest_retired: true,
                    digest_retired_at: retiredAt,
                    digest_retired_reason: supersededByEventId ? 'merged_into_other_event' : 'no_remaining_members',
                    digest_retired_superseded_by_event_id: supersededByEventId || null,
                    digest_retired_previous_fragment_count: Math.max(0, Math.floor(toFiniteNumber(existingRecord.fragment_count, 0))),
                    digest_retired_previous_memory_ids: Array.isArray(existingRecord.memory_ids)
                        ? existingRecord.memory_ids.slice(0, 24)
                        : [],
                    digest_retired_previous_detail_memory_ids: Array.isArray(existingRecord.detail_memory_ids)
                        ? existingRecord.detail_memory_ids.slice(0, 12)
                        : [],
                    digest_retired_previous_continuation_key: previousContinuationKey,
                    digest_retired_previous_anchor_memory_id: previousAnchorMemoryId
                }
            );
            nextMetadata = appendMetadataHistoryEntry(
                nextMetadata,
                'event_version_history',
                {
                    changed_at: retiredAt,
                    source: 'digest_event_retire',
                    change_fields: ['status', 'unresolved', 'fragment_count', 'detail_members', 'flashbulb', 'flashbulb_members', 'anchor', 'continuation'],
                    previous_status: toTrimmedString(existingRecord.status),
                    next_status: 'closed',
                    previous_unresolved: !!existingRecord.is_unresolved,
                    next_unresolved: false,
                    previous_fragment_count: Math.max(0, Math.floor(toFiniteNumber(existingRecord.fragment_count, 0))),
                    next_fragment_count: 0,
                    previous_anchor_memory_id: previousAnchorMemoryId,
                    next_anchor_memory_id: '',
                    previous_continuation_key: previousContinuationKey,
                    next_continuation_key: '',
                    previous_flashbulb: !!existingRecord.event_is_flashbulb,
                    next_flashbulb: false,
                    previous_flashbulb_memory_ids: Array.isArray(existingRecord.event_flashbulb_memory_ids)
                        ? existingRecord.event_flashbulb_memory_ids.slice(0, 12)
                        : [],
                    next_flashbulb_memory_ids: [],
                    superseded_by_event_id: supersededByEventId || ''
                },
                10
            );

            retiredRows.push({
                id: safeEventId,
                user_id: safeUserId || toTrimmedString(existingRecord.user_id),
                char_id: safeCharId || toTrimmedString(existingRecord.char_id),
                room_id: existingRecord.room_id,
                context_scope: existingRecord.context_scope,
                title: toTrimmedString(existingRecord.title) || `记忆事件(${safeEventId.slice(0, 8)})`,
                summary: toTrimmedString(existingRecord.summary),
                status: 'closed',
                depth: normalizeEventDepth(existingRecord.depth),
                is_unresolved: false,
                continuation_key: null,
                event_date: toTrimmedString(existingRecord.event_date) || null,
                fragment_count: 0,
                salience_score: clampNumber(existingRecord.salience_score, 0, 1, 0.4),
                depth_score: clampNumber(existingRecord.depth_score, 0, 1, mapEventDepthToScore(existingRecord.depth)),
                anchor_memory_id: null,
                memory_ids: [],
                detail_memory_ids: [],
                start_at: toTrimmedString(existingRecord.start_at) || null,
                end_at: toTrimmedString(existingRecord.end_at) || null,
                last_related_at: toTrimmedString(existingRecord.last_related_at) || retiredAt,
                manual_edited: false,
                manual_note: toTrimmedString(existingRecord.manual_note) || null,
                metadata: nextMetadata
            });
        });

        return retiredRows;
    }

    function pickPreferredPlanText(values, fallbackValue) {
        const source = Array.isArray(values) ? values : [];
        let picked = toTrimmedString(fallbackValue);
        for (let i = 0; i < source.length; i += 1) {
            const text = toTrimmedString(source[i]);
            if (!text) continue;
            if (!picked || text.length > picked.length) {
                picked = text;
            }
        }
        return picked;
    }

    function pickDeepestEventDepth(values, fallbackValue) {
        const order = {
            low: 1,
            medium: 2,
            high: 3
        };
        const source = Array.isArray(values) ? values : [];
        let picked = normalizeEventDepth(fallbackValue);
        for (let i = 0; i < source.length; i += 1) {
            const depth = normalizeEventDepth(source[i]);
            if ((order[depth] || 0) > (order[picked] || 0)) {
                picked = depth;
            }
        }
        return picked;
    }

    function mergeEventPlanReason(leftReason, rightReason) {
        const parts = []
            .concat(toTrimmedString(leftReason))
            .concat(toTrimmedString(rightReason))
            .filter(Boolean);
        const unique = Array.from(new Set(parts));
        return unique.join(' | ');
    }

    function deriveEventPlanManualGuardAttempt(plan, existingRecord, fallbackContinuationKey) {
        const safePlan = plan && typeof plan === 'object' ? plan : {};
        if (safePlan.manualGuardAttempt && typeof safePlan.manualGuardAttempt === 'object') {
            const normalized = createEventManualGuardComparableState(safePlan.manualGuardAttempt);
            return {
                title: normalized.title,
                summary: normalized.summary,
                status: normalized.status,
                depth: normalized.depth,
                salienceScore: normalized.salienceScore,
                isUnresolved: normalized.unresolved,
                continuationKey: normalized.continuationKey,
                depthScore: normalized.depthScore
            };
        }

        const status = normalizeEventStatus(
            safePlan.status
            || (existingRecord && existingRecord.status)
            || (safePlan.isUnresolved ? 'open' : 'closed')
        );
        const depth = normalizeEventDepth(
            safePlan.depth || (existingRecord && existingRecord.depth)
        );
        const isUnresolved = safePlan.isUnresolved !== undefined
            ? toBoolean(safePlan.isUnresolved)
            : !!(existingRecord && existingRecord.is_unresolved);
        return {
            title: toTrimmedString(safePlan.title) || toTrimmedString(existingRecord && existingRecord.title),
            summary: toTrimmedString(safePlan.summary) || toTrimmedString(existingRecord && existingRecord.summary),
            status: status,
            depth: depth,
            salienceScore: clampNumber(
                safePlan.salienceScore !== undefined && safePlan.salienceScore !== null
                    ? safePlan.salienceScore
                    : (existingRecord && existingRecord.salience_score),
                0,
                1,
                0.4
            ),
            isUnresolved: isUnresolved,
            continuationKey: toTrimmedString(safePlan.continuationKey)
                || toTrimmedString(fallbackContinuationKey)
                || toTrimmedString(existingRecord && existingRecord.continuation_key),
            depthScore: clampNumber(
                safePlan.depthScore !== undefined && safePlan.depthScore !== null
                    ? safePlan.depthScore
                    : mapEventDepthToScore(depth),
                0,
                1,
                mapEventDepthToScore(depth)
            )
        };
    }

    function mergeDigestEventPlanPair(leftPlan, rightPlan, candidateMap, existingRecord) {
        const mergedMemoryIds = mergeUniqueIds(
            Array.isArray(leftPlan && leftPlan.memoryIds) ? leftPlan.memoryIds : [],
            Array.isArray(rightPlan && rightPlan.memoryIds) ? rightPlan.memoryIds : [],
            96
        );
        const mergedDetailIds = mergeUniqueIds(
            mergeUniqueIds(
                Array.isArray(leftPlan && leftPlan.detailMemoryIds) ? leftPlan.detailMemoryIds : [],
                Array.isArray(rightPlan && rightPlan.detailMemoryIds) ? rightPlan.detailMemoryIds : [],
                24
            ),
            mergedMemoryIds,
            24
        );

        const preferredAnchorIds = [
            toTrimmedString(existingRecord && existingRecord.anchor_memory_id),
            toTrimmedString(leftPlan && leftPlan.anchorMemoryId),
            toTrimmedString(rightPlan && rightPlan.anchorMemoryId)
        ].filter(Boolean);
        let anchorMemoryId = '';
        for (let i = 0; i < preferredAnchorIds.length; i += 1) {
            if (mergedMemoryIds.includes(preferredAnchorIds[i])) {
                anchorMemoryId = preferredAnchorIds[i];
                break;
            }
        }
        if (!anchorMemoryId) {
            anchorMemoryId = preferredAnchorIds[0] || mergedMemoryIds[0] || '';
        }

        const anchorCandidate = candidateMap.get(anchorMemoryId)
            || candidateMap.get(mergedMemoryIds[0])
            || null;
        const anchorContent = toTrimmedString(anchorCandidate && anchorCandidate.content);
        const manualEdited = !!(existingRecord && existingRecord.manual_edited);
        const unresolved = manualEdited
            ? !!existingRecord.is_unresolved
            : (
                !!(leftPlan && leftPlan.isUnresolved)
                || !!(rightPlan && rightPlan.isUnresolved)
                || !!(existingRecord && existingRecord.is_unresolved)
            );
        const status = normalizeEventStatus(
            manualEdited
                ? (existingRecord && existingRecord.status)
                : (
                    (leftPlan && leftPlan.status) === 'open' || (rightPlan && rightPlan.status) === 'open' || unresolved
                        ? 'open'
                        : (leftPlan && leftPlan.status) || (rightPlan && rightPlan.status) || (existingRecord && existingRecord.status)
                )
        );
        const leftGuardAttempt = deriveEventPlanManualGuardAttempt(
            leftPlan,
            existingRecord,
            leftPlan && leftPlan.continuationKey
        );
        const rightGuardAttempt = deriveEventPlanManualGuardAttempt(
            rightPlan,
            existingRecord,
            rightPlan && rightPlan.continuationKey
        );
        const mergedManualGuardDepth = pickDeepestEventDepth([
            leftGuardAttempt && leftGuardAttempt.depth,
            rightGuardAttempt && rightGuardAttempt.depth,
            existingRecord && existingRecord.depth
        ], 'low');
        const mergedManualGuardAttempt = manualEdited
            ? {
                title: pickPreferredPlanText([
                    leftGuardAttempt && leftGuardAttempt.title,
                    rightGuardAttempt && rightGuardAttempt.title,
                    existingRecord && existingRecord.title,
                    anchorContent.slice(0, 20)
                ], ''),
                summary: pickPreferredPlanText([
                    leftGuardAttempt && leftGuardAttempt.summary,
                    rightGuardAttempt && rightGuardAttempt.summary,
                    existingRecord && existingRecord.summary,
                    anchorContent.slice(0, 120)
                ], ''),
                status: normalizeEventStatus(
                    (leftGuardAttempt && leftGuardAttempt.status) === 'open'
                        || (rightGuardAttempt && rightGuardAttempt.status) === 'open'
                        || !!(leftGuardAttempt && leftGuardAttempt.isUnresolved)
                        || !!(rightGuardAttempt && rightGuardAttempt.isUnresolved)
                        ? 'open'
                        : (
                            (leftGuardAttempt && leftGuardAttempt.status)
                            || (rightGuardAttempt && rightGuardAttempt.status)
                            || (existingRecord && existingRecord.status)
                        )
                ),
                depth: mergedManualGuardDepth,
                salienceScore: Math.max(
                    clampNumber(leftGuardAttempt && leftGuardAttempt.salienceScore, 0, 1, 0.4),
                    clampNumber(rightGuardAttempt && rightGuardAttempt.salienceScore, 0, 1, 0.4),
                    clampNumber(existingRecord && existingRecord.salience_score, 0, 1, 0.4)
                ),
                isUnresolved: !!(leftGuardAttempt && leftGuardAttempt.isUnresolved)
                    || !!(rightGuardAttempt && rightGuardAttempt.isUnresolved)
                    || !!(existingRecord && existingRecord.is_unresolved),
                continuationKey: toTrimmedString(leftGuardAttempt && leftGuardAttempt.continuationKey)
                    || toTrimmedString(rightGuardAttempt && rightGuardAttempt.continuationKey)
                    || toTrimmedString(existingRecord && existingRecord.continuation_key),
                depthScore: mapEventDepthToScore(mergedManualGuardDepth)
            }
            : null;

        return {
            id: toTrimmedString(existingRecord && existingRecord.id)
                || toTrimmedString(leftPlan && leftPlan.id)
                || toTrimmedString(rightPlan && rightPlan.id),
            title: manualEdited
                ? toTrimmedString(existingRecord && existingRecord.title)
                : pickPreferredPlanText([
                    leftPlan && leftPlan.title,
                    rightPlan && rightPlan.title,
                    existingRecord && existingRecord.title,
                    anchorContent.slice(0, 20)
                ], ''),
            summary: manualEdited
                ? toTrimmedString(existingRecord && existingRecord.summary)
                : pickPreferredPlanText([
                    leftPlan && leftPlan.summary,
                    rightPlan && rightPlan.summary,
                    existingRecord && existingRecord.summary,
                    anchorContent.slice(0, 120)
                ], ''),
            status: status,
            depth: manualEdited
                ? normalizeEventDepth(existingRecord && existingRecord.depth)
                : pickDeepestEventDepth([
                    leftPlan && leftPlan.depth,
                    rightPlan && rightPlan.depth,
                    existingRecord && existingRecord.depth
                ], 'low'),
            salienceScore: clampNumber(
                manualEdited
                    ? (existingRecord && existingRecord.salience_score)
                    : Math.max(
                        clampNumber(leftPlan && leftPlan.salienceScore, 0, 1, 0.4),
                        clampNumber(rightPlan && rightPlan.salienceScore, 0, 1, 0.4),
                        clampNumber(existingRecord && existingRecord.salience_score, 0, 1, 0.4)
                    ),
                0,
                1,
                0.4
            ),
            isUnresolved: unresolved,
            continuationKey: manualEdited
                ? toTrimmedString(existingRecord && existingRecord.continuation_key)
                : (
                    toTrimmedString(existingRecord && existingRecord.continuation_key)
                    || toTrimmedString(leftPlan && leftPlan.continuationKey)
                    || toTrimmedString(rightPlan && rightPlan.continuationKey)
                ),
            memoryIds: mergedMemoryIds,
            anchorMemoryId: anchorMemoryId,
            detailMemoryIds: mergedDetailIds,
            linkMeta: pickPreferredDigestLinkMeta(
                leftPlan && leftPlan.linkMeta,
                rightPlan && rightPlan.linkMeta
            ),
            manualGuardAttempt: mergedManualGuardAttempt,
            reason: mergeEventPlanReason(
                leftPlan && leftPlan.reason,
                rightPlan && rightPlan.reason
            )
        };
    }

    function stabilizeEventPlansWithExistingContext(eventPlans, candidates, existingEventRecords) {
        const source = normalizeDigestEventPlans(eventPlans);
        if (source.length === 0) return [];

        const candidateMap = buildDigestCandidateMap(candidates);
        const existingContext = normalizeExistingEventContext(existingEventRecords);
        const mergedPlans = new Map();

        source.forEach(function stabilizePlan(plan) {
            const resolved = resolveExistingEventLink(plan, candidateMap, existingContext);
            const existingRecord = resolved.existingRecord
                || (resolved.eventId ? (existingContext.map.get(resolved.eventId) || null) : null);
            const manualEdited = !!(existingRecord && existingRecord.manual_edited);
            const manualGuardAttempt = manualEdited
                ? deriveEventPlanManualGuardAttempt(plan, existingRecord, resolved && resolved.continuationKey)
                : null;
            const stabilizedPlan = {
                id: resolved.eventId || toTrimmedString(plan.id),
                title: manualEdited
                    ? toTrimmedString(existingRecord && existingRecord.title)
                    : (toTrimmedString(plan.title) || toTrimmedString(existingRecord && existingRecord.title)),
                summary: manualEdited
                    ? toTrimmedString(existingRecord && existingRecord.summary)
                    : (toTrimmedString(plan.summary) || toTrimmedString(existingRecord && existingRecord.summary)),
                status: normalizeEventStatus(
                    manualEdited
                        ? (existingRecord && existingRecord.status)
                        : (
                            plan.status
                            || (existingRecord && existingRecord.status)
                            || (plan.isUnresolved ? 'open' : 'closed')
                        )
                ),
                depth: normalizeEventDepth(
                    manualEdited
                        ? (existingRecord && existingRecord.depth)
                        : (plan.depth || (existingRecord && existingRecord.depth))
                ),
                salienceScore: clampNumber(
                    manualEdited
                        ? (existingRecord && existingRecord.salience_score)
                        : (
                            plan.salienceScore !== undefined && plan.salienceScore !== null
                                ? plan.salienceScore
                                : (existingRecord && existingRecord.salience_score)
                        ),
                    0,
                    1,
                    0.4
                ),
                isUnresolved: manualEdited
                    ? !!(existingRecord && existingRecord.is_unresolved)
                    : (
                        plan.isUnresolved !== undefined
                            ? toBoolean(plan.isUnresolved)
                            : !!(existingRecord && existingRecord.is_unresolved)
                    ),
                continuationKey: manualEdited
                    ? toTrimmedString(existingRecord && existingRecord.continuation_key)
                    : resolved.continuationKey,
                memoryIds: mergeUniqueIds(plan.memoryIds, [], 96),
                anchorMemoryId: toTrimmedString(plan.anchorMemoryId)
                    || toTrimmedString(existingRecord && existingRecord.anchor_memory_id)
                    || toTrimmedString(plan.memoryIds && plan.memoryIds[0]),
                detailMemoryIds: mergeUniqueIds(plan.detailMemoryIds, plan.memoryIds, 24),
                linkMeta: pickPreferredDigestLinkMeta(
                    plan.linkMeta,
                    resolved.linkMeta
                ),
                manualGuardAttempt: manualGuardAttempt,
                reason: toTrimmedString(plan.reason)
            };

            const mergeKey = stabilizedPlan.id
                ? `id:${stabilizedPlan.id}`
                : (stabilizedPlan.continuationKey
                    ? `continuation:${normalizeContinuationLookupKey(stabilizedPlan.continuationKey)}`
                    : `members:${stabilizedPlan.memoryIds.slice().sort().join(',')}`);
            if (!mergedPlans.has(mergeKey)) {
                mergedPlans.set(mergeKey, stabilizedPlan);
                return;
            }

            mergedPlans.set(
                mergeKey,
                mergeDigestEventPlanPair(
                    mergedPlans.get(mergeKey),
                    stabilizedPlan,
                    candidateMap,
                    existingRecord
                )
            );
        });

        return Array.from(mergedPlans.values()).filter(function filterPlan(plan) {
            return Array.isArray(plan && plan.memoryIds) && plan.memoryIds.length > 0;
        });
    }

    /**
     * 根据候选记忆推导启发式事件深度。
     */
    function inferEventDepthFromGroup(group) {
        const source = Array.isArray(group) ? group : [];
        if (source.length === 0) return 'low';
        let maxImportance = 0;
        let highImportanceCount = 0;
        let maxArousal = 0;
        for (let i = 0; i < source.length; i += 1) {
            const item = source[i];
            const importance = clampNumber(item && item.importance, 1, 10, 5);
            const arousal = clampNumber(item && item.arousal, 0, 1, 0);
            if (importance > maxImportance) maxImportance = importance;
            if (importance >= 7.5) highImportanceCount += 1;
            if (arousal > maxArousal) maxArousal = arousal;
        }
        if (highImportanceCount >= 2 || maxImportance >= 8.8 || source.length >= 6 || (maxImportance >= 8.2 && maxArousal >= 0.86)) return 'high';
        if (maxImportance >= 6.2 || source.length >= 3 || (maxImportance >= 5.8 && maxArousal >= 0.78)) return 'medium';
        return 'low';
    }

    /**
     * 当 LLM 未返回事件计划时，使用轻量启发式兜底，保证 digest 能持续产出“事件+碎片”。
     */
    function buildHeuristicEventPlansLegacy(candidates) {
        const source = (Array.isArray(candidates) ? candidates : [])
            .filter(Boolean)
            .slice()
            .sort(function sortByTime(left, right) {
                return getMemoryTimestamp(left) - getMemoryTimestamp(right);
            });
        if (source.length === 0) return [];

        const bucketMap = new Map();
        const BUCKET_MS = 6 * 60 * 60 * 1000;
        for (let i = 0; i < source.length; i += 1) {
            const item = source[i];
            const memoryId = toTrimmedString(item && item.id);
            if (!memoryId) continue;
            const timestamp = getMemoryTimestamp(item);
            const bucket = Number.isFinite(timestamp) ? Math.floor(timestamp / BUCKET_MS) : 0;
            const layer = toTrimmedString(item && item.memory_layer).toLowerCase() || 'buffer';
            const key = `${layer}:${bucket}`;
            if (!bucketMap.has(key)) {
                bucketMap.set(key, []);
            }
            bucketMap.get(key).push(item);
        }

        const scoredGroups = [];
        bucketMap.forEach(function consumeGroup(group) {
            const safeGroup = Array.isArray(group) ? group.filter(Boolean) : [];
            if (safeGroup.length === 0) return;

            const shouldFormEvent = safeGroup.length >= 2 || safeGroup.some(function hasStrong(item) {
                const importance = clampNumber(item && item.importance, 1, 10, 5);
                const layer = toTrimmedString(item && item.memory_layer).toLowerCase();
                return importance >= 7.2 || layer === 'shadow' || layer === 'wish';
            });
            if (!shouldFormEvent) return;

            const anchor = safeGroup.slice().sort(function sortByImportance(left, right) {
                const importanceDiff = clampNumber(right && right.importance, 1, 10, 5) - clampNumber(left && left.importance, 1, 10, 5);
                if (Math.abs(importanceDiff) > 0.001) return importanceDiff;
                return getMemoryTimestamp(right) - getMemoryTimestamp(left);
            })[0];
            if (!anchor) return;

            const memoryIds = safeGroup
                .map(function mapId(item) {
                    return toTrimmedString(item && item.id);
                })
                .filter(Boolean);
            if (memoryIds.length === 0) return;

            const unresolved = safeGroup.some(function hasUnresolved(item) {
                const layer = toTrimmedString(item && item.memory_layer).toLowerCase();
                return !toBoolean(item && item.resolved) || layer === 'shadow' || layer === 'wish';
            });
            const depth = inferEventDepthFromGroup(safeGroup);
            const anchorContent = toTrimmedString(anchor.content);
            const title = anchorContent.slice(0, 20) || '记忆事件';
            const summary = anchorContent.slice(0, 120) || '这是一段需要保留的记忆片段。';
            const signalProfile = deriveDigestEventSignalProfile(safeGroup, {
                depth: depth,
                unresolved: unresolved
            });
            const salience = signalProfile.salienceScore;

            scoredGroups.push({
                score: salience + (depth === 'high' ? 0.35 : depth === 'medium' ? 0.18 : 0),
                plan: {
                    id: '',
                    title: title,
                    summary: summary,
                    status: unresolved ? 'open' : 'closed',
                    depth: depth,
                    salienceScore: salience,
                    isUnresolved: unresolved,
                    continuationKey: unresolved ? title.slice(0, 18) : '',
                    memoryIds: memoryIds,
                    anchorMemoryId: toTrimmedString(anchor.id),
                    detailMemoryIds: memoryIds.slice(0, depth === 'high' ? 8 : depth === 'medium' ? 5 : 3),
                    reason: '启发式整理：按时间与重要程度聚合'
                }
            });
        });

        return scoredGroups
            .sort(function sortByScore(left, right) {
                return right.score - left.score;
            })
            .slice(0, 8)
            .map(function extractPlan(item) {
                return item.plan;
            });
    }

    function buildHeuristicEventPlans(candidates, existingEventRecords) {
        const source = (Array.isArray(candidates) ? candidates : [])
            .filter(Boolean)
            .slice()
            .sort(function sortByTime(left, right) {
                return getMemoryTimestamp(left) - getMemoryTimestamp(right);
            });
        if (source.length === 0) return [];

        const existingContext = normalizeExistingEventContext(existingEventRecords);
        const bucketMap = new Map();
        const BUCKET_MS = 6 * 60 * 60 * 1000;
        for (let i = 0; i < source.length; i += 1) {
            const item = source[i];
            const memoryId = toTrimmedString(item && item.id);
            if (!memoryId) continue;
            const timestamp = getMemoryTimestamp(item);
            const bucket = Number.isFinite(timestamp) ? Math.floor(timestamp / BUCKET_MS) : 0;
            const layer = toTrimmedString(item && item.memory_layer).toLowerCase() || 'buffer';
            const existingEventId = toTrimmedString(item && item.existing_event_id);
            const continuationKey = toTrimmedString(item && item.existing_continuation_key);
            const continuationLookupKey = normalizeContinuationLookupKey(continuationKey);
            const continuationRecord = continuationLookupKey
                ? (existingContext.continuationMap.get(continuationLookupKey) || null)
                : null;
            const key = existingEventId
                ? `existing:${existingEventId}`
                : (continuationRecord
                    ? `existing:${continuationRecord.id}`
                    : (continuationLookupKey ? `continuation:${continuationLookupKey}` : `${layer}:${bucket}`));
            if (!bucketMap.has(key)) {
                bucketMap.set(key, {
                    items: [],
                    existingEventId: existingEventId || toTrimmedString(continuationRecord && continuationRecord.id) || '',
                    continuationKey: continuationKey || toTrimmedString(continuationRecord && continuationRecord.continuation_key) || ''
                });
            }
            bucketMap.get(key).items.push(item);
        }

        const scoredGroups = [];
        bucketMap.forEach(function consumeGroup(groupInfo) {
            const safeGroup = Array.isArray(groupInfo && groupInfo.items) ? groupInfo.items.filter(Boolean) : [];
            if (safeGroup.length === 0) return;
            const existingRecord = toTrimmedString(groupInfo && groupInfo.existingEventId)
                ? (existingContext.map.get(toTrimmedString(groupInfo.existingEventId)) || null)
                : null;

            const shouldFormEvent = !!existingRecord || safeGroup.length >= 2 || safeGroup.some(function hasStrong(item) {
                const importance = clampNumber(item && item.importance, 1, 10, 5);
                const layer = toTrimmedString(item && item.memory_layer).toLowerCase();
                return importance >= 7.2 || layer === 'shadow' || layer === 'wish';
            });
            if (!shouldFormEvent) return;

            const anchor = safeGroup.slice().sort(function sortByImportance(left, right) {
                const importanceDiff = clampNumber(right && right.importance, 1, 10, 5) - clampNumber(left && left.importance, 1, 10, 5);
                if (Math.abs(importanceDiff) > 0.001) return importanceDiff;
                return getMemoryTimestamp(right) - getMemoryTimestamp(left);
            })[0];
            if (!anchor) return;

            const memoryIds = safeGroup
                .map(function mapId(item) {
                    return toTrimmedString(item && item.id);
                })
                .filter(Boolean);
            if (memoryIds.length === 0) return;

            const unresolved = existingRecord
                ? !!existingRecord.is_unresolved
                : safeGroup.some(function hasUnresolved(item) {
                    const layer = toTrimmedString(item && item.memory_layer).toLowerCase();
                    return !toBoolean(item && item.resolved) || layer === 'shadow' || layer === 'wish';
                });
            const depth = existingRecord
                ? normalizeEventDepth(existingRecord.depth)
                : inferEventDepthFromGroup(safeGroup);
            const anchorContent = toTrimmedString(anchor.content);
            const title = toTrimmedString(existingRecord && existingRecord.title)
                || anchorContent.slice(0, 20)
                || '记忆事件';
            const summary = toTrimmedString(existingRecord && existingRecord.summary)
                || anchorContent.slice(0, 120)
                || '这是一段需要保留的记忆片段';
            const salience = clampNumber(
                existingRecord && existingRecord.salience_score !== undefined && existingRecord.salience_score !== null
                    ? existingRecord.salience_score
                    : deriveDigestEventSignalProfile(safeGroup, {
                        existingRecord: existingRecord,
                        depth: depth,
                        unresolved: unresolved
                    }).salienceScore,
                0,
                1,
                0.4
            );

            scoredGroups.push({
                score: salience + (depth === 'high' ? 0.35 : depth === 'medium' ? 0.18 : 0),
                plan: {
                    id: toTrimmedString(existingRecord && existingRecord.id),
                    title: title,
                    summary: summary,
                    status: unresolved ? 'open' : 'closed',
                    depth: depth,
                    salienceScore: salience,
                    isUnresolved: unresolved,
                    continuationKey: toTrimmedString(existingRecord && existingRecord.continuation_key)
                        || toTrimmedString(groupInfo && groupInfo.continuationKey)
                        || (unresolved ? title.slice(0, 18) : ''),
                    memoryIds: memoryIds,
                    anchorMemoryId: toTrimmedString(existingRecord && existingRecord.anchor_memory_id)
                        || toTrimmedString(anchor.id),
                    detailMemoryIds: memoryIds.slice(0, depth === 'high' ? 8 : depth === 'medium' ? 5 : 3),
                    reason: existingRecord
                        ? 'heuristic reuse existing event'
                        : 'heuristic grouped by time/layer'
                }
            });
        });

        return scoredGroups
            .sort(function sortByScore(left, right) {
                return right.score - left.score;
            })
            .slice(0, 8)
            .map(function extractPlan(item) {
                return item.plan;
            });
    }

    /**
     * 解析认知消化响应并做安全校验。
     */
    function parseDigestResponse(llmResponse) {
        const emptyResult = {
            migrations: [],
            ruminationTendency: null,
            recallStyle: null,
            attachmentStyle: null,
            selfInsight: '',
            digestSummary: '',
            eventChanges: '',
            fragmentChanges: '',
            eventPlans: []
        };

        try {
            let parsed = null;
            if (llmResponse && typeof llmResponse === 'object' && !Array.isArray(llmResponse.choices)) {
                parsed = llmResponse;
            } else {
                const rawText = extractResponseText(llmResponse);
                const candidate = extractJsonCandidate(rawText);
                if (!candidate) return emptyResult;
                parsed = JSON.parse(candidate);
            }

            if (!parsed || typeof parsed !== 'object') return emptyResult;

            const sourceMigrations = Array.isArray(parsed.migrations) ? parsed.migrations : [];
            const migrations = [];
            for (let index = 0; index < sourceMigrations.length; index += 1) {
                const item = sourceMigrations[index];
                const id = toTrimmedString(item && item.id);
                const newLayer = toTrimmedString(item && (item.newLayer || item.new_layer)).toLowerCase();
                const reason = toTrimmedString(item && item.reason);
                if (!id) continue;
                if (!VALID_LAYERS.has(newLayer)) {
                    console.warn(`[海马体][消化] ⚠️ 解析异常 -> migrations[${index}].newLayer="${newLayer}" 非法，已跳过`);
                    continue;
                }
                migrations.push({
                    id: id,
                    newLayer: newLayer,
                    reason: reason
                });
            }

            let ruminationTendency = null;
            if (parsed.ruminationTendency !== undefined || parsed.rumination_tendency !== undefined) {
                ruminationTendency = clampNumber(
                    parsed.ruminationTendency !== undefined ? parsed.ruminationTendency : parsed.rumination_tendency,
                    0,
                    1,
                    0.3
                );
            }

            let recallStyle = null;
            if (typeof parsed.recallStyle === 'string') {
                const style = toTrimmedString(parsed.recallStyle).toLowerCase();
                if (['emotional', 'narrative', 'analytical', 'imagery'].includes(style)) {
                    recallStyle = style;
                }
            } else if (parsed.recallStyle && typeof parsed.recallStyle === 'object' && !Array.isArray(parsed.recallStyle)) {
                recallStyle = parsed.recallStyle;
            }

            let attachmentStyle = null;
            if (parsed.attachmentStyle !== undefined || parsed.attachment_style !== undefined) {
                const style = toTrimmedString(
                    parsed.attachmentStyle !== undefined ? parsed.attachmentStyle : parsed.attachment_style
                ).toLowerCase();
                if (['secure', 'anxious', 'avoidant', 'disorganized'].includes(style)) {
                    attachmentStyle = style;
                } else if (style) {
                    console.warn(`[海马体][消化] ⚠️ 解析异常 -> attachmentStyle="${style}" 非法，已忽略`);
                }
            }

            const selfInsight = toTrimmedString(parsed.selfInsight || parsed.self_insight || '');
            const digestSummary = toTrimmedString(parsed.digestSummary || parsed.digest_summary);
            const eventChanges = toTrimmedString(parsed.eventChanges || parsed.event_changes);
            const fragmentChanges = toTrimmedString(parsed.fragmentChanges || parsed.fragment_changes);
            const eventPlans = normalizeDigestEventPlans(
                parsed.eventPlans
                || parsed.event_plans
                || parsed.events
                || parsed.memoryEvents
                || parsed.memory_events
            );
            return {
                migrations: migrations,
                ruminationTendency: ruminationTendency,
                recallStyle: recallStyle,
                attachmentStyle: attachmentStyle,
                selfInsight: selfInsight,
                digestSummary: digestSummary,
                eventChanges: eventChanges,
                fragmentChanges: fragmentChanges,
                eventPlans: eventPlans
            };
        } catch (error) {
            console.warn('[海马体][消化] ⚠️ 解析失败，已回退安全默认值。', error && error.message ? error.message : error);
            return emptyResult;
        }
    }

    /**
     * 拉取认知消化候选记忆。
     */
    async function fetchDigestCandidates(supabase, userId, charId) {
        const cutoffIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const selectFields = 'id,user_id,char_id,memory_layer,content,valence,arousal,importance,activation_count,resolved,event_id,event_title,event_summary,event_status,event_depth,event_date,event_fragment_count,event_is_unresolved,event_salience_score,event_depth_score,continuation_key,event_anchor_memory_id,event_detail_memory_ids,metadata,created_at,last_active_at';
        const legacySelectFields = 'id,user_id,char_id,memory_layer,content,valence,arousal,importance,activation_count,resolved,metadata,created_at,last_active_at';

        function buildDigestTasks(fields) {
            return [
                supabase
                    .from('hippocampus_memories')
                    .select(fields)
                    .eq('user_id', userId)
                    .eq('char_id', charId)
                    .eq('memory_layer', 'shadow'),
                supabase
                    .from('hippocampus_memories')
                    .select(fields)
                    .eq('user_id', userId)
                    .eq('char_id', charId)
                    .eq('memory_layer', 'wish'),
                supabase
                    .from('hippocampus_memories')
                    .select(fields)
                    .eq('user_id', userId)
                    .eq('char_id', charId)
                    .eq('memory_layer', 'core')
                    .gte('created_at', cutoffIso),
                supabase
                    .from('hippocampus_memories')
                    .select(fields)
                    .eq('user_id', userId)
                    .eq('char_id', charId)
                    .eq('memory_layer', 'buffer')
                    .gte('activation_count', 3)
            ];
        }

        const labels = ['shadow', 'wish', 'core', 'buffer'];
        let settled = await Promise.allSettled(buildDigestTasks(selectFields));
        const shouldFallbackToLegacyFields = settled.some(function needLegacy(item) {
            if (item.status === 'fulfilled' && item.value && item.value.error) {
                return isMissingEventColumnError(item.value.error);
            }
            if (item.status === 'rejected') {
                return isMissingEventColumnError(item.reason);
            }
            return false;
        });
        if (shouldFallbackToLegacyFields) {
            console.log('[海马体][消化] 检测到数据库尚未补齐事件字段，digest 候选回退到旧字段查询。');
            settled = await Promise.allSettled(buildDigestTasks(legacySelectFields));
        }
        const rows = [];
        const counts = {
            shadow: 0,
            wish: 0,
            core: 0,
            buffer: 0
        };

        settled.forEach(function consume(result, index) {
            const label = labels[index];
            if (result.status !== 'fulfilled') {
                console.warn(`[海马体][消化] ⚠️ 候选拉取失败 -> ${label}`, result.reason && result.reason.message ? result.reason.message : result.reason);
                return;
            }
            if (result.value && result.value.error) {
                console.warn(`[海马体][消化] ⚠️ 候选拉取失败 -> ${label}`, result.value.error.message || result.value.error);
                return;
            }
            const data = result.value && Array.isArray(result.value.data) ? result.value.data : [];
            counts[label] = data.length;
            rows.push.apply(rows, data);
        });

        const deduped = new Map();
        rows.forEach(function putRow(row) {
            const id = toTrimmedString(row && row.id);
            if (!id || deduped.has(id)) return;
            deduped.set(id, decorateDigestCandidateRow(row));
        });

        console.log(
            `[海马体][消化] ✅ 候选记忆 -> shadow:${counts.shadow}, wish:${counts.wish}, core:${counts.core}, buffer:${counts.buffer}, 共${deduped.size}条`
        );
        return Array.from(deduped.values());
    }

    async function listRecentDigestOutcomeRecords(charId, hours) {
        const safeCharId = toTrimmedString(charId);
        if (!safeCharId) return [];
        const adminClient = root && root.HippocampusAdminClient && typeof root.HippocampusAdminClient === 'object'
            ? root.HippocampusAdminClient
            : null;
        if (!adminClient || typeof adminClient.listDigestOutcomeRecords !== 'function') {
            return [];
        }
        try {
            const response = await Promise.resolve(
                adminClient.listDigestOutcomeRecords({
                    charId: safeCharId,
                    hours: Math.max(1, Math.floor(toFiniteNumber(hours, DIGEST_RECENT_OUTCOME_HOURS)))
                })
            );
            return Array.isArray(response) ? response : [];
        } catch (_) {
            return [];
        }
    }

    function getDigestOutcomeRelatedMemoryIds(record) {
        const source = record && typeof record === 'object' ? record : {};
        const raw = source.relatedMemoryIds || source.related_memory_ids;
        return mergeUniqueIds([], Array.isArray(raw) ? raw : [], 160);
    }

    function buildDigestCandidateRepeatKey(candidate) {
        const source = candidate && typeof candidate === 'object' ? candidate : {};
        const metadata = normalizeMetadata(source.metadata);
        const existingEventId = toTrimmedString(
            source.existing_event_id
            || source.event_id
            || metadata.event_id
            || metadata.eventId
            || metadata.memory_event_id
        );
        const sourceMessageIds = normalizeEvidenceMessageIds(
            []
                .concat(Array.isArray(source.existing_event_stability_source_message_ids) ? source.existing_event_stability_source_message_ids : [])
                .concat(Array.isArray(source.event_stability_source_message_ids) ? source.event_stability_source_message_ids : [])
                .concat(Array.isArray(source.source_message_ids) ? source.source_message_ids : [])
                .concat(Array.isArray(readFirstDefined(metadata, ['existing_event_stability_source_message_ids', 'event_stability_source_message_ids', 'source_message_ids'], []))
                    ? readFirstDefined(metadata, ['existing_event_stability_source_message_ids', 'event_stability_source_message_ids', 'source_message_ids'], [])
                    : []),
            8
        );
        const triggerKeywords = normalizeEvidenceAliases(
            []
                .concat(Array.isArray(source.trigger_keywords) ? source.trigger_keywords : [])
                .concat(Array.isArray(metadata.trigger_keywords) ? metadata.trigger_keywords : []),
            4
        );
        const normalizedContent = normalizeContinuationLookupKey(
            toTrimmedString(source.content)
                .replace(/[\r\n\t]+/g, ' ')
                .replace(/\s+/g, ' ')
                .slice(0, 160)
        );
        const sourceMessageKey = sourceMessageIds.length > 0 ? sourceMessageIds.join('|') : '';
        const triggerKey = triggerKeywords.length > 0 ? normalizeContinuationLookupKey(triggerKeywords.join('|')) : '';

        if (existingEventId && sourceMessageKey) {
            return `event:${existingEventId}|msg:${sourceMessageKey}`;
        }
        if (sourceMessageKey) {
            return `msg:${sourceMessageKey}`;
        }
        if (existingEventId && normalizedContent) {
            return `event:${existingEventId}|content:${normalizedContent}`;
        }
        if (normalizedContent && triggerKey) {
            return `content:${normalizedContent}|trigger:${triggerKey}`;
        }
        return normalizedContent ? `content:${normalizedContent}` : '';
    }

    function getDigestOutcomeRelatedCandidateKeys(record) {
        const source = record && typeof record === 'object' ? record : {};
        const raw = source.relatedCandidateKeys || source.related_candidate_keys;
        return mergeUniqueIds([], Array.isArray(raw) ? raw : [], 160);
    }

    function buildDigestRecentOutcomeGuard(candidates, recentRecords) {
        const sourceCandidates = Array.isArray(candidates) ? candidates.filter(Boolean) : [];
        const candidateIds = sourceCandidates.map(function mapCandidateId(item) {
            return toTrimmedString(item && item.id);
        }).filter(Boolean);
        const candidateRepeatKeyById = new Map();
        const candidateRepeatKeys = [];
        sourceCandidates.forEach(function collectRepeatKey(item) {
            const id = toTrimmedString(item && item.id);
            if (!id) return;
            const repeatKey = buildDigestCandidateRepeatKey(item);
            if (!repeatKey) return;
            candidateRepeatKeyById.set(id, repeatKey);
            if (!candidateRepeatKeys.includes(repeatKey)) {
                candidateRepeatKeys.push(repeatKey);
            }
        });
        if (candidateIds.length <= 0) {
            return {
                candidates: [],
                droppedCount: 0,
                skipped: false,
                matchedCount: 0,
                overlapCount: 0,
                overlapRatio: 0,
                matchedRecord: null
            };
        }

        const recentList = (Array.isArray(recentRecords) ? recentRecords : []).map(function mapRecent(item) {
            const ids = getDigestOutcomeRelatedMemoryIds(item);
            const repeatKeys = getDigestOutcomeRelatedCandidateKeys(item);
            if (ids.length <= 0 && repeatKeys.length <= 0) return null;
            const ts = Date.parse(toTrimmedString(item && (item.updatedAt || item.updated_at || item.windowEnd || item.window_end || item.createdAt || item.created_at))) || 0;
            return {
                record: item,
                ids: ids,
                repeatKeys: repeatKeys,
                timestamp: ts
            };
        }).filter(Boolean).sort(function sortRecent(left, right) {
            return right.timestamp - left.timestamp;
        });
        if (recentList.length <= 0) {
            return {
                candidates: sourceCandidates.slice(),
                droppedCount: 0,
                skipped: false,
                matchedCount: 0,
                overlapCount: 0,
                overlapRatio: 0,
                matchedRecord: null
            };
        }

        const candidateIdSet = new Set(candidateIds);
        const candidateRepeatKeySet = new Set(candidateRepeatKeys);
        const requiredOverlap = candidateIds.length >= 4 ? 4 : candidateIds.length;
        const matches = [];
        const blockedIds = new Set();

        recentList.forEach(function inspectRecent(item) {
            const overlapIds = item.ids.filter(function keepId(id) {
                return candidateIdSet.has(id);
            });
            const overlapRepeatKeys = item.repeatKeys.filter(function keepKey(key) {
                return candidateRepeatKeySet.has(key);
            });
            const effectiveBlockedIds = new Set(overlapIds);
            if (overlapRepeatKeys.length > 0) {
                candidateRepeatKeyById.forEach(function blockByRepeatKey(repeatKey, id) {
                    if (overlapRepeatKeys.includes(repeatKey)) {
                        effectiveBlockedIds.add(id);
                    }
                });
            }
            const overlapCount = effectiveBlockedIds.size;
            if (overlapCount < requiredOverlap) return;
            const overlapRatio = overlapCount / candidateIds.length;
            if (overlapRatio < DIGEST_RECENT_REPEAT_RATIO) return;
            effectiveBlockedIds.forEach(function rememberId(id) {
                blockedIds.add(id);
            });
            matches.push({
                record: item.record,
                overlapIds: overlapIds,
                overlapRepeatKeys: overlapRepeatKeys,
                overlapCount: overlapCount,
                overlapRatio: overlapRatio,
                timestamp: item.timestamp
            });
        });

        if (matches.length <= 0) {
            return {
                candidates: sourceCandidates.slice(),
                droppedCount: 0,
                skipped: false,
                matchedCount: 0,
                overlapCount: 0,
                overlapRatio: 0,
                matchedRecord: null
            };
        }

        matches.sort(function sortMatch(left, right) {
            if (right.overlapRatio !== left.overlapRatio) return right.overlapRatio - left.overlapRatio;
            if (right.overlapCount !== left.overlapCount) return right.overlapCount - left.overlapCount;
            return right.timestamp - left.timestamp;
        });

        const filteredCandidates = sourceCandidates.filter(function keepCandidate(item) {
            return !blockedIds.has(toTrimmedString(item && item.id));
        });
        const strongest = matches[0];

        return {
            candidates: filteredCandidates,
            droppedCount: Math.max(0, sourceCandidates.length - filteredCandidates.length),
            skipped: filteredCandidates.length <= 0,
            matchedCount: matches.length,
            overlapCount: strongest.overlapCount,
            overlapRatio: Number(strongest.overlapRatio.toFixed(3)),
            matchedRecord: strongest.record
        };
    }

    /**
     * 基于事件计划构建“记忆ID -> 事件补丁”映射。
     */
    function buildEventAssignmentMap(charId, candidates, eventPlans) {
        const candidateMap = new Map();
        (Array.isArray(candidates) ? candidates : []).forEach(function putCandidate(item) {
            const id = toTrimmedString(item && item.id);
            if (!id) return;
            candidateMap.set(id, item);
        });

        const assignmentMap = new Map();
        const eventRecords = [];
        const plans = Array.isArray(eventPlans) ? eventPlans : [];
        for (let i = 0; i < plans.length; i += 1) {
            const plan = plans[i];
            if (!plan || typeof plan !== 'object') continue;

            const memoryIds = (Array.isArray(plan.memoryIds) ? plan.memoryIds : [])
                .map(toTrimmedString)
                .filter(function keepId(id) {
                    return !!id && candidateMap.has(id);
                });
            if (memoryIds.length === 0) continue;

            const eventId = toTrimmedString(plan.id) || createStableEventId(charId, memoryIds, i);
            const status = normalizeEventStatus(plan.status || (plan.isUnresolved ? 'open' : 'closed'));
            const depth = normalizeEventDepth(plan.depth);
            const unresolved = plan.isUnresolved !== undefined ? toBoolean(plan.isUnresolved) : status === 'open';
            const anchorMemoryId = toTrimmedString(plan.anchorMemoryId) || memoryIds[0];
            const detailMemoryIds = (Array.isArray(plan.detailMemoryIds) ? plan.detailMemoryIds : memoryIds)
                .map(toTrimmedString)
                .filter(Boolean);
            const anchorCandidate = candidateMap.get(anchorMemoryId) || candidateMap.get(memoryIds[0]);
            const anchorContent = toTrimmedString(anchorCandidate && anchorCandidate.content);
            const title = toTrimmedString(plan.title) || anchorContent.slice(0, 20) || `记忆事件 ${i + 1}`;
            const summary = toTrimmedString(plan.summary) || anchorContent.slice(0, 120) || '这是一段被整理出来的记忆事件。';
            const salienceScore = clampNumber(plan.salienceScore, 0, 1, 0.4);
            const continuationKey = toTrimmedString(plan.continuationKey);
            const eventDateTs = getMemoryTimestamp(anchorCandidate);
            const eventDate = Number.isFinite(eventDateTs) ? new Date(eventDateTs).toISOString() : '';
            const eventPatch = {
                event_id: eventId,
                event_title: title,
                event_summary: summary,
                event_status: status,
                event_depth: depth,
                event_fragment_count: memoryIds.length,
                event_is_unresolved: unresolved,
                event_salience_score: salienceScore,
                event_depth_score: mapEventDepthToScore(depth),
                continuation_key: continuationKey,
                event_date: eventDate,
                event_anchor_memory_id: anchorMemoryId,
                event_detail_memory_ids: detailMemoryIds,
                event_plan_reason: toTrimmedString(plan.reason)
            };
            const memberRows = memoryIds
                .map(function mapMemoryId(id) {
                    return candidateMap.get(id) || null;
                })
                .filter(Boolean);
            let startTs = Number.POSITIVE_INFINITY;
            let endTs = Number.NEGATIVE_INFINITY;
            memberRows.forEach(function trackRange(member) {
                const ts = getMemoryTimestamp(member);
                if (!Number.isFinite(ts)) return;
                if (ts < startTs) startTs = ts;
                if (ts > endTs) endTs = ts;
            });
            const anchorRow = anchorCandidate || memberRows[0] || null;
            const roomId = toTrimmedString(anchorRow && anchorRow.room_id) || null;
            const contextScope = toTrimmedString(anchorRow && anchorRow.context_scope) || (roomId ? 'room' : 'private') || 'private';
            eventRecords.push(Object.assign({}, eventPatch, {
                room_id: roomId,
                context_scope: contextScope,
                memory_ids: memoryIds.slice(),
                start_at: Number.isFinite(startTs) ? new Date(startTs).toISOString() : null,
                end_at: Number.isFinite(endTs) ? new Date(endTs).toISOString() : null,
                last_related_at: Number.isFinite(endTs)
                    ? new Date(endTs).toISOString()
                    : (eventDate || null)
            }));

            for (let j = 0; j < memoryIds.length; j += 1) {
                const memoryId = memoryIds[j];
                assignmentMap.set(memoryId, eventPatch);
            }
        }

        return {
            candidateMap: candidateMap,
            assignmentMap: assignmentMap,
            eventRecords: eventRecords
        };
    }

    /**
     * 将 digest 事件整理结果 upsert 到真实事件表，供后续事件级召回与管理台读取。
     */
    /**
     * 在旧实现基础上补充已有事件继承与人工编辑保护。
     */
    function buildEventAssignmentMapV2(charId, candidates, eventPlans, existingEventMap) {
        const candidateMap = new Map();
        (Array.isArray(candidates) ? candidates : []).forEach(function putCandidate(item) {
            const id = toTrimmedString(item && item.id);
            if (!id) return;
            candidateMap.set(id, item);
        });

        const assignmentMap = new Map();
        const eventRecords = [];
        const existingMap = existingEventMap instanceof Map ? existingEventMap : new Map();
        const existingContext = normalizeExistingEventContext({ map: existingMap });
        const plans = Array.isArray(eventPlans) ? eventPlans : [];
        for (let i = 0; i < plans.length; i += 1) {
            const plan = plans[i];
            if (!plan || typeof plan !== 'object') continue;

            const memoryIds = (Array.isArray(plan.memoryIds) ? plan.memoryIds : [])
                .map(toTrimmedString)
                .filter(function keepId(id) {
                    return !!id && candidateMap.has(id);
                });
            if (memoryIds.length === 0) continue;

            const resolvedExisting = resolveExistingEventLink(
                Object.assign({}, plan, { memoryIds: memoryIds }),
                candidateMap,
                existingContext
            );
            const planEventId = toTrimmedString(plan.id);
            const inheritedEventId = toTrimmedString(resolvedExisting && resolvedExisting.eventId);
            const eventId = inheritedEventId || planEventId || createStableEventId(charId, memoryIds, i);
            const existingRecord = (resolvedExisting && resolvedExisting.existingRecord)
                || existingMap.get(eventId)
                || null;
            const manualEdited = !!(existingRecord && existingRecord.manual_edited);
            const overriddenModelPlanId = planEventId && planEventId !== eventId
                ? planEventId
                : '';
            const incomingStatus = normalizeEventStatus(
                plan.status
                || (existingRecord && existingRecord.status)
                || (plan.isUnresolved ? 'open' : 'closed')
            );
            const status = manualEdited
                ? normalizeEventStatus(existingRecord && existingRecord.status)
                : incomingStatus;
            const incomingDepth = normalizeEventDepth(
                plan.depth || (existingRecord && existingRecord.depth)
            );
            const depth = manualEdited
                ? normalizeEventDepth(existingRecord && existingRecord.depth)
                : incomingDepth;
            const incomingUnresolved = plan.isUnresolved !== undefined
                ? toBoolean(plan.isUnresolved)
                : (existingRecord ? toBoolean(existingRecord.is_unresolved) : incomingStatus === 'open');
            const unresolved = manualEdited
                ? !!(existingRecord && existingRecord.is_unresolved)
                : incomingUnresolved;
            const carryForwardState = deriveDigestEventCarryForwardState(existingRecord, {
                maxCount: 96,
                anchorMemoryId: toTrimmedString(plan.anchorMemoryId)
                    || toTrimmedString(existingRecord && existingRecord.anchor_memory_id)
                    || memoryIds[0]
            });
            const mergedMemberIds = mergeUniqueIds(
                memoryIds,
                carryForwardState.preservedMemberIds,
                96
            );
            const anchorMemoryId = toTrimmedString(plan.anchorMemoryId)
                || toTrimmedString(existingRecord && existingRecord.anchor_memory_id)
                || memoryIds[0];
            const detailMemoryIds = mergeUniqueIds(
                Array.isArray(plan.detailMemoryIds) && plan.detailMemoryIds.length > 0
                    ? plan.detailMemoryIds
                    : memoryIds,
                existingRecord ? existingRecord.detail_memory_ids : [],
                24
            );
            const anchorCandidate = candidateMap.get(anchorMemoryId)
                || candidateMap.get(memoryIds[0])
                || candidateMap.get(mergedMemberIds[0]);
            const anchorContent = toTrimmedString(anchorCandidate && anchorCandidate.content);
            const title = toTrimmedString(plan.title)
                || toTrimmedString(existingRecord && existingRecord.title)
                || anchorContent.slice(0, 20)
                || `记忆事件 ${i + 1}`;
            const summary = toTrimmedString(plan.summary)
                || toTrimmedString(existingRecord && existingRecord.summary)
                || anchorContent.slice(0, 120)
                || '这是一段被整理出来的记忆事件。';
            const incomingSalienceScore = clampNumber(
                plan.salienceScore,
                0,
                1,
                0.4
            );
            const salienceScore = clampNumber(
                existingRecord && existingRecord.manual_edited
                    ? existingRecord.salience_score
                    : incomingSalienceScore,
                0,
                1,
                0.4
            );
            const incomingContinuationKey = toTrimmedString(resolvedExisting && resolvedExisting.continuationKey)
                || toTrimmedString(plan.continuationKey)
                || toTrimmedString(existingRecord && existingRecord.continuation_key);
            const continuationKey = incomingContinuationKey;
            const protectedTitle = manualEdited
                ? (
                    toTrimmedString(existingRecord && existingRecord.title)
                    || title
                )
                : title;
            const protectedSummary = manualEdited
                ? toTrimmedString(existingRecord && existingRecord.summary)
                : summary;
            const protectedSalienceScore = clampNumber(
                manualEdited
                    ? existingRecord && existingRecord.salience_score
                    : salienceScore,
                0,
                1,
                0.4
            );
            const protectedContinuationKey = manualEdited
                ? toTrimmedString(existingRecord && existingRecord.continuation_key)
                : continuationKey;
            const linkMeta = pickPreferredDigestLinkMeta(
                plan && plan.linkMeta,
                resolvedExisting && resolvedExisting.linkMeta
            );
            const coherenceState = manualEdited
                ? {
                    anchorMemoryId: anchorMemoryId,
                    memoryIds: mergedMemberIds.slice(),
                    detailMemoryIds: detailMemoryIds.slice(),
                    droppedMemoryIds: [],
                    coherenceScore: 1,
                    mixedRisk: false,
                    reasonTags: ['manual_edited_event'],
                    evaluations: []
                }
                : filterDigestEventMembersByCoherence(mergedMemberIds, candidateMap, {
                    eventId: eventId,
                    continuationKey: protectedContinuationKey,
                    anchorMemoryId: anchorMemoryId,
                    detailMemoryIds: detailMemoryIds,
                    flashbulbMemoryIds: existingRecord ? existingRecord.event_flashbulb_memory_ids : [],
                    title: title,
                    summary: summary,
                    existingRecord: existingRecord,
                    planMemoryIds: memoryIds,
                    carryForwardMemberIds: carryForwardState.preservedMemberIds
                });
            const filteredMemberIds = Array.isArray(coherenceState.memoryIds) && coherenceState.memoryIds.length > 0
                ? coherenceState.memoryIds.slice()
                : [anchorMemoryId].filter(Boolean);
            const filteredDetailIds = mergeUniqueIds(
                Array.isArray(coherenceState.detailMemoryIds) ? coherenceState.detailMemoryIds : [],
                filteredMemberIds,
                24
            );
            const filteredAnchorMemoryId = toTrimmedString(coherenceState.anchorMemoryId)
                || filteredDetailIds[0]
                || filteredMemberIds[0]
                || anchorMemoryId;
            const eventDateTs = getMemoryTimestamp(anchorCandidate);
            const eventDate = toTrimmedString(existingRecord && existingRecord.event_date)
                || (Number.isFinite(eventDateTs) ? new Date(eventDateTs).toISOString() : '');
            const eventPatch = {
                event_id: eventId,
                event_title: protectedTitle,
                event_summary: protectedSummary,
                event_status: status,
                event_depth: depth,
                event_fragment_count: manualEdited
                    ? Math.max(
                        filteredMemberIds.length,
                        Math.floor(toFiniteNumber(existingRecord && existingRecord.fragment_count, 0))
                    )
                    : filteredMemberIds.length,
                event_is_unresolved: unresolved,
                event_salience_score: protectedSalienceScore,
                event_depth_score: clampNumber(
                    existingRecord && existingRecord.manual_edited
                        ? existingRecord.depth_score
                        : mapEventDepthToScore(depth),
                    0,
                    1,
                    mapEventDepthToScore(depth)
                ),
                continuation_key: protectedContinuationKey,
                event_date: eventDate,
                event_anchor_memory_id: filteredAnchorMemoryId,
                event_detail_memory_ids: filteredDetailIds,
                event_plan_reason: toTrimmedString(plan.reason)
            };
            if (overriddenModelPlanId) {
                eventPatch.event_model_plan_id = overriddenModelPlanId;
            }
            if (linkMeta) {
                eventPatch.event_link_source = toTrimmedString(linkMeta.source) || null;
                eventPatch.event_link_score = toFiniteNumber(linkMeta.score, 0);
                eventPatch.event_link_tags = Array.isArray(linkMeta.tags) ? linkMeta.tags.slice(0, 8) : [];
                eventPatch.event_link_overlap_count = Math.max(
                    0,
                    Math.floor(
                        toFiniteNumber(linkMeta.memberOverlapCount, 0)
                        + toFiniteNumber(linkMeta.detailOverlapCount, 0)
                    )
                );
                eventPatch.event_link_title_similarity = clampNumber(linkMeta.titleSimilarity, 0, 1, 0);
                eventPatch.event_link_summary_similarity = clampNumber(linkMeta.summarySimilarity, 0, 1, 0);
                eventPatch.event_link_delta_hours = linkMeta.deltaHours !== null && linkMeta.deltaHours !== undefined
                    ? Math.max(0, toFiniteNumber(linkMeta.deltaHours, 0))
                    : null;
            }
            const memberRows = getDigestEventMemberRows(filteredMemberIds, candidateMap);
            const sourceEvidence = collectEventSourceEvidenceMetadata(
                memberRows,
                existingRecord && existingRecord.metadata
            );
            const stabilityProfile = buildDigestEventStabilityProfile(
                memberRows,
                existingRecord,
                {
                    sourceEvidence: sourceEvidence,
                    title: protectedTitle,
                    summary: protectedSummary,
                    anchorText: anchorContent,
                    continuationKey: protectedContinuationKey
                }
            );
            const stabilityAssessment = deriveDigestEventStabilityAssessment(
                stabilityProfile,
                memberRows,
                existingRecord,
                {
                    memberCount: filteredMemberIds.length
                }
            );
            const signalProfile = deriveDigestEventSignalProfile(memberRows, {
                existingRecord: existingRecord,
                depth: depth,
                unresolved: unresolved
            });
            const effectiveSalienceScore = clampNumber(
                existingRecord && existingRecord.manual_edited
                    ? existingRecord.salience_score
                    : Math.max(incomingSalienceScore, signalProfile.salienceScore),
                0,
                1,
                0.4
            );
            const incomingDepthScore = clampNumber(
                mapEventDepthToScore(incomingDepth),
                0,
                1,
                mapEventDepthToScore(incomingDepth)
            );
            const manualGuardAttempt = manualEdited
                ? deriveEventPlanManualGuardAttempt(plan, existingRecord, incomingContinuationKey)
                : null;
            const manualGuardState = buildEventManualGuardState(existingRecord, manualGuardAttempt || {
                title: title,
                summary: summary,
                status: incomingStatus,
                depth: incomingDepth,
                isUnresolved: incomingUnresolved,
                continuationKey: incomingContinuationKey,
                salienceScore: effectiveSalienceScore,
                depthScore: incomingDepthScore
            }, {
                source: 'digest_event_plan',
                planReason: plan.reason,
                linkSource: linkMeta ? linkMeta.source : '',
                modelPlanId: overriddenModelPlanId
            });
            const flashbulbInfo = deriveDigestEventFlashbulbState(memberRows, existingRecord, {
                signalProfile: signalProfile,
                anchorMemoryId: filteredAnchorMemoryId,
                detailMemoryIds: filteredDetailIds,
                depth: depth,
                unresolved: unresolved
            });
            eventPatch.event_salience_score = effectiveSalienceScore;
            eventPatch.event_signal_profile = signalProfile;
            eventPatch.event_signal_tags = Array.isArray(signalProfile.reasonTags)
                ? signalProfile.reasonTags.slice(0, 10)
                : [];
            eventPatch.event_is_flashbulb = flashbulbInfo.isFlashbulb;
            eventPatch.event_flashbulb_memory_ids = flashbulbInfo.memoryIds;
            eventPatch.event_flashbulb_score = flashbulbInfo.score;
            eventPatch.event_flashbulb_reason_tags = Array.isArray(flashbulbInfo.reasonTags)
                ? flashbulbInfo.reasonTags.slice(0, 8)
                : [];
            eventPatch.event_stability_signature = toTrimmedString(stabilityProfile.signature) || null;
            eventPatch.event_stability_primary_term = toTrimmedString(stabilityProfile.primaryTerm) || null;
            eventPatch.event_stability_terms = Array.isArray(stabilityProfile.terms)
                ? stabilityProfile.terms.slice(0, 12)
                : [];
            eventPatch.event_stability_time_start = toTrimmedString(stabilityProfile.sourceTimeStart) || null;
            eventPatch.event_stability_time_end = toTrimmedString(stabilityProfile.sourceTimeEnd) || null;
            eventPatch.event_stability_source_message_ids = Array.isArray(stabilityProfile.sourceMessageIds)
                ? stabilityProfile.sourceMessageIds.slice(0, 24)
                : [];
            let startTs = Number.POSITIVE_INFINITY;
            let endTs = Number.NEGATIVE_INFINITY;
            memberRows.forEach(function trackRange(member) {
                const ts = getMemoryTimestamp(member);
                if (!Number.isFinite(ts)) return;
                if (ts < startTs) startTs = ts;
                if (ts > endTs) endTs = ts;
            });
            const anchorRow = anchorCandidate || memberRows[0] || null;
            const roomId = toTrimmedString(anchorRow && anchorRow.room_id)
                || toTrimmedString(existingRecord && existingRecord.room_id)
                || null;
            const contextScope = toTrimmedString(anchorRow && anchorRow.context_scope)
                || toTrimmedString(existingRecord && existingRecord.context_scope)
                || (roomId ? 'room' : 'private')
                || 'private';
            const eventMetadata = Object.assign(
                {},
                existingRecord && existingRecord.metadata ? existingRecord.metadata : {},
                {
                    source: 'digest_event_plan',
                    event_plan_reason: toTrimmedString(plan.reason),
                    event_signal_profile: signalProfile,
                    event_signal_tags: Array.isArray(signalProfile.reasonTags) ? signalProfile.reasonTags.slice(0, 10) : [],
                    event_is_flashbulb: flashbulbInfo.isFlashbulb,
                    event_flashbulb_memory_ids: flashbulbInfo.memoryIds,
                    event_flashbulb_score: flashbulbInfo.score,
                    event_flashbulb_reason_tags: Array.isArray(flashbulbInfo.reasonTags) ? flashbulbInfo.reasonTags.slice(0, 8) : [],
                    event_link_meta: linkMeta ? Object.assign({}, linkMeta) : null,
                    event_link_source: linkMeta ? (toTrimmedString(linkMeta.source) || null) : null,
                    event_link_score: linkMeta ? toFiniteNumber(linkMeta.score, 0) : null,
                    source_message_ids: sourceEvidence.source_message_ids,
                    source_time_start: sourceEvidence.source_time_start || null,
                    source_time_end: sourceEvidence.source_time_end || null,
                    surface_aliases: sourceEvidence.surface_aliases,
                    context_focus_terms: Array.isArray(sourceEvidence.context_focus_terms)
                        ? sourceEvidence.context_focus_terms.slice(0, 6)
                        : [],
                    context_scope_terms: Array.isArray(sourceEvidence.context_scope_terms)
                        ? sourceEvidence.context_scope_terms.slice(0, 12)
                        : [],
                    context_support_terms: Array.isArray(sourceEvidence.context_support_terms)
                        ? sourceEvidence.context_support_terms.slice(0, 8)
                        : [],
                    event_stability_signature: toTrimmedString(stabilityProfile.signature) || null,
                    event_stability_primary_term: toTrimmedString(stabilityProfile.primaryTerm) || null,
                    event_stability_terms: Array.isArray(stabilityProfile.terms)
                        ? stabilityProfile.terms.slice(0, 12)
                        : [],
                    event_stability_time_start: toTrimmedString(stabilityProfile.sourceTimeStart) || null,
                    event_stability_time_end: toTrimmedString(stabilityProfile.sourceTimeEnd) || null,
                    event_stability_source_message_ids: Array.isArray(stabilityProfile.sourceMessageIds)
                        ? stabilityProfile.sourceMessageIds.slice(0, 24)
                        : [],
                    event_stability_tier: toTrimmedString(stabilityAssessment.tier) || 'stable',
                    event_stability_reason_tags: Array.isArray(stabilityAssessment.reasonTags)
                        ? stabilityAssessment.reasonTags.slice(0, 8)
                        : [],
                    event_stability_risk_score: Math.max(0, toFiniteNumber(stabilityAssessment.riskScore, 0)),
                    event_manual_guard_applied: manualGuardState.applied,
                    event_manual_guard_source: manualGuardState.source,
                    event_manual_guard_fields: manualGuardState.fields,
                    event_manual_guard_blocked_fields: manualGuardState.blockedFields.slice(0, 8),
                    event_carry_forward_trimmed: carryForwardState.trimmed,
                    event_carry_forward_reason: carryForwardState.reason,
                    event_carry_forward_existing_member_count: carryForwardState.existingMemberCount,
                    event_carry_forward_preserved_member_count: carryForwardState.preservedMemberCount,
                    event_carry_forward_structural_member_count: carryForwardState.structuralMemberCount,
                    event_member_filter_applied: !manualEdited,
                    event_member_coherence_score: clampNumber(coherenceState.coherenceScore, 0, 1, 0),
                    event_member_coherence_tags: Array.isArray(coherenceState.reasonTags)
                        ? coherenceState.reasonTags.slice(0, 8)
                        : [],
                    event_member_outlier_ids: Array.isArray(coherenceState.droppedMemoryIds)
                        ? coherenceState.droppedMemoryIds.slice(0, 24)
                        : [],
                    event_member_kept_count: filteredMemberIds.length,
                    event_member_dropped_count: Array.isArray(coherenceState.droppedMemoryIds)
                        ? coherenceState.droppedMemoryIds.length
                        : 0,
                    event_mixed_risk: !!coherenceState.mixedRisk
                }
            );
            if (manualGuardState.entry) {
                eventMetadata.last_event_manual_guard = Object.assign({}, manualGuardState.entry);
            }
            if (carryForwardState.entry) {
                eventMetadata.last_event_carry_forward = Object.assign({}, carryForwardState.entry);
            }
            if (overriddenModelPlanId) {
                eventMetadata.event_model_plan_id = overriddenModelPlanId;
            } else {
                delete eventMetadata.event_model_plan_id;
            }
            eventRecords.push(Object.assign({}, eventPatch, {
                room_id: roomId,
                context_scope: contextScope,
                memory_ids: filteredMemberIds.slice(),
                start_at: Number.isFinite(startTs)
                    ? new Date(startTs).toISOString()
                    : (toTrimmedString(existingRecord && existingRecord.start_at) || null),
                end_at: Number.isFinite(endTs)
                    ? new Date(endTs).toISOString()
                    : (toTrimmedString(existingRecord && existingRecord.end_at) || null),
                last_related_at: Number.isFinite(endTs)
                    ? new Date(endTs).toISOString()
                    : (toTrimmedString(existingRecord && existingRecord.last_related_at) || eventDate || null),
                manual_edited: manualEdited,
                manual_note: toTrimmedString(existingRecord && existingRecord.manual_note),
                metadata: eventMetadata
            }));

            const assignedIncomingMemberIds = memoryIds.filter(function keepAssignedId(memoryId) {
                return filteredMemberIds.includes(toTrimmedString(memoryId));
            });
            for (let j = 0; j < assignedIncomingMemberIds.length; j += 1) {
                const memoryId = assignedIncomingMemberIds[j];
                assignmentMap.set(
                    memoryId,
                    pickPreferredDigestEventPatch(
                        memoryId,
                        assignmentMap.get(memoryId) || null,
                        eventPatch,
                        candidateMap
                    )
                );
            }
        }

        const ownershipMap = new Map();
        assignmentMap.forEach(function rememberOwner(patch, memoryId) {
            const safeMemoryId = toTrimmedString(memoryId);
            const ownerEventId = toTrimmedString(patch && patch.event_id);
            if (!safeMemoryId || !ownerEventId) return;
            ownershipMap.set(safeMemoryId, ownerEventId);
        });

        const finalizedEventRecords = eventRecords.map(function finalizeEventRecord(record) {
            const eventId = toTrimmedString(record && record.event_id);
            if (!eventId) return null;

            const memberIds = filterEventIdsByIncomingOwnership(
                Array.isArray(record && record.memory_ids) ? record.memory_ids : [],
                eventId,
                ownershipMap,
                96
            );
            if (memberIds.length === 0) return null;

            const detailIds = mergeUniqueIds(
                filterEventIdsByIncomingOwnership(
                    Array.isArray(record && record.event_detail_memory_ids) ? record.event_detail_memory_ids : [],
                    eventId,
                    ownershipMap,
                    24
                ),
                memberIds,
                24
            );
            const flashbulbIds = filterEventIdsByIncomingOwnership(
                Array.isArray(record && record.event_flashbulb_memory_ids) ? record.event_flashbulb_memory_ids : [],
                eventId,
                ownershipMap,
                24
            );
            const anchorMemoryId = memberIds.includes(toTrimmedString(record && record.event_anchor_memory_id))
                ? toTrimmedString(record && record.event_anchor_memory_id)
                : (detailIds[0] || memberIds[0] || null);
            const flashbulbFlag = toBoolean(record && record.event_is_flashbulb) || flashbulbIds.length > 0;

            return Object.assign({}, record, {
                memory_ids: memberIds,
                event_fragment_count: memberIds.length,
                event_anchor_memory_id: anchorMemoryId,
                event_detail_memory_ids: detailIds,
                event_is_flashbulb: flashbulbFlag,
                event_flashbulb_memory_ids: flashbulbIds,
                metadata: Object.assign(
                    {},
                    record && record.metadata && typeof record.metadata === 'object' ? record.metadata : {},
                    {
                        event_is_flashbulb: flashbulbFlag,
                        event_flashbulb_memory_ids: flashbulbIds
                    }
                )
            });
        }).filter(Boolean);

        const finalizedEventMap = new Map();
        finalizedEventRecords.forEach(function putRecord(record) {
            const eventId = toTrimmedString(record && record.event_id);
            if (!eventId) return;
            finalizedEventMap.set(eventId, record);
        });

        const assignmentDeletes = [];
        const assignmentUpdates = [];
        assignmentMap.forEach(function syncAssignment(patch, memoryId) {
            const eventId = toTrimmedString(patch && patch.event_id);
            const record = finalizedEventMap.get(eventId) || null;
            if (!record) {
                assignmentDeletes.push(memoryId);
                return;
            }
            assignmentUpdates.push({
                memoryId: memoryId,
                patch: Object.assign({}, patch, {
                    event_fragment_count: Math.max(0, Math.floor(toFiniteNumber(record.event_fragment_count, 0))),
                    event_anchor_memory_id: toTrimmedString(record.event_anchor_memory_id) || null,
                    event_detail_memory_ids: Array.isArray(record.event_detail_memory_ids)
                        ? record.event_detail_memory_ids.slice(0, 24)
                        : [],
                    event_is_flashbulb: !!record.event_is_flashbulb,
                    event_flashbulb_memory_ids: Array.isArray(record.event_flashbulb_memory_ids)
                        ? record.event_flashbulb_memory_ids.slice(0, 24)
                        : []
                })
            });
        });
        assignmentDeletes.forEach(function removeAssignment(memoryId) {
            assignmentMap.delete(memoryId);
        });
        assignmentUpdates.forEach(function applyAssignment(update) {
            assignmentMap.set(update.memoryId, update.patch);
        });

        return {
            candidateMap: candidateMap,
            assignmentMap: assignmentMap,
            eventRecords: finalizedEventRecords
        };
    }

    async function upsertEventRecords(supabase, userId, charId, eventRecords) {
        const safeUserId = toTrimmedString(userId);
        const safeCharId = toTrimmedString(charId);
        if (!supabase || !safeUserId || !safeCharId) {
            return 0;
        }

        const rows = (Array.isArray(eventRecords) ? eventRecords : []).map(function toEventRow(record) {
            const eventId = toTrimmedString(record && record.event_id);
            if (!eventId) return null;

            const memberIds = (Array.isArray(record && record.memory_ids) ? record.memory_ids : [])
                .map(toTrimmedString)
                .filter(Boolean);
            const detailIds = mergeUniqueIds(
                Array.isArray(record && record.event_detail_memory_ids)
                    ? record.event_detail_memory_ids
                    : memberIds,
                memberIds,
                24
            );
            const flashbulbIds = mergeUniqueIds(
                Array.isArray(record && record.event_flashbulb_memory_ids)
                    ? record.event_flashbulb_memory_ids
                    : [],
                [],
                24
            );
            const roomId = toTrimmedString(record && record.room_id) || null;
            const contextScope = toTrimmedString(record && record.context_scope) || (roomId ? 'room' : 'private');

            return {
                id: eventId,
                user_id: safeUserId,
                char_id: safeCharId,
                room_id: roomId,
                context_scope: contextScope,
                title: toTrimmedString(record && record.event_title) || `记忆事件(${eventId.slice(0, 8)})`,
                summary: toTrimmedString(record && record.event_summary) || '',
                status: normalizeEventStatus(record && record.event_status),
                depth: normalizeEventDepth(record && record.event_depth),
                is_unresolved: record && record.event_is_unresolved !== undefined
                    ? toBoolean(record.event_is_unresolved)
                    : false,
                continuation_key: toTrimmedString(record && record.continuation_key) || null,
                event_date: toTrimmedString(record && record.event_date) || null,
                fragment_count: Math.max(0, Math.floor(toFiniteNumber(
                    record && record.event_fragment_count,
                    memberIds.length
                ))),
                salience_score: clampNumber(record && record.event_salience_score, 0, 1, 0.4),
                depth_score: clampNumber(
                    record && record.event_depth_score,
                    0,
                    1,
                    mapEventDepthToScore(record && record.event_depth)
                ),
                anchor_memory_id: toTrimmedString(record && record.event_anchor_memory_id) || null,
                memory_ids: memberIds,
                detail_memory_ids: detailIds,
                start_at: toTrimmedString(record && record.start_at) || null,
                end_at: toTrimmedString(record && record.end_at) || null,
                last_related_at: toTrimmedString(record && record.last_related_at) || null,
                metadata: Object.assign(
                    {},
                    record && record.metadata && typeof record.metadata === 'object' ? record.metadata : {},
                    {
                        source: 'digest_event_plan',
                        event_plan_reason: toTrimmedString(record && record.event_plan_reason) || '',
                        event_is_flashbulb: toBoolean(record && record.event_is_flashbulb) || flashbulbIds.length > 0,
                        event_flashbulb_memory_ids: flashbulbIds
                    }
                )
            };
        }).filter(Boolean);
        if (rows.length <= 0) {
            return 0;
        }

        try {
            const response = await supabase
                .from('hippocampus_memory_events')
                .upsert(rows, {
                    onConflict: 'user_id,char_id,id'
                })
                .select('id');

            if (response && response.error) {
                throw response.error;
            }
            return Array.isArray(response && response.data) ? response.data.length : rows.length;
        } catch (error) {
            console.warn('[海马体][消化] ⚠️ 事件表 upsert 失败，已跳过。', error && error.message ? error.message : error);
            return 0;
        }
    }

    /**
     * 把 digest 事件整理结果回写到记忆 metadata，并同步到顶层事件字段。
     */
    /**
     * 在 upsert 真实事件表时保护 manual_edited 事件，避免 digest 覆盖人工整理结果。
     */
    async function upsertEventRecordsProtected(supabase, userId, charId, eventRecords, existingEventMap, touchedExistingEventIds) {
        const safeUserId = toTrimmedString(userId);
        const safeCharId = toTrimmedString(charId);
        if (!supabase || !safeUserId || !safeCharId) {
            return {
                upsertedCount: 0,
                manualGuardHitCount: 0,
                retiredEventCount: 0
            };
        }

        const existingMap = existingEventMap instanceof Map ? existingEventMap : new Map();
        const digestedAt = new Date().toISOString();
        const incomingOwnershipMap = new Map();
        (Array.isArray(eventRecords) ? eventRecords : []).forEach(function collectOwnership(record) {
            const eventId = toTrimmedString(record && record.event_id);
            if (!eventId) return;
            (Array.isArray(record && record.memory_ids) ? record.memory_ids : []).forEach(function rememberOwner(memoryId) {
                const safeMemoryId = toTrimmedString(memoryId);
                if (!safeMemoryId) return;
                incomingOwnershipMap.set(safeMemoryId, eventId);
            });
        });

        const rows = (Array.isArray(eventRecords) ? eventRecords : []).map(function toEventRow(record) {
            const eventId = toTrimmedString(record && record.event_id);
            if (!eventId) return null;

            const existingRecord = existingMap.get(eventId) || null;
            const filteredExistingMemberIds = filterEventIdsByIncomingOwnership(
                existingRecord ? existingRecord.memory_ids : [],
                eventId,
                incomingOwnershipMap,
                96
            );
            const carryForwardState = deriveDigestEventCarryForwardState(existingRecord, {
                existingMemberIds: filteredExistingMemberIds,
                detailMemoryIds: filterEventIdsByIncomingOwnership(
                    existingRecord ? existingRecord.detail_memory_ids : [],
                    eventId,
                    incomingOwnershipMap,
                    24
                ),
                flashbulbMemoryIds: filterEventIdsByIncomingOwnership(
                    existingRecord ? existingRecord.event_flashbulb_memory_ids : [],
                    eventId,
                    incomingOwnershipMap,
                    24
                ),
                anchorMemoryId: toTrimmedString(record && record.event_anchor_memory_id)
                    || toTrimmedString(existingRecord && existingRecord.anchor_memory_id)
                    || null,
                maxCount: 96
            });
            const memberIds = mergeUniqueIds(
                Array.isArray(record && record.memory_ids) ? record.memory_ids : [],
                carryForwardState.preservedMemberIds,
                96
            );
            const detailIds = mergeUniqueIds(
                filterEventIdsByIncomingOwnership(
                    Array.isArray(record && record.event_detail_memory_ids)
                        ? record.event_detail_memory_ids
                        : memberIds,
                    eventId,
                    incomingOwnershipMap,
                    24
                ),
                carryForwardState.detailMemoryIds,
                24
            );
            const flashbulbIds = mergeUniqueIds(
                filterEventIdsByIncomingOwnership(
                    Array.isArray(record && record.event_flashbulb_memory_ids)
                        ? record.event_flashbulb_memory_ids
                        : [],
                    eventId,
                    incomingOwnershipMap,
                    24
                ),
                carryForwardState.flashbulbMemoryIds,
                24
            );
            const roomId = toTrimmedString(record && record.room_id)
                || toTrimmedString(existingRecord && existingRecord.room_id)
                || null;
            const contextScope = toTrimmedString(record && record.context_scope)
                || toTrimmedString(existingRecord && existingRecord.context_scope)
                || (roomId ? 'room' : 'private');
            const manualEdited = !!(existingRecord && existingRecord.manual_edited);
            const depth = normalizeEventDepth(
                manualEdited
                    ? existingRecord && existingRecord.depth
                    : (record && record.event_depth)
            );
            const status = normalizeEventStatus(
                manualEdited
                    ? existingRecord && existingRecord.status
                    : (record && record.event_status)
            );
            const unresolved = manualEdited
                ? !!(existingRecord && existingRecord.is_unresolved)
                : (record && record.event_is_unresolved !== undefined
                    ? toBoolean(record.event_is_unresolved)
                    : false);
            const flashbulbFlag = toBoolean(
                (record && record.event_is_flashbulb)
                || (existingRecord && existingRecord.event_is_flashbulb)
                || flashbulbIds.length > 0
            );
            const nextTitle = manualEdited
                ? (toTrimmedString(existingRecord && existingRecord.title) || `记忆事件(${eventId.slice(0, 8)})`)
                : (toTrimmedString(record && record.event_title) || toTrimmedString(existingRecord && existingRecord.title) || `记忆事件(${eventId.slice(0, 8)})`);
            const nextSummary = manualEdited
                ? toTrimmedString(existingRecord && existingRecord.summary)
                : (toTrimmedString(record && record.event_summary) || toTrimmedString(existingRecord && existingRecord.summary));
            const nextContinuationKey = manualEdited
                ? (toTrimmedString(existingRecord && existingRecord.continuation_key) || null)
                : (toTrimmedString(record && record.continuation_key) || toTrimmedString(existingRecord && existingRecord.continuation_key) || null);
            const nextAnchorMemoryId = toTrimmedString(record && record.event_anchor_memory_id)
                || toTrimmedString(existingRecord && existingRecord.anchor_memory_id)
                || null;
            const existingMetadata = existingRecord && existingRecord.metadata ? existingRecord.metadata : {};
            const incomingMetadata = record && record.metadata && typeof record.metadata === 'object'
                ? record.metadata
                : {};
            const latestManualGuardEntry = incomingMetadata.last_event_manual_guard
                && typeof incomingMetadata.last_event_manual_guard === 'object'
                ? Object.assign({}, incomingMetadata.last_event_manual_guard)
                : null;
            const latestCarryForwardEntry = incomingMetadata.last_event_carry_forward
                && typeof incomingMetadata.last_event_carry_forward === 'object'
                ? Object.assign({}, incomingMetadata.last_event_carry_forward, {
                    changed_at: toTrimmedString(incomingMetadata.last_event_carry_forward.changed_at) || digestedAt
                })
                : null;
            let nextMetadata = Object.assign(
                {},
                existingMetadata,
                incomingMetadata,
                {
                    source: 'digest_event_plan',
                    event_plan_reason: toTrimmedString(record && record.event_plan_reason) || '',
                    event_is_flashbulb: flashbulbFlag,
                    event_flashbulb_memory_ids: flashbulbIds
                }
            );
            if (latestManualGuardEntry) {
                nextMetadata = appendBoundedMetadataHistory(
                    nextMetadata,
                    'event_manual_guard_history',
                    latestManualGuardEntry,
                    8
                );
            }
            if (latestCarryForwardEntry) {
                nextMetadata = appendBoundedMetadataHistory(
                    nextMetadata,
                    'event_carry_forward_history',
                    latestCarryForwardEntry,
                    8
                );
            }
            if (existingRecord) {
                const changeFields = [];
                if (toTrimmedString(existingRecord.title) !== nextTitle) changeFields.push('title');
                if (toTrimmedString(existingRecord.summary) !== nextSummary) changeFields.push('summary');
                if (toTrimmedString(existingRecord.status) !== status) changeFields.push('status');
                if (toTrimmedString(existingRecord.depth) !== depth) changeFields.push('depth');
                if (!!existingRecord.is_unresolved !== unresolved) changeFields.push('unresolved');
                if (toTrimmedString(existingRecord.continuation_key) !== toTrimmedString(nextContinuationKey)) changeFields.push('continuation');
                if (toTrimmedString(existingRecord.anchor_memory_id) !== toTrimmedString(nextAnchorMemoryId)) changeFields.push('anchor');
                if (JSON.stringify(existingRecord.memory_ids || []) !== JSON.stringify(memberIds)) {
                    changeFields.push('members');
                }
                if (JSON.stringify(existingRecord.detail_memory_ids || []) !== JSON.stringify(detailIds)) {
                    changeFields.push('detail_members');
                }
                if (!!existingRecord.event_is_flashbulb !== !!flashbulbFlag) changeFields.push('flashbulb');
                if (JSON.stringify(existingRecord.event_flashbulb_memory_ids || []) !== JSON.stringify(flashbulbIds)) {
                    changeFields.push('flashbulb_members');
                }
                if (latestCarryForwardEntry && latestCarryForwardEntry.trimmed) {
                    changeFields.push('carry_forward_trimmed');
                }
                if (changeFields.length > 0) {
                    const metadataSource = record && record.metadata && typeof record.metadata === 'object' ? record.metadata : {};
                    const linkMeta = metadataSource.event_link_meta && typeof metadataSource.event_link_meta === 'object'
                        ? metadataSource.event_link_meta
                        : null;
                    const versionEntry = {
                        changed_at: digestedAt,
                        source: 'digest_event_plan',
                        change_fields: changeFields,
                        previous_title: clipMetadataHistoryText(existingRecord.title, 80),
                        next_title: clipMetadataHistoryText(nextTitle, 80),
                        previous_summary: clipMetadataHistoryText(existingRecord.summary, 180),
                        next_summary: clipMetadataHistoryText(nextSummary, 180),
                        previous_status: toTrimmedString(existingRecord.status),
                        next_status: status,
                        previous_depth: toTrimmedString(existingRecord.depth),
                        next_depth: depth,
                        previous_unresolved: !!existingRecord.is_unresolved,
                        next_unresolved: unresolved,
                        previous_continuation_key: toTrimmedString(existingRecord.continuation_key),
                        next_continuation_key: toTrimmedString(nextContinuationKey),
                        previous_anchor_memory_id: toTrimmedString(existingRecord.anchor_memory_id),
                        next_anchor_memory_id: toTrimmedString(nextAnchorMemoryId),
                        previous_member_count: Array.isArray(existingRecord.memory_ids)
                            ? existingRecord.memory_ids.length
                            : Math.max(0, Math.floor(toFiniteNumber(existingRecord.fragment_count, 0))),
                        next_member_count: memberIds.length,
                        previous_detail_count: Array.isArray(existingRecord.detail_memory_ids)
                            ? existingRecord.detail_memory_ids.length
                            : 0,
                        next_detail_count: detailIds.length,
                        previous_flashbulb: !!existingRecord.event_is_flashbulb,
                        next_flashbulb: !!flashbulbFlag,
                        previous_flashbulb_memory_ids: Array.isArray(existingRecord.event_flashbulb_memory_ids)
                            ? existingRecord.event_flashbulb_memory_ids.slice(0, 12)
                            : [],
                        next_flashbulb_memory_ids: flashbulbIds.slice(0, 12)
                    };
                    const eventPlanReason = toTrimmedString(record && record.event_plan_reason);
                    const linkSource = toTrimmedString(
                        metadataSource.event_link_source
                        || (linkMeta && linkMeta.source)
                    );
                    if (eventPlanReason) versionEntry.event_plan_reason = clipMetadataHistoryText(eventPlanReason, 120);
                    if (linkSource) versionEntry.link_source = linkSource;
                    if (linkMeta && linkMeta.score !== undefined) {
                        versionEntry.link_score = clampNumber(linkMeta.score, 0, 1, 0);
                    }
                    if (latestCarryForwardEntry && latestCarryForwardEntry.trimmed) {
                        versionEntry.carry_forward = Object.assign({}, latestCarryForwardEntry);
                    }
                    nextMetadata = appendMetadataHistoryEntry(
                        nextMetadata,
                        'event_version_history',
                        versionEntry,
                        10
                    );
                }
            }

            return {
                id: eventId,
                user_id: safeUserId,
                char_id: safeCharId,
                room_id: roomId,
                context_scope: contextScope,
                title: nextTitle,
                summary: nextSummary,
                status: status,
                depth: depth,
                is_unresolved: unresolved,
                continuation_key: nextContinuationKey,
                event_date: toTrimmedString(record && record.event_date)
                    || toTrimmedString(existingRecord && existingRecord.event_date)
                    || null,
                fragment_count: memberIds.length,
                salience_score: clampNumber(
                    manualEdited
                        ? existingRecord && existingRecord.salience_score
                        : (record && record.event_salience_score),
                    0,
                    1,
                    0.4
                ),
                depth_score: clampNumber(
                    manualEdited
                        ? existingRecord && existingRecord.depth_score
                        : (record && record.event_depth_score),
                    0,
                    1,
                    mapEventDepthToScore(depth)
                ),
                anchor_memory_id: nextAnchorMemoryId,
                memory_ids: memberIds,
                detail_memory_ids: detailIds,
                start_at: toTrimmedString(record && record.start_at)
                    || toTrimmedString(existingRecord && existingRecord.start_at)
                    || null,
                end_at: toTrimmedString(record && record.end_at)
                    || toTrimmedString(existingRecord && existingRecord.end_at)
                    || null,
                last_related_at: toTrimmedString(record && record.last_related_at)
                    || toTrimmedString(existingRecord && existingRecord.last_related_at)
                    || null,
                manual_edited: manualEdited,
                manual_note: toTrimmedString(record && record.manual_note)
                    || toTrimmedString(existingRecord && existingRecord.manual_note)
                    || null,
                metadata: nextMetadata
            };
        }).filter(Boolean);
        const incomingEventIds = new Set(rows.map(function mapEventId(row) {
            return toTrimmedString(row && row.id);
        }).filter(Boolean));
        const retiredRows = buildRetiredDigestEventRows(
            existingMap,
            touchedExistingEventIds,
            incomingOwnershipMap,
            incomingEventIds,
            {
                userId: safeUserId,
                charId: safeCharId,
                retiredAt: digestedAt
            }
        );
        const rowsToUpsert = rows.concat(retiredRows);
        if (rowsToUpsert.length <= 0) {
            return {
                upsertedCount: 0,
                manualGuardHitCount: 0,
                retiredEventCount: 0
            };
        }

        let manualGuardHitCount = 0;
        rowsToUpsert.forEach(function collectManualGuardHits(row) {
            const metadata = normalizeMetadata(row && row.metadata);
            const history = Array.isArray(metadata.event_manual_guard_history)
                ? metadata.event_manual_guard_history
                : [];
            const latestGuard = metadata.last_event_manual_guard && typeof metadata.last_event_manual_guard === 'object'
                ? metadata.last_event_manual_guard
                : (history.length > 0 ? history[history.length - 1] : null);
            if (latestGuard && Array.isArray(latestGuard.blocked_fields) && latestGuard.blocked_fields.length > 0) {
                manualGuardHitCount += 1;
            }
        });

        try {
            const response = await supabase
                .from('hippocampus_memory_events')
                .upsert(rowsToUpsert, {
                    onConflict: 'user_id,char_id,id'
                })
                .select('id');

            if (response && response.error) {
                throw response.error;
            }
            return {
                upsertedCount: Array.isArray(response && response.data) ? response.data.length : rowsToUpsert.length,
                manualGuardHitCount: manualGuardHitCount,
                retiredEventCount: retiredRows.length
            };
        } catch (error) {
            console.warn('[海马体][消化] ⚠️ 事件表 upsert 失败，已跳过。', error && error.message ? error.message : error);
            return {
                upsertedCount: 0,
                manualGuardHitCount: manualGuardHitCount,
                retiredEventCount: retiredRows.length
            };
        }
    }

    async function applyEventPlanUpdates(supabase, userId, charId, candidates, eventPlans, existingEventRecords) {
        const safeUserId = toTrimmedString(userId);
        const safeCharId = toTrimmedString(charId);
        if (!supabase || !safeUserId || !safeCharId) {
            return {
                updatedCount: 0,
                eventCount: 0,
                assignedCount: 0,
                orphanCount: 0,
                eventPersistedCount: 0,
                manualGuardHitCount: 0,
                retiredEventCount: 0
            };
        }

        const plans = Array.isArray(eventPlans) ? eventPlans : [];
        if (plans.length === 0) {
            return {
                updatedCount: 0,
                eventCount: 0,
                assignedCount: 0,
                orphanCount: 0,
                eventPersistedCount: 0,
                manualGuardHitCount: 0,
                retiredEventCount: 0
            };
        }

        const existingEventMap = existingEventRecords && existingEventRecords.map instanceof Map
            ? existingEventRecords.map
            : new Map();
        const assignment = buildEventAssignmentMapV2(safeCharId, candidates, plans, existingEventMap);
        const candidateRows = Array.from(assignment.candidateMap.values());
        const touchedExistingEventIds = new Set();
        candidateRows.forEach(function collectTouchedEventId(row) {
            const metadata = normalizeMetadata(row && row.metadata);
            const existingEventId = toTrimmedString(
                row && (row.existing_event_id || row.event_id)
                || metadata.event_id
                || metadata.eventId
                || metadata.memory_event_id
            );
            if (existingEventId) touchedExistingEventIds.add(existingEventId);
        });
        const assignmentMap = assignment.assignmentMap;
        const eventRecordMetadataById = new Map();
        (Array.isArray(assignment.eventRecords) ? assignment.eventRecords : []).forEach(function rememberEventMetadata(record) {
            const eventId = toTrimmedString(record && record.event_id);
            if (!eventId) return;
            eventRecordMetadataById.set(eventId, normalizeMetadata(record && record.metadata));
        });
        if (assignmentMap.size === 0) {
            return {
                updatedCount: 0,
                eventCount: 0,
                assignedCount: 0,
                orphanCount: 0,
                eventPersistedCount: 0,
                manualGuardHitCount: 0,
                retiredEventCount: 0
            };
        }

        let updatedCount = 0;
        let assignedCount = 0;
        let orphanCount = 0;

        for (let i = 0; i < candidateRows.length; i += 1) {
            const row = candidateRows[i];
            const memoryId = toTrimmedString(row && row.id);
            if (!memoryId) continue;

            const metadata = normalizeMetadata(row && row.metadata);
            const patch = assignmentMap.get(memoryId);
            const eventMetadata = patch
                ? (eventRecordMetadataById.get(toTrimmedString(patch && patch.event_id)) || null)
                : null;
            let nextMetadata = metadata;

            if (patch) {
                assignedCount += 1;
                nextMetadata = Object.assign({}, metadata, patch, {
                    event_id: patch.event_id,
                    memory_event_id: patch.event_id,
                    is_orphan_fragment: false
                });
                if (eventMetadata && eventMetadata.event_manual_guard_applied) {
                    nextMetadata.event_manual_guard_applied = true;
                    nextMetadata.event_manual_guard_source = toTrimmedString(eventMetadata.event_manual_guard_source) || 'manual_edited_event';
                    nextMetadata.event_manual_guard_fields = Array.isArray(eventMetadata.event_manual_guard_fields)
                        ? eventMetadata.event_manual_guard_fields.slice(0, 12)
                        : [];
                    nextMetadata.event_manual_guard_blocked_fields = Array.isArray(eventMetadata.event_manual_guard_blocked_fields)
                        ? eventMetadata.event_manual_guard_blocked_fields.slice(0, 8)
                        : [];
                    if (eventMetadata.last_event_manual_guard && typeof eventMetadata.last_event_manual_guard === 'object') {
                        nextMetadata.last_event_manual_guard = Object.assign({}, eventMetadata.last_event_manual_guard);
                    } else {
                        delete nextMetadata.last_event_manual_guard;
                    }
                    if (Array.isArray(eventMetadata.event_manual_guard_history)) {
                        nextMetadata.event_manual_guard_history = eventMetadata.event_manual_guard_history
                            .filter(function keepEntry(item) {
                                return !!item && typeof item === 'object';
                            })
                            .slice(-8);
                    } else {
                        delete nextMetadata.event_manual_guard_history;
                    }
                } else {
                    delete nextMetadata.event_manual_guard_applied;
                    delete nextMetadata.event_manual_guard_source;
                    delete nextMetadata.event_manual_guard_fields;
                    delete nextMetadata.event_manual_guard_blocked_fields;
                    delete nextMetadata.last_event_manual_guard;
                    delete nextMetadata.event_manual_guard_history;
                }
                if (!patch.continuation_key) {
                    delete nextMetadata.continuation_key;
                }
            } else {
                const existingEventId = toTrimmedString(
                    metadata.event_id
                    || metadata.eventId
                    || metadata.memory_event_id
                );
                if (!existingEventId) {
                    orphanCount += 1;
                    nextMetadata = Object.assign({}, metadata, {
                        is_orphan_fragment: true
                    });
                }
            }

            const metadataChanged = JSON.stringify(nextMetadata) !== JSON.stringify(metadata);
            if (!metadataChanged && !patch) {
                continue;
            }

            try {
                const updatePayload = {};
                if (metadataChanged) {
                    updatePayload.metadata = nextMetadata;
                }
                if (patch) {
                    Object.assign(updatePayload, {
                        event_id: patch.event_id,
                        event_title: patch.event_title,
                        event_summary: patch.event_summary,
                        event_status: patch.event_status,
                        event_depth: patch.event_depth,
                        event_date: patch.event_date || null,
                        event_fragment_count: Math.max(0, Math.floor(toFiniteNumber(patch.event_fragment_count, 0))),
                        event_is_unresolved: toBoolean(patch.event_is_unresolved),
                        event_salience_score: clampNumber(patch.event_salience_score, 0, 1, 0.4),
                        event_depth_score: clampNumber(patch.event_depth_score, 0, 1, mapEventDepthToScore(patch.event_depth)),
                        continuation_key: toTrimmedString(patch.continuation_key) || null,
                        event_anchor_memory_id: toTrimmedString(patch.event_anchor_memory_id) || null,
                        event_detail_memory_ids: Array.isArray(patch.event_detail_memory_ids)
                            ? patch.event_detail_memory_ids.map(toTrimmedString).filter(Boolean)
                            : []
                    });
                }
                const updateResult = await supabase
                    .from('hippocampus_memories')
                    .update(updatePayload)
                    .eq('id', memoryId)
                    .eq('user_id', safeUserId)
                    .eq('char_id', safeCharId)
                    .select('id')
                    .limit(1);

                if (updateResult && updateResult.error) {
                    const updateErrorText = toTrimmedString(updateResult.error && updateResult.error.message).toLowerCase();
                    const missingEventColumns = patch
                        && metadataChanged
                        && (updateErrorText.includes('event_') || updateErrorText.includes('continuation_key'))
                        && (updateErrorText.includes('column') || updateErrorText.includes('schema cache'));
                    if (missingEventColumns) {
                        const fallbackResult = await supabase
                            .from('hippocampus_memories')
                            .update({
                                metadata: nextMetadata
                            })
                            .eq('id', memoryId)
                            .eq('user_id', safeUserId)
                            .eq('char_id', safeCharId)
                            .select('id')
                            .limit(1);
                        if (fallbackResult && fallbackResult.error) {
                            throw fallbackResult.error;
                        }
                        const fallbackAffected = Array.isArray(fallbackResult && fallbackResult.data) ? fallbackResult.data.length : 0;
                        if (fallbackAffected > 0) {
                            updatedCount += 1;
                        }
                        continue;
                    }
                    throw updateResult.error;
                }
                const affected = Array.isArray(updateResult && updateResult.data) ? updateResult.data.length : 0;
                if (affected > 0) {
                    updatedCount += 1;
                }
            } catch (error) {
                console.warn('[海马体][消化] ⚠️ 事件回写失败，已跳过。', error && error.message ? error.message : error);
            }
        }

        const eventIdSet = new Set();
        assignmentMap.forEach(function collectEventId(patch) {
            const id = toTrimmedString(patch && patch.event_id);
            if (id) eventIdSet.add(id);
        });
        const eventPersistResult = await upsertEventRecordsProtected(
            supabase,
            safeUserId,
            safeCharId,
            assignment.eventRecords,
            existingEventMap,
            touchedExistingEventIds
        );

        return {
            updatedCount: updatedCount,
            eventCount: eventIdSet.size,
            assignedCount: assignedCount,
            orphanCount: orphanCount,
            eventPersistedCount: Math.max(
                0,
                Math.floor(toFiniteNumber(
                    eventPersistResult && eventPersistResult.upsertedCount !== undefined
                        ? eventPersistResult.upsertedCount
                        : eventPersistResult,
                    0
                ))
            ),
            manualGuardHitCount: Math.max(
                0,
                Math.floor(toFiniteNumber(eventPersistResult && eventPersistResult.manualGuardHitCount, 0))
            ),
            retiredEventCount: Math.max(
                0,
                Math.floor(toFiniteNumber(eventPersistResult && eventPersistResult.retiredEventCount, 0))
            )
        };
    }

    /**
     * 把 digest 的“最近24h变化”写入管理台可视化记录（若管理台客户端已挂载）。
     */
    async function persistDigestOutcome(charId, payload) {
        const safeCharId = toTrimmedString(charId);
        if (!safeCharId) return false;
        const adminClient = root && root.HippocampusAdminClient && typeof root.HippocampusAdminClient === 'object'
            ? root.HippocampusAdminClient
            : null;
        if (!adminClient || typeof adminClient.upsertDigestOutcomeRecord !== 'function') {
            return false;
        }

        try {
            const result = await Promise.resolve(
                adminClient.upsertDigestOutcomeRecord(safeCharId, Object.assign({}, payload, {
                    manualEdited: false
                }))
            );
            return !!(result && result.ok);
        } catch (_) {
            return false;
        }
    }

    /**
     * 调用认知消化模型并返回解析结果。
     */
    async function requestDigestDecision(prompt, apiConfig) {
        const fetchImpl = getFetchImplementation();
        const config = normalizeApiConfig(apiConfig);
        if (!fetchImpl || !config.apiUrl || !config.model) {
            return null;
        }

        const requestUrl = normalizeChatCompletionsUrl(config.apiUrl);
        if (!requestUrl) return null;

        const headers = Object.assign(
            {
                'Content-Type': 'application/json'
            },
            config.headers
        );
        if (config.apiKey && !headers.Authorization && !headers.authorization) {
            headers.Authorization = `Bearer ${config.apiKey}`;
        }

        const body = Object.assign({}, config.requestBody, {
            model: config.model,
            temperature: config.temperature,
            max_tokens: config.maxTokens,
            messages: [
                {
                    role: 'user',
                    content: prompt
                }
            ]
        });

        const response = await fetchImpl(requestUrl, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(body)
        });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const rawText = await response.text();
        let payload = rawText;
        try {
            payload = JSON.parse(rawText);
        } catch (_) {
            payload = rawText;
        }
        return parseDigestResponse(payload);
    }

    /**
     * 规范化红线复核结果项，只接受 confirm / reject 两种结论。
     */
    function normalizeRedlineReviewItem(item) {
        const source = item && typeof item === 'object' ? item : null;
        if (!source) return null;

        const id = toTrimmedString(source.id || source.redlineId || source.redline_id);
        const decision = toTrimmedString(source.decision || source.result || source.action).toLowerCase();
        if (!id || (decision !== 'confirm' && decision !== 'reject')) {
            return null;
        }

        return {
            id: id,
            decision: decision,
            reason: toTrimmedString(source.reason || source.note || source.comment || '')
        };
    }

    /**
     * 解析红线复核模型输出。
     */
    function parseRedlineReviewResponse(llmResponse) {
        try {
            let parsed = null;
            if (llmResponse && typeof llmResponse === 'object' && !Array.isArray(llmResponse)) {
                parsed = llmResponse;
            } else {
                const rawText = typeof llmResponse === 'string' ? llmResponse : JSON.stringify(llmResponse || '');
                const candidate = extractJsonCandidate(rawText);
                if (!candidate) return [];
                parsed = JSON.parse(candidate);
            }

            const rawList = Array.isArray(parsed && parsed.results)
                ? parsed.results
                : (Array.isArray(parsed && parsed.redlines)
                    ? parsed.redlines
                    : (Array.isArray(parsed) ? parsed : []));

            return rawList.map(normalizeRedlineReviewItem).filter(Boolean);
        } catch (error) {
            console.warn('[海马体][消化] ⚠️ 红线复核解析失败，已跳过。', error && error.message ? error.message : error);
            return [];
        }
    }

    /**
     * 调用模型执行红线二次复核。
     */
    async function requestRedlineReviewDecision(prompt, apiConfig) {
        const fetchImpl = getFetchImplementation();
        const config = normalizeApiConfig(apiConfig);
        if (!fetchImpl || !config.apiUrl || !config.model) {
            return [];
        }

        const requestUrl = normalizeChatCompletionsUrl(config.apiUrl);
        if (!requestUrl) return [];

        const headers = Object.assign(
            {
                'Content-Type': 'application/json'
            },
            config.headers
        );
        if (config.apiKey && !headers.Authorization && !headers.authorization) {
            headers.Authorization = `Bearer ${config.apiKey}`;
        }

        const body = Object.assign({}, config.requestBody, {
            model: config.model,
            temperature: 0.1,
            max_tokens: Math.min(1200, Math.max(500, Number(config.maxTokens) || 800)),
            messages: [
                {
                    role: 'user',
                    content: prompt
                }
            ]
        });

        const response = await fetchImpl(requestUrl, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(body)
        });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const rawText = await response.text();
        let payload = rawText;
        try {
            payload = JSON.parse(rawText);
        } catch (_) {
            payload = rawText;
        }
        return parseRedlineReviewResponse(payload);
    }

    /**
     * 构建“待确认红线”复核 Prompt，避免把一时抱怨误判成长期底线。
     */
    function generatePendingRedlineReviewPrompt(redlines, candidates, charName, char) {
        const safeName = toTrimmedString(charName) || '角色';
        const safeChar = char && typeof char === 'object' ? char : {};
        const candidateMap = new Map();
        const recentCandidates = (Array.isArray(candidates) ? candidates : []).slice().sort(function sortByTime(a, b) {
            return getMemoryTimestamp(a) - getMemoryTimestamp(b);
        });

        recentCandidates.forEach(function putCandidate(item) {
            const id = toTrimmedString(item && item.id);
            if (!id) return;
            candidateMap.set(id, item);
        });

        const recentContextLines = recentCandidates.slice(-24).map(function formatCandidate(item) {
            const id = toTrimmedString(item && item.id);
            const layer = toTrimmedString(item && item.memory_layer).toLowerCase() || 'buffer';
            const content = toTrimmedString(item && item.content).replace(/\s+/g, ' ');
            return `- ${id} [${layer}] ${content}`;
        });

        const redlineLines = (Array.isArray(redlines) ? redlines : []).map(function formatRedline(item) {
            const id = toTrimmedString(item && item.id);
            const evidenceIds = Array.isArray(item && item.source_memory_ids) ? item.source_memory_ids : [];
            const evidenceLines = evidenceIds.map(function mapEvidence(memoryId) {
                const matched = candidateMap.get(toTrimmedString(memoryId));
                if (!matched) return '';
                return `    - ${toTrimmedString(matched.content).replace(/\s+/g, ' ')}`;
            }).filter(Boolean).slice(0, 4);

            const lines = [
                `- id: ${id}`,
                `  content: ${toTrimmedString(item && item.content)}`,
                `  severity: ${toTrimmedString(item && item.severity) || 'important'}`,
                `  originContext: ${toTrimmedString(item && item.origin_context) || '（无）'}`
            ];
            if (evidenceLines.length > 0) {
                lines.push('  relatedMemories:');
                lines.push.apply(lines, evidenceLines);
            }
            return lines.join('\n');
        });

        return [
            `你正在帮 ${safeName} 复核一批“系统刚提取出来的用户红线候选”。`,
            '你的任务不是扩写规则，而是判断这些候选到底是不是“必须长期牢记、每次对话都要遵守的底线”。',
            '只有当用户表达的是稳定的原则、严重雷点、不可再犯的禁忌、明确要求长期遵守的规则时，才允许判定为 confirm。',
            '如果只是当下抱怨、一次性吐槽、临时不高兴、普通建议、可协商偏好，必须判定为 reject。',
            '请结合候选红线本身、originContext、以及本轮认知消化的聊天记忆上下文一起判断。',
            `当前 attachmentStyle: ${toTrimmedString(safeChar.attachmentStyle || safeChar.hippocampusAttachmentStyle || 'secure') || 'secure'}`,
            '',
            '输出要求：只返回 JSON，不要解释，不要 markdown。',
            '格式：{"results":[{"id":"红线id","decision":"confirm|reject","reason":"一句简短中文原因"}]}',
            '',
            '待复核红线：',
            redlineLines.join('\n\n') || '（无）',
            '',
            '本轮相关记忆上下文：',
            recentContextLines.join('\n') || '（无）'
        ].join('\n');
    }

    /**
     * 在认知消化末尾复核系统提取的待确认红线。
     */
    async function reviewPendingRedlines(supabase, userId, charId, candidates, charName, char, apiConfig) {
        const safeSupabase = supabase && typeof supabase.from === 'function' ? supabase : null;
        const safeUserId = toTrimmedString(userId);
        const safeCharId = toTrimmedString(charId);
        const notebookModule = root && root.HippocampusNotebook && typeof root.HippocampusNotebook === 'object'
            ? root.HippocampusNotebook
            : null;
        if (!safeSupabase || !safeUserId || !safeCharId || !notebookModule) {
            return {
                pendingCount: 0,
                confirmedCount: 0,
                rejectedCount: 0,
                skippedCount: 0
            };
        }

        try {
            const pendingResult = await safeSupabase
                .from('hippocampus_user_redlines')
                .select('id, content, severity, origin, origin_context, source_memory_ids, confirmed, is_active, created_at')
                .eq('user_id', safeUserId)
                .eq('char_id', safeCharId)
                .eq('origin', 'system_extracted')
                .eq('confirmed', false)
                .eq('is_active', true)
                .order('created_at', { ascending: true })
                .limit(24);

            if (pendingResult && pendingResult.error) {
                throw pendingResult.error;
            }

            const pendingRedlines = Array.isArray(pendingResult && pendingResult.data)
                ? pendingResult.data.map(function normalizeRow(row) {
                    return {
                        id: toTrimmedString(row && row.id),
                        content: toTrimmedString(row && row.content),
                        severity: toTrimmedString(row && row.severity).toLowerCase() || 'important',
                        origin_context: toTrimmedString(row && row.origin_context),
                        source_memory_ids: Array.isArray(row && row.source_memory_ids)
                            ? row.source_memory_ids.map(toTrimmedString).filter(Boolean)
                            : []
                    };
                }).filter(function keepRow(row) {
                    return !!(row && row.id && row.content);
                })
                : [];

            if (pendingRedlines.length <= 0) {
                return {
                    pendingCount: 0,
                    confirmedCount: 0,
                    rejectedCount: 0,
                    skippedCount: 0
                };
            }

            const prompt = generatePendingRedlineReviewPrompt(pendingRedlines, candidates, charName, char);
            const decisions = await requestRedlineReviewDecision(prompt, apiConfig);
            if (!Array.isArray(decisions) || decisions.length <= 0) {
                console.warn(`[海马体][消化] ⚠️ 红线确认未拿到有效结果，待确认 ${pendingRedlines.length} 条已暂时保留。`);
                return {
                    pendingCount: pendingRedlines.length,
                    confirmedCount: 0,
                    rejectedCount: 0,
                    skippedCount: pendingRedlines.length
                };
            }

            const decisionMap = new Map();
            decisions.forEach(function putDecision(item) {
                if (!item || !item.id) return;
                decisionMap.set(item.id, item);
            });

            let confirmedCount = 0;
            let rejectedCount = 0;
            let skippedCount = 0;

            for (let i = 0; i < pendingRedlines.length; i += 1) {
                const redline = pendingRedlines[i];
                const review = decisionMap.get(redline.id);
                if (!review) {
                    skippedCount += 1;
                    continue;
                }

                try {
                    if (review.decision === 'confirm' && typeof notebookModule.confirmRedline === 'function') {
                        await notebookModule.confirmRedline(safeSupabase, redline.id);
                        confirmedCount += 1;
                        console.log(
                            `[海马体][消化] ✅ 红线确认 -> id=${redline.id}, "${redline.content}" → 确认${review.reason ? ` (${review.reason})` : ''}`
                        );
                        continue;
                    }

                    if (review.decision === 'reject' && typeof notebookModule.deactivateRedline === 'function') {
                        await notebookModule.deactivateRedline(safeSupabase, redline.id);
                        rejectedCount += 1;
                        console.log(
                            `[海马体][消化] ✅ 红线否定 -> id=${redline.id}, "${redline.content}" → 判定为普通抱怨，已移除${review.reason ? ` (${review.reason})` : ''}`
                        );
                        continue;
                    }

                    skippedCount += 1;
                } catch (reviewError) {
                    skippedCount += 1;
                    console.warn(
                        `[海马体][消化] ⚠️ 红线复核写回失败 -> id=${redline.id}`,
                        reviewError && reviewError.message ? reviewError.message : reviewError
                    );
                }
            }

            console.log(
                `[海马体][消化] ✅ 红线确认 -> 待确认${pendingRedlines.length}条, 确认${confirmedCount}条, 否定${rejectedCount}条${skippedCount > 0 ? `, 跳过${skippedCount}条` : ''}`
            );
            return {
                pendingCount: pendingRedlines.length,
                confirmedCount: confirmedCount,
                rejectedCount: rejectedCount,
                skippedCount: skippedCount
            };
        } catch (error) {
            console.warn('[海马体][消化] ⚠️ 红线确认失败，已跳过本轮确认。', error && error.message ? error.message : error);
            return {
                pendingCount: 0,
                confirmedCount: 0,
                rejectedCount: 0,
                skippedCount: 0
            };
        }
    }

    /**
     * 执行一次认知消化：候选拉取、LLM 判定、层级迁移与角色特质更新。
     */
    async function digestMemories(userId, charId, charName, char, apiConfig) {
        const supabase = getSupabaseClient();
        const safeUserId = toTrimmedString(userId);
        const safeCharId = toTrimmedString(charId);
        if (!supabase || !safeUserId || !safeCharId) {
            return {
                ok: false,
                error: 'digest_context_invalid',
                migratedCount: 0,
                updatedTraits: false,
                selfInsight: '',
                eventizedCount: 0,
                assignedFragmentCount: 0,
                orphanFragmentCount: 0,
                digestSummary: '',
                eventChanges: '',
                fragmentChanges: '',
                digestRecordSaved: false
            };
        }

        try {
            const candidates = await fetchDigestCandidates(supabase, safeUserId, safeCharId);
            if (candidates.length === 0) {
                return {
                    ok: true,
                    noop: true,
                    noopReason: 'no_candidates',
                    migratedCount: 0,
                    updatedTraits: false,
                    selfInsight: '',
                    eventizedCount: 0,
                    assignedFragmentCount: 0,
                    orphanFragmentCount: 0,
                    digestSummary: '',
                    eventChanges: '',
                    fragmentChanges: '',
                    digestRecordSaved: false
                };
            }

            const recentDigestRecords = await listRecentDigestOutcomeRecords(safeCharId, DIGEST_RECENT_OUTCOME_HOURS);
            const recentGuard = buildDigestRecentOutcomeGuard(candidates, recentDigestRecords);
            const guardedCandidates = Array.isArray(recentGuard.candidates) ? recentGuard.candidates : [];
            if (recentGuard.droppedCount > 0) {
                console.log(
                    `[海马体][消化] ⏭️ 已跳过最近刚整理过的旧候选 ${recentGuard.droppedCount} 条，保留 ${guardedCandidates.length} 条新候选。`
                    + ` overlap=${recentGuard.overlapCount}/${candidates.length}, matched=${recentGuard.matchedCount}`
                );
            }
            if (guardedCandidates.length === 0) {
                return {
                    ok: true,
                    noop: true,
                    noopReason: 'recent_digest_overlap',
                    migratedCount: 0,
                    updatedTraits: false,
                    selfInsight: '',
                    eventizedCount: 0,
                    assignedFragmentCount: 0,
                    orphanFragmentCount: 0,
                    digestSummary: '',
                    eventChanges: '',
                    fragmentChanges: '',
                    digestRecordSaved: false
                };
            }

            const existingEventRecords = await fetchExistingEventRecords(
                supabase,
                safeUserId,
                safeCharId,
                guardedCandidates
            );
            const prompt = generateDigestPromptWithEvents(guardedCandidates, charName, char, existingEventRecords.list);
            const decision = await requestDigestDecision(prompt, apiConfig);
            if (!decision) {
                return {
                    ok: false,
                    error: 'digest_decision_empty',
                    migratedCount: 0,
                    updatedTraits: false,
                    selfInsight: '',
                    eventizedCount: 0,
                    assignedFragmentCount: 0,
                    orphanFragmentCount: 0,
                    digestSummary: '',
                    eventChanges: '',
                    fragmentChanges: '',
                    digestRecordSaved: false
                };
            }

            const eventPlansFromModelRaw = Array.isArray(decision.eventPlans) ? decision.eventPlans : [];
            const eventPlansFromModel = eventPlansFromModelRaw.length > 0
                ? stabilizeEventPlansWithExistingContext(eventPlansFromModelRaw, guardedCandidates, existingEventRecords)
                : [];
            const eventPlans = eventPlansFromModel.length > 0
                ? eventPlansFromModel
                : buildHeuristicEventPlans(guardedCandidates, existingEventRecords);

            console.log(
                `[海马体][消化] ✅ LLM 返回 -> 迁移${decision.migrations.length}条, 事件计划${eventPlansFromModel.length}条${eventPlansFromModel.length === 0 && eventPlans.length > 0 ? ' (已启用兜底)' : ''}, rumination=${decision.ruminationTendency === null ? 'unchanged' : decision.ruminationTendency}, attachment=${decision.attachmentStyle || 'unchanged'}, selfInsight="${decision.selfInsight || ''}"`
            );

            let migratedCount = 0;
            const candidateMap = new Map();
            guardedCandidates.forEach(function setCandidate(item) {
                const id = toTrimmedString(item && item.id);
                if (!id) return;
                candidateMap.set(id, item);
            });

            for (let index = 0; index < decision.migrations.length; index += 1) {
                const migration = decision.migrations[index];
                const memoryId = toTrimmedString(migration.id);
                const newLayer = toTrimmedString(migration.newLayer).toLowerCase();
                if (!memoryId || !VALID_LAYERS.has(newLayer)) continue;

                const source = candidateMap.get(memoryId);
                const oldLayer = toTrimmedString(source && source.memory_layer).toLowerCase();
                if (oldLayer && oldLayer === newLayer) continue;

                try {
                    const updateResult = await supabase
                        .from('hippocampus_memories')
                        .update({
                            memory_layer: newLayer
                        })
                        .eq('id', memoryId)
                        .eq('user_id', safeUserId)
                        .eq('char_id', safeCharId)
                        .select('id')
                        .limit(1);

                    if (updateResult && updateResult.error) {
                        throw updateResult.error;
                    }
                    const affected = updateResult && Array.isArray(updateResult.data) ? updateResult.data.length : 0;
                    if (affected > 0) {
                        migratedCount += 1;
                        console.log(`[海马体][消化] ✅ 迁移 -> ID=${memoryId}, ${oldLayer || 'unknown'}→${newLayer}${migration.reason ? ` (${migration.reason})` : ''}`);
                    }
                } catch (migrationError) {
                    console.warn('[海马体][消化] ⚠️ 迁移失败，已跳过。', migrationError && migrationError.message ? migrationError.message : migrationError);
                }
            }

            const safeChar = char && typeof char === 'object' ? char : null;
            const attachmentBefore = safeChar
                ? (toTrimmedString(safeChar.attachmentStyle || safeChar.hippocampusAttachmentStyle).toLowerCase() || 'secure')
                : '';
            const selfInsightBefore = safeChar && Array.isArray(safeChar.selfInsights) && safeChar.selfInsights.length > 0
                ? toTrimmedString(safeChar.selfInsights[safeChar.selfInsights.length - 1].text)
                : '';
            let updatedTraits = false;
            if (safeChar) {
                if (decision.ruminationTendency !== null) {
                    const oldRumination = clampNumber(
                        safeChar.ruminationTendency !== undefined ? safeChar.ruminationTendency : safeChar.hippocampusRuminationTendency,
                        0,
                        1,
                        0.3
                    );
                    safeChar.ruminationTendency = decision.ruminationTendency;
                    safeChar.hippocampusRuminationTendency = decision.ruminationTendency;
                    updatedTraits = true;
                    console.log(`[海马体][消化] ✅ 特质更新 -> rumination:${oldRumination.toFixed(2)}→${decision.ruminationTendency.toFixed(2)}`);
                }

                if (decision.recallStyle !== null) {
                    safeChar.recallStyle = decision.recallStyle;
                    safeChar.hippocampusRecallStyle = decision.recallStyle;
                    updatedTraits = true;
                    console.log('[海马体][消化] ✅ 特质更新 -> recallStyle 已更新');
                }

                if (decision.attachmentStyle !== null) {
                    const oldAttachment = toTrimmedString(
                        safeChar.attachmentStyle !== undefined
                            ? safeChar.attachmentStyle
                            : safeChar.hippocampusAttachmentStyle
                    ).toLowerCase() || 'secure';
                    safeChar.attachmentStyle = decision.attachmentStyle;
                    safeChar.hippocampusAttachmentStyle = decision.attachmentStyle;
                    updatedTraits = true;
                    console.log(`[海马体][消化] ✅ 特质更新 -> attachment:${oldAttachment}→${decision.attachmentStyle}`);

                    if (decision.ruminationTendency === null) {
                        const attachmentModule = root && root.HippocampusAttachment && typeof root.HippocampusAttachment === 'object'
                            ? root.HippocampusAttachment
                            : null;
                        if (attachmentModule && typeof attachmentModule.getDefaultRuminationForAttachment === 'function') {
                            const oldRumination = clampNumber(
                                safeChar.ruminationTendency !== undefined ? safeChar.ruminationTendency : safeChar.hippocampusRuminationTendency,
                                0,
                                1,
                                0.3
                            );
                            const defaultRumination = clampNumber(
                                attachmentModule.getDefaultRuminationForAttachment(decision.attachmentStyle),
                                0,
                                1,
                                0.3
                            );
                            safeChar.ruminationTendency = defaultRumination;
                            safeChar.hippocampusRuminationTendency = defaultRumination;
                            updatedTraits = true;
                            console.log(`[海马体][消化] ✅ 依恋联动 -> rumination:${oldRumination.toFixed(2)}→${defaultRumination.toFixed(2)}`);
                        }
                    }
                }

                if (decision.selfInsight) {
                    if (!Array.isArray(safeChar.selfInsights)) {
                        safeChar.selfInsights = [];
                    }
                    safeChar.selfInsights.push({
                        text: decision.selfInsight,
                        date: new Date().toISOString()
                    });
                    safeChar.selfInsights = safeChar.selfInsights.slice(-20);
                    updatedTraits = true;
                    console.log(`[海马体][消化] ✅ 自我认知 -> "${decision.selfInsight}"`);
                }
            }

            const eventUpdateResult = await applyEventPlanUpdates(
                supabase,
                safeUserId,
                safeCharId,
                guardedCandidates,
                eventPlans,
                existingEventRecords
            );
            if (eventUpdateResult.eventCount > 0) {
                console.log(
                    `[海马体][消化] ✅ 事件整理 -> 事件${eventUpdateResult.eventCount}个, 事件表${eventUpdateResult.eventPersistedCount}个, 并入${eventUpdateResult.assignedCount}条, 碎片${eventUpdateResult.orphanCount}条, 回写${eventUpdateResult.updatedCount}条, 手动保护${Math.max(0, Math.floor(toFiniteNumber(eventUpdateResult.manualGuardHitCount, 0)))}次, 退役旧事件${Math.max(0, Math.floor(toFiniteNumber(eventUpdateResult.retiredEventCount, 0)))}个`
                );
            }

            const nowIso = new Date().toISOString();
            const oldestCandidateTs = guardedCandidates.reduce(function reduceOldest(minValue, item) {
                const ts = getMemoryTimestamp(item);
                if (!Number.isFinite(ts)) return minValue;
                if (!Number.isFinite(minValue)) return ts;
                return Math.min(minValue, ts);
            }, Number.NaN);
            const digestSummary = toTrimmedString(decision.digestSummary)
                || `本轮已整理 ${eventUpdateResult.eventCount} 个记忆事件，保留 ${eventUpdateResult.orphanCount} 条记忆碎片。`;
            const eventChanges = toTrimmedString(decision.eventChanges)
                || `新增或更新 ${eventUpdateResult.eventCount} 个记忆事件。`;
            const fragmentChanges = toTrimmedString(decision.fragmentChanges)
                || `本轮并入事件 ${eventUpdateResult.assignedCount} 条，保持碎片 ${eventUpdateResult.orphanCount} 条。`;
            const attachmentAfter = safeChar
                ? (toTrimmedString(safeChar.attachmentStyle || safeChar.hippocampusAttachmentStyle).toLowerCase() || attachmentBefore)
                : attachmentBefore;
            const selfInsightAfter = decision.selfInsight || selfInsightBefore;
            const digestRecordSaved = await persistDigestOutcome(safeCharId, {
                windowStart: Number.isFinite(oldestCandidateTs) ? new Date(oldestCandidateTs).toISOString() : nowIso,
                windowEnd: nowIso,
                sourceMessageCount: guardedCandidates.length,
                attachmentBefore: attachmentBefore,
                attachmentAfter: attachmentAfter,
                selfInsightBefore: selfInsightBefore,
                selfInsightAfter: selfInsightAfter,
                digestSummary: digestSummary,
                eventChanges: eventChanges,
                fragmentChanges: fragmentChanges,
                relatedMemoryIds: guardedCandidates.map(function mapMemory(item) {
                    return toTrimmedString(item && item.id);
                }).filter(Boolean),
                relatedCandidateKeys: guardedCandidates.map(function mapRepeatKey(item) {
                    return buildDigestCandidateRepeatKey(item);
                }).filter(Boolean)
            });

            try {
                await reviewPendingRedlines(
                    supabase,
                    safeUserId,
                    safeCharId,
                    guardedCandidates,
                    charName,
                    char,
                    apiConfig
                );
            } catch (redlineReviewError) {
                console.warn(
                    '[海马体][消化] ⚠️ 红线确认附加步骤失败，已忽略，不影响本轮消化结果。',
                    redlineReviewError && redlineReviewError.message ? redlineReviewError.message : redlineReviewError
                );
            }

            let relationshipArcResult = null;
            try {
                const relationshipModule = root && root.HippocampusRelationshipArc && typeof root.HippocampusRelationshipArc === 'object'
                    ? root.HippocampusRelationshipArc
                    : null;
                if (relationshipModule && typeof relationshipModule.maybeUpdateAfterDigest === 'function') {
                    relationshipArcResult = await relationshipModule.maybeUpdateAfterDigest(
                        supabase,
                        safeUserId,
                        safeCharId,
                        {
                            apiConfig: apiConfig,
                            charLabel: toTrimmedString(charName || (char && (char.remark || char.name || char.displayName)) || safeCharId)
                        }
                    );
                }
            } catch (relationshipArcError) {
                console.warn(
                    '[海马体][消化] ⚠️ 关系脉络尾部更新失败，已忽略，不影响本轮消化结果。',
                    relationshipArcError && relationshipArcError.message ? relationshipArcError.message : relationshipArcError
                );
            }

            return {
                ok: true,
                migratedCount: migratedCount,
                updatedTraits: updatedTraits,
                selfInsight: decision.selfInsight || '',
                eventizedCount: eventUpdateResult.eventCount,
                assignedFragmentCount: eventUpdateResult.assignedCount,
                orphanFragmentCount: eventUpdateResult.orphanCount,
                digestSummary: digestSummary,
                eventChanges: eventChanges,
                fragmentChanges: fragmentChanges,
                digestRecordSaved: digestRecordSaved,
                relationshipArcUpdated: !!(relationshipArcResult && relationshipArcResult.ok && !relationshipArcResult.noop),
                relationshipArcAction: toTrimmedString(relationshipArcResult && relationshipArcResult.action)
            };
        } catch (error) {
            console.warn('[海马体][消化] ❌ 消化流程失败，已静默跳过。', error && error.message ? error.message : error);
            return {
                ok: false,
                error: toTrimmedString(error && error.message) || 'digest_failed',
                migratedCount: 0,
                updatedTraits: false,
                selfInsight: '',
                eventizedCount: 0,
                assignedFragmentCount: 0,
                orphanFragmentCount: 0,
                digestSummary: '',
                eventChanges: '',
                fragmentChanges: '',
                digestRecordSaved: false
            };
        }
    }

    return {
        shouldTriggerDigestion: shouldTriggerDigestion,
        digestMemories: digestMemories,
        generateDigestPrompt: generateDigestPrompt,
        parseDigestResponse: parseDigestResponse,
        __debug: {
            collectEventSourceEvidenceMetadata: collectEventSourceEvidenceMetadata,
            deriveDigestEventSignalProfile: deriveDigestEventSignalProfile,
            filterDigestEventMembersByCoherence: filterDigestEventMembersByCoherence,
            buildDigestEventStabilityProfile: buildDigestEventStabilityProfile,
            deriveDigestEventStabilityAssessment: deriveDigestEventStabilityAssessment,
            stabilizeEventPlansWithExistingContext: stabilizeEventPlansWithExistingContext,
            deriveDigestEventCarryForwardState: deriveDigestEventCarryForwardState,
            buildDigestCandidateRepeatKey: buildDigestCandidateRepeatKey,
            buildDigestRecentOutcomeGuard: buildDigestRecentOutcomeGuard,
            buildEventAssignmentMapV2: buildEventAssignmentMapV2,
            buildEventManualGuardState: buildEventManualGuardState,
            buildRetiredDigestEventRows: buildRetiredDigestEventRows,
            upsertEventRecordsProtected: upsertEventRecordsProtected
        }
    };
}
