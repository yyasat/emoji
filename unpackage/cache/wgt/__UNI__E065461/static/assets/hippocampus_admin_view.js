/**
 * 初始化海马体管理台视图模块导出壳子。
 * 兼容浏览器全局和 CommonJS 两种加载方式。
 */
(function initHippocampusAdminViewModule(root) {
    const api = createHippocampusAdminView(root);

    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }

    if (root && typeof root === 'object') {
        root.HippocampusAdminView = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this));

/**
 * 创建海马体管理台视图实例。
 * 这里负责 UI 渲染、事件分发和按需加载管理台数据。
 */
function createHippocampusAdminView(root) {
    const VIEW_ID = 'hippocampus-admin-view';
    const ROOT_ID = 'hippocampus-admin-root';
    const ENTRY_ID = 'cs-hippocampus-admin-entry';
    const BACK_BUTTON_ID = 'back-to-contact-settings-from-hippocampus-admin';
    const STYLE_ID = 'hippocampus-admin-view-style';
    const THREE_SCRIPT_ID = 'hip-admin-three-r128';
    const THREE_SCRIPT_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
    const NEURAL_GLOBE_CONTAINER_ID = 'hip-neural-container';
    const PAGE_SIZE = 12;
    const DIAGNOSTIC_LARGE_EVENT_THRESHOLD = 12;
    const DIAGNOSTIC_CROWDED_UNRESOLVED_THRESHOLD = 6;
    const DIAGNOSTIC_DIGEST_ASSIGNED_THRESHOLD = 10;
    const DIAGNOSTIC_DIGEST_EVENTIZED_THRESHOLD = 3;
    const DIAGNOSTIC_DIGEST_ORPHAN_THRESHOLD = 2;

    const state = {
        bridge: null,
        client: null,
        initialized: false,
        activeTab: 'overview',
        loading: false,
        migrationBusy: false,
        continuityBusy: false,
        migrationProgress: {
            active: false,
            current: 0,
            total: 0,
            label: ''
        },
        threeLoadPromise: null,
        threeGlobeInstance: null,
        migrationBatchContext: {},
        migrationListenerBound: false,
        migrationSession: null,
        manualYamlInput: '',
        notice: '',
        expandedMemoryId: '',
        expandedEventId: '',
        expandedEventMembersEventId: '',
        expandedEventMemberMemoryId: '',
        expandedDigestOutcomeId: '',
        loadingEventMembersEventId: '',
        eventMembersCache: {},
        adminDialog: null,
        regressionHelper: {
            trackedEventId: '',
            trackedCharId: '',
            snapshot: null,
            lastReport: null,
            busy: false
        },
        reconsolidationBusyKey: '',
        notebookPromptHelper: {
            trackedCharId: '',
            snapshot: null,
            lastReport: null
        },
        relationshipArcHelper: {
            busy: false,
            importText: '',
            previewRecord: null,
            compressionPreviewRecord: null,
            compressionStats: null,
            compareVersionId: ''
        },
        notebookCompactionHelper: {
            busy: false,
            saveBusy: false
        },
        selectedSnapshotId: '',
        notebookSections: {
            redlines: true,
            mustRemember: true,
            profiles: true
        },
        notebookSelection: {
            redline: [],
            mustRemember: [],
            profile: []
        },
        notebookView: {
            mode: 'all'
        },
        listFocus: {
            sourceTab: '',
            focusKey: '',
            title: '',
            hint: '',
            displayItems: [],
            preferredMemoryId: '',
            preferredEventId: '',
            count: 0
        },
        filters: {
            charId: null,
            roomId: '',
            contextScope: '',
            resolved: '',
            layer: '',
            recordType: '',
            query: '',
            sort: 'created_at_desc',
            limit: PAGE_SIZE,
            offset: 0
        },
        listPagination: {
            page: 1,
            cursor: null,
            nextCursor: null,
            hasMore: false,
            pageStartCursors: [null]
        },
        data: {
            overview: {
                dashboard: null,
                topMemories: []
            },
            recon: {
                dashboard: null,
                memories: [],
                eventRecordsById: {}
            },
            audit: {
                dashboard: null,
                memories: [],
                eventRecordsById: {},
                dehydrateFailures: [],
                digestOutcomes: []
            },
            diagnostics: {
                dashboard: null,
                memories: [],
                eventRecordsById: {},
                dehydrateFailures: [],
                digestOutcomes: [],
                eventRecords: []
            },
            list: {
                items: [],
                limit: PAGE_SIZE,
                offset: 0,
                totalCount: 0,
                hasMore: false,
                eventRecordsById: {},
                eventRecords: [],
                directDisplayItems: [],
                mode: 'memory'
            },
            snapshots: {
                items: [],
                preview: null
            },
            dehydrateFailures: {
                items: []
            },
            attachmentProfile: null,
            relationship: {
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
            },
            notebook: {
                profiles: [],
                mustRemember: [],
                redlines: [],
                pendingRedlines: [],
                promptPreview: null,
                cleanupPreview: null,
                learningProfile: null,
                runtimeStatus: null,
                runtimeHistory: []
            },
            continuity: {
                ok: false,
                error: '',
                userId: '',
                charId: '',
                charName: '',
                snapshot: null,
                promptText: ''
            },
            digestOutcomes: {
                items: []
            }
        }
    };

    function resetRegressionHelperState() {
        state.regressionHelper = {
            trackedEventId: '',
            trackedCharId: '',
            snapshot: null,
            lastReport: null,
            busy: false
        };
    }

    function resetListFocusState() {
        state.listFocus = {
            sourceTab: '',
            focusKey: '',
            title: '',
            hint: '',
            displayItems: [],
            preferredMemoryId: '',
            preferredEventId: '',
            count: 0
        };
    }

    function getRegressionHelperState() {
        if (state.regressionHelper && typeof state.regressionHelper === 'object') {
            return state.regressionHelper;
        }
        resetRegressionHelperState();
        return state.regressionHelper;
    }

    function resetNotebookPromptHelperState() {
        state.notebookPromptHelper = {
            trackedCharId: '',
            snapshot: null,
            lastReport: null
        };
    }

    function resetRelationshipArcHelperState() {
        state.relationshipArcHelper = {
            busy: false,
            importText: '',
            previewRecord: null,
            compressionPreviewRecord: null,
            compressionStats: null,
            compareVersionId: ''
        };
    }

    function resetNotebookSelectionState() {
        state.notebookSelection = {
            redline: [],
            mustRemember: [],
            profile: []
        };
    }

    function getNotebookPromptHelperState() {
        if (state.notebookPromptHelper && typeof state.notebookPromptHelper === 'object') {
            return state.notebookPromptHelper;
        }
        resetNotebookPromptHelperState();
        return state.notebookPromptHelper;
    }

    function getRelationshipArcHelperState() {
        if (state.relationshipArcHelper && typeof state.relationshipArcHelper === 'object') {
            return state.relationshipArcHelper;
        }
        resetRelationshipArcHelperState();
        return state.relationshipArcHelper;
    }

    /**
     * 初始化管理台视图，接入 bridge、client 和一次性 DOM 事件。
     */
    function initHippocampusAdminView(options) {
        const source = options && typeof options === 'object' ? options : {};
        state.bridge = source.bridge && typeof source.bridge === 'object' ? source.bridge : null;
        state.client = source.client && typeof source.client === 'object' ? source.client : null;

        injectStyles();
        bindStaticEvents();
        bindMigrationBackfillListener();
        syncAdminEntry(getCurrentContactSummary());

        state.initialized = true;
        return api;
    }

    /**
     * 打开管理台，并在首次进入时按当前角色预设默认筛选。
     */
    async function openAdmin(options) {
        const source = options && typeof options === 'object' ? options : {};
        const preferredCharId = toTrimmedString(source.charId);

        ensureDefaultCharFilter(preferredCharId);
        if (source.tab) {
            state.activeTab = normalizeTab(source.tab);
        }

        state.notice = '';
        state.expandedMemoryId = '';
        state.expandedEventId = '';
        state.expandedEventMembersEventId = '';
        state.expandedEventMemberMemoryId = '';
        state.expandedDigestOutcomeId = '';
        state.loadingEventMembersEventId = '';
        state.eventMembersCache = {};
        state.adminDialog = null;
        resetRegressionHelperState();
        resetNotebookPromptHelperState();
        resetRelationshipArcHelperState();
        resetNotebookSelectionState();
        resetListFocusState();
        resetListPagination();
        state.migrationProgress = {
            active: false,
            current: 0,
            total: 0,
            label: ''
        };
        const migration = getMigrationModule();
        if (migration && typeof migration.clearMigrationSession === 'function' && state.migrationSession) {
            migration.clearMigrationSession(state.migrationSession);
        }
        state.migrationSession = null;
        renderLayout();
        await switchToView(VIEW_ID);
        await refreshActiveTab();
    }

    /**
     * 根据当前角色的海马体开关状态同步入口显示。
     */
    function syncAdminEntry(contact) {
        const entry = getElements().entry;
        if (!entry) return;

        const summary = normalizeContactSummary(contact || getCurrentContactSummary());
        const enabledContacts = getEnabledContacts();
        const hasAnyEnabledContact = Array.isArray(enabledContacts) && enabledContacts.length > 0;
        const enabled = !!((summary && summary.hippocampusEnabled) || hasAnyEnabledContact);

        entry.classList.toggle('hidden', !enabled);
        entry.setAttribute('aria-disabled', enabled ? 'false' : 'true');
        entry.style.opacity = enabled ? '1' : '0.55';
        entry.style.pointerEvents = enabled ? 'auto' : 'none';
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
     * 读取当前可用的管理台客户端对象。
     */
    function getClient() {
        if (state.client && typeof state.client === 'object') {
            return state.client;
        }

        if (root && root.HippocampusAdminClient && typeof root.HippocampusAdminClient === 'object') {
            return root.HippocampusAdminClient;
        }

        return null;
    }

    /**
     * 读取当前可用的旧 YAML 迁移模块。
     */
    function getMigrationModule() {
        if (root && root.HippocampusMigration && typeof root.HippocampusMigration === 'object') {
            return root.HippocampusMigration;
        }

        return null;
    }

    /**
     * 把迁移模块的“向量回填完成”事件接入管理台，避免用户只能盲等后台任务。
     */
    function bindMigrationBackfillListener() {
        if (state.migrationListenerBound) return;
        const migration = getMigrationModule();
        if (!migration || typeof migration.onEmbeddingBackfillFinished !== 'function') return;

        migration.onEmbeddingBackfillFinished(function onBackfillFinished(payload) {
            handleMigrationEmbeddingBackfillFinished(payload);
        });
        state.migrationListenerBound = true;
    }

    /**
     * 将向量化失败原因代码转换为管理台可读中文。
     */
    function formatEmbeddingFailureReasonLabel(reasonCode) {
        const code = toTrimmedString(reasonCode);
        if (code === 'rate_limited') return '触发上游限流（429）';
        if (code === 'timeout') return '请求超时';
        if (code === 'auth_failed') return '鉴权失败（Key/权限）';
        if (code === 'network_error') return '网络请求失败';
        if (code === 'db_write_failed') return '数据库回写失败';
        if (code === 'embedding_empty_or_invalid') return '返回空向量或向量格式无效';
        return '未知原因';
    }

    /**
     * 接收迁移模块的回填完成事件，并给出最终结果回执（成功数/失败数/失败原因）。
     */
    function handleMigrationEmbeddingBackfillFinished(payload) {
        const result = payload && typeof payload === 'object' ? payload : {};
        const batchId = toTrimmedString(result.batchId);
        const context = batchId && state.migrationBatchContext && typeof state.migrationBatchContext === 'object'
            ? state.migrationBatchContext[batchId]
            : null;
        const charId = toTrimmedString(result.charId || (context && context.charId));
        const charLabel = toTrimmedString(context && context.charLabel) || getContactLabel(charId);
        const queuedCount = Math.max(0, Number(result.queuedCount || (context && context.queuedCount) || 0));
        const successCount = Math.max(0, Number(result.successCount || 0));
        const failedCount = Math.max(0, Number(result.failedCount || 0));
        const reasons = Array.isArray(result.failureReasons) ? result.failureReasons : [];

        const lines = [
            `角色：${charLabel || '当前角色'}`,
            `向量化完成：成功 ${successCount} 条，失败 ${failedCount} 条。`
        ];
        if (queuedCount > 0) {
            lines.splice(1, 0, `本批次入队：${queuedCount} 条`);
        }

        if (failedCount > 0 && reasons.length > 0) {
            lines.push('');
            lines.push('失败原因：');
            reasons.forEach(function appendReason(item, index) {
                const count = Math.max(0, Number(item && item.count || 0));
                const reasonLabel = formatEmbeddingFailureReasonLabel(item && item.reason);
                lines.push(`${index + 1}. ${reasonLabel}：${count} 条`);
            });
        }

        const finalText = lines.join('\n');
        state.notice = `“${charLabel || '当前角色'}”迁移向量化已完成：成功 ${successCount} 条，失败 ${failedCount} 条。`;
        if (state.activeTab === 'export') {
            renderLayout();
        }
        showAlertSafe('迁移向量化结果', finalText);
        showToastSafe(`迁移向量化完成：成功 ${successCount} / 失败 ${failedCount}`, failedCount > 0 ? 'info' : 'success');

        if (batchId && state.migrationBatchContext && typeof state.migrationBatchContext === 'object') {
            delete state.migrationBatchContext[batchId];
        }
    }

    /**
     * 获取管理台依赖的静态 DOM 节点。
     */
    function getElements() {
        const documentRef = root && root.document ? root.document : null;
        if (!documentRef) {
            return {
                entry: null,
                backButton: null,
                rootEl: null
            };
        }

        return {
            entry: documentRef.getElementById(ENTRY_ID),
            backButton: documentRef.getElementById(BACK_BUTTON_ID),
            rootEl: documentRef.getElementById(ROOT_ID)
        };
    }

    /**
     * 绑定入口、返回和容器级事件，避免在每次重绘后重复安装监听器。
     */
    function bindStaticEvents() {
        const elements = getElements();
        if (!elements.rootEl || elements.rootEl.dataset.hippocampusAdminBound === 'true') {
            return;
        }

        if (elements.entry) {
            elements.entry.addEventListener('click', function handleAdminEntryClick() {
                if (elements.entry.classList.contains('hidden') || elements.entry.getAttribute('aria-disabled') === 'true') {
                    return;
                }
                void openAdmin();
            });
        }

        if (elements.backButton) {
            elements.backButton.addEventListener('click', function handleAdminBackClick() {
                void switchToView('contact-settings-view');
            });
        }

        elements.rootEl.addEventListener('click', handleRootClick);
        elements.rootEl.addEventListener('change', handleRootChange);
        elements.rootEl.addEventListener('submit', handleRootSubmit);
        elements.rootEl.dataset.hippocampusAdminBound = 'true';
    }

    /**
     * 处理管理台根容器内的点击动作。
     */
    function handleRootClick(event) {
        const actionTarget = event.target.closest('[data-hip-action]');
        if (!actionTarget) return;

        const action = toTrimmedString(actionTarget.getAttribute('data-hip-action'));
        if (!action) return;

        if (action === 'go-back') {
            disposeNeuralGlobe();
            void switchToView('contact-settings-view');
            return;
        }

        if (action === 'switch-tab') {
            const tab = normalizeTab(actionTarget.getAttribute('data-tab'));
            if (tab === state.activeTab) return;
            state.activeTab = tab;
            state.notice = '';
            state.adminDialog = null;
            void refreshActiveTab();
            return;
        }

        if (action === 'refresh-tab') {
            state.adminDialog = null;
            void refreshActiveTab();
            return;
        }

        if (action === 'clear-list-focus') {
            resetListFocusState();
            state.adminDialog = null;
            void refreshListTab();
            return;
        }

        if (action === 'open-list-focus') {
            const focusKey = toTrimmedString(actionTarget.getAttribute('data-focus-key'));
            const sourceTab = toTrimmedString(actionTarget.getAttribute('data-source-tab')) || state.activeTab;
            if (!focusKey) return;
            handleOpenListFocus(sourceTab, focusKey);
            return;
        }

        if (action === 'set-filter') {
            state.filters.resolved = actionTarget.getAttribute('data-filter-resolved') || '';
            state.filters.layer = actionTarget.getAttribute('data-filter-layer') || '';
            state.filters.offset = 0;
            state.expandedMemoryId = '';
            state.expandedEventId = '';
            state.expandedEventMembersEventId = '';
            state.expandedEventMemberMemoryId = '';
            state.expandedDigestOutcomeId = '';
            state.loadingEventMembersEventId = '';
            state.eventMembersCache = {};
            state.adminDialog = null;
            resetListFocusState();
            resetListPagination();
            void refreshListTab();
            return;
        }

        if (action === 'reset-list-filters') {
            resetListFilters();
            void refreshListTab();
            return;
        }

        if (action === 'prev-page') {
            const pager = state.listPagination && typeof state.listPagination === 'object'
                ? state.listPagination
                : null;
            if (!pager || Number(pager.page || 1) <= 1) return;
            const targetPage = Math.max(1, Number(pager.page || 1) - 1);
            void jumpToListPage(targetPage);
            return;
        }

        if (action === 'next-page') {
            const pager = state.listPagination && typeof state.listPagination === 'object'
                ? state.listPagination
                : null;
            if (!pager) return;
            const targetPage = Math.max(1, Number(pager.page || 1) + 1);
            void jumpToListPage(targetPage);
            return;
        }

        if (action === 'jump-page') {
            const targetPage = Math.max(1, Math.floor(Number(actionTarget.getAttribute('data-page')) || 1));
            void jumpToListPage(targetPage);
            return;
        }

        if (action === 'toggle-memory') {
            const memoryId = toTrimmedString(actionTarget.getAttribute('data-memory-id'));
            state.expandedMemoryId = state.expandedMemoryId === memoryId ? '' : memoryId;
            if (state.expandedMemoryId) {
                state.expandedEventId = '';
                state.expandedEventMembersEventId = '';
                state.expandedEventMemberMemoryId = '';
            }
            renderLayout();
            return;
        }

        if (action === 'toggle-event') {
            if (event.target && event.target.closest && event.target.closest('.hip-card-expand')) {
                return;
            }
            const eventId = toTrimmedString(actionTarget.getAttribute('data-event-id'));
            const previousEventId = toTrimmedString(state.expandedEventId);
            const nextEventId = previousEventId === eventId ? '' : eventId;
            state.expandedEventId = nextEventId;
            if (!nextEventId || previousEventId !== nextEventId) {
                state.expandedEventMembersEventId = '';
                state.expandedEventMemberMemoryId = '';
            }
            state.expandedMemoryId = '';
            renderLayout();
            return;
        }

        if (action === 'toggle-event-members') {
            const eventId = toTrimmedString(actionTarget.getAttribute('data-event-id'));
            if (!eventId) return;
            void handleToggleEventMembers(eventId);
            return;
        }

        if (action === 'focus-memory') {
            const memoryId = toTrimmedString(actionTarget.getAttribute('data-memory-id'));
            const eventId = toTrimmedString(actionTarget.getAttribute('data-event-id'));
            if (!memoryId) return;
            if (eventId) {
                state.expandedEventId = eventId;
                state.expandedEventMembersEventId = eventId;
                state.expandedEventMemberMemoryId = state.expandedEventMemberMemoryId === memoryId ? '' : memoryId;
                state.expandedMemoryId = '';
                renderLayout();
                return;
            }
            const recordType = toTrimmedString(state.filters.recordType);
            if (recordType === 'event' || recordType === 'unresolved_event') {
                state.filters.recordType = '';
            }
            state.expandedMemoryId = memoryId;
            state.expandedEventId = '';
            state.expandedEventMembersEventId = '';
            state.expandedEventMemberMemoryId = '';
            renderLayout();
            return;
        }

        if (action === 'close-admin-dialog') {
            closeAdminDialog();
            return;
        }

        if (action === 'toggle-event-resolved') {
            const eventId = toTrimmedString(actionTarget.getAttribute('data-event-id'));
            if (!eventId) return;
            void handleToggleEventResolved(eventId);
            return;
        }

        if (action === 'run-event-reconsolidation') {
            const eventId = toTrimmedString(actionTarget.getAttribute('data-event-id'));
            if (!eventId) return;
            void handleRunEventReconsolidation(eventId);
            return;
        }

        if (action === 'run-memory-reconsolidation') {
            const memoryId = toTrimmedString(actionTarget.getAttribute('data-memory-id'));
            if (!memoryId) return;
            void handleRunMemoryReconsolidation(memoryId);
            return;
        }

        if (action === 'remember-regression-event') {
            const eventId = toTrimmedString(actionTarget.getAttribute('data-event-id'));
            if (!eventId) return;
            void handleRememberRegressionEvent(eventId);
            return;
        }

        if (action === 'check-regression-event') {
            const eventId = toTrimmedString(actionTarget.getAttribute('data-event-id'))
                || toTrimmedString(getRegressionHelperState().trackedEventId);
            if (!eventId) return;
            void handleCheckRegressionEvent(eventId);
            return;
        }

        if (action === 'clear-regression-event') {
            const eventId = toTrimmedString(actionTarget.getAttribute('data-event-id'));
            handleClearRegressionEvent(eventId);
            return;
        }

        if (action === 'edit-event') {
            const eventId = toTrimmedString(actionTarget.getAttribute('data-event-id'));
            if (!eventId) return;
            openEditEventDialog(eventId);
            return;
        }

        if (action === 'merge-event') {
            const eventId = toTrimmedString(actionTarget.getAttribute('data-event-id'));
            if (!eventId) return;
            openMergeEventDialog(eventId);
            return;
        }

        if (action === 'remove-event-member') {
            const eventId = toTrimmedString(actionTarget.getAttribute('data-event-id'));
            const memoryId = toTrimmedString(actionTarget.getAttribute('data-memory-id'));
            if (!eventId || !memoryId) return;
            void handleRemoveEventMember(eventId, memoryId);
            return;
        }

        if (action === 'attach-to-event') {
            const memoryId = toTrimmedString(actionTarget.getAttribute('data-memory-id'));
            if (!memoryId) return;
            openAttachEventDialog(memoryId);
            return;
        }

        if (action === 'edit-memory') {
            const memoryId = toTrimmedString(actionTarget.getAttribute('data-memory-id'));
            if (!memoryId) return;
            void handleEditMemory(memoryId);
            return;
        }

        if (action === 'delete-memory') {
            const memoryId = toTrimmedString(actionTarget.getAttribute('data-memory-id'));
            if (!memoryId) return;
            void handleDeleteMemory(memoryId);
            return;
        }

        if (action === 'toggle-resolved') {
            const memoryId = toTrimmedString(actionTarget.getAttribute('data-memory-id'));
            if (!memoryId) return;
            void handleToggleResolved(memoryId);
            return;
        }

        if (action === 'run-event-digest') {
            void handleRunEventDigest();
            return;
        }

        if (action === 'export-all') {
            void handleExport('full');
            return;
        }

        if (action === 'export-filtered') {
            void handleExport('filtered');
            return;
        }

        if (action === 'migrate-yaml-memory') {
            void handleYamlMigration();
            return;
        }

        if (action === 'retry-yaml-segment') {
            const segmentIndex = Math.max(0, Math.floor(Number(actionTarget.getAttribute('data-segment-index')) || 0));
            void handleRetryMigrationSegment(segmentIndex);
            return;
        }

        if (action === 'clear-migration-session') {
            const migration = getMigrationModule();
            if (migration && typeof migration.clearMigrationSession === 'function') {
                migration.clearMigrationSession(state.migrationSession);
            }
            state.migrationSession = null;
            renderLayout();
            return;
        }

        if (action === 'retry-missing-embeddings') {
            void handleRetryMissingEmbeddings();
            return;
        }

        if (action === 'go-snapshot-tab') {
            state.activeTab = 'snapshot';
            void refreshSnapshotTab();
            return;
        }

        if (action === 'create-snapshot') {
            void handleCreateSnapshot();
            return;
        }

        if (action === 'refresh-snapshots') {
            void refreshSnapshotTab();
            return;
        }

        if (action === 'refresh-dehydrate-failures') {
            void refreshSnapshotTab();
            return;
        }

        if (action === 'refresh-relationship-arc') {
            void refreshActiveTab();
            return;
        }

        if (action === 'retry-continuity') {
            void handleRetryContinuitySnapshot();
            return;
        }

        if (action === 'rebuild-relationship-arc') {
            void handleRebuildRelationshipArc();
            return;
        }

        if (action === 'update-relationship-arc-tail') {
            void handleTailUpdateRelationshipArc();
            return;
        }

        if (action === 'preview-relationship-arc-compression') {
            void handlePreviewRelationshipArcCompression();
            return;
        }

        if (action === 'clear-relationship-import-preview') {
            const helper = getRelationshipArcHelperState();
            helper.previewRecord = null;
            renderLayout();
            return;
        }

        if (action === 'clear-relationship-compression-preview') {
            const helper = getRelationshipArcHelperState();
            helper.compressionPreviewRecord = null;
            helper.compressionStats = null;
            renderLayout();
            return;
        }

        if (action === 'confirm-relationship-import') {
            void handleConfirmRelationshipArcImport();
            return;
        }

        if (action === 'rollback-relationship-arc-version') {
            const versionId = toTrimmedString(actionTarget.getAttribute('data-version-id'));
            if (!versionId) return;
            void handleRollbackRelationshipArcVersion(versionId);
            return;
        }

        if (action === 'compare-relationship-arc-version') {
            const versionId = toTrimmedString(actionTarget.getAttribute('data-version-id'));
            handleToggleRelationshipArcCompare(versionId);
            return;
        }

        if (action === 'retry-dehydrate-failure') {
            const failureId = toTrimmedString(actionTarget.getAttribute('data-failure-id'));
            const charId = toTrimmedString(actionTarget.getAttribute('data-char-id')) || toTrimmedString(state.filters.charId);
            if (!failureId || !charId) return;
            void handleRetryDehydrateFailure(charId, failureId);
            return;
        }

        if (action === 'delete-dehydrate-failure') {
            const failureId = toTrimmedString(actionTarget.getAttribute('data-failure-id'));
            const charId = toTrimmedString(actionTarget.getAttribute('data-char-id')) || toTrimmedString(state.filters.charId);
            if (!failureId || !charId) return;
            void handleDeleteDehydrateFailure(charId, failureId);
            return;
        }

        if (action === 'toggle-notebook-section') {
            const sectionKey = toTrimmedString(actionTarget.getAttribute('data-section'));
            if (!sectionKey) return;
            state.notebookSections[sectionKey] = !getNotebookSectionOpen(sectionKey);
            renderLayout();
            return;
        }

        if (action === 'refresh-notebook-preview') {
            void refreshNotebookTab();
            return;
        }

        if (action === 'copy-notebook-preview') {
            void handleCopyNotebookPromptPreview();
            return;
        }

        if (action === 'clear-notebook-runtime-history') {
            void handleClearNotebookRuntimeHistory();
            return;
        }

        if (action === 'trigger-notebook-compaction') {
            void handleTriggerNotebookCompaction();
            return;
        }

        if (action === 'rollback-notebook-compaction') {
            void handleRollbackNotebookCompaction();
            return;
        }

        if (action === 'remember-notebook-prompt') {
            handleRememberNotebookPromptPreview();
            return;
        }

        if (action === 'check-notebook-prompt') {
            handleCheckNotebookPromptPreview();
            return;
        }

        if (action === 'clear-notebook-prompt') {
            handleClearNotebookPromptPreview();
            return;
        }

        if (action === 'reset-notebook-learning') {
            void handleResetNotebookLearning();
            return;
        }

        if (action === 'set-notebook-view-mode') {
            const mode = toTrimmedString(actionTarget.getAttribute('data-mode'));
            setNotebookViewMode(mode);
            renderLayout();
            return;
        }

        if (action === 'select-visible-notebook-items') {
            const count = selectNotebookItemsByMode(getNotebookViewMode());
            if (count <= 0) {
                showToastSafe('当前筛选下没有可选中的记事本条目。', 'info');
                return;
            }
            renderLayout();
            showToastSafe(`已选中当前筛到的 ${count} 条记事本条目`, 'success');
            return;
        }

        if (action === 'clear-all-notebook-selection') {
            clearAllNotebookItemSelections();
            renderLayout();
            showToastSafe('已清空所有记事本选择。', 'info');
            return;
        }

        if (action === 'batch-delete-visible-notebook-suppressed') {
            void handleBatchDeleteNotebookSuppressedByMode(getNotebookViewMode());
            return;
        }

        if (action === 'toggle-notebook-item-selection') {
            const kind = toTrimmedString(actionTarget.getAttribute('data-kind'));
            const itemId = toTrimmedString(actionTarget.getAttribute('data-item-id'));
            if (!kind || !itemId) return;
            toggleNotebookItemSelection(kind, itemId);
            renderLayout();
            return;
        }

        if (action === 'select-all-notebook-items') {
            const kind = toTrimmedString(actionTarget.getAttribute('data-kind'));
            const items = collectNotebookSelectableItems(kind);
            if (items.length <= 0) return;
            selectAllNotebookItems(kind, items);
            renderLayout();
            return;
        }

        if (action === 'select-notebook-suppressed-items') {
            const kind = toTrimmedString(actionTarget.getAttribute('data-kind'));
            if (!kind) return;
            const suppressedIds = getNotebookSuppressedIds(kind);
            const selectedIds = selectNotebookSuppressedItems(kind);
            if (suppressedIds.length <= 0 || selectedIds.length <= 0) {
                showToastSafe(`${getNotebookCleanupKindLabel(kind)}里当前没有“不会注入”的条目。`, 'info');
                return;
            }
            renderLayout();
            showToastSafe(`已选中 ${suppressedIds.length} 条${getNotebookCleanupKindLabel(kind)}里的“不会注入”条目`, 'success');
            return;
        }

        if (action === 'select-all-notebook-suppressed') {
            const totalCount = selectAllNotebookSuppressedItems();
            if (totalCount <= 0) {
                showToastSafe('当前没有“不会注入”的记事本条目。', 'info');
                return;
            }
            renderLayout();
            showToastSafe(`已选中全部 ${totalCount} 条“不会注入”的记事本条目`, 'success');
            return;
        }

        if (action === 'clear-notebook-selection') {
            const kind = toTrimmedString(actionTarget.getAttribute('data-kind'));
            if (!kind) return;
            clearNotebookItemSelection(kind);
            renderLayout();
            return;
        }

        if (action === 'batch-delete-notebook-suppressed') {
            const kind = toTrimmedString(actionTarget.getAttribute('data-kind'));
            if (!kind) return;
            void handleBatchDeleteNotebookItems(kind, {
                itemIds: getNotebookSuppressedIds(kind),
                selectionHint: 'suppressed'
            });
            return;
        }

        if (action === 'batch-delete-notebook-items') {
            const kind = toTrimmedString(actionTarget.getAttribute('data-kind'));
            if (!kind) return;
            void handleBatchDeleteNotebookItems(kind);
            return;
        }

        if (action === 'batch-delete-all-notebook-suppressed') {
            void handleBatchDeleteAllNotebookSuppressedItems();
            return;
        }

        if (action === 'add-notebook-redline') {
            openNotebookEditorDialog('redline', 'create');
            return;
        }

        if (action === 'edit-notebook-redline') {
            const itemId = toTrimmedString(actionTarget.getAttribute('data-redline-id'));
            if (!itemId) return;
            openNotebookEditorDialog('redline', 'edit', { itemId: itemId });
            return;
        }

        if (action === 'confirm-notebook-redline') {
            const itemId = toTrimmedString(actionTarget.getAttribute('data-redline-id'));
            if (!itemId) return;
            void handleConfirmNotebookRedline(itemId);
            return;
        }

        if (action === 'deactivate-notebook-redline') {
            const itemId = toTrimmedString(actionTarget.getAttribute('data-redline-id'));
            if (!itemId) return;
            void handleDeactivateNotebookRedline(itemId);
            return;
        }

        if (action === 'add-notebook-must') {
            openNotebookEditorDialog('mustRemember', 'create');
            return;
        }

        if (action === 'edit-notebook-must') {
            const itemId = toTrimmedString(actionTarget.getAttribute('data-item-id'));
            if (!itemId) return;
            openNotebookEditorDialog('mustRemember', 'edit', { itemId: itemId });
            return;
        }

        if (action === 'delete-notebook-must') {
            const itemId = toTrimmedString(actionTarget.getAttribute('data-item-id'));
            if (!itemId) return;
            void handleDeactivateNotebookMustRemember(itemId);
            return;
        }

        if (action === 'add-notebook-profile') {
            const category = toTrimmedString(actionTarget.getAttribute('data-category')) || 'preference';
            openNotebookEditorDialog('profile', 'create', { category: category });
            return;
        }

        if (action === 'edit-notebook-profile') {
            const itemId = toTrimmedString(actionTarget.getAttribute('data-profile-id'));
            if (!itemId) return;
            openNotebookEditorDialog('profile', 'edit', { itemId: itemId });
            return;
        }

        if (action === 'delete-notebook-profile') {
            const itemId = toTrimmedString(actionTarget.getAttribute('data-profile-id'));
            if (!itemId) return;
            void handleDeactivateNotebookProfile(itemId);
            return;
        }

        if (action === 'add-digest-outcome') {
            void handleCreateDigestOutcome();
            return;
        }

        if (action === 'toggle-digest-outcome') {
            const digestId = toTrimmedString(actionTarget.getAttribute('data-digest-id'));
            state.expandedDigestOutcomeId = state.expandedDigestOutcomeId === digestId ? '' : digestId;
            renderLayout();
            return;
        }

        if (action === 'edit-digest-outcome') {
            const digestId = toTrimmedString(actionTarget.getAttribute('data-digest-id'));
            if (!digestId) return;
            void handleEditDigestOutcome(digestId);
            return;
        }

        if (action === 'edit-digest-summary') {
            const digestId = toTrimmedString(actionTarget.getAttribute('data-digest-id'));
            if (!digestId) return;
            void handleEditDigestOutcomeField(digestId, 'digestSummary');
            return;
        }

        if (action === 'edit-digest-events') {
            const digestId = toTrimmedString(actionTarget.getAttribute('data-digest-id'));
            if (!digestId) return;
            void handleEditDigestOutcomeField(digestId, 'eventChanges');
            return;
        }

        if (action === 'edit-digest-fragments') {
            const digestId = toTrimmedString(actionTarget.getAttribute('data-digest-id'));
            if (!digestId) return;
            void handleEditDigestOutcomeField(digestId, 'fragmentChanges');
            return;
        }

        if (action === 'edit-digest-self-insight') {
            const digestId = toTrimmedString(actionTarget.getAttribute('data-digest-id'));
            if (!digestId) return;
            void handleEditDigestOutcomeField(digestId, 'selfInsightAfter');
            return;
        }

        if (action === 'delete-digest-outcome') {
            const digestId = toTrimmedString(actionTarget.getAttribute('data-digest-id'));
            if (!digestId) return;
            void handleDeleteDigestOutcome(digestId);
            return;
        }

        if (action === 'view-snapshot') {
            const snapshotId = toTrimmedString(actionTarget.getAttribute('data-snapshot-id'));
            if (!snapshotId) return;
            state.selectedSnapshotId = snapshotId;
            void refreshSnapshotTab();
            return;
        }

        if (action === 'export-snapshot') {
            const snapshotId = toTrimmedString(actionTarget.getAttribute('data-snapshot-id'));
            if (!snapshotId) return;
            void handleExportSnapshot(snapshotId);
            return;
        }

        if (action === 'delete-snapshot') {
            const snapshotId = toTrimmedString(actionTarget.getAttribute('data-snapshot-id'));
            if (!snapshotId) return;
            void handleDeleteSnapshot(snapshotId);
        }
    }

    /**
     * 处理管理台根容器内的即时 change 事件。
     */
    function handleRootChange(event) {
        const target = event.target;
        if (!target) return;

        if (target.id === 'hip-admin-char-select') {
            state.filters.charId = toNullableText(target.value);
            state.filters.offset = 0;
            state.expandedMemoryId = '';
            state.expandedEventId = '';
            state.expandedEventMembersEventId = '';
            state.expandedEventMemberMemoryId = '';
            state.expandedDigestOutcomeId = '';
            state.loadingEventMembersEventId = '';
            state.eventMembersCache = {};
            state.adminDialog = null;
            state.notice = '';
            resetRegressionHelperState();
            resetNotebookPromptHelperState();
            resetRelationshipArcHelperState();
            resetListFocusState();
            resetListPagination();
            void refreshActiveTab();
            return;
        }

        const ownerForm = typeof target.closest === 'function'
            ? target.closest('#hip-admin-list-filter-form')
            : null;
        if (ownerForm && target.tagName === 'SELECT') {
            if (typeof root.Event === 'function') {
                ownerForm.dispatchEvent(new root.Event('submit', { bubbles: true, cancelable: true }));
            } else if (typeof ownerForm.requestSubmit === 'function') {
                ownerForm.requestSubmit();
            }
        }
    }

    /**
     * 处理列表筛选表单提交。
     */
    function handleRootSubmit(event) {
        const form = event.target;
        if (!form) return;

        if (form.id === 'hip-admin-edit-event-form') {
            event.preventDefault();
            if (typeof root.FormData !== 'function') return;
            const formData = new root.FormData(form);
            void submitEditEventDialog(formData);
            return;
        }

        if (form.id === 'hip-admin-edit-memory-form') {
            event.preventDefault();
            if (typeof root.FormData !== 'function') return;
            const formData = new root.FormData(form);
            void submitEditMemoryDialog(formData);
            return;
        }

        if (form.id === 'hip-admin-attach-event-form') {
            event.preventDefault();
            if (typeof root.FormData !== 'function') return;
            const formData = new root.FormData(form);
            void submitAttachEventDialog(formData);
            return;
        }

        if (form.id === 'hip-admin-merge-event-form') {
            event.preventDefault();
            if (typeof root.FormData !== 'function') return;
            const formData = new root.FormData(form);
            void submitMergeEventDialog(formData);
            return;
        }

        if (form.id === 'hip-admin-manual-yaml-form') {
            event.preventDefault();
            if (typeof root.FormData !== 'function') return;
            const formData = new root.FormData(form);
            const yamlText = toTrimmedString(formData.get('yamlText'));
            state.manualYamlInput = yamlText;
            void handleYamlMigration({
                sourceType: 'manual_paste_yaml',
                manualYamlText: yamlText
            });
            return;
        }

        if (form.id === 'hip-admin-attachment-form') {
            event.preventDefault();
            if (typeof root.FormData !== 'function') return;
            const formData = new root.FormData(form);
            const style = toTrimmedString(formData.get('attachmentStyle'));
            void handleUpdateAttachmentProfile(style);
            return;
        }

        if (form.id === 'hip-admin-notebook-form') {
            event.preventDefault();
            if (typeof root.FormData !== 'function') return;
            const formData = new root.FormData(form);
            void submitNotebookDialog(formData);
            return;
        }

        if (form.id === 'hip-admin-notebook-compaction-form') {
            event.preventDefault();
            if (typeof root.FormData !== 'function') return;
            const formData = new root.FormData(form);
            void submitNotebookCompactionForm(formData);
            return;
        }

        if (form.id === 'hip-admin-continuity-form') {
            event.preventDefault();
            if (typeof root.FormData !== 'function') return;
            const formData = new root.FormData(form);
            void submitContinuityForm(formData);
            return;
        }

        if (form.id === 'hip-admin-relationship-import-form') {
            event.preventDefault();
            if (typeof root.FormData !== 'function') return;
            const formData = new root.FormData(form);
            const importText = toTrimmedString(formData.get('relationshipImportText'));
            const helper = getRelationshipArcHelperState();
            helper.importText = importText;
            void handlePreviewRelationshipArcImport(importText);
            return;
        }

        if (form.id === 'hip-admin-relationship-compression-form') {
            event.preventDefault();
            if (typeof root.FormData !== 'function') return;
            const formData = new root.FormData(form);
            const promptText = toTrimmedString(formData.get('relationshipCompressionText'));
            void handleSaveRelationshipArcCompression(promptText);
            return;
        }

        if (form.id === 'hip-admin-page-jump-form') {
            event.preventDefault();
            if (typeof root.FormData !== 'function') return;

            const formData = new root.FormData(form);
            const targetPage = Math.max(1, Math.floor(Number(formData.get('page')) || 1));
            void jumpToListPage(targetPage);
            return;
        }

        if (form.id !== 'hip-admin-list-filter-form') return;

        event.preventDefault();
        applyListFiltersFromForm(form);
        void refreshListTab();
    }

    /**
     * 将列表筛选表单值写回到共享状态。
     */
    function applyListFiltersFromForm(form) {
        if (!form || typeof root.FormData !== 'function') return;

        const formData = new root.FormData(form);
        const nextRecordType = toTrimmedString(formData.get('recordType'));
        state.filters.roomId = toTrimmedString(formData.get('roomId'));
        state.filters.contextScope = toTrimmedString(formData.get('contextScope'));
        state.filters.resolved = isDirectEventRecordListMode(nextRecordType)
            ? ''
            : toTrimmedString(formData.get('resolved'));
        state.filters.layer = isDirectEventRecordListMode(nextRecordType)
            ? ''
            : toTrimmedString(formData.get('layer'));
        state.filters.recordType = nextRecordType;
        state.filters.query = toTrimmedString(formData.get('query'));
        state.filters.sort = normalizeListSort(formData.get('sort'), nextRecordType);
        state.filters.offset = 0;
        state.expandedMemoryId = '';
        state.expandedEventId = '';
        state.expandedEventMembersEventId = '';
        state.expandedEventMemberMemoryId = '';
        state.expandedDigestOutcomeId = '';
        state.loadingEventMembersEventId = '';
        state.eventMembersCache = {};
        state.adminDialog = null;
        resetListFocusState();
        resetListPagination();
    }

    /**
     * 将列表筛选重置为默认值，但保留当前角色范围。
     */
    function resetListFilters() {
        state.filters.roomId = '';
        state.filters.contextScope = '';
        state.filters.resolved = '';
        state.filters.layer = '';
        state.filters.recordType = '';
        state.filters.query = '';
        state.filters.sort = 'created_at_desc';
        state.filters.offset = 0;
        state.expandedMemoryId = '';
        state.expandedEventId = '';
        state.expandedEventMembersEventId = '';
        state.expandedEventMemberMemoryId = '';
        state.expandedDigestOutcomeId = '';
        state.loadingEventMembersEventId = '';
        state.eventMembersCache = {};
        resetListFocusState();
        resetListPagination();
    }

    /**
     * 复制分页游标对象，避免引用被后续流程意外修改。
     */
    function cloneListCursor(cursor) {
        if (!cursor || typeof cursor !== 'object') return null;
        const id = toTrimmedString(cursor.id);
        if (!id) return null;
        const cloned = {
            id: id,
            sort: normalizeSort(cursor.sort),
            sortValue: toTrimmedString(cursor.sortValue || ''),
            importance: Number.isFinite(Number(cursor.importance)) ? Number(cursor.importance) : null
        };
        return cloned;
    }

    /**
     * 跳转到指定页。优先复用已缓存游标，缺失时向客户端解析目标页起点游标。
     */
    async function jumpToListPage(targetPage) {
        const pager = state.listPagination && typeof state.listPagination === 'object'
            ? state.listPagination
            : null;
        if (!pager) return;

        const page = Math.max(1, Math.floor(Number(targetPage) || 1));
        const currentPage = Math.max(1, Number(pager.page || 1));
        if (page === currentPage) return;

        const totalCount = Math.max(0, Number(state.data && state.data.list && state.data.list.totalCount || 0));
        const maxPage = totalCount > 0 ? Math.max(1, Math.ceil(totalCount / PAGE_SIZE)) : 0;
        if (maxPage > 0 && page > maxPage) {
            showToastSafe(`最多只有 ${maxPage} 页。`, 'info');
            return;
        }

        if (isDirectEventRecordListMode(state.filters.recordType)) {
            pager.page = page;
            pager.cursor = null;
            pager.nextCursor = null;
            pager.hasMore = page < maxPage;
            state.filters.offset = (page - 1) * PAGE_SIZE;
            state.expandedMemoryId = '';
            state.expandedEventId = '';
            state.expandedEventMembersEventId = '';
            state.expandedEventMemberMemoryId = '';
            state.loadingEventMembersEventId = '';
            state.adminDialog = null;
            await refreshListTab();
            return;
        }

        let targetCursor = cloneListCursor(pager.pageStartCursors && pager.pageStartCursors[page - 1]);
        if (!targetCursor && page > 1) {
            const isImmediateNext = page === currentPage + 1;
            if (isImmediateNext && pager.hasMore && pager.nextCursor) {
                targetCursor = cloneListCursor(pager.nextCursor);
            } else {
                const client = getClient();
                if (!client || typeof client.resolvePageCursor !== 'function') {
                    showToastSafe('当前环境暂不支持直接跳转到未访问页。', 'info');
                    return;
                }

                const jumpFilters = buildCurrentListFilters();
                jumpFilters.cursor = null;
                jumpFilters.offset = (page - 1) * PAGE_SIZE;
                targetCursor = cloneListCursor(await client.resolvePageCursor(jumpFilters, page));
                if (!targetCursor) {
                    showToastSafe('未找到该页内容，请确认页码范围。', 'info');
                    return;
                }
            }
        }

        if (!pager.pageStartCursors) {
            pager.pageStartCursors = [null];
        }
        pager.pageStartCursors[page - 1] = cloneListCursor(targetCursor);
        pager.page = page;
        pager.cursor = cloneListCursor(targetCursor);
        state.filters.offset = (page - 1) * PAGE_SIZE;
        state.expandedMemoryId = '';
        state.expandedEventId = '';
        state.expandedEventMembersEventId = '';
        state.expandedEventMemberMemoryId = '';
        state.loadingEventMembersEventId = '';
        state.adminDialog = null;
        await refreshListTab();
    }

    /**
     * 将列表分页状态重置为 keyset 首页。
     */
    function resetListPagination() {
        state.listPagination = {
            page: 1,
            cursor: null,
            nextCursor: null,
            hasMore: false,
            pageStartCursors: [null]
        };
        state.filters.offset = 0;
    }

    /**
     * 按当前页签刷新数据并重绘视图。
     */
    async function refreshActiveTab() {
        state.notice = '';
        state.loading = true;
        renderLayout();

        try {
            if (state.activeTab === 'overview') {
                await loadOverviewData();
            } else if (state.activeTab === 'recon') {
                await loadReconData();
            } else if (state.activeTab === 'audit') {
                await loadAuditData();
            } else if (state.activeTab === 'diagnostics') {
                await loadDiagnosticsData();
            } else if (state.activeTab === 'list') {
                await loadListData();
            } else if (state.activeTab === 'continuity') {
                await loadContinuityData();
            } else if (state.activeTab === 'relationship') {
                await loadRelationshipData();
            } else if (state.activeTab === 'notebook') {
                await loadNotebookData();
            } else if (state.activeTab === 'snapshot' || state.activeTab === 'export') {
                await loadSnapshotData();
            }
        } finally {
            state.loading = false;
            renderLayout();
        }
    }

    /**
     * 专门刷新记忆列表页，便于翻页和筛选动作复用。
     */
    async function refreshListTab() {
        state.activeTab = 'list';
        await refreshActiveTab();
    }

    /**
     * 专门刷新本地快照页，便于查看和删除动作复用。
     */
    async function refreshSnapshotTab() {
        state.activeTab = 'snapshot';
        await refreshActiveTab();
    }

    /**
     * 加载总览页所需的仪表盘和浮现 Top 5 数据。
     */
    async function loadOverviewData() {
        const client = getClient();
        if (!client) {
            state.notice = '海马体管理台客户端未就绪。';
            state.data.overview.dashboard = null;
            state.data.overview.topMemories = [];
            return;
        }

        const overviewFilters = {
            charId: state.filters.charId
        };

        const results = await Promise.all([
            client.getDashboard(overviewFilters),
            client.getTopSurfaceMemories(overviewFilters, 5)
        ]);

        state.data.overview.dashboard = results[0] || null;
        state.data.overview.topMemories = Array.isArray(results[1]) ? results[1] : [];
    }

    /**
     * 加载审计页所需的最近活跃记忆、事件记录、失败任务与 digest 摘要。
     */
    async function loadAuditData() {
        const client = getClient();
        if (!client) {
            state.notice = '海马体管理台客户端未就绪。';
            state.data.audit = {
                dashboard: null,
                memories: [],
                eventRecordsById: {},
                dehydrateFailures: [],
                digestOutcomes: []
            };
            return;
        }

        const baseFilters = {
            charId: state.filters.charId,
            sort: 'last_active_at_desc',
            limit: 120,
            offset: 0
        };

        const results = await Promise.all([
            client.getDashboard({ charId: state.filters.charId }),
            client.listMemories(baseFilters),
            typeof client.listDehydrateFailures === 'function'
                ? client.listDehydrateFailures({ charId: state.filters.charId })
                : Promise.resolve([]),
            typeof client.listDigestOutcomeRecords === 'function'
                ? client.listDigestOutcomeRecords({ charId: state.filters.charId, hours: 24 })
                : Promise.resolve([])
        ]);

        const memoryResponse = results[1] && typeof results[1] === 'object' ? results[1] : {};
        const memories = Array.isArray(memoryResponse.items) ? memoryResponse.items : [];
        const auditEventIds = normalizeIdArray(memories.map(getMemoryEventId), 240);
        let eventRecordsById = {};

        if (auditEventIds.length > 0 && typeof client.listEventRecordsByIds === 'function') {
            const eventRecordResult = await client.listEventRecordsByIds({
                charId: state.filters.charId,
                eventIds: auditEventIds
            }).catch(function onAuditEventRecordError() {
                return { ok: false, items: [] };
            });
            if (eventRecordResult && eventRecordResult.ok === true) {
                eventRecordsById = (Array.isArray(eventRecordResult.items) ? eventRecordResult.items : [])
                    .reduce(function reduceAuditEventMap(result, item) {
                        const eventId = toTrimmedString(item && item.id);
                        if (eventId) {
                            result[eventId] = item;
                        }
                        return result;
                    }, {});
            }
        }

        state.data.audit = {
            dashboard: results[0] || null,
            memories: memories,
            eventRecordsById: eventRecordsById,
            dehydrateFailures: Array.isArray(results[2]) ? results[2] : [],
            digestOutcomes: Array.isArray(results[3]) ? results[3] : []
        };
    }

    /**
     * 加载独立重构页签所需的最近活跃记忆与事件记录。
     */
    async function loadReconData() {
        const client = getClient();
        if (!client) {
            state.notice = '海马体管理台客户端未就绪。';
            state.data.recon = {
                dashboard: null,
                memories: [],
                eventRecordsById: {}
            };
            return;
        }

        const baseFilters = {
            charId: state.filters.charId,
            sort: 'last_active_at_desc',
            limit: 160,
            offset: 0
        };

        const results = await Promise.all([
            client.getDashboard({ charId: state.filters.charId }),
            client.listMemories(baseFilters)
        ]);

        const memoryResponse = results[1] && typeof results[1] === 'object' ? results[1] : {};
        const memories = Array.isArray(memoryResponse.items) ? memoryResponse.items : [];
        const reconEventIds = normalizeIdArray(memories.map(getMemoryEventId), 320);
        let eventRecordsById = {};

        if (reconEventIds.length > 0 && typeof client.listEventRecordsByIds === 'function') {
            const eventRecordResult = await client.listEventRecordsByIds({
                charId: state.filters.charId,
                eventIds: reconEventIds
            }).catch(function onReconEventRecordError() {
                return { ok: false, items: [] };
            });
            if (eventRecordResult && eventRecordResult.ok === true) {
                eventRecordsById = (Array.isArray(eventRecordResult.items) ? eventRecordResult.items : [])
                    .reduce(function reduceReconEventMap(result, item) {
                        const eventId = toTrimmedString(item && item.id);
                        if (eventId) {
                            result[eventId] = item;
                        }
                        return result;
                    }, {});
            }
        }

        state.data.recon = {
            dashboard: results[0] || null,
            memories: memories,
            eventRecordsById: eventRecordsById
        };
    }

    /**
     * 加载列表页当前分页结果。
     */
    /**
     * 加载记事本页当前角色的数据。
     */
    async function loadDiagnosticsData() {
        const client = getClient();
        if (!client) {
            state.notice = '海马体管理台客户端未就绪。';
            state.data.diagnostics = {
                dashboard: null,
                memories: [],
                eventRecordsById: {},
                dehydrateFailures: [],
                digestOutcomes: [],
                eventRecords: []
            };
            return;
        }

        const baseFilters = {
            charId: state.filters.charId,
            sort: 'last_active_at_desc',
            limit: 180,
            offset: 0
        };

        const results = await Promise.all([
            client.getDashboard({ charId: state.filters.charId }),
            client.listMemories(baseFilters),
            typeof client.listDehydrateFailures === 'function'
                ? client.listDehydrateFailures({ charId: state.filters.charId })
                : Promise.resolve([]),
            typeof client.listDigestOutcomeRecords === 'function'
                ? client.listDigestOutcomeRecords({ charId: state.filters.charId, hours: 72 })
                : Promise.resolve([]),
            typeof client.listEventRecords === 'function'
                ? client.listEventRecords({
                    charId: state.filters.charId,
                    retired: 'all',
                    sort: 'last_related_at_desc',
                    limit: 160,
                    offset: 0
                })
                : Promise.resolve({ ok: true, items: [] })
        ]);

        const memoryResponse = results[1] && typeof results[1] === 'object' ? results[1] : {};
        const memories = Array.isArray(memoryResponse.items) ? memoryResponse.items : [];
        const diagnosticEventIds = normalizeIdArray(memories.map(getMemoryEventId), 360);
        let eventRecordsById = {};

        if (diagnosticEventIds.length > 0 && typeof client.listEventRecordsByIds === 'function') {
            const eventRecordResult = await client.listEventRecordsByIds({
                charId: state.filters.charId,
                eventIds: diagnosticEventIds
            }).catch(function onDiagnosticEventRecordError() {
                return { ok: false, items: [] };
            });
            if (eventRecordResult && eventRecordResult.ok === true) {
                eventRecordsById = (Array.isArray(eventRecordResult.items) ? eventRecordResult.items : [])
                    .reduce(function reduceDiagnosticEventMap(result, item) {
                        const eventId = toTrimmedString(item && item.id);
                        if (eventId) {
                            result[eventId] = item;
                        }
                        return result;
                    }, {});
            }
        }

        state.data.diagnostics = {
            dashboard: results[0] || null,
            memories: memories,
            eventRecordsById: eventRecordsById,
            dehydrateFailures: Array.isArray(results[2]) ? results[2] : [],
            digestOutcomes: Array.isArray(results[3]) ? results[3] : [],
            eventRecords: results[4] && typeof results[4] === 'object' && Array.isArray(results[4].items)
                ? results[4].items
                : []
        };
    }

    async function loadRelationshipData() {
        const client = getClient();
        const charId = toTrimmedString(state.filters.charId);
        if (!client || typeof client.fetchAdminRelationshipArc !== 'function') {
            state.notice = '当前环境暂不支持关系脉络面板。';
            state.data.relationship = createEmptyRelationshipArcView();
            return;
        }

        if (!charId) {
            state.notice = '请先选择一个角色，再查看关系脉络。';
            state.data.relationship = createEmptyRelationshipArcView();
            return;
        }

        const relationship = await client.fetchAdminRelationshipArc(charId);
        state.data.relationship = normalizeRelationshipArcView(relationship);

        const helper = getRelationshipArcHelperState();
        if (
            helper.compareVersionId
            && !findRelationshipArcVersionById(state.data.relationship.versions, helper.compareVersionId)
        ) {
            helper.compareVersionId = '';
        }
    }

    async function loadContinuityData() {
        const bridge = getBridge();
        const charId = toTrimmedString(state.filters.charId);
        if (!bridge || typeof bridge.getContinuitySnapshot !== 'function') {
            state.notice = '当前环境暂不支持查看 48h 连续摘要。';
            state.data.continuity = {
                ok: false,
                error: 'continuity_bridge_unavailable',
                userId: '',
                charId: charId,
                charName: '',
                snapshot: null,
                promptText: ''
            };
            return;
        }
        if (!charId) {
            state.notice = '请先选择一个角色，再查看 48h 连续摘要。';
            state.data.continuity = {
                ok: false,
                error: 'missing_char_id',
                userId: '',
                charId: '',
                charName: '',
                snapshot: null,
                promptText: ''
            };
            return;
        }
        const result = await Promise.resolve(bridge.getContinuitySnapshot(charId));
        state.data.continuity = result && typeof result === 'object'
            ? {
                ok: result.ok === true,
                error: toTrimmedString(result.error),
                userId: toTrimmedString(result.userId),
                charId: toTrimmedString(result.charId || charId),
                charName: toTrimmedString(result.charName),
                snapshot: result.snapshot && typeof result.snapshot === 'object' ? result.snapshot : null,
                promptText: toTrimmedString(result.promptText)
            }
            : {
                ok: false,
                error: 'empty_result',
                userId: '',
                charId: charId,
                charName: '',
                snapshot: null,
                promptText: ''
            };
    }

    async function loadNotebookData() {
        const client = getClient();
        const charId = toTrimmedString(state.filters.charId);
        if (!client || typeof client.fetchAdminNotebook !== 'function') {
            state.notice = '当前环境暂不支持记事本面板。';
            state.data.notebook = {
                statuses: [],
                profiles: [],
                mustRemember: [],
                redlines: [],
                pendingRedlines: [],
                promptPreview: null,
                cleanupPreview: null,
                learningProfile: null,
                runtimeStatus: null,
                runtimeHistory: []
            };
            pruneNotebookSelectionState(state.data.notebook);
            return;
        }

        if (!charId) {
            state.notice = '请先选择一个角色，再查看记事本。';
            state.data.notebook = {
                statuses: [],
                profiles: [],
                mustRemember: [],
                redlines: [],
                pendingRedlines: [],
                promptPreview: null,
                cleanupPreview: null,
                learningProfile: null,
                runtimeStatus: null,
                runtimeHistory: []
            };
            pruneNotebookSelectionState(state.data.notebook);
            return;
        }

        const notebook = await client.fetchAdminNotebook(charId);
        state.data.notebook = notebook && typeof notebook === 'object'
            ? {
                profiles: Array.isArray(notebook.profiles) ? notebook.profiles.filter(function filterVisibleProfile(item) {
                    return isNotebookProfileCategoryVisible(item && item.category);
                }) : [],
                mustRemember: Array.isArray(notebook.mustRemember) ? notebook.mustRemember : [],
                redlines: Array.isArray(notebook.redlines) ? notebook.redlines : [],
                pendingRedlines: Array.isArray(notebook.pendingRedlines) ? notebook.pendingRedlines : [],
                promptPreview: notebook.promptPreview && typeof notebook.promptPreview === 'object'
                    ? notebook.promptPreview
                    : null,
                cleanupPreview: notebook.cleanupPreview && typeof notebook.cleanupPreview === 'object'
                    ? notebook.cleanupPreview
                    : null,
                learningProfile: notebook.learningProfile && typeof notebook.learningProfile === 'object'
                    ? notebook.learningProfile
                    : null,
                runtimeStatus: notebook.runtimeStatus && typeof notebook.runtimeStatus === 'object'
                    ? notebook.runtimeStatus
                    : null,
                runtimeHistory: Array.isArray(notebook.runtimeHistory)
                    ? notebook.runtimeHistory
                    : []
            }
            : {
                profiles: [],
                mustRemember: [],
                redlines: [],
                pendingRedlines: [],
                promptPreview: null,
                cleanupPreview: null,
                learningProfile: null,
                runtimeStatus: null,
                runtimeHistory: []
            };
        pruneNotebookSelectionState(state.data.notebook);
    }

    async function loadListData() {
        const client = getClient();
        const pager = state.listPagination && typeof state.listPagination === 'object'
            ? state.listPagination
            : null;
        const currentPage = pager ? Math.max(1, Number(pager.page || 1)) : 1;
        const currentCursor = pager ? cloneListCursor(pager.cursor) : null;
        const directEventMode = isDirectEventRecordListMode(state.filters.recordType);

        if (!client) {
            state.notice = '海马体管理台客户端未就绪。';
            state.data.list = {
                items: [],
                limit: PAGE_SIZE,
                offset: 0,
                totalCount: 0,
                hasMore: false,
                eventRecordsById: {},
                eventRecords: [],
                directDisplayItems: [],
                mode: directEventMode ? 'retired_event' : 'memory'
            };
            if (pager) {
                pager.hasMore = false;
                pager.nextCursor = null;
            }
            return;
        }

        if (directEventMode) {
            const response = typeof client.listEventRecords === 'function'
                ? await client.listEventRecords(buildCurrentEventRecordListFilters())
                : { ok: false, items: [], totalCount: 0, hasMore: false };
            const eventRecords = response && typeof response === 'object' && Array.isArray(response.items)
                ? response.items
                : [];
            const totalCount = Math.max(0, Math.floor(Number(response && response.totalCount) || 0));
            const hasMore = !!(response && response.hasMore);

            if (pager) {
                pager.page = currentPage;
                pager.cursor = null;
                pager.nextCursor = null;
                pager.hasMore = hasMore;
            }

            state.filters.offset = (currentPage - 1) * PAGE_SIZE;
            state.data.list = {
                items: [],
                limit: PAGE_SIZE,
                offset: state.filters.offset,
                totalCount: totalCount,
                hasMore: hasMore,
                nextCursor: null,
                cursor: null,
                eventRecordsById: {},
                eventRecords: eventRecords,
                directDisplayItems: buildDirectEventDisplayItems(eventRecords),
                mode: 'retired_event'
            };
            return;
        }

        const response = await client.listMemories(buildCurrentListFilters());
        let items = response && typeof response === 'object' && Array.isArray(response.items) ? response.items : [];
        if (state.filters.layer) {
            items = items.filter(function(m) {
                const metadata = typeof m.metadata === 'object' && m.metadata ? m.metadata : {};
                const layer = toTrimmedString(
                    m && (m.memory_layer || m.layer)
                    || metadata.memory_layer
                    || metadata.memoryLayer
                    || metadata.layer
                ).toLowerCase();
                return layer === state.filters.layer;
            });
        }
        let eventRecordsById = {};
        const listEventIds = normalizeIdArray(items.map(getMemoryEventId), 240);
        if (listEventIds.length > 0 && typeof client.listEventRecordsByIds === 'function') {
            const eventRecordResult = await client.listEventRecordsByIds({
                charId: state.filters.charId,
                eventIds: listEventIds
            }).catch(function onListEventRecordsError() {
                return { ok: false, items: [] };
            });
            if (eventRecordResult && eventRecordResult.ok === true) {
                eventRecordsById = (Array.isArray(eventRecordResult.items) ? eventRecordResult.items : [])
                    .reduce(function reduceEventRecordMap(result, item) {
                        const eventId = toTrimmedString(item && item.id);
                        if (eventId) {
                            result[eventId] = item;
                        }
                        return result;
                    }, {});
            }
        }

        const responseCursor = cloneListCursor(response && response.cursor);
        const effectiveCursor = responseCursor || currentCursor;
        const totalCount = Math.max(0, Math.floor(Number(response && response.totalCount) || 0));
        const hasMore = !!(response && response.hasMore);
        const nextCursor = cloneListCursor(response && response.nextCursor);
        if (pager) {
            if (!pager.pageStartCursors[currentPage - 1]) {
                pager.pageStartCursors[currentPage - 1] = cloneListCursor(effectiveCursor);
            }
            pager.page = currentPage;
            pager.cursor = cloneListCursor(effectiveCursor);
            pager.nextCursor = nextCursor;
            pager.hasMore = hasMore;
            if (hasMore && nextCursor && !pager.pageStartCursors[currentPage]) {
                pager.pageStartCursors[currentPage] = cloneListCursor(nextCursor);
            }
            if (!hasMore) {
                pager.pageStartCursors = pager.pageStartCursors.slice(0, currentPage);
            }
        }

        state.filters.offset = (currentPage - 1) * PAGE_SIZE;
        state.data.list = {
            items: items,
            limit: PAGE_SIZE,
            offset: state.filters.offset,
            totalCount: totalCount,
            hasMore: hasMore,
            nextCursor: nextCursor,
            cursor: effectiveCursor,
            eventRecordsById: eventRecordsById,
            eventRecords: [],
            directDisplayItems: [],
            mode: 'memory'
        };
    }

    /**
     * 加载本地快照列表和当前预览内容。
     */
    async function loadSnapshotData() {
        const client = getClient();
        if (!client) {
            state.notice = '海马体管理台客户端未就绪。';
            state.data.snapshots.items = [];
            state.data.snapshots.preview = null;
            state.data.dehydrateFailures.items = [];
            state.data.attachmentProfile = null;
            state.data.digestOutcomes.items = [];
            return;
        }

        const snapshotsPromise = client.listSnapshots();
        const failuresPromise = typeof client.listDehydrateFailures === 'function'
            ? client.listDehydrateFailures({ charId: state.filters.charId })
            : Promise.resolve([]);
        const attachmentPromise = typeof client.getAttachmentProfile === 'function'
            ? client.getAttachmentProfile(state.filters.charId)
            : Promise.resolve(null);
        const digestPromise = typeof client.listDigestOutcomeRecords === 'function'
            ? client.listDigestOutcomeRecords({ charId: state.filters.charId, hours: 24 })
            : Promise.resolve([]);
        const results = await Promise.all([snapshotsPromise, failuresPromise, attachmentPromise, digestPromise]);
        const snapshots = results[0];
        const failures = results[1];
        const attachmentProfile = results[2];
        const digestOutcomes = results[3];
        state.data.snapshots.items = Array.isArray(snapshots) ? snapshots : [];
        state.data.dehydrateFailures.items = Array.isArray(failures) ? failures : [];
        state.data.attachmentProfile = attachmentProfile && typeof attachmentProfile === 'object'
            ? attachmentProfile
            : null;
        state.data.digestOutcomes.items = Array.isArray(digestOutcomes) ? digestOutcomes : [];
        if (state.expandedDigestOutcomeId) {
            const stillExists = state.data.digestOutcomes.items.some(function hasDigest(item) {
                return toTrimmedString(item && item.id) === state.expandedDigestOutcomeId;
            });
            if (!stillExists) {
                state.expandedDigestOutcomeId = '';
            }
        }

        if (state.data.snapshots.items.length === 0) {
            state.selectedSnapshotId = '';
            state.data.snapshots.preview = null;
            return;
        }

        if (!state.selectedSnapshotId) {
            state.selectedSnapshotId = toTrimmedString(state.data.snapshots.items[0] && state.data.snapshots.items[0].id);
        }

        const preview = state.selectedSnapshotId
            ? await client.getSnapshot(state.selectedSnapshotId)
            : null;

        state.data.snapshots.preview = preview || null;
        if (!preview && state.data.snapshots.items[0]) {
            state.selectedSnapshotId = toTrimmedString(state.data.snapshots.items[0].id);
            state.data.snapshots.preview = await client.getSnapshot(state.selectedSnapshotId);
        }
    }

    /**
     * 执行 JSON 导出，并给出轻量提示。
     */
    async function handleExport(type) {
        const client = getClient();
        if (!client) return;

        const exportType = type === 'filtered' ? 'filtered' : 'full';
        const filters = exportType === 'filtered'
            ? buildFilteredExportFilters()
            : buildFullExportFilters();
        const timestamp = new Date().toISOString();
        const records = await client.exportMemories(filters, { exportType: exportType });
        const payload = client.buildExportPayload(records, filters, { exportType: exportType });
        const filename = client.buildExportFilename('idic-hippocampus-export', filters);
        const ok = client.downloadJsonFile(payload, filename);

        if (ok) {
            client.markLastExportAt(timestamp);
            renderLayout();
            showToastSafe(`已导出 ${Array.isArray(records) ? records.length : 0} 条记忆`, 'success');
            return;
        }

        showToastSafe('导出失败，请稍后重试', 'error');
    }

    /**
     * 基于当前筛选范围生成本地快照。
     */
    async function handleCreateSnapshot() {
        const client = getClient();
        if (!client) return;

        const filters = buildFilteredExportFilters();
        const exportType = hasNarrowFilters(filters) ? 'filtered' : 'full';
        const snapshot = await client.createSnapshotFromFilters(filters, { exportType: exportType });

        if (!snapshot) {
            showToastSafe('本地快照生成失败', 'error');
            return;
        }

        state.selectedSnapshotId = toTrimmedString(snapshot.id);
        showToastSafe(`已生成本地快照，共 ${snapshot.recordCount || 0} 条`, 'success');
        await refreshSnapshotTab();
    }

    /**
     * 导出某一份本地快照为 JSON 文件。
     */
    async function handleExportSnapshot(snapshotId) {
        const client = getClient();
        if (!client) return;

        const ok = await client.downloadSnapshot(snapshotId);
        showToastSafe(ok ? '本地快照已开始下载' : '本地快照导出失败', ok ? 'success' : 'error');
    }

    /**
     * 删除某一份本地快照，删除前做一次轻量确认。
     */
    async function handleDeleteSnapshot(snapshotId) {
        const client = getClient();
        if (!client) return;

        showConfirmSafe(
            '删除本地快照',
            '确定要删除这份本地快照吗？删除后无法恢复。',
            async function handleDeleteSnapshotConfirm() {
                const ok = await client.deleteSnapshot(snapshotId);
                if (!ok) {
                    showToastSafe('删除失败，请稍后重试', 'error');
                    return;
                }

                if (state.selectedSnapshotId === snapshotId) {
                    state.selectedSnapshotId = '';
                }

                showToastSafe('本地快照已删除', 'success');
                await refreshSnapshotTab();
            },
            null,
            '删除',
            '取消',
            true
        );
    }

    /**
     * 对单条脱水失败任务执行一键重试，并回显具体结果。
     */
    async function handleRetryDehydrateFailure(charId, failureId) {
        const client = getClient();
        if (!client || typeof client.retryDehydrateFailure !== 'function') {
            showToastSafe('当前环境不支持脱水重试', 'error');
            return;
        }

        const safeCharId = toTrimmedString(charId);
        const safeFailureId = toTrimmedString(failureId);
        if (!safeCharId || !safeFailureId) {
            showToastSafe('缺少重试参数', 'error');
            return;
        }

        showToastSafe('正在重试脱水任务...', 'info');
        const result = await client.retryDehydrateFailure(safeCharId, safeFailureId);
        if (!result || result.ok !== true) {
            const message = toTrimmedString(result && result.message) || toTrimmedString(result && result.error) || '重试失败';
            showAlertSafe('脱水重试失败', message);
            await refreshSnapshotTab();
            return;
        }

        const extractedCount = Math.max(0, Number(result.extractedCount || 0));
        const writtenCount = Math.max(0, Number(result.writtenCount || 0));
        showToastSafe(`重试完成：提取 ${extractedCount} 条，写入 ${writtenCount} 条`, 'success');
        await refreshSnapshotTab();
    }

    /**
     * 删除一条脱水失败记录，仅清理待重试列表。
     */
    async function handleDeleteDehydrateFailure(charId, failureId) {
        const client = getClient();
        if (!client || typeof client.deleteDehydrateFailure !== 'function') {
            showToastSafe('当前环境不支持删除失败记录', 'error');
            return;
        }

        const safeCharId = toTrimmedString(charId);
        const safeFailureId = toTrimmedString(failureId);
        if (!safeCharId || !safeFailureId) {
            showToastSafe('缺少删除参数', 'error');
            return;
        }

        showConfirmSafe(
            '删除脱水失败记录',
            '确定要删除这条失败记录吗？这只会清理后台待重试队列，不会影响已经写入的记忆。',
            async function handleDeleteDehydrateFailureConfirm() {
                const result = await client.deleteDehydrateFailure(safeCharId, safeFailureId);
                if (!result || result.ok !== true) {
                    const message = toTrimmedString(result && result.message) || toTrimmedString(result && result.error) || '删除失败';
                    showAlertSafe('删除失败记录失败', message);
                    return;
                }

                showToastSafe('失败记录已删除', 'success');
                await refreshSnapshotTab();
            },
            null,
            '删除',
            '取消',
            true
        );
    }

    /**
     * 更新当前角色依恋倾向（手动覆盖）。
     */
    async function handleUpdateAttachmentProfile(style) {
        const client = getClient();
        if (!client || typeof client.updateAttachmentProfile !== 'function') {
            showToastSafe('当前环境暂不支持修改依恋倾向', 'error');
            return;
        }

        const safeCharId = toTrimmedString(state.filters.charId);
        if (!safeCharId) {
            showToastSafe('请先选择角色后再修改依恋倾向', 'info');
            return;
        }

        const normalizedStyle = normalizeAttachmentStyle(style);
        if (!normalizedStyle) {
            showToastSafe('依恋倾向取值不合法', 'error');
            return;
        }

        const result = await client.updateAttachmentProfile(safeCharId, {
            style: normalizedStyle,
            manualOverride: true
        });
        if (!result || result.ok !== true) {
            const message = toTrimmedString(result && (result.message || result.error)) || '依恋倾向更新失败';
            showToastSafe(message, 'error');
            return;
        }

        state.data.attachmentProfile = result.profile && typeof result.profile === 'object'
            ? result.profile
            : state.data.attachmentProfile;
        showToastSafe(`已更新为${formatAttachmentStyleLabel(normalizedStyle)}`, 'success');
        renderLayout();
    }

    /**
     * 在导出页数据中按 ID 查找 digest 成果记录。
     */
    async function submitContinuityForm(formData) {
        const bridge = getBridge();
        if (!bridge || typeof bridge.saveContinuitySnapshot !== 'function') {
            showToastSafe('当前环境暂不支持保存 48h 摘要。', 'error');
            return;
        }
        const charId = toTrimmedString(state.filters.charId);
        if (!charId) {
            showToastSafe('请先选择角色。', 'info');
            return;
        }
        const summaryText = toTrimmedString(formData.get('summaryText'));
        const threadsText = toTrimmedString(formData.get('ongoingThreads'));
        let ongoingThreads = [];
        if (threadsText) {
            try {
                const parsed = JSON.parse(threadsText);
                if (!Array.isArray(parsed)) {
                    showToastSafe('长期状态必须是 JSON 数组。', 'error');
                    return;
                }
                ongoingThreads = parsed;
            } catch (error) {
                showToastSafe('长期状态 JSON 格式错误：' + (error && error.message ? error.message : String(error)), 'error');
                return;
            }
        }
        state.continuityBusy = true;
        renderLayout();
        try {
            const result = await Promise.resolve(bridge.saveContinuitySnapshot(charId, {
                summaryText: summaryText,
                ongoingThreads: ongoingThreads
            }));
            if (!result || result.ok !== true) {
                showToastSafe(toTrimmedString(result && result.error) || '保存 48h 摘要失败。', 'error');
                return;
            }
            showToastSafe('48h 摘要已保存。', 'success');
            await loadContinuityData();
        } catch (error) {
            showToastSafe(error && error.message ? error.message : '保存 48h 摘要失败。', 'error');
        } finally {
            state.continuityBusy = false;
            renderLayout();
        }
    }

    async function handleRetryContinuitySnapshot() {
        const bridge = getBridge();
        if (!bridge || typeof bridge.retryContinuitySnapshot !== 'function') {
            showToastSafe('当前环境暂不支持手动重试 48h 摘要。', 'error');
            return;
        }
        const charId = toTrimmedString(state.filters.charId);
        if (!charId) {
            showToastSafe('请先选择角色。', 'info');
            return;
        }
        state.continuityBusy = true;
        renderLayout();
        try {
            showToastSafe('正在调用主 API 重新生成 48h 摘要...', 'info');
            const result = await Promise.resolve(bridge.retryContinuitySnapshot(charId));
            if (!result || result.ok !== true) {
                const message = toTrimmedString(result && (result.error || result.message)) || '48h 摘要重试失败。';
                showToastSafe(message, 'error');
                await loadContinuityData();
                return;
            }
            showToastSafe(result.skipped ? '48h 摘要暂无需要更新。' : '48h 摘要已重新生成。', result.skipped ? 'info' : 'success');
            await loadContinuityData();
        } catch (error) {
            showToastSafe(error && error.message ? error.message : '48h 摘要重试失败。', 'error');
            await loadContinuityData();
        } finally {
            state.continuityBusy = false;
            renderLayout();
        }
    }

    function findDigestOutcomeById(recordId) {
        const safeId = toTrimmedString(recordId);
        if (!safeId) return null;
        const list = state.data && state.data.digestOutcomes && Array.isArray(state.data.digestOutcomes.items)
            ? state.data.digestOutcomes.items
            : [];
        return list.find(function matchItem(item) {
            return toTrimmedString(item && item.id) === safeId;
        }) || null;
    }

    /**
     * 创建一条新的 24h 消化成果记录。
     */
    async function handleCreateDigestOutcome() {
        const client = getClient();
        if (!client || typeof client.upsertDigestOutcomeRecord !== 'function') {
            showToastSafe('当前环境暂不支持新增 24h 成果', 'error');
            return;
        }

        const safeCharId = toTrimmedString(state.filters.charId);
        if (!safeCharId) {
            showToastSafe('请先选择角色后再新增记录', 'info');
            return;
        }

        if (!root || typeof root.prompt !== 'function') {
            showToastSafe('当前环境不支持输入弹窗', 'error');
            return;
        }

        const summary = toTrimmedString(root.prompt('填写这 24h 给 TA 带来的变化（会展示在后台）', ''));
        if (!summary) return;
        const nowIso = new Date().toISOString();
        const dayAgoIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const currentAttachment = state.data.attachmentProfile && typeof state.data.attachmentProfile === 'object'
            ? normalizeAttachmentStyle(state.data.attachmentProfile.style)
            : '';

        const result = await client.upsertDigestOutcomeRecord(safeCharId, {
            windowStart: dayAgoIso,
            windowEnd: nowIso,
            digestSummary: summary,
            attachmentAfter: currentAttachment
        });
        if (!result || result.ok !== true) {
            showToastSafe('新增失败，请稍后重试', 'error');
            return;
        }

        state.expandedDigestOutcomeId = toTrimmedString(result.record && result.record.id);
        showToastSafe('已新增 24h 成果', 'success');
        await refreshSnapshotTab();
    }

    /**
     * 编辑一条 24h 消化成果记录。
     */
    async function handleEditDigestOutcome(recordId) {
        const record = findDigestOutcomeById(recordId);
        if (!record) {
            showToastSafe('未找到对应成果记录，请刷新后重试', 'error');
            return;
        }
        if (!root || typeof root.prompt !== 'function') {
            showToastSafe('当前环境不支持输入弹窗', 'error');
            return;
        }

        const edited = root.prompt('编辑这条 24h 变化摘要', toTrimmedString(record.digestSummary));
        if (edited === null) return;
        const nextSummary = toTrimmedString(edited);
        if (!nextSummary) {
            showToastSafe('变化摘要不能为空', 'error');
            return;
        }

        await persistDigestOutcomeRecord(record, {
            digestSummary: nextSummary
        }, '已更新 24h 成果');
    }

    /**
     * 将当前 digest 记录与局部修改一起回写，避免多个编辑入口各自重复拼装字段。
     */
    async function persistDigestOutcomeRecord(record, patch, successMessage) {
        const client = getClient();
        if (!client || typeof client.upsertDigestOutcomeRecord !== 'function') {
            showToastSafe('当前环境暂不支持编辑 24h 成果', 'error');
            return false;
        }

        const safeCharId = toTrimmedString(state.filters.charId);
        if (!safeCharId) {
            showToastSafe('请先选择角色后再编辑记录', 'info');
            return false;
        }

        const baseRecord = record && typeof record === 'object' ? record : null;
        if (!baseRecord || !toTrimmedString(baseRecord.id)) {
            showToastSafe('未找到对应成果记录，请刷新后重试', 'error');
            return false;
        }

        const result = await client.upsertDigestOutcomeRecord(safeCharId, Object.assign({
            id: baseRecord.id,
            windowStart: baseRecord.windowStart,
            windowEnd: baseRecord.windowEnd,
            sourceMessageCount: baseRecord.sourceMessageCount,
            attachmentBefore: baseRecord.attachmentBefore,
            attachmentAfter: baseRecord.attachmentAfter,
            selfInsightBefore: baseRecord.selfInsightBefore,
            selfInsightAfter: baseRecord.selfInsightAfter,
            eventChanges: baseRecord.eventChanges,
            fragmentChanges: baseRecord.fragmentChanges,
            digestSummary: baseRecord.digestSummary,
            manualEdited: true
        }, patch && typeof patch === 'object' ? patch : {}));
        if (!result || result.ok !== true) {
            showToastSafe('编辑失败，请稍后重试', 'error');
            return false;
        }

        state.expandedDigestOutcomeId = toTrimmedString(baseRecord.id);
        showToastSafe(successMessage || '已更新 24h 成果', 'success');
        await refreshSnapshotTab();
        return true;
    }

    /**
     * 按字段编辑 digest 详情，支持摘要 / 事件变化 / 碎片变化 / 内在变化分别修订。
     */
    async function handleEditDigestOutcomeField(recordId, fieldKey) {
        const record = findDigestOutcomeById(recordId);
        if (!record) {
            showToastSafe('未找到对应成果记录，请刷新后重试', 'error');
            return;
        }
        if (!root || typeof root.prompt !== 'function') {
            showToastSafe('当前环境不支持输入弹窗', 'error');
            return;
        }

        const fieldConfigMap = {
            digestSummary: {
                label: '编辑这条 24h 变化摘要',
                success: '已更新变化摘要'
            },
            eventChanges: {
                label: '编辑这轮“记忆事件”变化',
                success: '已更新事件变化'
            },
            fragmentChanges: {
                label: '编辑这轮“记忆碎片”变化',
                success: '已更新碎片变化'
            },
            selfInsightAfter: {
                label: '编辑这轮整理后 TA 的新感受 / 新认知',
                success: '已更新内在变化'
            }
        };
        const fieldConfig = fieldConfigMap[fieldKey];
        if (!fieldConfig) return;

        const edited = root.prompt(fieldConfig.label, toTrimmedString(record[fieldKey]));
        if (edited === null) return;

        await persistDigestOutcomeRecord(record, {
            [fieldKey]: toTrimmedString(edited)
        }, fieldConfig.success);
    }

    /**
     * 删除一条 24h 消化成果记录。
     */
    async function handleDeleteDigestOutcome(recordId) {
        const client = getClient();
        if (!client || typeof client.deleteDigestOutcomeRecord !== 'function') {
            showToastSafe('当前环境暂不支持删除 24h 成果', 'error');
            return;
        }

        const safeCharId = toTrimmedString(state.filters.charId);
        if (!safeCharId) {
            showToastSafe('请先选择角色后再删除记录', 'info');
            return;
        }

        const record = findDigestOutcomeById(recordId);
        if (!record) {
            showToastSafe('未找到对应成果记录，请刷新后重试', 'error');
            return;
        }

        showConfirmSafe(
            '删除 24h 成果',
            `确定要删除这条记录吗？\n\n${summarizeContent(record.digestSummary, 60)}`,
            async function confirmDeleteDigestOutcome() {
                const result = await client.deleteDigestOutcomeRecord(safeCharId, recordId);
                if (!result || result.ok !== true) {
                    showToastSafe('删除失败，请稍后重试', 'error');
                    return;
                }
                showToastSafe('已删除 24h 成果', 'success');
                await refreshSnapshotTab();
            },
            null,
            '删除',
            '取消',
            true
        );
    }

    /**
     * 在当前列表分页中按 ID 查找单条记忆，供编辑/删除动作复用。
     */
    function findMemoryInCurrentList(memoryId) {
        const safeMemoryId = toTrimmedString(memoryId);
        if (!safeMemoryId) return null;

        const items = state.data && state.data.list && Array.isArray(state.data.list.items)
            ? state.data.list.items
            : [];

        return items.find(function matchMemory(item) {
            return toTrimmedString(item && item.id) === safeMemoryId;
        }) || null;
    }

    /**
     * 在当前列表和已加载的事件成员缓存里查找记忆条目。
     */
    function findMemoryRecord(memoryId) {
        const safeMemoryId = toTrimmedString(memoryId);
        if (!safeMemoryId) return null;

        const current = findMemoryInCurrentList(safeMemoryId);
        if (current) return current;

        const cache = state.eventMembersCache && typeof state.eventMembersCache === 'object'
            ? state.eventMembersCache
            : {};
        const eventIds = Object.keys(cache);
        for (let index = 0; index < eventIds.length; index += 1) {
            const list = Array.isArray(cache[eventIds[index]]) ? cache[eventIds[index]] : [];
            const matched = list.find(function findCachedMemory(item) {
                return toTrimmedString(item && item.id) === safeMemoryId;
            });
            if (matched) return matched;
        }

        return null;
    }

    /**
     * 读取记忆的 metadata，统一返回普通对象。
     */
    function getMemoryMetadata(memory) {
        return memory && typeof memory.metadata === 'object' && memory.metadata
            ? memory.metadata
            : {};
    }

    function normalizeMetadata(value) {
        return value && typeof value === 'object' && !Array.isArray(value)
            ? Object.assign({}, value)
            : {};
    }

    /**
     * 读取记忆所属事件 ID，兼容顶层字段和 metadata 别名。
     */
    function getMemoryEventId(memory) {
        const safeMemory = memory && typeof memory === 'object' ? memory : {};
        const metadata = getMemoryMetadata(safeMemory);
        return toTrimmedString(
            safeMemory.event_id
            || safeMemory.eventId
            || metadata.event_id
            || metadata.eventId
            || metadata.memory_event_id
            || metadata.cluster_id
            || metadata.memory_cluster_id
        );
    }

    /**
     * 读取事件标题，缺失时返回空串。
     */
    function getMemoryEventTitle(memory) {
        const safeMemory = memory && typeof memory === 'object' ? memory : {};
        const metadata = getMemoryMetadata(safeMemory);
        return toTrimmedString(
            safeMemory.event_title
            || safeMemory.eventTitle
            || metadata.event_title
            || metadata.eventTitle
        );
    }

    /**
     * 读取事件摘要，缺失时返回空串。
     */
    function getMemoryEventSummary(memory) {
        const safeMemory = memory && typeof memory === 'object' ? memory : {};
        const metadata = getMemoryMetadata(safeMemory);
        return toTrimmedString(
            safeMemory.event_summary
            || safeMemory.eventSummary
            || metadata.event_summary
            || metadata.eventSummary
        );
    }

    /**
     * 读取事件深度标签，缺失时返回空串。
     */
    function getMemoryEventDepth(memory) {
        const safeMemory = memory && typeof memory === 'object' ? memory : {};
        const metadata = getMemoryMetadata(safeMemory);
        return toTrimmedString(
            safeMemory.event_depth
            || safeMemory.eventDepth
            || metadata.event_depth
            || metadata.cluster_depth_snapshot
        ).toLowerCase();
    }

    /**
     * 读取事件片段总数提示，缺失时返回 0。
     */
    function getMemoryEventFragmentCount(memory) {
        const safeMemory = memory && typeof memory === 'object' ? memory : {};
        const metadata = getMemoryMetadata(safeMemory);
        const raw = safeMemory.event_fragment_count
            || safeMemory.eventFragmentCount
            || metadata.event_fragment_count
            || metadata.eventFragmentCount
            || metadata.fragment_count
            || 0;
        const count = Math.floor(Number(raw) || 0);
        return count > 0 ? count : 0;
    }

    /**
     * 规整 ID 数组，兼容数组 / 逗号分隔字符串 / 单值。
     */
    function normalizeIdArray(value, maxCount) {
        const numericLimit = Number(maxCount);
        const limit = Number.isFinite(numericLimit) && numericLimit > 0
            ? Math.floor(numericLimit)
            : 24;
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
     * 统一读取碎片级 flashbulb 标记。
     */
    function isMemoryFlashbulb(memory) {
        const safeMemory = memory && typeof memory === 'object' ? memory : {};
        const metadata = getMemoryMetadata(safeMemory);
        return toBoolean(
            safeMemory.is_flashbulb !== undefined && safeMemory.is_flashbulb !== null
                ? safeMemory.is_flashbulb
                : safeMemory.isFlashbulb !== undefined && safeMemory.isFlashbulb !== null
                    ? safeMemory.isFlashbulb
                    : metadata.is_flashbulb
        );
    }

    /**
     * 统一读取事件级 flashbulb 成员列表。
     */
    function getMemoryEventFlashbulbMemoryIds(memory) {
        const safeMemory = memory && typeof memory === 'object' ? memory : {};
        const metadata = getMemoryMetadata(safeMemory);
        return normalizeIdArray(
            safeMemory.event_flashbulb_memory_ids !== undefined
                ? safeMemory.event_flashbulb_memory_ids
                : safeMemory.eventFlashbulbMemoryIds !== undefined
                    ? safeMemory.eventFlashbulbMemoryIds
                    : metadata.event_flashbulb_memory_ids !== undefined
                        ? metadata.event_flashbulb_memory_ids
                        : metadata.eventFlashbulbMemoryIds,
            24
        );
    }

    /**
     * 统一读取事件级 flashbulb 标记。
     */
    function isMemoryEventFlashbulb(memory) {
        const safeMemory = memory && typeof memory === 'object' ? memory : {};
        const metadata = getMemoryMetadata(safeMemory);
        const persistedFlag = toBoolean(
            safeMemory.event_is_flashbulb !== undefined && safeMemory.event_is_flashbulb !== null
                ? safeMemory.event_is_flashbulb
                : safeMemory.eventIsFlashbulb !== undefined && safeMemory.eventIsFlashbulb !== null
                    ? safeMemory.eventIsFlashbulb
                    : metadata.event_is_flashbulb !== undefined && metadata.event_is_flashbulb !== null
                        ? metadata.event_is_flashbulb
                        : metadata.eventIsFlashbulb !== undefined && metadata.eventIsFlashbulb !== null
                            ? metadata.eventIsFlashbulb
                            : metadata.is_flashbulb
        );
        return persistedFlag || getMemoryEventFlashbulbMemoryIds(safeMemory).length > 0;
    }

    function getMemoryEventSignalProfile(memory) {
        const safeMemory = memory && typeof memory === 'object' ? memory : {};
        const metadata = getMemoryMetadata(safeMemory);
        const profile = safeMemory.event_signal_profile && typeof safeMemory.event_signal_profile === 'object'
            ? safeMemory.event_signal_profile
            : (metadata.event_signal_profile && typeof metadata.event_signal_profile === 'object'
                ? metadata.event_signal_profile
                : {});
        return profile && typeof profile === 'object' ? profile : {};
    }

    function normalizeTextArray(value, maxCount) {
        const rawList = Array.isArray(value)
            ? value
            : (typeof value === 'string'
                ? value.split(/[,\n，、;；\s]+/)
                : (value === undefined || value === null ? [] : [value]));
        const limit = Number.isFinite(Number(maxCount)) && Number(maxCount) > 0
            ? Math.floor(Number(maxCount))
            : 12;
        const result = [];
        const seen = new Set();
        rawList.forEach(function appendValue(item) {
            const text = toTrimmedString(item);
            if (!text || seen.has(text)) return;
            seen.add(text);
            if (result.length < limit) {
                result.push(text);
            }
        });
        return result;
    }

    function getMemoryEventSignalTags(memory) {
        const safeMemory = memory && typeof memory === 'object' ? memory : {};
        const metadata = getMemoryMetadata(safeMemory);
        const profile = getMemoryEventSignalProfile(safeMemory);
        return normalizeTextArray(
            (safeMemory.event_signal_tags !== undefined ? safeMemory.event_signal_tags : null)
            || (safeMemory.eventSignalTags !== undefined ? safeMemory.eventSignalTags : null)
            || (metadata.event_signal_tags !== undefined ? metadata.event_signal_tags : null)
            || profile.reasonTags
            || [],
            12
        );
    }

    function getMemoryEventFlashbulbReasonTags(memory) {
        const safeMemory = memory && typeof memory === 'object' ? memory : {};
        const metadata = getMemoryMetadata(safeMemory);
        return normalizeTextArray(
            (safeMemory.event_flashbulb_reason_tags !== undefined ? safeMemory.event_flashbulb_reason_tags : null)
            || (safeMemory.eventFlashbulbReasonTags !== undefined ? safeMemory.eventFlashbulbReasonTags : null)
            || (metadata.event_flashbulb_reason_tags !== undefined ? metadata.event_flashbulb_reason_tags : null)
            || (metadata.eventFlashbulbReasonTags !== undefined ? metadata.eventFlashbulbReasonTags : null)
            || [],
            10
        );
    }

    function getMemoryEventSalienceScore(memory) {
        const safeMemory = memory && typeof memory === 'object' ? memory : {};
        const metadata = getMemoryMetadata(safeMemory);
        const profile = getMemoryEventSignalProfile(safeMemory);
        const raw = safeMemory.event_salience_score !== undefined && safeMemory.event_salience_score !== null
            ? safeMemory.event_salience_score
            : safeMemory.eventSalienceScore !== undefined && safeMemory.eventSalienceScore !== null
                ? safeMemory.eventSalienceScore
                : metadata.event_salience_score !== undefined && metadata.event_salience_score !== null
                    ? metadata.event_salience_score
                    : metadata.salience_score !== undefined && metadata.salience_score !== null
                        ? metadata.salience_score
                        : profile.salienceScore;
        const score = Number(raw);
        return Number.isFinite(score) ? Math.max(0, Math.min(1, score)) : 0;
    }

    function getMemoryEventFlashbulbScore(memory) {
        const safeMemory = memory && typeof memory === 'object' ? memory : {};
        const metadata = getMemoryMetadata(safeMemory);
        const raw = safeMemory.event_flashbulb_score !== undefined && safeMemory.event_flashbulb_score !== null
            ? safeMemory.event_flashbulb_score
            : safeMemory.eventFlashbulbScore !== undefined && safeMemory.eventFlashbulbScore !== null
                ? safeMemory.eventFlashbulbScore
                : metadata.event_flashbulb_score !== undefined && metadata.event_flashbulb_score !== null
                    ? metadata.event_flashbulb_score
                    : metadata.eventFlashbulbScore;
        const score = Number(raw);
        return Number.isFinite(score) ? Math.max(0, Math.min(1, score)) : 0;
    }

    function getMemoryEventVersionHistory(memory) {
        const safeMemory = memory && typeof memory === 'object' ? memory : {};
        const metadata = getMemoryMetadata(safeMemory);
        const raw = safeMemory.event_version_history !== undefined
            ? safeMemory.event_version_history
            : (safeMemory.eventVersionHistory !== undefined
                ? safeMemory.eventVersionHistory
                : (metadata.event_version_history !== undefined
                    ? metadata.event_version_history
                    : metadata.eventVersionHistory));
        return Array.isArray(raw)
            ? raw.filter(function keepEntry(item) {
                return !!item && typeof item === 'object';
            }).slice(-12)
            : [];
    }

    function getMemoryEventManualGuardHistory(memory) {
        const safeMemory = memory && typeof memory === 'object' ? memory : {};
        const metadata = getMemoryMetadata(safeMemory);
        const raw = safeMemory.event_manual_guard_history !== undefined
            ? safeMemory.event_manual_guard_history
            : (safeMemory.eventManualGuardHistory !== undefined
                ? safeMemory.eventManualGuardHistory
                : (metadata.event_manual_guard_history !== undefined
                    ? metadata.event_manual_guard_history
                    : metadata.eventManualGuardHistory));
        return Array.isArray(raw)
            ? raw.filter(function keepEntry(item) {
                return !!item && typeof item === 'object';
            }).slice(-8)
            : [];
    }

    function getMemoryEventManualGuardSnapshot(memory) {
        const safeMemory = memory && typeof memory === 'object' ? memory : {};
        const metadata = getMemoryMetadata(safeMemory);
        const history = getMemoryEventManualGuardHistory(safeMemory);
        const latest = safeMemory.last_event_manual_guard && typeof safeMemory.last_event_manual_guard === 'object'
            ? Object.assign({}, safeMemory.last_event_manual_guard)
            : (metadata.last_event_manual_guard && typeof metadata.last_event_manual_guard === 'object'
                ? Object.assign({}, metadata.last_event_manual_guard)
                : (history.length > 0 ? Object.assign({}, history[history.length - 1]) : null));
        const blockedFields = normalizeTextArray(
            latest && latest.blocked_fields !== undefined
                ? latest.blocked_fields
                : (metadata.event_manual_guard_blocked_fields !== undefined
                    ? metadata.event_manual_guard_blocked_fields
                    : metadata.eventManualGuardBlockedFields),
            8
        );
        return {
            applied: toBoolean(metadata.event_manual_guard_applied),
            historyCount: history.length,
            blockedFields: blockedFields,
            checkedAt: toTrimmedString(latest && (latest.changed_at || latest.checked_at || latest.created_at)),
            hasBlocked: blockedFields.length > 0
        };
    }

    function formatManualGuardFieldLabel(field) {
        const safeField = toTrimmedString(field).toLowerCase();
        const mapping = {
            title: 'title',
            summary: 'summary',
            status: 'status',
            depth: 'depth',
            unresolved: 'unresolved',
            continuation: 'continuation',
            salience: 'salience',
            depth_score: 'depth score'
        };
        return mapping[safeField] || safeField;
    }

    function buildEventManualGuardHint(memory) {
        const snapshot = getMemoryEventManualGuardSnapshot(memory);
        if (!snapshot.applied && !snapshot.hasBlocked && snapshot.historyCount <= 0) return '';
        if (snapshot.hasBlocked) {
            const checkedAtText = snapshot.checkedAt ? formatTimeAgo(snapshot.checkedAt) : '刚刚';
            return `最近一次人工保护发生在 ${checkedAtText}，拦下了：${snapshot.blockedFields.map(formatManualGuardFieldLabel).join('、')}`;
        }
        if (snapshot.historyCount > 0) {
            return `这条事件正在人工保护中，历史里保留了 ${snapshot.historyCount} 次被拦下的自动改写。`;
        }
        return '这条事件做过人工编辑，当前不会被自动整理直接覆盖。';
    }

    function getMemoryReconsolidationSnapshot(memory) {
        const safeMemory = memory && typeof memory === 'object' ? memory : {};
        const metadata = getMemoryMetadata(safeMemory);
        const guard = metadata.last_reconsolidation_guard && typeof metadata.last_reconsolidation_guard === 'object'
            ? Object.assign({}, metadata.last_reconsolidation_guard)
            : {};
        const guardHistory = Array.isArray(metadata.reconsolidation_guard_history)
            ? metadata.reconsolidation_guard_history.filter(function keepEntry(item) {
                return !!item && typeof item === 'object';
            }).slice(-8)
            : [];
        const skippedReason = toTrimmedString(metadata.last_reconsolidation_skipped_reason).toLowerCase();

        let status = toTrimmedString(guard.status).toLowerCase();
        if (status === 'event_refresh') {
            status = 'accepted';
        }
        if (status !== 'accepted' && status !== 'rejected') {
            if (toTrimmedString(metadata.last_reconsolidated_at)) {
                status = 'accepted';
            } else if (skippedReason || toTrimmedString(metadata.last_reconsolidation_skipped_at)) {
                status = 'rejected';
            } else {
                status = '';
            }
        }

        const keywordCoverageValue = Number(
            guard.keyword_coverage !== undefined
                ? guard.keyword_coverage
                : NaN
        );

        return {
            status: status,
            checkedAt: toTrimmedString(
                metadata.last_reconsolidation_skipped_at
                || metadata.last_reconsolidated_at
                || metadata.last_reconsolidation_attempt_at
                || guard.checked_at
            ),
            skippedReason: skippedReason,
            strategy: toTrimmedString(
                metadata.last_reconsolidation_strategy
                || guard.mode
            ).toLowerCase(),
            targetRole: toTrimmedString(
                metadata.last_reconsolidation_target_role
                || guard.target_role
            ).toLowerCase(),
            guardLevel: toTrimmedString(guard.guard_level).toLowerCase(),
            contextFragmentCount: Math.max(
                0,
                Math.floor(Number(metadata.last_reconsolidation_context_fragment_count) || 0)
            ),
            reasonTags: normalizeTextArray(metadata.last_reconsolidation_reason_tags, 8),
            guardReasons: normalizeTextArray(guard.reasons, 6),
            keywordCoverage: Number.isFinite(keywordCoverageValue)
                ? Math.max(0, Math.min(1, keywordCoverageValue))
                : null,
            historyCount: guardHistory.length
        };
    }

    function humanizeReconsolidationMode(mode) {
        const safeMode = toTrimmedString(mode).toLowerCase();
        const mapping = {
            fragment_strict: '单条谨慎改写',
            event_deep: '带上下文改写',
            event_refresh: '顺手刷新事件摘要'
        };
        return mapping[safeMode] || '';
    }

    function humanizeReconsolidationTargetRole(role) {
        const safeRole = toTrimmedString(role).toLowerCase();
        const mapping = {
            anchor: '事件锚点',
            detail: '事件细节',
            flashbulb_detail: '高冲击细节',
            member: '事件成员'
        };
        return mapping[safeRole] || '';
    }

    function humanizeReconsolidationGuardLevel(level) {
        const safeLevel = toTrimmedString(level).toLowerCase();
        if (safeLevel === 'strict') return '严格护栏';
        if (safeLevel === 'balanced') return '常规护栏';
        return '';
    }

    function humanizeReconsolidationReason(reason) {
        const safeReason = toTrimmedString(reason).toLowerCase();
        const mapping = {
            empty_rewrite: '返回内容为空',
            no_meaningful_change: '改写后几乎没有有效变化',
            summary_copy_risk: '返回内容过于贴近事件摘要',
            reference_copy_risk: '返回内容过于贴近其他碎片',
            over_expanded: '改写扩写过度',
            over_compressed: '改写压缩过头',
            fact_drift_risk: '存在事实漂移风险',
            anchor_drift_risk: '锚点细节偏移风险',
            guard_rejected: '被改写护栏拦下'
        };
        return mapping[safeReason] || '';
    }

    function humanizeReconsolidationScope(scope) {
        const safeScope = toTrimmedString(scope).toLowerCase();
        if (safeScope === 'event_batch') return '整件事一起改';
        if (safeScope === 'single_fragment') return '只改这一条';
        return '';
    }

    function buildManualReconBusyKey(kind, id) {
        return `${toTrimmedString(kind)}:${toTrimmedString(id)}`;
    }

    function isManualReconBusy(kind, id) {
        const safeId = toTrimmedString(id);
        if (!safeId) return false;
        return state.reconsolidationBusyKey === buildManualReconBusyKey(kind, safeId);
    }

    function describeManualReconResult(result) {
        const safeResult = result && typeof result === 'object' ? result : {};
        const strategyLabel = humanizeReconsolidationMode(safeResult.strategy) || toTrimmedString(safeResult.strategy);
        const scopeLabel = humanizeReconsolidationScope(safeResult.scope) || toTrimmedString(safeResult.scope);
        const skippedReasonLabel = humanizeReconsolidationReason(safeResult.skippedReason) || toTrimmedString(safeResult.skippedReason);
        const lines = [
            `目标：${safeResult.targetKind === 'event' ? '整起事件' : '单条记忆'}`,
            `激活命中：${Math.max(0, Math.floor(toFiniteNumber(safeResult.activatedCount, 0)))} 条`
        ];

        if (safeResult.reconstructed) {
            lines.push(`已改写：${Math.max(0, Math.floor(toFiniteNumber(safeResult.reconstructedCount, 0)))} 条`);
            if (Math.max(0, Math.floor(toFiniteNumber(safeResult.rejectedCount, 0))) > 0) {
                lines.push(`被护栏拦下：${Math.max(0, Math.floor(toFiniteNumber(safeResult.rejectedCount, 0)))} 条`);
            }
            if (strategyLabel) {
                lines.push(`策略：${strategyLabel}`);
            }
            if (scopeLabel) {
                lines.push(`范围：${scopeLabel}`);
            }
        } else {
            lines.push('结果：本次没有落库');
            if (skippedReasonLabel) {
                lines.push(`原因：${skippedReasonLabel}`);
            }
        }

        return lines.join('\n');
    }

    function renderMemoryReconsolidationHint(memory) {
        const snapshot = getMemoryReconsolidationSnapshot(memory);
        if (!snapshot.status) return '';

        const strategyLabel = humanizeReconsolidationMode(snapshot.strategy);
        const roleLabel = humanizeReconsolidationTargetRole(snapshot.targetRole);
        const guardLabel = humanizeReconsolidationGuardLevel(snapshot.guardLevel);
        const checkedAtText = snapshot.checkedAt
            ? formatTimeAgo(snapshot.checkedAt)
            : '刚刚';
        const reasonLabels = (snapshot.guardReasons.length > 0
            ? snapshot.guardReasons
            : (snapshot.skippedReason ? [snapshot.skippedReason] : [])
        ).map(humanizeReconsolidationReason).filter(Boolean);
        const summaryText = snapshot.status === 'accepted'
            ? `最近一次改写已写回：${checkedAtText}${strategyLabel ? `，采用${strategyLabel}` : ''}${roleLabel ? `，目标是${roleLabel}` : ''}。`
            : `最近一次改写被跳过：${checkedAtText}${reasonLabels.length > 0 ? `，原因是${reasonLabels.join('、')}` : ''}。`;
        const detailParts = [];
        if (strategyLabel) detailParts.push(`策略：${strategyLabel}`);
        if (roleLabel) detailParts.push(`目标：${roleLabel}`);
        if (guardLabel) detailParts.push(`护栏：${guardLabel}`);
        if (snapshot.contextFragmentCount > 0) detailParts.push(`上下文：${snapshot.contextFragmentCount} 条`);
        if (snapshot.keywordCoverage !== null) detailParts.push(`关键词覆盖：${Math.round(snapshot.keywordCoverage * 100)}%`);
        if (snapshot.historyCount > 0) detailParts.push(`拒绝留痕：${snapshot.historyCount} 次`);

        const tags = [
            `<span class="hip-tag">${snapshot.status === 'accepted' ? '已改写回写' : '已跳过改写'}</span>`
        ];
        if (strategyLabel) {
            tags.push(`<span class="hip-tag">${escapeHtml(strategyLabel)}</span>`);
        }
        if (roleLabel) {
            tags.push(`<span class="hip-tag">${escapeHtml(roleLabel)}</span>`);
        }
        reasonLabels.slice(0, 3).forEach(function pushReasonTag(label) {
            tags.push(`<span class="hip-tag">${escapeHtml(label)}</span>`);
        });

        return `
            <div class="hip-memory-reconsolidation">
                <div class="hip-tags">${tags.join('')}</div>
                <div class="hip-card-reason">${escapeHtml(summaryText)}</div>
                ${detailParts.length > 0 ? `<div class="hip-card-reason">${escapeHtml(detailParts.join(' · '))}</div>` : ''}
            </div>
        `;
    }

    function getMemoryRewriteHistory(memory) {
        const safeMemory = memory && typeof memory === 'object' ? memory : {};
        const metadata = getMemoryMetadata(safeMemory);
        const raw = Array.isArray(metadata.history) ? metadata.history : [];
        return raw.filter(function keepEntry(item) {
            return !!item && typeof item === 'object' && toTrimmedString(item.content);
        }).slice(-6);
    }

    function getMemoryReconGuardHistory(memory) {
        const safeMemory = memory && typeof memory === 'object' ? memory : {};
        const metadata = getMemoryMetadata(safeMemory);
        const raw = Array.isArray(metadata.reconsolidation_guard_history)
            ? metadata.reconsolidation_guard_history
            : [];
        return raw.filter(function keepEntry(item) {
            return !!item && typeof item === 'object';
        }).slice(-6);
    }

    function formatAuditPercent(value) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) return '';
        return `${Math.round(Math.max(0, Math.min(1, numeric)) * 100)}%`;
    }

    function formatAuditRatio(value) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric) || numeric <= 0) return '';
        return `${numeric.toFixed(2)}x`;
    }

    function formatAuditIdPreview(values, limit) {
        const ids = normalizeIdArray(values, 24);
        if (ids.length <= 0) return 'none';
        const capped = ids.slice(0, Math.max(1, Math.floor(toFiniteNumber(limit, 3))));
        return capped.join(', ') + (ids.length > capped.length ? ` +${ids.length - capped.length}` : '');
    }

    function buildAuditIdDeltaText(beforeIds, afterIds) {
        const before = normalizeIdArray(beforeIds, 24);
        const after = normalizeIdArray(afterIds, 24);
        const beforeSet = new Set(before);
        const afterSet = new Set(after);
        const added = after.filter(function keepAdded(id) {
            return !beforeSet.has(id);
        });
        const removed = before.filter(function keepRemoved(id) {
            return !afterSet.has(id);
        });
        const parts = [];
        if (added.length > 0) parts.push(`+ ${formatAuditIdPreview(added, 3)}`);
        if (removed.length > 0) parts.push(`- ${formatAuditIdPreview(removed, 3)}`);
        return parts.join(' | ');
    }

    function renderAuditTextBlock(label, value, options) {
        const source = options && typeof options === 'object' ? options : {};
        const safeLabel = toTrimmedString(label) || 'Text';
        const fallback = source.fallback !== undefined ? source.fallback : 'empty';
        const rawText = toTrimmedString(value);
        const text = rawText || toTrimmedString(fallback) || 'empty';
        const displayText = source.maxLength && text.length > source.maxLength
            ? summarizeContent(text, source.maxLength)
            : text;
        return `
            <div class="hip-audit-block">
                <div class="hip-audit-label">${escapeHtml(safeLabel)}</div>
                <div class="hip-audit-value">${escapeHtml(displayText).replace(/\n/g, '<br>')}</div>
            </div>
        `;
    }

    function renderAuditChangeRow(label, beforeValue, afterValue, options) {
        const source = options && typeof options === 'object' ? options : {};
        const safeLabel = toTrimmedString(label);
        const beforeText = toTrimmedString(beforeValue);
        const afterText = toTrimmedString(afterValue);
        if (source.hideWhenSame && beforeText === afterText) {
            return '';
        }
        return `
            <div class="hip-audit-change-row">
                <div class="hip-audit-change-label">${escapeHtml(safeLabel || 'Change')}</div>
                <div class="hip-audit-change-values">
                    <span class="hip-audit-inline before">${escapeHtml(beforeText || 'empty')}</span>
                    <span class="hip-audit-inline-arrow">-&gt;</span>
                    <span class="hip-audit-inline after">${escapeHtml(afterText || 'empty')}</span>
                </div>
            </div>
        `;
    }

    function buildMemoryRewriteAuditEntries(memory) {
        const safeMemory = memory && typeof memory === 'object' ? memory : {};
        const currentContent = toTrimmedString(safeMemory.content);
        const history = getMemoryRewriteHistory(safeMemory);
        return history.map(function mapEntry(entry, index) {
            const nextEntry = history[index + 1] || null;
            const beforeContent = toTrimmedString(entry && entry.content);
            const afterContent = toTrimmedString(nextEntry && nextEntry.content) || currentContent;
            return {
                changedAt: toTrimmedString(entry && (entry.reconstructed_at || entry.changed_at || entry.created_at)),
                beforeContent: beforeContent,
                afterContent: afterContent,
                strategy: toTrimmedString(entry && entry.strategy).toLowerCase(),
                targetRole: toTrimmedString(entry && entry.target_role).toLowerCase(),
                scope: toTrimmedString(entry && entry.scope).toLowerCase(),
                contextFragmentCount: Math.max(0, Math.floor(toFiniteNumber(entry && entry.context_fragment_count, 0))),
                batchSize: Math.max(0, Math.floor(toFiniteNumber(entry && entry.batch_size, 0))),
                batchIndex: Math.max(0, Math.floor(toFiniteNumber(entry && entry.batch_index, 0))),
                eventId: toTrimmedString(entry && entry.event_id)
            };
        }).filter(function keepEntry(entry) {
            return !!entry.beforeContent || !!entry.afterContent;
        });
    }

    function renderMemoryReconAuditPanel(memory) {
        const rewrites = buildMemoryRewriteAuditEntries(memory).slice(-4).reverse();
        const guardHistory = getMemoryReconGuardHistory(memory).slice(-4).reverse();
        const totalCount = rewrites.length + guardHistory.length;
        if (totalCount <= 0) return '';

        const rewriteHtml = rewrites.map(function renderRewrite(entry) {
            const tags = ['改写已通过'];
            const strategyLabel = humanizeReconsolidationMode(entry.strategy) || entry.strategy;
            const roleLabel = humanizeReconsolidationTargetRole(entry.targetRole) || entry.targetRole;
            const scopeLabel = humanizeReconsolidationScope(entry.scope) || entry.scope;
            if (strategyLabel) tags.push(strategyLabel);
            if (roleLabel) tags.push(roleLabel);
            if (scopeLabel) tags.push(scopeLabel);
            const metaParts = [];
            if (entry.changedAt) metaParts.push(formatTimeAgo(entry.changedAt));
            if (entry.contextFragmentCount > 0) metaParts.push(`参考上下文 ${entry.contextFragmentCount} 条`);
            if (entry.batchSize > 0) metaParts.push(`批次 ${entry.batchIndex > 0 ? `${entry.batchIndex}/` : ''}${entry.batchSize}`);
            if (entry.eventId) metaParts.push(`关联事件 ${entry.eventId.slice(0, 8)}`);
            return `
                <div class="hip-audit-entry">
                    <div class="hip-tags">${renderUniqueHipTags(tags, 6)}</div>
                    ${metaParts.length > 0 ? `<div class="hip-audit-meta-line">${escapeHtml(metaParts.join(' | '))}</div>` : ''}
                    <div class="hip-audit-grid">
                        ${renderAuditTextBlock('改写前', entry.beforeContent, { fallback: '（空）', maxLength: 240 })}
                        <div class="hip-audit-arrow">-&gt;</div>
                        ${renderAuditTextBlock('改写后', entry.afterContent, { fallback: '（空）', maxLength: 240 })}
                    </div>
                </div>
            `;
        }).join('');

        const guardHtml = guardHistory.map(function renderGuard(entry) {
            const changedAt = toTrimmedString(entry && (entry.changed_at || entry.created_at));
            const strategy = toTrimmedString(entry && entry.strategy).toLowerCase();
            const targetRole = toTrimmedString(entry && entry.target_role).toLowerCase();
            const guardLevel = toTrimmedString(entry && entry.guard_level).toLowerCase();
            const tags = ['护栏拦下'];
            const strategyLabel = humanizeReconsolidationMode(strategy) || strategy;
            const roleLabel = humanizeReconsolidationTargetRole(targetRole) || targetRole;
            const levelLabel = humanizeReconsolidationGuardLevel(guardLevel) || guardLevel;
            if (levelLabel) tags.push(levelLabel);
            if (strategyLabel) tags.push(strategyLabel);
            if (roleLabel) tags.push(roleLabel);
            normalizeTextArray(entry && entry.reasons, 4).forEach(function pushReason(reason) {
                const label = humanizeReconsolidationReason(reason) || reason;
                if (label) tags.push(label);
            });
            const stats = [];
            const keywordCoverage = formatAuditPercent(entry && entry.keyword_coverage);
            const originalSimilarity = formatAuditPercent(entry && entry.original_similarity);
            const lengthRatio = formatAuditRatio(entry && entry.length_ratio);
            if (changedAt) stats.push(formatTimeAgo(changedAt));
            if (originalSimilarity) stats.push(`原文相似度 ${originalSimilarity}`);
            if (keywordCoverage) stats.push(`关键词覆盖 ${keywordCoverage}`);
            if (lengthRatio) stats.push(`长度比 ${lengthRatio}`);
            return `
                <div class="hip-audit-entry is-rejected">
                    <div class="hip-tags">${renderUniqueHipTags(tags, 8)}</div>
                    ${stats.length > 0 ? `<div class="hip-audit-meta-line">${escapeHtml(stats.join(' | '))}</div>` : ''}
                </div>
            `;
        }).join('');

        return `
            <div class="hip-audit-panel">
                <div class="hip-audit-head">
                    <div class="hip-audit-title">这条记忆最近被怎么改过</div>
                    <span class="hip-grounding-pill">${totalCount} 条</span>
                </div>
                <div class="hip-audit-summary">这里会展示最近几次改写成功的结果，以及哪些自动改写被护栏挡下了。</div>
                ${rewriteHtml ? `<div class="hip-audit-section-title">已经通过的改写</div>${rewriteHtml}` : ''}
                ${guardHtml ? `<div class="hip-audit-section-title">被护栏挡下的改写</div>${guardHtml}` : ''}
            </div>
        `;
    }

    function buildEventVersionEntryMetaParts(entry) {
        const safeEntry = entry && typeof entry === 'object' ? entry : {};
        const parts = [];
        const changedAt = toTrimmedString(
            safeEntry.changed_at
            || safeEntry.created_at
            || safeEntry.refreshed_at
        );
        if (changedAt) parts.push(formatTimeAgo(changedAt));
        const manualNote = toTrimmedString(safeEntry.manual_note);
        if (manualNote) parts.push(`备注：${summarizeContent(manualNote, 56)}`);
        const memberPreview = toTrimmedString(safeEntry.member_preview);
        if (memberPreview) parts.push(`成员：${summarizeContent(memberPreview, 48)}`);
        const sourceEventTitle = toTrimmedString(safeEntry.source_event_title);
        if (sourceEventTitle) parts.push(`来源：${summarizeContent(sourceEventTitle, 36)}`);
        return parts;
    }

    function renderEventVersionHistoryPanel(memory) {
        const history = getMemoryEventVersionHistory(memory).slice(-6).reverse();
        if (history.length <= 0) return '';

        const historyHtml = history.map(function renderVersionEntry(entry) {
            const tags = [humanizeEventVersionSource(entry && entry.source)];
            normalizeTextArray(entry && entry.change_fields, 6).forEach(function pushField(field) {
                tags.push(formatEventVersionFieldLabel(field));
            });
            const rows = [
                renderAuditChangeRow('标题', entry && entry.previous_title, entry && entry.next_title, { hideWhenSame: true }),
                renderAuditChangeRow('摘要', entry && entry.previous_summary, entry && entry.next_summary, { hideWhenSame: true }),
                renderAuditChangeRow('状态', entry && entry.previous_status, entry && entry.next_status, { hideWhenSame: true }),
                renderAuditChangeRow('深浅', entry && entry.previous_depth, entry && entry.next_depth, { hideWhenSame: true }),
                renderAuditChangeRow('是否未了结', String(!!(entry && entry.previous_unresolved)), String(!!(entry && entry.next_unresolved)), { hideWhenSame: true }),
                renderAuditChangeRow('延续线索', entry && entry.previous_continuation_key, entry && entry.next_continuation_key, { hideWhenSame: true }),
                renderAuditChangeRow('主锚点', entry && entry.previous_anchor_memory_id, entry && entry.next_anchor_memory_id, { hideWhenSame: true }),
                renderAuditChangeRow('事件日期', entry && entry.previous_event_date, entry && entry.next_event_date, { hideWhenSame: true }),
                renderAuditChangeRow('成员数', entry && entry.previous_fragment_count, entry && entry.next_fragment_count, { hideWhenSame: true }),
                renderAuditChangeRow('高冲击标记', String(!!(entry && entry.previous_flashbulb)), String(!!(entry && entry.next_flashbulb)), { hideWhenSame: true })
            ].filter(Boolean);
            const flashbulbDelta = buildAuditIdDeltaText(
                entry && entry.previous_flashbulb_memory_ids,
                entry && entry.next_flashbulb_memory_ids
            );
            if (flashbulbDelta) {
                rows.push(`
                    <div class="hip-audit-change-row">
                        <div class="hip-audit-change-label">高冲击成员变化</div>
                        <div class="hip-audit-meta-line">${escapeHtml(flashbulbDelta)}</div>
                    </div>
                `);
            }
            const detailDelta = buildAuditIdDeltaText(
                entry && entry.previous_detail_memory_ids,
                entry && entry.next_detail_memory_ids
            );
            if (detailDelta) {
                rows.push(`
                    <div class="hip-audit-change-row">
                        <div class="hip-audit-change-label">细节成员变化</div>
                        <div class="hip-audit-meta-line">${escapeHtml(detailDelta)}</div>
                    </div>
                `);
            }
            const metaParts = buildEventVersionEntryMetaParts(entry);
            return `
                <div class="hip-audit-entry">
                    <div class="hip-tags">${renderUniqueHipTags(tags, 8)}</div>
                    ${metaParts.length > 0 ? `<div class="hip-audit-meta-line">${escapeHtml(metaParts.join(' | '))}</div>` : ''}
                    ${rows.length > 0 ? `<div class="hip-audit-changes">${rows.join('')}</div>` : '<div class="hip-audit-meta-line">这次改动没有留下字段级差异记录。</div>'}
                </div>
            `;
        }).join('');

        return `
            <div class="hip-audit-panel">
                <div class="hip-audit-head">
                    <div class="hip-audit-title">这件事最近改了什么</div>
                    <span class="hip-grounding-pill">${history.length} 条</span>
                </div>
                <div class="hip-audit-summary">这里会按时间列出这件事最近的标题、摘要、成员、状态变化。</div>
                ${historyHtml}
            </div>
        `;
    }

    function toFiniteNumber(value, fallback) {
        const numeric = Number(value);
        if (Number.isFinite(numeric)) return numeric;
        const fallbackNumber = Number(fallback);
        return Number.isFinite(fallbackNumber) ? fallbackNumber : 0;
    }

    function normalizeGroundingRatio(value) {
        const numeric = Number(value);
        return Number.isFinite(numeric)
            ? Math.max(0, Math.min(1, numeric))
            : null;
    }

    function normalizeGroundingCount(value) {
        return Math.max(0, Math.floor(toFiniteNumber(value, 0)));
    }

    function normalizeGroundingIndexArray(value, maxCount) {
        const rawList = Array.isArray(value)
            ? value
            : (typeof value === 'string'
                ? value.split(/[,\n，、;；\s]+/)
                : (value === undefined || value === null ? [] : [value]));
        const limit = Math.max(1, Math.floor(toFiniteNumber(maxCount, 12)));
        const result = [];
        const seen = new Set();
        rawList.forEach(function appendIndex(item) {
            const numeric = Math.floor(Number(item));
            if (!Number.isFinite(numeric) || numeric < 0 || seen.has(numeric)) return;
            seen.add(numeric);
            if (result.length < limit) {
                result.push(numeric);
            }
        });
        return result.sort(function sortIndex(left, right) {
            return left - right;
        });
    }

    function normalizeIdList(value, maxCount) {
        const source = Array.isArray(value)
            ? value
            : (value === undefined || value === null ? [] : [value]);
        const limit = Math.max(1, Math.floor(toFiniteNumber(maxCount, 200)));
        const result = [];
        const seen = new Set();

        for (let index = 0; index < source.length; index += 1) {
            const id = toTrimmedString(source[index]);
            if (!id || seen.has(id)) continue;
            seen.add(id);
            result.push(id);
            if (result.length >= limit) break;
        }

        return result;
    }

    function humanizeGroundingTier(tier, fallbackLabel) {
        const safeTier = toTrimmedString(tier).toLowerCase();
        if (safeTier === 'strong') return '对得很上';
        if (safeTier === 'medium') return '大体对得上';
        if (safeTier === 'weak') return '只对上一点';
        return toTrimmedString(fallbackLabel) || '还没校对';
    }

    function formatGroundingPercent(value) {
        const numeric = normalizeGroundingRatio(value);
        return numeric === null ? '暂无' : `${Math.round(numeric * 100)}%`;
    }

    function formatGroundingHistoryIndexLabel(index) {
        const numeric = Math.floor(Number(index));
        if (!Number.isFinite(numeric) || numeric < 0) return '';
        return `#${numeric + 1}`;
    }

    function formatActivationCount(value) {
        return String(Math.max(0, Math.round(toFiniteNumber(value, 0))));
    }

    function renderUniqueHipTags(tagTexts, maxCount) {
        return normalizeTextArray(tagTexts, maxCount).map(function renderTag(tagText) {
            return `<span class="hip-tag">${escapeHtml(tagText)}</span>`;
        }).join('');
    }

    function getMemoryGroundingSupport(memory) {
        const safeMemory = memory && typeof memory === 'object' ? memory : {};
        const metadata = getMemoryMetadata(safeMemory);
        const raw = safeMemory.grounding_support && typeof safeMemory.grounding_support === 'object'
            ? safeMemory.grounding_support
            : (metadata.grounding_support && typeof metadata.grounding_support === 'object'
                ? metadata.grounding_support
                : null);
        const sourceHistoryIndexes = normalizeGroundingIndexArray(
            raw && raw.source_history_indexes !== undefined
                ? raw.source_history_indexes
                : safeMemory.source_history_indexes,
            16
        );
        if (!raw && sourceHistoryIndexes.length <= 0) return null;

        return {
            available: true,
            tier: toTrimmedString(raw && raw.tier).toLowerCase(),
            coverage: normalizeGroundingRatio(raw && raw.coverage),
            phraseCoverage: normalizeGroundingRatio(
                raw && (raw.phrase_coverage !== undefined ? raw.phrase_coverage : raw.phraseCoverage)
            ),
            matchedRows: normalizeGroundingCount(raw && (raw.matched_rows !== undefined ? raw.matched_rows : raw.matchedRows)),
            strongRows: normalizeGroundingCount(raw && (raw.strong_rows !== undefined ? raw.strong_rows : raw.strongRows)),
            matchedTokens: normalizeGroundingCount(raw && (raw.matched_tokens !== undefined ? raw.matched_tokens : raw.matchedTokens)),
            totalTokens: normalizeGroundingCount(raw && (raw.total_tokens !== undefined ? raw.total_tokens : raw.totalTokens)),
            matchedPhrases: normalizeGroundingCount(raw && (raw.matched_phrases !== undefined ? raw.matched_phrases : raw.matchedPhrases)),
            totalPhrases: normalizeGroundingCount(raw && (raw.total_phrases !== undefined ? raw.total_phrases : raw.totalPhrases)),
            bestScore: normalizeGroundingCount(raw && (raw.best_score !== undefined ? raw.best_score : raw.bestScore)),
            sourceHistoryIndexes: sourceHistoryIndexes
        };
    }

    function renderGroundingStatItem(label, value) {
        const safeLabel = toTrimmedString(label);
        const safeValue = toTrimmedString(value);
        if (!safeLabel || !safeValue) return '';
        return `
            <div class="hip-grounding-stat">
                <span class="hip-grounding-stat-label">${escapeHtml(safeLabel)}</span>
                <strong>${escapeHtml(safeValue)}</strong>
            </div>
        `;
    }

    function renderGroundingIndexTags(indexes) {
        const safeIndexes = normalizeGroundingIndexArray(indexes, 12);
        if (safeIndexes.length <= 0) return '';
        return `
            <div class="hip-grounding-rows">
                ${safeIndexes.map(function mapIndex(index) {
                    return `<span class="hip-grounding-row-tag">${escapeHtml(formatGroundingHistoryIndexLabel(index))}</span>`;
                }).join('')}
            </div>
        `;
    }

    function buildGroundingSupportHint(snapshot) {
        const safeSnapshot = snapshot && typeof snapshot === 'object' ? snapshot : null;
        if (!safeSnapshot || safeSnapshot.available !== true) {
            return '这条记录还没做过原聊天校对，可能是旧数据。';
        }
        const parts = [`这条记忆和原聊天${humanizeGroundingTier(safeSnapshot.tier, '能对上')}`];
        if (safeSnapshot.coverage !== null) {
            parts.push(`关键词对上了 ${formatGroundingPercent(safeSnapshot.coverage)}`);
        }
        if (safeSnapshot.phraseCoverage !== null) {
            parts.push(`原话片段对上了 ${formatGroundingPercent(safeSnapshot.phraseCoverage)}`);
        }
        if (safeSnapshot.matchedRows > 0) {
            parts.push(`能对应到 ${safeSnapshot.matchedRows} 条聊天`);
        }
        if (safeSnapshot.sourceHistoryIndexes.length > 0) {
            parts.push(`对应原文 ${safeSnapshot.sourceHistoryIndexes.map(formatGroundingHistoryIndexLabel).join(' ')}`);
        }
        return parts.join(' · ');
    }

    function renderGroundingSupportPanel(snapshot, options) {
        const safeOptions = options && typeof options === 'object' ? options : {};
        const safeSnapshot = snapshot && typeof snapshot === 'object' ? snapshot : null;
        const title = toTrimmedString(safeOptions.title) || '这条记录和原聊天对得上吗';
        const emptyText = toTrimmedString(safeOptions.emptyText)
            || '这条记录还没做过原聊天校对，可能是旧数据。';
        const showEmpty = safeOptions.showEmpty !== false;

        if (!safeSnapshot || safeSnapshot.available !== true) {
            if (!showEmpty) return '';
            return `
                <div class="hip-grounding-panel is-empty">
                    <div class="hip-grounding-head">
                        <div class="hip-grounding-title">${escapeHtml(title)}</div>
                        <span class="hip-grounding-pill is-empty">还没校对</span>
                    </div>
                    <div class="hip-grounding-summary">${escapeHtml(emptyText)}</div>
                </div>
            `;
        }

        const tierClass = safeSnapshot.tier === 'strong'
            ? 'is-strong'
            : (safeSnapshot.tier === 'medium' ? 'is-medium' : (safeSnapshot.tier === 'weak' ? 'is-weak' : 'is-empty'));
        const stats = [
            renderGroundingStatItem('关键词对上', formatGroundingPercent(safeSnapshot.coverage)),
            renderGroundingStatItem('原话片段对上', formatGroundingPercent(safeSnapshot.phraseCoverage)),
            safeSnapshot.matchedRows > 0 ? renderGroundingStatItem('对应聊天', String(safeSnapshot.matchedRows)) : '',
            safeSnapshot.strongRows > 0 ? renderGroundingStatItem('高把握命中', String(safeSnapshot.strongRows)) : '',
            safeSnapshot.totalTokens > 0 ? renderGroundingStatItem('对上关键词', `${safeSnapshot.matchedTokens}/${safeSnapshot.totalTokens}`) : '',
            safeSnapshot.totalPhrases > 0 ? renderGroundingStatItem('对上片段', `${safeSnapshot.matchedPhrases}/${safeSnapshot.totalPhrases}`) : ''
        ].filter(Boolean).join('');

        return `
            <div class="hip-grounding-panel ${tierClass}">
                <div class="hip-grounding-head">
                    <div class="hip-grounding-title">${escapeHtml(title)}</div>
                    <span class="hip-grounding-pill ${tierClass}">${escapeHtml(humanizeGroundingTier(safeSnapshot.tier))}</span>
                </div>
                <div class="hip-grounding-summary">${escapeHtml(buildGroundingSupportHint(safeSnapshot))}</div>
                ${stats ? `<div class="hip-grounding-stats">${stats}</div>` : ''}
                ${renderGroundingIndexTags(safeSnapshot.sourceHistoryIndexes)}
            </div>
        `;
    }

    function deriveEventGroundingOverview(eventItem, members, options) {
        const safeEvent = eventItem && typeof eventItem === 'object' ? eventItem : {};
        const safeMembers = Array.isArray(members) ? members.filter(Boolean) : [];
        const safeOptions = options && typeof options === 'object' ? options : {};
        const eventSnapshot = getMemoryGroundingSupport(safeEvent);
        const tierCounts = {
            strong: 0,
            medium: 0,
            weak: 0,
            unlabeled: 0
        };
        const evidenceIndexes = new Set();
        let groundedMemberCount = 0;
        let bestCoverage = null;
        let bestPhraseCoverage = null;

        safeMembers.forEach(function collectMemberGrounding(member) {
            const snapshot = getMemoryGroundingSupport(member);
            if (!snapshot || snapshot.available !== true) return;
            groundedMemberCount += 1;
            if (snapshot.tier === 'strong' || snapshot.tier === 'medium' || snapshot.tier === 'weak') {
                tierCounts[snapshot.tier] += 1;
            } else {
                tierCounts.unlabeled += 1;
            }
            if (snapshot.coverage !== null) {
                bestCoverage = bestCoverage === null ? snapshot.coverage : Math.max(bestCoverage, snapshot.coverage);
            }
            if (snapshot.phraseCoverage !== null) {
                bestPhraseCoverage = bestPhraseCoverage === null ? snapshot.phraseCoverage : Math.max(bestPhraseCoverage, snapshot.phraseCoverage);
            }
            snapshot.sourceHistoryIndexes.forEach(function appendIndex(index) {
                evidenceIndexes.add(index);
            });
        });

        if (eventSnapshot && eventSnapshot.available === true) {
            eventSnapshot.sourceHistoryIndexes.forEach(function appendEventIndex(index) {
                evidenceIndexes.add(index);
            });
            if (eventSnapshot.coverage !== null) {
                bestCoverage = bestCoverage === null ? eventSnapshot.coverage : Math.max(bestCoverage, eventSnapshot.coverage);
            }
            if (eventSnapshot.phraseCoverage !== null) {
                bestPhraseCoverage = bestPhraseCoverage === null ? eventSnapshot.phraseCoverage : Math.max(bestPhraseCoverage, eventSnapshot.phraseCoverage);
            }
        }

        const loadedMemberCount = Math.max(0, Math.floor(toFiniteNumber(
            safeOptions.loadedMemberCount !== undefined ? safeOptions.loadedMemberCount : safeMembers.length,
            safeMembers.length
        )));
        const totalMemberCount = Math.max(loadedMemberCount, Math.floor(toFiniteNumber(
            safeOptions.totalMemberCount !== undefined ? safeOptions.totalMemberCount : loadedMemberCount,
            loadedMemberCount
        )));
        const missingSnapshotCount = Math.max(0, loadedMemberCount - groundedMemberCount);

        let tier = eventSnapshot && eventSnapshot.tier ? eventSnapshot.tier : '';
        if (!tier) {
            if (groundedMemberCount <= 0) {
                tier = '';
            } else if (tierCounts.medium > 0 || tierCounts.weak > 0 || missingSnapshotCount > 0) {
                tier = 'medium';
            } else if (tierCounts.strong > 0) {
                tier = 'strong';
            }
        }

        return {
            available: !!(eventSnapshot || groundedMemberCount > 0 || evidenceIndexes.size > 0),
            tier: tier,
            eventSnapshot: eventSnapshot,
            loadedMemberCount: loadedMemberCount,
            totalMemberCount: totalMemberCount,
            groundedMemberCount: groundedMemberCount,
            missingSnapshotCount: missingSnapshotCount,
            tierCounts: tierCounts,
            bestCoverage: bestCoverage,
            bestPhraseCoverage: bestPhraseCoverage,
            partial: !!safeOptions.partial,
            sourceHistoryIndexes: Array.from(evidenceIndexes).sort(function sortIndex(left, right) {
                return left - right;
            }).slice(0, 12)
        };
    }

    function buildEventGroundingHint(overview) {
        const safeOverview = overview && typeof overview === 'object' ? overview : null;
        if (!safeOverview || safeOverview.available !== true) {
            return '这件事还没做过原聊天校对，可能是旧数据，或者这一页还没加载到带校对信息的碎片。';
        }
        const parts = [];
        if (safeOverview.eventSnapshot && safeOverview.eventSnapshot.available === true) {
            parts.push(`这件事摘要和原聊天${humanizeGroundingTier(safeOverview.eventSnapshot.tier, '能对上')}`);
        } else if (safeOverview.tier) {
            parts.push(`按已加载碎片看，这件事和原聊天${humanizeGroundingTier(safeOverview.tier, '能对上')}`);
        }
        if (safeOverview.tierCounts.strong > 0) {
            parts.push(`其中 ${safeOverview.tierCounts.strong} 条碎片对得很上`);
        }
        if (safeOverview.tierCounts.medium > 0) {
            parts.push(`${safeOverview.tierCounts.medium} 条碎片大体对得上`);
        }
        if (safeOverview.missingSnapshotCount > 0) {
            parts.push(`还有 ${safeOverview.missingSnapshotCount} 条碎片还没校对`);
        }
        if (safeOverview.partial) {
            parts.push(`当前只看到了 ${safeOverview.loadedMemberCount}/${safeOverview.totalMemberCount} 条碎片`);
        }
        return parts.join(' · ') || '这件事能和原聊天对上，但还缺少更细的校对信息。';
    }

    function renderEventGroundingPanel(eventItem, members, options) {
        const overview = deriveEventGroundingOverview(eventItem, members, options);
        if (!overview.available) {
            return `
                <div class="hip-grounding-panel is-empty">
                    <div class="hip-grounding-head">
                        <div class="hip-grounding-title">这件事和原聊天对得上吗</div>
                        <span class="hip-grounding-pill is-empty">还没校对</span>
                    </div>
                    <div class="hip-grounding-summary">这件事还没做过原聊天校对，可能是旧数据，或者这一页还没加载到带校对信息的碎片。</div>
                </div>
            `;
        }

        const tierClass = overview.tier === 'strong'
            ? 'is-strong'
            : (overview.tier === 'medium' ? 'is-medium' : (overview.tier === 'weak' ? 'is-weak' : 'is-empty'));
        const stats = [
            renderGroundingStatItem('事件摘要', humanizeGroundingTier(
                overview.eventSnapshot && overview.eventSnapshot.available === true
                    ? overview.eventSnapshot.tier
                    : overview.tier,
                overview.available ? '按成员推断' : '暂无'
            )),
            renderGroundingStatItem('已加载碎片', `${overview.loadedMemberCount}/${overview.totalMemberCount}`),
            overview.tierCounts.strong > 0 ? renderGroundingStatItem('对得很上', String(overview.tierCounts.strong)) : '',
            overview.tierCounts.medium > 0 ? renderGroundingStatItem('大体对上', String(overview.tierCounts.medium)) : '',
            overview.missingSnapshotCount > 0 ? renderGroundingStatItem('还没校对', String(overview.missingSnapshotCount)) : '',
            overview.bestCoverage !== null ? renderGroundingStatItem('最高关键词对上', formatGroundingPercent(overview.bestCoverage)) : '',
            overview.bestPhraseCoverage !== null ? renderGroundingStatItem('最高原话片段对上', formatGroundingPercent(overview.bestPhraseCoverage)) : ''
        ].filter(Boolean).join('');

        return `
            <div class="hip-grounding-panel ${tierClass}">
                <div class="hip-grounding-head">
                    <div class="hip-grounding-title">这件事和原聊天对得上吗</div>
                    <span class="hip-grounding-pill ${tierClass}">${escapeHtml(humanizeGroundingTier(overview.tier, '按成员推断'))}</span>
                </div>
                <div class="hip-grounding-summary">${escapeHtml(buildEventGroundingHint(overview))}</div>
                ${stats ? `<div class="hip-grounding-stats">${stats}</div>` : ''}
                ${overview.sourceHistoryIndexes.length > 0
                    ? `<div class="hip-grounding-hint">下面这些 # 号，对应的是这轮脱水里第几条聊天。</div>${renderGroundingIndexTags(overview.sourceHistoryIndexes)}`
                    : ''}
            </div>
        `;
    }

    function clipMetadataHistoryText(value, maxLength) {
        const text = toTrimmedString(value).replace(/\s+/g, ' ');
        if (!text) return '';
        const numericLimit = Number(maxLength);
        const limit = Number.isFinite(numericLimit) && numericLimit > 0
            ? Math.max(24, Math.floor(numericLimit))
            : 160;
        return text.length > limit ? `${text.slice(0, limit)}...` : text;
    }

    function appendMetadataHistoryEntry(metadata, historyKey, entry, maxEntries) {
        const safeMetadata = normalizeMetadata(metadata);
        const key = toTrimmedString(historyKey) || 'history';
        const safeEntry = entry && typeof entry === 'object' ? Object.assign({}, entry) : null;
        if (!safeEntry) return safeMetadata;

        const numericLimit = Number(maxEntries);
        const limit = Number.isFinite(numericLimit) && numericLimit > 0
            ? Math.max(1, Math.floor(numericLimit))
            : 8;
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

    function normalizeAdminEventVersionState(value) {
        const source = value && typeof value === 'object' ? value : {};
        const metadata = normalizeMetadata(source.metadata);
        const flashbulbMemoryIds = normalizeIdArray(
            source.flashbulbMemoryIds !== undefined
                ? source.flashbulbMemoryIds
                : source.event_flashbulb_memory_ids !== undefined
                    ? source.event_flashbulb_memory_ids
                    : source.eventFlashbulbMemoryIds !== undefined
                        ? source.eventFlashbulbMemoryIds
                        : metadata.event_flashbulb_memory_ids !== undefined
                            ? metadata.event_flashbulb_memory_ids
                            : metadata.eventFlashbulbMemoryIds,
            24
        );
        const detailMemoryIds = normalizeIdArray(
            source.detailMemoryIds !== undefined
                ? source.detailMemoryIds
                : source.event_detail_memory_ids !== undefined
                    ? source.event_detail_memory_ids
                    : source.eventDetailMemoryIds !== undefined
                        ? source.eventDetailMemoryIds
                        : source.detail_memory_ids !== undefined
                            ? source.detail_memory_ids
                            : source.detailMemoryIds !== undefined
                                ? source.detailMemoryIds
                                : metadata.event_detail_memory_ids !== undefined
                                    ? metadata.event_detail_memory_ids
                                    : metadata.eventDetailMemoryIds,
            24
        );
        const rawStatus = toTrimmedString(
            source.status
            || source.event_status
            || source.eventStatus
            || metadata.event_status
            || metadata.eventStatus
        ).toLowerCase();
        const isUnresolved = source.isUnresolved !== undefined
            ? toBoolean(source.isUnresolved)
            : source.event_is_unresolved !== undefined
                ? toBoolean(source.event_is_unresolved)
                : source.eventIsUnresolved !== undefined
                    ? toBoolean(source.eventIsUnresolved)
                    : source.is_unresolved !== undefined
                        ? toBoolean(source.is_unresolved)
                        : metadata.event_is_unresolved !== undefined
                            ? toBoolean(metadata.event_is_unresolved)
                            : metadata.is_unresolved !== undefined
                                ? toBoolean(metadata.is_unresolved)
                                : rawStatus === 'open';
        const fragmentCountRaw = source.fragmentCount !== undefined
            ? source.fragmentCount
            : source.event_fragment_count !== undefined
                ? source.event_fragment_count
                : source.eventFragmentCount !== undefined
                    ? source.eventFragmentCount
                    : source.fragment_count !== undefined
                        ? source.fragment_count
                        : metadata.event_fragment_count !== undefined
                            ? metadata.event_fragment_count
                            : metadata.fragment_count;
        const eventIsFlashbulb = source.isFlashbulb !== undefined
            ? toBoolean(source.isFlashbulb)
            : source.event_is_flashbulb !== undefined
                ? toBoolean(source.event_is_flashbulb)
                : source.eventIsFlashbulb !== undefined
                    ? toBoolean(source.eventIsFlashbulb)
                    : metadata.event_is_flashbulb !== undefined
                        ? toBoolean(metadata.event_is_flashbulb)
                        : metadata.eventIsFlashbulb !== undefined
                            ? toBoolean(metadata.eventIsFlashbulb)
                            : metadata.is_flashbulb;

        return {
            title: toTrimmedString(
                source.title
                || source.event_title
                || source.eventTitle
                || metadata.event_title
                || metadata.eventTitle
            ),
            summary: toTrimmedString(
                source.summary
                || source.event_summary
                || source.eventSummary
                || metadata.event_summary
                || metadata.eventSummary
            ),
            status: rawStatus || (isUnresolved ? 'open' : 'closed'),
            depth: toTrimmedString(
                source.depth
                || source.event_depth
                || source.eventDepth
                || metadata.event_depth
                || metadata.cluster_depth_snapshot
            ).toLowerCase() || 'medium',
            isUnresolved: isUnresolved,
            continuationKey: toTrimmedString(
                source.continuationKey
                || source.continuation_key
                || metadata.continuation_key
            ),
            anchorMemoryId: toTrimmedString(
                source.anchorMemoryId
                || source.anchor_memory_id
                || source.event_anchor_memory_id
                || source.eventAnchorMemoryId
                || metadata.event_anchor_memory_id
                || metadata.eventAnchorMemoryId
            ),
            eventDate: toTrimmedString(
                source.eventDate
                || source.event_date
                || metadata.event_date
                || metadata.occurred_at
            ),
            fragmentCount: Math.max(0, Math.floor(Number(fragmentCountRaw) || 0)),
            isFlashbulb: eventIsFlashbulb || flashbulbMemoryIds.length > 0,
            flashbulbMemoryIds: flashbulbMemoryIds,
            detailMemoryIds: detailMemoryIds
        };
    }

    function areNormalizedIdArraysEqual(left, right, maxCount) {
        return JSON.stringify(normalizeIdArray(left, maxCount)) === JSON.stringify(normalizeIdArray(right, maxCount));
    }

    function buildAdminEventVersionEntry(beforeValue, afterValue, options) {
        const optionSource = options && typeof options === 'object' ? options : {};
        const beforeState = normalizeAdminEventVersionState(beforeValue);
        const afterState = normalizeAdminEventVersionState(afterValue);
        const changeFields = [];

        if (beforeState.title !== afterState.title) changeFields.push('title');
        if (beforeState.summary !== afterState.summary) changeFields.push('summary');
        if (beforeState.status !== afterState.status) changeFields.push('status');
        if (beforeState.depth !== afterState.depth) changeFields.push('depth');
        if (!!beforeState.isUnresolved !== !!afterState.isUnresolved) changeFields.push('unresolved');
        if (beforeState.continuationKey !== afterState.continuationKey) changeFields.push('continuation');
        if (beforeState.anchorMemoryId !== afterState.anchorMemoryId) changeFields.push('anchor');
        if (beforeState.eventDate !== afterState.eventDate) changeFields.push('event_date');
        if (beforeState.fragmentCount !== afterState.fragmentCount) changeFields.push('fragment_count');
        if (!!beforeState.isFlashbulb !== !!afterState.isFlashbulb) changeFields.push('flashbulb');
        if (!areNormalizedIdArraysEqual(beforeState.flashbulbMemoryIds, afterState.flashbulbMemoryIds, 24)) {
            changeFields.push('flashbulb_members');
        }
        if (!areNormalizedIdArraysEqual(beforeState.detailMemoryIds, afterState.detailMemoryIds, 24)) {
            changeFields.push('detail_members');
        }
        if (changeFields.length <= 0 && optionSource.forceEntry !== true) {
            return null;
        }

        const entry = {
            changed_at: toTrimmedString(optionSource.changedAt) || new Date().toISOString(),
            source: toTrimmedString(optionSource.source) || 'admin_event_adjust',
            change_fields: changeFields,
            previous_title: clipMetadataHistoryText(beforeState.title, 80),
            next_title: clipMetadataHistoryText(afterState.title, 80),
            previous_summary: clipMetadataHistoryText(beforeState.summary, 180),
            next_summary: clipMetadataHistoryText(afterState.summary, 180),
            previous_status: beforeState.status,
            next_status: afterState.status,
            previous_depth: beforeState.depth,
            next_depth: afterState.depth,
            previous_unresolved: !!beforeState.isUnresolved,
            next_unresolved: !!afterState.isUnresolved,
            previous_continuation_key: beforeState.continuationKey,
            next_continuation_key: afterState.continuationKey,
            previous_anchor_memory_id: beforeState.anchorMemoryId,
            next_anchor_memory_id: afterState.anchorMemoryId,
            previous_event_date: beforeState.eventDate,
            next_event_date: afterState.eventDate,
            previous_fragment_count: beforeState.fragmentCount,
            next_fragment_count: afterState.fragmentCount,
            previous_flashbulb: !!beforeState.isFlashbulb,
            next_flashbulb: !!afterState.isFlashbulb,
            previous_flashbulb_memory_ids: beforeState.flashbulbMemoryIds.slice(0, 12),
            next_flashbulb_memory_ids: afterState.flashbulbMemoryIds.slice(0, 12),
            previous_detail_memory_ids: beforeState.detailMemoryIds.slice(0, 12),
            next_detail_memory_ids: afterState.detailMemoryIds.slice(0, 12)
        };
        const manualNote = toTrimmedString(optionSource.manualNote || optionSource.manual_note);
        const memberMemoryId = toTrimmedString(optionSource.memberMemoryId || optionSource.member_memory_id);
        const memberPreview = toTrimmedString(optionSource.memberPreview || optionSource.member_preview);
        const sourceEventId = toTrimmedString(optionSource.sourceEventId || optionSource.source_event_id);
        const sourceEventTitle = toTrimmedString(optionSource.sourceEventTitle || optionSource.source_event_title);
        const reasonTags = normalizeTextArray(optionSource.reasonTags || optionSource.reason_tags, 6);
        if (manualNote) entry.manual_note = manualNote;
        if (memberMemoryId) entry.member_memory_id = memberMemoryId;
        if (memberPreview) entry.member_preview = clipMetadataHistoryText(memberPreview, 120);
        if (sourceEventId) entry.source_event_id = sourceEventId;
        if (sourceEventTitle) entry.source_event_title = clipMetadataHistoryText(sourceEventTitle, 80);
        if (reasonTags.length > 0) entry.reason_tags = reasonTags;
        return entry;
    }

    function appendAdminEventVersionMetadata(metadata, versionEntry) {
        if (!versionEntry || typeof versionEntry !== 'object') {
            return normalizeMetadata(metadata);
        }
        return appendMetadataHistoryEntry(
            metadata,
            'event_version_history',
            versionEntry,
            12
        );
    }

    function collectEventVersionHistoryFromMembers(members, maxEntries) {
        const sourceMembers = Array.isArray(members) ? members.filter(Boolean) : [];
        const numericLimit = Number(maxEntries);
        const limit = Number.isFinite(numericLimit) && numericLimit > 0
            ? Math.max(1, Math.floor(numericLimit))
            : 12;
        const merged = [];
        const seen = new Set();

        sourceMembers.forEach(function collectFromMember(member) {
            getMemoryEventVersionHistory(member).forEach(function appendEntry(entry) {
                const safeEntry = entry && typeof entry === 'object' ? entry : null;
                if (!safeEntry) return;
                const entryKey = JSON.stringify([
                    toTrimmedString(
                        safeEntry.changed_at
                        || safeEntry.created_at
                        || safeEntry.refreshed_at
                    ),
                    toTrimmedString(safeEntry.source),
                    normalizeTextArray(safeEntry.change_fields, 8),
                    toTrimmedString(safeEntry.next_title || safeEntry.nextTitle),
                    toTrimmedString(safeEntry.next_summary || safeEntry.nextSummary)
                ]);
                if (!entryKey || seen.has(entryKey)) return;
                seen.add(entryKey);
                merged.push(Object.assign({}, safeEntry));
            });
        });

        merged.sort(function sortHistory(left, right) {
            const leftTime = Date.parse(toTrimmedString(
                left && (left.changed_at || left.created_at || left.refreshed_at)
            )) || 0;
            const rightTime = Date.parse(toTrimmedString(
                right && (right.changed_at || right.created_at || right.refreshed_at)
            )) || 0;
            return leftTime - rightTime;
        });
        return merged.slice(-limit);
    }

    function mergeEventVersionHistoryEntries(primary, secondary, maxEntries) {
        const numericLimit = Number(maxEntries);
        const limit = Number.isFinite(numericLimit) && numericLimit > 0
            ? Math.max(1, Math.floor(numericLimit))
            : 12;
        const merged = [];
        const seen = new Set();

        [primary, secondary].forEach(function consume(list) {
            const source = Array.isArray(list) ? list : [];
            source.forEach(function appendEntry(entry) {
                const safeEntry = entry && typeof entry === 'object' ? entry : null;
                if (!safeEntry) return;
                const entryKey = JSON.stringify([
                    toTrimmedString(
                        safeEntry.changed_at
                        || safeEntry.created_at
                        || safeEntry.refreshed_at
                    ),
                    toTrimmedString(safeEntry.source),
                    normalizeTextArray(safeEntry.change_fields, 8),
                    toTrimmedString(safeEntry.next_title || safeEntry.nextTitle),
                    toTrimmedString(safeEntry.next_summary || safeEntry.nextSummary)
                ]);
                if (!entryKey || seen.has(entryKey)) return;
                seen.add(entryKey);
                merged.push(Object.assign({}, safeEntry));
            });
        });

        merged.sort(function sortHistory(left, right) {
            const leftTime = Date.parse(toTrimmedString(
                left && (left.changed_at || left.created_at || left.refreshed_at)
            )) || 0;
            const rightTime = Date.parse(toTrimmedString(
                right && (right.changed_at || right.created_at || right.refreshed_at)
            )) || 0;
            return leftTime - rightTime;
        });
        return merged.slice(-limit);
    }

    function humanizeEventVersionField(field) {
        const safeField = toTrimmedString(field).toLowerCase();
        const mapping = {
            title: '标题',
            summary: '摘要',
            status: '状态',
            depth: '深浅',
            unresolved: '未了结',
            continuation: '延续线索',
            anchor: '主锚点',
            event_date: '事件日期',
            fragment_count: '成员数',
            flashbulb: '高冲击',
            flashbulb_members: '高冲击成员',
            detail_members: '细节成员'
        };
        return mapping[safeField] || safeField;
    }

    function humanizeEventVersionSource(source) {
        const safeSource = toTrimmedString(source).toLowerCase();
        const mapping = {
            digest_event_plan: '自动整理',
            reconsolidation_refresh: '改写后刷新',
            admin_event_edit: '手动编辑',
            admin_event_member_adjust: '成员调整',
            admin_event_attach: '手动并入',
            admin_event_remove: '手动移出',
            admin_event_merge: '事件合并',
            admin_event_resolved: '状态调整'
        };
        return mapping[safeSource] || '自动更新';
    }

    function formatEventVersionSourceLabel(source) {
        const safeSource = toTrimmedString(source).toLowerCase();
        const mapping = {
            digest_event_plan: '自动整理',
            reconsolidation_refresh: '改写后刷新',
            admin_event_edit: '手动编辑',
            admin_event_member_adjust: '成员调整',
            admin_event_attach: '手动并入',
            admin_event_remove: '手动移出',
            admin_event_merge: '事件合并',
            admin_event_resolved: '状态调整'
        };
        return mapping[safeSource] || '自动更新';
    }

    function formatEventVersionFieldLabel(field) {
        const safeField = toTrimmedString(field).toLowerCase();
        const mapping = {
            title: '标题',
            summary: '摘要',
            status: '状态',
            depth: '深浅',
            unresolved: '未了结',
            continuation: '延续线索',
            anchor: '主锚点',
            event_date: '事件日期',
            fragment_count: '成员数',
            flashbulb: '高冲击',
            flashbulb_members: '高冲击成员',
            detail_members: '细节成员'
        };
        return mapping[safeField] || safeField;
    }

    function buildEventVersionHistoryHintSafe(memory) {
        const history = getMemoryEventVersionHistory(memory);
        const latest = history.length > 0 ? history[history.length - 1] : null;
        if (!latest) return '';

        const sourceLabel = formatEventVersionSourceLabel(latest.source);
        const changedAt = toTrimmedString(
            latest.changed_at
            || latest.created_at
            || latest.refreshed_at
        );
        const timeLabel = changedAt ? formatTimeAgo(changedAt) : '刚刚';
        const fieldLabels = normalizeTextArray(latest.change_fields, 4).map(formatEventVersionFieldLabel);
        return `最近一次${sourceLabel}：${timeLabel}${fieldLabels.length > 0 ? `，涉及 ${fieldLabels.join('、')}` : ''}`;
    }

    function formatDigestRetiredReasonLabel(reason) {
        const safeReason = toTrimmedString(reason).toLowerCase();
        if (safeReason === 'merged_into_other_event') return '已并入其他事件';
        if (safeReason === 'no_remaining_members') return '成员已清空';
        return safeReason || '未记录';
    }

    function getEventLifecycleSnapshot(eventItem) {
        const safeEvent = eventItem && typeof eventItem === 'object' ? eventItem : {};
        const metadata = normalizeMetadata(safeEvent.metadata);
        const versionHistory = getMemoryEventVersionHistory(safeEvent);
        const latestVersion = versionHistory.length > 0 ? versionHistory[versionHistory.length - 1] : null;
        const manualGuardSnapshot = getMemoryEventManualGuardSnapshot(safeEvent);
        const retired = isRetiredEventItem(safeEvent);
        return {
            retired: retired,
            retiredAt: toTrimmedString(
                safeEvent.digest_retired_at
                || metadata.digest_retired_at
                || metadata.digestRetiredAt
            ),
            retiredReason: toTrimmedString(
                safeEvent.digest_retired_reason
                || metadata.digest_retired_reason
                || metadata.digestRetiredReason
            ),
            supersededByEventId: toTrimmedString(
                safeEvent.digest_retired_superseded_by_event_id
                || metadata.digest_retired_superseded_by_event_id
                || metadata.digestRetiredSupersededByEventId
                || (latestVersion && latestVersion.superseded_by_event_id)
            ),
            previousFragmentCount: Math.max(0, Math.floor(toFiniteNumber(
                safeEvent.digest_retired_previous_fragment_count
                || metadata.digest_retired_previous_fragment_count
                || metadata.digestRetiredPreviousFragmentCount,
                safeEvent.memberCount
            ))),
            previousAnchorMemoryId: toTrimmedString(
                safeEvent.digest_retired_previous_anchor_memory_id
                || metadata.digest_retired_previous_anchor_memory_id
                || metadata.digestRetiredPreviousAnchorMemoryId
            ),
            previousContinuationKey: toTrimmedString(
                safeEvent.digest_retired_previous_continuation_key
                || metadata.digest_retired_previous_continuation_key
                || metadata.digestRetiredPreviousContinuationKey
            ),
            versionHistoryCount: versionHistory.length,
            latestVersionAt: toTrimmedString(
                latestVersion && (
                    latestVersion.changed_at
                    || latestVersion.created_at
                    || latestVersion.refreshed_at
                )
            ),
            latestVersionSource: toTrimmedString(latestVersion && latestVersion.source),
            manualGuardCount: Math.max(0, Number(manualGuardSnapshot.historyCount || 0))
        };
    }

    function buildEventLifecycleHint(snapshot) {
        const safeSnapshot = snapshot && typeof snapshot === 'object' ? snapshot : {};
        const parts = [];
        if (safeSnapshot.retired) {
            parts.push(`状态：已退役（${formatDigestRetiredReasonLabel(safeSnapshot.retiredReason)}）`);
        } else {
            parts.push('状态：当前仍在使用');
        }
        if (safeSnapshot.retiredAt) {
            parts.push(`退役时间：${formatDateTime(safeSnapshot.retiredAt)}`);
        }
        if (safeSnapshot.supersededByEventId) {
            parts.push(`接替事件：${safeSnapshot.supersededByEventId}`);
        }
        if (safeSnapshot.previousFragmentCount > 0 && safeSnapshot.retired) {
            parts.push(`退役前成员：${safeSnapshot.previousFragmentCount} 条`);
        }
        if (safeSnapshot.versionHistoryCount > 0) {
            parts.push(`留痕 ${safeSnapshot.versionHistoryCount} 次`);
        }
        if (safeSnapshot.manualGuardCount > 0) {
            parts.push(`人工保护 ${safeSnapshot.manualGuardCount} 次`);
        }
        return parts.join(' · ');
    }

    function renderEventLifecyclePanel(eventItem) {
        const snapshot = getEventLifecycleSnapshot(eventItem);
        if (!snapshot.retired && snapshot.versionHistoryCount <= 0 && snapshot.manualGuardCount <= 0) {
            return '';
        }
        const tags = [];
        tags.push(snapshot.retired ? '已退役' : '现役事件');
        if (snapshot.retiredReason) {
            tags.push(formatDigestRetiredReasonLabel(snapshot.retiredReason));
        }
        if (snapshot.supersededByEventId) {
            tags.push(`接替 ${snapshot.supersededByEventId}`);
        }
        if (snapshot.versionHistoryCount > 0) {
            tags.push(`留痕 ${snapshot.versionHistoryCount}`);
        }
        if (snapshot.manualGuardCount > 0) {
            tags.push(`人工保护 ${snapshot.manualGuardCount}`);
        }
        const metaLines = [];
        if (snapshot.retiredAt) {
            metaLines.push(`退役于：${formatDateTime(snapshot.retiredAt)}`);
        }
        if (snapshot.latestVersionSource || snapshot.latestVersionAt) {
            metaLines.push(`最近一次版本变更：${snapshot.latestVersionSource ? formatEventVersionSourceLabel(snapshot.latestVersionSource) : '未知来源'}${snapshot.latestVersionAt ? ` · ${formatDateTime(snapshot.latestVersionAt)}` : ''}`);
        }
        if (snapshot.previousFragmentCount > 0 && snapshot.retired) {
            metaLines.push(`退役前成员数：${snapshot.previousFragmentCount}`);
        }
        if (snapshot.previousAnchorMemoryId && snapshot.retired) {
            metaLines.push(`退役前锚点：${snapshot.previousAnchorMemoryId}`);
        }
        if (snapshot.previousContinuationKey && snapshot.retired) {
            metaLines.push(`退役前 continuation：${snapshot.previousContinuationKey}`);
        }
        return `
            <div class="hip-audit-panel" style="margin-top:14px;">
                <div class="hip-audit-head">
                    <div class="hip-audit-title">事件生命周期</div>
                    <span class="hip-grounding-pill">${snapshot.retired ? '已退役' : '持续中'}</span>
                </div>
                <div class="hip-tags">${renderUniqueHipTags(tags, 10)}</div>
                <div class="hip-audit-summary" style="margin-top:10px;">${escapeHtml(buildEventLifecycleHint(snapshot) || '当前还没有明显的生命周期变化。')}</div>
                ${metaLines.length > 0 ? `<div class="hip-audit-summary" style="margin-top:8px;">${escapeHtml(metaLines.join('  '))}</div>` : ''}
            </div>
        `;
    }

    function buildEventLifecycleAuditRow(eventItem, extraMeta) {
        const safeEvent = eventItem && typeof eventItem === 'object' ? eventItem : {};
        const snapshot = getEventLifecycleSnapshot(safeEvent);
        const meta = [];
        meta.push(snapshot.retired ? '已退役' : '现役');
        if (snapshot.retiredAt) {
            meta.push(formatDateTime(snapshot.retiredAt));
        } else if (safeEvent.latestTimestamp) {
            meta.push(formatTimeAgo(new Date(safeEvent.latestTimestamp).toISOString()));
        }
        if (snapshot.versionHistoryCount > 0) {
            meta.push(`留痕 ${snapshot.versionHistoryCount}`);
        }
        if (snapshot.manualGuardCount > 0) {
            meta.push(`人工保护 ${snapshot.manualGuardCount}`);
        }
        normalizeTextArray(extraMeta, 6).forEach(function pushMeta(item) {
            meta.push(item);
        });
        return {
            title: toTrimmedString(safeEvent.title) || '未命名事件',
            meta: meta.filter(Boolean),
            body: buildEventLifecycleHint(snapshot) || '当前还没有明显的生命周期变化。'
        };
    }

    function humanizeEventSignalTag(tag) {
        const safeTag = toTrimmedString(tag).toLowerCase();
        const mapping = {
            open_loop: '还没放下',
            existing_flashbulb: '原本就很深',
            fragment_flashbulb: '成员特别深刻',
            promoted_flashbulb: '系统判定高冲击',
            emotionally_intense: '情绪很强',
            painful: '痛感明显',
            warm: '很温暖',
            contrast: '反差感',
            high_significance: '很重要',
            vivid_details: '细节清晰',
            recurrent: '反复想起',
            deep_layer: '潜得很深',
            mixed_emotions: '情绪复杂',
            rich_episode: '连续事件',
            high_depth: '记得很完整'
        };
        return mapping[safeTag] || safeTag;
    }

    function collectMemberTextTags(members, reader, maxCount) {
        const source = Array.isArray(members) ? members : [];
        const result = [];
        const seen = new Set();
        const limit = Number.isFinite(Number(maxCount)) && Number(maxCount) > 0
            ? Math.floor(Number(maxCount))
            : 12;
        source.forEach(function readTags(member) {
            const tags = typeof reader === 'function' ? reader(member) : [];
            normalizeTextArray(tags, limit).forEach(function appendTag(tag) {
                const safeTag = toTrimmedString(tag);
                if (!safeTag || seen.has(safeTag)) return;
                seen.add(safeTag);
                if (result.length < limit) {
                    result.push(safeTag);
                }
            });
        });
        return result;
    }

    /**
     * 基于成员碎片推导事件级 flashbulb 状态。
     */
    function deriveEventFlashbulbStateFromMembers(members) {
        const sourceMembers = Array.isArray(members) ? members.filter(Boolean) : [];
        let fragmentFlashbulb = false;
        const fragmentIds = [];
        const persistedIds = [];

        sourceMembers.forEach(function collectFlashbulb(member) {
            if (isMemoryFlashbulb(member)) {
                fragmentFlashbulb = true;
                const memoryId = toTrimmedString(member && member.id);
                if (memoryId) fragmentIds.push(memoryId);
            }
            persistedIds.push.apply(persistedIds, getMemoryEventFlashbulbMemoryIds(member));
        });

        const memoryIds = normalizeIdArray(fragmentIds.concat(persistedIds), 24);
        const persistedFlag = sourceMembers.some(function hasPersistedFlag(member) {
            return isMemoryEventFlashbulb(member);
        });

        return {
            isFlashbulb: fragmentFlashbulb || persistedFlag || memoryIds.length > 0,
            memoryIds: memoryIds
        };
    }

    /**
     * 统一判断一条记忆是否已释怀（兼容 boolean / string / number）。
     */
    function isMemoryResolved(memory) {
        const safeMemory = memory && typeof memory === 'object' ? memory : {};
        const resolvedValue = String(
            safeMemory.resolved === undefined || safeMemory.resolved === null
                ? ''
                : safeMemory.resolved
        ).toLowerCase();
        return (
            safeMemory.resolved === true
            || resolvedValue === 'true'
            || resolvedValue === 'resolved'
            || resolvedValue === '1'
        );
    }

    /**
     * 在当前列表分页内按事件 ID 查找成员记忆。
     */
    function findEventMembersInCurrentList(eventId) {
        const safeEventId = toTrimmedString(eventId);
        if (!safeEventId) return [];
        const items = state.data && state.data.list && Array.isArray(state.data.list.items)
            ? state.data.list.items
            : [];
        return items.filter(function filterByEvent(item) {
            return getMemoryEventId(item) === safeEventId;
        });
    }

    /**
     * 从缓存里读取事件成员列表（用于跨页查看）。
     */
    function getCachedEventMembers(eventId) {
        const safeEventId = toTrimmedString(eventId);
        if (!safeEventId) return [];
        const cache = state.eventMembersCache && typeof state.eventMembersCache === 'object'
            ? state.eventMembersCache
            : {};
        const list = cache[safeEventId];
        if (!Array.isArray(list)) return [];
        return list.filter(Boolean);
    }

    /**
     * 写入事件成员缓存并按 id 去重。
     */
    function setCachedEventMembers(eventId, members) {
        const safeEventId = toTrimmedString(eventId);
        if (!safeEventId) return [];
        const source = Array.isArray(members) ? members : [];
        const seen = new Set();
        const normalized = [];
        source.forEach(function appendUnique(item) {
            const memoryId = toTrimmedString(item && item.id);
            if (!memoryId || seen.has(memoryId)) return;
            seen.add(memoryId);
            normalized.push(item);
        });
        if (!state.eventMembersCache || typeof state.eventMembersCache !== 'object') {
            state.eventMembersCache = {};
        }
        state.eventMembersCache[safeEventId] = normalized;
        return normalized;
    }

    /**
     * 对事件成员数组按记忆 id 去重，但不写入缓存。
     */
    function dedupeEventMembers(members) {
        const source = Array.isArray(members) ? members : [];
        const seen = new Set();
        const normalized = [];
        source.forEach(function appendUnique(item) {
            const memoryId = toTrimmedString(item && item.id);
            if (!memoryId || seen.has(memoryId)) return;
            seen.add(memoryId);
            normalized.push(item);
        });
        return normalized;
    }

    /**
     * 读取事件当前可用于编辑的成员（优先缓存，其次当前分页）。
     */
    function getEventMembersForAction(eventId) {
        const safeEventId = toTrimmedString(eventId);
        if (!safeEventId) return [];
        const cached = getCachedEventMembers(safeEventId);
        if (cached.length > 0) return cached;
        const currentPageMembers = findEventMembersInCurrentList(safeEventId);
        if (currentPageMembers.length > 0) {
            setCachedEventMembers(safeEventId, currentPageMembers);
        }
        return currentPageMembers;
    }

    /**
     * 确保某个事件的成员已可用于后台编辑动作，必要时主动拉取完整成员。
     */
    async function loadEventMembersForAction(eventId) {
        const safeEventId = toTrimmedString(eventId);
        if (!safeEventId) return [];

        let members = getEventMembersForAction(safeEventId);
        const client = getClient();
        if (members.length <= 0 && client && typeof client.listEventMembers === 'function') {
            const fetchResult = await client.listEventMembers({
                charId: state.filters.charId,
                eventId: safeEventId,
                limit: 240
            }).catch(function onFetchError() {
                return { ok: false, items: [] };
            });
            if (fetchResult && fetchResult.ok === true && Array.isArray(fetchResult.items)) {
                members = setCachedEventMembers(safeEventId, fetchResult.items);
            }
        }
        return dedupeEventMembers(members);
    }

    /**
     * 为事件成员构建统一事件补丁（标题/摘要/状态/计数）。
     */
    function deriveEventPatchFromMembers(eventId, members, overrides) {
        const safeEventId = toTrimmedString(eventId);
        const sourceMembers = Array.isArray(members) ? members.filter(Boolean) : [];
        if (!safeEventId || sourceMembers.length <= 0) return null;

        const optionSource = overrides && typeof overrides === 'object' ? overrides : {};
        const ordered = sourceMembers.slice().sort(function sortByImportance(left, right) {
            const rightImportance = Number(right && right.importance || 0);
            const leftImportance = Number(left && left.importance || 0);
            if (rightImportance !== leftImportance) return rightImportance - leftImportance;
            return getMemorySortTimestamp(right) - getMemorySortTimestamp(left);
        });
        const anchor = ordered[0] || sourceMembers[0];
        const unresolvedCount = sourceMembers.filter(function countUnresolved(item) {
            return !isMemoryResolved(item);
        }).length;
        const anchorMetadata = getMemoryMetadata(anchor);
        const isUnresolved = optionSource.isUnresolved !== undefined
            ? toBoolean(optionSource.isUnresolved)
            : unresolvedCount > 0;
        const status = toTrimmedString(
            optionSource.status !== undefined ? optionSource.status : (isUnresolved ? 'open' : 'closed')
        ).toLowerCase() || (isUnresolved ? 'open' : 'closed');
        const depth = toTrimmedString(
            optionSource.depth !== undefined ? optionSource.depth : getMemoryEventDepth(anchor)
        ).toLowerCase() || 'medium';
        const titleFallback = getMemoryEventTitle(anchor)
            || summarizeContent(anchor && anchor.content, 18)
            || '记忆事件';
        const summaryFallback = getMemoryEventSummary(anchor)
            || summarizeContent(anchor && anchor.content, 86)
            || '这是一段待回看的记忆事件。';
        const eventDate = toTrimmedString(
            optionSource.eventDate !== undefined
                ? optionSource.eventDate
                : (
                    anchor && (
                        anchor.event_date
                        || anchor.eventDate
                        || anchorMetadata.event_date
                        || anchorMetadata.occurred_at
                    )
                )
        );
        const hintCount = sourceMembers.reduce(function pickMaxCount(maxValue, item) {
            return Math.max(maxValue, getMemoryEventFragmentCount(item));
        }, 0);
        const flashbulbState = deriveEventFlashbulbStateFromMembers(sourceMembers);
        const defaultCount = Math.max(sourceMembers.length, hintCount);
        const overrideCount = Number(optionSource.fragmentCount);
        const fragmentCount = Number.isFinite(overrideCount)
            ? Math.max(sourceMembers.length, Math.floor(overrideCount))
            : defaultCount;
        const nextTitle = toTrimmedString(
            optionSource.title !== undefined ? optionSource.title : titleFallback
        ) || titleFallback;
        const nextSummary = toTrimmedString(
            optionSource.summary !== undefined ? optionSource.summary : summaryFallback
        ) || summaryFallback;
        const continuationKey = toTrimmedString(
            optionSource.continuationKey !== undefined
                ? optionSource.continuationKey
                : (optionSource.continuation_key !== undefined
                    ? optionSource.continuation_key
                    : (
                        anchor && (
                            anchor.continuation_key
                            || anchor.continuationKey
                            || anchorMetadata.continuation_key
                        )
                    ))
        );
        const anchorMemoryId = toTrimmedString(
            optionSource.anchorMemoryId !== undefined
                ? optionSource.anchorMemoryId
                : (optionSource.anchor_memory_id !== undefined
                    ? optionSource.anchor_memory_id
                    : (optionSource.event_anchor_memory_id !== undefined
                        ? optionSource.event_anchor_memory_id
                        : (anchor && anchor.id)))
        );
        const detailMemoryIds = normalizeIdArray(
            optionSource.detailMemoryIds !== undefined
                ? optionSource.detailMemoryIds
                : (optionSource.detail_memory_ids !== undefined
                    ? optionSource.detail_memory_ids
                    : (optionSource.event_detail_memory_ids !== undefined
                        ? optionSource.event_detail_memory_ids
                        : ordered.map(function mapMemberId(item) {
                            return item && item.id;
                        }))),
            24
        );
        const flashbulbMemoryIds = normalizeIdArray(
            optionSource.flashbulbMemoryIds !== undefined
                ? optionSource.flashbulbMemoryIds
                : (optionSource.event_flashbulb_memory_ids !== undefined
                    ? optionSource.event_flashbulb_memory_ids
                    : flashbulbState.memoryIds),
            24
        );
        const isFlashbulb = optionSource.isFlashbulb !== undefined
            ? toBoolean(optionSource.isFlashbulb) || flashbulbMemoryIds.length > 0
            : (flashbulbState.isFlashbulb || flashbulbMemoryIds.length > 0);

        return {
            eventId: safeEventId,
            title: nextTitle,
            summary: nextSummary,
            depth: depth,
            status: status,
            isUnresolved: isUnresolved,
            fragmentCount: fragmentCount,
            eventDate: eventDate || '',
            continuationKey: continuationKey,
            anchorMemoryId: anchorMemoryId,
            detailMemoryIds: detailMemoryIds,
            isFlashbulb: isFlashbulb,
            flashbulbMemoryIds: flashbulbMemoryIds
        };
    }

    /**
     * 复制 metadata 并移除事件相关字段。
     */
    function stripEventMetadataObject(metadata) {
        const next = normalizeMetadata(metadata);
        [
            'event_id',
            'eventId',
            'memory_event_id',
            'cluster_id',
            'memory_cluster_id',
            'event_title',
            'eventTitle',
            'event_summary',
            'eventSummary',
            'event_status',
            'eventStatus',
            'event_depth',
            'cluster_depth_snapshot',
            'event_date',
            'occurred_at',
            'continuation_key',
            'event_fragment_count',
            'fragment_count',
            'event_is_unresolved',
            'is_unresolved',
            'unresolved',
            'event_is_flashbulb',
            'eventIsFlashbulb',
            'event_flashbulb_memory_ids',
            'eventFlashbulbMemoryIds',
            'event_anchor_memory_id',
            'eventAnchorMemoryId',
            'event_detail_memory_ids',
            'eventDetailMemoryIds'
        ].forEach(function removeKey(key) {
            if (Object.prototype.hasOwnProperty.call(next, key)) {
                delete next[key];
            }
        });
        return next;
    }

    function stripEventMetadata(memory) {
        return stripEventMetadataObject(getMemoryMetadata(memory));
    }

    /**
     * 基于事件补丁构建单条记忆更新 payload。
     */
    function buildEventUpdatePayload(memory, eventPatch, options) {
        const safePatch = eventPatch && typeof eventPatch === 'object' ? eventPatch : null;
        if (!safePatch || !safePatch.eventId) return null;
        const optionSource = options && typeof options === 'object' ? options : {};
        const flashbulbMemoryIds = normalizeIdArray(safePatch.flashbulbMemoryIds, 24);
        const detailMemoryIds = normalizeIdArray(safePatch.detailMemoryIds, 24);
        let metadata = Object.assign(
            {},
            normalizeMetadata(getMemoryMetadata(memory)),
            normalizeMetadata(optionSource.metadata),
            {
                event_id: safePatch.eventId,
                memory_event_id: safePatch.eventId,
                event_title: safePatch.title,
                event_summary: safePatch.summary,
                event_status: safePatch.status,
                event_depth: safePatch.depth,
                event_fragment_count: safePatch.fragmentCount,
                event_is_unresolved: safePatch.isUnresolved,
                is_unresolved: safePatch.isUnresolved,
                event_is_flashbulb: !!safePatch.isFlashbulb
            }
        );
        if (flashbulbMemoryIds.length > 0) {
            metadata.event_flashbulb_memory_ids = flashbulbMemoryIds;
        } else {
            delete metadata.event_flashbulb_memory_ids;
            delete metadata.eventFlashbulbMemoryIds;
        }
        if (safePatch.eventDate) {
            metadata.event_date = safePatch.eventDate;
            metadata.occurred_at = safePatch.eventDate;
        } else {
            delete metadata.event_date;
            delete metadata.occurred_at;
        }
        if (safePatch.continuationKey) {
            metadata.continuation_key = safePatch.continuationKey;
        } else {
            delete metadata.continuation_key;
        }
        if (safePatch.anchorMemoryId) {
            metadata.event_anchor_memory_id = safePatch.anchorMemoryId;
        } else {
            delete metadata.event_anchor_memory_id;
            delete metadata.eventAnchorMemoryId;
        }
        if (detailMemoryIds.length > 0) {
            metadata.event_detail_memory_ids = detailMemoryIds;
        } else {
            delete metadata.event_detail_memory_ids;
            delete metadata.eventDetailMemoryIds;
        }
        metadata = appendAdminEventVersionMetadata(metadata, optionSource.versionEntry);

        const payload = {
            event_id: safePatch.eventId,
            event_title: safePatch.title,
            event_summary: safePatch.summary,
            event_status: safePatch.status,
            event_depth: safePatch.depth,
            event_date: safePatch.eventDate || null,
            continuation_key: safePatch.continuationKey || null,
            event_fragment_count: safePatch.fragmentCount,
            event_is_unresolved: safePatch.isUnresolved,
            event_anchor_memory_id: safePatch.anchorMemoryId || null,
            event_detail_memory_ids: detailMemoryIds,
            event_is_flashbulb: !!safePatch.isFlashbulb,
            event_flashbulb_memory_ids: flashbulbMemoryIds,
            metadata: metadata
        };
        if (optionSource.resolved !== undefined) {
            payload.resolved = toBoolean(optionSource.resolved);
        }
        return payload;
    }

    /**
     * 构建“移出事件”时的单条记忆更新 payload。
     */
    function buildDetachFromEventPayload(memory, options) {
        const optionSource = options && typeof options === 'object' ? options : {};
        let metadata = stripEventMetadataObject(Object.assign(
            {},
            normalizeMetadata(getMemoryMetadata(memory)),
            normalizeMetadata(optionSource.metadata)
        ));
        metadata = appendAdminEventVersionMetadata(metadata, optionSource.versionEntry);

        const payload = {
            event_id: null,
            event_title: null,
            event_summary: null,
            event_status: null,
            event_depth: null,
            event_date: null,
            continuation_key: null,
            event_fragment_count: 0,
            event_is_unresolved: null,
            event_anchor_memory_id: null,
            event_detail_memory_ids: [],
            event_is_flashbulb: null,
            event_flashbulb_memory_ids: [],
            metadata: metadata
        };
        if (optionSource.resolved !== undefined) {
            payload.resolved = toBoolean(optionSource.resolved);
        }
        return payload;
    }

    /**
     * 管理台手动编排后，按真实库里的当前成员即时同步真实事件表。
     */
    async function syncEventRecordAfterAdminAdjust(eventId, fallbackMembers, options) {
        const client = getClient();
        const safeEventId = toTrimmedString(eventId);
        const optionSource = options && typeof options === 'object' ? options : {};
        if (!client || typeof client.syncEventRecord !== 'function' || !safeEventId) {
            return { ok: false, error: 'event_sync_unavailable', skipped: true };
        }

        let existingEventRecord = null;
        if (typeof client.getEventRecord === 'function') {
            const existingResult = await client.getEventRecord(safeEventId, {
                charId: state.filters.charId
            }).catch(function onGetEventRecordError() {
                return { ok: false, event: null };
            });
            if (existingResult && existingResult.ok === true) {
                existingEventRecord = existingResult.event || null;
            }
        }

        let actualMembers = Array.isArray(fallbackMembers) ? fallbackMembers.filter(Boolean) : [];
        let fetchedFromDb = false;
        if (typeof client.listEventMembers === 'function') {
            const fetchResult = await client.listEventMembers({
                charId: state.filters.charId,
                eventId: safeEventId,
                limit: 240
            }).catch(function onFetchEventMembersError() {
                return { ok: false, items: [] };
            });
            if (fetchResult && fetchResult.ok === true) {
                fetchedFromDb = true;
                actualMembers = Array.isArray(fetchResult.items) ? fetchResult.items.filter(Boolean) : [];
                setCachedEventMembers(safeEventId, actualMembers);
            }
        }

        const patchOverrides = Object.assign({}, optionSource.patchOverrides || {});
        if (fetchedFromDb && Object.prototype.hasOwnProperty.call(patchOverrides, 'fragmentCount')) {
            delete patchOverrides.fragmentCount;
        }
        const syncPatch = actualMembers.length > 0
            ? deriveEventPatchFromMembers(safeEventId, actualMembers, patchOverrides)
            : { eventId: safeEventId };
        let nextMetadata = normalizeMetadata(optionSource.metadata);
        if (optionSource.versionSource && actualMembers.length > 0) {
            const versionEntry = buildAdminEventVersionEntry(
                optionSource.previousPatch || existingEventRecord,
                syncPatch,
                Object.assign({}, optionSource.versionContext || {}, {
                    source: optionSource.versionSource,
                    manualNote: optionSource.manualNote
                })
            );
            if (versionEntry) {
                nextMetadata = appendAdminEventVersionMetadata(
                    Object.assign(
                        {},
                        normalizeMetadata(existingEventRecord && existingEventRecord.metadata),
                        nextMetadata
                    ),
                    versionEntry
                );
            }
        }

        const syncResult = await client.syncEventRecord(syncPatch, actualMembers, {
            charId: state.filters.charId,
            deleteWhenEmpty: true,
            manualEdited: optionSource.manualEdited !== false,
            manualNote: optionSource.manualNote,
            syncReason: optionSource.syncReason,
            metadata: nextMetadata
        }).catch(function onSyncEventRecordError() {
            return { ok: false, error: 'sync_event_record_failed' };
        });

        if (syncResult && syncResult.ok === true && actualMembers.length <= 0) {
            setCachedEventMembers(safeEventId, []);
        }
        return syncResult;
    }

    /**
     * 基于当前分页生成可并入的事件候选列表。
     */
    function findEventDisplayItemInCurrentList(eventId) {
        const safeEventId = toTrimmedString(eventId);
        if (!safeEventId) return null;

        const items = state.data && state.data.list && Array.isArray(state.data.list.items)
            ? state.data.list.items
            : [];
        if (items.length <= 0) return null;

        const displayItems = buildListDisplayItems(items, {
            recordType: 'event',
            eventRecordsById: state.data && state.data.list ? state.data.list.eventRecordsById : {}
        });
        return displayItems.find(function findEventItem(item) {
            return !!item && item.kind === 'event' && toTrimmedString(item.eventId) === safeEventId;
        }) || null;
    }

    function buildRegressionEventLabel(snapshot, fallbackEventId) {
        const safeSnapshot = snapshot && typeof snapshot === 'object' ? snapshot : {};
        const title = toTrimmedString(
            safeSnapshot.ui && safeSnapshot.ui.title
            || safeSnapshot.db && safeSnapshot.db.title
            || fallbackEventId
        );
        return summarizeContent(title || fallbackEventId || '未命名事件', 32);
    }

    function buildRegressionComparableState(source) {
        const hasSource = !!(source && typeof source === 'object');
        const safeSource = hasSource ? source : {};
        const memoryIds = normalizeIdArray(safeSource.memoryIds, 96);
        const detailMemoryIds = normalizeIdArray(safeSource.detailMemoryIds, 24);
        const rawStatus = toTrimmedString(safeSource.status).toLowerCase();
        const isUnresolved = safeSource.isUnresolved !== undefined
            ? toBoolean(safeSource.isUnresolved)
            : rawStatus === 'open';
        const status = rawStatus || (isUnresolved ? 'open' : 'closed');
        const numericFragmentCount = Math.max(
            0,
            Math.floor(Number(safeSource.fragmentCount) || 0),
            Math.floor(Number(safeSource.memberCount) || 0),
            memoryIds.length
        );

        return {
            exists: hasSource ? safeSource.exists !== false : false,
            visibleOnPage: hasSource ? safeSource.visibleOnPage !== false : false,
            eventId: toTrimmedString(safeSource.eventId),
            charId: toTrimmedString(safeSource.charId),
            title: toTrimmedString(safeSource.title),
            summary: toTrimmedString(safeSource.summary),
            status: status,
            depth: toTrimmedString(safeSource.depth).toLowerCase(),
            isUnresolved: isUnresolved,
            fragmentCount: numericFragmentCount,
            memberCount: numericFragmentCount,
            memoryIds: memoryIds,
            detailMemoryIds: detailMemoryIds,
            manualEdited: !!safeSource.manualEdited,
            updatedAt: toTrimmedString(safeSource.updatedAt),
            error: toTrimmedString(safeSource.error)
        };
    }

    function buildRegressionUiSnapshot(eventId) {
        const safeEventId = toTrimmedString(eventId);
        if (!safeEventId) return buildRegressionComparableState({ exists: false, eventId: safeEventId, visibleOnPage: false });

        const eventItem = findEventDisplayItemInCurrentList(safeEventId);
        if (!eventItem) {
            return buildRegressionComparableState({
                exists: false,
                visibleOnPage: false,
                eventId: safeEventId,
                charId: state.filters.charId
            });
        }

        const eventRecordsById = state.data && state.data.list && state.data.list.eventRecordsById
            && typeof state.data.list.eventRecordsById === 'object'
            ? state.data.list.eventRecordsById
            : {};
        const eventRecord = eventRecordsById[safeEventId] || null;
        const cachedMembers = getCachedEventMembers(safeEventId);
        const visibleMembers = cachedMembers.length > 0
            ? cachedMembers
            : (Array.isArray(eventItem.members) ? eventItem.members : []);
        const visibleMemberIds = normalizeIdArray(visibleMembers.map(function mapId(item) {
            return item && item.id;
        }), 96);
        const memoryIds = normalizeIdArray(
            eventRecord && Array.isArray(eventRecord.memory_ids) && eventRecord.memory_ids.length > 0
                ? eventRecord.memory_ids
                : visibleMemberIds,
            96
        );
        const detailMemoryIds = normalizeIdArray(
            eventRecord && Array.isArray(eventRecord.detail_memory_ids) && eventRecord.detail_memory_ids.length > 0
                ? eventRecord.detail_memory_ids
                : memoryIds,
            24
        );
        const updatedAt = toTrimmedString(eventRecord && eventRecord.updated_at)
            || (Number(eventItem.latestTimestamp) > 0
                ? new Date(Number(eventItem.latestTimestamp)).toISOString()
                : '');

        return buildRegressionComparableState({
            exists: true,
            visibleOnPage: true,
            eventId: safeEventId,
            charId: toTrimmedString(
                eventRecord && eventRecord.char_id
                || visibleMembers[0] && visibleMembers[0].char_id
                || state.filters.charId
            ),
            title: eventItem.title,
            summary: eventItem.summary,
            status: toTrimmedString(eventRecord && eventRecord.status) || (eventItem.isResolved ? 'closed' : 'open'),
            depth: toTrimmedString(eventItem.depth || eventRecord && eventRecord.depth),
            isUnresolved: eventRecord && eventRecord.is_unresolved !== undefined
                ? toBoolean(eventRecord.is_unresolved)
                : !eventItem.isResolved,
            fragmentCount: Math.max(
                0,
                Number(eventItem.memberCount || 0),
                Number(eventRecord && eventRecord.fragment_count || 0),
                memoryIds.length
            ),
            memberCount: Math.max(
                0,
                Number(eventItem.memberCount || 0),
                Number(eventRecord && eventRecord.fragment_count || 0),
                memoryIds.length
            ),
            memoryIds: memoryIds,
            detailMemoryIds: detailMemoryIds,
            manualEdited: !!(eventItem.manualEdited || eventRecord && eventRecord.manual_edited),
            updatedAt: updatedAt
        });
    }

    async function fetchRegressionDbSnapshot(eventId, options) {
        const safeEventId = toTrimmedString(eventId);
        const optionSource = options && typeof options === 'object' ? options : {};
        const safeCharId = toTrimmedString(optionSource.charId || optionSource.char_id || state.filters.charId);
        const client = getClient();

        if (!safeEventId || !client) {
            return buildRegressionComparableState({
                exists: false,
                eventId: safeEventId,
                charId: safeCharId,
                error: '当前环境不支持读取数据库事件'
            });
        }

        let eventRecord = null;
        let memberItems = [];
        const errors = [];

        if (typeof client.getEventRecord === 'function') {
            const eventResult = await client.getEventRecord(safeEventId, {
                charId: safeCharId
            }).catch(function onGetEventRecordError(error) {
                return {
                    ok: false,
                    error: toTrimmedString(error && error.message) || 'get_event_record_failed',
                    event: null
                };
            });
            if (eventResult && eventResult.ok === true) {
                eventRecord = eventResult.event || null;
            } else if (eventResult && eventResult.error) {
                errors.push(`事件表：${eventResult.error}`);
            }
        } else {
            errors.push('事件表：接口缺失');
        }

        if (typeof client.listEventMembers === 'function') {
            const memberResult = await client.listEventMembers({
                charId: safeCharId,
                eventId: safeEventId,
                limit: 240
            }).catch(function onListEventMembersError(error) {
                return {
                    ok: false,
                    error: toTrimmedString(error && error.message) || 'list_event_members_failed',
                    items: []
                };
            });
            if (memberResult && memberResult.ok === true && Array.isArray(memberResult.items)) {
                memberItems = memberResult.items.filter(Boolean);
            } else if (memberResult && memberResult.error) {
                errors.push(`成员表：${memberResult.error}`);
            }
        } else {
            errors.push('成员表：接口缺失');
        }

        const anchor = memberItems[0] || null;
        const memoryIds = normalizeIdArray(
            eventRecord && Array.isArray(eventRecord.memory_ids) && eventRecord.memory_ids.length > 0
                ? eventRecord.memory_ids
                : memberItems.map(function mapId(item) {
                    return item && item.id;
                }),
            96
        );
        const detailMemoryIds = normalizeIdArray(
            eventRecord && Array.isArray(eventRecord.detail_memory_ids) && eventRecord.detail_memory_ids.length > 0
                ? eventRecord.detail_memory_ids
                : memoryIds,
            24
        );
        const unresolvedCount = memberItems.filter(function countUnresolved(item) {
            return !isMemoryResolved(item);
        }).length;

        return buildRegressionComparableState({
            exists: !!eventRecord,
            eventId: safeEventId,
            charId: toTrimmedString(
                eventRecord && eventRecord.char_id
                || anchor && anchor.char_id
                || safeCharId
            ),
            title: toTrimmedString(eventRecord && eventRecord.title) || getMemoryEventTitle(anchor),
            summary: toTrimmedString(eventRecord && eventRecord.summary) || getMemoryEventSummary(anchor),
            status: toTrimmedString(eventRecord && eventRecord.status) || (unresolvedCount > 0 ? 'open' : 'closed'),
            depth: toTrimmedString(eventRecord && eventRecord.depth) || getMemoryEventDepth(anchor),
            isUnresolved: eventRecord && eventRecord.is_unresolved !== undefined
                ? toBoolean(eventRecord.is_unresolved)
                : unresolvedCount > 0,
            fragmentCount: Math.max(
                0,
                Number(eventRecord && eventRecord.fragment_count || 0),
                memberItems.length,
                memoryIds.length
            ),
            memberCount: Math.max(
                0,
                Number(eventRecord && eventRecord.fragment_count || 0),
                memberItems.length,
                memoryIds.length
            ),
            memoryIds: memoryIds,
            detailMemoryIds: detailMemoryIds,
            manualEdited: !!(eventRecord && eventRecord.manual_edited),
            updatedAt: toTrimmedString(eventRecord && eventRecord.updated_at),
            error: errors.join('；')
        });
    }

    async function resolveRegressionEventSource(eventId, options) {
        const safeEventId = toTrimmedString(eventId);
        const optionSource = options && typeof options === 'object' ? options : {};
        const uiSnapshot = buildRegressionUiSnapshot(safeEventId);
        const safeCharId = toTrimmedString(
            optionSource.charId
            || optionSource.char_id
            || uiSnapshot.charId
            || state.filters.charId
        );
        const dbSnapshot = await fetchRegressionDbSnapshot(safeEventId, {
            charId: safeCharId
        });
        const resolvedCharId = toTrimmedString(dbSnapshot.charId || uiSnapshot.charId || safeCharId);

        return {
            eventId: safeEventId,
            charId: resolvedCharId,
            capturedAt: new Date().toISOString(),
            ui: buildRegressionComparableState(Object.assign({}, uiSnapshot, {
                eventId: safeEventId,
                charId: uiSnapshot.charId || resolvedCharId
            })),
            db: buildRegressionComparableState(Object.assign({}, dbSnapshot, {
                eventId: safeEventId,
                charId: dbSnapshot.charId || resolvedCharId
            }))
        };
    }

    function formatRegressionStatusLabel(status, isUnresolved) {
        const safeStatus = toTrimmedString(status).toLowerCase();
        const unresolved = isUnresolved !== undefined ? toBoolean(isUnresolved) : safeStatus === 'open';
        if (safeStatus === 'open' || unresolved) return '未了结';
        if (safeStatus === 'closed' || unresolved === false) return '已了结';
        return safeStatus || '未记录';
    }

    function formatRegressionDepthLabel(depth) {
        const safeDepth = toTrimmedString(depth).toLowerCase();
        if (safeDepth === 'high') return '深层事件';
        if (safeDepth === 'low') return '浅层事件';
        if (safeDepth === 'medium') return '中层事件';
        return safeDepth || '未记录';
    }

    function formatRegressionBoolLabel(value) {
        return value ? '是' : '否';
    }

    function formatRegressionTextLabel(value, maxLength) {
        const text = toTrimmedString(value);
        if (!text) return '未记录';
        return summarizeContent(text, Math.max(12, Number(maxLength) || 32));
    }

    function formatRegressionDateLabel(value) {
        const text = toTrimmedString(value);
        return text ? formatDateTime(text) : '未记录';
    }

    function describeRegressionIdSetDiff(beforeIds, afterIds) {
        const previous = normalizeIdArray(beforeIds, 96);
        const current = normalizeIdArray(afterIds, 96);
        const added = current.filter(function filterAdded(id) {
            return !previous.includes(id);
        });
        const removed = previous.filter(function filterRemoved(id) {
            return !current.includes(id);
        });
        if (added.length <= 0 && removed.length <= 0) {
            return '';
        }

        const parts = [];
        if (added.length > 0) {
            parts.push(`新增 ${added.length} 个：${added.slice(0, 6).join(', ')}${added.length > 6 ? '...' : ''}`);
        }
        if (removed.length > 0) {
            parts.push(`移除 ${removed.length} 个：${removed.slice(0, 6).join(', ')}${removed.length > 6 ? '...' : ''}`);
        }
        return parts.join('；');
    }

    function buildRegressionDiffSection(title, beforeState, afterState) {
        const previous = buildRegressionComparableState(beforeState);
        const current = buildRegressionComparableState(afterState);
        const lines = [];
        let changeCount = 0;

        if (!previous.exists && !current.exists) {
            lines.push('前后都没读到这个事件');
            return { title: title, lines: lines, changeCount: 0 };
        }
        if (previous.exists && !current.exists) {
            lines.push('这次已经读不到这个事件');
            return { title: title, lines: lines, changeCount: 1 };
        }
        if (!previous.exists && current.exists) {
            lines.push('这次新读到了这个事件');
            return { title: title, lines: lines, changeCount: 1 };
        }

        function pushChange(text) {
            lines.push(text);
            changeCount += 1;
        }

        if (previous.title !== current.title) {
            pushChange(`标题：${formatRegressionTextLabel(previous.title, 28)} -> ${formatRegressionTextLabel(current.title, 28)}`);
        }
        if (previous.summary !== current.summary) {
            pushChange(`摘要：${formatRegressionTextLabel(previous.summary, 44)} -> ${formatRegressionTextLabel(current.summary, 44)}`);
        }
        if (previous.status !== current.status || previous.isUnresolved !== current.isUnresolved) {
            pushChange(`状态：${formatRegressionStatusLabel(previous.status, previous.isUnresolved)} -> ${formatRegressionStatusLabel(current.status, current.isUnresolved)}`);
        }
        if (previous.depth !== current.depth) {
            pushChange(`深度：${formatRegressionDepthLabel(previous.depth)} -> ${formatRegressionDepthLabel(current.depth)}`);
        }
        if (previous.memberCount !== current.memberCount) {
            pushChange(`成员数：${previous.memberCount} -> ${current.memberCount}`);
        }

        const memoryIdDiff = describeRegressionIdSetDiff(previous.memoryIds, current.memoryIds);
        if (memoryIdDiff) {
            pushChange(`成员 ID：${memoryIdDiff}`);
        }

        const detailMemoryIdDiff = describeRegressionIdSetDiff(previous.detailMemoryIds, current.detailMemoryIds);
        if (detailMemoryIdDiff) {
            pushChange(`详情 ID：${detailMemoryIdDiff}`);
        }

        if (previous.manualEdited !== current.manualEdited) {
            pushChange(`人工编辑标记：${formatRegressionBoolLabel(previous.manualEdited)} -> ${formatRegressionBoolLabel(current.manualEdited)}`);
        }
        if (previous.updatedAt !== current.updatedAt) {
            pushChange(`更新时间：${formatRegressionDateLabel(previous.updatedAt)} -> ${formatRegressionDateLabel(current.updatedAt)}`);
        }

        if (lines.length <= 0) {
            lines.push('没看出变化');
        }
        return {
            title: title,
            lines: lines,
            changeCount: changeCount
        };
    }

    function buildRegressionConsistencySection(uiState, dbState) {
        const ui = buildRegressionComparableState(uiState);
        const db = buildRegressionComparableState(dbState);
        const lines = [];
        let changeCount = 0;

        if (!ui.exists && !db.exists) {
            lines.push('当前页和数据库都没读到这个事件');
            if (db.error) {
                lines.push(`数据库读取备注：${db.error}`);
            }
            return { title: '当前页面 vs 数据库', lines: lines, changeCount: 0 };
        }

        if (!ui.exists && db.exists) {
            lines.push('当前页没有它，但数据库里还在');
            changeCount += 1;
        } else if (ui.exists && !db.exists) {
            lines.push('当前页还有它，但数据库里没读到事件记录');
            changeCount += 1;
        } else {
            function pushMismatch(text) {
                lines.push(text);
                changeCount += 1;
            }

            if (ui.title !== db.title) {
                pushMismatch(`标题不一致：页面=${formatRegressionTextLabel(ui.title, 24)} / 数据库=${formatRegressionTextLabel(db.title, 24)}`);
            }
            if (ui.summary !== db.summary) {
                pushMismatch(`摘要不一致：页面=${formatRegressionTextLabel(ui.summary, 36)} / 数据库=${formatRegressionTextLabel(db.summary, 36)}`);
            }
            if (ui.status !== db.status || ui.isUnresolved !== db.isUnresolved) {
                pushMismatch(`状态不一致：页面=${formatRegressionStatusLabel(ui.status, ui.isUnresolved)} / 数据库=${formatRegressionStatusLabel(db.status, db.isUnresolved)}`);
            }
            if (ui.depth !== db.depth) {
                pushMismatch(`深度不一致：页面=${formatRegressionDepthLabel(ui.depth)} / 数据库=${formatRegressionDepthLabel(db.depth)}`);
            }
            if (ui.memberCount !== db.memberCount) {
                pushMismatch(`成员数不一致：页面=${ui.memberCount} / 数据库=${db.memberCount}`);
            }

            const memberIdDiff = describeRegressionIdSetDiff(ui.memoryIds, db.memoryIds);
            if (memberIdDiff) {
                pushMismatch(`成员 ID 不一致：${memberIdDiff}`);
            }

            const detailIdDiff = describeRegressionIdSetDiff(ui.detailMemoryIds, db.detailMemoryIds);
            if (detailIdDiff) {
                pushMismatch(`详情 ID 不一致：${detailIdDiff}`);
            }

            if (ui.manualEdited !== db.manualEdited) {
                pushMismatch(`人工编辑标记不一致：页面=${formatRegressionBoolLabel(ui.manualEdited)} / 数据库=${formatRegressionBoolLabel(db.manualEdited)}`);
            }
        }

        if (lines.length <= 0) {
            lines.push('当前页和数据库看起来一致');
        }
        if (db.error) {
            lines.push(`数据库读取备注：${db.error}`);
        }

        return {
            title: '当前页面 vs 数据库',
            lines: lines,
            changeCount: changeCount
        };
    }

    function buildRegressionDiffSummary(beforeSnapshot, afterSnapshot) {
        const previous = beforeSnapshot && typeof beforeSnapshot === 'object' ? beforeSnapshot : {};
        const current = afterSnapshot && typeof afterSnapshot === 'object' ? afterSnapshot : {};
        const eventId = toTrimmedString(current.eventId || previous.eventId);
        const eventLabel = buildRegressionEventLabel(previous, eventId);
        const uiSection = buildRegressionDiffSection('页面变化', previous.ui, current.ui);
        const dbSection = buildRegressionDiffSection('数据库变化', previous.db, current.db);
        const consistencySection = buildRegressionConsistencySection(current.ui, current.db);
        const totalChanges = uiSection.changeCount + dbSection.changeCount;

        let summary = '';
        if (consistencySection.changeCount > 0) {
            summary = `页面和数据库有 ${consistencySection.changeCount} 处对不上`;
        } else if (totalChanges <= 0) {
            summary = '页面和数据库都没看出变化';
        } else {
            summary = `页面变化 ${uiSection.changeCount} 处，数据库变化 ${dbSection.changeCount} 处`;
        }

        const textLines = [
            `跟踪事件：${eventLabel}`,
            `事件 ID：${eventId || '未记录'}`,
            `基线时间：${formatDateTime(previous.capturedAt)}`,
            `本次检查：${formatDateTime(current.capturedAt)}`,
            '',
            `${uiSection.title}：`
        ]
            .concat(uiSection.lines.map(function mapLine(line) {
                return `- ${line}`;
            }))
            .concat([
                '',
                `${dbSection.title}：`
            ])
            .concat(dbSection.lines.map(function mapLine(line) {
                return `- ${line}`;
            }))
            .concat([
                '',
                `${consistencySection.title}：`
            ])
            .concat(consistencySection.lines.map(function mapLine(line) {
                return `- ${line}`;
            }));

        return {
            summary: summary,
            text: textLines.join('\n'),
            toastType: consistencySection.changeCount > 0 || current.db && current.db.error ? 'info' : 'success',
            createdAt: current.capturedAt,
            changeCount: totalChanges,
            consistencyCount: consistencySection.changeCount
        };
    }

    async function handleRememberRegressionEvent(eventId) {
        const safeEventId = toTrimmedString(eventId);
        if (!safeEventId) return;

        const helper = getRegressionHelperState();
        if (helper.busy) return;

        helper.busy = true;
        renderLayout();
        try {
            const snapshot = await resolveRegressionEventSource(safeEventId, {
                charId: helper.trackedEventId === safeEventId
                    ? helper.trackedCharId
                    : state.filters.charId
            });
            if (!snapshot.ui.exists && !snapshot.db.exists) {
                showToastSafe('当前页和数据库都没读到这个事件，暂时不能记住它', 'info');
                return;
            }

            helper.trackedEventId = safeEventId;
            helper.trackedCharId = snapshot.charId || toTrimmedString(state.filters.charId);
            helper.snapshot = snapshot;
            helper.lastReport = null;

            showToastSafe(`已记住事件“${buildRegressionEventLabel(snapshot, safeEventId)}”`, 'success');
            if (snapshot.db && snapshot.db.error) {
                showToastSafe(`数据库读取备注：${snapshot.db.error}`, 'info');
            }
        } catch (error) {
            showToastSafe(error && error.message ? error.message : '记住事件失败，请稍后重试', 'error');
        } finally {
            helper.busy = false;
            renderLayout();
        }
    }

    async function handleCheckRegressionEvent(eventId) {
        const helper = getRegressionHelperState();
        const trackedEventId = toTrimmedString(helper.trackedEventId);
        const safeEventId = toTrimmedString(eventId || trackedEventId);
        const snapshot = helper.snapshot && typeof helper.snapshot === 'object'
            ? helper.snapshot
            : null;

        if (!safeEventId || !snapshot || trackedEventId !== safeEventId) {
            showToastSafe('先点一下“记住此事件”，助手才能帮你比对变化', 'info');
            return;
        }
        if (helper.busy) return;

        helper.busy = true;
        renderLayout();
        try {
            const current = await resolveRegressionEventSource(safeEventId, {
                charId: helper.trackedCharId || snapshot.charId || state.filters.charId
            });
            const report = buildRegressionDiffSummary(snapshot, current);
            helper.lastReport = report;
            showAlertSafe('回归助手', report.text);
            showToastSafe(`检查完成：${report.summary}`, report.toastType);
        } catch (error) {
            showToastSafe(error && error.message ? error.message : '检查失败，请稍后重试', 'error');
        } finally {
            helper.busy = false;
            renderLayout();
        }
    }

    function handleClearRegressionEvent(eventId) {
        const helper = getRegressionHelperState();
        const trackedEventId = toTrimmedString(helper.trackedEventId);
        const safeEventId = toTrimmedString(eventId);
        if (!trackedEventId || helper.busy) return;
        if (safeEventId && safeEventId !== trackedEventId) return;

        const eventLabel = buildRegressionEventLabel(helper.snapshot, trackedEventId);
        resetRegressionHelperState();
        renderLayout();
        showToastSafe(`已清除对“${eventLabel}”的跟踪`, 'info');
    }

    function listEventCandidatesForAttach(excludedEventId) {
        const safeExcludedEventId = toTrimmedString(excludedEventId);
        const items = state.data && state.data.list && Array.isArray(state.data.list.items)
            ? state.data.list.items
            : [];
        const displayItems = buildListDisplayItems(items, {
            recordType: 'event',
            eventRecordsById: state.data && state.data.list ? state.data.list.eventRecordsById : {}
        });
        return displayItems
            .filter(function keepEvent(item) {
                const eventId = toTrimmedString(item && item.eventId);
                if (!item || item.kind !== 'event' || !eventId) return false;
                if (safeExcludedEventId && eventId === safeExcludedEventId) return false;
                return true;
            })
            .sort(function sortByLatest(left, right) {
                return Number(right && right.latestTimestamp || 0) - Number(left && left.latestTimestamp || 0);
            });
    }

    /**
     * 关闭管理台内的自定义弹窗。
     */
    function closeAdminDialog() {
        state.adminDialog = null;
        renderLayout();
    }

    function findNotebookRecord(kind, itemId) {
        const safeKind = toTrimmedString(kind);
        const safeItemId = toTrimmedString(itemId);
        if (!safeKind || !safeItemId) return null;

        const notebook = getNotebookData();
        let list = [];
        if (safeKind === 'redline') {
            list = notebook.pendingRedlines.concat(notebook.redlines);
        } else if (safeKind === 'mustRemember') {
            list = notebook.mustRemember;
        } else if (safeKind === 'profile') {
            list = notebook.profiles;
        }

        return list.find(function matchItem(item) {
            return toTrimmedString(item && item.id) === safeItemId;
        }) || null;
    }

    function parseNotebookSignalsInput(value) {
        const raw = toTrimmedString(value);
        if (!raw) return [];
        const parts = raw.split(/[\/,，、\n\r]+/);
        const result = [];
        const seen = new Set();
        parts.forEach(function appendPart(item) {
            const text = toTrimmedString(item);
            if (!text || seen.has(text)) return;
            seen.add(text);
            result.push(text);
        });
        return result;
    }

    function resolveNotebookDurationPreset(hours) {
        const numeric = Number(hours);
        if (!Number.isFinite(numeric) || numeric <= 0) return '';
        if (numeric >= 336) return '336';
        if (numeric >= 72) return '72';
        return '6';
    }

    function openNotebookEditorDialog(kind, mode, options) {
        const safeKind = toTrimmedString(kind);
        const safeMode = toTrimmedString(mode) || 'create';
        const safeOptions = options && typeof options === 'object' ? options : {};
        const charId = toTrimmedString(state.filters.charId);
        if (!charId) {
            showToastSafe('请先选择一个角色后再管理记事本。', 'info');
            return;
        }

        let sourceItem = null;
        if (safeOptions.itemId) {
            sourceItem = findNotebookRecord(safeKind, safeOptions.itemId);
            if (!sourceItem) {
                showToastSafe('未找到对应条目，请刷新后重试。', 'error');
                return;
            }
        }

        state.adminDialog = {
            type: 'notebook-editor',
            notebookKind: safeKind,
            mode: safeMode,
            itemId: sourceItem ? toTrimmedString(sourceItem.id) : '',
            content: toTrimmedString(sourceItem && sourceItem.content),
            category: toTrimmedString(safeOptions.category || (sourceItem && sourceItem.category) || (safeKind === 'profile' ? 'preference' : safeKind === 'mustRemember' ? 'fact' : 'important')),
            severity: toTrimmedString(sourceItem && sourceItem.severity) || 'important',
            confidence: toTrimmedString(sourceItem && sourceItem.confidence) || 'stated',
            busy: false
        };
        renderLayout();
    }

    async function refreshNotebookTab() {
        state.activeTab = 'notebook';
        await refreshActiveTab();
    }

    function buildNotebookFeedbackSnapshot(kind, item) {
        const safeKind = toTrimmedString(kind);
        const source = item && typeof item === 'object' ? item : {};
        const snapshot = {
            content: toTrimmedString(source.content)
        };

        if (safeKind === 'redline') {
            snapshot.severity = toTrimmedString(source.severity) || 'important';
            snapshot.originContext = toTrimmedString(source.origin_context || source.originContext);
            return snapshot;
        }

        if (safeKind === 'mustRemember') {
            snapshot.category = toTrimmedString(source.category) || 'fact';
            snapshot.originContext = toTrimmedString(source.origin_context || source.originContext);
            return snapshot;
        }

        if (safeKind === 'profile') {
            snapshot.category = toTrimmedString(source.category) || 'preference';
            snapshot.confidence = toTrimmedString(source.confidence) || 'stated';
            return snapshot;
        }

        return snapshot;
    }

    async function recordNotebookFeedbackAction(kind, action, payload) {
        const client = getClient();
        const charId = toTrimmedString(state.filters.charId);
        if (!client || !charId || typeof client.recordNotebookFeedback !== 'function') {
            return null;
        }

        try {
            const result = await client.recordNotebookFeedback(charId, Object.assign({}, payload, {
                kind: kind,
                action: action
            }));
            if (result && typeof result === 'object' && state.data && state.data.notebook && typeof state.data.notebook === 'object') {
                state.data.notebook.learningProfile = result;
            }
            return result;
        } catch (error) {
            console.warn('[海马体管理台] 写入记事本反馈失败，已跳过。', error);
            return null;
        }
    }

    async function recordNotebookBatchFeedback(kind, records, execution, extraPayload) {
        const safeKind = normalizeNotebookSelectionKind(kind);
        const safeRecords = Array.isArray(records) ? records.filter(Boolean) : [];
        const safeExecution = execution && typeof execution === 'object' ? execution : {};
        if (!safeKind || safeRecords.length <= 0) return null;

        const successIdSet = new Set(
            Array.isArray(safeExecution.rawResult && safeExecution.rawResult.successIds)
                ? safeExecution.rawResult.successIds.map(toTrimmedString).filter(Boolean)
                : []
        );
        const failedIdSet = new Set(
            Array.isArray(safeExecution.failed)
                ? safeExecution.failed.map(function mapFailed(item) {
                    return toTrimmedString(item && item.id);
                }).filter(Boolean)
                : []
        );

        const succeededRecords = safeRecords.filter(function filterSucceeded(record) {
            const recordId = toTrimmedString(record && record.id);
            if (!recordId) return false;
            if (successIdSet.size > 0) return successIdSet.has(recordId);
            return !failedIdSet.has(recordId);
        });

        let latestProfile = null;
        for (let index = 0; index < succeededRecords.length; index += 1) {
            latestProfile = await recordNotebookFeedbackAction(safeKind, 'batch_delete', Object.assign({}, extraPayload, {
                item: buildNotebookFeedbackSnapshot(safeKind, succeededRecords[index])
            }));
        }
        return latestProfile;
    }

    async function handleResetNotebookLearning() {
        const client = getClient();
        const charId = toTrimmedString(state.filters.charId);
        if (!client || typeof client.resetNotebookLearningProfile !== 'function') {
            showToastSafe('当前环境暂不支持重置记事本学习画像。', 'error');
            return;
        }
        if (!charId) {
            showToastSafe('请先选择一个角色，再重置学习画像。', 'info');
            return;
        }

        showConfirmSafe(
            '重置记事本学习画像',
            '这会清空当前角色通过删改记事本累积出来的抽象偏好画像，但不会删除任何现有记事本条目。确定继续吗？',
            async function onConfirmResetNotebookLearning() {
                try {
                    const profile = await client.resetNotebookLearningProfile(charId);
                    if (profile && state.data && state.data.notebook && typeof state.data.notebook === 'object') {
                        state.data.notebook.learningProfile = profile;
                    }
                    await refreshNotebookTab();
                    showToastSafe('已重置记事本学习画像。', 'success');
                } catch (error) {
                    showToastSafe(error && error.message ? error.message : '重置失败，请稍后重试', 'error');
                }
            },
            null,
            '重置',
            '取消'
        );
    }

    async function handleClearNotebookRuntimeHistory() {
        const client = getClient();
        const charId = toTrimmedString(state.filters.charId);
        if (!client || typeof client.clearNotebookRuntimeHistory !== 'function') {
            showToastSafe('当前环境暂不支持清空记事本运行历史。', 'error');
            return;
        }
        if (!charId) {
            showToastSafe('请先选择一个角色，再清空运行历史。', 'info');
            return;
        }

        showConfirmSafe(
            '清空记事本运行历史',
            '这会清空当前角色本地保存的记事本运行时间线，但不会影响任何记事本条目本身。确定继续吗？',
            async function onConfirmClearNotebookRuntimeHistory() {
                try {
                    const result = await client.clearNotebookRuntimeHistory(charId);
                    if (result && result.ok) {
                        await refreshNotebookTab();
                        showToastSafe('记事本运行历史已清空。', 'success');
                        return;
                    }
                    showToastSafe('清空记事本运行历史失败，请稍后再试。', 'error');
                } catch (error) {
                    showToastSafe(error && error.message ? error.message : '清空失败，请稍后重试', 'error');
                }
            },
            null,
            '清空',
            '取消'
        );
    }

    function getNotebookCompactionHelperState() {
        if (!state.notebookCompactionHelper || typeof state.notebookCompactionHelper !== 'object') {
            state.notebookCompactionHelper = {
                busy: false,
                saveBusy: false
            };
        }
        return state.notebookCompactionHelper;
    }

    async function handleTriggerNotebookCompaction() {
        const client = getClient();
        const charId = toTrimmedString(state.filters.charId);
        const helper = getNotebookCompactionHelperState();
        if (!client || typeof client.adminTriggerNotebookCompaction !== 'function') {
            showToastSafe('当前环境暂不支持记事本整理归档。', 'error');
            return;
        }
        if (!charId) {
            showToastSafe('请先选择一个角色，再整理记事本。', 'info');
            return;
        }

        helper.busy = true;
        renderLayout();
        try {
            const result = await client.adminTriggerNotebookCompaction(charId);
            helper.busy = false;
            await refreshNotebookTab();
            if (result && result.ok) {
                showToastSafe('记事本整理完成。', 'success');
                return;
            }
            showToastSafe(result && result.error ? result.error : '整理失败，请稍后重试。', 'error');
        } catch (error) {
            helper.busy = false;
            renderLayout();
            showToastSafe(error && error.message ? error.message : '整理失败，请稍后重试。', 'error');
        }
    }

    async function submitNotebookCompactionForm(formData) {
        const client = getClient();
        const compactedId = toTrimmedString(formData.get('compactedId'));
        const compactedText = toTrimmedString(formData.get('compactedText'));
        const groupsText = toTrimmedString(formData.get('groupsText'));
        const helper = getNotebookCompactionHelperState();
        if (!client || typeof client.adminUpdateNotebookCompaction !== 'function') {
            showToastSafe('当前环境暂不支持保存整理归档。', 'error');
            return;
        }
        if (!compactedId) {
            showToastSafe('还没有可保存的整理结果。', 'info');
            return;
        }
        if (!compactedText) {
            showToastSafe('整理后的文本不能为空。', 'error');
            return;
        }

        let groups = [];
        if (groupsText) {
            try {
                const parsed = JSON.parse(groupsText);
                groups = Array.isArray(parsed) ? parsed : [];
            } catch (_) {
                showToastSafe('分组 JSON 格式不对，先检查一下括号和引号。', 'error');
                return;
            }
        }

        helper.saveBusy = true;
        renderLayout();
        try {
            await client.adminUpdateNotebookCompaction(compactedId, groups, compactedText);
            helper.saveBusy = false;
            await refreshNotebookTab();
            showToastSafe('整理归档已保存。', 'success');
        } catch (error) {
            helper.saveBusy = false;
            renderLayout();
            showToastSafe(error && error.message ? error.message : '保存失败，请稍后重试。', 'error');
        }
    }

    async function handleRollbackNotebookCompaction() {
        const client = getClient();
        const notebook = getNotebookData();
        const compacted = notebook && notebook.compacted && typeof notebook.compacted === 'object'
            ? notebook.compacted
            : null;
        const compactedId = toTrimmedString(compacted && compacted.id);
        if (!client || typeof client.adminDeleteNotebookCompaction !== 'function') {
            showToastSafe('当前环境暂不支持回退整理归档。', 'error');
            return;
        }
        if (!compactedId) {
            showToastSafe('当前没有整理归档结果可回退。', 'info');
            return;
        }

        showConfirmSafe(
            '回退整理归档',
            '回退后，记事本会暂时恢复成原始条目平铺注入。原始条目不会被删除。确定继续吗？',
            async function onConfirmRollbackNotebookCompaction() {
                try {
                    await client.adminDeleteNotebookCompaction(compactedId);
                    await refreshNotebookTab();
                    showToastSafe('已回退到原始条目。', 'success');
                } catch (error) {
                    showToastSafe(error && error.message ? error.message : '回退失败，请稍后重试。', 'error');
                }
            },
            null,
            '回退',
            '取消'
        );
    }

    async function submitNotebookDialog(formData) {
        const dialog = state.adminDialog && typeof state.adminDialog === 'object'
            ? state.adminDialog
            : null;
        if (!dialog || dialog.type !== 'notebook-editor') return;

        const client = getClient();
        const charId = toTrimmedString(state.filters.charId);
        const kind = toTrimmedString(formData.get('kind'));
        const mode = toTrimmedString(formData.get('mode')) || 'create';
        const itemId = toTrimmedString(formData.get('itemId'));
        const draftDialog = Object.assign({}, dialog, {
            busy: false,
            content: toTrimmedString(formData.get('content')),
            category: toTrimmedString(formData.get('category')),
            severity: toTrimmedString(formData.get('severity')),
            confidence: toTrimmedString(formData.get('confidence')),
            startedReason: toTrimmedString(formData.get('startedReason')),
            endReason: toTrimmedString(formData.get('endReason')),
            signals: toTrimmedString(formData.get('signals')),
            endSignals: toTrimmedString(formData.get('endSignals')),
            durationPreset: toTrimmedString(formData.get('durationPreset'))
        });
        const feedbackBeforeItem = mode === 'edit' && itemId
            ? buildNotebookFeedbackSnapshot(kind, findNotebookRecord(kind, itemId))
            : null;
        if (!client || !charId) {
            showToastSafe('当前环境暂不支持记事本编辑。', 'error');
            return;
        }

        state.adminDialog = Object.assign({}, dialog, { busy: true });
        renderLayout();

        try {
            if (kind === 'redline') {
                const content = toTrimmedString(formData.get('content'));
                const severity = toTrimmedString(formData.get('severity')) || 'important';
                if (!content) {
                    showToastSafe('底线内容不能为空。', 'error');
                    state.adminDialog = draftDialog;
                    renderLayout();
                    return;
                }

                let savedRedline = null;
                if (mode === 'edit' && itemId && typeof client.adminUpdateRedline === 'function') {
                    savedRedline = await client.adminUpdateRedline(itemId, {
                        content: content,
                        severity: severity,
                        origin: 'user_declared',
                        originContext: '用户在管理后台手动编辑',
                        confirmed: true
                    });
                } else {
                    savedRedline = await client.adminAddRedline(charId, {
                        content: content,
                        severity: severity,
                        origin: 'user_declared',
                        originContext: '用户在管理后台手动添加'
                    });
                }
                await recordNotebookFeedbackAction('redline', mode === 'edit' ? 'manual_edit' : 'manual_add', mode === 'edit'
                    ? {
                        before: feedbackBeforeItem,
                        after: buildNotebookFeedbackSnapshot('redline', savedRedline || {
                            content: content,
                            severity: severity
                        })
                    }
                    : {
                        after: buildNotebookFeedbackSnapshot('redline', savedRedline || {
                            content: content,
                            severity: severity
                        })
                    });
                state.adminDialog = null;
                await refreshNotebookTab();
                showToastSafe(mode === 'edit' ? '底线已更新' : '已新增底线', 'success');
                return;
            }

            if (kind === 'mustRemember') {
                const content = toTrimmedString(formData.get('content'));
                const category = toTrimmedString(formData.get('category')) || 'fact';
                if (!content) {
                    showToastSafe('必须牢记事项不能为空。', 'error');
                    state.adminDialog = draftDialog;
                    renderLayout();
                    return;
                }

                let savedMustRemember = null;
                if (mode === 'edit' && itemId) {
                    savedMustRemember = await client.adminUpdateMustRemember(itemId, {
                        content: content,
                        category: category
                    });
                } else {
                    savedMustRemember = await client.adminAddMustRemember(charId, {
                        content: content,
                        category: category,
                        origin: 'manual_promoted',
                        originContext: '用户在管理后台手动添加'
                    });
                }
                await recordNotebookFeedbackAction('mustRemember', mode === 'edit' ? 'manual_edit' : 'manual_add', mode === 'edit'
                    ? {
                        before: feedbackBeforeItem,
                        after: buildNotebookFeedbackSnapshot('mustRemember', savedMustRemember || {
                            content: content,
                            category: category
                        })
                    }
                    : {
                        after: buildNotebookFeedbackSnapshot('mustRemember', savedMustRemember || {
                            content: content,
                            category: category
                        })
                    });
                state.adminDialog = null;
                await refreshNotebookTab();
                showToastSafe(mode === 'edit' ? '必须牢记事项已更新' : '已新增必须牢记事项', 'success');
                return;
            }

            if (kind === 'profile') {
                const content = toTrimmedString(formData.get('content'));
                const category = toTrimmedString(formData.get('category')) || 'preference';
                const confidence = toTrimmedString(formData.get('confidence')) || 'stated';
                if (!content) {
                    showToastSafe('档案内容不能为空。', 'error');
                    state.adminDialog = draftDialog;
                    renderLayout();
                    return;
                }

                let savedProfile = null;
                if (mode === 'edit' && itemId && typeof client.adminUpdateProfile === 'function') {
                    savedProfile = await client.adminUpdateProfile(itemId, {
                        content: content,
                        category: category,
                        confidence: confidence
                    });
                } else {
                    savedProfile = await client.adminAddProfile(charId, {
                        content: content,
                        category: category,
                        confidence: confidence
                    });
                }
                await recordNotebookFeedbackAction('profile', mode === 'edit' ? 'manual_edit' : 'manual_add', mode === 'edit'
                    ? {
                        before: feedbackBeforeItem,
                        after: buildNotebookFeedbackSnapshot('profile', savedProfile || {
                            content: content,
                            category: category,
                            confidence: confidence
                        })
                    }
                    : {
                        after: buildNotebookFeedbackSnapshot('profile', savedProfile || {
                            content: content,
                            category: category,
                            confidence: confidence
                        })
                    });
                state.adminDialog = null;
                await refreshNotebookTab();
                showToastSafe(mode === 'edit' ? '偏好档案已更新' : '已新增偏好档案', 'success');
                return;
            }

            showToastSafe('当前记事本操作暂不可用。', 'error');
            state.adminDialog = draftDialog;
            renderLayout();
        } catch (error) {
            state.adminDialog = draftDialog;
            renderLayout();
            showToastSafe(error && error.message ? error.message : '保存失败，请稍后重试', 'error');
        }
    }

    async function handleConfirmNotebookRedline(itemId) {
        const client = getClient();
        if (!client || typeof client.adminConfirmRedline !== 'function') {
            showToastSafe('当前环境暂不支持确认底线。', 'error');
            return;
        }

        const record = findNotebookRecord('redline', itemId);
        if (!record) {
            showToastSafe('未找到对应底线，请刷新后重试。', 'error');
            return;
        }

        showConfirmSafe(
            '确认底线',
            `确认把这条内容作为 TA 每次都必须遵守的底线吗？\n\n${toTrimmedString(record.content)}`,
            async function onConfirm() {
                try {
                    await client.adminConfirmRedline(itemId);
                    await recordNotebookFeedbackAction('redline', 'confirm', {
                        item: buildNotebookFeedbackSnapshot('redline', record)
                    });
                    await refreshNotebookTab();
                    showToastSafe('已确认到底线铁则', 'success');
                } catch (error) {
                    showToastSafe(error && error.message ? error.message : '确认失败，请稍后重试', 'error');
                }
            },
            null,
            '确认',
            '取消'
        );
    }

    async function handleDeactivateNotebookRedline(itemId) {
        const client = getClient();
        if (!client || typeof client.adminDeactivateRedline !== 'function') {
            showToastSafe('当前环境暂不支持撤销底线。', 'error');
            return;
        }

        const record = findNotebookRecord('redline', itemId);
        if (!record) {
            showToastSafe('未找到对应底线，请刷新后重试。', 'error');
            return;
        }

        showConfirmSafe(
            '撤销底线',
            `撤销后，这条内容将不再每轮生效。\n\n${toTrimmedString(record.content)}`,
            async function onConfirm() {
                try {
                    await client.adminDeactivateRedline(itemId);
                    await recordNotebookFeedbackAction('redline', 'delete', {
                        before: buildNotebookFeedbackSnapshot('redline', record)
                    });
                    await refreshNotebookTab();
                    showToastSafe('底线已撤销', 'success');
                } catch (error) {
                    showToastSafe(error && error.message ? error.message : '撤销失败，请稍后重试', 'error');
                }
            },
            null,
            '撤销',
            '取消'
        );
    }

    async function handleDeactivateNotebookMustRemember(itemId) {
        const client = getClient();
        if (!client || typeof client.adminDeactivateMustRemember !== 'function') {
            showToastSafe('当前环境暂不支持删除必须牢记事项。', 'error');
            return;
        }

        const record = findNotebookRecord('mustRemember', itemId);
        if (!record) {
            showToastSafe('未找到对应事项，请刷新后重试。', 'error');
            return;
        }

        showConfirmSafe(
            '删除必须牢记事项',
            `删除后，这条内容将不再每轮注入。\n\n${toTrimmedString(record.content)}`,
            async function onConfirm() {
                try {
                    await client.adminDeactivateMustRemember(itemId);
                    await recordNotebookFeedbackAction('mustRemember', 'delete', {
                        before: buildNotebookFeedbackSnapshot('mustRemember', record)
                    });
                    await refreshNotebookTab();
                    showToastSafe('必须牢记事项已删除', 'success');
                } catch (error) {
                    showToastSafe(error && error.message ? error.message : '删除失败，请稍后重试', 'error');
                }
            },
            null,
            '删除',
            '取消'
        );
    }

    async function handleDeactivateNotebookProfile(itemId) {
        const client = getClient();
        if (!client || typeof client.adminDeactivateProfile !== 'function') {
            showToastSafe('当前环境暂不支持删除偏好档案。', 'error');
            return;
        }

        const record = findNotebookRecord('profile', itemId);
        if (!record) {
            showToastSafe('未找到对应档案，请刷新后重试。', 'error');
            return;
        }

        showConfirmSafe(
            '删除偏好档案',
            `删除后，TA 将不会继续把这条信息当作稳定了解。\n\n${toTrimmedString(record.content)}`,
            async function onConfirm() {
                try {
                    await client.adminDeactivateProfile(itemId);
                    await recordNotebookFeedbackAction('profile', 'delete', {
                        before: buildNotebookFeedbackSnapshot('profile', record)
                    });
                    await refreshNotebookTab();
                    showToastSafe('偏好档案已删除', 'success');
                } catch (error) {
                    showToastSafe(error && error.message ? error.message : '删除失败，请稍后重试', 'error');
                }
            },
            null,
            '删除',
            '取消'
        );
    }

    function getNotebookBatchActionConfig(kind) {
        const safeKind = normalizeNotebookSelectionKind(kind);
        if (!safeKind) return null;

        if (safeKind === 'redline') {
            return {
                kind: safeKind,
                methodName: 'adminBatchDeactivateRedline',
                title: '批量撤销底线',
                emptyMessage: '未找到可撤销的底线条目，请刷新后重试。',
                actionText: '撤销',
                buttonText: getNotebookBatchActionLabel(safeKind)
            };
        }
        if (safeKind === 'mustRemember') {
            return {
                kind: safeKind,
                methodName: 'adminBatchDeactivateMustRemember',
                title: '批量删除必须牢记事项',
                emptyMessage: '未找到可删除的必记条目，请刷新后重试。',
                actionText: '删除',
                buttonText: getNotebookBatchActionLabel(safeKind)
            };
        }
        if (safeKind === 'profile') {
            return {
                kind: safeKind,
                methodName: 'adminBatchDeactivateProfile',
                title: '批量删除偏好档案',
                emptyMessage: '未找到可删除的档案条目，请刷新后重试。',
                actionText: '删除',
                buttonText: getNotebookBatchActionLabel(safeKind)
            };
        }
        return null;
    }

    function collectNotebookBatchRecords(kind, itemIds) {
        const safeKind = normalizeNotebookSelectionKind(kind);
        const source = Array.isArray(itemIds) ? itemIds : [];
        if (!safeKind || source.length <= 0) return [];

        const seen = new Set();
        const records = [];
        source.forEach(function appendRecord(itemId) {
            const safeItemId = toTrimmedString(itemId);
            if (!safeItemId || seen.has(safeItemId)) return;
            seen.add(safeItemId);
            const record = findNotebookRecord(safeKind, safeItemId);
            if (record) records.push(record);
        });
        return records;
    }

    async function executeNotebookBatchDelete(kind, records) {
        const config = getNotebookBatchActionConfig(kind);
        const client = getClient();
        if (!config || !client || typeof client[config.methodName] !== 'function') {
            return {
                ok: false,
                message: config ? `当前环境暂不支持${config.buttonText}。` : '当前环境暂不支持该批量操作。',
                config: config
            };
        }

        const safeRecords = Array.isArray(records) ? records.filter(Boolean) : [];
        const payload = config.kind === 'status'
            ? safeRecords.map(function mapStatusRecord(item) {
                return {
                    id: toTrimmedString(item && item.id),
                    phase: toTrimmedString(item && item.phase)
                };
            })
            : safeRecords.map(function mapRecordId(item) {
                return toTrimmedString(item && item.id);
            }).filter(Boolean);

        const rawResult = await client[config.methodName](payload);
        const failed = Array.isArray(rawResult && rawResult.failed) ? rawResult.failed : [];
        const failCount = Math.max(0, Math.floor(Number(rawResult && rawResult.failCount) || failed.length));
        const successCount = Math.max(
            0,
            Math.floor(
                Number(rawResult && rawResult.successCount)
                || Math.max(0, payload.length - failCount)
            )
        );

        return {
            ok: true,
            config: config,
            rawResult: rawResult,
            successCount: successCount,
            failCount: failCount,
            failed: failed
        };
    }

    function buildNotebookBatchFailureLines(failed, kind, limit) {
        const safeFailed = Array.isArray(failed) ? failed : [];
        const maxCount = Math.max(1, Math.floor(Number(limit) || 8));
        const label = getNotebookCleanupKindLabel(kind);
        return safeFailed.slice(0, maxCount).map(function mapFailure(item, index) {
            const id = toTrimmedString(item && item.id) || `#${index + 1}`;
            const message = toTrimmedString(item && item.message) || 'unknown_error';
            return `${label} ${index + 1}. ${id} -> ${message}`;
        });
    }

    async function handleBatchDeleteNotebookItems(kind, options) {
        const config = getNotebookBatchActionConfig(kind);
        const safeKind = config && config.kind ? config.kind : '';
        const source = options && typeof options === 'object' ? options : {};
        if (!safeKind || !config) return;

        const selectedIds = Array.isArray(source.itemIds) && source.itemIds.length > 0
            ? source.itemIds.map(toTrimmedString).filter(Boolean)
            : getNotebookSelectionIds(safeKind);
        if (selectedIds.length <= 0) {
            showToastSafe(
                source.selectionHint === 'suppressed'
                    ? `当前没有可直接清理的${getNotebookCleanupKindLabel(safeKind)}“不会注入”条目。`
                    : '先选中要处理的条目，再批量删除。',
                'info'
            );
            return;
        }

        const records = collectNotebookBatchRecords(safeKind, selectedIds);
        if (records.length <= 0) {
            clearNotebookItemSelection(safeKind);
            renderLayout();
            showToastSafe(config.emptyMessage, 'error');
            return;
        }

        const previewLines = records.slice(0, 6).map(function mapRecord(item, index) {
            return `${index + 1}. ${toTrimmedString(item && item.content)}`;
        });
        const restCount = records.length - previewLines.length;
        const confirmLead = source.selectionHint === 'suppressed'
            ? '这些条目当前已经不会进入主聊天；清理后，它们也会从记事本面板里一起消失。'
            : `${config.actionText}后，这些内容将不再出现在每轮记事本注入里。`;
        const confirmText = [
            confirmLead,
            '',
            `本次共 ${records.length} 条：`,
            previewLines.join('\n'),
            restCount > 0 ? `... 另外还有 ${restCount} 条` : ''
        ].filter(Boolean).join('\n');

        showConfirmSafe(
            source.selectionHint === 'suppressed'
                ? `${config.title}（不会注入项）`
                : config.title,
            confirmText,
            async function onConfirm() {
                try {
                    const execution = await executeNotebookBatchDelete(safeKind, records);
                    if (!execution.ok) {
                        showToastSafe(execution.message || `${config.buttonText}失败，请稍后重试`, 'error');
                        return;
                    }

                    await recordNotebookBatchFeedback(safeKind, records, execution, source.selectionHint === 'suppressed'
                        ? {
                            source: 'suppressed',
                            reason: 'low_value'
                        }
                        : {});
                    clearNotebookItemSelection(safeKind);
                    await refreshNotebookTab();

                    if (execution.failCount <= 0) {
                        showToastSafe(`${config.buttonText}完成，共处理 ${execution.successCount} 条`, 'success');
                        return;
                    }

                    showToastSafe(
                        `${config.buttonText}完成：成功 ${execution.successCount} / 失败 ${execution.failCount}`,
                        execution.successCount > 0 ? 'info' : 'error'
                    );
                    showAlertSafe(
                        `${config.buttonText}有部分失败`,
                        buildNotebookBatchFailureLines(execution.failed, safeKind, 8).join('\n')
                    );
                } catch (error) {
                    showToastSafe(error && error.message ? error.message : `${config.buttonText}失败，请稍后重试`, 'error');
                }
            },
            null,
            config.buttonText,
            '取消'
        );
    }

    async function handleBatchDeleteAllNotebookSuppressedItems() {
        const cleanupPreview = getNotebookCleanupPreview();
        const groups = ['redline', 'mustRemember', 'profile'].map(function mapKind(kind) {
            const ids = getNotebookSuppressedIds(kind, cleanupPreview);
            return {
                kind: kind,
                ids: ids,
                records: collectNotebookBatchRecords(kind, ids)
            };
        }).filter(function keepGroup(group) {
            return group.records.length > 0;
        });

        if (groups.length <= 0) {
            showToastSafe('当前没有可一键清理的“不会注入”条目。', 'info');
            return;
        }

        const countLines = groups.map(function mapGroup(group) {
            return `- ${getNotebookCleanupKindLabel(group.kind)} ${group.records.length} 条`;
        });
        const previewLines = [];
        groups.forEach(function appendPreview(group) {
            group.records.slice(0, 2).forEach(function appendRecord(item) {
                if (previewLines.length >= 8) return;
                previewLines.push(`- [${getNotebookCleanupKindLabel(group.kind)}] ${toTrimmedString(item && item.content)}`);
            });
        });
        const remainingCount = groups.reduce(function countAll(total, group) {
            return total + group.records.length;
        }, 0) - previewLines.length;
        const confirmText = [
            '这些条目当前已经不会进入主聊天。确认后会按分类批量删除或归档，清理完成后它们也会从记事本面板里消失。',
            '',
            '本次将处理：',
            countLines.join('\n'),
            '',
            '预览：',
            previewLines.join('\n'),
            remainingCount > 0 ? `... 另外还有 ${remainingCount} 条` : ''
        ].filter(Boolean).join('\n');

        showConfirmSafe(
            '一键清理不会注入的记事本条目',
            confirmText,
            async function onConfirmAll() {
                let totalSuccess = 0;
                let totalFail = 0;
                const failureLines = [];

                try {
                    for (let index = 0; index < groups.length; index += 1) {
                        const group = groups[index];
                        const execution = await executeNotebookBatchDelete(group.kind, group.records);
                        if (!execution.ok) {
                            totalFail += group.records.length;
                            failureLines.push(`${getNotebookCleanupKindLabel(group.kind)} -> ${execution.message || 'operation_unavailable'}`);
                            continue;
                        }
                        await recordNotebookBatchFeedback(group.kind, group.records, execution, {
                            source: 'suppressed',
                            reason: 'low_value'
                        });
                        totalSuccess += execution.successCount;
                        totalFail += execution.failCount;
                        failureLines.push.apply(failureLines, buildNotebookBatchFailureLines(execution.failed, group.kind, 8));
                        clearNotebookItemSelection(group.kind);
                    }

                    await refreshNotebookTab();

                    if (totalFail <= 0) {
                        showToastSafe(`一键清理完成，共处理 ${totalSuccess} 条`, 'success');
                        return;
                    }

                    showToastSafe(`一键清理完成：成功 ${totalSuccess} / 失败 ${totalFail}`, totalSuccess > 0 ? 'info' : 'error');
                    showAlertSafe('一键清理有部分失败', failureLines.slice(0, 12).join('\n'));
                } catch (error) {
                    showToastSafe(error && error.message ? error.message : '一键清理失败，请稍后重试', 'error');
                }
            },
            null,
            '一键清理',
            '取消'
        );
    }

    async function handleBatchDeleteNotebookSuppressedByMode(mode) {
        const notebook = getNotebookData();
        const cleanupPreview = getNotebookCleanupPreview();
        const safeMode = normalizeNotebookViewMode(mode);
        const groups = collectNotebookGroupsByMode(safeMode, {
            notebook: notebook,
            preview: cleanupPreview,
            suppressedOnly: true
        });

        if (groups.length <= 0) {
            showToastSafe(`当前“${getNotebookViewModeLabel(safeMode)}”筛选下，没有可直接清理的条目。`, 'info');
            return;
        }

        const countLines = groups.map(function mapGroup(group) {
            return `- ${getNotebookCleanupKindLabel(group.kind)} ${group.records.length} 条`;
        });
        const previewLines = [];
        groups.forEach(function appendPreview(group) {
            group.records.slice(0, 2).forEach(function appendRecord(item) {
                if (previewLines.length >= 8) return;
                previewLines.push(`- [${getNotebookCleanupKindLabel(group.kind)}] ${toTrimmedString(item && item.content)}`);
            });
        });
        const totalCount = groups.reduce(function countAll(total, group) {
            return total + group.records.length;
        }, 0);
        const remainingCount = totalCount - previewLines.length;
        const confirmText = [
            `当前正在看“${getNotebookViewModeLabel(safeMode)}”。`,
            '确认后，只会清理当前这层筛选下已经进不了主聊天的条目，不会动到其他内容。',
            '',
            '本次将处理：',
            countLines.join('\n'),
            '',
            '预览：',
            previewLines.join('\n'),
            remainingCount > 0 ? `... 另外还有 ${remainingCount} 条` : ''
        ].filter(Boolean).join('\n');

        showConfirmSafe(
            `清理“${getNotebookViewModeLabel(safeMode)}”里的不会注入项`,
            confirmText,
            async function onConfirmVisibleSuppressed() {
                let totalSuccess = 0;
                let totalFail = 0;
                const failureLines = [];

                try {
                    for (let index = 0; index < groups.length; index += 1) {
                        const group = groups[index];
                        const execution = await executeNotebookBatchDelete(group.kind, group.records);
                        if (!execution.ok) {
                            totalFail += group.records.length;
                            failureLines.push(`${getNotebookCleanupKindLabel(group.kind)} -> ${execution.message || 'operation_unavailable'}`);
                            continue;
                        }
                        await recordNotebookBatchFeedback(group.kind, group.records, execution, {
                            source: 'suppressed',
                            reason: 'low_value'
                        });
                        totalSuccess += execution.successCount;
                        totalFail += execution.failCount;
                        failureLines.push.apply(failureLines, buildNotebookBatchFailureLines(execution.failed, group.kind, 8));
                        clearNotebookItemSelection(group.kind);
                    }

                    await refreshNotebookTab();

                    if (totalFail <= 0) {
                        showToastSafe(`筛选清理完成，共处理 ${totalSuccess} 条`, 'success');
                        return;
                    }

                    showToastSafe(`筛选清理完成：成功 ${totalSuccess} / 失败 ${totalFail}`, totalSuccess > 0 ? 'info' : 'error');
                    showAlertSafe('筛选清理有部分失败', failureLines.slice(0, 12).join('\n'));
                } catch (error) {
                    showToastSafe(error && error.message ? error.message : '筛选清理失败，请稍后重试', 'error');
                }
            },
            null,
            '确认清理',
            '取消'
        );
    }

    /**
     * 打开“编辑事件”弹窗，改为站内表单而不是浏览器 prompt。
     */
    function openEditEventDialog(eventId) {
        const safeEventId = toTrimmedString(eventId);
        const members = getEventMembersForAction(safeEventId);
        if (members.length <= 0) {
            showToastSafe('未找到该事件成员，请先展开成员后重试', 'info');
            return;
        }

        const currentPatch = deriveEventPatchFromMembers(safeEventId, members);
        if (!currentPatch) {
            showToastSafe('事件信息读取失败，请刷新后重试', 'error');
            return;
        }

        state.adminDialog = {
            type: 'edit-event',
            busy: false,
            eventId: safeEventId,
            title: currentPatch.title,
            summary: currentPatch.summary,
            memberCount: members.length
        };
        renderLayout();
    }

    /**
     * 打开“并入事件”弹窗，提供可点选的事件列表。
     */
    function openAttachEventDialog(memoryId) {
        const safeMemoryId = toTrimmedString(memoryId);
        const targetMemory = findMemoryRecord(safeMemoryId);
        if (!targetMemory) {
            showToastSafe('未找到对应记忆条目，请刷新后重试', 'error');
            return;
        }

        const currentEventId = getMemoryEventId(targetMemory);
        if (currentEventId) {
            showToastSafe('这条记忆已经属于某个事件，先“移出事件”后再并入其他事件', 'info');
            return;
        }

        const options = listEventCandidatesForAttach().slice(0, 12).map(function mapCandidate(item) {
            return {
                eventId: toTrimmedString(item && item.eventId),
                title: toTrimmedString(item && item.title) || '记忆事件',
                summary: toTrimmedString(item && item.summary),
                memberCount: Math.max(0, Number(item && item.memberCount || 0)),
                latestTimestamp: Number(item && item.latestTimestamp || 0)
            };
        }).filter(function keepValid(item) {
            return !!item.eventId;
        });

        if (options.length <= 0) {
            showToastSafe('当前页没有可并入的记忆事件，请先切到事件较多的分页', 'info');
            return;
        }

        state.adminDialog = {
            type: 'attach-event',
            busy: false,
            memoryId: safeMemoryId,
            memoryPreview: toTrimmedString(targetMemory && targetMemory.content),
            selectedEventId: options[0].eventId,
            options: options
        };
        renderLayout();
    }

    /**
     * 打开“事件并入事件”弹窗，选择一个已有目标事件承接当前事件成员。
     */
    async function openMergeEventDialog(eventId) {
        const safeEventId = toTrimmedString(eventId);
        if (!safeEventId) return;

        const sourceMembers = await loadEventMembersForAction(safeEventId);
        if (sourceMembers.length <= 0) {
            showToastSafe('未找到该事件成员，请先展开成员后重试', 'info');
            return;
        }

        const currentPatch = deriveEventPatchFromMembers(safeEventId, sourceMembers);
        if (!currentPatch) {
            showToastSafe('事件信息读取失败，请刷新后重试', 'error');
            return;
        }

        const options = listEventCandidatesForAttach(safeEventId).slice(0, 12).map(function mapCandidate(item) {
            return {
                eventId: toTrimmedString(item && item.eventId),
                title: toTrimmedString(item && item.title) || '记忆事件',
                summary: toTrimmedString(item && item.summary),
                memberCount: Math.max(0, Number(item && item.memberCount || 0)),
                latestTimestamp: Number(item && item.latestTimestamp || 0)
            };
        }).filter(function keepValid(item) {
            return !!item.eventId;
        });

        if (options.length <= 0) {
            showToastSafe('当前页没有可承接的目标事件，请先切到事件较多的分页', 'info');
            return;
        }

        state.adminDialog = {
            type: 'merge-event',
            busy: false,
            eventId: safeEventId,
            sourceTitle: currentPatch.title,
            sourceSummary: currentPatch.summary,
            sourceMemberCount: sourceMembers.length,
            selectedEventId: options[0].eventId,
            options: options
        };
        renderLayout();
    }

    /**
     * 打开“修改记忆”弹窗。
     */
    function openEditMemoryDialog(memoryId) {
        const safeMemoryId = toTrimmedString(memoryId);
        const memory = findMemoryRecord(safeMemoryId);
        if (!memory) {
            showToastSafe('未找到对应记忆，请刷新后重试', 'error');
            return;
        }

        state.adminDialog = {
            type: 'edit-memory',
            busy: false,
            memoryId: safeMemoryId,
            content: toTrimmedString(memory.content),
            eventId: getMemoryEventId(memory),
            eventTitle: getMemoryEventTitle(memory)
        };
        renderLayout();
    }

    /**
     * 提交“编辑事件”弹窗。
     */
    async function submitEditEventDialog(formData) {
        const dialog = state.adminDialog && typeof state.adminDialog === 'object'
            ? state.adminDialog
            : null;
        if (!dialog || dialog.type !== 'edit-event') return;

        const client = getClient();
        if (!client || typeof client.updateMemory !== 'function') {
            showToastSafe('编辑功能暂不可用', 'error');
            return;
        }

        const safeEventId = toTrimmedString(formData && formData.get('eventId')) || toTrimmedString(dialog.eventId);
        const nextTitle = toTrimmedString(formData && formData.get('title'));
        const nextSummary = toTrimmedString(formData && formData.get('summary'));
        state.adminDialog = Object.assign({}, dialog, {
            busy: true,
            eventId: safeEventId,
            title: nextTitle,
            summary: nextSummary
        });
        renderLayout();

        const releaseDialog = function releaseDialog() {
            state.adminDialog = Object.assign({}, dialog, {
                busy: false,
                eventId: safeEventId,
                title: nextTitle,
                summary: nextSummary
            });
            renderLayout();
        };

        const members = getEventMembersForAction(safeEventId);
        if (members.length <= 0) {
            releaseDialog();
            showToastSafe('未找到该事件成员，请先展开成员后重试', 'info');
            return;
        }

        const currentPatch = deriveEventPatchFromMembers(safeEventId, members);
        if (!currentPatch) {
            releaseDialog();
            showToastSafe('事件信息读取失败，请刷新后重试', 'error');
            return;
        }

        if (!nextTitle || !nextSummary) {
            releaseDialog();
            showToastSafe('标题和摘要都不能为空', 'error');
            return;
        }
        if (nextTitle === currentPatch.title && nextSummary === currentPatch.summary) {
            releaseDialog();
            showToastSafe('内容未变化，已跳过', 'info');
            return;
        }

        const nextPatch = deriveEventPatchFromMembers(safeEventId, members, {
            title: nextTitle,
            summary: nextSummary,
            fragmentCount: currentPatch.fragmentCount,
            eventDate: currentPatch.eventDate
        });
        if (!nextPatch) {
            releaseDialog();
            showToastSafe('事件补丁生成失败，请刷新后重试', 'error');
            return;
        }

        const versionEntry = buildAdminEventVersionEntry(currentPatch, nextPatch, {
            source: 'admin_event_edit',
            manualNote: 'admin_event_edit'
        });

        const tasks = members
            .map(function mapMember(item) {
                const memoryId = toTrimmedString(item && item.id);
                if (!memoryId) return null;
                const payload = buildEventUpdatePayload(item, nextPatch, {
                    versionEntry: versionEntry
                });
                if (!payload) return null;
                return client.updateMemory(memoryId, payload).catch(function onUpdateError() {
                    return { ok: false };
                });
            })
            .filter(Boolean);

        if (tasks.length <= 0) {
            releaseDialog();
            showToastSafe('当前页没有可更新成员', 'info');
            return;
        }

        const results = await Promise.all(tasks);
        const successCount = results.filter(function countSuccess(result) {
            return !!(result && result.ok === true);
        }).length;
        const failedCount = Math.max(0, tasks.length - successCount);
        const eventSyncResult = successCount > 0
            ? await syncEventRecordAfterAdminAdjust(safeEventId, members, {
                patchOverrides: {
                    title: nextTitle,
                    summary: nextSummary,
                    eventDate: currentPatch.eventDate
                },
                manualEdited: true,
                manualNote: 'admin_event_edit',
                syncReason: 'edit_event',
                previousPatch: currentPatch,
                versionSource: 'admin_event_edit'
            })
            : null;

        if (successCount <= 0) {
            releaseDialog();
            showToastSafe('更新失败，请稍后重试', 'error');
            return;
        }

        state.adminDialog = null;
        state.eventMembersCache = {};
        state.loadingEventMembersEventId = '';
        state.expandedEventId = safeEventId;
        state.expandedEventMembersEventId = safeEventId;
        state.expandedEventMemberMemoryId = '';
        showToastSafe(
            failedCount > 0
                ? `事件更新完成：成功 ${successCount} 条，失败 ${failedCount} 条`
                : '事件摘要已更新',
            failedCount > 0 ? 'info' : 'success'
        );
        if (!eventSyncResult || eventSyncResult.ok !== true) {
            showToastSafe('真实事件表同步失败，可稍后重试', 'info');
        }
        await refreshListTab();
    }

    /**
     * 提交“修改记忆”弹窗。
     */
    async function submitEditMemoryDialog(formData) {
        const dialog = state.adminDialog && typeof state.adminDialog === 'object'
            ? state.adminDialog
            : null;
        if (!dialog || dialog.type !== 'edit-memory') return;

        const client = getClient();
        if (!client || typeof client.updateMemory !== 'function') {
            showToastSafe('编辑功能暂不可用', 'error');
            return;
        }

        const safeMemoryId = toTrimmedString(formData && formData.get('memoryId')) || toTrimmedString(dialog.memoryId);
        const nextContent = toTrimmedString(formData && formData.get('content'));
        state.adminDialog = Object.assign({}, dialog, {
            busy: true,
            memoryId: safeMemoryId,
            content: nextContent
        });
        renderLayout();

        const releaseDialog = function releaseDialog() {
            state.adminDialog = Object.assign({}, dialog, {
                busy: false,
                memoryId: safeMemoryId,
                content: nextContent
            });
            renderLayout();
        };

        const memory = findMemoryRecord(safeMemoryId);
        if (!memory) {
            releaseDialog();
            showToastSafe('未找到对应记忆，请刷新后重试', 'error');
            return;
        }

        if (!nextContent) {
            releaseDialog();
            showToastSafe('记忆内容不能为空', 'error');
            return;
        }

        if (nextContent === toTrimmedString(memory.content)) {
            releaseDialog();
            showToastSafe('内容未变化，已跳过', 'info');
            return;
        }

        const result = await client.updateMemory(safeMemoryId, {
            content: nextContent
        }).catch(function onEditMemoryError() {
            return { ok: false };
        });

        if (!result || result.ok !== true) {
            releaseDialog();
            showToastSafe('编辑失败，请稍后重试', 'error');
            return;
        }

        const currentEventId = getMemoryEventId(memory);
        state.adminDialog = null;
        state.eventMembersCache = {};
        state.loadingEventMembersEventId = '';
        if (currentEventId) {
            state.expandedEventId = currentEventId;
            state.expandedEventMembersEventId = currentEventId;
            state.expandedEventMemberMemoryId = safeMemoryId;
            state.expandedMemoryId = '';
        } else {
            state.expandedMemoryId = safeMemoryId;
        }
        showToastSafe('记忆已更新', 'success');
        await refreshListTab();
    }

    /**
     * 提交“并入事件”弹窗。
     */
    async function submitAttachEventDialog(formData) {
        const dialog = state.adminDialog && typeof state.adminDialog === 'object'
            ? state.adminDialog
            : null;
        if (!dialog || dialog.type !== 'attach-event') return;

        const client = getClient();
        if (!client || typeof client.updateMemory !== 'function') {
            showToastSafe('当前环境暂不支持并入事件', 'error');
            return;
        }

        const safeMemoryId = toTrimmedString(formData && formData.get('memoryId')) || toTrimmedString(dialog.memoryId);
        const selectedEventId = toTrimmedString(formData && formData.get('selectedEventId')) || toTrimmedString(dialog.selectedEventId);
        const targetMemory = findMemoryRecord(safeMemoryId);
        if (!targetMemory) {
            showToastSafe('未找到对应记忆条目，请刷新后重试', 'error');
            return;
        }

        const currentEventId = getMemoryEventId(targetMemory);
        if (currentEventId) {
            showToastSafe('这条记忆已经属于某个事件，先“移出事件”后再并入其他事件', 'info');
            return;
        }

        const selectedEvent = (Array.isArray(dialog.options) ? dialog.options : []).find(function matchOption(item) {
            return toTrimmedString(item && item.eventId) === selectedEventId;
        }) || null;
        if (!selectedEventId || !selectedEvent) {
            showToastSafe('请选择一个目标事件', 'error');
            return;
        }

        let eventMembers = getEventMembersForAction(selectedEventId);
        if (eventMembers.length <= 0 && typeof client.listEventMembers === 'function') {
            const fetchResult = await client.listEventMembers({
                charId: state.filters.charId,
                eventId: selectedEventId,
                limit: 240
            }).catch(function onFetchError() {
                return { ok: false, items: [] };
            });
            if (fetchResult && fetchResult.ok === true && Array.isArray(fetchResult.items) && fetchResult.items.length > 0) {
                eventMembers = setCachedEventMembers(selectedEventId, fetchResult.items);
            }
        }

        const currentMemberCountHint = Math.max(
            Number(selectedEvent && selectedEvent.memberCount || 0),
            eventMembers.reduce(function pickCount(maxValue, item) {
                return Math.max(maxValue, getMemoryEventFragmentCount(item));
            }, 0),
            eventMembers.length
        );
        const nextMembers = eventMembers.concat([targetMemory]);
        const eventPatch = deriveEventPatchFromMembers(selectedEventId, nextMembers, {
            fragmentCount: Math.max(currentMemberCountHint + 1, nextMembers.length),
            title: toTrimmedString(selectedEvent && selectedEvent.title),
            summary: toTrimmedString(selectedEvent && selectedEvent.summary)
        });
        if (!eventPatch) {
            showToastSafe('事件补丁生成失败，请重试', 'error');
            return;
        }

        const previousPatch = eventMembers.length > 0
            ? deriveEventPatchFromMembers(selectedEventId, eventMembers, {
                fragmentCount: currentMemberCountHint,
                title: toTrimmedString(selectedEvent && selectedEvent.title),
                summary: toTrimmedString(selectedEvent && selectedEvent.summary)
            })
            : null;
        const preview = summarizeContent(targetMemory.content, 52);
        const versionEntry = previousPatch
            ? buildAdminEventVersionEntry(previousPatch, eventPatch, {
                source: 'admin_event_attach',
                manualNote: 'admin_event_member_adjust',
                memberMemoryId: safeMemoryId,
                memberPreview: preview
            })
            : null;
        showConfirmSafe(
            '并入并更新当前事件',
            `将把这条记忆碎片并入「${eventPatch.title}」。\n\n${preview}\n\n确认后只会更新这个事件的摘要与成员统计，不会处理全部事件。`,
            async function confirmAttachMemoryToEvent() {
                state.adminDialog = Object.assign({}, dialog, {
                    busy: true,
                    memoryId: safeMemoryId,
                    selectedEventId: selectedEventId
                });
                renderLayout();

                const releaseDialog = function releaseDialog() {
                    state.adminDialog = Object.assign({}, dialog, {
                        busy: false,
                        memoryId: safeMemoryId,
                        selectedEventId: selectedEventId
                    });
                    renderLayout();
                };

                const targetPayload = buildEventUpdatePayload(targetMemory, eventPatch, {
                    versionEntry: versionEntry
                });
                const targetResult = await client.updateMemory(safeMemoryId, targetPayload).catch(function onTargetUpdateError() {
                    return { ok: false };
                });
                if (!targetResult || targetResult.ok !== true) {
                    releaseDialog();
                    showToastSafe('并入失败，请稍后重试', 'error');
                    return;
                }

                const syncTasks = eventMembers
                    .map(function mapMember(item) {
                        const memberId = toTrimmedString(item && item.id);
                        if (!memberId) return null;
                        const payload = buildEventUpdatePayload(item, eventPatch, {
                            versionEntry: versionEntry
                        });
                        if (!payload) return null;
                        return client.updateMemory(memberId, payload).catch(function onSyncError() {
                            return { ok: false };
                        });
                    })
                    .filter(Boolean);

                const syncResults = await Promise.all(syncTasks);
                const syncSuccessCount = syncResults.filter(function countSuccess(result) {
                    return !!(result && result.ok === true);
                }).length;
                const failedCount = Math.max(0, syncTasks.length - syncSuccessCount);
                const eventSyncResult = await syncEventRecordAfterAdminAdjust(selectedEventId, nextMembers, {
                    patchOverrides: {
                        title: toTrimmedString(selectedEvent && selectedEvent.title),
                        summary: toTrimmedString(selectedEvent && selectedEvent.summary)
                    },
                    manualEdited: true,
                    manualNote: 'admin_event_member_adjust',
                    syncReason: 'attach_member',
                    previousPatch: previousPatch,
                    versionSource: 'admin_event_attach',
                    versionContext: {
                        memberMemoryId: safeMemoryId,
                        memberPreview: preview
                    }
                });

                state.adminDialog = null;
                state.eventMembersCache = {};
                state.loadingEventMembersEventId = '';
                state.expandedEventId = selectedEventId;
                state.expandedEventMembersEventId = selectedEventId;
                state.expandedEventMemberMemoryId = safeMemoryId;

                if (!eventSyncResult || eventSyncResult.ok !== true) {
                    showToastSafe('碎片已并入，但当前事件同步失败，可稍后重试', 'info');
                } else {
                    showToastSafe(
                        failedCount > 0
                            ? `已并入并更新当前事件，但成员同步有部分失败（成功 ${syncSuccessCount + 1} 条，失败 ${failedCount} 条）`
                            : '记忆碎片已并入，并已更新当前事件',
                        failedCount > 0 ? 'info' : 'success'
                    );
                }
                await refreshListTab();
            },
            null,
            '确认并更新',
            '返回修改',
            true
        );
    }

    /**
     * 提交“事件并入事件”弹窗。
     */
    async function submitMergeEventDialog(formData) {
        const dialog = state.adminDialog && typeof state.adminDialog === 'object'
            ? state.adminDialog
            : null;
        if (!dialog || dialog.type !== 'merge-event') return;

        const client = getClient();
        if (!client || typeof client.updateMemory !== 'function') {
            showToastSafe('当前环境暂不支持合并事件', 'error');
            return;
        }

        const sourceEventId = toTrimmedString(formData && formData.get('eventId')) || toTrimmedString(dialog.eventId);
        const selectedEventId = toTrimmedString(formData && formData.get('selectedEventId')) || toTrimmedString(dialog.selectedEventId);
        if (!sourceEventId || !selectedEventId) {
            showToastSafe('缺少事件参数', 'error');
            return;
        }
        if (sourceEventId === selectedEventId) {
            showToastSafe('不能把事件并入它自己', 'info');
            return;
        }

        const selectedEvent = (Array.isArray(dialog.options) ? dialog.options : []).find(function matchOption(item) {
            return toTrimmedString(item && item.eventId) === selectedEventId;
        }) || null;
        if (!selectedEvent) {
            showToastSafe('请选择一个目标事件', 'error');
            return;
        }

        const sourceMembers = await loadEventMembersForAction(sourceEventId);
        if (sourceMembers.length <= 0) {
            showToastSafe('未找到源事件成员，请先展开成员后重试', 'info');
            return;
        }

        const targetMembers = await loadEventMembersForAction(selectedEventId);
        const mergedMembers = dedupeEventMembers(targetMembers.concat(sourceMembers));
        const currentMemberCountHint = Math.max(
            Number(selectedEvent && selectedEvent.memberCount || 0),
            targetMembers.reduce(function pickCount(maxValue, item) {
                return Math.max(maxValue, getMemoryEventFragmentCount(item));
            }, 0),
            targetMembers.length
        );
        const eventPatch = deriveEventPatchFromMembers(selectedEventId, mergedMembers, {
            fragmentCount: Math.max(currentMemberCountHint + sourceMembers.length, mergedMembers.length),
            title: toTrimmedString(selectedEvent && selectedEvent.title),
            summary: toTrimmedString(selectedEvent && selectedEvent.summary)
        });
        if (!eventPatch) {
            showToastSafe('目标事件补丁生成失败，请重试', 'error');
            return;
        }

        const targetPreviousPatch = targetMembers.length > 0
            ? deriveEventPatchFromMembers(selectedEventId, targetMembers, {
                fragmentCount: currentMemberCountHint,
                title: toTrimmedString(selectedEvent && selectedEvent.title),
                summary: toTrimmedString(selectedEvent && selectedEvent.summary)
            })
            : null;
        const sourceTitle = toTrimmedString(dialog.sourceTitle) || '当前事件';
        const targetTitle = eventPatch.title || '目标事件';
        const versionEntry = targetPreviousPatch
            ? buildAdminEventVersionEntry(targetPreviousPatch, eventPatch, {
                source: 'admin_event_merge',
                manualNote: 'admin_event_merge',
                sourceEventId: sourceEventId,
                sourceEventTitle: sourceTitle
            })
            : null;
        showConfirmSafe(
            '并入并更新目标事件',
            `将把「${sourceTitle}」并入「${targetTitle}」。\n\n本次会尝试转移 ${sourceMembers.length} 条成员，并保留目标事件的标题与摘要。源事件在成员搬空后会自动清理。\n\n是否现在执行？`,
            async function confirmMergeEvent() {
                state.adminDialog = Object.assign({}, dialog, {
                    busy: true,
                    eventId: sourceEventId,
                    selectedEventId: selectedEventId
                });
                renderLayout();

                const releaseDialog = function releaseDialog() {
                    state.adminDialog = Object.assign({}, dialog, {
                        busy: false,
                        eventId: sourceEventId,
                        selectedEventId: selectedEventId
                    });
                    renderLayout();
                };

                const sourceIdSet = new Set(sourceMembers.map(function mapId(item) {
                    return toTrimmedString(item && item.id);
                }).filter(Boolean));
                const memberJobs = mergedMembers
                    .map(function mapMember(item) {
                        const memoryId = toTrimmedString(item && item.id);
                        const payload = buildEventUpdatePayload(item, eventPatch, {
                            versionEntry: versionEntry
                        });
                        if (!memoryId || !payload) return null;
                        return {
                            memoryId: memoryId,
                            isSourceMember: sourceIdSet.has(memoryId),
                            task: client.updateMemory(memoryId, payload).catch(function onMergeSyncError() {
                                return { ok: false };
                            })
                        };
                    })
                    .filter(Boolean);

                if (memberJobs.length <= 0) {
                    releaseDialog();
                    showToastSafe('当前没有可同步成员', 'info');
                    return;
                }

                const results = await Promise.all(memberJobs.map(function unwrapTask(job) {
                    return job.task;
                }));
                const successCount = results.filter(function countSuccess(result) {
                    return !!(result && result.ok === true);
                }).length;
                const failedCount = Math.max(0, memberJobs.length - successCount);
                const failedSourceCount = memberJobs.reduce(function countFailedSource(total, job, index) {
                    const ok = !!(results[index] && results[index].ok === true);
                    return total + (job.isSourceMember && !ok ? 1 : 0);
                }, 0);

                if (successCount <= 0) {
                    releaseDialog();
                    showToastSafe('合并失败，请稍后重试', 'error');
                    return;
                }

                const targetSyncResult = await syncEventRecordAfterAdminAdjust(selectedEventId, mergedMembers, {
                    patchOverrides: {
                        title: toTrimmedString(selectedEvent && selectedEvent.title),
                        summary: toTrimmedString(selectedEvent && selectedEvent.summary)
                    },
                    manualEdited: true,
                    manualNote: 'admin_event_merge',
                    syncReason: 'merge_event_target',
                    previousPatch: targetPreviousPatch,
                    versionSource: 'admin_event_merge',
                    versionContext: {
                        sourceEventId: sourceEventId,
                        sourceEventTitle: sourceTitle
                    }
                });
                const sourceSyncResult = await syncEventRecordAfterAdminAdjust(sourceEventId, [], {
                    manualEdited: true,
                    manualNote: 'admin_event_merge',
                    syncReason: 'merge_event_source_cleanup'
                });

                state.adminDialog = null;
                state.eventMembersCache = {};
                state.loadingEventMembersEventId = '';
                state.expandedEventId = selectedEventId;
                state.expandedEventMembersEventId = selectedEventId;
                state.expandedEventMemberMemoryId = '';

                if (!targetSyncResult || targetSyncResult.ok !== true) {
                    showToastSafe('目标事件成员已更新，但目标事件同步失败，可稍后重试', 'info');
                } else if (!sourceSyncResult || sourceSyncResult.ok !== true) {
                    showToastSafe('目标事件已更新，但源事件收口失败，可稍后重试', 'info');
                } else {
                    showToastSafe(
                        failedCount > 0
                            ? `事件已并入，但成员同步有部分失败（成功 ${successCount} 条，失败 ${failedCount} 条；源事件剩余失败 ${failedSourceCount} 条）`
                            : '记忆事件已并入，并已更新目标事件',
                        failedCount > 0 ? 'info' : 'success'
                    );
                }
                await refreshListTab();
            },
            null,
            '确认并入',
            '取消',
            true
        );
    }

    /**
     * 手动触发当前角色的一轮全量事件重整。
     */
    async function handleRunEventDigest() {
        const charId = toTrimmedString(state.filters.charId);
        if (!charId) {
            showToastSafe('请先选择角色后再重整事件', 'info');
            return;
        }

        showConfirmSafe(
            '手动重整当前角色事件',
            '这会对当前角色重新运行一轮记忆消化，可能把此前尚未归类的旧碎片继续整理成事件。只有在你明确需要全量重整时再执行。',
            async function confirmRunEventDigest() {
                const result = await runDigestForCurrentCharacter();
                if (result && result.ok === true) {
                    state.eventMembersCache = {};
                    state.loadingEventMembersEventId = '';
                    await refreshListTab();
                }
            },
            null,
            '开始重整',
            '取消',
            true
        );
    }

    /**
     * 打开“修改记忆”弹窗。
     */
    async function handleEditMemory(memoryId) {
        openEditMemoryDialog(memoryId);
    }

    /**
     * 删除单条记忆，删除前二次确认，成功后刷新当前分页。
     */
    async function handleToggleResolved(memoryId) {
        const client = getClient();
        if (!client || typeof client.updateMemory !== 'function') return;

        const memory = findMemoryRecord(memoryId);
        if (!memory) return;
        const nextResolved = !isMemoryResolved(memory);

        const result = await client.updateMemory(memoryId, {
            resolved: nextResolved
        });

        if (!result || result.ok === false) {
            showToastSafe('修改状态失败，请稍后重试');
            return;
        }
        
        showToastSafe(nextResolved ? '这段回忆已经平息了' : '这段回忆重新被唤起了', 'success');
        await refreshListTab();
    }

    /**
     * 切换事件成员二级展开，并按需加载跨页成员。
     */
    async function handleToggleEventMembers(eventId) {
        const safeEventId = toTrimmedString(eventId);
        if (!safeEventId) return;

        const alreadyExpanded = state.expandedEventId === safeEventId && state.expandedEventMembersEventId === safeEventId;
        if (alreadyExpanded) {
            state.expandedEventMembersEventId = '';
            state.loadingEventMembersEventId = '';
            state.expandedEventMemberMemoryId = '';
            renderLayout();
            return;
        }

        state.expandedEventId = safeEventId;
        state.expandedEventMembersEventId = safeEventId;
        state.expandedMemoryId = '';
        state.expandedEventMemberMemoryId = '';
        renderLayout();

        const existing = getEventMembersForAction(safeEventId);
        const client = getClient();
        if (!client || typeof client.listEventMembers !== 'function') {
            return;
        }

        state.loadingEventMembersEventId = safeEventId;
        renderLayout();
        try {
            const result = await client.listEventMembers({
                charId: state.filters.charId,
                eventId: safeEventId,
                limit: 240
            });
            if (!result || result.ok !== true) {
                const errorText = toTrimmedString(result && result.error);
                if (errorText) {
                    showToastSafe(`事件成员加载失败：${errorText}`, 'info');
                }
                return;
            }
            const remoteMembers = Array.isArray(result.items) ? result.items : [];
            if (remoteMembers.length > 0) {
                const merged = setCachedEventMembers(safeEventId, remoteMembers);
                if (merged.length > existing.length) {
                    showToastSafe(`已加载完整成员：${merged.length} 条`, 'success');
                }
            }
        } catch (error) {
            showToastSafe('加载事件成员失败，请稍后重试', 'error');
        } finally {
            if (state.loadingEventMembersEventId === safeEventId) {
                state.loadingEventMembersEventId = '';
            }
            renderLayout();
        }
    }

    /**
     * 批量切换事件成员的“已释怀/未了结”状态。
     */
    async function handleToggleEventResolved(eventId) {
        const client = getClient();
        if (!client || typeof client.updateMemory !== 'function') return;

        const safeEventId = toTrimmedString(eventId);
        const members = getEventMembersForAction(safeEventId);
        if (members.length === 0) {
            showToastSafe('未找到该记忆事件的成员条目', 'info');
            return;
        }

        const unresolvedCount = members.filter(function countUnresolved(item) {
            return !isMemoryResolved(item);
        }).length;
        const shouldResolve = unresolvedCount > 0;
        const currentPatch = deriveEventPatchFromMembers(safeEventId, members);
        const nextPatch = currentPatch
            ? deriveEventPatchFromMembers(safeEventId, members, {
                title: currentPatch.title,
                summary: currentPatch.summary,
                depth: currentPatch.depth,
                status: shouldResolve ? 'closed' : 'open',
                isUnresolved: !shouldResolve,
                fragmentCount: currentPatch.fragmentCount,
                eventDate: currentPatch.eventDate,
                continuationKey: currentPatch.continuationKey,
                anchorMemoryId: currentPatch.anchorMemoryId,
                detailMemoryIds: currentPatch.detailMemoryIds,
                flashbulbMemoryIds: currentPatch.flashbulbMemoryIds,
                isFlashbulb: currentPatch.isFlashbulb
            })
            : null;
        const versionEntry = currentPatch && nextPatch
            ? buildAdminEventVersionEntry(currentPatch, nextPatch, {
                source: 'admin_event_resolved',
                manualNote: 'admin_event_status_adjust'
            })
            : null;

        const title = shouldResolve ? '标记事件为已了结' : '标记事件为未了结';
        const confirmText = shouldResolve
            ? `将把该事件内 ${members.length} 条记忆统一标记为“已释怀”。`
            : `将把该事件内 ${members.length} 条记忆统一标记为“未释怀”。`;

        showConfirmSafe(
            title,
            `${confirmText}\n\n该操作会批量更新事件成员条目。`,
            async function confirmToggleEventResolved() {
                const tasks = members
                    .map(function queueUpdate(item) {
                        const memoryId = toTrimmedString(item && item.id);
                        if (!memoryId) return null;
                        const payload = buildEventUpdatePayload(item, nextPatch || currentPatch, {
                            resolved: shouldResolve,
                            versionEntry: versionEntry
                        });
                        if (!payload) return null;
                        return client.updateMemory(memoryId, payload).catch(function onUpdateError() {
                            return { ok: false };
                        });
                    })
                    .filter(Boolean);

                const results = await Promise.all(tasks);
                const successCount = results.filter(function countSuccess(result) {
                    return !!(result && result.ok === true);
                }).length;

                if (successCount <= 0) {
                    showToastSafe('批量更新失败，请稍后重试', 'error');
                    return;
                }

                const failedCount = Math.max(0, members.length - successCount);
                showToastSafe(
                    failedCount > 0
                        ? `已更新 ${successCount} 条，失败 ${failedCount} 条`
                        : (shouldResolve ? '该记忆事件已标记为已了结' : '该记忆事件已标记为未了结'),
                    failedCount > 0 ? 'info' : 'success'
                );
                const eventSyncResult = await syncEventRecordAfterAdminAdjust(safeEventId, members, {
                    manualEdited: true,
                    manualNote: 'admin_event_status_adjust',
                    syncReason: shouldResolve ? 'resolve_event' : 'reopen_event',
                    previousPatch: currentPatch,
                    versionSource: 'admin_event_resolved'
                });
                if (!eventSyncResult || eventSyncResult.ok !== true) {
                    showToastSafe('真实事件表即时同步失败，可稍后手动重整当前角色事件', 'info');
                }
                state.eventMembersCache = {};
                state.loadingEventMembersEventId = '';
                await refreshListTab();
            },
            null,
            shouldResolve ? '标记已了结' : '标记未了结',
            '取消',
            shouldResolve
        );
    }

    /**
     * 将某条成员从事件中移出，并同步更新其余成员的事件摘要。
     */
    async function runManualReconsolidationAction(kind, targetId) {
        const client = getClient();
        if (!client || typeof client.runManualReconsolidation !== 'function') {
            showToastSafe('当前环境暂不支持手动改写', 'error');
            return;
        }

        const safeKind = toTrimmedString(kind) === 'event' ? 'event' : 'memory';
        const safeTargetId = toTrimmedString(targetId);
        if (!safeTargetId) return;

        const busyKey = buildManualReconBusyKey(safeKind, safeTargetId);
        if (state.reconsolidationBusyKey && state.reconsolidationBusyKey !== busyKey) {
            showToastSafe('已有一项手动改写正在执行，请稍候', 'info');
            return;
        }
        if (state.reconsolidationBusyKey === busyKey) {
            return;
        }

        const eventItem = safeKind === 'event'
            ? findEventDisplayItemInCurrentList(safeTargetId)
            : null;
        const memoryItem = safeKind === 'memory'
            ? findMemoryRecord(safeTargetId)
            : null;
        const preview = safeKind === 'event'
            ? summarizeContent(eventItem && (eventItem.title || eventItem.summary) || safeTargetId, 42)
            : summarizeContent(memoryItem && memoryItem.content || safeTargetId, 56);
        const title = safeKind === 'event'
            ? '手动改写整起事件'
            : '手动改写这条记忆';
        const body = safeKind === 'event'
            ? `将对这起事件触发一次强制改写，并允许走事件级批量改写：\n\n${preview}\n\n这会直接写回海马体数据库中的相关碎片。`
            : `将对这条记忆触发一次强制改写：\n\n${preview}\n\n这会直接写回海马体数据库中的当前碎片。`;

        showConfirmSafe(
            title,
            body,
            async function confirmManualReconsolidation() {
                state.reconsolidationBusyKey = busyKey;
                renderLayout();
                try {
                    const result = await client.runManualReconsolidation({
                        charId: state.filters.charId,
                        eventId: safeKind === 'event' ? safeTargetId : '',
                        memoryId: safeKind === 'memory' ? safeTargetId : '',
                        batchMode: safeKind === 'event' ? 'event' : ''
                    }).catch(function onManualReconError(error) {
                        return {
                            ok: false,
                            error: toTrimmedString(error && error.message) || 'manual_recon_failed',
                            message: '手动改写执行失败。'
                        };
                    });

                    if (!result || result.ok !== true) {
                        const errorText = toTrimmedString(result && (result.message || result.error)) || '手动改写失败';
                        showToastSafe(errorText, 'error');
                        return;
                    }

                    const summary = describeManualReconResult(result);
                    showToastSafe(
                        result.reconstructed
                            ? `手动改写已完成，落库 ${Math.max(0, Math.floor(toFiniteNumber(result.reconstructedCount, 0)))} 条`
                            : '手动改写已执行，但本次没有落库',
                        result.reconstructed ? 'success' : 'info'
                    );
                    showAlertSafe('手动改写结果', summary);
                    await refreshListTab();
                } finally {
                    state.reconsolidationBusyKey = '';
                    renderLayout();
                }
            },
            null,
            '开始改写',
            '取消',
            true
        );
    }

    async function handleRunEventReconsolidation(eventId) {
        await runManualReconsolidationAction('event', eventId);
    }

    async function handleRunMemoryReconsolidation(memoryId) {
        await runManualReconsolidationAction('memory', memoryId);
    }

    async function handleRemoveEventMember(eventId, memoryId) {
        const client = getClient();
        if (!client || typeof client.updateMemory !== 'function') {
            showToastSafe('当前环境暂不支持调整事件成员', 'error');
            return;
        }

        const safeEventId = toTrimmedString(eventId);
        const safeMemoryId = toTrimmedString(memoryId);
        const members = getEventMembersForAction(safeEventId);
        const target = members.find(function findTarget(item) {
            return toTrimmedString(item && item.id) === safeMemoryId;
        }) || null;

        if (!target) {
            showToastSafe('未找到要移出的成员，请刷新后重试', 'error');
            return;
        }

        const beforeCountHint = Math.max(
            members.length,
            members.reduce(function pickMaxCount(maxValue, item) {
                return Math.max(maxValue, getMemoryEventFragmentCount(item));
            }, 0)
        );
        const remainingMembers = members.filter(function keepMember(item) {
            return toTrimmedString(item && item.id) !== safeMemoryId;
        });
        const currentPatch = deriveEventPatchFromMembers(safeEventId, members, {
            fragmentCount: beforeCountHint
        });
        const nextPatch = remainingMembers.length > 0
            ? deriveEventPatchFromMembers(safeEventId, remainingMembers, {
                fragmentCount: Math.max(remainingMembers.length, beforeCountHint - 1)
            })
            : null;
        const summary = summarizeContent(target && target.content, 56);
        const eventTitle = getMemoryEventTitle(target) || '当前记忆事件';
        const afterPatchForHistory = nextPatch || {
            eventId: safeEventId,
            title: currentPatch ? currentPatch.title : eventTitle,
            summary: currentPatch ? currentPatch.summary : '',
            depth: currentPatch ? currentPatch.depth : getMemoryEventDepth(target),
            status: 'closed',
            isUnresolved: false,
            fragmentCount: 0,
            eventDate: currentPatch ? currentPatch.eventDate : '',
            continuationKey: '',
            anchorMemoryId: '',
            detailMemoryIds: [],
            isFlashbulb: false,
            flashbulbMemoryIds: []
        };
        const versionEntry = currentPatch
            ? buildAdminEventVersionEntry(currentPatch, afterPatchForHistory, {
                source: 'admin_event_remove',
                manualNote: 'admin_event_member_adjust',
                memberMemoryId: safeMemoryId,
                memberPreview: summary
            })
            : null;

        showConfirmSafe(
            '移出事件成员',
            `将把这条记忆移出「${eventTitle}」，变回“记忆碎片”。\n\n${summary}\n\n确认后只会更新这个事件的摘要与成员统计，不会处理全部事件。`,
            async function confirmRemoveEventMember() {
                const detachResult = await client.updateMemory(
                    safeMemoryId,
                    buildDetachFromEventPayload(target, {
                        versionEntry: versionEntry
                    })
                ).catch(function onDetachError() {
                    return { ok: false };
                });
                if (!detachResult || detachResult.ok !== true) {
                    showToastSafe('移出失败，请稍后重试', 'error');
                    return;
                }

                let successCount = 1;
                let failedCount = 0;

                if (nextPatch && remainingMembers.length > 0) {
                    const syncTasks = remainingMembers
                        .map(function mapMember(item) {
                            const memberId = toTrimmedString(item && item.id);
                            if (!memberId) return null;
                            const payload = buildEventUpdatePayload(item, nextPatch, {
                                versionEntry: versionEntry
                            });
                            if (!payload) return null;
                            return client.updateMemory(memberId, payload).catch(function onSyncError() {
                                return { ok: false };
                            });
                        })
                        .filter(Boolean);

                    const syncResults = await Promise.all(syncTasks);
                    const syncSuccess = syncResults.filter(function countSuccess(result) {
                        return !!(result && result.ok === true);
                    }).length;
                    successCount += syncSuccess;
                    failedCount += Math.max(0, syncTasks.length - syncSuccess);
                }

                if (state.expandedMemoryId === safeMemoryId) {
                    state.expandedMemoryId = '';
                }
                const eventSyncResult = await syncEventRecordAfterAdminAdjust(safeEventId, remainingMembers, {
                    manualEdited: true,
                    manualNote: 'admin_event_member_adjust',
                    syncReason: 'remove_member',
                    previousPatch: currentPatch,
                    versionSource: 'admin_event_remove',
                    versionContext: {
                        memberMemoryId: safeMemoryId,
                        memberPreview: summary
                    }
                });
                if (state.expandedEventMemberMemoryId === safeMemoryId) {
                    state.expandedEventMemberMemoryId = '';
                }
                state.expandedEventId = safeEventId;
                state.expandedEventMembersEventId = remainingMembers.length > 0 ? safeEventId : '';
                state.eventMembersCache = {};
                state.loadingEventMembersEventId = '';
                if (!eventSyncResult || eventSyncResult.ok !== true) {
                    showToastSafe('成员已移出，但当前事件同步失败，可稍后重试', 'info');
                } else {
                    showToastSafe(
                        failedCount > 0
                            ? `成员已移出，并已更新当前事件；其余成员同步成功 ${successCount} 条，失败 ${failedCount} 条`
                            : '成员已移出，并已更新当前事件',
                        failedCount > 0 ? 'info' : 'success'
                    );
                }
                await refreshListTab();
            },
            null,
            '确认移出并更新',
            '取消',
            true
        );
    }

    /**
     * 对当前角色执行一次认知消化（用于成员变更后的事件重整）。
     */
    async function runDigestForCurrentCharacter() {
        const digestModule = root && root.HippocampusDigest && typeof root.HippocampusDigest === 'object'
            ? root.HippocampusDigest
            : null;
        if (!digestModule || typeof digestModule.digestMemories !== 'function') {
            showToastSafe('当前环境不支持事件消化同步', 'info');
            return { ok: false, error: 'digest_unavailable' };
        }

        const charId = toTrimmedString(state.filters.charId);
        if (!charId) {
            showToastSafe('请先选择角色后再执行消化', 'info');
            return { ok: false, error: 'char_required' };
        }

        const apiConfig = getMigrationApiConfig();
        const apiUrl = toTrimmedString(apiConfig && (apiConfig.apiUrl || apiConfig.url || apiConfig.baseUrl));
        const model = toTrimmedString(apiConfig && (apiConfig.model || apiConfig.modelName));
        if (!apiUrl || !model) {
            showToastSafe('未配置消化 API，已跳过自动重整', 'info');
            return { ok: false, error: 'api_config_missing' };
        }

        const userId = await getCurrentUserId();
        if (!userId) {
            showToastSafe('未获取到用户身份，已跳过自动重整', 'error');
            return { ok: false, error: 'user_required' };
        }

        showToastSafe('正在同步事件重整，请稍候...', 'info');
        try {
            const result = await digestModule.digestMemories(
                userId,
                charId,
                getContactLabel(charId),
                null,
                apiConfig
            );
            if (!result || result.ok === false) {
                const errorMessage = toTrimmedString(result && result.error) || 'digest_failed';
                showToastSafe(`事件重整失败：${errorMessage}`, 'error');
                return { ok: false, error: errorMessage };
            }

            const migratedCount = Math.max(0, Math.floor(Number(result && result.migratedCount) || 0));
            const eventizedCount = Math.max(0, Math.floor(Number(result && result.eventizedCount) || 0));
            const assignedFragmentCount = Math.max(0, Math.floor(Number(result && result.assignedFragmentCount) || 0));
            const orphanFragmentCount = Math.max(0, Math.floor(Number(result && result.orphanFragmentCount) || 0));

            if (result.noop === true || (migratedCount === 0 && eventizedCount === 0 && assignedFragmentCount === 0 && orphanFragmentCount === 0)) {
                showToastSafe('当前没有可重整的候选记忆', 'info');
            } else {
                showToastSafe(`事件重整完成：整理 ${eventizedCount} 个事件，迁移 ${migratedCount} 条层级`, 'success');
            }

            return {
                ok: true,
                migratedCount: migratedCount,
                eventizedCount: eventizedCount,
                assignedFragmentCount: assignedFragmentCount,
                orphanFragmentCount: orphanFragmentCount,
                noop: result.noop === true
            };
        } catch (error) {
            showToastSafe('事件重整失败，请稍后重试', 'error');
            return { ok: false, error: toTrimmedString(error && error.message) || 'digest_failed' };
        }
    }

    async function handleDeleteMemory(memoryId) {
        const client = getClient();
        if (!client || typeof client.deleteMemory !== 'function') {
            showToastSafe('删除功能暂不可用', 'error');
            return;
        }

        const memory = findMemoryRecord(memoryId);
        const summary = summarizeContent(memory && memory.content, 42);

        showConfirmSafe(
            '删除记忆',
            `确定要删除这条记忆吗？\n\n${summary}\n\n删除后无法恢复。`,
            async function confirmDeleteMemory() {
                const result = await client.deleteMemory(memoryId);
                if (!result || result.ok !== true) {
                    showToastSafe('删除失败，请稍后重试', 'error');
                    return;
                }

                if (state.expandedMemoryId === memoryId) {
                    state.expandedMemoryId = '';
                }

                showToastSafe('记忆已删除', 'success');
                await refreshListTab();
            },
            null,
            '删除',
            '取消',
            true
        );
    }

    /**
     * 更新迁移忙碌态，并在导出页停留时即时重绘按钮状态。
     */
    function setMigrationBusy(isBusy) {
        state.migrationBusy = !!isBusy;
        if (state.activeTab === 'export') {
            renderLayout();
        }
    }

    /**
     * 更新迁移分段进度，便于用户观察当前执行到了哪一段。
     */
    function setMigrationProgress(current, total, label) {
        const totalNumber = Number(total);
        const currentNumber = Number(current);
        const safeTotal = Math.max(0, Math.floor(Number.isFinite(totalNumber) ? totalNumber : 0));
        const safeCurrent = Math.max(0, Math.min(safeTotal || 0, Math.floor(Number.isFinite(currentNumber) ? currentNumber : 0)));
        state.migrationProgress = {
            active: safeTotal > 0,
            current: safeCurrent,
            total: safeTotal,
            label: toTrimmedString(label)
        };
        if (state.activeTab === 'export') {
            renderLayout();
        }
    }

    /**
     * 清空迁移进度展示，避免用户误以为仍在执行中。
     */
    function clearMigrationProgress() {
        state.migrationProgress = {
            active: false,
            current: 0,
            total: 0,
            label: ''
        };
        if (state.activeTab === 'export') {
            renderLayout();
        }
    }

    /**
     * 读取当前用于旧记忆迁移的目标角色 ID。
     */
    function getSelectedMigrationCharId() {
        return toTrimmedString(state.filters.charId);
    }

    /**
     * 通过 bridge 获取指定角色的旧 YAML 记忆文本。
     */
    function getMigrationSource(charId) {
        const bridge = getBridge();
        if (!bridge || typeof bridge.getMigrationSource !== 'function') {
            return null;
        }

        try {
            const source = bridge.getMigrationSource(charId);
            if (!source || typeof source !== 'object') return null;

            const safeCharId = toTrimmedString(source.id || source.charId || charId);
            if (!safeCharId) return null;

            return {
                id: safeCharId,
                name: toTrimmedString(source.name),
                remark: toTrimmedString(source.remark || source.name) || safeCharId,
                yamlContent: String(source.yamlContent || source.memory || ''),
                sourceType: toTrimmedString(source.sourceType) || 'legacy_contact_memory',
                sourceLabel: toTrimmedString(source.sourceLabel) || '角色已有 YAML 记忆',
                persona: toTrimmedString(source.persona || source.charPersona),
                genderIdentity: toTrimmedString(source.genderIdentity || source.charGenderIdentity || source.charGender),
                userName: toTrimmedString(source.userName),
                userPersona: toTrimmedString(source.userPersona),
                userGenderIdentity: toTrimmedString(source.userGenderIdentity || source.userGender)
            };
        } catch (_) {
            return null;
        }
    }

    /**
     * 通过 bridge 获取迁移应复用的脱水 API 配置。
     */
    function getMigrationApiConfig() {
        const bridge = getBridge();
        if (!bridge || typeof bridge.getDehydrateApiConfig !== 'function') {
            return null;
        }

        try {
            const config = bridge.getDehydrateApiConfig();
            return config && typeof config === 'object' ? config : null;
        } catch (_) {
            return null;
        }
    }

    /**
     * 通过 bridge 获取当前海马体写库所需的认证用户 ID（auth.uid）。
     */
    async function getCurrentUserId() {
        const bridge = getBridge();
        if (!bridge) {
            return '';
        }

        if (typeof bridge.getUserIdAsync === 'function') {
            try {
                return toTrimmedString(await bridge.getUserIdAsync());
            } catch (_) {
                return '';
            }
        }

        if (typeof bridge.getUserId === 'function') {
            try {
                return toTrimmedString(bridge.getUserId());
            } catch (_) {
                return '';
            }
        }

        return '';
    }

    /**
     * 将迁移分段空结果原因码转换成更易读的中文说明。
     */
    function formatMigrationEmptyReason(reasonCode) {
        const code = toTrimmedString(reasonCode);
        if (code === 'json_parse_failed') return 'JSON 解析失败';
        if (code === 'no_json_candidate') return '响应中未找到 JSON';
        if (code === 'no_event_array') return 'JSON 中没有事件数组';
        if (code === 'all_events_filtered') return '事件被本地规则过滤';
        if (code === 'empty_chunk') return '空片段';
        if (code === 'parse_exception') return '解析异常';
        if (!code) return '未知原因';
        return code;
    }

    /**
     * 将脱水失败来源码转换成更易读的中文说明。
     */
    function formatDehydrateSourceLabel(sourceType) {
        const code = toTrimmedString(sourceType);
        if (code === 'manual') return '手动触发';
        if (code === 'auto_online_chat') return '在线聊天自动脱水';
        if (code === 'auto_offline_chat') return '离线聊天自动脱水';
        if (!code) return '';
        return code;
    }

    /**
     * 对迁移预览里的 importance 做量纲兼容，避免 0~1 被直接当作 1~10。
     */
    function normalizeMigrationPreviewEvents(events) {
        const source = Array.isArray(events) ? events : [];
        const finiteImportanceValues = source.map(function mapImportance(event) {
            if (!event || typeof event !== 'object') return NaN;
            return Number(event.importance);
        }).filter(function keepFinite(value) {
            return Number.isFinite(value);
        });
        const hasImportanceGtOne = finiteImportanceValues.some(function isGreaterThanOne(value) {
            return value > 1;
        });
        const hasImportanceBetweenZeroAndOne = finiteImportanceValues.some(function isBetweenZeroAndOne(value) {
            return value > 0 && value < 1;
        });
        const allImportanceEqualOne = finiteImportanceValues.length > 0
            && finiteImportanceValues.every(function isOne(value) {
                return value === 1;
            });
        const scale01To10 = !hasImportanceGtOne && (hasImportanceBetweenZeroAndOne || allImportanceEqualOne);

        return source.map(function normalizeItem(event) {
            const safeEvent = event && typeof event === 'object' ? event : {};
            const rawImportance = Number(safeEvent.importance);
            const importance = Number.isFinite(rawImportance)
                ? Math.min(10, Math.max(1, scale01To10 && rawImportance <= 1 ? rawImportance * 10 : rawImportance))
                : 5;
            return Object.assign({}, safeEvent, {
                importance: importance
            });
        });
    }

    /**
     * 把迁移预览报告整理成人类可读的确认文本，并附带分段诊断摘要。
     */
    function buildMigrationPreviewText(preview, charLabel, chunkCount, chunkDiagnostics = []) {
        const safePreview = preview && typeof preview === 'object' ? preview : {};
        const safeLabel = toTrimmedString(charLabel) || '当前角色';
        const lines = [
            `角色：${safeLabel}`,
            `来源：${toTrimmedString(safePreview.sourceLabel || safePreview.sourceType) || '未知来源'}`,
            `原 YAML 长度：${Number(safePreview.originalYamlLength || 0)} 字`,
            `切分段数：${Number(chunkCount || 0)}`,
            `提取事件：${Number(safePreview.eventCount || 0)} 条`
        ];
        if (toTrimmedString(safePreview.charGenderIdentity)) {
            lines.push(`角色心理性别：${toTrimmedString(safePreview.charGenderIdentity)}`);
        }
        if (toTrimmedString(safePreview.userGenderIdentity)) {
            lines.push(`用户心理性别：${toTrimmedString(safePreview.userGenderIdentity)}`);
        }

        const events = Array.isArray(safePreview.events) ? safePreview.events : [];
        if (events.length > 0) {
            lines.push('');
            lines.push('事件预览：');
            events.forEach(function appendPreviewEvent(event, index) {
                lines.push(`${index + 1}. ${toTrimmedString(event && event.content) || '（空内容）'}`);
                if (toTrimmedString(event && event.event_date)) {
                    lines.push(`   事件时间：${toTrimmedString(event.event_date)}`);
                }
                lines.push(`   情绪预览：valence ${Number(event && event.valence || 0).toFixed(2)} / arousal ${Number(event && event.arousal || 0).toFixed(2)} / importance ${Number(event && event.importance || 0).toFixed(2)}`);
                lines.push(`   层级：${toTrimmedString(event && event.memory_layer) || 'buffer'}`);

                const keywords = Array.isArray(event && event.trigger_keywords) ? event.trigger_keywords.filter(Boolean) : [];
                if (keywords.length > 0) {
                    lines.push(`   触发词：${keywords.join('、')}`);
                }
                const anchors = Array.isArray(event && event.sensory_anchors) ? event.sensory_anchors.filter(Boolean) : [];
                if (anchors.length > 0) {
                    lines.push(`   感官锚点：${anchors.join('、')}`);
                }
            });
        }

        const diagnostics = Array.isArray(chunkDiagnostics) ? chunkDiagnostics : [];
        if (diagnostics.length > 0) {
            const nonEmptyChunkCount = diagnostics.filter((item) => Number(item && item.extractedCount || 0) > 0).length;
            const emptyChunkCount = diagnostics.length - nonEmptyChunkCount;
            const parseFailedCount = diagnostics.filter((item) => !!toTrimmedString(item && item.parseError)).length;

            lines.push('');
            lines.push('分段诊断：');
            lines.push(`1. 有提取结果的段数：${nonEmptyChunkCount}/${diagnostics.length}`);
            lines.push(`2. 空结果段数：${emptyChunkCount}/${diagnostics.length}`);
            lines.push(`3. JSON 解析失败段数：${parseFailedCount}/${diagnostics.length}`);

            if (emptyChunkCount > 0) {
                const reasonCounter = new Map();
                diagnostics.forEach(function countEmptyReason(item) {
                    if (!item || Number(item.extractedCount || 0) > 0) return;
                    const reason = formatMigrationEmptyReason(item.emptyReason);
                    reasonCounter.set(reason, (reasonCounter.get(reason) || 0) + 1);
                });

                const topReasons = Array.from(reasonCounter.entries())
                    .sort(function sortReason(a, b) {
                        return Number(b[1] || 0) - Number(a[1] || 0);
                    })
                    .slice(0, 3);

                if (topReasons.length > 0) {
                    lines.push('4. 空结果主因：');
                    topReasons.forEach(function appendReason(item, index) {
                        lines.push(`   ${index + 1}) ${item[0]}：${item[1]} 段`);
                    });
                }
            }

            const notableChunks = diagnostics
                .map(function mapDiagnostic(item) {
                    const safeItem = item && typeof item === 'object' ? item : {};
                    const extractedCount = Math.max(0, Number(safeItem.extractedCount || 0));
                    const parseError = toTrimmedString(safeItem.parseError);
                    const error = toTrimmedString(safeItem.error);
                    const status = toTrimmedString(safeItem.status);
                    let severity = 0;
                    if (status === 'failed' || error) severity += 3;
                    if (parseError) severity += 2;
                    if (extractedCount <= 0) severity += 1;
                    return {
                        index: Math.max(1, Number(safeItem.index || 0)),
                        status: status,
                        extractedCount: extractedCount,
                        parseError: parseError,
                        error: error,
                        emptyReason: toTrimmedString(safeItem.emptyReason),
                        previewText: toTrimmedString(safeItem.previewText),
                        severity: severity
                    };
                })
                .filter(function keepNotable(item) {
                    return item.severity > 0;
                })
                .sort(function sortNotable(a, b) {
                    if (b.severity !== a.severity) return b.severity - a.severity;
                    return a.index - b.index;
                })
                .slice(0, 3);

            if (notableChunks.length > 0) {
                lines.push('5. 重点留意分段：');
                notableChunks.forEach(function appendNotable(item, index) {
                    const reasons = [];
                    if (item.status === 'failed') reasons.push('执行失败');
                    if (item.parseError) {
                        reasons.push(`解析失败：${item.parseError}`);
                    } else if (item.error) {
                        reasons.push(`报错：${item.error}`);
                    } else if (item.extractedCount <= 0) {
                        reasons.push(`空结果：${formatMigrationEmptyReason(item.emptyReason)}`);
                    }
                    reasons.push(`提取 ${item.extractedCount} 条`);
                    lines.push(`   ${index + 1}) 第 ${item.index} 段：${reasons.join('；')}`);
                    if (item.previewText) {
                        lines.push(`      片段预览：${item.previewText}`);
                    }
                });
            }
        }

        const warnings = Array.isArray(safePreview.warnings) ? safePreview.warnings.filter(Boolean) : [];
        if (warnings.length > 0) {
            lines.push('');
            lines.push('提示：');
            warnings.forEach(function appendWarning(item, index) {
                lines.push(`${index + 1}. ${String(item)}`);
            });
        }

        return lines.join('\n');
    }

    /**
     * 执行“旧 YAML 迁移”流程：读取旧记忆、生成预览、确认后再批量写入。
     */
    function createMigrationChunkState(index, rawText) {
        const cleanPreview = toTrimmedString(rawText)
            .replace(/\s+/g, ' ')
            .slice(0, 120);
        return {
            index: Number(index),
            rawLength: toTrimmedString(rawText).length,
            previewText: cleanPreview,
            status: 'pending',
            attempts: 0,
            extractedCount: 0,
            emptyReason: '',
            parseError: '',
            error: '',
            startedAt: '',
            finishedAt: ''
        };
    }

    /**
     * 生成迁移会话对象，支持失败段续跑。
     */
    function createMigrationSession(source, chunks, apiConfig) {
        const migration = getMigrationModule();
        if (migration && typeof migration.createMigrationSession === 'function') {
            const delegated = migration.createMigrationSession(source, chunks, apiConfig);
            if (delegated && typeof delegated === 'object') {
                return delegated;
            }
        }

        const safeSource = source && typeof source === 'object' ? source : {};
        const safeChunks = Array.isArray(chunks) ? chunks.map(function mapChunk(item) {
            return toTrimmedString(item);
        }).filter(Boolean) : [];
        const createdAt = new Date().toISOString();

        return {
            id: `hip-migration-session-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
            sourceType: toTrimmedString(safeSource.sourceType) || 'legacy_contact_memory',
            sourceLabel: toTrimmedString(safeSource.sourceLabel) || toTrimmedString(safeSource.remark || safeSource.name || safeSource.id),
            charId: toTrimmedString(safeSource.id),
            charName: toTrimmedString(safeSource.name || safeSource.remark || safeSource.id),
            apiConfig: apiConfig && typeof apiConfig === 'object' ? apiConfig : {},
            createdAt: createdAt,
            updatedAt: createdAt,
            completed: false,
            committed: false,
            failedIndex: -1,
            lastError: '',
            preview: null,
            chunks: safeChunks,
            chunkStates: safeChunks.map(function mapChunkState(item, index) {
                return createMigrationChunkState(index, item);
            }),
            eventsByChunk: safeChunks.map(function createEmptyEvents() {
                return [];
            })
        };
    }

    /**
     * 获取迁移会话当前已提取事件列表。
     */
    function getMigrationSessionEvents(session) {
        const migration = getMigrationModule();
        if (migration && typeof migration.getMigrationSessionEvents === 'function') {
            const delegated = migration.getMigrationSessionEvents(session);
            if (Array.isArray(delegated)) return delegated;
        }

        const safeSession = session && typeof session === 'object' ? session : null;
        if (!safeSession || !Array.isArray(safeSession.eventsByChunk)) return [];
        const merged = [];
        safeSession.eventsByChunk.forEach(function appendChunkEvents(events) {
            if (Array.isArray(events) && events.length > 0) {
                Array.prototype.push.apply(merged, events);
            }
        });
        return merged;
    }

    /**
     * 从迁移会话构建分段诊断结构，用于预览与后台展示。
     */
    function buildMigrationDiagnosticsFromSession(session) {
        const migration = getMigrationModule();
        if (migration && typeof migration.getMigrationSessionDiagnostics === 'function') {
            const delegated = migration.getMigrationSessionDiagnostics(session);
            if (Array.isArray(delegated)) return delegated;
        }

        const safeSession = session && typeof session === 'object' ? session : null;
        if (!safeSession || !Array.isArray(safeSession.chunkStates)) return [];
        return safeSession.chunkStates.map(function mapState(chunkState) {
            return {
                index: Number(chunkState.index || 0) + 1,
                previewText: toTrimmedString(chunkState.previewText),
                extractedCount: Math.max(0, Number(chunkState.extractedCount || 0)),
                emptyReason: toTrimmedString(chunkState.emptyReason),
                parseError: toTrimmedString(chunkState.parseError),
                status: toTrimmedString(chunkState.status),
                attempts: Math.max(0, Number(chunkState.attempts || 0)),
                error: toTrimmedString(chunkState.error)
            };
        });
    }

    /**
     * 根据来源选项构建迁移输入源（角色 YAML 或手动粘贴）。
     */
    function buildMigrationSource(sourceOptions, selectedCharId) {
        const options = sourceOptions && typeof sourceOptions === 'object' ? sourceOptions : {};
        const sourceType = toTrimmedString(options.sourceType) || 'legacy_contact_memory';
        const legacySource = getMigrationSource(selectedCharId);

        if (sourceType === 'manual_paste_yaml') {
            const manualYamlText = String(options.manualYamlText || '');
            return Object.assign({}, legacySource || {}, {
                id: selectedCharId,
                name: toTrimmedString(legacySource && legacySource.name) || getContactLabel(selectedCharId),
                remark: toTrimmedString(legacySource && legacySource.remark) || getContactLabel(selectedCharId),
                yamlContent: manualYamlText,
                sourceType: 'manual_paste_yaml',
                sourceLabel: `手动粘贴 YAML（${getContactLabel(selectedCharId) || selectedCharId}）`
            });
        }

        if (!legacySource) return null;
        return Object.assign({}, legacySource, {
            sourceType: 'legacy_contact_memory',
            sourceLabel: '角色已有 YAML 记忆'
        });
    }

    /**
     * 从指定分段开始继续执行迁移，失败时停在当前段并可重试。
     */
    async function runMigrationSessionFromIndex(session, startIndex) {
        const migration = getMigrationModule();
        if (!migration || typeof migration.migrateChunk !== 'function' || typeof migration.generateMigrationPreview !== 'function') {
            showAlertSafe('迁移旧记忆', '迁移模块接口不完整，请刷新页面后重试。');
            return;
        }

        const safeSession = session && typeof session === 'object' ? session : null;
        if (!safeSession || !Array.isArray(safeSession.chunks) || safeSession.chunks.length === 0) return;

        if (typeof migration.runMigrationSessionFromIndex === 'function') {
            setMigrationBusy(true);
            setMigrationProgress(Math.max(0, Math.floor(Number(startIndex) || 0)), safeSession.chunks.length, '准备继续分段解析');
            renderLayout();

            try {
                const delegatedResult = await migration.runMigrationSessionFromIndex(safeSession, startIndex, {
                    onChunkStart: function onDelegatedChunkStart(_session, index, total) {
                        setMigrationProgress(index + 1, total, `正在解析第 ${index + 1} 段`);
                        renderLayout();
                    },
                    onChunkSuccess: function onDelegatedChunkSuccess(currentSession, index, total) {
                        const extractedCount = getMigrationSessionEvents(currentSession).length;
                        setMigrationProgress(index + 1, total, `已完成，累计提取 ${extractedCount} 条事件`);
                        renderLayout();
                    }
                });

                state.migrationSession = delegatedResult && delegatedResult.session && typeof delegatedResult.session === 'object'
                    ? delegatedResult.session
                    : safeSession;

                if (!delegatedResult || delegatedResult.ok === false) {
                    const failedIndex = Math.max(0, Math.floor(Number(delegatedResult && delegatedResult.failedIndex) || 0));
                    const errorMessage = toTrimmedString(delegatedResult && delegatedResult.error)
                        || `第 ${failedIndex + 1} 段迁移失败，请稍后重试。`;
                    showAlertSafe(
                        '迁移旧记忆',
                        `第 ${failedIndex + 1} 段迁移失败：\n${errorMessage}\n\n你可以在下方“分段状态”里一键从该段继续重试。`
                    );
                    renderLayout();
                    return;
                }

                await finalizeMigrationSession(state.migrationSession);
                return;
            } finally {
                setMigrationBusy(false);
                clearMigrationProgress();
                renderLayout();
            }
        }

        const total = safeSession.chunks.length;
        const begin = Math.max(0, Math.min(total - 1, Math.floor(Number(startIndex) || 0)));

        setMigrationBusy(true);
        setMigrationProgress(begin, total, '准备继续分段解析');
        renderLayout();

        try {
            for (let index = begin; index < total; index += 1) {
                const chunkState = safeSession.chunkStates[index];
                if (!chunkState) continue;

                chunkState.status = 'running';
                chunkState.error = '';
                chunkState.emptyReason = '';
                chunkState.parseError = '';
                chunkState.extractedCount = 0;
                chunkState.attempts = Math.max(0, Number(chunkState.attempts || 0)) + 1;
                chunkState.startedAt = new Date().toISOString();
                chunkState.finishedAt = '';
                safeSession.updatedAt = new Date().toISOString();

                setMigrationProgress(index + 1, total, `正在解析第 ${index + 1} 段`);
                renderLayout();

                const result = await migration.migrateChunk(
                    safeSession.chunks[index],
                    safeSession.charId,
                    safeSession.charName,
                    safeSession.apiConfig,
                    safeSession
                );

                if (!result || result.ok === false) {
                    const errorMessage = toTrimmedString(result && result.error) || `第 ${index + 1} 段迁移失败，请稍后重试。`;
                    chunkState.status = 'failed';
                    chunkState.error = errorMessage;
                    chunkState.finishedAt = new Date().toISOString();
                    safeSession.failedIndex = index;
                    safeSession.lastError = errorMessage;
                    safeSession.updatedAt = new Date().toISOString();
                    showAlertSafe(
                        '迁移旧记忆',
                        `第 ${index + 1} 段迁移失败：\n${errorMessage}\n\n你可以在下方“分段状态”里一键从该段继续重试。`
                    );
                    renderLayout();
                    return;
                }

                const events = Array.isArray(result.events) ? result.events : [];
                const debug = result && result.debug && typeof result.debug === 'object' ? result.debug : {};
                safeSession.eventsByChunk[index] = events;
                chunkState.status = 'success';
                chunkState.error = '';
                chunkState.extractedCount = events.length;
                chunkState.emptyReason = toTrimmedString(debug.empty_reason);
                chunkState.parseError = toTrimmedString(debug.parse_error);
                chunkState.finishedAt = new Date().toISOString();
                safeSession.failedIndex = -1;
                safeSession.lastError = '';
                safeSession.updatedAt = new Date().toISOString();

                const extractedCount = getMigrationSessionEvents(safeSession).length;
                setMigrationProgress(index + 1, total, `已完成，累计提取 ${extractedCount} 条事件`);
                renderLayout();
            }

            safeSession.completed = true;
            safeSession.updatedAt = new Date().toISOString();
            await finalizeMigrationSession(safeSession);
        } finally {
            setMigrationBusy(false);
            clearMigrationProgress();
            renderLayout();
        }
    }

    /**
     * 分段迁移完成后生成预览，并在用户确认后写入数据库。
     */
    async function finalizeMigrationSession(session) {
        const migration = getMigrationModule();
        const safeSession = session && typeof session === 'object' ? session : null;
        if (!migration || !safeSession || typeof migration.generateMigrationPreview !== 'function' || typeof migration.commitMigration !== 'function') {
            return;
        }

        const extractedEvents = getMigrationSessionEvents(safeSession);
        const chunkDiagnostics = buildMigrationDiagnosticsFromSession(safeSession);
        const rawPreview = migration.generateMigrationPreview(extractedEvents);
        const previewEvents = normalizeMigrationPreviewEvents(rawPreview && rawPreview.events);
        const preview = Object.assign({}, rawPreview, {
            events: previewEvents,
            eventCount: Array.isArray(previewEvents) ? previewEvents.length : 0
        });
        safeSession.preview = preview;

        if (!preview || preview.ok === false) {
            showAlertSafe('迁移旧记忆', toTrimmedString(preview && preview.error) || '迁移预览生成失败，请稍后重试。');
            return;
        }

        const charLabel = getContactLabel(safeSession.charId);
        const previewText = buildMigrationPreviewText(preview, charLabel, safeSession.chunks.length, chunkDiagnostics);

        if (!preview.readyToCommit) {
            showAlertSafe('迁移预览', `${previewText}\n\n当前没有可写入的海马体事件，原 YAML 未被修改。`);
            return;
        }

        showConfirmSafe(
            '确认迁移旧记忆',
            `${previewText}\n\n确认后将写入 ${preview.eventCount || 0} 条海马体记忆。\n原 YAML 不会被修改，迁移前备份已自动保留。`,
            async function handleYamlMigrationConfirm() {
                const userId = await getCurrentUserId();
                if (!userId) {
                    showAlertSafe('迁移旧记忆', '当前未拿到 Supabase 认证用户 ID（auth.uid），请先完成匿名登录/登录后再迁移写入。');
                    return;
                }

                setMigrationBusy(true);
                showToastSafe('正在写入海马体记忆...', 'info');

                try {
                    const result = await migration.commitMigration(userId, safeSession.charId, preview.events);
                    if (!result || result.ok === false) {
                        showAlertSafe('迁移旧记忆', toTrimmedString(result && result.error) || '迁移写入失败，请稍后重试。');
                        return;
                    }

                    const insertedCount = Math.max(0, Number(result.insertedCount || 0));
                    const embeddingMissingCount = Math.max(0, Number(result.embeddingMissingCount || 0));
                    const embeddingQueuedCount = Math.max(0, Number(result.embeddingQueuedCount || 0));
                    const embeddingBatchId = toTrimmedString(result.embeddingBatchId);
                    const embeddingBackfillEnabled = !!result.embeddingBackfillEnabled;
                    const vectorStatusText = embeddingBackfillEnabled
                        ? (embeddingQueuedCount > 0
                            ? `其中 ${embeddingQueuedCount} 条已加入后台向量化队列，完成后会自动提示成功/失败明细。`
                            : (embeddingMissingCount > 0
                                ? `当前有 ${embeddingMissingCount} 条待向量化，但本次未成功入队，可稍后点击“回填缺失向量”。`
                                : '本次迁移没有待向量化记录。'))
                        : `当前 Embedding 配置不可用，已有 ${embeddingMissingCount} 条写入但未进入向量化。`;

                    if (embeddingBatchId) {
                        state.migrationBatchContext[embeddingBatchId] = {
                            batchId: embeddingBatchId,
                            charId: safeSession.charId,
                            charLabel: charLabel,
                            queuedCount: embeddingQueuedCount,
                            insertedCount: insertedCount
                        };
                    }

                    safeSession.committed = true;
                    safeSession.updatedAt = new Date().toISOString();
                    state.notice = `已为“${charLabel}”迁移 ${insertedCount} 条旧记忆，${vectorStatusText} 原 YAML 未被修改。`;
                    showToastSafe(
                        embeddingQueuedCount > 0
                            ? `旧记忆迁移完成，共写入 ${insertedCount} 条；已入队向量化 ${embeddingQueuedCount} 条`
                            : `旧记忆迁移完成，共写入 ${insertedCount} 条`,
                        'success'
                    );
                    renderLayout();
                } finally {
                    setMigrationBusy(false);
                }
            },
            null,
            '确认迁移',
            '取消',
            true
        );
    }

    /**
     * 从失败段继续重试迁移。
     */
    async function handleRetryMigrationSegment(segmentIndex) {
        if (state.migrationBusy) return;
        const session = state.migrationSession && typeof state.migrationSession === 'object'
            ? state.migrationSession
            : null;
        if (!session || !Array.isArray(session.chunkStates) || session.chunkStates.length === 0) {
            showToastSafe('当前没有可重试的迁移会话', 'info');
            return;
        }

        const retryIndex = Math.max(0, Math.min(session.chunkStates.length - 1, Math.floor(Number(segmentIndex) || 0)));
        const targetState = session.chunkStates[retryIndex];
        if (!targetState || targetState.status !== 'failed') {
            showToastSafe('该分段当前不是失败状态', 'info');
            return;
        }

        showConfirmSafe(
            '从失败段继续',
            `将从第 ${retryIndex + 1} 段开始继续迁移，前面成功段不会重跑。\n\n是否现在重试？`,
            async function confirmRetryMigrationSegment() {
                const migration = getMigrationModule();
                if (migration && typeof migration.resetMigrationSessionFromIndex === 'function') {
                    const resetSession = migration.resetMigrationSessionFromIndex(session, retryIndex);
                    if (resetSession && typeof resetSession === 'object') {
                        state.migrationSession = resetSession;
                    }
                } else {
                    for (let i = retryIndex; i < session.chunkStates.length; i += 1) {
                        const previous = session.chunkStates[i];
                        session.chunkStates[i] = Object.assign({}, previous, {
                            status: 'pending',
                            extractedCount: 0,
                            emptyReason: '',
                            parseError: '',
                            error: '',
                            startedAt: '',
                            finishedAt: ''
                        });
                        session.eventsByChunk[i] = [];
                    }
                    session.completed = false;
                    session.committed = false;
                    session.failedIndex = -1;
                    session.lastError = '';
                    session.preview = null;
                    session.updatedAt = new Date().toISOString();
                }
                renderLayout();
                await runMigrationSessionFromIndex(state.migrationSession || session, retryIndex);
            },
            null,
            '继续重试',
            '取消',
            true
        );
    }

    /**
     * 执行“旧 YAML 迁移”流程：支持角色 YAML 与手动粘贴 YAML 两种来源。
     */
    async function handleYamlMigration(sourceOptions) {
        if (state.migrationBusy) return;

        const migration = getMigrationModule();
        const selectedCharId = getSelectedMigrationCharId();

        if (!migration) {
            showAlertSafe('迁移旧记忆', '迁移模块尚未加载，请刷新页面后重试。');
            return;
        }

        if (
            typeof migration.parseYamlMemory !== 'function'
            || typeof migration.migrateChunk !== 'function'
            || typeof migration.generateMigrationPreview !== 'function'
            || typeof migration.commitMigration !== 'function'
        ) {
            showAlertSafe('迁移旧记忆', '迁移模块接口不完整，请刷新页面后重试。');
            return;
        }

        if (!selectedCharId) {
            showAlertSafe('迁移旧记忆', '请先在顶部“角色范围”里选择一个具体角色，再开始迁移。');
            return;
        }

        const source = buildMigrationSource(sourceOptions, selectedCharId);
        if (!source) {
            showAlertSafe('迁移旧记忆', '无法读取该角色的 YAML 记忆源。请确认角色存在或手动粘贴 YAML。');
            return;
        }

        const yamlContent = String(source.yamlContent || '');
        if (!yamlContent.trim()) {
            const sourceLabel = toTrimmedString(source.sourceType) === 'manual_paste_yaml' ? '手动输入内容' : `角色“${source.remark || source.name || selectedCharId}”`;
            showAlertSafe('迁移旧记忆', `${sourceLabel}当前没有可迁移的 YAML 文本。`);
            return;
        }

        const apiConfig = getMigrationApiConfig();
        const apiUrl = toTrimmedString(apiConfig && (apiConfig.apiUrl || apiConfig.url || apiConfig.baseUrl));
        const model = toTrimmedString(apiConfig && (apiConfig.model || apiConfig.modelName));
        if (!apiUrl || !model) {
            showAlertSafe('迁移旧记忆', '请先在设置面板里填写脱水 API URL 和模型名，再执行旧记忆迁移。');
            return;
        }

        showToastSafe('正在分析 YAML 记忆并切分段落...', 'info');
        const chunks = migration.parseYamlMemory(yamlContent);
        if (!Array.isArray(chunks) || chunks.length === 0) {
            showAlertSafe('迁移旧记忆', '没有解析出可迁移的 YAML 段落。');
            return;
        }

        if (state.migrationSession && typeof migration.clearMigrationSession === 'function') {
            migration.clearMigrationSession(state.migrationSession);
        }
        state.migrationSession = createMigrationSession(source, chunks, apiConfig);
        renderLayout();
        await runMigrationSessionFromIndex(state.migrationSession, 0);
    }

    /**
     * 手动触发“缺失向量回填”，用于处理之前因 429 降级的迁移记忆。
     */
    async function handleRetryMissingEmbeddings() {
        if (state.migrationBusy) return;

        const migration = getMigrationModule();
        const selectedCharId = getSelectedMigrationCharId();
        if (!migration || typeof migration.retryMissingEmbeddings !== 'function') {
            showAlertSafe('回填缺失向量', '当前迁移模块不支持缺失向量回填，请刷新页面后重试。');
            return;
        }

        if (!selectedCharId) {
            showAlertSafe('回填缺失向量', '请先在顶部“角色范围”里选择一个具体角色。');
            return;
        }

        const userId = await getCurrentUserId();
        if (!userId) {
            showAlertSafe('回填缺失向量', '当前未拿到 Supabase 认证用户 ID（auth.uid），请先登录后再回填。');
            return;
        }

        const charLabel = getContactLabel(selectedCharId);
        setMigrationBusy(true);
        showToastSafe('正在扫描缺失向量记忆并加入后台回填队列...', 'info');

        try {
            const result = await migration.retryMissingEmbeddings(userId, selectedCharId, {
                sourceType: 'yaml_migration',
                limit: 500
            });
            if (!result || result.ok === false) {
                showAlertSafe('回填缺失向量', toTrimmedString(result && result.error) || '回填任务启动失败，请稍后重试。');
                return;
            }

            const totalMissing = Math.max(0, Number(result.totalMissing || 0));
            const queuedCount = Math.max(0, Number(result.queuedCount || 0));
            const batchId = toTrimmedString(result.batchId);
            const scannedCount = Math.max(0, Number(result.scannedCount || 0));
            if (batchId) {
                state.migrationBatchContext[batchId] = {
                    batchId: batchId,
                    charId: selectedCharId,
                    charLabel: charLabel,
                    queuedCount: queuedCount,
                    insertedCount: 0
                };
            }
            state.notice = `“${charLabel}”缺失向量扫描完成：缺失总数 ${totalMissing} 条，本次入队 ${queuedCount} 条（扫描 ${scannedCount} 条）。`;
            renderLayout();
            showToastSafe(`缺失向量回填已启动：入队 ${queuedCount} 条`, 'success');
        } finally {
            setMigrationBusy(false);
        }
    }

        /**
     * 将 Valence 和 Arousal 转化为自然语言（简短）。
     */
    function humanizeEmotion(valence, arousal) {
        if (valence === null || arousal === null) return '似乎有些在意';
        const v = Number(valence);
        const a = Number(arousal);
        if (v > 0.6 && a > 0.5) return '这件事让 TA 感到温暖且难以忘怀';
        if (v > 0.6) return '这件事让 TA 感到很开心';
        if (v > 0.2) return '回想起来有一丝温馨';
        if (v < -0.6 && a > 0.5) return 'TA 至今想起来心里就揪成一团';
        if (v < -0.6) return '这件事让 TA 感到心碎';
        if (v < -0.2) return '这件事让 TA 感到不安';
        if (a > 0.5) return '这件事让 TA 感到强烈悸动';
        return '这是一个平静的瞬间';
    }

    /**
     * 将记忆层级转化为中文展现。
     */
    function humanizeLayer(layer) {
        const l = toTrimmedString(layer).toLowerCase();
        if (l === 'buffer') return '日常碎片';
        if (l === 'core') return '深刻记忆';
        if (l === 'cortex') return '学到的事';
        if (l === 'shadow') return '未愈合的伤';
        if (l === 'wish') return '期盼与约定';
        return '记忆碎片';
    }

    /**
     * 根据分数判断重要性。
     */
    function normalizeImportanceForDisplay(score) {
        const numeric = Number(score);
        if (!Number.isFinite(numeric)) return 0;
        const normalized = (numeric >= 0 && numeric <= 1) ? (numeric * 10) : numeric;
        return Math.max(0, normalized);
    }

    /**
     * 根据分数判断重要性。
     */
    function humanizeImportance(score) {
        const s = normalizeImportanceForDisplay(score);
        if (s >= 8) return '刻骨铭心';
        if (s >= 5) return '很重要';
        if (s >= 2) return '有所触动';
        return '一件小事';
    }

    /**
     * 返回对应情绪色彩的 CSS Variable Hex。
     */
    function getEmotionColor(valence, arousal, layer) {
        const l = toTrimmedString(layer).toLowerCase();
        if (l === 'buffer') return '#60a5fa'; // 日常碎片：蓝色
        if (l === 'core') return '#f59e0b'; // 深刻记忆：琥珀
        if (l === 'cortex') return '#4ade80'; // 学到的事：绿色
        if (l === 'shadow') return '#94a3b8'; // 未愈合的伤：冷灰蓝
        if (l === 'wish') return '#a78bfa'; // 期盼与约定：淡紫

        const rawValence = Number(valence);
        const rawArousal = Number(arousal);
        const hasValence = Number.isFinite(rawValence);
        const hasArousal = Number.isFinite(rawArousal);

        if (!hasValence && !hasArousal) {
            return '#60a5fa';
        }

        const v = hasValence
            ? ((rawValence >= 0 && rawValence <= 1) ? ((rawValence * 2) - 1) : rawValence)
            : 0;
        const a = hasArousal
            ? Math.max(0, Math.min(1, rawArousal))
            : 0;

        if (v >= 0.45 && a >= 0.55) return '#fb923c'; // 高唤醒正向
        if (v >= 0.2) return '#fbbf24'; // 温暖正向
        if (v <= -0.45 && a >= 0.45) return '#fb7185'; // 高唤醒负向
        if (v <= -0.2) return '#94a3b8'; // 低唤醒负向
        if (a >= 0.75) return '#22d3ee'; // 中性但高唤醒
        return '#60a5fa'; // 默认中性蓝
    }

    /**
     * 距今多少时间的表示
     */
    function formatTimeAgo(dateInput) {
        if (!dateInput) return '刚才';
        const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
        if (Number.isNaN(date.getTime())) return '刚才';
        const diffMs = Date.now() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        if (diffMins < 60) return diffMins <= 0 ? '刚才' : diffMins + ' 分钟前';
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return diffHours + ' 小时前';
        const diffDays = Math.floor(diffHours / 24);
        if (diffDays < 30) return diffDays + ' 天前';
        const diffMonths = Math.floor(diffDays / 30);
        if (diffMonths < 12) return diffMonths + ' 个月前';
        return Math.floor(diffDays / 365) + ' 年前';
    }

    /**
     * 重绘整个管理台布局，包括顶部工具条和当前页签内容。
     */
    function renderLayout() {
        const rootEl = getElements().rootEl;
        if (!rootEl) return;

        const panelHtml = renderActivePanel();
        const selectedScopeLabel = state.filters.charId
            ? getContactLabel(state.filters.charId)
            : '全部已开启海马体角色';

        rootEl.innerHTML = `
            <div class="hip-safe-area">
                <header class="hip-header">
                    <button type="button" class="hip-icon-btn" data-hip-action="go-back" aria-label="返回聊天设置">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"></path>
                        </svg>
                    </button>
                    <div class="hip-header-content">
                        <h1 class="hip-title">记忆管理台</h1>
                        <div class="hip-subtitle">${escapeHtml(selectedScopeLabel)}</div>
                    </div>
                    <button type="button" class="hip-icon-btn" data-hip-action="refresh-tab" aria-label="刷新管理台">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.58m15.36 2A8 8 0 004.58 9m0 0H9m11 11v-5h-.58m0 0a8 8 0 01-15.36-2m15.36 2H15"></path>
                        </svg>
                    </button>
                </header>

                <nav class="hip-nav-tabs" role="tablist">
                    <button type="button" class="hip-tab ${state.activeTab === 'overview' ? 'active' : ''}" data-hip-action="switch-tab" data-tab="overview">此刻</button>
                    <button type="button" class="hip-tab ${state.activeTab === 'recon' ? 'active' : ''}" data-hip-action="switch-tab" data-tab="recon">改写记录</button>
                    <button type="button" class="hip-tab ${state.activeTab === 'audit' ? 'active' : ''}" data-hip-action="switch-tab" data-tab="audit">线索排查</button>
                    <button type="button" class="hip-tab ${state.activeTab === 'diagnostics' ? 'active' : ''}" data-hip-action="switch-tab" data-tab="diagnostics">风险总览</button>
                    <button type="button" class="hip-tab ${state.activeTab === 'list' ? 'active' : ''}" data-hip-action="switch-tab" data-tab="list">所有记忆</button>
                    <button type="button" class="hip-tab ${state.activeTab === 'continuity' ? 'active' : ''}" data-hip-action="switch-tab" data-tab="continuity">48h摘要</button>
                    <button type="button" class="hip-tab ${state.activeTab === 'relationship' ? 'active' : ''}" data-hip-action="switch-tab" data-tab="relationship">关系脉络</button>
                    <button type="button" class="hip-tab ${state.activeTab === 'notebook' ? 'active' : ''}" data-hip-action="switch-tab" data-tab="notebook">记事本</button>
                    <button type="button" class="hip-tab ${state.activeTab === 'export' ? 'active' : ''}" data-hip-action="switch-tab" data-tab="export">记忆保管箱</button>
                </nav>

                ${state.notice ? `<div class="hip-notice-banner">${escapeHtml(state.notice)}</div>` : ''}
                <main class="hip-main-content">
                    ${panelHtml}
                </main>
                ${renderAdminDialog()}
            </div>
        `;

        syncNeuralGlobeLifecycle();
    }

    /**
     * 渲染管理台内的自定义弹窗。
     */
    function renderAdminDialog() {
        const dialog = state.adminDialog && typeof state.adminDialog === 'object'
            ? state.adminDialog
            : null;
        if (!dialog || !dialog.type) return '';

        if (dialog.type === 'edit-memory') {
            const contentValue = escapeHtml(toTrimmedString(dialog.content));
            const eventTitle = toTrimmedString(dialog.eventTitle);
            const eventId = toTrimmedString(dialog.eventId);
            const metaText = eventId
                ? `当前属于记忆事件：${eventTitle || '未命名事件'}`
                : '当前是独立记忆碎片';
            return `
                <div class="hip-dialog-layer" role="presentation">
                    <button type="button" class="hip-dialog-backdrop" data-hip-action="close-admin-dialog" aria-label="关闭弹窗"></button>
                    <form id="hip-admin-edit-memory-form" class="hip-dialog-panel" aria-label="修改记忆">
                        <div class="hip-dialog-head">
                            <div>
                                <div class="hip-dialog-title">修改记忆</div>
                                <div class="hip-dialog-subtitle">只修改这条记忆正文，不会顺手重整其他记忆或事件。</div>
                            </div>
                            <button type="button" class="hip-dialog-close" data-hip-action="close-admin-dialog" aria-label="关闭">×</button>
                        </div>
                        <div class="hip-dialog-meta">${escapeHtml(metaText)}</div>
                        <input type="hidden" name="memoryId" value="${escapeAttribute(toTrimmedString(dialog.memoryId))}">
                        <label class="hip-dialog-field">
                            <span class="hip-dialog-label">记忆内容</span>
                            <textarea class="hip-dialog-textarea" name="content" rows="6" ${dialog.busy ? 'disabled' : ''} required>${contentValue}</textarea>
                        </label>
                        <div class="hip-dialog-actions">
                            <button type="button" class="hip-btn-outline" data-hip-action="close-admin-dialog" ${dialog.busy ? 'disabled' : ''}>取消</button>
                            <button type="submit" class="hip-btn-primary" ${dialog.busy ? 'disabled' : ''}>${dialog.busy ? '保存中...' : '保存记忆'}</button>
                        </div>
                    </form>
                </div>
            `;
        }

        if (dialog.type === 'edit-event') {
            const titleValue = escapeAttribute(toTrimmedString(dialog.title));
            const summaryValue = escapeHtml(toTrimmedString(dialog.summary));
            const memberCount = Math.max(0, Number(dialog.memberCount || 0));
            return `
                <div class="hip-dialog-layer" role="presentation">
                    <button type="button" class="hip-dialog-backdrop" data-hip-action="close-admin-dialog" aria-label="关闭弹窗"></button>
                    <form id="hip-admin-edit-event-form" class="hip-dialog-panel" aria-label="编辑记忆事件">
                        <div class="hip-dialog-head">
                            <div>
                                <div class="hip-dialog-title">编辑记忆事件</div>
                                <div class="hip-dialog-subtitle">只更新这个事件本身，不会顺手重整整批旧记忆。</div>
                            </div>
                            <button type="button" class="hip-dialog-close" data-hip-action="close-admin-dialog" aria-label="关闭">×</button>
                        </div>
                        <div class="hip-dialog-meta">当前可编辑成员：${memberCount} 条</div>
                        <input type="hidden" name="eventId" value="${escapeAttribute(toTrimmedString(dialog.eventId))}">
                        <label class="hip-dialog-field">
                            <span class="hip-dialog-label">事件标题</span>
                            <input class="hip-dialog-input" type="text" name="title" maxlength="120" value="${titleValue}" ${dialog.busy ? 'disabled' : ''} required>
                        </label>
                        <label class="hip-dialog-field">
                            <span class="hip-dialog-label">事件摘要</span>
                            <textarea class="hip-dialog-textarea" name="summary" rows="5" ${dialog.busy ? 'disabled' : ''} required>${summaryValue}</textarea>
                        </label>
                        <div class="hip-dialog-actions">
                            <button type="button" class="hip-btn-outline" data-hip-action="close-admin-dialog" ${dialog.busy ? 'disabled' : ''}>取消</button>
                            <button type="submit" class="hip-btn-primary" ${dialog.busy ? 'disabled' : ''}>${dialog.busy ? '保存中...' : '保存事件'}</button>
                        </div>
                    </form>
                </div>
            `;
        }

        if (dialog.type === 'attach-event') {
            const options = Array.isArray(dialog.options) ? dialog.options : [];
            const optionHtml = options.map(function renderOption(item) {
                const eventId = toTrimmedString(item && item.eventId);
                const title = escapeHtml(toTrimmedString(item && item.title) || '记忆事件');
                const summary = escapeHtml(toTrimmedString(item && item.summary) || '暂无摘要');
                const memberCount = Math.max(0, Number(item && item.memberCount || 0));
                const latestText = Number(item && item.latestTimestamp || 0) > 0
                    ? escapeHtml(formatTimeAgo(new Date(Number(item.latestTimestamp)).toISOString()))
                    : '刚刚';
                const checked = eventId === toTrimmedString(dialog.selectedEventId);
                return `
                    <label class="hip-dialog-choice${checked ? ' is-selected' : ''}">
                        <input type="radio" name="selectedEventId" value="${escapeAttribute(eventId)}" ${checked ? 'checked' : ''} ${dialog.busy ? 'disabled' : ''}>
                        <div class="hip-dialog-choice-body">
                            <div class="hip-dialog-choice-title">${title}</div>
                            <div class="hip-dialog-choice-meta">${memberCount} 条成员 · ${latestText}</div>
                            <div class="hip-dialog-choice-summary">${summary}</div>
                        </div>
                    </label>
                `;
            }).join('');
            return `
                <div class="hip-dialog-layer" role="presentation">
                    <button type="button" class="hip-dialog-backdrop" data-hip-action="close-admin-dialog" aria-label="关闭弹窗"></button>
                    <form id="hip-admin-attach-event-form" class="hip-dialog-panel" aria-label="并入记忆事件">
                        <div class="hip-dialog-head">
                            <div>
                                <div class="hip-dialog-title">并入记忆事件</div>
                                <div class="hip-dialog-subtitle">选择一个已有事件即可，不再弹系统输入框。</div>
                            </div>
                            <button type="button" class="hip-dialog-close" data-hip-action="close-admin-dialog" aria-label="关闭">×</button>
                        </div>
                        <div class="hip-dialog-meta">本次只会同步目标事件，不会自动全量重整旧碎片。</div>
                        <input type="hidden" name="memoryId" value="${escapeAttribute(toTrimmedString(dialog.memoryId))}">
                        <div class="hip-dialog-preview">
                            <div class="hip-dialog-preview-label">待并入碎片</div>
                            <div class="hip-dialog-preview-body">${escapeHtml(toTrimmedString(dialog.memoryPreview) || '（空内容）')}</div>
                        </div>
                        <div class="hip-dialog-choice-list">
                            ${optionHtml || '<div class="hip-empty hip-empty-compact">当前页没有可选事件。</div>'}
                        </div>
                        <div class="hip-dialog-actions">
                            <button type="button" class="hip-btn-outline" data-hip-action="close-admin-dialog" ${dialog.busy ? 'disabled' : ''}>取消</button>
                            <button type="submit" class="hip-btn-primary" ${dialog.busy ? 'disabled' : ''}>${dialog.busy ? '并入中...' : '确认并入'}</button>
                        </div>
                    </form>
                </div>
            `;
        }

        if (dialog.type === 'merge-event') {
            const options = Array.isArray(dialog.options) ? dialog.options : [];
            const optionHtml = options.map(function renderOption(item) {
                const eventId = toTrimmedString(item && item.eventId);
                const title = escapeHtml(toTrimmedString(item && item.title) || '记忆事件');
                const summary = escapeHtml(toTrimmedString(item && item.summary) || '暂无摘要');
                const memberCount = Math.max(0, Number(item && item.memberCount || 0));
                const latestText = Number(item && item.latestTimestamp || 0) > 0
                    ? escapeHtml(formatTimeAgo(new Date(Number(item.latestTimestamp)).toISOString()))
                    : '刚刚';
                const checked = eventId === toTrimmedString(dialog.selectedEventId);
                return `
                    <label class="hip-dialog-choice${checked ? ' is-selected' : ''}">
                        <input type="radio" name="selectedEventId" value="${escapeAttribute(eventId)}" ${checked ? 'checked' : ''} ${dialog.busy ? 'disabled' : ''}>
                        <div class="hip-dialog-choice-body">
                            <div class="hip-dialog-choice-title">${title}</div>
                            <div class="hip-dialog-choice-meta">${memberCount} 条成员 · ${latestText}</div>
                            <div class="hip-dialog-choice-summary">${summary}</div>
                        </div>
                    </label>
                `;
            }).join('');
            return `
                <div class="hip-dialog-layer" role="presentation">
                    <button type="button" class="hip-dialog-backdrop" data-hip-action="close-admin-dialog" aria-label="关闭弹窗"></button>
                    <form id="hip-admin-merge-event-form" class="hip-dialog-panel" aria-label="并入其他记忆事件">
                        <div class="hip-dialog-head">
                            <div>
                                <div class="hip-dialog-title">并入其他记忆事件</div>
                                <div class="hip-dialog-subtitle">把当前事件的全部成员并到另一个已有事件里。</div>
                            </div>
                            <button type="button" class="hip-dialog-close" data-hip-action="close-admin-dialog" aria-label="关闭">×</button>
                        </div>
                        <div class="hip-dialog-meta">本次优先保留目标事件的标题和摘要，源事件会在成员搬空后自动清理。</div>
                        <input type="hidden" name="eventId" value="${escapeAttribute(toTrimmedString(dialog.eventId))}">
                        <div class="hip-dialog-preview">
                            <div class="hip-dialog-preview-label">待并入事件</div>
                            <div class="hip-dialog-preview-body">${escapeHtml(toTrimmedString(dialog.sourceTitle) || '记忆事件')}</div>
                            <div class="hip-dialog-preview-sub">${escapeHtml(toTrimmedString(dialog.sourceSummary) || '暂无摘要')}</div>
                            <div class="hip-dialog-preview-meta">${Math.max(0, Number(dialog.sourceMemberCount || 0))} 条成员</div>
                        </div>
                        <div class="hip-dialog-choice-list">
                            ${optionHtml || '<div class="hip-empty hip-empty-compact">当前页没有可选目标事件。</div>'}
                        </div>
                        <div class="hip-dialog-actions">
                            <button type="button" class="hip-btn-outline" data-hip-action="close-admin-dialog" ${dialog.busy ? 'disabled' : ''}>取消</button>
                            <button type="submit" class="hip-btn-primary" ${dialog.busy ? 'disabled' : ''}>${dialog.busy ? '并入中...' : '确认并入'}</button>
                        </div>
                    </form>
                </div>
            `;
        }

        if (dialog.type === 'notebook-editor') {
            const kind = toTrimmedString(dialog.notebookKind);
            const mode = toTrimmedString(dialog.mode) || 'create';
            const titleMap = {
                redline: mode === 'edit' ? '编辑底线' : '新增底线',
                mustRemember: mode === 'edit' ? '编辑必须牢记事项' : '新增必须牢记事项',
                profile: mode === 'edit' ? '编辑偏好档案' : '新增偏好档案'
            };
            const subtitleMap = {
                redline: '这些内容会在每次对话前提醒 TA，不会被随机漏掉。',
                mustRemember: '这些内容会始终常驻在 TA 的脑海里，每轮都会读到。',
                profile: '这些内容是 TA 了解你的方式，可以手动补充或修正。'
            };
            const formId = 'hip-admin-notebook-form';
            const contentValue = escapeHtml(toTrimmedString(dialog.content));
            const categoryValue = toTrimmedString(dialog.category);
            const severityValue = toTrimmedString(dialog.severity);
            const confidenceValue = toTrimmedString(dialog.confidence);

            let bodyHtml = '';
            if (kind === 'redline') {
                bodyHtml = `
                    <input type="hidden" name="kind" value="redline">
                    <input type="hidden" name="mode" value="${escapeAttribute(mode)}">
                    <input type="hidden" name="itemId" value="${escapeAttribute(toTrimmedString(dialog.itemId))}">
                    <label class="hip-dialog-field">
                        <span class="hip-dialog-label">内容</span>
                        <textarea class="hip-dialog-textarea" name="content" rows="5" ${dialog.busy ? 'disabled' : ''} required>${contentValue}</textarea>
                    </label>
                    <label class="hip-dialog-field">
                        <span class="hip-dialog-label">严重程度</span>
                        <select class="hip-dialog-input" name="severity" ${dialog.busy ? 'disabled' : ''}>
                            <option value="critical" ${severityValue === 'critical' ? 'selected' : ''}>致命</option>
                            <option value="important" ${severityValue === 'important' ? 'selected' : ''}>重要</option>
                            <option value="reminder" ${severityValue === 'reminder' ? 'selected' : ''}>提醒</option>
                        </select>
                    </label>
                `;
            } else if (kind === 'mustRemember') {
                bodyHtml = `
                    <input type="hidden" name="kind" value="mustRemember">
                    <input type="hidden" name="mode" value="${escapeAttribute(mode)}">
                    <input type="hidden" name="itemId" value="${escapeAttribute(toTrimmedString(dialog.itemId))}">
                    <label class="hip-dialog-field">
                        <span class="hip-dialog-label">内容</span>
                        <textarea class="hip-dialog-textarea" name="content" rows="5" ${dialog.busy ? 'disabled' : ''} required>${contentValue}</textarea>
                    </label>
                    <label class="hip-dialog-field">
                        <span class="hip-dialog-label">分类</span>
                        <select class="hip-dialog-input" name="category" ${dialog.busy ? 'disabled' : ''}>
                            <option value="fact" ${categoryValue === 'fact' ? 'selected' : ''}>重要事实</option>
                            <option value="health" ${categoryValue === 'health' ? 'selected' : ''}>健康相关</option>
                            <option value="relationship" ${categoryValue === 'relationship' ? 'selected' : ''}>关系相关</option>
                            <option value="promise" ${categoryValue === 'promise' ? 'selected' : ''}>约定承诺</option>
                            <option value="trigger" ${categoryValue === 'trigger' ? 'selected' : ''}>雷点提醒</option>
                            <option value="other" ${categoryValue === 'other' ? 'selected' : ''}>其他</option>
                        </select>
                    </label>
                `;
            } else if (kind === 'profile') {
                bodyHtml = `
                    <input type="hidden" name="kind" value="profile">
                    <input type="hidden" name="mode" value="${escapeAttribute(mode)}">
                    <input type="hidden" name="itemId" value="${escapeAttribute(toTrimmedString(dialog.itemId))}">
                    <label class="hip-dialog-field">
                        <span class="hip-dialog-label">内容</span>
                        <textarea class="hip-dialog-textarea" name="content" rows="5" ${dialog.busy ? 'disabled' : ''} required>${contentValue}</textarea>
                    </label>
                    <label class="hip-dialog-field">
                        <span class="hip-dialog-label">分类</span>
                        <select class="hip-dialog-input" name="category" ${dialog.busy ? 'disabled' : ''}>
                            <option value="preference" ${categoryValue === 'preference' ? 'selected' : ''}>喜好偏好</option>
                            <option value="habit" ${categoryValue === 'habit' ? 'selected' : ''}>日常习惯</option>
                            <option value="identity" ${categoryValue === 'identity' ? 'selected' : ''}>个人信息</option>
                            <option value="other" ${categoryValue === 'other' ? 'selected' : ''}>其他</option>
                        </select>
                    </label>
                    <label class="hip-dialog-field">
                        <span class="hip-dialog-label">确定程度</span>
                        <select class="hip-dialog-input" name="confidence" ${dialog.busy ? 'disabled' : ''}>
                            <option value="stated" ${confidenceValue === 'stated' ? 'selected' : ''}>明确说过</option>
                            <option value="inferred" ${confidenceValue === 'inferred' ? 'selected' : ''}>聊天推断</option>
                            <option value="uncertain" ${confidenceValue === 'uncertain' ? 'selected' : ''}>还不确定</option>
                        </select>
                    </label>
                `;
            }

            return `
                <div class="hip-dialog-layer" role="presentation">
                    <button type="button" class="hip-dialog-backdrop" data-hip-action="close-admin-dialog" aria-label="关闭弹窗"></button>
                    <form id="${formId}" class="hip-dialog-panel" aria-label="${escapeAttribute(titleMap[kind] || '编辑记事本')}">
                        <div class="hip-dialog-head">
                            <div>
                                <div class="hip-dialog-title">${escapeHtml(titleMap[kind] || '编辑记事本')}</div>
                                <div class="hip-dialog-subtitle">${escapeHtml(subtitleMap[kind] || '')}</div>
                            </div>
                            <button type="button" class="hip-dialog-close" data-hip-action="close-admin-dialog" aria-label="关闭">关闭</button>
                        </div>
                        ${bodyHtml}
                        <div class="hip-dialog-actions">
                            <button type="button" class="hip-btn-outline" data-hip-action="close-admin-dialog" ${dialog.busy ? 'disabled' : ''}>取消</button>
                            <button type="submit" class="hip-btn-primary" ${dialog.busy ? 'disabled' : ''}>${dialog.busy ? '保存中...' : '确认保存'}</button>
                        </div>
                    </form>
                </div>
            `;
        }

        return '';
    }

    /**
     * 根据当前页签返回对应的面板 HTML。
     */
    function renderActivePanel() {
        if (state.activeTab === 'overview') {
            return renderOverviewPanel();
        }
        if (state.activeTab === 'recon') {
            return renderReconPanel();
        }
        if (state.activeTab === 'audit') {
            return renderAuditPanel();
        }
        if (state.activeTab === 'diagnostics') {
            return renderDiagnosticsPanel();
        }
        if (state.activeTab === 'list') {
            return renderListPanel();
        }
        if (state.activeTab === 'continuity') {
            return renderContinuityPanel();
        }
        if (state.activeTab === 'relationship') {
            return renderRelationshipArcPanel();
        }
        if (state.activeTab === 'notebook') {
            return renderNotebookPanel();
        }
        if (state.activeTab === 'snapshot') {
            return renderSnapshotPanel();
        }
        return renderExportPanel();
    }

    /**
     * 渲染总览页。
     */
    function renderOverviewPanel() {
        if (state.loading) {
            return renderLoadingPanel('感知内心深处...');
        }

        const dashboard = state.data.overview.dashboard || {};
        const enabledContacts = getEnabledContacts();
        const topMemories = Array.isArray(state.data.overview.topMemories) ? state.data.overview.topMemories : [];
        const topMemoriesHtml = topMemories.length > 0
            ? topMemories.map(renderMemoryCard).join('')
            : '<div class="hip-empty">暂时没有强烈的记忆浮现...</div>';

        const totalCount = Math.max(0, Number(dashboard.total_count || 0));
        const resolvedCount = Math.max(0, Number(dashboard.resolved_count || 0));
        const unresolvedCount = Math.max(0, Number(dashboard.unresolved_count || 0));

        let distBuffer = Math.max(0, Number(dashboard.layer_buffer || dashboard.buffer_count || Math.floor(totalCount * 0.35) || 0));
        let distCore = Math.max(0, Number(dashboard.layer_core || dashboard.core_count || Math.floor(totalCount * 0.25) || 0));
        let distCortex = Math.max(0, Number(dashboard.layer_cortex || dashboard.cortex_count || Math.floor(totalCount * 0.2) || 0));
        let distShadow = Math.max(0, Number(dashboard.layer_shadow || dashboard.shadow_count || Math.floor(totalCount * 0.1) || 0));
        let distWish = Math.max(0, Number(dashboard.layer_wish || dashboard.wish_count || (totalCount - distBuffer - distCore - distCortex - distShadow)));
        const distTotal = distBuffer + distCore + distCortex + distShadow + distWish || 1;
        const widthPct = function widthPct(value) {
            return ((Math.max(0, Number(value) || 0) / distTotal) * 100).toFixed(2);
        };

        return `
            <section class="hip-panel-wrapper">
                <div class="hip-toolbar">
                    <select id="hip-admin-char-select" class="hip-select-block">
                        ${renderContactOptions(enabledContacts, state.filters.charId)}
                    </select>
                    <button type="button" class="hip-icon-btn" data-hip-action="refresh-tab" aria-label="刷新总览">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.58m15.36 2A8 8 0 004.58 9m0 0H9m11 11v-5h-.58m0 0a8 8 0 01-15.36-2m15.36 2H15"></path>
                        </svg>
                    </button>
                </div>

                <div class="hip-glass-panel">
                    <div class="hip-stats-row">
                        <div class="hip-neural-globe-container" id="${NEURAL_GLOBE_CONTAINER_ID}"></div>
                        <div>
                            <div class="hip-stat-primary">TA 的记忆之海此刻共有 <strong>${totalCount}</strong> 个碎片</div>
                            <div class="hip-stat-secondary">其中 <strong>${unresolvedCount}</strong> 个挥之不去，<strong>${resolvedCount}</strong> 个已释怀...</div>
                        </div>
                    </div>

                    <div class="hip-distribution-wrapper">
                        <div class="hip-dist-title">记忆潜层级分布</div>
                        <div class="hip-dist-bar">
                            <div class="hip-dist-segment" style="width:${widthPct(distBuffer)}%;background:#5c6c7c;"></div>
                            <div class="hip-dist-segment" style="width:${widthPct(distCore)}%;background:#e2e8f0;"></div>
                            <div class="hip-dist-segment" style="width:${widthPct(distCortex)}%;background:#4ade80;"></div>
                            <div class="hip-dist-segment" style="width:${widthPct(distShadow)}%;background:#475569;"></div>
                            <div class="hip-dist-segment" style="width:${widthPct(distWish)}%;background:#a855f7;"></div>
                        </div>
                        <div class="hip-dist-legend">
                            <div class="hip-legend-item"><span class="hip-legend-dot" style="--hip-dot-color:#5c6c7c;"></span>日常碎片</div>
                            <div class="hip-legend-item"><span class="hip-legend-dot" style="--hip-dot-color:#e2e8f0;"></span>深刻记忆</div>
                            <div class="hip-legend-item"><span class="hip-legend-dot" style="--hip-dot-color:#4ade80;"></span>学到的事</div>
                            <div class="hip-legend-item"><span class="hip-legend-dot" style="--hip-dot-color:#475569;"></span>未愈合的伤</div>
                            <div class="hip-legend-item"><span class="hip-legend-dot" style="--hip-dot-color:#a855f7;"></span>期盼与约定</div>
                        </div>
                    </div>
                </div>

                <h3 class="hip-section-title">最近萦绕在心头的事</h3>
                <div class="hip-card-list">
                    ${topMemoriesHtml}
                </div>
            </section>
        `;
    }

    function buildAuditWrappedMemory(memory) {
        return {
            kind: 'memory',
            id: toTrimmedString(memory && memory.id) || `memory:${Math.random().toString(36).slice(2, 10)}`,
            memory: memory,
            latestTimestamp: getMemorySortTimestamp(memory)
        };
    }

    function getContinuityData() {
        return state.data && state.data.continuity && typeof state.data.continuity === 'object'
            ? state.data.continuity
            : {
                ok: false,
                error: '',
                userId: '',
                charId: '',
                charName: '',
                snapshot: null,
                promptText: ''
            };
    }

    function renderContinuityPanel() {
        if (state.loading) {
            return renderLoadingPanel('正在读取 48h 连续摘要...');
        }
        const continuity = getContinuityData();
        const enabledContacts = getEnabledContacts();
        const snapshot = continuity.snapshot && typeof continuity.snapshot === 'object' ? continuity.snapshot : null;
        const rolling = snapshot && snapshot.rollingWindow && typeof snapshot.rollingWindow === 'object'
            ? snapshot.rollingWindow
            : {};
        const metadata = snapshot && snapshot.metadata && typeof snapshot.metadata === 'object'
            ? snapshot.metadata
            : {};
        const summaryText = toTrimmedString(rolling.summaryText);
        const ongoingThreads = snapshot && Array.isArray(snapshot.ongoingThreads) ? snapshot.ongoingThreads : [];
        const threadsText = JSON.stringify(ongoingThreads, null, 2);
        const promptText = toTrimmedString(continuity.promptText);
        const busy = !!state.continuityBusy;
        const lastError = toTrimmedString(metadata.lastError);
        const lastErrorAt = toTrimmedString(metadata.lastErrorAt);
        const metaParts = [];
        if (snapshot && snapshot.updatedAt && (summaryText || ongoingThreads.length > 0)) metaParts.push(`摘要更新：${formatDateTime(snapshot.updatedAt) || snapshot.updatedAt}`);
        if (rolling.sourceStartAt || rolling.sourceEndAt) {
            metaParts.push(`聊天范围：${formatDateTime(rolling.sourceStartAt) || '未知'} ~ ${formatDateTime(rolling.sourceEndAt) || '未知'}`);
        }
        if (snapshot && Number(snapshot.lastMessageCount || 0) > 0) metaParts.push(`已处理消息：${Math.max(0, Number(snapshot.lastMessageCount || 0))}`);
        if (metadata.sourceMessageCount) metaParts.push(`48h读取：${Math.max(0, Number(metadata.sourceMessageCount || 0))}`);
        if (metadata.apiAttempts || metadata.lastApiAttempts) metaParts.push(`API尝试：${Math.max(0, Number(metadata.apiAttempts || metadata.lastApiAttempts || 0))}`);
        const failureHtml = lastError
            ? `<div class="hip-box-hint" style="margin-top:12px;color:#fecdd3;border-color:rgba(251,113,133,0.28);background:rgba(251,113,133,0.10);">最近生成失败：${escapeHtml(lastError)}${lastErrorAt ? `（${escapeHtml(formatDateTime(lastErrorAt) || lastErrorAt)}）` : ''}</div>`
            : '';
        const emptyHint = !summaryText && ongoingThreads.length <= 0 && !lastError
            ? '<div class="hip-box-hint" style="margin-top:12px;">当前还没有生成 48h 连续摘要。可以点“重新生成”调用主 API。</div>'
            : '';
        return `
            <section class="hip-panel-wrapper">
                <div class="hip-toolbar">
                    <select id="hip-admin-char-select" class="hip-select-block">
                        ${renderContactOptions(enabledContacts, state.filters.charId)}
                    </select>
                    <button type="button" class="hip-icon-btn" data-hip-action="refresh-tab" aria-label="刷新 48h 摘要" ${busy ? 'disabled' : ''}>
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.58m15.36 2A8 8 0 004.58 9m0 0H9m11 11v-5h-.58m0 0a8 8 0 01-15.36-2m15.36 2H15"></path>
                        </svg>
                    </button>
                </div>

                <section class="hip-glass-panel" style="padding:18px 20px;">
                    <div class="hip-box-header">
                        <h3>48h连续摘要</h3>
                        <div class="hip-list-inline-actions">
                            <button type="button" class="hip-btn-outline hip-btn-inline" data-hip-action="retry-continuity" ${busy || !state.filters.charId ? 'disabled' : ''}>${busy ? '生成中...' : '重新生成'}</button>
                        </div>
                    </div>
                    <div class="hip-box-hint">这里展示的是主聊天 prompt 会读取的近两天背景摘要。API 生成失败会留在这里，用户可以直接重试，也可以手动修正文案。</div>
                    ${metaParts.length > 0 ? `<div class="hip-snapshot-meta" style="margin-top:10px;">${escapeHtml(metaParts.join(' · '))}</div>` : ''}
                    ${failureHtml}
                    ${emptyHint}
                    ${continuity.error && !lastError ? `<div class="hip-box-hint" style="margin-top:12px;">读取状态：${escapeHtml(continuity.error)}</div>` : ''}
                </section>

                <form id="hip-admin-continuity-form" class="hip-glass-panel" style="padding:18px 20px;">
                    <label class="hip-dialog-field">
                        <span class="hip-dialog-label">近两天叙事概要</span>
                        <textarea class="hip-dialog-textarea" name="summaryText" rows="14" ${busy ? 'disabled' : ''}>${escapeHtml(summaryText)}</textarea>
                    </label>
                    <label class="hip-dialog-field" style="margin-top:14px;">
                        <span class="hip-dialog-label">长期状态 JSON</span>
                        <textarea class="hip-dialog-textarea" name="ongoingThreads" rows="10" ${busy ? 'disabled' : ''}>${escapeHtml(threadsText)}</textarea>
                    </label>
                    <div class="hip-dialog-actions">
                        <button type="button" class="hip-btn-outline" data-hip-action="refresh-tab" ${busy ? 'disabled' : ''}>刷新</button>
                        <button type="submit" class="hip-btn-primary" ${busy || !state.filters.charId ? 'disabled' : ''}>${busy ? '处理中...' : '保存手动修改'}</button>
                    </div>
                </form>

                <section class="hip-glass-panel" style="padding:18px 20px;">
                    <div class="hip-box-header">
                        <h3>实际注入预览</h3>
                    </div>
                    <div class="hip-box-hint">下面这段是组装后真正靠近主聊天 prompt 的内容。</div>
                    <pre style="margin-top:14px;white-space:pre-wrap;word-break:break-word;max-height:360px;overflow:auto;padding:14px 16px;border-radius:16px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);font-size:13px;line-height:1.75;color:rgba(255,255,255,0.82);">${escapeHtml(promptText || '（当前为空）')}</pre>
                </section>
            </section>
        `;
    }

    function sortAuditMemoryRows(rows) {
        return (Array.isArray(rows) ? rows.slice() : []).sort(function sortAuditRows(left, right) {
            return getMemorySortTimestamp(right) - getMemorySortTimestamp(left);
        });
    }

    function deriveAuditGroundingBuckets(memories) {
        const source = Array.isArray(memories) ? memories.filter(Boolean) : [];
        const missing = [];
        const weak = [];
        const medium = [];

        source.forEach(function bucketGrounding(memory) {
            const snapshot = getMemoryGroundingSupport(memory);
            if (!snapshot || snapshot.available !== true) {
                missing.push(memory);
                return;
            }
            if (snapshot.tier === 'weak') {
                weak.push(memory);
                return;
            }
            if (
                snapshot.tier === 'medium'
                && (
                    snapshot.matchedRows <= 1
                    || (snapshot.phraseCoverage !== null && snapshot.phraseCoverage < 0.35)
                )
            ) {
                medium.push(memory);
            }
        });

        return {
            missing: sortAuditMemoryRows(missing),
            weak: sortAuditMemoryRows(weak),
            medium: sortAuditMemoryRows(medium)
        };
    }

    function deriveAuditReconReviewEntries(memories) {
        const source = Array.isArray(memories) ? memories.filter(Boolean) : [];
        return source.map(function mapReconEntry(memory) {
            const snapshot = getMemoryReconsolidationSnapshot(memory);
            return {
                memory: memory,
                snapshot: snapshot
            };
        }).filter(function keepReconEntry(entry) {
            return !!entry.memory && !!entry.snapshot
                && (entry.snapshot.status === 'rejected' || entry.snapshot.historyCount > 0);
        }).sort(function sortReconEntry(left, right) {
            const rightCheckedAt = Date.parse(toTrimmedString(right && right.snapshot && right.snapshot.checkedAt)) || 0;
            const leftCheckedAt = Date.parse(toTrimmedString(left && left.snapshot && left.snapshot.checkedAt)) || 0;
            if (rightCheckedAt !== leftCheckedAt) return rightCheckedAt - leftCheckedAt;
            const rightHistory = Math.max(0, Number(right && right.snapshot && right.snapshot.historyCount || 0));
            const leftHistory = Math.max(0, Number(left && left.snapshot && left.snapshot.historyCount || 0));
            if (rightHistory !== leftHistory) return rightHistory - leftHistory;
            return getMemorySortTimestamp(right && right.memory) - getMemorySortTimestamp(left && left.memory);
        });
    }

    function deriveAuditEventBuckets(eventItems) {
        const source = Array.isArray(eventItems) ? eventItems.filter(Boolean) : [];
        const grounding = [];
        const history = [];

        source.forEach(function bucketEventItem(eventItem) {
            const members = Array.isArray(eventItem.members) ? eventItem.members : [];
            const overview = deriveEventGroundingOverview(eventItem, members, {
                loadedMemberCount: Math.max(0, Number(eventItem.loadedMemberCount || members.length)),
                totalMemberCount: Math.max(
                    Math.max(0, Number(eventItem.loadedMemberCount || members.length)),
                    Math.max(0, Number(eventItem.memberCount || members.length))
                ),
                partial: Math.max(0, Number(eventItem.loadedMemberCount || members.length))
                    < Math.max(0, Number(eventItem.memberCount || members.length))
            });
            const manualGuardSnapshot = getMemoryEventManualGuardSnapshot(eventItem);
            const versionHistory = Array.isArray(eventItem.event_version_history) ? eventItem.event_version_history : [];
            const entry = {
                eventItem: eventItem,
                overview: overview,
                manualGuardSnapshot: manualGuardSnapshot,
                versionHistoryCount: versionHistory.length
            };

            if (!overview.available || overview.tier === 'weak' || overview.missingSnapshotCount > 0) {
                grounding.push(entry);
            }
            if (eventItem.manualEdited || versionHistory.length > 0 || manualGuardSnapshot.historyCount > 0) {
                history.push(entry);
            }
        });

        grounding.sort(function sortGroundingEntry(left, right) {
            const leftTier = toTrimmedString(left && left.overview && left.overview.tier);
            const rightTier = toTrimmedString(right && right.overview && right.overview.tier);
            const rank = { '': 0, weak: 1, medium: 2, strong: 3 };
            const leftRank = rank[leftTier] !== undefined ? rank[leftTier] : 0;
            const rightRank = rank[rightTier] !== undefined ? rank[rightTier] : 0;
            if (leftRank !== rightRank) return leftRank - rightRank;
            const rightMissing = Math.max(0, Number(right && right.overview && right.overview.missingSnapshotCount || 0));
            const leftMissing = Math.max(0, Number(left && left.overview && left.overview.missingSnapshotCount || 0));
            if (rightMissing !== leftMissing) return rightMissing - leftMissing;
            return Number(right && right.eventItem && right.eventItem.latestTimestamp || 0) - Number(left && left.eventItem && left.eventItem.latestTimestamp || 0);
        });

        history.sort(function sortHistoryEntry(left, right) {
            const rightManual = right && right.eventItem && right.eventItem.manualEdited ? 1 : 0;
            const leftManual = left && left.eventItem && left.eventItem.manualEdited ? 1 : 0;
            if (rightManual !== leftManual) return rightManual - leftManual;
            const rightVersion = Math.max(0, Number(right && right.versionHistoryCount || 0));
            const leftVersion = Math.max(0, Number(left && left.versionHistoryCount || 0));
            if (rightVersion !== leftVersion) return rightVersion - leftVersion;
            const rightGuard = Math.max(0, Number(right && right.manualGuardSnapshot && right.manualGuardSnapshot.historyCount || 0));
            const leftGuard = Math.max(0, Number(left && left.manualGuardSnapshot && left.manualGuardSnapshot.historyCount || 0));
            if (rightGuard !== leftGuard) return rightGuard - leftGuard;
            return Number(right && right.eventItem && right.eventItem.latestTimestamp || 0) - Number(left && left.eventItem && left.eventItem.latestTimestamp || 0);
        });

        return {
            grounding: grounding,
            history: history
        };
    }

    function getReconTimelineTimestamp(value) {
        return Date.parse(toTrimmedString(value)) || 0;
    }

    function getReconGuardEntryTimestamp(entry, fallbackSnapshot) {
        return getReconTimelineTimestamp(
            entry && (
                entry.changed_at
                || entry.created_at
                || entry.checked_at
            )
        ) || getReconTimelineTimestamp(fallbackSnapshot && fallbackSnapshot.checkedAt);
    }

    function getEventVersionEntryTimestamp(entry) {
        return getReconTimelineTimestamp(
            entry && (
                entry.changed_at
                || entry.created_at
                || entry.refreshed_at
            )
        );
    }

    function hasManualReconReasonTag(snapshot) {
        const tags = normalizeTextArray(snapshot && snapshot.reasonTags, 12);
        return tags.includes('manual_trigger');
    }

    function deriveReconReplayBuckets(memories, eventItems) {
        const memorySource = Array.isArray(memories) ? memories.filter(Boolean) : [];
        const eventSource = Array.isArray(eventItems) ? eventItems.filter(Boolean) : [];
        const accepted = [];
        const rejected = [];
        const manual = [];
        const eventRefresh = [];
        const hotspotMap = new Map();

        memorySource.forEach(function bucketReconMemory(memory) {
            const rewriteEntries = buildMemoryRewriteAuditEntries(memory);
            const guardEntries = getMemoryReconGuardHistory(memory);
            const snapshot = getMemoryReconsolidationSnapshot(memory);
            const latestRewrite = rewriteEntries.length > 0 ? rewriteEntries[rewriteEntries.length - 1] : null;
            const latestGuard = guardEntries.length > 0 ? guardEntries[guardEntries.length - 1] : null;
            const latestRewriteTs = getReconTimelineTimestamp(latestRewrite && latestRewrite.changedAt);
            const latestGuardTs = getReconGuardEntryTimestamp(latestGuard, snapshot);
            const latestSnapshotTs = getReconTimelineTimestamp(snapshot && snapshot.checkedAt);
            const latestTs = Math.max(latestRewriteTs, latestGuardTs, latestSnapshotTs);
            const manualTriggered = hasManualReconReasonTag(snapshot);
            const rewriteCount = rewriteEntries.length;
            const guardCount = guardEntries.length + (snapshot && snapshot.status === 'rejected' && guardEntries.length <= 0 ? 1 : 0);
            const hotspotCount = rewriteCount + guardCount;
            const memoryId = toTrimmedString(memory && (memory.memory_id || memory.id));

            if (rewriteEntries.length > 0) {
                accepted.push({
                    memory: memory,
                    snapshot: snapshot,
                    rewriteEntries: rewriteEntries,
                    latestRewrite: latestRewrite,
                    latestTimestamp: latestRewriteTs || latestTs,
                    rewriteCount: rewriteCount,
                    manualTriggered: manualTriggered
                });
            }

            if ((snapshot && snapshot.status === 'rejected') || guardEntries.length > 0) {
                rejected.push({
                    memory: memory,
                    snapshot: snapshot,
                    guardEntries: guardEntries,
                    latestGuard: latestGuard,
                    latestTimestamp: latestGuardTs || latestSnapshotTs || latestTs,
                    guardCount: guardCount,
                    manualTriggered: manualTriggered
                });
            }

            if (manualTriggered) {
                manual.push({
                    memory: memory,
                    snapshot: snapshot,
                    latestTimestamp: latestTs,
                    rewriteCount: rewriteCount,
                    guardCount: guardCount
                });
            }

            if (memoryId && hotspotCount > 1) {
                hotspotMap.set(memoryId, {
                    memory: memory,
                    snapshot: snapshot,
                    totalTouchCount: hotspotCount,
                    rewriteCount: rewriteCount,
                    guardCount: guardCount,
                    latestTimestamp: latestTs
                });
            }
        });

        eventSource.forEach(function bucketReconEvent(eventItem) {
            const reconHistory = getMemoryEventVersionHistory(eventItem).filter(function keepReconEntry(entry) {
                return toTrimmedString(entry && entry.source).toLowerCase() === 'reconsolidation_refresh';
            });
            if (reconHistory.length <= 0) return;
            const latestEntry = reconHistory[reconHistory.length - 1] || null;
            eventRefresh.push({
                eventItem: eventItem,
                reconHistory: reconHistory,
                refreshCount: reconHistory.length,
                latestTimestamp: getEventVersionEntryTimestamp(latestEntry)
            });
        });

        accepted.sort(function sortAccepted(left, right) {
            const rightTs = Math.max(0, Number(right && right.latestTimestamp || 0));
            const leftTs = Math.max(0, Number(left && left.latestTimestamp || 0));
            if (rightTs !== leftTs) return rightTs - leftTs;
            const rightCount = Math.max(0, Number(right && right.rewriteCount || 0));
            const leftCount = Math.max(0, Number(left && left.rewriteCount || 0));
            if (rightCount !== leftCount) return rightCount - leftCount;
            return getMemorySortTimestamp(right && right.memory) - getMemorySortTimestamp(left && left.memory);
        });

        rejected.sort(function sortRejected(left, right) {
            const rightTs = Math.max(0, Number(right && right.latestTimestamp || 0));
            const leftTs = Math.max(0, Number(left && left.latestTimestamp || 0));
            if (rightTs !== leftTs) return rightTs - leftTs;
            const rightCount = Math.max(0, Number(right && right.guardCount || 0));
            const leftCount = Math.max(0, Number(left && left.guardCount || 0));
            if (rightCount !== leftCount) return rightCount - leftCount;
            return getMemorySortTimestamp(right && right.memory) - getMemorySortTimestamp(left && left.memory);
        });

        manual.sort(function sortManual(left, right) {
            const rightTs = Math.max(0, Number(right && right.latestTimestamp || 0));
            const leftTs = Math.max(0, Number(left && left.latestTimestamp || 0));
            if (rightTs !== leftTs) return rightTs - leftTs;
            const rightTouches = Math.max(0, Number(right && right.rewriteCount || 0)) + Math.max(0, Number(right && right.guardCount || 0));
            const leftTouches = Math.max(0, Number(left && left.rewriteCount || 0)) + Math.max(0, Number(left && left.guardCount || 0));
            if (rightTouches !== leftTouches) return rightTouches - leftTouches;
            return getMemorySortTimestamp(right && right.memory) - getMemorySortTimestamp(left && left.memory);
        });

        eventRefresh.sort(function sortEventRefresh(left, right) {
            const rightTs = Math.max(0, Number(right && right.latestTimestamp || 0));
            const leftTs = Math.max(0, Number(left && left.latestTimestamp || 0));
            if (rightTs !== leftTs) return rightTs - leftTs;
            const rightCount = Math.max(0, Number(right && right.refreshCount || 0));
            const leftCount = Math.max(0, Number(left && left.refreshCount || 0));
            if (rightCount !== leftCount) return rightCount - leftCount;
            return Number(right && right.eventItem && right.eventItem.latestTimestamp || 0) - Number(left && left.eventItem && left.eventItem.latestTimestamp || 0);
        });

        const hotspots = Array.from(hotspotMap.values()).sort(function sortHotspots(left, right) {
            const rightTouches = Math.max(0, Number(right && right.totalTouchCount || 0));
            const leftTouches = Math.max(0, Number(left && left.totalTouchCount || 0));
            if (rightTouches !== leftTouches) return rightTouches - leftTouches;
            const rightTs = Math.max(0, Number(right && right.latestTimestamp || 0));
            const leftTs = Math.max(0, Number(left && left.latestTimestamp || 0));
            if (rightTs !== leftTs) return rightTs - leftTs;
            return getMemorySortTimestamp(right && right.memory) - getMemorySortTimestamp(left && left.memory);
        });

        return {
            accepted: accepted,
            rejected: rejected,
            manual: manual,
            eventRefresh: eventRefresh,
            hotspots: hotspots
        };
    }

    function getDehydrateFailureTimestamp(item) {
        return Date.parse(toTrimmedString(item && (item.createdAt || item.created_at || item.updatedAt || item.updated_at))) || 0;
    }

    function sortDehydrateFailuresNewestFirst(items) {
        return (Array.isArray(items) ? items.slice() : []).sort(function sortFailures(left, right) {
            return getDehydrateFailureTimestamp(right) - getDehydrateFailureTimestamp(left);
        });
    }

    function getDigestOutcomeTimestamp(item) {
        return Date.parse(toTrimmedString(item && (item.windowEnd || item.updatedAt || item.createdAt || item.window_end || item.updated_at || item.created_at))) || 0;
    }

    function sortDigestOutcomesNewestFirst(items) {
        return (Array.isArray(items) ? items.slice() : []).sort(function sortDigestRows(left, right) {
            return getDigestOutcomeTimestamp(right) - getDigestOutcomeTimestamp(left);
        });
    }

    function buildDehydrateFailureAuditRow(item) {
        const errorText = toTrimmedString(item && (item.errorMessage || item.error_message)) || '未知错误';
        return {
            title: toTrimmedString(item && (item.charLabel || item.charId)) || '后台脱水任务',
            meta: [
                formatDateTime(item && (item.createdAt || item.created_at || item.updatedAt || item.updated_at)),
                `重试 ${Math.max(0, Math.floor(toFiniteNumber(item && (item.retryCount || item.retry_count), 0)))} 次`
            ],
            body: summarizeContent(errorText, 120)
        };
    }

    function buildDigestOutcomeAuditRow(item) {
        return {
            title: toTrimmedString(item && item.digestSummary) || '暂无变化摘要',
            meta: [
                formatDateTime(item && (item.windowEnd || item.updatedAt || item.createdAt || item.window_end || item.updated_at || item.created_at)),
                Number(item && item.sourceMessageCount || 0) > 0
                    ? `消息 ${Math.max(0, Number(item && item.sourceMessageCount || 0))} 条`
                    : '',
                toTrimmedString(item && item.attachmentAfter)
                    ? `依恋 ${formatAttachmentStyleLabel(item.attachmentAfter)}`
                    : ''
            ].filter(Boolean),
            body: summarizeContent(
                toTrimmedString(item && (item.selfInsightAfter || item.eventChanges || item.fragmentChanges))
                || '这轮整理还没有留下更细的变化说明。',
                120
            )
        };
    }

    function normalizeDigestStabilityReasonTags(value) {
        const rawList = Array.isArray(value)
            ? value
            : (typeof value === 'string' && value.trim() ? value.split(/[,\s]+/) : []);
        const result = [];
        const seen = new Set();
        for (let i = 0; i < rawList.length; i += 1) {
            const tag = toTrimmedString(rawList[i]).toLowerCase();
            if (!tag || seen.has(tag)) continue;
            seen.add(tag);
            result.push(tag);
            if (result.length >= 12) break;
        }
        return result;
    }

    function computeDigestStabilitySourceSpanHours(startAt, endAt) {
        const start = Date.parse(toTrimmedString(startAt) || '');
        const end = Date.parse(toTrimmedString(endAt) || '');
        if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
        return Math.max(0, Math.abs(end - start) / (60 * 60 * 1000));
    }

    function normalizeDigestStabilityTier(value) {
        const safeValue = toTrimmedString(value).toLowerCase();
        if (safeValue === 'high_risk' || safeValue === 'attention' || safeValue === 'stable') {
            return safeValue;
        }
        return '';
    }

    function getDigestStabilityTierRank(tier) {
        const safeTier = normalizeDigestStabilityTier(tier);
        if (safeTier === 'high_risk') return 3;
        if (safeTier === 'attention') return 2;
        if (safeTier === 'stable') return 1;
        return 0;
    }

    function deriveDigestStabilityTierFromRiskScore(riskScore) {
        const safeRisk = Math.max(0, Number(riskScore || 0));
        if (safeRisk >= 6) return 'high_risk';
        if (safeRisk >= 3) return 'attention';
        return 'stable';
    }

    function pickStrongerDigestStabilityTier(leftTier, rightTier) {
        return getDigestStabilityTierRank(rightTier) > getDigestStabilityTierRank(leftTier)
            ? normalizeDigestStabilityTier(rightTier)
            : normalizeDigestStabilityTier(leftTier);
    }

    function getDigestStabilityTierLabel(tier) {
        const value = normalizeDigestStabilityTier(tier);
        if (value === 'high_risk') return '高风险';
        if (value === 'attention') return '需留意';
        return '基本稳定';
    }

    function getDigestStabilityTierHint(tier) {
        const value = normalizeDigestStabilityTier(tier);
        if (value === 'high_risk') return '这条事件现在很容易被重新整理写歪，最好优先复看。';
        if (value === 'attention') return '这条事件还算能用，但证据偏薄，后面可能越写越飘。';
        return '这条事件的锚点和证据目前还算稳，短期内不太容易被写歪。';
    }

    function formatDigestStabilitySpanLabel(spanHours) {
        const hours = Math.max(0, Number(spanHours || 0));
        if (!(hours > 0)) return '';
        if (hours >= 48) return `证据跨度 ${Number((hours / 24).toFixed(1))} 天`;
        if (hours >= 1) return `证据跨度 ${Number(hours.toFixed(1))} 小时`;
        return `证据跨度 ${Math.max(1, Math.round(hours * 60))} 分钟`;
    }

    function getEventDigestStabilitySnapshot(eventItem) {
        const safeEvent = eventItem && typeof eventItem === 'object' ? eventItem : {};
        const metadata = safeEvent.metadata && typeof safeEvent.metadata === 'object'
            ? safeEvent.metadata
            : {};
        const terms = normalizeTextArray(
            safeEvent.event_stability_terms !== undefined
                ? safeEvent.event_stability_terms
                : (metadata.event_stability_terms !== undefined ? metadata.event_stability_terms : metadata.eventStabilityTerms),
            12
        );
        const sourceMessageIds = normalizeIdList(
            safeEvent.event_stability_source_message_ids !== undefined
                ? safeEvent.event_stability_source_message_ids
                : (
                    metadata.event_stability_source_message_ids !== undefined
                        ? metadata.event_stability_source_message_ids
                        : metadata.eventStabilitySourceMessageIds
                ),
            24
        );
        const manualGuardSnapshot = getMemoryEventManualGuardSnapshot(safeEvent);
        const versionHistoryCount = getMemoryEventVersionHistory(safeEvent).length;
        const signature = toTrimmedString(
            safeEvent.event_stability_signature
            || metadata.event_stability_signature
            || metadata.eventStabilitySignature
        );
        const primaryTerm = toTrimmedString(
            safeEvent.event_stability_primary_term
            || metadata.event_stability_primary_term
            || metadata.eventStabilityPrimaryTerm
            || metadata.event_stability_primary_alias
            || metadata.eventStabilityPrimaryAlias
        );
        const sourceTimeStart = toTrimmedString(
            safeEvent.event_stability_time_start
            || metadata.event_stability_time_start
            || metadata.eventStabilityTimeStart
        );
        const sourceTimeEnd = toTrimmedString(
            safeEvent.event_stability_time_end
            || metadata.event_stability_time_end
            || metadata.eventStabilityTimeEnd
        );
        const storedReasonTags = normalizeDigestStabilityReasonTags(
            safeEvent.event_stability_reason_tags !== undefined
                ? safeEvent.event_stability_reason_tags
                : (
                    metadata.event_stability_reason_tags !== undefined
                        ? metadata.event_stability_reason_tags
                        : metadata.eventStabilityReasonTags
                )
        );
        const storedRiskScore = Math.max(
            0,
            toFiniteNumber(
                safeEvent.event_stability_risk_score !== undefined
                    ? safeEvent.event_stability_risk_score
                    : (
                        metadata.event_stability_risk_score !== undefined
                            ? metadata.event_stability_risk_score
                            : metadata.eventStabilityRiskScore
                    ),
                0
            )
        );
        const storedTier = normalizeDigestStabilityTier(
            safeEvent.event_stability_tier
            || metadata.event_stability_tier
            || metadata.eventStabilityTier
        );
        return {
            signature: signature,
            primaryTerm: primaryTerm,
            terms: terms,
            aliasCount: terms.length,
            sourceMessageIds: sourceMessageIds,
            sourceMessageCount: sourceMessageIds.length,
            sourceTimeStart: sourceTimeStart,
            sourceTimeEnd: sourceTimeEnd,
            sourceSpanHours: computeDigestStabilitySourceSpanHours(sourceTimeStart, sourceTimeEnd),
            manualGuardSnapshot: manualGuardSnapshot,
            versionHistoryCount: versionHistoryCount,
            digestRetired: toBoolean(
                safeEvent.digest_retired !== undefined
                    ? safeEvent.digest_retired
                    : (metadata.digest_retired !== undefined ? metadata.digest_retired : metadata.digestRetired)
            ),
            digestRetiredAt: toTrimmedString(
                safeEvent.digest_retired_at
                || metadata.digest_retired_at
                || metadata.digestRetiredAt
            ),
            tier: storedTier || deriveDigestStabilityTierFromRiskScore(storedRiskScore),
            reasonTags: storedReasonTags,
            riskScore: storedRiskScore
        };
    }

    function getDigestStabilityReasonLabel(reason) {
        const value = toTrimmedString(reason).toLowerCase();
        if (value === 'missing_signature') return '缺少稳定锚点';
        if (value === 'missing_primary_term') return '缺少主关键词';
        if (value === 'missing_source_messages') return '没有原消息支撑';
        if (value === 'single_source_message') return '只有 1 条原消息支撑';
        if (value === 'thin_alias_coverage') return '可复用的锚点词太少';
        if (value === 'member_overflow_with_thin_evidence') return '成员很多，但底层证据太薄';
        if (value === 'wide_time_span_with_thin_evidence') return '时间跨度很大，但证据太薄';
        if (value === 'manual_guard_hotspot') return '最近多次被人工保护拦下';
        if (value === 'version_churn_hotspot') return '最近改写次数偏多';
        if (value === 'retired_flag') return '这条事件已经退役';
        return value;
    }

    function deriveDigestStabilityWatchlist(eventItems) {
        return (Array.isArray(eventItems) ? eventItems : []).filter(Boolean).map(function mapEvent(eventItem) {
            const snapshot = getEventDigestStabilitySnapshot(eventItem);
            const reasons = Array.isArray(snapshot.reasonTags) ? snapshot.reasonTags.slice() : [];
            let riskScore = Math.max(0, Number(snapshot.riskScore || 0));

            function appendReason(reason, score) {
                const safeReason = toTrimmedString(reason).toLowerCase();
                if (!safeReason) return;
                if (!reasons.includes(safeReason)) {
                    reasons.push(safeReason);
                    riskScore += Math.max(0, Number(score || 0));
                }
            }

            appendReason(!snapshot.signature ? 'missing_signature' : '', 3);
            appendReason(!snapshot.primaryTerm ? 'missing_primary_term' : '', 2);
            if (snapshot.sourceMessageCount <= 0) {
                appendReason('missing_source_messages', 3);
            } else if (snapshot.sourceMessageCount === 1) {
                appendReason('single_source_message', 2);
            }
            if (snapshot.aliasCount <= 0) {
                appendReason('thin_alias_coverage', 2);
            } else if (snapshot.aliasCount === 1 && snapshot.sourceMessageCount <= 1) {
                appendReason('thin_alias_coverage', 1);
            }
            if (Math.max(0, Number(eventItem && eventItem.memberCount || 0)) >= DIAGNOSTIC_LARGE_EVENT_THRESHOLD && snapshot.sourceMessageCount <= 1) {
                appendReason('member_overflow_with_thin_evidence', 2);
            }
            if (Math.max(0, Number(snapshot.sourceSpanHours || 0)) >= 72 && snapshot.sourceMessageCount <= 1) {
                appendReason('wide_time_span_with_thin_evidence', 1);
            }
            if (Math.max(0, Number(snapshot.manualGuardSnapshot && snapshot.manualGuardSnapshot.historyCount || 0)) >= 2) {
                appendReason('manual_guard_hotspot', 1);
            }
            if (Math.max(0, Number(snapshot.versionHistoryCount || 0)) >= 4) {
                appendReason('version_churn_hotspot', 1);
            }
            if (snapshot.digestRetired) {
                appendReason('retired_flag', 1);
            }

            return {
                eventItem: eventItem,
                snapshot: snapshot,
                reasons: reasons,
                riskScore: Math.max(0, Number(riskScore.toFixed(1))),
                tier: pickStrongerDigestStabilityTier(
                    snapshot.tier,
                    deriveDigestStabilityTierFromRiskScore(riskScore)
                )
            };
        }).filter(function keepEntry(entry) {
            return Math.max(0, Number(entry && entry.riskScore || 0)) > 0;
        }).sort(function sortEntry(left, right) {
            const rightRisk = Math.max(0, Number(right && right.riskScore || 0));
            const leftRisk = Math.max(0, Number(left && left.riskScore || 0));
            if (rightRisk !== leftRisk) return rightRisk - leftRisk;
            const rightTs = Math.max(0, Number(right && right.eventItem && right.eventItem.latestTimestamp || 0));
            const leftTs = Math.max(0, Number(left && left.eventItem && left.eventItem.latestTimestamp || 0));
            return rightTs - leftTs;
        });
    }

    function buildDigestStabilityAuditRow(entry) {
        const eventItem = entry && entry.eventItem ? entry.eventItem : {};
        const snapshot = entry && entry.snapshot ? entry.snapshot : getEventDigestStabilitySnapshot(eventItem);
        const tier = toTrimmedString(entry && entry.tier) || snapshot.tier || 'stable';
        const meta = [
            getDigestStabilityTierLabel(tier),
            `风险 ${Math.max(0, Number(entry && entry.riskScore || snapshot.riskScore || 0))}`,
            snapshot.primaryTerm ? `主词 ${snapshot.primaryTerm}` : '',
            snapshot.sourceMessageCount > 0 ? `来源消息 ${snapshot.sourceMessageCount}` : '来源消息 0',
            snapshot.aliasCount > 0 ? `锚点词 ${snapshot.aliasCount}` : '',
            formatDigestStabilitySpanLabel(snapshot.sourceSpanHours),
            snapshot.manualGuardSnapshot && snapshot.manualGuardSnapshot.historyCount > 0
                ? `人工保护 ${Math.max(0, Number(snapshot.manualGuardSnapshot.historyCount || 0))} 次`
                : '',
            snapshot.versionHistoryCount > 0 ? `改写留痕 ${snapshot.versionHistoryCount}` : ''
        ].filter(Boolean);
        const body = entry && Array.isArray(entry.reasons) && entry.reasons.length > 0
            ? entry.reasons.map(getDigestStabilityReasonLabel).join(' / ')
            : getDigestStabilityTierHint(tier);
        return {
            title: toTrimmedString(eventItem && eventItem.title) || '未命名事件',
            meta: meta,
            body: body
        };
    }

    function renderEventDigestStabilityPanel(eventItem) {
        const snapshot = getEventDigestStabilitySnapshot(eventItem);
        const entry = deriveDigestStabilityWatchlist([eventItem])[0] || {
            eventItem: eventItem,
            snapshot: snapshot,
            reasons: Array.isArray(snapshot.reasonTags) ? snapshot.reasonTags.slice() : [],
            riskScore: Math.max(0, Number(snapshot.riskScore || 0)),
            tier: snapshot.tier || 'stable'
        };
        const tier = toTrimmedString(entry.tier) || 'stable';
        const riskReasons = Array.isArray(entry.reasons) ? entry.reasons : [];
        const badges = [
            renderUniqueHipTags(
                [
                    getDigestStabilityTierLabel(tier),
                    snapshot.primaryTerm ? `主词 ${snapshot.primaryTerm}` : '缺主词',
                    snapshot.sourceMessageCount > 0 ? `来源消息 ${snapshot.sourceMessageCount}` : '来源消息 0',
                    snapshot.aliasCount > 0 ? `锚点词 ${snapshot.aliasCount}` : '锚点词 0',
                    formatDigestStabilitySpanLabel(snapshot.sourceSpanHours),
                    snapshot.versionHistoryCount > 0 ? `改写留痕 ${snapshot.versionHistoryCount}` : ''
                ].concat(
                    snapshot.manualGuardSnapshot && snapshot.manualGuardSnapshot.historyCount > 0
                        ? [`人工保护 ${Math.max(0, Number(snapshot.manualGuardSnapshot.historyCount || 0))} 次`]
                        : []
                ).filter(Boolean),
                10
            )
        ];
        const metaLines = [
            `当前判断：${getDigestStabilityTierHint(tier)}`
        ];
        if (snapshot.signature) {
            metaLines.push(`稳定签名：${snapshot.signature}`);
        }
        if (snapshot.sourceTimeStart || snapshot.sourceTimeEnd) {
            metaLines.push(`证据时间：${formatDateTime(snapshot.sourceTimeStart) || '未知'} ~ ${formatDateTime(snapshot.sourceTimeEnd) || '未知'}`);
        }
        if (snapshot.manualGuardSnapshot && snapshot.manualGuardSnapshot.hasBlocked) {
            metaLines.push(`最近一次人工保护挡下：${snapshot.manualGuardSnapshot.blockedFields.map(formatManualGuardFieldLabel).join(', ')}`);
        }
        if (snapshot.digestRetired) {
            metaLines.push(`这条事件已经退役${snapshot.digestRetiredAt ? `（${formatDateTime(snapshot.digestRetiredAt)}）` : ''}`);
        }
        return `
            <div class="hip-audit-panel" style="margin-top:14px;">
                <div class="hip-audit-head">
                    <div class="hip-audit-title">这条事件稳不稳</div>
                    <span class="hip-grounding-pill">${escapeHtml(getDigestStabilityTierLabel(tier))}</span>
                </div>
                ${badges.join('')}
                <div class="hip-audit-summary" style="margin-top:10px;">${escapeHtml(metaLines.join('  '))}</div>
                ${riskReasons.length > 0 ? `<div class="hip-audit-summary" style="margin-top:8px;">${escapeHtml(`主要原因：${riskReasons.map(getDigestStabilityReasonLabel).join(' / ')}`)}</div>` : ''}
            </div>
        `;
    }

    function renderDigestStabilityDiagnosticsSection(buckets) {
        const safeBuckets = buckets && typeof buckets === 'object' ? buckets : {};
        const entries = Array.isArray(safeBuckets.digestStability) ? safeBuckets.digestStability : [];
        return `
            <div class="hip-glass-panel hip-audit-section-card">
                <div class="hip-box-header">
                    <h3>容易被重写跑偏的事件</h3>
                </div>
                <div class="hip-box-hint">这里优先看那些“锚点太少、原消息太薄、人工保护反复触发、改写边界老在抖”的事件。它们最容易在后续重新整理时越写越偏。</div>
                <div class="hip-list-inline-actions">
                    ${renderListFocusActionButton('diagnostics', 'digest_stability', '查看完整样本', entries.length)}
                </div>
                ${renderAuditCompactRows(
                    entries.slice(0, 6).map(function mapDigestStability(entry) {
                        return buildDigestStabilityAuditRow(entry);
                    }),
                    '最近样本里没有明显容易被重写跑偏的事件。'
                )}
            </div>
        `;
    }

    function deriveEventLifecycleBuckets(eventItems) {
        const source = Array.isArray(eventItems) ? eventItems.filter(Boolean) : [];
        const retiredEvents = source.filter(function keepRetired(item) {
            return getEventLifecycleSnapshot(item).retired;
        }).sort(function sortRetired(left, right) {
            const rightSnapshot = getEventLifecycleSnapshot(right);
            const leftSnapshot = getEventLifecycleSnapshot(left);
            const rightRetiredAt = Date.parse(toTrimmedString(rightSnapshot.retiredAt)) || 0;
            const leftRetiredAt = Date.parse(toTrimmedString(leftSnapshot.retiredAt)) || 0;
            if (rightRetiredAt !== leftRetiredAt) return rightRetiredAt - leftRetiredAt;
            return Number(right && right.latestTimestamp || 0) - Number(left && left.latestTimestamp || 0);
        });
        const lifecycleChurn = source.map(function mapLifecycleEntry(item) {
            const snapshot = getEventLifecycleSnapshot(item);
            const churnScore = (snapshot.versionHistoryCount * 2)
                + (snapshot.manualGuardCount * 2)
                + (snapshot.retired ? 2 : 0);
            return {
                eventItem: item,
                snapshot: snapshot,
                churnScore: churnScore
            };
        }).filter(function keepLifecycleEntry(entry) {
            return Math.max(0, Number(entry && entry.churnScore || 0)) >= 4;
        }).sort(function sortLifecycleEntry(left, right) {
            const rightScore = Math.max(0, Number(right && right.churnScore || 0));
            const leftScore = Math.max(0, Number(left && left.churnScore || 0));
            if (rightScore !== leftScore) return rightScore - leftScore;
            return Number(right && right.eventItem && right.eventItem.latestTimestamp || 0)
                - Number(left && left.eventItem && left.eventItem.latestTimestamp || 0);
        });
        return {
            retiredEvents: retiredEvents,
            lifecycleChurn: lifecycleChurn
        };
    }

    function deriveDiagnosticBuckets(memories, eventItems, failures, digestOutcomes, lifecycleEventItems) {
        const safeEventItems = Array.isArray(eventItems) ? eventItems.filter(Boolean) : [];
        const safeLifecycleItems = Array.isArray(lifecycleEventItems) && lifecycleEventItems.length > 0
            ? lifecycleEventItems.filter(Boolean)
            : safeEventItems;
        const replayBuckets = deriveReconReplayBuckets(memories, safeEventItems);
        const eventAuditBuckets = deriveAuditEventBuckets(safeEventItems);
        const lifecycleBuckets = deriveEventLifecycleBuckets(safeLifecycleItems);
        const digestStability = deriveDigestStabilityWatchlist(safeEventItems);
        const largeEvents = safeEventItems.filter(function keepLargeEvent(eventItem) {
            return Math.max(0, Number(eventItem && eventItem.memberCount || 0)) >= DIAGNOSTIC_LARGE_EVENT_THRESHOLD;
        }).sort(function sortLargeEvents(left, right) {
            const rightCount = Math.max(0, Number(right && right.memberCount || 0));
            const leftCount = Math.max(0, Number(left && left.memberCount || 0));
            if (rightCount !== leftCount) return rightCount - leftCount;
            return Number(right && right.latestTimestamp || 0) - Number(left && left.latestTimestamp || 0);
        });
        const crowdedUnresolved = safeEventItems.filter(function keepCrowdedUnresolved(eventItem) {
            return Math.max(0, Number(eventItem && eventItem.unresolvedCount || 0)) > 0
                && Math.max(0, Number(eventItem && eventItem.memberCount || 0)) >= DIAGNOSTIC_CROWDED_UNRESOLVED_THRESHOLD;
        }).sort(function sortCrowdedUnresolved(left, right) {
            const rightUnresolved = Math.max(0, Number(right && right.unresolvedCount || 0));
            const leftUnresolved = Math.max(0, Number(left && left.unresolvedCount || 0));
            if (rightUnresolved !== leftUnresolved) return rightUnresolved - leftUnresolved;
            const rightCount = Math.max(0, Number(right && right.memberCount || 0));
            const leftCount = Math.max(0, Number(left && left.memberCount || 0));
            if (rightCount !== leftCount) return rightCount - leftCount;
            return Number(right && right.latestTimestamp || 0) - Number(left && left.latestTimestamp || 0);
        });
        const digestOutliers = sortDigestOutcomesNewestFirst(digestOutcomes).filter(function keepDigestOutlier(item) {
            const assigned = Math.max(0, Number(item && (item.assignedFragmentCount || item.assigned_fragment_count) || 0));
            const eventized = Math.max(0, Number(item && (item.eventizedCount || item.eventized_count) || 0));
            const orphan = Math.max(0, Number(item && (item.orphanFragmentCount || item.orphan_fragment_count) || 0));
            return assigned >= DIAGNOSTIC_DIGEST_ASSIGNED_THRESHOLD
                || eventized >= DIAGNOSTIC_DIGEST_EVENTIZED_THRESHOLD
                || orphan >= DIAGNOSTIC_DIGEST_ORPHAN_THRESHOLD;
        });

        return {
            largeEvents: largeEvents,
            crowdedUnresolved: crowdedUnresolved,
            groundingEvents: eventAuditBuckets.grounding,
            reconHotspots: replayBuckets.hotspots,
            retiredEvents: lifecycleBuckets.retiredEvents,
            lifecycleChurn: lifecycleBuckets.lifecycleChurn,
            digestStability: digestStability,
            failures: sortDehydrateFailuresNewestFirst(failures),
            digestOutliers: digestOutliers
        };
    }

    function getAdminTabLabel(tab) {
        const safeTab = normalizeTab(tab);
        if (safeTab === 'recon') return '改写记录';
        if (safeTab === 'audit') return '线索排查';
        if (safeTab === 'diagnostics') return '风险总览';
        if (safeTab === 'list') return '所有记忆';
        if (safeTab === 'continuity') return '48h摘要';
        if (safeTab === 'notebook') return '记事本';
        if (safeTab === 'export' || safeTab === 'snapshot') return '记忆保管箱';
        return '此刻';
    }

    function getActiveListFocus() {
        const focus = state.listFocus && typeof state.listFocus === 'object'
            ? state.listFocus
            : null;
        if (!focus || !Array.isArray(focus.displayItems) || focus.displayItems.length <= 0) {
            return null;
        }
        return focus;
    }

    function dedupeListFocusDisplayItems(items) {
        const seen = new Set();
        return (Array.isArray(items) ? items : []).filter(function keepItem(item) {
            const itemId = toTrimmedString(item && item.id);
            if (!itemId || seen.has(itemId)) return false;
            seen.add(itemId);
            return true;
        });
    }

    function buildListFocusPayload(sourceTab, focusKey, title, hint, displayItems) {
        const normalizedItems = dedupeListFocusDisplayItems(displayItems);
        const firstItem = normalizedItems[0] || null;
        const firstMemory = firstItem && firstItem.kind === 'event'
            ? null
            : (firstItem && firstItem.memory ? firstItem.memory : firstItem);
        return {
            sourceTab: normalizeTab(sourceTab),
            focusKey: toTrimmedString(focusKey),
            title: toTrimmedString(title) || '聚焦样本',
            hint: toTrimmedString(hint),
            displayItems: normalizedItems,
            preferredMemoryId: toTrimmedString(firstMemory && firstMemory.id),
            preferredEventId: toTrimmedString(firstItem && firstItem.kind === 'event' ? firstItem.eventId : ''),
            count: normalizedItems.length
        };
    }

    function buildListFocusFromMemories(sourceTab, focusKey, title, hint, memories) {
        return buildListFocusPayload(
            sourceTab,
            focusKey,
            title,
            hint,
            sortAuditMemoryRows(memories).map(buildAuditWrappedMemory)
        );
    }

    function buildListFocusFromEvents(sourceTab, focusKey, title, hint, eventItems) {
        const sorted = (Array.isArray(eventItems) ? eventItems.slice() : []).sort(function sortFocusEvents(left, right) {
            return Number(right && right.latestTimestamp || 0) - Number(left && left.latestTimestamp || 0);
        });
        return buildListFocusPayload(sourceTab, focusKey, title, hint, sorted);
    }

    function buildReconListFocusPayload(focusKey) {
        const recon = state.data && state.data.recon && typeof state.data.recon === 'object'
            ? state.data.recon
            : {};
        const memories = Array.isArray(recon.memories) ? recon.memories : [];
        const eventRecordsById = recon.eventRecordsById && typeof recon.eventRecordsById === 'object'
            ? recon.eventRecordsById
            : {};
        const eventItems = buildListDisplayItems(memories, {
            recordType: 'event',
            eventRecordsById: eventRecordsById
        });
        const replayBuckets = deriveReconReplayBuckets(memories, eventItems);
        if (focusKey === 'accepted') {
            return buildListFocusFromMemories('recon', focusKey, '已改写样本', '来源：改写记录页里最近成功回写的记忆碎片。', replayBuckets.accepted.map(function mapEntry(entry) {
                return entry.memory;
            }));
        }
        if (focusKey === 'rejected') {
            return buildListFocusFromMemories('recon', focusKey, '被拦下的样本', '来源：改写记录页里最近被护栏拒绝的对象。', replayBuckets.rejected.map(function mapEntry(entry) {
                return entry.memory;
            }));
        }
        if (focusKey === 'manual') {
            return buildListFocusFromMemories('recon', focusKey, '手动处理记录', '来源：改写记录页里仍保留“你手动点过”痕迹的条目。', replayBuckets.manual.map(function mapEntry(entry) {
                return entry.memory;
            }));
        }
        if (focusKey === 'hotspots') {
            return buildListFocusFromMemories('recon', focusKey, '反复变动热点', '来源：改写记录页里多次被回写或拦下的热点条目。', replayBuckets.hotspots.map(function mapEntry(entry) {
                return entry.memory;
            }));
        }
        if (focusKey === 'event_refresh') {
            return buildListFocusFromEvents('recon', focusKey, '事件顺带刷新样本', '来源：改写后顺带触发事件摘要刷新的事件。', replayBuckets.eventRefresh.map(function mapEntry(entry) {
                return entry.eventItem;
            }));
        }
        return null;
    }

    function buildAuditListFocusPayload(focusKey) {
        const audit = state.data && state.data.audit && typeof state.data.audit === 'object'
            ? state.data.audit
            : {};
        const memories = Array.isArray(audit.memories) ? audit.memories : [];
        const eventRecordsById = audit.eventRecordsById && typeof audit.eventRecordsById === 'object'
            ? audit.eventRecordsById
            : {};
        const eventItems = buildListDisplayItems(memories, {
            recordType: 'event',
            eventRecordsById: eventRecordsById
        });
        const groundingBuckets = deriveAuditGroundingBuckets(memories);
        const reconEntries = deriveAuditReconReviewEntries(memories);
        const eventBuckets = deriveAuditEventBuckets(eventItems);
        if (focusKey === 'grounding_weak') {
            return buildListFocusFromMemories('audit', focusKey, '原话支撑偏弱', '来源：线索排查页里原话支撑偏弱的碎片。', groundingBuckets.weak);
        }
        if (focusKey === 'grounding_missing') {
            return buildListFocusFromMemories('audit', focusKey, '缺少原话支撑快照', '来源：线索排查页里还没有原话支撑快照的碎片。', groundingBuckets.missing);
        }
        if (focusKey === 'recon_review') {
            return buildListFocusFromMemories('audit', focusKey, '护栏拦下待复看', '来源：线索排查页里被改写护栏拦下、需要人工复看的碎片。', reconEntries.map(function mapEntry(entry) {
                return entry.memory;
            }));
        }
        if (focusKey === 'event_grounding') {
            return buildListFocusFromEvents('audit', focusKey, '原话支撑偏弱事件', '来源：线索排查页里需要补看的事件。', eventBuckets.grounding.map(function mapEntry(entry) {
                return entry.eventItem;
            }));
        }
        if (focusKey === 'event_history') {
            return buildListFocusFromEvents('audit', focusKey, '人工改过的事件', '来源：线索排查页里被人工编辑、成员变更或人工保护过的事件。', eventBuckets.history.map(function mapEntry(entry) {
                return entry.eventItem;
            }));
        }
        return null;
    }

    function buildDiagnosticsListFocusPayload(focusKey) {
        const diagnostics = state.data && state.data.diagnostics && typeof state.data.diagnostics === 'object'
            ? state.data.diagnostics
            : {};
        const memories = Array.isArray(diagnostics.memories) ? diagnostics.memories : [];
        const directEventItems = buildDirectEventDisplayItems(diagnostics.eventRecords);
        const eventRecordsById = diagnostics.eventRecordsById && typeof diagnostics.eventRecordsById === 'object'
            ? diagnostics.eventRecordsById
            : {};
        const eventItems = buildListDisplayItems(memories, {
            recordType: 'event',
            eventRecordsById: eventRecordsById
        });
        const buckets = deriveDiagnosticBuckets(
            memories,
            eventItems,
            diagnostics.dehydrateFailures,
            diagnostics.digestOutcomes,
            directEventItems
        );
        if (focusKey === 'large_events') {
            return buildListFocusFromEvents('diagnostics', focusKey, '成员过多的事件', '来源：风险总览页里成员数偏大的事件。', buckets.largeEvents);
        }
        if (focusKey === 'crowded_unresolved') {
            return buildListFocusFromEvents('diagnostics', focusKey, '未了结且成员太多', '来源：风险总览页里未了结且成员偏多的事件。', buckets.crowdedUnresolved);
        }
        if (focusKey === 'grounding_events') {
            return buildListFocusFromEvents('diagnostics', focusKey, '原话支撑风险事件', '来源：风险总览页里原话支撑偏弱的事件。', buckets.groundingEvents.map(function mapEntry(entry) {
                return entry.eventItem;
            }));
        }
        if (focusKey === 'recon_hotspots') {
            return buildListFocusFromMemories('diagnostics', focusKey, '反复变动热点', '来源：风险总览页里被改写反复触碰的热点条目。', buckets.reconHotspots.map(function mapEntry(entry) {
                return entry.memory;
            }));
        }
        if (focusKey === 'retired_events') {
            return buildListFocusFromEvents('diagnostics', focusKey, '退役事件样本', '来源：异常页里已经退役、用于追踪事件生命周期的历史事件。', buckets.retiredEvents);
        }
        if (focusKey === 'lifecycle_churn') {
            return buildListFocusFromEvents('diagnostics', focusKey, '反复变动的事件', '来源：风险总览页里留痕、guard 或退役变化较多的事件。', buckets.lifecycleChurn.map(function mapEntry(entry) {
                return entry.eventItem;
            }));
        }
        if (focusKey === 'digest_stability') {
            return buildListFocusFromEvents('diagnostics', focusKey, '容易改写跑偏的事件', '来源：风险总览页里锚点太少、原消息太薄，或人工保护 / 改写留痕过多的事件。', buckets.digestStability.map(function mapEntry(entry) {
                return entry.eventItem;
            }));
        }
        return null;
    }

    function applyListFocusPayload(payload) {
        const focus = payload && typeof payload === 'object' ? payload : null;
        if (!focus || !Array.isArray(focus.displayItems) || focus.displayItems.length <= 0) {
            showToastSafe('当前样本里没有可聚焦的条目。', 'info');
            return;
        }
        state.activeTab = 'list';
        state.listFocus = focus;
        state.notice = '';
        state.adminDialog = null;
        state.expandedDigestOutcomeId = '';
        state.loadingEventMembersEventId = '';
        state.eventMembersCache = {};
        state.expandedMemoryId = focus.preferredMemoryId || '';
        state.expandedEventId = focus.preferredEventId || '';
        state.expandedEventMembersEventId = focus.preferredEventId || '';
        state.expandedEventMemberMemoryId = '';
        renderLayout();
    }

    function handleOpenListFocus(sourceTab, focusKey) {
        let payload = null;
        const safeSourceTab = normalizeTab(sourceTab);
        if (safeSourceTab === 'recon') {
            payload = buildReconListFocusPayload(focusKey);
        } else if (safeSourceTab === 'audit') {
            payload = buildAuditListFocusPayload(focusKey);
        } else if (safeSourceTab === 'diagnostics') {
            payload = buildDiagnosticsListFocusPayload(focusKey);
        }
        applyListFocusPayload(payload);
    }

    function renderListFocusActionButton(sourceTab, focusKey, label, count) {
        const disabled = Math.max(0, Number(count || 0)) <= 0;
        const text = '查看完整样本';
        return `<button type="button" class="hip-btn-outline hip-btn-inline" data-hip-action="open-list-focus" data-source-tab="${escapeAttribute(sourceTab)}" data-focus-key="${escapeAttribute(focusKey)}" ${disabled ? 'disabled' : ''}>${escapeHtml(text)}</button>`;
    }

    function renderListFocusBanner() {
        const focus = getActiveListFocus();
        if (!focus) return '';
        const sourceTab = normalizeTab(focus.sourceTab);
        return `
            <div class="hip-glass-panel hip-list-focus-banner">
                <div class="hip-box-header">
                    <h3>${escapeHtml(focus.title || '聚焦样本')}</h3>
                    <div class="hip-list-focus-actions">
                        ${sourceTab !== 'list' ? `<button type="button" class="hip-btn-outline hip-btn-inline" data-hip-action="switch-tab" data-tab="${escapeAttribute(sourceTab)}">回到${escapeHtml(getAdminTabLabel(sourceTab))}</button>` : ''}
                        <button type="button" class="hip-btn-danger hip-btn-inline" data-hip-action="clear-list-focus">退出聚焦</button>
                    </div>
                </div>
                <div class="hip-box-hint">${escapeHtml(focus.hint || '当前看的不是普通分页，而是从其他页签跳转来的聚焦样本。')}</div>
                <div class="hip-audit-compact-meta">来源页签：${escapeHtml(getAdminTabLabel(sourceTab))} · 共 ${escapeHtml(String(Math.max(0, Number(focus.count || 0))))} 条 · 修改下面筛选、翻页或点“退出聚焦”都会回到普通列表。</div>
            </div>
        `;
    }

    function renderAuditSummaryCard(label, value, hint, tone) {
        const safeTone = toTrimmedString(tone) || 'neutral';
        return `
            <div class="hip-audit-summary-card tone-${escapeAttribute(safeTone)}">
                <div class="hip-audit-summary-value">${escapeHtml(String(value))}</div>
                <div class="hip-audit-summary-label">${escapeHtml(label)}</div>
                <div class="hip-audit-summary-hint">${escapeHtml(hint || '')}</div>
            </div>
        `;
    }

    function renderAuditCompactRows(rows, emptyText) {
        const safeRows = Array.isArray(rows) ? rows.filter(Boolean) : [];
        if (safeRows.length <= 0) {
            return `<div class="hip-empty hip-empty-compact">${escapeHtml(emptyText || '暂无需要额外关注的条目。')}</div>`;
        }
        return `
            <div class="hip-audit-compact-list">
                ${safeRows.map(function renderAuditCompactRow(row) {
                    const title = toTrimmedString(row && row.title) || '未命名条目';
                    const body = toTrimmedString(row && row.body) || '暂无说明';
                    const meta = Array.isArray(row && row.meta) ? row.meta.filter(Boolean) : [];
                    return `
                        <div class="hip-audit-compact-row">
                            <div class="hip-audit-compact-title">${escapeHtml(title)}</div>
                            ${meta.length > 0 ? `<div class="hip-audit-compact-meta">${escapeHtml(meta.join(' · '))}</div>` : ''}
                            <div class="hip-audit-compact-body">${escapeHtml(body)}</div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    function renderAuditPanel() {
        if (state.loading) {
            return renderLoadingPanel('整理线索中...');
        }

        const enabledContacts = getEnabledContacts();
        const audit = state.data && state.data.audit && typeof state.data.audit === 'object'
            ? state.data.audit
            : {};
        const dashboard = audit.dashboard && typeof audit.dashboard === 'object'
            ? audit.dashboard
            : {};
        const memories = Array.isArray(audit.memories) ? audit.memories : [];
        const failures = Array.isArray(audit.dehydrateFailures) ? audit.dehydrateFailures : [];
        const digestOutcomes = Array.isArray(audit.digestOutcomes) ? audit.digestOutcomes : [];
        const eventRecordsById = audit.eventRecordsById && typeof audit.eventRecordsById === 'object'
            ? audit.eventRecordsById
            : {};
        const eventItems = buildListDisplayItems(memories, {
            recordType: 'event',
            eventRecordsById: eventRecordsById
        });
        const groundingBuckets = deriveAuditGroundingBuckets(memories);
        const reconEntries = deriveAuditReconReviewEntries(memories);
        const eventBuckets = deriveAuditEventBuckets(eventItems);

        const weakOrMissingGroundingCount = groundingBuckets.missing.length + groundingBuckets.weak.length + groundingBuckets.medium.length;
        const unresolvedCount = Math.max(0, Number(dashboard.unresolved_count || 0));
        const totalCount = Math.max(0, Number(dashboard.total_count || 0));

        const failureRowsHtml = renderAuditCompactRows(
            failures.slice(0, 4).map(function mapFailure(item) {
                const errorText = toTrimmedString(item && (item.errorMessage || item.error_message)) || '未知错误';
                return {
                    title: toTrimmedString(item && (item.charLabel || item.charId)) || '后台脱水任务',
                    meta: [
                        formatDateTime(item && (item.createdAt || item.created_at || item.updatedAt || item.updated_at)),
                        `重试 ${Math.max(0, Math.floor(toFiniteNumber(item && (item.retryCount || item.retry_count), 0)))} 次`
                    ],
                    body: summarizeContent(errorText, 120)
                };
            }),
            '最近没有脱水失败任务。'
        );

        const digestRowsHtml = renderAuditCompactRows(
            digestOutcomes.slice(0, 4).map(function mapDigest(item) {
                return {
                    title: toTrimmedString(item && item.digestSummary) || '暂无变化摘要',
                    meta: [
                        formatDateTime(item && (item.windowEnd || item.updatedAt || item.createdAt)),
                        Number(item && item.sourceMessageCount || 0) > 0
                            ? `消息 ${Math.max(0, Number(item && item.sourceMessageCount || 0))} 条`
                            : '',
                        toTrimmedString(item && item.attachmentAfter)
                            ? `依恋 ${formatAttachmentStyleLabel(item.attachmentAfter)}`
                            : ''
                    ].filter(Boolean),
                    body: summarizeContent(
                        toTrimmedString(item && (item.selfInsightAfter || item.eventChanges || item.fragmentChanges))
                        || '这轮整理还没有留下更细的变化说明。',
                        120
                    )
                };
            }),
            '最近 24 小时还没有额外记录整理结果。'
        );

        const weakGroundingHtml = groundingBuckets.weak.length > 0
            ? groundingBuckets.weak.slice(0, 4).map(function renderWeakGrounding(memory) {
                return renderMemoryCard(memory);
            }).join('')
            : '<div class="hip-empty">最近抽样里没有明显原话支撑偏弱的碎片。</div>';

        const missingGroundingHtml = groundingBuckets.missing.length > 0
            ? groundingBuckets.missing.slice(0, 4).map(function renderMissingGrounding(memory) {
                return renderMemoryCard(memory);
            }).join('')
            : '<div class="hip-empty">最近抽样里没有缺少原话支撑快照的碎片。</div>';

        const reconReviewHtml = reconEntries.length > 0
            ? reconEntries.slice(0, 4).map(function renderReconReview(entry) {
                return renderMemoryCard(entry.memory);
            }).join('')
            : '<div class="hip-empty">最近抽样里没有被改写护栏拦下的碎片。</div>';

        const eventGroundingHtml = eventBuckets.grounding.length > 0
            ? eventBuckets.grounding.slice(0, 3).map(function renderEventGrounding(entry) {
                return renderEventCard(entry.eventItem);
            }).join('')
            : '<div class="hip-empty">最近抽样里没有原话支撑明显异常的事件。</div>';

        const eventHistoryHtml = eventBuckets.history.length > 0
            ? eventBuckets.history.slice(0, 3).map(function renderEventHistory(entry) {
                return renderEventCard(entry.eventItem);
            }).join('')
            : '<div class="hip-empty">最近抽样里没有需要重点回看的事件留痕。</div>';

        return `
            <section class="hip-panel-wrapper">
                <div class="hip-toolbar">
                    <select id="hip-admin-char-select" class="hip-select-block">
                        ${renderContactOptions(enabledContacts, state.filters.charId)}
                    </select>
                    <button type="button" class="hip-icon-btn" data-hip-action="refresh-tab" aria-label="刷新线索排查页">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.58m15.36 2A8 8 0 004.58 9m0 0H9m11 11v-5h-.58m0 0a8 8 0 01-15.36-2m15.36 2H15"></path>
                        </svg>
                    </button>
                </div>

                <div class="hip-glass-panel hip-audit-section-card">
                    <div class="hip-box-header">
                        <h3>这页在看什么</h3>
                        <button type="button" class="hip-btn-outline hip-btn-inline" data-hip-action="switch-tab" data-tab="list">去所有记忆细看</button>
                    </div>
                    <div class="hip-box-hint">这里只抽样最近 120 条最活跃碎片，再加上最近 24 小时的整理结果和后台失败任务，方便你快速找到最值得人工复核的地方，不代表全量数据库。</div>
                    <div class="hip-list-focus-actions" style="margin-top:10px;">
                        <button type="button" class="hip-btn-outline hip-btn-inline" data-hip-action="switch-tab" data-tab="diagnostics">去风险总览</button>
                        <button type="button" class="hip-btn-outline hip-btn-inline" data-hip-action="switch-tab" data-tab="recon">去改写记录</button>
                        <button type="button" class="hip-btn-outline hip-btn-inline" data-hip-action="switch-tab" data-tab="list">去所有记忆细看</button>
                    </div>
                    <div class="hip-audit-summary-grid">
                        ${renderAuditSummaryCard('总碎片', totalCount, '当前筛选范围内的记忆总量', 'neutral')}
                        ${renderAuditSummaryCard('未了结', unresolvedCount, '还在影响角色当下判断的碎片', 'warn')}
                        ${renderAuditSummaryCard('原话支撑待复看', weakOrMissingGroundingCount, '缺快照 / 偏弱 / 证据偏稀', 'warn')}
                        ${renderAuditSummaryCard('改写被拦下', reconEntries.length, '最近被护栏挡回去的改写', 'danger')}
                        ${renderAuditSummaryCard('人工改动待看', eventBuckets.history.length, '人工编辑、成员变更或人工保护过的事件', 'info')}
                        ${renderAuditSummaryCard('后台失败任务', failures.length, '脱水失败与待处理异常', failures.length > 0 ? 'danger' : 'neutral')}
                    </div>
                </div>

                <div class="hip-glass-panel hip-audit-section-card">
                    <div class="hip-box-header">
                        <h3>后台任务速览</h3>
                        <button type="button" class="hip-btn-outline hip-btn-inline" data-hip-action="switch-tab" data-tab="export">去记忆保管箱</button>
                    </div>
                    <div class="hip-audit-two-column">
                        <div>
                            <div class="hip-audit-block-title">脱水失败任务</div>
                            <div class="hip-box-hint">这里优先看会阻塞后台链路的硬错误。</div>
                            ${failureRowsHtml}
                        </div>
                        <div>
                            <div class="hip-audit-block-title">最近 24 小时整理结果</div>
                            <div class="hip-box-hint">这里只看摘要，用来判断系统最近的整理有没有真的留下你看得懂的变化。</div>
                            ${digestRowsHtml}
                        </div>
                    </div>
                </div>

                <div class="hip-glass-panel hip-audit-section-card">
                    <div class="hip-box-header">
                        <h3>原话支撑偏弱的碎片</h3>
                    </div>
                    <div class="hip-box-hint">这批碎片已经做过原聊天校对，但对上的证据偏弱，最适合人工点开看它到底偏在哪。</div>
                    <div class="hip-card-list">
                        <div class="hip-list-inline-actions">
                            ${renderListFocusActionButton('audit', 'grounding_weak', '查看完整样本', groundingBuckets.weak.length)}
                        </div>
                        ${weakGroundingHtml}
                    </div>
                </div>

                <div class="hip-glass-panel hip-audit-section-card">
                    <div class="hip-box-header">
                        <h3>缺少原话支撑快照的碎片</h3>
                    </div>
                    <div class="hip-box-hint">这类条目未必是错的，但它们通常是旧数据，或者这轮还没带着原聊天证据重新校过。</div>
                    <div class="hip-card-list">
                        <div class="hip-list-inline-actions">
                            ${renderListFocusActionButton('audit', 'grounding_missing', '查看完整样本', groundingBuckets.missing.length)}
                        </div>
                        ${missingGroundingHtml}
                    </div>
                </div>

                <div class="hip-glass-panel hip-audit-section-card">
                    <div class="hip-box-header">
                        <h3>被护栏拦下的改写</h3>
                    </div>
                    <div class="hip-box-hint">这里集中看最近被改写护栏拒绝的碎片，方便你判断是护栏太严，还是改写真的有漂移风险。</div>
                    <div class="hip-card-list">
                        <div class="hip-list-inline-actions">
                            ${renderListFocusActionButton('audit', 'recon_review', '查看完整样本', reconEntries.length)}
                        </div>
                        ${reconReviewHtml}
                    </div>
                </div>

                <div class="hip-glass-panel hip-audit-section-card">
                    <div class="hip-box-header">
                        <h3>原话支撑需要补看的事件</h3>
                    </div>
                    <div class="hip-box-hint">这批事件要么整件事对原聊天的支撑偏弱，要么事件成员里还有不少碎片没做过校对。</div>
                    <div class="hip-card-list">
                        <div class="hip-list-inline-actions">
                            ${renderListFocusActionButton('audit', 'event_grounding', '查看完整样本', eventBuckets.grounding.length)}
                        </div>
                        ${eventGroundingHtml}
                    </div>
                </div>

                <div class="hip-glass-panel hip-audit-section-card">
                    <div class="hip-box-header">
                        <h3>事件留痕与人工保护</h3>
                    </div>
                    <div class="hip-box-hint">这里集中看最近被人工编辑、成员调整、人工保护过的事件，方便你回看“系统后来又动过没有”。</div>
                    <div class="hip-card-list">
                        <div class="hip-list-inline-actions">
                            ${renderListFocusActionButton('audit', 'event_history', '查看完整样本', eventBuckets.history.length)}
                        </div>
                        ${eventHistoryHtml}
                    </div>
                </div>
            </section>
        `;
    }

    function renderReconPanel() {
        if (state.loading) {
            return renderLoadingPanel('整理改写记录中...');
        }

        const enabledContacts = getEnabledContacts();
        const recon = state.data && state.data.recon && typeof state.data.recon === 'object'
            ? state.data.recon
            : {};
        const dashboard = recon.dashboard && typeof recon.dashboard === 'object'
            ? recon.dashboard
            : {};
        const memories = Array.isArray(recon.memories) ? recon.memories : [];
        const eventRecordsById = recon.eventRecordsById && typeof recon.eventRecordsById === 'object'
            ? recon.eventRecordsById
            : {};
        const eventItems = buildListDisplayItems(memories, {
            recordType: 'event',
            eventRecordsById: eventRecordsById
        });
        const replayBuckets = deriveReconReplayBuckets(memories, eventItems);
        const accepted = replayBuckets.accepted;
        const rejected = replayBuckets.rejected;
        const manual = replayBuckets.manual;
        const eventRefresh = replayBuckets.eventRefresh;
        const hotspots = replayBuckets.hotspots;
        const totalCount = Math.max(0, Number(dashboard.total_count || 0));
        const unresolvedCount = Math.max(0, Number(dashboard.unresolved_count || 0));
        const eventBatchCount = accepted.filter(function countEventBatch(entry) {
            const latestScope = toTrimmedString(entry && entry.latestRewrite && entry.latestRewrite.scope).toLowerCase();
            return latestScope === 'event_batch';
        }).length;

        const acceptedHtml = accepted.length > 0
            ? accepted.slice(0, 5).map(function renderAccepted(entry) {
                return renderMemoryCard(entry.memory);
            }).join('')
            : '<div class="hip-empty">最近抽样里还没有成功回写过的改写条目。</div>';

        const rejectedHtml = rejected.length > 0
            ? rejected.slice(0, 5).map(function renderRejected(entry) {
                return renderMemoryCard(entry.memory);
            }).join('')
            : '<div class="hip-empty">最近抽样里还没有被护栏拦下的改写条目。</div>';

        const eventRefreshHtml = eventRefresh.length > 0
            ? eventRefresh.slice(0, 4).map(function renderEventRefresh(entry) {
                return renderEventCard(entry.eventItem);
            }).join('')
            : '<div class="hip-empty">最近抽样里还没有“改写回写”导致的事件摘要刷新。</div>';

        const manualRowsHtml = renderAuditCompactRows(
            manual.slice(0, 6).map(function mapManualRow(entry) {
                const snapshot = entry && entry.snapshot ? entry.snapshot : {};
                const strategyLabel = humanizeReconsolidationMode(snapshot.strategy) || toTrimmedString(snapshot.strategy) || '未记录策略';
                const roleLabel = humanizeReconsolidationTargetRole(snapshot.targetRole) || toTrimmedString(snapshot.targetRole);
                const scopeLabel = humanizeReconsolidationScope(snapshot.scope) || toTrimmedString(snapshot.scope);
                const statusLabel = snapshot.status === 'accepted' ? '最近一次已回写' : '最近一次被护栏拦下';
                return {
                    title: summarizeContent(toTrimmedString(entry && entry.memory && entry.memory.content) || '未命名记忆', 48),
                    meta: [
                        formatDateTime(snapshot.checkedAt || ''),
                        entry.rewriteCount > 0 ? `回写 ${Math.max(0, Number(entry.rewriteCount || 0))} 次` : '',
                        entry.guardCount > 0 ? `被拦 ${Math.max(0, Number(entry.guardCount || 0))} 次` : ''
                    ].filter(Boolean),
                    body: [statusLabel, strategyLabel, roleLabel, scopeLabel].filter(Boolean).join(' · ')
                };
            }),
            '最近抽样里还没有明显保留“你手动点过”痕迹的改写记录。'
        );

        const hotspotRowsHtml = renderAuditCompactRows(
            hotspots.slice(0, 6).map(function mapHotspotRow(entry) {
                return {
                    title: summarizeContent(toTrimmedString(entry && entry.memory && entry.memory.content) || '未命名记忆', 52),
                    meta: [
                        `触碰 ${Math.max(0, Number(entry && entry.totalTouchCount || 0))} 次`,
                        entry && entry.rewriteCount > 0 ? `回写 ${Math.max(0, Number(entry.rewriteCount || 0))}` : '',
                        entry && entry.guardCount > 0 ? `被拦 ${Math.max(0, Number(entry.guardCount || 0))}` : ''
                    ].filter(Boolean),
                    body: [
                        formatDateTime(entry && entry.snapshot && entry.snapshot.checkedAt),
                        humanizeReconsolidationMode(entry && entry.snapshot && entry.snapshot.strategy) || toTrimmedString(entry && entry.snapshot && entry.snapshot.strategy),
                        humanizeReconsolidationTargetRole(entry && entry.snapshot && entry.snapshot.targetRole) || toTrimmedString(entry && entry.snapshot && entry.snapshot.targetRole)
                    ].filter(Boolean).join(' · ')
                };
            }),
            '最近抽样里还没有反复被改写/拦截的热点对象。'
        );

        return `
            <section class="hip-panel-wrapper">
                <div class="hip-toolbar">
                    <select id="hip-admin-char-select" class="hip-select-block">
                        ${renderContactOptions(enabledContacts, state.filters.charId)}
                    </select>
                    <button type="button" class="hip-icon-btn" data-hip-action="refresh-tab" aria-label="刷新改写记录页">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.58m15.36 2A8 8 0 004.58 9m0 0H9m11 11v-5h-.58m0 0a8 8 0 01-15.36-2m15.36 2H15"></path>
                        </svg>
                    </button>
                </div>

                <div class="hip-glass-panel hip-audit-section-card">
                    <div class="hip-box-header">
                        <h3>这页在看什么</h3>
                        <div style="display:flex; gap:8px; flex-wrap:wrap;">
                            <button type="button" class="hip-btn-outline hip-btn-inline" data-hip-action="switch-tab" data-tab="audit">去线索排查</button>
                            <button type="button" class="hip-btn-outline hip-btn-inline" data-hip-action="switch-tab" data-tab="list">去所有记忆细看</button>
                        </div>
                    </div>
                    <div class="hip-box-hint">这里专门把“改写后来到底改了什么、被什么拦下、事件有没有被顺手刷新”集中摊开。它看的是最近活跃样本，不是全库回放，但比散落在卡片里的提示更适合集中复盘。</div>
                    <div class="hip-audit-summary-grid">
                        ${renderAuditSummaryCard('样本总量', totalCount, '当前角色在抽样范围内的记忆总数', 'neutral')}
                        ${renderAuditSummaryCard('成功回写', accepted.length, '最近确实留下“改写前 -> 改写后”痕迹的碎片', accepted.length > 0 ? 'info' : 'neutral')}
                        ${renderAuditSummaryCard('护栏拦下', rejected.length, '最近被改写护栏拒绝自动改写的对象', rejected.length > 0 ? 'danger' : 'neutral')}
                        ${renderAuditSummaryCard('事件回写', eventRefresh.length, '因为改写而顺带刷新过事件摘要的事件', eventRefresh.length > 0 ? 'info' : 'neutral')}
                        ${renderAuditSummaryCard('整件事一起改', eventBatchCount, '最近成功回写里属于整事件批量处理的对象', eventBatchCount > 0 ? 'warn' : 'neutral')}
                        ${renderAuditSummaryCard('手动点过的记录', manual.length, '最近仍保留“这是你手动触发过”的痕迹', manual.length > 0 ? 'warn' : 'neutral')}
                        ${renderAuditSummaryCard('反复触碰热点', hotspots.length, '多次被回写/拦截，适合重点人工复盘', hotspots.length > 0 ? 'warn' : 'neutral')}
                        ${renderAuditSummaryCard('未了结总量', unresolvedCount, '帮助判断这些改写是否还在影响当前判断', unresolvedCount > 0 ? 'warn' : 'neutral')}
                    </div>
                </div>

                <div class="hip-glass-panel hip-audit-section-card">
                    <div class="hip-box-header">
                        <h3>手动触发痕迹</h3>
                    </div>
                    <div class="hip-box-hint">这里优先看最近仍保留“这是你手动点过的”痕迹的对象，方便你回看那次手动操作后来究竟有没有真的写回去。</div>
                    <div class="hip-list-inline-actions">
                        ${renderListFocusActionButton('recon', 'manual', '查看完整样本', manual.length)}
                    </div>
                    ${manualRowsHtml}
                </div>

                <div class="hip-glass-panel hip-audit-section-card">
                    <div class="hip-box-header">
                        <h3>反复触碰的热点对象</h3>
                    </div>
                    <div class="hip-box-hint">如果同一条记忆连续被回写、又被拦下，通常代表提示、护栏或事件上下文还值得继续看。</div>
                    <div class="hip-list-inline-actions">
                        ${renderListFocusActionButton('recon', 'hotspots', '查看完整样本', hotspots.length)}
                    </div>
                    ${hotspotRowsHtml}
                </div>

                <div class="hip-glass-panel hip-audit-section-card">
                    <div class="hip-box-header">
                        <h3>最近成功回写的碎片</h3>
                    </div>
                    <div class="hip-box-hint">这些卡片会直接展开“这条记忆最近被怎么改过”，让你看到改写前后差异，而不是只看一句“已改写”。</div>
                    <div class="hip-card-list">
                        <div class="hip-list-inline-actions">
                            ${renderListFocusActionButton('recon', 'accepted', '查看完整样本', accepted.length)}
                        </div>
                        ${acceptedHtml}
                    </div>
                </div>

                <div class="hip-glass-panel hip-audit-section-card">
                    <div class="hip-box-header">
                        <h3>最近被护栏拦下的碎片</h3>
                    </div>
                    <div class="hip-box-hint">这里用来判断是护栏太严，还是改写结果真的有漂移风险。卡片里会带上被拦原因、关键词覆盖、长度比等痕迹。</div>
                    <div class="hip-card-list">
                        <div class="hip-list-inline-actions">
                            ${renderListFocusActionButton('recon', 'rejected', '查看完整样本', rejected.length)}
                        </div>
                        ${rejectedHtml}
                    </div>
                </div>

                <div class="hip-glass-panel hip-audit-section-card">
                    <div class="hip-box-header">
                        <h3>整事件回写与版本差异</h3>
                    </div>
                    <div class="hip-box-hint">这批事件最近至少有一次“改写后顺手刷新事件摘要”。展开卡片后可以直接看这件事最近具体改了哪些字段。</div>
                    <div class="hip-card-list">
                        <div class="hip-list-inline-actions">
                            ${renderListFocusActionButton('recon', 'event_refresh', '查看完整样本', eventRefresh.length)}
                        </div>
                        ${eventRefreshHtml}
                    </div>
                </div>
            </section>
        `;
    }

    /**
     * 渲染列表页。
     */
    function renderDiagnosticsPanelLegacy() {
        return renderDiagnosticsPanel();
    }

    function renderDiagnosticsPanel() {
        if (state.loading) {
            return renderLoadingPanel('整理异常线索中...');
        }

        const enabledContacts = getEnabledContacts();
        const diagnostics = state.data && state.data.diagnostics && typeof state.data.diagnostics === 'object'
            ? state.data.diagnostics
            : {};
        const dashboard = diagnostics.dashboard && typeof diagnostics.dashboard === 'object'
            ? diagnostics.dashboard
            : {};
        const memories = Array.isArray(diagnostics.memories) ? diagnostics.memories : [];
        const directEventItems = buildDirectEventDisplayItems(diagnostics.eventRecords);
        const failures = Array.isArray(diagnostics.dehydrateFailures) ? diagnostics.dehydrateFailures : [];
        const digestOutcomes = Array.isArray(diagnostics.digestOutcomes) ? diagnostics.digestOutcomes : [];
        const eventRecordsById = diagnostics.eventRecordsById && typeof diagnostics.eventRecordsById === 'object'
            ? diagnostics.eventRecordsById
            : {};
        const eventItems = buildListDisplayItems(memories, {
            recordType: 'event',
            eventRecordsById: eventRecordsById
        });
        const buckets = deriveDiagnosticBuckets(memories, eventItems, failures, digestOutcomes, directEventItems);
        const totalCount = Math.max(0, Number(dashboard.total_count || 0));
        const unresolvedCount = Math.max(0, Number(dashboard.unresolved_count || 0));
        const largeEventsHtml = buckets.largeEvents.length > 0
            ? buckets.largeEvents.slice(0, 4).map(function renderLargeEvent(item) {
                return renderEventCard(item);
            }).join('')
            : '<div class="hip-empty">最近样本里没有超大事件簇。</div>';
        const crowdedUnresolvedHtml = buckets.crowdedUnresolved.length > 0
            ? buckets.crowdedUnresolved.slice(0, 4).map(function renderCrowdedEvent(item) {
                return renderEventCard(item);
            }).join('')
            : '<div class="hip-empty">最近样本里没有“未了结且拥挤”的事件。</div>';
        const groundingEventsHtml = buckets.groundingEvents.length > 0
            ? buckets.groundingEvents.slice(0, 4).map(function renderGroundingEvent(entry) {
                return renderEventCard(entry.eventItem);
            }).join('')
            : '<div class="hip-empty">最近样本里没有明显 grounding 风险事件。</div>';
        const hotspotRowsHtml = renderAuditCompactRows(
            buckets.reconHotspots.slice(0, 6).map(function mapHotspot(entry) {
                return {
                    title: summarizeContent(toTrimmedString(entry && entry.memory && entry.memory.content) || '未命名记忆', 52),
                    meta: [
                        `触碰 ${Math.max(0, Number(entry && entry.totalTouchCount || 0))} 次`,
                        entry && entry.rewriteCount > 0 ? `回写 ${Math.max(0, Number(entry.rewriteCount || 0))}` : '',
                        entry && entry.guardCount > 0 ? `被拦 ${Math.max(0, Number(entry.guardCount || 0))}` : ''
                    ].filter(Boolean),
                    body: [
                        formatDateTime(entry && entry.snapshot && entry.snapshot.checkedAt),
                        humanizeReconsolidationMode(entry && entry.snapshot && entry.snapshot.strategy) || toTrimmedString(entry && entry.snapshot && entry.snapshot.strategy),
                        humanizeReconsolidationTargetRole(entry && entry.snapshot && entry.snapshot.targetRole) || toTrimmedString(entry && entry.snapshot && entry.snapshot.targetRole)
                    ].filter(Boolean).join(' · ')
                };
            }),
            '最近样本里没有反复变动的热点条目。'
        );
        const retiredEventRowsHtml = renderAuditCompactRows(
            buckets.retiredEvents.slice(0, 6).map(function mapRetiredEvent(item) {
                return buildEventLifecycleAuditRow(item);
            }),
            '最近没有新的退役事件。'
        );
        const lifecycleChurnRowsHtml = renderAuditCompactRows(
            buckets.lifecycleChurn.slice(0, 6).map(function mapLifecycleEntry(entry) {
                return buildEventLifecycleAuditRow(entry && entry.eventItem, [
                    entry && entry.churnScore > 0 ? `抖动 ${Math.max(0, Number(entry.churnScore || 0))}` : ''
                ]);
            }),
            '最近没有明显的生命周期抖动事件。'
        );
        const failureRowsHtml = renderAuditCompactRows(
            buckets.failures.slice(0, 5).map(function mapFailure(item) {
                return buildDehydrateFailureAuditRow(item);
            }),
            '最近没有脱水失败任务。'
        );
        const digestRowsHtml = renderAuditCompactRows(
            buckets.digestOutliers.slice(0, 5).map(function mapDigest(item) {
                const assigned = Math.max(0, Number(item && (item.assignedFragmentCount || item.assigned_fragment_count) || 0));
                const eventized = Math.max(0, Number(item && (item.eventizedCount || item.eventized_count) || 0));
                const orphan = Math.max(0, Number(item && (item.orphanFragmentCount || item.orphan_fragment_count) || 0));
                const reasons = [];
                if (assigned >= DIAGNOSTIC_DIGEST_ASSIGNED_THRESHOLD) reasons.push(`并入 ${assigned} 条碎片`);
                if (eventized >= DIAGNOSTIC_DIGEST_EVENTIZED_THRESHOLD) reasons.push(`新建 ${eventized} 个事件`);
                if (orphan >= DIAGNOSTIC_DIGEST_ORPHAN_THRESHOLD) reasons.push(`遗留 ${orphan} 条孤片`);
                const baseRow = buildDigestOutcomeAuditRow(item);
                return {
                    title: baseRow.title,
                    meta: baseRow.meta.concat(reasons),
                    body: baseRow.body
                };
            }),
            '最近 72 小时没有明显的单轮整理过载记录。'
        );

        return `
            <section class="hip-panel-wrapper">
                <div class="hip-toolbar">
                    <select id="hip-admin-char-select" class="hip-select-block">
                        ${renderContactOptions(enabledContacts, state.filters.charId)}
                    </select>
                    <button type="button" class="hip-icon-btn" data-hip-action="refresh-tab" aria-label="刷新异常页">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.58m15.36 2A8 8 0 004.58 9m0 0H9m11 11v-5h-.58m0 0a8 8 0 01-15.36-2m15.36 2H15"></path>
                        </svg>
                    </button>
                </div>

                <div class="hip-glass-panel hip-audit-section-card">
                    <div class="hip-box-header">
                        <h3>这页在看什么</h3>
                        <div style="display:flex; gap:8px; flex-wrap:wrap;">
                            <button type="button" class="hip-btn-outline hip-btn-inline" data-hip-action="switch-tab" data-tab="recon">去改写记录</button>
                            <button type="button" class="hip-btn-outline hip-btn-inline" data-hip-action="switch-tab" data-tab="audit">去线索排查</button>
                            <button type="button" class="hip-btn-outline hip-btn-inline" data-hip-action="switch-tab" data-tab="list">去所有记忆</button>
                            <button type="button" class="hip-btn-outline hip-btn-inline" data-hip-action="switch-tab" data-tab="export">去记忆保管箱</button>
                        </div>
                    </div>
                    <div class="hip-box-hint">这里把“超大事件、整理过载、原话支撑偏弱、改写热点、后台失败”集中到一页，方便你快速判断先该看哪块，不是扫全库的技术页。</div>
                    <div class="hip-audit-summary-grid">
                        ${renderAuditSummaryCard('样本总量', totalCount, '当前角色在抽样范围内的记忆总数', 'neutral')}
                        ${renderAuditSummaryCard('未了结总量', unresolvedCount, '帮助判断当前压力是否还在持续', unresolvedCount > 0 ? 'warn' : 'neutral')}
                        ${renderAuditSummaryCard('超大事件簇', buckets.largeEvents.length, `成员数 >= ${DIAGNOSTIC_LARGE_EVENT_THRESHOLD} 的事件`, buckets.largeEvents.length > 0 ? 'danger' : 'neutral')}
                        ${renderAuditSummaryCard('未了结且拥挤', buckets.crowdedUnresolved.length, `未了结且成员数 >= ${DIAGNOSTIC_CROWDED_UNRESOLVED_THRESHOLD} 的事件`, buckets.crowdedUnresolved.length > 0 ? 'warn' : 'neutral')}
                        ${renderAuditSummaryCard('原话支撑风险事件', buckets.groundingEvents.length, '整事件或成员对原聊天支撑偏弱', buckets.groundingEvents.length > 0 ? 'warn' : 'neutral')}
                        ${renderAuditSummaryCard('改写热点', buckets.reconHotspots.length, '反复被回写或拦截的对象', buckets.reconHotspots.length > 0 ? 'warn' : 'neutral')}
                        ${renderAuditSummaryCard('退役事件', buckets.retiredEvents.length, '已经退出主线、仍需保留轨迹的历史事件', buckets.retiredEvents.length > 0 ? 'neutral' : 'neutral')}
                        ${renderAuditSummaryCard('来回变动', buckets.lifecycleChurn.length, '留痕、人工保护或退役变化偏多的事件', buckets.lifecycleChurn.length > 0 ? 'warn' : 'neutral')}
                        ${renderAuditSummaryCard('单轮整理过载', buckets.digestOutliers.length, '并入过多、事件化过多或孤片偏多的整理结果', buckets.digestOutliers.length > 0 ? 'danger' : 'neutral')}
                        ${renderAuditSummaryCard('脱水失败', buckets.failures.length, '需要重试或复盘的后台任务', buckets.failures.length > 0 ? 'danger' : 'neutral')}
                    </div>
                </div>

                <div class="hip-glass-panel hip-audit-section-card">
                    <div class="hip-box-header">
                        <h3>超大事件簇</h3>
                    </div>
                    <div class="hip-box-hint">如果一个事件成员数过大，往往意味着 digest 归并过宽，或者旧记忆又被重新吸回来了。</div>
                    <div class="hip-card-list">
                        <div class="hip-list-inline-actions">
                            ${renderListFocusActionButton('diagnostics', 'large_events', '查看完整样本', buckets.largeEvents.length)}
                        </div>
                        ${largeEventsHtml}
                    </div>
                </div>

                <div class="hip-glass-panel hip-audit-section-card">
                    <div class="hip-box-header">
                        <h3>未了结且拥挤的事件</h3>
                    </div>
                    <div class="hip-box-hint">这类事件既没解决，又挂着较多成员，最适合优先人工复看。</div>
                    <div class="hip-card-list">
                        <div class="hip-list-inline-actions">
                            ${renderListFocusActionButton('diagnostics', 'crowded_unresolved', '查看完整样本', buckets.crowdedUnresolved.length)}
                        </div>
                        ${crowdedUnresolvedHtml}
                    </div>
                </div>

                <div class="hip-glass-panel hip-audit-section-card">
                    <div class="hip-box-header">
                        <h3>原话支撑风险事件</h3>
                    </div>
                    <div class="hip-box-hint">不是所有原话支撑异常都会立刻出错，但这批事件最容易在后续改写或事件直出时发生变形。</div>
                    <div class="hip-card-list">
                        <div class="hip-list-inline-actions">
                            ${renderListFocusActionButton('diagnostics', 'grounding_events', '查看完整样本', buckets.groundingEvents.length)}
                        </div>
                        ${groundingEventsHtml}
                    </div>
                </div>

                <div class="hip-glass-panel hip-audit-section-card">
                    <div class="hip-box-header">
                        <h3>反复变动热点</h3>
                    </div>
                    <div class="hip-box-hint">同一条记忆连续被回写或拦下，通常就是值得优先排查的热点对象。</div>
                    <div class="hip-list-inline-actions">
                        ${renderListFocusActionButton('diagnostics', 'recon_hotspots', '查看完整样本', buckets.reconHotspots.length)}
                    </div>
                    ${hotspotRowsHtml}
                </div>

                <div class="hip-glass-panel hip-audit-section-card">
                    <div class="hip-box-header">
                        <h3>退役事件轨迹</h3>
                    </div>
                    <div class="hip-box-hint">这里看已经退役的事件为什么退出主线、是否被其他事件接替，以及退役前大概挂了多少成员。</div>
                    <div class="hip-list-inline-actions">
                        ${renderListFocusActionButton('diagnostics', 'retired_events', '查看完整样本', buckets.retiredEvents.length)}
                    </div>
                    ${retiredEventRowsHtml}
                </div>

                <div class="hip-glass-panel hip-audit-section-card">
                    <div class="hip-box-header">
                        <h3>来回变动的事件</h3>
                    </div>
                    <div class="hip-box-hint">如果一个事件留痕很多、人工保护很多，或者刚刚退役，通常说明它的边界还不够稳，值得单独复看。</div>
                    <div class="hip-list-inline-actions">
                        ${renderListFocusActionButton('diagnostics', 'lifecycle_churn', '查看完整样本', buckets.lifecycleChurn.length)}
                    </div>
                    ${lifecycleChurnRowsHtml}
                </div>

                <div class="hip-glass-panel hip-audit-section-card">
                    <div class="hip-box-header">
                        <h3>单轮整理过载线索</h3>
                        <button type="button" class="hip-btn-outline hip-btn-inline" data-hip-action="switch-tab" data-tab="export">去记忆保管箱</button>
                    </div>
                    <div class="hip-box-hint">当单轮整理吸入过多碎片、新建过多事件或留下一堆孤片，后面就很容易出现“这一轮吃太多”的问题。</div>
                    ${digestRowsHtml}
                </div>

                <div class="hip-glass-panel hip-audit-section-card">
                    <div class="hip-box-header">
                        <h3>脱水失败任务</h3>
                        <button type="button" class="hip-btn-outline hip-btn-inline" data-hip-action="switch-tab" data-tab="export">去记忆保管箱</button>
                    </div>
                    <div class="hip-box-hint">这里专门看会直接堵住后台链路的硬错误。手动重试和删除记录入口仍在记忆保管箱页。</div>
                    ${failureRowsHtml}
                </div>
            </section>
        `;
    }

    function renderRegressionHelperBar() {
        const helper = getRegressionHelperState();
        const trackedEventId = toTrimmedString(helper.trackedEventId);
        const snapshot = helper.snapshot && typeof helper.snapshot === 'object'
            ? helper.snapshot
            : null;
        const lastReport = helper.lastReport && typeof helper.lastReport === 'object'
            ? helper.lastReport
            : null;

        if (!trackedEventId || !snapshot) {
            return `
                <div class="hip-regression-helper">
                    <div class="hip-regression-main">
                        <div class="hip-regression-title">回归助手</div>
                        <div class="hip-regression-note">先在任一事件卡点“记住此事件”，做完编辑 / 并入 / 移出 / 标记已了结 / 手动重整后，再点“检查变化”。</div>
                    </div>
                </div>
            `;
        }

        const helperLines = [
            `已跟踪：${buildRegressionEventLabel(snapshot, trackedEventId)}`,
            `基线时间：${formatDateTime(snapshot.capturedAt)}`
        ];
        if (lastReport && lastReport.summary) {
            helperLines.push(`最近检查：${lastReport.summary}`);
        }
        if (helper.busy) {
            helperLines.push('正在读取数据库，请稍候...');
        }

        return `
            <div class="hip-regression-helper">
                <div class="hip-regression-main">
                    <div class="hip-regression-title">回归助手 · ${escapeHtml(buildRegressionEventLabel(snapshot, trackedEventId))}</div>
                    <div class="hip-regression-note">${escapeHtml(helperLines.join('\n')).replace(/\n/g, '<br>')}</div>
                </div>
                <div class="hip-regression-actions">
                    <button type="button" class="hip-btn-outline hip-btn-inline" data-hip-action="check-regression-event" data-event-id="${escapeAttribute(trackedEventId)}" ${helper.busy ? 'disabled' : ''}>${helper.busy ? '检查中...' : '检查变化'}</button>
                    <button type="button" class="hip-btn-outline hip-btn-inline" data-hip-action="remember-regression-event" data-event-id="${escapeAttribute(trackedEventId)}" ${helper.busy ? 'disabled' : ''}>更新基线</button>
                    <button type="button" class="hip-btn-danger hip-btn-inline" data-hip-action="clear-regression-event" data-event-id="${escapeAttribute(trackedEventId)}" ${helper.busy ? 'disabled' : ''}>清除跟踪</button>
                </div>
            </div>
        `;
    }

    function renderListPanel() {
        if (state.loading) {
            return renderLoadingPanel('打捞记忆中...');
        }

        const listData = state.data.list || {};
        const items = Array.isArray(listData.items) ? listData.items : [];
        const directDisplayItems = Array.isArray(listData.directDisplayItems) ? listData.directDisplayItems : [];
        const pager = state.listPagination && typeof state.listPagination === 'object'
            ? state.listPagination
            : {
                page: 1,
                hasMore: false,
                pageStartCursors: [null]
            };
        const currentPage = Math.max(1, Number(pager.page || 1));
        const queryValue = escapeAttribute(state.filters.query || '');
        const layerValue = toTrimmedString(state.filters.layer);
        const resolvedValue = toTrimmedString(state.filters.resolved);
        const recordTypeValue = toTrimmedString(state.filters.recordType);
        const directEventMode = isDirectEventRecordListMode(recordTypeValue);
        const sortValue = normalizeListSort(state.filters.sort, recordTypeValue);
        const listFocus = getActiveListFocus();
        const totalCount = Math.max(0, Number(listData.totalCount || 0));
        const totalPages = totalCount > 0 ? Math.max(1, Math.ceil(totalCount / PAGE_SIZE)) : 0;
        const knownStartCount = Array.isArray(pager.pageStartCursors) ? pager.pageStartCursors.length : 1;
        const maxPage = totalPages > 0
            ? totalPages
            : Math.max(1, knownStartCount, currentPage + (pager.hasMore ? 1 : 0));
        const canGoNext = totalPages > 0
            ? currentPage < totalPages
            : !!pager.hasMore;

        let pagesHtml = '';
        const appendPageButton = function appendPageButton(pageNumber) {
            const activeClass = pageNumber === currentPage ? 'active' : '';
            pagesHtml += `<button type="button" class="hip-page-num ${activeClass}" data-hip-action="jump-page" data-page="${pageNumber}">${pageNumber}</button>`;
        };

        if (maxPage <= 7) {
            for (let page = 1; page <= maxPage; page += 1) {
                appendPageButton(page);
            }
        } else {
            appendPageButton(1);
            if (currentPage > 3) {
                pagesHtml += '<span class="hip-page-dots">...</span>';
            }
            const startPage = Math.max(2, currentPage - 1);
            const endPage = Math.min(maxPage - 1, currentPage + 1);
            for (let page = startPage; page <= endPage; page += 1) {
                appendPageButton(page);
            }
            if (currentPage < maxPage - 2) {
                pagesHtml += '<span class="hip-page-dots">...</span>';
            }
            appendPageButton(maxPage);
        }

        const normalDisplayItems = directEventMode
            ? directDisplayItems
            : buildListDisplayItems(items, {
                recordType: recordTypeValue,
                eventRecordsById: state.data && state.data.list ? state.data.list.eventRecordsById : {}
            });
        const displayItems = listFocus ? listFocus.displayItems : normalDisplayItems;
        const focusBannerHtml = renderListFocusBanner();
        const regressionHelperHtml = renderRegressionHelperBar();
        const listHtml = displayItems.length > 0
            ? displayItems.map(renderListItem).join('')
            : `<div class="hip-empty">${escapeHtml(
                listFocus
                    ? '这组聚焦样本目前没有可显示的条目。'
                    : (directEventMode ? '当前没有可查看的退役事件。' : '这片海域空空如也...')
            )}</div>`;
        const quickActionsHtml = listFocus
            ? `
                <div class="hip-list-quick-actions">
                    <button type="button" class="hip-btn-outline hip-btn-inline" data-hip-action="clear-list-focus">退出聚焦</button>
                    <div class="hip-list-quick-hint">当前是跨页聚焦结果，不参与分页。修改筛选、切换角色或点“退出聚焦”后会回到普通列表。</div>
                </div>
            `
            : `
                <div class="hip-list-quick-actions">
                    <button type="button" class="hip-btn-outline hip-btn-inline" data-hip-action="run-event-digest" ${state.filters.charId ? '' : 'disabled'}>手动重整当前角色事件</button>
                    <div class="hip-list-quick-hint">只有在你明确要让系统重新归并旧碎片时，再手动触发整轮 digest。</div>
                </div>
            `;
        const paginationHtml = listFocus
            ? ''
            : `
                <div class="hip-pagination-unified">
                    <div class="hip-page-row">
                        <button type="button" class="hip-page-arrow" data-hip-action="prev-page" ${currentPage <= 1 ? 'disabled' : ''}>上一页</button>
                        ${pagesHtml}
                        <button type="button" class="hip-page-arrow" data-hip-action="next-page" ${canGoNext ? '' : 'disabled'}>下一页</button>
                    </div>

                    <form id="hip-admin-page-jump-form" class="hip-page-jump-row">
                        <span class="hip-page-jump-label">跳转到</span>
                        <input type="number" min="1" max="${maxPage}" step="1" name="page" class="hip-page-input-inline" aria-label="跳转页码" value="${currentPage}">
                        <span class="hip-page-jump-total">/ ${maxPage}</span>
                        <button type="submit" class="hip-page-jump-btn">跳转</button>
                    </form>
                </div>
            `;

        return `
            <section class="hip-panel-wrapper">
                <form id="hip-admin-list-filter-form" class="hip-unified-search">
                    <div class="hip-search-input-box">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                        </svg>
                        <input type="text" name="query" value="${queryValue}" placeholder="搜寻记忆痕迹 (回车确认)...">
                    </div>

                    <div class="hip-search-divider"></div>
                    <select name="layer" class="hip-inline-select" ${directEventMode ? 'disabled' : ''}>
                        <option value="" ${layerValue === '' ? 'selected' : ''}>潜层级</option>
                        <option value="core" ${layerValue === 'core' ? 'selected' : ''}>深刻记忆</option>
                        <option value="shadow" ${layerValue === 'shadow' ? 'selected' : ''}>未愈合</option>
                        <option value="wish" ${layerValue === 'wish' ? 'selected' : ''}>期盼</option>
                    </select>

                    <div class="hip-search-divider"></div>
                    <select name="resolved" class="hip-inline-select" ${directEventMode ? 'disabled' : ''}>
                        <option value="" ${resolvedValue === '' ? 'selected' : ''}>状态</option>
                        <option value="unresolved" ${resolvedValue === 'unresolved' ? 'selected' : ''}>挥之不去</option>
                        <option value="resolved" ${resolvedValue === 'resolved' ? 'selected' : ''}>已释怀</option>
                    </select>

                    <div class="hip-search-divider"></div>
                    <select name="recordType" class="hip-inline-select">
                        <option value="" ${recordTypeValue === '' ? 'selected' : ''}>类型</option>
                        <option value="event" ${recordTypeValue === 'event' ? 'selected' : ''}>记忆事件</option>
                        <option value="fragment" ${recordTypeValue === 'fragment' ? 'selected' : ''}>记忆碎片</option>
                        <option value="unresolved_event" ${recordTypeValue === 'unresolved_event' ? 'selected' : ''}>未了结事件</option>
                        <option value="retired_event" ${recordTypeValue === 'retired_event' ? 'selected' : ''}>退役事件</option>
                    </select>

                    <div class="hip-search-divider"></div>
                    <select name="sort" class="hip-inline-select">
                        ${renderListSortOptions(recordTypeValue, sortValue)}
                    </select>
                </form>

                ${quickActionsHtml}

                ${focusBannerHtml}
                ${regressionHelperHtml}
                <div class="hip-card-list">
                    ${listHtml}
                </div>

                ${paginationHtml}
            </section>
        `;
    }

    /**
     * 将 digest 详情文本转成适合卡片展示的多行 HTML。
     */
    function renderDigestMultilineText(value, emptyText) {
        const text = toTrimmedString(value);
        if (!text) {
            return `<span class="hip-digest-empty">${escapeHtml(emptyText || '暂无记录')}</span>`;
        }
        return escapeHtml(text).replace(/\r?\n/g, '<br>');
    }

    /**
     * 渲染单条 24h 成果卡片，支持展开查看更细的整理结果。
     */
    function renderDigestOutcomeCard(item) {
        const safeItem = item && typeof item === 'object' ? item : {};
        const recordId = toTrimmedString(safeItem.id);
        const digestId = escapeAttribute(recordId);
        const expanded = !!recordId && state.expandedDigestOutcomeId === recordId;
        const timeText = escapeHtml(formatDateTime(safeItem.windowEnd || safeItem.updatedAt || safeItem.createdAt));
        const summary = escapeHtml(toTrimmedString(safeItem.digestSummary) || '暂无变化摘要');
        const attachmentBefore = normalizeAttachmentStyle(safeItem.attachmentBefore);
        const attachmentAfter = normalizeAttachmentStyle(safeItem.attachmentAfter);
        const migratedCount = Math.max(0, Number(safeItem.migratedCount || 0));
        const eventizedCount = Math.max(0, Number(safeItem.eventizedCount || 0));
        const assignedFragmentCount = Math.max(0, Number(safeItem.assignedFragmentCount || 0));
        const orphanFragmentCount = Math.max(0, Number(safeItem.orphanFragmentCount || 0));
        const hasStructuredStats = migratedCount > 0
            || eventizedCount > 0
            || assignedFragmentCount > 0
            || orphanFragmentCount > 0;
        const metaParts = [];
        if (attachmentAfter) {
            metaParts.push(`依恋倾向：${formatAttachmentStyleLabel(attachmentAfter)}`);
        }
        if (Number(safeItem.sourceMessageCount || 0) > 0) {
            metaParts.push(`消息数 ${Math.max(0, Number(safeItem.sourceMessageCount || 0))}`);
        }
        if (hasStructuredStats) {
            metaParts.push(`事件 ${eventizedCount} · 并入 ${assignedFragmentCount} · 孤片 ${orphanFragmentCount}`);
        }
        if (safeItem.manualEdited) {
            metaParts.push('含手动修订');
        }
        const attachmentFlow = attachmentAfter
            ? `${attachmentBefore ? formatAttachmentStyleLabel(attachmentBefore) : '未记录'} -> ${formatAttachmentStyleLabel(attachmentAfter)}`
            : '未记录';
        const windowText = `${formatDateTime(safeItem.windowStart)} - ${formatDateTime(safeItem.windowEnd || safeItem.updatedAt || safeItem.createdAt)}`;
        const digestStatsText = hasStructuredStats
            ? [
                `层级迁移 ${migratedCount} 条`,
                `整理事件 ${eventizedCount} 个`,
                `并入事件 ${assignedFragmentCount} 条`,
                `保留孤片 ${orphanFragmentCount} 条`
            ].join('\n')
            : '';

        return `
            <article class="hip-digest-item ${expanded ? 'expanded' : ''}" data-hip-action="toggle-digest-outcome" data-digest-id="${digestId}">
                <div class="hip-digest-main">
                    <div class="hip-snapshot-time">${timeText}</div>
                    <div class="hip-dehydrate-failure-msg">${summary}</div>
                    <div class="hip-snapshot-meta">${metaParts.join(' · ') || '仅手动记录摘要'}</div>
                    ${expanded ? `
                        <div class="hip-digest-expand">
                            <div class="hip-digest-grid">
                                <div class="hip-digest-block">
                                    <div class="hip-digest-label">记录窗口</div>
                                    <div class="hip-digest-text">${escapeHtml(windowText)}</div>
                                </div>
                                <div class="hip-digest-block">
                                    <div class="hip-digest-label">本轮整理数量</div>
                                    <div class="hip-digest-text">${renderDigestMultilineText(digestStatsText, '这一轮还没有结构化统计数据')}</div>
                                </div>
                                <div class="hip-digest-block">
                                    <div class="hip-digest-label">依恋变化</div>
                                    <div class="hip-digest-text">${escapeHtml(attachmentFlow)}</div>
                                </div>
                                <div class="hip-digest-block">
                                    <div class="hip-digest-label">整理后 TA 的感受</div>
                                    <div class="hip-digest-text">${renderDigestMultilineText(safeItem.selfInsightAfter, '这一轮还没写下新的变化感受')}</div>
                                </div>
                                <div class="hip-digest-block">
                                    <div class="hip-digest-label">记忆事件变化</div>
                                    <div class="hip-digest-text">${renderDigestMultilineText(safeItem.eventChanges, '这一轮没有额外记录事件变化')}</div>
                                </div>
                                <div class="hip-digest-block">
                                    <div class="hip-digest-label">记忆碎片变化</div>
                                    <div class="hip-digest-text">${renderDigestMultilineText(safeItem.fragmentChanges, '这一轮没有额外记录碎片变化')}</div>
                                </div>
                            </div>
                            <div class="hip-card-actions">
                                <button type="button" class="hip-btn-outline hip-btn-inline" data-hip-action="edit-digest-summary" data-digest-id="${digestId}">改摘要</button>
                                <button type="button" class="hip-btn-outline hip-btn-inline" data-hip-action="edit-digest-self-insight" data-digest-id="${digestId}">改内在变化</button>
                                <button type="button" class="hip-btn-outline hip-btn-inline" data-hip-action="edit-digest-events" data-digest-id="${digestId}">改事件变化</button>
                                <button type="button" class="hip-btn-outline hip-btn-inline" data-hip-action="edit-digest-fragments" data-digest-id="${digestId}">改碎片变化</button>
                            </div>
                        </div>
                    ` : ''}
                </div>
                <div class="hip-actions">
                    <button type="button" class="hip-btn-outline hip-btn-inline" data-hip-action="edit-digest-outcome" data-digest-id="${digestId}">编辑摘要</button>
                    <button type="button" class="hip-btn-danger hip-btn-inline" data-hip-action="delete-digest-outcome" data-digest-id="${digestId}">删除</button>
                </div>
            </article>
        `;
    }

    /**
     * 渲染导出 / 恢复页。
     */
    function getNotebookData() {
        const notebook = state.data && state.data.notebook && typeof state.data.notebook === 'object'
            ? state.data.notebook
            : {};
        return {
            profiles: Array.isArray(notebook.profiles) ? notebook.profiles.filter(function filterVisibleProfile(item) {
                return isNotebookProfileCategoryVisible(item && item.category);
            }) : [],
            mustRemember: Array.isArray(notebook.mustRemember) ? notebook.mustRemember : [],
            redlines: Array.isArray(notebook.redlines) ? notebook.redlines : [],
            pendingRedlines: Array.isArray(notebook.pendingRedlines) ? notebook.pendingRedlines : [],
            promptPreview: notebook.promptPreview && typeof notebook.promptPreview === 'object'
                ? notebook.promptPreview
                : null,
            cleanupPreview: notebook.cleanupPreview && typeof notebook.cleanupPreview === 'object'
                ? notebook.cleanupPreview
                : null,
            learningProfile: notebook.learningProfile && typeof notebook.learningProfile === 'object'
                ? notebook.learningProfile
                : null,
            runtimeStatus: notebook.runtimeStatus && typeof notebook.runtimeStatus === 'object'
                ? notebook.runtimeStatus
                : null,
            runtimeHistory: Array.isArray(notebook.runtimeHistory)
                ? notebook.runtimeHistory
                : []
        };
    }

    function normalizeRelationshipArcKeyEvent(item) {
        const source = item && typeof item === 'object' ? item : {};
        return {
            date: toTrimmedString(source.date),
            theme: toTrimmedString(source.theme),
            summary: toTrimmedString(source.summary),
            impact: toTrimmedString(source.impact),
            evidenceEventIds: Array.isArray(source.evidence_event_ids || source.evidenceEventIds)
                ? (source.evidence_event_ids || source.evidenceEventIds).map(toTrimmedString).filter(Boolean)
                : [],
            evidenceFragmentIds: Array.isArray(source.evidence_fragment_ids || source.evidenceFragmentIds)
                ? (source.evidence_fragment_ids || source.evidenceFragmentIds).map(toTrimmedString).filter(Boolean)
                : []
        };
    }

    function normalizeRelationshipArcStageView(item) {
        const source = item && typeof item === 'object' ? item : {};
        return {
            stage: Math.max(1, Math.floor(Number(source.stage || 1) || 1)),
            title: toTrimmedString(source.title),
            period: toTrimmedString(source.period),
            relationshipShift: toTrimmedString(source.relationship_shift || source.relationshipShift),
            keyEvents: Array.isArray(source.key_events || source.keyEvents)
                ? (source.key_events || source.keyEvents).map(normalizeRelationshipArcKeyEvent).filter(Boolean)
                : [],
            ongoingThreads: Array.isArray(source.ongoing_threads || source.ongoingThreads)
                ? (source.ongoing_threads || source.ongoingThreads).map(toTrimmedString).filter(Boolean)
                : [],
            injectSummary: toTrimmedString(source.inject_summary || source.injectSummary),
            confidence: Number.isFinite(Number(source.confidence)) ? Number(source.confidence) : null
        };
    }

    function normalizeRelationshipArcStateView(stateBlock) {
        const source = stateBlock && typeof stateBlock === 'object' ? stateBlock : {};
        function normalizeList(value) {
            return Array.isArray(value) ? value.map(toTrimmedString).filter(Boolean) : [];
        }
        return {
            oneParagraphSummary: toTrimmedString(source.one_paragraph_summary || source.oneParagraphSummary),
            activeThreads: normalizeList(source.active_threads || source.activeThreads),
            unresolvedTensions: normalizeList(source.unresolved_tensions || source.unresolvedTensions),
            stableBonds: normalizeList(source.stable_bonds || source.stableBonds),
            sharedDirection: normalizeList(source.shared_direction || source.sharedDirection)
        };
    }

    function normalizeRelationshipArcRecordView(record) {
        const source = record && typeof record === 'object' ? record : null;
        if (!source) return null;

        const stages = Array.isArray(source.stages)
            ? source.stages.map(normalizeRelationshipArcStageView).filter(Boolean)
            : [];
        const currentStage = source.current_stage && typeof source.current_stage === 'object'
            ? source.current_stage
            : {};

        return {
            id: toTrimmedString(source.id || source.version_id || source.versionId),
            versionId: toTrimmedString(source.version_id || source.versionId || source.id),
            versionNumber: Math.max(1, Math.floor(Number(source.version_number || source.versionNumber || source.version || 1) || 1)),
            previousVersionId: toTrimmedString(source.previous_version_id || source.previousVersionId),
            isCurrent: source.is_current === true || source.isCurrent === true,
            updateMode: toTrimmedString(source.update_mode || source.updateMode || 'full_rebuild') || 'full_rebuild',
            generatedAt: toTrimmedString(source.generated_at || source.generatedAt || source.created_at || source.createdAt),
            createdAt: toTrimmedString(source.created_at || source.createdAt || source.generated_at || source.generatedAt),
            updatedAt: toTrimmedString(source.updated_at || source.updatedAt || source.generated_at || source.generatedAt),
            sourceSummary: source.source_summary && typeof source.source_summary === 'object'
                ? {
                    inputMode: toTrimmedString(source.source_summary.input_mode || source.source_summary.inputMode),
                    sourceOrigin: Array.isArray(source.source_summary.source_origin || source.source_summary.sourceOrigin)
                        ? (source.source_summary.source_origin || source.source_summary.sourceOrigin).map(toTrimmedString).filter(Boolean)
                        : [],
                    sourceEventCount: Math.max(0, Math.floor(Number(source.source_summary.source_event_count || source.source_summary.sourceEventCount || 0) || 0)),
                    sourceFragmentCount: Math.max(0, Math.floor(Number(source.source_summary.source_fragment_count || source.source_summary.sourceFragmentCount || 0) || 0)),
                    priorStageCount: Math.max(0, Math.floor(Number(source.source_summary.prior_stage_count || source.source_summary.priorStageCount || 0) || 0)),
                    importedTextUsed: source.source_summary.imported_text_used === true || source.source_summary.importedTextUsed === true
                }
                : {
                    inputMode: '',
                    sourceOrigin: [],
                    sourceEventCount: 0,
                    sourceFragmentCount: 0,
                    priorStageCount: 0,
                    importedTextUsed: false
                },
            cursors: source.cursors && typeof source.cursors === 'object'
                ? {
                    lastEventCursor: toTrimmedString(source.cursors.last_event_cursor || source.cursors.lastEventCursor),
                    lastEventCreatedAt: toTrimmedString(source.cursors.last_event_created_at || source.cursors.lastEventCreatedAt),
                    lastTailUpdateAt: toTrimmedString(source.cursors.last_tail_update_at || source.cursors.lastTailUpdateAt)
                }
                : {
                    lastEventCursor: '',
                    lastEventCreatedAt: '',
                    lastTailUpdateAt: ''
                },
            currentStage: {
                stage: Math.max(1, Math.floor(Number(currentStage.stage || (stages[stages.length - 1] && stages[stages.length - 1].stage) || 1) || 1)),
                title: toTrimmedString(currentStage.title || (stages[stages.length - 1] && stages[stages.length - 1].title)),
                period: toTrimmedString(currentStage.period || (stages[stages.length - 1] && stages[stages.length - 1].period))
            },
            stages: stages,
            currentRelationshipState: normalizeRelationshipArcStateView(source.current_relationship_state || source.currentRelationshipState),
            promptInjectionFull: toTrimmedString(source.prompt_injection_full || source.promptInjectionFull),
            revisionNotes: Array.isArray(source.revision_notes || source.revisionNotes)
                ? (source.revision_notes || source.revisionNotes).map(toTrimmedString).filter(Boolean)
                : [],
            metadata: source.metadata && typeof source.metadata === 'object' ? source.metadata : {}
        };
    }

    function createEmptyRelationshipArcView() {
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

    function normalizeRelationshipArcView(view) {
        const source = view && typeof view === 'object' ? view : {};
        const empty = createEmptyRelationshipArcView();
        const versions = Array.isArray(source.versions)
            ? source.versions.map(normalizeRelationshipArcRecordView).filter(Boolean)
            : [];
        const current = normalizeRelationshipArcRecordView(source.current)
            || versions.find(function findCurrent(item) {
                return !!item && item.isCurrent;
            })
            || versions[0]
            || null;

        return {
            current: current,
            versions: versions,
            promptPreview: toTrimmedString(source.promptPreview || source.prompt_preview || (current && current.promptInjectionFull)),
            promptBlock: toTrimmedString(source.promptBlock || source.prompt_block),
            isEmpty: source.isEmpty === true || !current,
            emptyReason: toTrimmedString(source.emptyReason || source.empty_reason),
            importHint: toTrimmedString(source.importHint || source.import_hint),
            stats: {
                stageCount: Math.max(0, Math.floor(Number(source.stats && source.stats.stageCount !== undefined ? source.stats.stageCount : (current && current.stages.length) || empty.stats.stageCount) || 0)),
                versionCount: Math.max(0, Math.floor(Number(source.stats && source.stats.versionCount !== undefined ? source.stats.versionCount : versions.length || empty.stats.versionCount) || 0))
            }
        };
    }

    function getRelationshipArcData() {
        return normalizeRelationshipArcView(
            state.data && state.data.relationship && typeof state.data.relationship === 'object'
                ? state.data.relationship
                : null
        );
    }

    function findRelationshipArcVersionById(versions, versionId) {
        const safeVersionId = toTrimmedString(versionId);
        if (!safeVersionId) return null;
        return (Array.isArray(versions) ? versions : []).find(function findVersion(item) {
            return toTrimmedString(item && item.id) === safeVersionId || toTrimmedString(item && item.versionId) === safeVersionId;
        }) || null;
    }

    function normalizeNotebookSelectionKind(kind) {
        const safeKind = toTrimmedString(kind);
        return ['redline', 'mustRemember', 'profile'].includes(safeKind) ? safeKind : '';
    }

    function getNotebookSelectionIds(kind) {
        const safeKind = normalizeNotebookSelectionKind(kind);
        if (!safeKind) return [];

        const source = state.notebookSelection && typeof state.notebookSelection === 'object'
            ? state.notebookSelection[safeKind]
            : [];
        return Array.isArray(source)
            ? source.map(toTrimmedString).filter(Boolean)
            : [];
    }

    function setNotebookSelectionIds(kind, ids) {
        const safeKind = normalizeNotebookSelectionKind(kind);
        if (!safeKind) return [];

        const normalized = [];
        const seen = new Set();
        const source = Array.isArray(ids) ? ids : [];
        for (let i = 0; i < source.length; i += 1) {
            const id = toTrimmedString(source[i]);
            if (!id || seen.has(id)) continue;
            seen.add(id);
            normalized.push(id);
        }

        if (!state.notebookSelection || typeof state.notebookSelection !== 'object') {
            resetNotebookSelectionState();
        }
        state.notebookSelection[safeKind] = normalized;
        return normalized;
    }

    function isNotebookItemSelected(kind, itemId) {
        const safeItemId = toTrimmedString(itemId);
        if (!safeItemId) return false;
        return getNotebookSelectionIds(kind).includes(safeItemId);
    }

    function toggleNotebookItemSelection(kind, itemId) {
        const safeKind = normalizeNotebookSelectionKind(kind);
        const safeItemId = toTrimmedString(itemId);
        if (!safeKind || !safeItemId) return [];

        const current = getNotebookSelectionIds(safeKind);
        if (current.includes(safeItemId)) {
            return setNotebookSelectionIds(safeKind, current.filter(function filterId(id) {
                return id !== safeItemId;
            }));
        }
        return setNotebookSelectionIds(safeKind, current.concat(safeItemId));
    }

    function clearNotebookItemSelection(kind) {
        return setNotebookSelectionIds(kind, []);
    }

    function collectNotebookSelectableItems(kind, notebookInput) {
        const safeKind = normalizeNotebookSelectionKind(kind);
        const notebook = notebookInput && typeof notebookInput === 'object' ? notebookInput : getNotebookData();
        if (!safeKind) return [];

        if (safeKind === 'redline') {
            const merged = []
                .concat(Array.isArray(notebook.pendingRedlines) ? notebook.pendingRedlines : [])
                .concat(Array.isArray(notebook.redlines) ? notebook.redlines : []);
            const seen = new Set();
            return merged.filter(function keepItem(item) {
                const id = toTrimmedString(item && item.id);
                if (!id || seen.has(id)) return false;
                seen.add(id);
                return true;
            });
        }
        if (safeKind === 'mustRemember') {
            return Array.isArray(notebook.mustRemember) ? notebook.mustRemember.filter(Boolean) : [];
        }
        if (safeKind === 'profile') {
            return Array.isArray(notebook.profiles)
                ? notebook.profiles.filter(function filterProfile(item) {
                    return item && isNotebookProfileCategoryVisible(item.category);
                })
                : [];
        }
        return [];
    }

    function selectAllNotebookItems(kind, items) {
        const safeKind = normalizeNotebookSelectionKind(kind);
        if (!safeKind) return [];
        const ids = (Array.isArray(items) ? items : []).map(function mapId(item) {
            return toTrimmedString(item && item.id);
        }).filter(Boolean);
        return setNotebookSelectionIds(safeKind, ids);
    }

    function pruneNotebookSelectionState(notebookInput) {
        const notebook = notebookInput && typeof notebookInput === 'object' ? notebookInput : getNotebookData();
        ['redline', 'mustRemember', 'profile'].forEach(function pruneKind(kind) {
            const validIds = new Set(collectNotebookSelectableItems(kind, notebook).map(function mapId(item) {
                return toTrimmedString(item && item.id);
            }).filter(Boolean));
            const current = getNotebookSelectionIds(kind);
            setNotebookSelectionIds(kind, current.filter(function keepId(id) {
                return validIds.has(id);
            }));
        });
    }

    function getNotebookBatchActionLabel(kind) {
        const safeKind = normalizeNotebookSelectionKind(kind);
        if (safeKind === 'redline') return '撤销选中';
        return '删除选中';
    }

    function getNotebookBatchActionDoneText(kind) {
        const safeKind = normalizeNotebookSelectionKind(kind);
        if (safeKind === 'redline') return '撤销';
        return '删除';
    }

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
            charLength: Math.max(0, Math.floor(Number(source.charLength !== undefined ? source.charLength : text.length) || text.length)),
            lineCount: Math.max(0, Math.floor(Number(source.lineCount !== undefined ? source.lineCount : (text ? text.split(/\r?\n/).length : 0)) || 0)),
            isEmpty: source.isEmpty === true || !text,
            generatedAt: toTrimmedString(source.generatedAt || source.generated_at),
            counts: {
                statuses: Math.max(0, Math.floor(Number(counts.statuses) || 0)),
                profiles: Math.max(0, Math.floor(Number(counts.profiles) || 0)),
                mustRemember: Math.max(0, Math.floor(Number(counts.mustRemember) || 0)),
                redlines: Math.max(0, Math.floor(Number(counts.redlines) || 0))
            },
            sectionCounts: {
                criticalRedlines: Math.max(0, Math.floor(Number(sectionCounts.criticalRedlines) || 0)),
                importantRedlines: Math.max(0, Math.floor(Number(sectionCounts.importantRedlines) || 0)),
                reminderRedlines: Math.max(0, Math.floor(Number(sectionCounts.reminderRedlines) || 0)),
                mustRemember: Math.max(0, Math.floor(Number(sectionCounts.mustRemember) || 0)),
                profiles: Math.max(0, Math.floor(Number(sectionCounts.profiles) || 0))
            }
        };
    }

    function cloneNotebookPromptPreview(preview) {
        const normalized = normalizeNotebookPromptPreview(preview);
        return {
            text: normalized.text,
            preview: normalized.preview,
            checksum: normalized.checksum,
            charLength: normalized.charLength,
            lineCount: normalized.lineCount,
            isEmpty: normalized.isEmpty,
            generatedAt: normalized.generatedAt,
            counts: Object.assign({}, normalized.counts),
            sectionCounts: Object.assign({}, normalized.sectionCounts)
        };
    }

    function normalizeNotebookCleanupBucket(bucket) {
        const source = bucket && typeof bucket === 'object' ? bucket : {};
        const empty = createEmptyNotebookCleanupBucket();
        const reasonCounts = source.reasonCounts && typeof source.reasonCounts === 'object' ? source.reasonCounts : {};
        const keptIds = Array.isArray(source.keptIds)
            ? source.keptIds.map(toTrimmedString).filter(Boolean)
            : [];
        const suppressedIds = Array.isArray(source.suppressedIds)
            ? source.suppressedIds.map(toTrimmedString).filter(Boolean)
            : [];
        const suppressedItems = Array.isArray(source.suppressedItems)
            ? source.suppressedItems.map(function mapSuppressedItem(item) {
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
            }).filter(function keepSuppressedItem(item) {
                return !!(item.id || item.content);
            })
            : [];

        return {
            totalCount: Math.max(0, Math.floor(Number(source.totalCount) || 0)),
            keptCount: Math.max(0, Math.floor(Number(source.keptCount) || 0)),
            suppressedCount: Math.max(0, Math.floor(Number(source.suppressedCount) || 0)),
            keptIds: keptIds,
            suppressedIds: suppressedIds,
            suppressedItems: suppressedItems,
            reasonCounts: {
                low_value: Math.max(0, Math.floor(Number(reasonCounts.low_value) || empty.reasonCounts.low_value)),
                duplicate: Math.max(0, Math.floor(Number(reasonCounts.duplicate) || empty.reasonCounts.duplicate)),
                pending_confirmation: Math.max(0, Math.floor(Number(reasonCounts.pending_confirmation) || empty.reasonCounts.pending_confirmation))
            }
        };
    }

    function normalizeNotebookCleanupPreview(preview) {
        const source = preview && typeof preview === 'object' ? preview : {};
        const empty = createEmptyNotebookCleanupPreview();
        const byKind = source.byKind && typeof source.byKind === 'object' ? source.byKind : {};
        return {
            generatedAt: toTrimmedString(source.generatedAt || source.generated_at) || empty.generatedAt,
            totalCount: Math.max(0, Math.floor(Number(source.totalCount) || empty.totalCount)),
            keptCount: Math.max(0, Math.floor(Number(source.keptCount) || empty.keptCount)),
            suppressedCount: Math.max(0, Math.floor(Number(source.suppressedCount) || empty.suppressedCount)),
            byKind: {
                redline: normalizeNotebookCleanupBucket(byKind.redline),
                mustRemember: normalizeNotebookCleanupBucket(byKind.mustRemember),
                profile: normalizeNotebookCleanupBucket(byKind.profile)
            }
        };
    }

    function getCurrentNotebookPromptPreview() {
        return normalizeNotebookPromptPreview(getNotebookData().promptPreview);
    }

    function getNotebookCleanupPreview() {
        return normalizeNotebookCleanupPreview(getNotebookData().cleanupPreview);
    }

    function getNotebookCleanupBucket(kind, previewInput) {
        const safeKind = normalizeNotebookSelectionKind(kind);
        if (!safeKind) return createEmptyNotebookCleanupBucket();
        const preview = previewInput && typeof previewInput === 'object'
            ? normalizeNotebookCleanupPreview(previewInput)
            : getNotebookCleanupPreview();
        return preview.byKind && preview.byKind[safeKind]
            ? preview.byKind[safeKind]
            : createEmptyNotebookCleanupBucket();
    }

    function getNotebookSuppressedItems(kind, previewInput) {
        return getNotebookCleanupBucket(kind, previewInput).suppressedItems.slice();
    }

    function getNotebookSuppressedIds(kind, previewInput) {
        const bucket = getNotebookCleanupBucket(kind, previewInput);
        const seen = new Set();
        const result = [];
        bucket.suppressedIds.concat(bucket.suppressedItems.map(function mapId(item) {
            return toTrimmedString(item && item.id);
        })).forEach(function appendId(itemId) {
            const safeItemId = toTrimmedString(itemId);
            if (!safeItemId || seen.has(safeItemId)) return;
            seen.add(safeItemId);
            result.push(safeItemId);
        });
        return result;
    }

    function getNotebookCleanupKindLabel(kind) {
        const safeKind = normalizeNotebookSelectionKind(kind);
        if (safeKind === 'redline') return '红线';
        if (safeKind === 'mustRemember') return '必记';
        if (safeKind === 'profile') return '档案';
        return '条目';
    }

    function getNotebookCleanupReasonLabel(reason) {
        const value = toTrimmedString(reason).toLowerCase();
        if (value === 'duplicate') return '重复';
        if (value === 'pending_confirmation') return '待确认';
        return '低价值';
    }

    function buildNotebookRedlineLists(notebookInput) {
        const notebook = notebookInput && typeof notebookInput === 'object' ? notebookInput : getNotebookData();
        const pendingRedlines = Array.isArray(notebook.pendingRedlines) ? notebook.pendingRedlines.slice() : [];
        const confirmedRedlines = Array.isArray(notebook.redlines)
            ? notebook.redlines.filter(function filterConfirmed(item) {
                const itemId = toTrimmedString(item && item.id);
                return !pendingRedlines.some(function matchPending(pendingItem) {
                    return toTrimmedString(pendingItem && pendingItem.id) === itemId;
                });
            })
            : [];
        return {
            pendingRedlines: pendingRedlines,
            confirmedRedlines: confirmedRedlines,
            redlineItems: pendingRedlines.concat(confirmedRedlines)
        };
    }

    function getNotebookSectionItemMap(notebookInput) {
        const notebook = notebookInput && typeof notebookInput === 'object' ? notebookInput : getNotebookData();
        const redlineLists = buildNotebookRedlineLists(notebook);
        return {
            redline: redlineLists.redlineItems,
            mustRemember: Array.isArray(notebook.mustRemember) ? notebook.mustRemember.slice() : [],
            profile: Array.isArray(notebook.profiles) ? notebook.profiles.filter(function filterProfile(item) {
                return item && isNotebookProfileCategoryVisible(item.category);
            }) : []
        };
    }

    function normalizeNotebookViewMode(mode) {
        const value = toTrimmedString(mode).toLowerCase();
        const allowed = ['all', 'injectable', 'suppressed', 'low_value', 'duplicate', 'pending_confirmation'];
        return allowed.includes(value) ? value : 'all';
    }

    function getNotebookViewMode() {
        return normalizeNotebookViewMode(state.notebookView && state.notebookView.mode);
    }

    function setNotebookViewMode(mode) {
        if (!state.notebookView || typeof state.notebookView !== 'object') {
            state.notebookView = { mode: 'all' };
        }
        state.notebookView.mode = normalizeNotebookViewMode(mode);
    }

    function getNotebookViewModeLabel(mode) {
        const safeMode = normalizeNotebookViewMode(mode);
        if (safeMode === 'injectable') return '只看会进主聊天';
        if (safeMode === 'suppressed') return '只看进不了主聊天';
        if (safeMode === 'low_value') return '只看低价值';
        if (safeMode === 'duplicate') return '只看重复';
        if (safeMode === 'pending_confirmation') return '只看待确认';
        return '全部';
    }

    function matchesNotebookViewMode(kind, item, mode, previewInput) {
        const safeKind = normalizeNotebookSelectionKind(kind);
        const safeMode = normalizeNotebookViewMode(mode);
        const itemId = toTrimmedString(item && item.id);
        const suppressed = safeKind && itemId ? getNotebookSuppressedMeta(safeKind, itemId, previewInput) : null;
        const reason = toTrimmedString(suppressed && suppressed.reason).toLowerCase();

        if (safeMode === 'all') return true;
        if (safeMode === 'injectable') return !suppressed;
        if (safeMode === 'suppressed') return !!suppressed;
        if (safeMode === 'low_value' || safeMode === 'duplicate' || safeMode === 'pending_confirmation') {
            return !!suppressed && reason === safeMode;
        }
        return true;
    }

    function filterNotebookItemsByMode(kind, items, mode, previewInput) {
        const safeItems = Array.isArray(items) ? items.filter(Boolean) : [];
        return safeItems.filter(function filterItem(item) {
            return matchesNotebookViewMode(kind, item, mode, previewInput);
        });
    }

    function buildNotebookViewSummary(sectionItems, mode, previewInput) {
        const sections = sectionItems && typeof sectionItems === 'object' ? sectionItems : getNotebookSectionItemMap();
        const preview = previewInput && typeof previewInput === 'object'
            ? normalizeNotebookCleanupPreview(previewInput)
            : getNotebookCleanupPreview();
        const safeMode = normalizeNotebookViewMode(mode);
        const summary = {
            total: 0,
            selected: 0,
            visibleTotal: 0,
            visibleSuppressed: 0,
            modeCounts: {
                all: 0,
                injectable: 0,
                suppressed: 0,
                low_value: 0,
                duplicate: 0,
                pending_confirmation: 0
            }
        };

        ['redline', 'mustRemember', 'profile'].forEach(function eachKind(kind) {
            const items = Array.isArray(sections[kind]) ? sections[kind] : [];
            items.forEach(function countItem(item) {
                const itemId = toTrimmedString(item && item.id);
                const suppressed = itemId ? getNotebookSuppressedMeta(kind, itemId, preview) : null;
                const reason = toTrimmedString(suppressed && suppressed.reason).toLowerCase();
                summary.total += 1;
                summary.modeCounts.all += 1;
                if (isNotebookItemSelected(kind, itemId)) {
                    summary.selected += 1;
                }
                if (suppressed) {
                    summary.modeCounts.suppressed += 1;
                    if (reason === 'duplicate') {
                        summary.modeCounts.duplicate += 1;
                    } else if (reason === 'pending_confirmation') {
                        summary.modeCounts.pending_confirmation += 1;
                    } else {
                        summary.modeCounts.low_value += 1;
                    }
                } else {
                    summary.modeCounts.injectable += 1;
                }
                if (matchesNotebookViewMode(kind, item, safeMode, preview)) {
                    summary.visibleTotal += 1;
                    if (suppressed) {
                        summary.visibleSuppressed += 1;
                    }
                }
            });
        });

        return summary;
    }

    function collectNotebookGroupsByMode(mode, options) {
        const safeMode = normalizeNotebookViewMode(mode);
        const safeOptions = options && typeof options === 'object' ? options : {};
        const notebook = safeOptions.notebook && typeof safeOptions.notebook === 'object'
            ? safeOptions.notebook
            : getNotebookData();
        const preview = safeOptions.preview && typeof safeOptions.preview === 'object'
            ? normalizeNotebookCleanupPreview(safeOptions.preview)
            : getNotebookCleanupPreview();
        const sections = safeOptions.sections && typeof safeOptions.sections === 'object'
            ? safeOptions.sections
            : getNotebookSectionItemMap(notebook);
        const suppressedOnly = safeOptions.suppressedOnly === true;

        return ['redline', 'mustRemember', 'profile'].map(function mapKind(kind) {
            const visibleItems = filterNotebookItemsByMode(kind, sections[kind], safeMode, preview);
            const filteredItems = suppressedOnly
                ? visibleItems.filter(function keepSuppressed(item) {
                    return !!getNotebookSuppressedMeta(kind, toTrimmedString(item && item.id), preview);
                })
                : visibleItems;
            const ids = filteredItems.map(function mapId(item) {
                return toTrimmedString(item && item.id);
            }).filter(Boolean);
            return {
                kind: kind,
                ids: ids,
                records: collectNotebookBatchRecords(kind, ids)
            };
        }).filter(function keepGroup(group) {
            return group.records.length > 0;
        });
    }

    function selectNotebookItemsByMode(mode, notebookInput, previewInput) {
        const notebook = notebookInput && typeof notebookInput === 'object' ? notebookInput : getNotebookData();
        const preview = previewInput && typeof previewInput === 'object'
            ? normalizeNotebookCleanupPreview(previewInput)
            : getNotebookCleanupPreview();
        const sections = getNotebookSectionItemMap(notebook);
        let totalCount = 0;

        ['redline', 'mustRemember', 'profile'].forEach(function eachKind(kind) {
            const ids = filterNotebookItemsByMode(kind, sections[kind], mode, preview).map(function mapId(item) {
                return toTrimmedString(item && item.id);
            }).filter(Boolean);
            totalCount += ids.length;
            setNotebookSelectionIds(kind, getNotebookSelectionIds(kind).concat(ids));
        });

        return totalCount;
    }

    function clearAllNotebookItemSelections() {
        ['redline', 'mustRemember', 'profile'].forEach(function eachKind(kind) {
            clearNotebookItemSelection(kind);
        });
    }

    function getNotebookSuppressedMeta(kind, itemId, previewInput) {
        const safeItemId = toTrimmedString(itemId);
        if (!safeItemId) return null;
        return getNotebookSuppressedItems(kind, previewInput).find(function findSuppressedItem(item) {
            return toTrimmedString(item && item.id) === safeItemId;
        }) || null;
    }

    function renderNotebookSuppressedBadge(kind, itemId, previewInput) {
        const suppressed = getNotebookSuppressedMeta(kind, itemId, previewInput);
        if (!suppressed) return '';
        return renderNotebookBadge(
            `不会注入·${getNotebookCleanupReasonLabel(suppressed.reason)}`,
            '#fecdd3',
            suppressed.reason === 'pending_confirmation'
                ? 'rgba(245, 158, 11, 0.18)'
                : 'rgba(244, 114, 182, 0.16)'
        );
    }

    function renderNotebookSuppressedHint(kind, itemId, previewInput) {
        const suppressed = getNotebookSuppressedMeta(kind, itemId, previewInput);
        if (!suppressed) return '';

        let text = '';
        if (suppressed.reason === 'duplicate') {
            text = '这条内容当前不会注入，因为它和另一条同类条目重复。';
            if (suppressed.duplicateOf) {
                const duplicateSource = findNotebookRecord(kind, suppressed.duplicateOf);
                const duplicateSummary = summarizeContent(toTrimmedString(duplicateSource && duplicateSource.content), 28);
                if (duplicateSummary) {
                    text += ` 当前保留的是：${duplicateSummary}`;
                }
            }
        } else if (suppressed.reason === 'pending_confirmation') {
            text = '这条红线当前不会注入，因为它还处于待确认状态。';
        } else {
            text = '这条内容当前不会注入，因为记事本规则判断它偏低价值、过于琐碎，或不够稳定。';
        }

        return `<div class="hip-box-hint" style="margin-top:10px;">${escapeHtml(text)}</div>`;
    }

    function selectNotebookSuppressedItems(kind, previewInput) {
        const safeKind = normalizeNotebookSelectionKind(kind);
        if (!safeKind) return [];
        const nextIds = getNotebookSelectionIds(safeKind).concat(getNotebookSuppressedIds(safeKind, previewInput));
        return setNotebookSelectionIds(safeKind, nextIds);
    }

    function selectAllNotebookSuppressedItems(previewInput) {
        const preview = previewInput && typeof previewInput === 'object'
            ? normalizeNotebookCleanupPreview(previewInput)
            : getNotebookCleanupPreview();
        let totalCount = 0;
        ['redline', 'mustRemember', 'profile'].forEach(function appendKind(kind) {
            const ids = getNotebookSuppressedIds(kind, preview);
            totalCount += ids.length;
            setNotebookSelectionIds(kind, getNotebookSelectionIds(kind).concat(ids));
        });
        return totalCount;
    }

    function collectNotebookPromptDiffLines(beforeText, afterText, limit) {
        const maxLines = Math.max(1, Math.floor(Number(limit) || 6));
        const before = toTrimmedString(beforeText).split(/\r?\n/).map(toTrimmedString).filter(Boolean);
        const after = toTrimmedString(afterText).split(/\r?\n/).map(toTrimmedString).filter(Boolean);
        const beforeSet = new Set(before);
        const afterSet = new Set(after);

        return {
            added: after.filter(function filterAdded(line) {
                return !beforeSet.has(line);
            }).slice(0, maxLines),
            removed: before.filter(function filterRemoved(line) {
                return !afterSet.has(line);
            }).slice(0, maxLines)
        };
    }

    function buildNotebookPromptDiffSummary(previousPreview, currentPreview, charId) {
        const previous = normalizeNotebookPromptPreview(previousPreview);
        const current = normalizeNotebookPromptPreview(currentPreview);
        const label = getContactLabel(charId);
        const countDiffs = [];

        [
            ['redlines', '红线'],
            ['mustRemember', '必记'],
            ['profiles', '档案']
        ].forEach(function compareCount(entry) {
            const key = entry[0];
            const title = entry[1];
            const beforeCount = Number(previous.counts[key] || 0);
            const afterCount = Number(current.counts[key] || 0);
            if (beforeCount !== afterCount) {
                countDiffs.push(`${title}: ${beforeCount} -> ${afterCount}`);
            }
        });

        const lineDiff = collectNotebookPromptDiffLines(previous.text, current.text, 8);
        if (previous.checksum && current.checksum && previous.checksum === current.checksum) {
            return {
                summary: '记事本注入块没有变化',
                toastType: 'info',
                text: [
                    `角色：${label}`,
                    '结果：和上次记住的样子完全一致。',
                    `内容指纹：${current.checksum}`,
                    `当前大小：${current.charLength} 字 / ${current.lineCount} 行`
                ].join('\n')
            };
        }

        const lines = [
            `角色：${label}`,
            `旧底稿：${previous.charLength} 字 / ${previous.lineCount} 行 / ${previous.checksum || 'none'}`,
            `现在：${current.charLength} 字 / ${current.lineCount} 行 / ${current.checksum || 'none'}`
        ];

        if (countDiffs.length > 0) {
            lines.push('');
            lines.push('数量变化：');
            countDiffs.forEach(function appendCount(line) {
                lines.push(`- ${line}`);
            });
        }

        if (lineDiff.added.length > 0) {
            lines.push('');
            lines.push('新增内容：');
            lineDiff.added.forEach(function appendAdded(line) {
                lines.push(`- ${line}`);
            });
        }

        if (lineDiff.removed.length > 0) {
            lines.push('');
            lines.push('移除内容：');
            lineDiff.removed.forEach(function appendRemoved(line) {
                lines.push(`- ${line}`);
            });
        }

        if (current.preview) {
            lines.push('');
            lines.push('当前预览：');
            lines.push(current.preview);
        }

        return {
            summary: countDiffs.length > 0
                ? `发现 ${countDiffs.length} 处记事本注入变化`
                : '记事本注入块文本已变化',
            toastType: current.isEmpty ? 'info' : 'success',
            text: lines.join('\n')
        };
    }

    function handleRememberNotebookPromptPreview() {
        const charId = toTrimmedString(state.filters.charId);
        if (!charId) {
            showToastSafe('请先选择一个角色，再记住当前记事本的样子。', 'info');
            return;
        }

        const helper = getNotebookPromptHelperState();
        helper.trackedCharId = charId;
        helper.snapshot = cloneNotebookPromptPreview(getCurrentNotebookPromptPreview());
        helper.lastReport = null;
        renderLayout();
        showToastSafe(`已记住 ${getContactLabel(charId)} 当前记事本的样子`, 'success');
    }

    function handleCheckNotebookPromptPreview() {
        const helper = getNotebookPromptHelperState();
        const charId = toTrimmedString(state.filters.charId);
        if (!charId || !helper.snapshot || helper.trackedCharId !== charId) {
            showToastSafe('先点一下“记住当前样子”，再检查这次记事本有没有变化。', 'info');
            return;
        }

        const report = buildNotebookPromptDiffSummary(helper.snapshot, getCurrentNotebookPromptPreview(), charId);
        helper.lastReport = report;
        renderLayout();
        showAlertSafe('记事本注入对比', report.text);
        showToastSafe(report.summary, report.toastType);
    }

    async function handleCopyNotebookPromptPreview() {
        const preview = getCurrentNotebookPromptPreview();
        const text = toTrimmedString(preview.text);
        if (!text) {
            showToastSafe('当前没有可复制的记事本内容。', 'info');
            return;
        }

        try {
            if (root && root.navigator && root.navigator.clipboard && typeof root.navigator.clipboard.writeText === 'function') {
                await root.navigator.clipboard.writeText(text);
                showToastSafe(`已复制记事本预览（${preview.charLength} 字）`, 'success');
                return;
            }
        } catch (_) {
            // 继续走 textarea 兜底。
        }

        const documentRef = root && root.document ? root.document : null;
        if (!documentRef || !documentRef.body) {
            showToastSafe('当前浏览器不支持自动复制。', 'error');
            return;
        }

        const textarea = documentRef.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', 'readonly');
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        textarea.style.top = '0';
        documentRef.body.appendChild(textarea);
        textarea.select();
        try {
            const copied = documentRef.execCommand && documentRef.execCommand('copy');
            showToastSafe(copied ? `已复制记事本预览（${preview.charLength} 字）` : '复制失败，请手动复制。', copied ? 'success' : 'error');
        } catch (_) {
            showToastSafe('复制失败，请手动复制。', 'error');
        } finally {
            documentRef.body.removeChild(textarea);
        }
    }

    function handleClearNotebookPromptPreview() {
        const helper = getNotebookPromptHelperState();
        const charId = toTrimmedString(helper.trackedCharId);
        if (!charId && !helper.snapshot) return;

        resetNotebookPromptHelperState();
        renderLayout();
        showToastSafe(`已忘掉 ${charId ? getContactLabel(charId) : '当前角色'} 之前记住的旧底稿`, 'info');
    }

    function createEmptyNotebookLearningProfileView() {
        return {
            updatedAt: '',
            summaryLines: [],
            focusLines: [],
            totals: {
                feedbackCount: 0,
                positiveCount: 0,
                negativeCount: 0,
                deleteCount: 0,
                batchDeleteCount: 0,
                manualAddCount: 0,
                editCount: 0,
                confirmCount: 0
            },
            rules: {
                confidence: 'low',
                evidenceCount: 0
            }
        };
    }

    function normalizeNotebookLearningProfileView(profile) {
        const source = profile && typeof profile === 'object' ? profile : {};
        const empty = createEmptyNotebookLearningProfileView();
        const totals = source.totals && typeof source.totals === 'object' ? source.totals : {};
        const rules = source.rules && typeof source.rules === 'object' ? source.rules : {};
        return {
            updatedAt: toTrimmedString(source.updatedAt || source.updated_at),
            summaryLines: Array.isArray(source.summaryLines)
                ? source.summaryLines.map(toTrimmedString).filter(Boolean)
                : [],
            focusLines: Array.isArray(source.focusLines)
                ? source.focusLines.map(toTrimmedString).filter(Boolean)
                : [],
            totals: {
                feedbackCount: Math.max(0, Math.floor(Number(totals.feedbackCount) || empty.totals.feedbackCount)),
                positiveCount: Math.max(0, Math.floor(Number(totals.positiveCount) || empty.totals.positiveCount)),
                negativeCount: Math.max(0, Math.floor(Number(totals.negativeCount) || empty.totals.negativeCount)),
                deleteCount: Math.max(0, Math.floor(Number(totals.deleteCount) || empty.totals.deleteCount)),
                batchDeleteCount: Math.max(0, Math.floor(Number(totals.batchDeleteCount) || empty.totals.batchDeleteCount)),
                manualAddCount: Math.max(0, Math.floor(Number(totals.manualAddCount) || empty.totals.manualAddCount)),
                editCount: Math.max(0, Math.floor(Number(totals.editCount) || empty.totals.editCount)),
                confirmCount: Math.max(0, Math.floor(Number(totals.confirmCount) || empty.totals.confirmCount))
            },
            rules: {
                confidence: toTrimmedString(rules.confidence) || empty.rules.confidence,
                evidenceCount: Math.max(0, Math.floor(Number(rules.evidenceCount) || empty.rules.evidenceCount))
            }
        };
    }

    function getNotebookLearningConfidenceLabel(confidence) {
        const value = toTrimmedString(confidence).toLowerCase();
        if (value === 'high') return '高';
        if (value === 'medium') return '中';
        return '低';
    }

    function renderNotebookLearningPanel(notebook) {
        const profile = normalizeNotebookLearningProfileView(notebook && notebook.learningProfile);
        const hasFeedback = profile.totals.feedbackCount > 0 || profile.summaryLines.length > 0 || profile.focusLines.length > 0;
        const badges = [
            renderNotebookBadge(`反馈 ${profile.totals.feedbackCount}`, '#e5e7eb', 'rgba(255,255,255,0.08)'),
            renderNotebookBadge(`正反馈 ${profile.totals.positiveCount}`, '#bbf7d0', 'rgba(34,197,94,0.14)'),
            renderNotebookBadge(`负反馈 ${profile.totals.negativeCount}`, '#fecdd3', 'rgba(244,114,182,0.16)'),
            renderNotebookBadge(`置信 ${getNotebookLearningConfidenceLabel(profile.rules.confidence)}`, '#bfdbfe', 'rgba(96,165,250,0.14)')
        ];
        if (profile.totals.batchDeleteCount > 0) {
            badges.push(renderNotebookBadge(`批量删除 ${profile.totals.batchDeleteCount}`, '#fde68a', 'rgba(245,158,11,0.16)'));
        }
        if (profile.totals.confirmCount > 0) {
            badges.push(renderNotebookBadge(`确认红线 ${profile.totals.confirmCount}`, '#fdba74', 'rgba(249,115,22,0.16)'));
        }

        return `
            <section class="hip-glass-panel" style="padding:18px 20px;margin-bottom:18px;">
                <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;">
                    <div style="flex:1;min-width:240px;">
                        <div style="font-size:16px;font-weight:600;">🧭 记事本反馈学习</div>
                        <div style="font-size:13px;color:rgba(255,255,255,0.62);line-height:1.7;margin-top:8px;">
                            它只会记住你通过删改记事本表达出来的抽象偏好，不会保存原聊天句子，也不会把私人样本塞回主聊天背景。
                        </div>
                    </div>
                    <div style="display:flex;gap:8px;flex-wrap:wrap;">
                        <button type="button" class="hip-btn-danger hip-btn-inline" data-hip-action="reset-notebook-learning" ${hasFeedback ? '' : 'disabled'}>重置学习画像</button>
                    </div>
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:14px;">${badges.join('')}</div>
                <div style="margin-top:14px;padding:14px 16px;border-radius:16px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);">
                    <div style="font-size:13px;font-weight:600;color:rgba(255,255,255,0.92);">最近真正学到的东西</div>
                    ${profile.focusLines.length > 0
                        ? `<div style="margin-top:10px;font-size:13px;color:rgba(255,255,255,0.82);line-height:1.8;">${profile.focusLines.map(function mapLine(line) {
                            return `- ${escapeHtml(line)}`;
                        }).join('<br>')}</div>`
                        : `<div class="hip-box-hint" style="margin-top:12px;">当前还没积累出足够强的明确偏好，继续删改几轮后这里会开始收敛。</div>`}
                </div>
                <div style="margin-top:14px;padding:14px 16px;border-radius:16px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);">
                    <div style="font-size:13px;font-weight:600;color:rgba(255,255,255,0.92);">当前抽象规则</div>
                    ${profile.summaryLines.length > 0
                        ? `<div style="margin-top:10px;font-size:13px;color:rgba(255,255,255,0.74);line-height:1.8;">${profile.summaryLines.map(function mapLine(line) {
                            return `- ${escapeHtml(line)}`;
                        }).join('<br>')}</div>`
                        : `<div class="hip-box-hint" style="margin-top:12px;">当前还没有足够反馈形成稳定偏好。你在这里手动删除、编辑、确认后，它才会逐渐学会什么该记、什么别记。</div>`}
                    <div style="margin-top:12px;font-size:12px;color:rgba(255,255,255,0.5);">
                        ${profile.updatedAt ? `最近更新：${escapeHtml(formatDateTime(profile.updatedAt) || profile.updatedAt)}` : '最近更新：暂无'}
                    </div>
                </div>
            </section>
        `;
    }

    function getNotebookLearningConfidenceLabel(confidence) {
        const value = toTrimmedString(confidence).toLowerCase();
        if (value === 'high') return '高';
        if (value === 'medium') return '中';
        return '低';
    }

    function renderNotebookLearningPanel(notebook) {
        const profile = normalizeNotebookLearningProfileView(notebook && notebook.learningProfile);
        const hasFeedback = profile.totals.feedbackCount > 0 || profile.summaryLines.length > 0 || profile.focusLines.length > 0;
        const badges = [
            renderNotebookBadge(`反馈 ${profile.totals.feedbackCount}`, '#e5e7eb', 'rgba(255,255,255,0.08)'),
            renderNotebookBadge(`正反馈 ${profile.totals.positiveCount}`, '#bbf7d0', 'rgba(34,197,94,0.14)'),
            renderNotebookBadge(`负反馈 ${profile.totals.negativeCount}`, '#fecdd3', 'rgba(244,114,182,0.16)'),
            renderNotebookBadge(`置信 ${getNotebookLearningConfidenceLabel(profile.rules.confidence)}`, '#bfdbfe', 'rgba(96,165,250,0.14)')
        ];
        if (profile.totals.batchDeleteCount > 0) {
            badges.push(renderNotebookBadge(`批量删除 ${profile.totals.batchDeleteCount}`, '#fde68a', 'rgba(245,158,11,0.16)'));
        }
        if (profile.totals.confirmCount > 0) {
            badges.push(renderNotebookBadge(`确认红线 ${profile.totals.confirmCount}`, '#fdba74', 'rgba(249,115,22,0.16)'));
        }

        return `
            <section class="hip-glass-panel" style="padding:18px 20px;margin-bottom:18px;">
                <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;">
                    <div style="flex:1;min-width:240px;">
                        <div style="font-size:16px;font-weight:600;">记事本反馈学习</div>
                        <div style="font-size:13px;color:rgba(255,255,255,0.62);line-height:1.7;margin-top:8px;">
                            这里只学习你通过删、改、确认记事本条目表达出来的偏好，不会把原始聊天原话当样本塞回系统里。
                        </div>
                    </div>
                    <div style="display:flex;gap:8px;flex-wrap:wrap;">
                        <button type="button" class="hip-btn-danger hip-btn-inline" data-hip-action="reset-notebook-learning" ${hasFeedback ? '' : 'disabled'}>重置学习画像</button>
                    </div>
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:14px;">${badges.join('')}</div>
                <div style="margin-top:14px;padding:14px 16px;border-radius:16px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);">
                    <div style="font-size:13px;font-weight:600;color:rgba(255,255,255,0.92);">最近真正学到的东西</div>
                    ${profile.focusLines.length > 0
                        ? `<div style="margin-top:10px;font-size:13px;color:rgba(255,255,255,0.82);line-height:1.8;">${profile.focusLines.map(function mapLine(line) {
                            return `- ${escapeHtml(line)}`;
                        }).join('<br>')}</div>`
                        : `<div class="hip-box-hint" style="margin-top:12px;">当前还没积累出足够强的明确偏好，继续删改几轮后这里会开始收敛。</div>`}
                </div>
                <div style="margin-top:14px;padding:14px 16px;border-radius:16px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);">
                    <div style="font-size:13px;font-weight:600;color:rgba(255,255,255,0.92);">当前抽象规则</div>
                    ${profile.summaryLines.length > 0
                        ? `<div style="margin-top:10px;font-size:13px;color:rgba(255,255,255,0.74);line-height:1.8;">${profile.summaryLines.map(function mapLine(line) {
                            return `- ${escapeHtml(line)}`;
                        }).join('<br>')}</div>`
                        : `<div class="hip-box-hint" style="margin-top:12px;">当前还没有足够多的反馈去形成稳定规则。</div>`}
                    <div style="margin-top:12px;font-size:12px;color:rgba(255,255,255,0.5);">
                        ${profile.updatedAt ? `最近更新：${escapeHtml(formatDateTime(profile.updatedAt) || profile.updatedAt)}` : '最近更新：暂无'}
                    </div>
                </div>
            </section>
        `;
    }

    function normalizeNotebookRuntimeStatusView(status) {
        const source = status && typeof status === 'object' ? status : {};
        const counts = source.counts && typeof source.counts === 'object' ? source.counts : {};
        const sectionCounts = source.sectionCounts && typeof source.sectionCounts === 'object' ? source.sectionCounts : {};
        const reasonCounts = source.reasonCounts && typeof source.reasonCounts === 'object' ? source.reasonCounts : {};
        return {
            phase: toTrimmedString(source.phase || source.status).toLowerCase() || 'idle',
            enabled: source.enabled === true,
            fetchOk: source.fetchOk === true,
            updatedAt: toTrimmedString(source.updatedAt || source.updated_at),
            source: toTrimmedString(source.source) || 'none',
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
                    0
                ))),
                duplicate: Math.max(0, Math.floor(toFiniteNumber(reasonCounts.duplicate, 0))),
                pendingConfirmation: Math.max(0, Math.floor(toFiniteNumber(
                    reasonCounts.pendingConfirmation !== undefined ? reasonCounts.pendingConfirmation : reasonCounts.pending_confirmation,
                    0
                )))
            },
            counts: {
                redlines: Math.max(0, Math.floor(toFiniteNumber(counts.redlines, 0))),
                mustRemember: Math.max(0, Math.floor(toFiniteNumber(counts.mustRemember, 0))),
                profiles: Math.max(0, Math.floor(toFiniteNumber(counts.profiles, 0))),
                statuses: Math.max(0, Math.floor(toFiniteNumber(counts.statuses, 0)))
            },
            sectionCounts: {
                criticalRedlines: Math.max(0, Math.floor(toFiniteNumber(sectionCounts.criticalRedlines, 0))),
                importantRedlines: Math.max(0, Math.floor(toFiniteNumber(sectionCounts.importantRedlines, 0))),
                reminderRedlines: Math.max(0, Math.floor(toFiniteNumber(sectionCounts.reminderRedlines, 0))),
                mustRemember: Math.max(0, Math.floor(toFiniteNumber(sectionCounts.mustRemember, 0))),
                profiles: Math.max(0, Math.floor(toFiniteNumber(sectionCounts.profiles, 0))),
                activeStatuses: Math.max(0, Math.floor(toFiniteNumber(sectionCounts.activeStatuses, 0))),
                historyStatuses: Math.max(0, Math.floor(toFiniteNumber(sectionCounts.historyStatuses, 0)))
            }
        };
    }

    function getNotebookRuntimePhaseModel(phase) {
        const value = toTrimmedString(phase).toLowerCase();
        if (value === 'injected') {
            return { label: '已注入', color: '#bbf7d0', background: 'rgba(34,197,94,0.14)' };
        }
        if (value === 'empty') {
            return { label: '本轮为空', color: '#fde68a', background: 'rgba(245,158,11,0.16)' };
        }
        if (value === 'fetch_error' || value === 'build_error') {
            return { label: '运行失败', color: '#fecdd3', background: 'rgba(244,63,94,0.16)' };
        }
        if (value === 'runtime_unavailable') {
            return { label: '未接上运行时', color: '#bfdbfe', background: 'rgba(59,130,246,0.14)' };
        }
        if (value === 'disabled') {
            return { label: '角色未启用', color: '#cbd5e1', background: 'rgba(148,163,184,0.14)' };
        }
        return { label: '暂无记录', color: '#e5e7eb', background: 'rgba(255,255,255,0.08)' };
    }

    function getNotebookRuntimeSourceLabel(source) {
        const value = toTrimmedString(source).toLowerCase();
        if (value === 'snapshot') return '标准快照';
        if (value === 'fallback_build') return '本地回退';
        if (value === 'error') return '异常回退';
        return '无';
    }

    function getNotebookRuntimeNoteLabel(note) {
        const value = toTrimmedString(note).toLowerCase();
        if (value === 'stable_sections_injected') return '本轮注入了红线和稳定板块';
        if (value === 'redlines_only') return '本轮只有红线进了主聊天';
        if (value === 'fallback_full_prompt') return '本轮回退成整块主聊天背景文本';
        if (value === 'all_items_suppressed') return '候选条目都有，但清理后全部被挡在主聊天外';
        if (value === 'no_injectable_items') return '当前没有可注入的记事本内容';
        if (value === 'missing_notebook_api') return '前端已加载海马体，但记事本运行接口未就绪';
        if (value === 'notebook_runtime_unavailable') return '当前运行时没有挂上记事本模块';
        if (value === 'hippocampus_disabled') return '角色未启用海马体，所以没有记事本注入';
        if (value === 'user_unavailable') return '本轮拿不到用户身份，跳过了记事本读取';
        if (value === 'runtime_unavailable') return '本轮海马体运行时未就绪';
        if (value === 'prompt_build_failed') return '整轮主聊天组装失败，记事本这里只留下了异常记录';
        if (value === 'notebook_fetch_failed') return '记事本快照拉取失败';
        return toTrimmedString(note);
    }

    function formatNotebookRuntimeReasonSummary(reasonCounts) {
        const safeCounts = reasonCounts && typeof reasonCounts === 'object' ? reasonCounts : {};
        const parts = [];
        if (Math.max(0, Math.floor(toFiniteNumber(safeCounts.duplicate, 0))) > 0) {
            parts.push(`重复 ${Math.max(0, Math.floor(toFiniteNumber(safeCounts.duplicate, 0)))}`);
        }
        if (Math.max(0, Math.floor(toFiniteNumber(safeCounts.lowValue, 0))) > 0) {
            parts.push(`低价值 ${Math.max(0, Math.floor(toFiniteNumber(safeCounts.lowValue, 0)))}`);
        }
        if (Math.max(0, Math.floor(toFiniteNumber(safeCounts.pendingConfirmation, 0))) > 0) {
            parts.push(`待确认 ${Math.max(0, Math.floor(toFiniteNumber(safeCounts.pendingConfirmation, 0)))}`);
        }
        return parts.join('、');
    }

    function buildNotebookRuntimeDetailLines(status, options = {}) {
        const safeStatus = normalizeNotebookRuntimeStatusView(status);
        const safeOptions = options && typeof options === 'object' ? options : {};
        const maxLines = Math.max(1, Math.floor(toFiniteNumber(safeOptions.maxLines, 3)));
        const lines = [];
        const candidateCount = Math.max(
            0,
            Math.floor(toFiniteNumber(safeStatus.candidateCount, safeStatus.keptCount + safeStatus.suppressedCount))
        );
        const reasonSummary = formatNotebookRuntimeReasonSummary(safeStatus.reasonCounts);

        if (candidateCount > 0 && (safeStatus.phase === 'injected' || safeStatus.suppressedCount > 0 || safeStatus.note === 'all_items_suppressed')) {
            lines.push(`候选 ${candidateCount} 条，保留 ${safeStatus.keptCount} 条，挡下 ${safeStatus.suppressedCount} 条。`);
        }

        if (safeStatus.note === 'stable_sections_injected') {
            const injectedSections = [];
            if (safeStatus.hasRedline) injectedSections.push('红线');
            if (safeStatus.hasStable) injectedSections.push('稳定板块');
            if (safeStatus.usedFallbackFullPrompt) injectedSections.push('整块回退');
            if (injectedSections.length > 0) {
                lines.push(`真正进主聊天的内容：${injectedSections.join('、')}。`);
            }
        } else if (safeStatus.note === 'redlines_only') {
            lines.push('这轮只有红线真的进了主聊天，普通记事本条目没有进去。');
        } else if (safeStatus.note === 'fallback_full_prompt') {
            lines.push('稳定板块没能按正常结构拼好，所以临时回退成整块文本。');
        } else if (safeStatus.note === 'all_items_suppressed') {
            lines.push('这轮其实抓到了候选条目，但清理后一个都没留下。');
        } else if (safeStatus.note === 'no_injectable_items') {
            lines.push('这轮快照本身就是空的，所以没有任何条目可注入。');
        } else if (safeStatus.note === 'missing_notebook_api') {
            lines.push('前端海马体已跑起来，但记事本运行接口这轮没接上。');
        } else if (safeStatus.note === 'user_unavailable') {
            lines.push('这轮没拿到当前用户身份，所以记事本没有参与构建。');
        } else if (safeStatus.note === 'runtime_unavailable' || safeStatus.note === 'notebook_runtime_unavailable') {
            lines.push('海马体运行时这轮没准备好，所以直接跳过了记事本。');
        } else if (safeStatus.note === 'notebook_fetch_failed') {
            lines.push('记事本快照没有拉下来，所以这轮没有可靠内容可注入。');
        } else if (safeStatus.note === 'prompt_build_failed') {
            lines.push('整轮主聊天组装失败，记事本这里只留下了异常记录。');
        } else if (safeStatus.note === 'hippocampus_disabled') {
            lines.push('角色没有启用海马体，所以记事本本轮完全没参与。');
        }

        if (reasonSummary && safeStatus.suppressedCount > 0) {
            lines.push(`被挡下的主要原因：${reasonSummary}。`);
        }

        if (
            safeStatus.phase === 'injected'
            && (safeStatus.counts.redlines > 0 || safeStatus.counts.mustRemember > 0 || safeStatus.counts.profiles > 0)
        ) {
            lines.push(`当前快照：红线 ${safeStatus.counts.redlines} / 必记 ${safeStatus.counts.mustRemember} / 档案 ${safeStatus.counts.profiles}。`);
        }

        return lines.filter(Boolean).slice(0, maxLines);
    }

    function normalizeNotebookRuntimeHistoryEntryView(entry) {
        const source = entry && typeof entry === 'object' ? entry : {};
        const base = normalizeNotebookRuntimeStatusView(source);
        return Object.assign({}, base, {
            id: toTrimmedString(source.id),
            firstSeenAt: toTrimmedString(source.firstSeenAt || source.first_seen_at || base.updatedAt),
            lastSeenAt: toTrimmedString(source.lastSeenAt || source.last_seen_at || base.updatedAt),
            repeatCount: Math.max(1, Math.floor(toFiniteNumber(
                source.repeatCount !== undefined ? source.repeatCount : source.repeat_count,
                1
            )))
        });
    }

    function buildNotebookRuntimeHistoryStats(entries) {
        return (Array.isArray(entries) ? entries : []).reduce(function reduceStats(result, item) {
            const phase = toTrimmedString(item && item.phase).toLowerCase();
            result.total += 1;
            if (phase === 'injected') {
                result.injected += 1;
            } else if (phase === 'empty' || phase === 'disabled' || phase === 'runtime_unavailable') {
                result.empty += 1;
            } else if (phase === 'fetch_error' || phase === 'build_error') {
                result.failed += 1;
            } else {
                result.other += 1;
            }
            result.repeats += Math.max(0, Math.floor(toFiniteNumber(item && item.repeatCount, 1)) - 1);
            return result;
        }, {
            total: 0,
            injected: 0,
            empty: 0,
            failed: 0,
            other: 0,
            repeats: 0
        });
    }

    function renderNotebookRuntimeHistoryTimeline(entries) {
        const list = Array.isArray(entries) ? entries.map(normalizeNotebookRuntimeHistoryEntryView).filter(Boolean) : [];
        if (list.length <= 0) {
            return '<div class="hip-box-hint" style="margin-top:12px;">当前还没有跨轮次的记事本运行历史。等角色多走几轮真实主聊天后，这里会慢慢长出时间线。</div>';
        }

        return `
            <div style="margin-top:12px;display:flex;flex-direction:column;gap:10px;">
                ${list.map(function renderHistoryRow(item) {
                    const phaseModel = getNotebookRuntimePhaseModel(item.phase);
                    const noteText = getNotebookRuntimeNoteLabel(item.note);
                    const detailLines = buildNotebookRuntimeDetailLines(item, { maxLines: 2 });
                    const metaParts = [];
                    if (item.lastSeenAt) {
                        metaParts.push(`最近：${formatDateTime(item.lastSeenAt)}`);
                    }
                    if (item.firstSeenAt && item.firstSeenAt !== item.lastSeenAt) {
                        metaParts.push(`首次：${formatDateTime(item.firstSeenAt)}`);
                    }
                    metaParts.push(`来源 ${getNotebookRuntimeSourceLabel(item.source)}`);
                    if (item.injectedCharLength > 0 || item.promptCharLength > 0) {
                        metaParts.push(`注入 ${item.injectedCharLength} / 快照 ${item.promptCharLength} 字`);
                    }
                    if (item.repeatCount > 1) {
                        metaParts.push(`重复 ${item.repeatCount} 次`);
                    }
                    return `
                        <div style="padding:12px 14px;border-radius:14px;background:rgba(255,255,255,0.035);border:1px solid rgba(255,255,255,0.06);">
                            <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
                                <div style="display:flex;flex-wrap:wrap;gap:8px;">
                                    ${renderNotebookBadge(`状态 ${phaseModel.label}`, phaseModel.color, phaseModel.background)}
                                    ${item.hasRedline ? renderNotebookBadge('含红线', '#fda4af', 'rgba(244,63,94,0.12)') : ''}
                                    ${item.hasStable ? renderNotebookBadge('含稳定板块', '#c7d2fe', 'rgba(99,102,241,0.15)') : ''}
                                    ${item.usedFallbackFullPrompt ? renderNotebookBadge('整块回退', '#fde68a', 'rgba(245,158,11,0.16)') : ''}
                                </div>
                                <div style="font-size:12px;color:rgba(255,255,255,0.52);">${escapeHtml(formatTimeAgo(item.lastSeenAt || item.updatedAt || item.firstSeenAt))}</div>
                            </div>
                            ${metaParts.length > 0 ? `<div style="margin-top:8px;font-size:12px;line-height:1.75;color:rgba(255,255,255,0.66);">${escapeHtml(metaParts.join('  '))}</div>` : ''}
                            ${noteText || detailLines.length > 0 || item.error
                                ? `<div style="margin-top:8px;font-size:12px;line-height:1.75;color:rgba(255,255,255,0.74);">
                                    ${noteText ? `<div>${escapeHtml(noteText)}</div>` : ''}
                                    ${detailLines.map(function mapDetailLine(line) {
                                        return `<div style="margin-top:${noteText ? '4px' : '0'};color:rgba(255,255,255,0.68);">${escapeHtml(line)}</div>`;
                                    }).join('')}
                                    ${item.error ? `<div style="margin-top:${noteText ? '4px' : '0'};color:#fecdd3;">${escapeHtml(item.error)}</div>` : ''}
                                </div>`
                                : ''}
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    function renderNotebookRuntimePanel(notebook) {
        const runtimeStatus = normalizeNotebookRuntimeStatusView(notebook && notebook.runtimeStatus);
        const runtimeHistory = Array.isArray(notebook && notebook.runtimeHistory)
            ? notebook.runtimeHistory.map(normalizeNotebookRuntimeHistoryEntryView).filter(Boolean)
            : [];
        const runtimeStats = buildNotebookRuntimeHistoryStats(runtimeHistory);
        const phaseModel = getNotebookRuntimePhaseModel(runtimeStatus.phase);
        const hasRuntimeRecord = !!runtimeStatus.updatedAt || runtimeStatus.phase !== 'idle';
        const badges = [
            renderNotebookBadge(`状态 ${phaseModel.label}`, phaseModel.color, phaseModel.background),
            renderNotebookBadge(`来源 ${getNotebookRuntimeSourceLabel(runtimeStatus.source)}`, '#dbeafe', 'rgba(96,165,250,0.14)')
        ];
        if (runtimeStatus.injectedCharLength > 0 || runtimeStatus.promptCharLength > 0) {
            badges.push(renderNotebookBadge(`注入 ${runtimeStatus.injectedCharLength} 字 / ${runtimeStatus.injectedLineCount} 行`, '#e5e7eb', 'rgba(255,255,255,0.08)'));
            badges.push(renderNotebookBadge(`快照 ${runtimeStatus.promptCharLength} 字 / ${runtimeStatus.promptLineCount} 行`, '#e5e7eb', 'rgba(255,255,255,0.08)'));
        }
        if (runtimeStatus.keptCount > 0 || runtimeStatus.suppressedCount > 0) {
            badges.push(renderNotebookBadge(`保留 ${runtimeStatus.keptCount}`, '#bbf7d0', 'rgba(34,197,94,0.14)'));
            badges.push(renderNotebookBadge(`挡下 ${runtimeStatus.suppressedCount}`, '#fecdd3', 'rgba(244,114,182,0.16)'));
        }
        if (runtimeStatus.hasRedline) {
            badges.push(renderNotebookBadge('含红线', '#fda4af', 'rgba(244,63,94,0.12)'));
        }
        if (runtimeStatus.hasStable) {
            badges.push(renderNotebookBadge('含稳定板块', '#c7d2fe', 'rgba(99,102,241,0.15)'));
        }
        if (runtimeStatus.usedFallbackFullPrompt) {
            badges.push(renderNotebookBadge('整块回退', '#fde68a', 'rgba(245,158,11,0.16)'));
        }

        const metaLines = [];
        if (runtimeStatus.updatedAt) {
            metaLines.push(`最近一轮：${formatDateTime(runtimeStatus.updatedAt)}`);
        }
        if (runtimeStatus.checksum) {
            metaLines.push(`内容指纹：${runtimeStatus.checksum}`);
        }
        if (runtimeStatus.counts.redlines > 0 || runtimeStatus.counts.mustRemember > 0 || runtimeStatus.counts.profiles > 0) {
            metaLines.push(`条目计数：红线 ${runtimeStatus.counts.redlines} / 必记 ${runtimeStatus.counts.mustRemember} / 档案 ${runtimeStatus.counts.profiles}`);
        }
        const noteText = getNotebookRuntimeNoteLabel(runtimeStatus.note);
        const detailLines = buildNotebookRuntimeDetailLines(runtimeStatus, { maxLines: 3 });
        const historySummaryBadges = runtimeHistory.length > 0
            ? [
                renderNotebookBadge(`历史 ${runtimeStats.total} 条`, '#e5e7eb', 'rgba(255,255,255,0.08)'),
                renderNotebookBadge(`成功 ${runtimeStats.injected}`, '#bbf7d0', 'rgba(34,197,94,0.14)'),
                renderNotebookBadge(`空轮 ${runtimeStats.empty}`, '#fde68a', 'rgba(245,158,11,0.16)'),
                renderNotebookBadge(`失败 ${runtimeStats.failed}`, '#fecdd3', 'rgba(244,114,182,0.16)'),
                runtimeStats.repeats > 0
                    ? renderNotebookBadge(`压缩掉重复 ${runtimeStats.repeats}`, '#c4b5fd', 'rgba(139,92,246,0.14)')
                    : ''
            ].filter(Boolean).join('')
            : '';

        return `
            <section class="hip-glass-panel" style="padding:18px 20px 16px;margin-bottom:18px;">
                <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;">
                    <div style="flex:1;min-width:240px;">
                        <div style="font-size:16px;font-weight:600;">记事本本轮注入状态</div>
                        <div style="font-size:13px;color:rgba(255,255,255,0.62);line-height:1.7;margin-top:8px;">
                            ${escapeHtml(
                                hasRuntimeRecord
                                    ? '这里显示最近一次主聊天组装时，记事本到底有没有真正塞进主聊天，以及卡在了哪一步。'
                                    : '当前还没有采集到本地运行记录。等角色真正走过一轮主聊天后，这里就会出现状态。'
                            )}
                        </div>
                    </div>
                    <div style="display:flex;gap:8px;flex-wrap:wrap;">
                        <button type="button" class="hip-btn-outline hip-btn-inline" data-hip-action="clear-notebook-runtime-history" ${runtimeHistory.length > 0 ? '' : 'disabled'}>清空运行历史</button>
                    </div>
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:14px;">${badges.join('')}</div>
                ${metaLines.length > 0 ? `<div style="margin-top:12px;font-size:12px;color:rgba(255,255,255,0.68);line-height:1.8;">${escapeHtml(metaLines.join('  '))}</div>` : ''}
                ${noteText || detailLines.length > 0 || runtimeStatus.error
                    ? `<div style="margin-top:12px;padding:12px 14px;border-radius:14px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);font-size:12px;line-height:1.8;color:rgba(255,255,255,0.74);">
                        ${noteText ? `<div>${escapeHtml(noteText)}</div>` : ''}
                        ${detailLines.map(function mapDetailLine(line) {
                            return `<div style="margin-top:${noteText ? '6px' : '0'};color:rgba(255,255,255,0.68);">${escapeHtml(line)}</div>`;
                        }).join('')}
                        ${runtimeStatus.error ? `<div style="margin-top:${noteText ? '6px' : '0'};color:#fecdd3;">${escapeHtml(runtimeStatus.error)}</div>` : ''}
                    </div>`
                    : ''}
                <div style="margin-top:16px;padding-top:14px;border-top:1px dashed rgba(255,255,255,0.12);">
                    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;">
                        <div>
                            <div style="font-size:14px;font-weight:600;color:rgba(255,255,255,0.9);">多轮记录时间线</div>
                            <div style="margin-top:6px;font-size:12px;color:rgba(255,255,255,0.58);line-height:1.7;">
                                这里会把连续重复的同类状态自动压缩，避免每一轮都刷出一整屏重复记录。
                            </div>
                        </div>
                    </div>
                    ${historySummaryBadges ? `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;">${historySummaryBadges}</div>` : ''}
                    ${renderNotebookRuntimeHistoryTimeline(runtimeHistory)}
                </div>
            </section>
        `;
    }

    function renderNotebookCompactionPanel(notebook) {
        const safeNotebook = notebook && typeof notebook === 'object' ? notebook : getNotebookData();
        const helper = getNotebookCompactionHelperState();
        const compacted = safeNotebook.compacted && typeof safeNotebook.compacted === 'object'
            ? safeNotebook.compacted
            : null;
        const compactedId = toTrimmedString(compacted && compacted.id);
        const groups = Array.isArray(compacted && compacted.groups) ? compacted.groups : [];
        const compactedText = toTrimmedString(compacted && (compacted.compacted_text || compacted.compactedText));
        const uncompactedCount = Math.max(0, Math.floor(Number(safeNotebook.uncompactedCount) || 0));
        const sourceProfileCount = Math.max(0, Math.floor(Number(compacted && (compacted.source_profile_count || compacted.sourceProfileCount)) || 0));
        const sourceMustCount = Math.max(0, Math.floor(Number(compacted && (compacted.source_must_remember_count || compacted.sourceMustRememberCount)) || 0));
        const groupItemCount = groups.reduce(function countGroupItems(total, group) {
            return total + (Array.isArray(group && group.items) ? group.items.length : 0);
        }, 0);
        const groupsText = groups.length > 0 ? JSON.stringify(groups, null, 2) : '[]';
        const rawItems = []
            .concat((Array.isArray(safeNotebook.mustRemember) ? safeNotebook.mustRemember : []).map(function mapMust(item) {
                return {
                    label: '必记',
                    compacted: !!(item && item.compacted_at),
                    content: toTrimmedString(item && item.content)
                };
            }))
            .concat((Array.isArray(safeNotebook.profiles) ? safeNotebook.profiles : []).map(function mapProfile(item) {
                return {
                    label: getNotebookProfileCategoryLabel(item && item.category),
                    compacted: !!(item && item.compacted_at),
                    content: toTrimmedString(item && item.content)
                };
            }))
            .filter(function keepRaw(item) {
                return !!item.content;
            });
        const rawPreviewHtml = rawItems.length > 0
            ? rawItems.slice(0, 60).map(function renderRawItem(item) {
                return `
                    <div style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
                        <span style="font-size:11px;color:${item.compacted ? '#bbf7d0' : '#fde68a'};">${item.compacted ? '已归档' : '新条目'}</span>
                        <span style="font-size:11px;color:rgba(255,255,255,0.48);margin-left:6px;">${escapeHtml(item.label)}</span>
                        <div style="margin-top:4px;color:rgba(255,255,255,0.78);line-height:1.7;">${escapeHtml(item.content)}</div>
                    </div>
                `;
            }).join('')
            : '<div class="hip-empty hip-empty-compact">还没有可整理的必记或偏好档案。</div>';
        const badges = [
            renderNotebookBadge(compacted ? '已有整理版' : '还没整理', compacted ? '#bbf7d0' : '#fde68a', compacted ? 'rgba(34,197,94,0.14)' : 'rgba(245,158,11,0.16)'),
            renderNotebookBadge(`新条目 ${uncompactedCount}`, '#e5e7eb', 'rgba(255,255,255,0.08)'),
            renderNotebookBadge(`分组 ${groups.length}`, '#c7d2fe', 'rgba(99,102,241,0.15)'),
            renderNotebookBadge(`整理后 ${groupItemCount} 条`, '#bfdbfe', 'rgba(96,165,250,0.14)'),
            renderNotebookBadge(`覆盖原始 ${sourceMustCount + sourceProfileCount} 条`, '#ddd6fe', 'rgba(139,92,246,0.14)')
        ].join('');
        const updatedAtText = compacted && compacted.updated_at ? formatDateTime(compacted.updated_at) : '暂无';
        const disabled = helper.busy || helper.saveBusy || state.loading;

        return `
            <section class="hip-glass-panel" style="padding:20px 20px 18px;margin-bottom:18px;">
                <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;">
                    <div style="flex:1;min-width:240px;">
                        <div style="font-size:16px;font-weight:600;">整理归档</div>
                        <div style="font-size:13px;color:rgba(255,255,255,0.62);line-height:1.7;margin-top:8px;">
                            把“必须牢记”和“偏好档案”里重复、同主题的内容归到一起。红线不会被整理，仍然逐条原样放在最前面。
                            自动整理会在聊天脱水后检查新条目数量，攒够 10 条就后台跑；也可以点右边按钮现在马上整理一次。
                        </div>
                        <div style="margin-top:10px;font-size:12px;color:rgba(255,255,255,0.58);">最近整理：${escapeHtml(updatedAtText)}</div>
                    </div>
                    <div style="display:flex;gap:8px;flex-wrap:wrap;">
                        <button type="button" class="hip-btn-outline hip-btn-inline" data-hip-action="trigger-notebook-compaction" ${disabled ? 'disabled' : ''}>${helper.busy ? '正在整理...' : '马上整理一次'}</button>
                        <button type="button" class="hip-btn-danger hip-btn-inline" data-hip-action="rollback-notebook-compaction" ${!compactedId || disabled ? 'disabled' : ''}>回退到原始条目</button>
                    </div>
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:14px;">${badges}</div>
                ${compacted
                    ? `<form id="hip-admin-notebook-compaction-form" style="margin-top:16px;">
                        <input type="hidden" name="compactedId" value="${escapeAttribute(compactedId)}">
                        <label style="display:block;font-size:12px;color:rgba(255,255,255,0.62);margin-bottom:6px;">整理后会注入主聊天的文本</label>
                        <textarea name="compactedText" rows="10" style="width:100%;box-sizing:border-box;border-radius:14px;border:1px solid rgba(255,255,255,0.12);background:rgba(0,0,0,0.22);color:rgba(255,255,255,0.88);padding:12px;line-height:1.6;">${escapeHtml(compactedText)}</textarea>
                        <label style="display:block;font-size:12px;color:rgba(255,255,255,0.62);margin:12px 0 6px;">分组结构 JSON（不想改结构就别动这里）</label>
                        <textarea name="groupsText" rows="8" style="width:100%;box-sizing:border-box;border-radius:14px;border:1px solid rgba(255,255,255,0.12);background:rgba(0,0,0,0.22);color:rgba(255,255,255,0.78);padding:12px;line-height:1.55;font-family:ui-monospace,Consolas,monospace;">${escapeHtml(groupsText)}</textarea>
                        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">
                            <button type="submit" class="hip-btn-outline hip-btn-inline" ${disabled ? 'disabled' : ''}>${helper.saveBusy ? '保存中...' : '保存修改'}</button>
                        </div>
                    </form>`
                    : `<div class="hip-empty hip-empty-compact" style="margin-top:16px;">还没有整理版。可以等脱水后自动触发，也可以现在点“马上整理一次”。</div>`}
                <details style="margin-top:16px;">
                    <summary style="cursor:pointer;color:rgba(255,255,255,0.78);font-size:13px;">查看原始条目对照</summary>
                    <div style="margin-top:10px;max-height:360px;overflow:auto;padding:10px 12px;border-radius:14px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);font-size:12px;">
                        ${rawPreviewHtml}
                    </div>
                </details>
            </section>
        `;
    }

    function renderNotebookPromptPreviewPanel(notebook) {
        const helper = getNotebookPromptHelperState();
        const preview = normalizeNotebookPromptPreview(notebook && notebook.promptPreview);
        const cleanupPreview = normalizeNotebookCleanupPreview(notebook && notebook.cleanupPreview);
        const charId = toTrimmedString(state.filters.charId);
        const tracked = !!(helper.snapshot && helper.trackedCharId && helper.trackedCharId === charId);
        const counts = preview.counts;
        const sectionCounts = preview.sectionCounts;
        const cleanupReasonCounts = {
            low_value: 0,
            duplicate: 0,
            pending_confirmation: 0
        };
        ['redline', 'mustRemember', 'profile'].forEach(function sumCleanupReason(kind) {
            const reasonCounts = getNotebookCleanupBucket(kind, cleanupPreview).reasonCounts;
            cleanupReasonCounts.low_value += Math.max(0, Number(reasonCounts.low_value) || 0);
            cleanupReasonCounts.duplicate += Math.max(0, Number(reasonCounts.duplicate) || 0);
            cleanupReasonCounts.pending_confirmation += Math.max(0, Number(reasonCounts.pending_confirmation) || 0);
        });
        const metaBadges = [
            renderNotebookBadge(`红线 ${counts.redlines}`, '#fecaca', 'rgba(248,113,113,0.14)'),
            renderNotebookBadge(`必记 ${counts.mustRemember}`, '#bfdbfe', 'rgba(96,165,250,0.14)'),
            renderNotebookBadge(`档案 ${counts.profiles}`, '#ddd6fe', 'rgba(139,92,246,0.14)'),
            renderNotebookBadge(`${preview.charLength} 字 / ${preview.lineCount} 行`, '#fde68a', 'rgba(250,204,21,0.14)'),
            renderNotebookBadge(`内容指纹 ${preview.checksum || 'none'}`, '#e5e7eb', 'rgba(255,255,255,0.08)')
        ].join('');
        const cleanupBadges = [
            renderNotebookBadge(`保留 ${cleanupPreview.keptCount}`, '#bbf7d0', 'rgba(34,197,94,0.14)'),
            renderNotebookBadge(`挡下 ${cleanupPreview.suppressedCount}`, '#fecdd3', 'rgba(244,114,182,0.16)'),
            renderNotebookBadge(`重复 ${cleanupReasonCounts.duplicate}`, '#fde68a', 'rgba(245,158,11,0.16)'),
            renderNotebookBadge(`待确认 ${cleanupReasonCounts.pending_confirmation}`, '#fdba74', 'rgba(249,115,22,0.16)')
        ];
        if (cleanupReasonCounts.low_value > 0) {
            cleanupBadges.splice(2, 0, renderNotebookBadge(`低价值 ${cleanupReasonCounts.low_value}`, '#fbcfe8', 'rgba(236,72,153,0.14)'));
        }
        const cleanupBadgesHtml = cleanupBadges.join('');
        const cleanupKindBadges = ['redline', 'mustRemember', 'profile'].map(function mapKind(kind) {
            const bucket = getNotebookCleanupBucket(kind, cleanupPreview);
            return renderNotebookBadge(
                `${getNotebookCleanupKindLabel(kind)} ${bucket.suppressedCount}`,
                '#e5e7eb',
                bucket.suppressedCount > 0 ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)'
            );
        }).join('');
        const cleanupSamples = ['redline', 'mustRemember', 'profile'].reduce(function collectSamples(result, kind) {
            const items = getNotebookSuppressedItems(kind, cleanupPreview);
            items.forEach(function appendItem(item) {
                if (result.length >= 8) return;
                result.push({
                    kind: kind,
                    reason: toTrimmedString(item && item.reason),
                    content: toTrimmedString(item && item.content)
                });
            });
            return result;
        }, []);
        const helperLines = [];
        helperLines.push('这是当前角色每轮主聊天前会插进去的记事本内容。待确认红线不会进来，只有已确认或常驻内容会生效。');
        if (sectionCounts.criticalRedlines > 0 || sectionCounts.importantRedlines > 0 || sectionCounts.reminderRedlines > 0) {
            helperLines.push(`当前红线拆分：绝对不可以 ${sectionCounts.criticalRedlines} / 重要提醒 ${sectionCounts.importantRedlines} / 留意 ${sectionCounts.reminderRedlines}`);
        }
        helperLines.push(`清理结果：当前保留 ${cleanupPreview.keptCount} 条，挡下 ${cleanupPreview.suppressedCount} 条不会进主聊天的记事本内容。`);
        if (tracked && helper.snapshot) {
            helperLines.push(`已记住旧底稿：${helper.snapshot.charLength} 字 / ${helper.snapshot.lineCount} 行 / ${helper.snapshot.checksum || 'none'}`);
        }
        if (tracked && helper.lastReport && helper.lastReport.summary) {
            helperLines.push(`最近对比：${helper.lastReport.summary}`);
        }

        return `
            <section class="hip-glass-panel" style="padding:20px 20px 18px;margin-bottom:18px;">
                <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;">
                    <div style="flex:1;min-width:240px;">
                        <div style="font-size:16px;font-weight:600;">🧾 记事本进主聊天前预览</div>
                        <div style="font-size:13px;color:rgba(255,255,255,0.62);line-height:1.7;margin-top:8px;">${escapeHtml(helperLines.join('  '))}</div>
                    </div>
                    <div style="display:flex;gap:8px;flex-wrap:wrap;">
                        <button type="button" class="hip-btn-outline hip-btn-inline" data-hip-action="refresh-notebook-preview" ${state.loading ? 'disabled' : ''}>刷新预览</button>
                        <button type="button" class="hip-btn-outline hip-btn-inline" data-hip-action="copy-notebook-preview" ${preview.text ? '' : 'disabled'}>复制记事本</button>
                        <button type="button" class="hip-btn-outline hip-btn-inline" data-hip-action="remember-notebook-prompt" ${state.loading ? 'disabled' : ''}>${tracked ? '更新旧底稿' : '记住当前样子'}</button>
                        <button type="button" class="hip-btn-outline hip-btn-inline" data-hip-action="check-notebook-prompt" ${tracked ? '' : 'disabled'}>对比现在</button>
                        <button type="button" class="hip-btn-danger hip-btn-inline" data-hip-action="clear-notebook-prompt" ${tracked ? '' : 'disabled'}>忘掉旧底稿</button>
                        <button type="button" class="hip-btn-outline hip-btn-inline" data-hip-action="select-all-notebook-suppressed" ${cleanupPreview.suppressedCount > 0 ? '' : 'disabled'}>选中全部进不了主聊天的条目</button>
                        <button type="button" class="hip-btn-danger hip-btn-inline" data-hip-action="batch-delete-all-notebook-suppressed" ${cleanupPreview.suppressedCount > 0 ? '' : 'disabled'}>一键清理全部进不了主聊天的条目</button>
                    </div>
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:14px;">${metaBadges}</div>
                <div style="margin-top:14px;padding:14px 16px;border-radius:16px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);">
                    <div style="font-size:13px;font-weight:600;color:rgba(255,255,255,0.92);">进主聊天前的清理结果</div>
                    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;">${cleanupBadgesHtml}</div>
                    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;">${cleanupKindBadges}</div>
                    ${cleanupSamples.length > 0
                        ? `<div style="margin-top:12px;font-size:12px;color:rgba(255,255,255,0.68);line-height:1.8;">
                            ${cleanupSamples.map(function mapSample(item, index) {
                                return `${index + 1}. [${getNotebookCleanupKindLabel(item.kind)} / ${getNotebookCleanupReasonLabel(item.reason)}] ${escapeHtml(item.content)}`;
                            }).join('<br>')}
                        </div>`
                        : `<div class="hip-box-hint" style="margin-top:12px;">当前没有被挡在主聊天外的记事本条目。</div>`}
                </div>
                <div style="margin-top:16px;">
                    ${preview.text
                        ? `<pre style="margin:0;padding:16px;border-radius:16px;background:rgba(4,10,24,0.68);border:1px solid rgba(255,255,255,0.08);color:rgba(255,255,255,0.92);white-space:pre-wrap;word-break:break-word;line-height:1.72;font-size:13px;max-height:360px;overflow:auto;">${escapeHtml(preview.text)}</pre>`
                        : renderNotebookEmpty('当前还没有会进主聊天的记事本内容。你可以先新增必记、已确认红线或用户档案，再回来刷新预览。')}
                </div>
            </section>
        `;
    }

    function getNotebookSectionOpen(sectionKey) {
        return !(state.notebookSections && state.notebookSections[sectionKey] === false);
    }

    function getNotebookStatusCategoryLabel(category) {
        const value = toTrimmedString(category).toLowerCase();
        if (value === 'body') return '身体';
        if (value === 'mood') return '情绪';
        if (value === 'work') return '工作学业';
        if (value === 'life') return '生活';
        return '其他';
    }

    function getNotebookProfileCategoryLabel(category) {
        const value = toTrimmedString(category).toLowerCase();
        if (value === 'preference') return '喜好偏好';
        if (value === 'habit') return '日常习惯';
        if (value === 'identity') return '个人信息';
        return '其他';
    }

    function isNotebookProfileCategoryVisible(category) {
        const value = toTrimmedString(category).toLowerCase();
        return value === 'preference' || value === 'habit' || value === 'identity' || value === 'other';
    }

    function getNotebookMustRememberCategoryLabel(category) {
        const value = toTrimmedString(category).toLowerCase();
        if (value === 'fact') return '重要事实';
        if (value === 'health') return '健康相关';
        if (value === 'relationship') return '关系相关';
        if (value === 'promise') return '约定承诺';
        if (value === 'trigger') return '雷点提醒';
        return '其他';
    }

    function isExplicitUserDeclaredNotebookContext(originContext) {
        const context = toTrimmedString(originContext);
        if (!context) return false;
        return /(用户|你).{0,12}(明确|手动|要求|指定|强调).{0,12}(记住|牢记|必记|加入|添加|保留)|管理后台手动|手动添加|手动编辑|manual/i.test(context);
    }

    function getNotebookMustRememberOriginLabel(origin, originContext) {
        const value = toTrimmedString(origin).toLowerCase();
        if (value === 'manual_promoted') return '你手动添加';
        if (value === 'system_extracted') return '系统自动提取';
        if (value === 'user_declared') {
            return isExplicitUserDeclaredNotebookContext(originContext) ? '用户明确要求' : '旧版来源';
        }
        return '旧版来源';
    }

    function getNotebookRedlineSeverityLabel(severity) {
        const value = toTrimmedString(severity).toLowerCase();
        if (value === 'critical') return '致命';
        if (value === 'reminder') return '提醒';
        return '重要';
    }

    function getNotebookRedlineSourceLabel(origin) {
        return toTrimmedString(origin).toLowerCase() === 'system_extracted' ? '系统提取' : '你说的';
    }

    function renderNotebookBadge(text, color, background) {
        return `<span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:999px;font-size:12px;color:${color};background:${background};border:1px solid rgba(255,255,255,0.08);">${escapeHtml(text)}</span>`;
    }

    function renderNotebookSelectionToolbar(kind, items) {
        const safeKind = normalizeNotebookSelectionKind(kind);
        const safeItems = Array.isArray(items) ? items.filter(Boolean) : [];
        if (!safeKind || safeItems.length <= 0) return '';

        const selectedCount = getNotebookSelectionIds(safeKind).length;
        const batchLabel = getNotebookBatchActionLabel(safeKind);
        const cleanupBucket = getNotebookCleanupBucket(safeKind);
        const suppressedCount = cleanupBucket.suppressedCount;
        const toolbarBadges = [
            renderNotebookBadge(`总计 ${safeItems.length}`, '#e5e7eb', 'rgba(255,255,255,0.08)'),
            renderNotebookBadge(`不会注入 ${suppressedCount}`, suppressedCount > 0 ? '#fecdd3' : '#cbd5e1', suppressedCount > 0 ? 'rgba(244,114,182,0.16)' : 'rgba(148,163,184,0.12)')
        ];
        if (cleanupBucket.reasonCounts.duplicate > 0) {
            toolbarBadges.push(renderNotebookBadge(`重复 ${cleanupBucket.reasonCounts.duplicate}`, '#fde68a', 'rgba(245,158,11,0.16)'));
        }
        if (cleanupBucket.reasonCounts.low_value > 0) {
            toolbarBadges.push(renderNotebookBadge(`低价值 ${cleanupBucket.reasonCounts.low_value}`, '#fbcfe8', 'rgba(236,72,153,0.14)'));
        }
        if (cleanupBucket.reasonCounts.pending_confirmation > 0) {
            toolbarBadges.push(renderNotebookBadge(`待确认 ${cleanupBucket.reasonCounts.pending_confirmation}`, '#fdba74', 'rgba(249,115,22,0.16)'));
        }
        return `
            <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:14px;padding:12px 14px;border-radius:14px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);">
                <div style="font-size:12px;color:rgba(255,255,255,0.68);line-height:1.6;display:flex;flex-direction:column;gap:8px;">
                    <div>已选 <strong style="color:rgba(255,255,255,0.95);">${selectedCount}</strong> / ${safeItems.length} 条</div>
                    <div style="display:flex;gap:8px;flex-wrap:wrap;">${toolbarBadges.join('')}</div>
                </div>
                <div style="display:flex;gap:8px;flex-wrap:wrap;">
                    <button type="button" class="hip-btn-outline hip-btn-inline" data-hip-action="select-all-notebook-items" data-kind="${escapeAttribute(safeKind)}">全选本区</button>
                    <button type="button" class="hip-btn-outline hip-btn-inline" data-hip-action="select-notebook-suppressed-items" data-kind="${escapeAttribute(safeKind)}" ${suppressedCount > 0 ? '' : 'disabled'}>选中不会注入项</button>
                    <button type="button" class="hip-btn-outline hip-btn-inline" data-hip-action="clear-notebook-selection" data-kind="${escapeAttribute(safeKind)}" ${selectedCount > 0 ? '' : 'disabled'}>清空选择</button>
                    <button type="button" class="hip-btn-danger hip-btn-inline" data-hip-action="batch-delete-notebook-suppressed" data-kind="${escapeAttribute(safeKind)}" ${suppressedCount > 0 ? '' : 'disabled'}>一键清理不会注入项</button>
                    <button type="button" class="hip-btn-danger hip-btn-inline" data-hip-action="batch-delete-notebook-items" data-kind="${escapeAttribute(safeKind)}" ${selectedCount > 0 ? '' : 'disabled'}>${escapeHtml(batchLabel)}</button>
                </div>
            </div>
        `;
    }

    function getNotebookCardInlineStyle(kind, itemId) {
        return isNotebookItemSelected(kind, itemId)
            ? 'padding:18px;cursor:default;border:1px solid rgba(96,165,250,0.55);box-shadow:0 0 0 1px rgba(96,165,250,0.18) inset;background:rgba(59,130,246,0.08);'
            : 'padding:18px;cursor:default;';
    }

    function renderNotebookSelectionButton(kind, itemId) {
        const safeKind = normalizeNotebookSelectionKind(kind);
        const safeItemId = toTrimmedString(itemId);
        if (!safeKind || !safeItemId) return '';
        const selected = isNotebookItemSelected(safeKind, safeItemId);
        return `<button type="button" class="hip-btn-outline hip-btn-inline" data-hip-action="toggle-notebook-item-selection" data-kind="${escapeAttribute(safeKind)}" data-item-id="${escapeAttribute(safeItemId)}">${selected ? '取消选中' : '选中'}</button>`;
    }

    function formatNotebookSignals(signals) {
        return Array.isArray(signals) ? signals.map(toTrimmedString).filter(Boolean).join(' / ') : '';
    }

    function formatNotebookDuration(hours) {
        const numeric = Number(hours);
        if (!Number.isFinite(numeric)) return '不确定';
        const safeHours = Math.max(0, Math.floor(numeric));
        if (safeHours <= 0) return '很短';
        if (safeHours < 24) return `${safeHours} 小时左右`;
        if (safeHours % (24 * 7) === 0) return `${Math.max(1, Math.floor(safeHours / (24 * 7)))} 周左右`;
        if (safeHours % 24 === 0) return `${Math.max(1, Math.floor(safeHours / 24))} 天左右`;
        return `${safeHours} 小时左右`;
    }

    function renderNotebookEmpty(text) {
        return `<div class="hip-empty" style="padding:28px 20px;">${escapeHtml(text)}</div>`;
    }

    function renderNotebookSection(sectionKey, title, hint, actionLabel, actionName, actionAttributes, bodyHtml, count) {
        const open = getNotebookSectionOpen(sectionKey);
        const countText = Number.isFinite(Number(count)) ? `共 ${Math.max(0, Math.floor(Number(count)))} 条` : '';
        const extraAttrs = actionAttributes && typeof actionAttributes === 'object'
            ? Object.keys(actionAttributes).map(function mapAttr(name) {
                return ` ${escapeAttribute(name)}="${escapeAttribute(actionAttributes[name])}"`;
            }).join('')
            : '';
        return `
            <section class="hip-glass-panel" style="padding:20px 20px 18px;">
                <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;">
                    <button type="button" data-hip-action="toggle-notebook-section" data-section="${escapeAttribute(sectionKey)}" style="flex:1;min-width:220px;background:none;border:none;padding:0;text-align:left;color:inherit;cursor:pointer;">
                        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                            <div style="font-size:16px;font-weight:600;">${escapeHtml(title)}</div>
                            ${countText ? `<span style="font-size:12px;color:rgba(255,255,255,0.55);">${escapeHtml(countText)}</span>` : ''}
                        </div>
                        <div style="font-size:12px;color:rgba(255,255,255,0.45);margin-top:4px;">${open ? '点击收起' : '点击展开'}</div>
                    </button>
                    ${actionLabel && actionName ? `<button type="button" class="hip-btn-outline" data-hip-action="${escapeAttribute(actionName)}"${extraAttrs}>${escapeHtml(actionLabel)}</button>` : ''}
                </div>
                <div style="font-size:13px;color:rgba(255,255,255,0.62);line-height:1.65;margin-top:14px;${open ? '' : 'display:none;'}">${escapeHtml(hint)}</div>
                <div style="margin-top:16px;${open ? '' : 'display:none;'}">
                    ${bodyHtml}
                </div>
            </section>
        `;
    }

    function renderNotebookRedlineCard(item, pending) {
        const redlineId = toTrimmedString(item && item.id);
        const severity = toTrimmedString(item && item.severity).toLowerCase() || 'important';
        const origin = toTrimmedString(item && item.origin).toLowerCase() || 'user_declared';
        const createdAt = toTrimmedString(item && item.created_at);
        const originContext = toTrimmedString(item && item.origin_context);
        const badges = [
            renderNotebookBadge(getNotebookRedlineSeverityLabel(severity), '#ffe7b3', severity === 'critical' ? 'rgba(251, 113, 133, 0.18)' : 'rgba(251, 191, 36, 0.14)'),
            renderNotebookBadge(getNotebookRedlineSourceLabel(origin), '#dbeafe', 'rgba(96, 165, 250, 0.14)')
        ];
        if (pending) {
            badges.push(renderNotebookBadge('待确认', '#fde68a', 'rgba(245, 158, 11, 0.16)'));
        }
        if (renderNotebookSuppressedBadge('redline', redlineId)) {
            badges.push(renderNotebookSuppressedBadge('redline', redlineId));
        }
        if (isNotebookItemSelected('redline', redlineId)) {
            badges.push(renderNotebookBadge('已选中', '#bfdbfe', 'rgba(59, 130, 246, 0.16)'));
        }

        return `
            <article class="hip-card" style="${getNotebookCardInlineStyle('redline', redlineId)}">
                <div style="font-size:15px;line-height:1.7;white-space:pre-wrap;">${escapeHtml(toTrimmedString(item && item.content))}</div>
                <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:14px;">
                    ${badges.join('')}
                </div>
                <div style="font-size:12px;color:rgba(255,255,255,0.45);margin-top:12px;">
                    ${createdAt ? `写入于 ${escapeHtml(formatDateTime(createdAt))}` : '刚刚写入'}
                </div>
                ${originContext ? `<div class="hip-box-hint" style="margin-top:10px;">来源说明：${escapeHtml(originContext)}</div>` : ''}
                ${renderNotebookSuppressedHint('redline', redlineId)}
                <div class="hip-card-actions" style="margin-top:14px;">
                    ${renderNotebookSelectionButton('redline', redlineId)}
                    <button type="button" class="hip-btn-outline hip-btn-inline" data-hip-action="edit-notebook-redline" data-redline-id="${escapeAttribute(redlineId)}">编辑</button>
                    ${pending ? `<button type="button" class="hip-btn-outline hip-btn-inline" data-hip-action="confirm-notebook-redline" data-redline-id="${escapeAttribute(redlineId)}">确认</button>` : ''}
                    <button type="button" class="hip-btn-danger hip-btn-inline" data-hip-action="deactivate-notebook-redline" data-redline-id="${escapeAttribute(redlineId)}">撤销</button>
                </div>
            </article>
        `;
    }

    function renderNotebookMustRememberCard(item) {
        const itemId = toTrimmedString(item && item.id);
        const originContext = toTrimmedString(item && item.origin_context);
        const badges = [
            renderNotebookBadge(getNotebookMustRememberCategoryLabel(item && item.category), '#e5e7eb', 'rgba(148, 163, 184, 0.18)'),
            renderNotebookBadge(getNotebookMustRememberOriginLabel(item && item.origin, originContext), '#c7d2fe', 'rgba(99, 102, 241, 0.15)')
        ];
        if (renderNotebookSuppressedBadge('mustRemember', itemId)) {
            badges.push(renderNotebookSuppressedBadge('mustRemember', itemId));
        }
        if (isNotebookItemSelected('mustRemember', itemId)) {
            badges.push(renderNotebookBadge('已选中', '#bfdbfe', 'rgba(59, 130, 246, 0.16)'));
        }
        return `
            <article class="hip-card" style="${getNotebookCardInlineStyle('mustRemember', itemId)}">
                <div style="font-size:15px;line-height:1.7;white-space:pre-wrap;">${escapeHtml(toTrimmedString(item && item.content))}</div>
                <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:14px;">
                    ${badges.join('')}
                </div>
                <div style="font-size:12px;color:rgba(255,255,255,0.45);margin-top:12px;">
                    ${toTrimmedString(item && item.created_at) ? `写入于 ${escapeHtml(formatDateTime(item.created_at))}` : '刚刚写入'}
                </div>
                ${originContext ? `<div class="hip-box-hint" style="margin-top:10px;">来源说明：${escapeHtml(originContext)}</div>` : ''}
                ${renderNotebookSuppressedHint('mustRemember', itemId)}
                <div class="hip-card-actions" style="margin-top:14px;">
                    ${renderNotebookSelectionButton('mustRemember', itemId)}
                    <button type="button" class="hip-btn-outline hip-btn-inline" data-hip-action="edit-notebook-must" data-item-id="${escapeAttribute(itemId)}">编辑</button>
                    <button type="button" class="hip-btn-danger hip-btn-inline" data-hip-action="delete-notebook-must" data-item-id="${escapeAttribute(itemId)}">删除</button>
                </div>
            </article>
        `;
    }

    function renderNotebookProfileGroup(categoryKey, items) {
        const safeItems = Array.isArray(items) ? items : [];
        if (safeItems.length <= 0) return '';

        const body = safeItems.map(function renderProfileCard(item) {
            const profileId = toTrimmedString(item && item.id);
            const confidence = toTrimmedString(item && item.confidence).toLowerCase();
            const selectedBadge = isNotebookItemSelected('profile', profileId)
                ? renderNotebookBadge('已选中', '#bfdbfe', 'rgba(59, 130, 246, 0.16)')
                : '';
            const suppressedBadge = renderNotebookSuppressedBadge('profile', profileId);
            return `
                <article class="hip-card" style="${getNotebookCardInlineStyle('profile', profileId)}">
                    <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;">
                        <div style="font-size:15px;line-height:1.7;white-space:pre-wrap;flex:1;">${escapeHtml(toTrimmedString(item && item.content))}</div>
                        <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;">
                            ${confidence === 'uncertain' ? renderNotebookBadge('不确定', '#cbd5e1', 'rgba(148, 163, 184, 0.15)') : ''}
                            ${suppressedBadge}
                            ${selectedBadge}
                        </div>
                    </div>
                    <div style="font-size:12px;color:rgba(255,255,255,0.45);margin-top:12px;">
                        ${toTrimmedString(item && item.created_at) ? `写入于 ${escapeHtml(formatDateTime(item.created_at))}` : '刚刚写入'}
                    </div>
                    ${renderNotebookSuppressedHint('profile', profileId)}
                    <div class="hip-card-actions" style="margin-top:14px;">
                        ${renderNotebookSelectionButton('profile', profileId)}
                        <button type="button" class="hip-btn-outline hip-btn-inline" data-hip-action="edit-notebook-profile" data-profile-id="${escapeAttribute(profileId)}">编辑</button>
                        <button type="button" class="hip-btn-danger hip-btn-inline" data-hip-action="delete-notebook-profile" data-profile-id="${escapeAttribute(profileId)}">删除</button>
                    </div>
                </article>
            `;
        }).join('');

        return `
            <div style="margin-bottom:18px;">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px;">
                    <div style="font-size:14px;font-weight:600;color:rgba(255,255,255,0.92);">${escapeHtml(getNotebookProfileCategoryLabel(categoryKey))}</div>
                    <button type="button" class="hip-btn-outline" data-hip-action="add-notebook-profile" data-category="${escapeAttribute(categoryKey)}">+ 新增</button>
                </div>
                <div class="hip-card-list">${body}</div>
            </div>
        `;
    }

    function renderNotebookViewModeChip(mode, label, count, active) {
        return `
            <button
                type="button"
                class="hip-btn-outline hip-btn-inline"
                data-hip-action="set-notebook-view-mode"
                data-mode="${escapeAttribute(mode)}"
                style="${active ? 'border-color:rgba(96,165,250,0.55);background:rgba(59,130,246,0.12);color:#dbeafe;' : ''}"
            >${escapeHtml(`${label} ${count}`)}</button>
        `;
    }

    function renderNotebookViewPanel(notebook, sectionItems, cleanupPreview) {
        const mode = getNotebookViewMode();
        const summary = buildNotebookViewSummary(sectionItems, mode, cleanupPreview);
        const chips = [
            ['all', '全部', summary.modeCounts.all],
            ['injectable', '会进主聊天', summary.modeCounts.injectable],
            ['suppressed', '进不了主聊天', summary.modeCounts.suppressed],
            ['low_value', '低价值', summary.modeCounts.low_value],
            ['duplicate', '重复', summary.modeCounts.duplicate],
            ['pending_confirmation', '待确认', summary.modeCounts.pending_confirmation]
        ].map(function mapChip(entry) {
            return renderNotebookViewModeChip(entry[0], entry[1], entry[2], mode === entry[0]);
        }).join('');

        const helperLines = [];
        helperLines.push(`当前正在看：${getNotebookViewModeLabel(mode)}。`);
        helperLines.push(`你现在看到的是 ${summary.visibleTotal} 条条目；其中 ${summary.visibleSuppressed} 条已经进不了主聊天。`);
        if (mode !== 'all') {
            helperLines.push('列表里暂时看不到的内容只是被筛起来了，不是被删除了。');
        }

        return `
            <section class="hip-glass-panel" style="padding:18px 20px;margin-bottom:18px;">
                <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;">
                    <div style="flex:1;min-width:240px;">
                        <div style="font-size:16px;font-weight:600;">🧹 记事本筛选与批量清理</div>
                        <div style="font-size:13px;color:rgba(255,255,255,0.62);line-height:1.7;margin-top:8px;">${escapeHtml(helperLines.join('  '))}</div>
                    </div>
                    <div style="display:flex;gap:8px;flex-wrap:wrap;">
                        <button type="button" class="hip-btn-outline hip-btn-inline" data-hip-action="select-visible-notebook-items" ${summary.visibleTotal > 0 ? '' : 'disabled'}>选中当前筛到的条目</button>
                        <button type="button" class="hip-btn-danger hip-btn-inline" data-hip-action="batch-delete-visible-notebook-suppressed" ${summary.visibleSuppressed > 0 ? '' : 'disabled'}>清理当前筛到的不会注入项</button>
                        <button type="button" class="hip-btn-outline hip-btn-inline" data-hip-action="clear-all-notebook-selection" ${summary.selected > 0 ? '' : 'disabled'}>清空全部选择</button>
                    </div>
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:14px;">${chips}</div>
                <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;">
                    ${renderNotebookBadge(`已选中 ${summary.selected}`, '#bfdbfe', 'rgba(59,130,246,0.16)')}
                    ${renderNotebookBadge(`当前可见 ${summary.visibleTotal}`, '#e5e7eb', 'rgba(255,255,255,0.08)')}
                    ${renderNotebookBadge(`当前可清理 ${summary.visibleSuppressed}`, summary.visibleSuppressed > 0 ? '#fecdd3' : '#cbd5e1', summary.visibleSuppressed > 0 ? 'rgba(244,114,182,0.16)' : 'rgba(148,163,184,0.12)')}
                </div>
            </section>
        `;
    }

    function renderNotebookPanel() {
        if (state.loading) {
            return renderLoadingPanel('正在翻看记事本...');
        }

        const notebook = getNotebookData();
        const notebookLearningPanel = renderNotebookLearningPanel(notebook);
        const notebookCompactionPanel = renderNotebookCompactionPanel(notebook);
        const notebookPromptPreviewPanel = renderNotebookPromptPreviewPanel(notebook);
        const cleanupPreview = getNotebookCleanupPreview();
        const notebookSections = getNotebookSectionItemMap(notebook);
        const notebookViewPanel = renderNotebookViewPanel(notebook, notebookSections, cleanupPreview);
        const notebookViewMode = getNotebookViewMode();
        const filteredEmptyText = notebookViewMode === 'all' ? '' : '当前筛选下，这一栏没有符合条件的条目。';
        const redlineLists = buildNotebookRedlineLists(notebook);
        const pendingRedlines = filterNotebookItemsByMode('redline', redlineLists.pendingRedlines, notebookViewMode, cleanupPreview);
        const confirmedRedlines = filterNotebookItemsByMode('redline', redlineLists.confirmedRedlines, notebookViewMode, cleanupPreview);
        const redlineCards = pendingRedlines.map(function renderPending(item) {
            return renderNotebookRedlineCard(item, true);
        }).concat(confirmedRedlines.map(function renderConfirmed(item) {
            return renderNotebookRedlineCard(item, false);
        }));
        const redlineItems = pendingRedlines.concat(confirmedRedlines);

        const filteredMustRemember = filterNotebookItemsByMode('mustRemember', notebook.mustRemember, notebookViewMode, cleanupPreview);
        const mustRememberCards = filteredMustRemember.map(renderNotebookMustRememberCard);
        const filteredProfiles = filterNotebookItemsByMode('profile', notebook.profiles, notebookViewMode, cleanupPreview).filter(function filterVisibleProfile(item) {
            return isNotebookProfileCategoryVisible(item && item.category);
        });
        const profileGroups = ['preference', 'habit', 'identity', 'other'].map(function renderGroup(categoryKey) {
            return renderNotebookProfileGroup(categoryKey, filteredProfiles.filter(function filterByCategory(item) {
                return toTrimmedString(item && item.category).toLowerCase() === categoryKey;
            }));
        }).join('');

        return `
            <section>
                ${notebookLearningPanel}
                ${notebookCompactionPanel}
                ${notebookPromptPreviewPanel}
                ${notebookViewPanel}
                ${renderNotebookSection(
                    'redlines',
                    '🚨 TA 绝对不能忘的事',
                    '在这里添加你希望 TA 永远遵守的底线和规则。每次对话都会生效。',
                    '+ 新增',
                    'add-notebook-redline',
                    null,
                    redlineCards.length > 0
                        ? `${renderNotebookSelectionToolbar('redline', redlineItems)}<div class="hip-card-list">${redlineCards.join('')}</div>`
                        : renderNotebookEmpty(filteredEmptyText || '还没有设定底线。你可以告诉 TA 哪些事绝对不能做。'),
                    redlineCards.length
                )}
                ${renderNotebookSection(
                    'mustRemember',
                    '📌 TA 一直记得的事',
                    '这里放的是不能只靠随机召回的事。只要写进来，TA 每次都会读到。',
                    '+ 新增',
                    'add-notebook-must',
                    null,
                    mustRememberCards.length > 0
                        ? `${renderNotebookSelectionToolbar('mustRemember', filteredMustRemember)}<div class="hip-card-list">${mustRememberCards.join('')}</div>`
                        : renderNotebookEmpty(filteredEmptyText || '还没有常驻记住的事。你可以把特别重要、绝对不能忘的内容放在这里。'),
                    mustRememberCards.length
                )}
                ${renderNotebookSection(
                    'profiles',
                    '📋 TA 了解的关于你的事',
                    'TA 从聊天中了解到的关于你的偏好、习惯和个人信息。你可以修改或补充。',
                    '+ 新增',
                    'add-notebook-profile',
                    { 'data-category': 'preference' },
                    profileGroups
                        ? `${renderNotebookSelectionToolbar('profile', filteredProfiles)}${profileGroups}`
                        : renderNotebookEmpty(filteredEmptyText || 'TA 还不太了解你。聊天时多分享一些关于你的事吧。'),
                    filteredProfiles.length
                )}
            </section>
        `;
    }

    function renderExportPanel() {
        const canMigrate = !!getSelectedMigrationCharId() && !state.migrationBusy;
        const snapshots = state.data && state.data.snapshots ? state.data.snapshots.items || [] : [];
        const dehydrateFailures = state.data && state.data.dehydrateFailures ? state.data.dehydrateFailures.items || [] : [];
        const attachmentProfile = state.data && state.data.attachmentProfile && typeof state.data.attachmentProfile === 'object'
            ? state.data.attachmentProfile
            : null;
        const digestOutcomes = state.data && state.data.digestOutcomes && Array.isArray(state.data.digestOutcomes.items)
            ? state.data.digestOutcomes.items
            : [];
        const attachmentStyle = normalizeAttachmentStyle(attachmentProfile && attachmentProfile.style) || 'secure';
        const attachmentUpdatedAtText = attachmentProfile && attachmentProfile.updatedAt
            ? formatDateTime(attachmentProfile.updatedAt)
            : '暂无';
        const migrationSession = state.migrationSession && typeof state.migrationSession === 'object'
            ? state.migrationSession
            : null;
        const migrationSessionHtml = migrationSession
            ? (() => {
                const chunks = Array.isArray(migrationSession.chunkStates) ? migrationSession.chunkStates : [];
                const sourceLabel = escapeHtml(toTrimmedString(migrationSession.sourceLabel) || '未知来源');
                const statusLabel = migrationSession.committed
                    ? '已写入'
                    : (migrationSession.completed ? '已完成待确认' : (migrationSession.failedIndex >= 0 ? '存在失败段' : '进行中'));
                const totalExtracted = chunks.reduce(function countExtracted(total, chunkState) {
                    return total + Math.max(0, Number(chunkState && chunkState.extractedCount || 0));
                }, 0);
                const totalRawLength = chunks.reduce(function countRawLength(total, chunkState) {
                    return total + Math.max(0, Number(chunkState && chunkState.rawLength || 0));
                }, 0);
                const failedCount = chunks.filter(function countFailed(chunkState) {
                    return toTrimmedString(chunkState && chunkState.status) === 'failed';
                }).length;
                const chunkItemsHtml = chunks.length > 0
                    ? chunks.map(function renderMigrationChunk(chunkState) {
                        const index = Number(chunkState.index || 0);
                        const status = toTrimmedString(chunkState.status) || 'pending';
                        const statusText = status === 'success'
                            ? '成功'
                            : status === 'failed'
                                ? '失败'
                                : status === 'running'
                                    ? '处理中'
                                    : '待处理';
                        const previewText = toTrimmedString(chunkState.previewText);
                        const details = [];
                        details.push(`原文 ${Math.max(0, Number(chunkState.rawLength || 0))} 字`);
                        details.push(`尝试 ${Math.max(0, Number(chunkState.attempts || 0))} 次`);
                        details.push(`提取 ${Math.max(0, Number(chunkState.extractedCount || 0))} 条`);
                        if (toTrimmedString(chunkState.emptyReason)) {
                            details.push(`空因：${escapeHtml(formatMigrationEmptyReason(chunkState.emptyReason))}`);
                        }
                        if (toTrimmedString(chunkState.parseError)) {
                            details.push(`解析：${escapeHtml(chunkState.parseError)}`);
                        }
                        if (toTrimmedString(chunkState.error)) {
                            details.push(`报错：${escapeHtml(chunkState.error)}`);
                        }
                        return `
                            <div class="hip-migration-chunk-item ${status === 'failed' ? 'is-failed' : ''}">
                                <div class="hip-migration-chunk-head">
                                    <strong>第 ${index + 1} 段</strong>
                                    <span class="hip-migration-chunk-status">${statusText}</span>
                                </div>
                                <div class="hip-snapshot-meta">${details.join(' · ')}</div>
                                ${previewText
                                    ? `<div class="hip-box-hint">片段预览：${escapeHtml(previewText)}</div>`
                                    : ''}
                                ${status === 'failed'
                                    ? `<div class="hip-migration-chunk-actions"><button type="button" class="hip-btn-outline hip-btn-inline" data-hip-action="retry-yaml-segment" data-segment-index="${index}">从本段继续重试</button></div>`
                                    : ''}
                            </div>
                        `;
                    }).join('')
                    : '<div class="hip-empty hip-empty-compact">暂无分段数据。</div>';

                return `
                    <div class="hip-migration-session">
                        <div class="hip-migration-session-head">
                            <div class="hip-snapshot-time">分段任务：${sourceLabel}</div>
                            <div class="hip-snapshot-meta">状态：${escapeHtml(statusLabel)}</div>
                        </div>
                        <div class="hip-snapshot-meta">共 ${chunks.length} 段 · 已提取 ${totalExtracted} 条 · 原文约 ${totalRawLength} 字${failedCount > 0 ? ` · 失败 ${failedCount} 段` : ''}</div>
                        ${toTrimmedString(migrationSession.lastError)
                            ? `<div class="hip-box-hint">最近失败原因：${escapeHtml(toTrimmedString(migrationSession.lastError))}</div>`
                            : ''}
                        <div class="hip-migration-chunk-list">${chunkItemsHtml}</div>
                        <div class="hip-migration-session-actions">
                            <button type="button" class="hip-btn-outline hip-btn-inline" data-hip-action="clear-migration-session">清空这次分段状态</button>
                        </div>
                    </div>
                `;
            })()
            : '';
        const migrationProgress = state.migrationProgress && typeof state.migrationProgress === 'object'
            ? state.migrationProgress
            : { active: false, current: 0, total: 0, label: '' };
        const showMigrationProgress = !!migrationProgress.active && Number(migrationProgress.total || 0) > 0;
        const migrationProgressText = showMigrationProgress
            ? `转化节奏：${Number(migrationProgress.current || 0)} / ${Number(migrationProgress.total || 0)}${migrationProgress.label ? `（${migrationProgress.label}）` : ''}`
            : '';
        const snapshotsHtml = snapshots.length > 0
            ? snapshots.map(function renderSnapshotRow(s) {
                return `
                    <div class="hip-snapshot-item">
                        <div>
                            <div class="hip-snapshot-time">${escapeHtml(formatDateTime(s.createdAt))}</div>
                            <div class="hip-snapshot-meta">${Number(s.recordCount || 0)} 条记忆 · ${escapeHtml(formatBytes(s.sizeBytes))}</div>
                        </div>
                        <div class="hip-actions">
                            <button type="button" class="hip-btn-outline hip-btn-inline" data-hip-action="export-snapshot" data-snapshot-id="${escapeAttribute(s.id)}">导出</button>
                            <button type="button" class="hip-btn-danger hip-btn-inline" data-hip-action="delete-snapshot" data-snapshot-id="${escapeAttribute(s.id)}">删除</button>
                        </div>
                    </div>
                `;
            }).join('')
            : '<div class="hip-empty hip-empty-compact">空空如也，暂无保险箱存档。</div>';

        const failureHtml = dehydrateFailures.length > 0
            ? dehydrateFailures.map(function renderFailureItem(item) {
                const createdAtText = escapeHtml(formatDateTime(item.createdAt));
                const charLabel = escapeHtml(toTrimmedString(item.charLabel || item.charId) || '未知角色');
                const errorMessage = escapeHtml(toTrimmedString(item.errorMessage) || '脱水失败');
                const errorCode = toTrimmedString(item.errorCode);
                const errorDetail = toTrimmedString(item.errorDetail);
                const httpStatus = Number(item.httpStatus || 0);
                const retryCount = Math.max(0, Number(item.retryCount || 0));
                const batchSize = Math.max(0, Number(item.batchSize || 0));
                const cursorAbs = Math.max(0, Number(item.cursorAbs || 0));
                const finalizedEndAbs = Math.max(0, Number(item.finalizedEndAbs || 0));
                const unprocessedCount = Math.max(0, Number(item.unprocessedCount || 0));
                const sourceType = toTrimmedString(item && item.retryPayload && item.retryPayload.sourceType);
                const sourceLabel = formatDehydrateSourceLabel(sourceType);
                const lastRetriedAt = toTrimmedString(item.lastRetriedAt);
                const firstPreview = toTrimmedString(item.firstPreview);
                const lastPreview = toTrimmedString(item.lastPreview);
                const detailParts = [];
                if (errorCode) detailParts.push(`错误码：${escapeHtml(errorCode)}`);
                if (httpStatus > 0) detailParts.push(`HTTP ${httpStatus}`);
                detailParts.push(`已重试 ${retryCount} 次`);
                if (errorDetail) detailParts.push(`详情：${escapeHtml(errorDetail)}`);
                if (batchSize > 0) detailParts.push(`窗口 ${batchSize} 条`);
                if (finalizedEndAbs > 0 || cursorAbs > 0) detailParts.push(`游标 ${cursorAbs} -> ${finalizedEndAbs}`);
                if (unprocessedCount > 0) detailParts.push(`累计待处理 ${unprocessedCount} 条`);
                if (sourceLabel) detailParts.push(`来源：${escapeHtml(sourceLabel)}`);
                if (lastRetriedAt) detailParts.push(`上次重试：${escapeHtml(formatDateTime(lastRetriedAt))}`);
                return `
                    <div class="hip-dehydrate-failure-item">
                        <div class="hip-dehydrate-failure-main">
                            <div class="hip-snapshot-time">${createdAtText} · ${charLabel}</div>
                            <div class="hip-dehydrate-failure-msg">${errorMessage}</div>
                            <div class="hip-snapshot-meta">${detailParts.join(' · ')}</div>
                            ${firstPreview || lastPreview
                                ? `<div class="hip-box-hint">窗口预览：${escapeHtml(firstPreview || '（空）')}${lastPreview && lastPreview !== firstPreview ? ` → ${escapeHtml(lastPreview)}` : ''}</div>`
                                : ''}
                        </div>
                        <div class="hip-actions">
                            <button type="button" class="hip-btn-outline hip-btn-inline" data-hip-action="retry-dehydrate-failure" data-char-id="${escapeAttribute(item.charId)}" data-failure-id="${escapeAttribute(item.id)}">一键重试</button>
                            <button type="button" class="hip-btn-danger hip-btn-inline" data-hip-action="delete-dehydrate-failure" data-char-id="${escapeAttribute(item.charId)}" data-failure-id="${escapeAttribute(item.id)}">删除记录</button>
                        </div>
                    </div>
                `;
            }).join('')
            : '<div class="hip-empty hip-empty-compact">当前没有待重试的脱水失败任务。</div>';

        const digestOutcomeHtml = digestOutcomes.length > 0
            ? digestOutcomes.map(function renderDigestOutcome(item) {
                return renderDigestOutcomeCard(item);
            }).join('')
            : '<div class="hip-empty hip-empty-compact">最近 24h 暂无记录，你可以手动补一条让 TA 的变化可回看。</div>';

        return `
            <section class="hip-panel-wrapper">
                <div class="hip-glass-panel">
                    <div class="hip-export-section">
                        <button type="button" class="hip-btn-primary" data-hip-action="export-all">把 TA 的记忆带走</button>
                        <a class="hip-link" href="javascript:void(0)" data-hip-action="export-filtered">或 只带走刚刚筛选出的部分</a>
                    </div>

                    <div class="hip-section-divider"></div>

                    <div class="hip-box-header">
                        <h3>本地保险箱</h3>
                    </div>
                    <div class="hip-box-row">
                        <div class="hip-box-desc">在当前设备生成安全存档</div>
                        <button type="button" class="hip-btn-outline" data-hip-action="create-snapshot">生成备份</button>
                    </div>
                    <div class="hip-box-hint">备份保存在你的设备浏览器中，若日后清理浏览器数据，则会遗忘这些存档。</div>
                    <div class="hip-snapshot-list">
                        ${snapshotsHtml}
                    </div>

                    <div class="hip-section-divider"></div>
                    <div class="hip-box-header">
                        <h3 style="font-size: 15px;">▼ 依恋倾向</h3>
                    </div>
                    <form id="hip-admin-attachment-form" class="hip-attachment-form">
                        <select name="attachmentStyle" class="hip-select-block">
                            <option value="secure" ${attachmentStyle === 'secure' ? 'selected' : ''}>安全型</option>
                            <option value="anxious" ${attachmentStyle === 'anxious' ? 'selected' : ''}>焦虑型</option>
                            <option value="avoidant" ${attachmentStyle === 'avoidant' ? 'selected' : ''}>回避型</option>
                            <option value="disorganized" ${attachmentStyle === 'disorganized' ? 'selected' : ''}>混乱型</option>
                        </select>
                        <button type="submit" class="hip-btn-outline" ${state.migrationBusy ? 'disabled' : ''}>保存倾向</button>
                    </form>
                    <div class="hip-box-hint">最后更新时间：${escapeHtml(attachmentUpdatedAtText)}。你可手动覆盖，后续系统会继续观察。</div>

                    <div class="hip-section-divider"></div>
                    <div class="hip-box-header">
                        <h3 style="font-size: 15px;">▼ 最近 24h 变化成果</h3>
                        <button type="button" class="hip-btn-outline hip-btn-inline" data-hip-action="add-digest-outcome">新增一条</button>
                    </div>
                    <div class="hip-box-hint">这里只展示“最近 24h 的记忆让 TA 发生了什么变化”，便于你回看与手动修订。</div>
                    <div class="hip-snapshot-list">
                        ${digestOutcomeHtml}
                    </div>

                    <div class="hip-section-divider"></div>
                    <div class="hip-box-header">
                        <h3 style="font-size: 15px;">▼ 脱水失败任务</h3>
                        <button type="button" class="hip-btn-outline hip-btn-inline" data-hip-action="refresh-dehydrate-failures">刷新</button>
                    </div>
                    <div class="hip-box-hint">这里会展示后台脱水失败的具体报错，你可以直接一键重试。</div>
                    <div class="hip-snapshot-list">
                        ${failureHtml}
                    </div>

                    <div class="hip-section-divider"></div>
                    <div class="hip-box-header">
                        <h3 style="font-size: 15px;">▼ 唤醒旧忆 (迁移)</h3>
                    </div>
                    <div class="hip-box-hint">将普通的存档记录转化为具有情感温度的海马体记忆格式，原格式数据会先自动保留备份。</div>
                    ${showMigrationProgress ? `<div class="hip-migration-progress">${escapeHtml(migrationProgressText)}</div>` : ''}
                    <div class="hip-migration-actions">
                        <button type="button" class="hip-btn-outline" data-hip-action="migrate-yaml-memory" ${canMigrate ? '' : 'disabled'}>开始融合</button>
                        <button type="button" class="hip-btn-outline" data-hip-action="retry-missing-embeddings" ${canMigrate ? '' : 'disabled'}>回填缺失向量</button>
                    </div>
                    <form id="hip-admin-manual-yaml-form" class="hip-manual-yaml-form">
                        <textarea
                            name="yamlText"
                            class="hip-manual-yaml-input"
                            placeholder="可直接粘贴你从其他地方整理好的 YAML 文本，系统会自动分段并支持失败段续跑。"
                        >${escapeHtml(state.manualYamlInput || '')}</textarea>
                        <div class="hip-manual-yaml-actions">
                            <button type="submit" class="hip-btn-outline" ${canMigrate ? '' : 'disabled'}>融合手动粘贴 YAML</button>
                        </div>
                    </form>
                    ${migrationSessionHtml}
                </div>
            </section>
        `;
    }

    /**
     * 渲染本地快照页。
     */
    function formatRelationshipArcUpdateMode(mode) {
        const safeMode = toTrimmedString(mode).toLowerCase();
        if (safeMode === 'compression') return '精炼压缩';
        if (safeMode === 'revision') return '手动修订';
        if (safeMode === 'tail_update') return '最近阶段更新';
        if (safeMode === 'manual_import') return '手动导入';
        if (safeMode === 'auto_full_rebuild') return '自动重建';
        return '整条重建';
    }

    function buildRelationshipArcMetaLine(record) {
        const safeRecord = record && typeof record === 'object' ? record : null;
        if (!safeRecord) return '';
        const parts = [];
        if (safeRecord.generatedAt) parts.push(formatDateTime(safeRecord.generatedAt));
        if (safeRecord.currentStage && safeRecord.currentStage.title) parts.push(`当前阶段：${safeRecord.currentStage.title}`);
        if (Array.isArray(safeRecord.stages) && safeRecord.stages.length > 0) parts.push(`阶段 ${safeRecord.stages.length}`);
        if (safeRecord.sourceSummary && (safeRecord.sourceSummary.sourceEventCount > 0 || safeRecord.sourceSummary.sourceFragmentCount > 0)) {
            parts.push(`事件 ${safeRecord.sourceSummary.sourceEventCount} / 碎片 ${safeRecord.sourceSummary.sourceFragmentCount}`);
        }
        return parts.join(' · ');
    }

    function renderRelationshipArcListBlock(title, items) {
        const safeItems = Array.isArray(items) ? items.map(toTrimmedString).filter(Boolean) : [];
        if (safeItems.length <= 0) return '';
        return `
            <div style="margin-top:12px;">
                <div style="font-size:13px;font-weight:600;color:rgba(255,255,255,0.9);">${escapeHtml(title)}</div>
                <div style="margin-top:8px;font-size:13px;line-height:1.8;color:rgba(255,255,255,0.72);">${safeItems.map(function mapItem(item) {
                    return `- ${escapeHtml(item)}`;
                }).join('<br>')}</div>
            </div>
        `;
    }

    function renderRelationshipArcStageOverviewPanel(stages, currentStageNumber) {
        const safeStages = Array.isArray(stages) ? stages.filter(Boolean) : [];
        if (safeStages.length <= 0) return '';
        const currentNumber = Math.max(1, Math.floor(Number(currentStageNumber || 1) || 1));
        return `
            <section class="hip-glass-panel" style="padding:18px 20px;">
                <div class="hip-box-header">
                    <h3 style="font-size:16px;">阶段速览</h3>
                    <div class="hip-box-hint">先看整体脉络，再往下读每个阶段的细节。</div>
                </div>
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-top:14px;">
                    ${safeStages.map(function renderStageChip(stage) {
                        const stageNumber = Math.max(1, Math.floor(Number(stage && stage.stage || 1) || 1));
                        const keyEventCount = Array.isArray(stage && stage.keyEvents) ? stage.keyEvents.length : 0;
                        const isCurrent = stageNumber === currentNumber;
                        return `
                            <div style="padding:14px 15px;border-radius:16px;border:1px solid ${isCurrent ? 'rgba(96,165,250,0.42)' : 'rgba(255,255,255,0.08)'};background:${isCurrent ? 'rgba(59,130,246,0.10)' : 'rgba(255,255,255,0.04)'};">
                                <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
                                    <div style="font-size:12px;color:${isCurrent ? '#bfdbfe' : 'rgba(255,255,255,0.55)'};">阶段 ${stageNumber}</div>
                                    ${isCurrent ? '<div style="font-size:12px;color:#bfdbfe;">当前所在</div>' : ''}
                                </div>
                                <div style="margin-top:8px;font-size:15px;font-weight:600;color:rgba(255,255,255,0.92);line-height:1.5;">${escapeHtml(toTrimmedString(stage && stage.title) || `阶段 ${stageNumber}`)}</div>
                                ${toTrimmedString(stage && stage.period) ? `<div style="margin-top:6px;font-size:12px;color:rgba(255,255,255,0.58);">${escapeHtml(toTrimmedString(stage.period))}</div>` : ''}
                                <div style="margin-top:10px;font-size:12px;color:rgba(255,255,255,0.68);">关键事件 ${keyEventCount} 条</div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </section>
        `;
    }

    function renderRelationshipArcStageCard(stage) {
        const safeStage = stage && typeof stage === 'object' ? stage : null;
        if (!safeStage) return '';
        const badges = [
            renderNotebookBadge(`阶段 ${Math.max(1, Number(safeStage.stage || 1))}`, '#dbeafe', 'rgba(96, 165, 250, 0.12)')
        ];
        if (safeStage.period) {
            badges.push(renderNotebookBadge(safeStage.period, '#fde68a', 'rgba(245, 158, 11, 0.12)'));
        }
        if (Number.isFinite(safeStage.confidence)) {
            badges.push(renderNotebookBadge(`置信 ${(Math.max(0, Math.min(1, Number(safeStage.confidence))) * 100).toFixed(0)}%`, '#c4b5fd', 'rgba(139, 92, 246, 0.14)'));
        }

        const keyEventsHtml = safeStage.keyEvents.length > 0
            ? safeStage.keyEvents.map(function renderKeyEvent(item) {
                const metaParts = [];
                if (item.date) metaParts.push(item.date);
                if (item.theme) metaParts.push(item.theme);
                if (item.evidenceEventIds.length > 0) metaParts.push(`事件证据 ${item.evidenceEventIds.length}`);
                if (item.evidenceFragmentIds.length > 0) metaParts.push(`碎片证据 ${item.evidenceFragmentIds.length}`);
                return `
                    <div style="padding:12px 14px;border-radius:14px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);">
                        <div style="font-size:12px;color:rgba(255,255,255,0.52);">${escapeHtml(metaParts.join(' · '))}</div>
                        <div style="margin-top:6px;font-size:14px;color:rgba(255,255,255,0.92);line-height:1.75;">${escapeHtml(item.summary || '（暂无摘要）')}</div>
                        ${item.impact ? `<div style="margin-top:8px;font-size:12px;color:rgba(255,255,255,0.6);">长期影响：${escapeHtml(item.impact)}</div>` : ''}
                    </div>
                `;
            }).join('')
            : '<div class="hip-empty hip-empty-compact">这一阶段还没有整理出关键事件。</div>';

        return `
            <section class="hip-glass-panel" style="padding:18px 20px;">
                <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;">
                    <div style="flex:1;min-width:240px;">
                        <div style="font-size:17px;font-weight:600;color:rgba(255,255,255,0.94);">${escapeHtml(safeStage.title || `阶段 ${safeStage.stage}`)}</div>
                        ${safeStage.relationshipShift ? `<div style="margin-top:8px;font-size:13px;color:rgba(255,255,255,0.68);line-height:1.7;">${escapeHtml(safeStage.relationshipShift)}</div>` : ''}
                    </div>
                    <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;">${badges.join('')}</div>
                </div>
                <div style="display:grid;gap:10px;margin-top:16px;">${keyEventsHtml}</div>
                ${renderRelationshipArcListBlock('阶段内仍在延续的线索', safeStage.ongoingThreads)}
                ${safeStage.injectSummary ? `<div class="hip-box-hint" style="margin-top:12px;">主聊天速记：${escapeHtml(safeStage.injectSummary)}</div>` : ''}
            </section>
        `;
    }

    function countRelationshipArcKeyEvents(stages) {
        return (Array.isArray(stages) ? stages : []).reduce(function sum(total, stage) {
            return total + (Array.isArray(stage && stage.keyEvents) ? stage.keyEvents.length : 0);
        }, 0);
    }

    function countRelationshipArcDatedKeyEvents(stages) {
        return (Array.isArray(stages) ? stages : []).reduce(function sum(total, stage) {
            return total + (Array.isArray(stage && stage.keyEvents)
                ? stage.keyEvents.filter(function filterEvent(item) {
                    return !!toTrimmedString(item && item.date);
                }).length
                : 0);
        }, 0);
    }

    function buildRelationshipArcVersionStats(version) {
        const safeVersion = version && typeof version === 'object' ? version : {};
        const stages = Array.isArray(safeVersion.stages) ? safeVersion.stages : [];
        const promptText = toTrimmedString(safeVersion.promptInjectionFull);
        return {
            stageCount: stages.length,
            keyEventCount: countRelationshipArcKeyEvents(stages),
            datedKeyEventCount: countRelationshipArcDatedKeyEvents(stages),
            themedKeyEventCount: (Array.isArray(stages) ? stages : []).reduce(function sum(total, stage) {
                return total + (Array.isArray(stage && stage.keyEvents)
                    ? stage.keyEvents.filter(function filterEvent(item) {
                        return !!toTrimmedString(item && item.theme);
                    }).length
                    : 0);
            }, 0),
            promptLineCount: promptText ? promptText.split(/\r?\n/).length : 0
        };
    }

    function estimateRelationshipArcTokens(text) {
        const safe = toTrimmedString(text);
        if (!safe) return 0;
        return Math.ceil(safe.length / 3.6);
    }

    function buildRelationshipArcTextStats(text) {
        const safe = toTrimmedString(text);
        return {
            chars: safe.length,
            tokens: estimateRelationshipArcTokens(safe),
            lines: safe ? safe.split(/\r?\n/).length : 0
        };
    }

    function normalizeRelationshipArcTextStats(rawStats, fallbackText) {
        const fallback = buildRelationshipArcTextStats(fallbackText);
        const source = rawStats && typeof rawStats === 'object' ? rawStats : {};
        const chars = Math.max(0, Math.floor(Number(source.chars || source.charCount || fallback.chars) || 0));
        const tokens = Math.max(0, Math.floor(Number(source.tokens || source.tokenCount || fallback.tokens) || 0));
        const lines = Math.max(0, Math.floor(Number(source.lines || source.lineCount || fallback.lines) || 0));
        return {
            chars: chars,
            tokens: tokens,
            lines: lines
        };
    }

    function normalizeRelationshipArcCompressionStats(rawStats, currentRecord, previewRecord) {
        const source = rawStats && typeof rawStats === 'object' ? rawStats : {};
        const currentText = toTrimmedString(currentRecord && currentRecord.promptInjectionFull);
        const previewText = toTrimmedString(previewRecord && (previewRecord.prompt_injection_full || previewRecord.promptInjectionFull));
        return {
            before: normalizeRelationshipArcTextStats(source.before, currentText),
            target: normalizeRelationshipArcTextStats(source.target, ''),
            after: normalizeRelationshipArcTextStats(source.after, previewText)
        };
    }

    function formatRelationshipArcTextStats(stats) {
        const safeStats = stats && typeof stats === 'object' ? stats : {};
        const chars = Math.max(0, Math.floor(Number(safeStats.chars || 0) || 0));
        const tokens = Math.max(0, Math.floor(Number(safeStats.tokens || 0) || 0));
        return `约 ${chars} 字 / ${tokens} tokens`;
    }

    function renderRelationshipArcCompressionPreviewBlock(record, stats, revisionNotes, diffLines, disabledAttr) {
        const safeRecord = record && typeof record === 'object' ? record : null;
        if (!safeRecord) return '';
        const safeStats = stats && typeof stats === 'object' ? stats : {};
        const safeRevisionNotes = Array.isArray(revisionNotes) ? revisionNotes : [];
        const safeDiffLines = Array.isArray(diffLines) ? diffLines : [];
        const buttonsDisabled = toTrimmedString(disabledAttr);
        return `
            <section class="hip-glass-panel" style="padding:18px 20px;">
                <div class="hip-box-header">
                    <h3 style="font-size:16px;">精炼/压缩预览</h3>
                    <div class="hip-box-hint">还没写入。你可以先读一遍，也可以直接在下面手动改，满意后再保存为新版本。</div>
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;">
                    ${renderNotebookBadge(`压缩前 ${formatRelationshipArcTextStats(safeStats.before)}`, '#e5e7eb', 'rgba(255,255,255,0.08)')}
                    ${safeStats.target && safeStats.target.chars > 0 ? renderNotebookBadge(`目标 ${formatRelationshipArcTextStats(safeStats.target)}`, '#fde68a', 'rgba(245,158,11,0.14)') : ''}
                    ${renderNotebookBadge(`压缩后 ${formatRelationshipArcTextStats(safeStats.after)}`, '#bbf7d0', 'rgba(34,197,94,0.14)')}
                    ${renderNotebookBadge(`将生成 v${safeRecord.versionNumber}`, '#dbeafe', 'rgba(96,165,250,0.12)')}
                </div>
                ${safeRevisionNotes.length > 0 ? `<div class="hip-box-hint" style="margin-top:8px;">这次处理：${escapeHtml(safeRevisionNotes.join(' / '))}</div>` : ''}
                ${safeDiffLines.length > 0 ? `<div class="hip-box-hint" style="margin-top:12px;">和当前版相比：<br>${safeDiffLines.map(function mapLine(line) { return `- ${escapeHtml(line)}`; }).join('<br>')}</div>` : ''}
                <form id="hip-admin-relationship-compression-form" style="margin-top:14px;">
                    <textarea
                        name="relationshipCompressionText"
                        class="hip-manual-yaml-input"
                        style="min-height:260px;"
                        ${buttonsDisabled}
                    >${escapeHtml(safeRecord.promptInjectionFull || '')}</textarea>
                    <div class="hip-manual-yaml-actions">
                        <button type="button" class="hip-btn-outline" data-hip-action="clear-relationship-compression-preview" ${buttonsDisabled}>取消预览</button>
                        <button type="submit" class="hip-btn-primary" ${buttonsDisabled}>保存为新版本</button>
                    </div>
                </form>
            </section>
        `;
    }

    function formatRelationshipArcSourceOriginLabel(value) {
        const safeValue = toTrimmedString(value).toLowerCase();
        if (safeValue === 'manual_import') return '手动贴入旧记忆';
        if (safeValue === 'prior_arc') return '上一版关系脉络';
        if (safeValue === 'event_table') return '记忆事件';
        if (safeValue === 'high_weight_fragments') return '高权重碎片';
        if (safeValue === 'legacy_yaml') return '旧版 YAML 记忆';
        if (safeValue === 'new_events') return '最近新增事件';
        if (safeValue === 'compressed_arc') return '精炼压缩';
        if (safeValue === 'manual_edit') return '手动编辑';
        return toTrimmedString(value);
    }

    function formatRelationshipArcSourceOriginList(values) {
        return normalizeTextArray(values, 12)
            .map(formatRelationshipArcSourceOriginLabel)
            .filter(Boolean);
    }

    function formatRelationshipArcRevisionNote(value) {
        const safeValue = toTrimmedString(value).toLowerCase();
        if (safeValue === 'manual_import_structure_preserved') return '导入时保留了旧脉络的阶段骨架';
        if (safeValue === 'prompt_rebuilt_from_stages') return '主聊天正文已按阶段自动重组';
        if (safeValue === 'relationship_arc_compressed') return '已做精炼压缩';
        if (safeValue === 'relationship_arc_manually_edited') return '用户手动编辑过正文';
        return toTrimmedString(value);
    }

    function formatRelationshipArcRevisionNotes(values) {
        return normalizeTextArray(values, 12)
            .map(formatRelationshipArcRevisionNote)
            .filter(Boolean);
    }

    function summarizeRelationshipArcListDiff(label, currentList, compareList) {
        const current = normalizeTextArray(currentList, 12);
        const compare = normalizeTextArray(compareList, 12);
        const added = current.filter(function filterItem(item) {
            return !compare.includes(item);
        }).slice(0, 3);
        const removed = compare.filter(function filterItem(item) {
            return !current.includes(item);
        }).slice(0, 3);
        if (added.length <= 0 && removed.length <= 0) return '';
        const parts = [];
        if (added.length > 0) parts.push(`新增：${added.join(' / ')}`);
        if (removed.length > 0) parts.push(`移除：${removed.join(' / ')}`);
        return `${label}：${parts.join('；')}`;
    }

    function buildRelationshipArcCompareDiffLines(current, compare) {
        const safeCurrent = current && typeof current === 'object' ? current : null;
        const safeCompare = compare && typeof compare === 'object' ? compare : null;
        if (!safeCurrent || !safeCompare) return [];
        const currentStats = buildRelationshipArcVersionStats(safeCurrent);
        const compareStats = buildRelationshipArcVersionStats(safeCompare);
        const lines = [];
        if (safeCurrent.versionNumber !== safeCompare.versionNumber) {
            lines.push(`版本：v${safeCompare.versionNumber} -> v${safeCurrent.versionNumber}`);
        }
        if (compareStats.stageCount !== currentStats.stageCount) {
            lines.push(`阶段数：${compareStats.stageCount} -> ${currentStats.stageCount}`);
        }
        if (compareStats.keyEventCount !== currentStats.keyEventCount) {
            lines.push(`关键事件：${compareStats.keyEventCount} -> ${currentStats.keyEventCount}`);
        }
        if (compareStats.datedKeyEventCount !== currentStats.datedKeyEventCount) {
            lines.push(`带日期事件：${compareStats.datedKeyEventCount} -> ${currentStats.datedKeyEventCount}`);
        }
        if (toTrimmedString(safeCompare.currentStage && safeCompare.currentStage.title) !== toTrimmedString(safeCurrent.currentStage && safeCurrent.currentStage.title)) {
            lines.push(`当前阶段：${toTrimmedString(safeCompare.currentStage && safeCompare.currentStage.title) || '无'} -> ${toTrimmedString(safeCurrent.currentStage && safeCurrent.currentStage.title) || '无'}`);
        }
        const newlyAddedStages = (Array.isArray(safeCurrent.stages) ? safeCurrent.stages : []).slice(compareStats.stageCount).map(function mapStage(stage) {
            return toTrimmedString(stage && stage.title) || `阶段 ${Math.max(1, Math.floor(Number(stage && stage.stage) || 1))}`;
        }).filter(Boolean);
        if (newlyAddedStages.length > 0) {
            lines.push(`新增阶段：${newlyAddedStages.join(' / ')}`);
        }
        const currentLastStage = Array.isArray(safeCurrent.stages) && safeCurrent.stages.length > 0
            ? safeCurrent.stages[safeCurrent.stages.length - 1]
            : null;
        const compareLastStage = Array.isArray(safeCompare.stages) && safeCompare.stages.length > 0
            ? safeCompare.stages[safeCompare.stages.length - 1]
            : null;
        if (
            currentLastStage
            && compareLastStage
            && toTrimmedString(currentLastStage.title) === toTrimmedString(compareLastStage.title)
            && (currentLastStage.keyEvents || []).length !== (compareLastStage.keyEvents || []).length
        ) {
            lines.push(`最近阶段补充事件：${(compareLastStage.keyEvents || []).length} -> ${(currentLastStage.keyEvents || []).length}`);
        }
        if (toTrimmedString(safeCompare.currentRelationshipState && safeCompare.currentRelationshipState.oneParagraphSummary) !== toTrimmedString(safeCurrent.currentRelationshipState && safeCurrent.currentRelationshipState.oneParagraphSummary)) {
            lines.push('当前关系状态摘要有变化');
        }
        [
            summarizeRelationshipArcListDiff('持续线索', safeCurrent.currentRelationshipState && safeCurrent.currentRelationshipState.activeThreads, safeCompare.currentRelationshipState && safeCompare.currentRelationshipState.activeThreads),
            summarizeRelationshipArcListDiff('未解张力', safeCurrent.currentRelationshipState && safeCurrent.currentRelationshipState.unresolvedTensions, safeCompare.currentRelationshipState && safeCompare.currentRelationshipState.unresolvedTensions),
            summarizeRelationshipArcListDiff('稳定纽带', safeCurrent.currentRelationshipState && safeCurrent.currentRelationshipState.stableBonds, safeCompare.currentRelationshipState && safeCompare.currentRelationshipState.stableBonds),
            summarizeRelationshipArcListDiff('共同方向', safeCurrent.currentRelationshipState && safeCurrent.currentRelationshipState.sharedDirection, safeCompare.currentRelationshipState && safeCompare.currentRelationshipState.sharedDirection)
        ].filter(Boolean).forEach(function appendLine(line) {
            lines.push(line);
        });
        if (compareStats.promptLineCount !== currentStats.promptLineCount) {
            lines.push(`注入长度：${compareStats.promptLineCount} 行 -> ${currentStats.promptLineCount} 行`);
        }
        if (safeCompare.updateMode !== safeCurrent.updateMode) {
            lines.push(`更新方式：${formatRelationshipArcUpdateMode(safeCompare.updateMode)} -> ${formatRelationshipArcUpdateMode(safeCurrent.updateMode)}`);
        }
        return lines;
    }

    function renderRelationshipArcComparePanel(current, compare) {
        const safeCurrent = current && typeof current === 'object' ? current : null;
        const safeCompare = compare && typeof compare === 'object' ? compare : null;
        if (!safeCurrent || !safeCompare || safeCurrent.id === safeCompare.id) return '';

        const diffLines = buildRelationshipArcCompareDiffLines(safeCurrent, safeCompare);
        const currentRevisionNotes = formatRelationshipArcRevisionNotes(safeCurrent.revisionNotes);
        const compareRevisionNotes = formatRelationshipArcRevisionNotes(safeCompare.revisionNotes);

        return `
            <section class="hip-glass-panel" style="padding:18px 20px;">
                <div class="hip-box-header">
                    <h3 style="font-size:16px;">这版和当前差在哪</h3>
                    <div class="hip-box-hint">这里会把当前生效版本和你选中的旧版本做个一眼能看懂的对比。</div>
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;">
                    ${renderNotebookBadge(`当前 v${safeCurrent.versionNumber}`, '#bbf7d0', 'rgba(34,197,94,0.14)')}
                    ${renderNotebookBadge(`对比 v${safeCompare.versionNumber}`, '#fde68a', 'rgba(245,158,11,0.14)')}
                </div>
                <div style="margin-top:14px;font-size:13px;line-height:1.8;color:rgba(255,255,255,0.72);">
                    ${diffLines.length > 0 ? diffLines.map(function mapLine(line) {
                        return `- ${escapeHtml(line)}`;
                    }).join('<br>') : '两版结构几乎一致，主要可能只是措辞微调。'}
                </div>
                ${currentRevisionNotes.length > 0 ? `<div class="hip-box-hint" style="margin-top:12px;">当前版修订说明：${escapeHtml(currentRevisionNotes.join(' / '))}</div>` : ''}
                ${compareRevisionNotes.length > 0 ? `<div class="hip-box-hint" style="margin-top:8px;">历史版修订说明：${escapeHtml(compareRevisionNotes.join(' / '))}</div>` : ''}
            </section>
        `;
    }

    function renderRelationshipArcVersionCard(version, currentVersionId, compareVersionId, busy) {
        const safeVersion = version && typeof version === 'object' ? version : null;
        if (!safeVersion) return '';
        const versionId = toTrimmedString(safeVersion.id || safeVersion.versionId);
        const isCurrent = safeVersion.isCurrent || versionId === toTrimmedString(currentVersionId);
        const isCompared = versionId && versionId === toTrimmedString(compareVersionId);
        const stats = buildRelationshipArcVersionStats(safeVersion);
        const sourceOrigin = formatRelationshipArcSourceOriginList(
            safeVersion.sourceSummary && Array.isArray(safeVersion.sourceSummary.sourceOrigin)
                ? safeVersion.sourceSummary.sourceOrigin
                : []
        );
        const revisionNotes = formatRelationshipArcRevisionNotes(safeVersion.revisionNotes);
        const sourceSummaryParts = [];
        if (Math.max(0, Number(safeVersion.sourceSummary && safeVersion.sourceSummary.sourceEventCount || 0)) > 0) {
            sourceSummaryParts.push(`事件 ${Math.max(0, Number(safeVersion.sourceSummary && safeVersion.sourceSummary.sourceEventCount || 0))} 条`);
        }
        if (Math.max(0, Number(safeVersion.sourceSummary && safeVersion.sourceSummary.sourceFragmentCount || 0)) > 0) {
            sourceSummaryParts.push(`高权重碎片 ${Math.max(0, Number(safeVersion.sourceSummary && safeVersion.sourceSummary.sourceFragmentCount || 0))} 条`);
        }
        if (Math.max(0, Number(stats.datedKeyEventCount || 0)) > 0) {
            sourceSummaryParts.push(`带日期事件 ${Math.max(0, Number(stats.datedKeyEventCount || 0))} 条`);
        }
        if (Math.max(0, Number(stats.themedKeyEventCount || 0)) > 0) {
            sourceSummaryParts.push(`主题标签 ${Math.max(0, Number(stats.themedKeyEventCount || 0))} 个`);
        }
        if (Math.max(0, Number(stats.promptLineCount || 0)) > 0) {
            sourceSummaryParts.push(`注入正文 ${Math.max(0, Number(stats.promptLineCount || 0))} 行`);
        }

        return `
            <div class="hip-snapshot-item" style="${isCompared ? 'border-color:rgba(245,158,11,0.35);background:rgba(245,158,11,0.06);' : ''}">
                <div style="flex:1;min-width:220px;">
                    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
                        <div class="hip-snapshot-time">v${safeVersion.versionNumber}</div>
                        ${renderNotebookBadge(formatRelationshipArcUpdateMode(safeVersion.updateMode), '#dbeafe', 'rgba(96,165,250,0.12)')}
                        ${isCurrent ? renderNotebookBadge('当前生效', '#bbf7d0', 'rgba(34,197,94,0.14)') : ''}
                        ${renderNotebookBadge(`阶段 ${stats.stageCount}`, '#fde68a', 'rgba(245,158,11,0.14)')}
                        ${renderNotebookBadge(`关键事件 ${stats.keyEventCount}`, '#ddd6fe', 'rgba(139,92,246,0.14)')}
                    </div>
                    <div class="hip-snapshot-meta" style="margin-top:6px;">${escapeHtml(buildRelationshipArcMetaLine(safeVersion) || '暂无元信息')}</div>
                    ${sourceOrigin.length > 0 ? `<div class="hip-box-hint" style="margin-top:8px;">素材来源：${escapeHtml(sourceOrigin.join(' / '))}</div>` : ''}
                    ${sourceSummaryParts.length > 0 ? `<div class="hip-box-hint" style="margin-top:8px;">这版用了：${escapeHtml(sourceSummaryParts.join(' / '))}</div>` : ''}
                    ${revisionNotes.length > 0 ? `<div class="hip-box-hint" style="margin-top:8px;">修订说明：${escapeHtml(revisionNotes.join(' / '))}</div>` : ''}
                </div>
                <div class="hip-actions">
                    ${!isCurrent ? `<button type="button" class="hip-btn-outline hip-btn-inline" data-hip-action="compare-relationship-arc-version" data-version-id="${escapeAttribute(versionId)}" ${busy ? 'disabled' : ''}>${isCompared ? '取消对比' : '和当前版比'}</button>` : ''}
                    ${!isCurrent ? `<button type="button" class="hip-btn-danger hip-btn-inline" data-hip-action="rollback-relationship-arc-version" data-version-id="${escapeAttribute(versionId)}" ${busy ? 'disabled' : ''}>恢复成这版</button>` : ''}
                </div>
            </div>
        `;
    }

    async function handleRebuildRelationshipArc() {
        const client = getClient();
        const charId = toTrimmedString(state.filters.charId);
        const helper = getRelationshipArcHelperState();
        const relationship = getRelationshipArcData();
        if (!client || typeof client.rebuildRelationshipArc !== 'function' || !charId) {
            showToastSafe('当前环境暂时无法重建关系脉络。', 'error');
            return;
        }
        if (relationship.current && typeof root.confirm === 'function') {
            const confirmed = root.confirm('这会重建整条关系脉络并生成一个新版本，旧版本会自动保留在历史里。确定继续吗？');
            if (!confirmed) return;
        }

        helper.busy = true;
        renderLayout();
        try {
            const result = await client.rebuildRelationshipArc(charId);
            if (result && result.ok && !result.noop) {
                showToastSafe('关系脉络已重建。', 'success');
                await refreshActiveTab();
                return;
            }
            if (result && result.noop) {
                showToastSafe('当前材料还不够厚，暂时生成不出有意义的关系脉络。', 'info');
                return;
            }
            showToastSafe('关系脉络重建失败，请稍后再试。', 'error');
        } catch (error) {
            showToastSafe(toTrimmedString(error && error.message) || '关系脉络重建失败。', 'error');
        } finally {
            helper.busy = false;
            renderLayout();
        }
    }

    async function handleTailUpdateRelationshipArc() {
        const client = getClient();
        const charId = toTrimmedString(state.filters.charId);
        const helper = getRelationshipArcHelperState();
        if (!client || typeof client.updateRelationshipArcTail !== 'function' || !charId) {
            showToastSafe('当前环境暂时无法更新最近阶段。', 'error');
            return;
        }

        helper.busy = true;
        renderLayout();
        try {
            const result = await client.updateRelationshipArcTail(charId, { force: true });
            if (result && result.ok && !result.noop) {
                showToastSafe('最近阶段已更新。', 'success');
                await refreshActiveTab();
                return;
            }
            if (result && result.noop) {
                showToastSafe('目前还没有足够新的关系事件，不需要更新最近阶段。', 'info');
                return;
            }
            showToastSafe('更新最近阶段失败，请稍后再试。', 'error');
        } catch (error) {
            showToastSafe(toTrimmedString(error && error.message) || '更新最近阶段失败。', 'error');
        } finally {
            helper.busy = false;
            renderLayout();
        }
    }

    async function handlePreviewRelationshipArcCompression() {
        const client = getClient();
        const charId = toTrimmedString(state.filters.charId);
        const helper = getRelationshipArcHelperState();
        const relationship = getRelationshipArcData();
        if (!relationship.current) {
            showToastSafe('当前还没有关系脉络，先生成或导入一版再压缩。', 'info');
            return;
        }
        if (!client || typeof client.previewRelationshipArcCompression !== 'function' || !charId) {
            showToastSafe('当前环境暂时无法压缩关系脉络。', 'error');
            return;
        }

        helper.busy = true;
        helper.compressionPreviewRecord = null;
        helper.compressionStats = null;
        helper.previewRecord = null;
        renderLayout();
        try {
            const result = await client.previewRelationshipArcCompression(charId, {});
            if (result && result.ok && result.preview) {
                helper.compressionPreviewRecord = normalizeRelationshipArcRecordView(result.preview);
                helper.compressionStats = normalizeRelationshipArcCompressionStats(result.stats, relationship.current, result.preview);
                showToastSafe('压缩预览已生成，可以先看一眼，也可以手动改。', 'success');
                return;
            }
            if (result && result.noop) {
                showToastSafe('当前关系脉络内容太少，暂时不需要压缩。', 'info');
                return;
            }
            showToastSafe('生成压缩预览失败，请稍后再试。', 'error');
        } catch (error) {
            showToastSafe(toTrimmedString(error && error.message) || '生成压缩预览失败。', 'error');
        } finally {
            helper.busy = false;
            renderLayout();
        }
    }

    async function handleSaveRelationshipArcCompression(promptText) {
        const client = getClient();
        const charId = toTrimmedString(state.filters.charId);
        const helper = getRelationshipArcHelperState();
        const previewRecord = helper.compressionPreviewRecord && typeof helper.compressionPreviewRecord === 'object'
            ? helper.compressionPreviewRecord
            : null;
        const text = toTrimmedString(promptText);
        if (!client || typeof client.saveRelationshipArcDraft !== 'function' || !charId) {
            showToastSafe('当前环境暂时无法保存压缩版关系脉络。', 'error');
            return;
        }
        if (!previewRecord) {
            showToastSafe('还没有可保存的压缩预览。', 'info');
            return;
        }
        if (!text) {
            showToastSafe('压缩后的正文不能为空。', 'info');
            return;
        }

        previewRecord.promptInjectionFull = text;
        helper.busy = true;
        renderLayout();
        try {
            const draft = Object.assign({}, previewRecord, {
                promptInjectionFull: text
            });
            const result = await client.saveRelationshipArcDraft(charId, {
                draft: draft,
                updateMode: 'compression'
            });
            if (result && result.ok && result.record) {
                helper.compressionPreviewRecord = null;
                helper.compressionStats = null;
                showToastSafe('压缩版关系脉络已保存，旧版本仍可回滚。', 'success');
                await refreshActiveTab();
                return;
            }
            showToastSafe('保存压缩版失败，请稍后再试。', 'error');
        } catch (error) {
            showToastSafe(toTrimmedString(error && error.message) || '保存压缩版关系脉络失败。', 'error');
        } finally {
            helper.busy = false;
            renderLayout();
        }
    }

    async function handlePreviewRelationshipArcImport(importText) {
        const client = getClient();
        const charId = toTrimmedString(state.filters.charId);
        const helper = getRelationshipArcHelperState();
        const text = toTrimmedString(importText);
        if (!client || typeof client.previewRelationshipArcImport !== 'function' || !charId) {
            showToastSafe('当前环境暂时无法预览导入关系脉络。', 'error');
            return;
        }
        if (!text) {
            showToastSafe('先把旧记忆文本贴进去，再生成预览。', 'info');
            return;
        }

        helper.busy = true;
        helper.importText = text;
        helper.previewRecord = null;
        helper.compressionPreviewRecord = null;
        helper.compressionStats = null;
        renderLayout();
        try {
            const result = await client.previewRelationshipArcImport(charId, { text: text });
            if (result && result.ok && result.preview) {
                helper.previewRecord = normalizeRelationshipArcRecordView(result.preview);
                showToastSafe('导入预览已生成，可以先看一眼再确认覆盖。', 'success');
                return;
            }
            if (result && result.noop) {
                showToastSafe('这份文本还不足以生成可用的关系脉络。', 'info');
                return;
            }
            showToastSafe('生成导入预览失败，请稍后再试。', 'error');
        } catch (error) {
            showToastSafe(formatRelationshipArcImportErrorMessage(error, '生成导入预览失败。'), 'error');
        } finally {
            helper.busy = false;
            renderLayout();
        }
    }

    async function handleConfirmRelationshipArcImport() {
        const client = getClient();
        const charId = toTrimmedString(state.filters.charId);
        const helper = getRelationshipArcHelperState();
        const relationship = getRelationshipArcData();
        const text = toTrimmedString(helper.importText);
        if (!client || typeof client.importRelationshipArcFromText !== 'function' || !charId) {
            showToastSafe('当前环境暂时无法导入关系脉络。', 'error');
            return;
        }
        if (!text) {
            showToastSafe('没有可导入的文本。', 'info');
            return;
        }
        if (relationship.current && typeof root.confirm === 'function') {
            const confirmed = root.confirm('当前已有关系脉络，导入会覆盖现有版本，但旧版会自动留在历史里。是否继续？');
            if (!confirmed) return;
        }

        helper.busy = true;
        renderLayout();
        try {
            const result = await client.importRelationshipArcFromText(charId, { text: text });
            if (result && result.ok && result.record) {
                helper.previewRecord = null;
                showToastSafe('旧记忆已导入并生成新关系脉络。', 'success');
                await refreshActiveTab();
                return;
            }
            showToastSafe('导入关系脉络失败，请稍后再试。', 'error');
        } catch (error) {
            showToastSafe(formatRelationshipArcImportErrorMessage(error, '导入关系脉络失败。'), 'error');
        } finally {
            helper.busy = false;
            renderLayout();
        }
    }

    function formatRelationshipArcImportErrorMessage(error, fallbackText) {
        const code = toTrimmedString(error && (error.code || error.message));
        const coverageIssue = error && error.coverageIssue && typeof error.coverageIssue === 'object'
            ? error.coverageIssue
            : null;
        const metrics = coverageIssue && coverageIssue.metrics && typeof coverageIssue.metrics === 'object'
            ? coverageIssue.metrics
            : {};
        const reasons = Array.isArray(coverageIssue && coverageIssue.reasons)
            ? coverageIssue.reasons.map(function mapReason(reason) {
                const value = toTrimmedString(reason);
                if (value === 'stage_count_collapsed') return '阶段数量被压缩掉了';
                if (value === 'key_events_collapsed') return '关键事件数量被压缩掉了';
                if (value === 'dated_events_lost') return '带日期的关键事件丢了';
                if (value === 'themes_lost') return '事件主题标签丢了';
                if (value === 'periods_lost') return '阶段时间范围丢了';
                if (value === 'summary_details_over_abstracted') return '关键事件被写得太虚，具体经过丢了';
                if (value === 'prompt_too_short') return '整段脉络正文太短';
                if (value === 'empty_stages') return '结果里几乎没有阶段';
                return '';
            }).filter(Boolean)
            : [];
        if (code === 'relationship_arc_import_structure_lost') {
            const metricParts = [];
            if (Number(metrics.importedStageCount || 0) > 0 || Number(metrics.outputStageCount || 0) > 0) {
                metricParts.push(`阶段 ${Math.max(0, Number(metrics.importedStageCount || 0))} -> ${Math.max(0, Number(metrics.outputStageCount || 0))}`);
            }
            if (Number(metrics.importedKeyEventCount || 0) > 0 || Number(metrics.outputKeyEventCount || 0) > 0) {
                metricParts.push(`关键事件 ${Math.max(0, Number(metrics.importedKeyEventCount || 0))} -> ${Math.max(0, Number(metrics.outputKeyEventCount || 0))}`);
            }
            if (Number(metrics.importedDatedKeyEventCount || 0) > 0 || Number(metrics.outputDatedKeyEventCount || 0) > 0) {
                metricParts.push(`带日期事件 ${Math.max(0, Number(metrics.importedDatedKeyEventCount || 0))} -> ${Math.max(0, Number(metrics.outputDatedKeyEventCount || 0))}`);
            }
            if (Number(metrics.importedThemedKeyEventCount || 0) > 0 || Number(metrics.outputThemedKeyEventCount || 0) > 0) {
                metricParts.push(`主题标签 ${Math.max(0, Number(metrics.importedThemedKeyEventCount || 0))} -> ${Math.max(0, Number(metrics.outputThemedKeyEventCount || 0))}`);
            }
            if (Number(metrics.importedDetailedKeyEventCount || 0) > 0 || Number(metrics.retainedDetailedKeyEventCount || 0) > 0) {
                metricParts.push(`保住具体事件 ${Math.max(0, Number(metrics.retainedDetailedKeyEventCount || 0))} / ${Math.max(0, Number(metrics.importedDetailedKeyEventCount || 0))}`);
            }
            if (Number(metrics.minPromptLength || 0) > 0 || Number(metrics.outputPromptLength || 0) > 0) {
                metricParts.push(`正文长度 ${Math.max(0, Number(metrics.outputPromptLength || 0))} / 目标至少 ${Math.max(0, Number(metrics.minPromptLength || 0))}`);
            }
            return [
                '关系脉络导入失败：这次结果把旧脉络压扁了，系统已经拦下，没有写入。',
                metricParts.length > 0 ? `压缩情况：${metricParts.join('；')}。` : '',
                reasons.length > 0 ? `具体丢失：${reasons.join('、')}。` : '',
                '请直接重试一次。'
            ].filter(Boolean).join(' ');
        }
        if (code === 'relationship_arc_response_invalid') {
            return '关系脉络导入失败：模型返回的结构不合法，这次没有写入。请重试一次。';
        }
        if (code === 'relationship_arc_empty_result') {
            return '关系脉络生成失败：这次没有生成任何阶段，系统已经拦下，没有写入空版本。请换一段更完整的旧记忆，或重试一次。';
        }
        if (code === 'relationship_arc_api_not_configured' || code === 'relationship_arc_api_invalid_url') {
            return '关系脉络导入失败：当前聊天主 API 配置不可用。';
        }
        return code || fallbackText || '关系脉络导入失败。';
    }

    async function handleRollbackRelationshipArcVersion(versionId) {
        const client = getClient();
        const charId = toTrimmedString(state.filters.charId);
        const helper = getRelationshipArcHelperState();
        const safeVersionId = toTrimmedString(versionId);
        if (!client || typeof client.rollbackRelationshipArcVersion !== 'function' || !charId || !safeVersionId) {
            showToastSafe('当前环境暂时无法回滚关系脉络版本。', 'error');
            return;
        }
        if (typeof root.confirm === 'function') {
            const confirmed = root.confirm('回滚后，这个旧版本会重新成为当前生效版本。确定继续吗？');
            if (!confirmed) return;
        }

        helper.busy = true;
        renderLayout();
        try {
            const result = await client.rollbackRelationshipArcVersion(charId, safeVersionId);
            if (result && result.ok) {
                helper.compareVersionId = '';
                showToastSafe('关系脉络已回滚。', 'success');
                await refreshActiveTab();
                return;
            }
            showToastSafe('回滚失败，请稍后再试。', 'error');
        } catch (error) {
            showToastSafe(toTrimmedString(error && error.message) || '回滚关系脉络失败。', 'error');
        } finally {
            helper.busy = false;
            renderLayout();
        }
    }

    function handleToggleRelationshipArcCompare(versionId) {
        const helper = getRelationshipArcHelperState();
        const safeVersionId = toTrimmedString(versionId);
        helper.compareVersionId = helper.compareVersionId === safeVersionId ? '' : safeVersionId;
        renderLayout();
    }

    function renderRelationshipArcPanel() {
        if (state.loading) {
            return renderLoadingPanel('正在梳理关系脉络...');
        }

        const relationship = getRelationshipArcData();
        const helper = getRelationshipArcHelperState();
        const current = relationship.current;
        const compareVersion = findRelationshipArcVersionById(relationship.versions, helper.compareVersionId);
        const currentVersionId = toTrimmedString(current && current.id);
        const currentState = current ? current.currentRelationshipState : null;
        const promptText = toTrimmedString(relationship.promptBlock || (current && current.promptInjectionFull ? `[关系脉络]\n${current.promptInjectionFull}` : ''));
        const previewRecord = helper.previewRecord && typeof helper.previewRecord === 'object'
            ? helper.previewRecord
            : null;
        const previewStats = previewRecord ? buildRelationshipArcVersionStats(previewRecord) : null;
        const previewDiffLines = current && previewRecord
            ? buildRelationshipArcCompareDiffLines(previewRecord, current)
            : [];
        const previewSourceOrigins = previewRecord
            ? formatRelationshipArcSourceOriginList(
                previewRecord.sourceSummary && Array.isArray(previewRecord.sourceSummary.sourceOrigin)
                    ? previewRecord.sourceSummary.sourceOrigin
                    : []
            )
            : [];
        const previewRevisionNotes = previewRecord
            ? formatRelationshipArcRevisionNotes(previewRecord.revisionNotes)
            : [];
        const stageOverviewHtml = current
            ? renderRelationshipArcStageOverviewPanel(current.stages, current.currentStage && current.currentStage.stage)
            : '';
        const buttonsDisabled = helper.busy ? 'disabled' : '';
        const currentSummaryBadges = current
            ? [
                renderNotebookBadge(`当前 v${current.versionNumber}`, '#bbf7d0', 'rgba(34,197,94,0.14)'),
                renderNotebookBadge(formatRelationshipArcUpdateMode(current.updateMode), '#dbeafe', 'rgba(96,165,250,0.12)'),
                renderNotebookBadge(`阶段 ${relationship.stats.stageCount}`, '#fde68a', 'rgba(245,158,11,0.12)'),
                renderNotebookBadge(`历史 ${relationship.stats.versionCount}`, '#c4b5fd', 'rgba(139,92,246,0.14)'),
                renderNotebookBadge(`正文 ${formatRelationshipArcTextStats(currentTextStats)}`, '#e5e7eb', 'rgba(255,255,255,0.08)')
            ].join('')
            : '';
        const stageHtml = current && Array.isArray(current.stages) && current.stages.length > 0
            ? current.stages.map(renderRelationshipArcStageCard).join('')
            : '<div class="hip-empty">当前还没有可展示的关系阶段。</div>';
        const versionHtml = relationship.versions.length > 0
            ? relationship.versions.map(function renderVersionItem(item) {
                return renderRelationshipArcVersionCard(item, currentVersionId, helper.compareVersionId, helper.busy);
            }).join('')
            : '<div class="hip-empty hip-empty-compact">还没有历史版本。</div>';
        const emptyHint = relationship.emptyReason || '当前还没有生成关系脉络。';
        const importHint = relationship.importHint || '把旧版记忆、YAML 或任意整理好的关系总结贴进来，也可以直接生成第一版。';
        const previewHtml = previewRecord
            ? `
                <section class="hip-glass-panel" style="padding:18px 20px;">
                    <div class="hip-box-header">
                        <h3 style="font-size:16px;">导入后会变成什么样</h3>
                        <div class="hip-box-hint">确认后会写入新版本，旧版本不会被删掉。</div>
                    </div>
                    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;">
                        ${renderNotebookBadge(`将生成 v${previewRecord.versionNumber}`, '#fde68a', 'rgba(245,158,11,0.14)')}
                        ${renderNotebookBadge(`阶段 ${previewRecord.stages.length}`, '#dbeafe', 'rgba(96,165,250,0.12)')}
                        ${previewStats ? renderNotebookBadge(`关键事件 ${previewStats.keyEventCount}`, '#ddd6fe', 'rgba(139,92,246,0.14)') : ''}
                        ${previewStats && previewStats.datedKeyEventCount > 0 ? renderNotebookBadge(`带日期 ${previewStats.datedKeyEventCount}`, '#bbf7d0', 'rgba(34,197,94,0.14)') : ''}
                    </div>
                    <div class="hip-box-hint" style="margin-top:12px;">${escapeHtml(buildRelationshipArcMetaLine(previewRecord) || '已生成可保存的关系脉络预览。')}</div>
                    ${previewSourceOrigins.length > 0 ? `<div class="hip-box-hint" style="margin-top:8px;">这次主要参考：${escapeHtml(previewSourceOrigins.join(' / '))}</div>` : ''}
                    ${previewRevisionNotes.length > 0 ? `<div class="hip-box-hint" style="margin-top:8px;">系统修订：${escapeHtml(previewRevisionNotes.join(' / '))}</div>` : ''}
                    ${previewDiffLines.length > 0 ? `<div class="hip-box-hint" style="margin-top:12px;">这次和当前版的主要差别：<br>${previewDiffLines.map(function mapLine(line) {
                        return `- ${escapeHtml(line)}`;
                    }).join('<br>')}</div>` : ''}
                    ${renderRelationshipArcStageOverviewPanel(previewRecord.stages, previewRecord.currentStage && previewRecord.currentStage.stage)}
                    <pre style="margin-top:14px;white-space:pre-wrap;word-break:break-word;max-height:260px;overflow:auto;padding:14px 16px;border-radius:16px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);font-size:13px;line-height:1.75;color:rgba(255,255,255,0.82);">${escapeHtml(previewRecord.promptInjectionFull || '（预览为空）')}</pre>
                    <div class="hip-actions" style="margin-top:14px;">
                        <button type="button" class="hip-btn-outline hip-btn-inline" data-hip-action="clear-relationship-import-preview" ${buttonsDisabled}>清空预览</button>
                        <button type="button" class="hip-btn-primary hip-btn-inline" data-hip-action="confirm-relationship-import" ${buttonsDisabled}>确认导入</button>
                    </div>
                </section>
            `
            : '';
        const compressionPreviewHtml = compressionPreviewRecord
            ? `
                <section class="hip-glass-panel" style="padding:18px 20px;">
                    <div class="hip-box-header">
                        <h3 style="font-size:16px;">精炼/压缩预览</h3>
                        <div class="hip-box-hint">还没写入。你可以先读一遍，也可以直接在下面手动改，满意后再保存为新版本。</div>
                    </div>
                    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;">
                        ${renderNotebookBadge(`压缩前 ${formatRelationshipArcTextStats(compressionStats && compressionStats.before)}`, '#e5e7eb', 'rgba(255,255,255,0.08)')}
                        ${compressionStats && compressionStats.target && compressionStats.target.chars > 0 ? renderNotebookBadge(`目标 ${formatRelationshipArcTextStats(compressionStats.target)}`, '#fde68a', 'rgba(245,158,11,0.14)') : ''}
                        ${renderNotebookBadge(`压缩后 ${formatRelationshipArcTextStats(compressionStats && compressionStats.after)}`, '#bbf7d0', 'rgba(34,197,94,0.14)')}
                        ${renderNotebookBadge(`将生成 v${compressionPreviewRecord.versionNumber}`, '#dbeafe', 'rgba(96,165,250,0.12)')}
                    </div>
                    ${compressionRevisionNotes.length > 0 ? `<div class="hip-box-hint" style="margin-top:8px;">这次处理：${escapeHtml(compressionRevisionNotes.join(' / '))}</div>` : ''}
                    ${compressionDiffLines.length > 0 ? `<div class="hip-box-hint" style="margin-top:12px;">和当前版相比：<br>${compressionDiffLines.map(function mapLine(line) { return `- ${escapeHtml(line)}`; }).join('<br>')}</div>` : ''}
                    <form id="hip-admin-relationship-compression-form" style="margin-top:14px;">
                        <textarea
                            name="relationshipCompressionText"
                            class="hip-manual-yaml-input"
                            style="min-height:260px;"
                            ${buttonsDisabled}
                        >${escapeHtml(compressionPreviewRecord.promptInjectionFull || '')}</textarea>
                        <div class="hip-manual-yaml-actions">
                            <button type="button" class="hip-btn-outline" data-hip-action="clear-relationship-compression-preview" ${buttonsDisabled}>取消预览</button>
                            <button type="submit" class="hip-btn-primary" ${buttonsDisabled}>保存为新版本</button>
                        </div>
                    </form>
                </section>
            `
            : '';

        return `
            <section class="hip-panel-wrapper">
                <div class="hip-toolbar">
                    <select id="hip-admin-char-select" class="hip-select-block">
                        ${renderContactOptions(getEnabledContacts(), state.filters.charId)}
                    </select>
                    <button type="button" class="hip-icon-btn" data-hip-action="refresh-relationship-arc" aria-label="刷新关系脉络">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.58m15.36 2A8 8 0 004.58 9m0 0H9m11 11v-5h-.58m0 0a8 8 0 01-15.36-2m15.36 2H15"></path>
                        </svg>
                    </button>
                </div>

                <section class="hip-glass-panel" style="padding:18px 20px;">
                    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;">
                        <div style="flex:1;min-width:240px;">
                            <div style="font-size:18px;font-weight:600;color:rgba(255,255,255,0.94);">关系脉络总览</div>
                            <div style="margin-top:8px;font-size:13px;color:rgba(255,255,255,0.66);line-height:1.7;">
                                ${escapeHtml(current ? (buildRelationshipArcMetaLine(current) || '当前关系脉络已生成。') : emptyHint)}
                            </div>
                        </div>
                        <div class="hip-actions">
                            <button type="button" class="hip-btn-outline hip-btn-inline" data-hip-action="update-relationship-arc-tail" ${buttonsDisabled}>更新最近阶段</button>
                            <button type="button" class="hip-btn-outline hip-btn-inline" data-hip-action="preview-relationship-arc-compression" ${current ? buttonsDisabled : 'disabled'}>一键精炼/压缩</button>
                            <button type="button" class="hip-btn-primary hip-btn-inline" data-hip-action="rebuild-relationship-arc" ${buttonsDisabled}>重建整条脉络</button>
                        </div>
                    </div>
                    ${currentSummaryBadges ? `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:14px;">${currentSummaryBadges}</div>` : `<div class="hip-box-hint" style="margin-top:14px;">${escapeHtml(importHint)}</div>`}
                </section>

                ${stageOverviewHtml}

                ${current && currentState
                    ? `
                    <section class="hip-glass-panel" style="padding:18px 20px;">
                        <div class="hip-box-header">
                            <h3 style="font-size:16px;">当前关系状态</h3>
                        </div>
                        <div style="margin-top:10px;font-size:14px;line-height:1.85;color:rgba(255,255,255,0.82);">${escapeHtml(currentState.oneParagraphSummary || '暂无总结。')}</div>
                        ${renderRelationshipArcListBlock('仍在持续影响关系的线索', currentState.activeThreads)}
                        ${renderRelationshipArcListBlock('未完全释放的张力', currentState.unresolvedTensions)}
                        ${renderRelationshipArcListBlock('已经稳定下来的情感纽带', currentState.stableBonds)}
                        ${renderRelationshipArcListBlock('共同方向', currentState.sharedDirection)}
                    </section>
                    `
                    : ''
                }

                <section class="hip-glass-panel" style="padding:18px 20px;">
                    <div class="hip-box-header">
                        <h3 style="font-size:16px;">主聊天会读到的完整脉络</h3>
                        <div class="hip-box-hint">这里展示的是会直接放进主聊天背景里的完整关系脉络正文。当前 ${escapeHtml(formatRelationshipArcTextStats(currentTextStats))}。</div>
                    </div>
                    <pre style="margin-top:14px;white-space:pre-wrap;word-break:break-word;max-height:320px;overflow:auto;padding:14px 16px;border-radius:16px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);font-size:13px;line-height:1.75;color:rgba(255,255,255,0.82);">${escapeHtml(promptText || '（当前为空）')}</pre>
                </section>

                <section class="hip-glass-panel" style="padding:18px 20px;">
                    <div class="hip-box-header">
                        <h3 style="font-size:16px;">从旧记忆导入</h3>
                        <div class="hip-box-hint">支持 YAML、纯文本或任意格式的关系总结。系统会先生成预览，再由你确认写入。</div>
                    </div>
                    <form id="hip-admin-relationship-import-form" style="margin-top:14px;">
                        <textarea
                            name="relationshipImportText"
                            class="hip-manual-yaml-input"
                            placeholder="把你的旧版记忆文本粘贴到这里（支持 YAML、纯文本、任意格式的关系总结）"
                            ${buttonsDisabled}
                        >${escapeHtml(helper.importText || '')}</textarea>
                        <div class="hip-manual-yaml-actions">
                            <button type="submit" class="hip-btn-outline" ${buttonsDisabled}>生成关系脉络预览</button>
                        </div>
                    </form>
                </section>

                ${previewHtml}
                ${renderRelationshipArcCompressionPreviewBlock(compressionPreviewRecord, compressionStats, compressionRevisionNotes, compressionDiffLines, buttonsDisabled)}
                ${renderRelationshipArcComparePanel(current, compareVersion)}

                <section class="hip-glass-panel" style="padding:18px 20px;">
                    <div class="hip-box-header">
                        <h3 style="font-size:16px;">阶段历程</h3>
                        <div class="hip-box-hint">早期阶段更概括，越接近当下越具体。</div>
                    </div>
                    <div class="hip-card-list" style="margin-top:14px;">${stageHtml}</div>
                </section>

                <section class="hip-glass-panel" style="padding:18px 20px;">
                    <div class="hip-box-header">
                        <h3 style="font-size:16px;">历史版本</h3>
                        <div class="hip-box-hint">保留最近几版，支持对比和回滚。</div>
                    </div>
                    <div class="hip-snapshot-list" style="margin-top:14px;">${versionHtml}</div>
                </section>
            </section>
        `;
    }

    function renderSnapshotPanel() {
        return renderExportPanel();
    }

    /**
     * 将列表项统一渲染为事件卡或碎片卡。
     */
    function renderListItem(item) {
        const safeItem = item && typeof item === 'object' ? item : {};
        if (safeItem.kind === 'event') {
            return renderEventCard(safeItem);
        }
        return renderMemoryCard(safeItem.memory || safeItem);
    }

    /**
     * 将原始记忆分页结果整理成“记忆事件 + 记忆碎片”的混排列表。
     */
    function isRetiredEventItem(eventItem) {
        const safeEvent = eventItem && typeof eventItem === 'object' ? eventItem : {};
        const metadata = normalizeMetadata(safeEvent.metadata);
        if (toBoolean(
            safeEvent.digest_retired !== undefined
                ? safeEvent.digest_retired
                : (metadata.digest_retired !== undefined ? metadata.digest_retired : metadata.digestRetired)
        )) {
            return true;
        }
        return !!toTrimmedString(
            safeEvent.digest_retired_at
            || metadata.digest_retired_at
            || metadata.digestRetiredAt
        );
    }

    function buildEventDisplayItemFromEventRecord(eventRecord) {
        const safeRecord = eventRecord && typeof eventRecord === 'object' ? eventRecord : null;
        if (!safeRecord) return null;
        const metadata = normalizeMetadata(safeRecord.metadata);
        const versionHistory = mergeEventVersionHistoryEntries(
            getMemoryEventVersionHistory(Object.assign({}, safeRecord, { metadata: metadata })),
            [],
            12
        );
        const flashbulbIds = normalizeIdArray(
            safeRecord.event_flashbulb_memory_ids !== undefined
                ? safeRecord.event_flashbulb_memory_ids
                : metadata.event_flashbulb_memory_ids,
            24
        );
        const fragmentCount = Math.max(
            0,
            Math.floor(
                toFiniteNumber(
                    safeRecord.fragment_count !== undefined ? safeRecord.fragment_count : safeRecord.memberCount,
                    Array.isArray(safeRecord.memory_ids) ? safeRecord.memory_ids.length : 0
                )
            )
        );
        const latestTimestamp = Math.max(
            Date.parse(toTrimmedString(safeRecord.last_related_at)) || 0,
            Date.parse(toTrimmedString(safeRecord.updated_at)) || 0,
            Date.parse(toTrimmedString(safeRecord.created_at)) || 0
        );
        const salienceScore = Math.max(0, Math.min(1, toFiniteNumber(
            safeRecord.salience_score !== undefined ? safeRecord.salience_score : metadata.event_salience_score,
            0
        )));
        const flashbulbScore = Math.max(0, Math.min(1, getMemoryEventFlashbulbScore(Object.assign({}, safeRecord, { metadata: metadata }))));
        const retiredReason = toTrimmedString(
            safeRecord.digest_retired_reason
            || metadata.digest_retired_reason
            || metadata.digestRetiredReason
        );
        const retiredSupersededByEventId = toTrimmedString(
            safeRecord.digest_retired_superseded_by_event_id
            || metadata.digest_retired_superseded_by_event_id
            || metadata.digestRetiredSupersededByEventId
        );
        return {
            kind: 'event',
            id: `event:${toTrimmedString(safeRecord.id)}`,
            eventId: toTrimmedString(safeRecord.id),
            title: toTrimmedString(safeRecord.title) || '记忆事件',
            summary: toTrimmedString(safeRecord.summary) || '这是一段待回看的记忆事件。',
            depth: toTrimmedString(safeRecord.depth).toLowerCase() || 'medium',
            layer: 'event',
            color: '#60a5fa',
            importance: Math.max(1, Math.min(10, Math.round((salienceScore || 0.45) * 10))),
            isResolved: !toBoolean(safeRecord.is_unresolved),
            isFlashbulb: !!(safeRecord.event_is_flashbulb || flashbulbIds.length > 0),
            unresolvedCount: toBoolean(safeRecord.is_unresolved) ? Math.max(1, fragmentCount || 1) : 0,
            memberCount: fragmentCount,
            loadedMemberCount: 0,
            flashbulbCount: flashbulbIds.length,
            flashbulbMemoryIds: flashbulbIds,
            latestTimestamp: latestTimestamp,
            eventDate: toTrimmedString(safeRecord.event_date),
            continuationKey: toTrimmedString(safeRecord.continuation_key),
            anchorMemoryId: toTrimmedString(safeRecord.anchor_memory_id),
            detailMemoryIds: normalizeIdArray(safeRecord.detail_memory_ids, 24),
            manualEdited: !!safeRecord.manual_edited,
            members: [],
            keywords: normalizeTextArray(
                [].concat(metadata.trigger_keywords || []).concat(metadata.surface_aliases || []),
                8
            ),
            signalTags: normalizeTextArray(
                safeRecord.event_signal_tags !== undefined ? safeRecord.event_signal_tags : metadata.event_signal_tags,
                8
            ),
            flashbulbReasonTags: normalizeTextArray(
                safeRecord.event_flashbulb_reason_tags !== undefined ? safeRecord.event_flashbulb_reason_tags : metadata.event_flashbulb_reason_tags,
                6
            ),
            salienceScore: salienceScore,
            flashbulbScore: flashbulbScore,
            event_version_history: versionHistory,
            metadata: Object.assign({}, metadata, { event_version_history: versionHistory }),
            readOnlyEvent: isRetiredEventItem(safeRecord),
            digest_retired: isRetiredEventItem(safeRecord),
            digest_retired_reason: retiredReason,
            digest_retired_superseded_by_event_id: retiredSupersededByEventId,
            digest_retired_at: toTrimmedString(
                safeRecord.digest_retired_at
                || metadata.digest_retired_at
                || metadata.digestRetiredAt
            ),
            digest_retired_previous_fragment_count: Math.max(0, Math.floor(toFiniteNumber(
                safeRecord.digest_retired_previous_fragment_count
                || metadata.digest_retired_previous_fragment_count
                || metadata.digestRetiredPreviousFragmentCount,
                fragmentCount
            ))),
            digest_retired_previous_anchor_memory_id: toTrimmedString(
                safeRecord.digest_retired_previous_anchor_memory_id
                || metadata.digest_retired_previous_anchor_memory_id
                || metadata.digestRetiredPreviousAnchorMemoryId
            ),
            digest_retired_previous_continuation_key: toTrimmedString(
                safeRecord.digest_retired_previous_continuation_key
                || metadata.digest_retired_previous_continuation_key
                || metadata.digestRetiredPreviousContinuationKey
            )
        };
    }

    function buildDirectEventDisplayItems(eventRecords) {
        return (Array.isArray(eventRecords) ? eventRecords : [])
            .map(buildEventDisplayItemFromEventRecord)
            .filter(Boolean)
            .sort(function sortEventItems(left, right) {
                return Math.max(0, Number(right && right.latestTimestamp || 0))
                    - Math.max(0, Number(left && left.latestTimestamp || 0));
            });
    }

    function buildListDisplayItems(memories, options) {
        const source = Array.isArray(memories) ? memories.filter(Boolean) : [];
        const optionSource = options && typeof options === 'object' ? options : {};
        const recordType = toTrimmedString(optionSource.recordType).toLowerCase();
        const eventRecordsById = optionSource.eventRecordsById && typeof optionSource.eventRecordsById === 'object'
            ? optionSource.eventRecordsById
            : {};

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

        const eventItems = [];
        eventMap.forEach(function mapEvent(members, eventId) {
            const list = members.slice().sort(function sortMembers(left, right) {
                const rightImportance = Number(right && right.importance || 0);
                const leftImportance = Number(left && left.importance || 0);
                if (rightImportance !== leftImportance) return rightImportance - leftImportance;
                const rightTs = getMemorySortTimestamp(right);
                const leftTs = getMemorySortTimestamp(left);
                return rightTs - leftTs;
            });
            if (list.length <= 0) return;
            const eventRecord = eventRecordsById[toTrimmedString(eventId)] || null;

            const anchor = list[0];
            const unresolvedCount = list.filter(function countUnresolved(item) {
                return !isMemoryResolved(item);
            }).length;
            const isResolved = unresolvedCount <= 0;
            const hintedMemberCount = list.reduce(function pickHintedCount(maxValue, item) {
                return Math.max(maxValue, getMemoryEventFragmentCount(item));
            }, 0);
            const totalMemberCount = Math.max(
                list.length,
                hintedMemberCount,
                Math.max(0, Number(eventRecord && eventRecord.fragment_count || 0))
            );
            const latestTimestamp = Math.max(
                list.reduce(function pickLatest(maxValue, item) {
                    return Math.max(maxValue, getMemorySortTimestamp(item));
                }, 0),
                Date.parse(toTrimmedString(
                    eventRecord && (eventRecord.last_related_at || eventRecord.updated_at || eventRecord.created_at)
                )) || 0
            );
            const avgValence = list.reduce(function sumValence(total, item) {
                return total + Number(item && item.valence || 0);
            }, 0) / Math.max(1, list.length);
            const avgArousal = list.reduce(function sumArousal(total, item) {
                return total + Number(item && item.arousal || 0);
            }, 0) / Math.max(1, list.length);
            const importance = list.reduce(function pickImportance(maxValue, item) {
                return Math.max(maxValue, Number(item && item.importance || 0));
            }, 0);
            const layer = toTrimmedString(anchor && (anchor.memory_layer || anchor.layer)).toLowerCase() || 'buffer';
            const title = toTrimmedString(eventRecord && eventRecord.title)
                || getMemoryEventTitle(anchor)
                || (anchor && anchor.content ? summarizeContent(anchor.content, 18) : '')
                || '记忆事件';
            const summary = toTrimmedString(eventRecord && eventRecord.summary)
                || getMemoryEventSummary(anchor)
                || (anchor && anchor.content ? summarizeContent(anchor.content, 86) : '')
                || '这是一段待回看的记忆事件。';
            const depth = toTrimmedString(eventRecord && eventRecord.depth).toLowerCase()
                || getMemoryEventDepth(anchor)
                || 'medium';
            const ecoColor = getEmotionColor(avgValence, avgArousal, layer);

            const keywordsSeen = new Set();
            const keywords = [];
            list.forEach(function collectKeywords(item) {
                const metadata = getMemoryMetadata(item);
                const local = Array.isArray(metadata.trigger_keywords) ? metadata.trigger_keywords : [];
                local.forEach(function appendKeyword(keyword) {
                    const text = toTrimmedString(keyword);
                    if (!text || keywordsSeen.has(text)) return;
                    keywordsSeen.add(text);
                    keywords.push(text);
                });
            });
            const flashbulbStateFromMembers = deriveEventFlashbulbStateFromMembers(list);
            const flashbulbState = {
                isFlashbulb: flashbulbStateFromMembers.isFlashbulb || !!(eventRecord && eventRecord.event_is_flashbulb),
                memoryIds: normalizeIdArray(
                    flashbulbStateFromMembers.memoryIds.concat(
                        eventRecord && Array.isArray(eventRecord.event_flashbulb_memory_ids)
                            ? eventRecord.event_flashbulb_memory_ids
                            : []
                    ),
                    24
                )
            };
            const signalTags = collectMemberTextTags(list, getMemoryEventSignalTags, 8);
            const flashbulbReasonTags = collectMemberTextTags(list, getMemoryEventFlashbulbReasonTags, 6);
            const salienceScore = list.reduce(function pickSalience(maxValue, item) {
                return Math.max(maxValue, getMemoryEventSalienceScore(item));
            }, Math.max(0, Math.min(1, Number(eventRecord && eventRecord.salience_score || 0))));
            const flashbulbScore = list.reduce(function pickFlashbulbScore(maxValue, item) {
                return Math.max(maxValue, getMemoryEventFlashbulbScore(item));
            }, 0);
            const eventVersionHistory = mergeEventVersionHistoryEntries(
                getMemoryEventVersionHistory(eventRecord),
                collectEventVersionHistoryFromMembers(list, 12),
                12
            );
            const latestVersionEntry = eventVersionHistory.length > 0
                ? eventVersionHistory[eventVersionHistory.length - 1]
                : null;

            eventItems.push({
                kind: 'event',
                id: `event:${eventId}`,
                eventId: eventId,
                title: title,
                summary: summary,
                depth: depth,
                layer: layer,
                color: ecoColor,
                importance: importance,
                isResolved: isResolved,
                isFlashbulb: flashbulbState.isFlashbulb,
                unresolvedCount: unresolvedCount,
                memberCount: totalMemberCount,
                loadedMemberCount: list.length,
                flashbulbCount: flashbulbState.memoryIds.length,
                flashbulbMemoryIds: flashbulbState.memoryIds,
                latestTimestamp: latestTimestamp,
                eventDate: toTrimmedString(eventRecord && eventRecord.event_date),
                continuationKey: toTrimmedString(eventRecord && eventRecord.continuation_key),
                anchorMemoryId: toTrimmedString(eventRecord && eventRecord.anchor_memory_id),
                detailMemoryIds: normalizeIdArray(eventRecord && eventRecord.detail_memory_ids, 24),
                manualEdited: !!(eventRecord && eventRecord.manual_edited),
                members: list,
                keywords: keywords.slice(0, 8),
                signalTags: signalTags,
                flashbulbReasonTags: flashbulbReasonTags,
                salienceScore: salienceScore,
                flashbulbScore: flashbulbScore,
                event_version_history: eventVersionHistory,
                metadata: Object.assign({}, normalizeMetadata(eventRecord && eventRecord.metadata), {
                    event_version_history: eventVersionHistory,
                    last_event_version_at: latestVersionEntry
                        ? toTrimmedString(
                            latestVersionEntry.changed_at
                            || latestVersionEntry.created_at
                            || latestVersionEntry.refreshed_at
                        )
                        : '',
                    last_event_version_source: latestVersionEntry
                        ? toTrimmedString(latestVersionEntry.source)
                        : '',
                    last_event_version_fields: latestVersionEntry
                        ? normalizeTextArray(latestVersionEntry.change_fields, 8)
                        : []
                }),
                readOnlyEvent: isRetiredEventItem(eventRecord),
                digest_retired: isRetiredEventItem(eventRecord),
                digest_retired_reason: toTrimmedString(
                    eventRecord && (
                        eventRecord.digest_retired_reason
                        || (normalizeMetadata(eventRecord.metadata).digest_retired_reason)
                        || (normalizeMetadata(eventRecord.metadata).digestRetiredReason)
                    )
                ),
                digest_retired_superseded_by_event_id: toTrimmedString(
                    eventRecord && (
                        eventRecord.digest_retired_superseded_by_event_id
                        || normalizeMetadata(eventRecord.metadata).digest_retired_superseded_by_event_id
                        || normalizeMetadata(eventRecord.metadata).digestRetiredSupersededByEventId
                    )
                ),
                digest_retired_at: toTrimmedString(
                    eventRecord && (
                        eventRecord.digest_retired_at
                        || normalizeMetadata(eventRecord.metadata).digest_retired_at
                        || normalizeMetadata(eventRecord.metadata).digestRetiredAt
                    )
                ),
                digest_retired_previous_fragment_count: Math.max(0, Math.floor(toFiniteNumber(
                    eventRecord && (
                        eventRecord.digest_retired_previous_fragment_count
                        || normalizeMetadata(eventRecord.metadata).digest_retired_previous_fragment_count
                        || normalizeMetadata(eventRecord.metadata).digestRetiredPreviousFragmentCount
                    ),
                    totalMemberCount
                ))),
                digest_retired_previous_anchor_memory_id: toTrimmedString(
                    eventRecord && (
                        eventRecord.digest_retired_previous_anchor_memory_id
                        || normalizeMetadata(eventRecord.metadata).digest_retired_previous_anchor_memory_id
                        || normalizeMetadata(eventRecord.metadata).digestRetiredPreviousAnchorMemoryId
                    )
                ),
                digest_retired_previous_continuation_key: toTrimmedString(
                    eventRecord && (
                        eventRecord.digest_retired_previous_continuation_key
                        || normalizeMetadata(eventRecord.metadata).digest_retired_previous_continuation_key
                        || normalizeMetadata(eventRecord.metadata).digestRetiredPreviousContinuationKey
                    )
                )
            });
        });

        const fragmentItems = standalone.map(function mapStandalone(memory) {
            return {
                kind: 'memory',
                id: toTrimmedString(memory && memory.id) || `memory:${Math.random().toString(36).slice(2, 10)}`,
                memory: memory,
                latestTimestamp: getMemorySortTimestamp(memory)
            };
        });

        let mixed = eventItems.concat(fragmentItems);
        if (recordType === 'event') {
            mixed = eventItems;
        } else if (recordType === 'fragment') {
            mixed = fragmentItems;
        } else if (recordType === 'unresolved_event') {
            mixed = eventItems.filter(function keepUnresolved(eventItem) {
                return !!eventItem && eventItem.isResolved !== true;
            });
        }

        return mixed.sort(function sortMixed(left, right) {
            return Number(right && right.latestTimestamp || 0) - Number(left && left.latestTimestamp || 0);
        });
    }

    /**
     * 读取记忆排序时间戳，优先 last_active_at，再回退 created_at。
     */
    function getMemorySortTimestamp(memory) {
        const safeMemory = memory && typeof memory === 'object' ? memory : {};
        const source = safeMemory.last_active_at || safeMemory.created_at || safeMemory.last_injected_at || null;
        if (!source) return 0;
        const stamp = Date.parse(source);
        return Number.isFinite(stamp) ? stamp : 0;
    }

    /**
     * 在事件成员列表里展开单条碎片的详情。
     */
    function renderEventMemberDetail(memory) {
        const safeMemory = memory && typeof memory === 'object' ? memory : {};
        const memoryId = toTrimmedString(safeMemory.id);
        if (!memoryId) return '';

        const metadata = getMemoryMetadata(safeMemory);
        const layer = toTrimmedString(
            safeMemory.memory_layer
            || safeMemory.layer
            || metadata.memory_layer
            || metadata.memoryLayer
            || metadata.layer
        ).toLowerCase() || 'buffer';
        const ecoColor = getEmotionColor(safeMemory.valence, safeMemory.arousal, layer);
        const isResolved = isMemoryResolved(safeMemory);
        const isFlashbulb = isMemoryFlashbulb(safeMemory);
        const eventIsFlashbulb = isMemoryEventFlashbulb(safeMemory);
        const activationCount = formatActivationCount(safeMemory.activation_count);
        const importanceText = escapeHtml(humanizeImportance(safeMemory.importance));
        const timeText = escapeHtml(formatTimeAgo(safeMemory.last_active_at || safeMemory.created_at));
        const reasonText = escapeHtml(explainSurfaceReason(safeMemory));
        const fullContent = escapeHtml(toTrimmedString(safeMemory.content) || '（空内容）').replace(/\n/g, '<br>');
        const keywords = Array.isArray(metadata.trigger_keywords) ? metadata.trigger_keywords : [];
        const signalTags = getMemoryEventSignalTags(safeMemory).map(humanizeEventSignalTag);
        const flashbulbReasonTags = getMemoryEventFlashbulbReasonTags(safeMemory).map(humanizeEventSignalTag);
        const salienceScore = getMemoryEventSalienceScore(safeMemory);
        const flashbulbScore = getMemoryEventFlashbulbScore(safeMemory);
        const reconsolidationHintHtml = renderMemoryReconsolidationHint(safeMemory);
        const reconAuditHtml = renderMemoryReconAuditPanel(safeMemory);
        const groundingPanelHtml = renderGroundingSupportPanel(getMemoryGroundingSupport(safeMemory), {
            title: '这条记忆和原聊天对得上吗'
        });
        const tagTexts = [];
        if (isFlashbulb) {
            tagTexts.push('印象很深');
        } else if (eventIsFlashbulb) {
            tagTexts.push('属于高冲击事件');
        }
        signalTags.slice(0, 5).forEach(function pushSignalTag(tag) {
            tagTexts.push(tag);
        });
        flashbulbReasonTags.slice(0, 4).forEach(function pushReasonTag(tag) {
            tagTexts.push(tag);
        });
        keywords.filter(Boolean).slice(0, 8).forEach(function pushKeyword(keyword) {
            tagTexts.push(`# ${keyword}`);
        });
        const tagsHtml = renderUniqueHipTags(tagTexts, 16);

        return `
            <div class="hip-event-member-detail">
                <div class="hip-event-member-body">${fullContent}</div>
                ${tagsHtml ? `<div class="hip-tags">${tagsHtml}</div>` : ''}
                <div class="hip-card-reason">${reasonText}</div>
                ${groundingPanelHtml}
                ${reconsolidationHintHtml}
                ${reconAuditHtml}
                <div class="hip-card-meta">
                    <span class="hip-meta-item" style="color:${ecoColor};">${importanceText}</span>
                    <span class="hip-meta-dot">·</span>
                    <span class="hip-meta-item">${layer}</span>
                    ${salienceScore > 0 ? `<span class="hip-meta-dot">·</span><span class="hip-meta-item">显著度 ${salienceScore.toFixed(2)}</span>` : ''}
                    ${flashbulbScore > 0 ? `<span class="hip-meta-dot">·</span><span class="hip-meta-item">高冲击 ${flashbulbScore.toFixed(2)}</span>` : ''}
                    <span class="hip-meta-dot">·</span>
                    <span class="hip-meta-item">想起 ${activationCount} 次</span>
                    <span class="hip-meta-dot">·</span>
                    <span class="hip-meta-item">${timeText}</span>
                    <span class="hip-meta-dot">·</span>
                    <span class="hip-meta-item">${isResolved ? '已释怀' : '未释怀'}</span>
                </div>
                <div class="hip-card-actions">
                    <button type="button" class="hip-btn-outline hip-btn-inline" data-hip-action="edit-memory" data-memory-id="${escapeAttribute(memoryId)}">修改正文</button>
                    <button type="button" class="hip-btn-outline hip-btn-inline" data-hip-action="toggle-resolved" data-memory-id="${escapeAttribute(memoryId)}">${isResolved ? '重拾记忆' : '帮 TA 释怀'}</button>
                </div>
            </div>
        `;
    }

    /**
     * 渲染事件卡片，支持二级展开查看成员条目。
     */
    function renderEventCard(eventItem) {
        const safeEvent = eventItem && typeof eventItem === 'object' ? eventItem : {};
        const eventId = toTrimmedString(safeEvent.eventId);
        if (!eventId) return '';

        const expanded = state.expandedEventId === eventId;
        const reconBusy = isManualReconBusy('event', eventId);
        const membersExpanded = state.expandedEventMembersEventId === eventId;
        const baseMemberCount = Math.max(0, Number(safeEvent.memberCount || 0));
        const cachedMembers = getCachedEventMembers(eventId);
        const members = cachedMembers.length > 0
            ? cachedMembers
            : (Array.isArray(safeEvent.members) ? safeEvent.members : []);
        const loadedMemberCount = Math.max(0, members.length || Number(safeEvent.loadedMemberCount || baseMemberCount));
        const memberCount = Math.max(baseMemberCount, loadedMemberCount);
        const partialMemberCount = loadedMemberCount > 0 && memberCount > loadedMemberCount;
        const loadingMembers = state.loadingEventMembersEventId === eventId;
        const unresolvedCount = Math.max(0, Number(safeEvent.unresolvedCount || 0));
        const eventFlashbulbIds = normalizeIdArray(safeEvent.flashbulbMemoryIds, 24);
        const flashbulbIdSet = new Set(eventFlashbulbIds);
        const flashbulbCount = Math.max(0, Number(safeEvent.flashbulbCount || eventFlashbulbIds.length || 0));
        const keywords = Array.isArray(safeEvent.keywords) ? safeEvent.keywords : [];
        const signalTags = normalizeTextArray(safeEvent.signalTags, 8).map(humanizeEventSignalTag);
        const flashbulbReasonTags = normalizeTextArray(safeEvent.flashbulbReasonTags, 6).map(humanizeEventSignalTag);
        const salienceScore = Math.max(0, Math.min(1, Number(safeEvent.salienceScore || 0)));
        const flashbulbScore = Math.max(0, Math.min(1, Number(safeEvent.flashbulbScore || 0)));
        const versionHistory = mergeEventVersionHistoryEntries(
            getMemoryEventVersionHistory(safeEvent),
            collectEventVersionHistoryFromMembers(members, 12),
            12
        );
        const manualGuardSnapshot = getMemoryEventManualGuardSnapshot(safeEvent);
        const lifecycleContext = Object.assign({}, safeEvent, {
            event_version_history: versionHistory
        });
        const lifecycleSnapshot = getEventLifecycleSnapshot(lifecycleContext);
        const isRetired = lifecycleSnapshot.retired;
        const latestVersionHint = buildEventVersionHistoryHintSafe(lifecycleContext);
        const manualGuardHint = buildEventManualGuardHint(safeEvent);
        const keywordTagTexts = [];
        if (safeEvent.isFlashbulb) {
            keywordTagTexts.push('印象很深');
        }
        signalTags.slice(0, 5).forEach(function pushSignalTag(tag) {
            keywordTagTexts.push(tag);
        });
        flashbulbReasonTags.slice(0, 4).forEach(function pushReasonTag(tag) {
            keywordTagTexts.push(tag);
        });
        if (keywords.length > 0) {
            keywordTagTexts.push.apply(keywordTagTexts, keywords.map(function mapKeyword(keyword) {
                return `# ${keyword}`;
            }));
        }
        const keywordTagsHtml = renderUniqueHipTags(keywordTagTexts, 16);
        const depthText = safeEvent.depth === 'high'
            ? '深刻事件'
            : safeEvent.depth === 'low'
                ? '浅层事件'
                : '中层事件';
        const summary = escapeHtml(toTrimmedString(safeEvent.summary) || '这是一段待回看的记忆事件。');
        const title = escapeHtml(toTrimmedString(safeEvent.title) || '记忆事件');
        const latestText = safeEvent.latestTimestamp > 0
            ? escapeHtml(formatTimeAgo(new Date(safeEvent.latestTimestamp).toISOString()))
            : '刚才';
        const importanceLabel = escapeHtml(humanizeImportance(safeEvent.importance));
        const color = toTrimmedString(safeEvent.color) || '#60a5fa';
        const isResolved = !!safeEvent.isResolved;
        const statusText = isRetired ? '已退役' : (isResolved ? '已了结' : '未了结');
        const regressionHelper = getRegressionHelperState();
        const trackedRegressionEventId = toTrimmedString(regressionHelper.trackedEventId);
        const isTrackedByRegressionHelper = !!trackedRegressionEventId && trackedRegressionEventId === eventId;
        const regressionBusy = !!regressionHelper.busy;
        const groundingPanelHtml = renderEventGroundingPanel(safeEvent, members, {
            loadedMemberCount: loadedMemberCount,
            totalMemberCount: memberCount,
            partial: partialMemberCount
        });
        const digestStabilityPanelHtml = renderEventDigestStabilityPanel(lifecycleContext);
        const eventVersionHistoryHtml = renderEventVersionHistoryPanel(lifecycleContext);
        const lifecyclePanelHtml = renderEventLifecyclePanel(lifecycleContext);
        const manualReconButtonHtml = isRetired
            ? ''
            : `<div class="hip-card-actions"><button type="button" class="hip-btn-outline" data-hip-action="run-event-reconsolidation" data-event-id="${escapeAttribute(eventId)}" ${reconBusy ? 'disabled' : ''}>${reconBusy ? '改写中...' : '手动重写这件事'}</button></div>`;
        const membersHtml = membersExpanded && !isRetired
            ? `
                <div class="hip-event-members">
                    ${loadingMembers ? '<div class="hip-event-members-hint">正在加载该事件的全部成员...</div>' : ''}
                    ${partialMemberCount ? `<div class="hip-event-members-hint">当前仅展示本页命中的 ${loadedMemberCount} / ${memberCount} 条成员，翻页可查看其余条目。</div>` : ''}
                    ${members.map(function renderEventMember(member, index) {
                        const memoryId = toTrimmedString(member && member.id);
                        const content = escapeHtml(toTrimmedString(member && member.content) || '（空内容）');
                        const layer = escapeHtml(toTrimmedString(member && (member.memory_layer || member.layer)) || 'buffer');
                        const importance = escapeHtml(humanizeImportance(member && member.importance));
                        const timeText = escapeHtml(formatTimeAgo(member && (member.last_active_at || member.created_at)));
                        const detailExpanded = !!memoryId && state.expandedEventMemberMemoryId === memoryId;
                        return `
                            <div class="hip-event-member-row">
                                <div class="hip-event-member-main">
                                    <div class="hip-event-member-meta">#${index + 1} · ${layer} · ${importance} · ${timeText}</div>
                                    <div class="hip-event-member-content">${content}</div>
                                </div>
                                ${memoryId
                                    ? `<div class="hip-event-member-actions">
                                        <button type="button" class="hip-btn-outline hip-btn-inline" data-hip-action="focus-memory" data-event-id="${escapeAttribute(eventId)}" data-memory-id="${escapeAttribute(memoryId)}">${detailExpanded ? '收起条目' : '查看条目'}</button>
                                        <button type="button" class="hip-btn-danger hip-btn-inline" data-hip-action="remove-event-member" data-event-id="${escapeAttribute(eventId)}" data-memory-id="${escapeAttribute(memoryId)}">移出事件</button>
                                    </div>`
                                    : ''}
                                ${detailExpanded ? renderEventMemberDetail(member) : ''}
                            </div>
                        `;
                    }).join('')}
                </div>
            `
            : '';
        const cardActionsHtml = isRetired
            ? `
                <div class="hip-card-actions">
                    <div class="hip-box-hint">退役事件以只读方式保留，用来追踪它为什么退出、被谁接替，不再接受手动改写或成员调整。</div>
                </div>
            `
            : `
                <div class="hip-card-actions">
                    <button type="button" class="hip-btn-outline" data-hip-action="edit-event" data-event-id="${escapeAttribute(eventId)}">编辑事件</button>
                    <button type="button" class="hip-btn-outline" data-hip-action="merge-event" data-event-id="${escapeAttribute(eventId)}">并入其他事件</button>
                    <button type="button" class="hip-btn-outline" data-hip-action="toggle-event-members" data-event-id="${escapeAttribute(eventId)}" ${loadingMembers ? 'disabled' : ''}>${loadingMembers ? '加载成员中...' : (membersExpanded ? '收起成员条目' : `查看成员条目 (${partialMemberCount ? `${loadedMemberCount}/${memberCount}` : memberCount})`)}</button>
                    <button type="button" class="hip-btn-outline" data-hip-action="toggle-event-resolved" data-event-id="${escapeAttribute(eventId)}">${isResolved ? '标记为未了结' : '标记为已了结'}</button>
                    <button type="button" class="hip-btn-outline hip-btn-inline" data-hip-action="remember-regression-event" data-event-id="${escapeAttribute(eventId)}" ${regressionBusy ? 'disabled' : ''}>${isTrackedByRegressionHelper ? '更新基线' : '记住此事件'}</button>
                    ${isTrackedByRegressionHelper ? `<button type="button" class="hip-btn-outline hip-btn-inline" data-hip-action="check-regression-event" data-event-id="${escapeAttribute(eventId)}" ${regressionBusy ? 'disabled' : ''}>${regressionBusy ? '检查中...' : '检查变化'}</button>` : ''}
                    ${isTrackedByRegressionHelper ? `<button type="button" class="hip-btn-danger hip-btn-inline" data-hip-action="clear-regression-event" data-event-id="${escapeAttribute(eventId)}" ${regressionBusy ? 'disabled' : ''}>清除跟踪</button>` : ''}
                </div>
            `;

        return `
            <article class="hip-card hip-card-event ${expanded ? 'expanded' : ''} ${isResolved ? 'resolved' : ''} ${isRetired ? 'retired' : ''}" data-hip-action="toggle-event" data-event-id="${escapeAttribute(eventId)}" style="--hip-memory-color:${color};">
                <div class="hip-event-head">
                    <div class="hip-event-title-wrap">
                        <div class="hip-event-title">${title}</div>
                        <div class="hip-event-subtitle">${summary}</div>
                    </div>
                    <div class="hip-event-status ${isRetired || isResolved ? 'is-resolved' : 'is-unresolved'}">${statusText}</div>
                </div>
                <div class="hip-card-meta">
                    <span class="hip-meta-item" style="color:${color};">${importanceLabel}</span>
                    <span class="hip-meta-dot">·</span>
                    <span class="hip-meta-item">${depthText}</span>
                    <span class="hip-meta-dot">·</span>
                    <span class="hip-meta-item">包含 ${memberCount} 条</span>
                    ${partialMemberCount ? `<span class="hip-meta-dot">·</span><span class="hip-meta-item">本页可见 ${loadedMemberCount} 条</span>` : ''}
                    ${salienceScore > 0 ? `<span class="hip-meta-dot">·</span><span class="hip-meta-item">显著度 ${salienceScore.toFixed(2)}</span>` : ''}
                    ${flashbulbScore > 0 ? `<span class="hip-meta-dot">·</span><span class="hip-meta-item">高冲击 ${flashbulbScore.toFixed(2)}</span>` : ''}
                    ${versionHistory.length > 0 ? `<span class="hip-meta-dot">·</span><span class="hip-meta-item">留痕 ${versionHistory.length} 次</span>` : ''}
                    <span class="hip-meta-dot">·</span>
                    ${manualGuardSnapshot.historyCount > 0 ? `<span class="hip-meta-item">人工保护 ${manualGuardSnapshot.historyCount} 次</span><span class="hip-meta-dot">·</span>` : (safeEvent.manualEdited ? `<span class="hip-meta-item">人工保护中</span><span class="hip-meta-dot">·</span>` : '')}
                    <span class="hip-meta-item">${latestText}</span>
                    ${isRetired && lifecycleSnapshot.retiredAt ? `<span class="hip-meta-dot">·</span><span class="hip-meta-item">退役于 ${escapeHtml(formatDateTime(lifecycleSnapshot.retiredAt))}</span>` : ''}
                    ${!isRetired && unresolvedCount > 0 ? `<span class="hip-meta-dot">·</span><span class="hip-meta-item">未释怀 ${unresolvedCount} 条</span>` : ''}
                </div>
                ${expanded ? `
                    <div class="hip-card-expand">
                        ${keywordTagsHtml ? `<div class="hip-tags">${keywordTagsHtml}</div>` : ''}
                        ${manualGuardHint ? `<div class="hip-card-reason">${escapeHtml(manualGuardHint)}</div>` : ''}
                        ${latestVersionHint ? `<div class="hip-card-reason">${escapeHtml(latestVersionHint)}</div>` : ''}
                        ${lifecyclePanelHtml}
                        ${eventVersionHistoryHtml}
                        ${digestStabilityPanelHtml}
                        ${signalTags.length > 0 || flashbulbReasonTags.length > 0
                            ? `<div class="hip-card-reason">系统更容易记住这件事，因为它${escapeHtml(
                                []
                                    .concat(signalTags.slice(0, 2))
                                    .concat(flashbulbReasonTags.slice(0, 2))
                                    .filter(Boolean)
                                    .join('、')
                            )}。</div>`
                            : ''}
                        ${groundingPanelHtml}
                        ${manualReconButtonHtml}
                        ${cardActionsHtml}
                        ${membersHtml}
                    </div>
                ` : ''}
            </article>
        `;
    }

    /**
     * 渲染单条记忆卡片和展开详情。
     */
    function renderMemoryCard(memory) {
        const safeMemory = memory && typeof memory === 'object' ? memory : {};
        const memoryId = toTrimmedString(safeMemory.id);
        const expanded = !!memoryId && state.expandedMemoryId === memoryId;
        const reconBusy = isManualReconBusy('memory', memoryId);
        const metadata = typeof safeMemory.metadata === 'object' && safeMemory.metadata ? safeMemory.metadata : {};
        const currentEventId = getMemoryEventId(safeMemory);
        const layer = toTrimmedString(
            safeMemory.memory_layer
            || safeMemory.layer
            || metadata.memory_layer
            || metadata.memoryLayer
            || metadata.layer
        ).toLowerCase();
        const ecoColor = getEmotionColor(safeMemory.valence, safeMemory.arousal, layer);
        const keywords = Array.isArray(metadata.trigger_keywords) ? metadata.trigger_keywords : [];
        const isResolved = isMemoryResolved(safeMemory);
        const isFlashbulb = isMemoryFlashbulb(safeMemory);
        const eventIsFlashbulb = isMemoryEventFlashbulb(safeMemory);
        const activationCount = formatActivationCount(safeMemory.activation_count);
        const importanceValue = normalizeImportanceForDisplay(safeMemory.importance);
        const signalTags = getMemoryEventSignalTags(safeMemory).map(humanizeEventSignalTag);
        const flashbulbReasonTags = getMemoryEventFlashbulbReasonTags(safeMemory).map(humanizeEventSignalTag);
        const salienceScore = getMemoryEventSalienceScore(safeMemory);
        const flashbulbScore = getMemoryEventFlashbulbScore(safeMemory);
        const reconsolidationHintHtml = renderMemoryReconsolidationHint(safeMemory);
        const reconAuditHtml = renderMemoryReconAuditPanel(safeMemory);
        const groundingPanelHtml = renderGroundingSupportPanel(getMemoryGroundingSupport(safeMemory), {
            title: '这条记忆和原聊天对得上吗'
        });
        const manualReconButtonHtml = `<div class="hip-card-actions"><button type="button" class="hip-btn-outline" data-hip-action="run-memory-reconsolidation" data-memory-id="${escapeAttribute(memoryId)}" ${reconBusy ? 'disabled' : ''}>${reconBusy ? '改写中...' : '手动重写这条记忆'}</button></div>`;
        const triggerTagTexts = [];
        if (isFlashbulb) {
            triggerTagTexts.push('印象很深');
        } else if (eventIsFlashbulb) {
            triggerTagTexts.push('属于高冲击事件');
        }
        signalTags.slice(0, 4).forEach(function pushSignalTag(tag) {
            triggerTagTexts.push(tag);
        });
        flashbulbReasonTags.slice(0, 3).forEach(function pushReasonTag(tag) {
            triggerTagTexts.push(tag);
        });
        if (keywords.length > 0) {
            triggerTagTexts.push.apply(triggerTagTexts, keywords.filter(Boolean).map(function wrapKeyword(keyword) {
                return `# ${keyword}`;
            }));
        }
        const triggerTagsHtml = renderUniqueHipTags(triggerTagTexts, 16);
        const content = escapeHtml(safeMemory.content || '无内容片段');
        const importanceText = escapeHtml(humanizeImportance(safeMemory.importance));
        const timeText = escapeHtml(formatTimeAgo(safeMemory.last_active_at || safeMemory.created_at));
        const reasonText = escapeHtml(explainSurfaceReason(safeMemory));
        const starSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="margin-right:2px"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"></path></svg>';
        const markerHtml = importanceValue >= 8
            ? starSvg
            : `<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${ecoColor};margin-right:4px;"></span>`;

        return `
            <article class="hip-card ${expanded ? 'expanded' : ''} ${isResolved ? 'resolved' : ''}" data-hip-action="toggle-memory" data-memory-id="${escapeAttribute(memoryId)}" style="--hip-memory-color:${ecoColor};">
                <div class="hip-card-content">${content}</div>
                <div class="hip-card-meta">
                    <span class="hip-meta-item" style="color:${ecoColor};">${markerHtml}${importanceText}</span>
                    ${isFlashbulb ? '<span class="hip-meta-dot">·</span><span class="hip-meta-item">印象很深</span>' : ''}
                    <span class="hip-meta-dot">·</span>
                    <span class="hip-meta-item">想起 ${activationCount} 次</span>
                    <span class="hip-meta-dot">·</span>
                    <span class="hip-meta-item">${timeText}</span>
                    ${salienceScore > 0 ? `<span class="hip-meta-dot">·</span><span class="hip-meta-item">显著度 ${salienceScore.toFixed(2)}</span>` : ''}
                </div>
                ${expanded ? `
                    <div class="hip-card-expand">
                        ${triggerTagsHtml ? `<div class="hip-tags">${triggerTagsHtml}</div>` : ''}
                        ${flashbulbScore > 0 ? `<div class="hip-card-reason">这条记忆所属事件的高冲击评分约为 ${escapeHtml(flashbulbScore.toFixed(2))}。</div>` : ''}
                        <div class="hip-card-reason">${reasonText}</div>
                        ${groundingPanelHtml}
                        ${reconsolidationHintHtml}
                        ${reconAuditHtml}
                        ${manualReconButtonHtml}
                        <div class="hip-card-actions">
                            <button type="button" class="hip-btn-outline" data-hip-action="edit-memory" data-memory-id="${escapeAttribute(memoryId)}">修改记忆</button>
                            <button type="button" class="hip-btn-outline" data-hip-action="toggle-resolved" data-memory-id="${escapeAttribute(memoryId)}">${isResolved ? '重拾记忆' : '帮 TA 释怀'}</button>
                            ${!currentEventId ? `<button type="button" class="hip-btn-outline" data-hip-action="attach-to-event" data-memory-id="${escapeAttribute(memoryId)}">并入事件</button>` : ''}
                            <button type="button" class="hip-btn-danger" data-hip-action="delete-memory" data-memory-id="${escapeAttribute(memoryId)}">彻底遗忘</button>
                        </div>
                    </div>
                ` : ''}
            </article>
        `;
    }

    /**
     * 渲染统一加载中面板。
     */
    function renderLoadingPanel(message) {
        return `
            <div class="hip-loading">
                <div>${escapeHtml(message || '感知内心深处...')}</div>
            </div>
        `;
    }


    /**
     * 根据联系人列表渲染角色选择项。
     */
    function renderContactOptions(contacts, selectedCharId) {
        const safeContacts = Array.isArray(contacts) ? contacts : [];
        const selectedValue = toTrimmedString(selectedCharId);
        const options = [renderOption('', '全部已开启角色', selectedValue)];

        safeContacts.forEach(function renderContactOption(contact) {
            const value = toTrimmedString(contact && contact.id);
            const label = getContactLabel(value);
            options.push(renderOption(value, label, selectedValue));
        });

        return options.join('');
    }

    /**
     * 渲染单个 option 标签。
     */
    function renderOption(value, label, selectedValue) {
        const safeValue = toTrimmedString(value);
        return `<option value="${escapeAttribute(safeValue)}" ${safeValue === toTrimmedString(selectedValue) ? 'selected' : ''}>${escapeHtml(label)}</option>`;
    }

    /**
     * 渲染页签按钮。
     */
    function renderTabButton(tab, label) {
        const active = normalizeTab(tab) === state.activeTab;
        return `<button type="button" class="hip-admin-tab-btn ${active ? 'active' : ''}" data-hip-action="switch-tab" data-tab="${escapeAttribute(tab)}">${escapeHtml(label)}</button>`;
    }

    /**
     * 渲染详情区里的小型统计块。
     */
    function renderInlineStat(label, value) {
        return `
            <div class="hip-admin-inline-stat">
                <span class="hip-admin-muted">${escapeHtml(label)}</span>
                <strong>${escapeHtml(formatInlineValue(value))}</strong>
            </div>
        `;
    }

    /**
     * 获取管理台顶部显示用的本地元信息。
     */
    function getAdminMeta() {
        const client = getClient();
        if (!client || typeof client.getAdminMeta !== 'function') {
            return {
                lastExportAt: null,
                lastSnapshotAt: null
            };
        }

        return client.getAdminMeta() || {
            lastExportAt: null,
            lastSnapshotAt: null
        };
    }

    /**
     * 获取当前已开启海马体的角色列表。
     */
    function getEnabledContacts() {
        const client = getClient();
        if (!client || typeof client.listEnabledContacts !== 'function') {
            return [];
        }

        const contacts = client.listEnabledContacts();
        return Array.isArray(contacts) ? contacts.map(normalizeContactSummary).filter(Boolean) : [];
    }

    /**
     * 获取当前聊天角色的简要信息。
     */
    function getCurrentContactSummary() {
        const client = getClient();
        if (!client || typeof client.getCurrentContactSummary !== 'function') {
            return null;
        }

        return normalizeContactSummary(client.getCurrentContactSummary());
    }

    /**
     * 确保当前角色筛选有一个合法默认值。
     */
    function ensureDefaultCharFilter(preferredCharId) {
        const enabledContacts = getEnabledContacts();
        const enabledMap = new Map(enabledContacts.map(function buildContactMapItem(contact) {
            return [toTrimmedString(contact.id), contact];
        }));
        const currentSummary = normalizeContactSummary(getCurrentContactSummary());
        const explicitCharId = toTrimmedString(preferredCharId);
        const existingCharId = toTrimmedString(state.filters.charId);

        if (existingCharId && enabledMap.has(existingCharId)) {
            return;
        }

        if (explicitCharId && enabledMap.has(explicitCharId)) {
            state.filters.charId = explicitCharId;
            return;
        }

        if (currentSummary && currentSummary.hippocampusEnabled && enabledMap.has(toTrimmedString(currentSummary.id))) {
            state.filters.charId = toTrimmedString(currentSummary.id);
            return;
        }

        state.filters.charId = enabledContacts[0] ? toTrimmedString(enabledContacts[0].id) : null;
    }

    /**
     * 构造“全量导出”应使用的筛选条件。
     */
    function buildFullExportFilters() {
        return {
            charId: toNullableText(state.filters.charId),
            roomId: null,
            contextScope: null,
            resolved: null,
            query: null,
            sort: 'created_at_desc',
            limit: PAGE_SIZE,
            offset: 0
        };
    }

    /**
     * 构造列表页当前分页应使用的筛选条件。
     */
    function buildCurrentListFilters() {
        const pager = state.listPagination && typeof state.listPagination === 'object'
            ? state.listPagination
            : null;
        return {
            charId: toNullableText(state.filters.charId),
            roomId: toNullableText(state.filters.roomId),
            contextScope: toNullableText(state.filters.contextScope),
            resolved: toNullableText(state.filters.resolved),
            query: toNullableText(state.filters.query),
            sort: normalizeSort(state.filters.sort),
            limit: PAGE_SIZE,
            offset: state.filters.offset || 0,
            cursor: pager ? cloneListCursor(pager.cursor) : null
        };
    }

    function buildCurrentEventRecordListFilters() {
        return {
            charId: toNullableText(state.filters.charId),
            query: toNullableText(state.filters.query),
            retired: 'only',
            sort: normalizeEventRecordListSort(state.filters.sort),
            limit: PAGE_SIZE,
            offset: state.filters.offset || 0
        };
    }

    function renderListSortOptions(recordType, selectedValue) {
        const safeSelected = normalizeListSort(selectedValue, recordType);
        if (isDirectEventRecordListMode(recordType)) {
            return [
                renderOption('last_related_at_desc', '最近关联', safeSelected),
                renderOption('updated_at_desc', '最近更新', safeSelected),
                renderOption('created_at_desc', '创建时间', safeSelected),
                renderOption('version_churn_desc', '留痕最多', safeSelected)
            ].join('');
        }
        return [
            renderOption('created_at_desc', '最新', safeSelected),
            renderOption('last_active_at_desc', '最活跃', safeSelected),
            renderOption('score_desc', '最强烈', safeSelected)
        ].join('');
    }

    /**
     * 构造“当前筛选结果”导出应使用的完整筛选条件。
     */
    function buildFilteredExportFilters() {
        return {
            charId: toNullableText(state.filters.charId),
            roomId: toNullableText(state.filters.roomId),
            contextScope: toNullableText(state.filters.contextScope),
            resolved: toNullableText(state.filters.resolved),
            query: toNullableText(state.filters.query),
            sort: normalizeSort(state.filters.sort),
            limit: PAGE_SIZE,
            offset: 0
        };
    }

    /**
     * 判断当前筛选是否属于“缩小范围”的导出或快照。
     */
    function hasNarrowFilters(filters) {
        const source = filters && typeof filters === 'object' ? filters : {};
        return !!(source.roomId || source.contextScope || source.resolved || source.query);
    }

    /**
     * 构建人类可读的范围说明。
     */
    function buildScopeText(filters) {
        const client = getClient();
        if (client && typeof client.buildScopeLabel === 'function') {
            const label = toTrimmedString(client.buildScopeLabel(filters));
            return label || '全部已开启角色';
        }

        const source = filters && typeof filters === 'object' ? filters : {};
        return source.charId ? `角色 ${source.charId}` : '全部已开启角色';
    }

    /**
     * 获取某个角色 ID 在管理台里的友好显示名。
     */
    function getContactLabel(charId) {
        const safeCharId = toTrimmedString(charId);
        if (!safeCharId) {
            return '全部已开启角色';
        }

        const match = getEnabledContacts().find(function matchContact(contact) {
            return toTrimmedString(contact && contact.id) === safeCharId;
        });

        if (!match) {
            return safeCharId;
        }

        return toTrimmedString(match.remark) || toTrimmedString(match.name) || safeCharId;
    }

    /**
     * 将浮现原因转换为更自然的展示标签。
     */
    function formatSurfaceReasonLabel(surfaceReason) {
        const text = toTrimmedString(surfaceReason);
        return text || '暂无明确标签';
    }

    /**
     * 给浮现原因补一条自然语言解释，帮助用户理解为什么会浮现。
     */
    function explainSurfaceReason(memory) {
        const reason = toTrimmedString(memory && memory.surface_reason);
        if (reason.includes('高唤醒未解决')) {
            return '这条记忆仍未解决，而且情绪唤醒度较高，所以更容易反复浮现。';
        }
        if (reason.includes('最近频繁被激活')) {
            return '这条记忆最近被多次命中或调用，因此会继续保持在表层。';
        }
        if (reason.includes('房间上下文命中')) {
            return '这条记忆和当前房间语境有关，房间上下文命中时更容易被召回。';
        }
        if (reason.includes('关键词搜索召回')) {
            return '这条记忆主要是被当前查询词命中后召回出来的。';
        }
        if (memory && memory.resolved) {
            return '这条记忆已经被标记为已解决，现在更多作为检索补充存在。';
        }
        if (toTrimmedString(memory && memory.context_scope) === 'room') {
            return '这条记忆属于房间上下文，相关房间对话会让它更容易出现。';
        }
        return '这条记忆当前的浮现分数较高，所以进入了表层候选范围。';
    }

    /**
     * 将上下文范围转成用户友好的短标签。
     */
    function formatContextScopeLabel(contextScope, roomId) {
        const scope = toTrimmedString(contextScope);
        if (scope === 'room') {
            return roomId ? `房间 ${roomId}` : '房间记忆';
        }
        return '私聊记忆';
    }

    /**
     * 将 resolved 状态转成用户友好的短标签。
     */
    function formatResolvedLabel(resolved) {
        return resolved ? '已解决' : '未解决';
    }

    /**
     * 判断管理台记忆是否已完成向量化。
     */
    function hasMemoryEmbedding(memory) {
        if (!memory || typeof memory !== 'object') return null;
        if (memory.has_embedding === true) return true;
        if (memory.has_embedding === false) return false;
        return null;
    }

    /**
     * 渲染记忆“向量化状态”标签。
     */
    function formatEmbeddingStatusLabel(memory) {
        const hasEmbedding = hasMemoryEmbedding(memory);
        if (hasEmbedding === true) return '已向量';
        if (hasEmbedding === false) return '未向量';
        return '向量未知';
    }

    /**
     * 将浮现分数统一格式化为两位小数。
     */
    function formatScore(value) {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric.toFixed(2) : '0.00';
    }

    /**
     * 将任意详情值转换成适合行内展示的文本。
     */
    function formatInlineValue(value) {
        if (value === null || value === undefined || value === '') return '无';
        if (typeof value === 'number' && Number.isFinite(value)) return String(value);
        return String(value);
    }

    /**
     * 将字节大小转换为易读文本。
     */
    function formatBytes(value) {
        const bytes = Number(value);
        if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
    }

    /**
     * 将时间戳或时间字符串转换成统一的本地时间文本。
     */
    function formatDateTime(value) {
        if (!value) return '暂无';
        const date = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(date.getTime())) return '暂无';
        return date.toLocaleString('zh-CN', {
            hour12: false
        });
    }

    /**
     * 规范化依恋型枚举值。
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
     * 将依恋型枚举转为用户可读文案。
     */
    function formatAttachmentStyleLabel(style) {
        const normalized = normalizeAttachmentStyle(style);
        if (normalized === 'anxious') return '焦虑型';
        if (normalized === 'avoidant') return '回避型';
        if (normalized === 'disorganized') return '混乱型';
        return '安全型';
    }

    /**
     * 将内容裁剪成适合列表展示的摘要。
     */
    function summarizeContent(content, maxLength) {
        const safeMaxLength = Math.max(12, Number(maxLength) || 48);
        const cleanText = toTrimmedString(content).replace(/\s+/g, ' ');
        if (!cleanText) return '无内容';
        return cleanText.length > safeMaxLength ? `${cleanText.slice(0, safeMaxLength)}...` : cleanText;
    }

    /**
     * 将 metadata 对象格式化成只读 JSON 文本。
     */
    function formatMetadataJson(metadata) {
        if (!metadata || typeof metadata !== 'object') return '{}';
        try {
            return JSON.stringify(metadata, null, 2);
        } catch (_) {
            return '{}';
        }
    }

    /**
     * 将外部联系人对象规范化成简要安全对象。
     */
    function normalizeContactSummary(contact) {
        if (!contact || typeof contact !== 'object') return null;

        const id = toTrimmedString(contact.id);
        if (!id) return null;

        return {
            id: id,
            name: toTrimmedString(contact.name) || id,
            remark: toTrimmedString(contact.remark) || toTrimmedString(contact.name) || id,
            hippocampusEnabled: !!contact.hippocampusEnabled
        };
    }

    /**
     * 规范化页签名，防止非法值污染状态。
     */
    function normalizeTab(tab) {
        const safeTab = toTrimmedString(tab);
        if (safeTab === 'audit' || safeTab === 'diagnostics' || safeTab === 'list' || safeTab === 'continuity' || safeTab === 'relationship' || safeTab === 'notebook' || safeTab === 'export' || safeTab === 'snapshot') {
            return safeTab;
        }
        if (safeTab === 'recon') {
            return safeTab;
        }
        return 'overview';
    }

    /**
     * 规范化排序值，只允许 SQL 约定的三个枚举。
     */
    function normalizeSort(sort) {
        const safeSort = toTrimmedString(sort);
        if (safeSort === 'last_active_at_desc' || safeSort === 'score_desc') {
            return safeSort;
        }
        return 'created_at_desc';
    }

    function isDirectEventRecordListMode(recordType) {
        return toTrimmedString(recordType).toLowerCase() === 'retired_event';
    }

    function normalizeEventRecordListSort(sort) {
        const safeSort = toTrimmedString(sort).toLowerCase();
        if (
            safeSort === 'last_related_at_desc'
            || safeSort === 'updated_at_desc'
            || safeSort === 'created_at_desc'
            || safeSort === 'version_churn_desc'
            || safeSort === 'fragment_count_desc'
        ) {
            return safeSort;
        }
        if (safeSort === 'last_active_at_desc') return 'last_related_at_desc';
        if (safeSort === 'score_desc') return 'version_churn_desc';
        return 'last_related_at_desc';
    }

    function normalizeListSort(sort, recordType) {
        if (isDirectEventRecordListMode(recordType)) {
            return normalizeEventRecordListSort(sort);
        }
        return normalizeSort(sort);
    }

    /**
     * 将值转为裁剪后的字符串。
     */
    function toTrimmedString(value) {
        return String(value === undefined || value === null ? '' : value).trim();
    }

    /**
     * 将空字符串标准化为 null。
     */
    function toNullableText(value) {
        const text = toTrimmedString(value);
        return text || null;
    }

    /**
     * 将输入规整为布尔值；无法识别时回退 false。
     */
    function toBoolean(value) {
        if (value === true || value === false) return value;
        if (value === 1 || value === '1') return true;
        if (value === 0 || value === '0') return false;
        const normalized = toTrimmedString(value).toLowerCase();
        return normalized === 'true' || normalized === 'yes' || normalized === 'resolved';
    }

    /**
     * 对 HTML 文本做最小转义，避免列表内容破坏布局。
     */
    function escapeHtml(value) {
        return String(value === undefined || value === null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /**
     * 对属性值做转义，避免 data-* 和 input value 被截断。
     */
    function escapeAttribute(value) {
        return escapeHtml(value).replace(/`/g, '&#96;');
    }

    /**
     * 依据当前 DOM 状态自动挂载 / 销毁神经星球特效。
     */
    function syncNeuralGlobeLifecycle() {
        const documentRef = root && root.document ? root.document : null;
        if (!documentRef) return;
        const container = documentRef.getElementById(NEURAL_GLOBE_CONTAINER_ID);
        if (!container || state.activeTab !== 'overview' || state.loading) {
            disposeNeuralGlobe();
            return;
        }
        void initNeuralGlobe(container);
    }

    /**
     * 初始化总览页 3D 神经星球，含低性能与低动效降级。
     */
    async function initNeuralGlobe(container) {
        if (!container) return;
        if (state.threeGlobeInstance && state.threeGlobeInstance.container === container) return;

        disposeNeuralGlobe();

        const userAgent = root.navigator && root.navigator.userAgent ? String(root.navigator.userAgent) : '';
        const hardwareConcurrency = Number(root.navigator && root.navigator.hardwareConcurrency ? root.navigator.hardwareConcurrency : 0);
        const isReducedMotion = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
        const isLowEndMobile = /Mobi|Android/i.test(userAgent) && hardwareConcurrency > 0 && hardwareConcurrency < 4;

        if (isReducedMotion || isLowEndMobile) {
            renderNeuralFallback(container);
            return;
        }

        try {
            await ensureThreeLibrary();
            if (!root.THREE || !container.isConnected) {
                renderNeuralFallback(container);
                return;
            }

            const THREE = root.THREE;
            const width = Math.max(1, container.clientWidth || 80);
            const height = Math.max(1, container.clientHeight || 80);

            container.innerHTML = '';

            const scene = new THREE.Scene();
            const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
            camera.position.z = 18;

            const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
            renderer.setSize(width, height, false);
            renderer.setPixelRatio(Math.min(Number(root.devicePixelRatio) || 1, 1.5));
            container.appendChild(renderer.domElement);

            const particleCount = 45;
            const particleGeometry = new THREE.BufferGeometry();
            const positions = new Float32Array(particleCount * 3);
            const velocities = [];

            for (let i = 0; i < particleCount; i += 1) {
                const radius = 6 + Math.random() * 2;
                const theta = Math.random() * Math.PI * 2;
                const phi = Math.acos(Math.random() * 2 - 1);
                positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
                positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
                positions[i * 3 + 2] = radius * Math.cos(phi);
                velocities.push({
                    x: (Math.random() - 0.5) * 0.02,
                    y: (Math.random() - 0.5) * 0.02,
                    z: (Math.random() - 0.5) * 0.02
                });
            }

            particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

            const particleMaterial = new THREE.PointsMaterial({
                color: 0xc4b5fd,
                size: 0.8,
                transparent: true,
                opacity: 0.8,
                blending: THREE.AdditiveBlending
            });
            const particleSystem = new THREE.Points(particleGeometry, particleMaterial);
            scene.add(particleSystem);

            const lineMaterial = new THREE.LineBasicMaterial({
                color: 0xa78bfa,
                transparent: true,
                opacity: 0.15,
                blending: THREE.AdditiveBlending
            });
            const maxLineSegments = (particleCount * (particleCount - 1)) / 2;
            const linePositions = new Float32Array(maxLineSegments * 6);
            const lineGeometry = new THREE.BufferGeometry();
            lineGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
            lineGeometry.setDrawRange(0, 0);
            const lines = new THREE.LineSegments(lineGeometry, lineMaterial);
            scene.add(lines);

            let animationId = 0;
            let lastFrameTime = 0;
            const frameInterval = 1000 / 30;

            const animate = function animate(time) {
                if (!container.isConnected) {
                    disposeNeuralGlobe();
                    return;
                }
                animationId = root.requestAnimationFrame(animate);
                const elapsed = time - lastFrameTime;
                if (elapsed < frameInterval) return;
                lastFrameTime = time - (elapsed % frameInterval);

                const posAttr = particleGeometry.attributes.position;
                let lineIndex = 0;

                particleSystem.rotation.y += 0.002;
                particleSystem.rotation.x += 0.001;
                lines.rotation.y += 0.002;
                lines.rotation.x += 0.001;

                for (let i = 0; i < particleCount; i += 1) {
                    const baseIndex = i * 3;
                    posAttr.array[baseIndex] += velocities[i].x;
                    posAttr.array[baseIndex + 1] += velocities[i].y;
                    posAttr.array[baseIndex + 2] += velocities[i].z;

                    const distance = Math.sqrt(
                        posAttr.array[baseIndex] * posAttr.array[baseIndex]
                        + posAttr.array[baseIndex + 1] * posAttr.array[baseIndex + 1]
                        + posAttr.array[baseIndex + 2] * posAttr.array[baseIndex + 2]
                    );
                    if (distance > 8 || distance < 3) {
                        velocities[i].x *= -1;
                        velocities[i].y *= -1;
                        velocities[i].z *= -1;
                    }

                    for (let j = i + 1; j < particleCount; j += 1) {
                        const pairIndex = j * 3;
                        const dx = posAttr.array[baseIndex] - posAttr.array[pairIndex];
                        const dy = posAttr.array[baseIndex + 1] - posAttr.array[pairIndex + 1];
                        const dz = posAttr.array[baseIndex + 2] - posAttr.array[pairIndex + 2];
                        if (dx * dx + dy * dy + dz * dz < 15) {
                            linePositions[lineIndex++] = posAttr.array[baseIndex];
                            linePositions[lineIndex++] = posAttr.array[baseIndex + 1];
                            linePositions[lineIndex++] = posAttr.array[baseIndex + 2];
                            linePositions[lineIndex++] = posAttr.array[pairIndex];
                            linePositions[lineIndex++] = posAttr.array[pairIndex + 1];
                            linePositions[lineIndex++] = posAttr.array[pairIndex + 2];
                        }
                    }
                }

                for (let i = lineIndex; i < maxLineSegments * 6; i += 1) {
                    linePositions[i] = 0;
                }
                posAttr.needsUpdate = true;
                lineGeometry.attributes.position.needsUpdate = true;
                lineGeometry.setDrawRange(0, lineIndex / 3);
                renderer.render(scene, camera);
            };
            animationId = root.requestAnimationFrame(animate);

            const resizeHandler = function resizeHandler() {
                if (!container.isConnected) return;
                const nextWidth = Math.max(1, container.clientWidth || 80);
                const nextHeight = Math.max(1, container.clientHeight || 80);
                camera.aspect = nextWidth / nextHeight;
                camera.updateProjectionMatrix();
                renderer.setSize(nextWidth, nextHeight, false);
            };
            root.addEventListener('resize', resizeHandler, { passive: true });

            let observer = null;
            if (typeof root.MutationObserver === 'function') {
                observer = new root.MutationObserver(function onMutation() {
                    if (!container.isConnected) {
                        disposeNeuralGlobe();
                    }
                });
                observer.observe(root.document.body, { childList: true, subtree: true });
            }

            state.threeGlobeInstance = {
                container: container,
                animationId: animationId,
                observer: observer,
                resizeHandler: resizeHandler,
                renderer: renderer,
                particleGeometry: particleGeometry,
                particleMaterial: particleMaterial,
                lineGeometry: lineGeometry,
                lineMaterial: lineMaterial
            };
        } catch (_) {
            renderNeuralFallback(container);
        }
    }

    /**
     * 懒加载 Three.js 主库。
     */
    function ensureThreeLibrary() {
        if (root.THREE) {
            return Promise.resolve(root.THREE);
        }
        if (state.threeLoadPromise) {
            return state.threeLoadPromise;
        }

        const documentRef = root && root.document ? root.document : null;
        if (!documentRef) {
            return Promise.reject(new Error('Document not available.'));
        }

        state.threeLoadPromise = new Promise(function resolveThree(resolve, reject) {
            const existingScript = documentRef.getElementById(THREE_SCRIPT_ID);
            const handleLoad = function handleLoad() {
                if (root.THREE) {
                    resolve(root.THREE);
                    return;
                }
                state.threeLoadPromise = null;
                reject(new Error('Three.js loaded but THREE was missing.'));
            };
            const handleError = function handleError() {
                state.threeLoadPromise = null;
                reject(new Error('Failed to load Three.js.'));
            };

            if (existingScript) {
                if (root.THREE) {
                    resolve(root.THREE);
                    return;
                }
                existingScript.addEventListener('load', handleLoad, { once: true });
                existingScript.addEventListener('error', handleError, { once: true });
                return;
            }

            const scriptEl = documentRef.createElement('script');
            scriptEl.id = THREE_SCRIPT_ID;
            scriptEl.src = THREE_SCRIPT_SRC;
            scriptEl.async = true;
            scriptEl.addEventListener('load', handleLoad, { once: true });
            scriptEl.addEventListener('error', handleError, { once: true });
            documentRef.head.appendChild(scriptEl);
        });

        return state.threeLoadPromise;
    }

    /**
     * 低性能或加载失败时渲染静态渐变。
     */
    function renderNeuralFallback(container) {
        if (!container) return;
        container.innerHTML = '<div class="hip-neural-globe-fallback" aria-hidden="true"></div>';
    }

    /**
     * 释放神经星球相关资源，避免切页后持续占用 GPU。
     */
    function disposeNeuralGlobe() {
        const instance = state.threeGlobeInstance;
        if (!instance || typeof instance !== 'object') return;

        if (instance.animationId) {
            root.cancelAnimationFrame(instance.animationId);
        }
        if (instance.observer && typeof instance.observer.disconnect === 'function') {
            instance.observer.disconnect();
        }
        if (instance.resizeHandler) {
            root.removeEventListener('resize', instance.resizeHandler);
        }
        if (instance.renderer) {
            if (instance.renderer.domElement && instance.renderer.domElement.parentNode) {
                instance.renderer.domElement.parentNode.removeChild(instance.renderer.domElement);
            }
            if (typeof instance.renderer.dispose === 'function') {
                instance.renderer.dispose();
            }
        }
        if (instance.particleGeometry && typeof instance.particleGeometry.dispose === 'function') {
            instance.particleGeometry.dispose();
        }
        if (instance.particleMaterial && typeof instance.particleMaterial.dispose === 'function') {
            instance.particleMaterial.dispose();
        }
        if (instance.lineGeometry && typeof instance.lineGeometry.dispose === 'function') {
            instance.lineGeometry.dispose();
        }
        if (instance.lineMaterial && typeof instance.lineMaterial.dispose === 'function') {
            instance.lineMaterial.dispose();
        }

        state.threeGlobeInstance = null;
    }

    /**
     * 安全切换到指定视图。
     */
    async function switchToView(viewId) {
        if (toTrimmedString(viewId) !== VIEW_ID) {
            disposeNeuralGlobe();
        }
        const bridge = getBridge();
        if (!bridge || typeof bridge.switchToView !== 'function') return;
        await Promise.resolve(bridge.switchToView(viewId));
    }

    /**
     * 安全弹出轻量提示。
     */
    function showToastSafe(text, type) {
        const bridge = getBridge();
        if (!bridge || typeof bridge.showToast !== 'function') return;

        try {
            bridge.showToast(text, type || 'info');
        } catch (_) {
            // 提示失败时静默跳过。
        }
    }

    /**
     * 安全弹出确认框。
     */
    function showConfirmSafe(title, text, onConfirm, onCancel, okText, cancelText, isNested) {
        const bridge = getBridge();
        if (!bridge || typeof bridge.showConfirm !== 'function') {
            if (typeof onConfirm === 'function') onConfirm();
            return;
        }

        bridge.showConfirm(title, text, onConfirm, onCancel, okText, cancelText, isNested);
    }

    /**
     * 安全弹出说明弹窗。
     */
    function showAlertSafe(title, text) {
        const bridge = getBridge();
        if (!bridge || typeof bridge.showAlert !== 'function') {
            showToastSafe(text, 'info');
            return;
        }

        try {
            bridge.showAlert(title, text);
        } catch (_) {
            showToastSafe(text, 'info');
        }
    }

    /**
     * 给管理台注入局部样式，避免改动全局样式文件。
     */
        /**
     * 给管理台注入局部样式，使用毛玻璃和深色“内心世界”质感。
     */
        /**
     * 给管理台注入局部样式，使用真实的毛玻璃和深色“内心世界”质感。
     */
    /**
     * 给管理台注入局部样式，使用真实的毛玻璃和深色“内心世界”质感。
     */
    function injectStyles() {
        const documentRef = root && root.document ? root.document : null;
        if (!documentRef || documentRef.getElementById(STYLE_ID)) return;

        const styleEl = documentRef.createElement('style');
        styleEl.id = STYLE_ID;
        styleEl.textContent = `
            #${ROOT_ID} {
                --hip-glass-bg: rgba(22, 24, 35, 0.45);
                --hip-glass-border: rgba(255, 255, 255, 0.09);
                --hip-glass-shadow: 0 12px 36px rgba(0, 0, 0, 0.33);
                --hip-text-main: rgba(255, 255, 255, 0.95);
                --hip-text-sub: rgba(255, 255, 255, 0.68);
                --hip-text-muted: rgba(255, 255, 255, 0.45);
                --hip-danger: rgba(251, 113, 133, 0.96);
                --hip-accent: #a78bfa;
                --hip-radius-lg: 22px;
                --hip-radius-md: 16px;
                --hip-radius-sm: 10px;
                min-height: 100vh;
                min-height: 100dvh;
                color: var(--hip-text-main);
                background: linear-gradient(180deg, rgba(6, 8, 12, 0.30) 0%, rgba(6, 8, 12, 0.82) 100%), url('https://i.postimg.cc/CK9Hdzwz/121.jpg') center/cover no-repeat fixed;
                overflow-y: auto;
                font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
                -webkit-font-smoothing: antialiased;
            }

            #${ROOT_ID} * {
                box-sizing: border-box;
            }

            #${ROOT_ID} .hip-safe-area {
                max-width: 800px;
                margin: 0 auto;
                padding: calc(env(safe-area-inset-top, 0px) + 18px) 16px calc(env(safe-area-inset-bottom, 0px) + 28px);
                display: flex;
                flex-direction: column;
                gap: 16px;
            }

            #${ROOT_ID} .hip-header {
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 14px 14px;
                border-radius: var(--hip-radius-lg);
                background: var(--hip-glass-bg);
                border: 1px solid var(--hip-glass-border);
                box-shadow: var(--hip-glass-shadow);
                backdrop-filter: blur(16px);
            }

            #${ROOT_ID} .hip-header-content {
                flex: 1;
                min-width: 0;
            }

            #${ROOT_ID} .hip-title {
                margin: 0;
                font-size: 21px;
                font-weight: 650;
                line-height: 1.2;
            }

            #${ROOT_ID} .hip-subtitle {
                margin-top: 3px;
                font-size: 12px;
                color: var(--hip-text-sub);
            }

            #${ROOT_ID} .hip-icon-btn {
                width: 38px;
                height: 38px;
                border-radius: 999px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                color: var(--hip-text-main);
                border: 1px solid var(--hip-glass-border);
                background: rgba(255, 255, 255, 0.06);
                backdrop-filter: blur(10px);
            }

            #${ROOT_ID} .hip-icon-btn:hover {
                background: rgba(255, 255, 255, 0.15);
            }

            #${ROOT_ID} .hip-nav-tabs {
                display: flex;
                gap: 6px;
                padding: 5px;
                border-radius: var(--hip-radius-md);
                background: rgba(0, 0, 0, 0.28);
                border: 1px solid rgba(255, 255, 255, 0.08);
                backdrop-filter: blur(12px);
            }

            #${ROOT_ID} .hip-tab {
                border: none;
                background: transparent;
                color: var(--hip-text-sub);
                border-radius: 12px;
                padding: 10px 0;
                flex: 1;
                font-size: 14px;
                font-weight: 600;
                cursor: pointer;
                transition: 0.2s ease;
            }

            #${ROOT_ID} .hip-tab.active {
                color: #ffffff;
                background: rgba(255, 255, 255, 0.14);
                border: 1px solid rgba(255, 255, 255, 0.18);
            }

            #${ROOT_ID} .hip-notice-banner {
                padding: 13px 14px;
                border-radius: var(--hip-radius-md);
                background: rgba(255, 255, 255, 0.12);
                border: 1px solid rgba(255, 255, 255, 0.15);
                color: var(--hip-text-main);
                font-size: 13px;
                line-height: 1.6;
                backdrop-filter: blur(14px);
            }

            #${ROOT_ID} .hip-panel-wrapper {
                display: flex;
                flex-direction: column;
                gap: 14px;
            }

            #${ROOT_ID} .hip-toolbar {
                display: flex;
                gap: 12px;
                align-items: center;
            }

            #${ROOT_ID} .hip-select,
            #${ROOT_ID} .hip-search-input {
                width: 100%;
                border: 1px solid var(--hip-glass-border);
                border-radius: var(--hip-radius-sm);
                background: rgba(0, 0, 0, 0.34);
                color: #fff;
                padding: 10px 13px;
                font-size: 14px;
                outline: none;
                backdrop-filter: blur(8px);
            }

            #${ROOT_ID} .hip-select:focus,
            #${ROOT_ID} .hip-search-input:focus {
                border-color: rgba(255, 255, 255, 0.30);
                background: rgba(0, 0, 0, 0.44);
            }

            #${ROOT_ID} .hip-sort-select {
                max-width: 156px;
            }

            #${ROOT_ID} .hip-select-block {
                flex: 1;
                border: 1px solid var(--hip-glass-border);
                border-radius: var(--hip-radius-sm);
                background: rgba(0, 0, 0, 0.34);
                color: #fff;
                padding: 10px 13px;
                font-size: 14px;
                outline: none;
                backdrop-filter: blur(8px);
                appearance: none;
                -webkit-appearance: none;
                background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.65)' stroke-width='2'%3e%3cpath d='M6 9l6 6 6-6'/%3e%3c/svg%3e");
                background-repeat: no-repeat;
                background-position: right 10px center;
                background-size: 16px;
            }

            #${ROOT_ID} .hip-unified-search {
                display: flex;
                flex-wrap: wrap;
                align-items: center;
                gap: 0;
                background: rgba(0, 0, 0, 0.35);
                border: 1px solid var(--hip-glass-border);
                border-radius: var(--hip-radius-md);
                padding: 6px;
                backdrop-filter: blur(16px);
            }

            #${ROOT_ID} .hip-list-quick-actions {
                margin-top: 10px;
                display: flex;
                flex-wrap: wrap;
                align-items: center;
                justify-content: space-between;
                gap: 10px;
            }

            #${ROOT_ID} .hip-list-quick-hint {
                font-size: 12px;
                color: var(--hip-text-sub);
                line-height: 1.5;
            }

            #${ROOT_ID} .hip-regression-helper {
                margin-top: 10px;
                padding: 12px 14px;
                border-radius: 16px;
                border: 1px solid rgba(96, 165, 250, 0.16);
                background: rgba(10, 16, 28, 0.48);
                display: flex;
                flex-wrap: wrap;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
            }

            #${ROOT_ID} .hip-regression-main {
                flex: 1 1 260px;
                min-width: 220px;
            }

            #${ROOT_ID} .hip-regression-title {
                font-size: 13px;
                font-weight: 700;
                color: var(--hip-text-main);
                line-height: 1.5;
            }

            #${ROOT_ID} .hip-regression-note {
                margin-top: 4px;
                font-size: 12px;
                color: var(--hip-text-sub);
                line-height: 1.65;
                word-break: break-word;
            }

            #${ROOT_ID} .hip-regression-actions {
                display: flex;
                flex-wrap: wrap;
                align-items: center;
                gap: 8px;
            }

            #${ROOT_ID} .hip-search-input-box {
                flex: 1;
                min-width: 220px;
                display: flex;
                align-items: center;
                padding: 0 10px;
            }

            #${ROOT_ID} .hip-search-input-box svg {
                color: var(--hip-text-muted);
                margin-right: 8px;
                flex: 0 0 auto;
            }

            #${ROOT_ID} .hip-search-input-box input {
                width: 100%;
                background: transparent;
                border: none;
                color: #fff;
                font-size: 14px;
                outline: none;
                padding: 8px 0;
            }

            #${ROOT_ID} .hip-search-input-box input::placeholder {
                color: var(--hip-text-muted);
            }

            #${ROOT_ID} .hip-search-divider {
                width: 1px;
                height: 24px;
                background: rgba(255, 255, 255, 0.12);
                margin: 0 8px;
            }

            #${ROOT_ID} .hip-inline-select {
                border: none;
                background: transparent;
                color: var(--hip-text-sub);
                font-size: 13px;
                outline: none;
                cursor: pointer;
                padding: 8px 24px 8px 10px;
                appearance: none;
                -webkit-appearance: none;
                background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.55)' stroke-width='2'%3e%3cpath d='M6 9l6 6 6-6'/%3e%3c/svg%3e");
                background-repeat: no-repeat;
                background-position: right 7px center;
                background-size: 14px;
                transition: color 0.2s ease;
            }

            #${ROOT_ID} .hip-inline-select:hover {
                color: #fff;
            }

            #${ROOT_ID} .hip-inline-select option {
                background: #1c1f2b;
                color: #fff;
            }

            #${ROOT_ID} .hip-glass-panel {
                background: var(--hip-glass-bg);
                border: 1px solid var(--hip-glass-border);
                border-radius: var(--hip-radius-lg);
                padding: 18px 16px;
                box-shadow: var(--hip-glass-shadow);
                backdrop-filter: blur(18px);
            }

            #${ROOT_ID} .hip-audit-section-card + .hip-audit-section-card {
                margin-top: 16px;
            }

            #${ROOT_ID} .hip-audit-summary-grid {
                margin-top: 12px;
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
                gap: 10px;
            }

            #${ROOT_ID} .hip-audit-summary-card {
                padding: 14px 12px;
                border-radius: 16px;
                border: 1px solid rgba(255, 255, 255, 0.08);
                background: rgba(10, 16, 28, 0.44);
                min-height: 102px;
            }

            #${ROOT_ID} .hip-audit-summary-card.tone-warn {
                border-color: rgba(250, 204, 21, 0.22);
                background: rgba(48, 36, 8, 0.38);
            }

            #${ROOT_ID} .hip-audit-summary-card.tone-danger {
                border-color: rgba(248, 113, 113, 0.24);
                background: rgba(56, 18, 18, 0.40);
            }

            #${ROOT_ID} .hip-audit-summary-card.tone-info {
                border-color: rgba(96, 165, 250, 0.20);
                background: rgba(11, 24, 46, 0.42);
            }

            #${ROOT_ID} .hip-audit-summary-value {
                font-size: 26px;
                font-weight: 700;
                line-height: 1.1;
                color: var(--hip-text-main);
            }

            #${ROOT_ID} .hip-audit-summary-label {
                margin-top: 8px;
                font-size: 13px;
                font-weight: 600;
                color: var(--hip-text-main);
            }

            #${ROOT_ID} .hip-audit-summary-hint {
                margin-top: 6px;
                font-size: 12px;
                line-height: 1.5;
                color: var(--hip-text-sub);
            }

            #${ROOT_ID} .hip-audit-two-column {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 16px;
            }

            #${ROOT_ID} .hip-audit-block-title {
                font-size: 14px;
                font-weight: 700;
                color: var(--hip-text-main);
                margin-bottom: 6px;
            }

            #${ROOT_ID} .hip-list-focus-banner {
                margin-bottom: 14px;
            }

            #${ROOT_ID} .hip-list-focus-actions,
            #${ROOT_ID} .hip-list-inline-actions {
                display: flex;
                flex-wrap: wrap;
                align-items: center;
                gap: 8px;
            }

            #${ROOT_ID} .hip-list-inline-actions {
                margin-bottom: 10px;
            }

            #${ROOT_ID} .hip-audit-compact-list {
                display: flex;
                flex-direction: column;
                gap: 10px;
                margin-top: 10px;
            }

            #${ROOT_ID} .hip-audit-compact-row {
                padding: 12px 12px 11px;
                border-radius: 14px;
                border: 1px solid rgba(255, 255, 255, 0.08);
                background: rgba(10, 16, 28, 0.40);
            }

            #${ROOT_ID} .hip-audit-compact-title {
                font-size: 13px;
                font-weight: 700;
                line-height: 1.5;
                color: var(--hip-text-main);
                word-break: break-word;
            }

            #${ROOT_ID} .hip-audit-compact-meta {
                margin-top: 4px;
                font-size: 12px;
                line-height: 1.5;
                color: var(--hip-text-muted);
                word-break: break-word;
            }

            #${ROOT_ID} .hip-audit-compact-body {
                margin-top: 6px;
                font-size: 12px;
                line-height: 1.65;
                color: var(--hip-text-sub);
                word-break: break-word;
            }

            #${ROOT_ID} .hip-stats-row {
                display: flex;
                align-items: center;
                gap: 14px;
            }

            #${ROOT_ID} .hip-stat-globe {
                width: 58px;
                height: 58px;
                border-radius: 50%;
                flex: 0 0 auto;
                background: radial-gradient(circle at 30% 30%, rgba(255, 191, 121, 0.88), rgba(128, 68, 30, 0.30));
                box-shadow: 0 0 22px rgba(255, 190, 120, 0.32), inset 0 0 18px rgba(0, 0, 0, 0.52);
            }

            #${ROOT_ID} .hip-neural-globe-container {
                width: 80px;
                height: 80px;
                border-radius: 50%;
                position: relative;
                overflow: hidden;
                flex: 0 0 auto;
                background: radial-gradient(circle at 50% 50%, rgba(30, 20, 50, 0.8), rgba(0, 0, 0, 0.92));
                box-shadow: 0 0 28px rgba(167, 139, 250, 0.18), inset 0 0 20px rgba(167, 139, 250, 0.2);
                border: 1px solid rgba(167, 139, 250, 0.35);
            }

            #${ROOT_ID} .hip-neural-globe-fallback {
                width: 100%;
                height: 100%;
                border-radius: 50%;
                background: radial-gradient(circle at 30% 30%, rgba(167, 139, 250, 0.45), rgba(0, 0, 0, 0.85));
            }

            #${ROOT_ID} .hip-stat-primary {
                font-size: 15px;
                line-height: 1.5;
            }

            #${ROOT_ID} .hip-stat-secondary {
                margin-top: 4px;
                font-size: 13px;
                color: var(--hip-text-sub);
                line-height: 1.5;
            }

            #${ROOT_ID} .hip-distribution-wrapper {
                margin-top: 18px;
                border-top: 1px solid rgba(255, 255, 255, 0.12);
                padding-top: 14px;
            }

            #${ROOT_ID} .hip-dist-title {
                margin-bottom: 12px;
                font-size: 13px;
                font-weight: 600;
                color: var(--hip-text-main);
            }

            #${ROOT_ID} .hip-dist-bar {
                display: flex;
                height: 8px;
                border-radius: 6px;
                overflow: hidden;
                background: rgba(0, 0, 0, 0.5);
                margin-bottom: 12px;
            }

            #${ROOT_ID} .hip-dist-segment {
                height: 100%;
                border-right: 1px solid rgba(0, 0, 0, 0.3);
                transition: width 0.3s ease;
            }

            #${ROOT_ID} .hip-dist-segment:last-child {
                border-right: none;
            }

            #${ROOT_ID} .hip-dist-legend {
                display: flex;
                flex-wrap: wrap;
                gap: 10px 16px;
            }

            #${ROOT_ID} .hip-legend-item {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                font-size: 12px;
                color: var(--hip-text-sub);
            }

            #${ROOT_ID} .hip-legend-dot {
                display: inline-block;
                flex: 0 0 auto;
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background: var(--hip-dot-color, currentColor);
                box-shadow: 0 0 8px var(--hip-dot-color, currentColor);
            }

            #${ROOT_ID} .hip-section-title {
                margin: 2px 2px 0;
                font-size: 17px;
                font-weight: 600;
                color: var(--hip-text-main);
            }

            #${ROOT_ID} .hip-card-list {
                display: flex;
                flex-direction: column;
                gap: 12px;
            }

            #${ROOT_ID} .hip-card {
                border-radius: var(--hip-radius-md);
                border: 1px solid rgba(255, 255, 255, 0.12);
                border-top: 1px solid rgba(255, 255, 255, 0.22);
                background: rgba(23, 27, 39, 0.56);
                backdrop-filter: blur(12px);
                padding: 16px;
                cursor: pointer;
                transition: 0.2s ease;
            }

            #${ROOT_ID} .hip-card:hover {
                background: rgba(36, 40, 54, 0.66);
                transform: translateY(-1px);
            }

            #${ROOT_ID} .hip-card.resolved {
                opacity: 0.72;
                filter: saturate(0.8);
            }

            #${ROOT_ID} .hip-card-event {
                border-color: rgba(96, 165, 250, 0.22);
                border-top-color: rgba(96, 165, 250, 0.38);
                box-shadow: inset 0 0 0 1px rgba(96, 165, 250, 0.08);
            }

            #${ROOT_ID} .hip-card-event .hip-card-meta {
                margin-top: 10px;
            }

            #${ROOT_ID} .hip-event-head {
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                gap: 10px;
            }

            #${ROOT_ID} .hip-event-title-wrap {
                flex: 1;
                min-width: 0;
            }

            #${ROOT_ID} .hip-event-title {
                font-size: 15px;
                line-height: 1.5;
                color: var(--hip-text-main);
                font-weight: 600;
                word-break: break-word;
            }

            #${ROOT_ID} .hip-event-subtitle {
                margin-top: 6px;
                font-size: 13px;
                line-height: 1.58;
                color: var(--hip-text-sub);
                word-break: break-word;
            }

            #${ROOT_ID} .hip-event-status {
                flex: 0 0 auto;
                border-radius: 999px;
                padding: 4px 10px;
                font-size: 12px;
                line-height: 1;
                border: 1px solid transparent;
                white-space: nowrap;
            }

            #${ROOT_ID} .hip-event-status.is-resolved {
                color: #86efac;
                border-color: rgba(134, 239, 172, 0.35);
                background: rgba(22, 101, 52, 0.22);
            }

            #${ROOT_ID} .hip-event-status.is-unresolved {
                color: #fcd34d;
                border-color: rgba(252, 211, 77, 0.36);
                background: rgba(113, 63, 18, 0.25);
            }

            #${ROOT_ID} .hip-event-members {
                margin-top: 12px;
                border-top: 1px dashed rgba(255, 255, 255, 0.16);
                padding-top: 12px;
                display: flex;
                flex-direction: column;
                gap: 8px;
            }

            #${ROOT_ID} .hip-event-members-hint {
                font-size: 12px;
                line-height: 1.5;
                color: var(--hip-text-muted);
                padding: 0 2px 2px;
            }

            #${ROOT_ID} .hip-event-member-row {
                display: flex;
                align-items: flex-start;
                justify-content: space-between;
                gap: 10px;
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 12px;
                background: rgba(7, 11, 20, 0.42);
                padding: 10px 11px;
            }

            #${ROOT_ID} .hip-event-member-main {
                flex: 1;
                min-width: 0;
            }

            #${ROOT_ID} .hip-event-member-actions {
                display: flex;
                align-items: center;
                flex-wrap: wrap;
                justify-content: flex-end;
                gap: 6px;
                flex: 0 0 auto;
            }

            #${ROOT_ID} .hip-event-member-detail {
                width: 100%;
                margin-top: 10px;
                padding-top: 10px;
                border-top: 1px dashed rgba(255, 255, 255, 0.12);
            }

            #${ROOT_ID} .hip-event-member-body {
                border-radius: 12px;
                border: 1px solid rgba(255, 255, 255, 0.10);
                background: rgba(255, 255, 255, 0.04);
                padding: 10px 12px;
                margin-bottom: 10px;
                font-size: 13px;
                line-height: 1.75;
                color: var(--hip-text-main);
                word-break: break-word;
            }

            #${ROOT_ID} .hip-dialog-layer {
                position: fixed;
                inset: 0;
                z-index: 1000;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 18px;
            }

            #${ROOT_ID} .hip-dialog-backdrop {
                position: absolute;
                inset: 0;
                border: none;
                background: rgba(3, 6, 12, 0.72);
                backdrop-filter: blur(10px);
                cursor: pointer;
            }

            #${ROOT_ID} .hip-dialog-panel {
                position: relative;
                z-index: 1;
                width: min(680px, calc(100vw - 32px));
                max-height: calc(100vh - 40px);
                overflow-y: auto;
                border-radius: 24px;
                border: 1px solid rgba(255, 255, 255, 0.12);
                background: linear-gradient(180deg, rgba(17, 23, 36, 0.96), rgba(8, 12, 20, 0.96));
                box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
                padding: 18px;
            }

            #${ROOT_ID} .hip-dialog-head {
                display: flex;
                align-items: flex-start;
                justify-content: space-between;
                gap: 12px;
                margin-bottom: 14px;
            }

            #${ROOT_ID} .hip-dialog-title {
                font-size: 18px;
                font-weight: 700;
                line-height: 1.3;
            }

            #${ROOT_ID} .hip-dialog-subtitle {
                margin-top: 4px;
                font-size: 12px;
                color: var(--hip-text-sub);
                line-height: 1.55;
            }

            #${ROOT_ID} .hip-dialog-close {
                border: none;
                background: rgba(255, 255, 255, 0.08);
                color: var(--hip-text-main);
                width: 34px;
                height: 34px;
                border-radius: 999px;
                cursor: pointer;
                font-size: 20px;
                line-height: 1;
            }

            #${ROOT_ID} .hip-dialog-meta {
                margin-bottom: 12px;
                padding: 10px 12px;
                border-radius: 12px;
                border: 1px solid rgba(255, 255, 255, 0.08);
                background: rgba(255, 255, 255, 0.04);
                font-size: 12px;
                color: var(--hip-text-sub);
                line-height: 1.55;
            }

            #${ROOT_ID} .hip-dialog-field {
                display: flex;
                flex-direction: column;
                gap: 8px;
                margin-bottom: 14px;
            }

            #${ROOT_ID} .hip-dialog-label {
                font-size: 12px;
                color: var(--hip-text-sub);
            }

            #${ROOT_ID} .hip-dialog-input,
            #${ROOT_ID} .hip-dialog-textarea {
                width: 100%;
                border: 1px solid rgba(255, 255, 255, 0.12);
                border-radius: 14px;
                background: rgba(255, 255, 255, 0.05);
                color: var(--hip-text-main);
                padding: 12px 14px;
                font-size: 14px;
                line-height: 1.6;
                font-family: inherit;
                outline: none;
            }

            #${ROOT_ID} .hip-dialog-textarea {
                min-height: 132px;
                resize: vertical;
            }

            #${ROOT_ID} .hip-dialog-preview {
                margin-bottom: 14px;
                padding: 12px;
                border-radius: 14px;
                border: 1px solid rgba(255, 255, 255, 0.10);
                background: rgba(255, 255, 255, 0.04);
            }

            #${ROOT_ID} .hip-dialog-preview-label {
                margin-bottom: 8px;
                font-size: 12px;
                color: var(--hip-text-sub);
            }

            #${ROOT_ID} .hip-dialog-preview-body {
                font-size: 14px;
                line-height: 1.7;
                color: var(--hip-text-main);
                word-break: break-word;
            }

            #${ROOT_ID} .hip-dialog-preview-sub {
                margin-top: 8px;
                font-size: 13px;
                line-height: 1.65;
                color: var(--hip-text-sub);
                word-break: break-word;
            }

            #${ROOT_ID} .hip-dialog-preview-meta {
                margin-top: 8px;
                font-size: 12px;
                color: var(--hip-text-muted);
            }

            #${ROOT_ID} .hip-dialog-choice-list {
                display: flex;
                flex-direction: column;
                gap: 10px;
                margin-bottom: 16px;
                max-height: min(45vh, 420px);
                overflow-y: auto;
                padding-right: 2px;
            }

            #${ROOT_ID} .hip-dialog-choice {
                display: flex;
                gap: 12px;
                align-items: flex-start;
                padding: 12px;
                border-radius: 16px;
                border: 1px solid rgba(255, 255, 255, 0.10);
                background: rgba(255, 255, 255, 0.04);
                cursor: pointer;
                transition: border-color 120ms ease, background 120ms ease, transform 120ms ease;
            }

            #${ROOT_ID} .hip-dialog-choice:hover {
                border-color: rgba(167, 139, 250, 0.34);
                background: rgba(255, 255, 255, 0.07);
                transform: translateY(-1px);
            }

            #${ROOT_ID} .hip-dialog-choice.is-selected {
                border-color: rgba(167, 139, 250, 0.62);
                background: rgba(167, 139, 250, 0.10);
                box-shadow: inset 0 0 0 1px rgba(167, 139, 250, 0.22);
            }

            #${ROOT_ID} .hip-dialog-choice input[type="radio"] {
                margin-top: 4px;
                accent-color: var(--hip-accent);
            }

            #${ROOT_ID} .hip-dialog-choice-body {
                flex: 1;
                min-width: 0;
            }

            #${ROOT_ID} .hip-dialog-choice input[type="radio"]:checked + .hip-dialog-choice-body {
                border-radius: 12px;
                padding: 6px 8px;
                background: rgba(255, 255, 255, 0.04);
            }

            #${ROOT_ID} .hip-dialog-choice-title {
                font-size: 14px;
                font-weight: 600;
                line-height: 1.45;
                color: var(--hip-text-main);
            }

            #${ROOT_ID} .hip-dialog-choice-meta {
                margin-top: 4px;
                font-size: 12px;
                color: var(--hip-text-sub);
            }

            #${ROOT_ID} .hip-dialog-choice-summary {
                margin-top: 8px;
                font-size: 13px;
                line-height: 1.65;
                color: var(--hip-text-main);
                word-break: break-word;
            }

            #${ROOT_ID} .hip-dialog-actions {
                display: flex;
                justify-content: flex-end;
                gap: 10px;
                flex-wrap: wrap;
            }

            #${ROOT_ID} .hip-event-member-meta {
                font-size: 12px;
                line-height: 1.45;
                color: var(--hip-text-muted);
            }

            #${ROOT_ID} .hip-event-member-content {
                margin-top: 6px;
                font-size: 13px;
                line-height: 1.58;
                color: var(--hip-text-main);
                word-break: break-word;
            }

            #${ROOT_ID} .hip-lite-card {
                cursor: default;
            }

            #${ROOT_ID} .hip-card-content {
                font-size: 14px;
                line-height: 1.65;
                color: var(--hip-text-main);
                word-break: break-word;
            }

            #${ROOT_ID} .hip-card-meta {
                margin-top: 11px;
                display: flex;
                align-items: center;
                flex-wrap: wrap;
                gap: 7px;
                font-size: 12px;
                color: var(--hip-text-muted);
            }

            #${ROOT_ID} .hip-meta-item {
                display: inline-flex;
                align-items: center;
                gap: 4px;
            }

            #${ROOT_ID} .hip-meta-dot {
                opacity: 0.6;
            }

            #${ROOT_ID} .hip-card-expand {
                margin-top: 13px;
                padding-top: 12px;
                border-top: 1px dashed rgba(255, 255, 255, 0.18);
                display: none;
            }

            #${ROOT_ID} .hip-card.expanded .hip-card-expand {
                display: block;
            }

            #${ROOT_ID} .hip-tags {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
                margin-bottom: 10px;
            }

            #${ROOT_ID} .hip-tag {
                padding: 4px 10px;
                border-radius: 999px;
                font-size: 12px;
                color: var(--hip-text-sub);
                border: 1px solid rgba(255, 255, 255, 0.17);
                background: rgba(255, 255, 255, 0.06);
            }

            #${ROOT_ID} .hip-card-reason {
                font-size: 13px;
                color: var(--hip-text-sub);
                line-height: 1.58;
                margin-bottom: 12px;
            }

            #${ROOT_ID} .hip-grounding-panel {
                margin-bottom: 12px;
                padding: 12px;
                border-radius: 14px;
                border: 1px solid rgba(255, 255, 255, 0.10);
                background: rgba(255, 255, 255, 0.04);
            }

            #${ROOT_ID} .hip-grounding-panel.is-strong {
                border-color: rgba(110, 231, 183, 0.26);
                background: rgba(16, 185, 129, 0.08);
            }

            #${ROOT_ID} .hip-grounding-panel.is-medium {
                border-color: rgba(251, 191, 36, 0.26);
                background: rgba(245, 158, 11, 0.08);
            }

            #${ROOT_ID} .hip-grounding-panel.is-weak,
            #${ROOT_ID} .hip-grounding-panel.is-empty {
                border-color: rgba(248, 113, 113, 0.18);
                background: rgba(239, 68, 68, 0.06);
            }

            #${ROOT_ID} .hip-grounding-head {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 10px;
                flex-wrap: wrap;
                margin-bottom: 8px;
            }

            #${ROOT_ID} .hip-grounding-title {
                font-size: 13px;
                font-weight: 600;
                color: var(--hip-text-main);
            }

            #${ROOT_ID} .hip-grounding-pill {
                display: inline-flex;
                align-items: center;
                padding: 4px 10px;
                border-radius: 999px;
                font-size: 12px;
                color: var(--hip-text-main);
                border: 1px solid rgba(255, 255, 255, 0.14);
                background: rgba(255, 255, 255, 0.08);
            }

            #${ROOT_ID} .hip-grounding-pill.is-strong {
                border-color: rgba(110, 231, 183, 0.32);
                color: #d1fae5;
                background: rgba(16, 185, 129, 0.12);
            }

            #${ROOT_ID} .hip-grounding-pill.is-medium {
                border-color: rgba(251, 191, 36, 0.30);
                color: #fde68a;
                background: rgba(245, 158, 11, 0.12);
            }

            #${ROOT_ID} .hip-grounding-pill.is-weak,
            #${ROOT_ID} .hip-grounding-pill.is-empty {
                border-color: rgba(248, 113, 113, 0.24);
                color: #fecaca;
                background: rgba(239, 68, 68, 0.10);
            }

            #${ROOT_ID} .hip-grounding-summary,
            #${ROOT_ID} .hip-grounding-hint {
                font-size: 12px;
                line-height: 1.65;
                color: var(--hip-text-sub);
            }

            #${ROOT_ID} .hip-grounding-hint {
                margin-top: 10px;
            }

            #${ROOT_ID} .hip-grounding-stats {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
                margin-top: 10px;
            }

            #${ROOT_ID} .hip-grounding-stat {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                padding: 6px 10px;
                border-radius: 10px;
                border: 1px solid rgba(255, 255, 255, 0.10);
                background: rgba(0, 0, 0, 0.16);
                font-size: 12px;
                color: var(--hip-text-main);
            }

            #${ROOT_ID} .hip-grounding-stat-label {
                color: var(--hip-text-muted);
            }

            #${ROOT_ID} .hip-grounding-rows {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
                margin-top: 10px;
            }

            #${ROOT_ID} .hip-grounding-row-tag {
                display: inline-flex;
                align-items: center;
                padding: 4px 8px;
                border-radius: 999px;
                border: 1px dashed rgba(255, 255, 255, 0.14);
                background: rgba(0, 0, 0, 0.16);
                color: var(--hip-text-sub);
                font-size: 12px;
            }

            #${ROOT_ID} .hip-audit-panel {
                margin-top: 12px;
                padding: 12px;
                border-radius: 14px;
                border: 1px solid rgba(255, 255, 255, 0.08);
                background: rgba(6, 10, 24, 0.58);
            }

            #${ROOT_ID} .hip-audit-head {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 10px;
                flex-wrap: wrap;
                margin-bottom: 8px;
            }

            #${ROOT_ID} .hip-audit-title {
                font-size: 13px;
                font-weight: 600;
                color: var(--hip-text-main);
            }

            #${ROOT_ID} .hip-audit-summary,
            #${ROOT_ID} .hip-audit-meta-line {
                font-size: 12px;
                line-height: 1.65;
                color: var(--hip-text-sub);
            }

            #${ROOT_ID} .hip-audit-summary {
                margin-bottom: 10px;
            }

            #${ROOT_ID} .hip-audit-section-title {
                margin: 12px 0 8px;
                font-size: 12px;
                font-weight: 600;
                letter-spacing: 0.04em;
                text-transform: uppercase;
                color: var(--hip-text-muted);
            }

            #${ROOT_ID} .hip-audit-entry {
                padding: 10px;
                border-radius: 12px;
                border: 1px solid rgba(255, 255, 255, 0.08);
                background: rgba(255, 255, 255, 0.03);
            }

            #${ROOT_ID} .hip-audit-entry + .hip-audit-entry {
                margin-top: 8px;
            }

            #${ROOT_ID} .hip-audit-entry.is-rejected {
                border-color: rgba(248, 113, 113, 0.18);
                background: rgba(127, 29, 29, 0.12);
            }

            #${ROOT_ID} .hip-audit-grid {
                display: grid;
                grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
                gap: 10px;
                align-items: stretch;
                margin-top: 10px;
            }

            #${ROOT_ID} .hip-audit-block {
                min-width: 0;
                padding: 10px;
                border-radius: 10px;
                border: 1px solid rgba(255, 255, 255, 0.08);
                background: rgba(0, 0, 0, 0.22);
            }

            #${ROOT_ID} .hip-audit-label,
            #${ROOT_ID} .hip-audit-change-label {
                margin-bottom: 6px;
                font-size: 11px;
                letter-spacing: 0.04em;
                text-transform: uppercase;
                color: var(--hip-text-muted);
            }

            #${ROOT_ID} .hip-audit-value,
            #${ROOT_ID} .hip-audit-inline {
                font-size: 12px;
                line-height: 1.68;
                color: var(--hip-text-main);
                word-break: break-word;
            }

            #${ROOT_ID} .hip-audit-arrow,
            #${ROOT_ID} .hip-audit-inline-arrow {
                color: var(--hip-text-muted);
                font-size: 13px;
            }

            #${ROOT_ID} .hip-audit-arrow {
                align-self: center;
            }

            #${ROOT_ID} .hip-audit-changes {
                display: flex;
                flex-direction: column;
                gap: 8px;
                margin-top: 10px;
            }

            #${ROOT_ID} .hip-audit-change-row {
                padding: 8px 10px;
                border-radius: 10px;
                border: 1px solid rgba(255, 255, 255, 0.08);
                background: rgba(0, 0, 0, 0.18);
            }

            #${ROOT_ID} .hip-audit-change-values {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
                align-items: center;
            }

            #${ROOT_ID} .hip-audit-inline.before {
                color: #fca5a5;
            }

            #${ROOT_ID} .hip-audit-inline.after {
                color: #86efac;
            }

            #${ROOT_ID} .hip-card-actions {
                display: flex;
                gap: 10px;
                flex-wrap: wrap;
            }

            #${ROOT_ID} .hip-btn-outline,
            #${ROOT_ID} .hip-btn-danger,
            #${ROOT_ID} .hip-page-btn,
            #${ROOT_ID} .hip-btn-primary {
                border-radius: 999px;
                font-size: 13px;
                padding: 8px 14px;
                cursor: pointer;
                transition: 0.2s ease;
            }

            #${ROOT_ID} .hip-btn-outline {
                border: 1px solid rgba(255, 255, 255, 0.2);
                color: #fff;
                background: rgba(255, 255, 255, 0.06);
            }

            #${ROOT_ID} .hip-btn-outline:hover {
                background: rgba(255, 255, 255, 0.14);
            }

            #${ROOT_ID} .hip-btn-danger {
                border: 1px solid rgba(251, 113, 133, 0.38);
                color: var(--hip-danger);
                background: rgba(251, 113, 133, 0.12);
            }

            #${ROOT_ID} .hip-btn-inline {
                padding: 6px 10px;
                font-size: 12px;
            }

            #${ROOT_ID} .hip-btn-primary {
                width: 100%;
                border: 1px solid rgba(255, 255, 255, 0.30);
                background: rgba(255, 255, 255, 0.14);
                color: #fff;
                font-size: 15px;
                padding: 11px 18px;
            }

            #${ROOT_ID} .hip-btn-outline[disabled],
            #${ROOT_ID} .hip-btn-danger[disabled],
            #${ROOT_ID} .hip-btn-primary[disabled],
            #${ROOT_ID} .hip-page-btn[disabled] {
                opacity: 0.4;
                cursor: not-allowed;
            }

            #${ROOT_ID} .hip-filters-form {
                display: flex;
                flex-direction: column;
                gap: 12px;
                padding: 2px 2px 0;
                margin-bottom: 2px;
            }

            #${ROOT_ID} .hip-search-bar {
                display: flex;
                gap: 10px;
            }

            #${ROOT_ID} .hip-pagination {
                display: flex;
                align-items: center;
                justify-content: center;
                flex-wrap: wrap;
                gap: 12px;
                margin-top: 12px;
                padding-bottom: 6px;
            }

            #${ROOT_ID} .hip-page-btn {
                border: 1px solid rgba(255, 255, 255, 0.2);
                color: #fff;
                background: rgba(255, 255, 255, 0.07);
            }

            #${ROOT_ID} .hip-page-jump {
                display: flex;
                align-items: center;
                gap: 8px;
            }

            #${ROOT_ID} .hip-page-text {
                font-size: 12px;
                color: var(--hip-text-sub);
            }

            #${ROOT_ID} .hip-page-input {
                width: 62px;
                border: 1px solid var(--hip-glass-border);
                border-radius: 8px;
                background: rgba(0, 0, 0, 0.36);
                color: #fff;
                font-size: 13px;
                padding: 7px 8px;
                text-align: center;
                outline: none;
            }

            #${ROOT_ID} .hip-pagination-unified {
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                gap: 10px;
                width: fit-content;
                margin: 12px auto 0;
                padding: 10px 12px;
                border-radius: 16px;
                border: 1px solid rgba(255, 255, 255, 0.08);
                background: rgba(0, 0, 0, 0.24);
            }

            #${ROOT_ID} .hip-page-row {
                display: flex;
                justify-content: center;
                align-items: center;
                flex-wrap: wrap;
                gap: 6px;
            }

            #${ROOT_ID} .hip-page-arrow {
                border: 1px solid rgba(255, 255, 255, 0.18);
                background: rgba(255, 255, 255, 0.06);
                color: var(--hip-text-sub);
                font-size: 13px;
                padding: 7px 12px;
                border-radius: 8px;
                cursor: pointer;
                transition: 0.2s ease;
            }

            #${ROOT_ID} .hip-page-arrow:hover:not(:disabled) {
                color: #fff;
                background: rgba(255, 255, 255, 0.14);
            }

            #${ROOT_ID} .hip-page-arrow:disabled {
                opacity: 0.35;
                cursor: not-allowed;
            }

            #${ROOT_ID} .hip-page-num {
                border: 1px solid rgba(255, 255, 255, 0.14);
                background: rgba(255, 255, 255, 0.04);
                color: var(--hip-text-sub);
                width: 34px;
                height: 34px;
                border-radius: 8px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                font-size: 13px;
                cursor: pointer;
                transition: 0.2s ease;
            }

            #${ROOT_ID} .hip-page-num:hover {
                color: #fff;
                background: rgba(255, 255, 255, 0.12);
            }

            #${ROOT_ID} .hip-page-num.active {
                color: #fff;
                background: var(--hip-accent);
                font-weight: 700;
            }

            #${ROOT_ID} .hip-page-dots {
                color: var(--hip-text-muted);
                letter-spacing: 2px;
                margin: 0 4px;
            }

            #${ROOT_ID} .hip-page-jump-row {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                flex-wrap: wrap;
                margin: 0;
            }

            #${ROOT_ID} .hip-page-jump-label,
            #${ROOT_ID} .hip-page-jump-total {
                color: var(--hip-text-sub);
                font-size: 12px;
                white-space: nowrap;
            }

            #${ROOT_ID} .hip-page-input-inline {
                width: 74px;
                border: 1px solid rgba(255, 255, 255, 0.18);
                border-radius: 8px;
                background: rgba(0, 0, 0, 0.42);
                color: #fff;
                font-size: 13px;
                padding: 6px 8px;
                text-align: center;
                outline: none;
            }

            #${ROOT_ID} .hip-page-jump-btn {
                border: 1px solid rgba(255, 255, 255, 0.16);
                border-radius: 8px;
                background: rgba(255, 255, 255, 0.1);
                color: #fff;
                font-size: 13px;
                padding: 6px 12px;
                cursor: pointer;
                transition: 0.2s ease;
            }

            #${ROOT_ID} .hip-page-jump-btn:hover {
                background: var(--hip-accent);
                color: #08090d;
            }

            #${ROOT_ID} .hip-export-section {
                text-align: center;
            }

            #${ROOT_ID} .hip-link {
                display: inline-block;
                margin-top: 12px;
                font-size: 13px;
                color: var(--hip-text-sub);
                text-decoration: underline;
                text-underline-offset: 4px;
            }

            #${ROOT_ID} .hip-section-divider {
                height: 1px;
                margin: 18px 0;
                background: rgba(255, 255, 255, 0.16);
            }

            #${ROOT_ID} .hip-box-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 10px;
            }

            #${ROOT_ID} .hip-box-header h3 {
                margin: 0;
                font-size: 16px;
                font-weight: 600;
            }

            #${ROOT_ID} .hip-box-row {
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 10px;
                flex-wrap: wrap;
            }

            #${ROOT_ID} .hip-box-desc {
                font-size: 14px;
                color: var(--hip-text-main);
            }

            #${ROOT_ID} .hip-box-hint {
                margin-top: 8px;
                font-size: 12px;
                color: var(--hip-text-sub);
                line-height: 1.6;
            }

            #${ROOT_ID} .hip-snapshot-list {
                margin-top: 12px;
                display: flex;
                flex-direction: column;
                gap: 10px;
            }

            #${ROOT_ID} .hip-snapshot-item {
                border-radius: 12px;
                border: 1px solid rgba(255, 255, 255, 0.12);
                background: rgba(0, 0, 0, 0.24);
                padding: 12px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 10px;
            }

            #${ROOT_ID} .hip-dehydrate-failure-item {
                border-radius: 12px;
                border: 1px solid rgba(255, 255, 255, 0.12);
                background: rgba(0, 0, 0, 0.24);
                padding: 12px;
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                gap: 10px;
            }

            #${ROOT_ID} .hip-dehydrate-failure-main {
                flex: 1;
                min-width: 0;
            }

            #${ROOT_ID} .hip-dehydrate-failure-msg {
                margin-top: 4px;
                font-size: 13px;
                line-height: 1.5;
                color: var(--hip-text-main);
                word-break: break-word;
            }

            #${ROOT_ID} .hip-snapshot-time {
                font-size: 13px;
            }

            #${ROOT_ID} .hip-snapshot-meta {
                margin-top: 2px;
                font-size: 12px;
                color: var(--hip-text-sub);
            }

            #${ROOT_ID} .hip-actions {
                display: flex;
                gap: 8px;
            }

            #${ROOT_ID} .hip-migration-progress {
                margin-top: 12px;
                margin-bottom: 12px;
                padding: 10px 12px;
                border-radius: 12px;
                border: 1px solid rgba(255, 255, 255, 0.13);
                background: rgba(255, 255, 255, 0.07);
                color: var(--hip-text-sub);
                font-size: 12px;
                line-height: 1.5;
            }

            #${ROOT_ID} .hip-migration-actions {
                margin-top: 10px;
                display: flex;
                flex-wrap: wrap;
                gap: 10px;
            }

            #${ROOT_ID} .hip-attachment-form {
                display: flex;
                align-items: center;
                gap: 10px;
                flex-wrap: wrap;
            }

            #${ROOT_ID} .hip-digest-item {
                border-radius: 12px;
                border: 1px solid rgba(255, 255, 255, 0.12);
                background: rgba(0, 0, 0, 0.24);
                padding: 12px;
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                gap: 10px;
                cursor: pointer;
            }

            #${ROOT_ID} .hip-digest-main {
                flex: 1;
                min-width: 0;
            }

            #${ROOT_ID} .hip-digest-item.expanded {
                border-color: rgba(255, 255, 255, 0.18);
                background: rgba(0, 0, 0, 0.30);
            }

            #${ROOT_ID} .hip-digest-expand {
                margin-top: 12px;
                padding-top: 12px;
                border-top: 1px dashed rgba(255, 255, 255, 0.16);
            }

            #${ROOT_ID} .hip-digest-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
                gap: 10px;
            }

            #${ROOT_ID} .hip-digest-block {
                border-radius: 10px;
                border: 1px solid rgba(255, 255, 255, 0.10);
                background: rgba(255, 255, 255, 0.04);
                padding: 10px;
            }

            #${ROOT_ID} .hip-digest-label {
                font-size: 12px;
                color: var(--hip-text-sub);
                margin-bottom: 6px;
            }

            #${ROOT_ID} .hip-digest-text {
                font-size: 13px;
                line-height: 1.6;
                color: var(--hip-text-main);
                word-break: break-word;
            }

            #${ROOT_ID} .hip-digest-empty {
                color: var(--hip-text-muted);
            }

            #${ROOT_ID} .hip-manual-yaml-form {
                margin-top: 14px;
                display: flex;
                flex-direction: column;
                gap: 10px;
            }

            #${ROOT_ID} .hip-manual-yaml-input {
                width: 100%;
                min-height: 140px;
                max-height: 260px;
                resize: vertical;
                border: 1px solid rgba(255, 255, 255, 0.14);
                border-radius: 12px;
                background: rgba(0, 0, 0, 0.35);
                color: #fff;
                font-size: 13px;
                line-height: 1.6;
                padding: 10px 12px;
                outline: none;
                font-family: inherit;
            }

            #${ROOT_ID} .hip-manual-yaml-input::placeholder {
                color: var(--hip-text-muted);
            }

            #${ROOT_ID} .hip-manual-yaml-actions {
                display: flex;
                justify-content: flex-end;
            }

            #${ROOT_ID} .hip-migration-session {
                margin-top: 14px;
                padding: 12px;
                border-radius: 14px;
                border: 1px solid rgba(255, 255, 255, 0.12);
                background: rgba(0, 0, 0, 0.22);
                display: flex;
                flex-direction: column;
                gap: 10px;
            }

            #${ROOT_ID} .hip-migration-session-head {
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 10px;
                flex-wrap: wrap;
            }

            #${ROOT_ID} .hip-migration-chunk-list {
                display: flex;
                flex-direction: column;
                gap: 8px;
            }

            #${ROOT_ID} .hip-migration-chunk-item {
                border-radius: 10px;
                border: 1px solid rgba(255, 255, 255, 0.10);
                background: rgba(255, 255, 255, 0.03);
                padding: 10px;
            }

            #${ROOT_ID} .hip-migration-chunk-item.is-failed {
                border-color: rgba(251, 113, 133, 0.35);
                background: rgba(251, 113, 133, 0.08);
            }

            #${ROOT_ID} .hip-migration-chunk-head {
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 10px;
                margin-bottom: 4px;
            }

            #${ROOT_ID} .hip-migration-chunk-status {
                font-size: 12px;
                color: var(--hip-text-sub);
            }

            #${ROOT_ID} .hip-migration-chunk-actions {
                margin-top: 8px;
            }

            #${ROOT_ID} .hip-migration-session-actions {
                display: flex;
                justify-content: flex-end;
            }

            #${ROOT_ID} .hip-empty {
                text-align: center;
                padding: 30px 14px;
                color: var(--hip-text-sub);
                font-size: 14px;
            }

            #${ROOT_ID} .hip-empty-compact {
                padding: 14px 8px;
                font-size: 13px;
            }

            #${ROOT_ID} .hip-loading {
                min-height: 220px;
                display: flex;
                justify-content: center;
                align-items: center;
                color: var(--hip-text-sub);
                font-size: 14px;
            }

            @media (max-width: 640px) {
                #${ROOT_ID} .hip-safe-area {
                    padding: calc(env(safe-area-inset-top, 0px) + 14px) 12px calc(env(safe-area-inset-bottom, 0px) + 18px);
                }

                #${ROOT_ID} .hip-search-bar {
                    flex-direction: column;
                }

                #${ROOT_ID} .hip-sort-select {
                    max-width: unset;
                }

                #${ROOT_ID} .hip-unified-search {
                    row-gap: 6px;
                    padding: 8px;
                }

                #${ROOT_ID} .hip-list-quick-actions {
                    align-items: stretch;
                }

                #${ROOT_ID} .hip-list-quick-actions .hip-btn-outline {
                    width: 100%;
                }

                #${ROOT_ID} .hip-regression-helper {
                    align-items: stretch;
                }

                #${ROOT_ID} .hip-regression-actions {
                    width: 100%;
                }

                #${ROOT_ID} .hip-audit-two-column {
                    grid-template-columns: 1fr;
                }

                #${ROOT_ID} .hip-regression-actions .hip-btn-outline,
                #${ROOT_ID} .hip-regression-actions .hip-btn-danger {
                    width: 100%;
                }

                #${ROOT_ID} .hip-search-input-box {
                    min-width: 100%;
                    padding: 2px 8px;
                }

                #${ROOT_ID} .hip-search-divider {
                    display: none;
                }

                #${ROOT_ID} .hip-inline-select {
                    flex: 1 1 calc(50% - 6px);
                    min-width: 120px;
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 999px;
                    background-color: rgba(255, 255, 255, 0.05);
                }

                #${ROOT_ID} .hip-pagination {
                    gap: 10px;
                }

                #${ROOT_ID} .hip-page-jump {
                    width: 100%;
                    justify-content: center;
                }

                #${ROOT_ID} .hip-pagination-unified {
                    width: 100%;
                    border-radius: 18px;
                    justify-content: center;
                }

                #${ROOT_ID} .hip-event-head {
                    flex-direction: column;
                    gap: 8px;
                }

                #${ROOT_ID} .hip-event-status {
                    align-self: flex-start;
                }

                #${ROOT_ID} .hip-event-member-row {
                    flex-direction: column;
                    align-items: stretch;
                }

                #${ROOT_ID} .hip-event-member-actions {
                    justify-content: flex-start;
                }

                #${ROOT_ID} .hip-audit-grid {
                    grid-template-columns: 1fr;
                }

                #${ROOT_ID} .hip-audit-arrow {
                    display: none;
                }

                #${ROOT_ID} .hip-dialog-layer {
                    padding: 12px;
                }

                #${ROOT_ID} .hip-dialog-panel {
                    width: min(100vw - 24px, 680px);
                    max-height: calc(100vh - 24px);
                    padding: 16px;
                }
            }
        `;
        documentRef.head.appendChild(styleEl);
    }

    /**
     * 对外暴露的管理台视图 API。
     */
    function renderOverviewPanel() {
        if (state.loading) {
            return renderLoadingPanel('正在整理海马体总览...');
        }

        const dashboard = state.data.overview.dashboard || {};
        const enabledContacts = getEnabledContacts();
        const topMemories = Array.isArray(state.data.overview.topMemories) ? state.data.overview.topMemories : [];
        const topMemoriesHtml = topMemories.length > 0
            ? topMemories.map(renderMemoryCard).join('')
            : '<div class="hip-empty">暂时还没有特别浮上来的记忆。</div>';

        const totalCount = Math.max(0, Number(dashboard.total_count || 0));
        const resolvedCount = Math.max(0, Number(dashboard.resolved_count || 0));
        const unresolvedCount = Math.max(0, Number(dashboard.unresolved_count || 0));

        let distBuffer = Math.max(0, Number(dashboard.layer_buffer || dashboard.buffer_count || Math.floor(totalCount * 0.35) || 0));
        let distCore = Math.max(0, Number(dashboard.layer_core || dashboard.core_count || Math.floor(totalCount * 0.25) || 0));
        let distCortex = Math.max(0, Number(dashboard.layer_cortex || dashboard.cortex_count || Math.floor(totalCount * 0.2) || 0));
        let distShadow = Math.max(0, Number(dashboard.layer_shadow || dashboard.shadow_count || Math.floor(totalCount * 0.1) || 0));
        let distWish = Math.max(0, Number(dashboard.layer_wish || dashboard.wish_count || (totalCount - distBuffer - distCore - distCortex - distShadow)));
        const distTotal = distBuffer + distCore + distCortex + distShadow + distWish || 1;
        const widthPct = function widthPct(value) {
            return ((Math.max(0, Number(value) || 0) / distTotal) * 100).toFixed(2);
        };

        return `
            <section class="hip-panel-wrapper">
                <div class="hip-toolbar">
                    <select id="hip-admin-char-select" class="hip-select-block">
                        ${renderContactOptions(enabledContacts, state.filters.charId)}
                    </select>
                    <button type="button" class="hip-icon-btn" data-hip-action="refresh-tab" aria-label="刷新总览">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.58m15.36 2A8 8 0 004.58 9m0 0H9m11 11v-5h-.58m0 0a8 8 0 01-15.36-2m15.36 2H15"></path>
                        </svg>
                    </button>
                </div>

                <div class="hip-glass-panel">
                    <div class="hip-stats-row">
                        <div class="hip-neural-globe-container" id="${NEURAL_GLOBE_CONTAINER_ID}"></div>
                        <div>
                            <div class="hip-stat-primary">当前共存着 <strong>${totalCount}</strong> 条记忆碎片</div>
                            <div class="hip-stat-secondary">其中 <strong>${unresolvedCount}</strong> 条还挂着，<strong>${resolvedCount}</strong> 条已沉淀下来。</div>
                        </div>
                    </div>

                    <div class="hip-distribution-wrapper">
                        <div class="hip-dist-title">记忆层级分布</div>
                        <div class="hip-dist-bar">
                            <div class="hip-dist-segment" style="width:${widthPct(distBuffer)}%;background:#5c6c7c;"></div>
                            <div class="hip-dist-segment" style="width:${widthPct(distCore)}%;background:#e2e8f0;"></div>
                            <div class="hip-dist-segment" style="width:${widthPct(distCortex)}%;background:#4ade80;"></div>
                            <div class="hip-dist-segment" style="width:${widthPct(distShadow)}%;background:#475569;"></div>
                            <div class="hip-dist-segment" style="width:${widthPct(distWish)}%;background:#a855f7;"></div>
                        </div>
                        <div class="hip-dist-legend">
                            <div class="hip-legend-item"><span class="hip-legend-dot" style="--hip-dot-color:#5c6c7c;"></span>日常碎片</div>
                            <div class="hip-legend-item"><span class="hip-legend-dot" style="--hip-dot-color:#e2e8f0;"></span>核心记忆</div>
                            <div class="hip-legend-item"><span class="hip-legend-dot" style="--hip-dot-color:#4ade80;"></span>学到的事</div>
                            <div class="hip-legend-item"><span class="hip-legend-dot" style="--hip-dot-color:#475569;"></span>阴影与旧伤</div>
                            <div class="hip-legend-item"><span class="hip-legend-dot" style="--hip-dot-color:#a855f7;"></span>愿望与约定</div>
                        </div>
                    </div>
                </div>

                <h3 class="hip-section-title">最近最挂心的事</h3>
                <div class="hip-card-list">
                    ${topMemoriesHtml}
                </div>
            </section>
        `;
    }

    function buildDehydrateFailureAuditRow(item) {
        const errorText = toTrimmedString(item && (item.errorMessage || item.error_message)) || '未知错误';
        return {
            title: toTrimmedString(item && (item.charLabel || item.charId)) || '后台脱水任务',
            meta: [
                formatDateTime(item && (item.createdAt || item.created_at || item.updatedAt || item.updated_at)),
                `重试 ${Math.max(0, Math.floor(toFiniteNumber(item && (item.retryCount || item.retry_count), 0)))} 次`
            ],
            body: summarizeContent(errorText, 120)
        };
    }

    function buildDigestOutcomeAuditRow(item) {
        return {
            title: toTrimmedString(item && item.digestSummary) || '暂无本轮摘要',
            meta: [
                formatDateTime(item && (item.windowEnd || item.updatedAt || item.createdAt || item.window_end || item.updated_at || item.created_at)),
                Number(item && item.sourceMessageCount || 0) > 0
                    ? `消息 ${Math.max(0, Number(item && item.sourceMessageCount || 0))} 条`
                    : '',
                toTrimmedString(item && item.attachmentAfter)
                    ? `依恋 ${formatAttachmentStyleLabel(item.attachmentAfter)}`
                    : ''
            ].filter(Boolean),
            body: summarizeContent(
                toTrimmedString(item && (item.selfInsightAfter || item.eventChanges || item.fragmentChanges))
                || '这一轮整理还没留下更细的变化说明。',
                120
            )
        };
    }

    function getDigestStabilityTierLabel(tier) {
        const value = normalizeDigestStabilityTier(tier);
        if (value === 'high_risk') return '高风险';
        if (value === 'attention') return '需留意';
        return '基本稳定';
    }

    function getDigestStabilityTierHint(tier) {
        const value = normalizeDigestStabilityTier(tier);
        if (value === 'high_risk') return '这件事现在很容易被后续整理越改越歪，建议优先人工复看。';
        if (value === 'attention') return '这件事暂时还能用，但底层证据偏薄，后面继续改写时要留意。';
        return '这件事目前锚点和证据都还算稳，短期内不太容易被改歪。';
    }

    function formatDigestStabilitySpanLabel(spanHours) {
        const hours = Math.max(0, Number(spanHours || 0));
        if (!(hours > 0)) return '';
        if (hours >= 48) return `证据跨度 ${Number((hours / 24).toFixed(1))} 天`;
        if (hours >= 1) return `证据跨度 ${Number(hours.toFixed(1))} 小时`;
        return `证据跨度 ${Math.max(1, Math.round(hours * 60))} 分钟`;
    }

    function getDigestStabilityReasonLabel(reason) {
        const value = toTrimmedString(reason).toLowerCase();
        if (value === 'missing_signature') return '缺少稳定签名';
        if (value === 'missing_primary_term') return '缺少主锚点词';
        if (value === 'missing_source_messages') return '没有原消息支撑';
        if (value === 'single_source_message') return '只有 1 条原消息支撑';
        if (value === 'thin_alias_coverage') return '可复用的锚点词太少';
        if (value === 'member_overflow_with_thin_evidence') return '成员很多，但底层证据太薄';
        if (value === 'wide_time_span_with_thin_evidence') return '时间跨度很大，但底层证据太薄';
        if (value === 'manual_guard_hotspot') return '最近多次被人工保护拦下';
        if (value === 'version_churn_hotspot') return '最近改写次数偏多';
        if (value === 'retired_flag') return '这件事已经退役';
        return value;
    }

    function buildDigestStabilityAuditRow(entry) {
        const eventItem = entry && entry.eventItem ? entry.eventItem : {};
        const snapshot = entry && entry.snapshot ? entry.snapshot : getEventDigestStabilitySnapshot(eventItem);
        const tier = toTrimmedString(entry && entry.tier) || snapshot.tier || 'stable';
        const meta = [
            getDigestStabilityTierLabel(tier),
            `风险 ${Math.max(0, Number(entry && entry.riskScore || snapshot.riskScore || 0))}`,
            snapshot.primaryTerm ? `主词 ${snapshot.primaryTerm}` : '',
            `来源消息 ${snapshot.sourceMessageCount > 0 ? snapshot.sourceMessageCount : 0}`,
            snapshot.aliasCount > 0 ? `锚点词 ${snapshot.aliasCount}` : '',
            formatDigestStabilitySpanLabel(snapshot.sourceSpanHours),
            snapshot.manualGuardSnapshot && snapshot.manualGuardSnapshot.historyCount > 0
                ? `人工保护 ${Math.max(0, Number(snapshot.manualGuardSnapshot.historyCount || 0))} 次`
                : '',
            snapshot.versionHistoryCount > 0 ? `改写留痕 ${snapshot.versionHistoryCount}` : ''
        ].filter(Boolean);
        const body = entry && Array.isArray(entry.reasons) && entry.reasons.length > 0
            ? entry.reasons.map(getDigestStabilityReasonLabel).join(' / ')
            : getDigestStabilityTierHint(tier);
        return {
            title: toTrimmedString(eventItem && eventItem.title) || '未命名事件',
            meta: meta,
            body: body
        };
    }

    function renderEventDigestStabilityPanel(eventItem) {
        const snapshot = getEventDigestStabilitySnapshot(eventItem);
        const entry = deriveDigestStabilityWatchlist([eventItem])[0] || {
            eventItem: eventItem,
            snapshot: snapshot,
            reasons: Array.isArray(snapshot.reasonTags) ? snapshot.reasonTags.slice() : [],
            riskScore: Math.max(0, Number(snapshot.riskScore || 0)),
            tier: snapshot.tier || 'stable'
        };
        const tier = toTrimmedString(entry.tier) || 'stable';
        const riskReasons = Array.isArray(entry.reasons) ? entry.reasons : [];
        const badges = [
            renderUniqueHipTags(
                [
                    getDigestStabilityTierLabel(tier),
                    snapshot.primaryTerm ? `主词 ${snapshot.primaryTerm}` : '缺主词',
                    `来源消息 ${snapshot.sourceMessageCount > 0 ? snapshot.sourceMessageCount : 0}`,
                    `锚点词 ${snapshot.aliasCount > 0 ? snapshot.aliasCount : 0}`,
                    formatDigestStabilitySpanLabel(snapshot.sourceSpanHours),
                    snapshot.versionHistoryCount > 0 ? `改写留痕 ${snapshot.versionHistoryCount}` : ''
                ].concat(
                    snapshot.manualGuardSnapshot && snapshot.manualGuardSnapshot.historyCount > 0
                        ? [`人工保护 ${Math.max(0, Number(snapshot.manualGuardSnapshot.historyCount || 0))} 次`]
                        : []
                ).filter(Boolean),
                10
            )
        ];
        const metaLines = [
            `当前判断：${getDigestStabilityTierHint(tier)}`
        ];
        if (snapshot.signature) {
            metaLines.push(`稳定签名：${snapshot.signature}`);
        }
        if (snapshot.sourceTimeStart || snapshot.sourceTimeEnd) {
            metaLines.push(`证据时间：${formatDateTime(snapshot.sourceTimeStart) || '未知'} ~ ${formatDateTime(snapshot.sourceTimeEnd) || '未知'}`);
        }
        if (snapshot.manualGuardSnapshot && snapshot.manualGuardSnapshot.hasBlocked) {
            metaLines.push(`最近一次人工保护拦下：${snapshot.manualGuardSnapshot.blockedFields.map(formatManualGuardFieldLabel).join('、')}`);
        }
        if (snapshot.digestRetired) {
            metaLines.push(`这件事已经退役${snapshot.digestRetiredAt ? `（${formatDateTime(snapshot.digestRetiredAt)}）` : ''}`);
        }
        return `
            <div class="hip-audit-panel" style="margin-top:14px;">
                <div class="hip-audit-head">
                    <div class="hip-audit-title">这件事稳不稳</div>
                    <span class="hip-grounding-pill">${escapeHtml(getDigestStabilityTierLabel(tier))}</span>
                </div>
                ${badges.join('')}
                <div class="hip-audit-summary" style="margin-top:10px;">${escapeHtml(metaLines.join('  '))}</div>
                ${riskReasons.length > 0 ? `<div class="hip-audit-summary" style="margin-top:8px;">${escapeHtml(`主要原因：${riskReasons.map(getDigestStabilityReasonLabel).join(' / ')}`)}</div>` : ''}
            </div>
        `;
    }

    function renderDigestStabilityDiagnosticsSection(buckets) {
        const safeBuckets = buckets && typeof buckets === 'object' ? buckets : {};
        const entries = Array.isArray(safeBuckets.digestStability) ? safeBuckets.digestStability : [];
        return `
            <div class="hip-glass-panel hip-audit-section-card">
                <div class="hip-box-header">
                    <h3>容易越写越歪的事件</h3>
                </div>
                <div class="hip-box-hint">这里优先看那些锚点太少、原消息太薄、人工保护反复触发，或者改写边界老是抖动的事件。它们最容易在后续整理时被越写越偏。</div>
                <div class="hip-list-inline-actions">
                    ${renderListFocusActionButton('diagnostics', 'digest_stability', '查看完整样本', entries.length)}
                </div>
                ${renderAuditCompactRows(entries.slice(0, 6).map(function mapDigestStability(entry) {
                    return buildDigestStabilityAuditRow(entry);
                }), '最近样本里没有明显容易被改歪的事件。')}
            </div>
        `;
    }

    function getAdminTabLabel(tab) {
        const safeTab = normalizeTab(tab);
        if (safeTab === 'recon') return '改写记录';
        if (safeTab === 'audit') return '线索排查';
        if (safeTab === 'diagnostics') return '风险总览';
        if (safeTab === 'list') return '所有记忆';
        if (safeTab === 'continuity') return '48h摘要';
        if (safeTab === 'notebook') return '记事本';
        if (safeTab === 'export' || safeTab === 'snapshot') return '记忆保管箱';
        return '此刻';
    }

    function buildReconListFocusPayload(focusKey) {
        const recon = state.data && state.data.recon && typeof state.data.recon === 'object' ? state.data.recon : {};
        const memories = Array.isArray(recon.memories) ? recon.memories : [];
        const eventRecordsById = recon.eventRecordsById && typeof recon.eventRecordsById === 'object' ? recon.eventRecordsById : {};
        const eventItems = buildListDisplayItems(memories, {
            recordType: 'event',
            eventRecordsById: eventRecordsById
        });
        const replayBuckets = deriveReconReplayBuckets(memories, eventItems);
        if (focusKey === 'accepted') {
            return buildListFocusFromMemories('recon', focusKey, '最近成功改写的样本', '来源：改写记录页里最近成功改写过的记忆碎片。', replayBuckets.accepted.map(function mapEntry(entry) {
                return entry.memory;
            }));
        }
        if (focusKey === 'rejected') {
            return buildListFocusFromMemories('recon', focusKey, '最近被拦下的样本', '来源：改写记录页里最近被护栏拦下的对象。', replayBuckets.rejected.map(function mapEntry(entry) {
                return entry.memory;
            }));
        }
        if (focusKey === 'manual') {
            return buildListFocusFromMemories('recon', focusKey, '手动触发记录', '来源：改写记录页里仍保留“这是你手动点过的”痕迹的条目。', replayBuckets.manual.map(function mapEntry(entry) {
                return entry.memory;
            }));
        }
        if (focusKey === 'hotspots') {
            return buildListFocusFromMemories('recon', focusKey, '反复变动热点', '来源：改写记录页里多次被改写或被拦下的热点条目。', replayBuckets.hotspots.map(function mapEntry(entry) {
                return entry.memory;
            }));
        }
        if (focusKey === 'event_refresh') {
            return buildListFocusFromEvents('recon', focusKey, '事件顺带刷新样本', '来源：改写后顺带触发事件摘要刷新的事件。', replayBuckets.eventRefresh.map(function mapEntry(entry) {
                return entry.eventItem;
            }));
        }
        return null;
    }

    function buildAuditListFocusPayload(focusKey) {
        const audit = state.data && state.data.audit && typeof state.data.audit === 'object' ? state.data.audit : {};
        const memories = Array.isArray(audit.memories) ? audit.memories : [];
        const eventRecordsById = audit.eventRecordsById && typeof audit.eventRecordsById === 'object' ? audit.eventRecordsById : {};
        const eventItems = buildListDisplayItems(memories, {
            recordType: 'event',
            eventRecordsById: eventRecordsById
        });
        const groundingBuckets = deriveAuditGroundingBuckets(memories);
        const reconEntries = deriveAuditReconReviewEntries(memories);
        const eventBuckets = deriveAuditEventBuckets(eventItems);
        if (focusKey === 'grounding_weak') return buildListFocusFromMemories('audit', focusKey, '原话支撑偏弱', '来源：线索排查页里原话支撑偏弱的碎片。', groundingBuckets.weak);
        if (focusKey === 'grounding_missing') return buildListFocusFromMemories('audit', focusKey, '缺少原话校对快照', '来源：线索排查页里还没有做过原话校对的碎片。', groundingBuckets.missing);
        if (focusKey === 'recon_review') {
            return buildListFocusFromMemories('audit', focusKey, '被拦下待复看', '来源：线索排查页里被改写护栏拦下、需要人工复看的碎片。', reconEntries.map(function mapEntry(entry) {
                return entry.memory;
            }));
        }
        if (focusKey === 'event_grounding') {
            return buildListFocusFromEvents('audit', focusKey, '原话支撑偏弱的事件', '来源：线索排查页里需要补看的事件。', eventBuckets.grounding.map(function mapEntry(entry) {
                return entry.eventItem;
            }));
        }
        if (focusKey === 'event_history') {
            return buildListFocusFromEvents('audit', focusKey, '人工改过的事件', '来源：线索排查页里被人工编辑、成员变更或人工保护过的事件。', eventBuckets.history.map(function mapEntry(entry) {
                return entry.eventItem;
            }));
        }
        return null;
    }

    function buildDiagnosticsListFocusPayload(focusKey) {
        const diagnostics = state.data && state.data.diagnostics && typeof state.data.diagnostics === 'object' ? state.data.diagnostics : {};
        const memories = Array.isArray(diagnostics.memories) ? diagnostics.memories : [];
        const directEventItems = buildDirectEventDisplayItems(diagnostics.eventRecords);
        const eventRecordsById = diagnostics.eventRecordsById && typeof diagnostics.eventRecordsById === 'object' ? diagnostics.eventRecordsById : {};
        const eventItems = buildListDisplayItems(memories, {
            recordType: 'event',
            eventRecordsById: eventRecordsById
        });
        const buckets = deriveDiagnosticBuckets(memories, eventItems, diagnostics.dehydrateFailures, diagnostics.digestOutcomes, directEventItems);
        if (focusKey === 'large_events') return buildListFocusFromEvents('diagnostics', focusKey, '成员过多的事件', '来源：风险总览页里成员数偏大的事件。', buckets.largeEvents);
        if (focusKey === 'crowded_unresolved') return buildListFocusFromEvents('diagnostics', focusKey, '未了结且成员过多', '来源：风险总览页里未了结且成员偏多的事件。', buckets.crowdedUnresolved);
        if (focusKey === 'grounding_events') {
            return buildListFocusFromEvents('diagnostics', focusKey, '原话支撑风险事件', '来源：风险总览页里原话支撑偏弱的事件。', buckets.groundingEvents.map(function mapEntry(entry) {
                return entry.eventItem;
            }));
        }
        if (focusKey === 'recon_hotspots') {
            return buildListFocusFromMemories('diagnostics', focusKey, '反复变动热点', '来源：风险总览页里被改写反复触碰的热点条目。', buckets.reconHotspots.map(function mapEntry(entry) {
                return entry.memory;
            }));
        }
        if (focusKey === 'retired_events') return buildListFocusFromEvents('diagnostics', focusKey, '退役事件样本', '来源：风险总览页里已经退役、用于追踪事件生命周期的历史事件。', buckets.retiredEvents);
        if (focusKey === 'lifecycle_churn') {
            return buildListFocusFromEvents('diagnostics', focusKey, '来回变动的事件', '来源：风险总览页里留痕、人工保护或退役变化较多的事件。', buckets.lifecycleChurn.map(function mapEntry(entry) {
                return entry.eventItem;
            }));
        }
        if (focusKey === 'digest_stability') {
            return buildListFocusFromEvents('diagnostics', focusKey, '容易越写越歪的事件', '来源：风险总览页里锚点太少、原消息太薄，或人工保护/改写留痕过多的事件。', buckets.digestStability.map(function mapEntry(entry) {
                return entry.eventItem;
            }));
        }
        return null;
    }

    function applyListFocusPayload(payload) {
        const focus = payload && typeof payload === 'object' ? payload : null;
        if (!focus || !Array.isArray(focus.displayItems) || focus.displayItems.length <= 0) {
            showToastSafe('当前样本里没有可聚焦的条目。', 'info');
            return;
        }
        state.activeTab = 'list';
        state.listFocus = focus;
        state.notice = '';
        state.adminDialog = null;
        state.expandedDigestOutcomeId = '';
        state.loadingEventMembersEventId = '';
        state.eventMembersCache = {};
        state.expandedMemoryId = focus.preferredMemoryId || '';
        state.expandedEventId = focus.preferredEventId || '';
        state.expandedEventMembersEventId = focus.preferredEventId || '';
        state.expandedEventMemberMemoryId = '';
        renderLayout();
    }

    function renderListFocusActionButton(sourceTab, focusKey, label, count) {
        const disabled = Math.max(0, Number(count || 0)) <= 0;
        const text = toTrimmedString(label) || '查看完整样本';
        return `<button type="button" class="hip-btn-outline hip-btn-inline" data-hip-action="open-list-focus" data-source-tab="${escapeAttribute(sourceTab)}" data-focus-key="${escapeAttribute(focusKey)}" ${disabled ? 'disabled' : ''}>${escapeHtml(text)}</button>`;
    }

    function renderListFocusBanner() {
        const focus = getActiveListFocus();
        if (!focus) return '';
        const sourceTab = normalizeTab(focus.sourceTab);
        return `
            <div class="hip-glass-panel hip-list-focus-banner">
                <div class="hip-box-header">
                    <h3>${escapeHtml(focus.title || '聚焦样本')}</h3>
                    <div class="hip-list-focus-actions">
                        ${sourceTab !== 'list' ? `<button type="button" class="hip-btn-outline hip-btn-inline" data-hip-action="switch-tab" data-tab="${escapeAttribute(sourceTab)}">回到${escapeHtml(getAdminTabLabel(sourceTab))}</button>` : ''}
                        <button type="button" class="hip-btn-danger hip-btn-inline" data-hip-action="clear-list-focus">退出聚焦</button>
                    </div>
                </div>
                <div class="hip-box-hint">${escapeHtml(focus.hint || '当前看的不是普通列表，而是从其他页签跳转来的聚焦样本。')}</div>
                <div class="hip-audit-compact-meta">来源页签：${escapeHtml(getAdminTabLabel(sourceTab))} · 共 ${escapeHtml(String(Math.max(0, Number(focus.count || 0))))} 条 · 修改下面筛选、翻页或点“退出聚焦”都会回到普通列表。</div>
            </div>
        `;
    }

    function renderAuditCompactRows(rows, emptyText) {
        const safeRows = Array.isArray(rows) ? rows.filter(Boolean) : [];
        if (safeRows.length <= 0) {
            return `<div class="hip-empty hip-empty-compact">${escapeHtml(emptyText || '暂时没有需要额外关注的条目。')}</div>`;
        }
        return `
            <div class="hip-audit-compact-list">
                ${safeRows.map(function renderAuditCompactRow(row) {
                    const title = toTrimmedString(row && row.title) || '未命名条目';
                    const body = toTrimmedString(row && row.body) || '暂无说明';
                    const meta = Array.isArray(row && row.meta) ? row.meta.filter(Boolean) : [];
                    return `
                        <div class="hip-audit-compact-row">
                            <div class="hip-audit-compact-title">${escapeHtml(title)}</div>
                            ${meta.length > 0 ? `<div class="hip-audit-compact-meta">${escapeHtml(meta.join(' · '))}</div>` : ''}
                            <div class="hip-audit-compact-body">${escapeHtml(body)}</div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    function renderAuditPanel() {
        if (state.loading) {
            return renderLoadingPanel('正在整理线索排查...');
        }

        const enabledContacts = getEnabledContacts();
        const audit = state.data && state.data.audit && typeof state.data.audit === 'object' ? state.data.audit : {};
        const dashboard = audit.dashboard && typeof audit.dashboard === 'object' ? audit.dashboard : {};
        const memories = Array.isArray(audit.memories) ? audit.memories : [];
        const failures = Array.isArray(audit.dehydrateFailures) ? audit.dehydrateFailures : [];
        const digestOutcomes = Array.isArray(audit.digestOutcomes) ? audit.digestOutcomes : [];
        const eventRecordsById = audit.eventRecordsById && typeof audit.eventRecordsById === 'object' ? audit.eventRecordsById : {};
        const eventItems = buildListDisplayItems(memories, {
            recordType: 'event',
            eventRecordsById: eventRecordsById
        });
        const groundingBuckets = deriveAuditGroundingBuckets(memories);
        const reconEntries = deriveAuditReconReviewEntries(memories);
        const eventBuckets = deriveAuditEventBuckets(eventItems);

        const weakOrMissingGroundingCount = groundingBuckets.missing.length + groundingBuckets.weak.length + groundingBuckets.medium.length;
        const unresolvedCount = Math.max(0, Number(dashboard.unresolved_count || 0));
        const totalCount = Math.max(0, Number(dashboard.total_count || 0));

        const failureRowsHtml = renderAuditCompactRows(
            sortDehydrateFailuresNewestFirst(failures).slice(0, 4).map(function mapFailure(item) {
                return buildDehydrateFailureAuditRow(item);
            }),
            '最近没有脱水失败任务。'
        );
        const digestRowsHtml = renderAuditCompactRows(
            sortDigestOutcomesNewestFirst(digestOutcomes).slice(0, 4).map(function mapDigest(item) {
                return buildDigestOutcomeAuditRow(item);
            }),
            '最近 24 小时还没有额外记录整理结果。'
        );
        const weakGroundingHtml = groundingBuckets.weak.length > 0
            ? groundingBuckets.weak.slice(0, 4).map(function renderWeakGrounding(memory) {
                return renderMemoryCard(memory);
            }).join('')
            : '<div class="hip-empty">最近抽样里没有明显原话支撑偏弱的碎片。</div>';
        const missingGroundingHtml = groundingBuckets.missing.length > 0
            ? groundingBuckets.missing.slice(0, 4).map(function renderMissingGrounding(memory) {
                return renderMemoryCard(memory);
            }).join('')
            : '<div class="hip-empty">最近抽样里没有缺少原话校对快照的碎片。</div>';
        const reconReviewHtml = reconEntries.length > 0
            ? reconEntries.slice(0, 4).map(function renderReconReview(entry) {
                return renderMemoryCard(entry.memory);
            }).join('')
            : '<div class="hip-empty">最近抽样里没有被改写护栏拦下的碎片。</div>';
        const eventGroundingHtml = eventBuckets.grounding.length > 0
            ? eventBuckets.grounding.slice(0, 3).map(function renderEventGrounding(entry) {
                return renderEventCard(entry.eventItem);
            }).join('')
            : '<div class="hip-empty">最近抽样里没有原话支撑明显异常的事件。</div>';
        const eventHistoryHtml = eventBuckets.history.length > 0
            ? eventBuckets.history.slice(0, 3).map(function renderEventHistory(entry) {
                return renderEventCard(entry.eventItem);
            }).join('')
            : '<div class="hip-empty">最近抽样里没有需要重点回看的事件留痕。</div>';

        return `
            <section class="hip-panel-wrapper">
                <div class="hip-toolbar">
                    <select id="hip-admin-char-select" class="hip-select-block">
                        ${renderContactOptions(enabledContacts, state.filters.charId)}
                    </select>
                    <button type="button" class="hip-icon-btn" data-hip-action="refresh-tab" aria-label="刷新线索排查页">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.58m15.36 2A8 8 0 004.58 9m0 0H9m11 11v-5h-.58m0 0a8 8 0 01-15.36-2m15.36 2H15"></path>
                        </svg>
                    </button>
                </div>

                <div class="hip-glass-panel hip-audit-section-card">
                    <div class="hip-box-header">
                        <h3>这页在看什么</h3>
                        <button type="button" class="hip-btn-outline hip-btn-inline" data-hip-action="switch-tab" data-tab="list">去所有记忆细看</button>
                    </div>
                    <div class="hip-box-hint">这里会抽样最近活跃的碎片，再叠加最近 24 小时的整理结果和后台失败任务，方便你快速找到最值得人工复核的地方。它不是全库扫描页。</div>
                    <div class="hip-list-focus-actions" style="margin-top:10px;">
                        <button type="button" class="hip-btn-outline hip-btn-inline" data-hip-action="switch-tab" data-tab="diagnostics">去风险总览</button>
                        <button type="button" class="hip-btn-outline hip-btn-inline" data-hip-action="switch-tab" data-tab="recon">去改写记录</button>
                        <button type="button" class="hip-btn-outline hip-btn-inline" data-hip-action="switch-tab" data-tab="list">去所有记忆细看</button>
                    </div>
                    <div class="hip-audit-summary-grid">
                        ${renderAuditSummaryCard('总碎片', totalCount, '当前筛选范围内的记忆总量', 'neutral')}
                        ${renderAuditSummaryCard('未了结', unresolvedCount, '还在影响角色当下判断的碎片', unresolvedCount > 0 ? 'warn' : 'neutral')}
                        ${renderAuditSummaryCard('原话待复看', weakOrMissingGroundingCount, '缺快照 / 偏弱 / 证据偏稀', weakOrMissingGroundingCount > 0 ? 'warn' : 'neutral')}
                        ${renderAuditSummaryCard('改写被拦下', reconEntries.length, '最近被护栏挡回去的改写', reconEntries.length > 0 ? 'danger' : 'neutral')}
                        ${renderAuditSummaryCard('人工改动待看', eventBuckets.history.length, '人工编辑、成员变更或人工保护过的事件', eventBuckets.history.length > 0 ? 'info' : 'neutral')}
                        ${renderAuditSummaryCard('后台失败任务', failures.length, '脱水失败与待处理异常', failures.length > 0 ? 'danger' : 'neutral')}
                    </div>
                </div>

                <div class="hip-glass-panel hip-audit-section-card">
                    <div class="hip-box-header">
                        <h3>后台任务速览</h3>
                        <button type="button" class="hip-btn-outline hip-btn-inline" data-hip-action="switch-tab" data-tab="export">去记忆保管箱</button>
                    </div>
                    <div class="hip-audit-two-column">
                        <div>
                            <div class="hip-audit-block-title">脱水失败任务</div>
                            <div class="hip-box-hint">这里优先看会堵住后台链路的硬错误。</div>
                            ${failureRowsHtml}
                        </div>
                        <div>
                            <div class="hip-audit-block-title">最近 24 小时整理结果</div>
                            <div class="hip-box-hint">这里只看摘要，用来判断系统最近的整理有没有留下你看得懂的变化。</div>
                            ${digestRowsHtml}
                        </div>
                    </div>
                </div>

                <div class="hip-glass-panel hip-audit-section-card">
                    <div class="hip-box-header">
                        <h3>原话支撑偏弱的碎片</h3>
                    </div>
                    <div class="hip-box-hint">这批碎片已经做过原聊天校对，但对上的证据偏弱，最适合人工点开看它到底偏在哪。</div>
                    <div class="hip-card-list">
                        <div class="hip-list-inline-actions">
                            ${renderListFocusActionButton('audit', 'grounding_weak', '查看完整样本', groundingBuckets.weak.length)}
                        </div>
                        ${weakGroundingHtml}
                    </div>
                </div>

                <div class="hip-glass-panel hip-audit-section-card">
                    <div class="hip-box-header">
                        <h3>还没做原话校对的碎片</h3>
                    </div>
                    <div class="hip-box-hint">这些碎片还没有“这句话对不对得上原聊天”的校对快照，适合优先补看。</div>
                    <div class="hip-card-list">
                        <div class="hip-list-inline-actions">
                            ${renderListFocusActionButton('audit', 'grounding_missing', '查看完整样本', groundingBuckets.missing.length)}
                        </div>
                        ${missingGroundingHtml}
                    </div>
                </div>

                <div class="hip-glass-panel hip-audit-section-card">
                    <div class="hip-box-header">
                        <h3>被改写护栏拦下的碎片</h3>
                    </div>
                    <div class="hip-box-hint">这里用来判断是护栏太严，还是改写结果真的有漂移风险。</div>
                    <div class="hip-card-list">
                        <div class="hip-list-inline-actions">
                            ${renderListFocusActionButton('audit', 'recon_review', '查看完整样本', reconEntries.length)}
                        </div>
                        ${reconReviewHtml}
                    </div>
                </div>

                <div class="hip-glass-panel hip-audit-section-card">
                    <div class="hip-box-header">
                        <h3>原话支撑偏弱的事件</h3>
                    </div>
                    <div class="hip-box-hint">不是所有原话支撑偏弱都会立刻出错，但这批事件最容易在后续改写或事件直出时出问题。</div>
                    <div class="hip-card-list">
                        <div class="hip-list-inline-actions">
                            ${renderListFocusActionButton('audit', 'event_grounding', '查看完整样本', eventBuckets.grounding.length)}
                        </div>
                        ${eventGroundingHtml}
                    </div>
                </div>

                <div class="hip-glass-panel hip-audit-section-card">
                    <div class="hip-box-header">
                        <h3>事件留痕与人工保护</h3>
                    </div>
                    <div class="hip-box-hint">这里集中看最近被人工编辑、成员调整或人工保护过的事件，方便回看系统后来有没有又动过。</div>
                    <div class="hip-card-list">
                        <div class="hip-list-inline-actions">
                            ${renderListFocusActionButton('audit', 'event_history', '查看完整样本', eventBuckets.history.length)}
                        </div>
                        ${eventHistoryHtml}
                    </div>
                </div>
            </section>
        `;
    }

    function renderReconPanel() {
        if (state.loading) {
            return renderLoadingPanel('正在整理改写记录...');
        }

        const enabledContacts = getEnabledContacts();
        const recon = state.data && state.data.recon && typeof state.data.recon === 'object' ? state.data.recon : {};
        const dashboard = recon.dashboard && typeof recon.dashboard === 'object' ? recon.dashboard : {};
        const memories = Array.isArray(recon.memories) ? recon.memories : [];
        const eventRecordsById = recon.eventRecordsById && typeof recon.eventRecordsById === 'object' ? recon.eventRecordsById : {};
        const eventItems = buildListDisplayItems(memories, {
            recordType: 'event',
            eventRecordsById: eventRecordsById
        });
        const replayBuckets = deriveReconReplayBuckets(memories, eventItems);
        const accepted = replayBuckets.accepted;
        const rejected = replayBuckets.rejected;
        const manual = replayBuckets.manual;
        const eventRefresh = replayBuckets.eventRefresh;
        const hotspots = replayBuckets.hotspots;
        const totalCount = Math.max(0, Number(dashboard.total_count || 0));
        const unresolvedCount = Math.max(0, Number(dashboard.unresolved_count || 0));
        const eventBatchCount = accepted.filter(function countEventBatch(entry) {
            const latestScope = toTrimmedString(entry && entry.latestRewrite && entry.latestRewrite.scope).toLowerCase();
            return latestScope === 'event_batch';
        }).length;

        const acceptedHtml = accepted.length > 0
            ? accepted.slice(0, 5).map(function renderAccepted(entry) {
                return renderMemoryCard(entry.memory);
            }).join('')
            : '<div class="hip-empty">最近抽样里还没有成功改写过的条目。</div>';
        const rejectedHtml = rejected.length > 0
            ? rejected.slice(0, 5).map(function renderRejected(entry) {
                return renderMemoryCard(entry.memory);
            }).join('')
            : '<div class="hip-empty">最近抽样里还没有被护栏拦下的改写条目。</div>';
        const eventRefreshHtml = eventRefresh.length > 0
            ? eventRefresh.slice(0, 4).map(function renderEventRefresh(entry) {
                return renderEventCard(entry.eventItem);
            }).join('')
            : '<div class="hip-empty">最近抽样里还没有“改写后顺带刷新事件摘要”的情况。</div>';
        const manualRowsHtml = renderAuditCompactRows(
            manual.slice(0, 6).map(function mapManualRow(entry) {
                const snapshot = entry && entry.snapshot ? entry.snapshot : {};
                const strategyLabel = humanizeReconsolidationMode(snapshot.strategy) || toTrimmedString(snapshot.strategy) || '未记录策略';
                const roleLabel = humanizeReconsolidationTargetRole(snapshot.targetRole) || toTrimmedString(snapshot.targetRole);
                const scopeLabel = humanizeReconsolidationScope(snapshot.scope) || toTrimmedString(snapshot.scope);
                const statusLabel = snapshot.status === 'accepted' ? '最近一次已改写' : '最近一次被护栏拦下';
                return {
                    title: summarizeContent(toTrimmedString(entry && entry.memory && entry.memory.content) || '未命名记忆', 48),
                    meta: [
                        formatDateTime(snapshot.checkedAt || ''),
                        entry.rewriteCount > 0 ? `改写 ${Math.max(0, Number(entry.rewriteCount || 0))} 次` : '',
                        entry.guardCount > 0 ? `被拦 ${Math.max(0, Number(entry.guardCount || 0))} 次` : ''
                    ].filter(Boolean),
                    body: [statusLabel, strategyLabel, roleLabel, scopeLabel].filter(Boolean).join(' · ')
                };
            }),
            '最近抽样里还没有明显保留“这是你手动点过的”痕迹。'
        );
        const hotspotRowsHtml = renderAuditCompactRows(
            hotspots.slice(0, 6).map(function mapHotspotRow(entry) {
                return {
                    title: summarizeContent(toTrimmedString(entry && entry.memory && entry.memory.content) || '未命名记忆', 52),
                    meta: [
                        `触碰 ${Math.max(0, Number(entry && entry.totalTouchCount || 0))} 次`,
                        entry && entry.rewriteCount > 0 ? `改写 ${Math.max(0, Number(entry.rewriteCount || 0))}` : '',
                        entry && entry.guardCount > 0 ? `被拦 ${Math.max(0, Number(entry.guardCount || 0))}` : ''
                    ].filter(Boolean),
                    body: [
                        formatDateTime(entry && entry.snapshot && entry.snapshot.checkedAt),
                        humanizeReconsolidationMode(entry && entry.snapshot && entry.snapshot.strategy) || toTrimmedString(entry && entry.snapshot && entry.snapshot.strategy),
                        humanizeReconsolidationTargetRole(entry && entry.snapshot && entry.snapshot.targetRole) || toTrimmedString(entry && entry.snapshot && entry.snapshot.targetRole)
                    ].filter(Boolean).join(' · ')
                };
            }),
            '最近抽样里还没有反复被改写或拦截的热点对象。'
        );

        return `
            <section class="hip-panel-wrapper">
                <div class="hip-toolbar">
                    <select id="hip-admin-char-select" class="hip-select-block">
                        ${renderContactOptions(enabledContacts, state.filters.charId)}
                    </select>
                    <button type="button" class="hip-icon-btn" data-hip-action="refresh-tab" aria-label="刷新改写记录页">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.58m15.36 2A8 8 0 004.58 9m0 0H9m11 11v-5h-.58m0 0a8 8 0 01-15.36-2m15.36 2H15"></path>
                        </svg>
                    </button>
                </div>

                <div class="hip-glass-panel hip-audit-section-card">
                    <div class="hip-box-header">
                        <h3>这页在看什么</h3>
                        <div style="display:flex; gap:8px; flex-wrap:wrap;">
                            <button type="button" class="hip-btn-outline hip-btn-inline" data-hip-action="switch-tab" data-tab="audit">去线索排查</button>
                            <button type="button" class="hip-btn-outline hip-btn-inline" data-hip-action="switch-tab" data-tab="list">去所有记忆细看</button>
                        </div>
                    </div>
                    <div class="hip-box-hint">这里专门把“改写后到底改了什么、被什么拦下、事件有没有被顺手刷新”集中展开。它看的仍是最近活跃样本，不是全库回放，但比散落在卡片里的提示更适合集中复盘。</div>
                    <div class="hip-audit-summary-grid">
                        ${renderAuditSummaryCard('样本总量', totalCount, '当前角色在抽样范围内的记忆总数', 'neutral')}
                        ${renderAuditSummaryCard('成功改写', accepted.length, '最近确实留下“改写前 -> 改写后”痕迹的碎片', accepted.length > 0 ? 'info' : 'neutral')}
                        ${renderAuditSummaryCard('护栏拦下', rejected.length, '最近被改写护栏拒绝自动改写的对象', rejected.length > 0 ? 'danger' : 'neutral')}
                        ${renderAuditSummaryCard('事件刷新', eventRefresh.length, '因为改写而顺带刷新过事件摘要的事件', eventRefresh.length > 0 ? 'info' : 'neutral')}
                        ${renderAuditSummaryCard('整件事一起改', eventBatchCount, '最近成功改写里属于整事件批量处理的对象', eventBatchCount > 0 ? 'warn' : 'neutral')}
                        ${renderAuditSummaryCard('手动点过的记录', manual.length, '最近仍保留“这是你手动触发过”的痕迹', manual.length > 0 ? 'warn' : 'neutral')}
                        ${renderAuditSummaryCard('反复触碰热点', hotspots.length, '多次被改写/拦截，适合重点人工复盘', hotspots.length > 0 ? 'warn' : 'neutral')}
                        ${renderAuditSummaryCard('未了结总量', unresolvedCount, '帮助判断这些改写是否还在影响当前判断', unresolvedCount > 0 ? 'warn' : 'neutral')}
                    </div>
                </div>

                <div class="hip-glass-panel hip-audit-section-card">
                    <div class="hip-box-header">
                        <h3>手动触发痕迹</h3>
                    </div>
                    <div class="hip-box-hint">这里优先看最近仍保留“这是你手动点过的”痕迹的对象，方便回看那次手动操作后来有没有真的写回去。</div>
                    <div class="hip-list-inline-actions">
                        ${renderListFocusActionButton('recon', 'manual', '查看完整样本', manual.length)}
                    </div>
                    ${manualRowsHtml}
                </div>

                <div class="hip-glass-panel hip-audit-section-card">
                    <div class="hip-box-header">
                        <h3>反复触碰的热点对象</h3>
                    </div>
                    <div class="hip-box-hint">如果同一条记忆连续被改写、又被拦下，通常代表提示、护栏或事件上下文还值得继续看。</div>
                    <div class="hip-list-inline-actions">
                        ${renderListFocusActionButton('recon', 'hotspots', '查看完整样本', hotspots.length)}
                    </div>
                    ${hotspotRowsHtml}
                </div>

                <div class="hip-glass-panel hip-audit-section-card">
                    <div class="hip-box-header">
                        <h3>最近成功改写的碎片</h3>
                    </div>
                    <div class="hip-box-hint">这些卡片会直接展开“这条记忆最近被怎么改过”，让你能看到改写前后差异，而不是只看一句“已改写”。</div>
                    <div class="hip-card-list">
                        <div class="hip-list-inline-actions">
                            ${renderListFocusActionButton('recon', 'accepted', '查看完整样本', accepted.length)}
                        </div>
                        ${acceptedHtml}
                    </div>
                </div>

                <div class="hip-glass-panel hip-audit-section-card">
                    <div class="hip-box-header">
                        <h3>最近被护栏拦下的碎片</h3>
                    </div>
                    <div class="hip-box-hint">这里用来判断是护栏太严，还是改写结果真的有事实漂移风险。卡片里会带上被拦原因、关键词覆盖、长度比等痕迹。</div>
                    <div class="hip-card-list">
                        <div class="hip-list-inline-actions">
                            ${renderListFocusActionButton('recon', 'rejected', '查看完整样本', rejected.length)}
                        </div>
                        ${rejectedHtml}
                    </div>
                </div>

                <div class="hip-glass-panel hip-audit-section-card">
                    <div class="hip-box-header">
                        <h3>整事件回写与版本差异</h3>
                    </div>
                    <div class="hip-box-hint">这批事件最近至少有一次“改写后顺手刷新事件摘要”。展开卡片后可以直接看这件事最近具体改了哪些字段。</div>
                    <div class="hip-card-list">
                        <div class="hip-list-inline-actions">
                            ${renderListFocusActionButton('recon', 'event_refresh', '查看完整样本', eventRefresh.length)}
                        </div>
                        ${eventRefreshHtml}
                    </div>
                </div>
            </section>
        `;
    }

    function renderDiagnosticsPanelLegacy() {
        return renderDiagnosticsPanel();
    }

    function renderDiagnosticsPanel() {
        if (state.loading) {
            return renderLoadingPanel('正在整理风险总览...');
        }

        const enabledContacts = getEnabledContacts();
        const diagnostics = state.data && state.data.diagnostics && typeof state.data.diagnostics === 'object' ? state.data.diagnostics : {};
        const dashboard = diagnostics.dashboard && typeof diagnostics.dashboard === 'object' ? diagnostics.dashboard : {};
        const memories = Array.isArray(diagnostics.memories) ? diagnostics.memories : [];
        const directEventItems = buildDirectEventDisplayItems(diagnostics.eventRecords);
        const failures = Array.isArray(diagnostics.dehydrateFailures) ? diagnostics.dehydrateFailures : [];
        const digestOutcomes = Array.isArray(diagnostics.digestOutcomes) ? diagnostics.digestOutcomes : [];
        const eventRecordsById = diagnostics.eventRecordsById && typeof diagnostics.eventRecordsById === 'object' ? diagnostics.eventRecordsById : {};
        const eventItems = buildListDisplayItems(memories, {
            recordType: 'event',
            eventRecordsById: eventRecordsById
        });
        const buckets = deriveDiagnosticBuckets(memories, eventItems, failures, digestOutcomes, directEventItems);
        const totalCount = Math.max(0, Number(dashboard.total_count || 0));
        const unresolvedCount = Math.max(0, Number(dashboard.unresolved_count || 0));
        const largeEventsHtml = buckets.largeEvents.length > 0
            ? buckets.largeEvents.slice(0, 4).map(function renderLargeEvent(item) { return renderEventCard(item); }).join('')
            : '<div class="hip-empty">最近样本里没有成员特别多的事件。</div>';
        const crowdedUnresolvedHtml = buckets.crowdedUnresolved.length > 0
            ? buckets.crowdedUnresolved.slice(0, 4).map(function renderCrowdedEvent(item) { return renderEventCard(item); }).join('')
            : '<div class="hip-empty">最近样本里没有“未了结且成员过多”的事件。</div>';
        const groundingEventsHtml = buckets.groundingEvents.length > 0
            ? buckets.groundingEvents.slice(0, 4).map(function renderGroundingEvent(entry) { return renderEventCard(entry.eventItem); }).join('')
            : '<div class="hip-empty">最近样本里没有明显原话支撑风险事件。</div>';
        const hotspotRowsHtml = renderAuditCompactRows(
            buckets.reconHotspots.slice(0, 6).map(function mapHotspot(entry) {
                return {
                    title: summarizeContent(toTrimmedString(entry && entry.memory && entry.memory.content) || '未命名记忆', 52),
                    meta: [
                        `触碰 ${Math.max(0, Number(entry && entry.totalTouchCount || 0))} 次`,
                        entry && entry.rewriteCount > 0 ? `改写 ${Math.max(0, Number(entry.rewriteCount || 0))}` : '',
                        entry && entry.guardCount > 0 ? `被拦 ${Math.max(0, Number(entry.guardCount || 0))}` : ''
                    ].filter(Boolean),
                    body: [
                        formatDateTime(entry && entry.snapshot && entry.snapshot.checkedAt),
                        humanizeReconsolidationMode(entry && entry.snapshot && entry.snapshot.strategy) || toTrimmedString(entry && entry.snapshot && entry.snapshot.strategy),
                        humanizeReconsolidationTargetRole(entry && entry.snapshot && entry.snapshot.targetRole) || toTrimmedString(entry && entry.snapshot && entry.snapshot.targetRole)
                    ].filter(Boolean).join(' · ')
                };
            }),
            '最近样本里没有反复变动的热点条目。'
        );
        const retiredEventRowsHtml = renderAuditCompactRows(
            buckets.retiredEvents.slice(0, 6).map(function mapRetiredEvent(item) {
                return buildEventLifecycleAuditRow(item);
            }),
            '最近没有新的退役事件。'
        );
        const lifecycleChurnRowsHtml = renderAuditCompactRows(
            buckets.lifecycleChurn.slice(0, 6).map(function mapLifecycleEntry(entry) {
                return buildEventLifecycleAuditRow(entry && entry.eventItem, [
                    entry && entry.churnScore > 0 ? `抖动 ${Math.max(0, Number(entry.churnScore || 0))}` : ''
                ]);
            }),
            '最近没有明显来回变动的事件。'
        );
        const failureRowsHtml = renderAuditCompactRows(
            buckets.failures.slice(0, 5).map(function mapFailure(item) { return buildDehydrateFailureAuditRow(item); }),
            '最近没有脱水失败任务。'
        );
        const digestRowsHtml = renderAuditCompactRows(
            buckets.digestOutliers.slice(0, 5).map(function mapDigest(item) {
                const assigned = Math.max(0, Number(item && (item.assignedFragmentCount || item.assigned_fragment_count) || 0));
                const eventized = Math.max(0, Number(item && (item.eventizedCount || item.eventized_count) || 0));
                const orphan = Math.max(0, Number(item && (item.orphanFragmentCount || item.orphan_fragment_count) || 0));
                const reasons = [];
                if (assigned >= DIAGNOSTIC_DIGEST_ASSIGNED_THRESHOLD) reasons.push(`并入 ${assigned} 条碎片`);
                if (eventized >= DIAGNOSTIC_DIGEST_EVENTIZED_THRESHOLD) reasons.push(`新建 ${eventized} 个事件`);
                if (orphan >= DIAGNOSTIC_DIGEST_ORPHAN_THRESHOLD) reasons.push(`遗留 ${orphan} 条孤片`);
                const baseRow = buildDigestOutcomeAuditRow(item);
                return { title: baseRow.title, meta: baseRow.meta.concat(reasons), body: baseRow.body };
            }),
            '最近 72 小时没有明显的单轮整理过载记录。'
        );

        return `
            <section class="hip-panel-wrapper">
                <div class="hip-toolbar">
                    <select id="hip-admin-char-select" class="hip-select-block">
                        ${renderContactOptions(enabledContacts, state.filters.charId)}
                    </select>
                    <button type="button" class="hip-icon-btn" data-hip-action="refresh-tab" aria-label="刷新风险总览页">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.58m15.36 2A8 8 0 004.58 9m0 0H9m11 11v-5h-.58m0 0a8 8 0 01-15.36-2m15.36 2H15"></path>
                        </svg>
                    </button>
                </div>

                <div class="hip-glass-panel hip-audit-section-card">
                    <div class="hip-box-header">
                        <h3>这页在看什么</h3>
                        <div style="display:flex; gap:8px; flex-wrap:wrap;">
                            <button type="button" class="hip-btn-outline hip-btn-inline" data-hip-action="switch-tab" data-tab="recon">去改写记录</button>
                            <button type="button" class="hip-btn-outline hip-btn-inline" data-hip-action="switch-tab" data-tab="audit">去线索排查</button>
                            <button type="button" class="hip-btn-outline hip-btn-inline" data-hip-action="switch-tab" data-tab="list">去所有记忆</button>
                            <button type="button" class="hip-btn-outline hip-btn-inline" data-hip-action="switch-tab" data-tab="export">去记忆保管箱</button>
                        </div>
                    </div>
                    <div class="hip-box-hint">这里把“超大事件、整理过载、原话支撑偏弱、改写热点、后台失败”集中到一页，方便你先判断该看哪一块，而不是一上来就扫全库。</div>
                    <div class="hip-audit-summary-grid">
                        ${renderAuditSummaryCard('样本总量', totalCount, '当前角色在抽样范围内的记忆总数', 'neutral')}
                        ${renderAuditSummaryCard('未了结总量', unresolvedCount, '帮助判断当前压力是否还在持续', unresolvedCount > 0 ? 'warn' : 'neutral')}
                        ${renderAuditSummaryCard('超大事件簇', buckets.largeEvents.length, `成员数 >= ${DIAGNOSTIC_LARGE_EVENT_THRESHOLD} 的事件`, buckets.largeEvents.length > 0 ? 'danger' : 'neutral')}
                        ${renderAuditSummaryCard('未了结且拥挤', buckets.crowdedUnresolved.length, `未了结且成员数 >= ${DIAGNOSTIC_CROWDED_UNRESOLVED_THRESHOLD} 的事件`, buckets.crowdedUnresolved.length > 0 ? 'warn' : 'neutral')}
                        ${renderAuditSummaryCard('原话支撑风险事件', buckets.groundingEvents.length, '整件事或成员对原聊天支撑偏弱', buckets.groundingEvents.length > 0 ? 'warn' : 'neutral')}
                        ${renderAuditSummaryCard('改写热点', buckets.reconHotspots.length, '反复被改写或拦截的对象', buckets.reconHotspots.length > 0 ? 'warn' : 'neutral')}
                        ${renderAuditSummaryCard('退役事件', buckets.retiredEvents.length, '已经退出主线、但仍需保留轨迹的历史事件', 'neutral')}
                        ${renderAuditSummaryCard('来回变动', buckets.lifecycleChurn.length, '留痕、人工保护或退役变化偏多的事件', buckets.lifecycleChurn.length > 0 ? 'warn' : 'neutral')}
                        ${renderAuditSummaryCard('单轮整理过载', buckets.digestOutliers.length, '并入过多、事件化过多或孤片偏多的整理结果', buckets.digestOutliers.length > 0 ? 'danger' : 'neutral')}
                        ${renderAuditSummaryCard('脱水失败', buckets.failures.length, '需要重试或复盘的后台任务', buckets.failures.length > 0 ? 'danger' : 'neutral')}
                    </div>
                </div>

                <div class="hip-glass-panel hip-audit-section-card">
                    <div class="hip-box-header"><h3>超大事件簇</h3></div>
                    <div class="hip-box-hint">如果一件事挂了太多成员，往往意味着 digest 合并过宽，或者旧记忆又被重新吸回来了。</div>
                    <div class="hip-card-list">
                        <div class="hip-list-inline-actions">${renderListFocusActionButton('diagnostics', 'large_events', '查看完整样本', buckets.largeEvents.length)}</div>
                        ${largeEventsHtml}
                    </div>
                </div>

                <div class="hip-glass-panel hip-audit-section-card">
                    <div class="hip-box-header"><h3>未了结且拥挤的事件</h3></div>
                    <div class="hip-box-hint">这类事件既没解决，又挂着较多成员，最适合优先人工复看。</div>
                    <div class="hip-card-list">
                        <div class="hip-list-inline-actions">${renderListFocusActionButton('diagnostics', 'crowded_unresolved', '查看完整样本', buckets.crowdedUnresolved.length)}</div>
                        ${crowdedUnresolvedHtml}
                    </div>
                </div>

                <div class="hip-glass-panel hip-audit-section-card">
                    <div class="hip-box-header"><h3>原话支撑风险事件</h3></div>
                    <div class="hip-box-hint">不是所有原话支撑异常都会立刻出错，但这批事件最容易在后续改写或事件直出时发生变形。</div>
                    <div class="hip-card-list">
                        <div class="hip-list-inline-actions">${renderListFocusActionButton('diagnostics', 'grounding_events', '查看完整样本', buckets.groundingEvents.length)}</div>
                        ${groundingEventsHtml}
                    </div>
                </div>

                ${renderDigestStabilityDiagnosticsSection(buckets)}

                <div class="hip-glass-panel hip-audit-section-card">
                    <div class="hip-box-header"><h3>反复变动热点</h3></div>
                    <div class="hip-box-hint">同一条记忆连续被改写或拦下，通常就是值得优先排查的热点对象。</div>
                    <div class="hip-list-inline-actions">${renderListFocusActionButton('diagnostics', 'recon_hotspots', '查看完整样本', buckets.reconHotspots.length)}</div>
                    ${hotspotRowsHtml}
                </div>

                <div class="hip-glass-panel hip-audit-section-card">
                    <div class="hip-box-header"><h3>退役事件轨迹</h3></div>
                    <div class="hip-box-hint">这里看已经退役的事件为什么退出主线、是否被其他事件接替，以及退役前大概挂了多少成员。</div>
                    <div class="hip-list-inline-actions">${renderListFocusActionButton('diagnostics', 'retired_events', '查看完整样本', buckets.retiredEvents.length)}</div>
                    ${retiredEventRowsHtml}
                </div>

                <div class="hip-glass-panel hip-audit-section-card">
                    <div class="hip-box-header"><h3>来回变动的事件</h3></div>
                    <div class="hip-box-hint">如果一个事件留痕很多、人工保护很多，或者刚刚退役，通常说明它的边界还不够稳，值得单独复看。</div>
                    <div class="hip-list-inline-actions">${renderListFocusActionButton('diagnostics', 'lifecycle_churn', '查看完整样本', buckets.lifecycleChurn.length)}</div>
                    ${lifecycleChurnRowsHtml}
                </div>

                <div class="hip-glass-panel hip-audit-section-card">
                    <div class="hip-box-header">
                        <h3>单轮整理过载线索</h3>
                        <button type="button" class="hip-btn-outline hip-btn-inline" data-hip-action="switch-tab" data-tab="export">去记忆保管箱</button>
                    </div>
                    <div class="hip-box-hint">当单轮整理吸进过多碎片、新建过多事件或留下很多孤片时，后面就很容易出现“这一轮吃太多”的问题。</div>
                    ${digestRowsHtml}
                </div>

                <div class="hip-glass-panel hip-audit-section-card">
                    <div class="hip-box-header">
                        <h3>脱水失败任务</h3>
                        <button type="button" class="hip-btn-outline hip-btn-inline" data-hip-action="switch-tab" data-tab="export">去记忆保管箱</button>
                    </div>
                    <div class="hip-box-hint">这里专门看会直接卡住后台链路的硬错误。手动重试和删除入口仍在记忆保管箱页。</div>
                    ${failureRowsHtml}
                </div>
            </section>
        `;
    }

    function formatRelationshipArcUpdateMode(mode) {
        const safeMode = toTrimmedString(mode).toLowerCase();
        if (safeMode === 'compression') return '精炼压缩';
        if (safeMode === 'revision') return '手动修订';
        if (safeMode === 'tail_update') return '更新最近阶段';
        if (safeMode === 'manual_import') return '手动导入';
        if (safeMode === 'auto_full_rebuild') return '自动重建';
        return '整条重建';
    }

    function buildRelationshipArcMetaLine(record) {
        const safeRecord = record && typeof record === 'object' ? record : null;
        if (!safeRecord) return '';
        const parts = [];
        if (safeRecord.generatedAt) parts.push(formatDateTime(safeRecord.generatedAt));
        if (safeRecord.currentStage && safeRecord.currentStage.title) parts.push(`当前阶段：${safeRecord.currentStage.title}`);
        if (Array.isArray(safeRecord.stages) && safeRecord.stages.length > 0) parts.push(`阶段 ${safeRecord.stages.length}`);
        if (safeRecord.sourceSummary && (safeRecord.sourceSummary.sourceEventCount > 0 || safeRecord.sourceSummary.sourceFragmentCount > 0)) {
            parts.push(`事件 ${safeRecord.sourceSummary.sourceEventCount} / 碎片 ${safeRecord.sourceSummary.sourceFragmentCount}`);
        }
        return parts.join(' · ');
    }

    function renderRelationshipArcStageOverviewPanel(stages, currentStageNumber) {
        const safeStages = Array.isArray(stages) ? stages.filter(Boolean) : [];
        if (safeStages.length <= 0) return '';
        const currentNumber = Math.max(1, Math.floor(Number(currentStageNumber || 1) || 1));
        return `
            <section class="hip-glass-panel" style="padding:18px 20px;">
                <div class="hip-box-header">
                    <h3 style="font-size:16px;">阶段速览</h3>
                    <div class="hip-box-hint">先看整体脉络，再往下读每个阶段的细节。</div>
                </div>
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-top:14px;">
                    ${safeStages.map(function renderStageChip(stage) {
                        const stageNumber = Math.max(1, Math.floor(Number(stage && stage.stage || 1) || 1));
                        const keyEventCount = Array.isArray(stage && stage.keyEvents) ? stage.keyEvents.length : 0;
                        const isCurrent = stageNumber === currentNumber;
                        return `
                            <div style="padding:14px 15px;border-radius:16px;border:1px solid ${isCurrent ? 'rgba(96,165,250,0.42)' : 'rgba(255,255,255,0.08)'};background:${isCurrent ? 'rgba(59,130,246,0.10)' : 'rgba(255,255,255,0.04)'};">
                                <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
                                    <div style="font-size:12px;color:${isCurrent ? '#bfdbfe' : 'rgba(255,255,255,0.55)'};">阶段 ${stageNumber}</div>
                                    ${isCurrent ? '<div style="font-size:12px;color:#bfdbfe;">当前所在</div>' : ''}
                                </div>
                                <div style="margin-top:8px;font-size:15px;font-weight:600;color:rgba(255,255,255,0.92);line-height:1.5;">${escapeHtml(toTrimmedString(stage && stage.title) || `阶段 ${stageNumber}`)}</div>
                                ${toTrimmedString(stage && stage.period) ? `<div style="margin-top:6px;font-size:12px;color:rgba(255,255,255,0.58);">${escapeHtml(toTrimmedString(stage.period))}</div>` : ''}
                                <div style="margin-top:10px;font-size:12px;color:rgba(255,255,255,0.68);">关键事件 ${keyEventCount} 条</div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </section>
        `;
    }

    function renderRelationshipArcStageCard(stage) {
        const safeStage = stage && typeof stage === 'object' ? stage : null;
        if (!safeStage) return '';
        const badges = [
            renderNotebookBadge(`阶段 ${Math.max(1, Number(safeStage.stage || 1))}`, '#dbeafe', 'rgba(96, 165, 250, 0.12)')
        ];
        if (safeStage.period) badges.push(renderNotebookBadge(safeStage.period, '#fde68a', 'rgba(245, 158, 11, 0.12)'));
        if (Number.isFinite(safeStage.confidence)) {
            badges.push(renderNotebookBadge(`置信 ${(Math.max(0, Math.min(1, Number(safeStage.confidence))) * 100).toFixed(0)}%`, '#c4b5fd', 'rgba(139, 92, 246, 0.14)'));
        }
        const keyEventsHtml = safeStage.keyEvents.length > 0
            ? safeStage.keyEvents.map(function renderKeyEvent(item) {
                const metaParts = [];
                if (item.date) metaParts.push(item.date);
                if (item.theme) metaParts.push(item.theme);
                if (item.evidenceEventIds.length > 0) metaParts.push(`事件证据 ${item.evidenceEventIds.length}`);
                if (item.evidenceFragmentIds.length > 0) metaParts.push(`碎片证据 ${item.evidenceFragmentIds.length}`);
                return `
                    <div style="padding:12px 14px;border-radius:14px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);">
                        <div style="font-size:12px;color:rgba(255,255,255,0.52);">${escapeHtml(metaParts.join(' · '))}</div>
                        <div style="margin-top:6px;font-size:14px;color:rgba(255,255,255,0.92);line-height:1.75;">${escapeHtml(item.summary || '（暂无摘要）')}</div>
                        ${item.impact ? `<div style="margin-top:8px;font-size:12px;color:rgba(255,255,255,0.6);">长期影响：${escapeHtml(item.impact)}</div>` : ''}
                    </div>
                `;
            }).join('')
            : '<div class="hip-empty hip-empty-compact">这一阶段还没有整理出关键事件。</div>';

        return `
            <section class="hip-glass-panel" style="padding:18px 20px;">
                <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;">
                    <div style="flex:1;min-width:240px;">
                        <div style="font-size:17px;font-weight:600;color:rgba(255,255,255,0.94);">${escapeHtml(safeStage.title || `阶段 ${safeStage.stage}`)}</div>
                        ${safeStage.relationshipShift ? `<div style="margin-top:8px;font-size:13px;color:rgba(255,255,255,0.68);line-height:1.7;">${escapeHtml(safeStage.relationshipShift)}</div>` : ''}
                    </div>
                    <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;">${badges.join('')}</div>
                </div>
                <div style="display:grid;gap:10px;margin-top:16px;">${keyEventsHtml}</div>
                ${renderRelationshipArcListBlock('这一阶段里仍在延续的线索', safeStage.ongoingThreads)}
                ${safeStage.injectSummary ? `<div class="hip-box-hint" style="margin-top:12px;">主聊天速记：${escapeHtml(safeStage.injectSummary)}</div>` : ''}
            </section>
        `;
    }

    function formatRelationshipArcSourceOriginLabel(value) {
        const safeValue = toTrimmedString(value).toLowerCase();
        if (safeValue === 'manual_import') return '手动贴入旧记忆';
        if (safeValue === 'prior_arc') return '上一版关系脉络';
        if (safeValue === 'event_table') return '记忆事件';
        if (safeValue === 'high_weight_fragments') return '高权重碎片';
        if (safeValue === 'legacy_yaml') return '旧版 YAML 记忆';
        if (safeValue === 'new_events') return '最近新增事件';
        if (safeValue === 'compressed_arc') return '精炼压缩';
        if (safeValue === 'manual_edit') return '手动编辑';
        return toTrimmedString(value);
    }

    function formatRelationshipArcRevisionNote(value) {
        const safeValue = toTrimmedString(value).toLowerCase();
        if (safeValue === 'manual_import_structure_preserved') return '导入时保留了旧脉络的阶段骨架';
        if (safeValue === 'prompt_rebuilt_from_stages') return '主聊天正文已按阶段自动重组';
        if (safeValue === 'relationship_arc_compressed') return '已做精炼压缩';
        if (safeValue === 'relationship_arc_manually_edited') return '用户手动编辑过正文';
        return toTrimmedString(value);
    }

    function summarizeRelationshipArcListDiff(label, currentList, compareList) {
        const current = normalizeTextArray(currentList, 12);
        const compare = normalizeTextArray(compareList, 12);
        const added = current.filter(function filterItem(item) {
            return !compare.includes(item);
        }).slice(0, 3);
        const removed = compare.filter(function filterItem(item) {
            return !current.includes(item);
        }).slice(0, 3);
        if (added.length <= 0 && removed.length <= 0) return '';
        const parts = [];
        if (added.length > 0) parts.push(`新增：${added.join(' / ')}`);
        if (removed.length > 0) parts.push(`移除：${removed.join(' / ')}`);
        return `${label}（${parts.join('；')}）`;
    }

    function buildRelationshipArcCompareDiffLines(current, compare) {
        const safeCurrent = current && typeof current === 'object' ? current : null;
        const safeCompare = compare && typeof compare === 'object' ? compare : null;
        if (!safeCurrent || !safeCompare) return [];
        const currentStats = buildRelationshipArcVersionStats(safeCurrent);
        const compareStats = buildRelationshipArcVersionStats(safeCompare);
        const lines = [];
        if (safeCurrent.versionNumber !== safeCompare.versionNumber) lines.push(`版本：v${safeCompare.versionNumber} -> v${safeCurrent.versionNumber}`);
        if (compareStats.stageCount !== currentStats.stageCount) lines.push(`阶段数：${compareStats.stageCount} -> ${currentStats.stageCount}`);
        if (compareStats.keyEventCount !== currentStats.keyEventCount) lines.push(`关键事件：${compareStats.keyEventCount} -> ${currentStats.keyEventCount}`);
        if (compareStats.datedKeyEventCount !== currentStats.datedKeyEventCount) lines.push(`带日期事件：${compareStats.datedKeyEventCount} -> ${currentStats.datedKeyEventCount}`);
        if (toTrimmedString(safeCompare.currentStage && safeCompare.currentStage.title) !== toTrimmedString(safeCurrent.currentStage && safeCurrent.currentStage.title)) {
            lines.push(`当前阶段：${toTrimmedString(safeCompare.currentStage && safeCompare.currentStage.title) || '无'} -> ${toTrimmedString(safeCurrent.currentStage && safeCurrent.currentStage.title) || '无'}`);
        }
        const newlyAddedStages = (Array.isArray(safeCurrent.stages) ? safeCurrent.stages : []).slice(compareStats.stageCount).map(function mapStage(stage) {
            return toTrimmedString(stage && stage.title) || `阶段 ${Math.max(1, Math.floor(Number(stage && stage.stage) || 1))}`;
        }).filter(Boolean);
        if (newlyAddedStages.length > 0) lines.push(`新增阶段：${newlyAddedStages.join(' / ')}`);
        const currentLastStage = Array.isArray(safeCurrent.stages) && safeCurrent.stages.length > 0 ? safeCurrent.stages[safeCurrent.stages.length - 1] : null;
        const compareLastStage = Array.isArray(safeCompare.stages) && safeCompare.stages.length > 0 ? safeCompare.stages[safeCompare.stages.length - 1] : null;
        if (currentLastStage && compareLastStage && toTrimmedString(currentLastStage.title) === toTrimmedString(compareLastStage.title) && (currentLastStage.keyEvents || []).length !== (compareLastStage.keyEvents || []).length) {
            lines.push(`最近阶段补充事件：${(compareLastStage.keyEvents || []).length} -> ${(currentLastStage.keyEvents || []).length}`);
        }
        if (toTrimmedString(safeCompare.currentRelationshipState && safeCompare.currentRelationshipState.oneParagraphSummary) !== toTrimmedString(safeCurrent.currentRelationshipState && safeCurrent.currentRelationshipState.oneParagraphSummary)) {
            lines.push('当前关系状态摘要有变化');
        }
        [
            summarizeRelationshipArcListDiff('持续线索', safeCurrent.currentRelationshipState && safeCurrent.currentRelationshipState.activeThreads, safeCompare.currentRelationshipState && safeCompare.currentRelationshipState.activeThreads),
            summarizeRelationshipArcListDiff('未解张力', safeCurrent.currentRelationshipState && safeCurrent.currentRelationshipState.unresolvedTensions, safeCompare.currentRelationshipState && safeCompare.currentRelationshipState.unresolvedTensions),
            summarizeRelationshipArcListDiff('稳定纽带', safeCurrent.currentRelationshipState && safeCurrent.currentRelationshipState.stableBonds, safeCompare.currentRelationshipState && safeCompare.currentRelationshipState.stableBonds),
            summarizeRelationshipArcListDiff('共同方向', safeCurrent.currentRelationshipState && safeCurrent.currentRelationshipState.sharedDirection, safeCompare.currentRelationshipState && safeCompare.currentRelationshipState.sharedDirection)
        ].filter(Boolean).forEach(function appendLine(line) {
            lines.push(line);
        });
        if (compareStats.promptLineCount !== currentStats.promptLineCount) lines.push(`注入长度：${compareStats.promptLineCount} 行 -> ${currentStats.promptLineCount} 行`);
        if (safeCompare.updateMode !== safeCurrent.updateMode) {
            lines.push(`更新方式：${formatRelationshipArcUpdateMode(safeCompare.updateMode)} -> ${formatRelationshipArcUpdateMode(safeCurrent.updateMode)}`);
        }
        return lines;
    }

    function renderRelationshipArcComparePanel(current, compare) {
        const safeCurrent = current && typeof current === 'object' ? current : null;
        const safeCompare = compare && typeof compare === 'object' ? compare : null;
        if (!safeCurrent || !safeCompare || safeCurrent.id === safeCompare.id) return '';
        const diffLines = buildRelationshipArcCompareDiffLines(safeCurrent, safeCompare);
        const currentRevisionNotes = formatRelationshipArcRevisionNotes(safeCurrent.revisionNotes);
        const compareRevisionNotes = formatRelationshipArcRevisionNotes(safeCompare.revisionNotes);
        return `
            <section class="hip-glass-panel" style="padding:18px 20px;">
                <div class="hip-box-header">
                    <h3 style="font-size:16px;">这版和当前差在哪</h3>
                    <div class="hip-box-hint">这里会把当前生效版本和你选中的旧版本做一个一眼能看懂的对比。</div>
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;">
                    ${renderNotebookBadge(`当前 v${safeCurrent.versionNumber}`, '#bbf7d0', 'rgba(34,197,94,0.14)')}
                    ${renderNotebookBadge(`对比 v${safeCompare.versionNumber}`, '#fde68a', 'rgba(245,158,11,0.14)')}
                </div>
                <div style="margin-top:14px;font-size:13px;line-height:1.8;color:rgba(255,255,255,0.72);">
                    ${diffLines.length > 0 ? diffLines.map(function mapLine(line) { return `- ${escapeHtml(line)}`; }).join('<br>') : '两版结构几乎一致，主要可能只是措辞微调。'}
                </div>
                ${currentRevisionNotes.length > 0 ? `<div class="hip-box-hint" style="margin-top:12px;">当前版修订说明：${escapeHtml(currentRevisionNotes.join(' / '))}</div>` : ''}
                ${compareRevisionNotes.length > 0 ? `<div class="hip-box-hint" style="margin-top:8px;">历史版修订说明：${escapeHtml(compareRevisionNotes.join(' / '))}</div>` : ''}
            </section>
        `;
    }

    function renderRelationshipArcVersionCard(version, currentVersionId, compareVersionId, busy) {
        const safeVersion = version && typeof version === 'object' ? version : null;
        if (!safeVersion) return '';
        const versionId = toTrimmedString(safeVersion.id || safeVersion.versionId);
        const isCurrent = safeVersion.isCurrent || versionId === toTrimmedString(currentVersionId);
        const isCompared = versionId && versionId === toTrimmedString(compareVersionId);
        const stats = buildRelationshipArcVersionStats(safeVersion);
        const sourceOrigin = formatRelationshipArcSourceOriginList(
            safeVersion.sourceSummary && Array.isArray(safeVersion.sourceSummary.sourceOrigin)
                ? safeVersion.sourceSummary.sourceOrigin
                : []
        );
        const revisionNotes = formatRelationshipArcRevisionNotes(safeVersion.revisionNotes);
        const sourceSummaryParts = [];
        if (Math.max(0, Number(safeVersion.sourceSummary && safeVersion.sourceSummary.sourceEventCount || 0)) > 0) sourceSummaryParts.push(`事件 ${Math.max(0, Number(safeVersion.sourceSummary && safeVersion.sourceSummary.sourceEventCount || 0))} 条`);
        if (Math.max(0, Number(safeVersion.sourceSummary && safeVersion.sourceSummary.sourceFragmentCount || 0)) > 0) sourceSummaryParts.push(`高权重碎片 ${Math.max(0, Number(safeVersion.sourceSummary && safeVersion.sourceSummary.sourceFragmentCount || 0))} 条`);
        if (Math.max(0, Number(stats.datedKeyEventCount || 0)) > 0) sourceSummaryParts.push(`带日期事件 ${Math.max(0, Number(stats.datedKeyEventCount || 0))} 条`);
        if (Math.max(0, Number(stats.themedKeyEventCount || 0)) > 0) sourceSummaryParts.push(`主题标签 ${Math.max(0, Number(stats.themedKeyEventCount || 0))} 个`);
        if (Math.max(0, Number(stats.promptLineCount || 0)) > 0) sourceSummaryParts.push(`注入正文 ${Math.max(0, Number(stats.promptLineCount || 0))} 行`);
        return `
            <div class="hip-snapshot-item" style="${isCompared ? 'border-color:rgba(245,158,11,0.35);background:rgba(245,158,11,0.06);' : ''}">
                <div style="flex:1;min-width:220px;">
                    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
                        <div class="hip-snapshot-time">v${safeVersion.versionNumber}</div>
                        ${renderNotebookBadge(formatRelationshipArcUpdateMode(safeVersion.updateMode), '#dbeafe', 'rgba(96,165,250,0.12)')}
                        ${isCurrent ? renderNotebookBadge('当前生效', '#bbf7d0', 'rgba(34,197,94,0.14)') : ''}
                        ${renderNotebookBadge(`阶段 ${stats.stageCount}`, '#fde68a', 'rgba(245,158,11,0.14)')}
                        ${renderNotebookBadge(`关键事件 ${stats.keyEventCount}`, '#ddd6fe', 'rgba(139,92,246,0.14)')}
                    </div>
                    <div class="hip-snapshot-meta" style="margin-top:6px;">${escapeHtml(buildRelationshipArcMetaLine(safeVersion) || '暂无元信息')}</div>
                    ${sourceOrigin.length > 0 ? `<div class="hip-box-hint" style="margin-top:8px;">素材来源：${escapeHtml(sourceOrigin.join(' / '))}</div>` : ''}
                    ${sourceSummaryParts.length > 0 ? `<div class="hip-box-hint" style="margin-top:8px;">这版用了：${escapeHtml(sourceSummaryParts.join(' / '))}</div>` : ''}
                    ${revisionNotes.length > 0 ? `<div class="hip-box-hint" style="margin-top:8px;">修订说明：${escapeHtml(revisionNotes.join(' / '))}</div>` : ''}
                </div>
                <div class="hip-actions">
                    ${!isCurrent ? `<button type="button" class="hip-btn-outline hip-btn-inline" data-hip-action="compare-relationship-arc-version" data-version-id="${escapeAttribute(versionId)}" ${busy ? 'disabled' : ''}>${isCompared ? '取消对比' : '和当前版比'}</button>` : ''}
                    ${!isCurrent ? `<button type="button" class="hip-btn-danger hip-btn-inline" data-hip-action="rollback-relationship-arc-version" data-version-id="${escapeAttribute(versionId)}" ${busy ? 'disabled' : ''}>恢复成这版</button>` : ''}
                </div>
            </div>
        `;
    }

    function renderRelationshipArcPanel() {
        if (state.loading) {
            return renderLoadingPanel('正在梳理关系脉络...');
        }

        const relationship = getRelationshipArcData();
        const helper = getRelationshipArcHelperState();
        const current = relationship.current;
        const compareVersion = findRelationshipArcVersionById(relationship.versions, helper.compareVersionId);
        const currentVersionId = toTrimmedString(current && current.id);
        const currentState = current ? current.currentRelationshipState : null;
        const promptText = toTrimmedString(relationship.promptBlock || (current && current.promptInjectionFull ? `[关系脉络]\n${current.promptInjectionFull}` : ''));
        const currentTextStats = current ? buildRelationshipArcTextStats(current.promptInjectionFull || promptText) : buildRelationshipArcTextStats('');
        const previewRecord = helper.previewRecord && typeof helper.previewRecord === 'object' ? helper.previewRecord : null;
        const compressionPreviewRecord = helper.compressionPreviewRecord && typeof helper.compressionPreviewRecord === 'object' ? helper.compressionPreviewRecord : null;
        const previewStats = previewRecord ? buildRelationshipArcVersionStats(previewRecord) : null;
        const compressionStats = compressionPreviewRecord
            ? normalizeRelationshipArcCompressionStats(helper.compressionStats, current, compressionPreviewRecord)
            : null;
        const previewDiffLines = current && previewRecord ? buildRelationshipArcCompareDiffLines(previewRecord, current) : [];
        const compressionDiffLines = current && compressionPreviewRecord ? buildRelationshipArcCompareDiffLines(compressionPreviewRecord, current) : [];
        const previewSourceOrigins = previewRecord
            ? formatRelationshipArcSourceOriginList(previewRecord.sourceSummary && Array.isArray(previewRecord.sourceSummary.sourceOrigin) ? previewRecord.sourceSummary.sourceOrigin : [])
            : [];
        const previewRevisionNotes = previewRecord ? formatRelationshipArcRevisionNotes(previewRecord.revisionNotes) : [];
        const compressionRevisionNotes = compressionPreviewRecord ? formatRelationshipArcRevisionNotes(compressionPreviewRecord.revisionNotes) : [];
        const stageOverviewHtml = current ? renderRelationshipArcStageOverviewPanel(current.stages, current.currentStage && current.currentStage.stage) : '';
        const buttonsDisabled = helper.busy ? 'disabled' : '';
        const currentSummaryBadges = current
            ? [
                renderNotebookBadge(`当前 v${current.versionNumber}`, '#bbf7d0', 'rgba(34,197,94,0.14)'),
                renderNotebookBadge(formatRelationshipArcUpdateMode(current.updateMode), '#dbeafe', 'rgba(96,165,250,0.12)'),
                renderNotebookBadge(`阶段 ${relationship.stats.stageCount}`, '#fde68a', 'rgba(245,158,11,0.12)'),
                renderNotebookBadge(`历史 ${relationship.stats.versionCount}`, '#c4b5fd', 'rgba(139,92,246,0.14)'),
                renderNotebookBadge(`正文 ${formatRelationshipArcTextStats(currentTextStats)}`, '#e5e7eb', 'rgba(255,255,255,0.08)')
            ].join('')
            : '';
        const stageHtml = current && Array.isArray(current.stages) && current.stages.length > 0
            ? current.stages.map(renderRelationshipArcStageCard).join('')
            : '<div class="hip-empty">当前还没有可展示的关系阶段。</div>';
        const versionHtml = relationship.versions.length > 0
            ? relationship.versions.map(function renderVersionItem(item) {
                return renderRelationshipArcVersionCard(item, currentVersionId, helper.compareVersionId, helper.busy);
            }).join('')
            : '<div class="hip-empty hip-empty-compact">还没有历史版本。</div>';
        const emptyHint = relationship.emptyReason || '当前还没有生成关系脉络。';
        const importHint = relationship.importHint || '把旧版记忆、YAML 或任意整理好的关系总结贴进来，也可以直接生成第一版。';
        const previewHtml = previewRecord
            ? `
                <section class="hip-glass-panel" style="padding:18px 20px;">
                    <div class="hip-box-header">
                        <h3 style="font-size:16px;">导入后会变成什么样</h3>
                        <div class="hip-box-hint">确认后会写入新版本，旧版本不会被删掉。</div>
                    </div>
                    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;">
                        ${renderNotebookBadge(`将生成 v${previewRecord.versionNumber}`, '#fde68a', 'rgba(245,158,11,0.14)')}
                        ${renderNotebookBadge(`阶段 ${previewRecord.stages.length}`, '#dbeafe', 'rgba(96,165,250,0.12)')}
                        ${previewStats ? renderNotebookBadge(`关键事件 ${previewStats.keyEventCount}`, '#ddd6fe', 'rgba(139,92,246,0.14)') : ''}
                        ${previewStats && previewStats.datedKeyEventCount > 0 ? renderNotebookBadge(`带日期 ${previewStats.datedKeyEventCount}`, '#bbf7d0', 'rgba(34,197,94,0.14)') : ''}
                    </div>
                    <div class="hip-box-hint" style="margin-top:12px;">${escapeHtml(buildRelationshipArcMetaLine(previewRecord) || '已生成可保存的关系脉络预览。')}</div>
                    ${previewSourceOrigins.length > 0 ? `<div class="hip-box-hint" style="margin-top:8px;">这次主要参考：${escapeHtml(previewSourceOrigins.join(' / '))}</div>` : ''}
                    ${previewRevisionNotes.length > 0 ? `<div class="hip-box-hint" style="margin-top:8px;">系统修订：${escapeHtml(previewRevisionNotes.join(' / '))}</div>` : ''}
                    ${previewDiffLines.length > 0 ? `<div class="hip-box-hint" style="margin-top:12px;">这次和当前版的主要差别：<br>${previewDiffLines.map(function mapLine(line) { return `- ${escapeHtml(line)}`; }).join('<br>')}</div>` : ''}
                    ${renderRelationshipArcStageOverviewPanel(previewRecord.stages, previewRecord.currentStage && previewRecord.currentStage.stage)}
                    <pre style="margin-top:14px;white-space:pre-wrap;word-break:break-word;max-height:260px;overflow:auto;padding:14px 16px;border-radius:16px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);font-size:13px;line-height:1.75;color:rgba(255,255,255,0.82);">${escapeHtml(previewRecord.promptInjectionFull || '（预览为空）')}</pre>
                    <div class="hip-actions" style="margin-top:14px;">
                        <button type="button" class="hip-btn-outline hip-btn-inline" data-hip-action="clear-relationship-import-preview" ${buttonsDisabled}>清空预览</button>
                        <button type="button" class="hip-btn-primary hip-btn-inline" data-hip-action="confirm-relationship-import" ${buttonsDisabled}>确认导入</button>
                    </div>
                </section>
            `
            : '';

        return `
            <section class="hip-panel-wrapper">
                <div class="hip-toolbar">
                    <select id="hip-admin-char-select" class="hip-select-block">
                        ${renderContactOptions(getEnabledContacts(), state.filters.charId)}
                    </select>
                    <button type="button" class="hip-icon-btn" data-hip-action="refresh-relationship-arc" aria-label="刷新关系脉络">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.58m15.36 2A8 8 0 004.58 9m0 0H9m11 11v-5h-.58m0 0a8 8 0 01-15.36-2m15.36 2H15"></path>
                        </svg>
                    </button>
                </div>

                <section class="hip-glass-panel" style="padding:18px 20px;">
                    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;">
                        <div style="flex:1;min-width:240px;">
                            <div style="font-size:18px;font-weight:600;color:rgba(255,255,255,0.94);">关系脉络总览</div>
                            <div style="margin-top:8px;font-size:13px;color:rgba(255,255,255,0.66);line-height:1.7;">${escapeHtml(current ? (buildRelationshipArcMetaLine(current) || '当前关系脉络已生成。') : emptyHint)}</div>
                        </div>
                        <div class="hip-actions">
                            <button type="button" class="hip-btn-outline hip-btn-inline" data-hip-action="update-relationship-arc-tail" ${buttonsDisabled}>更新最近阶段</button>
                            <button type="button" class="hip-btn-outline hip-btn-inline" data-hip-action="preview-relationship-arc-compression" ${current ? buttonsDisabled : 'disabled'}>一键精炼/压缩</button>
                            <button type="button" class="hip-btn-primary hip-btn-inline" data-hip-action="rebuild-relationship-arc" ${buttonsDisabled}>重建整条脉络</button>
                        </div>
                    </div>
                    ${currentSummaryBadges ? `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:14px;">${currentSummaryBadges}</div>` : `<div class="hip-box-hint" style="margin-top:14px;">${escapeHtml(importHint)}</div>`}
                </section>

                ${stageOverviewHtml}

                ${current && currentState
                    ? `
                    <section class="hip-glass-panel" style="padding:18px 20px;">
                        <div class="hip-box-header">
                            <h3 style="font-size:16px;">当前关系状态</h3>
                        </div>
                        <div style="margin-top:10px;font-size:14px;line-height:1.85;color:rgba(255,255,255,0.82);">${escapeHtml(currentState.oneParagraphSummary || '暂无总结。')}</div>
                        ${renderRelationshipArcListBlock('仍在持续影响关系的线索', currentState.activeThreads)}
                        ${renderRelationshipArcListBlock('未完全释放的张力', currentState.unresolvedTensions)}
                        ${renderRelationshipArcListBlock('已经稳定下来的情感纽带', currentState.stableBonds)}
                        ${renderRelationshipArcListBlock('共同方向', currentState.sharedDirection)}
                    </section>
                    `
                    : ''
                }

                <section class="hip-glass-panel" style="padding:18px 20px;">
                    <div class="hip-box-header">
                        <h3 style="font-size:16px;">主聊天会读到的完整脉络</h3>
                        <div class="hip-box-hint">这里展示的是会直接放进主聊天背景里的完整关系脉络正文。当前 ${escapeHtml(formatRelationshipArcTextStats(currentTextStats))}。</div>
                    </div>
                    <pre style="margin-top:14px;white-space:pre-wrap;word-break:break-word;max-height:320px;overflow:auto;padding:14px 16px;border-radius:16px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);font-size:13px;line-height:1.75;color:rgba(255,255,255,0.82);">${escapeHtml(promptText || '（当前为空）')}</pre>
                </section>

                <section class="hip-glass-panel" style="padding:18px 20px;">
                    <div class="hip-box-header">
                        <h3 style="font-size:16px;">从旧记忆导入</h3>
                        <div class="hip-box-hint">支持 YAML、纯文本或任意格式的关系总结。系统会先生成预览，再由你确认写入。</div>
                    </div>
                    <form id="hip-admin-relationship-import-form" style="margin-top:14px;">
                        <textarea
                            name="relationshipImportText"
                            class="hip-manual-yaml-input"
                            placeholder="把你的旧版记忆文本贴到这里（支持 YAML、纯文本、任意格式的关系总结）"
                            ${buttonsDisabled}
                        >${escapeHtml(helper.importText || '')}</textarea>
                        <div class="hip-manual-yaml-actions">
                            <button type="submit" class="hip-btn-outline" ${buttonsDisabled}>生成关系脉络预览</button>
                        </div>
                    </form>
                </section>

                ${previewHtml}
                ${renderRelationshipArcCompressionPreviewBlock(compressionPreviewRecord, compressionStats, compressionRevisionNotes, compressionDiffLines, buttonsDisabled)}
                ${renderRelationshipArcComparePanel(current, compareVersion)}

                <section class="hip-glass-panel" style="padding:18px 20px;">
                    <div class="hip-box-header">
                        <h3 style="font-size:16px;">阶段历程</h3>
                        <div class="hip-box-hint">早期阶段更概括，越接近当下越具体。</div>
                    </div>
                    <div class="hip-card-list" style="margin-top:14px;">${stageHtml}</div>
                </section>

                <section class="hip-glass-panel" style="padding:18px 20px;">
                    <div class="hip-box-header">
                        <h3 style="font-size:16px;">历史版本</h3>
                        <div class="hip-box-hint">保留最近几版，支持对比和回滚。</div>
                    </div>
                    <div class="hip-snapshot-list" style="margin-top:14px;">${versionHtml}</div>
                </section>
            </section>
        `;
    }

    const api = {
        initHippocampusAdminView: initHippocampusAdminView,
        openAdmin: openAdmin,
        syncAdminEntry: syncAdminEntry,
        __debug: {
            getMemoryGroundingSupport: getMemoryGroundingSupport,
            humanizeGroundingTier: humanizeGroundingTier,
            deriveEventGroundingOverview: deriveEventGroundingOverview,
            renderGroundingSupportPanel: renderGroundingSupportPanel,
            renderEventGroundingPanel: renderEventGroundingPanel,
            buildMemoryRewriteAuditEntries: buildMemoryRewriteAuditEntries,
            renderMemoryReconAuditPanel: renderMemoryReconAuditPanel,
            renderEventVersionHistoryPanel: renderEventVersionHistoryPanel,
            formatRelationshipArcImportErrorMessage: formatRelationshipArcImportErrorMessage,
            getNotebookRuntimeSourceLabel: getNotebookRuntimeSourceLabel,
            getNotebookRuntimeNoteLabel: getNotebookRuntimeNoteLabel,
            buildNotebookRuntimeDetailLines: buildNotebookRuntimeDetailLines
        }
    };

    return api;
}
