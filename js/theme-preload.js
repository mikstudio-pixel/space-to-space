(() => {
    try {
        const root = document.documentElement;
        const isDark = localStorage.getItem('darkMode') === 'true';
        const isBw = localStorage.getItem('bwMode') === 'true';

        root.classList.toggle('dark-mode', isDark);
        root.classList.toggle('bw-mode', isBw);
        root.style.colorScheme = isDark ? 'dark' : 'light';
    } catch (error) {
        // Ignore storage access issues and keep default theme.
    }
})();
