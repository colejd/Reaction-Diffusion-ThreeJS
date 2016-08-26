//Starts on document load
$(function () {
    var $container = $("#reaction-diffusion-container");
    if ($container.length !== 0) { //If we found it, go
        var simulator = new ReactionDiffusionSimulator($container);
    } else {
        console.error("No element with id \"reaction-diffusion-container\" was found.");
    }
});

//Expects a JQuery object representing the container this will render into.
function ReactionDiffusionSimulator($container) {
    //If <= 0, the object is ready to begin running.
    var loadingSemaphore = 0;

    //Presets serialized from JSON
    var presets;

    var container = $container.get(0);

    var camera, scene, renderer;
    var stats;

    var display_frag_source;
    var compute_frag_source;
    var compute_vert_source;

    var displayMesh;
    var displayMaterial;
    var displayMaterialUniforms;

    var computeRenderTargets = [];
    var computeMaterial;
    var computeUniforms;

    var passThroughMaterial;
    var passThroughUniforms;

    var computeStepsPerFrame;
    var currentTargetIndex = 0;

    var internalResolutionMultiplier = 1.0;
    var filterType = THREE.LinearFilter; //THREE.NearestFilter

    var startTime = Date.now();

    var mousePos = new THREE.Vector2();
    var mouseIsDown = false;

    //Pseudo-constructor. Load resources, returning if we don't have anything
    //we require to run.
    (function () {

        //Early out if we don't have WebGL
        if (!webgl_detect()) {
            console.error("WebGL is not supported on this browser.");
            return exit();
        }

        renderer = new THREE.WebGLRenderer({
            premultipliedAlpha: false,
            preserveDrawingBuffer: true
        });

        //Early out if we don't have the extensions we need
        if (!renderer.extensions.get("OES_texture_float")) {
            console.error("No OES_texture_float support for float textures.");
            return exit();
        }
        if (renderer.capabilities.maxVertexTextures === 0) {
            console.error("No support for vertex shader textures.");
            return exit();
        }

        //Load shader strings from files
        signalLoadStarted();
        loadFiles(['shaders/display-frag.glsl', 'shaders/compute-frag.glsl', 'shaders/compute-vert.glsl'], function (shaderText) {
            display_frag_source = shaderText[0];
            compute_frag_source = shaderText[1];
            compute_vert_source = shaderText[2];

            signalLoadFinished();
        }, function (url) {
            //alert('Failed to fetch "' + url + '"');
            console.error('Failed to fetch "' + url + '"');
            return exit();
        });

        //Load presets object from JSON
        signalLoadStarted();
        $.getJSON("js/Presets.js", function (result) {
            presets = result;
            signalLoadFinished();
        });
    })();

    function exit(){
        $container.append('<div class="no-webgl-support">\
                                <p>Your graphics card does not seem to support <a href="http://khronos.org/webgl/wiki/Getting_a_WebGL_Implementation">WebGL</a>.\
                                <br> Find out how to get it <a href="http://get.webgl.org/">here</a>.</p>\
                            </div>');
    }

    //Raises the loading semaphore.
    function signalLoadStarted() {
        loadingSemaphore += 1;
    }

    //Decrements the loading semaphore and starts execution if it is fully lowered.
    function signalLoadFinished() {
        loadingSemaphore -= 1;
        if (loadingSemaphore <= 0) {
            init();
        }
    }

    //Begin execution here
    function init() {
        //Set up renderer and embed in HTML
        renderer.setSize(container.offsetWidth, container.offsetHeight);
        renderer.setClearColor(0x00ffff, 1); //Cyan clear color
        renderer.setPixelRatio(window.devicePixelRatio);
        container.appendChild(renderer.domElement);

        //Set up listener events for container
        container.onmousedown = onMouseDown;
        document.onmouseup = onMouseUp;
        container.onmousemove = onMouseMove;
        container.onmouseout = onMouseOut;

        initMaterials();

        scene = new THREE.Scene();
        //Set up 1x1 orthographic camera looking along the negative z axis
        camera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 10, 100);
        camera.position.z = 50; //Scoot backward 50 units

        //Make plane primitive
        var displayGeometry = new THREE.PlaneGeometry(1.0, 1.0);

        displayMesh = new THREE.Mesh(displayGeometry, displayMaterial);
        scene.add(displayMesh);

        //Set up GUI
        initGUI();

        stats = new Stats();
        container.appendChild(stats.dom);

        resize(container.clientWidth, container.clientHeight);

        initRenderTargetFromImage(computeRenderTargets[0], 'bias-image.png');
        //initRenderTargetFromImage(computeRenderTargets[1], 'bias-image.png');
        //doRenderPass(0);
//        applyFunctionToRenderTarget(computeRenderTargets[0], function (texture) {
//            //Seed it with the variables we want
//            //seedInitial(texture);
//            //seedCircle(texture, sizeX * 0.5, sizeY * 0.5, 200, 50);
//            seedCircle(texture, texture.width * 0.5, texture.height * 0.5, Math.min(texture.width, texture.height) * 0.33, Math.min(texture.width, texture.height) * 0.125);
//
//            //Add some bias in the center
//            seedFilledCircle(texture, texture.width * 0.5, texture.height * 0.5, Math.min(texture.width, texture.height) * 0.25, 2);
//        });

        renderLoop();
    }

    function initMaterials() {
        displayMaterialUniforms = {
            time: {
                type: "f",
                value: 1.0
            },
            resolution: {
                type: "v2",
                value: new THREE.Vector2()
            },
            displayTexture: {
                value: null
            }
        };

        displayMaterial = new THREE.ShaderMaterial({
            uniforms: displayMaterialUniforms,
            vertexShader: getPassThroughVertexShader(),
            fragmentShader: display_frag_source
        });
        displayMaterial.blending = THREE.NoBlending;

        computeUniforms = {
            sourceTexture: {
                type: "t",
                value: undefined
            },
            resolution: {
                type: "v2",
                value: new THREE.Vector2()
            },
            time: {
                type: "f",
                value: 1.0
            },
            feed: {
                type: "f",
                value: 1.0
            },
            kill: {
                type: "f",
                value: 1.0
            },
            biasStrength: {
                type: "f",
                value: 1.0
            },
            timestep: {
                type: "f",
                value: 1.0
            },
            interactPos: {
                type: "v2",
                value: new THREE.Vector2(-1, -1)
            },
            doPass: {
                type: "f",
                value: 1.0
            },
            dropperSize: {
                type: "f",
                value: 1.0
            }
        }

        computeMaterial = new THREE.ShaderMaterial({
            uniforms: computeUniforms,
            vertexShader: compute_vert_source,
            fragmentShader: compute_frag_source,
        });
        computeMaterial.blending = THREE.NoBlending;

        passThroughUniforms = {
            texture: {
                value: null
            }
        };
        passThroughMaterial = new THREE.ShaderMaterial({
            uniforms: passThroughUniforms,
            vertexShader: getPassThroughVertexShader(),
            fragmentShader: getPassThroughFragmentShader()
        });
        passThroughMaterial.blending = THREE.NoBlending;
    }

    function initGUI() {
        var computeOptions = function () {
            this.timestep = 1.0; //Keep at 1.0
            this.d_a = 0.82; //Diffusion rate of A //1
            this.d_b = 0.41; //Diffusion rate of B //0.5
            this.feed = 0.035; //0.0372 //0.025
            this.kill = 0.064; //How fast b gets removed
            this.biasStrength = 0.005;
            this.selectedPresetName = presets[4].name;

            this.iterationsPerFrame = 5;
            this.dropperSize = 20.0;
        }

        var currentOptions = new computeOptions();

        function updateValuesFromGUI() {
            //heightmapVariable.material.uniforms.erosionConstant.value = effectController.erosionConstant;
            computeUniforms.timestep.value = currentOptions.timestep;
            computeUniforms.feed.value = currentOptions.feed;
            computeUniforms.kill.value = currentOptions.kill;
            computeUniforms.biasStrength.value = currentOptions.biasStrength;
            computeUniforms.dropperSize.value = currentOptions.dropperSize;

            computeStepsPerFrame = currentOptions.iterationsPerFrame;
        }

        function applyPreset() {
            //Find the preset by the selected name
            var preset = presets.filter(function (obj) {
                return obj.name == currentOptions.selectedPresetName;
            })[0];

            //Apply the preset
            currentOptions.feed = preset.feed;
            currentOptions.kill = preset.kill;
            currentOptions.biasStrength = preset.biasStrength;

//            for (var property in preset) {
//                currentOptions[property] = property;
//            }

            updateValuesFromGUI();
        }

        var gui = new dat.GUI();

        //Preset control
        var names = presets.map(function (preset) {
            return preset.name;
        });
        gui.add(currentOptions, "selectedPresetName", names).onChange(applyPreset);

        //Folder for preset variables
        var presetFolder = gui.addFolder('Preset Options');
        presetFolder.add(currentOptions, "feed", 0.001, 0.1, 0.001).onChange(updateValuesFromGUI).listen();
        presetFolder.add(currentOptions, "kill", 0.001, 0.1, 0.001).onChange(updateValuesFromGUI).listen();
        presetFolder.add(currentOptions, "biasStrength", 0.0, 0.1, 0.001).onChange(updateValuesFromGUI).listen();

        gui.add(currentOptions, "dropperSize", 0.0, 100.0, 0.5).onFinishChange(updateValuesFromGUI).listen();
        gui.add(currentOptions, "iterationsPerFrame", 0, 50, 1).onChange(updateValuesFromGUI).listen();
        gui.add(currentOptions, "timestep", 0.0, 1.0, 0.01).onChange(updateValuesFromGUI).listen();

        var clearFn = {
            clear: function () {
                clear();
            }
        };
        gui.add(clearFn, "clear");

        var resetFn = {
            reset: function () {
                reset();
            }
        }
        gui.add(resetFn, "reset");

        applyPreset();
        updateValuesFromGUI();

    }

    function resize(width, height) {
        // Set the new shape of canvas.
        $container.width(width);
        $container.height(height);

        // Get the real size of canvas.
        var canvasWidth = $container.width();
        var canvasHeight = $container.height();

        renderer.setSize(canvasWidth, canvasHeight);
        console.log("Renderer sized to (" + canvasWidth + ", " + canvasHeight + ")");

        // TODO: Possible memory leak?
        var primaryTarget = new THREE.WebGLRenderTarget(canvasWidth * internalResolutionMultiplier, canvasHeight * internalResolutionMultiplier, {
            wrapS: THREE.ClampToEdgeWrapping,
            wrapT: THREE.ClampToEdgeWrapping,
            minFilter: filterType,
            magFilter: filterType,
            format: THREE.RGBAFormat,
            type: THREE.FloatType
        });
        var alternateTarget = new THREE.WebGLRenderTarget(canvasWidth * internalResolutionMultiplier, canvasHeight * internalResolutionMultiplier, {
            wrapS: THREE.ClampToEdgeWrapping,
            wrapT: THREE.ClampToEdgeWrapping,
            minFilter: filterType,
            magFilter: filterType,
            format: THREE.RGBAFormat,
            type: THREE.FloatType
        });

        computeRenderTargets.push(primaryTarget);
        computeRenderTargets.push(alternateTarget);

        displayMaterialUniforms.resolution.value = new THREE.Vector2(canvasWidth * internalResolutionMultiplier, canvasHeight * internalResolutionMultiplier);
        console.log("Display texture sized to (" + displayMaterialUniforms.resolution.value.x + ", " + displayMaterialUniforms.resolution.value.y + ")");

        computeUniforms.resolution.value = new THREE.Vector2(canvasWidth * internalResolutionMultiplier, canvasHeight * internalResolutionMultiplier);
        console.log("Compute texture sized to (" + computeUniforms.resolution.value.x + ", " + computeUniforms.resolution.value.y + ")");
    }

    var renderLoop = function (time) {

        if (mouseIsDown) {
            //computeUniforms.interactPos.value = mousePos;
            applyFunctionToRenderTarget(computeRenderTargets[currentTargetIndex], function(texture) {
                seedCircle(texture, mousePos.x, mousePos.y, 25, 5);
                //seedFilledCircle(texture, mousePos.x, mousePos.y, 25);
            });
        }

        doRenderPass(time);

        stats.update();
        requestAnimationFrame(renderLoop);
    }

    var doRenderPass = function (time) {
        //    var dt = (time - mLastTime)/20.0;
        //    if(dt > 0.8 || dt<=0)
        //        dt = 0.8;
        //    mLastTime = time;
        //    mUniforms.delta.value = dt;

        //Update uniforms
        var elapsedSeconds = (Date.now() - startTime) / 1000.0;
        displayMaterialUniforms.time.value = 60.0 * elapsedSeconds;
        computeUniforms.time.value = 60.0 * elapsedSeconds;

        //Set the display mesh to use the compute shader
        displayMesh.material = computeMaterial;

        // Render from the current RenderTarget into the other RenderTarget, then swap.
        // Repeat however many times per frame we desire.
        for (var i = 0; i < computeStepsPerFrame; i++) {

            var nextTargetIndex = currentTargetIndex === 0 ? 1 : 0;

            computeUniforms.sourceTexture.value = computeRenderTargets[currentTargetIndex].texture; //Put current target texture into material
            renderer.render(scene, camera, computeRenderTargets[nextTargetIndex], true); //Render the scene to next target
            computeUniforms.sourceTexture.value = computeRenderTargets[nextTargetIndex].texture; //Put next target texture into material
            displayMaterialUniforms.displayTexture.value = computeRenderTargets[nextTargetIndex].texture; //Assign to display material

            currentTargetIndex = nextTargetIndex;
        }

        //Set the display mesh to use the display material and render
        displayMesh.material = displayMaterial;
        renderer.render(scene, camera);
    }

    function clear() {
        computeUniforms.doPass.value = 0.0;
        doRenderPass(0);
        doRenderPass(0);
        computeUniforms.doPass.value = 1.0;
    }

    function reset() {
        initRenderTargetFromImage(computeRenderTargets[0], 'bias-image.png');
        //initRenderTargetFromImage(computeRenderTargets[1], 'bias-image.png');
    }


    function initRenderTargetFromImage(renderTarget, url) {
        var sizeX = renderTarget.width; // / internalResolutionMultiplier;
        var sizeY = renderTarget.height; // / internalResolutionMultiplier;

        //    //Make a data texture
        //    var buffer = new Float32Array( sizeX * sizeY * 4 );
        //    var texture = new THREE.DataTexture( buffer, sizeX, sizeY, THREE.RGBAFormat, THREE.FloatType );
        //    texture.needsUpdate = true;

        //    //Seed it with the variables we want
        //    seedInitial(texture);
        //    //seedCircle(texture, sizeX * 0.5, sizeY * 0.5, 200, 50);
        //    seedCircle(texture, sizeX * 0.5, sizeY * 0.5, Math.min(sizeX, sizeY) * 0.33, Math.min(sizeX, sizeY) * 0.125);
        //
        //    //Add some bias in the center
        //    seedFilledCircle(texture, sizeX * 0.5, sizeY * 0.5, Math.min(sizeX, sizeY) * 0.25, 2);

        //Render it to the rendertarget
        //renderer.renderTexture( texture, renderTarget );
        //passThroughUniforms.texture.value = texture;


        var loader = new THREE.TextureLoader();
        loader.load(url, function (texture) {
            //Run the rest of the program
            //Initialize the texture from the imported image
            passThroughUniforms.texture.value = texture;

            displayMesh.material = passThroughMaterial;
            renderer.render(scene, camera, renderTarget);

        });

    }

    function applyFunctionToRenderTarget(renderTarget, callback) {
        //Read renderTarget into a DataTexture
        var buffer = new Float32Array(renderTarget.width * renderTarget.height * 4);
        renderer.readRenderTargetPixels(renderTarget, 0, 0, renderTarget.width, renderTarget.height, buffer);
        var texture = new THREE.DataTexture(buffer, renderTarget.width, renderTarget.height, THREE.RGBAFormat, THREE.FloatType);
        texture.needsUpdate = true;

        //Run the callback with the DataTexture
        callback(texture);

        //Render DataTexture into renderTarget
        passThroughUniforms.texture.value = texture;

        //var oldMaterial = displayMesh.material;
        displayMesh.material = passThroughMaterial;
        renderer.render(scene, camera, renderTarget);
        //displayMesh.material = oldMaterial;
    }

    function getNextRenderTarget(){
        return computeRenderTargets[currentTargetIndex === 0 ? 1 : 0];
    }

    function seedInitial(texture) {
        var width = texture.image.width;
        var height = texture.image.height;
        var pixels = texture.image.data;
        var px = 0;
        for (var i = 0; i < texture.image.width; i++) {
            for (var j = 0; j < texture.image.height; j++) {
                pixels[px + 0] = 1.0; //1.0; //texture is float type (0 - 1)
                pixels[px + 1] = 0.0;
                //pixels[px + 2] = 0.0;
                pixels[px + 3] = 1.0;

                px += 4;
            }
        }

    }

    function seedSquare(texture, x, y, size = 100) {
        var pixels = texture.image.data;
        var width = texture.image.width;
        var height = texture.image.height;

        var px = 0;
        for (var j = 0; j < height; j++) {
            for (var i = 0; i < width; i++) {
                if (j > (height * 0.5) && i > (width * 0.5)) {
                    //pixels[ px + 0 ] = 1.0;//1.0; //texture is float type (0 - 1)
                    //pixels[ px + 1 ] = 1.0;
                    pixels[px + 1] = i / texture.image.width; //1.0; //texture is float type (0 - 1)
                    //pixels[ px + 2 ] = 0.0;
                    //pixels[ px + 3 ] = 1.0;
                }

                px += 4;
            }
        }
    }

    function seedCircle(texture, x, y, radius, thickness = 1, channel = 1, value = 1.0) {
        var pixels = texture.image.data;
        var width = texture.image.width;
        var height = texture.image.height;

        for (var reps = 0; reps < thickness; reps++) {
            var currentRadius = radius - reps;
            var currentOpacity = value; //1.0 - (reps / thickness);

            seedRing(texture, x, y, currentRadius, channel, currentOpacity);

        }

    }

    function seedRing(texture, x, y, radius, channel = 1, value = 1.0) {
        var width = texture.image.width;
        var height = texture.image.height;
        var pixels = texture.image.data;
        var resolution = 0.1; //Set to 1 for moire patterns
        var channelWidth = 4; //RGBA

        //Draw a circle
        for (var i = 0; i < 360; i += resolution) {
            var xOffset = radius * Math.cos(i * Math.PI / 180);
            var yOffset = radius * Math.sin(i * Math.PI / 180);
            var xCoord = Math.floor(x + xOffset);
            var yCoord = Math.floor(y + yOffset);

            var index = (xCoord + yCoord * width) * 4;
            if (index >= 0 && index < width * height * channelWidth) {
                pixels[index + channel] = value;
            }


        }

    }

    function seedFilledCircle(texture, x, y, radius, channel = 1) {
        var pixels = texture.image.data;
        var r = radius;
        var row = x;
        var col = y;
        var channelWidth = 4; //RGBA
        for (var i = -r; i < r; i++) {
            for (var j = -r; j < r; j++) {
                if ((i * i + j * j) < (r * r)) {
                    var index = ((row + j) + (col + i) * texture.image.width) * 4;
                    pixels[index + channel] = 0.5;
                }
            }
        }
        //seedCircle(texture, x, y, radius, radius, channel);
    }

    // INPUT HANDLING ---------------------------------------------------- //

    function onMouseDown(event) {
        var rect = container.getBoundingClientRect();
        mousePos.set(event.clientX - rect.left,
            rect.bottom - event.clientY); //(event.clientY - rect.top) to invert
        mousePos.x *= internalResolutionMultiplier;
        mousePos.y *= internalResolutionMultiplier;
        mouseIsDown = true;

        //console.log("Clicked at (" + mousePos.x + ", " + mousePos.y + ")");

    }

    function onMouseUp(event) {
        //Put the interaction position offscreen.
        mousePos.set(-1000.0, -1000.0);
        mouseIsDown = false;
    }

    function onMouseOut(event) {
        //Put the interaction position offscreen.
        mousePos.set(-1000.0, -1000.0);
    }

    function onMouseMove(event) {
        //Only update if the mouse is held down
        if (mouseIsDown) {
            var rect = container.getBoundingClientRect();
            mousePos.set(event.clientX - rect.left,
                rect.bottom - event.clientY); //(event.clientY - rect.top) to invert
            mousePos.x *= internalResolutionMultiplier;
            mousePos.y *= internalResolutionMultiplier;
        }


    }

    // LOAD  STUFF ------------------------------------------------------- //
    // http://stackoverflow.com/questions/4878145/javascript-and-webgl-external-scripts
    function loadShader(type, shaderSrc) {
        var shader = gl.createShader(type);
        // Load the shader source
        gl.shaderSource(shader, shaderSrc);
        // Compile the shader
        gl.compileShader(shader);
        // Check the compile status
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) &&
            !gl.isContextLost()) {
            var infoLog = gl.getShaderInfoLog(shader);
            console.log("Error compiling shader:\n" + infoLog);
            gl.deleteShader(shader);
            return null;
        }
        return shader;
    }

    function loadFile(url, data, callback, errorCallback) {
        // Set up an asynchronous request
        var request = new XMLHttpRequest();
        request.open("GET", url, true);

        // Hook the event that gets called as the request progresses
        request.onreadystatechange = function () {
            // If the request is "DONE" (completed or failed)
            if (request.readyState == 4) {
                // If we got HTTP status 200 (OK)
                if (request.status == 200) {
                    callback(request.responseText, data)
                } else { // Failed
                    errorCallback(url);
                }
            }
        };

        request.send(null);
    }

    function loadFiles(urls, callback, errorCallback) {
        var numUrls = urls.length;
        var numComplete = 0;
        var result = [];

        // Callback for a single file
        function partialCallback(text, urlIndex) {
            result[urlIndex] = text;
            numComplete++;

            // When all files have downloaded
            if (numComplete == numUrls) {
                callback(result);
            }
        }

        for (var i = 0; i < numUrls; i++) {
            loadFile(urls[i], i, partialCallback, errorCallback);
        }
    }


    // UTILITY FUNCTIONS -------------------------------------------- //
    function getPassThroughVertexShader() {
        return ["varying vec2 v_uv;",
                "void main() {",
                "   v_uv = uv;",
                "   gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);",
                "}"
               ].join("\n");

    }

    function getPassThroughFragmentShader() {
        return ["varying vec2 v_uv;",
                "uniform sampler2D texture;",
                "void main() {",
                " vec2 uv = v_uv;",
                "	gl_FragColor = texture2D( texture, uv );",
                "}"
                ].join("\n");

    }

    //http://stackoverflow.com/questions/11871077/proper-way-to-detect-webgl-support
    function webgl_detect() {
        if (!!window.WebGLRenderingContext) {
            var canvas = document.createElement("canvas"),
                 names = ["webgl", "experimental-webgl", "moz-webgl", "webkit-3d"],
               context = false;

            for(var i=0;i<4;i++) {
                try {
                    context = canvas.getContext(names[i]);
                    if (context && typeof context.getParameter == "function") {
                        // WebGL is enabled
                        return true;
                    }
                } catch(e) {}
            }

            // WebGL is supported, but disabled
            return false;
        }
        // WebGL not supported
        return false;
    }

}
