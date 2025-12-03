// Research Page - Falling Numbers Generator (3D Perspective)
// Synchronizované čísla na všech třech stěnách

(function() {
    const floorContent = document.getElementById('floorContent');
    const backContent = document.getElementById('backContent');
    const ceilingContent = document.getElementById('ceilingContent');
    
    if (!floorContent || !backContent || !ceilingContent) return;

    // Konfigurace
    const config = {
        spawnInterval: 350,      // Interval mezi spawny (ms)
        maxNumbers: 200,         // Maximální počet čísel (vysoké číslo = prakticky bez limitu)
        baseSize: 15             // Základní velikost (rem)
    };

    let numberCount = 0;

    // Vytvoření synchronizovaného čísla na všech třech stěnách
    function createSyncedNumber(initialOffset = 0) {
        // Kontrola maximálního počtu
        const existingNumbers = floorContent.querySelectorAll('.falling-num');
        if (existingNumbers.length >= config.maxNumbers) {
            return;
        }

        // Generování parametrů - STEJNÉ pro všechny stěny
        const digit = Math.floor(Math.random() * 10);
        const xPos = 10 + Math.random() * 80; // 10% - 90%
        const size = config.baseSize * (0.5 + Math.random() * 1.5);
        const duration = 3 + Math.random() * 3; // 3-6 sekund
        const numberId = `num-${Date.now()}-${numberCount++}`;

        // Variace barvy
        const colors = ['var(--main-color)', '#ff5555', '#ff1111', '#cc2222'];
        const color = colors[Math.floor(Math.random() * colors.length)];

        // Společné CSS styly - animace běží neustále dokola
        const baseStyles = `
            position: absolute;
            left: ${xPos}%;
            top: 0%;
            font-size: ${size}rem;
            font-weight: bold;
            color: ${color};
            opacity: 0.9;
            transform: translateX(-50%);
            animation: fall-loop ${duration}s linear infinite;
            animation-delay: -${initialOffset * duration}s;
            will-change: top;
            text-shadow: 0 0 30px rgba(255, 51, 51, 0.2);
        `;

        // Vytvořit číslo na FLOOR
        const floorNum = document.createElement('div');
        floorNum.className = 'content-item falling-num';
        floorNum.textContent = digit;
        floorNum.dataset.syncId = numberId;
        floorNum.style.cssText = baseStyles;
        floorContent.appendChild(floorNum);

        // Vytvořit STEJNÉ číslo na BACK WALL
        const backNum = document.createElement('div');
        backNum.className = 'content-item falling-num';
        backNum.textContent = digit;
        backNum.dataset.syncId = numberId;
        backNum.style.cssText = baseStyles;
        backContent.appendChild(backNum);

        // Vytvořit STEJNÉ číslo na CEILING
        const ceilingNum = document.createElement('div');
        ceilingNum.className = 'content-item falling-num';
        ceilingNum.textContent = digit;
        ceilingNum.dataset.syncId = numberId;
        ceilingNum.style.cssText = baseStyles;
        ceilingContent.appendChild(ceilingNum);

        // Čísla se NEMAŽOU - existují navždy
    }

    // Spuštění generátoru
    function startGenerator() {
        // Počáteční spawn - čísla rozmístěná po celé ploše
        for (let i = 0; i < 50; i++) {
            const offset = Math.random(); // 0-1, náhodná počáteční pozice
            createSyncedNumber(offset);
        }

        // Kontinuální generování nových čísel
        setInterval(() => createSyncedNumber(0), config.spawnInterval);
    }

    // Start po načtení stránky
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startGenerator);
    } else {
        startGenerator();
    }
})();

// Dark Mode Toggle
(function() {
    function initDarkMode() {
        const toggleBtn = document.getElementById('darkModeToggle');
        if (!toggleBtn) return;

        // Načíst uloženou preferenci
        const savedMode = localStorage.getItem('darkMode');
        if (savedMode === 'true') {
            document.body.classList.add('dark-mode');
            toggleBtn.textContent = '●';
            toggleBtn.classList.add('active');
        }

        toggleBtn.addEventListener('click', () => {
            document.body.classList.toggle('dark-mode');
            const isDark = document.body.classList.contains('dark-mode');
            
            toggleBtn.textContent = isDark ? '●' : '○';
            toggleBtn.classList.toggle('active', isDark);
            
            // Uložit preferenci
            localStorage.setItem('darkMode', isDark);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initDarkMode);
    } else {
        initDarkMode();
    }
})();

// Depth Slider a Wireframe
(function() {
    function init() {
        const depthSlider = document.getElementById('depthSlider');
        
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

        function setLine(line, x1, y1, x2, y2) {
            if (!line) return;
            line.setAttribute('x1', x1);
            line.setAttribute('y1', y1);
            line.setAttribute('x2', x2);
            line.setAttribute('y2', y2);
        }

        function updateWireframe() {
            if (!markers.tl) return;
            
            const tl = markers.tl.getBoundingClientRect();
            const tr = markers.tr.getBoundingClientRect();
            const bl = markers.bl.getBoundingClientRect();
            const br = markers.br.getBoundingClientRect();

            const w = window.innerWidth;
            const h = window.innerHeight;

            setLine(svgLines.tl, 0, 0, tl.left, tl.top);
            setLine(svgLines.tr, w, 0, tr.left, tr.top);
            setLine(svgLines.bl, 0, h, bl.left, bl.top);
            setLine(svgLines.br, w, h, br.left, br.top);

            if (backRect) {
                const points = `${tl.left},${tl.top} ${tr.left},${tr.top} ${br.left},${br.top} ${bl.left},${bl.top}`;
                backRect.setAttribute('points', points);
            }
        }

        // Depth slider
        if (depthSlider) {
            depthSlider.addEventListener('input', (e) => {
                const val = parseInt(e.target.value);
                document.documentElement.style.setProperty('--room-depth', `${val}px`);
            });
        }

        // Animační loop pro wireframe
        function animate() {
            updateWireframe();
            requestAnimationFrame(animate);
        }
        animate();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
