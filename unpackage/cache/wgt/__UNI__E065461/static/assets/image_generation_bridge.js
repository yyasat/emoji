(function () {
    'use strict';

    const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
    const DEFAULT_OPENAI_IMAGE_PATH = '/images/generations';
    const DEFAULT_OPENAI_RESPONSES_PATH = '/responses';
    const DEFAULT_OPENAI_CHAT_PATH = '/chat/completions';
    const DEFAULT_GOOGLE_BASE_URL = 'https://generativelanguage.googleapis.com';
    const DEFAULT_NOVELAI_PROXY_GENERATE_PATH = '/.netlify/functions/novelai?action=generate';
    const DEFAULT_POLLINATIONS_PROMPT_BASE_URL = 'https://image.pollinations.ai/prompt';

    const PROVIDER_LABELS = {
        openai: 'OpenAI',
        google: 'Google',
        novelai: 'NovelAI',
        pollinations: 'Pollinations',
        customOpenAiLike: '自定义 OpenAI 兼容'
    };

    function isPlainObject(value) {
        return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
    }

    function deepClone(value) {
        if (Array.isArray(value)) {
            return value.map(deepClone);
        }
        if (isPlainObject(value)) {
            const output = {};
            Object.keys(value).forEach((key) => {
                output[key] = deepClone(value[key]);
            });
            return output;
        }
        return value;
    }

    function mergeDeep(base, patch) {
        const output = deepClone(base);
        if (!isPlainObject(patch)) {
            return output;
        }

        Object.keys(patch).forEach((key) => {
            const nextValue = patch[key];
            if (isPlainObject(output[key]) && isPlainObject(nextValue)) {
                output[key] = mergeDeep(output[key], nextValue);
                return;
            }
            if (Array.isArray(nextValue)) {
                output[key] = deepClone(nextValue);
                return;
            }
            output[key] = nextValue;
        });

        return output;
    }

    function trimString(value) {
        return String(value == null ? '' : value).trim();
    }

    function normalizeApiCredential(value) {
        let text = trimString(value)
            .replace(/[\u200B-\u200D\uFEFF]/g, '')
            .replace(/^["'`]+|["'`]+$/g, '')
            .trim();

        text = text.replace(/^authorization\s*:\s*/i, '').trim();
        const bearerMatch = text.match(/^bearer\s+(.+)$/i);
        if (bearerMatch) {
            text = bearerMatch[1].trim();
        }

        return text.replace(/\s+/g, '');
    }

    function buildBearerAuthHeader(apiKey) {
        const credential = normalizeApiCredential(apiKey);
        return credential ? `Bearer ${credential}` : '';
    }

    function normalizeNovelAiModelId(value) {
        const model = trimString(value);
        if (!model) return '';
        return model.replace(/^nai-diffusion-4\.5/i, 'nai-diffusion-4-5');
    }

    function normalizeNovelAiSampler(value) {
        const raw = trimString(value || 'k_euler_ancestral') || 'k_euler_ancestral';
        const key = raw.toLowerCase().replace(/[\s-]+/g, '_');
        const aliases = {
            euler: 'k_euler',
            k_euler: 'k_euler',
            euler_a: 'k_euler_ancestral',
            euler_ancestral: 'k_euler_ancestral',
            k_euler_a: 'k_euler_ancestral',
            k_euler_ancestral: 'k_euler_ancestral'
        };
        return aliases[key] || raw;
    }

    function isNovelAiV4Model(model) {
        return /^nai-diffusion-(?:furry-)?4(?:-|$)/i.test(trimString(model));
    }

    function buildNovelAiV4Caption(prompt, options = {}) {
        return {
            caption: {
                base_caption: trimString(prompt),
                char_captions: []
            },
            use_coords: false,
            use_order: options.useOrder !== false,
            legacy_uc: false
        };
    }

    function clampNumber(value, min, max, fallback) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) {
            return fallback;
        }
        return Math.min(max, Math.max(min, numeric));
    }

    function normalizeBoolean(value, fallback) {
        if (value === undefined) return fallback;
        return Boolean(value);
    }

    function joinUrl(baseUrl, path) {
        const safeBase = trimString(baseUrl);
        const safePath = trimString(path);

        if (!safeBase && !safePath) return '';
        if (!safeBase) return safePath;
        if (!safePath) return safeBase;
        if (/^https?:\/\//i.test(safePath)) return safePath;

        return `${safeBase.replace(/\/+$/, '')}/${safePath.replace(/^\/+/, '')}`;
    }

    function appendQuery(url, params) {
        const target = new URL(url);
        Object.keys(params || {}).forEach((key) => {
            const value = params[key];
            if (value === undefined || value === null || value === '') return;
            target.searchParams.set(key, String(value));
        });
        return target.toString();
    }

    function guessMimeTypeFromFileName(fileName) {
        const lower = trimString(fileName).toLowerCase();
        if (lower.endsWith('.png')) return 'image/png';
        if (lower.endsWith('.webp')) return 'image/webp';
        if (lower.endsWith('.gif')) return 'image/gif';
        if (lower.endsWith('.bmp')) return 'image/bmp';
        return 'image/jpeg';
    }

    function normalizeMimeType(mimeType) {
        const safeType = trimString(mimeType).toLowerCase();
        if (!safeType) return 'image/png';
        if (safeType === 'image/jpg') return 'image/jpeg';
        return safeType;
    }

    function decodeBase64ToBlob(base64Value, mimeType) {
        const safeBase64 = trimString(base64Value);
        if (!safeBase64) {
            throw new Error('图片数据为空');
        }

        const binary = atob(safeBase64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) {
            bytes[i] = binary.charCodeAt(i);
        }
        return new Blob([bytes], { type: normalizeMimeType(mimeType) });
    }

    async function fetchBlobFromUrl(url) {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`图片下载失败: HTTP ${response.status}`);
        }
        return response.blob();
    }

    function buildSuccessResult(partial) {
        const result = Object.assign({
            ok: true,
            prompt: '',
            promptFinal: '',
            revisedPrompt: '',
            provider: '',
            model: '',
            blob: null,
            mimeType: 'image/png',
            width: 0,
            height: 0,
            seed: '',
            images: [],
            providerMeta: {},
            message: '生图成功'
        }, partial || {});

        if (!Array.isArray(result.images) || result.images.length === 0) {
            if (result.blob) {
                result.images = [{
                    blob: result.blob,
                    mimeType: result.mimeType || (result.blob && result.blob.type) || 'image/png',
                    width: result.width || 0,
                    height: result.height || 0,
                    seed: result.seed || '',
                    provider: result.provider || '',
                    model: result.model || ''
                }];
            } else {
                result.images = [];
            }
        }

        return result;
    }

    function buildFailureResult(partial) {
        return Object.assign({
            ok: false,
            prompt: '',
            promptFinal: '',
            revisedPrompt: '',
            provider: '',
            model: '',
            blob: null,
            mimeType: '',
            width: 0,
            height: 0,
            seed: '',
            images: [],
            providerMeta: {},
            error: '生图失败',
            message: ''
        }, partial || {});
    }

    async function readErrorMessage(response) {
        const contentType = trimString(response.headers.get('content-type')).toLowerCase();

        try {
            if (contentType.includes('application/json')) {
                const data = await response.json();
                return trimString(
                    data?.error?.message
                    || data?.error
                    || data?.message
                    || data?.detail
                    || data?.statusText
                ) || `HTTP ${response.status}`;
            }

            const text = trimString(await response.text());
            return text || `HTTP ${response.status}`;
        } catch (error) {
            return `HTTP ${response.status}`;
        }
    }

    function sanitizeTraceUrl(rawUrl) {
        const source = trimString(rawUrl);
        if (!source) return '';

        const compact = (value) => value.length > 220 ? `${value.slice(0, 220)}...` : value;

        try {
            const target = new URL(source);
            ['key', 'token', 'api_key', 'apikey'].forEach((name) => {
                if (target.searchParams.has(name)) {
                    target.searchParams.set(name, '***');
                }
            });
            return compact(target.toString());
        } catch (error) {
            return compact(source.replace(/([?&](?:key|token|api[_-]?key)=)[^&]+/ig, '$1***'));
        }
    }

    function emitRequestTrace(request, stage, message, details = null) {
        if (!request || typeof request.onTrace !== 'function') return;

        try {
            request.onTrace({
                at: Date.now(),
                stage: trimString(stage) || 'provider.step',
                message: trimString(message),
                details: isPlainObject(details) ? details : {}
            });
        } catch (error) {
        }
    }

    function emitContextTrace(context, stage, message, details = null) {
        if (!context || typeof context.onTrace !== 'function') return;

        try {
            context.onTrace({
                at: Date.now(),
                stage: trimString(stage) || 'provider.step',
                message: trimString(message),
                details: isPlainObject(details) ? details : {}
            });
        } catch (error) {
        }
    }

    function parseExtraHeaders(rawValue) {
        const source = trimString(rawValue);
        if (!source) return {};

        try {
            const parsed = JSON.parse(source);
            if (!isPlainObject(parsed)) {
                throw new Error('额外请求头必须是 JSON 对象');
            }
            return parsed;
        } catch (error) {
            throw new Error(`额外请求头格式错误: ${error.message}`);
        }
    }

    function getDefaultImageGenerationSettings() {
        return {
            enabled: false,
            provider: 'openai',
            model: '',
            fallbackToTextDescription: true,
            autoHealthCheck: true,
            lastHealthCheckAt: 0,
            lastHealthCheckStatus: 'unknown',
            lastHealthCheckMessage: '未检查',
            common: {
                imageCount: 1,
                width: 1024,
                height: 1024,
                aspectRatio: '1:1',
                quality: 'medium',
                seed: '',
                promptPrefix: '',
                promptStylePreset: 'balanced',
                allowReference: true,
                exportWatermarkText: '图片由AI生成'
            },
            offlineIllustration: {
                enabledByDefault: false,
                generatePerAssistantTurn: true,
                outputPosition: 'after_reply',
                maxImagesPerTurn: 1
            },
            providers: {
                openai: {
                    apiKey: '',
                    baseUrl: '',
                    imagePath: '',
                    apiMode: 'auto',
                    background: 'auto',
                    moderation: 'auto'
                },
                google: {
                    apiKey: '',
                    baseUrl: '',
                    safetyLevel: 'block_few'
                },
                novelai: {
                    apiKey: '',
                    sampler: 'k_euler_ancestral',
                    steps: 28,
                    scale: 6.5,
                    cfgRescale: 0.18,
                    noiseSchedule: 'karras',
                    sm: false,
                    smDyn: false,
                    smeaConfigured: false,
                    strength: 0.7,
                    noise: 0.2,
                    artistPrompt: '',
                    positivePrompt: '',
                    negativePrompt: ''
                },
                pollinations: {
                    baseUrl: DEFAULT_POLLINATIONS_PROMPT_BASE_URL,
                    model: 'flux',
                    negativePrompt: '',
                    privateMode: false,
                    enhancePrompt: true
                },
                customOpenAiLike: {
                    apiKey: '',
                    baseUrl: '',
                    apiMode: 'auto',
                    imagePath: DEFAULT_OPENAI_IMAGE_PATH,
                    chatPath: DEFAULT_OPENAI_CHAT_PATH,
                    extraHeaders: ''
                }
            }
        };
    }

    function normalizeImageGenerationSettings(rawSettings) {
        const defaults = getDefaultImageGenerationSettings();
        const merged = mergeDeep(defaults, rawSettings);
        const providerKey = trimString(merged.provider || 'openai');

        merged.provider = Object.prototype.hasOwnProperty.call(PROVIDER_LABELS, providerKey)
            ? providerKey
            : 'openai';
        merged.enabled = Boolean(merged.enabled);
        merged.fallbackToTextDescription = normalizeBoolean(merged.fallbackToTextDescription, true);
        merged.autoHealthCheck = normalizeBoolean(merged.autoHealthCheck, true);
        merged.model = trimString(merged.model);
        merged.lastHealthCheckAt = Math.max(0, Math.floor(Number(merged.lastHealthCheckAt) || 0));
        merged.lastHealthCheckStatus = trimString(merged.lastHealthCheckStatus || 'unknown') || 'unknown';
        merged.lastHealthCheckMessage = trimString(merged.lastHealthCheckMessage || 'Not checked') || 'Not checked';

        if (!isPlainObject(merged.common)) merged.common = deepClone(defaults.common);
        if (!isPlainObject(merged.offlineIllustration)) merged.offlineIllustration = deepClone(defaults.offlineIllustration);
        if (!isPlainObject(merged.providers)) merged.providers = deepClone(defaults.providers);

        Object.keys(defaults.providers).forEach((provider) => {
            if (!isPlainObject(merged.providers[provider])) {
                merged.providers[provider] = deepClone(defaults.providers[provider]);
                return;
            }
            merged.providers[provider] = mergeDeep(defaults.providers[provider], merged.providers[provider]);
        });

        merged.common.imageCount = Math.max(1, Math.min(4, Math.floor(Number(merged.common.imageCount) || 1)));
        merged.common.width = Math.max(256, Math.floor(Number(merged.common.width) || 1024));
        merged.common.height = Math.max(256, Math.floor(Number(merged.common.height) || 1024));
        merged.common.aspectRatio = trimString(merged.common.aspectRatio || '1:1') || '1:1';
        merged.common.quality = trimString(merged.common.quality || 'medium') || 'medium';
        merged.common.seed = trimString(merged.common.seed);
        merged.common.promptPrefix = trimString(merged.common.promptPrefix);
        merged.common.promptStylePreset = trimString(merged.common.promptStylePreset || 'balanced') || 'balanced';
        merged.common.allowReference = normalizeBoolean(merged.common.allowReference, true);
        merged.common.exportWatermarkText = trimString(merged.common.exportWatermarkText || '图片由AI生成') || '图片由AI生成';

        merged.offlineIllustration.enabledByDefault = Boolean(merged.offlineIllustration.enabledByDefault);
        merged.offlineIllustration.generatePerAssistantTurn = normalizeBoolean(merged.offlineIllustration.generatePerAssistantTurn, true);
        merged.offlineIllustration.outputPosition = trimString(merged.offlineIllustration.outputPosition || 'after_reply') || 'after_reply';
        merged.offlineIllustration.maxImagesPerTurn = Math.max(1, Math.min(3, Math.floor(Number(merged.offlineIllustration.maxImagesPerTurn) || 1)));

        merged.providers.openai.apiKey = normalizeApiCredential(merged.providers.openai.apiKey);
        merged.providers.openai.baseUrl = trimString(merged.providers.openai.baseUrl);
        merged.providers.openai.imagePath = trimString(merged.providers.openai.imagePath);
        merged.providers.openai.apiMode = trimString(merged.providers.openai.apiMode || 'auto').toLowerCase() || 'auto';
        if (!['auto', 'images', 'responses'].includes(merged.providers.openai.apiMode)) {
            merged.providers.openai.apiMode = 'auto';
        }
        merged.providers.openai.background = trimString(merged.providers.openai.background || 'auto') || 'auto';
        merged.providers.openai.moderation = trimString(merged.providers.openai.moderation || 'auto') || 'auto';

        merged.providers.google.apiKey = normalizeApiCredential(merged.providers.google.apiKey);
        merged.providers.google.baseUrl = trimString(merged.providers.google.baseUrl);
        merged.providers.google.safetyLevel = trimString(merged.providers.google.safetyLevel || 'block_few') || 'block_few';

        merged.providers.novelai.apiKey = normalizeApiCredential(merged.providers.novelai.apiKey);
        merged.providers.novelai.sampler = normalizeNovelAiSampler(merged.providers.novelai.sampler);
        merged.providers.novelai.steps = Math.max(1, Math.floor(Number(merged.providers.novelai.steps) || 28));
        merged.providers.novelai.scale = clampNumber(merged.providers.novelai.scale, 1, 20, 6.5);
        merged.providers.novelai.cfgRescale = clampNumber(merged.providers.novelai.cfgRescale, 0, 1, 0.18);
        merged.providers.novelai.noiseSchedule = trimString(merged.providers.novelai.noiseSchedule || 'karras') || 'karras';
        merged.providers.novelai.smeaConfigured = normalizeBoolean(merged.providers.novelai.smeaConfigured, false);
        merged.providers.novelai.sm = merged.providers.novelai.smeaConfigured
            ? normalizeBoolean(merged.providers.novelai.sm, false)
            : false;
        merged.providers.novelai.smDyn = merged.providers.novelai.smeaConfigured
            ? normalizeBoolean(merged.providers.novelai.smDyn, false)
            : false;
        merged.providers.novelai.strength = clampNumber(merged.providers.novelai.strength, 0, 1, 0.7);
        merged.providers.novelai.noise = clampNumber(merged.providers.novelai.noise, 0, 1, 0.2);
        merged.providers.novelai.artistPrompt = trimString(merged.providers.novelai.artistPrompt);
        merged.providers.novelai.positivePrompt = trimString(merged.providers.novelai.positivePrompt);
        merged.providers.novelai.negativePrompt = trimString(merged.providers.novelai.negativePrompt);

        merged.providers.pollinations.baseUrl = trimString(merged.providers.pollinations.baseUrl || DEFAULT_POLLINATIONS_PROMPT_BASE_URL) || DEFAULT_POLLINATIONS_PROMPT_BASE_URL;
        merged.providers.pollinations.model = trimString(merged.providers.pollinations.model || 'flux') || 'flux';
        merged.providers.pollinations.negativePrompt = trimString(merged.providers.pollinations.negativePrompt);
        merged.providers.pollinations.privateMode = Boolean(merged.providers.pollinations.privateMode);
        merged.providers.pollinations.enhancePrompt = normalizeBoolean(merged.providers.pollinations.enhancePrompt, true);

        merged.providers.customOpenAiLike.apiKey = normalizeApiCredential(merged.providers.customOpenAiLike.apiKey);
        merged.providers.customOpenAiLike.baseUrl = trimString(merged.providers.customOpenAiLike.baseUrl);
        merged.providers.customOpenAiLike.apiMode = trimString(merged.providers.customOpenAiLike.apiMode || 'auto').toLowerCase() || 'auto';
        if (!['auto', 'images', 'chat'].includes(merged.providers.customOpenAiLike.apiMode)) {
            merged.providers.customOpenAiLike.apiMode = 'auto';
        }
        merged.providers.customOpenAiLike.imagePath = trimString(merged.providers.customOpenAiLike.imagePath || DEFAULT_OPENAI_IMAGE_PATH) || DEFAULT_OPENAI_IMAGE_PATH;
        merged.providers.customOpenAiLike.chatPath = trimString(merged.providers.customOpenAiLike.chatPath || DEFAULT_OPENAI_CHAT_PATH) || DEFAULT_OPENAI_CHAT_PATH;
        merged.providers.customOpenAiLike.extraHeaders = trimString(merged.providers.customOpenAiLike.extraHeaders);

        return merged;
    }

    function getProviderLabel(provider) {
        const key = trimString(provider);
        return PROVIDER_LABELS[key] || key || '未选择';
    }

    function getActiveProviderConfig(settings) {
        const normalized = normalizeImageGenerationSettings(settings);
        return normalized.providers[normalized.provider] || {};
    }

    function getResolvedModel(settings, providerOverride, modelOverride) {
        const normalized = normalizeImageGenerationSettings(settings);
        const provider = trimString(providerOverride || normalized.provider) || normalized.provider;
        const explicitModel = trimString(modelOverride || normalized.model);

        if (explicitModel) {
            return provider === 'novelai' ? normalizeNovelAiModelId(explicitModel) : explicitModel;
        }
        if (provider === 'pollinations') {
            return trimString(normalized.providers.pollinations && normalized.providers.pollinations.model) || 'flux';
        }
        return '';
    }

    function getProviderAvailability(settings, providerOverride, modelOverride) {
        const normalized = normalizeImageGenerationSettings(settings);
        const provider = trimString(providerOverride || normalized.provider) || normalized.provider;
        const providerConfig = normalized.providers[provider] || {};
        const model = getResolvedModel(normalized, provider, modelOverride);

        if (!normalized.enabled) {
            return {
                ok: false,
                status: 'disabled',
                provider,
                model,
                reason: '生图系统未启用',
                providerConfig
            };
        }

        if (!model) {
            return {
                ok: false,
                status: 'missing_model',
                provider,
                model,
                reason: '未配置生图模型',
                providerConfig
            };
        }

        if (provider === 'openai') {
            if (!trimString(providerConfig.apiKey)) {
                return { ok: false, status: 'missing_config', provider, model, reason: 'OpenAI API Key 未配置', providerConfig };
            }
            return { ok: true, status: 'ready', provider, model, reason: '', providerConfig };
        }

        if (provider === 'google') {
            if (!trimString(providerConfig.apiKey)) {
                return { ok: false, status: 'missing_config', provider, model, reason: 'Google API Key 未配置', providerConfig };
            }
            return { ok: true, status: 'ready', provider, model, reason: '', providerConfig };
        }

        if (provider === 'novelai') {
            if (!trimString(providerConfig.apiKey)) {
                return { ok: false, status: 'missing_config', provider, model, reason: 'NovelAI Token 未配置', providerConfig };
            }
            return { ok: true, status: 'ready', provider, model, reason: '', providerConfig };
        }

        if (provider === 'pollinations') {
            if (!trimString(providerConfig.baseUrl)) {
                return { ok: false, status: 'missing_config', provider, model, reason: 'Pollinations Base URL 未配置', providerConfig };
            }
            return { ok: true, status: 'ready', provider, model, reason: '', providerConfig };
        }

        if (provider === 'customOpenAiLike') {
            if (!trimString(providerConfig.apiKey) || !trimString(providerConfig.baseUrl)) {
                return {
                    ok: false,
                    status: 'missing_config',
                    provider,
                    model,
                    reason: '自定义 OpenAI 兼容接口需要同时填写 Base URL 和 API Key',
                    providerConfig
                };
            }
            return { ok: true, status: 'ready', provider, model, reason: '', providerConfig };
        }

        return {
            ok: false,
            status: 'unknown_provider',
            provider,
            model,
            reason: `暂不支持该 provider: ${provider}`,
            providerConfig
        };
    }

    function buildImageGenerationSummary(settings) {
        const normalized = normalizeImageGenerationSettings(settings);
        if (!normalized.enabled) {
            return '未启用';
        }

        const label = getProviderLabel(normalized.provider);
        const model = getResolvedModel(normalized, normalized.provider, normalized.model);
        const healthTextMap = {
            ok: '可用',
            failed: '异常',
            checking: '检查中',
            unknown: '未检查'
        };
        const health = healthTextMap[trimString(normalized.lastHealthCheckStatus || 'unknown')] || '未检查';

        return model ? `${label} / ${model} / ${health}` : `${label} / ${health}`;
    }

    function buildGoogleSafetySettings(level) {
        const thresholdMap = {
            block_none: 'BLOCK_NONE',
            block_few: 'BLOCK_ONLY_HIGH',
            block_some: 'BLOCK_MEDIUM_AND_ABOVE'
        };

        const threshold = thresholdMap[trimString(level || 'block_few')] || 'BLOCK_ONLY_HIGH';
        return [
            'HARM_CATEGORY_HARASSMENT',
            'HARM_CATEGORY_HATE_SPEECH',
            'HARM_CATEGORY_SEXUALLY_EXPLICIT',
            'HARM_CATEGORY_DANGEROUS_CONTENT'
        ].map((category) => ({ category, threshold }));
    }

    function isNovelAiLikeCustomModel(model) {
        const safeModel = trimString(model).toLowerCase();
        if (!safeModel) return false;
        return safeModel.includes('novelai')
            || safeModel.includes('nai-diffusion')
            || /(^|[^a-z0-9])nai([^a-z0-9]|$)/i.test(safeModel);
    }

    function resolveCompiledPromptProviderKey(provider, model) {
        if (provider === 'customOpenAiLike' && isNovelAiLikeCustomModel(model)) {
            return 'novelai';
        }
        return provider;
    }

    function getCompiledPromptValue(request, provider, model) {
        const compiled = request && request.compiledPrompt && typeof request.compiledPrompt === 'object'
            ? request.compiledPrompt
            : null;
        const providerPromptKey = resolveCompiledPromptProviderKey(provider, model);

        if (compiled && compiled.providerPrompts && compiled.providerPrompts[providerPromptKey]) {
            return trimString(compiled.providerPrompts[providerPromptKey]);
        }

        return trimString(request && (request.promptFinal || request.prompt));
    }

    function resolveRequestedImageDimensions(request, normalized) {
        return {
            width: Math.max(256, Math.floor(Number(request && request.width) || normalized.common.width || 1024)),
            height: Math.max(256, Math.floor(Number(request && request.height) || normalized.common.height || 1024))
        };
    }

    function buildRequestedImageSize(request, normalized) {
        const dimensions = resolveRequestedImageDimensions(request, normalized);
        return {
            width: dimensions.width,
            height: dimensions.height,
            size: `${dimensions.width}x${dimensions.height}`
        };
    }

    function getFileExtensionFromMimeType(mimeType) {
        const safeType = normalizeMimeType(mimeType);
        if (safeType === 'image/jpeg') return 'jpg';
        if (safeType === 'image/webp') return 'webp';
        if (safeType === 'image/gif') return 'gif';
        if (safeType === 'image/bmp') return 'bmp';
        return 'png';
    }

    function buildReferenceImageFileName(referenceImage, index) {
        const rawName = trimString(referenceImage && referenceImage.name) || `reference-${index + 1}`;
        const extension = getFileExtensionFromMimeType(referenceImage && referenceImage.mimeType);
        const baseName = rawName.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim() || `reference-${index + 1}`;
        return /\.[a-z0-9]{2,5}$/i.test(baseName) ? baseName : `${baseName}.${extension}`;
    }

    function blobToDataUrl(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(reader.error || new Error('Failed to read blob'));
            reader.readAsDataURL(blob);
        });
    }

    async function blobToBase64(blob) {
        const dataUrl = await blobToDataUrl(blob);
        const base64Value = String(dataUrl || '').split(',')[1] || '';
        if (!base64Value) {
            throw new Error('Failed to encode reference image');
        }
        return base64Value;
    }

    function normalizeReferenceImages(referenceImages) {
        if (!Array.isArray(referenceImages)) return [];

        return referenceImages
            .map((entry, index) => {
                if (!entry || typeof entry !== 'object') return null;
                const blob = entry.blob instanceof Blob ? entry.blob : null;
                if (!blob) return null;
                const mimeType = normalizeMimeType(entry.mimeType || blob.type || 'image/png');
                if (!/^image\//i.test(mimeType)) return null;
                return {
                    id: trimString(entry.id || `reference-${index + 1}`),
                    name: trimString(entry.name || entry.title || ''),
                    note: trimString(entry.note || ''),
                    autoHint: trimString(entry.autoHint || ''),
                    mimeType,
                    blob
                };
            })
            .filter(Boolean)
            .slice(0, 4);
    }

    function supportsOpenAiDirectReference(model) {
        const safeModel = trimString(model).toLowerCase();
        return Boolean(safeModel) && (safeModel.includes('gpt-image') || safeModel.includes('chatgpt-image'));
    }

    function supportsOpenAiHighInputFidelity(model) {
        return trimString(model).toLowerCase() === 'gpt-image-1';
    }

    function supportsGoogleDirectReference(model) {
        const safeModel = trimString(model).toLowerCase();
        return Boolean(safeModel) && safeModel.includes('gemini') && safeModel.includes('image');
    }

    function isGoogleImagenModel(model) {
        const safeModel = trimString(model).toLowerCase();
        return Boolean(safeModel) && safeModel.startsWith('imagen-');
    }

    function buildDirectReferencePrompt(prompt) {
        const safePrompt = trimString(prompt);
        const prefix = 'Reference images are attached. Keep character identity, hairstyle, outfit, scene anchors, and overall vibe consistent unless the prompt explicitly requests a change.';
        return safePrompt ? `${prefix}\n${safePrompt}` : prefix;
    }

    function shouldUseOpenAiResponsesMode(normalized, provider, model) {
        if (provider !== 'openai') return false;
        const providerConfig = normalized && normalized.providers ? normalized.providers.openai || {} : {};
        const apiMode = trimString(providerConfig.apiMode || 'auto').toLowerCase() || 'auto';
        if (apiMode === 'responses') return true;
        if (apiMode === 'images') return false;
        const safeModel = trimString(model).toLowerCase();
        if (!safeModel) return true;
        if (safeModel.includes('chatgpt-image')) return true;
        return true;
    }

    function shouldFallbackOpenAiResponsesToImages(error) {
        const message = trimString(error && error.message).toLowerCase();
        if (!message) return false;
        return [
            'unknown request url',
            '/responses',
            'http 404',
            '404',
            'http 405',
            '405',
            'not found',
            'not supported',
            'unsupported parameter',
            'unsupported value',
            'does not support',
            'model not found',
            'unrecognized request argument'
        ].some((token) => message.includes(token));
    }

    function buildOpenAiResponsesInput(prompt, referenceImages) {
        const content = [];
        const directPrompt = referenceImages.length > 0
            ? buildDirectReferencePrompt(prompt)
            : trimString(prompt);

        if (directPrompt) {
            content.push({
                type: 'input_text',
                text: directPrompt
            });
        }

        referenceImages.forEach((referenceImage) => {
            content.push({
                type: 'input_image',
                image_url: ''
            });
        });

        return content;
    }

    async function populateOpenAiResponsesImageInputs(content, referenceImages) {
        for (let index = 0; index < referenceImages.length; index += 1) {
            const referenceImage = referenceImages[index];
            const base64Value = await blobToBase64(referenceImage.blob);
            content[index + (content.length - referenceImages.length)].image_url = `data:${referenceImage.mimeType};base64,${base64Value}`;
        }
        return content;
    }

    function extractOpenAiResponsesOutputText(data) {
        const directText = trimString(data && data.output_text);
        if (directText) return directText;

        const queue = [];
        if (data && typeof data === 'object') {
            queue.push(data.output, data.content, data.message);
        }

        while (queue.length > 0) {
            const current = queue.shift();
            if (!current) continue;
            if (Array.isArray(current)) {
                current.forEach((entry) => queue.push(entry));
                continue;
            }
            if (!isPlainObject(current)) continue;

            if (typeof current.text === 'string' && trimString(current.text)) {
                return trimString(current.text);
            }
            if (typeof current.output_text === 'string' && trimString(current.output_text)) {
                return trimString(current.output_text);
            }

            Object.keys(current).forEach((key) => {
                const value = current[key];
                if (value && (Array.isArray(value) || isPlainObject(value))) {
                    queue.push(value);
                }
            });
        }

        return '';
    }

    function extractOpenAiResponsesImagePayload(data) {
        const queue = [];
        if (data && typeof data === 'object') {
            queue.push(data);
        }

        while (queue.length > 0) {
            const current = queue.shift();
            if (!current) continue;

            if (Array.isArray(current)) {
                current.forEach((entry) => queue.push(entry));
                continue;
            }

            if (!isPlainObject(current)) {
                continue;
            }

            const base64Value = trimString(
                current.result
                || current.b64_json
                || current.image_base64
                || current.imageBase64
                || ''
            );
            if (base64Value) {
                return {
                    base64: base64Value,
                    mimeType: normalizeMimeType(current.mime_type || current.mimeType || 'image/png'),
                    revisedPrompt: trimString(
                        current.revised_prompt
                        || current.revisedPrompt
                        || current.prompt
                        || ''
                    )
                };
            }

            const imageUrl = trimString(current.url || current.image_url || current.imageUrl || '');
            if (imageUrl) {
                return {
                    url: imageUrl,
                    mimeType: normalizeMimeType(current.mime_type || current.mimeType || 'image/png'),
                    revisedPrompt: trimString(
                        current.revised_prompt
                        || current.revisedPrompt
                        || current.prompt
                        || ''
                    )
                };
            }

            Object.keys(current).forEach((key) => {
                const value = current[key];
                if (value && (Array.isArray(value) || isPlainObject(value))) {
                    queue.push(value);
                }
            });
        }

        return null;
    }

    function resolveGoogleAspectRatio(request, normalized) {
        const configuredRatio = trimString(request && request.aspectRatio || normalized.common && normalized.common.aspectRatio);
        const supportedRatios = new Set(['1:1', '9:16', '16:9', '4:3', '3:4']);
        if (supportedRatios.has(configuredRatio)) {
            return configuredRatio;
        }

        const dimensions = resolveRequestedImageDimensions(request, normalized);
        const ratio = dimensions.width / Math.max(1, dimensions.height);
        if (Math.abs(ratio - 1) < 0.08) return '1:1';
        if (Math.abs(ratio - (16 / 9)) < 0.12) return '16:9';
        if (Math.abs(ratio - (9 / 16)) < 0.08) return '9:16';
        if (Math.abs(ratio - (4 / 3)) < 0.1) return '4:3';
        if (Math.abs(ratio - (3 / 4)) < 0.08) return '3:4';
        return '';
    }

    function getReferenceCapability(settings, providerOverride, modelOverride) {
        const normalized = normalizeImageGenerationSettings(settings || {});
        const provider = trimString(providerOverride || normalized.provider) || normalized.provider;
        const model = trimString(modelOverride || getResolvedModel(normalized, provider, modelOverride));

        if (normalized.common && normalized.common.allowReference === false) {
            return {
                provider,
                model,
                mode: 'disabled',
                shortLabel: '已关闭',
                message: '本次请求已关闭参考图能力。',
            };
        }

        if (!model) {
            return {
                provider,
                model,
                mode: 'unknown',
                shortLabel: '待配置模型',
                message: '请先配置模型，系统才能准确判断参考图能力。',
            };
        }

        if (provider === 'openai' && shouldUseOpenAiResponsesMode(normalized, provider, model)) {
            return {
                provider,
                model,
                mode: 'direct',
                shortLabel: 'Responses 参考图',
                message: 'OpenAI Responses 会把参考图作为输入图片一并发送，并在生图前帮你优化 prompt。',
            };
        }

        if (provider === 'openai' && supportsOpenAiDirectReference(model)) {
            return {
                provider,
                model,
                mode: 'direct',
                shortLabel: '直传参考图',
                message: '这个 OpenAI 图片模型会随请求直传最多 4 张参考图。',
            };
        }

        if (provider === 'google') {
            if (supportsGoogleDirectReference(model)) {
                return {
                    provider,
                    model,
                    mode: 'direct',
                    shortLabel: '直传参考图',
                    message: '这个 Gemini 图片模型会把参考图以内联图片的方式一起发送。',
                };
            }

            if (isGoogleImagenModel(model)) {
                return {
                    provider,
                    model,
                    mode: 'prompt_only',
                    shortLabel: '文本锚点',
                    message: '这个 Imagen 模型只接收文本 prompt，所以参考图会回退成文本锚点。',
                };
            }
        }

        return {
            provider,
            model,
            mode: 'prompt_only',
            shortLabel: '文本锚点',
            message: '当前 provider / model 不直传原始参考图，所以参考图会回退成文本锚点。'
        };
    }

    function extractGoogleImagenImageData(predictions) {
        const queue = Array.isArray(predictions) ? predictions.slice() : [];

        while (queue.length > 0) {
            const current = queue.shift();
            if (!current) continue;

            if (Array.isArray(current)) {
                current.forEach((item) => queue.push(item));
                continue;
            }

            if (!isPlainObject(current)) {
                continue;
            }

            if (typeof current.bytesBase64Encoded === 'string' && trimString(current.bytesBase64Encoded)) {
                return {
                    base64: trimString(current.bytesBase64Encoded),
                    mimeType: normalizeMimeType(current.mimeType || current.mime_type || 'image/png')
                };
            }

            if (typeof current.imageBytes === 'string' && trimString(current.imageBytes)) {
                return {
                    base64: trimString(current.imageBytes),
                    mimeType: normalizeMimeType(current.mimeType || current.mime_type || 'image/png')
                };
            }

            Object.keys(current).forEach((key) => {
                const value = current[key];
                if (value && (Array.isArray(value) || isPlainObject(value))) {
                    queue.push(value);
                }
            });
        }

        return null;
    }

    async function parseOpenAiLikeImageResponse(response, context) {
        const contentType = trimString(response.headers.get('content-type')).toLowerCase();
        const provider = context.provider;
        const model = context.model;
        const prompt = context.prompt;
        const providerMeta = context && context.providerMeta && typeof context.providerMeta === 'object'
            ? context.providerMeta
            : {};

        emitContextTrace(context, 'provider.response', response.ok ? '已收到 provider 响应' : 'provider 返回错误响应', {
            provider,
            model,
            status: response.status,
            contentType
        });

        if (!response.ok) {
            const errorMessage = await readErrorMessage(response);
            throw new Error(errorMessage || `${getProviderLabel(provider)} 生图失败`);
        }

        if (contentType.startsWith('image/')) {
            emitContextTrace(context, 'provider.decode', '响应体为二进制图片，直接解码', {
                provider,
                model,
                rawResponseType: 'binary'
            });
            const blob = await response.blob();
            return buildSuccessResult({
                provider,
                model,
                prompt,
                promptFinal: prompt,
                blob,
                mimeType: normalizeMimeType(blob.type || contentType),
                providerMeta: Object.assign({}, providerMeta, {
                    rawResponseType: 'binary'
                }),
                message: `${getProviderLabel(provider)} 生图成功`
            });
        }

        const data = await response.json();
        const imageEntry = Array.isArray(data && data.data) ? data.data[0] : null;

        if (!imageEntry) {
            throw new Error('Image response did not contain any image data');
        }

        let blob = null;
        let mimeType = 'image/png';

        if (imageEntry.b64_json) {
            emitContextTrace(context, 'provider.decode', '响应体包含 base64 图片数据', {
                provider,
                model,
                rawResponseType: 'json_base64'
            });
            mimeType = normalizeMimeType(imageEntry.mime_type || imageEntry.mimeType || 'image/png');
            blob = decodeBase64ToBlob(imageEntry.b64_json, mimeType);
        } else if (imageEntry.url) {
            emitContextTrace(context, 'provider.decode', '响应体返回图片 URL，准备二次下载', {
                provider,
                model,
                rawResponseType: 'json_url'
            });
            blob = await fetchBlobFromUrl(imageEntry.url);
            mimeType = normalizeMimeType(blob.type || 'image/png');
        } else if (imageEntry.image_url) {
            emitContextTrace(context, 'provider.decode', '响应体返回 image_url，准备二次下载', {
                provider,
                model,
                rawResponseType: 'json_image_url'
            });
            blob = await fetchBlobFromUrl(imageEntry.image_url);
            mimeType = normalizeMimeType(blob.type || 'image/png');
        } else {
            throw new Error('接口返回成功，但没有拿到图片内容');
        }

        return buildSuccessResult({
            provider,
            model,
            prompt,
            promptFinal: prompt,
            revisedPrompt: trimString(imageEntry.revised_prompt || imageEntry.prompt || ''),
            blob,
            mimeType,
            providerMeta: Object.assign({}, providerMeta, {
                rawResponseType: 'json'
            }),
            message: `${getProviderLabel(provider)} 生图成功`
        });
    }

    function extractImagePayloadFromChatText(rawText) {
        const text = trimString(rawText);
        if (!text) return null;

        const dataUrlMatch = text.match(/data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\r\n]+)/i);
        if (dataUrlMatch) {
            return {
                base64: dataUrlMatch[2].replace(/\s+/g, ''),
                mimeType: normalizeMimeType(dataUrlMatch[1])
            };
        }

        const markdownUrlMatch = text.match(/!\[[^\]]*\]\(\s*(https?:\/\/[^\s)]+)\s*\)/i);
        if (markdownUrlMatch) {
            return { url: markdownUrlMatch[1], mimeType: 'image/png' };
        }

        const bareUrlMatch = text.match(/https?:\/\/[^\s<>"')\]]+/i);
        if (bareUrlMatch) {
            return {
                url: bareUrlMatch[0].replace(/[.,;!?，。；！]+$/, ''),
                mimeType: 'image/png'
            };
        }

        return null;
    }

    function extractImagePayloadFromChatContent(content) {
        const queue = [content];

        while (queue.length > 0) {
            const current = queue.shift();
            if (!current) continue;

            if (typeof current === 'string') {
                const textPayload = extractImagePayloadFromChatText(current);
                if (textPayload) return textPayload;
                continue;
            }

            if (Array.isArray(current)) {
                current.forEach((entry) => queue.push(entry));
                continue;
            }

            if (!isPlainObject(current)) continue;

            const base64Value = trimString(
                current.b64_json
                || current.image_base64
                || current.imageBase64
                || current.base64
                || ''
            );
            if (base64Value) {
                return {
                    base64: base64Value,
                    mimeType: normalizeMimeType(current.mime_type || current.mimeType || 'image/png')
                };
            }

            const directUrl = typeof current.url === 'string'
                ? current.url
                : (typeof current.image_url === 'string'
                    ? current.image_url
                    : (isPlainObject(current.image_url) ? current.image_url.url : current.imageUrl));
            const urlPayload = extractImagePayloadFromChatText(directUrl);
            if (urlPayload) return urlPayload;

            ['content', 'text', 'images', 'image', 'output'].forEach((key) => {
                if (current[key]) queue.push(current[key]);
            });
        }

        return null;
    }

    async function parseChatCompletionImageResponse(response, context) {
        const contentType = trimString(response.headers.get('content-type')).toLowerCase();
        const provider = context.provider;
        const model = context.model;
        const prompt = context.prompt;
        const providerMeta = context && context.providerMeta && typeof context.providerMeta === 'object'
            ? context.providerMeta
            : {};

        emitContextTrace(context, 'provider.response', response.ok ? '已收到 Chat 生图响应' : 'Chat 生图接口返回错误响应', {
            provider,
            model,
            status: response.status,
            contentType
        });

        if (!response.ok) {
            const errorMessage = await readErrorMessage(response);
            throw new Error(errorMessage || `${getProviderLabel(provider)} Chat 生图失败`);
        }

        if (contentType.startsWith('image/')) {
            const blob = await response.blob();
            return buildSuccessResult({
                provider,
                model,
                prompt,
                promptFinal: prompt,
                blob,
                mimeType: normalizeMimeType(blob.type || contentType),
                providerMeta: Object.assign({}, providerMeta, { rawResponseType: 'binary' }),
                message: `${getProviderLabel(provider)} Chat 生图成功`
            });
        }

        const data = await response.json();
        const choiceMessage = data && data.choices && data.choices[0] && data.choices[0].message;
        const imagePayload = extractImagePayloadFromChatContent([
            choiceMessage && choiceMessage.content,
            choiceMessage && choiceMessage.images,
            data && data.data,
            data && data.output
        ]);

        if (!imagePayload) {
            const preview = trimString(choiceMessage && choiceMessage.content).slice(0, 160);
            throw new Error(preview
                ? `Chat 生图接口未返回可识别的图片内容: ${preview}`
                : 'Chat 生图接口未返回可识别的图片内容');
        }

        let blob = null;
        let mimeType = normalizeMimeType(imagePayload.mimeType || 'image/png');

        if (imagePayload.base64) {
            emitContextTrace(context, 'provider.decode', 'Chat 响应包含 base64 图片数据', {
                provider,
                model,
                rawResponseType: 'chat_base64'
            });
            blob = decodeBase64ToBlob(imagePayload.base64, mimeType);
        } else {
            emitContextTrace(context, 'provider.decode', 'Chat 响应返回图片 URL，准备二次下载', {
                provider,
                model,
                rawResponseType: 'chat_url'
            });
            blob = await fetchBlobFromUrl(imagePayload.url);
            mimeType = normalizeMimeType(blob.type || mimeType);
        }

        return buildSuccessResult({
            provider,
            model,
            prompt,
            promptFinal: prompt,
            blob,
            mimeType,
            providerMeta: Object.assign({}, providerMeta, {
                rawResponseType: imagePayload.base64 ? 'chat_base64' : 'chat_url'
            }),
            message: `${getProviderLabel(provider)} Chat 生图成功`
        });
    }

    function getCompiledNegativePromptValue(request) {
        const compiled = request && request.compiledPrompt && typeof request.compiledPrompt === 'object'
            ? request.compiledPrompt
            : null;
        return trimString(compiled && compiled.negativePrompt);
    }

    async function generateWithCustomOpenAiChatImage(request, providerConfig, model, prompt, imageSize) {
        const baseUrl = trimString(providerConfig.baseUrl) || DEFAULT_OPENAI_BASE_URL;
        const chatPath = trimString(providerConfig.chatPath) || DEFAULT_OPENAI_CHAT_PATH;
        const endpoint = joinUrl(baseUrl, chatPath);
        const headers = Object.assign({
            'Content-Type': 'application/json'
        }, parseExtraHeaders(providerConfig.extraHeaders));
        const authHeader = buildBearerAuthHeader(providerConfig.apiKey);
        if (authHeader) {
            headers.Authorization = authHeader;
        }

        const body = {
            model,
            messages: [{
                role: 'user',
                content: prompt
            }],
            size: `${imageSize.width}:${imageSize.height}`,
            stream: false
        };
        const negativePrompt = getCompiledNegativePromptValue(request);
        if (negativePrompt) {
            body.negative_prompt = negativePrompt;
        }

        emitRequestTrace(request, 'provider.request', '发送 Chat Completions 生图请求', {
            provider: 'customOpenAiLike',
            model,
            endpoint: sanitizeTraceUrl(endpoint),
            requestMode: 'chat_completions_image',
            size: body.size,
            negativePrompt: Boolean(negativePrompt)
        });

        const response = await fetch(endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify(body)
        });

        return parseChatCompletionImageResponse(response, {
            provider: 'customOpenAiLike',
            model,
            prompt,
            providerMeta: {
                requestMode: 'chat_completions_image',
                usedDirectReferenceImages: false,
                directReferenceImageCount: 0
            },
            onTrace: request.onTrace
        });
    }

    async function generateWithOpenAiResponses(request, normalized, providerConfig, model, prompt, imageSize, referenceImages) {
        const baseUrl = trimString(providerConfig.baseUrl) || DEFAULT_OPENAI_BASE_URL;
        const endpoint = joinUrl(baseUrl, DEFAULT_OPENAI_RESPONSES_PATH);
        const headers = {
            'Content-Type': 'application/json'
        };

        emitRequestTrace(request, 'provider.mode', '本次请求走 OpenAI Responses 生图链路', {
            provider: 'openai',
            model,
            endpoint: sanitizeTraceUrl(endpoint),
            referenceImageCount: referenceImages.length
        });

        const authHeader = buildBearerAuthHeader(providerConfig.apiKey);
        if (authHeader) {
            headers.Authorization = authHeader;
        }

        const content = buildOpenAiResponsesInput(prompt, referenceImages);
        await populateOpenAiResponsesImageInputs(content, referenceImages);

        const tool = {
            type: 'image_generation',
            size: imageSize.size
        };
        const quality = trimString(request.quality || normalized.common.quality);
        if (quality) {
            tool.quality = quality;
        }
        if (trimString(providerConfig.background)) {
            tool.background = trimString(providerConfig.background);
        }

        const body = {
            model,
            input: [{
                role: 'user',
                content
            }],
            tools: [tool],
            tool_choice: { type: 'image_generation' }
        };

        emitRequestTrace(request, 'provider.request', '已发送 OpenAI Responses 请求', {
            provider: 'openai',
            model,
            endpoint: sanitizeTraceUrl(endpoint),
            size: imageSize.size,
            quality
        });
        const response = await fetch(endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errorMessage = await readErrorMessage(response);
            throw new Error(errorMessage || 'OpenAI Responses 生图失败');
        }

        const data = await response.json();
        const imagePayload = extractOpenAiResponsesImagePayload(data);
        if (!imagePayload) {
            throw new Error(trimString(extractOpenAiResponsesOutputText(data)) || 'Responses API 没有返回图片结果');
        }

        let blob = null;
        let mimeType = normalizeMimeType(imagePayload.mimeType || 'image/png');
        if (imagePayload.base64) {
            emitRequestTrace(request, 'provider.decode', 'Responses 返回 base64 图片数据', {
                provider: 'openai',
                model,
                requestMode: 'responses'
            });
            blob = decodeBase64ToBlob(imagePayload.base64, mimeType);
        } else if (imagePayload.url) {
            emitRequestTrace(request, 'provider.decode', 'Responses 返回图片 URL，准备下载', {
                provider: 'openai',
                model,
                requestMode: 'responses'
            });
            blob = await fetchBlobFromUrl(imagePayload.url);
            mimeType = normalizeMimeType(blob.type || mimeType);
        }

        if (!blob) {
            throw new Error('Responses API 没有返回可用图片内容');
        }

        return buildSuccessResult({
            provider: 'openai',
            model,
            prompt,
            promptFinal: prompt,
            revisedPrompt: trimString(imagePayload.revisedPrompt || extractOpenAiResponsesOutputText(data)),
            blob,
            mimeType,
            providerMeta: {
                requestMode: 'responses',
                usedDirectReferenceImages: referenceImages.length > 0,
                directReferenceImageCount: referenceImages.length,
                rawResponseType: 'responses'
            },
            message: 'OpenAI Responses 生图成功'
        });
    }

    async function generateWithOpenAiLike(request, provider) {
        const normalized = normalizeImageGenerationSettings(request.settings || {});
        const providerConfig = provider === 'openai'
            ? normalized.providers.openai
            : normalized.providers.customOpenAiLike;
        const model = trimString(request.model || getResolvedModel(normalized, provider, request.model));
        const prompt = getCompiledPromptValue(request, provider, model);
        const baseUrl = trimString(providerConfig.baseUrl) || DEFAULT_OPENAI_BASE_URL;
        const imagePath = trimString(providerConfig.imagePath) || DEFAULT_OPENAI_IMAGE_PATH;
        const imageSize = buildRequestedImageSize(request, normalized);
        const referenceImages = normalizeReferenceImages(request.referenceImages);
        const customApiMode = provider === 'customOpenAiLike'
            ? (trimString(providerConfig.apiMode || 'auto').toLowerCase() || 'auto')
            : '';
        const shouldTryResponses = shouldUseOpenAiResponsesMode(normalized, provider, model);
        const canUseDirectReference = provider === 'openai'
            && referenceImages.length > 0
            && supportsOpenAiDirectReference(model);
        const providerPromptKey = resolveCompiledPromptProviderKey(provider, model);

        if (providerPromptKey !== provider) {
            emitRequestTrace(request, 'provider.prompt', '自定义兼容模型使用 provider 专用 prompt', {
                provider,
                model,
                promptProvider: providerPromptKey,
                promptPreview: prompt.slice(0, 220)
            });
        }

        if (provider === 'customOpenAiLike' && customApiMode === 'chat') {
            emitRequestTrace(request, 'provider.mode', '自定义兼容接口已选择 Chat Completions 生图协议', {
                provider,
                model
            });
            return generateWithCustomOpenAiChatImage(request, providerConfig, model, prompt, imageSize);
        }

        if (shouldTryResponses) {
            emitRequestTrace(request, 'provider.mode', '优先尝试 OpenAI Responses 模式', {
                provider,
                model,
                referenceImageCount: referenceImages.length
            });
            try {
                return await generateWithOpenAiResponses(
                    request,
                    normalized,
                    providerConfig,
                    model,
                    prompt,
                    imageSize,
                    referenceImages
                );
            } catch (error) {
                const openAiApiMode = trimString(providerConfig.apiMode || 'auto').toLowerCase() || 'auto';
                const allowAutoFallback = provider === 'openai' && openAiApiMode === 'auto';
                if (!(allowAutoFallback || (provider === 'openai' && shouldFallbackOpenAiResponsesToImages(error)))) {
                    throw error;
                }
                emitRequestTrace(request, 'provider.fallback', 'Responses 失败，准备回退到 Images 接口', {
                    provider,
                    model,
                    error: trimString(error && error.message)
                });
            }
        }

        if (canUseDirectReference) {
            const endpoint = joinUrl(baseUrl, '/images/edits');
            const headers = {};
            const authHeader = buildBearerAuthHeader(providerConfig.apiKey);
            if (authHeader) {
                headers.Authorization = authHeader;
            }

            const directReferencePrompt = buildDirectReferencePrompt(prompt);
            const formData = new FormData();
            formData.append('model', model);
            formData.append('prompt', directReferencePrompt);
            formData.append('n', String(Math.max(1, Number(request.imageCount) || 1)));
            formData.append('size', imageSize.size);

            if (trimString(request.quality || normalized.common.quality)) {
                formData.append('quality', trimString(request.quality || normalized.common.quality));
            }
            if (trimString(providerConfig.background)) {
                formData.append('background', trimString(providerConfig.background));
            }
            if (trimString(providerConfig.moderation)) {
                formData.append('moderation', trimString(providerConfig.moderation));
            }
            if (supportsOpenAiHighInputFidelity(model)) {
                formData.append('input_fidelity', 'high');
            }

            const imageFieldName = referenceImages.length > 1 ? 'image[]' : 'image';
            referenceImages.forEach((referenceImage, index) => {
                formData.append(
                    imageFieldName,
                    referenceImage.blob,
                    buildReferenceImageFileName(referenceImage, index)
                );
            });

            emitRequestTrace(request, 'provider.request', '发送 OpenAI /images/edits 请求', {
                provider,
                model,
                endpoint: sanitizeTraceUrl(endpoint),
                requestMode: 'edits',
                referenceImageCount: referenceImages.length,
                size: imageSize.size
            });
            const response = await fetch(endpoint, {
                method: 'POST',
                headers,
                body: formData
            });

            return parseOpenAiLikeImageResponse(response, {
                provider,
                model,
                prompt: directReferencePrompt,
                providerMeta: {
                    requestMode: 'edits',
                    usedDirectReferenceImages: true,
                    directReferenceImageCount: referenceImages.length
                },
                onTrace: request.onTrace
            });
        }

        const endpoint = joinUrl(baseUrl, imagePath);
        const headers = Object.assign({
            'Content-Type': 'application/json'
        }, provider === 'customOpenAiLike' ? parseExtraHeaders(providerConfig.extraHeaders) : {});
        const authHeader = buildBearerAuthHeader(providerConfig.apiKey);
        if (authHeader) {
            headers.Authorization = authHeader;
        }
        const body = {
            model,
            prompt,
            n: Math.max(1, Number(request.imageCount) || 1),
            size: imageSize.size
        };

        if (trimString(request.quality || normalized.common.quality)) {
            body.quality = trimString(request.quality || normalized.common.quality);
        }

        if (provider === 'openai') {
            if (trimString(providerConfig.background)) {
                body.background = trimString(providerConfig.background);
            }
            if (trimString(providerConfig.moderation)) {
                body.moderation = trimString(providerConfig.moderation);
            }
        }

        emitRequestTrace(request, 'provider.request', '发送 OpenAI 兼容图片生成请求', {
            provider,
            model,
            endpoint: sanitizeTraceUrl(endpoint),
            requestMode: 'generations',
            size: imageSize.size,
            quality: trimString(request.quality || normalized.common.quality)
        });
        const response = await fetch(endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify(body)
        });

        if (
            provider === 'customOpenAiLike'
            && customApiMode === 'auto'
            && (response.status === 404 || response.status === 405)
        ) {
            emitRequestTrace(request, 'provider.fallback', 'Images 接口不可用，自动改用 Chat Completions 生图协议', {
                provider,
                model,
                status: response.status,
                fromEndpoint: sanitizeTraceUrl(endpoint),
                toEndpoint: sanitizeTraceUrl(joinUrl(baseUrl, trimString(providerConfig.chatPath) || DEFAULT_OPENAI_CHAT_PATH))
            });
            return generateWithCustomOpenAiChatImage(request, providerConfig, model, prompt, imageSize);
        }

        return parseOpenAiLikeImageResponse(response, {
            provider,
            model,
            prompt,
            providerMeta: {
                requestMode: 'generations',
                usedDirectReferenceImages: false,
                directReferenceImageCount: 0
            },
            onTrace: request.onTrace
        });
    }

    async function generateWithGoogle(request) {
        const normalized = normalizeImageGenerationSettings(request.settings || {});
        const providerConfig = normalized.providers.google || {};
        const model = trimString(request.model || getResolvedModel(normalized, 'google', request.model));
        const prompt = getCompiledPromptValue(request, 'google');
        const baseUrl = trimString(providerConfig.baseUrl) || DEFAULT_GOOGLE_BASE_URL;

        if (isGoogleImagenModel(model)) {
            const endpoint = joinUrl(baseUrl, `/v1beta/models/${encodeURIComponent(model)}:predict`);
            const headers = {
                'Content-Type': 'application/json'
            };
            if (trimString(providerConfig.apiKey)) {
                headers['x-goog-api-key'] = trimString(providerConfig.apiKey);
            }

            const parameters = {
                sampleCount: Math.max(1, Number(request.imageCount) || 1)
            };
            const aspectRatio = resolveGoogleAspectRatio(request, normalized);
            if (aspectRatio) {
                parameters.aspectRatio = aspectRatio;
            }

            emitRequestTrace(request, 'provider.request', '发送 Google Imagen predict 请求', {
                provider: 'google',
                model,
                endpoint: sanitizeTraceUrl(endpoint),
                requestMode: 'predict',
                aspectRatio: parameters.aspectRatio || '',
                sampleCount: parameters.sampleCount
            });
            const response = await fetch(endpoint, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    instances: [{ prompt }],
                    parameters
                })
            });

            if (!response.ok) {
                const errorMessage = await readErrorMessage(response);
                throw new Error(errorMessage || 'Google Imagen 生图失败');
            }

            const data = await response.json();
            const imageData = extractGoogleImagenImageData(data && data.predictions);
            if (!imageData || !imageData.base64) {
                throw new Error('Google Imagen 没有返回可用图片内容');
            }

            const mimeType = normalizeMimeType(imageData.mimeType || 'image/png');
            const blob = decodeBase64ToBlob(imageData.base64, mimeType);

            return buildSuccessResult({
                provider: 'google',
                model,
                prompt,
                promptFinal: prompt,
                blob,
                mimeType,
                providerMeta: {
                    requestMode: 'predict',
                    usedDirectReferenceImages: false,
                    directReferenceImageCount: 0
                },
                message: 'Google Imagen 生图成功'
            });
        }

        const referenceImages = normalizeReferenceImages(request.referenceImages);
        const useDirectReference = referenceImages.length > 0 && supportsGoogleDirectReference(model);
        const promptForRequest = useDirectReference ? buildDirectReferencePrompt(prompt) : prompt;
        const endpoint = appendQuery(
            joinUrl(baseUrl, `/v1beta/models/${encodeURIComponent(model)}:generateContent`),
            { key: trimString(providerConfig.apiKey) }
        );

        const inputParts = [{ text: promptForRequest }];
        if (useDirectReference) {
            const encodedReferenceParts = await Promise.all(
                referenceImages.map(async (referenceImage) => ({
                    inlineData: {
                        mimeType: referenceImage.mimeType,
                        data: await blobToBase64(referenceImage.blob)
                    }
                }))
            );
            inputParts.push(...encodedReferenceParts);
        }

        const generationConfig = {
            responseModalities: ['TEXT', 'IMAGE']
        };
        const aspectRatio = resolveGoogleAspectRatio(request, normalized);
        if (aspectRatio) {
            generationConfig.imageConfig = { aspectRatio };
        }

        emitRequestTrace(request, 'provider.request', '发送 Google generateContent 图像请求', {
            provider: 'google',
            model,
            endpoint: sanitizeTraceUrl(endpoint),
            requestMode: 'generateContent',
            referenceImageCount: useDirectReference ? referenceImages.length : 0,
            aspectRatio: aspectRatio || ''
        });
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{
                    parts: inputParts
                }],
                generationConfig,
                safetySettings: buildGoogleSafetySettings(providerConfig.safetyLevel)
            })
        });

        if (!response.ok) {
            const errorMessage = await readErrorMessage(response);
            throw new Error(errorMessage || 'Google 生图失败');
        }

        const data = await response.json();
        const candidates = Array.isArray(data && data.candidates) ? data.candidates : [];
        const responseParts = candidates.flatMap((candidate) => (candidate && candidate.content && Array.isArray(candidate.content.parts)) ? candidate.content.parts : []);
        const imagePart = responseParts.find((part) => part && part.inlineData && part.inlineData.data);
        const textPart = responseParts.find((part) => part && typeof part.text === 'string' && trimString(part.text));

        if (!imagePart || !imagePart.inlineData || !imagePart.inlineData.data) {
            throw new Error('Google 接口没有返回图片内容');
        }

        const mimeType = normalizeMimeType(imagePart.inlineData.mimeType || 'image/png');
        const blob = decodeBase64ToBlob(imagePart.inlineData.data, mimeType);

        return buildSuccessResult({
            provider: 'google',
            model,
            prompt,
            promptFinal: promptForRequest,
            revisedPrompt: trimString(textPart && textPart.text),
            blob,
            mimeType,
            providerMeta: {
                requestMode: 'generateContent',
                usedDirectReferenceImages: useDirectReference,
                directReferenceImageCount: useDirectReference ? referenceImages.length : 0
            },
            message: 'Google 生图成功'
        });
    }

    function findEndOfCentralDirectory(view) {
        for (let offset = view.byteLength - 22; offset >= 0; offset -= 1) {
            if (view.getUint32(offset, true) === 0x06054b50) {
                return offset;
            }
        }
        return -1;
    }

    function extractFirstFileFromZip(arrayBuffer) {
        const bytes = new Uint8Array(arrayBuffer);
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const endOffset = findEndOfCentralDirectory(view);

        if (endOffset < 0) {
            throw new Error('NovelAI 返回的 ZIP 数据无法解析');
        }

        const totalEntries = view.getUint16(endOffset + 10, true);
        const centralDirectoryOffset = view.getUint32(endOffset + 16, true);
        const decoder = new TextDecoder('utf-8');
        let offset = centralDirectoryOffset;

        for (let i = 0; i < Math.max(1, totalEntries); i += 1) {
            if (view.getUint32(offset, true) !== 0x02014b50) {
                break;
            }

            const compressionMethod = view.getUint16(offset + 10, true);
            const compressedSize = view.getUint32(offset + 20, true);
            const fileNameLength = view.getUint16(offset + 28, true);
            const extraFieldLength = view.getUint16(offset + 30, true);
            const commentLength = view.getUint16(offset + 32, true);
            const localHeaderOffset = view.getUint32(offset + 42, true);
            const fileName = decoder.decode(bytes.subarray(offset + 46, offset + 46 + fileNameLength));

            if (!fileName.endsWith('/')) {
                if (view.getUint32(localHeaderOffset, true) !== 0x04034b50) {
                    throw new Error('NovelAI ZIP header is invalid');
                }

                const localNameLength = view.getUint16(localHeaderOffset + 26, true);
                const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
                const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
                const compressedBytes = bytes.subarray(dataStart, dataStart + compressedSize);
                let outputBytes = null;

                if (compressionMethod === 0) {
                    outputBytes = compressedBytes;
                } else if (compressionMethod === 8) {
                    if (!window.pako || typeof window.pako.inflateRaw !== 'function') {
                        throw new Error('缺少 ZIP 解压依赖，无法解析 NovelAI 返回结果');
                    }
                    outputBytes = window.pako.inflateRaw(compressedBytes);
                } else {
                    throw new Error(`暂不支持该 ZIP 压缩方式: ${compressionMethod}`);
                }

                return {
                    fileName,
                    mimeType: guessMimeTypeFromFileName(fileName),
                    blob: new Blob([outputBytes], { type: guessMimeTypeFromFileName(fileName) })
                };
            }

            offset += 46 + fileNameLength + extraFieldLength + commentLength;
        }

        throw new Error('No image file found in NovelAI ZIP');
    }

    async function generateWithNovelAi(request) {
        const normalized = normalizeImageGenerationSettings(request.settings || {});
        const providerConfig = normalized.providers.novelai || {};
        const model = normalizeNovelAiModelId(request.model || getResolvedModel(normalized, 'novelai', request.model));
        const prompt = getCompiledPromptValue(request, 'novelai');
        const compiled = request && request.compiledPrompt && typeof request.compiledPrompt === 'object'
            ? request.compiledPrompt
            : null;
        const negativePrompt = trimString(
            (compiled && compiled.negativePrompt)
            || providerConfig.negativePrompt
        );
        const numericSeed = trimString(request.seed || normalized.common.seed)
            ? Math.floor(Number(request.seed || normalized.common.seed))
            : Math.floor(Math.random() * 1000000000);
        const endpoint = DEFAULT_NOVELAI_PROXY_GENERATE_PATH;
        const width = Math.max(256, Math.floor(Number(request.width) || normalized.common.width || 1024));
        const height = Math.max(256, Math.floor(Number(request.height) || normalized.common.height || 1024));
        const steps = Math.max(1, Math.floor(Number(providerConfig.steps) || 28));
        const sampler = normalizeNovelAiSampler(providerConfig.sampler);
        const scale = clampNumber(providerConfig.scale, 1, 20, 6.5);
        const cfgRescale = clampNumber(providerConfig.cfgRescale, 0, 1, 0.18);
        const noiseSchedule = trimString(providerConfig.noiseSchedule || 'karras') || 'karras';
        const nSamples = Math.max(1, Number(request.imageCount) || 1);
        const seed = Number.isFinite(numericSeed) ? numericSeed : Math.floor(Math.random() * 1000000000);
        const isV4Model = isNovelAiV4Model(model);
        const parameters = {
            params_version: 3,
            width,
            height,
            scale,
            sampler,
            steps,
            n_samples: nSamples,
            seed,
            qualityToggle: true,
            ucPreset: 0,
            uc: negativePrompt
        };

        if (isV4Model) {
            parameters.v4_prompt = buildNovelAiV4Caption(prompt, { useOrder: false });
            parameters.v4_negative_prompt = buildNovelAiV4Caption(negativePrompt, { useOrder: false });
            parameters.noise_schedule = noiseSchedule;
            parameters.cfg_rescale = cfgRescale;
            parameters.sm = Boolean(providerConfig.sm);
            parameters.sm_dyn = Boolean(providerConfig.smDyn);
        }

        emitRequestTrace(request, 'provider.request', '发送 NovelAI 生图请求', {
            provider: 'novelai',
            model,
            endpoint: sanitizeTraceUrl(endpoint),
            requestMode: isV4Model ? 'proxy_generate_v4' : 'proxy_generate_v3',
            width,
            height,
            steps,
            sampler,
            seed,
            noiseSchedule: isV4Model ? noiseSchedule : '',
            cfgRescale: isV4Model ? cfgRescale : '',
            sm: isV4Model ? parameters.sm : '',
            smDyn: isV4Model ? parameters.sm_dyn : ''
        });
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: buildBearerAuthHeader(providerConfig.apiKey)
            },
            body: JSON.stringify({
                input: prompt,
                model,
                action: 'generate',
                parameters
            })
        });

        if (!response.ok) {
            const errorMessage = await readErrorMessage(response);
            if (response.status === 401 || response.status === 403) {
                throw new Error([
                    'NovelAI 鉴权失败：请确认填写的是官网账号页的 Persistent API Token（通常以 pst- 开头），不是中转站 sk- key。',
                    '如果是从别处复制的 Authorization，请只保留 token 本体；系统会自动去掉 Bearer 前缀和空白字符。',
                    errorMessage ? `上游返回：${errorMessage}` : ''
                ].filter(Boolean).join(' '));
            }
            throw new Error(errorMessage || 'NovelAI 生图失败');
        }

        const contentType = trimString(response.headers.get('content-type')).toLowerCase();
        if (contentType.startsWith('image/')) {
            const blob = await response.blob();
            return buildSuccessResult({
                provider: 'novelai',
                model,
                prompt,
                promptFinal: prompt,
                blob,
                mimeType: normalizeMimeType(blob.type || contentType),
                seed: String(seed),
                message: 'NovelAI 生图成功'
            });
        }

        const zipBuffer = await response.arrayBuffer();
        const extracted = extractFirstFileFromZip(zipBuffer);

        return buildSuccessResult({
            provider: 'novelai',
            model,
            prompt,
            promptFinal: prompt,
            blob: extracted.blob,
            mimeType: normalizeMimeType(extracted.mimeType),
            seed: String(seed),
            message: 'NovelAI 生图成功'
        });
    }

    async function generateWithPollinationsPromptUrl(request) {
        const normalized = normalizeImageGenerationSettings(request.settings || {});
        const providerConfig = normalized.providers.pollinations || {};
        const prompt = getCompiledPromptValue(request, 'pollinations');
        const model = trimString(request.model || getResolvedModel(normalized, 'pollinations', request.model)) || 'flux';
        const baseUrl = trimString(providerConfig.baseUrl) || DEFAULT_POLLINATIONS_PROMPT_BASE_URL;

        const endpoint = appendQuery(
            `${baseUrl.replace(/\/+$/, '')}/${encodeURIComponent(prompt)}`,
            {
                model,
                width: Math.max(256, Math.floor(Number(request.width) || normalized.common.width || 1024)),
                height: Math.max(256, Math.floor(Number(request.height) || normalized.common.height || 1024)),
                seed: trimString(request.seed || normalized.common.seed),
                nologo: 'true',
                safe: 'false',
                private: providerConfig.privateMode ? 'true' : 'false',
                enhance: providerConfig.enhancePrompt ? 'true' : 'false',
                negative: trimString(
                    (request.compiledPrompt && request.compiledPrompt.negativePrompt)
                    || providerConfig.negativePrompt
                )
            }
        );

        emitRequestTrace(request, 'provider.request', '发送 Pollinations prompt-url 生图请求', {
            provider: 'pollinations',
            model,
            endpoint: sanitizeTraceUrl(endpoint),
            requestMode: 'prompt_url'
        });
        const response = await fetch(endpoint);
        if (!response.ok) {
            const errorMessage = await readErrorMessage(response);
            throw new Error(errorMessage || 'Pollinations 生图失败');
        }

        const blob = await response.blob();
        return buildSuccessResult({
            provider: 'pollinations',
            model,
            prompt,
            promptFinal: prompt,
            blob,
            mimeType: normalizeMimeType(blob.type || 'image/jpeg'),
            seed: trimString(request.seed || normalized.common.seed),
            message: 'Pollinations 生图成功'
        });
    }

    async function generateWithPollinations(request) {
        const normalized = normalizeImageGenerationSettings(request.settings || {});
        const baseUrl = trimString(normalized.providers.pollinations && normalized.providers.pollinations.baseUrl);

        if (/\/v1\/?$/i.test(baseUrl) || /gen\.pollinations\.ai/i.test(baseUrl)) {
            emitRequestTrace(request, 'provider.mode', 'Pollinations 当前走 OpenAI 兼容图片接口', {
                provider: 'pollinations',
                endpoint: sanitizeTraceUrl(baseUrl)
            });
            const openAiLikeSettings = mergeDeep(normalized, {
                providers: {
                    customOpenAiLike: {
                        apiKey: '',
                        baseUrl,
                        apiMode: 'images',
                        imagePath: '/images/generations',
                        extraHeaders: ''
                    }
                }
            });

            return generateWithOpenAiLike(Object.assign({}, request, {
                settings: openAiLikeSettings,
                model: trimString(request.model || getResolvedModel(openAiLikeSettings, 'pollinations', request.model))
            }), 'customOpenAiLike').then((result) => {
                result.provider = 'pollinations';
                result.model = trimString(request.model || getResolvedModel(normalized, 'pollinations', request.model));
                result.message = 'Pollinations 生图成功';
                return result;
            });
        }

        return generateWithPollinationsPromptUrl(request);
    }

    async function generateImage(request = {}) {
        const normalized = normalizeImageGenerationSettings(request.settings || {});
        const availability = getProviderAvailability(normalized, request.provider, request.model);

        emitRequestTrace(request, 'bridge.start', 'bridge 已开始分派 provider 请求', {
            provider: availability.provider,
            model: availability.model,
            availability: availability.status || (availability.ok ? 'ready' : 'failed')
        });

        if (!availability.ok) {
            return buildFailureResult({
                provider: availability.provider,
                model: availability.model,
                prompt: trimString(request.prompt || request.promptFinal),
                promptFinal: trimString(request.promptFinal || request.prompt),
                error: availability.reason,
                message: availability.reason
            });
        }

        const safeRequest = Object.assign({}, request, {
            settings: normalized,
            provider: availability.provider,
            model: availability.model
        });

        try {
            if (availability.provider === 'openai') {
                return await generateWithOpenAiLike(safeRequest, 'openai');
            }
            if (availability.provider === 'google') {
                return await generateWithGoogle(safeRequest);
            }
            if (availability.provider === 'novelai') {
                return await generateWithNovelAi(safeRequest);
            }
            if (availability.provider === 'pollinations') {
                return await generateWithPollinations(safeRequest);
            }
            if (availability.provider === 'customOpenAiLike') {
                return await generateWithOpenAiLike(safeRequest, 'customOpenAiLike');
            }

            return buildFailureResult({
                provider: availability.provider,
                model: availability.model,
                prompt: trimString(request.prompt || request.promptFinal),
                promptFinal: trimString(request.promptFinal || request.prompt),
                error: `暂不支持该 provider: ${availability.provider}`
            });
        } catch (error) {
            return buildFailureResult({
                provider: availability.provider,
                model: availability.model,
                prompt: trimString(request.prompt || request.promptFinal),
                promptFinal: trimString(request.promptFinal || request.prompt),
                error: trimString(error && error.message) || '生图失败'
            });
        }
    }

    async function checkOpenAiLikeHealth(settings, provider) {
        const normalized = normalizeImageGenerationSettings(settings);
        const providerConfig = provider === 'openai'
            ? normalized.providers.openai
            : normalized.providers.customOpenAiLike;
        const baseUrl = trimString(providerConfig.baseUrl) || DEFAULT_OPENAI_BASE_URL;
        const model = getResolvedModel(normalized, provider, normalized.model);
        const endpoint = joinUrl(baseUrl, `/models/${encodeURIComponent(model)}`);
        const headers = Object.assign(
            buildBearerAuthHeader(providerConfig.apiKey)
                ? { Authorization: buildBearerAuthHeader(providerConfig.apiKey) }
                : {},
            provider === 'customOpenAiLike' ? parseExtraHeaders(providerConfig.extraHeaders) : {}
        );

        const response = await fetch(endpoint, { headers });
        if (!response.ok) {
            return {
                ok: false,
                status: 'failed',
                provider,
                model,
                message: await readErrorMessage(response)
            };
        }

        return {
            ok: true,
            status: 'ok',
            provider,
            model,
            message: `${getProviderLabel(provider)} 接口可达`
        };
    }

    async function checkGoogleHealth(settings) {
        const normalized = normalizeImageGenerationSettings(settings);
        const providerConfig = normalized.providers.google || {};
        const model = getResolvedModel(normalized, 'google', normalized.model);
        const baseUrl = trimString(providerConfig.baseUrl) || DEFAULT_GOOGLE_BASE_URL;
        const endpoint = appendQuery(
            joinUrl(baseUrl, `/v1beta/models/${encodeURIComponent(model)}`),
            { key: trimString(providerConfig.apiKey) }
        );

        const response = await fetch(endpoint);
        if (!response.ok) {
            return {
                ok: false,
                status: 'failed',
                provider: 'google',
                model,
                message: await readErrorMessage(response)
            };
        }

        return {
            ok: true,
            status: 'ok',
            provider: 'google',
            model,
            message: 'Google 生图接口可达'
        };
    }

    async function checkNovelAiHealth(settings) {
        const normalized = normalizeImageGenerationSettings(settings);
        const model = getResolvedModel(normalized, 'novelai', normalized.model);

        return {
            ok: true,
            status: 'ok',
            provider: 'novelai',
            model,
            message: 'NovelAI 将在实际生成时验证 Token'
        };
    }

    async function checkPollinationsHealth(settings) {
        const normalized = normalizeImageGenerationSettings(settings);
        const providerConfig = normalized.providers.pollinations || {};
        const model = getResolvedModel(normalized, 'pollinations', normalized.model);
        const baseUrl = trimString(providerConfig.baseUrl) || DEFAULT_POLLINATIONS_PROMPT_BASE_URL;

        if (/\/v1\/?$/i.test(baseUrl) || /gen\.pollinations\.ai/i.test(baseUrl)) {
            const endpoint = joinUrl(baseUrl, '/models');
            const response = await fetch(endpoint);
            if (!response.ok) {
                return {
                    ok: false,
                    status: 'failed',
                    provider: 'pollinations',
                    model,
                    message: await readErrorMessage(response)
                };
            }
        }

        return {
            ok: true,
            status: 'ok',
            provider: 'pollinations',
            model,
            message: 'Pollinations 接口可达'
        };
    }

    async function checkProviderHealth(settings, providerOverride) {
        const normalized = normalizeImageGenerationSettings(settings);
        const availability = getProviderAvailability(normalized, providerOverride, normalized.model);

        if (!availability.ok) {
            return {
                ok: false,
                status: availability.status || 'failed',
                provider: availability.provider,
                model: availability.model,
                message: availability.reason
            };
        }

        try {
            if (availability.provider === 'openai') {
                return await checkOpenAiLikeHealth(normalized, 'openai');
            }
            if (availability.provider === 'google') {
                return await checkGoogleHealth(normalized);
            }
            if (availability.provider === 'novelai') {
                return await checkNovelAiHealth(normalized);
            }
            if (availability.provider === 'pollinations') {
                return await checkPollinationsHealth(normalized);
            }
            if (availability.provider === 'customOpenAiLike') {
                return await checkOpenAiLikeHealth(normalized, 'customOpenAiLike');
            }
        } catch (error) {
            return {
                ok: false,
                status: 'failed',
                provider: availability.provider,
                model: availability.model,
                message: trimString(error && error.message) || '健康检查失败'
            };
        }

        return {
            ok: false,
            status: 'failed',
            provider: availability.provider,
            model: availability.model,
            message: `暂不支持该 provider: ${availability.provider}`
        };
    }

    window.IDICImageGenerationBridge = {
        buildImageGenerationSummary,
        checkProviderHealth,
        generateImage,
        getActiveProviderConfig,
        getDefaultImageGenerationSettings,
        getProviderAvailability,
        getProviderLabel,
        getReferenceCapability,
        getResolvedModel,
        normalizeImageGenerationSettings
    };
})();

