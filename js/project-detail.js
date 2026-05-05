let projectContentResizeObserver = null;
let projectContentMetricsFrame = null;

document.addEventListener('DOMContentLoaded', async () => {
    const containers = Array.from(document.querySelectorAll('.project-page-projects'));
    if (containers.length === 0) {
        return;
    }

    const status = document.getElementById('projectStatus');
    const params = new URLSearchParams(window.location.search);
    const requestedSlug = params.get('slug');

    try {
        const payload = await loadProjectsPayload();
        const works = Array.isArray(payload.works) ? payload.works : [];
        if (works.length === 0) {
            throw new Error('No project data available.');
        }

        const project = works.find((item) => item.slug === requestedSlug) || works[Math.floor(Math.random() * works.length)] || works[0];
        renderProject(project, containers);
        document.title = `Space-to-Space - ${project.title || 'Project'}`;

        if (status) {
            status.hidden = true;
            status.textContent = '';
        }

        if (window.SpaceToSpaceProjectDetail && typeof window.SpaceToSpaceProjectDetail.refresh === 'function') {
            window.SpaceToSpaceProjectDetail.refresh();
            if (typeof window.SpaceToSpaceProjectDetail.playIntro === 'function') {
                window.SpaceToSpaceProjectDetail.playIntro();
            }
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        containers.forEach((container) => {
            container.innerHTML = '';
            container.appendChild(createEmptyCard(`Project data could not be loaded. ${message}`));
        });
        if (status) {
            status.hidden = false;
            status.textContent = message;
        }
    }
});

function renderProject(project, containers) {
    const visualAssets = normalizeVisualAssets(project);
    const isVideoBackground = project.detailLayout === 'video-background';
    const videoAssets = visualAssets.filter((asset) => asset.type === 'video');
    const imageAssets = visualAssets.filter((asset) => asset.type === 'image');
    const backgroundVideo = isVideoBackground ? videoAssets[0] : null;
    const infoCard = createInfoCard(project);
    const videoCards = videoAssets.map((asset, index) => createVisualCard(asset, `Video ${index + 1}`));
    const imageCards = imageAssets.map((asset, index) => createVisualCard(asset, `Image ${index + 1}`));
    const cards = isVideoBackground
        ? [infoCard, ...videoCards, ...imageCards]
        : [...videoCards, infoCard, ...imageCards];

    document.body.classList.toggle('project-video-background-page', Boolean(backgroundVideo));
    document.body.classList.toggle('project-video-intro-active', Boolean(backgroundVideo));
    document.body.classList.remove('project-video-intro-transitioning', 'project-video-intro-settled');
    renderProjectVideoProjection(project, backgroundVideo);
    syncVideoProjectionDepth(Boolean(backgroundVideo));
    exposeProjectVideoIntroControls();

    containers.forEach((container) => {
        container.innerHTML = '';
        cards.forEach((card) => {
            container.appendChild(card.cloneNode(true));
        });
    });

    bindProjectInteractions(containers);
    playVisibleProjectVideos();
    watchProjectContentMetrics(containers);
    scheduleProjectContentMetricsRefresh();
}

function normalizeVisualAssets(project) {
    const resolvedAssets = Array.isArray(project.resolvedAssets) ? project.resolvedAssets : [];
    return resolvedAssets.filter((asset) => (
        (asset.type === 'image' || asset.type === 'video')
        && !isGalleryPreviewAsset(asset, project)
    ));
}

function createInfoCard(project) {
    const article = document.createElement('article');
    article.className = 'project-card project-card--contained';
    article.dataset.navLabel = project.title || 'Project';

    const info = document.createElement('div');
    info.className = 'project-info';

    const title = document.createElement('h2');
    title.textContent = project.title || 'Untitled project';
    info.appendChild(title);

    if (project.author) {
        const authors = document.createElement('p');
        authors.className = 'project-authors';
        authors.textContent = project.author;
        info.appendChild(authors);
    }

    if (project.school) {
        const school = document.createElement('p');
        school.className = 'project-school';
        school.textContent = project.school;
        info.appendChild(school);
    }

    if (project.text) {
        const desc = document.createElement('p');
        desc.className = 'project-desc';
        desc.textContent = project.text;
        info.appendChild(desc);
    }

    const contacts = createContacts(project.contacts);
    if (contacts) {
        info.appendChild(contacts);
    }

    const links = createDocumentLinks(project);
    if (links) {
        info.appendChild(links);
    }

    article.appendChild(info);
    return article;
}

function createVisualCard(asset, label) {
    const article = document.createElement('article');
    article.className = 'project-card project-card--image-only';
    article.dataset.navLabel = label;
    article.appendChild(createMediaElement(asset, `Project ${label.toLowerCase()}`));
    return article;
}

function renderProjectVideoProjection(project, asset) {
    removeProjectVideoProjection();
    document.body.dataset.videoProjectionInitialized = '';

    if (!asset || asset.type !== 'video') {
        delete document.body.dataset.videoProjectionDefault;
        delete document.body.dataset.videoProjectionStorage;
        return;
    }

    document.body.dataset.videoProjectionDefault = 'perspective';
    document.body.dataset.videoProjectionStorage = 'off';

    const surfaces = [
        { wall: '.ceiling', face: 'ceiling', className: 'ceiling-content', projected: true },
        { wall: '.floor', face: 'floor', className: 'floor-content', projected: true },
        { wall: '.left-wall', face: 'left', className: 'left-content', projected: true },
        { wall: '.right-wall', face: 'right', className: 'right-content', projected: true },
        { wall: '.back-wall', face: 'back', className: 'project-video-back-content', projected: false, master: true }
    ];

    surfaces.forEach((surface) => {
        const wall = document.querySelector(surface.wall);
        if (!(wall instanceof HTMLElement)) {
            return;
        }

        wall.prepend(createProjectVideoSurface(project, asset, surface));
    });

    if (window.SpaceToSpaceVideoProjection && typeof window.SpaceToSpaceVideoProjection.init === 'function') {
        window.SpaceToSpaceVideoProjection.init();
    }
}

function createProjectVideoSurface(project, asset, surface) {
    const wrapper = document.createElement('div');
    wrapper.className = `zone-content ${surface.className} video-surface project-video-surface${surface.projected ? '' : ' is-flat'}`;

    const video = document.createElement('video');
    video.className = `surface-video ${surface.projected ? 'is-projected' : 'is-flat'}`;
    video.src = asset.path;
    video.autoplay = true;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.dataset.syncVideo = surface.face;
    video.setAttribute('aria-label', `${project.title || 'Project'} ${surface.face} video`);
    if (surface.master) {
        video.dataset.syncMaster = 'true';
    }

    const canvas = document.createElement('canvas');
    canvas.className = `surface-canvas ${surface.projected ? 'is-projected' : 'is-flat'}`;
    canvas.dataset.perspectiveCanvas = surface.face;

    wrapper.appendChild(video);
    wrapper.appendChild(canvas);
    return wrapper;
}

function removeProjectVideoProjection() {
    document.querySelectorAll('.project-video-surface').forEach((surface) => surface.remove());
}

function exposeProjectVideoIntroControls() {
    window.SpaceToSpaceProjectDetail = window.SpaceToSpaceProjectDetail || {};
    window.SpaceToSpaceProjectDetail.beginVideoIntroFadeOut = beginProjectVideoIntroFadeOut;
    window.SpaceToSpaceProjectDetail.revealVideoIntroContent = revealProjectVideoIntroContent;
    window.SpaceToSpaceProjectDetail.settleVideoIntro = settleProjectVideoIntro;
    window.SpaceToSpaceProjectDetail.restoreVideoIntro = restoreProjectVideoIntro;
    window.SpaceToSpaceProjectDetail.completeVideoIntroRestore = completeProjectVideoIntroRestore;
    window.SpaceToSpaceProjectDetail.playVisibleVideos = playVisibleProjectVideos;
}

function beginProjectVideoIntroFadeOut() {
    document.body.classList.add('project-video-intro-transitioning');
}

function revealProjectVideoIntroContent() {
    document.body.classList.add('project-video-content-visible');
    document.body.classList.remove('project-video-intro-active');
}

function settleProjectVideoIntro() {
    document.body.classList.add('project-video-intro-transitioning');
    document.body.classList.add('project-video-content-visible');
    document.body.classList.remove('project-video-intro-active');

    window.setTimeout(() => {
        document.body.classList.remove(
            'project-video-background-page',
            'project-video-intro-transitioning',
            'project-video-content-visible',
            'video-mode-perspective',
            'video-mode-copies'
        );
        document.body.classList.add('project-video-intro-settled');
        delete document.body.dataset.videoProjectionDefault;
        delete document.body.dataset.videoProjectionStorage;
        playVisibleProjectVideos();
    }, 520);
}

function restoreProjectVideoIntro() {
    if (document.querySelectorAll('.project-video-surface').length === 0) {
        return;
    }

    document.body.dataset.videoProjectionDefault = 'perspective';
    document.body.dataset.videoProjectionStorage = 'off';
    document.body.classList.add(
        'project-video-background-page',
        'project-video-intro-restoring',
        'video-mode-perspective'
    );
    document.body.classList.remove(
        'project-video-intro-settled',
        'project-video-intro-transitioning',
        'project-video-content-visible',
        'video-mode-copies'
    );
}

function completeProjectVideoIntroRestore() {
    document.body.classList.add('project-video-intro-active');
    document.body.classList.remove('project-video-intro-restoring');
}

function playVisibleProjectVideos() {
    document.querySelectorAll('.project-page-projects video').forEach((video) => {
        if (!(video instanceof HTMLVideoElement)) {
            return;
        }

        video.muted = true;
        video.playsInline = true;
        video.play().catch(() => {});
    });
}

function syncVideoProjectionDepth(isVideoBackground) {
    if (!isVideoBackground) {
        return;
    }

    const depthSlider = document.getElementById('depthSlider');
    if (!(depthSlider instanceof HTMLInputElement)) {
        return;
    }

    depthSlider.min = '1';
    depthSlider.max = '5000';
    depthSlider.value = '1000';
    depthSlider.dispatchEvent(new Event('input', { bubbles: true }));
}

function createMediaElement(asset, altText) {
    const frame = document.createElement('div');
    frame.className = 'project-media-frame project-focus-trigger';
    frame.setAttribute('role', 'button');
    frame.tabIndex = 0;
    frame.dataset.projectFocusTrigger = 'true';
    frame.dataset.projectFocusKind = asset.type === 'video' ? 'video' : 'image';
    frame.dataset.projectFocusSrc = asset.path;
    frame.dataset.projectFocusLabel = altText;

    frame.appendChild(
        createMediaDebugOverlay(asset.path, {
            showR2Badge: isR2AssetPath(asset.path),
            sizeLabel: typeof asset.bytesHuman === 'string' ? asset.bytesHuman : 'size unavailable'
        })
    );

    if (asset.type === 'video') {
        const video = document.createElement('video');
        video.src = asset.path;
        video.className = 'project-media';
        video.muted = true;
        video.autoplay = true;
        video.loop = true;
        video.playsInline = true;
        video.preload = 'metadata';
        video.setAttribute('aria-label', altText);
        frame.appendChild(video);
        return frame;
    }

    const img = document.createElement('img');
    img.src = asset.path;
    img.alt = altText;
    img.loading = 'eager';
    img.decoding = 'async';
    img.className = 'project-media';
    frame.appendChild(img);
    return frame;
}

function watchProjectContentMetrics(containers) {
    if (projectContentResizeObserver) {
        projectContentResizeObserver.disconnect();
    }

    projectContentResizeObserver = typeof ResizeObserver === 'function'
        ? new ResizeObserver(scheduleProjectContentMetricsRefresh)
        : null;

    containers.forEach((container) => {
        if (projectContentResizeObserver) {
            projectContentResizeObserver.observe(container);
        }

        container.querySelectorAll('img, video').forEach((element) => {
            element.addEventListener('load', scheduleProjectContentMetricsRefresh, { once: true });
            element.addEventListener('error', scheduleProjectContentMetricsRefresh, { once: true });
            element.addEventListener('loadedmetadata', scheduleProjectContentMetricsRefresh, { once: true });
        });
    });
}

function scheduleProjectContentMetricsRefresh() {
    if (projectContentMetricsFrame !== null) {
        return;
    }

    projectContentMetricsFrame = window.requestAnimationFrame(() => {
        projectContentMetricsFrame = null;
        if (
            window.SpaceToSpaceProjectDetail
            && typeof window.SpaceToSpaceProjectDetail.refreshContentMetrics === 'function'
        ) {
            window.SpaceToSpaceProjectDetail.refreshContentMetrics();
        }
    });
}

function createMediaDebugOverlay(assetPath, options = {}) {
    if (window.SpaceToSpaceMediaDebug && typeof window.SpaceToSpaceMediaDebug.createOverlay === 'function') {
        return window.SpaceToSpaceMediaDebug.createOverlay(assetPath, options);
    }

    const overlay = document.createElement('div');
    overlay.className = 'media-debug-overlay';

    if (options.showR2Badge) {
        const badge = document.createElement('span');
        badge.className = 'media-badge-r2';
        badge.textContent = 'R';
        overlay.appendChild(badge);
    }

    return overlay;
}

function isGalleryPreviewAsset(asset, project) {
    const assetPath = normalizeAssetKey(asset.path);
    const sourcePath = normalizeAssetKey(asset.source);
    const previewPath = normalizeAssetKey(project.preview);
    const menuPath = normalizeAssetKey(project.menuAsset);

    return (
        isPreviewPath(assetPath)
        || isPreviewPath(sourcePath)
        || (previewPath && (assetPath.endsWith(previewPath) || sourcePath === previewPath))
        || (menuPath && assetPath === menuPath)
    );
}

function normalizeAssetKey(value) {
    if (typeof value !== 'string') {
        return '';
    }

    return value
        .split('?')[0]
        .split('#')[0]
        .replace(/^assets\//, '')
        .toLowerCase();
}

function isPreviewPath(value) {
    const filename = value.split('/').pop() || '';
    return filename.includes('_preview.') || filename.includes('-preview.') || filename.includes(' preview.');
}

function createContacts(contacts) {
    if (!contacts || typeof contacts !== 'object') {
        return null;
    }

    const items = [contacts.email, contacts.phone].filter((value) => typeof value === 'string' && value.trim() !== '');
    if (items.length === 0) {
        return null;
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'project-contact-list';
    items.forEach((item) => {
        const line = document.createElement('p');
        line.className = 'project-contact-item';
        line.textContent = item;
        wrapper.appendChild(line);
    });
    return wrapper;
}

function createDocumentLinks(project) {
    const resolvedDocuments = Array.isArray(project.resolvedDocuments) ? project.resolvedDocuments : [];
    if (resolvedDocuments.length === 0) {
        return null;
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'project-links';

    resolvedDocuments.forEach((path, index) => {
        const link = document.createElement('a');
        link.href = path;
        link.textContent = `Document ${index + 1}`;
        link.target = '_blank';
        link.rel = 'noreferrer';
        link.dataset.projectFocusTrigger = 'true';
        link.dataset.projectFocusKind = 'document';
        link.dataset.projectFocusSrc = path;
        link.dataset.projectFocusLabel = `Document ${index + 1}`;
        wrapper.appendChild(link);
    });

    return wrapper;
}

function createResourceCard(project) {
    const warnings = Array.isArray(project.warnings) ? project.warnings.filter(Boolean) : [];
    if (warnings.length === 0) {
        return null;
    }

    const article = document.createElement('article');
    article.className = 'project-card project-card--contained';
    article.dataset.navLabel = 'Notes';

    const info = document.createElement('div');
    info.className = 'project-info';

    const title = document.createElement('h2');
    title.textContent = 'Notes';
    info.appendChild(title);

    warnings.forEach((warning) => {
        const paragraph = document.createElement('p');
        paragraph.className = 'project-desc';
        paragraph.textContent = warning;
        info.appendChild(paragraph);
    });

    article.appendChild(info);
    return article;
}

function createEmptyCard(message) {
    const article = document.createElement('article');
    article.className = 'project-card project-card--contained';

    const info = document.createElement('div');
    info.className = 'project-info';

    const title = document.createElement('h2');
    title.textContent = 'Project unavailable';
    info.appendChild(title);

    const desc = document.createElement('p');
    desc.className = 'project-desc';
    desc.textContent = message;
    info.appendChild(desc);

    article.appendChild(info);
    return article;
}

async function loadProjectsPayload() {
    if (window.SpaceToSpaceProjectsData) {
        return window.SpaceToSpaceProjectsData;
    }

    const response = await fetch('data/projects.json');
    if (!response.ok) {
        throw new Error(`Failed to load data: ${response.status}`);
    }

    return response.json();
}

function isR2AssetPath(path) {
    return typeof path === 'string' && path.includes('.r2.dev/');
}

function bindProjectInteractions(containers) {
    containers.forEach((container) => {
        if (container.dataset.projectInteractionsBound === 'true') {
            return;
        }

        container.dataset.projectInteractionsBound = 'true';

        container.addEventListener('click', (event) => {
            const trigger = event.target.closest('[data-project-focus-trigger="true"]');
            if (!(trigger instanceof HTMLElement)) {
                return;
            }

            handleProjectFocusTrigger(trigger, event);
        });

        container.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') {
                return;
            }

            const trigger = event.target.closest('[data-project-focus-trigger="true"]');
            if (!(trigger instanceof HTMLElement)) {
                return;
            }

            handleProjectFocusTrigger(trigger, event);
        });
    });
}

function handleProjectFocusTrigger(trigger, event) {
    event.preventDefault();
    event.stopPropagation();

    const { projectFocusKind: kind, projectFocusSrc: src, projectFocusLabel: label } = trigger.dataset;
    if (!src) {
        return;
    }

    if (window.SpaceToSpaceProjectDetail && typeof window.SpaceToSpaceProjectDetail.focusMedia === 'function') {
        window.SpaceToSpaceProjectDetail.focusMedia({ kind, src, label, trigger });
        return;
    }

    if (kind === 'document') {
        window.open(src, '_blank', 'noopener,noreferrer');
    }
}
