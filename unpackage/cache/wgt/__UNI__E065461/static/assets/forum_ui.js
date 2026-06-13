(() => {
    if (typeof window === 'undefined') return;

    const ForumUI = {
        storage: null,
        viewerUserId: null,
        projectBridge: null,
        projectCharMeta: new Map(),
        projectCharSyncPromise: null,
        projectCharLastSyncAt: 0,
        integrationAdapter: null,
        reviewCache: new Map(),
        initPromise: null,
        isReady: false,
        initError: null,

        // 导航历史栈
        history: [],

        // 当前状态数据缓存
        state: {
            currentSection: null, // 当前选中的分区对象
            currentChannel: null, // 当前选中的频道对象
            currentThread: null,  // 当前选中的帖子对象
            currentUser: null,    // 当前查看的用户对象
            currentChar: null,    // 当前查看的角色对象
            activeReplyCommentId: null, // 当前展开楼中楼回复输入框的评论
            currentNotificationTab: 'engagement'
        },

        notificationState: {
            unreadCount: 0,
            pageSize: 30,
            feeds: {
                engagement: { offset: 0, hasMore: false, items: [], page: 1, pageSize: 30, totalPages: 1, totalCount: 0 },
                mention: { offset: 0, hasMore: false, items: [], page: 1, pageSize: 30, totalPages: 1, totalCount: 0 },
                char: { offset: 0, hasMore: false, items: [], page: 1, pageSize: 20, totalPages: 1, totalCount: 0 }
            }
        },

        settingsState: null,
        actionInFlight: {
            post: false,
            browse: false,
            reply: false,
            resetmemory: false,
            selfcheck: false,
            pushenable: false,
            disableall: false,
            flushqueue: false
        },
        workerOwnedCharSettingKeys: [
            'agentEnabled',
            'autoBrowseEnabled',
            'autoPostEnabled',
            'replyOnBrowse',
            'browseInterval',
            'postInterval',
            'browseTimes',
            'postTimes'
        ],
        agentApiProfileSyncSignature: '',
        settingsAutoSaveTimer: null,
        mentionPreviewTimers: new Map(),
        threadViewState: null,
        profileViewState: null,
        channelListState: {
            channelId: '',
            sortBy: 'newest',
            page: 1,
            pageSize: 15
        },
        globalFeedState: {
            sortBy: 'newest',
            page: 1,
            pageSize: 15
        },
        backendConfigStorageKeys: {
            supabaseUrl: 'forum_backend_supabase_url',
            supabaseKey: 'forum_backend_supabase_key',
            workerToken: 'forum_backend_worker_token'
        },

        el: {},

        ensureThreadViewState(threadId, { reset = false } = {}) {
            const safeThreadId = String(threadId || '').trim();
            if (!safeThreadId) {
                this.threadViewState = null;
                return null;
            }
            const shouldReset = reset
                || !this.threadViewState
                || String(this.threadViewState.threadId || '') !== safeThreadId;
            if (shouldReset) {
                this.threadViewState = {
                    threadId: safeThreadId,
                    topLevelSortBy: 'oldest',
                    topLevelPage: 1,
                    topLevelPageSize: 10,
                    replyPageSize: 10,
                    expandedReplyIds: new Set(),
                    replyPageByParent: new Map(),
                    commentById: new Map()
                };
            }
            return this.threadViewState;
        },

        resetThreadViewState(threadId = null) {
            if (!threadId) {
                this.threadViewState = null;
                return;
            }
            this.ensureThreadViewState(threadId, { reset: true });
        },

        getAvatarEditorOptions() {
            const toOption = (value, label = '') => ({
                value,
                label: label || value
            });
            const colorNameMap = {
                '262e33': '曜石黑',
                '65c9ff': '天空蓝',
                '5199e4': '湖蓝',
                '25557c': '深海蓝',
                'e6e6e6': '雾灰',
                '929598': '石墨灰',
                '3c4f5c': '蓝灰',
                'b1e2ff': '冰川蓝',
                'a7ffc4': '薄荷绿',
                'ffdeb5': '奶油杏',
                'ffafb9': '樱花粉',
                'ffffb1': '柠檬奶黄',
                'ff488e': '玫红',
                'ff5c5c': '珊瑚红',
                'ffffff': '纯白',
                'a55728': '暖棕',
                '2c1b18': '墨棕黑',
                'b58143': '焦糖棕',
                'd6b370': '金棕',
                '724133': '深栗棕',
                '4a312c': '胡桃棕',
                'f59797': '粉棕',
                'ecdcbf': '亚麻金',
                'c93305': '赤棕',
                'e8e1e1': '银灰',
                '614335': '深棕肤',
                'd08b5b': '中棕肤',
                'ae5d29': '古铜肤',
                'edb98a': '蜜桃肤',
                'ffdbb4': '白皙肤',
                'fd9841': '琥珀肤',
                'f8d25c': '暖黄肤'
            };
            const colorOption = (hex) => ({
                value: hex,
                label: colorNameMap[String(hex || '').toLowerCase()] || '自定义色'
            });
            const sharedColorPalette = [
                '262e33',
                '65c9ff',
                '5199e4',
                '25557c',
                'e6e6e6',
                '929598',
                '3c4f5c',
                'b1e2ff',
                'a7ffc4',
                'ffdeb5',
                'ffafb9',
                'ffffb1',
                'ff488e',
                'ff5c5c',
                'ffffff'
            ].map(colorOption);

            return {
                backgroundColor: [
                    toOption('transparent', '透明'),
                    ...sharedColorPalette
                ],
                top: [
                    toOption('noHair', '光头'),
                    toOption('hat', '帽子'),
                    toOption('hijab', '头巾'),
                    toOption('turban', '包头帽'),
                    toOption('winterHat1', '冬帽 1'),
                    toOption('winterHat02', '冬帽 2'),
                    toOption('winterHat03', '冬帽 3'),
                    toOption('winterHat04', '冬帽 4'),
                    toOption('bob', '波波头'),
                    toOption('bun', '发髻'),
                    toOption('curly', '卷发 1'),
                    toOption('curvy', '卷发 2'),
                    toOption('dreads', '脏辫 1'),
                    toOption('dreads01', '脏辫 2'),
                    toOption('dreads02', '脏辫 3'),
                    toOption('frida', 'Frida'),
                    toOption('fro', '爆炸头'),
                    toOption('froBand', '爆炸头发带'),
                    toOption('longButNotTooLong', '中长发'),
                    toOption('miaWallace', '齐肩直发'),
                    toOption('shavedSides', '两侧剃短'),
                    toOption('shavenSides', '两侧剃短（变体）'),
                    toOption('straight01', '直发 1'),
                    toOption('straight02', '直发 2'),
                    toOption('straightAndStrand', '直发单刘海'),
                    toOption('frizzle', '炸毛卷'),
                    toOption('shaggy', '蓬松'),
                    toOption('shaggyMullet', '蓬松鲻鱼头'),
                    toOption('shortCurly', '短卷发'),
                    toOption('shortFlat', '短发（平）'),
                    toOption('shortRound', '短发（圆）'),
                    toOption('shortWaved', '短发（波浪）'),
                    toOption('sides', '中分'),
                    toOption('theCaesar', '凯撒短发'),
                    toOption('theCaesarAndSidePart', '凯撒侧分'),
                    toOption('bigHair', '大波浪')
                ],
                hairColor: [
                    'a55728',
                    '2c1b18',
                    'b58143',
                    'd6b370',
                    '724133',
                    '4a312c',
                    'f59797',
                    'ecdcbf',
                    'c93305',
                    'e8e1e1'
                ].map(colorOption),
                hatColor: sharedColorPalette,
                eyebrows: [
                    toOption('angryNatural', '自然愤怒'),
                    toOption('defaultNatural', '自然默认'),
                    toOption('flatNatural', '自然平眉'),
                    toOption('frownNatural', '自然皱眉'),
                    toOption('raisedExcitedNatural', '自然挑眉'),
                    toOption('sadConcernedNatural', '自然担忧'),
                    toOption('unibrowNatural', '自然连眉'),
                    toOption('upDownNatural', '自然高低眉'),
                    toOption('angry', '愤怒'),
                    toOption('default', '默认'),
                    toOption('raisedExcited', '挑眉'),
                    toOption('sadConcerned', '担忧'),
                    toOption('upDown', '高低眉')
                ],
                eyes: [
                    toOption('closed', '闭眼'),
                    toOption('cry', '哭哭'),
                    toOption('default', '默认'),
                    toOption('eyeRoll', '翻白眼'),
                    toOption('happy', '开心'),
                    toOption('hearts', '爱心眼'),
                    toOption('side', '侧视'),
                    toOption('squint', '眯眼'),
                    toOption('surprised', '惊讶'),
                    toOption('winkWacky', '搞怪眨眼'),
                    toOption('wink', '眨眼'),
                    toOption('xDizzy', '眩晕眼')
                ],
                mouth: [
                    toOption('concerned', '担忧'),
                    toOption('default', '默认'),
                    toOption('disbelief', '无语'),
                    toOption('eating', '咀嚼'),
                    toOption('grimace', '咧嘴'),
                    toOption('sad', '难过'),
                    toOption('screamOpen', '张口惊讶'),
                    toOption('serious', '严肃'),
                    toOption('smile', '微笑'),
                    toOption('tongue', '吐舌'),
                    toOption('twinkle', '闪亮笑'),
                    toOption('vomit', '呕吐')
                ],
                accessories: [
                    toOption('none', '无'),
                    toOption('kurt', 'Kurt 眼镜'),
                    toOption('prescription01', '近视镜 1'),
                    toOption('prescription02', '近视镜 2'),
                    toOption('round', '圆框眼镜'),
                    toOption('sunglasses', '墨镜'),
                    toOption('wayfarers', '方框眼镜'),
                    toOption('eyepatch', '眼罩')
                ],
                accessoriesColor: sharedColorPalette,
                facialHair: [
                    toOption('none', '无'),
                    toOption('beardLight', '浅胡茬'),
                    toOption('beardMajestic', '浓胡子'),
                    toOption('beardMedium', '中等胡子'),
                    toOption('moustacheFancy', '精致小胡子'),
                    toOption('moustacheMagnum', '粗胡子')
                ],
                facialHairColor: [
                    'a55728',
                    '2c1b18',
                    'b58143',
                    'd6b370',
                    '724133',
                    '4a312c',
                    'f59797',
                    'ecdcbf',
                    'c93305',
                    'e8e1e1'
                ].map(colorOption),
                clothing: [
                    toOption('blazerAndShirt', '西装+衬衫'),
                    toOption('blazerAndSweater', '西装+毛衣'),
                    toOption('collarAndSweater', '翻领毛衣'),
                    toOption('graphicShirt', '图案 T 恤'),
                    toOption('hoodie', '连帽衫'),
                    toOption('overall', '背带装'),
                    toOption('shirtCrewNeck', '圆领上衣'),
                    toOption('shirtScoopNeck', '宽领上衣'),
                    toOption('shirtVNeck', 'V 领上衣')
                ],
                clothesColor: [
                    '262e33',
                    '65c9ff',
                    '5199e4',
                    '25557c',
                    'e6e6e6',
                    '929598',
                    '3c4f5c',
                    'b1e2ff',
                    'a7ffc4',
                    'ffafb9',
                    'ffffb1',
                    'ff488e',
                    'ff5c5c',
                    'ffffff'
                ].map(colorOption),
                clothingGraphic: [
                    toOption('none', '无'),
                    toOption('bat', '蝙蝠'),
                    toOption('bear', '小熊'),
                    toOption('cumbia', '律动字样'),
                    toOption('deer', '小鹿'),
                    toOption('diamond', '菱形'),
                    toOption('hola', 'Hola 字样'),
                    toOption('pizza', '披萨'),
                    toOption('resist', 'Resist 字样'),
                    toOption('skull', '骷髅'),
                    toOption('skullOutline', '骷髅线稿')
                ],
                skinColor: [
                    '614335',
                    'd08b5b',
                    'ae5d29',
                    'edb98a',
                    'ffdbb4',
                    'fd9841',
                    'f8d25c'
                ].map(colorOption)
            };
        },

        getDefaultAvatarTraits() {
            return {
                backgroundColor: 'transparent',
                top: 'shortFlat',
                hairColor: '724133',
                hatColor: '3c4f5c',
                eyebrows: 'default',
                eyes: 'default',
                mouth: 'smile',
                accessories: 'none',
                accessoriesColor: '262e33',
                facialHair: 'none',
                facialHairColor: '724133',
                clothing: 'hoodie',
                clothesColor: '65c9ff',
                clothingGraphic: 'none',
                skinColor: 'ffdbb4'
            };
        },

        normalizeAvatarTrait(field, value) {
            const options = this.getAvatarEditorOptions()[field] || [];
            const normalized = String(value || '').split(',')[0];
            return options.some((item) => item.value === normalized) ? normalized : null;
        },

        normalizeAvatarTraits(rawTraits) {
            const defaults = this.getDefaultAvatarTraits();
            const source = rawTraits && typeof rawTraits === 'object' ? rawTraits : {};
            const next = {};
            Object.keys(defaults).forEach((field) => {
                next[field] = this.normalizeAvatarTrait(field, source[field]) || defaults[field];
            });
            return next;
        },

        parseBooleanSetting(value, fallback = false) {
            if (value === undefined || value === null) return Boolean(fallback);
            if (typeof value === 'boolean') return value;
            if (typeof value === 'number') return value !== 0;
            const raw = String(value).trim().toLowerCase();
            if (!raw) return Boolean(fallback);
            if (['1', 'true', 'yes', 'on', 'y'].includes(raw)) return true;
            if (['0', 'false', 'no', 'off', 'n'].includes(raw)) return false;
            return Boolean(fallback);
        },

        isAgentTemporarilyDisabled() {
            return false;
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

        getAvatarSeed(target, entity = null) {
            if (target === 'user') {
                return String(
                    entity?.id
                    || this.viewerUserId
                    || this.state.userId
                    || entity?.username
                    || 'forum_user'
                );
            }
            return String(
                entity?.id
                || this.settingsState?.selectedCharId
                || this.state.charId
                || entity?.realName
                || 'forum_char'
            );
        },

        buildAvatarUrlFromTraits(traits, seed) {
            const finalTraits = this.normalizeAvatarTraits(traits);
            const baseSeed = String(seed || 'forum_avatar');
            const params = new URLSearchParams();
            params.set('seed', baseSeed);
            params.set('size', '128');
            if (finalTraits.backgroundColor && finalTraits.backgroundColor !== 'transparent') {
                params.set('backgroundType', 'solid');
                params.set('backgroundColor', finalTraits.backgroundColor);
            }
            params.set('top', finalTraits.top);
            params.set('hairColor', finalTraits.hairColor);
            params.set('hatColor', finalTraits.hatColor);
            params.set('eyebrows', finalTraits.eyebrows);
            params.set('eyes', finalTraits.eyes);
            params.set('mouth', finalTraits.mouth);
            params.set('clothing', finalTraits.clothing);
            params.set('clothesColor', finalTraits.clothesColor);
            params.set('skinColor', finalTraits.skinColor);

            if (finalTraits.clothingGraphic && finalTraits.clothingGraphic !== 'none') {
                params.set('clothingGraphic', finalTraits.clothingGraphic);
            }

            if (finalTraits.accessories === 'none') {
                params.set('accessoriesProbability', '0');
            } else {
                params.set('accessories', finalTraits.accessories);
                params.set('accessoriesColor', finalTraits.accessoriesColor);
                params.set('accessoriesProbability', '100');
            }

            if (finalTraits.facialHair === 'none') {
                params.set('facialHairProbability', '0');
            } else {
                params.set('facialHair', finalTraits.facialHair);
                params.set('facialHairColor', finalTraits.facialHairColor);
                params.set('facialHairProbability', '100');
            }

            return `https://api.dicebear.com/9.x/avataaars/svg?${params.toString()}`;
        },

        parseAvatarTraitsFromUrl(url) {
            const input = String(url || '').trim();
            if (!input) return null;
            try {
                const parsed = new URL(input, window.location.origin);
                if (!parsed.hostname.includes('dicebear.com')) return null;
                const styleMatch = parsed.pathname.match(/\/9\.x\/([^/]+)\/svg/i);
                if (!styleMatch) return null;
                const avatarSetFromPath = String(styleMatch[1] || '').trim().toLowerCase();
                if (avatarSetFromPath !== 'avataaars') return null;
                const params = parsed.searchParams;
                const accessoriesOff = params.get('accessoriesProbability') === '0';
                const facialHairOff = params.get('facialHairProbability') === '0';
                const traits = this.normalizeAvatarTraits({
                    backgroundColor: params.get('backgroundColor') || 'transparent',
                    top: params.get('top'),
                    hairColor: params.get('hairColor'),
                    hatColor: params.get('hatColor'),
                    eyebrows: params.get('eyebrows'),
                    eyes: params.get('eyes'),
                    mouth: params.get('mouth'),
                    accessories: accessoriesOff ? 'none' : params.get('accessories'),
                    accessoriesColor: params.get('accessoriesColor'),
                    facialHair: facialHairOff ? 'none' : params.get('facialHair'),
                    facialHairColor: params.get('facialHairColor'),
                    clothing: params.get('clothing'),
                    clothesColor: params.get('clothesColor'),
                    clothingGraphic: params.get('clothingGraphic') || 'none',
                    skinColor: params.get('skinColor')
                });
                return {
                    seed: params.get('seed') || '',
                    traits
                };
            } catch (_error) {
                return null;
            }
        },

        getUserForumAvatar(user) {
            const u = user && typeof user === 'object' ? user : null;
            const rawUrl = String(
                u?.settings?.forumAvatarUrl
                || u?.settings?.avatarUrl
                || u?.avatarUrl
                || ''
            ).trim();
            if (rawUrl) return rawUrl;
            const traits = this.normalizeAvatarTraits(
                u?.settings?.forumAvatarTraits
                || u?.settings?.avatarTraits
                || null
            );
            return this.buildAvatarUrlFromTraits(traits, this.getAvatarSeed('user', u));
        },

        getCharForumAvatar(char) {
            const c = char && typeof char === 'object' ? char : null;
            const rawUrl = String(
                c?.settings?.forumAvatarUrl
                || c?.settings?.avatarUrl
                || c?.avatarUrl
                || ''
            ).trim();
            if (rawUrl) return rawUrl;
            const traits = this.normalizeAvatarTraits(
                c?.settings?.forumAvatarTraits
                || c?.settings?.avatarTraits
                || null
            );
            return this.buildAvatarUrlFromTraits(traits, this.getAvatarSeed('char', c));
        },

        ensureUserAvatarSettings(user) {
            this.ensureSettingsState();
            if (!this.settingsState.userAvatarTraits || typeof this.settingsState.userAvatarTraits !== 'object') {
                const parsed = this.parseAvatarTraitsFromUrl(
                    user?.settings?.forumAvatarUrl
                    || user?.settings?.avatarUrl
                    || ''
                );
                this.settingsState.userAvatarTraits = this.normalizeAvatarTraits(
                    user?.settings?.forumAvatarTraits
                    || parsed?.traits
                    || null
                );
            }
            const currentUserAvatarUrl = String(this.settingsState.userAvatarUrl || '').trim();
            if (!currentUserAvatarUrl) {
                const rawUrl = String(user?.settings?.forumAvatarUrl || user?.settings?.avatarUrl || '').trim();
                this.settingsState.userAvatarUrl = rawUrl
                    || this.buildAvatarUrlFromTraits(
                        this.settingsState.userAvatarTraits,
                        this.getAvatarSeed('user', user)
                    );
            }
            return {
                avatarUrl: this.settingsState.userAvatarUrl,
                avatarTraits: this.settingsState.userAvatarTraits
            };
        },

        buildAvatarEditorHtml(target, stateLike = {}) {
            const options = this.getAvatarEditorOptions();
            const traits = this.normalizeAvatarTraits(stateLike.avatarTraits);
            const avatarUrl = String(stateLike.avatarUrl || '').trim()
                || this.buildAvatarUrlFromTraits(traits, this.getAvatarSeed(target));
            const safe = ForumLink.utils.escapeHtml;
            const groups = [
                { key: 'backgroundColor', label: '背景颜色' },
                { key: 'top', label: '发型' },
                { key: 'hairColor', label: '发色' },
                { key: 'hatColor', label: '帽子颜色' },
                { key: 'eyebrows', label: '眉毛' },
                { key: 'eyes', label: '眼睛' },
                { key: 'mouth', label: '嘴型' },
                { key: 'accessories', label: '配饰' },
                { key: 'accessoriesColor', label: '配饰颜色' },
                { key: 'facialHair', label: '胡须' },
                { key: 'facialHairColor', label: '胡须颜色' },
                { key: 'clothing', label: '服装' },
                { key: 'clothesColor', label: '衣服颜色' },
                { key: 'clothingGraphic', label: '衣服图案' },
                { key: 'skinColor', label: '肤色' }
            ];
            const selectHtml = groups.map((group) => {
                const selectId = `forum-avatar-${target}-${group.key}`;
                const optionHtml = (options[group.key] || []).map((item) => `
                        <option value="${safe(item.value)}" ${traits[group.key] === item.value ? 'selected' : ''}>${safe(item.label)}</option>
                    `).join('');
                return `
                    <label class="forum-avatar-field">
                        <span class="forum-avatar-field-label">${safe(group.label)}</span>
                        <select class="forum-select" id="${selectId}" onchange="ForumUI.updateAvatarTrait('${target}', '${group.key}', this.value)">
                            ${optionHtml}
                        </select>
                    </label>
                `;
            }).join('');

            return `
                <div class="forum-avatar-editor">
                    <div class="forum-avatar-preview-wrap">
                        <img class="forum-avatar-preview" id="forum-avatar-preview-${target}" src="${safe(avatarUrl)}" alt="头像预览">
                    </div>
                    <div class="forum-avatar-grid">
                        ${selectHtml}
                    </div>
                    <div class="forum-avatar-actions">
                        <button class="forum-action-btn forum-btn-ghost" onclick="ForumUI.randomizeAvatar('${target}')">随机</button>
                        <button class="forum-action-btn forum-btn-ghost" onclick="ForumUI.resetAvatar('${target}')">重置</button>
                    </div>
                    <div class="forum-avatar-url">
                        <input type="text" class="forum-input" id="forum-avatar-url-${target}" value="${safe(avatarUrl)}" placeholder="可直接粘贴任意图片 URL（http/https）" oninput="ForumUI.updateAvatarUrl('${target}', this.value)">
                    </div>
                    <div class="forum-avatar-tip">当前仅保留“经典捏脸”模式：支持组件细调，也支持手动粘贴任意外链图片 URL 作为论坛头像。</div>
                </div>
            `;
        },

        getAvatarStateRef(target) {
            this.ensureSettingsState();
            if (target === 'user') {
                return {
                    getSeed: () => this.getAvatarSeed('user'),
                    getTraits: () => this.normalizeAvatarTraits(this.settingsState.userAvatarTraits),
                    setTraits: (nextTraits) => { this.settingsState.userAvatarTraits = this.normalizeAvatarTraits(nextTraits); },
                    getUrl: () => String(this.settingsState.userAvatarUrl || '').trim(),
                    setUrl: (nextUrl) => { this.settingsState.userAvatarUrl = String(nextUrl || ''); }
                };
            }
            const charId = String(this.settingsState.selectedCharId || '');
            const charSettings = charId ? this.settingsState.chars?.[charId] : null;
            if (!charSettings) return null;
            return {
                getSeed: () => this.getAvatarSeed('char'),
                getTraits: () => this.normalizeAvatarTraits(charSettings.avatarTraits),
                setTraits: (nextTraits) => { charSettings.avatarTraits = this.normalizeAvatarTraits(nextTraits); },
                getUrl: () => String(charSettings.avatarUrl || '').trim(),
                setUrl: (nextUrl) => { charSettings.avatarUrl = String(nextUrl || ''); }
            };
        },

        applyAvatarStateToDom(target) {
            const ref = this.getAvatarStateRef(target);
            if (!ref) return;
            const traits = ref.getTraits();
            const url = ref.getUrl() || this.buildAvatarUrlFromTraits(traits, ref.getSeed());

            const previewEl = document.getElementById(`forum-avatar-preview-${target}`);
            if (previewEl) previewEl.src = url;

            const urlEl = document.getElementById(`forum-avatar-url-${target}`);
            if (urlEl && urlEl.value !== url) urlEl.value = url;

            Object.keys(this.getDefaultAvatarTraits()).forEach((field) => {
                const node = document.getElementById(`forum-avatar-${target}-${field}`);
                if (node && node.value !== traits[field]) {
                    node.value = traits[field];
                }
            });
        },

        updateAvatarTrait(target, field, value) {
            const ref = this.getAvatarStateRef(target);
            if (!ref) return;
            const traits = ref.getTraits();
            const normalized = this.normalizeAvatarTrait(field, value);
            if (normalized) traits[field] = normalized;
            ref.setTraits(traits);
            ref.setUrl(this.buildAvatarUrlFromTraits(traits, ref.getSeed()));
            this.applyAvatarStateToDom(target);
        },

        updateAvatarUrl(target, value) {
            const ref = this.getAvatarStateRef(target);
            if (!ref) return;
            const input = String(value || '').trim();
            if (input) {
                ref.setUrl(input);
                const parsed = this.parseAvatarTraitsFromUrl(input);
                if (parsed?.traits) ref.setTraits(parsed.traits);
            } else {
                const traits = ref.getTraits();
                ref.setUrl(this.buildAvatarUrlFromTraits(traits, ref.getSeed()));
            }
            this.applyAvatarStateToDom(target);
        },

        randomizeAvatar(target) {
            const ref = this.getAvatarStateRef(target);
            if (!ref) return;
            const options = this.getAvatarEditorOptions();
            const next = this.getDefaultAvatarTraits();
            Object.keys(next).forEach((field) => {
                const list = options[field] || [];
                if (!list.length) return;
                const idx = Math.floor(Math.random() * list.length);
                next[field] = list[idx].value;
            });
            ref.setTraits(next);
            ref.setUrl(this.buildAvatarUrlFromTraits(next, ref.getSeed()));
            this.applyAvatarStateToDom(target);
        },

        resetAvatar(target) {
            const ref = this.getAvatarStateRef(target);
            if (!ref) return;
            const traits = this.getDefaultAvatarTraits();
            ref.setTraits(traits);
            ref.setUrl(this.buildAvatarUrlFromTraits(traits, ref.getSeed()));
            this.applyAvatarStateToDom(target);
        },

        async init() {
            if (this.initPromise) return this.initPromise;
            this.initPromise = (async () => {
                if (!window.ForumLink) {
                    this.initError = 'ForumLink not found';
                    return false;
                }

                // 杂志主题字体与图标
                if (!document.getElementById('forum-mag-fonts')) {
                    const fontLink = document.createElement('link');
                    fontLink.id = 'forum-mag-fonts';
                    fontLink.href = 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700;900&display=swap';
                    fontLink.rel = 'stylesheet';
                    document.head.appendChild(fontLink);
                }
                if (!document.getElementById('remixicon-css')) {
                    const iconLink = document.createElement('link');
                    iconLink.id = 'remixicon-css';
                    iconLink.href = 'https://cdn.jsdelivr.net/npm/remixicon@3.5.0/fonts/remixicon.css';
                    iconLink.rel = 'stylesheet';
                    document.head.appendChild(iconLink);
                }

            const forumWorkerBaseUrl = String(
                (window.IDIC_FORUM_CONFIG && window.IDIC_FORUM_CONFIG.forumWorkerBaseUrl)
                || ''
            ).trim();
            const useCloudflare = Boolean(
                forumWorkerBaseUrl &&
                typeof ForumLink.createCloudflareStorageAdapter === 'function'
            );

            const storage = useCloudflare
                ? ForumLink.createCloudflareStorageAdapter({
                    baseUrl: forumWorkerBaseUrl
                })
                : ForumLink.createMemoryStorageAdapter();

            this.storage = storage;
            this.projectBridge = this.normalizeProjectBridge(window.ForumProjectBridge || null);

            const integration = ForumLink.createLocalIntegrationAdapter();
            this.integrationAdapter = integration;
            integration.sendForumCard = (payload) => {
                this.sendForumShareToChat(payload, { role: 'assistant' });
            };

            const config = {
                getProjectId: () => this.getProjectBridge().getProjectId(),
                getUserSettings: async (userId) => this.getProjectBridge().getUserSettings(userId || this.viewerUserId || this.state.userId || null),
                getCharSettings: async (charId) => this.getProjectBridge().getCharSettings(charId),
                getCharForumPrompt: async (charId) => this.buildRuntimeCharForumPrompt(charId),
                getApiProfile: async () => this.getProjectBridge().getApiProfile(),
                callApi: async (channel, payload, meta = {}) => this.getProjectBridge().callApi(channel, payload, meta)
            };

            ForumLink.init({
                projectId: config.getProjectId(),
                adapters: { storage, integration, config },
                // 仅保留手动刷帖/发帖/回复，不再启用本地自动 Agent worker。
                disableLocalAgentWorker: true
            });

            let bootstrap = null;
            if (useCloudflare) {
                let didPrimeCache = false;
                if (typeof storage.ensureBootstrapIdentity === 'function') {
                    bootstrap = await storage.ensureBootstrapIdentity();
                    // Cloudflare adapter already primes user/char cache in ensureBootstrapIdentity.
                    didPrimeCache = true;
                }
                if (!didPrimeCache && typeof storage.primeCache === 'function') {
                    await storage.primeCache();
                }
                if (bootstrap && bootstrap.userId) {
                    ForumLink.state.currentUserId = bootstrap.userId;
                    this.state.userId = bootstrap.userId;
                }
                if (bootstrap && bootstrap.charId) {
                    this.state.charId = bootstrap.charId;
                }
            } else {
                await this.seedDemoData();
            }

            this.viewerUserId = ForumLink.state.currentUserId || this.state.userId || 'user_demo_1';
            await this.requestProjectCharSync({
                force: true,
                minIntervalMs: 0
            });
            await this.restoreActiveCharPreference();

                this.cacheElements();
                this.bindEvents();

                // 初始渲染：不直接渲染Home，而是等打开时渲染
                this.isReady = true;
                return true;
})();
            return this.initPromise;
        },

        cacheElements() {
            const byId = (id) => document.getElementById(id);
            this.el.root = byId('forum-root');
            this.el.openBtn = byId('forum-open-btn');

            // 动态注入HTML结构（因为完全重构了UI结构）
            this.renderStructure();

            // 重新获取注入后的元素引用
            this.el.container = byId('forum-panel');
            this.el.viewContainer = byId('forum-view-container');
            this.el.backBtn = byId('forum-back-btn');
            this.el.closeBtn = byId('forum-close-btn');
            this.el.homeBtn = byId('forum-home-btn');
            this.el.titleArea = byId('forum-header-title');
            this.el.myMenuBtn = byId('forum-my-user-btn');
            this.el.myMenuWrap = byId('forum-my-menu-wrap');
            this.el.myMenu = byId('forum-my-menu');
            this.el.notificationBtn = byId('forum-notification-btn');
            this.el.notificationBadge = byId('forum-notification-badge');
            this.el.settingsBtn = byId('forum-settings-btn');
            this.el.shareModal = byId('forum-share-modal');
            this.el.shareList = byId('forum-share-list');
            this.el.shareClose = byId('forum-share-close');
        },

        renderStructure() {
            if (document.getElementById('forum-view-container')) return;
            this.el.root.innerHTML = '';

            this.el.root.innerHTML = `
                <div class="forum-panel theme-magazine" id="forum-panel">
                    <div class="forum-header">
                        <div class="forum-header-left">
                            <div class="forum-back-btn" id="forum-back-btn" style="display:none;" title="返回">
                                <i class="ri-arrow-left-line" style="font-size: 18px;"></i>
                            </div>
                            <div class="forum-title" id="forum-header-title">全息甲板</div>
                        </div>
                        <div class="forum-header-right">
                            <button class="forum-action-btn forum-btn-ghost icon-only forum-home-btn is-active" id="forum-home-btn" title="回首页">
                                <i class="ri-home-4-line"></i>
                            </button>
                            <button class="forum-action-btn forum-btn-ghost icon-only" id="forum-my-user-btn" title="我的主页">
                                <i class="ri-user-3-line"></i>
                            </button>
                            <button class="forum-action-btn forum-btn-ghost icon-only forum-notify-btn" id="forum-notification-btn" title="消息">
                                <i class="ri-mail-line"></i>
                                <span class="forum-notify-badge" id="forum-notification-badge" style="display:none;">0</span>
                            </button>
                            <button class="forum-action-btn forum-btn-ghost icon-only" id="forum-settings-btn" title="设置">
                                <i class="ri-settings-4-line"></i>
                            </button>
                            <button class="forum-action-btn forum-btn-ghost icon-only" id="forum-close-btn" title="关闭" aria-label="关闭">
                                <svg class="forum-header-svg-icon" viewBox="0 0 24 24" aria-hidden="true">
                                    <path d="M6 6L18 18M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                                </svg>
                            </button>
                        </div>
                    </div>

                    <div class="forum-body" id="forum-view-container"></div>
                </div>
                <div class="forum-share-modal" id="forum-share-modal">
                    <div class="forum-share-card">
                        <div class="forum-share-header">
                            <div class="forum-share-title">选择转发对象</div>
                            <button class="forum-share-close" id="forum-share-close" title="关闭">×</button>
                        </div>
                        <div class="forum-share-body">
                            <div class="forum-share-list" id="forum-share-list"></div>
                        </div>
                    </div>
                </div>
                <div class="mag-review-modal-overlay" id="mag-review-modal-overlay">
                    <div class="mag-review-modal">
                        <div class="mag-review-modal-header">
                            <div>
                                <div class="mag-review-modal-eyebrow">REVIEW · 点评</div>
                                <div class="mag-review-modal-title" id="mag-review-modal-title"></div>
                            </div>
                            <button class="mag-review-modal-close" onclick="document.getElementById('mag-review-modal-overlay').classList.remove('active')">×</button>
                        </div>
                        <div class="mag-review-modal-body">
                            <div class="mag-review-modal-section-title">点评内容</div>
                            <div class="mag-review-modal-text" id="mag-review-modal-text"></div>
                            <div class="mag-review-modal-action" id="mag-review-modal-action" style="display:none;"></div>
                        </div>
                    </div>
                </div>
            `;
        },

        bindEvents() {
            if (this.el.openBtn) {
                this.el.openBtn.addEventListener('click', () => this.open());
            }

            // 使用事件委托处理内部点击，因为元素是动态生成的
            const p = this.el.root;

            // 捕获阶段：拦截作者名点击，避免触发父级跳转
            p.addEventListener('click', (e) => {
                const authorTarget = e.target.closest('.forum-author-name');
                if (!authorTarget) return;
                const wrap = authorTarget.closest('.forum-author-wrap');
                if (wrap) {
                    wrap.classList.toggle('show-real');
                    e.stopPropagation();
                }
            }, true);

            p.addEventListener('click', (e) => {
                const target = e.target.closest('[id],[data-action]');

                const inMenu = e.target.closest('#forum-my-menu-wrap');
                if (!inMenu) {
                    this.closeMyMenu();
                }

                if (!target) return;

                if (target.id === 'forum-share-close' || (target.id === 'forum-share-modal' && e.target === target)) {
                    this.closeSharePicker(null);
                    return;
                }

                if (target.id === 'mag-review-modal-overlay' && e.target === target) {
                    target.classList.remove('active');
                    return;
                }

                if (target.dataset && target.dataset.action === 'pick-share-char') {
                    this.closeSharePicker(target.dataset.charId || null);
                    return;
                }

                if (target.dataset && target.dataset.action === 'notification-tab') {
                    const tab = String(target.dataset.tab || 'engagement').trim() || 'engagement';
                    this.switchNotificationTab(tab);
                    return;
                }

                if (target.dataset && target.dataset.action === 'notification-load-more') {
                    const tab = String(target.dataset.tab || this.state.currentNotificationTab || 'engagement').trim() || 'engagement';
                    this.loadMoreNotifications(tab);
                    return;
                }

                if (target.dataset && target.dataset.action === 'open-notification') {
                    const threadId = String(target.dataset.threadId || '').trim();
                    const commentId = String(target.dataset.commentId || '').trim();
                    if (threadId) {
                        this.navigate('thread', {
                            threadId,
                            highlightCommentId: commentId || null
                        });
                    }
                    return;
                }

                if (target.id === 'forum-close-btn') {
                    this.closeSharePicker(null);
                    this.close();
                }
                if (target.id === 'forum-back-btn') this.goBack();
                if (target.id === 'forum-home-btn') this.navigate('home', null, true);

                if (target.id === 'forum-my-user-btn') {
                    this.closeMyMenu();
                    this.navigate('user', { userId: this.viewerUserId });
                    return;
                }

                if (target.id === 'forum-notification-btn') {
                    this.closeMyMenu();
                    this.navigate('notifications', { tab: this.state.currentNotificationTab || 'engagement' });
                    return;
                }

                if (target.dataset && target.dataset.action === 'open-my-user') {
                    this.closeMyMenu();
                    this.navigate('user', { userId: this.viewerUserId });
                    return;
                }

                if (target.dataset && target.dataset.action === 'open-my-char') {
                    this.closeMyMenu();
                    const apiCharId = this.getActiveCharId();
                    this.navigate('char', { charId: apiCharId });
                    return;
                }

                if (target.id === 'forum-settings-btn') {
                    this.closeMyMenu();
                    const apiCharId = this.getActiveCharId();
                    this.navigate('settings', { charId: apiCharId });
                    return;
                }
            });
        },

        toggleMyMenu() {
            if (!this.el.myMenuWrap) return;
            this.el.myMenuWrap.classList.toggle('open');
        },

        closeMyMenu() {
            if (!this.el.myMenuWrap) return;
            this.el.myMenuWrap.classList.remove('open');
        },

        registerProjectBridge(bridge) {
            this.projectBridge = this.normalizeProjectBridge(bridge);
            return this.requestProjectCharSync({ force: true, minIntervalMs: 0 });
        },

        getProjectBridge() {
            if (this.projectBridge) return this.projectBridge;
            this.projectBridge = this.normalizeProjectBridge(window.ForumProjectBridge || null);
            return this.projectBridge;
        },

        normalizeProjectBridge(rawBridge) {
            const raw = rawBridge && typeof rawBridge === 'object' ? rawBridge : {};
            const invoke = async (fn, ...args) => {
                try {
                    return await fn(...args);
                } catch (error) {
                    console.warn('Forum bridge call failed', error);
                    return null;
                }
            };
            const has = (name) => typeof raw[name] === 'function';

            return {
                getProjectId: () => {
                    if (has('getProjectId')) {
                        const value = raw.getProjectId();
                        return value ? String(value) : 'idic';
                    }
                    return 'idic';
                },
                getActiveUserId: () => {
                    if (has('getActiveUserId')) {
                        const value = raw.getActiveUserId();
                        return value ? String(value) : null;
                    }
                    return null;
                },
                getCharacters: async () => {
                    if (!has('getCharacters')) return [];
                    const list = await invoke(raw.getCharacters.bind(raw));
                    return Array.isArray(list) ? list : [];
                },
                getUserSettings: async (userId) => {
                    if (!has('getUserSettings')) return {};
                    const data = await invoke(raw.getUserSettings.bind(raw), userId);
                    return data && typeof data === 'object' ? data : {};
                },
                getCharSettings: async (charId) => {
                    if (!has('getCharSettings')) return {};
                    const data = await invoke(raw.getCharSettings.bind(raw), charId);
                    return data && typeof data === 'object' ? data : {};
                },
                getCharForumPrompt: async (charId, meta) => {
                    if (has('getCharForumPrompt')) {
                        const text = await invoke(raw.getCharForumPrompt.bind(raw), charId, meta);
                        if (typeof text === 'string' && text.trim()) {
                            return text.trim();
                        }
                    }
                    return this.buildCharForumPromptFromMeta(meta);
                },
                getCharMemory: async (charId, meta) => {
                    if (has('getCharMemory')) {
                        const text = await invoke(raw.getCharMemory.bind(raw), charId, meta);
                        if (typeof text === 'string') return text;
                    }
                    if (meta && typeof meta.memory === 'string') return meta.memory;
                    return '';
                },
                getCharRecentChats: async (charId, limit = 50, meta) => {
                    if (has('getCharRecentChats')) {
                        const list = await invoke(raw.getCharRecentChats.bind(raw), charId, limit, meta);
                        if (list !== null && list !== undefined) return list;
                    }
                    return meta && Array.isArray(meta.recentChats)
                        ? meta.recentChats.slice(-Math.max(1, Number(limit) || 50))
                        : [];
                },
                getApiProfile: async () => {
                    if (!has('getApiProfile')) return {};
                    const profile = await invoke(raw.getApiProfile.bind(raw));
                    return profile && typeof profile === 'object' ? profile : {};
                },
                callApi: async (channel, payload, meta = {}) => {
                    if (has('callApi')) {
                        const result = await invoke(raw.callApi.bind(raw), channel, payload, meta);
                        if (result !== null && result !== undefined) {
                            return result;
                        }
                    }
                    const profile = has('getApiProfile')
                        ? (await invoke(raw.getApiProfile.bind(raw)) || {})
                        : {};
                    return this.callApiWithProfile(channel, payload, meta, profile);
                },
                enableForumPushNotifications: async (options = {}) => {
                    if (!has('enableForumPushNotifications')) {
                        return { ok: false, code: 'missing_bridge_method' };
                    }
                    const result = await invoke(raw.enableForumPushNotifications.bind(raw), options);
                    return result && typeof result === 'object'
                        ? result
                        : { ok: false, code: 'bridge_call_failed' };
                }
            };
        },

        sanitizeAgentContextText(value, maxLen = 2000) {
            const text = String(value || '').trim();
            if (!text) return '';
            const normalized = text
                .replace(/\r/g, '')
                .split('\n')
                .map((line) => line.trim())
                .filter(Boolean)
                .join('\n');
            if (!normalized) return '';
            return normalized.length > maxLen
                ? normalized.slice(0, Math.max(0, maxLen - 1)) + '…'
                : normalized;
        },

        normalizeAgentWorldBookEntriesForSync(entries = [], maxItems = 40) {
            if (!Array.isArray(entries) || entries.length === 0) return [];
            return entries
                .slice(0, Math.max(1, Number(maxItems) || 40))
                .map((entry, index) => {
                    if (!entry) return null;
                    const id = String(entry.id || `wb_${index + 1}`).trim() || `wb_${index + 1}`;
                    const key = this.sanitizeAgentContextText(
                        entry.key || entry.title || entry.name || `词条 ${index + 1}`,
                        80
                    );
                    const content = this.sanitizeAgentContextText(
                        entry.content || entry.value || entry.text || '',
                        320
                    );
                    if (!key && !content) return null;
                    return {
                        id,
                        key: key || `词条 ${index + 1}`,
                        content
                    };
                })
                .filter(Boolean);
        },

        normalizeAgentRecentChatsForSync(list = [], maxItems = 50) {
            if (!Array.isArray(list) || list.length === 0) return [];
            return list
                .slice(-Math.max(1, Number(maxItems) || 50))
                .map((item) => {
                    if (!item) return null;
                    const roleRaw = String(item.role || item.sender || item.speaker || 'assistant').trim().toLowerCase();
                    const role = ['user', 'assistant', 'system', 'tool'].includes(roleRaw) ? roleRaw : 'assistant';
                    const name = this.sanitizeAgentContextText(item.name || item.displayName || '', 80);
                    const content = this.sanitizeAgentContextText(
                        item.content || item.text || item.message || '',
                        260
                    );
                    const time = this.parseAgentChatIsoTime(
                        item.time
                        || item.timestamp
                        || item.createdAt
                        || item.created_at
                        || item.updatedAt
                        || item.updated_at
                        || ''
                    );
                    if (!content) return null;
                    return Object.assign(
                        { role, name, content },
                        time ? { time } : {}
                    );
                })
                .filter(Boolean);
        },

        parseAgentChatIsoTime(rawValue) {
            if (rawValue === null || rawValue === undefined) return '';
            if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
                const ts = rawValue > 1e12
                    ? rawValue
                    : (rawValue > 1e10 ? rawValue : rawValue * 1000);
                const date = new Date(ts);
                return Number.isNaN(date.getTime()) ? '' : date.toISOString();
            }
            const text = String(rawValue || '').trim();
            if (!text) return '';
            const parsed = Date.parse(text);
            if (Number.isNaN(parsed)) return '';
            return new Date(parsed).toISOString();
        },

        applyAgentContextToSettings(settings = {}, context = {}) {
            const next = settings && typeof settings === 'object'
                ? settings
                : {};

            const setOrDelete = (key, value) => {
                if (value === undefined || value === null) {
                    delete next[key];
                    return;
                }
                if (typeof value === 'string') {
                    const text = value.trim();
                    if (!text) {
                        delete next[key];
                        return;
                    }
                    next[key] = text;
                    return;
                }
                if (Array.isArray(value)) {
                    if (value.length === 0) {
                        delete next[key];
                        return;
                    }
                    next[key] = value;
                    return;
                }
                next[key] = value;
            };

            setOrDelete('agentPersona', context.persona);
            setOrDelete('agentMemory', context.memory);
            setOrDelete('agentRecentChats', context.recentChats);
            setOrDelete('agentWorldBookEntries', context.worldBookEntries);
            setOrDelete('agentWorldBookText', context.worldBookText);
            setOrDelete('agentForumPrompt', context.charForumPrompt);
            setOrDelete('agentOnlineStyle', context.onlineStyle);
            return next;
        },

        stripWorkerOwnedCharSettings(settings = {}) {
            const next = settings && typeof settings === 'object'
                ? settings
                : {};
            const keys = Array.isArray(this.workerOwnedCharSettingKeys)
                ? this.workerOwnedCharSettingKeys
                : [];
            keys.forEach((key) => {
                if (Object.prototype.hasOwnProperty.call(next, key)) {
                    delete next[key];
                }
            });
            return next;
        },

        normalizeProjectChar(rawChar, index = 0) {
            if (!rawChar || typeof rawChar !== 'object') return null;
            const id = String(rawChar.id || rawChar.charId || rawChar.characterId || '').trim();
            if (!id) return null;

            const realName = String(
                rawChar.realName
                || rawChar.name
                || rawChar.displayName
                || rawChar.remark
                || `角色${index + 1}`
            ).trim();
            const displayName = String(
                rawChar.displayName
                || rawChar.name
                || rawChar.remark
                || realName
            ).trim() || realName;
            const explicitForumName = String(
                rawChar.forumName
                || rawChar.forum_name
                || rawChar.settings?.forumName
                || rawChar.settings?.forum_name
                || ''
            ).trim();
            const forumName = explicitForumName || displayName || realName;

            const worldBookEntriesRaw = Array.isArray(rawChar.worldBook)
                ? rawChar.worldBook
                : (Array.isArray(rawChar.worldbook) ? rawChar.worldbook : []);
            const worldBookEntries = this.normalizeWorldBookEntries(worldBookEntriesRaw);
            const mountedWorldBookIds = this.ensureMountedWorldBookIds(
                rawChar.settings?.mountedWorldBookIds,
                worldBookEntries
            );
            const mountedWorldBookSet = new Set(mountedWorldBookIds);
            const mountedWorldBookEntries = worldBookEntries.filter((entry) =>
                mountedWorldBookSet.has(String(entry?.id || ''))
            );
            const compactWorldBookEntries = this.normalizeAgentWorldBookEntriesForSync(mountedWorldBookEntries, 40);
            const worldBookText = this.formatWorldBookText(compactWorldBookEntries);
            const compactWorldBookText = this.sanitizeAgentContextText(worldBookText, 6000);
            const persona = this.sanitizeAgentContextText(rawChar.persona || '', 2600);
            const memory = this.sanitizeAgentContextText(rawChar.memory || '', 3600);
            const recentChats = this.normalizeRecentChats(
                rawChar.recentChats
                || rawChar.recentChat
                || rawChar.chatHistory
                || rawChar.history
                || [],
                displayName
            );
            const compactRecentChats = this.normalizeAgentRecentChatsForSync(recentChats, 50);
            const charForumPrompt = String(
                rawChar.charForumPrompt
                || rawChar.forumPrompt
                || rawChar.prompt
                || rawChar.settings?.charForumPrompt
                || rawChar.settings?.forumPrompt
                || ''
            ).trim();
            const compactCharForumPrompt = this.sanitizeAgentContextText(charForumPrompt, 2800);
            const onlineStyle = String(
                rawChar.onlineStyle
                || rawChar.chatStyle
                || rawChar.forumStyle
                || rawChar.settings?.onlineStyle
                || rawChar.settings?.chatStyle
                || ''
            ).trim();
            const compactOnlineStyle = this.sanitizeAgentContextText(onlineStyle, 1200);
            const normalizedSettings = rawChar.settings && typeof rawChar.settings === 'object'
                ? Object.assign({}, rawChar.settings)
                : {};
            this.stripWorkerOwnedCharSettings(normalizedSettings);
            if (compactOnlineStyle) {
                normalizedSettings.onlineStyle = compactOnlineStyle;
                if (!normalizedSettings.chatStyle) {
                    normalizedSettings.chatStyle = compactOnlineStyle;
                }
            }
            this.applyAgentContextToSettings(normalizedSettings, {
                persona,
                memory,
                recentChats: compactRecentChats,
                worldBookEntries: compactWorldBookEntries,
                worldBookText: compactWorldBookText,
                charForumPrompt: compactCharForumPrompt,
                onlineStyle: compactOnlineStyle
            });

            const rawTag = String(rawChar.numberTag || rawChar.number_tag || '').replace(/\D/g, '');
            const numberTag = rawTag ? rawTag.slice(-4).padStart(4, '0') : null;

            return {
                id,
                realName,
                displayName,
                forumName,
                hasExplicitForumName: Boolean(explicitForumName),
                ownerUserId: rawChar.ownerUserId
                    ? String(rawChar.ownerUserId)
                    : (rawChar.owner_user_id
                        ? String(rawChar.owner_user_id)
                        : (rawChar.userId
                            ? String(rawChar.userId)
                            : (rawChar.user_id ? String(rawChar.user_id) : null))),
                numberTag,
                persona,
                memory,
                recentChats: compactRecentChats,
                worldBookEntries: compactWorldBookEntries,
                worldBookText: compactWorldBookText,
                charForumPrompt: compactCharForumPrompt,
                onlineStyle: compactOnlineStyle,
                settings: normalizedSettings
            };
        },

        normalizeWorldBookEntries(entries) {
            if (!Array.isArray(entries) || entries.length === 0) return [];
            return entries.map((entry, index) => {
                if (!entry) return null;
                if (typeof entry === 'string') {
                    const text = entry.trim();
                    if (!text) return null;
                    const safeId = `wb_${index}_${text.slice(0, 20).replace(/[^\w\u4e00-\u9fa5]+/g, '_')}`;
                    return {
                        id: safeId,
                        key: `词条 ${index + 1}`,
                        content: text
                    };
                }
                const key = String(entry.key || entry.title || entry.name || `词条 ${index + 1}`).trim();
                const content = String(entry.value || entry.content || entry.text || '').trim();
                if (!key && !content) return null;
                const safeId = `wb_${index}_${key.slice(0, 20).replace(/[^\w\u4e00-\u9fa5]+/g, '_')}`;
                return {
                    id: safeId,
                    key: key || `词条 ${index + 1}`,
                    content
                };
            }).filter(Boolean);
        },

        formatWorldBookText(entries) {
            if (!Array.isArray(entries) || entries.length === 0) return '';
            return entries.map((entry) => {
                if (!entry) return '';
                if (typeof entry === 'string') return entry.trim();
                const key = String(entry.key || entry.title || entry.name || '').trim();
                const value = String(entry.value || entry.content || entry.text || '').trim();
                if (key && value) return `${key}: ${value}`;
                return key || value;
            }).filter(Boolean).join('\n');
        },

        normalizeRecentChats(rawList, charName = '角色') {
            if (Array.isArray(rawList)) {
                return rawList.map((item) => {
                    if (!item) return null;
                    if (typeof item === 'string') {
                        const content = item.trim();
                        return content ? { role: 'assistant', name: charName, content } : null;
                    }
                    const content = String(
                        item.content
                        || item.text
                        || item.message
                        || ''
                    ).trim();
                    const time = this.parseAgentChatIsoTime(
                        item.time
                        || item.timestamp
                        || item.createdAt
                        || item.created_at
                        || item.updatedAt
                        || item.updated_at
                        || ''
                    );
                    if (!content) return null;
                    const base = {
                        role: String(item.role || item.sender || item.speaker || 'assistant').toLowerCase(),
                        name: String(item.name || item.displayName || charName),
                        content
                    };
                    return time ? Object.assign(base, { time }) : base;
                }).filter(Boolean);
            }

            if (typeof rawList === 'string' && rawList.trim()) {
                return rawList
                    .split('\n')
                    .map((line) => line.trim())
                    .filter(Boolean)
                    .map((content) => ({ role: 'assistant', name: charName, content }));
            }

            return [];
        },

        formatRecentChatsText(recentChats = [], limit = 50) {
            if (!Array.isArray(recentChats) || recentChats.length === 0) return '';
            const selected = recentChats.slice(-Math.max(1, Number(limit) || 50));
            return selected.map((item) => {
                const rawContent = String(item.content || '').replace(/\s+/g, ' ').trim();
                if (!rawContent) return '';
                const content = rawContent.length > 220
                    ? `${rawContent.slice(0, 220)}...`
                    : rawContent;
                const role = String(item.role || '').toLowerCase();
                const time = this.parseAgentChatIsoTime(item.time || '');
                const timePrefix = time
                    ? `[${time.replace('T', ' ').slice(0, 16)}] `
                    : '';
                if (role === 'user') {
                    return `${timePrefix}用户: ${content}`;
                }
                if (role === 'assistant' || role === 'char' || role === 'ai') {
                    const name = String(item.name || '角色').trim() || '角色';
                    return `${timePrefix}${name}: ${content}`;
                }
                return `${timePrefix}${role || '消息'}: ${content}`;
            }).filter(Boolean).join('\n');
        },

        tailText(input, maxChars = 2000) {
            const text = String(input || '').trim();
            if (!text) return '';
            const limit = Math.max(1, Number(maxChars) || 2000);
            if (text.length <= limit) return text;
            return text.slice(-limit);
        },

        extractCustomForumPrompt(rawPrompt) {
            const text = String(rawPrompt || '').trim();
            if (!text) return '';
            const markers = ['【角色人设】', '【线上风格】', '【世界书】', '【角色记忆】', '【最近聊天】'];
            let cutIndex = -1;
            markers.forEach((marker) => {
                const idx = text.indexOf(marker);
                if (idx >= 0 && (cutIndex < 0 || idx < cutIndex)) {
                    cutIndex = idx;
                }
            });
            if (cutIndex <= 0) {
                return cutIndex === 0 ? '' : text;
            }
            return text.slice(0, cutIndex).trim();
        },

        ensureMountedWorldBookIds(mountedIds, candidates = []) {
            const candidateIds = candidates.map((item) => String(item.id)).filter(Boolean);
            if (candidateIds.length === 0) return [];
            const validSet = new Set(candidateIds);
            if (Array.isArray(mountedIds)) {
                const fromSettings = mountedIds
                    .map((item) => String(item))
                    .filter((item) => validSet.has(item));
                return Array.from(new Set(fromSettings));
            }
            return candidateIds;
        },

        normalizeNumberTag(rawTag) {
            const digits = String(rawTag || '').replace(/\D/g, '');
            if (!digits) return '';
            return digits.slice(-4).padStart(4, '0');
        },

        getCharNameForNumberTag(charLike) {
            const name = String(
                charLike?.realName
                || charLike?.real_name
                || charLike?.displayName
                || charLike?.display_name
                || '角色'
            ).trim();
            return name || '角色';
        },

        resolveProjectCharNumberTags(chars = [], existingById = new Map(), peerRows = []) {
            const usedByName = new Map();
            const addUsed = (name, tag) => {
                if (!name || !tag) return;
                if (!usedByName.has(name)) usedByName.set(name, new Set());
                usedByName.get(name).add(tag);
            };
            const removeUsed = (name, tag) => {
                if (!name || !tag) return;
                const set = usedByName.get(name);
                if (!set) return;
                set.delete(tag);
            };

            (Array.isArray(peerRows) ? peerRows : []).forEach((row) => {
                const name = this.getCharNameForNumberTag(row);
                const tag = this.normalizeNumberTag(row?.number_tag || row?.numberTag);
                if (!tag) return;
                addUsed(name, tag);
            });

            chars.forEach((char) => {
                const existing = existingById.get(char.id) || null;
                const keepTag = this.normalizeNumberTag(char.numberTag)
                    || this.normalizeNumberTag(existing?.number_tag || existing?.numberTag);
                if (!keepTag) return;
                removeUsed(this.getCharNameForNumberTag(char), keepTag);
            });

            const result = new Map();
            chars.forEach((char) => {
                const name = this.getCharNameForNumberTag(char);
                const existing = existingById.get(char.id) || null;
                let finalTag = this.normalizeNumberTag(char.numberTag)
                    || this.normalizeNumberTag(existing?.number_tag || existing?.numberTag);
                const usedSet = usedByName.get(name) || new Set();

                if (!finalTag || usedSet.has(finalTag)) {
                    let seq = 1;
                    while (seq <= 9999) {
                        const candidate = String(seq).padStart(4, '0');
                        if (!usedSet.has(candidate)) {
                            finalTag = candidate;
                            break;
                        }
                        seq += 1;
                    }
                    if (!finalTag) finalTag = '9999';
                }

                usedSet.add(finalTag);
                usedByName.set(name, usedSet);
                result.set(char.id, finalTag);
            });
            return result;
        },

        async buildRuntimeCharForumPrompt(charId) {
            const targetCharId = String(charId || '').trim();
            if (!targetCharId) return '';

            const bridge = this.getProjectBridge();
            const meta = this.projectCharMeta.get(targetCharId) || null;
            const char = this.storage && typeof this.storage.getChar === 'function'
                ? await this.storage.getChar(targetCharId)
                : null;
            const settings = char && char.settings && typeof char.settings === 'object'
                ? char.settings
                : {};

            let bridgePrompt = '';
            if (bridge && typeof bridge.getCharForumPrompt === 'function') {
                try {
                    const value = await bridge.getCharForumPrompt(targetCharId, meta);
                    bridgePrompt = typeof value === 'string' ? value.trim() : '';
                } catch (_) { }
            }

            const customPrompt = this.extractCustomForumPrompt(
                settings.forumPrompt
                || settings.charForumPrompt
                || bridgePrompt
                || meta?.charForumPrompt
                || ''
            );

            const worldBookEntries = Array.isArray(meta?.worldBookEntries)
                ? meta.worldBookEntries
                : [];
            const mountedWorldBookIds = this.ensureMountedWorldBookIds(
                settings.mountedWorldBookIds,
                worldBookEntries
            );
            const mountedWorldBookSet = new Set(mountedWorldBookIds);
            const mountedWorldBooks = worldBookEntries.filter((entry) => mountedWorldBookSet.has(String(entry.id)));
            const worldBookText = this.formatWorldBookText(mountedWorldBooks);

            let memorySource = meta?.memory || '';
            if (bridge && typeof bridge.getCharMemory === 'function') {
                try {
                    const dynamicMemory = await bridge.getCharMemory(targetCharId, meta);
                    if (typeof dynamicMemory === 'string' && dynamicMemory.trim()) {
                        memorySource = dynamicMemory.trim();
                    }
                } catch (_) { }
            }
            const recentMemory = this.tailText(memorySource, 2000);

            let recentChats = Array.isArray(meta?.recentChats) ? meta.recentChats : [];
            if (bridge && typeof bridge.getCharRecentChats === 'function') {
                try {
                    const dynamicChats = await bridge.getCharRecentChats(targetCharId, 50, meta);
                    if (dynamicChats !== null && dynamicChats !== undefined) {
                        recentChats = this.normalizeRecentChats(dynamicChats, meta?.displayName || meta?.realName || '角色');
                    }
                } catch (_) { }
            }
            const recentChatsText = this.formatRecentChatsText(recentChats, 50);
            const charLabel = String(
                settings.forumName
                || char?.forumName
                || meta?.forumName
                || meta?.displayName
                || char?.displayName
                || meta?.realName
                || char?.realName
                || ''
            ).trim();
            const charForumName = String(
                char?.forumName
                || settings.forumName
                || meta?.forumName
                || ''
            ).trim();
            const charRealName = String(
                char?.realName
                || meta?.realName
                || char?.displayName
                || meta?.displayName
                || ''
            ).trim();
            const charNumberTag = this.normalizeNumberTag(
                char?.numberTag
                || meta?.numberTag
                || meta?.number_tag
                || settings.numberTag
            );
            const identityBlockLines = [
                `CharacterId: ${targetCharId}`,
                charLabel ? `CharacterName: ${charLabel}` : '',
                charForumName ? `CharacterForumName: ${charForumName}` : '',
                charRealName ? `CharacterRealName: ${charRealName}` : '',
                charNumberTag ? `CharacterNumberTag: #${charNumberTag}` : '',
                'Write as this character only.',
                'First-person "I" must refer to this character, not the user.',
                'Do not switch to user perspective.',
                'This is a public forum context, not a private DM.',
                'For top-level posts, face the whole forum audience instead of one specific user.',
                'If another account has the same name, treat them as a different parallel-world person.'
            ].filter(Boolean);
            const parts = [];
            if (identityBlockLines.length) parts.push(`[Identity Guard]\n${identityBlockLines.join('\n')}`);
            if (customPrompt) parts.push(`【论坛行为规范】\n${customPrompt}`);
            if (meta && meta.persona) parts.push(`【角色人设】\n${String(meta.persona).trim()}`);
            if (worldBookText) parts.push(`【挂载世界书】\n${worldBookText}`);
            if (recentMemory) parts.push(`【近期记忆（后2000字）】\n${recentMemory}`);
            if (recentChatsText) parts.push(`【最近聊天（最多50条）】\n${recentChatsText}`);
            return parts.join('\n\n').trim();
        },

        buildCharForumPromptFromMeta(meta) {
            if (!meta || typeof meta !== 'object') return '';
            const parts = [];
            const metaCharId = String(meta.id || meta.charId || '').trim();
            const metaCharName = String(
                meta.forumName
                || meta.displayName
                || meta.realName
                || ''
            ).trim();
            const metaForumName = String(meta.forumName || '').trim();
            const metaRealName = String(meta.realName || meta.displayName || '').trim();
            const metaNumberTag = this.normalizeNumberTag(meta.numberTag || meta.number_tag);
            const identityBlockLines = [
                metaCharId ? `CharacterId: ${metaCharId}` : '',
                metaCharName ? `CharacterName: ${metaCharName}` : '',
                metaForumName ? `CharacterForumName: ${metaForumName}` : '',
                metaRealName ? `CharacterRealName: ${metaRealName}` : '',
                metaNumberTag ? `CharacterNumberTag: #${metaNumberTag}` : '',
                'Write as this character only.',
                'First-person "I" must refer to this character, not the user.',
                'Do not switch to user perspective.',
                'This is a public forum context, not a private DM.',
                'For top-level posts, face the whole forum audience instead of one specific user.',
                'If another account has the same name, treat them as a different parallel-world person.'
            ].filter(Boolean);
            if (identityBlockLines.length) parts.push(`[Identity Guard]\n${identityBlockLines.join('\n')}`);
            if (meta.charForumPrompt) parts.push(this.extractCustomForumPrompt(String(meta.charForumPrompt).trim()));
            if (meta.persona) parts.push(`【角色人设】\n${String(meta.persona).trim()}`);
            if (meta.worldBookText) parts.push(`【挂载世界书】\n${String(meta.worldBookText).trim()}`);
            if (meta.memory) parts.push(`【近期记忆（后2000字）】\n${this.tailText(meta.memory, 2000)}`);
            if (meta.recentChats) {
                const recentChatsText = this.formatRecentChatsText(meta.recentChats, 50);
                if (recentChatsText) {
                    parts.push(`【最近聊天（最多50条）】\n${recentChatsText}`);
                }
            }
            return parts.filter(Boolean).join('\n\n').trim();
        },

        resolveApiEndpoint(profile = {}, channel = 'main') {
            const asEndpoint = (source) => {
                if (!source || typeof source !== 'object') return null;
                const url = String(source.url || '').trim();
                const key = String(source.key || source.apiKey || '').trim();
                const model = String(source.model || source.apiModel || '').trim();
                if (!url || !key) return null;
                return {
                    url,
                    key,
                    model: model || 'gpt-4o-mini',
                    temperature: source.temperature
                };
            };

            const main = asEndpoint(profile.main || profile.primary || profile);
            const sub1 = asEndpoint(profile.sub1 || profile.secondary1 || profile.secondaryApi1) || main;
            const sub2 = asEndpoint(profile.sub2 || profile.secondary2 || profile.secondaryApi2) || sub1 || main;

            if (channel === 'sub1') return sub1;
            if (channel === 'sub2') return sub2;
            return main;
        },

        parseAiResponse(rawContent) {
            if (typeof rawContent !== 'string') {
                return rawContent || null;
            }
            const text = rawContent.trim();
            if (!text) return null;

            const tryJson = (input) => {
                try {
                    return JSON.parse(input);
                } catch (_) {
                    return null;
                }
            };

            const direct = tryJson(text);
            if (direct !== null) return direct;

            const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
            if (fenced && fenced[1]) {
                const parsed = tryJson(fenced[1].trim());
                if (parsed !== null) return parsed;
            }

            const objectMatch = text.match(/\{[\s\S]*\}/);
            if (objectMatch) {
                const parsed = tryJson(objectMatch[0]);
                if (parsed !== null) return parsed;
            }

            const arrayMatch = text.match(/\[[\s\S]*\]/);
            if (arrayMatch) {
                const parsed = tryJson(arrayMatch[0]);
                if (parsed !== null) return parsed;
            }

            return text;
        },

        async callApiWithProfile(channel, payload, _meta = {}, profile = {}) {
            const endpoint = this.resolveApiEndpoint(profile, channel);
            if (!endpoint) return null;

            let requestUrl = endpoint.url;
            if (!requestUrl.endsWith('/chat/completions')) {
                requestUrl = requestUrl.endsWith('/')
                    ? `${requestUrl}chat/completions`
                    : `${requestUrl}/chat/completions`;
            }

            const instruction = payload && payload.instruction
                ? String(payload.instruction)
                : '请根据输入完成任务。';
            let payloadText = '';
            try {
                payloadText = JSON.stringify(payload || {}, null, 2);
            } catch (_) {
                payloadText = String(payload || '');
            }

            const response = await fetch(requestUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${endpoint.key}`
                },
                body: JSON.stringify({
                    model: endpoint.model,
                    messages: [{
                        role: 'user',
                        content: `${instruction}\n\n请优先返回 JSON。输入如下：\n${payloadText}`
                    }],
                    temperature: Number.isFinite(Number(endpoint.temperature))
                        ? Number(endpoint.temperature)
                        : 0.7
                })
            });

            if (!response.ok) return null;
            const data = await response.json();
            const content = data?.choices?.[0]?.message?.content;
            return this.parseAiResponse(content);
        },

        requestProjectCharSync(options = {}) {
            const force = Boolean(options.force);
            const background = Boolean(options.background);
            const minIntervalMs = Math.max(0, Number(options.minIntervalMs) || 15000);
            const now = Date.now();

            if (!force && this.projectCharSyncPromise) {
                if (background) {
                    this.projectCharSyncPromise
                        .then((didSync) => {
                            if (!didSync || this.currentHistoryEntry?.view !== 'settings') return;
                            const selectedCharId = this.settingsState?.selectedCharId || null;
                            this.renderCharSettingsView(selectedCharId).catch((error) => {
                                console.warn('后台同步后刷新设置页失败', error);
                            });
                        })
                        .catch(() => { });
                }
                return this.projectCharSyncPromise;
            }
            if (!force && this.projectCharLastSyncAt > 0 && (now - this.projectCharLastSyncAt) < minIntervalMs) {
                return Promise.resolve(false);
            }

            const syncOptions = options.syncOptions && typeof options.syncOptions === 'object'
                ? Object.assign({}, options.syncOptions)
                : {};

            const task = (async () => {
                let synced = false;
                try {
                    await this.syncProjectCharsToForum(syncOptions);
                    this.projectCharLastSyncAt = Date.now();
                    synced = true;
                    return true;
                } catch (error) {
                    console.warn('同步角色到论坛失败', error);
                    return false;
                } finally {
                    if (this.projectCharSyncPromise === task) {
                        this.projectCharSyncPromise = null;
                    }
                    if (background && synced && this.currentHistoryEntry?.view === 'settings') {
                        try {
                            const selectedCharId = this.settingsState?.selectedCharId || null;
                            await this.renderCharSettingsView(selectedCharId);
                        } catch (error) {
                            console.warn('后台同步后刷新设置页失败', error);
                        }
                    }
                }
            })();

            this.projectCharSyncPromise = task;
            return task;
        },

        async syncProjectCharsToForum(options = {}) {
            if (!this.storage) return;
            const bridge = this.getProjectBridge();
            if (!bridge || typeof bridge.getCharacters !== 'function') return;
            const fastMode = Boolean(options.fastMode);
            const maxAttempts = Math.max(1, Number(options.maxAttempts) || 3);
            const retryDelayMs = Math.max(0, Number(options.retryDelayMs) || 180);
            let sourceChars = [];
            let bestCount = 0;
            let stableHits = 0;
            for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
                const candidate = await bridge.getCharacters();
                if (Array.isArray(candidate) && candidate.length > 0) {
                    if (candidate.length > bestCount) {
                        sourceChars = candidate;
                        bestCount = candidate.length;
                        stableHits = 0;
                    } else if (candidate.length === bestCount) {
                        stableHits += 1;
                    }
                    if (attempt >= 2 && stableHits > 0) {
                        break;
                    }
                }
                if (attempt < maxAttempts && retryDelayMs > 0) {
                    await new Promise((resolve) => setTimeout(resolve, retryDelayMs * attempt));
                }
            }
            if (!Array.isArray(sourceChars) || sourceChars.length === 0) {
                return;
            }

            const normalizedChars = sourceChars
                .map((item, index) => this.normalizeProjectChar(item, index))
                .filter(Boolean);
            if (normalizedChars.length === 0) return;

            const hasMeaningfulValue = (value) => {
                if (value === undefined || value === null) return false;
                if (typeof value === 'string') return value.trim() !== '';
                if (Array.isArray(value)) return value.length > 0;
                if (typeof value === 'object') return Object.keys(value).length > 0;
                return true;
            };

            const keepForumAvatarSettings = (mergedSettings, existingSettings) => {
                const safeMerged = mergedSettings && typeof mergedSettings === 'object' ? mergedSettings : {};
                const safeExisting = existingSettings && typeof existingSettings === 'object' ? existingSettings : {};
                const forumOwnedAvatarKeys = ['forumAvatarUrl', 'forumAvatarTraits', 'avatarUrl', 'avatarTraits'];
                forumOwnedAvatarKeys.forEach((key) => {
                    if (hasMeaningfulValue(safeExisting[key])) {
                        safeMerged[key] = safeExisting[key];
                    }
                });
                return safeMerged;
            };

            const currentUserId = this.viewerUserId || this.state.userId || ForumLink.state.currentUserId || null;

            if (
                this.storage
                && typeof this.storage.listChars === 'function'
                && typeof this.storage.bulkUpsertChars === 'function'
            ) {
                const charIds = normalizedChars.map((char) => char.id);
                const existingRows = await this.storage.listChars({
                    ids: charIds,
                    limit: Math.max(200, charIds.length + 20)
                });
                const existingMap = new Map((existingRows || []).map((row) => [row.id, row]));
                if (!fastMode) {
                    const targetNames = Array.from(new Set(
                        normalizedChars
                            .map((char) => this.getCharNameForNumberTag(char))
                            .filter(Boolean)
                    ));
                    let peerRows = [];
                    if (targetNames.length > 0) {
                        if (typeof this.storage.searchCharsByNames === 'function') {
                            peerRows = await this.storage.searchCharsByNames({
                                names: targetNames,
                                limit: 5000
                            });
                        } else if (this.storage && this.storage._store && this.storage._store.chars instanceof Map) {
                            const targetNameSet = new Set(targetNames);
                            peerRows = Array.from(this.storage._store.chars.values()).filter((row) => {
                                const name = this.getCharNameForNumberTag(row);
                                return targetNameSet.has(name);
                            });
                        }
                    }
                    const numberTagMap = this.resolveProjectCharNumberTags(
                        normalizedChars,
                        existingMap,
                        peerRows
                    );
                    normalizedChars.forEach((char) => {
                        const resolvedTag = numberTagMap.get(char.id) || null;
                        if (resolvedTag) char.numberTag = resolvedTag;
                    });
                } else {
                    normalizedChars.forEach((char) => {
                        const existing = existingMap.get(char.id);
                        char.numberTag = char.numberTag || this.normalizeNumberTag(existing?.numberTag || existing?.number_tag) || '0001';
                    });
                }

                const rows = normalizedChars.map((char) => {
                    const existing = existingMap.get(char.id) || null;
                    const existingSettings = existing && existing.settings && typeof existing.settings === 'object'
                        ? existing.settings
                        : {};
                    const mergedSettings = keepForumAvatarSettings(
                        Object.assign({}, existingSettings, char.settings || {}),
                        existingSettings
                    );
                    const workerSettingKeys = Array.isArray(this.workerOwnedCharSettingKeys)
                        ? this.workerOwnedCharSettingKeys
                        : [];
                    workerSettingKeys.forEach((key) => {
                        if (Object.prototype.hasOwnProperty.call(existingSettings, key)) {
                            mergedSettings[key] = existingSettings[key];
                        } else if (Object.prototype.hasOwnProperty.call(mergedSettings, key)) {
                            delete mergedSettings[key];
                        }
                    });
                    const preferredForumNameFromBridge = char.hasExplicitForumName
                        ? String(char.forumName || '').trim()
                        : '';
                    const nextOwnerUserId = String(
                        char.ownerUserId
                        || currentUserId
                        || existing?.ownerUserId
                        || existing?.owner_user_id
                        || ''
                    ).trim() || null;
                    const nextForumName = String(
                        existingSettings.forumName
                        || mergedSettings.forumName
                        || existing?.forumName
                        || existing?.forum_name
                        || char.settings?.forumName
                        || preferredForumNameFromBridge
                        || char.forumName
                        || ''
                    ).trim() || char.displayName || char.realName || '角色';
                    mergedSettings.forumPrompt = this.extractCustomForumPrompt(
                        mergedSettings.forumPrompt
                        || mergedSettings.charForumPrompt
                        || char.charForumPrompt
                        || ''
                    );
                    mergedSettings.forumName = nextForumName;
                    char.forumName = nextForumName;
                    char.ownerUserId = nextOwnerUserId;
                    char.settings = mergedSettings;

                    return {
                        id: char.id,
                        realName: char.realName,
                        displayName: char.displayName,
                        ownerUserId: nextOwnerUserId,
                        numberTag: char.numberTag || this.normalizeNumberTag(existing?.numberTag || existing?.number_tag) || '0001',
                        forumName: nextForumName,
                        settings: mergedSettings,
                        stats: existing?.stats || {}
                    };
                });

                await this.storage.bulkUpsertChars(rows);

                const identityRows = normalizedChars.map((char) => ({
                    authorType: 'char',
                    authorId: char.id,
                    displayName: char.forumName || char.displayName || char.realName || '角色',
                    anonymous: false,
                    anonDisplayId: null
                }));
                if (identityRows.length > 0) {
                    if (typeof this.storage.bulkUpsertIdentities === 'function') {
                        await this.storage.bulkUpsertIdentities(identityRows);
                    } else if (typeof this.storage.saveForumIdentity === 'function') {
                        for (const identity of identityRows) {
                            await this.storage.saveForumIdentity(identity);
                        }
                    }
                }
                this.mergeProjectCharsIntoCache(normalizedChars, currentUserId);
            } else if (this.storage && this.storage._store && typeof this.storage.insertChar === 'function') {
                const charStore = this.storage._store.chars;
                const targetNameSet = new Set(
                    normalizedChars
                        .map((char) => this.getCharNameForNumberTag(char))
                        .filter(Boolean)
                );
                const peerRows = Array.from(charStore.values()).filter((row) => {
                    const name = this.getCharNameForNumberTag(row);
                    return targetNameSet.has(name);
                });
                const existingMap = new Map(peerRows.map((row) => [row.id, row]));
                const numberTagMap = this.resolveProjectCharNumberTags(
                    normalizedChars,
                    existingMap,
                    peerRows
                );
                normalizedChars.forEach((char) => {
                    const resolvedTag = numberTagMap.get(char.id) || null;
                    if (resolvedTag) char.numberTag = resolvedTag;
                });
                normalizedChars.forEach((char) => {
                    const existing = charStore.get(char.id);
                    const preferredForumNameFromBridge = char.hasExplicitForumName
                        ? String(char.forumName || '').trim()
                        : '';
                    const nextForumName = String(
                        existing?.settings?.forumName
                        || existing?.forumName
                        || char.settings?.forumName
                        || preferredForumNameFromBridge
                        || char.forumName
                        || ''
                    ).trim() || char.displayName || char.realName || '角色';
                    const nextOwnerUserId = String(
                        char.ownerUserId
                        || currentUserId
                        || existing?.ownerUserId
                        || existing?.owner_user_id
                        || ''
                    ).trim() || null;
                    if (existing) {
                        existing.realName = char.realName;
                        existing.displayName = char.displayName;
                        existing.forumName = nextForumName;
                        existing.ownerUserId = nextOwnerUserId;
                        existing.numberTag = char.numberTag || existing.numberTag || '0001';
                        existing.settings = keepForumAvatarSettings(
                            Object.assign({}, existing.settings || {}, char.settings || {}),
                            existing.settings || {}
                        );
                        existing.settings.forumName = nextForumName;
                        existing.settings.forumPrompt = this.extractCustomForumPrompt(
                            existing.settings.forumPrompt
                            || existing.settings.charForumPrompt
                            || char.charForumPrompt
                            || ''
                        );
                        charStore.set(existing.id, existing);
                    } else {
                        const created = this.storage.insertChar({
                            id: char.id,
                            realName: char.realName,
                            displayName: char.displayName,
                            ownerUserId: nextOwnerUserId,
                            numberTag: char.numberTag || '0001',
                            forumName: nextForumName,
                            settings: Object.assign({}, char.settings || {}, {
                                forumName: nextForumName,
                                forumPrompt: this.extractCustomForumPrompt(
                                    char.settings?.forumPrompt
                                    || char.settings?.charForumPrompt
                                    || char.charForumPrompt
                                    || ''
                                )
                            })
                        });
                        charStore.set(created.id, created);
                    }
                });
            }

            const mergedMeta = new Map(this.projectCharMeta || []);
            normalizedChars.forEach((char) => {
                mergedMeta.set(char.id, char);
            });
            this.projectCharMeta = mergedMeta;

            const activeCharId = this.getActiveCharId();
            const hasActive = normalizedChars.some((char) => char.id === activeCharId);
            if (hasActive) {
                this.rememberActiveCharId(activeCharId);
            } else {
                const nextCharId = normalizedChars[0].id;
                this.rememberActiveCharId(nextCharId);
            }
        },

        mergeProjectCharsIntoCache(chars = [], fallbackOwnerUserId = null) {
            const store = this.storage && this.storage._store;
            const charStore = store && store.chars instanceof Map ? store.chars : null;
            if (!charStore || !Array.isArray(chars) || chars.length === 0) return;

            const fallbackOwner = String(fallbackOwnerUserId || this.viewerUserId || '').trim() || null;
            chars.forEach((char) => {
                const charId = String(char?.id || '').trim();
                if (!charId) return;

                const existing = charStore.get(charId) || {};
                const mergedSettings = Object.assign({}, existing.settings || {}, char.settings || {});
                const ownerUserId = String(
                    char.ownerUserId
                    || fallbackOwner
                    || existing.ownerUserId
                    || existing.owner_user_id
                    || ''
                ).trim() || null;
                const preferredForumNameFromBridge = char.hasExplicitForumName
                    ? String(char.forumName || '').trim()
                    : '';
                const forumName = String(
                    existing.settings?.forumName
                    || existing.forumName
                    || mergedSettings.forumName
                    || char.settings?.forumName
                    || preferredForumNameFromBridge
                    || char.forumName
                    || ''
                ).trim() || char.displayName || char.realName || '';
                mergedSettings.forumName = forumName;

                charStore.set(charId, Object.assign({}, existing, char, {
                    id: charId,
                    ownerUserId,
                    settings: mergedSettings,
                    forumName,
                    realName: char.realName || existing.realName || existing.displayName || '',
                    displayName: char.displayName || existing.displayName || existing.realName || ''
                }));
            });
        },

        buildSettingsCharPool() {
            const storeChars = this.getCharList();
            const storeMap = new Map(
                (storeChars || [])
                    .map((char) => [String(char?.id || '').trim(), char])
                    .filter((item) => item[0])
            );
            const metaChars = Array.from(this.projectCharMeta.values()).filter(Boolean);
            if (!metaChars.length) return storeChars;

            const merged = [];
            const seen = new Set();
            metaChars.forEach((metaChar) => {
                const charId = String(metaChar?.id || '').trim();
                if (!charId || seen.has(charId)) return;
                const cached = storeMap.get(charId) || {};
                const mergedSettings = Object.assign({}, cached.settings || {}, metaChar.settings || {});
                const ownerUserId = String(
                    metaChar.ownerUserId
                    || this.viewerUserId
                    || cached.ownerUserId
                    || cached.owner_user_id
                    || ''
                ).trim() || null;
                const forumName = String(
                    metaChar.forumName
                    || metaChar.settings?.forumName
                    || mergedSettings.forumName
                    || cached.forumName
                    || ''
                ).trim() || metaChar.displayName || metaChar.realName || '';
                mergedSettings.forumName = forumName;

                merged.push(Object.assign({}, cached, metaChar, {
                    id: charId,
                    ownerUserId,
                    settings: mergedSettings,
                    forumName,
                    realName: metaChar.realName || cached.realName || cached.displayName || '',
                    displayName: metaChar.displayName || cached.displayName || cached.realName || ''
                }));
                seen.add(charId);
            });

            (storeChars || []).forEach((char) => {
                const charId = String(char?.id || '').trim();
                if (!charId || seen.has(charId)) return;
                merged.push(char);
                seen.add(charId);
            });

            return merged;
        },

        getCharList() {
            const store = this.storage && this.storage._store;
            if (!store || !store.chars) return [];
            return Array.from(store.chars.values());
        },

        normalizeBackendSupabaseUrl(value) {
            let url = String(value || '').trim();
            if (!url) return '';
            if (!/^https?:\/\//i.test(url)) {
                url = `https://${url}`;
            }
            return url.replace(/\/+$/, '');
        },

        sanitizeBackendConfigText(value, maxLen = 2048) {
            const text = String(value || '').trim();
            if (!text) return '';
            return text.length > maxLen ? text.slice(0, maxLen) : text;
        },

        readForumBackendConfigFromLocalStorage() {
            const keys = this.backendConfigStorageKeys || {};
            const read = (key) => {
                if (!key) return '';
                try {
                    return String(localStorage.getItem(key) || '').trim();
                } catch (_) {
                    return '';
                }
            };
            return {
                supabaseUrl: this.normalizeBackendSupabaseUrl(read(keys.supabaseUrl)),
                supabaseKey: this.sanitizeBackendConfigText(read(keys.supabaseKey), 4096),
                workerToken: this.sanitizeBackendConfigText(read(keys.workerToken), 4096)
            };
        },

        persistForumBackendConfigToLocalStorage(config = {}) {
            const keys = this.backendConfigStorageKeys || {};
            const normalized = {
                supabaseUrl: this.normalizeBackendSupabaseUrl(config.supabaseUrl),
                supabaseKey: this.sanitizeBackendConfigText(config.supabaseKey, 4096),
                workerToken: this.sanitizeBackendConfigText(config.workerToken, 4096)
            };
            const write = (key, value) => {
                if (!key) return;
                try {
                    if (value) {
                        localStorage.setItem(key, value);
                    } else {
                        localStorage.removeItem(key);
                    }
                } catch (_) { }
            };
            write(keys.supabaseUrl, normalized.supabaseUrl);
            write(keys.supabaseKey, normalized.supabaseKey);
            write(keys.workerToken, normalized.workerToken);
            return normalized;
        },

        getForumBackendConfigFromSettings() {
            this.ensureSettingsState();
            if (!this.settingsState.backendConfigLoaded) {
                const localConfig = this.readForumBackendConfigFromLocalStorage();
                this.settingsState.backendSupabaseUrl = localConfig.supabaseUrl;
                this.settingsState.backendSupabaseKey = localConfig.supabaseKey;
                this.settingsState.backendWorkerToken = localConfig.workerToken;
                this.settingsState.backendConfigLoaded = true;
            }
            return {
                supabaseUrl: this.normalizeBackendSupabaseUrl(this.settingsState.backendSupabaseUrl),
                supabaseKey: this.sanitizeBackendConfigText(this.settingsState.backendSupabaseKey, 4096),
                workerToken: this.sanitizeBackendConfigText(this.settingsState.backendWorkerToken, 4096)
            };
        },

        updateForumBackendConfigField(field, value) {
            this.ensureSettingsState();
            const key = String(field || '').trim();
            if (!key) return;
            if (key === 'supabaseUrl') {
                this.settingsState.backendSupabaseUrl = String(value || '');
                return;
            }
            if (key === 'supabaseKey') {
                this.settingsState.backendSupabaseKey = String(value || '');
                return;
            }
            if (key === 'workerToken') {
                this.settingsState.backendWorkerToken = String(value || '');
            }
        },

        isAgentBackendConfigured(config = null) {
            const source = config && typeof config === 'object'
                ? config
                : this.getForumBackendConfigFromSettings();
            return Boolean(
                String(source.supabaseUrl || '').trim()
                && String(source.supabaseKey || '').trim()
                && String(source.workerToken || '').trim()
            );
        },

        getAgentBackendMissingHint(config = null) {
            const source = config && typeof config === 'object'
                ? config
                : this.getForumBackendConfigFromSettings();
            const missing = [];
            if (!String(source.supabaseUrl || '').trim()) missing.push('Supabase URL');
            if (!String(source.supabaseKey || '').trim()) missing.push('publishable key');
            if (!String(source.workerToken || '').trim()) missing.push('worker token');
            return missing.join(' / ');
        },

        getStoredActiveCharId() {
            const raw = String(localStorage.getItem('forum_char_id') || '').trim();
            if (!raw || raw === 'char_local_1' || raw === 'char_demo_1') return '';
            return raw;
        },

        hasKnownCharId(charId) {
            const target = String(charId || '').trim();
            if (!target) return false;
            const hasMeta = this.projectCharMeta instanceof Map && this.projectCharMeta.size > 0;
            const chars = this.getCharList();
            if (!hasMeta && chars.length === 0) return true;
            if (hasMeta && this.projectCharMeta.has(target)) return true;
            return chars.some((item) => String(item?.id || '').trim() === target);
        },

        rememberActiveCharId(charId, options = {}) {
            const target = String(charId || '').trim();
            if (!target) return '';
            this.state.charId = target;
            if (this.settingsState && typeof this.settingsState === 'object') {
                this.settingsState.selectedCharId = target;
            }
            if (options.persistLocal !== false) {
                try {
                    localStorage.setItem('forum_char_id', target);
                } catch (_) { }
            }
            return target;
        },

        async restoreActiveCharPreference() {
            const localPreferred = this.getStoredActiveCharId();
            if (localPreferred && this.hasKnownCharId(localPreferred)) {
                this.rememberActiveCharId(localPreferred, { persistLocal: false });
                return localPreferred;
            }
            if (!this.storage || typeof this.storage.getUser !== 'function') return '';
            const userId = String(this.viewerUserId || this.state.userId || '').trim();
            if (!userId) return '';
            try {
                const user = await this.storage.getUser(userId);
                const preferred = String(user?.settings?.forumActiveCharId || '').trim();
                if (preferred && this.hasKnownCharId(preferred)) {
                    this.rememberActiveCharId(preferred);
                    return preferred;
                }
            } catch (_) { }
            return '';
        },

        getActiveCharId() {
            const pickKnown = (candidate) => {
                const safe = String(candidate || '').trim();
                if (!safe) return '';
                return this.hasKnownCharId(safe) ? safe : '';
            };

            const selected = pickKnown(this.settingsState?.selectedCharId);
            if (selected) return this.rememberActiveCharId(selected, { persistLocal: false });

            const stateChar = pickKnown(this.state.charId);
            if (stateChar) return this.rememberActiveCharId(stateChar, { persistLocal: false });

            const currentChar = pickKnown(this.state.currentChar && this.state.currentChar.id);
            if (currentChar) return this.rememberActiveCharId(currentChar, { persistLocal: false });

            const stored = pickKnown(this.getStoredActiveCharId());
            if (stored) return this.rememberActiveCharId(stored, { persistLocal: false });

            if (this.projectCharMeta && this.projectCharMeta.size > 0) {
                const firstMeta = this.projectCharMeta.values().next().value;
                if (firstMeta && firstMeta.id) {
                    return this.rememberActiveCharId(String(firstMeta.id), { persistLocal: false });
                }
            }
            const chars = this.getCharList();
            if (chars.length) {
                return this.rememberActiveCharId(chars[0].id, { persistLocal: false });
            }
            return 'char_demo_1';
        },

        async triggerCharPost(charId, options = {}) {
            const targetCharId = String(charId || this.getActiveCharId() || '').trim();
            if (!targetCharId) {
                throw new Error('缺少角色 ID');
            }
            const thread = await ForumLink.ai.createPost(Object.assign({
                charId: targetCharId,
                userId: this.viewerUserId
            }, options));
            if (thread && thread.id) {
                this.state.charId = targetCharId;
            }
            return thread;
        },

        async triggerCharBrowse(charId, options = {}) {
            const targetCharId = String(charId || this.getActiveCharId() || '').trim();
            if (!targetCharId) {
                throw new Error('缺少角色 ID');
            }
            this.state.charId = targetCharId;
            return ForumLink.ai.browseForum(Object.assign({
                charId: targetCharId,
                userId: this.viewerUserId
            }, options));
        },

        async triggerCharReply(charId, options = {}) {
            const targetCharId = String(charId || this.getActiveCharId() || '').trim();
            if (!targetCharId) {
                throw new Error('缺少角色 ID');
            }
            this.state.charId = targetCharId;

            const minThreads = Math.max(1, Number(options.minThreads) || 1);
            const maxThreads = Math.max(minThreads, Number(options.maxThreads) || 3);

            let notifications = [];
            if (this.storage && typeof this.storage.listNotifications === 'function') {
                notifications = await this.storage.listNotifications({
                    receiverType: 'char',
                    receiverId: targetCharId,
                    category: 'engagement',
                    limit: 160
                });
            }

            const relevantNotifications = (Array.isArray(notifications) ? notifications : [])
                .filter((item) => {
                    const type = String(item?.type || '').trim();
                    const threadId = String(item?.threadId || item?.thread_id || '').trim();
                    return Boolean(threadId) && (type === 'reply_comment' || type === 'comment_thread');
                })
                .sort((a, b) => new Date(b?.createdAt || b?.created_at || 0) - new Date(a?.createdAt || a?.created_at || 0));

            const threadNotifyMap = new Map();
            const threadTargetCommentMap = new Map();
            const extractNotifyCommentId = (item) => {
                const directId = String(item?.commentId || item?.comment_id || '').trim();
                if (directId) return directId;
                const meta = item && typeof item.meta === 'object' ? item.meta : null;
                const metaId = String(meta?.commentId || meta?.comment_id || '').trim();
                if (metaId) return metaId;
                return '';
            };
            relevantNotifications.forEach((item) => {
                const threadId = String(item?.threadId || item?.thread_id || '').trim();
                if (!threadId) return;
                if (!threadNotifyMap.has(threadId)) threadNotifyMap.set(threadId, []);
                threadNotifyMap.get(threadId).push(item);
                const commentId = extractNotifyCommentId(item);
                if (!commentId) return;
                if (!threadTargetCommentMap.has(threadId)) threadTargetCommentMap.set(threadId, new Set());
                threadTargetCommentMap.get(threadId).add(commentId);
            });

            let candidateThreadIds = Array.from(threadNotifyMap.keys());
            if (!candidateThreadIds.length) {
                const recentThreads = await this.storage.listThreads({ sortBy: 'recent_comment', limit: 80 });
                candidateThreadIds = (Array.isArray(recentThreads) ? recentThreads : [])
                    .filter((thread) => {
                        const identity = thread?.authorIdentity || {};
                        const type = String(identity.authorType || identity.author_type || '').trim();
                        const id = String(identity.authorId || identity.author_id || '').trim();
                        return type === 'char' && id === targetCharId;
                    })
                    .map((thread) => String(thread.id || '').trim())
                    .filter(Boolean);
            }

            candidateThreadIds = Array.from(new Set(candidateThreadIds));
            if (!candidateThreadIds.length) {
                return { handledCount: 0, plannedCount: 0, threadIds: [] };
            }

            const maxPossible = Math.min(maxThreads, candidateThreadIds.length);
            const plannedCount = maxPossible <= minThreads
                ? maxPossible
                : (minThreads + Math.floor(Math.random() * (maxPossible - minThreads + 1)));
            const selectedThreadIds = candidateThreadIds.slice(0, plannedCount);

            let handledCount = 0;
            for (const threadId of selectedThreadIds) {
                try {
                    const targetCommentIds = Array.from(threadTargetCommentMap.get(threadId) || []);
                    await ForumLink.ai.checkReplies({
                        charId: targetCharId,
                        threadId,
                        userId: this.viewerUserId,
                        targetCommentIds
                    });
                    handledCount += 1;
                } catch (error) {
                    console.warn('立即回复：处理线程失败', threadId, error);
                }
            }

            const readIds = [];
            selectedThreadIds.forEach((threadId) => {
                const list = threadNotifyMap.get(threadId) || [];
                list.forEach((item) => {
                    const id = String(item?.id || '').trim();
                    if (id) readIds.push(id);
                });
            });
            if (readIds.length && this.storage && typeof this.storage.markNotificationsRead === 'function') {
                try {
                    await this.storage.markNotificationsRead({ ids: Array.from(new Set(readIds)) });
                } catch (error) {
                    console.warn('立即回复：标记消息已读失败', error);
                }
            }

            return {
                handledCount,
                plannedCount: selectedThreadIds.length,
                threadIds: selectedThreadIds
            };
        },

        async runCharActionNow(type) {
            const actionType = String(type || '').trim();
            if (!['post', 'browse', 'reply'].includes(actionType)) return;

            const selectedCharId = this.settingsState && this.settingsState.selectedCharId
                ? String(this.settingsState.selectedCharId)
                : String(this.getActiveCharId() || '');
            if (!selectedCharId) {
                alert('请先选择角色');
                return;
            }

            if (this.actionInFlight[actionType]) return;
            this.actionInFlight[actionType] = true;

            try {
                const saved = await this.saveForumSettings({ silent: true });
                if (!saved) {
                    alert('当前设置保存失败，请先重试保存');
                    return;
                }

                if (actionType === 'post') {
                    await this.triggerCharPost(selectedCharId);
                    alert('已触发该角色发帖');
                } else if (actionType === 'browse') {
                    await this.triggerCharBrowse(selectedCharId, {
                        // 单次“立即刷帖”最多允许 5 条楼中楼回复，避免一轮刷出过多回复。
                        maxReplyActions: 5
                    });
                    alert('已触发该角色刷帖');
                } else {
                    const result = await this.triggerCharReply(selectedCharId);
                    const count = Number(result?.handledCount || 0);
                    if (count > 0) {
                        alert(`已触发该角色立即回复，处理了 ${count} 个帖子`);
                    } else {
                        alert('已触发立即回复，但暂时没有可处理的回帖');
                    }
                }
            } catch (error) {
                console.error('触发角色论坛动作失败', error);
                if (actionType === 'post') {
                    alert('触发发帖失败，请稍后重试');
                } else if (actionType === 'browse') {
                    alert('触发刷帖失败，请稍后重试');
                } else {
                    alert('触发立即回复失败，请稍后重试');
                }
            } finally {
                this.actionInFlight[actionType] = false;
            }
        },

        async refreshCharForumMemoryNow() {
            const selectedCharId = this.settingsState && this.settingsState.selectedCharId
                ? String(this.settingsState.selectedCharId)
                : String(this.getActiveCharId() || '');
            if (!selectedCharId) {
                alert('请先选择角色');
                return;
            }
            if (this.actionInFlight.resetmemory) return;
            if (!this.storage || typeof this.storage.resetCharForumMemory !== 'function') {
                alert('当前论坛存储不支持“刷新论坛记忆”。');
                return;
            }

            const confirmed = window.confirm(
                '确认刷新这个角色的论坛记忆吗？\n\n只会清空“论坛记忆注入”缓存，不会删除历史帖子、评论、楼中楼或点赞记录。'
            );
            if (!confirmed) return;

            this.actionInFlight.resetmemory = true;
            try {
                const result = await this.storage.resetCharForumMemory({ charId: selectedCharId });
                if (!result || result.ok === false) {
                    throw new Error(result?.code || 'reset_failed');
                }
                const deletedMemories = Math.max(0, Number(result.deletedMemories || 0));
                alert(`已刷新论坛记忆注入缓存：清理记忆 ${deletedMemories} 条。历史帖子/评论/点赞均已保留。`);
                await this.renderCharSettingsView(selectedCharId);
            } catch (error) {
                console.error('刷新论坛记忆失败', error);
                alert('刷新论坛记忆失败，请稍后重试。');
            } finally {
                this.actionInFlight.resetmemory = false;
            }
        },

        getOwnedCharsForSettings() {
            const allChars = this.buildSettingsCharPool();
            const viewerId = String(this.viewerUserId || '').trim();
            const metaCharIdSet = new Set(
                Array.from(this.projectCharMeta?.keys?.() || [])
                    .map((id) => String(id || '').trim())
                    .filter(Boolean)
            );
            const ownedChars = allChars.filter((char) => {
                const charId = String(char?.id || '').trim();
                const ownerUserId = String(char?.ownerUserId || char?.owner_user_id || '').trim();
                if (metaCharIdSet.size > 0 && charId && metaCharIdSet.has(charId)) return true;
                return !ownerUserId || ownerUserId === viewerId;
            });
            return ownedChars.length ? ownedChars : allChars;
        },

        async cancelPendingAgentJobs(options = {}) {
            const reason = String(options.reason || 'disabled_by_user').trim() || 'disabled_by_user';
            const targetUserId = String(options.userId || this.viewerUserId || '').trim();
            const statusIn = Array.isArray(options.statusIn) && options.statusIn.length > 0
                ? options.statusIn.map((item) => String(item || '').trim()).filter(Boolean)
                : ['pending', 'retry', 'running'];
            const explicitCharIds = Array.isArray(options.charIds)
                ? options.charIds
                : (options.charId ? [options.charId] : []);
            let targetCharIds = Array.from(new Set(
                explicitCharIds
                    .map((item) => String(item || '').trim())
                    .filter(Boolean)
            ));

            if (!targetCharIds.length && targetUserId) {
                targetCharIds = this.getOwnedCharsForSettings()
                    .filter((char) => {
                        const ownerUserId = String(char?.ownerUserId || char?.owner_user_id || '').trim();
                        return !ownerUserId || ownerUserId === targetUserId;
                    })
                    .map((char) => String(char?.id || '').trim())
                    .filter(Boolean);
            }

            if (this.storage && typeof this.storage.cancelAgentJobs === 'function') {
                try {
                    return await this.storage.cancelAgentJobs({
                        userId: targetUserId || null,
                        charIds: targetCharIds,
                        statusIn,
                        reason
                    });
                } catch (error) {
                    console.warn('cancelPendingAgentJobs via adapter failed', error);
                }
            }

            if (!this.storage || typeof this.storage.listAgentJobs !== 'function' || typeof this.storage.updateAgentJob !== 'function') {
                return 0;
            }

            const statuses = Array.from(new Set(
                statusIn.map((item) => String(item || '').trim()).filter(Boolean)
            ));
            const now = new Date().toISOString();
            const ids = new Set();
            const collectIdsByQuery = async (query = {}) => {
                let offset = 0;
                while (true) {
                    const list = await this.storage.listAgentJobs(Object.assign({}, query, {
                        statusIn: statuses,
                        limit: 500,
                        offset
                    }));
                    const page = Array.isArray(list) ? list : [];
                    page.forEach((job) => {
                        const id = String(job?.id || '').trim();
                        if (id) ids.add(id);
                    });
                    if (page.length < 500) break;
                    offset += page.length;
                }
            };
            if (targetCharIds.length > 0) {
                for (const charId of targetCharIds) {
                    try {
                        await collectIdsByQuery({ charId });
                    } catch (_) { }
                }
            } else {
                try {
                    await collectIdsByQuery({});
                } catch (_) { }
            }

            let updated = 0;
            for (const id of ids) {
                try {
                    const next = await this.storage.updateAgentJob(id, {
                        status: 'canceled',
                        lockedBy: null,
                        lockedAt: null,
                        lastError: reason,
                        finishedAt: now,
                        updatedAt: now
                    });
                    if (next) updated += 1;
                } catch (_) { }
            }
            return updated;
        },

        async flushAgentBacklogNow(options = {}) {
            if (this.actionInFlight.flushqueue) return;
            const confirmed = options.skipConfirm === true
                ? true
                : window.confirm('确认清空当前账号的积压任务吗？不会改动开关，仅取消 pending/retry/running 队列。');
            if (!confirmed) return;

            this.actionInFlight.flushqueue = true;
            try {
                const canceled = await this.cancelPendingAgentJobs({
                    userId: this.viewerUserId,
                    statusIn: ['pending', 'retry', 'running'],
                    reason: String(options.reason || 'manual_backlog_flush').trim() || 'manual_backlog_flush'
                });
                const count = Math.max(0, Number(canceled) || 0);
                alert(count > 0 ? `已取消 ${count} 个积压任务。` : '没有发现可取消的积压任务。');
                await this.renderCharSettingsView(this.settingsState?.selectedCharId || this.getActiveCharId());
                return { ok: true, canceled: count };
            } catch (error) {
                console.error('清空积压任务失败', error);
                alert('清空积压任务失败，请稍后重试。');
                return { ok: false, canceled: 0 };
            } finally {
                this.actionInFlight.flushqueue = false;
            }
        },

        async closeAllAgents() {
            if (this.isAgentTemporarilyDisabled()) {
                alert('Agent 功能暂时关闭。');
                return;
            }
            if (this.actionInFlight.disableall) return;
            const confirmed = window.confirm('确认关闭全局自动任务吗？会保留各角色开关状态，并取消待执行队列。手动“立即执行”仍可用。');
            if (!confirmed) return;

            this.actionInFlight.disableall = true;
            try {
                this.ensureSettingsState();
                this.settingsState.userAgentGlobalEnabled = false;
                this.settingsState.userAgentGlobalLoaded = true;

                const saved = await this.saveForumSettings({
                    silent: true,
                    saveAllChars: false,
                    skipQueueCancel: true
                });
                if (!saved) {
                    alert('关闭全局自动任务失败：设置保存失败。');
                    return;
                }
                const canceled = await this.cancelPendingAgentJobs({
                    userId: this.viewerUserId,
                    statusIn: ['pending', 'retry', 'running'],
                    reason: 'disabled_by_user'
                });
                alert(`已关闭全局自动任务（已保留角色开关）${canceled > 0 ? `，并取消 ${canceled} 个待执行任务` : ''}。`);
                await this.renderCharSettingsView(this.settingsState.selectedCharId || this.getActiveCharId());
            } catch (error) {
                console.error('关闭全局自动任务失败', error);
                alert('关闭全局自动任务失败，请稍后重试。');
            } finally {
                this.actionInFlight.disableall = false;
            }
        },

        normalizeAgentApiNode(node = {}) {
            const source = node && typeof node === 'object' ? node : {};
            const rawUrl = String(source.url || '').trim();
            const normalizedUrl = !rawUrl
                ? ''
                : (/\/chat\/completions\/?$/i.test(rawUrl)
                    ? rawUrl.replace(/\/+$/, '')
                    : (rawUrl.endsWith('/') ? `${rawUrl}chat/completions` : `${rawUrl}/chat/completions`));
            return {
                url: normalizedUrl,
                key: String(source.key || '').trim(),
                model: String(source.model || '').trim()
            };
        },

        normalizeAgentApiProfile(rawProfile = {}) {
            const source = rawProfile && typeof rawProfile === 'object' ? rawProfile : {};
            return {
                main: this.normalizeAgentApiNode(source.main || {}),
                sub1: this.normalizeAgentApiNode(source.sub1 || {}),
                sub2: this.normalizeAgentApiNode(source.sub2 || {})
            };
        },

        hasUsableAgentApiProfile(profile = {}) {
            const normalized = this.normalizeAgentApiProfile(profile);
            return [normalized.main, normalized.sub1, normalized.sub2]
                .some((node) => Boolean(node.url && node.key));
        },

        async syncAgentApiProfileFromBridge(options = {}) {
            const force = Boolean(options && options.force === true);
            const userId = String(this.viewerUserId || this.state.userId || '').trim();
            if (!userId) return { ok: false, code: 'missing_user_id' };

            const bridge = this.getProjectBridge();
            if (!bridge || typeof bridge.getApiProfile !== 'function') {
                return { ok: false, code: 'missing_bridge' };
            }

            const rawProfile = await bridge.getApiProfile();
            const profile = this.normalizeAgentApiProfile(rawProfile);
            if (!this.hasUsableAgentApiProfile(profile)) {
                return { ok: false, code: 'bridge_profile_empty', profile };
            }

            const signature = JSON.stringify(profile);
            if (!force && signature && this.agentApiProfileSyncSignature === signature) {
                return { ok: true, code: 'unchanged' };
            }

            if (this.storage && typeof this.storage.upsertAgentApiProfile === 'function') {
                await this.storage.upsertAgentApiProfile({ userId, profile });
                this.agentApiProfileSyncSignature = signature;
                return { ok: true, code: 'synced' };
            }

            return { ok: false, code: 'missing_storage_writer' };
        },

        getForumWorkerEndpointUrl() {
            if (this.storage && typeof this.storage.getWorkerEndpointUrl === 'function') {
                const base = String(this.storage.getWorkerEndpointUrl() || '').trim();
                if (base) return base.replace(/\/+$/, '');
            }
            return String(
                (window.IDIC_FORUM_CONFIG && window.IDIC_FORUM_CONFIG.forumWorkerBaseUrl)
                || ''
            ).trim().replace(/\/+$/, '');
        },

        async runAgentBackendSelfCheck(options = {}) {
            const showHint = options && options.showHint === true;
            const userId = String(this.viewerUserId || this.state.userId || '').trim();
            const result = {
                ok: false,
                code: 'unknown',
                userId,
                activeCharId: String(this.getActiveCharId() || '').trim(),
                bridgeBound: false,
                bridgeUsable: false,
                dbUsable: false,
                ownerMismatch: false,
                ownerId: '',
                userGlobalAgentEnabled: false,
                charAgentEnabled: null,
                charAutoBrowseEnabled: null,
                charAutoPostEnabled: null,
                charReplyOnBrowse: null,
                browseIntervalRaw: '',
                postIntervalRaw: '',
                browseIntervalMinutes: 0,
                postIntervalMinutes: 0,
                browseTimes: [],
                postTimes: [],
                recentJobCount: 0,
                duePendingJobs: 0,
                latestJobStatus: '',
                latestJobAt: '',
                jobStatusSummary: {},
                userRecentJobCount: 0,
                userLatestJobStatus: '',
                userLatestJobAt: '',
                workerEndpoint: '',
                workerEndpointReachable: null,
                workerHttpStatus: 0,
                workerHealthNow: ''
            };

            if (!userId) {
                result.code = 'missing_user_id';
                if (showHint) alert('Agent自检失败：论坛用户ID为空，请关闭论坛后重进。');
                return result;
            }

            const bridge = this.getProjectBridge();
            result.bridgeBound = Boolean(bridge && typeof bridge.getApiProfile === 'function');
            if (!result.bridgeBound) {
                result.code = 'missing_bridge';
                if (showHint) alert('Agent自检失败：论坛入口未绑定桥接，无法读取IDIC API设置。');
                return result;
            }

            let bridgeProfile = {};
            try {
                bridgeProfile = this.normalizeAgentApiProfile(await bridge.getApiProfile());
            } catch (_error) {
                result.code = 'bridge_profile_read_failed';
                if (showHint) alert('Agent自检失败：读取IDIC API设置失败。');
                return result;
            }
            result.bridgeUsable = this.hasUsableAgentApiProfile(bridgeProfile);
            if (!result.bridgeUsable) {
                result.code = 'bridge_profile_empty';
                if (showHint) alert('Agent自检失败：未检测到可用API（主/副API为空）。');
                return result;
            }

            const sync = await this.syncAgentApiProfileFromBridge({ force: true });
            if (!sync.ok) {
                result.code = sync.code || 'sync_failed';
                if (showHint) alert('Agent自检失败：API写入论坛数据库失败。');
                return result;
            }

            if (this.storage && typeof this.storage.getAgentApiProfile === 'function') {
                const row = await this.storage.getAgentApiProfile(userId);
                const dbProfile = this.normalizeAgentApiProfile(row?.profile || {});
                result.dbUsable = this.hasUsableAgentApiProfile(dbProfile);
            } else {
                result.dbUsable = true;
            }

            if (!result.dbUsable) {
                result.code = 'db_profile_missing';
                if (showHint) alert('Agent自检失败：数据库里未检测到可用API。');
                return result;
            }

            const workerEndpoint = this.getForumWorkerEndpointUrl();
            result.workerEndpoint = workerEndpoint;
            if (workerEndpoint) {
                const healthUrl = `${workerEndpoint}?health=1&t=${Date.now()}`;
                try {
                    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
                    const timer = controller
                        ? setTimeout(() => {
                            try { controller.abort(); } catch (_) { }
                        }, 6000)
                        : null;
                    const response = await fetch(healthUrl, {
                        method: 'GET',
                        cache: 'no-store',
                        signal: controller ? controller.signal : undefined
                    });
                    if (timer) clearTimeout(timer);
                    result.workerHttpStatus = Number(response.status) || 0;
                    result.workerEndpointReachable = Boolean(response.ok);
                    if (response.ok) {
                        const payload = await response.json().catch(() => ({}));
                        result.workerHealthNow = String(payload?.now || payload?.serverNow || '').trim();
                    }
                } catch (_error) {
                    result.workerEndpointReachable = false;
                }
            }

            if (result.activeCharId && this.storage && typeof this.storage.getChar === 'function') {
                try {
                    if (this.storage && typeof this.storage.getUser === 'function') {
                        const user = await this.storage.getUser(userId);
                        result.userGlobalAgentEnabled = this.parseBooleanSetting(
                            user?.settings?.forumAgentGlobalEnabled,
                            false
                        );
                    }
                    const activeChar = await this.storage.getChar(result.activeCharId);
                    result.ownerId = String(activeChar?.ownerUserId || activeChar?.owner_user_id || '').trim();
                    result.ownerMismatch = Boolean(result.ownerId && result.ownerId !== userId);
                    result.charAgentEnabled = this.parseBooleanSetting(activeChar?.settings?.agentEnabled, false);
                    result.charAutoBrowseEnabled = this.parseBooleanSetting(activeChar?.settings?.autoBrowseEnabled, false);
                    result.charAutoPostEnabled = this.parseBooleanSetting(activeChar?.settings?.autoPostEnabled, false);
                    result.charReplyOnBrowse = this.parseBooleanSetting(activeChar?.settings?.replyOnBrowse, true);
                    result.browseIntervalRaw = String(activeChar?.settings?.browseInterval || '').trim();
                    result.postIntervalRaw = String(activeChar?.settings?.postInterval || '').trim();
                    result.browseIntervalMinutes = this.parseIntervalMinutes(result.browseIntervalRaw);
                    result.postIntervalMinutes = this.parseIntervalMinutes(result.postIntervalRaw);
                    result.browseTimes = Array.isArray(activeChar?.settings?.browseTimes)
                        ? activeChar.settings.browseTimes.map((item) => String(item || '').trim()).filter(Boolean)
                        : [];
                    result.postTimes = Array.isArray(activeChar?.settings?.postTimes)
                        ? activeChar.settings.postTimes.map((item) => String(item || '').trim()).filter(Boolean)
                        : [];
                } catch (_error) { }
            } else if (this.storage && typeof this.storage.getUser === 'function') {
                try {
                    const user = await this.storage.getUser(userId);
                    result.userGlobalAgentEnabled = this.parseBooleanSetting(
                        user?.settings?.forumAgentGlobalEnabled,
                        false
                    );
                } catch (_error) { }
            }

            if (result.activeCharId && this.storage && typeof this.storage.listAgentJobs === 'function') {
                try {
                    const nowMs = Date.now();
                    const jobs = await this.storage.listAgentJobs({
                        charId: result.activeCharId,
                        limit: 80
                    });
                    const list = Array.isArray(jobs) ? jobs : [];
                    result.recentJobCount = list.length;
                    const statusSummary = {};
                    let duePendingJobs = 0;
                    list.forEach((job) => {
                        const status = String(job?.status || '').trim() || 'unknown';
                        statusSummary[status] = Number(statusSummary[status] || 0) + 1;
                        if (status === 'pending' || status === 'retry') {
                            const runAt = new Date(job?.runAt || job?.run_at || job?.updatedAt || job?.updated_at || job?.createdAt || job?.created_at || 0).getTime();
                            if (Number.isFinite(runAt) && runAt > 0 && runAt <= nowMs) {
                                duePendingJobs += 1;
                            }
                        }
                    });
                    result.jobStatusSummary = statusSummary;
                    result.duePendingJobs = duePendingJobs;
                    const latest = list
                        .slice()
                        .sort((a, b) => {
                            const ta = new Date(a?.updatedAt || a?.updated_at || a?.createdAt || a?.created_at || 0).getTime();
                            const tb = new Date(b?.updatedAt || b?.updated_at || b?.createdAt || b?.created_at || 0).getTime();
                            return tb - ta;
                        })[0];
                    if (latest) {
                        result.latestJobStatus = String(latest?.status || '').trim();
                        result.latestJobAt = String(latest?.updatedAt || latest?.updated_at || latest?.createdAt || latest?.created_at || '').trim();
                    }
                } catch (_error) { }
            }

            if (this.storage && typeof this.storage.listAgentJobs === 'function') {
                try {
                    const ownedCharIds = Array.from(new Set(
                        this.getOwnedCharsForSettings()
                            .map((char) => String(char?.id || '').trim())
                            .filter(Boolean)
                    ));
                    const merged = [];
                    for (const charId of ownedCharIds.slice(0, 40)) {
                        const rows = await this.storage.listAgentJobs({ charId, limit: 20 });
                        if (Array.isArray(rows) && rows.length > 0) merged.push(...rows);
                    }
                    result.userRecentJobCount = merged.length;
                    const latestUserJob = merged
                        .slice()
                        .sort((a, b) => {
                            const ta = new Date(a?.updatedAt || a?.updated_at || a?.createdAt || a?.created_at || 0).getTime();
                            const tb = new Date(b?.updatedAt || b?.updated_at || b?.createdAt || b?.created_at || 0).getTime();
                            return tb - ta;
                        })[0];
                    if (latestUserJob) {
                        result.userLatestJobStatus = String(latestUserJob?.status || '').trim();
                        result.userLatestJobAt = String(
                            latestUserJob?.updatedAt
                            || latestUserJob?.updated_at
                            || latestUserJob?.createdAt
                            || latestUserJob?.created_at
                            || ''
                        ).trim();
                    }
                } catch (_error) { }
            }

            result.ok = true;
            result.code = 'ok';
            return result;
        },

        async runAgentSelfCheckNow() {
            if (this.isAgentTemporarilyDisabled()) {
                alert('Agent 功能暂时关闭。');
                return { ok: false, code: 'agent_disabled' };
            }
            if (this.actionInFlight.selfcheck) return;
            this.actionInFlight.selfcheck = true;
            try {
                if (!this.isAgentBackendConfigured()) {
                    const missingHint = this.getAgentBackendMissingHint();
                    alert(`Agent自检失败：请先在论坛设置填写并保存后端配置（${missingHint || '缺少配置'}）。`);
                    return { ok: false, code: 'backend_not_configured' };
                }
                const saved = await this.saveForumSettings({ silent: true });
                if (!saved) {
                    alert('Agent自检失败：论坛设置写入数据库失败，请先点一次保存设置再重试。');
                    return { ok: false, code: 'save_settings_failed' };
                }
                const result = await this.runAgentBackendSelfCheck({ showHint: false });
                const jobSummaryText = result.jobStatusSummary && typeof result.jobStatusSummary === 'object'
                    ? Object.keys(result.jobStatusSummary)
                        .sort()
                        .map((key) => `${key}:${result.jobStatusSummary[key]}`)
                        .join('，')
                    : '';
                const lines = [
                    result.ok ? 'Agent自检结果：通过' : 'Agent自检结果：失败',
                    `状态码：${result.code || 'unknown'}`,
                    `论坛用户ID：${result.userId || '(空)'}`,
                    `当前角色ID：${result.activeCharId || '(空)'}`,
                    `桥接状态：${result.bridgeBound ? '已绑定' : '未绑定'}`,
                    `桥接API：${result.bridgeUsable ? '可用' : '不可用/为空'}`,
                    `数据库API：${result.dbUsable ? '已同步可用' : '未同步或为空'}`,
                    `后端Worker连通：${result.workerEndpointReachable === null ? '未检测' : (result.workerEndpointReachable ? '正常' : '失败')}${result.workerHttpStatus ? ` (HTTP ${result.workerHttpStatus})` : ''}`,
                    `全局自动任务：${result.userGlobalAgentEnabled ? '开启' : '关闭'}`,
                    `当前角色Agent：${result.charAgentEnabled === null ? '未知' : (result.charAgentEnabled ? '开启' : '关闭')}`,
                    `自动刷帖：${result.charAutoBrowseEnabled === null ? '未知' : (result.charAutoBrowseEnabled ? '开启' : '关闭')}（间隔=${result.browseIntervalMinutes || 0}分钟，定时=${(result.browseTimes || []).join(', ') || '无'}）`,
                    `自动发帖：${result.charAutoPostEnabled === null ? '未知' : (result.charAutoPostEnabled ? '开启' : '关闭')}（间隔=${result.postIntervalMinutes || 0}分钟，定时=${(result.postTimes || []).join(', ') || '无'}）`,
                    `浏览后自动回复：${result.charReplyOnBrowse === null ? '未知' : (result.charReplyOnBrowse ? '开启' : '关闭')}`,
                    `当前角色最近任务数：${result.recentJobCount || 0}${jobSummaryText ? `（${jobSummaryText}）` : ''}`,
                    `当前用户最近任务总数：${result.userRecentJobCount || 0}`
                ];
                if (result.workerHealthNow) lines.push(`后端Worker时间：${result.workerHealthNow}`);
                if (result.workerEndpoint) lines.push(`后端Worker地址：${result.workerEndpoint}`);
                if (result.ownerId) lines.push(`角色归属用户ID：${result.ownerId}`);
                if (result.ownerMismatch) lines.push('警告：当前角色归属用户与论坛当前用户不一致。');
                if (!result.userGlobalAgentEnabled || result.charAgentEnabled === false) {
                    lines.push('提示：当前自动任务被开关拦截（这是正常现象）。');
                }
                if ((Number(result.duePendingJobs) || 0) > 0) {
                    lines.push(`警告：有 ${result.duePendingJobs} 个任务已到执行时间但仍在队列，通常是 worker/cron 未正常触发。`);
                }
                if (result.latestJobStatus) {
                    lines.push(`最新任务：${result.latestJobStatus}${result.latestJobAt ? ` @ ${result.latestJobAt}` : ''}`);
                }
                if (
                    result.userGlobalAgentEnabled
                    && result.charAgentEnabled
                    && (result.charAutoBrowseEnabled || result.charAutoPostEnabled)
                    && Number(result.recentJobCount || 0) === 0
                ) {
                    lines.push('警告：当前角色没有任何自动任务记录，优先检查该角色归属用户ID与API profile是否一致。');
                }
                if (
                    result.userGlobalAgentEnabled
                    && Number(result.userRecentJobCount || 0) > 0
                    && Number(result.recentJobCount || 0) === 0
                ) {
                    lines.push('提示：同一用户下有其他角色在跑任务，但当前角色没有任务记录。请确认你正在检查的角色是否开启了 Agent + 自动刷帖/发帖。');
                }
                if (
                    result.userGlobalAgentEnabled
                    && result.charAgentEnabled
                    && (result.charAutoBrowseEnabled || result.charAutoPostEnabled)
                    && result.workerEndpointReachable === false
                ) {
                    lines.push('警告：后端 Worker 连通失败。当前页面不会再用本地兜底，请优先检查 Edge Function 部署、网络与函数地址。');
                }
                alert(lines.join('\n'));
                return result;
            } catch (error) {
                const message = String(error?.message || error || 'unknown');
                alert(`Agent自检异常：${message}`);
                return { ok: false, code: 'selfcheck_exception', error: message };
            } finally {
                this.actionInFlight.selfcheck = false;
            }
        },

        async enableForumPushNotifications() {
            if (this.actionInFlight.pushenable) return;
            this.actionInFlight.pushenable = true;
            try {
                const bridge = this.getProjectBridge();
                if (!bridge || typeof bridge.enableForumPushNotifications !== 'function') {
                    alert('当前入口未提供离线推送能力。');
                    return { ok: false, code: 'missing_bridge_method' };
                }
                const result = await bridge.enableForumPushNotifications({ requestPermission: true });
                if (result && result.ok) {
                    const warning = String(result.warning || '').trim();
                    if (warning) {
                        alert(`离线推送已启用（浏览器返回了可忽略警告）。\n${warning}`);
                    } else {
                        alert('离线推送已启用。你现在可以在后台收到角色论坛汇报。');
                    }
                } else {
                    const code = String(result?.code || 'unknown');
                    const detail = String(result?.error || '').trim();
                    if (code === 'missing_vapid_public_key') {
                        alert('离线推送暂未完成后端配置（缺少 VAPID 公钥）。');
                    } else if (code === 'permission_denied') {
                        alert('浏览器通知权限被拒绝，请在浏览器设置里手动开启通知权限后重试。');
                    } else if (code === 'permission_not_granted') {
                        alert('你还没有授权通知权限，离线推送暂不可用。');
                    } else if (code === 'push_not_supported') {
                        alert('当前浏览器环境不支持 Push 推送。');
                    } else if (code === 'subscribe_failed') {
                        alert(`离线推送订阅失败：${detail || '浏览器拒绝了 Push 订阅请求。'}`);
                    } else if (code === 'service_worker_not_ready') {
                        alert(`离线推送失败：Service Worker 尚未就绪。${detail ? `\n${detail}` : ''}`);
                    } else if (code === 'sync_failed') {
                        alert(`离线推送失败：订阅已创建，但写入数据库失败。${detail ? `\n${detail}` : ''}`);
                    } else {
                        alert(`离线推送启用失败：${code}${detail ? `\n${detail}` : ''}`);
                    }
                }
                return result || { ok: false, code: 'unknown' };
            } catch (error) {
                const message = String(error?.message || error || 'unknown');
                alert(`离线推送启用异常：${message}`);
                return { ok: false, code: 'push_enable_exception', error: message };
            } finally {
                this.actionInFlight.pushenable = false;
            }
        },

        // --- 核心导航逻辑 ---

        async open() {
            try {
                await this.init();
                if (!this.isReady) return;
                if (!this.el.viewContainer) {
                    this.cacheElements();
                }
                if (!this.el.viewContainer) {
                    console.warn('ForumUI.open: view container missing', this.initError);
                    return;
                }
                if (this.el.root) this.el.root.classList.add('active');
                await this.navigate('home', null, true); // 打开时重置并去首页
                await this.refreshNotificationBadge();
            } catch (error) {
                console.error('ForumUI.open failed', error);
            }
        },

        close() {
            if (this.el.root) this.el.root.classList.remove('active');
        },

        isTopLevelView(viewName) {
            const view = String(viewName || '').trim();
            return ['home', 'user', 'char', 'notifications', 'settings'].includes(view);
        },

        /**
         * 导航到指定视图
         * @param {string} viewName - 视图名称 (home, section, channel, thread, create_thread, user, char, notifications, settings)
         * @param {object} params - 传递给视图的参数
         * @param {boolean} reset - 是否重置历史栈（如回到首页）
         */
        async navigate(viewName, params = {}, reset = false) {
            if (!this.el.viewContainer) {
                await this.init();
            }
            if (!this.el.viewContainer) {
                console.warn('ForumUI.navigate: view container missing');
                return;
            }
            const nextView = String(viewName || '').trim() || 'home';
            const nextParams = params && typeof params === 'object'
                ? Object.assign({}, params)
                : {};
            if (reset) {
                this.history = [];
            } else {
                // 如果不是重置，把当前视图推入历史栈（只有当不是从Back操作触发时...额，简化处理，navigate 总是前进）
                // 实际 render 前我们需要知道"上一个视图"是谁以便保存状态，这里简化，只存 viewName 和 params
            }

            // 渲染视图前，先记录当前位置到历史（如果不是reset且不是replace）
            // 为了简单，我们只在 navigate 时 push *当前正在显示的视图* 到栈里？
            // 不，标准做法：navigate 是去新页面。去之前，把"当前页面"压栈。
            // 但第一次打开 activeView 是空的。

            const currentEntry = this.currentHistoryEntry;
            if (!reset && currentEntry) {
                const currentView = String(currentEntry.view || '').trim();
                const fromTopLevel = this.isTopLevelView(currentView);
                const toTopLevel = this.isTopLevelView(nextView);
                // 顶部入口页之间互跳不入栈，避免“设置 -> 主页 -> 返回又回设置”。
                if (!(fromTopLevel && toTopLevel)) {
                    this.history.push(currentEntry);
                }
            }

            this.currentHistoryEntry = { view: nextView, params: nextParams };

            await this.renderView(nextView, nextParams);
            this.updateHeaderState();
        },

        /**
         * 返回上一页
         * 逻辑：根据层级关系返回，或者根据历史栈返回。
         * 用户要求：帖子 -> 频道 -> 分区 -> 首页
         * 我们采用"混合模式"：如果有历史栈，优先出栈；但必须符合逻辑层级。
         * 实际上，为了符合用户的"层级"要求，我们在 navigate 时就应该构建好路径。
         * 这里直接用 history stack 最简单，只要确保 navigate 路径是对的。
         */
        async goBack() {
            const currentView = String(this.currentHistoryEntry?.view || '').trim();
            const currentIsTopLevel = this.isTopLevelView(currentView);

            let previous = null;
            while (this.history.length > 0) {
                const candidate = this.history.pop();
                if (!candidate) continue;
                const candidateView = String(candidate.view || '').trim();
                if (currentIsTopLevel && this.isTopLevelView(candidateView)) {
                    continue;
                }
                previous = candidate;
                break;
            }

            if (!previous) {
                // 如果没有历史了，就回首页；如果已在首页，就关闭
                if (currentView === 'home') {
                    this.close();
                } else {
                    await this.navigate('home', null, true);
                }
                return;
            }

            this.currentHistoryEntry = previous;
            await this.renderView(previous.view, previous.params);
            this.updateHeaderState();
        },

        updateHeaderState() {
            const currentView = String(this.currentHistoryEntry?.view || '').trim();
            const isHome = !currentView || (currentView === 'home' && this.history.length === 0);
            this.el.backBtn.style.display = isHome ? 'none' : 'flex';
            this.el.backBtn.title = this.history.length > 0 ? "返回上一页" : "返回上一层";

            // 更新面包屑或标题
            const v = this.currentHistoryEntry;
            let titleHTML = '全息甲板';

            if (v) {
                switch (v.view) {
                    case 'global_feed':
                        titleHTML = '全区动态';
                        break;
                    case 'section':
                        titleHTML = `分区 <span class="forum-breadcrumb">/ ${this.state.currentSection?.name || ''}</span>`;
                        break;
                    case 'channel':
                        titleHTML = `频道 <span class="forum-breadcrumb">/ ${this.state.currentChannel?.name || ''}</span>`;
                        break;
                    case 'thread':
                        titleHTML = `帖子 <span class="forum-breadcrumb">/ ${this.state.currentChannel?.name || '...'}</span>`;
                        break;
                    case 'create_thread':
                        titleHTML = '发布新帖';
                        break;
                    case 'user':
                        titleHTML = '用户主页';
                        break;
                    case 'char':
                        titleHTML = 'TA的主页';
                        break;
                    case 'notifications':
                        titleHTML = '消息中心';
                        break;
                    case 'settings':
                        titleHTML = '论坛设置';
                        break;
                }
            }
            this.el.titleArea.innerHTML = titleHTML;

            const viewName = this.currentHistoryEntry?.view || 'home';
            const homeBtn = this.el.homeBtn || document.getElementById('forum-home-btn');
            const userBtn = this.el.myMenuBtn || document.getElementById('forum-my-user-btn');
            const notificationBtn = this.el.notificationBtn || document.getElementById('forum-notification-btn');
            const settingsBtn = this.el.settingsBtn || document.getElementById('forum-settings-btn');
            if (!homeBtn || !userBtn || !settingsBtn || !notificationBtn) return;
            homeBtn.classList.remove('is-active');
            userBtn.classList.remove('is-active');
            notificationBtn.classList.remove('is-active');
            settingsBtn.classList.remove('is-active');
            if (viewName === 'settings') {
                settingsBtn.classList.add('is-active');
            } else if (viewName === 'notifications') {
                notificationBtn.classList.add('is-active');
            } else if (viewName === 'user' || viewName === 'char') {
                userBtn.classList.add('is-active');
            } else {
                homeBtn.classList.add('is-active');
            }
        },

        // --- 视图渲染调度 ---

        async renderView(viewName, params) {
            if (!this.el.viewContainer) {
                this.cacheElements();
            }
            if (!this.el.viewContainer) {
                console.warn('ForumUI.renderView: view container missing');
                return;
            }
            this.el.viewContainer.innerHTML = '<div style="padding:40px;text-align:center;color:#666;">加载中...</div>';

            // 滚动回顶部
            this.el.viewContainer.scrollTop = 0;

            switch (viewName) {
                case 'home':
                    await this.renderHomeView();
                    break;
                case 'section':
                    await this.renderSectionView(params.sectionId);
                    break;
                case 'channel':
                    await this.renderChannelView(params.channelId);
                    break;
                case 'thread':
                    await this.renderThreadView(params.threadId, params.highlightCommentId || null);
                    break;
                case 'create_thread':
                    await this.renderCreateThreadView(params.channelId);
                    break;
                case 'user':
                    await this.renderUserProfileView(params.userId, params.charId);
                    break;
                case 'char':
                    await this.renderCharProfileView(params.charId);
                    break;
                case 'global_feed':
                    await this.renderGlobalFeedView(params?.sortBy || 'newest', params?.page || 1);
                    break;
                case 'notifications':
                    await this.renderNotificationView(params?.tab || 'engagement');
                    break;
                case 'settings':
                    await this.renderCharSettingsView(params.charId);
                    this.requestProjectCharSync({
                        background: true,
                        minIntervalMs: 20000,
                        syncOptions: {
                            maxAttempts: 2,
                            retryDelayMs: 120,
                            fastMode: true
                        }
                    });
                    break;
            }
        },

        normalizeNotificationTab(tab) {
            const safeTab = String(tab || '').trim();
            if (safeTab === 'mention') return 'mention';
            if (safeTab === 'char') return 'char';
            return 'engagement';
        },

        getNotificationCategoryByTab(tab) {
            const safeTab = this.normalizeNotificationTab(tab);
            return safeTab === 'mention' ? 'mention' : 'engagement';
        },

        getNotificationTarget(tab) {
            const safeTab = this.normalizeNotificationTab(tab);
            if (safeTab === 'char') {
                const charId = String(this.getActiveCharId() || '').trim();
                return {
                    receiverType: 'char',
                    receiverId: charId
                };
            }
            return {
                receiverType: 'user',
                receiverId: String(this.viewerUserId || '').trim()
            };
        },

        getNotificationPageSize(tab) {
            const safeTab = this.normalizeNotificationTab(tab);
            return safeTab === 'char' ? 20 : Math.max(1, Number(this.notificationState?.pageSize) || 30);
        },

        ensureNotificationFeedState(tab) {
            const safeTab = this.normalizeNotificationTab(tab);
            if (!this.notificationState || typeof this.notificationState !== 'object') {
                this.notificationState = {
                    unreadCount: 0,
                    pageSize: 30,
                    feeds: {}
                };
            }
            if (!this.notificationState.feeds || typeof this.notificationState.feeds !== 'object') {
                this.notificationState.feeds = {};
            }
            if (!this.notificationState.feeds[safeTab]) {
                this.notificationState.feeds[safeTab] = {
                    offset: 0,
                    hasMore: false,
                    items: [],
                    page: 1,
                    pageSize: this.getNotificationPageSize(safeTab),
                    totalPages: 1,
                    totalCount: 0
                };
            }
            const feed = this.notificationState.feeds[safeTab];
            if (!Array.isArray(feed.items)) feed.items = [];
            if (!Number.isFinite(Number(feed.offset)) || Number(feed.offset) < 0) feed.offset = 0;
            feed.hasMore = Boolean(feed.hasMore);
            const defaultPageSize = this.getNotificationPageSize(safeTab);
            if (!Number.isFinite(Number(feed.page)) || Number(feed.page) <= 0) feed.page = 1;
            if (!Number.isFinite(Number(feed.pageSize)) || Number(feed.pageSize) <= 0) feed.pageSize = defaultPageSize;
            if (!Number.isFinite(Number(feed.totalPages)) || Number(feed.totalPages) <= 0) feed.totalPages = 1;
            if (!Number.isFinite(Number(feed.totalCount)) || Number(feed.totalCount) < 0) feed.totalCount = 0;
            return this.notificationState.feeds[safeTab];
        },

        resetNotificationFeed(tab) {
            const safeTab = this.normalizeNotificationTab(tab);
            const feed = this.ensureNotificationFeedState(safeTab);
            feed.offset = 0;
            feed.hasMore = false;
            feed.items = [];
            feed.page = 1;
            feed.pageSize = this.getNotificationPageSize(safeTab);
            feed.totalPages = 1;
            feed.totalCount = 0;
            return feed;
        },

        getNotificationTypeLabel(type) {
            const map = {
                like_thread: '点赞了你的帖子',
                like_comment: '点赞了你的评论',
                comment_thread: '评论了你的帖子',
                reply_comment: '回复了你的评论',
                mention_thread: '在帖子里@了你',
                mention_comment: '在评论里@了你',
                mention_reply: '在楼中楼里@了你'
            };
            return map[String(type || '').trim()] || '给你发来新消息';
        },

        formatNotificationTime(value) {
            const ts = new Date(value || '').getTime();
            if (!Number.isFinite(ts) || ts <= 0) return '--';
            return new Date(ts).toLocaleString();
        },

        async fetchNotificationPage(tab, { offset = 0, limit = null, includeTotalCount = false } = {}) {
            if (!this.storage || typeof this.storage.listNotifications !== 'function') {
                return { items: [], hasMore: false, total: 0, totalCount: 0 };
            }
            const safeTab = this.normalizeNotificationTab(tab);
            const pageSize = Math.max(1, Number(limit) || this.getNotificationPageSize(safeTab));
            const safeOffset = Math.max(0, Number(offset) || 0);
            const fetchSize = Math.min(200, pageSize + 1);
            const target = this.getNotificationTarget(safeTab);
            if (!target.receiverId) {
                return { items: [], hasMore: false, total: 0, totalCount: 0 };
            }
            const query = {
                receiverType: target.receiverType,
                receiverId: target.receiverId,
                category: this.getNotificationCategoryByTab(safeTab),
                offset: safeOffset,
                limit: fetchSize
            };
            const rows = await this.storage.listNotifications(query);
            const rawList = Array.isArray(rows) ? rows : [];
            const hasMore = rawList.length > pageSize;
            const pageRows = hasMore ? rawList.slice(0, pageSize) : rawList;
            const identityCache = new Map();
            const threadTitleCache = new Map();
            const decorated = await Promise.all(pageRows.map(async (row) => {
                const actorIdentity = row?.actorIdentity || row?.actor_identity || null;
                let actorDisplay = null;
                if (actorIdentity) {
                    try {
                        actorDisplay = await ForumLink.view.resolveDisplayIdentityCached(
                            actorIdentity,
                            this.viewerUserId,
                            identityCache
                        );
                    } catch (_) { }
                }
                let threadTitle = String(row?.title || '').trim();
                if (!threadTitle && row?.threadId && this.storage && typeof this.storage.getThread === 'function') {
                    try {
                        const threadKey = String(row.threadId || '').trim();
                        if (!threadTitleCache.has(threadKey)) {
                            threadTitleCache.set(threadKey, this.storage.getThread(threadKey));
                        }
                        const thread = await threadTitleCache.get(threadKey);
                        threadTitle = String(thread?.title || '').trim();
                    } catch (_) { }
                }
                return Object.assign({}, row, {
                    actorDisplay,
                    threadTitle: threadTitle || '帖子',
                    excerpt: String(row?.excerpt || '').trim()
                });
            }));
            let totalCount = null;
            if (includeTotalCount) {
                try {
                    const totalResult = await this.storage.listNotifications({
                        receiverType: target.receiverType,
                        receiverId: target.receiverId,
                        category: this.getNotificationCategoryByTab(safeTab),
                        countOnly: true
                    });
                    if (typeof totalResult === 'number' && Number.isFinite(totalResult)) {
                        totalCount = Math.max(0, Number(totalResult));
                    } else if (Array.isArray(totalResult)) {
                        totalCount = Math.max(0, totalResult.length);
                    }
                } catch (_) { }
            }
            return {
                items: decorated,
                hasMore,
                total: decorated.length,
                totalCount
            };
        },

        buildNotificationItemHtml(item) {
            const safe = ForumLink.utils.escapeHtml;
            const actorFallback = item?.actorIdentity?.displayName
                || item?.actorIdentity?.authorId
                || '某位用户';
            const actorHtml = this.renderAuthorInline(item?.actorDisplay || null, actorFallback);
            const actionLabel = safe(this.getNotificationTypeLabel(item?.type));
            const title = safe(item?.threadTitle || item?.title || '帖子');
            const excerpt = safe(item?.excerpt || '');
            const timeText = safe(this.formatNotificationTime(item?.createdAt || item?.created_at));
            const threadId = safe(item?.threadId || item?.thread_id || '');
            const commentId = safe(item?.commentId || item?.comment_id || '');
            return `
                <button class="forum-notification-item" data-action="open-notification" data-thread-id="${threadId}" data-comment-id="${commentId}">
                    <div class="forum-notification-item-head">
                        <div class="forum-notification-actor">${actorHtml}</div>
                        <div class="forum-notification-time">${timeText}</div>
                    </div>
                    <div class="forum-notification-item-title">${actionLabel}</div>
                    <div class="forum-notification-item-thread">《${title}》</div>
                    ${excerpt ? `<div class="forum-notification-item-excerpt">${excerpt}</div>` : ''}
                </button>
            `;
        },

        renderNotificationViewFromState() {
            const safeTab = this.normalizeNotificationTab(this.state.currentNotificationTab);
            const feed = this.ensureNotificationFeedState(safeTab);
            const engagementActive = safeTab === 'engagement';
            const mentionActive = safeTab === 'mention';
            const charActive = safeTab === 'char';
            const safePage = Math.max(1, Number(feed.page) || 1);
            const safeTotalPages = Math.max(1, Number(feed.totalPages) || 1);
            const currentCharId = String(this.getActiveCharId() || '').trim();
            const emptyTitle = charActive ? '角色互动' : (engagementActive ? '互动' : '@');
            const itemsHtml = feed.items.length
                ? feed.items.map((item) => this.buildNotificationItemHtml(item)).join('')
                : `<div class="forum-empty">${charActive && !currentCharId ? '当前未选中角色' : `暂无${emptyTitle}`}消息</div>`;
            const loadMoreHtml = !charActive && feed.hasMore
                ? `<div class="forum-notification-more-wrap"><button class="mag-compose-btn" data-action="notification-load-more" data-tab="${safeTab}">查看更多消息</button></div>`
                : '';
            const paginationHtml = charActive
                ? this.buildPaginationHtml({
                    page: safePage,
                    totalPages: safeTotalPages,
                    onPageTemplate: `ForumUI.goNotificationPage(__PAGE__, '${safeTab}')`
                })
                : '';
            this.el.viewContainer.innerHTML = `
                <div class="forum-notification-wrap">
                    <div class="forum-notification-tabs">
                        <button class="forum-notification-tab ${engagementActive ? 'active' : ''}" data-action="notification-tab" data-tab="engagement">互动消息</button>
                        <button class="forum-notification-tab ${mentionActive ? 'active' : ''}" data-action="notification-tab" data-tab="mention">@消息</button>
                        <button class="forum-notification-tab ${charActive ? 'active' : ''}" data-action="notification-tab" data-tab="char">角色互动</button>
                    </div>
                    <div class="forum-notification-list">
                        ${itemsHtml}
                    </div>
                    ${loadMoreHtml}
                    ${paginationHtml}
                </div>
            `;
        },

        async loadNotificationTab(tab, { append = false, page = null } = {}) {
            const safeTab = this.normalizeNotificationTab(tab);
            const feed = this.ensureNotificationFeedState(safeTab);
            if (safeTab === 'char') {
                const pageSize = this.getNotificationPageSize(safeTab);
                let targetPage = Math.max(1, Number(page) || Number(feed.page) || 1);
                let offset = (targetPage - 1) * pageSize;
                let pageData = await this.fetchNotificationPage(safeTab, {
                    offset,
                    limit: pageSize,
                    includeTotalCount: true
                });
                let totalCount = Number(pageData.totalCount);
                if (!Number.isFinite(totalCount) || totalCount < 0) {
                    totalCount = Number(feed.totalCount || 0);
                    const minimumCount = offset + (Array.isArray(pageData.items) ? pageData.items.length : 0);
                    if (!Number.isFinite(totalCount) || totalCount < minimumCount) {
                        totalCount = minimumCount;
                    }
                    if (pageData.hasMore) totalCount = Math.max(totalCount, minimumCount + 1);
                }
                let totalPages = Math.max(1, Math.ceil(Math.max(0, totalCount) / pageSize));
                if (targetPage > totalPages) {
                    targetPage = totalPages;
                    offset = (targetPage - 1) * pageSize;
                    pageData = await this.fetchNotificationPage(safeTab, {
                        offset,
                        limit: pageSize,
                        includeTotalCount: false
                    });
                }
                const currentItems = Array.isArray(pageData.items) ? pageData.items : [];
                feed.items = currentItems;
                feed.page = targetPage;
                feed.pageSize = pageSize;
                feed.offset = offset + currentItems.length;
                feed.hasMore = Boolean(pageData.hasMore);
                feed.totalCount = Math.max(0, totalCount);
                feed.totalPages = totalPages;
                this.renderNotificationViewFromState();
                return;
            }
            const offset = append ? Number(feed.offset || 0) : 0;
            const pageResult = await this.fetchNotificationPage(safeTab, {
                offset,
                limit: this.getNotificationPageSize(safeTab)
            });
            const nextItems = append
                ? feed.items.concat(pageResult.items || [])
                : (pageResult.items || []);
            feed.items = nextItems;
            feed.offset = nextItems.length;
            feed.hasMore = Boolean(pageResult.hasMore);
            feed.page = 1;
            feed.totalCount = nextItems.length + (feed.hasMore ? 1 : 0);
            feed.totalPages = feed.hasMore ? 2 : 1;
            this.renderNotificationViewFromState();
        },

        async switchNotificationTab(tab) {
            const safeTab = this.normalizeNotificationTab(tab);
            if (this.state.currentNotificationTab === safeTab) return;
            this.state.currentNotificationTab = safeTab;
            const feed = this.ensureNotificationFeedState(safeTab);
            if (!Array.isArray(feed.items) || feed.items.length === 0) {
                await this.loadNotificationTab(safeTab, { append: false });
                return;
            }
            this.renderNotificationViewFromState();
        },

        async loadMoreNotifications(tab) {
            const safeTab = this.normalizeNotificationTab(tab);
            if (safeTab === 'char') return;
            await this.loadNotificationTab(safeTab, { append: true });
        },

        async goNotificationPage(page, tab = 'char') {
            const safeTab = this.normalizeNotificationTab(tab);
            const targetPage = Math.max(1, Number(page) || 1);
            this.state.currentNotificationTab = safeTab;
            await this.loadNotificationTab(safeTab, { append: false, page: targetPage });
        },

        async markViewerNotificationsRead() {
            if (!this.storage || typeof this.storage.markNotificationsRead !== 'function') return;
            const viewerUserId = String(this.viewerUserId || '').trim();
            const activeCharId = String(this.getActiveCharId() || '').trim();
            const tasks = [];
            if (viewerUserId) {
                tasks.push(this.storage.markNotificationsRead({
                    receiverType: 'user',
                    receiverId: viewerUserId
                }));
            }
            if (activeCharId) {
                tasks.push(this.storage.markNotificationsRead({
                    receiverType: 'char',
                    receiverId: activeCharId
                }));
            }
            if (tasks.length > 0) {
                await Promise.allSettled(tasks);
            }
        },

        async refreshNotificationBadge() {
            const badge = this.el.notificationBadge || document.getElementById('forum-notification-badge');
            if (!badge) return;
            let unread = 0;
            if (this.storage && typeof this.storage.listNotifications === 'function') {
                const countUnread = async (receiverType, receiverId, hardLimit = 300) => {
                    const safeReceiverId = String(receiverId || '').trim();
                    if (!safeReceiverId) return 0;
                    const countResult = await this.storage.listNotifications({
                        receiverType,
                        receiverId: safeReceiverId,
                        isRead: false,
                        countOnly: true
                    });
                    if (typeof countResult === 'number') {
                        return Math.max(0, countResult);
                    }
                    const rows = Array.isArray(countResult)
                        ? countResult
                        : await this.storage.listNotifications({
                            receiverType,
                            receiverId: safeReceiverId,
                            isRead: false,
                            limit: hardLimit
                        });
                    return Array.isArray(rows) ? rows.length : 0;
                };
                try {
                    const viewerUserId = String(this.viewerUserId || '').trim();
                    const activeCharId = String(this.getActiveCharId() || '').trim();
                    const [userUnread, charUnread] = await Promise.all([
                        countUnread('user', viewerUserId, 300),
                        countUnread('char', activeCharId, 200)
                    ]);
                    unread = Math.max(0, Number(userUnread || 0)) + Math.max(0, Number(charUnread || 0));
                } catch (error) {
                    console.warn('刷新消息红点失败', error);
                }
            }
            this.notificationState.unreadCount = unread;
            if (unread > 0) {
                badge.style.display = 'inline-flex';
                badge.textContent = unread > 99 ? '99+' : String(unread);
            } else {
                badge.style.display = 'none';
                badge.textContent = '0';
            }
        },

        async renderNotificationView(initialTab = 'engagement') {
            this.state.currentNotificationTab = this.normalizeNotificationTab(initialTab);
            this.resetNotificationFeed('engagement');
            this.resetNotificationFeed('mention');
            this.resetNotificationFeed('char');
            await this.markViewerNotificationsRead();
            await this.refreshNotificationBadge();
            await this.loadNotificationTab(this.state.currentNotificationTab, { append: false });
        },

        // --- 具体视图实现 ---

        async renderHomeView() {
            const data = await ForumLink.data.getHomePageData({
                viewerUserId: this.viewerUserId,
                hotLimit: 5,
                userLimit: 3,
                charLimit: 3
            });
            const sections = data?.sections || [];
            const hotThreads = data?.hotThreads || [];
            const popularUsers = data?.popularUsers || [];
            const popularChars = data?.popularChars || [];

            // Enrich threads with channelName
            const allChannels = await this.storage.listChannels();
            const channelMap = new Map((allChannels || []).map((c) => [c.id, c]));
            hotThreads.forEach((t) => {
                const ch = channelMap.get(t.channelId);
                if (ch && !t.channelName) t.channelName = ch.name;
            });

            const getSectionIcon = (id) => {
                const iconMap = {
                    sec_general: 'ri-compass-3-line',
                    sec_ent: 'ri-mickey-line',
                    sec_life: 'ri-leaf-line',
                    sec_tech: 'ri-cpu-line'
                };
                const safeId = String(id || '');
                for (const key of Object.keys(iconMap)) {
                    if (safeId.includes(key.split('_')[1])) return iconMap[key];
                }
                return 'ri-rfid-line';
            };

            let html = `<div class="forum-view active forum-home-mag">`;
            html += `
                <div class="forum-mag-cover-header">
                    <div class="forum-mag-date">${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }).toUpperCase()}</div>
                    <h1 class="forum-mag-logo">THE DECK</h1>
                    <div class="forum-mag-issue">VOL. 01 / EDITION 2026</div>
                </div>
            `;

            html += `<div class="forum-mag-grid">`;
            html += `
                <div class="forum-mag-col-main">
                    <div class="forum-mag-section-header">
                        <h2>LATEST <span>最新刊载</span></h2>
                    </div>
                    <div class="forum-mag-hot-list">
                        ${hotThreads.map((t, idx) => this.buildMagHotThreadCard(t, idx)).join('')}
                    </div>
                </div>
            `;
            html += `
                <div class="forum-mag-col-side">
                    <div class="forum-mag-section-header">
                        <h2>VOICES <span>人物</span></h2>
                    </div>
                    <div class="forum-mag-ranking-wrapper">
                        <h3 class="forum-mag-ranking-title">USERS</h3>
                        ${this.buildMagRankingList(popularUsers, 'user')}
                    </div>
                    <div class="forum-mag-ranking-wrapper" style="margin-top: 40px;">
                        <h3 class="forum-mag-ranking-title">CHARACTERS</h3>
                        ${this.buildMagRankingList(popularChars, 'char')}
                    </div>
                </div>
            `;
            html += `</div>`;

            html += `
                <div class="forum-mag-capsule-nav">
                    <div class="forum-mag-capsule-item forum-mag-capsule-feed" onclick="ForumUI.navigate('global_feed', {sortBy: 'newest'})" title="全区动态">
                        <i class="ri-layout-grid-line"></i>
                    </div>
                    ${sections.map((s) => `
                        <div class="forum-mag-capsule-item" onclick="ForumUI.navigate('section', {sectionId: '${s.id}'})" title="${ForumLink.utils.escapeHtml(s.name)}">
                            <i class="${getSectionIcon(s.id)}"></i>
                        </div>
                    `).join('')}
                </div>
            `;
            html += `</div>`;
            this.el.viewContainer.innerHTML = html;
        },

        normalizeGlobalFeedSortBy(sortBy) {
            const safe = String(sortBy || '').trim();
            if (safe === 'oldest') return 'oldest';
            if (safe === 'recent_comment') return 'recent_comment';
            return 'newest';
        },

        async changeGlobalFeedSort(sortBy) {
            const safeSort = this.normalizeGlobalFeedSortBy(sortBy);
            const state = this.globalFeedState && typeof this.globalFeedState === 'object'
                ? this.globalFeedState
                : { sortBy: 'newest', page: 1, pageSize: 15 };
            state.sortBy = safeSort;
            state.page = 1;
            this.globalFeedState = state;
            await this.renderGlobalFeedView(safeSort, 1);
        },

        async goGlobalFeedPage(page) {
            const safePage = Math.max(1, Number(page) || 1);
            const state = this.globalFeedState && typeof this.globalFeedState === 'object'
                ? this.globalFeedState
                : { sortBy: 'newest', page: 1, pageSize: 15 };
            state.page = safePage;
            this.globalFeedState = state;
            await this.renderGlobalFeedView(state.sortBy || 'newest', safePage);
        },

        async jumpGlobalFeedPage() {
            const input = document.getElementById('mag-global-feed-page-input');
            if (!input) return;
            const value = Number(input.value);
            if (!Number.isFinite(value) || value <= 0) return;
            await this.goGlobalFeedPage(value);
        },

        async renderGlobalFeedView(sortBy = 'newest', page = 1) {
            const state = this.globalFeedState && typeof this.globalFeedState === 'object'
                ? this.globalFeedState
                : { sortBy: 'newest', page: 1, pageSize: 15 };
            const safeSort = this.normalizeGlobalFeedSortBy(sortBy || state.sortBy);
            const pageSize = Math.max(1, Number(state.pageSize) || 15);

            const allThreads = await this.storage.listThreads({
                sortBy: safeSort,
                limit: 300
            });

            const allChannels = await this.storage.listChannels();
            const channelMap = new Map((allChannels || []).map((c) => [c.id, c]));

            const decorated = await ForumLink.view.decorateThreadList(allThreads || [], this.viewerUserId);
            const threadsWithMeta = await Promise.all(
                decorated.map(async (t) => {
                    const avatarUrl = await this.resolveAuthorAvatar(t.authorIdentity, t.displayIdentity);
                    const ch = channelMap.get(t.channelId);
                    return Object.assign({}, t, {
                        authorAvatarUrl: avatarUrl,
                        channelName: ch?.name || ''
                    });
                })
            );

            const totalThreads = threadsWithMeta.length;
            const totalPages = Math.max(1, Math.ceil(totalThreads / pageSize));
            let currentPage = Math.max(1, Number(page || state.page) || 1);
            if (currentPage > totalPages) currentPage = totalPages;
            const offset = (currentPage - 1) * pageSize;
            const pageItems = threadsWithMeta.slice(offset, offset + pageSize);

            this.globalFeedState = {
                sortBy: safeSort,
                page: currentPage,
                pageSize,
                total: totalThreads,
                totalPages
            };

            const safe = ForumLink.utils.escapeHtml;
            const sortOptions = [
                { value: 'newest', label: '最新发帖' },
                { value: 'oldest', label: '最早发帖' },
                { value: 'recent_comment', label: '最近评论' }
            ];
            const pagerHtml = totalThreads > 0
                ? this.buildPaginationHtml({
                    page: currentPage,
                    totalPages,
                    onPage: 'ForumUI.goGlobalFeedPage'
                })
                : '';
            const jumpHtml = totalPages > 1
                ? `
                    <div style="display:flex;gap:8px;justify-content:center;align-items:center;margin-top:10px;">
                        <span style="font-size:12px;color:#777;">跳转到</span>
                        <input id="mag-global-feed-page-input" type="number" min="1" max="${totalPages}" value="${currentPage}" style="width:74px;padding:6px 8px;border:1px solid #bbb;border-radius:4px;" onkeydown="if(event.key==='Enter'){ForumUI.jumpGlobalFeedPage();}">
                        <span style="font-size:12px;color:#777;">/ ${totalPages}</span>
                        <button class="mag-settings-btn" type="button" onclick="ForumUI.jumpGlobalFeedPage()">跳转</button>
                    </div>
                `
                : '';

            const html = `<div class="forum-view active mag-global-feed-view">
                <div class="mag-global-feed-header">
                    <h1 class="mag-global-feed-title">全区动态</h1>
                    <div class="mag-global-feed-toolbar">
                        <span class="mag-channel-sort-label">排序</span>
                        <select class="mag-channel-sort-select" onchange="ForumUI.changeGlobalFeedSort(this.value)">
                            ${sortOptions.map((o) =>
                                `<option value="${o.value}" ${o.value === safeSort ? 'selected' : ''}>${safe(o.label)}</option>`
                            ).join('')}
                        </select>
                    </div>
                </div>
                <div class="mag-global-feed-meta">共 ${totalThreads} 条 · 第 ${currentPage} / ${totalPages} 页</div>
                <div class="mag-thread-list">
                    ${pageItems.length === 0 ? '<div class="forum-empty">暂无帖子</div>' : ''}
                    ${pageItems.map((t, idx) => this.buildGlobalFeedItem(t, offset + idx)).join('')}
                </div>
                ${pagerHtml}
                ${jumpHtml}
            </div>`;

            this.el.viewContainer.innerHTML = html;
        },

        buildGlobalFeedItem(thread, index = 0) {
            const safe = ForumLink.utils.escapeHtml;
            const authorName = safe(thread.displayAuthorName || thread.authorIdentity?.displayName || '匿名');
            const authorHtml = this.renderAuthorInline(thread.displayIdentity, thread.displayAuthorName || '匿名');
            const avatarUrl = thread.authorAvatarUrl;
            const avatarHtml = avatarUrl
                ? `<span class="mag-thread-byline-avatar"><img src="${safe(avatarUrl)}" alt="${safe(authorName)}"></span>`
                : '';
            const channelName = safe(thread.channelName || '');
            const tagsHtml = (thread.tags || []).map((tag) =>
                `<span class="mag-thread-tag">#${safe(tag)}</span>`
            ).join('');
            const dateStr = thread.createdAt
                ? new Date(thread.createdAt).toLocaleDateString('zh-CN')
                : '';
            const lastActivityStr = thread.lastCommentAt
                ? new Date(thread.lastCommentAt).toLocaleDateString('zh-CN')
                : dateStr;
            const plainContent = ForumLink.notify && typeof ForumLink.notify.stripMentionMarkup === 'function'
                ? ForumLink.notify.stripMentionMarkup(thread.content || '')
                : String(thread.content || '');
            const excerpt = safe(plainContent.substring(0, 80));

            return `
                <div class="mag-thread-row" onclick="ForumUI.navigate('thread', {threadId: '${thread.id}'})">
                    <div class="mag-thread-index" aria-hidden="true">${String(index + 1).padStart(2, '0')}</div>
                    <div class="mag-thread-main">
                        ${channelName ? `<div class="mag-global-feed-channel-tag">${channelName}</div>` : ''}
                        <div class="mag-thread-title">${safe(thread.title || '')}</div>
                        ${excerpt ? `<div class="mag-thread-excerpt">${excerpt}</div>` : ''}
                        <div class="mag-thread-byline">
                            ${avatarHtml}
                            ${authorHtml}
                            ${tagsHtml}
                        </div>
                    </div>
                    <div class="mag-thread-side">
                        <div class="mag-thread-date">${dateStr}</div>
                        <div class="mag-thread-stats">
                            <span class="mag-thread-stat" title="热度"><i class="ri-fire-fill" style="color:#ff8c00;font-size:10px;"></i> ${thread.metrics ? Math.floor(thread.metrics.heat || 0) : 0}</span>
                            <span class="mag-thread-stat" title="评论">◎ ${thread.metrics ? (thread.metrics.commentCount || 0) : 0}</span>
                        </div>
                    </div>
                </div>
            `;
        },

        buildMagHotThreadCard(thread, index = 0) {
            const safe = ForumLink.utils.escapeHtml;
            const title = safe(thread.title || '');
            const sourceText = String(thread.content || '');
            const plainContent = ForumLink.notify && typeof ForumLink.notify.stripMentionMarkup === 'function'
                ? ForumLink.notify.stripMentionMarkup(sourceText)
                : sourceText;
            const excerpt = safe(plainContent.substring(0, 100)) + (plainContent.length > 100 ? '…' : '');
            const authorName = safe(String(thread.displayAuthorName || thread.authorIdentity?.displayName || 'Anonymous'));
            const channelName = safe(String(thread.channelName || ''));
            const tagsHtml = (thread.tags || []).slice(0, 3)
                .map((tag) => `<span class="forum-mag-hot-tag">#${safe(tag)}</span>`)
                .join('');
            const heat = thread.metrics ? Math.floor(thread.metrics.heat || 0) : 0;
            const comments = thread.metrics ? (thread.metrics.commentCount || 0) : 0;
            const dateStr = thread.createdAt
                ? new Date(thread.createdAt).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
                : '';
            // Callsign: ©authorName in italic, right-aligned — echoes the image style
            const callsign = `©\u202f${authorName}`;

            return `
                <div class="forum-mag-hot-item" onclick="ForumUI.navigate('thread', {threadId: '${thread.id}'})">
                    <div class="forum-mag-hot-body">
                        <div class="forum-mag-hot-left">
                            ${channelName ? `<div class="forum-mag-hot-channel">${channelName}</div>` : ''}
                            <h3 class="forum-mag-hot-title">${title}</h3>
                            <p class="forum-mag-hot-excerpt">${excerpt}</p>
                            <div class="forum-mag-hot-footer">
                                ${tagsHtml}
                                <div class="forum-mag-hot-metrics">
                                    <span>♥ ${heat}</span>
                                    <span>◎ ${comments}</span>
                                </div>
                            </div>
                        </div>
                        <div class="forum-mag-hot-right">
                            <span class="forum-mag-hot-callsign">${callsign}</span>
                            ${dateStr ? `<span class="forum-mag-hot-date">${dateStr}</span>` : ''}
                        </div>
                    </div>
                </div>
            `;
        },

        buildMagRankingList(list, type) {
            if (!Array.isArray(list) || !list.length) {
                return '<div class="forum-mag-empty">暂无数据</div>';
            }
            return `
                <div class="forum-mag-ranking-list">
                    ${list.slice(0, 3).map((item, index) => {
                        const num = String(index + 1).padStart(2, '0');
                        let name = type === 'user'
                            ? this.getUserForumName(item.user)
                            : this.getCharForumName(item.char);
                        name = ForumLink.utils.escapeHtml(name || 'Unknown');
                        const avatar = type === 'user'
                            ? this.getUserForumAvatar(item.user)
                            : this.getCharForumAvatar(item.char);
                        const canNavigate = type === 'user'
                            ? true
                            : this.canViewCharProfile(item?.charId || item?.char?.id || '', item?.char || null);
                        const clickAttr = canNavigate
                            ? `onclick="ForumUI.navigate('${type}', {${type}Id: '${type === 'user' ? item.userId : item.charId}'})"`
                            : '';
                        const disabledStyle = canNavigate ? '' : 'style="cursor:default;opacity:0.7;"';

                        return `
                            <div class="forum-mag-ranking-item" ${clickAttr} ${disabledStyle}>
                                <div class="forum-mag-rank-num">${num}</div>
                                <img src="${ForumLink.utils.escapeHtml(avatar)}" class="forum-mag-rank-avatar">
                                <div class="forum-mag-rank-info">
                                    <div class="forum-mag-rank-name">${name}</div>
                                    <div class="forum-mag-rank-score"><i class="ri-fire-fill"></i> ${Math.floor(item.score || 0)} HEAT</div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        },

        buildPaginationHtml({ page = 1, totalPages = 1, onPage = '', onPageTemplate = '' } = {}) {
            const safeTotal = Math.max(1, Number(totalPages) || 1);
            const safePage = Math.min(safeTotal, Math.max(1, Number(page) || 1));
            const handler = String(onPage || '').trim();
            const template = String(onPageTemplate || '').trim();
            if ((!handler && !template) || safeTotal <= 1) return '';

            const maxButtons = 5;
            let start = Math.max(1, safePage - Math.floor(maxButtons / 2));
            let end = Math.min(safeTotal, start + maxButtons - 1);
            if ((end - start + 1) < maxButtons) {
                start = Math.max(1, end - maxButtons + 1);
            }

            const renderBtn = (label, targetPage, { active = false, disabled = false } = {}) => {
                const classes = ['mag-pagination-btn'];
                if (active) classes.push('active');
                if (disabled) classes.push('disabled');
                const safeTargetPage = Math.max(1, Math.floor(Number(targetPage) || 1));
                let onclick = '';
                if (!disabled && Number.isFinite(safeTargetPage)) {
                    if (template) {
                        onclick = `onclick="${template.replace(/__PAGE__/g, String(safeTargetPage))}"`;
                    } else if (handler) {
                        onclick = `onclick="${handler}(${safeTargetPage})"`;
                    }
                }
                return `<button type="button" class="${classes.join(' ')}" ${onclick}>${label}</button>`;
            };

            const numberButtons = [];
            if (start > 1) {
                numberButtons.push(renderBtn('1', 1));
                if (start > 2) {
                    numberButtons.push('<span class="mag-pagination-ellipsis">…</span>');
                }
            }
            for (let i = start; i <= end; i += 1) {
                numberButtons.push(renderBtn(String(i), i, { active: i === safePage }));
            }
            if (end < safeTotal) {
                if (end < safeTotal - 1) {
                    numberButtons.push('<span class="mag-pagination-ellipsis">…</span>');
                }
                numberButtons.push(renderBtn(String(safeTotal), safeTotal));
            }

            const prevBtn = renderBtn('上一页', safePage - 1, { disabled: safePage <= 1 });
            const nextBtn = renderBtn('下一页', safePage + 1, { disabled: safePage >= safeTotal });

            return `
                <div class="mag-pagination-wrap">
                    ${prevBtn}
                    <div class="mag-pagination-numbers">${numberButtons.join('')}</div>
                    ${nextBtn}
                </div>
            `;
        },

        async renderSectionView(sectionId) {
            const sections = await this.storage.listSections();
            const section = sections.find(s => s.id === sectionId);
            this.state.currentSection = section;

            if (!section) {
                this.el.viewContainer.innerHTML = '<div class="forum-view active"><div class="mag-empty">分区不存在</div></div>';
                return;
            }

            const channels = await this.storage.listChannels({ sectionId });
            const safe = ForumLink.utils.escapeHtml;

            const html = `<div class="forum-view active">
                <div class="mag-section-eyebrow">SECTION / 版块</div>
                <h1 class="mag-section-title">${safe(section.name)}</h1>
                <div class="mag-section-rule"></div>
                <div class="mag-channel-grid">
                    ${channels.map((c, i) => `
                        <div class="mag-channel-card" onclick="ForumUI.navigate('channel', {channelId: '${c.id}'})">
                            <div class="mag-channel-num">${String(i + 1).padStart(2, '0')}</div>
                            <div class="mag-channel-name">${safe(c.name)}</div>
                            <div class="mag-channel-desc">进入频道阅读帖子 →</div>
                        </div>
                    `).join('')}
                </div>
            </div>`;

            this.el.viewContainer.innerHTML = html;
        },

        normalizeChannelSortBy(sortBy) {
            const safeSort = String(sortBy || '').trim();
            if (safeSort === 'oldest') return 'oldest';
            if (safeSort === 'recent_comment') return 'recent_comment';
            return 'newest';
        },

        async changeChannelSort(sortBy) {
            const channelId = String(this.state.currentChannel?.id || '').trim();
            if (!channelId) return;
            const nextSort = this.normalizeChannelSortBy(sortBy);
            this.channelListState = {
                channelId,
                sortBy: nextSort,
                page: 1,
                pageSize: 15
            };
            await this.renderChannelView(channelId);
        },

        async goChannelPage(page) {
            const channelId = String(this.state.currentChannel?.id || '').trim();
            if (!channelId) return;
            const current = this.channelListState && String(this.channelListState.channelId || '') === channelId
                ? this.channelListState
                : { channelId, sortBy: 'newest', pageSize: 15 };
            const nextPage = Math.max(1, Number(page) || 1);
            this.channelListState = Object.assign({}, current, {
                channelId,
                page: nextPage
            });
            await this.renderChannelView(channelId);
        },

        async renderChannelView(channelId) {
            const safeChannelId = String(channelId || '').trim();
            const channels = await this.storage.listChannels();
            const channel = channels.find((c) => String(c?.id || '') === safeChannelId);
            this.state.currentChannel = channel;

            if (!channel) return;

            // 获取该频道的 section，为了面包屑
            if (!this.state.currentSection || this.state.currentSection.id !== channel.sectionId) {
                const section = (await this.storage.listSections()).find((s) => s.id === channel.sectionId);
                this.state.currentSection = section;
            }

            const previousState = this.channelListState
                && String(this.channelListState.channelId || '') === safeChannelId
                ? this.channelListState
                : null;
            const sortBy = this.normalizeChannelSortBy(previousState?.sortBy || 'newest');
            const pageSize = Math.max(1, Number(previousState?.pageSize) || 15);
            let currentPage = Math.max(1, Number(previousState?.page) || 1);

            const allThreads = await this.storage.listThreads({
                channelId: safeChannelId,
                sortBy,
                limit: 240
            });
            const totalThreads = Array.isArray(allThreads) ? allThreads.length : 0;
            const totalPages = Math.max(1, Math.ceil(totalThreads / pageSize));
            if (currentPage > totalPages) currentPage = totalPages;
            const offset = (currentPage - 1) * pageSize;
            const pageThreads = (allThreads || []).slice(offset, offset + pageSize);

            const decoratedThreads = await ForumLink.view.decorateThreadList(pageThreads, this.viewerUserId);
            const threadsWithAvatar = await Promise.all(
                decoratedThreads.map(async (item) => Object.assign({}, item, {
                    authorAvatarUrl: await this.resolveAuthorAvatar(item.authorIdentity, item.displayIdentity)
                }))
            );

            this.channelListState = {
                channelId: safeChannelId,
                sortBy,
                page: currentPage,
                pageSize,
                total: totalThreads
            };

            const safe = ForumLink.utils.escapeHtml;
            const sortOptions = [
                { value: 'newest', label: '最新发布' },
                { value: 'oldest', label: '最早发布' },
                { value: 'recent_comment', label: '最近评论' }
            ];
            const pagerHtml = totalThreads > 0
                ? this.buildPaginationHtml({
                    page: currentPage,
                    totalPages,
                    onPage: 'ForumUI.goChannelPage'
                })
                : '';

            const html = `<div class="forum-view active">
                <div class="mag-channel-header">
                    <h1 class="mag-channel-heading">${safe(channel.name)}</h1>
                    <button class="mag-new-post-btn" onclick="ForumUI.navigate('create_thread', {channelId: '${channel.id}'})">
                        + 发布
                    </button>
                </div>
                <div class="mag-channel-toolbar">
                    <div class="mag-channel-toolbar-meta">共 ${totalThreads} 帖 · 每页 ${pageSize} 帖</div>
                    <div class="mag-channel-toolbar-sort">
                        <span class="mag-channel-sort-label">排序</span>
                        <select class="mag-channel-sort-select" onchange="ForumUI.changeChannelSort(this.value)">
                            ${sortOptions.map((option) =>
                                `<option value="${option.value}" ${option.value === sortBy ? 'selected' : ''}>${safe(option.label)}</option>`
                            ).join('')}
                        </select>
                    </div>
                </div>
                <div class="mag-thread-list">
                    ${threadsWithAvatar.length === 0 ? '<div class="mag-empty">这里还没有帖子，做第一个发言的人吧。</div>' : ''}
                    ${threadsWithAvatar.map((t, idx) => this.buildThreadListItem(t, offset + idx)).join('')}
                </div>
                ${pagerHtml}
            </div>`;

            this.el.viewContainer.innerHTML = html;
        },

        normalizeCommentSortBy(sortBy) {
            const safeSort = String(sortBy || '').trim();
            if (safeSort === 'newest') return 'newest';
            if (safeSort === 'hot') return 'hot';
            return 'oldest';
        },

        async changeThreadCommentSort(sortBy, threadId) {
            const finalThreadId = String(threadId || this.state.currentThread?.id || '').trim();
            if (!finalThreadId) return;
            const threadViewState = this.ensureThreadViewState(finalThreadId, { reset: false });
            if (!threadViewState) return;
            threadViewState.topLevelSortBy = this.normalizeCommentSortBy(sortBy);
            threadViewState.topLevelPage = 1;
            await this.renderThreadView(finalThreadId);
        },

        async goThreadCommentPage(page, threadId) {
            const finalThreadId = String(threadId || this.state.currentThread?.id || '').trim();
            if (!finalThreadId) return;
            const threadViewState = this.ensureThreadViewState(finalThreadId, { reset: false });
            if (!threadViewState) return;
            threadViewState.topLevelPage = Math.max(1, Number(page) || 1);
            await this.renderThreadView(finalThreadId);
        },

        async goReplyPage(topLevelCommentId, page, threadId) {
            const finalThreadId = String(threadId || this.state.currentThread?.id || '').trim();
            const topLevelId = String(topLevelCommentId || '').trim();
            if (!finalThreadId || !topLevelId) return;
            const threadViewState = this.ensureThreadViewState(finalThreadId, { reset: false });
            if (!threadViewState) return;
            if (!(threadViewState.replyPageByParent instanceof Map)) {
                threadViewState.replyPageByParent = new Map();
            }
            threadViewState.replyPageByParent.set(topLevelId, Math.max(1, Number(page) || 1));
            threadViewState.expandedReplyIds.add(topLevelId);
            await this.renderThreadView(finalThreadId);
        },

        async renderThreadView(threadId, highlightCommentId = null) {
            const targetThreadId = String(threadId || '').trim();
            if (!targetThreadId) return;

            const thread = await this.storage.getThread(targetThreadId);
            this.state.currentThread = thread;
            if (!thread) return;

            const threadViewState = this.ensureThreadViewState(targetThreadId, { reset: false });
            if (threadViewState) {
                threadViewState.topLevelSortBy = this.normalizeCommentSortBy(threadViewState.topLevelSortBy || 'oldest');
                threadViewState.topLevelPage = Math.max(1, Number(threadViewState.topLevelPage) || 1);
                threadViewState.topLevelPageSize = Math.max(1, Number(threadViewState.topLevelPageSize) || 10);
                threadViewState.replyPageSize = Math.max(1, Number(threadViewState.replyPageSize) || 10);
                if (!(threadViewState.expandedReplyIds instanceof Set)) {
                    threadViewState.expandedReplyIds = new Set();
                }
                if (!(threadViewState.replyPageByParent instanceof Map)) {
                    threadViewState.replyPageByParent = new Map();
                }
            }

            // 补全 channel info（与评论加载并行）
            const loadChannelPromise = (!this.state.currentChannel || this.state.currentChannel.id !== thread.channelId)
                ? this.storage.listChannels().then((channels) => {
                    this.state.currentChannel = (channels || []).find((c) => c.id === thread.channelId) || null;
                })
                : Promise.resolve();

            const fullCommentRows = await this.storage.listComments(targetThreadId, {
                sortBy: 'oldest',
                limit: 400
            });
            const comments = Array.isArray(fullCommentRows) ? fullCommentRows : [];

            const getIdentityKey = (identity) => {
                if (!identity || typeof identity !== 'object') return '';
                const authorType = String(identity.authorType || identity.author_type || '').trim();
                const authorId = String(identity.authorId || identity.author_id || '').trim();
                if (!authorType || !authorId) return '';
                const anonymous = identity.anonymous ? '1' : '0';
                const anonDisplayId = String(identity.anonDisplayId || identity.anon_display_id || '').trim();
                return `${authorType}:${authorId}:${anonymous}:${anonDisplayId}`;
            };

            const identityByKey = new Map();
            [thread.authorIdentity].concat(comments.map((item) => item?.authorIdentity)).forEach((identity) => {
                const key = getIdentityKey(identity);
                if (!key || identityByKey.has(key)) return;
                identityByKey.set(key, identity);
            });

            const displayIdentityMap = new Map();
            await Promise.all(
                Array.from(identityByKey.entries()).map(async ([key, identity]) => {
                    const displayIdentity = await ForumLink.identity.resolveDisplayIdentity(identity, this.viewerUserId);
                    displayIdentityMap.set(key, displayIdentity);
                })
            );

            const decorateWithDisplay = (item) => {
                if (!item) return null;
                const key = getIdentityKey(item.authorIdentity);
                const displayIdentity = key ? (displayIdentityMap.get(key) || null) : null;
                return Object.assign({}, item, {
                    displayIdentity,
                    displayAuthorName: displayIdentity ? displayIdentity.displayName : ''
                });
            };

            const decorated = decorateWithDisplay(thread);
            const decoratedComments = comments.map((item) => decorateWithDisplay(item)).filter(Boolean);
            if (threadViewState) {
                const commentById = new Map();
                decoratedComments.forEach((item) => {
                    const key = String(item?.id || '').trim();
                    if (key) commentById.set(key, item);
                });
                threadViewState.commentById = commentById;
                if (highlightCommentId) {
                    const highlightId = String(highlightCommentId || '').trim();
                    const topLevelId = this.resolveTopLevelCommentIdFromMap(commentById, highlightId);
                    if (topLevelId) {
                        threadViewState.expandedReplyIds.add(topLevelId);

                        const topLevelComments = decoratedComments.filter((item) => !item.parentId);
                        const childrenByParent = new Map();
                        decoratedComments.forEach((item) => {
                            const id = String(item?.id || '').trim();
                            if (!id) return;
                            const parentId = String(item?.parentId || '').trim();
                            if (parentId && commentById.has(parentId)) {
                                if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
                                childrenByParent.get(parentId).push(item);
                            }
                        });
                        const countDescendants = (commentId) => {
                            const key = String(commentId || '').trim();
                            if (!key) return 0;
                            const children = childrenByParent.get(key) || [];
                            let total = 0;
                            children.forEach((child) => {
                                const childId = String(child?.id || '').trim();
                                total += 1 + countDescendants(childId);
                            });
                            return total;
                        };
                        const sortedTopLevel = topLevelComments.slice();
                        if (threadViewState.topLevelSortBy === 'newest') {
                            sortedTopLevel.sort((a, b) => new Date(b?.createdAt || 0) - new Date(a?.createdAt || 0));
                        } else if (threadViewState.topLevelSortBy === 'hot') {
                            sortedTopLevel.sort((a, b) => {
                                const diff = countDescendants(String(b?.id || '').trim()) - countDescendants(String(a?.id || '').trim());
                                if (diff !== 0) return diff;
                                return new Date(b?.createdAt || 0) - new Date(a?.createdAt || 0);
                            });
                        } else {
                            sortedTopLevel.sort((a, b) => new Date(a?.createdAt || 0) - new Date(b?.createdAt || 0));
                        }
                        const topLevelIndex = sortedTopLevel.findIndex((item) => String(item?.id || '').trim() === topLevelId);
                        if (topLevelIndex >= 0) {
                            const pageSize = Math.max(1, Number(threadViewState.topLevelPageSize) || 10);
                            threadViewState.topLevelPage = Math.floor(topLevelIndex / pageSize) + 1;
                        }

                        if (highlightId && highlightId !== topLevelId) {
                            const flattenDescendants = (rootId) => {
                                const output = [];
                                const walk = (parentId) => {
                                    const children = childrenByParent.get(parentId) || [];
                                    children.sort((a, b) => new Date(a?.createdAt || 0) - new Date(b?.createdAt || 0));
                                    children.forEach((child) => {
                                        output.push(child);
                                        const childId = String(child?.id || '').trim();
                                        if (childId) walk(childId);
                                    });
                                };
                                walk(rootId);
                                return output;
                            };
                            const descendants = flattenDescendants(topLevelId);
                            const replyIndex = descendants.findIndex((item) => String(item?.id || '').trim() === highlightId);
                            if (replyIndex >= 0) {
                                const pageSize = Math.max(1, Number(threadViewState.replyPageSize) || 10);
                                threadViewState.replyPageByParent.set(topLevelId, Math.floor(replyIndex / pageSize) + 1);
                            }
                        }
                    }
                }
            }

            const avatarPromiseCache = new Map();
            const canDeletePromiseCache = new Map();
            const resolveAvatarCached = (identity, displayIdentity) => {
                const key = getIdentityKey(identity);
                if (!key) return Promise.resolve('');
                if (!avatarPromiseCache.has(key)) {
                    avatarPromiseCache.set(key, this.resolveAuthorAvatar(identity, displayIdentity));
                }
                return avatarPromiseCache.get(key);
            };
            const resolveCanDeleteCached = (identity) => {
                const key = getIdentityKey(identity);
                if (!key) return Promise.resolve(false);
                if (!canDeletePromiseCache.has(key)) {
                    canDeletePromiseCache.set(
                        key,
                        this.canDeleteIdentity(identity).then((result) => Boolean(result))
                    );
                }
                return canDeletePromiseCache.get(key);
            };

            const [threadAvatarUrl, commentAvatarUrls, canDeleteThread, commentDeleteFlags] = await Promise.all([
                resolveAvatarCached(decorated.authorIdentity, decorated.displayIdentity),
                Promise.all(
                    decoratedComments.map((comment) => resolveAvatarCached(comment.authorIdentity, comment.displayIdentity))
                ),
                resolveCanDeleteCached(thread.authorIdentity),
                Promise.all(
                    decoratedComments.map((item) => resolveCanDeleteCached(item.authorIdentity))
                )
            ]);
            await loadChannelPromise;

            decorated.authorAvatarUrl = threadAvatarUrl || '';
            decoratedComments.forEach((comment, idx) => {
                comment.authorAvatarUrl = commentAvatarUrls[idx] || '';
            });
            const commentDeleteMap = new Map();
            decoratedComments.forEach((comment, idx) => {
                commentDeleteMap.set(comment.id, Boolean(commentDeleteFlags[idx]));
            });
            if (threadViewState) {
                const topLevelCount = decoratedComments.reduce((count, item) => (
                    count + (item && !item.parentId ? 1 : 0)
                ), 0);
                const totalPages = Math.max(1, Math.ceil(topLevelCount / Math.max(1, Number(threadViewState.topLevelPageSize) || 10)));
                if (threadViewState.topLevelPage > totalPages) {
                    threadViewState.topLevelPage = totalPages;
                }
            }

            const commentCount = Number(thread?.metrics?.commentCount);
            const displayCommentCount = Number.isFinite(commentCount)
                ? commentCount
                : decoratedComments.length;

            const safe = ForumLink.utils.escapeHtml;
            const authorName = decorated.displayAuthorName || 'ANONYMOUS';
            const authorHtml = this.renderAuthorInline(decorated.displayIdentity, authorName);
            const avatarUrl = decorated.authorAvatarUrl;
            const channelName = this.state.currentChannel ? safe(this.state.currentChannel.name) : '';
            const dateStr = thread.createdAt
                ? new Date(thread.createdAt).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
                : '';
            const tagsHtml = (thread.tags || []).map((tag) =>
                `<span class="mag-article-tag">#${safe(tag)}</span>`
            ).join('');

            const html = `<div class="forum-view active">
                <div class="mag-article-wrap">
                    <div class="mag-article-category">${channelName}</div>
                    <h1 class="mag-article-title">${safe(decorated.title || '')}</h1>
                    ${tagsHtml ? `<div class="mag-article-tags">${tagsHtml}</div>` : ''}
                    <div class="mag-article-byline">
                        ${avatarUrl
                            ? `<div class="mag-article-avatar"><img src="${safe(avatarUrl)}" alt="${safe(authorName)}"></div>`
                            : ''
                        }
                        <div class="mag-article-author-info">
                            <div class="mag-article-author-name">${authorHtml}</div>
                            <div class="mag-article-meta">${dateStr}${thread.metrics ? ` · 热度 ${thread.metrics.heat}` : ''}</div>
                        </div>
                        <div class="mag-article-actions">
                            <button class="mag-article-action-btn" onclick="ForumUI.likeThread('${thread.id}')">
                                ♥ ${thread.metrics ? (thread.metrics.like || 0) : 0}
                            </button>
                            <button class="mag-article-action-btn" onclick="ForumUI.shareThread('${thread.id}')">转发</button>
                            ${canDeleteThread ? `<button class="mag-article-action-btn danger" onclick="ForumUI.deleteThread('${thread.id}')">删除</button>` : ''}
                        </div>
                    </div>

                    <div class="mag-article-body">
                        ${this.formatForumText(decorated.content || '')}
                    </div>

                    <div class="mag-comments-wrap">
                        <div class="mag-comments-header">
                            <div class="mag-comments-title">评论 (${displayCommentCount})</div>
                            <button class="mag-comment-write-btn" onclick="ForumUI.openCommentComposer('${thread.id}')">写评论</button>
                        </div>
                        <div class="mag-comments-toolbar">
                            <div class="mag-comments-toolbar-sort">
                                <span class="mag-comments-sort-label">排序</span>
                                <select class="mag-comments-sort-select" onchange="ForumUI.changeThreadCommentSort(this.value, '${thread.id}')">
                                    <option value="oldest" ${(threadViewState?.topLevelSortBy || 'oldest') === 'oldest' ? 'selected' : ''}>最早发布</option>
                                    <option value="newest" ${(threadViewState?.topLevelSortBy || 'oldest') === 'newest' ? 'selected' : ''}>最近发布</option>
                                    <option value="hot" ${(threadViewState?.topLevelSortBy || 'oldest') === 'hot' ? 'selected' : ''}>热度（楼中楼最多）</option>
                                </select>
                            </div>
                        </div>
                        <div class="mag-comment-compose" id="forum-inline-comment-composer" style="display:none;">
                            <textarea class="mag-compose-textarea" id="forum-inline-comment-input" placeholder="写下你的评论...（可输入 @用户名 或 @角色名）" oninput="ForumUI.handleMentionInputPreview('forum-inline-comment-input','forum-inline-comment-mention-hint','${thread.id}')"></textarea>
                            <div class="forum-mention-hint" id="forum-inline-comment-mention-hint"></div>
                            <div class="mag-compose-footer">
                                <div class="mag-anon-toggle" onclick="ForumUI.toggleInlineCommentAnon()">
                                    <div class="mag-anon-switch" id="forum-inline-comment-anon-switch"></div>
                                    <span>匿名评论</span>
                                </div>
                                <div class="mag-compose-actions">
                                    <button class="mag-compose-btn" onclick="ForumUI.closeInlineCommentComposer()">取消</button>
                                    <button class="mag-compose-btn primary" onclick="ForumUI.submitInlineComment('${thread.id}')">发布</button>
                                </div>
                            </div>
                        </div>
                        <div class="mag-comment-list">
                            ${this.buildCommentTreeHtml(
                                decoratedComments,
                                commentDeleteMap,
                                thread.id,
                                highlightCommentId,
                                {
                                    topLevelSortBy: threadViewState?.topLevelSortBy || 'oldest',
                                    topLevelPage: threadViewState?.topLevelPage || 1,
                                    topLevelPageSize: threadViewState?.topLevelPageSize || 10,
                                    replyPageSize: threadViewState?.replyPageSize || 10,
                                    expandedReplyIds: threadViewState?.expandedReplyIds || new Set(),
                                    replyPageByParent: threadViewState?.replyPageByParent || new Map()
                                }
                            )}
                        </div>
                    </div>
                </div>
            </div>`;

            this.el.viewContainer.innerHTML = html;
            if (highlightCommentId) {
                setTimeout(() => {
                    const highlightEl = this.el.viewContainer.querySelector(`[data-comment-id="${highlightCommentId}"]`);
                    if (highlightEl) {
                        highlightEl.classList.add('forum-comment-highlight-active');
                        highlightEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        setTimeout(() => highlightEl.classList.remove('forum-comment-highlight-active'), 3200);
                    }
                }, 60);
            }
        },

        async renderCreateThreadView(channelId) {
            let channelName = '';
            if (channelId) {
                const channels = await this.storage.listChannels();
                const ch = channels.find((c) => c.id === channelId);
                if (ch) channelName = ch.name;
            }
            const safe = ForumLink.utils.escapeHtml;
            const html = `<div class="forum-view active">
                <div class="mag-form-wrap">
                    ${channelName ? `<div class="mag-article-category">${safe(channelName)}</div>` : ''}
                    <h1 class="mag-form-title">投稿 / 发布</h1>
                    <div class="mag-form-rule"></div>

                    <div class="mag-form-group">
                        <label class="mag-form-label">标题 Title</label>
                        <input type="text" class="mag-form-input" id="post-title" placeholder="请输入引人注目的标题…">
                    </div>

                    <div class="mag-form-group">
                        <label class="mag-form-label">关键词 Tags</label>
                        <input type="text" class="mag-form-input" id="post-tags" placeholder="空格分隔，例如：新人 报道">
                    </div>

                    <div class="mag-form-group">
                        <label class="mag-form-label">正文 Content</label>
                        <textarea class="mag-form-textarea" id="post-content" placeholder="分享你的想法…（可输入 @用户名 或 @角色名）" oninput="ForumUI.handleMentionInputPreview('post-content','post-mention-hint')"></textarea>
                        <div class="mag-form-hint forum-mention-hint" id="post-mention-hint"></div>
                    </div>

                    <div class="mag-form-group">
                        <label class="mag-form-label">配图 / Image</label>
                        <input type="text" class="mag-form-input" id="post-image" placeholder="图片链接，或输入图片的详细文字描述">
                        <div class="mag-form-hint">建议填写图片描述，方便 AI 理解图片内容。</div>
                    </div>

                    <div class="mag-form-footer">
                        <div class="mag-anon-toggle" onclick="document.getElementById('post-anon-switch').classList.toggle('active')">
                            <div class="mag-anon-switch" id="post-anon-switch"></div>
                            <span style="font-size:11px;letter-spacing:0.5px;color:#999;text-transform:uppercase;">匿名发布</span>
                        </div>
                        <div style="display:flex;gap:10px;">
                            <button class="mag-form-btn" onclick="ForumUI.goBack()">取消</button>
                            <button class="mag-form-btn primary" onclick="ForumUI.submitThread('${channelId || ''}')">发布</button>
                        </div>
                    </div>
                </div>
            </div>`;
            this.el.viewContainer.innerHTML = html;
        },

        async submitThread(channelId) {
            const title = document.getElementById('post-title').value;
            const rawContent = document.getElementById('post-content').value;
            const tagsStr = document.getElementById('post-tags').value;
            const imageDesc = document.getElementById('post-image').value;
            const isAnon = document.getElementById('post-anon-switch').classList.contains('active');

            if (!title || !rawContent) {
                alert('标题和内容不能为空');
                return;
            }

            const baseIdentity = await this.resolvePostingIdentity('user');
            if (!baseIdentity) {
                alert('未找到可用身份，请先在设置里配置角色');
                return;
            }
            const identity = this.buildPostingIdentity(baseIdentity, isAnon);

            const mentionResolved = await this.resolveMentionsForSubmit(rawContent, { threadId: null });

            // 合并图片描述到内容
            let finalContent = mentionResolved.text;
            if (imageDesc) {
                finalContent += `\n\n[配图/描述]：${imageDesc}`;
            }

            const thread = await this.storage.createThread({
                title,
                content: finalContent,
                tags: tagsStr.split(' ').filter(t => t),
                sectionId: this.state.currentSection?.id,
                channelId: channelId,
                authorIdentity: identity,
                metrics: { like: 0, commentCount: 0, share: 0, collect: 0, heat: 0 }
            });
            await ForumLink.notify.notifyThreadMentions({
                thread,
                actorIdentity: identity
            });
            await this.refreshNotificationBadge();

            // 跳转到新帖子
            this.history.pop(); // Pop掉 create 页面
            this.navigate('thread', { threadId: thread.id });
        },

        async resolvePostingIdentity(preferredType = 'user') {
            const tryUser = async () => {
                const user = await this.storage.getUser(this.viewerUserId);
                if (!user) return null;
                return this.storage.getForumIdentity('user', user.id);
            };

            const tryChar = async () => {
                const charId = this.getActiveCharId();
                if (!charId) return null;
                const char = await this.storage.getChar(charId);
                if (!char) return null;
                return this.storage.getForumIdentity('char', char.id);
            };

            if (preferredType === 'char') {
                return (await tryChar()) || (await tryUser());
            }

            return (await tryUser()) || (await tryChar());
        },

        async openCommentComposer(threadId) {
            const finalThreadId = threadId || this.state.currentThread?.id;
            if (!finalThreadId) return;
            if (String(this.state.currentThread?.id || '') !== String(finalThreadId)) {
                await this.renderThreadView(finalThreadId);
            }
            const composer = document.getElementById('forum-inline-comment-composer');
            const input = document.getElementById('forum-inline-comment-input');
            if (!composer || !input) return;
            composer.style.display = 'block';
            requestAnimationFrame(() => input.focus());
        },

        toggleInlineCommentAnon() {
            const switchEl = document.getElementById('forum-inline-comment-anon-switch');
            if (!switchEl) return;
            switchEl.classList.toggle('active');
        },

        closeInlineCommentComposer() {
            const composer = document.getElementById('forum-inline-comment-composer');
            const input = document.getElementById('forum-inline-comment-input');
            const anonSwitch = document.getElementById('forum-inline-comment-anon-switch');
            const mentionHint = document.getElementById('forum-inline-comment-mention-hint');
            if (composer) composer.style.display = 'none';
            if (input) input.value = '';
            if (anonSwitch) anonSwitch.classList.remove('active');
            if (mentionHint) mentionHint.innerHTML = '';
        },

        async submitInlineComment(threadId) {
            const finalThreadId = threadId || this.state.currentThread?.id;
            if (!finalThreadId) return;
            if (this._inlineCommentSubmitting) return;

            const input = document.getElementById('forum-inline-comment-input');
            const anonSwitch = document.getElementById('forum-inline-comment-anon-switch');
            const rawContent = String(input?.value || '');
            const isAnon = Boolean(anonSwitch && anonSwitch.classList.contains('active'));

            if (!rawContent.trim()) {
                alert('评论内容不能为空');
                return;
            }

            const baseIdentity = await this.resolvePostingIdentity('user');
            if (!baseIdentity) {
                alert('未找到可用身份，请先在设置里配置角色');
                return;
            }

            const identity = this.buildPostingIdentity(baseIdentity, isAnon);
            this._inlineCommentSubmitting = true;
            try {
                const mentionResolved = await this.resolveMentionsForSubmit(rawContent, { threadId: finalThreadId });
                const content = String(mentionResolved.text || '').trim();
                if (!content) {
                    alert('评论内容不能为空');
                    return;
                }
                const created = await this.storage.createComment({
                    threadId: finalThreadId,
                    authorIdentity: identity,
                    content
                });
                await ForumLink.notify.notifyCommentCreated({
                    comment: created,
                    actorIdentity: identity
                });
                await this.refreshNotificationBadge();
                this.state.activeReplyCommentId = null;
                const threadViewState = this.ensureThreadViewState(finalThreadId, { reset: false });
                if (threadViewState) {
                    threadViewState.topLevelPage = 1;
                }
                await this.renderThreadView(finalThreadId);
                if (created && created.id) {
                    setTimeout(() => {
                        const card = this.el.viewContainer?.querySelector(`[data-comment-id="${created.id}"]`);
                        if (card) {
                            card.classList.add('forum-comment-highlight-active');
                            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            setTimeout(() => card.classList.remove('forum-comment-highlight-active'), 2200);
                        }
                    }, 50);
                }
            } catch (error) {
                console.error('发布评论失败', error);
                alert('发布评论失败，请稍后重试');
            } finally {
                this._inlineCommentSubmitting = false;
            }
        },

        getInlineReplyInputId(commentId) {
            const safe = String(commentId || '').replace(/[^a-zA-Z0-9_-]/g, '_');
            return `forum-inline-reply-input-${safe}`;
        },

        getInlineReplyAnonSwitchId(commentId) {
            const safe = String(commentId || '').replace(/[^a-zA-Z0-9_-]/g, '_');
            return `forum-inline-reply-anon-switch-${safe}`;
        },

        getInlineReplyMentionHintId(commentId) {
            const safe = String(commentId || '').replace(/[^a-zA-Z0-9_-]/g, '_');
            return `forum-inline-reply-mention-hint-${safe}`;
        },

        resolveCommentAuthorName(comment) {
            const name = comment?.displayAuthorName
                || comment?.authorIdentity?.displayName
                || '';
            return String(name || '').trim() || '匿名';
        },

        resolveTopLevelCommentIdFromMap(commentById, commentId) {
            const targetCommentId = String(commentId || '').trim();
            if (!targetCommentId) return '';
            if (!(commentById instanceof Map) || !commentById.size) return targetCommentId;

            let currentId = targetCommentId;
            const visited = new Set();
            while (currentId && !visited.has(currentId)) {
                visited.add(currentId);
                const current = commentById.get(currentId);
                if (!current) return targetCommentId;
                const parentId = String(current.parentId || '').trim();
                if (!parentId) return currentId;
                if (!commentById.has(parentId)) return currentId;
                currentId = parentId;
            }
            return targetCommentId;
        },

        async resolveTopLevelCommentId(threadId, commentId) {
            const targetThreadId = String(threadId || '').trim();
            const targetCommentId = String(commentId || '').trim();
            if (!targetThreadId || !targetCommentId) return '';

            const threadViewState = this.ensureThreadViewState(targetThreadId, { reset: false });
            if (threadViewState?.commentById instanceof Map && threadViewState.commentById.size > 0) {
                return this.resolveTopLevelCommentIdFromMap(threadViewState.commentById, targetCommentId);
            }

            try {
                const rows = await this.storage.listComments(targetThreadId, {
                    sortBy: 'oldest',
                    limit: 400
                });
                const commentById = new Map();
                (rows || []).forEach((comment) => {
                    const key = String(comment?.id || '').trim();
                    if (key) commentById.set(key, comment);
                });
                if (threadViewState) {
                    threadViewState.commentById = commentById;
                }
                return this.resolveTopLevelCommentIdFromMap(commentById, targetCommentId);
            } catch (error) {
                console.warn('解析楼中楼顶层评论失败', error);
                return targetCommentId;
            }
        },

        async openReplyComposer(commentId, threadId, mode = 'reply') {
            const finalThreadId = threadId || this.state.currentThread?.id;
            const targetCommentId = String(commentId || '').trim();
            const actionMode = String(mode || 'reply').trim() || 'reply';
            if (!finalThreadId || !targetCommentId) return;
            const threadViewState = this.ensureThreadViewState(finalThreadId, { reset: false });
            const topLevelCommentId = await this.resolveTopLevelCommentId(finalThreadId, targetCommentId);
            const expandId = String(topLevelCommentId || targetCommentId).trim();

            if (actionMode === 'toggle') {
                if (threadViewState && expandId) {
                    if (threadViewState.expandedReplyIds.has(expandId)) {
                        threadViewState.expandedReplyIds.delete(expandId);
                        if (threadViewState.replyPageByParent instanceof Map) {
                            threadViewState.replyPageByParent.delete(expandId);
                        }
                    } else {
                        threadViewState.expandedReplyIds.add(expandId);
                        if (!(threadViewState.replyPageByParent instanceof Map)) {
                            threadViewState.replyPageByParent = new Map();
                        }
                        if (!threadViewState.replyPageByParent.has(expandId)) {
                            threadViewState.replyPageByParent.set(expandId, 1);
                        }
                    }
                }
                this.state.activeReplyCommentId = null;
                await this.renderThreadView(finalThreadId);
                return;
            }

            const isSameThread = String(this.state.currentThread?.id || '') === String(finalThreadId);
            const isSameComment = String(this.state.activeReplyCommentId || '') === targetCommentId;
            if (isSameThread && isSameComment) {
                if (threadViewState && expandId) {
                    threadViewState.expandedReplyIds.delete(expandId);
                    if (threadViewState.replyPageByParent instanceof Map) {
                        threadViewState.replyPageByParent.delete(expandId);
                    }
                }
                this.state.activeReplyCommentId = null;
                await this.renderThreadView(finalThreadId);
                return;
            }

            this.state.activeReplyCommentId = targetCommentId;
            if (threadViewState) {
                if (expandId) threadViewState.expandedReplyIds.add(expandId);
            }
            await this.renderThreadView(finalThreadId);
        },

        toggleInlineReplyAnon(commentId) {
            const switchEl = document.getElementById(this.getInlineReplyAnonSwitchId(commentId));
            if (!switchEl) return;
            switchEl.classList.toggle('active');
        },

        async closeInlineReplyComposer(threadId) {
            const finalThreadId = threadId || this.state.currentThread?.id;
            this.state.activeReplyCommentId = null;
            if (!finalThreadId) return;
            await this.renderThreadView(finalThreadId);
        },

        async submitInlineReply(commentId, threadId) {
            const finalThreadId = threadId || this.state.currentThread?.id;
            const targetCommentId = String(commentId || '').trim();
            if (!finalThreadId || !targetCommentId) return;
            if (this._inlineReplySubmitting) return;
            const threadViewState = this.ensureThreadViewState(finalThreadId, { reset: false });
            const topLevelCommentId = await this.resolveTopLevelCommentId(finalThreadId, targetCommentId);

            const input = document.getElementById(this.getInlineReplyInputId(targetCommentId));
            const anonSwitch = document.getElementById(this.getInlineReplyAnonSwitchId(targetCommentId));
            const rawContent = String(input?.value || '');
            const isAnon = Boolean(anonSwitch && anonSwitch.classList.contains('active'));

            if (!rawContent.trim()) {
                alert('回复内容不能为空');
                return;
            }

            const baseIdentity = await this.resolvePostingIdentity('user');
            if (!baseIdentity) {
                alert('未找到可用身份，请先在设置里配置角色');
                return;
            }

            const identity = this.buildPostingIdentity(baseIdentity, isAnon);
            this._inlineReplySubmitting = true;
            try {
                const mentionResolved = await this.resolveMentionsForSubmit(rawContent, { threadId: finalThreadId });
                const content = String(mentionResolved.text || '').trim();
                if (!content) {
                    alert('回复内容不能为空');
                    return;
                }
                const created = await this.storage.createComment({
                    threadId: finalThreadId,
                    parentId: targetCommentId,
                    authorIdentity: identity,
                    content
                });
                await ForumLink.notify.notifyCommentCreated({
                    comment: created,
                    actorIdentity: identity
                });
                await this.refreshNotificationBadge();
                this.state.activeReplyCommentId = null;
                if (threadViewState) {
                    const expandId = String(topLevelCommentId || targetCommentId).trim();
                    if (expandId) threadViewState.expandedReplyIds.add(expandId);
                }
                await this.renderThreadView(finalThreadId);
                if (created && created.id) {
                    setTimeout(() => {
                        const card = this.el.viewContainer?.querySelector(`[data-comment-id="${created.id}"]`);
                        if (card) {
                            card.classList.add('forum-comment-highlight-active');
                            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            setTimeout(() => card.classList.remove('forum-comment-highlight-active'), 2200);
                        }
                    }, 50);
                }
            } catch (error) {
                console.error('发布回复失败', error);
                alert('发布回复失败，请稍后重试');
            } finally {
                this._inlineReplySubmitting = false;
            }
        },

        async loadMoreTopLevelComments(threadId) {
            const finalThreadId = threadId || this.state.currentThread?.id;
            if (!finalThreadId) return;
            const threadViewState = this.ensureThreadViewState(finalThreadId, { reset: false });
            if (!threadViewState) return;
            threadViewState.topLevelPage = Math.max(1, Number(threadViewState.topLevelPage || 1) + 1);
            this.state.activeReplyCommentId = null;
            await this.renderThreadView(finalThreadId);
        },

        async toggleReplyChildren(commentId, threadId) {
            const finalThreadId = threadId || this.state.currentThread?.id;
            const parentId = String(commentId || '').trim();
            if (!finalThreadId || !parentId) return;
            const threadViewState = this.ensureThreadViewState(finalThreadId, { reset: false });
            if (!threadViewState) return;
            const topLevelCommentId = await this.resolveTopLevelCommentId(finalThreadId, parentId);
            const expandId = String(topLevelCommentId || parentId).trim();
            if (!expandId) return;

            if (threadViewState.expandedReplyIds.has(expandId)) {
                threadViewState.expandedReplyIds.delete(expandId);
            } else {
                threadViewState.expandedReplyIds.add(expandId);
                if (!(threadViewState.replyPageByParent instanceof Map)) {
                    threadViewState.replyPageByParent = new Map();
                }
                if (!threadViewState.replyPageByParent.has(expandId)) {
                    threadViewState.replyPageByParent.set(expandId, 1);
                }
            }
            await this.renderThreadView(finalThreadId);
        },

        async loadMoreReplies(commentId, threadId) {
            const finalThreadId = threadId || this.state.currentThread?.id;
            const parentId = String(commentId || '').trim();
            if (!finalThreadId || !parentId) return;
            const threadViewState = this.ensureThreadViewState(finalThreadId, { reset: false });
            if (!threadViewState) return;
            const topLevelCommentId = await this.resolveTopLevelCommentId(finalThreadId, parentId);
            const expandId = String(topLevelCommentId || parentId).trim();
            if (!expandId) return;
            if (!(threadViewState.replyPageByParent instanceof Map)) {
                threadViewState.replyPageByParent = new Map();
            }
            const currentPage = Math.max(1, Number(threadViewState.replyPageByParent.get(expandId) || 1));
            threadViewState.replyPageByParent.set(expandId, currentPage + 1);
            threadViewState.expandedReplyIds.add(expandId);
            await this.renderThreadView(finalThreadId);
        },

        async likeThread(threadId) {
            const targetThreadId = String(threadId || this.state.currentThread?.id || '').trim();
            if (!targetThreadId) return;
            if (!this.storage || typeof this.storage.addInteraction !== 'function') {
                alert('当前存储适配器不支持点赞');
                return;
            }

            const identity = await this.resolvePostingIdentity('user');
            if (!identity) {
                alert('未找到可用身份，请先在设置里配置角色');
                return;
            }

            try {
                const inserted = await this.storage.addInteraction({
                    type: 'like',
                    threadId: targetThreadId,
                    actorId: identity.authorId || identity.author_id || identity.id,
                    actorIdentity: identity
                });
                if (inserted) {
                    await ForumLink.notify.notifyLike({
                        threadId: targetThreadId,
                        actorIdentity: identity
                    });
                }
                await this.refreshNotificationBadge();
                await this.renderThreadView(targetThreadId);
            } catch (error) {
                console.error('点赞失败', error);
                alert('点赞失败，请稍后重试');
            }
        },

        buildForumShareAuthor(item) {
            const display = item?.displayIdentity || null;
            const fallback = item?.displayAuthorName || item?.authorIdentity?.displayName || '';
            return {
                forumName: display?.displayName || fallback || '',
                realName: display?.realDisplayName || ''
            };
        },

        buildShareTargetItem(char) {
            const safe = (value) => ForumLink.utils.escapeHtml(String(value || ''));
            const id = safe(char?.id || '');
            const name = String(char?.remark || char?.displayName || char?.forumName || char?.realName || char?.id || '').trim();
            const alias = String(char?.alias || '').trim();
            const forumName = String(char?.forumName || '').trim();
            const realName = String(char?.realName || '').trim();
            const subParts = [];
            if (alias && alias !== name) subParts.push(alias);
            if (forumName && forumName !== name && forumName !== alias) subParts.push(`论坛名: ${forumName}`);
            if (realName && realName !== name && realName !== alias) subParts.push(`真实名: ${realName}`);
            const subline = subParts.join(' · ');
            const avatarUrl = String(char?.avatarUrl || '').trim();
            const initial = name ? name.slice(0, 1) : '?';
            const avatarHtml = avatarUrl
                ? `<img src="${safe(avatarUrl)}" alt="${safe(name)}">`
                : `<span>${safe(initial)}</span>`;
            return `
                <button class="forum-share-item" data-action="pick-share-char" data-char-id="${id}">
                    <div class="forum-share-avatar">${avatarHtml}</div>
                    <div class="forum-share-meta">
                        <div class="forum-share-name">${safe(name || char?.id || '')}</div>
                        ${subline ? `<div class="forum-share-sub">${safe(subline)}</div>` : ''}
                    </div>
                </button>
            `;
        },

        openSharePicker(chars = []) {
            if (!this.el.shareModal || !this.el.shareList) {
                return Promise.resolve(null);
            }
            this.el.shareList.innerHTML = chars.map((char) => this.buildShareTargetItem(char)).join('');
            this.el.shareModal.classList.add('active');
            return new Promise((resolve) => {
                this._sharePickerResolve = resolve;
            });
        },

        closeSharePicker(selectedId = null) {
            if (this.el.shareModal) {
                this.el.shareModal.classList.remove('active');
            }
            const resolver = this._sharePickerResolve;
            this._sharePickerResolve = null;
            if (resolver) {
                resolver(selectedId ? String(selectedId) : null);
            }
        },

        async pickShareTarget() {
            const bridge = this.getProjectBridge();
            if (!bridge || typeof bridge.getCharacters !== 'function') {
                alert('无法读取角色列表');
                return null;
            }
            const chars = await bridge.getCharacters();
            if (!Array.isArray(chars) || chars.length === 0) {
                alert('未找到可用角色');
                return null;
            }
            if (chars.length === 1) return chars[0].id;
            return this.openSharePicker(chars);
        },

        async buildThreadShareData(threadId) {
            const targetThreadId = String(threadId || '').trim();
            if (!targetThreadId) return null;
            const thread = await this.storage.getThread(targetThreadId);
            if (!thread) return null;
            const viewerId = this.viewerUserId || this.state.userId || null;
            const decoratedThread = await ForumLink.view.decorateThread(thread, viewerId);
            const comments = await this.storage.listComments(targetThreadId, { limit: 200 });
            const decoratedComments = await ForumLink.view.decorateCommentList(comments, viewerId);
            const topLevel = decoratedComments.filter((item) => !item.parentId).slice(0, 5);
            const commentsPreview = topLevel.map((item) => ({
                id: item.id,
                content: item.content,
                author: this.buildForumShareAuthor(item)
            }));
            return {
                shareType: 'thread',
                thread: {
                    id: decoratedThread?.id || thread.id,
                    title: decoratedThread?.title || thread.title,
                    content: decoratedThread?.content || thread.content,
                    tags: decoratedThread?.tags || thread.tags,
                    author: this.buildForumShareAuthor(decoratedThread || thread)
                },
                commentsPreview
            };
        },

        async buildCommentShareData(commentId, threadId) {
            const targetThreadId = String(threadId || this.state.currentThread?.id || '').trim();
            const targetCommentId = String(commentId || '').trim();
            if (!targetThreadId || !targetCommentId) return null;
            const thread = await this.storage.getThread(targetThreadId);
            if (!thread) return null;
            const viewerId = this.viewerUserId || this.state.userId || null;
            const decoratedThread = await ForumLink.view.decorateThread(thread, viewerId);
            const comments = await this.storage.listComments(targetThreadId, { limit: 240 });
            const decoratedComments = await ForumLink.view.decorateCommentList(comments, viewerId);
            const targetComment = decoratedComments.find((item) => item.id === targetCommentId);
            if (!targetComment) return null;

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

            const replies = replyItems.map((item) => ({
                id: item.id,
                parentId: item.parentId,
                depth: item.depth,
                content: item.content,
                author: this.buildForumShareAuthor(item)
            }));

            return {
                shareType: 'comment',
                thread: {
                    id: decoratedThread?.id || thread.id,
                    title: decoratedThread?.title || thread.title,
                    content: decoratedThread?.content || thread.content,
                    tags: decoratedThread?.tags || thread.tags,
                    author: this.buildForumShareAuthor(decoratedThread || thread)
                },
                comment: {
                    id: targetComment.id,
                    parentId: targetComment.parentId,
                    content: targetComment.content,
                    author: this.buildForumShareAuthor(targetComment),
                    replies
                }
            };
        },

        async sendForumShareToChat(payload, { role = 'user', targetCharId = null } = {}) {
            if (this._shareSendInFlight) return;
            this._shareSendInFlight = true;
            try {
            const sharePayload = payload?.forumShare || payload;
            if (!sharePayload) return;
            const shareType = sharePayload.shareType === 'comment' ? 'comment' : 'thread';
            const messageType = shareType === 'comment' ? 'forum_share_comment' : 'forum_share_thread';
            const shareText = payload?.shareText || sharePayload.shareText || '';
            const content = shareText || (shareType === 'comment' ? '[论坛转发] 评论' : '[论坛转发] 帖子');
            const forumShare = Object.assign({}, sharePayload, { shareText });

            if (role === 'assistant') {
                if (typeof window.displayMessage === 'function') {
                    window.displayMessage(content, 'assistant', {
                        isNew: true,
                        type: messageType,
                        forumShare,
                        content
                    });
                } else {
                    console.log('Forum share', forumShare);
                }
                return;
            }

            let finalTargetId = targetCharId;
            if (!finalTargetId) {
                finalTargetId = await this.pickShareTarget();
            }
            if (!finalTargetId) return;
            if (typeof window !== 'undefined') {
                window.ForumReturnState = {
                    threadId: sharePayload?.threadId || null,
                    commentId: sharePayload?.commentId || null
                };
            }
            if (typeof window.openChat === 'function') {
                const openResult = window.openChat(finalTargetId);
                if (openResult && typeof openResult.then === 'function') {
                    await openResult;
                }
            }
            if (typeof window.dispatchAndDisplayUserMessage !== 'function') {
                alert('转发失败：聊天模块未加载');
                return;
            }
            if (typeof this.close === 'function') {
                this.close();
            }
            await window.dispatchAndDisplayUserMessage({
                type: messageType,
                content,
                forumShare,
                forumShareData: forumShare
            });
            // 留在暂存区，等待用户手动点击发送
            } finally {
                this._shareSendInFlight = false;
            }
        },

        async shareThread(threadId) {
            const shareData = await this.buildThreadShareData(threadId || this.state.currentThread?.id);
            if (!shareData) {
                alert('未找到帖子');
                return;
            }
            const targetCharId = await this.pickShareTarget();
            if (!targetCharId) return;
            await this.sendForumShareToChat(shareData, { role: 'user', targetCharId });
        },

        async shareComment(commentId, threadId) {
            const shareData = await this.buildCommentShareData(commentId, threadId);
            if (!shareData) {
                alert('未找到评论');
                return;
            }
            const targetCharId = await this.pickShareTarget();
            if (!targetCharId) return;
            await this.sendForumShareToChat(shareData, { role: 'user', targetCharId });
        },

        async canDeleteIdentity(identity) {
            if (!identity || !identity.authorType || !identity.authorId) return false;
            const authorType = String(identity.authorType);
            const authorId = String(identity.authorId);

            if (authorType === 'user') {
                return authorId === String(this.viewerUserId || '');
            }

            if (authorType === 'char') {
                const char = this.storage && typeof this.storage.getChar === 'function'
                    ? await this.storage.getChar(authorId)
                    : null;
                if (!char) return false;
                if (char.ownerUserId) {
                    return String(char.ownerUserId) === String(this.viewerUserId || '');
                }
                return this.projectCharMeta.has(authorId);
            }

            return false;
        },

        async deleteThread(threadId) {
            const targetThreadId = String(threadId || '').trim();
            if (!targetThreadId) return;
            const thread = await this.storage.getThread(targetThreadId);
            if (!thread) return;

            const canDelete = await this.canDeleteIdentity(thread.authorIdentity);
            if (!canDelete) {
                alert('你没有权限删除这个帖子');
                return;
            }
            if (!window.confirm('确认删除这个帖子吗？帖子下的评论也会一起删除。')) return;

            try {
                if (typeof this.storage.deleteThread === 'function') {
                    await this.storage.deleteThread(targetThreadId);
                } else if (this.storage && this.storage._store) {
                    const store = this.storage._store;
                    store.comments = (store.comments || []).filter((item) => item.threadId !== targetThreadId);
                    store.threads = (store.threads || []).filter((item) => item.id !== targetThreadId);
                } else {
                    throw new Error('当前存储适配器不支持删帖');
                }
                alert('帖子已删除');
                await this.navigate('home', null, true);
            } catch (error) {
                console.error('删除帖子失败', error);
                alert('删除帖子失败，请稍后重试');
            }
        },

        async deleteComment(commentId, threadId) {
            const targetCommentId = String(commentId || '').trim();
            if (!targetCommentId) return;
            const targetThreadId = String(threadId || this.state.currentThread?.id || '').trim();
            if (!targetThreadId) return;

            const comments = await this.storage.listComments(targetThreadId, { limit: 240 });
            const comment = comments.find((item) => String(item.id) === targetCommentId);
            if (!comment) return;

            const canDelete = await this.canDeleteIdentity(comment.authorIdentity);
            if (!canDelete) {
                alert('你没有权限删除这条评论');
                return;
            }
            if (!window.confirm('确认删除这条评论吗？')) return;

            try {
                if (typeof this.storage.deleteComment === 'function') {
                    await this.storage.deleteComment(targetCommentId);
                } else if (this.storage && this.storage._store) {
                    const store = this.storage._store;
                    store.comments = (store.comments || []).filter((item) => String(item.id) !== targetCommentId);
                    const thread = (store.threads || []).find((item) => String(item.id) === targetThreadId);
                    if (thread && thread.metrics) {
                        thread.metrics.commentCount = Math.max(0, Number(thread.metrics.commentCount || 0) - 1);
                    }
                } else {
                    throw new Error('当前存储适配器不支持删评');
                }
                await this.renderThreadView(targetThreadId);
            } catch (error) {
                console.error('删除评论失败', error);
                alert('删除评论失败，请稍后重试');
            }
        },

        async renderUserProfileView(userId, charId) {
            const resolvedUserId = String(userId || this.viewerUserId || '').trim() || this.viewerUserId;
            const defaultCharId = String(resolvedUserId || '') === String(this.viewerUserId || '')
                ? this.getActiveCharId()
                : null;
            await this._renderCombinedProfile({
                userId: resolvedUserId,
                charId: charId || defaultCharId,
                activeTab: 'user'
            });
        },

        async renderCharProfileView(charId) {
            const targetCharId = String(charId || '').trim();
            if (!targetCharId) {
                this.el.viewContainer.innerHTML = '<div class="forum-view active"><div class="mag-empty">角色不存在</div></div>';
                return;
            }
            const targetChar = this.storage && typeof this.storage.getChar === 'function'
                ? await this.storage.getChar(targetCharId)
                : null;
            if (!this.canViewCharProfile(targetCharId, targetChar)) {
                this.el.viewContainer.innerHTML = `
                    <div class="forum-view active">
                        <div class="mag-form-wrap" style="text-align:center;padding-top:80px;">
                            <div class="mag-form-title">访问受限</div>
                            <div class="mag-form-rule"></div>
                            <div class="mag-empty">仅该角色所属用户可查看此角色主页动态。</div>
                        </div>
                    </div>
                `;
                return;
            }
            const ownerId = targetChar?.ownerUserId || targetChar?.owner_user_id || this.viewerUserId;
            await this._renderCombinedProfile({
                userId: ownerId,
                charId: targetCharId,
                activeTab: 'char'
            });
        },

        async _renderCombinedProfile({ userId, charId, activeTab = 'user' } = {}) {
            const safe = ForumLink.utils.escapeHtml;
            const resolvedUserId = String(userId || this.viewerUserId || '').trim() || this.viewerUserId;
            const safeJsText = (text) => String(text || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");

            const userData = resolvedUserId
                ? await ForumLink.data.getUserProfileData({
                    userId: resolvedUserId,
                    viewerUserId: this.viewerUserId,
                    limit: 10
                })
                : null;

            let activeCharId = String(charId || '').trim();
            if (!activeCharId && userData) {
                const allChars = this.getCharList();
                const ownedChars = allChars.filter((c) => {
                    const ownerUserId = String(c?.ownerUserId || c?.owner_user_id || '').trim();
                    return !ownerUserId || ownerUserId === resolvedUserId;
                });
                if (ownedChars.length) {
                    activeCharId = String(ownedChars[0].id || '').trim();
                }
            }

            if (activeCharId && this.storage && typeof this.storage.getChar === 'function') {
                const activeChar = await this.storage.getChar(activeCharId);
                const ownerUserId = String(activeChar?.ownerUserId || activeChar?.owner_user_id || '').trim();
                if (ownerUserId && ownerUserId !== String(resolvedUserId || '')) {
                    activeCharId = '';
                }
            }
            if (activeCharId && String(resolvedUserId || '') === String(this.viewerUserId || '')) {
                this.rememberActiveCharId(activeCharId);
            }

            let charData = null;
            this.reviewCache.clear();
            if (activeCharId && this.canViewCharProfile(activeCharId, null)) {
                charData = await ForumLink.data.getCharProfileData({
                    charId: activeCharId,
                    viewerUserId: this.viewerUserId,
                    limit: 200
                });
                const reviewItems = Array.isArray(charData?.reviewItems) ? charData.reviewItems : [];
                reviewItems.forEach((item) => {
                    if (item && item.thread && item.review) {
                        this.reviewCache.set(item.thread.id, {
                            reviewText: item.review.reviewText || '',
                            actionSummary: item.review.actionSummary || '',
                            threadTitle: item.thread.title || ''
                        });
                    }
                });
            }

            const withAvatar = async (list) => Promise.all(
                (Array.isArray(list) ? list : []).map(async (item) => Object.assign({}, item, {
                    authorAvatarUrl: await this.resolveAuthorAvatar(item.authorIdentity, item.displayIdentity)
                }))
            );
            const withCommentedItemAvatar = async (list) => Promise.all(
                (Array.isArray(list) ? list : []).map(async (item) => {
                    const thread = item?.thread && typeof item.thread === 'object' ? item.thread : null;
                    if (!thread) return null;
                    const threadWithAvatar = Object.assign({}, thread, {
                        authorAvatarUrl: await this.resolveAuthorAvatar(thread.authorIdentity, thread.displayIdentity)
                    });
                    return Object.assign({}, item, { thread: threadWithAvatar });
                })
            ).then((list) => list.filter(Boolean));

            const userThreads = await withAvatar(userData?.threads);
            const charPublished = await withAvatar(charData?.threads);
            const charLiked = await withAvatar(charData?.likedThreads);
            let charCommented = await withCommentedItemAvatar(charData?.commentedItems);
            if (!charCommented.length) {
                const commentedThreadsFallback = await withAvatar(charData?.commentedThreads);
                charCommented = commentedThreadsFallback.map((thread) => ({
                    thread,
                    commentId: '',
                    commentContent: '',
                    commentedAt: ''
                }));
            }
            const charReplies = Array.isArray(charData?.replyComments) ? charData.replyComments : [];
            const charReviews = Array.isArray(charData?.reviewItems) ? charData.reviewItems : [];

            const userAvatar = userData ? this.getUserForumAvatar(userData.user) : '';
            const userName = userData
                ? (this.getUserForumName(userData.user) || userData.user?.username || '用户')
                : '用户';
            const charAvatar = charData ? this.getCharForumAvatar(charData.char) : '';
            const charName = charData
                ? (this.getCharForumName(charData.char) || charData.char?.realName || '角色')
                : '角色';

            const hasChar = Boolean(activeCharId && charData && this.canViewCharProfile(activeCharId, null));
            const activityTabList = ['reviews', 'liked', 'commented', 'replies', 'published'];
            const prevCharActivity = this.profileViewState
                && String(this.profileViewState.activeCharId || '') === String(activeCharId || '')
                && this.profileViewState.charActivity
                ? this.profileViewState.charActivity
                : null;
            const defaultActivityTab = activityTabList.includes(String(prevCharActivity?.activeTab || ''))
                ? String(prevCharActivity.activeTab)
                : 'reviews';
            const pageByTab = {
                reviews: Math.max(1, Number(prevCharActivity?.pageByTab?.reviews) || 1),
                liked: Math.max(1, Number(prevCharActivity?.pageByTab?.liked) || 1),
                commented: Math.max(1, Number(prevCharActivity?.pageByTab?.commented) || 1),
                replies: Math.max(1, Number(prevCharActivity?.pageByTab?.replies) || 1),
                published: Math.max(1, Number(prevCharActivity?.pageByTab?.published) || 1)
            };
            this.profileViewState = {
                activeCharId: activeCharId || '',
                hasChar,
                lists: {
                    reviews: Array.isArray(charReviews) ? charReviews : [],
                    liked: Array.isArray(charLiked) ? charLiked : [],
                    commented: Array.isArray(charCommented) ? charCommented : [],
                    replies: Array.isArray(charReplies) ? charReplies : [],
                    published: Array.isArray(charPublished) ? charPublished : []
                },
                charActivity: {
                    activeTab: defaultActivityTab,
                    pageSize: 10,
                    pageByTab
                }
            };
            const initialTab = hasChar && activeTab === 'char' ? 'char' : 'user';
            const headerAvatar = initialTab === 'char' ? charAvatar : userAvatar;
            const headerName = initialTab === 'char' ? charName : userName;

            const userPanel = `
                <div class="mag-profile-panel ${initialTab === 'user' ? 'active' : ''}" id="mag-profile-user-panel">
                    <div class="mag-profile-section-title">发布的帖子</div>
                    <div class="mag-profile-thread-list">
                        ${userThreads.length
                            ? userThreads.map((t, idx) => this.buildThreadListItem(t, idx)).join('')
                            : '<div class="mag-empty">暂无发布记录</div>'}
                    </div>
                </div>
            `;

            let charPanel = '';
            if (hasChar) {
                const initialActivityTab = this.profileViewState.charActivity.activeTab;

                charPanel = `
                    <div class="mag-profile-panel ${initialTab === 'char' ? 'active' : ''}" id="mag-profile-char-panel">
                        <div class="mag-char-activity-tabs">
                            <button type="button" class="mag-char-activity-tab ${initialActivityTab === 'reviews' ? 'active' : ''}" data-tab="reviews" onclick="ForumUI.switchCharActivityTab('reviews')">感兴趣 / 点评</button>
                            <button type="button" class="mag-char-activity-tab ${initialActivityTab === 'liked' ? 'active' : ''}" data-tab="liked" onclick="ForumUI.switchCharActivityTab('liked')">点赞过的帖子</button>
                            <button type="button" class="mag-char-activity-tab ${initialActivityTab === 'commented' ? 'active' : ''}" data-tab="commented" onclick="ForumUI.switchCharActivityTab('commented')">评论过的帖子</button>
                            <button type="button" class="mag-char-activity-tab ${initialActivityTab === 'replies' ? 'active' : ''}" data-tab="replies" onclick="ForumUI.switchCharActivityTab('replies')">TA的回复</button>
                            <button type="button" class="mag-char-activity-tab ${initialActivityTab === 'published' ? 'active' : ''}" data-tab="published" onclick="ForumUI.switchCharActivityTab('published')">发布的帖子</button>
                        </div>
                        <div id="mag-char-activity-content"></div>
                        <div id="mag-char-activity-pager"></div>
                    </div>
                `;
            }

            const tabsHtml = hasChar ? `
                <div class="mag-profile-tabs">
                    <div class="mag-profile-tab ${initialTab === 'user' ? 'active' : ''}"
                         onclick="(function(tab){
                             const userPanel = document.getElementById('mag-profile-user-panel');
                             const charPanel = document.getElementById('mag-profile-char-panel');
                             if (userPanel) userPanel.classList.add('active');
                             if (charPanel) charPanel.classList.remove('active');
                             document.querySelectorAll('.mag-profile-tab').forEach(function(node){ node.classList.remove('active'); });
                             tab.classList.add('active');
                             const avatar = document.querySelector('.mag-profile-avatar');
                             const name = document.querySelector('.mag-profile-name');
                             if (avatar) avatar.src = '${safe(userAvatar)}';
                             if (name) name.textContent = '${safeJsText(userName)}';
                         })(this)">
                        MY PAGE · 我的
                    </div>
                    <div class="mag-profile-tab ${initialTab === 'char' ? 'active' : ''}"
                         onclick="(function(tab){
                             const userPanel = document.getElementById('mag-profile-user-panel');
                             const charPanel = document.getElementById('mag-profile-char-panel');
                             if (userPanel) userPanel.classList.remove('active');
                             if (charPanel) charPanel.classList.add('active');
                             document.querySelectorAll('.mag-profile-tab').forEach(function(node){ node.classList.remove('active'); });
                             tab.classList.add('active');
                             const avatar = document.querySelector('.mag-profile-avatar');
                             const name = document.querySelector('.mag-profile-name');
                             if (avatar) avatar.src = '${safe(charAvatar)}';
                             if (name) name.textContent = '${safeJsText(charName)}';
                         })(this)">
                        THEIR PAGE · TA的
                    </div>
                </div>
            ` : `
                <div class="mag-profile-tabs">
                    <div class="mag-profile-tab active">MY PAGE · 我的</div>
                </div>
            `;

            const html = `<div class="forum-view active">
                <div class="mag-profile-cover">
                    <img class="mag-profile-avatar" src="${safe(headerAvatar)}" alt="${safe(headerName)}">
                    <div class="mag-profile-name">${safe(headerName)}</div>
                    <div class="mag-profile-sub">PROFILE · 个人主页</div>
                </div>
                ${tabsHtml}
                ${userPanel}
                ${charPanel}
            </div>`;
            this.el.viewContainer.innerHTML = html;
            if (hasChar) {
                this.renderCharActivityPanel();
            }
        },

        switchCharActivityTab(tab) {
            const profileState = this.profileViewState;
            if (!profileState || !profileState.hasChar || !profileState.charActivity) return;
            const safeTab = ['reviews', 'liked', 'commented', 'replies', 'published'].includes(String(tab || '').trim())
                ? String(tab).trim()
                : 'reviews';
            profileState.charActivity.activeTab = safeTab;
            if (!profileState.charActivity.pageByTab[safeTab]) {
                profileState.charActivity.pageByTab[safeTab] = 1;
            }
            this.renderCharActivityPanel();
        },

        goCharActivityPage(page) {
            const profileState = this.profileViewState;
            if (!profileState || !profileState.hasChar || !profileState.charActivity) return;
            const safeTab = String(profileState.charActivity.activeTab || 'reviews');
            profileState.charActivity.pageByTab[safeTab] = Math.max(1, Number(page) || 1);
            this.renderCharActivityPanel();
        },

        renderCharActivityPanel() {
            const profileState = this.profileViewState;
            if (!profileState || !profileState.hasChar || !profileState.charActivity) return;
            const contentEl = document.getElementById('mag-char-activity-content');
            const pagerEl = document.getElementById('mag-char-activity-pager');
            if (!contentEl || !pagerEl) return;

            const activityTab = ['reviews', 'liked', 'commented', 'replies', 'published'].includes(String(profileState.charActivity.activeTab || ''))
                ? String(profileState.charActivity.activeTab)
                : 'reviews';
            const pageSize = Math.max(1, Number(profileState.charActivity.pageSize) || 10);
            const source = Array.isArray(profileState.lists?.[activityTab]) ? profileState.lists[activityTab] : [];
            const totalPages = Math.max(1, Math.ceil(source.length / pageSize));
            let currentPage = Math.max(1, Number(profileState.charActivity.pageByTab?.[activityTab]) || 1);
            if (currentPage > totalPages) currentPage = totalPages;
            profileState.charActivity.pageByTab[activityTab] = currentPage;

            const tabButtons = document.querySelectorAll('.mag-char-activity-tab');
            tabButtons.forEach((node) => {
                const nodeTab = String(node?.dataset?.tab || '').trim();
                node.classList.toggle('active', nodeTab === activityTab);
            });

            const offset = (currentPage - 1) * pageSize;
            const pageItems = source.slice(offset, offset + pageSize);
            const safe = ForumLink.utils.escapeHtml;
            const titleMap = {
                reviews: '动态 · 感兴趣 / 点评',
                liked: '点赞过的帖子',
                commented: '评论过的帖子',
                replies: 'TA的回复',
                published: '发布的帖子'
            };

            let bodyHtml = '';
            const escapeJs = (value) => String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            if (activityTab === 'reviews') {
                bodyHtml = pageItems.length > 0
                    ? pageItems.map((item, index) => {
                        const thread = item?.thread || {};
                        const review = item?.review || {};
                        const sourceText = String(review.reviewText || '');
                        const excerpt = safe(sourceText.substring(0, 80)) + (sourceText.length > 80 ? '...' : '');
                        return `
                            <div class="mag-review-item" onclick="ForumUI.showCharReview('${thread.id || ''}')">
                                <div class="mag-review-num">${String(offset + index + 1).padStart(2, '0')}</div>
                                <div class="mag-review-content">
                                    <div class="mag-review-title">${safe(thread.title || '')}</div>
                                    <div class="mag-review-excerpt">${excerpt || '点击查看详情'}</div>
                                    <div class="mag-review-date">${thread.createdAt ? new Date(thread.createdAt).toLocaleDateString('zh-CN') : ''}</div>
                                </div>
                            </div>
                        `;
                    }).join('')
                    : '<div class="mag-empty">暂无感兴趣的帖子</div>';
            } else if (activityTab === 'commented') {
                bodyHtml = pageItems.length > 0
                    ? `<div class="mag-profile-thread-list">${pageItems.map((item, index) => {
                        const thread = item?.thread || {};
                        const threadId = String(thread?.id || '').trim();
                        const commentId = String(item?.commentId || '').trim();
                        const threadTitle = safe(thread?.title || '帖子');
                        const threadRaw = ForumLink.notify && typeof ForumLink.notify.stripMentionMarkup === 'function'
                            ? ForumLink.notify.stripMentionMarkup(thread?.content || '')
                            : String(thread?.content || '');
                        const threadExcerpt = safe(String(threadRaw || '').slice(0, 80));
                        const commentRaw = ForumLink.notify && typeof ForumLink.notify.stripMentionMarkup === 'function'
                            ? ForumLink.notify.stripMentionMarkup(item?.commentContent || '')
                            : String(item?.commentContent || '');
                        const commentExcerpt = safe(String(commentRaw || '').slice(0, 90));
                        const commentedAtRaw = item?.commentedAt || '';
                        const fallbackDateRaw = thread?.createdAt || thread?.created_at || '';
                        const dateText = commentedAtRaw
                            ? new Date(commentedAtRaw).toLocaleDateString('zh-CN')
                            : (fallbackDateRaw ? new Date(fallbackDateRaw).toLocaleDateString('zh-CN') : '');
                        const navArgs = threadId
                            ? `threadId: '${escapeJs(threadId)}'${commentId ? `, highlightCommentId: '${escapeJs(commentId)}'` : ''}`
                            : '';
                        const clickAttr = navArgs
                            ? `onclick="ForumUI.navigate('thread', {${navArgs}})"`
                            : '';
                        return `
                            <div class="mag-thread-row" ${clickAttr}>
                                <div class="mag-thread-index" aria-hidden="true">${String(offset + index + 1).padStart(2, '0')}</div>
                                <div class="mag-thread-main">
                                    <div class="mag-thread-title">${threadTitle}</div>
                                    ${threadExcerpt ? `<div class="mag-thread-excerpt">${threadExcerpt}</div>` : ''}
                                    ${commentExcerpt ? `<div class="mag-thread-byline">评论：${commentExcerpt}</div>` : ''}
                                </div>
                                <div class="mag-thread-side">
                                    <div class="mag-thread-date">${safe(dateText)}</div>
                                </div>
                            </div>
                        `;
                    }).join('')}</div>`
                    : '<div class="mag-empty">暂无评论记录</div>';
            } else if (activityTab === 'replies') {
                bodyHtml = pageItems.length > 0
                    ? `<div class="mag-profile-thread-list">${pageItems.map((item, index) => {
                        const threadId = String(item?.threadId || item?.thread?.id || '').trim();
                        const commentId = String(item?.id || '').trim();
                        const threadTitle = safe(item?.thread?.title || '帖子');
                        const parentContent = safe(String(item?.parentContent || '').slice(0, 70));
                        const replyContent = safe(String(item?.content || '').slice(0, 100));
                        const createdAt = item?.createdAt ? new Date(item.createdAt).toLocaleDateString('zh-CN') : '';
                        const clickAttr = threadId
                            ? `onclick="ForumUI.navigate('thread', {threadId: '${escapeJs(threadId)}', highlightCommentId: '${escapeJs(commentId)}'})"`
                            : '';
                        return `
                            <div class="mag-thread-row" ${clickAttr}>
                                <div class="mag-thread-index" aria-hidden="true">${String(offset + index + 1).padStart(2, '0')}</div>
                                <div class="mag-thread-main">
                                    <div class="mag-thread-title">${threadTitle}</div>
                                    ${parentContent ? `<div class="mag-thread-excerpt">回复对象：${parentContent}</div>` : ''}
                                    ${replyContent ? `<div class="mag-thread-byline">回复内容：${replyContent}</div>` : ''}
                                </div>
                                <div class="mag-thread-side">
                                    <div class="mag-thread-date">${safe(createdAt)}</div>
                                </div>
                            </div>
                        `;
                    }).join('')}</div>`
                    : '<div class="mag-empty">暂无回复记录</div>';
            } else {
                bodyHtml = pageItems.length > 0
                    ? `<div class="mag-profile-thread-list">${pageItems.map((thread, index) => this.buildThreadListItem(thread, offset + index)).join('')}</div>`
                    : `<div class="mag-empty">暂无${safe(titleMap[activityTab] || '记录')}</div>`;
            }

            contentEl.innerHTML = `
                <div class="mag-profile-section-title">${safe(titleMap[activityTab] || '')}</div>
                ${bodyHtml}
            `;
            pagerEl.innerHTML = source.length > 0
                ? this.buildPaginationHtml({
                    page: currentPage,
                    totalPages,
                    onPage: 'ForumUI.goCharActivityPage'
                })
                : '';
        },

        showCharReview(threadId) {
            const key = String(threadId || '').trim();
            if (!key) return;
            const review = this.reviewCache.get(key);
            const overlay = document.getElementById('mag-review-modal-overlay');
            const titleEl = document.getElementById('mag-review-modal-title');
            const textEl = document.getElementById('mag-review-modal-text');
            const actionEl = document.getElementById('mag-review-modal-action');

            if (!overlay || !titleEl || !textEl) {
                if (!review) {
                    alert('暂无点评内容');
                    return;
                }
                const title = review.threadTitle ? `【${review.threadTitle}】\n\n` : '';
                const action = review.actionSummary ? `\n\n动作: ${review.actionSummary}` : '';
                alert(`${title}${review.reviewText || '暂无点评'}${action}`);
                return;
            }

            if (!review) {
                titleEl.textContent = '暂无点评';
                textEl.textContent = '该帖子暂时没有点评内容。';
                if (actionEl) actionEl.style.display = 'none';
                overlay.classList.add('active');
                return;
            }

            titleEl.textContent = review.threadTitle || '点评详情';
            textEl.textContent = review.reviewText || '（暂无文字点评）';
            if (actionEl) {
                if (review.actionSummary) {
                    actionEl.textContent = `动作：${review.actionSummary}`;
                    actionEl.style.display = 'block';
                } else {
                    actionEl.style.display = 'none';
                }
            }
            overlay.classList.add('active');
        },

        async renderCharSettingsView(charId) {
            const user = await this.storage.getUser(this.viewerUserId);
            const allChars = this.buildSettingsCharPool();
            const viewerId = String(this.viewerUserId || '').trim();
            const metaCharIdSet = new Set(
                Array.from(this.projectCharMeta?.keys?.() || [])
                    .map((id) => String(id || '').trim())
                    .filter(Boolean)
            );
            const ownedChars = allChars.filter((c) => {
                const charIdKey = String(c?.id || '').trim();
                const ownerUserId = String(c?.ownerUserId || c?.owner_user_id || '').trim();
                if (metaCharIdSet.size > 0 && charIdKey && metaCharIdSet.has(charIdKey)) {
                    return true;
                }
                return !ownerUserId || ownerUserId === viewerId;
            });
            const charPool = ownedChars.length ? ownedChars : allChars;

            this.ensureSettingsState();
            if (user && !this.settingsState.userForumName) {
                this.settingsState.userForumName = this.getUserForumName(user);
            }
            if (user && !this.settingsState.userAgentGlobalLoaded) {
                this.settingsState.userAgentGlobalEnabled = this.parseBooleanSetting(
                    user.settings?.forumAgentGlobalEnabled,
                    false
                );
                this.settingsState.userAgentGlobalLoaded = true;
            }
            const userAvatarState = this.ensureUserAvatarSettings(user);

            const selectedCharId = charId
                || this.settingsState.selectedCharId
                || this.getActiveCharId()
                || (charPool[0] ? charPool[0].id : null);
            this.settingsState.selectedCharId = selectedCharId;
            if (selectedCharId) {
                this.rememberActiveCharId(selectedCharId);
            }

            const selectedChar = charPool.find((c) => c.id === selectedCharId) || null;
            const selectedMeta = selectedChar
                ? (this.projectCharMeta.get(String(selectedChar.id)) || null)
                : null;
            const worldBookEntries = selectedMeta && Array.isArray(selectedMeta.worldBookEntries)
                ? selectedMeta.worldBookEntries
                : [];
            const charSettings = selectedChar ? this.ensureCharSettings(selectedChar, worldBookEntries) : null;
            const safe = ForumLink.utils.escapeHtml;
            const buildMagAvatarEditor = (target, stateLike = {}) => {
                const options = this.getAvatarEditorOptions();
                const traits = this.normalizeAvatarTraits(stateLike.avatarTraits);
                const avatarUrl = String(stateLike.avatarUrl || '').trim()
                    || this.buildAvatarUrlFromTraits(traits, this.getAvatarSeed(target));
                const groups = [
                    { key: 'backgroundColor', label: '背景' },
                    { key: 'top', label: '发型' },
                    { key: 'hairColor', label: '发色' },
                    { key: 'hatColor', label: '帽色' },
                    { key: 'eyebrows', label: '眉毛' },
                    { key: 'eyes', label: '眼睛' },
                    { key: 'mouth', label: '嘴型' },
                    { key: 'accessories', label: '配饰' },
                    { key: 'accessoriesColor', label: '配饰色' },
                    { key: 'facialHair', label: '胡须' },
                    { key: 'facialHairColor', label: '胡须色' },
                    { key: 'clothing', label: '服装' },
                    { key: 'clothesColor', label: '衣色' },
                    { key: 'clothingGraphic', label: '图案' },
                    { key: 'skinColor', label: '肤色' }
                ];
                const selectHtml = groups.map((group) => {
                    const selectId = `forum-avatar-${target}-${group.key}`;
                    const optionsHtml = (options[group.key] || []).map((item) =>
                        `<option value="${safe(item.value)}" ${traits[group.key] === item.value ? 'selected' : ''}>${safe(item.label)}</option>`
                    ).join('');
                    return `
                        <label>
                            <span class="mag-avatar-field-label">${safe(group.label)}</span>
                            <select class="mag-settings-select" id="${selectId}" onchange="ForumUI.updateAvatarTrait('${target}', '${group.key}', this.value)" style="font-size:12px;padding:5px 8px;">${optionsHtml}</select>
                        </label>
                    `;
                }).join('');
                return `
                    <div class="mag-avatar-editor" style="width:100%;box-sizing:border-box;">
                        <div class="mag-avatar-preview-wrap">
                            <img class="mag-avatar-preview" id="forum-avatar-preview-${target}" src="${safe(avatarUrl)}" alt="头像预览">
                        </div>
                        <div class="mag-avatar-grid">${selectHtml}</div>
                        <div style="display:flex;gap:8px;margin:12px 0;">
                            <button class="mag-settings-btn" onclick="ForumUI.randomizeAvatar('${target}')">随机</button>
                            <button class="mag-settings-btn" onclick="ForumUI.resetAvatar('${target}')">重置</button>
                        </div>
                        <label class="mag-avatar-field-label" style="margin-bottom:6px;display:block;">图片链接（可直接粘贴外链覆盖捏脸）</label>
                        <input class="mag-avatar-url-input" type="text" id="forum-avatar-url-${target}" value="${safe(avatarUrl)}" placeholder="http/https 图片 URL" oninput="ForumUI.updateAvatarUrl('${target}', this.value)">
                    </div>
                `;
            };

            let html = `<div class="forum-view active">
                <div class="mag-settings-wrap">
                    <h1 class="mag-form-title">设置</h1>
                    <div class="mag-form-rule"></div>

                    <div class="mag-settings-section">
                        <div class="mag-settings-section-title">USER · 用户设置</div>
                        <div class="mag-settings-row">
                            <label class="mag-settings-label">我的论坛用户名</label>
                            <input
                                type="text"
                                class="mag-settings-input"
                                value="${safe(this.settingsState.userForumName || '')}"
                                oninput="ForumUI.updateUserForumName(this.value)"
                            >
                        </div>
                        <div class="mag-form-group">
                            <label class="mag-settings-label">我的论坛头像</label>
                            ${buildMagAvatarEditor('user', userAvatarState)}
                        </div>
                    </div>`;

            if (!selectedChar) {
                html += `
                    <div class="mag-settings-section">
                        <div class="mag-settings-section-title">CHARACTER · 角色设置</div>
                        <div class="mag-empty">当前没有可配置的角色。</div>
                    </div>
                    <div class="mag-settings-footer">
                        <button class="mag-settings-btn primary" onclick="ForumUI.saveForumSettings()">保存设置</button>
                    </div>
                </div></div>`;
                this.el.viewContainer.innerHTML = html;
                return;
            }

            html += `
                    <div class="mag-settings-section">
                        <div class="mag-settings-section-title">CHARACTER · 角色设置</div>
                        <div class="mag-settings-row">
                            <label class="mag-settings-label">选择角色</label>
                            <select class="mag-settings-select" id="forum-settings-char-select" onchange="ForumUI.handleCharSelect(this.value)">
                                ${charPool.map((c) => `
                                    <option value="${c.id}" ${c.id === selectedCharId ? 'selected' : ''}>${safe(c.realName || c.displayName || c.id)}</option>
                                `).join('')}
                            </select>
                        </div>
                        <div class="mag-settings-row">
                            <label class="mag-settings-label">角色论坛用户名</label>
                            <div style="display:flex;gap:10px;align-items:center;flex:1;min-width:0;">
                                <input
                                    type="text"
                                    class="mag-settings-input"
                                    value="${safe(charSettings.forumName || '')}"
                                    oninput="ForumUI.updateCharSetting('forumName', this.value)"
                                >
                                <button class="mag-settings-btn" onclick="ForumUI.generateCharForumName()">AI 生成</button>
                            </div>
                        </div>
                        <div class="mag-form-group">
                            <label class="mag-settings-label">角色论坛头像</label>
                            ${buildMagAvatarEditor('char', charSettings)}
                        </div>
                    </div>

                    <div class="mag-settings-section">
                        <div class="mag-settings-section-title">PROMPT · 行为规范</div>
                        <div class="mag-settings-hint" style="margin-bottom:12px;">只填写"自定义行为规范"（如语气限制、禁忌话题等）。角色人设/世界书/记忆/最近聊天会自动注入。</div>
                        <textarea class="mag-settings-textarea" style="min-height:120px;" placeholder="例如：你是一个热心肠的论坛老用户，喜欢鼓励新人..." oninput="ForumUI.updateCharSetting('prompt', this.value)">${safe(charSettings.prompt || '')}</textarea>
                        <div class="mag-settings-hint" style="margin:10px 0 8px 0;">论坛语言风格（仅用于发帖/评论/楼中楼；点评不注入）</div>
                        <textarea
                            class="mag-settings-textarea"
                            style="min-height:90px;"
                            placeholder="例如：口语化、短句、带点毒舌、少客套、多网感"
                            oninput="ForumUI.updateCharSetting('forumLanguageStyle', this.value)"
                        >${safe(charSettings.forumLanguageStyle || '')}</textarea>
                    </div>

                    ${worldBookEntries.length > 0 ? `
                    <div class="mag-settings-section">
                        <div class="mag-settings-section-title">WORLDBOOK · 世界书挂载</div>
                        <div class="mag-wb-list">
                            ${worldBookEntries.map((entry, idx) => {
                                const checked = Array.isArray(charSettings.mountedWorldBookIds)
                                    ? charSettings.mountedWorldBookIds.includes(String(entry.id))
                                    : false;
                                const key = safe(entry.key || `词条 ${idx + 1}`);
                                const brief = safe((entry.content || '').slice(0, 80));
                                return `
                                    <div class="mag-wb-item">
                                        <input type="checkbox" ${checked ? 'checked' : ''} onchange="ForumUI.toggleWorldBookMount(${idx}, this.checked)">
                                        <div>
                                            <div class="mag-wb-key">${key}</div>
                                            ${brief ? `<div class="mag-wb-brief">${brief}…</div>` : ''}
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                    ` : ''}

                        <div class="mag-settings-section">
                            <div class="mag-settings-section-title">QUICK ACTIONS · 快捷操作</div>
                        <div class="mag-settings-row">
                            <label class="mag-settings-label">立即执行</label>
                            <div style="display:flex;gap:10px;flex-wrap:wrap;">
                                <button class="mag-settings-btn" onclick="ForumUI.runCharActionNow('browse')">立即刷帖</button>
                                <button class="mag-settings-btn" onclick="ForumUI.runCharActionNow('reply')">立即回复</button>
                                <button class="mag-settings-btn primary" onclick="ForumUI.runCharActionNow('post')">立即发帖</button>
                            </div>
                            <div style="margin-top:10px;">
                                <button
                                    class="mag-settings-btn"
                                    style="border-color:#cf6868;color:#ab2e2e;background:#fff6f6;"
                                    onclick="ForumUI.refreshCharForumMemoryNow()"
                                >刷新论坛记忆</button>
                            </div>
                            <div class="mag-settings-hint" style="margin-top:8px;">仅手动执行，不再提供自动刷帖/自动发帖/自动回复。</div>
                            <div class="mag-settings-hint" style="margin-top:4px;">“刷新论坛记忆”只会清空该角色的论坛记忆注入缓存，不会删除历史帖子/评论/楼中楼/点赞。</div>
                        </div>
                    </div>

                    <div class="mag-settings-footer">
                        <button class="mag-settings-btn primary" onclick="ForumUI.saveForumSettings()">保存设置</button>
                    </div>
                </div>
            </div>`;

            this.el.viewContainer.innerHTML = html;
        },

        // --- 组件构建辅助 ---

        ensureSettingsState() {
            if (!this.settingsState) {
                this.settingsState = {
                    selectedCharId: null,
                    userForumName: '',
                    userAvatarUrl: '',
                    userAvatarTraits: null,
                    userAgentGlobalEnabled: false,
                    userAgentGlobalLoaded: false,
                    backendSupabaseUrl: '',
                    backendSupabaseKey: '',
                    backendWorkerToken: '',
                    backendConfigLoaded: false,
                    chars: {}
                };
            } else {
                if (!Object.prototype.hasOwnProperty.call(this.settingsState, 'userAgentGlobalEnabled')) {
                    this.settingsState.userAgentGlobalEnabled = false;
                }
                if (!Object.prototype.hasOwnProperty.call(this.settingsState, 'userAgentGlobalLoaded')) {
                    this.settingsState.userAgentGlobalLoaded = false;
                }
                if (!Object.prototype.hasOwnProperty.call(this.settingsState, 'backendSupabaseUrl')) {
                    this.settingsState.backendSupabaseUrl = '';
                }
                if (!Object.prototype.hasOwnProperty.call(this.settingsState, 'backendSupabaseKey')) {
                    this.settingsState.backendSupabaseKey = '';
                }
                if (!Object.prototype.hasOwnProperty.call(this.settingsState, 'backendWorkerToken')) {
                    this.settingsState.backendWorkerToken = '';
                }
                if (!Object.prototype.hasOwnProperty.call(this.settingsState, 'backendConfigLoaded')) {
                    this.settingsState.backendConfigLoaded = false;
                }
            }
        },

        ensureCharSettings(char, worldBookEntries = []) {
            if (!char) return null;
            this.ensureSettingsState();
            const normalizedWorldBooks = Array.isArray(worldBookEntries) ? worldBookEntries : [];
            if (!this.settingsState.chars[char.id]) {
                const initialMountedIds = this.ensureMountedWorldBookIds(
                    char.settings?.mountedWorldBookIds,
                    normalizedWorldBooks
                );
                const parsedAvatar = this.parseAvatarTraitsFromUrl(
                    char.settings?.forumAvatarUrl
                    || char.settings?.avatarUrl
                    || ''
                );
                const initialAvatarTraits = this.normalizeAvatarTraits(
                    char.settings?.forumAvatarTraits
                    || char.settings?.avatarTraits
                    || parsedAvatar?.traits
                    || null
                );
                const initialAvatarUrl = String(
                    char.settings?.forumAvatarUrl
                    || char.settings?.avatarUrl
                    || ''
                ).trim() || this.buildAvatarUrlFromTraits(initialAvatarTraits, this.getAvatarSeed('char', char));
                this.settingsState.chars[char.id] = {
                    forumName: this.getCharForumName(char),
                    avatarUrl: initialAvatarUrl,
                    avatarTraits: initialAvatarTraits,
                    agentEnabled: this.parseBooleanSetting(char.settings?.agentEnabled, false),
                    autoBrowseEnabled: this.parseBooleanSetting(char.settings?.autoBrowseEnabled, false),
                    autoPostEnabled: this.parseBooleanSetting(char.settings?.autoPostEnabled, false),
                    browseTimes: Array.isArray(char.settings?.browseTimes) && char.settings.browseTimes.length
                        ? char.settings.browseTimes.slice()
                        : ['07:00'],
                    postTimes: Array.isArray(char.settings?.postTimes) && char.settings.postTimes.length
                        ? char.settings.postTimes.slice()
                        : ['20:00'],
                    browseInterval: char.settings?.browseInterval || '',
                    postInterval: char.settings?.postInterval || '',
                    replyOnBrowse: this.parseBooleanSetting(char.settings?.replyOnBrowse, true),
                    prompt: this.extractCustomForumPrompt(
                        char.settings?.forumPrompt
                        || char.settings?.charForumPrompt
                        || ''
                    ),
                    forumLanguageStyle: this.sanitizeAgentContextText(
                        String(char.settings?.forumLanguageStyle || ''),
                        1200
                    ),
                    mountedWorldBookIds: initialMountedIds
                };
            } else if (normalizedWorldBooks.length > 0) {
                this.settingsState.chars[char.id].mountedWorldBookIds = this.ensureMountedWorldBookIds(
                    this.settingsState.chars[char.id].mountedWorldBookIds,
                    normalizedWorldBooks
                );
            }
            if (!Object.prototype.hasOwnProperty.call(this.settingsState.chars[char.id], 'forumLanguageStyle')) {
                this.settingsState.chars[char.id].forumLanguageStyle = this.sanitizeAgentContextText(
                    String(char.settings?.forumLanguageStyle || ''),
                    1200
                );
            }
            return this.settingsState.chars[char.id];
        },

        handleCharSelect(charId) {
            this.ensureSettingsState();
            const nextCharId = String(charId || '').trim();
            if (!nextCharId) return;
            this.rememberActiveCharId(nextCharId);
            this.renderCharSettingsView(nextCharId);
        },

        updateUserForumName(value) {
            this.ensureSettingsState();
            this.settingsState.userForumName = value;
        },

        scheduleSettingsAutoSave(delayMs = 500) {
            const delay = Math.max(120, Number(delayMs) || 500);
            if (this.settingsAutoSaveTimer) {
                clearTimeout(this.settingsAutoSaveTimer);
                this.settingsAutoSaveTimer = null;
            }
            this.settingsAutoSaveTimer = setTimeout(async () => {
                this.settingsAutoSaveTimer = null;
                try {
                    await this.saveForumSettings({ silent: true });
                } catch (error) {
                    console.warn('设置自动保存失败', error);
                }
            }, delay);
        },

        async toggleUserAgentGlobal() {
            this.ensureSettingsState();
            const current = this.parseBooleanSetting(this.settingsState.userAgentGlobalEnabled, false);
            const next = !current;
            this.settingsState.userAgentGlobalEnabled = next;
            this.settingsState.userAgentGlobalLoaded = true;
            this.renderCharSettingsView(this.settingsState.selectedCharId || this.getActiveCharId());
            const saved = await this.saveForumSettings({ silent: true });
            if (!saved) {
                alert('全局自动任务开关保存失败，请重试。');
            }
        },

        updateCharSetting(field, value) {
            this.ensureSettingsState();
            const charId = this.settingsState.selectedCharId;
            if (!charId || !this.settingsState.chars[charId]) return;
            if (field === 'prompt') {
                this.settingsState.chars[charId][field] = this.extractCustomForumPrompt(value);
            } else if (field === 'forumLanguageStyle') {
                this.settingsState.chars[charId][field] = this.sanitizeAgentContextText(value || '', 1200);
            } else {
                this.settingsState.chars[charId][field] = value;
            }
            const autoSaveFieldSet = new Set(['browseInterval', 'postInterval']);
            if (autoSaveFieldSet.has(String(field || '').trim())) {
                this.scheduleSettingsAutoSave(550);
            }
        },

        async toggleCharSetting(field) {
            this.ensureSettingsState();
            const charId = this.settingsState.selectedCharId;
            if (!charId || !this.settingsState.chars[charId]) return;
            const key = String(field || '').trim();
            const fallback = key === 'replyOnBrowse';
            const guardedFields = new Set(['agentEnabled', 'autoBrowseEnabled', 'autoPostEnabled', 'replyOnBrowse']);
            const current = this.parseBooleanSetting(this.settingsState.chars[charId][field], fallback);
            const next = !current;
            this.settingsState.chars[charId][field] = next;
            this.renderCharSettingsView(charId);
            const autoSaveFields = new Set(['agentEnabled', 'autoBrowseEnabled', 'autoPostEnabled', 'replyOnBrowse']);
            if (autoSaveFields.has(key)) {
                const saved = await this.saveForumSettings({ silent: true });
                if (!saved) {
                    alert('角色自动任务开关保存失败，请重试。');
                }
            }
        },

        toggleWorldBookMount(index, checked) {
            this.ensureSettingsState();
            const charId = this.settingsState.selectedCharId;
            if (!charId || !this.settingsState.chars[charId]) return;
            const meta = this.projectCharMeta.get(String(charId)) || null;
            const entries = meta && Array.isArray(meta.worldBookEntries) ? meta.worldBookEntries : [];
            if (!Array.isArray(entries) || index < 0 || index >= entries.length) return;

            const entryId = String(entries[index].id || '');
            if (!entryId) return;

            const settings = this.settingsState.chars[charId];
            if (!Array.isArray(settings.mountedWorldBookIds)) {
                settings.mountedWorldBookIds = [];
            }

            const set = new Set(settings.mountedWorldBookIds.map((item) => String(item)));
            if (checked) {
                set.add(entryId);
            } else {
                set.delete(entryId);
            }
            settings.mountedWorldBookIds = Array.from(set);
        },

        updateCharTime(type, index, value) {
            this.ensureSettingsState();
            const charId = this.settingsState.selectedCharId;
            if (!charId || !this.settingsState.chars[charId]) return;
            const key = type === 'post' ? 'postTimes' : 'browseTimes';
            const list = this.settingsState.chars[charId][key];
            if (!Array.isArray(list) || index < 0 || index >= list.length) return;
            list[index] = value;
            this.scheduleSettingsAutoSave(450);
        },

        addCharTime(type) {
            this.ensureSettingsState();
            const charId = this.settingsState.selectedCharId;
            if (!charId || !this.settingsState.chars[charId]) return;
            const key = type === 'post' ? 'postTimes' : 'browseTimes';
            const list = this.settingsState.chars[charId][key];
            if (Array.isArray(list)) {
                list.push('08:00');
            } else {
                this.settingsState.chars[charId][key] = ['08:00'];
            }
            this.renderCharSettingsView(charId);
            this.scheduleSettingsAutoSave(450);
        },

        removeCharTime(type, index) {
            this.ensureSettingsState();
            const charId = this.settingsState.selectedCharId;
            if (!charId || !this.settingsState.chars[charId]) return;
            const key = type === 'post' ? 'postTimes' : 'browseTimes';
            const list = this.settingsState.chars[charId][key];
            if (!Array.isArray(list) || index < 0 || index >= list.length) return;
            list.splice(index, 1);
            this.renderCharSettingsView(charId);
            this.scheduleSettingsAutoSave(450);
        },

        generateCharForumName() {
            this.ensureSettingsState();
            const charId = this.settingsState.selectedCharId;
            const store = this.storage && this.storage._store;
            const char = store && store.chars ? store.chars.get(charId) : null;
            if (!char) return;
            const settings = this.ensureCharSettings(char);
            if (!settings) return;
            const pool = ['星潮', '夜航', '微光', '归屿', '雾航', '远岚', '潮汐'];
            const base = char.realName || char.displayName || 'Char';
            const suffix = Math.floor(100 + Math.random() * 900);
            const pick = pool[Math.floor(Math.random() * pool.length)];
            settings.forumName = `${base}${pick}${suffix}`;
            this.renderCharSettingsView(charId);
        },

        async saveForumSettings(options = {}) {
            this.ensureSettingsState();
            const silent = Boolean(options && options.silent);
            const saveAllChars = Boolean(options && options.saveAllChars);
            const skipQueueCancel = Boolean(options && options.skipQueueCancel);
            const selectedCharId = String(
                this.settingsState.selectedCharId
                || this.getActiveCharId()
                || ''
            ).trim();
            if (selectedCharId) {
                this.rememberActiveCharId(selectedCharId);
            }

            try {
                let previousGlobalAgentEnabled = false;
                let nextGlobalAgentEnabled = false;
                if (this.projectCharMeta.size === 0) {
                    try {
                        await this.requestProjectCharSync({
                            force: true,
                            minIntervalMs: 0,
                            syncOptions: { fastMode: true, maxAttempts: 6, retryDelayMs: 260 }
                        });
                    } catch (_) { }
                }

                const requiresAgentApiSync = false;
                if (requiresAgentApiSync) {
                    let syncResult = null;
                    try {
                        syncResult = await this.syncAgentApiProfileFromBridge({ force: true });
                    } catch (error) {
                        syncResult = {
                            ok: false,
                            code: 'sync_exception',
                            error: String(error?.message || error || 'unknown')
                        };
                    }
                    if (!syncResult || !syncResult.ok) {
                        const code = String(syncResult?.code || 'sync_failed').trim() || 'sync_failed';
                        if (!silent) {
                            alert(`保存失败：Agent API 同步失败（${code}）。请先运行一次 Agent 自检。`);
                        }
                        return false;
                    }
                }

                const user = await this.storage.getUser(this.viewerUserId);
                if (user) {
                    user.settings = user.settings || {};
                    previousGlobalAgentEnabled = this.parseBooleanSetting(user.settings.forumAgentGlobalEnabled, false);
                    const nextUserForumName = (this.settingsState.userForumName || '').trim()
                        || this.getUserForumName(user);
                    const nextUserAvatarTraits = this.normalizeAvatarTraits(this.settingsState.userAvatarTraits);
                    const nextUserAvatarUrl = String(this.settingsState.userAvatarUrl || '').trim()
                        || this.buildAvatarUrlFromTraits(nextUserAvatarTraits, this.getAvatarSeed('user', user));
                    // 自动 Agent 已移除：全局开关始终关闭。
                    nextGlobalAgentEnabled = false;
                    let forumTimeZone = String(user.settings.forumTimeZone || '').trim();
                    try {
                        forumTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || forumTimeZone;
                    } catch (_) { }
                    const forumTimeZoneOffsetMinutes = Number.isFinite(-new Date().getTimezoneOffset())
                        ? -new Date().getTimezoneOffset()
                        : (Number(user.settings.forumTimeZoneOffsetMinutes) || 0);
                    user.settings.forumName = nextUserForumName;
                    user.settings.forumAvatarTraits = nextUserAvatarTraits;
                    user.settings.forumAvatarUrl = nextUserAvatarUrl;
                    user.settings.forumAgentGlobalEnabled = nextGlobalAgentEnabled;
                    user.settings.forumTimeZone = forumTimeZone;
                    user.settings.forumTimeZoneOffsetMinutes = forumTimeZoneOffsetMinutes;
                    if (selectedCharId) {
                        user.settings.forumActiveCharId = selectedCharId;
                    }
                    user.forumName = nextUserForumName;
                    user.avatarUrl = nextUserAvatarUrl;
                    this.settingsState.userForumName = nextUserForumName;
                    this.settingsState.userAvatarTraits = nextUserAvatarTraits;
                    this.settingsState.userAvatarUrl = nextUserAvatarUrl;
                    this.settingsState.userAgentGlobalEnabled = nextGlobalAgentEnabled;
                    this.settingsState.userAgentGlobalLoaded = true;
                    localStorage.setItem('forum_user_name', nextUserForumName);

                    if (this.storage && typeof this.storage.updateUser === 'function') {
                        await this.storage.updateUser({
                            id: user.id,
                            username: user.username,
                            forumName: user.forumName,
                            profile: user.profile || {},
                            stats: user.stats || {},
                            settings: user.settings
                        });
                    }

                    const identity = await this.storage.getForumIdentity('user', user.id);
                    identity.displayName = ForumLink.identity.formatUserDisplayName(user);
                    await this.storage.saveForumIdentity(identity);
                }

                const queueStopCharIds = [];
                const targetCharIds = saveAllChars
                    ? this.getOwnedCharsForSettings()
                        .map((char) => String(char?.id || '').trim())
                        .filter(Boolean)
                    : [selectedCharId].filter(Boolean);
                const uniqueTargetCharIds = Array.from(new Set(targetCharIds));

                for (const charId of uniqueTargetCharIds) {
                    const charSettings = this.settingsState.chars[charId];
                    const char = charId ? await this.storage.getChar(charId) : null;
                    if (!char || !charSettings) continue;
                    char.settings = char.settings || {};
                    const meta = this.projectCharMeta.get(String(charId)) || null;
                    if (meta) {
                        const syncedRecentChats = this.normalizeAgentRecentChatsForSync(
                            Array.isArray(meta.recentChats) ? meta.recentChats : [],
                            50
                        );
                        const metaWorldBookEntries = Array.isArray(meta.worldBookEntries) ? meta.worldBookEntries : [];
                        const mountedWorldBookIds = this.ensureMountedWorldBookIds(
                            charSettings.mountedWorldBookIds,
                            metaWorldBookEntries
                        );
                        const mountedWorldBookSet = new Set(mountedWorldBookIds);
                        const mountedWorldBookEntries = metaWorldBookEntries.filter((entry) =>
                            mountedWorldBookSet.has(String(entry?.id || ''))
                        );
                        const syncedWorldBookEntries = this.normalizeAgentWorldBookEntriesForSync(
                            mountedWorldBookEntries,
                            40
                        );
                        const syncedWorldBookText = this.sanitizeAgentContextText(
                            this.formatWorldBookText(syncedWorldBookEntries),
                            6000
                        );
                        char.settings = this.applyAgentContextToSettings(char.settings, {
                            persona: this.sanitizeAgentContextText(meta.persona || '', 2600),
                            memory: this.sanitizeAgentContextText(meta.memory || '', 3600),
                            recentChats: syncedRecentChats,
                            worldBookEntries: syncedWorldBookEntries,
                            worldBookText: syncedWorldBookText,
                            charForumPrompt: this.sanitizeAgentContextText(meta.charForumPrompt || '', 2800),
                            onlineStyle: this.sanitizeAgentContextText(meta.onlineStyle || '', 1200)
                        });
                    }
                    const previousAgentEnabled = this.parseBooleanSetting(char.settings.agentEnabled, false);
                    const previousAutoBrowseEnabled = this.parseBooleanSetting(char.settings.autoBrowseEnabled, false);
                    const previousAutoPostEnabled = this.parseBooleanSetting(char.settings.autoPostEnabled, false);
                    const previousReplyOnBrowse = this.parseBooleanSetting(char.settings.replyOnBrowse, true);
                    const normalizeTimeListForCompare = (list) => {
                        if (!Array.isArray(list)) return [];
                        return list
                            .map((item) => String(item || '').trim())
                            .filter((item) => /^\d{2}:\d{2}$/.test(item));
                    };
                    const previousBrowseInterval = String(char.settings.browseInterval || '').trim();
                    const previousPostInterval = String(char.settings.postInterval || '').trim();
                    const previousBrowseTimes = normalizeTimeListForCompare(char.settings.browseTimes);
                    const previousPostTimes = normalizeTimeListForCompare(char.settings.postTimes);
                    // 自动 Agent 已移除：角色级自动设置统一归零。
                    const nextAgentEnabled = false;
                    const nextAutoBrowseEnabled = false;
                    const nextAutoPostEnabled = false;
                    const nextReplyOnBrowse = false;
                    const nextBrowseInterval = '';
                    const nextPostInterval = '';
                    const nextBrowseTimes = [];
                    const nextPostTimes = [];
                    const scheduleConfigChanged = (
                        previousBrowseInterval !== nextBrowseInterval
                        || previousPostInterval !== nextPostInterval
                        || previousBrowseTimes.join('|') !== nextBrowseTimes.join('|')
                        || previousPostTimes.join('|') !== nextPostTimes.join('|')
                    );
                    const nextCharForumName = (charSettings.forumName || '').trim()
                        || this.getCharForumName(char);
                    const nextCharAvatarTraits = this.normalizeAvatarTraits(charSettings.avatarTraits);
                    const nextCharAvatarUrl = String(charSettings.avatarUrl || '').trim()
                        || this.buildAvatarUrlFromTraits(nextCharAvatarTraits, this.getAvatarSeed('char', char));

                    char.settings.forumName = nextCharForumName;
                    char.settings.forumAvatarTraits = nextCharAvatarTraits;
                    char.settings.forumAvatarUrl = nextCharAvatarUrl;
                    char.settings.agentEnabled = nextAgentEnabled;
                    char.settings.autoBrowseEnabled = nextAutoBrowseEnabled;
                    char.settings.autoPostEnabled = nextAutoPostEnabled;
                    char.settings.browseTimes = nextBrowseTimes;
                    char.settings.postTimes = nextPostTimes;
                    char.settings.browseInterval = nextBrowseInterval;
                    char.settings.postInterval = nextPostInterval;
                    char.settings.replyOnBrowse = nextReplyOnBrowse;
                    char.settings.forumPrompt = this.extractCustomForumPrompt(charSettings.prompt || '');
                    char.settings.forumLanguageStyle = this.sanitizeAgentContextText(
                        String(charSettings.forumLanguageStyle || ''),
                        1200
                    );
                    char.settings.mountedWorldBookIds = Array.isArray(charSettings.mountedWorldBookIds)
                        ? charSettings.mountedWorldBookIds.map((item) => String(item)).filter(Boolean)
                        : [];
                    char.forumName = nextCharForumName;
                    char.avatarUrl = nextCharAvatarUrl;
                    charSettings.forumName = nextCharForumName;
                    charSettings.avatarTraits = nextCharAvatarTraits;
                    charSettings.avatarUrl = nextCharAvatarUrl;
                    charSettings.prompt = char.settings.forumPrompt;
                    charSettings.forumLanguageStyle = char.settings.forumLanguageStyle;
                    charSettings.agentEnabled = nextAgentEnabled;
                    charSettings.autoBrowseEnabled = nextAutoBrowseEnabled;
                    charSettings.autoPostEnabled = nextAutoPostEnabled;
                    charSettings.replyOnBrowse = nextReplyOnBrowse;

                    if (
                        (previousAgentEnabled && !nextAgentEnabled)
                        || (previousAutoBrowseEnabled && !nextAutoBrowseEnabled)
                        || (previousAutoPostEnabled && !nextAutoPostEnabled)
                        || (previousReplyOnBrowse && !nextReplyOnBrowse)
                        || scheduleConfigChanged
                    ) {
                        queueStopCharIds.push(String(char.id || '').trim());
                    }

                    if (this.storage && typeof this.storage.updateChar === 'function') {
                        await this.storage.updateChar({
                            id: char.id,
                            realName: char.realName,
                            displayName: char.displayName,
                            ownerUserId: char.ownerUserId || char.owner_user_id || null,
                            numberTag: char.numberTag || char.number_tag || '0001',
                            forumName: char.forumName,
                            stats: char.stats || {},
                            settings: char.settings
                        });
                    }

                    const identity = await this.storage.getForumIdentity('char', char.id);
                    identity.displayName = this.getCharForumName(char);
                    await this.storage.saveForumIdentity(identity);
                    if (String(char.id || '').trim() === selectedCharId) {
                        this.rememberActiveCharId(char.id);
                    }
                }

                if (!skipQueueCancel) {
                    if (previousGlobalAgentEnabled && !nextGlobalAgentEnabled) {
                        await this.cancelPendingAgentJobs({
                            userId: this.viewerUserId,
                            statusIn: ['pending', 'retry', 'running'],
                            reason: 'disabled_by_user'
                        });
                    } else if (queueStopCharIds.length > 0) {
                        await this.cancelPendingAgentJobs({
                            userId: this.viewerUserId,
                            charIds: Array.from(new Set(queueStopCharIds)),
                            statusIn: ['pending', 'retry', 'running'],
                            reason: 'disabled_by_user'
                        });
                    }
                }

                if (!silent) {
                    alert('保存成功');
                }
                return true;
            } catch (error) {
                console.error('保存论坛设置失败', error);
                if (!silent) {
                    alert('保存失败，请稍后重试');
                }
                return false;
            }
        },

        getUserForumName(user) {
            if (!user) return '';
            return user.forumName || user.settings?.forumName || user.username || '用户';
        },

        getCharForumName(char) {
            if (!char) return '';
            return char.settings?.forumName || char.forumName || char.displayName || char.realName || '角色';
        },

        buildPostingIdentity(baseIdentity, anonymous = false) {
            if (!baseIdentity) return null;
            const identity = Object.assign({}, baseIdentity, {
                anonymous: Boolean(anonymous)
            });
            if (identity.anonymous && !identity.anonDisplayId) {
                identity.anonDisplayId = String(Math.floor(1000 + Math.random() * 9000));
            }
            return identity;
        },

        async resolveAuthorAvatar(authorIdentity, displayIdentity = null) {
            const identity = authorIdentity && typeof authorIdentity === 'object'
                ? authorIdentity
                : null;
            if (!identity) return '';
            if (identity.anonymous || displayIdentity?.anonymous) return '';

            const authorType = String(identity.authorType || identity.author_type || '').trim();
            const authorId = String(identity.authorId || identity.author_id || identity.id || '').trim();
            if (!authorType || !authorId || !this.storage) return '';
            try {
                if (authorType === 'user') {
                    const user = await this.storage.getUser(authorId);
                    return user ? this.getUserForumAvatar(user) : '';
                }
                if (authorType === 'char') {
                    const char = await this.storage.getChar(authorId);
                    return char ? this.getCharForumAvatar(char) : '';
                }
                return '';
            } catch (_error) {
                return '';
            }
        },

        renderAuthorAvatarHtml(avatarUrl, fallbackName = '', displayIdentity = null) {
            const safe = ForumLink.utils.escapeHtml;
            const isAnonymous = Boolean(displayIdentity && displayIdentity.anonymous);
            const url = String(avatarUrl || '').trim();
            if (url && !isAnonymous) {
                return `<img src="${safe(url)}" alt="${safe(fallbackName || '头像')}" loading="lazy" referrerpolicy="no-referrer">`;
            }
            const initial = isAnonymous ? '' : safe((fallbackName || '?').slice(0, 1));
            return `<span class="forum-avatar-fallback">${initial}</span>`;
        },

        canViewCharProfile(charId, char = null) {
            const targetCharId = String(charId || char?.id || '').trim();
            if (!targetCharId) return false;
            const ownerUserId = String(char?.ownerUserId || char?.owner_user_id || '').trim();
            if (ownerUserId) {
                return ownerUserId === String(this.viewerUserId || '').trim();
            }
            return this.projectCharMeta.has(targetCharId);
        },

        buildRankingPodium(list, type) {
            if (!list || list.length === 0) {
                return '<div class="forum-empty">暂无数据</div>';
            }

            // Take top 3
            const top3 = list.slice(0, 3);

            // Reorder for podium: 2, 1, 3
            // We can just render them and let CSS order property handle visual position, 
            // but CSS order requires them to be siblings.
            // .forum-podium-rank-1 { order: 2 }
            // .forum-podium-rank-2 { order: 1 }
            // .forum-podium-rank-3 { order: 3 }

            const renderItem = (item, index) => {
                const rank = index + 1;
                let name = '';
                if (type === 'user') {
                    name = this.getUserForumName(item.user) || `用户 ${item.userId}`;
                } else {
                    name = this.getCharForumName(item.char) || `角色 ${item.charId}`;
                }
                name = ForumLink.utils.escapeHtml(name);
                const canNavigate = type === 'user'
                    ? true
                    : this.canViewCharProfile(item?.charId || item?.char?.id || '', item?.char || null);
                const clickAttr = canNavigate
                    ? `onclick="ForumUI.navigate('${type}', {${type}Id: '${type === 'user' ? item.userId : item.charId}'})"`
                    : '';
                const disabledStyle = canNavigate ? '' : 'style="cursor:default;opacity:0.7;"';

                const avatarSrc = type === 'user'
                    ? this.getUserForumAvatar(item.user)
                    : this.getCharForumAvatar(item.char);

                return `
                    <div class="forum-podium-item forum-podium-rank-${rank}" ${clickAttr} ${disabledStyle}>
                        <img src="${ForumLink.utils.escapeHtml(avatarSrc)}" class="forum-podium-avatar">
                        <div class="forum-podium-name" title="${name}">${name}</div>
                    </div>
                `;
            };

            return `
                <div class="forum-ranking-podium">
                    ${top3.map((item, index) => renderItem(item, index)).join('')}
                </div>
            `;
        },

        renderAuthorInline(displayIdentity, fallbackName) {
            const displayName = ForumLink.utils.escapeHtml(displayIdentity?.displayName || fallbackName || '未知用户');
            const realName = ForumLink.utils.escapeHtml(displayIdentity?.realDisplayName || displayName);
            const canReveal = Boolean(displayIdentity && !displayIdentity.anonymous && realName && realName !== displayName);
            const canRevealAnonymous = Boolean(
                displayIdentity
                && displayIdentity.anonymous
                && displayIdentity.canRevealRealName
                && realName
                && realName !== displayName
            );
            if (canRevealAnonymous) {
                return `
                    <span class="forum-author-wrap">
                        <span class="forum-author-name">${displayName}</span>
                        <span class="forum-author-real">${realName}</span>
                    </span>
                `;
            }
            if (!canReveal) {
                return `<span class="forum-author-name">${displayName}</span>`;
            }
            return `
                <span class="forum-author-wrap">
                    <span class="forum-author-name">${displayName}</span>
                    <span class="forum-author-real">${realName}</span>
                </span>
            `;
        },

        mentionTokenRegex() {
            return /@\[(.+?)\]\((user|char):([a-zA-Z0-9_-]+)\)/g;
        },

        buildMentionToken(label, receiverType, receiverId) {
            const safeLabel = String(label || '').trim();
            const safeType = String(receiverType || '').trim();
            const safeId = String(receiverId || '').trim();
            if (!safeLabel || !safeType || !safeId) return '';
            return `@[${safeLabel}](${safeType}:${safeId})`;
        },

        normalizeMentionAlias(value) {
            const text = String(value || '').trim();
            if (!text) return '';
            return text.toLowerCase();
        },

        async collectMentionCandidates({ threadId = null } = {}) {
            const candidates = new Map();
            const pushCandidate = (receiverType, receiverId, names = []) => {
                const type = String(receiverType || '').trim();
                const id = String(receiverId || '').trim();
                if (!type || !id) return;
                const key = `${type}:${id}`;
                if (!candidates.has(key)) {
                    candidates.set(key, {
                        receiverType: type,
                        receiverId: id,
                        names: new Set()
                    });
                }
                const row = candidates.get(key);
                (Array.isArray(names) ? names : [names]).forEach((name) => {
                    const alias = String(name || '').trim();
                    if (!alias) return;
                    row.names.add(alias);
                });
            };
            const addByIdentity = async (identity) => {
                if (!identity || typeof identity !== 'object') return;
                const authorType = String(identity.authorType || identity.author_type || '').trim();
                const authorId = String(identity.authorId || identity.author_id || '').trim();
                if (!authorType || !authorId) return;
                const names = [];
                const displayName = String(identity.displayName || identity.display_name || '').trim();
                if (displayName) names.push(displayName);
                if (authorType === 'user' && this.storage && typeof this.storage.getUser === 'function') {
                    const user = await this.storage.getUser(authorId);
                    if (user) {
                        names.push(
                            user.forumName,
                            user.settings?.forumName,
                            user.username,
                            user.profile?.name,
                            user.profile?.displayName
                        );
                    }
                } else if (authorType === 'char' && this.storage && typeof this.storage.getChar === 'function') {
                    const char = await this.storage.getChar(authorId);
                    if (char) {
                        const tag = String(char.numberTag || '').replace(/\D/g, '').slice(-4);
                        names.push(
                            char.forumName,
                            char.settings?.forumName,
                            char.displayName,
                            char.realName
                        );
                        if (tag) {
                            const baseForumName = String(char.forumName || char.settings?.forumName || '').trim();
                            const baseRealName = String(char.realName || char.displayName || '').trim();
                            if (baseForumName) names.push(`${baseForumName}#${tag}`);
                            if (baseRealName) names.push(`${baseRealName}#${tag}`);
                        }
                    }
                }
                pushCandidate(authorType, authorId, names);
            };

            if (this.viewerUserId && this.storage && typeof this.storage.getUser === 'function') {
                const user = await this.storage.getUser(this.viewerUserId);
                if (user) {
                    pushCandidate('user', user.id, [
                        user.forumName,
                        user.settings?.forumName,
                        user.username,
                        user.profile?.name
                    ]);
                }
            }
            const chars = this.getCharList()
                .filter((char) => String(char?.ownerUserId || '') === String(this.viewerUserId || ''));
            chars.forEach((char) => {
                const tag = String(char.numberTag || '').replace(/\D/g, '').slice(-4);
                const forumName = String(char.forumName || char.settings?.forumName || '').trim();
                const realName = String(char.realName || char.displayName || '').trim();
                const names = [forumName, realName, char.displayName];
                if (tag) {
                    if (forumName) names.push(`${forumName}#${tag}`);
                    if (realName) names.push(`${realName}#${tag}`);
                }
                pushCandidate('char', char.id, names);
            });

            const safeThreadId = String(threadId || '').trim();
            if (safeThreadId && this.storage) {
                try {
                    if (typeof this.storage.getThread === 'function') {
                        const thread = await this.storage.getThread(safeThreadId);
                        if (thread && thread.authorIdentity) {
                            await addByIdentity(thread.authorIdentity);
                        }
                    }
                    if (typeof this.storage.listComments === 'function') {
                        const comments = await this.storage.listComments(safeThreadId, { limit: 400 });
                        for (const comment of comments || []) {
                            if (comment?.authorIdentity) {
                                await addByIdentity(comment.authorIdentity);
                            }
                        }
                    }
                } catch (_) { }
            }
            return Array.from(candidates.values()).map((item) => ({
                receiverType: item.receiverType,
                receiverId: item.receiverId,
                names: Array.from(item.names.values()).filter(Boolean)
            }));
        },

        async resolveMentionsForSubmit(text, { threadId = null } = {}) {
            const source = String(text || '');
            if (!source || source.indexOf('@') < 0) {
                return { text: source, mentions: [] };
            }

            const candidates = await this.collectMentionCandidates({ threadId });
            const aliasMap = new Map();
            candidates.forEach((candidate) => {
                (candidate.names || []).forEach((name) => {
                    const alias = this.normalizeMentionAlias(name);
                    if (!alias) return;
                    if (!aliasMap.has(alias)) aliasMap.set(alias, []);
                    aliasMap.get(alias).push(candidate);
                });
            });

            const mentions = [];
            const seenMentionKey = new Set();
            const registerMention = (receiverType, receiverId, label) => {
                const type = String(receiverType || '').trim();
                const id = String(receiverId || '').trim();
                if (!type || !id) return;
                const key = `${type}:${id}`;
                if (seenMentionKey.has(key)) return;
                seenMentionKey.add(key);
                mentions.push({ receiverType: type, receiverId: id, label: String(label || '').trim() });
            };

            const existingTokenRegex = this.mentionTokenRegex();
            let tokenMatch;
            while ((tokenMatch = existingTokenRegex.exec(source)) !== null) {
                registerMention(tokenMatch[2], tokenMatch[3], tokenMatch[1]);
            }

            const mentionRegex = /@([^\s@#，。！？:：;；,.!?\[\](){}<>]{1,32})/g;
            const convertedText = source.replace(mentionRegex, (full, rawName, offset, whole) => {
                const name = String(rawName || '').trim();
                if (!name) return full;
                // 跳过已经是 token 的 @[
                const nextChar = whole[offset + 1];
                if (nextChar === '[') return full;

                const alias = this.normalizeMentionAlias(name);
                const matched = aliasMap.get(alias) || [];
                if (matched.length !== 1) return full;
                const target = matched[0];
                registerMention(target.receiverType, target.receiverId, name);
                return this.buildMentionToken(name, target.receiverType, target.receiverId) || full;
            });

            return {
                text: convertedText,
                mentions
            };
        },

        handleMentionInputPreview(inputId, hintId, threadId = '') {
            const key = `${inputId || ''}:${hintId || ''}`;
            if (this.mentionPreviewTimers.has(key)) {
                clearTimeout(this.mentionPreviewTimers.get(key));
            }
            const timer = setTimeout(() => {
                this.updateMentionInputPreview(inputId, hintId, threadId).catch(() => {});
            }, 220);
            this.mentionPreviewTimers.set(key, timer);
        },

        async updateMentionInputPreview(inputId, hintId, threadId = '') {
            const input = document.getElementById(inputId);
            const hint = document.getElementById(hintId);
            if (!input || !hint) return;
            const text = String(input.value || '');
            if (!text || text.indexOf('@') < 0) {
                hint.innerHTML = '';
                return;
            }

            const rawNames = [];
            const mentionRegex = /@([^\s@#，。！？:：;；,.!?\[\](){}<>]{1,32})/g;
            let match;
            while ((match = mentionRegex.exec(text)) !== null) {
                const name = String(match[1] || '').trim();
                if (!name) continue;
                if (!rawNames.includes(name)) rawNames.push(name);
            }
            if (!rawNames.length) {
                hint.innerHTML = '';
                return;
            }

            const candidates = await this.collectMentionCandidates({ threadId: String(threadId || '').trim() || null });
            const aliasMap = new Map();
            candidates.forEach((candidate) => {
                (candidate.names || []).forEach((name) => {
                    const alias = this.normalizeMentionAlias(name);
                    if (!alias) return;
                    if (!aliasMap.has(alias)) aliasMap.set(alias, []);
                    aliasMap.get(alias).push(candidate);
                });
            });

            const success = [];
            const ambiguous = [];
            const unknown = [];
            rawNames.forEach((name) => {
                const alias = this.normalizeMentionAlias(name);
                const matched = aliasMap.get(alias) || [];
                if (matched.length === 1) {
                    success.push(name);
                } else if (matched.length > 1) {
                    ambiguous.push(name);
                } else {
                    unknown.push(name);
                }
            });

            const safe = ForumLink.utils.escapeHtml;
            const parts = [];
            if (success.length > 0) {
                parts.push(`已匹配：${success.map((item) => `<span class="forum-mention">@${safe(item)}</span>`).join(' ')}`);
            }
            if (ambiguous.length > 0) {
                parts.push(`重名待确认：${ambiguous.map((item) => `@${safe(item)}`).join(' ')}`);
            }
            if (unknown.length > 0) {
                parts.push(`未匹配：${unknown.map((item) => `@${safe(item)}`).join(' ')}`);
            }
            hint.innerHTML = parts.join(' · ');
        },

        formatForumText(text) {
            const raw = String(text || '')
                .replace(/\r\n?/g, '\n')
                .replace(/^\uFEFF/, '')
                .replace(/^[\s\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]+/g, '');
            const tokens = [];
            let tokenIndex = 0;
            const withPlaceholders = raw.replace(this.mentionTokenRegex(), (_full, label) => {
                const key = `__FORUM_MENTION_${tokenIndex}__`;
                tokens.push({
                    key,
                    html: `<span class="forum-mention">@${ForumLink.utils.escapeHtml(String(label || '').trim())}</span>`
                });
                tokenIndex += 1;
                return key;
            });
            let safe = ForumLink.utils.escapeHtml(withPlaceholders);
            tokens.forEach((token) => {
                safe = safe.replace(token.key, token.html);
            });
            return safe.replace(/\n/g, '<br>');
        },

        buildHotThreadCard(thread) {
            const plainContent = ForumLink.notify && typeof ForumLink.notify.stripMentionMarkup === 'function'
                ? ForumLink.notify.stripMentionMarkup(thread.content || '')
                : String(thread.content || '');
            return `
                 <div class="forum-hot-card" onclick="ForumUI.navigate('thread', {threadId: '${thread.id}'})">
                    <div class="forum-hot-content">
                        <div class="forum-hot-title">${ForumLink.utils.escapeHtml(thread.title)}</div>
                        <div class="forum-hot-desc">${ForumLink.utils.escapeHtml(plainContent)}</div>
                    </div>
                    <div class="forum-hot-stats">
                        <div class="forum-hot-stat-item">
                            <div class="forum-hot-stat-icon">
                                <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M27.6002 18.5998V11.3998C27.6002 8.41743 25.1826 5.99977 22.2002 5.99977L15.0002 22.1998V41.9998H35.9162C37.7113 42.0201 39.2471 40.7147 39.5162 38.9398L42.0002 22.7398C42.1587 21.6955 41.8506 20.6343 41.1576 19.8373C40.4645 19.0403 39.4564 18.5878 38.4002 18.5998H27.6002Z" stroke="#94a3b8" stroke-width="4" stroke-linejoin="round"/><path d="M15 22.0001H10.194C8.08532 21.9628 6.2827 23.7095 6 25.7994V38.3994C6.2827 40.4894 8.08532 42.0367 10.194 41.9994H15V22.0001Z" fill="#94a3b8" stroke="#94a3b8" stroke-width="4" stroke-linejoin="round"/></svg>
                            </div>
                            <div class="forum-hot-stat-num">${thread.metrics.like || 0}</div>
                        </div>
                        <div class="forum-hot-stat-item">
                            <div class="forum-hot-stat-icon">
                                <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M44 6H4V36H13V41L23 36H44V6Z" fill="#94a3b8" stroke="#94a3b8" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 19.5V22.5" stroke="#FFF" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M24 19.5V22.5" stroke="#FFF" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M34 19.5V22.5" stroke="#FFF" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>
                            </div>
                            <div class="forum-hot-stat-num">${thread.metrics.commentCount || 0}</div>
                        </div>
                    </div>
                </div>
            `;
        },

        buildThreadListItem(thread, index = null) {
            const safe = ForumLink.utils.escapeHtml;
            const authorName = thread.displayAuthorName
                || (thread.authorIdentity ? thread.authorIdentity.displayName : '匿名');
            const authorHtml = this.renderAuthorInline(thread.displayIdentity, authorName);
            const avatarUrl = thread.authorAvatarUrl;
            const avatarHtml = avatarUrl
                ? `<span class="mag-thread-byline-avatar"><img src="${safe(avatarUrl)}" alt="${safe(authorName)}"></span>`
                : '';
            const tagsHtml = (thread.tags || []).map((tag) =>
                `<span class="mag-thread-tag">#${safe(tag)}</span>`
            ).join('');
            const dateStr = thread.createdAt ? new Date(thread.createdAt).toLocaleDateString('zh-CN') : '';
            const plainContent = ForumLink.notify && typeof ForumLink.notify.stripMentionMarkup === 'function'
                ? ForumLink.notify.stripMentionMarkup(thread.content || '')
                : String(thread.content || '');
            const excerpt = safe(plainContent.substring(0, 80));
            const numberText = Number.isInteger(index) && index >= 0
                ? String(index + 1).padStart(2, '0')
                : '01';

            return `
                <div class="mag-thread-row" onclick="ForumUI.navigate('thread', {threadId: '${thread.id}'})">
                    <div class="mag-thread-index" aria-hidden="true">${numberText}</div>
                    <div class="mag-thread-main">
                        <div class="mag-thread-title">${safe(thread.title || '')}</div>
                        ${excerpt ? `<div class="mag-thread-excerpt">${excerpt}</div>` : ''}
                        <div class="mag-thread-byline">
                            ${avatarHtml}
                            ${authorHtml}
                            ${tagsHtml}
                        </div>
                    </div>
                    <div class="mag-thread-side">
                        <div class="mag-thread-date">${dateStr}</div>
                        <div class="mag-thread-stats">
                            <span class="mag-thread-stat" title="点赞">♥ ${thread.metrics ? (thread.metrics.like || 0) : 0}</span>
                            <span class="mag-thread-stat" title="评论">◎ ${thread.metrics ? (thread.metrics.commentCount || 0) : 0}</span>
                        </div>
                    </div>
                </div>
            `;
        },

        buildCommentItem(comment, canDelete = false, threadId = null, highlightCommentId = null, depth = 0, options = {}) {
            const safe = ForumLink.utils.escapeHtml;
            const authorName = comment.displayAuthorName
                || (comment.authorIdentity ? comment.authorIdentity.displayName : '匿名');
            const authorHtml = this.renderAuthorInline(comment.displayIdentity, authorName);
            const avatarUrl = comment.authorAvatarUrl;
            const initial = safe((authorName[0] || '?').toUpperCase());
            const avatarInner = avatarUrl
                ? `<img src="${safe(avatarUrl)}" alt="${safe(authorName)}" style="width:100%;height:100%;object-fit:cover;display:block;">`
                : `<span class="mag-comment-initial">${initial}</span>`;
            const replyCountRaw = Number(options?.replyCount);
            const replyCount = Number.isFinite(replyCountRaw) && replyCountRaw > 0
                ? Math.floor(replyCountRaw)
                : 0;
            const replyToName = String(options?.replyToName || '').trim();
            const replyPrefixHtml = replyToName
                ? `<span class="mag-comment-reply-prefix">回复${safe(replyToName)}：</span>`
                : '';
            const contentHtml = `${replyPrefixHtml}${this.formatForumText(comment.content || '')}`;
            const timeStr = comment.createdAt
                ? new Date(comment.createdAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                : '';
            const isHighlight = highlightCommentId && String(comment.id) === String(highlightCommentId);
            const isReplyComposerOpen = String(this.state.activeReplyCommentId || '') === String(comment.id);
            const replyInputId = this.getInlineReplyInputId(comment.id);
            const replyAnonSwitchId = this.getInlineReplyAnonSwitchId(comment.id);
            const replyMentionHintId = this.getInlineReplyMentionHintId(comment.id);
            const tid = threadId || '';
            const replyActionLabel = depth > 0
                ? '回复'
                : (replyCount > 0 ? `回复(${replyCount})` : '回复');
            const replyActionMode = 'reply';
            const replyComposerHtml = isReplyComposerOpen ? `
                <div class="mag-reply-compose">
                    <textarea class="mag-compose-textarea" id="${replyInputId}" placeholder="写下你的回复…（可输入 @用户名 或 @角色名）" oninput="ForumUI.handleMentionInputPreview('${replyInputId}','${replyMentionHintId}','${tid}')"></textarea>
                    <div class="forum-mention-hint" id="${replyMentionHintId}"></div>
                    <div class="mag-compose-footer">
                        <div class="mag-anon-toggle" onclick="ForumUI.toggleInlineReplyAnon('${comment.id}')">
                            <div class="mag-anon-switch" id="${replyAnonSwitchId}"></div>
                            <span>匿名</span>
                        </div>
                        <div class="mag-compose-actions">
                            <button class="mag-compose-btn" onclick="ForumUI.closeInlineReplyComposer('${tid}')">取消</button>
                            <button class="mag-compose-btn primary" onclick="ForumUI.submitInlineReply('${comment.id}', '${tid}')">回复</button>
                        </div>
                    </div>
                </div>
            ` : '';

            const depthClass = depth > 0 ? ' forum-comment-child' : '';
            return `
                <div class="mag-comment-item${depthClass}${isHighlight ? ' highlight' : ''}" data-comment-id="${comment.id}">
                    <div class="mag-comment-left">
                        <div class="mag-comment-avatar">${avatarInner}</div>
                        <div class="mag-comment-thread-line"></div>
                    </div>
                    <div class="mag-comment-right">
                        <div class="mag-comment-head">
                            <span class="mag-comment-author">${authorHtml}</span>
                            <span class="mag-comment-time">${timeStr}</span>
                            ${canDelete ? `<button class="mag-comment-delete-btn" onclick="ForumUI.deleteComment('${comment.id}', '${tid}');event.stopPropagation()">删除</button>` : ''}
                        </div>
                        <div class="mag-comment-body">${contentHtml}</div>
                        <div class="mag-comment-footer">
                            <button class="mag-comment-action" onclick="ForumUI.openReplyComposer('${comment.id}', '${tid}', '${replyActionMode}')">${replyActionLabel}</button>
                            <button class="mag-comment-action" onclick="ForumUI.shareComment('${comment.id}', '${tid}')">转发</button>
                        </div>
                        ${replyComposerHtml}
                    </div>
                </div>
            `;
        },

        buildCommentTreeHtml(
            comments = [],
            deleteMap = new Map(),
            threadId = null,
            highlightCommentId = null,
            options = {}
        ) {
            if (!Array.isArray(comments) || comments.length === 0) {
                return '<div class="mag-empty">还没有评论，来说点什么吧。</div>';
            }
            const ROOT = '__root__';
            const topLevelSortBy = this.normalizeCommentSortBy(options.topLevelSortBy || 'oldest');
            const topLevelPageSize = Math.max(1, Number(options.topLevelPageSize) || 10);
            let topLevelPage = Math.max(1, Number(options.topLevelPage) || 1);
            const replyPageSize = Math.max(1, Number(options.replyPageSize) || 10);
            const expandedReplyIds = options.expandedReplyIds instanceof Set
                ? options.expandedReplyIds
                : new Set();
            const replyPageByParent = options.replyPageByParent instanceof Map
                ? options.replyPageByParent
                : new Map();
            const escapeJs = (value) => String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");

            const commentById = new Map();
            comments.forEach((comment) => {
                const key = String(comment?.id || '').trim();
                if (key) commentById.set(key, comment);
            });
            const childrenByParent = new Map();
            comments.forEach((comment) => {
                const key = String(comment?.id || '').trim();
                if (!key) return;
                const parentId = String(comment.parentId || '').trim();
                const parentKey = parentId && commentById.has(parentId) ? parentId : ROOT;
                if (!childrenByParent.has(parentKey)) childrenByParent.set(parentKey, []);
                childrenByParent.get(parentKey).push(comment);
            });
            const sortByCreatedAsc = (a, b) => new Date(a?.createdAt || 0) - new Date(b?.createdAt || 0);
            childrenByParent.forEach((list) => list.sort(sortByCreatedAsc));

            const resolveTopLevelId = (commentId) => {
                const targetId = String(commentId || '').trim();
                if (!targetId) return '';
                let currentId = targetId;
                const visited = new Set();
                while (currentId && !visited.has(currentId)) {
                    visited.add(currentId);
                    const current = commentById.get(currentId);
                    if (!current) return targetId;
                    const parentId = String(current.parentId || '').trim();
                    if (!parentId) return currentId;
                    if (!commentById.has(parentId)) return currentId;
                    currentId = parentId;
                }
                return targetId;
            };

            if (expandedReplyIds.size > 0) {
                const normalized = new Set();
                expandedReplyIds.forEach((id) => {
                    const topLevelId = resolveTopLevelId(id);
                    if (topLevelId) normalized.add(topLevelId);
                });
                expandedReplyIds.clear();
                normalized.forEach((id) => expandedReplyIds.add(id));
            }

            const descendantCountMemo = new Map();
            const countDescendants = (commentId) => {
                const key = String(commentId || '').trim();
                if (!key) return 0;
                if (descendantCountMemo.has(key)) {
                    return descendantCountMemo.get(key);
                }
                const children = childrenByParent.get(key) || [];
                let total = 0;
                children.forEach((child) => {
                    const childId = String(child?.id || '').trim();
                    if (!childId) return;
                    total += 1 + countDescendants(childId);
                });
                descendantCountMemo.set(key, total);
                return total;
            };

            const flattenDescendants = (topLevelCommentId) => {
                const output = [];
                const walk = (parentId) => {
                    const children = childrenByParent.get(parentId) || [];
                    children.forEach((child) => {
                        output.push(child);
                        const childId = String(child?.id || '').trim();
                        if (childId) walk(childId);
                    });
                };
                walk(String(topLevelCommentId || '').trim());
                output.sort(sortByCreatedAsc);
                return output;
            };

            const topLevelComments = (childrenByParent.get(ROOT) || []).slice();
            if (topLevelSortBy === 'newest') {
                topLevelComments.sort((a, b) => new Date(b?.createdAt || 0) - new Date(a?.createdAt || 0));
            } else if (topLevelSortBy === 'hot') {
                topLevelComments.sort((a, b) => {
                    const hotDiff = countDescendants(String(b?.id || '').trim()) - countDescendants(String(a?.id || '').trim());
                    if (hotDiff !== 0) return hotDiff;
                    return new Date(b?.createdAt || 0) - new Date(a?.createdAt || 0);
                });
            } else {
                topLevelComments.sort(sortByCreatedAsc);
            }

            const totalTopLevelPages = Math.max(1, Math.ceil(topLevelComments.length / topLevelPageSize));
            if (topLevelPage > totalTopLevelPages) topLevelPage = totalTopLevelPages;
            const topLevelOffset = (topLevelPage - 1) * topLevelPageSize;
            const visibleTopLevelComments = topLevelComments.slice(topLevelOffset, topLevelOffset + topLevelPageSize);

            const rootHtml = visibleTopLevelComments.map((comment) => {
                const key = String(comment?.id || '').trim();
                if (!key) return '';
                const canDelete = Boolean(deleteMap.get(comment.id));
                const itemHtml = this.buildCommentItem(comment, canDelete, threadId, highlightCommentId, 0, {
                    replyCount: countDescendants(key)
                });

                const expanded = expandedReplyIds.has(key);
                if (!expanded) return itemHtml;

                const descendants = flattenDescendants(key);
                const totalReplyPages = Math.max(1, Math.ceil(descendants.length / replyPageSize));
                let replyPage = Math.max(1, Number(replyPageByParent.get(key) || 1));
                if (replyPage > totalReplyPages) replyPage = totalReplyPages;
                replyPageByParent.set(key, replyPage);
                const replyOffset = (replyPage - 1) * replyPageSize;
                const visibleReplies = descendants.slice(replyOffset, replyOffset + replyPageSize);

                const childHtml = visibleReplies.map((child) => {
                    const childId = String(child?.id || '').trim();
                    const parentId = String(child?.parentId || '').trim();
                    const parent = parentId ? commentById.get(parentId) : null;
                    const childDelete = Boolean(deleteMap.get(child.id));
                    return this.buildCommentItem(child, childDelete, threadId, highlightCommentId, 1, {
                        replyCount: countDescendants(childId),
                        replyToName: parent ? this.resolveCommentAuthorName(parent) : ''
                    });
                }).join('');
                const childrenWrap = childHtml
                    ? `<div class="mag-comment-children">${childHtml}</div>`
                    : '';
                const replyPagerHtml = descendants.length > 0
                    ? this.buildPaginationHtml({
                        page: replyPage,
                        totalPages: totalReplyPages,
                        onPageTemplate: `ForumUI.goReplyPage('${escapeJs(key)}', __PAGE__, '${escapeJs(threadId || '')}')`
                    })
                    : '';
                return `${itemHtml}${childrenWrap}${replyPagerHtml}`;
            }).join('');

            const topLevelPagerHtml = topLevelComments.length > 0
                ? this.buildPaginationHtml({
                    page: topLevelPage,
                    totalPages: totalTopLevelPages,
                    onPageTemplate: `ForumUI.goThreadCommentPage(__PAGE__, '${escapeJs(threadId || '')}')`
                })
                : '';
            return `${rootHtml}${topLevelPagerHtml}`;
        },

        async seedDemoData() {
            // Check if we have the NEW sections (specifically 'sec_ent' which is unique to the new structure)
            const sections = await this.storage.listSections();
            const hasNewData = sections.some(s => s.id === 'sec_ent');

            if (sections.length > 0 && !hasNewData) {
                console.log('Detected obsolete forum data. Clearing for update...');
                if (this.storage && this.storage._store) {
                    this.storage._store.sections = [];
                    this.storage._store.channels = [];
                    this.storage._store.threads = [];
                    this.storage._store.comments = [];
                    this.storage._store.users.clear(); // Map clear
                    this.storage._store.chars.clear();
                    this.storage._store.identities.clear();
                }
            } else if (sections.length > 0) {
                return;
            }

            const userA = this.storage.insertUser({ id: 'user_demo_1', username: '星河旅人' });
            const userB = this.storage.insertUser({ id: 'user_demo_2', username: '霜夜' });

            const charA = this.storage.insertChar({ id: 'char_demo_1', realName: '示例角色甲', ownerUserId: userA.id });
            const charB = this.storage.insertChar({ id: 'char_demo_2', realName: '洛宁', ownerUserId: userA.id });
            const charC = this.storage.insertChar({ id: 'char_demo_3', realName: '示例角色丙', ownerUserId: userB.id });

            // 1. 综合讨论
            const secGeneral = this.storage.insertSection({ id: 'sec_general', name: '综合讨论' });
            // 2. 休闲娱乐
            const secEnt = this.storage.insertSection({ id: 'sec_ent', name: '休闲娱乐' });
            // 3. 生活·情感
            const secLife = this.storage.insertSection({ id: 'sec_life', name: '生活·情感' });
            // 4. 科技·数码
            const secTech = this.storage.insertSection({ id: 'sec_tech', name: '科技·数码' });

            // --- 频道 ---

            // 综合
            const ch_chat = this.storage.insertChannel({ id: 'ch_chat', name: '闲聊灌水', sectionId: secGeneral.id });
            const ch_hot = this.storage.insertChannel({ id: 'ch_hot', name: '今日热点', sectionId: secGeneral.id });
            const ch_rant = this.storage.insertChannel({ id: 'ch_rant', name: '吐槽大会', sectionId: secGeneral.id });
            const ch_court = this.storage.insertChannel({ id: 'ch_court', name: '小法庭', sectionId: secGeneral.id });

            // 娱乐
            const ch_game = this.storage.insertChannel({ id: 'ch_game', name: '游戏·电竞', sectionId: secEnt.id });
            const ch_media = this.storage.insertChannel({ id: 'ch_media', name: '影视·剧综', sectionId: secEnt.id });
            const ch_music = this.storage.insertChannel({ id: 'ch_music', name: '音乐·现场', sectionId: secEnt.id });
            const ch_acg = this.storage.insertChannel({ id: 'ch_acg', name: '二次元', sectionId: secEnt.id });

            // 生活
            const ch_emotion = this.storage.insertChannel({ id: 'ch_emotion', name: '情感夜话', sectionId: secLife.id });
            const ch_daily = this.storage.insertChannel({ id: 'ch_daily', name: '日常生活', sectionId: secLife.id });
            const ch_food = this.storage.insertChannel({ id: 'ch_food', name: '美食·旅行', sectionId: secLife.id });
            const ch_pet = this.storage.insertChannel({ id: 'ch_pet', name: '萌宠天地', sectionId: secLife.id });
            const ch_nsfw = this.storage.insertChannel({ id: 'ch_nsfw', name: '私密话题', sectionId: secLife.id }); // NSFW/Private

            // 科技
            const ch_digital = this.storage.insertChannel({ id: 'ch_digital', name: '数码产品', sectionId: secTech.id });
            const ch_soft = this.storage.insertChannel({ id: 'ch_soft', name: '软件·应用', sectionId: secTech.id });

            const identityCharA = await this.storage.getForumIdentity('char', charA.id);
            const identityCharB = await this.storage.getForumIdentity('char', charB.id);
            const identityCharC = await this.storage.getForumIdentity('char', charC.id);
            const identityUserB = await this.storage.getForumIdentity('user', userB.id);

            // --- 示例帖子 ---

            // 1. 新人报道 (闲聊)
            const t1 = await this.storage.createThread({
                title: '萌新报到，请多关照～',
                content: '刚发现这个论坛，感觉氛围不错。大家平时都聊些什么呀？求安利好玩的版块！',
                tags: ['新人', '求安利'],
                sectionId: secGeneral.id,
                channelId: ch_chat.id,
                authorIdentity: identityCharA,
                metrics: { like: 12, commentCount: 4, share: 1, collect: 0, heat: 40 }
            });

            // 2. 游戏讨论 (游戏)
            const t2 = await this.storage.createThread({
                title: '最近那个很火的游戏有人玩了吗？来说说体验？',
                content: '我看评分两极分化很严重，有点犹豫要不要入手。画风是很戳我，但听说优化很烂？',
                tags: ['游戏', '测评'],
                sectionId: secEnt.id,
                channelId: ch_game.id,
                authorIdentity: identityCharC,
                metrics: { like: 8, commentCount: 15, share: 2, collect: 1, heat: 65 }
            });

            // 3. 生活吐槽 (槽点) -> 对应“broken toe”类型的“生活中的倒霉事”
            const t3 = await this.storage.createThread({
                title: '不仅脚趾骨折了，还赶上楼上装修，这是什么人间疾苦',
                content: '躺在床上动弹不得，还得忍受电钻的声音在脑子里开party。戴降噪耳机都挡不住那个震动感，感觉骨头都在跟着共振...在线求安慰TAT',
                tags: ['吐槽', '倒霉', '求安慰'],
                sectionId: secGeneral.id,
                channelId: ch_rant.id,
                authorIdentity: identityCharB,
                metrics: { like: 32, commentCount: 20, share: 0, collect: 0, heat: 90 }
            });

            // 4. 数码求助 (科技)
            const t4 = await this.storage.createThread({
                title: '求推荐一款适合长时间码字的键盘',
                content: '手里的薄膜键盘已经这几天有点不太灵了，想换个机械的。预算500左右，主要得静音（不想吵到室友），有什么好的推荐吗？',
                tags: ['求助', '外设'],
                sectionId: secTech.id,
                channelId: ch_digital.id,
                authorIdentity: identityUserB,
                metrics: { like: 5, commentCount: 8, share: 0, collect: 2, heat: 25 }
            });

            // 5. 情感 (情感)
            const t5 = await this.storage.createThread({
                title: '深夜emo，现在的关系维持起来好累',
                content: '有时候觉得是不是自己想太多了，但对方那种忽冷忽热的态度真的让人很内耗。',
                tags: ['情感', '树洞'],
                sectionId: secLife.id,
                channelId: ch_emotion.id,
                authorIdentity: identityCharA,
                metrics: { like: 18, commentCount: 12, share: 0, collect: 1, heat: 55 }
            });

            // 评论
            await this.storage.createComment({
                threadId: t1.id,
                authorIdentity: identityUserB,
                content: '欢迎新人！可以去游戏区看看，那边最近很热闹。'
            });

            await this.storage.createComment({
                threadId: t3.id,
                authorIdentity: identityCharA,
                content: '太惨了...摸摸。我也经历过楼上装修，建议买个工业级耳罩，叠加降噪耳机那种。'
            });

            await this.storage.createComment({
                threadId: t3.id,
                authorIdentity: identityCharC,
                content: '骨折了就好好休息，少看手机（虽然我知道这不可能哈哈）。祝早日康复！'
            });

            ForumLink.state.currentUserId = userA.id;
            this.state.userId = userA.id;
            this.state.charId = charA.id;
            this.state.sectionId = secGeneral.id;
            this.state.channelId = ch_chat.id;
            this.state.threadId = t1.id;
        }
    };

    // 暴露给全局以便 HTML onclick 调用
    window.ForumUI = ForumUI;

    document.addEventListener('DOMContentLoaded', () => {
        ForumUI.init();
    });
})();
