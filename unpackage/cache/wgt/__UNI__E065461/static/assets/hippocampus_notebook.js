/**
 * 初始化海马体记事本模块导出壳子。
 * 兼容浏览器全局和 CommonJS 两种加载方式。
 */
(function initHippocampusNotebookModule(root) {
    const api = createHippocampusNotebook(root);

    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }

    if (root && typeof root === 'object') {
        root.HippocampusNotebook = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this));

/**
 * 创建海马体记事本模块。
 * 这里封装记事本拉取、Prompt 构建、写入接口与脱水回写逻辑。
 */
function createHippocampusNotebook(root) {
    const MODULE_NAME = '\u8bb0\u4e8b\u672c';
    const NOTEBOOK_LEARNING_STORAGE_KEY_PREFIX = 'idic_hippocampus_notebook_learning_v1';
    const NOTEBOOK_LEARNING_VERSION = 1;
    const NOTEBOOK_COMPACTION_TRIGGER_THRESHOLD = 10; // 来自整理归档任务文档：未整理 profile+mustRemember >= 10 触发。
    const NOTEBOOK_COMPACTION_DEFAULT_MAX_TOKENS = 200000;
    const NOTEBOOK_COMPACTION_DEFAULT_TEMPERATURE = 0.2;
    const NOTEBOOK_PROMPT_TARGET_CHARS = 1000;
    const NOTEBOOK_STABLE_MIN_BUDGET = 360;
    const NOTEBOOK_PROMPT_SOFT_OVERFLOW_CHARS = 260;
    const NOTEBOOK_COMPACTED_GROUP_LIMIT = 6;
    const NOTEBOOK_COMPACTED_ITEMS_PER_GROUP_LIMIT = 3;
    const NOTEBOOK_UNCOMPACTED_MUST_LIMIT = 5;
    const NOTEBOOK_UNCOMPACTED_PROFILE_LIMIT = 8;

    const PROFILE_CATEGORIES = new Set(['preference', 'habit', 'identity', 'other']);
    const DEPRECATED_PROFILE_CATEGORIES = new Set(['relationship']);
    const PROFILE_CONFIDENCE = new Set(['stated', 'inferred', 'uncertain']);
    const MUST_REMEMBER_CATEGORIES = new Set(['fact', 'health', 'relationship', 'promise', 'trigger', 'other']);
    const REDLINE_SEVERITIES = new Set(['critical', 'important', 'reminder']);
    const NOTEBOOK_GAME_DETAIL_RE = /(游戏|关卡|boss|b[o0]ss|副本|任务|剧情|地点|地图|机制|攻略|属性|阵容|配队|等级|装备|技能|掉落|奖杯|成就|dlc|关底|build|loadout|quest|level|gear)/i;
    const NOTEBOOK_GAME_PREFERENCE_RE = /(喜欢|讨厌|不喜欢|更喜欢|偏好|倾向|优先|追求|习惯|擅长).*(开放世界|自由探索|休闲|互动|练级|主线|效率|现成|探索)|(?:开放世界|自由探索|休闲|互动|练级|主线|效率|现成|探索).*(喜欢|讨厌|不喜欢|更喜欢|偏好|倾向|优先|追求|习惯|擅长)/;
    const NOTEBOOK_SHIPPING_RE = /(快递|到货|送达|下单|发货)/;
    const NOTEBOOK_LOW_VALUE_SENSORY_RE = /(香水|味道|香味|体香|照片|语音|perfume|smell|scent|photo|voice)/i;
    const NOTEBOOK_SELF_FLAVOR_RE = /(人设|设定|自称|自诩|唯一|完美|全能|专家|最懂|永远|persona)/i;
    const NOTEBOOK_STATUS_ACTIONABLE_RE = /(失眠|熬夜|睡眠.*不足|没睡|疼|痛|酸痛|发烧|感冒|经期|分泌物|瘙痒|难受|买药|焦虑|内耗|崩溃|自我怀疑|休息|受伤|伤口|伤处|骨折|康复|恢复|加班|考试|截止|ddl|吵架|冷战|危险|手腕|刀|自残|自杀|住院|复诊|deadline|pressure|insomnia|sleep|pain|fever|cold|period|itch|anxiety|burnout|fight|argument|injury|recover|hospital|exam|overtime)/i;
    const NOTEBOOK_LOGISTICS_RE = /(搬家|出差|旅行|面试|上线|项目|考试周|截止|move|travel|trip|interview|launch|project)/i;
    const NOTEBOOK_FLIRT_OR_AROUSAL_RE = /(挑逗|暧昧|露骨|亲密细节|性反应|兴奋|自慰|前任|第一次|盘问|吃醋)/i;
    const NOTEBOOK_USER_FOCUS_RE = /(用户|对方|ta|TA|他|她|对我|给我|帮我|叫我|喊我|和我|把我|让我|\bshe\b|\bhe\b|\bthey\b|\bthem\b|\bher\b|\bhim\b|\buser\b|called me|for me|to me)/i;
    const NOTEBOOK_SELF_LEAD_RE = /^(我|自己|本人|i\b)/i;
    const NOTEBOOK_CHAR_LEAD_RE = /^(我|自己|本人|角色|char\b|assistant\b|bot\b|ai\b)/i;
    const NOTEBOOK_RELATIONSHIP_FROM_USER_RE = /((用户|对方|ta|TA|他|她).*(叫我|喊我|称呼我|安抚我|给我|要求我|替我|帮我)|she calls me|he calls me|they call me|she started calling me|he started calling me|they started calling me|made me|bought me|asked me)/i;
    const NOTEBOOK_RELATIONSHIP_ADDRESS_RE = /(叫我|喊我|称呼我|管我叫|改口叫我|叫用户|喊用户|称呼用户|管用户叫|叫对方|喊对方|称呼对方|管对方叫|叫ta|喊ta|称呼ta|管ta叫|叫TA|喊TA|称呼TA|管TA叫|叫他|喊他|称呼他|管他叫|叫她|喊她|称呼她|管她叫|我叫用户|我称用户|我会叫用户|我叫对方|我称对方|我会叫对方|我叫ta|我称ta|我会叫ta|我叫TA|我称TA|我会叫TA|我叫他|我称他|我会叫他|我叫她|我称她|我会叫她|被我称为|被我称呼为|call me|calls me|call user|calls user|call them|calls them|call her|calls her|call him|calls him)/i;
    const NOTEBOOK_RELATIONSHIP_PROFILE_RE = /(关系称呼|关系标签|关系定位|关系站位|亲昵称呼|固定称呼|主导地位|权力关系|精神支柱|情感支柱|占有欲|归属关系|exclusive bond|relationship label|relationship role)/i;
    const NOTEBOOK_REACTION_TRIGGER_RE = /(让我|令我|使我|把我|我会|我就会|我容易|我瞬间|我立刻|我总会|我一下就)/i;
    const NOTEBOOK_REACTION_OUTCOME_RE = /(紧张|慌|难受|破防|吃醋|兴奋|上头|委屈|感动|生气|受伤|害怕|不安|安心|开心|失控)/i;
    const NOTEBOOK_MAJOR_TRIGGER_RE = /(绝对不能|绝对不可以|不要再|别再|不能再|以后别忘|必须记住|必须一直记得|导火索|大吵|争执|冲突|敏感|底线|红线|危险信号|承诺|答应|欠(?:用户|对方|ta|TA|他|她)?|还(?:给)?(?:用户|对方|ta|TA|他|她)?|还钱|买.*(东西|礼物|商品|服务|设备|课程|游戏|订单)|自残|刀|手腕|很重要|重要|do not|don't|never|must remember|do not forget|don't forget|important|matters a lot|promise|owe|debt|trigger|knife|wrist|self-harm|conflict|argument)/i;
    const NOTEBOOK_PROMISE_DEBT_RE = /(((礼物|东西|商品|服务|课程|订单|定金|设备|钱|费用|开销|账单|款项|payment|order|gift|item|goods|service|deposit|money|cost|fee|bill).*(欠(?:用户|对方|ta|TA|他|她)?|还(?:给)?(?:用户|对方|ta|TA|他|她)?|还钱|补上|垫付|先垫|报销|偿还|还账|owe|debt|buy|repay|reimburse))|((欠(?:用户|对方|ta|TA|他|她)?|还(?:给)?(?:用户|对方|ta|TA|他|她)?|还钱|补上|垫付|先垫|报销|偿还|还账|owe|debt|buy|repay|reimburse).*(礼物|东西|商品|服务|课程|订单|定金|设备|钱|费用|开销|账单|款项|payment|order|gift|item|goods|service|deposit|money|cost|fee|bill))|((算我欠(?:用户|对方|ta|TA|他|她)?的|还欠着|先垫的钱|垫的钱).*(补上|报销|偿还|repay|reimburse)?)|((补上|报销|偿还|repay|reimburse).*(算我欠(?:用户|对方|ta|TA|他|她)?的|还欠着|先垫的钱|垫的钱)))/i;
    const NOTEBOOK_DATED_CONFLICT_RE = /((\d{1,2}\u6708\d{1,2}\u65e5|\d{1,2}\/\d{1,2}|[12]\d{3}[-/]\d{1,2}[-/]\d{1,2}).*(\u5435\u67b6|\u4e89\u6267|\u51b2\u7a81|\u5bfc\u706b\u7d22|fight|argument|conflict|trigger)|(\u5435\u67b6|\u4e89\u6267|\u51b2\u7a81|\u5bfc\u706b\u7d22|fight|argument|conflict|trigger).*(\d{1,2}\u6708\d{1,2}\u65e5|\d{1,2}\/\d{1,2}|[12]\d{3}[-/]\d{1,2}[-/]\d{1,2}))/i;
    const NOTEBOOK_STABLE_PROFILE_RE = /(\u559c\u6b22|\u4e0d\u559c\u6b22|\u8ba8\u538c|\u504f\u597d|\u503e\u5411|\u4e60\u60ef|\u7ecf\u5e38|\u603b\u662f|\u901a\u5e38|\u5bb9\u6613|\u5f88\u5728\u610f|\u654f\u611f|\u4f1a\u7528|\u4f1a\u628a|\u4f1a\u53eb|\u5e38\u5e38|\u5bf9.*\u654f\u611f)/i;
    const NOTEBOOK_EXPLICIT_PREFERENCE_RE = /(喜欢|很喜欢|非常喜欢|爱吃|爱看|爱玩|爱听|爱喝|想要|钟爱|偏好|更喜欢|讨厌|反感|不喜欢|不爱|不吃|不喝|不能吃|不能喝|别放|prefers?|likes?|loves?|dislikes?|hates?|favorite|favourite)/i;
    const NOTEBOOK_VALUE_OR_PERSONALITY_RE = /(价值观|消费观|金钱观|边界|人格|尊重|独立|敏感|脆弱|内耗|面子|孝道|压力|焦虑|关系|掌控|主导|情绪|安全感|创伤|values?|boundar|personality|respect|independ|sensitive|anxiety|pressure|relationship|trauma)/i;
    const NOTEBOOK_STABLE_HABIT_WORD_RE = /(习惯|经常|总是|通常|常常|长期|固定|稳定|倾向|会在|会用|会把|容易|擅长|不擅长|habit|usually|often|tends? to)/i;
    const NOTEBOOK_ONE_OFF_EVENT_RE = /(\u6628\u5929|\u4eca\u5929|\u521a\u521a|\u521a\u624d|\u90a3\u6b21|\u8fd9\u6b21|\u5f53\u65f6|\u540e\u6765|\u7a81\u7136|\u4e00\u65f6|\u4e00\u6b21|\u4e00\u56de|\u521a\u4e70|\u521a\u5230|\u90a3\u5929|\u7247\u523b)/i;
    const NOTEBOOK_BOUNDARY_RE = /(\u7edd\u5bf9\u4e0d\u80fd|\u7edd\u5bf9\u4e0d\u53ef\u4ee5|\u4e0d\u8981\u518d|\u522b\u518d|\u4e0d\u80fd\u518d|\u4e0d\u8981|\u7981\u6b62|\u5e95\u7ebf|\u7ea2\u7ebf|\u8fb9\u754c|\u754c\u9650|\u96f7\u533a)/i;
    const NOTEBOOK_IMPORTANCE_RE = /(\u5fc5\u987b\u8bb0\u4f4f|\u5fc5\u987b\u4e00\u76f4\u8bb0\u5f97|\u522b\u5fd8|\u4ee5\u540e\u522b\u5fd8|\u5f88\u91cd\u8981|\u91cd\u8981|\u5bfc\u706b\u7d22|\u627f\u8bfa|\u7b54\u5e94|\u6b20|\u8fd8)/i;
    const NOTEBOOK_SAFETY_RE = /(危险|自残|自杀|手腕|刀|住院|复诊|崩溃|伤害自己|self-harm|suicide|knife|wrist)/i;
    const NOTEBOOK_MAJOR_PROMISE_RE = /(结婚|同居|搬家|买房|房子|养(?:用户|对方|ta|TA|他|她)|供养|工资|工资卡|银行卡|账号密码|密码|社交账号|公开身份|官宣|生育|避孕|怀孕|医疗|手术|住院|复诊|治疗|债务|网贷|还钱|还款|欠款|还清|报销|垫付|跨次元|现实见面|线下见面|见面计划|见面安排|奔现|去见(?:用户|对方|ta|TA|他|她)|来见(?:用户|对方|ta|TA|他|她)|一辈子|永远不|绝不|绝对不|分手|自残|自杀|伤害自己|安全|底线|红线|法律|报警|隐私|证件|身份信息|deposit|debt|loan|repay|reimburse|account|password|marry|marriage|house|medical|surgery|privacy|legal)/i;
    const NOTEBOOK_TRIVIAL_PROMISE_RE = /(下次|明天|今晚|等下|一会|回头|改天|见面时|到时候|陪(?:用户|对方|ta|TA|他|她)?(?:聊|玩|看|打|睡|吃|逛|挑|选)|连麦|打电话|视频|亲|抱|摸|哄|夸|发照片|自拍|写小作文|检讨|游戏|剧本|扮演|调情|惩罚|收拾|喂|吃掉|弄|头发|衣服|外卖|零食|奶茶|普通礼物|小礼物|玩具|普通设备|日常|routine|tonight|tomorrow|later|call|video|game|roleplay)/i;
    const NOTEBOOK_GENERIC_CARE_PROMISE_RE = /(我)?(答应|承诺|保证|发誓).{0,18}(陪|哄|宠|爱|照顾|保护|养|听话|乖|不睡|等|帮|配合)/i;
    const NOTEBOOK_ACTIONABLE_HABIT_RE = /(熬夜|通宵|作息|睡觉|休息|吃饭|饮食|喝水|咖啡因|买药|硬扛|拖着不睡|不肯休息|不舒服也不说|请假|复诊|工作到很晚|深夜)/i;
    const NOTEBOOK_TRANSIENT_STATUS_RE = /(突然|一下|一阵|一会|片刻|短暂|刚刚|刚才|很快就好|后来就好了|一会就好了|有点|一点|稍微)/i;
    const NOTEBOOK_HYPOTHETICAL_RE = /(如果|要是|假如|万一|若是|不然|否则|可能|也许|或许|说不定|大概|maybe|might|could|would|if\b)/i;
    const NOTEBOOK_JOKE_OR_QUOTE_RE = /(段子|玩笑|开玩笑|说着玩|随口一说|举例|比如|假设|口嗨|整活|梗|copypasta|meme|joke|just kidding|quoted|quote)/i;
    const NOTEBOOK_FUTURE_PLAN_RE = /(想去|想要|打算|准备|计划|考虑|等.*(以后|之后|再)|明天|改天|下周|下个月|到时候|回头)/i;
    const NOTEBOOK_CURRENT_EVIDENCE_RE = /(正在|最近|目前|现在|这两天|这几天|这周|还在|已经|又在|刚刚|刚才|处于|陷入|恢复中|持续|一直|开始|没睡|睡眠不足|不舒服|疼|痛|发烧|焦虑|内耗|崩溃|currently|recently|still|ongoing)/i;
    const NOTEBOOK_ROLEPLAY_RE = /(角色扮演|扮演|剧本|设定|主导|臣服|调教|dom\b|sub\b|roleplay|主人|玩具|金主)/i;
    const NOTEBOOK_RELATIONSHIP_NEGATIVE_RE = /(不喜欢被叫|反感被叫|讨厌被叫|别再叫|不要再叫|不能叫|禁止叫|不爱听你叫|不想被叫|(不喜欢|反感|讨厌).{0,8}(叫她|叫他|叫用户|叫对方|叫ta|叫TA|叫我))/i;
    const NOTEBOOK_THIRD_PARTY_RE = /(同学|朋友|室友|同事|亲戚|家人|别人|对方|某人|有人|他人|老师|前任|前男友|前女友|classmate|friend|roommate|coworker|someone|another person|ex\b)/i;
    const NOTEBOOK_USER_SELF_ANCHOR_RE = /(用户|她|他|ta|TA|本人|自己|我的|我自己|我本人|I\b|me\b|my\b|用户本人|她本人|他本人|ta本人|TA本人)/i;
    const NOTEBOOK_USER_STRONG_SELF_ANCHOR_RE = /(本人|自己|我的|我自己|我本人|用户本人|她本人|他本人|ta本人|TA本人|明确说自己|亲口说自己|确认自己|明确表示自己|I\b|me\b|my\b)/i;
    const NOTEBOOK_IDENTITY_CLAIM_RE = /(名字|全名|姓名|真名|年龄|生日|身高|体重|学历|专业|学校|大学|中学|高中|初中|小学|本科|研究生|工作|职业|行业|考试|升学|证件|住址|地址|家乡|城市|病史|创伤|经历|路线|方向|身份|伴侣身份|女友|男友|老婆|老公|学.*的|从事|就读|毕业|name|age|birthday|height|weight|school|college|university|major|job|career|identity|address)/i;
    const NOTEBOOK_HIGH_RISK_IDENTITY_RE = /(学历|专业|学校|大学|中学|高中|初中|小学|本科|研究生|工作|职业|行业|考试|升学|病史|创伤|经历|路线|方向|学.*的|从事|就读|毕业|school|college|university|major|job|career)/i;
    const NOTEBOOK_WEAK_PROFILE_RE = /(很喜欢|非常喜欢|喜欢玩|喜欢看|爱看|爱玩|感兴趣|有兴趣|考虑过|想过|可能会|比较喜欢).{0,24}$/i;
    const NOTEBOOK_TOPLEVEL_PLAY_RE = /((正在|最近|目前|现在|这两天|这几天|这周|还在).{0,6})?(在玩|玩着|玩的是|游玩)/i;
    const NOTEBOOK_TOPLEVEL_WATCH_RE = /((正在|最近|目前|现在|这两天|这几天|这周|还在).{0,6})?(在看|看着|追剧|追番)/i;
    const NOTEBOOK_TOPLEVEL_READ_RE = /((正在|最近|目前|现在|这两天|这几天|这周|还在).{0,6})?(在读|读着|阅读)/i;
    const NOTEBOOK_TOPLEVEL_LISTEN_RE = /((正在|最近|目前|现在|这两天|这几天|这周|还在).{0,6})?(在听|听着|单曲循环)/i;
    const console = createHippoScopedConsole(root, MODULE_NAME);

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
            }
        };
    }

    /**
     * 将任意值转换为去首尾空白的字符串。
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
     * 判断对象是否为普通对象。
     */
    function isPlainObject(value) {
        return !!value && typeof value === 'object' && !Array.isArray(value);
    }

    /**
     * 读取海马体 bridge。
     */
    function getBridge() {
        if (!root || typeof root !== 'object') return null;
        return root.IDIC_HippocampusBridge || null;
    }

    /**
     * 读取可用的 Supabase 客户端。
     */
    function resolveSupabaseClient(explicitSupabase) {
        if (explicitSupabase && typeof explicitSupabase.rpc === 'function') {
            return explicitSupabase;
        }

        const bridge = getBridge();
        if (bridge && typeof bridge.getSupabaseClient === 'function') {
            try {
                const resolved = bridge.getSupabaseClient();
                if (resolved && typeof resolved.rpc === 'function') {
                    return resolved;
                }
            } catch (_) {
                return null;
            }
        }

        return null;
    }

    /**
     * 生成空的记事本结构，避免上层到处判空。
     */
    function createEmptyNotebook() {
        return {
            profiles: [],
            mustRemember: [],
            redlines: [],
            compacted: null
        };
    }

    function resolveNotebookLearningStorage() {
        if (root && root.localStorage) return root.localStorage;
        if (typeof globalThis !== 'undefined' && globalThis.localStorage) return globalThis.localStorage;
        return null;
    }

    function resolveNotebookLearningUserId(explicitUserId) {
        const safeUserId = toTrimmedString(explicitUserId);
        if (safeUserId) return safeUserId;

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

    function buildNotebookLearningStorageKey(userId, charId) {
        const safeUserId = toTrimmedString(userId) || 'anonymous';
        const safeCharId = toTrimmedString(charId) || 'unknown';
        return `${NOTEBOOK_LEARNING_STORAGE_KEY_PREFIX}:${safeUserId}:${safeCharId}`;
    }

    function createEmptyNotebookLearningBucket() {
        return {
            negativeCount: 0,
            positiveCount: 0,
            deleteCount: 0,
            batchDeleteCount: 0,
            editCount: 0,
            manualAddCount: 0,
            confirmCount: 0,
            categories: {},
            tags: {},
            semanticKeys: {},
            negativeCategories: {},
            positiveCategories: {},
            negativeTags: {},
            positiveTags: {},
            negativeSemanticKeys: {},
            positiveSemanticKeys: {}
        };
    }

    function createEmptyNotebookLearningProfile(userId, charId) {
        const now = new Date().toISOString();
        return {
            version: NOTEBOOK_LEARNING_VERSION,
            userId: toTrimmedString(userId),
            charId: toTrimmedString(charId),
            createdAt: now,
            updatedAt: now,
            totals: {
                feedbackCount: 0,
                negativeCount: 0,
                positiveCount: 0,
                deleteCount: 0,
                batchDeleteCount: 0,
                editCount: 0,
                manualAddCount: 0,
                confirmCount: 0
            },
            byKind: {
                profile: createEmptyNotebookLearningBucket(),
                mustRemember: createEmptyNotebookLearningBucket(),
                redline: createEmptyNotebookLearningBucket()
            }
        };
    }

    function normalizeNotebookCounterMap(value) {
        const source = isPlainObject(value) ? value : {};
        const result = {};
        Object.keys(source).forEach(function mapCounter(key) {
            const safeKey = toTrimmedString(key);
            if (!safeKey) return;
            const numeric = Math.max(0, Math.floor(toFiniteNumber(source[key], 0)));
            if (numeric > 0) {
                result[safeKey] = numeric;
            }
        });
        return result;
    }

    function sumNotebookCounterMap(value) {
        const source = isPlainObject(value) ? value : {};
        return Object.keys(source).reduce(function sum(total, key) {
            return total + Math.max(0, Math.floor(toFiniteNumber(source[key], 0)));
        }, 0);
    }

    function getNotebookCounterValue(value, key) {
        const source = isPlainObject(value) ? value : {};
        return Math.max(0, Math.floor(toFiniteNumber(source[toTrimmedString(key)], 0)));
    }

    function getNotebookLearningTagBias(bucket, tag) {
        const safeBucket = isPlainObject(bucket) ? bucket : {};
        const safeTag = toTrimmedString(tag);
        if (!safeTag) return 0;
        const negative = Math.max(
            getNotebookCounterValue(safeBucket.negativeTags, safeTag),
            getNotebookCounterValue(safeBucket.tags, safeTag)
        );
        const positive = getNotebookCounterValue(safeBucket.positiveTags, safeTag);
        return negative - positive;
    }

    function getNotebookLearningCategoryBias(bucket, category) {
        const safeBucket = isPlainObject(bucket) ? bucket : {};
        const safeCategory = toTrimmedString(category);
        if (!safeCategory) return 0;
        const negative = getNotebookCounterValue(safeBucket.negativeCategories, safeCategory);
        const positive = getNotebookCounterValue(safeBucket.positiveCategories, safeCategory);
        return negative - positive;
    }

    function getNotebookLearningSemanticBias(bucket, semanticKey) {
        const safeBucket = isPlainObject(bucket) ? bucket : {};
        const safeKey = toTrimmedString(semanticKey);
        if (!safeKey) return 0;
        const negative = Math.max(
            getNotebookCounterValue(safeBucket.negativeSemanticKeys, safeKey),
            getNotebookCounterValue(safeBucket.semanticKeys, safeKey)
        );
        const positive = getNotebookCounterValue(safeBucket.positiveSemanticKeys, safeKey);
        return negative - positive;
    }

    function normalizeNotebookLearningBucket(bucket) {
        const source = isPlainObject(bucket) ? bucket : {};
        return {
            negativeCount: Math.max(0, Math.floor(toFiniteNumber(source.negativeCount, 0))),
            positiveCount: Math.max(0, Math.floor(toFiniteNumber(source.positiveCount, 0))),
            deleteCount: Math.max(0, Math.floor(toFiniteNumber(source.deleteCount, 0))),
            batchDeleteCount: Math.max(0, Math.floor(toFiniteNumber(source.batchDeleteCount, 0))),
            editCount: Math.max(0, Math.floor(toFiniteNumber(source.editCount, 0))),
            manualAddCount: Math.max(0, Math.floor(toFiniteNumber(source.manualAddCount, 0))),
            confirmCount: Math.max(0, Math.floor(toFiniteNumber(source.confirmCount, 0))),
            categories: normalizeNotebookCounterMap(source.categories),
            tags: normalizeNotebookCounterMap(source.tags),
            semanticKeys: normalizeNotebookCounterMap(source.semanticKeys || source.semantic_keys),
            negativeCategories: normalizeNotebookCounterMap(source.negativeCategories || source.negative_categories),
            positiveCategories: normalizeNotebookCounterMap(source.positiveCategories || source.positive_categories),
            negativeTags: normalizeNotebookCounterMap(source.negativeTags || source.negative_tags),
            positiveTags: normalizeNotebookCounterMap(source.positiveTags || source.positive_tags),
            negativeSemanticKeys: normalizeNotebookCounterMap(source.negativeSemanticKeys || source.negative_semantic_keys),
            positiveSemanticKeys: normalizeNotebookCounterMap(source.positiveSemanticKeys || source.positive_semantic_keys)
        };
    }

    function normalizeNotebookLearningKind(kind) {
        const value = toTrimmedString(kind).toLowerCase();
        if (value === 'profile' || value === 'profiles') return 'profile';
        if (value === 'mustremember' || value === 'must_remember' || value === 'must-remember' || value === 'must') return 'mustRemember';
        if (value === 'redline' || value === 'redlines') return 'redline';
        return '';
    }

    function normalizeNotebookLearningAction(action) {
        const value = toTrimmedString(action).toLowerCase();
        if (value === 'delete') return 'delete';
        if (value === 'batch_delete' || value === 'batch-delete' || value === 'batchdelete') return 'batch_delete';
        if (value === 'manual_add' || value === 'manual-add' || value === 'create' || value === 'add') return 'manual_add';
        if (value === 'manual_edit' || value === 'manual-edit' || value === 'edit' || value === 'update') return 'manual_edit';
        if (value === 'confirm') return 'confirm';
        return '';
    }

    function normalizeNotebookLearningProfile(value, userId, charId) {
        const base = createEmptyNotebookLearningProfile(userId, charId);
        const source = isPlainObject(value) ? value : {};
        const byKind = isPlainObject(source.byKind) ? source.byKind : {};
        const profile = {
            version: NOTEBOOK_LEARNING_VERSION,
            userId: toTrimmedString(source.userId) || toTrimmedString(userId),
            charId: toTrimmedString(source.charId) || toTrimmedString(charId),
            createdAt: toTrimmedString(source.createdAt || source.created_at) || base.createdAt,
            updatedAt: toTrimmedString(source.updatedAt || source.updated_at) || base.updatedAt,
            totals: Object.assign({}, base.totals, isPlainObject(source.totals) ? source.totals : {}),
            byKind: {
                profile: normalizeNotebookLearningBucket(byKind.profile),
                mustRemember: normalizeNotebookLearningBucket(byKind.mustRemember || byKind.must),
                redline: normalizeNotebookLearningBucket(byKind.redline)
            }
        };

        profile.totals.feedbackCount = Math.max(
            0,
            Math.floor(
                toFiniteNumber(
                    profile.totals.feedbackCount,
                    profile.byKind.profile.negativeCount
                    + profile.byKind.profile.positiveCount
                    + profile.byKind.mustRemember.negativeCount
                    + profile.byKind.mustRemember.positiveCount
                    + profile.byKind.redline.negativeCount
                    + profile.byKind.redline.positiveCount
                )
            )
        );
        profile.totals.negativeCount = Math.max(
            0,
            Math.floor(
                toFiniteNumber(
                    profile.totals.negativeCount,
                    profile.byKind.profile.negativeCount
                    + profile.byKind.mustRemember.negativeCount
                    + profile.byKind.redline.negativeCount
                )
            )
        );
        profile.totals.positiveCount = Math.max(
            0,
            Math.floor(
                toFiniteNumber(
                    profile.totals.positiveCount,
                    profile.byKind.profile.positiveCount
                    + profile.byKind.mustRemember.positiveCount
                    + profile.byKind.redline.positiveCount
                )
            )
        );
        profile.totals.deleteCount = Math.max(
            0,
            Math.floor(
                toFiniteNumber(
                    profile.totals.deleteCount,
                    profile.byKind.profile.deleteCount
                    + profile.byKind.mustRemember.deleteCount
                    + profile.byKind.redline.deleteCount
                )
            )
        );
        profile.totals.batchDeleteCount = Math.max(
            0,
            Math.floor(
                toFiniteNumber(
                    profile.totals.batchDeleteCount,
                    profile.byKind.profile.batchDeleteCount
                    + profile.byKind.mustRemember.batchDeleteCount
                    + profile.byKind.redline.batchDeleteCount
                )
            )
        );
        profile.totals.editCount = Math.max(
            0,
            Math.floor(
                toFiniteNumber(
                    profile.totals.editCount,
                    profile.byKind.profile.editCount
                    + profile.byKind.mustRemember.editCount
                    + profile.byKind.redline.editCount
                )
            )
        );
        profile.totals.manualAddCount = Math.max(
            0,
            Math.floor(
                toFiniteNumber(
                    profile.totals.manualAddCount,
                    profile.byKind.profile.manualAddCount
                    + profile.byKind.mustRemember.manualAddCount
                    + profile.byKind.redline.manualAddCount
                )
            )
        );
        profile.totals.confirmCount = Math.max(
            0,
            Math.floor(
                toFiniteNumber(
                    profile.totals.confirmCount,
                    profile.byKind.profile.confirmCount
                    + profile.byKind.mustRemember.confirmCount
                    + profile.byKind.redline.confirmCount
                )
            )
        );
        return profile;
    }

    function buildNotebookLearningStoragePayload(profile) {
        const normalized = normalizeNotebookLearningProfile(profile);
        return {
            version: NOTEBOOK_LEARNING_VERSION,
            userId: normalized.userId,
            charId: normalized.charId,
            createdAt: normalized.createdAt,
            updatedAt: normalized.updatedAt,
            totals: Object.assign({}, normalized.totals),
            byKind: {
                profile: normalizeNotebookLearningBucket(normalized.byKind.profile),
                mustRemember: normalizeNotebookLearningBucket(normalized.byKind.mustRemember),
                redline: normalizeNotebookLearningBucket(normalized.byKind.redline)
            }
        };
    }

    function readNotebookLearningProfileFromStorage(userId, charId) {
        const safeUserId = resolveNotebookLearningUserId(userId);
        const safeCharId = toTrimmedString(charId);
        const storage = resolveNotebookLearningStorage();
        if (!safeUserId || !safeCharId || !storage) {
            return normalizeNotebookLearningProfile(null, safeUserId, safeCharId);
        }

        try {
            const raw = storage.getItem(buildNotebookLearningStorageKey(safeUserId, safeCharId));
            if (!raw) {
                return normalizeNotebookLearningProfile(null, safeUserId, safeCharId);
            }
            return normalizeNotebookLearningProfile(JSON.parse(raw), safeUserId, safeCharId);
        } catch (_) {
            return normalizeNotebookLearningProfile(null, safeUserId, safeCharId);
        }
    }

    function writeNotebookLearningProfileToStorage(profile) {
        const normalized = normalizeNotebookLearningProfile(profile);
        const storage = resolveNotebookLearningStorage();
        if (!normalized.userId || !normalized.charId || !storage) {
            return normalized;
        }

        try {
            storage.setItem(
                buildNotebookLearningStorageKey(normalized.userId, normalized.charId),
                JSON.stringify(buildNotebookLearningStoragePayload(normalized))
            );
        } catch (_) {
            return normalized;
        }
        return normalized;
    }

    function incrementNotebookCounterMap(map, key, delta) {
        const safeMap = isPlainObject(map) ? map : {};
        const safeKey = toTrimmedString(key);
        const amount = Math.max(1, Math.floor(toFiniteNumber(delta, 1)));
        if (!safeKey) return safeMap;
        safeMap[safeKey] = Math.max(0, Math.floor(toFiniteNumber(safeMap[safeKey], 0))) + amount;
        return safeMap;
    }

    /**
     * 将任意值转换成字符串数组并去重。
     */
    function normalizeStringArray(value) {
        const source = Array.isArray(value) ? value : [];
        const result = [];
        const seen = new Set();

        for (let i = 0; i < source.length; i += 1) {
            const item = toTrimmedString(source[i]);
            if (!item || seen.has(item)) continue;
            seen.add(item);
            result.push(item);
        }

        return result;
    }

    /**
     * 尝试把 RPC 返回的数组字段解析成普通数组。
     */
    function normalizeRecordArray(value) {
        if (Array.isArray(value)) {
            return value.filter(isPlainObject);
        }

        if (typeof value === 'string') {
            try {
                const parsed = JSON.parse(value);
                return Array.isArray(parsed) ? parsed.filter(isPlainObject) : [];
            } catch (_) {
                return [];
            }
        }

        return [];
    }

    /**
     * 从普通对象或字符串里解析 JSON。
     */
    function parseNotebookJsonLike(value, fallback) {
        if (isPlainObject(value) || Array.isArray(value)) return value;
        if (typeof value !== 'string') return fallback;
        try {
            return JSON.parse(value);
        } catch (_) {
            return fallback;
        }
    }

    /**
     * 截断过长文本，避免管理台和日志被异常输出撑爆。
     */
    function clipNotebookText(value, limit) {
        const safeLimit = Math.max(8, Math.floor(toFiniteNumber(limit, 1200)));
        const safe = toTrimmedString(value);
        if (safe.length <= safeLimit) return safe;
        return safe.slice(0, safeLimit - 1) + '…';
    }

    /**
     * 规范化偏好档案记录。
     */
    function normalizeProfileRecord(item) {
        if (!isPlainObject(item)) return null;

        const category = toTrimmedString(item.category).toLowerCase();
        const confidence = toTrimmedString(item.confidence).toLowerCase();
        if (DEPRECATED_PROFILE_CATEGORIES.has(category) || isNotebookRelationshipProfileFact(item.content)) return null;

        return {
            id: toTrimmedString(item.id),
            user_id: toTrimmedString(item.user_id),
            char_id: toTrimmedString(item.char_id),
            content: toTrimmedString(item.content),
            category: PROFILE_CATEGORIES.has(category) ? category : 'other',
            confidence: PROFILE_CONFIDENCE.has(confidence) ? confidence : 'stated',
            is_active: item.is_active !== false,
            superseded_by: toTrimmedString(item.superseded_by),
            source_memory_ids: normalizeStringArray(item.source_memory_ids),
            compacted_at: item.compacted_at || null,
            metadata: isPlainObject(item.metadata) ? item.metadata : {},
            created_at: item.created_at || null,
            updated_at: item.updated_at || null
        };
    }

    /**
     * 规范化必记事项记录。
     */
    function normalizeMustRememberRecord(item) {
        if (!isPlainObject(item)) return null;

        const category = toTrimmedString(item.category).toLowerCase();
        const origin = toTrimmedString(item.origin).toLowerCase();

        return {
            id: toTrimmedString(item.id),
            user_id: toTrimmedString(item.user_id),
            char_id: toTrimmedString(item.char_id),
            content: toTrimmedString(item.content),
            category: MUST_REMEMBER_CATEGORIES.has(category) ? category : 'other',
            origin: origin || 'system_extracted',
            origin_context: toTrimmedString(item.origin_context),
            is_active: item.is_active !== false,
            source_memory_ids: normalizeStringArray(item.source_memory_ids),
            compacted_at: item.compacted_at || null,
            metadata: isPlainObject(item.metadata) ? item.metadata : {},
            created_at: item.created_at || null,
            updated_at: item.updated_at || null
        };
    }

    /**
     * 规范化整理归档分组。
     */
    function normalizeCompactionGroup(item) {
        if (!isPlainObject(item)) return null;
        const title = toTrimmedString(item.title);
        const rawItems = Array.isArray(item.items) ? item.items : [];
        const items = rawItems.map(function mapItem(value) {
            return toTrimmedString(value);
        }).filter(Boolean);
        const sourceIndices = normalizeStringArray(
            item.source_indices
            || item.source_entry_indices
            || item.sourceEntryIndices
        );
        const sourceIds = normalizeStringArray(item.source_ids || item.sourceIds);
        if (!title && items.length <= 0) return null;
        return {
            title: title || '未命名分组',
            items: items,
            source_indices: sourceIndices,
            source_ids: sourceIds
        };
    }

    /**
     * 规范化整理归档记录。
     */
    function normalizeCompactedRecord(item) {
        if (!isPlainObject(item)) return null;
        const groups = normalizeRecordArray(item.groups).map(normalizeCompactionGroup).filter(Boolean);
        const compactedText = toTrimmedString(item.compacted_text || item.compactedText)
            || buildCompactedTextFromGroups(groups);
        if (!toTrimmedString(item.id) && !compactedText && groups.length <= 0) return null;
        return {
            id: toTrimmedString(item.id),
            user_id: toTrimmedString(item.user_id),
            char_id: toTrimmedString(item.char_id),
            compacted_text: compactedText,
            groups: groups,
            source_profile_ids: normalizeStringArray(item.source_profile_ids || item.sourceProfileIds),
            source_must_remember_ids: normalizeStringArray(item.source_must_remember_ids || item.sourceMustRememberIds),
            source_profile_count: Math.max(0, Math.floor(toFiniteNumber(item.source_profile_count || item.sourceProfileCount, 0))),
            source_must_remember_count: Math.max(0, Math.floor(toFiniteNumber(item.source_must_remember_count || item.sourceMustRememberCount, 0))),
            is_active: item.is_active !== false,
            metadata: isPlainObject(item.metadata) ? item.metadata : {},
            created_at: item.created_at || null,
            updated_at: item.updated_at || null
        };
    }

    /**
     * 规范化红线记录。
     */
    function normalizeRedlineRecord(item) {
        if (!isPlainObject(item)) return null;

        const severity = toTrimmedString(item.severity).toLowerCase();
        const origin = toTrimmedString(item.origin).toLowerCase();

        return {
            id: toTrimmedString(item.id),
            user_id: toTrimmedString(item.user_id),
            char_id: toTrimmedString(item.char_id),
            content: toTrimmedString(item.content),
            severity: REDLINE_SEVERITIES.has(severity) ? severity : 'important',
            origin: origin || 'system_extracted',
            origin_context: toTrimmedString(item.origin_context),
            is_active: item.is_active !== false,
            confirmed: item.confirmed === true,
            source_memory_ids: normalizeStringArray(item.source_memory_ids),
            metadata: isPlainObject(item.metadata) ? item.metadata : {},
            created_at: item.created_at || null,
            updated_at: item.updated_at || null
        };
    }

    /**
     * 统一规范化 RPC 返回的记事本结构。
     */
    function normalizeNotebookPayload(payload) {
        const source = isPlainObject(payload) ? payload : {};
        const mustRememberRaw = source.mustRemember !== undefined ? source.mustRemember : source.must_remember;

        return {
            profiles: normalizeRecordArray(source.profiles).map(normalizeProfileRecord).filter(Boolean),
            mustRemember: normalizeRecordArray(mustRememberRaw).map(normalizeMustRememberRecord).filter(Boolean),
            redlines: normalizeRecordArray(source.redlines).map(normalizeRedlineRecord).filter(Boolean)
        };
    }

    /**
     * 统计当前记事本条数，供日志复用。
     */
    function summarizeNotebookCounts(notebook) {
        const safeNotebook = notebook && typeof notebook === 'object' ? notebook : createEmptyNotebook();
        const profiles = Array.isArray(safeNotebook.profiles) ? safeNotebook.profiles : [];
        const mustRemember = Array.isArray(safeNotebook.mustRemember) ? safeNotebook.mustRemember : [];
        const redlines = Array.isArray(safeNotebook.redlines) ? safeNotebook.redlines : [];
        const statuses = Array.isArray(safeNotebook.statuses) ? safeNotebook.statuses : [];

        return {
            statuses: statuses.length,
            profiles: profiles.length,
            mustRemember: mustRemember.length,
            redlines: redlines.length
        };
    }

    /**
     * 统一清洗记事本文本，供低价值过滤与重复压缩复用。
     */
    function normalizeNotebookCompareText(value) {
        return toTrimmedString(value)
            .replace(/[\r\n\t]+/g, ' ')
            .replace(/[“”‘’"'`]/g, '')
            .replace(/[【】[\]（）()<>《》]/g, ' ')
            .replace(/[，。！？：；、\\|]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    }

    /**
     * 判断条目是否属于“游戏微观进度/配置”噪音。
     */
    function isNotebookGameMicroFact(text) {
        const normalized = normalizeNotebookCompareText(text);
        if (!normalized) return false;
        if (!NOTEBOOK_GAME_DETAIL_RE.test(normalized)) return false;
        return !NOTEBOOK_GAME_PREFERENCE_RE.test(normalized)
            && !NOTEBOOK_MAJOR_TRIGGER_RE.test(normalized)
            && !NOTEBOOK_STATUS_ACTIONABLE_RE.test(normalized);
    }

    function isNotebookRelationshipAddress(content) {
        return NOTEBOOK_RELATIONSHIP_ADDRESS_RE.test(normalizeNotebookCompareText(content));
    }

    function isNotebookRelationshipProfileFact(content) {
        const normalized = normalizeNotebookCompareText(content);
        return NOTEBOOK_RELATIONSHIP_ADDRESS_RE.test(normalized) || NOTEBOOK_RELATIONSHIP_PROFILE_RE.test(normalized);
    }

    function isNotebookCharReaction(content) {
        const normalized = normalizeNotebookCompareText(content);
        return NOTEBOOK_REACTION_TRIGGER_RE.test(normalized) && NOTEBOOK_REACTION_OUTCOME_RE.test(normalized);
    }

    function isNotebookActionableHabit(content) {
        const normalized = normalizeNotebookCompareText(content);
        return NOTEBOOK_STABLE_PROFILE_RE.test(normalized)
            && NOTEBOOK_ACTIONABLE_HABIT_RE.test(normalized)
            && !isNotebookCharReaction(content)
            && !isNotebookSpeculativeText(normalized)
            && !isNotebookRoleplayDetail(normalized)
            && !NOTEBOOK_FLIRT_OR_AROUSAL_RE.test(normalized);
    }

    function isNotebookCharLeadingContent(content) {
        return NOTEBOOK_CHAR_LEAD_RE.test(normalizeNotebookCompareText(content));
    }

    function isNotebookSelfNarratedStatus(content) {
        const normalized = normalizeNotebookCompareText(content);
        return /^(我|自己|本人)(正在|最近|又|还|在|处于|感觉|觉得|忙|吃|睡|工作|恢复|熬夜|内耗)/.test(normalized);
    }

    function isNotebookTemporaryStatus(text) {
        const normalized = normalizeNotebookCompareText(text);
        if (!normalized) return false;
        if (!NOTEBOOK_TRANSIENT_STATUS_RE.test(normalized)) return false;
        if (NOTEBOOK_SAFETY_RE.test(normalized) || NOTEBOOK_DATED_CONFLICT_RE.test(normalized)) return false;
        return !/(失眠|熬夜|睡眠.*不足|受伤|恢复|发烧|住院|复诊|考试|deadline|ddl|加班|冷战|吵架|争执|冲突)/i.test(normalized);
    }

    function isNotebookSpeculativeText(text) {
        const normalized = normalizeNotebookCompareText(text);
        if (!normalized) return false;
        return NOTEBOOK_HYPOTHETICAL_RE.test(normalized) || NOTEBOOK_JOKE_OR_QUOTE_RE.test(normalized);
    }

    function isNotebookFuturePlanOnly(text) {
        const normalized = normalizeNotebookCompareText(text);
        if (!normalized || !NOTEBOOK_FUTURE_PLAN_RE.test(normalized)) return false;
        return !NOTEBOOK_CURRENT_EVIDENCE_RE.test(normalized) && !NOTEBOOK_STATUS_ACTIONABLE_RE.test(normalized);
    }

    function isNotebookRoleplayDetail(text) {
        return NOTEBOOK_ROLEPLAY_RE.test(normalizeNotebookCompareText(text));
    }

    function isNotebookNegativeRelationshipAddress(text) {
        const normalized = normalizeNotebookCompareText(text);
        if (!normalized) return false;
        return NOTEBOOK_RELATIONSHIP_ADDRESS_RE.test(normalized) && NOTEBOOK_RELATIONSHIP_NEGATIVE_RE.test(normalized);
    }

    function isNotebookThirdPartyProfileLeak(text) {
        const normalized = normalizeNotebookCompareText(text);
        if (!normalized) return false;
        if (!NOTEBOOK_THIRD_PARTY_RE.test(normalized)) return false;
        return !/(不是|并不是|不是用户|不是她|不是他|只是|仅仅|而不是)/.test(normalized);
    }

    function isNotebookIdentityClaim(text) {
        return NOTEBOOK_IDENTITY_CLAIM_RE.test(normalizeNotebookCompareText(text));
    }

    function hasNotebookUserSelfAnchor(text) {
        return NOTEBOOK_USER_SELF_ANCHOR_RE.test(normalizeNotebookCompareText(text));
    }

    function hasNotebookStrongUserSelfAnchor(text) {
        return NOTEBOOK_USER_STRONG_SELF_ANCHOR_RE.test(normalizeNotebookCompareText(text));
    }

    function isWeakNotebookProfileClaim(item) {
        const safeItem = isPlainObject(item) ? item : {};
        const content = toTrimmedString(safeItem.content);
        const category = toTrimmedString(safeItem.category).toLowerCase();
        if (!content) return true;
        if (isNotebookThirdPartyProfileLeak(content)) return true;
        if (category === 'identity' && (!hasNotebookUserSelfAnchor(content) || isNotebookSpeculativeText(content))) return true;
        if (isNotebookIdentityClaim(content) && !hasNotebookUserSelfAnchor(content)) return true;
        if (NOTEBOOK_HIGH_RISK_IDENTITY_RE.test(content) && !hasNotebookStrongUserSelfAnchor(content)) return true;
        if ((category === 'preference' || category === 'other')
            && isNotebookConcretePreferenceText(content)) return false;
        if ((category === 'habit' || category === 'other')
            && isNotebookImportantHabitText(content)) return false;
        if (NOTEBOOK_WEAK_PROFILE_RE.test(content) && !NOTEBOOK_ACTIONABLE_HABIT_RE.test(content) && !isNotebookIdentityClaim(content)) return true;
        return false;
    }

    function normalizeNotebookSemanticSketch(value) {
        return normalizeNotebookCompareText(value)
            .replace(/\b(user|assistant|char|bot|roleplay|currently|recently|still)\b/g, ' ')
            .replace(/(用户|对方|她|他|ta|TA|角色|会|喜欢|不喜欢|讨厌|偏好|倾向|习惯|经常|总是|通常|偶尔|开始|最近|目前|现在|亲昵地|主动|容易|正在|还在|很|非常|有点|一点|对于|关于|在互动中|会亲昵地|会用|会把|会叫|系列|题材|各类|各种|类型|游戏|作品)/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function buildNotebookBigrams(text) {
        const compact = normalizeNotebookSemanticSketch(text).replace(/\s+/g, '');
        if (compact.length < 2) return compact ? [compact] : [];
        const grams = [];
        for (let i = 0; i < compact.length - 1; i += 1) {
            grams.push(compact.slice(i, i + 2));
        }
        return grams;
    }

    function hasNotebookBigramOverlap(left, right, threshold) {
        const leftBigrams = buildNotebookBigrams(left);
        const rightBigrams = buildNotebookBigrams(right);
        if (leftBigrams.length <= 0 || rightBigrams.length <= 0) return false;
        const leftSet = new Set(leftBigrams);
        const rightSet = new Set(rightBigrams);
        let overlap = 0;
        leftSet.forEach(function countOverlap(item) {
            if (rightSet.has(item)) overlap += 1;
        });
        const denominator = Math.max(1, Math.min(leftSet.size, rightSet.size));
        return overlap / denominator >= Math.max(0.6, Number(threshold) || 0.78);
    }

    function extractNotebookRelationshipAlias(text) {
        const raw = toTrimmedString(text);
        const normalized = normalizeNotebookCompareText(raw);
        if (!normalized || !NOTEBOOK_RELATIONSHIP_ADDRESS_RE.test(normalized)) return '';

        const direction = /(叫我|喊我|称呼我|管我叫|call me|calls me)/i.test(raw)
            ? 'me'
            : (/(叫用户|喊用户|称呼用户|叫对方|喊对方|称呼对方|叫ta|喊ta|称呼ta|叫TA|喊TA|称呼TA|叫他|喊他|称呼他|叫她|喊她|称呼她|我叫用户|我称用户|我叫对方|我称对方|我叫ta|我称ta|我叫TA|我称TA|我叫他|我称他|我叫她|我称她|call user|calls user|call them|calls them|call her|calls her|call him|calls him)/i.test(raw)
                ? 'user'
                : '');
        if (!direction) return '';

        const aliasMatch = raw.match(/(?:叫我|喊我|称呼我|管我叫|叫用户|喊用户|称呼用户|叫对方|喊对方|称呼对方|叫ta|喊ta|称呼ta|叫TA|喊TA|称呼TA|叫他|喊他|称呼他|叫她|喊她|称呼她|call me|calls me|call user|calls user|call them|calls them|call her|calls her|call him|calls him)(?:为|成)?\s*[“"'「『]?([^"'“”‘’「」『』，,。！？!?\\s]{1,16})[”"'」』]?/i)
            || raw.match(/[“"'「『]([^"'“”‘’「」『』，,。！？!?\\s]{1,16})[”"'」』]/);
        const alias = normalizeNotebookCompareText(aliasMatch && aliasMatch[1] ? aliasMatch[1] : '');
        return alias ? `${direction}:${alias}` : '';
    }

    function extractNotebookPreferencePhrase(text) {
        const raw = toTrimmedString(text);
        const normalized = normalizeNotebookCompareText(raw);
        if (!normalized) return null;

        const negativeMatch = normalized.match(/(?:不喜欢|讨厌|反感|不爱|不吃|不喝|不能吃|不能喝|别放)(.+)$/);
        const positiveMatch = normalized.match(/(?:喜欢|偏好|倾向|更喜欢|爱看|爱听|爱吃|爱喝)(.+)$/);
        const polarity = negativeMatch ? 'neg' : (positiveMatch ? 'pos' : '');
        const value = normalizeNotebookSemanticSketch(negativeMatch ? negativeMatch[1] : (positiveMatch ? positiveMatch[1] : ''));
        if (!polarity || !value) return null;
        return {
            polarity: polarity,
            value: value
        };
    }

    function hasNotebookExplicitPreferenceText(text) {
        const normalized = normalizeNotebookCompareText(text);
        if (!normalized) return false;
        return NOTEBOOK_EXPLICIT_PREFERENCE_RE.test(normalized);
    }

    function isNotebookValueOrPersonalityImpression(text) {
        return NOTEBOOK_VALUE_OR_PERSONALITY_RE.test(normalizeNotebookCompareText(text));
    }

    function isNotebookConcretePreferenceText(text) {
        const normalized = normalizeNotebookCompareText(text);
        if (!normalized || !hasNotebookExplicitPreferenceText(normalized)) return false;
        if (isNotebookValueOrPersonalityImpression(normalized)) return false;
        if (isNotebookSpeculativeText(normalized)) return false;
        if (isNotebookCharReaction(normalized) || isNotebookCharLeadingContent(normalized)) return false;
        if (isNotebookRelationshipProfileFact(normalized)) return false;
        if (NOTEBOOK_SELF_FLAVOR_RE.test(normalized)) return false;
        return NOTEBOOK_USER_FOCUS_RE.test(normalized)
            || NOTEBOOK_USER_SELF_ANCHOR_RE.test(normalized)
            || /^(喜欢|很喜欢|非常喜欢|爱吃|爱看|爱玩|爱听|爱喝|讨厌|反感|不喜欢|不吃|不喝|偏好|更喜欢)/.test(normalized);
    }

    function isNotebookImportantHabitText(text) {
        const normalized = normalizeNotebookCompareText(text);
        if (!normalized) return false;
        if (isNotebookSpeculativeText(normalized)) return false;
        if (isNotebookCharReaction(normalized) || isNotebookCharLeadingContent(normalized)) return false;
        if (isNotebookRelationshipProfileFact(normalized)) return false;
        if (NOTEBOOK_FLIRT_OR_AROUSAL_RE.test(normalized) && !NOTEBOOK_STATUS_ACTIONABLE_RE.test(normalized)) return false;
        if (NOTEBOOK_ONE_OFF_EVENT_RE.test(normalized) && !NOTEBOOK_STABLE_HABIT_WORD_RE.test(normalized)) return false;
        return isNotebookActionableHabit(normalized)
            || (NOTEBOOK_STABLE_HABIT_WORD_RE.test(normalized)
                && (NOTEBOOK_USER_FOCUS_RE.test(normalized) || NOTEBOOK_USER_SELF_ANCHOR_RE.test(normalized)));
    }

    function isNotebookWeakHabitProfile(item) {
        const safeItem = isPlainObject(item) ? item : {};
        const category = toTrimmedString(safeItem.category).toLowerCase();
        const content = toTrimmedString(safeItem.content);
        if (!content || (category !== 'habit' && category !== 'other')) return false;
        if (isNotebookConcretePreferenceText(content) || isNotebookImportantHabitText(content)) return false;
        return true;
    }

    function isSameNotebookPreferenceTarget(leftText, rightText) {
        const left = extractNotebookPreferencePhrase(leftText);
        const right = extractNotebookPreferencePhrase(rightText);
        if (!left || !right || left.polarity !== right.polarity) return false;
        if (left.value === right.value) return true;
        if (left.value.length >= 2 && right.value.includes(left.value)) return true;
        if (right.value.length >= 2 && left.value.includes(right.value)) return true;
        return hasNotebookBigramOverlap(left.value, right.value, 0.75);
    }

    function getNotebookTopLevelFocusFamily(text) {
        const normalized = normalizeNotebookCompareText(text);
        if (!normalized || !NOTEBOOK_CURRENT_EVIDENCE_RE.test(normalized)) return '';
        if (NOTEBOOK_TOPLEVEL_PLAY_RE.test(normalized)) return 'play';
        if (NOTEBOOK_TOPLEVEL_WATCH_RE.test(normalized)) return 'watch';
        if (NOTEBOOK_TOPLEVEL_READ_RE.test(normalized)) return 'read';
        if (NOTEBOOK_TOPLEVEL_LISTEN_RE.test(normalized)) return 'listen';
        return '';
    }

    function deriveRelationshipAddressSemanticKey(content, kind) {
        const normalized = normalizeNotebookCompareText(content);
        if (!normalized || !NOTEBOOK_RELATIONSHIP_ADDRESS_RE.test(normalized)) return '';
        return `${kind}:address:${normalized
            .replace(/[“”‘’"'`]/g, '')
            .replace(/(开始|自然地|亲昵地|经常|总是|偶尔|会在.*?中|会|改口|被我)/g, '')
            .replace(/(叫我|喊我|称呼我|管我叫|改口叫我)/g, 'addr_me')
            .replace(/(叫用户|喊用户|称呼用户|管用户叫|我叫用户|我称用户|叫对方|喊对方|称呼对方|管对方叫|我叫对方|我称对方|叫ta|喊ta|称呼ta|管ta叫|我叫ta|我称ta|叫TA|喊TA|称呼TA|管TA叫|我叫TA|我称TA|叫他|喊他|称呼他|管他叫|我叫他|我称他|叫她|喊她|称呼她|管她叫|我叫她|我称她|称用户为|称对方为|称ta为|称TA为|称他为|称她为|被我称为|被我称呼为|改口叫用户|改口叫对方|改口叫ta|改口叫TA|改口叫他|改口叫她)/g, 'addr_user')
            .slice(0, 120)}`;
    }

    /**
     * 为记事本条目生成轻量主题 key，压缩近义重复。
     */
    function deriveNotebookSemanticKey(content, kind) {
        const normalized = normalizeNotebookCompareText(content);
        if (!normalized) return '';
        if (NOTEBOOK_PROMISE_DEBT_RE.test(normalized)) return `${kind}:purchase_or_repayment_promise`;
        if (NOTEBOOK_DATED_CONFLICT_RE.test(normalized)) return `${kind}:dated_conflict`;
        if (kind === 'profile') {
            const relationshipKey = deriveRelationshipAddressSemanticKey(content, kind);
            if (relationshipKey) return relationshipKey;
            if (/(游戏|作品|题材|系列|影视|小说|动漫|动画|漫画|综艺|剧|音乐|歌曲)/.test(normalized)
                && /(喜欢|不喜欢|讨厌|偏好|倾向|爱看|爱玩|感兴趣)/.test(normalized)) {
                const preference = extractNotebookPreferencePhrase(content);
                const value = preference && preference.value
                    ? preference.value.replace(/(系列|题材|各类|各种|类型|游戏|作品|相关|改版|改编|非常|很|比较)/g, '').slice(0, 24)
                    : normalizeNotebookSemanticSketch(content).slice(0, 24);
                if (value) return `${kind}:media_or_game_preference:${preference ? preference.polarity : 'pref'}:${value}`;
            }
        }
        if (/(受伤|伤口|伤处|骨折|康复|恢复|疼痛|疼|痛)/.test(normalized) && /(休息|恢复|康复|复诊|处理|买药|疼|痛)/.test(normalized)) {
            return `${kind}:body_injury_or_care`;
        }
        return normalized
            .replace(/[0-9]/g, '')
            .replace(/\s+/g, '')
            .slice(0, 120);
    }

    /**
     * 判断两条记事本文本是否可视为同主题重复。
     */
    function isNotebookDuplicateEntry(existingItem, candidateItem, kind) {
        const existingContent = toTrimmedString(existingItem && existingItem.content);
        const candidateContent = toTrimmedString(candidateItem && candidateItem.content);
        if (!existingContent || !candidateContent) return false;

        const existingKey = deriveNotebookSemanticKey(existingContent, kind);
        const candidateKey = deriveNotebookSemanticKey(candidateContent, kind);
        if (existingKey && candidateKey && existingKey === candidateKey) return true;

        if (kind === 'profile') {
            const existingAlias = extractNotebookRelationshipAlias(existingContent);
            const candidateAlias = extractNotebookRelationshipAlias(candidateContent);
            if (existingAlias && candidateAlias && existingAlias === candidateAlias) return true;
            if (isSameNotebookPreferenceTarget(existingContent, candidateContent)) return true;
        }

        const existingText = normalizeNotebookCompareText(existingContent);
        const candidateText = normalizeNotebookCompareText(candidateContent);
        if (!existingText || !candidateText) return false;
        if (existingText === candidateText) return true;
        if (existingText.length >= 8 && candidateText.includes(existingText)) return true;
        if (candidateText.length >= 8 && existingText.includes(candidateText)) return true;
        if (hasNotebookBigramOverlap(existingText, candidateText, 0.82)) return true;
        return false;
    }

    /**
     * 判断档案条目是否更像长期稳定特征，而不是一次性事件。
     */
    function scoreProfileNoteValue(item) {
        const content = toTrimmedString(item && item.content);
        if (!content) return -99;
        if (isNotebookRelationshipProfileFact(content)) return -99;
        if (isWeakNotebookProfileClaim(item)) return -99;

        let score = 0;
        const category = toTrimmedString(item && item.category).toLowerCase();
        const isConcretePreference = isNotebookConcretePreferenceText(content);
        const isImportantHabit = isNotebookImportantHabitText(content);
        if (item && (item.category === 'preference' || item.category === 'habit' || item.category === 'identity')) score += 2;
        if (NOTEBOOK_USER_FOCUS_RE.test(content) || NOTEBOOK_RELATIONSHIP_FROM_USER_RE.test(content)) score += 2;
        if (NOTEBOOK_STABLE_PROFILE_RE.test(content)) score += 2;
        if (category === 'preference' && isConcretePreference) score += 4;
        if (category === 'habit' && isImportantHabit) score += 4;
        if (item && item.category === 'habit') {
            score += isImportantHabit ? 1 : -2;
        }
        if (NOTEBOOK_ONE_OFF_EVENT_RE.test(content) && !isConcretePreference && !isImportantHabit) score -= 1;
        if (NOTEBOOK_SELF_LEAD_RE.test(content) && !NOTEBOOK_RELATIONSHIP_FROM_USER_RE.test(content)) score -= 3;
        if (isNotebookCharLeadingContent(content)
            && !NOTEBOOK_RELATIONSHIP_FROM_USER_RE.test(content)) score -= 4;
        if (isNotebookCharReaction(content)) score -= 4;
        if (NOTEBOOK_LOW_VALUE_SENSORY_RE.test(content)) score -= 2;
        if (NOTEBOOK_SELF_FLAVOR_RE.test(content)) score -= 3;
        if (NOTEBOOK_FLIRT_OR_AROUSAL_RE.test(content)) score -= 2;
        if (isNotebookSpeculativeText(content) && !isConcretePreference && !isImportantHabit) score -= 4;
        if (isNotebookRoleplayDetail(content)) score -= 4;
        if (isNotebookNegativeRelationshipAddress(content)) score -= 8;
        if (isNotebookGameMicroFact(content) && !isConcretePreference) score -= 3;
        if (/^(住在|住址|地址)/.test(content)) score -= 2;
        return score;
    }

    /**
     * 判断必记条目是否真的达到长期高优先级门槛。
     */
    function scoreMustRememberValue(item) {
        const content = toTrimmedString(item && item.content);
        const originContext = toTrimmedString(item && (item.originContext || item.origin_context));
        const combined = `${content} ${originContext}`;
        if (!content) return -99;

        let score = 0;
        const category = toTrimmedString(item && item.category).toLowerCase();
        const isPromise = category === 'promise' || /(承诺|答应|保证|发誓|约定|promise|promised|swear|pledge)/i.test(combined);
        const hasHighConsequence = NOTEBOOK_SAFETY_RE.test(combined)
            || NOTEBOOK_BOUNDARY_RE.test(combined)
            || NOTEBOOK_PROMISE_DEBT_RE.test(combined)
            || NOTEBOOK_DATED_CONFLICT_RE.test(combined)
            || NOTEBOOK_MAJOR_PROMISE_RE.test(combined);

        if (category === 'trigger' || category === 'health') score += 2;
        if (category === 'promise') score += hasHighConsequence ? 2 : -3;
        if (NOTEBOOK_BOUNDARY_RE.test(combined)) score += 2;
        if (NOTEBOOK_IMPORTANCE_RE.test(combined)) score += hasHighConsequence ? 2 : 0;
        if (NOTEBOOK_SAFETY_RE.test(combined)) score += 3;
        if (NOTEBOOK_PROMISE_DEBT_RE.test(combined)) score += 2;
        if (NOTEBOOK_MAJOR_PROMISE_RE.test(combined)) score += 2;
        if (NOTEBOOK_DATED_CONFLICT_RE.test(combined)) score += 2;
        if (NOTEBOOK_LOW_VALUE_SENSORY_RE.test(combined) || NOTEBOOK_SELF_FLAVOR_RE.test(combined)) score -= 3;
        if (NOTEBOOK_FLIRT_OR_AROUSAL_RE.test(combined) && !hasHighConsequence) score -= 4;
        if (NOTEBOOK_TRIVIAL_PROMISE_RE.test(combined) && !hasHighConsequence) score -= 5;
        if (NOTEBOOK_GENERIC_CARE_PROMISE_RE.test(combined) && !hasHighConsequence) score -= 4;
        if (isPromise && !hasHighConsequence) score -= 2;
        if (isNotebookSpeculativeText(combined) && !hasHighConsequence) score -= 4;
        if (isNotebookRoleplayDetail(combined) && !hasHighConsequence) score -= 4;
        if (isNotebookGameMicroFact(combined) && !NOTEBOOK_IMPORTANCE_RE.test(combined)) score -= 3;
        return score;
    }

    /**
     * 判断红线条目是否具备明确禁区或风险信号。
     */
    function scoreRedlineValue(item) {
        const content = toTrimmedString(item && item.content);
        const originContext = toTrimmedString(item && (item.originContext || item.origin_context));
        const combined = `${content} ${originContext}`;
        if (!content) return -99;

        let score = 0;
        if (item && item.severity === 'critical') score += 3;
        if (item && item.severity === 'important') score += 1;
        if (NOTEBOOK_BOUNDARY_RE.test(combined)) score += 3;
        if (NOTEBOOK_SAFETY_RE.test(combined)) score += 3;
        if (NOTEBOOK_IMPORTANCE_RE.test(combined)) score += 1;
        if (NOTEBOOK_LOW_VALUE_SENSORY_RE.test(combined) || NOTEBOOK_SELF_FLAVOR_RE.test(combined)) score -= 3;
        if (isNotebookGameMicroFact(combined)) score -= 3;
        return score;
    }

    /**
     * 判断状态条目是否真的会影响后续几轮回应。
     */
    /**
     * 过滤过于琐碎或对回应无帮助的状态条目。
     */
    function buildNotebookLearningCombinedText(kind, item) {
        const safeKind = normalizeNotebookLearningKind(kind);
        const safeItem = isPlainObject(item) ? item : {};
        if (safeKind === 'mustRemember' || safeKind === 'redline') {
            return normalizeNotebookCompareText([
                safeItem.content,
                safeItem.originContext,
                safeItem.origin_context
            ].join(' '));
        }
        return normalizeNotebookCompareText(safeItem.content);
    }

    function buildNotebookLearningTags(kind, item) {
        const safeKind = normalizeNotebookLearningKind(kind);
        const safeItem = isPlainObject(item) ? item : {};
        const content = toTrimmedString(safeItem.content);
        const combined = buildNotebookLearningCombinedText(safeKind, safeItem);
        const tags = [];

        if (!safeKind || !content) return tags;

        if (safeKind === 'profile') {
            if (isNotebookCharReaction(content)) tags.push('profile_char_reaction');
            if (NOTEBOOK_LOW_VALUE_SENSORY_RE.test(content) || NOTEBOOK_SELF_FLAVOR_RE.test(content)) tags.push('profile_self_flavor');
            if (NOTEBOOK_FLIRT_OR_AROUSAL_RE.test(combined) && (isNotebookCharReaction(content) || !NOTEBOOK_STABLE_PROFILE_RE.test(combined))) tags.push('profile_flirt_detail');
            if (isNotebookWeakHabitProfile(safeItem)) tags.push('profile_weak_habit');
            if (safeItem.category === 'relationship' && !isNotebookRelationshipAddress(content) && !NOTEBOOK_RELATIONSHIP_FROM_USER_RE.test(content)) tags.push('profile_weak_relationship');
            if (NOTEBOOK_ONE_OFF_EVENT_RE.test(content) && !isNotebookConcretePreferenceText(content) && !isNotebookImportantHabitText(content)) tags.push('profile_one_off');
            if (isNotebookGameMicroFact(content) && !isNotebookConcretePreferenceText(content)) tags.push('profile_game_detail');
            return normalizeStringArray(tags);
        }

        if (safeKind === 'mustRemember') {
            if (!NOTEBOOK_MAJOR_TRIGGER_RE.test(combined) && !NOTEBOOK_SAFETY_RE.test(combined) && !NOTEBOOK_PROMISE_DEBT_RE.test(combined)) tags.push('must_weak_priority');
            if (isNotebookGameMicroFact(combined) && !NOTEBOOK_IMPORTANCE_RE.test(combined)) tags.push('must_game_detail');
            if (NOTEBOOK_LOW_VALUE_SENSORY_RE.test(combined) || NOTEBOOK_SELF_FLAVOR_RE.test(combined)) tags.push('must_self_flavor');
            return normalizeStringArray(tags);
        }

        if (safeKind === 'redline') {
            if (!NOTEBOOK_BOUNDARY_RE.test(combined) && !NOTEBOOK_SAFETY_RE.test(combined)) tags.push('redline_implicit');
            if (isNotebookGameMicroFact(combined)) tags.push('redline_game_detail');
            return normalizeStringArray(tags);
        }

        return normalizeStringArray(tags);
    }

    function buildNotebookLearningCategoryKey(kind, item) {
        const safeKind = normalizeNotebookLearningKind(kind);
        const safeItem = isPlainObject(item) ? item : {};
        if (safeKind === 'redline') {
            return toTrimmedString(safeItem.severity) || 'important';
        }
        return toTrimmedString(safeItem.category) || 'other';
    }

    function buildNotebookLearningSemanticKey(kind, item) {
        const safeKind = normalizeNotebookLearningKind(kind);
        const safeItem = isPlainObject(item) ? item : {};
        const content = toTrimmedString(safeItem.content);
        if (!safeKind || !content) return '';
        const semanticBase = deriveNotebookSemanticKey(content, safeKind);
        if (!semanticBase) return '';
        if (safeKind === 'redline') {
            return `${safeKind}:${toTrimmedString(safeItem.severity || 'important').toLowerCase()}:${semanticBase}`;
        }
        const category = toTrimmedString(safeItem.category || 'other').toLowerCase();
        return `${safeKind}:${category}:${semanticBase}`;
    }

    function applyNotebookLearningNegativeFeedback(profile, kind, item, action, delta) {
        const safeKind = normalizeNotebookLearningKind(kind);
        if (!safeKind) return profile;

        const safeProfile = normalizeNotebookLearningProfile(profile);
        const bucket = safeProfile.byKind[safeKind];
        const amount = Math.max(1, Math.floor(toFiniteNumber(delta, 1)));
        const tags = buildNotebookLearningTags(safeKind, item);
        const categoryKey = buildNotebookLearningCategoryKey(safeKind, item);
        const semanticKey = buildNotebookLearningSemanticKey(safeKind, item);

        bucket.negativeCount += amount;
        safeProfile.totals.negativeCount += amount;
        safeProfile.totals.feedbackCount += amount;
        if (action === 'delete') {
            bucket.deleteCount += amount;
            safeProfile.totals.deleteCount += amount;
        } else if (action === 'batch_delete') {
            bucket.batchDeleteCount += amount;
            safeProfile.totals.batchDeleteCount += amount;
        }
        if (categoryKey) {
            incrementNotebookCounterMap(bucket.categories, categoryKey, amount);
            incrementNotebookCounterMap(bucket.negativeCategories, categoryKey, amount);
        }
        if (semanticKey) {
            incrementNotebookCounterMap(bucket.semanticKeys, semanticKey, amount);
            incrementNotebookCounterMap(bucket.negativeSemanticKeys, semanticKey, amount);
        }
        tags.forEach(function appendTag(tag) {
            incrementNotebookCounterMap(bucket.tags, tag, amount);
            incrementNotebookCounterMap(bucket.negativeTags, tag, amount);
        });
        return safeProfile;
    }

    function applyNotebookLearningPositiveFeedback(profile, kind, item, action, delta) {
        const safeKind = normalizeNotebookLearningKind(kind);
        if (!safeKind) return profile;

        const safeProfile = normalizeNotebookLearningProfile(profile);
        const bucket = safeProfile.byKind[safeKind];
        const amount = Math.max(1, Math.floor(toFiniteNumber(delta, 1)));
        const tags = buildNotebookLearningTags(safeKind, item);
        const categoryKey = buildNotebookLearningCategoryKey(safeKind, item);
        const semanticKey = buildNotebookLearningSemanticKey(safeKind, item);

        bucket.positiveCount += amount;
        safeProfile.totals.positiveCount += amount;
        safeProfile.totals.feedbackCount += amount;
        if (action === 'manual_add') {
            bucket.manualAddCount += amount;
            safeProfile.totals.manualAddCount += amount;
        } else if (action === 'manual_edit') {
            bucket.editCount += amount;
            safeProfile.totals.editCount += amount;
        } else if (action === 'confirm') {
            bucket.confirmCount += amount;
            safeProfile.totals.confirmCount += amount;
        }
        if (categoryKey) {
            incrementNotebookCounterMap(bucket.categories, categoryKey, amount);
            incrementNotebookCounterMap(bucket.positiveCategories, categoryKey, amount);
        }
        if (semanticKey) {
            incrementNotebookCounterMap(bucket.positiveSemanticKeys, semanticKey, amount);
        }
        tags.forEach(function appendTag(tag) {
            incrementNotebookCounterMap(bucket.positiveTags, tag, amount);
        });
        return safeProfile;
    }

    function hasMaterialNotebookFeedbackChange(kind, before, after) {
        const safeKind = normalizeNotebookLearningKind(kind);
        const beforeText = buildNotebookLearningCombinedText(safeKind, before);
        const afterText = buildNotebookLearningCombinedText(safeKind, after);
        if (beforeText !== afterText) return true;

        if (safeKind === 'redline') {
            return toTrimmedString(before && before.severity) !== toTrimmedString(after && after.severity);
        }
        if (safeKind === 'profile') {
            return toTrimmedString(before && before.category) !== toTrimmedString(after && after.category)
                || toTrimmedString(before && before.confidence) !== toTrimmedString(after && after.confidence);
        }
        if (safeKind === 'mustRemember') {
            return toTrimmedString(before && before.category) !== toTrimmedString(after && after.category);
        }
        return false;
    }

    function buildNotebookLearningRules(profile) {
        const safeProfile = normalizeNotebookLearningProfile(profile);
        const profileBucket = safeProfile.byKind.profile;
        const mustBucket = safeProfile.byKind.mustRemember;
        const redlineBucket = safeProfile.byKind.redline;
        const feedbackCount = Math.max(0, Math.floor(toFiniteNumber(safeProfile.totals.feedbackCount, 0)));
        const confidence = feedbackCount >= 8 ? 'high' : (feedbackCount >= 3 ? 'medium' : 'low');
        const profileCharReactionBias = getNotebookLearningTagBias(profileBucket, 'profile_char_reaction');
        const profileSelfFlavorBias = getNotebookLearningTagBias(profileBucket, 'profile_self_flavor');
        const profileFlirtDetailBias = getNotebookLearningTagBias(profileBucket, 'profile_flirt_detail');
        const profileWeakHabitBias = getNotebookLearningTagBias(profileBucket, 'profile_weak_habit');
        const profileWeakRelationshipBias = getNotebookLearningTagBias(profileBucket, 'profile_weak_relationship');
        const profileGameDetailBias = getNotebookLearningTagBias(profileBucket, 'profile_game_detail');
        const profileOneOffBias = getNotebookLearningTagBias(profileBucket, 'profile_one_off');
        const profileHabitCategoryBias = getNotebookLearningCategoryBias(profileBucket, 'habit');
        const profileRelationshipCategoryBias = getNotebookLearningCategoryBias(profileBucket, 'relationship');
        const mustWeakPriorityBias = getNotebookLearningTagBias(mustBucket, 'must_weak_priority');
        const mustGameDetailBias = getNotebookLearningTagBias(mustBucket, 'must_game_detail');
        const mustSelfFlavorBias = getNotebookLearningTagBias(mustBucket, 'must_self_flavor');
        const redlineImplicitBias = getNotebookLearningTagBias(redlineBucket, 'redline_implicit');
        const redlineGameDetailBias = getNotebookLearningTagBias(redlineBucket, 'redline_game_detail');

        return {
            confidence: confidence,
            evidenceCount: feedbackCount,
            profile: {
                rejectCharReaction: profileCharReactionBias >= 1,
                rejectSelfFlavor: profileSelfFlavorBias >= 1,
                rejectFlirtDetail: profileFlirtDetailBias >= 1,
                rejectWeakHabit: profileWeakHabitBias >= 1 || profileHabitCategoryBias >= 3,
                requireStableRelationship: profileWeakRelationshipBias >= 1 || profileRelationshipCategoryBias >= 3,
                rejectGameDetail: profileGameDetailBias >= 1,
                requireStableProfile: profileOneOffBias >= 1,
                suppressSemanticBiasThreshold: 2,
                negativeSemanticKeys: normalizeNotebookCounterMap(profileBucket.negativeSemanticKeys),
                positiveSemanticKeys: normalizeNotebookCounterMap(profileBucket.positiveSemanticKeys),
                semanticKeys: normalizeNotebookCounterMap(profileBucket.semanticKeys)
            },
            mustRemember: {
                requireHighPriority: mustWeakPriorityBias >= 1,
                rejectGameDetail: mustGameDetailBias >= 1,
                rejectSelfFlavor: mustSelfFlavorBias >= 1,
                suppressSemanticBiasThreshold: 2,
                negativeSemanticKeys: normalizeNotebookCounterMap(mustBucket.negativeSemanticKeys),
                positiveSemanticKeys: normalizeNotebookCounterMap(mustBucket.positiveSemanticKeys),
                semanticKeys: normalizeNotebookCounterMap(mustBucket.semanticKeys)
            },
            redline: {
                requireExplicitBoundary: redlineImplicitBias >= 1,
                rejectGameDetail: redlineGameDetailBias >= 1,
                suppressSemanticBiasThreshold: 2,
                negativeSemanticKeys: normalizeNotebookCounterMap(redlineBucket.negativeSemanticKeys),
                positiveSemanticKeys: normalizeNotebookCounterMap(redlineBucket.positiveSemanticKeys),
                semanticKeys: normalizeNotebookCounterMap(redlineBucket.semanticKeys)
            }
        };
    }

    function buildNotebookLearningSummaryLines(profileOrRules) {
        const rules = profileOrRules && isPlainObject(profileOrRules)
            && isPlainObject(profileOrRules.profile)
            && isPlainObject(profileOrRules.mustRemember)
            && isPlainObject(profileOrRules.redline)
            ? profileOrRules
            : (profileOrRules && isPlainObject(profileOrRules.rules)
                ? profileOrRules.rules
                : buildNotebookLearningRules(profileOrRules));
        const lines = [];
        const repeatedSemanticSuppression = ['profile', 'mustRemember', 'redline'].some(function hasRepeatedSemanticSuppression(kindKey) {
            const bucket = rules && isPlainObject(rules[kindKey]) ? rules[kindKey] : null;
            const negativeSemanticKeys = bucket && isPlainObject(bucket.negativeSemanticKeys) ? bucket.negativeSemanticKeys : {};
            return Object.keys(negativeSemanticKeys).some(function hasStrongBias(key) {
                return getNotebookCounterValue(negativeSemanticKeys, key) >= 2;
            });
        });

        if (rules.profile && rules.profile.rejectWeakHabit) {
            lines.push('档案里的 habit 要更严格，只保留会影响照顾或回应的稳定习惯。');
        }
        if (rules.profile && rules.profile.rejectCharReaction) {
            lines.push('不要把角色自己的紧张、吃醋、兴奋、破防等即时反应记成用户习惯，也不要把称呼或关系站位写进用户档案。');
        }
        if (rules.profile && rules.profile.rejectSelfFlavor) {
            lines.push('不要写香味、香水、照片杀伤力、自夸人设这类角色私货或氛围碎片。');
        }
        if (rules.profile && rules.profile.rejectFlirtDetail) {
            lines.push('档案里不要再收录调情过程、性反应或角色上头细节，除非它已经稳定影响相处规则。');
        }
        if (rules.profile && rules.profile.rejectGameDetail) {
            lines.push('关于用户的档案不要再写游戏微观攻略、地点、机制、阵容和一次性进度细节。');
        }
        if (rules.mustRemember && rules.mustRemember.requireHighPriority) {
            lines.push('mustRemember 只留安全风险、重大冲突触发点、明确承诺、欠账和高后果事项。');
        }
        if (rules.redline && rules.redline.requireExplicitBoundary) {
            lines.push('redline 必须是明确禁止或带明显后果的话，普通抱怨和吐槽不要升级成红线。');
        }
        if (repeatedSemanticSuppression) {
            lines.push('如果用户已经反复删掉同一种主题，不要只换个说法再写回来；同义重复也算重复。');
        }
        return normalizeStringArray(lines);
    }

    function buildNotebookLearningFocusLines(profileOrRules) {
        const profile = profileOrRules && isPlainObject(profileOrRules)
            && isPlainObject(profileOrRules.byKind)
            ? normalizeNotebookLearningProfile(profileOrRules)
            : normalizeNotebookLearningProfile(
                profileOrRules && isPlainObject(profileOrRules.profile)
                    ? profileOrRules.profile
                    : null
            );
        const rules = profileOrRules && isPlainObject(profileOrRules)
            && isPlainObject(profileOrRules.profile)
            && isPlainObject(profileOrRules.mustRemember)
            && isPlainObject(profileOrRules.redline)
            ? profileOrRules
            : (profileOrRules && isPlainObject(profileOrRules.rules)
                ? profileOrRules.rules
                : buildNotebookLearningRules(profile));
        const lines = [];
        const profileBucket = profile.byKind.profile;
        const mustBucket = profile.byKind.mustRemember;
        const redlineBucket = profile.byKind.redline;
        const repeatedSemanticSuppression = ['profile', 'mustRemember', 'redline'].some(function hasRepeatedSemanticSuppression(kindKey) {
            const bucket = profile.byKind && profile.byKind[kindKey] ? profile.byKind[kindKey] : null;
            const negativeSemanticKeys = bucket && isPlainObject(bucket.negativeSemanticKeys) ? bucket.negativeSemanticKeys : {};
            return Object.keys(negativeSemanticKeys).some(function hasStrongBias(key) {
                return getNotebookCounterValue(negativeSemanticKeys, key) >= 2;
            });
        });

        const profileCharReactionCount = getNotebookCounterValue(profileBucket.negativeTags, 'profile_char_reaction');
        const profileSelfFlavorCount = getNotebookCounterValue(profileBucket.negativeTags, 'profile_self_flavor');
        const profileFlirtDetailCount = getNotebookCounterValue(profileBucket.negativeTags, 'profile_flirt_detail');
        const profileGameDetailCount = getNotebookCounterValue(profileBucket.negativeTags, 'profile_game_detail');
        const profileWeakHabitCount = Math.max(
            getNotebookCounterValue(profileBucket.negativeTags, 'profile_weak_habit'),
            getNotebookCounterValue(profileBucket.negativeCategories, 'profile:habit')
        );
        const mustWeakPriorityCount = getNotebookCounterValue(mustBucket.negativeTags, 'must_weak_priority');
        const mustGameDetailCount = getNotebookCounterValue(mustBucket.negativeTags, 'must_game_detail');
        const redlineImplicitCount = getNotebookCounterValue(redlineBucket.negativeTags, 'redline_implicit');

        if (profileCharReactionCount > 0 || (rules.profile && rules.profile.rejectCharReaction)) {
            lines.push(`档案最近学到：别把角色自己的紧张、吃醋、兴奋这类即时反应写成用户特征${profileCharReactionCount > 0 ? `（反馈${profileCharReactionCount}次）` : ''}。`);
        }
        if (profileSelfFlavorCount > 0 || (rules.profile && rules.profile.rejectSelfFlavor)) {
            lines.push(`档案最近学到：少记角色私货和氛围碎片，比如香味、照片杀伤力、自夸人设${profileSelfFlavorCount > 0 ? `（反馈${profileSelfFlavorCount}次）` : ''}。`);
        }
        if (profileFlirtDetailCount > 0 || (rules.profile && rules.profile.rejectFlirtDetail)) {
            lines.push(`档案最近学到：少记调情过程、性反应和上头细节${profileFlirtDetailCount > 0 ? `（反馈${profileFlirtDetailCount}次）` : ''}。`);
        }
        if (profileGameDetailCount > 0 || (rules.profile && rules.profile.rejectGameDetail)) {
            lines.push(`档案最近学到：少记游戏机制、地点、阵容、一次性进度这类微观细节${profileGameDetailCount > 0 ? `（反馈${profileGameDetailCount}次）` : ''}。`);
        }
        if (profileWeakHabitCount > 0 || (rules.profile && rules.profile.rejectWeakHabit)) {
            lines.push(`档案最近学到：习惯只留会影响照顾、提醒或回应方式的稳定习惯${profileWeakHabitCount > 0 ? `（反馈${profileWeakHabitCount}次）` : ''}。`);
        }
        if (mustWeakPriorityCount > 0 || (rules.mustRemember && rules.mustRemember.requireHighPriority)) {
            lines.push(`必记最近学到：只留高后果承诺、禁区、欠账和安全事项，别把普通细节抬成必记${mustWeakPriorityCount > 0 ? `（反馈${mustWeakPriorityCount}次）` : ''}。`);
        }
        if (mustGameDetailCount > 0 || (rules.mustRemember && rules.mustRemember.rejectGameDetail)) {
            lines.push(`必记最近学到：普通游戏攻略和流程细节不值得长期占位${mustGameDetailCount > 0 ? `（反馈${mustGameDetailCount}次）` : ''}。`);
        }
        if (redlineImplicitCount > 0 || (rules.redline && rules.redline.requireExplicitBoundary)) {
            lines.push(`红线最近学到：只收明确禁区和高风险信号，别把普通抱怨升级成红线${redlineImplicitCount > 0 ? `（反馈${redlineImplicitCount}次）` : ''}。`);
        }
        if (repeatedSemanticSuppression) {
            lines.push('系统最近学到：同一主题如果已经被反复删掉，不要只换个说法再写回来。');
        }
        return normalizeStringArray(lines).slice(0, 8);
    }

    function getNotebookLearningProfile(userId, charId, profileInput) {
        const safeUserId = resolveNotebookLearningUserId(userId);
        const safeCharId = toTrimmedString(charId);
        const normalized = profileInput !== undefined
            ? normalizeNotebookLearningProfile(profileInput, safeUserId, safeCharId)
            : readNotebookLearningProfileFromStorage(safeUserId, safeCharId);
        const rules = buildNotebookLearningRules(normalized);
        return Object.assign({}, normalized, {
            rules: rules,
            summaryLines: buildNotebookLearningSummaryLines(rules),
            focusLines: buildNotebookLearningFocusLines({
                profile: normalized,
                rules: rules
            })
        });
    }

    function buildNotebookLearningPromptBlock(userId, charId, profileInput) {
        const profile = getNotebookLearningProfile(userId, charId, profileInput);
        const summaryLines = Array.isArray(profile.summaryLines) ? profile.summaryLines : [];
        const focusLines = Array.isArray(profile.focusLines) ? profile.focusLines : [];
        if (profile.totals.feedbackCount <= 0 || (summaryLines.length <= 0 && focusLines.length <= 0)) return '';

        return [
            '以下是用户最近通过记事本手动操作沉淀出的抽象偏好反馈，只能当作提取约束，不能当作事实来源：',
            focusLines.length > 0 ? focusLines.map(function mapLine(line) {
                return `- ${line}`;
            }).join('\n') : '',
            summaryLines.map(function mapLine(line) {
                return `- ${line}`;
            }).join('\n'),
            '- 这些反馈只用于收紧记事本提取标准，不要引用、回忆或补写任何历史原话。'
        ].join('\n');
    }
    function shouldSuppressNotebookItemByLearning(kind, item, learningRules) {
        const safeKind = normalizeNotebookLearningKind(kind);
        const rules = learningRules && typeof learningRules === 'object' ? learningRules : null;
        const content = toTrimmedString(item && item.content);
        const combined = buildNotebookLearningCombinedText(safeKind, item);
        const kindRules = safeKind && rules && isPlainObject(rules[safeKind]) ? rules[safeKind] : null;
        if (!safeKind || !rules || !content) return false;

        const semanticKey = buildNotebookLearningSemanticKey(safeKind, item);
        const semanticBias = kindRules ? getNotebookLearningSemanticBias(kindRules, semanticKey) : 0;
        const semanticThreshold = kindRules
            ? Math.max(1, Math.floor(toFiniteNumber(kindRules.suppressSemanticBiasThreshold, 2)))
            : 2;
        if (semanticKey && semanticBias >= semanticThreshold) {
            return true;
        }

        if (safeKind === 'profile') {
            if (rules.profile && rules.profile.rejectCharReaction && isNotebookCharReaction(content)) return true;
            if (rules.profile && rules.profile.rejectSelfFlavor && (NOTEBOOK_LOW_VALUE_SENSORY_RE.test(content) || NOTEBOOK_SELF_FLAVOR_RE.test(content))) return true;
            if (
                rules.profile
                && rules.profile.rejectFlirtDetail
                && NOTEBOOK_FLIRT_OR_AROUSAL_RE.test(combined)
                && !NOTEBOOK_MAJOR_TRIGGER_RE.test(combined)
                && !NOTEBOOK_SAFETY_RE.test(combined)
                && (isNotebookCharReaction(content) || !NOTEBOOK_STABLE_PROFILE_RE.test(combined))
            ) {
                return true;
            }
            if (rules.profile && rules.profile.rejectWeakHabit && isNotebookWeakHabitProfile(item)) return true;
            if (rules.profile && rules.profile.requireStableRelationship && (item && item.category === 'relationship') && !isNotebookRelationshipAddress(content) && !NOTEBOOK_RELATIONSHIP_FROM_USER_RE.test(content)) return true;
            if (rules.profile && rules.profile.rejectGameDetail && isNotebookGameMicroFact(content) && !isNotebookConcretePreferenceText(content)) return true;
            if (rules.profile && rules.profile.requireStableProfile && NOTEBOOK_ONE_OFF_EVENT_RE.test(content) && !isNotebookConcretePreferenceText(content) && !isNotebookImportantHabitText(content)) return true;
            return false;
        }

        if (safeKind === 'mustRemember') {
            if (rules.mustRemember && rules.mustRemember.rejectSelfFlavor && (NOTEBOOK_LOW_VALUE_SENSORY_RE.test(combined) || NOTEBOOK_SELF_FLAVOR_RE.test(combined))) return true;
            if (rules.mustRemember && rules.mustRemember.rejectGameDetail && isNotebookGameMicroFact(combined) && !NOTEBOOK_IMPORTANCE_RE.test(combined)) return true;
            if (rules.mustRemember && rules.mustRemember.requireHighPriority && !NOTEBOOK_MAJOR_TRIGGER_RE.test(combined) && !NOTEBOOK_SAFETY_RE.test(combined) && !NOTEBOOK_PROMISE_DEBT_RE.test(combined)) return true;
            return false;
        }

        if (safeKind === 'redline') {
            if (rules.redline && rules.redline.rejectGameDetail && isNotebookGameMicroFact(combined)) return true;
            if (rules.redline && rules.redline.requireExplicitBoundary && !NOTEBOOK_BOUNDARY_RE.test(combined) && !NOTEBOOK_SAFETY_RE.test(combined)) return true;
            return false;
        }

        return false;
    }

    function recordNotebookFeedback(userId, charId, payload) {
        const safeUserId = resolveNotebookLearningUserId(userId);
        const safeCharId = toTrimmedString(charId);
        const source = isPlainObject(payload) ? payload : {};
        const action = normalizeNotebookLearningAction(source.action);
        const kind = normalizeNotebookLearningKind(source.kind);
        if (!safeUserId || !safeCharId || !action || !kind) {
            return getNotebookLearningProfile(safeUserId, safeCharId);
        }

        const beforeItem = isPlainObject(source.before)
            ? source.before
            : (isPlainObject(source.item) ? source.item : null);
        const afterItem = isPlainObject(source.after)
            ? source.after
            : ((action === 'manual_add' || action === 'confirm') ? beforeItem : null);
        const safeSource = toTrimmedString(source.source).toLowerCase();
        const safeReason = toTrimmedString(source.reason).toLowerCase();
        const extraWeight = (safeSource === 'suppressed' || safeReason === 'low_value' ? 1 : 0)
            + (action === 'batch_delete' ? 1 : 0);
        const baseWeight = Math.max(1, Math.floor(toFiniteNumber(source.weight, 1)));

        let profile = readNotebookLearningProfileFromStorage(safeUserId, safeCharId);
        if (action === 'delete' || action === 'batch_delete') {
            profile = applyNotebookLearningNegativeFeedback(profile, kind, beforeItem, action, baseWeight + extraWeight);
        } else if (action === 'manual_add') {
            profile = applyNotebookLearningPositiveFeedback(profile, kind, afterItem, action, baseWeight);
        } else if (action === 'confirm') {
            profile = applyNotebookLearningPositiveFeedback(profile, kind, afterItem || beforeItem, action, baseWeight);
        } else if (action === 'manual_edit') {
            if (beforeItem && afterItem && hasMaterialNotebookFeedbackChange(kind, beforeItem, afterItem)) {
                profile = applyNotebookLearningNegativeFeedback(profile, kind, beforeItem, action, baseWeight);
            }
            profile = applyNotebookLearningPositiveFeedback(profile, kind, afterItem || beforeItem, action, baseWeight);
        }

        profile.updatedAt = new Date().toISOString();
        writeNotebookLearningProfileToStorage(profile);
        return getNotebookLearningProfile(safeUserId, safeCharId, profile);
    }

    function resetNotebookLearningProfile(userId, charId) {
        const safeUserId = resolveNotebookLearningUserId(userId);
        const safeCharId = toTrimmedString(charId);
        const storage = resolveNotebookLearningStorage();
        if (safeUserId && safeCharId && storage) {
            try {
                storage.removeItem(buildNotebookLearningStorageKey(safeUserId, safeCharId));
            } catch (_) {
                // ignore storage reset failures
            }
        }
        return getNotebookLearningProfile(safeUserId, safeCharId);
    }

    /**
     * 过滤不够稳定、不是以用户为中心，或只是角色自嗨的档案条目。
     */
    function isLowValueProfileLike(item) {
        if (isNotebookConcretePreferenceText(item && item.content)) return false;
        if (isNotebookImportantHabitText(item && item.content)) return false;
        return scoreProfileNoteValue(item) < 3;
    }

    /**
     * 过滤没有达到长期高优先级门槛的必记条目。
     */
    function isLowValueMustRememberLike(item) {
        return scoreMustRememberValue(item) < 3;
    }

    /**
     * 过滤不够明确的红线/禁区条目。
     */
    function isLowValueRedlineLike(item) {
        return scoreRedlineValue(item) < 3;
    }

    /**
     * 对单类记事本条目做“可选低价值过滤 + 同主题去重”。
     */
    function pruneNotebookEntries(items, kind, isLowValueFn) {
        const source = Array.isArray(items) ? items : [];
        const result = [];

        for (let i = 0; i < source.length; i += 1) {
            const item = source[i];
            if (!item) continue;
            if (typeof isLowValueFn === 'function' && isLowValueFn(item)) continue;
            if (result.some(function findDuplicate(existingItem) {
                return isNotebookDuplicateEntry(existingItem, item, kind);
            })) {
                continue;
            }
            result.push(item);
        }

        return result;
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
            generatedAt: new Date().toISOString(),
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

    function buildNotebookCleanupItem(item, reason, kind, duplicateOf) {
        return {
            id: toTrimmedString(item && item.id),
            content: toTrimmedString(item && item.content),
            reason: toTrimmedString(reason) || 'low_value',
            kind: toTrimmedString(kind),
            duplicateOf: toTrimmedString(duplicateOf),
            category: toTrimmedString(item && item.category),
            phase: toTrimmedString(item && item.phase),
            severity: toTrimmedString(item && item.severity)
        };
    }

    function analyzePromptNotebookEntries(items, kind, isLowValueFn) {
        const source = Array.isArray(items) ? items.filter(Boolean) : [];
        const bucket = createEmptyNotebookCleanupBucket();
        const keptItems = [];

        for (let i = 0; i < source.length; i += 1) {
            const item = source[i];
            if (!item) continue;

            if (typeof isLowValueFn === 'function' && isLowValueFn(item)) {
                bucket.reasonCounts.low_value += 1;
                bucket.suppressedItems.push(buildNotebookCleanupItem(item, 'low_value', kind));
                continue;
            }

            const duplicateOf = keptItems.find(function findDuplicate(existingItem) {
                return isNotebookDuplicateEntry(existingItem, item, kind);
            });
            if (duplicateOf) {
                bucket.reasonCounts.duplicate += 1;
                bucket.suppressedItems.push(buildNotebookCleanupItem(item, 'duplicate', kind, duplicateOf && duplicateOf.id));
                continue;
            }

            keptItems.push(item);
        }

        bucket.totalCount = source.length;
        bucket.keptCount = keptItems.length;
        bucket.suppressedCount = bucket.suppressedItems.length;
        bucket.keptIds = keptItems.map(function mapKeptId(item) {
            return toTrimmedString(item && item.id);
        }).filter(Boolean);
        bucket.suppressedIds = bucket.suppressedItems.map(function mapSuppressedId(item) {
            return toTrimmedString(item && item.id);
        }).filter(Boolean);

        return {
            keptItems: keptItems,
            bucket: bucket
        };
    }

    function buildPromptNotebookAnalysis(notebook) {
        const safeNotebook = notebook && typeof notebook === 'object' ? notebook : createEmptyNotebook();
        const cleanupPreview = createEmptyNotebookCleanupPreview();

        const profileAnalysis = analyzePromptNotebookEntries(
            (Array.isArray(safeNotebook.profiles) ? safeNotebook.profiles : []).filter(function filterProfile(item) {
                const category = toTrimmedString(item && item.category).toLowerCase();
                return item
                    && item.is_active !== false
                    && !DEPRECATED_PROFILE_CATEGORIES.has(category)
                    && !isNotebookRelationshipProfileFact(item.content);
            }),
            'profile',
            isLowValueProfileLike
        );
        const mustAnalysis = analyzePromptNotebookEntries(
            (Array.isArray(safeNotebook.mustRemember) ? safeNotebook.mustRemember : []).filter(function filterMust(item) {
                return item && item.is_active !== false;
            }),
            'must',
            isLowValueMustRememberLike
        );
        const redlineAnalysis = analyzePromptNotebookEntries(
            (Array.isArray(safeNotebook.redlines) ? safeNotebook.redlines : []).filter(function filterRedline(item) {
                return item && item.is_active !== false;
            }),
            'redline',
            isLowValueRedlineLike
        );

        cleanupPreview.byKind.profile = profileAnalysis.bucket;
        cleanupPreview.byKind.mustRemember = mustAnalysis.bucket;
        cleanupPreview.byKind.redline = redlineAnalysis.bucket;

        ['profile', 'mustRemember', 'redline'].forEach(function sumKind(kindKey) {
            const bucket = cleanupPreview.byKind[kindKey];
            cleanupPreview.totalCount += Math.max(0, Number(bucket && bucket.totalCount) || 0);
            cleanupPreview.keptCount += Math.max(0, Number(bucket && bucket.keptCount) || 0);
            cleanupPreview.suppressedCount += Math.max(0, Number(bucket && bucket.suppressedCount) || 0);
        });

        return {
            promptNotebook: {
                profiles: profileAnalysis.keptItems,
                mustRemember: mustAnalysis.keptItems,
                redlines: redlineAnalysis.keptItems
            },
            cleanupPreview: cleanupPreview
        };
    }

    /**
     * 构建真正进入 Prompt 的记事本视图：状态板已由 48h 连续记忆和长期状态接管。
     */
    function buildPromptNotebookView(notebook) {
        return buildPromptNotebookAnalysis(notebook).promptNotebook;
    }

    /**
     * 在现有记事本里查找同主题重复项，供脱水回写前兜底去重。
     */
    function findExistingNotebookDuplicate(rows, candidate, kind) {
        const list = Array.isArray(rows) ? rows : [];
        for (let i = 0; i < list.length; i += 1) {
            const row = list[i];
            if (!row) continue;
            if (row.is_active === false) continue;
            if (isNotebookDuplicateEntry(row, candidate, kind)) return row;
        }
        return null;
    }

    /**
     * 为记事本 Prompt 文本生成稳定校验码，方便管理台和调试日志对照。
     */
    function computeNotebookPromptChecksum(text) {
        const safeText = toTrimmedString(text);
        if (!safeText) return '';

        let hash = 2166136261;
        for (let i = 0; i < safeText.length; i += 1) {
            hash ^= safeText.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }

        return (hash >>> 0).toString(36);
    }

    /**
     * 判断必记条目是否需要在整理版之外继续单独强调。
     */
    function isHighPriorityMustRemember(item) {
        const category = toTrimmedString(item && item.category).toLowerCase();
        return category === 'promise' || category === 'trigger' || category === 'health';
    }

    /**
     * 将结构化分组拼回可直接注入 Prompt 的文本。
     */
    function buildCompactedTextFromGroups(groups) {
        const source = Array.isArray(groups) ? groups : [];
        const blocks = [];
        source.forEach(function appendGroup(group) {
            const normalized = normalizeCompactionGroup(group);
            if (!normalized) return;
            const lines = [`◆ ${normalized.title}`];
            normalized.items.forEach(function appendItem(item) {
                lines.push(`- ${item}`);
            });
            blocks.push(lines.join('\n'));
        });
        return blocks.join('\n\n');
    }

    function parseCompactedTextGroups(text) {
        const lines = toTrimmedString(text).split(/\r?\n/);
        const groups = [];
        let current = null;

        function flushGroup() {
            if (!current) return;
            const normalized = normalizeCompactionGroup(current);
            if (normalized) groups.push(normalized);
            current = null;
        }

        lines.forEach(function parseLine(rawLine) {
            const line = toTrimmedString(rawLine);
            if (!line) return;
            if (/^【整理归档】$/.test(line)) return;
            const titleMatch = line.match(/^◆\s*(.+)$/);
            if (titleMatch) {
                flushGroup();
                current = {
                    title: titleMatch[1],
                    items: [],
                    source_indices: []
                };
                return;
            }
            if (!current) {
                current = {
                    title: '整理归档',
                    items: [],
                    source_indices: []
                };
            }
            current.items.push(line.replace(/^-\s*/, ''));
        });
        flushGroup();
        return groups;
    }

    function scoreCompactionGroupForPrompt(group, index) {
        const title = toTrimmedString(group && group.title);
        let score = 100 - Math.max(0, Math.floor(toFiniteNumber(index, 0)));
        if (/印象|整体|价值观|性格|边界|雷区|沟通|安全|健康|具体喜好|口味|偏好|必须|承诺/i.test(title)) score += 80;
        if (/日常|琐碎|重复|原文|新增/i.test(title)) score -= 20;
        return score;
    }

    function appendNotebookPromptLine(lines, line, budget, options) {
        const safeLine = toTrimmedString(line);
        if (!safeLine) return false;
        const opts = options && typeof options === 'object' ? options : {};
        const safeBudget = Math.max(0, Math.floor(toFiniteNumber(budget, 0)));
        if (!safeBudget) return false;
        const currentLength = lines.join('\n').length;
        const separatorLength = lines.length > 0 ? 1 : 0;
        const nextLength = currentLength + separatorLength + safeLine.length;
        const softOverflow = opts.allowOverflow
            ? Math.max(0, Math.floor(toFiniteNumber(opts.softOverflowChars, NOTEBOOK_PROMPT_SOFT_OVERFLOW_CHARS)))
            : 0;
        if (nextLength <= safeBudget + softOverflow) {
            lines.push(safeLine);
            return true;
        }
        const remaining = safeBudget - currentLength - separatorLength;
        if (remaining <= 0) return false;
        const allowClip = opts.allowClip === true;
        if (allowClip && remaining >= 28) {
            lines.push(clipNotebookText(safeLine, remaining));
            return true;
        }
        return false;
    }

    function buildPromptSafeCompactedText(compacted, budget) {
        const source = normalizeCompactedRecord(compacted);
        if (!source || !source.compacted_text) return '';
        const groups = (Array.isArray(source.groups) && source.groups.length > 0)
            ? source.groups
            : parseCompactedTextGroups(source.compacted_text);
        if (groups.length <= 0) {
            return clipNotebookText(source.compacted_text, budget);
        }

        const safeBudget = Math.max(160, Math.floor(toFiniteNumber(budget, NOTEBOOK_STABLE_MIN_BUDGET)));
        const sortedGroups = groups.map(function mapGroup(group, index) {
            return {
                group: normalizeCompactionGroup(group),
                index: index
            };
        }).filter(function keepGroup(item) {
            return !!item.group;
        }).sort(function sortGroup(left, right) {
            const scoreDelta = scoreCompactionGroupForPrompt(right.group, right.index) - scoreCompactionGroupForPrompt(left.group, left.index);
            if (scoreDelta !== 0) return scoreDelta;
            return left.index - right.index;
        }).slice(0, NOTEBOOK_COMPACTED_GROUP_LIMIT);

        const lines = ['【整理归档】'];
        for (let i = 0; i < sortedGroups.length; i += 1) {
            const group = sortedGroups[i].group;
            const title = clipNotebookText(group.title || '未命名分组', 32);
            const nextLines = lines.slice();
            if (!appendNotebookPromptLine(nextLines, `◆ ${title}`, safeBudget, {
                allowClip: false,
                allowOverflow: true
            })) break;
            const items = (Array.isArray(group.items) ? group.items : [])
                .map(function mapItem(item) {
                    return toTrimmedString(item);
                })
                .filter(Boolean)
                .slice(0, NOTEBOOK_COMPACTED_ITEMS_PER_GROUP_LIMIT);
            let appendedInGroup = 0;
            for (let j = 0; j < items.length; j += 1) {
                if (!appendNotebookPromptLine(nextLines, `- ${items[j]}`, safeBudget, {
                    allowClip: false,
                    allowOverflow: true
                })) continue;
                appendedInGroup += 1;
            }
            if (appendedInGroup <= 0) continue;
            lines.length = 0;
            nextLines.forEach(function appendLine(item) {
                lines.push(item);
            });
            if (lines.join('\n').length >= safeBudget + NOTEBOOK_PROMPT_SOFT_OVERFLOW_CHARS) break;
        }

        return lines.length > 1 ? lines.join('\n') : '';
    }

    function buildMustRememberPromptText(items, title, budget, limit, options) {
        const opts = options && typeof options === 'object' ? options : {};
        const minScore = Number.isFinite(opts.minScore) ? opts.minScore : -Infinity;
        const source = (Array.isArray(items) ? items.filter(Boolean) : []).filter(function filterMustForPrompt(item) {
            return scoreMustRememberValue(item) >= minScore;
        });
        if (source.length <= 0) return '';
        const lines = [title || '【这些事你必须一直记得】'];
        const maxItems = Math.max(1, Math.floor(toFiniteNumber(limit, NOTEBOOK_UNCOMPACTED_MUST_LIMIT)));
        const safeBudget = Math.max(120, Math.floor(toFiniteNumber(budget, 240)));
        const sorted = source.slice().sort(function sortMust(left, right) {
            return scoreMustRememberValue(right) - scoreMustRememberValue(left);
        }).slice(0, maxItems);
        for (let i = 0; i < sorted.length; i += 1) {
            if (!appendNotebookPromptLine(lines, `- ${toTrimmedString(sorted[i].content)}`, safeBudget, {
                allowClip: false,
                allowOverflow: true
            })) continue;
        }
        return lines.length > 1 ? lines.join('\n') : '';
    }

    function isConcretePreferenceProfile(item) {
        const category = toTrimmedString(item && item.category).toLowerCase();
        const content = toTrimmedString(item && item.content);
        if (!content) return false;
        if (category === 'identity') {
            return !isNotebookCharLeadingContent(content)
                && !NOTEBOOK_LOW_VALUE_SENSORY_RE.test(content)
                && (NOTEBOOK_USER_FOCUS_RE.test(content) || NOTEBOOK_USER_SELF_ANCHOR_RE.test(content));
        }
        if (category === 'preference') return isNotebookConcretePreferenceText(content);
        if (category === 'habit') return isNotebookImportantHabitText(content);
        return false;
    }

    function buildProfilesPromptText(items, title, budget, limit) {
        const source = (Array.isArray(items) ? items : [])
            .filter(Boolean)
            .filter(isConcretePreferenceProfile);
        if (source.length <= 0) return '';
        const lines = [title || '【具体喜好/重要习惯】'];
        const maxItems = Math.max(1, Math.floor(toFiniteNumber(limit, NOTEBOOK_UNCOMPACTED_PROFILE_LIMIT)));
        const safeBudget = Math.max(120, Math.floor(toFiniteNumber(budget, 260)));
        const sorted = source.slice().sort(function sortProfile(left, right) {
            const leftScore = scoreProfileNoteValue(left) + (left.category === 'identity' ? 2 : 0);
            const rightScore = scoreProfileNoteValue(right) + (right.category === 'identity' ? 2 : 0);
            return rightScore - leftScore;
        }).slice(0, maxItems);
        for (let i = 0; i < sorted.length; i += 1) {
            const suffix = sorted[i].confidence === 'uncertain' ? '（不确定）' : '';
            const label = getProfileCategoryLabel(sorted[i].category);
            if (!appendNotebookPromptLine(lines, `- ${label}：${toTrimmedString(sorted[i].content)}${suffix}`, safeBudget, {
                allowClip: false,
                allowOverflow: true
            })) continue;
        }
        return lines.length > 1 ? lines.join('\n') : '';
    }

    /**
     * 给整理提示词准备带 M/P 序号的原始条目。
     */
    function buildNotebookCompactionEntries(notebook) {
        const safeNotebook = notebook && typeof notebook === 'object' ? notebook : createEmptyNotebook();
        const mustRemember = (Array.isArray(safeNotebook.mustRemember) ? safeNotebook.mustRemember : [])
            .filter(function filterMust(item) {
                return item && item.is_active !== false;
            });
        const profiles = (Array.isArray(safeNotebook.profiles) ? safeNotebook.profiles : [])
            .filter(function filterProfile(item) {
                const category = toTrimmedString(item && item.category).toLowerCase();
                return item
                    && item.is_active !== false
                    && !DEPRECATED_PROFILE_CATEGORIES.has(category)
                    && !isNotebookRelationshipProfileFact(item.content);
            });
        const entries = [];
        mustRemember.forEach(function appendMust(item, index) {
            entries.push({
                index: `M${index + 1}`,
                kind: 'mustRemember',
                id: toTrimmedString(item.id),
                content: toTrimmedString(item.content),
                category: toTrimmedString(item.category)
            });
        });
        profiles.forEach(function appendProfile(item, index) {
            entries.push({
                index: `P${index + 1}`,
                kind: 'profile',
                id: toTrimmedString(item.id),
                content: toTrimmedString(item.content),
                category: toTrimmedString(item.category),
                confidence: toTrimmedString(item.confidence)
            });
        });
        return {
            mustRemember: mustRemember,
            profiles: profiles,
            entries: entries
        };
    }

    /**
     * 生成整理用提示词：把散碎条目压成可注入的用户印象与少量具体偏好。
     */
    function buildCompactionPrompt(notebook, existingCompacted) {
        const safeNotebook = notebook && typeof notebook === 'object' ? notebook : createEmptyNotebook();
        const compacted = normalizeCompactedRecord(existingCompacted);
        const material = buildNotebookCompactionEntries(safeNotebook);
        const allSourceIndices = material.entries.map(function mapEntryIndex(entry) {
            return toTrimmedString(entry && entry.index);
        }).filter(Boolean);
        const redlines = (Array.isArray(safeNotebook.redlines) ? safeNotebook.redlines : [])
            .filter(function filterRedline(item) {
                return item && item.is_active !== false;
            });
        const redlineLines = redlines.length > 0
            ? redlines.map(function mapRedline(item, index) {
                return `R${index + 1}. ${toTrimmedString(item.content)}`;
            }).join('\n')
            : '无';
        const mustLines = material.mustRemember.length > 0
            ? material.mustRemember.map(function mapMust(item, index) {
                return `[M${index + 1}] ${toTrimmedString(item.content)}`;
            }).join('\n')
            : '无';
        const profileLines = material.profiles.length > 0
            ? material.profiles.map(function mapProfile(item, index) {
                const label = getProfileCategoryLabel(item.category);
                const suffix = item.confidence === 'uncertain' ? '（不确定）' : '';
                return `[P${index + 1}] ${label}：${toTrimmedString(item.content)}${suffix}`;
            }).join('\n')
            : '无';
        const existingText = compacted && compacted.compacted_text
            ? compacted.compacted_text
            : '无';
        const existingTitles = compacted && Array.isArray(compacted.groups)
            ? compacted.groups.map(function mapTitle(group) {
                return toTrimmedString(group && group.title);
            }).filter(Boolean).join('、')
            : '';

        return [
            '你的任务是把一份过度膨胀的记事本整理成“可注入主聊天 Prompt 的长期用户认知”。',
            '这份记事本来自 AI 角色和用户的长期相处记录。现在问题不是缺信息，而是重复、琐碎、过度逐条记忆，导致主 Prompt 变胖。',
            '',
            '【你的角色】',
            '你是记忆整理员，目标是让角色形成对用户的自然长期印象。',
            '你不是心理医生：不要诊断用户，不要给用户贴病理标签，不要断言隐藏动机，也不要写成心理侧写报告。',
            '你可以写“角色对用户的印象是……”，但必须保持克制：这是相处后形成的可修正印象，不是真理判决。',
            '',
            '【整理原则】',
            '1. 以“整体印象”为主：性格、价值观、沟通边界、关系安全感、生活方式倾向等，不要一条一条照抄，要合并成少量自然印象。',
            '2. 具体喜好可以保留：明确的食物、作品、长期爱好、互动偏好、雷区词、重要信物、重要事实，可以保留为短条目。不要为了压缩把已经很具体的喜好删没。',
            '3. 重要习惯可以保留：会影响照顾、提醒、回应方式或长期相处节奏的稳定习惯，可以短条保留；普通日常动作和临时反应不要逐条保留。',
            '4. 琐碎日常不要原样堆叠：一次性的随口话、短暂情绪、普通承诺、重复说法，应吸收到印象里；没有长期作用的可以不写进 compacted_text。',
            '5. 覆盖不等于复制：source_indices 必须覆盖每个 M/P 编号，但含义是“这条原文被某个印象或具体偏好吸收过”，不是要求原文逐字出现。',
            '6. 红线铁则不参与整理，只作为去重参考；如果必记/档案与红线完全重复，整理文本里不需要重复写。',
            '7. 不添加原文没有的信息；可以概括共性，但不能编造原因、创伤、身份、经历或用户没有确认过的事实。',
            '8. 全文使用第三人称“用户/角色”，不要使用“我/你/我们”来制造视角混乱。',
            compacted
                ? `9. 已有整理分组为：${existingTitles || '无标题分组'}。新条目优先吸收到已有分组，确实出现新主题时再新建分组。`
                : '9. 一般整理为 3-6 个分组，每组 1-3 条；不要拆成流水账。',
            `10. source_indices 必须覆盖全部原始条目编号：${allSourceIndices.join(', ') || '无'}。每个 M/P 编号至少出现在一个分组里，否则这次整理会被程序拒绝。`,
            '11. compacted_text 目标是 1000 字左右的短文本；可以略微超过，但不要膨胀成几千字，也不要为了凑长度删掉明确喜好或重要习惯。',
            '',
            '【已有整理结果】',
            existingText,
            '',
            '【红线铁则】（不参与整理，仅供去重参考）',
            redlineLines,
            '',
            '【必须牢记事项】',
            mustLines,
            '',
            '【原始档案条目】',
            profileLines,
            '',
            '【输出格式】',
            '只输出 JSON，不要输出解释文字：',
            '{',
            '  "groups": [',
            '    {',
            '      "title": "用户印象/具体偏好/边界等分组名",',
            '      "items": ["高密度整理后的印象或具体条目1", "高密度整理后的印象或具体条目2"],',
            '      "source_indices": ["M1", "P3"]',
            '    }',
            '  ],',
            '  "compacted_text": "◆ 分组名\\n- 高密度整理后的印象或具体条目1\\n- 高密度整理后的印象或具体条目2"',
            '}',
            '',
            `原始条目一共 ${material.entries.length} 条（不含红线）。目标是去重复、降体量、形成自然印象，而不是复制一份更长的记事本。`
        ].join('\n');
    }

    /**
     * 生成补齐漏整理条目的提示词。
     */
    function buildCompactionCompletionPrompt(parsed, material, missingEntries) {
        const safeParsed = parsed && typeof parsed === 'object' ? parsed : { groups: [], compactedText: '' };
        const safeMaterial = material && typeof material === 'object' ? material : { entries: [] };
        const missing = Array.isArray(missingEntries) ? missingEntries : [];
        const allSourceIndices = (Array.isArray(safeMaterial.entries) ? safeMaterial.entries : []).map(function mapEntryIndex(entry) {
            return toTrimmedString(entry && entry.index);
        }).filter(Boolean);
        const missingLines = missing.length > 0
            ? missing.map(function mapMissing(entry) {
                const label = entry.kind === 'profile' ? getProfileCategoryLabel(entry.category) : '必须牢记';
                return `[${entry.index}] ${label}：${entry.content}`;
            }).join('\n')
            : '无';

        return [
            '上一轮“记事本整理”的 source_indices 只覆盖了一部分原始条目。',
            '你的任务是保留已有整理结果，并把漏掉的编号吸收到合适分组里。',
            '',
            '【绝对限制】',
            '1. 不要删除已有分组和已有条目。',
            '2. 优先把漏掉的 source_indices 加入能代表它们的现有印象/具体偏好分组。',
            '3. 必要时只补一条高密度概括，不要逐条抄原文，不要把后半段原文搬进整理结果。',
            '4. 不添加原始记录里没有的信息，不做心理诊断，不贴病理标签，不断言隐藏动机。',
            `5. 最终 source_indices 必须覆盖全部编号：${allSourceIndices.join(', ') || '无'}。`,
            '6. compacted_text 仍要保持短而高密度，目标是给主聊天 Prompt 注入，不是存档全文。',
            '7. 只输出 JSON，不要输出解释、Markdown 代码块或额外文字。',
            '',
            '【当前整理结果 JSON】',
            JSON.stringify({
                groups: Array.isArray(safeParsed.groups) ? safeParsed.groups : [],
                compacted_text: toTrimmedString(safeParsed.compactedText)
            }, null, 2),
            '',
            '【漏掉的原始条目】',
            missingLines,
            '',
            '【必须输出的 JSON 结构】',
            '{',
            '  "groups": [',
            '    {',
            '      "title": "分组名",',
            '      "items": ["整理后的条目1", "整理后的条目2"],',
            '      "source_indices": ["M1", "P3"]',
            '    }',
            '  ],',
            '  "compacted_text": "◆ 分组名\\n- 整理后的条目1\\n- 整理后的条目2"',
            '}'
        ].join('\n');
    }

    /**
     * 从 LLM 输出中提取 JSON 候选文本。
     */
    function extractCompactionJsonCandidate(rawText) {
        const safe = toTrimmedString(rawText);
        if (!safe) return '';
        const fencedMatch = safe.match(/```(?:json)?\s*([\s\S]*?)```/i);
        if (fencedMatch && fencedMatch[1]) return toTrimmedString(fencedMatch[1]);
        const firstBracket = safe.indexOf('[');
        const lastBracket = safe.lastIndexOf(']');
        const firstBrace = safe.indexOf('{');
        const lastBrace = safe.lastIndexOf('}');
        if (firstBracket >= 0 && lastBracket > firstBracket && (firstBrace < 0 || firstBracket < firstBrace)) {
            return safe.slice(firstBracket, lastBracket + 1);
        }
        if (firstBrace >= 0 && lastBrace > firstBrace) {
            return safe.slice(firstBrace, lastBrace + 1);
        }
        if (firstBracket >= 0 && lastBracket > firstBracket) {
            return safe.slice(firstBracket, lastBracket + 1);
        }
        return safe;
    }

    /**
     * 解析整理模型返回。
     */
    function parseCompactionResponse(responseText) {
        const candidate = extractCompactionJsonCandidate(responseText);
        if (!candidate) return null;
        const parsed = parseNotebookJsonLike(candidate, null);
        if (!isPlainObject(parsed) && !Array.isArray(parsed)) return null;
        const rawGroups = Array.isArray(parsed)
            ? parsed
            : (parsed.groups || parsed.grouped_items || parsed.groupedItems || parsed.items);
        const groups = normalizeRecordArray(rawGroups).map(normalizeCompactionGroup).filter(Boolean);
        if (groups.length <= 0) return null;
        const compactedText = !Array.isArray(parsed)
            && toTrimmedString(parsed.compacted_text || parsed.compactedText || parsed.text || parsed.result)
            || buildCompactedTextFromGroups(groups);
        if (!compactedText) return null;
        return {
            compactedText: compactedText,
            groups: groups
        };
    }

    /**
     * 生成整理返回的格式修复提示词。
     * 这里不是兜底生成，只允许把模型上一轮已经写出的整理结果修成可解析 JSON。
     */
    function buildCompactionRepairPrompt(rawOutput) {
        return [
            '上一轮“记事本整理”已经返回了内容，但格式不是程序可解析的 JSON。',
            '你的任务只是不改变内容地修复格式。',
            '',
            '【绝对限制】',
            '1. 只修复 JSON 格式，不改写、不新增、不删除任何条目。',
            '2. 不重新整理，不重新总结，不补充上一轮没有写出的信息。',
            '3. 如果上一轮内容里完全无法识别整理分组，就输出空 groups 和空 compacted_text。',
            '4. 只输出 JSON，不要输出解释、Markdown 代码块或额外文字。',
            '',
            '【必须输出的 JSON 结构】',
            '{',
            '  "groups": [',
            '    {',
            '      "title": "分组名",',
            '      "items": ["条目1", "条目2"],',
            '      "source_indices": ["M1", "P2"]',
            '    }',
            '  ],',
            '  "compacted_text": "◆ 分组名\\n- 条目1\\n- 条目2"',
            '}',
            '',
            '【上一轮原始返回】',
            clipNotebookText(rawOutput, 12000)
        ].join('\n');
    }

    /**
     * 规范化主聊天 API 配置。
     */
    function normalizeCompactionApiConfig(apiConfig) {
        const source = apiConfig && typeof apiConfig === 'object' ? apiConfig : {};
        return {
            apiUrl: toTrimmedString(source.apiUrl || source.url || source.baseUrl),
            apiKey: toTrimmedString(source.apiKey || source.key),
            model: toTrimmedString(source.model || source.modelName),
            temperature: Math.max(0, Math.min(2, toFiniteNumber(source.temperature, NOTEBOOK_COMPACTION_DEFAULT_TEMPERATURE))),
            maxTokens: Math.max(512, Math.floor(toFiniteNumber(source.maxTokens || source.max_tokens, NOTEBOOK_COMPACTION_DEFAULT_MAX_TOKENS))),
            headers: isPlainObject(source.headers) ? Object.assign({}, source.headers) : {},
            requestBody: isPlainObject(source.requestBody) ? Object.assign({}, source.requestBody) : {}
        };
    }

    /**
     * 兼容 OpenAI 风格接口地址。
     */
    function normalizeCompactionChatCompletionsUrl(rawUrl) {
        const safe = toTrimmedString(rawUrl);
        if (!safe) return '';
        const lower = safe.toLowerCase();
        if (lower.endsWith('/chat/completions')) return safe;
        if (lower.endsWith('/v1')) return safe + '/chat/completions';
        if (lower.endsWith('/v1/')) return safe + 'chat/completions';
        if (safe.endsWith('/')) return safe + 'chat/completions';
        return safe + '/chat/completions';
    }

    /**
     * 读取 fetch 实现。
     */
    function getCompactionFetchImplementation() {
        if (root && typeof root.fetch === 'function') return root.fetch.bind(root);
        if (typeof globalThis !== 'undefined' && typeof globalThis.fetch === 'function') {
            return globalThis.fetch.bind(globalThis);
        }
        return null;
    }

    /**
     * 从常见大模型响应结构里抽取文本。
     */
    function extractCompactionResponseText(payload, depth) {
        const safeDepth = Math.max(0, Math.floor(toFiniteNumber(depth, 0)));
        if (safeDepth > 6) return '';
        if (typeof payload === 'string') return payload;
        if (!payload || typeof payload !== 'object') return '';
        if (typeof payload.output_text === 'string') return payload.output_text;
        if (typeof payload.text === 'string') return payload.text;
        if (Array.isArray(payload.choices) && payload.choices[0]) {
            const choice = payload.choices[0];
            const messageText = extractCompactionResponseText(choice.message, safeDepth + 1);
            if (messageText) return messageText;
            if (typeof choice.text === 'string') return choice.text;
        }
        if (Array.isArray(payload.content)) {
            return payload.content.map(function mapPart(part) {
                return typeof part === 'string'
                    ? part
                    : extractCompactionResponseText(part, safeDepth + 1);
            }).filter(Boolean).join('\n');
        }
        if (typeof payload.content === 'string') return payload.content;
        return '';
    }

    /**
     * 调用主聊天 API 执行整理。
     */
    async function requestCompactionDecision(prompt, apiConfig) {
        const fetchImpl = getCompactionFetchImplementation();
        const config = normalizeCompactionApiConfig(apiConfig);
        if (!fetchImpl || !config.apiUrl || !config.model) {
            throw new Error('notebook_compaction_api_not_configured');
        }

        const requestUrl = normalizeCompactionChatCompletionsUrl(config.apiUrl);
        if (!requestUrl) {
            throw new Error('notebook_compaction_api_invalid_url');
        }

        const headers = Object.assign({ 'Content-Type': 'application/json' }, config.headers);
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
        const payload = parseNotebookJsonLike(rawText, rawText);
        return extractCompactionResponseText(payload) || rawText;
    }

    /**
     * 把模型返回的 source_indices 映射回原始条目 ID。
     */
    function collectCompactionSourceIds(groups, material) {
        const sourceGroups = Array.isArray(groups) ? groups : [];
        const entryMap = new Map();
        const safeMaterial = material && typeof material === 'object' ? material : { entries: [] };
        (Array.isArray(safeMaterial.entries) ? safeMaterial.entries : []).forEach(function mapEntry(entry) {
            entryMap.set(toTrimmedString(entry.index), entry);
        });

        const profileIds = [];
        const mustRememberIds = [];
        const seenProfileIds = new Set();
        const seenMustIds = new Set();

        sourceGroups.forEach(function readGroup(group) {
            const normalized = normalizeCompactionGroup(group);
            if (!normalized) return;
            normalized.source_indices.forEach(function mapIndex(index) {
                const entry = entryMap.get(toTrimmedString(index));
                if (!entry || !entry.id) return;
                if (entry.kind === 'profile' && !seenProfileIds.has(entry.id)) {
                    seenProfileIds.add(entry.id);
                    profileIds.push(entry.id);
                } else if (entry.kind === 'mustRemember' && !seenMustIds.has(entry.id)) {
                    seenMustIds.add(entry.id);
                    mustRememberIds.push(entry.id);
                }
            });
        });

        if (profileIds.length <= 0 && mustRememberIds.length <= 0) {
            (Array.isArray(safeMaterial.entries) ? safeMaterial.entries : []).forEach(function appendAll(entry) {
                if (!entry || !entry.id) return;
                if (entry.kind === 'profile') profileIds.push(entry.id);
                if (entry.kind === 'mustRemember') mustRememberIds.push(entry.id);
            });
        }

        return {
            profileIds: profileIds,
            mustRememberIds: mustRememberIds
        };
    }

    /**
     * 检查整理分组是否覆盖了全部原始条目。
     */
    function getCompactionCoverageReport(groups, material) {
        const safeMaterial = material && typeof material === 'object' ? material : { entries: [] };
        const entries = Array.isArray(safeMaterial.entries) ? safeMaterial.entries : [];
        const entryMap = new Map();
        entries.forEach(function mapEntry(entry) {
            const index = toTrimmedString(entry && entry.index);
            if (index) entryMap.set(index, entry);
        });

        const covered = new Set();
        (Array.isArray(groups) ? groups : []).forEach(function readGroup(group) {
            const normalized = normalizeCompactionGroup(group);
            if (!normalized) return;
            normalized.source_indices.forEach(function markCovered(index) {
                const safeIndex = toTrimmedString(index);
                if (entryMap.has(safeIndex)) covered.add(safeIndex);
            });
        });

        const missingEntries = entries.filter(function filterMissing(entry) {
            const index = toTrimmedString(entry && entry.index);
            return index && !covered.has(index);
        });

        return {
            total: entries.length,
            covered: covered.size,
            missing: missingEntries.length,
            missingEntries: missingEntries
        };
    }

    /**
     * 确保整理结果没有只覆盖前半段。
     */
    async function completeCompactionCoverage(parsed, material, apiConfig) {
        let safeParsed = parsed;
        let report = getCompactionCoverageReport(safeParsed && safeParsed.groups, material);
        if (report.total <= 0 || report.missing <= 0) {
            return {
                parsed: safeParsed,
                report: report,
                completed: false
            };
        }

        console.warn(
            `[海马体][记事本] 警告 整理只覆盖 ${report.covered}/${report.total} 条，尝试补齐漏掉的 ${report.missing} 条。`
        );
        const completionPrompt = buildCompactionCompletionPrompt(safeParsed, material, report.missingEntries);
        const completionText = await requestCompactionDecision(completionPrompt, apiConfig);
        const completedParsed = parseCompactionResponse(completionText);
        if (!completedParsed) {
            throw new Error(`notebook_compaction_incomplete_unparseable: ${clipNotebookText(completionText, 240)}`);
        }

        safeParsed = completedParsed;
        report = getCompactionCoverageReport(safeParsed.groups, material);
        if (report.missing > 0) {
            const missingPreview = report.missingEntries.slice(0, 8).map(function mapMissing(entry) {
                return toTrimmedString(entry && entry.index);
            }).filter(Boolean).join(', ');
            throw new Error(`notebook_compaction_incomplete: covered ${report.covered}/${report.total}, missing ${missingPreview || report.missing}`);
        }

        return {
            parsed: safeParsed,
            report: report,
            completed: true
        };
    }

    /**
     * 构建“记事本 Prompt 快照”，同时保留文本、条数统计与轻量预览。
     */
    function buildNotebookPromptSnapshot(notebook) {
        const safeNotebook = notebook && typeof notebook === 'object' ? notebook : createEmptyNotebook();
        const analysis = buildPromptNotebookAnalysis(safeNotebook);
        let promptNotebook = analysis.promptNotebook;
        const compacted = normalizeCompactedRecord(safeNotebook.compacted);
        let profiles = Array.isArray(promptNotebook.profiles) ? promptNotebook.profiles : [];
        let mustRemember = Array.isArray(promptNotebook.mustRemember) ? promptNotebook.mustRemember : [];
        const redlines = Array.isArray(promptNotebook.redlines) ? promptNotebook.redlines : [];

        const promptSections = [];
        const critical = redlines.filter(function filterCritical(item) {
            return item && item.severity === 'critical';
        });
        const important = redlines.filter(function filterImportant(item) {
            return item && item.severity === 'important';
        });
        const reminder = redlines.filter(function filterReminder(item) {
            return item && item.severity === 'reminder';
        });

        let redlinesText = '';
        if (critical.length > 0 || important.length > 0 || reminder.length > 0) {
            const lines = ['【红线铁则】'];
            if (critical.length > 0) {
                lines.push('【绝对不可以】');
                critical.forEach(function appendCritical(item) {
                    lines.push(`- ${item.content}`);
                });
            }
            if (important.length > 0) {
                lines.push('【重要提醒】');
                important.forEach(function appendImportant(item) {
                    lines.push(`- ${item.content}`);
                });
            }
            if (reminder.length > 0) {
                lines.push('【留意】');
                reminder.forEach(function appendReminder(item) {
                    lines.push(`- ${item.content}`);
                });
            }
            redlinesText = lines.join('\n');
            promptSections.push(redlinesText);
        }

        const redlineOverhead = redlinesText ? redlinesText.length + 2 : 0;
        const stableBudget = Math.max(
            NOTEBOOK_STABLE_MIN_BUDGET,
            NOTEBOOK_PROMPT_TARGET_CHARS - redlineOverhead
        );

        let compactedText = '';
        let uncompactedMustRemember = [];
        let uncompactedProfiles = [];
        let highPriorityMustRemember = [];
        if (compacted && compacted.compacted_text) {
            const compactedBudget = Math.max(
                260,
                Math.floor(stableBudget * 0.72)
            );
            compactedText = buildPromptSafeCompactedText(compacted, compactedBudget);
            if (compactedText) {
                promptSections.push(compactedText);
            }

            uncompactedMustRemember = mustRemember.filter(function filterUncompactedMust(item) {
                return item && !item.compacted_at;
            });
            uncompactedProfiles = profiles.filter(function filterUncompactedProfile(item) {
                return item && !item.compacted_at;
            });
            highPriorityMustRemember = mustRemember.filter(isHighPriorityMustRemember);

            const seenMustIds = new Set();
            mustRemember = uncompactedMustRemember.concat(highPriorityMustRemember).filter(function uniqueMust(item) {
                const key = toTrimmedString(item && item.id) || normalizeNotebookCompareText(item && item.content);
                if (!key || seenMustIds.has(key)) return false;
                seenMustIds.add(key);
                return true;
            });
            profiles = uncompactedProfiles;
            promptNotebook = Object.assign({}, promptNotebook, {
                compacted: compacted,
                mustRemember: mustRemember,
                profiles: profiles
            });
        }

        const remainingStableBudget = Math.max(
            180,
            stableBudget - (compactedText ? compactedText.length + 2 : 0)
        );
        const mustRememberBudget = compacted
            ? Math.max(120, Math.floor(remainingStableBudget * 0.5))
            : Math.max(180, Math.floor(stableBudget * 0.45));
        const profilesBudget = compacted
            ? Math.max(120, remainingStableBudget - mustRememberBudget)
            : Math.max(180, stableBudget - mustRememberBudget);
        const mustRememberMinScore = compacted ? 0 : -Infinity;

        let mustRememberText = '';
        mustRemember = mustRemember.filter(function filterMustForPromptCount(item) {
            return scoreMustRememberValue(item) >= mustRememberMinScore;
        });
        mustRememberText = buildMustRememberPromptText(
            mustRemember,
            compacted ? '【新增/高优先级必记】' : '【这些事你必须一直记得】',
            mustRememberBudget,
            compacted ? NOTEBOOK_UNCOMPACTED_MUST_LIMIT : Math.max(NOTEBOOK_UNCOMPACTED_MUST_LIMIT, 8),
            { minScore: -Infinity }
        );
        if (mustRememberText) {
            promptSections.push(mustRememberText);
        }

        let profilesText = '';
        profiles = profiles.filter(isConcretePreferenceProfile);
        profilesText = buildProfilesPromptText(
            profiles,
            compacted ? '【新增具体喜好/重要习惯】' : '【具体喜好/重要习惯】',
            profilesBudget,
            compacted ? NOTEBOOK_UNCOMPACTED_PROFILE_LIMIT : Math.max(NOTEBOOK_UNCOMPACTED_PROFILE_LIMIT, 10)
        );
        if (profilesText) {
            promptSections.push(profilesText);
        }

        promptNotebook = Object.assign({}, promptNotebook, {
            compacted: compacted || null,
            mustRemember: mustRemember,
            profiles: profiles
        });

        const stableNotebookText = [compactedText, mustRememberText, profilesText].filter(Boolean).join('\n\n');
        const text = promptSections.length > 0 ? `[记事本]\n${promptSections.join('\n\n')}` : '';
        const counts = summarizeNotebookCounts(promptNotebook);
        const rawCounts = summarizeNotebookCounts(safeNotebook);
        const lines = text ? text.split(/\r?\n/) : [];

        return {
            notebook: safeNotebook,
            promptNotebook: promptNotebook,
            cleanupPreview: analysis.cleanupPreview,
            text: text,
            counts: counts,
            rawCounts: rawCounts,
            sectionCounts: {
                criticalRedlines: critical.length,
                importantRedlines: important.length,
                reminderRedlines: reminder.length,
                mustRemember: mustRemember.length,
                profiles: profiles.length,
                compactedGroups: compacted ? compacted.groups.length : 0,
                uncompactedMustRemember: uncompactedMustRemember.length,
                uncompactedProfiles: uncompactedProfiles.length,
                highPriorityMustRemember: highPriorityMustRemember.length
            },
            charLength: text.length,
            lineCount: lines.length,
            preview: lines.slice(0, 12).join('\n'),
            checksum: computeNotebookPromptChecksum(text),
            isEmpty: !text,
            sections: {
                redlinesText: redlinesText,
                compactedText: compactedText,
                mustRememberText: mustRememberText,
                profilesText: profilesText,
                stableNotebookText: stableNotebookText,
                text: text
            }
        };
    }
    /**
     * 拉取记事本后直接生成 Prompt 快照，供主聊天 / 管理台 / context builder 共用。
     */
    async function fetchNotebookPromptSnapshot(supabase, userId, charId) {
        const notebook = await fetchNotebook(supabase, userId, charId);
        const snapshot = buildNotebookPromptSnapshot(notebook);
        return Object.assign({}, snapshot, {
            notebook: notebook
        });
    }

    /**
     * 拉取指定角色的整份记事本。
     */
    async function fetchNotebook(supabase, userId, charId) {
        const safeSupabase = resolveSupabaseClient(supabase);
        const safeUserId = toTrimmedString(userId);
        const safeCharId = toTrimmedString(charId);
        if (!safeSupabase || !safeUserId || !safeCharId) {
            return createEmptyNotebook();
        }

        try {
            const result = await safeSupabase.rpc('get_user_notebook', {
                p_user_id: safeUserId,
                p_char_id: safeCharId
            });
            if (result && result.error) throw result.error;

            const payload = Array.isArray(result && result.data) ? result.data[0] : (result ? result.data : null);
            const notebook = normalizeNotebookPayload(payload);
            try {
                notebook.compacted = await fetchCompacted(safeSupabase, safeUserId, safeCharId);
            } catch (compactedError) {
                notebook.compacted = null;
            }
            const counts = summarizeNotebookCounts(notebook);
            console.log(
                `[海马体][记事本] OK 拉取成功 -> 档案:${counts.profiles}条 必记:${counts.mustRemember}条 红线:${counts.redlines}条`
            );
            return notebook;
        } catch (error) {
            console.warn('[海马体][记事本] 警告 拉取失败，已回退空记事本:', error && error.message ? error.message : error);
            return createEmptyNotebook();
        }
    }

    /**
     * 将时间值格式化成“距今多久前”的中文描述。
     */
    function formatTimeAgo(value) {
        if (!value) return '';

        const timestamp = value instanceof Date
            ? value.getTime()
            : (typeof value === 'number' ? value : Date.parse(String(value)));
        if (!Number.isFinite(timestamp)) return '';

        const diffMs = Math.max(0, Date.now() - timestamp);
        const minuteMs = 60 * 1000;
        const hourMs = 60 * minuteMs;
        const dayMs = 24 * hourMs;

        if (diffMs < minuteMs) return '刚刚';
        if (diffMs < hourMs) return `${Math.max(1, Math.floor(diffMs / minuteMs))}分钟前`;
        if (diffMs < dayMs) return `${Math.max(1, Math.floor(diffMs / hourMs))}小时前`;
        if (diffMs < 7 * dayMs) return `${Math.max(1, Math.floor(diffMs / dayMs))}天前`;
        if (diffMs < 30 * dayMs) return `${Math.max(1, Math.floor(diffMs / (7 * dayMs)))}周前`;
        return `${Math.max(1, Math.floor(diffMs / (30 * dayMs)))}个月前`;
    }

    /**
     * 将持续小时数转换成更自然的中文描述。
     */
    function formatDurationHours(hours) {
        const safeHours = Math.max(0, Math.floor(toFiniteNumber(hours, -1)));
        if (!Number.isFinite(safeHours) || safeHours < 0) return '';
        if (safeHours === 0) return '很短';
        if (safeHours < 24) return `约 ${safeHours} 小时`;
        if (safeHours % (24 * 7) === 0) return `约 ${Math.max(1, Math.floor(safeHours / (24 * 7)))} 周`;
        if (safeHours % 24 === 0) return `约 ${Math.max(1, Math.floor(safeHours / 24))} 天`;
        return `约 ${safeHours} 小时`;
    }

    /**
     * 生成线索列表的人话描述。
     */
    function formatSignalLine(signals) {
        const safeSignals = normalizeStringArray(signals);
        return safeSignals.length > 0 ? safeSignals.join(' / ') : '';
    }

    /**
     * 将偏好分类映射为更自然的中文标题。
     */
    function getProfileCategoryLabel(category) {
        const mapping = {
            preference: '喜好偏好',
            habit: '日常习惯',
            identity: '个人信息',
            other: '其他'
        };
        return mapping[toTrimmedString(category).toLowerCase()] || '其他';
    }

    /**
     * 构建记事本 Prompt 文本块。
     * 只要数据存在，就完整输出，不做任意裁剪或压缩。
     */
    function buildNotebookPromptBlock(notebook) {
        const snapshot = buildNotebookPromptSnapshot(notebook);
        if (snapshot.text) {
            const counts = snapshot.counts || summarizeNotebookCounts(snapshot.notebook);
            const rawCounts = snapshot.rawCounts || counts;
            const suppressionSuffix = rawCounts.profiles !== counts.profiles
                || rawCounts.mustRemember !== counts.mustRemember
                || rawCounts.redlines !== counts.redlines
                ? `, 原始条数 profile:${rawCounts.profiles}/must:${rawCounts.mustRemember}/redline:${rawCounts.redlines}`
                : '';
            console.log(
                `[海马体][记事本] OK Prompt 构建完成 -> 红线:${counts.redlines}条 必记:${counts.mustRemember}条 档案:${counts.profiles}条 总字符数:${snapshot.charLength}, checksum=${snapshot.checksum || 'none'}${suppressionSuffix}`
            );
        }
        return snapshot.text;
    }
    /**
     * 统一封装带错误处理的 RPC 调用。
     */
    async function callRpc(supabase, rpcName, params) {
        const safeSupabase = resolveSupabaseClient(supabase);
        if (!safeSupabase) {
            throw new Error('Supabase 客户端不可用');
        }

        const result = await safeSupabase.rpc(rpcName, params);
        if (result && result.error) throw result.error;
        return Array.isArray(result && result.data) ? result.data[0] : (result ? result.data : null);
    }

    /**
     * 拉取当前生效的整理归档结果。
     */
    async function fetchCompacted(supabase, userId, charId) {
        const row = await callRpc(supabase, 'get_notebook_compacted', {
            p_user_id: toTrimmedString(userId),
            p_char_id: toTrimmedString(charId)
        });
        return normalizeCompactedRecord(row);
    }

    /**
     * 回退整理归档结果，让原始条目重新平铺注入。
     */
    async function deleteCompacted(supabase, compactedId) {
        const safeId = toTrimmedString(compactedId);
        if (!safeId) return null;
        const row = await callRpc(supabase, 'delete_notebook_compacted', {
            p_compacted_id: safeId
        });
        return normalizeCompactedRecord(row);
    }

    /**
     * 保存用户手动编辑后的整理文本和分组。
     */
    async function updateCompactedGroups(supabase, compactedId, updatedGroups, updatedText) {
        const safeSupabase = resolveSupabaseClient(supabase);
        const safeId = toTrimmedString(compactedId);
        const groups = normalizeRecordArray(updatedGroups).map(normalizeCompactionGroup).filter(Boolean);
        const compactedText = toTrimmedString(updatedText) || buildCompactedTextFromGroups(groups);
        if (!safeSupabase || typeof safeSupabase.from !== 'function') {
            throw new Error('Supabase 客户端不可用');
        }
        if (!safeId || !compactedText) return null;

        const result = await safeSupabase
            .from('hippocampus_notebook_compacted')
            .update({
                groups: groups,
                compacted_text: compactedText,
                updated_at: new Date().toISOString()
            })
            .eq('id', safeId)
            .select('*')
            .limit(1);
        if (result && result.error) throw result.error;
        const row = Array.isArray(result && result.data) ? result.data[0] : null;
        return normalizeCompactedRecord(row);
    }

    /**
     * 判断当前角色是否已经累积到需要整理的未归档条目数量。
     */
    async function shouldTriggerCompaction(supabase, userId, charId) {
        try {
            const count = await callRpc(supabase, 'count_uncompacted_notebook_entries', {
                p_user_id: toTrimmedString(userId),
                p_char_id: toTrimmedString(charId)
            });
            const safeCount = Math.max(0, Math.floor(toFiniteNumber(count, 0)));
            const shouldRun = safeCount >= NOTEBOOK_COMPACTION_TRIGGER_THRESHOLD;
            console.log(`[海马体][记事本] OK 整理判定 -> 未整理条目 ${safeCount} 条，触发整理=${shouldRun}`);
            return {
                shouldRun: shouldRun,
                count: safeCount,
                threshold: NOTEBOOK_COMPACTION_TRIGGER_THRESHOLD
            };
        } catch (error) {
            console.warn('[海马体][记事本] 警告 整理判定失败，已跳过:', error && error.message ? error.message : error);
            return {
                shouldRun: false,
                count: 0,
                threshold: NOTEBOOK_COMPACTION_TRIGGER_THRESHOLD,
                error: error && error.message ? error.message : String(error || '')
            };
        }
    }

    /**
     * 执行完整的记事本整理归档流程。
     */
    async function executeCompaction(supabase, userId, charId, apiConfig) {
        const safeSupabase = resolveSupabaseClient(supabase);
        const safeUserId = toTrimmedString(userId);
        const safeCharId = toTrimmedString(charId);
        if (!safeSupabase || !safeUserId || !safeCharId) {
            return { ok: false, skipped: true, reason: 'missing_context' };
        }

        try {
            const notebook = await fetchNotebook(safeSupabase, safeUserId, safeCharId);
            const material = buildNotebookCompactionEntries(notebook);
            if (material.entries.length <= 0) {
                return { ok: true, skipped: true, reason: 'empty_notebook' };
            }

            const prompt = buildCompactionPrompt(notebook, notebook.compacted);
            const responseText = await requestCompactionDecision(prompt, apiConfig);
            let parsed = parseCompactionResponse(responseText);
            let finalResponseText = responseText;
            if (!parsed) {
                console.warn(
                    `[海马体][记事本] 警告 整理返回格式不对，尝试修复 JSON -> ${clipNotebookText(responseText, 240)}`
                );
                const repairPrompt = buildCompactionRepairPrompt(responseText);
                finalResponseText = await requestCompactionDecision(repairPrompt, apiConfig);
                parsed = parseCompactionResponse(finalResponseText);
            }
            if (!parsed) {
                throw new Error(`notebook_compaction_response_invalid: ${clipNotebookText(finalResponseText, 240)}`);
            }

            const coverage = await completeCompactionCoverage(parsed, material, apiConfig);
            parsed = coverage.parsed;
            const sourceIds = collectCompactionSourceIds(parsed.groups, material);
            const row = await callRpc(safeSupabase, 'upsert_notebook_compacted', {
                p_user_id: safeUserId,
                p_char_id: safeCharId,
                p_compacted_text: parsed.compactedText,
                p_groups: parsed.groups,
                p_source_profile_ids: sourceIds.profileIds,
                p_source_must_remember_ids: sourceIds.mustRememberIds,
                p_source_profile_count: sourceIds.profileIds.length,
                p_source_must_remember_count: sourceIds.mustRememberIds.length
            });
            const compacted = normalizeCompactedRecord(row);
            const originalCount = material.entries.length;
            const compactedItemCount = parsed.groups.reduce(function countItems(total, group) {
                return total + (Array.isArray(group.items) ? group.items.length : 0);
            }, 0);
            const ratio = originalCount > 0 ? Math.round((compactedItemCount / originalCount) * 100) : 0;
            console.log(
                `[海马体][记事本] OK 整理完成 -> 原始:${originalCount}条 整理后:${compactedItemCount}条 分组:${parsed.groups.length}个 压缩比:${ratio}%`
            );
            return {
                ok: true,
                compacted: compacted,
                originalCount: originalCount,
                compactedItemCount: compactedItemCount,
                groupCount: parsed.groups.length,
                sourceProfileCount: sourceIds.profileIds.length,
                sourceMustRememberCount: sourceIds.mustRememberIds.length,
                compressionRatio: ratio,
                coverage: coverage.report,
                coverageCompleted: coverage.completed
            };
        } catch (error) {
            console.warn('[海马体][记事本] 警告 整理失败，已跳过:', error && error.message ? error.message : error);
            return {
                ok: false,
                error: error && error.message ? error.message : String(error || '')
            };
        }
    }

    /**
     * 新增一条用户偏好档案。
     */
    async function addProfile(supabase, userId, charId, payload) {
        const source = isPlainObject(payload) ? payload : {};
        const content = toTrimmedString(source.content);
        if (!content) return null;

        const requestedCategory = toTrimmedString(source.category).toLowerCase();
        if (DEPRECATED_PROFILE_CATEGORIES.has(requestedCategory) || isNotebookRelationshipProfileFact(content)) return null;
        const category = PROFILE_CATEGORIES.has(requestedCategory)
            ? requestedCategory
            : 'other';
        const confidence = PROFILE_CONFIDENCE.has(toTrimmedString(source.confidence).toLowerCase())
            ? toTrimmedString(source.confidence).toLowerCase()
            : 'stated';
        const sourceMemoryIds = normalizeStringArray(source.sourceMemoryIds || source.source_memory_ids);

        const row = await callRpc(supabase, 'upsert_user_profile', {
            p_user_id: toTrimmedString(userId),
            p_char_id: toTrimmedString(charId),
            p_content: content,
            p_category: category,
            p_confidence: confidence,
            p_source_memory_ids: sourceMemoryIds
        });

        console.log(`[海马体][记事本] OK 新增偏好 -> "${content}", category=${category}, confidence=${confidence}`);
        return normalizeProfileRecord(row);
    }

    /**
     * 将一条偏好档案标记为停用。
     */
    async function deactivateProfile(supabase, profileId, supersededBy) {
        const safeProfileId = toTrimmedString(profileId);
        if (!safeProfileId) return null;

        const row = await callRpc(supabase, 'deactivate_user_profile', {
            p_profile_id: safeProfileId,
            p_superseded_by: toTrimmedString(supersededBy) || null
        });
        return normalizeProfileRecord(row);
    }

    /**
     * 新增一条必记事项。
     */
    async function addMustRemember(supabase, userId, charId, payload) {
        const source = isPlainObject(payload) ? payload : {};
        const content = toTrimmedString(source.content);
        if (!content) return null;

        const category = MUST_REMEMBER_CATEGORIES.has(toTrimmedString(source.category).toLowerCase())
            ? toTrimmedString(source.category).toLowerCase()
            : 'other';
        const origin = toTrimmedString(source.origin).toLowerCase() || 'system_extracted';
        const originContext = toTrimmedString(source.originContext || source.origin_context);
        const sourceMemoryIds = normalizeStringArray(source.sourceMemoryIds || source.source_memory_ids);

        const row = await callRpc(supabase, 'upsert_user_must_remember', {
            p_user_id: toTrimmedString(userId),
            p_char_id: toTrimmedString(charId),
            p_content: content,
            p_category: category,
            p_origin: origin,
            p_origin_context: originContext || null,
            p_source_memory_ids: sourceMemoryIds
        });

        console.log(`[海马体][记事本] OK 新增必记 -> "${content}", category=${category}`);
        return normalizeMustRememberRecord(row);
    }

    /**
     * 更新一条必记事项。
     */
    async function updateMustRemember(supabase, itemId, payload) {
        const safeItemId = toTrimmedString(itemId);
        const source = isPlainObject(payload) ? payload : {};
        const content = toTrimmedString(source.content);
        if (!safeItemId || !content) return null;

        const category = MUST_REMEMBER_CATEGORIES.has(toTrimmedString(source.category).toLowerCase())
            ? toTrimmedString(source.category).toLowerCase()
            : 'other';

        const row = await callRpc(supabase, 'update_user_must_remember', {
            p_item_id: safeItemId,
            p_content: content,
            p_category: category
        });
        return normalizeMustRememberRecord(row);
    }

    /**
     * 将一条必记事项停用。
     */
    async function deactivateMustRemember(supabase, itemId) {
        const safeItemId = toTrimmedString(itemId);
        if (!safeItemId) return null;

        const row = await callRpc(supabase, 'deactivate_user_must_remember', {
            p_item_id: safeItemId
        });
        return normalizeMustRememberRecord(row);
    }

    /**
     * 新增一条红线。
     */
    async function addRedline(supabase, userId, charId, payload) {
        const source = isPlainObject(payload) ? payload : {};
        const content = toTrimmedString(source.content);
        if (!content) return null;

        const severity = REDLINE_SEVERITIES.has(toTrimmedString(source.severity).toLowerCase())
            ? toTrimmedString(source.severity).toLowerCase()
            : 'important';
        const origin = toTrimmedString(source.origin).toLowerCase() || 'system_extracted';
        const originContext = toTrimmedString(source.originContext || source.origin_context);
        const sourceMemoryIds = normalizeStringArray(source.sourceMemoryIds || source.source_memory_ids);

        const row = await callRpc(supabase, 'upsert_user_redline', {
            p_user_id: toTrimmedString(userId),
            p_char_id: toTrimmedString(charId),
            p_content: content,
            p_severity: severity,
            p_origin: origin,
            p_origin_context: originContext || null,
            p_source_memory_ids: sourceMemoryIds
        });

        console.log(`[海马体][记事本] OK 新增红线 -> "${content}", severity=${severity}, origin=${origin}`);
        return normalizeRedlineRecord(row);
    }

    /**
     * 确认一条待确认红线。
     */
    async function confirmRedline(supabase, redlineId) {
        const safeRedlineId = toTrimmedString(redlineId);
        if (!safeRedlineId) return null;

        const row = await callRpc(supabase, 'confirm_redline', {
            p_redline_id: safeRedlineId
        });
        return normalizeRedlineRecord(row);
    }

    /**
     * 停用一条红线。
     */
    async function deactivateRedline(supabase, redlineId) {
        const safeRedlineId = toTrimmedString(redlineId);
        if (!safeRedlineId) return null;

        const row = await callRpc(supabase, 'deactivate_redline', {
            p_redline_id: safeRedlineId
        });
        return normalizeRedlineRecord(row);
    }

    /**
     * 规范化脱水结果里的状态变更结构。
     */
    /**
     * 规范化脱水结果里的偏好条目。
     */
    function normalizeProfileNote(item) {
        if (!isPlainObject(item)) return null;
        const content = toTrimmedString(item.content);
        if (!content) return null;

        const requestedCategory = toTrimmedString(item.category).toLowerCase();
        if (DEPRECATED_PROFILE_CATEGORIES.has(requestedCategory) || isNotebookRelationshipProfileFact(content)) return null;
        const category = PROFILE_CATEGORIES.has(requestedCategory)
            ? requestedCategory
            : 'other';
        const confidence = PROFILE_CONFIDENCE.has(toTrimmedString(item.confidence).toLowerCase())
            ? toTrimmedString(item.confidence).toLowerCase()
            : 'stated';
        if (isWeakNotebookProfileClaim({
            content: content,
            category: category,
            confidence: confidence
        })) return null;

        return {
            content: content,
            category: category,
            confidence: confidence
        };
    }

    /**
     * 规范化脱水结果里的必记事项。
     */
    function normalizeMustRememberNote(item) {
        if (!isPlainObject(item)) return null;
        const content = toTrimmedString(item.content);
        if (!content) return null;

        const category = MUST_REMEMBER_CATEGORIES.has(toTrimmedString(item.category).toLowerCase())
            ? toTrimmedString(item.category).toLowerCase()
            : 'other';
        return {
            content: content,
            category: category,
            originContext: toTrimmedString(item.originContext || item.origin_context)
        };
    }

    /**
     * 规范化脱水结果里的红线信号。
     */
    function normalizeRedlineSignal(item) {
        if (!isPlainObject(item)) return null;
        const content = toTrimmedString(item.content);
        if (!content) return null;

        const severity = REDLINE_SEVERITIES.has(toTrimmedString(item.severity).toLowerCase())
            ? toTrimmedString(item.severity).toLowerCase()
            : 'important';
        return {
            content: content,
            severity: severity,
            originContext: toTrimmedString(item.originContext || item.origin_context)
        };
    }

    /**
     * 统一提取脱水结果里的记事本增量。
     */
    function normalizeDehydrateNotebookInput(input, options) {
        const source = isPlainObject(input) || Array.isArray(input) ? input : {};
        const optionSource = isPlainObject(options) ? options : {};
        const learningProfile = optionSource.learningProfile !== undefined
            ? optionSource.learningProfile
            : (isPlainObject(source) ? (source.notebookLearningProfile || source.learningProfile) : null);
        const learningRules = buildNotebookLearningRules(
            getNotebookLearningProfile(
                optionSource.userId,
                optionSource.charId,
                learningProfile
            )
        );
        const getField = function getField(name) {
            if (Array.isArray(source)) return source[name];
            return source && source[name];
        };
        const profileNotes = pruneNotebookEntries(
            normalizeRecordArray(getField('profileNotes')).map(normalizeProfileNote).filter(Boolean),
            'profile',
            function shouldDropProfile(item) {
                return isLowValueProfileLike(item) || shouldSuppressNotebookItemByLearning('profile', item, learningRules);
            }
        );
        const mustRememberNotes = pruneNotebookEntries(
            normalizeRecordArray(getField('mustRememberNotes')).map(normalizeMustRememberNote).filter(Boolean),
            'must',
            function shouldDropMustRemember(item) {
                return isLowValueMustRememberLike(item) || shouldSuppressNotebookItemByLearning('mustRemember', item, learningRules);
            }
        );
        const redlineSignals = pruneNotebookEntries(
            normalizeRecordArray(getField('redlineSignals')).map(normalizeRedlineSignal).filter(Boolean),
            'redline',
            function shouldDropRedline(item) {
                return isLowValueRedlineLike(item) || shouldSuppressNotebookItemByLearning('redline', item, learningRules);
            }
        );

        return {
            statusChanges: [],
            profileNotes: profileNotes,
            mustRememberNotes: mustRememberNotes,
            redlineSignals: redlineSignals
        };
    }

    /**
     * 为“结束状态”在当前 active 状态列表里找最可能的匹配项。
     */
    /**
     * 把脱水阶段提取出的记事本信息真正回写到记事本表。
     */
    async function applyDehydrateNotebookResult(supabase, userId, charId, input) {
        const safeSupabase = resolveSupabaseClient(supabase);
        const safeUserId = toTrimmedString(userId);
        const safeCharId = toTrimmedString(charId);
        const learningProfile = getNotebookLearningProfile(safeUserId, safeCharId);
        const learningRules = buildNotebookLearningRules(learningProfile);
        const extraction = normalizeDehydrateNotebookInput(input, {
            userId: safeUserId,
            charId: safeCharId,
            learningProfile: learningProfile
        });

        const hasWork = extraction.profileNotes.length > 0
            || extraction.mustRememberNotes.length > 0
            || extraction.redlineSignals.length > 0;

        if (!safeSupabase || !safeUserId || !safeCharId || !hasWork) {
            return {
                profileCount: 0,
                mustRememberCount: 0,
                redlineCount: 0,
                failures: []
            };
        }

        const summary = {
            profileCount: 0,
            mustRememberCount: 0,
            redlineCount: 0,
            failures: []
        };

        let notebookSnapshot = null;
        const needsDuplicateLookup = extraction.profileNotes.length > 0
            || extraction.mustRememberNotes.length > 0
            || extraction.redlineSignals.length > 0;

        if (needsDuplicateLookup) {
            notebookSnapshot = await fetchNotebook(safeSupabase, safeUserId, safeCharId);
        }

        for (let i = 0; i < extraction.profileNotes.length; i += 1) {
            const item = extraction.profileNotes[i];
            const duplicateProfile = findExistingNotebookDuplicate(
                notebookSnapshot && Array.isArray(notebookSnapshot.profiles) ? notebookSnapshot.profiles : [],
                item,
                'profile'
            );
            if (duplicateProfile) {
                console.log(`[海马体][记事本] 跳过重复档案 -> "${item.content}"`);
                continue;
            }
            try {
                const created = await addProfile(safeSupabase, safeUserId, safeCharId, item);
                if (created) {
                    summary.profileCount += 1;
                    if (notebookSnapshot && Array.isArray(notebookSnapshot.profiles)) {
                        notebookSnapshot.profiles.push(created);
                    }
                }
            } catch (error) {
                summary.failures.push(`addProfile:${error && error.message ? error.message : error}`);
            }
        }

        for (let i = 0; i < extraction.mustRememberNotes.length; i += 1) {
            const item = extraction.mustRememberNotes[i];
            const duplicateMustRemember = findExistingNotebookDuplicate(
                notebookSnapshot && Array.isArray(notebookSnapshot.mustRemember) ? notebookSnapshot.mustRemember : [],
                item,
                'must'
            );
            if (duplicateMustRemember) {
                console.log(`[海马体][记事本] 跳过重复必记 -> "${item.content}"`);
                continue;
            }
            try {
                const created = await addMustRemember(safeSupabase, safeUserId, safeCharId, {
                    content: item.content,
                    category: item.category,
                    origin: 'system_extracted',
                    originContext: item.originContext,
                    sourceMemoryIds: []
                });
                if (created) {
                    summary.mustRememberCount += 1;
                    if (notebookSnapshot && Array.isArray(notebookSnapshot.mustRemember)) {
                        notebookSnapshot.mustRemember.push(created);
                    }
                }
            } catch (error) {
                summary.failures.push(`addMustRemember:${error && error.message ? error.message : error}`);
            }
        }

        for (let i = 0; i < extraction.redlineSignals.length; i += 1) {
            const item = extraction.redlineSignals[i];
            const duplicateRedline = findExistingNotebookDuplicate(
                notebookSnapshot && Array.isArray(notebookSnapshot.redlines) ? notebookSnapshot.redlines : [],
                item,
                'redline'
            );
            if (duplicateRedline) {
                console.log(`[海马体][记事本] 跳过重复红线 -> "${item.content}"`);
                continue;
            }
            try {
                const created = await addRedline(safeSupabase, safeUserId, safeCharId, {
                    content: item.content,
                    severity: item.severity,
                    origin: 'system_extracted',
                    originContext: item.originContext,
                    sourceMemoryIds: []
                });
                if (created) {
                    summary.redlineCount += 1;
                    if (notebookSnapshot && Array.isArray(notebookSnapshot.redlines)) {
                        notebookSnapshot.redlines.push(created);
                    }
                }
            } catch (error) {
                summary.failures.push(`addRedline:${error && error.message ? error.message : error}`);
            }
        }

        console.log(
            `[海马体][脱水] OK 记事本提取 -> 偏好:${extraction.profileNotes.length}条 必记:${extraction.mustRememberNotes.length}条 红线:${extraction.redlineSignals.length}条`
        );
        console.log('[海马体][脱水] OK 记事本回写完成');

        if (summary.failures.length > 0) {
            console.warn(`[海马体][脱水] 警告 记事本回写部分失败 -> ${summary.failures.join(' | ')}`);
        }

        return summary;
    }

    return {
        fetchNotebook: fetchNotebook,
        fetchCompacted: fetchCompacted,
        deleteCompacted: deleteCompacted,
        updateCompactedGroups: updateCompactedGroups,
        shouldTriggerCompaction: shouldTriggerCompaction,
        buildCompactionPrompt: buildCompactionPrompt,
        buildCompactionRepairPrompt: buildCompactionRepairPrompt,
        buildCompactionCompletionPrompt: buildCompactionCompletionPrompt,
        parseCompactionResponse: parseCompactionResponse,
        getCompactionCoverageReport: getCompactionCoverageReport,
        executeCompaction: executeCompaction,
        summarizeNotebookCounts: summarizeNotebookCounts,
        computeNotebookPromptChecksum: computeNotebookPromptChecksum,
        buildNotebookCleanupPreview: function buildNotebookCleanupPreview(notebook) {
            return buildPromptNotebookAnalysis(notebook).cleanupPreview;
        },
        getNotebookLearningProfile: getNotebookLearningProfile,
        buildNotebookLearningRules: buildNotebookLearningRules,
        buildNotebookLearningPromptBlock: buildNotebookLearningPromptBlock,
        recordNotebookFeedback: recordNotebookFeedback,
        resetNotebookLearningProfile: resetNotebookLearningProfile,
        normalizeDehydrateNotebookInput: normalizeDehydrateNotebookInput,
        buildNotebookPromptSnapshot: buildNotebookPromptSnapshot,
        fetchNotebookPromptSnapshot: fetchNotebookPromptSnapshot,
        buildNotebookPromptBlock: buildNotebookPromptBlock,
        addProfile: addProfile,
        deactivateProfile: deactivateProfile,
        addMustRemember: addMustRemember,
        updateMustRemember: updateMustRemember,
        deactivateMustRemember: deactivateMustRemember,
        addRedline: addRedline,
        confirmRedline: confirmRedline,
        deactivateRedline: deactivateRedline,
        applyDehydrateNotebookResult: applyDehydrateNotebookResult
    };
}


