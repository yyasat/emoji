(() => {
    if (typeof window === 'undefined' || !window.ForumLink) return;

    const defaultCatalog = {
        version: '2026-02-16-v1',
        sections: [
            { id: 'sec_general', name: '\u7efc\u5408\u8ba8\u8bba' },
            { id: 'sec_ent', name: '\u4f11\u95f2\u5a31\u4e50' },
            { id: 'sec_life', name: '\u751f\u6d3b\u00b7\u60c5\u611f' },
            { id: 'sec_tech', name: '\u79d1\u6280\u00b7\u6570\u7801' }
        ],
        channels: [
            { id: 'ch_chat', sectionId: 'sec_general', name: '\u95f2\u804a\u704c\u6c34' },
            { id: 'ch_hot', sectionId: 'sec_general', name: '\u4eca\u65e5\u70ed\u70b9' },
            { id: 'ch_rant', sectionId: 'sec_general', name: '\u5410\u69fd\u5927\u4f1a' },
            { id: 'ch_court', sectionId: 'sec_general', name: '\u5c0f\u6cd5\u5ead' },
            { id: 'ch_game', sectionId: 'sec_ent', name: '\u6e38\u620f\u00b7\u7535\u7ade' },
            { id: 'ch_media', sectionId: 'sec_ent', name: '\u5f71\u89c6\u00b7\u5267\u7efc' },
            { id: 'ch_music', sectionId: 'sec_ent', name: '\u97f3\u4e50\u00b7\u73b0\u573a' },
            { id: 'ch_acg', sectionId: 'sec_ent', name: '\u4e8c\u6b21\u5143' },
            { id: 'ch_emotion', sectionId: 'sec_life', name: '\u60c5\u611f\u591c\u8bdd' },
            { id: 'ch_daily', sectionId: 'sec_life', name: '\u65e5\u5e38\u751f\u6d3b' },
            { id: 'ch_food', sectionId: 'sec_life', name: '\u7f8e\u98df\u00b7\u65c5\u884c' },
            { id: 'ch_pet', sectionId: 'sec_life', name: '\u840c\u5ba0\u5929\u5730' },
            { id: 'ch_nsfw', sectionId: 'sec_life', name: '\u79c1\u5bc6\u8bdd\u9898' },
            { id: 'ch_digital', sectionId: 'sec_tech', name: '\u6570\u7801\u4ea7\u54c1' },
            { id: 'ch_soft', sectionId: 'sec_tech', name: '\u8f6f\u4ef6\u00b7\u5e94\u7528' }
        ]
    };

    const trimBaseUrl = (value) => String(value || '').trim().replace(/\/+$/, '');
    const makeIdentityKey = (authorType, authorId) => `${authorType}:${authorId}`;
    const makeInteractionKey = (item = {}) => {
        const type = String(item?.type || '').trim();
        const actorId = String(item?.actorId || item?.actor_id || item?.actorIdentity?.authorId || item?.actorIdentity?.author_id || '').trim();
        const threadId = String(item?.threadId || item?.thread_id || '').trim();
        const commentId = String(item?.commentId || item?.comment_id || '').trim();
        return `${type}:${actorId}:${threadId}:${commentId}`;
    };
    const uniqueIds = (list = []) => Array.from(new Set((list || []).map((item) => String(item || '').trim()).filter(Boolean)));
    const cloneValue = (value) => {
        if (value === null || value === undefined) return value;
        if (typeof globalThis.structuredClone === 'function') {
            try {
                return globalThis.structuredClone(value);
            } catch (_) { }
        }
        try {
            return JSON.parse(JSON.stringify(value));
        } catch (_) {
            return value;
        }
    };
    const stableToken = (value) => {
        if (value === null || value === undefined) return String(value);
        if (typeof value === 'number' || typeof value === 'boolean') return JSON.stringify(value);
        if (typeof value === 'string') return JSON.stringify(value);
        if (Array.isArray(value)) return `[${value.map((item) => stableToken(item)).join(',')}]`;
        if (typeof value === 'object') {
            return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableToken(value[key])}`).join(',')}}`;
        }
        return JSON.stringify(String(value));
    };

    const mergeArrayById = (target, items = []) => {
        const nextMap = new Map((target || []).map((item) => [String(item?.id || '').trim(), item]).filter((item) => item[0]));
        (items || []).forEach((item) => {
            const id = String(item?.id || '').trim();
            if (!id) return;
            nextMap.set(id, item);
        });
        target.length = 0;
        nextMap.forEach((value) => target.push(value));
        return target;
    };

    const removeArrayByIds = (target, ids = []) => {
        const idSet = new Set(uniqueIds(ids));
        if (!idSet.size) return;
        for (let i = target.length - 1; i >= 0; i -= 1) {
            const id = String(target[i]?.id || '').trim();
            if (idSet.has(id)) target.splice(i, 1);
        }
    };

    ForumLink.createCloudflareStorageAdapter = function createCloudflareStorageAdapter(options = {}) {
        const baseUrl = trimBaseUrl(
            options.baseUrl
            || options.url
            || (window.IDIC_FORUM_CONFIG && window.IDIC_FORUM_CONFIG.forumWorkerBaseUrl)
        );
        if (!baseUrl) {
            throw new Error('Cloudflare forum worker base URL is missing');
        }

        const base = ForumLink.createMemoryStorageAdapter();
        const store = base._store || {};
        const readCache = new Map();
        const readInFlight = new Map();
        let readCacheVersion = 0;

        const cacheUsers = (items = []) => {
            if (!(store.users instanceof Map)) return;
            (items || []).forEach((item) => {
                const id = String(item?.id || '').trim();
                if (!id) return;
                store.users.set(id, item);
            });
        };

        const cacheChars = (items = []) => {
            if (!(store.chars instanceof Map)) return;
            (items || []).forEach((item) => {
                const id = String(item?.id || '').trim();
                if (!id) return;
                store.chars.set(id, item);
            });
        };

        const cacheIdentities = (items = []) => {
            if (!(store.identities instanceof Map)) return;
            (items || []).forEach((item) => {
                const authorType = String(item?.authorType || item?.author_type || '').trim();
                const authorId = String(item?.authorId || item?.author_id || '').trim();
                if (!authorType || !authorId) return;
                store.identities.set(makeIdentityKey(authorType, authorId), item);
            });
        };

        const cacheAgentProfile = (row) => {
            if (!row || !(store.agentApiProfiles instanceof Map)) return;
            const userId = String(row.userId || row.user_id || '').trim();
            if (!userId) return;
            store.agentApiProfiles.set(userId, row);
        };

        const cacheInteractions = (rows = []) => {
            if (!(store.interactions instanceof Map)) return;
            (rows || []).forEach((row) => {
                const key = makeInteractionKey(row);
                if (!key || key === ':::') return;
                store.interactions.set(key, row);
            });
        };

        const callRpc = async (method, payload = {}) => {
            const response = await fetch(`${baseUrl}/rpc/${method}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload || {})
            });
            let json = {};
            try {
                json = await response.json();
            } catch (_) { }
            if (!response.ok || !json?.ok) {
                throw new Error(String(json?.error || json?.code || `RPC ${method} failed`));
            }
            return json.data;
        };

        const buildReadCacheKey = (scope, params = {}) => `${String(scope || 'default')}:${stableToken(params || {})}`;
        const invalidateReadCache = (scopes = []) => {
            readCacheVersion += 1;
            const list = Array.isArray(scopes) ? scopes : [scopes];
            const normalized = list.map((item) => String(item || '').trim()).filter(Boolean);
            if (!normalized.length) {
                readCache.clear();
                readInFlight.clear();
                return;
            }
            Array.from(readCache.keys()).forEach((key) => {
                if (normalized.some((scope) => key.startsWith(`${scope}:`))) {
                    readCache.delete(key);
                }
            });
            Array.from(readInFlight.keys()).forEach((key) => {
                if (normalized.some((scope) => key.startsWith(`${scope}:`))) {
                    readInFlight.delete(key);
                }
            });
        };
        const compactReadCache = () => {
            const now = Date.now();
            Array.from(readCache.entries()).forEach(([key, entry]) => {
                if (!entry || Number(entry.expiresAt || 0) <= now) {
                    readCache.delete(key);
                }
            });
            while (readCache.size > 600) {
                const oldest = readCache.keys().next().value;
                if (!oldest) break;
                readCache.delete(oldest);
            }
        };
        const withReadCache = async ({ scope, params = {}, ttlMs = 0, loader }) => {
            const ttl = Math.max(0, Number(ttlMs) || 0);
            if (!ttl || typeof loader !== 'function') {
                return loader();
            }
            compactReadCache();
            const key = buildReadCacheKey(scope, params);
            const now = Date.now();
            const cached = readCache.get(key);
            if (cached && Number(cached.expiresAt || 0) > now) {
                return cloneValue(cached.value);
            }
            if (readInFlight.has(key)) {
                const shared = await readInFlight.get(key);
                return cloneValue(shared);
            }
            const version = readCacheVersion;
            const task = (async () => {
                const value = await loader();
                if (version === readCacheVersion) {
                    readCache.set(key, {
                        value: cloneValue(value),
                        expiresAt: Date.now() + ttl
                    });
                }
                return value;
            })().finally(() => {
                readInFlight.delete(key);
            });
            readInFlight.set(key, task);
            const value = await task;
            return cloneValue(value);
        };

        const api = Object.assign(base, {
            _workerBaseUrl: baseUrl,
            _rpc: callRpc,

            getWorkerEndpointUrl() {
                return baseUrl;
            },

            async primeCache() {
                const payload = await callRpc('primeCache', {});
                cacheUsers(payload?.users || []);
                cacheChars(payload?.chars || []);
                invalidateReadCache(['user_by_id', 'char_by_id', 'list_chars']);
                return payload;
            },

            async ensureBootstrapIdentity() {
                const rawDeviceId = localStorage.getItem('forum_device_id') || '';
                const generatedDeviceId = `dev_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
                const finalDeviceId = rawDeviceId || generatedDeviceId;
                if (!rawDeviceId) {
                    localStorage.setItem('forum_device_id', finalDeviceId);
                }

                const safeDeviceId = String(finalDeviceId).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || `dev_${Date.now().toString(36)}`;
                const defaultUserId = `user_${safeDeviceId}`;
                const storedUserId = localStorage.getItem('forum_user_id') || '';
                const shouldMigrateUserId = !storedUserId || storedUserId === 'user_local_1' || storedUserId === 'user_demo_1';
                const userId = shouldMigrateUserId ? defaultUserId : storedUserId;
                localStorage.setItem('forum_user_id', userId);

                const uiName = (document.getElementById('main-header-username')?.textContent || '').trim();
                const localUserName = (localStorage.getItem('forum_user_name') || '').trim();
                const fallbackUserName = `\u7528\u6237${safeDeviceId.slice(-4) || '0001'}`;

                const existingUser = await api.getUser(userId);
                const userName = existingUser?.username || localUserName || uiName || fallbackUserName;
                const userForumName = existingUser?.forumName || existingUser?.settings?.forumName || localUserName || userName;

                await api.upsertUser({
                    id: userId,
                    username: userName,
                    forumName: userForumName,
                    profile: existingUser?.profile || {},
                    stats: existingUser?.stats || {},
                    settings: Object.assign({}, existingUser?.settings || {}, {
                        forumName: userForumName
                    })
                });
                localStorage.setItem('forum_user_name', userForumName);

                await api.saveForumIdentity({
                    authorType: 'user',
                    authorId: userId,
                    displayName: userForumName,
                    anonymous: false,
                    anonDisplayId: null
                });

                const chars = await api.listChars({ ownerUserId: userId, limit: 200 });
                let charId = localStorage.getItem('forum_char_id') || '';
                if (charId === 'char_local_1' || charId === 'char_demo_1') {
                    charId = '';
                }

                if (!Array.isArray(chars) || chars.length === 0) {
                    charId = charId || `char_${safeDeviceId}_1`;
                    localStorage.setItem('forum_char_id', charId);
                    await api.upsertChar({
                        id: charId,
                        realName: '\u6211\u7684\u89d2\u8272',
                        ownerUserId: userId,
                        displayName: '\u6211\u7684\u89d2\u8272',
                        numberTag: '0001',
                        forumName: '\u6211\u7684\u89d2\u8272',
                        settings: { forumName: '\u6211\u7684\u89d2\u8272' },
                        stats: {}
                    });
                    await api.saveForumIdentity({
                        authorType: 'char',
                        authorId: charId,
                        displayName: '\u6211\u7684\u89d2\u8272',
                        anonymous: false,
                        anonDisplayId: null
                    });
                } else {
                    const hasCurrent = charId && chars.some((row) => String(row?.id || '').trim() === charId);
                    if (!hasCurrent) {
                        charId = String(chars[0]?.id || '').trim();
                    }
                    localStorage.setItem('forum_char_id', charId);
                }

                const catalogVersionKey = 'forum_catalog_version';
                const catalogForceKey = 'forum_force_catalog_reset';
                const forceReset = localStorage.getItem(catalogForceKey) === '1';
                const lastVersion = localStorage.getItem(catalogVersionKey);
                if (forceReset || lastVersion !== defaultCatalog.version) {
                    await api.syncCatalog({
                        version: defaultCatalog.version,
                        sections: defaultCatalog.sections,
                        channels: defaultCatalog.channels,
                        forceReset
                    });
                    localStorage.setItem(catalogVersionKey, defaultCatalog.version);
                    if (forceReset) localStorage.removeItem(catalogForceKey);
                }

                await api.primeCache();
                return { userId, charId };
            },

            async getUser(userId) {
                const id = String(userId || '').trim();
                if (!id) return null;
                if (store.users instanceof Map && store.users.has(id)) return store.users.get(id);
                const row = await withReadCache({
                    scope: 'user_by_id',
                    params: { userId: id },
                    ttlMs: 30000,
                    loader: () => callRpc('getUser', { userId: id })
                });
                if (row) cacheUsers([row]);
                return row || null;
            },

            async upsertUser(payload = {}) {
                const row = await callRpc('upsertUser', payload);
                if (row) cacheUsers([row]);
                invalidateReadCache(['user_by_id']);
                return row || null;
            },

            async updateUser(payload = {}) {
                const row = await callRpc('updateUser', payload);
                if (row) cacheUsers([row]);
                invalidateReadCache(['user_by_id']);
                return row || null;
            },

            async getChar(charId) {
                const id = String(charId || '').trim();
                if (!id) return null;
                if (store.chars instanceof Map && store.chars.has(id)) return store.chars.get(id);
                const row = await withReadCache({
                    scope: 'char_by_id',
                    params: { charId: id },
                    ttlMs: 30000,
                    loader: () => callRpc('getChar', { charId: id })
                });
                if (row) cacheChars([row]);
                return row || null;
            },

            async upsertChar(payload = {}) {
                const row = await callRpc('upsertChar', payload);
                if (row) cacheChars([row]);
                invalidateReadCache(['char_by_id', 'list_chars', 'search_chars']);
                return row || null;
            },

            async updateChar(payload = {}) {
                const row = await callRpc('updateChar', payload);
                if (row) cacheChars([row]);
                invalidateReadCache(['char_by_id', 'list_chars', 'search_chars']);
                return row || null;
            },

            async listChars(params = {}) {
                const rows = await withReadCache({
                    scope: 'list_chars',
                    params,
                    ttlMs: 10000,
                    loader: () => callRpc('listChars', params)
                });
                if (Array.isArray(rows)) cacheChars(rows);
                return Array.isArray(rows) ? rows : [];
            },

            async searchCharsByNames(params = {}) {
                const rows = await withReadCache({
                    scope: 'search_chars',
                    params,
                    ttlMs: 10000,
                    loader: () => callRpc('searchCharsByNames', params)
                });
                if (Array.isArray(rows)) cacheChars(rows);
                return Array.isArray(rows) ? rows : [];
            },

            async bulkUpsertChars(chars = []) {
                const rows = await callRpc('bulkUpsertChars', { chars });
                if (Array.isArray(rows)) cacheChars(rows);
                invalidateReadCache(['char_by_id', 'list_chars', 'search_chars']);
                return Array.isArray(rows) ? rows : [];
            },

            async getForumIdentity(authorType, authorId) {
                const key = makeIdentityKey(authorType, authorId);
                if (store.identities instanceof Map && store.identities.has(key)) return store.identities.get(key);
                const row = await withReadCache({
                    scope: 'identity_by_key',
                    params: { authorType, authorId },
                    ttlMs: 30000,
                    loader: () => callRpc('getForumIdentity', { authorType, authorId })
                });
                if (row) cacheIdentities([row]);
                return row || null;
            },

            async saveForumIdentity(identity) {
                const row = await callRpc('saveForumIdentity', identity || {});
                if (row) cacheIdentities([row]);
                invalidateReadCache(['identity_by_key']);
                return row || null;
            },

            async bulkUpsertIdentities(identities = []) {
                const rows = await callRpc('bulkUpsertIdentities', { identities });
                if (Array.isArray(rows)) cacheIdentities(rows);
                invalidateReadCache(['identity_by_key']);
                return Array.isArray(rows) ? rows : [];
            },

            async syncCatalog(payload = {}) {
                const result = await callRpc('syncCatalog', payload);
                invalidateReadCache(['sections', 'channels', 'threads', 'thread_by_id', 'comments']);
                return result || {};
            },

            async listSections() {
                const rows = await withReadCache({
                    scope: 'sections',
                    params: {},
                    ttlMs: 300000,
                    loader: () => callRpc('listSections', {})
                });
                store.sections = Array.isArray(rows) ? rows.slice() : [];
                return store.sections.slice();
            },

            async listChannels(params = {}) {
                const rows = await withReadCache({
                    scope: 'channels',
                    params,
                    ttlMs: 300000,
                    loader: () => callRpc('listChannels', params)
                });
                if (!Array.isArray(rows)) return [];
                if (!params || !params.sectionId) {
                    store.channels = rows.slice();
                } else if (Array.isArray(store.channels)) {
                    mergeArrayById(store.channels, rows);
                }
                return rows;
            },

            async listThreads(params = {}) {
                const rows = await withReadCache({
                    scope: 'threads',
                    params,
                    ttlMs: 6000,
                    loader: () => callRpc('listThreads', params)
                });
                if (Array.isArray(rows) && Array.isArray(store.threads)) mergeArrayById(store.threads, rows);
                return rows;
            },

            async getThread(threadId) {
                const row = await withReadCache({
                    scope: 'thread_by_id',
                    params: { threadId },
                    ttlMs: 30000,
                    loader: () => callRpc('getThread', { threadId })
                });
                if (row && Array.isArray(store.threads)) mergeArrayById(store.threads, [row]);
                return row || null;
            },

            async createThread(payload = {}) {
                const row = await callRpc('createThread', payload);
                if (row && Array.isArray(store.threads)) mergeArrayById(store.threads, [row]);
                invalidateReadCache(['threads', 'thread_by_id']);
                return row || null;
            },

            async deleteThread(threadId) {
                const result = await callRpc('deleteThread', { threadId });
                if (result?.threadId) {
                    removeArrayByIds(store.threads || [], [result.threadId]);
                    if (Array.isArray(store.comments)) {
                        store.comments = store.comments.filter((item) => String(item?.threadId || '').trim() !== String(result.threadId).trim());
                    }
                    if (Array.isArray(store.charReviews)) {
                        store.charReviews = store.charReviews.filter((item) => String(item?.threadId || '').trim() !== String(result.threadId).trim());
                    }
                    if (Array.isArray(store.memories)) {
                        store.memories = store.memories.filter((item) => String(item?.threadId || '').trim() !== String(result.threadId).trim());
                    }
                    if (Array.isArray(store.notifications)) {
                        store.notifications = store.notifications.filter((item) => String(item?.threadId || '').trim() !== String(result.threadId).trim());
                    }
                }
                invalidateReadCache(['threads', 'thread_by_id', 'comments', 'comments_by_author', 'interactions', 'char_reviews', 'memories', 'notifications']);
                return result;
            },

            async listComments(threadId, params = {}) {
                const query = Object.assign({}, params, { threadId });
                const rows = await withReadCache({
                    scope: 'comments',
                    params: query,
                    ttlMs: 6000,
                    loader: () => callRpc('listComments', query)
                });
                if (Array.isArray(rows) && Array.isArray(store.comments)) mergeArrayById(store.comments, rows);
                return rows;
            },

            async listCommentsByAuthor(params = {}) {
                const rows = await withReadCache({
                    scope: 'comments_by_author',
                    params,
                    ttlMs: 6000,
                    loader: () => callRpc('listCommentsByAuthor', params)
                });
                if (Array.isArray(rows) && Array.isArray(store.comments)) mergeArrayById(store.comments, rows);
                return rows;
            },

            async createComment(payload = {}) {
                const row = await callRpc('createComment', payload);
                if (row && Array.isArray(store.comments)) mergeArrayById(store.comments, [row]);
                if (row && Array.isArray(store.threads)) {
                    const thread = store.threads.find((item) => String(item?.id || '').trim() === String(row.threadId || '').trim());
                    if (thread && thread.metrics) {
                        thread.metrics.commentCount = Math.max(0, Number(thread.metrics.commentCount || 0) + 1);
                        thread.metrics.heat = Number(thread.metrics.heat || 0) + 3;
                        thread.lastCommentAt = row.createdAt;
                        thread.updatedAt = row.createdAt;
                    }
                }
                invalidateReadCache(['comments', 'comments_by_author', 'threads', 'thread_by_id']);
                return row || null;
            },

            async deleteComment(commentId) {
                const result = await callRpc('deleteComment', { commentId });
                const deleteIds = Array.isArray(result?.ids) ? result.ids : [];
                if (deleteIds.length > 0) {
                    removeArrayByIds(store.comments || [], deleteIds);
                    if (Array.isArray(store.notifications)) {
                        const idSet = new Set(deleteIds.map((item) => String(item)));
                        store.notifications = store.notifications.filter((item) => {
                            const commentMatch = idSet.has(String(item?.commentId || ''));
                            const parentMatch = idSet.has(String(item?.parentCommentId || ''));
                            return !commentMatch && !parentMatch;
                        });
                    }
                }
                invalidateReadCache(['comments', 'comments_by_author', 'threads', 'thread_by_id', 'interactions', 'notifications']);
                return result;
            },

            async addInteraction(payload = {}) {
                const ok = await callRpc('addInteraction', payload);
                if (ok === true) {
                    await base.addInteraction(payload);
                }
                if (ok === true) invalidateReadCache(['interactions', 'threads', 'thread_by_id', 'comments']);
                return ok;
            },

            async listInteractions(params = {}) {
                const rows = await withReadCache({
                    scope: 'interactions',
                    params,
                    ttlMs: 4000,
                    loader: () => callRpc('listInteractions', params)
                });
                if (Array.isArray(rows)) cacheInteractions(rows);
                return rows;
            },

            async removeInteraction(payload = {}) {
                const removed = await callRpc('removeInteraction', payload);
                if (removed) {
                    await base.removeInteraction(payload);
                }
                if (removed) invalidateReadCache(['interactions', 'threads', 'thread_by_id', 'comments']);
                return removed;
            },

            async saveCharReview(payload = {}) {
                const row = await callRpc('saveCharReview', payload);
                if (row && Array.isArray(store.charReviews)) mergeArrayById(store.charReviews, [row]);
                invalidateReadCache(['char_reviews']);
                return row || null;
            },

            async listCharReviews(params = {}) {
                const rows = await withReadCache({
                    scope: 'char_reviews',
                    params,
                    ttlMs: 6000,
                    loader: () => callRpc('listCharReviews', params)
                });
                if (Array.isArray(rows) && Array.isArray(store.charReviews)) mergeArrayById(store.charReviews, rows);
                return rows;
            },

            async saveMemoryItems(items = []) {
                const rows = await callRpc('saveMemoryItems', { items });
                if (Array.isArray(rows) && Array.isArray(store.memories)) mergeArrayById(store.memories, rows);
                invalidateReadCache(['memories']);
                return rows;
            },

            async listMemoryItems(params = {}) {
                const rows = await withReadCache({
                    scope: 'memories',
                    params,
                    ttlMs: 6000,
                    loader: () => callRpc('listMemoryItems', params)
                });
                if (Array.isArray(rows) && Array.isArray(store.memories)) mergeArrayById(store.memories, rows);
                return rows;
            },

            async purgeExpiredMemory(params = {}) {
                const deleted = await callRpc('purgeExpiredMemory', params);
                if (Array.isArray(store.memories)) {
                    const nowMs = new Date(params?.now || new Date().toISOString()).getTime();
                    store.memories = store.memories.filter((item) => {
                        if (!item?.expiresAt) return true;
                        return new Date(item.expiresAt).getTime() > nowMs;
                    });
                }
                invalidateReadCache(['memories']);
                return deleted;
            },

            async resetCharForumMemory(params = {}) {
                const result = await callRpc('resetCharForumMemory', params);
                const charId = String(result?.charId || params?.charId || '').trim();
                if (charId && Array.isArray(store.memories)) {
                    store.memories = store.memories.filter((item) => String(item?.charId || '').trim() !== charId);
                }
                invalidateReadCache(['memories']);
                return result;
            },

            async createNotifications(items = []) {
                const rows = await callRpc('createNotifications', { items });
                if (Array.isArray(rows) && Array.isArray(store.notifications)) mergeArrayById(store.notifications, rows);
                invalidateReadCache(['notifications']);
                return Array.isArray(rows) ? rows : [];
            },

            async listNotifications(params = {}) {
                const rows = await withReadCache({
                    scope: 'notifications',
                    params,
                    ttlMs: 4000,
                    loader: () => callRpc('listNotifications', params)
                });
                if (Array.isArray(rows) && Array.isArray(store.notifications)) mergeArrayById(store.notifications, rows);
                return rows;
            },

            async markNotificationsRead(params = {}) {
                const updated = await callRpc('markNotificationsRead', params);
                if (Array.isArray(store.notifications)) {
                    const ids = uniqueIds(params?.ids);
                    const receiverType = String(params?.receiverType || '').trim();
                    const receiverId = String(params?.receiverId || '').trim();
                    const category = String(params?.category || '').trim();
                    const now = params?.now || new Date().toISOString();
                    store.notifications.forEach((item) => {
                        if (!item || item.isRead) return;
                        if (ids.length > 0 && !ids.includes(String(item.id || '').trim())) return;
                        if (ids.length === 0 && receiverType && String(item.receiverType || '').trim() !== receiverType) return;
                        if (ids.length === 0 && receiverId && String(item.receiverId || '').trim() !== receiverId) return;
                        if (ids.length === 0 && category && String(item.category || '').trim() !== category) return;
                        item.isRead = true;
                        item.readAt = now;
                    });
                }
                invalidateReadCache(['notifications']);
                return updated;
            },

            async upsertAgentApiProfile(payload = {}) {
                const row = await callRpc('upsertAgentApiProfile', payload);
                cacheAgentProfile(row);
                invalidateReadCache(['agent_api_profile']);
                return row || null;
            },

            async getAgentApiProfile(userId) {
                const key = String(userId || '').trim();
                if (!key) return null;
                if (store.agentApiProfiles instanceof Map && store.agentApiProfiles.has(key)) {
                    return store.agentApiProfiles.get(key);
                }
                const row = await withReadCache({
                    scope: 'agent_api_profile',
                    params: { userId: key },
                    ttlMs: 10000,
                    loader: () => callRpc('getAgentApiProfile', { userId: key })
                });
                cacheAgentProfile(row);
                return row || null;
            }
        });

        api.enqueueAgentJob = undefined;
        api.claimAgentJobs = undefined;
        api.listAgentJobs = undefined;
        api.cancelAgentJobs = undefined;
        api.updateAgentJob = undefined;
        api.saveAgentActionLog = undefined;
        api.createAgentReport = undefined;
        api.listAgentReports = undefined;
        api.markAgentReportsDelivered = undefined;

        return api;
    };
})();
