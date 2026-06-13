/**
 * 初始化海马体脱水器模块导出壳子。
 * 兼容浏览器全局和 CommonJS 两种加载方式。
 */
(function initHippocampusDehydratorModule(root) {
    const api = createHippocampusDehydrator(root);

    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }

    if (root && typeof root === 'object') {
        root.HippocampusDehydrator = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this));

/**
 * 创建海马体脱水器实例。
 * 这里封装 Prompt 生成、LLM 调用、JSON 解析和触发判定逻辑。
 */
function createHippocampusDehydrator(root) {
    const MIN_DEHYDRATE_INTERVAL_MS = 5 * 60 * 1000;
    const MIN_MESSAGE_COUNT = 40;
    const MAX_MEMORY_COUNT = 3;
    const DEFAULT_DEHYDRATE_MIN_WINDOW_SIZE = 18;
    const DEFAULT_DEHYDRATE_TARGET_WINDOW_SIZE = 24;
    const DEFAULT_DEHYDRATE_MAX_WINDOW_SIZE = 28;
    const DEFAULT_TEMPERATURE = 0.2;
    const DEFAULT_MAX_TOKENS = 8192;
    const VALID_MEMORY_LAYERS = new Set(['buffer', 'core', 'cortex', 'shadow', 'wish']);
    const VALID_PROFILE_CATEGORIES = new Set(['preference', 'habit', 'identity', 'other']);
    const VALID_PROFILE_CONFIDENCE = new Set(['stated', 'inferred', 'uncertain']);
    const VALID_MUST_REMEMBER_CATEGORIES = new Set(['fact', 'health', 'relationship', 'promise', 'trigger', 'other']);
    const VALID_REDLINE_SEVERITIES = new Set(['critical', 'important', 'reminder']);
    const NOTEBOOK_GAME_DETAIL_RE = /(游戏|关卡|boss|b[o0]ss|副本|任务|剧情|地点|地图|机制|攻略|属性|阵容|配队|等级|装备|技能|掉落|奖杯|成就|dlc|关底|build|loadout|quest|level|gear)/i;
    const NOTEBOOK_GAME_PREFERENCE_RE = /(喜欢|讨厌|不喜欢|更喜欢|偏好|倾向|优先|追求|习惯|擅长).*(开放世界|自由探索|休闲|互动|练级|主线|效率|现成|探索)|(?:开放世界|自由探索|休闲|互动|练级|主线|效率|现成|探索).*(喜欢|讨厌|不喜欢|更喜欢|偏好|倾向|优先|追求|习惯|擅长)/;
    const NOTEBOOK_SHIPPING_RE = /(快递|到货|送达|下单|发货)/;
    const NOTEBOOK_LOW_VALUE_SENSORY_RE = /(香水|味道|香味|体香|照片|语音|perfume|smell|scent|photo|voice)/i;
    const NOTEBOOK_SELF_FLAVOR_RE = /(人设|设定|自称|自诩|唯一|完美|全能|专家|最懂|永远).*$/i;
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
    const NOTEBOOK_DATED_CONFLICT_RE = /(((\d{1,2}月\d{1,2}日)|(\d{1,2}\/\d{1,2})|([12]\d{3}[-/]\d{1,2}[-/]\d{1,2})).*(吵架|争执|冲突|导火索|fight|argument|conflict|trigger))|(((吵架|争执|冲突|导火索|fight|argument|conflict|trigger).*((\d{1,2}月\d{1,2}日)|(\d{1,2}\/\d{1,2})|([12]\d{3}[-/]\d{1,2}[-/]\d{1,2}))))/i;
    const NOTEBOOK_STABLE_PROFILE_RE = /(喜欢|不喜欢|讨厌|偏好|倾向|习惯|经常|总是|通常|容易|很在意|敏感|会用|会把|会叫|常常|对.*敏感)/i;
    const NOTEBOOK_ONE_OFF_EVENT_RE = /(昨天|今天|刚刚|刚才|那次|这次|当时|后来|突然|一时|一次|一回|刚买|刚到|那天|片刻)/i;
    const NOTEBOOK_BOUNDARY_RE = /(绝对不能|绝对不可以|不要再|别再|不能再|不要|别|禁止|底线|红线)/i;
    const NOTEBOOK_IMPORTANCE_RE = /(必须记住|必须一直记得|别忘|以后别忘|很重要|重要|导火索|承诺|答应|欠|还)/i;
    const NOTEBOOK_SAFETY_RE = /(危险|自残|自杀|手腕|刀|住院|复诊|崩溃|伤害自己|self-harm|suicide|knife|wrist)/i;
    const NOTEBOOK_MAJOR_PROMISE_RE = /(结婚|同居|搬家|买房|房子|养(?:用户|对方|ta|TA|他|她)|供养|工资|工资卡|银行卡|账号密码|密码|社交账号|公开身份|官宣|生育|避孕|怀孕|医疗|手术|住院|复诊|治疗|债务|网贷|还钱|还款|欠款|还清|报销|垫付|跨次元|现实见面|线下见面|见面计划|见面安排|奔现|去见(?:用户|对方|ta|TA|他|她)|来见(?:用户|对方|ta|TA|他|她)|长期|一辈子|永远不|绝不|绝对不|分手|自残|自杀|伤害自己|安全|底线|红线|法律|报警|隐私|证件|身份信息|deposit|debt|loan|repay|reimburse|account|password|marry|marriage|house|medical|surgery|privacy|legal)/i;
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
    const console = createHippoScopedConsole(root, '脱水');

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
     * 将任意值转换为有限数字，不合法时回退到默认值。
     */
    function toFiniteNumber(value, fallback) {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : fallback;
    }

    /**
     * 将数值裁剪到指定区间，区间边界与海马体文档要求保持一致。
     */
    function clampNumber(value, min, max, fallback) {
        const numeric = toFiniteNumber(value, fallback);
        return Math.min(max, Math.max(min, numeric));
    }

    /**
     * 将任意值转换为去首尾空白的字符串。
     */
    function toTrimmedString(value) {
        return String(value === undefined || value === null ? '' : value).trim();
    }

    /**
     * 校验并规范化记忆层级，不合法时回退到 buffer。
     */
    function normalizeMemoryLayer(layer, eventIndex) {
        const value = toTrimmedString(layer).toLowerCase();
        if (VALID_MEMORY_LAYERS.has(value)) return value;
        if (value) {
            console.warn(`[海马体][脱水] ⚠️ 层级非法 -> 事件${Number(eventIndex) + 1} 的 layer="${value}" 已修正为 buffer。`);
        }
        return 'buffer';
    }

    /**
     * 校验并规范化感官锚点数组，非法时重置为空数组。
     */
    function normalizeSensoryAnchors(value, eventIndex) {
        if (!Array.isArray(value)) {
            if (value !== undefined && value !== null && value !== '') {
                console.warn(`[海马体][脱水] ⚠️ 感官锚点格式异常 -> 事件${Number(eventIndex) + 1} 的 sensory_anchors 已重置为 [].`);
            }
            return [];
        }

        const anchors = [];
        const seen = new Set();
        for (let i = 0; i < value.length; i += 1) {
            const anchor = toTrimmedString(value[i]);
            if (!anchor || seen.has(anchor)) continue;
            seen.add(anchor);
            anchors.push(anchor);
            if (anchors.length >= 8) break;
        }
        return anchors;
    }

    /**
     * 规范化字符串数组，供记事本相关字段复用。
     */
    function normalizeSimpleStringArray(value, maxLength) {
        if (!Array.isArray(value)) {
            if (value !== undefined && value !== null && value !== '') {
                console.warn('[海马体][脱水] ⚠️ 数组字段格式异常，已重置为空数组。');
            }
            return [];
        }

        const result = [];
        const seen = new Set();
        const limit = Math.max(1, Math.floor(toFiniteNumber(maxLength, 8)));
        for (let i = 0; i < value.length; i += 1) {
            const item = toTrimmedString(value[i]);
            if (!item || seen.has(item)) continue;
            seen.add(item);
            result.push(item);
            if (result.length >= limit) break;
        }
        return result;
    }

    /**
     * 校验并规范化当前情绪结构，不合法时返回 null。
     */
    function normalizeCurrentMood(value) {
        if (!value || typeof value !== 'object') return null;

        const valence = clampNumber(
            value.valence !== undefined ? value.valence : value.moodValence,
            -1,
            1,
            0
        );
        const arousal = clampNumber(
            value.arousal !== undefined ? value.arousal : value.moodArousal,
            0,
            1,
            0
        );
        const label = toTrimmedString(value.label || value.moodLabel || value.state || '');

        if (!label && value.valence === undefined && value.arousal === undefined) {
            return null;
        }

        return {
            valence: valence,
            arousal: arousal,
            label: label || '平静'
        };
    }

    /**
     * 从任意响应结构中提取 currentMood 字段。
     */
    function extractCurrentMood(parsed) {
        if (!parsed || typeof parsed !== 'object') return null;
        if (parsed.currentMood && typeof parsed.currentMood === 'object') {
            return normalizeCurrentMood(parsed.currentMood);
        }
        if (parsed.current_mood && typeof parsed.current_mood === 'object') {
            return normalizeCurrentMood(parsed.current_mood);
        }
        if (parsed.mood && typeof parsed.mood === 'object') {
            return normalizeCurrentMood(parsed.mood);
        }
        return null;
    }

    /**
     * 统一清洗记事本文本，供低价值过滤与重复压缩复用。
     */
    function normalizeNotebookCompareText(value) {
        return toTrimmedString(value)
            .replace(/[\r\n\t]+/g, ' ')
            .replace(/[“”"'`‘’]/g, '')
            .replace(/[【】[\]（）()<>《》]/g, ' ')
            .replace(/[，。！？!?:：;；、/\\|]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    }

    /**
     * 判断条目是否属于“游戏微观攻略/进度/配置”噪音。
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
        const safeItem = item && typeof item === 'object' ? item : {};
        const content = toTrimmedString(safeItem.content);
        const category = toTrimmedString(safeItem.category).toLowerCase();
        if (!content) return true;
        if (isNotebookThirdPartyProfileLeak(content)) return true;
        if (category === 'identity' && (!hasNotebookUserSelfAnchor(content) || isNotebookSpeculativeText(content))) return true;
        if (isNotebookIdentityClaim(content) && !hasNotebookUserSelfAnchor(content)) return true;
        if (NOTEBOOK_HIGH_RISK_IDENTITY_RE.test(content) && !hasNotebookStrongUserSelfAnchor(content)) return true;
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
            .replace(/[“”"'`]/g, '')
            .replace(/(开始|自然地|亲昵地|经常|总是|偶尔|会在.*?中|在.*?中|会|改口|被我)/g, '')
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
     * 计算条目里的结构化强信号，避免只靠字面关键词硬拦。
     */
    function countNotebookStructuralSignals(text, patterns) {
        const safeText = normalizeNotebookCompareText(text);
        const safePatterns = Array.isArray(patterns) ? patterns : [];
        let score = 0;
        for (let i = 0; i < safePatterns.length; i += 1) {
            const pattern = safePatterns[i];
            if (pattern && pattern.test(safeText)) score += 1;
        }
        return score;
    }

    /**
     * 判断档案条目是否更像“长期稳定特征”而非一次性事件。
     */
    function scoreProfileNoteValue(item) {
        const content = toTrimmedString(item && item.content);
        if (!content) return -99;
        if (isNotebookRelationshipProfileFact(content)) return -99;
        if (isWeakNotebookProfileClaim(item)) return -99;

        let score = 0;
        if (item && (item.category === 'preference' || item.category === 'habit' || item.category === 'identity')) score += 2;
        if (NOTEBOOK_USER_FOCUS_RE.test(content) || NOTEBOOK_RELATIONSHIP_FROM_USER_RE.test(content)) score += 2;
        if (NOTEBOOK_STABLE_PROFILE_RE.test(content)) score += 2;
        if (item && item.category === 'habit') {
            score += isNotebookActionableHabit(content) ? 1 : -2;
        }
        if (NOTEBOOK_ONE_OFF_EVENT_RE.test(content)) score -= 1;
        if (NOTEBOOK_SELF_LEAD_RE.test(content) && !NOTEBOOK_RELATIONSHIP_FROM_USER_RE.test(content)) score -= 3;
        if (isNotebookCharLeadingContent(content)
            && !NOTEBOOK_RELATIONSHIP_FROM_USER_RE.test(content)) score -= 4;
        if (isNotebookCharReaction(content)) score -= 4;
        if (NOTEBOOK_LOW_VALUE_SENSORY_RE.test(content)) score -= 2;
        if (NOTEBOOK_SELF_FLAVOR_RE.test(content)) score -= 3;
        if (NOTEBOOK_FLIRT_OR_AROUSAL_RE.test(content)) score -= 2;
        if (isNotebookSpeculativeText(content)) score -= 4;
        if (isNotebookRoleplayDetail(content)) score -= 4;
        if (isNotebookNegativeRelationshipAddress(content)) score -= 8;
        if (isNotebookGameMicroFact(content)) score -= 3;
        if (/^(住在|住址|地址)/.test(content)) score -= 2;
        return score;
    }

    /**
     * 判断必记条目是否真的达到了长期高优先级门槛。
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
        if (item && item.severity === 'critical') score += 1;
        if (NOTEBOOK_BOUNDARY_RE.test(combined)) score += 3;
        if (NOTEBOOK_SAFETY_RE.test(combined)) score += 3;
        if (NOTEBOOK_IMPORTANCE_RE.test(combined)) score += 1;
        if (NOTEBOOK_LOW_VALUE_SENSORY_RE.test(combined) || NOTEBOOK_SELF_FLAVOR_RE.test(combined)) score -= 3;
        if (isNotebookGameMicroFact(combined)) score -= 3;
        return score;
    }

    /**
     * 过滤不够稳定、不是以用户为中心、或只是角色自嗨的档案条目。
     */
    function isLowValueProfileNote(item) {
        return scoreProfileNoteValue(item) < 3;
    }

    /**
     * 过滤没有达到“长期高优先级”门槛的必记条目。
     */
    function isLowValueMustRememberNote(item) {
        return scoreMustRememberValue(item) < 3;
    }

    /**
     * 过滤不够明确的红线/禁区条目。
     */
    function isLowValueRedlineSignal(item) {
        return scoreRedlineValue(item) < 3;
    }

    /**
     * 对单类记事本条目做低价值过滤与同主题去重。
     * status 可传空过滤器，只做去重，避免“低价值状态”被直接丢弃。
     */
    function pruneNotebookEntries(items, kind, isLowValueFn) {
        const source = Array.isArray(items) ? items : [];
        const result = [];
        let droppedLowValue = 0;
        let droppedDuplicate = 0;

        for (let i = 0; i < source.length; i += 1) {
            const item = source[i];
            if (!item) continue;
            if (typeof isLowValueFn === 'function' && isLowValueFn(item)) {
                droppedLowValue += 1;
                continue;
            }
            if (result.some(function findDuplicate(existingItem) {
                return isNotebookDuplicateEntry(existingItem, item, kind);
            })) {
                droppedDuplicate += 1;
                continue;
            }
            result.push(item);
        }

        return {
            items: result,
            droppedLowValue: droppedLowValue,
            droppedDuplicate: droppedDuplicate
        };
    }

    /**
     * 规范化单条偏好档案结构。
     */
    function normalizeProfileNote(item, index) {
        if (!item || typeof item !== 'object') return null;

        const content = toTrimmedString(item.content);
        if (!content) {
            console.warn(`[海马体][脱水] ⚠️ profileNotes[${index}] 缺少 content，已跳过。`);
            return null;
        }
        if (isNotebookRelationshipProfileFact(content)) {
            console.warn(`[海马体][脱水] ⚠️ profileNotes[${index}] 是称呼/关系标签，已跳过。`);
            return null;
        }

        const category = toTrimmedString(item.category).toLowerCase();
        const confidence = toTrimmedString(item.confidence).toLowerCase();
        if (category && !VALID_PROFILE_CATEGORIES.has(category)) {
            console.warn(`[海马体][脱水] ⚠️ profileNotes[${index}] 的 category="${category}" 非法，已跳过。`);
            return null;
        }
        if (confidence && !VALID_PROFILE_CONFIDENCE.has(confidence)) {
            console.warn(`[海马体][脱水] ⚠️ profileNotes[${index}] 的 confidence="${confidence}" 非法，已跳过。`);
            return null;
        }

        const normalized = {
            content: content,
            category: category || 'other',
            confidence: confidence || 'stated',
            evidence: toTrimmedString(item.evidence || item.evidenceText || item.evidence_text)
        };
        if (isWeakNotebookProfileClaim(normalized)) {
            console.warn(`[海马体][脱水] ⚠️ profileNotes[${index}] 主体不清或价值过低，已跳过。`);
            return null;
        }

        return normalized;
    }

    /**
     * 规范化单条必须牢记事项结构。
     */
    function normalizeMustRememberNote(item, index) {
        if (!item || typeof item !== 'object') return null;

        const content = toTrimmedString(item.content);
        if (!content) {
            console.warn(`[海马体][脱水] ⚠️ mustRememberNotes[${index}] 缺少 content，已跳过。`);
            return null;
        }

        const category = toTrimmedString(item.category).toLowerCase();
        if (category && !VALID_MUST_REMEMBER_CATEGORIES.has(category)) {
            console.warn(`[海马体][脱水] ⚠️ mustRememberNotes[${index}] 的 category="${category}" 非法，已跳过。`);
            return null;
        }

        return {
            content: content,
            category: category || 'other',
            originContext: toTrimmedString(item.originContext || item.origin_context)
        };
    }

    /**
     * 规范化单条红线信号结构。
     */
    function normalizeRedlineSignal(item, index) {
        if (!item || typeof item !== 'object') return null;

        const content = toTrimmedString(item.content);
        if (!content) {
            console.warn(`[海马体][脱水] ⚠️ redlineSignals[${index}] 缺少 content，已跳过。`);
            return null;
        }

        const severity = toTrimmedString(item.severity).toLowerCase();
        if (severity && !VALID_REDLINE_SEVERITIES.has(severity)) {
            console.warn(`[海马体][脱水] ⚠️ redlineSignals[${index}] 的 severity="${severity}" 非法，已跳过。`);
            return null;
        }

        return {
            content: content,
            severity: severity || 'important',
            originContext: toTrimmedString(item.originContext || item.origin_context)
        };
    }

    /**
     * 提取记事本相关的增量结果。
     */
    function extractNotebookExtraction(parsed, options) {
        const safeOptions = options && typeof options === 'object' ? options : {};
        const groundingRows = Array.isArray(safeOptions.groundingRows) ? safeOptions.groundingRows : [];
        if (!parsed || typeof parsed !== 'object') {
            return {
                statusChanges: [],
                profileNotes: [],
                mustRememberNotes: [],
                redlineSignals: []
            };
        }

        const profileNotesSource = Array.isArray(parsed.profileNotes) ? parsed.profileNotes : [];
        const mustRememberSource = Array.isArray(parsed.mustRememberNotes) ? parsed.mustRememberNotes : [];
        const redlineSignalsSource = Array.isArray(parsed.redlineSignals) ? parsed.redlineSignals : [];
        const normalizedProfileNotes = profileNotesSource.map(function mapItem(item, index) {
            return normalizeProfileNote(item, index);
        }).filter(Boolean);
        const normalizedMustRemember = mustRememberSource.map(function mapItem(item, index) {
            return normalizeMustRememberNote(item, index);
        }).filter(Boolean);
        const normalizedRedlines = redlineSignalsSource.map(function mapItem(item, index) {
            return normalizeRedlineSignal(item, index);
        }).filter(Boolean);

        const prunedProfiles = pruneNotebookEntries(normalizedProfileNotes, 'profile', isLowValueProfileNote);
        const prunedMustRemember = pruneNotebookEntries(normalizedMustRemember, 'must', isLowValueMustRememberNote);
        const prunedRedlines = pruneNotebookEntries(normalizedRedlines, 'redline', isLowValueRedlineSignal);

        const totalDropped = prunedProfiles.droppedLowValue
            + prunedProfiles.droppedDuplicate
            + prunedMustRemember.droppedLowValue
            + prunedMustRemember.droppedDuplicate
            + prunedRedlines.droppedLowValue
            + prunedRedlines.droppedDuplicate;

        if (totalDropped > 0) {
            console.log(
                `[海马体][脱水] 记事本降噪完成 -> 档案过滤${prunedProfiles.droppedLowValue}/${prunedProfiles.droppedDuplicate}, 必记过滤${prunedMustRemember.droppedLowValue}/${prunedMustRemember.droppedDuplicate}, 红线过滤${prunedRedlines.droppedLowValue}/${prunedRedlines.droppedDuplicate}`
            );
        }

        const groundedProfiles = filterNotebookEntriesByGrounding(prunedProfiles.items, 'profile', groundingRows);
        const groundedMustRemember = filterNotebookEntriesByGrounding(prunedMustRemember.items, 'must', groundingRows);
        const groundedRedlines = filterNotebookEntriesByGrounding(prunedRedlines.items, 'redline', groundingRows);
        const unsupportedDropped = groundedProfiles.droppedUnsupported
            + groundedMustRemember.droppedUnsupported
            + groundedRedlines.droppedUnsupported;

        if (unsupportedDropped > 0) {
            console.log(
                `[海马体][脱水] 记事本原文校验完成 -> 档案丢弃${groundedProfiles.droppedUnsupported}, 必记丢弃${groundedMustRemember.droppedUnsupported}, 红线丢弃${groundedRedlines.droppedUnsupported}`
            );
        }

        const extracted = {
            statusChanges: [],
            profileNotes: groundedProfiles.items,
            mustRememberNotes: groundedMustRemember.items,
            redlineSignals: groundedRedlines.items
        };
        const notebookModule = getNotebookModule();
        if (notebookModule && typeof notebookModule.normalizeDehydrateNotebookInput === 'function') {
            try {
                return notebookModule.normalizeDehydrateNotebookInput(extracted, {
                    userId: safeOptions.userId,
                    charId: safeOptions.charId || safeOptions.characterId,
                    learningProfile: safeOptions.notebookLearningProfile || safeOptions.learningProfile
                });
            } catch (normalizeError) {
                console.warn('[海马体脱水] 记事本学习后处理失败，已回退基础提取结果。', normalizeError && normalizeError.message ? normalizeError.message : normalizeError);
            }
        }

        return extracted;
    }

    /**
     * 将解析出的附加字段挂到事件数组上，保持与旧链路兼容。
     */
    function attachSupplementalFields(events, payload) {
        const rows = Array.isArray(events) ? events : [];
        const safePayload = payload && typeof payload === 'object' ? payload : {};
        rows.currentMood = safePayload.currentMood || null;
        rows.statusChanges = Array.isArray(safePayload.statusChanges) ? safePayload.statusChanges : [];
        rows.profileNotes = Array.isArray(safePayload.profileNotes) ? safePayload.profileNotes : [];
        rows.mustRememberNotes = Array.isArray(safePayload.mustRememberNotes) ? safePayload.mustRememberNotes : [];
        rows.redlineSignals = Array.isArray(safePayload.redlineSignals) ? safePayload.redlineSignals : [];
        return rows;
    }

    /**
     * 判断本轮脱水是否除了记忆事件外，还提取到了其他可用信息。
     */
    function hasSupplementalExtraction(payload) {
        const safePayload = payload && typeof payload === 'object' ? payload : {};
        return !!safePayload.currentMood
            || (Array.isArray(safePayload.profileNotes) && safePayload.profileNotes.length > 0)
            || (Array.isArray(safePayload.mustRememberNotes) && safePayload.mustRememberNotes.length > 0)
            || (Array.isArray(safePayload.redlineSignals) && safePayload.redlineSignals.length > 0);
    }

    /**
     * 从当前环境中获取 fetch 实现。
     */
    function getFetchImplementation() {
        if (typeof fetch === 'function') return fetch.bind(root);
        if (root && typeof root.fetch === 'function') return root.fetch.bind(root);
        return null;
    }

    /**
     * 规范化脱水 API 配置，兼容常见字段命名。
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
     * 将 API 地址规范化为 OpenAI 兼容的 /chat/completions 端点。
     */
    function normalizeChatCompletionsUrl(rawUrl) {
        const url = toTrimmedString(rawUrl).replace(/\/+$/, '');
        if (!url) return '';
        if (url.endsWith('/chat/completions')) return url;
        if (url.endsWith('/chat')) return `${url}/completions`;
        return `${url}/chat/completions`;
    }

    /**
     * 为聊天记录中的角色生成更自然的中文标签。
     */
    function resolveSpeakerLabel(message, charName) {
        const explicitName = toTrimmedString(message && (message.name || message.displayName || message.speaker || message.author));
        if (explicitName) return explicitName;

        const role = toTrimmedString(message && message.role).toLowerCase();
        if (role === 'assistant' || role === 'character' || role === 'char') {
            return toTrimmedString(charName) || '角色';
        }

        if (role === 'user') return '用户';
        if (role === 'system') return '系统';
        if (role) return role;

        return '发言';
    }

    /**
     * 将聊天记录整理成适合送给脱水模型的纯文本摘要。
     */
    function resolveTranscriptSourceTag(message) {
        const type = toTrimmedString(message && message.type).toLowerCase();
        const explicitChannel = toTrimmedString(message && (message.source_channel || message.sourceChannel)).toLowerCase();
        const channelList = []
            .concat(Array.isArray(message && message.source_channels) ? message.source_channels : [])
            .concat(Array.isArray(message && message.sourceChannels) ? message.sourceChannels : [])
            .map((item) => toTrimmedString(item).toLowerCase())
            .filter(Boolean);
        const mode = toTrimmedString(message && message.mode).toLowerCase();
        const hasChannel = (channel) => explicitChannel === channel || channelList.includes(channel);
        const isOffline = hasChannel('offline_mode') || mode === 'offline' || !!toTrimmedString(message && message.offlineStoryId);
        const isCompanion = hasChannel('sillytavern_companion')
            || hasChannel('st_companion')
            || hasChannel('sillytavern')
            || hasChannel('sillytavern_sidecar')
            || type === 'sillytavern_companion_text'
            || type === 'st_companion_text';
        const location = toTrimmedString(message && (message.offlineLocation || message.source_location || message.location || message.place));
        const tags = [];
        if (isOffline) tags.push(location ? `线下模式:${location}` : '线下模式');
        if (isCompanion) tags.push('酒馆陪读');
        if (type === 'voice_call_text') tags.push('语音通话');
        if (type === 'video_call_text') tags.push('视频通话');
        return tags.map(function formatTag(tag) { return `[${tag}]`; }).join('');
    }

    function formatChatHistory(chatHistory, charName) {
        return formatChatHistoryForDehydrate(chatHistory, charName);
    }

    /**
     * 生成发给脱水模型的中文 Prompt。
     * 要求模型用角色第一人称视角提取值得长期记住的情感事件，并只返回 JSON。
     */
    function formatChatHistoryForDehydrate(chatHistory, charName) {
        const history = Array.isArray(chatHistory) ? chatHistory : [];
        const lines = [];

        for (let i = 0; i < history.length; i += 1) {
            const message = history[i];
            if (!message || typeof message !== 'object') continue;
            if (message.type === 'voice_call_record' || message.type === 'video_call_record') continue;

            const content = toTrimmedString(
                message.content
                || message.text
                || message.message
                || message.body
            );
            if (!content) continue;

            const label = resolveSpeakerLabel(message, charName);
            const sourceTag = resolveTranscriptSourceTag(message);
            lines.push(`${label}${sourceTag}：${content}`);
        }

        return lines.join('\n');
    }

    function generateDehydratePrompt(chatHistory, charName) {
        const safeCharName = toTrimmedString(charName) || '角色';
        const transcript = formatChatHistoryForDehydrate(chatHistory, safeCharName);

        return [
            `你是 IDIC 项目的“海马体脱水器”，负责从聊天记录中提取值得长期记住的情感事件。`,
            `请严格站在角色“${safeCharName}”的第一人称视角思考和表述。`,
            '',
            '任务要求：',
            '1. 只提取 0 到 3 条真正值得长期记住的情感事件。',
            '2. 优先保留这些类型：被伤害、被冷落、被安慰、被夸奖、被拒绝、被承诺、强烈吃醋、明显感动、关系变化、重要约定、意难平。',
            '3. 如果聊天只是普通闲聊、没有明确情绪起伏或长期影响，请直接返回空数组 []。',
            '4. content 必须是角色的第一人称内心记忆，用中文短句表达，不要写成旁白，不要复述整段聊天。',
            '5. valence 取值范围是 -1 到 1；arousal 取值范围是 0 到 1；importance 取值范围是 1 到 10。',
            '6. trigger_keywords 必须给 5 到 6 个中文短关键词，格式要适合“检索命中”，不要写短句。',
            '7. 关键词结构：至少 3 个核心基词（物件/感官/动作）+ 2 到 3 个场景词（2-4字）。',
            '8. 禁止代词结构词，例如“她的味道、寄给我、那次、这个、我们的”。',
            '9. 如果出现“X的Y”，请输出 Y 本体词；例如“她的味道”应输出“味道”。',
            '10. 关键词请补基础别名，例如听歌事件建议 ["听歌","歌","歌曲","音乐"]。',
            '11. 只输出 JSON，不要输出解释、标题、代码块标记、额外说明。',
            '',
            '输出格式示例：',
            '[',
            '  {',
            '    "content": "他刚才突然冷下来，我有点在意。",',
            '    "valence": -0.6,',
            '    "arousal": 0.7,',
            '    "importance": 6,',
            '    "trigger_keywords": ["冷淡", "语气", "在意", "态度", "不安"]',
            '  }',
            ']',
            '',
            '聊天记录如下：',
            transcript || '（没有可用聊天内容）'
        ].join('\n');
    }

    /**
     * 构造脱水“JSON 修复”提示词，把首轮非 JSON 输出修正为合法事件数组。
     */
    function buildDehydrateRepairPrompt(rawOutput, charName) {
        const safeCharName = toTrimmedString(charName) || '角色';
        const safeOutput = toTrimmedString(rawOutput) || '（空输出）';

        return [
            `请把下面这段内容修正为角色“${safeCharName}”第一人称视角的合法 JSON 对象。`,
            '字段只允许：content, valence, arousal, importance, trigger_keywords。',
            `只保留 0 到 ${MAX_MEMORY_COUNT} 条真正有长期情绪残留的事件；普通闲聊请返回 []。`,
            '只输出 JSON 对象，不要解释，不要加 Markdown 代码块。',
            '',
            '待修复内容：',
            safeOutput
        ].join('\n');
    }

    /**
     * 从多种上游响应结构中提取模型正文，兼容 OpenAI、Gemini 与常见网关包装。
     */
    function extractResponseText(llmResponse, depth) {
        const safeDepth = Number.isFinite(depth) ? depth : 0;
        if (safeDepth > 5) return '';
        if (typeof llmResponse === 'string') return llmResponse;

        if (!llmResponse || typeof llmResponse !== 'object') return '';

        /**
         * 将 content / parts 之类的多段文本结构拼成一个普通字符串。
         */
        function joinTextParts(parts) {
            if (!Array.isArray(parts)) return '';

            return parts.map(function mapPart(part) {
                if (typeof part === 'string') return part;
                if (!part || typeof part !== 'object') return '';
                if (typeof part.text === 'string') return part.text;
                if (typeof part.content === 'string') return part.content;
                if (Array.isArray(part.parts)) return joinTextParts(part.parts);
                return '';
            }).join('');
        }

        if (typeof llmResponse.output_text === 'string') {
            return llmResponse.output_text;
        }

        if (Array.isArray(llmResponse.choices) && llmResponse.choices[0]) {
            const firstChoice = llmResponse.choices[0];
            const message = firstChoice.message;
            const delta = firstChoice.delta;

            if (message && typeof message === 'object') {
                const content = message.content;
                if (typeof content === 'string') return content;
                if (Array.isArray(content)) {
                    const joinedContent = joinTextParts(content);
                    if (joinedContent) return joinedContent;
                }

                const messageText = extractResponseText(message, safeDepth + 1);
                if (messageText) return messageText;
            }

            if (delta && typeof delta === 'object') {
                const deltaText = extractResponseText(delta, safeDepth + 1);
                if (deltaText) return deltaText;
            }

            const choiceText = extractResponseText(firstChoice.text, safeDepth + 1);
            if (choiceText) return choiceText;
        }

        if (Array.isArray(llmResponse.candidates) && llmResponse.candidates[0]) {
            const firstCandidate = llmResponse.candidates[0];
            const candidateText = extractResponseText(firstCandidate, safeDepth + 1);
            if (candidateText) return candidateText;
        }

        if (Array.isArray(llmResponse.output) && llmResponse.output[0]) {
            const firstOutput = llmResponse.output[0];
            if (Array.isArray(firstOutput.content)) {
                const outputText = joinTextParts(firstOutput.content);
                if (outputText) return outputText;
            }

            const nestedOutputText = extractResponseText(firstOutput, safeDepth + 1);
            if (nestedOutputText) return nestedOutputText;
        }

        if (Array.isArray(llmResponse.parts)) {
            const partsText = joinTextParts(llmResponse.parts);
            if (partsText) return partsText;
        }

        if (llmResponse.content && typeof llmResponse.content === 'object') {
            const contentText = extractResponseText(llmResponse.content, safeDepth + 1);
            if (contentText) return contentText;
        }

        if (typeof llmResponse.content === 'string') return llmResponse.content;
        if (typeof llmResponse.text === 'string') return llmResponse.text;

        const nestedKeys = ['response', 'result', 'data'];
        for (let index = 0; index < nestedKeys.length; index += 1) {
            const nestedNode = llmResponse[nestedKeys[index]];
            const nestedText = extractResponseText(nestedNode, safeDepth + 1);
            if (nestedText) return nestedText;
        }

        return '';
    }

    /**
     * 从上游错误响应中提取尽量清晰的报错信息，便于控制台排查。
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
     * 去掉 Markdown 代码块包裹，保留内部 JSON 文本。
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
     * 从杂乱文本中提取一个最像 JSON 的片段，优先取数组，其次取对象。
     */
    function extractJsonCandidate(text) {
        const source = toTrimmedString(text);
        if (!source) return '';

        const stripped = stripCodeFence(source);
        if (stripped) {
            const trimmed = stripped.trim();
            if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
                return trimmed;
            }
        }

        const fencedMatch = source.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
        if (fencedMatch && fencedMatch[1]) {
            const fencedText = fencedMatch[1].trim();
            if (fencedText) return fencedText;
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
     * 将关键词字段规范化为“高命中检索词”：去代词句式、补本体词和常见别名。
     */
    function normalizeTriggerKeywords(value, content) {
        const unique = new Set();
        const result = [];
        let rawList = [];
        const blockedSingleKeywords = new Set([
            '我', '你', '他', '她', '它', '们', '的', '了', '呢', '啊', '吧', '吗', '嘛',
            '是', '有', '在', '就', '都', '也', '又', '很'
        ]);

        /**
         * 清洗关键词，过滤代词句式和弱信息噪声词。
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
         * 追加关键词并自动扩展别名，提升不同提问表达下的召回率。
         */
        function appendWithAliases(rawKeyword) {
            const keyword = sanitizeKeyword(rawKeyword);
            if (!keyword || unique.has(keyword)) return;
            unique.add(keyword);
            result.push(keyword);

            if (keyword.includes('的')) {
                const tail = sanitizeKeyword(keyword.split('的').pop());
                if (tail && !unique.has(tail)) {
                    unique.add(tail);
                    result.push(tail);
                }
            }

            const strippedModifier = sanitizeKeyword(
                keyword.replace(/^(?:旧|新|这|那|这个|那个|一条|那条|这条|一只|那只|这只|一件|那件|这件|一首|那首|这首)/, '')
            );
            if (strippedModifier && !unique.has(strippedModifier)) {
                unique.add(strippedModifier);
                result.push(strippedModifier);
            }

            if (/(听歌|歌曲|音乐|歌单|唱歌)/.test(keyword)) {
                ['听歌', '歌曲', '音乐', '歌'].forEach(function appendMusicAlias(item) {
                    const alias = sanitizeKeyword(item);
                    if (!alias || unique.has(alias)) return;
                    unique.add(alias);
                    result.push(alias);
                });
            }

            if (/(表带|腕带|手表|腕表)/.test(keyword)) {
                const alias = sanitizeKeyword('表带');
                if (alias && !unique.has(alias)) {
                    unique.add(alias);
                    result.push(alias);
                }
            }

            if (/(汗味|体味|味道|气味|香味)/.test(keyword)) {
                const alias = sanitizeKeyword('味道');
                if (alias && !unique.has(alias)) {
                    unique.add(alias);
                    result.push(alias);
                }
            }

            if (/汗/.test(keyword)) {
                const alias = sanitizeKeyword('汗');
                if (alias && !unique.has(alias)) {
                    unique.add(alias);
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
     * 将单条脱水事件规范化为海马体需要的字段结构。
     */
    function normalizeDehydratedEvent(item, eventIndex) {
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
            importance: normalizeImportanceValue(item.importance),
            trigger_keywords: normalizeTriggerKeywords(
                item.trigger_keywords
                || item.triggerKeywords
                || item.keywords
                || item.triggers,
                content
            )
        };
    }

    /**
     * 从已解析 JSON 中提取事件数组，兼容数组或常见对象包裹结构。
     */
    function extractEventList(parsed) {
        if (Array.isArray(parsed)) return parsed;

        if (!parsed || typeof parsed !== 'object') return [];

        if (Array.isArray(parsed.events)) return parsed.events;
        if (Array.isArray(parsed.memories)) return parsed.memories;
        if (Array.isArray(parsed.data)) return parsed.data;

        if (parsed.shouldRemember === false || parsed.shouldRemember === 'false') {
            return [];
        }

        if (parsed.event && typeof parsed.event === 'object') {
            return [parsed.event];
        }

        if (parsed.memory && typeof parsed.memory === 'object') {
            return [parsed.memory];
        }

        return [];
    }

    /**
     * 将任意“已解析”事件容器规范化为最终事件数组。
     */
    function normalizeParsedEventContainer(parsed) {
        const events = extractEventList(parsed);
        const normalized = [];
        const seenContent = new Set();

        for (let i = 0; i < events.length; i += 1) {
            const event = normalizeDehydratedEvent(events[i]);
            if (!event) continue;
            if (seenContent.has(event.content)) continue;

            seenContent.add(event.content);
            normalized.push(event);

            if (normalized.length >= MAX_MEMORY_COUNT) break;
        }

        return normalized;
    }

    /**
     * 解析脱水模型返回的 JSON，并裁剪所有数值到合法范围。
     * 解析失败时返回空数组，不抛异常。
     */
    function parseDehydrateResponse(llmResponse, options) {
        const safeOptions = options && typeof options === 'object' ? options : {};
        try {
            let container = null;

            if (Array.isArray(llmResponse)) {
                container = normalizeParsedEventContainer(llmResponse, safeOptions);
            } else if (
                llmResponse
                && typeof llmResponse === 'object'
                && !Array.isArray(llmResponse.choices)
                && !Array.isArray(llmResponse.output)
                && (
                    Array.isArray(llmResponse.events)
                    || Array.isArray(llmResponse.memories)
                    || Array.isArray(llmResponse.data)
                    || llmResponse.event
                    || llmResponse.memory
                    || llmResponse.currentMood
                    || llmResponse.current_mood
                )
            ) {
                container = normalizeParsedEventContainer(llmResponse, safeOptions);
            } else {
                const rawText = extractResponseText(llmResponse);
                const jsonCandidate = extractJsonCandidate(rawText);
                if (!jsonCandidate) {
                    console.warn('[海马体脱水] 未找到可解析 JSON，已返回空数组。');
                    return [];
                }

                const parsed = JSON.parse(jsonCandidate);
                container = normalizeParsedEventContainer(parsed, safeOptions);
            }

            const events = container && Array.isArray(container.events) ? container.events : [];
            attachSupplementalFields(events, {
                currentMood: container ? container.currentMood : null,
                statusChanges: [],
                profileNotes: container ? container.profileNotes : [],
                mustRememberNotes: container ? container.mustRememberNotes : [],
                redlineSignals: container ? container.redlineSignals : []
            });
            console.log(
                `[海马体][脱水] ✅ 解析成功 -> 事件${events.length}条, currentMood=${events.currentMood ? JSON.stringify(events.currentMood) : 'null'}, 偏好:${events.profileNotes.length}条, 必记:${events.mustRememberNotes.length}条, 红线:${events.redlineSignals.length}条`
            );
            return events;
        } catch (error) {
            console.warn('[海马体脱水] 解析响应失败，已返回空数组。', error && error.message ? error.message : error);
            return [];
        }
    }

    /**
     * 判断当前是否满足脱水触发条件。
     * 规则为距离上次脱水至少 5 分钟，且期间至少有 40 轮对话。
     */
    function shouldTriggerDehydrate(lastDehydrateTime, messageCount) {
        const safeCount = Math.floor(toFiniteNumber(messageCount, 0));
        if (safeCount < MIN_MESSAGE_COUNT) {
            console.log(`[海马体脱水] 跳过触发：消息数 ${safeCount} < ${MIN_MESSAGE_COUNT}。`);
            return false;
        }

        if (!lastDehydrateTime) {
            console.log(`[海马体脱水] 触发脱水：首次触发且消息数=${safeCount}。`);
            return true;
        }

        let lastTimestamp = NaN;
        if (lastDehydrateTime instanceof Date) {
            lastTimestamp = lastDehydrateTime.getTime();
        } else if (typeof lastDehydrateTime === 'number') {
            lastTimestamp = Number(lastDehydrateTime);
        } else {
            const text = toTrimmedString(lastDehydrateTime);
            if (/^\d+$/.test(text)) {
                lastTimestamp = Number(text);
            } else {
                lastTimestamp = Date.parse(text);
            }
        }

        if (!Number.isFinite(lastTimestamp)) {
            console.log('[海马体脱水] 触发脱水：上次时间不可解析，按可触发处理。');
            return true;
        }

        const elapsed = Date.now() - lastTimestamp;
        const allow = elapsed >= MIN_DEHYDRATE_INTERVAL_MS;
        const elapsedSec = Math.max(0, Math.floor(elapsed / 1000));
        console.log(`[海马体脱水] 触发判定：距上次 ${elapsedSec} 秒，消息数=${safeCount}，结果=${allow ? '触发' : '跳过'}。`);
        return allow;
    }

    /**
     * 调用便宜模型 API，从聊天记录中后台提取 0 到 3 条长期情感记忆事件。
     * 失败时静默返回空数组，不抛异常。
     */
    async function dehydrate(chatHistory, charId, charName, apiConfig) {
        const fetchImpl = getFetchImplementation();
        const config = normalizeApiConfig(apiConfig);
        const transcript = formatChatHistoryForDehydrate(chatHistory, charName || charId || '角色');
        const safeCharName = toTrimmedString(charName) || toTrimmedString(charId) || '角色';

        console.log(`[海马体脱水] 开始执行脱水，角色=${safeCharName}，聊天条数=${Array.isArray(chatHistory) ? chatHistory.length : 0}。`);

        if (!fetchImpl) {
            console.warn('[海马体脱水] 当前环境缺少 fetch，跳过脱水。');
            return [];
        }
        if (!config.apiUrl || !config.model) {
            console.warn('[海马体脱水] 脱水配置不完整，缺少 API URL 或模型名，已跳过。');
            return [];
        }
        if (!transcript) {
            console.log('[海马体脱水] 聊天内容为空，跳过脱水。');
            return attachSupplementalFields([], {});
        }

        const prompt = generateDehydratePrompt(chatHistory, charName || charId || '角色');
        const requestUrl = normalizeChatCompletionsUrl(config.apiUrl);
        if (!requestUrl) {
            console.warn('[海马体脱水] API URL 规范化失败，已跳过。');
            return [];
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
         * 发起单次脱水模型请求，返回统一结构，便于主流程做重试与修复。
         */
        async function requestDehydrateOnce(promptText, attemptLabel) {
            const body = Object.assign({}, requestBody, {
                messages: [
                    {
                        role: 'user',
                        content: promptText
                    }
                ]
            });

            console.log(`[海马体脱水] 发起${attemptLabel}请求，模型=${config.model}。`);
            const response = await fetchImpl(requestUrl, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(body)
            });
            console.log(`[海马体脱水] ${attemptLabel}响应状态：HTTP ${response.status}`);

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
                throw new Error(
                    detail
                        ? `${attemptLabel}失败（HTTP ${response.status}）：${detail}`
                        : `${attemptLabel}失败（HTTP ${response.status}）`
                );
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
                rawText: toTrimmedString(rawText)
            };
        }

        try {
            console.log(`[海马体脱水] 请求上游模型：${config.model}，URL=${requestUrl}`);
            const firstAttempt = await requestDehydrateOnce(prompt, '首轮');
            const firstPayload = firstAttempt.payload;
            const firstModelText = toTrimmedString(extractResponseText(firstPayload));
            const firstRepairSource = firstModelText || firstAttempt.rawText;
            const firstJsonCandidate = extractJsonCandidate(firstModelText);

            let parsedEvents = parseDehydrateResponse(firstPayload);
            if (parsedEvents.length > 0) {
                console.log(`[海马体脱水] 解析完成，得到 ${parsedEvents.length} 条事件。`);
                return parsedEvents;
            }

            if (firstModelText) {
                console.log(`[海马体脱水] 已提取模型正文，长度=${firstModelText.length}。`);
            } else if (firstAttempt.rawText) {
                console.log('[海马体脱水] 未提取到模型正文，将回退使用原始响应做修复重试。');
            }

            const shouldRepair = !firstJsonCandidate && !!toTrimmedString(firstRepairSource);
            if (!shouldRepair) {
                console.log('[海马体脱水] 解析完成，得到 0 条事件。');
                return [];
            }

            const preview = String(firstRepairSource).slice(0, 300);
            console.warn(`[海马体脱水] 首轮未返回可解析 JSON，准备执行修复重试。原始片段：${preview}`);
            const repairPrompt = buildDehydrateRepairPrompt(firstRepairSource, safeCharName);
            const repairAttempt = await requestDehydrateOnce(repairPrompt, '修复');
            parsedEvents = parseDehydrateResponse(repairAttempt.payload);
            console.log(`[海马体脱水] 修复解析完成，得到 ${parsedEvents.length} 条事件。`);
            return parsedEvents;
        } catch (error) {
            console.warn('[海马体脱水] 请求失败。', error);
            return [];
        }
    }

    /**
     * 将记忆文本规范化为便于比较的紧凑串，尽量削弱语气词与纯情绪修饰词的干扰。
     */
    function normalizeComparableContent(content) {
        return toTrimmedString(content)
            .replace(/[\u3000\s]+/g, '')
            .replace(/[“”"'‘’`]/g, '')
            .replace(/[，。！？、；：,.!?;:()（）【】《》<>]/g, '')
            .replace(/(?:真的|其实|突然|一下子|特别|有点|一点|非常|很|太|更|一直|只是|就是|简直|心里|当时|那一刻|这一刻)/g, '')
            .replace(/(?:我|我们|她|他|你|你们|他们|她们|对方|角色|用户)/g, '')
            .trim();
    }

    /**
     * 从记忆文本中提取 2 到 4 字的连续片段，用于中文场景下的轻量近似去重。
     */
    function extractContentNgrams(content) {
        const source = normalizeComparableContent(content);
        const result = [];
        const seen = new Set();

        if (!source || source.length < 2) return result;

        for (let size = 2; size <= 4; size += 1) {
            for (let index = 0; index <= source.length - size; index += 1) {
                const gram = source.slice(index, index + size);
                if (!gram || /^[0-9]+$/.test(gram) || seen.has(gram)) continue;
                seen.add(gram);
                result.push(gram);
                if (result.length >= 48) return result;
            }
        }

        return result;
    }

    /**
     * 统计两组文本片段的交集规模与重合比例，供近似重复判断使用。
     */
    function computeTokenOverlap(leftTokens, rightTokens) {
        const left = Array.isArray(leftTokens) ? leftTokens.filter(Boolean) : [];
        const right = Array.isArray(rightTokens) ? rightTokens.filter(Boolean) : [];
        if (left.length === 0 || right.length === 0) {
            return {
                count: 0,
                ratio: 0
            };
        }

        const rightSet = new Set(right);
        let overlapCount = 0;
        for (let index = 0; index < left.length; index += 1) {
            if (rightSet.has(left[index])) overlapCount += 1;
        }

        return {
            count: overlapCount,
            ratio: overlapCount / Math.max(1, Math.min(left.length, right.length))
        };
    }

    /**
     * 为事件生成稳定的语义签名片段，供近似合并与 dedupe_key 生成共用。
     */
    function buildEventSignatureTokens(content, triggerKeywords) {
        const result = [];
        const seen = new Set();
        const keywordList = normalizeTriggerKeywords(triggerKeywords, content);
        const ngrams = extractContentNgrams(content);

        /**
         * 追加一个候选签名片段，并在这里统一做清洗与去重。
         */
        function appendToken(rawToken) {
            const token = toTrimmedString(rawToken)
                .replace(/[\u3000\s]+/g, '')
                .replace(/^[“”"'‘’`【】《》()（）]+|[“”"'‘’`【】《》()（）]+$/g, '');
            if (!token || seen.has(token)) return;
            if (!/[A-Za-z0-9\u4e00-\u9fa5]/.test(token)) return;
            seen.add(token);
            result.push(token);
        }

        keywordList.forEach(function appendKeyword(token) {
            appendToken(token);
        });

        for (let index = 0; index < ngrams.length; index += 1) {
            appendToken(ngrams[index]);
            if (result.length >= 18) break;
        }

        return result.slice(0, 18);
    }

    function parseDehydrateGroundingTimestampMs(value) {
        if (value instanceof Date) return value.getTime();
        if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;

        const source = toTrimmedString(value);
        if (!source) return NaN;
        if (/^[0-9]{13}$/.test(source)) return Number(source);
        if (/^[0-9]{10}$/.test(source)) return Number(source) * 1000;

        const parsed = Date.parse(source);
        return Number.isFinite(parsed) ? parsed : NaN;
    }

    function buildDehydrateGroundingRows(chatHistory) {
        const history = Array.isArray(chatHistory) ? chatHistory : [];
        const rows = [];

        for (let index = 0; index < history.length; index += 1) {
            const message = history[index];
            if (!message || typeof message !== 'object') continue;
            if (
                message.type === 'system'
                || message.type === 'recalled'
                || message.type === 'thought'
                || message.type === 'voice_call_record'
                || message.type === 'video_call_record'
            ) {
                continue;
            }

            const text = toTrimmedString(
                message.content
                || message.text
                || message.message
                || message.body
            );
            if (!text) continue;

            const compactText = normalizeComparableContent(text);
            if (!compactText) continue;

            const messageId = toTrimmedString(
                message.id
                || message.message_id
                || message.messageId
                || message.local_id
                || message.localId
            );
            const timestampMs = parseDehydrateGroundingTimestampMs(
                message.timestamp
                || message.createdAt
                || message.created_at
                || message.time
                || message.date
            );

            rows.push({
                historyIndex: index,
                role: toTrimmedString(message.role || message.type).toLowerCase(),
                speaker: resolveSpeakerLabel(message, ''),
                messageId: messageId,
                timestampMs: Number.isFinite(timestampMs) && timestampMs > 0 ? timestampMs : 0,
                text: text,
                compactText: compactText,
                signatureTokens: buildEventSignatureTokens(text, [])
                    .map((item) => normalizeComparableContent(item))
                    .filter((item) => item && item.length >= 2)
            });
        }

        return rows;
    }

    const DEHYDRATE_GROUNDING_WEAK_FRAGMENTS = [
        '\u4eca\u5929',
        '\u6628\u5929',
        '\u6628\u665a',
        '\u90a3\u5929',
        '\u90a3\u6b21',
        '\u8fd9\u6b21',
        '\u4ee5\u524d',
        '\u4e4b\u524d',
        '\u4ee5\u540e',
        '\u540e\u6765',
        '\u7136\u540e',
        '\u5f53\u65f6',
        '\u4e00\u4e0b',
        '\u4e00\u4e0b\u5b50',
        '\u7a81\u7136',
        '\u771f\u7684',
        '\u4e00\u76f4',
        '\u5df2\u7ecf',
        '\u53c8',
        '\u8fd8',
        '\u90fd',
        '\u5c31',
        '\u89c9\u5f97',
        '\u804a\u5929',
        '\u8bf4\u8bdd'
    ];

    function stripDehydrateGroundingWeakFragments(token) {
        let stripped = normalizeComparableContent(token);
        for (let index = 0; index < DEHYDRATE_GROUNDING_WEAK_FRAGMENTS.length; index += 1) {
            const fragment = DEHYDRATE_GROUNDING_WEAK_FRAGMENTS[index];
            if (!fragment) continue;
            stripped = stripped.split(fragment).join('');
        }
        return stripped;
    }

    function isWeakDehydrateGroundingToken(token) {
        const normalized = normalizeComparableContent(token);
        if (!normalized || normalized.length < 2) return true;
        return stripDehydrateGroundingWeakFragments(normalized).length < 2;
    }

    function buildDehydratedEventGroundingPhrases(event) {
        const safeEvent = event && typeof event === 'object' ? event : {};
        const content = toTrimmedString(safeEvent.content);
        const triggerKeywords = Array.isArray(safeEvent.trigger_keywords) ? safeEvent.trigger_keywords : [];
        const parts = content
            ? content.split(/[\n\r，。！？；、]/)
            : [];
        const phrases = [];
        const seen = new Set();

        function pushPhrase(rawPhrase) {
            const normalized = normalizeComparableContent(rawPhrase);
            if (!normalized || seen.has(normalized)) return;
            if (normalized.length < 4 || normalized.length > 18) return;
            if (isWeakDehydrateGroundingToken(normalized)) return;
            seen.add(normalized);
            phrases.push(normalized);
        }

        for (let index = 0; index < parts.length; index += 1) {
            pushPhrase(parts[index]);
            if (phrases.length >= 4) break;
        }
        for (let index = 0; index < triggerKeywords.length && phrases.length < 4; index += 1) {
            pushPhrase(triggerKeywords[index]);
        }

        return phrases.slice(0, 4);
    }

    function buildDehydratedEventGroundingSignature(event) {
        const safeEvent = event && typeof event === 'object' ? event : {};
        const tokens = buildEventSignatureTokens(safeEvent.content, safeEvent.trigger_keywords)
            .map((item) => normalizeComparableContent(item))
            .filter((item) => item && item.length >= 2 && !isWeakDehydrateGroundingToken(item))
            .slice(0, 8);
        return {
            tokens: tokens,
            phrases: buildDehydratedEventGroundingPhrases(safeEvent)
        };
    }

    function deriveDehydratedEventGroundingTier(grounding) {
        const safeGrounding = grounding && typeof grounding === 'object' ? grounding : {};
        if (!safeGrounding.supported) return 'weak';
        if (
            toFiniteNumber(safeGrounding.matchedPhraseCount, 0) >= 2
            || toFiniteNumber(safeGrounding.phraseCoverage, 0) >= 0.66
            || toFiniteNumber(safeGrounding.coverage, 0) >= 0.62
            || toFiniteNumber(safeGrounding.strongRowCount, 0) >= 2
            || toFiniteNumber(safeGrounding.bestScore, 0) >= 7
        ) {
            return 'strong';
        }
        return 'medium';
    }

    function applyDehydratedEventGrounding(event, grounding) {
        const safeEvent = event && typeof event === 'object' ? event : null;
        const safeGrounding = grounding && typeof grounding === 'object' ? grounding : {};
        if (!safeEvent || !safeGrounding.supported) return safeEvent;

        const tier = deriveDehydratedEventGroundingTier(safeGrounding);
        const matchedHistoryIndexes = Array.isArray(safeGrounding.matchedHistoryIndexes)
            ? Array.from(new Set(safeGrounding.matchedHistoryIndexes.filter(function keepIndex(value) {
                return Number.isFinite(value) && value >= 0;
            }))).slice(0, 6)
            : [];
        const matchedMessageIds = Array.isArray(safeGrounding.matchedMessageIds)
            ? Array.from(new Set(safeGrounding.matchedMessageIds.map(function mapId(value) {
                return toTrimmedString(value);
            }).filter(Boolean))).slice(0, 12)
            : [];
        const sourceTimeStart = toTrimmedString(safeGrounding.sourceTimeStart || safeGrounding.source_time_start);
        const sourceTimeEnd = toTrimmedString(safeGrounding.sourceTimeEnd || safeGrounding.source_time_end);
        const groundingSnapshot = {
            tier: tier,
            coverage: clampNumber(toFiniteNumber(safeGrounding.coverage, 0), 0, 1, 0),
            phrase_coverage: clampNumber(toFiniteNumber(safeGrounding.phraseCoverage, 0), 0, 1, 0),
            matched_rows: Math.max(0, Math.floor(toFiniteNumber(safeGrounding.matchedRows, 0))),
            strong_rows: Math.max(0, Math.floor(toFiniteNumber(safeGrounding.strongRowCount, 0))),
            matched_tokens: Math.max(0, Math.floor(toFiniteNumber(safeGrounding.matchedTokenCount, 0))),
            total_tokens: Math.max(0, Math.floor(toFiniteNumber(safeGrounding.tokenCount, 0))),
            matched_phrases: Math.max(0, Math.floor(toFiniteNumber(safeGrounding.matchedPhraseCount, 0))),
            total_phrases: Math.max(0, Math.floor(toFiniteNumber(safeGrounding.phraseCount, 0))),
            best_score: Math.max(0, Math.floor(toFiniteNumber(safeGrounding.bestScore, 0))),
            source_history_indexes: matchedHistoryIndexes,
            source_message_ids: matchedMessageIds,
            source_time_start: sourceTimeStart,
            source_time_end: sourceTimeEnd
        };
        const baseMetadata = safeEvent.metadata && typeof safeEvent.metadata === 'object' && !Array.isArray(safeEvent.metadata)
            ? Object.assign({}, safeEvent.metadata)
            : {};
        if (matchedMessageIds.length > 0) {
            baseMetadata.source_message_ids = matchedMessageIds;
            safeEvent.source_message_ids = matchedMessageIds;
        }
        if (sourceTimeStart) {
            baseMetadata.source_time_start = sourceTimeStart;
            safeEvent.source_time_start = sourceTimeStart;
        }
        if (sourceTimeEnd) {
            baseMetadata.source_time_end = sourceTimeEnd;
            safeEvent.source_time_end = sourceTimeEnd;
        }
        baseMetadata.grounding_support = groundingSnapshot;
        safeEvent.metadata = baseMetadata;
        safeEvent.grounding_support = groundingSnapshot;
        if (matchedHistoryIndexes.length > 0) {
            safeEvent.source_history_indexes = matchedHistoryIndexes;
        }

        if (tier !== 'strong') {
            const originalImportance = normalizeImportanceValue(safeEvent.importance);
            const cappedImportance = Math.min(originalImportance, 7);
            if (cappedImportance < originalImportance) {
                safeEvent.importance = cappedImportance;
                console.log(
                    `[海马体脱水] 已下调原文支撑偏弱事件的重要度：${safeEvent.content.slice(0, 40)}（tier=${tier}, importance=${originalImportance}->${cappedImportance}, coverage=${groundingSnapshot.coverage.toFixed(2)}, phrase=${groundingSnapshot.phrase_coverage.toFixed(2)}）`
                );
            }
        }

        return safeEvent;
    }

    function scoreDehydratedEventGrounding(event, groundingRows) {
        const safeEvent = event && typeof event === 'object' ? event : {};
        const rows = Array.isArray(groundingRows) ? groundingRows : [];
        const signature = buildDehydratedEventGroundingSignature(safeEvent);
        const eventTokens = Array.isArray(signature.tokens) ? signature.tokens : [];
        const eventPhrases = Array.isArray(signature.phrases) ? signature.phrases : [];
        if ((eventTokens.length === 0 && eventPhrases.length === 0) || rows.length === 0) {
            return {
                supported: rows.length === 0,
                tokenCount: eventTokens.length,
                phraseCount: eventPhrases.length,
                matchedTokenCount: 0,
                matchedPhraseCount: 0,
                coverage: 0,
                phraseCoverage: 0,
                matchedRows: 0,
                strongRowCount: 0,
                bestScore: 0,
                matchedHistoryIndexes: [],
                matchedMessageIds: [],
                sourceTimeStart: '',
                sourceTimeEnd: ''
            };
        }

        const matchedTokenSet = new Set();
        const matchedPhraseSet = new Set();
        let matchedRows = 0;
        let strongRowCount = 0;
        let bestScore = 0;
        const matchedHistoryIndexes = [];
        const matchedMessageIds = [];
        let sourceTimeStartMs = NaN;
        let sourceTimeEndMs = NaN;

        rows.forEach((row) => {
            const compactText = toTrimmedString(row && row.compactText);
            if (!compactText) return;
            const rowSignatureTokens = Array.isArray(row && row.signatureTokens)
                ? row.signatureTokens.map((item) => normalizeComparableContent(item)).filter(Boolean)
                : [];
            const rowSignatureSet = new Set(rowSignatureTokens);

            let rowScore = 0;
            let rowMatchedTokenCount = 0;
            let rowMatchedPhraseCount = 0;
            eventPhrases.forEach((phrase) => {
                if (!phrase || !compactText.includes(phrase)) return;
                matchedPhraseSet.add(phrase);
                rowMatchedPhraseCount += 1;
                rowScore += Math.max(3, Math.min(6, Math.floor(phrase.length / 2)));
            });
            eventTokens.forEach((token) => {
                if (!token || (!compactText.includes(token) && !rowSignatureSet.has(token))) return;
                matchedTokenSet.add(token);
                rowMatchedTokenCount += 1;
                rowScore += token.length >= 4 ? 2 : 1;
            });

            if (rowScore <= 0) return;
            matchedRows += 1;
            if (Number.isFinite(row && row.historyIndex)) {
                matchedHistoryIndexes.push(row.historyIndex);
            }
            if (toTrimmedString(row && row.messageId)) {
                matchedMessageIds.push(toTrimmedString(row.messageId));
            }
            if (Number.isFinite(row && row.timestampMs) && row.timestampMs > 0) {
                if (!Number.isFinite(sourceTimeStartMs) || row.timestampMs < sourceTimeStartMs) {
                    sourceTimeStartMs = row.timestampMs;
                }
                if (!Number.isFinite(sourceTimeEndMs) || row.timestampMs > sourceTimeEndMs) {
                    sourceTimeEndMs = row.timestampMs;
                }
            }
            if (rowScore >= 4 || rowMatchedPhraseCount >= 1 || rowMatchedTokenCount >= 3) {
                strongRowCount += 1;
            }
            if (rowScore > bestScore) {
                bestScore = rowScore;
            }
        });

        const matchedTokenCount = matchedTokenSet.size;
        const matchedPhraseCount = matchedPhraseSet.size;
        const coverage = matchedTokenCount / Math.max(1, eventTokens.length);
        const phraseCoverage = matchedPhraseCount / Math.max(1, eventPhrases.length);
        const minimumTokenHits = Math.min(2, eventTokens.length);
        const supported = (
            matchedPhraseCount >= 1
            || phraseCoverage >= 0.34
            || (matchedRows >= 2 && (matchedTokenCount >= minimumTokenHits || matchedPhraseCount >= 1))
            || (strongRowCount >= 1 && matchedTokenCount >= minimumTokenHits)
            || (strongRowCount >= 1 && coverage >= 0.34)
            || bestScore >= 5
        );

        return {
            supported: supported,
            tokenCount: eventTokens.length,
            phraseCount: eventPhrases.length,
            matchedTokenCount: matchedTokenCount,
            matchedPhraseCount: matchedPhraseCount,
            coverage: coverage,
            phraseCoverage: phraseCoverage,
            matchedRows: matchedRows,
            strongRowCount: strongRowCount,
            bestScore: bestScore,
            matchedHistoryIndexes: Array.from(new Set(matchedHistoryIndexes)).slice(0, 6),
            matchedMessageIds: Array.from(new Set(matchedMessageIds)).slice(0, 12),
            sourceTimeStart: Number.isFinite(sourceTimeStartMs) && sourceTimeStartMs > 0 ? new Date(sourceTimeStartMs).toISOString() : '',
            sourceTimeEnd: Number.isFinite(sourceTimeEndMs) && sourceTimeEndMs > 0 ? new Date(sourceTimeEndMs).toISOString() : ''
        };
    }

    function buildNotebookGroundingText(item, kind) {
        const safeItem = item && typeof item === 'object' ? item : {};
        const safeKind = toTrimmedString(kind).toLowerCase();
        const parts = [];

        function appendText(value) {
            const text = toTrimmedString(value);
            if (!text) return;
            parts.push(text);
        }

        appendText(safeItem.content);
        if (safeKind === 'status') {
            appendText(safeItem.stateKey);
            appendText(safeItem.startedReason);
            appendText(Array.isArray(safeItem.startSignals) ? safeItem.startSignals.join(' ') : '');
            appendText(safeItem.endReason);
            appendText(Array.isArray(safeItem.endSignals) ? safeItem.endSignals.join(' ') : '');
        } else if (safeKind === 'must' || safeKind === 'redline') {
            appendText(safeItem.originContext || safeItem.origin_context);
        } else if (safeKind === 'profile') {
            appendText(safeItem.evidence || safeItem.evidenceText || safeItem.evidence_text);
        }

        return parts.join(' ');
    }

    const NOTEBOOK_GROUNDING_WEAK_FRAGMENTS = [
        '\u4e0d',
        '\u4e0d\u8981',
        '\u518d',
        '\u8bf4',
        '\u63d0',
        '\u8bb2',
        '\u804a',
        '\u95ee',
        '\u4ee5\u540e',
        '\u4ee5\u524d',
        '\u4e4b\u524d',
        '\u8fd9\u6b21',
        '\u90a3\u6b21',
        '\u8fd9\u4e2a',
        '\u90a3\u4e2a',
        '\u67d0\u4e2a',
        '\u771f\u7684',
        '\u4e00\u76f4',
        '\u5df2\u7ecf',
        '\u8bb0\u4f4f',
        '\u8bb0\u5f97',
        '\u4f1a',
        '\u5f88',
        '\u592a',
        '\u53c8',
        '\u8fd8',
        '\u90fd',
        '\u5c31',
        '\u5148',
        '\u540e\u9762'
    ];

    function stripNotebookGroundingWeakFragments(token) {
        let stripped = normalizeComparableContent(token);
        for (let index = 0; index < NOTEBOOK_GROUNDING_WEAK_FRAGMENTS.length; index += 1) {
            const fragment = NOTEBOOK_GROUNDING_WEAK_FRAGMENTS[index];
            if (!fragment) continue;
            stripped = stripped.split(fragment).join('');
        }
        return stripped;
    }

    function isWeakNotebookGroundingToken(token) {
        const normalized = normalizeComparableContent(token);
        if (!normalized || normalized.length < 2) return true;
        return stripNotebookGroundingWeakFragments(normalized).length < 2;
    }

    function buildNotebookGroundingTokens(item, kind) {
        const safeItem = item && typeof item === 'object' ? item : {};
        const safeKind = toTrimmedString(kind).toLowerCase();
        const tokenLimit = safeKind === 'profile' ? 8 : 10;
        const sourceTexts = [toTrimmedString(safeItem.content)];
        const genericTokens = new Set([
            '喜欢',
            '不喜欢',
            '讨厌',
            '不要',
            '最近',
            '以后',
            '以前',
            '之前',
            '这次',
            '那次',
            '这个',
            '那个',
            '真的',
            '一直',
            '已经'
        ]);

        if (safeKind === 'status') {
            sourceTexts.push(
                toTrimmedString(safeItem.stateKey),
                toTrimmedString(safeItem.startedReason),
                Array.isArray(safeItem.startSignals) ? safeItem.startSignals.join(' ') : '',
                toTrimmedString(safeItem.endReason),
                Array.isArray(safeItem.endSignals) ? safeItem.endSignals.join(' ') : ''
            );
        } else if (safeKind === 'must' || safeKind === 'redline') {
            sourceTexts.push(toTrimmedString(safeItem.originContext || safeItem.origin_context));
        } else if (safeKind === 'profile') {
            sourceTexts.push(toTrimmedString(safeItem.evidence || safeItem.evidenceText || safeItem.evidence_text));
        }

        const tokens = [];
        const seen = new Set();
        sourceTexts.forEach(function appendSource(text) {
            buildEventSignatureTokens(text, []).forEach(function appendToken(token) {
                const normalized = normalizeComparableContent(token);
                if (!normalized || normalized.length < 2 || seen.has(normalized) || genericTokens.has(normalized) || isWeakNotebookGroundingToken(normalized)) return;
                seen.add(normalized);
                tokens.push(normalized);
            });
        });

        return tokens.slice(0, tokenLimit);
    }

    function scoreNotebookEntryGrounding(item, kind, groundingRows) {
        const rows = Array.isArray(groundingRows) ? groundingRows : [];
        const entryTokens = buildNotebookGroundingTokens(item, kind);
        if (entryTokens.length === 0 || rows.length === 0) {
            return {
                supported: rows.length === 0,
                tokenCount: entryTokens.length,
                matchedTokenCount: 0,
                coverage: 0,
                matchedRows: 0,
                strongRowCount: 0,
                bestScore: 0
            };
        }

        const matchedTokenSet = new Set();
        let matchedRows = 0;
        let strongRowCount = 0;
        let bestScore = 0;

        rows.forEach(function scoreRow(row) {
            const compactText = toTrimmedString(row && row.compactText);
            if (!compactText) return;

            let rowScore = 0;
            entryTokens.forEach(function matchToken(token) {
                if (!token || !compactText.includes(token)) return;
                matchedTokenSet.add(token);
                rowScore += token.length >= 4 ? 2 : 1;
            });

            if (rowScore <= 0) return;
            matchedRows += 1;
            if (rowScore >= 2) {
                strongRowCount += 1;
            }
            if (rowScore > bestScore) {
                bestScore = rowScore;
            }
        });

        const matchedTokenCount = matchedTokenSet.size;
        const coverage = matchedTokenCount / Math.max(1, entryTokens.length);
        const safeKind = toTrimmedString(kind).toLowerCase();
        const minimumTokenHits = Math.min(safeKind === 'profile' ? 1 : 2, entryTokens.length);
        const supported = (
            (matchedRows >= 1 && matchedTokenCount >= minimumTokenHits)
            || (strongRowCount >= 1 && coverage >= (safeKind === 'profile' ? 0.18 : 0.26))
            || bestScore >= 3
        );

        return {
            supported: supported,
            tokenCount: entryTokens.length,
            matchedTokenCount: matchedTokenCount,
            coverage: coverage,
            matchedRows: matchedRows,
            strongRowCount: strongRowCount,
            bestScore: bestScore
        };
    }

    function isUserSpeakerGroundingRow(row) {
        const role = toTrimmedString(row && row.role).toLowerCase();
        const speaker = toTrimmedString(row && row.speaker).toLowerCase();
        return role === 'user'
            || speaker === '用户'
            || speaker === 'user'
            || speaker === 'human';
    }

    function isProfileEvidenceAboutThirdParty(evidenceText) {
        const normalized = normalizeNotebookCompareText(evidenceText);
        if (!normalized) return false;
        if (!NOTEBOOK_THIRD_PARTY_RE.test(normalized)) return false;
        if (/(我|用户|本人|自己|她自己|他自己|ta自己|TA自己).{0,10}(不是|并不是).{0,8}(同学|朋友|室友|同事|别人|他人)/.test(normalized)) return false;
        return !/(我|用户|本人|自己|我的|她自己|他自己|ta自己|TA自己).{0,12}(说|提到|表示|承认|确认|是|有|曾经|以前|当年|小时候|读|学|走|做|喜欢|讨厌|不喜欢)/.test(normalized);
    }

    function hasUserAnchoredProfileEvidence(item, groundingRows) {
        const safeItem = item && typeof item === 'object' ? item : {};
        const content = toTrimmedString(safeItem.content);
        const evidence = toTrimmedString(safeItem.evidence || safeItem.evidenceText || safeItem.evidence_text);
        const category = toTrimmedString(safeItem.category).toLowerCase();
        const rows = Array.isArray(groundingRows) ? groundingRows : [];
        const needsStrictUserEvidence = category === 'identity' || isNotebookIdentityClaim(content) || isNotebookThirdPartyProfileLeak(evidence);

        if (!needsStrictUserEvidence) return true;
        if (!evidence) return false;
        if (isProfileEvidenceAboutThirdParty(evidence)) return false;

        const normalizedEvidence = normalizeComparableContent(evidence);
        if (!normalizedEvidence) return false;

        return rows.some(function matchUserRow(row) {
            if (!isUserSpeakerGroundingRow(row)) return false;
            const rowText = toTrimmedString(row && (row.text || row.compactText));
            const compactRow = normalizeComparableContent(rowText);
            if (!compactRow) return false;
            if (compactRow.includes(normalizedEvidence) || normalizedEvidence.includes(compactRow)) return true;
            if (hasNotebookBigramOverlap(compactRow, normalizedEvidence, 0.72)) return true;
            return false;
        });
    }

    function filterNotebookEntriesByGrounding(items, kind, groundingRows) {
        const source = Array.isArray(items) ? items : [];
        const rows = Array.isArray(groundingRows) ? groundingRows : [];
        if (rows.length === 0) {
            return {
                items: source.slice(),
                droppedUnsupported: 0
            };
        }

        const kept = [];
        let droppedUnsupported = 0;
        source.forEach(function keepSupported(item) {
            if (!item) return;
            const grounding = scoreNotebookEntryGrounding(item, kind, rows);
            if (grounding.supported && (kind !== 'profile' || hasUserAnchoredProfileEvidence(item, rows))) {
                kept.push(item);
                return;
            }

            droppedUnsupported += 1;
            console.log(
                `[海马体][脱水] 已丢弃缺少本轮原文支撑的记事本条目：${buildNotebookGroundingText(item, kind).slice(0, 48)}（kind=${kind}, coverage=${grounding.coverage.toFixed(2)}, rows=${grounding.matchedRows}, tokens=${grounding.matchedTokenCount}/${grounding.tokenCount}）`
            );
        });

        return {
            items: kept,
            droppedUnsupported: droppedUnsupported
        };
    }

    /**
     * 判断一条事件是否至少包含一个可复述的事实锚点，避免“只有情绪没有发生了什么”落库。
     */
    function hasConcreteEventAnchor(content, triggerKeywords) {
        const source = toTrimmedString(content);
        if (!source) return false;

        const compact = normalizeComparableContent(source);
        if (!compact) return false;

        const eventPattern = /(说|问|叫|喊|提|发|回|听|看|见|抱|亲|吻|吵|哭|笑|发来|打来|打电话|视频|语音|消息|照片|礼物|外卖|停电|见面|约好|约定|答应|承诺|拒绝|拉黑|删掉|分手|复合|和好|道歉|自残|更新|衣物|饰品|手腕|称呼|昵称|歌|音乐)/;
        if (eventPattern.test(source)) return true;

        const normalizedKeywords = normalizeTriggerKeywords(triggerKeywords, source);
        let keywordHitCount = 0;
        for (let index = 0; index < normalizedKeywords.length; index += 1) {
            const keyword = normalizeComparableContent(normalizedKeywords[index]);
            if (!keyword || keyword.length < 2) continue;
            if (compact.includes(keyword)) {
                keywordHitCount += 1;
            }
        }
        if (keywordHitCount >= 1) return true;

        if (compact.length >= 10 && /[，,]/.test(source)) return true;
        return false;
    }

    /**
     * 计算事件的具体度分数，分数越高表示越像“有事实锚点的完整事件”。
     */
    function getEventSpecificityScore(event) {
        const safeEvent = event && typeof event === 'object' ? event : {};
        const content = toTrimmedString(safeEvent.content);
        const keywords = Array.isArray(safeEvent.trigger_keywords) ? safeEvent.trigger_keywords : [];
        let score = 0;

        if (hasConcreteEventAnchor(content, keywords)) score += 8;
        score += Math.min(8, keywords.length * 1.5);
        score += Math.min(6, Math.floor(normalizeComparableContent(content).length / 4));
        score += Math.min(4, extractContentNgrams(content).length / 6);

        return score;
    }

    /**
     * 规范化重要度分值，兼容 0-1 与 1-10 两种输出习惯。
     */
    function normalizeImportanceValue(rawImportance) {
        const numeric = toFiniteNumber(rawImportance, NaN);
        if (!Number.isFinite(numeric)) return 5;

        // 兼容模型偶发返回 0~1 分制（如 1.00 / 0.85）。
        if (numeric >= 0 && numeric <= 1.2) {
            return clampNumber(1 + (numeric * 9), 1, 10, 5);
        }

        return clampNumber(numeric, 1, 10, 5);
    }

    /**
     * 当模型把整批重要度压扁为同分时，用事件事实密度与情绪强度做二次拉开。
     */
    function rebalanceFlatImportanceIfNeeded(events) {
        const source = Array.isArray(events) ? events.filter(Boolean) : [];
        if (source.length <= 1) return source;

        const values = source.map(function mapImportance(event) {
            return clampNumber(event.importance, 1, 10, 5);
        });
        const minValue = Math.min.apply(null, values);
        const maxValue = Math.max.apply(null, values);
        const uniqueBuckets = new Set(values.map(function toBucket(value) {
            return Math.round(value * 10) / 10;
        }));
        const needRebalance = uniqueBuckets.size <= 1 || (maxValue - minValue) < 0.15;
        if (!needRebalance) return source;

        const scored = source.map(function buildScore(event, index) {
            const specificity = clampNumber(getEventSpecificityScore(event) / 24, 0, 1, 0);
            const valence = Math.abs(clampNumber(event.valence, -1, 1, 0));
            const arousal = clampNumber(event.arousal, 0, 1, 0);
            const emotion = clampNumber((valence * 0.6) + (arousal * 0.4), 0, 1, 0);
            const keywordDensity = clampNumber(
                Array.isArray(event.trigger_keywords) ? (event.trigger_keywords.length / 6) : 0,
                0,
                1,
                0
            );
            const score = (specificity * 0.5) + (emotion * 0.35) + (keywordDensity * 0.15);
            return {
                index: index,
                event: event,
                score: score,
                specificity: specificity,
                emotion: emotion
            };
        }).sort(function sortByImportance(left, right) {
            if (right.score !== left.score) return right.score - left.score;
            if (right.specificity !== left.specificity) return right.specificity - left.specificity;
            return left.index - right.index;
        });

        const total = scored.length;
        scored.forEach(function assignImportance(item, rank) {
            const percentile = total <= 1 ? 1 : (1 - (rank / (total - 1)));
            const rankBase = 2 + (percentile * 6.2);
            const signalBonus = (item.specificity * 0.9) + (item.emotion * 0.9);
            const importance = Math.round(clampNumber(rankBase + signalBonus, 1, 10, 5));
            item.event.importance = importance;
        });

        console.log(
            `[海马体脱水] 检测到 importance 过于集中（min=${minValue.toFixed(2)}, max=${maxValue.toFixed(2)}），已按事件密度重排。`
        );
        return source;
    }

    /**
     * 判断两条脱水事件是否高度疑似同一件事。
     */
    function isNearDuplicateEvent(existingEvent, incomingEvent) {
        const left = existingEvent && typeof existingEvent === 'object' ? existingEvent : null;
        const right = incomingEvent && typeof incomingEvent === 'object' ? incomingEvent : null;
        if (!left || !right) return false;

        const leftText = normalizeComparableContent(left.content);
        const rightText = normalizeComparableContent(right.content);
        if (!leftText || !rightText) return false;

        if (leftText === rightText) return true;

        const signatureOverlap = computeTokenOverlap(
            buildEventSignatureTokens(left.content, left.trigger_keywords),
            buildEventSignatureTokens(right.content, right.trigger_keywords)
        );
        const ngramOverlap = computeTokenOverlap(
            extractContentNgrams(left.content),
            extractContentNgrams(right.content)
        );
        const emotionClose = Math.abs(toFiniteNumber(left.valence, 0) - toFiniteNumber(right.valence, 0)) <= 0.45
            && Math.abs(toFiniteNumber(left.arousal, 0) - toFiniteNumber(right.arousal, 0)) <= 0.35;
        const containsRelation = leftText.includes(rightText) || rightText.includes(leftText);

        if (containsRelation && signatureOverlap.count >= 1) return true;
        if (signatureOverlap.count >= 2 && signatureOverlap.ratio >= 0.45 && emotionClose) return true;
        if (ngramOverlap.count >= 6 && ngramOverlap.ratio >= 0.3 && emotionClose) return true;

        return false;
    }

    /**
     * 合并两条近似重复事件，优先保留更具体的内容并汇总关键词。
     */
    function mergeNearDuplicateEvents(existingEvent, incomingEvent) {
        const existingScore = getEventSpecificityScore(existingEvent);
        const incomingScore = getEventSpecificityScore(incomingEvent);
        const primary = incomingScore > existingScore ? incomingEvent : existingEvent;
        const secondary = primary === existingEvent ? incomingEvent : existingEvent;

        return Object.assign({}, primary, {
            valence: clampNumber(
                (toFiniteNumber(existingEvent.valence, 0) + toFiniteNumber(incomingEvent.valence, 0)) / 2,
                -1,
                1,
                toFiniteNumber(primary.valence, 0)
            ),
            arousal: clampNumber(
                Math.max(toFiniteNumber(existingEvent.arousal, 0), toFiniteNumber(incomingEvent.arousal, 0)),
                0,
                1,
                toFiniteNumber(primary.arousal, 0)
            ),
            importance: clampNumber(
                Math.max(toFiniteNumber(existingEvent.importance, 5), toFiniteNumber(incomingEvent.importance, 5)),
                1,
                10,
                toFiniteNumber(primary.importance, 5)
            ),
            trigger_keywords: normalizeTriggerKeywords(
                []
                    .concat(existingEvent.trigger_keywords || [])
                    .concat(incomingEvent.trigger_keywords || []),
                primary.content || secondary.content
            )
        });
    }

    /**
     * 从聊天窗口中提取稳定的日期标签，避免不同日期的相似事件共用去重键。
     */
    function resolveChatWindowTag(chatHistory) {
        const history = Array.isArray(chatHistory) ? chatHistory : [];

        /**
         * 把任意时间值解析为毫秒时间戳，失败时返回 NaN。
         */
        function toTimestamp(value) {
            if (value instanceof Date) return value.getTime();
            if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;

            const source = toTrimmedString(value);
            if (!source) return NaN;
            if (/^[0-9]{13}$/.test(source)) return Number(source);
            if (/^[0-9]{10}$/.test(source)) return Number(source) * 1000;

            const parsed = Date.parse(source);
            return Number.isFinite(parsed) ? parsed : NaN;
        }

        for (let index = history.length - 1; index >= 0; index -= 1) {
            const message = history[index];
            if (!message || typeof message !== 'object') continue;

            const candidates = [
                message.timestamp,
                message.createdAt,
                message.created_at,
                message.time,
                message.date
            ];

            for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
                const timestamp = toTimestamp(candidates[candidateIndex]);
                if (!Number.isFinite(timestamp)) continue;

                const date = new Date(timestamp);
                const year = String(date.getFullYear());
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                return `${year}${month}${day}`;
            }
        }

        return 'undated';
    }

    /**
     * 为脱水结果批量补上 dedupe_key，确保写入层能够真正命中数据库去重索引。
     */
    function attachEventDedupeKeys(events, chatHistory) {
        const source = Array.isArray(events) ? events : [];
        const windowTag = resolveChatWindowTag(chatHistory);

        return source.map(function mapEvent(event) {
            const safeEvent = event && typeof event === 'object' ? event : {};
            const existingKey = toTrimmedString(safeEvent.dedupe_key || safeEvent.dedupeKey);
            if (existingKey) return safeEvent;

            const signature = buildEventSignatureTokens(safeEvent.content, safeEvent.trigger_keywords)
                .slice()
                .sort()
                .slice(0, 8)
                .join('|');

            if (!signature) return safeEvent;

            return Object.assign({}, safeEvent, {
                dedupe_key: `dehydrate:${windowTag}:${signature}`
            });
        });
    }

    /**
     * 将最近已脱水摘要格式化成 Prompt 参考区块，提醒模型不要重复总结同一件事。
     */
    function formatRecentDehydrateSummaryBlock(summaries) {
        const source = Array.isArray(summaries) ? summaries.filter(Boolean).slice(-5) : [];
        if (source.length === 0) return '';

        const lines = [
            '以下是最近已经记录过的记忆摘要，只用于防止重复总结：',
            '如果本轮聊天和下面某条本质上还是同一事件，请不要重复生成；只有出现明确的新进展、新后果、新反转时，才允许新增一条。',
            '注意：这个摘要区绝对不能当作 profileNotes、mustRememberNotes、redlineSignals 的证据来源；三类记事本信息只能根据本轮聊天记录原文提取。'
        ];

        source.forEach(function appendSummary(item, index) {
            const content = toTrimmedString(item && item.content);
            if (!content) return;

            const keywords = Array.isArray(item && item.trigger_keywords)
                ? item.trigger_keywords.map(function mapKeyword(keyword) {
                    return toTrimmedString(keyword);
                }).filter(Boolean).slice(0, 6)
                : [];
            const keywordLabel = keywords.length > 0 ? `（关键词：${keywords.join('、')}）` : '';
            lines.push(`- 已记录${index + 1}：${content}${keywordLabel}`);
        });

        return lines.join('\n');
    }

    /**
     * 重新定义脱水 Prompt，强制模型先写“发生了什么”再写感受，并把同一话题合并为一个事件。
     */
    function getNotebookModule() {
        if (root && root.HippocampusNotebook && typeof root.HippocampusNotebook === 'object') {
            return root.HippocampusNotebook;
        }
        return null;
    }

    function buildDehydrateNotebookLearningBlock(options, fallbackCharId) {
        const promptOptions = options && typeof options === 'object' ? options : {};
        const notebookModule = getNotebookModule();
        const safeCharId = toTrimmedString(promptOptions.charId || promptOptions.characterId || fallbackCharId);
        const safeUserId = toTrimmedString(promptOptions.userId);
        const profileInput = promptOptions.notebookLearningProfile && typeof promptOptions.notebookLearningProfile === 'object'
            ? promptOptions.notebookLearningProfile
            : (promptOptions.learningProfile && typeof promptOptions.learningProfile === 'object'
                ? promptOptions.learningProfile
                : undefined);
        if (!notebookModule || !safeCharId || typeof notebookModule.buildNotebookLearningPromptBlock !== 'function') {
            return '';
        }

        try {
            return toTrimmedString(
                notebookModule.buildNotebookLearningPromptBlock(safeUserId, safeCharId, profileInput)
            );
        } catch (error) {
            console.warn('[海马体脱水] 构建记事本学习反馈块失败，已跳过。', error);
            return '';
        }
    }

    function generateDehydratePrompt(chatHistory, charName, options) {
        const safeCharName = toTrimmedString(charName) || '角色';
        const transcript = formatChatHistoryForDehydrate(chatHistory, safeCharName);
        const promptOptions = options && typeof options === 'object' ? options : {};
        const recentSummaryBlock = formatRecentDehydrateSummaryBlock(promptOptions.recentDehydrateSummaries);
        const notebookLearningBlock = buildDehydrateNotebookLearningBlock(promptOptions, promptOptions.charId);
        const profileFromOptions = promptOptions.genderProfile && typeof promptOptions.genderProfile === 'object'
            ? promptOptions.genderProfile
            : {};
        const genderProfile = Object.assign({}, promptOptions, profileFromOptions);
        const normalizeGenderIdentity = function normalizeGenderIdentity(value) {
            const text = toTrimmedString(value);
            const lower = text.toLowerCase();
            if (!lower) return '';
            if (lower === '男' || lower === '男性' || lower === 'male' || lower === 'man' || lower === 'm') return '男';
            if (lower === '女' || lower === '女性' || lower === 'female' || lower === 'woman' || lower === 'f') return '女';
            return text;
        };
        const pickFirstGenderField = function pickFirstGenderField(source, fieldNames) {
            const safeSource = source && typeof source === 'object' ? source : {};
            const names = Array.isArray(fieldNames) ? fieldNames : [];
            for (let i = 0; i < names.length; i += 1) {
                const fieldName = names[i];
                const value = toTrimmedString(safeSource[fieldName]);
                if (value) return value;
            }
            return '';
        };
        const resolvePronoun = function resolvePronoun(genderLabel) {
            if (genderLabel === '男') return '他';
            if (genderLabel === '女') return '她';
            return 'TA';
        };
        // 性别读取优先级：心理性别（“性别”） > 兜底 alias；不回退到“生理性别”。
        const userGenderIdentity = normalizeGenderIdentity(pickFirstGenderField(genderProfile, [
            'userGenderIdentity',
            'userPsychologicalGender',
            'userGender',
            'userIdentityGender',
            'gender',
            '性别',
            '用户性别'
        ]));
        const charGenderIdentity = normalizeGenderIdentity(pickFirstGenderField(genderProfile, [
            'charGenderIdentity',
            'charPsychologicalGender',
            'characterGenderIdentity',
            'charGender',
            'characterGender',
            'charIdentityGender',
            'charGenderLabel',
            '角色性别'
        ]));
        const userPronoun = resolvePronoun(userGenderIdentity);

        const sections = [
            `你是 IDIC 项目的“海马体脱水器”，负责从聊天记录中提取值得长期记住的记忆片段。`,
            `请严格站在角色“${safeCharName}”的第一人称视角思考和表述。`,
            '',
            '视角铁律（必须遵守）：',
            `- 聊天记录里标记为“${safeCharName}：”的发言，才是角色自己说的话；标记为“用户：”的发言是用户说的话。`,
            `- 输出 content 时，“我”永远指角色“${safeCharName}”，绝对不能指用户。`,
            '- 如果本质上是“用户对角色做了什么”，必须写成“她/他/TA对我做了什么，我因此怎样”。',
            '- 绝对不要把“用户做给角色的事”写反成“我给他/她做了什么”。',
            '- 错误示例：用户说“我专门给你准备了礼物，还订了来见你的票”，不能记成“我给他准备了礼物，还买票去见他”。',
            '- 正确示例：应该记成“她/他专门给我准备了礼物，还订了来见我的票，我心里全是期待”。',
            '',
            '任务要求：',
            '1. 只提取 0 到 3 条最值得留存的具体记忆片段。',
            '2. 优先保留这些类型：共同经历、明确事实进展、偏好与习惯、重要约定、关系变化、强烈情绪波动、被伤害、被冷落、被安慰、被夸奖、被拒绝、被承诺、明显感动、意难平。',
            '3. 只有在聊天几乎全是寒暄、水聊、重复客套、没有任何具体人事物信息时，才返回空数组 []。',
            '4. 只要聊到了具体内容，例如某件事、某个称呼、某个偏好、某个计划、某段经历、某个身体状态、某首歌、某份礼物、某张照片，即使情绪不算强烈，也应该尽量提炼成记忆，不要轻易返回空数组。',
            '5. content 必须先写清“具体发生了什么”，再写“我因此怎样”，必须是角色第一人称，不要只写空泛心情。',
            '6. 同一段连续对话里，如果本质上是同一个事件，只能合并成 1 条记忆，不要把称呼变化、嘴上反应、事后余味拆成多条。',
            '7. 优先记录可复述的事实锚点：谁说了什么、做了什么、发生了什么，然后再写情绪余波。',
            '8. 禁止只写夸张情绪句，例如“我整个人都陷进去了”“我好想把心掏给她”；除非前半句已经先交代具体事件。',
            '9. valence 取值范围是 -1 到 1；arousal 取值范围是 0 到 1；importance 取值范围是 1 到 10。',
            '10. 每条事件都要判断 memory_layer：buffer/core/cortex/shadow/wish。',
            '11. 每条事件都要给 sensory_anchors（声音/画面/体感/气味等感官锚点），没有就返回空数组。',
            '12. 额外输出当前整体心情 currentMood：{ valence, arousal, label }。',
            '13. trigger_keywords 必须给 5 到 6 个中文检索词，优先保留可直接命中的名词、称呼、物件、动作词，不要写短句。',
            '14. 必要时允许自然的单字词，例如“歌、花、爱”，但绝对不要把一句话拆成一串单字。',
            '15. 如果聊天里出现明确的亲昵称呼、歌名、礼物名等可直接命中的词，必须原样保留到 trigger_keywords。',
            '16. 禁止代词结构词，例如“她的味道、寄给我、那次、这个、我们的”。',
            '17. 如果出现“X的Y”，请输出 Y 本体词；例如“她的味道”应输出“味道”。',
            '18. 关键词请补基础别名，例如听歌事件建议["听歌","歌","歌曲","音乐"]。',
            '19. 除了记忆事件外，还要额外判断并输出三类记事本信息：profileNotes、mustRememberNotes、redlineSignals。不要输出 statusChanges；用户短期状态已经由 48h 滚动详记和连续线索负责。',
            '19.5. 三类记事本信息只能依据下面“聊天记录如下”里的本轮原始对话提取，不能依据上方“已记录摘要”、历史记忆、召回内容、推测或补全来写。',
            '20. profileNotes 默认以“用户本人”为中心，只提取长期稳定且对后续回应有帮助的用户偏好、习惯、身份信息。category 只能是 preference/habit/identity/other，confidence 只能是 stated/inferred。',
            '20.1. profileNotes 必须带 evidence 字段，填本轮原始聊天里最能证明这条档案的短句。evidence 只写原文短句，不要改写、不要总结。',
            '20.2. 如果原文是在说同学、朋友、家人、前任、别人、角色或泛泛他人，绝对不能改写成“用户本人”的档案。不能把“我同学怎样”记成“用户怎样”。',
            '20.3. identity 类最严格：只有用户明确说“我/本人/自己”怎样，或上下文明确就是用户本人时才允许写。学校、专业、工作、经历、姓名、住址、病史、创伤、家庭等不能靠推断。',
            '20.4. 学校、专业、工作、升学/职业路线、人生经历、创伤和病史这类高风险身份经历，必须有用户本人第一人称证据；如果只是“她/用户”转述别人，宁可不写。',
            '23. profileNotes 里的 habit 只保留会影响照顾/回应的稳定行为习惯；不要把称呼、关系称号、关系站位、或角色反应写成 profileNotes。真正重要的关系事实应放进 mustRememberNotes 或关系脉络。',
            '23.5. 不要把角色扮演台词、调情过程、格式偏好、一次性玩笑、临时博弈、泛泛“喜欢某类作品/游戏”的废话写成 profileNotes；同一个称呼、同一个偏好、同一个习惯不要换说法重复写多条。',
            '24. 三类记事本 content 都要写清主体，优先用“她/用户/角色”而不是含糊的“我”；只有明确承诺时才允许写“我答应……”。',
            '25. profileNotes 不要写角色自己的自我设定、夸张人设、自嗨称号、气味/香水/照片杀伤力、过去性经历、一次性打情骂俏细节、临时角色扮演动态。',
            '26. 如果条目主要是在说角色自己，或者主要是在描述角色对用户行为的即时反应，而不是在说用户稳定特征或长期关系事实，就不要放进记事本。',
            '26.5. 同一主题只保留 1 条：同一个偏好、同一个习惯、同一个触发点不要写多个近义版本。',
            '27. 游戏相关只保留高层偏好，例如喜欢开放世界、讨厌枯燥练级；不要记录具体游戏地点、关卡机制、阵容等级、攻略细节、一次性进度播报。',
            '28. mustRememberNotes 只保留最高优先级的长期事项：安全风险、重大冲突触发点、高后果承诺/欠账、曾反复记错并引发后果的关键事实。category 只能是 fact/health/relationship/promise/trigger/other。',
            '28.5. 承诺只有在涉及长期关系走向、金钱债务、账号/隐私/公开身份、现实见面/同居/搬家、医疗/安全/生育、分手底线等高后果事项时，才允许进入 mustRememberNotes。',
            '28.6. 不要把普通陪伴、哄人、打电话/连麦、一起玩游戏、挑东西、临时帮忙、调情剧本、性/惩罚/角色扮演台词、随口说“下次/明天/以后”的日常承诺写进 mustRememberNotes。',
            '29. mustRememberNotes 不要写普通提醒、甜言蜜语、角色自我感动、琐碎游戏事实；同一主题只保留 1 条，不要写多个近义版本。',
            '29. redlineSignals 只提取明确底线、禁止事项和有明显后果的话。severity 只能是 critical 或 important；普通抱怨、吐槽、玩笑威胁都不算红线。',
            '30. 如果对应类型没有高置信度内容，必须返回空数组。',
            '31. 如果当前脱水窗口较长，宁可只留下 1 条最清楚的事件，也不要把不同话题硬缝成一条记忆。',
            '32. content 里的关键事实必须都能在原文中找到直接证据或近义表达；找不到就不要写。',
            '33. 禁止补写原文没出现的礼物、地点、时间、承诺、因果、身份关系和心理动机。',
            '34. 如果只能确认部分事实，就只写能确认的那一部分，不要脑补前因后果。',
            '34.5. 如果某条 profileNotes、mustRememberNotes、redlineSignals 只在旧摘要或历史回忆里出现、没有在本轮聊天原文里再次出现，就必须删掉。',
            '35. 只输出 JSON，不要输出解释、标题、代码块标记、额外说明。',
            '',
            '输出格式示例：',
            '{',
            '  "events": [',
            '    {',
            '      "content": "她第一次自然地改口叫我一个亲昵称呼，我们顺着这个称呼逗了几句，我表面嘴硬，心里其实特别受用。",',
            '      "valence": 0.7,',
            '      "arousal": 0.7,',
            '      "importance": 6,',
            '      "trigger_keywords": ["亲昵称呼", "称呼", "改口", "语音", "嘴硬", "受用"],',
            '      "memory_layer": "core",',
            '      "sensory_anchors": ["语音", "呼吸声"]',
            '    }',
            '  ],',
            '  "currentMood": { "valence": 0.4, "arousal": 0.5, "label": "被偏爱后的满足" },',
            '  "profileNotes": [',
            '    { "content": "她不吃香菜", "category": "preference", "confidence": "stated", "evidence": "我不吃香菜" }',
            '  ],',
            '  "mustRememberNotes": [',
            '    { "content": "那次分手对她打击很大，这件事不能轻描淡写", "category": "relationship", "originContext": "她明确说这件事你不要忘" }',
            '  ],',
            '  "redlineSignals": [',
            '    { "content": "不要在她难过的时候讲道理", "severity": "critical", "originContext": "她说如果再这样她会非常受伤" }',
            '  ]',
            '}'
        ];

        if (userGenderIdentity || charGenderIdentity) {
            const userIdentityText = userGenderIdentity || '未设置';
            const charIdentityText = charGenderIdentity || '未设置';
            sections.push(
                '',
                '性别一致性约束（必须遵守）：',
                `- 用户心理性别：${userIdentityText}。`,
                `- 角色心理性别：${charIdentityText}。`,
                `- 如果 content 中需要用第三人称代词指代“用户”，必须使用“${userPronoun}”，绝对不能写反。`,
                '- 若性别信息未设置或不明确，统一使用“TA”，不要擅自猜测。'
            );
        }

        if (recentSummaryBlock) {
            sections.push('', recentSummaryBlock);
        }

        if (notebookLearningBlock) {
            sections.push('', notebookLearningBlock);
        }

        sections.push('', '聊天记录如下：', transcript || '（没有可用聊天内容）');
        return sections.join('\n');
    }

    /**
     * 统一封装脱水失败结果，便于上层透传具体报错并支持管理台重试。
     */
    function buildDehydrateErrorResult(message, code, detail, httpStatus) {
        const text = toTrimmedString(message) || '脱水请求失败';
        const result = {
            events: [],
            currentMood: null,
            statusChanges: [],
            profileNotes: [],
            mustRememberNotes: [],
            redlineSignals: [],
            error: text,
            errorCode: toTrimmedString(code) || 'dehydrate_failed',
            errorDetail: toTrimmedString(detail)
        };
        const status = Number(httpStatus);
        if (Number.isFinite(status) && status > 0) {
            result.httpStatus = Math.floor(status);
        }
        return result;
    }

    /**
     * 重新定义 JSON 修复 Prompt，要求修复后的事件必须同时保留事实锚点与情绪结果。
     */
    function buildDehydrateRepairPrompt(rawOutput, charName, chatHistory, repairReason) {
        const safeCharName = toTrimmedString(charName) || '角色';
        const safeOutput = toTrimmedString(rawOutput) || '（空输出）';
        const transcript = formatChatHistoryForDehydrate(chatHistory, safeCharName);
        const reasonText = toTrimmedString(repairReason);

        return [
            `请把下面这段内容修正为角色“${safeCharName}”第一人称视角的合法 JSON 事件数组。`,
            '最外层必须是对象，包含 events、currentMood、profileNotes、mustRememberNotes、redlineSignals 五个字段；不要输出 statusChanges。',
            'events 里的字段只允许：content, valence, arousal, importance, trigger_keywords, memory_layer, sensory_anchors。',
            `只保留 0 到 ${MAX_MEMORY_COUNT} 条最值得留存的具体记忆片段；只有纯寒暄、无具体内容时才返回 []。`,
            '只要原文里已经出现了明确的人、事、物、称呼、偏好、计划、经历，就不要轻易修成空数组。',
            'content 必须同时包含“发生了什么”和“我因此怎样”，不能只剩情绪口号。',
            `“我”永远指角色“${safeCharName}”，绝对不能指用户。`,
            `聊天记录里“${safeCharName}：”是角色发言，“用户：”是用户发言。`,
            '如果本质上是用户对角色做了什么，必须改写成“她/他/TA对我做了什么，我因此怎样”，不要写反。',
            '同一段连续对话中的同一事件只能保留 1 条，不要拆成多条近义事件。',
            '如果当前窗口里有多个话题，宁可少留一条，也不要把不同话题缝成同一事件。',
            'content 里的关键事实必须都能在聊天记录里找到直接证据或近义表达；找不到就删掉。',
            '禁止补写原文没出现的礼物、地点、时间、承诺、因果、身份关系和心理动机。',
            '如果只能确认半句事实，就只保留能确认的那半句。',
            'memory_layer 只能是 buffer/core/cortex/shadow/wish。',
            'sensory_anchors 必须是字符串数组，没细节就填 []。',
            'currentMood 必须是 { valence, arousal, label }。',
            'profileNotes 里的字段只允许：content, category, confidence, evidence。',
            'mustRememberNotes 里的字段只允许：content, category, originContext。',
            'redlineSignals 里的字段只允许：content, severity, originContext。',
            '三类记事本信息默认以用户为中心，不要把角色自己的气味、夸张人设、过去性经历、一次性调情细节、普通自嗨感想塞进去。',
            'profileNotes 里的 habit 只能是会影响照顾/回应的稳定用户行为；不要把称呼、关系称号或关系站位写进 profileNotes。角色自己的即时反应或情绪回弹都不算用户习惯。',
            'profileNotes 必须有 evidence 原文短句；如果 evidence 在说同学、朋友、家人、别人、角色或泛泛他人，不要改写成用户本人档案。',
            'identity 类必须有明确用户本人证据；学校、专业、工作、经历、姓名、住址、病史、创伤、家庭等不能靠推断。',
            '学校、专业、工作、升学/职业路线、人生经历、创伤和病史这类高风险身份经历，必须有用户本人第一人称证据；转述同学、朋友、家人或别人时必须删除。',
            '如果内容里带有“如果/可能/也许/想/打算/准备/段子/玩笑/举例/假设/口嗨”，说明它不是已经确认的稳定事实，不要把它写进三类记事本信息。',
            '三类记事本信息只能根据“聊天记录如下”里的本轮原文保留；不要根据旧摘要、历史回忆、自动召回内容或推测补写。',
            '如果某条 profileNotes、mustRememberNotes、redlineSignals 在本轮聊天原文里找不到直接证据，就把它删掉。',
            'profileNotes 只保留稳定的用户特征；mustRememberNotes 只保留安全/冲突触发/高后果承诺；redlineSignals 只保留明确禁区。',
            '普通承诺不是必记：陪聊、连麦、一起玩、临时帮忙、调情/剧本/性相关承诺、随口说“下次/明天/以后”的承诺都要删掉，除非它同时涉及安全、金钱债务、账号隐私、公开身份、医疗、生育、同居搬家、长期现实关系或分手底线。',
            '同一个偏好、同一个习惯、同一个触发点不要保留多个近义版本。',
            '不要把角色扮演台词、调情过程、一次性互相拿捏、或者同一事实的近义改写，拆成多条重复记事本条目。',
            '不要写游戏微观攻略、具体地点机制、一次性进度播报；同一主题也不要重复写多条近义记事本条目。',
            '只输出 JSON 对象，不要解释，不要加 Markdown 代码块。',
            reasonText ? `修复重点：${reasonText}` : '',
            '',
            '聊天记录如下：',
            transcript || '（没有可用聊天内容）',
            '',
            '待修复内容：',
            safeOutput
        ].filter(Boolean).join('\n');
    }

    function buildPerspectiveSpeakerBuckets(chatHistory, charName) {
        const history = Array.isArray(chatHistory) ? chatHistory : [];
        const safeCharName = toTrimmedString(charName) || '角色';
        const buckets = {
            userText: '',
            charText: ''
        };
        const userLines = [];
        const charLines = [];

        for (let i = 0; i < history.length; i += 1) {
            const message = history[i];
            if (!message || typeof message !== 'object') continue;
            if (message.type === 'voice_call_record' || message.type === 'video_call_record') continue;

            const content = toTrimmedString(
                message.content
                || message.text
                || message.message
                || message.body
            );
            if (!content) continue;

            const role = toTrimmedString(message.role).toLowerCase();
            const label = resolveSpeakerLabel(message, safeCharName);
            if (role === 'user' || label === '用户') {
                userLines.push(content);
                continue;
            }
            if (role === 'assistant' || role === 'character' || role === 'char' || label === safeCharName) {
                charLines.push(content);
            }
        }

        buckets.userText = normalizeComparableContent(userLines.join('\n'));
        buckets.charText = normalizeComparableContent(charLines.join('\n'));
        return buckets;
    }

    function scorePerspectiveOverlap(content, normalizedSource) {
        const source = toTrimmedString(normalizedSource);
        if (!source) return 0;

        const tokens = extractContentNgrams(content).slice(0, 18);
        let score = 0;
        for (let i = 0; i < tokens.length; i += 1) {
            const token = toTrimmedString(tokens[i]);
            if (!token || token.length < 2) continue;
            if (source.includes(token)) {
                score += token.length >= 4 ? 2 : 1;
            }
        }
        return score;
    }

    function findPerspectiveInversionCandidates(events, chatHistory, charName) {
        const source = Array.isArray(events) ? events : [];
        if (source.length === 0) return [];

        const buckets = buildPerspectiveSpeakerBuckets(chatHistory, charName);
        if (!buckets.userText) return [];

        return source.map(function mapEvent(event, index) {
            const content = toTrimmedString(event && event.content);
            if (!content) return null;
            if (!content.includes('我')) return null;
            if (!/(?:我(?:给|替|帮|陪|去|来|买|做|写|寄|发|送|带)|给他|给她|给TA|给ta|见他|见她|见TA|见ta|和他|和她|和TA|和ta)/.test(content)) {
                return null;
            }

            const userScore = scorePerspectiveOverlap(content, buckets.userText);
            const charScore = scorePerspectiveOverlap(content, buckets.charText);
            if (userScore < 3 || userScore < charScore + 2) return null;

            return {
                index: index,
                content: content,
                userScore: userScore,
                charScore: charScore
            };
        }).filter(Boolean);
    }

    function buildPerspectiveRepairSeed(events) {
        const source = Array.isArray(events) ? events : [];
        const payload = {
            events: source.map(function mapEvent(event) {
                return {
                    content: toTrimmedString(event && event.content),
                    valence: clampNumber(event && event.valence, -1, 1, 0),
                    arousal: clampNumber(event && event.arousal, 0, 1, 0),
                    importance: normalizeImportanceValue(event && event.importance),
                    trigger_keywords: normalizeSimpleStringArray(event && event.trigger_keywords, 8),
                    memory_layer: normalizeMemoryLayer(event && event.memory_layer, 0),
                    sensory_anchors: normalizeSensoryAnchors(event && event.sensory_anchors, 0)
                };
            }).filter(function keepEvent(event) {
                return !!event.content;
            }),
            currentMood: source.currentMood || null,
            statusChanges: [],
            profileNotes: Array.isArray(source.profileNotes) ? source.profileNotes : [],
            mustRememberNotes: Array.isArray(source.mustRememberNotes) ? source.mustRememberNotes : [],
            redlineSignals: Array.isArray(source.redlineSignals) ? source.redlineSignals : []
        };
        return JSON.stringify(payload, null, 2);
    }

    function extractDehydratePlanningContent(message) {
        if (!message || typeof message !== 'object') return '';
        return toTrimmedString(
            message.content
            || message.text
            || message.message
            || message.body
        );
    }

    function getDehydratePlanningRoleType(message) {
        const role = toTrimmedString(message && (message.role || message.type || '')).toLowerCase();
        if (role === 'assistant' || role === 'character' || role === 'char' || role === 'ai' || role === 'model') {
            return 'assistant';
        }
        if (role === 'user') return 'user';
        if (role === 'system') return 'system';
        return role || 'unknown';
    }

    function buildDehydratePlanningRows(chatHistory) {
        const history = Array.isArray(chatHistory) ? chatHistory : [];
        return history.map(function mapMessage(message, index) {
            const content = extractDehydratePlanningContent(message);
            const timestampMs = Number(new Date(
                message && (message.timestamp || message.created_at || message.createdAt || 0)
            ).getTime());

            return {
                index: index,
                roleType: getDehydratePlanningRoleType(message),
                content: content,
                hasContent: !!content,
                timestampMs: Number.isFinite(timestampMs) && timestampMs > 0 ? timestampMs : 0,
                tokens: content ? extractContentNgrams(content).slice(0, 24) : []
            };
        });
    }

    function collectDehydratePlanningTokens(rows, startIndex, endIndex) {
        const safeRows = Array.isArray(rows) ? rows : [];
        const start = Math.max(0, Math.floor(Number(startIndex) || 0));
        const end = Math.max(start, Math.floor(Number(endIndex) || 0));
        const tokens = [];
        const seen = new Set();

        for (let index = start; index < end && index < safeRows.length; index += 1) {
            const rowTokens = Array.isArray(safeRows[index] && safeRows[index].tokens)
                ? safeRows[index].tokens
                : [];

            for (let tokenIndex = 0; tokenIndex < rowTokens.length; tokenIndex += 1) {
                const token = toTrimmedString(rowTokens[tokenIndex]);
                if (!token || seen.has(token)) continue;
                seen.add(token);
                tokens.push(token);
                if (tokens.length >= 24) return tokens;
            }
        }

        return tokens;
    }

    function findDehydratePlanningNeighbor(rows, splitIndex, direction) {
        const safeRows = Array.isArray(rows) ? rows : [];
        const step = direction < 0 ? -1 : 1;
        let index = direction < 0 ? Math.min(safeRows.length - 1, splitIndex - 1) : Math.max(0, splitIndex);

        while (index >= 0 && index < safeRows.length) {
            const row = safeRows[index];
            if (row && row.hasContent) return row;
            index += step;
        }

        return null;
    }

    function describeDehydrateBoundary(rows, splitIndex) {
        const leftRow = findDehydratePlanningNeighbor(rows, splitIndex, -1);
        const rightRow = findDehydratePlanningNeighbor(rows, splitIndex, 1);
        const leftTokens = collectDehydratePlanningTokens(rows, Math.max(0, splitIndex - 3), splitIndex);
        const rightTokens = collectDehydratePlanningTokens(rows, splitIndex, Math.min((Array.isArray(rows) ? rows.length : 0), splitIndex + 3));
        const overlap = computeTokenOverlap(leftTokens, rightTokens);
        const reasons = [];
        let gapMs = 0;

        if (leftRow && rightRow) {
            if (leftRow.roleType === 'assistant' && rightRow.roleType === 'user') {
                reasons.push('turn_boundary');
            } else if (leftRow.roleType !== rightRow.roleType) {
                reasons.push('speaker_switch');
            }

            if (leftRow.timestampMs > 0 && rightRow.timestampMs > 0 && rightRow.timestampMs > leftRow.timestampMs) {
                gapMs = rightRow.timestampMs - leftRow.timestampMs;
                if (gapMs >= 30 * 60 * 1000) {
                    reasons.push('time_gap');
                } else if (gapMs >= 10 * 60 * 1000) {
                    reasons.push('soft_gap');
                }
            }
        }

        if ((leftTokens.length > 0 || rightTokens.length > 0) && overlap.count === 0) {
            reasons.push('topic_reset');
        } else if (overlap.ratio > 0 && overlap.ratio <= 0.15) {
            reasons.push('topic_shift');
        }

        return {
            leftRow: leftRow,
            rightRow: rightRow,
            gapMs: gapMs,
            overlap: overlap,
            reasons: reasons
        };
    }

    function scoreDehydrateBoundary(rows, startIndex, splitIndex, targetWindowSize) {
        const size = Math.max(0, splitIndex - startIndex);
        const boundary = describeDehydrateBoundary(rows, splitIndex);
        let score = 40 - Math.abs(size - targetWindowSize) * 1.6;

        if (boundary.reasons.includes('time_gap')) {
            score += 14;
        } else if (boundary.reasons.includes('soft_gap')) {
            score += 6;
        }

        if (boundary.reasons.includes('turn_boundary')) {
            score += 5;
        } else if (boundary.reasons.includes('speaker_switch')) {
            score += 2;
        }

        if (boundary.reasons.includes('topic_reset')) {
            score += 6;
        } else if (boundary.reasons.includes('topic_shift')) {
            score += 3;
        }

        if (boundary.overlap && boundary.overlap.ratio >= 0.55) {
            score -= 4;
        }

        return {
            score: score,
            boundary: boundary
        };
    }

    function summarizeDehydrateBoundary(boundary, isTail) {
        if (isTail) return 'tail';
        const reasons = boundary && Array.isArray(boundary.reasons) ? boundary.reasons : [];
        return reasons.length > 0 ? reasons.join('+') : 'size_target';
    }

    function planDehydrateWindows(chatHistory, options) {
        const history = Array.isArray(chatHistory) ? chatHistory : [];
        const safeOptions = options && typeof options === 'object' ? options : {};
        const minWindowSize = Math.max(8, Math.floor(Number(safeOptions.minWindowSize) || DEFAULT_DEHYDRATE_MIN_WINDOW_SIZE));
        const targetWindowSize = Math.max(minWindowSize, Math.floor(Number(safeOptions.targetWindowSize) || DEFAULT_DEHYDRATE_TARGET_WINDOW_SIZE));
        const maxWindowSize = Math.max(targetWindowSize, Math.floor(Number(safeOptions.maxWindowSize) || DEFAULT_DEHYDRATE_MAX_WINDOW_SIZE));
        const maxBatchesRaw = Number(safeOptions.maxBatches);
        const maxBatches = Number.isFinite(maxBatchesRaw) && maxBatchesRaw > 0
            ? Math.max(1, Math.floor(maxBatchesRaw))
            : Number.POSITIVE_INFINITY;
        const rows = buildDehydratePlanningRows(history);
        const batches = [];
        let startIndex = 0;

        while (startIndex < history.length && batches.length < maxBatches) {
            const remaining = history.length - startIndex;
            if (remaining <= maxWindowSize) {
                batches.push({
                    startIndex: startIndex,
                    endIndex: history.length,
                    size: remaining,
                    history: history.slice(startIndex, history.length),
                    boundaryScore: 0,
                    boundaryReasons: ['tail'],
                    boundaryGapMinutes: 0,
                    boundaryOverlapRatio: 0,
                    boundarySummary: 'tail'
                });
                startIndex = history.length;
                break;
            }

            const minEnd = Math.min(history.length, startIndex + minWindowSize);
            const maxEnd = Math.min(history.length, startIndex + maxWindowSize);
            let bestCandidate = null;

            for (let splitIndex = minEnd; splitIndex <= maxEnd; splitIndex += 1) {
                const tail = history.length - splitIndex;
                if (tail > 0 && tail < minWindowSize && batches.length + 1 < maxBatches) {
                    continue;
                }

                const scored = scoreDehydrateBoundary(rows, startIndex, splitIndex, targetWindowSize);
                const distance = Math.abs((splitIndex - startIndex) - targetWindowSize);

                if (!bestCandidate) {
                    bestCandidate = {
                        splitIndex: splitIndex,
                        distance: distance,
                        score: scored.score,
                        boundary: scored.boundary
                    };
                    continue;
                }

                if (scored.score > bestCandidate.score) {
                    bestCandidate = {
                        splitIndex: splitIndex,
                        distance: distance,
                        score: scored.score,
                        boundary: scored.boundary
                    };
                    continue;
                }

                if (scored.score === bestCandidate.score && distance < bestCandidate.distance) {
                    bestCandidate = {
                        splitIndex: splitIndex,
                        distance: distance,
                        score: scored.score,
                        boundary: scored.boundary
                    };
                }
            }

            const endIndex = bestCandidate && bestCandidate.splitIndex > startIndex
                ? bestCandidate.splitIndex
                : Math.min(history.length, startIndex + targetWindowSize);
            const boundary = bestCandidate ? bestCandidate.boundary : null;

            batches.push({
                startIndex: startIndex,
                endIndex: endIndex,
                size: Math.max(0, endIndex - startIndex),
                history: history.slice(startIndex, endIndex),
                boundaryScore: bestCandidate ? bestCandidate.score : 0,
                boundaryReasons: boundary && Array.isArray(boundary.reasons) ? boundary.reasons.slice() : [],
                boundaryGapMinutes: boundary && boundary.gapMs > 0 ? Math.round(boundary.gapMs / 60000) : 0,
                boundaryOverlapRatio: boundary && boundary.overlap ? Number(boundary.overlap.ratio || 0) : 0,
                boundarySummary: summarizeDehydrateBoundary(boundary, endIndex >= history.length)
            });

            startIndex = endIndex;
        }

        return {
            totalCount: history.length,
            plannedCount: batches.reduce(function sum(total, batch) {
                return total + Math.max(0, Number(batch && batch.size) || 0);
            }, 0),
            deferredCount: Math.max(0, history.length - startIndex),
            minWindowSize: minWindowSize,
            targetWindowSize: targetWindowSize,
            maxWindowSize: maxWindowSize,
            batches: batches
        };
    }

    /**
     * 重新定义事件规范化逻辑，确保去重键等字段能沿着后续链路继续传递。
     */
    function normalizeDehydratedEvent(item, eventIndex) {
        if (!item || typeof item !== 'object') return null;

        const content = toTrimmedString(
            item.content
            || item.memory
            || item.event
            || item.summary
            || item.text
        );

        if (!content) return null;

        const triggerKeywords = normalizeTriggerKeywords(
            item.trigger_keywords
            || item.triggerKeywords
            || item.keywords
            || item.triggers,
            content
        );
        const metadata = item.metadata && typeof item.metadata === 'object' && !Array.isArray(item.metadata)
            ? Object.assign({}, item.metadata)
            : {};

        return {
            content: content,
            valence: clampNumber(item.valence, -1, 1, 0),
            arousal: clampNumber(item.arousal, 0, 1, 0),
            importance: normalizeImportanceValue(item.importance),
            trigger_keywords: triggerKeywords,
            memory_layer: normalizeMemoryLayer(item.memory_layer || item.memoryLayer || item.layer, eventIndex),
            sensory_anchors: normalizeSensoryAnchors(item.sensory_anchors || item.sensoryAnchors, eventIndex),
            dedupe_key: toTrimmedString(item.dedupe_key || item.dedupeKey) || null,
            metadata: metadata
        };
    }

    /**
     * 重新定义解析后标准化逻辑，加入事实锚点过滤与近似重复合并。
     */
    function normalizeParsedEventContainer(parsed, options) {
        const safeOptions = options && typeof options === 'object' ? options : {};
        const events = extractEventList(parsed);
        const normalized = [];
        const currentMood = extractCurrentMood(parsed);
        const groundingRows = buildDehydrateGroundingRows(safeOptions.chatHistory);
        const notebookExtraction = extractNotebookExtraction(parsed, {
            groundingRows: groundingRows,
            userId: safeOptions.userId,
            charId: safeOptions.charId || safeOptions.characterId,
            notebookLearningProfile: safeOptions.notebookLearningProfile || safeOptions.learningProfile
        });

        for (let i = 0; i < events.length; i += 1) {
            const event = normalizeDehydratedEvent(events[i], i);
            if (!event) continue;

            if (!hasConcreteEventAnchor(event.content, event.trigger_keywords)) {
                console.log(`[海马体脱水] 已丢弃缺少事实锚点的候选事件：${event.content.slice(0, 40)}`);
                continue;
            }

            if (groundingRows.length > 0) {
                const grounding = scoreDehydratedEventGrounding(event, groundingRows);
                if (!grounding.supported) {
                    console.log(
                        `[海马体脱水] 已丢弃原文支撑过弱的候选事件：${event.content.slice(0, 40)}（coverage=${grounding.coverage.toFixed(2)}, rows=${grounding.matchedRows}, tokens=${grounding.matchedTokenCount}/${grounding.tokenCount}）`
                    );
                    continue;
                }
                applyDehydratedEventGrounding(event, grounding);
            }

            let merged = false;
            for (let index = 0; index < normalized.length; index += 1) {
                if (!isNearDuplicateEvent(normalized[index], event)) continue;
                normalized[index] = mergeNearDuplicateEvents(normalized[index], event);
                console.log(`[海马体脱水] 已合并近似重复事件：${event.content.slice(0, 40)}`);
                merged = true;
                break;
            }

            if (merged) continue;

            normalized.push(event);
            if (normalized.length >= MAX_MEMORY_COUNT) break;
        }

        return {
            events: rebalanceFlatImportanceIfNeeded(normalized),
            currentMood: currentMood,
            statusChanges: [],
            profileNotes: notebookExtraction.profileNotes,
            mustRememberNotes: notebookExtraction.mustRememberNotes,
            redlineSignals: notebookExtraction.redlineSignals
        };
    }

    /**
     * 重新定义脱水主流程，把 dedupe_key 注入到每条事件里，供写入层真正去重。
     */
    async function dehydrate(chatHistory, charId, charName, apiConfig) {
        const fetchImpl = getFetchImplementation();
        const config = normalizeApiConfig(apiConfig);
        const transcript = formatChatHistoryForDehydrate(chatHistory, charName || charId || '角色');
        const safeCharName = toTrimmedString(charName) || toTrimmedString(charId) || '角色';
        const promptOptions = apiConfig && typeof apiConfig === 'object' && apiConfig.dehydrateContext && typeof apiConfig.dehydrateContext === 'object'
            ? Object.assign({}, apiConfig.dehydrateContext)
            : {};
        if (!promptOptions.charId && charId) {
            promptOptions.charId = toTrimmedString(charId);
        }

        console.log(`[海马体脱水] 开始执行脱水，角色=${safeCharName}，聊天条数=${Array.isArray(chatHistory) ? chatHistory.length : 0}。`);

        if (!fetchImpl) {
            console.warn('[海马体脱水] 当前环境缺少 fetch，跳过脱水。');
            return buildDehydrateErrorResult('当前环境缺少 fetch，无法发起脱水请求。', 'fetch_unavailable');
        }
        if (!config.apiUrl || !config.model) {
            console.warn('[海马体脱水] 脱水配置不完整，缺少 API URL 或模型名，已跳过。');
            return buildDehydrateErrorResult('脱水配置不完整，缺少 API URL 或模型名。', 'config_incomplete');
        }
        if (!transcript) {
            console.log('[海马体脱水] 聊天内容为空，跳过脱水。');
            return [];
        }

        const prompt = generateDehydratePrompt(chatHistory, charName || charId || '角色', promptOptions);
        const requestUrl = normalizeChatCompletionsUrl(config.apiUrl);
        if (!requestUrl) {
            console.warn('[海马体脱水] API URL 规范化失败，已跳过。');
            return buildDehydrateErrorResult('API URL 不合法，无法生成 /chat/completions 地址。', 'invalid_api_url');
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
         * 发起单次脱水模型请求，返回统一结构，便于主流程做重试与修复。
         */
        async function requestDehydrateOnce(promptText, attemptLabel) {
            const body = Object.assign({}, requestBody, {
                messages: [
                    {
                        role: 'user',
                        content: promptText
                    }
                ]
            });

            console.log(`[海马体脱水] 发起${attemptLabel}请求，模型=${config.model}。`);
            const response = await fetchImpl(requestUrl, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(body)
            });
            console.log(`[海马体脱水] ${attemptLabel}响应状态：HTTP ${response.status}`);

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
                const requestError = new Error(
                    detail
                        ? `${attemptLabel}失败（HTTP ${response.status}）：${detail}`
                        : `${attemptLabel}失败（HTTP ${response.status}）`
                );
                requestError.code = 'upstream_http_error';
                requestError.httpStatus = response.status;
                requestError.detail = detail;
                throw requestError;
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
                rawText: toTrimmedString(rawText)
            };
        }

        function finalizeParsedEvents(parsedEvents) {
            const supplementalPayload = {
                currentMood: parsedEvents.currentMood || null,
                statusChanges: [],
                profileNotes: parsedEvents.profileNotes || [],
                mustRememberNotes: parsedEvents.mustRememberNotes || [],
                redlineSignals: parsedEvents.redlineSignals || []
            };
            const withDedupe = attachEventDedupeKeys(parsedEvents, chatHistory);
            attachSupplementalFields(withDedupe, supplementalPayload);
            return withDedupe;
        }

        try {
            console.log(`[海马体脱水] 请求上游模型 ${config.model}，URL=${requestUrl}`);
            const firstAttempt = await requestDehydrateOnce(prompt, '首轮');
            const firstPayload = firstAttempt.payload;
            const firstModelText = toTrimmedString(extractResponseText(firstPayload));
            const firstRepairSource = firstModelText || firstAttempt.rawText;
            const firstJsonCandidate = extractJsonCandidate(firstModelText);

            let parsedEvents = parseDehydrateResponse(firstPayload, {
                chatHistory: chatHistory,
                userId: promptOptions.userId,
                charId: promptOptions.charId || charId,
                notebookLearningProfile: promptOptions.notebookLearningProfile || promptOptions.learningProfile
            });
            if (parsedEvents.length > 0 || hasSupplementalExtraction(parsedEvents)) {
                const perspectiveCandidates = findPerspectiveInversionCandidates(parsedEvents, chatHistory, safeCharName);
                if (perspectiveCandidates.length > 0) {
                    const candidatePreview = perspectiveCandidates.map(function mapCandidate(item) {
                        return `#${item.index + 1}:${item.content.slice(0, 36)}`;
                    }).join(' / ');
                    console.warn(`[海马体脱水] 检测到 ${perspectiveCandidates.length} 条疑似视角写反事件，准备执行视角修复：${candidatePreview}`);
                    try {
                        const perspectiveRepairPrompt = buildDehydrateRepairPrompt(
                            buildPerspectiveRepairSeed(parsedEvents),
                            safeCharName,
                            chatHistory,
                            '以下事件疑似把“我”写成了用户视角，请改回角色视角，并保留原有事实锚点与情绪结果。'
                        );
                        const perspectiveRepairAttempt = await requestDehydrateOnce(perspectiveRepairPrompt, '视角修复');
                        const repairedEvents = parseDehydrateResponse(perspectiveRepairAttempt.payload, {
                            chatHistory: chatHistory,
                            userId: promptOptions.userId,
                            charId: promptOptions.charId || charId,
                            notebookLearningProfile: promptOptions.notebookLearningProfile || promptOptions.learningProfile
                        });
                        if (repairedEvents.length > 0 || hasSupplementalExtraction(repairedEvents)) {
                            parsedEvents = repairedEvents;
                            console.log(`[海马体脱水] 视角修复完成，得到 ${parsedEvents.length} 条事件。`);
                        } else {
                            console.warn('[海马体脱水] 视角修复未返回可用结果，保留首轮解析结果。');
                        }
                    } catch (repairError) {
                        console.warn('[海马体脱水] 视角修复请求失败，保留首轮解析结果。', repairError);
                    }
                }
                parsedEvents = finalizeParsedEvents(parsedEvents);
                console.log(`[海马体脱水] 解析完成，得到 ${parsedEvents.length} 条事件。`);
                return parsedEvents;
            }

            if (firstModelText) {
                console.log(`[海马体脱水] 已提取模型正文，长度=${firstModelText.length}。`);
            } else if (firstAttempt.rawText) {
                console.log('[海马体脱水] 未提取到模型正文，将回退使用原始响应做修复重试。');
            }

            const shouldRepair = !firstJsonCandidate && !!toTrimmedString(firstRepairSource);
            if (!shouldRepair) {
                console.log('[海马体脱水] 解析完成，得到 0 条事件。');
                return attachSupplementalFields([], {
                    currentMood: parsedEvents.currentMood || null,
                    statusChanges: [],
                    profileNotes: parsedEvents.profileNotes || [],
                    mustRememberNotes: parsedEvents.mustRememberNotes || [],
                    redlineSignals: parsedEvents.redlineSignals || []
                });
            }

            const preview = String(firstRepairSource).slice(0, 300);
            console.warn(`[海马体脱水] 首轮未返回可解析 JSON，准备执行修复重试。原始片段：${preview}`);
            const repairPrompt = buildDehydrateRepairPrompt(firstRepairSource, safeCharName, chatHistory);
            const repairAttempt = await requestDehydrateOnce(repairPrompt, '修复');
            parsedEvents = parseDehydrateResponse(repairAttempt.payload, {
                chatHistory: chatHistory,
                userId: promptOptions.userId,
                charId: promptOptions.charId || charId,
                notebookLearningProfile: promptOptions.notebookLearningProfile || promptOptions.learningProfile
            });
            parsedEvents = finalizeParsedEvents(parsedEvents);
            console.log(`[海马体脱水] 修复解析完成，得到 ${parsedEvents.length} 条事件。`);
            return parsedEvents;
        } catch (error) {
            console.warn('[海马体脱水] 请求失败。', error);
            return buildDehydrateErrorResult(
                toTrimmedString(error && error.message) || '脱水请求失败',
                toTrimmedString(error && error.code) || 'dehydrate_request_failed',
                toTrimmedString(error && (error.detail || error.debugMessage)),
                Number(error && (error.httpStatus || error.status || error.statusCode))
            );
        }
    }

    return {
        dehydrate: dehydrate,
        planDehydrateWindows: planDehydrateWindows,
        generateDehydratePrompt: generateDehydratePrompt,
        parseDehydrateResponse: parseDehydrateResponse,
        shouldTriggerDehydrate: shouldTriggerDehydrate
    };
}
