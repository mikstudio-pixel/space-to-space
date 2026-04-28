document.addEventListener('DOMContentLoaded', async () => {
    const body = document.body;
    const params = new URLSearchParams(window.location.search);
    const scene = document.querySelector('.scene');
    const intro = document.querySelector('.gallery-intro');
    const introTitle = document.querySelector('.gallery-intro-title');
    const room = document.querySelector('.room');
    const backWall = document.querySelector('.back-wall');
    const outlineNav = document.querySelector('.outline-nav');
    const outlineNavItems = document.querySelector('.outline-nav-items');
    const outlineNavCategories = document.querySelector('.outline-nav-categories');
    const outlineNavSelectedCategory = document.querySelector('.outline-nav-selected-category');
    const outlineNavFooter = document.querySelector('.outline-nav-footer');
    const status = document.getElementById('projectMenuStatus');

    const svgLines = {
        tl: document.querySelector('.depth-line.tl'),
        tr: document.querySelector('.depth-line.tr'),
        bl: document.querySelector('.depth-line.bl'),
        br: document.querySelector('.depth-line.br')
    };
    const backRect = document.querySelector('.back-rect');

    const spacing = 1400;
    const startOffset = 120;
    const positions = ['pos-center', 'pos-tl', 'pos-tr', 'pos-bl', 'pos-br'];
    const renderedTunnelSegments = 12;
    const maxRenderedScrollDistance = spacing * (renderedTunnelSegments + 2);
    const mediaAttachDistance = spacing * 7.05;
    const mediaDetachDistance = spacing * 9.75;
    const mediaAttachBatchSize = 1;
    const minProjectedPlaneSize = 2;
    const minBackWireframeSize = 2;
    const scrollEpsilon = 0.01;
    const mediaUpdateThreshold = spacing * 0.35;
    const stackingUpdateThreshold = spacing * 0.2;
    const outlineNavConfig = {
        defaultGap: 12,
        minGap: 0,
        itemHeight: 12,
        viewportMargin: 96,
        maxHeightRatio: 0.85,
        stackGap: 14,
        footerReservedHeight: 108
    };
    const categoryTransitionConfig = {
        hideStepMs: 42,
        showStepMs: 56,
        settleMs: 240,
        switchPauseMs: 90
    };
    const outlineRevealConfig = {
        initialDelayMs: 40,
        stepMs: 26
    };
    const introConfig = {
        duration: 3000,
        startPerspective: 18000,
        endPerspective: 1200,
        startSceneOpacity: 0.04,
        endSceneOpacity: 1,
        startWireframeOpacity: 0.08,
        endWireframeOpacity: 1,
        startRoomOffset: 2200,
        titleStartScale: 1,
        titleEndScale: 0.88,
        titleStartZ: 0,
        titleEndZ: -1400,
        titleStartLetterSpacing: 0.02,
        titleEndLetterSpacing: 0.12,
        titleFadeStart: 0.48,
        titleFadeEnd: 0.94
    };

    const wireframeOverlay = document.querySelector('.wireframe-overlay');
    const isWireframeVisible = wireframeOverlay && window.getComputedStyle(wireframeOverlay).display !== 'none';
    const shouldPlayIntro = !['0', 'false', 'skip'].includes((params.get('intro') || '').toLowerCase());

    let projects = [];
    let galleryOutlineButtons = [];
    let galleryCategoryButtons = [];
    let visibleProjectIndexes = [];
    let visibleProjectLookup = new Map();
    let galleryOutlineIdleTimer = null;
    let projectPlanes = [];
    let queuedMediaAttachIndexes = new Set();
    let pendingMediaAttachQueue = [];
    let mediaAttachFrame = null;
    let lastTouchY = null;
    let galleryAnimationFrame = null;
    let activeOutlineIndex = -1;
    let lastMediaUpdateScrollZ = Number.NaN;
    let lastStackingUpdateScrollZ = Number.NaN;
    let lastStackingNearestIndex = -1;
    let categoryTransitionToken = 0;
    let outlineRevealToken = 0;
    let isCategoryTransitionActive = false;
    const wheelSpeed = 2.5;
    const touchMultiplier = 3;
    const categoryState = {
        isOpen: false,
        selectedCategory: null
    };

    const state = {
        scrollZ: 0,
        targetScrollZ: 0,
        maxScroll: 0,
        roomDepth: 7000,
        roomZ: 0,
        roomHeight: window.innerHeight,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        scenePerspective: introConfig.endPerspective,
        introActive: Boolean(body && scene && intro && introTitle && shouldPlayIntro),
        introAnimationDone: false
    };

    body.classList.toggle('dark-mode', document.documentElement.classList.contains('dark-mode'));

    try {
        const payload = await loadProjectsPayload();
        const works = Array.isArray(payload.works) ? payload.works : [];
        const eligibleWorks = works.filter((work) => work && typeof work.slug === 'string');
        projects = eligibleWorks.map((work, index) => ({
            slug: work.slug,
            title: work.title || `Project ${index + 1}`,
            category: typeof work.category === 'string'
                ? work.category.trim()
                : '',
            menuAsset: work.menuAsset || 'assets/site/video-thumbnail.webp',
            menuAssetType: work.menuAssetType || 'image',
            menuAssetBytes: Number.isFinite(work.menuAssetBytes) ? work.menuAssetBytes : 0,
            menuAssetBytesHuman: typeof work.menuAssetBytesHuman === 'string' ? work.menuAssetBytesHuman : 'size unavailable',
            menuAssetIsR2: isR2AssetPath(work.menuAsset),
            position: positions[index % positions.length],
            url: `home.html?slug=${encodeURIComponent(work.slug)}`
        }));

        if (projects.length === 0) {
            throw new Error('No projects available for the menu.');
        }

        state.maxScroll = (projects.length + 2) * spacing;
        state.roomDepth = renderedTunnelSegments * spacing;

        setIntroInitialState();
        initGallery();
        runGalleryIntro();

        if (status) {
            status.hidden = true;
            status.textContent = '';
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        if (status) {
            status.hidden = false;
            status.textContent = message;
        }
        body.classList.remove('gallery-intro-active');
        resetIntroStyles();
    }

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function lerp(start, end, t) {
        return start + (end - start) * t;
    }

    function wait(ms) {
        return new Promise((resolve) => {
            window.setTimeout(resolve, ms);
        });
    }

    function easeInOutCubic(t) {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    function getBaseRoomZ() {
        return state.roomDepth / -2;
    }

    function setRoomPosition(zPos) {
        state.roomZ = zPos;
        room.style.transform = `translateZ(${zPos}px)`;
    }

    function applyIntroStyles(progress) {
        const clamped = clamp(progress, 0, 1);
        const eased = easeInOutCubic(clamped);
        const scenePerspective = lerp(introConfig.startPerspective, introConfig.endPerspective, eased);
        const titleFadeProgress = clamp(
            (clamped - introConfig.titleFadeStart) / (introConfig.titleFadeEnd - introConfig.titleFadeStart),
            0,
            1
        );
        const introFade = 1 - easeInOutCubic(titleFadeProgress);

        state.scenePerspective = scenePerspective;
        body.style.setProperty('--gallery-scene-perspective', `${scenePerspective}px`);
        body.style.setProperty('--gallery-intro-perspective', `${scenePerspective}px`);
        body.style.setProperty('--gallery-scene-opacity', lerp(introConfig.startSceneOpacity, introConfig.endSceneOpacity, eased).toFixed(4));
        body.style.setProperty('--gallery-wireframe-opacity', lerp(introConfig.startWireframeOpacity, introConfig.endWireframeOpacity, eased).toFixed(4));
        body.style.setProperty('--gallery-intro-opacity', introFade.toFixed(4));
        body.style.setProperty('--gallery-intro-scale', lerp(introConfig.titleStartScale, introConfig.titleEndScale, eased).toFixed(4));
    }

    function resetIntroStyles() {
        state.scenePerspective = introConfig.endPerspective;
        body.style.setProperty('--gallery-scene-perspective', `${introConfig.endPerspective}px`);
        body.style.setProperty('--gallery-intro-perspective', `${introConfig.endPerspective}px`);
        body.style.setProperty('--gallery-scene-opacity', '1');
        body.style.setProperty('--gallery-wireframe-opacity', '1');
        body.style.setProperty('--gallery-intro-opacity', '0');
        body.style.setProperty('--gallery-intro-scale', '0.88');
    }

    function setIntroInitialState() {
        if (!state.introActive) {
            resetIntroStyles();
            return;
        }

        body.classList.add('gallery-intro-active');
        applyIntroStyles(0);
        setRoomPosition(getBaseRoomZ() + introConfig.startRoomOffset);
    }

    function finishGalleryIntro() {
        state.introActive = false;
        state.introAnimationDone = true;
        body.classList.remove('gallery-intro-active');
        resetIntroStyles();
        setRoomPosition(getBaseRoomZ());
        refreshGalleryScene({
            forceMedia: true,
            forceStacking: true,
            forceOutline: true,
            includeWireframe: true
        });
        void animateOutlineNavReveal();
    }

    function runGalleryIntro() {
        if (!state.introActive) {
            finishGalleryIntro();
            return;
        }

        const startTime = performance.now();

        function animateIntro(now) {
            const elapsed = now - startTime;
            const progress = clamp(elapsed / introConfig.duration, 0, 1);
            const eased = easeInOutCubic(progress);

            applyIntroStyles(progress);
            setRoomPosition(lerp(getBaseRoomZ() + introConfig.startRoomOffset, getBaseRoomZ(), eased));
            // Scroll position doesn't change during intro, so partition transforms,
            // media attach distances, stacking order and outline nav state are all
            // identical to what initGallery() already set up. The only thing that
            // depends on the animated perspective/room position is the SVG wireframe.
            updateWireframe();

            if (progress < 1) {
                requestAnimationFrame(animateIntro);
                return;
            }

            finishGalleryIntro();
        }

        requestAnimationFrame(animateIntro);
    }

    function initGallery() {
        document.documentElement.style.setProperty('--room-depth', `${state.roomDepth}px`);
        projectPlanes = [];

        projects.forEach((project, index) => {
            const partition = document.createElement('div');
            partition.className = 'wall partition';
            partition.style.width = 'var(--room-width)';
            partition.style.height = 'var(--room-height)';

            const card = document.createElement('a');
            card.className = `gallery-card ${project.position}`;
            card.href = project.url;
            card.dataset.visibilityState = 'future';
            card.dataset.filterTransitionState = 'visible';

            const media = createGalleryMedia(project);
            const title = document.createElement('h2');
            title.textContent = project.title;

            card.appendChild(media.shell);
            card.appendChild(title);
            partition.appendChild(card);
            room.insertBefore(partition, backWall);
            const plane = {
                partition,
                card,
                index,
                localZ: 0,
                mediaShell: media.shell,
                mediaPlaceholder: media.placeholder,
                mediaElement: media.element,
                mediaSource: media.source,
                mediaType: media.type,
                mediaState: 'detached',
                mediaReady: false,
                isCulled: false,
                isRendered: true,
                zIndex: null
            };
            bindProjectMediaState(plane);
            syncProjectMediaState(plane);
            projectPlanes.push(plane);
        });

        buildGalleryOutlineNav();
        buildGalleryCategoryNav();
        setGalleryCategoryMenuOpen(false);
        if (outlineNavSelectedCategory && !outlineNavSelectedCategory.dataset.bound) {
            outlineNavSelectedCategory.dataset.bound = 'true';
            outlineNavSelectedCategory.addEventListener('click', () => {
                if (!categoryState.selectedCategory) {
                    return;
                }
                pingGalleryOutlineNav();
                void runCategoryFilterTransition(null);
            });
        }
        if (outlineNavFooter && !outlineNavFooter.dataset.bound) {
            outlineNavFooter.dataset.bound = 'true';
            outlineNavFooter.addEventListener('click', () => {
                setGalleryCategoryMenuOpen(!categoryState.isOpen);
            });
        }
        refreshGalleryScene({
            forceMedia: true,
            forceStacking: true,
            forceOutline: true
        });
        scheduleInitialWireframePaint();
    }

    function createGalleryMedia(project) {
        const shell = document.createElement('div');
        shell.className = 'gallery-card-media-shell';

        const placeholder = document.createElement('span');
        placeholder.className = 'gallery-card-media-placeholder';
        placeholder.setAttribute('aria-hidden', 'true');
        shell.appendChild(placeholder);

        shell.appendChild(
            createMediaDebugOverlay(project.menuAsset, {
                showR2Badge: project.menuAssetIsR2,
                sizeLabel: project.menuAssetBytesHuman
            })
        );

        if (project.menuAssetType === 'video') {
            const video = document.createElement('video');
            video.className = 'gallery-card-image';
            video.muted = true;
            video.autoplay = true;
            video.loop = true;
            video.playsInline = true;
            video.preload = 'none';
            video.dataset.src = project.menuAsset;
            shell.appendChild(video);
            return {
                shell,
                placeholder,
                element: video,
                source: project.menuAsset,
                type: 'video'
            };
        }

        const img = document.createElement('img');
        img.alt = project.title;
        img.className = 'gallery-card-image';
        img.loading = 'lazy';
        img.decoding = 'async';
        img.dataset.src = project.menuAsset;
        shell.appendChild(img);
        return {
            shell,
            placeholder,
            element: img,
            source: project.menuAsset,
            type: 'image'
        };
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

    function bindProjectMediaState(plane) {
        const markReady = () => {
            if (plane.mediaState !== 'attached') {
                return;
            }
            plane.mediaReady = true;
            syncProjectMediaState(plane);
        };

        const markPending = () => {
            plane.mediaReady = false;
            syncProjectMediaState(plane);
        };

        if (plane.mediaType === 'video') {
            plane.mediaElement.addEventListener('loadeddata', markReady);
            plane.mediaElement.addEventListener('emptied', markPending);
            plane.mediaElement.addEventListener('error', markPending);
            return;
        }

        plane.mediaElement.addEventListener('load', markReady);
        plane.mediaElement.addEventListener('error', markPending);
    }

    function syncProjectMediaState(plane) {
        const readyValue = plane.mediaReady ? 'true' : 'false';
        plane.card.dataset.mediaState = plane.mediaState;
        plane.card.dataset.mediaReady = readyValue;
        plane.mediaShell.dataset.mediaState = plane.mediaState;
        plane.mediaShell.dataset.mediaReady = readyValue;
        plane.mediaElement.dataset.mediaState = plane.mediaState;
        plane.mediaElement.dataset.mediaReady = readyValue;
    }

    function cancelQueuedProjectMedia(plane) {
        if (!queuedMediaAttachIndexes.has(plane.index)) {
            return;
        }

        queuedMediaAttachIndexes.delete(plane.index);
        pendingMediaAttachQueue = pendingMediaAttachQueue.filter((queuedPlane) => queuedPlane.index !== plane.index);

        if (pendingMediaAttachQueue.length === 0 && mediaAttachFrame !== null) {
            window.cancelAnimationFrame(mediaAttachFrame);
            mediaAttachFrame = null;
        }
    }

    function flushPendingMediaAttachQueue() {
        mediaAttachFrame = null;

        let attachedCount = 0;
        while (pendingMediaAttachQueue.length > 0 && attachedCount < mediaAttachBatchSize) {
            const plane = pendingMediaAttachQueue.shift();
            queuedMediaAttachIndexes.delete(plane.index);

            if (plane.mediaState === 'attached') {
                continue;
            }

            attachProjectMedia(plane);
            attachedCount += 1;
        }

        if (pendingMediaAttachQueue.length > 0) {
            mediaAttachFrame = window.requestAnimationFrame(flushPendingMediaAttachQueue);
        }
    }

    function queueProjectMediaAttach(plane, skipSort = false) {
        if (plane.mediaState === 'attached' || queuedMediaAttachIndexes.has(plane.index)) {
            return;
        }

        queuedMediaAttachIndexes.add(plane.index);
        pendingMediaAttachQueue.push(plane);
        if (!skipSort) {
            pendingMediaAttachQueue.sort((planeA, planeB) => {
                const targetScrollA = getProjectTargetScroll(planeA.index);
                const targetScrollB = getProjectTargetScroll(planeB.index);
                const distanceA = targetScrollA === null ? Number.POSITIVE_INFINITY : Math.abs(targetScrollA - state.scrollZ);
                const distanceB = targetScrollB === null ? Number.POSITIVE_INFINITY : Math.abs(targetScrollB - state.scrollZ);
                return distanceA - distanceB;
            });
        }

        if (mediaAttachFrame === null) {
            mediaAttachFrame = window.requestAnimationFrame(flushPendingMediaAttachQueue);
        }
    }

    function attachProjectMedia(plane) {
        if (plane.mediaState === 'attached') {
            return;
        }

        const targetScroll = getProjectTargetScroll(plane.index);
        if (targetScroll === null) {
            return;
        }

        const distance = Math.abs(targetScroll - state.scrollZ);
        plane.mediaState = 'attached';
        plane.mediaReady = false;
        syncProjectMediaState(plane);

        if (plane.mediaType === 'video') {
            plane.mediaElement.preload = 'metadata';
            plane.mediaElement.src = plane.mediaSource;
            plane.mediaElement.load();
            void plane.mediaElement.play().catch(() => {});
            return;
        }

        plane.mediaElement.fetchPriority = distance <= spacing ? 'high' : 'low';
        plane.mediaElement.src = plane.mediaSource;
        if (plane.mediaElement.complete && plane.mediaElement.naturalWidth > 0) {
            plane.mediaReady = true;
            syncProjectMediaState(plane);
        }
    }

    function detachProjectMedia(plane) {
        if (plane.mediaState === 'detached') {
            return;
        }

        cancelQueuedProjectMedia(plane);

        if (plane.mediaType === 'video') {
            plane.mediaElement.pause();
            plane.mediaElement.preload = 'none';
            plane.mediaElement.removeAttribute('src');
            plane.mediaElement.load();
        } else {
            plane.mediaElement.removeAttribute('src');
        }

        plane.mediaState = 'detached';
        plane.mediaReady = false;
        syncProjectMediaState(plane);
    }

    function updateVisibleProjectMedia() {
        if (projectPlanes.length === 0) {
            return;
        }

        const attachablePlanes = [];
        projectPlanes.forEach((plane) => {
            const targetScroll = getProjectTargetScroll(plane.index);
            if (targetScroll === null) {
                detachProjectMedia(plane);
                return;
            }

            const distance = Math.abs(targetScroll - state.scrollZ);
            if (distance <= mediaAttachDistance) {
                attachablePlanes.push(plane);
                return;
            }

            if (distance >= mediaDetachDistance) {
                detachProjectMedia(plane);
            }
        });

        attachablePlanes.sort((planeA, planeB) => {
            const distanceA = Math.abs(getProjectTargetScroll(planeA.index) - state.scrollZ);
            const distanceB = Math.abs(getProjectTargetScroll(planeB.index) - state.scrollZ);
            return distanceA - distanceB;
        });
        attachablePlanes.forEach((plane) => {
            queueProjectMediaAttach(plane, true);
        });

        lastMediaUpdateScrollZ = state.scrollZ;
    }

    function getPlaneLocalZ(index) {
        const targetScroll = getProjectTargetScroll(index);
        if (targetScroll === null) {
            return null;
        }

        return (state.roomDepth / 2) - (targetScroll - state.scrollZ);
    }

    function updateProjectPlaneTransforms() {
        if (projectPlanes.length === 0) {
            return;
        }

        projectPlanes.forEach((plane) => {
            const targetScroll = getProjectTargetScroll(plane.index);
            if (targetScroll === null) {
                if (plane.isRendered) {
                    plane.isRendered = false;
                    plane.partition.style.display = 'none';
                }
                if (plane.mediaState === 'attached') {
                    detachProjectMedia(plane);
                }
                plane.isCulled = true;
                plane.partition.style.visibility = 'hidden';
                return;
            }

            const scrollDistance = targetScroll - state.scrollZ;
            const shouldRender = Math.abs(scrollDistance) <= maxRenderedScrollDistance;

            if (plane.isRendered !== shouldRender) {
                plane.isRendered = shouldRender;
                plane.partition.style.display = shouldRender ? 'block' : 'none';
            }

            if (!shouldRender) {
                if (plane.mediaState === 'attached') {
                    detachProjectMedia(plane);
                }
                plane.isCulled = true;
                return;
            }

            const localZ = getPlaneLocalZ(plane.index);
            if (localZ === null) {
                plane.isCulled = true;
                plane.partition.style.visibility = 'hidden';
                return;
            }
            if (Math.abs(localZ - plane.localZ) < 0.01) {
                return;
            }

            plane.localZ = localZ;
            plane.partition.style.transform = `translateZ(${localZ}px)`;
        });
    }

    function projectPlaneToViewport(zPos, viewportWidth, viewportHeight, perspective, minSize = 0) {
        const denominator = perspective - zPos;
        if (!Number.isFinite(denominator) || denominator <= 0.5) {
            return null;
        }

        const scale = perspective / denominator;
        if (!Number.isFinite(scale) || scale <= 0) {
            return null;
        }

        const projectedWidth = Math.max(viewportWidth * scale, minSize);
        const projectedHeight = Math.max(viewportHeight * scale, minSize);
        const left = (viewportWidth - projectedWidth) / 2;
        const top = (viewportHeight - projectedHeight) / 2;

        return {
            left,
            top,
            right: left + projectedWidth,
            bottom: top + projectedHeight,
            width: projectedWidth,
            height: projectedHeight
        };
    }

    function updateProjectPlaneVisibility() {
        if (projectPlanes.length === 0) {
            return;
        }

        const perspective = state.scenePerspective;
        const viewportWidth = state.viewportWidth;
        const viewportHeight = state.viewportHeight;

        projectPlanes.forEach((plane) => {
            if (!plane.isRendered) {
                plane.partition.style.visibility = 'hidden';
                return;
            }

            const projection = projectPlaneToViewport(
                state.roomZ + plane.localZ,
                viewportWidth,
                viewportHeight,
                perspective
            );
            const isCulled = !projection
                || projection.width < minProjectedPlaneSize
                || projection.height < minProjectedPlaneSize;

            if (plane.isCulled === isCulled) {
                return;
            }

            plane.isCulled = isCulled;
            plane.partition.style.visibility = isCulled ? 'hidden' : 'visible';
        });
    }

    function scheduleInitialWireframePaint() {
        updateWireframe();
        requestAnimationFrame(() => {
            updateWireframe();
            requestAnimationFrame(updateWireframe);
        });
    }

    function getNearestProjectIndex(scrollZ = state.scrollZ) {
        if (visibleProjectIndexes.length === 0) {
            return -1;
        }

        const visibleIndex = clamp(
            Math.round((scrollZ - startOffset) / spacing),
            0,
            visibleProjectIndexes.length - 1
        );
        return visibleProjectIndexes[visibleIndex];
    }

    function shouldUpdateVisibleProjectMedia(force = false) {
        return force
            || !Number.isFinite(lastMediaUpdateScrollZ)
            || Math.abs(state.scrollZ - lastMediaUpdateScrollZ) >= mediaUpdateThreshold;
    }

    function shouldUpdateProjectPlaneStacking(nearestIndex, force = false) {
        return force
            || !Number.isFinite(lastStackingUpdateScrollZ)
            || nearestIndex !== lastStackingNearestIndex
            || Math.abs(state.scrollZ - lastStackingUpdateScrollZ) >= stackingUpdateThreshold;
    }

    function refreshGalleryScene({
        forceMedia = false,
        forceStacking = false,
        forceOutline = false,
        includeWireframe = false
    } = {}) {
        updateProjectPlaneTransforms();
        updateProjectPlaneVisibility();

        const nearestIndex = getNearestProjectIndex();
        if (shouldUpdateVisibleProjectMedia(forceMedia)) {
            updateVisibleProjectMedia();
        }

        if (shouldUpdateProjectPlaneStacking(nearestIndex, forceStacking)) {
            updateProjectPlaneStacking(nearestIndex);
        }

        if (forceOutline || nearestIndex !== activeOutlineIndex) {
            updateGalleryOutlineNavActive(nearestIndex);
        }

        if (includeWireframe) {
            updateWireframe();
        }
    }

    function requestGalleryRender() {
        if (galleryAnimationFrame !== null || state.introActive) {
            return;
        }

        galleryAnimationFrame = window.requestAnimationFrame(animate);
    }

    function getProjectTargetScroll(index) {
        const visibleIndex = visibleProjectLookup.get(index);
        if (typeof visibleIndex !== 'number') {
            return null;
        }

        return Math.max(0, Math.min(visibleIndex * spacing + startOffset, state.maxScroll));
    }

    function pingGalleryOutlineNav() {
        if (!outlineNav) {
            return;
        }

        outlineNav.classList.add('is-engaged');
        if (galleryOutlineIdleTimer !== null) {
            window.clearTimeout(galleryOutlineIdleTimer);
        }
        galleryOutlineIdleTimer = window.setTimeout(() => {
            outlineNav.classList.remove('is-engaged');
            galleryOutlineIdleTimer = null;
        }, 1200);
    }

    function getVisibleOutlineEntries() {
        return galleryOutlineButtons.filter((entry) => !entry.button.hidden);
    }

    function setOutlineEntriesRevealState(entries, revealState) {
        entries.forEach((entry) => {
            entry.button.dataset.outlineRevealState = revealState;
        });
    }

    async function animateOutlineNavReveal() {
        if (galleryOutlineButtons.length === 0) {
            return;
        }

        const token = ++outlineRevealToken;
        const visibleEntries = getVisibleOutlineEntries();
        setOutlineEntriesRevealState(visibleEntries, 'hidden');
        await wait(outlineRevealConfig.initialDelayMs);

        for (const entry of visibleEntries) {
            if (token !== outlineRevealToken) {
                return;
            }

            entry.button.dataset.outlineRevealState = 'visible';
            await wait(outlineRevealConfig.stepMs);
        }
    }

    function getProjectIndexesForCategory(selectedCategory = categoryState.selectedCategory) {
        const nextIndexes = [];

        projects.forEach((project, index) => {
            if (selectedCategory && project.category !== selectedCategory) {
                return;
            }

            nextIndexes.push(index);
        });

        return nextIndexes;
    }

    function rebuildVisibleProjectIndexes() {
        visibleProjectIndexes = getProjectIndexesForCategory();
        visibleProjectLookup = new Map();

        visibleProjectIndexes.forEach((index, visibleIndex) => {
            visibleProjectLookup.set(index, visibleIndex);
        });

        state.maxScroll = Math.max(0, (visibleProjectIndexes.length + 2) * spacing);
        state.scrollZ = clamp(state.scrollZ, 0, state.maxScroll);
        state.targetScrollZ = clamp(state.targetScrollZ, 0, state.maxScroll);
    }

    function getAnimatedProjectIndexes(indexes) {
        return indexes.filter((index) => {
            const plane = projectPlanes[index];
            return plane
                && plane.partition.style.display !== 'none'
                && plane.partition.style.visibility !== 'hidden';
        });
    }

    function setProjectFilterTransitionState(indexes, transitionState) {
        indexes.forEach((index) => {
            const plane = projectPlanes[index];
            if (!plane) {
                return;
            }

            plane.card.dataset.filterTransitionState = transitionState;
        });
    }

    async function animateProjectFilterOut(indexes, token) {
        const animatedIndexes = getAnimatedProjectIndexes(indexes);
        for (const index of animatedIndexes) {
            if (token !== categoryTransitionToken) {
                return false;
            }

            setProjectFilterTransitionState([index], 'hiding');
            await wait(categoryTransitionConfig.hideStepMs);
        }

        if (animatedIndexes.length > 0) {
            await wait(categoryTransitionConfig.settleMs);
        }

        if (token !== categoryTransitionToken) {
            return false;
        }

        setProjectFilterTransitionState(indexes, 'hidden');
        return true;
    }

    async function animateProjectFilterIn(indexes, token) {
        const animatedIndexes = getAnimatedProjectIndexes(indexes);
        for (const index of animatedIndexes) {
            if (token !== categoryTransitionToken) {
                return false;
            }

            setProjectFilterTransitionState([index], 'showing');
            await wait(categoryTransitionConfig.showStepMs);
        }

        if (animatedIndexes.length > 0) {
            await wait(categoryTransitionConfig.settleMs);
        }

        if (token !== categoryTransitionToken) {
            return false;
        }

        setProjectFilterTransitionState(indexes, 'visible');
        return true;
    }

    async function animateScrollTo(targetScroll, token) {
        state.targetScrollZ = clamp(targetScroll, 0, state.maxScroll);
        requestGalleryRender();

        while (Math.abs(state.targetScrollZ - state.scrollZ) > scrollEpsilon) {
            if (token !== categoryTransitionToken) {
                return false;
            }

            await wait(16);
        }

        state.scrollZ = state.targetScrollZ;
        return true;
    }

    async function runCategoryFilterTransition(nextCategory) {
        if (categoryState.selectedCategory === nextCategory) {
            setGalleryCategoryMenuOpen(false);
            return;
        }

        const previousVisibleIndexes = visibleProjectIndexes.slice();
        const token = ++categoryTransitionToken;
        isCategoryTransitionActive = true;
        body.classList.add('gallery-filter-transitioning');
        state.targetScrollZ = state.scrollZ;
        setGalleryCategoryMenuOpen(false);
        categoryState.selectedCategory = nextCategory;
        updateGalleryCategoryNavState();
        syncOutlineNavFooter();

        const hideCompleted = await animateProjectFilterOut(previousVisibleIndexes, token);
        if (!hideCompleted || token !== categoryTransitionToken) {
            return;
        }

        const scrollCompleted = await animateScrollTo(0, token);
        if (!scrollCompleted || token !== categoryTransitionToken) {
            return;
        }

        const nextVisibleIndexes = getProjectIndexesForCategory(nextCategory);
        setProjectFilterTransitionState(nextVisibleIndexes, 'hidden');
        applyGalleryCategoryFilter({ snapToCategory: false, revealState: 'hidden' });
        await wait(categoryTransitionConfig.switchPauseMs);

        if (token !== categoryTransitionToken) {
            return;
        }

        const showCompleted = await animateProjectFilterIn(nextVisibleIndexes, token);
        if (!showCompleted || token !== categoryTransitionToken) {
            return;
        }

        refreshGalleryScene({
            forceMedia: true,
            forceStacking: true,
            forceOutline: true,
            includeWireframe: true
        });
        isCategoryTransitionActive = false;
        body.classList.remove('gallery-filter-transitioning');
        void animateOutlineNavReveal();
    }

    function syncOutlineNavFooter() {
        if (!outlineNavFooter) {
            return;
        }

        const footerLabel = 'categories';
        const footerLabelElement = outlineNavFooter.querySelector('.outline-nav-footer-label');
        if (footerLabelElement) {
            footerLabelElement.textContent = footerLabel;
        }
        outlineNavFooter.setAttribute(
            'aria-label',
            categoryState.selectedCategory
                ? `categories, selected ${categoryState.selectedCategory}`
                : footerLabel
        );
        outlineNavFooter.classList.toggle('is-selected', Boolean(categoryState.selectedCategory));
        outlineNavFooter.setAttribute('aria-expanded', categoryState.isOpen ? 'true' : 'false');

        if (outlineNavSelectedCategory) {
            const selectedCategoryLabel = outlineNavSelectedCategory.querySelector('.outline-nav-selected-category-label');
            if (selectedCategoryLabel) {
                selectedCategoryLabel.textContent = categoryState.selectedCategory || '';
            }
            outlineNavSelectedCategory.classList.toggle('is-visible', Boolean(categoryState.selectedCategory));
            outlineNavSelectedCategory.setAttribute(
                'aria-label',
                categoryState.selectedCategory
                    ? `Clear selected category ${categoryState.selectedCategory}`
                    : 'No category selected'
            );
        }
    }

    function updateGalleryCategoryNavState() {
        galleryCategoryButtons.forEach(({ button, category }) => {
            button.classList.toggle('is-selected', category === categoryState.selectedCategory);
        });
    }

    function setGalleryCategoryMenuOpen(isOpen) {
        categoryState.isOpen = isOpen;
        outlineNav?.classList.toggle('is-category-open', isOpen);
        outlineNavCategories?.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
        syncOutlineNavFooter();
        updateGalleryCategoryNavState();
    }

    function applyGalleryCategoryFilter({ snapToCategory = false, revealState = 'visible' } = {}) {
        const selectedCategory = categoryState.selectedCategory;

        galleryOutlineButtons.forEach((entry) => {
            const isVisible = !selectedCategory || entry.category === selectedCategory;
            entry.button.hidden = !isVisible;
            entry.button.setAttribute('aria-hidden', isVisible ? 'false' : 'true');
            entry.button.dataset.outlineRevealState = isVisible ? revealState : 'hidden';
        });

        rebuildVisibleProjectIndexes();

        if (snapToCategory) {
            state.scrollZ = 0;
            state.targetScrollZ = 0;
        }

        updateGalleryOutlineNavLayout();
        updateGalleryOutlineNavActive();
        updateGalleryCategoryNavState();
        syncOutlineNavFooter();
        refreshGalleryScene({
            forceMedia: true,
            forceStacking: true,
            forceOutline: true,
            includeWireframe: true
        });
    }

    function updateGalleryOutlineNavActive(activeIndex = getNearestProjectIndex()) {
        if (galleryOutlineButtons.length === 0) {
            return;
        }

        activeOutlineIndex = activeIndex;
        galleryOutlineButtons.forEach((entry) => {
            const isActive = !entry.button.hidden && entry.index === activeIndex;
            entry.button.classList.toggle('is-active', isActive);
        });
    }

    function updateGalleryOutlineNavLayout() {
        if (!outlineNavItems || galleryOutlineButtons.length === 0) {
            return;
        }

        const visibleEntries = getVisibleOutlineEntries();
        const itemCount = Math.max(visibleEntries.length, 1);
        const viewportHeight = window.innerHeight;
        const totalMaxHeight = Math.max(
            outlineNavConfig.itemHeight,
            (viewportHeight - outlineNavConfig.viewportMargin) * outlineNavConfig.maxHeightRatio
        );
        const footerHeight = outlineNavFooter
            ? Math.max(outlineNavFooter.getBoundingClientRect().height, outlineNavConfig.footerReservedHeight)
            : outlineNavConfig.footerReservedHeight;
        const footerReservedHeight = footerHeight + outlineNavConfig.stackGap;
        const availableHeight = Math.max(
            outlineNavConfig.itemHeight,
            totalMaxHeight - footerReservedHeight
        );
        const resolvedGap = clamp(
            (availableHeight / itemCount) - outlineNavConfig.itemHeight,
            outlineNavConfig.minGap,
            outlineNavConfig.defaultGap
        );
        const itemHitHeight = outlineNavConfig.itemHeight + resolvedGap;

        outlineNav?.style.setProperty('--outline-nav-total-max-height', `${totalMaxHeight}px`);
        outlineNav?.style.setProperty('--outline-nav-max-height', `${availableHeight}px`);
        outlineNavItems.style.setProperty('--outline-nav-gap', `${resolvedGap}px`);
        outlineNavItems.style.setProperty('--outline-nav-max-height', `${availableHeight}px`);
        outlineNavItems.style.setProperty('--outline-nav-item-hit-height', `${itemHitHeight}px`);
        outlineNavCategories?.style.setProperty('--outline-nav-max-height', `${availableHeight}px`);
    }

    function updateProjectPlaneStacking(nearestIndex = getNearestProjectIndex()) {
        if (projectPlanes.length === 0) {
            return;
        }

        projectPlanes.forEach((plane) => {
            let visibilityState = 'future';
            if (plane.index < nearestIndex) {
                visibilityState = 'past';
            } else if (plane.index === nearestIndex) {
                visibilityState = 'active';
            }
            plane.card.dataset.visibilityState = visibilityState;
        });

        const sortedPlanes = projectPlanes.filter((plane) => {
            return plane.isRendered && getProjectTargetScroll(plane.index) !== null;
        }).sort((planeA, planeB) => {
            const distanceA = Math.abs(getProjectTargetScroll(planeA.index) - state.scrollZ);
            const distanceB = Math.abs(getProjectTargetScroll(planeB.index) - state.scrollZ);
            return distanceA - distanceB;
        });

        sortedPlanes.forEach((plane, rank) => {
            const nextZ = sortedPlanes.length - rank;
            if (plane.zIndex === nextZ) {
                return;
            }
            plane.zIndex = nextZ;
            plane.partition.style.zIndex = String(nextZ);
        });

        lastStackingNearestIndex = nearestIndex;
        lastStackingUpdateScrollZ = state.scrollZ;
    }

    function buildGalleryOutlineNav() {
        if (!outlineNavItems) {
            return;
        }

        outlineNavItems.innerHTML = '';
        galleryOutlineButtons = projects.map((project, index) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'outline-nav-item';
            button.setAttribute('aria-label', project.title);
            button.dataset.outlineRevealState = state.introActive ? 'hidden' : 'visible';

            const line = document.createElement('span');
            line.className = 'outline-nav-line';

            const label = document.createElement('span');
            label.className = 'outline-nav-label';
            label.textContent = project.title;

            button.appendChild(line);
            button.appendChild(label);
            outlineNavItems.appendChild(button);

            button.addEventListener('click', () => {
                if (isCategoryTransitionActive) {
                    return;
                }

                const targetScroll = getProjectTargetScroll(index);
                if (targetScroll === null) {
                    return;
                }
                state.targetScrollZ = targetScroll;
                setGalleryCategoryMenuOpen(false);
                pingGalleryOutlineNav();
                requestGalleryRender();
            });

            return {
                button,
                category: project.category,
                index
            };
        });

        applyGalleryCategoryFilter({ revealState: state.introActive ? 'hidden' : 'visible' });
        pingGalleryOutlineNav();
        updateGalleryOutlineNavActive();
    }

    function buildGalleryCategoryNav() {
        if (!outlineNavCategories) {
            return;
        }

        const categories = Array.from(
            new Set(
                projects
                    .map((project) => project.category)
                    .filter(Boolean)
            )
        );
        outlineNavCategories.innerHTML = '';
        galleryCategoryButtons = categories.map((category) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'outline-nav-category';
            const label = document.createElement('span');
            label.className = 'outline-nav-category-label';
            label.textContent = category;
            button.appendChild(label);
            button.setAttribute('aria-label', `Show ${category} projects`);
            outlineNavCategories.appendChild(button);

            button.addEventListener('click', () => {
                pingGalleryOutlineNav();
                void runCategoryFilterTransition(category);
            });

            return {
                button,
                category
            };
        });

        updateGalleryCategoryNavState();
        syncOutlineNavFooter();
    }

    function applyScrollDelta(delta) {
        if (state.introActive || isCategoryTransitionActive) {
            return;
        }

        state.targetScrollZ += delta;
        state.targetScrollZ = Math.max(0, Math.min(state.targetScrollZ, state.maxScroll));
        pingGalleryOutlineNav();
        requestGalleryRender();
    }

    window.addEventListener('wheel', (event) => {
        applyScrollDelta(event.deltaY * wheelSpeed);
    }, { passive: true });

    window.addEventListener('touchstart', (event) => {
        if (state.introActive || event.touches.length === 0) {
            lastTouchY = null;
            return;
        }
        lastTouchY = event.touches[0].clientY;
    }, { passive: true });

    window.addEventListener('touchmove', (event) => {
        if (state.introActive) {
            event.preventDefault();
            return;
        }
        if (lastTouchY === null || event.touches.length === 0) {
            return;
        }
        const currentY = event.touches[0].clientY;
        const deltaY = (lastTouchY - currentY) * touchMultiplier;
        lastTouchY = currentY;
        applyScrollDelta(deltaY);
        event.preventDefault();
    }, { passive: false });

    window.addEventListener('touchend', () => {
        lastTouchY = null;
    }, { passive: true });

    function animate() {
        galleryAnimationFrame = null;
        const diff = state.targetScrollZ - state.scrollZ;

        if (Math.abs(diff) <= scrollEpsilon) {
            if (state.scrollZ !== state.targetScrollZ) {
                state.scrollZ = state.targetScrollZ;
                refreshGalleryScene({
                    forceMedia: true,
                    forceStacking: true,
                    forceOutline: true
                });
            }
            return;
        }

        state.scrollZ += diff * 0.1;
        if (Math.abs(state.targetScrollZ - state.scrollZ) <= scrollEpsilon) {
            state.scrollZ = state.targetScrollZ;
        }

        refreshGalleryScene();

        if (Math.abs(state.targetScrollZ - state.scrollZ) > scrollEpsilon) {
            requestGalleryRender();
            return;
        }

        refreshGalleryScene({
            forceMedia: true,
            forceStacking: true,
            forceOutline: true
        });
    }

    function updateWireframe() {
        if (!isWireframeVisible) {
            return;
        }

        const width = state.viewportWidth;
        const height = state.viewportHeight;
        const perspective = state.scenePerspective;
        const backWallProjection = projectPlaneToViewport(
            state.roomZ - (state.roomDepth / 2),
            width,
            height,
            perspective,
            minBackWireframeSize
        );

        if (!backWallProjection) {
            return;
        }

        setLine(svgLines.tl, 0, 0, backWallProjection.left, backWallProjection.top);
        setLine(svgLines.tr, width, 0, backWallProjection.right, backWallProjection.top);
        setLine(svgLines.bl, 0, height, backWallProjection.left, backWallProjection.bottom);
        setLine(svgLines.br, width, height, backWallProjection.right, backWallProjection.bottom);
        backRect.setAttribute(
            'points',
            `${backWallProjection.left},${backWallProjection.top} ${backWallProjection.right},${backWallProjection.top} ${backWallProjection.right},${backWallProjection.bottom} ${backWallProjection.left},${backWallProjection.bottom}`
        );
    }

    function setLine(line, x1, y1, x2, y2) {
        line.setAttribute('x1', x1);
        line.setAttribute('y1', y1);
        line.setAttribute('x2', x2);
        line.setAttribute('y2', y2);
    }

    window.addEventListener('resize', () => {
        state.roomHeight = window.innerHeight;
        state.viewportWidth = window.innerWidth;
        state.viewportHeight = window.innerHeight;
        updateGalleryOutlineNavLayout();
        refreshGalleryScene({
            forceMedia: true,
            forceStacking: true,
            forceOutline: true,
            includeWireframe: true
        });
    });

});

async function loadProjectsPayload() {
    if (window.SpaceToSpaceProjectsData) {
        return window.SpaceToSpaceProjectsData;
    }

    const response = await fetch('data/projects.json');
    if (!response.ok) {
        throw new Error(`Failed to load projects: ${response.status}`);
    }

    return response.json();
}

function isR2AssetPath(path) {
    return typeof path === 'string' && path.includes('.r2.dev/');
}
