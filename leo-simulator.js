/**
 * 3GPP TS 38.101-5 LEO Satellite Simulator
 * Module 4 only: Phased Array 3D radiation heatmap and 2D off-axis mask
 */

window.addEventListener('DOMContentLoaded', () => {
    const arraySizeXSlider = document.getElementById('array-size-x-slider');
    const arraySizeXVal = document.getElementById('array-size-x-val');
    const arraySizeYSlider = document.getElementById('array-size-y-slider');
    const arraySizeYVal = document.getElementById('array-size-y-val');
    const spacingSlider = document.getElementById('spacing-slider');
    const spacingVal = document.getElementById('spacing-val');
    const steeringSlider = document.getElementById('steering-slider');
    const steeringVal = document.getElementById('steering-val');
    const taylorToggle = document.getElementById('taylor-toggle');
    const renderToggle = document.getElementById('render-toggle');
    const axesToggle = document.getElementById('axes-toggle');
    const gridToggle = document.getElementById('grid-toggle');
    const screenshotBtn = document.getElementById('screenshot-btn');
    const gradientControls = document.getElementById('gradient-controls');
    const gradientColor1 = document.getElementById('gradient-color-1');
    const gradientColor2 = document.getElementById('gradient-color-2');
    const gradientColor3 = document.getElementById('gradient-color-3');
    const container3d = document.getElementById('webgl-container');

    let scene3d, camera3d, renderer3d, orbitControls, sphereGeometry, sphereMesh;
    let gridHelper, axesHelper;
    let originalPositions = [];

    function initThreeJS() {
        const width = container3d.clientWidth;
        const height = container3d.clientHeight;

        scene3d = new THREE.Scene();
        scene3d.background = new THREE.Color(0x03060b);

        camera3d = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
        camera3d.position.set(4, 3, 4);

        renderer3d = new THREE.WebGLRenderer({ antialias: true });
        renderer3d.setSize(width, height);
        renderer3d.setPixelRatio(window.devicePixelRatio);
        container3d.appendChild(renderer3d.domElement);

        orbitControls = new THREE.OrbitControls(camera3d, renderer3d.domElement);
        orbitControls.enableDamping = true;
        orbitControls.dampingFactor = 0.05;
        orbitControls.minDistance = 2;
        orbitControls.maxDistance = 15;

        sphereGeometry = new THREE.SphereGeometry(1.0, 60, 30, 0, Math.PI * 2, 0, Math.PI / 2);
        const posAttr = sphereGeometry.attributes.position;
        originalPositions = new Float32Array(posAttr.array);

        const colors = new Float32Array(posAttr.count * 3);
        sphereGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

        const material = new THREE.MeshBasicMaterial({
            vertexColors: true,
            side: THREE.DoubleSide,
            wireframe: false
        });

        sphereMesh = new THREE.Mesh(sphereGeometry, material);
        scene3d.add(sphereMesh);

        gridHelper = new THREE.GridHelper(6, 20, 0x1e293b, 0x0f172a);
        gridHelper.rotation.x = Math.PI / 2;
        gridHelper.position.z = -0.05;
        scene3d.add(gridHelper);

        axesHelper = new THREE.AxesHelper(3);
        axesHelper.position.z = 0.01;
        scene3d.add(axesHelper);
    }

    initThreeJS();

    function jetColor(v) {
        const r = Math.max(0, Math.min(1, 1.5 - 4 * Math.abs(v - 0.75)));
        const g = Math.max(0, Math.min(1, 1.5 - 4 * Math.abs(v - 0.5)));
        const b = Math.max(0, Math.min(1, 1.5 - 4 * Math.abs(v - 0.25)));
        return [r, g, b];
    }

    function hexToRgb(hex) {
        const parsed = /^#?([a-fA-F0-9]{6})$/.exec(hex);
        if (!parsed) return [1, 1, 1];
        const int = parseInt(parsed[1], 16);
        return [(int >> 16 & 255) / 255, (int >> 8 & 255) / 255, (int & 255) / 255];
    }

    function interpolateColor(c1, c2, t) {
        return [
            c1[0] + (c2[0] - c1[0]) * t,
            c1[1] + (c2[1] - c1[1]) * t,
            c1[2] + (c2[2] - c1[2]) * t,
        ];
    }

    function getGradientColor(v) {
        const c1 = hexToRgb(gradientColor1.value);
        const c2 = hexToRgb(gradientColor2.value);
        const c3 = hexToRgb(gradientColor3.value);
        if (v <= 0.5) {
            return interpolateColor(c1, c2, v * 2);
        }
        return interpolateColor(c2, c3, (v - 0.5) * 2);
    }

    function getTaylorWeights(N, SLL = -30, nbar = 4) {
        const weights = new Array(N).fill(0);
        const A = Math.acosh(Math.pow(10, -SLL / 20)) / Math.PI;
        const sigma2 = (nbar * nbar) / (A * A + (nbar - 0.5) * (nbar - 0.5));

        for (let i = 0; i < N; i++) {
            const z = (i - (N - 1) / 2) / (N / 2);
            let sum = 0;
            for (let m = 1; m < nbar; m++) {
                let num = 1;
                let den = 1;
                for (let p = 1; p < nbar; p++) {
                    const numTerm = 1 - (m * m) / (sigma2 * (A * A + (p - 0.5) * (p - 0.5)));
                    num *= numTerm;
                    if (p !== m) {
                        const denTerm = 1 - (m * m) / (p * p);
                        den *= denTerm;
                    }
                }
                const Fm = (Math.pow(-1, m + 1) / 2) * (num / den);
                sum += Fm * Math.cos(m * Math.PI * z);
            }
            weights[i] = 1 + 2 * sum;
        }

        const maxW = Math.max(...weights);
        return weights.map(w => w / maxW);
    }

    function getMaskLimit(angleDeg, peakEirp) {
        const absAngle = Math.abs(angleDeg);
        const limitFlat = Math.max(45, peakEirp + 2);
        const limitFar = 15;

        if (absAngle <= 5) {
            return limitFlat;
        } else if (absAngle <= 15) {
            const t = (absAngle - 5) / 10;
            return limitFlat + t * (limitFar - limitFlat);
        } else {
            return limitFar;
        }
    }

    function updatePhasedArrayVisuals() {
        const Nx = parseInt(arraySizeXSlider.value, 10);
        const Ny = parseInt(arraySizeYSlider.value, 10);
        const spacing = parseFloat(spacingSlider.value);
        const steeringDeg = parseFloat(steeringSlider.value);
        const steeringRad = steeringDeg * Math.PI / 180;
        const taylorOn = taylorToggle.checked;

        const wx = taylorOn ? getTaylorWeights(Nx, -30, 4) : new Array(Nx).fill(1);
        const wy = taylorOn ? getTaylorWeights(Ny, -30, 4) : new Array(Ny).fill(1);

        const peakEirp = 23 + 5 + 10 * Math.log10(Nx * Ny);

        if (sphereGeometry) {
            const posAttr = sphereGeometry.attributes.position;
            const colorAttr = sphereGeometry.attributes.color;
            const count = posAttr.count;
            const k_d = 2 * Math.PI * spacing;

            const sumWx = wx.reduce((a, b) => a + b, 0);
            const sumWy = wy.reduce((a, b) => a + b, 0);
            const wx_n = wx.map(w => w / sumWx);
            const wy_n = wy.map(w => w / sumWy);

            for (let i = 0; i < count; i++) {
                const ux = originalPositions[i * 3];
                const uy = originalPositions[i * 3 + 1];
                const uz = originalPositions[i * 3 + 2];

                let r = Math.sqrt(ux * ux + uy * uy + uz * uz);
                if (r < 0.0001) r = 1.0;
                let theta = Math.acos(uz / r);
                let phi = Math.atan2(uy, ux);

                let argX = Math.sin(theta) * Math.cos(phi) - Math.sin(steeringRad);
                let argY = Math.sin(theta) * Math.sin(phi);

                let sumX_re = 0, sumX_im = 0;
                for (let m = 0; m < Nx; m++) {
                    let phase = m * k_d * argX;
                    sumX_re += wx_n[m] * Math.cos(phase);
                    sumX_im += wx_n[m] * Math.sin(phase);
                }
                let magX = Math.sqrt(sumX_re * sumX_re + sumX_im * sumX_im);

                let sumY_re = 0, sumY_im = 0;
                for (let n = 0; n < Ny; n++) {
                    let phase = n * k_d * argY;
                    sumY_re += wy_n[n] * Math.cos(phase);
                    sumY_im += wy_n[n] * Math.sin(phase);
                }
                let magY = Math.sqrt(sumY_re * sumY_re + sumY_im * sumY_im);

                let afMag = magX * magY;
                let db = afMag > 0.0001 ? 20 * Math.log10(afMag) : -80;
                if (db < -40) db = -40;

                let scale = 0.2 + 2.0 * (db + 40) / 40;
                posAttr.setXYZ(i, ux * scale, uy * scale, uz * scale);

                let colorVal = (db + 40) / 40;
                let color = renderToggle.checked ? getGradientColor(colorVal) : jetColor(colorVal);
                colorAttr.setXYZ(i, color[0], color[1], color[2]);
            }

            posAttr.needsUpdate = true;
            colorAttr.needsUpdate = true;
            sphereGeometry.computeVertexNormals();
        }

        const eirpCutData = [];
        const maskLimitData = [];
        let maskExceeded = false;

        const sumWx = wx.reduce((a, b) => a + b, 0);
        const wx_n = wx.map(w => w / sumWx);
        const k_d = 2 * Math.PI * spacing;

        for (let angleOff = -90; angleOff <= 90; angleOff += 1) {
            let theta = angleOff * Math.PI / 180 + steeringRad;
            let sumX_re = 0, sumX_im = 0;
            for (let m = 0; m < Nx; m++) {
                let phase = m * k_d * (Math.sin(theta) - Math.sin(steeringRad));
                sumX_re += wx_n[m] * Math.cos(phase);
                sumX_im += wx_n[m] * Math.sin(phase);
            }
            let afMag = Math.sqrt(sumX_re * sumX_re + sumX_im * sumX_im);
            let db = afMag > 0.0001 ? 20 * Math.log10(afMag) : -80;
            if (db < -50) db = -50;

            let eirp = peakEirp + db;
            let maskLimit = getMaskLimit(angleOff, peakEirp);

            eirpCutData.push([angleOff, parseFloat(eirp.toFixed(2))]);
            maskLimitData.push([angleOff, parseFloat(maskLimit.toFixed(2))]);
            if (eirp > maskLimit) {
                maskExceeded = true;
            }
        }
    }

    function debounce(func, wait) {
        let timeout;
        return function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

    const debouncedUpdatePhasedArray = debounce(updatePhasedArrayVisuals, 60);

    function resizeRenderer() {
        const width = container3d.clientWidth;
        const height = container3d.clientHeight;
        renderer3d.setSize(width, height);
        camera3d.aspect = width / height;
        camera3d.updateProjectionMatrix();
    }

    function runSimulation() {
        orbitControls.update();
        renderer3d.render(scene3d, camera3d);
        requestAnimationFrame(runSimulation);
    }

    arraySizeXSlider.addEventListener('input', (e) => {
        const val = e.target.value;
        arraySizeXVal.textContent = val;
        debouncedUpdatePhasedArray();
    });

    arraySizeYSlider.addEventListener('input', (e) => {
        const val = e.target.value;
        arraySizeYVal.textContent = val;
        debouncedUpdatePhasedArray();
    });

    spacingSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        spacingVal.textContent = val.toFixed(2);
        debouncedUpdatePhasedArray();
    });

    steeringSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        steeringVal.textContent = val.toFixed(1) + '°';
        debouncedUpdatePhasedArray();
    });

    renderToggle.addEventListener('change', () => {
        gradientControls.classList.toggle('hidden', !renderToggle.checked);
        debouncedUpdatePhasedArray();
    });

    axesToggle.addEventListener('change', () => {
        if (axesHelper) axesHelper.visible = axesToggle.checked;
    });

    gridToggle.addEventListener('change', () => {
        if (gridHelper) gridHelper.visible = gridToggle.checked;
    });

    screenshotBtn.addEventListener('click', () => {
        if (!renderer3d) return;
        renderer3d.render(scene3d, camera3d);
        const dataURL = renderer3d.domElement.toDataURL('image/png');
        const link = document.createElement('a');
        link.href = dataURL;
        link.download = '3d-capture.png';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });

    gradientColor1.addEventListener('input', debouncedUpdatePhasedArray);
    gradientColor2.addEventListener('input', debouncedUpdatePhasedArray);
    gradientColor3.addEventListener('input', debouncedUpdatePhasedArray);

    taylorToggle.addEventListener('change', () => {
        updatePhasedArrayVisuals();
    });

    window.addEventListener('resize', () => {
        resizeRenderer();
    });

    updatePhasedArrayVisuals();
    requestAnimationFrame(runSimulation);
});
