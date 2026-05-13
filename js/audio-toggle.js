(() => {
    const STORAGE_KEY = 'spaceAudioMuted';
    const TOGGLE_SELECTOR = '[data-audio-toggle]';
    const ICONS = {
        muted: `
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="m16 9 6 6"></path>
                <path d="m22 9-6 6"></path>
                <path d="M11 5 6 9H2v6h4l5 4V5Z"></path>
            </svg>
        `,
        unmuted: `
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M11 5 6 9H2v6h4l5 4V5Z"></path>
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
            </svg>
        `
    };

    let isMuted = readStoredMutedState();

    function readStoredMutedState() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            return stored === null ? true : stored !== 'false';
        } catch (error) {
            return true;
        }
    }

    function writeStoredMutedState(nextMuted) {
        try {
            localStorage.setItem(STORAGE_KEY, String(nextMuted));
        } catch (error) {
            // Ignore storage access issues and keep the in-memory state.
        }
    }

    function shouldForceMute(video) {
        if (!(video instanceof HTMLVideoElement)) {
            return true;
        }

        if (video.classList.contains('gallery-card-image')) {
            return true;
        }

        if (video.dataset.syncVideo && video.dataset.syncMaster !== 'true') {
            return true;
        }

        if (video.closest('.floor-content, .ceiling-content')) {
            return true;
        }

        return false;
    }

    function applyToVideo(video) {
        if (!(video instanceof HTMLVideoElement)) {
            return;
        }

        video.muted = isMuted || shouldForceMute(video);
    }

    function applyToAllVideos() {
        document.querySelectorAll('video').forEach(applyToVideo);
    }

    function syncButtons() {
        document.querySelectorAll(TOGGLE_SELECTOR).forEach((button) => {
            button.innerHTML = isMuted ? ICONS.muted : ICONS.unmuted;
            button.classList.toggle('active', !isMuted);
            button.setAttribute('aria-pressed', String(!isMuted));
            button.setAttribute('aria-label', isMuted ? 'Turn sound on' : 'Turn sound off');
            button.title = isMuted ? 'Turn sound on' : 'Turn sound off';
        });
    }

    function setMuted(nextMuted) {
        isMuted = Boolean(nextMuted);
        writeStoredMutedState(isMuted);
        syncButtons();
        applyToAllVideos();
    }

    function initToggle() {
        syncButtons();
        applyToAllVideos();

        document.querySelectorAll(TOGGLE_SELECTOR).forEach((button) => {
            if (button.dataset.audioToggleBound === 'true') {
                return;
            }

            button.dataset.audioToggleBound = 'true';
            button.addEventListener('click', () => {
                setMuted(!isMuted);
            });
        });
    }

    window.SpaceToSpaceAudio = {
        isMuted: () => isMuted,
        setMuted,
        applyToVideo,
        applyToAllVideos
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initToggle);
    } else {
        initToggle();
    }
})();
