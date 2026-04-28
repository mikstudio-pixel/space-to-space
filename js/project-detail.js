document.addEventListener('DOMContentLoaded', async () => {
    const containers = Array.from(document.querySelectorAll('.home-projects'));
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

        if (window.SpaceToSpaceHome && typeof window.SpaceToSpaceHome.refresh === 'function') {
            window.SpaceToSpaceHome.refresh();
            if (typeof window.SpaceToSpaceHome.playIntro === 'function') {
                window.SpaceToSpaceHome.playIntro();
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
    const infoCard = createInfoCard(project, visualAssets);
    const trailingCards = visualAssets.slice(1).map((asset, index) => createVisualCard(asset, index + 2));
    const cards = [infoCard, ...trailingCards];

    containers.forEach((container) => {
        container.innerHTML = '';
        cards.forEach((card) => {
            container.appendChild(card.cloneNode(true));
        });
    });

    bindProjectInteractions(containers);
}

function normalizeVisualAssets(project) {
    const resolvedAssets = Array.isArray(project.resolvedAssets) ? project.resolvedAssets : [];
    const visuals = resolvedAssets.filter((asset) => asset.type === 'image' || asset.type === 'video');

    if (visuals.length > 0) {
        return visuals;
    }

    const menuAsset = typeof project.menuAsset === 'string' ? project.menuAsset : 'assets/site/video-thumbnail.webp';
    return [
        {
            path: menuAsset,
            type: typeof project.menuAssetType === 'string' && project.menuAssetType === 'video' ? 'video' : 'image',
            source: menuAsset,
            bytes: Number.isFinite(project.menuAssetBytes) ? project.menuAssetBytes : 0,
            bytesHuman: typeof project.menuAssetBytesHuman === 'string' ? project.menuAssetBytesHuman : 'size unavailable',
        },
    ];
}

function createInfoCard(project, visualAssets) {
    const article = document.createElement('article');
    article.className = 'project-card project-card--contained';
    article.dataset.navLabel = project.title || 'Project';

    if (visualAssets.length > 0) {
        const grid = document.createElement('div');
        grid.className = 'project-media-grid';
        grid.setAttribute('aria-label', `${project.title || 'Project'} gallery`);

        visualAssets.slice(0, 5).forEach((asset, index) => {
            const element = createMediaElement(asset, `${project.title || 'Project'} ${index + 1}`, true);
            grid.appendChild(element);
        });
        article.appendChild(grid);
    }

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

function createVisualCard(asset, index) {
    const article = document.createElement('article');
    article.className = 'project-card project-card--image-only';
    article.dataset.navLabel = `Media ${index}`;
    article.appendChild(createMediaElement(asset, `Project media ${index}`, false));
    return article;
}

function createMediaElement(asset, altText, isGrid) {
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
    img.loading = isGrid ? 'eager' : 'lazy';
    img.decoding = 'async';
    img.className = 'project-media';
    frame.appendChild(img);
    return frame;
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

    if (window.SpaceToSpaceHome && typeof window.SpaceToSpaceHome.focusMedia === 'function') {
        window.SpaceToSpaceHome.focusMedia({ kind, src, label, trigger });
        return;
    }

    if (kind === 'document') {
        window.open(src, '_blank', 'noopener,noreferrer');
    }
}
