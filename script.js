document.addEventListener('DOMContentLoaded', () => {
    const depthSlider = document.getElementById('depthSlider');
    const room = document.querySelector('.room');
    const floorContent = document.querySelector('.floor-content');
    const backContent = document.querySelector('.back-content');
    const ceilingContent = document.querySelector('.ceiling-content');
    const contentItems = document.querySelectorAll('.content-item');

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

    // Check if we're on practice scene or home page
    const isPracticeScene = document.querySelector('.practice-scene') !== null;
    const isHomePage = window.location.pathname.includes('home.html');

    let state = {
        roomDepth: parseInt(depthSlider.value),
        roomHeight: window.innerHeight, // Matching CSS 100vh
        scrollPos: 0,
        maxScroll: 5000,
        initialRoomDepth: parseInt(depthSlider.value), // Store initial depth for practice scene
        introAnimationDone: false
    };

    // Initial setup
    updateRoomDepth(state.roomDepth);
    
    // Initial positions - start with first item visible
    // We call updateContentPositions in the loop, but good to init
    updateContentPositions();

    // Intro Animation - different types based on page
    if (!isHomePage) {
        if (isPracticeScene) {
            // Practice: pouze oddálení
            performPracticeIntroAnimation();
        } else {
            // Index: plná animace s scrollem
            performIntroAnimation();
        }
    }

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
        updateContentPositions(); // Immediate update on resize
    });

    // Custom Scroll Logic
    let targetScroll = 0;
    
    window.addEventListener('wheel', (e) => {
        e.preventDefault(); // Prevent default to control the experience fully
        
        targetScroll += e.deltaY;
        
        if (targetScroll < 0) targetScroll = 0;
        // Allow infinite scroll or clamp? Let's clamp to last item exiting
        const maxScroll = (contentItems.length * 800) + (2 * state.roomDepth + state.roomHeight);
        if (targetScroll > maxScroll) targetScroll = maxScroll;
        
    }, { passive: false });

    // Intro Animation Function
    function performIntroAnimation() {
        const startDepth = 3000; // Nejvzdálenější
        const endDepth = 500;    // Nejbližší
        const depthDuration = 2000; // ms - délka animace perspektivy
        const scrollAmount = 2700;   // px - kolik scrollnout
        const scrollDuration = 2200;  // ms - délka scroll animace
        const scrollStartAt = 0.1; // 0-1: Kdy začít scroll (0 = hned, 0.5 = v polovině depth animace, 1 = po depth animaci)
        
        const scrollStartTime = depthDuration * scrollStartAt;
        const totalDuration = Math.max(depthDuration, scrollStartTime + scrollDuration);
        
        const startTime = Date.now();
        
        // Nastavit počáteční hloubku
        depthSlider.value = startDepth;
        updateRoomDepth(startDepth);
        
        function animateIntro() {
            const elapsed = Date.now() - startTime;
            
            // Animace hloubky (běží celou depthDuration)
            if (elapsed < depthDuration) {
                const progress = elapsed / depthDuration;
                const eased = easeInOutCubic(progress);
                const currentDepth = startDepth + (endDepth - startDepth) * eased;
                
                depthSlider.value = currentDepth;
                updateRoomDepth(currentDepth);
            }
            
            // Scroll animace (začíná v scrollStartTime)
            if (elapsed >= scrollStartTime && elapsed < scrollStartTime + scrollDuration) {
                const scrollProgress = (elapsed - scrollStartTime) / scrollDuration;
                const easedScroll = easeInOutCubic(scrollProgress);
                targetScroll = scrollAmount * easedScroll;
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
    
    // Practice Intro Animation Function - pouze oddálení
    function performPracticeIntroAnimation() {
        const startDepth = 500;  // Nejbližší
        const endDepth = 3000;   // Nejvzdálenější
        const depthDuration = 1500; // 1.5 sekundy
        
        const startTime = Date.now();
        
        // Nastavit počáteční hloubku
        depthSlider.value = startDepth;
        updateRoomDepth(startDepth);
        
        function animateIntro() {
            const elapsed = Date.now() - startTime;
            
            // Animace hloubky
            if (elapsed < depthDuration) {
                const progress = elapsed / depthDuration;
                const eased = easeInOutCubic(progress);
                const currentDepth = startDepth + (endDepth - startDepth) * eased;
                
                depthSlider.value = currentDepth;
                updateRoomDepth(currentDepth);
                
                requestAnimationFrame(animateIntro);
            } else {
                // Konec animace
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

    // Animation Loop
    function animate() {
        // Smooth scroll
        const diff = targetScroll - state.scrollPos;
        if (Math.abs(diff) > 0.5) {
            state.scrollPos += diff * 0.1;
            updateContentPositions();
        }
        
        // Always update wireframe to match CSS transforms/transitions
        updateWireframe();
        
        requestAnimationFrame(animate);
    }
    animate();


    function updateRoomDepth(val) {
        const oldDepth = state.roomDepth;
        state.roomDepth = val;
        document.documentElement.style.setProperty('--room-depth', `${val}px`);
        
        // Specific logic for practice scene text stretching
        if (document.querySelector('.practice-scene')) {
            updatePracticeTextStretch();
            // For practice scene, DON'T update content positions when depth changes
            // Only stretch the text - position stays the same
            // Wireframe still needs to update
            return;
        }

        updateContentPositions();
    }

    function updatePracticeTextStretch() {
        // Find floor and ceiling content items in practice scene
        const items = document.querySelectorAll('.practice-scene .floor-content .practice-text, .practice-scene .ceiling-content .practice-text');
        if (items.length === 0) return;
        
        // We have 2 items per zone usually. 
        // The zone height is roomDepth.
        // Item height (container) is roomDepth / 2.
        // We want to stretch the text to fill this height.
        // Standard font height is roughly 0.8em (based on line-height).
        // But we can't easily measure em in px without computed style.
        // Let's try to just scaleY based on a factor derived from roomDepth.
        
        // Base depth 1000px -> Scale 1?
        // If depth 2000px -> Scale 2?
        // This assumes the font-size was designed for 1000px.
        // Current font-size is 22vw. It is width-dependent, not height-dependent.
        // So on a wide screen, text is tall. On narrow, short.
        // We want it to stretch to fill Depth.
        
        // Let's measure the natural height of the text element (unscaled).
        // We need to reset transform to measure?
        // Or just use a reference value.
        
        // Better: Compute required scale.
        // Container Height = state.roomDepth / 2 (assuming 2 items).
        // We need the text to be that tall.
        
        items.forEach(item => {
            // Reset transform temporarily to measure? No, expensive.
            // Assume layout gives it full height because of flex: 1
            // But text content doesn't fill it.
            
            // Let's use a purely CSS variable approach if possible?
            // No, JS is easier here.
            
            // We need the font's pixel height.
            // fontSize in px approx.
            const style = window.getComputedStyle(item);
            const fontSize = parseFloat(style.fontSize);
            const lineHeight = 0.8; // From CSS
            const textHeight = fontSize * lineHeight;
            
            // Available height per item
            // We assume 2 items. If more, divide by count.
            // Count per zone.
            const parent = item.closest('.zone-content');
            const count = parent.querySelectorAll('.content-item').length;
            const availableHeight = state.roomDepth / count;
            
            const scaleY = availableHeight / textHeight;
            
            item.style.transform = `scaleY(${scaleY})`;
        });
    }

    function getPositionOnTrack(distance) {
        // Deprecated function, logic moved to CSS zones
        return {};
    }

    function updateWireframe() {
        // Get marker positions
        // Using getBoundingClientRect forces layout, but needed for exact sync with CSS 3D
        const tl = markers.tl.getBoundingClientRect();
        const tr = markers.tr.getBoundingClientRect();
        const bl = markers.bl.getBoundingClientRect();
        const br = markers.br.getBoundingClientRect();

        // Screen dimensions
        const w = window.innerWidth;
        const h = window.innerHeight;

        // Update Depth Lines (Corner to Corner)
        // TL: 0,0 to marker TL
        setLine(svgLines.tl, 0, 0, tl.left, tl.top);
        
        // TR: w,0 to marker TR
        setLine(svgLines.tr, w, 0, tr.left, tr.top);
        
        // BL: 0,h to marker BL
        setLine(svgLines.bl, 0, h, bl.left, bl.top);
        
        // BR: w,h to marker BR
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

    function updateContentPositions() {
        const isPractice = document.querySelector('.practice-scene') !== null;
        
        if (isPractice) {
            // Practice scene: Use INITIAL depth for offsets so they don't change when slider moves
            // This ensures content stays in place when adjusting depth
            const fixedDepth = state.initialRoomDepth;
            
            // Floor content
            floorContent.style.transform = `translateY(${-state.scrollPos}px)`;
            
            // Back wall content starts after floor content ends
            backContent.style.transform = `translateY(${-state.scrollPos + fixedDepth}px)`;
            
            // Ceiling content starts after back wall
            ceilingContent.style.transform = `translateY(${-state.scrollPos + fixedDepth + state.roomHeight}px)`;
            return;
        }
        
        // Original scroll-based logic for index page
        // Floor: Move content towards camera
        floorContent.style.transform = `translateY(${-state.scrollPos}px)`;
         
        // Back Wall: Move content up, continuous flow
        backContent.style.transform = `translateY(${-state.scrollPos + state.roomHeight}px)`; 
         
        // Ceiling: Move content towards camera
        ceilingContent.style.transform = `translateY(${-state.scrollPos + (state.roomDepth + state.roomHeight)}px)`;
    }
 });
