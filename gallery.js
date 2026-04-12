document.addEventListener('DOMContentLoaded', () => {
    const body = document.body;
    const scene = document.querySelector('.scene');
    const intro = document.querySelector('.gallery-intro');
    const introTitle = document.querySelector('.gallery-intro-title');
    const room = document.querySelector('.room');
    const backWall = document.querySelector('.back-wall');
    const outlineNav = document.querySelector('.outline-nav');
    const outlineNavItems = document.querySelector('.outline-nav-items');
    
    // Config
    const spacing = 1250; // Larger distance between projects
    const startOffset = 120; // Match the near wireframe distance used on home
    
    // Real Project Data
    const projects = [
        {
            title: "Ron Feldman, Felix Stängle, Kateryna Simson",
            image: "assets/video-thumbnail.webp",
            position: "pos-center",
            url: "contact.html"
        },
        {
            title: "Julia Franas",
            image: "assets/projects/asp-wroclaw/pre-selection/franas-old-railway-roundhouse/media/web/ASP_Wroclaw_Julia_Franas_dyplom_01_home.webp",
            position: "pos-tl",
            url: "home.html"
        },
        { 
            title: "VISTA", 
            image: "assets/VISTA.webp",
            position: "pos-tr", 
            url: "home.html" 
        },
        { 
            title: "Stools Shuttlecock", 
            image: "assets/Stools Shuttlecock.webp",
            position: "pos-bl", 
            url: "home.html" 
        },
        { 
            title: "Light and Darkness", 
            image: "assets/Light and Darkness.webp",
            position: "pos-br", 
            url: "home.html" 
        },
        { 
            title: "Bamboo Whispers", 
            image: "assets/BambooWhispers.webp",
            position: "pos-center", 
            url: "home.html" 
        },
        { 
            title: "DepoRooms", 
            image: "assets/DepoRooms.webp",
            position: "pos-tl", 
            url: "home.html" 
        }
    ];

    // State
    let state = {
        scrollZ: 0,
        targetScrollZ: 0,
        // Increased maxScroll to allow reaching further projects like Delta/Epsilon
        maxScroll: (projects.length + 3) * spacing, 
        roomDepth: (projects.length + 4) * spacing, // Ensure room is deep enough
        roomHeight: window.innerHeight,
        introActive: Boolean(body && scene && intro && introTitle),
        introAnimationDone: false
    };
    let galleryOutlineButtons = [];
    let galleryOutlineIdleTimer = null;
    let projectPlanes = [];
    const introConfig = {
        duration: 3000,
        startPerspective: 18000,
        endPerspective: 1200,
        startSceneOpacity: 0.04,
        endSceneOpacity: 1,
        startWireframeOpacity: 0.08,
        endWireframeOpacity: 1,
        startRoomOffset: 2200,
        titleStartScale: 1,
        titleEndScale: 0.88,
        titleStartZ: 0,
        titleEndZ: -1400,
        titleStartLetterSpacing: 0.02,
        titleEndLetterSpacing: 0.12,
        titleFadeStart: 0.48,
        titleFadeEnd: 0.94
    };

    // DOM Elements for Wireframe
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

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function lerp(start, end, t) {
        return start + (end - start) * t;
    }

    function easeInOutCubic(t) {
        return t < 0.5
            ? 4 * t * t * t
            : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    function getBaseRoomZ() {
        return state.roomDepth / -2;
    }

    function setRoomPosition(zPos) {
        room.style.transform = `translateZ(${zPos}px)`;
    }

    function applyIntroStyles(progress) {
        if (!body) {
            return;
        }

        const clamped = clamp(progress, 0, 1);
        const eased = easeInOutCubic(clamped);
        const titleFadeProgress = clamp(
            (clamped - introConfig.titleFadeStart) / (introConfig.titleFadeEnd - introConfig.titleFadeStart),
            0,
            1
        );

        body.style.setProperty('--gallery-scene-perspective', `${lerp(introConfig.startPerspective, introConfig.endPerspective, eased)}px`);
        body.style.setProperty('--gallery-intro-perspective', `${lerp(introConfig.startPerspective, introConfig.endPerspective, eased)}px`);
        body.style.setProperty('--gallery-scene-opacity', lerp(introConfig.startSceneOpacity, introConfig.endSceneOpacity, eased).toFixed(4));
        body.style.setProperty('--gallery-wireframe-opacity', lerp(introConfig.startWireframeOpacity, introConfig.endWireframeOpacity, eased).toFixed(4));
        body.style.setProperty('--gallery-intro-opacity', '1');
        body.style.setProperty('--gallery-intro-title-opacity', (1 - easeInOutCubic(titleFadeProgress)).toFixed(4));
        body.style.setProperty('--gallery-intro-scale', lerp(introConfig.titleStartScale, introConfig.titleEndScale, eased).toFixed(4));
        body.style.setProperty('--gallery-intro-z', `${lerp(introConfig.titleStartZ, introConfig.titleEndZ, eased).toFixed(2)}px`);
        body.style.setProperty('--gallery-intro-letter-spacing', `${lerp(introConfig.titleStartLetterSpacing, introConfig.titleEndLetterSpacing, eased).toFixed(4)}em`);
    }

    function resetIntroStyles() {
        if (!body) {
            return;
        }

        body.style.setProperty('--gallery-scene-perspective', `${introConfig.endPerspective}px`);
        body.style.setProperty('--gallery-intro-perspective', `${introConfig.endPerspective}px`);
        body.style.setProperty('--gallery-scene-opacity', '1');
        body.style.setProperty('--gallery-wireframe-opacity', '1');
        body.style.setProperty('--gallery-intro-opacity', '0');
        body.style.setProperty('--gallery-intro-title-opacity', '0');
        body.style.setProperty('--gallery-intro-scale', '0.88');
        body.style.setProperty('--gallery-intro-z', `${introConfig.titleEndZ}px`);
        body.style.setProperty('--gallery-intro-letter-spacing', `${introConfig.titleEndLetterSpacing}em`);
    }

    function setIntroInitialState() {
        if (!state.introActive) {
            resetIntroStyles();
            return;
        }

        body.classList.add('gallery-intro-active');
        applyIntroStyles(0);
        setRoomPosition(getBaseRoomZ() + introConfig.startRoomOffset);
    }

    function finishGalleryIntro() {
        state.introActive = false;
        state.introAnimationDone = true;
        body.classList.remove('gallery-intro-active');
        resetIntroStyles();
        setRoomPosition(getBaseRoomZ() + state.scrollZ);
        updateWireframe();
        updateProjectPlaneStacking();
        updateGalleryOutlineNavActive();
    }

    function runGalleryIntro() {
        if (!state.introActive) {
            finishGalleryIntro();
            return;
        }

        const startTime = performance.now();

        function animateIntro(now) {
            const elapsed = now - startTime;
            const progress = clamp(elapsed / introConfig.duration, 0, 1);
            const eased = easeInOutCubic(progress);

            applyIntroStyles(progress);
            setRoomPosition(lerp(getBaseRoomZ() + introConfig.startRoomOffset, getBaseRoomZ(), eased));
            updateWireframe();
            updateProjectPlaneStacking();
            updateGalleryOutlineNavActive();

            if (progress < 1) {
                requestAnimationFrame(animateIntro);
                return;
            }

            finishGalleryIntro();
        }

        requestAnimationFrame(animateIntro);
    }

    function initGallery() {
        // Set room depth CSS variable
        document.documentElement.style.setProperty('--room-depth', `${state.roomDepth}px`);
        projectPlanes = [];

        // Available positions
        const positions = ['pos-center', 'pos-tl', 'pos-tr', 'pos-bl', 'pos-br'];

        // Generate Project Planes
        projects.forEach((proj, index) => {
            const partition = document.createElement('div');
            partition.classList.add('wall', 'partition');
            
            // Calculate Position
            // Start from front (approx state.roomDepth/2) and go backwards
            // Z = (Depth/2) - (index * spacing) - startOffset
            const zPos = (state.roomDepth / 2) - (index * spacing) - startOffset;
            
            partition.style.width = 'var(--room-width)';
            partition.style.height = 'var(--room-height)';
            partition.style.transform = `translateZ(${zPos}px)`;
            
            // Content
            // Change div to anchor tag for clickability if URL is provided
            const card = document.createElement(proj.url ? 'a' : 'div');
            card.classList.add('gallery-card');
            if (proj.url) {
                card.href = proj.url;
                // Optional: Open in new tab?
                // card.target = "_blank"; 
            }
            
            // Random Position or Specific Position
            let positionClass = '';
            if (proj.position) {
                positionClass = proj.position;
            } else {
                positionClass = positions[Math.floor(Math.random() * positions.length)];
            }
            card.classList.add(positionClass);
            
            // Project Image with lazy loading
            const img = document.createElement('img');
            img.src = proj.image;
            img.alt = proj.title;
            img.classList.add('gallery-card-image');
            img.loading = 'lazy'; // Native lazy loading
            img.decoding = 'async'; // Non-blocking decode
            
            const title = document.createElement('h2');
            title.textContent = proj.title;
            
            card.appendChild(img);
            card.appendChild(title);
            partition.appendChild(card);

            projectPlanes.push({ partition, card, index });
            
            room.insertBefore(partition, backWall);
        });

        buildGalleryOutlineNav();
        updateProjectPlaneStacking();

        // Paint the wireframe immediately instead of waiting for the first scroll tick.
        scheduleInitialWireframePaint();

        // Loop
        animate();
    }

    function scheduleInitialWireframePaint() {
        updateWireframe();

        // Two extra frames make sure layout + 3D transforms have settled on first load.
        requestAnimationFrame(() => {
            updateWireframe();
            requestAnimationFrame(() => {
                updateWireframe();
            });
        });
    }

    function getProjectTargetScroll(index) {
        return Math.max(0, Math.min(index * spacing + startOffset, state.maxScroll));
    }

    function pingGalleryOutlineNav() {
        if (!outlineNav) {
            return;
        }

        outlineNav.classList.add('is-engaged');
        if (galleryOutlineIdleTimer !== null) {
            window.clearTimeout(galleryOutlineIdleTimer);
        }
        galleryOutlineIdleTimer = window.setTimeout(() => {
            outlineNav.classList.remove('is-engaged');
            galleryOutlineIdleTimer = null;
        }, 1200);
    }

    function updateGalleryOutlineNavActive() {
        if (galleryOutlineButtons.length === 0) {
            return;
        }

        let activeIndex = 0;
        let nearestDistance = Number.POSITIVE_INFINITY;

        projects.forEach((_, index) => {
            const distance = Math.abs(getProjectTargetScroll(index) - state.scrollZ);
            if (distance < nearestDistance) {
                nearestDistance = distance;
                activeIndex = index;
            }
        });

        galleryOutlineButtons.forEach((button, index) => {
            button.classList.toggle('is-active', index === activeIndex);
        });
    }

    function updateProjectPlaneStacking() {
        if (projectPlanes.length === 0) {
            return;
        }

        const sortedPlanes = [...projectPlanes].sort((planeA, planeB) => {
            const distanceA = Math.abs(getProjectTargetScroll(planeA.index) - state.scrollZ);
            const distanceB = Math.abs(getProjectTargetScroll(planeB.index) - state.scrollZ);
            return distanceA - distanceB;
        });

        sortedPlanes.forEach((plane, rank) => {
            plane.partition.style.zIndex = String(projectPlanes.length - rank);
        });
    }

    function buildGalleryOutlineNav() {
        if (!outlineNavItems) {
            return;
        }

        outlineNavItems.innerHTML = '';
        galleryOutlineButtons = projects.map((project, index) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'outline-nav-item';
            button.setAttribute('aria-label', project.title);

            const line = document.createElement('span');
            line.className = 'outline-nav-line';

            const label = document.createElement('span');
            label.className = 'outline-nav-label';
            label.textContent = project.title;

            button.appendChild(line);
            button.appendChild(label);
            outlineNavItems.appendChild(button);

            button.addEventListener('click', () => {
                state.targetScrollZ = getProjectTargetScroll(index);
                pingGalleryOutlineNav();
            });

            return button;
        });

        pingGalleryOutlineNav();
        updateGalleryOutlineNavActive();
    }

    // Scroll Handling (mouse wheel + touch swipe)
    const wheelSpeed = 2.5;
    const touchMultiplier = 3; // Stronger response for shorter swipe distance
    let lastTouchY = null;

    function applyScrollDelta(delta) {
        if (state.introActive) {
            return;
        }

        state.targetScrollZ += delta;
        state.targetScrollZ = Math.max(0, Math.min(state.targetScrollZ, state.maxScroll));
        pingGalleryOutlineNav();
    }

    window.addEventListener('wheel', (e) => {
        // e.deltaY is usually positive for scrolling down/pulling towards user -> "Moving Forward"
        // Let's say scroll down = move forward into tunnel
        applyScrollDelta(e.deltaY * wheelSpeed);
    }, { passive: true });

    window.addEventListener('touchstart', (e) => {
        if (state.introActive) {
            lastTouchY = null;
            return;
        }
        if (e.touches.length === 0) return;
        lastTouchY = e.touches[0].clientY;
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
        if (state.introActive) {
            e.preventDefault();
            return;
        }
        if (lastTouchY === null || e.touches.length === 0) return;
        const currentY = e.touches[0].clientY;
        const deltaY = (lastTouchY - currentY) * touchMultiplier;
        lastTouchY = currentY;
        applyScrollDelta(deltaY);
        e.preventDefault(); // Keep control similar to wheel to avoid native scroll
    }, { passive: false });

    window.addEventListener('touchend', () => {
        lastTouchY = null;
    }, { passive: true });

    function animate() {
        // Smooth Scroll (Lerp)
        const diff = state.targetScrollZ - state.scrollZ;
        
        // Only update if there's meaningful change
        if (Math.abs(diff) > 0.01) {
            state.scrollZ += diff * 0.1;
            
            // Apply Transform
            // We move the room TOWARDS the camera to simulate moving forward
            // Initial room Z is -depth/2. We Add scrollZ.
            const baseZ = getBaseRoomZ();
            const finalZ = baseZ + state.scrollZ;
            
            setRoomPosition(finalZ);

            // Keep the wireframe synced every frame to avoid visible stepping while scrolling.
            updateWireframe();
            updateProjectPlaneStacking();
        }
        updateGalleryOutlineNavActive();
        
        requestAnimationFrame(animate);
    }

    // Check if wireframe is visible (CSS may hide it)
    const wireframeOverlay = document.querySelector('.wireframe-overlay');
    const isWireframeVisible = wireframeOverlay && 
        window.getComputedStyle(wireframeOverlay).display !== 'none';

    // Wireframe Logic (Copied/Adapted) - only run if visible
    function updateWireframe() {
        // Skip expensive calculations if wireframe is hidden
        if (!isWireframeVisible) return;
        
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

        const points = `${tl.left},${tl.top} ${tr.left},${tr.top} ${br.left},${br.top} ${bl.left},${bl.top}`;
        backRect.setAttribute('points', points);
    }

    function setLine(line, x1, y1, x2, y2) {
        line.setAttribute('x1', x1);
        line.setAttribute('y1', y1);
        line.setAttribute('x2', x2);
        line.setAttribute('y2', y2);
    }

    window.addEventListener('resize', () => {
        state.roomHeight = window.innerHeight;
        updateWireframe();
    });

    window.addEventListener('load', () => {
        scheduleInitialWireframePaint();
    });

    function setupDarkMode() {
        const darkModeToggle = document.getElementById('darkModeToggle');
        if (darkModeToggle) {
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
                localStorage.setItem('darkMode', isDark);
            });
        }
    }

    // Init only after all dependent constants and listeners are in place.
    setIntroInitialState();
    initGallery();
    setupDarkMode();
    runGalleryIntro();
});
