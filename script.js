document.addEventListener('DOMContentLoaded', () => {
    const depthSlider = document.getElementById('depthSlider');
    const room = document.querySelector('.room');
    const floorContent = document.querySelector('.floor-content');
    const backContent = document.querySelector('.back-content');
    const ceilingContent = document.querySelector('.ceiling-content');

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
        roomHeight: window.innerHeight, // Matching CSS 100vh
        scrollPos: 0,
        maxScroll: 5000 
    };

    // Initial setup
    updateRoomDepth(state.roomDepth);
    
    // Initial positions - start with first item visible
    // We call updateContentPositions in the loop, but good to init
    updateContentPositions();

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
        state.roomDepth = val;
        document.documentElement.style.setProperty('--room-depth', `${val}px`);
        updateContentPositions();
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
        // Move content within zones based on scrollPos
        // Floor: Moves along Z (away from camera)
        // Back Wall: Moves along Y (upwards)
        // Ceiling: Moves along Z (towards camera)

        // Scale factor: 1 scroll unit = 1 pixel movement
        
        // Floor Logic:
        // Items start at front (bottom) and move to back.
        // transform translateY(-scrollPos)? No, it's 3D.
        // Floor plane is X-rotated. Y-axis of the DIV is actually Z-axis of room (depth).
        // So translateY moves along depth.
        // Positive translateY moves "down" the div -> "back" into the room.
        // We want content to move AWAY. So translateY(-scrollPos)?
        // Wait. Floor wrapper is rotated 90deg.
        // Coordinate system of .floor-wrapper:
        // X: Left-Right. Y: Top-Bottom (which is Back-Front in 3D space? or Front-Back?)
        // Let's test direction.
        
        // For now, let's assume scrollPos is just an offset we apply to the container or items.
        // Better to apply to container for performance?
        // But we might want parallax or individual item control later.
        // Let's apply to container.
        
         // Floor: Move content 'up' (visually back into room? No, towards camera).
         // We determined floorContent translateY(-scroll) moves it K NÁM (Front).
         // This is correct for "moving through" effect.
         floorContent.style.transform = `translateY(${-state.scrollPos}px)`;
         
         // Back Wall: Move content 'up' (visually up).
         // Continuous flow.
         backContent.style.transform = `translateY(${-state.scrollPos + state.roomHeight}px)`; 
         
         // Ceiling Logic:
         // Rotated -90. Y axis points Front (towards camera).
         // We want ceiling content to move towards camera (same flow as floor).
         // So we need to move it along Positive Y.
         // But user says "scrolls in opposite direction".
         // Maybe my axis assumption for ceiling wrapper was wrong relative to scroll direction?
         // If Floor moves (-scroll), and Ceiling moves (+scroll), they move in opposite coordinate directions.
         // But visually both move K NÁM.
         // If user says it's wrong, maybe Ceiling SHOULD move AWAY?
         // Or maybe the content order is wrong?
         // Let's try inverting the Ceiling scroll direction to match Floor sign?
         // If Floor is -scroll, let's try Ceiling as -scroll (plus offset).
         // If I use -scroll on Ceiling:
         // Moves along -Y -> Dozadu (Away).
         // Let's try this. Maybe the "průlet" efekt on ceiling needs to go backwards?
         // No, that breaks physics of a tunnel.
         
         // Wait, if I scroll DOWN -> I go FORWARD.
         // Ceiling content should appear from far and go over my head.
         // So it moves Front. (+Y for Ceiling).
         // My previous code was `state.scrollPos - offset`. (Increasing positive).
         // Maybe the "opposite direction" comment means it moves TOO FAST or starts wrong?
         // Or maybe the user means "it moves backwards" (items disappear into the distance)?
         
         // Let's try inverting it based on feedback.
         // New logic: -scrollPos.
         // ceilingContent.style.transform = `translateY(${-state.scrollPos + offset}px)`;
         
         ceilingContent.style.transform = `translateY(${-state.scrollPos + (state.roomDepth + state.roomHeight)}px)`;
     }
 });
