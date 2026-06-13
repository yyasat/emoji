(function () {
    'use strict';

    const state = {
        initialized: false,
        currentObjectUrl: '',
        currentItem: null
    };

    function $(id) {
        return document.getElementById(id);
    }

    function showMessage(message, type) {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type || 'info');
            return;
        }
        window.alert(message);
    }

    function revokeCurrentObjectUrl() {
        if (!state.currentObjectUrl) return;
        URL.revokeObjectURL(state.currentObjectUrl);
        state.currentObjectUrl = '';
    }

    function getExtensionFromMimeType(mimeType) {
        const normalized = String(mimeType || '').toLowerCase();
        if (normalized.includes('png')) return 'png';
        if (normalized.includes('webp')) return 'webp';
        if (normalized.includes('gif')) return 'gif';
        if (normalized.includes('bmp')) return 'bmp';
        return 'jpg';
    }

    function normalizeFileName(baseName, mimeType) {
        const cleanBase = String(baseName || 'idic-image')
            .trim()
            .replace(/[\\/:*?"<>|]+/g, '-')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '') || 'idic-image';
        const ext = getExtensionFromMimeType(mimeType);
        return cleanBase.toLowerCase().endsWith(`.${ext}`) ? cleanBase : `${cleanBase}.${ext}`;
    }

    function closePreview() {
        const modal = $('image-preview-modal');
        const img = $('image-preview-image');
        if (modal) modal.classList.add('hidden');
        if (img) img.src = '';
        revokeCurrentObjectUrl();
        state.currentItem = null;
    }

    function triggerDownload(blob, fileName) {
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 300);
    }

    function loadImageFromBlob(blob) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const objectUrl = URL.createObjectURL(blob);
            img.onload = () => {
                URL.revokeObjectURL(objectUrl);
                resolve(img);
            };
            img.onerror = () => {
                URL.revokeObjectURL(objectUrl);
                reject(new Error('图片加载失败'));
            };
            img.src = objectUrl;
        });
    }

    function drawRoundedRect(ctx, x, y, width, height, radius) {
        const safeRadius = Math.max(0, Math.min(radius, width / 2, height / 2));
        if (typeof ctx.roundRect === 'function') {
            ctx.beginPath();
            ctx.roundRect(x, y, width, height, safeRadius);
            return;
        }
        ctx.beginPath();
        ctx.moveTo(x + safeRadius, y);
        ctx.lineTo(x + width - safeRadius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
        ctx.lineTo(x + width, y + height - safeRadius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
        ctx.lineTo(x + safeRadius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
        ctx.lineTo(x, y + safeRadius);
        ctx.quadraticCurveTo(x, y, x + safeRadius, y);
    }

    async function exportBlobWithWatermark(blob, mimeType, watermarkText) {
        const image = await loadImageFromBlob(blob);
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth || image.width;
        canvas.height = image.naturalHeight || image.height;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
            throw new Error('无法生成导出画布');
        }

        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

        const fontSize = Math.max(18, Math.round(Math.min(canvas.width, canvas.height) * 0.035));
        const paddingX = Math.round(fontSize * 0.8);
        const paddingY = Math.round(fontSize * 0.55);
        const text = String(watermarkText || '图片由AI生成').trim() || '图片由AI生成';

        ctx.font = `600 ${fontSize}px sans-serif`;
        ctx.textBaseline = 'middle';
        const textWidth = ctx.measureText(text).width;
        const badgeWidth = textWidth + paddingX * 2;
        const badgeHeight = fontSize + paddingY * 2;
        const inset = Math.round(fontSize * 0.8);
        const x = canvas.width - badgeWidth - inset;
        const y = canvas.height - badgeHeight - inset;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        drawRoundedRect(ctx, x, y, badgeWidth, badgeHeight, Math.round(fontSize * 0.45));
        ctx.fill();

        ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
        ctx.fillText(text, x + paddingX, y + badgeHeight / 2);

        return new Promise((resolve, reject) => {
            canvas.toBlob((outputBlob) => {
                if (!outputBlob) {
                    reject(new Error('导出失败'));
                    return;
                }
                resolve(outputBlob);
            }, mimeType || 'image/png');
        });
    }

    async function saveCurrentImage() {
        if (!state.currentItem || !state.currentItem.blob) {
            showMessage('当前没有可保存的图片', 'error');
            return;
        }

        const item = state.currentItem;
        const targetName = normalizeFileName(item.fileName, item.mimeType || item.blob.type);

        try {
            if (item.shouldWatermark) {
                const outputBlob = await exportBlobWithWatermark(
                    item.blob,
                    item.mimeType || item.blob.type || 'image/png',
                    item.watermarkText
                );
                triggerDownload(outputBlob, targetName);
            } else {
                triggerDownload(item.blob, targetName);
            }
            showMessage('图片已开始保存', 'success');
        } catch (error) {
            console.error('[IDIC] 图片导出失败', error);
            showMessage(error.message || '图片导出失败', 'error');
        }
    }

    function ensureInit() {
        if (state.initialized) return;

        const modal = $('image-preview-modal');
        const closeBtn = $('close-image-preview-button');
        const saveBtn = $('save-image-preview-button');

        if (!modal || !closeBtn || !saveBtn) return;

        closeBtn.addEventListener('click', closePreview);
        saveBtn.addEventListener('click', saveCurrentImage);
        modal.addEventListener('click', (event) => {
            if (event.target === modal) {
                closePreview();
            }
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && !modal.classList.contains('hidden')) {
                closePreview();
            }
        });

        state.initialized = true;
    }

    function openPreview(options) {
        ensureInit();

        const modal = $('image-preview-modal');
        const titleEl = $('image-preview-title');
        const metaEl = $('image-preview-meta');
        const imgEl = $('image-preview-image');

        if (!modal || !titleEl || !metaEl || !imgEl) {
            showMessage('图片预览组件尚未准备好', 'error');
            return;
        }

        revokeCurrentObjectUrl();

        const blob = options && options.blob ? options.blob : null;
        const src = String((options && options.src) || '').trim();
        const objectUrl = blob ? URL.createObjectURL(blob) : src;

        if (!objectUrl) {
            showMessage('当前图片无法预览', 'error');
            return;
        }

        state.currentObjectUrl = blob ? objectUrl : '';
        state.currentItem = {
            blob,
            fileName: options && options.fileName ? options.fileName : 'idic-image',
            mimeType: options && options.mimeType ? options.mimeType : (blob ? blob.type : ''),
            shouldWatermark: Boolean(options && options.shouldWatermark),
            watermarkText: options && options.watermarkText ? options.watermarkText : '图片由AI生成'
        };

        titleEl.textContent = String((options && options.title) || '图片预览').trim() || '图片预览';
        metaEl.textContent = String((options && options.meta) || '').trim();
        imgEl.src = objectUrl;
        imgEl.alt = titleEl.textContent;
        modal.classList.remove('hidden');
    }

    window.IDICImagePreviewExport = {
        closePreview,
        openPreview
    };
})();
