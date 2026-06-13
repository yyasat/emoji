/**
 * 初始化海马体依恋模式模块导出壳子。
 * 兼容浏览器全局和 CommonJS 两种加载方式。
 */
(function initHippocampusAttachmentModule(root) {
    const api = createHippocampusAttachment(root);

    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }

    if (root && typeof root === 'object') {
        root.HippocampusAttachment = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this));

/**
 * 创建海马体依恋模式工具。
 * 负责按依恋类型调整记忆检索结果权重。
 */
function createHippocampusAttachment(root) {
    const console = createHippoScopedConsole(root, '依恋');

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
     * 将任意值转成去首尾空白的字符串。
     */
    function toTrimmedString(value) {
        return String(value === undefined || value === null ? '' : value).trim();
    }

    /**
     * 将任意值转成有限数字，不合法时回退默认值。
     */
    function toFiniteNumber(value, fallback) {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : fallback;
    }

    /**
     * 规范化 metadata，保证一定返回普通对象。
     */
    function normalizeMetadata(value) {
        return value && typeof value === 'object' && !Array.isArray(value)
            ? Object.assign({}, value)
            : {};
    }

    function clampNumber(value, min, max, fallback) {
        const numeric = toFiniteNumber(value, fallback);
        if (!Number.isFinite(numeric)) return fallback;
        return Math.min(max, Math.max(min, numeric));
    }

    function mergeUniqueStrings(primary, secondary, maxCount) {
        const result = [];
        const seen = new Set();
        const limit = Number.isFinite(maxCount) ? Math.max(0, Math.floor(maxCount)) : Number.POSITIVE_INFINITY;

        [primary, secondary].forEach(function consume(list) {
            const source = Array.isArray(list) ? list : [];
            for (let i = 0; i < source.length; i += 1) {
                const value = toTrimmedString(source[i]);
                if (!value || seen.has(value)) continue;
                seen.add(value);
                result.push(value);
                if (result.length >= limit) return;
            }
        });

        return result;
    }

    /**
     * 规范化依恋类型，非法值回退为 secure。
     */
    function normalizeAttachmentStyle(style) {
        const normalized = toTrimmedString(style).toLowerCase();
        if (normalized === 'anxious' || normalized === 'avoidant' || normalized === 'disorganized') {
            return normalized;
        }
        return 'secure';
    }

    /**
     * 获取不同依恋类型对应的默认反刍倾向值。
     */
    function getDefaultRuminationForAttachment(attachmentStyle) {
        const style = normalizeAttachmentStyle(attachmentStyle);
        const mapping = {
            secure: 0.2,
            anxious: 0.5,
            avoidant: 0.1,
            disorganized: 0.6
        };
        const value = mapping[style] !== undefined ? mapping[style] : mapping.secure;
        console.log(`[海马体][依恋] ✅ 默认反刍倾向 -> ${style}: ${value}`);
        return value;
    }

    /**
     * 为每条记忆补充 adjustedScore 字段，便于后续统一重排。
     */
    function addAdjustedScore(memory, score) {
        return Object.assign({}, memory, {
            adjustedScore: score
        });
    }

    /**
     * 判断条目是否为事件候选。
     */
    function isEventCluster(memory) {
        const source = memory && typeof memory === 'object' ? memory : {};
        return !!source.is_event_cluster
            || toTrimmedString(source.source_type) === 'event_cluster'
            || !!toTrimmedString(source.event_id);
    }

    /**
     * 获取事件深度附加权重。
     */
    function getEventDepthBonus(memory) {
        const depth = toTrimmedString(memory && memory.event_depth).toLowerCase();
        if (depth === 'high') return 0.22;
        if (depth === 'medium') return 0.12;
        return 0.05;
    }

    function getEventSignalTags(memory) {
        const source = memory && typeof memory === 'object' ? memory : {};
        const metadata = normalizeMetadata(source.metadata);
        return mergeUniqueStrings(
            Array.isArray(source.event_signal_tags) ? source.event_signal_tags : [],
            Array.isArray(metadata.event_signal_tags) ? metadata.event_signal_tags : [],
            12
        );
    }

    function getEventSignalProfile(memory) {
        const source = memory && typeof memory === 'object' ? memory : {};
        const metadata = normalizeMetadata(source.metadata);
        const profile = source.event_signal_profile && typeof source.event_signal_profile === 'object'
            ? source.event_signal_profile
            : (metadata.event_signal_profile && typeof metadata.event_signal_profile === 'object'
                ? metadata.event_signal_profile
                : {});
        return {
            salienceScore: clampNumber(
                source.event_salience_score !== undefined ? source.event_salience_score : profile.salienceScore,
                0,
                1,
                0
            ),
            emotionScore: clampNumber(profile.emotionScore, 0, 1, 0),
            significanceScore: clampNumber(profile.significanceScore, 0, 1, 0),
            contrastScore: clampNumber(profile.contrastScore, 0, 1, 0),
            detailScore: clampNumber(profile.detailScore, 0, 1, 0),
            recurrenceScore: clampNumber(profile.recurrenceScore, 0, 1, 0),
            conflictScore: clampNumber(profile.conflictScore, 0, 1, 0),
            attachmentScore: clampNumber(profile.attachmentScore, 0, 1, 0),
            unresolvedScore: clampNumber(profile.unresolvedScore, 0, 1, 0),
            layerScore: clampNumber(profile.layerScore, 0, 1, 0),
            positivePeak: clampNumber(profile.positivePeak, 0, 1, 0),
            negativePeak: clampNumber(profile.negativePeak, 0, 1, 0),
            isUnresolved: !!profile.isUnresolved,
            depth: toTrimmedString(profile.depth).toLowerCase()
        };
    }

    function hasSignalTag(memory, tag) {
        const safeTag = toTrimmedString(tag);
        if (!safeTag) return false;
        return getEventSignalTags(memory).some(function matchTag(value) {
            return value === safeTag;
        });
    }

    function buildAttachmentBias(memory, style) {
        const source = memory && typeof memory === 'object' ? memory : {};
        const isEvent = isEventCluster(source);
        const profile = getEventSignalProfile(source);
        const tags = getEventSignalTags(source);
        const unresolved = !!(source && source.event_is_unresolved) || profile.isUnresolved;
        const flashbulb = !!(source && source.event_is_flashbulb);
        const arousal = clampNumber(source && source.arousal, 0, 1, 0);
        const valence = clampNumber(source && source.valence, -1, 1, 0);
        const layer = toTrimmedString(source && (source.memory_layer || source.event_memory_layer)).toLowerCase();
        const depth = toTrimmedString(source && source.event_depth).toLowerCase() || profile.depth;

        let delta = 0;
        const reasons = [];

        if (isEvent) {
            delta += profile.salienceScore * 0.16;
            if (flashbulb) delta += 0.08;
            if (unresolved) delta += 0.10;
        }

        if (style === 'anxious') {
            if (unresolved) {
                delta += 0.28;
                reasons.push('open_loop');
            }
            if (flashbulb) {
                delta += 0.12;
                reasons.push('flashbulb');
            }
            delta += profile.emotionScore * 0.18;
            delta += profile.attachmentScore * 0.16;
            delta += profile.conflictScore * 0.12;
            delta += profile.recurrenceScore * 0.14;
            delta += profile.contrastScore * 0.12;
            if (hasSignalTag(source, 'painful')) {
                delta += 0.18;
                reasons.push('painful');
            }
            if (hasSignalTag(source, 'high_attachment') || profile.attachmentScore >= 0.64) {
                delta += 0.10;
                reasons.push('high_attachment');
            }
            if (hasSignalTag(source, 'high_conflict') || profile.conflictScore >= 0.62) {
                delta += 0.10;
                reasons.push('high_conflict');
            }
            if (hasSignalTag(source, 'emotionally_intense')) {
                delta += 0.12;
                reasons.push('emotionally_intense');
            }
            if (hasSignalTag(source, 'recurrent')) {
                delta += 0.10;
                reasons.push('recurrent');
            }
            if (hasSignalTag(source, 'warm') && !unresolved) {
                delta -= 0.08;
                reasons.push('warm_downweighted');
            }
        } else if (style === 'avoidant') {
            delta -= profile.emotionScore * 0.18;
            delta -= profile.contrastScore * 0.14;
            delta -= profile.attachmentScore * 0.12;
            delta -= profile.conflictScore * 0.08;
            if (unresolved) {
                delta -= 0.24;
                reasons.push('avoid_open_loop');
            }
            if (flashbulb) {
                delta -= 0.12;
                reasons.push('avoid_flashbulb');
            }
            if (hasSignalTag(source, 'high_attachment') || profile.attachmentScore >= 0.64) {
                delta -= 0.08;
                reasons.push('avoid_attachment_pull');
            }
            if (arousal >= 0.72) {
                delta -= 0.10;
                reasons.push('avoid_high_arousal');
            }
            if (layer === 'cortex') {
                delta += 0.18;
                reasons.push('cortex');
            }
            if (!unresolved && (depth === 'low' || depth === 'medium')) {
                delta += 0.06;
                reasons.push('contained_event');
            }
            if (hasSignalTag(source, 'warm') && !hasSignalTag(source, 'emotionally_intense')) {
                delta += 0.05;
                reasons.push('warm_safe');
            }
        } else if (style === 'disorganized') {
            delta += profile.emotionScore * 0.16;
            delta += profile.contrastScore * 0.22;
            delta += profile.conflictScore * 0.16;
            delta += profile.attachmentScore * 0.12;
            delta += profile.recurrenceScore * 0.08;
            if (unresolved) {
                delta += 0.18;
                reasons.push('open_loop');
            }
            if (flashbulb) {
                delta += 0.14;
                reasons.push('flashbulb');
            }
            if (hasSignalTag(source, 'mixed_emotions')) {
                delta += 0.12;
                reasons.push('mixed_emotions');
            }
            if (hasSignalTag(source, 'high_attachment') || profile.attachmentScore >= 0.64) {
                delta += 0.08;
                reasons.push('high_attachment');
            }
            if (hasSignalTag(source, 'high_conflict') || profile.conflictScore >= 0.62) {
                delta += 0.08;
                reasons.push('high_conflict');
            }
            if (hasSignalTag(source, 'warm') && valence > 0.2) {
                delta += 0.06;
                reasons.push('warm_pull');
            }
            if (hasSignalTag(source, 'painful') || valence < -0.25) {
                delta += 0.10;
                reasons.push('pain_pull');
            }
        }

        return {
            delta: delta,
            reasons: mergeUniqueStrings(reasons, tags, 10),
            signalTags: tags
        };
    }

    /**
     * 按依恋类型重排事件内细节，避免只改“事件外层顺序”。
     */
    function reorderEventDetailsByAttachment(details, style) {
        const source = Array.isArray(details) ? details.filter(Boolean) : [];
        if (source.length <= 1) return source;

        const rows = source.slice();
        if (style === 'anxious') {
            return rows.sort(function sortAnxious(left, right) {
                const leftValence = toFiniteNumber(left && left.valence, 0);
                const rightValence = toFiniteNumber(right && right.valence, 0);
                if (leftValence !== rightValence) return leftValence - rightValence;
                return toFiniteNumber(right && right.importance, 0) - toFiniteNumber(left && left.importance, 0);
            });
        }

        if (style === 'avoidant') {
            return rows.sort(function sortAvoidant(left, right) {
                const leftArousal = toFiniteNumber(left && left.arousal, 0);
                const rightArousal = toFiniteNumber(right && right.arousal, 0);
                if (leftArousal !== rightArousal) return leftArousal - rightArousal;
                return toFiniteNumber(right && right.importance, 0) - toFiniteNumber(left && left.importance, 0);
            });
        }

        if (style === 'disorganized') {
            const positives = rows.filter(function keepPositive(item) {
                return toFiniteNumber(item && item.valence, 0) >= 0;
            });
            const negatives = rows.filter(function keepNegative(item) {
                return toFiniteNumber(item && item.valence, 0) < 0;
            });
            const mixed = [];
            let preferPositive = true;
            while (positives.length > 0 || negatives.length > 0) {
                if (preferPositive && positives.length > 0) {
                    mixed.push(positives.shift());
                } else if (!preferPositive && negatives.length > 0) {
                    mixed.push(negatives.shift());
                } else if (positives.length > 0) {
                    mixed.push(positives.shift());
                } else if (negatives.length > 0) {
                    mixed.push(negatives.shift());
                }
                preferPositive = !preferPositive;
            }
            return mixed;
        }

        return rows.sort(function sortSecure(left, right) {
            return toFiniteNumber(right && right.importance, 0) - toFiniteNumber(left && left.importance, 0);
        });
    }

    /**
     * 将记忆列表按“正负交替”重排，用于混乱型依恋的波动回忆模式。
     */
    function buildDisorganizedOrdering(memories) {
        const positive = [];
        const negative = [];
        const neutral = [];

        memories.forEach(function splitByValence(memory) {
            const valence = toFiniteNumber(memory && memory.valence, 0);
            if (valence > 0.1) {
                positive.push(memory);
            } else if (valence < -0.1) {
                negative.push(memory);
            } else {
                neutral.push(memory);
            }
        });

        const ordered = [];
        let preferPositive = true;
        while (positive.length > 0 || negative.length > 0) {
            if (preferPositive && positive.length > 0) {
                ordered.push(positive.shift());
            } else if (!preferPositive && negative.length > 0) {
                ordered.push(negative.shift());
            } else if (positive.length > 0) {
                ordered.push(positive.shift());
            } else if (negative.length > 0) {
                ordered.push(negative.shift());
            }
            preferPositive = !preferPositive;
        }

        return ordered.concat(neutral);
    }

    function summarizeAttachmentBias(rows, attachmentStyle) {
        const source = Array.isArray(rows) ? rows.filter(Boolean) : [];
        const style = normalizeAttachmentStyle(attachmentStyle);
        const reasonCounts = new Map();
        let biasedEventCount = 0;
        let positiveBiasCount = 0;
        let negativeBiasCount = 0;

        source.forEach(function consumeRow(row) {
            const delta = toFiniteNumber(row && row.attachment_bias_delta, 0);
            const reasons = mergeUniqueStrings(
                Array.isArray(row && row.attachment_bias_reasons) ? row.attachment_bias_reasons : [],
                [],
                8
            );
            if (isEventCluster(row) && Math.abs(delta) > 0.001) {
                biasedEventCount += 1;
            }
            if (delta > 0.001) positiveBiasCount += 1;
            if (delta < -0.001) negativeBiasCount += 1;
            reasons.forEach(function countReason(reason) {
                reasonCounts.set(reason, (reasonCounts.get(reason) || 0) + 1);
            });
        });

        const dominantReasons = Array.from(reasonCounts.entries())
            .sort(function sortReasons(left, right) {
                return right[1] - left[1];
            })
            .slice(0, 5)
            .map(function mapReason(entry) {
                return entry[0];
            });

        return {
            style: style,
            biasedEventCount: biasedEventCount,
            boostedCount: positiveBiasCount,
            suppressedCount: negativeBiasCount,
            dominantReasons: dominantReasons
        };
    }

    /**
     * 按依恋类型调整召回记忆分数并重排结果。
     */
    function adjustForAttachment(memories, attachmentStyle) {
        const source = Array.isArray(memories) ? memories : [];
        if (source.length === 0) return [];

        const style = normalizeAttachmentStyle(attachmentStyle);
        let eventBiasApplied = 0;
        let signalDrivenRows = 0;
        const baseRows = source.map(function mapMemory(memory) {
            const baseScore = toFiniteNumber(
                memory && (memory.adjustedScore !== undefined ? memory.adjustedScore : (memory.score !== undefined ? memory.score : memory.final_score)),
                0
            );
            const eventBonus = isEventCluster(memory)
                ? (
                    getEventDepthBonus(memory)
                    + ((memory && memory.event_is_unresolved) ? 0.16 : 0)
                    + (clampNumber(memory && memory.event_salience_score, 0, 1, 0) * 0.18)
                    + ((memory && memory.event_is_flashbulb) ? 0.12 : 0)
                )
                : 0;
            const attachmentBias = buildAttachmentBias(memory, style);
            if (isEventCluster(memory) && Math.abs(attachmentBias.delta) > 0.001) {
                eventBiasApplied += 1;
            }
            if (attachmentBias.signalTags.length > 0) {
                signalDrivenRows += 1;
            }
            const withEventScore = baseScore + eventBonus + attachmentBias.delta;
            const detailSource = Array.isArray(memory && memory.event_detail_memories) ? memory.event_detail_memories : null;
            const details = detailSource ? reorderEventDetailsByAttachment(detailSource, style) : null;
            return addAdjustedScore(
                Object.assign(
                    {},
                    details ? Object.assign({}, memory, { event_detail_memories: details }) : memory,
                    {
                        attachment_bias_delta: attachmentBias.delta,
                        attachment_bias_reasons: attachmentBias.reasons,
                        attachment_signal_tags: attachmentBias.signalTags
                    }
                ),
                withEventScore
            );
        });

        if (style === 'secure') {
            console.log(`[海马体][依恋] ✅ 类型=secure -> 事件偏置${eventBiasApplied}条, 带信号标签${signalDrivenRows}条`);
            return baseRows.sort(function sortSecure(a, b) {
                return toFiniteNumber(b.adjustedScore, 0) - toFiniteNumber(a.adjustedScore, 0);
            });
        }

        if (style === 'anxious') {
            let negativeBoosted = 0;
            let positiveDownWeighted = 0;
            const adjusted = baseRows.map(function mapAnxious(memory) {
                const valence = toFiniteNumber(memory && memory.valence, 0);
                const isEvent = isEventCluster(memory);
                const unresolvedBonus = isEvent && memory && memory.event_is_unresolved ? 1.25 : 1;
                const multiplier = (valence < 0 ? 1.18 : 0.92) * unresolvedBonus;
                if (valence < 0) {
                    negativeBoosted += 1;
                } else if (valence > 0) {
                    positiveDownWeighted += 1;
                }
                return addAdjustedScore(memory, toFiniteNumber(memory.adjustedScore, 0) * multiplier);
            }).sort(function sortAnxious(a, b) {
                return toFiniteNumber(b.adjustedScore, 0) - toFiniteNumber(a.adjustedScore, 0);
            });
            console.log(`[海马体][依恋] ✅ 类型=anxious -> 负面记忆加权${negativeBoosted}条, 正面记忆降权${positiveDownWeighted}条, 事件偏置${eventBiasApplied}条`);
            return adjusted;
        }

        if (style === 'avoidant') {
            let highArousalSuppressed = 0;
            let cortexBoosted = 0;
            const adjusted = baseRows.map(function mapAvoidant(memory) {
                const arousal = toFiniteNumber(memory && memory.arousal, 0);
                const layer = toTrimmedString(memory && memory.memory_layer).toLowerCase();
                const depth = toTrimmedString(memory && memory.event_depth).toLowerCase();
                const arousalMultiplier = arousal > 0.7 ? 0.74 : 1.0;
                const layerMultiplier = layer === 'cortex' ? 1.3 : 1.0;
                const depthMultiplier = depth === 'high' ? 0.88 : 1.0;
                if (arousal > 0.7) highArousalSuppressed += 1;
                if (layer === 'cortex') cortexBoosted += 1;
                return addAdjustedScore(
                    memory,
                    toFiniteNumber(memory.adjustedScore, 0) * arousalMultiplier * layerMultiplier * depthMultiplier
                );
            }).sort(function sortAvoidant(a, b) {
                return toFiniteNumber(b.adjustedScore, 0) - toFiniteNumber(a.adjustedScore, 0);
            });
            console.log(`[海马体][依恋] ✅ 类型=avoidant -> 高唤醒降权${highArousalSuppressed}条, cortex加权${cortexBoosted}条, 事件偏置${eventBiasApplied}条`);
            return adjusted;
        }

        const disorganizedAdjusted = baseRows.map(function mapDisorganized(memory) {
            return addAdjustedScore(memory, toFiniteNumber(memory.adjustedScore, 0));
        });
        const sorted = disorganizedAdjusted.sort(function sortDisorganized(a, b) {
            return toFiniteNumber(b.adjustedScore, 0) - toFiniteNumber(a.adjustedScore, 0);
        });
        const alternated = buildDisorganizedOrdering(sorted);
        console.log(`[海马体][依恋] ✅ 类型=disorganized -> 交替重排 ${alternated.length} 条, 事件偏置${eventBiasApplied}条`);
        return alternated;
    }

    /**
     * 对“场景记忆包”做统一依恋型重排，便于老功能接入时直接复用。
     */
    function adjustScenarioPacketForAttachment(packet, attachmentStyle) {
        const source = packet && typeof packet === 'object' ? packet : {};
        const reorderedRows = adjustForAttachment(
            Array.isArray(source.recallRows) ? source.recallRows : [],
            attachmentStyle
        );
        const eventRows = [];
        const fragmentRows = [];
        const unresolvedEventRows = [];
        const triggeredRows = [];
        const flashbulbRows = [];

        reorderedRows.forEach(function splitRow(row) {
            if (isEventCluster(row)) {
                eventRows.push(row);
                if (row && row.event_is_unresolved) {
                    unresolvedEventRows.push(row);
                }
            } else {
                fragmentRows.push(row);
            }
            if (row && (row._hitByKeyword || row._hitByVector || row._hitBySensory || row.recall_hit_mode)) {
                triggeredRows.push(row);
            }
            if (row && (row.event_is_flashbulb || row.is_flashbulb)) {
                flashbulbRows.push(row);
            }
        });

        return Object.assign({}, source, {
            recallRows: reorderedRows,
            eventRows: eventRows,
            fragmentRows: fragmentRows,
            unresolvedEventRows: unresolvedEventRows,
            triggeredRows: triggeredRows,
            flashbulbRows: flashbulbRows,
            attachmentStyleApplied: normalizeAttachmentStyle(attachmentStyle),
            attachmentBiasSummary: summarizeAttachmentBias(reorderedRows, attachmentStyle)
        });
    }

    return {
        adjustForAttachment: adjustForAttachment,
        adjustScenarioPacketForAttachment: adjustScenarioPacketForAttachment,
        getDefaultRuminationForAttachment: getDefaultRuminationForAttachment,
        summarizeAttachmentBias: summarizeAttachmentBias
    };
}
