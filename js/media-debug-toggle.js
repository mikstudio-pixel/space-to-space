(() => {
    const STORAGE_KEY = 'mediaDebugVisible';
    const BODY_CLASS = 'media-debug-visible';
    const TOGGLE_SELECTOR = '[data-media-debug-toggle]';
    const DEBUG_ACCENT = '#00FFFF';

    function readStoredState() {
        try {
            return localStorage.getItem(STORAGE_KEY) === 'true';
        } catch (error) {
            return false;
        }
    }

    function writeStoredState(isEnabled) {
        try {
            localStorage.setItem(STORAGE_KEY, String(isEnabled));
        } catch (error) {
            // Ignore storage errors and keep the state in-memory for this session.
        }
    }

    function syncButtons(isEnabled) {
        document.querySelectorAll(TOGGLE_SELECTOR).forEach((button) => {
            button.textContent = isEnabled ? '●' : '○';
            button.classList.toggle('active', isEnabled);
            button.setAttribute('aria-pressed', isEnabled ? 'true' : 'false');
        });
    }

    function applyState(isEnabled) {
        if (!document.body) {
            return;
        }

        document.body.classList.toggle(BODY_CLASS, isEnabled);
        document.documentElement.classList.toggle(BODY_CLASS, isEnabled);
        syncButtons(isEnabled);
    }

    function initToggle() {
        const initialState = readStoredState();
        applyState(initialState);

        document.querySelectorAll(TOGGLE_SELECTOR).forEach((button) => {
            if (button.dataset.mediaDebugBound === 'true') {
                return;
            }

            button.dataset.mediaDebugBound = 'true';
            button.addEventListener('click', () => {
                const nextState = !document.body.classList.contains(BODY_CLASS);
                applyState(nextState);
                writeStoredState(nextState);
            });
        });
    }

    function extractAssetFileName(assetPath) {
        if (typeof assetPath !== 'string' || assetPath.trim() === '') {
            return 'unknown asset';
        }

        const normalizedPath = assetPath.split('#')[0].split('?')[0];
        const segments = normalizedPath.split('/');
        const rawName = segments[segments.length - 1] || normalizedPath;

        try {
            return decodeURIComponent(rawName);
        } catch (error) {
            return rawName;
        }
    }

    function formatAssetSize(bytes) {
        if (!Number.isFinite(bytes) || bytes <= 0) {
            return 'size unavailable';
        }

        const units = ['B', 'KB', 'MB', 'GB'];
        let value = bytes;
        let unitIndex = 0;

        while (value >= 1024 && unitIndex < units.length - 1) {
            value /= 1024;
            unitIndex += 1;
        }

        const precision = value >= 100 || unitIndex === 0 ? 0 : value >= 10 ? 1 : 2;
        return `${value.toFixed(precision)} ${units[unitIndex]}`;
    }

    function createR2Badge() {
        const badge = document.createElement('span');
        badge.className = 'media-badge-r2';
        badge.textContent = 'R';
        badge.setAttribute('aria-label', 'Asset hosted on R2');
        return badge;
    }

    function createInfoLabel(assetPath, options = {}) {
        const info = document.createElement('div');
        const name = document.createElement('span');
        const size = document.createElement('span');
        const fileName = typeof options.fileName === 'string' && options.fileName.trim() !== ''
            ? options.fileName.trim()
            : extractAssetFileName(assetPath);
        const sizeLabel = typeof options.sizeLabel === 'string' && options.sizeLabel.trim() !== ''
            ? options.sizeLabel.trim()
            : 'size unavailable';

        info.className = 'media-debug-info';

        name.className = 'media-debug-info__name';
        name.textContent = fileName;

        size.className = 'media-debug-info__size';
        size.textContent = sizeLabel;

        info.appendChild(name);
        info.appendChild(size);
        info.setAttribute('aria-label', `${fileName}, ${sizeLabel}`);

        return info;
    }

    function createOverlay(assetPath, options = {}) {
        const overlay = document.createElement('div');
        overlay.className = 'media-debug-overlay';

        overlay.appendChild(createInfoLabel(assetPath, options));

        if (options.showR2Badge) {
            overlay.appendChild(createR2Badge());
        }

        return overlay;
    }

    window.SpaceToSpaceMediaDebug = {
        accentColor: DEBUG_ACCENT,
        createOverlay,
        extractAssetFileName,
        formatAssetSize,
        isEnabled: () => Boolean(document.body && document.body.classList.contains(BODY_CLASS)),
        applyState
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initToggle);
    } else {
        initToggle();
    }
})();
