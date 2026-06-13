/**
 * 初始化海马体混合记忆上下文构建器导出壳子。
 * 兼容浏览器全局和 CommonJS 两种加载方式。
 */
(function initHippocampusContextBuilderModule(root) {
    const api = createHippocampusContextBuilder(root);

    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }

    if (root && typeof root === 'object') {
        root.HippocampusContextBuilder = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this));

/**
 * 创建海马体“传统记忆 + 海马体补充”混合上下文构建器。
 * 目标：给老功能统一提供可复用的拼装入口，避免每个子系统重复手写。
 */
function createHippocampusContextBuilder(root) {
    const PRESET_MAP = {
        forum_public: {
            recentHours: 24,
            recentLimit: 4,
            searchLimit: 4,
            surfaceLimit: 2,
            memoryTokenBudget: 1300
        },
        current_mood: {
            recentHours: 24,
            recentLimit: 6,
            searchLimit: 4,
            surfaceLimit: 2,
            memoryTokenBudget: 1600
        },
        creative_generation: {
            recentHours: 48,
            recentLimit: 5,
            searchLimit: 6,
            surfaceLimit: 1,
            memoryTokenBudget: 1800
        },
        stable_preferences: {
            recentHours: 72,
            recentLimit: 4,
            searchLimit: 4,
            surfaceLimit: 1,
            memoryTokenBudget: 1300
        },
        planning: {
            recentHours: 72,
            recentLimit: 5,
            searchLimit: 5,
            surfaceLimit: 1,
            memoryTokenBudget: 1500
        },
        music_profile: {
            recentHours: 24,
            recentLimit: 6,
            searchLimit: 3,
            surfaceLimit: 1,
            memoryTokenBudget: 1200
        },
        music_playlist: {
            recentHours: 24,
            recentLimit: 6,
            searchLimit: 4,
            surfaceLimit: 1,
            memoryTokenBudget: 1300
        },
        food_preference: {
            recentHours: 72,
            recentLimit: 5,
            searchLimit: 6,
            surfaceLimit: 1,
            memoryTokenBudget: 1400
        },
        delivery_scene: {
            recentHours: 24,
            recentLimit: 5,
            searchLimit: 5,
            surfaceLimit: 2,
            memoryTokenBudget: 1500
        },
        voice_reflection: {
            recentHours: 48,
            recentLimit: 6,
            searchLimit: 5,
            surfaceLimit: 2,
            memoryTokenBudget: 1700
        },
        diary_topic: {
            recentHours: 24,
            recentLimit: 8,
            searchLimit: 6,
            surfaceLimit: 2,
            memoryTokenBudget: 1900
        },
        diary_writing: {
            recentHours: 48,
            recentLimit: 8,
            searchLimit: 6,
            surfaceLimit: 2,
            memoryTokenBudget: 2200
        },
        schedule: {
            recentHours: 24,
            recentLimit: 6,
            searchLimit: 5,
            surfaceLimit: 1,
            memoryTokenBudget: 1500
        },
        goal_planning: {
            recentHours: 72,
            recentLimit: 6,
            searchLimit: 6,
            surfaceLimit: 1,
            memoryTokenBudget: 1700
        }
    };

    const SCENARIO_ALIASES = {
        music_archive: 'music_profile',
        playlist_update: 'music_playlist',
        suno_prompt: 'creative_generation',
        food_preference: 'food_preference',
        delivery_reaction: 'delivery_scene',
        delivery_sensory: 'delivery_scene',
        voice_call: 'voice_reflection',
        video_call: 'voice_reflection',
        monologue: 'voice_reflection',
        diary_topic: 'diary_topic',
        diary_writing: 'diary_writing',
        schedule: 'schedule',
        short_term_goal: 'goal_planning',
        long_term_plan: 'goal_planning',
        butterfly_effect: 'goal_planning'
    };

    const DEFAULT_QUERY_HINTS = {
        food_preference: ['吃饭', '口味', '喜欢', '不喜欢', '外卖', '饮食'],
        delivery_scene: ['外卖', '味道', '吃饭', '口感', '香味', '饱'],
        voice_reflection: ['想你', '情绪', '心情', '说话', '电话', '视频'],
        diary_topic: ['今天', '昨天', '最近', '在意', '情绪', '关系'],
        diary_writing: ['今天', '昨天', '最近', '在意', '情绪', '关系'],
        schedule: ['今天', '待办', '安排', '计划', '外卖', '见面'],
        goal_planning: ['目标', '计划', '以后', '想做', '决定', '改变'],
        music_profile: ['最近', '情绪', '喜欢', '状态'],
        music_playlist: ['最近', '情绪', '喜欢', '状态'],
        creative_generation: ['灵感', '画面', '感觉', '关系', '想说']
    };

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
     * 粗略估算文本 token（字符数 / 2.2）。
     */
    function estimateTokens(text) {
        const safeText = toTrimmedString(text);
        if (!safeText) return 0;
        return Math.max(1, Math.ceil(safeText.length / 2.2));
    }

    /**
     * 安全读取 bridge。
     */
    function getBridge() {
        if (!root || typeof root !== 'object') return null;
        return root.IDIC_HippocampusBridge || null;
    }

    /**
     * 读取当前用户 ID。
     */
    function getUserId(options) {
        const source = options && typeof options === 'object' ? options : {};
        const fromOptions = toTrimmedString(source.userId || source.user_id);
        if (fromOptions) return fromOptions;

        const bridge = getBridge();
        if (bridge && typeof bridge.getUserId === 'function') {
            try {
                return toTrimmedString(bridge.getUserId());
            } catch (_) {
                return '';
            }
        }
        return '';
    }

    /**
     * 标准化依恋型枚举值。
     */
    function normalizeAttachmentStyle(style) {
        const normalized = toTrimmedString(style).toLowerCase();
        if (normalized === 'secure' || normalized === 'anxious' || normalized === 'avoidant' || normalized === 'disorganized') {
            return normalized;
        }
        return '';
    }

    function formatAttachmentStyleLabel(style) {
        const normalized = normalizeAttachmentStyle(style);
        if (normalized === 'anxious') return '焦虑型';
        if (normalized === 'avoidant') return '回避型';
        if (normalized === 'disorganized') return '混乱型';
        if (normalized === 'secure') return '安全型';
        return '当前模式';
    }

    function humanizeAttachmentBiasReason(reason) {
        const safeReason = toTrimmedString(reason).toLowerCase();
        const mapping = {
            open_loop: '还没放下',
            painful: '委屈或痛感明显',
            emotionally_intense: '情绪很强',
            recurrent: '最近反复想起',
            flashbulb: '印象特别深',
            warm_downweighted: '温暖的事暂时靠后',
            avoid_open_loop: '会下意识避开未了结的事',
            avoid_flashbulb: '会下意识避开太刺痛的事',
            avoid_high_arousal: '会下意识避开高刺激内容',
            cortex: '会优先保留更理性的判断',
            contained_event: '更偏向可控范围内的事',
            warm_safe: '更愿意想起平稳温和的事',
            mixed_emotions: '情绪复杂',
            warm_pull: '温暖感会把注意力拉过去',
            pain_pull: '刺痛感会把注意力拉过去',
            contrast: '反差感明显',
            vivid_details: '细节很清楚',
            high_significance: '对当下判断很重要'
        };
        return mapping[safeReason] || '';
    }

    function buildAttachmentBiasPromptBlock(summary) {
        const safeSummary = summary && typeof summary === 'object' ? summary : null;
        if (!safeSummary) return '';

        const dominantReasons = (Array.isArray(safeSummary.dominantReasons) ? safeSummary.dominantReasons : [])
            .map(humanizeAttachmentBiasReason)
            .filter(Boolean)
            .slice(0, 4);
        const biasedEventCount = Math.max(0, Math.floor(toFiniteNumber(safeSummary.biasedEventCount, 0)));
        const boostedCount = Math.max(0, Math.floor(toFiniteNumber(safeSummary.boostedCount, 0)));
        const suppressedCount = Math.max(0, Math.floor(toFiniteNumber(safeSummary.suppressedCount, 0)));

        if (biasedEventCount <= 0 && dominantReasons.length <= 0) {
            return '';
        }

        const lines = [];
        lines.push(`你现在的回忆偏向带着一点${formatAttachmentStyleLabel(safeSummary.style)}色彩。`);
        if (dominantReasons.length > 0) {
            lines.push(`此刻更容易先想起：${dominantReasons.join('、')}。`);
        }
        if (boostedCount > 0 || suppressedCount > 0) {
            lines.push(`本轮大约有 ${boostedCount} 条记忆被拉近、${suppressedCount} 条被压后。`);
        }
        lines.push('这会影响你先想到哪些旧事，但不代表其他记忆不存在。');
        return `[此刻回忆偏向]\n${lines.map(function mapLine(line) {
            return `- ${line}`;
        }).join('\n')}`;
    }

    /**
     * 安全读取管理台客户端，供场景记忆包自动读取依恋型。
     */
    function getAdminClient() {
        if (!root || typeof root !== 'object') return null;
        return root.HippocampusAdminClient && typeof root.HippocampusAdminClient === 'object'
            ? root.HippocampusAdminClient
            : null;
    }

    /**
     * 规范化预设名。
     */
    function normalizePreset(preset) {
        const key = toTrimmedString(preset || 'current_mood').toLowerCase();
        if (PRESET_MAP[key]) return key;
        if (SCENARIO_ALIASES[key] && PRESET_MAP[SCENARIO_ALIASES[key]]) {
            return SCENARIO_ALIASES[key];
        }
        return 'current_mood';
    }

    /**
     * 裁剪文本长度，避免场景摘要过长。
     */
    function truncateText(text, maxChars) {
        const safeText = toTrimmedString(text);
        const limit = Math.max(1, Math.floor(toFiniteNumber(maxChars, 80)));
        if (!safeText) return '';
        const chars = Array.from(safeText);
        if (chars.length <= limit) return safeText;
        return `${chars.slice(0, Math.max(0, limit - 1)).join('')}…`;
    }

    /**
     * 将任意值转成布尔值。
     */
    function toBoolean(value) {
        if (value === true || value === false) return value;
        if (value === 1 || value === '1') return true;
        if (value === 0 || value === '0') return false;
        const normalized = toTrimmedString(value).toLowerCase();
        return normalized === 'true' || normalized === 'yes' || normalized === 'resolved';
    }

    /**
     * 判断条目是否为事件候选。
     */
    function isEventRow(row) {
        return !!row && (
            !!row.is_event_cluster
            || toTrimmedString(row.source_type) === 'event_cluster'
            || !!toTrimmedString(row.event_id)
        );
    }

    /**
     * 判断条目是否由本轮 query / 向量 / 感官检索直接命中。
     */
    function isTriggeredRow(row) {
        return !!row && (
            !!row._hitByKeyword
            || !!row._hitByVector
            || !!row._hitBySensory
            || toTrimmedString(row.recall_hit_mode)
        );
    }

    /**
     * 估算条目排序优先级，供场景摘要裁剪使用。
     */
    function getRowPriority(row) {
        if (!row || typeof row !== 'object') return 0;
        let score = toFiniteNumber(
            row.adjustedScore !== undefined
                ? row.adjustedScore
                : (row.score !== undefined ? row.score : row.final_score),
            0
        );
        if (isEventRow(row)) score += 1.2;
        if (row.event_is_unresolved) score += 0.85;
        if (row.event_is_flashbulb) score += 0.4;
        if (isTriggeredRow(row)) score += 0.55;
        if (Array.isArray(row.event_detail_memories)) {
            score += Math.min(0.45, row.event_detail_memories.length * 0.08);
        }
        return score;
    }

    /**
     * 合并 query 和场景默认提示词，提升老功能接入时的召回命中率。
     */
    function buildScenarioQuery(options, presetKey) {
        const source = options && typeof options === 'object' ? options : {};
        const explicit = toTrimmedString(source.query || source.topic || source.keyword || source.keywords || '');
        const hintKey = normalizePreset(presetKey || source.preset);
        const hints = Array.isArray(DEFAULT_QUERY_HINTS[hintKey]) ? DEFAULT_QUERY_HINTS[hintKey] : [];
        if (!explicit) {
            return hints.join(' ');
        }

        const merged = [];
        const seen = new Set();
        explicit.split(/[\s,，、|/]+/).concat(hints).forEach(function pushToken(token) {
            const safeToken = toTrimmedString(token);
            if (!safeToken || seen.has(safeToken)) return;
            seen.add(safeToken);
            merged.push(safeToken);
        });
        return merged.join(' ');
    }

    /**
     * 从 options / contact 中读取依恋型，供场景记忆包重排使用。
     */
    function resolveAttachmentStyle(options) {
        const source = options && typeof options === 'object' ? options : {};
        const contact = source.contact && typeof source.contact === 'object' ? source.contact : {};
        const candidates = [
            source.attachmentStyle,
            source.attachment_style,
            source.attachmentProfile && source.attachmentProfile.style,
            contact.attachmentStyle,
            contact.hippocampusAttachmentStyle,
            contact.attachment_profile && contact.attachment_profile.style
        ];
        for (let i = 0; i < candidates.length; i += 1) {
            const style = normalizeAttachmentStyle(candidates[i]);
            if (style) {
                return style;
            }
        }
        return '';
    }

    /**
     * 自动解析当前角色依恋型。
     * 优先级：显式传入 > 管理台客户端 > bridge > 联系人字段。
     */
    async function resolveAttachmentProfile(options) {
        const source = options && typeof options === 'object' ? options : {};
        const directStyle = resolveAttachmentStyle(source);
        if (directStyle) {
            return {
                style: directStyle,
                source: 'options'
            };
        }

        const contact = source.contact && typeof source.contact === 'object' ? source.contact : {};
        const charId = toTrimmedString(source.charId || source.char_id || contact.id);
        if (!charId) return null;

        const adminClient = getAdminClient();
        if (adminClient && typeof adminClient.getAttachmentProfile === 'function') {
            try {
                const profile = await Promise.resolve(adminClient.getAttachmentProfile(charId));
                const profileStyle = normalizeAttachmentStyle(profile && profile.style);
                if (profileStyle) {
                    return Object.assign({}, profile, {
                        style: profileStyle,
                        source: toTrimmedString(profile && profile.source) || 'admin_client'
                    });
                }
            } catch (_) {
                // 管理台客户端失败时继续桥接兜底。
            }
        }

        const bridge = getBridge();
        const bridgeMethodNames = ['getAttachmentProfile', 'getHippocampusAttachmentProfile', 'getCurrentAttachmentProfile'];
        if (bridge) {
            for (let i = 0; i < bridgeMethodNames.length; i += 1) {
                const method = bridge[bridgeMethodNames[i]];
                if (typeof method !== 'function') continue;
                try {
                    const profile = await Promise.resolve(method.call(bridge, charId));
                    const profileStyle = normalizeAttachmentStyle(profile && profile.style);
                    if (profileStyle) {
                        return Object.assign({}, profile, {
                            style: profileStyle,
                            source: toTrimmedString(profile && profile.source) || 'bridge'
                        });
                    }
                } catch (_) {
                    // 逐个桥接方法尝试。
                }
            }
        }

        const fallbackStyle = resolveAttachmentStyle({
            contact: contact
        });
        if (fallbackStyle) {
            return {
                style: fallbackStyle,
                source: 'contact'
            };
        }

        return null;
    }

    /**
     * 从联系人/选项中提取传统记忆文本。
     */
    function buildLegacyMemoryText(contact, options) {
        const safeContact = contact && typeof contact === 'object' ? contact : {};
        const safeOptions = options && typeof options === 'object' ? options : {};

        const chunks = [];
        const primaryMemory = toTrimmedString(
            safeOptions.legacyMemoryText
            || safeOptions.legacy_memory_text
            || safeContact.memory
            || safeContact.longMemory
            || safeContact.long_memory
        );
        const storyMemory = toTrimmedString(
            safeOptions.storyMemory
            || safeOptions.story_memory
            || safeContact.storyMemory
            || (safeContact.story && safeContact.story.memory)
        );

        if (primaryMemory) {
            chunks.push(`[传统记忆]\n${primaryMemory}`);
        }
        if (storyMemory) {
            chunks.push(`[剧情记忆]\n${storyMemory}`);
        }

        return chunks.join('\n\n');
    }

    /**
     * 合并召回结果并去重。
     */
    function mergeRecallRows(groups) {
        const map = new Map();
        const sourceGroups = Array.isArray(groups) ? groups : [];

        for (let i = 0; i < sourceGroups.length; i += 1) {
            const rows = Array.isArray(sourceGroups[i]) ? sourceGroups[i] : [];
            for (let j = 0; j < rows.length; j += 1) {
                const row = rows[j];
                if (!row || typeof row !== 'object') continue;
                const key = toTrimmedString(row.event_id || row.memory_id || row.id);
                if (!key) continue;
                if (!map.has(key)) {
                    map.set(key, row);
                    continue;
                }

                const existing = map.get(key);
                const preferIncoming = getRowPriority(row) >= getRowPriority(existing);
                const primary = preferIncoming ? row : existing;
                const fallback = preferIncoming ? existing : row;
                map.set(key, Object.assign({}, fallback, primary, {
                    event_summary: toTrimmedString(primary.event_summary || primary.content || '') || fallback.event_summary || fallback.content || '',
                    content: toTrimmedString(primary.content || primary.event_summary || '') || fallback.content || fallback.event_summary || '',
                    event_detail_memories: Array.isArray(primary.event_detail_memories) && primary.event_detail_memories.length > 0
                        ? primary.event_detail_memories
                        : (Array.isArray(fallback.event_detail_memories) ? fallback.event_detail_memories : [])
                }));
            }
        }
        return Array.from(map.values());
    }

    /**
     * 按优先级排序，便于不同场景统一截取高价值条目。
     */
    function sortRowsByPriority(rows) {
        return (Array.isArray(rows) ? rows : []).filter(Boolean).slice().sort(function sortByPriority(left, right) {
            const scoreDiff = getRowPriority(right) - getRowPriority(left);
            if (scoreDiff !== 0) return scoreDiff;
            return toTrimmedString(right && (right.last_active_at || right.created_at))
                .localeCompare(toTrimmedString(left && (left.last_active_at || left.created_at)));
        });
    }

    function buildEventDetailRoleTags(detail, eventRow) {
        const safeDetail = detail && typeof detail === 'object' ? detail : {};
        const safeRow = eventRow && typeof eventRow === 'object' ? eventRow : {};
        const memoryId = toTrimmedString(safeDetail.id || safeDetail.memory_id);
        const anchorId = toTrimmedString(safeRow.event_anchor_memory_id || safeRow.memory_id || safeRow.id);
        const flashbulbIdSet = new Set(
            (Array.isArray(safeRow.event_flashbulb_memory_ids) ? safeRow.event_flashbulb_memory_ids : [])
                .map(toTrimmedString)
                .filter(Boolean)
        );
        const recallMode = toTrimmedString(safeDetail.recall_hit_mode).toLowerCase();
        const currentHit = !!(
            safeDetail._isIntrusive
            || safeDetail._hitByKeyword
            || safeDetail._hitByVector
            || safeDetail._hitBySensory
            || recallMode === 'keyword'
            || recallMode === 'vector'
            || recallMode === 'keyword+vector'
        );
        const flashbulb = !!(
            safeDetail.is_flashbulb
            || safeDetail.event_is_flashbulb
            || (!!memoryId && flashbulbIdSet.has(memoryId))
        );
        const openLoop = !!(
            safeDetail.is_open_loop
            || safeDetail.event_is_unresolved
            || safeDetail.is_unresolved
            || safeDetail.resolved === false
            || ((safeRow.event_is_unresolved || toTrimmedString(safeRow.event_status).toLowerCase() === 'open')
                && (safeDetail.is_anchor || currentHit || flashbulb))
        );
        const tags = [];
        if (safeDetail.is_anchor || (!!memoryId && !!anchorId && memoryId === anchorId)) tags.push('anchor');
        if (currentHit) tags.push('current_hit');
        if (flashbulb) tags.push('flashbulb');
        if (openLoop) tags.push('open_loop');
        if (tags.length === 0) tags.push('detail');
        return Array.from(new Set(tags));
    }

    function scoreEventDetailPriority(detail, eventRow) {
        const safeDetail = detail && typeof detail === 'object' ? detail : {};
        const tags = Array.isArray(safeDetail.detail_role_tags) && safeDetail.detail_role_tags.length > 0
            ? safeDetail.detail_role_tags
            : buildEventDetailRoleTags(safeDetail, eventRow);
        let score = 0;
        if (tags.includes('anchor')) score += 120;
        if (tags.includes('current_hit')) score += 86;
        if (tags.includes('flashbulb')) score += 58;
        if (tags.includes('open_loop')) score += 34;
        if (tags.includes('detail')) score += 14;
        score += toFiniteNumber(safeDetail.importance, 0) * 1.6;
        score += toFiniteNumber(safeDetail.score, 0) * 12;
        return score;
    }

    function sortEventDetailMemoriesByPriority(details, eventRow) {
        return (Array.isArray(details) ? details : [])
            .filter(Boolean)
            .map(function annotateDetail(detail, index) {
                const tags = buildEventDetailRoleTags(detail, eventRow);
                return Object.assign({}, detail, {
                    detail_role_tags: Array.isArray(detail && detail.detail_role_tags) && detail.detail_role_tags.length > 0
                        ? detail.detail_role_tags.slice(0, 6)
                        : tags,
                    detail_priority: scoreEventDetailPriority(detail, eventRow),
                    detail_order: detail && detail.detail_order !== undefined
                        ? toFiniteNumber(detail.detail_order, index)
                        : index
                });
            })
            .sort(function sortDetails(left, right) {
                const scoreDiff = toFiniteNumber(right && right.detail_priority, 0) - toFiniteNumber(left && left.detail_priority, 0);
                if (scoreDiff !== 0) return scoreDiff;
                return toFiniteNumber(left && left.detail_order, 0) - toFiniteNumber(right && right.detail_order, 0);
            });
    }

    function formatEventDetailSnippet(detail, eventRow, maxChars) {
        const safeDetail = detail && typeof detail === 'object' ? detail : {};
        const text = truncateText(safeDetail.content || safeDetail.summary || safeDetail.text || '', maxChars);
        if (!text) return '';
        const tags = Array.isArray(safeDetail.detail_role_tags) && safeDetail.detail_role_tags.length > 0
            ? safeDetail.detail_role_tags
            : buildEventDetailRoleTags(safeDetail, eventRow);
        if (tags.includes('anchor')) return `锚:${text}`;
        if (tags.includes('current_hit')) return `触发:${text}`;
        if (tags.includes('flashbulb')) return `强印象:${text}`;
        if (tags.includes('open_loop')) return `挂念:${text}`;
        return text;
    }

    /**
     * 将一条事件 / 碎片压成更适合老功能消费的摘要行。
     */
    function summarizeRow(row, mode) {
        const safeRow = row && typeof row === 'object' ? row : {};
        const summaryMode = toTrimmedString(mode || 'default').toLowerCase();
        const eventRow = isEventRow(safeRow);
        const unresolved = !!safeRow.event_is_unresolved || toTrimmedString(safeRow.event_status).toLowerCase() === 'open';
        const flashbulb = !!safeRow.event_is_flashbulb;
        const title = truncateText(safeRow.event_title || safeRow.title || '', 24);
        const summary = truncateText(safeRow.event_summary || safeRow.content || '', summaryMode === 'compact' ? 34 : 60);
        const content = truncateText(safeRow.content || safeRow.event_summary || '', summaryMode === 'compact' ? 28 : 52);
        const detailSource = sortEventDetailMemoriesByPriority(
            Array.isArray(safeRow.event_detail_memories) ? safeRow.event_detail_memories : [],
            safeRow
        );
        const detailText = detailSource
            .map(function mapDetail(item) {
                return formatEventDetailSnippet(item, safeRow, summaryMode === 'compact' ? 18 : 24);
            })
            .filter(Boolean)
            .slice(0, summaryMode === 'compact' ? 2 : 3)
            .join(' / ');
        const suffixParts = [];
        if (unresolved) suffixParts.push('未了结');
        if (flashbulb) suffixParts.push('印象很深');
        if (isTriggeredRow(safeRow)) suffixParts.push('本轮命中');
        const suffix = suffixParts.length > 0 ? `（${suffixParts.join('，')}）` : '';

        if (eventRow) {
            const lead = title || '记忆事件';
            const body = summary || content;
            const detailTail = detailText ? `；细节：${detailText}` : '';
            return `${lead}：${body}${detailTail}${suffix}`;
        }

        if (summaryMode === 'preference') {
            return `${content}${suffix}`;
        }
        return `记忆碎片：${content}${suffix}`;
    }

    /**
     * 为不同老功能拆出常用记忆分组。
     */
    function classifyRecallRows(rows) {
        const sorted = sortRowsByPriority(rows);
        const events = [];
        const fragments = [];
        const unresolvedEvents = [];
        const triggered = [];
        const flashbulb = [];

        sorted.forEach(function classify(row) {
            if (isEventRow(row)) {
                events.push(row);
                if (row.event_is_unresolved || toTrimmedString(row.event_status).toLowerCase() === 'open') {
                    unresolvedEvents.push(row);
                }
            } else {
                fragments.push(row);
            }
            if (isTriggeredRow(row)) triggered.push(row);
            if (row && (row.event_is_flashbulb || row.is_flashbulb)) flashbulb.push(row);
        });

        return {
            all: sorted,
            events: events,
            fragments: fragments,
            unresolvedEvents: unresolvedEvents,
            triggered: triggered,
            flashbulb: flashbulb
        };
    }

    function summarizeScenarioPacket(packet) {
        const safePacket = packet && typeof packet === 'object' ? packet : {};
        const groups = classifyRecallRows(
            Array.isArray(safePacket.recallRows)
                ? safePacket.recallRows
                : []
        );
        const eventRows = Array.isArray(safePacket.eventRows) ? safePacket.eventRows : groups.events;
        const fragmentRows = Array.isArray(safePacket.fragmentRows) ? safePacket.fragmentRows : groups.fragments;
        const unresolvedEventRows = Array.isArray(safePacket.unresolvedEventRows) ? safePacket.unresolvedEventRows : groups.unresolvedEvents;
        const triggeredRows = Array.isArray(safePacket.triggeredRows) ? safePacket.triggeredRows : groups.triggered;
        const flashbulbRows = Array.isArray(safePacket.flashbulbRows) ? safePacket.flashbulbRows : groups.flashbulb;

        return {
            preset: normalizePreset(safePacket.preset || 'current_mood'),
            query: toTrimmedString(safePacket.query || ''),
            effectiveQuery: toTrimmedString(safePacket.effectiveQuery || safePacket.query || ''),
            attachmentStyle: normalizeAttachmentStyle(
                safePacket.attachmentStyle
                || (safePacket.attachmentProfile && safePacket.attachmentProfile.style)
                || ''
            ),
            attachmentBiasSummary: safePacket.attachmentBiasSummary && typeof safePacket.attachmentBiasSummary === 'object'
                ? Object.assign({}, safePacket.attachmentBiasSummary)
                : null,
            recallCount: groups.all.length,
            eventCount: eventRows.length,
            fragmentCount: fragmentRows.length,
            unresolvedEventCount: unresolvedEventRows.length,
            triggeredCount: triggeredRows.length,
            flashbulbCount: flashbulbRows.length,
            legacyMemoryTokenEstimate: estimateTokens(safePacket.legacyMemoryText || ''),
            recallBlockTokenEstimate: estimateTokens(safePacket.hippocampusRecallBlock || ''),
            scenarioPromptTokenEstimate: estimateTokens(
                safePacket.scenarioPromptContext
                || safePacket.mergedMemoryContext
                || safePacket.hippocampusRecallBlock
                || ''
            ),
            eventHighlights: eventRows.slice(0, 3).map(function mapEvent(row) {
                return summarizeRow(row, 'compact');
            }).filter(Boolean),
            fragmentHighlights: fragmentRows.slice(0, 3).map(function mapFragment(row) {
                return summarizeRow(row, 'compact');
            }).filter(Boolean),
            unresolvedHighlights: unresolvedEventRows.slice(0, 3).map(function mapUnresolved(row) {
                return summarizeRow(row, 'compact');
            }).filter(Boolean),
            triggeredHighlights: triggeredRows.slice(0, 3).map(function mapTriggered(row) {
                return summarizeRow(row, 'compact');
            }).filter(Boolean),
            flashbulbHighlights: flashbulbRows.slice(0, 3).map(function mapFlashbulb(row) {
                return summarizeRow(row, 'compact');
            }).filter(Boolean)
        };
    }

    /**
     * 把某组条目渲染为可直接拼进 Prompt 的小节。
     */
    function buildScenarioSection(title, rows, mode, maxItems) {
        const source = sortRowsByPriority(rows).slice(0, Math.max(0, Math.floor(toFiniteNumber(maxItems, 0))));
        if (source.length === 0) return '';
        const lines = source.map(function mapRow(row) {
            return `- ${summarizeRow(row, mode)}`;
        });
        return `[${toTrimmedString(title) || '记忆线索'}]\n${lines.join('\n')}`;
    }

    /**
     * 根据场景把 recallRows 组织成更易消费的结构化 Prompt。
     */
    function buildScenarioPromptBlock(rows, options) {
        const source = options && typeof options === 'object' ? options : {};
        const presetKey = normalizePreset(source.preset || source.scenario);
        const groups = classifyRecallRows(rows);
        const blocks = [];

        if (presetKey === 'forum_public') {
            blocks.push(buildScenarioSection('公开发言前会想到的近期记忆', groups.events.concat(groups.fragments), 'compact', 4));
            blocks.push(buildScenarioSection('和这次话题直接相关的旧事', groups.triggered, 'compact', 3));
            blocks.push(buildScenarioSection('还没完全过去、可能影响表达分寸的事', groups.unresolvedEvents, 'compact', 2));
        } else if (presetKey === 'music_profile' || presetKey === 'music_playlist') {
            blocks.push(buildScenarioSection('最近一天的情绪线索', groups.events.concat(groups.fragments), 'compact', 4));
            blocks.push(buildScenarioSection('还留在心里的事', groups.unresolvedEvents, 'compact', 2));
        } else if (presetKey === 'creative_generation') {
            blocks.push(buildScenarioSection('能带来灵感的记忆线索', groups.events.concat(groups.fragments), 'default', 6));
        } else if (presetKey === 'food_preference') {
            blocks.push(buildScenarioSection('饮食偏好线索', groups.events.concat(groups.fragments), 'preference', 6));
        } else if (presetKey === 'delivery_scene') {
            blocks.push(buildScenarioSection('最近饮食相关记忆', groups.events.concat(groups.fragments), 'default', 5));
            blocks.push(buildScenarioSection('还没完全过去的情绪或挂念', groups.unresolvedEvents, 'compact', 2));
        } else if (presetKey === 'voice_reflection') {
            blocks.push(buildScenarioSection('最近延续中的情绪线索', groups.events.concat(groups.fragments), 'default', 5));
            blocks.push(buildScenarioSection('这次话题直接碰到的旧事', groups.triggered, 'compact', 3));
        } else if (presetKey === 'diary_topic') {
            blocks.push(buildScenarioSection('最近24小时发生的事', groups.events.concat(groups.fragments), 'compact', 5));
            blocks.push(buildScenarioSection('还没放下的事', groups.unresolvedEvents, 'compact', 3));
            blocks.push(buildScenarioSection('这次主题直接碰到的旧事', groups.triggered, 'compact', 3));
        } else if (presetKey === 'diary_writing') {
            blocks.push(buildScenarioSection('最近两天的重要记忆', groups.events.concat(groups.fragments), 'default', 6));
            blocks.push(buildScenarioSection('还没放下的事', groups.unresolvedEvents, 'default', 3));
            blocks.push(buildScenarioSection('这次主题直接碰到的旧事', groups.triggered, 'compact', 3));
        } else if (presetKey === 'schedule') {
            blocks.push(buildScenarioSection('最近状态', groups.events.concat(groups.fragments), 'compact', 4));
            blocks.push(buildScenarioSection('还没处理完的事', groups.unresolvedEvents, 'compact', 3));
            blocks.push(buildScenarioSection('和当前安排直接相关的记忆', groups.triggered, 'compact', 3));
        } else if (presetKey === 'goal_planning' || presetKey === 'planning') {
            blocks.push(buildScenarioSection('近期状态', groups.events.concat(groups.fragments), 'compact', 5));
            blocks.push(buildScenarioSection('还没解决的牵挂', groups.unresolvedEvents, 'compact', 3));
            blocks.push(buildScenarioSection('印象很深、会持续影响判断的事', groups.flashbulb.concat(groups.triggered), 'compact', 3));
        }

        return blocks.filter(Boolean).join('\n\n');
    }

    /**
     * 构建记事本常驻认知块。
     * 记事本不参与 token 预算压缩，只要存在就完整注入。
     */
    async function buildNotebookPromptBlockForContext(options) {
        const source = options && typeof options === 'object' ? options : {};
        const notebookModule = root && root.HippocampusNotebook && typeof root.HippocampusNotebook === 'object'
            ? root.HippocampusNotebook
            : null;
        if (!notebookModule) {
            return {
                text: '',
                notebook: null,
                snapshot: null
            };
        }
        if (typeof notebookModule.fetchNotebook !== 'function' || typeof notebookModule.buildNotebookPromptBlock !== 'function') {
            return {
                text: '',
                notebook: null,
                snapshot: null
            };
        }

        const safeUserId = toTrimmedString(source.userId);
        const safeCharId = toTrimmedString(source.charId);
        if (!safeUserId || !safeCharId) {
            return {
                text: '',
                notebook: null,
                snapshot: null
            };
        }

        try {
            if (typeof notebookModule.fetchNotebookPromptSnapshot === 'function') {
                const snapshot = await notebookModule.fetchNotebookPromptSnapshot(null, safeUserId, safeCharId);
                return {
                    text: toTrimmedString(snapshot && snapshot.text),
                    notebook: snapshot && snapshot.notebook ? snapshot.notebook : null,
                    snapshot: snapshot && typeof snapshot === 'object' ? snapshot : null
                };
            }

            const notebook = await notebookModule.fetchNotebook(null, safeUserId, safeCharId);
            const snapshot = typeof notebookModule.buildNotebookPromptSnapshot === 'function'
                ? notebookModule.buildNotebookPromptSnapshot(notebook)
                : null;
            const text = snapshot
                ? toTrimmedString(snapshot.text)
                : toTrimmedString(notebookModule.buildNotebookPromptBlock(notebook));
            return {
                text: text,
                notebook: notebook,
                snapshot: snapshot
            };
        } catch (_) {
            return {
                text: '',
                notebook: null,
                snapshot: null
            };
        }
    }

    async function buildRelationshipArcPromptBlockForContext(options) {
        const source = options && typeof options === 'object' ? options : {};
        const relationshipModule = root && root.HippocampusRelationshipArc && typeof root.HippocampusRelationshipArc === 'object'
            ? root.HippocampusRelationshipArc
            : null;
        if (!relationshipModule || typeof relationshipModule.fetchPromptSnapshot !== 'function') {
            return {
                text: '',
                record: null,
                snapshot: null
            };
        }

        const safeUserId = toTrimmedString(source.userId);
        const safeCharId = toTrimmedString(source.charId);
        if (!safeUserId || !safeCharId) {
            return {
                text: '',
                record: null,
                snapshot: null
            };
        }

        try {
            const snapshot = await relationshipModule.fetchPromptSnapshot(null, safeUserId, safeCharId);
            return {
                text: toTrimmedString(snapshot && (snapshot.text || snapshot.promptText)),
                record: snapshot && snapshot.record ? snapshot.record : null,
                snapshot: snapshot && typeof snapshot === 'object' ? snapshot : null
            };
        } catch (_) {
            return {
                text: '',
                record: null,
                snapshot: null
            };
        }
    }

    async function buildContinuityPromptBlockForContext(options) {
        const source = options && typeof options === 'object' ? options : {};
        const continuityModule = root && root.HippocampusContinuity && typeof root.HippocampusContinuity === 'object'
            ? root.HippocampusContinuity
            : null;
        if (!continuityModule || typeof continuityModule.fetchPromptSnapshot !== 'function') {
            return {
                text: '',
                snapshot: null
            };
        }

        const safeUserId = toTrimmedString(source.userId);
        const safeCharId = toTrimmedString(source.charId);
        if (!safeUserId || !safeCharId) {
            return {
                text: '',
                snapshot: null
            };
        }

        try {
            const snapshot = await continuityModule.fetchPromptSnapshot(null, safeUserId, safeCharId);
            return {
                text: toTrimmedString(snapshot && (snapshot.text || snapshot.promptText)),
                snapshot: snapshot && typeof snapshot === 'object' ? snapshot : null
            };
        } catch (_) {
            return {
                text: '',
                snapshot: null
            };
        }
    }

    /**
     * 构建海马体召回块。
     */
    async function buildHippocampusRecallBlock(options) {
        const source = options && typeof options === 'object' ? options : {};
        const client = root && root.HippocampusClient && typeof root.HippocampusClient === 'object'
            ? root.HippocampusClient
            : null;
        if (!client) {
            return {
                text: '',
                rows: []
            };
        }
        if (typeof client.getRecentMemories !== 'function' || typeof client.formatMemoryForPrompt !== 'function') {
            return {
                text: '',
                rows: []
            };
        }

        const safeUserId = toTrimmedString(source.userId);
        const safeCharId = toTrimmedString(source.charId);
        const safeRoomId = toTrimmedString(source.roomId);
        const presetKey = normalizePreset(source.preset);
        const safeQuery = buildScenarioQuery(source, presetKey);
        if (!safeUserId || !safeCharId) {
            return {
                text: '',
                rows: []
            };
        }

        const preset = PRESET_MAP[presetKey];
        const recentLimit = Math.max(1, Math.floor(toFiniteNumber(source.recentLimit, preset.recentLimit)));
        const searchLimit = Math.max(1, Math.floor(toFiniteNumber(source.searchLimit, preset.searchLimit)));
        const surfaceLimit = Math.max(0, Math.floor(toFiniteNumber(source.surfaceLimit, preset.surfaceLimit)));
        const recentHours = Math.max(1, Math.floor(toFiniteNumber(source.recentHours, preset.recentHours)));
        const tokenBudget = Math.max(
            400,
            Math.floor(toFiniteNumber(source.memoryTokenBudget, preset.memoryTokenBudget))
        );

        const tasks = [];
        tasks.push(
            Promise.resolve(client.getRecentMemories(safeUserId, safeCharId, safeRoomId || null, recentHours, recentLimit))
        );
        tasks.push(
            safeQuery && typeof client.searchMemories === 'function'
                ? Promise.resolve(client.searchMemories(safeUserId, safeCharId, safeQuery, safeRoomId || null, { maxTotal: searchLimit }))
                : Promise.resolve([])
        );
        tasks.push(
            surfaceLimit > 0 && typeof client.getSurfaceMemories === 'function'
                ? Promise.resolve(client.getSurfaceMemories(safeUserId, safeCharId, safeRoomId || null, {
                    limit: surfaceLimit
                }))
                : Promise.resolve([])
        );

        const settled = await Promise.allSettled(tasks);
        const recentRows = settled[0].status === 'fulfilled' && Array.isArray(settled[0].value) ? settled[0].value : [];
        const searchRows = settled[1].status === 'fulfilled' && Array.isArray(settled[1].value) ? settled[1].value : [];
        const surfaceRows = settled[2].status === 'fulfilled' && Array.isArray(settled[2].value) ? settled[2].value : [];
        const mergedRows = mergeRecallRows([searchRows, recentRows, surfaceRows]);

        let remaining = tokenBudget;
        const lines = [];
        for (let i = 0; i < mergedRows.length; i += 1) {
            const row = mergedRows[i];
            const line = toTrimmedString(client.formatMemoryForPrompt(row));
            if (!line) continue;
            const tokens = estimateTokens(line);
            if (tokens > remaining) continue;
            lines.push(line);
            remaining -= tokens;
            if (remaining <= 0) break;
        }

        const text = lines.length > 0 ? `[海马体补充记忆]\n${lines.join('\n')}` : '';
        return {
            text: text,
            rows: mergedRows,
            query: safeQuery,
            preset: presetKey
        };
    }

    /**
     * 主入口：构建“传统记忆底座 + 海马体补充 + 实时上下文”。
     */
    async function buildMixedMemoryContext(options) {
        const source = options && typeof options === 'object' ? options : {};
        const preset = normalizePreset(source.preset);
        const contact = source.contact && typeof source.contact === 'object' ? source.contact : {};
        const charId = toTrimmedString(source.charId || source.char_id || contact.id);
        const roomId = toTrimmedString(source.roomId || source.room_id || '');
        const userId = getUserId(source);
        const query = toTrimmedString(source.query || source.topic || '');
        const legacyMemoryText = buildLegacyMemoryText(contact, source);
        const realtimeContext = toTrimmedString(source.realtimeContext || source.realtime_context);
        const notebookContext = await buildNotebookPromptBlockForContext({
            userId: userId,
            charId: charId
        });
        const relationshipArcContext = await buildRelationshipArcPromptBlockForContext({
            userId: userId,
            charId: charId
        });
        const continuityContext = await buildContinuityPromptBlockForContext({
            userId: userId,
            charId: charId
        });
        const notebookSections = notebookContext.snapshot && notebookContext.snapshot.sections && typeof notebookContext.snapshot.sections === 'object'
            ? notebookContext.snapshot.sections
            : {};
        const redlinePromptBlock = toTrimmedString(notebookSections.redlinesText);
        const stableNotebookPromptBlock = toTrimmedString(
            notebookSections.stableNotebookText
            || [
                toTrimmedString(notebookSections.mustRememberText),
                toTrimmedString(notebookSections.profilesText)
            ].filter(Boolean).join('\n\n')
        );

        const hippo = await buildHippocampusRecallBlock({
            preset: preset,
            userId: userId,
            charId: charId,
            roomId: roomId,
            query: query,
            recentHours: source.recentHours,
            recentLimit: source.recentLimit,
            searchLimit: source.searchLimit,
            surfaceLimit: source.surfaceLimit,
            memoryTokenBudget: source.memoryTokenBudget
        });
        const classifiedRows = classifyRecallRows(hippo.rows);
        const scenarioPromptBlock = buildScenarioPromptBlock(hippo.rows, {
            preset: source.scenario || preset
        });

        const blocks = [];
        if (legacyMemoryText) blocks.push(legacyMemoryText);
        if (redlinePromptBlock) blocks.push(redlinePromptBlock);
        if (relationshipArcContext.text) blocks.push(relationshipArcContext.text);
        if (stableNotebookPromptBlock) blocks.push(stableNotebookPromptBlock);
        if (continuityContext.text) blocks.push(continuityContext.text);
        if (hippo.text) blocks.push(hippo.text);
        if (realtimeContext) blocks.push(`[实时上下文]\n${realtimeContext}`);

        return {
            preset: preset,
            userId: userId,
            charId: charId,
            roomId: roomId || null,
            query: query,
            effectiveQuery: hippo.query || query,
            legacyMemoryText: legacyMemoryText,
            notebookPromptBlock: notebookContext.text,
            redlinePromptBlock: redlinePromptBlock,
            stableNotebookPromptBlock: stableNotebookPromptBlock,
            notebook: notebookContext.notebook,
            notebookPromptSnapshot: notebookContext.snapshot || null,
            relationshipArcPromptBlock: relationshipArcContext.text,
            relationshipArc: relationshipArcContext.record,
            relationshipArcSnapshot: relationshipArcContext.snapshot || null,
            continuityPromptBlock: continuityContext.text,
            continuitySnapshot: continuityContext.snapshot || null,
            hippocampusRecallBlock: hippo.text,
            mergedMemoryContext: blocks.join('\n\n'),
            recallRows: hippo.rows,
            eventRows: classifiedRows.events,
            fragmentRows: classifiedRows.fragments,
            unresolvedEventRows: classifiedRows.unresolvedEvents,
            triggeredRows: classifiedRows.triggered,
            flashbulbRows: classifiedRows.flashbulb,
            scenarioPromptBlock: [redlinePromptBlock, relationshipArcContext.text, stableNotebookPromptBlock, continuityContext.text, scenarioPromptBlock].filter(Boolean).join('\n\n')
        };
    }

    /**
     * 面向老功能的高阶入口：除了传统混合上下文外，再额外产出更结构化的场景记忆包。
     */
    async function buildScenarioMemoryPacket(options) {
        const mixed = await buildMixedMemoryContext(options);
        const source = options && typeof options === 'object' ? options : {};
        const attachmentProfile = await resolveAttachmentProfile(source);
        const attachmentStyle = normalizeAttachmentStyle(
            attachmentProfile && attachmentProfile.style
        ) || resolveAttachmentStyle(source);
        const promptSections = [];
        if (mixed.legacyMemoryText) promptSections.push(mixed.legacyMemoryText);
        if (mixed.scenarioPromptBlock) promptSections.push(mixed.scenarioPromptBlock);
        else if (mixed.hippocampusRecallBlock) promptSections.push(mixed.hippocampusRecallBlock);
        if (toTrimmedString(source.realtimeContext || source.realtime_context)) {
            promptSections.push(`[实时上下文]\n${toTrimmedString(source.realtimeContext || source.realtime_context)}`);
        }

        let packet = Object.assign({}, mixed, {
            attachmentStyle: attachmentStyle || '',
            attachmentProfile: attachmentProfile
        });
        const attachmentModule = root && root.HippocampusAttachment && typeof root.HippocampusAttachment === 'object'
            ? root.HippocampusAttachment
            : null;
        if (attachmentStyle && attachmentModule && typeof attachmentModule.adjustScenarioPacketForAttachment === 'function') {
            packet = attachmentModule.adjustScenarioPacketForAttachment(packet, attachmentStyle) || packet;
        }
        const scenarioPreset = source.scenario || packet.preset || mixed.preset || 'current_mood';
        const rebuiltScenarioPromptBlock = buildScenarioPromptBlock(
            Array.isArray(packet.recallRows) ? packet.recallRows : [],
            { preset: scenarioPreset }
        );
        const notebookPromptBlock = toTrimmedString(packet.notebookPromptBlock || mixed.notebookPromptBlock);
        const redlinePromptBlock = toTrimmedString(packet.redlinePromptBlock || mixed.redlinePromptBlock);
        const stableNotebookPromptBlock = toTrimmedString(packet.stableNotebookPromptBlock || mixed.stableNotebookPromptBlock);
        const relationshipArcPromptBlock = toTrimmedString(packet.relationshipArcPromptBlock || mixed.relationshipArcPromptBlock);
        const continuityPromptBlock = toTrimmedString(packet.continuityPromptBlock || mixed.continuityPromptBlock);
        const scenarioPromptBase = rebuiltScenarioPromptBlock
            || toTrimmedString(packet.hippocampusRecallBlock || mixed.hippocampusRecallBlock);
        const attachmentBiasPromptBlock = buildAttachmentBiasPromptBlock(packet.attachmentBiasSummary);
        const finalScenarioPromptBlock = [
            redlinePromptBlock || notebookPromptBlock,
            relationshipArcPromptBlock,
            stableNotebookPromptBlock,
            continuityPromptBlock,
            scenarioPromptBase,
            attachmentBiasPromptBlock
        ]
            .filter(Boolean)
            .join('\n\n');
        promptSections.length = 0;
        if (packet.legacyMemoryText || mixed.legacyMemoryText) {
            promptSections.push(packet.legacyMemoryText || mixed.legacyMemoryText);
        }
        if (finalScenarioPromptBlock) {
            promptSections.push(finalScenarioPromptBlock);
        }
        if (toTrimmedString(source.realtimeContext || source.realtime_context)) {
            promptSections.push(`[实时上下文]\n${toTrimmedString(source.realtimeContext || source.realtime_context)}`);
        }
        packet = Object.assign({}, packet, {
            scenarioPromptBlock: finalScenarioPromptBlock,
            attachmentBiasPromptBlock: attachmentBiasPromptBlock,
            scenarioPromptContext: promptSections.join('\n\n')
        });
        packet = Object.assign({}, packet, {
            summary: summarizeScenarioPacket(packet)
        });
        return packet;
    }

    async function buildMusicProfileContext(options) {
        return buildScenarioMemoryPacket(Object.assign({}, options, {
            preset: 'music_profile'
        }));
    }

    async function buildForumPublicContext(options) {
        return buildScenarioMemoryPacket(Object.assign({}, options, {
            preset: 'forum_public'
        }));
    }

    async function buildMusicPlaylistContext(options) {
        return buildScenarioMemoryPacket(Object.assign({}, options, {
            preset: 'music_playlist'
        }));
    }

    async function buildSunoPromptContext(options) {
        return buildScenarioMemoryPacket(Object.assign({}, options, {
            preset: 'creative_generation'
        }));
    }

    async function buildFoodPreferenceContext(options) {
        return buildScenarioMemoryPacket(Object.assign({}, options, {
            preset: 'food_preference'
        }));
    }

    async function buildDeliveryContext(options) {
        return buildScenarioMemoryPacket(Object.assign({}, options, {
            preset: 'delivery_scene'
        }));
    }

    async function buildVoiceReflectionContext(options) {
        return buildScenarioMemoryPacket(Object.assign({}, options, {
            preset: 'voice_reflection'
        }));
    }

    async function buildDiaryTopicContext(options) {
        return buildScenarioMemoryPacket(Object.assign({}, options, {
            preset: 'diary_topic'
        }));
    }

    async function buildDiaryWritingContext(options) {
        return buildScenarioMemoryPacket(Object.assign({}, options, {
            preset: 'diary_writing'
        }));
    }

    async function buildScheduleContext(options) {
        return buildScenarioMemoryPacket(Object.assign({}, options, {
            preset: 'schedule'
        }));
    }

    async function buildGoalPlanningContext(options) {
        return buildScenarioMemoryPacket(Object.assign({}, options, {
            preset: 'goal_planning'
        }));
    }

    return {
        normalizePreset: normalizePreset,
        buildMixedMemoryContext: buildMixedMemoryContext,
        buildScenarioMemoryPacket: buildScenarioMemoryPacket,
        buildLegacyMemoryText: buildLegacyMemoryText,
        summarizeRow: summarizeRow,
        summarizeScenarioPacket: summarizeScenarioPacket,
        classifyRecallRows: classifyRecallRows,
        buildScenarioPromptBlock: buildScenarioPromptBlock,
        resolveAttachmentProfile: resolveAttachmentProfile,
        buildForumPublicContext: buildForumPublicContext,
        buildMusicProfileContext: buildMusicProfileContext,
        buildMusicPlaylistContext: buildMusicPlaylistContext,
        buildSunoPromptContext: buildSunoPromptContext,
        buildFoodPreferenceContext: buildFoodPreferenceContext,
        buildDeliveryContext: buildDeliveryContext,
        buildVoiceReflectionContext: buildVoiceReflectionContext,
        buildDiaryTopicContext: buildDiaryTopicContext,
        buildDiaryWritingContext: buildDiaryWritingContext,
        buildScheduleContext: buildScheduleContext,
        buildGoalPlanningContext: buildGoalPlanningContext
    };
}
