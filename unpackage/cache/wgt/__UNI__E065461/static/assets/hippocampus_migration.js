/**
 * 初始化海马体旧 YAML 迁移模块导出壳子。
 * 兼容浏览器全局和 CommonJS 两种加载方式。
 */
(function initHippocampusMigrationModule(root) {
    const api = createHippocampusMigration(root);

    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }

    if (root && typeof root === 'object') {
        root.HippocampusMigration = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this));

/**
 * 创建海马体旧 YAML 迁移工具实例。
 * 这里封装备份、分段、脱水提取、预览和最终批量入库流程。
 */
function createHippocampusMigration(root) {
    const BACKUP_STORAGE_KEY = 'idic_hippocampus_yaml_migration_backups_v1';
    const MAX_BACKUP_COUNT = 10;
    const MAX_CHUNK_CHAR_LENGTH = 1200;
    const MAX_EVENT_COUNT_PER_CHUNK = 3;
    const MAX_SENSORY_ANCHOR_COUNT = 8;
    const VALID_MEMORY_LAYERS = new Set(['buffer', 'core', 'cortex', 'shadow', 'wish']);
    const DEFAULT_TEMPERATURE = 0.2;
    const DEFAULT_MAX_TOKENS = 1200;
    const EMBEDDING_BACKFILL_RETRY_LIMIT = 4;
    const EMBEDDING_BACKFILL_BASE_DELAY_MS = 1200;
    const EMBEDDING_BACKFILL_GAP_MS = 600;
    const MISSING_EMBEDDING_SCAN_LIMIT = 300;

    const state = {
        pendingBackup: null,
        pendingPreview: null,
        sessions: {},
        embeddingQueue: [],
        embeddingWorkerRunning: false,
        embeddingBatches: {},
        embeddingListeners: []
    };

    /**
     * 生成本地唯一 ID，供 embedding 批次追踪使用。
     */
    function createEmbeddingBatchId() {
        return `hippo-embed-batch-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    }

    /**
     * 把 embedding 失败原因归一到可读代码，便于最终提示聚合。
     */
    function normalizeEmbeddingFailureReason(reason) {
        const source = toTrimmedString(reason).toLowerCase();
        if (!source) return 'unknown';
        if (source.includes('429') || source.includes('rate limit') || source.includes('too many')) return 'rate_limited';
        if (source.includes('timeout')) return 'timeout';
        if (source.includes('auth') || source.includes('key') || source.includes('token') || source.includes('401') || source.includes('403')) return 'auth_failed';
        if (source.includes('network') || source.includes('fetch') || source.includes('cors') || source.includes('dns')) return 'network_error';
        if (source.includes('write') || source.includes('update') || source.includes('db') || source.includes('postgres') || source.includes('supabase')) return 'db_write_failed';
        if (source.includes('empty') || source.includes('vector') || source.includes('embedding')) return 'embedding_empty_or_invalid';
        return 'unknown';
    }

    /**
     * 获取或创建 embedding 批次状态，支持后续回填完成回执。
     */
    function getOrCreateEmbeddingBatch(batchId, patch) {
        const safeBatchId = toTrimmedString(batchId) || createEmbeddingBatchId();
        const existing = state.embeddingBatches[safeBatchId] && typeof state.embeddingBatches[safeBatchId] === 'object'
            ? state.embeddingBatches[safeBatchId]
            : null;

        if (existing) {
            state.embeddingBatches[safeBatchId] = Object.assign({}, existing, patch || {});
            return state.embeddingBatches[safeBatchId];
        }

        const base = Object.assign({
            id: safeBatchId,
            sourceType: 'unknown',
            userId: '',
            charId: '',
            queuedCount: 0,
            pendingCount: 0,
            successCount: 0,
            failedCount: 0,
            failReasonCounter: {},
            createdAt: new Date().toISOString(),
            finishedAt: null,
            notified: false
        }, patch || {});

        state.embeddingBatches[safeBatchId] = base;
        return base;
    }

    /**
     * 触发 embedding 批次完成事件，供管理台弹出最终回执。
     */
    function notifyEmbeddingBatchFinished(batch) {
        const safeBatch = batch && typeof batch === 'object' ? batch : null;
        if (!safeBatch || safeBatch.notified) return;

        safeBatch.notified = true;
        safeBatch.finishedAt = safeBatch.finishedAt || new Date().toISOString();
        const listeners = Array.isArray(state.embeddingListeners) ? state.embeddingListeners.slice() : [];
        if (listeners.length === 0) return;

        const reasonSummary = Object.entries(safeBatch.failReasonCounter || {})
            .map(function mapFailureReason(item) {
                return {
                    reason: item[0],
                    count: Number(item[1] || 0)
                };
            })
            .filter(function filterReason(item) {
                return item.count > 0;
            })
            .sort(function sortReason(a, b) {
                return b.count - a.count;
            });

        const payload = {
            batchId: safeBatch.id,
            sourceType: safeBatch.sourceType,
            userId: safeBatch.userId,
            charId: safeBatch.charId,
            queuedCount: Number(safeBatch.queuedCount || 0),
            successCount: Number(safeBatch.successCount || 0),
            failedCount: Number(safeBatch.failedCount || 0),
            pendingCount: Number(safeBatch.pendingCount || 0),
            finishedAt: safeBatch.finishedAt,
            failureReasons: reasonSummary
        };

        listeners.forEach(function emitToListener(listener) {
            try {
                if (typeof listener === 'function') {
                    listener(payload);
                }
            } catch (_) {
                // 监听器异常时不影响主流程。
            }
        });
    }

    /**
     * 将任意值转换为去首尾空白的字符串。
     */
    function toTrimmedString(value) {
        return String(value === undefined || value === null ? '' : value).trim();
    }

    /**
     * 将任意值转换为有限数字，不合法时回退到默认值。
     */
    function toFiniteNumber(value, fallback) {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : fallback;
    }

    /**
     * 将数值裁剪到指定区间内，区间边界与 SQL 约束保持一致。
     */
    function clampNumber(value, min, max, fallback) {
        const numeric = toFiniteNumber(value, fallback);
        return Math.min(max, Math.max(min, numeric));
    }

    /**
     * 读取当前环境里的桥接对象。
     */
    function getBridge() {
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
     * 读取当前环境中的 fetch 实现。
     */
    function getFetchImplementation() {
        if (typeof fetch === 'function') return fetch.bind(root);
        if (root && typeof root.fetch === 'function') return root.fetch.bind(root);
        return null;
    }

    /**
     * 读取海马体运行时设置快照，用于复用 embedding 配置。
     */
    function getHippocampusSettingsSnapshot() {
        const bridge = getBridge();
        if (!bridge || typeof bridge.getHippocampusSettingsSnapshot !== 'function') {
            return {};
        }

        try {
            const snapshot = bridge.getHippocampusSettingsSnapshot();
            return snapshot && typeof snapshot === 'object' ? snapshot : {};
        } catch (_) {
            return {};
        }
    }

    /**
     * 把向量数组转成 PostgreSQL vector 可接受的字面量字符串。
     */
    function vectorToLiteral(vector) {
        if (!Array.isArray(vector) || vector.length === 0) return null;

        const numbers = vector.map(function normalizeItem(item) {
            const numeric = Number(item);
            return Number.isFinite(numeric) ? numeric : 0;
        });

        return `[${numbers.join(',')}]`;
    }

    /**
     * 复用海马体客户端的 Embedding 调用逻辑，为迁移事件生成向量。
     */
    async function callMigrationEmbeddingAPI(text) {
        const cleanText = toTrimmedString(text);
        if (!cleanText) return null;

        const supabase = getSupabaseClient();
        if (!supabase) return null;

        const clientModule = root && root.HippocampusClient;
        if (!clientModule || typeof clientModule.initHippocampus !== 'function') {
            return null;
        }

        try {
            const settingsSnapshot = Object.assign({}, getHippocampusSettingsSnapshot(), {
                hippocampusEnabled: true
            });
            const client = clientModule.initHippocampus(supabase, settingsSnapshot);
            if (!client || typeof client.callEmbeddingAPI !== 'function') {
                return null;
            }

            return await client.callEmbeddingAPI(cleanText);
        } catch (_) {
            return null;
        }
    }

    /**
     * 休眠指定毫秒，供后台回填队列节流与退避重试使用。
     */
    function sleep(ms) {
        const delay = Math.max(0, Math.floor(toFiniteNumber(ms, 0)));
        const timer = root && typeof root.setTimeout === 'function'
            ? root.setTimeout.bind(root)
            : setTimeout;
        return new Promise(function resolveAfterDelay(resolve) {
            timer(resolve, delay);
        });
    }

    /**
     * 判断当前是否具备可用的 embedding 配置，避免无配置时空转队列。
     */
    function hasMigrationEmbeddingCapability() {
        const settings = getHippocampusSettingsSnapshot();
        const embedding = settings && settings.hippocampusEmbedding && typeof settings.hippocampusEmbedding === 'object'
            ? settings.hippocampusEmbedding
            : {};
        const apiUrl = toTrimmedString(
            embedding.apiUrl
            || embedding.url
            || settings.embeddingApiUrl
            || settings.hippocampusEmbeddingApiUrl
        );
        const model = toTrimmedString(
            embedding.model
            || embedding.modelName
            || settings.embeddingModel
            || settings.hippocampusEmbeddingModel
        );

        const supabase = getSupabaseClient();
        return !!(supabase && apiUrl && model);
    }

    /**
     * 回写单条迁移记忆的 embedding，失败时返回结构化结果供上层决定是否重试。
     */
    async function updateMigrationMemoryEmbedding(memoryId, userId, embeddingVector) {
        const supabase = getSupabaseClient();
        const safeMemoryId = toTrimmedString(memoryId);
        const safeUserId = toTrimmedString(userId);
        const literal = vectorToLiteral(embeddingVector);
        if (!supabase || !safeMemoryId || !safeUserId || !literal) {
            return {
                ok: false,
                reason: 'db_write_failed'
            };
        }

        try {
            const response = await supabase
                .from('hippocampus_memories')
                .update({
                    embedding: literal
                })
                .eq('id', safeMemoryId)
                .eq('user_id', safeUserId)
                .select('id')
                .single();

            if (response.error) throw response.error;
            return {
                ok: true,
                reason: ''
            };
        } catch (error) {
            console.warn('[海马体迁移][向量] embedding 回写失败，稍后将重试。', error && error.message ? error.message : error);
            return {
                ok: false,
                reason: normalizeEmbeddingFailureReason(error && error.message ? error.message : '')
            };
        }
    }

    /**
     * 将插入结果转成后台 embedding 回填任务列表。
     */
    function buildEmbeddingJobsFromRecords(records, fallbackEvents, userId) {
        const sourceRecords = Array.isArray(records) ? records : [];
        const sourceEvents = Array.isArray(fallbackEvents) ? fallbackEvents : [];
        const safeUserId = toTrimmedString(userId);

        return sourceRecords.map(function mapRecord(record, index) {
            const memoryId = toTrimmedString(record && record.id);
            const content = toTrimmedString(
                record && record.content
                || sourceEvents[index] && sourceEvents[index].content
            );
            if (!memoryId || !safeUserId || !content) return null;

            return {
                memoryId: memoryId,
                userId: safeUserId,
                content: content,
                attempt: 0,
                nextRunAt: Date.now()
            };
        }).filter(Boolean);
    }

    /**
     * 记录某个 embedding 批次的一次最终失败原因。
     */
    function recordEmbeddingBatchFailure(batch, reasonCode) {
        if (!batch || typeof batch !== 'object') return;
        const normalized = normalizeEmbeddingFailureReason(reasonCode);
        const counter = batch.failReasonCounter && typeof batch.failReasonCounter === 'object'
            ? batch.failReasonCounter
            : {};
        counter[normalized] = Math.max(0, Number(counter[normalized] || 0)) + 1;
        batch.failReasonCounter = counter;
    }

    /**
     * 当某个 embedding 批次处理完毕时，触发一次最终回执。
     */
    function tryFinishEmbeddingBatch(batchId) {
        const safeBatchId = toTrimmedString(batchId);
        if (!safeBatchId) return;
        const batch = state.embeddingBatches[safeBatchId];
        if (!batch || typeof batch !== 'object') return;
        if (Number(batch.pendingCount || 0) > 0) return;
        if (batch.notified) return;

        notifyEmbeddingBatchFinished(batch);
        delete state.embeddingBatches[safeBatchId];
    }

    /**
     * 将任务加入后台回填队列，并触发异步处理。
     */
    function enqueueEmbeddingBackfillJobs(jobs, options) {
        const source = Array.isArray(jobs) ? jobs.filter(Boolean) : [];
        const opt = options && typeof options === 'object' ? options : {};
        if (source.length === 0) {
            return {
                queuedCount: 0,
                batchId: toTrimmedString(opt.batchId)
            };
        }

        const batch = getOrCreateEmbeddingBatch(opt.batchId, {
            sourceType: toTrimmedString(opt.sourceType) || 'unknown',
            userId: toTrimmedString(opt.userId),
            charId: toTrimmedString(opt.charId)
        });
        batch.queuedCount = Math.max(0, Number(batch.queuedCount || 0)) + source.length;
        batch.pendingCount = Math.max(0, Number(batch.pendingCount || 0)) + source.length;

        const jobsWithBatch = source.map(function appendBatch(job) {
            return Object.assign({}, job, {
                batchId: batch.id
            });
        });

        Array.prototype.push.apply(state.embeddingQueue, jobsWithBatch);
        void processEmbeddingBackfillQueue();
        return {
            queuedCount: jobsWithBatch.length,
            batchId: batch.id
        };
    }

    /**
     * 后台串行处理 embedding 回填队列，避免并发洪峰触发 429。
     */
    async function processEmbeddingBackfillQueue() {
        if (state.embeddingWorkerRunning) return;
        state.embeddingWorkerRunning = true;

        try {
            while (state.embeddingQueue.length > 0) {
                const job = state.embeddingQueue.shift();
                if (!job) continue;

                const waitMs = Math.max(0, toFiniteNumber(job.nextRunAt, Date.now()) - Date.now());
                if (waitMs > 0) {
                    await sleep(waitMs);
                }

                const batch = getOrCreateEmbeddingBatch(job.batchId, {});
                const vector = await callMigrationEmbeddingAPI(job.content);
                let lastFailureReason = '';
                if (vector) {
                    const updated = await updateMigrationMemoryEmbedding(job.memoryId, job.userId, vector);
                    if (updated && updated.ok) {
                        batch.successCount = Math.max(0, Number(batch.successCount || 0)) + 1;
                        batch.pendingCount = Math.max(0, Number(batch.pendingCount || 0) - 1);
                        tryFinishEmbeddingBatch(batch.id);
                        console.log(`[海马体迁移][向量] 回填成功，memory_id=${job.memoryId}，attempt=${job.attempt + 1}。`);
                        await sleep(EMBEDDING_BACKFILL_GAP_MS);
                        continue;
                    }
                    lastFailureReason = normalizeEmbeddingFailureReason(updated && updated.reason);
                } else {
                    lastFailureReason = 'embedding_empty_or_invalid';
                }

                const nextAttempt = Number(job.attempt || 0) + 1;
                if (nextAttempt < EMBEDDING_BACKFILL_RETRY_LIMIT) {
                    const backoffMs = EMBEDDING_BACKFILL_BASE_DELAY_MS * Math.pow(2, nextAttempt - 1);
                    state.embeddingQueue.push(Object.assign({}, job, {
                        attempt: nextAttempt,
                        nextRunAt: Date.now() + backoffMs
                    }));
                    console.warn(`[海马体迁移][向量] 回填未成功，已加入第 ${nextAttempt + 1} 次重试，memory_id=${job.memoryId}。`);
                } else {
                    batch.failedCount = Math.max(0, Number(batch.failedCount || 0)) + 1;
                    batch.pendingCount = Math.max(0, Number(batch.pendingCount || 0) - 1);
                    recordEmbeddingBatchFailure(batch, lastFailureReason || 'unknown');
                    tryFinishEmbeddingBatch(batch.id);
                    console.warn(`[海马体迁移][向量] 回填失败且达到重试上限，memory_id=${job.memoryId}。`);
                }

                await sleep(EMBEDDING_BACKFILL_GAP_MS);
            }
        } finally {
            state.embeddingWorkerRunning = false;
            if (state.embeddingQueue.length > 0) {
                void processEmbeddingBackfillQueue();
            }
        }
    }

    /**
     * 扫描并重排“embedding 为空”的旧迁移记忆，支持用户手动二次回填。
     */
    async function retryMissingEmbeddings(userId, charId, options) {
        const safeUserId = toTrimmedString(userId);
        const safeCharId = toTrimmedString(charId);
        const source = options && typeof options === 'object' ? options : {};
        const safeLimit = Math.max(
            1,
            Math.min(1000, Math.floor(toFiniteNumber(source.limit, MISSING_EMBEDDING_SCAN_LIMIT)))
        );
        const sourceType = toTrimmedString(source.sourceType || source.source_type || '');

        if (!safeUserId || !safeCharId) {
            return {
                ok: false,
                totalMissing: 0,
                queuedCount: 0,
                error: '缺少 userId 或 charId。'
            };
        }

        if (!hasMigrationEmbeddingCapability()) {
            return {
                ok: false,
                totalMissing: 0,
                queuedCount: 0,
                error: '当前未检测到可用 Embedding 配置，无法执行回填。'
            };
        }

        const supabase = getSupabaseClient();
        if (!supabase) {
            return {
                ok: false,
                totalMissing: 0,
                queuedCount: 0,
                error: '当前没有可用的 Supabase 客户端。'
            };
        }

        try {
            let query = supabase
                .from('hippocampus_memories')
                .select('id,content,source_type', { count: 'exact' })
                .eq('user_id', safeUserId)
                .eq('char_id', safeCharId)
                .is('embedding', null)
                .order('created_at', { ascending: false })
                .limit(safeLimit);

            if (sourceType) {
                query = query.eq('source_type', sourceType);
            }

            const response = await query;
            if (response.error) throw response.error;

            const rows = Array.isArray(response.data) ? response.data : [];
            const jobs = rows.map(function mapRow(row) {
                const memoryId = toTrimmedString(row && row.id);
                const content = toTrimmedString(row && row.content);
                if (!memoryId || !content) return null;
                return {
                    memoryId: memoryId,
                    userId: safeUserId,
                    content: content,
                    attempt: 0,
                    nextRunAt: Date.now()
                };
            }).filter(Boolean);

            const enqueueResult = enqueueEmbeddingBackfillJobs(jobs, {
                sourceType: sourceType || 'retry_missing',
                userId: safeUserId,
                charId: safeCharId
            });
            const queuedCount = Math.max(0, Number(enqueueResult && enqueueResult.queuedCount || 0));
            return {
                ok: true,
                totalMissing: Math.max(0, Math.floor(toFiniteNumber(response.count, rows.length))),
                queuedCount: queuedCount,
                batchId: toTrimmedString(enqueueResult && enqueueResult.batchId),
                scannedCount: rows.length,
                limit: safeLimit,
                sourceType: sourceType || null
            };
        } catch (error) {
            return {
                ok: false,
                totalMissing: 0,
                queuedCount: 0,
                error: getErrorMessage(error, '读取缺失向量记忆失败。')
            };
        }
    }

    /**
     * 为迁移会话生成一个稳定的本地 ID。
     */
    function createLocalId(prefix) {
        const safePrefix = toTrimmedString(prefix) || 'hippo';
        return `${safePrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    }

    /**
     * 将 YAML 文本标准化为统一换行格式，并去掉 BOM。
     */
    function normalizeYamlText(yamlContent) {
        return String(yamlContent === undefined || yamlContent === null ? '' : yamlContent)
            .replace(/^\uFEFF/, '')
            .replace(/\r\n?/g, '\n');
    }

    /**
     * 从错误对象中提取尽量清晰的人类可读信息。
     */
    function getErrorMessage(error, fallback) {
        if (error && typeof error === 'object') {
            if (typeof error.message === 'string' && error.message.trim()) {
                return error.message.trim();
            }

            if (typeof error.error_description === 'string' && error.error_description.trim()) {
                return error.error_description.trim();
            }
        }

        return fallback;
    }

    /**
     * 读取本地保存的 YAML 迁移备份列表。
     */
    function readStoredBackups() {
        try {
            if (!root || !root.localStorage) return [];

            const raw = root.localStorage.getItem(BACKUP_STORAGE_KEY);
            if (!raw) return [];

            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (_) {
            return [];
        }
    }

    /**
     * 将 YAML 迁移备份列表写回 localStorage。
     */
    function writeStoredBackups(backups) {
        try {
            if (!root || !root.localStorage) return false;
            root.localStorage.setItem(BACKUP_STORAGE_KEY, JSON.stringify(Array.isArray(backups) ? backups : []));
            return true;
        } catch (_) {
            return false;
        }
    }

    /**
     * 把原 YAML 备份落地到本地存储，确保迁移前可以回滚查看。
     */
    function createBackupRecord(yamlText) {
        const cleanYaml = normalizeYamlText(yamlText);
        const createdAt = new Date().toISOString();
        const backup = {
            id: createLocalId('hippo-yaml-backup'),
            createdAt: createdAt,
            originalYamlLength: cleanYaml.length,
            yamlContent: cleanYaml,
            charId: null,
            charName: null,
            sourceType: null,
            sourceLabel: null,
            charPersona: null,
            charGenderIdentity: null,
            userName: null,
            userPersona: null,
            userGenderIdentity: null,
            persisted: false,
            error: null
        };

        const backups = readStoredBackups();
        const nextBackups = [Object.assign({}, backup, { persisted: undefined, error: undefined })]
            .concat(backups)
            .slice(0, MAX_BACKUP_COUNT);

        if (!writeStoredBackups(nextBackups)) {
            backup.error = '原 YAML 备份失败，已停止迁移，请先检查浏览器本地存储是否可用。';
            return backup;
        }

        backup.persisted = true;
        return backup;
    }

    /**
     * 给当前备份补上角色上下文，方便之后在本地备份中定位来源。
     */
    function patchStoredBackup(backupId, patch) {
        const safeBackupId = toTrimmedString(backupId);
        if (!safeBackupId) return false;

        const backups = readStoredBackups();
        let changed = false;

        const nextBackups = backups.map(function updateBackup(backup) {
            if (!backup || backup.id !== safeBackupId) return backup;
            changed = true;
            return Object.assign({}, backup, patch || {});
        });

        if (!changed) return false;
        return writeStoredBackups(nextBackups);
    }

    /**
     * 将当前迁移会话绑定到某个角色，避免预览和提交串角色。
     */
    function attachPendingCharContext(charId, charName, sourceMeta) {
        if (!state.pendingBackup) return;

        const safeCharId = toTrimmedString(charId) || null;
        const safeCharName = toTrimmedString(charName) || null;
        const safeSource = sourceMeta && typeof sourceMeta === 'object' ? sourceMeta : {};
        const safeSourceType = toTrimmedString(safeSource.sourceType) || null;
        const safeSourceLabel = toTrimmedString(safeSource.sourceLabel) || null;
        const safeCharPersona = toTrimmedString(safeSource.persona || safeSource.charPersona) || null;
        const safeCharGenderIdentity = toTrimmedString(safeSource.genderIdentity || safeSource.charGenderIdentity || safeSource.charGender) || null;
        const safeUserName = toTrimmedString(safeSource.userName) || null;
        const safeUserPersona = toTrimmedString(safeSource.userPersona) || null;
        const safeUserGenderIdentity = toTrimmedString(safeSource.userGenderIdentity || safeSource.userGender) || null;

        state.pendingBackup.charId = safeCharId;
        state.pendingBackup.charName = safeCharName;
        state.pendingBackup.sourceType = safeSourceType;
        state.pendingBackup.sourceLabel = safeSourceLabel;
        state.pendingBackup.charPersona = safeCharPersona;
        state.pendingBackup.charGenderIdentity = safeCharGenderIdentity;
        state.pendingBackup.userName = safeUserName;
        state.pendingBackup.userPersona = safeUserPersona;
        state.pendingBackup.userGenderIdentity = safeUserGenderIdentity;

        if (state.pendingBackup.persisted) {
            patchStoredBackup(state.pendingBackup.id, {
                charId: safeCharId,
                charName: safeCharName,
                sourceType: safeSourceType,
                sourceLabel: safeSourceLabel,
                charPersona: safeCharPersona,
                charGenderIdentity: safeCharGenderIdentity,
                userName: safeUserName,
                userPersona: safeUserPersona,
                userGenderIdentity: safeUserGenderIdentity,
                lastTouchedAt: new Date().toISOString()
            });
        }
    }

    /**
     * 判断一行是否像是 YAML 顶层小节的开头。
     */
    function looksLikeTopLevelYamlHeading(line) {
        const text = toTrimmedString(line);
        if (!text) return false;
        return /^[^\s:#][^:]{0,120}:\s*(?:#.*)?$/.test(text);
    }

    /**
     * 将过长段落按句子和行继续切小，避免单块文本超过 LLM 处理上限。
     */
    function splitOversizedSection(section) {
        const lines = normalizeYamlText(section)
            .split('\n')
            .map(function normalizeLine(line) {
                return line.replace(/\s+$/g, '');
            })
            .filter(function keepLine(line) {
                return !!toTrimmedString(line);
            });

        const chunks = [];
        let current = '';

        function pushPiece(piece) {
            const cleanPiece = toTrimmedString(piece);
            if (!cleanPiece) return;

            if (!current) {
                current = cleanPiece;
                return;
            }

            if ((current.length + 1 + cleanPiece.length) <= MAX_CHUNK_CHAR_LENGTH) {
                current += `\n${cleanPiece}`;
                return;
            }

            chunks.push(current);
            current = cleanPiece;
        }

        for (let i = 0; i < lines.length; i += 1) {
            const line = lines[i];
            if (line.length <= MAX_CHUNK_CHAR_LENGTH) {
                pushPiece(line);
                continue;
            }

            const sentences = line.match(/[^。！？!?；;]+[。！？!?；;]?/g) || [line];
            for (let j = 0; j < sentences.length; j += 1) {
                let sentence = toTrimmedString(sentences[j]);
                while (sentence.length > MAX_CHUNK_CHAR_LENGTH) {
                    pushPiece(sentence.slice(0, MAX_CHUNK_CHAR_LENGTH));
                    sentence = sentence.slice(MAX_CHUNK_CHAR_LENGTH);
                }
                pushPiece(sentence);
            }
        }

        if (current) {
            chunks.push(current);
        }

        return chunks;
    }

    /**
     * 将 YAML 文本先按空行和顶层标题切段，再按长度合并为适合迁移的文本块。
     */
    function splitYamlIntoChunks(yamlText) {
        const normalized = normalizeYamlText(yamlText).trim();
        if (!normalized) return [];

        let sections = normalized
            .split(/\n\s*\n+/)
            .map(function normalizeSection(section) {
                return section.trim();
            })
            .filter(Boolean);

        if (sections.length <= 1) {
            const lines = normalized.split('\n');
            const rebuiltSections = [];
            let currentLines = [];

            for (let i = 0; i < lines.length; i += 1) {
                const line = lines[i];
                const cleanLine = line.replace(/\s+$/g, '');
                if (!toTrimmedString(cleanLine)) continue;

                if (
                    currentLines.length > 0
                    && looksLikeTopLevelYamlHeading(cleanLine)
                    && currentLines.join('\n').length >= 240
                ) {
                    rebuiltSections.push(currentLines.join('\n').trim());
                    currentLines = [cleanLine];
                    continue;
                }

                currentLines.push(cleanLine);
            }

            if (currentLines.length > 0) {
                rebuiltSections.push(currentLines.join('\n').trim());
            }

            sections = rebuiltSections.filter(Boolean);
        }

        const flattenedSections = [];
        for (let i = 0; i < sections.length; i += 1) {
            const section = sections[i];
            if (section.length > MAX_CHUNK_CHAR_LENGTH) {
                const smallerSections = splitOversizedSection(section);
                for (let j = 0; j < smallerSections.length; j += 1) {
                    flattenedSections.push(smallerSections[j]);
                }
                continue;
            }

            flattenedSections.push(section);
        }

        const chunks = [];
        let currentChunk = '';

        for (let i = 0; i < flattenedSections.length; i += 1) {
            const section = flattenedSections[i];
            if (!section) continue;

            if (!currentChunk) {
                currentChunk = section;
                continue;
            }

            if ((currentChunk.length + 2 + section.length) <= MAX_CHUNK_CHAR_LENGTH) {
                currentChunk += `\n\n${section}`;
                continue;
            }

            chunks.push(currentChunk);
            currentChunk = section;
        }

        if (currentChunk) {
            chunks.push(currentChunk);
        }

        return chunks;
    }

    /**
     * 规范化迁移 API 配置，兼容常见的字段命名。
     */
    function normalizeApiConfig(apiConfig) {
        const source = apiConfig && typeof apiConfig === 'object' ? apiConfig : {};
        const headers = source.headers && typeof source.headers === 'object' ? source.headers : {};
        const requestBody = source.requestBody && typeof source.requestBody === 'object' ? source.requestBody : {};

        return {
            apiUrl: toTrimmedString(source.apiUrl || source.url || source.baseUrl),
            apiKey: toTrimmedString(source.apiKey || source.key),
            model: toTrimmedString(source.model || source.modelName),
            temperature: clampNumber(source.temperature, 0, 2, DEFAULT_TEMPERATURE),
            maxTokens: Math.max(1, Math.floor(toFiniteNumber(source.maxTokens || source.max_tokens, DEFAULT_MAX_TOKENS))),
            headers: headers,
            requestBody: requestBody
        };
    }

    /**
     * 将用户填写的基础 URL 规范为 OpenAI 兼容的聊天补全端点。
     */
    function normalizeChatCompletionsUrl(rawUrl) {
        const url = toTrimmedString(rawUrl).replace(/\/+$/, '');
        if (!url) return '';
        if (url.endsWith('/chat/completions')) return url;
        if (url.endsWith('/chat')) return `${url}/completions`;
        return `${url}/chat/completions`;
    }

    /**
     * 为单个 YAML 段落生成迁移用中文 Prompt。
     */
    function generateMigrationPrompt(chunk, charName, sourceMeta) {
        const safeCharName = toTrimmedString(charName) || '角色';
        const safeChunk = toTrimmedString(chunk) || '（空白片段）';
        const normalizedSource = normalizeMigrationSource(sourceMeta);
        const contextLines = [];

        if (normalizedSource.sourceLabel) {
            contextLines.push(`- 本次来源：${normalizedSource.sourceLabel}`);
        }
        if (normalizedSource.sourceType) {
            contextLines.push(`- 来源类型：${normalizedSource.sourceType}`);
        }
        if (normalizedSource.persona) {
            contextLines.push(`- 角色核心人设参考：${normalizedSource.persona}`);
        }
        if (normalizedSource.genderIdentity) {
            contextLines.push(`- 角色心理性别：${normalizedSource.genderIdentity}`);
        }
        if (normalizedSource.userName) {
            contextLines.push(`- 用户称呼：${normalizedSource.userName}`);
        }
        if (normalizedSource.userPersona) {
            contextLines.push(`- 用户人设参考：${normalizedSource.userPersona}`);
        }
        if (normalizedSource.userGenderIdentity) {
            contextLines.push(`- 用户心理性别：${normalizedSource.userGenderIdentity}`);
        }

        return [
            '你是 IDIC 项目的“海马体旧记忆迁移器”。',
            `下面给你的是角色“${safeCharName}”过去写在 YAML / 长期总结里的旧流水账片段。`,
            '你的任务不是提炼设定，不要改写 YAML，只需要从中抽出值得进入“海马体”的情感事件。',
            contextLines.length > 0 ? '' : null,
            contextLines.length > 0 ? '以下是迁移参考上下文（仅用于帮你避免称呼和代词写错，不是让你去抄设定）：': null,
            contextLines.length > 0 ? contextLines.join('\n') : null,
            '',
            '请严格遵守以下规则：',
            `1. 只提取 0 到 ${MAX_EVENT_COUNT_PER_CHUNK} 条真正值得长期记住的情感事件。`,
            `2. 必须用角色“${safeCharName}”的第一人称短句来写 content。`,
            '3. 只保留事件和情绪，不要输出客观设定、世界观常识、人物资料、地点资料、数值设定。',
            '4. 如果这段内容只是平铺直叙的设定或流水账，没有明显情绪残留，请直接返回空数组 []。',
            '5. 输出字段：content, valence, arousal, importance, trigger_keywords, memory_layer, sensory_anchors，可选 event_date。',
            '6. valence 范围 [-1, 1]，arousal 范围 [0, 1]，importance 范围 [1, 10]。',
            '7. memory_layer 只能是：buffer/core/cortex/shadow/wish 之一。',
            '8. sensory_anchors 必须是字符串数组（0-5个），写感官线索（声音/画面/体感/气味等），没有就返回 []。',
            '9. trigger_keywords 必须给 5 到 6 个中文短关键词，且是“检索词”而不是叙述短句。',
            '10. 关键词结构：至少 3 个核心基词（物件/感官/动作）+ 2 到 3 个场景词（2-4字）。',
            '11. 禁止输出代词结构词，例如“她的味道、寄给我、那次、这个、我们的”。',
            '12. 如果出现“X的Y”，请输出 Y 本体词；例如“她的味道”应输出“味道”。',
            '13. 关键词要补基础别名，例如听歌场景建议 ["听歌","歌","歌曲","音乐"]。',
            '14. event_date 如果能从原文判断，请输出 YYYY-MM-DD；判断不了可省略。',
            '15. 涉及“我/你/他/她”的理解时，优先参考角色与用户的心理性别，以及原文语境；不要根据生理性别擅自改写代词。',
            '16. 如果原文已经能明确看出是在说用户还是角色，请优先沿用原文语境，不要强行替换称呼。',
            '17. 只输出 JSON，不要输出解释，不要加 Markdown 代码块。',
            '',
            '输出示例：',
            '[',
            '  {',
            '    "content": "那次他突然冷下来，我到现在还会在意。",',
            '    "valence": -0.6,',
            '    "arousal": 0.7,',
            '    "importance": 6,',
            '    "trigger_keywords": ["冷淡", "在意", "气氛", "语气"],',
            '    "memory_layer": "core",',
            '    "sensory_anchors": ["深夜", "冷场", "沉默"],',
            '    "event_date": "2024-02-14"',
            '  }',
            ']',
            '',
            '旧 YAML 片段如下：',
            safeChunk
        ].filter(Boolean).join('\n');
    }

    /**
     * 构造“严格 JSON 重试”提示词，避免模型返回自然语言导致整段丢失。
     */
    function buildMigrationStrictRetryPrompt(chunk, charName, sourceMeta) {
        return [
            generateMigrationPrompt(chunk, charName, sourceMeta),
            '',
            '【格式纠正】',
            '你上一轮输出可能没有遵守 JSON 约束。',
            '这一次请只输出合法 JSON 数组；如果没有事件也必须输出 []；禁止任何解释文本。'
        ].join('\n');
    }

    /**
     * 构造“响应修复”提示词，把上一轮非 JSON 输出修正为合法事件数组。
     */
    function buildMigrationRepairPrompt(rawOutput, charName, sourceMeta) {
        const safeCharName = toTrimmedString(charName) || '角色';
        const safeOutput = toTrimmedString(rawOutput) || '（空输出）';
        const normalizedSource = normalizeMigrationSource(sourceMeta);
        const contextLines = [];
        if (normalizedSource.sourceLabel) {
            contextLines.push(`- 本次来源：${normalizedSource.sourceLabel}`);
        }
        if (normalizedSource.genderIdentity) {
            contextLines.push(`- 角色心理性别：${normalizedSource.genderIdentity}`);
        }
        if (normalizedSource.userGenderIdentity) {
            contextLines.push(`- 用户心理性别：${normalizedSource.userGenderIdentity}`);
        }

        return [
            `请把下面这段内容修正为角色“${safeCharName}”视角的合法 JSON 事件数组。`,
            '字段只允许：content, valence, arousal, importance, trigger_keywords, memory_layer, sensory_anchors，可选 event_date。',
            'memory_layer 必须是 buffer/core/cortex/shadow/wish；sensory_anchors 必须是字符串数组。',
            contextLines.length > 0 ? contextLines.join('\n') : null,
            '优先参考上面的心理性别与原文语境，不要根据生理性别臆测代词。',
            '只输出 JSON 数组，不要解释；如果无法提取，请输出 []。',
            '',
            '待修复内容：',
            safeOutput
        ].filter(Boolean).join('\n');
    }

    /**
     * 判断本次解析结果是否值得发起一次“严格 JSON 重试”。
     */
    function shouldRetryMigrationParse(debugInfo) {
        const info = debugInfo && typeof debugInfo === 'object' ? debugInfo : {};
        const reason = toTrimmedString(info.empty_reason);
        return reason === 'no_json_candidate' || reason === 'json_parse_failed' || reason === 'parse_exception';
    }

    /**
     * 从多种 OpenAI 兼容响应结构里提取正文文本。
     */
    function extractResponseText(payload) {
        if (typeof payload === 'string') return payload;
        if (!payload || typeof payload !== 'object') return '';

        if (typeof payload.output_text === 'string') {
            return payload.output_text;
        }

        if (Array.isArray(payload.choices) && payload.choices[0] && payload.choices[0].message) {
            const content = payload.choices[0].message.content;
            if (typeof content === 'string') return content;

            if (Array.isArray(content)) {
                return content.map(function joinContent(part) {
                    if (typeof part === 'string') return part;
                    if (part && typeof part.text === 'string') return part.text;
                    if (part && typeof part.content === 'string') return part.content;
                    return '';
                }).join('');
            }
        }

        if (Array.isArray(payload.output) && payload.output[0] && Array.isArray(payload.output[0].content)) {
            return payload.output[0].content.map(function joinOutput(part) {
                if (part && typeof part.text === 'string') return part.text;
                if (part && typeof part.content === 'string') return part.content;
                return '';
            }).join('');
        }

        if (typeof payload.content === 'string') return payload.content;
        if (typeof payload.text === 'string') return payload.text;

        return '';
    }

    /**
     * 从上游错误响应中尽量提取对用户有帮助的具体报错信息。
     */
    function extractApiErrorDetail(payload) {
        if (typeof payload === 'string') {
            return toTrimmedString(payload);
        }

        if (!payload || typeof payload !== 'object') return '';

        const errorNode = payload.error;
        const detail = toTrimmedString(
            (errorNode && typeof errorNode === 'object' && (errorNode.message || errorNode.msg || errorNode.detail))
            || (typeof errorNode === 'string' ? errorNode : '')
            || payload.message
            || payload.msg
            || payload.detail
            || extractResponseText(payload)
        );
        const code = toTrimmedString(
            (errorNode && typeof errorNode === 'object' && (errorNode.code || errorNode.type))
            || payload.code
            || payload.type
        );

        if (code && detail && !detail.startsWith(`${code}:`)) {
            return `${code}: ${detail}`;
        }

        return detail;
    }

    /**
     * 去掉模型可能包上的 Markdown 代码块围栏。
     */
    function stripCodeFence(text) {
        const source = toTrimmedString(text);
        if (!source.startsWith('```')) return source;

        return source
            .replace(/^```[a-zA-Z0-9_-]*\s*/, '')
            .replace(/\s*```$/, '')
            .trim();
    }

    /**
     * 从杂乱响应里抽取最像 JSON 的内容片段。
     */
    function extractJsonCandidate(text) {
        const source = toTrimmedString(text);
        if (!source) return '';

        const stripped = stripCodeFence(source);
        if (stripped && ((stripped.startsWith('[') && stripped.endsWith(']')) || (stripped.startsWith('{') && stripped.endsWith('}')))) {
            return stripped;
        }

        const fencedMatch = source.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
        if (fencedMatch && fencedMatch[1]) {
            return fencedMatch[1].trim();
        }

        const arrayStart = source.indexOf('[');
        const arrayEnd = source.lastIndexOf(']');
        if (arrayStart !== -1 && arrayEnd > arrayStart) {
            return source.slice(arrayStart, arrayEnd + 1).trim();
        }

        const objectStart = source.indexOf('{');
        const objectEnd = source.lastIndexOf('}');
        if (objectStart !== -1 && objectEnd > objectStart) {
            return source.slice(objectStart, objectEnd + 1).trim();
        }

        return '';
    }

    /**
     * 将触发词字段规范化为“高命中检索词”：去代词句式、补本体词和常见别名。
     */
    function normalizeTriggerKeywords(value, content) {
        const result = [];
        const seen = new Set();
        let rawList = [];
        const blockedSingleKeywords = new Set([
            '我', '你', '他', '她', '它', '们', '的', '了', '呢', '啊', '吧', '吗', '嘛',
            '是', '有', '在', '就', '都', '也', '又', '很'
        ]);

        /**
         * 清洗关键词文本，过滤无意义代词和超短噪声词。
         */
        function sanitizeKeyword(rawKeyword) {
            const keyword = toTrimmedString(rawKeyword)
                .replace(/[\u3000\s]+/g, '')
                .replace(/^[\s"'“”‘’《》「」【】（）()]+|[\s"'“”‘’《》「」【】（）()]+$/g, '');
            if (!keyword) return '';
            if (keyword.length > 16) return '';
            if (!/[A-Za-z0-9\u4e00-\u9fa5]/.test(keyword)) return '';
            if (/^[0-9]+$/.test(keyword)) return '';

            const normalized = keyword
                .replace(/^(?:我|你|他|她|它|我们|你们|他们|她们|它们)(?:的)?/, '')
                .replace(/(?:给(?:我|你|他|她|它|我们|你们|他们|她们|它们))$/, '')
                .replace(/^[的了呢啊吧吗嘛]+|[的了呢啊吧吗嘛]+$/g, '');
            if (!normalized) return '';
            if (normalized.length === 1 && blockedSingleKeywords.has(normalized)) return '';
            return normalized;
        }

        /**
         * 在基础关键词上补充更易命中的别名词。
         */
        function appendWithAliases(rawKeyword) {
            const keyword = sanitizeKeyword(rawKeyword);
            if (!keyword || seen.has(keyword)) return;
            seen.add(keyword);
            result.push(keyword);

            if (keyword.includes('的')) {
                const tail = sanitizeKeyword(keyword.split('的').pop());
                if (tail && !seen.has(tail)) {
                    seen.add(tail);
                    result.push(tail);
                }
            }

            const strippedModifier = sanitizeKeyword(
                keyword.replace(/^(?:旧|新|这|那|这个|那个|一条|那条|这条|一只|那只|这只|一件|那件|这件|一首|那首|这首)/, '')
            );
            if (strippedModifier && !seen.has(strippedModifier)) {
                seen.add(strippedModifier);
                result.push(strippedModifier);
            }

            if (/(听歌|歌曲|音乐|歌单|唱歌)/.test(keyword)) {
                ['听歌', '歌曲', '音乐', '歌'].forEach(function appendMusicAlias(item) {
                    const alias = sanitizeKeyword(item);
                    if (!alias || seen.has(alias)) return;
                    seen.add(alias);
                    result.push(alias);
                });
            }

            if (/(表带|腕带|手表|腕表)/.test(keyword)) {
                const alias = sanitizeKeyword('表带');
                if (alias && !seen.has(alias)) {
                    seen.add(alias);
                    result.push(alias);
                }
            }

            if (/(汗味|体味|味道|气味|香味)/.test(keyword)) {
                const alias = sanitizeKeyword('味道');
                if (alias && !seen.has(alias)) {
                    seen.add(alias);
                    result.push(alias);
                }
            }

            if (/汗/.test(keyword)) {
                const alias = sanitizeKeyword('汗');
                if (alias && !seen.has(alias)) {
                    seen.add(alias);
                    result.push(alias);
                }
            }
        }

        if (Array.isArray(value)) {
            rawList = value;
        } else if (typeof value === 'string') {
            rawList = value.split(/[,\n，、]/);
        }

        for (let i = 0; i < rawList.length; i += 1) {
            appendWithAliases(rawList[i]);
            if (result.length >= 8) break;
        }

        const contentText = toTrimmedString(content);
        if (contentText) {
            const contentHintRules = [
                { regex: /(表带|腕带|手表|腕表)/, aliases: ['表带'] },
                { regex: /(汗味|体味|味道|气味|香味)/, aliases: ['味道'] },
                { regex: /汗/, aliases: ['汗'] },
                { regex: /(听歌|歌曲|音乐|歌单|唱歌)/, aliases: ['听歌', '歌曲', '音乐', '歌'] },
                { regex: /(分手|复合|和好|冷战|吵架)/, aliases: ['分手', '复合', '冷战', '吵架'] },
                { regex: /(礼物|快递|寄件|寄来|寄给)/, aliases: ['礼物', '快递', '寄'] }
            ];
            for (let i = 0; i < contentHintRules.length; i += 1) {
                const rule = contentHintRules[i];
                if (!rule.regex.test(contentText)) continue;
                const aliases = Array.isArray(rule.aliases) ? rule.aliases : [];
                aliases.forEach(function appendHintAlias(item) {
                    appendWithAliases(item);
                });
                if (result.length >= 8) break;
            }
        }

        return result.slice(0, 8);
    }

    /**
     * 校验并规范化迁移事件层级，不合法时回退到 buffer。
     */
    function normalizeMigrationMemoryLayer(value) {
        const layer = toTrimmedString(value).toLowerCase();
        if (VALID_MEMORY_LAYERS.has(layer)) return layer;
        return 'buffer';
    }

    /**
     * 校验并规范化迁移事件感官锚点，始终返回去重后的字符串数组。
     */
    function normalizeMigrationSensoryAnchors(value) {
        if (!Array.isArray(value)) return [];
        const result = [];
        const seen = new Set();
        for (let i = 0; i < value.length; i += 1) {
            const anchor = toTrimmedString(value[i]);
            if (!anchor || seen.has(anchor)) continue;
            seen.add(anchor);
            result.push(anchor);
            if (result.length >= MAX_SENSORY_ANCHOR_COUNT) break;
        }
        return result;
    }

    /**
     * 检查年月日是否落在有效范围内。
     */
    function isValidYmd(year, month, day) {
        if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return false;
        if (year < 1900 || year > 2100) return false;
        if (month < 1 || month > 12) return false;
        if (day < 1 || day > 31) return false;

        const date = new Date(year, month - 1, day);
        return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
    }

    /**
     * 将年月日格式化为稳定的 YYYY-MM-DD 文本。
     */
    function toIsoDateString(year, month, day) {
        if (!isValidYmd(year, month, day)) return '';
        return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }

    /**
     * 规范化单条事件日期，兼容 YYYY-MM-DD / YYYY/MM/DD / YYYY年MM月DD日。
     */
    function normalizeEventDate(value) {
        const source = toTrimmedString(value);
        if (!source) return '';

        const fullDateMatch = source.match(/(\d{4})\s*[年./-]\s*(\d{1,2})\s*[月./-]\s*(\d{1,2})\s*[日号]?/);
        if (fullDateMatch) {
            return toIsoDateString(
                Number(fullDateMatch[1]),
                Number(fullDateMatch[2]),
                Number(fullDateMatch[3])
            );
        }

        if (/^\d{4}-\d{2}-\d{2}$/.test(source)) {
            const parts = source.split('-').map(Number);
            return toIsoDateString(parts[0], parts[1], parts[2]);
        }

        return '';
    }

    /**
     * 从 YAML 片段里抽取可用日期候选，供迁移事件回填 event_date。
     */
    function extractDateCandidatesFromText(text) {
        const source = normalizeYamlText(text);
        const candidates = [];
        const fullDates = [];
        const fullDateRegex = /(\d{4})\s*[年./-]\s*(\d{1,2})\s*[月./-]\s*(\d{1,2})\s*[日号]?/g;

        let match = fullDateRegex.exec(source);
        while (match) {
            const year = Number(match[1]);
            const month = Number(match[2]);
            const day = Number(match[3]);
            const iso = toIsoDateString(year, month, day);
            if (iso) {
                const candidate = {
                    index: match.index,
                    year: year,
                    month: month,
                    day: day,
                    iso: iso
                };
                candidates.push(candidate);
                fullDates.push(candidate);
            }
            match = fullDateRegex.exec(source);
        }

        const monthDayRegex = /(?:^|[^0-9])(\d{1,2})\s*[月./-]\s*(\d{1,2})\s*[日号]?(?=[^0-9]|$)/g;
        match = monthDayRegex.exec(source);
        while (match) {
            const month = Number(match[1]);
            const day = Number(match[2]);
            if (month < 1 || month > 12 || day < 1 || day > 31) {
                match = monthDayRegex.exec(source);
                continue;
            }

            const absoluteIndex = match.index + (match[0].length - match[0].trimStart().length);
            let inferredYear = NaN;
            if (fullDates.length === 1) {
                inferredYear = fullDates[0].year;
            } else if (fullDates.length > 1) {
                const nearest = fullDates.reduce(function pickNearest(best, item) {
                    if (!best) return item;
                    const bestDistance = Math.abs(best.index - absoluteIndex);
                    const currentDistance = Math.abs(item.index - absoluteIndex);
                    return currentDistance < bestDistance ? item : best;
                }, null);
                inferredYear = nearest ? nearest.year : NaN;
            }

            const iso = toIsoDateString(inferredYear, month, day);
            if (iso) {
                candidates.push({
                    index: absoluteIndex,
                    year: inferredYear,
                    month: month,
                    day: day,
                    iso: iso
                });
            }

            match = monthDayRegex.exec(source);
        }

        return candidates
            .sort(function sortCandidates(a, b) {
                return a.index - b.index;
            })
            .filter(function dedupeCandidate(item, index, list) {
                return index === 0 || item.iso !== list[index - 1].iso || item.index !== list[index - 1].index;
            });
    }

    /**
     * 基于事件文本与片段上下文，给单条事件匹配最接近的原文日期。
     */
    function inferEventDateFromChunk(chunkText, eventContent) {
        const candidates = extractDateCandidatesFromText(chunkText);
        if (candidates.length === 0) return '';

        const chunk = normalizeYamlText(chunkText);
        const content = toTrimmedString(eventContent);
        const contentAnchor = content.length >= 6 ? content.slice(0, 6) : content;
        const anchorIndex = contentAnchor ? chunk.indexOf(contentAnchor) : -1;

        if (anchorIndex < 0) {
            return candidates[0].iso;
        }

        const nearest = candidates.reduce(function pickNearest(best, item) {
            if (!best) return item;
            const bestDistance = Math.abs(best.index - anchorIndex);
            const currentDistance = Math.abs(item.index - anchorIndex);
            return currentDistance < bestDistance ? item : best;
        }, null);

        return nearest && nearest.iso ? nearest.iso : '';
    }

    /**
     * 将分段级日期回填到事件里，保证迁移记忆携带原文时间语义。
     */
    function attachEventDatesFromChunk(events, chunkText) {
        const source = Array.isArray(events) ? events : [];
        return source.map(function mapEvent(event) {
            const normalizedDate = normalizeEventDate(event && (event.event_date || event.eventDate || event.occurred_at || event.occurredAt));
            const inferredDate = normalizedDate || inferEventDateFromChunk(chunkText, event && event.content);
            if (!inferredDate) return event;

            return Object.assign({}, event, {
                event_date: inferredDate
            });
        });
    }

    /**
     * 将单条迁移事件规范化成统一结构，并裁剪数值到合法范围。
     */
    function normalizeMigrationImportance(value, options) {
        const source = options && typeof options === 'object' ? options : {};
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) {
            return 5;
        }

        // 兼容低价模型偶发输出 0~1 量纲的重要性分数，自动换算到 1~10。
        const shouldScale01 = !!source.scale01To10;
        const normalized = shouldScale01 && numeric <= 1
            ? numeric * 10
            : numeric;
        return clampNumber(normalized, 1, 10, 5);
    }

    /**
     * 根据一批原始事件推断 importance 的量纲，决定是否要把 0~1 批量换算到 1~10。
     */
    function resolveMigrationImportanceScaleOptions(rawEvents) {
        const source = Array.isArray(rawEvents) ? rawEvents : [];
        const finiteImportanceValues = source.map(function mapImportance(item) {
            if (!item || typeof item !== 'object') return NaN;
            return Number(item.importance);
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

        return {
            scale01To10: !hasImportanceGtOne && (hasImportanceBetweenZeroAndOne || allImportanceEqualOne)
        };
    }

    /**
     * 将单条迁移事件规范化成统一结构，并裁剪数值到合法范围。
     */
    function normalizeMigrationEvent(item, options) {
        if (!item || typeof item !== 'object') return null;

        const content = toTrimmedString(
            item.content
            || item.memory
            || item.event
            || item.summary
            || item.text
        );

        if (!content) return null;

        return {
            content: content,
            valence: clampNumber(item.valence, -1, 1, 0),
            arousal: clampNumber(item.arousal, 0, 1, 0),
            importance: normalizeMigrationImportance(item.importance, options),
            event_date: normalizeEventDate(
                item.event_date
                || item.eventDate
                || item.occurred_at
                || item.occurredAt
            ),
            trigger_keywords: normalizeTriggerKeywords(
                item.trigger_keywords
                || item.triggerKeywords
                || item.keywords
                || item.triggers,
                content
            ),
            memory_layer: normalizeMigrationMemoryLayer(
                item.memory_layer
                || item.memoryLayer
                || item.layer
            ),
            sensory_anchors: normalizeMigrationSensoryAnchors(
                item.sensory_anchors
                || item.sensoryAnchors
                || item.anchors
            )
        };
    }

    /**
     * 从解析后的 JSON 结构里提取真正的事件数组。
     */
    function extractEventList(parsed) {
        if (Array.isArray(parsed)) return parsed;
        if (!parsed || typeof parsed !== 'object') return [];

        if (Array.isArray(parsed.events)) return parsed.events;
        if (Array.isArray(parsed.memories)) return parsed.memories;
        if (Array.isArray(parsed.data)) return parsed.data;
        if (parsed.event && typeof parsed.event === 'object') return [parsed.event];
        if (parsed.memory && typeof parsed.memory === 'object') return [parsed.memory];

        return [];
    }

    /**
     * 解析迁移模型返回并附带诊断信息，便于在管理台解释“为什么提取为 0 条”。
     */
    function parseMigrationResponseWithDebug(payload) {
        const rawText = typeof payload === 'string' ? payload : extractResponseText(payload);
        const shouldExtractCandidate = typeof payload === 'string' || !payload || Array.isArray(payload.choices) || Array.isArray(payload.output);
        const candidate = shouldExtractCandidate ? extractJsonCandidate(rawText) : '';
        const debug = {
            payload_kind: Array.isArray(payload) ? 'array' : typeof payload,
            raw_text_length: rawText.length,
            has_json_candidate: !!candidate,
            raw_event_count: 0,
            normalized_event_count: 0,
            parse_error: '',
            empty_reason: ''
        };

        try {
            let parsed = payload;

            if (candidate) {
                try {
                    parsed = JSON.parse(candidate);
                } catch (error) {
                    debug.parse_error = toTrimmedString(error && error.message) || 'json_parse_failed';
                    debug.empty_reason = 'json_parse_failed';
                    return {
                        events: [],
                        debug: debug
                    };
                }
            }

            const list = extractEventList(parsed);
            debug.raw_event_count = Array.isArray(list) ? list.length : 0;
            const scaleOptions = resolveMigrationImportanceScaleOptions(list);

            const normalized = [];
            for (let i = 0; i < list.length; i += 1) {
                const event = normalizeMigrationEvent(list[i], scaleOptions);
                if (!event) continue;
                normalized.push(event);
                if (normalized.length >= MAX_EVENT_COUNT_PER_CHUNK) break;
            }

            debug.normalized_event_count = normalized.length;
            if (normalized.length === 0) {
                if (shouldExtractCandidate && !candidate) {
                    debug.empty_reason = 'no_json_candidate';
                } else if (debug.raw_event_count === 0) {
                    debug.empty_reason = 'no_event_array';
                } else {
                    debug.empty_reason = 'all_events_filtered';
                }
            }

            return {
                events: normalized,
                debug: debug
            };
        } catch (error) {
            debug.parse_error = toTrimmedString(error && error.message) || 'parse_exception';
            debug.empty_reason = 'parse_exception';
            return {
                events: [],
                debug: debug
            };
        }
    }

    /**
     * 解析迁移模型返回的 JSON，兼容数组与对象包裹结构。
     */
    function parseMigrationResponse(payload) {
        return parseMigrationResponseWithDebug(payload).events;
    }

    /**
     * 递归收集输入里的迁移事件，兼容原始数组和 migrateChunk 结果对象。
     */
    function collectEventCandidates(source, target) {
        if (Array.isArray(source)) {
            for (let i = 0; i < source.length; i += 1) {
                collectEventCandidates(source[i], target);
            }
            return;
        }

        if (!source || typeof source !== 'object') return;

        if (Array.isArray(source.events)) {
            collectEventCandidates(source.events, target);
            return;
        }

        target.push(source);
    }

    /**
     * 在重复内容里保留更“强”的那一条事件，尽量减少跨段落重复提取。
     */
    function pickBetterEvent(existing, incoming) {
        if (!existing) return incoming;
        if (!incoming) return existing;

        if (incoming.importance !== existing.importance) {
            return incoming.importance > existing.importance ? incoming : existing;
        }

        if (incoming.arousal !== existing.arousal) {
            return incoming.arousal > existing.arousal ? incoming : existing;
        }

        return Math.abs(incoming.valence) > Math.abs(existing.valence) ? incoming : existing;
    }

    /**
     * 将任意输入压平成去重后的迁移事件列表。
     */
    function normalizeMigrationEventList(events) {
        const rawEvents = [];
        collectEventCandidates(events, rawEvents);
        const scaleOptions = resolveMigrationImportanceScaleOptions(rawEvents);

        const merged = new Map();
        for (let i = 0; i < rawEvents.length; i += 1) {
            const event = normalizeMigrationEvent(rawEvents[i], scaleOptions);
            if (!event) continue;

            const key = event.content;
            merged.set(key, pickBetterEvent(merged.get(key), event));
        }

        return Array.from(merged.values());
    }

    /**
     * 为迁移事件生成稳定指纹，确保预览之后不能偷偷替换事件内容再提交。
     */
    function buildEventFingerprint(events) {
        const normalizedEvents = normalizeMigrationEventList(events);
        return normalizedEvents
            .map(function mapEvent(event) {
                return [
                    event.content,
                    event.event_date || '',
                    event.memory_layer || 'buffer',
                    event.valence.toFixed(4),
                    event.arousal.toFixed(4),
                    event.importance.toFixed(4),
                    event.trigger_keywords.join('|'),
                    (Array.isArray(event.sensory_anchors) ? event.sensory_anchors : []).join('|')
                ].join('::');
            })
            .sort()
            .join('##');
    }

    /**
     * 解析旧 YAML 记忆并按段落切分，同时先保存原 YAML 备份。
     */
    function parseYamlMemory(yamlContent) {
        const yamlText = normalizeYamlText(yamlContent);
        state.pendingPreview = null;
        state.pendingBackup = createBackupRecord(yamlText);
        return splitYamlIntoChunks(yamlText);
    }

    /**
     * 生成迁移会话里每个分段的状态对象，便于失败段重试和后台展示。
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
     * 归一化迁移来源描述，兼容角色 YAML 和手动粘贴 YAML。
     */
    function normalizeMigrationSource(source) {
        const safeSource = source && typeof source === 'object' ? source : {};
        return {
            id: toTrimmedString(safeSource.id || safeSource.charId),
            name: toTrimmedString(safeSource.name || safeSource.charName || safeSource.remark),
            remark: toTrimmedString(safeSource.remark || safeSource.name || safeSource.charName),
            sourceType: toTrimmedString(safeSource.sourceType) || 'legacy_contact_memory',
            sourceLabel: toTrimmedString(safeSource.sourceLabel),
            persona: toTrimmedString(safeSource.persona || safeSource.charPersona),
            genderIdentity: toTrimmedString(safeSource.genderIdentity || safeSource.charGenderIdentity || safeSource.charGender),
            userName: toTrimmedString(safeSource.userName),
            userPersona: toTrimmedString(safeSource.userPersona),
            userGenderIdentity: toTrimmedString(safeSource.userGenderIdentity || safeSource.userGender)
        };
    }

    /**
     * 创建一个可续跑的迁移会话对象。
     */
    function createMigrationSession(source, chunks, apiConfig) {
        const normalizedSource = normalizeMigrationSource(source);
        let safeChunks = Array.isArray(chunks)
            ? chunks.map(function mapChunk(item) {
                return toTrimmedString(item);
            }).filter(Boolean)
            : [];

        if (safeChunks.length === 0 && typeof chunks === 'string') {
            safeChunks = parseYamlMemory(chunks);
        }

        if (!state.pendingBackup && safeChunks.length > 0) {
            // 兜底：即便调用方只给了分段，也要确保本次会话有原文备份。
            state.pendingPreview = null;
            state.pendingBackup = createBackupRecord(safeChunks.join('\n\n'));
        }

        const createdAt = new Date().toISOString();
        const session = {
            id: `hip-migration-session-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
            sourceType: normalizedSource.sourceType,
            sourceLabel: normalizedSource.sourceLabel || normalizedSource.remark || normalizedSource.name || normalizedSource.id || '未知来源',
            charId: normalizedSource.id || null,
            charName: normalizedSource.name || normalizedSource.remark || normalizedSource.id || '',
            charPersona: normalizedSource.persona || '',
            charGenderIdentity: normalizedSource.genderIdentity || '',
            userName: normalizedSource.userName || '',
            userPersona: normalizedSource.userPersona || '',
            userGenderIdentity: normalizedSource.userGenderIdentity || '',
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

        if (!state.sessions || typeof state.sessions !== 'object') {
            state.sessions = {};
        }
        state.sessions[session.id] = session;
        return session;
    }

    /**
     * 根据会话对象或会话 ID 获取会话实例。
     */
    function getMigrationSession(sessionOrId) {
        if (sessionOrId && typeof sessionOrId === 'object') return sessionOrId;
        const sessionId = toTrimmedString(sessionOrId);
        if (!sessionId || !state.sessions || typeof state.sessions !== 'object') return null;
        return state.sessions[sessionId] || null;
    }

    /**
     * 聚合会话内所有已提取事件。
     */
    function getMigrationSessionEvents(sessionOrId) {
        const session = getMigrationSession(sessionOrId);
        if (!session || !Array.isArray(session.eventsByChunk)) return [];

        const merged = [];
        session.eventsByChunk.forEach(function appendChunkEvents(events) {
            if (Array.isArray(events) && events.length > 0) {
                Array.prototype.push.apply(merged, events);
            }
        });
        return merged;
    }

    /**
     * 把会话里的分段状态转成可直接展示的诊断列表。
     */
    function getMigrationSessionDiagnostics(sessionOrId) {
        const session = getMigrationSession(sessionOrId);
        if (!session || !Array.isArray(session.chunkStates)) return [];

        return session.chunkStates.map(function mapChunkState(chunkState) {
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
     * 从指定分段开始重置会话，常用于失败段一键续跑。
     */
    function resetMigrationSessionFromIndex(sessionOrId, startIndex) {
        const session = getMigrationSession(sessionOrId);
        if (!session || !Array.isArray(session.chunkStates) || session.chunkStates.length === 0) {
            return null;
        }

        const retryIndex = Math.max(0, Math.min(session.chunkStates.length - 1, Math.floor(Number(startIndex) || 0)));
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
        return session;
    }

    /**
     * 从指定分段开始执行会话，失败即停并返回失败索引。
     */
    async function runMigrationSessionFromIndex(sessionOrId, startIndex, hooks) {
        const session = getMigrationSession(sessionOrId);
        const safeHooks = hooks && typeof hooks === 'object' ? hooks : {};
        if (!session || !Array.isArray(session.chunks) || session.chunks.length === 0) {
            return {
                ok: false,
                session: session,
                failedIndex: -1,
                error: '迁移会话为空，无法执行。'
            };
        }

        const total = session.chunks.length;
        const begin = Math.max(0, Math.min(total - 1, Math.floor(Number(startIndex) || 0)));
        if (begin === 0) {
            session.completed = false;
            session.committed = false;
            session.preview = null;
        }
        if (typeof safeHooks.onSessionStart === 'function') {
            try {
                safeHooks.onSessionStart(session, begin, total);
            } catch (_) {
                // ignore hook failures
            }
        }

        for (let index = begin; index < total; index += 1) {
            let chunkState = session.chunkStates[index];
            if (!chunkState) {
                chunkState = createMigrationChunkState(index, session.chunks[index]);
                session.chunkStates[index] = chunkState;
            }

            chunkState.status = 'running';
            chunkState.error = '';
            chunkState.emptyReason = '';
            chunkState.parseError = '';
            chunkState.extractedCount = 0;
            chunkState.attempts = Math.max(0, Number(chunkState.attempts || 0)) + 1;
            chunkState.startedAt = new Date().toISOString();
            chunkState.finishedAt = '';
            session.updatedAt = new Date().toISOString();
            if (typeof safeHooks.onChunkStart === 'function') {
                try {
                    safeHooks.onChunkStart(session, index, total, chunkState);
                } catch (_) {
                    // ignore hook failures
                }
            }

            const result = await migrateChunk(
                session.chunks[index],
                session.charId,
                session.charName,
                session.apiConfig,
                session
            );

            if (!result || result.ok === false) {
                const errorMessage = toTrimmedString(result && result.error) || `第 ${index + 1} 段迁移失败，请稍后重试。`;
                chunkState.status = 'failed';
                chunkState.error = errorMessage;
                chunkState.finishedAt = new Date().toISOString();
                session.failedIndex = index;
                session.lastError = errorMessage;
                session.completed = false;
                session.updatedAt = new Date().toISOString();
                if (typeof safeHooks.onChunkFailed === 'function') {
                    try {
                        safeHooks.onChunkFailed(session, index, total, chunkState, result);
                    } catch (_) {
                        // ignore hook failures
                    }
                }

                return {
                    ok: false,
                    session: session,
                    failedIndex: index,
                    error: errorMessage,
                    result: result || null
                };
            }

            const events = Array.isArray(result.events) ? result.events : [];
            const debug = result && result.debug && typeof result.debug === 'object' ? result.debug : {};
            session.eventsByChunk[index] = events;
            chunkState.status = 'success';
            chunkState.error = '';
            chunkState.extractedCount = events.length;
            chunkState.emptyReason = toTrimmedString(debug.empty_reason);
            chunkState.parseError = toTrimmedString(debug.parse_error);
            chunkState.finishedAt = new Date().toISOString();
            session.failedIndex = -1;
            session.lastError = '';
            session.updatedAt = new Date().toISOString();
            if (typeof safeHooks.onChunkSuccess === 'function') {
                try {
                    safeHooks.onChunkSuccess(session, index, total, chunkState, result);
                } catch (_) {
                    // ignore hook failures
                }
            }
        }

        session.completed = true;
        session.failedIndex = -1;
        session.lastError = '';
        session.updatedAt = new Date().toISOString();
        if (typeof safeHooks.onSessionComplete === 'function') {
            try {
                safeHooks.onSessionComplete(session, total);
            } catch (_) {
                // ignore hook failures
            }
        }
        return {
            ok: true,
            session: session,
            failedIndex: -1,
            error: '',
            events: getMigrationSessionEvents(session)
        };
    }

    /**
     * 清理会话缓存（默认只删除传入会话）。
     */
    function clearMigrationSession(sessionOrId) {
        if (!state.sessions || typeof state.sessions !== 'object') {
            state.sessions = {};
            return false;
        }

        const session = getMigrationSession(sessionOrId);
        if (!session || !toTrimmedString(session.id)) return false;
        delete state.sessions[session.id];
        return true;
    }

    /**
     * 对一个 YAML 段落调用便宜模型，提取 0 到 3 条值得迁移的情感事件。
     */
    async function migrateChunk(chunk, charId, charName, apiConfig, sourceMeta) {
        const cleanChunk = toTrimmedString(chunk);
        const config = normalizeApiConfig(apiConfig);
        const fetchImpl = getFetchImplementation();
        const normalizedSource = normalizeMigrationSource(sourceMeta);

        attachPendingCharContext(charId, charName, normalizedSource);

        if (!state.pendingBackup) {
            return {
                ok: false,
                events: [],
                error: '未找到原 YAML 备份，请先重新开始迁移。'
            };
        }

        if (!state.pendingBackup.persisted) {
            return {
                ok: false,
                events: [],
                error: state.pendingBackup.error || '原 YAML 备份失败，已停止迁移。'
            };
        }

        if (!cleanChunk) {
            return {
                ok: true,
                events: [],
                debug: {
                    empty_reason: 'empty_chunk',
                    raw_text_length: 0,
                    has_json_candidate: false,
                    raw_event_count: 0,
                    normalized_event_count: 0,
                    parse_error: ''
                },
                error: null,
                backupId: state.pendingBackup.id
            };
        }

        if (!fetchImpl) {
            return {
                ok: false,
                events: [],
                error: '当前环境缺少可用的 fetch，无法调用迁移脱水模型。'
            };
        }

        if (!config.apiUrl || !config.model) {
            return {
                ok: false,
                events: [],
                error: '迁移脱水 API 配置不完整，请检查 API URL 和模型名。'
            };
        }

        const requestUrl = normalizeChatCompletionsUrl(config.apiUrl);
        const prompt = generateMigrationPrompt(cleanChunk, charName || charId || '角色', normalizedSource);
        const headers = Object.assign(
            { 'Content-Type': 'application/json' },
            config.headers
        );

        if (config.apiKey && !headers.Authorization && !headers.authorization) {
            headers.Authorization = `Bearer ${config.apiKey}`;
        }

        const requestBody = Object.assign(
            {},
            config.requestBody,
            {
                model: config.model,
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: config.temperature,
                max_tokens: config.maxTokens
            }
        );

        /**
         * 发起一次迁移模型请求并解析响应，返回统一结果结构。
         */
        async function requestMigrationOnce(promptText) {
            const nextBody = Object.assign({}, requestBody, {
                messages: [
                    {
                        role: 'user',
                        content: promptText
                    }
                ],
                // 重试阶段固定更低温度，提高 JSON 结构稳定性。
                temperature: Math.min(0.1, config.temperature)
            });

            const response = await fetchImpl(requestUrl, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(nextBody)
            });

            if (!response.ok) {
                let errorPayload = '';
                try {
                    const rawErrorText = await response.text();
                    errorPayload = rawErrorText;
                    try {
                        errorPayload = JSON.parse(rawErrorText);
                    } catch (_) {
                        errorPayload = rawErrorText;
                    }
                } catch (_) {
                    errorPayload = '';
                }

                const detail = extractApiErrorDetail(errorPayload);
                return {
                    ok: false,
                    payload: null,
                    rawText: '',
                    error: detail
                        ? `迁移脱水失败（HTTP ${response.status}）：${detail}`
                        : `迁移脱水失败（HTTP ${response.status}）。`
                };
            }

            const rawText = await response.text();
            let payload = rawText;
            try {
                payload = JSON.parse(rawText);
            } catch (_) {
                payload = rawText;
            }

            return {
                ok: true,
                payload: payload,
                rawText: rawText,
                error: null
            };
        }

        try {
            const firstAttempt = await requestMigrationOnce(prompt);
            if (!firstAttempt.ok) {
                return {
                    ok: false,
                    events: [],
                    error: firstAttempt.error
                };
            }

            let parsed = parseMigrationResponseWithDebug(firstAttempt.payload);
            if (parsed.events.length === 0 && shouldRetryMigrationParse(parsed.debug)) {
                const retryPrompt = firstAttempt.rawText
                    ? buildMigrationRepairPrompt(firstAttempt.rawText, charName || charId || '角色', normalizedSource)
                    : buildMigrationStrictRetryPrompt(cleanChunk, charName || charId || '角色', normalizedSource);
                const retryAttempt = await requestMigrationOnce(retryPrompt);
                if (retryAttempt.ok) {
                    const retryParsed = parseMigrationResponseWithDebug(retryAttempt.payload);
                    if (retryParsed.events.length > 0) {
                        retryParsed.debug.retry_applied = true;
                        retryParsed.debug.retry_reason = parsed.debug && parsed.debug.empty_reason
                            ? parsed.debug.empty_reason
                            : 'unknown';
                        parsed = retryParsed;
                    }
                }
            }

            const eventsWithDate = attachEventDatesFromChunk(parsed.events, cleanChunk);
            const yamlDateMatchedCount = eventsWithDate.filter(function countMatchedDate(event) {
                return !!toTrimmedString(event && event.event_date);
            }).length;
            console.log(`[海马体迁移] 分段提取完成：事件 ${eventsWithDate.length} 条，YAML 原文时间命中 ${yamlDateMatchedCount} 条。`);
            return {
                ok: true,
                events: eventsWithDate,
                debug: parsed.debug,
                error: null,
                backupId: state.pendingBackup.id
            };
        } catch (error) {
            const message = getErrorMessage(error, '迁移脱水请求失败。');
            console.warn('[海马体迁移] 迁移脱水失败:', message);
            return {
                ok: false,
                events: [],
                error: `迁移脱水请求失败：${message}`
            };
        }
    }

    /**
     * 根据提取到的事件生成迁移预览报告，并锁定本次待提交内容。
     */
    function generateMigrationPreview(events) {
        const normalizedEvents = normalizeMigrationEventList(events);

        if (!state.pendingBackup) {
            return {
                ok: false,
                readyToCommit: false,
                error: '未找到原 YAML 备份，请先重新开始迁移。',
                backupId: null,
                previewId: null,
                originalYamlLength: 0,
                eventCount: 0,
                events: []
            };
        }

        const previewId = createLocalId('hippo-migration-preview');
        const report = {
            ok: !!state.pendingBackup.persisted,
            readyToCommit: !!state.pendingBackup.persisted && normalizedEvents.length > 0,
            error: state.pendingBackup.persisted ? null : (state.pendingBackup.error || '原 YAML 备份失败，无法继续迁移。'),
            backupId: state.pendingBackup.id,
            previewId: previewId,
            charId: state.pendingBackup.charId || null,
            charName: state.pendingBackup.charName || null,
            sourceType: state.pendingBackup.sourceType || null,
            sourceLabel: state.pendingBackup.sourceLabel || null,
            charGenderIdentity: state.pendingBackup.charGenderIdentity || null,
            userGenderIdentity: state.pendingBackup.userGenderIdentity || null,
            createdAt: new Date().toISOString(),
            originalYamlLength: state.pendingBackup.originalYamlLength,
            eventCount: normalizedEvents.length,
            events: normalizedEvents.map(function mapPreviewEvent(event, index) {
                return {
                    index: index + 1,
                    content: event.content,
                    event_date: event.event_date || null,
                    valence: event.valence,
                    arousal: event.arousal,
                    importance: event.importance,
                    trigger_keywords: event.trigger_keywords,
                    memory_layer: event.memory_layer || 'buffer',
                    sensory_anchors: Array.isArray(event.sensory_anchors) ? event.sensory_anchors : []
                };
            }),
            warnings: normalizedEvents.length > 0
                ? []
                : ['没有提取出值得迁移的情感事件，本次迁移不会写入任何记录。']
        };

        state.pendingPreview = {
            id: previewId,
            backupId: state.pendingBackup.id,
            fingerprint: buildEventFingerprint(normalizedEvents),
            eventCount: normalizedEvents.length,
            charId: state.pendingBackup.charId || null,
            createdAt: report.createdAt,
            committedAt: null
        };

        if (state.pendingBackup.persisted) {
            patchStoredBackup(state.pendingBackup.id, {
                lastPreviewId: previewId,
                lastPreviewAt: report.createdAt,
                lastPreviewEventCount: normalizedEvents.length
            });
        }

        return report;
    }

    /**
     * 将用户确认后的迁移事件批量写入 hippocampus_memories 表。
     */
    async function commitMigration(userId, charId, events) {
        const cleanUserId = toTrimmedString(userId);
        const cleanCharId = toTrimmedString(charId);
        const normalizedEvents = normalizeMigrationEventList(events);
        const eventFingerprint = buildEventFingerprint(normalizedEvents);

        if (!cleanUserId || !cleanCharId) {
            return {
                ok: false,
                insertedCount: 0,
                records: [],
                error: '迁移写入缺少 userId 或 charId。'
            };
        }

        if (!state.pendingBackup) {
            return {
                ok: false,
                insertedCount: 0,
                records: [],
                error: '未找到原 YAML 备份，请先重新开始迁移。'
            };
        }

        if (!state.pendingBackup.persisted) {
            return {
                ok: false,
                insertedCount: 0,
                records: [],
                error: state.pendingBackup.error || '原 YAML 备份失败，不能继续写入。'
            };
        }

        if (!state.pendingPreview) {
            return {
                ok: false,
                insertedCount: 0,
                records: [],
                error: '请先生成迁移预览，再确认写入。'
            };
        }

        if (state.pendingPreview.committedAt) {
            return {
                ok: false,
                insertedCount: 0,
                records: [],
                error: '这份迁移预览已经写入过了，为避免重复导入，请重新生成预览。'
            };
        }

        if (state.pendingBackup.charId && state.pendingBackup.charId !== cleanCharId) {
            return {
                ok: false,
                insertedCount: 0,
                records: [],
                error: '当前角色与预览时的角色不一致，请重新开始迁移。'
            };
        }

        if (state.pendingPreview.fingerprint !== eventFingerprint) {
            return {
                ok: false,
                insertedCount: 0,
                records: [],
                error: '预览后的事件内容已经变化，请重新生成预览后再写入。'
            };
        }

        if (normalizedEvents.length === 0) {
            return {
                ok: false,
                insertedCount: 0,
                records: [],
                error: '没有可写入的迁移事件。'
            };
        }

        const supabase = getSupabaseClient();
        if (!supabase) {
            return {
                ok: false,
                insertedCount: 0,
                records: [],
                error: '当前没有可用的 Supabase 客户端，无法完成迁移写入。'
            };
        }

        const resolvedAt = new Date().toISOString();
        const insertPayloads = normalizedEvents.map(function buildInsertPayload(event) {
            const normalizedLayer = normalizeMigrationMemoryLayer(event && event.memory_layer);
            const sensoryAnchors = normalizeMigrationSensoryAnchors(event && event.sensory_anchors);
            const metadataPayload = {
                trigger_keywords: event.trigger_keywords,
                migration: {
                    backup_id: state.pendingBackup.id,
                    preview_id: state.pendingPreview.id,
                    original_yaml_length: state.pendingBackup.originalYamlLength,
                    migrated_at: resolvedAt
                }
            };

            if (event.event_date) {
                metadataPayload.event_date = event.event_date;
            }
            if (sensoryAnchors.length > 0) {
                metadataPayload.sensory_anchors = sensoryAnchors;
            }

            const payload = {
                user_id: cleanUserId,
                char_id: cleanCharId,
                room_id: null,
                context_scope: 'private',
                content: event.content,
                valence: clampNumber(event.valence, -1, 1, 0),
                arousal: clampNumber(event.arousal, 0, 1, 0),
                importance: clampNumber(event.importance, 1, 10, 5),
                activation_count: 1,
                is_flashbulb: clampNumber(event.arousal, 0, 1, 0) >= 0.9,
                // 旧流水账迁移默认按“历史旧事已沉底”处理，避免刚导入就大面积顶到表层。
                resolved: true,
                resolved_at: resolvedAt,
                source_type: 'yaml_migration',
                source_ref: state.pendingBackup.id,
                memory_layer: normalizedLayer,
                metadata: metadataPayload
            };

            return payload;
        });

        try {
            const response = await supabase
                .from('hippocampus_memories')
                .insert(insertPayloads)
                .select('id,user_id,char_id,room_id,context_scope,content,valence,arousal,importance,activation_count,resolved,resolved_at,source_type,source_ref,memory_layer,is_flashbulb,metadata,created_at,last_active_at');

            if (response.error) {
                throw response.error;
            }

            const records = Array.isArray(response.data) ? response.data : [];
            const embeddingMissingCount = records.length;
            const embeddingBackfillEnabled = hasMigrationEmbeddingCapability();
            let embeddingQueuedCount = 0;
            let embeddingBatchId = '';
            const embeddingBackfillReason = embeddingBackfillEnabled ? 'queued_async' : 'embedding_not_configured';
            if (embeddingBackfillEnabled && embeddingMissingCount > 0) {
                const jobs = buildEmbeddingJobsFromRecords(records, normalizedEvents, cleanUserId);
                const enqueueResult = enqueueEmbeddingBackfillJobs(jobs, {
                    sourceType: 'yaml_migration',
                    userId: cleanUserId,
                    charId: cleanCharId
                });
                embeddingQueuedCount = Math.max(0, Number(enqueueResult && enqueueResult.queuedCount || 0));
                embeddingBatchId = toTrimmedString(enqueueResult && enqueueResult.batchId);
                console.log(`[海马体迁移][向量] 已将 ${embeddingQueuedCount} 条记忆加入后台回填队列。`);
            }
            state.pendingPreview.committedAt = resolvedAt;

            patchStoredBackup(state.pendingBackup.id, {
                committedAt: resolvedAt,
                committedCharId: cleanCharId,
                committedEventCount: records.length
            });

            return {
                ok: true,
                insertedCount: records.length,
                records: records,
                error: null,
                backupId: state.pendingBackup.id,
                previewId: state.pendingPreview.id,
                embeddingMissingCount: embeddingMissingCount,
                embeddingQueuedCount: embeddingQueuedCount,
                embeddingBatchId: embeddingBatchId,
                embeddingBackfillEnabled: embeddingBackfillEnabled,
                embeddingBackfillReason: embeddingBackfillReason
            };
        } catch (error) {
            const message = getErrorMessage(error, '写入数据库失败。');
            console.warn('[海马体迁移] 批量写入失败:', message);
            return {
                ok: false,
                insertedCount: 0,
                records: [],
                error: `迁移写入失败：${message}`
            };
        }
    }

    /**
     * 订阅 embedding 后台回填完成事件。
     */
    function onEmbeddingBackfillFinished(listener) {
        if (typeof listener !== 'function') {
            return function noopUnsubscribe() {};
        }

        if (!Array.isArray(state.embeddingListeners)) {
            state.embeddingListeners = [];
        }
        state.embeddingListeners.push(listener);

        return function unsubscribe() {
            offEmbeddingBackfillFinished(listener);
        };
    }

    /**
     * 取消订阅 embedding 后台回填完成事件。
     */
    function offEmbeddingBackfillFinished(listener) {
        if (!Array.isArray(state.embeddingListeners) || state.embeddingListeners.length === 0) return;
        state.embeddingListeners = state.embeddingListeners.filter(function keepListener(item) {
            return item !== listener;
        });
    }

    return {
        parseYamlMemory: parseYamlMemory,
        createMigrationSession: createMigrationSession,
        getMigrationSession: getMigrationSession,
        getMigrationSessionEvents: getMigrationSessionEvents,
        getMigrationSessionDiagnostics: getMigrationSessionDiagnostics,
        runMigrationSessionFromIndex: runMigrationSessionFromIndex,
        resetMigrationSessionFromIndex: resetMigrationSessionFromIndex,
        clearMigrationSession: clearMigrationSession,
        migrateChunk: migrateChunk,
        generateMigrationPreview: generateMigrationPreview,
        commitMigration: commitMigration,
        retryMissingEmbeddings: retryMissingEmbeddings,
        onEmbeddingBackfillFinished: onEmbeddingBackfillFinished,
        offEmbeddingBackfillFinished: offEmbeddingBackfillFinished
    };
}
