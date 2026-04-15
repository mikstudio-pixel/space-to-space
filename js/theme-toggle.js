document.addEventListener('DOMContentLoaded', () => {
    const root = document.documentElement;
    const body = document.body;
    const colorModeToggle = document.getElementById('colorModeToggle');

    const syncRootThemeClasses = () => {
        root.classList.toggle('dark-mode', body.classList.contains('dark-mode'));
        root.classList.toggle('bw-mode', body.classList.contains('bw-mode'));
        root.style.colorScheme = body.classList.contains('dark-mode') ? 'dark' : 'light';
    };

    const updateButtonState = (isBw) => {
        if (colorModeToggle) {
            colorModeToggle.textContent = isBw ? '●' : '○';
            colorModeToggle.classList.toggle('active', isBw);
        }
    };

    body.classList.toggle('dark-mode', root.classList.contains('dark-mode'));
    body.classList.toggle('bw-mode', root.classList.contains('bw-mode'));
    syncRootThemeClasses();

    if (colorModeToggle) {
        updateButtonState(body.classList.contains('bw-mode'));

        colorModeToggle.addEventListener('click', () => {
            body.classList.toggle('bw-mode');
            const isBw = body.classList.contains('bw-mode');
            updateButtonState(isBw);
            localStorage.setItem('bwMode', isBw);
            syncRootThemeClasses();
        });
    }

    const observer = new MutationObserver(syncRootThemeClasses);
    observer.observe(body, { attributes: true, attributeFilter: ['class'] });
});



