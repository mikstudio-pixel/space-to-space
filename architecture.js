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
        planeCount: 1
    };

    // Initial setup
    updateRoomDepth(state.roomDepth);
    
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

    // Animation Loop for Wireframe (needed because CSS transitions might be happening, or resize)
    function animate() {
        updateWireframe();
        requestAnimationFrame(animate);
    }
    animate();
});
