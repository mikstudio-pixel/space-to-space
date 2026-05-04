function initSpaceToSpaceVideoProjection() {
    const body = document.body;
    if (!body || body.dataset.videoProjectionInitialized === 'true') {
        return;
    }

    const videos = Array.from(document.querySelectorAll('[data-sync-video]'));
    if (videos.length === 0) {
        return;
    }

    const videoModeToggle = document.getElementById('videoModeToggle');
    const depthSlider = document.getElementById('depthSlider');
    const STORAGE_KEY = 'contactVideoPerspectiveMode';

    const masterVideo = document.querySelector('[data-sync-master="true"]');
    if (!(masterVideo instanceof HTMLVideoElement)) {
        return;
    }

    body.dataset.videoProjectionInitialized = 'true';

    const slaveVideos = videos.filter((video) => video !== masterVideo);
    const canvases = {
        left: document.querySelector('[data-perspective-canvas="left"]'),
        right: document.querySelector('[data-perspective-canvas="right"]'),
        ceiling: document.querySelector('[data-perspective-canvas="ceiling"]'),
        floor: document.querySelector('[data-perspective-canvas="floor"]'),
        back: document.querySelector('[data-perspective-canvas="back"]')
    };
    const contexts = Object.fromEntries(
        Object.entries(canvases).map(([key, canvas]) => [
            key,
            canvas instanceof HTMLCanvasElement ? canvas.getContext('2d') : null
        ])
    );
    const textureCanvas = document.createElement('canvas');
    const textureContext = textureCanvas.getContext('2d');

    function setVideoMode(isPerspective) {
        body.classList.toggle('video-mode-perspective', isPerspective);
        body.classList.toggle('video-mode-copies', !isPerspective);

        if (videoModeToggle) {
            videoModeToggle.textContent = isPerspective ? '●' : '○';
            videoModeToggle.classList.toggle('active', isPerspective);
        }
    }

    const shouldUseStorage = body.dataset.videoProjectionStorage !== 'off';
    const savedMode = shouldUseStorage ? localStorage.getItem(STORAGE_KEY) : null;
    const defaultPerspective = body.dataset.videoProjectionDefault === 'perspective';
    setVideoMode(savedMode === null ? defaultPerspective : savedMode === 'true');

    function syncVideo(source, target) {
        if (Math.abs(source.currentTime - target.currentTime) > 0.18) {
            target.currentTime = source.currentTime;
        }
    }

    function resizeCanvas(canvas) {
        if (!(canvas instanceof HTMLCanvasElement)) {
            return;
        }

        const rect = canvas.getBoundingClientRect();
        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        const width = Math.max(1, Math.round(rect.width * ratio));
        const height = Math.max(1, Math.round(rect.height * ratio));

        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        }
    }

    function clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }

    function renderProjectionTexture(roomWidth, roomHeight, roomDepth) {
        const videoWidth = masterVideo.videoWidth;
        const videoHeight = masterVideo.videoHeight;
        const projectionWidth = roomWidth + roomDepth * 2;
        const projectionHeight = roomHeight + roomDepth * 2;
        const projectionAspect = projectionWidth / projectionHeight;
        const videoAspect = videoWidth / videoHeight;
        const textureScale = Math.min(1, 2048 / Math.max(projectionWidth, projectionHeight));
        const textureWidth = Math.max(1, Math.round(projectionWidth * textureScale));
        const textureHeight = Math.max(1, Math.round(projectionHeight * textureScale));

        if (textureCanvas.width !== textureWidth || textureCanvas.height !== textureHeight) {
            textureCanvas.width = textureWidth;
            textureCanvas.height = textureHeight;
        }

        let cropWidth = videoWidth;
        let cropHeight = videoHeight;

        if (videoAspect > projectionAspect) {
            cropWidth = videoHeight * projectionAspect;
        } else {
            cropHeight = videoWidth / projectionAspect;
        }

        const cropX = (videoWidth - cropWidth) / 2;
        const cropY = (videoHeight - cropHeight) / 2;

        textureContext.clearRect(0, 0, textureWidth, textureHeight);
        textureContext.drawImage(
            masterVideo,
            cropX,
            cropY,
            cropWidth,
            cropHeight,
            0,
            0,
            textureWidth,
            textureHeight
        );
    }

    function drawBackFace(context, canvas, roomWidth, roomHeight, roomDepth) {
        context.clearRect(0, 0, canvas.width, canvas.height);
        const projectionWidth = roomWidth + roomDepth * 2;
        const projectionHeight = roomHeight + roomDepth * 2;
        const scaleX = textureCanvas.width / projectionWidth;
        const scaleY = textureCanvas.height / projectionHeight;

        context.drawImage(
            textureCanvas,
            roomDepth * scaleX,
            roomDepth * scaleY,
            roomWidth * scaleX,
            roomHeight * scaleY,
            0,
            0,
            canvas.width,
            canvas.height
        );
    }

    function drawAtlasFace(context, canvas, roomWidth, roomHeight, roomDepth, regionX, regionY, regionWidth, regionHeight) {
        context.clearRect(0, 0, canvas.width, canvas.height);
        const projectionWidth = roomWidth + roomDepth * 2;
        const projectionHeight = roomHeight + roomDepth * 2;
        const scaleX = textureCanvas.width / projectionWidth;
        const scaleY = textureCanvas.height / projectionHeight;

        context.drawImage(
            textureCanvas,
            regionX * scaleX,
            regionY * scaleY,
            regionWidth * scaleX,
            regionHeight * scaleY,
            0,
            0,
            canvas.width,
            canvas.height
        );
    }

    function drawSideFace(context, canvas, roomWidth, roomHeight, roomDepth, side) {
        context.clearRect(0, 0, canvas.width, canvas.height);

        const srcWidth = textureCanvas.width;
        const srcHeight = textureCanvas.height;
        const projectionWidth = roomWidth + roomDepth * 2;
        const projectionHeight = roomHeight + roomDepth * 2;
        const safeDepth = Math.max(roomDepth, 1);
        const epsilon = Math.max(safeDepth * 0.002, 1);
        const columns = Math.max(canvas.width, 1);
        const sourceTop = roomDepth / projectionHeight;
        const sourceBottom = (roomDepth + roomHeight) / projectionHeight;

        for (let column = 0; column < columns; column += 1) {
            const t0 = columns === 1 ? 1 : column / (columns - 1);
            const t1 = columns === 1 ? 1 : Math.min((column + 1) / (columns - 1), 1);
            const depth0 = side === 'left' ? t0 : 1 - t0;
            const depth1 = side === 'left' ? t1 : 1 - t1;

            const z0 = -(epsilon + depth0 * (safeDepth - epsilon));
            const z1 = -(epsilon + depth1 * (safeDepth - epsilon));
            const wallX = side === 'left' ? -roomWidth / 2 : roomWidth / 2;

            const projectedX0 = (wallX * safeDepth) / -z0;
            const projectedX1 = (wallX * safeDepth) / -z1;

            const u0 = (projectedX0 + roomWidth / 2 + roomDepth) / projectionWidth;
            const u1 = (projectedX1 + roomWidth / 2 + roomDepth) / projectionWidth;

            const sourceLeft = clamp(Math.min(u0, u1), 0, 1);
            const sourceRight = clamp(Math.max(u0, u1), 0, 1);

            if (sourceRight <= sourceLeft || sourceBottom <= sourceTop) {
                continue;
            }

            context.drawImage(
                textureCanvas,
                sourceLeft * srcWidth,
                sourceTop * srcHeight,
                Math.max(1, (sourceRight - sourceLeft) * srcWidth),
                Math.max(1, (sourceBottom - sourceTop) * srcHeight),
                column,
                0,
                1,
                canvas.height
            );
        }
    }

    function drawHorizontalFace(context, canvas, roomWidth, roomHeight, roomDepth, face) {
        context.clearRect(0, 0, canvas.width, canvas.height);

        const srcWidth = textureCanvas.width;
        const srcHeight = textureCanvas.height;
        const projectionWidth = roomWidth + roomDepth * 2;
        const projectionHeight = roomHeight + roomDepth * 2;
        const safeDepth = Math.max(roomDepth, 1);
        const epsilon = Math.max(safeDepth * 0.002, 1);
        const rows = Math.max(canvas.height, 1);
        const sourceLeft = roomDepth / projectionWidth;
        const sourceRight = (roomDepth + roomWidth) / projectionWidth;

        for (let row = 0; row < rows; row += 1) {
            const t0 = rows === 1 ? 1 : row / (rows - 1);
            const t1 = rows === 1 ? 1 : Math.min((row + 1) / (rows - 1), 1);
            const depth0 = face === 'ceiling' ? t0 : 1 - t0;
            const depth1 = face === 'ceiling' ? t1 : 1 - t1;

            const z0 = -(epsilon + depth0 * (safeDepth - epsilon));
            const z1 = -(epsilon + depth1 * (safeDepth - epsilon));
            const wallY = face === 'ceiling' ? roomHeight / 2 : -roomHeight / 2;

            const projectedY0 = (wallY * safeDepth) / -z0;
            const projectedY1 = (wallY * safeDepth) / -z1;

            const v0 = (roomDepth + roomHeight / 2 - projectedY0) / projectionHeight;
            const v1 = (roomDepth + roomHeight / 2 - projectedY1) / projectionHeight;

            const sourceTop = clamp(Math.min(v0, v1), 0, 1);
            const sourceBottom = clamp(Math.max(v0, v1), 0, 1);

            if (sourceRight <= sourceLeft || sourceBottom <= sourceTop) {
                continue;
            }

            context.drawImage(
                textureCanvas,
                sourceLeft * srcWidth,
                sourceTop * srcHeight,
                Math.max(1, (sourceRight - sourceLeft) * srcWidth),
                Math.max(1, (sourceBottom - sourceTop) * srcHeight),
                0,
                row,
                canvas.width,
                1
            );
        }
    }

    function drawPerspectiveCanvases() {
        if (!body.classList.contains('video-mode-perspective')) {
            return;
        }

        if (!textureContext || masterVideo.readyState < 2 || masterVideo.videoWidth === 0 || masterVideo.videoHeight === 0) {
            return;
        }

        Object.values(canvases).forEach((canvas) => resizeCanvas(canvas));

        const roomDepth = Math.max(parseFloat(depthSlider?.value || '1000'), 1);
        const roomWidth = window.innerWidth;
        const roomHeight = window.innerHeight;

        renderProjectionTexture(roomWidth, roomHeight, roomDepth);

        if (canvases.back instanceof HTMLCanvasElement && contexts.back) {
            drawBackFace(contexts.back, canvases.back, roomWidth, roomHeight, roomDepth);
        }

        if (canvases.left instanceof HTMLCanvasElement && contexts.left) {
            drawAtlasFace(contexts.left, canvases.left, roomWidth, roomHeight, roomDepth, 0, roomDepth, roomDepth, roomHeight);
        }

        if (canvases.right instanceof HTMLCanvasElement && contexts.right) {
            drawAtlasFace(contexts.right, canvases.right, roomWidth, roomHeight, roomDepth, roomDepth + roomWidth, roomDepth, roomDepth, roomHeight);
        }

        if (canvases.ceiling instanceof HTMLCanvasElement && contexts.ceiling) {
            drawAtlasFace(contexts.ceiling, canvases.ceiling, roomWidth, roomHeight, roomDepth, roomDepth, 0, roomWidth, roomDepth);
        }

        if (canvases.floor instanceof HTMLCanvasElement && contexts.floor) {
            drawAtlasFace(contexts.floor, canvases.floor, roomWidth, roomHeight, roomDepth, roomDepth, roomDepth + roomHeight, roomWidth, roomDepth);
        }
    }

    function syncAll() {
        slaveVideos.forEach((video) => {
            syncVideo(masterVideo, video);

            if (masterVideo.paused && !video.paused) {
                video.pause();
            }

            if (!masterVideo.paused && video.paused) {
                video.play().catch(() => {});
            }
        });

        drawPerspectiveCanvases();
    }

    function tryPlay(video) {
        video.muted = true;
        video.playsInline = true;
        video.play().catch(() => {});
    }

    videos.forEach((video) => {
        video.addEventListener('loadedmetadata', () => {
            if (video !== masterVideo) {
                video.currentTime = masterVideo.currentTime;
            }
            tryPlay(video);
        });
    });

    masterVideo.addEventListener('play', syncAll);
    masterVideo.addEventListener('seeked', syncAll);
    masterVideo.addEventListener('timeupdate', syncAll);
    masterVideo.addEventListener('ratechange', syncAll);

    if (videoModeToggle) {
        videoModeToggle.addEventListener('click', () => {
            const isPerspective = !body.classList.contains('video-mode-perspective');
            setVideoMode(isPerspective);
            if (shouldUseStorage) {
                localStorage.setItem(STORAGE_KEY, String(isPerspective));
            }
            drawPerspectiveCanvases();
        });
    }

    if (depthSlider) {
        depthSlider.addEventListener('input', drawPerspectiveCanvases);
    }

    window.addEventListener('resize', drawPerspectiveCanvases);

    tryPlay(masterVideo);
    slaveVideos.forEach((video) => tryPlay(video));

    let rafId = null;

    function tick() {
        syncAll();
        rafId = window.requestAnimationFrame(tick);
    }

    rafId = window.requestAnimationFrame(tick);

    window.addEventListener('beforeunload', () => {
        if (rafId !== null) {
            window.cancelAnimationFrame(rafId);
        }
    });
}

window.SpaceToSpaceVideoProjection = {
    init: initSpaceToSpaceVideoProjection
};

document.addEventListener('DOMContentLoaded', initSpaceToSpaceVideoProjection);
