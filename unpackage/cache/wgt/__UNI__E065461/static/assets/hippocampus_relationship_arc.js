/**
 * 初始化海马体关系脉络模块导出壳子。
 * 兼容浏览器全局和 CommonJS 两种加载方式。
 */
(function initHippocampusRelationshipArcModule(root) {
    const api = createHippocampusRelationshipArc(root);

    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }

    if (root && typeof root === 'object') {
        root.HippocampusRelationshipArc = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this));

/**
 * 创建海马体关系脉络实例。
 * 负责关系脉络的存储、生成、增量更新、回滚和 prompt 注入。
 */
function createHippocampusRelationshipArc(root) {
    const MODULE_NAME = '关系脉络';
    const STORAGE_KEY = 'idic_hippocampus_relationship_arc_store_v1';
    const TABLE_NAME = 'hippocampus_relationship_arcs';
    const VERSION_HISTORY_LIMIT = 5;
    const COLD_START_EVENT_MIN = 5;
    const COLD_START_FRAGMENT_MIN = 10;
    const FULL_EVENT_LIMIT = 180;
    const FULL_FRAGMENT_LIMIT = 220;
    const FULL_IMPORT_TEXT_LIMIT = 30000;
    const PROMPT_INJECTION_LIMIT = 36000;
    const TAIL_EVENT_THRESHOLD = 3;
    const TAIL_FRAGMENT_THRESHOLD = 24;
    const TAIL_STALE_DAYS = 7;
    const TAIL_CHECK_DAYS = 14;
    const DEFAULT_TEMPERATURE = 0.2;
    const DEFAULT_MAX_TOKENS = 5200;
    const COMPRESSION_TARGET_RATIO = 0.62;
    const COMPRESSION_MIN_TARGET_CHARS = 1800;
    const COMPRESSION_MAX_TARGET_CHARS = 12000;

    function createHippoScopedConsole(rootObject, moduleName) {
        const logger = rootObject && rootObject.HippocampusLogger && typeof rootObject.HippocampusLogger === 'object'
            ? rootObject.HippocampusLogger
            : null;
        const prefix = `[海马体][${moduleName}]`;

        function stringifyArgs(args) {
            const list = Array.isArray(args) ? args : [args];
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
                if (logger && typeof logger.hippoLog === 'function') {
                    logger.hippoLog(prefix + ' ' + stringifyArgs(Array.prototype.slice.call(arguments)));
                    return;
                }
                if (rootObject && rootObject.console && typeof rootObject.console.log === 'function') {
                    rootObject.console.log(prefix, stringifyArgs(Array.prototype.slice.call(arguments)));
                }
            },
            warn: function warn() {
                if (logger && typeof logger.hippoWarn === 'function') {
                    logger.hippoWarn(prefix + ' ' + stringifyArgs(Array.prototype.slice.call(arguments)));
                    return;
                }
                if (rootObject && rootObject.console && typeof rootObject.console.warn === 'function') {
                    rootObject.console.warn(prefix, stringifyArgs(Array.prototype.slice.call(arguments)));
                }
            },
            error: function error() {
                if (logger && typeof logger.hippoError === 'function') {
                    logger.hippoError(prefix + ' ' + stringifyArgs(Array.prototype.slice.call(arguments)));
                    return;
                }
                if (rootObject && rootObject.console && typeof rootObject.console.error === 'function') {
                    rootObject.console.error(prefix, stringifyArgs(Array.prototype.slice.call(arguments)));
                }
            }
        };
    }

    const console = createHippoScopedConsole(root, MODULE_NAME);

    function toTrimmedString(value) {
        return String(value === undefined || value === null ? '' : value).trim();
    }

    function toFiniteNumber(value, fallback) {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : fallback;
    }

    function clampNumber(value, min, max, fallback) {
        const numeric = toFiniteNumber(value, fallback);
        return Math.min(max, Math.max(min, numeric));
    }

    function toBoolean(value) {
        if (value === true || value === false) return value;
        const safe = toTrimmedString(value).toLowerCase();
        if (!safe) return false;
        return safe === '1' || safe === 'true' || safe === 'yes' || safe === 'on';
    }

    function estimateTokens(text) {
        const safe = toTrimmedString(text);
        if (!safe) return 0;
        return Math.ceil(safe.length / 3.6);
    }

    function buildArcTextStats(text) {
        const safe = toTrimmedString(text);
        return {
            chars: safe.length,
            tokens: estimateTokens(safe),
            lines: safe ? safe.split(/\r?\n/).length : 0
        };
    }

    function clipText(value, maxLength) {
        const safe = toTrimmedString(value);
        const safeMax = Math.max(0, Math.floor(toFiniteNumber(maxLength, 0)));
        if (!safeMax || safe.length <= safeMax) return safe;
        return safe.slice(0, safeMax);
    }

    function normalizeStringArray(value, limit) {
        const safeLimit = Math.max(0, Math.floor(toFiniteNumber(limit, 32)));
        const source = Array.isArray(value)
            ? value
            : (value === undefined || value === null || value === '' ? [] : [value]);
        const result = [];
        const seen = new Set();
        for (let i = 0; i < source.length; i += 1) {
            const safe = toTrimmedString(source[i]);
            if (!safe || seen.has(safe)) continue;
            seen.add(safe);
            result.push(safe);
            if (safeLimit > 0 && result.length >= safeLimit) break;
        }
        return result;
    }

    function parseJsonLike(value, fallback) {
        if (value && typeof value === 'object') return value;
        const safe = toTrimmedString(value);
        if (!safe) return fallback;
        try {
            return JSON.parse(safe);
        } catch (_) {
            return fallback;
        }
    }

    function getFetchImplementation() {
        if (typeof fetch === 'function') return fetch.bind(root);
        if (root && typeof root.fetch === 'function') return root.fetch.bind(root);
        return null;
    }

    function getBridge() {
        if (!root || typeof root !== 'object') return null;
        return root.IDIC_HippocampusBridge || null;
    }

    function getSupabaseClient() {
        const bridge = getBridge();
        if (!bridge || typeof bridge.getSupabaseClient !== 'function') return null;
        try {
            return bridge.getSupabaseClient() || null;
        } catch (_) {
            return null;
        }
    }

    function getUserId() {
        const bridge = getBridge();
        if (!bridge || typeof bridge.getUserId !== 'function') return '';
        try {
            return toTrimmedString(bridge.getUserId());
        } catch (_) {
            return '';
        }
    }

    function getPrimaryChatApiConfig() {
        const bridge = getBridge();
        if (bridge && typeof bridge.getPrimaryChatApiConfig === 'function') {
            try {
                const config = bridge.getPrimaryChatApiConfig();
                if (config && typeof config === 'object') {
                    return Object.assign({}, config);
                }
            } catch (_) { }
        }
        if (bridge && typeof bridge.getMainApiConfig === 'function') {
            try {
                const config = bridge.getMainApiConfig();
                if (config && typeof config === 'object') {
                    return Object.assign({}, config);
                }
            } catch (_) { }
        }
        if (bridge && typeof bridge.getDehydrateApiConfig === 'function') {
            try {
                const config = bridge.getDehydrateApiConfig();
                if (config && typeof config === 'object') {
                    return Object.assign({}, config);
                }
            } catch (_) { }
        }
        return {};
    }

    function getLegacyMigrationSource(charId) {
        const safeCharId = toTrimmedString(charId);
        const bridge = getBridge();
        if (!safeCharId || !bridge || typeof bridge.getMigrationSource !== 'function') return null;
        try {
            const source = bridge.getMigrationSource(safeCharId);
            return source && typeof source === 'object' ? Object.assign({}, source) : null;
        } catch (_) {
            return null;
        }
    }

    function normalizeApiConfig(apiConfig) {
        const source = apiConfig && typeof apiConfig === 'object' ? apiConfig : {};
        const headers = source.headers && typeof source.headers === 'object' ? source.headers : {};
        const requestBody = source.requestBody && typeof source.requestBody === 'object' ? source.requestBody : {};

        return {
            apiUrl: toTrimmedString(source.apiUrl || source.url || source.baseUrl),
            apiKey: toTrimmedString(source.apiKey || source.key),
            model: toTrimmedString(source.model || source.modelName),
            temperature: clampNumber(source.temperature, 0, 2, DEFAULT_TEMPERATURE),
            maxTokens: Math.max(512, Math.floor(toFiniteNumber(source.maxTokens || source.max_tokens, DEFAULT_MAX_TOKENS))),
            headers: Object.assign({}, headers),
            requestBody: Object.assign({}, requestBody)
        };
    }

    function normalizeChatCompletionsUrl(rawUrl) {
        const safe = toTrimmedString(rawUrl);
        if (!safe) return '';
        const lower = safe.toLowerCase();
        if (lower.endsWith('/chat/completions')) return safe;
        if (lower.endsWith('/v1')) return safe + '/chat/completions';
        if (lower.endsWith('/v1/')) return safe + 'chat/completions';
        if (safe.endsWith('/')) return safe + 'chat/completions';
        return safe + '/chat/completions';
    }

    function readLocalStorageStore() {
        if (!root || !root.localStorage || typeof root.localStorage.getItem !== 'function') {
            return {};
        }
        try {
            const raw = root.localStorage.getItem(STORAGE_KEY);
            const parsed = parseJsonLike(raw, {});
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (_) {
            return {};
        }
    }

    function writeLocalStorageStore(payload) {
        if (!root || !root.localStorage || typeof root.localStorage.setItem !== 'function') {
            return false;
        }
        try {
            root.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload || {}));
            return true;
        } catch (_) {
            return false;
        }
    }

    function makeStorageBucketKey(userId, charId) {
        return `${toTrimmedString(userId)}::${toTrimmedString(charId)}`;
    }

    function createArcId(charId) {
        const safeCharId = toTrimmedString(charId) || 'char';
        return `arc_${safeCharId}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    }

    function normalizeRelationshipState(value) {
        const source = value && typeof value === 'object' ? value : {};
        return {
            one_paragraph_summary: clipText(source.one_paragraph_summary || source.oneParagraphSummary, 1200),
            active_threads: normalizeStringArray(source.active_threads || source.activeThreads, 8),
            unresolved_tensions: normalizeStringArray(source.unresolved_tensions || source.unresolvedTensions, 8),
            stable_bonds: normalizeStringArray(source.stable_bonds || source.stableBonds, 8),
            shared_direction: normalizeStringArray(source.shared_direction || source.sharedDirection, 8)
        };
    }

    function normalizeArcKeyEvent(item, knownEventIds, knownFragmentIds) {
        const source = item && typeof item === 'object' ? item : {};
        const eventIdSet = knownEventIds instanceof Set ? knownEventIds : new Set();
        const fragmentIdSet = knownFragmentIds instanceof Set ? knownFragmentIds : new Set();
        return {
            date: clipText(source.date || source.time || source.period, 64),
            theme: clipText(source.theme || source.topic || source.label, 24),
            summary: clipText(source.summary || source.description, 1200),
            impact: clipText(source.impact || source.effect, 800),
            evidence_event_ids: normalizeStringArray(
                source.evidence_event_ids || source.evidenceEventIds,
                12
            ).filter(function keepKnown(id) {
                return eventIdSet.size <= 0 || eventIdSet.has(id);
            }),
            evidence_fragment_ids: normalizeStringArray(
                source.evidence_fragment_ids || source.evidenceFragmentIds,
                16
            ).filter(function keepKnown(id) {
                return fragmentIdSet.size <= 0 || fragmentIdSet.has(id);
            })
        };
    }

    function normalizeArcStage(stage, index, knownEventIds, knownFragmentIds) {
        const source = stage && typeof stage === 'object' ? stage : {};
        const keyEvents = Array.isArray(source.key_events || source.keyEvents)
            ? (source.key_events || source.keyEvents)
            : [];
        return {
            stage: Math.max(1, Math.floor(toFiniteNumber(source.stage, index + 1))),
            title: clipText(source.title || `阶段 ${index + 1}`, 80),
            period: clipText(source.period || source.time_range || source.timeRange, 120),
            relationship_shift: clipText(source.relationship_shift || source.relationshipShift || source.shift, 500),
            key_events: keyEvents
                .map(function mapEvent(item) {
                    return normalizeArcKeyEvent(item, knownEventIds, knownFragmentIds);
                })
                .filter(function keepEvent(item) {
                    return !!(item.summary || item.theme || item.date);
                })
                .slice(0, 6),
            ongoing_threads: normalizeStringArray(source.ongoing_threads || source.ongoingThreads, 8),
            inject_summary: clipText(source.inject_summary || source.injectSummary, 600),
            confidence: clampNumber(source.confidence, 0, 1, 0.72)
        };
    }

    function normalizeArcComparableText(value) {
        return toTrimmedString(value)
            .toLowerCase()
            .replace(/[\s`"'“”‘’.,，。!?！？:：;；/\\|()[\]{}<>【】（）_-]+/g, '');
    }

    function tokenizeArcComparableText(value) {
        const normalized = toTrimmedString(value)
            .toLowerCase()
            .replace(/[“”‘’"'`]/g, '')
            .split(/[\s,，。！？!?;；:：/\\|()[\]{}<>【】（）_-]+/)
            .map(function mapToken(item) {
                return normalizeArcComparableText(item);
            })
            .filter(Boolean);
        if (normalized.length > 0) return normalized;
        const fallback = normalizeArcComparableText(value);
        return fallback ? [fallback] : [];
    }

    function countArcComparableTokenOverlap(left, right) {
        const leftTokens = new Set(tokenizeArcComparableText(left));
        const rightTokens = new Set(tokenizeArcComparableText(right));
        if (leftTokens.size <= 0 || rightTokens.size <= 0) return 0;
        let overlap = 0;
        leftTokens.forEach(function countToken(token) {
            if (rightTokens.has(token)) overlap += 1;
        });
        return overlap;
    }

    function collectArcComparableNgrams(value, size) {
        const normalized = normalizeArcComparableText(value);
        const gramSize = Math.max(1, Math.floor(toFiniteNumber(size, 2)));
        if (!normalized) return [];
        if (normalized.length <= gramSize) return [normalized];
        const seen = new Set();
        const grams = [];
        for (let index = 0; index <= normalized.length - gramSize; index += 1) {
            const gram = normalized.slice(index, index + gramSize);
            if (!gram || seen.has(gram)) continue;
            seen.add(gram);
            grams.push(gram);
        }
        return grams;
    }

    function countArcComparableNgramOverlap(left, right, size) {
        const leftNgrams = new Set(collectArcComparableNgrams(left, size));
        const rightNgrams = new Set(collectArcComparableNgrams(right, size));
        if (leftNgrams.size <= 0 || rightNgrams.size <= 0) return 0;
        let overlap = 0;
        leftNgrams.forEach(function countGram(gram) {
            if (rightNgrams.has(gram)) overlap += 1;
        });
        return overlap;
    }

    function computeArcComparableNgramCoverage(sourceText, targetText, size) {
        const sourceNgrams = new Set(collectArcComparableNgrams(sourceText, size));
        if (sourceNgrams.size <= 0) return 0;
        return countArcComparableNgramOverlap(sourceText, targetText, size) / sourceNgrams.size;
    }

    function collectArcStageDateHints(stage) {
        const keyEvents = Array.isArray(stage && stage.key_events) ? stage.key_events : [];
        return normalizeStringArray(keyEvents.map(function mapDate(item) {
            return item && item.date;
        }).filter(Boolean), 12);
    }

    function collectArcStageThemeHints(stage) {
        const keyEvents = Array.isArray(stage && stage.key_events) ? stage.key_events : [];
        return normalizeStringArray(keyEvents.map(function mapTheme(item) {
            return item && item.theme;
        }).filter(Boolean), 12);
    }

    function buildArcKeyEventFingerprint(item) {
        const safeItem = item && typeof item === 'object' ? item : {};
        const dateKey = normalizeArcComparableText(safeItem.date);
        const themeKey = normalizeArcComparableText(safeItem.theme);
        const summaryKey = normalizeArcComparableText(safeItem.summary).slice(0, 120);
        return [dateKey, themeKey, summaryKey].filter(Boolean).join('|');
    }

    function scoreArcKeyEventMatch(seedEvent, candidateEvent) {
        const seed = seedEvent && typeof seedEvent === 'object' ? seedEvent : {};
        const candidate = candidateEvent && typeof candidateEvent === 'object' ? candidateEvent : {};
        const seedDate = normalizeArcComparableText(seed.date);
        const candidateDate = normalizeArcComparableText(candidate.date);
        const seedTheme = normalizeArcComparableText(seed.theme);
        const candidateTheme = normalizeArcComparableText(candidate.theme);
        const seedSummary = normalizeArcComparableText(seed.summary);
        const candidateSummary = normalizeArcComparableText(candidate.summary);
        let score = 0;
        if (seedDate && candidateDate && seedDate === candidateDate) score += 80;
        if (seedTheme && candidateTheme && seedTheme === candidateTheme) score += 55;
        if (seedSummary && candidateSummary && seedSummary === candidateSummary) score += 90;
        if (seedSummary && candidateSummary && (seedSummary.includes(candidateSummary) || candidateSummary.includes(seedSummary))) score += 36;
        score += Math.min(30, countArcComparableTokenOverlap(seed.summary, candidate.summary) * 8);
        score += Math.min(24, countArcComparableNgramOverlap(seed.summary, candidate.summary, 2) * 3);
        score += Math.min(18, countArcComparableTokenOverlap(seed.impact, candidate.impact) * 6);
        score += Math.min(10, countArcComparableNgramOverlap(seed.impact, candidate.impact, 2) * 2);
        return score;
    }

    function mergeArcKeyEventFromImportedSeed(seedEvent, candidateEvent) {
        const seed = seedEvent && typeof seedEvent === 'object' ? seedEvent : {};
        const candidate = candidateEvent && typeof candidateEvent === 'object' ? candidateEvent : {};
        return {
            date: clipText(seed.date || candidate.date, 64),
            theme: clipText(seed.theme || candidate.theme, 24),
            summary: clipText(seed.summary || candidate.summary, 1200),
            impact: clipText(candidate.impact || seed.impact, 800),
            evidence_event_ids: normalizeStringArray(
                []
                    .concat(Array.isArray(seed.evidence_event_ids) ? seed.evidence_event_ids : [])
                    .concat(Array.isArray(candidate.evidence_event_ids) ? candidate.evidence_event_ids : []),
                12
            ),
            evidence_fragment_ids: normalizeStringArray(
                []
                    .concat(Array.isArray(seed.evidence_fragment_ids) ? seed.evidence_fragment_ids : [])
                    .concat(Array.isArray(candidate.evidence_fragment_ids) ? candidate.evidence_fragment_ids : []),
                16
            )
        };
    }

    function mergeArcKeyEventsFromImportedSeed(seedEvents, candidateEvents) {
        const seeds = Array.isArray(seedEvents) ? seedEvents : [];
        const candidates = Array.isArray(candidateEvents) ? candidateEvents : [];
        const result = [];
        const usedCandidateIndexes = new Set();
        const usedFingerprints = new Set();

        seeds.forEach(function mergeSeed(seedEvent) {
            let bestIndex = -1;
            let bestScore = 0;
            for (let i = 0; i < candidates.length; i += 1) {
                if (usedCandidateIndexes.has(i)) continue;
                const score = scoreArcKeyEventMatch(seedEvent, candidates[i]);
                if (score > bestScore) {
                    bestScore = score;
                    bestIndex = i;
                }
            }
            const mergedEvent = mergeArcKeyEventFromImportedSeed(
                seedEvent,
                bestIndex >= 0 && bestScore >= 24 ? candidates[bestIndex] : null
            );
            if (bestIndex >= 0 && bestScore >= 24) {
                usedCandidateIndexes.add(bestIndex);
            }
            const fingerprint = buildArcKeyEventFingerprint(mergedEvent);
            if (fingerprint && usedFingerprints.has(fingerprint)) return;
            if (fingerprint) usedFingerprints.add(fingerprint);
            result.push(mergedEvent);
        });

        candidates.forEach(function appendUnmatched(candidateEvent, index) {
            if (usedCandidateIndexes.has(index)) return;
            if (!candidateEvent || !(candidateEvent.summary || candidateEvent.theme || candidateEvent.date)) return;
            const fingerprint = buildArcKeyEventFingerprint(candidateEvent);
            if (fingerprint && usedFingerprints.has(fingerprint)) return;
            if (fingerprint) usedFingerprints.add(fingerprint);
            result.push(candidateEvent);
        });

        return result
            .filter(function keepEvent(item) {
                return !!(item && (item.summary || item.theme || item.date));
            })
            .slice(0, 6);
    }

    function scoreArcStageMatch(seedStage, candidateStage, index) {
        const seed = seedStage && typeof seedStage === 'object' ? seedStage : {};
        const candidate = candidateStage && typeof candidateStage === 'object' ? candidateStage : {};
        const seedTitle = normalizeArcComparableText(seed.title);
        const candidateTitle = normalizeArcComparableText(candidate.title);
        const seedPeriod = normalizeArcComparableText(seed.period);
        const candidatePeriod = normalizeArcComparableText(candidate.period);
        let score = 0;
        if (seedTitle && candidateTitle && seedTitle === candidateTitle) score += 110;
        if (seedPeriod && candidatePeriod && seedPeriod === candidatePeriod) score += 55;
        if (Math.max(1, Math.floor(toFiniteNumber(candidate.stage, index + 1))) === index + 1) score += 18;
        if (countArcComparableTokenOverlap(seed.relationship_shift, candidate.relationship_shift) > 0) {
            score += 16;
        }

        const seedDates = collectArcStageDateHints(seed);
        const candidateDates = collectArcStageDateHints(candidate);
        const seedThemes = collectArcStageThemeHints(seed);
        const candidateThemes = collectArcStageThemeHints(candidate);
        score += Math.min(48, countArcComparableTokenOverlap(seedDates.join(' '), candidateDates.join(' ')) * 18);
        score += Math.min(32, countArcComparableTokenOverlap(seedThemes.join(' '), candidateThemes.join(' ')) * 10);
        score += Math.min(22, countArcComparableTokenOverlap(seed.title, candidate.title) * 8);
        return score;
    }

    function mergeArcStageFromImportedSeed(seedStage, candidateStage, index) {
        const seed = seedStage && typeof seedStage === 'object' ? seedStage : {};
        const candidate = candidateStage && typeof candidateStage === 'object' ? candidateStage : {};
        return {
            stage: index + 1,
            title: clipText(seed.title || candidate.title || buildStageFallbackTitle(index + 1), 80),
            period: clipText(seed.period || candidate.period, 120),
            relationship_shift: clipText(candidate.relationship_shift || seed.relationship_shift, 500),
            key_events: mergeArcKeyEventsFromImportedSeed(seed.key_events, candidate.key_events),
            ongoing_threads: normalizeStringArray(
                []
                    .concat(Array.isArray(seed.ongoing_threads) ? seed.ongoing_threads : [])
                    .concat(Array.isArray(candidate.ongoing_threads) ? candidate.ongoing_threads : []),
                8
            ),
            inject_summary: clipText(candidate.inject_summary || seed.inject_summary, 600),
            confidence: clampNumber(
                candidate.confidence !== undefined ? candidate.confidence : seed.confidence,
                0,
                1,
                0.72
            )
        };
    }

    function shouldUseImportedStructureSeed(material, options) {
        const safeMaterial = material && typeof material === 'object' ? material : {};
        const safeOptions = options && typeof options === 'object' ? options : {};
        const importedMode = isImportedRelationshipArcMode(safeMaterial, safeOptions);
        if (!importedMode) return false;
        const outline = safeMaterial.importedOutline && typeof safeMaterial.importedOutline === 'object'
            ? safeMaterial.importedOutline
            : parseImportedOutline(safeMaterial.importedText || safeMaterial.legacyYamlText || '');
        return Math.max(0, Math.floor(toFiniteNumber(outline.stageCount, 0))) >= 2
            && Math.max(0, Math.floor(toFiniteNumber(outline.keyEventCount, 0))) >= 3;
    }

    function buildStagePreservedManualImportDecision(parsed, material, options) {
        if (!shouldUseImportedStructureSeed(material, options)) return null;
        const safeMaterial = material && typeof material === 'object' ? material : {};
        const outline = safeMaterial.importedOutline && typeof safeMaterial.importedOutline === 'object'
            ? safeMaterial.importedOutline
            : parseImportedOutline(safeMaterial.importedText || safeMaterial.legacyYamlText || '');
        const outlineStages = Array.isArray(outline.stages) ? outline.stages : [];
        if (outlineStages.length <= 0) return null;

        const knownEventIds = new Set((Array.isArray(safeMaterial.events) ? safeMaterial.events : []).map(function mapEvent(item) {
            return toTrimmedString(item && item.id);
        }).filter(Boolean));
        const knownFragmentIds = new Set((Array.isArray(safeMaterial.fragments) ? safeMaterial.fragments : []).map(function mapFragment(item) {
            return toTrimmedString(item && item.id);
        }).filter(Boolean));
        const candidateStages = (Array.isArray(parsed && parsed.stages) ? parsed.stages : []).map(function mapStage(item, index) {
            return normalizeArcStage(item, index, knownEventIds, knownFragmentIds);
        });
        const usedCandidateIndexes = new Set();
        const mergedStages = outlineStages.map(function mergeStage(seedStage, index) {
            const normalizedSeed = normalizeArcStage(seedStage, index, knownEventIds, knownFragmentIds);
            let bestIndex = -1;
            let bestScore = -1;
            for (let i = 0; i < candidateStages.length; i += 1) {
                if (usedCandidateIndexes.has(i)) continue;
                const score = scoreArcStageMatch(normalizedSeed, candidateStages[i], index);
                if (score > bestScore) {
                    bestScore = score;
                    bestIndex = i;
                }
            }
            if (bestIndex >= 0 && bestScore >= 18) {
                usedCandidateIndexes.add(bestIndex);
            }
            return mergeArcStageFromImportedSeed(
                normalizedSeed,
                bestIndex >= 0 && bestScore >= 18 ? candidateStages[bestIndex] : null,
                index
            );
        }).filter(function keepStage(item) {
            return !!(item && (item.title || item.period || item.relationship_shift || item.key_events.length > 0 || item.inject_summary));
        });

        const currentRelationshipState = normalizeRelationshipState(
            parsed && (parsed.current_relationship_state || parsed.currentRelationshipState)
        );
        const normalizedState = hasRelationshipStateSignals(currentRelationshipState)
            ? currentRelationshipState
            : deriveRelationshipStateFromStages(mergedStages);
        const promptInjectionFull = composePromptInjectionFromStages({
            stages: mergedStages,
            current_relationship_state: normalizedState
        });
        const revisionNotes = normalizeStringArray(
            []
                .concat(Array.isArray(parsed && (parsed.revision_notes || parsed.revisionNotes))
                    ? (parsed.revision_notes || parsed.revisionNotes)
                    : [])
                .concat('manual_import_structure_preserved'),
            12
        );

        return {
            stages: mergedStages,
            current_relationship_state: normalizedState,
            prompt_injection_full: promptInjectionFull,
            revision_notes: revisionNotes
        };
    }

    function composePromptInjectionFromStagesLegacy(record) {
        const safeRecord = record && typeof record === 'object' ? record : {};
        const stages = Array.isArray(safeRecord.stages) ? safeRecord.stages : [];
        const state = normalizeRelationshipState(safeRecord.current_relationship_state || safeRecord.currentRelationshipState);
        const lines = [];

        if (stages.length <= 0) {
            if (state.one_paragraph_summary) {
                lines.push(state.one_paragraph_summary);
            }
            return lines.join('\n');
        }

        lines.push('这段关系的大致历程如下：');
        stages.forEach(function appendStage(stage, index) {
            const safeStage = stage && typeof stage === 'object' ? stage : {};
            const title = toTrimmedString(safeStage.title) || `阶段 ${index + 1}`;
            const period = toTrimmedString(safeStage.period);
            const stagePrefix = `${index + 1}. ${title}${period ? `（${period}）` : ''}`;
            lines.push(stagePrefix);
            if (toTrimmedString(safeStage.relationship_shift)) {
                lines.push(`- 关系变化：${toTrimmedString(safeStage.relationship_shift)}`);
            }
            const keyEvents = Array.isArray(safeStage.key_events) ? safeStage.key_events : [];
            keyEvents.slice(0, 4).forEach(function appendKeyEvent(item) {
                const theme = toTrimmedString(item && item.theme);
                const date = toTrimmedString(item && item.date);
                const summary = toTrimmedString(item && item.summary);
                if (!summary) return;
                const prefix = [theme ? `**(${theme})**` : '', date].filter(Boolean).join(' ');
                lines.push(`- ${prefix ? `${prefix} ` : ''}${summary}`);
                const impact = toTrimmedString(item && item.impact);
                if (impact) {
                    lines.push(`  长期影响：${impact}`);
                }
            });
            const injectSummary = toTrimmedString(safeStage.inject_summary);
            if (injectSummary && keyEvents.length <= 0) {
                lines.push(`- ${injectSummary}`);
            }
        });

        if (
            state.one_paragraph_summary
            || state.active_threads.length > 0
            || state.unresolved_tensions.length > 0
            || state.stable_bonds.length > 0
            || state.shared_direction.length > 0
        ) {
            lines.push('');
            lines.push('当前关系状态：');
            if (state.one_paragraph_summary) lines.push(`- ${state.one_paragraph_summary}`);
            if (state.active_threads.length > 0) lines.push(`- 仍在延续的线索：${state.active_threads.join(' / ')}`);
            if (state.unresolved_tensions.length > 0) lines.push(`- 未释放的张力：${state.unresolved_tensions.join(' / ')}`);
            if (state.stable_bonds.length > 0) lines.push(`- 稳定纽带：${state.stable_bonds.join(' / ')}`);
            if (state.shared_direction.length > 0) lines.push(`- 共同方向：${state.shared_direction.join(' / ')}`);
        }

        return lines.join('\n');
    }

    function normalizeArcRecord(row) {
        const source = row && typeof row === 'object' ? row : {};
        const sourceSummary = parseJsonLike(source.source_summary || source.sourceSummary, {});
        const cursors = parseJsonLike(source.cursors, {});
        const currentStage = parseJsonLike(source.current_stage || source.currentStage, {});
        const stagesRaw = parseJsonLike(source.stages, []);
        const revisionNotesRaw = parseJsonLike(source.revision_notes || source.revisionNotes, []);
        const knownEventIds = new Set();
        const knownFragmentIds = new Set();

        const normalizedStages = (Array.isArray(stagesRaw) ? stagesRaw : [])
            .map(function mapStage(item, index) {
                const stage = normalizeArcStage(item, index, knownEventIds, knownFragmentIds);
                stage.key_events.forEach(function collectIds(eventItem) {
                    normalizeStringArray(eventItem.evidence_event_ids, 16).forEach(function addEventId(id) {
                        knownEventIds.add(id);
                    });
                    normalizeStringArray(eventItem.evidence_fragment_ids, 24).forEach(function addFragmentId(id) {
                        knownFragmentIds.add(id);
                    });
                });
                return stage;
            })
            .filter(function keepStage(item) {
                return !!(item.title || item.period || item.key_events.length > 0);
            });

        let promptInjectionFull = clipText(stripRelationshipArcPromptHeader(source.prompt_injection_full || source.promptInjectionFull), PROMPT_INJECTION_LIMIT);
        if (!promptInjectionFull) {
            promptInjectionFull = composePromptInjectionFromStages({
                stages: normalizedStages,
                current_relationship_state: normalizeRelationshipState(
                    source.current_relationship_state || source.currentRelationshipState
                )
            });
        }

        return {
            id: toTrimmedString(source.id),
            user_id: toTrimmedString(source.user_id || source.userId),
            char_id: toTrimmedString(source.char_id || source.charId),
            version_id: toTrimmedString(source.version_id || source.versionId || source.id),
            version: Math.max(1, Math.floor(toFiniteNumber(source.version || source.version_number || source.versionNumber, 1))),
            version_number: Math.max(1, Math.floor(toFiniteNumber(source.version_number || source.version || source.versionNumber, 1))),
            previous_version_id: toTrimmedString(source.previous_version_id || source.previousVersionId),
            is_current: source.is_current !== undefined ? toBoolean(source.is_current) : toBoolean(source.isCurrent),
            update_mode: toTrimmedString(source.update_mode || source.updateMode || 'full_rebuild') || 'full_rebuild',
            generated_at: toTrimmedString(source.generated_at || source.generatedAt || source.created_at || source.createdAt),
            created_at: toTrimmedString(source.created_at || source.createdAt || source.generated_at || source.generatedAt),
            updated_at: toTrimmedString(source.updated_at || source.updatedAt || source.generated_at || source.generatedAt),
            source_summary: {
                input_mode: toTrimmedString(sourceSummary.input_mode || sourceSummary.inputMode || 'database'),
                source_origin: normalizeStringArray(sourceSummary.source_origin || sourceSummary.sourceOrigin, 12),
                source_event_count: Math.max(0, Math.floor(toFiniteNumber(sourceSummary.source_event_count || sourceSummary.sourceEventCount, 0))),
                source_fragment_count: Math.max(0, Math.floor(toFiniteNumber(sourceSummary.source_fragment_count || sourceSummary.sourceFragmentCount, 0))),
                prior_stage_count: Math.max(0, Math.floor(toFiniteNumber(sourceSummary.prior_stage_count || sourceSummary.priorStageCount, 0))),
                imported_text_used: toBoolean(sourceSummary.imported_text_used || sourceSummary.importedTextUsed)
            },
            cursors: {
                last_event_cursor: toTrimmedString(cursors.last_event_cursor || cursors.lastEventCursor),
                last_event_created_at: toTrimmedString(cursors.last_event_created_at || cursors.lastEventCreatedAt),
                last_fragment_cursor: toTrimmedString(cursors.last_fragment_cursor || cursors.lastFragmentCursor),
                last_fragment_created_at: toTrimmedString(cursors.last_fragment_created_at || cursors.lastFragmentCreatedAt),
                last_tail_update_at: toTrimmedString(cursors.last_tail_update_at || cursors.lastTailUpdateAt)
            },
            current_stage: {
                stage: Math.max(1, Math.floor(toFiniteNumber(currentStage.stage, normalizedStages.length || 1))),
                title: clipText(currentStage.title || (normalizedStages[normalizedStages.length - 1] && normalizedStages[normalizedStages.length - 1].title) || '', 80),
                period: clipText(currentStage.period || (normalizedStages[normalizedStages.length - 1] && normalizedStages[normalizedStages.length - 1].period) || '', 120)
            },
            stages: normalizedStages,
            current_relationship_state: normalizeRelationshipState(
                source.current_relationship_state || source.currentRelationshipState
            ),
            prompt_injection_full: promptInjectionFull,
            revision_notes: normalizeStringArray(revisionNotesRaw, 12),
            metadata: parseJsonLike(source.metadata, {})
        };
    }

    function collectArcEvidenceEventIds(record) {
        const safeRecord = record && typeof record === 'object' ? record : null;
        const stages = Array.isArray(safeRecord && safeRecord.stages) ? safeRecord.stages : [];
        const ids = new Set();
        stages.forEach(function collectStage(stage) {
            const keyEvents = Array.isArray(stage && stage.key_events) ? stage.key_events : [];
            keyEvents.forEach(function collectKeyEvent(item) {
                normalizeStringArray(item && item.evidence_event_ids, 24).forEach(function addId(id) {
                    ids.add(id);
                });
            });
        });
        return ids;
    }

    function collectArcEvidenceFragmentIds(record) {
        const safeRecord = record && typeof record === 'object' ? record : null;
        const stages = Array.isArray(safeRecord && safeRecord.stages) ? safeRecord.stages : [];
        const ids = new Set();
        stages.forEach(function collectStage(stage) {
            const keyEvents = Array.isArray(stage && stage.key_events) ? stage.key_events : [];
            keyEvents.forEach(function collectKeyEvent(item) {
                normalizeStringArray(item && item.evidence_fragment_ids, 32).forEach(function addId(id) {
                    ids.add(id);
                });
            });
        });
        return ids;
    }

    function filterTailUpdateEventsAgainstArc(events, currentArc) {
        const source = Array.isArray(events) ? events.filter(Boolean) : [];
        const coveredEventIds = collectArcEvidenceEventIds(currentArc);
        if (coveredEventIds.size <= 0) {
            return {
                events: source,
                skippedExistingEventCount: 0,
                skippedExistingEventIds: [],
                coveredEventCount: 0
            };
        }

        const nextEvents = [];
        const skippedExistingEventIds = [];
        source.forEach(function filterEvent(item) {
            const eventId = toTrimmedString(item && item.id);
            if (eventId && coveredEventIds.has(eventId)) {
                skippedExistingEventIds.push(eventId);
                return;
            }
            nextEvents.push(item);
        });

        return {
            events: nextEvents,
            skippedExistingEventCount: skippedExistingEventIds.length,
            skippedExistingEventIds: skippedExistingEventIds.slice(0, 32),
            coveredEventCount: coveredEventIds.size
        };
    }

    function filterTailUpdateFragmentsAgainstArc(fragments, currentArc) {
        const source = Array.isArray(fragments) ? fragments.filter(Boolean) : [];
        const coveredFragmentIds = collectArcEvidenceFragmentIds(currentArc);
        if (coveredFragmentIds.size <= 0) {
            return {
                fragments: source,
                skippedExistingFragmentCount: 0,
                skippedExistingFragmentIds: [],
                coveredFragmentCount: 0
            };
        }

        const nextFragments = [];
        const skippedExistingFragmentIds = [];
        source.forEach(function filterFragment(item) {
            const fragmentId = toTrimmedString(item && item.id);
            if (fragmentId && coveredFragmentIds.has(fragmentId)) {
                skippedExistingFragmentIds.push(fragmentId);
                return;
            }
            nextFragments.push(item);
        });

        return {
            fragments: nextFragments,
            skippedExistingFragmentCount: skippedExistingFragmentIds.length,
            skippedExistingFragmentIds: skippedExistingFragmentIds.slice(0, 48),
            coveredFragmentCount: coveredFragmentIds.size
        };
    }

    function mergeUniqueFragments(fragments) {
        const source = Array.isArray(fragments) ? fragments : [];
        const result = [];
        const seen = new Set();
        source.forEach(function appendFragment(item) {
            const fragmentId = toTrimmedString(item && item.id);
            if (!fragmentId || seen.has(fragmentId)) return;
            seen.add(fragmentId);
            result.push(item);
        });
        return result;
    }

    function createEmptyAdminRelationshipArc() {
        return {
            current: null,
            versions: [],
            promptPreview: '',
            promptBlock: '',
            isEmpty: true,
            emptyReason: '',
            importHint: '',
            stats: {
                stageCount: 0,
                versionCount: 0
            }
        };
    }

    function buildPromptBlock(record) {
        const safeRecord = record && typeof record === 'object' ? record : null;
        const promptText = stripRelationshipArcPromptHeader(safeRecord && safeRecord.prompt_injection_full);
        return promptText ? `[关系脉络]\n${promptText}` : '';
    }

    function extractResponseText(payload) {
        if (typeof payload === 'string') return payload;
        if (!payload || typeof payload !== 'object') return '';
        if (typeof payload.output_text === 'string') return payload.output_text;
        if (Array.isArray(payload.choices) && payload.choices[0]) {
            const choice = payload.choices[0];
            if (choice.message && typeof choice.message.content === 'string') {
                return choice.message.content;
            }
            if (Array.isArray(choice.message && choice.message.content)) {
                return choice.message.content.map(function mapPart(part) {
                    return typeof part === 'string'
                        ? part
                        : toTrimmedString(part && (part.text || part.content));
                }).filter(Boolean).join('\n');
            }
            if (typeof choice.text === 'string') {
                return choice.text;
            }
        }
        return '';
    }

    function extractJsonCandidate(rawText) {
        const safe = toTrimmedString(rawText);
        if (!safe) return '';
        const fencedMatch = safe.match(/```(?:json)?\s*([\s\S]*?)```/i);
        if (fencedMatch && fencedMatch[1]) {
            return toTrimmedString(fencedMatch[1]);
        }
        const firstBrace = safe.indexOf('{');
        const lastBrace = safe.lastIndexOf('}');
        if (firstBrace >= 0 && lastBrace > firstBrace) {
            return safe.slice(firstBrace, lastBrace + 1);
        }
        return safe;
    }

    function coerceArcDecisionObject(value) {
        if (Array.isArray(value)) {
            return {
                stages: value
            };
        }
        const source = value && typeof value === 'object' ? value : null;
        if (!source) return null;

        const nested = source.relationship_arc
            || source.relationshipArc
            || source.arc
            || source.result
            || source.data;
        if ((!Array.isArray(source.stages) || source.stages.length <= 0) && nested && typeof nested === 'object') {
            const coercedNested = coerceArcDecisionObject(nested);
            if (coercedNested) {
                return Object.assign({}, source, coercedNested);
            }
        }

        if (!Array.isArray(source.stages)) {
            const stageList = source.stage_list || source.stageList || source.relationship_stages || source.relationshipStages;
            if (Array.isArray(stageList)) {
                return Object.assign({}, source, {
                    stages: stageList
                });
            }
            if (source.stage !== undefined || source.title !== undefined || source.key_events !== undefined || source.keyEvents !== undefined) {
                return Object.assign({}, source, {
                    stages: [source]
                });
            }
        }
        return source;
    }

    function buildDecisionFromImportedOutline(outline, revisionNote) {
        const safeOutline = outline && typeof outline === 'object' ? outline : {};
        const stages = Array.isArray(safeOutline.stages) ? safeOutline.stages : [];
        if (stages.length <= 0) return null;
        const normalizedStages = stages.map(function mapStage(item, index) {
            const stage = normalizeArcStage(item, index, new Set(), new Set());
            stage.stage = index + 1;
            return stage;
        }).filter(function keepStage(item) {
            return !!(item.title || item.period || item.relationship_shift || item.key_events.length > 0 || item.inject_summary);
        });
        if (normalizedStages.length <= 0) return null;
        const state = deriveRelationshipStateFromStages(normalizedStages);
        return {
            stages: normalizedStages,
            current_relationship_state: state,
            prompt_injection_full: composePromptInjectionFromStages({
                stages: normalizedStages,
                current_relationship_state: state
            }),
            revision_notes: normalizeStringArray([revisionNote || 'imported_outline_preserved'], 12)
        };
    }

    function buildImportedOutlineFallbackDecision(material, options, revisionNote) {
        const safeMaterial = material && typeof material === 'object' ? material : {};
        const safeOptions = options && typeof options === 'object' ? options : {};
        if (!isImportedRelationshipArcMode(safeMaterial, safeOptions)) return null;
        const outline = safeMaterial.importedOutline && typeof safeMaterial.importedOutline === 'object'
            ? safeMaterial.importedOutline
            : parseImportedOutline(safeMaterial.importedText || safeMaterial.legacyYamlText || '');
        if (!outline || Math.max(0, Math.floor(toFiniteNumber(outline.stageCount, 0))) <= 0) return null;
        return buildDecisionFromImportedOutline(outline, revisionNote || 'imported_outline_fallback');
    }

    function isLikelyPerspectiveContaminated(text) {
        const safe = toTrimmedString(text);
        if (!safe) return false;
        const hits = safe.match(/(^|[^\w])(我|你|我们|咱们)\b/g);
        return Array.isArray(hits) && hits.length >= 3;
    }

    function buildStageFallbackTitle(stageIndex) {
        return `阶段 ${Math.max(1, stageIndex)}`;
    }

    function stripRelationshipArcPromptHeader(value) {
        let safe = toTrimmedString(value);
        while (/^\[关系脉络\]\s*/u.test(safe)) {
            safe = safe.replace(/^\[关系脉络\]\s*/u, '').trim();
        }
        return safe;
    }

    function isImportedRelationshipArcMode(material, options) {
        const safeMaterial = material && typeof material === 'object' ? material : {};
        const safeOptions = options && typeof options === 'object' ? options : {};
        const inputMode = toTrimmedString(safeOptions.inputMode || safeMaterial.inputMode).toLowerCase();
        return inputMode === 'manual_import'
            || toBoolean(safeOptions.importedTextUsed || safeMaterial.importedTextUsed)
            || !!toTrimmedString(safeMaterial.importedText)
            || !!toTrimmedString(safeMaterial.legacyYamlText);
    }

    function createRelationshipArcEmptyResultError(reason, material, options) {
        const safeMaterial = material && typeof material === 'object' ? material : {};
        const safeOptions = options && typeof options === 'object' ? options : {};
        const outline = safeMaterial.importedOutline && typeof safeMaterial.importedOutline === 'object'
            ? safeMaterial.importedOutline
            : parseImportedOutline(safeMaterial.importedText || safeMaterial.legacyYamlText || '');
        const error = new Error('relationship_arc_empty_result');
        error.code = 'relationship_arc_empty_result';
        error.reason = toTrimmedString(reason) || 'empty_stages';
        error.inputMode = toTrimmedString(safeOptions.inputMode || safeMaterial.inputMode);
        error.coverageIssue = {
            reasons: ['empty_stages'],
            metrics: {
                importedStageCount: Math.max(0, Math.floor(toFiniteNumber(outline && outline.stageCount, 0))),
                outputStageCount: 0,
                importedKeyEventCount: Math.max(0, Math.floor(toFiniteNumber(outline && outline.keyEventCount, 0))),
                outputKeyEventCount: 0,
                importedDatedKeyEventCount: Math.max(0, Math.floor(toFiniteNumber(outline && outline.datedKeyEventCount, 0))),
                outputDatedKeyEventCount: 0,
                importedThemedKeyEventCount: Math.max(0, Math.floor(toFiniteNumber(outline && outline.themedKeyEventCount, 0))),
                outputThemedKeyEventCount: 0
            }
        };
        return error;
    }

    function assertUsableRelationshipArcOutput(output, material, options) {
        const stages = Array.isArray(output && output.stages) ? output.stages : [];
        if (stages.length > 0) return output;
        throw createRelationshipArcEmptyResultError('empty_stages', material, options);
    }

    function buildSourceSummary(material, options) {
        const source = material && typeof material === 'object' ? material : {};
        const optionSource = options && typeof options === 'object' ? options : {};
        return {
            input_mode: toTrimmedString(optionSource.inputMode || source.inputMode || 'database') || 'database',
            source_origin: normalizeStringArray(source.sourceOrigin || optionSource.sourceOrigin, 12),
            source_event_count: Math.max(0, Math.floor(toFiniteNumber(source.eventCount, 0))),
            source_fragment_count: Math.max(0, Math.floor(toFiniteNumber(source.fragmentCount, 0))),
            prior_stage_count: Math.max(0, Math.floor(toFiniteNumber(source.priorStageCount, 0))),
            imported_text_used: isImportedRelationshipArcMode(source, optionSource)
        };
    }

    function normalizeArcOutputLegacy(parsed, material, fallbackCurrentArc, options) {
        const source = parsed && typeof parsed === 'object' ? parsed : {};
        const safeMaterial = material && typeof material === 'object' ? material : {};
        const optionSource = options && typeof options === 'object' ? options : {};
        const knownEventIds = new Set((Array.isArray(safeMaterial.events) ? safeMaterial.events : []).map(function mapEvent(item) {
            return toTrimmedString(item && item.id);
        }).filter(Boolean));
        const knownFragmentIds = new Set((Array.isArray(safeMaterial.fragments) ? safeMaterial.fragments : []).map(function mapFragment(item) {
            return toTrimmedString(item && item.id);
        }).filter(Boolean));
        const rawStages = Array.isArray(source.stages) ? source.stages : [];
        const normalizedStages = rawStages
            .map(function mapStage(item, index) {
                const nextStage = normalizeArcStage(item, index, knownEventIds, knownFragmentIds);
                if (!nextStage.title) {
                    nextStage.title = buildStageFallbackTitle(index + 1);
                }
                if (!nextStage.period) {
                    nextStage.period = '';
                }
                return nextStage;
            })
            .filter(function keepStage(item) {
                return !!(item.title || item.key_events.length > 0 || item.relationship_shift);
            });

        const currentRelationshipState = normalizeRelationshipState(source.current_relationship_state || source.currentRelationshipState);
        let promptInjectionFull = clipText(stripRelationshipArcPromptHeader(source.prompt_injection_full || source.promptInjectionFull), PROMPT_INJECTION_LIMIT);
        if (!promptInjectionFull || isLikelyPerspectiveContaminated(promptInjectionFull)) {
            promptInjectionFull = composePromptInjectionFromStages({
                stages: normalizedStages,
                current_relationship_state: currentRelationshipState
            });
        }

        const lastStage = normalizedStages[normalizedStages.length - 1] || null;
        const fallback = fallbackCurrentArc && typeof fallbackCurrentArc === 'object' ? fallbackCurrentArc : null;
        return {
            source_summary: buildSourceSummary(safeMaterial, optionSource),
            current_stage: {
                stage: lastStage ? lastStage.stage : Math.max(1, normalizedStages.length || (fallback && fallback.current_stage && fallback.current_stage.stage) || 1),
                title: lastStage ? lastStage.title : toTrimmedString(fallback && fallback.current_stage && fallback.current_stage.title),
                period: lastStage ? lastStage.period : toTrimmedString(fallback && fallback.current_stage && fallback.current_stage.period)
            },
            stages: normalizedStages,
            current_relationship_state: currentRelationshipState,
            prompt_injection_full: promptInjectionFull,
            revision_notes: normalizeStringArray(source.revision_notes || source.revisionNotes, 12)
        };
    }

    function buildEventMaterialLine(eventRow) {
        const source = eventRow && typeof eventRow === 'object' ? eventRow : {};
        const lines = [];
        lines.push(`- event_id: ${toTrimmedString(source.id)}`);
        lines.push(`  date: ${toTrimmedString(source.event_date || source.start_at || source.created_at || '未知')}`);
        lines.push(`  title: ${clipText(source.title, 160) || '未命名事件'}`);
        lines.push(`  summary: ${clipText(source.summary, 400) || '（无摘要）'}`);
        lines.push(`  status: ${toTrimmedString(source.status) || 'closed'}${toBoolean(source.is_unresolved) ? ' / unresolved' : ''}`);
        lines.push(`  depth: ${toTrimmedString(source.depth) || 'low'} / salience=${clampNumber(source.salience_score, 0, 1, 0).toFixed(2)}`);
        return lines.join('\n');
    }

    function buildFragmentMaterialLine(fragmentRow) {
        const source = fragmentRow && typeof fragmentRow === 'object' ? fragmentRow : {};
        const lines = [];
        lines.push(`- fragment_id: ${toTrimmedString(source.id)}`);
        lines.push(`  time: ${toTrimmedString(source.created_at || source.last_active_at || '未知')}`);
        lines.push(`  importance: ${Math.max(0, Math.floor(toFiniteNumber(source.importance, 0)))}`);
        lines.push(`  flashbulb: ${toBoolean(source.is_flashbulb) ? 'true' : 'false'}`);
        lines.push(`  event_id: ${toTrimmedString(source.event_id) || '无'}`);
        lines.push(`  content: ${clipText(source.content, 280)}`);
        return lines.join('\n');
    }

    function buildCurrentArcMaterial(currentArc) {
        const safeArc = currentArc && typeof currentArc === 'object' ? currentArc : null;
        if (!safeArc) return '';
        const header = [
            `- version: ${Math.max(1, Math.floor(toFiniteNumber(safeArc.version, 1)))}`,
            `- generated_at: ${toTrimmedString(safeArc.generated_at) || '未知'}`,
            `- current_stage: ${toTrimmedString(safeArc.current_stage && safeArc.current_stage.title) || '无'}`
        ];
        return ['[旧版关系脉络参考]', header.join('\n'), stripRelationshipArcPromptHeader(safeArc.prompt_injection_full) || composePromptInjectionFromStages(safeArc)].join('\n');
    }

    function buildFullRebuildPromptLegacy(material, options) {
        const source = material && typeof material === 'object' ? material : {};
        const optionSource = options && typeof options === 'object' ? options : {};
        const charLabel = clipText(optionSource.charLabel || source.charLabel || '角色', 60) || '角色';
        const inputMode = toTrimmedString(optionSource.inputMode || source.inputMode || 'database');
        const importedText = clipText(source.importedText || '', FULL_IMPORT_TEXT_LIMIT);
        const legacyYamlText = clipText(source.legacyYamlText || '', FULL_IMPORT_TEXT_LIMIT);
        const events = Array.isArray(source.events) ? source.events.slice(0, FULL_EVENT_LIMIT) : [];
        const fragments = Array.isArray(source.fragments) ? source.fragments.slice(0, FULL_FRAGMENT_LIMIT) : [];
        const currentArcText = buildCurrentArcMaterial(source.currentArc);

        const sections = [
            '你是“深度记忆架构师”，负责把长期关系记忆材料精炼成可持续注入的《关系脉络》。',
            '',
            '核心原则：',
            '1. 保留客观锚点：重要时间、稳定称呼、关键事件、重要承诺、反复影响关系的节点不能丢。',
            '2. 提取情感与权力转折：重点写清关系是如何变化的，而不是把素材原样堆叠。',
            '3. 剔除冗余日常：普通寒暄、琐碎重复、短暂且无长期影响的波动不要升格为阶段转折。',
            '4. 全文使用第三人称，只能使用“用户 / 角色”，禁止出现“我 / 你 / 我们”。',
            '5. 禁止脑补，禁止无证据重写历史，禁止把短期波动直接写成长期结论。',
            '',
            '输出要求：',
            '- 只输出一个 JSON 对象，不要 markdown，不要解释。',
            '- 必须包含 stages、current_relationship_state、prompt_injection_full。',
            '- stages 使用阶段化结构，越早期越概括，越近期越具体。',
            '- key_events.theme 必须是 2-4 个字的核心主题。',
            '- 如果有事件或碎片 ID，只能从给定素材里引用，不要编造任何新 ID。',
            '- prompt_injection_full 必须覆盖完整历程，使用连续自然语言，不要 YAML。',
            '',
            'JSON 结构：',
            '{',
            '  "stages": [',
            '    {',
            '      "stage": 1,',
            '      "title": "阶段标题",',
            '      "period": "时间范围",',
            '      "relationship_shift": "这一阶段相较前一阶段的关系变化",',
            '      "key_events": [',
            '        {',
            '          "date": "日期或时间段",',
            '          "theme": "核心主题",',
            '          "summary": "事件摘要",',
            '          "impact": "长期影响",',
            '          "evidence_event_ids": ["event_id"],',
            '          "evidence_fragment_ids": ["fragment_id"]',
            '        }',
            '      ],',
            '      "ongoing_threads": ["仍延续的线索"],',
            '      "inject_summary": "给注入版使用的阶段摘要",',
            '      "confidence": 0.0',
            '    }',
            '  ],',
            '  "current_relationship_state": {',
            '    "one_paragraph_summary": "一段话概括当前关系状态",',
            '    "active_threads": ["持续影响中的线索"],',
            '    "unresolved_tensions": ["未释放张力"],',
            '    "stable_bonds": ["稳定纽带"],',
            '    "shared_direction": ["共同方向"]',
            '  },',
            '  "prompt_injection_full": "自然语言完整关系脉络正文",',
            '  "revision_notes": ["可选修订说明"]',
            '}',
            '',
            `当前角色标签：${charLabel}`,
            `本次模式：${inputMode}`,
            `输入统计：事件 ${events.length} 条，高权重碎片 ${fragments.length} 条${importedText ? '，含手动导入文本' : ''}${legacyYamlText ? '，含旧版 YAML' : ''}`,
            currentArcText ? `\n${currentArcText}` : '',
            importedText ? `\n[用户手动导入文本]\n${importedText}` : '',
            legacyYamlText ? `\n[旧版 YAML 记忆]\n${legacyYamlText}` : '',
            events.length > 0 ? `\n[事件素材]\n${events.map(buildEventMaterialLine).join('\n')}` : '\n[事件素材]\n（无）',
            fragments.length > 0 ? `\n[高权重碎片素材]\n${fragments.map(buildFragmentMaterialLine).join('\n')}` : '\n[高权重碎片素材]\n（无）'
        ];

        return sections.filter(Boolean).join('\n');
    }

    function buildTailUpdatePrompt(currentArc, material, options) {
        const safeArc = currentArc && typeof currentArc === 'object' ? currentArc : null;
        const safeMaterial = material && typeof material === 'object' ? material : {};
        const optionSource = options && typeof options === 'object' ? options : {};
        const events = Array.isArray(safeMaterial.events) ? safeMaterial.events.slice(0, 60) : [];
        const fragments = Array.isArray(safeMaterial.fragments) ? safeMaterial.fragments.slice(0, 100) : [];

        return [
            '你是“深度记忆架构师”。现在不是重写整条历史，而是对《关系脉络》做一次 tail_update。',
            '',
            '硬规则：',
            '1. 老阶段原样保留，不要改写没有变化的历史。',
            '2. 只判断新增事件/高相关碎片应并入当前最后一个阶段，还是足以切出新阶段。',
            '3. 全文使用第三人称“用户 / 角色”，禁止出现“我 / 你 / 我们”。',
            '4. 禁止脑补，禁止用薄弱材料制造大转折。',
            '5. 如果新增材料不足以改变脉络，返回 mode=noop。',
            '',
            '只输出一个 JSON 对象，不要解释：',
            '{',
            '  "mode": "noop | update_last_stage | append_stage | replace_last_and_append",',
            '  "updated_last_stage": { ... 或 null },',
            '  "new_stage": { ... 或 null },',
            '  "current_relationship_state": { ... },',
            '  "prompt_injection_full": "更新后的完整自然语言版关系脉络",',
            '  "revision_notes": ["可选修订说明"]',
            '}',
            '',
            'stage 结构与 full_rebuild 保持一致；如果 mode=noop，则两个 stage 字段都返回 null。',
            '',
            `角色标签：${clipText(optionSource.charLabel || safeMaterial.charLabel || '角色', 60) || '角色'}`,
            `本次新增事件 ${events.length} 条，高相关碎片 ${fragments.length} 条。`,
            '',
            '[当前完整关系脉络]',
            safeArc ? JSON.stringify({
                current_stage: safeArc.current_stage,
                stages: safeArc.stages,
                current_relationship_state: safeArc.current_relationship_state,
                prompt_injection_full: safeArc.prompt_injection_full
            }, null, 2) : '（无）',
            '',
            '[新增事件]',
            events.length > 0 ? events.map(buildEventMaterialLine).join('\n') : '（无）',
            '',
            '[新增高相关碎片]',
            fragments.length > 0 ? fragments.map(buildFragmentMaterialLine).join('\n') : '（无）'
        ].join('\n');
    }

    function getRelationshipArcInjectionText(record) {
        const safeRecord = record && typeof record === 'object' ? record : null;
        if (!safeRecord) return '';
        return stripRelationshipArcPromptHeader(safeRecord.prompt_injection_full || safeRecord.promptInjectionFull)
            || composePromptInjectionFromStages(safeRecord);
    }

    function buildCompressionStats(record, options) {
        const safeRecord = record && typeof record === 'object' ? record : {};
        const source = options && typeof options === 'object' ? options : {};
        const originalText = getRelationshipArcInjectionText(safeRecord);
        const before = buildArcTextStats(originalText);
        const requestedRatio = clampNumber(source.targetRatio || source.ratio, 0.25, 0.95, COMPRESSION_TARGET_RATIO);
        let targetChars = Math.floor(before.chars * requestedRatio);
        if (before.chars > COMPRESSION_MIN_TARGET_CHARS) {
            targetChars = Math.max(COMPRESSION_MIN_TARGET_CHARS, targetChars);
        } else {
            targetChars = Math.max(600, Math.floor(before.chars * 0.82));
        }
        targetChars = Math.min(COMPRESSION_MAX_TARGET_CHARS, targetChars);
        if (before.chars > 0) {
            targetChars = Math.min(targetChars, Math.max(450, Math.floor(before.chars * 0.92)));
        }
        if (source.targetChars !== undefined || source.target_chars !== undefined) {
            targetChars = Math.max(300, Math.floor(toFiniteNumber(source.targetChars || source.target_chars, targetChars)));
        }
        const targetText = '字'.repeat(Math.max(0, targetChars));
        const target = buildArcTextStats(targetText);
        target.chars = targetChars;
        target.tokens = estimateTokens(targetText);
        target.lines = Math.max(1, Math.ceil(targetChars / 90));
        return {
            before: before,
            target: target,
            ratio: before.chars > 0 ? targetChars / before.chars : 0
        };
    }

    function buildCompressionStatsFromTexts(beforeText, afterText, targetStats) {
        return {
            before: buildArcTextStats(beforeText),
            target: targetStats && typeof targetStats === 'object'
                ? Object.assign({}, targetStats)
                : buildArcTextStats(''),
            after: buildArcTextStats(afterText)
        };
    }

    function buildArcCompressionPrompt(currentArc, stats, options) {
        const safeArc = currentArc && typeof currentArc === 'object' ? currentArc : null;
        const safeStats = stats && typeof stats === 'object' ? stats : buildCompressionStats(safeArc);
        const source = options && typeof options === 'object' ? options : {};
        const target = safeStats.target || {};
        const before = safeStats.before || {};
        return [
            '你是“深度记忆架构师”。现在要把《关系脉络》做一次精炼/压缩。',
            '',
            '任务目标：',
            `- 当前注入正文约 ${Math.max(0, before.chars || 0)} 字 / ${Math.max(0, before.tokens || 0)} tokens。`,
            `- 请尽量压缩到约 ${Math.max(0, target.chars || 0)} 字 / ${Math.max(0, target.tokens || 0)} tokens。`,
            '- 输出仍然必须是原本的关系脉络 JSON 格式，不要改成散文、列表之外的格式，也不要只输出 prompt_injection_full。',
            '',
            '硬规则：',
            '1. 保留阶段顺序、阶段标题和时间范围；除非某个阶段本来就是重复废话，否则不要随意删除阶段。',
            '2. 压缩低价值、低影响、重复表达的 key_events；可以把同一阶段里相近的小事合并成一个更概括的事件。',
            '3. 必须保留真正改变关系走向的节点、长期边界、重大承诺、重要冲突与和解、持续影响当前关系的线索。',
            '4. 不要脑补新事实，不要添加输入里没有的日期、数字、专有名词或证据 ID。',
            '5. 全文使用第三人称“用户 / 角色”，禁止出现“我 / 你 / 我们”。',
            '6. prompt_injection_full 要覆盖完整关系历程：早期更概括，近期和仍在影响当前的内容保留更多细节。',
            '',
            '只输出一个 JSON 对象，不要解释：',
            '{',
            '  "stages": [',
            '    {',
            '      "stage": 1,',
            '      "title": "阶段标题",',
            '      "period": "时间范围",',
            '      "relationship_shift": "阶段关系变化",',
            '      "key_events": [',
            '        {',
            '          "date": "日期或时间段",',
            '          "theme": "2-4字主题",',
            '          "summary": "压缩后的事件摘要",',
            '          "impact": "长期影响",',
            '          "evidence_event_ids": [],',
            '          "evidence_fragment_ids": []',
            '        }',
            '      ],',
            '      "ongoing_threads": [],',
            '      "inject_summary": "阶段注入摘要",',
            '      "confidence": 0.0',
            '    }',
            '  ],',
            '  "current_relationship_state": {',
            '    "one_paragraph_summary": "",',
            '    "active_threads": [],',
            '    "unresolved_tensions": [],',
            '    "stable_bonds": [],',
            '    "shared_direction": []',
            '  },',
            '  "prompt_injection_full": "压缩后的完整自然语言版关系脉络",',
            '  "revision_notes": ["relationship_arc_compressed"]',
            '}',
            '',
            `角色标签：${clipText(source.charLabel || source.charName || '角色', 60) || '角色'}`,
            '',
            '[当前完整关系脉络]',
            safeArc ? JSON.stringify({
                current_stage: safeArc.current_stage,
                stages: safeArc.stages,
                current_relationship_state: safeArc.current_relationship_state,
                prompt_injection_full: getRelationshipArcInjectionText(safeArc)
            }, null, 2) : '（无）'
        ].join('\n');
    }

    function tryParseArcDecisionPayload(rawOutput) {
        const safe = toTrimmedString(rawOutput);
        if (!safe) return null;

        const candidate = extractJsonCandidate(safe);
        let parsed = parseJsonLike(candidate, null);
        let coerced = coerceArcDecisionObject(parsed);
        if (coerced && typeof coerced === 'object') {
            return coerced;
        }

        const cleaned = candidate
            .replace(/^\uFEFF/, '')
            .replace(/[“”]/g, '"')
            .replace(/[‘’]/g, '\'')
            .replace(/,\s*([}\]])/g, '$1');
        parsed = parseJsonLike(cleaned, null);
        coerced = coerceArcDecisionObject(parsed);
        if (coerced && typeof coerced === 'object') {
            return coerced;
        }

        const outline = parseImportedOutline(safe);
        if (outline && outline.stageCount > 0 && outline.keyEventCount > 0) {
            return buildDecisionFromImportedOutline(outline, 'model_output_yaml_outline_parsed');
        }

        return null;
    }

    function buildArcResponseRepairPrompt(rawOutput) {
        const safeOutput = clipText(rawOutput, 22000);
        return [
            'You are a JSON repair tool.',
            'The previous relationship-arc model output did not return valid JSON.',
            'Your only task is to convert the content below into one valid JSON object.',
            '',
            'Rules:',
            '1. Output only JSON. No markdown. No explanation.',
            '2. The top-level keys must include: stages, current_relationship_state, prompt_injection_full.',
            '3. If some fields are missing, keep empty strings, empty arrays, or null. Do not omit the top-level keys.',
            '4. Use third-person wording: 用户 / 角色. Do not use 我 / 你 / 我们.',
            '5. Do not invent unsupported dates, numbers, names, or evidence ids.',
            '',
            'JSON schema:',
            '{',
            '  "stages": [',
            '    {',
            '      "stage": 1,',
            '      "title": "阶段标题",',
            '      "period": "时间范围",',
            '      "relationship_shift": "这一阶段相对上一阶段的关系变化",',
            '      "key_events": [',
            '        {',
            '          "date": "日期或时间段",',
            '          "theme": "2-4字主题",',
            '          "summary": "事件摘要",',
            '          "impact": "长期影响",',
            '          "evidence_event_ids": [],',
            '          "evidence_fragment_ids": []',
            '        }',
            '      ],',
            '      "ongoing_threads": [],',
            '      "inject_summary": "阶段总结",',
            '      "confidence": 0.0',
            '    }',
            '  ],',
            '  "current_relationship_state": {',
            '    "one_paragraph_summary": "",',
            '    "active_threads": [],',
            '    "unresolved_tensions": [],',
            '    "stable_bonds": [],',
            '    "shared_direction": []',
            '  },',
            '  "prompt_injection_full": "",',
            '  "revision_notes": []',
            '}',
            '',
            '[Raw output]',
            safeOutput
        ].join('\n');
    }

    async function requestArcDecision(prompt, apiConfig, options) {
        const fetchImpl = getFetchImplementation();
        const config = normalizeApiConfig(apiConfig && typeof apiConfig === 'object' ? apiConfig : getPrimaryChatApiConfig());
        const repairOptions = options && typeof options === 'object' ? options : {};
        if (!fetchImpl || !config.apiUrl || !config.model) {
            throw new Error('relationship_arc_api_not_configured');
        }

        const requestUrl = normalizeChatCompletionsUrl(config.apiUrl);
        if (!requestUrl) {
            throw new Error('relationship_arc_api_invalid_url');
        }

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

        async function requestOnce(promptText) {
            const response = await fetchImpl(requestUrl, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(Object.assign({}, body, {
                    messages: [
                        {
                            role: 'user',
                            content: promptText
                        }
                    ]
                }))
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

            return {
                payload: payload,
                rawText: rawText
            };
        }

        const firstAttempt = await requestOnce(prompt);
        let lastOutputText = extractResponseText(firstAttempt.payload) || firstAttempt.rawText;
        let parsed = tryParseArcDecisionPayload(
            lastOutputText
        );
        if (!parsed) {
            const repairPrompt = buildArcResponseRepairPrompt(
                lastOutputText
            );
            const repairAttempt = await requestOnce(repairPrompt);
            lastOutputText = extractResponseText(repairAttempt.payload) || repairAttempt.rawText;
            parsed = tryParseArcDecisionPayload(
                lastOutputText
            );
            if (!parsed) {
                const fallbackDecision = buildImportedOutlineFallbackDecision(
                    repairOptions.material,
                    repairOptions,
                    'imported_outline_fallback_after_invalid_response'
                );
                if (fallbackDecision) {
                    console.warn('relationship arc response invalid; preserved imported outline instead.');
                    return fallbackDecision;
                }
                const responseError = new Error('relationship_arc_response_invalid');
                responseError.code = 'relationship_arc_response_invalid';
                responseError.rawOutputPreview = clipText(lastOutputText, 1200);
                throw responseError;
            }
        }

        let coverageIssue = getArcImportedCoverageIssue(parsed, repairOptions.material, repairOptions);
        if (!coverageIssue) {
            return parsed;
        }

        console.warn(`relationship arc import structure repair -> reasons=${coverageIssue.reasons.join(',')}`);
        const structureRepairPrompt = buildArcImportStructureRepairPrompt(
            lastOutputText,
            repairOptions.material,
            repairOptions,
            coverageIssue
        );
        const structureRepairAttempt = await requestOnce(structureRepairPrompt);
        lastOutputText = extractResponseText(structureRepairAttempt.payload) || structureRepairAttempt.rawText;
        parsed = tryParseArcDecisionPayload(lastOutputText);
        if (!parsed) {
            const fallbackDecision = buildImportedOutlineFallbackDecision(
                repairOptions.material,
                repairOptions,
                'imported_outline_fallback_after_structure_repair_invalid'
            );
            if (fallbackDecision) {
                console.warn('relationship arc structure repair invalid; preserved imported outline instead.');
                return fallbackDecision;
            }
            const responseError = new Error('relationship_arc_response_invalid');
            responseError.code = 'relationship_arc_response_invalid';
            responseError.rawOutputPreview = clipText(lastOutputText, 1200);
            throw responseError;
        }

        coverageIssue = getArcImportedCoverageIssue(parsed, repairOptions.material, repairOptions);
        if (coverageIssue) {
            console.warn(`relationship arc import structure still incomplete -> reasons=${coverageIssue.reasons.join(',')}`);
            const normalizedRecovery = canRecoverArcImportDecisionByNormalization(
                parsed,
                repairOptions.material,
                repairOptions
            );
            if (normalizedRecovery.recoverable) {
                console.log('✅ relationship arc import recovered after normalization.');
                return parsed;
            }
            const stagePreservedDecision = buildStagePreservedManualImportDecision(
                parsed,
                repairOptions.material,
                repairOptions
            );
            if (stagePreservedDecision) {
                const preservedRecovery = canRecoverArcImportDecisionByNormalization(
                    stagePreservedDecision,
                    repairOptions.material,
                    repairOptions
                );
                if (preservedRecovery.recoverable) {
                    console.log('✅ relationship arc import stabilized after preserving imported stage skeleton.');
                    return stagePreservedDecision;
                }
            }
            throw createArcImportCoverageError(coverageIssue, {
                inputMode: repairOptions.inputMode || repairOptions.mode || '',
                rawOutputPreview: clipText(lastOutputText, 1600)
            });
        }
        return parsed;
    }

    function isMissingArcTableError(error) {
        const text = toTrimmedString(error && (error.message || error.details || error.hint || error.code || error));
        if (!text) return false;
        const lower = text.toLowerCase();
        return lower.includes(TABLE_NAME.toLowerCase()) || lower.includes('relationship_arc') || lower.includes('relationship ar');
    }

    async function fetchAllArcVersionsFromDb(supabase, userId, charId) {
        const response = await supabase
            .from(TABLE_NAME)
            .select('id,user_id,char_id,version_number,previous_version_id,is_current,update_mode,generated_at,source_summary,cursors,current_stage,stages,current_relationship_state,prompt_injection_full,revision_notes,metadata,created_at,updated_at')
            .eq('user_id', userId)
            .eq('char_id', charId)
            .order('version_number', { ascending: false });

        if (response.error) throw response.error;
        return (Array.isArray(response.data) ? response.data : [])
            .map(normalizeArcRecord)
            .filter(Boolean);
    }

    function fetchAllArcVersionsFromLocal(userId, charId) {
        const store = readLocalStorageStore();
        const bucket = store[makeStorageBucketKey(userId, charId)];
        return (Array.isArray(bucket) ? bucket : [])
            .map(normalizeArcRecord)
            .filter(Boolean)
            .sort(function sortVersions(left, right) {
                return Math.max(1, right.version_number || right.version) - Math.max(1, left.version_number || left.version);
            });
    }

    function persistArcVersionsToLocal(userId, charId, versions) {
        const store = readLocalStorageStore();
        const key = makeStorageBucketKey(userId, charId);
        store[key] = (Array.isArray(versions) ? versions : [])
            .map(normalizeArcRecord)
            .filter(Boolean)
            .sort(function sortVersions(left, right) {
                return Math.max(1, right.version_number || right.version) - Math.max(1, left.version_number || left.version);
            })
            .slice(0, VERSION_HISTORY_LIMIT);
        return writeLocalStorageStore(store);
    }

    async function listArcVersions(supabaseOrUserId, userIdOrCharId, maybeCharId, options) {
        const identity = resolveIdentity(supabaseOrUserId, userIdOrCharId, maybeCharId);
        const supabase = identity.supabase;
        const safeUserId = identity.userId;
        const safeCharId = identity.charId;
        const source = options && typeof options === 'object' ? options : {};
        const limit = Math.max(1, Math.floor(toFiniteNumber(source.limit, VERSION_HISTORY_LIMIT)));
        if (!safeUserId || !safeCharId) return [];

        if (supabase) {
            try {
                return (await fetchAllArcVersionsFromDb(supabase, safeUserId, safeCharId)).slice(0, limit);
            } catch (error) {
                if (!isMissingArcTableError(error)) {
                    console.warn('读取关系脉络版本失败，已回退本地。', error && error.message ? error.message : error);
                }
            }
        }
        return fetchAllArcVersionsFromLocal(safeUserId, safeCharId).slice(0, limit);
    }

    async function fetchCurrentArc(supabaseOrUserId, userIdOrCharId, maybeCharId) {
        const versions = await listArcVersions(supabaseOrUserId, userIdOrCharId, maybeCharId, {
            limit: VERSION_HISTORY_LIMIT
        });
        if (versions.length <= 0) return null;
        return versions.find(function findCurrent(item) {
            return !!item && item.is_current;
        }) || versions[0];
    }

    function resolveIdentity(supabaseOrUserId, userIdOrCharId, maybeCharId) {
        if (supabaseOrUserId && typeof supabaseOrUserId.from === 'function') {
            return {
                supabase: supabaseOrUserId,
                userId: toTrimmedString(userIdOrCharId),
                charId: toTrimmedString(maybeCharId)
            };
        }
        return {
            supabase: getSupabaseClient(),
            userId: toTrimmedString(supabaseOrUserId) || getUserId(),
            charId: toTrimmedString(userIdOrCharId || maybeCharId)
        };
    }

    function createVersionPayload(userId, charId, normalizedOutput, options) {
        const source = normalizedOutput && typeof normalizedOutput === 'object' ? normalizedOutput : {};
        const optionSource = options && typeof options === 'object' ? options : {};
        const nowIso = new Date().toISOString();
        const versionNumber = Math.max(1, Math.floor(toFiniteNumber(optionSource.versionNumber, 1)));
        return normalizeArcRecord({
            id: toTrimmedString(optionSource.id) || createArcId(charId),
            user_id: userId,
            char_id: charId,
            version_id: toTrimmedString(optionSource.id) || createArcId(charId),
            version_number: versionNumber,
            previous_version_id: toTrimmedString(optionSource.previousVersionId),
            is_current: true,
            update_mode: toTrimmedString(optionSource.updateMode || 'full_rebuild') || 'full_rebuild',
            generated_at: nowIso,
            source_summary: source.source_summary || {},
            cursors: source.cursors || {},
            current_stage: source.current_stage || {},
            stages: source.stages || [],
            current_relationship_state: source.current_relationship_state || {},
            prompt_injection_full: source.prompt_injection_full || '',
            revision_notes: source.revision_notes || [],
            metadata: source.metadata || {},
            created_at: nowIso,
            updated_at: nowIso
        });
    }

    async function saveArcVersion(supabaseOrUserId, userIdOrCharId, maybeCharId, record) {
        const identity = resolveIdentity(supabaseOrUserId, userIdOrCharId, maybeCharId);
        const supabase = identity.supabase;
        const safeUserId = identity.userId;
        const safeCharId = identity.charId;
        const normalizedRecord = normalizeArcRecord(record);
        if (!safeUserId || !safeCharId || !normalizedRecord) {
            throw new Error('relationship_arc_save_invalid');
        }

        if (supabase) {
            try {
                const allVersions = await fetchAllArcVersionsFromDb(supabase, safeUserId, safeCharId);
                const dbRecord = {
                    id: normalizedRecord.id,
                    user_id: safeUserId,
                    char_id: safeCharId,
                    version_number: normalizedRecord.version_number,
                    previous_version_id: normalizedRecord.previous_version_id || null,
                    is_current: true,
                    update_mode: normalizedRecord.update_mode,
                    generated_at: normalizedRecord.generated_at || new Date().toISOString(),
                    source_summary: normalizedRecord.source_summary,
                    cursors: normalizedRecord.cursors,
                    current_stage: normalizedRecord.current_stage,
                    stages: normalizedRecord.stages,
                    current_relationship_state: normalizedRecord.current_relationship_state,
                    prompt_injection_full: normalizedRecord.prompt_injection_full,
                    revision_notes: normalizedRecord.revision_notes,
                    metadata: normalizedRecord.metadata
                };

                await supabase
                    .from(TABLE_NAME)
                    .update({ is_current: false })
                    .eq('user_id', safeUserId)
                    .eq('char_id', safeCharId)
                    .eq('is_current', true);

                const insertResult = await supabase
                    .from(TABLE_NAME)
                    .insert(dbRecord)
                    .select('id,user_id,char_id,version_number,previous_version_id,is_current,update_mode,generated_at,source_summary,cursors,current_stage,stages,current_relationship_state,prompt_injection_full,revision_notes,metadata,created_at,updated_at')
                    .limit(1)
                    .maybeSingle();
                if (insertResult.error) throw insertResult.error;

                const mergedVersions = [normalizeArcRecord(insertResult.data)]
                    .concat(allVersions)
                    .filter(Boolean)
                    .sort(function sortVersions(left, right) {
                        return Math.max(1, right.version_number || right.version) - Math.max(1, left.version_number || left.version);
                    });
                const staleVersions = mergedVersions.slice(VERSION_HISTORY_LIMIT);
                if (staleVersions.length > 0) {
                    const staleIds = staleVersions.map(function mapId(item) {
                        return toTrimmedString(item && item.id);
                    }).filter(Boolean);
                    if (staleIds.length > 0) {
                        await supabase
                            .from(TABLE_NAME)
                            .delete()
                            .eq('user_id', safeUserId)
                            .eq('char_id', safeCharId)
                            .in('id', staleIds);
                    }
                }

                return normalizeArcRecord(insertResult.data);
            } catch (error) {
                if (!isMissingArcTableError(error)) {
                    console.warn('保存关系脉络失败，已回退本地。', error && error.message ? error.message : error);
                }
            }
        }

        const versions = fetchAllArcVersionsFromLocal(safeUserId, safeCharId)
            .map(function markNotCurrent(item) {
                const next = Object.assign({}, item);
                next.is_current = false;
                return normalizeArcRecord(next);
            });
        versions.unshift(normalizedRecord);
        persistArcVersionsToLocal(safeUserId, safeCharId, versions);
        return normalizedRecord;
    }

    async function touchArcTailCheck(supabaseOrUserId, userIdOrCharId, maybeCharId, currentArc, cursorsPatch) {
        const identity = resolveIdentity(supabaseOrUserId, userIdOrCharId, maybeCharId);
        const supabase = identity.supabase;
        const safeUserId = identity.userId;
        const safeCharId = identity.charId;
        const arc = normalizeArcRecord(currentArc);
        if (!safeUserId || !safeCharId || !arc || !arc.id) return null;

        const nextCursors = Object.assign({}, arc.cursors, cursorsPatch || {}, {
            last_tail_update_at: new Date().toISOString()
        });
        if (supabase) {
            try {
                const response = await supabase
                    .from(TABLE_NAME)
                    .update({
                        cursors: nextCursors
                    })
                    .eq('user_id', safeUserId)
                    .eq('char_id', safeCharId)
                    .eq('id', arc.id)
                    .select('id,user_id,char_id,version_number,previous_version_id,is_current,update_mode,generated_at,source_summary,cursors,current_stage,stages,current_relationship_state,prompt_injection_full,revision_notes,metadata,created_at,updated_at')
                    .limit(1)
                    .maybeSingle();
                if (response.error) throw response.error;
                return normalizeArcRecord(response.data);
            } catch (error) {
                if (!isMissingArcTableError(error)) {
                    console.warn('更新关系脉络检查时间失败，已回退本地。', error && error.message ? error.message : error);
                }
            }
        }

        const versions = fetchAllArcVersionsFromLocal(safeUserId, safeCharId);
        const nextVersions = versions.map(function patchVersion(item) {
            if (toTrimmedString(item && item.id) !== arc.id) return item;
            const next = Object.assign({}, item, {
                cursors: nextCursors,
                updated_at: new Date().toISOString()
            });
            return normalizeArcRecord(next);
        });
        persistArcVersionsToLocal(safeUserId, safeCharId, nextVersions);
        return nextVersions.find(function findPatched(item) {
            return toTrimmedString(item && item.id) === arc.id;
        }) || null;
    }

    async function rollbackArcVersion(supabaseOrUserId, userIdOrCharId, maybeCharId, versionId) {
        const identity = resolveIdentity(supabaseOrUserId, userIdOrCharId, maybeCharId);
        const supabase = identity.supabase;
        const safeUserId = identity.userId;
        const safeCharId = identity.charId;
        const safeVersionId = toTrimmedString(versionId);
        if (!safeUserId || !safeCharId || !safeVersionId) {
            throw new Error('relationship_arc_rollback_invalid');
        }

        if (supabase) {
            try {
                await supabase
                    .from(TABLE_NAME)
                    .update({ is_current: false })
                    .eq('user_id', safeUserId)
                    .eq('char_id', safeCharId)
                    .eq('is_current', true);

                const response = await supabase
                    .from(TABLE_NAME)
                    .update({ is_current: true })
                    .eq('user_id', safeUserId)
                    .eq('char_id', safeCharId)
                    .eq('id', safeVersionId)
                    .select('id,user_id,char_id,version_number,previous_version_id,is_current,update_mode,generated_at,source_summary,cursors,current_stage,stages,current_relationship_state,prompt_injection_full,revision_notes,metadata,created_at,updated_at')
                    .limit(1)
                    .maybeSingle();
                if (response.error) throw response.error;
                return normalizeArcRecord(response.data);
            } catch (error) {
                if (!isMissingArcTableError(error)) {
                    console.warn('回滚关系脉络失败，已回退本地。', error && error.message ? error.message : error);
                }
            }
        }

        const versions = fetchAllArcVersionsFromLocal(safeUserId, safeCharId);
        const nextVersions = versions.map(function patchVersion(item) {
            const next = Object.assign({}, item);
            next.is_current = toTrimmedString(item && item.id) === safeVersionId;
            return normalizeArcRecord(next);
        });
        persistArcVersionsToLocal(safeUserId, safeCharId, nextVersions);
        return nextVersions.find(function findCurrent(item) {
            return !!item && item.is_current;
        }) || null;
    }

    async function fetchEventRecordsForArc(supabase, userId, charId, options) {
        const source = options && typeof options === 'object' ? options : {};
        const limit = Math.max(1, Math.floor(toFiniteNumber(source.limit, FULL_EVENT_LIMIT)));
        let query = supabase
            .from('hippocampus_memory_events')
            .select('id,user_id,char_id,title,summary,status,depth,event_date,fragment_count,is_unresolved,salience_score,depth_score,memory_ids,detail_memory_ids,start_at,end_at,last_related_at,created_at,updated_at')
            .eq('user_id', userId)
            .eq('char_id', charId)
            .order('created_at', { ascending: true });
        if (source.createdAfter) {
            query = toBoolean(source.includeCreatedAfterCursor)
                ? query.gte('created_at', source.createdAfter)
                : query.gt('created_at', source.createdAfter);
        }
        const response = await query.limit(limit);
        if (response.error) throw response.error;
        const items = Array.isArray(response.data) ? response.data : [];
        return items.map(function normalizeEvent(item) {
            return {
                id: toTrimmedString(item && item.id),
                title: toTrimmedString(item && item.title),
                summary: toTrimmedString(item && item.summary),
                status: toTrimmedString(item && item.status),
                depth: toTrimmedString(item && item.depth),
                event_date: toTrimmedString(item && item.event_date),
                fragment_count: Math.max(0, Math.floor(toFiniteNumber(item && item.fragment_count, 0))),
                is_unresolved: toBoolean(item && item.is_unresolved),
                salience_score: clampNumber(item && item.salience_score, 0, 1, 0),
                depth_score: clampNumber(item && item.depth_score, 0, 1, 0),
                memory_ids: normalizeStringArray(item && item.memory_ids, 64),
                detail_memory_ids: normalizeStringArray(item && item.detail_memory_ids, 64),
                start_at: toTrimmedString(item && item.start_at),
                end_at: toTrimmedString(item && item.end_at),
                last_related_at: toTrimmedString(item && item.last_related_at),
                created_at: toTrimmedString(item && item.created_at),
                updated_at: toTrimmedString(item && item.updated_at)
            };
        }).filter(function keepEvent(item) {
            return !!item.id;
        });
    }

    async function countTotalFragments(supabase, userId, charId) {
        const response = await supabase
            .from('hippocampus_memories')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('char_id', charId);
        if (response.error) throw response.error;
        return Math.max(0, Math.floor(toFiniteNumber(response.count, 0)));
    }

    async function fetchFragmentsForArc(supabase, userId, charId, options) {
        const source = options && typeof options === 'object' ? options : {};
        const limit = Math.max(1, Math.floor(toFiniteNumber(source.limit, FULL_FRAGMENT_LIMIT)));
        if (Array.isArray(source.memoryIds) && source.memoryIds.length > 0) {
            const response = await supabase
                .from('hippocampus_memories')
                .select('id,content,importance,is_flashbulb,event_id,created_at,last_active_at')
                .eq('user_id', userId)
                .eq('char_id', charId)
                .in('id', normalizeStringArray(source.memoryIds, 200))
                .limit(limit);
            if (response.error) throw response.error;
            return normalizeFragmentRows(response.data);
        }

        let query = supabase
            .from('hippocampus_memories')
            .select('id,content,importance,is_flashbulb,event_id,created_at,last_active_at')
            .eq('user_id', userId)
            .eq('char_id', charId)
            .or('importance.gte.7,is_flashbulb.eq.true')
            .order('created_at', { ascending: true });
        if (source.createdAfter) {
            query = toBoolean(source.includeCreatedAfterCursor)
                ? query.gte('created_at', source.createdAfter)
                : query.gt('created_at', source.createdAfter);
        }
        if (Array.isArray(source.eventIds) && source.eventIds.length > 0) {
            query = query.in('event_id', normalizeStringArray(source.eventIds, 120));
        }
        const response = await query.limit(limit);
        if (response.error) throw response.error;
        return normalizeFragmentRows(response.data);
    }

    function normalizeFragmentRows(rows) {
        return (Array.isArray(rows) ? rows : []).map(function normalizeFragment(item) {
            return {
                id: toTrimmedString(item && item.id),
                content: toTrimmedString(item && item.content),
                importance: Math.max(0, Math.floor(toFiniteNumber(item && item.importance, 0))),
                is_flashbulb: toBoolean(item && item.is_flashbulb),
                event_id: toTrimmedString(item && item.event_id),
                created_at: toTrimmedString(item && item.created_at),
                last_active_at: toTrimmedString(item && item.last_active_at)
            };
        }).filter(function keepFragment(item) {
            return !!item.id;
        });
    }

    async function collectFullRebuildMaterial(supabase, userId, charId, options) {
        const source = options && typeof options === 'object' ? options : {};
        const currentArc = source.currentArc || await fetchCurrentArc(supabase, userId, charId);
        const legacySource = getLegacyMigrationSource(charId);
        const events = await fetchEventRecordsForArc(supabase, userId, charId, {
            limit: FULL_EVENT_LIMIT
        });
        const fragments = await fetchFragmentsForArc(supabase, userId, charId, {
            limit: FULL_FRAGMENT_LIMIT
        });
        const totalFragmentCount = await countTotalFragments(supabase, userId, charId).catch(function fallbackCount() {
            return fragments.length;
        });

        return {
            inputMode: source.inputMode || (source.importedText ? 'manual_import' : 'database'),
            sourceOrigin: normalizeStringArray([
                source.importedText ? 'manual_import' : '',
                currentArc ? 'prior_arc' : '',
                events.length > 0 ? 'event_table' : '',
                fragments.length > 0 ? 'high_weight_fragments' : '',
                legacySource && toTrimmedString(legacySource.yamlContent) ? 'legacy_yaml' : ''
            ], 12),
            currentArc: currentArc,
            importedText: source.importedText ? clipText(source.importedText, FULL_IMPORT_TEXT_LIMIT) : '',
            importedTextUsed: !!source.importedText,
            legacyYamlText: legacySource && toTrimmedString(legacySource.yamlContent) ? clipText(legacySource.yamlContent, FULL_IMPORT_TEXT_LIMIT) : '',
            events: events,
            fragments: fragments,
            eventCount: events.length,
            fragmentCount: fragments.length,
            totalFragmentCount: totalFragmentCount,
            priorStageCount: currentArc && Array.isArray(currentArc.stages) ? currentArc.stages.length : 0,
            charLabel: clipText(source.charLabel || source.charName || (legacySource && (legacySource.remark || legacySource.name)), 60)
        };
    }

    function collectTailEventCursor(events) {
        const safeEvents = Array.isArray(events) ? events : [];
        if (safeEvents.length <= 0) {
            return {};
        }
        const sorted = safeEvents.slice().sort(function sortEvents(left, right) {
            const leftTime = Date.parse(toTrimmedString(left && left.created_at) || '') || 0;
            const rightTime = Date.parse(toTrimmedString(right && right.created_at) || '') || 0;
            if (leftTime !== rightTime) return rightTime - leftTime;
            return toTrimmedString(right && right.id).localeCompare(toTrimmedString(left && left.id));
        });
        return {
            last_event_cursor: toTrimmedString(sorted[0] && sorted[0].id),
            last_event_created_at: toTrimmedString(sorted[0] && sorted[0].created_at)
        };
    }

    function collectTailFragmentCursor(fragments) {
        const safeFragments = Array.isArray(fragments) ? fragments : [];
        if (safeFragments.length <= 0) {
            return {};
        }
        const sorted = safeFragments.slice().sort(function sortFragments(left, right) {
            const leftTime = Date.parse(toTrimmedString(left && left.created_at) || '') || 0;
            const rightTime = Date.parse(toTrimmedString(right && right.created_at) || '') || 0;
            if (leftTime !== rightTime) return rightTime - leftTime;
            return toTrimmedString(right && right.id).localeCompare(toTrimmedString(left && left.id));
        });
        return {
            last_fragment_cursor: toTrimmedString(sorted[0] && sorted[0].id),
            last_fragment_created_at: toTrimmedString(sorted[0] && sorted[0].created_at)
        };
    }

    function mergeTailCursorPatches() {
        const patches = Array.prototype.slice.call(arguments);
        const merged = {};
        patches.forEach(function appendPatch(patch) {
            if (!patch || typeof patch !== 'object') return;
            Object.keys(patch).forEach(function copyKey(key) {
                const value = toTrimmedString(patch[key]);
                if (value) merged[key] = value;
            });
        });
        return merged;
    }

    async function collectTailUpdateMaterial(supabase, userId, charId, currentArc, options) {
        const safeCurrentArc = currentArc && typeof currentArc === 'object' ? currentArc : null;
        const eventCursorCreatedAt = toTrimmedString(safeCurrentArc && safeCurrentArc.cursors && safeCurrentArc.cursors.last_event_created_at);
        const fragmentCursorCreatedAt = toTrimmedString(safeCurrentArc && safeCurrentArc.cursors && safeCurrentArc.cursors.last_fragment_created_at);
        const fetchedEvents = await fetchEventRecordsForArc(supabase, userId, charId, {
            limit: 80,
            createdAfter: eventCursorCreatedAt,
            includeCreatedAfterCursor: !!eventCursorCreatedAt
        });
        const newEvents = Array.isArray(fetchedEvents) ? fetchedEvents.slice() : [];

        if (eventCursorCreatedAt && toTrimmedString(safeCurrentArc && safeCurrentArc.cursors && safeCurrentArc.cursors.last_event_cursor)) {
            const cursorId = toTrimmedString(safeCurrentArc.cursors.last_event_cursor);
            const filtered = newEvents.filter(function keepEvent(item) {
                if (toTrimmedString(item && item.created_at) !== eventCursorCreatedAt) return true;
                return toTrimmedString(item && item.id).localeCompare(cursorId) > 0;
            });
            newEvents.length = 0;
            Array.prototype.push.apply(newEvents, filtered);
        }
        const latestSeenEventCursorPatch = collectTailEventCursor(newEvents);
        const dedupedEvents = filterTailUpdateEventsAgainstArc(newEvents, safeCurrentArc);
        newEvents.length = 0;
        Array.prototype.push.apply(newEvents, dedupedEvents.events);

        const detailIds = [];
        const eventIds = [];
        newEvents.forEach(function collectIds(item) {
            if (toTrimmedString(item && item.id)) eventIds.push(item.id);
            normalizeStringArray(item && item.detail_memory_ids, 24).forEach(function pushDetailId(memoryId) {
                detailIds.push(memoryId);
            });
        });
        const eventFragments = detailIds.length > 0
            ? await fetchFragmentsForArc(supabase, userId, charId, {
                memoryIds: detailIds,
                limit: 160
            })
            : (eventIds.length > 0
                ? await fetchFragmentsForArc(supabase, userId, charId, {
                    eventIds: eventIds,
                    limit: 160
                })
                : []);
        const fetchedStandaloneFragments = await fetchFragmentsForArc(supabase, userId, charId, {
            limit: 160,
            createdAfter: fragmentCursorCreatedAt,
            includeCreatedAfterCursor: !!fragmentCursorCreatedAt
        });
        const standaloneFragments = Array.isArray(fetchedStandaloneFragments) ? fetchedStandaloneFragments.slice() : [];
        if (fragmentCursorCreatedAt && toTrimmedString(safeCurrentArc && safeCurrentArc.cursors && safeCurrentArc.cursors.last_fragment_cursor)) {
            const cursorId = toTrimmedString(safeCurrentArc.cursors.last_fragment_cursor);
            const filtered = standaloneFragments.filter(function keepFragment(item) {
                if (toTrimmedString(item && item.created_at) !== fragmentCursorCreatedAt) return true;
                return toTrimmedString(item && item.id).localeCompare(cursorId) > 0;
            });
            standaloneFragments.length = 0;
            Array.prototype.push.apply(standaloneFragments, filtered);
        }
        const latestSeenFragmentCursorPatch = collectTailFragmentCursor(standaloneFragments);
        const dedupedStandaloneFragments = filterTailUpdateFragmentsAgainstArc(standaloneFragments, safeCurrentArc);
        standaloneFragments.length = 0;
        Array.prototype.push.apply(standaloneFragments, dedupedStandaloneFragments.fragments);
        const newFragments = mergeUniqueFragments([].concat(eventFragments).concat(standaloneFragments));
        const latestSeenCursorPatch = mergeTailCursorPatches(latestSeenEventCursorPatch, latestSeenFragmentCursorPatch);

        return {
            inputMode: 'tail_update',
            sourceOrigin: normalizeStringArray([
                'prior_arc',
                newEvents.length > 0 ? 'new_events' : '',
                standaloneFragments.length > 0 ? 'new_high_weight_fragments' : ''
            ], 8),
            currentArc: safeCurrentArc,
            events: newEvents,
            fragments: newFragments,
            eventCount: newEvents.length,
            fragmentCount: newFragments.length,
            latestSeenCursorPatch: latestSeenCursorPatch,
            skippedExistingEventCount: Math.max(0, Math.floor(toFiniteNumber(dedupedEvents.skippedExistingEventCount, 0))),
            skippedExistingEventIds: normalizeStringArray(dedupedEvents.skippedExistingEventIds, 32),
            coveredEventCount: Math.max(0, Math.floor(toFiniteNumber(dedupedEvents.coveredEventCount, 0))),
            standaloneFragmentCount: standaloneFragments.length,
            skippedExistingFragmentCount: Math.max(0, Math.floor(toFiniteNumber(dedupedStandaloneFragments.skippedExistingFragmentCount, 0))),
            skippedExistingFragmentIds: normalizeStringArray(dedupedStandaloneFragments.skippedExistingFragmentIds, 48),
            coveredFragmentCount: Math.max(0, Math.floor(toFiniteNumber(dedupedStandaloneFragments.coveredFragmentCount, 0))),
            priorStageCount: safeCurrentArc && Array.isArray(safeCurrentArc.stages) ? safeCurrentArc.stages.length : 0,
            charLabel: clipText((options && options.charLabel) || (options && options.charName), 60)
        };
    }

    function shouldBuildFromColdStart(material) {
        const source = material && typeof material === 'object' ? material : {};
        const eventCount = Math.max(0, Math.floor(toFiniteNumber(source.eventCount, 0)));
        const totalFragmentCount = Math.max(0, Math.floor(toFiniteNumber(source.totalFragmentCount !== undefined ? source.totalFragmentCount : source.fragmentCount, 0)));
        return eventCount >= COLD_START_EVENT_MIN || totalFragmentCount >= COLD_START_FRAGMENT_MIN || !!toTrimmedString(source.importedText || source.legacyYamlText);
    }

    function shouldUseDirectImportedOutline(material, options) {
        const safeMaterial = material && typeof material === 'object' ? material : {};
        const safeOptions = options && typeof options === 'object' ? options : {};
        const outline = safeMaterial.importedOutline && typeof safeMaterial.importedOutline === 'object'
            ? safeMaterial.importedOutline
            : parseImportedOutline(safeMaterial.importedText || safeMaterial.legacyYamlText || '');
        const stageCount = Math.max(0, Math.floor(toFiniteNumber(outline && outline.stageCount, 0)));
        const keyEventCount = Math.max(0, Math.floor(toFiniteNumber(outline && outline.keyEventCount, 0)));
        if (stageCount < 2 || keyEventCount < 3) return false;

        const inputMode = toTrimmedString(safeOptions.inputMode || safeMaterial.inputMode).toLowerCase();
        const hasManualText = !!toTrimmedString(safeMaterial.importedText);
        const legacyOnlyColdStart = !!toTrimmedString(safeMaterial.legacyYamlText)
            && !hasManualText
            && Math.max(0, Math.floor(toFiniteNumber(safeMaterial.eventCount, 0))) < COLD_START_EVENT_MIN;
        return inputMode === 'manual_import' || hasManualText || legacyOnlyColdStart;
    }

    function computeDaysSince(value) {
        const timestamp = Date.parse(toTrimmedString(value) || '');
        if (!Number.isFinite(timestamp)) return Number.POSITIVE_INFINITY;
        return (Date.now() - timestamp) / (24 * 60 * 60 * 1000);
    }

    function shouldRunTailUpdate(currentArc, material, options) {
        const safeArc = currentArc && typeof currentArc === 'object' ? currentArc : null;
        const safeMaterial = material && typeof material === 'object' ? material : {};
        const source = options && typeof options === 'object' ? options : {};
        if (!safeArc) return { shouldRun: false, reason: 'no_current_arc' };
        if (toBoolean(source.force)) {
            return { shouldRun: true, reason: 'forced' };
        }

        const lastUpdateAt = toTrimmedString(safeArc.cursors && safeArc.cursors.last_tail_update_at) || toTrimmedString(safeArc.generated_at);
        const daysSince = computeDaysSince(lastUpdateAt);
        const newEventCount = Math.max(0, Math.floor(toFiniteNumber(safeMaterial.eventCount, 0)));
        const newFragmentCount = Math.max(0, Math.floor(toFiniteNumber(safeMaterial.fragmentCount, 0)));

        if (daysSince >= TAIL_STALE_DAYS && newEventCount >= TAIL_EVENT_THRESHOLD) {
            return { shouldRun: true, reason: 'stale_with_new_events' };
        }
        if (daysSince >= TAIL_STALE_DAYS && newFragmentCount >= TAIL_FRAGMENT_THRESHOLD) {
            return { shouldRun: true, reason: 'stale_with_new_fragments' };
        }
        if (daysSince >= TAIL_CHECK_DAYS) {
            return { shouldRun: true, reason: 'stale_check' };
        }
        return { shouldRun: false, reason: 'threshold_not_reached' };
    }

    async function runFullRebuildLegacy(supabaseOrUserId, userIdOrCharId, maybeCharId, options) {
        const identity = resolveIdentity(supabaseOrUserId, userIdOrCharId, maybeCharId);
        const supabase = identity.supabase;
        const safeUserId = identity.userId;
        const safeCharId = identity.charId;
        const source = options && typeof options === 'object' ? options : {};
        if (!supabase || !safeUserId || !safeCharId) {
            throw new Error('relationship_arc_context_invalid');
        }

        const currentArc = source.currentArc || await fetchCurrentArc(supabase, safeUserId, safeCharId);
        const material = await collectFullRebuildMaterial(supabase, safeUserId, safeCharId, Object.assign({}, source, {
            currentArc: currentArc
        }));
        if (!shouldBuildFromColdStart(material)) {
            return {
                ok: true,
                noop: true,
                reason: 'cold_start_thin_material',
                record: null,
                preview: null,
                material: material
            };
        }

        const prompt = buildFullRebuildPrompt(material, {
            inputMode: source.inputMode || material.inputMode,
            charLabel: source.charLabel || material.charLabel
        });
        const decision = await requestArcDecision(prompt, source.apiConfig);
        const normalizedOutput = normalizeArcOutput(decision, material, currentArc, {
            inputMode: source.inputMode || material.inputMode,
            importedTextUsed: !!material.importedText,
            sourceOrigin: material.sourceOrigin,
            allowImportedOutlineFallback: !!(
                material
                && material.importedOutline
                && Math.max(0, Math.floor(toFiniteNumber(material.importedOutline.stageCount, 0))) > 0
            )
        });
        const cursorPatch = mergeTailCursorPatches(
            collectTailEventCursor(material.events),
            collectTailFragmentCursor(material.fragments)
        );
        normalizedOutput.cursors = Object.assign({}, normalizedOutput.cursors || {}, cursorPatch, {
            last_tail_update_at: new Date().toISOString()
        });

        const existingVersions = await listArcVersions(supabase, safeUserId, safeCharId, {
            limit: VERSION_HISTORY_LIMIT
        });
        const versionNumber = existingVersions.length > 0
            ? Math.max.apply(null, existingVersions.map(function mapVersion(item) {
                return Math.max(1, Math.floor(toFiniteNumber(item && item.version_number, 1)));
            })) + 1
            : 1;
        const previewRecord = createVersionPayload(safeUserId, safeCharId, normalizedOutput, {
            id: createArcId(safeCharId),
            previousVersionId: currentArc ? currentArc.id : '',
            versionNumber: versionNumber,
            updateMode: source.updateMode || (material.importedText ? 'full_rebuild' : 'full_rebuild')
        });

        if (toBoolean(source.previewOnly)) {
            return {
                ok: true,
                noop: false,
                preview: previewRecord,
                material: material
            };
        }

        const saved = await saveArcVersion(supabase, safeUserId, safeCharId, previewRecord);
        console.log(`✅ full_rebuild 完成 -> stage=${saved && saved.current_stage ? saved.current_stage.title || saved.current_stage.stage : 'unknown'}, version=${saved ? saved.version_number : versionNumber}`);
        return {
            ok: true,
            noop: false,
            record: saved,
            preview: previewRecord,
            material: material
        };
    }

    async function runTailUpdate(supabaseOrUserId, userIdOrCharId, maybeCharId, options) {
        const identity = resolveIdentity(supabaseOrUserId, userIdOrCharId, maybeCharId);
        const supabase = identity.supabase;
        const safeUserId = identity.userId;
        const safeCharId = identity.charId;
        const source = options && typeof options === 'object' ? options : {};
        if (!supabase || !safeUserId || !safeCharId) {
            throw new Error('relationship_arc_context_invalid');
        }

        const currentArc = source.currentArc || await fetchCurrentArc(supabase, safeUserId, safeCharId);
        if (!currentArc) {
            return runFullRebuild(supabase, safeUserId, safeCharId, Object.assign({}, source, {
                inputMode: 'auto_full_rebuild'
            }));
        }

        const material = await collectTailUpdateMaterial(supabase, safeUserId, safeCharId, currentArc, source);
        const decision = shouldRunTailUpdate(currentArc, material, source);
        if (!decision.shouldRun) {
            return {
                ok: true,
                noop: true,
                reason: decision.reason,
                record: currentArc,
                material: material
            };
        }

        if (material.eventCount <= 0 && material.fragmentCount <= 0) {
            const touched = await touchArcTailCheck(
                supabase,
                safeUserId,
                safeCharId,
                currentArc,
                material.latestSeenCursorPatch && typeof material.latestSeenCursorPatch === 'object'
                    ? material.latestSeenCursorPatch
                    : {}
            );
            return {
                ok: true,
                noop: true,
                reason: (
                    Math.max(0, Math.floor(toFiniteNumber(material.skippedExistingEventCount, 0))) > 0
                    || Math.max(0, Math.floor(toFiniteNumber(material.skippedExistingFragmentCount, 0))) > 0
                )
                    ? 'already_covered_material'
                    : (decision.reason === 'stale_check' ? 'stale_check_no_new_material' : 'no_new_material'),
                record: touched || currentArc,
                material: material
            };
        }

        const prompt = buildTailUpdatePrompt(currentArc, material, {
            charLabel: source.charLabel || material.charLabel
        });
        const rawDecision = await requestArcDecision(prompt, source.apiConfig);
        const mode = toTrimmedString(rawDecision && rawDecision.mode).toLowerCase();
        if (mode === 'noop') {
            const cursorPatchNoop = material.latestSeenCursorPatch && typeof material.latestSeenCursorPatch === 'object'
                ? material.latestSeenCursorPatch
                : mergeTailCursorPatches(
                    collectTailEventCursor(material.events),
                    collectTailFragmentCursor(material.fragments)
                );
            const touchedNoop = await touchArcTailCheck(supabase, safeUserId, safeCharId, currentArc, cursorPatchNoop);
            return {
                ok: true,
                noop: true,
                reason: 'model_noop',
                record: touchedNoop || currentArc,
                material: material
            };
        }

        const mergedStages = Array.isArray(currentArc.stages) ? currentArc.stages.slice() : [];
        const updatedLastStage = rawDecision && rawDecision.updated_last_stage
            ? normalizeArcStage(rawDecision.updated_last_stage, Math.max(0, mergedStages.length - 1), new Set(material.events.map(function mapId(item) { return item.id; })), new Set(material.fragments.map(function mapId(item) { return item.id; })))
            : null;
        const newStage = rawDecision && rawDecision.new_stage
            ? normalizeArcStage(rawDecision.new_stage, mergedStages.length, new Set(material.events.map(function mapId(item) { return item.id; })), new Set(material.fragments.map(function mapId(item) { return item.id; })))
            : null;

        if (updatedLastStage && mergedStages.length > 0) {
            mergedStages[mergedStages.length - 1] = updatedLastStage;
        }
        if (newStage && (mode === 'append_stage' || mode === 'replace_last_and_append' || mode === 'update_last_stage')) {
            newStage.stage = mergedStages.length + 1;
            mergedStages.push(newStage);
        }

        const normalizedOutput = normalizeArcOutput({
            stages: mergedStages,
            current_relationship_state: rawDecision.current_relationship_state || rawDecision.currentRelationshipState,
            prompt_injection_full: rawDecision.prompt_injection_full || rawDecision.promptInjectionFull,
            revision_notes: rawDecision.revision_notes || rawDecision.revisionNotes
        }, material, currentArc, {
            inputMode: 'tail_update',
            sourceOrigin: material.sourceOrigin
        });
        const cursorPatch = material.latestSeenCursorPatch && typeof material.latestSeenCursorPatch === 'object'
            ? material.latestSeenCursorPatch
            : mergeTailCursorPatches(
                collectTailEventCursor(material.events),
                collectTailFragmentCursor(material.fragments)
            );
        normalizedOutput.cursors = Object.assign({}, currentArc.cursors, normalizedOutput.cursors || {}, cursorPatch, {
            last_tail_update_at: new Date().toISOString()
        });

        const versions = await listArcVersions(supabase, safeUserId, safeCharId, {
            limit: VERSION_HISTORY_LIMIT
        });
        const versionNumber = versions.length > 0
            ? Math.max.apply(null, versions.map(function mapVersion(item) {
                return Math.max(1, Math.floor(toFiniteNumber(item && item.version_number, 1)));
            })) + 1
            : 1;
        const nextRecord = createVersionPayload(safeUserId, safeCharId, normalizedOutput, {
            id: createArcId(safeCharId),
            previousVersionId: currentArc.id,
            versionNumber: versionNumber,
            updateMode: 'tail_update'
        });
        const saved = await saveArcVersion(supabase, safeUserId, safeCharId, nextRecord);
        console.log(`✅ tail_update 完成 -> ${decision.reason}, 新版=${saved ? saved.version_number : versionNumber}, 新增事件=${material.eventCount}, 新增碎片=${material.fragmentCount}`);
        return {
            ok: true,
            noop: false,
            record: saved,
            material: material
        };
    }

    async function runCompression(supabaseOrUserId, userIdOrCharId, maybeCharId, options) {
        const identity = resolveIdentity(supabaseOrUserId, userIdOrCharId, maybeCharId);
        const supabase = identity.supabase;
        const safeUserId = identity.userId;
        const safeCharId = identity.charId;
        const source = options && typeof options === 'object' ? options : {};
        if (!safeUserId || !safeCharId) {
            throw new Error('relationship_arc_context_invalid');
        }

        const currentArc = source.currentArc || await fetchCurrentArc(supabase, safeUserId, safeCharId);
        if (!currentArc) {
            return {
                ok: false,
                noop: true,
                reason: 'relationship_arc_empty',
                error: 'relationship_arc_empty',
                preview: null,
                record: null
            };
        }

        const beforeText = getRelationshipArcInjectionText(currentArc);
        if (!beforeText) {
            return {
                ok: false,
                noop: true,
                reason: 'relationship_arc_prompt_empty',
                error: 'relationship_arc_prompt_empty',
                preview: null,
                record: currentArc
            };
        }

        const stats = buildCompressionStats(currentArc, source);
        const material = buildCompressionMaterial(currentArc, source);
        const prompt = buildArcCompressionPrompt(currentArc, stats, {
            charLabel: source.charLabel || material.charLabel,
            charName: source.charName
        });
        const decision = await requestArcDecision(
            prompt,
            buildCompressionRequestApiConfig(source.apiConfig, stats),
            {
                material: material,
                inputMode: 'compression',
                sourceOrigin: material.sourceOrigin,
                allowImportedOutlineFallback: false
            }
        );
        const normalizedOutput = normalizeArcOutput(decision, material, currentArc, {
            inputMode: 'compression',
            sourceOrigin: material.sourceOrigin,
            allowImportedOutlineFallback: false
        });
        assertUsableRelationshipArcOutput(normalizedOutput, material, {
            inputMode: 'compression'
        });

        normalizedOutput.cursors = Object.assign({}, currentArc.cursors || {}, normalizedOutput.cursors || {});
        normalizedOutput.revision_notes = normalizeStringArray(
            []
                .concat(Array.isArray(normalizedOutput.revision_notes) ? normalizedOutput.revision_notes : [])
                .concat('relationship_arc_compressed'),
            12
        );
        const afterText = getRelationshipArcInjectionText(normalizedOutput);
        const finalStats = Object.assign({}, stats, {
            after: buildArcTextStats(afterText)
        });
        attachCompressionMetadata(normalizedOutput, finalStats, source);

        const versionNumber = await getNextArcVersionNumber(supabase, safeUserId, safeCharId);
        const previewRecord = createVersionPayload(safeUserId, safeCharId, normalizedOutput, {
            id: createArcId(safeCharId),
            previousVersionId: currentArc.id,
            versionNumber: versionNumber,
            updateMode: 'compression'
        });

        if (toBoolean(source.previewOnly)) {
            return {
                ok: true,
                noop: false,
                preview: previewRecord,
                record: null,
                stats: finalStats,
                material: material
            };
        }

        const saved = await saveArcVersion(supabase, safeUserId, safeCharId, previewRecord);
        console.log(`✅ compression 完成 -> version=${saved ? saved.version_number : versionNumber}, before=${finalStats.before.chars}, after=${finalStats.after.chars}`);
        return {
            ok: true,
            noop: false,
            record: saved,
            preview: previewRecord,
            stats: finalStats,
            material: material
        };
    }

    async function saveArcVersionDraft(supabaseOrUserId, userIdOrCharId, maybeCharId, draft, options) {
        const identity = resolveIdentity(supabaseOrUserId, userIdOrCharId, maybeCharId);
        const supabase = identity.supabase;
        const safeUserId = identity.userId;
        const safeCharId = identity.charId;
        const source = options && typeof options === 'object' ? options : {};
        const draftSource = draft && typeof draft === 'object' ? draft : {};
        if (!safeUserId || !safeCharId) {
            throw new Error('relationship_arc_context_invalid');
        }

        const currentArc = source.currentArc || await fetchCurrentArc(supabase, safeUserId, safeCharId);
        const normalizedDraft = normalizeArcRecord(draftSource);
        const base = normalizedDraft || currentArc;
        if (!base) {
            throw new Error('relationship_arc_empty');
        }

        const editedPromptText = stripRelationshipArcPromptHeader(
            draftSource.prompt_injection_full
            || draftSource.promptInjectionFull
            || draftSource.promptText
            || draftSource.text
            || draftSource.content
        );
        const basePromptText = getRelationshipArcInjectionText(base);
        const currentPromptText = getRelationshipArcInjectionText(currentArc);
        const promptInjectionFull = clipText(
            editedPromptText || basePromptText || currentPromptText,
            PROMPT_INJECTION_LIMIT
        );
        if (!promptInjectionFull) {
            throw new Error('relationship_arc_prompt_empty');
        }
        const manuallyEdited = !!editedPromptText && editedPromptText !== basePromptText;

        const updateMode = toTrimmedString(source.updateMode || draftSource.update_mode || draftSource.updateMode || base.update_mode || 'revision') || 'revision';
        const sourceSummary = Object.assign({}, base.source_summary || {}, {
            input_mode: updateMode,
            source_origin: normalizeStringArray(
                (base.source_summary && base.source_summary.source_origin) || (base.sourceSummary && base.sourceSummary.sourceOrigin) || ['prior_arc'],
                12
            )
        });
        if (!sourceSummary.source_origin.includes('manual_edit')) {
            sourceSummary.source_origin = normalizeStringArray(sourceSummary.source_origin.concat('manual_edit'), 12);
        }

        const revisionNotes = normalizeStringArray(
            []
                .concat(Array.isArray(base.revision_notes) ? base.revision_notes : [])
                .concat(updateMode === 'compression' ? 'relationship_arc_compressed' : '')
                .concat(manuallyEdited ? 'relationship_arc_manually_edited' : ''),
            12
        );
        const beforeText = currentPromptText;
        const targetStats = base.metadata && base.metadata.compression_stats && base.metadata.compression_stats.target
            ? base.metadata.compression_stats.target
            : null;
        const textStats = buildCompressionStatsFromTexts(beforeText, promptInjectionFull, targetStats);
        const metadata = Object.assign({}, base.metadata || {}, {
            manual_edit: manuallyEdited,
            draft_saved_at: new Date().toISOString()
        });
        if (updateMode === 'compression') {
            metadata.compression_stats = Object.assign({}, metadata.compression_stats || {}, textStats);
        }

        const normalizedOutput = {
            source_summary: sourceSummary,
            cursors: Object.assign({}, currentArc && currentArc.cursors || {}, base.cursors || {}),
            current_stage: base.current_stage || (currentArc && currentArc.current_stage) || {},
            stages: Array.isArray(base.stages) && base.stages.length > 0
                ? base.stages
                : (currentArc && Array.isArray(currentArc.stages) ? currentArc.stages : []),
            current_relationship_state: base.current_relationship_state || (currentArc && currentArc.current_relationship_state) || {},
            prompt_injection_full: promptInjectionFull,
            revision_notes: revisionNotes,
            metadata: metadata
        };

        assertUsableRelationshipArcOutput(normalizedOutput, {
            inputMode: updateMode,
            sourceOrigin: sourceSummary.source_origin
        }, {
            inputMode: updateMode
        });

        const versionNumber = await getNextArcVersionNumber(supabase, safeUserId, safeCharId);
        const nextRecord = createVersionPayload(safeUserId, safeCharId, normalizedOutput, {
            id: createArcId(safeCharId),
            previousVersionId: currentArc ? currentArc.id : toTrimmedString(base.previous_version_id || base.previousVersionId),
            versionNumber: versionNumber,
            updateMode: updateMode
        });
        const saved = await saveArcVersion(supabase, safeUserId, safeCharId, nextRecord);
        return {
            ok: true,
            noop: false,
            record: saved,
            stats: updateMode === 'compression' ? textStats : {
                before: buildArcTextStats(beforeText),
                after: buildArcTextStats(promptInjectionFull)
            }
        };
    }

    async function maybeUpdateAfterDigest(supabaseOrUserId, userIdOrCharId, maybeCharId, options) {
        const identity = resolveIdentity(supabaseOrUserId, userIdOrCharId, maybeCharId);
        const supabase = identity.supabase;
        const safeUserId = identity.userId;
        const safeCharId = identity.charId;
        const source = options && typeof options === 'object' ? options : {};
        if (!supabase || !safeUserId || !safeCharId) {
            return {
                ok: false,
                skipped: true,
                reason: 'context_invalid'
            };
        }

        try {
            const currentArc = await fetchCurrentArc(supabase, safeUserId, safeCharId);
            if (!currentArc) {
                const rebuildResult = await runFullRebuild(supabase, safeUserId, safeCharId, Object.assign({}, source, {
                    inputMode: 'auto_full_rebuild'
                }));
                if (rebuildResult && rebuildResult.noop) {
                    console.log('⏭️ 自动 full_rebuild 跳过：材料不足。');
                }
                return Object.assign({
                    action: rebuildResult && rebuildResult.noop ? 'noop' : 'full_rebuild'
                }, rebuildResult);
            }

            const tailResult = await runTailUpdate(supabase, safeUserId, safeCharId, source);
            return Object.assign({
                action: tailResult && tailResult.noop ? 'noop' : 'tail_update'
            }, tailResult);
        } catch (error) {
            console.warn('⚠️ digest 尾部关系脉络更新失败，已跳过。', error && error.message ? error.message : error);
            return {
                ok: false,
                skipped: true,
                reason: toTrimmedString(error && error.message) || 'relationship_arc_update_failed'
            };
        }
    }

    async function fetchPromptSnapshot(supabaseOrUserId, userIdOrCharId, maybeCharId) {
        const current = await fetchCurrentArc(supabaseOrUserId, userIdOrCharId, maybeCharId);
        const text = buildPromptBlock(current);
        return {
            record: current,
            text: text,
            promptText: text,
            stageCount: current && Array.isArray(current.stages) ? current.stages.length : 0,
            currentStageTitle: toTrimmedString(current && current.current_stage && current.current_stage.title),
            version: Math.max(0, Math.floor(toFiniteNumber(current && current.version_number, 0))),
            isEmpty: !text
        };
    }

    async function fetchAdminRelationshipArc(supabaseOrUserId, userIdOrCharId, maybeCharId) {
        const identity = resolveIdentity(supabaseOrUserId, userIdOrCharId, maybeCharId);
        const safeUserId = identity.userId;
        const safeCharId = identity.charId;
        if (!safeUserId || !safeCharId) return createEmptyAdminRelationshipArc();

        const current = await fetchCurrentArc(identity.supabase, safeUserId, safeCharId);
        const versions = await listArcVersions(identity.supabase, safeUserId, safeCharId, {
            limit: VERSION_HISTORY_LIMIT
        });
        const payload = createEmptyAdminRelationshipArc();
        payload.current = current;
        payload.versions = versions;
        payload.promptPreview = toTrimmedString(current && current.prompt_injection_full);
        payload.promptBlock = buildPromptBlock(current);
        payload.isEmpty = !current;
        payload.emptyReason = current ? '' : '目前还没有生成关系脉络。';
        payload.importHint = current ? '' : '如果当前记忆事件还不够厚，可以先从旧版记忆导入。';
        payload.stats = {
            stageCount: current && Array.isArray(current.stages) ? current.stages.length : 0,
            versionCount: versions.length
        };
        return payload;
    }

    function extractThemeFromImportedSummary(summary) {
        const safe = toTrimmedString(summary);
        if (!safe) {
            return {
                theme: '',
                summary: ''
            };
        }

        const markdownMatch = safe.match(/^\*\*\s*[（(]([^()（）]{1,24})[)）]\s*\*\*\s*(.*)$/u);
        if (markdownMatch) {
            return {
                theme: clipText(markdownMatch[1], 24),
                summary: clipText(markdownMatch[2], 1200)
            };
        }

        const plainMatch = safe.match(/^[（(]([^()（）]{1,24})[)）]\s*(.*)$/u);
        if (plainMatch) {
            return {
                theme: clipText(plainMatch[1], 24),
                summary: clipText(plainMatch[2], 1200)
            };
        }

        return {
            theme: '',
            summary: clipText(safe, 1200)
        };
    }

    function countStageKeyEvents(stages) {
        return (Array.isArray(stages) ? stages : []).reduce(function reduceCount(total, stage) {
            const events = Array.isArray(stage && stage.key_events) ? stage.key_events : [];
            return total + events.length;
        }, 0);
    }

    function countDatedStageKeyEvents(stages) {
        return (Array.isArray(stages) ? stages : []).reduce(function reduceCount(total, stage) {
            const events = Array.isArray(stage && stage.key_events) ? stage.key_events : [];
            return total + events.filter(function keepEvent(item) {
                return !!toTrimmedString(item && item.date);
            }).length;
        }, 0);
    }

    function countThemedStageKeyEvents(stages) {
        return (Array.isArray(stages) ? stages : []).reduce(function reduceCount(total, stage) {
            const events = Array.isArray(stage && stage.key_events) ? stage.key_events : [];
            return total + events.filter(function keepEvent(item) {
                return !!toTrimmedString(item && item.theme);
            }).length;
        }, 0);
    }

    function flattenStageKeyEvents(stages, limit) {
        const safeStages = Array.isArray(stages) ? stages : [];
        const maxCount = Math.max(1, Math.floor(toFiniteNumber(limit, 120)));
        const items = [];
        safeStages.forEach(function collectStage(stage) {
            const keyEvents = Array.isArray(stage && stage.key_events) ? stage.key_events : [];
            keyEvents.forEach(function collectEvent(item) {
                if (items.length >= maxCount) return;
                if (!item || !(item.summary || item.theme || item.date)) return;
                items.push(item);
            });
        });
        return items;
    }

    function computeRelationshipArcPromptMinimumLength(stageCount) {
        const safeStageCount = Math.max(0, Math.floor(toFiniteNumber(stageCount, 0)));
        if (safeStageCount >= 10) return 1800;
        if (safeStageCount >= 6) return 1100;
        if (safeStageCount >= 4) return 650;
        return 0;
    }

    function collectRelationshipArcDateHints(stages, limit) {
        const safeStages = Array.isArray(stages) ? stages : [];
        const maxCount = Math.max(1, Math.floor(toFiniteNumber(limit, 24)));
        const hints = [];
        safeStages.forEach(function collectStage(stage) {
            const keyEvents = Array.isArray(stage && stage.key_events) ? stage.key_events : [];
            keyEvents.forEach(function collectEvent(item) {
                const date = toTrimmedString(item && item.date);
                if (!date || !looksLikeImportedDateLabel(date)) return;
                if (hints.includes(date)) return;
                if (hints.length >= maxCount) return;
                hints.push(date);
            });
        });
        return hints;
    }

    function countRelationshipArcPromptCoveredHints(promptText, hints) {
        const normalizedPrompt = normalizeArcComparableText(promptText);
        if (!normalizedPrompt) return 0;
        return (Array.isArray(hints) ? hints : []).reduce(function reduceCount(total, hint) {
            const normalizedHint = normalizeArcComparableText(hint);
            if (!normalizedHint) return total;
            return total + (normalizedPrompt.includes(normalizedHint) ? 1 : 0);
        }, 0);
    }

    function computeImportedKeyEventRetention(importedStages, outputStages) {
        const importedEvents = flattenStageKeyEvents(importedStages, 240);
        const outputEvents = flattenStageKeyEvents(outputStages, 240);
        if (importedEvents.length <= 0 || outputEvents.length <= 0) {
            return {
                importedCount: importedEvents.length,
                retainedCount: 0,
                retainedRatio: 0
            };
        }

        let retainedCount = 0;
        importedEvents.forEach(function countRetained(seedEvent) {
            let bestCandidate = null;
            let bestScore = 0;
            outputEvents.forEach(function compareCandidate(candidateEvent) {
                const score = scoreArcKeyEventMatch(seedEvent, candidateEvent);
                if (score > bestScore) {
                    bestScore = score;
                    bestCandidate = candidateEvent;
                }
            });
            if (!bestCandidate || bestScore < 24) return;

            const seedSummary = toTrimmedString(seedEvent && seedEvent.summary);
            const candidateSummary = toTrimmedString(bestCandidate && bestCandidate.summary);
            const normalizedSeedSummary = normalizeArcComparableText(seedSummary);
            const normalizedCandidateSummary = normalizeArcComparableText(candidateSummary);
            const containsMatch = !!(
                normalizedSeedSummary
                && normalizedCandidateSummary
                && (normalizedSeedSummary.includes(normalizedCandidateSummary) || normalizedCandidateSummary.includes(normalizedSeedSummary))
            );
            const fourgramCoverage = computeArcComparableNgramCoverage(seedSummary, candidateSummary, 4);
            const lengthRatio = normalizedSeedSummary.length > 0
                ? (normalizedCandidateSummary.length / normalizedSeedSummary.length)
                : 1;
            const hasSameDate = !!(
                toTrimmedString(seedEvent && seedEvent.date)
                && toTrimmedString(seedEvent && seedEvent.date) === toTrimmedString(bestCandidate && bestCandidate.date)
            );
            const hasSameTheme = !!(
                toTrimmedString(seedEvent && seedEvent.theme)
                && normalizeArcComparableText(seedEvent && seedEvent.theme) === normalizeArcComparableText(bestCandidate && bestCandidate.theme)
            );
            const isRetained = containsMatch
                || fourgramCoverage >= 0.18
                || ((hasSameDate || hasSameTheme) && fourgramCoverage >= 0.08 && lengthRatio >= 0.45);
            if (isRetained) {
                retainedCount += 1;
            }
        });

        return {
            importedCount: importedEvents.length,
            retainedCount: retainedCount,
            retainedRatio: importedEvents.length > 0 ? retainedCount / importedEvents.length : 0
        };
    }

    function shouldRecomposeImportedPrompt(promptText, normalizedStages, importedOutline) {
        const safePrompt = toTrimmedString(promptText);
        const outlineStages = Array.isArray(importedOutline && importedOutline.stages) ? importedOutline.stages : [];
        const stageSource = Array.isArray(normalizedStages) && normalizedStages.length > 0 ? normalizedStages : outlineStages;
        const importedStageCount = Math.max(0, Math.floor(toFiniteNumber(importedOutline && importedOutline.stageCount, stageSource.length)));
        const minPromptLength = computeRelationshipArcPromptMinimumLength(importedStageCount);
        const dateHints = collectRelationshipArcDateHints(stageSource, 24);
        const coveredDateHintCount = countRelationshipArcPromptCoveredHints(safePrompt, dateHints);
        const needsDateCoverage = dateHints.length >= 4 && coveredDateHintCount < Math.max(3, Math.ceil(dateHints.length * 0.55));
        const tooShort = minPromptLength > 0 && safePrompt.length < minPromptLength;
        return {
            shouldRecompose: !safePrompt || tooShort || needsDateCoverage,
            metrics: {
                minPromptLength: minPromptLength,
                promptLength: safePrompt.length,
                dateHintCount: dateHints.length,
                coveredDateHintCount: coveredDateHintCount
            }
        };
    }

    function hasRelationshipStateSignals(state) {
        const safeState = state && typeof state === 'object' ? state : {};
        return !!(
            toTrimmedString(safeState.one_paragraph_summary || safeState.oneParagraphSummary)
            || (Array.isArray(safeState.active_threads || safeState.activeThreads) && (safeState.active_threads || safeState.activeThreads).length > 0)
            || (Array.isArray(safeState.unresolved_tensions || safeState.unresolvedTensions) && (safeState.unresolved_tensions || safeState.unresolvedTensions).length > 0)
            || (Array.isArray(safeState.stable_bonds || safeState.stableBonds) && (safeState.stable_bonds || safeState.stableBonds).length > 0)
            || (Array.isArray(safeState.shared_direction || safeState.sharedDirection) && (safeState.shared_direction || safeState.sharedDirection).length > 0)
        );
    }

    function normalizeImportedOutlineValue(rawValue, limit) {
        return clipText(toTrimmedString(rawValue).replace(/^["']|["']$/g, ''), limit || 1200);
    }

    function looksLikeImportedDateLabel(value) {
        const safe = toTrimmedString(value);
        if (!safe) return false;
        return /(\d{4}[-/.年]\d{1,2}([-.\/月]\d{1,2}(日)?)?|\d{1,2}月\d{1,2}日|\d{4}年\d{1,2}月|\d{4}年|\d{1,2}月|至今|上旬|中旬|下旬|春|夏|秋|冬)/u.test(safe);
    }

    function parseImportedStageHeading(line) {
        const safe = toTrimmedString(line).replace(/^#+\s*/, '');
        if (!safe) return null;

        let match = safe.match(/^(?:stage|阶段)\s*[:：#-]?\s*(\d+)(?:\s*[.、\-:：]\s*)?(.*)$/iu);
        if (match) {
            return {
                stage: Number.parseInt(match[1], 10),
                title: normalizeImportedOutlineValue(match[2], 80)
            };
        }

        match = safe.match(/^第\s*(\d+)\s*阶段(?:\s*[：:]\s*(.*))?$/u);
        if (match) {
            return {
                stage: Number.parseInt(match[1], 10),
                title: normalizeImportedOutlineValue(match[2], 80)
            };
        }

        return null;
    }

    function parseImportedInlineKeyEvent(line) {
        const safe = toTrimmedString(line).replace(/^-+\s*/, '');
        if (!safe) return null;

        const match = safe.match(/^(.{2,40}?)(?:\s*[：:]\s*|\s+-\s+)(.+)$/u);
        if (!match) return null;

        const date = normalizeImportedOutlineValue(match[1], 64);
        if (!looksLikeImportedDateLabel(date)) return null;

        const parsedSummary = extractThemeFromImportedSummary(match[2]);
        return {
            date: date,
            theme: clipText(parsedSummary.theme, 24),
            summary: clipText(parsedSummary.summary, 1200),
            impact: ''
        };
    }

    function deriveStagePeriodFromImportedEvents(stage) {
        const events = Array.isArray(stage && stage.key_events) ? stage.key_events : [];
        const datedEvents = events.map(function mapDate(item) {
            return toTrimmedString(item && item.date);
        }).filter(looksLikeImportedDateLabel);
        if (datedEvents.length <= 0) return '';
        const first = datedEvents[0];
        const last = datedEvents[datedEvents.length - 1];
        return first === last ? first : `${first} - ${last}`;
    }

    function parseImportedOutline(text) {
        const safe = toTrimmedString(text);
        if (!safe) {
            return {
                stages: [],
                stageCount: 0,
                keyEventCount: 0,
                datedKeyEventCount: 0
            };
        }

        const lines = safe.replace(/\r\n?/g, '\n').split('\n');
        const stages = [];
        let currentStage = null;
        let currentEvent = null;
        let currentField = '';
        let inKeyEvents = false;

        function createStage(index) {
            return {
                stage: Math.max(1, index),
                title: '',
                period: '',
                relationship_shift: '',
                key_events: [],
                ongoing_threads: [],
                inject_summary: '',
                confidence: 0.92
            };
        }

        function appendValue(target, key, chunk, limit) {
            if (!target || !key) return;
            target[key] = clipText(
                [toTrimmedString(target[key]), toTrimmedString(chunk)].filter(Boolean).join(' '),
                limit
            );
        }

        function finalizeEvent() {
            if (!currentStage || !currentEvent) return;
            const parsedSummary = extractThemeFromImportedSummary(currentEvent.summary);
            const normalized = {
                date: clipText(currentEvent.date, 64),
                theme: clipText(currentEvent.theme || parsedSummary.theme, 24),
                summary: clipText(parsedSummary.summary || currentEvent.summary, 1200),
                impact: clipText(currentEvent.impact, 800),
                evidence_event_ids: [],
                evidence_fragment_ids: []
            };
            if (normalized.date || normalized.theme || normalized.summary) {
                currentStage.key_events.push(normalized);
            }
            currentEvent = null;
            currentField = '';
        }

        function finalizeStage() {
            if (!currentStage) return;
            finalizeEvent();
            currentStage.title = clipText(currentStage.title || buildStageFallbackTitle(stages.length + 1), 80);
            currentStage.period = clipText(currentStage.period || deriveStagePeriodFromImportedEvents(currentStage), 120);
            currentStage.relationship_shift = clipText(currentStage.relationship_shift, 500);
            if (!currentStage.inject_summary) {
                currentStage.inject_summary = clipText(
                    currentStage.key_events.slice(0, 2).map(function mapEvent(item) {
                        const date = toTrimmedString(item && item.date);
                        const summary = toTrimmedString(item && item.summary);
                        return [date, summary].filter(Boolean).join(' ');
                    }).filter(Boolean).join('；'),
                    600
                );
            }
            currentStage.inject_summary = clipText(currentStage.inject_summary, 600);
            if (currentStage.title || currentStage.period || currentStage.key_events.length > 0 || currentStage.inject_summary) {
                stages.push(normalizeArcStage(currentStage, stages.length, new Set(), new Set()));
            }
            currentStage = null;
            currentField = '';
            inKeyEvents = false;
        }

        function ensureStage() {
            if (!currentStage) {
                currentStage = createStage(stages.length + 1);
            }
        }

        lines.forEach(function parseLine(rawLine) {
            const trimmed = String(rawLine || '').replace(/\t/g, '    ').trim();
            if (!trimmed || /^---+$/.test(trimmed)) return;
            if (/^```/.test(trimmed) || /^\[?关系脉络\]?[:：]?$/u.test(trimmed)) return;

            const headingStage = parseImportedStageHeading(trimmed);
            if (headingStage) {
                finalizeStage();
                currentStage = createStage(stages.length + 1);
                const stageNumber = Number.parseInt(headingStage.stage, 10);
                if (Number.isFinite(stageNumber)) {
                    currentStage.stage = Math.max(1, stageNumber);
                }
                if (headingStage.title) {
                    currentStage.title = headingStage.title;
                }
                return;
            }

            let match = trimmed.match(/^-?\s*stage\s*:\s*(.+)$/i);
            if (match) {
                finalizeStage();
                currentStage = createStage(stages.length + 1);
                const stageNumber = Number.parseInt(toTrimmedString(match[1]), 10);
                if (Number.isFinite(stageNumber)) {
                    currentStage.stage = Math.max(1, stageNumber);
                }
                return;
            }

            ensureStage();

            match = trimmed.match(/^(?:title|标题|阶段标题)\s*[:：]\s*(.+)$/iu);
            if (match) {
                currentStage.title = normalizeImportedOutlineValue(match[1], 80);
                inKeyEvents = false;
                currentField = 'title';
                return;
            }

            match = trimmed.match(/^(?:period|时间范围|时间跨度|时间段|时期|时间)\s*[:：]\s*(.+)$/iu);
            if (match) {
                currentStage.period = normalizeImportedOutlineValue(match[1], 120);
                inKeyEvents = false;
                currentField = 'period';
                return;
            }

            match = trimmed.match(/^(?:relationship_shift|relationshipShift|shift|关系变化|关系转折)\s*[:：]\s*(.+)$/iu);
            if (match) {
                currentStage.relationship_shift = normalizeImportedOutlineValue(match[1], 500);
                inKeyEvents = false;
                currentField = 'relationship_shift';
                return;
            }

            match = trimmed.match(/^(?:inject_summary|injectSummary|阶段总结|注入摘要)\s*[:：]\s*(.+)$/iu);
            if (match) {
                currentStage.inject_summary = normalizeImportedOutlineValue(match[1], 600);
                inKeyEvents = false;
                currentField = 'inject_summary';
                return;
            }

            if (/^(?:key_events|keyEvents|关键事件|关键节点|大事记)\s*[:：]?\s*$/iu.test(trimmed)) {
                finalizeEvent();
                inKeyEvents = true;
                currentField = '';
                return;
            }

            const inlineEvent = parseImportedInlineKeyEvent(trimmed);
            if (inlineEvent) {
                finalizeEvent();
                inKeyEvents = true;
                currentEvent = {
                    date: inlineEvent.date,
                    theme: inlineEvent.theme,
                    summary: inlineEvent.summary,
                    impact: inlineEvent.impact
                };
                currentField = 'summary';
                finalizeEvent();
                return;
            }

            if (inKeyEvents) {
                match = trimmed.match(/^-+\s*(?:date|日期)\s*[:：]\s*(.+)$/iu) || trimmed.match(/^(?:date|日期)\s*[:：]\s*(.+)$/iu);
                if (match) {
                    finalizeEvent();
                    currentEvent = {
                        date: normalizeImportedOutlineValue(match[1], 64),
                        theme: '',
                        summary: '',
                        impact: ''
                    };
                    currentField = 'date';
                    return;
                }

                if (currentEvent) {
                    match = trimmed.match(/^(?:theme|主题)\s*[:：]\s*(.+)$/iu);
                    if (match) {
                        currentEvent.theme = normalizeImportedOutlineValue(match[1], 24);
                        currentField = 'theme';
                        return;
                    }

                    match = trimmed.match(/^(?:summary|摘要|事件摘要)\s*[:：]\s*(.+)$/iu);
                    if (match) {
                        currentEvent.summary = normalizeImportedOutlineValue(match[1], 1200);
                        currentField = 'summary';
                        return;
                    }

                    match = trimmed.match(/^(?:impact|影响)\s*[:：]\s*(.+)$/iu);
                    if (match) {
                        currentEvent.impact = normalizeImportedOutlineValue(match[1], 800);
                        currentField = 'impact';
                        return;
                    }

                    if (!/^[-\w]+\s*:/.test(trimmed)) {
                        if (currentField === 'summary') {
                            appendValue(currentEvent, 'summary', trimmed, 1200);
                            return;
                        }
                        if (currentField === 'impact') {
                            appendValue(currentEvent, 'impact', trimmed, 800);
                            return;
                        }
                    }
                }
            }

            if (!inKeyEvents && !/^[-\w]+\s*:/.test(trimmed)) {
                appendValue(currentStage, 'inject_summary', trimmed, 600);
            }
        });

        finalizeStage();

        const normalizedStages = stages.map(function mapStage(stage, index) {
            const normalized = normalizeArcStage(stage, index, new Set(), new Set());
            normalized.stage = index + 1;
            return normalized;
        }).filter(function keepStage(item) {
            return !!(item.title || item.period || item.key_events.length > 0 || item.inject_summary);
        });

        return {
            stages: normalizedStages,
            stageCount: normalizedStages.length,
            keyEventCount: countStageKeyEvents(normalizedStages),
            datedKeyEventCount: countDatedStageKeyEvents(normalizedStages),
            themedKeyEventCount: countThemedStageKeyEvents(normalizedStages)
        };
    }

    function buildImportedOutlinePromptBlock(outline) {
        const safeOutline = outline && typeof outline === 'object' ? outline : {};
        const stages = Array.isArray(safeOutline.stages) ? safeOutline.stages : [];
        if (stages.length <= 0) return '';

        const lines = [
            '[从导入文本解析出的结构锚点]',
            `- imported_stage_count: ${Math.max(0, safeOutline.stageCount || stages.length)}`,
            `- imported_key_event_count: ${Math.max(0, safeOutline.keyEventCount || countStageKeyEvents(stages))}`,
            `- imported_dated_key_event_count: ${Math.max(0, safeOutline.datedKeyEventCount || countDatedStageKeyEvents(stages))}`,
            `- imported_themed_key_event_count: ${Math.max(0, safeOutline.themedKeyEventCount || countThemedStageKeyEvents(stages))}`,
            '- 上述 stage、period、date、key_events 都来自导入文本中的显式结构，默认保留，不要压成抽象概括。'
        ];

        stages.forEach(function appendStage(stage, index) {
            const safeStage = stage && typeof stage === 'object' ? stage : {};
            const dates = (Array.isArray(safeStage.key_events) ? safeStage.key_events : []).map(function mapEvent(item) {
                return toTrimmedString(item && item.date);
            }).filter(Boolean).slice(0, 8).join(' / ');
            const themes = (Array.isArray(safeStage.key_events) ? safeStage.key_events : []).map(function mapEvent(item) {
                return toTrimmedString(item && item.theme);
            }).filter(Boolean).slice(0, 8).join(' / ');
            lines.push(
                `- stage ${index + 1}: ${clipText(safeStage.title || buildStageFallbackTitle(index + 1), 60)}`
                + `${safeStage.period ? ` | ${clipText(safeStage.period, 80)}` : ''}`
                + ` | key_events=${Array.isArray(safeStage.key_events) ? safeStage.key_events.length : 0}`
                + `${dates ? ` | dates=${clipText(dates, 220)}` : ''}`
                + `${themes ? ` | themes=${clipText(themes, 140)}` : ''}`
            );
        });

        return lines.join('\n');
    }

    function buildImportedOutlineStructuredPromptBlock(outline) {
        const safeOutline = outline && typeof outline === 'object' ? outline : {};
        const stages = Array.isArray(safeOutline.stages) ? safeOutline.stages : [];
        if (stages.length <= 0) return '';

        const payload = {
            stages: stages.map(function mapStage(stage, index) {
                const safeStage = stage && typeof stage === 'object' ? stage : {};
                return {
                    stage: Math.max(1, Math.floor(toFiniteNumber(safeStage.stage, index + 1))),
                    title: toTrimmedString(safeStage.title),
                    period: toTrimmedString(safeStage.period),
                    relationship_shift: toTrimmedString(safeStage.relationship_shift || safeStage.relationshipShift),
                    key_events: (Array.isArray(safeStage.key_events) ? safeStage.key_events : []).map(function mapEvent(item) {
                        return {
                            date: toTrimmedString(item && item.date),
                            theme: toTrimmedString(item && item.theme),
                            summary: toTrimmedString(item && item.summary),
                            impact: toTrimmedString(item && item.impact)
                        };
                    }).filter(function keepEvent(item) {
                        return !!(item.date || item.theme || item.summary || item.impact);
                    }).slice(0, 12),
                    ongoing_threads: normalizeStringArray(safeStage.ongoing_threads || safeStage.ongoingThreads, 8),
                    inject_summary: toTrimmedString(safeStage.inject_summary || safeStage.injectSummary)
                };
            })
        };

        return [
            '[Imported outline structured JSON]',
            clipText(JSON.stringify(payload, null, 2), 22000)
        ].join('\n');
    }

    function getArcImportedCoverageIssue(parsed, material, options) {
        const safeMaterial = material && typeof material === 'object' ? material : {};
        const safeOptions = options && typeof options === 'object' ? options : {};
        const importedMode = isImportedRelationshipArcMode(safeMaterial, safeOptions);
        if (!importedMode) return null;

        const outline = safeMaterial.importedOutline && typeof safeMaterial.importedOutline === 'object'
            ? safeMaterial.importedOutline
            : parseImportedOutline(safeMaterial.importedText || safeMaterial.legacyYamlText || '');
        const outlineStages = Array.isArray(outline.stages) ? outline.stages : [];
        if (outlineStages.length <= 0) return null;

        const normalized = normalizeArcOutput(parsed, Object.assign({}, safeMaterial, {
            importedOutline: outline
        }), null, Object.assign({}, safeOptions, {
            allowImportedOutlineFallback: false
        }));
        const outputStages = Array.isArray(normalized.stages) ? normalized.stages : [];
        const outputStageCount = outputStages.length;
        const outputKeyEventCount = countStageKeyEvents(outputStages);
        const outputDatedKeyEventCount = countDatedStageKeyEvents(outputStages);
        const outputThemedKeyEventCount = countThemedStageKeyEvents(outputStages);
        const outputPeriodCount = outputStages.filter(function countPeriod(stage) {
            return !!toTrimmedString(stage && stage.period);
        }).length;
        const outputPromptLength = toTrimmedString(parsed && (parsed.prompt_injection_full || parsed.promptInjectionFull)).length;
        const summaryRetention = computeImportedKeyEventRetention(outlineStages, outputStages);

        const importedStageCount = Math.max(0, outline.stageCount || outlineStages.length);
        const importedKeyEventCount = Math.max(0, outline.keyEventCount || countStageKeyEvents(outlineStages));
        const importedDatedKeyEventCount = Math.max(0, outline.datedKeyEventCount || countDatedStageKeyEvents(outlineStages));
        const importedThemedKeyEventCount = Math.max(0, outline.themedKeyEventCount || countThemedStageKeyEvents(outlineStages));
        const importedPeriodCount = outlineStages.filter(function countPeriod(stage) {
            return !!toTrimmedString(stage && stage.period);
        }).length;
        const minPromptLength = computeRelationshipArcPromptMinimumLength(importedStageCount);

        const reasons = [];
        if (outputStageCount <= 0) reasons.push('empty_stages');
        if (importedStageCount >= 2 && outputStageCount < Math.max(2, Math.ceil(importedStageCount * 0.75))) {
            reasons.push('stage_count_collapsed');
        }
        if (importedKeyEventCount >= 8 && outputKeyEventCount < Math.max(6, Math.ceil(importedKeyEventCount * 0.7))) {
            reasons.push('key_events_collapsed');
        }
        if (importedDatedKeyEventCount >= 4 && outputDatedKeyEventCount < Math.max(4, Math.ceil(importedDatedKeyEventCount * 0.7))) {
            reasons.push('dated_events_lost');
        }
        if (importedThemedKeyEventCount >= 4 && outputThemedKeyEventCount < Math.max(4, Math.ceil(importedThemedKeyEventCount * 0.7))) {
            reasons.push('themes_lost');
        }
        if (importedPeriodCount >= 3 && outputPeriodCount < Math.max(3, Math.ceil(importedPeriodCount * 0.7))) {
            reasons.push('periods_lost');
        }
        if (importedKeyEventCount >= 4 && summaryRetention.retainedCount < Math.max(3, Math.ceil(importedKeyEventCount * 0.65))) {
            reasons.push('summary_details_over_abstracted');
        }
        if (minPromptLength > 0 && outputPromptLength < minPromptLength) {
            reasons.push('prompt_too_short');
        }

        if (reasons.length <= 0) return null;
        return {
            reasons: reasons,
            outline: outline,
            normalizedOutput: normalized,
            metrics: {
                importedStageCount: importedStageCount,
                outputStageCount: outputStageCount,
                importedKeyEventCount: importedKeyEventCount,
                outputKeyEventCount: outputKeyEventCount,
                importedDatedKeyEventCount: importedDatedKeyEventCount,
                outputDatedKeyEventCount: outputDatedKeyEventCount,
                importedThemedKeyEventCount: importedThemedKeyEventCount,
                outputThemedKeyEventCount: outputThemedKeyEventCount,
                importedPeriodCount: importedPeriodCount,
                outputPeriodCount: outputPeriodCount,
                retainedDetailedKeyEventCount: summaryRetention.retainedCount,
                importedDetailedKeyEventCount: summaryRetention.importedCount,
                retainedDetailedKeyEventRatio: summaryRetention.retainedRatio,
                minPromptLength: minPromptLength,
                outputPromptLength: outputPromptLength
            }
        };
    }

    function canRecoverArcImportDecisionByNormalization(parsed, material, options) {
        const safeMaterial = material && typeof material === 'object' ? material : {};
        const safeOptions = options && typeof options === 'object' ? options : {};
        const normalized = normalizeArcOutput(parsed, Object.assign({}, safeMaterial), null, Object.assign({}, safeOptions, {
            allowImportedOutlineFallback: true
        }));
        const coverageIssue = getArcImportedCoverageIssue(normalized, safeMaterial, safeOptions);
        return {
            recoverable: !coverageIssue,
            normalized: normalized,
            coverageIssue: coverageIssue
        };
    }

    function createArcImportCoverageError(issue, options) {
        const safeIssue = issue && typeof issue === 'object' ? issue : {};
        const safeOptions = options && typeof options === 'object' ? options : {};
        const error = new Error('relationship_arc_import_structure_lost');
        error.code = 'relationship_arc_import_structure_lost';
        error.inputMode = toTrimmedString(safeOptions.inputMode);
        error.rawOutputPreview = clipText(safeOptions.rawOutputPreview || '', 1600);
        error.coverageIssue = {
            reasons: Array.isArray(safeIssue.reasons) ? safeIssue.reasons.slice(0, 8) : [],
            metrics: safeIssue.metrics && typeof safeIssue.metrics === 'object'
                ? Object.assign({}, safeIssue.metrics)
                : {},
            outline: safeIssue.outline && typeof safeIssue.outline === 'object'
                ? {
                    stageCount: Math.max(0, Math.floor(toFiniteNumber(safeIssue.outline.stageCount, 0))),
                    keyEventCount: Math.max(0, Math.floor(toFiniteNumber(safeIssue.outline.keyEventCount, 0))),
                    datedKeyEventCount: Math.max(0, Math.floor(toFiniteNumber(safeIssue.outline.datedKeyEventCount, 0))),
                    themedKeyEventCount: Math.max(0, Math.floor(toFiniteNumber(safeIssue.outline.themedKeyEventCount, 0)))
                }
                : null
        };
        return error;
    }

    function buildArcImportStructureRepairPrompt(rawOutput, material, options, issue) {
        const safeMaterial = material && typeof material === 'object' ? material : {};
        const safeOptions = options && typeof options === 'object' ? options : {};
        const coverageIssue = issue && typeof issue === 'object'
            ? issue
            : getArcImportedCoverageIssue(null, safeMaterial, safeOptions);
        const outline = coverageIssue && coverageIssue.outline
            ? coverageIssue.outline
            : parseImportedOutline(safeMaterial.importedText || safeMaterial.legacyYamlText || '');
        const metrics = coverageIssue && coverageIssue.metrics ? coverageIssue.metrics : {};
        const reasons = coverageIssue && Array.isArray(coverageIssue.reasons) ? coverageIssue.reasons : [];

        return [
            'You are repairing a relationship-arc import result that compressed the imported outline too aggressively.',
            'Rewrite the previous output into one valid JSON object.',
            '',
            'Hard requirements:',
            '1. Output only JSON. No markdown. No explanation.',
            '2. Use third-person wording only: 用户 / 角色. Do not use 我 / 你 / 我们.',
            '3. The imported outline is the primary skeleton. Preserve its stage count, titles, periods, dated key events, and concrete facts unless two items are clearly the same event.',
            '4. Do not collapse many imported stages into a few vague summaries.',
            '5. key_events.summary must stay concrete. Do not replace specific incidents with abstract labels.',
            '6. prompt_injection_full must cover the whole relationship arc in chronological order. It cannot be a single short blurb when many stages exist.',
            '7. Do not invent unsupported dates, numbers, names, or evidence ids.',
            '',
            '[Coverage failure]',
            `- reasons: ${reasons.join(', ') || 'unknown'}`,
            `- imported stages: ${Math.max(0, Number(metrics.importedStageCount || 0))}`,
            `- output stages: ${Math.max(0, Number(metrics.outputStageCount || 0))}`,
            `- imported key events: ${Math.max(0, Number(metrics.importedKeyEventCount || 0))}`,
            `- output key events: ${Math.max(0, Number(metrics.outputKeyEventCount || 0))}`,
            `- imported dated key events: ${Math.max(0, Number(metrics.importedDatedKeyEventCount || 0))}`,
            `- output dated key events: ${Math.max(0, Number(metrics.outputDatedKeyEventCount || 0))}`,
            `- imported themed key events: ${Math.max(0, Number(metrics.importedThemedKeyEventCount || 0))}`,
            `- output themed key events: ${Math.max(0, Number(metrics.outputThemedKeyEventCount || 0))}`,
            `- imported periods: ${Math.max(0, Number(metrics.importedPeriodCount || 0))}`,
            `- output periods: ${Math.max(0, Number(metrics.outputPeriodCount || 0))}`,
            `- retained detailed imported events: ${Math.max(0, Number(metrics.retainedDetailedKeyEventCount || 0))} / ${Math.max(0, Number(metrics.importedDetailedKeyEventCount || 0))}`,
            `- prompt length target: >= ${Math.max(0, Number(metrics.minPromptLength || 0))}`,
            `- current prompt length: ${Math.max(0, Number(metrics.outputPromptLength || 0))}`,
            '',
            buildImportedOutlinePromptBlock(outline),
            '',
            buildImportedOutlineStructuredPromptBlock(outline),
            '',
            '[Previous output to repair]',
            clipText(rawOutput, 22000)
        ].filter(Boolean).join('\n');
    }

    function shouldFallbackToImportedOutline(outputStages, material, options) {
        const safeMaterial = material && typeof material === 'object' ? material : {};
        const safeOptions = options && typeof options === 'object' ? options : {};
        const outline = safeMaterial.importedOutline && typeof safeMaterial.importedOutline === 'object'
            ? safeMaterial.importedOutline
            : parseImportedOutline(safeMaterial.importedText || safeMaterial.legacyYamlText || '');
        const outlineStages = Array.isArray(outline.stages) ? outline.stages : [];
        if (outlineStages.length <= 0) return false;

        const importedMode = isImportedRelationshipArcMode(safeMaterial, safeOptions);
        if (!importedMode) return false;

        const safeOutputStages = Array.isArray(outputStages) ? outputStages : [];
        const outputStageCount = safeOutputStages.length;
        const outputKeyEventCount = countStageKeyEvents(safeOutputStages);
        const outputDatedKeyEventCount = countDatedStageKeyEvents(safeOutputStages);
        const importedStageCount = Math.max(0, outline.stageCount || outlineStages.length);
        const importedKeyEventCount = Math.max(0, outline.keyEventCount || countStageKeyEvents(outlineStages));
        const importedDatedKeyEventCount = Math.max(0, outline.datedKeyEventCount || countDatedStageKeyEvents(outlineStages));

        if (outputStageCount <= 0) return true;
        if (importedStageCount >= 3 && outputStageCount < Math.max(2, Math.ceil(importedStageCount * 0.6))) return true;
        if (importedKeyEventCount >= 6 && outputKeyEventCount < Math.max(4, Math.ceil(importedKeyEventCount * 0.45))) return true;
        if (importedDatedKeyEventCount >= 4 && outputDatedKeyEventCount < Math.max(3, Math.ceil(importedDatedKeyEventCount * 0.45))) return true;
        return false;
    }

    function deriveRelationshipStateFromStages(stages) {
        const safeStages = Array.isArray(stages) ? stages : [];
        const lastStage = safeStages[safeStages.length - 1] || null;
        const recentEvents = lastStage && Array.isArray(lastStage.key_events)
            ? lastStage.key_events.slice(-2).map(function mapEvent(item) {
                const date = toTrimmedString(item && item.date);
                const summary = toTrimmedString(item && item.summary);
                return [date, summary].filter(Boolean).join(' ');
            }).filter(Boolean)
            : [];

        return normalizeRelationshipState({
            one_paragraph_summary: lastStage
                ? clipText(
                    [
                        lastStage.title ? `当前关系脉络延续在“${lastStage.title}”阶段` : '',
                        lastStage.period ? `（${lastStage.period}）` : '',
                        recentEvents.length > 0 ? `，最近的重要节点包括：${recentEvents.join('；')}` : ''
                    ].join(''),
                    1200
                )
                : '',
            active_threads: lastStage && Array.isArray(lastStage.ongoing_threads) ? lastStage.ongoing_threads : [],
            unresolved_tensions: [],
            stable_bonds: [],
            shared_direction: []
        });
    }

    function buildArcRequestApiConfig(apiConfig, material) {
        const safeMaterial = material && typeof material === 'object' ? material : {};
        const outline = safeMaterial.importedOutline && typeof safeMaterial.importedOutline === 'object'
            ? safeMaterial.importedOutline
            : parseImportedOutline(safeMaterial.importedText || safeMaterial.legacyYamlText || '');
        const importedLength = toTrimmedString(safeMaterial.importedText || safeMaterial.legacyYamlText).length;
        const stageCount = Math.max(0, Math.floor(toFiniteNumber(outline && outline.stageCount, 0)));
        const needsBoost = stageCount >= 8 || importedLength >= 6000;
        if (!needsBoost) {
            return apiConfig;
        }

        const baseSource = apiConfig && typeof apiConfig === 'object'
            ? Object.assign({}, apiConfig)
            : Object.assign({}, getPrimaryChatApiConfig());
        const currentMax = Math.max(512, Math.floor(toFiniteNumber(baseSource.maxTokens || baseSource.max_tokens, DEFAULT_MAX_TOKENS)));
        baseSource.maxTokens = Math.max(
            currentMax,
            stageCount >= 20
                ? 16000
                : (stageCount >= 16 || importedLength >= 12000 ? 14000 : 10000)
        );
        baseSource.temperature = Math.min(
            clampNumber(baseSource.temperature, 0, 2, DEFAULT_TEMPERATURE),
            stageCount >= 12 || importedLength >= 8000 ? 0.15 : 0.18
        );
        return baseSource;
    }

    function buildCompressionRequestApiConfig(apiConfig, stats) {
        const source = apiConfig && typeof apiConfig === 'object'
            ? Object.assign({}, apiConfig)
            : Object.assign({}, getPrimaryChatApiConfig());
        const safeStats = stats && typeof stats === 'object' ? stats : {};
        const targetTokens = Math.max(0, Math.floor(toFiniteNumber(safeStats.target && safeStats.target.tokens, 0)));
        const currentMax = Math.max(512, Math.floor(toFiniteNumber(source.maxTokens || source.max_tokens, DEFAULT_MAX_TOKENS)));
        source.maxTokens = Math.max(
            currentMax,
            Math.min(14000, Math.max(5000, targetTokens + 2200))
        );
        source.temperature = Math.min(
            clampNumber(source.temperature, 0, 2, DEFAULT_TEMPERATURE),
            0.18
        );
        return source;
    }

    async function getNextArcVersionNumber(supabaseOrUserId, userIdOrCharId, maybeCharId) {
        const versions = await listArcVersions(supabaseOrUserId, userIdOrCharId, maybeCharId, {
            limit: VERSION_HISTORY_LIMIT
        });
        if (!Array.isArray(versions) || versions.length <= 0) return 1;
        return Math.max.apply(null, versions.map(function mapVersion(item) {
            return Math.max(1, Math.floor(toFiniteNumber(item && item.version_number, 1)));
        })) + 1;
    }

    function buildCompressionMaterial(currentArc, options) {
        const source = options && typeof options === 'object' ? options : {};
        const safeArc = currentArc && typeof currentArc === 'object' ? currentArc : {};
        return {
            inputMode: 'compression',
            sourceOrigin: normalizeStringArray(['prior_arc', 'compressed_arc'], 8),
            currentArc: safeArc,
            events: [],
            fragments: [],
            eventCount: 0,
            fragmentCount: 0,
            priorStageCount: Array.isArray(safeArc.stages) ? safeArc.stages.length : 0,
            charLabel: clipText(source.charLabel || source.charName, 60)
        };
    }

    function attachCompressionMetadata(normalizedOutput, stats, options) {
        const source = normalizedOutput && typeof normalizedOutput === 'object' ? normalizedOutput : {};
        const safeStats = stats && typeof stats === 'object' ? stats : {};
        const optionSource = options && typeof options === 'object' ? options : {};
        const existingMetadata = source.metadata && typeof source.metadata === 'object' ? source.metadata : {};
        source.metadata = Object.assign({}, existingMetadata, {
            compression_stats: {
                before: safeStats.before || buildArcTextStats(''),
                target: safeStats.target || buildArcTextStats(''),
                after: safeStats.after || null,
                ratio: safeStats.ratio !== undefined ? safeStats.ratio : null
            },
            compression_preview: toBoolean(optionSource.previewOnly)
        });
        return source;
    }

    function composePromptInjectionFromStages(record) {
        const safeRecord = record && typeof record === 'object' ? record : {};
        const stages = Array.isArray(safeRecord.stages) ? safeRecord.stages : [];
        const state = normalizeRelationshipState(safeRecord.current_relationship_state || safeRecord.currentRelationshipState);
        const lines = [];

        if (stages.length <= 0) {
            if (state.one_paragraph_summary) {
                lines.push(state.one_paragraph_summary);
            }
            return lines.join('\n');
        }

        lines.push('以下内容是用户与角色的长期关系脉络，按时间顺序排列：');
        stages.forEach(function appendStage(stage, index) {
            const safeStage = stage && typeof stage === 'object' ? stage : {};
            const title = toTrimmedString(safeStage.title) || `阶段 ${index + 1}`;
            const period = toTrimmedString(safeStage.period);
            lines.push(`${index + 1}. ${title}${period ? `（${period}）` : ''}`);
            if (toTrimmedString(safeStage.relationship_shift)) {
                lines.push(`- 阶段转折：${toTrimmedString(safeStage.relationship_shift)}`);
            }
            const keyEvents = Array.isArray(safeStage.key_events) ? safeStage.key_events : [];
            keyEvents.slice(0, 6).forEach(function appendKeyEvent(item) {
                const date = toTrimmedString(item && item.date);
                const theme = toTrimmedString(item && item.theme);
                const summary = toTrimmedString(item && item.summary);
                if (!summary) return;
                const prefix = [date, theme ? `【${theme}】` : ''].filter(Boolean).join(' ');
                lines.push(`- ${prefix ? `${prefix} ` : ''}${summary}`);
                const impact = toTrimmedString(item && item.impact);
                if (impact) {
                    lines.push(`- 长期影响：${impact}`);
                }
            });
            if (toTrimmedString(safeStage.inject_summary)) {
                lines.push(`- 阶段总结：${toTrimmedString(safeStage.inject_summary)}`);
            }
            const ongoingThreads = Array.isArray(safeStage.ongoing_threads) ? safeStage.ongoing_threads : [];
            if (ongoingThreads.length > 0) {
                lines.push(`- 延续线索：${ongoingThreads.join(' / ')}`);
            }
        });

        if (
            state.one_paragraph_summary
            || state.active_threads.length > 0
            || state.unresolved_tensions.length > 0
            || state.stable_bonds.length > 0
            || state.shared_direction.length > 0
        ) {
            lines.push('');
            lines.push('当前关系状态：');
            if (state.one_paragraph_summary) lines.push(`- ${state.one_paragraph_summary}`);
            if (state.active_threads.length > 0) lines.push(`- 仍在延续的线索：${state.active_threads.join(' / ')}`);
            if (state.unresolved_tensions.length > 0) lines.push(`- 未释放的张力：${state.unresolved_tensions.join(' / ')}`);
            if (state.stable_bonds.length > 0) lines.push(`- 稳定纽带：${state.stable_bonds.join(' / ')}`);
            if (state.shared_direction.length > 0) lines.push(`- 共同方向：${state.shared_direction.join(' / ')}`);
        }

        return lines.join('\n');
    }

    function normalizeArcOutput(parsed, material, fallbackCurrentArc, options) {
        const source = parsed && typeof parsed === 'object' ? parsed : {};
        const safeMaterial = material && typeof material === 'object' ? material : {};
        const optionSource = options && typeof options === 'object' ? options : {};
        const knownEventIds = new Set((Array.isArray(safeMaterial.events) ? safeMaterial.events : []).map(function mapEvent(item) {
            return toTrimmedString(item && item.id);
        }).filter(Boolean));
        const knownFragmentIds = new Set((Array.isArray(safeMaterial.fragments) ? safeMaterial.fragments : []).map(function mapFragment(item) {
            return toTrimmedString(item && item.id);
        }).filter(Boolean));
        const rawStages = Array.isArray(source.stages) ? source.stages : [];
        let normalizedStages = rawStages
            .map(function mapStage(item, index) {
                const nextStage = normalizeArcStage(item, index, knownEventIds, knownFragmentIds);
                if (!nextStage.title) {
                    nextStage.title = buildStageFallbackTitle(index + 1);
                }
                if (!nextStage.period) {
                    nextStage.period = '';
                }
                return nextStage;
            })
            .filter(function keepStage(item) {
                return !!(item.title || item.key_events.length > 0 || item.relationship_shift);
            });

        const importedOutline = safeMaterial.importedOutline && typeof safeMaterial.importedOutline === 'object'
            ? safeMaterial.importedOutline
            : parseImportedOutline(safeMaterial.importedText || safeMaterial.legacyYamlText || '');
        const allowImportedOutlineFallback = toBoolean(optionSource.allowImportedOutlineFallback);
        const usedImportedOutlineFallback = allowImportedOutlineFallback && shouldFallbackToImportedOutline(normalizedStages, Object.assign({}, safeMaterial, {
            importedOutline: importedOutline
        }), optionSource);
        if (usedImportedOutlineFallback && Array.isArray(importedOutline.stages) && importedOutline.stages.length > 0) {
            normalizedStages = importedOutline.stages.map(function cloneStage(item, index) {
                const nextStage = normalizeArcStage(item, index, knownEventIds, knownFragmentIds);
                nextStage.stage = index + 1;
                return nextStage;
            });
        }

        let currentRelationshipState = normalizeRelationshipState(source.current_relationship_state || source.currentRelationshipState);
        if (!hasRelationshipStateSignals(currentRelationshipState) && normalizedStages.length > 0) {
            currentRelationshipState = deriveRelationshipStateFromStages(normalizedStages);
        }

        let promptInjectionFull = clipText(stripRelationshipArcPromptHeader(source.prompt_injection_full || source.promptInjectionFull), PROMPT_INJECTION_LIMIT);
        const importedMode = isImportedRelationshipArcMode(safeMaterial, optionSource);
        const importedSummaryRetention = importedMode
            ? computeImportedKeyEventRetention(importedOutline.stages, normalizedStages)
            : null;
        const shouldUseImportedOutlineForPrompt = !!(
            importedMode
            && Array.isArray(importedOutline.stages)
            && importedOutline.stages.length > 0
            && importedSummaryRetention
            && importedSummaryRetention.importedCount >= 4
            && importedSummaryRetention.retainedCount < Math.max(3, Math.ceil(importedSummaryRetention.importedCount * 0.65))
        );
        const importedPromptDecision = importedMode
            ? shouldRecomposeImportedPrompt(promptInjectionFull, normalizedStages, importedOutline)
            : { shouldRecompose: false };
        if (
            !promptInjectionFull
            || isLikelyPerspectiveContaminated(promptInjectionFull)
            || usedImportedOutlineFallback
            || importedPromptDecision.shouldRecompose
        ) {
            promptInjectionFull = composePromptInjectionFromStages({
                stages: shouldUseImportedOutlineForPrompt ? importedOutline.stages : normalizedStages,
                current_relationship_state: currentRelationshipState
            });
        }

        const lastStage = normalizedStages[normalizedStages.length - 1] || null;
        const fallback = fallbackCurrentArc && typeof fallbackCurrentArc === 'object' ? fallbackCurrentArc : null;
        return {
            source_summary: buildSourceSummary(Object.assign({}, safeMaterial, {
                importedOutline: importedOutline
            }), optionSource),
            current_stage: {
                stage: lastStage ? lastStage.stage : Math.max(1, normalizedStages.length || (fallback && fallback.current_stage && fallback.current_stage.stage) || 1),
                title: lastStage ? lastStage.title : toTrimmedString(fallback && fallback.current_stage && fallback.current_stage.title),
                period: lastStage ? lastStage.period : toTrimmedString(fallback && fallback.current_stage && fallback.current_stage.period)
            },
            stages: normalizedStages,
            current_relationship_state: currentRelationshipState,
            prompt_injection_full: promptInjectionFull,
            revision_notes: normalizeStringArray(source.revision_notes || source.revisionNotes, 12)
        };
    }

    function buildFullRebuildPrompt(material, options) {
        const source = material && typeof material === 'object' ? material : {};
        const optionSource = options && typeof options === 'object' ? options : {};
        const charLabel = clipText(optionSource.charLabel || source.charLabel || '角色', 60) || '角色';
        const inputMode = toTrimmedString(optionSource.inputMode || source.inputMode || 'database');
        const importedText = clipText(source.importedText || '', FULL_IMPORT_TEXT_LIMIT);
        const legacyYamlText = clipText(source.legacyYamlText || '', FULL_IMPORT_TEXT_LIMIT);
        const events = Array.isArray(source.events) ? source.events.slice(0, FULL_EVENT_LIMIT) : [];
        const fragments = Array.isArray(source.fragments) ? source.fragments.slice(0, FULL_FRAGMENT_LIMIT) : [];
        const currentArcText = buildCurrentArcMaterial(source.currentArc);
        const importedOutline = source.importedOutline && typeof source.importedOutline === 'object'
            ? source.importedOutline
            : parseImportedOutline(importedText || legacyYamlText);
        const importedOutlineBlock = buildImportedOutlinePromptBlock(importedOutline);
        const importedOutlineStructuredBlock = buildImportedOutlineStructuredPromptBlock(importedOutline);
        const preserveImportedStructure = importedOutline.stageCount > 0;
        const includeSupplementalDatabaseMaterial = !(inputMode === 'manual_import' && preserveImportedStructure);
        const manualImportSkeletonRule = preserveImportedStructure
            ? '7. 手动导入模式下，导入文本里的 stage 数量、标题、period、带日期 key_events 和具体事件摘要优先级最高；只能补充关系转折、长期影响和当前关系状态，不能把它们压成抽象空话。'
            : '';

        const sections = [
            '你是“深度记忆架构师”，负责把长期关系材料精炼成《关系脉络》。',
            '',
            '核心精炼原则：',
            '1. 保留客观锚点：日期、时间段、数字、专有名词、稳定称呼、关键承诺都不能丢。',
            '2. 提取情感与权力转折：要写清楚发生了什么、为什么重要、关系因此如何变化。',
            '3. 剔除冗余日常：普通寒暄和短暂波动不要拔高成阶段转折。',
            '4. 全文使用第三人称，只能写“用户 / 角色”，禁止出现“我 / 你 / 我们”。',
            '5. 禁止脑补，禁止用抽象标签替代具体事件，禁止把模糊线索写成确定事实。',
            '6. 如果输入里已经存在明确的 stage / title / period / date / key_events 结构，必须默认保留。',
            '',
            '输出要求：',
            '- 只输出一个 JSON 对象，不要 markdown，不要解释。',
            '- 必须包含 stages、current_relationship_state、prompt_injection_full。',
            '- 如果导入文本里已经明确写了多个 stage，不要把大量阶段压成 1-3 个模糊段落。',
            '- key_events.date 必须保留原文已有的日期或时间范围。',
            '- key_events.theme 如果导入文本里已有主题标签，必须尽量保留，不要大面积留空。',
            '- key_events.summary 必须写出具体发生了什么，不能只写抽象名词。',
            '- prompt_injection_full 必须覆盖完整历程，按时间顺序写清阶段、日期和关键转折。',
            '- 手动导入场景下，以导入文本为主骨架；数据库事件和碎片只是补充，不能覆盖或压扁导入结构。',
            '',
            'JSON 结构：',
            '{',
            '  "stages": [',
            '    {',
            '      "stage": 1,',
            '      "title": "阶段标题",',
            '      "period": "时间范围",',
            '      "relationship_shift": "相较前一阶段的关系变化",',
            '      "key_events": [',
            '        {',
            '          "date": "日期或时间段",',
            '          "theme": "2-4字主题",',
            '          "summary": "具体事件摘要",',
            '          "impact": "长期影响",',
            '          "evidence_event_ids": ["event_id"],',
            '          "evidence_fragment_ids": ["fragment_id"]',
            '        }',
            '      ],',
            '      "ongoing_threads": ["仍在持续的线索"],',
            '      "inject_summary": "阶段总结",',
            '      "confidence": 0.0',
            '    }',
            '  ],',
            '  "current_relationship_state": {',
            '    "one_paragraph_summary": "一段话概括当前关系状态",',
            '    "active_threads": ["持续影响中的线索"],',
            '    "unresolved_tensions": ["未释放的张力"],',
            '    "stable_bonds": ["稳定纽带"],',
            '    "shared_direction": ["共同方向"]',
            '  },',
            '  "prompt_injection_full": "完整关系脉络正文",',
            '  "revision_notes": ["可选修订说明"]',
            '}',
            '',
            `当前角色标签：${charLabel}`,
            `本次模式：${inputMode}`,
            `输入统计：事件 ${events.length} 条，高权重碎片 ${fragments.length} 条${importedText ? '，含手动导入文本' : ''}${legacyYamlText ? '，含旧版 YAML' : ''}`,
            preserveImportedStructure
                ? `导入结构提示：已解析出 ${importedOutline.stageCount} 个 stage、${importedOutline.keyEventCount} 个 key_events、${importedOutline.datedKeyEventCount} 个带日期的 key_events；不要压缩丢失。`
                : '',
            currentArcText ? `\n${currentArcText}` : '',
            importedOutlineBlock ? `\n${importedOutlineBlock}` : '',
            importedOutlineStructuredBlock ? `\n${importedOutlineStructuredBlock}` : '',
            importedText ? `\n[用户手动导入文本]\n${importedText}` : '',
            legacyYamlText ? `\n[旧版 YAML 记忆]\n${legacyYamlText}` : '',
            includeSupplementalDatabaseMaterial
                ? (events.length > 0 ? `\n[事件素材]\n${events.map(buildEventMaterialLine).join('\n')}` : '\n[事件素材]\n（无）')
                : '\n[事件素材]\n（本轮以手动导入结构为主骨架，数据库事件省略）',
            includeSupplementalDatabaseMaterial
                ? (fragments.length > 0 ? `\n[高权重碎片素材]\n${fragments.map(buildFragmentMaterialLine).join('\n')}` : '\n[高权重碎片素材]\n（无）')
                : '\n[高权重碎片素材]\n（本轮以手动导入结构为主骨架，数据库碎片省略）'
        ];

        if (manualImportSkeletonRule) {
            sections.splice(7, 0, manualImportSkeletonRule);
        }

        return sections.filter(Boolean).join('\n');
    }

    async function runFullRebuild(supabaseOrUserId, userIdOrCharId, maybeCharId, options) {
        const identity = resolveIdentity(supabaseOrUserId, userIdOrCharId, maybeCharId);
        const supabase = identity.supabase;
        const safeUserId = identity.userId;
        const safeCharId = identity.charId;
        const source = options && typeof options === 'object' ? options : {};
        if (!supabase || !safeUserId || !safeCharId) {
            throw new Error('relationship_arc_context_invalid');
        }

        const currentArc = source.currentArc || await fetchCurrentArc(supabase, safeUserId, safeCharId);
        const material = await collectFullRebuildMaterial(supabase, safeUserId, safeCharId, Object.assign({}, source, {
            currentArc: currentArc
        }));
        material.importedOutline = parseImportedOutline(material.importedText || material.legacyYamlText || '');
        if (!shouldBuildFromColdStart(material)) {
            return {
                ok: true,
                noop: true,
                reason: 'cold_start_thin_material',
                record: null,
                preview: null,
                material: material
            };
        }

        const rebuildOptions = {
            inputMode: source.inputMode || material.inputMode,
            importedTextUsed: !!material.importedText,
            sourceOrigin: material.sourceOrigin
        };
        let normalizedOutput = null;
        if (shouldUseDirectImportedOutline(material, rebuildOptions)) {
            const directDecision = buildDecisionFromImportedOutline(material.importedOutline, 'imported_outline_direct_parse');
            normalizedOutput = normalizeArcOutput(directDecision, material, currentArc, Object.assign({}, rebuildOptions, {
                allowImportedOutlineFallback: true
            }));
        } else {
            const prompt = buildFullRebuildPrompt(material, {
                inputMode: source.inputMode || material.inputMode,
                charLabel: source.charLabel || material.charLabel
            });
            const decision = await requestArcDecision(prompt, buildArcRequestApiConfig(source.apiConfig, material), Object.assign({}, rebuildOptions, {
                material: material
            }));
            const stabilizedDecision = buildStagePreservedManualImportDecision(decision, material, rebuildOptions) || decision;
            normalizedOutput = normalizeArcOutput(stabilizedDecision, material, currentArc, Object.assign({}, rebuildOptions, {
                allowImportedOutlineFallback: !!(
                    material
                    && material.importedOutline
                    && Math.max(0, Math.floor(toFiniteNumber(material.importedOutline.stageCount, 0))) > 0
                )
            }));
        }
        assertUsableRelationshipArcOutput(normalizedOutput, material, rebuildOptions);
        const cursorPatch = mergeTailCursorPatches(
            collectTailEventCursor(material.events),
            collectTailFragmentCursor(material.fragments)
        );
        normalizedOutput.cursors = Object.assign({}, normalizedOutput.cursors || {}, cursorPatch, {
            last_tail_update_at: new Date().toISOString()
        });

        const existingVersions = await listArcVersions(supabase, safeUserId, safeCharId, {
            limit: VERSION_HISTORY_LIMIT
        });
        const versionNumber = existingVersions.length > 0
            ? Math.max.apply(null, existingVersions.map(function mapVersion(item) {
                return Math.max(1, Math.floor(toFiniteNumber(item && item.version_number, 1)));
            })) + 1
            : 1;
        const previewRecord = createVersionPayload(safeUserId, safeCharId, normalizedOutput, {
            id: createArcId(safeCharId),
            previousVersionId: currentArc ? currentArc.id : '',
            versionNumber: versionNumber,
            updateMode: source.updateMode || 'full_rebuild'
        });

        if (toBoolean(source.previewOnly)) {
            return {
                ok: true,
                noop: false,
                preview: previewRecord,
                material: material
            };
        }

        const saved = await saveArcVersion(supabase, safeUserId, safeCharId, previewRecord);
        console.log(`✅ full_rebuild 完成 -> stage=${saved && saved.current_stage ? saved.current_stage.title || saved.current_stage.stage : 'unknown'}, version=${saved ? saved.version_number : versionNumber}`);
        return {
            ok: true,
            noop: false,
            record: saved,
            material: material
        };
    }

    return {
        fetchCurrentArc: fetchCurrentArc,
        listArcVersions: listArcVersions,
        buildPromptBlock: buildPromptBlock,
        fetchPromptSnapshot: fetchPromptSnapshot,
        fetchAdminRelationshipArc: fetchAdminRelationshipArc,
        runFullRebuild: runFullRebuild,
        runTailUpdate: runTailUpdate,
        runCompression: runCompression,
        saveArcVersionDraft: saveArcVersionDraft,
        maybeUpdateAfterDigest: maybeUpdateAfterDigest,
        rollbackArcVersion: rollbackArcVersion,
        getPrimaryChatApiConfig: getPrimaryChatApiConfig,
        __debug: {
            normalizeArcRecord: normalizeArcRecord,
            buildArcTextStats: buildArcTextStats,
            buildCompressionStats: buildCompressionStats,
            buildArcCompressionPrompt: buildArcCompressionPrompt,
            buildCompressionRequestApiConfig: buildCompressionRequestApiConfig,
            buildFullRebuildPrompt: buildFullRebuildPrompt,
            buildTailUpdatePrompt: buildTailUpdatePrompt,
            normalizeArcOutput: normalizeArcOutput,
            composePromptInjectionFromStages: composePromptInjectionFromStages,
            parseImportedOutline: parseImportedOutline,
            buildDecisionFromImportedOutline: buildDecisionFromImportedOutline,
            buildImportedOutlineFallbackDecision: buildImportedOutlineFallbackDecision,
            shouldUseDirectImportedOutline: shouldUseDirectImportedOutline,
            assertUsableRelationshipArcOutput: assertUsableRelationshipArcOutput,
            getArcImportedCoverageIssue: getArcImportedCoverageIssue,
            createArcImportCoverageError: createArcImportCoverageError,
            buildStagePreservedManualImportDecision: buildStagePreservedManualImportDecision,
            canRecoverArcImportDecisionByNormalization: canRecoverArcImportDecisionByNormalization,
            shouldRunTailUpdate: shouldRunTailUpdate,
            collectArcEvidenceEventIds: collectArcEvidenceEventIds,
            collectArcEvidenceFragmentIds: collectArcEvidenceFragmentIds,
            filterTailUpdateEventsAgainstArc: filterTailUpdateEventsAgainstArc,
            filterTailUpdateFragmentsAgainstArc: filterTailUpdateFragmentsAgainstArc,
            collectTailEventCursor: collectTailEventCursor,
            collectTailFragmentCursor: collectTailFragmentCursor,
            mergeTailCursorPatches: mergeTailCursorPatches
        }
    };
}
