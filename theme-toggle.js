document.addEventListener('DOMContentLoaded', () => {
    // Vytvoříme ID pro toggle, pokud ještě neexistuje v HTML, abychom ho mohli ovládat
    const colorModeToggle = document.getElementById('colorModeToggle');
    
    // Funkce pro aktualizaci UI tlačítka
    const updateButtonState = (isBw) => {
        if (colorModeToggle) {
            colorModeToggle.textContent = isBw ? '●' : '○';
            colorModeToggle.classList.toggle('active', isBw);
        }
    };

    // Načíst uloženou preferenci
    const savedColorMode = localStorage.getItem('bwMode');
    if (savedColorMode === 'true') {
        document.body.classList.add('bw-mode');
        updateButtonState(true);
    } else {
        updateButtonState(false);
    }

    if (colorModeToggle) {
        colorModeToggle.addEventListener('click', () => {
            document.body.classList.toggle('bw-mode');
            const isBw = document.body.classList.contains('bw-mode');
            updateButtonState(isBw);
            localStorage.setItem('bwMode', isBw);
        });
    }
});



