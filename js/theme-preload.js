(() => {
    try {
        const root = document.documentElement;
        const savedDarkMode = localStorage.getItem('darkMode');
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const isDark = savedDarkMode === null ? prefersDark : savedDarkMode === 'true';
        const isBw = localStorage.getItem('bwMode') === 'true';

        root.classList.toggle('dark-mode', isDark);
        root.classList.toggle('bw-mode', isBw);
        root.style.colorScheme = isDark ? 'dark' : 'light';
    } catch (error) {
        // Ignore storage access issues and keep default theme.
    }
})();
