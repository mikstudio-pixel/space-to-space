document.addEventListener('DOMContentLoaded', () => {
    const root = document.documentElement;
    const body = document.body;
    const darkModeToggle = document.getElementById('darkModeToggle');
    const colorModeToggle = document.getElementById('colorModeToggle');
    const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const syncRootThemeClasses = () => {
        const isDark = body.classList.contains('dark-mode');
        const isBw = body.classList.contains('bw-mode');

        root.classList.toggle('dark-mode', isDark);
        root.classList.toggle('bw-mode', isBw);
        root.style.colorScheme = isDark ? 'dark' : 'light';
    };

    const updateDarkToggleState = (isDark) => {
        if (darkModeToggle) {
            const nextMode = isDark ? 'light' : 'dark';
            darkModeToggle.textContent = nextMode;
            darkModeToggle.setAttribute('aria-pressed', String(isDark));
            darkModeToggle.setAttribute('aria-label', `Prepnout na ${nextMode}`);
        }
    };

    const updateBwToggleState = (isBw) => {
        if (colorModeToggle) {
            colorModeToggle.textContent = isBw ? '●' : '○';
            colorModeToggle.classList.toggle('active', isBw);
            colorModeToggle.setAttribute('aria-pressed', String(isBw));
        }
    };

    body.classList.toggle('dark-mode', root.classList.contains('dark-mode'));
    body.classList.toggle('bw-mode', root.classList.contains('bw-mode'));
    syncRootThemeClasses();
    updateDarkToggleState(body.classList.contains('dark-mode'));

    if (colorModeToggle) {
        updateBwToggleState(body.classList.contains('bw-mode'));

        colorModeToggle.addEventListener('click', () => {
            body.classList.toggle('bw-mode');
            const isBw = body.classList.contains('bw-mode');
            updateBwToggleState(isBw);
            localStorage.setItem('bwMode', isBw);
            syncRootThemeClasses();
        });
    }

    if (darkModeToggle) {
        darkModeToggle.addEventListener('click', () => {
            const isDark = !body.classList.contains('dark-mode');
            body.classList.toggle('dark-mode', isDark);
            syncRootThemeClasses();
            updateDarkToggleState(isDark);
            localStorage.setItem('darkMode', String(isDark));
            window.dispatchEvent(new CustomEvent('space-theme-change', {
                detail: { isDark }
            }));
        });
    }

    darkModeMediaQuery.addEventListener('change', (event) => {
        if (localStorage.getItem('darkMode') !== null) {
            return;
        }

        body.classList.toggle('dark-mode', event.matches);
        syncRootThemeClasses();
        updateDarkToggleState(event.matches);
        window.dispatchEvent(new CustomEvent('space-theme-change', {
            detail: { isDark: event.matches }
        }));
    });

    const observer = new MutationObserver(syncRootThemeClasses);
    observer.observe(body, { attributes: true, attributeFilter: ['class'] });
});



