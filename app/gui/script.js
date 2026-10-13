document.addEventListener('DOMContentLoaded', () => {

    /* ═══════════════════════════════════════════════════════════
       STATE
       ═══════════════════════════════════════════════════════════ */
    const state = {
        view: 'home',                    // 'home' | 'editor'
        mode: 'quick',                   // 'quick' | 'project'
        project: null,                   // full project detail from server
        items: [],                       // [{ id, kind, name, path?, file?, copies, missing? }]
        layoutPlan: null,                // last computed plan
        projectsCache: [],
        projectFilter: '',
        sortable: null,
        saveTimer: null,
        hasPywebview: false,
        confirmResolve: null,
        ctxMenuOpen: null,
    };

    /* ═══════════════════════════════════════════════════════════
       DOM REFS
       ═══════════════════════════════════════════════════════════ */
    const $ = (id) => document.getElementById(id);
    const els = {
        brandHome:      $('brand-home'),
        breadcrumb:     $('breadcrumb'),
        fileStats:      $('file-stats'),
        generateBtn:    $('generate-btn'),
        btnText:        $('btn-text'),
        btnSpinner:     $('btn-spinner'),

        viewHome:       $('view-home'),
        viewEditor:     $('view-editor'),

        quickStartBtn:  $('quick-start-btn'),
        newProjectBtn:  $('new-project-btn'),
        projectSearch:  $('project-search'),
        projectsList:   $('projects-list'),
        projectsEmpty:  $('projects-empty'),

        uploadForm:     $('upload-form'),
        projectPanel:   $('project-panel'),
        sourceModeLabel:$('source-mode-label'),
        sourcePath:     $('source-path'),
        rescanBtn:      $('rescan-btn'),
        projectSettingsBtn: $('project-settings-btn'),

        cardWidth:      $('card-width'),
        cardHeight:     $('card-height'),
        stretchToggle:  $('stretch-toggle'),
        borderToggle:   $('border-toggle'),

        saveIndicator:  $('save-indicator'),
        saveIndicatorText: $('save-indicator-text'),

        dropZone:       $('drop-zone'),
        dropZoneLabel:  $('drop-zone-label'),
        fileInput:      $('file-input'),

        previewArea:    $('image-preview-area'),
        imageGrid:      $('image-grid'),
        emptyState:     $('empty-state'),
        emptyStateDesc: $('empty-state-desc'),

        projectModal:       $('project-modal'),
        projectModalTitle:  $('project-modal-title'),
        projectModalSub:    $('project-modal-sub'),
        projectModalClose:  $('project-modal-close'),
        pmName:             $('pm-name'),
        pmSourceToggle:     $('pm-source-toggle'),
        pmFolderBlock:      $('pm-folder-block'),
        pmManualBlock:      $('pm-manual-block'),
        pmFolderPath:       $('pm-folder-path'),
        pmPickFolder:       $('pm-pick-folder'),
        pmRecursive:        $('pm-recursive'),
        pmCancel:           $('pm-cancel'),
        pmSubmit:           $('pm-submit'),

        resultsModal:       $('results-modal'),
        resultsSummary:     $('results-summary'),
        resultsProjectSub:  $('results-project-sub'),
        downloadLinks:      $('download-links'),
        backBtn:            $('back-btn'),
        modalCloseBtn:      $('modal-close-btn'),

        confirmModal:       $('confirm-modal'),
        confirmTitle:       $('confirm-title'),
        confirmMsg:         $('confirm-msg'),
        confirmCancel:      $('confirm-cancel'),
        confirmOk:          $('confirm-ok'),

        toastRegion:        $('toast-region'),
    };

    const BACKEND_URL = 'http://127.0.0.1:5000';

    /* ═══════════════════════════════════════════════════════════
       UTILITIES
       ═══════════════════════════════════════════════════════════ */
    const uid = () => 'i_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);

    const basename = (p) => p ? p.replace(/\\/g, '/').split('/').pop() : '';

    const fmtRelative = (iso) => {
        if (!iso) return '—';
        const diff = (Date.now() - new Date(iso).getTime()) / 1000;
        if (diff < 60) return 'just now';
        if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
        if (diff < 86400 * 30) return `${Math.floor(diff / 86400)} d ago`;
        return new Date(iso).toLocaleDateString();
    };

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, (c) =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function toast(msg, kind = 'ok', ms = 2600) {
        const el = document.createElement('div');
        el.className = 'toast' + (kind === 'ok' ? '' : ' ' + kind);
        el.innerHTML = `<span class="dot"></span><span>${escapeHtml(msg)}</span>`;
        els.toastRegion.appendChild(el);
        setTimeout(() => {
            el.classList.add('out');
            setTimeout(() => el.remove(), 200);
        }, ms);
    }

    function confirmDialog(title, msg, okLabel = 'Confirm', danger = true) {
        return new Promise((resolve) => {
            els.confirmTitle.textContent = title;
            els.confirmMsg.textContent = msg;
            els.confirmOk.textContent = okLabel;
            els.confirmOk.className = 'btn ' + (danger ? 'btn-danger' : 'btn-primary');
            els.confirmModal.classList.remove('hidden');
            state.confirmResolve = resolve;
        });
    }

    /* ═══════════════════════════════════════════════════════════
       PYWVEBVIEW BRIDGE
       ═══════════════════════════════════════════════════════════ */
    window.addEventListener('pywebviewready', () => {
        state.hasPywebview = true;
    });
    // Fallback detection for already-initialized state
    if (window.pywebview && window.pywebview.api) state.hasPywebview = true;

    async function nativePickImages() {
        if (!state.hasPywebview) return null;
        try { return await window.pywebview.api.pick_images(); }
        catch (e) { console.warn('native pick failed', e); return null; }
    }
    async function nativePickFolder() {
        if (!state.hasPywebview) return null;
        try { return await window.pywebview.api.pick_folder(); }
        catch (e) { console.warn('native folder pick failed', e); return null; }
    }

    /* ═══════════════════════════════════════════════════════════
       VIEWS
       ═══════════════════════════════════════════════════════════ */
    function switchView(name) {
        state.view = name;
        els.viewHome.classList.toggle('hidden', name !== 'home');
        els.viewEditor.classList.toggle('hidden', name !== 'editor');
        els.generateBtn.classList.toggle('hidden', name !== 'editor');
        renderBreadcrumb();
    }

    function renderBreadcrumb() {
        const crumbs = [];
        if (state.view === 'home') {
        } else {
            crumbs.push(`<span class="crumb" data-nav="home">Workspace</span>`);
            crumbs.push(`<span class="sep">/</span>`);
            if (state.mode === 'quick') {
                crumbs.push(`<span class="current">Quick session</span>`);
            } else if (state.project) {
                crumbs.push(`<span class="current">${escapeHtml(state.project.name)}</span>`);
            } else {
                crumbs.push(`<span class="current">Project</span>`);
            }
        }
        els.breadcrumb.innerHTML = crumbs.join('');
    }

    els.breadcrumb.addEventListener('click', (e) => {
        const c = e.target.closest('[data-nav="home"]');
        if (c) goHome();
    });
    els.brandHome.addEventListener('click', goHome);
    els.brandHome.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goHome(); }
    });

    function goHome() {
        if (state.view === 'editor' && state.mode === 'project' && state.saveTimer) {
            clearTimeout(state.saveTimer);
            state.saveTimer = null;
        }
        switchView('home');
        loadProjects();
    }

    /* ═══════════════════════════════════════════════════════════
       HOME: PROJECTS LIST
       ═══════════════════════════════════════════════════════════ */
    async function loadProjects() {
        try {
            const r = await fetch(`${BACKEND_URL}/api/projects`);
            if (!r.ok) throw new Error('Failed to load projects');
            state.projectsCache = await r.json();
        } catch (e) {
            state.projectsCache = [];
            toast('Could not load projects: ' + e.message, 'error');
        }
        renderProjects();
    }

    function renderProjects() {
        const q = state.projectFilter.trim().toLowerCase();
        const list = q
            ? state.projectsCache.filter(p => p.name.toLowerCase().includes(q))
            : state.projectsCache;

        els.projectsList.innerHTML = '';
        const hasAny = state.projectsCache.length > 0;
        els.projectsEmpty.classList.toggle('hidden', hasAny || q !== '');
        els.projectsList.classList.toggle('hidden', !hasAny);

        list.forEach((p) => {
            const row = document.createElement('div');
            row.className = 'project-row';
            row.dataset.id = p.id;

            const sourceLabel = p.source_mode === 'folder' && p.folder
                ? p.folder
                : 'Manual selection';

            row.innerHTML = `
                <div class="project-name">${escapeHtml(p.name)}</div>
                <div class="project-source" title="${escapeHtml(sourceLabel)}">${escapeHtml(sourceLabel)}</div>
                <div class="project-count"><b>${p.file_count}</b> ${p.file_count === 1 ? 'file' : 'files'}</div>
                <div class="project-when">${fmtRelative(p.updated_at)}</div>
                <div class="row-menu"><button type="button" aria-label="Options" data-menu>
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5">
                        <circle cx="12" cy="6" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="18" r="1"/>
                    </svg>
                </button></div>
            `;

            row.addEventListener('click', (e) => {
                if (e.target.closest('[data-menu]')) return;
                openProject(p.id);
            });
            row.querySelector('[data-menu]').addEventListener('click', (e) => {
                e.stopPropagation();
                const btn = e.currentTarget;
                openProjectMenu(btn, p);
            });

            els.projectsList.appendChild(row);
        });
    }

    els.projectSearch.addEventListener('input', () => {
        state.projectFilter = els.projectSearch.value;
        renderProjects();
    });

    /* ── Context menu for project rows ── */
    function closeCtxMenu() {
        if (state.ctxMenuOpen) {
            state.ctxMenuOpen.remove();
            state.ctxMenuOpen = null;
            document.removeEventListener('click', closeCtxMenuOnOutside);
            document.removeEventListener('keydown', closeCtxMenuOnEsc);
            window.removeEventListener('resize', closeCtxMenu);
            window.removeEventListener('blur', closeCtxMenu);
        }
    }
    function closeCtxMenuOnOutside(e) {
        if (state.ctxMenuOpen && !state.ctxMenuOpen.contains(e.target)) closeCtxMenu();
    }
    function closeCtxMenuOnEsc(e) { if (e.key === 'Escape') closeCtxMenu(); }

    function openProjectMenu(anchorBtn, proj) {
        closeCtxMenu();
        const rect = anchorBtn.getBoundingClientRect();
        const menu = document.createElement('div');
        menu.className = 'ctx-menu';
        menu.innerHTML = `
            <button data-act="open">Open</button>
            <button data-act="rename">Rename…</button>
            <button data-act="reveal">Reveal in file manager</button>
            <div class="sep"></div>
            <button data-act="duplicate">Duplicate</button>
            <div class="sep"></div>
            <button data-act="delete" class="danger">Delete project</button>
        `;
        document.body.appendChild(menu);

        const mw = menu.offsetWidth;
        const mh = menu.offsetHeight;
        let left = rect.right - mw;
        let top = rect.bottom + 4;
        if (left < 8) left = 8;
        if (top + mh > window.innerHeight - 8) top = rect.top - mh - 4;
        menu.style.left = left + 'px';
        menu.style.top = top + 'px';

        state.ctxMenuOpen = menu;

        menu.addEventListener('click', async (e) => {
            const b = e.target.closest('button[data-act]');
            if (!b) return;
            const act = b.dataset.act;
            closeCtxMenu();
            if (act === 'open') return openProject(proj.id);
            if (act === 'rename') return renameProject(proj);
            if (act === 'reveal') return revealProject(proj);
            if (act === 'duplicate') return duplicateProject(proj);
            if (act === 'delete') return deleteProject(proj);
        });

        setTimeout(() => {
            document.addEventListener('click', closeCtxMenuOnOutside);
            document.addEventListener('keydown', closeCtxMenuOnEsc);
            window.addEventListener('resize', closeCtxMenu);
            window.addEventListener('blur', closeCtxMenu);
        }, 0);
    }

    async function renameProject(proj) {
        const next = prompt('New project name:', proj.name);
        if (!next || next.trim() === proj.name) return;
        try {
            const r = await fetch(`${BACKEND_URL}/api/projects/${proj.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: next.trim() }),
            });
            if (!r.ok) throw new Error('Rename failed');
            toast('Project renamed');
            loadProjects();
        } catch (e) { toast(e.message, 'error'); }
    }

    async function revealProject(proj) {
        try {
            const r = await fetch(`${BACKEND_URL}/api/projects/${proj.id}/reveal`, { method: 'POST' });
            if (!r.ok) {
                const err = await r.json().catch(() => ({}));
                throw new Error(err.error || 'Could not reveal folder.');
            }
        } catch (e) { toast(e.message, 'error'); }
    }

    async function duplicateProject(proj) {
        try {
            const detail = await fetch(`${BACKEND_URL}/api/projects/${proj.id}`).then(r => r.json());
            const payload = {
                name: detail.name + ' (copy)',
                source: detail.source,
            };
            const r = await fetch(`${BACKEND_URL}/api/projects`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!r.ok) throw new Error('Duplicate failed');
            const newProj = await r.json();
            await fetch(`${BACKEND_URL}/api/projects/${newProj.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ options: detail.options, copies: detail.options ? undefined : undefined }),
            });
            toast('Project duplicated');
            loadProjects();
        } catch (e) { toast(e.message, 'error'); }
    }

    async function deleteProject(proj) {
        const ok = await confirmDialog(
            'Delete project?',
            `“${proj.name}” will be removed from the workspace. Files on disk are not touched.`,
            'Delete',
            true
        );
        if (!ok) return;
        try {
            const r = await fetch(`${BACKEND_URL}/api/projects/${proj.id}`, { method: 'DELETE' });
            if (!r.ok) throw new Error('Delete failed');
            toast('Project deleted');
            loadProjects();
        } catch (e) { toast(e.message, 'error'); }
    }

    /* ═══════════════════════════════════════════════════════════
       QUICK SESSION
       ═══════════════════════════════════════════════════════════ */
    els.quickStartBtn.addEventListener('click', startQuickSession);

    function startQuickSession() {
        state.mode = 'quick';
        state.project = null;
        state.items = [];
        state.layoutPlan = null;

        els.projectPanel.classList.add('hidden');
        els.saveIndicator.classList.add('hidden');
        els.cardWidth.value = '63';
        els.cardHeight.value = '88';
        els.stretchToggle.checked = false;
        els.borderToggle.checked = true;

        els.dropZoneLabel.innerHTML = '<b>Add images</b> — click or drop files here';
        els.dropZone.classList.remove('hidden');
        els.emptyStateDesc.textContent = 'Add PNG, JPG or BMP files to build your print sheet.';

        renderItems();
        refreshStats();
        switchView('editor');
    }

    /* ═══════════════════════════════════════════════════════════
       PROJECT: CREATE / OPEN
       ═══════════════════════════════════════════════════════════ */
    els.newProjectBtn.addEventListener('click', () => openProjectModal());

    function openProjectModal() {
        els.projectModalTitle.textContent = 'New project';
        els.projectModalSub.textContent = 'Reference a folder on disk or curate files manually.';
        els.pmName.value = '';
        els.pmRecursive.checked = false;
        els.pmFolderPath.textContent = 'No folder selected';
        els.pmFolderPath.dataset.folder = '';
        setPmMode('folder');
        els.projectModal.classList.remove('hidden');
        setTimeout(() => els.pmName.focus(), 40);
    }

    function closeProjectModal() { els.projectModal.classList.add('hidden'); }

    els.projectModalClose.addEventListener('click', closeProjectModal);
    els.pmCancel.addEventListener('click', closeProjectModal);
    els.projectModal.addEventListener('click', (e) => {
        if (e.target === els.projectModal) closeProjectModal();
    });

    els.pmSourceToggle.addEventListener('click', (e) => {
        const b = e.target.closest('[data-mode]');
        if (!b) return;
        setPmMode(b.dataset.mode);
    });

    function setPmMode(mode) {
        els.pmSourceToggle.querySelectorAll('[data-mode]').forEach((b) => {
            b.classList.toggle('active', b.dataset.mode === mode);
        });
        els.pmFolderBlock.classList.toggle('hidden', mode !== 'folder');
        els.pmManualBlock.classList.toggle('hidden', mode !== 'manual');
    }

    function currentPmMode() {
        const b = els.pmSourceToggle.querySelector('.segmented-btn.active');
        return b ? b.dataset.mode : 'folder';
    }

    els.pmPickFolder.addEventListener('click', async () => {
        let folder = null;
        if (state.hasPywebview) {
            folder = await nativePickFolder();
        } else {
            toast('Folder picker requires the desktop app.', 'warn');
            return;
        }
        if (folder) {
            els.pmFolderPath.textContent = folder;
            els.pmFolderPath.dataset.folder = folder;
        }
    });

    els.pmSubmit.addEventListener('click', async () => {
        const name = els.pmName.value.trim();
        const mode = currentPmMode();
        const payload = {
            name: name || 'Untitled project',
            source: { mode },
        };
        if (mode === 'folder') {
            const folder = els.pmFolderPath.dataset.folder;
            if (!folder) { toast('Pick a folder first.', 'warn'); return; }
            payload.source.folder = folder;
            payload.source.recursive = els.pmRecursive.checked;
        }
        els.pmSubmit.disabled = true;
        try {
            const r = await fetch(`${BACKEND_URL}/api/projects`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'Create failed');
            closeProjectModal();
            toast('Project created');
            openProjectDetail(data);
        } catch (e) {
            toast(e.message, 'error');
        } finally {
            els.pmSubmit.disabled = false;
        }
    });

    async function openProject(pid) {
        try {
            const r = await fetch(`${BACKEND_URL}/api/projects/${pid}`);
            if (!r.ok) throw new Error('Project not found');
            const detail = await r.json();
            openProjectDetail(detail);
        } catch (e) { toast(e.message, 'error'); }
    }

    function openProjectDetail(detail) {
        state.mode = 'project';
        state.project = detail;
        state.items = (detail.items || []).map((it) => ({
            id: uid(),
            kind: 'path',
            name: it.name,
            path: it.path,
            copies: it.copies || 1,
            missing: !!it.missing,
        }));
        state.layoutPlan = null;

        // Options
        const o = detail.options || {};
        els.cardWidth.value  = o.card_width_mm  ?? 63;
        els.cardHeight.value = o.card_height_mm ?? 88;
        els.stretchToggle.checked = !!o.stretch_to_fit;
        els.borderToggle.checked  = o.add_border !== false;

        // Panel
        els.projectPanel.classList.remove('hidden');
        const src = detail.source || {};
        if (src.mode === 'folder') {
            els.sourceModeLabel.textContent = 'Folder' + (src.recursive ? ' · recursive' : '');
            els.sourcePath.textContent = src.folder || '—';
            els.sourcePath.title = src.folder || '';
        } else {
            els.sourceModeLabel.textContent = 'Manual selection';
            els.sourcePath.textContent = `${state.items.length} file${state.items.length === 1 ? '' : 's'}`;
        }

        // Contextual copy
        if (src.mode === 'folder') {
            els.dropZoneLabel.innerHTML = '<b>Folder-sourced project</b> — use Rescan to pick up new files';
            els.emptyStateDesc.textContent = 'The folder is empty (or all files are hidden). Add images there and hit Rescan.';
        } else {
            els.dropZoneLabel.innerHTML = '<b>Add images</b> — click to pick files on disk';
            els.emptyStateDesc.textContent = 'Add files to this project. They\'ll be referenced by path.';
        }

        // Adjust drop zone cursor semantics
        els.dropZone.dataset.mode = src.mode;

        showSaveIndicator('Saved', false);
        renderItems();
        refreshStats();
        switchView('editor');
    }

    /* ═══════════════════════════════════════════════════════════
       IMAGE GRID: RENDER
       ═══════════════════════════════════════════════════════════ */
    function renderItems() {
        els.imageGrid.innerHTML = '';
        state.items.forEach((it, i) => els.imageGrid.appendChild(buildCard(it, i)));
        refreshVisibility();
    }

    function refreshVisibility() {
        const has = state.items.length > 0;
        els.previewArea.classList.toggle('hidden', !has);
        els.emptyState.classList.toggle('hidden', has);
    }

    function buildCard(item, index) {
        const el = document.createElement('article');
        el.className = 'card-item' + (item.missing ? ' missing' : '');
        el.dataset.id = item.id;

        const indexedLabel = String(index + 1).padStart(2, '0');

        el.innerHTML = `
            <div class="card-thumb">
                ${item.missing
                    ? `<span class="card-badge">Missing</span>`
                    : `<span class="card-index">${indexedLabel}</span>`}
                <button type="button" class="card-remove" data-action="remove" aria-label="Remove">
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M6 6l12 12M6 18L18 6" stroke-linecap="round"/>
                    </svg>
                </button>
                ${item.missing ? '' : '<img alt="">'}
            </div>
            <div class="card-meta">
                <p class="card-filename" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</p>
                <div class="qty">
                    <button type="button" data-action="dec" aria-label="Fewer copies">
                        <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.8">
                            <path d="M5 12h14" stroke-linecap="round"/>
                        </svg>
                    </button>
                    <input type="number" class="qty-input" min="1" max="999" value="${item.copies}" inputmode="numeric">
                    <button type="button" data-action="inc" aria-label="More copies">
                        <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.8">
                            <path d="M12 5v14M5 12h14" stroke-linecap="round"/>
                        </svg>
                    </button>
                </div>
            </div>
        `;

        // Async load thumb — data URL for File, img src for path
        if (!item.missing) {
            const img = el.querySelector('img');
            if (item.kind === 'file' && item.file) {
                const r = new FileReader();
                r.onload = (e) => { img.src = e.target.result; };
                r.readAsDataURL(item.file);
            } else if (item.path) {
                img.src = `${BACKEND_URL}/api/thumb?path=${encodeURIComponent(item.path)}`;
                img.onerror = () => {
                    img.style.display = 'none';
                    el.querySelector('.card-thumb').style.background =
                        'repeating-linear-gradient(45deg,#16161a,#16161a 8px,#101014 8px,#101014 16px)';
                };
            }
        }

        return el;
    }

    function renumberGrid() {
        const cards = els.imageGrid.querySelectorAll('.card-item');
        cards.forEach((card, i) => {
            const tag = card.querySelector('.card-index');
            if (tag) tag.textContent = String(i + 1).padStart(2, '0');
        });
    }

    /* ═══════════════════════════════════════════════════════════
       GRID INTERACTIONS
       ═══════════════════════════════════════════════════════════ */
    els.imageGrid.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const card = btn.closest('.card-item');
        if (!card) return;
        const idx = state.items.findIndex((f) => f.id === card.dataset.id);
        if (idx === -1) return;

        const action = btn.dataset.action;
        if (action === 'remove') {
            state.items.splice(idx, 1);
            card.remove();
            renumberGrid();
            refreshStats();
            refreshVisibility();
            if (state.mode === 'project') scheduleSave();
        } else if (action === 'inc') {
            state.items[idx].copies = Math.min(999, state.items[idx].copies + 1);
            card.querySelector('.qty-input').value = state.items[idx].copies;
            refreshStats();
            if (state.mode === 'project') scheduleSave();
        } else if (action === 'dec') {
            if (state.items[idx].copies > 1) {
                state.items[idx].copies -= 1;
                card.querySelector('.qty-input').value = state.items[idx].copies;
                refreshStats();
                if (state.mode === 'project') scheduleSave();
            }
        }
    });

    els.imageGrid.addEventListener('input', (e) => {
        if (!e.target.classList.contains('qty-input')) return;
        const card = e.target.closest('.card-item');
        const idx = state.items.findIndex((f) => f.id === card.dataset.id);
        if (idx === -1) return;
        let v = parseInt(e.target.value, 10);
        if (isNaN(v) || v < 1) v = 1;
        if (v > 999) v = 999;
        state.items[idx].copies = v;
        refreshStats();
        if (state.mode === 'project') scheduleSave();
    });

    els.imageGrid.addEventListener('blur', (e) => {
        if (!e.target.classList || !e.target.classList.contains('qty-input')) return;
        const card = e.target.closest('.card-item');
        const idx = state.items.findIndex((f) => f.id === card.dataset.id);
        if (idx === -1) return;
        e.target.value = state.items[idx].copies;
    }, true);

    /* Sortable */
    state.sortable = new Sortable(els.imageGrid, {
        animation: 160,
        ghostClass: 'sortable-ghost',
        chosenClass: 'sortable-chosen',
        draggable: '.card-item',
        handle: '.card-thumb',
        onEnd() {
            const ids = [...els.imageGrid.children].map((c) => c.dataset.id);
            state.items.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
            renumberGrid();
            if (state.mode === 'project') scheduleSave();
        }
    });

    /* ═══════════════════════════════════════════════════════════
       ADD FILES / PATHS
       ═══════════════════════════════════════════════════════════ */
    els.dropZone.addEventListener('click', onDropZoneClick);
    els.dropZone.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onDropZoneClick(); }
    });
    els.dropZone.addEventListener('dragover', (e) => { e.preventDefault(); els.dropZone.classList.add('drag-over'); });
    els.dropZone.addEventListener('dragleave', () => els.dropZone.classList.remove('drag-over'));
    els.dropZone.addEventListener('drop', async (e) => {
        e.preventDefault();
        els.dropZone.classList.remove('drag-over');
        await handleDrop(e.dataTransfer.files);
    });

    els.fileInput.addEventListener('change', async () => {
        if (state.mode === 'quick') {
            addFilesQuick(els.fileInput.files);
        }
        els.fileInput.value = null;
    });

    async function onDropZoneClick() {
        if (state.mode === 'quick') {
            els.fileInput.click();
            return;
        }
        // project mode
        const src = state.project?.source || {};
        if (src.mode === 'folder') {
            // Folder mode: no manual add. Offer rescan.
            const ok = await confirmDialog(
                'Rescan folder?',
                'This project pulls files from a folder. Rescan to pick up new files.',
                'Rescan',
                false
            );
            if (ok) rescanProject();
            return;
        }
        // manual project
        if (state.hasPywebview) {
            const paths = await nativePickImages();
            if (paths && paths.length) {
                addPathsToProject(paths);
            }
        } else {
            toast('Open the desktop app to add files to a project.', 'warn');
        }
    }

    async function handleDrop(files) {
        if (state.mode === 'quick') {
            addFilesQuick(files);
            return;
        }
        // project mode — best effort, treat as files (uses object URLs)
        const src = state.project?.source || {};
        if (src.mode === 'folder') {
            toast('Folder projects pull files from disk. Use Rescan.', 'warn');
            return;
        }
        if (!files || !files.length) return;
        addFilesQuick(files); // fallback: works visually, saves to nothing persistent
        toast('Files added to this session only. Use the file picker to persist them.', 'warn', 3600);
    }

    function addFilesQuick(files) {
        for (const f of files) {
            if (!f.type.startsWith('image/')) continue;
            state.items.push({
                id: uid(),
                kind: 'file',
                file: f,
                name: f.name,
                copies: 1,
            });
        }
        renderItems();
        refreshStats();
    }

    async function addPathsToProject(paths) {
        const existing = new Set(state.items.map((i) => i.path).filter(Boolean));
        const added = [];
        for (const p of paths) {
            if (existing.has(p)) continue;
            state.items.push({
                id: uid(),
                kind: 'path',
                path: p,
                name: basename(p),
                copies: 1,
                missing: false,
            });
            added.push(p);
        }
        renderItems();
        refreshStats();
        if (added.length && state.mode === 'project') {
            await saveProject();
            toast(`${added.length} file${added.length === 1 ? '' : 's'} added`);
        }
    }

    /* ═══════════════════════════════════════════════════════════
       PROJECT: RESCAN, SETTINGS, SAVE
       ═══════════════════════════════════════════════════════════ */
    els.rescanBtn.addEventListener('click', rescanProject);

    async function rescanProject() {
        if (!state.project) return;
        els.rescanBtn.disabled = true;
        try {
            const r = await fetch(`${BACKEND_URL}/api/projects/${state.project.id}/rescan`, { method: 'POST' });
            if (!r.ok) throw new Error('Rescan failed');
            const detail = await r.json();
            const before = state.items.length;
            openProjectDetail(detail);
            const after = state.items.length;
            toast(`Rescanned · ${after} file${after === 1 ? '' : 's'}${after !== before ? ` (${after - before > 0 ? '+' : ''}${after - before})` : ''}`);
        } catch (e) {
            toast(e.message, 'error');
        } finally {
            els.rescanBtn.disabled = false;
        }
    }

    els.projectSettingsBtn.addEventListener('click', () => {
        if (!state.project) return;
        openProjectModal();
        els.projectModalTitle.textContent = 'Project settings';
        els.projectModalSub.textContent = 'Change the source folder or switch to manual selection.';
        els.pmSubmit.textContent = 'Save changes';
        els.pmName.value = state.project.name || '';
        const src = state.project.source || {};
        setPmMode(src.mode || 'folder');
        els.pmRecursive.checked = !!src.recursive;
        els.pmFolderPath.textContent = src.folder || 'No folder selected';
        els.pmFolderPath.dataset.folder = src.folder || '';
        // Swap submit behavior temporarily
        els.pmSubmit.dataset.action = 'update';
    });

    // Detach and reattach submit based on data-action
    els.pmSubmit.addEventListener('click', async (e) => {
        if (els.pmSubmit.dataset.action !== 'update') return;
        e.stopImmediatePropagation();
        if (!state.project) return;
        const payload = { name: els.pmName.value.trim() || 'Untitled', source: { mode: currentPmMode() } };
        if (payload.source.mode === 'folder') {
            const folder = els.pmFolderPath.dataset.folder;
            if (!folder) { toast('Pick a folder first.', 'warn'); return; }
            payload.source.folder = folder;
            payload.source.recursive = els.pmRecursive.checked;
        }
        els.pmSubmit.disabled = true;
        try {
            const r = await fetch(`${BACKEND_URL}/api/projects/${state.project.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'Save failed');
            closeProjectModal();
            els.pmSubmit.dataset.action = '';
            els.pmSubmit.textContent = 'Create project';
            openProjectDetail(data);
            toast('Project updated');
        } catch (err) {
            toast(err.message, 'error');
        } finally {
            els.pmSubmit.disabled = false;
        }
    }, true);

    // Autosave on option changes
    ['change', 'input'].forEach((evt) => {
        els.uploadForm.addEventListener(evt, (e) => {
            const t = e.target;
            if (!t || !t.id) return;
            if (!['card-width', 'card-height', 'stretch-toggle', 'border-toggle'].includes(t.id)) return;
            if (state.mode === 'project') scheduleSave();
        });
    });

    function showSaveIndicator(text, dirty) {
        els.saveIndicator.classList.remove('hidden', 'dirty', 'error');
        els.saveIndicatorText.textContent = text;
        if (dirty) els.saveIndicator.classList.add('dirty');
    }

    function scheduleSave() {
        if (state.mode !== 'project' || !state.project) return;
        showSaveIndicator('Unsaved changes', true);
        if (state.saveTimer) clearTimeout(state.saveTimer);
        state.saveTimer = setTimeout(saveProject, 500);
    }

    async function saveProject() {
        if (state.mode !== 'project' || !state.project) return;
        state.saveTimer = null;

        const order = state.items.filter((i) => i.path && !i.missing).map((i) => i.path);
        const copies = {};
        state.items.forEach((i) => { if (i.path) copies[i.path] = i.copies; });

        const payload = {
            order,
            copies,
            options: {
                card_width_mm:  parseFloat(els.cardWidth.value) || 63,
                card_height_mm: parseFloat(els.cardHeight.value) || 88,
                stretch_to_fit: els.stretchToggle.checked,
                add_border:     els.borderToggle.checked,
            },
        };

        try {
            const r = await fetch(`${BACKEND_URL}/api/projects/${state.project.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!r.ok) throw new Error('Save failed');
            const data = await r.json();
            state.project.options = data.options;
            showSaveIndicator('Saved', false);
        } catch (e) {
            showSaveIndicator('Save failed', false);
            els.saveIndicator.classList.add('error');
            toast('Could not save project: ' + e.message, 'error');
        }
    }

    /* ═══════════════════════════════════════════════════════════
       STATS BAR
       ═══════════════════════════════════════════════════════════ */
    function refreshStats() {
        const has = state.items.length > 0;
        if (!has) {
            els.fileStats.innerHTML = `<span>No files loaded</span>`;
            return;
        }
        const total = state.items.reduce((s, f) => s + (f.copies || 1), 0);
        const missing = state.items.filter((i) => i.missing).length;
        const parts = [
            `<span><b>${state.items.length}</b> file${state.items.length === 1 ? '' : 's'}</span>`,
            `<span class="dot"></span>`,
            `<span><b>${total}</b> card${total === 1 ? '' : 's'}</span>`,
        ];
        if (missing) {
            parts.push(`<span class="dot"></span>`);
            parts.push(`<span style="color:var(--danger)"><b>${missing}</b> missing</span>`);
        }
        els.fileStats.innerHTML = parts.join('');
    }

    /* ═══════════════════════════════════════════════════════════
       GENERATE
       ═══════════════════════════════════════════════════════════ */
    els.generateBtn.addEventListener('click', generate);
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            if (state.view !== 'editor') return;
            if (!els.resultsModal.classList.contains('hidden')) return;
            e.preventDefault();
            generate();
        }
    });

    async function generate() {
        if (!state.items.length) { toast('Add at least one image.', 'warn'); return; }
        const card_width_mm  = parseFloat(els.cardWidth.value);
        const card_height_mm = parseFloat(els.cardHeight.value);
        if (!card_width_mm || !card_height_mm) { toast('Set card dimensions.', 'warn'); return; }

        setLoading(true);
        try {
            let plan;
            if (state.mode === 'quick') {
                plan = await previewQuick(card_width_mm, card_height_mm);
            } else {
                // Persist last edits before generating
                if (state.project) await saveProject();
                plan = await previewFromPaths(card_width_mm, card_height_mm);
            }
            state.layoutPlan = plan;
            showResults(plan);
        } catch (e) {
            toast(e.message, 'error');
        } finally {
            setLoading(false);
        }
    }

    async function previewQuick(w, h) {
        const fd = new FormData();
        fd.append('card_width_mm', w);
        fd.append('card_height_mm', h);
        fd.append('stretch_to_fit', els.stretchToggle.checked);
        fd.append('add_border', els.borderToggle.checked);
        state.items.forEach((item) => {
            const n = Math.max(1, item.copies || 1);
            for (let i = 0; i < n; i++) fd.append('files[]', item.file);
        });
        const r = await fetch(`${BACKEND_URL}/preview-layout`, { method: 'POST', body: fd });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || 'Layout failed');
        return data;
    }

    async function previewFromPaths(w, h) {
        const paths = [];
        state.items.forEach((item) => {
            if (!item.path || item.missing) return;
            const n = Math.max(1, item.copies || 1);
            for (let i = 0; i < n; i++) paths.push(item.path);
        });
        if (!paths.length) throw new Error('No valid files to compose.');

        const r = await fetch(`${BACKEND_URL}/api/preview-from-paths`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                paths,
                options: {
                    card_width_mm: w,
                    card_height_mm: h,
                    stretch_to_fit: els.stretchToggle.checked,
                    add_border: els.borderToggle.checked,
                },
            }),
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || 'Layout failed');
        return data;
    }

    function setLoading(on) {
        els.generateBtn.disabled = on;
        els.btnText.textContent = on ? 'Composing…' : 'Generate sheets';
        els.btnSpinner.classList.toggle('hidden', !on);
    }

    /* ═══════════════════════════════════════════════════════════
       RESULTS MODAL
       ═══════════════════════════════════════════════════════════ */
    function showResults(plan) {
        const info     = plan.layout_info || {};
        const sheets   = plan.num_sheets || 1;
        const perSheet = info.cards_per_sheet || 0;
        const cols     = info.cols || 0;
        const rows     = info.rows || 0;
        const orient   = (info.orientation || 'portrait');
        const orientLbl = orient.charAt(0).toUpperCase() + orient.slice(1);
        const missing  = plan.missing || [];

        els.resultsProjectSub.textContent = state.mode === 'project' && state.project
            ? `Rendered from “${state.project.name}”`
            : 'Quick session · nothing saved to a project';

        const missingBlock = missing.length
            ? `<div class="missing-note">
                   <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5">
                       <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" stroke-linecap="round" stroke-linejoin="round"/>
                   </svg>
                   <span><b>${missing.length}</b> file${missing.length === 1 ? '' : 's'} could not be found on disk and ${missing.length === 1 ? 'was' : 'were'} skipped.</span>
               </div>`
            : '';

        els.resultsSummary.innerHTML = `
            <div class="summary-grid">
                <div class="summary-cell">
                    <span class="label">Sheets</span>
                    <span class="value">${sheets}</span>
                </div>
                <div class="summary-cell">
                    <span class="label">Cards / sheet</span>
                    <span class="value">${perSheet}</span>
                </div>
                <div class="summary-cell">
                    <span class="label">Grid</span>
                    <span class="value">${cols}×${rows}</span>
                </div>
                <div class="summary-cell">
                    <span class="label">Format</span>
                    <span class="value">A4</span>
                </div>
            </div>
            <div class="summary-format">
                <span>${orientLbl} orientation</span>
                <span class="divider"></span>
                <span>300 DPI</span>
                <span class="divider"></span>
                <span>5 mm safe margin</span>
            </div>
            ${missingBlock}
        `;

        let buttons = '';
        if (sheets > 1) {
            buttons += `<button class="download-btn primary" data-format="zip">Download .zip</button>`;
        } else {
            buttons += `<button class="download-btn primary" data-format="jpg">Download .jpg</button>`;
        }
        buttons += `<button class="download-btn" data-format="pdf">Download .pdf</button>`;
        els.downloadLinks.innerHTML = buttons;

        els.resultsModal.classList.remove('hidden');
    }

    function closeResults() {
        els.resultsModal.classList.add('hidden');
        els.downloadLinks.innerHTML = '';
    }

    els.backBtn.addEventListener('click', closeResults);
    els.modalCloseBtn.addEventListener('click', closeResults);
    els.resultsModal.addEventListener('click', (e) => {
        if (e.target === els.resultsModal) closeResults();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (!els.resultsModal.classList.contains('hidden')) return closeResults();
            if (!els.projectModal.classList.contains('hidden')) return closeProjectModal();
            if (!els.confirmModal.classList.contains('hidden')) return cancelConfirm();
        }
    });

    els.downloadLinks.addEventListener('click', async (e) => {
        const btn = e.target.closest('.download-btn');
        if (!btn || !state.layoutPlan) return;
        const format = btn.dataset.format;
        const original = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Preparing…';

        try {
            const r = await fetch(`${BACKEND_URL}/generate-file`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ plan: state.layoutPlan, format }),
            });
            const data = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(data.error || 'Generate failed');

            // Native save dialog via pywebview
            if (window.pywebview && window.pywebview.api && window.pywebview.api.save_file) {
                btn.textContent = 'Save as…';
                const res = await window.pywebview.api.save_file(
                    data.temp_path, data.suggested_name, data.kind
                );
                if (res.cancelled) {
                    // user cancelled — silent
                } else if (!res.ok) {
                    throw new Error(res.error || 'Save failed');
                } else {
                    toast('Saved · ' + res.path, 'ok', 4200);
                }
            } else {
                // Dev/browser fallback
                const a = document.createElement('a');
                a.href = `${BACKEND_URL}/downloads/${encodeURIComponent(data.suggested_name)}`;
                a.download = data.suggested_name;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            }
        } catch (err) {
            toast(err.message, 'error');
        } finally {
            btn.textContent = original;
            btn.disabled = false;
        }
    });

    /* ═══════════════════════════════════════════════════════════
       CONFIRM MODAL
       ═══════════════════════════════════════════════════════════ */
    function cancelConfirm() {
        els.confirmModal.classList.add('hidden');
        if (state.confirmResolve) { state.confirmResolve(false); state.confirmResolve = null; }
    }
    els.confirmCancel.addEventListener('click', cancelConfirm);
    els.confirmOk.addEventListener('click', () => {
        els.confirmModal.classList.add('hidden');
        if (state.confirmResolve) { state.confirmResolve(true); state.confirmResolve = null; }
    });
    els.confirmModal.addEventListener('click', (e) => {
        if (e.target === els.confirmModal) cancelConfirm();
    });

    /* ═══════════════════════════════════════════════════════════
       INIT
       ═══════════════════════════════════════════════════════════ */
    function init() {
        switchView('home');
        loadProjects();
        refreshStats();
    }
    init();
});