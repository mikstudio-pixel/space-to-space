document.addEventListener('DOMContentLoaded', () => {
    const body = document.body;
    const depthSlider = document.getElementById('depthSlider');
    const scene = document.querySelector('.scene');
    const room = document.querySelector('.room');
    const floorContent = document.querySelector('.floor-content');
    const backContent = document.querySelector('.back-content');
    const ceilingContent = document.querySelector('.ceiling-content');
    const contentItems = document.querySelectorAll('.content-item');
    const rootStyle = document.documentElement.style;
    const outlineNav = document.querySelector('.outline-nav');
    const outlineNavItems = document.querySelector('.outline-nav-items');

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

    // Check if we're on practice scene, home page or contact page
    const isPracticeScene = document.querySelector('.practice-scene') !== null;
    const isHomePage = window.location.pathname.includes('home.html');
    const isContactPage = window.location.pathname.includes('contact.html');

    let state = {
        roomDepth: parseInt(depthSlider.value),
        roomHeight: window.innerHeight, // Matching CSS 100vh
        scrollPos: 0,
        maxScroll: 5000,
        initialRoomDepth: parseInt(depthSlider.value), // Store initial depth for practice scene
        introAnimationDone: false
    };
    const frontViewState = {
        isActive: false,
        restoreDepth: parseInt(depthSlider.value, 10),
        animationFrame: null,
        suppressSync: false
    };

    const tintState = {
        imageCache: new WeakMap(),
        cardCache: new WeakMap(),
        updateTimer: null
    };
    const homeOutlineState = {
        sections: [],
        activeIndex: -1,
        idleTimer: null
    };
    const tintCanvas = document.createElement('canvas');
    const tintContext = tintCanvas.getContext('2d', { willReadFrequently: true });

    // Check if wireframe is visible
    const wireframeOverlay = document.querySelector('.wireframe-overlay');
    const isWireframeVisible = wireframeOverlay && 
        window.getComputedStyle(wireframeOverlay).display !== 'none';

    function refreshWireframe() {
        if (!isWireframeVisible) {
            return;
        }

        requestAnimationFrame(updateWireframe);
    }

    function getFrontDepth() {
        return parseInt(depthSlider.min, 10);
    }

    function setFrontViewActive(isActive) {
        frontViewState.isActive = isActive;
        body.classList.toggle('front-view-active', isActive);
    }

    function setDepthSliderValue(val) {
        depthSlider.value = String(val);
        depthSlider.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function animateDepthTo(targetDepth, options = {}) {
        const {
            duration = 420,
            frontViewActive = frontViewState.isActive
        } = options;
        const startDepth = parseFloat(depthSlider.value);
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
            const eased = easeInOutCubic(progress);
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

    function parseRgbString(value) {
        const match = value.match(/\d+/g);
        if (!match || match.length < 3) {
            return body.classList.contains('dark-mode') ? [10, 10, 10] : [216, 216, 216];
        }
        return match.slice(0, 3).map(Number);
    }

    function parseColorTuple(value) {
        const match = String(value || '').match(/\d+/g);
        if (!match || match.length < 3) {
            return null;
        }
        return {
            r: Number(match[0]),
            g: Number(match[1]),
            b: Number(match[2])
        };
    }

    function getVisibleArea(rect) {
        const width = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0));
        const height = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
        return width * height;
    }

    function getColorStrength(color) {
        return Math.max(color.r, color.g, color.b) - Math.min(color.r, color.g, color.b);
    }

    function quantizeChannel(value) {
        return Math.max(0, Math.min(255, Math.round(value / 24) * 24));
    }

    function blendChannel(base, target, ratio) {
        return Math.round(base + (target - base) * ratio);
    }

    function boostTintChannel(value) {
        return Math.max(0, Math.min(255, Math.round(128 + (value - 128) * 1.22)));
    }

    function softenTint(color) {
        const computedBg = window.getComputedStyle(body).backgroundColor;
        const [baseR, baseG, baseB] = parseRgbString(computedBg);
        const boosted = {
            r: boostTintChannel(color.r),
            g: boostTintChannel(color.g),
            b: boostTintChannel(color.b)
        };
        const ratio = body.classList.contains('dark-mode') ? 0.58 : 0.68;
        return {
            r: blendChannel(baseR, boosted.r, ratio),
            g: blendChannel(baseG, boosted.g, ratio),
            b: blendChannel(baseB, boosted.b, ratio)
        };
    }

    function applyDynamicTint(color) {
        if (!color) {
            rootStyle.setProperty('--dynamic-tint-alpha', '0');
            return;
        }

        const softened = softenTint(color);
        rootStyle.setProperty('--dynamic-tint-rgb', `${softened.r}, ${softened.g}, ${softened.b}`);
        rootStyle.setProperty('--dynamic-tint-alpha', body.classList.contains('dark-mode') ? '0.22' : '0.40');
    }

    function extractImageTint(img) {
        if (!(img instanceof HTMLImageElement) || !tintContext || !img.complete || img.naturalWidth === 0) {
            return null;
        }

        const cached = tintState.imageCache.get(img);
        if (cached) {
            return cached;
        }

        const sampleSize = 28;
        tintCanvas.width = sampleSize;
        tintCanvas.height = sampleSize;
        tintContext.clearRect(0, 0, sampleSize, sampleSize);

        // Ignore poster margins and sample the more content-rich center area.
        const cropInsetX = img.naturalWidth * 0.18;
        const cropInsetY = img.naturalHeight * 0.14;
        const cropWidth = Math.max(1, img.naturalWidth - cropInsetX * 2);
        const cropHeight = Math.max(1, img.naturalHeight - cropInsetY * 2);
        tintContext.drawImage(
            img,
            cropInsetX,
            cropInsetY,
            cropWidth,
            cropHeight,
            0,
            0,
            sampleSize,
            sampleSize
        );

        let imageData;
        try {
            imageData = tintContext.getImageData(0, 0, sampleSize, sampleSize);
        } catch (error) {
            // file:// pages treat local images as unique origins, so canvas reads are blocked.
            return null;
        }

        const { data } = imageData;
        const buckets = new Map();
        let fallbackWeight = 0;
        let fallbackR = 0;
        let fallbackG = 0;
        let fallbackB = 0;

        for (let index = 0; index < data.length; index += 4) {
            const alpha = data[index + 3];
            if (alpha < 180) {
                continue;
            }

            const r = data[index];
            const g = data[index + 1];
            const b = data[index + 2];
            const max = Math.max(r, g, b);
            const min = Math.min(r, g, b);
            const saturation = max - min;
            const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;

            if (luminance < 24 || luminance > 232) {
                continue;
            }

            const midtoneBias = Math.max(0.2, 1 - Math.abs(luminance - 146) / 146);
            const fallbackPixelWeight = (1 + saturation / 72) * midtoneBias;
            fallbackWeight += fallbackPixelWeight;
            fallbackR += r * fallbackPixelWeight;
            fallbackG += g * fallbackPixelWeight;
            fallbackB += b * fallbackPixelWeight;

            if (saturation < 22) {
                continue;
            }

            const key = `${quantizeChannel(r)},${quantizeChannel(g)},${quantizeChannel(b)}`;
            const bucket = buckets.get(key) || { weight: 0, r: 0, g: 0, b: 0 };
            const pixelWeight = (1 + saturation / 28) * midtoneBias;
            bucket.weight += pixelWeight;
            bucket.r += r * pixelWeight;
            bucket.g += g * pixelWeight;
            bucket.b += b * pixelWeight;
            buckets.set(key, bucket);
        }

        let selected = null;
        for (const bucket of buckets.values()) {
            if (!selected || bucket.weight > selected.weight) {
                selected = bucket;
            }
        }

        if (!selected && fallbackWeight > 0) {
            selected = { weight: fallbackWeight, r: fallbackR, g: fallbackG, b: fallbackB };
        }

        if (!selected || selected.weight === 0) {
            return null;
        }

        const color = {
            r: Math.round(selected.r / selected.weight),
            g: Math.round(selected.g / selected.weight),
            b: Math.round(selected.b / selected.weight)
        };

        tintState.imageCache.set(img, color);
        return color;
    }

    function getCardTint(card) {
        if (!(card instanceof HTMLElement)) {
            return null;
        }

        const datasetTint = parseColorTuple(card.dataset.tintRgb);
        const cached = tintState.cardCache.get(card);
        if (cached) {
            return cached;
        }

        if (window.location.protocol === 'file:' && datasetTint) {
            tintState.cardCache.set(card, datasetTint);
            return datasetTint;
        }

        const images = Array.from(card.querySelectorAll('img'));
        const colors = images.map(extractImageTint).filter(Boolean);
        if (colors.length === 0) {
            if (datasetTint) {
                tintState.cardCache.set(card, datasetTint);
                return datasetTint;
            }
            return null;
        }

        const combined = colors.reduce(
            (acc, color) => ({
                r: acc.r + color.r * (getColorStrength(color) + 24),
                g: acc.g + color.g * (getColorStrength(color) + 24),
                b: acc.b + color.b * (getColorStrength(color) + 24),
                weight: acc.weight + getColorStrength(color) + 24
            }),
            { r: 0, g: 0, b: 0, weight: 0 }
        );
        const tint = {
            r: Math.round(combined.r / combined.weight),
            g: Math.round(combined.g / combined.weight),
            b: Math.round(combined.b / combined.weight)
        };

        tintState.cardCache.set(card, tint);
        return tint;
    }

    function getActiveBackCard() {
        if (!backContent) {
            return null;
        }

        const cards = Array.from(backContent.querySelectorAll('.project-card'));
        let activeCard = null;
        let maxVisibleArea = 0;

        cards.forEach((card) => {
            const area = getVisibleArea(card.getBoundingClientRect());
            if (area > maxVisibleArea) {
                activeCard = card;
                maxVisibleArea = area;
            }
        });

        return activeCard;
    }

    function scheduleDynamicTintUpdate() {
        if (!isHomePage) {
            return;
        }
        /* Home má pevné černé pozadí (style.css); žádné tintování podle obrázků */
    }

    function initDynamicTint() {
        if (!isHomePage || !backContent) {
            return;
        }

        applyDynamicTint(null);
    }

    function getHomeSectionLabel(card, index) {
        const explicitLabel = card.dataset.navLabel;
        if (explicitLabel) {
            return explicitLabel;
        }

        const heading = card.querySelector('h2')?.textContent?.trim();
        if (heading && index === 0) {
            return heading;
        }

        const alt = card.querySelector('img')?.alt?.trim();
        return alt || `Section ${index + 1}`;
    }

    function pingHomeOutlineNav() {
        if (!outlineNav) {
            return;
        }

        outlineNav.classList.add('is-engaged');
        if (homeOutlineState.idleTimer !== null) {
            window.clearTimeout(homeOutlineState.idleTimer);
        }
        homeOutlineState.idleTimer = window.setTimeout(() => {
            outlineNav.classList.remove('is-engaged');
            homeOutlineState.idleTimer = null;
        }, 1200);
    }

    function updateHomeOutlineNavActive() {
        if (!isHomePage || homeOutlineState.sections.length === 0) {
            return;
        }

        let activeIndex = 0;
        let nearestDistance = Number.POSITIVE_INFINITY;

        homeOutlineState.sections.forEach((section, index) => {
            const rect = section.card.getBoundingClientRect();
            const center = rect.top + rect.height / 2;
            const distance = Math.abs(center - window.innerHeight / 2);
            if (distance < nearestDistance) {
                nearestDistance = distance;
                activeIndex = index;
            }
        });

        if (homeOutlineState.activeIndex === activeIndex) {
            return;
        }

        homeOutlineState.activeIndex = activeIndex;
        homeOutlineState.sections.forEach((section, index) => {
            section.button.classList.toggle('is-active', index === activeIndex);
        });
    }

    function buildHomeOutlineNav() {
        if (!isHomePage || !outlineNavItems || !backContent) {
            return;
        }

        const cards = Array.from(backContent.querySelectorAll('.project-card'));
        outlineNavItems.innerHTML = '';
        homeOutlineState.sections = cards.map((card, index) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'outline-nav-item';
            button.setAttribute('aria-label', getHomeSectionLabel(card, index));

            const line = document.createElement('span');
            line.className = 'outline-nav-line';

            const label = document.createElement('span');
            label.className = 'outline-nav-label';
            label.textContent = getHomeSectionLabel(card, index);

            button.appendChild(line);
            button.appendChild(label);
            outlineNavItems.appendChild(button);

            const section = {
                card,
                button
            };

            button.addEventListener('click', () => {
                const rect = card.getBoundingClientRect();
                const desiredTop = Math.max(40, window.innerHeight * 0.12);
                targetScroll = state.scrollPos + (rect.top - desiredTop);
                clampTargetScroll();
                pingHomeOutlineNav();
                updateHomeOutlineNavActive();
            });

            return section;
        });

        pingHomeOutlineNav();
        updateHomeOutlineNavActive();
    }

    // Initial setup
    updateRoomDepth(state.roomDepth);
    
    // Initial positions - start with first item visible
    // We call updateContentPositions in the loop, but good to init
    updateContentPositions();
    refreshWireframe();
    initDynamicTint();
    buildHomeOutlineNav();

    // Intro Animation - different types based on page
    if (!isHomePage && !isContactPage) {
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
            scheduleDynamicTintUpdate();
        });
    }

    // Event Listeners
    depthSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        updateRoomDepth(val);
        syncFrontViewState(val);
    });

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

        if (isContactPage) {
            scene.addEventListener('wheel', (e) => {
                if (!frontViewState.isActive) {
                    return;
                }

                e.preventDefault();
                restoreFrontView();
            }, { passive: false });
        }
    }

    window.addEventListener('resize', () => {
        state.roomHeight = window.innerHeight;
        updateContentPositions(); // Immediate update on resize
        refreshWireframe();
        scheduleDynamicTintUpdate();
        buildHomeOutlineNav();
    });

    // Custom Scroll Logic (mouse wheel + touch swipe)
    let targetScroll = 0;
    let lastTouchY = null;
    const touchMultiplier = 2; // Slightly higher to compensate for shorter swipe travel

    function getContentHeight() {
        // Measure actual content height from floor-content
        // This is the source of truth for how much content we have
        if (floorContent) {
            return floorContent.scrollHeight;
        }
        return 5000; // Fallback
    }

    // Store initial content height to use as fixed reference
    let baseContentHeight = null;
    
    function clampTargetScroll() {
        // Calculate maxScroll based on actual content height
        // The content flows: floor -> back wall -> ceiling
        // We need to scroll through all content regardless of zoom level
        
        // Cache the content height on first call to avoid zoom dependency
        if (baseContentHeight === null) {
            baseContentHeight = getContentHeight();
        }
        
        // MaxScroll = content height + extra buffer to see the last items fully
        // Use a fixed multiplier instead of roomDepth to ensure consistent scrolling
        // The 2x multiplier accounts for the content appearing on floor, back wall, and ceiling
        const maxScroll = baseContentHeight * 2 + state.roomHeight * 2;
        
        if (targetScroll < 0) targetScroll = 0;
        if (targetScroll > maxScroll) targetScroll = maxScroll;
    }
    
    // Recalculate base content height on window resize
    window.addEventListener('resize', () => {
        baseContentHeight = null; // Reset to recalculate
    });
    
    function applyScrollDelta(deltaY) {
        if (frontViewState.isActive) {
            restoreFrontView();
        }

        targetScroll += deltaY;
        clampTargetScroll();
        pingHomeOutlineNav();
    }
    
    if (!isContactPage) {
        window.addEventListener('wheel', (e) => {
            e.preventDefault(); // Prevent default to control the experience fully
            applyScrollDelta(e.deltaY);
        }, { passive: false });
    }

    // Touch support for mobile (vertical swipe behaves like scroll)
    if (!isContactPage) {
        window.addEventListener('touchstart', (e) => {
            if (e.touches.length === 0) return;
            lastTouchY = e.touches[0].clientY;
        }, { passive: true });
    }

    if (!isContactPage) {
        window.addEventListener('touchmove', (e) => {
            if (lastTouchY === null || e.touches.length === 0) return;
            const currentY = e.touches[0].clientY;
            const deltaY = (lastTouchY - currentY) * touchMultiplier;
            lastTouchY = currentY;
            applyScrollDelta(deltaY);
            e.preventDefault(); // Keep control consistent with wheel handling
        }, { passive: false });
    }

    if (!isContactPage) {
        window.addEventListener('touchend', () => {
            lastTouchY = null;
        }, { passive: true });
    }

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

    // Throttle wireframe updates
    let frameCount = 0;
    const wireframeUpdateInterval = 2;

    // Animation Loop
    function animate() {
        // Smooth scroll
        const diff = targetScroll - state.scrollPos;
        if (Math.abs(diff) > 0.5) {
            state.scrollPos += diff * 0.1;
            updateContentPositions();
            
            // Update wireframe less frequently and only if visible
            frameCount++;
            if (isWireframeVisible && frameCount >= wireframeUpdateInterval) {
                updateWireframe();
                frameCount = 0;
            }
        }
        
        requestAnimationFrame(animate);
    }
    if (!isContactPage) {
        animate();
    }


    function updateRoomDepth(val) {
        state.roomDepth = val;
        document.documentElement.style.setProperty('--room-depth', `${val}px`);
        
        // Specific logic for practice scene text stretching
        if (document.querySelector('.practice-scene')) {
            updatePracticeTextStretch();
            // For practice scene, DON'T update content positions when depth changes
            // Only stretch the text - position stays the same
            // Wireframe still needs to update
            refreshWireframe();
            return;
        }

        if (isContactPage) {
            refreshWireframe();
            return;
        }

        updateContentPositions();
        refreshWireframe();
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
        if (!floorContent || !backContent || !ceilingContent) {
            return;
        }

        if (isContactPage) {
            return;
        }

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
        scheduleDynamicTintUpdate();
        updateHomeOutlineNavActive();
    }
 });
