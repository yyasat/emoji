/**
 * 联机论坛（Forum Link）
 * - 独立于 galaxy_link.js，不直接使用其 supabase
 * - 通过适配器接入 IDIC / Kiki
 */

function forumNowIso() {
    return new Date().toISOString();
}

function forumGenId(prefix = 'id') {
    const rand = Math.random().toString(36).slice(2, 10);
    const stamp = Date.now().toString(36);
    return `${prefix}_${rand}${stamp}`;
}

function forumNormalizeTags(tags) {
    if (!tags) return [];
    const list = Array.isArray(tags) ? tags : String(tags).split(',');
    const normalized = [];
    list.forEach((item) => {
        const value = String(item).trim();
        if (!value) return;
        if (!normalized.includes(value)) normalized.push(value);
    });
    return normalized;
}

function forumClampNumber(value, min, max, fallback = 0) {
    const num = Number(value);
    if (Number.isNaN(num)) return fallback;
    return Math.min(max, Math.max(min, num));
}

const ForumLink = {
    VERSION: '0.1.0',
    isInitialized: false,

    // 运行时适配器
    adapters: {
        storage: null,      // ForumStorageAdapter
        integration: null,  // ForumIntegrationAdapter
        config: null        // ProjectConfigProvider
    },

    // 运行时状态（仅保留必要占位）
    state: {
        activeProject: 'idic',
        currentUserId: null,
        lastSyncAt: null
    },

    // === 基础工具 ===
    utils: {
        nowIso: forumNowIso,
        genId: forumGenId,
        normalizeTags: forumNormalizeTags,
        clampNumber: forumClampNumber,
        escapeHtml(text) {
            if (text === null || text === undefined) return '';
            return String(text)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/\"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }
    },

    // === 数据模型工厂 ===
    models: {
        createThreadMetrics(base = {}) {
            return Object.assign({
                like: 0,
                collect: 0,
                share: 0,
                commentCount: 0,
                heat: 0
            }, base);
        },
        createCommentMetrics(base = {}) {
            return Object.assign({
                like: 0,
                dislike: 0
            }, base);
        },
        createUser(payload = {}) {
            return Object.assign({
                id: payload.id || forumGenId('user'),
                username: payload.username || 'User',
                profile: payload.profile || {},
                stats: payload.stats || {},
                settings: payload.settings || {}
            }, payload);
        },
        createChar(payload = {}) {
            return Object.assign({
                id: payload.id || forumGenId('char'),
                realName: payload.realName || payload.name || 'Char',
                ownerUserId: payload.ownerUserId || null,
                displayName: payload.displayName || payload.realName || payload.name || 'Char',
                numberTag: payload.numberTag || null,
                settings: payload.settings || {},
                stats: payload.stats || {}
            }, payload);
        },
        createIdentity(payload = {}) {
            return Object.assign({
                authorType: payload.authorType || 'user',
                authorId: payload.authorId || null,
                displayName: payload.displayName || 'Anonymous',
                anonymous: Boolean(payload.anonymous),
                anonDisplayId: payload.anonDisplayId || null
            }, payload);
        },
        createThread(payload = {}) {
            return Object.assign({
                id: payload.id || forumGenId('thread'),
                title: payload.title || '',
                content: payload.content || '',
                tags: forumNormalizeTags(payload.tags),
                sectionId: payload.sectionId || null,
                channelId: payload.channelId || null,
                authorIdentity: payload.authorIdentity || null,
                createdAt: payload.createdAt || forumNowIso(),
                updatedAt: payload.updatedAt || forumNowIso(),
                lastCommentAt: payload.lastCommentAt || null,
                metrics: this.createThreadMetrics(payload.metrics || {})
            }, payload);
        },
        createComment(payload = {}) {
            return Object.assign({
                id: payload.id || forumGenId('comment'),
                threadId: payload.threadId || null,
                parentId: payload.parentId || null,
                authorIdentity: payload.authorIdentity || null,
                content: payload.content || '',
                createdAt: payload.createdAt || forumNowIso(),
                updatedAt: payload.updatedAt || forumNowIso(),
                metrics: this.createCommentMetrics(payload.metrics || {})
            }, payload);
        },
        createCharReview(payload = {}) {
            return Object.assign({
                id: payload.id || forumGenId('review'),
                threadId: payload.threadId || null,
                charId: payload.charId || null,
                reviewText: payload.reviewText || '',
                actionsPlanned: payload.actionsPlanned || [],
                createdAt: payload.createdAt || forumNowIso()
            }, payload);
        },
        createMemoryItem(payload = {}) {
            return Object.assign({
                id: payload.id || forumGenId('memory'),
                charId: payload.charId || null,
                threadId: payload.threadId || null,
                title: payload.title || '',
                tags: forumNormalizeTags(payload.tags),
                reviewText: payload.reviewText || '',
                actionSummary: payload.actionSummary || '',
                createdAt: payload.createdAt || forumNowIso(),
                expiresAt: payload.expiresAt || null
            }, payload);
        },
        createNotification(payload = {}) {
            const receiverType = String(payload.receiverType || payload.receiver_type || 'user').trim() || 'user';
            const receiverId = String(payload.receiverId || payload.receiver_id || '').trim();
            const actorIdentity = payload.actorIdentity || payload.actor_identity || null;
            return Object.assign({
                id: payload.id || forumGenId('notify'),
                receiverType,
                receiverId,
                category: payload.category || 'engagement', // engagement | mention
                type: payload.type || 'comment_thread',
                actorIdentity,
                threadId: payload.threadId || payload.thread_id || null,
                commentId: payload.commentId || payload.comment_id || null,
                parentCommentId: payload.parentCommentId || payload.parent_comment_id || null,
                title: payload.title || '',
                excerpt: payload.excerpt || '',
                isRead: Boolean(payload.isRead || payload.is_read),
                createdAt: payload.createdAt || payload.created_at || forumNowIso(),
                readAt: payload.readAt || payload.read_at || null,
                meta: payload.meta && typeof payload.meta === 'object' ? payload.meta : {}
            }, payload);
        }
    },

    // === 身份展示规则（里程碑 7） ===
    identity: {
        formatUserDisplayName(user) {
            if (!user) return '用户';
            const forumName = user.forumName || user.settings?.forumName || user.username;
            return forumName ? forumName : '用户';
        },
        formatCharForumName(char) {
            if (!char) return '角色';
            return char.settings?.forumName || char.forumName || char.displayName || char.realName || '角色';
        },
        formatCharDisplayName(user, char) {
            if (!char) return '角色';
            const ownerName = user
                ? (user.forumName || user.settings?.forumName || user.username || '用户')
                : '用户';
            const realName = char.realName || char.displayName || '角色';
            const numberTag = char.numberTag || '0000';
            return `${ownerName}的${realName}#${numberTag}`;
        },
        async resolveDisplayIdentity(identity, viewerUserId) {
            if (!identity) return null;
            const storage = ForumLink.adapters.storage;
            let displayName = identity.displayName || 'Anonymous';
            let realDisplayName = displayName;
            let isOwnerView = false;

            if (identity.authorType === 'char' && storage) {
                const char = await storage.getChar(identity.authorId);
                if (char) {
                    const owner = char.ownerUserId ? await storage.getUser(char.ownerUserId) : null;
                    const forumName = this.formatCharForumName(char);
                    realDisplayName = this.formatCharDisplayName(owner, char);
                    displayName = forumName;
                    if (viewerUserId && char.ownerUserId === viewerUserId) {
                        isOwnerView = true;
                    }
                }
            }

            if (identity.authorType === 'user' && storage) {
                const user = await storage.getUser(identity.authorId);
                realDisplayName = this.formatUserDisplayName(user);
                displayName = realDisplayName;
                if (viewerUserId && identity.authorId === viewerUserId) {
                    isOwnerView = true;
                }
            }

            if (!identity.anonymous) {
                return {
                    displayName,
                    realDisplayName,
                    anonymous: false,
                    anonDisplayId: identity.anonDisplayId || null,
                    isOwnerView
                };
            }

            const anonDisplayId = identity.anonDisplayId || '0000';
            const anonLabel = identity.authorType === 'char' ? '匿名用户' : '匿名用户';
            const anonName = anonLabel;
            return {
                displayName: anonName,
                realDisplayName,
                anonymous: true,
                anonDisplayId,
                isOwnerView,
                canRevealRealName: Boolean(isOwnerView && identity.authorType === 'char')
            };
        }
    },

    // === 渲染层装饰器（用于 UI 展示） ===
    view: {
        getDisplayIdentityCacheKey(identity, viewerUserId) {
            if (!identity || typeof identity !== 'object') return '';
            const authorType = String(identity.authorType || identity.author_type || '').trim();
            const authorId = String(identity.authorId || identity.author_id || '').trim();
            if (!authorType || !authorId) return '';
            const anonymous = identity.anonymous ? '1' : '0';
            const anonDisplayId = String(identity.anonDisplayId || identity.anon_display_id || '').trim();
            const viewer = String(viewerUserId || '').trim();
            return `${viewer}|${authorType}|${authorId}|${anonymous}|${anonDisplayId}`;
        },
        async resolveDisplayIdentityCached(identity, viewerUserId, cacheMap = null) {
            if (!cacheMap) {
                return ForumLink.identity.resolveDisplayIdentity(identity, viewerUserId);
            }
            const key = this.getDisplayIdentityCacheKey(identity, viewerUserId);
            if (!key) {
                return ForumLink.identity.resolveDisplayIdentity(identity, viewerUserId);
            }
            if (!cacheMap.has(key)) {
                cacheMap.set(key, ForumLink.identity.resolveDisplayIdentity(identity, viewerUserId));
            }
            return cacheMap.get(key);
        },
        async decorateThread(thread, viewerUserId, cacheMap = null) {
            if (!thread) return null;
            const displayIdentity = await this.resolveDisplayIdentityCached(
                thread.authorIdentity,
                viewerUserId,
                cacheMap
            );
            return Object.assign({}, thread, {
                displayIdentity,
                displayAuthorName: displayIdentity ? displayIdentity.displayName : ''
            });
        },
        async decorateComment(comment, viewerUserId, cacheMap = null) {
            if (!comment) return null;
            const displayIdentity = await this.resolveDisplayIdentityCached(
                comment.authorIdentity,
                viewerUserId,
                cacheMap
            );
            return Object.assign({}, comment, {
                displayIdentity,
                displayAuthorName: displayIdentity ? displayIdentity.displayName : ''
            });
        },
        async decorateThreadList(threads, viewerUserId) {
            if (!Array.isArray(threads)) return [];
            const cacheMap = new Map();
            return Promise.all(
                threads.map((thread) => this.decorateThread(thread, viewerUserId, cacheMap))
            );
        },
        async decorateCommentList(comments, viewerUserId) {
            if (!Array.isArray(comments)) return [];
            const cacheMap = new Map();
            return Promise.all(
                comments.map((comment) => this.decorateComment(comment, viewerUserId, cacheMap))
            );
        }
    },

    // === UI 渲染桥（接入 decorate*） ===
    ui: {
        resolveViewerUserId(viewerUserId) {
            if (viewerUserId) return viewerUserId;
            if (ForumLink.state.currentUserId) return ForumLink.state.currentUserId;
            const integration = ForumLink.adapters.integration;
            if (integration && typeof integration.getActiveUserId === 'function') {
                return integration.getActiveUserId();
            }
            return null;
        },
        formatTime(isoString) {
            if (!isoString) return '';
            const date = new Date(isoString);
            if (Number.isNaN(date.getTime())) return '';
            return date.toLocaleString();
        },
        buildTagHtml(tags) {
            if (!tags || !tags.length) return '';
            return tags.map((tag) => `<span class="forum-tag">#${ForumLink.utils.escapeHtml(tag)}</span>`).join(' ');
        },
        async renderThreadList({ container, threads, viewerUserId, onOpenThread } = {}) {
            if (!container || typeof document === 'undefined') return;
            const resolvedViewerId = this.resolveViewerUserId(viewerUserId);
            const list = await ForumLink.view.decorateThreadList(threads || [], resolvedViewerId);
            container.innerHTML = '';

            list.forEach((thread) => {
                const item = document.createElement('div');
                item.className = 'forum-thread-item';
                item.dataset.threadId = thread.id;
                const title = ForumLink.utils.escapeHtml(thread.title);
                const author = ForumLink.utils.escapeHtml(thread.displayAuthorName || '');
                const time = this.formatTime(thread.createdAt);
                const tags = this.buildTagHtml(thread.tags);
                const stats = thread.metrics || {};
                item.innerHTML = `
                    <div class="forum-thread-title">${title}</div>
                    <div class="forum-thread-meta">${author} · ${time}</div>
                    <div class="forum-thread-tags">${tags}</div>
                    <div class="forum-thread-stats">
                        <span>赞 ${stats.like || 0}</span>
                        <span>评 ${stats.commentCount || 0}</span>
                        <span>藏 ${stats.collect || 0}</span>
                    </div>
                `;
                if (typeof onOpenThread === 'function') {
                    item.addEventListener('click', () => onOpenThread(thread));
                }
                container.appendChild(item);
            });
        },
        async renderCommentList({ container, comments, viewerUserId, onReply } = {}) {
            if (!container || typeof document === 'undefined') return;
            const resolvedViewerId = this.resolveViewerUserId(viewerUserId);
            const list = await ForumLink.view.decorateCommentList(comments || [], resolvedViewerId);
            container.innerHTML = '';

            list.forEach((comment) => {
                const item = document.createElement('div');
                item.className = 'forum-comment-item';
                item.dataset.commentId = comment.id;
                const author = ForumLink.utils.escapeHtml(comment.displayAuthorName || '');
                const time = this.formatTime(comment.createdAt);
                const content = ForumLink.utils.escapeHtml(comment.content || '').replace(/\n/g, '<br>');
                const stats = comment.metrics || {};
                item.innerHTML = `
                    <div class="forum-comment-meta">${author} · ${time}</div>
                    <div class="forum-comment-content">${content}</div>
                    <div class="forum-comment-stats">
                        <span>赞 ${stats.like || 0}</span>
                        <span>踩 ${stats.dislike || 0}</span>
                    </div>
                `;
                if (typeof onReply === 'function') {
                    item.addEventListener('click', () => onReply(comment));
                }
                container.appendChild(item);
            });
        }
    },

    // === 排行与统计（里程碑 9） ===
    stats: {
        getHeatScore(thread) {
            if (!thread || !thread.metrics) return 0;
            return thread.metrics.heat || 0;
        },
        async getHotThreads({ limit = 10 } = {}) {
            const storage = ForumLink.adapters.storage;
            if (!storage) return [];
            const threads = await storage.listThreads({ sortBy: 'hot', limit });
            return threads || [];
        },
        async getPopularUsers({ limit = 10, threads = null } = {}) {
            const storage = ForumLink.adapters.storage;
            if (!storage || !storage.listThreads) return [];
            const sourceThreads = Array.isArray(threads)
                ? threads
                : await storage.listThreads({ sortBy: 'newest', limit: 180, includeContent: false });
            const scores = new Map();
            sourceThreads.forEach((thread) => {
                const author = thread.authorIdentity;
                if (!author) return;
                const authorType = author.authorType || author.author_type;
                const authorId = author.authorId || author.author_id;
                const isAnonymous = author.anonymous === true || author.anonymous === 'true' || author.anonymous === 1;
                // 匿名发帖的热度不计入用户总热度（避免匿名上榜）
                if (authorType !== 'user' || !authorId || isAnonymous) return;
                const score = (thread.metrics?.like || 0)
                    + (thread.metrics?.commentCount || 0)
                    + (thread.metrics?.share || 0)
                    + (thread.metrics?.collect || 0);
                scores.set(authorId, (scores.get(authorId) || 0) + score);
            });
            const ranking = Array.from(scores.entries()).map(([userId, score]) => ({ userId, score }));
            ranking.sort((a, b) => b.score - a.score);
            const results = ranking.slice(0, limit);
            await Promise.all(results.map(async (item) => {
                item.user = await storage.getUser(item.userId);
            }));
            return results;
        },
        async getPopularChars({ limit = 10, threads = null } = {}) {
            const storage = ForumLink.adapters.storage;
            if (!storage || !storage.listThreads) return [];
            const sourceThreads = Array.isArray(threads)
                ? threads
                : await storage.listThreads({ sortBy: 'newest', limit: 180, includeContent: false });
            const scores = new Map();
            sourceThreads.forEach((thread) => {
                const author = thread.authorIdentity;
                if (!author) return;
                const authorType = author.authorType || author.author_type;
                const authorId = author.authorId || author.author_id;
                const isAnonymous = author.anonymous === true || author.anonymous === 'true' || author.anonymous === 1;
                // 匿名发帖的热度不计入角色总热度（避免匿名上榜）
                if (authorType !== 'char' || !authorId || isAnonymous) return;
                const score = (thread.metrics?.like || 0)
                    + (thread.metrics?.commentCount || 0)
                    + (thread.metrics?.share || 0)
                    + (thread.metrics?.collect || 0);
                scores.set(authorId, (scores.get(authorId) || 0) + score);
            });
            const ranking = Array.from(scores.entries()).map(([charId, score]) => ({ charId, score }));
            ranking.sort((a, b) => b.score - a.score);
            const results = ranking.slice(0, limit);
            await Promise.all(results.map(async (item) => {
                item.char = await storage.getChar(item.charId);
            }));
            return results;
        }
    },

    // === UI 页面数据接口（里程碑 10） ===
    data: {
        async getHomePageData({ viewerUserId, hotLimit = 10, userLimit = 10, charLimit = 10 } = {}) {
            const storage = ForumLink.adapters.storage;
            if (!storage) return null;
            const resolvedViewerId = viewerUserId || ForumLink.state.currentUserId;
            const [threadPool, sections, channels] = await Promise.all([
                storage.listThreads({ sortBy: 'newest', limit: 180 }),
                storage.listSections(),
                storage.listChannels()
            ]);
            const sourceThreads = Array.isArray(threadPool) ? threadPool : [];
            const hotThreads = sourceThreads
                .slice()
                .sort((a, b) => (b.metrics?.heat || 0) - (a.metrics?.heat || 0))
                .slice(0, Math.max(1, Number(hotLimit) || 10));
            const [popularUsers, popularChars] = await Promise.all([
                ForumLink.stats.getPopularUsers({ limit: userLimit, threads: sourceThreads }),
                ForumLink.stats.getPopularChars({ limit: charLimit, threads: sourceThreads })
            ]);

            const decoratedHot = await ForumLink.view.decorateThreadList(hotThreads || [], resolvedViewerId);

            return {
                hotThreads: decoratedHot,
                popularUsers: popularUsers || [],
                popularChars: popularChars || [],
                sections: sections || [],
                channels: channels || []
            };
        },

        async getSectionPageData({ sectionId, viewerUserId, sortBy = 'hot', limit = 50 } = {}) {
            const storage = ForumLink.adapters.storage;
            if (!storage || !sectionId) return null;
            const resolvedViewerId = viewerUserId || ForumLink.state.currentUserId;
            const [section, channels, threads] = await Promise.all([
                storage.listSections().then((list) => list.find((s) => s.id === sectionId) || null),
                storage.listChannels({ sectionId }),
                storage.listThreads({ sectionId, sortBy, limit })
            ]);
            const decorated = await ForumLink.view.decorateThreadList(threads || [], resolvedViewerId);
            return { section, channels, threads: decorated };
        },

        async getChannelPageData({ channelId, viewerUserId, sortBy = 'newest', limit = 50 } = {}) {
            const storage = ForumLink.adapters.storage;
            if (!storage || !channelId) return null;
            const resolvedViewerId = viewerUserId || ForumLink.state.currentUserId;
            const channelList = await storage.listChannels();
            const channel = channelList.find((c) => c.id === channelId) || null;
            const threads = await storage.listThreads({ channelId, sortBy, limit });
            const decorated = await ForumLink.view.decorateThreadList(threads || [], resolvedViewerId);
            return { channel, threads: decorated };
        },

        async getThreadPageData({ threadId, viewerUserId, commentLimit = 100 } = {}) {
            const storage = ForumLink.adapters.storage;
            if (!storage || !threadId) return null;
            const resolvedViewerId = viewerUserId || ForumLink.state.currentUserId;
            const [thread, comments] = await Promise.all([
                storage.getThread(threadId),
                storage.listComments(threadId, { limit: commentLimit })
            ]);
            const decoratedThread = await ForumLink.view.decorateThread(thread, resolvedViewerId);
            const decoratedComments = await ForumLink.view.decorateCommentList(comments || [], resolvedViewerId);
            return {
                thread: decoratedThread,
                comments: decoratedComments
            };
        },

        async getUserProfileData({ userId, viewerUserId, limit = 50 } = {}) {
            const storage = ForumLink.adapters.storage;
            if (!storage || !userId) return null;
            const resolvedViewerId = viewerUserId || ForumLink.state.currentUserId;
            const user = await storage.getUser(userId);
            const threads = await storage.listThreads({ sortBy: 'newest', limit: 200 });
            const ownThreads = threads.filter((t) => t.authorIdentity?.authorType === 'user' && t.authorIdentity.authorId === userId);
            const decoratedThreads = await ForumLink.view.decorateThreadList(
                ownThreads.slice(0, Math.max(1, Number(limit) || 50)),
                resolvedViewerId
            );
            return { user, threads: decoratedThreads };
        },

        async getCharProfileData({ charId, viewerUserId, limit = 50 } = {}) {
            const storage = ForumLink.adapters.storage;
            if (!storage || !charId) return null;
            const resolvedViewerId = viewerUserId || ForumLink.state.currentUserId;
            const char = await storage.getChar(charId);
            const safeLimit = Math.max(1, Number(limit) || 50);
            const maxThreadScan = Math.min(240, Math.max(120, safeLimit * 12));
            const threads = await storage.listThreads({ sortBy: 'newest', limit: maxThreadScan });
            const threadById = new Map((threads || []).map((thread) => [thread.id, thread]));
            const toAuthorType = (identity) => String(identity?.authorType || identity?.author_type || '');
            const toAuthorId = (identity) => String(identity?.authorId || identity?.author_id || '');
            const hasParentComment = (comment) => {
                if (!comment) return false;
                const raw = comment.parentId ?? comment.parent_id;
                return !(raw === undefined || raw === null || String(raw).trim() === '');
            };

            const ownThreads = (threads || []).filter((t) => {
                const author = t?.authorIdentity;
                return toAuthorType(author) === 'char' && toAuthorId(author) === String(charId);
            });
            const decoratedThreads = await ForumLink.view.decorateThreadList(
                ownThreads.slice(0, safeLimit),
                resolvedViewerId
            );

            const reviewList = await storage.listCharReviews({ charId, limit: Math.max(50, safeLimit * 2) });
            const reviewMap = new Map();
            reviewList.forEach((review) => {
                if (!review || !review.threadId) return;
                if (!reviewMap.has(review.threadId)) {
                    reviewMap.set(review.threadId, review);
                }
            });

            const fetchThreadsByIds = async (ids = []) => {
                const uniq = Array.from(new Set((ids || []).filter(Boolean)));
                if (!uniq.length) return [];
                const hit = [];
                const miss = [];
                uniq.forEach((id) => {
                    if (threadById.has(id)) hit.push(threadById.get(id));
                    else miss.push(id);
                });
                if (!miss.length) return hit;
                const loaded = await Promise.all(miss.map((id) => storage.getThread(id)));
                loaded.forEach((thread) => {
                    if (thread && thread.id) threadById.set(thread.id, thread);
                });
                return hit.concat(loaded.filter(Boolean));
            };

            const reviewThreadIds = Array.from(reviewMap.keys()).slice(0, safeLimit);
            const reviewThreads = await fetchThreadsByIds(reviewThreadIds);
            const decoratedReviewThreads = await ForumLink.view.decorateThreadList(reviewThreads, resolvedViewerId);
            const reviewItems = decoratedReviewThreads.map((thread) => ({
                thread,
                review: reviewMap.get(thread.id) || null
            }));

            let likedThreads = [];
            if (typeof storage.listInteractions === 'function') {
                const likes = await storage.listInteractions({ actorId: charId, type: 'like', limit: Math.max(50, safeLimit * 4) });
                const likedThreadIds = Array.from(new Set((likes || []).map((item) => item.threadId).filter(Boolean))).slice(0, safeLimit);
                const likedRaw = await fetchThreadsByIds(likedThreadIds);
                likedThreads = await ForumLink.view.decorateThreadList(likedRaw, resolvedViewerId);
            }

            let authoredComments = [];
            if (typeof storage.listCommentsByAuthor === 'function') {
                const commentList = await storage.listCommentsByAuthor({
                    authorType: 'char',
                    authorId: charId,
                    limit: Math.max(120, safeLimit * 12)
                });
                authoredComments = Array.isArray(commentList) ? commentList.slice() : [];
            } else {
                // Fallback for adapters without listCommentsByAuthor: keep bounded scan.
                const scanLimit = Math.min(maxThreadScan, Math.max(100, safeLimit * 4));
                const scanThreads = (threads || []).slice(0, scanLimit);
                for (const thread of scanThreads) {
                    const comments = await storage.listComments(thread.id, { limit: 200 });
                    if (!comments || comments.length === 0) continue;
                    comments.forEach((c) => {
                        const author = c?.authorIdentity;
                        const isCharComment = toAuthorType(author) === 'char' && toAuthorId(author) === String(charId);
                        if (isCharComment) {
                            authoredComments.push(c);
                        }
                    });
                }
            }
            authoredComments = authoredComments
                .filter((comment) => comment && comment.threadId)
                .sort((a, b) => new Date(b?.createdAt || b?.created_at || 0) - new Date(a?.createdAt || a?.created_at || 0));
            const topLevelCommentByThread = new Map();
            for (const comment of authoredComments) {
                if (!comment || hasParentComment(comment)) continue; // “评论过的帖子”仅统计主楼评论，不含楼中楼回复
                const threadId = String(comment.threadId || '').trim();
                if (!threadId || topLevelCommentByThread.has(threadId)) continue;
                topLevelCommentByThread.set(threadId, comment);
                if (topLevelCommentByThread.size >= safeLimit) break;
            }
            const commentedThreadIds = Array.from(topLevelCommentByThread.keys());
            const commentedRaw = await fetchThreadsByIds(commentedThreadIds);
            const commentedThreads = await ForumLink.view.decorateThreadList(commentedRaw, resolvedViewerId);
            const commentedThreadMap = new Map((commentedThreads || []).map((thread) => [String(thread?.id || '').trim(), thread]));
            const commentedItems = commentedThreadIds.map((threadId) => {
                const comment = topLevelCommentByThread.get(threadId) || null;
                const thread = commentedThreadMap.get(threadId) || null;
                if (!thread || !comment) return null;
                return {
                    thread,
                    commentId: comment.id || '',
                    commentContent: comment.content || '',
                    commentedAt: comment.createdAt || comment.created_at || ''
                };
            }).filter(Boolean);

            const repliedCommentsRaw = authoredComments
                .filter((comment) => Boolean(comment && hasParentComment(comment)))
                .slice(0, safeLimit);
            const repliedThreadIds = Array.from(new Set(
                repliedCommentsRaw.map((comment) => comment.threadId).filter(Boolean)
            ));
            const repliedThreadsRaw = await fetchThreadsByIds(repliedThreadIds);
            const repliedThreads = await ForumLink.view.decorateThreadList(repliedThreadsRaw, resolvedViewerId);
            const repliedThreadMap = new Map((repliedThreads || []).map((thread) => [thread.id, thread]));
            const parentMapByThread = new Map();
            await Promise.all(repliedThreadIds.map(async (threadId) => {
                try {
                    const rows = await storage.listComments(threadId, { limit: 240 });
                    const idMap = new Map();
                    (rows || []).forEach((row) => {
                        const id = String(row?.id || '').trim();
                        if (id) idMap.set(id, row);
                    });
                    parentMapByThread.set(threadId, idMap);
                } catch (_) {
                    parentMapByThread.set(threadId, new Map());
                }
            }));
            const repliedComments = repliedCommentsRaw.map((comment) => {
                const thread = repliedThreadMap.get(comment.threadId) || threadById.get(comment.threadId) || null;
                const parentMap = parentMapByThread.get(comment.threadId) || new Map();
                const parentComment = parentMap.get(String(comment.parentId || '').trim()) || null;
                return {
                    id: comment.id,
                    threadId: comment.threadId,
                    parentId: comment.parentId,
                    content: comment.content || '',
                    createdAt: comment.createdAt || comment.created_at || '',
                    thread,
                    parentContent: parentComment?.content || ''
                };
            });

            return {
                char,
                threads: decoratedThreads,
                reviews: reviewList.slice(0, safeLimit),
                reviewItems,
                likedThreads,
                commentedThreads,
                commentedItems,
                replyComments: repliedComments
            };
        },

        async getCharInterestData({ charId, viewerUserId, limit = 50 } = {}) {
            const storage = ForumLink.adapters.storage;
            if (!storage || !charId) return null;
            const resolvedViewerId = viewerUserId || ForumLink.state.currentUserId;
            const reviews = await storage.listCharReviews({ charId, limit });
            const threadIds = Array.from(new Set(reviews.map((r) => r.threadId))).slice(0, limit);
            const threads = [];
            for (const id of threadIds) {
                const thread = await storage.getThread(id);
                if (thread) threads.push(thread);
            }
            const decoratedThreads = await ForumLink.view.decorateThreadList(threads, resolvedViewerId);
            return { reviews, threads: decoratedThreads };
        }
    },

    // === 通知与艾特（里程碑 11） ===
    notify: {
        mentionTokenRegex: /@\[(.+?)\]\((user|char):([a-zA-Z0-9_-]+)\)/g,

        parseMentionTokens(text = '') {
            const source = String(text || '');
            const result = [];
            const seen = new Set();
            let match;
            const regex = new RegExp(this.mentionTokenRegex.source, 'g');
            while ((match = regex.exec(source)) !== null) {
                const label = String(match[1] || '').trim();
                const receiverType = String(match[2] || '').trim();
                const receiverId = String(match[3] || '').trim();
                if (!receiverType || !receiverId) continue;
                const key = `${receiverType}:${receiverId}`;
                if (seen.has(key)) continue;
                seen.add(key);
                result.push({
                    label,
                    receiverType,
                    receiverId,
                    raw: match[0]
                });
            }
            return result;
        },

        stripMentionMarkup(text = '') {
            const source = String(text || '');
            return source.replace(this.mentionTokenRegex, (_full, label) => `@${String(label || '').trim()}`);
        },

        toExcerpt(text = '', maxLength = 120) {
            const plain = String(this.stripMentionMarkup(text || ''))
                .replace(/\s+/g, ' ')
                .trim();
            if (!plain) return '';
            if (plain.length <= maxLength) return plain;
            return `${plain.slice(0, Math.max(0, maxLength - 1))}…`;
        },

        normalizeIdentity(identity = null) {
            if (!identity || typeof identity !== 'object') return null;
            const authorType = String(identity.authorType || identity.author_type || '').trim();
            const authorId = String(identity.authorId || identity.author_id || '').trim();
            if (!authorType || !authorId) return null;
            return {
                authorType,
                authorId
            };
        },

        isSameIdentity(a, b) {
            const left = this.normalizeIdentity(a);
            const right = this.normalizeIdentity(b);
            if (!left || !right) return false;
            return left.authorType === right.authorType && left.authorId === right.authorId;
        },

        async createNotifications(items = []) {
            const storage = ForumLink.adapters.storage;
            if (!storage || typeof storage.createNotifications !== 'function') return [];
            const normalized = (Array.isArray(items) ? items : [])
                .map((item) => ForumLink.models.createNotification(item))
                .filter((item) => item.receiverType && item.receiverId);
            if (!normalized.length) return [];
            return storage.createNotifications(normalized);
        },

        async markNotificationsRead(params = {}) {
            const storage = ForumLink.adapters.storage;
            if (!storage || typeof storage.markNotificationsRead !== 'function') return 0;
            return storage.markNotificationsRead(params);
        },

        async listNotifications(params = {}) {
            const storage = ForumLink.adapters.storage;
            if (!storage || typeof storage.listNotifications !== 'function') return [];
            return storage.listNotifications(params);
        },

        async listPendingMentionsForChar(charId, limit = 10) {
            const safeCharId = String(charId || '').trim();
            if (!safeCharId) return [];
            return this.listNotifications({
                receiverType: 'char',
                receiverId: safeCharId,
                category: 'mention',
                isRead: false,
                limit
            });
        },

        async notifyLike({ threadId, commentId = null, actorIdentity = null } = {}) {
            const storage = ForumLink.adapters.storage;
            if (!storage || !threadId) return;
            const actor = this.normalizeIdentity(actorIdentity);
            if (!actor) return;

            const targetThread = await storage.getThread(threadId);
            if (!targetThread) return;

            let targetIdentity = targetThread.authorIdentity || null;
            let type = 'like_thread';
            let title = targetThread.title || '';
            let excerpt = this.toExcerpt(targetThread.content || '', 100);

            if (commentId) {
                try {
                    const comments = await storage.listComments(threadId, { limit: 400 });
                    const targetComment = (comments || []).find((item) => String(item?.id || '') === String(commentId));
                    if (targetComment) {
                        targetIdentity = targetComment.authorIdentity || targetIdentity;
                        type = 'like_comment';
                        excerpt = this.toExcerpt(targetComment.content || '', 100);
                    }
                } catch (_) { }
            }

            const receiver = this.normalizeIdentity(targetIdentity);
            if (!receiver) return;
            if (this.isSameIdentity(receiver, actor)) return;

            await this.createNotifications([{
                receiverType: receiver.authorType,
                receiverId: receiver.authorId,
                category: 'engagement',
                type,
                actorIdentity,
                threadId: targetThread.id,
                commentId: commentId || null,
                title,
                excerpt
            }]);
        },

        async notifyThreadMentions({ thread = null, actorIdentity = null } = {}) {
            if (!thread || !thread.id) return;
            const actor = this.normalizeIdentity(actorIdentity || thread.authorIdentity);
            const mentions = this.parseMentionTokens(thread.content || '');
            if (!mentions.length) return;

            const notifications = [];
            mentions.forEach((mention) => {
                const receiver = this.normalizeIdentity({
                    authorType: mention.receiverType,
                    authorId: mention.receiverId
                });
                if (!receiver) return;
                if (actor && this.isSameIdentity(receiver, actor)) return;
                notifications.push({
                    receiverType: receiver.authorType,
                    receiverId: receiver.authorId,
                    category: 'mention',
                    type: 'mention_thread',
                    actorIdentity: actorIdentity || thread.authorIdentity || null,
                    threadId: thread.id,
                    commentId: null,
                    title: thread.title || '',
                    excerpt: this.toExcerpt(thread.content || '', 120),
                    meta: {
                        mentionLabel: mention.label || ''
                    }
                });
            });
            if (notifications.length) {
                await this.createNotifications(notifications);
            }
        },

        async notifyCommentCreated({ comment = null, actorIdentity = null } = {}) {
            const storage = ForumLink.adapters.storage;
            if (!storage || !comment || !comment.id || !comment.threadId) return;
            const actor = this.normalizeIdentity(actorIdentity || comment.authorIdentity);
            const thread = await storage.getThread(comment.threadId);
            if (!thread) return;

            const title = thread.title || '';
            const excerpt = this.toExcerpt(comment.content || '', 120);
            const notifications = [];
            const dedupe = new Set();
            const pushNotification = (item) => {
                if (!item) return;
                const receiverType = String(item.receiverType || '').trim();
                const receiverId = String(item.receiverId || '').trim();
                if (!receiverType || !receiverId) return;
                if (actor && this.isSameIdentity({ authorType: receiverType, authorId: receiverId }, actor)) return;
                const key = `${receiverType}:${receiverId}:${item.type || ''}:${item.threadId || ''}:${item.commentId || ''}:${item.parentCommentId || ''}`;
                if (dedupe.has(key)) return;
                dedupe.add(key);
                notifications.push(item);
            };

            if (comment.parentId) {
                try {
                    const allComments = await storage.listComments(comment.threadId, { limit: 400 });
                    const parentComment = (allComments || []).find((item) => String(item?.id || '') === String(comment.parentId));
                    if (parentComment && parentComment.authorIdentity) {
                        const receiver = this.normalizeIdentity(parentComment.authorIdentity);
                        if (receiver) {
                            pushNotification({
                                receiverType: receiver.authorType,
                                receiverId: receiver.authorId,
                                category: 'engagement',
                                type: 'reply_comment',
                                actorIdentity: actorIdentity || comment.authorIdentity || null,
                                threadId: comment.threadId,
                                commentId: comment.id,
                                parentCommentId: parentComment.id,
                                title,
                                excerpt
                            });
                        }
                    }
                } catch (_) { }
            } else if (thread.authorIdentity) {
                const receiver = this.normalizeIdentity(thread.authorIdentity);
                if (receiver) {
                    pushNotification({
                        receiverType: receiver.authorType,
                        receiverId: receiver.authorId,
                        category: 'engagement',
                        type: 'comment_thread',
                        actorIdentity: actorIdentity || comment.authorIdentity || null,
                        threadId: comment.threadId,
                        commentId: comment.id,
                        parentCommentId: null,
                        title,
                        excerpt
                    });
                }
            }

            const mentionTokens = this.parseMentionTokens(comment.content || '');
            mentionTokens.forEach((mention) => {
                const receiver = this.normalizeIdentity({
                    authorType: mention.receiverType,
                    authorId: mention.receiverId
                });
                if (!receiver) return;
                pushNotification({
                    receiverType: receiver.authorType,
                    receiverId: receiver.authorId,
                    category: 'mention',
                    type: comment.parentId ? 'mention_reply' : 'mention_comment',
                    actorIdentity: actorIdentity || comment.authorIdentity || null,
                    threadId: comment.threadId,
                    commentId: comment.id,
                    parentCommentId: comment.parentId || null,
                    title,
                    excerpt,
                    meta: {
                        mentionLabel: mention.label || ''
                    }
                });
            });

            if (notifications.length) {
                await this.createNotifications(notifications);
            }
        }
    },

    // === 事件与指令桥 ===
    events: {
        commandHandlers: []
    },

    onCommand(handler) {
        if (typeof handler !== 'function') return;
        this.events.commandHandlers.push(handler);
    },

    emitCommand(command) {
        this.events.commandHandlers.forEach((handler) => {
            try {
                handler(command);
            } catch (error) {
                console.warn('ForumLink command handler error', error);
            }
        });
    },

    // === 聊天指令解析 ===
    parseChatCommand(text, context = {}) {
        if (!text || typeof text !== 'string') return null;
        const raw = text.trim();
        if (!raw) return null;

        const lower = raw.toLowerCase();
        const contains = (list) => list.some((keyword) => lower.includes(keyword));

        const browseKeywords = ['刷论坛', '逛论坛', '看论坛', '去论坛', '浏览论坛', '看看论坛'];
        const postKeywords = ['发帖', '发个帖子', '发一篇', '发一帖', '发帖子', '去发帖'];
        const checkReplyKeywords = ['看回复', '看看回复', '查看回复', '有没有人回复', '查看回帖', '看回帖'];
        const forumKeywords = ['论坛', '帖子', '回帖', '楼中楼'];

        if (!contains(forumKeywords)) return null;

        let type = null;
        if (contains(browseKeywords)) type = 'browse';
        if (contains(postKeywords)) type = type ? type : 'post';
        if (contains(checkReplyKeywords)) type = type ? type : 'check_reply';

        if (!type) return null;

        const payload = Object.assign({}, context.payload || {});

        if (raw.includes('匿名')) {
            if (raw.includes('不匿名') || raw.includes('不要匿名') || raw.includes('非匿名')) {
                payload.anonymous = false;
            } else {
                payload.anonymous = true;
            }
        }

        return {
            type,
            payload,
            targetCharId: context.targetCharId || null,
            targetUserId: context.targetUserId || null,
            priority: context.priority || 0,
            source: 'chat',
            rawText: raw
        };
    },

    ingestChatText(text, context = {}) {
        this.memory.triggerByText(text, context.userId || this.state.currentUserId);
        const command = this.parseChatCommand(text, context);
        if (!command) return null;
        this.handleCommand(command);
        return command;
    },

    // === 用户文本入口（仅做记忆触发） ===
    ingestUserText(text, context = {}) {
        this.memory.triggerByText(text, context.userId || this.state.currentUserId);
    },

    // === 本地集成适配器（可用于 IDIC/Kiki 桥接） ===
    createLocalIntegrationAdapter() {
        const handlers = [];
        return {
            onForumCommand(handler) {
                if (typeof handler === 'function') handlers.push(handler);
            },
            emitForumCommand(command) {
                handlers.forEach((handler) => handler(command));
            },
            sendNotification(payload) {
                console.log('Forum notification', payload);
            },
            sendForumCard(payload) {
                console.log('Forum card', payload);
            },
            openForumUI() {
                console.log('Open forum UI');
            },
            getActiveUserId() {
                return null;
            }
        };
    },

    // === 记忆注入机制（里程碑 6） ===
    memory: {
        stateByUser: new Map(),
        defaults: {
            windowHours: 3,
            maxItems: 8,
            keywords: ['帖子', '论坛', '回帖', '楼中楼', '热帖', '发帖', '评论', '回复']
        },

        getState(userId) {
            if (!userId) return { activeUntil: null, lastTriggeredAt: null };
            if (!this.stateByUser.has(userId)) {
                this.stateByUser.set(userId, { activeUntil: null, lastTriggeredAt: null });
            }
            return this.stateByUser.get(userId);
        },

        triggerByText(text, userId) {
            if (!text || typeof text !== 'string') return false;
            const lower = text.toLowerCase();
            const hit = this.defaults.keywords.some((kw) => lower.includes(kw.toLowerCase()));
            if (!hit) return false;

            const state = this.getState(userId);
            const now = Date.now();
            const duration = this.defaults.windowHours * 60 * 60 * 1000;
            state.lastTriggeredAt = now;
            state.activeUntil = now + duration;
            return true;
        },

        isWindowActive(userId) {
            const state = this.getState(userId);
            if (!state.activeUntil) return false;
            return Date.now() < state.activeUntil;
        },

        async purgeExpired(storage) {
            if (storage && typeof storage.purgeExpiredMemory === 'function') {
                await storage.purgeExpiredMemory({ now: new Date().toISOString() });
            }
        },

        async getInjectedMemories({ charId, userId, maxItems } = {}) {
            const storage = ForumLink.adapters.storage;
            if (!storage || !charId) return [];

            await this.purgeExpired(storage);

            const items = await storage.listMemoryItems({ charId, limit: maxItems || this.defaults.maxItems });
            if (!items || items.length === 0) return [];

            const now = Date.now();
            const activeItems = items.filter((item) => {
                if (!item.expiresAt) return false;
                return new Date(item.expiresAt).getTime() > now;
            });

            if (activeItems.length) {
                return activeItems.slice(0, maxItems || this.defaults.maxItems);
            }

            if (this.isWindowActive(userId)) {
                return items.slice(0, maxItems || this.defaults.maxItems);
            }

            return [];
        },

        summarizeHippocampusPacket(packet) {
            const safePacket = packet && typeof packet === 'object' ? packet : {};
            const existingSummary = safePacket.summary && typeof safePacket.summary === 'object'
                ? safePacket.summary
                : null;
            if (existingSummary) {
                return {
                    preset: String(existingSummary.preset || '').trim(),
                    query: String(existingSummary.query || '').trim(),
                    effectiveQuery: String(existingSummary.effectiveQuery || '').trim(),
                    attachmentStyle: String(existingSummary.attachmentStyle || '').trim(),
                    recallCount: Math.max(0, Number(existingSummary.recallCount || 0)),
                    eventCount: Math.max(0, Number(existingSummary.eventCount || 0)),
                    fragmentCount: Math.max(0, Number(existingSummary.fragmentCount || 0)),
                    unresolvedEventCount: Math.max(0, Number(existingSummary.unresolvedEventCount || 0)),
                    triggeredCount: Math.max(0, Number(existingSummary.triggeredCount || 0)),
                    flashbulbCount: Math.max(0, Number(existingSummary.flashbulbCount || 0)),
                    scenarioPromptTokenEstimate: Math.max(0, Number(existingSummary.scenarioPromptTokenEstimate || 0)),
                    attachmentBiasSummary: existingSummary.attachmentBiasSummary && typeof existingSummary.attachmentBiasSummary === 'object'
                        ? {
                            style: String(existingSummary.attachmentBiasSummary.style || '').trim(),
                            biasedEventCount: Math.max(0, Number(existingSummary.attachmentBiasSummary.biasedEventCount || 0)),
                            boostedCount: Math.max(0, Number(existingSummary.attachmentBiasSummary.boostedCount || 0)),
                            suppressedCount: Math.max(0, Number(existingSummary.attachmentBiasSummary.suppressedCount || 0)),
                            dominantReasons: Array.isArray(existingSummary.attachmentBiasSummary.dominantReasons)
                                ? existingSummary.attachmentBiasSummary.dominantReasons.slice(0, 5)
                                : []
                        }
                        : null,
                    eventHighlights: Array.isArray(existingSummary.eventHighlights) ? existingSummary.eventHighlights.slice(0, 3) : [],
                    fragmentHighlights: Array.isArray(existingSummary.fragmentHighlights) ? existingSummary.fragmentHighlights.slice(0, 3) : [],
                    unresolvedHighlights: Array.isArray(existingSummary.unresolvedHighlights) ? existingSummary.unresolvedHighlights.slice(0, 3) : [],
                    triggeredHighlights: Array.isArray(existingSummary.triggeredHighlights) ? existingSummary.triggeredHighlights.slice(0, 3) : [],
                    flashbulbHighlights: Array.isArray(existingSummary.flashbulbHighlights) ? existingSummary.flashbulbHighlights.slice(0, 3) : []
                };
            }
            const toList = (value) => Array.isArray(value) ? value : [];
            const estimateTokens = (value) => {
                const text = String(value || '').trim();
                return text ? Math.max(1, Math.ceil(text.length / 4)) : 0;
            };
            const summarizeItem = (item) => {
                const safeItem = item && typeof item === 'object' ? item : {};
                const title = String(
                    safeItem.title
                    || safeItem.eventTitle
                    || safeItem.summary
                    || safeItem.content
                    || ''
                ).trim();
                const summary = String(safeItem.summary || safeItem.content || '').trim();
                const merged = title && summary && summary !== title
                    ? `${title}｜${summary}`
                    : (title || summary);
                return merged.length > 120 ? `${merged.slice(0, 117)}...` : merged;
            };
            const summarizeList = (value, limit = 3) => toList(value)
                .slice(0, Math.max(0, Number(limit || 0)))
                .map(summarizeItem)
                .filter(Boolean);

            return {
                preset: String(safePacket.preset || '').trim(),
                query: String(safePacket.query || '').trim(),
                effectiveQuery: String(safePacket.effectiveQuery || safePacket.query || '').trim(),
                attachmentStyle: String(safePacket.attachmentStyle || (safePacket.attachmentProfile && safePacket.attachmentProfile.style) || '').trim(),
                recallCount: toList(safePacket.recallRows).length,
                eventCount: toList(safePacket.eventRows).length,
                fragmentCount: toList(safePacket.fragmentRows).length,
                unresolvedEventCount: toList(safePacket.unresolvedEventRows).length,
                triggeredCount: toList(safePacket.triggeredRows).length,
                flashbulbCount: toList(safePacket.flashbulbRows).length,
                scenarioPromptTokenEstimate: estimateTokens(
                    safePacket.scenarioPromptContext
                    || safePacket.mergedMemoryContext
                    || safePacket.hippocampusRecallBlock
                    || ''
                ),
                attachmentBiasSummary: safePacket.attachmentBiasSummary && typeof safePacket.attachmentBiasSummary === 'object'
                    ? {
                        style: String(safePacket.attachmentBiasSummary.style || '').trim(),
                        biasedEventCount: Math.max(0, Number(safePacket.attachmentBiasSummary.biasedEventCount || 0)),
                        boostedCount: Math.max(0, Number(safePacket.attachmentBiasSummary.boostedCount || 0)),
                        suppressedCount: Math.max(0, Number(safePacket.attachmentBiasSummary.suppressedCount || 0)),
                        dominantReasons: Array.isArray(safePacket.attachmentBiasSummary.dominantReasons)
                            ? safePacket.attachmentBiasSummary.dominantReasons.slice(0, 5)
                            : []
                    }
                    : null,
                eventHighlights: summarizeList(safePacket.eventRows, 3),
                fragmentHighlights: summarizeList(safePacket.fragmentRows, 3),
                unresolvedHighlights: summarizeList(safePacket.unresolvedEventRows, 3),
                triggeredHighlights: summarizeList(safePacket.triggeredRows, 3),
                flashbulbHighlights: summarizeList(safePacket.flashbulbRows, 3)
            };
        },

        async buildContext({ charId, userId, maxItems } = {}) {
            const items = await this.getInjectedMemories({ charId, userId, maxItems });
            const segments = [];
            let legacyPrompt = '';
            let hippocampusPrompt = '';
            let hippocampusPacket = null;

            if (items && items.length > 0) {
                const lines = items.map((item, index) => {
                    const tagText = item.tags && item.tags.length ? `【${item.tags.join('、')}】` : '';
                    return `${index + 1}. 《${item.title}》${tagText}｜点评：${item.reviewText}｜动作：${item.actionSummary || '无'}`;
                });
                legacyPrompt = [
                    '【论坛记忆注入】以下是你最近关注过的帖子摘要，仅供参考：',
                    ...lines
                ].join('\n');
                segments.push(legacyPrompt);
            }

            const contextBuilder = typeof globalThis !== 'undefined'
                && globalThis.HippocampusContextBuilder
                && typeof globalThis.HippocampusContextBuilder === 'object'
                ? globalThis.HippocampusContextBuilder
                : null;
            const storage = ForumLink.adapters.storage;
            const canBuildForumContext = contextBuilder && typeof contextBuilder.buildForumPublicContext === 'function';
            const canBuildMixedContext = contextBuilder && typeof contextBuilder.buildMixedMemoryContext === 'function';
            if ((canBuildForumContext || canBuildMixedContext) && charId) {
                try {
                    let contact = null;
                    if (storage && typeof storage.getChar === 'function') {
                        contact = await storage.getChar(charId);
                    }
                    const mixed = canBuildForumContext
                        ? await contextBuilder.buildForumPublicContext({
                            contact: contact && typeof contact === 'object' ? contact : { id: charId },
                            charId: charId,
                            userId: userId
                        })
                        : await contextBuilder.buildMixedMemoryContext({
                            preset: 'forum_public',
                            contact: contact && typeof contact === 'object' ? contact : { id: charId },
                            charId: charId,
                            userId: userId
                        });
                    hippocampusPacket = mixed && typeof mixed === 'object' ? mixed : null;
                    const recallBlock = mixed && typeof mixed.scenarioPromptContext === 'string'
                        ? mixed.scenarioPromptContext.trim()
                        : (mixed && typeof mixed.hippocampusRecallBlock === 'string'
                            ? mixed.hippocampusRecallBlock.trim()
                            : '');
                    if (recallBlock) {
                        hippocampusPrompt = recallBlock;
                        segments.push(recallBlock);
                    }
                } catch (error) {
                    console.warn('[ForumLink] 海马体混合记忆注入失败，已回退传统论坛记忆。', error && error.message ? error.message : error);
                }
            }

            return {
                prompt: segments.join('\n\n'),
                segments,
                injectedItems: Array.isArray(items) ? items : [],
                legacyPrompt,
                hippocampusPrompt,
                hippocampusPacket,
                summary: this.summarizeHippocampusPacket(hippocampusPacket)
            };
        },

        async buildPrompt(options = {}) {
            const context = await this.buildContext(options);
            return context && typeof context.prompt === 'string' ? context.prompt : '';
        }
    },

    // === 内存存储适配器（开发占位，不持久化） ===
    createMemoryStorageAdapter(seed = {}) {
        const models = this.models;
        const store = {
            users: new Map(),
            chars: new Map(),
            identities: new Map(),
            sections: [],
            channels: [],
            threads: [],
            comments: [],
            interactions: new Map(),
            charReviews: [],
            memories: [],
            notifications: [],
            agentJobs: [],
            agentActionLogs: [],
            agentReports: [],
            agentApiProfiles: new Map()
        };

        let anonSeq = 1;

        const heatWeights = {
            like: 2,
            collect: 2,
            share: 3,
            view: 1,
            comment: 3,
            dislike: -1
        };

        const makeKey = (authorType, authorId) => `${authorType}:${authorId}`;

        const nextAnonId = () => String(anonSeq++).padStart(4, '0');

        const ensureCharNumberTag = (char) => {
            if (!char) return '0000';
            if (char.numberTag) return char.numberTag;
            const name = char.realName || char.displayName || '角色';
            const existing = Array.from(store.chars.values())
                .filter((c) => (c.realName || c.displayName || '角色') === name && c.numberTag)
                .map((c) => c.numberTag);
            let idx = 1;
            let tag = String(idx).padStart(4, '0');
            while (existing.includes(tag)) {
                idx += 1;
                tag = String(idx).padStart(4, '0');
            }
            char.numberTag = tag;
            return tag;
        };

        const formatUserDisplayName = (user) => {
            if (!user) return '用户';
            const forumName = user.forumName || user.settings?.forumName || user.username;
            return forumName || '用户';
        };

        const formatCharForumName = (char) => {
            if (!char) return '角色';
            return char.settings?.forumName || char.forumName || char.displayName || char.realName || '角色';
        };

        const formatCharDisplayName = (char) => {
            if (!char) return '角色';
            const owner = char.ownerUserId ? store.users.get(char.ownerUserId) : null;
            const ownerName = owner
                ? (owner.forumName || owner.settings?.forumName || owner.username || '用户')
                : '用户';
            const realName = char.realName || char.displayName || '角色';
            const tag = ensureCharNumberTag(char);
            return `${ownerName}的${realName}#${tag}`;
        };

        const seedMap = (map, items) => {
            if (!Array.isArray(items)) return;
            items.forEach((item) => {
                if (item && item.id) map.set(item.id, item);
            });
        };

        const seedArray = (target, items) => {
            if (!Array.isArray(items)) return;
            items.forEach((item) => target.push(item));
        };
        const seedAgentProfiles = (targetMap, items) => {
            if (!targetMap || typeof targetMap.set !== 'function') return;
            if (!Array.isArray(items)) return;
            items.forEach((item) => {
                const userId = String(item?.userId || item?.user_id || '').trim();
                if (!userId) return;
                const profile = item?.profile && typeof item.profile === 'object'
                    ? item.profile
                    : {};
                targetMap.set(userId, {
                    userId,
                    profile,
                    updatedAt: item?.updatedAt || item?.updated_at || forumNowIso()
                });
            });
        };

        const ensureIdentity = (authorType, authorId) => {
            const key = makeKey(authorType, authorId);
            if (store.identities.has(key)) return store.identities.get(key);

            let displayName = 'Anonymous';
            if (authorType === 'user') {
                const user = store.users.get(authorId);
                if (user) displayName = formatUserDisplayName(user);
            }
            if (authorType === 'char') {
                const char = store.chars.get(authorId);
                if (char) displayName = formatCharForumName(char);
            }

            const identity = models.createIdentity({
                authorType,
                authorId,
                displayName,
                anonymous: false
            });
            store.identities.set(key, identity);
            return identity;
        };

        const getThreadById = (threadId) => store.threads.find((t) => t.id === threadId) || null;
        const getCommentById = (commentId) => store.comments.find((c) => c.id === commentId) || null;

        const applyPagination = (items, params = {}) => {
            const offset = forumClampNumber(params.offset, 0, Number.MAX_SAFE_INTEGER, 0);
            const limit = forumClampNumber(params.limit, 1, 500, items.length);
            return items.slice(offset, offset + limit);
        };

        const sortThreads = (items, sortBy) => {
            const list = items.slice();
            switch (sortBy) {
                case 'recent_comment':
                    list.sort((a, b) => {
                        const aTime = a.lastCommentAt || a.updatedAt || a.createdAt;
                        const bTime = b.lastCommentAt || b.updatedAt || b.createdAt;
                        return new Date(bTime) - new Date(aTime);
                    });
                    break;
                case 'oldest':
                    list.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
                    break;
                case 'hot':
                    list.sort((a, b) => (b.metrics?.heat || 0) - (a.metrics?.heat || 0));
                    break;
                case 'newest':
                default:
                    list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                    break;
            }
            return list;
        };

        const updateThreadMetrics = (thread, type, delta) => {
            if (!thread || !thread.metrics) return;
            if (type === 'like') thread.metrics.like = Math.max(0, thread.metrics.like + delta);
            if (type === 'collect') thread.metrics.collect = Math.max(0, thread.metrics.collect + delta);
            if (type === 'share') thread.metrics.share = Math.max(0, thread.metrics.share + delta);
            if (type === 'comment') thread.metrics.commentCount = Math.max(0, thread.metrics.commentCount + delta);
            const weight = heatWeights[type] || 0;
            thread.metrics.heat += weight * delta;
        };

        const updateCommentMetrics = (comment, type, delta) => {
            if (!comment || !comment.metrics) return;
            if (type === 'like') comment.metrics.like = Math.max(0, comment.metrics.like + delta);
            if (type === 'dislike') comment.metrics.dislike = Math.max(0, comment.metrics.dislike + delta);
        };

        const seedStore = (seedInput) => {
            seedMap(store.users, seedInput.users);
            seedMap(store.chars, seedInput.chars);
            seedArray(store.sections, seedInput.sections);
            seedArray(store.channels, seedInput.channels);
            seedArray(store.threads, seedInput.threads);
            seedArray(store.comments, seedInput.comments);
            seedArray(store.charReviews, seedInput.charReviews);
            seedArray(store.memories, seedInput.memories);
            seedArray(store.notifications, seedInput.notifications);
            seedArray(store.agentJobs, seedInput.agentJobs);
            seedArray(store.agentActionLogs, seedInput.agentActionLogs);
            seedArray(store.agentReports, seedInput.agentReports);
            seedAgentProfiles(store.agentApiProfiles, seedInput.agentApiProfiles);
        };

        seedStore(seed);

        return {
            _store: store,

            insertUser(payload = {}) {
                const user = models.createUser(payload);
                store.users.set(user.id, user);
                return user;
            },
            insertChar(payload = {}) {
                const char = models.createChar(payload);
                ensureCharNumberTag(char);
                store.chars.set(char.id, char);
                return char;
            },
            insertSection(payload = {}) {
                const section = Object.assign({
                    id: payload.id || forumGenId('section'),
                    name: payload.name || '分区'
                }, payload);
                store.sections.push(section);
                return section;
            },
            insertChannel(payload = {}) {
                const channel = Object.assign({
                    id: payload.id || forumGenId('channel'),
                    name: payload.name || '频道',
                    sectionId: payload.sectionId || null
                }, payload);
                store.channels.push(channel);
                return channel;
            },

            async getUser(userId) {
                return store.users.get(userId) || null;
            },
            async getChar(charId) {
                return store.chars.get(charId) || null;
            },
            async getForumIdentity(authorType, authorId) {
                const key = makeKey(authorType, authorId);
                if (store.identities.has(key)) {
                    const existing = store.identities.get(key);
                    if (authorType === 'char') {
                        const char = store.chars.get(authorId);
                        if (char && (!existing.displayName || existing.displayName === 'Anonymous')) {
                            existing.displayName = formatCharForumName(char);
                        }
                    }
                    if (authorType === 'user') {
                        const user = store.users.get(authorId);
                        if (user && (!existing.displayName || existing.displayName === 'Anonymous')) {
                            existing.displayName = formatUserDisplayName(user);
                        }
                    }
                    if (existing.anonymous && !existing.anonDisplayId) {
                        existing.anonDisplayId = nextAnonId();
                    }
                    return existing;
                }
                return ensureIdentity(authorType, authorId);
            },
            async saveForumIdentity(identity) {
                if (!identity) return;
                if (identity.anonymous && !identity.anonDisplayId) {
                    identity.anonDisplayId = nextAnonId();
                }
                const key = makeKey(identity.authorType, identity.authorId);
                store.identities.set(key, identity);
            },
            async listSections() {
                return store.sections.slice();
            },
            async listChannels(params = {}) {
                if (!params.sectionId) return store.channels.slice();
                return store.channels.filter((c) => c.sectionId === params.sectionId);
            },
            async listThreads(params = {}) {
                let result = store.threads.slice();
                if (params.sectionId) {
                    result = result.filter((t) => t.sectionId === params.sectionId);
                }
                if (params.channelId) {
                    result = result.filter((t) => t.channelId === params.channelId);
                }
                result = sortThreads(result, params.sortBy);
                return applyPagination(result, params);
            },
            async getThread(threadId) {
                return getThreadById(threadId);
            },
            async createThread(payload = {}) {
                const thread = models.createThread(payload);
                store.threads.push(thread);
                return thread;
            },
            async listComments(threadId, params = {}) {
                let result = store.comments.filter((c) => c.threadId === threadId);
                const hasParentFilter = Object.prototype.hasOwnProperty.call(params, 'parentId');
                if (hasParentFilter) {
                    const rawParentId = params.parentId;
                    const parentId = rawParentId === undefined || rawParentId === null
                        ? null
                        : String(rawParentId).trim();
                    if (!parentId) {
                        result = result.filter((c) => !c.parentId);
                    } else {
                        result = result.filter((c) => String(c.parentId || '') === parentId);
                    }
                }
                const sortBy = String(params.sortBy || 'oldest');
                if (sortBy === 'newest') {
                    result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                } else {
                    result.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
                }
                return applyPagination(result, params);
            },
            async listCommentsByAuthor(params = {}) {
                const authorType = String(params.authorType || '').trim();
                const authorId = String(params.authorId || '').trim();
                if (!authorType || !authorId) return [];
                let result = store.comments.filter((comment) => {
                    const identity = comment?.authorIdentity || {};
                    const type = identity.authorType || identity.author_type;
                    const id = identity.authorId || identity.author_id;
                    return String(type || '') === authorType && String(id || '') === authorId;
                });
                result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                return applyPagination(result, params);
            },
            async createComment(payload = {}) {
                const comment = models.createComment(payload);
                store.comments.push(comment);
                const thread = getThreadById(comment.threadId);
                if (thread) {
                    updateThreadMetrics(thread, 'comment', 1);
                    thread.lastCommentAt = comment.createdAt;
                    thread.updatedAt = comment.createdAt;
                }
                return comment;
            },
            async addInteraction(payload = {}) {
                const type = payload.type;
                const actorId = payload.actorId || payload.actorIdentity?.authorId || 'unknown';
                const targetThreadId = payload.threadId || null;
                const targetCommentId = payload.commentId || null;
                const key = `${type}:${actorId}:${targetThreadId || ''}:${targetCommentId || ''}`;
                if (store.interactions.has(key)) return false;

                const interaction = Object.assign({
                    id: forumGenId('interaction'),
                    type,
                    actorId,
                    threadId: targetThreadId,
                    commentId: targetCommentId,
                    createdAt: forumNowIso()
                }, payload);

                store.interactions.set(key, interaction);

                if (targetCommentId) {
                    updateCommentMetrics(getCommentById(targetCommentId), type, 1);
                } else {
                    updateThreadMetrics(getThreadById(targetThreadId), type, 1);
                }
                return true;
            },
            async listInteractions(params = {}) {
                let list = Array.from(store.interactions.values());
                if (params.actorId) list = list.filter((item) => item.actorId === params.actorId);
                if (params.type) list = list.filter((item) => item.type === params.type);
                if (params.threadId) list = list.filter((item) => item.threadId === params.threadId);
                if (params.commentId) list = list.filter((item) => item.commentId === params.commentId);
                list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                return applyPagination(list, params);
            },
            async removeInteraction(payload = {}) {
                const type = payload.type;
                const actorId = payload.actorId || payload.actorIdentity?.authorId || 'unknown';
                const targetThreadId = payload.threadId || null;
                const targetCommentId = payload.commentId || null;
                const key = `${type}:${actorId}:${targetThreadId || ''}:${targetCommentId || ''}`;
                if (!store.interactions.has(key)) return;
                store.interactions.delete(key);

                if (targetCommentId) {
                    updateCommentMetrics(getCommentById(targetCommentId), type, -1);
                } else {
                    updateThreadMetrics(getThreadById(targetThreadId), type, -1);
                }
            },
            async saveCharReview(payload = {}) {
                const review = models.createCharReview(payload);
                store.charReviews.push(review);
            },
            async listCharReviews(params = {}) {
                let result = store.charReviews.slice();
                if (params.charId) result = result.filter((r) => r.charId === params.charId);
                if (params.threadId) result = result.filter((r) => r.threadId === params.threadId);
                return applyPagination(result, params);
            },
            async saveMemoryItems(items = []) {
                if (!Array.isArray(items)) return;
                items.forEach((item) => {
                    store.memories.push(models.createMemoryItem(item));
                });
            },
            async listMemoryItems(params = {}) {
                let result = store.memories.slice();
                if (params.charId) result = result.filter((m) => m.charId === params.charId);
                if (params.threadId) result = result.filter((m) => m.threadId === params.threadId);
                result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                return applyPagination(result, params);
            },
            async purgeExpiredMemory(params = {}) {
                const now = params.now ? new Date(params.now).getTime() : Date.now();
                store.memories = store.memories.filter((item) => {
                    if (!item.expiresAt) return true;
                    return new Date(item.expiresAt).getTime() > now;
                });
            },
            async resetCharForumMemory(params = {}) {
                const safeCharId = String(params.charId || params.characterId || '').trim();
                if (!safeCharId) {
                    return {
                        ok: false,
                        code: 'missing_char_id',
                        charId: ''
                    };
                }
                const memoryCountBefore = store.memories.length;
                store.memories = store.memories.filter((item) => {
                    const memoryCharId = String(item?.charId || item?.char_id || '').trim();
                    return memoryCharId !== safeCharId;
                });
                const deletedMemoryCount = Math.max(0, memoryCountBefore - store.memories.length);

                return {
                    ok: true,
                    charId: safeCharId,
                    deletedMemories: deletedMemoryCount,
                    preservedContent: true
                };
            },
            async createNotifications(items = []) {
                if (!Array.isArray(items) || !items.length) return [];
                const created = [];
                items.forEach((item) => {
                    const notification = models.createNotification(item);
                    if (!notification.receiverType || !notification.receiverId) return;
                    const key = [
                        notification.receiverType,
                        notification.receiverId,
                        notification.type || '',
                        notification.threadId || '',
                        notification.commentId || '',
                        notification.parentCommentId || '',
                        notification.actorIdentity?.authorType || notification.actorIdentity?.author_type || '',
                        notification.actorIdentity?.authorId || notification.actorIdentity?.author_id || ''
                    ].join(':');
                    const exists = store.notifications.some((row) => {
                        const rowKey = [
                            row.receiverType,
                            row.receiverId,
                            row.type || '',
                            row.threadId || '',
                            row.commentId || '',
                            row.parentCommentId || '',
                            row.actorIdentity?.authorType || row.actorIdentity?.author_type || '',
                            row.actorIdentity?.authorId || row.actorIdentity?.author_id || ''
                        ].join(':');
                        return rowKey === key;
                    });
                    if (exists) return;
                    store.notifications.push(notification);
                    created.push(notification);
                });
                return created;
            },
            async listNotifications(params = {}) {
                let list = store.notifications.slice();
                const afterRaw = String(
                    params.updatedAfter
                    || params.updated_after
                    || params.createdAfter
                    || params.created_after
                    || ''
                ).trim();
                const afterMs = afterRaw ? new Date(afterRaw).getTime() : NaN;
                if (Number.isFinite(afterMs) && afterMs > 0) {
                    list = list.filter((item) => {
                        const createdAtMs = new Date(item?.createdAt || item?.created_at || 0).getTime();
                        return Number.isFinite(createdAtMs) && createdAtMs > afterMs;
                    });
                }
                if (params.receiverType) {
                    const type = String(params.receiverType).trim();
                    list = list.filter((item) => String(item.receiverType || '').trim() === type);
                }
                if (params.receiverId) {
                    const id = String(params.receiverId).trim();
                    list = list.filter((item) => String(item.receiverId || '').trim() === id);
                }
                if (Array.isArray(params.receiverIds) && params.receiverIds.length > 0) {
                    const set = new Set(params.receiverIds.map((item) => String(item || '').trim()).filter(Boolean));
                    list = list.filter((item) => set.has(String(item.receiverId || '').trim()));
                }
                if (params.category) {
                    const category = String(params.category).trim();
                    list = list.filter((item) => String(item.category || '').trim() === category);
                }
                if (params.type) {
                    const type = String(params.type).trim();
                    list = list.filter((item) => String(item.type || '').trim() === type);
                }
                if (params.isRead === true || params.isRead === false) {
                    const expected = Boolean(params.isRead);
                    list = list.filter((item) => Boolean(item.isRead) === expected);
                }
                list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                if (params.countOnly) return list.length;
                return applyPagination(list, params);
            },
            async markNotificationsRead(params = {}) {
                const now = forumNowIso();
                const hasIds = Array.isArray(params.ids) && params.ids.length > 0;
                const idSet = hasIds
                    ? new Set(params.ids.map((item) => String(item || '').trim()).filter(Boolean))
                    : null;
                const receiverType = params.receiverType ? String(params.receiverType).trim() : '';
                const receiverId = params.receiverId ? String(params.receiverId).trim() : '';
                const category = params.category ? String(params.category).trim() : '';
                let updated = 0;
                store.notifications.forEach((item) => {
                    if (!item || item.isRead) return;
                    if (idSet && !idSet.has(String(item.id || '').trim())) return;
                    if (!idSet && receiverType && String(item.receiverType || '').trim() !== receiverType) return;
                    if (!idSet && receiverId && String(item.receiverId || '').trim() !== receiverId) return;
                    if (!idSet && category && String(item.category || '').trim() !== category) return;
                    item.isRead = true;
                    item.readAt = now;
                    updated += 1;
                });
                return updated;
            },
            async createAgentReport(payload = {}) {
                const userId = String(payload.userId || payload.user_id || '').trim();
                const charId = String(payload.charId || payload.char_id || '').trim();
                if (!userId || !charId) return null;
                const dedupeKey = String(payload.dedupeKey || payload.dedupe_key || '').trim();
                if (dedupeKey) {
                    const existing = store.agentReports.find((item) => String(item?.dedupeKey || '').trim() === dedupeKey);
                    if (existing) return Object.assign({}, existing);
                }
                const now = forumNowIso();
                const report = {
                    id: payload.id || forumGenId('agent_report'),
                    userId,
                    charId,
                    jobId: payload.jobId || payload.job_id || null,
                    jobType: String(payload.jobType || payload.job_type || 'unknown').trim() || 'unknown',
                    ok: Boolean(payload.ok),
                    retry: Boolean(payload.retry),
                    reportText: String(payload.reportText || payload.report_text || '').trim(),
                    payload: payload.payload && typeof payload.payload === 'object' ? payload.payload : {},
                    status: String(payload.status || 'pending').trim() || 'pending',
                    dedupeKey,
                    createdAt: payload.createdAt || payload.created_at || now,
                    deliveredAt: payload.deliveredAt || payload.delivered_at || null
                };
                store.agentReports.push(report);
                return Object.assign({}, report);
            },
            async upsertAgentApiProfile(payload = {}) {
                const userId = String(payload.userId || payload.user_id || '').trim();
                if (!userId) return null;
                const profile = payload.profile && typeof payload.profile === 'object'
                    ? payload.profile
                    : {};
                const row = {
                    userId,
                    profile,
                    updatedAt: payload.updatedAt || payload.updated_at || forumNowIso()
                };
                store.agentApiProfiles.set(userId, row);
                return Object.assign({}, row);
            },
            async getAgentApiProfile(userId) {
                const key = String(userId || '').trim();
                if (!key) return null;
                const item = store.agentApiProfiles.get(key);
                return item ? Object.assign({}, item) : null;
            },
            async listAgentReports(params = {}) {
                let list = store.agentReports.slice();
                const afterRaw = String(
                    params.updatedAfter
                    || params.updated_after
                    || params.createdAfter
                    || params.created_after
                    || ''
                ).trim();
                const afterMs = afterRaw ? new Date(afterRaw).getTime() : NaN;
                if (Number.isFinite(afterMs) && afterMs > 0) {
                    list = list.filter((item) => {
                        const createdAtMs = new Date(item?.createdAt || item?.created_at || 0).getTime();
                        return Number.isFinite(createdAtMs) && createdAtMs > afterMs;
                    });
                }
                if (params.userId) {
                    const userId = String(params.userId).trim();
                    list = list.filter((item) => String(item.userId || '').trim() === userId);
                }
                if (params.charId) {
                    const charId = String(params.charId).trim();
                    list = list.filter((item) => String(item.charId || '').trim() === charId);
                }
                if (params.status) {
                    const status = String(params.status).trim();
                    list = list.filter((item) => String(item.status || '').trim() === status);
                }
                if (Array.isArray(params.statusIn) && params.statusIn.length > 0) {
                    const set = new Set(params.statusIn.map((item) => String(item || '').trim()).filter(Boolean));
                    list = list.filter((item) => set.has(String(item.status || '').trim()));
                }
                list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
                if (params.countOnly) return list.length;
                return applyPagination(list, params);
            },
            async markAgentReportsDelivered(params = {}) {
                const now = forumNowIso();
                const ids = Array.isArray(params.ids)
                    ? params.ids.map((item) => String(item || '').trim()).filter(Boolean)
                    : [];
                const hasIds = ids.length > 0;
                const idSet = hasIds ? new Set(ids) : null;
                const userId = String(params.userId || '').trim();
                const charId = String(params.charId || '').trim();
                const fromStatus = String(params.fromStatus || 'pending').trim();
                let updated = 0;
                store.agentReports.forEach((item) => {
                    if (!item) return;
                    if (hasIds && !idSet.has(String(item.id || '').trim())) return;
                    if (!hasIds && userId && String(item.userId || '').trim() !== userId) return;
                    if (!hasIds && charId && String(item.charId || '').trim() !== charId) return;
                    if (fromStatus && String(item.status || '').trim() !== fromStatus) return;
                    item.status = 'delivered';
                    item.deliveredAt = now;
                    updated += 1;
                });
                return updated;
            },
            async enqueueAgentJob(payload = {}) {
                const now = forumNowIso();
                const status = payload.status && String(payload.status).trim()
                    ? String(payload.status).trim()
                    : 'pending';
                const runAt = payload.runAt || payload.run_at || now;
                const dedupeKey = payload.dedupeKey || payload.dedupe_key || '';
                if (dedupeKey && payload.allowDuplicate !== true) {
                    const exists = store.agentJobs.find((item) => {
                        if (!item) return false;
                        if (String(item.dedupeKey || '') !== String(dedupeKey)) return false;
                        return true;
                    });
                    if (exists) return Object.assign({}, exists);
                }
                const job = {
                    id: payload.id || forumGenId('agent_job'),
                    charId: payload.charId || payload.char_id || null,
                    jobType: String(payload.jobType || payload.job_type || '').trim() || 'browse',
                    status,
                    priority: Number(payload.priority) || 0,
                    dedupeKey: dedupeKey ? String(dedupeKey) : '',
                    payload: payload.payload && typeof payload.payload === 'object' ? payload.payload : {},
                    runAt,
                    lockedBy: payload.lockedBy || payload.locked_by || null,
                    lockedAt: payload.lockedAt || payload.locked_at || null,
                    attempts: Math.max(0, Number(payload.attempts) || 0),
                    maxAttempts: Math.max(1, Number(payload.maxAttempts || payload.max_attempts) || 2),
                    lastError: payload.lastError || payload.last_error || null,
                    result: payload.result && typeof payload.result === 'object' ? payload.result : {},
                    createdAt: payload.createdAt || payload.created_at || now,
                    updatedAt: payload.updatedAt || payload.updated_at || now,
                    finishedAt: payload.finishedAt || payload.finished_at || null
                };
                store.agentJobs.push(job);
                return Object.assign({}, job);
            },
            async listAgentJobs(params = {}) {
                let list = store.agentJobs.slice();
                if (params.charId) {
                    const charId = String(params.charId).trim();
                    list = list.filter((item) => String(item.charId || '').trim() === charId);
                }
                if (params.jobType) {
                    const type = String(params.jobType).trim();
                    list = list.filter((item) => String(item.jobType || '').trim() === type);
                }
                if (params.status) {
                    const status = String(params.status).trim();
                    list = list.filter((item) => String(item.status || '').trim() === status);
                }
                if (Array.isArray(params.statusIn) && params.statusIn.length > 0) {
                    const set = new Set(params.statusIn.map((item) => String(item || '').trim()).filter(Boolean));
                    list = list.filter((item) => set.has(String(item.status || '').trim()));
                }
                if (params.dedupeKey) {
                    const dedupeKey = String(params.dedupeKey).trim();
                    list = list.filter((item) => String(item.dedupeKey || '').trim() === dedupeKey);
                }
                list.sort((a, b) => {
                    const prio = Number(b.priority || 0) - Number(a.priority || 0);
                    if (prio !== 0) return prio;
                    const aTime = a.runAt || a.createdAt;
                    const bTime = b.runAt || b.createdAt;
                    return new Date(aTime) - new Date(bTime);
                });
                if (params.countOnly) return list.length;
                return applyPagination(list, params);
            },
            async cancelAgentJobs(params = {}) {
                const now = params.now || forumNowIso();
                const reason = String(params.reason || 'disabled_by_user').trim() || 'disabled_by_user';
                const statusIn = Array.isArray(params.statusIn) && params.statusIn.length > 0
                    ? params.statusIn.map((item) => String(item || '').trim()).filter(Boolean)
                    : ['pending', 'retry'];
                const statusSet = new Set(statusIn);
                if (!statusSet.size) return 0;

                const userId = String(params.userId || '').trim();
                const charIds = Array.isArray(params.charIds)
                    ? params.charIds
                    : (params.charId ? [params.charId] : []);
                const charIdSet = new Set(charIds.map((item) => String(item || '').trim()).filter(Boolean));

                let updated = 0;
                store.agentJobs.forEach((item) => {
                    if (!item) return;
                    const status = String(item.status || '').trim();
                    if (!statusSet.has(status)) return;
                    const jobCharId = String(item.charId || '').trim();
                    if (charIdSet.size > 0 && !charIdSet.has(jobCharId)) return;
                    if (charIdSet.size === 0 && userId) {
                        const char = store.chars.get(jobCharId);
                        const ownerUserId = String(char?.ownerUserId || char?.owner_user_id || '').trim();
                        if (ownerUserId && ownerUserId !== userId) return;
                    }
                    item.status = 'canceled';
                    item.lockedBy = null;
                    item.lockedAt = null;
                    item.lastError = reason;
                    item.finishedAt = now;
                    item.updatedAt = now;
                    updated += 1;
                });
                return updated;
            },
            async claimAgentJobs(params = {}) {
                const now = params.now || forumNowIso();
                const workerId = String(params.workerId || 'worker').trim();
                const limit = Math.max(1, Number(params.limit) || 1);
                const claimable = store.agentJobs
                    .filter((item) => {
                        if (!item) return false;
                        const status = String(item.status || '').trim();
                        if (!['pending', 'retry'].includes(status)) return false;
                        const runAt = item.runAt || item.updatedAt || item.createdAt || now;
                        return new Date(runAt).getTime() <= new Date(now).getTime();
                    })
                    .sort((a, b) => {
                        const prio = Number(b.priority || 0) - Number(a.priority || 0);
                        if (prio !== 0) return prio;
                        const aTime = a.runAt || a.createdAt;
                        const bTime = b.runAt || b.createdAt;
                        return new Date(aTime) - new Date(bTime);
                    })
                    .slice(0, limit);

                claimable.forEach((item) => {
                    item.status = 'running';
                    item.lockedBy = workerId;
                    item.lockedAt = now;
                    item.attempts = Math.max(0, Number(item.attempts) || 0) + 1;
                    item.updatedAt = now;
                });
                return claimable.map((item) => Object.assign({}, item));
            },
            async updateAgentJob(jobId, patch = {}) {
                const key = String(jobId || '').trim();
                if (!key) return null;
                const index = store.agentJobs.findIndex((item) => String(item?.id || '') === key);
                if (index < 0) return null;
                const now = forumNowIso();
                const prev = store.agentJobs[index];
                const next = Object.assign({}, prev, patch, {
                    updatedAt: patch.updatedAt || patch.updated_at || now
                });
                if (Object.prototype.hasOwnProperty.call(patch, 'status')) {
                    next.status = String(patch.status || prev.status || '').trim() || prev.status;
                }
                if (Object.prototype.hasOwnProperty.call(patch, 'runAt')) {
                    next.runAt = patch.runAt;
                }
                if (Object.prototype.hasOwnProperty.call(patch, 'run_at')) {
                    next.runAt = patch.run_at;
                }
                if (Object.prototype.hasOwnProperty.call(patch, 'finishedAt')) {
                    next.finishedAt = patch.finishedAt;
                }
                if (Object.prototype.hasOwnProperty.call(patch, 'finished_at')) {
                    next.finishedAt = patch.finished_at;
                }
                store.agentJobs[index] = next;
                return Object.assign({}, next);
            },
            async saveAgentActionLog(payload = {}) {
                const dedupeKey = String(payload.dedupeKey || payload.dedupe_key || '').trim();
                if (!dedupeKey) return false;
                const exists = store.agentActionLogs.some((item) => String(item?.dedupeKey || '') === dedupeKey);
                if (exists) return false;
                const now = forumNowIso();
                store.agentActionLogs.push({
                    id: payload.id || forumGenId('agent_log'),
                    charId: payload.charId || payload.char_id || null,
                    threadId: payload.threadId || payload.thread_id || null,
                    commentId: payload.commentId || payload.comment_id || null,
                    actionType: String(payload.actionType || payload.action_type || '').trim() || 'unknown',
                    dedupeKey,
                    detail: payload.detail && typeof payload.detail === 'object' ? payload.detail : {},
                    createdAt: payload.createdAt || payload.created_at || now
                });
                return true;
            }
        };
    },

    // === AI 刷帖流程（里程碑 4） ===
    ai: {
        mainQueue: [],
        isProcessing: false,
        apiCaller: null,
        agentWorkerTimer: null,
        agentWorkerTicking: false,
        agentWorkerStarted: false,
        agentCommandBridgeReady: false,
        agentLeaderUnloadBound: false,
        agentWorkerId: `agent_worker_${Math.random().toString(36).slice(2, 8)}`,
        agentRuntimeInstanceId: `agent_runtime_${Math.random().toString(36).slice(2, 10)}`,
        agentScheduleState: {
            intervalRuntimeMs: new Map(),
            intervalCycles: new Map(),
            dailySlots: new Map(),
            lastTickAtMs: 0,
            rateLimitCounters: new Map()
        },
        defaults: {
            browseLimit: 30,
            selectLimit: 5,
            commentLimit: 240,
            memoryHours: 3,
            postCheckIntervalMinMs: 3 * 60 * 1000,
            postCheckIntervalMaxMs: 60 * 60 * 1000,
            maxReplyRounds: 5,
            textRetryAttempts: 2,
            textRetryDelayMs: 600,
            agentWorkerIntervalMs: 120 * 1000,
            agentLeaderLeaseMs: 240 * 1000,
            agentMaxJobsPerTick: 2,
            agentRetryDelayMs: 2 * 60 * 1000,
            agentLocalMaxTickDeltaMs: 180 * 1000,
            agentReplyMaxThreadsPerBrowse: 5,
            agentAutoRateLimits: {
                browse: { perHour: 3, perDay: 24 },
                post: { perHour: 1, perDay: 6 },
                reply: { perHour: 15, perDay: 90 }
            }
        },

        setApiCaller(fn) {
            if (typeof fn === 'function') this.apiCaller = fn;
        },

        initAgentWorker(options = {}) {
            if (options && options.intervalMs) {
                const nextInterval = Math.max(5000, Number(options.intervalMs) || this.defaults.agentWorkerIntervalMs);
                this.defaults.agentWorkerIntervalMs = nextInterval;
            }
            if (options && options.leaderLeaseMs) {
                const nextLease = Math.max(15 * 1000, Number(options.leaderLeaseMs) || this.defaults.agentLeaderLeaseMs);
                this.defaults.agentLeaderLeaseMs = nextLease;
            }
            this.ensureAgentCommandBridge();
            if (this.agentWorkerStarted) return;
            this.agentWorkerStarted = true;
            if (
                !this.agentLeaderUnloadBound
                && typeof window !== 'undefined'
                && window
                && typeof window.addEventListener === 'function'
            ) {
                this.agentLeaderUnloadBound = true;
                window.addEventListener('beforeunload', () => {
                    try {
                        this.releaseWorkerLeaderLock();
                    } catch (_) { }
                });
            }
            const runTick = async () => {
                try {
                    await this.runAgentWorkerTick();
                } catch (error) {
                    console.warn('ForumLink agent worker tick failed', error);
                }
            };
            this.agentWorkerTimer = setInterval(runTick, this.defaults.agentWorkerIntervalMs);
            runTick();
        },

        stopAgentWorker() {
            if (this.agentWorkerTimer) {
                clearInterval(this.agentWorkerTimer);
                this.agentWorkerTimer = null;
            }
            this.releaseWorkerLeaderLock();
            this.agentWorkerStarted = false;
            this.agentScheduleState.lastTickAtMs = 0;
        },

        getWorkerLeaderScopeUserId(preferredUserId = null) {
            const userId = this.resolveViewerUserId(preferredUserId);
            const safeUserId = String(userId || '').trim();
            return safeUserId || 'anon';
        },

        getWorkerLeaderLockKey(preferredUserId = null) {
            const scope = this.getWorkerLeaderScopeUserId(preferredUserId);
            return `forum_agent_worker_lock:${scope}`;
        },

        tryAcquireWorkerLeaderLock({ nowMs = Date.now(), preferredUserId = null } = {}) {
            if (typeof window === 'undefined' || !window || !window.localStorage) return true;
            const key = this.getWorkerLeaderLockKey(preferredUserId);
            const holder = String(this.agentRuntimeInstanceId || '').trim()
                || `agent_runtime_${Math.random().toString(36).slice(2, 10)}`;
            if (!this.agentRuntimeInstanceId) this.agentRuntimeInstanceId = holder;
            const leaseMs = Math.max(15 * 1000, Number(this.defaults.agentLeaderLeaseMs) || (90 * 1000));
            const now = Number(nowMs) || Date.now();

            let current = null;
            try {
                const raw = String(window.localStorage.getItem(key) || '').trim();
                current = raw ? JSON.parse(raw) : null;
            } catch (_) {
                current = null;
            }

            const currentHolder = String(current?.holder || '').trim();
            const expiresAtMs = Number(current?.expiresAtMs || 0);
            if (currentHolder && currentHolder !== holder && Number.isFinite(expiresAtMs) && expiresAtMs > now) {
                return false;
            }

            const next = {
                holder,
                expiresAtMs: now + leaseMs,
                updatedAtMs: now
            };
            try {
                window.localStorage.setItem(key, JSON.stringify(next));
                const verifyRaw = String(window.localStorage.getItem(key) || '').trim();
                const verify = verifyRaw ? JSON.parse(verifyRaw) : null;
                return String(verify?.holder || '').trim() === holder;
            } catch (_) {
                return true;
            }
        },

        releaseWorkerLeaderLock(preferredUserId = null) {
            if (typeof window === 'undefined' || !window || !window.localStorage) return;
            const key = this.getWorkerLeaderLockKey(preferredUserId);
            const holder = String(this.agentRuntimeInstanceId || '').trim();
            if (!holder) return;
            try {
                const raw = String(window.localStorage.getItem(key) || '').trim();
                if (!raw) return;
                const current = JSON.parse(raw);
                const currentHolder = String(current?.holder || '').trim();
                if (currentHolder !== holder) return;
                window.localStorage.removeItem(key);
            } catch (_) { }
        },

        ensureAgentCommandBridge() {
            if (this.agentCommandBridgeReady) return;
            this.agentCommandBridgeReady = true;
            ForumLink.onCommand((command) => {
                this.enqueueJobFromCommand(command).catch((error) => {
                    console.warn('ForumLink command enqueue failed', error);
                });
            });
        },

        async enqueueJobFromCommand(command = {}) {
            if (!command || typeof command !== 'object') return null;
            const typeMap = {
                browse: 'browse',
                post: 'post',
                check_reply: 'reply',
                reply: 'reply'
            };
            const sourceType = String(command.type || '').trim();
            const jobType = typeMap[sourceType] || '';
            if (!jobType) return null;

            const payload = command.payload && typeof command.payload === 'object'
                ? Object.assign({}, command.payload)
                : {};
            const charId = String(
                command.targetCharId
                || payload.charId
                || payload.char_id
                || ''
            ).trim();
            if (!charId) return null;
            const userId = command.targetUserId
                || payload.userId
                || payload.user_id
                || this.resolveViewerUserId();
            payload.userId = userId;
            payload.source = payload.source || command.source || 'command';

            return this.enqueueAgentJob({
                charId,
                jobType,
                payload,
                priority: Number(command.priority) || 5,
                maxAttempts: 2
            });
        },

        async enqueueAgentJob(payload = {}) {
            const storage = ForumLink.adapters.storage;
            if (!storage || typeof storage.enqueueAgentJob !== 'function') {
                throw new Error('ForumLink AI: storage.enqueueAgentJob 不可用');
            }
            return storage.enqueueAgentJob(payload);
        },

        async runAgentWorkerTick() {
            if (!this.tryAcquireWorkerLeaderLock()) return;
            if (this.agentWorkerTicking) return;
            this.agentWorkerTicking = true;
            try {
                await this.scheduleAutoJobs();
                await this.processAgentQueue();
            } finally {
                this.agentWorkerTicking = false;
            }
        },

        async processAgentQueue() {
            const storage = ForumLink.adapters.storage;
            if (!storage || typeof storage.claimAgentJobs !== 'function') return;
            const jobs = await storage.claimAgentJobs({
                workerId: this.agentWorkerId,
                limit: this.defaults.agentMaxJobsPerTick,
                now: forumNowIso()
            });
            if (!Array.isArray(jobs) || jobs.length === 0) return;
            for (const job of jobs) {
                await this.processSingleAgentJob(job);
            }
        },

        async processSingleAgentJob(job = {}) {
            const storage = ForumLink.adapters.storage;
            if (!storage || typeof storage.updateAgentJob !== 'function') return;
            const jobId = String(job.id || '').trim();
            if (!jobId) return;
            const now = forumNowIso();
            const payload = job.payload && typeof job.payload === 'object' ? job.payload : {};
            const source = String(payload.source || '').trim().toLowerCase();
            const jobType = String(job.jobType || job.job_type || '').trim().toLowerCase();
            const dedupeKey = String(job.dedupeKey || job.dedupe_key || '').trim().toLowerCase();
            const isAutoJob = source.includes('auto')
                || source === 'backend_schedule'
                || source === 'browse_follow_up'
                || dedupeKey.startsWith('auto');
            const parseBool = (value, fallback = false) => {
                if (value === undefined || value === null) return Boolean(fallback);
                if (typeof value === 'boolean') return value;
                if (typeof value === 'number') return value !== 0;
                const raw = String(value).trim().toLowerCase();
                if (!raw) return Boolean(fallback);
                if (['1', 'true', 'yes', 'on', 'y'].includes(raw)) return true;
                if (['0', 'false', 'no', 'off', 'n'].includes(raw)) return false;
                return Boolean(fallback);
            };
            const charId = String(job.charId || job.char_id || payload.charId || payload.char_id || '').trim();
            let ownerUserId = '';
            let charMeta = null;
            if (charId && storage && typeof storage.getChar === 'function') {
                try {
                    charMeta = await storage.getChar(charId);
                } catch (_) { }
            }
            if (charMeta) {
                ownerUserId = String(charMeta.ownerUserId || charMeta.owner_user_id || '').trim();
            }
            let userGlobalEnabled = false;
            if (ownerUserId && storage && typeof storage.getUser === 'function') {
                try {
                    const ownerUser = await storage.getUser(ownerUserId);
                    userGlobalEnabled = parseBool(ownerUser?.settings?.forumAgentGlobalEnabled, false);
                } catch (_) {
                    userGlobalEnabled = false;
                }
            }
            let charAgentEnabled = false;
            let charSettings = null;
            if (charId) {
                try {
                    charSettings = await this.resolveCharForumSettings(charId, charMeta);
                    charAgentEnabled = Boolean(charSettings && parseBool(charSettings.agentEnabled, false));
                } catch (_) {
                    charAgentEnabled = false;
                    charSettings = null;
                }
            }
            let cancelReason = '';
            if (!ownerUserId) {
                cancelReason = 'owner_user_missing';
            } else if (!userGlobalEnabled) {
                cancelReason = 'agent_global_disabled';
            } else if (!charAgentEnabled) {
                cancelReason = 'char_agent_disabled';
            } else if (isAutoJob && jobType === 'browse') {
                const autoBrowseEnabled = parseBool(charSettings?.autoBrowseEnabled, false);
                if (!autoBrowseEnabled) cancelReason = 'auto_browse_disabled';
            } else if (isAutoJob && jobType === 'post') {
                const autoPostEnabled = parseBool(charSettings?.autoPostEnabled, false);
                if (!autoPostEnabled) cancelReason = 'auto_post_disabled';
            } else if (isAutoJob && jobType === 'reply') {
                const autoBrowseEnabled = parseBool(charSettings?.autoBrowseEnabled, false);
                const replyOnBrowseEnabled = parseBool(charSettings?.replyOnBrowse, true);
                if (!autoBrowseEnabled) cancelReason = 'auto_browse_disabled';
                else if (!replyOnBrowseEnabled) cancelReason = 'reply_on_browse_disabled';
            }
            if (cancelReason) {
                await storage.updateAgentJob(jobId, {
                    status: 'canceled',
                    finishedAt: forumNowIso(),
                    lockedBy: null,
                    lockedAt: null,
                    lastError: cancelReason
                });
                return;
            }
            try {
                const result = await this.executeAgentJob(job);
                await storage.updateAgentJob(jobId, {
                    status: 'done',
                    finishedAt: forumNowIso(),
                    lockedBy: null,
                    lockedAt: null,
                    lastError: null,
                    result: result && typeof result === 'object' ? result : {}
                });
                await this.notifyAgentReport({
                    ok: true,
                    job,
                    result
                });
            } catch (error) {
                const message = String(error && error.message ? error.message : error || 'unknown error');
                const attempts = Math.max(1, Number(job.attempts) || 1);
                const maxAttempts = Math.max(1, Number(job.maxAttempts || job.max_attempts) || 2);
                const shouldRetry = attempts < maxAttempts;
                const retryDelayMs = Math.max(1000, Number(this.defaults.agentRetryDelayMs) || (2 * 60 * 1000));
                await storage.updateAgentJob(jobId, {
                    status: shouldRetry ? 'retry' : 'failed',
                    runAt: shouldRetry ? new Date(Date.now() + retryDelayMs * attempts).toISOString() : (job.runAt || now),
                    finishedAt: shouldRetry ? null : forumNowIso(),
                    lockedBy: null,
                    lockedAt: null,
                    lastError: message
                });
                await this.notifyAgentReport({
                    ok: false,
                    retry: shouldRetry,
                    job,
                    error: message
                });
            }
        },

        async executeAgentJob(job = {}) {
            const type = String(job.jobType || job.job_type || '').trim();
            const payload = job.payload && typeof job.payload === 'object' ? job.payload : {};
            const charId = String(job.charId || job.char_id || payload.charId || payload.char_id || '').trim();
            if (!charId) throw new Error('agent job 缺少 charId');
            const userId = payload.userId || payload.user_id || this.resolveViewerUserId();

            if (type === 'browse') {
                const browseResult = await this.browseForum({
                    charId,
                    userId,
                    browseLimit: payload.browseLimit || payload.browse_limit,
                    selectLimit: payload.selectLimit || payload.select_limit
                });
                const reviews = Array.isArray(browseResult?.reviews) ? browseResult.reviews : [];
                for (const review of reviews) {
                    const threadId = String(review?.threadId || '').trim();
                    if (!threadId) continue;
                    await this.saveAgentActionLogSafe({
                        charId,
                        threadId,
                        actionType: 'browse_review',
                        dedupeKey: `job:${job.id}:review:${threadId}`,
                        detail: {
                            reviewText: review.reviewText || '',
                            actions: Array.isArray(review.actions) ? review.actions : []
                        }
                    });
                }
                if (payload.replyOnBrowse) {
                    const replyQuota = this.getAgentRateLimitRemaining({
                        charId,
                        jobType: 'reply',
                        nowMs: Date.now(),
                        timeZoneOffsetMinutes: this.parseTimeZoneOffsetMinutes(payload.timeZoneOffsetMinutes)
                    });
                    if (replyQuota.allowed) {
                        await this.enqueueAgentJob({
                            charId,
                            jobType: 'reply',
                            priority: Number(job.priority) || 0,
                            payload: {
                                userId,
                                source: 'auto_reply_on_browse',
                                timeZoneOffsetMinutes: this.parseTimeZoneOffsetMinutes(payload.timeZoneOffsetMinutes),
                                minThreads: 1,
                                maxThreads: Math.max(
                                    1,
                                    Number(payload.replyMaxThreads || payload.reply_max_threads)
                                    || Number(this.defaults.agentReplyMaxThreadsPerBrowse)
                                    || 5
                                )
                            },
                            dedupeKey: `auto_reply:${job.id || charId}:${new Date().toISOString().slice(0, 16)}`,
                            maxAttempts: 2
                        });
                    }
                }
                return {
                    type,
                    charId,
                    selectedThreads: Array.isArray(browseResult?.threads) ? browseResult.threads.length : 0,
                    reviewCount: reviews.length
                };
            }

            if (type === 'post') {
                const thread = await this.createPost({
                    charId,
                    userId,
                    anonymous: Boolean(payload.anonymous)
                });
                await this.saveAgentActionLogSafe({
                    charId,
                    threadId: thread?.id || null,
                    actionType: 'auto_post',
                    dedupeKey: `job:${job.id}:post:${thread?.id || 'unknown'}`,
                    detail: {
                        title: thread?.title || ''
                    }
                });
                return {
                    type,
                    charId,
                    threadId: thread?.id || null,
                    title: thread?.title || ''
                };
            }

            if (type === 'reply') {
                const result = await this.runReplyJob({
                    charId,
                    userId,
                    payload
                });
                return Object.assign({ type, charId }, result || {});
            }

            throw new Error(`unknown agent job type: ${type}`);
        },

        async runReplyJob({ charId, userId, payload = {} } = {}) {
            const source = String(payload.source || '').trim().toLowerCase();
            const isAutoReplyJob = source.includes('auto')
                || source === 'backend_schedule'
                || source === 'browse_follow_up';
            const timeZoneOffsetMinutes = this.parseTimeZoneOffsetMinutes(
                payload.timeZoneOffsetMinutes
                ?? payload.timezoneOffsetMinutes
                ?? payload.time_zone_offset_minutes
                ?? payload.tzOffsetMinutes
            );
            const explicitThreadIds = Array.isArray(payload.threadIds)
                ? payload.threadIds.map((item) => String(item || '').trim()).filter(Boolean)
                : [];
            let maxThreads = Math.max(1, Number(payload.maxThreads || payload.max_threads) || 3);
            const minThreads = Math.max(1, Number(payload.minThreads || payload.min_threads) || 1);
            if (source.includes('reply_on_browse')) {
                maxThreads = Math.min(
                    maxThreads,
                    Math.max(1, Number(this.defaults.agentReplyMaxThreadsPerBrowse) || 5)
                );
            }
            if (isAutoReplyJob) {
                const quota = this.getAgentRateLimitRemaining({
                    charId,
                    jobType: 'reply',
                    nowMs: Date.now(),
                    timeZoneOffsetMinutes
                });
                if (!quota.allowed || quota.remaining <= 0) {
                    return {
                        threadIds: [],
                        handledCount: 0,
                        rateLimited: true
                    };
                }
                if (Number.isFinite(quota.remaining)) {
                    maxThreads = Math.min(maxThreads, Math.max(1, Math.floor(quota.remaining)));
                }
            }
            const threadIds = explicitThreadIds.length > 0
                ? explicitThreadIds.slice(0, maxThreads)
                : await this.pickReplyThreadsForChar({ charId, maxThreads, minThreads });
            let handledCount = 0;
            for (const threadId of threadIds) {
                if (isAutoReplyJob) {
                    const quotaBefore = this.getAgentRateLimitRemaining({
                        charId,
                        jobType: 'reply',
                        nowMs: Date.now(),
                        timeZoneOffsetMinutes
                    });
                    if (!quotaBefore.allowed || quotaBefore.remaining <= 0) {
                        break;
                    }
                }
                try {
                    await this.checkReplies({
                        charId,
                        threadId,
                        userId
                    });
                    if (isAutoReplyJob) {
                        this.consumeAgentRateLimit({
                            charId,
                            jobType: 'reply',
                            nowMs: Date.now(),
                            timeZoneOffsetMinutes
                        });
                    }
                    handledCount += 1;
                    await this.saveAgentActionLogSafe({
                        charId,
                        threadId,
                        actionType: 'auto_reply_scan',
                        dedupeKey: `job_reply:${charId}:${threadId}:${new Date().toISOString().slice(0, 13)}`,
                        detail: {
                            source: payload.source || 'auto'
                        }
                    });
                } catch (error) {
                    console.warn('ForumLink reply job thread failed', threadId, error);
                }
            }
            return {
                threadIds,
                handledCount
            };
        },

        async pickReplyThreadsForChar({ charId, maxThreads = 3, minThreads = 1 } = {}) {
            const storage = ForumLink.adapters.storage;
            if (!storage) return [];
            let candidateThreadIds = [];

            if (typeof storage.listNotifications === 'function') {
                const notifications = await storage.listNotifications({
                    receiverType: 'char',
                    receiverId: charId,
                    category: 'engagement',
                    limit: 200
                });
                candidateThreadIds = (Array.isArray(notifications) ? notifications : [])
                    .filter((item) => {
                        const type = String(item?.type || '').trim();
                        const threadId = String(item?.threadId || item?.thread_id || '').trim();
                        return Boolean(threadId) && (type === 'reply_comment' || type === 'comment_thread');
                    })
                    .sort((a, b) => new Date(b?.createdAt || b?.created_at || 0) - new Date(a?.createdAt || a?.created_at || 0))
                    .map((item) => String(item?.threadId || item?.thread_id || '').trim())
                    .filter(Boolean);
            }

            if (candidateThreadIds.length === 0 && typeof storage.listThreads === 'function') {
                const recentThreads = await storage.listThreads({ sortBy: 'recent_comment', limit: 80 });
                candidateThreadIds = (Array.isArray(recentThreads) ? recentThreads : [])
                    .filter((thread) => {
                        const identity = thread?.authorIdentity || {};
                        const type = String(identity.authorType || identity.author_type || '').trim();
                        const id = String(identity.authorId || identity.author_id || '').trim();
                        return type === 'char' && id === String(charId);
                    })
                    .map((thread) => String(thread?.id || '').trim())
                    .filter(Boolean);
            }

            candidateThreadIds = Array.from(new Set(candidateThreadIds));
            if (!candidateThreadIds.length) return [];
            const safeMax = Math.max(minThreads, Math.min(maxThreads, candidateThreadIds.length));
            return candidateThreadIds.slice(0, safeMax);
        },

        buildReplyCandidateContext({ comments = [], charId } = {}) {
            const safeCharId = String(charId || '').trim();
            const normalizedComments = (Array.isArray(comments) ? comments.slice() : [])
                .map((item) => {
                    const commentId = String(item?.id || '').trim();
                    const parentId = String(item?.parentId || item?.parent_id || '').trim();
                    const authorType = String(item?.authorIdentity?.authorType || item?.authorIdentity?.author_type || '').trim();
                    const authorId = String(item?.authorIdentity?.authorId || item?.authorIdentity?.author_id || '').trim();
                    const ts = Date.parse(item?.createdAt || item?.created_at || 0);
                    return {
                        commentId,
                        parentId,
                        authorType,
                        authorId,
                        createdAtMs: Number.isFinite(ts) ? ts : 0,
                        isOwnComment: authorType === 'char' && authorId === safeCharId
                    };
                })
                .filter((item) => item.commentId);
            const hasOwnTopLevelComment = normalizedComments.some((item) => item.isOwnComment && !item.parentId);
            const commentById = new Map();
            normalizedComments.forEach((item) => {
                commentById.set(item.commentId, item);
            });
            const isDescendantOf = (commentId, ancestorId) => {
                const safeCommentId = String(commentId || '').trim();
                const safeAncestorId = String(ancestorId || '').trim();
                if (!safeCommentId || !safeAncestorId || safeCommentId === safeAncestorId) return false;
                const visited = new Set();
                let cursor = safeCommentId;
                while (cursor && !visited.has(cursor)) {
                    visited.add(cursor);
                    const current = commentById.get(cursor);
                    const parentId = String(current?.parentId || '').trim();
                    if (!parentId) return false;
                    if (parentId === safeAncestorId) return true;
                    cursor = parentId;
                }
                return false;
            };
            const canReplyToTarget = (targetCommentId) => {
                const safeTargetCommentId = String(targetCommentId || '').trim();
                if (!safeTargetCommentId) return false;
                const descendants = normalizedComments.filter((item) => isDescendantOf(item.commentId, safeTargetCommentId));
                if (!descendants.length) return true;
                const ownDescendants = descendants.filter((item) => item.isOwnComment);
                if (!ownDescendants.length) return true;
                let latestOwnReply = null;
                ownDescendants.forEach((item) => {
                    if (!latestOwnReply || (Number(item.createdAtMs) || 0) > (Number(latestOwnReply.createdAtMs) || 0)) {
                        latestOwnReply = item;
                    }
                });
                const latestOwnReplyTs = Number(latestOwnReply?.createdAtMs) || 0;
                const latestOwnReplyId = String(latestOwnReply?.commentId || '').trim();
                if (!latestOwnReplyId) return false;
                return descendants.some((item) =>
                    !item.isOwnComment
                    && (Number(item.createdAtMs) || 0) > latestOwnReplyTs
                    && isDescendantOf(item.commentId, latestOwnReplyId)
                );
            };
            const replyCandidates = normalizedComments
                .filter((item) => !item.isOwnComment)
                .filter((item) => canReplyToTarget(item.commentId))
                .sort((a, b) => (Number(b.createdAtMs) || 0) - (Number(a.createdAtMs) || 0));
            return {
                normalizedComments,
                hasOwnTopLevelComment,
                replyCandidates
            };
        },

        async scheduleAutoJobs() {
            const chars = await this.getAllCharactersForAgent();
            if (!Array.isArray(chars) || chars.length === 0) return;
            const storage = ForumLink.adapters.storage;
            const parseBool = (value, fallback = false) => {
                if (value === undefined || value === null) return Boolean(fallback);
                if (typeof value === 'boolean') return value;
                if (typeof value === 'number') return value !== 0;
                const raw = String(value).trim().toLowerCase();
                if (!raw) return Boolean(fallback);
                if (['1', 'true', 'yes', 'on', 'y'].includes(raw)) return true;
                if (['0', 'false', 'no', 'off', 'n'].includes(raw)) return false;
                return Boolean(fallback);
            };
            const globalEnabledCache = new Map();
            const nowMs = Date.now();
            if (!(this.agentScheduleState.intervalRuntimeMs instanceof Map)) {
                this.agentScheduleState.intervalRuntimeMs = new Map();
            }
            if (!(this.agentScheduleState.intervalCycles instanceof Map)) {
                this.agentScheduleState.intervalCycles = new Map();
            }
            if (!(this.agentScheduleState.dailySlots instanceof Map)) {
                this.agentScheduleState.dailySlots = new Map();
            }
            if (!(this.agentScheduleState.rateLimitCounters instanceof Map)) {
                this.agentScheduleState.rateLimitCounters = new Map();
            }
            const lastTickAtMs = Number(this.agentScheduleState.lastTickAtMs) || nowMs;
            let tickDeltaMs = Math.max(0, nowMs - lastTickAtMs);
            const maxTickDeltaMs = Math.max(5000, Number(this.defaults.agentLocalMaxTickDeltaMs) || (90 * 1000));
            if (!Number.isFinite(tickDeltaMs) || tickDeltaMs > maxTickDeltaMs) {
                tickDeltaMs = 0;
            }
            this.agentScheduleState.lastTickAtMs = nowMs;

            if (this.agentScheduleState.dailySlots.size > 5000) {
                const staleMs = 3 * 24 * 60 * 60 * 1000;
                for (const [key, ts] of this.agentScheduleState.dailySlots.entries()) {
                    const at = Number(ts);
                    if (!Number.isFinite(at) || nowMs - at > staleMs) {
                        this.agentScheduleState.dailySlots.delete(key);
                    }
                }
            }
            if (this.agentScheduleState.rateLimitCounters.size > 5000) {
                const staleMs = 3 * 24 * 60 * 60 * 1000;
                for (const [key, item] of this.agentScheduleState.rateLimitCounters.entries()) {
                    const at = Number(item?.updatedAtMs || 0);
                    if (!Number.isFinite(at) || nowMs - at > staleMs) {
                        this.agentScheduleState.rateLimitCounters.delete(key);
                    }
                }
            }

            const dailyWindowMinutes = 3;
            for (const char of chars) {
                const charId = String(char?.id || char?.charId || '').trim();
                if (!charId) continue;
                const userId = char?.ownerUserId || char?.owner_user_id || this.resolveViewerUserId();
                const userKey = String(userId || '').trim();
                let globalEnabled = true;
                let timeZoneOffsetMinutes = null;
                if (userKey) {
                    if (globalEnabledCache.has(userKey)) {
                        const cached = globalEnabledCache.get(userKey) || {};
                        globalEnabled = parseBool(cached.globalEnabled, false);
                        timeZoneOffsetMinutes = this.parseTimeZoneOffsetMinutes(cached.timeZoneOffsetMinutes);
                    } else if (storage && typeof storage.getUser === 'function') {
                        try {
                            const ownerUser = await storage.getUser(userKey);
                            globalEnabled = parseBool(ownerUser?.settings?.forumAgentGlobalEnabled, false);
                            timeZoneOffsetMinutes = this.parseTimeZoneOffsetMinutes(
                                ownerUser?.settings?.forumTimeZoneOffsetMinutes
                                ?? ownerUser?.settings?.timeZoneOffsetMinutes
                                ?? ownerUser?.settings?.timezoneOffsetMinutes
                                ?? ownerUser?.settings?.tzOffsetMinutes
                            );
                            globalEnabledCache.set(userKey, {
                                globalEnabled,
                                timeZoneOffsetMinutes
                            });
                        } catch (_) {
                            globalEnabled = false;
                            timeZoneOffsetMinutes = null;
                            globalEnabledCache.set(userKey, {
                                globalEnabled,
                                timeZoneOffsetMinutes
                            });
                        }
                    }
                }
                const clearRuntimeState = (jobType) => {
                    const key = `${jobType}:${charId}`;
                    this.agentScheduleState.intervalRuntimeMs.delete(key);
                    this.agentScheduleState.intervalCycles.delete(key);
                };

                if (!globalEnabled) {
                    clearRuntimeState('browse');
                    clearRuntimeState('post');
                    continue;
                }

                const settings = await this.resolveCharForumSettings(charId, char);
                if (!settings.agentEnabled) {
                    clearRuntimeState('browse');
                    clearRuntimeState('post');
                    continue;
                }
                const clock = this.buildScheduleClock(nowMs, timeZoneOffsetMinutes);
                const dateKey = clock.dateKey;
                const minuteOfDay = clock.minuteOfDay;
                const withRateLimit = async (jobType, cb) => {
                    const quota = this.getAgentRateLimitRemaining({
                        charId,
                        jobType,
                        nowMs,
                        timeZoneOffsetMinutes,
                        clock
                    });
                    if (!quota.allowed) return false;
                    await cb();
                    this.consumeAgentRateLimit({
                        charId,
                        jobType,
                        nowMs: Date.now(),
                        timeZoneOffsetMinutes,
                        clock: this.buildScheduleClock(Date.now(), timeZoneOffsetMinutes)
                    });
                    return true;
                };

                const enqueueAuto = async (jobType, reason, extraPayload = {}) => {
                    const dedupeKey = `auto:${jobType}:${charId}:${reason}`;
                    return withRateLimit(jobType, async () => {
                        await this.enqueueAgentJob({
                            charId,
                            jobType,
                            payload: Object.assign({
                                userId,
                                source: 'auto_schedule',
                                timeZoneOffsetMinutes
                            }, extraPayload),
                            priority: 1,
                            dedupeKey,
                            maxAttempts: 2
                        });
                    });
                };

                const scheduleByRuntimeInterval = async (jobType, minutes, extraPayload = {}) => {
                    const safeMinutes = this.parseIntervalMinutes(minutes);
                    const runtimeKey = `${jobType}:${charId}`;
                    if (safeMinutes <= 0) {
                        this.agentScheduleState.intervalRuntimeMs.delete(runtimeKey);
                        this.agentScheduleState.intervalCycles.delete(runtimeKey);
                        return;
                    }
                    const intervalMs = safeMinutes * 60 * 1000;
                    let runtimeMs = Math.max(0, Number(this.agentScheduleState.intervalRuntimeMs.get(runtimeKey)) || 0);
                    runtimeMs += tickDeltaMs;
                    if (runtimeMs >= intervalMs) {
                        runtimeMs -= intervalMs;
                        const nextCycle = Math.max(0, Number(this.agentScheduleState.intervalCycles.get(runtimeKey)) || 0) + 1;
                        this.agentScheduleState.intervalCycles.set(runtimeKey, nextCycle);
                        this.agentScheduleState.intervalRuntimeMs.set(runtimeKey, runtimeMs);
                        const slot = Math.max(0, Math.floor(nowMs / intervalMs));
                        await enqueueAuto(jobType, `interval_slot:${slot}`, extraPayload);
                        return;
                    }
                    this.agentScheduleState.intervalRuntimeMs.set(runtimeKey, runtimeMs);
                };

                if (settings.autoBrowseEnabled) {
                    await scheduleByRuntimeInterval('browse', settings.browseInterval, {
                        replyOnBrowse: Boolean(settings.replyOnBrowse)
                    });
                    const browseTimes = Array.isArray(settings.browseTimes) ? settings.browseTimes : [];
                    const dueBrowseTimes = this.pickDueDailyTimes(browseTimes, minuteOfDay, dailyWindowMinutes);
                    for (const dueTime of dueBrowseTimes) {
                        const timeKey = `browse:${charId}:${dateKey}:${dueTime}`;
                        if (!this.agentScheduleState.dailySlots.has(timeKey)) {
                            this.agentScheduleState.dailySlots.set(timeKey, nowMs);
                            await enqueueAuto('browse', `daily:${dateKey}:${dueTime}`, {
                                replyOnBrowse: Boolean(settings.replyOnBrowse)
                            });
                        }
                    }
                } else {
                    clearRuntimeState('browse');
                }

                if (settings.autoPostEnabled) {
                    await scheduleByRuntimeInterval('post', settings.postInterval);
                    const postTimes = Array.isArray(settings.postTimes) ? settings.postTimes : [];
                    const duePostTimes = this.pickDueDailyTimes(postTimes, minuteOfDay, dailyWindowMinutes);
                    for (const dueTime of duePostTimes) {
                        const timeKey = `post:${charId}:${dateKey}:${dueTime}`;
                        if (!this.agentScheduleState.dailySlots.has(timeKey)) {
                            this.agentScheduleState.dailySlots.set(timeKey, nowMs);
                            await enqueueAuto('post', `daily:${dateKey}:${dueTime}`);
                        }
                    }
                } else {
                    clearRuntimeState('post');
                }
            }
        },

        async getAllCharactersForAgent() {
            const config = ForumLink.adapters.config;
            if (config && typeof config.getCharacters === 'function') {
                const list = await config.getCharacters();
                if (Array.isArray(list) && list.length > 0) return list;
            }
            const storage = ForumLink.adapters.storage;
            if (storage && storage._store && storage._store.chars && typeof storage._store.chars.values === 'function') {
                return Array.from(storage._store.chars.values());
            }
            return [];
        },

        async resolveCharForumSettings(charId, charMeta = null) {
            const config = ForumLink.adapters.config;
            const storage = ForumLink.adapters.storage;
            let settings = {};
            if (charMeta && typeof charMeta === 'object' && charMeta.settings && typeof charMeta.settings === 'object') {
                settings = Object.assign({}, charMeta.settings);
            }
            if (config && typeof config.getCharSettings === 'function') {
                const fromConfig = await config.getCharSettings(charId);
                if (fromConfig && typeof fromConfig === 'object') {
                    settings = Object.assign(settings, fromConfig);
                }
            }
            if (storage && typeof storage.getChar === 'function') {
                const storedChar = await storage.getChar(charId);
                if (storedChar && storedChar.settings && typeof storedChar.settings === 'object') {
                    settings = Object.assign({}, storedChar.settings, settings);
                }
            }
            const normalizeTimeList = (value, fallback = []) => {
                if (!Array.isArray(value)) return fallback.slice();
                return value
                    .map((item) => String(item || '').trim())
                    .filter((item) => /^\d{2}:\d{2}$/.test(item));
            };
            const parseBool = (value, fallback = false) => {
                if (value === undefined || value === null) return Boolean(fallback);
                if (typeof value === 'boolean') return value;
                if (typeof value === 'number') return value !== 0;
                const raw = String(value).trim().toLowerCase();
                if (!raw) return Boolean(fallback);
                if (['1', 'true', 'yes', 'on', 'y'].includes(raw)) return true;
                if (['0', 'false', 'no', 'off', 'n'].includes(raw)) return false;
                return Boolean(fallback);
            };
            return {
                agentEnabled: settings.agentEnabled !== undefined ? parseBool(settings.agentEnabled, false) : false,
                autoBrowseEnabled: settings.autoBrowseEnabled !== undefined ? parseBool(settings.autoBrowseEnabled, false) : false,
                autoPostEnabled: settings.autoPostEnabled !== undefined ? parseBool(settings.autoPostEnabled, false) : false,
                replyOnBrowse: settings.replyOnBrowse !== undefined ? parseBool(settings.replyOnBrowse, true) : true,
                browseInterval: String(settings.browseInterval || '').trim(),
                postInterval: String(settings.postInterval || '').trim(),
                browseTimes: normalizeTimeList(settings.browseTimes, ['09:00', '15:00', '21:00']),
                postTimes: normalizeTimeList(settings.postTimes, ['10:00', '20:00'])
            };
        },

        parseIntervalMinutes(value) {
            if (value === undefined || value === null) return 0;
            if (typeof value === 'number') {
                if (!Number.isFinite(value) || value <= 0) return 0;
                return Math.min(24 * 60, Math.max(1, Math.floor(value)));
            }
            const raw = String(value).trim().toLowerCase();
            if (!raw) return 0;
            const numberMatch = raw.match(/(\d+(?:\.\d+)?)/);
            if (!numberMatch) return 0;
            let num = Number(numberMatch[1]);
            if (!Number.isFinite(num) || num <= 0) return 0;
            if (raw.includes('h') || raw.includes('小时')) {
                num *= 60;
            }
            return Math.min(24 * 60, Math.max(1, Math.floor(num)));
        },

        parseTimeZoneOffsetMinutes(value) {
            if (value === undefined || value === null) return null;
            const n = Number(value);
            if (!Number.isFinite(n)) return null;
            const rounded = Math.trunc(n);
            if (rounded < -14 * 60 || rounded > 14 * 60) return null;
            return rounded;
        },

        buildScheduleClock(nowMs = Date.now(), offsetMinutes = null) {
            const safeNowMs = Number(nowMs);
            if (!Number.isFinite(safeNowMs)) {
                return { hhmm: '00:00', dateKey: '1970-01-01', minuteOfDay: 0, hourOfDay: 0 };
            }
            if (offsetMinutes !== null && Number.isFinite(offsetMinutes)) {
                const shifted = new Date(safeNowMs + Number(offsetMinutes) * 60 * 1000);
                const hours = shifted.getUTCHours();
                const minutes = shifted.getUTCMinutes();
                const hhmm = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
                const dateKey = `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`;
                return { hhmm, dateKey, minuteOfDay: hours * 60 + minutes, hourOfDay: hours };
            }
            const now = new Date(safeNowMs);
            const hours = now.getHours();
            const minutes = now.getMinutes();
            const hhmm = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
            const dateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
            return { hhmm, dateKey, minuteOfDay: hours * 60 + minutes, hourOfDay: hours };
        },

        pickDueDailyTimes(values = [], nowMinuteOfDay = 0, windowMinutes = 2) {
            const list = Array.isArray(values) ? values : [];
            const safeNowMinute = Number(nowMinuteOfDay);
            if (!Number.isFinite(safeNowMinute)) return [];
            const safeWindow = Math.max(0, Math.floor(Number(windowMinutes) || 0));
            const result = [];
            const seen = new Set();
            for (const value of list) {
                const time = String(value || '').trim();
                if (!/^\d{2}:\d{2}$/.test(time)) continue;
                if (seen.has(time)) continue;
                seen.add(time);
                const match = time.match(/^(\d{2}):(\d{2})$/);
                if (!match) continue;
                const h = Number(match[1]);
                const m = Number(match[2]);
                if (!Number.isFinite(h) || !Number.isFinite(m)) continue;
                if (h < 0 || h > 23 || m < 0 || m > 59) continue;
                const targetMinute = h * 60 + m;
                if (targetMinute > safeNowMinute) continue;
                if (safeNowMinute - targetMinute > safeWindow) continue;
                result.push(time);
            }
            return result;
        },

        getAgentRateLimitSpec(jobType) {
            const key = String(jobType || '').trim();
            if (!key) return null;
            const raw = this.defaults?.agentAutoRateLimits?.[key];
            if (!raw || typeof raw !== 'object') return null;
            const perHour = Math.max(0, Number(raw.perHour) || 0);
            const perDay = Math.max(0, Number(raw.perDay) || 0);
            if (!perHour && !perDay) return null;
            return { perHour, perDay };
        },

        getAgentRateLimitTimeKeys({ nowMs = Date.now(), timeZoneOffsetMinutes = null, clock = null } = {}) {
            const resolvedClock = clock && typeof clock === 'object'
                ? clock
                : this.buildScheduleClock(nowMs, timeZoneOffsetMinutes);
            const dayKey = String(resolvedClock?.dateKey || '').trim() || '1970-01-01';
            const hour = Number.isFinite(Number(resolvedClock?.hourOfDay))
                ? Math.max(0, Math.min(23, Math.trunc(Number(resolvedClock.hourOfDay))))
                : 0;
            const hourKey = `${dayKey}T${String(hour).padStart(2, '0')}`;
            return { dayKey, hourKey };
        },

        getAgentRateLimitRemaining({ charId, jobType, nowMs = Date.now(), timeZoneOffsetMinutes = null, clock = null } = {}) {
            const spec = this.getAgentRateLimitSpec(jobType);
            if (!spec) {
                return {
                    allowed: true,
                    remaining: Number.POSITIVE_INFINITY,
                    hourRemaining: Number.POSITIVE_INFINITY,
                    dayRemaining: Number.POSITIVE_INFINITY
                };
            }
            const safeCharId = String(charId || '').trim();
            if (!safeCharId) {
                return { allowed: false, remaining: 0, hourRemaining: 0, dayRemaining: 0 };
            }
            const state = this.agentScheduleState || {};
            if (!(state.rateLimitCounters instanceof Map)) {
                state.rateLimitCounters = new Map();
            }
            const { dayKey, hourKey } = this.getAgentRateLimitTimeKeys({
                nowMs,
                timeZoneOffsetMinutes,
                clock
            });
            const mapKey = `${safeCharId}:${String(jobType || '').trim()}`;
            const prev = state.rateLimitCounters.get(mapKey) || {};
            const sameDay = String(prev.dayKey || '') === dayKey;
            const sameHour = String(prev.hourKey || '') === hourKey;
            const dayUsed = sameDay ? Math.max(0, Number(prev.dayUsed) || 0) : 0;
            const hourUsed = sameHour ? Math.max(0, Number(prev.hourUsed) || 0) : 0;
            const hourRemaining = spec.perHour
                ? Math.max(0, spec.perHour - hourUsed)
                : Number.POSITIVE_INFINITY;
            const dayRemaining = spec.perDay
                ? Math.max(0, spec.perDay - dayUsed)
                : Number.POSITIVE_INFINITY;
            return {
                allowed: hourRemaining > 0 && dayRemaining > 0,
                remaining: Math.min(hourRemaining, dayRemaining),
                hourRemaining,
                dayRemaining,
                dayKey,
                hourKey,
                hourUsed,
                dayUsed
            };
        },

        consumeAgentRateLimit({ charId, jobType, amount = 1, nowMs = Date.now(), timeZoneOffsetMinutes = null, clock = null } = {}) {
            const step = Math.max(1, Math.trunc(Number(amount) || 1));
            const snapshot = this.getAgentRateLimitRemaining({
                charId,
                jobType,
                nowMs,
                timeZoneOffsetMinutes,
                clock
            });
            if (!snapshot.allowed || snapshot.remaining < step) {
                return Object.assign({}, snapshot, { allowed: false });
            }
            const safeCharId = String(charId || '').trim();
            if (!safeCharId) return Object.assign({}, snapshot, { allowed: false });
            const state = this.agentScheduleState || {};
            if (!(state.rateLimitCounters instanceof Map)) {
                state.rateLimitCounters = new Map();
            }
            const mapKey = `${safeCharId}:${String(jobType || '').trim()}`;
            const next = {
                dayKey: snapshot.dayKey,
                hourKey: snapshot.hourKey,
                dayUsed: Math.max(0, Number(snapshot.dayUsed) || 0) + step,
                hourUsed: Math.max(0, Number(snapshot.hourUsed) || 0) + step,
                updatedAtMs: Number(nowMs) || Date.now()
            };
            state.rateLimitCounters.set(mapKey, next);
            const nextHourRemaining = Number.isFinite(snapshot.hourRemaining)
                ? Math.max(0, snapshot.hourRemaining - step)
                : Number.POSITIVE_INFINITY;
            const nextDayRemaining = Number.isFinite(snapshot.dayRemaining)
                ? Math.max(0, snapshot.dayRemaining - step)
                : Number.POSITIVE_INFINITY;
            return Object.assign({}, snapshot, {
                allowed: true,
                remaining: Math.min(nextHourRemaining, nextDayRemaining),
                hourRemaining: nextHourRemaining,
                dayRemaining: nextDayRemaining
            });
        },

        buildAgentReportText({ ok, retry = false, job = {}, result = null, error = '' } = {}) {
            const jobType = String(job.jobType || job.job_type || '').trim() || 'unknown';
            const resultObj = result && typeof result === 'object' ? result : {};
            const briefError = String(error || '').trim().slice(0, 120);
            const actionLabel = ({
                browse: '刷论坛',
                post: '发帖',
                reply: '回复互动'
            })[jobType] || '执行任务';
            const normalizeHint = (value, max = 24) => {
                const raw = String(value || '')
                    .replace(/\s+/g, ' ')
                    .replace(/[《》\"“”‘’【】\[\]<>]/g, ' ')
                    .trim();
                if (!raw) return '';
                return raw.length > max ? `${raw.slice(0, Math.max(0, max - 1))}…` : raw;
            };
            const pickHints = (rows, keys = [], maxCount = 2, maxLen = 24) => {
                if (!Array.isArray(rows) || !rows.length || !Array.isArray(keys) || !keys.length) return [];
                const out = [];
                const seen = new Set();
                rows.forEach((item) => {
                    if (out.length >= maxCount) return;
                    const row = (item && typeof item === 'object') ? item : {};
                    for (let i = 0; i < keys.length; i += 1) {
                        const key = keys[i];
                        if (!Object.prototype.hasOwnProperty.call(row, key)) continue;
                        const hint = normalizeHint(row[key], maxLen);
                        if (!hint || seen.has(hint)) continue;
                        seen.add(hint);
                        out.push(hint);
                        break;
                    }
                });
                return out;
            };

            if (!ok) {
                if (retry) {
                    return briefError
                        ? `我刚尝试${actionLabel}时出错了，会稍后自动重试。原因：${briefError}`
                        : `我刚尝试${actionLabel}时出错了，会稍后自动重试。`;
                }
                return briefError
                    ? `我刚尝试${actionLabel}失败了，这次没成功。原因：${briefError}`
                    : `我刚尝试${actionLabel}失败了，这次没成功。`;
            }

            if (jobType === 'browse') {
                const selectedThreads = Math.max(0, Number(resultObj.selectedThreads) || 0);
                const reviewCount = Math.max(0, Number(resultObj.reviewCount) || 0);
                const commentIntentCount = Math.max(0, Number(resultObj.commentIntentCount) || 0);
                const replyIntentCount = Math.max(0, Number(resultObj.replyIntentCount) || 0);
                const shareIntentCount = Math.max(0, Number(resultObj.shareIntentCount) || 0);
                const shareCommentIntentCount = Math.max(0, Number(resultObj.shareCommentIntentCount) || 0);
                const queuedReplyThreads = Math.max(0, Number(resultObj.queuedReplyThreads) || 0);
                const topicHints = pickHints(resultObj.reviewDetails, ['threadTitle', 'title'], 2, 18);
                const reactionHints = pickHints(resultObj.reviewDetails, ['reviewText', 'review'], 1, 26);
                const actionParts = [];
                if (commentIntentCount > 0) actionParts.push(`准备评论 ${commentIntentCount}`);
                if (replyIntentCount > 0) actionParts.push(`准备回复 ${replyIntentCount}`);
                if (shareIntentCount > 0) actionParts.push(`准备转发帖子 ${shareIntentCount}`);
                if (shareCommentIntentCount > 0) actionParts.push(`准备转发评论 ${shareCommentIntentCount}`);
                let text = `我刚刷完论坛：看了 ${selectedThreads} 条感兴趣帖子，写了 ${reviewCount} 条点评。`;
                if (actionParts.length) text += ` 这轮计划的后续互动有：${actionParts.join('、')}。`;
                if (topicHints.length) text += ` 主要刷到的话题像是：${topicHints.join('、')}。`;
                if (reactionHints.length) text += ` 我大概的感受是：${reactionHints[0]}。`;
                if (queuedReplyThreads > 0) text += ` 我还排了 ${queuedReplyThreads} 个帖子的后续互动。`;
                return text;
            }
            if (jobType === 'post') {
                const titleHint = normalizeHint(resultObj.title || '', 22);
                const contentHint = normalizeHint(resultObj.contentPreview || resultObj.content || '', 30);
                if (titleHint && contentHint) return `我刚发了一篇新帖子，主题大概是${titleHint}，主要在聊${contentHint}。`;
                if (titleHint) return `我刚发了一篇新帖子，主题大概是${titleHint}。`;
                if (contentHint) return `我刚发了一篇新帖子，主要在聊${contentHint}。`;
                return '我刚发了一篇新帖子。';
            }
            if (jobType === 'reply') {
                const handledCount = Math.max(0, Number(resultObj.handledCount) || 0);
                const totalTargets = Array.isArray(resultObj.threadIds) ? resultObj.threadIds.length : handledCount;
                const commentCount = Math.max(0, Number(resultObj.commentCount) || 0);
                const replyCount = Math.max(0, Number(resultObj.replyCount) || 0);
                const shareCount = Math.max(0, Number(resultObj.shareCount) || 0);
                const shareCommentCount = Math.max(0, Number(resultObj.shareCommentCount) || 0);
                const topicHints = pickHints(resultObj.replyDetails, ['threadTitle', 'title'], 2, 18);
                const replyHints = pickHints(resultObj.replyDetails, ['myReplyText', 'replyText'], 1, 26);
                const actionParts = [];
                if (commentCount > 0) actionParts.push(`评论 ${commentCount}`);
                if (replyCount > 0) actionParts.push(`回复 ${replyCount}`);
                if (shareCount > 0) actionParts.push(`转发帖子 ${shareCount}`);
                if (shareCommentCount > 0) actionParts.push(`转发评论 ${shareCommentCount}`);
                let text = `我刚处理了论坛互动：看了 ${totalTargets} 个帖子，回复了 ${handledCount} 个。`;
                if (actionParts.length) text += ` 这轮动作：${actionParts.join('、')}。`;
                if (topicHints.length) text += ` 互动话题大概有：${topicHints.join('、')}。`;
                if (replyHints.length) text += ` 我回的方向大概是：${replyHints[0]}。`;
                return text;
            }
            return `我刚完成了一次论坛任务（${jobType}）。`;
        },

        async notifyAgentReport({ ok, retry = false, job = {}, result = null, error = '' } = {}) {
            const integration = ForumLink.adapters.integration;
            const storage = ForumLink.adapters.storage;
            const safeJob = job && typeof job === 'object' ? job : {};
            const jobPayload = safeJob.payload && typeof safeJob.payload === 'object' ? safeJob.payload : {};
            const charId = String(safeJob.charId || safeJob.char_id || '').trim();
            const jobType = String(safeJob.jobType || safeJob.job_type || '').trim();
            const jobId = String(safeJob.id || '').trim();
            let userId = String(jobPayload.userId || jobPayload.user_id || '').trim();
            if (!userId && charId && storage && typeof storage.getChar === 'function') {
                try {
                    const char = await storage.getChar(charId);
                    userId = String(char?.ownerUserId || char?.owner_user_id || '').trim();
                } catch (_) { }
            }
            const reportText = this.buildAgentReportText({ ok, retry, job: safeJob, result, error });
            const createdAt = forumNowIso();
            const dedupeKey = jobId
                ? `agent_report:${jobId}:${ok ? 'ok' : (retry ? 'retry' : 'failed')}`
                : '';
            let reportRow = null;
            if (storage && typeof storage.createAgentReport === 'function' && userId && charId) {
                try {
                    reportRow = await storage.createAgentReport({
                        userId,
                        charId,
                        jobId,
                        jobType,
                        ok: Boolean(ok),
                        retry: Boolean(retry),
                        reportText,
                        payload: {
                            ok: Boolean(ok),
                            retry: Boolean(retry),
                            charId,
                            jobId,
                            jobType,
                            result: result && typeof result === 'object' ? result : {},
                            error: error ? String(error) : ''
                        },
                        dedupeKey
                    });
                } catch (_) { }
            }
            const payload = {
                type: 'forum_agent_report',
                ok: Boolean(ok),
                retry: Boolean(retry),
                userId,
                charId,
                jobId,
                jobType,
                result: result && typeof result === 'object' ? result : {},
                error: error ? String(error) : '',
                reportText,
                reportId: reportRow?.id || '',
                createdAt: reportRow?.createdAt || createdAt
            };
            if (!integration || typeof integration.sendNotification !== 'function') return;
            try {
                integration.sendNotification(payload);
            } catch (_) { }
        },

        async saveAgentActionLogSafe(payload = {}) {
            const storage = ForumLink.adapters.storage;
            if (!storage || typeof storage.saveAgentActionLog !== 'function') return false;
            try {
                return await storage.saveAgentActionLog(payload);
            } catch (_) {
                return false;
            }
        },

        async resolveApiProfile() {
            const config = ForumLink.adapters.config;
            if (config && typeof config.getApiProfile === 'function') {
                return config.getApiProfile();
            }
            return null;
        },

        resolveViewerUserId(preferredUserId) {
            if (preferredUserId) return preferredUserId;
            if (ForumLink.state.currentUserId) return ForumLink.state.currentUserId;
            const integration = ForumLink.adapters.integration;
            if (integration && typeof integration.getActiveUserId === 'function') {
                return integration.getActiveUserId();
            }
            return null;
        },

        async buildIdentityGuard({ charId } = {}) {
            const safeCharId = String(charId || '').trim();
            if (!safeCharId) return '';

            const storage = ForumLink.adapters.storage;
            let char = null;
            if (storage && typeof storage.getChar === 'function') {
                try {
                    char = await storage.getChar(safeCharId);
                } catch (_) { }
            }

            const displayName = char && (
                char.forumName
                || (char.settings && char.settings.forumName)
                || char.displayName
                || char.realName
            )
                ? String(
                    char.forumName
                    || (char.settings && char.settings.forumName)
                    || char.displayName
                    || char.realName
                ).trim()
                : '';
            const forumName = char
                ? String(char.forumName || (char.settings && char.settings.forumName) || '').trim()
                : '';
            const realName = char
                ? String(char.realName || char.displayName || '').trim()
                : '';
            const ownerUserId = char && char.ownerUserId
                ? String(char.ownerUserId).trim()
                : '';
            const numberTag = String(char && char.numberTag ? char.numberTag : '').replace(/\D/g, '');
            const normalizedTag = numberTag ? numberTag.slice(-4).padStart(4, '0') : '';

            const lines = [
                '[Identity Guard]',
                `CharacterId: ${safeCharId}`
            ];
            if (displayName) {
                lines.push(`CharacterName: ${displayName}`);
            }
            if (forumName) {
                lines.push(`CharacterForumName: ${forumName}`);
            }
            if (realName) {
                lines.push(`CharacterRealName: ${realName}`);
            }
            if (normalizedTag) {
                lines.push(`CharacterNumberTag: #${normalizedTag}`);
            }
            if (ownerUserId) {
                lines.push(`OwnerUserId: ${ownerUserId}`);
            }
            lines.push(
                'Write strictly as this character.',
                'First-person "I" must always refer to this character, never the user.',
                'Never write from the user perspective.',
                'Never describe user inner thoughts as "I".',
                'If you mention the user, treat them as an external person.',
                'This is a public forum context (公开论坛), not a private DM.',
                'Use CharacterId + CharacterNumberTag only for internal identity disambiguation, never by name only.',
                'Never print CharacterId / CharacterNumberTag / #0001 / 编号 in public post or reply text.',
                'If you encounter someone with the same name, treat them as a parallel-world counterpart and do not be surprised.',
                'Use memories/chats as background only, do not copy private chat tone directly.',
                ownerUserId
                    ? 'Only treat someone as "your user" when authorType=user and authorId exactly equals OwnerUserId.'
                    : 'Do not assume any user is your owner unless explicitly identified by stable ID.',
                'Never identify people by nickname, display name, real name, or @ mention text alone (names can duplicate).',
                ownerUserId
                    ? 'If a user has authorType=user but authorId != OwnerUserId, treat them as a normal forum stranger; do not act over-familiar.'
                    : 'Treat users as normal forum strangers by default unless explicit identity proof is provided.',
                'If thread author is not this character, that post belongs to the original author; do not speak as if you wrote that content.'
            );
            return lines.join('\n');
        },

        composeTaskInstruction(baseInstruction, identityGuard, taskHint = '') {
            const segments = [];
            if (baseInstruction) segments.push(String(baseInstruction).trim());
            if (taskHint) segments.push(String(taskHint).trim());
            if (identityGuard) segments.push(String(identityGuard).trim());
            return segments.filter(Boolean).join('\n\n').trim();
        },

        async buildCharForumContext({ charId, userId } = {}) {
            const config = ForumLink.adapters.config;
            const storage = ForumLink.adapters.storage;
            const prompt = config && typeof config.getCharForumPrompt === 'function'
                ? await config.getCharForumPrompt(charId)
                : '';
            let viewerUserId = this.resolveViewerUserId(userId);
            let resolvedUserId = viewerUserId;
            let ownerUserId = '';
            let userProfile = null;
            let userProfilePrompt = '';
            let ownerUserIdentityPrompt = '';
            let mergedCharSettings = {};

            let charSettings = null;
            if (config && typeof config.getCharSettings === 'function') {
                charSettings = await config.getCharSettings(charId);
            }
            if (charSettings && typeof charSettings === 'object') {
                mergedCharSettings = Object.assign({}, charSettings);
            }
            if (charSettings && typeof charSettings === 'object'
                && charSettings.userProfile && typeof charSettings.userProfile === 'object') {
                userProfile = Object.assign({}, charSettings.userProfile);
            }

            if (storage && charId) {
                const char = await storage.getChar(charId);
                if (char && char.ownerUserId && !resolvedUserId) {
                    resolvedUserId = char.ownerUserId;
                }
                if (char && char.ownerUserId) {
                    ownerUserId = String(char.ownerUserId).trim();
                }
                if (char && char.settings && typeof char.settings === 'object') {
                    mergedCharSettings = Object.assign({}, char.settings, mergedCharSettings);
                }
                if (!userProfile && char && char.settings && typeof char.settings === 'object'
                    && char.settings.userProfile && typeof char.settings.userProfile === 'object') {
                    userProfile = Object.assign({}, char.settings.userProfile);
                }
            }

            if (!userProfile && config && typeof config.getUserSettings === 'function') {
                const userSettings = await config.getUserSettings(resolvedUserId);
                if (userSettings && typeof userSettings === 'object') {
                    userProfile = Object.assign({}, userSettings);
                }
            }

            const toText = (value) => {
                if (value === null || value === undefined) return '';
                const text = String(value).trim();
                return text;
            };
            const forumLanguageStyle = toText(
                mergedCharSettings.forumLanguageStyle
                || mergedCharSettings.forumWritingStyle
                || mergedCharSettings.forumStyle
                || mergedCharSettings.forumVoiceStyle
                || ''
            );

            if (userProfile && typeof userProfile === 'object') {
                const name = toText(
                    userProfile.name
                    || userProfile.username
                    || userProfile.nickname
                    || userProfile.forumName
                    || userProfile.displayName
                );
                const genderIdentity = toText(userProfile.genderIdentity || userProfile.gender || userProfile.sex);
                const biologicalSex = toText(userProfile.biologicalSex || userProfile.biological_gender || userProfile.sexAssigned);
                const persona = toText(userProfile.persona || userProfile.profile || userProfile.bio || userProfile.description);

                const profileLines = [];
                if (name) profileLines.push(`- 名字: ${name}`);
                if (genderIdentity) profileLines.push(`- 心理性别: ${genderIdentity}`);
                if (biologicalSex) profileLines.push(`- 生理性别: ${biologicalSex}`);
                if (persona) profileLines.push(`- 人设: ${persona}`);
                if (profileLines.length > 0) {
                    userProfilePrompt = ['【关联用户档案】', ...profileLines].join('\n');
                }
            }
            if (!ownerUserId && resolvedUserId) {
                ownerUserId = String(resolvedUserId).trim();
            }
            if (ownerUserId) {
                let ownerForumName = '';
                let ownerRealName = '';
                if (storage && typeof storage.getUser === 'function') {
                    try {
                        const ownerUser = await storage.getUser(ownerUserId);
                        if (ownerUser) {
                            ownerForumName = toText(
                                ownerUser.forumName
                                || (ownerUser.settings && ownerUser.settings.forumName)
                                || ownerUser.username
                            );
                            ownerRealName = toText(
                                ownerUser.profile && (
                                    ownerUser.profile.name
                                    || ownerUser.profile.realName
                                    || ownerUser.profile.displayName
                                )
                            );
                        }
                    } catch (_) { }
                }
                if (!ownerRealName && userProfile && typeof userProfile === 'object') {
                    ownerRealName = toText(
                        userProfile.name
                        || userProfile.realName
                        || userProfile.displayName
                        || userProfile.username
                    );
                }
                const ownerLines = ['【用户身份锚点（防串号）】', `- 你的用户ID: ${ownerUserId}`];
                if (ownerForumName) ownerLines.push(`- 你的用户论坛名: ${ownerForumName}`);
                if (ownerRealName) ownerLines.push(`- 你的用户真实名: ${ownerRealName}`);
                ownerLines.push(
                    '- 只有在 authorType=user 且 authorId=你的用户ID 时，才是“你的用户”。',
                    '- 仅同名/同昵称/@提及都不能证明是你的用户；同名默认按不同人处理。',
                    '- 非你的用户ID一律按普通网友对待，禁止装熟。'
                );
                ownerUserIdentityPrompt = ownerLines.join('\n');
            }

            if (!viewerUserId && resolvedUserId) {
                viewerUserId = resolvedUserId;
            }
            const memoryContext = await ForumLink.memory.buildContext({
                charId,
                userId: viewerUserId
            });
            const memoryPrompt = memoryContext && typeof memoryContext.prompt === 'string'
                ? memoryContext.prompt
                : '';
            const identityGuard = await this.buildIdentityGuard({ charId });
            const segments = [];
            if (identityGuard) segments.push(identityGuard);
            if (ownerUserIdentityPrompt) segments.push(ownerUserIdentityPrompt);
            if (userProfilePrompt) segments.push(userProfilePrompt);
            if (prompt) segments.push(`【论坛行为规则】${prompt}`);
            if (memoryPrompt) segments.push(memoryPrompt);
            return {
                charForumPrompt: prompt || '',
                memoryPrompt: memoryPrompt || '',
                identityGuard: identityGuard || '',
                ownerUserId: ownerUserId || '',
                ownerUserIdentityPrompt: ownerUserIdentityPrompt || '',
                userProfile: userProfile || null,
                userProfilePrompt: userProfilePrompt || '',
                forumLanguageStyle: forumLanguageStyle || '',
                memoryContext: memoryContext && typeof memoryContext === 'object' ? memoryContext : null,
                forumContext: segments.join('\n\n')
            };
        },

        buildForumMemorySummaryPayload(forumContext) {
            const memoryContext = forumContext && typeof forumContext === 'object' && forumContext.memoryContext && typeof forumContext.memoryContext === 'object'
                ? forumContext.memoryContext
                : null;
            const summary = memoryContext && memoryContext.summary && typeof memoryContext.summary === 'object'
                ? memoryContext.summary
                : null;
            if (!summary) return null;
            const normalizeText = (value) => this.cleanText ? this.cleanText(value) : String(value || '').trim();
            const normalizeList = (value, limit = 3) => (Array.isArray(value) ? value : [])
                .map((item) => normalizeText(item))
                .filter(Boolean)
                .slice(0, Math.max(0, Number(limit || 0)));
            const attachmentBiasSummary = summary.attachmentBiasSummary && typeof summary.attachmentBiasSummary === 'object'
                ? {
                    style: normalizeText(summary.attachmentBiasSummary.style),
                    biasedEventCount: Math.max(0, Number(summary.attachmentBiasSummary.biasedEventCount || 0)),
                    boostedCount: Math.max(0, Number(summary.attachmentBiasSummary.boostedCount || 0)),
                    suppressedCount: Math.max(0, Number(summary.attachmentBiasSummary.suppressedCount || 0)),
                    dominantReasons: normalizeList(summary.attachmentBiasSummary.dominantReasons, 5)
                }
                : null;

            return {
                preset: normalizeText(summary.preset),
                query: normalizeText(summary.query),
                effectiveQuery: normalizeText(summary.effectiveQuery),
                attachmentStyle: normalizeText(summary.attachmentStyle),
                recallCount: Math.max(0, Number(summary.recallCount || 0)),
                eventCount: Math.max(0, Number(summary.eventCount || 0)),
                fragmentCount: Math.max(0, Number(summary.fragmentCount || 0)),
                unresolvedEventCount: Math.max(0, Number(summary.unresolvedEventCount || 0)),
                triggeredCount: Math.max(0, Number(summary.triggeredCount || 0)),
                flashbulbCount: Math.max(0, Number(summary.flashbulbCount || 0)),
                scenarioPromptTokenEstimate: Math.max(0, Number(summary.scenarioPromptTokenEstimate || 0)),
                attachmentBiasSummary,
                eventHighlights: normalizeList(summary.eventHighlights, 3),
                fragmentHighlights: normalizeList(summary.fragmentHighlights, 3),
                unresolvedHighlights: normalizeList(summary.unresolvedHighlights, 3),
                triggeredHighlights: normalizeList(summary.triggeredHighlights, 3),
                flashbulbHighlights: normalizeList(summary.flashbulbHighlights, 3)
            };
        },

        buildForumMemoryGuide(memorySummary) {
            const summary = memorySummary && typeof memorySummary === 'object' ? memorySummary : null;
            if (!summary) return '';

            const lines = ['【论坛海马体摘要】'];
            if (summary.preset) lines.push(`- 场景预设: ${summary.preset}`);
            if (summary.effectiveQuery) lines.push(`- 检索焦点: ${summary.effectiveQuery}`);
            else if (summary.query) lines.push(`- 检索焦点: ${summary.query}`);
            if (summary.attachmentStyle) lines.push(`- 当前回忆偏向: ${summary.attachmentStyle}`);
            if (summary.attachmentBiasSummary) {
                const biasStyle = String(summary.attachmentBiasSummary.style || '').trim();
                const dominantReasons = Array.isArray(summary.attachmentBiasSummary.dominantReasons)
                    ? summary.attachmentBiasSummary.dominantReasons.slice(0, 3).map((item) => String(item || '').trim()).filter(Boolean)
                    : [];
                const biasSegments = [biasStyle, dominantReasons.join(' / ')].filter(Boolean);
                if (biasSegments.length) {
                    lines.push(`- 依恋偏置摘要: ${biasSegments.join(' | ')}`);
                }
            }

            const recallParts = [];
            const recallCount = Math.max(0, Number(summary.recallCount || 0));
            const eventCount = Math.max(0, Number(summary.eventCount || 0));
            const fragmentCount = Math.max(0, Number(summary.fragmentCount || 0));
            const unresolvedEventCount = Math.max(0, Number(summary.unresolvedEventCount || 0));
            const triggeredCount = Math.max(0, Number(summary.triggeredCount || 0));
            const flashbulbCount = Math.max(0, Number(summary.flashbulbCount || 0));
            if (recallCount > 0) recallParts.push(`召回 ${recallCount} 条`);
            recallParts.push(`事件 ${eventCount} 条`);
            recallParts.push(`碎片 ${fragmentCount} 条`);
            if (unresolvedEventCount > 0) recallParts.push(`未了结 ${unresolvedEventCount} 条`);
            if (triggeredCount > 0) recallParts.push(`触发命中 ${triggeredCount} 条`);
            if (flashbulbCount > 0) recallParts.push(`闪回 ${flashbulbCount} 条`);
            if (recallParts.length) lines.push(`- 召回概况: ${recallParts.join('，')}`);

            const tokenEstimate = Math.max(0, Number(summary.scenarioPromptTokenEstimate || 0));
            if (tokenEstimate > 0) {
                lines.push(`- 记忆包体量估算: 约 ${tokenEstimate} tokens`);
            }

            const eventHighlights = Array.isArray(summary.eventHighlights) ? summary.eventHighlights.slice(0, 2) : [];
            const unresolvedHighlights = Array.isArray(summary.unresolvedHighlights) ? summary.unresolvedHighlights.slice(0, 2) : [];
            const triggeredHighlights = Array.isArray(summary.triggeredHighlights) ? summary.triggeredHighlights.slice(0, 2) : [];
            const flashbulbHighlights = Array.isArray(summary.flashbulbHighlights) ? summary.flashbulbHighlights.slice(0, 2) : [];
            const fragmentHighlights = Array.isArray(summary.fragmentHighlights) ? summary.fragmentHighlights.slice(0, 2) : [];
            if (eventHighlights.length) lines.push(`- 事件高亮: ${eventHighlights.join('；')}`);
            if (unresolvedHighlights.length) lines.push(`- 未了结高亮: ${unresolvedHighlights.join('；')}`);
            if (triggeredHighlights.length) lines.push(`- 触发高亮: ${triggeredHighlights.join('；')}`);
            if (flashbulbHighlights.length) lines.push(`- 闪回高亮: ${flashbulbHighlights.join('；')}`);
            if (!eventHighlights.length && !unresolvedHighlights.length && !triggeredHighlights.length && !flashbulbHighlights.length && fragmentHighlights.length) {
                lines.push(`- 碎片高亮: ${fragmentHighlights.join('；')}`);
            }

            return lines.join('\n');
        },

        attachForumMemoryPayload(payload, forumContext) {
            const target = payload && typeof payload === 'object' ? payload : {};
            const memorySummary = this.buildForumMemorySummaryPayload(forumContext);
            if (memorySummary) {
                target.forumMemorySummary = memorySummary;
                const memoryGuide = this.buildForumMemoryGuide(memorySummary);
                if (memoryGuide) {
                    target.forumMemoryGuide = memoryGuide;
                }
            }
            return target;
        },

        async callApi(channel, payload, meta = {}) {
            const config = ForumLink.adapters.config;
            const profile = await this.resolveApiProfile();
            const caller = this.apiCaller || (config && typeof config.callApi === 'function' ? config.callApi : null);
            if (!caller) return null;
            return caller(channel, payload, Object.assign({ profile }, meta));
        },

        safeParseJson(text) {
            if (!text || typeof text !== 'string') return null;
            try {
                return JSON.parse(text);
            } catch (error) {
                const match = text.match(/\{[\s\S]*\}/);
                if (match) {
                    try {
                        return JSON.parse(match[0]);
                    } catch (innerError) {
                        return null;
                    }
                }
                return null;
            }
        },

        cleanText(value) {
            if (value === null || value === undefined) return '';
            if (typeof value === 'string') {
                const text = value.replace(/\r\n/g, '\n').trim();
                if (!text) return '';
                if (/^(null|undefined)$/i.test(text)) return '';
                return text;
            }
            if (Array.isArray(value)) {
                const parts = value.map((item) => this.cleanText(item)).filter(Boolean);
                return parts.join('\n').trim();
            }
            if (typeof value === 'object') {
                if (typeof value.text === 'string') return this.cleanText(value.text);
                if (typeof value.content === 'string') return this.cleanText(value.content);
                if (Array.isArray(value.content)) {
                    return value.content
                        .map((item) => this.cleanText(item))
                        .filter(Boolean)
                        .join('\n')
                        .trim();
                }
            }
            return '';
        },

        escapeRegExp(value) {
            return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        },

        sanitizePublicGeneratedText(value, options = {}) {
            let text = this.cleanText(value);
            if (!text) return '';

            text = text
                .replace(/^```[\w-]*\n?/i, '')
                .replace(/\n?```$/i, '')
                .trim();
            if (!text) return '';

            // 兜底清理：部分模型会先吐出可见“思考过程”再给正文（与语言无关）。
            text = text
                .replace(/^<think>[\s\S]*?<\/think>\s*/i, '')
                .replace(/^```(?:analysis|reasoning|thinking)[\s\S]*?```\s*/i, '')
                .trim();
            if (!text) return '';

            const metaLeadHeadingRe = /^\s*(?:\*\*|#{1,6}\s*)?(?:crafting(?:\s+final)?\s+response|final\s+response|analysis|reasoning|thinking|observing|plan(?:ning)?|draft(?:ing)?)\b/i;
            if (metaLeadHeadingRe.test(text)) {
                const metaLeadSentenceRe = /(?:\bi(?:'m| am| have| had| will| should| need| want| can| could| would|'ve)\b|\blet me\b|\bthe (?:goal|plan|response|final)\b|\bresponse\b|\bdraft\b|\bwording\b|\btone\b|\brevise\b|\bensure\b)/i;
                const leadLines = text.split('\n');
                let cutIndex = 0;
                while (cutIndex < leadLines.length) {
                    const trimmed = String(leadLines[cutIndex] || '').trim();
                    if (!trimmed) {
                        cutIndex += 1;
                        continue;
                    }
                    if (metaLeadHeadingRe.test(trimmed)) {
                        cutIndex += 1;
                        continue;
                    }
                    const asciiOnly = /^[\x00-\x7F]+$/.test(trimmed);
                    if (asciiOnly && metaLeadSentenceRe.test(trimmed)) {
                        cutIndex += 1;
                        continue;
                    }
                    break;
                }
                if (cutIndex > 0) {
                    const tail = leadLines.slice(cutIndex).join('\n').trim();
                    if (tail) {
                        text = tail;
                    }
                }
            }

            const type = String(options.type || '').trim().toLowerCase();
            const charId = String(options.charId || '').trim();
            const tagRaw = String(options.numberTag || '').replace(/\D/g, '');
            const normalizedTag = tagRaw ? tagRaw.slice(-4).padStart(4, '0') : '';

            const lines = text.split('\n');
            const dedupedLines = [];
            let seenReplyHeading = false;
            for (const rawLine of lines) {
                const line = String(rawLine || '');
                const trimmed = line.trim();
                if (!trimmed && dedupedLines.length === 0) continue;

                const isReplyHeading = /^回复\s*@?[^\n:：]{1,48}\s*[:：]\s*$/u.test(trimmed);
                if (isReplyHeading) {
                    if (seenReplyHeading) continue;
                    seenReplyHeading = true;
                }
                dedupedLines.push(line);
            }

            // 某些模型会把“思考过程/计划”混在正文前面（如 Crafting..., I'm focusing...）。
            // 当文本里存在中文正文时，裁掉这段前缀元文本。
            const hasChineseInLines = dedupedLines.some((line) => /[\u4e00-\u9fff]/.test(String(line || '')));
            if (hasChineseInLines) {
                const metaHeadingRe = /\*\*\s*(?:crafting|observing|thinking|reasoning|planning|analysis)[^*]{0,120}\*\*/i;
                const metaSentenceRe = /(?:\bi(?:'m| am| will| should| need| want| can| could)\b|\bthe goal is\b|\bthe current plan is\b|\bfocus(?:ing)? on\b)/i;
                const isLikelyMetaLine = (line) => {
                    const trimmed = String(line || '').trim();
                    if (!trimmed) return true;
                    if (metaHeadingRe.test(trimmed) || metaSentenceRe.test(trimmed)) return true;
                    const asciiOnly = /^[\x00-\x7F]+$/.test(trimmed);
                    if (asciiOnly && /[a-z]/i.test(trimmed) && /\b(reply|comment|plan|finalize|phrasing|tone|goal)\b/i.test(trimmed)) {
                        return true;
                    }
                    return false;
                };
                let cutIndex = 0;
                while (cutIndex < dedupedLines.length && isLikelyMetaLine(dedupedLines[cutIndex])) {
                    cutIndex += 1;
                }
                if (cutIndex > 0) {
                    const tail = dedupedLines.slice(cutIndex);
                    const tailHasChinese = tail.some((line) => /[\u4e00-\u9fff]/.test(String(line || '')));
                    if (tailHasChinese) {
                        dedupedLines.splice(0, dedupedLines.length, ...tail);
                    }
                }
            }

            const isIdentityTailLine = (line) => {
                if (!line) return false;
                if (/^(?:id|角色id|char[\s_-]*id|character[\s_-]*id|编号|论坛编号|number[\s_-]*tag)\s*[:：#]\s*[\w#-]+$/i.test(line)) return true;
                if (/^#\d{4,8}$/.test(line)) return true;
                if (/^[^\n]{1,36}#\d{4}$/.test(line)) return true;
                if (/^[（(]?(?:id|角色id|char[\s_-]*id|character[\s_-]*id)\s*[:：]\s*[\w-]+[)）]?$/i.test(line)) return true;
                if (charId && (
                    line === charId
                    || new RegExp(`^${this.escapeRegExp(charId)}\\s*$`, 'i').test(line)
                )) return true;
                if (normalizedTag && new RegExp(`#${this.escapeRegExp(normalizedTag)}$`).test(line) && line.length <= 40) return true;
                return false;
            };

            while (dedupedLines.length > 0) {
                const tail = String(dedupedLines[dedupedLines.length - 1] || '').trim();
                if (!tail) {
                    dedupedLines.pop();
                    continue;
                }
                if (isIdentityTailLine(tail)) {
                    dedupedLines.pop();
                    continue;
                }
                break;
            }

            text = dedupedLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
            if (!text) return '';

            if (charId) {
                const escapedCharId = this.escapeRegExp(charId);
                text = text.replace(
                    new RegExp(`(?:\\s*[（(\\[]?\\s*(?:id|角色id|char[\\s_-]*id|character[\\s_-]*id)\\s*[:：]?\\s*${escapedCharId}\\s*[)）\\]]?)\\s*$`, 'i'),
                    ''
                ).trim();
            }
            if (normalizedTag) {
                const escapedTag = this.escapeRegExp(`#${normalizedTag}`);
                text = text.replace(
                    new RegExp(`(?:\\s*[（(\\[]?[^\\n]{0,28}${escapedTag}\\s*[)）\\]]?)\\s*$`, 'i'),
                    ''
                ).trim();
            }

            if (!text) return '';
            if (type === 'reply' && !/\S/.test(text.replace(/^回复\s*@?[^\n:：]{1,48}\s*[:：]\s*/u, ''))) {
                return '';
            }
            return text;
        },

        extractByKeys(input, keys = [], depth = 0) {
            if (!input || !Array.isArray(keys) || keys.length === 0) return null;
            if (depth > 6) return null;

            if (typeof input === 'string') {
                const parsed = this.safeParseJson(input);
                if (!parsed) return null;
                return this.extractByKeys(parsed, keys, depth + 1);
            }

            if (Array.isArray(input)) {
                for (const item of input) {
                    const hit = this.extractByKeys(item, keys, depth + 1);
                    if (hit !== null && hit !== undefined) return hit;
                }
                return null;
            }

            if (typeof input !== 'object') return null;

            for (const key of keys) {
                if (!Object.prototype.hasOwnProperty.call(input, key)) continue;
                const value = input[key];
                if (value !== null && value !== undefined) return value;
            }

            const values = Object.values(input);
            for (const value of values) {
                if (!value || (typeof value !== 'object' && typeof value !== 'string')) continue;
                const hit = this.extractByKeys(value, keys, depth + 1);
                if (hit !== null && hit !== undefined) return hit;
            }
            return null;
        },

        extractTextResult(result, preferredKeys = [], depth = 0) {
            if (result === null || result === undefined) return '';
            if (depth > 6) return '';

            const keys = Array.from(new Set(
                (Array.isArray(preferredKeys) ? preferredKeys : [])
                    .concat(['content', 'text', 'message', 'output_text', 'body', 'comment', 'reply', 'postContent'])
            ));

            if (typeof result === 'string') {
                const parsed = this.safeParseJson(result);
                if (parsed && typeof parsed === 'object') {
                    const parsedText = this.extractTextResult(parsed, keys, depth + 1);
                    if (parsedText) return parsedText;
                }
                return this.cleanText(result);
            }

            if (Array.isArray(result)) {
                const parts = result
                    .map((item) => this.extractTextResult(item, keys, depth + 1))
                    .filter(Boolean);
                return parts.join('\n').trim();
            }

            if (typeof result === 'object') {
                for (const key of keys) {
                    if (!Object.prototype.hasOwnProperty.call(result, key)) continue;
                    const text = this.extractTextResult(result[key], keys, depth + 1);
                    if (text) return text;
                }

                const choicesText = this.extractTextResult(result.choices, keys, depth + 1);
                if (choicesText) return choicesText;

                const dataText = this.extractTextResult(result.data, keys, depth + 1);
                if (dataText) return dataText;

                const outputText = this.extractTextResult(result.output, keys, depth + 1);
                if (outputText) return outputText;

                const values = Object.values(result);
                for (const value of values) {
                    const text = this.extractTextResult(value, keys, depth + 1);
                    if (text) return text;
                }
            }

            return '';
        },

        normalizeTagCandidate(input) {
            if (Array.isArray(input)) return forumNormalizeTags(input);
            if (typeof input === 'string') {
                const tags = input
                    .split(/[#,\s，、|/]+/)
                    .map((item) => item.trim())
                    .filter(Boolean);
                return forumNormalizeTags(tags);
            }
            return [];
        },

        buildFallbackTitle(content) {
            const normalized = String(content || '')
                .replace(/\s+/g, ' ')
                .trim();
            if (!normalized) return '未命名帖子';
            if (normalized.length <= 24) return normalized;
            return `${normalized.slice(0, 24)}...`;
        },

        async sleep(ms = 0) {
            const delay = Math.max(0, Number(ms) || 0);
            if (!delay) return;
            await new Promise((resolve) => setTimeout(resolve, delay));
        },

        isOwnThreadForChar(thread, charId) {
            const safeCharId = String(charId || '').trim();
            if (!thread || !safeCharId) return false;
            const author = thread.authorIdentity || thread.author_identity || {};
            const authorType = String(author.authorType || author.author_type || '').trim();
            const authorId = String(author.authorId || author.author_id || '').trim();
            return authorType === 'char' && authorId === safeCharId;
        },

        async collectTouchedThreadIdsForChar({ charId, maxReviewScan = 240, maxCommentScan = 400 } = {}) {
            const storage = ForumLink.adapters.storage;
            const safeCharId = String(charId || '').trim();
            const touched = new Set();
            if (!storage || !safeCharId) return touched;

            if (typeof storage.listCharReviews === 'function') {
                try {
                    const reviews = await storage.listCharReviews({
                        charId: safeCharId,
                        limit: Math.max(1, Number(maxReviewScan) || 240)
                    });
                    (Array.isArray(reviews) ? reviews : []).forEach((item) => {
                        const threadId = String(item?.threadId || item?.thread_id || '').trim();
                        if (threadId) touched.add(threadId);
                    });
                } catch (_) { }
            }

            if (typeof storage.listCommentsByAuthor === 'function') {
                try {
                    const comments = await storage.listCommentsByAuthor({
                        authorType: 'char',
                        authorId: safeCharId,
                        limit: Math.max(1, Number(maxCommentScan) || 400)
                    });
                    (Array.isArray(comments) ? comments : []).forEach((item) => {
                        const threadId = String(item?.threadId || item?.thread_id || '').trim();
                        if (threadId) touched.add(threadId);
                    });
                } catch (_) { }
            }

            return touched;
        },

        normalizeThreadSelection(response, threads, maxSelect, options = {}) {
            if (!threads || threads.length === 0) return [];
            const blockedIds = options.blockedIds instanceof Set ? options.blockedIds : new Set();
            const fallback = threads
                .filter((t) => t && t.id && !blockedIds.has(t.id))
                .slice(0, Math.min(maxSelect, threads.length))
                .map((t) => t.id);
            if (!response) return fallback;

            let ids = [];
            if (Array.isArray(response)) {
                ids = response.map((item) => (typeof item === 'string' ? item : item.id)).filter(Boolean);
            } else if (typeof response === 'object') {
                if (Array.isArray(response.threadIds)) ids = response.threadIds.slice();
                if (Array.isArray(response.threads)) ids = response.threads.map((item) => item.id || item.threadId).filter(Boolean);
                if (Array.isArray(response.items)) ids = response.items.map((item) => item.id || item.threadId).filter(Boolean);
            } else if (typeof response === 'string') {
                const parsed = this.safeParseJson(response);
                if (parsed) return this.normalizeThreadSelection(parsed, threads, maxSelect, options);
            }

            if (!ids.length) return fallback;
            const threadIdSet = new Set(threads.map((t) => t.id));
            const filtered = ids.filter((id) => threadIdSet.has(id) && !blockedIds.has(id));
            if (!filtered.length) return fallback;
            return filtered.slice(0, maxSelect);
        },

        resolveThreadSectionId(thread) {
            if (!thread || typeof thread !== 'object') return '';
            const candidate = thread.sectionId
                || thread.section_id
                || (thread.section && (thread.section.id || thread.section.sectionId || thread.section.section_id));
            if (!candidate) return '';
            return String(candidate).trim();
        },

        pickRandomThreadId(candidates, options = {}) {
            if (!Array.isArray(candidates) || candidates.length === 0) return null;
            const selectedIds = options.selectedIds instanceof Set ? options.selectedIds : new Set();
            const blockedIds = options.blockedIds instanceof Set ? options.blockedIds : new Set();
            const charId = options.charId ? String(options.charId) : '';

            let pool = candidates.filter((thread) => {
                if (!thread || !thread.id) return false;
                return !selectedIds.has(thread.id) && !blockedIds.has(thread.id);
            });
            if (pool.length === 0) return null;

            if (charId) {
                const nonOwnPool = pool.filter((thread) => !(
                    thread.authorIdentity?.authorType === 'char'
                    && String(thread.authorIdentity?.authorId || '') === charId
                ));
                if (nonOwnPool.length > 0) pool = nonOwnPool;
            }

            const toTs = (thread) => {
                const value = Date.parse(
                    thread.lastCommentAt
                    || thread.updatedAt
                    || thread.createdAt
                    || ''
                );
                return Number.isFinite(value) ? value : 0;
            };

            const maxHeat = Math.max(0, ...pool.map((thread) => Number(thread.metrics?.heat || 0) || 0));
            const timestamps = pool.map((thread) => toTs(thread));
            const maxTs = Math.max(0, ...timestamps);
            const minTs = Math.min(...timestamps);

            const scored = pool.map((thread, index) => {
                const heat = Number(thread.metrics?.heat || 0) || 0;
                const heatScore = maxHeat > 0 ? heat / maxHeat : 0;
                const ts = timestamps[index];
                const recencyScore = maxTs > minTs
                    ? (ts - minTs) / (maxTs - minTs)
                    : (pool.length > 1 ? 1 - (index / (pool.length - 1)) : 1);
                const noise = Math.random() * 0.35;
                return {
                    id: thread.id,
                    score: recencyScore * 0.45 + heatScore * 0.35 + noise
                };
            }).sort((a, b) => b.score - a.score);

            const topK = Math.max(1, Math.min(3, scored.length));
            const picked = scored[this.randomBetween(0, topK)];
            return picked ? picked.id : null;
        },

        normalizeActions(response) {
            if (!response) return [];
            let actions = response;
            if (typeof response === 'string') {
                const parsed = this.safeParseJson(response);
                if (parsed) actions = parsed;
            }
            const normalizeActionAnon = (item, fallbackAnonymous = null) => {
                if (!item || typeof item !== 'object') return item;
                if (typeof item.anonymous === 'boolean') return item;
                if (typeof fallbackAnonymous !== 'boolean') return item;
                return Object.assign({}, item, { anonymous: fallbackAnonymous });
            };
            if (Array.isArray(actions)) return actions;
            if (Array.isArray(actions.actions)) {
                const fallbackAnonymous = typeof actions.anonymous === 'boolean'
                    ? actions.anonymous
                    : null;
                return actions.actions.map((item) => normalizeActionAnon(item, fallbackAnonymous));
            }
            if (actions && typeof actions === 'object') {
                const inferred = [];
                const hasFlag = (value) => value === true || value === 'true' || value === 1;
                const fallbackAnonymous = typeof actions.anonymous === 'boolean'
                    ? actions.anonymous
                    : null;
                const pushInferred = (item) => {
                    inferred.push(normalizeActionAnon(item, fallbackAnonymous));
                };

                if (hasFlag(actions.like)) pushInferred({ type: 'like' });
                if (hasFlag(actions.collect)) pushInferred({ type: 'collect' });
                if (hasFlag(actions.share)) pushInferred({ type: 'share' });
                if (hasFlag(actions.comment)) pushInferred({ type: 'comment' });
                if (hasFlag(actions.shareComment) || hasFlag(actions.share_comment)) {
                    pushInferred({
                        type: 'share_comment',
                        targetCommentId: actions.shareCommentId
                            || actions.share_comment_id
                            || actions.shareCommentTargetId
                            || actions.targetCommentId
                            || actions.commentId
                            || null
                    });
                }

                if (actions.reply) {
                    if (typeof actions.reply === 'string') {
                        pushInferred({ type: 'reply', targetCommentId: actions.reply });
                    } else if (typeof actions.reply === 'object') {
                        pushInferred(Object.assign({ type: 'reply' }, actions.reply));
                    } else if (hasFlag(actions.reply)) {
                        pushInferred({ type: 'reply' });
                    }
                }

                if (actions.share_comment) {
                    if (typeof actions.share_comment === 'string') {
                        pushInferred({ type: 'share_comment', targetCommentId: actions.share_comment });
                    } else if (typeof actions.share_comment === 'object') {
                        pushInferred(Object.assign({ type: 'share_comment' }, actions.share_comment));
                    }
                }
                if (actions.shareComment) {
                    if (typeof actions.shareComment === 'string') {
                        pushInferred({ type: 'share_comment', targetCommentId: actions.shareComment });
                    } else if (typeof actions.shareComment === 'object') {
                        pushInferred(Object.assign({ type: 'share_comment' }, actions.shareComment));
                    }
                }

                if (inferred.length > 0) return inferred;
            }
            return [];
        },

        async browseForum(options = {}) {
            const storage = ForumLink.adapters.storage;
            const config = ForumLink.adapters.config;
            if (!storage || !config) throw new Error('ForumLink AI: 缺少 storage/config 适配器');

            const charId = options.charId;
            if (!charId) throw new Error('ForumLink AI: browseForum 需要 charId');
            const replyBudgetRaw = Number(options.maxReplyActions);
            const replyBudgetState = Number.isFinite(replyBudgetRaw)
                ? { remaining: Math.max(0, Math.floor(replyBudgetRaw)) }
                : null;

            const browseLimit = Math.max(
                6,
                Number(options.browseLimit || options.browse_limit || this.defaults.browseLimit) || this.defaults.browseLimit
            );
            const browseBatchSize = Math.max(
                3,
                Math.min(12, Number(options.browseBatchSize || options.browse_batch_size || 6) || 6)
            );
            const selectLimit = Math.max(
                1,
                Number(options.selectLimit || options.select_limit || this.defaults.selectLimit) || this.defaults.selectLimit
            );
            const resolvedViewerId = this.resolveViewerUserId(options.userId);
            const forumContext = await this.buildCharForumContext({ charId, userId: options.userId });
            const pendingMentionNotifications = await ForumLink.notify.listPendingMentionsForChar(
                charId,
                Math.max(selectLimit, 8)
            );
            const pendingMentionThreadIds = Array.from(new Set(
                (pendingMentionNotifications || [])
                    .map((item) => item && item.threadId)
                    .filter(Boolean)
            ));
            const pendingMentionThreadIdSet = new Set(pendingMentionThreadIds);
            const touchedThreadIds = await this.collectTouchedThreadIdsForChar({ charId });
            const targetInteractableCount = Math.max(
                Math.min(browseLimit, Math.max(selectLimit * 2, pendingMentionThreadIds.length + selectLimit)),
                Math.min(6, browseBatchSize)
            );
            const threads = [];
            const seenThreadIds = new Set();
            const ownThreadIds = new Set();
            let threadOffset = 0;
            while (threads.length < browseLimit) {
                const remain = browseLimit - threads.length;
                const batchLimit = Math.min(browseBatchSize, remain);
                const batch = await storage.listThreads({
                    sortBy: 'newest',
                    limit: batchLimit,
                    offset: threadOffset
                });
                const rows = Array.isArray(batch) ? batch : [];
                if (!rows.length) break;
                rows.forEach((thread) => {
                    const threadId = String(thread?.id || '').trim();
                    if (!threadId || seenThreadIds.has(threadId)) return;
                    seenThreadIds.add(threadId);
                    threads.push(thread);
                    if (this.isOwnThreadForChar(thread, charId)) {
                        ownThreadIds.add(threadId);
                    }
                });
                const interactableCount = threads.reduce((count, thread) => {
                    const threadId = String(thread?.id || '').trim();
                    if (!threadId) return count;
                    if (ownThreadIds.has(threadId)) return count;
                    if (touchedThreadIds.has(threadId)) return count;
                    return count + 1;
                }, 0);
                if (interactableCount >= targetInteractableCount) break;
                if (rows.length < batchLimit) break;
                threadOffset += rows.length;
            }
            if (!threads.length) return { threads: [], reviews: [] };
            const blockedReviewThreadIds = new Set([
                ...Array.from(touchedThreadIds),
                ...Array.from(ownThreadIds)
            ]);
            const reviewCandidateThreads = threads.filter((thread) => {
                const threadId = String(thread?.id || '').trim();
                if (!threadId) return false;
                return !blockedReviewThreadIds.has(threadId);
            });
            const decoratedThreads = await ForumLink.view.decorateThreadList(
                reviewCandidateThreads,
                resolvedViewerId
            );
            if (!decoratedThreads.length && pendingMentionThreadIds.length === 0) {
                return { threads: [], reviews: [] };
            }

            const ownerUserHint = forumContext.ownerUserId
                ? `仅当 author.authorType="user" 且 author.authorId="${forumContext.ownerUserId}" 时，才是你的用户；同名/同昵称都不算。`
                : '用户身份只能用 authorType+authorId 判断，不能按昵称/名字判断。';
            const browsePayload = {
                instruction: `请从帖子列表中选择你最感兴趣的帖子，并返回 threadIds。优先避开 isOwnThread=true 的帖子（那是你自己发的），除非确实需要回应别人的评论。尽量覆盖不同分区，避免总是重复选择同一批帖子。${ownerUserHint} 若 isOwnThread=false，则这是别人的帖子，帖子内容归原作者，不要当成你自己的发言。`,
                charId,
                charForumPrompt: forumContext.charForumPrompt,
                forumMemoryPrompt: forumContext.memoryPrompt,
                forumContext: forumContext.forumContext,
                threads: decoratedThreads.map((t) => ({
                    id: t.id,
                    title: t.title,
                    content: t.content,
                    tags: t.tags,
                    metrics: t.metrics,
                    isOwnThread: t.authorIdentity?.authorType === 'char' && t.authorIdentity.authorId === charId,
                    isHomeUserAuthor: Boolean(
                        forumContext.ownerUserId
                        && t.authorIdentity?.authorType === 'user'
                        && t.authorIdentity.authorId === forumContext.ownerUserId
                    ),
                    author: {
                        authorType: t.authorIdentity?.authorType || '',
                        authorId: t.authorIdentity?.authorId || '',
                        forumName: t.displayIdentity?.displayName || t.displayAuthorName || '',
                        realName: t.displayIdentity?.realDisplayName || '',
                        isHomeUser: Boolean(
                            forumContext.ownerUserId
                            && t.authorIdentity?.authorType === 'user'
                            && t.authorIdentity.authorId === forumContext.ownerUserId
                        )
                    }
                }))
            };
            this.attachForumMemoryPayload(browsePayload, forumContext);

            let aiSelectedIds = [];
            if (decoratedThreads.length > 0) {
                const sub2Result = await this.callApi('sub2', browsePayload, { stage: 'browse' });
                aiSelectedIds = this.normalizeThreadSelection(sub2Result, reviewCandidateThreads, selectLimit, {
                    blockedIds: blockedReviewThreadIds
                });
            }
            const threadMap = new Map(threads.map((item) => [item.id, item]));
            const baseSelectedIds = Array.from(new Set([
                ...pendingMentionThreadIds,
                ...aiSelectedIds
            ]))
                .filter((threadId) => {
                    const safeThreadId = String(threadId || '').trim();
                    if (!safeThreadId || !threadMap.has(safeThreadId)) return false;
                    if (pendingMentionThreadIdSet.has(safeThreadId)) return true;
                    return !blockedReviewThreadIds.has(safeThreadId);
                })
                .slice(0, Math.max(selectLimit, pendingMentionThreadIds.length));
            const selectedIds = baseSelectedIds.slice();
            const selectedIdSet = new Set(selectedIds);
            const selectedSectionIds = new Set();

            for (const threadId of selectedIds) {
                let thread = threadMap.get(threadId) || null;
                if (!thread) {
                    thread = await storage.getThread(threadId);
                    if (thread) threadMap.set(thread.id, thread);
                }
                const sectionId = this.resolveThreadSectionId(thread);
                if (sectionId) selectedSectionIds.add(sectionId);
            }

            const sections = await storage.listSections();
            for (const section of (Array.isArray(sections) ? sections : [])) {
                const sectionId = section && section.id ? String(section.id).trim() : '';
                if (!sectionId) continue;
                if (selectedSectionIds.has(sectionId)) continue;

                let sectionCandidates = reviewCandidateThreads.filter((thread) => (
                    this.resolveThreadSectionId(thread) === sectionId
                    && !selectedIdSet.has(thread.id)
                ));
                if (sectionCandidates.length === 0) {
                    const fromSection = await storage.listThreads({
                        sectionId,
                        sortBy: 'newest',
                        limit: Math.max(selectLimit, 10)
                    });
                    sectionCandidates = (Array.isArray(fromSection) ? fromSection : []).filter((thread) => {
                        const threadId = String(thread?.id || '').trim();
                        return threadId && !blockedReviewThreadIds.has(threadId);
                    });
                }

                const pickedId = this.pickRandomThreadId(sectionCandidates, {
                    selectedIds: selectedIdSet,
                    blockedIds: blockedReviewThreadIds,
                    charId
                });
                if (!pickedId) continue;

                selectedIds.push(pickedId);
                selectedIdSet.add(pickedId);
                selectedSectionIds.add(sectionId);
            }

            const latestThreads = reviewCandidateThreads.slice(0, 10);
            const hasLatestCoverage = latestThreads.some((thread) => selectedIdSet.has(thread.id));
            if (!hasLatestCoverage) {
                const latestPickedId = this.pickRandomThreadId(latestThreads, {
                    selectedIds: selectedIdSet,
                    blockedIds: blockedReviewThreadIds,
                    charId
                });
                if (latestPickedId) {
                    selectedIds.push(latestPickedId);
                    selectedIdSet.add(latestPickedId);
                }
            }
            const reviews = [];
            const handledThreadIds = new Set();

            for (const threadId of selectedIds) {
                const thread = threads.find((t) => t.id === threadId) || await storage.getThread(threadId);
                if (!thread) continue;
                if (pendingMentionThreadIdSet.has(threadId)) {
                    try {
                        await this.checkReplies({
                            charId,
                            threadId,
                            userId: options.userId,
                            replyBudgetState
                        });
                        handledThreadIds.add(threadId);
                    } catch (error) {
                        console.warn('ForumLink browse mention follow-up failed', threadId, error);
                    }
                    continue;
                }
                const review = await this.reviewThread({
                    charId,
                    thread,
                    forumContext,
                    options: Object.assign({}, options, {
                        touchedThreadIds: blockedReviewThreadIds,
                        replyBudgetState
                    })
                });
                if (review) {
                    reviews.push(review);
                    handledThreadIds.add(review.threadId);
                }
            }

            if (handledThreadIds.size > 0 && pendingMentionNotifications.length > 0) {
                const toMarkReadIds = pendingMentionNotifications
                    .filter((item) => handledThreadIds.has(item.threadId))
                    .map((item) => item.id)
                    .filter(Boolean);
                if (toMarkReadIds.length > 0) {
                    await ForumLink.notify.markNotificationsRead({ ids: toMarkReadIds });
                }
            }

            return { threads: selectedIds, reviews };
        },

        async createPost(options = {}) {
            const storage = ForumLink.adapters.storage;
            const config = ForumLink.adapters.config;
            if (!storage || !config) throw new Error('ForumLink AI: 缺少 storage/config 适配器');

            const charId = options.charId;
            if (!charId) throw new Error('ForumLink AI: createPost 需要 charId');
            const charMeta = await storage.getChar(charId);
            const charNumberTag = charMeta && charMeta.numberTag ? charMeta.numberTag : '';

            const forumContext = await this.buildCharForumContext({ charId, userId: options.userId });
            const identityGuard = forumContext.identityGuard || await this.buildIdentityGuard({ charId });
            const forumLanguageStyle = String(forumContext.forumLanguageStyle || '').trim();
            const sections = await storage.listSections();
            const channels = await storage.listChannels();
            const nowIso = forumNowIso();
            const nowLocal = new Date().toLocaleString();
            const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || '本地时区';
            const timeHint = `当前真实时间：${nowLocal}（时区：${timeZone}，ISO: ${nowIso}）。`;

            const payload = {
                instruction: `请选择合适分区/频道并生成帖子标题、内容、tags，可选配图描述，可@用户。
话题应贴合人物当下的状态：包含生活瞬间、情绪宣泄（暴躁、吐槽、碎碎念、无语）、分享热爱、求助或凑热闹。
【强制要求】：必须完全沉浸在你的角色设定的【绝对日常网络面貌】中。不要像是在做正式演讲或发公众号文章！帖子应该是随意的、碎片化的、有强烈的“当下感”。真人发帖往往源于某个瞬间的冲动，而不是深思熟虑的总结。`,
                charId,
                charForumPrompt: forumContext.charForumPrompt,
                forumMemoryPrompt: forumContext.memoryPrompt,
                forumContext: forumContext.forumContext,
                forumLanguageStyle,
                currentTime: {
                    iso: nowIso,
                    local: nowLocal
                },
                sections,
                channels,
                anonymous: options.anonymous || false
            };
            this.attachForumMemoryPayload(payload, forumContext);
            payload.instruction = this.composeTaskInstruction(
                payload.instruction,
                identityGuard,
                [
                    '- 坚持第一人称视角。你在【真实的论坛】里冲浪，发帖给同好或网友看。',
                    '- 拒绝书面化与过度排版！少用成语和排比句。用属于你人设的日常口语、甚至半截子话来发帖。',
                    '- 绝不要单纯总结近期的记忆，必须基于记忆触发一个具体、甚至微小的吐槽或话题。',
                    '- 不论你的人设是严肃还是暴躁，你的发文习惯都必须符合“现代网民发帖格式”：精炼、带有明确情绪倾向、可以留白让别人回复。',
                    '- 绝对禁止使用：AI总结式句型（例如“总之”、“总体而言”、“不得不说”）。',
                    forumLanguageStyle ? `【论坛语言风格（只用于公开发言）】\n${forumLanguageStyle}` : '',
                    timeHint
                ].join('\n')
            );
            payload.identityGuard = identityGuard;
            payload.postStyleIdeas = [
                '带着强烈情绪吐槽生活痛点或小确幸，不需要完整的起承转合。',
                '就某件刚发生的小事发表一句你人设视角的毒舌、客观、或呆萌的感叹。',
                '提出一个能让人马上吵起来或者马上能产生共鸣的现实小问题。',
                '随手抛出一个引发好奇的话题。'
            ];

            const retryAttempts = Math.max(1, Number(this.defaults.textRetryAttempts) || 1);
            const retryDelay = Math.max(0, Number(this.defaults.textRetryDelayMs) || 0);
            let mainResult = null;
            let parsed = null;
            let source = null;
            let content = '';
            for (let attempt = 1; attempt <= retryAttempts; attempt += 1) {
                mainResult = await this.callApi('main', payload, {
                    stage: 'create_post',
                    attempt,
                    maxAttempts: retryAttempts
                });
                parsed = typeof mainResult === 'string' ? this.safeParseJson(mainResult) : mainResult;
                source = parsed && typeof parsed === 'object' ? parsed : mainResult;
                content = this.extractTextResult(source, ['content', 'postContent', 'post', 'body', 'text', 'message']);
                if (content) break;
                if (attempt < retryAttempts) {
                    await this.sleep(retryDelay);
                }
            }
            if (!content) {
                let rawPreview = '';
                try {
                    if (typeof mainResult === 'string') {
                        rawPreview = mainResult.slice(0, 600);
                    } else if (mainResult && typeof mainResult === 'object') {
                        rawPreview = JSON.stringify(mainResult).slice(0, 600);
                    } else {
                        rawPreview = String(mainResult || '');
                    }
                } catch (_) {
                    rawPreview = '[unserializable_result]';
                }
                console.warn('ForumLink AI: createPost empty content payload', {
                    charId,
                    stage: 'create_post',
                    retryAttempts,
                    sourceType: typeof source,
                    rawPreview
                });
                throw new Error('ForumLink AI: createPost 未拿到有效正文，已跳过发帖');
            }
            content = this.sanitizePublicGeneratedText(content, {
                type: 'post',
                charId,
                numberTag: charNumberTag
            });
            if (!content) {
                throw new Error('ForumLink AI: createPost 正文在清洗后为空，已跳过发帖');
            }
            const rawTitle = this.extractByKeys(source, ['title', 'headline', 'subject']);
            const title = this.cleanText(rawTitle) || this.buildFallbackTitle(content);
            const rawTags = this.extractByKeys(source, ['tags', 'tagList', 'labels']);
            const tags = this.normalizeTagCandidate(rawTags);
            const randomPick = (list) => {
                if (!Array.isArray(list) || list.length === 0) return null;
                const idx = Math.floor(Math.random() * list.length);
                return list[idx] || null;
            };
            const sectionSet = new Set((sections || []).map((item) => item && item.id).filter(Boolean));
            const channelSet = new Set((channels || []).map((item) => item && item.id).filter(Boolean));

            const sectionCandidate = this.cleanText(this.extractByKeys(source, ['sectionId', 'section_id']));
            const parsedSectionId = sectionCandidate && sectionSet.has(sectionCandidate)
                ? sectionCandidate
                : null;
            const fallbackSectionId = (randomPick(sections) || {}).id || null;
            const sectionId = parsedSectionId || fallbackSectionId;

            const channelCandidate = this.cleanText(this.extractByKeys(source, ['channelId', 'channel_id']));
            const parsedChannelId = channelCandidate && channelSet.has(channelCandidate)
                ? channelCandidate
                : null;
            const matchedChannels = (channels || []).filter((c) => !sectionId || c.sectionId === sectionId);
            const fallbackChannelId = (randomPick(matchedChannels) || randomPick(channels) || {}).id || null;
            const channelId = parsedChannelId || fallbackChannelId;

            const rawAnonymous = this.extractByKeys(source, ['anonymous', 'isAnonymous']);
            const parsedAnonymous = typeof rawAnonymous === 'boolean'
                ? rawAnonymous
                : (typeof rawAnonymous === 'string'
                    ? ['1', 'true', 'yes', 'y'].includes(rawAnonymous.trim().toLowerCase())
                    : Boolean(options.anonymous));
            const baseIdentity = await storage.getForumIdentity('char', charId);
            const identity = Object.assign({}, baseIdentity, { anonymous: parsedAnonymous });
            if (identity.anonymous && !identity.anonDisplayId) {
                identity.anonDisplayId = String(Math.floor(1000 + Math.random() * 9000));
            }
            await storage.saveForumIdentity(identity);
            const thread = await storage.createThread({
                title,
                content,
                tags,
                sectionId,
                channelId,
                authorIdentity: identity
            });
            await ForumLink.notify.notifyThreadMentions({
                thread,
                actorIdentity: identity
            });

            // 默认关闭“发帖后自动延迟回帖检查”，避免无人操作时继续自动刷帖/回帖。
            // 仅在显式传入 autoFollowUpReply=true 时才启用。
            if (options && options.autoFollowUpReply === true) {
                this.schedulePostCheck({
                    charId,
                    threadId: thread.id
                });
            }

            return thread;
        },

        schedulePostCheck({ charId, threadId }) {
            const interval = this.randomBetween(
                this.defaults.postCheckIntervalMinMs,
                this.defaults.postCheckIntervalMaxMs
            );
            setTimeout(() => {
                // 即使显式开启该能力，也默认只做非常轻量的一次跟进，防止回复风暴。
                this.checkReplies({ charId, threadId, maxReplyActions: 1 });
            }, interval);
        },

        async checkReplies(options = {}) {
            const storage = ForumLink.adapters.storage;
            const config = ForumLink.adapters.config;
            if (!storage || !config) throw new Error('ForumLink AI: 缺少 storage/config 适配器');

            const charId = options.charId;
            const threadId = options.threadId;
            if (!charId || !threadId) return;

            const thread = await storage.getThread(threadId);
            const replies = await storage.listComments(threadId, {
                limit: this.defaults.commentLimit,
                sortBy: 'newest'
            });
            if (!replies || replies.length === 0) return;
            const isOwnThread = thread && thread.authorIdentity?.authorType === 'char'
                && thread.authorIdentity.authorId === charId;

            const resolvedViewerId = this.resolveViewerUserId(options.userId);
            const forumContext = await this.buildCharForumContext({ charId, userId: options.userId });
            const identityGuard = forumContext.identityGuard || await this.buildIdentityGuard({ charId });
            const decoratedThread = thread ? await ForumLink.view.decorateThread(thread, resolvedViewerId) : null;
            const decoratedReplies = await ForumLink.view.decorateCommentList(replies, resolvedViewerId);
            const replyContext = this.buildReplyCandidateContext({
                comments: decoratedReplies,
                charId
            });
            const availableReplyTargetIds = Array.from(new Set(
                (Array.isArray(replyContext?.replyCandidates) ? replyContext.replyCandidates : [])
                    .map((item) => String(item?.commentId || '').trim())
                    .filter(Boolean)
            ));
            const availableReplyTargetSet = new Set(availableReplyTargetIds);
            const requestedTargetCommentIds = Array.isArray(options.targetCommentIds)
                ? options.targetCommentIds
                    .map((item) => String(item || '').trim())
                    .filter((id) => id && availableReplyTargetSet.has(id))
                : [];
            const preferredReplyTargetIds = requestedTargetCommentIds.length
                ? Array.from(new Set(requestedTargetCommentIds))
                : availableReplyTargetIds;
            const ownerUserHint = forumContext.ownerUserId
                ? `只有 authorType=user 且 authorId=${forumContext.ownerUserId} 才是你的用户；其余 user 都是普通网友，不要装熟。`
                : '按 authorType+authorId 判定身份，不能靠昵称或名字判定用户归属。';
            const payload = {
                instruction: `检查是否需要回复最新评论，可点赞/点踩/回复/转发评论。若回复或转发需指定目标评论。若 thread.isOwnThread=true 表示这是你自己的帖子，请以楼主身份回应，不要像陌生读者聊天。若 thread.isOwnThread=false，则这是别人的帖子内容，不是你的发言。${ownerUserHint} 你可以为 comment/reply/share/share_comment 决定 anonymous: true/false。`,
                charId,
                charForumPrompt: forumContext.charForumPrompt,
                forumMemoryPrompt: forumContext.memoryPrompt,
                forumContext: forumContext.forumContext,
                threadId,
                thread: decoratedThread ? {
                    id: decoratedThread.id,
                    title: decoratedThread.title,
                    content: decoratedThread.content,
                    tags: decoratedThread.tags,
                    isOwnThread,
                    isHomeUserAuthor: Boolean(
                        forumContext.ownerUserId
                        && decoratedThread.authorIdentity?.authorType === 'user'
                        && decoratedThread.authorIdentity?.authorId === forumContext.ownerUserId
                    ),
                    author: {
                        authorType: decoratedThread.authorIdentity?.authorType || '',
                        authorId: decoratedThread.authorIdentity?.authorId || '',
                        forumName: decoratedThread.displayIdentity?.displayName || decoratedThread.displayAuthorName || '',
                        realName: decoratedThread.displayIdentity?.realDisplayName || '',
                        isHomeUser: Boolean(
                            forumContext.ownerUserId
                            && decoratedThread.authorIdentity?.authorType === 'user'
                            && decoratedThread.authorIdentity?.authorId === forumContext.ownerUserId
                        )
                    }
                } : null,
                replies: decoratedReplies.map((c) => ({
                    id: c.id,
                    parentId: c.parentId,
                    content: c.content,
                    author: {
                        authorType: c.authorIdentity?.authorType || '',
                        authorId: c.authorIdentity?.authorId || '',
                        forumName: c.displayIdentity?.displayName || c.displayAuthorName || '',
                        realName: c.displayIdentity?.realDisplayName || '',
                        isHomeUser: Boolean(
                            forumContext.ownerUserId
                            && c.authorIdentity?.authorType === 'user'
                            && c.authorIdentity?.authorId === forumContext.ownerUserId
                        )
                    }
                })),
                targetCommentIds: preferredReplyTargetIds
            };
            this.attachForumMemoryPayload(payload, forumContext);
            payload.instruction = this.composeTaskInstruction(
                payload.instruction,
                identityGuard,
                [
                    'All action decisions must follow this character perspective.',
                    preferredReplyTargetIds.length
                        ? `优先处理 targetCommentIds（${preferredReplyTargetIds.join(', ')}）对应的评论；若要发言请用 reply 并附带 targetCommentId，不要改成顶层 comment。`
                        : ''
                ].filter(Boolean).join('\n')
            );
            payload.identityGuard = identityGuard;
            const mainResult = await this.callApi('main', payload, { stage: 'check_replies' });
            const parsed = typeof mainResult === 'string' ? this.safeParseJson(mainResult) : mainResult;
            let actions = this.normalizeActions(parsed && parsed.actions ? parsed.actions : parsed);
            if (isOwnThread) {
                const targetQueue = preferredReplyTargetIds.slice();
                let targetCursor = 0;
                const nextTargetCommentId = () => {
                    if (!targetQueue.length) return '';
                    const id = targetQueue[targetCursor] || targetQueue[0] || '';
                    if (targetCursor < targetQueue.length - 1) targetCursor += 1;
                    return id;
                };
                const remappedActions = [];
                actions.forEach((rawAction) => {
                    const action = rawAction && typeof rawAction === 'object' ? Object.assign({}, rawAction) : rawAction;
                    const type = String(action?.type || action?.action || '').trim();
                    if (!type) return;
                    if (type === 'comment') {
                        const forcedTargetId = nextTargetCommentId();
                        if (!forcedTargetId) {
                            remappedActions.push(action);
                            return;
                        }
                        remappedActions.push(Object.assign({}, action, {
                            type: 'reply',
                            targetCommentId: forcedTargetId
                        }));
                        return;
                    }
                    if (type === 'reply') {
                        let targetCommentId = String(action?.targetCommentId || action?.commentId || '').trim();
                        if (!targetCommentId || !availableReplyTargetSet.has(targetCommentId)) {
                            targetCommentId = nextTargetCommentId();
                        }
                        if (!targetCommentId) return;
                        remappedActions.push(Object.assign({}, action, {
                            type: 'reply',
                            targetCommentId
                        }));
                        return;
                    }
                    remappedActions.push(action);
                });
                if (preferredReplyTargetIds.length && !remappedActions.some((item) => {
                    const type = String(item?.type || item?.action || '').trim();
                    return type === 'reply';
                })) {
                    remappedActions.unshift({
                        type: 'reply',
                        targetCommentId: preferredReplyTargetIds[0]
                    });
                }
                actions = remappedActions;
            }

            const actionOptions = Object.assign({}, options, { commentPreviewLimit: this.defaults.commentLimit });
            if (
                (!actionOptions.replyBudgetState || typeof actionOptions.replyBudgetState !== 'object')
                && Number.isFinite(Number(actionOptions.maxReplyActions))
            ) {
                actionOptions.replyBudgetState = {
                    remaining: Math.max(0, Math.floor(Number(actionOptions.maxReplyActions)))
                };
            }
            await this.executeActions({
                charId,
                thread: await storage.getThread(threadId),
                actions,
                options: actionOptions
            });
        },

        randomBetween(min, max) {
            return Math.floor(min + Math.random() * Math.max(0, max - min));
        },

        async handleUserRequestPost(options = {}) {
            return this.createPost(options);
        },

        async handleUserRequestCheckReplies(options = {}) {
            return this.checkReplies(options);
        },

        async reviewThread({ charId, thread, forumContext, options }) {
            const storage = ForumLink.adapters.storage;
            const config = ForumLink.adapters.config;
            const safeThreadId = String(thread?.id || '').trim();
            if (!safeThreadId) return null;
            const comments = await storage.listComments(thread.id, {
                limit: options.commentPreviewLimit || 20,
                sortBy: 'newest'
            });
            const resolvedViewerId = this.resolveViewerUserId(options.userId);
            const context = forumContext || await this.buildCharForumContext({ charId, userId: options.userId });
            const identityGuard = context.identityGuard || await this.buildIdentityGuard({ charId });
            const decoratedThread = await ForumLink.view.decorateThread(thread, resolvedViewerId);
            const decoratedComments = await ForumLink.view.decorateCommentList(comments, resolvedViewerId);
            const isOwnThread = thread && thread.authorIdentity?.authorType === 'char'
                && thread.authorIdentity.authorId === charId;
            if (isOwnThread) {
                try {
                    await this.checkReplies({
                        charId,
                        threadId: safeThreadId,
                        userId: options.userId,
                        replyBudgetState: options?.replyBudgetState || null
                    });
                } catch (error) {
                    console.warn('ForumLink own-thread follow-up failed', safeThreadId, error);
                }
                return null;
            }
            const touchedThreadIds = options && options.touchedThreadIds instanceof Set
                ? options.touchedThreadIds
                : await this.collectTouchedThreadIdsForChar({ charId });
            if (touchedThreadIds.has(safeThreadId)) {
                return null;
            }
            const safeCharId = String(charId || '').trim();
            const hasOwnCommentOnThread = (Array.isArray(decoratedComments) ? decoratedComments : []).some((item) => {
                const authorType = String(item?.authorIdentity?.authorType || item?.authorIdentity?.author_type || '').trim();
                const authorId = String(item?.authorIdentity?.authorId || item?.authorIdentity?.author_id || '').trim();
                return authorType === 'char' && authorId === safeCharId;
            });
            if (hasOwnCommentOnThread) {
                touchedThreadIds.add(safeThreadId);
                return null;
            }
            if (storage && typeof storage.listCharReviews === 'function') {
                try {
                    const reviewRows = await storage.listCharReviews({
                        charId: safeCharId,
                        threadId: safeThreadId,
                        limit: 1
                    });
                    if (Array.isArray(reviewRows) && reviewRows.length > 0) {
                        touchedThreadIds.add(safeThreadId);
                        return null;
                    }
                } catch (_) { }
            }
            const ownerUserHint = context.ownerUserId
                ? `只有 authorType=user 且 authorId=${context.ownerUserId} 才是你的用户；其余 user 都是普通网友。`
                : '用户归属只能用 authorType+authorId 判断，不能用昵称或名字判断。';

            const reviewPayload = {
                instruction: `阅读帖子后先生成“点评”（第一反应/内心想法，未修饰，不是公开评论），再决定是否点赞/评论/楼中楼/转发，可多选。点评要直觉、真实、可吐槽，不需要考虑社交后果，不要写成对外发言。若 thread.isOwnThread=true 表示这是你自己的帖子：通常不要点赞/转发自己的帖子；只有在需要回应别人时才评论/回复，语气要像楼主/发帖人，而不是陌生读者。若 thread.isOwnThread=false，说明这是别人的帖子，帖子内容不是你自己发的。${ownerUserHint} 请输出 JSON：{ "reviewText": "...", "actions": [ { "type": "like" }, { "type": "comment", "anonymous": true }, { "type": "reply", "targetCommentId": "评论ID", "anonymous": false }, { "type": "share" }, { "type": "share_comment", "targetCommentId": "评论ID" } ] }。comment/reply/share/share_comment 可选 anonymous 字段。不需要的动作不要写入 actions；若无动作，actions 为空数组。`,
                charId,
                charForumPrompt: context.charForumPrompt,
                forumMemoryPrompt: context.memoryPrompt,
                forumContext: context.forumContext,
                thread: {
                    id: decoratedThread?.id || thread.id,
                    title: decoratedThread?.title || thread.title,
                    content: decoratedThread?.content || thread.content,
                    tags: decoratedThread?.tags || thread.tags,
                    isOwnThread,
                    isHomeUserAuthor: Boolean(
                        context.ownerUserId
                        && (decoratedThread?.authorIdentity?.authorType || thread.authorIdentity?.authorType) === 'user'
                        && (decoratedThread?.authorIdentity?.authorId || thread.authorIdentity?.authorId) === context.ownerUserId
                    ),
                    author: {
                        authorType: decoratedThread?.authorIdentity?.authorType || thread.authorIdentity?.authorType || '',
                        authorId: decoratedThread?.authorIdentity?.authorId || thread.authorIdentity?.authorId || '',
                        forumName: decoratedThread?.displayIdentity?.displayName || decoratedThread?.displayAuthorName || '',
                        realName: decoratedThread?.displayIdentity?.realDisplayName || '',
                        isHomeUser: Boolean(
                            context.ownerUserId
                            && (decoratedThread?.authorIdentity?.authorType || thread.authorIdentity?.authorType) === 'user'
                            && (decoratedThread?.authorIdentity?.authorId || thread.authorIdentity?.authorId) === context.ownerUserId
                        )
                    }
                },
                comments: decoratedComments.map((c) => ({
                    id: c.id,
                    parentId: c.parentId,
                    content: c.content,
                    author: {
                        authorType: c.authorIdentity?.authorType || '',
                        authorId: c.authorIdentity?.authorId || '',
                        forumName: c.displayIdentity?.displayName || c.displayAuthorName || '',
                        realName: c.displayIdentity?.realDisplayName || '',
                        isHomeUser: Boolean(
                            context.ownerUserId
                            && c.authorIdentity?.authorType === 'user'
                            && c.authorIdentity?.authorId === context.ownerUserId
                        )
                    }
                }))
            };
            this.attachForumMemoryPayload(reviewPayload, context);

            const reviewHint = [
                '点评是内心第一反应，不是公开评论。',
                isOwnThread ? 'thread.isOwnThread=true 时按楼主心态处理，不要像陌生读者。' : '',
                isOwnThread ? '' : 'thread.isOwnThread=false 时明确这是别人的帖子内容，不要写成“我原帖说过……”。',
                'Review and planned actions must stay in this character mindset.'
            ].filter(Boolean).join('\n');
            reviewPayload.instruction = this.composeTaskInstruction(
                reviewPayload.instruction,
                identityGuard,
                reviewHint
            );
            reviewPayload.identityGuard = identityGuard;
            const sub1Result = await this.callApi('sub1', reviewPayload, { stage: 'review' });
            const parsed = typeof sub1Result === 'string' ? this.safeParseJson(sub1Result) : sub1Result;
            const reviewText = parsed && parsed.reviewText ? parsed.reviewText : (parsed && parsed.review ? parsed.review : null);
            const actions = this.normalizeActions(parsed && parsed.actions ? parsed.actions : parsed);
            const filteredActions = isOwnThread
                ? actions.filter((action) => {
                    const type = action.type || action.action;
                    return type && !['like', 'collect', 'share'].includes(type);
                })
                : actions;
            const normalizedReviewText = String(reviewText || '').trim();
            if (!normalizedReviewText && filteredActions.length === 0) {
                return null;
            }
            const finalReviewText = normalizedReviewText || `【${thread.title}】已浏览完成，已记录后续操作。`;
            const formatMemoryActor = (actor = {}, fallback = '未知') => {
                const authorType = String(actor.authorType || '').trim() || 'unknown';
                const authorId = String(actor.authorId || '').trim() || 'unknown';
                const forumName = String(actor.forumName || '').trim();
                const realName = String(actor.realName || '').trim();
                const nameText = (forumName && realName && forumName !== realName)
                    ? `${forumName}（${realName}）`
                    : (forumName || realName || fallback);
                return `${nameText}[${authorType}:${authorId}]`;
            };
            const threadAuthorSummary = formatMemoryActor({
                authorType: decoratedThread?.authorIdentity?.authorType || thread.authorIdentity?.authorType || '',
                authorId: decoratedThread?.authorIdentity?.authorId || thread.authorIdentity?.authorId || '',
                forumName: decoratedThread?.displayIdentity?.displayName || decoratedThread?.displayAuthorName || '',
                realName: decoratedThread?.displayIdentity?.realDisplayName || ''
            }, '未知发帖人');
            const commentAuthorById = new Map();
            decoratedComments.forEach((item) => {
                const commentId = String(item?.id || '').trim();
                if (!commentId) return;
                commentAuthorById.set(commentId, formatMemoryActor({
                    authorType: item.authorIdentity?.authorType || '',
                    authorId: item.authorIdentity?.authorId || '',
                    forumName: item.displayIdentity?.displayName || item.displayAuthorName || '',
                    realName: item.displayIdentity?.realDisplayName || ''
                }, '未知回帖人'));
            });
            const actionSummaryParts = filteredActions.map((action) => {
                const type = String(action?.type || action?.action || '').trim();
                const targetCommentId = String(action?.targetCommentId || action?.commentId || '').trim();
                if (!type) return '';
                if (type === 'like') return '点赞帖子';
                if (type === 'collect') return '收藏帖子';
                if (type === 'share') return '转发帖子';
                if (type === 'comment') return '评论帖子';
                if (type === 'reply') {
                    const targetAuthor = targetCommentId ? (commentAuthorById.get(targetCommentId) || '未知回帖人[unknown:unknown]') : '未知回帖人[unknown:unknown]';
                    return `回复评论#${targetCommentId || '?'}（回帖人=${targetAuthor}）`;
                }
                if (type === 'share_comment') {
                    const targetAuthor = targetCommentId ? (commentAuthorById.get(targetCommentId) || '未知回帖人[unknown:unknown]') : '未知回帖人[unknown:unknown]';
                    return `转发评论#${targetCommentId || '?'}（回帖人=${targetAuthor}）`;
                }
                return type;
            }).filter(Boolean);
            const actionSummary = `发帖人=${threadAuthorSummary}｜你的操作=${actionSummaryParts.length ? actionSummaryParts.join('；') : '无'}`;
            const actionsWithMeta = filteredActions.map((action) => Object.assign({
                reviewText: finalReviewText,
                isOwnThread
            }, action));

            await storage.saveCharReview({
                threadId: thread.id,
                charId,
                reviewText: finalReviewText,
                actionsPlanned: filteredActions
            });
            if (touchedThreadIds && typeof touchedThreadIds.add === 'function') {
                touchedThreadIds.add(safeThreadId);
            }

            const memoryHours = options.memoryHours || this.defaults.memoryHours;
            const expiresAt = new Date(Date.now() + memoryHours * 60 * 60 * 1000).toISOString();
            await storage.saveMemoryItems([{
                charId,
                threadId: thread.id,
                title: thread.title,
                tags: thread.tags,
                reviewText: finalReviewText,
                actionSummary,
                expiresAt
            }]);

            await this.executeActions({
                charId,
                thread,
                actions: actionsWithMeta,
                options
            });

            return {
                threadId: thread.id,
                reviewText: finalReviewText,
                actions: filteredActions
            };
        },

        async executeActions({ charId, thread, actions = [], options = {} }) {
            if (!actions || actions.length === 0) return;
            const isOwnThread = thread && thread.authorIdentity?.authorType === 'char'
                && thread.authorIdentity.authorId === charId;
            const normalizedActions = actions.map((action) => {
                if (!action) return { isOwnThread };
                if (typeof action === 'string') return { type: action, isOwnThread };
                return Object.assign({ isOwnThread }, action);
            });
            const filteredActions = normalizedActions.filter((action) => {
                const type = action.type || action.action;
                if (!type) return false;
                if (isOwnThread && ['like', 'collect', 'share'].includes(type)) return false;
                return true;
            });
            if (!filteredActions.length) return;
            const replyBudgetState = options && typeof options.replyBudgetState === 'object'
                ? options.replyBudgetState
                : null;
            for (const action of filteredActions) {
                const type = action.type || action.action;
                if (!type) continue;
                if (type === 'reply' && replyBudgetState) {
                    const remainingRaw = Number(replyBudgetState.remaining);
                    const remaining = Number.isFinite(remainingRaw)
                        ? Math.max(0, Math.floor(remainingRaw))
                        : 0;
                    if (remaining <= 0) continue;
                    replyBudgetState.remaining = remaining - 1;
                }

                if (['comment', 'reply', 'share', 'share_comment'].includes(type)) {
                    this.enqueueMainAction({
                        type,
                        charId,
                        thread,
                        action,
                        options
                    });
                } else {
                    await this.executeImmediateAction({ type, charId, thread, action });
                }
            }
        },

        async executeImmediateAction({ type, charId, thread, action }) {
            const storage = ForumLink.adapters.storage;
            const identity = await storage.getForumIdentity('char', charId);

            if (type === 'like' || type === 'collect' || type === 'share') {
                const inserted = await storage.addInteraction({
                    type,
                    threadId: thread.id,
                    actorId: charId,
                    actorIdentity: identity
                });
                if (type === 'like' && inserted) {
                    await ForumLink.notify.notifyLike({
                        threadId: thread.id,
                        actorIdentity: identity
                    });
                }
            }
        },

        enqueueMainAction(task) {
            this.mainQueue.push(task);
            this.processMainQueue();
        },

        async processMainQueue() {
            if (this.isProcessing) return;
            this.isProcessing = true;
            while (this.mainQueue.length) {
                const task = this.mainQueue.shift();
                try {
                    await this.performMainAction(task);
                } catch (error) {
                    console.warn('ForumLink main action error', error);
                }
            }
            this.isProcessing = false;
        },

        async performMainAction(task) {
            const storage = ForumLink.adapters.storage;
            const integration = ForumLink.adapters.integration;
            const config = ForumLink.adapters.config;
            const { type, charId, thread, action, options } = task;
            const baseIdentity = await storage.getForumIdentity('char', charId);
            const charMeta = await storage.getChar(charId);
            const charNumberTag = charMeta && charMeta.numberTag ? charMeta.numberTag : '';
            const viewerUserId = ForumLink.state.currentUserId
                || (integration && typeof integration.getActiveUserId === 'function'
                    ? integration.getActiveUserId()
                    : null);
            const forumContext = await this.buildCharForumContext({ charId, userId: viewerUserId });
            const identityGuard = forumContext.identityGuard || await this.buildIdentityGuard({ charId });
            const forumLanguageStyle = String(forumContext.forumLanguageStyle || '').trim();
            const isOwnThread = action && typeof action.isOwnThread === 'boolean'
                ? action.isOwnThread
                : (thread && thread.authorIdentity?.authorType === 'char'
                    && thread.authorIdentity.authorId === charId);
            const nowIso = forumNowIso();
            const nowLocal = new Date().toLocaleString();
            const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || '本地时区';
            const timeHint = `当前真实时间：${nowLocal}（时区：${timeZone}，ISO: ${nowIso}）。`;

            const isAnonymous = typeof action.anonymous === 'boolean'
                ? action.anonymous
                : Boolean(options.anonymous);
            const identity = Object.assign({}, baseIdentity, { anonymous: isAnonymous });
            if (identity.anonymous && !identity.anonDisplayId) {
                identity.anonDisplayId = String(Math.floor(1000 + Math.random() * 9000));
            }
            await storage.saveForumIdentity(identity);

            if (type === 'comment' || type === 'reply') {
                const decoratedThread = await ForumLink.view.decorateThread(thread, viewerUserId);
                const allComments = await storage.listComments(thread.id, {
                    limit: this.defaults.commentLimit,
                    sortBy: 'newest'
                });
                const decoratedComments = await ForumLink.view.decorateCommentList(allComments, viewerUserId);
                const requestedTargetCommentId = String(action.commentId || action.targetCommentId || '').trim();
                const replyContext = this.buildReplyCandidateContext({
                    comments: decoratedComments,
                    charId
                });
                const hasOwnTopLevelComment = Boolean(replyContext?.hasOwnTopLevelComment);
                const replyCandidates = Array.isArray(replyContext?.replyCandidates)
                    ? replyContext.replyCandidates
                    : [];
                const replyCandidateSet = new Set(replyCandidates.map((item) => item.commentId));
                let targetCommentId = requestedTargetCommentId;
                if (type === 'comment' && hasOwnTopLevelComment) {
                    console.warn('ForumLink AI: 已在该帖发过顶层评论，跳过重复评论', {
                        charId,
                        threadId: thread?.id || ''
                    });
                    return;
                }
                if (type === 'reply') {
                    if (!targetCommentId || !replyCandidateSet.has(targetCommentId)) {
                        targetCommentId = replyCandidates.length ? replyCandidates[0].commentId : '';
                    }
                    if (!targetCommentId) {
                        console.warn('ForumLink AI: reply 动作缺少可用 targetCommentId，已跳过', {
                            charId,
                            threadId: thread?.id || ''
                        });
                        return;
                    }
                }
                const payload = {
                    instruction: type === 'comment'
                        ? '阅读该帖后，请以你的角色身份生成公开评论内容。仅输出纯文本正文。'
                        : `请针对指定的这一条评论（targetCommentId=${targetCommentId || 'unknown'}），生成你的楼中楼回复内容。仅输出纯文本正文。`,
                    charId,
                    charForumPrompt: forumContext.charForumPrompt,
                    forumMemoryPrompt: forumContext.memoryPrompt,
                    forumContext: forumContext.forumContext,
                    forumLanguageStyle,
                    currentTime: {
                        iso: nowIso,
                        local: nowLocal
                    },
                    thread: {
                        id: decoratedThread?.id || thread.id,
                        title: decoratedThread?.title || thread.title,
                        content: decoratedThread?.content || thread.content,
                        tags: decoratedThread?.tags || thread.tags,
                        isOwnThread,
                        isHomeUserAuthor: Boolean(
                            forumContext.ownerUserId
                            && (decoratedThread?.authorIdentity?.authorType || thread.authorIdentity?.authorType) === 'user'
                            && (decoratedThread?.authorIdentity?.authorId || thread.authorIdentity?.authorId) === forumContext.ownerUserId
                        ),
                        author: {
                            authorType: decoratedThread?.authorIdentity?.authorType || thread.authorIdentity?.authorType || '',
                            authorId: decoratedThread?.authorIdentity?.authorId || thread.authorIdentity?.authorId || '',
                            forumName: decoratedThread?.displayIdentity?.displayName || decoratedThread?.displayAuthorName || '',
                            realName: decoratedThread?.displayIdentity?.realDisplayName || '',
                            isHomeUser: Boolean(
                                forumContext.ownerUserId
                                && (decoratedThread?.authorIdentity?.authorType || thread.authorIdentity?.authorType) === 'user'
                                && (decoratedThread?.authorIdentity?.authorId || thread.authorIdentity?.authorId) === forumContext.ownerUserId
                            )
                        }
                    },
                    comments: decoratedComments.map((c) => ({
                        id: c.id,
                        parentId: c.parentId,
                        content: c.content,
                        author: {
                            authorType: c.authorIdentity?.authorType || '',
                            authorId: c.authorIdentity?.authorId || '',
                            forumName: c.displayIdentity?.displayName || c.displayAuthorName || '',
                            realName: c.displayIdentity?.realDisplayName || '',
                            isHomeUser: Boolean(
                                forumContext.ownerUserId
                                && c.authorIdentity?.authorType === 'user'
                                && c.authorIdentity?.authorId === forumContext.ownerUserId
                            )
                        }
                    })),
                    targetCommentId
                };
                this.attachForumMemoryPayload(payload, forumContext);
                const ownerUserHint = forumContext.ownerUserId
                    ? `只有 authorType=user 且 authorId=${forumContext.ownerUserId} 才是你的用户，其余 user 按普通网友处理。`
                    : '按 authorType+authorId 判定用户身份，禁止仅按昵称/名字装熟。';
                const commentHint = type === 'comment'
                    ? [
                        '- 这是你的论坛马甲公开发表的回复，请彻底代入你在网络空间的人设面具！',
                        '- 【极度重要：拒绝客服感！】：不要写长篇大论！不要全面分析！禁止分段论述（绝对不要出现“首先…其次…”或“虽然…但是看完能理解”这种理客中废话）。',
                        '- 绝大部分回帖应该在一两句话以内解决。抓取原帖里的【一个具体槽点或共鸣点】直接开喷、调侃、认同、或阴阳怪气。符合你人设的本能反应即可。',
                        '- 口语化表达！使用网民真实交流的方式（可以省略主语，可以反问，可以阴阳怪气，可以冷漠回复）。',
                        '- 如果你赞成别人的评论，可以表达赞许，但**绝对禁止**和帖内已有的评论表达重复内容！！！',
                        '- 如果你是该贴楼主 (thread.isOwnThread=true)，以主人翁姿态回应网友，可以补充细节或直接跟他们对线/互动。',
                        '- 如果不是楼主 (thread.isOwnThread=false)，你就只是一个刷贴的路人，绝不冒充发帖人。不要有社交包袱，不需要对所有帖文负责，只对你感兴趣的那句话做出反应。',
                        '- 严禁输出任何思考过程、计划、分析、中间草稿或自我说明；只允许最终可发布正文。',
                        '- 严格格式：只输出正文内容。禁止输出JSON/代码块/动作说明/身份签名（如角色ID、#0001等）。',
                        forumLanguageStyle ? `【论坛语言风格（只用于公开发言）】\n${forumLanguageStyle}` : '',
                        ownerUserHint,
                        timeHint
                    ].filter(Boolean).join('\n')
                    : [
                        '- 【场景定位】：这是楼中楼的直接对话（类似@对方并喊话）。不要顾左右而言他。',
                        '- 【极度简练，甚至只有几个字】：真人在回复别人的某句话时，往往极其简短。可能是接梗、反怼、顺毛、或者仅仅是一句情绪词。除非人设本身是啰嗦的老大爷或说教狂，否则把字数压缩到最短。',
                        '- 不要复述对方的话！直接扔出你的观点或攻击/安抚动作。',
                        '- 禁止任何礼貌的客套开场（如“我很抱歉”、“我理解你的想法”）。即使你是温和人设，也是真实自然的温和，而非AI服务人员的刻意礼貌。',
                        '- 完全代入你在该话题下的阵营或立场，表现出你的爱憎分明或置身事外。',
                        '- 不要连续写多个“回复@某人：”。只输出你说话的内容文本。',
                        '- 严禁输出任何思考过程、计划、分析、中间草稿或自我说明；只允许最终可发布正文。',
                        forumLanguageStyle ? `【论坛语言风格（只用于公开发言）】\n${forumLanguageStyle}` : ''
                    ].join('\n');
                payload.instruction = this.composeTaskInstruction(
                    payload.instruction,
                    identityGuard,
                    commentHint
                );
                payload.identityGuard = identityGuard;
                const retryAttempts = Math.max(1, Number(this.defaults.textRetryAttempts) || 1);
                const retryDelay = Math.max(0, Number(this.defaults.textRetryDelayMs) || 0);
                let finalContent = '';
                for (let attempt = 1; attempt <= retryAttempts; attempt += 1) {
                    const mainResult = await this.callApi('main', payload, {
                        stage: type,
                        attempt,
                        maxAttempts: retryAttempts
                    });
                    finalContent = this.extractTextResult(
                        mainResult,
                        ['content', 'comment', 'reply', 'text', 'message', 'body']
                    );
                    if (finalContent) break;
                    if (attempt < retryAttempts) {
                        await this.sleep(retryDelay);
                    }
                }
                if (!finalContent) {
                    console.warn('ForumLink AI: 跳过空评论/回复', {
                        stage: type,
                        charId,
                        threadId: thread.id
                    });
                    return;
                }
                finalContent = this.sanitizePublicGeneratedText(finalContent, {
                    type,
                    charId,
                    numberTag: charNumberTag
                });
                if (!finalContent) {
                    console.warn('ForumLink AI: 评论/回复清洗后为空，已跳过', {
                        stage: type,
                        charId,
                        threadId: thread.id
                    });
                    return;
                }
                const createdComment = await storage.createComment({
                    threadId: thread.id,
                    parentId: type === 'reply' ? targetCommentId : null,
                    authorIdentity: identity,
                    content: finalContent
                });
                await ForumLink.notify.notifyCommentCreated({
                    comment: createdComment,
                    actorIdentity: identity
                });
                return;
            }

            if (type === 'share_comment') {
                const decoratedThread = await ForumLink.view.decorateThread(thread, viewerUserId);
                const allComments = await storage.listComments(thread.id, { limit: this.defaults.commentLimit });
                const decoratedComments = await ForumLink.view.decorateCommentList(allComments, viewerUserId);
                const targetCommentId = action.commentId || action.targetCommentId || null;
                if (!targetCommentId) return;
                const targetComment = decoratedComments.find((item) => item.id === targetCommentId);
                if (!targetComment) return;

                const replyMap = new Map();
                decoratedComments.forEach((comment) => {
                    if (!comment.parentId) return;
                    if (!replyMap.has(comment.parentId)) replyMap.set(comment.parentId, []);
                    replyMap.get(comment.parentId).push(comment);
                });

                const replyItems = [];
                const collectReplies = (parentId, depth = 1) => {
                    const children = replyMap.get(parentId) || [];
                    children.forEach((child) => {
                        replyItems.push(Object.assign({ depth }, child));
                        collectReplies(child.id, depth + 1);
                    });
                };
                collectReplies(targetCommentId, 1);

                const threadAuthor = {
                    forumName: decoratedThread?.displayIdentity?.displayName || decoratedThread?.displayAuthorName || '',
                    realName: decoratedThread?.displayIdentity?.realDisplayName || ''
                };
                const targetAuthor = {
                    forumName: targetComment.displayIdentity?.displayName || targetComment.displayAuthorName || '',
                    realName: targetComment.displayIdentity?.realDisplayName || ''
                };
                const replyPayload = replyItems.map((item) => ({
                    id: item.id,
                    parentId: item.parentId,
                    depth: item.depth,
                    content: item.content,
                    author: {
                        forumName: item.displayIdentity?.displayName || item.displayAuthorName || '',
                        realName: item.displayIdentity?.realDisplayName || ''
                    }
                }));

                const payload = {
                    instruction: '请生成转发评论的文案',
                    charId,
                    charForumPrompt: forumContext.charForumPrompt,
                    forumMemoryPrompt: forumContext.memoryPrompt,
                    forumContext: forumContext.forumContext,
                    thread: {
                        id: decoratedThread?.id || thread.id,
                        title: decoratedThread?.title || thread.title,
                        content: decoratedThread?.content || thread.content,
                        tags: decoratedThread?.tags || thread.tags,
                        author: threadAuthor
                    },
                    comment: {
                        id: targetComment.id,
                        parentId: targetComment.parentId,
                        content: targetComment.content,
                        author: targetAuthor
                    },
                    replies: replyPayload
                };
                this.attachForumMemoryPayload(payload, forumContext);
                payload.instruction = this.composeTaskInstruction(
                    payload.instruction,
                    identityGuard,
                    'Share text must be written as this character.'
                );
                payload.identityGuard = identityGuard;
                const mainResult = await this.callApi('main', payload, { stage: 'share_comment' });
                const shareText = this.extractTextResult(mainResult, ['content', 'shareText', 'text', 'message']);

                await storage.addInteraction({
                    type: 'share_comment',
                    threadId: thread.id,
                    commentId: targetCommentId,
                    actorId: charId,
                    actorIdentity: identity
                });

                if (integration && typeof integration.sendForumCard === 'function') {
                    integration.sendForumCard({
                        shareType: 'comment',
                        threadId: thread.id,
                        commentId: targetCommentId,
                        shareText: shareText || '',
                        forumShare: {
                            shareType: 'comment',
                            thread: {
                                id: decoratedThread?.id || thread.id,
                                title: decoratedThread?.title || thread.title,
                                content: decoratedThread?.content || thread.content,
                                tags: decoratedThread?.tags || thread.tags,
                                author: threadAuthor
                            },
                            comment: {
                                id: targetComment.id,
                                parentId: targetComment.parentId,
                                content: targetComment.content,
                                author: targetAuthor,
                                replies: replyPayload
                            },
                            shareText: shareText || ''
                        }
                    });
                }
                return;
            }

            if (type === 'share') {
                const decoratedThread = await ForumLink.view.decorateThread(thread, viewerUserId);
                const allComments = await storage.listComments(thread.id, { limit: this.defaults.commentLimit });
                const decoratedComments = await ForumLink.view.decorateCommentList(allComments, viewerUserId);
                const payload = {
                    instruction: '请生成转发文案',
                    charId,
                    charForumPrompt: forumContext.charForumPrompt,
                    forumMemoryPrompt: forumContext.memoryPrompt,
                    forumContext: forumContext.forumContext,
                    thread: {
                        id: decoratedThread?.id || thread.id,
                        title: decoratedThread?.title || thread.title,
                        content: decoratedThread?.content || thread.content,
                        tags: decoratedThread?.tags || thread.tags,
                        author: {
                            authorType: decoratedThread?.authorIdentity?.authorType || thread.authorIdentity?.authorType || '',
                            authorId: decoratedThread?.authorIdentity?.authorId || thread.authorIdentity?.authorId || '',
                            forumName: decoratedThread?.displayIdentity?.displayName || decoratedThread?.displayAuthorName || '',
                            realName: decoratedThread?.displayIdentity?.realDisplayName || ''
                        }
                    },
                    comments: decoratedComments.map((c) => ({
                        id: c.id,
                        parentId: c.parentId,
                        content: c.content,
                        author: {
                            authorType: c.authorIdentity?.authorType || '',
                            authorId: c.authorIdentity?.authorId || '',
                            forumName: c.displayIdentity?.displayName || c.displayAuthorName || '',
                            realName: c.displayIdentity?.realDisplayName || ''
                        }
                    }))
                };
                this.attachForumMemoryPayload(payload, forumContext);
                payload.instruction = this.composeTaskInstruction(
                    payload.instruction,
                    identityGuard,
                    'Share text must be written as this character.'
                );
                payload.identityGuard = identityGuard;
                const mainResult = await this.callApi('main', payload, { stage: 'share' });
                const shareText = this.extractTextResult(mainResult, ['content', 'shareText', 'text', 'message']);

                await storage.addInteraction({
                    type: 'share',
                    threadId: thread.id,
                    actorId: charId,
                    actorIdentity: identity
                });

                if (integration && typeof integration.sendForumCard === 'function') {
                    const threadAuthor = {
                        forumName: decoratedThread?.displayIdentity?.displayName || decoratedThread?.displayAuthorName || '',
                        realName: decoratedThread?.displayIdentity?.realDisplayName || ''
                    };
                    const topLevelComments = decoratedComments.filter((item) => !item.parentId).slice(0, 5);
                    const commentsPreview = topLevelComments.map((item) => ({
                        id: item.id,
                        content: item.content,
                        author: {
                            forumName: item.displayIdentity?.displayName || item.displayAuthorName || '',
                            realName: item.displayIdentity?.realDisplayName || ''
                        }
                    }));
                    const displayIdentity = await ForumLink.identity.resolveDisplayIdentity(identity, viewerUserId);
                    integration.sendForumCard({
                        shareType: 'thread',
                        threadId: thread.id,
                        title: thread.title,
                        preview: thread.content ? thread.content.slice(0, 120) : '',
                        shareText: shareText || '',
                        authorIdentity: identity,
                        displayIdentity,
                        forumShare: {
                            shareType: 'thread',
                            thread: {
                                id: decoratedThread?.id || thread.id,
                                title: decoratedThread?.title || thread.title,
                                content: decoratedThread?.content || thread.content,
                                tags: decoratedThread?.tags || thread.tags,
                                author: threadAuthor
                            },
                            commentsPreview,
                            shareText: shareText || ''
                        }
                    });
                }
            }
        }
    },

    // === 适配器接口声明（方法名清单，仅用于校验与约束） ===
    interfaceSpec: {
        storage: [
            'getUser',
            'getChar',
            'getForumIdentity',
            'saveForumIdentity',
            'listSections',
            'listChannels',
            'listThreads',
            'getThread',
            'createThread',
            'listComments',
            'createComment',
            'addInteraction',
            'listInteractions',
            'removeInteraction',
            'saveCharReview',
            'listCharReviews',
            'saveMemoryItems',
            'listMemoryItems',
            'purgeExpiredMemory',
            'createNotifications',
            'listNotifications',
            'markNotificationsRead'
        ],
        integration: [
            'onForumCommand',
            'sendNotification',
            'sendForumCard',
            'openForumUI',
            'getActiveUserId'
        ],
        config: [
            'getProjectId',
            'getUserSettings',
            'getCharSettings',
            'getCharForumPrompt',
            'getApiProfile'
        ]
    },

    // === 初始化入口 ===
    init(options = {}) {
        if (this.isInitialized) return;

        if (options.adapters) {
            this.setAdapters(options.adapters, { strict: true });
        }

        this.state.activeProject = options.projectId || this.state.activeProject;
        this.state.currentUserId = this.safeGetActiveUserId();
        this.bindIntegration();
        const disableLocalAgentWorker = options.disableLocalAgentWorker === true
            || (typeof window !== 'undefined' && window.__FORUM_DISABLE_LOCAL_AGENT_WORKER__ === true);
        if (!disableLocalAgentWorker && this.ai && typeof this.ai.initAgentWorker === 'function') {
            this.ai.initAgentWorker();
        }
        this.isInitialized = true;
    },

    // === 适配器注入 ===
    setAdapters({ storage, integration, config }, { strict = true } = {}) {
        if (storage) this.adapters.storage = storage;
        if (integration) this.adapters.integration = integration;
        if (config) this.adapters.config = config;

        if (strict) this.validateAdapters();
    },

    validateAdapters() {
        this.ensureAdapter('storage');
        this.ensureAdapter('integration');
        this.ensureAdapter('config');
    },

    ensureAdapter(name) {
        const adapter = this.adapters[name];
        const required = this.interfaceSpec[name] || [];
        if (!adapter) {
            throw new Error(`ForumLink 缺少适配器: ${name}`);
        }
        required.forEach((method) => {
            if (typeof adapter[method] !== 'function') {
                throw new Error(`ForumLink 适配器 ${name} 缺少方法: ${method}`);
            }
        });
    },

    // === 联动绑定（占位） ===
    bindIntegration() {
        const integration = this.adapters.integration;
        if (!integration || typeof integration.onForumCommand !== 'function') return;

        integration.onForumCommand((command) => {
            this.handleCommand(command);
        });
    },

    // === 指令入口（占位） ===
    handleCommand(command) {
        this.emitCommand(command);
        if (!this.events.commandHandlers.length) {
            console.warn('ForumLink.handleCommand: no handlers registered', command);
        }
    },

    // === 安全获取当前用户 ===
    safeGetActiveUserId() {
        const integration = this.adapters.integration;
        if (integration && typeof integration.getActiveUserId === 'function') {
            return integration.getActiveUserId();
        }
        return null;
    }
};

// 兼容浏览器全局注入
if (typeof window !== 'undefined') {
    window.ForumLink = ForumLink;
}

/**
 * ===== 接口声明（概念级 JSDoc）=====
 *
 * @typedef {Object} ForumCommand
 * @property {string} type - 指令类型（如: browse / post / check_reply）
 * @property {Object} payload - 指令参数
 * @property {string=} targetCharId - 目标角色（可空）
 * @property {string=} targetUserId - 目标用户（可空）
 * @property {number=} priority - 优先级
 *
 * @typedef {Object} ForumIdentity
 * @property {'user'|'char'|'ai'} authorType
 * @property {string} authorId
 * @property {string} displayName
 * @property {boolean} anonymous
 * @property {string=} anonDisplayId
 *
 * @typedef {Object} ForumStorageAdapter
 * @property {(userId: string) => Promise<Object>} getUser
 * @property {(charId: string) => Promise<Object>} getChar
 * @property {(authorType: string, authorId: string) => Promise<ForumIdentity>} getForumIdentity
 * @property {(identity: ForumIdentity) => Promise<void>} saveForumIdentity
 * @property {(params: Object) => Promise<Array>} listSections
 * @property {(params: Object) => Promise<Array>} listChannels
 * @property {(params: Object) => Promise<Array>} listThreads
 * @property {(threadId: string) => Promise<Object>} getThread
 * @property {(payload: Object) => Promise<Object>} createThread
 * @property {(threadId: string, params: Object) => Promise<Array>} listComments
 * @property {(payload: Object) => Promise<Object>} createComment
 * @property {(payload: Object) => Promise<boolean>} addInteraction
 * @property {(params: Object) => Promise<Array>} listInteractions
 * @property {(payload: Object) => Promise<void>} removeInteraction
 * @property {(payload: Object) => Promise<void>} saveCharReview
 * @property {(params: Object) => Promise<Array>} listCharReviews
 * @property {(items: Array) => Promise<void>} saveMemoryItems
 * @property {(params: Object) => Promise<Array>} listMemoryItems
 * @property {(params: Object) => Promise<void>} purgeExpiredMemory
 * @property {(items: Array) => Promise<Array>} createNotifications
 * @property {(params: Object) => Promise<Array|number>} listNotifications
 * @property {(params: Object) => Promise<number>} markNotificationsRead
 *
 * @typedef {Object} ProjectConfigProvider
 * @property {() => string} getProjectId
 * @property {(userId: string) => Promise<Object>} getUserSettings
 * @property {(charId: string) => Promise<Object>} getCharSettings
 * @property {(charId: string) => Promise<string>} getCharForumPrompt
 * @property {() => Promise<Object>} getApiProfile - 返回主/副 API 配置
 *
 * @typedef {Object} ForumIntegrationAdapter
 * @property {(handler: (cmd: ForumCommand) => void) => void} onForumCommand
 * @property {(payload: Object) => void} sendNotification
 * @property {(payload: Object) => void} sendForumCard
 * @property {() => void} openForumUI
 * @property {() => string|null} getActiveUserId
 */
