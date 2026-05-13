document.addEventListener('DOMContentLoaded', () => {
    const PROJECT_MEDIA_MOVE_DURATION_MS = 280;
    const PROJECT_MEDIA_PRE_ZOOM_PAUSE_MS = 400;
    const PROJECT_MEDIA_DISSOLVE_DURATION_MS = 220;
    const PROJECT_MEDIA_RESTORE_PERSPECTIVE_DELAY_MS = 10;

    const body = document.body;
    const depthSlider = document.getElementById('depthSlider');
    const scene = document.querySelector('.scene');
    const room = document.querySelector('.room');
    const floorContent = document.querySelector('.floor-content');
    const backContent = document.querySelector('.back-content');
    const ceilingContent = document.querySelector('.ceiling-content');
    const contentItems = document.querySelectorAll('.content-item');
    const rootStyle = document.documentElement.style;
    const outlineNav = document.querySelector('.outline-nav');
    const outlineNavItems = document.querySelector('.outline-nav-items');

    // Wireframe Elements
    const markers = {
        tl: document.querySelector('.marker.tl'),
        tr: document.querySelector('.marker.tr'),
        bl: document.querySelector('.marker.bl'),
        br: document.querySelector('.marker.br')
    };
    const svgLines = {
        tl: document.querySelector('.depth-line.tl'),
        tr: document.querySelector('.depth-line.tr'),
        bl: document.querySelector('.depth-line.bl'),
        br: document.querySelector('.depth-line.br')
    };
    const backRect = document.querySelector('.back-rect');

    // Page roles are declared by markup so filenames can change without breaking behavior.
    const pageName = body?.dataset.page || '';
    const isProjectPage = pageName === 'project' || body.classList.contains('project-page');
    const isAboutPage = pageName === 'about' || body.classList.contains('about-page');
    const isContactPage = pageName === 'project-video' || body.classList.contains('contact-video-page');

    function getViewportHeight() {
        return Math.round(window.visualViewport?.height || window.innerHeight);
    }

    function getViewportWidth() {
        return Math.round(window.visualViewport?.width || window.innerWidth);
    }

    const DEFAULT_ROOM_DEPTH = parseInt(depthSlider.value, 10);
    const TUNNEL_UI_GUTTER = 8;

    let state = {
        roomDepth: getInitialRoomDepth(),
        roomHeight: getViewportHeight(),
        scrollPos: 0,
        maxScroll: 5000,
        introAnimationDone: false
    };
    let targetScroll = 0;
    // Cached content height is shared by project and about centering/clamping.
    let baseContentHeight = null;
    const frontViewState = {
        isActive: false,
        restoreDepth: state.roomDepth,
        animationFrame: null,
        suppressSync: false
    };
    const projectMediaFocusState = {
        layer: null,
        shell: null,
        trigger: null,
        enterTimer: null,
        exitTimer: null,
        restoreTimer: null,
        activeSrc: '',
        activeKind: ''
    };

    const tintState = {
        imageCache: new WeakMap(),
        cardCache: new WeakMap(),
        updateTimer: null
    };
    const projectOutlineState = {
        sections: [],
        activeIndex: -1,
        idleTimer: null
    };
    const projectIntroState = {
        animationFrame: null
    };
    const VIDEO_INTRO_START_DEPTH = 1000;
    const VIDEO_INTRO_END_DEPTH = 120;
    const VIDEO_INTRO_FADE_BEFORE_ZOOM_MS = 360;
    const VIDEO_INTRO_CONTENT_FADE_OUT_MS = 260;
    const VIDEO_INTRO_NEAR_TOP_RESTORE_PX = 32;
    const projectVideoIntroState = {
        isTransitioning: false,
        fadeStarted: false,
        revealScroll: 0,
        fadeTimer: null,
        ignoreForwardUntil: 0,
        restoreHintActive: false,
        restoreHintArmed: false,
        restoreHintPendingTop: false,
        restoreHintBaseDepth: getProjectVideoIntroEndDepth(),
        restoreHintOffset: 0,
        restoreHintReleaseTimer: null
    };
    const aboutLogoState = {
        offset: 0,
        targetOffset: 0,
        wrapWidth: 0,
        lastFrameTime: 0
    };
    const ABOUT_LOGO_AUTO_SPEED_PER_SECOND = 42;
    const ABOUT_LOGO_SCROLL_MULTIPLIER = 0.72;
    const ABOUT_VERTICAL_SCROLL_MULTIPLIER = 0.82;
    const tintCanvas = document.createElement('canvas');
    const tintContext = tintCanvas.getContext('2d', { willReadFrequently: true });

    function getScenePerspective() {
        const computedPerspective = scene ? parseFloat(window.getComputedStyle(scene).perspective) : Number.NaN;
        return Number.isFinite(computedPerspective) && computedPerspective > 0 ? computedPerspective : 1200;
    }

    function getMaxElementEdge(selector, side) {
        const elements = Array.from(document.querySelectorAll(selector));
        return elements.reduce((edge, element) => {
            if (!(element instanceof HTMLElement) || element.hidden) {
                return edge;
            }

            const rect = element.getBoundingClientRect();
            if (rect.width <= 0 && rect.height <= 0) {
                return edge;
            }

            return side === 'left'
                ? Math.max(edge, rect.right)
                : Math.max(edge, getViewportWidth() - rect.left);
        }, 0);
    }

    function getResponsiveTunnelInset() {
        if (!(isProjectPage || isAboutPage)) {
            return null;
        }

        const leftInset = getMaxElementEdge('.side-nav.left a', 'left');
        const rightInset = getMaxElementEdge('.outline-nav-item:not([hidden]), .outline-nav-category:not([hidden]), .outline-nav-footer', 'right');
        const inset = Math.max(leftInset, rightInset) + TUNNEL_UI_GUTTER;
        const viewportWidth = getViewportWidth();

        if (!Number.isFinite(inset) || inset <= 0 || inset >= viewportWidth / 2) {
            return null;
        }

        return inset;
    }

    function getRoomDepthForTunnelInset(inset) {
        const viewportWidth = getViewportWidth();
        const perspective = getScenePerspective();
        const denominator = viewportWidth - inset * 2;

        if (!Number.isFinite(denominator) || denominator <= 0) {
            return DEFAULT_ROOM_DEPTH;
        }

        return Math.max(DEFAULT_ROOM_DEPTH, Math.round((2 * inset * perspective) / denominator));
    }

    function getSettledRoomDepth() {
        const tunnelInset = getResponsiveTunnelInset();
        return tunnelInset === null ? DEFAULT_ROOM_DEPTH : getRoomDepthForTunnelInset(tunnelInset);
    }

    function projectPlaneToViewport(zPos, viewportWidth, viewportHeight, perspective) {
        const denominator = perspective - zPos;
        if (!Number.isFinite(denominator) || denominator <= 0.5) {
            return null;
        }

        const scale = perspective / denominator;
        if (!Number.isFinite(scale) || scale <= 0) {
            return null;
        }

        const projectedWidth = viewportWidth * scale;
        const projectedHeight = viewportHeight * scale;
        const left = (viewportWidth - projectedWidth) / 2;
        const top = (viewportHeight - projectedHeight) / 2;

        return {
            left,
            top,
            right: left + projectedWidth,
            bottom: top + projectedHeight
        };
    }

    function getProjectUiFrame(points, sceneRect) {
        if (!isProjectPage) {
            return {
                left: Math.min(points.tl.x, points.bl.x) + sceneRect.left,
                right: Math.max(points.tr.x, points.br.x) + sceneRect.left,
                top: Math.min(points.tl.y, points.tr.y) + sceneRect.top,
                bottom: Math.max(points.bl.y, points.br.y) + sceneRect.top
            };
        }

        const referenceDepth = getSettledRoomDepth();
        const referenceProjection = projectPlaneToViewport(
            -referenceDepth,
            sceneRect.width,
            sceneRect.height,
            getScenePerspective()
        );

        if (!referenceProjection) {
            return {
                left: Math.min(points.tl.x, points.bl.x) + sceneRect.left,
                right: Math.max(points.tr.x, points.br.x) + sceneRect.left,
                top: Math.min(points.tl.y, points.tr.y) + sceneRect.top,
                bottom: Math.max(points.bl.y, points.br.y) + sceneRect.top
            };
        }

        return {
            left: referenceProjection.left + sceneRect.left,
            right: referenceProjection.right + sceneRect.left,
            top: referenceProjection.top + sceneRect.top,
            bottom: referenceProjection.bottom + sceneRect.top
        };
    }

    function getProjectVideoIntroEndDepth() {
        return isProjectPage ? getSettledRoomDepth() : VIDEO_INTRO_END_DEPTH;
    }

    function getInitialRoomDepth() {
        return getSettledRoomDepth();
    }

    function syncResponsiveRoomDepth() {
        if (
            !(isProjectPage || isAboutPage)
            || frontViewState.isActive
            || projectMediaFocusState.activeSrc
            || projectVideoIntroState.isTransitioning
            || body.classList.contains('project-video-intro-active')
            || body.classList.contains('project-video-intro-restoring')
        ) {
            return;
        }

        const nextDepth = getSettledRoomDepth();
        if (!Number.isFinite(nextDepth) || Math.abs(state.roomDepth - nextDepth) < 0.5) {
            return;
        }

        frontViewState.suppressSync = true;
        depthSlider.value = String(nextDepth);
        updateRoomDepth(nextDepth);
        frontViewState.suppressSync = false;
        frontViewState.restoreDepth = nextDepth;
        baseContentHeight = null;
    }

    // Check if wireframe is visible
    const wireframeOverlay = document.querySelector('.wireframe-overlay');
    const isWireframeVisible = wireframeOverlay && 
        window.getComputedStyle(wireframeOverlay).display !== 'none';

    function syncAppViewportHeight() {
        state.roomHeight = getViewportHeight();
        rootStyle.setProperty('--app-height', `${state.roomHeight}px`);
    }

    function refreshWireframe() {
        if (!isWireframeVisible) {
            return;
        }

        requestAnimationFrame(updateWireframe);
    }

    function getFrontDepth() {
        return parseInt(depthSlider.min, 10);
    }

    function setFrontViewActive(isActive) {
        frontViewState.isActive = isActive;
        body.classList.toggle('front-view-active', isActive);
        if (!isActive && projectMediaFocusState.exitTimer === null) {
            clearProjectMediaFocus(true);
        }
    }

    function setDepthSliderValue(val) {
        depthSlider.value = String(val);
        depthSlider.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function animateDepthTo(targetDepth, options = {}) {
        const {
            duration = 420,
            frontViewActive = frontViewState.isActive,
            onUpdate = null,
            onComplete = null
        } = options;
        const startDepth = parseFloat(depthSlider.value);
        const finalDepth = parseFloat(targetDepth);

        if (frontViewState.animationFrame !== null) {
            cancelAnimationFrame(frontViewState.animationFrame);
            frontViewState.animationFrame = null;
        }

        setFrontViewActive(frontViewActive);

        if (!Number.isFinite(startDepth) || !Number.isFinite(finalDepth)) {
            return;
        }

        if (Math.abs(finalDepth - startDepth) < 0.5) {
            frontViewState.suppressSync = true;
            setDepthSliderValue(finalDepth);
            frontViewState.suppressSync = false;
            if (typeof onUpdate === 'function') {
                onUpdate({ progress: 1, eased: 1, depth: finalDepth });
            }
            if (typeof onComplete === 'function') {
                onComplete();
            }
            return;
        }

        const startTime = performance.now();
        frontViewState.suppressSync = true;

        function step(now) {
            const progress = Math.min((now - startTime) / duration, 1);
            const eased = easeInOutCubic(progress);
            const nextDepth = startDepth + (finalDepth - startDepth) * eased;

            setDepthSliderValue(nextDepth);
            if (typeof onUpdate === 'function') {
                onUpdate({ progress, eased, depth: nextDepth });
            }

            if (progress < 1) {
                frontViewState.animationFrame = requestAnimationFrame(step);
                return;
            }

            frontViewState.animationFrame = null;
            setDepthSliderValue(finalDepth);
            frontViewState.suppressSync = false;
            if (typeof onComplete === 'function') {
                onComplete();
            }
        }

        frontViewState.animationFrame = requestAnimationFrame(step);
    }

    function syncFrontViewState(val) {
        if (frontViewState.suppressSync) {
            return;
        }

        const frontDepth = getFrontDepth();
        if (Number.isNaN(val) || Number.isNaN(frontDepth)) {
            return;
        }

        if (frontViewState.isActive) {
            if (val !== frontDepth) {
                setFrontViewActive(false);
                frontViewState.restoreDepth = val;
            }
            return;
        }

        if (val !== frontDepth) {
            frontViewState.restoreDepth = val;
        }
    }

    function getBackWallPolygon() {
        if (!markers.tl || !markers.tr || !markers.br || !markers.bl) {
            return [];
        }

        const tl = markers.tl.getBoundingClientRect();
        const tr = markers.tr.getBoundingClientRect();
        const br = markers.br.getBoundingClientRect();
        const bl = markers.bl.getBoundingClientRect();

        return [
            { x: tl.left, y: tl.top },
            { x: tr.left, y: tr.top },
            { x: br.left, y: br.top },
            { x: bl.left, y: bl.top }
        ];
    }

    function isPointInsidePolygon(x, y, polygon) {
        let isInside = false;

        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i].x;
            const yi = polygon[i].y;
            const xj = polygon[j].x;
            const yj = polygon[j].y;

            const intersects = ((yi > y) !== (yj > y))
                && (x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-7) + xi);

            if (intersects) {
                isInside = !isInside;
            }
        }

        return isInside;
    }

    function toggleFrontView() {
        const frontDepth = getFrontDepth();
        const currentDepth = parseInt(depthSlider.value, 10);

        if (Number.isNaN(frontDepth) || Number.isNaN(currentDepth)) {
            return;
        }

        if (frontViewState.isActive) {
            animateDepthTo(frontViewState.restoreDepth, { frontViewActive: false });
            return;
        }

        if (currentDepth !== frontDepth) {
            frontViewState.restoreDepth = currentDepth;
        }

        animateDepthTo(frontDepth, { frontViewActive: true });
    }

    function restoreFrontView() {
        if (!frontViewState.isActive) {
            return;
        }

        if (projectMediaFocusState.restoreTimer !== null) {
            window.clearTimeout(projectMediaFocusState.restoreTimer);
            projectMediaFocusState.restoreTimer = null;
        }

        if (projectMediaFocusState.activeSrc) {
            clearProjectMediaFocus(true);
            projectMediaFocusState.restoreTimer = window.setTimeout(() => {
                animateDepthTo(frontViewState.restoreDepth, { frontViewActive: false });
                projectMediaFocusState.restoreTimer = null;
            }, PROJECT_MEDIA_RESTORE_PERSPECTIVE_DELAY_MS);
            return;
        }

        animateDepthTo(frontViewState.restoreDepth, { frontViewActive: false });
    }

    function finalizeProjectMediaFocusClear() {
        if (projectMediaFocusState.enterTimer !== null) {
            window.clearTimeout(projectMediaFocusState.enterTimer);
        }

        if (projectMediaFocusState.exitTimer !== null) {
            window.clearTimeout(projectMediaFocusState.exitTimer);
        }

        if (projectMediaFocusState.restoreTimer !== null) {
            window.clearTimeout(projectMediaFocusState.restoreTimer);
        }

        if (projectMediaFocusState.layer instanceof HTMLElement) {
            projectMediaFocusState.layer.remove();
        }

        if (projectMediaFocusState.trigger instanceof HTMLElement) {
            projectMediaFocusState.trigger.classList.remove('project-focus-source-hidden');
        }

        projectMediaFocusState.layer = null;
        projectMediaFocusState.shell = null;
        projectMediaFocusState.trigger = null;
        projectMediaFocusState.enterTimer = null;
        projectMediaFocusState.exitTimer = null;
        projectMediaFocusState.restoreTimer = null;
        projectMediaFocusState.activeSrc = '';
        projectMediaFocusState.activeKind = '';
        body.classList.remove('project-media-focus-active');
    }

    function clearProjectMediaFocus(animated = false) {
        if (!(projectMediaFocusState.layer instanceof HTMLElement) || !(projectMediaFocusState.shell instanceof HTMLElement)) {
            finalizeProjectMediaFocusClear();
            return;
        }

        if (!animated || !(projectMediaFocusState.trigger instanceof HTMLElement)) {
            finalizeProjectMediaFocusClear();
            return;
        }

        if (projectMediaFocusState.exitTimer !== null) {
            window.clearTimeout(projectMediaFocusState.exitTimer);
        }

        projectMediaFocusState.trigger.classList.remove('project-focus-source-hidden');
        body.classList.remove('project-media-focus-active');
        projectMediaFocusState.shell.classList.add('is-dissolving');

        projectMediaFocusState.exitTimer = window.setTimeout(() => {
            finalizeProjectMediaFocusClear();
        }, PROJECT_MEDIA_DISSOLVE_DURATION_MS);
    }

    function enterFrontView(options = {}) {
        const frontDepth = getFrontDepth();
        const currentDepth = parseInt(depthSlider.value, 10);

        if (Number.isNaN(frontDepth) || Number.isNaN(currentDepth) || frontViewState.isActive) {
            return;
        }

        if (currentDepth !== frontDepth) {
            frontViewState.restoreDepth = currentDepth;
        }

        animateDepthTo(frontDepth, { frontViewActive: true, ...options });
    }

    function buildProjectMediaFocusNode({ kind, src, label }) {
        if (kind === 'video') {
            const video = document.createElement('video');
            video.src = src;
            video.className = 'project-media-focus-asset';
            video.autoplay = true;
            video.loop = true;
            video.muted = true;
            video.playsInline = true;
            video.preload = 'metadata';
            video.setAttribute('aria-label', label || 'Focused project video');
            window.SpaceToSpaceAudio?.applyToVideo(video);
            return video;
        }

        if (kind === 'document') {
            const frame = document.createElement('iframe');
            frame.src = src;
            frame.className = 'project-media-focus-asset project-media-focus-asset--document';
            frame.title = label || 'Focused project document';
            frame.loading = 'eager';
            return frame;
        }

        const img = document.createElement('img');
        img.src = src;
        img.alt = label || 'Focused project image';
        img.className = 'project-media-focus-asset';
        img.decoding = 'async';
        return img;
    }

    function resolveProjectFocusTrigger(trigger, src) {
        if (trigger instanceof HTMLElement) {
            return trigger;
        }

        if (typeof src !== 'string' || !window.CSS || typeof window.CSS.escape !== 'function') {
            return null;
        }

        return document.querySelector(`[data-project-focus-trigger="true"][data-project-focus-src="${window.CSS.escape(src)}"]`);
    }

    function applyProjectMediaFocusRect(element, rect) {
        element.style.left = `${rect.left}px`;
        element.style.top = `${rect.top}px`;
        element.style.width = `${rect.width}px`;
        element.style.height = `${rect.height}px`;
    }

    function getProjectMediaFocusSourceRect(trigger) {
        const source = trigger.querySelector('.project-media');
        if (source instanceof HTMLElement) {
            return source.getBoundingClientRect();
        }

        return trigger.getBoundingClientRect();
    }

    function getProjectMediaFocusTargetRect() {
        const insetX = Math.max(48, Math.round(window.innerWidth * 0.08));
        const insetY = Math.max(48, Math.round(window.innerHeight * 0.08));
        return {
            left: insetX,
            top: insetY,
            width: Math.max(0, window.innerWidth - insetX * 2),
            height: Math.max(0, window.innerHeight - insetY * 2)
        };
    }

    function getProjectMediaFocusPreZoomRect(fallbackRect) {
        const polygon = getBackWallPolygon();
        if (polygon.length !== 4) {
            return fallbackRect;
        }

        const xs = polygon.map((point) => point.x);
        const ys = polygon.map((point) => point.y);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        const padding = Math.max(16, Math.round(Math.min(maxX - minX, maxY - minY) * 0.06));

        return {
            left: minX + padding,
            top: minY + padding,
            width: Math.max(0, maxX - minX - padding * 2),
            height: Math.max(0, maxY - minY - padding * 2)
        };
    }

    function interpolateProjectMediaFocusRect(fromRect, toRect, progress) {
        return {
            left: fromRect.left + (toRect.left - fromRect.left) * progress,
            top: fromRect.top + (toRect.top - fromRect.top) * progress,
            width: fromRect.width + (toRect.width - fromRect.width) * progress,
            height: fromRect.height + (toRect.height - fromRect.height) * progress
        };
    }

    function getProjectMediaFocusPerspectiveScale(sourceRect, targetRect) {
        const widthRatio = targetRect.width > 0 ? sourceRect.width / targetRect.width : 1;
        const heightRatio = targetRect.height > 0 ? sourceRect.height / targetRect.height : 1;
        const coverage = Math.max(0, Math.min(1, Math.max(widthRatio, heightRatio)));
        const distanceFactor = 1 - coverage;
        const minScale = 1.035;
        const maxScale = 1.14;
        const boostedFactor = Math.pow(distanceFactor, 0.75);
        return minScale + (maxScale - minScale) * boostedFactor;
    }

    function focusProjectMedia({ kind, src, label, trigger }) {
        if (!isProjectPage || !src) {
            return;
        }

        const resolvedTrigger = resolveProjectFocusTrigger(trigger, src);
        if (!(resolvedTrigger instanceof HTMLElement)) {
            return;
        }

        clearProjectMediaFocus(false);

        const layer = document.createElement('div');
        layer.className = 'project-media-focus-layer';

        const shell = document.createElement('div');
        shell.className = 'project-media-focus-shell';
        shell.appendChild(buildProjectMediaFocusNode({ kind, src, label }));
        layer.appendChild(shell);

        const sourceRect = getProjectMediaFocusSourceRect(resolvedTrigger);
        const finalRect = getProjectMediaFocusTargetRect();
        const preZoomRect = getProjectMediaFocusPreZoomRect(finalRect);
        const perspectiveScale = getProjectMediaFocusPerspectiveScale(sourceRect, finalRect);
        applyProjectMediaFocusRect(shell, sourceRect);
        shell.style.transform = 'scale(1)';

        body.appendChild(layer);
        body.classList.add('project-media-focus-active');
        resolvedTrigger.classList.add('project-focus-source-hidden');

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                applyProjectMediaFocusRect(shell, preZoomRect);
            });
        });

        projectMediaFocusState.enterTimer = window.setTimeout(() => {
            shell.classList.add('is-depth-syncing');
            enterFrontView({
                onUpdate: ({ eased }) => {
                    applyProjectMediaFocusRect(shell, interpolateProjectMediaFocusRect(preZoomRect, finalRect, eased));
                    const nextScale = 1 + (perspectiveScale - 1) * eased;
                    shell.style.transform = `scale(${nextScale.toFixed(4)})`;
                },
                onComplete: () => {
                    applyProjectMediaFocusRect(shell, finalRect);
                    shell.style.transform = `scale(${perspectiveScale.toFixed(4)})`;
                }
            });
            projectMediaFocusState.enterTimer = null;
        }, PROJECT_MEDIA_MOVE_DURATION_MS + PROJECT_MEDIA_PRE_ZOOM_PAUSE_MS);

        projectMediaFocusState.layer = layer;
        projectMediaFocusState.shell = shell;
        projectMediaFocusState.trigger = resolvedTrigger;
        projectMediaFocusState.activeSrc = src;
        projectMediaFocusState.activeKind = kind || 'image';
    }

    function getProjectFocusTriggerFromPoint(clientX, clientY) {
        const elementsAtPoint = document.elementsFromPoint(clientX, clientY);
        for (const element of elementsAtPoint) {
            if (!(element instanceof HTMLElement)) {
                continue;
            }

            const trigger = element.closest('[data-project-focus-trigger="true"]');
            if (trigger instanceof HTMLElement) {
                return trigger;
            }
        }

        return null;
    }

    function parseRgbString(value) {
        const match = value.match(/\d+/g);
        if (!match || match.length < 3) {
            return body.classList.contains('dark-mode') ? [10, 10, 10] : [216, 216, 216];
        }
        return match.slice(0, 3).map(Number);
    }

    function parseColorTuple(value) {
        const match = String(value || '').match(/\d+/g);
        if (!match || match.length < 3) {
            return null;
        }
        return {
            r: Number(match[0]),
            g: Number(match[1]),
            b: Number(match[2])
        };
    }

    function getVisibleArea(rect) {
        const width = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0));
        const height = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
        return width * height;
    }

    function getColorStrength(color) {
        return Math.max(color.r, color.g, color.b) - Math.min(color.r, color.g, color.b);
    }

    function quantizeChannel(value) {
        return Math.max(0, Math.min(255, Math.round(value / 24) * 24));
    }

    function blendChannel(base, target, ratio) {
        return Math.round(base + (target - base) * ratio);
    }

    function boostTintChannel(value) {
        return Math.max(0, Math.min(255, Math.round(128 + (value - 128) * 1.22)));
    }

    function softenTint(color) {
        const computedBg = window.getComputedStyle(body).backgroundColor;
        const [baseR, baseG, baseB] = parseRgbString(computedBg);
        const boosted = {
            r: boostTintChannel(color.r),
            g: boostTintChannel(color.g),
            b: boostTintChannel(color.b)
        };
        const ratio = body.classList.contains('dark-mode') ? 0.58 : 0.68;
        return {
            r: blendChannel(baseR, boosted.r, ratio),
            g: blendChannel(baseG, boosted.g, ratio),
            b: blendChannel(baseB, boosted.b, ratio)
        };
    }

    function applyDynamicTint(color) {
        if (!color) {
            rootStyle.setProperty('--dynamic-tint-alpha', '0');
            return;
        }

        const softened = softenTint(color);
        rootStyle.setProperty('--dynamic-tint-rgb', `${softened.r}, ${softened.g}, ${softened.b}`);
        rootStyle.setProperty('--dynamic-tint-alpha', body.classList.contains('dark-mode') ? '0.22' : '0.40');
    }

    function extractImageTint(img) {
        if (!(img instanceof HTMLImageElement) || !tintContext || !img.complete || img.naturalWidth === 0) {
            return null;
        }

        const cached = tintState.imageCache.get(img);
        if (cached) {
            return cached;
        }

        const sampleSize = 28;
        tintCanvas.width = sampleSize;
        tintCanvas.height = sampleSize;
        tintContext.clearRect(0, 0, sampleSize, sampleSize);

        // Ignore poster margins and sample the more content-rich center area.
        const cropInsetX = img.naturalWidth * 0.18;
        const cropInsetY = img.naturalHeight * 0.14;
        const cropWidth = Math.max(1, img.naturalWidth - cropInsetX * 2);
        const cropHeight = Math.max(1, img.naturalHeight - cropInsetY * 2);
        tintContext.drawImage(
            img,
            cropInsetX,
            cropInsetY,
            cropWidth,
            cropHeight,
            0,
            0,
            sampleSize,
            sampleSize
        );

        let imageData;
        try {
            imageData = tintContext.getImageData(0, 0, sampleSize, sampleSize);
        } catch (error) {
            // file:// pages treat local images as unique origins, so canvas reads are blocked.
            return null;
        }

        const { data } = imageData;
        const buckets = new Map();
        let fallbackWeight = 0;
        let fallbackR = 0;
        let fallbackG = 0;
        let fallbackB = 0;

        for (let index = 0; index < data.length; index += 4) {
            const alpha = data[index + 3];
            if (alpha < 180) {
                continue;
            }

            const r = data[index];
            const g = data[index + 1];
            const b = data[index + 2];
            const max = Math.max(r, g, b);
            const min = Math.min(r, g, b);
            const saturation = max - min;
            const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;

            if (luminance < 24 || luminance > 232) {
                continue;
            }

            const midtoneBias = Math.max(0.2, 1 - Math.abs(luminance - 146) / 146);
            const fallbackPixelWeight = (1 + saturation / 72) * midtoneBias;
            fallbackWeight += fallbackPixelWeight;
            fallbackR += r * fallbackPixelWeight;
            fallbackG += g * fallbackPixelWeight;
            fallbackB += b * fallbackPixelWeight;

            if (saturation < 22) {
                continue;
            }

            const key = `${quantizeChannel(r)},${quantizeChannel(g)},${quantizeChannel(b)}`;
            const bucket = buckets.get(key) || { weight: 0, r: 0, g: 0, b: 0 };
            const pixelWeight = (1 + saturation / 28) * midtoneBias;
            bucket.weight += pixelWeight;
            bucket.r += r * pixelWeight;
            bucket.g += g * pixelWeight;
            bucket.b += b * pixelWeight;
            buckets.set(key, bucket);
        }

        let selected = null;
        for (const bucket of buckets.values()) {
            if (!selected || bucket.weight > selected.weight) {
                selected = bucket;
            }
        }

        if (!selected && fallbackWeight > 0) {
            selected = { weight: fallbackWeight, r: fallbackR, g: fallbackG, b: fallbackB };
        }

        if (!selected || selected.weight === 0) {
            return null;
        }

        const color = {
            r: Math.round(selected.r / selected.weight),
            g: Math.round(selected.g / selected.weight),
            b: Math.round(selected.b / selected.weight)
        };

        tintState.imageCache.set(img, color);
        return color;
    }

    function getCardTint(card) {
        if (!(card instanceof HTMLElement)) {
            return null;
        }

        const datasetTint = parseColorTuple(card.dataset.tintRgb);
        const cached = tintState.cardCache.get(card);
        if (cached) {
            return cached;
        }

        if (window.location.protocol === 'file:' && datasetTint) {
            tintState.cardCache.set(card, datasetTint);
            return datasetTint;
        }

        const images = Array.from(card.querySelectorAll('img'));
        const colors = images.map(extractImageTint).filter(Boolean);
        if (colors.length === 0) {
            if (datasetTint) {
                tintState.cardCache.set(card, datasetTint);
                return datasetTint;
            }
            return null;
        }

        const combined = colors.reduce(
            (acc, color) => ({
                r: acc.r + color.r * (getColorStrength(color) + 24),
                g: acc.g + color.g * (getColorStrength(color) + 24),
                b: acc.b + color.b * (getColorStrength(color) + 24),
                weight: acc.weight + getColorStrength(color) + 24
            }),
            { r: 0, g: 0, b: 0, weight: 0 }
        );
        const tint = {
            r: Math.round(combined.r / combined.weight),
            g: Math.round(combined.g / combined.weight),
            b: Math.round(combined.b / combined.weight)
        };

        tintState.cardCache.set(card, tint);
        return tint;
    }

    function getActiveBackCard() {
        if (!backContent) {
            return null;
        }

        const cards = Array.from(backContent.querySelectorAll('.project-card'));
        let activeCard = null;
        let maxVisibleArea = 0;

        cards.forEach((card) => {
            const area = getVisibleArea(card.getBoundingClientRect());
            if (area > maxVisibleArea) {
                activeCard = card;
                maxVisibleArea = area;
            }
        });

        return activeCard;
    }

    function scheduleDynamicTintUpdate() {
        if (!isProjectPage) {
            return;
        }
        /* Detail projektu má pevné černé pozadí (style.css); žádné tintování podle obrázků */
    }

    function initDynamicTint() {
        if (!isProjectPage || !backContent) {
            return;
        }

        applyDynamicTint(null);
    }

    function getProjectSectionLabel(card, index) {
        const explicitLabel = card.dataset.navLabel;
        if (explicitLabel) {
            return explicitLabel;
        }

        const heading = card.querySelector('h2')?.textContent?.trim();
        if (heading && index === 0) {
            return heading;
        }

        const alt = card.querySelector('img')?.alt?.trim();
        return alt || `Section ${index + 1}`;
    }

    function pingProjectOutlineNav() {
        if (!outlineNav) {
            return;
        }

        outlineNav.classList.add('is-engaged');
        if (projectOutlineState.idleTimer !== null) {
            window.clearTimeout(projectOutlineState.idleTimer);
        }
        projectOutlineState.idleTimer = window.setTimeout(() => {
            outlineNav.classList.remove('is-engaged');
            projectOutlineState.idleTimer = null;
        }, 1200);
    }

    function getProjectReturnLinkFromPoint(clientX, clientY) {
        if (!isProjectPage || !backContent) {
            return null;
        }

        const returnLink = backContent.querySelector('.project-back-to-gallery');
        if (!(returnLink instanceof HTMLAnchorElement)) {
            return null;
        }

        const rect = returnLink.getBoundingClientRect();
        const isInsideRect = clientX >= rect.left
            && clientX <= rect.right
            && clientY >= rect.top
            && clientY <= rect.bottom;

        return isInsideRect ? returnLink : null;
    }

    function updateProjectReturnLinkHoverState(clientX, clientY) {
        if (!isProjectPage || !backContent) {
            body.classList.remove('project-return-link-hover');
            return;
        }

        const returnLink = backContent.querySelector('.project-back-to-gallery');
        if (!(returnLink instanceof HTMLAnchorElement)) {
            body.classList.remove('project-return-link-hover');
            return;
        }

        const hoveredLink = getProjectReturnLinkFromPoint(clientX, clientY);
        const isHovered = hoveredLink === returnLink;
        body.classList.toggle('project-return-link-hover', isHovered);
        returnLink.classList.toggle('is-hover-forced', isHovered);
    }

    function updateProjectReturnLinkVisibility() {
        if (!isProjectPage) {
            return;
        }

        const returnCard = backContent?.querySelector('.project-card--gallery-return');
        if (!(returnCard instanceof HTMLElement)) {
            body.classList.remove('project-return-card-visible');
            return;
        }

        const rect = returnCard.getBoundingClientRect();
        const isVisible = rect.bottom > 0 && rect.top < window.innerHeight;
        body.classList.toggle('project-return-card-visible', isVisible);
    }

    function updateProjectOutlineNavActive() {
        if (!isProjectPage || projectOutlineState.sections.length === 0) {
            updateProjectReturnLinkVisibility();
            return;
        }

        let activeIndex = 0;
        let nearestDistance = Number.POSITIVE_INFINITY;

        projectOutlineState.sections.forEach((section, index) => {
            const rect = section.card.getBoundingClientRect();
            const center = rect.top + rect.height / 2;
            const distance = Math.abs(center - window.innerHeight / 2);
            if (distance < nearestDistance) {
                nearestDistance = distance;
                activeIndex = index;
            }
        });

        updateProjectReturnLinkVisibility();

        if (projectOutlineState.activeIndex === activeIndex) {
            return;
        }

        projectOutlineState.activeIndex = activeIndex;
        projectOutlineState.sections.forEach((section, index) => {
            section.button.classList.toggle('is-active', index === activeIndex);
        });
    }

    function buildProjectOutlineNav() {
        if (!isProjectPage || !outlineNavItems || !backContent) {
            return;
        }

        const cards = Array.from(backContent.querySelectorAll('.project-card'));
        outlineNavItems.innerHTML = '';
        projectOutlineState.sections = cards.map((card, index) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'outline-nav-item';
            button.setAttribute('aria-label', getProjectSectionLabel(card, index));

            const line = document.createElement('span');
            line.className = 'outline-nav-line';

            const label = document.createElement('span');
            label.className = 'outline-nav-label';
            label.textContent = getProjectSectionLabel(card, index);

            button.appendChild(line);
            button.appendChild(label);
            outlineNavItems.appendChild(button);

            const section = {
                card,
                button
            };

            button.addEventListener('click', () => {
                const rect = card.getBoundingClientRect();
                const desiredTop = Math.max(40, window.innerHeight * 0.12);
                targetScroll = state.scrollPos + (rect.top - desiredTop);
                clampTargetScroll();
                pingProjectOutlineNav();
                updateProjectOutlineNavActive();
            });

            return section;
        });

        pingProjectOutlineNav();
        updateProjectOutlineNavActive();
    }

    function refreshProjectDetailLayout() {
        if (!isProjectPage) {
            return;
        }

        baseContentHeight = null;
        targetScroll = 0;
        state.scrollPos = 0;
        projectOutlineState.activeIndex = -1;
        tintState.imageCache = new WeakMap();
        tintState.cardCache = new WeakMap();

        updateContentPositions();
        refreshWireframe();
        initDynamicTint();
        buildProjectOutlineNav();
        syncResponsiveRoomDepth();
        centerFirstProjectCompositionItem();
        scheduleDynamicTintUpdate();
    }

    function refreshProjectContentMetrics() {
        if (!isProjectPage) {
            return;
        }

        baseContentHeight = null;
        clampTargetScroll();
        updateContentPositions();
        refreshWireframe();
        buildProjectOutlineNav();
    }

    function centerFirstAboutCompositionItem() {
        if (!isAboutPage || !backContent) {
            return;
        }

        const firstCard = backContent.querySelector('.about-card');
        if (!(firstCard instanceof HTMLElement)) {
            return;
        }

        const anchor = firstCard.querySelector('.about-info') || firstCard;
        targetScroll = getScrollToCenterElement(anchor);
        clampTargetScroll();
        state.scrollPos = targetScroll;
        updateContentPositions();
        refreshWireframe();
    }

    function measureAboutLogoWrapWidth() {
        if (!isAboutPage) {
            return;
        }

        const track = document.querySelector('.about-logo-track');
        const firstLogo = track?.querySelector('img');
        if (!(track instanceof HTMLElement) || !(firstLogo instanceof HTMLElement)) {
            aboutLogoState.wrapWidth = 0;
            document.documentElement.style.setProperty('--about-logo-wrap-width', '0px');
            return;
        }

        aboutLogoState.wrapWidth = firstLogo.getBoundingClientRect().width;
        document.documentElement.style.setProperty('--about-logo-wrap-width', `${aboutLogoState.wrapWidth}px`);
        syncAboutLogoPlaneCenter();
    }

    function syncAboutLogoPlaneCenter() {
        if (!isAboutPage || !(backContent instanceof HTMLElement)) {
            return;
        }

        const primaryMarquee = backContent?.querySelector('.about-logo-marquee');
        if (!(primaryMarquee instanceof HTMLElement)) {
            return;
        }

        const logoCenterY = (
            getElementOffsetTop(primaryMarquee)
            - getElementOffsetTop(backContent)
            + primaryMarquee.offsetHeight / 2
            + state.roomHeight
            - state.scrollPos
        );
        document.documentElement.style.setProperty('--about-logo-plane-center-y', `${logoCenterY}px`);
    }

    function getElementOffsetTop(element) {
        let offsetTop = 0;
        let current = element;

        while (current instanceof HTMLElement) {
            offsetTop += current.offsetTop;
            current = current.offsetParent;
        }

        return offsetTop;
    }

    function applyAboutHorizontalScroll(deltaY) {
        if (!isAboutPage) {
            return;
        }

        aboutLogoState.targetOffset = Math.max(
            0,
            aboutLogoState.targetOffset + deltaY * ABOUT_LOGO_SCROLL_MULTIPLIER
        );
    }

    function updateAboutLogoMarquee(now = performance.now()) {
        if (!isAboutPage) {
            return;
        }

        if (aboutLogoState.wrapWidth <= 0) {
            measureAboutLogoWrapWidth();
        }

        const previousFrameTime = aboutLogoState.lastFrameTime || now;
        const elapsedSeconds = Math.min(Math.max((now - previousFrameTime) / 1000, 0), 0.08);
        const smoothing = 1 - Math.pow(0.88, elapsedSeconds * 60);

        aboutLogoState.lastFrameTime = now;
        aboutLogoState.targetOffset += ABOUT_LOGO_AUTO_SPEED_PER_SECOND * elapsedSeconds;
        aboutLogoState.offset += (aboutLogoState.targetOffset - aboutLogoState.offset) * smoothing;

        if (aboutLogoState.wrapWidth > 0 && aboutLogoState.offset > aboutLogoState.wrapWidth * 4) {
            const resetDistance = Math.floor(aboutLogoState.offset / aboutLogoState.wrapWidth) * aboutLogoState.wrapWidth;
            aboutLogoState.offset -= resetDistance;
            aboutLogoState.targetOffset = Math.max(0, aboutLogoState.targetOffset - resetDistance);
        }

        document.documentElement.style.setProperty('--about-logo-scroll', `${aboutLogoState.offset}px`);
        document.documentElement.style.setProperty('--about-logo-offset', `${-aboutLogoState.offset}px`);
    }

    function waitForProjectIntroMedia(grid) {
        const media = Array.from(grid.querySelectorAll('img, video'));
        if (media.length === 0) {
            return Promise.resolve();
        }

        const pending = media.filter((element) => {
            if (element instanceof HTMLImageElement) {
                return !element.complete;
            }

            if (element instanceof HTMLVideoElement) {
                return element.readyState < 1;
            }

            return false;
        });

        if (pending.length === 0) {
            return Promise.resolve();
        }

        return new Promise((resolve) => {
            let remaining = pending.length;
            let settled = false;

            const finish = () => {
                if (settled) {
                    return;
                }
                settled = true;
                resolve();
            };

            const timeoutId = window.setTimeout(finish, 2500);

            const markReady = () => {
                remaining -= 1;
                if (remaining <= 0) {
                    window.clearTimeout(timeoutId);
                    finish();
                }
            };

            pending.forEach((element) => {
                if (element instanceof HTMLImageElement) {
                    element.addEventListener('load', markReady, { once: true });
                    element.addEventListener('error', markReady, { once: true });
                } else if (element instanceof HTMLVideoElement) {
                    element.addEventListener('loadedmetadata', markReady, { once: true });
                    element.addEventListener('error', markReady, { once: true });
                }
            });
        });
    }

    async function playProjectIntro() {
        if (!isProjectPage || !backContent) {
            return;
        }

        if (projectIntroState.animationFrame !== null) {
            cancelAnimationFrame(projectIntroState.animationFrame);
            projectIntroState.animationFrame = null;
        }

        const firstCard = backContent.querySelector('.project-card');
        if (!(firstCard instanceof HTMLElement)) {
            return;
        }

        await waitForProjectIntroMedia(firstCard);

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                centerFirstProjectCompositionItem();
                pingProjectOutlineNav();
            });
        });
    }

    function getScrollToCenterElement(element) {
        const rect = element.getBoundingClientRect();
        const elementCenter = rect.top + rect.height / 2;
        const viewportCenter = window.innerHeight / 2;
        return Math.max(0, state.scrollPos + (elementCenter - viewportCenter));
    }

    function getProjectMinimumScroll() {
        if (
            !isProjectPage
            || !backContent
            || body.classList.contains('project-video-intro-active')
            || body.classList.contains('project-video-intro-restoring')
        ) {
            return 0;
        }

        const firstCard = backContent.querySelector('.project-card');
        if (!(firstCard instanceof HTMLElement)) {
            return 0;
        }

        return getScrollToCenterElement(getProjectCompositionAnchor(firstCard));
    }

    function centerFirstProjectCompositionItem() {
        if (!isProjectPage || !backContent) {
            return;
        }

        const firstCard = backContent.querySelector('.project-card');
        if (!(firstCard instanceof HTMLElement)) {
            return;
        }

        targetScroll = getScrollToCenterElement(getProjectCompositionAnchor(firstCard));
        clampTargetScroll();
        state.scrollPos = targetScroll;
        updateContentPositions();
        refreshWireframe();
        updateProjectOutlineNavActive();
    }

    function getProjectCompositionAnchor(card) {
        const info = card.querySelector('.project-info');
        if (card.classList.contains('project-card--contained') && info instanceof HTMLElement) {
            return info;
        }

        return card;
    }

    function getProjectFirstCardCenteredScrollAtDepth(depth) {
        if (!isProjectPage || !backContent) {
            return targetScroll;
        }

        const firstCard = backContent.querySelector('.project-card');
        if (!(firstCard instanceof HTMLElement)) {
            return targetScroll;
        }

        const restoreDepth = parseFloat(depthSlider.value);
        const restoreScroll = state.scrollPos;
        const restoreTargetScroll = targetScroll;

        setDepthSliderValue(depth);
        state.scrollPos = restoreTargetScroll;
        updateContentPositions();

        const centeredScroll = getScrollToCenterElement(getProjectCompositionAnchor(firstCard));

        setDepthSliderValue(restoreDepth);
        targetScroll = restoreTargetScroll;
        state.scrollPos = restoreScroll;
        updateContentPositions();
        refreshWireframe();

        return centeredScroll;
    }

    if (isProjectPage) {
        window.SpaceToSpaceProjectDetail = {
            refresh: refreshProjectDetailLayout,
            refreshContentMetrics: refreshProjectContentMetrics,
            focusMedia: focusProjectMedia,
            playIntro: playProjectIntro
        };
    }

    // Initial setup
    syncAppViewportHeight();
    depthSlider.value = String(state.roomDepth);
    updateRoomDepth(state.roomDepth);
    
    // Initial positions - start with first item visible
    // We call updateContentPositions in the loop, but good to init
    updateContentPositions();
    refreshWireframe();
    initDynamicTint();
    buildProjectOutlineNav();
    syncResponsiveRoomDepth();
    if (isAboutPage) {
        centerFirstAboutCompositionItem();
        measureAboutLogoWrapWidth();
    }

    // Intro Animation - different types based on page
    if (!isProjectPage && !isAboutPage && !isContactPage) {
        // Index: plná animace s scrollem
        performIntroAnimation();
    }

    body.classList.toggle('dark-mode', document.documentElement.classList.contains('dark-mode'));
    scheduleDynamicTintUpdate();
    window.addEventListener('space-theme-change', scheduleDynamicTintUpdate);

    // Event Listeners
    depthSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        updateRoomDepth(val);
        syncFrontViewState(val);
    });

    if (scene) {
        scene.addEventListener('click', (e) => {
            const plainNavigationLink = e.target.closest('a[href]:not([data-project-focus-trigger="true"])');
            if (plainNavigationLink) {
                return;
            }

            const projectReturnLink = getProjectReturnLinkFromPoint(e.clientX, e.clientY);
            if (projectReturnLink) {
                e.preventDefault();
                e.stopPropagation();
                window.location.assign(projectReturnLink.href);
                return;
            }

            const focusTrigger = getProjectFocusTriggerFromPoint(e.clientX, e.clientY);
            if (focusTrigger) {
                e.preventDefault();
                e.stopPropagation();
                focusProjectMedia({
                    kind: focusTrigger.dataset.projectFocusKind,
                    src: focusTrigger.dataset.projectFocusSrc,
                    label: focusTrigger.dataset.projectFocusLabel,
                    trigger: focusTrigger
                });
                return;
            }

            const polygon = getBackWallPolygon();
            if (polygon.length !== 4) {
                return;
            }

            if (isPointInsidePolygon(e.clientX, e.clientY, polygon)) {
                toggleFrontView();
            }
        });

        if (isContactPage) {
            scene.addEventListener('wheel', (e) => {
                if (!frontViewState.isActive) {
                    return;
                }

                e.preventDefault();
                restoreFrontView();
            }, { passive: false });
        }

        if (isProjectPage) {
            scene.addEventListener('mousemove', (e) => {
                updateProjectReturnLinkHoverState(e.clientX, e.clientY);
            });

            scene.addEventListener('mouseleave', () => {
                updateProjectReturnLinkHoverState(-1, -1);
            });
        }
    }

    window.addEventListener('click', (e) => {
        if (!projectMediaFocusState.activeSrc || !frontViewState.isActive) {
            return;
        }

        e.preventDefault();
        e.stopPropagation();
        restoreFrontView();
    }, true);

    window.addEventListener('keydown', (e) => {
        if (!projectMediaFocusState.activeSrc || !frontViewState.isActive) {
            return;
        }

        if (e.key !== 'Escape') {
            return;
        }

        e.preventDefault();
        restoreFrontView();
    });

    function handleViewportResize() {
        syncAppViewportHeight();
        syncResponsiveRoomDepth();
        if (projectMediaFocusState.shell instanceof HTMLElement && projectMediaFocusState.activeSrc) {
            applyProjectMediaFocusRect(projectMediaFocusState.shell, getProjectMediaFocusTargetRect());
        }
        updateContentPositions(); // Immediate update on resize
        refreshWireframe();
        scheduleDynamicTintUpdate();
        buildProjectOutlineNav();
        if (isAboutPage) {
            baseContentHeight = null;
            centerFirstAboutCompositionItem();
            measureAboutLogoWrapWidth();
        }
    }

    window.addEventListener('resize', handleViewportResize);
    window.visualViewport?.addEventListener('resize', handleViewportResize);

    // Custom Scroll Logic (mouse wheel + touch swipe)
    let lastTouchY = null;
    const touchMultiplier = 2; // Slightly higher to compensate for shorter swipe travel

    function getContentHeight() {
        // Measure actual content height from floor-content
        // This is the source of truth for how much content we have
        if (floorContent) {
            return floorContent.scrollHeight;
        }
        return 5000; // Fallback
    }

    function clampTargetScroll() {
        // Calculate maxScroll based on actual content height
        // The content flows: floor -> back wall -> ceiling
        // We need to scroll through all content regardless of zoom level
        
        // Cache the content height on first call to avoid zoom dependency
        if (baseContentHeight === null) {
            baseContentHeight = getContentHeight();
        }
        
        // MaxScroll = content height + extra buffer to see the last items fully
        // Use a fixed multiplier instead of roomDepth to ensure consistent scrolling
        // The 2x multiplier accounts for the content appearing on floor, back wall, and ceiling
        const maxScroll = baseContentHeight * 2 + state.roomHeight * 2;
        
        const minScroll = getProjectMinimumScroll();
        if (targetScroll < minScroll) targetScroll = minScroll;
        if (targetScroll > maxScroll) targetScroll = maxScroll;
    }
    
    // Recalculate base content height on window resize
    window.addEventListener('resize', () => {
        baseContentHeight = null; // Reset to recalculate
    });
    
    function applyScrollDelta(deltaY) {
        applyAboutHorizontalScroll(deltaY);

        if (isAboutPage) {
            targetScroll += deltaY * ABOUT_VERTICAL_SCROLL_MULTIPLIER;
            clampTargetScroll();
            return;
        }

        if (deltaY > 0) {
            projectVideoIntroState.restoreHintArmed = false;
            projectVideoIntroState.restoreHintPendingTop = false;
        }

        if (maybeRestoreProjectVideoIntro(deltaY) || maybeStartProjectVideoIntroTransition(deltaY)) {
            return;
        }

        if (frontViewState.isActive) {
            restoreFrontView();
        }

        targetScroll += deltaY;
        clampTargetScroll();
        pingProjectOutlineNav();
    }

    function maybeRestoreProjectVideoIntro(deltaY) {
        const minScroll = getProjectMinimumScroll();
        const isRestoreArmed = projectVideoIntroState.restoreHintArmed;
        const isVisibleAtTop = state.scrollPos <= minScroll + 2;
        const isVisibleNearTop = state.scrollPos <= minScroll + VIDEO_INTRO_NEAR_TOP_RESTORE_PX;
        const isAtTop = targetScroll <= minScroll + 1 || isRestoreArmed || isVisibleNearTop;
        const wouldCrossTop = targetScroll + deltaY <= minScroll + 1 || isRestoreArmed;
        if (
            !isProjectPage
            || deltaY >= 0
            || projectVideoIntroState.isTransitioning
            || !body.classList.contains('project-video-intro-settled')
        ) {
            return false;
        }

        if (!wouldCrossTop) {
            return false;
        }

        if (!isVisibleAtTop && !isVisibleNearTop) {
            projectVideoIntroState.restoreHintPendingTop = true;
            return false;
        }

        if (projectVideoIntroState.restoreHintActive) {
            playProjectVideoRestoreHint(deltaY);
            return true;
        }

        if (!isVisibleNearTop && (projectVideoIntroState.restoreHintPendingTop || !isAtTop)) {
            projectVideoIntroState.restoreHintPendingTop = false;
            playProjectVideoRestoreHint(deltaY);
            return true;
        }

        projectVideoIntroState.isTransitioning = true;
        projectVideoIntroState.restoreHintArmed = false;
        projectVideoIntroState.restoreHintPendingTop = false;
        projectVideoIntroState.restoreHintActive = false;
        projectVideoIntroState.restoreHintOffset = 0;
        if (projectVideoIntroState.restoreHintReleaseTimer !== null) {
            window.clearTimeout(projectVideoIntroState.restoreHintReleaseTimer);
            projectVideoIntroState.restoreHintReleaseTimer = null;
        }
        if (
            window.SpaceToSpaceProjectDetail
            && typeof window.SpaceToSpaceProjectDetail.restoreVideoIntro === 'function'
        ) {
            window.SpaceToSpaceProjectDetail.restoreVideoIntro();
        }

        window.setTimeout(() => {
            targetScroll = 0;
            state.scrollPos = 0;
            updateContentPositions();
            refreshWireframe();

            animateDepthTo(1000, {
                duration: 900,
                frontViewActive: false,
                onUpdate: () => {
                    refreshWireframe();
                },
                onComplete: () => {
                    baseContentHeight = null;
                    targetScroll = 0;
                    state.scrollPos = 0;
                    updateContentPositions();
                    refreshWireframe();
                    buildProjectOutlineNav();

                    if (
                        window.SpaceToSpaceProjectDetail
                        && typeof window.SpaceToSpaceProjectDetail.completeVideoIntroRestore === 'function'
                    ) {
                        window.SpaceToSpaceProjectDetail.completeVideoIntroRestore();
                    }
                    projectVideoIntroState.isTransitioning = false;
                    projectVideoIntroState.revealScroll = 0;
                    projectVideoIntroState.fadeStarted = false;
                    projectVideoIntroState.ignoreForwardUntil = performance.now() + 700;
                }
            });
        }, VIDEO_INTRO_CONTENT_FADE_OUT_MS);

        return true;
    }

    function playProjectVideoRestoreHint(deltaY) {
        const currentDepth = parseFloat(depthSlider.value);
        if (!Number.isFinite(currentDepth)) {
            return;
        }

        if (projectVideoIntroState.restoreHintReleaseTimer !== null) {
            window.clearTimeout(projectVideoIntroState.restoreHintReleaseTimer);
            projectVideoIntroState.restoreHintReleaseTimer = null;
        }

        if (frontViewState.animationFrame !== null) {
            cancelAnimationFrame(frontViewState.animationFrame);
            frontViewState.animationFrame = null;
        }

        if (!projectVideoIntroState.restoreHintActive) {
            projectVideoIntroState.restoreHintBaseDepth = currentDepth;
            projectVideoIntroState.restoreHintOffset = 0;
        }

        projectVideoIntroState.restoreHintActive = true;
        projectVideoIntroState.restoreHintArmed = true;

        const maxHintOffset = 90;
        const force = Math.min(Math.abs(deltaY), 140);
        projectVideoIntroState.restoreHintOffset = Math.min(
            projectVideoIntroState.restoreHintOffset + force * 0.14,
            maxHintOffset
        );
        const isAtHintLimit = projectVideoIntroState.restoreHintOffset >= maxHintOffset;

        const easedOffset = 95 * (1 - Math.exp(-projectVideoIntroState.restoreHintOffset / 70));
        const hintDepth = Math.min(
            projectVideoIntroState.restoreHintBaseDepth + easedOffset,
            VIDEO_INTRO_START_DEPTH
        );

        frontViewState.suppressSync = true;
        setDepthSliderValue(hintDepth);
        frontViewState.suppressSync = false;
        refreshWireframe();

        projectVideoIntroState.restoreHintReleaseTimer = window.setTimeout(() => {
            projectVideoIntroState.restoreHintReleaseTimer = null;
            animateDepthTo(projectVideoIntroState.restoreHintBaseDepth, {
                duration: isAtHintLimit ? 320 : 620,
                frontViewActive: false,
                onUpdate: ({ progress }) => {
                    projectVideoIntroState.restoreHintOffset *= 1 - progress * 0.12;
                    refreshWireframe();
                },
                onComplete: () => {
                    projectVideoIntroState.restoreHintActive = false;
                    projectVideoIntroState.restoreHintOffset = 0;
                }
            });
        }, isAtHintLimit ? 0 : 90);
    }

    function maybeStartProjectVideoIntroTransition(deltaY) {
        if (
            !isProjectPage
            || !body.classList.contains('project-video-intro-active')
        ) {
            return false;
        }

        const now = performance.now();
        if (deltaY > 0 && now < projectVideoIntroState.ignoreForwardUntil) {
            projectVideoIntroState.ignoreForwardUntil = now + 250;
            return true;
        }

        if (deltaY <= 0) {
            return true;
        }

        if (projectVideoIntroState.isTransitioning) {
            return true;
        }

        startProjectVideoIntroFadeBeforeZoom();

        return true;
    }

    function startProjectVideoIntroFadeBeforeZoom() {
        projectVideoIntroState.fadeStarted = true;
        baseContentHeight = null;
        const introEndDepth = getProjectVideoIntroEndDepth();
        projectVideoIntroState.revealScroll = getProjectFirstCardCenteredScrollAtDepth(introEndDepth);
        buildProjectOutlineNav();

        if (
            window.SpaceToSpaceProjectDetail
            && typeof window.SpaceToSpaceProjectDetail.playVisibleVideos === 'function'
        ) {
            window.SpaceToSpaceProjectDetail.playVisibleVideos();
        }

        if (
            window.SpaceToSpaceProjectDetail
            && typeof window.SpaceToSpaceProjectDetail.beginVideoIntroFadeOut === 'function'
        ) {
            window.SpaceToSpaceProjectDetail.beginVideoIntroFadeOut();
        }

        if (projectVideoIntroState.fadeTimer !== null) {
            window.clearTimeout(projectVideoIntroState.fadeTimer);
        }

        projectVideoIntroState.fadeTimer = window.setTimeout(() => {
            projectVideoIntroState.fadeTimer = null;
            if (
                window.SpaceToSpaceProjectDetail
                && typeof window.SpaceToSpaceProjectDetail.revealVideoIntroContent === 'function'
            ) {
                window.SpaceToSpaceProjectDetail.revealVideoIntroContent();
            }
        }, VIDEO_INTRO_FADE_BEFORE_ZOOM_MS);

        completeProjectVideoIntroTransition();
    }

    function syncProjectVideoIntroRevealPosition(depth = parseFloat(depthSlider.value)) {
        targetScroll = projectVideoIntroState.revealScroll;
        state.scrollPos = projectVideoIntroState.revealScroll;
        setDepthSliderValue(depth);
        updateContentPositions();
        refreshWireframe();
    }

    function completeProjectVideoIntroTransition() {
        if (projectVideoIntroState.isTransitioning) {
            return;
        }

        projectVideoIntroState.isTransitioning = true;

        const introEndDepth = getProjectVideoIntroEndDepth();
        animateDepthTo(introEndDepth, {
            duration: 900,
            frontViewActive: false,
            onUpdate: ({ depth }) => {
                syncProjectVideoIntroRevealPosition(depth);
            },
            onComplete: () => {
                syncProjectVideoIntroRevealPosition(introEndDepth);
                projectVideoIntroState.restoreHintBaseDepth = introEndDepth;
                baseContentHeight = null;
                buildProjectOutlineNav();

                if (
                    window.SpaceToSpaceProjectDetail
                    && typeof window.SpaceToSpaceProjectDetail.playVisibleVideos === 'function'
                ) {
                    window.SpaceToSpaceProjectDetail.playVisibleVideos();
                }

                if (
                    window.SpaceToSpaceProjectDetail
                    && typeof window.SpaceToSpaceProjectDetail.settleVideoIntro === 'function'
                ) {
                    window.SpaceToSpaceProjectDetail.settleVideoIntro();
                }

                window.setTimeout(() => {
                    projectVideoIntroState.revealScroll = 0;
                    projectVideoIntroState.isTransitioning = false;
                    projectVideoIntroState.fadeStarted = false;
                }, 540);
            }
        });
    }
    
    if (!isContactPage) {
        window.addEventListener('wheel', (e) => {
            e.preventDefault(); // Prevent default to control the experience fully
            applyScrollDelta(e.deltaY);
        }, { passive: false });
    }

    // Touch support for mobile (vertical swipe behaves like scroll)
    if (!isContactPage) {
        window.addEventListener('touchstart', (e) => {
            if (e.touches.length === 0) return;
            lastTouchY = e.touches[0].clientY;
        }, { passive: true });
    }

    if (!isContactPage) {
        window.addEventListener('touchmove', (e) => {
            if (lastTouchY === null || e.touches.length === 0) return;
            const currentY = e.touches[0].clientY;
            const deltaY = (lastTouchY - currentY) * touchMultiplier;
            lastTouchY = currentY;
            applyScrollDelta(deltaY);
            e.preventDefault(); // Keep control consistent with wheel handling
        }, { passive: false });
    }

    if (!isContactPage) {
        window.addEventListener('touchend', () => {
            lastTouchY = null;
        }, { passive: true });
    }

    // Intro Animation Function
    function performIntroAnimation() {
        const startDepth = 3000; // Nejvzdálenější
        const endDepth = 500;    // Nejbližší
        const depthDuration = 2000; // ms - délka animace perspektivy
        const scrollAmount = 2700;   // px - kolik scrollnout
        const scrollDuration = 2200;  // ms - délka scroll animace
        const scrollStartAt = 0.1; // 0-1: Kdy začít scroll (0 = hned, 0.5 = v polovině depth animace, 1 = po depth animaci)
        
        const scrollStartTime = depthDuration * scrollStartAt;
        const totalDuration = Math.max(depthDuration, scrollStartTime + scrollDuration);
        
        const startTime = Date.now();
        
        // Nastavit počáteční hloubku
        depthSlider.value = startDepth;
        updateRoomDepth(startDepth);
        
        function animateIntro() {
            const elapsed = Date.now() - startTime;
            
            // Animace hloubky (běží celou depthDuration)
            if (elapsed < depthDuration) {
                const progress = elapsed / depthDuration;
                const eased = easeInOutCubic(progress);
                const currentDepth = startDepth + (endDepth - startDepth) * eased;
                
                depthSlider.value = currentDepth;
                updateRoomDepth(currentDepth);
            }
            
            // Scroll animace (začíná v scrollStartTime)
            if (elapsed >= scrollStartTime && elapsed < scrollStartTime + scrollDuration) {
                const scrollProgress = (elapsed - scrollStartTime) / scrollDuration;
                const easedScroll = easeInOutCubic(scrollProgress);
                targetScroll = scrollAmount * easedScroll;
            }
            
            // Pokračuj dokud není hotovo vše
            if (elapsed < totalDuration) {
                requestAnimationFrame(animateIntro);
            } else {
                state.introAnimationDone = true;
            }
        }
        
        animateIntro();
    }
    
    // Easing funkce pro plynulejší animaci
    function easeInOutCubic(t) {
        return t < 0.5 
            ? 4 * t * t * t 
            : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    // Throttle wireframe updates
    let frameCount = 0;
    const wireframeUpdateInterval = 2;

    // Animation Loop
    function animate(now) {
        updateAboutLogoMarquee(now);

        // Smooth scroll
        const diff = targetScroll - state.scrollPos;
        if (Math.abs(diff) > 0.5) {
            state.scrollPos += diff * 0.1;
            updateContentPositions();
            
            // Update wireframe less frequently and only if visible
            frameCount++;
            if (isWireframeVisible && frameCount >= wireframeUpdateInterval) {
                updateWireframe();
                frameCount = 0;
            }
        }
        
        requestAnimationFrame(animate);
    }
    if (!isContactPage) {
        animate();
    }


    function updateRoomDepth(val) {
        state.roomDepth = val;
        document.documentElement.style.setProperty('--room-depth', `${val}px`);

        if (isContactPage) {
            refreshWireframe();
            return;
        }

        updateContentPositions();
        refreshWireframe();
    }

    function getPositionOnTrack(distance) {
        // Deprecated function, logic moved to CSS zones
        return {};
    }

    function updateWireframe() {
        if (!scene || !backRect) {
            return;
        }

        // Get marker positions
        // Using getBoundingClientRect forces layout, but needed for exact sync with CSS 3D
        const sceneRect = scene.getBoundingClientRect();
        const tl = markers.tl.getBoundingClientRect();
        const tr = markers.tr.getBoundingClientRect();
        const bl = markers.bl.getBoundingClientRect();
        const br = markers.br.getBoundingClientRect();

        const width = sceneRect.width;
        const height = sceneRect.height;
        const points = {
            tl: { x: tl.left - sceneRect.left, y: tl.top - sceneRect.top },
            tr: { x: tr.left - sceneRect.left, y: tr.top - sceneRect.top },
            bl: { x: bl.left - sceneRect.left, y: bl.top - sceneRect.top },
            br: { x: br.left - sceneRect.left, y: br.top - sceneRect.top }
        };
        const uiFrame = getProjectUiFrame(points, sceneRect);

        if (isProjectPage) {
            rootStyle.setProperty('--project-frame-left', `${Math.round(uiFrame.left)}px`);
            rootStyle.setProperty('--project-frame-right', `${Math.round(uiFrame.right)}px`);
            rootStyle.setProperty('--project-frame-top', `${Math.round(uiFrame.top)}px`);
            rootStyle.setProperty('--project-frame-bottom', `${Math.round(uiFrame.bottom)}px`);
        }

        wireframeOverlay?.setAttribute('viewBox', `0 0 ${width} ${height}`);

        // Update Depth Lines (Corner to Corner)
        // TL: 0,0 to marker TL
        setLine(svgLines.tl, 0, 0, points.tl.x, points.tl.y);
        
        // TR: w,0 to marker TR
        setLine(svgLines.tr, width, 0, points.tr.x, points.tr.y);
        
        // BL: 0,h to marker BL
        setLine(svgLines.bl, 0, height, points.bl.x, points.bl.y);
        
        // BR: w,h to marker BR
        setLine(svgLines.br, width, height, points.br.x, points.br.y);

        // Update Back Rectangle
        backRect.setAttribute(
            'points',
            `${points.tl.x},${points.tl.y} ${points.tr.x},${points.tr.y} ${points.br.x},${points.br.y} ${points.bl.x},${points.bl.y}`
        );
    }

    function setLine(line, x1, y1, x2, y2) {
        line.setAttribute('x1', x1);
        line.setAttribute('y1', y1);
        line.setAttribute('x2', x2);
        line.setAttribute('y2', y2);
    }

    function updateContentPositions() {
        if (!floorContent || !backContent || !ceilingContent) {
            return;
        }

        if (isContactPage) {
            return;
        }

        rootStyle.setProperty('--space-scroll', `${state.scrollPos}px`);
        rootStyle.setProperty('--back-content-offset', `${state.roomHeight}px`);
        rootStyle.setProperty('--ceiling-content-offset', `${state.roomDepth + state.roomHeight}px`);
        syncAboutLogoPlaneCenter();
        scheduleDynamicTintUpdate();
        updateProjectOutlineNavActive();
    }
 });
