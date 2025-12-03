document.addEventListener('DOMContentLoaded', () => {
    const depthSlider = document.getElementById('depthSlider');
    const room = document.querySelector('.room');
    const backWall = document.querySelector('.back-wall');
    
    // Counter Controls
    const btnPlus = document.getElementById('btnPlus');
    const btnMinus = document.getElementById('btnMinus');
    const planeCountDisplay = document.getElementById('planeCountVal');
    
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

    let state = {
        roomDepth: parseInt(depthSlider.value),
        roomHeight: window.innerHeight,
        planeCount: 1,
        introAnimationDone: false
    };

    // Initial setup
    updateRoomDepth(state.roomDepth);
    
    // Start intro animation
    performIntroAnimation();
    
    // Dark Mode Setup
    const darkModeToggle = document.getElementById('darkModeToggle');
    if (darkModeToggle) {
        // Načíst uloženou preferenci
        const savedMode = localStorage.getItem('darkMode');
        if (savedMode === 'true') {
            document.body.classList.add('dark-mode');
            darkModeToggle.textContent = '●';
            darkModeToggle.classList.add('active');
        }

        darkModeToggle.addEventListener('click', () => {
            document.body.classList.toggle('dark-mode');
            const isDark = document.body.classList.contains('dark-mode');
            
            darkModeToggle.textContent = isDark ? '●' : '○';
            darkModeToggle.classList.toggle('active', isDark);
            
            // Uložit preferenci
            localStorage.setItem('darkMode', isDark);
        });
    }
    
    // Event Listeners
    depthSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        updateRoomDepth(val);
    });

    window.addEventListener('resize', () => {
        state.roomHeight = window.innerHeight;
        updateWireframe();
    });

    btnPlus.addEventListener('click', () => {
        state.planeCount++;
        updatePlaneCount();
    });

    btnMinus.addEventListener('click', () => {
        if (state.planeCount > 1) {
            state.planeCount--;
            updatePlaneCount();
        }
    });

    function updatePlaneCount() {
        planeCountDisplay.textContent = state.planeCount;
        generatePartitions();
    }

    function generatePartitions() {
        // Remove existing partitions
        const existingPartitions = document.querySelectorAll('.partition');
        existingPartitions.forEach(p => p.remove());

        // We treat the .back-wall as the last plane (at index count-1).
        // So we need to generate state.planeCount - 1 partitions.
        // Or rather, we're visualizing 'slices'.
        // Formula: Z = (D/2) - (D * ((i+1)/count))
        // Where i is 0 to count-1.
        // The last one (i=count-1) is the back wall. We don't need to generate it, just position it (it's already positioned by CSS).
        
        // Wait, CSS positions back wall at -D/2.
        // My formula for last element: D/2 - D*(count/count) = D/2 - D = -D/2. Matches.
        
        for (let i = 0; i < state.planeCount - 1; i++) {
            const partition = document.createElement('div');
            partition.classList.add('wall', 'partition');
            
            // Calculate Z position
            // Total Depth is state.roomDepth
            // Front is D/2, Back is -D/2.
            
            const ratio = (i + 1) / state.planeCount;
            const zPos = (state.roomDepth / 2) - (state.roomDepth * ratio);
            
            partition.style.width = 'var(--room-width)';
            partition.style.height = 'var(--room-height)';
            partition.style.transform = `translateZ(${zPos}px)`;
            
            room.insertBefore(partition, backWall);
        }
        
        // Update wireframe/scene if needed?
        // Partitions are just divs.
    }

    function updateRoomDepth(val) {
        state.roomDepth = val;
        document.documentElement.style.setProperty('--room-depth', `${val}px`);
        
        // When depth changes, we need to re-calculate partition positions
        generatePartitions();
    }

    function updateWireframe() {
        // Get marker positions
        const tl = markers.tl.getBoundingClientRect();
        const tr = markers.tr.getBoundingClientRect();
        const bl = markers.bl.getBoundingClientRect();
        const br = markers.br.getBoundingClientRect();

        const w = window.innerWidth;
        const h = window.innerHeight;

        // Update Depth Lines
        setLine(svgLines.tl, 0, 0, tl.left, tl.top);
        setLine(svgLines.tr, w, 0, tr.left, tr.top);
        setLine(svgLines.bl, 0, h, bl.left, bl.top);
        setLine(svgLines.br, w, h, br.left, br.top);

        // Update Back Rectangle
        const points = `${tl.left},${tl.top} ${tr.left},${tr.top} ${br.left},${br.top} ${bl.left},${bl.top}`;
        backRect.setAttribute('points', points);
    }

    function setLine(line, x1, y1, x2, y2) {
        line.setAttribute('x1', x1);
        line.setAttribute('y1', y1);
        line.setAttribute('x2', x2);
        line.setAttribute('y2', y2);
    }

    // Intro Animation Function
    function performIntroAnimation() {
        const planeAddDuration = 800; // 1 sekunda pro přidání 3 ploch (celkem 4)
        const targetPlaneCount = 8;
        const delayBetweenPlanes = planeAddDuration / (targetPlaneCount - 1); // ~333ms mezi každou plochou
        
        const depthStartDelay = 200; // Krátká pauza před začátkem depth animace
        const depthStartAt = planeAddDuration + depthStartDelay; // Začít až po přidání ploch
        const startDepth = parseInt(depthSlider.value); // Aktuální (1000)
        const endDepth = 3000; // Maximum
        const depthDuration = 1000; // 2 sekundy pro oddálení
        
        const totalDuration = depthStartAt + depthDuration;
        const startTime = Date.now();
        
        let lastPlaneAdded = 1; // Začínáme s 1 plochou
        
        function animateIntro() {
            const elapsed = Date.now() - startTime;
            
            // Fáze 1: Postupné přidávání ploch (1 sekunda)
            if (elapsed < planeAddDuration) {
                const targetCount = Math.min(
                    Math.floor(elapsed / delayBetweenPlanes) + 1,
                    targetPlaneCount
                );
                
                if (targetCount > lastPlaneAdded) {
                    state.planeCount = targetCount;
                    updatePlaneCount();
                    lastPlaneAdded = targetCount;
                }
            } else if (lastPlaneAdded < targetPlaneCount) {
                // Ujistit se, že jsme přidali všechny plochy
                state.planeCount = targetPlaneCount;
                updatePlaneCount();
                lastPlaneAdded = targetPlaneCount;
            }
            
            // Fáze 2: Animace hloubky (začíná po planeAddDuration + delay)
            if (elapsed >= depthStartAt && elapsed < depthStartAt + depthDuration) {
                const depthProgress = (elapsed - depthStartAt) / depthDuration;
                const eased = easeInOutCubic(depthProgress);
                const currentDepth = startDepth + (endDepth - startDepth) * eased;
                
                depthSlider.value = currentDepth;
                updateRoomDepth(currentDepth);
            }
            
            // Pokračuj dokud není hotovo vše
            if (elapsed < totalDuration) {
                requestAnimationFrame(animateIntro);
            } else {
                state.introAnimationDone = true;
            }
        }
        
        animateIntro();
    }
    
    // Easing funkce pro plynulejší animaci
    function easeInOutCubic(t) {
        return t < 0.5 
            ? 4 * t * t * t 
            : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    // Animation Loop for Wireframe (needed because CSS transitions might be happening, or resize)
    function animate() {
        updateWireframe();
        requestAnimationFrame(animate);
    }
    animate();
});

