/**
 * 初始化海马体日志模块导出壳子。
 * 兼容浏览器全局和 CommonJS 两种加载方式。
 */
(function initHippocampusLoggerModule(root) {
    const api = createHippocampusLogger(root);

    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }

    if (root && typeof root === 'object') {
        root.HippocampusLogger = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this));

/**
 * 创建海马体日志工具。
 * 提供统一前缀、分级输出、计时与开关控制能力。
 */
function createHippocampusLogger(root) {
    const HIPPO_LOG_PREFIX = '[海马体]';
    let logEnabled = true;

    /**
     * 将任意值转换为去首尾空白的字符串。
     */
    function toTrimmedString(value) {
        return String(value === undefined || value === null ? '' : value).trim();
    }

    /**
     * 将任意对象安全序列化，避免循环引用导致日志崩溃。
     */
    function safeStringify(value) {
        try {
            if (value === undefined) return '';
            return JSON.stringify(value);
        } catch (_) {
            return '"[unserializable]"';
        }
    }

    /**
     * 生成统一日志文本。
     */
    function buildMessage(levelMark, moduleName, step, detail, data) {
        const safeModule = toTrimmedString(moduleName) || '通用';
        const safeStep = toTrimmedString(step) || '未命名步骤';
        const safeDetail = toTrimmedString(detail);
        const hasData = data !== undefined;
        const dataText = hasData ? safeStringify(data) : '';

        return `${HIPPO_LOG_PREFIX}[${safeModule}] ${levelMark} ${safeStep}`
            + (safeDetail ? ` → ${safeDetail}` : '')
            + (hasData ? ` | data=${dataText}` : '');
    }

    /**
     * 输出普通级别日志。
     */
    function hippoLog(moduleName, step, detail, data) {
        if (!logEnabled) return;
        console.log(buildMessage('✅', moduleName, step, detail, data));
    }

    /**
     * 输出警告级别日志。
     */
    function hippoWarn(moduleName, step, detail, data) {
        if (!logEnabled) return;
        console.warn(buildMessage('⚠️', moduleName, step, detail, data));
    }

    /**
     * 输出错误级别日志。
     */
    function hippoError(moduleName, step, error, data) {
        if (!logEnabled) return;
        const errorDetail = error && typeof error === 'object'
            ? (error.message || safeStringify(error))
            : toTrimmedString(error);
        console.error(buildMessage('❌', moduleName, step, errorDetail, data));
    }

    /**
     * 生成统一计时标签，避免不同模块标签冲突。
     */
    function buildTimeLabel(moduleName, label) {
        const safeModule = toTrimmedString(moduleName) || '通用';
        const safeLabel = toTrimmedString(label) || '计时';
        return `${HIPPO_LOG_PREFIX}[${safeModule}] ${safeLabel}`;
    }

    /**
     * 开始计时。
     */
    function hippoTime(moduleName, label) {
        if (!logEnabled) return;
        console.time(buildTimeLabel(moduleName, label));
    }

    /**
     * 结束计时。
     */
    function hippoTimeEnd(moduleName, label) {
        if (!logEnabled) return;
        console.timeEnd(buildTimeLabel(moduleName, label));
    }

    /**
     * 设置海马体日志总开关。
     */
    function setHippoLogEnabled(enabled) {
        logEnabled = !!enabled;
    }

    /**
     * 读取当前日志总开关状态。
     */
    function isHippoLogEnabled() {
        return logEnabled;
    }

    return {
        hippoLog: hippoLog,
        hippoWarn: hippoWarn,
        hippoError: hippoError,
        hippoTime: hippoTime,
        hippoTimeEnd: hippoTimeEnd,
        setHippoLogEnabled: setHippoLogEnabled,
        isHippoLogEnabled: isHippoLogEnabled
    };
}
