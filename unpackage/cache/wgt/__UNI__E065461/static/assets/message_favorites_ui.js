(function () {
    'use strict';

    const FALLBACK_VIEW_HTML = `
<div id="message-favorites-view" class="view hidden">
    <div class="header">
        <button id="back-from-message-favorites" class="header-button back-button">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
        </button>
        <span class="header-title">收藏</span>
    </div>
    <div class="music-container message-favorites-body">
        <div class="message-favorites-shell">
            <div id="message-favorites-category-tabs" class="message-favorites-tabs"></div>
            <div class="message-favorites-toolbar">
                <div id="message-favorites-group-tabs" class="message-favorites-groups"></div>
                <button id="message-favorites-create-group-ui" class="message-favorites-create-group" type="button">+ 新建分组</button>
            </div>
            <div class="message-favorites-filters">
                <input id="message-favorites-date-filter" type="text" placeholder="按日期筛选" onfocus="this.type='date'" onblur="if(!this.value) this.type='text'">
                <select id="message-favorites-contact-filter"></select>
                <input id="message-favorites-keyword-filter" type="text" placeholder="搜索关键词...">
                <select id="message-favorites-sort">
                    <option value="newest">从新到旧</option>
                    <option value="oldest">从旧到新</option>
                </select>
            </div>
            <div id="message-favorites-list" class="message-favorites-list"></div>
            <div id="message-favorites-pagination" class="message-favorites-pagination"></div>
        </div>
    </div>
</div>`;

    function installViewSync(mountId) {
        const mount = document.getElementById(mountId || 'message-favorites-view-mount');
        if (!mount || document.getElementById('message-favorites-view')) return;

        let html = FALLBACK_VIEW_HTML;
        try {
            const request = new XMLHttpRequest();
            request.open('GET', 'message_favorites.html?v=20260603-split', false);
            request.send(null);
            if (request.status >= 200 && request.status < 300 && request.responseText.trim()) {
                html = request.responseText;
            }
        } catch (error) {
            console.warn('[收藏页] 外部 HTML 加载失败，使用内置兜底模板。', error);
        }

        mount.outerHTML = html;
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function renderCategoryTabs(categories, activeCategory) {
        return (categories || []).map((category) => `
            <button class="message-favorites-chip ${activeCategory === category.key ? 'is-active' : ''}" data-favorite-category="${escapeHtml(category.key)}">${escapeHtml(category.label)}</button>
        `).join('');
    }

    function renderGroupTabs(groups, activeGroup, constants) {
        const allKey = constants && constants.allKey || '__all__';
        const lovedKey = constants && constants.lovedKey || '__loved__';
        return [
            `<button class="message-favorites-chip ${activeGroup === allKey ? 'is-active' : ''}" data-favorite-group="${allKey}">全部</button>`,
            `<button class="message-favorites-chip ${activeGroup === lovedKey ? 'is-active' : ''}" data-favorite-group="${lovedKey}">最爱</button>`,
            ...(groups || []).map((group) => `
                <div class="message-favorites-group-chip-wrapper">
                    <button class="message-favorites-chip ${activeGroup === group.id ? 'is-active' : ''}" data-favorite-group="${escapeHtml(group.id)}">${escapeHtml(group.name)}</button>
                    <button class="mf-delete-group-btn" data-group-id="${escapeHtml(group.id)}" title="删除分组">&times;</button>
                </div>
            `)
        ].join('');
    }

    function renderContactOptions(contacts) {
        return [
            '<option value="">全部对象</option>',
            ...(contacts || []).map(([contactId, contactName]) => `<option value="${escapeHtml(contactId)}">${escapeHtml(contactName)}</option>`)
        ].join('');
    }

    function renderEmpty() {
        return '<div class="message-favorite-empty">还没有收藏</div>';
    }

    function renderFavoriteCard(viewModel) {
        const item = viewModel.item || {};
        const groupTags = (viewModel.groupTags || [])
            .map((text) => `<span class="message-favorite-tag">${escapeHtml(text)}</span>`)
            .join('');
        const contextBadges = (viewModel.contextBadges || [])
            .map((text) => `<span class="message-favorite-context-badge">${escapeHtml(text)}</span>`)
            .join('');

        // 从 HTML 中去除多余的 “消息 · ”, “图片 · ” 等字眼，只保留时间
        let cleanSnapshotsHtml = viewModel.snapshotsHtml || '';
        cleanSnapshotsHtml = cleanSnapshotsHtml.replace(/<span>(消息|图片|表情|文件|语音|视频) · (.*?)<\/span>/g, '<span class="mf-time">$2</span>');
        // 将原版的 span 加上 mf-role 方便 css 样式化（如果需要的话）
        cleanSnapshotsHtml = cleanSnapshotsHtml.replace(/<span>(.*?)<\/span>\s*(<span class="mf-time">)/g, '<span class="mf-role">$1</span>\n$2');

        return `
            <div class="message-favorite-card category-${escapeHtml(item.category || 'message')}" data-favorite-id="${escapeHtml(item.id)}">
                <div class="message-favorite-card-meta">
                    <div style="display: flex; flex: 1; width: 100%; justify-content: space-between; align-items: flex-start; gap: 8px;">
                        <div>
                            <div class="message-favorite-meta-main">
                                <span class="message-favorite-category-badge">${escapeHtml(viewModel.categoryLabel || '消息')}</span>
                                <span class="message-favorite-contact">${escapeHtml(viewModel.contactName || '角色')}</span>
                                ${contextBadges}
                            </div>
                            ${groupTags ? `<div class="message-favorite-card-tags">${groupTags}</div>` : ''}
                        </div>
                        ${item.category === 'html' ? `
                            <div class="mf-html-top-actions">
                                <button class="mf-top-action-btn" data-fav-action="open-html" data-favorite-id="${escapeHtml(item.id)}" data-snapshot-index="0">查看</button>
                                <button class="mf-top-action-btn" data-fav-action="open-html-code" data-favorite-id="${escapeHtml(item.id)}" data-snapshot-index="0">代码</button>
                            </div>
                        ` : item.category === 'image' ? `
                            <div class="mf-html-top-actions">
                                <button class="mf-top-action-btn" data-fav-ui-action="open-image" data-favorite-id="${escapeHtml(item.id)}">查看</button>
                            </div>
                        ` : ''}
                    </div>
                    <div class="message-favorite-time">${escapeHtml(viewModel.timeText || '')}</div>
                </div>
                <div class="message-favorite-card-body">
                    ${cleanSnapshotsHtml}
                </div>
                ${viewModel.note ? `<div class="message-favorite-note">${escapeHtml(viewModel.note)}</div>` : ''}
                <div class="message-favorite-actions">
                    <button class="message-favorite-action-btn" data-fav-ui-action="view-full" data-favorite-id="${escapeHtml(item.id)}">完整版</button>
                    <button class="message-favorite-action-btn" data-fav-action="open-source" data-favorite-id="${escapeHtml(item.id)}">上下文</button>
                    <button class="message-favorite-action-btn ${item.isLoved ? 'is-active' : ''}" data-fav-action="toggle-love" data-favorite-id="${escapeHtml(item.id)}">最爱</button>
                    <button class="message-favorite-action-btn" data-fav-ui-action="edit-note" data-favorite-id="${escapeHtml(item.id)}">备注</button>
                    <button class="message-favorite-action-btn" data-fav-ui-action="edit-group" data-favorite-id="${escapeHtml(item.id)}">分组</button>
                    <button class="message-favorite-action-btn is-danger" data-fav-ui-action="remove-favorite" data-favorite-id="${escapeHtml(item.id)}">移出</button>
                </div>
            </div>
        `;
    }

    function renderPagination(page, totalPages) {
        const current = Math.max(1, Number(page) || 1);
        const total = Math.max(1, Number(totalPages) || 1);
        return `
            <button class="message-favorites-page-btn" data-favorite-page-dir="-1" ${current <= 1 ? 'disabled' : ''}>上一页</button>
            <span>${current} / ${total}</span>
            <button class="message-favorites-page-btn" data-favorite-page-dir="1" ${current >= total ? 'disabled' : ''}>下一页</button>
        `;
    }

    window.IDICMessageFavoritesUI = {
        installViewSync,
        renderCategoryTabs,
        renderGroupTabs,
        renderContactOptions,
        renderEmpty,
        renderFavoriteCard,
        renderPagination
    };

    // 通用统一弹窗函数
    function mfShowCustomModal(title, text, type, defaultValue, callback) {
        let modal = document.getElementById('mf-action-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'mf-action-modal';
            modal.innerHTML = `
                <div class="mf-action-modal-backdrop"></div>
                <div class="mf-action-modal-container">
                    <div class="mf-action-modal-header">
                        <div class="mf-action-modal-title"></div>
                    </div>
                    <div class="mf-action-modal-body">
                        <div class="mf-action-modal-text"></div>
                        <input type="text" class="mf-action-modal-input" />
                    </div>
                    <div class="mf-action-modal-footer">
                        <button class="mf-action-modal-btn mf-cancel-btn">取消</button>
                        <button class="mf-action-modal-btn mf-confirm-btn">确定</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }
        modal.querySelector('.mf-action-modal-title').textContent = title;
        const textEl = modal.querySelector('.mf-action-modal-text');
        if (text) {
            textEl.textContent = text;
            textEl.style.display = 'block';
        } else {
            textEl.style.display = 'none';
        }
        const inputEl = modal.querySelector('.mf-action-modal-input');
        if (type === 'prompt') {
            inputEl.value = defaultValue || '';
            inputEl.style.display = 'block';
        } else {
            inputEl.style.display = 'none';
        }
        modal.classList.add('is-open');

        const cleanup = () => {
            modal.classList.remove('is-open');
            const newModal = modal.cloneNode(true);
            modal.parentNode.replaceChild(newModal, modal);
        };

        const confirmBtn = modal.querySelector('.mf-confirm-btn');
        const cancelBtn = modal.querySelector('.mf-cancel-btn');
        const backdrop = modal.querySelector('.mf-action-modal-backdrop');

        confirmBtn.onclick = () => {
            const activeInput = document.querySelector('#mf-action-modal .mf-action-modal-input');
            const currentVal = activeInput ? activeInput.value : inputEl.value;
            if (type === 'prompt') {
                callback(currentVal);
            } else {
                callback();
            }
            cleanup();
        };

        cancelBtn.onclick = cleanup;
        backdrop.onclick = cleanup;

        inputEl.onkeydown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                confirmBtn.click();
            }
        };

        if (type === 'prompt') {
            setTimeout(() => inputEl.focus(), 50);
        }
    }

    // 辅助函数：根据名称获取或创建分组
    function ensureLocalGroup(store, name) {
        const trimmedName = String(name || '').trim();
        if (!trimmedName) return null;
        const existing = (store.customGroups || []).find((group) => String(group.name || '').toLowerCase() === trimmedName.toLowerCase());
        if (existing) return existing;
        const group = { id: `fav_group_${Date.now()}_${Math.floor(Math.random() * 1000)}`, name: trimmedName };
        store.customGroups = store.customGroups || [];
        store.customGroups.push(group);
        return group;
    }

    // 独立注册：UI 层特殊动作处理（安全脱离 script.js）
    document.addEventListener('click', (e) => {
        const store = window.getMessageFavoritesStore && window.getMessageFavoritesStore();

        function handleMissingStore() {
            mfShowCustomModal('需要刷新', '核心数据读取失败，可能是因为浏览器缓存了旧版本代码。\\n请按快捷键 Ctrl + F5 强制刷新页面！', 'alert', '', () => {});
        }
        // 1. 完整版弹窗逻辑
        const viewFullBtn = e.target.closest('[data-fav-ui-action="view-full"]');
        if (viewFullBtn) {
            e.stopPropagation(); e.preventDefault();
            const favoriteId = viewFullBtn.dataset.favoriteId;
            const card = document.querySelector(`.message-favorite-card[data-favorite-id="${favoriteId}"]`);
            if (card) {
                const headerHtml = card.querySelector('.message-favorite-card-meta').innerHTML;
                const bodyNode = card.querySelector('.message-favorite-card-body');
                
                let modal = document.getElementById('mf-full-content-modal');
                if (!modal) {
                    modal = document.createElement('div');
                    modal.id = 'mf-full-content-modal';
                    modal.innerHTML = `
                        <div class="mf-full-modal-backdrop"></div>
                        <div class="mf-full-modal-container">
                            <button class="mf-full-modal-close" title="关闭 (Esc)">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"></path></svg>
                            </button>
                            <div class="mf-full-modal-header"></div>
                            <div class="mf-full-modal-body"></div>
                        </div>
                    `;
                    document.body.appendChild(modal);
                    modal.querySelector('.mf-full-modal-backdrop').addEventListener('click', () => modal.classList.remove('is-open'));
                    modal.querySelector('.mf-full-modal-close').addEventListener('click', () => modal.classList.remove('is-open'));
                }
                
                const container = modal.querySelector('.mf-full-modal-container');
                container.className = 'mf-full-modal-container'; // Reset classes
                const categoryClass = Array.from(card.classList).find(c => c.startsWith('category-'));
                if (categoryClass) container.classList.add(categoryClass);

                modal.querySelector('.mf-full-modal-header').innerHTML = `<div class="message-favorite-card-meta" style="border: none; padding-bottom: 0;">${headerHtml}</div>`;
                const modalBody = modal.querySelector('.mf-full-modal-body');
                
                // 完全克隆节点，以保留原始 body 内所有的 DOM 结构
                const clonedBody = bodyNode.cloneNode(true);
                modalBody.innerHTML = '';
                modalBody.appendChild(clonedBody);
                
                // 特别处理 iframe，因为 cloneNode 不会复制 srcdoc 属性
                const originalIframes = bodyNode.querySelectorAll('iframe');
                const clonedIframes = clonedBody.querySelectorAll('iframe');
                originalIframes.forEach((orig, idx) => {
                    if (clonedIframes[idx]) {
                        clonedIframes[idx].srcdoc = orig.srcdoc;
                    }
                });
                
                modal.classList.add('is-open');
            }
        }

        const viewImageBtn = e.target.closest('[data-fav-ui-action="open-image"]');
        if (viewImageBtn) {
            e.stopPropagation(); e.preventDefault();
            const favoriteId = viewImageBtn.dataset.favoriteId;
            const card = document.querySelector(`.message-favorite-card[data-favorite-id="${favoriteId}"]`);
            if (card) {
                const img = card.querySelector(`img[data-favorite-preview-asset="1"]`);
                if (img) img.click();
            }
        }

        // 统一 UI 弹窗拦截逻辑
        const editNoteBtn = e.target.closest('[data-fav-ui-action="edit-note"]');
        if (editNoteBtn) {
            e.stopPropagation(); e.preventDefault();
            if (!store) return handleMissingStore();
            const favoriteId = editNoteBtn.dataset.favoriteId;
            const item = store.items.find(i => String(i.id) === String(favoriteId));
            if (item) {
                mfShowCustomModal('编辑备注', '', 'prompt', item.note || '', (val) => {
                    item.note = String(val || '').trim();
                    if(window.saveAppData) window.saveAppData();
                    
                    // 强制手动更新 DOM，防止框架重绘失败
                    const card = document.querySelector(`.message-favorite-card[data-favorite-id="${favoriteId}"]`);
                    if (card) {
                        let noteEl = card.querySelector('.message-favorite-note');
                        if (item.note) {
                            if (!noteEl) {
                                noteEl = document.createElement('div');
                                noteEl.className = 'message-favorite-note';
                                const actionsEl = card.querySelector('.message-favorite-actions');
                                if (actionsEl) {
                                    card.insertBefore(noteEl, actionsEl);
                                } else {
                                    card.appendChild(noteEl);
                                }
                            }
                            noteEl.textContent = item.note;
                        } else if (noteEl) {
                            noteEl.remove();
                        }
                    }
                    
                    if(window.renderMessageFavoritesView) window.renderMessageFavoritesView();
                });
            }
        }

        const editGroupBtn = e.target.closest('[data-fav-ui-action="edit-group"]');
        if (editGroupBtn) {
            e.stopPropagation(); e.preventDefault();
            if (!store) return handleMissingStore();
            const favoriteId = editGroupBtn.dataset.favoriteId;
            const item = store.items.find(i => String(i.id) === String(favoriteId));
            if (item) {
                const currentNames = (item.customGroupIds || [])
                    .map(gid => {
                        const g = (store.customGroups || []).find(cg => String(cg.id) === String(gid));
                        return g ? g.name : '';
                    }).filter(Boolean).join(', ');
                mfShowCustomModal('设置分组', '请输入分组名称（多个分组用逗号分隔）', 'prompt', currentNames, (val) => {
                    const names = String(val || '').split(/[，,]/).map(p => p.trim()).filter(Boolean);
                    item.customGroupIds = [...new Set(names.map(name => {
                        const g = ensureLocalGroup(store, name);
                        return g ? String(g.id) : null;
                    }).filter(Boolean))];
                    if(window.saveAppData) window.saveAppData();
                    if(window.renderMessageFavoritesView) window.renderMessageFavoritesView();
                });
            }
        }

        const removeBtn = e.target.closest('[data-fav-ui-action="remove-favorite"]');
        if (removeBtn) {
            e.stopPropagation(); e.preventDefault();
            if (!store) return handleMissingStore();
            const favoriteId = removeBtn.dataset.favoriteId;
            mfShowCustomModal('移出收藏', '确定要将这条消息从收藏中移出吗？', 'confirm', null, () => {
                store.items = (store.items || []).filter((i) => String(i.id) !== String(favoriteId));
                if(window.saveAppData) window.saveAppData();
                if(window.renderMessageFavoritesView) window.renderMessageFavoritesView();
            });
        }

        const createGroupBtn = e.target.closest('#message-favorites-create-group-ui') || e.target.closest('#message-favorites-create-group');
        if (createGroupBtn) {
            e.stopPropagation(); e.preventDefault();
            if (!store) return handleMissingStore();
            mfShowCustomModal('新建分组', '请输入新分组的名称', 'prompt', '', (val) => {
                const g = ensureLocalGroup(store, val);
                if (g) {
                    store.preferences = store.preferences || {};
                    store.preferences.group = String(g.id);
                    if(window.saveAppData) window.saveAppData();
                    if(window.renderMessageFavoritesView) window.renderMessageFavoritesView();
                }
            });
        }

        // 2. 分组删除逻辑
        const delBtn = e.target.closest('.mf-delete-group-btn');
        if (delBtn) {
            e.stopPropagation(); e.preventDefault();
            const groupId = delBtn.dataset.groupId;
            mfShowCustomModal('删除分组', '确定要删除这个分组吗？(这只会删除分组本身，不会删除里面的收藏消息)', 'confirm', null, () => {
                if (store && store.customGroups) {
                    store.customGroups = store.customGroups.filter(g => String(g.id) !== String(groupId));
                    if (store.items) {
                        store.items.forEach(item => {
                            if (item.customGroupIds) {
                                item.customGroupIds = item.customGroupIds.filter(id => String(id) !== String(groupId));
                            }
                        });
                    }
                    if (window.saveAppData) window.saveAppData();
                    if (window.renderMessageFavoritesView) window.renderMessageFavoritesView();
                }
            });
        }
    }, { capture: true });
})();
