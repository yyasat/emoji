/**
 * 初始化海马体前情提要模块导出壳子。
 * 兼容浏览器全局和 CommonJS 两种加载方式。
 */
(function initHippocampusRecapModule(root) {
    const api = createHippocampusRecap(root);

    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }

    if (root && typeof root === 'object') {
        root.HippocampusRecap = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this));

/**
 * 创建海马体前情提要实例。
 * 这里封装摘要生成、读取、保存和 Prompt 格式化逻辑。
 */
function createHippocampusRecap(root) {
    const RECAP_STORAGE_KEY = 'idic_hippocampus_recent_recap_v1';
    const MAX_RECAP_LENGTH = 150;
    const DEFAULT_TEMPERATURE = 0.2;
    const DEFAULT_MAX_TOKENS = 220;

    /**
     * 将任意值转换为有限数字，不合法时回退到默认值。
     */
    function toFiniteNumber(value, fallback) {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : fallback;
    }

    /**
     * 将数值裁剪到指定区间，避免配置超出合理范围。
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
     * 从当前环境中获取 fetch 实现。
     */
    function getFetchImplementation() {
        if (typeof fetch === 'function') return fetch.bind(root);
        if (root && typeof root.fetch === 'function') return root.fetch.bind(root);
        return null;
    }

    /**
     * 读取海马体 bridge。
     * bridge 由 script.js 以最小改动方式暴露 recentRecap 的读写能力。
     */
    function getBridge() {
        if (!root || typeof root !== 'object') return null;
        return root.IDIC_HippocampusBridge || null;
    }

    /**
     * 规范化脱水 API 配置，复用同一条便宜模型通道。
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
        return `${url}/chat/completions`;
    }

    /**
     * 为聊天记录生成更自然的中文发言标签。
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
     * 将聊天记录整理为适合生成前情提要的文本。
     */
    function formatChatHistory(chatHistory, charName) {
        const history = Array.isArray(chatHistory) ? chatHistory : [];
        const lines = [];

        for (let i = 0; i < history.length; i += 1) {
            const message = history[i];
            if (!message || typeof message !== 'object') continue;

            const content = toTrimmedString(
                message.content
                || message.text
                || message.message
                || message.body
            );

            if (!content) continue;

            const label = resolveSpeakerLabel(message, charName);
            lines.push(`${label}：${content}`);
        }

        return lines.join('\n');
    }

    /**
     * 生成发给前情提要模型的中文 Prompt。
     * 目标是得到一句不超过 150 字、只写事实的上次聊天摘要。
     */
    function buildRecapPrompt(chatHistory, charName) {
        const safeCharName = toTrimmedString(charName) || '角色';
        const transcript = formatChatHistory(chatHistory, safeCharName);

        return [
            `你是 IDIC 项目的“前情提要摘要器”。`,
            `请根据下面这次对话记录，为角色“${safeCharName}”生成一句不超过150字的中文摘要。`,
            '',
            '输出要求：',
            '1. 只写事实，不写感受，不分析情绪。',
            '2. 不要使用“用户说”“角色说”“你说”“我说”这类元叙述。',
            '3. 直接概括发生了什么、提到了什么、做了什么、约定了什么。',
            '4. 如果这次对话没有值得保留的前情，只返回空字符串。',
            '5. 只输出最终摘要文本，不要输出标题、解释、列表、引号、代码块。',
            '',
            '聊天记录如下：',
            transcript || '（没有可用聊天内容）'
        ].join('\n');
    }

    /**
     * 从多种 OpenAI 兼容响应结构中提取文本内容。
     */
    function extractResponseText(llmResponse) {
        if (typeof llmResponse === 'string') return llmResponse;

        if (!llmResponse || typeof llmResponse !== 'object') return '';

        if (typeof llmResponse.output_text === 'string') {
            return llmResponse.output_text;
        }

        if (Array.isArray(llmResponse.choices) && llmResponse.choices[0] && llmResponse.choices[0].message) {
            const content = llmResponse.choices[0].message.content;
            if (typeof content === 'string') return content;

            if (Array.isArray(content)) {
                return content.map(function joinContentPart(part) {
                    if (typeof part === 'string') return part;
                    if (part && typeof part.text === 'string') return part.text;
                    if (part && typeof part.content === 'string') return part.content;
                    return '';
                }).join('');
            }
        }

        if (Array.isArray(llmResponse.output) && llmResponse.output[0] && Array.isArray(llmResponse.output[0].content)) {
            return llmResponse.output[0].content.map(function joinOutputPart(part) {
                if (part && typeof part.text === 'string') return part.text;
                if (part && typeof part.content === 'string') return part.content;
                return '';
            }).join('');
        }

        if (typeof llmResponse.content === 'string') return llmResponse.content;
        if (typeof llmResponse.text === 'string') return llmResponse.text;

        return '';
    }

    /**
     * 去掉 Markdown 代码块包裹，只保留内部文本。
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
     * 将摘要文本裁剪为单行、最多 150 字的最终结果。
     */
    function normalizeRecapText(text) {
        let normalized = stripCodeFence(text)
            .replace(/\r?\n+/g, ' ')
            .replace(/\s+/g, ' ')
            .replace(/^上次聊天摘要[:：]?\s*/i, '')
            .replace(/^摘要[:：]?\s*/i, '')
            .trim();

        if (!normalized) return '';
        if (normalized === '[]' || normalized.toLowerCase() === 'null') return '';

        if (
            normalized.length >= 2
            && ((normalized.startsWith('"') && normalized.endsWith('"')) || (normalized.startsWith('“') && normalized.endsWith('”')))
        ) {
            normalized = normalized.slice(1, -1).trim();
        }

        const chars = Array.from(normalized);
        if (chars.length > MAX_RECAP_LENGTH) {
            normalized = chars.slice(0, MAX_RECAP_LENGTH).join('').trim();
        }

        return normalized;
    }

    /**
     * 读取本地兜底存储。
     * 当 bridge 不可用时，仍然保留最近一次前情提要。
     */
    function readRecapStore() {
        try {
            if (!root || !root.localStorage) return {};
            const raw = root.localStorage.getItem(RECAP_STORAGE_KEY);
            if (!raw) return {};

            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (_) {
            return {};
        }
    }

    /**
     * 写回本地兜底存储。
     */
    function writeRecapStore(store) {
        try {
            if (!root || !root.localStorage) return;
            root.localStorage.setItem(RECAP_STORAGE_KEY, JSON.stringify(store || {}));
        } catch (_) {
            // 本地存储失败时静默跳过。
        }
    }

    /**
     * 生成一句不超过 150 字的“上次聊天摘要”。
     * 失败时静默返回空字符串。
     */
    async function generateRecap(chatHistory, charName, apiConfig) {
        const fetchImpl = getFetchImplementation();
        const config = normalizeApiConfig(apiConfig);
        const transcript = formatChatHistory(chatHistory, charName || '角色');

        if (!fetchImpl) return '';
        if (!config.apiUrl || !config.model) return '';
        if (!transcript) return '';

        const requestUrl = normalizeChatCompletionsUrl(config.apiUrl);
        if (!requestUrl) return '';

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
                        content: buildRecapPrompt(chatHistory, charName)
                    }
                ],
                temperature: config.temperature,
                max_tokens: config.maxTokens
            }
        );

        try {
            const response = await fetchImpl(requestUrl, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) return '';

            const rawText = await response.text();
            let payload = rawText;

            try {
                payload = JSON.parse(rawText);
            } catch (_) {
                payload = rawText;
            }

            return normalizeRecapText(extractResponseText(payload));
        } catch (_) {
            return '';
        }
    }

    /**
     * 保存角色最近一次前情提要。
     * 优先写入 script.js 暴露的 bridge，同时落一份本地兜底副本。
     */
    function saveRecap(charId, recapText) {
        const safeCharId = toTrimmedString(charId);
        const normalized = normalizeRecapText(recapText);
        if (!safeCharId) return null;

        const bridge = getBridge();
        if (bridge && typeof bridge.saveRecentRecap === 'function') {
            try {
                bridge.saveRecentRecap(safeCharId, normalized);
            } catch (_) {
                // bridge 失败时走本地兜底，不中断流程。
            }
        }

        const store = readRecapStore();
        if (normalized) {
            store[safeCharId] = normalized;
        } else {
            delete store[safeCharId];
        }
        writeRecapStore(store);

        return normalized || null;
    }

    /**
     * 读取角色最近一次前情提要。
     * 优先读取角色对象上的字段，取不到时回退到本地兜底副本。
     */
    function getRecap(charId) {
        const safeCharId = toTrimmedString(charId);
        if (!safeCharId) return null;

        const bridge = getBridge();
        if (bridge && typeof bridge.getRecentRecap === 'function') {
            try {
                const recapFromBridge = normalizeRecapText(bridge.getRecentRecap(safeCharId));
                if (recapFromBridge) return recapFromBridge;
            } catch (_) {
                // bridge 失败时继续回退到本地兜底。
            }
        }

        const store = readRecapStore();
        const recapFromStore = normalizeRecapText(store[safeCharId]);
        return recapFromStore || null;
    }

    /**
     * 将前情提要包装成 Prompt 片段。
     * 没有摘要时返回空字符串。
     */
    function formatRecapForPrompt(recapText) {
        const normalized = normalizeRecapText(recapText);
        if (!normalized) return '';
        return `<RecentRecap>上次你们聊天时：${normalized}</RecentRecap>`;
    }

    return {
        generateRecap: generateRecap,
        saveRecap: saveRecap,
        getRecap: getRecap,
        formatRecapForPrompt: formatRecapForPrompt
    };
}
