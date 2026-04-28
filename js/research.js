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
        // Kontrola maximálního počtu - musíme odstranit nejstarší čísla ze všech stěn
        const existingNumbers = floorContent.querySelectorAll('.falling-num');
        if (existingNumbers.length >= config.maxNumbers) {
            // Najdeme nejstarší ID
            const oldest = existingNumbers[0];
            if (oldest) {
                const syncId = oldest.dataset.syncId;
                // Odstraníme všechna čísla s tímto ID (ze všech stěn)
                const toRemove = document.querySelectorAll(`[data-sync-id="${syncId}"]`);
                toRemove.forEach(el => el.remove());
            }
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
        document.body.classList.toggle('dark-mode', document.documentElement.classList.contains('dark-mode'));
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
        const body = document.body;
        const depthSlider = document.getElementById('depthSlider');
        const scene = document.querySelector('.scene');
        const frontViewState = {
            isActive: false,
            restoreDepth: parseInt(depthSlider?.value || '0', 10),
            animationFrame: null,
            suppressSync: false
        };
        
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
                syncFrontViewState(val);
            });
        }

        if (scene) {
            scene.addEventListener('click', (e) => {
                const polygon = getBackWallPolygon();
                if (polygon.length !== 4) {
                    return;
                }

                if (isPointInsidePolygon(e.clientX, e.clientY, polygon)) {
                    toggleFrontView();
                }
            });

            scene.addEventListener('wheel', (e) => {
                if (!frontViewState.isActive) {
                    return;
                }

                e.preventDefault();
                restoreFrontView();
            }, { passive: false });
        }

        function getFrontDepth() {
            return parseInt(depthSlider?.min || '0', 10);
        }

        function setFrontViewActive(isActive) {
            frontViewState.isActive = isActive;
            body.classList.toggle('front-view-active', isActive);
        }

        function setDepthSliderValue(val) {
            if (!depthSlider) {
                return;
            }

            depthSlider.value = String(val);
            depthSlider.dispatchEvent(new Event('input', { bubbles: true }));
        }

        function animateDepthTo(targetDepth, options = {}) {
            const {
                duration = 420,
                frontViewActive = frontViewState.isActive
            } = options;
            const startDepth = parseFloat(depthSlider?.value || '0');
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
                return;
            }

            const startTime = performance.now();
            frontViewState.suppressSync = true;

            function step(now) {
                const progress = Math.min((now - startTime) / duration, 1);
                const eased = progress < 0.5
                    ? 4 * progress * progress * progress
                    : 1 - Math.pow(-2 * progress + 2, 3) / 2;
                const nextDepth = startDepth + (finalDepth - startDepth) * eased;

                setDepthSliderValue(nextDepth);

                if (progress < 1) {
                    frontViewState.animationFrame = requestAnimationFrame(step);
                    return;
                }

                frontViewState.animationFrame = null;
                setDepthSliderValue(finalDepth);
                frontViewState.suppressSync = false;
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
            if (!depthSlider) {
                return;
            }

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

            animateDepthTo(frontViewState.restoreDepth, { frontViewActive: false });
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
