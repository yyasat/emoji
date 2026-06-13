(function () {
    'use strict';

    function compactText(value, limit) {
        const text = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
        if (!text) return '';
        if (!limit || text.length <= limit) return text;
        return `${text.slice(0, limit).trim()}...`;
    }

    const IMAGE_PERSONA_PREFERRED_LINE_RE = /^(?:chinese name|nickname|age|birthday|gender|height|identity|appearance|hair|eyes|skin|face style|body|tattoos and piercings|attire|business|casual|tops|bottoms|shoes|accessories|archetype|personality|default|traits)\b/i;
    const IMAGE_PERSONA_BLOCKED_LINE_RE = /(background_story|turn_point|social_status|writing_rule|\[ooc|ooc[:：]|童年|少年|青年|重逢|失联|恋爱|性瘾|自慰|公狗|疯狗|啃咬|拱人|三围|胸围|腰围|臀围|出轨|鬼混|酒桌文化|派对|网暴)/i;

    function stripXmlLikeTags(value) {
        return String(value == null ? '' : value)
            .replace(/<\/?info>/gi, ' ')
            .replace(/<\/?character>/gi, ' ')
            .replace(/<\/?writing_rule>/gi, ' ');
    }

    function sanitizePersonaLineForImage(line) {
        return String(line == null ? '' : line)
            .replace(/^\s*[-*]\s*/, '')
            .replace(/\s+#.*$/, '')
            .replace(/[,，。；; ]*三围[:：][^|]+/gi, '')
            .replace(/[,，。；; ]*(?:胸围|腰围|臀围)\s*[^,，。；;|]+/gi, '')
            .replace(/\{\{user\}\}/gi, 'the user')
            .trim();
    }

    function buildImageSafePersonaText(value) {
        const rawText = stripXmlLikeTags(value);
        if (!rawText.trim()) return '';

        const sourceLines = rawText
            .split(/\r?\n+/)
            .map(sanitizePersonaLineForImage)
            .filter(Boolean);

        const preferredLines = [];
        const fallbackLines = [];

        sourceLines.forEach((line) => {
            if (!line) return;
            if (IMAGE_PERSONA_BLOCKED_LINE_RE.test(line)) return;
            if (/^<\/?[^>]+>$/.test(line)) return;

            if (IMAGE_PERSONA_PREFERRED_LINE_RE.test(line)) {
                preferredLines.push(compactText(line, 220));
                return;
            }

            if (/:/.test(line) && !/[。.!?]$/.test(line)) {
                fallbackLines.push(compactText(line, 180));
            }
        });

        const merged = preferredLines.length
            ? preferredLines
            : fallbackLines;

        if (merged.length) {
            return compactText(merged.join(' | '), 1200);
        }

        const compact = compactText(
            sourceLines
                .filter((line) => !IMAGE_PERSONA_BLOCKED_LINE_RE.test(line))
                .join(' | '),
            900
        );
        return compact;
    }

    function normalizeWorldBook(worldBook, limit) {
        const rows = Array.isArray(worldBook) ? worldBook : [];
        return rows
            .slice(0, limit || 10)
            .map((entry) => {
                if (!entry || typeof entry !== 'object') return '';
                const key = compactText(entry.key || entry.name, 80);
                const value = compactText(entry.value || entry.content || entry.description, 240);
                if (!key && !value) return '';
                if (!key) return value;
                if (!value) return key;
                return `${key}: ${value}`;
            })
            .filter(Boolean);
    }

    function normalizeHints(value, limit, itemLimit) {
        if (!Array.isArray(value)) return [];
        return value
            .slice(0, limit || 10)
            .map((item) => {
                if (item && typeof item === 'object') {
                    return compactText(
                        item.label
                        || item.name
                        || item.title
                        || item.description
                        || item.note
                        || item.text,
                        itemLimit || 220
                    );
                }
                return compactText(item, itemLimit || 220);
            })
            .filter(Boolean);
    }

    function normalizeHintCollection(...groups) {
        const merged = [];
        const seen = new Set();

        groups.forEach((group) => {
            normalizeHints(group, 24, 220).forEach((item) => {
                const key = compactText(item, 240).toLowerCase();
                if (!key || seen.has(key)) return;
                seen.add(key);
                merged.push(compactText(item, 220));
            });
        });

        return merged;
    }

    function normalizePromptTagText(...groups) {
        const merged = [];
        const seen = new Set();
        const addTag = (value) => {
            const text = compactText(value, 220);
            const key = text.toLowerCase();
            if (!key || seen.has(key)) return;
            seen.add(key);
            merged.push(text);
        };

        groups.forEach((group) => {
            if (Array.isArray(group)) {
                normalizeHints(group, 80, 220).forEach(addTag);
                return;
            }

            String(group == null ? '' : group)
                .split(/[\n,，]+/)
                .map((item) => item.trim())
                .filter(Boolean)
                .forEach(addTag);
        });

        return merged;
    }

    function getStylePresetDirectives(stylePreset) {
        const preset = compactText(stylePreset || 'balanced', 40).toLowerCase();

        if (preset === 'cinematic') {
            return {
                summary: 'cinematic still frame',
                directives: [
                    'cinematic lighting',
                    'strong depth and spatial layering',
                    'controlled dramatic contrast',
                    'natural facial detail'
                ]
            };
        }

        if (preset === 'photo_real') {
            return {
                summary: 'photoreal image',
                directives: [
                    'photoreal skin texture',
                    'real camera lens behavior',
                    'grounded lighting',
                    'no stylized exaggeration'
                ]
            };
        }

        if (preset === 'illustration') {
            return {
                summary: 'high-end illustration',
                directives: [
                    'clean composition',
                    'intentional color design',
                    'refined line and shape language',
                    'storybook-grade readability'
                ]
            };
        }

        if (preset === 'story_insert') {
            return {
                summary: 'story insert illustration',
                directives: [
                    'moment-focused storytelling frame',
                    'clear subject and environment read',
                    'emotionally grounded composition',
                    'suitable as an in-story illustration'
                ]
            };
        }

        return {
            summary: 'high quality roleplay scene image',
            directives: [
                'clear composition',
                'coherent lighting',
                'stable identity consistency',
                'rich but controlled detail'
            ]
        };
    }

    function buildPromptBundle(input) {
        const source = input && typeof input === 'object' ? input : {};
        const stylePreset = compactText(source.stylePreset || source.promptStylePreset || 'balanced', 40) || 'balanced';

        return {
            mode: compactText(source.mode || 'chat_ai_image', 40) || 'chat_ai_image',
            provider: compactText(source.provider || 'openai', 40) || 'openai',
            stylePreset,
            promptPrefix: compactText(source.promptPrefix, 1200),
            imageIntent: compactText(source.imageIntent || source.imageDescription, 1200),
            persona: buildImageSafePersonaText(source.persona || source.characterPersona),
            worldBook: normalizeWorldBook(source.worldBook, 10),
            longTermMemory: compactText(source.longTermMemory || source.memorySummary, 1800),
            hippocampusMemory: compactText(source.hippocampusMemory || source.hippocampusSummary, 1600),
            recentDialogue: compactText(source.recentDialogue || source.chatHistory, 3600),
            sceneAnchors: normalizeHints(source.sceneAnchors, 10, 220),
            referenceHints: normalizeHints(source.referenceHints, 12, 220),
            environmentNotes: compactText(source.environmentNotes || source.sceneNotes, 1200),
            subjectCore: compactText(source.subjectCore || source.subject_core, 260),
            identityOverview: compactText(source.identityOverview || source.identity_overview, 500),
            finalVisualBrief: compactText(source.finalVisualBrief || source.final_visual_brief, 800),
            sceneSummary: compactText(source.sceneSummary || source.scene_summary, 600),
            appearanceTraits: normalizeHintCollection(source.appearanceTraits, source.appearance_traits, source.faceAndHairTraits, source.face_and_hair_traits, source.bodyTraits, source.body_traits),
            wardrobeTraits: normalizeHintCollection(source.wardrobeTraits, source.wardrobe_traits),
            expressionPose: normalizeHintCollection(source.expressionPose, source.expression_pose, source.actionPoseTraits, source.action_pose_traits),
            vibeTraits: normalizeHintCollection(source.vibeTraits, source.vibe_traits),
            settingTraits: normalizeHintCollection(source.settingTraits, source.setting_traits, source.environmentTraits, source.environment_traits),
            compositionTraits: normalizeHintCollection(source.compositionTraits, source.composition_traits, source.cameraTraits, source.camera_traits, source.lightingTraits, source.lighting_traits),
            continuityRules: normalizeHintCollection(source.continuityRules, source.continuity_rules),
            negativeConstraints: normalizeHintCollection(source.negativeConstraints, source.negative_constraints, source.avoidList, source.avoid_list),
            naiArtistTags: normalizePromptTagText(source.naiArtistPrompt, source.nai_artist_prompt, source.novelAiArtistPrompt, source.novelai_artist_prompt, source.naiArtistTags, source.nai_artist_tags),
            naiPositiveTags: normalizePromptTagText(source.naiPositivePrompt, source.nai_positive_prompt, source.novelAiPositivePrompt, source.novelai_positive_prompt, source.naiPositiveTags, source.nai_positive_tags),
            naiManualNegativeTags: normalizePromptTagText(source.naiNegativePrompt, source.nai_negative_prompt, source.novelAiNegativePrompt, source.novelai_negative_prompt, source.naiManualNegativeTags, source.nai_manual_negative_tags),
            naiPromptTags: normalizeHintCollection(source.naiPromptTags, source.nai_prompt_tags, source.novelAiPromptTags, source.novelai_prompt_tags),
            naiNegativeTags: normalizeHintCollection(source.naiNegativeTags, source.nai_negative_tags, source.novelAiNegativeTags, source.novelai_negative_tags),
            referenceAnchorSummary: normalizeHintCollection(source.referenceAnchorSummary, source.reference_anchor_summary),
            safetyFilteredNotes: normalizeHintCollection(source.safetyFilteredNotes, source.safety_filtered_notes)
        };
    }

    function joinPromptParts(parts) {
        const merged = [];
        const seen = new Set();
        (Array.isArray(parts) ? parts : []).forEach((part) => {
            const text = compactText(part, 260);
            const key = text.toLowerCase();
            if (!key || seen.has(key)) return;
            seen.add(key);
            merged.push(text);
        });
        return merged.join(', ');
    }

    function buildNegativePrompt(bundle) {
        const parts = [
            'lowres',
            'blurry',
            'bad anatomy',
            'extra fingers',
            'extra limbs',
            'duplicate person',
            'wrong hair color',
            'identity drift',
            'face inconsistency',
            'deformed hands',
            'cropped head',
            'text',
            'caption',
            'watermark',
            'logo',
            'collage',
            'split screen',
            'grid layout',
            'multiple panels',
            'comic panels',
            'manga panels',
            'speech bubble',
            'dialogue bubble'
        ];

        if (bundle.stylePreset === 'photo_real') {
            parts.push('cartoon', 'anime proportions', 'overpainted skin');
        }

        if (bundle.stylePreset === 'illustration' || bundle.stylePreset === 'story_insert') {
            parts.push('cheap 3d render', 'meme layout', 'ui screenshot');
        }

        if (bundle.negativeConstraints.length) {
            parts.push(...bundle.negativeConstraints);
        }
        if (bundle.naiManualNegativeTags.length) {
            parts.push(...bundle.naiManualNegativeTags);
        }
        if (bundle.naiNegativeTags.length) {
            parts.push(...bundle.naiNegativeTags);
        }

        return joinPromptParts(parts);
    }

    function buildPrimaryPrompt(bundle) {
        const style = getStylePresetDirectives(bundle.stylePreset);
        const paragraphs = [];

        if (bundle.promptPrefix) {
            paragraphs.push(bundle.promptPrefix);
        }

        if (bundle.imageIntent) {
            paragraphs.push(`Create one ${style.summary} of this exact moment: ${bundle.imageIntent}.`);
        }

        if (bundle.finalVisualBrief) {
            paragraphs.push(`Primary visual brief: ${bundle.finalVisualBrief}.`);
        }

        if (bundle.subjectCore) {
            paragraphs.push(`Main subject in frame: ${bundle.subjectCore}.`);
        }

        if (bundle.identityOverview) {
            paragraphs.push(`Identity overview to keep stable: ${bundle.identityOverview}.`);
        }

        if (bundle.persona) {
            paragraphs.push(`Keep the recurring character identity stable and visually consistent: ${bundle.persona}.`);
        }

        if (bundle.worldBook.length) {
            paragraphs.push(`World and setting continuity that must stay true: ${bundle.worldBook.join(' | ')}.`);
        }

        if (bundle.longTermMemory) {
            paragraphs.push(`Long-term continuity to respect: ${bundle.longTermMemory}.`);
        }

        if (bundle.hippocampusMemory) {
            paragraphs.push(`Additional recalled memory and subtle continuity cues: ${bundle.hippocampusMemory}.`);
        }

        if (bundle.recentDialogue) {
            paragraphs.push(`Recent dialogue context for the exact visual beat: ${bundle.recentDialogue}.`);
        }

        if (bundle.environmentNotes) {
            paragraphs.push(`Environment and scene notes: ${bundle.environmentNotes}.`);
        }

        if (bundle.sceneSummary) {
            paragraphs.push(`Scene summary: ${bundle.sceneSummary}.`);
        }

        if (bundle.sceneAnchors.length) {
            paragraphs.push(`Scene anchors that should remain stable: ${bundle.sceneAnchors.join(' | ')}.`);
        }

        if (bundle.referenceHints.length) {
            paragraphs.push(`Reference anchors for identity / objects / location continuity: ${bundle.referenceHints.join(' | ')}.`);
        }

        if (bundle.referenceAnchorSummary.length) {
            paragraphs.push(`Reference-derived continuity summary: ${bundle.referenceAnchorSummary.join(' | ')}.`);
        }

        if (bundle.appearanceTraits.length) {
            paragraphs.push(`Appearance traits to render: ${bundle.appearanceTraits.join(' | ')}.`);
        }

        if (bundle.wardrobeTraits.length) {
            paragraphs.push(`Wardrobe and accessories: ${bundle.wardrobeTraits.join(' | ')}.`);
        }

        if (bundle.expressionPose.length) {
            paragraphs.push(`Pose, action, and expression: ${bundle.expressionPose.join(' | ')}.`);
        }

        if (bundle.vibeTraits.length) {
            paragraphs.push(`Emotional tone and vibe: ${bundle.vibeTraits.join(' | ')}.`);
        }

        if (bundle.settingTraits.length) {
            paragraphs.push(`Setting and prop cues: ${bundle.settingTraits.join(' | ')}.`);
        }

        if (bundle.compositionTraits.length) {
            paragraphs.push(`Composition, camera, lighting, and framing cues: ${bundle.compositionTraits.join(' | ')}.`);
        }

        if (bundle.continuityRules.length) {
            paragraphs.push(`Hard continuity rules: ${bundle.continuityRules.join(' | ')}.`);
        }

        if (bundle.safetyFilteredNotes.length) {
            paragraphs.push(`Filtered non-visual or sensitive notes that should not be directly depicted but inform tone only: ${bundle.safetyFilteredNotes.join(' | ')}.`);
        }

        paragraphs.push(`Visual direction: ${style.directives.join(', ')}.`);
        paragraphs.push('Keep anatomy grounded, preserve facial identity, preserve hair color and core styling unless the context explicitly changes them, and output one coherent frame only.');
        paragraphs.push('No text overlay, no logo, no watermark, no multi-panel layout, no duplicate characters unless the scene explicitly requires it.');

        if (bundle.negativeConstraints.length) {
            paragraphs.push(`Explicitly avoid: ${bundle.negativeConstraints.join(' | ')}.`);
        }

        return paragraphs.filter(Boolean).join('\n');
    }

    function buildOpenAiPrompt(bundle) {
        const style = getStylePresetDirectives(bundle.stylePreset);
        const paragraphs = [];

        if (bundle.promptPrefix) {
            paragraphs.push(bundle.promptPrefix);
        }

        if (bundle.imageIntent || bundle.sceneSummary || bundle.finalVisualBrief) {
            paragraphs.push([
                'Generate one coherent image for this exact story beat.',
                bundle.imageIntent ? `Current requested moment: ${bundle.imageIntent}.` : '',
                bundle.sceneSummary ? `Scene summary: ${bundle.sceneSummary}.` : '',
                bundle.finalVisualBrief ? `Visual brief: ${bundle.finalVisualBrief}.` : ''
            ].filter(Boolean).join(' '));
        }

        const identityParts = [
            bundle.subjectCore ? `Main subject: ${bundle.subjectCore}.` : '',
            bundle.identityOverview ? `Keep this recurring identity stable: ${bundle.identityOverview}.` : '',
            bundle.appearanceTraits.length ? `Appearance anchors: ${bundle.appearanceTraits.join('; ')}.` : '',
            bundle.wardrobeTraits.length ? `Wardrobe and accessories: ${bundle.wardrobeTraits.join('; ')}.` : '',
            bundle.expressionPose.length ? `Pose and expression: ${bundle.expressionPose.join('; ')}.` : '',
            bundle.vibeTraits.length ? `Overall vibe: ${bundle.vibeTraits.join('; ')}.` : ''
        ].filter(Boolean);
        if (identityParts.length) {
            paragraphs.push(identityParts.join(' '));
        }

        const continuityParts = [
            bundle.referenceAnchorSummary.length ? `Reference-derived continuity anchors: ${bundle.referenceAnchorSummary.join('; ')}.` : '',
            bundle.referenceHints.length ? `Reference hints to respect: ${bundle.referenceHints.join('; ')}.` : '',
            bundle.continuityRules.length ? `Hard continuity rules: ${bundle.continuityRules.join('; ')}.` : '',
            bundle.worldBook.length ? `World continuity: ${bundle.worldBook.join('; ')}.` : '',
            bundle.sceneAnchors.length ? `Scene anchors: ${bundle.sceneAnchors.join('; ')}.` : ''
        ].filter(Boolean);
        if (continuityParts.length) {
            paragraphs.push(continuityParts.join(' '));
        }

        const sceneParts = [
            bundle.environmentNotes ? `Environment notes: ${bundle.environmentNotes}.` : '',
            bundle.settingTraits.length ? `Setting and props: ${bundle.settingTraits.join('; ')}.` : '',
            bundle.compositionTraits.length ? `Camera, framing, lighting, and composition: ${bundle.compositionTraits.join('; ')}.` : '',
            bundle.recentDialogue ? `Recent dialogue subtext for the frame: ${bundle.recentDialogue}.` : ''
        ].filter(Boolean);
        if (sceneParts.length) {
            paragraphs.push(sceneParts.join(' '));
        }

        paragraphs.push(`Visual direction: ${style.summary}; ${style.directives.join(', ')}.`);
        paragraphs.push('Prioritize facial identity, hairstyle, hair color, body proportions, and recurring style continuity over decorative variation. If details conflict, preserve the most stable identity anchors and attached references.');
        paragraphs.push('Keep the frame grounded and readable: one coherent shot, anatomically plausible hands and body, no duplicate subject unless explicitly requested, no text overlay, no logo, no watermark.');

        if (bundle.negativeConstraints.length || bundle.safetyFilteredNotes.length) {
            const avoidance = [];
            if (bundle.negativeConstraints.length) {
                avoidance.push(`Avoid: ${bundle.negativeConstraints.join('; ')}.`);
            }
            if (bundle.safetyFilteredNotes.length) {
                avoidance.push(`Sensitive or non-visual source notes should only influence tone indirectly: ${bundle.safetyFilteredNotes.join('; ')}.`);
            }
            paragraphs.push(avoidance.join(' '));
        }

        return paragraphs.filter(Boolean).join('\n\n');
    }

    const NOVELAI_POSITIVE_BLOCKED_RE = /\b(?:avoid|negative|bad|error|text overlay|caption|watermark|logo|collage|split screen|grid layout|multiple panels|comic panels|manga panels|speech bubble|dialogue bubble)\b/i;
    const NOVELAI_FIELD_LABEL_RE = /^\s*(?:visual\s*brief|primary\s*visual\s*brief|subject|main\s*subject|identity\s*overview|consistent\s*character\s*identity|appearance|wardrobe|pose\s*and\s*expression|vibe|environment|scene\s*summary|setting\s*cues|camera\s*and\s*lighting|scene\s*anchors|reference\s*anchors|reference\s*continuity|world\s*continuity|must\s*keep|hard\s*continuity\s*rules)\s*[:：-]\s*/i;

    function sanitizeNovelAiPositivePhrase(value) {
        let text = compactText(value, 260);
        if (!text) return '';

        text = text
            .replace(NOVELAI_FIELD_LABEL_RE, '')
            .replace(/screen\s+(?:says|reads|shows|displaying|with\s+text)\s+["“][^"”]+["”]/ig, 'screen')
            .replace(/(?:says|reads|showing\s+the\s+text|with\s+the\s+text)\s+["“][^"”]+["”]/ig, '')
            .replace(/(?:写着|显示着|显示|大字|字幕|文字|台词|对话气泡)[：“"][^”"]+[”"]?/g, '')
            .replace(/[“”"']([^“”"']{1,80})[“”"']/g, '')
            .replace(/\b(?:no|without)\s+(?:text|caption|watermark|logo|speech bubble|comic panels|manga panels|panels)\b/ig, '')
            .replace(/\s+/g, ' ')
            .replace(/^[,，;；:：.\s]+|[,，;；:：.\s]+$/g, '')
            .trim();

        if (!text) return '';
        if (NOVELAI_POSITIVE_BLOCKED_RE.test(text)) return '';
        if (/^(?:must keep|subject|appearance|visual brief)$/i.test(text)) return '';
        return text;
    }

    function normalizeNovelAiTagValue(value) {
        return sanitizeNovelAiPositivePhrase(value)
            .replace(/_/g, ' ')
            .replace(/\s*,\s*/g, ',')
            .trim();
    }

    function normalizeNovelAiManualTagValue(value) {
        const text = compactText(value, 260)
            .replace(/_/g, ' ')
            .replace(/\s*,\s*/g, ',')
            .trim();
        if (!text) return '';
        if (text.includes('::') || /[{}]/.test(text)) return text;
        return normalizeNovelAiTagValue(text);
    }

    function pushNovelAiPositiveParts(parts, values) {
        const rows = Array.isArray(values) ? values : [values];
        rows.forEach((row) => {
            String(row == null ? '' : row)
                .split(/[|;；\n]+/)
                .map(sanitizeNovelAiPositivePhrase)
                .filter(Boolean)
                .forEach((phrase) => parts.push(phrase));
        });
    }

    function buildNovelAiPrompt(bundle) {
        const style = getStylePresetDirectives(bundle.stylePreset);
        const parts = [];
        const manualArtistTags = bundle.naiArtistTags
            .map(normalizeNovelAiManualTagValue)
            .filter(Boolean);
        const manualPositiveTags = bundle.naiPositiveTags
            .map(normalizeNovelAiManualTagValue)
            .filter(Boolean);
        const directNaiTags = bundle.naiPromptTags
            .map(normalizeNovelAiTagValue)
            .filter(Boolean);
        const hasStructuredVisuals = Boolean(
            manualArtistTags.length
            || manualPositiveTags.length
            || directNaiTags.length
            || bundle.finalVisualBrief
            || bundle.subjectCore
            || bundle.identityOverview
            || bundle.sceneSummary
            || bundle.appearanceTraits.length
            || bundle.settingTraits.length
            || bundle.compositionTraits.length
        );

        pushNovelAiPositiveParts(parts, bundle.promptPrefix);
        manualArtistTags.forEach((tag) => parts.push(tag));
        manualPositiveTags.forEach((tag) => parts.push(tag));
        if (directNaiTags.length) {
            directNaiTags.forEach((tag) => parts.push(tag));
            parts.push('single coherent composition');
            parts.push('one full-frame scene');
            parts.push('focused single shot');
            parts.push('stable face and hair identity');
            return joinPromptParts(parts);
        }

        if (!hasStructuredVisuals) {
            pushNovelAiPositiveParts(parts, bundle.imageIntent);
        }
        pushNovelAiPositiveParts(parts, bundle.finalVisualBrief);
        pushNovelAiPositiveParts(parts, bundle.subjectCore);
        pushNovelAiPositiveParts(parts, bundle.identityOverview);
        pushNovelAiPositiveParts(parts, bundle.persona);
        pushNovelAiPositiveParts(parts, bundle.appearanceTraits);
        pushNovelAiPositiveParts(parts, bundle.wardrobeTraits);
        pushNovelAiPositiveParts(parts, bundle.expressionPose);
        pushNovelAiPositiveParts(parts, bundle.vibeTraits);
        pushNovelAiPositiveParts(parts, bundle.environmentNotes);
        pushNovelAiPositiveParts(parts, bundle.sceneSummary);
        pushNovelAiPositiveParts(parts, bundle.settingTraits);
        pushNovelAiPositiveParts(parts, bundle.compositionTraits);
        pushNovelAiPositiveParts(parts, bundle.sceneAnchors);
        pushNovelAiPositiveParts(parts, bundle.referenceHints);
        pushNovelAiPositiveParts(parts, bundle.referenceAnchorSummary);
        pushNovelAiPositiveParts(parts, bundle.worldBook);
        pushNovelAiPositiveParts(parts, bundle.continuityRules);
        pushNovelAiPositiveParts(parts, style.summary);
        pushNovelAiPositiveParts(parts, style.directives);
        parts.push('single coherent composition');
        parts.push('one full-frame scene');
        parts.push('focused single shot');
        parts.push('stable face and hair identity');
        parts.push('clean hands');
        parts.push('detailed background');

        return joinPromptParts(parts);
    }

    function compilePrompt(input) {
        const bundle = buildPromptBundle(input);
        const prompt = buildPrimaryPrompt(bundle);
        const negativePrompt = buildNegativePrompt(bundle);

        return {
            bundle,
            stylePreset: bundle.stylePreset,
            promptPrefix: bundle.promptPrefix,
            prompt,
            negativePrompt,
            providerPrompts: {
                openai: buildOpenAiPrompt(bundle),
                novelai: buildNovelAiPrompt(bundle)
            }
        };
    }

    window.IDICImagePromptCompiler = {
        buildPromptBundle,
        compilePrompt
    };
})();
