/**
 * 初始化海马体管理台客户端模块导出壳子。
 * 兼容浏览器全局和 CommonJS 两种加载方式。
 */
(function initHippocampusAdminClientModule(root) {
    const api = createHippocampusAdminClient(root);

    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }

    if (root && typeof root === 'object') {
        root.HippocampusAdminClient = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this));

/**
 * 创建海马体管理台客户端实例。
 * 这里封装管理台 RPC、导出文件和 IndexedDB 快照仓库。
 */
function createHippocampusAdminClient(root) {
    const SNAPSHOT_DB_NAME = 'IDIC_Hippocampus_Admin_DB';
    const SNAPSHOT_STORE_NAME = 'hippocampusSnapshots';
    const SNAPSHOT_DB_VERSION = 1;
    const META_STORAGE_KEY = 'idic_hippocampus_admin_meta_v1';
    const ATTACHMENT_STORAGE_KEY_PREFIX = 'idic_hippocampus_attachment_profile_v1';
    const DIGEST_RECORD_STORAGE_KEY_PREFIX = 'idic_hippocampus_digest_outcomes_v1';
    const NOTEBOOK_RUNTIME_HISTORY_STORAGE_KEY_PREFIX = 'idic_hippocampus_notebook_runtime_history_v1';
    const MAX_SNAPSHOT_COUNT = 5;
    const MAX_DIGEST_RECORD_COUNT = 200;
    const MAX_NOTEBOOK_RUNTIME_HISTORY_COUNT = 80;
    const DEFAULT_PAGE_SIZE = 20;
    const EXPORT_PAGE_SIZE = 200;
    const ADMIN_PROFILE_CATEGORIES = new Set(['preference', 'habit', 'identity', 'other']);
    const ADMIN_PROFILE_CONFIDENCE = new Set(['stated', 'inferred', 'uncertain']);

    const state = {
        bridge: null
    };

    /**
     * 初始化管理台客户端，允许外层显式注入 bridge。
     */
    function initHippocampusAdminClient(options) {
        const source = options && typeof options === 'object' ? options : {};
        state.bridge = source.bridge && typeof source.bridge === 'object'
            ? source.bridge
            : null;
        return api;
    }

    /**
     * 读取当前可用的桥接对象。
     */
    function getBridge() {
        if (state.bridge && typeof state.bridge === 'object') {
            return state.bridge;
        }

        if (root && root.IDIC_HippocampusBridge && typeof root.IDIC_HippocampusBridge === 'object') {
            return root.IDIC_HippocampusBridge;
        }

        return null;
    }

    /**
     * 读取当前可用的 Supabase 客户端。
     */
    function getSupabaseClient() {
        const bridge = getBridge();
        if (!bridge || typeof bridge.getSupabaseClient !== 'function') {
            return null;
        }

        try {
            return bridge.getSupabaseClient() || null;
        } catch (_) {
            return null;
        }
    }

    /**
     * 读取海马体管理台使用的稳定用户 ID。
     */
    function getUserId() {
        const bridge = getBridge();
        if (!bridge || typeof bridge.getUserId !== 'function') {
            return '';
        }

        try {
            return toTrimmedString(bridge.getUserId());
        } catch (_) {
            return '';
        }
    }

    /**
     * 读取所有已开启海马体的角色列表。
     */
    function listEnabledContacts() {
        const bridge = getBridge();
        if (!bridge || typeof bridge.listEnabledContacts !== 'function') {
            return [];
        }

        try {
            const contacts = bridge.listEnabledContacts();
            return Array.isArray(contacts) ? contacts.map(normalizeContactSummary).filter(Boolean) : [];
        } catch (_) {
            return [];
        }
    }

    /**
     * 读取当前聊天角色的简要信息。
     */
    function getCurrentContactSummary() {
        const bridge = getBridge();
        if (!bridge || typeof bridge.getCurrentContactSummary !== 'function') {
            return null;
        }

        try {
            return normalizeContactSummary(bridge.getCurrentContactSummary());
        } catch (_) {
            return null;
        }
    }

    /**
     * 解析指定角色的联系摘要，优先复用 bridge 已暴露的启用角色列表。
     */
    function resolveContactSummary(charId) {
        const safeCharId = toTrimmedString(charId);
        const current = getCurrentContactSummary();
        if (current && toTrimmedString(current.id) === safeCharId) {
            return current;
        }

        const contacts = listEnabledContacts();
        const matched = contacts.find(function findContact(contact) {
            return toTrimmedString(contact && contact.id) === safeCharId;
        }) || null;
        if (matched) {
            return matched;
        }

        if (!safeCharId) {
            return current;
        }

        return {
            id: safeCharId,
            name: safeCharId,
            remark: safeCharId,
            hippocampusEnabled: true
        };
    }

    /**
     * 读取管理台用于临时运行海马体客户端的设置快照。
     */
    function getHippocampusSettingsSnapshot(contactSummary) {
        const bridge = getBridge();
        if (bridge && typeof bridge.getHippocampusSettingsSnapshot === 'function') {
            try {
                const snapshot = bridge.getHippocampusSettingsSnapshot(contactSummary || null);
                if (snapshot && typeof snapshot === 'object') {
                    return Object.assign({}, snapshot);
                }
            } catch (_) { }
        }

        return {
            hippocampusEnabled: true,
            hippocampusV2Enabled: true,
            enableReconsolidation: true,
            enableRipple: true,
            enableDiffuse: true,
            enableEventMixedRecall: true,
            reconsolidationBatchMode: 'auto',
            reconsolidationTriggerChance: 0.2
        };
    }

    /**
     * 读取手动重构要复用的脱水 API 配置。
     */
    function getDehydrateApiConfig() {
        const bridge = getBridge();
        if (!bridge || typeof bridge.getDehydrateApiConfig !== 'function') {
            return {};
        }

        try {
            const config = bridge.getDehydrateApiConfig();
            return config && typeof config === 'object'
                ? Object.assign({}, config)
                : {};
        } catch (_) {
            return {};
        }
    }

    /**
     * 读取记事本整理要复用的主聊天 API 配置。
     */
    function getPrimaryChatApiConfig() {
        const bridge = getBridge();
        if (bridge && typeof bridge.getPrimaryChatApiConfig === 'function') {
            try {
                const config = bridge.getPrimaryChatApiConfig();
                return config && typeof config === 'object'
                    ? Object.assign({}, config)
                    : {};
            } catch (_) {
                return {};
            }
        }
        return getDehydrateApiConfig();
    }

    /**
     * 获取一个可独立初始化的海马体运行时客户端，优先使用工厂创建隔离实例。
     */
    function getRuntimeClient() {
        if (root && typeof root.createHippocampusClient === 'function') {
            try {
                const isolated = root.createHippocampusClient(root);
                if (isolated && typeof isolated === 'object') {
                    return {
                        client: isolated,
                        isolated: true
                    };
                }
            } catch (_) { }
        }

        if (root && root.HippocampusClient && typeof root.HippocampusClient === 'object') {
            return {
                client: root.HippocampusClient,
                isolated: false
            };
        }

        return {
            client: null,
            isolated: false
        };
    }

    /**
     * 读取记事本模块，复用其已封装好的 RPC 与规范化逻辑。
     */
    function getNotebookModule() {
        if (root && root.HippocampusNotebook && typeof root.HippocampusNotebook === 'object') {
            return root.HippocampusNotebook;
        }
        return null;
    }

    function getRelationshipArcModule() {
        if (root && root.HippocampusRelationshipArc && typeof root.HippocampusRelationshipArc === 'object') {
            return root.HippocampusRelationshipArc;
        }
        return null;
    }

    /**
     * 生成空的管理台记事本载荷，避免视图层到处判空。
     */
    function createEmptyAdminNotebook() {
        return {
            profiles: [],
            mustRemember: [],
            redlines: [],
            pendingRedlines: [],
            compacted: null,
            uncompactedCount: 0,
            promptPreview: null,
            cleanupPreview: null,
            learningProfile: null,
            runtimeStatus: null,
            runtimeHistory: []
        };
    }

    function createEmptyNotebookRuntimeStatus() {
        return {
            charId: '',
            phase: 'idle',
            enabled: false,
            fetchOk: false,
            updatedAt: '',
            source: 'none',
            note: '',
            error: '',
            checksum: '',
            promptCharLength: 0,
            promptLineCount: 0,
            injectedCharLength: 0,
            injectedLineCount: 0,
            keptCount: 0,
            suppressedCount: 0,
            candidateCount: 0,
            hasRedline: false,
            hasStable: false,
            usedFallbackFullPrompt: false,
            reasonCounts: {
                lowValue: 0,
                duplicate: 0,
                pendingConfirmation: 0
            },
            counts: {
                redlines: 0,
                mustRemember: 0,
                profiles: 0
            },
            sectionCounts: {
                criticalRedlines: 0,
                importantRedlines: 0,
                reminderRedlines: 0,
                mustRemember: 0,
                profiles: 0
            }
        };
    }

    function createEmptyNotebookRuntimeHistoryEntry() {
        return Object.assign({}, createEmptyNotebookRuntimeStatus(), {
            id: '',
            firstSeenAt: '',
            lastSeenAt: '',
            repeatCount: 0,
            historySignature: ''
        });
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

    /**
     * 生成空的记事本 Prompt 预览结构。
     */
    function createEmptyNotebookPromptPreview() {
        return {
            text: '',
            preview: '',
            checksum: '',
            charLength: 0,
            lineCount: 0,
            isEmpty: true,
            generatedAt: '',
            counts: {
                statuses: 0,
                profiles: 0,
                mustRemember: 0,
                redlines: 0
            },
            sectionCounts: {
                criticalRedlines: 0,
                importantRedlines: 0,
                reminderRedlines: 0,
                mustRemember: 0,
                profiles: 0
            }
        };
    }

    function createEmptyNotebookCleanupBucket() {
        return {
            totalCount: 0,
            keptCount: 0,
            suppressedCount: 0,
            keptIds: [],
            suppressedIds: [],
            suppressedItems: [],
            reasonCounts: {
                low_value: 0,
                duplicate: 0,
                pending_confirmation: 0
            }
        };
    }

    function createEmptyNotebookCleanupPreview() {
        return {
            generatedAt: '',
            totalCount: 0,
            keptCount: 0,
            suppressedCount: 0,
            byKind: {
                redline: createEmptyNotebookCleanupBucket(),
                mustRemember: createEmptyNotebookCleanupBucket(),
                profile: createEmptyNotebookCleanupBucket()
            }
        };
    }

    /**
     * 规整化记事本 Prompt 预览，避免视图层到处兜底。
     */
    function normalizeNotebookPromptPreview(preview) {
        const source = preview && typeof preview === 'object' ? preview : {};
        const empty = createEmptyNotebookPromptPreview();
        const text = toTrimmedString(source.text);
        const counts = source.counts && typeof source.counts === 'object' ? source.counts : {};
        const sectionCounts = source.sectionCounts && typeof source.sectionCounts === 'object' ? source.sectionCounts : {};

        return {
            text: text,
            preview: toTrimmedString(source.preview) || text.split(/\r?\n/).slice(0, 12).join('\n'),
            checksum: toTrimmedString(source.checksum),
            charLength: Math.max(0, Math.floor(toFiniteNumber(source.charLength !== undefined ? source.charLength : text.length, text.length))),
            lineCount: Math.max(0, Math.floor(toFiniteNumber(source.lineCount !== undefined ? source.lineCount : (text ? text.split(/\r?\n/).length : 0), 0))),
            isEmpty: source.isEmpty === true || !text,
            generatedAt: toTrimmedString(source.generatedAt || source.generated_at) || new Date().toISOString(),
            counts: {
                statuses: Math.max(0, Math.floor(toFiniteNumber(counts.statuses, empty.counts.statuses))),
                profiles: Math.max(0, Math.floor(toFiniteNumber(counts.profiles, empty.counts.profiles))),
                mustRemember: Math.max(0, Math.floor(toFiniteNumber(counts.mustRemember, empty.counts.mustRemember))),
                redlines: Math.max(0, Math.floor(toFiniteNumber(counts.redlines, empty.counts.redlines)))
            },
            sectionCounts: {
                criticalRedlines: Math.max(0, Math.floor(toFiniteNumber(sectionCounts.criticalRedlines, empty.sectionCounts.criticalRedlines))),
                importantRedlines: Math.max(0, Math.floor(toFiniteNumber(sectionCounts.importantRedlines, empty.sectionCounts.importantRedlines))),
                reminderRedlines: Math.max(0, Math.floor(toFiniteNumber(sectionCounts.reminderRedlines, empty.sectionCounts.reminderRedlines))),
                mustRemember: Math.max(0, Math.floor(toFiniteNumber(sectionCounts.mustRemember, empty.sectionCounts.mustRemember))),
                profiles: Math.max(0, Math.floor(toFiniteNumber(sectionCounts.profiles, empty.sectionCounts.profiles)))
            }
        };
    }

    function normalizeNotebookCleanupBucket(bucket) {
        const source = bucket && typeof bucket === 'object' ? bucket : {};
        const empty = createEmptyNotebookCleanupBucket();
        const reasonCounts = source.reasonCounts && typeof source.reasonCounts === 'object' ? source.reasonCounts : {};
        const keptIds = Array.isArray(source.keptIds) ? source.keptIds.map(toTrimmedString).filter(Boolean) : [];
        const suppressedIds = Array.isArray(source.suppressedIds) ? source.suppressedIds.map(toTrimmedString).filter(Boolean) : [];
        const suppressedItems = Array.isArray(source.suppressedItems)
            ? source.suppressedItems.map(function mapItem(item) {
                const safeItem = item && typeof item === 'object' ? item : {};
                return {
                    id: toTrimmedString(safeItem.id),
                    content: toTrimmedString(safeItem.content),
                    reason: toTrimmedString(safeItem.reason) || 'low_value',
                    kind: toTrimmedString(safeItem.kind),
                    duplicateOf: toTrimmedString(safeItem.duplicateOf),
                    category: toTrimmedString(safeItem.category),
                    phase: toTrimmedString(safeItem.phase),
                    severity: toTrimmedString(safeItem.severity)
                };
            }).filter(function keepItem(item) {
                return !!(item.id || item.content);
            })
            : [];

        return {
            totalCount: Math.max(0, Math.floor(toFiniteNumber(source.totalCount, empty.totalCount))),
            keptCount: Math.max(0, Math.floor(toFiniteNumber(source.keptCount, empty.keptCount))),
            suppressedCount: Math.max(0, Math.floor(toFiniteNumber(source.suppressedCount, empty.suppressedCount))),
            keptIds: keptIds,
            suppressedIds: suppressedIds,
            suppressedItems: suppressedItems,
            reasonCounts: {
                low_value: Math.max(0, Math.floor(toFiniteNumber(reasonCounts.low_value, empty.reasonCounts.low_value))),
                duplicate: Math.max(0, Math.floor(toFiniteNumber(reasonCounts.duplicate, empty.reasonCounts.duplicate))),
                pending_confirmation: Math.max(0, Math.floor(toFiniteNumber(reasonCounts.pending_confirmation, empty.reasonCounts.pending_confirmation)))
            }
        };
    }

    function normalizeNotebookCleanupPreview(preview) {
        const source = preview && typeof preview === 'object' ? preview : {};
        const empty = createEmptyNotebookCleanupPreview();
        const byKind = source.byKind && typeof source.byKind === 'object' ? source.byKind : {};
        return {
            generatedAt: toTrimmedString(source.generatedAt || source.generated_at) || new Date().toISOString(),
            totalCount: Math.max(0, Math.floor(toFiniteNumber(source.totalCount, empty.totalCount))),
            keptCount: Math.max(0, Math.floor(toFiniteNumber(source.keptCount, empty.keptCount))),
            suppressedCount: Math.max(0, Math.floor(toFiniteNumber(source.suppressedCount, empty.suppressedCount))),
            byKind: {
                redline: normalizeNotebookCleanupBucket(byKind.redline),
                mustRemember: normalizeNotebookCleanupBucket(byKind.mustRemember),
                profile: normalizeNotebookCleanupBucket(byKind.profile)
            }
        };
    }

    function normalizeNotebookRuntimeStatus(status, fallbackCharId) {
        const source = status && typeof status === 'object' ? status : {};
        const empty = createEmptyNotebookRuntimeStatus();
        const counts = source.counts && typeof source.counts === 'object' ? source.counts : {};
        const sectionCounts = source.sectionCounts && typeof source.sectionCounts === 'object' ? source.sectionCounts : {};
        const reasonCounts = source.reasonCounts && typeof source.reasonCounts === 'object' ? source.reasonCounts : {};
        return {
            charId: toTrimmedString(source.charId || source.char_id || fallbackCharId),
            phase: toTrimmedString(source.phase || source.status).toLowerCase() || empty.phase,
            enabled: source.enabled === true,
            fetchOk: source.fetchOk === true,
            updatedAt: toTrimmedString(source.updatedAt || source.updated_at),
            source: toTrimmedString(source.source) || empty.source,
            note: toTrimmedString(source.note),
            error: toTrimmedString(source.error),
            checksum: toTrimmedString(source.checksum),
            promptCharLength: Math.max(0, Math.floor(toFiniteNumber(source.promptCharLength || source.prompt_char_length || source.charLength, 0))),
            promptLineCount: Math.max(0, Math.floor(toFiniteNumber(source.promptLineCount || source.prompt_line_count || source.lineCount, 0))),
            injectedCharLength: Math.max(0, Math.floor(toFiniteNumber(source.injectedCharLength || source.injected_char_length, 0))),
            injectedLineCount: Math.max(0, Math.floor(toFiniteNumber(source.injectedLineCount || source.injected_line_count, 0))),
            keptCount: Math.max(0, Math.floor(toFiniteNumber(source.keptCount || source.kept_count, 0))),
            suppressedCount: Math.max(0, Math.floor(toFiniteNumber(source.suppressedCount || source.suppressed_count, 0))),
            candidateCount: Math.max(
                0,
                Math.floor(
                    toFiniteNumber(
                        source.candidateCount !== undefined
                            ? source.candidateCount
                            : source.candidate_count,
                        Math.max(
                            0,
                            Math.floor(toFiniteNumber(source.keptCount || source.kept_count, 0))
                            + Math.floor(toFiniteNumber(source.suppressedCount || source.suppressed_count, 0))
                        )
                    )
                )
            ),
            hasRedline: !!source.hasRedline,
            hasStable: !!source.hasStable,
            usedFallbackFullPrompt: !!source.usedFallbackFullPrompt,
            reasonCounts: {
                lowValue: Math.max(0, Math.floor(toFiniteNumber(
                    reasonCounts.lowValue !== undefined ? reasonCounts.lowValue : reasonCounts.low_value,
                    empty.reasonCounts.lowValue
                ))),
                duplicate: Math.max(0, Math.floor(toFiniteNumber(reasonCounts.duplicate, empty.reasonCounts.duplicate))),
                pendingConfirmation: Math.max(0, Math.floor(toFiniteNumber(
                    reasonCounts.pendingConfirmation !== undefined ? reasonCounts.pendingConfirmation : reasonCounts.pending_confirmation,
                    empty.reasonCounts.pendingConfirmation
                )))
            },
            counts: {
                redlines: Math.max(0, Math.floor(toFiniteNumber(counts.redlines, empty.counts.redlines))),
                mustRemember: Math.max(0, Math.floor(toFiniteNumber(counts.mustRemember, empty.counts.mustRemember))),
                profiles: Math.max(0, Math.floor(toFiniteNumber(counts.profiles, empty.counts.profiles)))
            },
            sectionCounts: {
                criticalRedlines: Math.max(0, Math.floor(toFiniteNumber(sectionCounts.criticalRedlines, empty.sectionCounts.criticalRedlines))),
                importantRedlines: Math.max(0, Math.floor(toFiniteNumber(sectionCounts.importantRedlines, empty.sectionCounts.importantRedlines))),
                reminderRedlines: Math.max(0, Math.floor(toFiniteNumber(sectionCounts.reminderRedlines, empty.sectionCounts.reminderRedlines))),
                mustRemember: Math.max(0, Math.floor(toFiniteNumber(sectionCounts.mustRemember, empty.sectionCounts.mustRemember))),
                profiles: Math.max(0, Math.floor(toFiniteNumber(sectionCounts.profiles, empty.sectionCounts.profiles)))
            }
        };
    }

    function normalizeNotebookRuntimeHistoryEntry(entry, fallbackCharId) {
        const source = entry && typeof entry === 'object' ? entry : {};
        const base = normalizeNotebookRuntimeStatus(source, fallbackCharId);
        const empty = createEmptyNotebookRuntimeHistoryEntry();
        const firstSeenAt = toTrimmedString(source.firstSeenAt || source.first_seen_at || base.updatedAt);
        const lastSeenAt = toTrimmedString(source.lastSeenAt || source.last_seen_at || base.updatedAt || firstSeenAt);
        return Object.assign({}, base, {
            id: toTrimmedString(source.id) || createLocalId('hippo-notebook-runtime'),
            firstSeenAt: firstSeenAt,
            lastSeenAt: lastSeenAt,
            repeatCount: Math.max(
                1,
                Math.floor(
                    toFiniteNumber(
                        source.repeatCount !== undefined ? source.repeatCount : source.repeat_count,
                        empty.repeatCount || 1
                    )
                )
            ),
            historySignature: toTrimmedString(source.historySignature || source.history_signature || source.signature)
        });
    }

    function buildNotebookRuntimeHistoryStorageKey(charId) {
        return `${NOTEBOOK_RUNTIME_HISTORY_STORAGE_KEY_PREFIX}:${toTrimmedString(charId)}`;
    }

    function readNotebookRuntimeHistoryFromStorage(charId) {
        const safeCharId = toTrimmedString(charId);
        if (!safeCharId || !root || !root.localStorage) return [];
        try {
            const raw = root.localStorage.getItem(buildNotebookRuntimeHistoryStorageKey(safeCharId));
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            const list = Array.isArray(parsed) ? parsed : [];
            return list
                .map(function mapEntry(item) {
                    return normalizeNotebookRuntimeHistoryEntry(item, safeCharId);
                })
                .filter(Boolean)
                .sort(function sortEntry(left, right) {
                    return new Date(right.lastSeenAt || right.updatedAt || right.firstSeenAt).getTime()
                        - new Date(left.lastSeenAt || left.updatedAt || left.firstSeenAt).getTime();
                });
        } catch (_) {
            return [];
        }
    }

    async function listNotebookRuntimeHistory(charId, options) {
        const safeCharId = toTrimmedString(charId);
        const source = options && typeof options === 'object' ? options : {};
        const safeLimit = Math.max(1, Math.min(
            MAX_NOTEBOOK_RUNTIME_HISTORY_COUNT,
            Math.floor(toFiniteNumber(source.limit, 24))
        ));
        if (!safeCharId) return [];

        const bridge = getBridge();
        const bridgeMethodNames = ['listNotebookRuntimeHistory', 'getNotebookRuntimeHistory'];
        let bridgeEntries = [];
        if (bridge) {
            for (let i = 0; i < bridgeMethodNames.length; i += 1) {
                const method = bridge[bridgeMethodNames[i]];
                if (typeof method !== 'function') continue;
                try {
                    const response = await Promise.resolve(method.call(bridge, safeCharId, { limit: safeLimit }));
                    bridgeEntries = (Array.isArray(response) ? response : [])
                        .map(function mapEntry(item) {
                            return normalizeNotebookRuntimeHistoryEntry(item, safeCharId);
                        })
                        .filter(Boolean);
                    if (bridgeEntries.length > 0) break;
                } catch (_) {
                    // 继续尝试本地兜底。
                }
            }
        }

        const localEntries = readNotebookRuntimeHistoryFromStorage(safeCharId);
        const mergedMap = new Map();
        localEntries.forEach(function keepLocal(entry) {
            mergedMap.set(toTrimmedString(entry && entry.id), entry);
        });
        bridgeEntries.forEach(function keepBridge(entry) {
            mergedMap.set(toTrimmedString(entry && entry.id), entry);
        });
        return Array.from(mergedMap.values())
            .sort(function sortEntry(left, right) {
                return new Date(right.lastSeenAt || right.updatedAt || right.firstSeenAt).getTime()
                    - new Date(left.lastSeenAt || left.updatedAt || left.firstSeenAt).getTime();
            })
            .slice(0, safeLimit);
    }

    async function clearNotebookRuntimeHistory(charId) {
        const safeCharId = toTrimmedString(charId);
        if (!safeCharId) {
            return { ok: false, error: 'invalid_char_id', message: '缺少角色 ID。' };
        }

        if (root && root.localStorage) {
            try {
                root.localStorage.removeItem(buildNotebookRuntimeHistoryStorageKey(safeCharId));
            } catch (_) {
                // 本地删除失败时继续桥接删除。
            }
        }

        const bridge = getBridge();
        const bridgeMethodNames = ['clearNotebookRuntimeHistory', 'deleteNotebookRuntimeHistory'];
        let bridgeSynced = false;
        if (bridge) {
            for (let i = 0; i < bridgeMethodNames.length; i += 1) {
                const method = bridge[bridgeMethodNames[i]];
                if (typeof method !== 'function') continue;
                try {
                    await Promise.resolve(method.call(bridge, safeCharId));
                    bridgeSynced = true;
                    break;
                } catch (_) {
                    // 保留本地删除结果，不中断。
                }
            }
        }

        return {
            ok: true,
            charId: safeCharId,
            bridgeSynced: bridgeSynced
        };
    }

    /**
     * 将任意值转换为去首尾空白的字符串。
     */
    function toTrimmedString(value) {
        return String(value === undefined || value === null ? '' : value).trim();
    }

    /**
     * 规范化 ID 列表，供批量管理动作复用。
     */
    function normalizeIdList(value, maxCount) {
        const source = Array.isArray(value) ? value : (value === undefined || value === null ? [] : [value]);
        const limit = Math.max(1, Math.floor(toFiniteNumber(maxCount, 200)));
        const result = [];
        const seen = new Set();

        for (let i = 0; i < source.length; i += 1) {
            const id = toTrimmedString(source[i]);
            if (!id || seen.has(id)) continue;
            seen.add(id);
            result.push(id);
            if (result.length >= limit) break;
        }

        return result;
    }

    /**
     * 将任意值转换为有限数字，不合法时回退到默认值。
     */
    function toFiniteNumber(value, fallback) {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : fallback;
    }

    /**
     * 生成本地唯一 ID，供本地记录使用。
     */
    function createLocalId(prefix) {
        return `${toTrimmedString(prefix) || 'hippo-local'}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    }

    /**
     * 将可能为空的文本值标准化为 null 或非空字符串。
     */
    function toNullableText(value) {
        const text = toTrimmedString(value);
        return text || null;
    }

    /**
     * 将输入规范化为布尔值或 null。
     */
    function toNullableBoolean(value) {
        if (value === null || value === undefined || value === '') return null;
        if (typeof value === 'boolean') return value;
        if (typeof value === 'number') return value !== 0;

        const normalized = toTrimmedString(value).toLowerCase();
        if (!normalized || normalized === 'all') return null;
        if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'resolved') return true;
        if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'unresolved') return false;
        return null;
    }

    /**
     * 将输入规范化为布尔值；无法识别时回退 false。
     */
    function toBoolean(value) {
        const normalized = toNullableBoolean(value);
        return normalized === null ? false : normalized;
    }

    /**
     * 统一解析记事本相关接口的 userId / charId 传参。
     * 兼容 fetchAdminNotebook(charId) 和 fetchAdminNotebook(userId, charId)。
     */
    function resolveNotebookIdentity(userIdOrCharId, maybeCharId) {
        const explicitCharId = maybeCharId === undefined
            ? toTrimmedString(userIdOrCharId)
            : toTrimmedString(maybeCharId);
        const explicitUserId = maybeCharId === undefined
            ? getUserId()
            : (toTrimmedString(userIdOrCharId) || getUserId());
        return {
            userId: explicitUserId,
            charId: explicitCharId
        };
    }

    /**
     * 统一解析记事本写入接口的参数。
     * 兼容 adminAddX(charId, payload) 和 adminAddX(userId, charId, payload)。
     */
    function resolveNotebookMutationArgs(userIdOrCharId, charIdOrPayload, maybePayload) {
        if (maybePayload === undefined) {
            return {
                userId: getUserId(),
                charId: toTrimmedString(userIdOrCharId),
                payload: charIdOrPayload
            };
        }

        return {
            userId: toTrimmedString(userIdOrCharId) || getUserId(),
            charId: toTrimmedString(charIdOrPayload),
            payload: maybePayload
        };
    }

    /**
     * 规范化管理台待确认红线。
     */
    function normalizePendingAdminRedline(row) {
        const source = row && typeof row === 'object' ? row : {};
        const id = toTrimmedString(source.id);
        if (!id) return null;

        return {
            id: id,
            user_id: toTrimmedString(source.user_id),
            char_id: toTrimmedString(source.char_id),
            content: toTrimmedString(source.content),
            severity: toTrimmedString(source.severity).toLowerCase() || 'important',
            origin: toTrimmedString(source.origin).toLowerCase() || 'system_extracted',
            origin_context: toTrimmedString(source.origin_context),
            is_active: source.is_active !== false,
            confirmed: source.confirmed === true,
            source_memory_ids: Array.isArray(source.source_memory_ids)
                ? source.source_memory_ids.map(toTrimmedString).filter(Boolean)
                : [],
            metadata: source.metadata && typeof source.metadata === 'object' ? source.metadata : {},
            created_at: source.created_at || null,
            updated_at: source.updated_at || null
        };
    }

    /**
     * 将分页游标标准化为统一结构。
     */
    function normalizeListCursor(value) {
        const source = value && typeof value === 'object' ? value : {};
        const id = toTrimmedString(source.id);
        if (!id) return null;

        const cursor = {
            id: id,
            sort: normalizeSort(source.sort),
            sortValue: toTrimmedString(source.sortValue || source.value || ''),
            importance: Number.isFinite(Number(source.importance)) ? Number(source.importance) : null
        };
        return cursor;
    }

    /**
     * 规范化角色摘要，避免把完整联系人对象暴露到管理台。
     */
    function normalizeContactSummary(contact) {
        if (!contact || typeof contact !== 'object') return null;

        const id = toTrimmedString(contact.id);
        if (!id) return null;

        const remark = toTrimmedString(contact.remark);
        const name = toTrimmedString(contact.name);

        const normalized = {
            id: id,
            name: name || remark || id,
            remark: remark || name || id,
            hippocampusEnabled: !!contact.hippocampusEnabled
        };

        const optionalFieldNames = [
            'attachmentStyle',
            'hippocampusAttachmentStyle',
            'selfInsight',
            'selfInsights',
            'digestSummary',
            'gender',
            'biologicalSex',
            'psychologicalGender'
        ];
        for (let i = 0; i < optionalFieldNames.length; i += 1) {
            const fieldName = optionalFieldNames[i];
            if (contact[fieldName] !== undefined) {
                normalized[fieldName] = contact[fieldName];
            }
        }

        return normalized;
    }

    /**
     * 将依恋型值规范化为固定枚举。
     */
    function normalizeAttachmentStyle(style) {
        const value = toTrimmedString(style).toLowerCase();
        if (!value) return '';
        if (value === 'secure' || value === '安全型') return 'secure';
        if (value === 'anxious' || value === '焦虑型') return 'anxious';
        if (value === 'avoidant' || value === '回避型') return 'avoidant';
        if (value === 'disorganized' || value === '混乱型') return 'disorganized';
        return '';
    }

    /**
     * 将依恋型配置对象规范化。
     */
    function normalizeAttachmentProfile(profile, fallbackCharId) {
        const source = profile && typeof profile === 'object' ? profile : {};
        const charId = toTrimmedString(source.charId || source.char_id || fallbackCharId);
        if (!charId) return null;
        const style = normalizeAttachmentStyle(
            source.style
            || source.attachmentStyle
            || source.attachment_style
            || source.hippocampusAttachmentStyle
        ) || 'secure';
        const updatedAt = toTrimmedString(source.updatedAt || source.updated_at) || new Date().toISOString();
        return {
            charId: charId,
            style: style,
            manualOverride: !!source.manualOverride || !!source.manual_override,
            source: toTrimmedString(source.source) || 'local',
            updatedAt: updatedAt
        };
    }

    /**
     * 生成依恋型本地存储键。
     */
    function buildAttachmentStorageKey(charId) {
        return `${ATTACHMENT_STORAGE_KEY_PREFIX}:${toTrimmedString(charId)}`;
    }

    /**
     * 读取本地依恋型配置。
     */
    function readAttachmentProfileFromStorage(charId) {
        const safeCharId = toTrimmedString(charId);
        if (!safeCharId || !root || !root.localStorage) return null;
        try {
            const raw = root.localStorage.getItem(buildAttachmentStorageKey(safeCharId));
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            return normalizeAttachmentProfile(parsed, safeCharId);
        } catch (_) {
            return null;
        }
    }

    /**
     * 写入本地依恋型配置。
     */
    function writeAttachmentProfileToStorage(profile) {
        const normalized = normalizeAttachmentProfile(profile);
        if (!normalized || !root || !root.localStorage) return;
        try {
            root.localStorage.setItem(buildAttachmentStorageKey(normalized.charId), JSON.stringify(normalized));
        } catch (_) {
            // 本地写入失败时静默降级。
        }
    }

    /**
     * 读取当前角色依恋型（桥接优先，本地兜底）。
     */
    async function getAttachmentProfile(charId) {
        const safeCharId = toTrimmedString(charId);
        if (!safeCharId) return null;

        const bridge = getBridge();
        const bridgeMethodNames = ['getAttachmentProfile', 'getHippocampusAttachmentProfile', 'getCurrentAttachmentProfile'];
        if (bridge) {
            for (let i = 0; i < bridgeMethodNames.length; i += 1) {
                const methodName = bridgeMethodNames[i];
                const method = bridge[methodName];
                if (typeof method !== 'function') continue;
                try {
                    const response = await Promise.resolve(method.call(bridge, safeCharId));
                    const normalized = normalizeAttachmentProfile(response, safeCharId);
                    if (normalized) {
                        normalized.source = 'bridge';
                        writeAttachmentProfileToStorage(normalized);
                        return normalized;
                    }
                } catch (_) {
                    // 逐个方法尝试，不中断。
                }
            }
        }

        const localProfile = readAttachmentProfileFromStorage(safeCharId);
        if (localProfile) return localProfile;

        const summary = getCurrentContactSummary();
        const fallbackStyle = normalizeAttachmentStyle(summary && (
            summary.attachmentStyle
            || summary.hippocampusAttachmentStyle
        ));
        if (fallbackStyle) {
            const fallbackProfile = {
                charId: safeCharId,
                style: fallbackStyle,
                manualOverride: false,
                source: 'contact',
                updatedAt: new Date().toISOString()
            };
            writeAttachmentProfileToStorage(fallbackProfile);
            return fallbackProfile;
        }

        const defaultProfile = {
            charId: safeCharId,
            style: 'secure',
            manualOverride: false,
            source: 'default',
            updatedAt: new Date().toISOString()
        };
        writeAttachmentProfileToStorage(defaultProfile);
        return defaultProfile;
    }

    /**
     * 更新当前角色依恋型（桥接可用时尝试同步，本地必落盘）。
     */
    async function updateAttachmentProfile(charId, updates) {
        const safeCharId = toTrimmedString(charId);
        const source = updates && typeof updates === 'object' ? updates : {};
        if (!safeCharId) {
            return { ok: false, error: 'invalid_char_id', message: '缺少角色 ID。' };
        }

        const nextStyle = normalizeAttachmentStyle(source.style || source.attachmentStyle || source.attachment_style);
        if (!nextStyle) {
            return { ok: false, error: 'invalid_style', message: '依恋型不合法。' };
        }

        const existing = await getAttachmentProfile(safeCharId);
        const profile = normalizeAttachmentProfile(Object.assign({}, existing || {}, source, {
            charId: safeCharId,
            style: nextStyle,
            manualOverride: source.manualOverride !== undefined ? !!source.manualOverride : true,
            source: 'manual',
            updatedAt: new Date().toISOString()
        }), safeCharId);
        if (!profile) {
            return { ok: false, error: 'normalize_failed', message: '依恋型写入失败，请重试。' };
        }

        const bridge = getBridge();
        const bridgeMethodNames = ['updateAttachmentProfile', 'setAttachmentProfile', 'saveAttachmentProfile'];
        let bridgeSynced = false;
        if (bridge) {
            for (let i = 0; i < bridgeMethodNames.length; i += 1) {
                const methodName = bridgeMethodNames[i];
                const method = bridge[methodName];
                if (typeof method !== 'function') continue;
                try {
                    const response = await Promise.resolve(method.call(bridge, safeCharId, profile));
                    if (response === false) continue;
                    bridgeSynced = true;
                    break;
                } catch (_) {
                    // 保留本地写入，不中断。
                }
            }
        }

        writeAttachmentProfileToStorage(profile);
        return {
            ok: true,
            profile: profile,
            bridgeSynced: bridgeSynced
        };
    }

    /**
     * 生成 digest 成果记录本地存储键。
     */
    function buildDigestRecordStorageKey(charId) {
        return `${DIGEST_RECORD_STORAGE_KEY_PREFIX}:${toTrimmedString(charId)}`;
    }

    /**
     * 规范化 digest 成果记录。
     */
    function normalizeDigestOutcomeRecord(record, fallbackCharId) {
        const source = record && typeof record === 'object' ? record : {};
        const charId = toTrimmedString(source.charId || source.char_id || fallbackCharId);
        if (!charId) return null;

        const createdAt = toTrimmedString(source.createdAt || source.created_at) || new Date().toISOString();
        const updatedAt = toTrimmedString(source.updatedAt || source.updated_at) || createdAt;
        const windowEnd = toTrimmedString(source.windowEnd || source.window_end) || createdAt;

        return {
            id: toTrimmedString(source.id) || createLocalId('hippo-digest'),
            charId: charId,
            windowStart: toTrimmedString(source.windowStart || source.window_start) || createdAt,
            windowEnd: windowEnd,
            sourceMessageCount: Math.max(0, Math.floor(toFiniteNumber(source.sourceMessageCount || source.source_message_count, 0))),
            migratedCount: Math.max(0, Math.floor(toFiniteNumber(source.migratedCount || source.migrated_count, 0))),
            eventizedCount: Math.max(0, Math.floor(toFiniteNumber(source.eventizedCount || source.eventized_count, 0))),
            assignedFragmentCount: Math.max(0, Math.floor(toFiniteNumber(source.assignedFragmentCount || source.assigned_fragment_count, 0))),
            orphanFragmentCount: Math.max(0, Math.floor(toFiniteNumber(source.orphanFragmentCount || source.orphan_fragment_count, 0))),
            attachmentBefore: normalizeAttachmentStyle(source.attachmentBefore || source.attachment_before),
            attachmentAfter: normalizeAttachmentStyle(source.attachmentAfter || source.attachment_after),
            selfInsightBefore: toTrimmedString(source.selfInsightBefore || source.self_insight_before),
            selfInsightAfter: toTrimmedString(source.selfInsightAfter || source.self_insight_after),
            digestSummary: toTrimmedString(source.digestSummary || source.digest_summary),
            eventChanges: toTrimmedString(source.eventChanges || source.event_changes),
            fragmentChanges: toTrimmedString(source.fragmentChanges || source.fragment_changes),
            relatedMemoryIds: normalizeIdArray(source.relatedMemoryIds || source.related_memory_ids, 160),
            relatedCandidateKeys: normalizeIdArray(source.relatedCandidateKeys || source.related_candidate_keys, 160),
            manualEdited: !!source.manualEdited || !!source.manual_edited,
            manualDeleted: !!source.manualDeleted || !!source.manual_deleted,
            createdAt: createdAt,
            updatedAt: updatedAt
        };
    }

    /**
     * 读取本地 digest 成果记录列表。
     */
    function readDigestOutcomeRecordsFromStorage(charId) {
        const safeCharId = toTrimmedString(charId);
        if (!safeCharId || !root || !root.localStorage) return [];
        try {
            const raw = root.localStorage.getItem(buildDigestRecordStorageKey(safeCharId));
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            const list = Array.isArray(parsed) ? parsed : [];
            return list
                .map(function mapRecord(item) {
                    return normalizeDigestOutcomeRecord(item, safeCharId);
                })
                .filter(Boolean);
        } catch (_) {
            return [];
        }
    }

    /**
     * 写入本地 digest 成果记录列表。
     */
    function writeDigestOutcomeRecordsToStorage(charId, records) {
        const safeCharId = toTrimmedString(charId);
        if (!safeCharId || !root || !root.localStorage) return;
        const safeRecords = (Array.isArray(records) ? records : [])
            .map(function mapRecord(item) {
                return normalizeDigestOutcomeRecord(item, safeCharId);
            })
            .filter(Boolean)
            .sort(function sortRecord(a, b) {
                return new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime();
            })
            .slice(0, MAX_DIGEST_RECORD_COUNT);
        try {
            root.localStorage.setItem(buildDigestRecordStorageKey(safeCharId), JSON.stringify(safeRecords));
        } catch (_) {
            // 本地写入失败时静默降级。
        }
    }

    /**
     * 过滤指定时间窗口内的 digest 成果记录。
     */
    function filterDigestRecordsByHours(records, hours) {
        const safeHours = Math.max(1, Math.floor(toFiniteNumber(hours, 24)));
        const cutoff = Date.now() - (safeHours * 60 * 60 * 1000);
        return (Array.isArray(records) ? records : []).filter(function keepRecent(item) {
            const ts = new Date(item.windowEnd || item.createdAt).getTime();
            return Number.isFinite(ts) && ts >= cutoff && !item.manualDeleted;
        });
    }

    /**
     * 列出最近 digest 成果记录（桥接优先，本地兜底）。
     */
    async function listDigestOutcomeRecords(filters) {
        const source = filters && typeof filters === 'object' ? filters : {};
        const safeCharId = toTrimmedString(source.charId);
        const safeHours = Math.max(1, Math.floor(toFiniteNumber(source.hours, 24)));
        if (!safeCharId) return [];

        const bridge = getBridge();
        const bridgeMethodNames = ['listDigestOutcomeRecords', 'getDigestOutcomeRecords', 'listDigestResults'];
        let bridgeRecords = [];
        if (bridge) {
            for (let i = 0; i < bridgeMethodNames.length; i += 1) {
                const methodName = bridgeMethodNames[i];
                const method = bridge[methodName];
                if (typeof method !== 'function') continue;
                try {
                    const response = await Promise.resolve(method.call(bridge, { charId: safeCharId, hours: safeHours }));
                    const list = Array.isArray(response) ? response : [];
                    bridgeRecords = list
                        .map(function mapRecord(item) {
                            const normalized = normalizeDigestOutcomeRecord(item, safeCharId);
                            if (!normalized) return null;
                            normalized.source = 'bridge';
                            return normalized;
                        })
                        .filter(Boolean);
                    if (bridgeRecords.length > 0) break;
                } catch (_) {
                    // 继续尝试其他桥接方法。
                }
            }
        }

        const localRecords = readDigestOutcomeRecordsFromStorage(safeCharId);
        const mergedMap = new Map();
        for (let i = 0; i < localRecords.length; i += 1) {
            const item = localRecords[i];
            mergedMap.set(item.id, item);
        }
        for (let i = 0; i < bridgeRecords.length; i += 1) {
            const item = bridgeRecords[i];
            mergedMap.set(item.id, item);
        }

        const merged = Array.from(mergedMap.values())
            .sort(function sortRecord(a, b) {
                return new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime();
            });
        return filterDigestRecordsByHours(merged, safeHours);
    }

    /**
     * 新增或更新一条 digest 成果记录。
     */
    async function upsertDigestOutcomeRecord(charId, payload) {
        const safeCharId = toTrimmedString(charId);
        if (!safeCharId) {
            return { ok: false, error: 'invalid_char_id', message: '缺少角色 ID。' };
        }

        const source = payload && typeof payload === 'object' ? payload : {};
        const records = readDigestOutcomeRecordsFromStorage(safeCharId);
        const targetId = toTrimmedString(source.id) || createLocalId('hippo-digest');
        const existsIndex = records.findIndex(function findRecord(item) {
            return toTrimmedString(item.id) === targetId;
        });
        const baseRecord = existsIndex >= 0 ? records[existsIndex] : {
            id: targetId,
            charId: safeCharId,
            createdAt: new Date().toISOString()
        };

        const nextRecord = normalizeDigestOutcomeRecord(Object.assign({}, baseRecord, source, {
            id: targetId,
            charId: safeCharId,
            manualEdited: source.manualEdited !== undefined ? !!source.manualEdited : true,
            manualDeleted: source.manualDeleted !== undefined ? !!source.manualDeleted : (baseRecord.manualDeleted === true),
            updatedAt: new Date().toISOString()
        }), safeCharId);

        if (!nextRecord) {
            return { ok: false, error: 'normalize_failed', message: '记录格式不合法。' };
        }

        if (existsIndex >= 0) {
            records.splice(existsIndex, 1, nextRecord);
        } else {
            records.unshift(nextRecord);
        }
        writeDigestOutcomeRecordsToStorage(safeCharId, records);

        const bridge = getBridge();
        const bridgeMethodNames = ['upsertDigestOutcomeRecord', 'saveDigestOutcomeRecord', 'updateDigestOutcomeRecord'];
        let bridgeSynced = false;
        if (bridge) {
            for (let i = 0; i < bridgeMethodNames.length; i += 1) {
                const method = bridge[bridgeMethodNames[i]];
                if (typeof method !== 'function') continue;
                try {
                    await Promise.resolve(method.call(bridge, safeCharId, nextRecord));
                    bridgeSynced = true;
                    break;
                } catch (_) {
                    // 保留本地记录，不中断。
                }
            }
        }

        return {
            ok: true,
            record: nextRecord,
            bridgeSynced: bridgeSynced
        };
    }

    /**
     * 删除一条 digest 成果记录。
     */
    async function deleteDigestOutcomeRecord(charId, recordId) {
        const safeCharId = toTrimmedString(charId);
        const safeRecordId = toTrimmedString(recordId);
        if (!safeCharId || !safeRecordId) {
            return { ok: false, error: 'invalid_params', message: '缺少删除参数。' };
        }

        const records = readDigestOutcomeRecordsFromStorage(safeCharId);
        const nextRecords = records.filter(function keepRecord(item) {
            return toTrimmedString(item.id) !== safeRecordId;
        });
        if (nextRecords.length === records.length) {
            return { ok: false, error: 'not_found', message: '未找到要删除的记录。' };
        }
        writeDigestOutcomeRecordsToStorage(safeCharId, nextRecords);

        const bridge = getBridge();
        const bridgeMethodNames = ['deleteDigestOutcomeRecord', 'removeDigestOutcomeRecord'];
        let bridgeSynced = false;
        if (bridge) {
            for (let i = 0; i < bridgeMethodNames.length; i += 1) {
                const method = bridge[bridgeMethodNames[i]];
                if (typeof method !== 'function') continue;
                try {
                    await Promise.resolve(method.call(bridge, safeCharId, safeRecordId));
                    bridgeSynced = true;
                    break;
                } catch (_) {
                    // 本地已删除，不中断。
                }
            }
        }

        return {
            ok: true,
            deletedId: safeRecordId,
            bridgeSynced: bridgeSynced
        };
    }

    /**
     * 标准化管理台展示用的“脱水失败任务”结构。
     */
    /**
     * 拉取管理台记事本数据，并额外带上待确认红线。
     */
    async function fetchAdminNotebook(userIdOrCharId, maybeCharId) {
        const identity = resolveNotebookIdentity(userIdOrCharId, maybeCharId);
        const safeUserId = toTrimmedString(identity.userId);
        const safeCharId = toTrimmedString(identity.charId);
        const supabase = getSupabaseClient();
        const notebookModule = getNotebookModule();
        if (!supabase || !safeUserId || !safeCharId) {
            return createEmptyAdminNotebook();
        }

        const result = createEmptyAdminNotebook();
        let notebookSnapshot = null;

        if (notebookModule && typeof notebookModule.fetchNotebook === 'function') {
            try {
                const notebook = await notebookModule.fetchNotebook(supabase, safeUserId, safeCharId);
                if (notebook && typeof notebook === 'object') {
                    result.profiles = Array.isArray(notebook.profiles) ? notebook.profiles : [];
                    result.mustRemember = Array.isArray(notebook.mustRemember) ? notebook.mustRemember : [];
                    result.redlines = Array.isArray(notebook.redlines) ? notebook.redlines : [];
                    result.compacted = notebook.compacted || null;
                    if (typeof notebookModule.buildNotebookPromptSnapshot === 'function') {
                        notebookSnapshot = notebookModule.buildNotebookPromptSnapshot(notebook);
                    } else if (typeof notebookModule.buildNotebookPromptBlock === 'function') {
                        notebookSnapshot = {
                            notebook: notebook,
                            text: toTrimmedString(notebookModule.buildNotebookPromptBlock(notebook))
                        };
                    }
                }
            } catch (error) {
                console.warn('[海马体管理台] 读取记事本失败，已降级为空数据。', error);
            }
        }

        try {
            const pendingResult = await supabase
                .from('hippocampus_user_redlines')
                .select('id, user_id, char_id, content, severity, origin, origin_context, confirmed, is_active, source_memory_ids, metadata, created_at, updated_at')
                .eq('user_id', safeUserId)
                .eq('char_id', safeCharId)
                .eq('origin', 'system_extracted')
                .eq('confirmed', false)
                .eq('is_active', true)
                .order('created_at', { ascending: true });

            if (pendingResult && pendingResult.error) {
                throw pendingResult.error;
            }

            result.pendingRedlines = Array.isArray(pendingResult && pendingResult.data)
                ? pendingResult.data.map(normalizePendingAdminRedline).filter(Boolean)
                : [];
        } catch (error) {
            console.warn('[海马体管理台] 读取待确认红线失败，已跳过。', error);
            result.pendingRedlines = [];
        }

        if (notebookModule && typeof notebookModule.shouldTriggerCompaction === 'function') {
            try {
                const decision = await notebookModule.shouldTriggerCompaction(supabase, safeUserId, safeCharId);
                result.uncompactedCount = Math.max(0, Math.floor(Number(decision && decision.count) || 0));
            } catch (_) {
                result.uncompactedCount = 0;
            }
        }

        result.promptPreview = normalizeNotebookPromptPreview(notebookSnapshot);
        result.cleanupPreview = normalizeNotebookCleanupPreview(notebookSnapshot && (notebookSnapshot.cleanupPreview || notebookSnapshot.cleanup_preview));
        if (result.pendingRedlines.length > 0) {
            const redlineBucket = result.cleanupPreview.byKind.redline;
            const pendingItems = result.pendingRedlines.map(function mapPendingRedline(item) {
                return {
                    id: toTrimmedString(item && item.id),
                    content: toTrimmedString(item && item.content),
                    reason: 'pending_confirmation',
                    kind: 'redline',
                    duplicateOf: '',
                    category: '',
                    phase: '',
                    severity: toTrimmedString(item && item.severity)
                };
            }).filter(function keepPendingItem(item) {
                return !!(item.id || item.content);
            });
            const pendingIds = pendingItems.map(function mapPendingId(item) {
                return toTrimmedString(item && item.id);
            }).filter(Boolean);

            redlineBucket.totalCount += pendingItems.length;
            redlineBucket.suppressedCount += pendingItems.length;
            redlineBucket.reasonCounts.pending_confirmation += pendingItems.length;
            redlineBucket.suppressedItems = pendingItems.concat(redlineBucket.suppressedItems || []);
            redlineBucket.suppressedIds = pendingIds.concat(Array.isArray(redlineBucket.suppressedIds) ? redlineBucket.suppressedIds : []);

            result.cleanupPreview.totalCount += pendingItems.length;
            result.cleanupPreview.suppressedCount += pendingItems.length;
        }

        result.learningProfile = await fetchNotebookLearningProfile(safeUserId, safeCharId);
        result.runtimeStatus = fetchNotebookRuntimeStatus(safeCharId);
        result.runtimeHistory = await listNotebookRuntimeHistory(safeCharId, { limit: 24 });
        return result;
    }

    /**
     * 管理台手动触发记事本整理。
     */
    async function adminTriggerNotebookCompaction(userIdOrCharId, maybeCharId) {
        const identity = resolveNotebookIdentity(userIdOrCharId, maybeCharId);
        const safeUserId = toTrimmedString(identity.userId);
        const safeCharId = toTrimmedString(identity.charId);
        const supabase = getSupabaseClient();
        const notebookModule = getNotebookModule();
        if (!supabase || !safeUserId || !safeCharId || !notebookModule || typeof notebookModule.executeCompaction !== 'function') {
            return { ok: false, error: 'notebook_compaction_unavailable' };
        }
        return notebookModule.executeCompaction(supabase, safeUserId, safeCharId, getPrimaryChatApiConfig());
    }

    /**
     * 管理台保存手动编辑后的整理归档。
     */
    async function adminUpdateNotebookCompaction(compactedId, groups, text) {
        const supabase = getSupabaseClient();
        const notebookModule = getNotebookModule();
        if (!supabase || !notebookModule || typeof notebookModule.updateCompactedGroups !== 'function') {
            return null;
        }
        return notebookModule.updateCompactedGroups(supabase, compactedId, groups, text);
    }

    /**
     * 管理台回退整理归档，恢复原始条目平铺注入。
     */
    async function adminDeleteNotebookCompaction(compactedId) {
        const supabase = getSupabaseClient();
        const notebookModule = getNotebookModule();
        if (!supabase || !notebookModule || typeof notebookModule.deleteCompacted !== 'function') {
            return null;
        }
        return notebookModule.deleteCompacted(supabase, compactedId);
    }

    async function fetchAdminRelationshipArc(userIdOrCharId, maybeCharId) {
        const identity = resolveNotebookIdentity(userIdOrCharId, maybeCharId);
        const safeUserId = toTrimmedString(identity.userId);
        const safeCharId = toTrimmedString(identity.charId);
        const relationshipModule = getRelationshipArcModule();
        if (!safeUserId || !safeCharId || !relationshipModule || typeof relationshipModule.fetchAdminRelationshipArc !== 'function') {
            return createEmptyAdminRelationshipArc();
        }

        try {
            return await relationshipModule.fetchAdminRelationshipArc(getSupabaseClient(), safeUserId, safeCharId);
        } catch (error) {
            console.warn('[海马体管理台] 读取关系脉络失败，已降级为空。', error);
            return createEmptyAdminRelationshipArc();
        }
    }

    async function rebuildRelationshipArc(userIdOrCharId, maybeCharId, options) {
        const identity = resolveNotebookIdentity(userIdOrCharId, maybeCharId);
        const safeUserId = toTrimmedString(identity.userId);
        const safeCharId = toTrimmedString(identity.charId);
        const relationshipModule = getRelationshipArcModule();
        if (!safeUserId || !safeCharId || !relationshipModule || typeof relationshipModule.runFullRebuild !== 'function') {
            return { ok: false, error: 'relationship_arc_unavailable' };
        }

        const contactSummary = resolveContactSummary(safeCharId);
        return relationshipModule.runFullRebuild(getSupabaseClient(), safeUserId, safeCharId, Object.assign({}, options, {
            charLabel: toTrimmedString(contactSummary && (contactSummary.remark || contactSummary.name || safeCharId))
        }));
    }

    async function updateRelationshipArcTail(userIdOrCharId, maybeCharId, options) {
        const identity = resolveNotebookIdentity(userIdOrCharId, maybeCharId);
        const safeUserId = toTrimmedString(identity.userId);
        const safeCharId = toTrimmedString(identity.charId);
        const relationshipModule = getRelationshipArcModule();
        if (!safeUserId || !safeCharId || !relationshipModule || typeof relationshipModule.runTailUpdate !== 'function') {
            return { ok: false, error: 'relationship_arc_unavailable' };
        }

        const contactSummary = resolveContactSummary(safeCharId);
        return relationshipModule.runTailUpdate(getSupabaseClient(), safeUserId, safeCharId, Object.assign({}, options, {
            charLabel: toTrimmedString(contactSummary && (contactSummary.remark || contactSummary.name || safeCharId))
        }));
    }

    async function previewRelationshipArcImport(userIdOrCharId, charIdOrPayload, maybePayload) {
        const args = resolveNotebookMutationArgs(userIdOrCharId, charIdOrPayload, maybePayload);
        const safeUserId = toTrimmedString(args.userId);
        const safeCharId = toTrimmedString(args.charId);
        const text = toTrimmedString(args.payload && (args.payload.text || args.payload.importText || args.payload.content));
        const relationshipModule = getRelationshipArcModule();
        if (!safeUserId || !safeCharId || !text || !relationshipModule || typeof relationshipModule.runFullRebuild !== 'function') {
            return { ok: false, error: 'relationship_arc_unavailable' };
        }

        const contactSummary = resolveContactSummary(safeCharId);
        return relationshipModule.runFullRebuild(getSupabaseClient(), safeUserId, safeCharId, {
            previewOnly: true,
            inputMode: 'manual_import',
            importedText: text,
            charLabel: toTrimmedString(contactSummary && (contactSummary.remark || contactSummary.name || safeCharId))
        });
    }

    async function importRelationshipArcFromText(userIdOrCharId, charIdOrPayload, maybePayload) {
        const args = resolveNotebookMutationArgs(userIdOrCharId, charIdOrPayload, maybePayload);
        const safeUserId = toTrimmedString(args.userId);
        const safeCharId = toTrimmedString(args.charId);
        const text = toTrimmedString(args.payload && (args.payload.text || args.payload.importText || args.payload.content));
        const relationshipModule = getRelationshipArcModule();
        if (!safeUserId || !safeCharId || !text || !relationshipModule || typeof relationshipModule.runFullRebuild !== 'function') {
            return { ok: false, error: 'relationship_arc_unavailable' };
        }

        const contactSummary = resolveContactSummary(safeCharId);
        return relationshipModule.runFullRebuild(getSupabaseClient(), safeUserId, safeCharId, {
            inputMode: 'manual_import',
            importedText: text,
            charLabel: toTrimmedString(contactSummary && (contactSummary.remark || contactSummary.name || safeCharId))
        });
    }

    async function previewRelationshipArcCompression(userIdOrCharId, charIdOrPayload, maybePayload) {
        const args = resolveNotebookMutationArgs(userIdOrCharId, charIdOrPayload, maybePayload);
        const safeUserId = toTrimmedString(args.userId);
        const safeCharId = toTrimmedString(args.charId);
        const payload = args.payload && typeof args.payload === 'object' ? args.payload : {};
        const relationshipModule = getRelationshipArcModule();
        if (!safeUserId || !safeCharId || !relationshipModule || typeof relationshipModule.runCompression !== 'function') {
            return { ok: false, error: 'relationship_arc_unavailable' };
        }

        const contactSummary = resolveContactSummary(safeCharId);
        return relationshipModule.runCompression(getSupabaseClient(), safeUserId, safeCharId, Object.assign({}, payload, {
            previewOnly: true,
            charLabel: toTrimmedString(contactSummary && (contactSummary.remark || contactSummary.name || safeCharId))
        }));
    }

    async function saveRelationshipArcDraft(userIdOrCharId, charIdOrPayload, maybePayload) {
        const args = resolveNotebookMutationArgs(userIdOrCharId, charIdOrPayload, maybePayload);
        const safeUserId = toTrimmedString(args.userId);
        const safeCharId = toTrimmedString(args.charId);
        const payload = args.payload && typeof args.payload === 'object' ? args.payload : {};
        const draft = payload.draft && typeof payload.draft === 'object' ? payload.draft : payload;
        const relationshipModule = getRelationshipArcModule();
        if (!safeUserId || !safeCharId || !relationshipModule || typeof relationshipModule.saveArcVersionDraft !== 'function') {
            return { ok: false, error: 'relationship_arc_unavailable' };
        }

        return relationshipModule.saveArcVersionDraft(getSupabaseClient(), safeUserId, safeCharId, draft, {
            updateMode: toTrimmedString(payload.updateMode || payload.update_mode || 'compression') || 'compression'
        });
    }

    async function rollbackRelationshipArcVersion(userIdOrCharId, charIdOrVersionId, maybeVersionId) {
        const identity = resolveNotebookIdentity(userIdOrCharId, charIdOrVersionId);
        const safeUserId = toTrimmedString(identity.userId);
        const safeCharId = toTrimmedString(identity.charId);
        const safeVersionId = toTrimmedString(maybeVersionId);
        const relationshipModule = getRelationshipArcModule();
        if (!safeUserId || !safeCharId || !safeVersionId || !relationshipModule || typeof relationshipModule.rollbackArcVersion !== 'function') {
            return { ok: false, error: 'relationship_arc_unavailable' };
        }

        const record = await relationshipModule.rollbackArcVersion(getSupabaseClient(), safeUserId, safeCharId, safeVersionId);
        return {
            ok: !!record,
            record: record || null
        };
    }

    /**
     * 读取当前角色的记事本反馈学习画像。
     */
    async function fetchNotebookLearningProfile(userIdOrCharId, maybeCharId) {
        const identity = resolveNotebookIdentity(userIdOrCharId, maybeCharId);
        const safeUserId = toTrimmedString(identity.userId);
        const safeCharId = toTrimmedString(identity.charId);
        const notebookModule = getNotebookModule();
        if (!safeUserId || !safeCharId || !notebookModule || typeof notebookModule.getNotebookLearningProfile !== 'function') {
            return null;
        }

        try {
            return notebookModule.getNotebookLearningProfile(safeUserId, safeCharId);
        } catch (error) {
            console.warn('[海马体管理台] 读取记事本学习画像失败，已降级为空。', error);
            return null;
        }
    }

    /**
     * 记录一条来自管理台的记事本反馈操作，供后续脱水提取学习偏好。
     */
    function fetchNotebookRuntimeStatus(charId) {
        const safeCharId = toTrimmedString(charId);
        const bridge = getBridge();
        if (!safeCharId || !bridge || typeof bridge.getNotebookRuntimeStatus !== 'function') {
            return null;
        }

        try {
            return normalizeNotebookRuntimeStatus(bridge.getNotebookRuntimeStatus(safeCharId), safeCharId);
        } catch (_) {
            return null;
        }
    }

    async function recordNotebookFeedback(userIdOrCharId, charIdOrPayload, maybePayload) {
        const args = resolveNotebookMutationArgs(userIdOrCharId, charIdOrPayload, maybePayload);
        const safeUserId = toTrimmedString(args.userId);
        const safeCharId = toTrimmedString(args.charId);
        const notebookModule = getNotebookModule();
        if (!safeUserId || !safeCharId || !notebookModule || typeof notebookModule.recordNotebookFeedback !== 'function') {
            return null;
        }

        try {
            return notebookModule.recordNotebookFeedback(safeUserId, safeCharId, args.payload);
        } catch (error) {
            console.warn('[海马体管理台] 记录记事本反馈失败，已跳过。', error);
            return null;
        }
    }

    /**
     * 重置当前角色的记事本学习画像。
     */
    async function resetNotebookLearningProfile(userIdOrCharId, maybeCharId) {
        const identity = resolveNotebookIdentity(userIdOrCharId, maybeCharId);
        const safeUserId = toTrimmedString(identity.userId);
        const safeCharId = toTrimmedString(identity.charId);
        const notebookModule = getNotebookModule();
        if (!safeUserId || !safeCharId || !notebookModule || typeof notebookModule.resetNotebookLearningProfile !== 'function') {
            return null;
        }

        try {
            return notebookModule.resetNotebookLearningProfile(safeUserId, safeCharId);
        } catch (error) {
            console.warn('[海马体管理台] 重置记事本学习画像失败，已跳过。', error);
            return null;
        }
    }

    /**
     * 管理台新增偏好档案。
     */
    async function adminAddProfile(userIdOrCharId, charIdOrPayload, maybePayload) {
        const args = resolveNotebookMutationArgs(userIdOrCharId, charIdOrPayload, maybePayload);
        const supabase = getSupabaseClient();
        const notebookModule = getNotebookModule();
        if (!supabase || !args.userId || !args.charId || !notebookModule || typeof notebookModule.addProfile !== 'function') {
            return null;
        }
        return notebookModule.addProfile(supabase, args.userId, args.charId, args.payload);
    }

    /**
     * 管理台停用偏好档案。
     */
    async function adminDeactivateProfile(profileId, supersededBy) {
        const supabase = getSupabaseClient();
        const notebookModule = getNotebookModule();
        if (!supabase || !notebookModule || typeof notebookModule.deactivateProfile !== 'function') {
            return null;
        }
        return notebookModule.deactivateProfile(supabase, profileId, supersededBy);
    }

    /**
     * 顺序执行批量记事本停用动作，避免一次性打爆请求队列。
     */
    async function runBatchNotebookMutation(itemIds, mutateFn) {
        const ids = normalizeIdList(itemIds, 240);
        const result = {
            total: ids.length,
            successCount: 0,
            failCount: 0,
            successIds: [],
            failed: []
        };
        if (typeof mutateFn !== 'function' || ids.length <= 0) {
            return result;
        }

        for (let i = 0; i < ids.length; i += 1) {
            const id = ids[i];
            try {
                await mutateFn(id);
                result.successIds.push(id);
            } catch (error) {
                result.failed.push({
                    id: id,
                    message: toTrimmedString(error && error.message) || 'unknown_error'
                });
            }
        }

        result.successCount = result.successIds.length;
        result.failCount = result.failed.length;
        return result;
    }

    /**
     * 管理台直接更新偏好档案。
     */
    async function adminUpdateProfile(profileId, payload) {
        const supabase = getSupabaseClient();
        const safeUserId = getUserId();
        const safeProfileId = toTrimmedString(profileId);
        const source = payload && typeof payload === 'object' ? payload : {};
        if (!supabase || !safeUserId || !safeProfileId) {
            return null;
        }

        const requestedCategory = toTrimmedString(source.category).toLowerCase();
        const requestedConfidence = toTrimmedString(source.confidence).toLowerCase();
        const updatePayload = {
            content: toTrimmedString(source.content),
            category: ADMIN_PROFILE_CATEGORIES.has(requestedCategory) ? requestedCategory : 'other',
            confidence: ADMIN_PROFILE_CONFIDENCE.has(requestedConfidence) ? requestedConfidence : 'stated',
            updated_at: new Date().toISOString()
        };
        const result = await supabase
            .from('hippocampus_user_profile')
            .update(updatePayload)
            .eq('id', safeProfileId)
            .eq('user_id', safeUserId)
            .select('*')
            .limit(1);

        if (result && result.error) {
            throw result.error;
        }
        return Array.isArray(result && result.data) ? (result.data[0] || null) : null;
    }

    /**
     * 管理台新增必须牢记事项。
     */
    async function adminAddMustRemember(userIdOrCharId, charIdOrPayload, maybePayload) {
        const args = resolveNotebookMutationArgs(userIdOrCharId, charIdOrPayload, maybePayload);
        const supabase = getSupabaseClient();
        const notebookModule = getNotebookModule();
        if (!supabase || !args.userId || !args.charId || !notebookModule || typeof notebookModule.addMustRemember !== 'function') {
            return null;
        }
        return notebookModule.addMustRemember(supabase, args.userId, args.charId, args.payload);
    }

    /**
     * 管理台更新必须牢记事项。
     */
    async function adminUpdateMustRemember(itemId, payload) {
        const supabase = getSupabaseClient();
        const notebookModule = getNotebookModule();
        if (!supabase || !notebookModule || typeof notebookModule.updateMustRemember !== 'function') {
            return null;
        }
        return notebookModule.updateMustRemember(supabase, itemId, payload);
    }

    /**
     * 管理台停用必须牢记事项。
     */
    async function adminDeactivateMustRemember(itemId) {
        const supabase = getSupabaseClient();
        const notebookModule = getNotebookModule();
        if (!supabase || !notebookModule || typeof notebookModule.deactivateMustRemember !== 'function') {
            return null;
        }
        return notebookModule.deactivateMustRemember(supabase, itemId);
    }

    /**
     * 管理台批量停用必须牢记事项。
     */
    async function adminBatchDeactivateMustRemember(itemIds) {
        return runBatchNotebookMutation(itemIds, adminDeactivateMustRemember);
    }

    /**
     * 管理台新增红线。
     */
    async function adminAddRedline(userIdOrCharId, charIdOrPayload, maybePayload) {
        const args = resolveNotebookMutationArgs(userIdOrCharId, charIdOrPayload, maybePayload);
        const supabase = getSupabaseClient();
        const notebookModule = getNotebookModule();
        if (!supabase || !args.userId || !args.charId || !notebookModule || typeof notebookModule.addRedline !== 'function') {
            return null;
        }
        return notebookModule.addRedline(supabase, args.userId, args.charId, args.payload);
    }

    /**
     * 管理台确认红线。
     */
    async function adminConfirmRedline(redlineId) {
        const supabase = getSupabaseClient();
        const notebookModule = getNotebookModule();
        if (!supabase || !notebookModule || typeof notebookModule.confirmRedline !== 'function') {
            return null;
        }
        return notebookModule.confirmRedline(supabase, redlineId);
    }

    /**
     * 管理台停用红线。
     */
    async function adminDeactivateRedline(redlineId) {
        const supabase = getSupabaseClient();
        const notebookModule = getNotebookModule();
        if (!supabase || !notebookModule || typeof notebookModule.deactivateRedline !== 'function') {
            return null;
        }
        return notebookModule.deactivateRedline(supabase, redlineId);
    }

    /**
     * 管理台批量停用底线。
     */
    async function adminBatchDeactivateRedline(itemIds) {
        return runBatchNotebookMutation(itemIds, adminDeactivateRedline);
    }

    /**
     * 管理台批量停用偏好档案。
     */
    async function adminBatchDeactivateProfile(itemIds, supersededBy) {
        return runBatchNotebookMutation(itemIds, function mutateProfile(id) {
            return adminDeactivateProfile(id, supersededBy);
        });
    }

    /**
     * 管理台直接更新红线内容。
     */
    async function adminUpdateRedline(redlineId, payload) {
        const supabase = getSupabaseClient();
        const safeUserId = getUserId();
        const safeRedlineId = toTrimmedString(redlineId);
        const source = payload && typeof payload === 'object' ? payload : {};
        if (!supabase || !safeUserId || !safeRedlineId) {
            return null;
        }

        const updatePayload = {
            content: toTrimmedString(source.content),
            severity: toTrimmedString(source.severity) || 'important',
            origin: toTrimmedString(source.origin) || 'user_declared',
            confirmed: source.confirmed === false ? false : true,
            updated_at: new Date().toISOString()
        };
        const originContext = toTrimmedString(source.originContext || source.origin_context);
        if (originContext) {
            updatePayload.origin_context = originContext;
        }

        const result = await supabase
            .from('hippocampus_user_redlines')
            .update(updatePayload)
            .eq('id', safeRedlineId)
            .eq('user_id', safeUserId)
            .select('*')
            .limit(1);

        if (result && result.error) {
            throw result.error;
        }
        return Array.isArray(result && result.data) ? (result.data[0] || null) : null;
    }

    function normalizeDehydrateFailureItem(item) {
        if (!item || typeof item !== 'object') return null;
        const id = toTrimmedString(item.id);
        const charId = toTrimmedString(item.charId || item.char_id);
        const errorMessage = toTrimmedString(item.errorMessage || item.error || item.message);
        if (!id || !charId || !errorMessage) return null;

        const httpStatus = Number(item.httpStatus || item.http_status);
        const retryCount = Math.max(0, Math.floor(Number(item.retryCount || item.retry_count) || 0));
        const createdAt = toTrimmedString(item.createdAt || item.created_at) || new Date().toISOString();
        const createdAtMs = new Date(createdAt).getTime();

        return {
            id: id,
            charId: charId,
            charLabel: toTrimmedString(item.charLabel || item.char_label) || charId,
            createdAt: createdAt,
            createdAtMs: Number.isFinite(createdAtMs) ? createdAtMs : Date.now(),
            errorMessage: errorMessage,
            errorCode: toTrimmedString(item.errorCode || item.error_code),
            errorDetail: toTrimmedString(item.errorDetail || item.error_detail),
            httpStatus: Number.isFinite(httpStatus) ? Math.floor(httpStatus) : 0,
            retryCount: retryCount,
            lastRetriedAt: toTrimmedString(item.lastRetriedAt || item.last_retried_at)
        };
    }

    /**
     * 将管理台筛选条件规范化，兼容空值与字符串输入。
     */
    function normalizeFilters(filters) {
        const source = filters && typeof filters === 'object' ? filters : {};

        return {
            charId: toNullableText(source.charId),
            roomId: toNullableText(source.roomId),
            contextScope: toNullableText(source.contextScope),
            resolved: toNullableBoolean(source.resolved),
            query: toNullableText(source.query),
            sort: normalizeSort(source.sort),
            limit: Math.max(1, Math.floor(toFiniteNumber(source.limit, DEFAULT_PAGE_SIZE))),
            offset: Math.max(0, Math.floor(toFiniteNumber(source.offset, 0))),
            cursor: normalizeListCursor(source.cursor)
        };
    }

    /**
     * 将管理台通用筛选应用到 Supabase QueryBuilder。
     */
    function applyAdminListBaseFilters(queryBuilder, normalizedFilters) {
        let builder = queryBuilder;
        if (!builder) return builder;
        const filters = normalizedFilters && typeof normalizedFilters === 'object' ? normalizedFilters : {};

        if (filters.charId) {
            builder = builder.eq('char_id', filters.charId);
        }
        if (filters.roomId) {
            builder = builder.eq('room_id', filters.roomId);
        }
        if (filters.contextScope) {
            builder = builder.eq('context_scope', filters.contextScope);
        }
        if (filters.resolved !== null && filters.resolved !== undefined) {
            builder = builder.eq('resolved', filters.resolved);
        }
        if (filters.query) {
            builder = builder.ilike('content', `%${filters.query}%`);
        }

        return builder;
    }

    /**
     * 按排序与游标约束构造 keyset 查询。
     */
    function applyAdminListSortAndCursor(queryBuilder, normalizedFilters) {
        let builder = queryBuilder;
        if (!builder) return builder;

        const sort = normalizeSort(normalizedFilters && normalizedFilters.sort);
        const cursor = normalizedFilters && normalizedFilters.cursor ? normalizedFilters.cursor : null;

        if (sort === 'last_active_at_desc') {
            builder = builder
                .order('last_active_at', { ascending: false, nullsFirst: false })
                .order('id', { ascending: false });
            if (cursor && cursor.id) {
                if (cursor.sortValue) {
                    builder = builder.or(
                        `last_active_at.lt.${cursor.sortValue},and(last_active_at.eq.${cursor.sortValue},id.lt.${cursor.id}),last_active_at.is.null`
                    );
                } else {
                    builder = builder
                        .is('last_active_at', null)
                        .lt('id', cursor.id);
                }
            }
            return builder;
        }

        if (sort === 'score_desc') {
            builder = builder
                .order('importance', { ascending: false, nullsFirst: false })
                .order('id', { ascending: false });
            if (cursor && cursor.id && Number.isFinite(Number(cursor.importance))) {
                const importance = Number(cursor.importance);
                builder = builder.or(
                    `importance.lt.${importance},and(importance.eq.${importance},id.lt.${cursor.id})`
                );
            } else if (cursor && cursor.id) {
                builder = builder.lt('id', cursor.id);
            }
            return builder;
        }

        builder = builder
            .order('created_at', { ascending: false, nullsFirst: false })
            .order('id', { ascending: false });
        if (cursor && cursor.id && cursor.sortValue) {
            builder = builder.or(
                `created_at.lt.${cursor.sortValue},and(created_at.eq.${cursor.sortValue},id.lt.${cursor.id})`
            );
        } else if (cursor && cursor.id) {
            builder = builder.lt('id', cursor.id);
        }
        return builder;
    }

    /**
     * 根据列表最后一条记录构建下一页游标。
     */
    function buildAdminListCursorFromItem(item, sort) {
        if (!item || typeof item !== 'object') return null;
        const id = toTrimmedString(item.id);
        if (!id) return null;

        const safeSort = normalizeSort(sort);
        if (safeSort === 'last_active_at_desc') {
            return {
                id: id,
                sort: safeSort,
                sortValue: toTrimmedString(item.last_active_at || ''),
                importance: null
            };
        }
        if (safeSort === 'score_desc') {
            return {
                id: id,
                sort: safeSort,
                sortValue: '',
                importance: Number(item.importance || 0)
            };
        }
        return {
            id: id,
            sort: 'created_at_desc',
            sortValue: toTrimmedString(item.created_at || ''),
            importance: null
        };
    }

    /**
     * 规范化管理台排序值。
     */
    function normalizeSort(sort) {
        const normalized = toTrimmedString(sort) || 'created_at_desc';
        if (normalized === 'last_active_at_desc' || normalized === 'score_desc') {
            return normalized;
        }
        return 'created_at_desc';
    }

    /**
     * 将 metadata 字段标准化为普通对象。
     */
    function normalizeMetadata(metadata) {
        if (!metadata) return {};
        if (typeof metadata === 'string') {
            try {
                const parsed = JSON.parse(metadata);
                return parsed && typeof parsed === 'object' ? parsed : {};
            } catch (_) {
                return {};
            }
        }
        return metadata && typeof metadata === 'object' ? metadata : {};
    }

    /**
     * 规范化记忆层级，优先读取顶层字段，缺失时回退 metadata。
     */
    function normalizeMemoryLayer(layerValue, metadata) {
        const metadataSource = metadata && typeof metadata === 'object' ? metadata : {};
        const raw = toTrimmedString(
            layerValue
            || metadataSource.memory_layer
            || metadataSource.memoryLayer
            || metadataSource.layer
        ).toLowerCase();
        if (raw === 'core' || raw === 'cortex' || raw === 'shadow' || raw === 'wish' || raw === 'buffer') {
            return raw;
        }
        return 'buffer';
    }

    /**
     * 规范化事件状态字段，只允许 open / closed。
     */
    function normalizeEventStatus(value) {
        const text = toTrimmedString(value).toLowerCase();
        if (text === 'open' || text === 'closed') return text;
        return null;
    }

    /**
     * 规范化事件深度字段，只允许 low / medium / high。
     */
    function normalizeEventDepth(value) {
        const text = toTrimmedString(value).toLowerCase();
        if (text === 'low' || text === 'medium' || text === 'high') return text;
        return null;
    }

    /**
     * 规范化事件片段数，非数字或负数时返回 null。
     */
    function normalizeEventFragmentCount(value) {
        if (value === undefined) return undefined;
        if (value === null) return null;
        const count = Math.floor(toFiniteNumber(value, NaN));
        if (!Number.isFinite(count)) return null;
        return Math.max(0, count);
    }

    /**
     * 规整 ID 数组，兼容数组 / 逗号分隔字符串 / 单值。
     */
    function normalizeIdArray(value, maxCount) {
        const limit = Math.max(1, Math.floor(toFiniteNumber(maxCount, 24)));
        const rawList = Array.isArray(value)
            ? value
            : (typeof value === 'string'
                ? value.split(/[,\n，、;；\s]+/)
                : (value === undefined || value === null ? [] : [value]));
        const result = [];
        const seen = new Set();
        rawList.forEach(function appendId(item) {
            const id = toTrimmedString(item);
            if (!id || seen.has(id)) return;
            seen.add(id);
            if (result.length < limit) {
                result.push(id);
            }
        });
        return result;
    }

    /**
     * 将管理台列表 RPC 返回的一行标准化为前端安全对象。
     */
    function normalizeAdminMemoryRow(row) {
        if (!row || typeof row !== 'object') return null;
        const metadata = normalizeMetadata(row.metadata);
        const memoryLayer = normalizeMemoryLayer(row.memory_layer || row.layer, metadata);
        const eventId = toTrimmedString(
            row.event_id
            || row.eventId
            || metadata.event_id
            || metadata.eventId
            || metadata.memory_event_id
            || metadata.cluster_id
            || metadata.memory_cluster_id
        );
        const eventTitle = toTrimmedString(
            row.event_title
            || row.eventTitle
            || metadata.event_title
            || metadata.eventTitle
        );
        const eventSummary = toTrimmedString(
            row.event_summary
            || row.eventSummary
            || metadata.event_summary
            || metadata.eventSummary
        );
        const eventStatus = toTrimmedString(
            row.event_status
            || row.eventStatus
            || metadata.event_status
            || metadata.eventStatus
        ).toLowerCase();
        const eventDepth = toTrimmedString(
            row.event_depth
            || row.eventDepth
            || metadata.event_depth
            || metadata.cluster_depth_snapshot
        ).toLowerCase();
        const eventDate = toTrimmedString(
            row.event_date
            || row.eventDate
            || metadata.event_date
            || metadata.occurred_at
        );
        const eventFragmentCount = Math.max(
            0,
            Math.floor(
                toFiniteNumber(
                    row.event_fragment_count !== undefined && row.event_fragment_count !== null
                        ? row.event_fragment_count
                        : metadata.event_fragment_count !== undefined && metadata.event_fragment_count !== null
                            ? metadata.event_fragment_count
                            : metadata.fragment_count,
                    0
                )
            )
        );
        const eventIsUnresolved = toBoolean(
            row.event_is_unresolved !== undefined && row.event_is_unresolved !== null
                ? row.event_is_unresolved
                : row.eventIsUnresolved !== undefined && row.eventIsUnresolved !== null
                    ? row.eventIsUnresolved
                    : metadata.event_is_unresolved !== undefined && metadata.event_is_unresolved !== null
                        ? metadata.event_is_unresolved
                        : metadata.is_unresolved !== undefined && metadata.is_unresolved !== null
                            ? metadata.is_unresolved
                            : metadata.unresolved
        );
        const eventFlashbulbMemoryIds = normalizeIdArray(
            row.event_flashbulb_memory_ids !== undefined
                ? row.event_flashbulb_memory_ids
                : row.eventFlashbulbMemoryIds !== undefined
                    ? row.eventFlashbulbMemoryIds
                    : metadata.event_flashbulb_memory_ids !== undefined
                        ? metadata.event_flashbulb_memory_ids
                        : metadata.eventFlashbulbMemoryIds,
            24
        );
        const eventIsFlashbulb = toBoolean(
            row.event_is_flashbulb !== undefined && row.event_is_flashbulb !== null
                ? row.event_is_flashbulb
                : row.eventIsFlashbulb !== undefined && row.eventIsFlashbulb !== null
                    ? row.eventIsFlashbulb
                    : metadata.event_is_flashbulb !== undefined && metadata.event_is_flashbulb !== null
                        ? metadata.event_is_flashbulb
                        : metadata.eventIsFlashbulb !== undefined && metadata.eventIsFlashbulb !== null
                            ? metadata.eventIsFlashbulb
                            : metadata.is_flashbulb
        ) || eventFlashbulbMemoryIds.length > 0;
        const isFlashbulb = toBoolean(
            row.is_flashbulb !== undefined && row.is_flashbulb !== null
                ? row.is_flashbulb
                : row.isFlashbulb !== undefined && row.isFlashbulb !== null
                    ? row.isFlashbulb
                    : metadata.is_flashbulb
        );

        return {
            id: row.id || null,
            user_id: toTrimmedString(row.user_id),
            char_id: toTrimmedString(row.char_id),
            room_id: row.room_id === null || row.room_id === undefined ? null : toTrimmedString(row.room_id),
            context_scope: toTrimmedString(row.context_scope),
            content: toTrimmedString(row.content),
            valence: toFiniteNumber(row.valence, 0),
            arousal: toFiniteNumber(row.arousal, 0),
            importance: toFiniteNumber(row.importance, 0),
            activation_count: Math.max(0, Math.round(toFiniteNumber(row.activation_count, 0))),
            resolved: !!row.resolved,
            resolved_at: row.resolved_at || null,
            created_at: row.created_at || null,
            last_active_at: row.last_active_at || null,
            last_injected_at: row.last_injected_at || null,
            dedupe_key: row.dedupe_key || null,
            source_type: row.source_type || null,
            source_ref: row.source_ref || null,
            memory_layer: memoryLayer,
            layer: memoryLayer,
            is_flashbulb: isFlashbulb,
            event_id: eventId || null,
            event_title: eventTitle || null,
            event_summary: eventSummary || null,
            event_status: eventStatus || null,
            event_depth: eventDepth || null,
            event_date: eventDate || null,
            event_fragment_count: eventFragmentCount,
            event_is_unresolved: eventIsUnresolved,
            event_is_flashbulb: eventIsFlashbulb,
            event_flashbulb_memory_ids: eventFlashbulbMemoryIds,
            metadata: metadata,
            updated_at: row.updated_at || null,
            computed_score: toFiniteNumber(row.computed_score, 0),
            surface_reason: toTrimmedString(row.surface_reason),
            has_embedding: row.has_embedding === null || row.has_embedding === undefined
                ? null
                : !!row.has_embedding
        };
    }

    /**
     * 将导出记录标准化为可直接写入 JSON 的原始结构。
     */
    function normalizeExportRecord(row) {
        if (!row || typeof row !== 'object') return null;
        const metadata = normalizeMetadata(row.metadata);
        const memoryLayer = normalizeMemoryLayer(row.memory_layer || row.layer, metadata);
        const eventId = toTrimmedString(
            row.event_id
            || row.eventId
            || metadata.event_id
            || metadata.eventId
            || metadata.memory_event_id
            || metadata.cluster_id
            || metadata.memory_cluster_id
        );
        const eventTitle = toTrimmedString(
            row.event_title
            || row.eventTitle
            || metadata.event_title
            || metadata.eventTitle
        );
        const eventSummary = toTrimmedString(
            row.event_summary
            || row.eventSummary
            || metadata.event_summary
            || metadata.eventSummary
        );
        const eventStatus = toTrimmedString(
            row.event_status
            || row.eventStatus
            || metadata.event_status
            || metadata.eventStatus
        ).toLowerCase();
        const eventDepth = toTrimmedString(
            row.event_depth
            || row.eventDepth
            || metadata.event_depth
            || metadata.cluster_depth_snapshot
        ).toLowerCase();
        const eventDate = toTrimmedString(
            row.event_date
            || row.eventDate
            || metadata.event_date
            || metadata.occurred_at
        );
        const eventFragmentCount = Math.max(
            0,
            Math.floor(
                toFiniteNumber(
                    row.event_fragment_count !== undefined && row.event_fragment_count !== null
                        ? row.event_fragment_count
                        : metadata.event_fragment_count !== undefined && metadata.event_fragment_count !== null
                            ? metadata.event_fragment_count
                            : metadata.fragment_count,
                    0
                )
            )
        );
        const eventIsUnresolved = toBoolean(
            row.event_is_unresolved !== undefined && row.event_is_unresolved !== null
                ? row.event_is_unresolved
                : row.eventIsUnresolved !== undefined && row.eventIsUnresolved !== null
                    ? row.eventIsUnresolved
                    : metadata.event_is_unresolved !== undefined && metadata.event_is_unresolved !== null
                        ? metadata.event_is_unresolved
                        : metadata.is_unresolved !== undefined && metadata.is_unresolved !== null
                            ? metadata.is_unresolved
                            : metadata.unresolved
        );
        const eventFlashbulbMemoryIds = normalizeIdArray(
            row.event_flashbulb_memory_ids !== undefined
                ? row.event_flashbulb_memory_ids
                : row.eventFlashbulbMemoryIds !== undefined
                    ? row.eventFlashbulbMemoryIds
                    : metadata.event_flashbulb_memory_ids !== undefined
                        ? metadata.event_flashbulb_memory_ids
                        : metadata.eventFlashbulbMemoryIds,
            24
        );
        const eventIsFlashbulb = toBoolean(
            row.event_is_flashbulb !== undefined && row.event_is_flashbulb !== null
                ? row.event_is_flashbulb
                : row.eventIsFlashbulb !== undefined && row.eventIsFlashbulb !== null
                    ? row.eventIsFlashbulb
                    : metadata.event_is_flashbulb !== undefined && metadata.event_is_flashbulb !== null
                        ? metadata.event_is_flashbulb
                        : metadata.eventIsFlashbulb !== undefined && metadata.eventIsFlashbulb !== null
                            ? metadata.eventIsFlashbulb
                            : metadata.is_flashbulb
        ) || eventFlashbulbMemoryIds.length > 0;
        const isFlashbulb = toBoolean(
            row.is_flashbulb !== undefined && row.is_flashbulb !== null
                ? row.is_flashbulb
                : row.isFlashbulb !== undefined && row.isFlashbulb !== null
                    ? row.isFlashbulb
                    : metadata.is_flashbulb
        );

        return {
            id: row.id || null,
            user_id: toTrimmedString(row.user_id),
            char_id: toTrimmedString(row.char_id),
            room_id: row.room_id === null || row.room_id === undefined ? null : toTrimmedString(row.room_id),
            context_scope: toTrimmedString(row.context_scope),
            content: toTrimmedString(row.content),
            valence: toFiniteNumber(row.valence, 0),
            arousal: toFiniteNumber(row.arousal, 0),
            importance: toFiniteNumber(row.importance, 0),
            activation_count: Math.max(0, Math.round(toFiniteNumber(row.activation_count, 0))),
            resolved: !!row.resolved,
            resolved_at: row.resolved_at || null,
            created_at: row.created_at || null,
            last_active_at: row.last_active_at || null,
            last_injected_at: row.last_injected_at || null,
            dedupe_key: row.dedupe_key || null,
            source_type: row.source_type || null,
            source_ref: row.source_ref || null,
            memory_layer: memoryLayer,
            layer: memoryLayer,
            is_flashbulb: isFlashbulb,
            event_id: eventId || null,
            event_title: eventTitle || null,
            event_summary: eventSummary || null,
            event_status: eventStatus || null,
            event_depth: eventDepth || null,
            event_date: eventDate || null,
            event_fragment_count: eventFragmentCount,
            event_is_unresolved: eventIsUnresolved,
            event_is_flashbulb: eventIsFlashbulb,
            event_flashbulb_memory_ids: eventFlashbulbMemoryIds,
            metadata: metadata,
            updated_at: row.updated_at || null
        };
    }

    /**
     * 统一计算记录的排序时间戳，优先取最近活跃时间，其次创建时间。
     */
    function getRecordTimestampMs(row) {
        const source = row && typeof row === 'object' ? row : {};
        const candidate = source.last_active_at
            || source.lastActiveAt
            || source.created_at
            || source.createdAt
            || source.updated_at
            || source.updatedAt
            || '';
        const timestamp = Date.parse(toTrimmedString(candidate));
        return Number.isFinite(timestamp) ? timestamp : 0;
    }

    /**
     * 将真实事件表记录标准化为管理台可直接消费的对象。
     */
    function normalizeAdminEventRecordRow(row) {
        if (!row || typeof row !== 'object') return null;

        const metadata = normalizeMetadata(row.metadata);
        const memoryIds = normalizeIdArray(
            row.memory_ids !== undefined
                ? row.memory_ids
                : row.memoryIds,
            96
        );
        const detailMemoryIds = normalizeIdArray(
            row.detail_memory_ids !== undefined
                ? row.detail_memory_ids
                : row.detailMemoryIds,
            24
        );
        const flashbulbMemoryIds = normalizeIdArray(
            row.event_flashbulb_memory_ids !== undefined
                ? row.event_flashbulb_memory_ids
                : row.eventFlashbulbMemoryIds !== undefined
                    ? row.eventFlashbulbMemoryIds
                    : metadata.event_flashbulb_memory_ids !== undefined
                        ? metadata.event_flashbulb_memory_ids
                        : metadata.eventFlashbulbMemoryIds,
            24
        );
        const eventIsFlashbulb = toBoolean(
            row.event_is_flashbulb !== undefined && row.event_is_flashbulb !== null
                ? row.event_is_flashbulb
                : row.eventIsFlashbulb !== undefined && row.eventIsFlashbulb !== null
                    ? row.eventIsFlashbulb
                    : metadata.event_is_flashbulb !== undefined && metadata.event_is_flashbulb !== null
                        ? metadata.event_is_flashbulb
                        : metadata.eventIsFlashbulb !== undefined && metadata.eventIsFlashbulb !== null
                            ? metadata.eventIsFlashbulb
                            : metadata.is_flashbulb
        ) || flashbulbMemoryIds.length > 0;

        return {
            id: toTrimmedString(row.id),
            user_id: toTrimmedString(row.user_id),
            char_id: toTrimmedString(row.char_id),
            room_id: row.room_id === null || row.room_id === undefined ? null : toTrimmedString(row.room_id),
            context_scope: toTrimmedString(row.context_scope) || 'private',
            title: toTrimmedString(row.title),
            summary: toTrimmedString(row.summary),
            status: normalizeEventStatus(row.status) || 'closed',
            depth: normalizeEventDepth(row.depth) || 'medium',
            is_unresolved: toBoolean(row.is_unresolved),
            continuation_key: toNullableText(row.continuation_key),
            event_date: toNullableText(row.event_date),
            fragment_count: Math.max(0, Math.floor(toFiniteNumber(row.fragment_count, memoryIds.length))),
            salience_score: toFiniteNumber(row.salience_score, 0),
            depth_score: toFiniteNumber(row.depth_score, 0),
            anchor_memory_id: toNullableText(row.anchor_memory_id),
            memory_ids: memoryIds,
            detail_memory_ids: detailMemoryIds,
            start_at: row.start_at || null,
            end_at: row.end_at || null,
            last_related_at: row.last_related_at || null,
            manual_edited: !!row.manual_edited,
            manual_note: toNullableText(row.manual_note),
            metadata: metadata,
            created_at: row.created_at || null,
            updated_at: row.updated_at || null,
            event_is_flashbulb: eventIsFlashbulb,
            event_flashbulb_memory_ids: flashbulbMemoryIds
        };
    }

    /**
     * 读取指定真实事件表记录，供管理台手动编排后即时同步使用。
     */
    async function getEventRecord(eventId, options) {
        const safeEventId = toTrimmedString(eventId);
        const source = options && typeof options === 'object' ? options : {};
        const safeCharId = toTrimmedString(source.charId || source.char_id);

        try {
            const supabase = getSupabaseClient();
            const userId = getUserId();
            if (!supabase || !userId || !safeEventId) {
                return { ok: false, error: 'not_ready', event: null };
            }

            let query = supabase
                .from('hippocampus_memory_events')
                .select('id,user_id,char_id,room_id,context_scope,title,summary,status,depth,is_unresolved,continuation_key,event_date,fragment_count,salience_score,depth_score,anchor_memory_id,memory_ids,detail_memory_ids,start_at,end_at,last_related_at,manual_edited,manual_note,metadata,created_at,updated_at')
                .eq('user_id', userId)
                .eq('id', safeEventId);
            if (safeCharId) {
                query = query.eq('char_id', safeCharId);
            }

            const response = await query.limit(1).maybeSingle();
            if (response.error) throw response.error;

            return {
                ok: true,
                event: normalizeAdminEventRecordRow(response.data)
            };
        } catch (error) {
            console.warn('[海马体管理台] 读取真实事件记录失败，已静默降级。', error);
            return {
                ok: false,
                error: toTrimmedString(error && error.message) || 'get_event_record_failed',
                event: null
            };
        }
    }

    /**
     * 读取指定记忆条目，供管理台手动操作时直接定位目标。
     */
    async function getMemoryRecord(memoryId, options) {
        const safeMemoryId = toTrimmedString(memoryId);
        const source = options && typeof options === 'object' ? options : {};
        const safeCharId = toTrimmedString(source.charId || source.char_id);

        try {
            const supabase = getSupabaseClient();
            const userId = getUserId();
            if (!supabase || !userId || !safeMemoryId) {
                return { ok: false, error: 'not_ready', memory: null };
            }

            let query = supabase
                .from('hippocampus_memories')
                .select('*')
                .eq('user_id', userId)
                .eq('id', safeMemoryId);
            if (safeCharId) {
                query = query.eq('char_id', safeCharId);
            }

            const response = await query.limit(1).maybeSingle();
            if (response.error) throw response.error;

            return {
                ok: true,
                memory: normalizeAdminMemoryRow(response.data)
            };
        } catch (error) {
            console.warn('[海马体管理台] 读取指定记忆失败，已静默降级。', error);
            return {
                ok: false,
                error: toTrimmedString(error && error.message) || 'get_memory_record_failed',
                memory: null
            };
        }
    }

    /**
     * 按事件 ID 批量读取真实事件记录，供管理台列表页补全事件级 metadata 使用。
     */
    async function listEventRecordsByIds(filters) {
        const source = filters && typeof filters === 'object' ? filters : {};
        const safeCharId = toTrimmedString(source.charId || source.char_id);
        const eventIds = normalizeIdArray(source.eventIds || source.event_ids, 240);

        if (eventIds.length <= 0) {
            return {
                ok: true,
                items: []
            };
        }

        try {
            const supabase = getSupabaseClient();
            const userId = getUserId();
            if (!supabase || !userId) {
                return { ok: false, error: 'not_ready', items: [] };
            }

            let query = supabase
                .from('hippocampus_memory_events')
                .select('id,user_id,char_id,room_id,context_scope,title,summary,status,depth,is_unresolved,continuation_key,event_date,fragment_count,salience_score,depth_score,anchor_memory_id,memory_ids,detail_memory_ids,start_at,end_at,last_related_at,manual_edited,manual_note,metadata,created_at,updated_at')
                .eq('user_id', userId)
                .in('id', eventIds);
            if (safeCharId) {
                query = query.eq('char_id', safeCharId);
            }

            const response = await query.limit(Math.max(1, eventIds.length));
            if (response.error) throw response.error;

            return {
                ok: true,
                items: (Array.isArray(response.data) ? response.data : [])
                    .map(normalizeAdminEventRecordRow)
                    .filter(Boolean)
            };
        } catch (error) {
            console.warn('[海马体管理台] 批量读取真实事件记录失败，已静默降级。', error);
            return {
                ok: false,
                error: toTrimmedString(error && error.message) || 'list_event_records_failed',
                items: []
            };
        }
    }

    /**
     * 将真实事件记录与成员碎片拼成海马体客户端可识别的 event_cluster 输入。
     */
    function isAdminEventRecordRetired(record) {
        const safeRecord = record && typeof record === 'object' ? record : {};
        const metadata = normalizeMetadata(safeRecord.metadata);
        if (toBoolean(
            safeRecord.digest_retired !== undefined
                ? safeRecord.digest_retired
                : (metadata.digest_retired !== undefined ? metadata.digest_retired : metadata.digestRetired)
        )) {
            return true;
        }
        return !!toTrimmedString(
            safeRecord.digest_retired_at
            || metadata.digest_retired_at
            || metadata.digestRetiredAt
        );
    }

    function normalizeEventRecordListFilters(filters) {
        const source = filters && typeof filters === 'object' ? filters : {};
        const retiredText = toTrimmedString(source.retired || source.retiredMode || source.retired_mode).toLowerCase();
        const statusText = toTrimmedString(source.status).toLowerCase();
        const sortText = toTrimmedString(source.sort).toLowerCase();
        return {
            charId: toNullableText(source.charId || source.char_id),
            query: toNullableText(source.query),
            retired: retiredText === 'only' || retiredText === 'exclude' ? retiredText : 'all',
            status: statusText === 'open' || statusText === 'closed' ? statusText : '',
            sort: sortText === 'created_at_desc'
                || sortText === 'updated_at_desc'
                || sortText === 'fragment_count_desc'
                || sortText === 'version_churn_desc'
                ? sortText
                : 'last_related_at_desc',
            limit: Math.max(1, Math.min(160, Math.floor(toFiniteNumber(source.limit, DEFAULT_PAGE_SIZE)))),
            offset: Math.max(0, Math.floor(toFiniteNumber(source.offset, 0)))
        };
    }

    async function listEventRecords(filters) {
        const normalizedFilters = normalizeEventRecordListFilters(filters);
        const fetchWindow = Math.max(240, Math.min(800, normalizedFilters.offset + (normalizedFilters.limit * 6)));

        try {
            const supabase = getSupabaseClient();
            const userId = getUserId();
            if (!supabase || !userId) {
                return {
                    ok: false,
                    error: 'not_ready',
                    items: [],
                    totalCount: 0,
                    hasMore: false
                };
            }

            let query = supabase
                .from('hippocampus_memory_events')
                .select('id,user_id,char_id,room_id,context_scope,title,summary,status,depth,is_unresolved,continuation_key,event_date,fragment_count,salience_score,depth_score,anchor_memory_id,memory_ids,detail_memory_ids,start_at,end_at,last_related_at,manual_edited,manual_note,metadata,created_at,updated_at')
                .eq('user_id', userId)
                .order('last_related_at', { ascending: false, nullsFirst: false })
                .order('updated_at', { ascending: false, nullsFirst: false })
                .order('created_at', { ascending: false, nullsFirst: false })
                .limit(fetchWindow);
            if (normalizedFilters.charId) {
                query = query.eq('char_id', normalizedFilters.charId);
            }

            const response = await query;
            if (response.error) throw response.error;

            let items = (Array.isArray(response.data) ? response.data : [])
                .map(normalizeAdminEventRecordRow)
                .filter(Boolean);

            if (normalizedFilters.query) {
                const needle = normalizedFilters.query.toLowerCase();
                items = items.filter(function keepByQuery(item) {
                    const title = toTrimmedString(item && item.title).toLowerCase();
                    const summary = toTrimmedString(item && item.summary).toLowerCase();
                    return title.includes(needle) || summary.includes(needle);
                });
            }

            if (normalizedFilters.status) {
                items = items.filter(function keepByStatus(item) {
                    return toTrimmedString(item && item.status).toLowerCase() === normalizedFilters.status;
                });
            }

            if (normalizedFilters.retired === 'only') {
                items = items.filter(isAdminEventRecordRetired);
            } else if (normalizedFilters.retired === 'exclude') {
                items = items.filter(function keepActive(item) {
                    return !isAdminEventRecordRetired(item);
                });
            }

            items.sort(function sortEventRows(left, right) {
                if (normalizedFilters.sort === 'fragment_count_desc') {
                    const rightCount = Math.max(0, Math.floor(toFiniteNumber(right && right.fragment_count, 0)));
                    const leftCount = Math.max(0, Math.floor(toFiniteNumber(left && left.fragment_count, 0)));
                    if (rightCount !== leftCount) return rightCount - leftCount;
                } else if (normalizedFilters.sort === 'version_churn_desc') {
                    const rightHistory = Array.isArray(normalizeMetadata(right && right.metadata).event_version_history)
                        ? normalizeMetadata(right && right.metadata).event_version_history.length
                        : 0;
                    const leftHistory = Array.isArray(normalizeMetadata(left && left.metadata).event_version_history)
                        ? normalizeMetadata(left && left.metadata).event_version_history.length
                        : 0;
                    if (rightHistory !== leftHistory) return rightHistory - leftHistory;
                } else if (normalizedFilters.sort === 'created_at_desc') {
                    const rightCreated = Date.parse(toTrimmedString(right && right.created_at)) || 0;
                    const leftCreated = Date.parse(toTrimmedString(left && left.created_at)) || 0;
                    if (rightCreated !== leftCreated) return rightCreated - leftCreated;
                } else if (normalizedFilters.sort === 'updated_at_desc') {
                    const rightUpdated = Date.parse(toTrimmedString(right && right.updated_at)) || 0;
                    const leftUpdated = Date.parse(toTrimmedString(left && left.updated_at)) || 0;
                    if (rightUpdated !== leftUpdated) return rightUpdated - leftUpdated;
                }
                return getRecordTimestampMs(right) - getRecordTimestampMs(left);
            });

            const totalCount = items.length;
            const pageItems = items.slice(normalizedFilters.offset, normalizedFilters.offset + normalizedFilters.limit);
            return {
                ok: true,
                items: pageItems,
                totalCount: totalCount,
                hasMore: normalizedFilters.offset + normalizedFilters.limit < totalCount
            };
        } catch (error) {
            console.warn('[海马体管理台] 读取事件记录列表失败，已静默降级。', error);
            return {
                ok: false,
                error: toTrimmedString(error && error.message) || 'list_event_records_failed',
                items: [],
                totalCount: 0,
                hasMore: false
            };
        }
    }

    function buildReconsolidationEventCluster(eventRecord, members) {
        const safeEvent = eventRecord && typeof eventRecord === 'object' ? eventRecord : null;
        const sourceMembers = Array.isArray(members) ? members.map(normalizeAdminMemoryRow).filter(Boolean) : [];
        if (!safeEvent || sourceMembers.length <= 0) return null;

        const eventMetadata = normalizeMetadata(safeEvent.metadata);
        const byId = new Map();
        sourceMembers.forEach(function remember(item) {
            const memoryId = toTrimmedString(item && item.id);
            if (memoryId) {
                byId.set(memoryId, item);
            }
        });

        const orderedMembers = sourceMembers.slice().sort(function sortMembers(left, right) {
            const rightImportance = toFiniteNumber(right && right.importance, 0);
            const leftImportance = toFiniteNumber(left && left.importance, 0);
            if (rightImportance !== leftImportance) return rightImportance - leftImportance;
            return getRecordTimestampMs(right) - getRecordTimestampMs(left);
        });
        const anchorId = toTrimmedString(safeEvent.anchor_memory_id);
        const anchor = (anchorId ? byId.get(anchorId) : null) || orderedMembers[0] || null;
        if (!anchor) return null;

        const detailMemoryIds = normalizeIdArray(
            safeEvent.detail_memory_ids !== undefined
                ? safeEvent.detail_memory_ids
                : eventMetadata.detail_memory_ids,
            24
        );
        const fallbackDetailIds = orderedMembers.map(function mapId(item) {
            return item && item.id;
        });
        const resolvedDetailIds = detailMemoryIds.length > 0
            ? detailMemoryIds
            : normalizeIdArray(fallbackDetailIds, 24);
        const detailMemories = resolvedDetailIds
            .map(function resolveMemory(id) {
                return byId.get(id) || null;
            })
            .filter(Boolean);
        const fallbackDetails = detailMemories.length > 0
            ? detailMemories
            : orderedMembers.slice(0, 8);
        const flashbulbIds = normalizeIdArray(
            safeEvent.event_flashbulb_memory_ids !== undefined
                ? safeEvent.event_flashbulb_memory_ids
                : eventMetadata.event_flashbulb_memory_ids,
            24
        );

        return {
            id: toTrimmedString(anchor.id),
            memory_id: toTrimmedString(anchor.id),
            user_id: toTrimmedString(anchor.user_id || safeEvent.user_id),
            char_id: toTrimmedString(anchor.char_id || safeEvent.char_id),
            room_id: anchor.room_id !== undefined ? anchor.room_id : (safeEvent.room_id !== undefined ? safeEvent.room_id : null),
            context_scope: toTrimmedString(anchor.context_scope || safeEvent.context_scope) || 'private',
            content: toTrimmedString(anchor.content || safeEvent.summary || safeEvent.title),
            valence: toFiniteNumber(anchor.valence, 0),
            arousal: toFiniteNumber(anchor.arousal, 0),
            importance: toFiniteNumber(anchor.importance, 0),
            activation_count: Math.max(0, Math.floor(toFiniteNumber(anchor.activation_count, 0))),
            resolved: !!anchor.resolved,
            source_type: 'event_cluster',
            is_event_cluster: true,
            event_id: toTrimmedString(safeEvent.id),
            event_title: toTrimmedString(safeEvent.title),
            event_summary: toTrimmedString(safeEvent.summary),
            event_status: toTrimmedString(safeEvent.status),
            event_depth: toTrimmedString(safeEvent.depth),
            event_date: toTrimmedString(safeEvent.event_date),
            event_fragment_count: Math.max(
                sourceMembers.length,
                Math.floor(toFiniteNumber(safeEvent.fragment_count, 0))
            ),
            event_is_unresolved: !!safeEvent.is_unresolved,
            event_is_flashbulb: !!safeEvent.event_is_flashbulb,
            event_salience_score: toFiniteNumber(safeEvent.salience_score, 0),
            event_depth_score: toFiniteNumber(safeEvent.depth_score, 0),
            continuation_key: toTrimmedString(safeEvent.continuation_key),
            event_anchor_memory_id: toTrimmedString(anchorId || anchor.id),
            event_detail_memory_ids: resolvedDetailIds,
            event_flashbulb_memory_ids: flashbulbIds,
            event_detail_memories: fallbackDetails,
            metadata: normalizeMetadata(anchor.metadata)
        };
    }

    /**
     * 管理台手动触发单条记忆/整起事件的重构。
     */
    async function runManualReconsolidation(payload) {
        const source = payload && typeof payload === 'object' ? payload : {};
        const safeMemoryId = toTrimmedString(source.memoryId || source.memory_id);
        const safeEventId = toTrimmedString(source.eventId || source.event_id);
        const explicitCharId = toTrimmedString(source.charId || source.char_id);
        const targetKind = safeEventId ? 'event' : 'memory';

        if (!safeMemoryId && !safeEventId) {
            return { ok: false, error: 'invalid_target', message: '缺少要重构的目标。' };
        }

        const supabase = getSupabaseClient();
        const userId = getUserId();
        if (!supabase || !userId) {
            return { ok: false, error: 'not_ready', message: '海马体运行环境尚未就绪。' };
        }

        const runtimeEntry = getRuntimeClient();
        const runtimeClient = runtimeEntry && runtimeEntry.client ? runtimeEntry.client : null;
        if (!runtimeClient
            || typeof runtimeClient.initHippocampus !== 'function'
            || typeof runtimeClient.activateWithReconsolidation !== 'function') {
            return { ok: false, error: 'runtime_unavailable', message: '当前环境不支持手动重构。' };
        }

        let targetMemory = null;
        let eventRecord = null;
        let memberItems = [];
        let resolvedCharId = explicitCharId;

        if (safeEventId) {
            const eventResult = await getEventRecord(safeEventId, { charId: resolvedCharId });
            if (!eventResult || eventResult.ok !== true || !eventResult.event) {
                return {
                    ok: false,
                    error: toTrimmedString(eventResult && eventResult.error) || 'event_not_found',
                    message: '没有找到这起事件。'
                };
            }
            eventRecord = eventResult.event;
            resolvedCharId = toTrimmedString(eventRecord.char_id || resolvedCharId);

            const membersResult = await listEventMembers({
                charId: resolvedCharId,
                eventId: safeEventId,
                limit: 240
            });
            memberItems = membersResult && Array.isArray(membersResult.items)
                ? membersResult.items
                : [];
            if (!membersResult || membersResult.ok !== true || memberItems.length <= 0) {
                return {
                    ok: false,
                    error: toTrimmedString(membersResult && membersResult.error) || 'event_members_not_found',
                    message: '没有加载到这起事件的成员碎片。'
                };
            }

            targetMemory = buildReconsolidationEventCluster(eventRecord, memberItems);
            if (!targetMemory) {
                return { ok: false, error: 'invalid_event_cluster', message: '事件聚合载荷构建失败。' };
            }
        } else {
            const memoryResult = await getMemoryRecord(safeMemoryId, { charId: resolvedCharId });
            if (!memoryResult || memoryResult.ok !== true || !memoryResult.memory) {
                return {
                    ok: false,
                    error: toTrimmedString(memoryResult && memoryResult.error) || 'memory_not_found',
                    message: '没有找到这条记忆。'
                };
            }
            targetMemory = memoryResult.memory;
            resolvedCharId = toTrimmedString(targetMemory.char_id || resolvedCharId);
        }

        const contactSummary = resolveContactSummary(resolvedCharId);
        const settingsSnapshot = getHippocampusSettingsSnapshot(contactSummary);
        const apiConfig = getDehydrateApiConfig();
        const apiUrl = toTrimmedString(apiConfig.apiUrl || apiConfig.url || apiConfig.baseUrl);
        const apiModel = toTrimmedString(apiConfig.model || apiConfig.modelName);
        if (!apiUrl || !apiModel) {
            return { ok: false, error: 'api_not_configured', message: '脱水 API 尚未配置，无法执行重构。' };
        }

        try {
            runtimeClient.initHippocampus(supabase, settingsSnapshot);
            const reconResult = await runtimeClient.activateWithReconsolidation(
                targetMemory,
                {
                    label: '管理台手动触发',
                    valence: 0,
                    arousal: 0.45
                },
                apiConfig,
                {
                    force: true,
                    manual: true,
                    batchMode: toTrimmedString(source.batchMode || source.batch_mode)
                        || (targetKind === 'event' ? 'event' : toTrimmedString(settingsSnapshot.reconsolidationBatchMode))
                        || 'auto',
                    triggerChance: 1
                }
            );

            const normalizedResult = reconResult && typeof reconResult === 'object'
                ? reconResult
                : {};
            return {
                ok: true,
                targetKind: targetKind,
                isolatedRuntime: !!runtimeEntry.isolated,
                charId: resolvedCharId,
                memoryId: safeMemoryId || toTrimmedString(targetMemory && (targetMemory.memory_id || targetMemory.id)),
                eventId: safeEventId || toTrimmedString(targetMemory && targetMemory.event_id),
                reconstructed: !!normalizedResult.reconstructed,
                reconstructedCount: Math.max(0, Math.floor(toFiniteNumber(normalizedResult.reconstructedCount, 0))),
                rejectedCount: Math.max(0, Math.floor(toFiniteNumber(normalizedResult.rejectedCount, 0))),
                activatedCount: Math.max(0, Math.floor(toFiniteNumber(normalizedResult.activatedCount, 0))),
                strategy: toTrimmedString(normalizedResult.reconsolidationStrategy),
                scope: toTrimmedString(normalizedResult.reconsolidationScope),
                skippedReason: toTrimmedString(normalizedResult.skippedReason),
                result: normalizedResult,
                event: eventRecord,
                members: memberItems
            };
        } catch (error) {
            console.warn('[海马体管理台] 手动触发重构失败，已静默降级。', error);
            return {
                ok: false,
                error: toTrimmedString(error && error.message) || 'manual_reconsolidation_failed',
                message: '手动重构执行失败。'
            };
        }
    }

    /**
     * 基于事件补丁与成员碎片构建真实事件表 upsert payload。
     */
    function buildEventRecordSyncPayload(userId, charId, eventPatch, members, existingRecord, options) {
        const safeUserId = toTrimmedString(userId);
        const safeCharId = toTrimmedString(charId);
        const safePatch = eventPatch && typeof eventPatch === 'object' ? eventPatch : {};
        const sourceMembers = Array.isArray(members) ? members.filter(Boolean) : [];
        const optionSource = options && typeof options === 'object' ? options : {};
        const safeEventId = toTrimmedString(
            safePatch.eventId
            || safePatch.event_id
            || safePatch.id
            || (existingRecord && existingRecord.id)
        );

        if (!safeUserId || !safeCharId || !safeEventId || sourceMembers.length <= 0) {
            return null;
        }

        const orderedMembers = sourceMembers.slice().sort(function sortMembers(left, right) {
            const rightImportance = toFiniteNumber(right && right.importance, 0);
            const leftImportance = toFiniteNumber(left && left.importance, 0);
            if (rightImportance !== leftImportance) return rightImportance - leftImportance;
            return getRecordTimestampMs(right) - getRecordTimestampMs(left);
        });
        const anchorMember = orderedMembers[0] || sourceMembers[0] || null;
        const anchorMetadata = normalizeMetadata(anchorMember && anchorMember.metadata);
        const memberIds = normalizeIdArray(orderedMembers.map(function mapId(item) {
            return item && item.id;
        }), 96);
        const detailMemoryIds = normalizeIdArray(
            safePatch.detailMemoryIds !== undefined
                ? safePatch.detailMemoryIds
                : safePatch.event_detail_memory_ids !== undefined
                    ? safePatch.event_detail_memory_ids
                    : memberIds,
            24
        );
        const fragmentFlashbulbIds = normalizeIdArray(
            orderedMembers
                .filter(function filterFlashbulb(item) {
                    return toBoolean(item && item.is_flashbulb);
                })
                .map(function mapFlashbulbId(item) {
                    return item && item.id;
                }),
            24
        );
        const flashbulbMemoryIds = normalizeIdArray(
            fragmentFlashbulbIds.concat(
                safePatch.flashbulbMemoryIds !== undefined
                    ? safePatch.flashbulbMemoryIds
                    : safePatch.event_flashbulb_memory_ids !== undefined
                        ? safePatch.event_flashbulb_memory_ids
                        : existingRecord && existingRecord.event_flashbulb_memory_ids
                            ? existingRecord.event_flashbulb_memory_ids
                            : []
            ),
            24
        );
        const roomId = toNullableText(
            optionSource.roomId
            || optionSource.room_id
            || (anchorMember && anchorMember.room_id)
            || (existingRecord && existingRecord.room_id)
        );
        const contextScope = toTrimmedString(
            optionSource.contextScope
            || optionSource.context_scope
            || (anchorMember && anchorMember.context_scope)
            || (existingRecord && existingRecord.context_scope)
            || (roomId ? 'room' : 'private')
        ) || (roomId ? 'room' : 'private');
        const continuationKey = toNullableText(
            optionSource.continuationKey
            || optionSource.continuation_key
            || safePatch.continuationKey
            || safePatch.continuation_key
            || (anchorMember && anchorMember.continuation_key)
            || anchorMetadata.continuation_key
            || (existingRecord && existingRecord.continuation_key)
        );
        const eventDate = toNullableText(
            safePatch.eventDate
            || safePatch.event_date
            || (anchorMember && anchorMember.event_date)
            || anchorMetadata.event_date
            || anchorMetadata.occurred_at
            || (existingRecord && existingRecord.event_date)
        );
        const fragmentCount = normalizeEventFragmentCount(
            safePatch.fragmentCount !== undefined
                ? safePatch.fragmentCount
                : safePatch.event_fragment_count
        );
        const manualEdited = optionSource.manualEdited !== undefined
            ? toBoolean(optionSource.manualEdited)
            : !!(existingRecord && existingRecord.manual_edited);
        const manualNote = toNullableText(
            optionSource.manualNote
            || optionSource.manual_note
            || (existingRecord && existingRecord.manual_note)
        );
        const eventIsFlashbulb = toBoolean(
            safePatch.isFlashbulb !== undefined
                ? safePatch.isFlashbulb
                : safePatch.event_is_flashbulb !== undefined
                    ? safePatch.event_is_flashbulb
                    : (existingRecord && existingRecord.event_is_flashbulb)
        ) || flashbulbMemoryIds.length > 0;
        const customMetadata = normalizeMetadata(optionSource.metadata);
        const syncReason = toTrimmedString(optionSource.syncReason || optionSource.sync_reason) || 'admin_event_adjust';

        const relatedTimestamps = orderedMembers
            .map(function mapTimestamp(item) {
                return getRecordTimestampMs(item);
            })
            .filter(function keepTimestamp(value) {
                return Number.isFinite(value) && value > 0;
            });
        const lastRelatedAt = relatedTimestamps.length > 0
            ? new Date(Math.max.apply(null, relatedTimestamps)).toISOString()
            : (existingRecord ? existingRecord.last_related_at : null);

        return {
            id: safeEventId,
            user_id: safeUserId,
            char_id: safeCharId,
            room_id: roomId,
            context_scope: contextScope,
            title: toTrimmedString(
                safePatch.title
                || safePatch.event_title
                || (existingRecord && existingRecord.title)
                || (anchorMember && anchorMember.event_title)
                || (anchorMember && anchorMember.content)
            ) || `记忆事件(${safeEventId.slice(0, 8)})`,
            summary: toTrimmedString(
                safePatch.summary
                || safePatch.event_summary
                || (existingRecord && existingRecord.summary)
                || (anchorMember && anchorMember.event_summary)
                || (anchorMember && anchorMember.content)
            ) || '',
            status: normalizeEventStatus(
                safePatch.status
                || safePatch.event_status
                || (existingRecord && existingRecord.status)
            ) || 'closed',
            depth: normalizeEventDepth(
                safePatch.depth
                || safePatch.event_depth
                || (existingRecord && existingRecord.depth)
            ) || 'medium',
            is_unresolved: safePatch.isUnresolved !== undefined
                ? toBoolean(safePatch.isUnresolved)
                : safePatch.event_is_unresolved !== undefined
                    ? toBoolean(safePatch.event_is_unresolved)
                    : !!(existingRecord && existingRecord.is_unresolved),
            continuation_key: continuationKey,
            event_date: eventDate,
            fragment_count: Math.max(memberIds.length, fragmentCount === null || fragmentCount === undefined ? memberIds.length : fragmentCount),
            salience_score: existingRecord ? toFiniteNumber(existingRecord.salience_score, 0) : 0,
            depth_score: existingRecord ? toFiniteNumber(existingRecord.depth_score, 0) : 0,
            anchor_memory_id: toNullableText(
                optionSource.anchorMemoryId
                || optionSource.anchor_memory_id
                || safePatch.anchorMemoryId
                || safePatch.event_anchor_memory_id
                || (anchorMember && anchorMember.id)
                || (existingRecord && existingRecord.anchor_memory_id)
            ),
            memory_ids: memberIds,
            detail_memory_ids: detailMemoryIds,
            start_at: existingRecord ? existingRecord.start_at : null,
            end_at: existingRecord ? existingRecord.end_at : null,
            last_related_at: lastRelatedAt,
            manual_edited: manualEdited,
            manual_note: manualNote,
            metadata: Object.assign(
                {},
                existingRecord && existingRecord.metadata ? existingRecord.metadata : {},
                customMetadata,
                {
                    source: 'admin_manual_event_sync',
                    last_admin_sync_at: new Date().toISOString(),
                    last_admin_sync_reason: syncReason,
                    event_is_flashbulb: eventIsFlashbulb,
                    event_flashbulb_memory_ids: flashbulbMemoryIds
                }
            )
        };
    }

    /**
     * 将管理台手动编排结果即时同步到真实事件表。
     */
    async function syncEventRecord(eventPatch, members, options) {
        const safePatch = eventPatch && typeof eventPatch === 'object' ? eventPatch : {};
        const safeEventId = toTrimmedString(safePatch.eventId || safePatch.event_id || safePatch.id);
        const sourceMembers = Array.isArray(members) ? members.filter(Boolean) : [];
        const optionSource = options && typeof options === 'object' ? options : {};
        const safeCharId = toTrimmedString(
            optionSource.charId
            || optionSource.char_id
            || (sourceMembers[0] && sourceMembers[0].char_id)
        );

        if (!safeEventId) {
            return { ok: false, error: 'invalid_event_id', event: null };
        }
        if (sourceMembers.length <= 0 && optionSource.deleteWhenEmpty !== false) {
            return deleteEventRecord(safeEventId, optionSource);
        }

        try {
            const supabase = getSupabaseClient();
            const userId = getUserId();
            if (!supabase || !userId || !safeCharId) {
                return { ok: false, error: 'not_ready', event: null };
            }

            const existingResult = await getEventRecord(safeEventId, { charId: safeCharId });
            const existingRecord = existingResult && existingResult.ok === true
                ? existingResult.event
                : null;
            const payload = buildEventRecordSyncPayload(
                userId,
                safeCharId,
                safePatch,
                sourceMembers,
                existingRecord,
                optionSource
            );
            if (!payload) {
                return { ok: false, error: 'empty_event_payload', event: null };
            }

            const response = await supabase
                .from('hippocampus_memory_events')
                .upsert([payload], {
                    onConflict: 'user_id,char_id,id'
                })
                .select('*')
                .limit(1);

            if (response.error) throw response.error;

            const row = Array.isArray(response.data) ? response.data[0] : response.data;
            return {
                ok: true,
                event: normalizeAdminEventRecordRow(row || payload)
            };
        } catch (error) {
            console.warn('[海马体管理台] 同步真实事件记录失败，已静默降级。', error);
            return {
                ok: false,
                error: toTrimmedString(error && error.message) || 'sync_event_record_failed',
                event: null
            };
        }
    }

    /**
     * 删除已经没有成员的真实事件表记录。
     */
    async function deleteEventRecord(eventId, options) {
        const safeEventId = toTrimmedString(eventId);
        const source = options && typeof options === 'object' ? options : {};
        const safeCharId = toTrimmedString(source.charId || source.char_id);

        try {
            const supabase = getSupabaseClient();
            const userId = getUserId();
            if (!supabase || !userId || !safeEventId) {
                return { ok: false, error: 'not_ready', deleted: false };
            }

            let query = supabase
                .from('hippocampus_memory_events')
                .delete({ count: 'exact' })
                .eq('user_id', userId)
                .eq('id', safeEventId);
            if (safeCharId) {
                query = query.eq('char_id', safeCharId);
            }

            const response = await query;
            if (response.error) throw response.error;

            return {
                ok: true,
                deleted: Math.max(0, Math.floor(toFiniteNumber(response.count, 0))) > 0
            };
        } catch (error) {
            console.warn('[海马体管理台] 删除真实事件记录失败，已静默降级。', error);
            return {
                ok: false,
                error: toTrimmedString(error && error.message) || 'delete_event_record_failed',
                deleted: false
            };
        }
    }

    /**
     * 读取管理台本地元信息，如最近导出和快照时间。
     */
    function readAdminMeta() {
        try {
            if (!root || !root.localStorage) return {};
            const raw = root.localStorage.getItem(META_STORAGE_KEY);
            if (!raw) return {};
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (_) {
            return {};
        }
    }

    /**
     * 持久化管理台本地元信息。
     */
    function writeAdminMeta(patch) {
        try {
            if (!root || !root.localStorage) return;
            const current = readAdminMeta();
            const nextValue = Object.assign({}, current, patch || {});
            root.localStorage.setItem(META_STORAGE_KEY, JSON.stringify(nextValue));
        } catch (_) {
            // 本地元信息写入失败时静默跳过。
        }
    }

    /**
     * 读取管理台展示用的元信息。
     */
    function getAdminMeta() {
        const meta = readAdminMeta();
        return {
            lastExportAt: meta.lastExportAt || null,
            lastSnapshotAt: meta.lastSnapshotAt || null
        };
    }

    /**
     * 调用管理台总览 RPC，返回当前筛选范围的汇总数据。
     */
    async function getDashboard(filters) {
        const normalizedFilters = normalizeFilters(filters);
        const emptyState = {
            total_count: 0,
            unresolved_count: 0,
            resolved_count: 0,
            private_count: 0,
            room_count: 0,
            created_last_7_days_count: 0,
            activated_last_7_days_count: 0
        };

        try {
            const supabase = getSupabaseClient();
            const userId = getUserId();
            if (!supabase || !userId) return emptyState;

            const response = await supabase.rpc('get_hippo_memory_dashboard', {
                p_user_id: userId,
                p_char_id: normalizedFilters.charId
            });

            if (response.error) throw response.error;

            const row = Array.isArray(response.data) ? response.data[0] : response.data;
            if (!row || typeof row !== 'object') return emptyState;

            return {
                total_count: Math.max(0, Math.floor(toFiniteNumber(row.total_count, 0))),
                unresolved_count: Math.max(0, Math.floor(toFiniteNumber(row.unresolved_count, 0))),
                resolved_count: Math.max(0, Math.floor(toFiniteNumber(row.resolved_count, 0))),
                private_count: Math.max(0, Math.floor(toFiniteNumber(row.private_count, 0))),
                room_count: Math.max(0, Math.floor(toFiniteNumber(row.room_count, 0))),
                created_last_7_days_count: Math.max(0, Math.floor(toFiniteNumber(row.created_last_7_days_count, 0))),
                activated_last_7_days_count: Math.max(0, Math.floor(toFiniteNumber(row.activated_last_7_days_count, 0)))
            };
        } catch (error) {
            console.warn('[海马体管理台] 读取总览失败，已静默降级。', error);
            return emptyState;
        }
    }

    /**
     * 调用管理台列表 RPC，返回分页结果。
     */
    async function listMemories(filters) {
        const normalizedFilters = normalizeFilters(filters);

        try {
            const supabase = getSupabaseClient();
            const userId = getUserId();
            if (!supabase || !userId) {
                return {
                    items: [],
                    limit: normalizedFilters.limit,
                    offset: normalizedFilters.offset,
                    totalCount: 0,
                    hasMore: false,
                    nextCursor: null,
                    cursor: normalizedFilters.cursor
                };
            }

            let countQuery = supabase
                .from('hippocampus_memories')
                .select('id', { count: 'exact', head: true })
                .eq('user_id', userId);
            countQuery = applyAdminListBaseFilters(countQuery, normalizedFilters);

            const countResponse = await countQuery;
            if (countResponse.error) throw countResponse.error;
            const totalCount = Math.max(0, Math.floor(toFiniteNumber(countResponse.count, 0)));

            let queryBuilder = supabase
                .from('hippocampus_memories')
                .select('*')
                .eq('user_id', userId);
            queryBuilder = applyAdminListBaseFilters(queryBuilder, normalizedFilters);
            queryBuilder = applyAdminListSortAndCursor(queryBuilder, normalizedFilters);

            const fetchLimit = Math.max(1, normalizedFilters.limit) + 1;
            const response = await queryBuilder.limit(fetchLimit);
            if (response.error) throw response.error;

            const rawItems = Array.isArray(response.data) ? response.data : [];
            const hasMore = rawItems.length > normalizedFilters.limit;
            const pageRows = hasMore ? rawItems.slice(0, normalizedFilters.limit) : rawItems;
            const items = pageRows
                .map(normalizeAdminMemoryRow)
                .filter(Boolean);

            const sort = normalizeSort(normalizedFilters.sort);
            let nextCursor = null;
            const lastItem = items.length > 0 ? items[items.length - 1] : null;
            if (hasMore && lastItem) {
                nextCursor = buildAdminListCursorFromItem(lastItem, sort);
            }

            return {
                items: items,
                limit: normalizedFilters.limit,
                offset: normalizedFilters.offset,
                totalCount: totalCount,
                hasMore: hasMore,
                nextCursor: nextCursor,
                cursor: normalizedFilters.cursor
            };
        } catch (error) {
            console.warn('[海马体管理台] 读取记忆列表失败，已静默降级。', error);
            return {
                items: [],
                limit: normalizedFilters.limit,
                offset: normalizedFilters.offset,
                totalCount: 0,
                hasMore: false,
                nextCursor: null,
                cursor: normalizedFilters.cursor
            };
        }
    }

    /**
     * 读取指定事件的成员条目，优先使用 event_id，必要时回退 metadata 字段匹配。
     */
    async function listEventMembers(filters) {
        const source = filters && typeof filters === 'object' ? filters : {};
        const eventId = toTrimmedString(source.eventId || source.event_id);
        const normalizedFilters = normalizeFilters(source);
        const safeLimit = Math.max(1, Math.min(320, Math.floor(toFiniteNumber(source.limit, 200))));

        if (!eventId) {
            return {
                ok: false,
                error: 'invalid_event_id',
                items: []
            };
        }

        try {
            const supabase = getSupabaseClient();
            const userId = getUserId();
            if (!supabase || !userId) {
                return {
                    ok: false,
                    error: 'not_ready',
                    items: []
                };
            }

            let queryBuilder = supabase
                .from('hippocampus_memories')
                .select('*')
                .eq('user_id', userId)
                .eq('event_id', eventId);
            if (normalizedFilters.charId) {
                queryBuilder = queryBuilder.eq('char_id', normalizedFilters.charId);
            }
            queryBuilder = queryBuilder
                .order('importance', { ascending: false, nullsFirst: false })
                .order('last_active_at', { ascending: false, nullsFirst: false })
                .order('created_at', { ascending: false, nullsFirst: false })
                .order('id', { ascending: false })
                .limit(safeLimit);

            const response = await queryBuilder;
            const responseErrorText = toTrimmedString(response && response.error && response.error.message).toLowerCase();
            const missingEventIdColumn = responseErrorText.includes('event_id')
                && (responseErrorText.includes('column') || responseErrorText.includes('schema cache'));
            if (response.error && !missingEventIdColumn) throw response.error;

            let rows = missingEventIdColumn ? [] : (Array.isArray(response.data) ? response.data : []);
            if (rows.length <= 0) {
                const fallbackLimit = Math.max(160, Math.min(1200, safeLimit * 4));
                let fallbackQuery = supabase
                    .from('hippocampus_memories')
                    .select('*')
                    .eq('user_id', userId);
                if (normalizedFilters.charId) {
                    fallbackQuery = fallbackQuery.eq('char_id', normalizedFilters.charId);
                }
                fallbackQuery = fallbackQuery
                    .order('last_active_at', { ascending: false, nullsFirst: false })
                    .order('created_at', { ascending: false, nullsFirst: false })
                    .order('id', { ascending: false })
                    .limit(fallbackLimit);

                const fallbackResponse = await fallbackQuery;
                if (fallbackResponse.error) throw fallbackResponse.error;

                const fallbackRows = Array.isArray(fallbackResponse.data) ? fallbackResponse.data : [];
                rows = fallbackRows.filter(function matchByMetadata(row) {
                    const metadata = normalizeMetadata(row && row.metadata);
                    return toTrimmedString(
                        row && (
                            row.event_id
                            || row.eventId
                            || metadata.event_id
                            || metadata.eventId
                            || metadata.memory_event_id
                            || metadata.cluster_id
                            || metadata.memory_cluster_id
                        )
                    ) === eventId;
                }).slice(0, safeLimit);
            }

            const items = rows
                .map(normalizeAdminMemoryRow)
                .filter(Boolean);
            return {
                ok: true,
                eventId: eventId,
                items: items
            };
        } catch (error) {
            console.warn('[海马体管理台] 读取事件成员失败，已静默降级。', error);
            return {
                ok: false,
                error: toTrimmedString(error && error.message) || 'list_event_members_failed',
                items: []
            };
        }
    }

    /**
     * 将任意目标页解析为 keyset 起始游标，供分页跳转使用。
     */
    async function resolvePageCursor(filters, targetPage) {
        const normalizedFilters = normalizeFilters(filters);
        const safePage = Math.max(1, Math.floor(toFiniteNumber(targetPage, 1)));
        if (safePage <= 1) return null;

        const safeLimit = Math.max(1, Math.floor(toFiniteNumber(normalizedFilters.limit, DEFAULT_PAGE_SIZE)));
        const targetOffset = (safePage - 1) * safeLimit;
        if (targetOffset <= 0) return null;

        try {
            const supabase = getSupabaseClient();
            const userId = getUserId();
            if (!supabase || !userId) return null;

            const anchorOffset = Math.max(0, targetOffset - 1);
            const sort = normalizeSort(normalizedFilters.sort);
            const fields = sort === 'last_active_at_desc'
                ? 'id,last_active_at'
                : sort === 'score_desc'
                    ? 'id,importance'
                    : 'id,created_at';

            let queryBuilder = supabase
                .from('hippocampus_memories')
                .select(fields)
                .eq('user_id', userId);
            queryBuilder = applyAdminListBaseFilters(queryBuilder, normalizedFilters);
            queryBuilder = applyAdminListSortAndCursor(queryBuilder, Object.assign({}, normalizedFilters, { cursor: null }));

            const response = await queryBuilder.range(anchorOffset, anchorOffset);
            if (response.error) throw response.error;

            const row = Array.isArray(response.data) ? response.data[0] : null;
            return buildAdminListCursorFromItem(row, sort);
        } catch (error) {
            console.warn('[海马体管理台] 解析分页跳转游标失败，已静默降级。', error);
            return null;
        }
    }

    /**
     * 更新单条记忆内容或状态，供管理台编辑按钮调用。
     */
    async function updateMemory(memoryId, updates) {
        const safeMemoryId = toTrimmedString(memoryId);
        const source = updates && typeof updates === 'object' ? updates : {};

        try {
            const supabase = getSupabaseClient();
            const userId = getUserId();
            if (!supabase || !userId || !safeMemoryId) {
                return { ok: false, error: 'not_ready' };
            }

            const payload = {};
            if (source.content !== undefined) {
                const content = toTrimmedString(source.content);
                if (!content) {
                    return { ok: false, error: 'empty_content' };
                }
                payload.content = content;
            }
            if (source.resolved !== undefined) {
                payload.resolved = !!source.resolved;
            }
            if (source.metadata !== undefined) {
                payload.metadata = normalizeMetadata(source.metadata);
            }
            if (source.is_flashbulb !== undefined) {
                payload.is_flashbulb = toNullableBoolean(source.is_flashbulb);
            }
            if (source.event_id !== undefined) {
                const eventId = toTrimmedString(source.event_id);
                payload.event_id = eventId || null;
            }
            if (source.event_title !== undefined) {
                const eventTitle = toTrimmedString(source.event_title);
                payload.event_title = eventTitle || null;
            }
            if (source.event_summary !== undefined) {
                const eventSummary = toTrimmedString(source.event_summary);
                payload.event_summary = eventSummary || null;
            }
            if (source.event_status !== undefined) {
                payload.event_status = normalizeEventStatus(source.event_status);
            }
            if (source.event_depth !== undefined) {
                payload.event_depth = normalizeEventDepth(source.event_depth);
            }
            if (source.event_date !== undefined) {
                const eventDate = toTrimmedString(source.event_date);
                payload.event_date = eventDate || null;
            }
            if (source.event_fragment_count !== undefined) {
                payload.event_fragment_count = normalizeEventFragmentCount(source.event_fragment_count);
            }
            if (source.event_is_unresolved !== undefined) {
                payload.event_is_unresolved = toNullableBoolean(source.event_is_unresolved);
            }
            if (payload.metadata && source.event_is_flashbulb !== undefined) {
                const eventIsFlashbulb = toNullableBoolean(source.event_is_flashbulb);
                if (eventIsFlashbulb === null) {
                    delete payload.metadata.event_is_flashbulb;
                    delete payload.metadata.eventIsFlashbulb;
                } else {
                    payload.metadata.event_is_flashbulb = eventIsFlashbulb;
                }
            }
            if (payload.metadata && source.event_flashbulb_memory_ids !== undefined) {
                const flashbulbIds = normalizeIdArray(source.event_flashbulb_memory_ids, 24);
                if (flashbulbIds.length > 0) {
                    payload.metadata.event_flashbulb_memory_ids = flashbulbIds;
                } else {
                    delete payload.metadata.event_flashbulb_memory_ids;
                    delete payload.metadata.eventFlashbulbMemoryIds;
                }
            }

            if (Object.keys(payload).length === 0) {
                return { ok: false, error: 'empty_update' };
            }

            let response = await supabase
                .from('hippocampus_memories')
                .update(payload)
                .eq('id', safeMemoryId)
                .eq('user_id', userId)
                .select('*')
                .single();

            if (response.error) {
                const errorText = toTrimmedString(response.error && response.error.message).toLowerCase();
                const missingEventColumns = (errorText.includes('event_') || errorText.includes('continuation_key'))
                    && (errorText.includes('column') || errorText.includes('schema cache'));
                if (missingEventColumns) {
                    const fallbackPayload = Object.assign({}, payload);
                    [
                        'event_id',
                        'event_title',
                        'event_summary',
                        'event_status',
                        'event_depth',
                        'event_date',
                        'event_fragment_count',
                        'event_is_unresolved'
                    ].forEach(function stripField(field) {
                        delete fallbackPayload[field];
                    });
                    if (Object.keys(fallbackPayload).length > 0) {
                        response = await supabase
                            .from('hippocampus_memories')
                            .update(fallbackPayload)
                            .eq('id', safeMemoryId)
                            .eq('user_id', userId)
                            .select('*')
                            .single();
                    }
                }
            }

            if (response.error) throw response.error;

            return {
                ok: true,
                memory: normalizeAdminMemoryRow(response.data)
            };
        } catch (error) {
            console.warn('[海马体管理台] 更新记忆失败，已静默降级。', error);
            return { ok: false, error: toTrimmedString(error && error.message) || 'update_failed' };
        }
    }

    /**
     * 删除单条记忆，供管理台删除按钮调用。
     */
    async function deleteMemory(memoryId) {
        const safeMemoryId = toTrimmedString(memoryId);

        try {
            const supabase = getSupabaseClient();
            const userId = getUserId();
            if (!supabase || !userId || !safeMemoryId) {
                return { ok: false, error: 'not_ready' };
            }

            const response = await supabase
                .from('hippocampus_memories')
                .delete({ count: 'exact' })
                .eq('id', safeMemoryId)
                .eq('user_id', userId);

            if (response.error) throw response.error;

            const deletedCount = Math.max(0, Math.floor(toFiniteNumber(response.count, 0)));
            if (deletedCount <= 0) {
                return { ok: false, error: 'not_found' };
            }

            return {
                ok: true,
                deletedCount: deletedCount
            };
        } catch (error) {
            console.warn('[海马体管理台] 删除记忆失败，已静默降级。', error);
            return { ok: false, error: toTrimmedString(error && error.message) || 'delete_failed' };
        }
    }

    /**
     * 读取当前最容易浮现的记忆，供总览页 Top 5 展示。
     */
    async function getTopSurfaceMemories(filters, limit) {
        const normalizedFilters = normalizeFilters(filters);
        const pageSize = Math.max(1, Math.floor(toFiniteNumber(limit, 5)));
        const response = await listMemories(Object.assign({}, normalizedFilters, {
            limit: pageSize,
            offset: 0,
            sort: 'score_desc'
        }));
        return Array.isArray(response.items) ? response.items.slice(0, pageSize) : [];
    }

    /**
     * 读取最近脱水失败任务列表，供管理台展示“一键重试”入口。
     */
    async function listDehydrateFailures(filters) {
        const normalizedFilters = normalizeFilters(filters);
        const bridge = getBridge();
        if (!bridge || typeof bridge.listDehydrateFailures !== 'function') {
            return [];
        }

        try {
            const response = await Promise.resolve(bridge.listDehydrateFailures({
                charId: normalizedFilters.charId
            }));
            const list = Array.isArray(response) ? response : [];
            return list
                .map(normalizeDehydrateFailureItem)
                .filter(Boolean)
                .sort(function sortFailures(a, b) {
                    return Number(b.createdAtMs || 0) - Number(a.createdAtMs || 0);
                });
        } catch (error) {
            console.warn('[海马体管理台] 读取脱水失败队列失败，已静默降级。', error);
            return [];
        }
    }

    /**
     * 触发单条脱水失败任务重试。
     */
    async function retryDehydrateFailure(charId, failureId) {
        const safeCharId = toTrimmedString(charId);
        const safeFailureId = toTrimmedString(failureId);
        const bridge = getBridge();
        if (!bridge || typeof bridge.retryDehydrateFailure !== 'function') {
            return { ok: false, error: 'not_supported', message: '当前环境不支持脱水重试' };
        }
        if (!safeCharId || !safeFailureId) {
            return { ok: false, error: 'invalid_params', message: '缺少重试参数' };
        }

        try {
            const response = await Promise.resolve(bridge.retryDehydrateFailure(safeCharId, safeFailureId));
            const result = response && typeof response === 'object' ? response : {};
            return {
                ok: result.ok === true,
                error: toTrimmedString(result.error),
                message: toTrimmedString(result.message),
                extractedCount: Math.max(0, Math.floor(Number(result.extractedCount) || 0)),
                writtenCount: Math.max(0, Math.floor(Number(result.writtenCount) || 0))
            };
        } catch (error) {
            console.warn('[海马体管理台] 触发脱水重试失败，已静默降级。', error);
            return {
                ok: false,
                error: 'retry_failed',
                message: toTrimmedString(error && error.message) || '重试请求失败'
            };
        }
    }

    /**
     * 删除单条脱水失败记录，仅清理待重试队列。
     */
    async function deleteDehydrateFailure(charId, failureId) {
        const safeCharId = toTrimmedString(charId);
        const safeFailureId = toTrimmedString(failureId);
        const bridge = getBridge();
        if (!bridge || typeof bridge.deleteDehydrateFailure !== 'function') {
            return { ok: false, error: 'not_supported', message: '当前环境不支持删除失败记录' };
        }
        if (!safeCharId || !safeFailureId) {
            return { ok: false, error: 'invalid_params', message: '缺少删除参数' };
        }

        try {
            const response = await Promise.resolve(bridge.deleteDehydrateFailure(safeCharId, safeFailureId));
            const result = response && typeof response === 'object' ? response : {};
            return {
                ok: result.ok === true,
                error: toTrimmedString(result.error),
                message: toTrimmedString(result.message)
            };
        } catch (error) {
            console.warn('[海马体管理台] 删除脱水失败记录失败，已静默降级。', error);
            return {
                ok: false,
                error: 'delete_failed',
                message: toTrimmedString(error && error.message) || '删除请求失败'
            };
        }
    }

    /**
     * 调用导出 RPC，返回完整原始记录。
     */
    async function exportMemories(filters, options) {
        const normalizedFilters = normalizeFilters(filters);
        const source = options && typeof options === 'object' ? options : {};
        const exportType = source.exportType === 'filtered' ? 'filtered' : 'full';

        try {
            const supabase = getSupabaseClient();
            const userId = getUserId();
            if (!supabase || !userId) return [];

            if (exportType === 'filtered') {
                return await exportMemoriesByPagedList(normalizedFilters);
            }

            const response = await supabase.rpc('export_hippo_memories', {
                p_user_id: userId,
                p_char_id: normalizedFilters.charId,
                p_room_id: normalizedFilters.roomId,
                p_context_scope: normalizedFilters.contextScope,
                p_resolved: normalizedFilters.resolved
            });

            if (response.error) throw response.error;

            const records = (Array.isArray(response.data) ? response.data : [])
                .map(normalizeExportRecord)
                .filter(Boolean);

            if (records.length > 0 || exportType === 'full' || exportType === 'filtered') {
                return records;
            }

            return [];
        } catch (error) {
            console.warn('[海马体管理台] 导出记忆失败，已静默降级。', error);
            return [];
        }
    }

    /**
     * 当存在关键词筛选时，使用分页列表 RPC 抓取全部匹配记录。
     */
    async function exportMemoriesByPagedList(filters) {
        const normalizedFilters = normalizeFilters(filters);
        const aggregated = [];
        let cursor = null;

        try {
            while (true) {
                const response = await listMemories(Object.assign({}, normalizedFilters, {
                    limit: EXPORT_PAGE_SIZE,
                    offset: 0,
                    cursor: cursor
                }));

                const pageItems = Array.isArray(response.items) ? response.items : [];
                if (pageItems.length === 0) break;

                for (let i = 0; i < pageItems.length; i += 1) {
                    const record = normalizeExportRecord(pageItems[i]);
                    if (record) {
                        aggregated.push(record);
                    }
                }

                if (!response.hasMore || !response.nextCursor) break;
                cursor = response.nextCursor;
            }
        } catch (error) {
            console.warn('[海马体管理台] 按筛选导出分页抓取失败，已静默降级。', error);
            return [];
        }

        return aggregated;
    }

    /**
     * 构造导出文件的 JSON 负载。
     */
    function buildExportPayload(records, filters, options) {
        const normalizedFilters = normalizeFilters(filters);
        const source = options && typeof options === 'object' ? options : {};
        const exportType = source.exportType === 'filtered' ? 'filtered' : 'full';

        return {
            schemaVersion: 'hippo-export/v1',
            exportedAt: new Date().toISOString(),
            source: {
                app: 'IDIC',
                module: 'hippocampus-admin',
                exportType: exportType
            },
            filters: {
                charId: normalizedFilters.charId,
                roomId: normalizedFilters.roomId,
                contextScope: normalizedFilters.contextScope,
                resolved: normalizedFilters.resolved
            },
            records: Array.isArray(records) ? records : []
        };
    }

    /**
     * 触发浏览器下载 JSON 文件。
     */
    function downloadJsonFile(payload, filename) {
        try {
            if (!root || !root.document || typeof root.URL === 'undefined') return false;

            const safeFilename = toTrimmedString(filename) || `hippocampus-export-${Date.now()}.json`;
            const jsonText = typeof payload === 'string'
                ? payload
                : JSON.stringify(payload, null, 2);
            const blob = new Blob([jsonText], { type: 'application/json;charset=utf-8' });
            const objectUrl = root.URL.createObjectURL(blob);
            const anchor = root.document.createElement('a');
            anchor.href = objectUrl;
            anchor.download = safeFilename;
            anchor.style.display = 'none';
            root.document.body.appendChild(anchor);
            anchor.click();
            root.document.body.removeChild(anchor);
            root.URL.revokeObjectURL(objectUrl);
            return true;
        } catch (error) {
            console.warn('[海马体管理台] 触发 JSON 下载失败，已静默跳过。', error);
            return false;
        }
    }

    /**
     * 记录最近一次导出时间。
     */
    function markLastExportAt(timestamp) {
        writeAdminMeta({
            lastExportAt: timestamp || new Date().toISOString()
        });
    }

    /**
     * 记录最近一次快照时间。
     */
    function markLastSnapshotAt(timestamp) {
        writeAdminMeta({
            lastSnapshotAt: timestamp || new Date().toISOString()
        });
    }

    /**
     * 生成导出文件名，便于用户区分全量与筛选导出。
     */
    function buildExportFilename(prefix, filters) {
        const normalizedFilters = normalizeFilters(filters);
        const dateTag = new Date().toISOString().replace(/[:.]/g, '-');
        const charTag = normalizedFilters.charId || 'all-characters';
        return `${prefix}-${charTag}-${dateTag}.json`;
    }

    /**
     * 打开 IndexedDB 快照仓库。
     */
    function openSnapshotDatabase() {
        return new Promise(function openSnapshotDatabasePromise(resolve, reject) {
            try {
                if (!root || !root.indexedDB) {
                    reject(new Error('IndexedDB unavailable'));
                    return;
                }

                const request = root.indexedDB.open(SNAPSHOT_DB_NAME, SNAPSHOT_DB_VERSION);

                request.onupgradeneeded = function handleUpgrade(event) {
                    const database = event.target.result;
                    if (!database.objectStoreNames.contains(SNAPSHOT_STORE_NAME)) {
                        const store = database.createObjectStore(SNAPSHOT_STORE_NAME, { keyPath: 'id' });
                        store.createIndex('createdAtMs', 'createdAtMs', { unique: false });
                    }
                };

                request.onsuccess = function handleSuccess() {
                    resolve(request.result);
                };

                request.onerror = function handleError() {
                    reject(request.error || new Error('Failed to open snapshot db'));
                };
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * 执行一次 IndexedDB 仓库操作。
     */
    async function runSnapshotStore(mode, executor) {
        const database = await openSnapshotDatabase();

        return new Promise(function runSnapshotStorePromise(resolve, reject) {
            try {
                const transaction = database.transaction([SNAPSHOT_STORE_NAME], mode);
                const store = transaction.objectStore(SNAPSHOT_STORE_NAME);
                let settled = false;

                transaction.oncomplete = function handleComplete() {
                    if (!settled) {
                        settled = true;
                        resolve(undefined);
                    }
                    database.close();
                };

                transaction.onerror = function handleError() {
                    if (!settled) {
                        settled = true;
                        reject(transaction.error || new Error('Snapshot transaction failed'));
                    }
                    database.close();
                };

                transaction.onabort = function handleAbort() {
                    if (!settled) {
                        settled = true;
                        reject(transaction.error || new Error('Snapshot transaction aborted'));
                    }
                    database.close();
                };

                executor(store, function finish(value) {
                    if (!settled) {
                        settled = true;
                        resolve(value);
                    }
                }, function fail(error) {
                    if (!settled) {
                        settled = true;
                        reject(error);
                    }
                });
            } catch (error) {
                database.close();
                reject(error);
            }
        });
    }

    /**
     * 将导出负载存为本地快照，并自动裁剪到最多 5 份。
     */
    async function saveSnapshot(payload, options) {
        const source = options && typeof options === 'object' ? options : {};
        const createdAt = source.createdAt || new Date().toISOString();
        const snapshotPayload = payload && typeof payload === 'object' ? payload : {};
        const jsonText = JSON.stringify(snapshotPayload);
        const userId = getUserId();
        const snapshot = {
            id: source.id || `hippo-snapshot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            userId: userId || '',
            createdAt: createdAt,
            createdAtMs: new Date(createdAt).getTime() || Date.now(),
            recordCount: Array.isArray(snapshotPayload.records) ? snapshotPayload.records.length : 0,
            sizeBytes: new Blob([jsonText]).size,
            fromOnline: source.fromOnline !== false,
            scopeLabel: toTrimmedString(source.scopeLabel),
            payload: snapshotPayload
        };

        try {
            await runSnapshotStore('readwrite', function writeSnapshot(store, finish, fail) {
                const request = store.put(snapshot);
                request.onsuccess = function handleSuccess() {
                    finish(snapshot);
                };
                request.onerror = function handleError() {
                    fail(request.error || new Error('Failed to save snapshot'));
                };
            });

            await trimSnapshots(MAX_SNAPSHOT_COUNT);
            markLastSnapshotAt(createdAt);
            return snapshot;
        } catch (error) {
            console.warn('[海马体管理台] 保存本地快照失败，已静默跳过。', error);
            return null;
        }
    }

    /**
     * 读取全部快照，并按时间倒序返回。
     */
    async function listSnapshots() {
        try {
            const userId = getUserId();
            const snapshots = await runSnapshotStore('readonly', function listSnapshotStore(store, finish, fail) {
                const request = store.getAll();
                request.onsuccess = function handleSuccess() {
                    finish(Array.isArray(request.result) ? request.result : []);
                };
                request.onerror = function handleError() {
                    fail(request.error || new Error('Failed to list snapshots'));
                };
            });

            return (Array.isArray(snapshots) ? snapshots : [])
                .filter(function filterSnapshotByUser(snapshot) {
                    const snapshotUserId = toTrimmedString(snapshot && snapshot.userId);
                    if (!snapshotUserId) return true;
                    if (!userId) return false;
                    return snapshotUserId === userId;
                })
                .sort(function sortSnapshots(a, b) {
                    return toFiniteNumber(b && b.createdAtMs, 0) - toFiniteNumber(a && a.createdAtMs, 0);
                });
        } catch (error) {
            console.warn('[海马体管理台] 读取快照列表失败，已静默降级。', error);
            return [];
        }
    }

    /**
     * 读取单个快照详情。
     */
    async function getSnapshot(snapshotId) {
        const safeId = toTrimmedString(snapshotId);
        if (!safeId) return null;

        try {
            const snapshot = await runSnapshotStore('readonly', function getSnapshotStore(store, finish, fail) {
                const request = store.get(safeId);
                request.onsuccess = function handleSuccess() {
                    finish(request.result || null);
                };
                request.onerror = function handleError() {
                    fail(request.error || new Error('Failed to get snapshot'));
                };
            });

            const userId = getUserId();
            const snapshotUserId = toTrimmedString(snapshot && snapshot.userId);
            if (snapshotUserId && userId && snapshotUserId !== userId) {
                return null;
            }
            if (snapshotUserId && !userId) {
                return null;
            }

            return snapshot || null;
        } catch (error) {
            console.warn('[海马体管理台] 读取快照详情失败，已静默降级。', error);
            return null;
        }
    }

    /**
     * 删除指定快照。
     */
    async function deleteSnapshot(snapshotId) {
        const safeId = toTrimmedString(snapshotId);
        if (!safeId) return false;

        try {
            await runSnapshotStore('readwrite', function deleteSnapshotStore(store, finish, fail) {
                const request = store.delete(safeId);
                request.onsuccess = function handleSuccess() {
                    finish(true);
                };
                request.onerror = function handleError() {
                    fail(request.error || new Error('Failed to delete snapshot'));
                };
            });
            return true;
        } catch (error) {
            console.warn('[海马体管理台] 删除本地快照失败，已静默跳过。', error);
            return false;
        }
    }

    /**
     * 将快照仓库裁剪到最多保留 N 份。
     */
    async function trimSnapshots(maxCount) {
        const safeMaxCount = Math.max(1, Math.floor(toFiniteNumber(maxCount, MAX_SNAPSHOT_COUNT)));

        try {
            const snapshots = await listSnapshots();
            if (snapshots.length <= safeMaxCount) return;

            const doomed = snapshots.slice(safeMaxCount);
            for (let i = 0; i < doomed.length; i += 1) {
                await deleteSnapshot(doomed[i].id);
            }
        } catch (error) {
            console.warn('[海马体管理台] 裁剪快照失败，已静默跳过。', error);
        }
    }

    /**
     * 基于当前筛选范围抓取远端记录并生成本地快照。
     */
    async function createSnapshotFromFilters(filters, options) {
        const normalizedFilters = normalizeFilters(filters);
        const source = options && typeof options === 'object' ? options : {};
        const records = await exportMemories(normalizedFilters, {
            exportType: source.exportType === 'filtered' ? 'filtered' : 'full'
        });
        const payload = buildExportPayload(records, normalizedFilters, {
            exportType: source.exportType === 'filtered' ? 'filtered' : 'full'
        });

        return saveSnapshot(payload, {
            fromOnline: true,
            scopeLabel: buildScopeLabel(normalizedFilters)
        });
    }

    /**
     * 根据筛选条件生成便于展示的人类可读范围标签。
     */
    function buildScopeLabel(filters) {
        const normalizedFilters = normalizeFilters(filters);
        const parts = [];

        if (normalizedFilters.charId) {
            parts.push(`角色 ${normalizedFilters.charId}`);
        } else {
            parts.push('全部角色');
        }

        if (normalizedFilters.roomId) {
            parts.push(`房间 ${normalizedFilters.roomId}`);
        }

        if (normalizedFilters.contextScope) {
            parts.push(normalizedFilters.contextScope === 'room' ? '仅群聊' : '仅私聊');
        }

        if (normalizedFilters.resolved === true) {
            parts.push('仅已解决');
        } else if (normalizedFilters.resolved === false) {
            parts.push('仅未解决');
        }

        if (normalizedFilters.query) {
            parts.push(`关键词 ${normalizedFilters.query}`);
        }

        return parts.join(' / ');
    }

    /**
     * 导出某个快照的原始 JSON 文件。
     */
    async function downloadSnapshot(snapshotId) {
        try {
            const snapshot = await getSnapshot(snapshotId);
            if (!snapshot || !snapshot.payload) return false;
            return downloadJsonFile(
                snapshot.payload,
                `hippocampus-snapshot-${toTrimmedString(snapshot.id) || Date.now()}.json`
            );
        } catch (error) {
            console.warn('[海马体管理台] 导出本地快照失败，已静默跳过。', error);
            return false;
        }
    }

    /**
     * 对外暴露的管理台客户端 API。
     */
    const api = {
        initHippocampusAdminClient: initHippocampusAdminClient,
        getDashboard: getDashboard,
        listMemories: listMemories,
        listEventRecords: listEventRecords,
        listEventMembers: listEventMembers,
        getEventRecord: getEventRecord,
        listEventRecordsByIds: listEventRecordsByIds,
        syncEventRecord: syncEventRecord,
        deleteEventRecord: deleteEventRecord,
        resolvePageCursor: resolvePageCursor,
        updateMemory: updateMemory,
        deleteMemory: deleteMemory,
        getTopSurfaceMemories: getTopSurfaceMemories,
        listDehydrateFailures: listDehydrateFailures,
        retryDehydrateFailure: retryDehydrateFailure,
        deleteDehydrateFailure: deleteDehydrateFailure,
        getAttachmentProfile: getAttachmentProfile,
        updateAttachmentProfile: updateAttachmentProfile,
        listDigestOutcomeRecords: listDigestOutcomeRecords,
        upsertDigestOutcomeRecord: upsertDigestOutcomeRecord,
        deleteDigestOutcomeRecord: deleteDigestOutcomeRecord,
        listNotebookRuntimeHistory: listNotebookRuntimeHistory,
        clearNotebookRuntimeHistory: clearNotebookRuntimeHistory,
        fetchAdminNotebook: fetchAdminNotebook,
        adminTriggerNotebookCompaction: adminTriggerNotebookCompaction,
        adminUpdateNotebookCompaction: adminUpdateNotebookCompaction,
        adminDeleteNotebookCompaction: adminDeleteNotebookCompaction,
        fetchAdminRelationshipArc: fetchAdminRelationshipArc,
        fetchNotebookLearningProfile: fetchNotebookLearningProfile,
        recordNotebookFeedback: recordNotebookFeedback,
        resetNotebookLearningProfile: resetNotebookLearningProfile,
        rebuildRelationshipArc: rebuildRelationshipArc,
        updateRelationshipArcTail: updateRelationshipArcTail,
        previewRelationshipArcImport: previewRelationshipArcImport,
        importRelationshipArcFromText: importRelationshipArcFromText,
        previewRelationshipArcCompression: previewRelationshipArcCompression,
        saveRelationshipArcDraft: saveRelationshipArcDraft,
        rollbackRelationshipArcVersion: rollbackRelationshipArcVersion,
        adminAddProfile: adminAddProfile,
        adminDeactivateProfile: adminDeactivateProfile,
        adminBatchDeactivateProfile: adminBatchDeactivateProfile,
        adminUpdateProfile: adminUpdateProfile,
        adminAddMustRemember: adminAddMustRemember,
        adminUpdateMustRemember: adminUpdateMustRemember,
        adminDeactivateMustRemember: adminDeactivateMustRemember,
        adminBatchDeactivateMustRemember: adminBatchDeactivateMustRemember,
        adminAddRedline: adminAddRedline,
        adminConfirmRedline: adminConfirmRedline,
        adminDeactivateRedline: adminDeactivateRedline,
        adminBatchDeactivateRedline: adminBatchDeactivateRedline,
        adminUpdateRedline: adminUpdateRedline,
        exportMemories: exportMemories,
        buildExportPayload: buildExportPayload,
        buildExportFilename: buildExportFilename,
        downloadJsonFile: downloadJsonFile,
        getAdminMeta: getAdminMeta,
        listEnabledContacts: listEnabledContacts,
        getCurrentContactSummary: getCurrentContactSummary,
        saveSnapshot: saveSnapshot,
        listSnapshots: listSnapshots,
        getSnapshot: getSnapshot,
        deleteSnapshot: deleteSnapshot,
        trimSnapshots: trimSnapshots,
        createSnapshotFromFilters: createSnapshotFromFilters,
        downloadSnapshot: downloadSnapshot,
        markLastExportAt: markLastExportAt,
        markLastSnapshotAt: markLastSnapshotAt,
        buildScopeLabel: buildScopeLabel,
        getMemoryRecord: getMemoryRecord,
        runManualReconsolidation: runManualReconsolidation
    };

    return api;
}
