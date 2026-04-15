document.addEventListener('DOMContentLoaded', async () => {
    const body = document.body;
    const scene = document.querySelector('.scene');
    const intro = document.querySelector('.gallery-intro');
    const introTitle = document.querySelector('.gallery-intro-title');
    const room = document.querySelector('.room');
    const backWall = document.querySelector('.back-wall');
    const outlineNav = document.querySelector('.outline-nav');
    const outlineNavItems = document.querySelector('.outline-nav-items');
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

    let projects = [];
    let galleryOutlineButtons = [];
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
    const wheelSpeed = 2.5;
    const touchMultiplier = 3;
    const darkModeToggle = document.getElementById('darkModeToggle');

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
        introActive: Boolean(body && scene && intro && introTitle),
        introAnimationDone: false
    };

    initDarkMode();

    try {
        const payload = await loadProjectsPayload();
        const works = Array.isArray(payload.works) ? payload.works : [];
        const eligibleWorks = works.filter((work) => work && typeof work.slug === 'string');
        projects = eligibleWorks.map((work, index) => ({
            slug: work.slug,
            title: work.title || `Project ${index + 1}`,
            menuAsset: work.menuAsset || 'assets/site/video-thumbnail.webp',
            menuAssetType: work.menuAssetType || 'image',
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
            refreshGalleryScene({
                forceMedia: true,
                forceStacking: true,
                forceOutline: true,
                includeWireframe: true
            });

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
                isRendered: true
            };
            bindProjectMediaState(plane);
            syncProjectMediaState(plane);
            projectPlanes.push(plane);
        });

        buildGalleryOutlineNav();
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
                const distanceA = Math.abs(getProjectTargetScroll(planeA.index) - state.scrollZ);
                const distanceB = Math.abs(getProjectTargetScroll(planeB.index) - state.scrollZ);
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

        const distance = Math.abs(getProjectTargetScroll(plane.index) - state.scrollZ);
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
            const distance = Math.abs(getProjectTargetScroll(plane.index) - state.scrollZ);
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
        return (state.roomDepth / 2) - (getProjectTargetScroll(index) - state.scrollZ);
    }

    function updateProjectPlaneTransforms() {
        if (projectPlanes.length === 0) {
            return;
        }

        projectPlanes.forEach((plane) => {
            const scrollDistance = getProjectTargetScroll(plane.index) - state.scrollZ;
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
        if (projects.length === 0) {
            return -1;
        }

        return clamp(Math.round((scrollZ - startOffset) / spacing), 0, projects.length - 1);
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
        return Math.max(0, Math.min(index * spacing + startOffset, state.maxScroll));
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

    function updateGalleryOutlineNavActive(activeIndex = getNearestProjectIndex()) {
        if (galleryOutlineButtons.length === 0 || activeIndex < 0) {
            return;
        }

        if (activeOutlineIndex >= 0 && galleryOutlineButtons[activeOutlineIndex]) {
            galleryOutlineButtons[activeOutlineIndex].classList.remove('is-active');
        }

        activeOutlineIndex = activeIndex;
        galleryOutlineButtons[activeOutlineIndex]?.classList.add('is-active');
    }

    function updateProjectPlaneStacking(nearestIndex = getNearestProjectIndex()) {
        if (projectPlanes.length === 0) {
            return;
        }

        const sortedPlanes = projectPlanes.filter((plane) => plane.isRendered).sort((planeA, planeB) => {
            const distanceA = Math.abs(getProjectTargetScroll(planeA.index) - state.scrollZ);
            const distanceB = Math.abs(getProjectTargetScroll(planeB.index) - state.scrollZ);
            return distanceA - distanceB;
        });

        sortedPlanes.forEach((plane, rank) => {
            plane.partition.style.zIndex = String(sortedPlanes.length - rank);
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

            const line = document.createElement('span');
            line.className = 'outline-nav-line';

            const label = document.createElement('span');
            label.className = 'outline-nav-label';
            label.textContent = project.title;

            button.appendChild(line);
            button.appendChild(label);
            outlineNavItems.appendChild(button);

            button.addEventListener('click', () => {
                state.targetScrollZ = getProjectTargetScroll(index);
                pingGalleryOutlineNav();
                requestGalleryRender();
            });

            return button;
        });

        pingGalleryOutlineNav();
        updateGalleryOutlineNavActive();
    }

    function applyScrollDelta(delta) {
        if (state.introActive) {
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
        refreshGalleryScene({
            forceMedia: true,
            forceStacking: true,
            forceOutline: true,
            includeWireframe: true
        });
    });

    function initDarkMode() {
        if (!darkModeToggle) {
            return;
        }

        const savedMode = localStorage.getItem('darkMode');
        if (savedMode === 'true') {
            body.classList.add('dark-mode');
            darkModeToggle.textContent = '●';
            darkModeToggle.classList.add('active');
        } else {
            darkModeToggle.textContent = '○';
            darkModeToggle.classList.remove('active');
        }

        darkModeToggle.addEventListener('click', () => {
            body.classList.toggle('dark-mode');
            const isDark = body.classList.contains('dark-mode');
            darkModeToggle.textContent = isDark ? '●' : '○';
            darkModeToggle.classList.toggle('active', isDark);
            localStorage.setItem('darkMode', isDark);
        });
    }
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
