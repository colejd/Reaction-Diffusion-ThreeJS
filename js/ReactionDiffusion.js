"use strict";

//Define THREE globally so that autocomplete uses it
var THREE;

var container, stats;
var $container;
var camera, scene, renderer, planeMesh;
var frustumSize = 1;

var display_vert_source;
var display_frag_source;
var compute_frag_source;

var planeMesh;
var planeMaterial;
var planeMaterialUniforms;

var computeRenderTargets = [];
var computeMaterial;
var computeUniforms;

var passThroughMaterial;
var passThroughUniforms;

var computeStepsPerFrame;
var currentTargetIndex = 0;

var internalResolutionMultiplier = 0.5;
var internalWidth;
var internalHeight;

var startTime = Date.now();

var mousePos = new THREE.Vector2();
var mouseIsDown = false;

var filterType = THREE.LinearFilter; //THREE.NearestFilter

var presets = [
    {
        name: "Default",
        d_a: 1.0,
        d_b: 0.5,
        feed: 0.055,
        kill: 0.062,
        biasStrength: 0.0
    },
    {
        name: "Mitosis",
        d_a: 1.0,
        d_b: 0.5,
        feed: 0.0367,
        kill: 0.0649,
        biasStrength: 0.0
    },
    {
        name: "Coral",
        d_a: 1.0,
        d_b: 0.5,
        feed: 0.0545,
        kill: 0.062,
        biasStrength: 0.0
    },
    {
        name: "Biased",
        d_a: 0.82, //Diffusion rate of A //1
        d_b: 0.41, //Diffusion rate of B //0.5
        feed: 0.035, //0.0372 //0.025
        kill: 0.064, //How fast b gets removed
        biasStrength: 0.005
    }

];

function setup() {
    //Find the container
    $container = $("#reaction-diffusion-container");
    container = $container.get(0);

    //container = document.getElementById('reaction-diffusion-container');
    //document.body.appendChild( container );

    //Early out if we don't have WebGL
    if (!Detector.webgl) {
        Detector.addGetWebGLMessage(container);
        return;
    }
    loadFiles(['shaders/display-vert.glsl', 'shaders/display-frag.glsl', 'shaders/compute-frag.glsl'], function (shaderText) {
        display_vert_source = shaderText[0];
        display_frag_source = shaderText[1];
        compute_frag_source = shaderText[2];

        //Run the rest of the program
        init();
    }, function (url) {
        alert('Failed to fetch "' + url + '"');
    });
}

function init() {

    //Set up renderer and embed in HTML
    renderer = new THREE.WebGLRenderer({ premultipliedAlpha : false, preserveDrawingBuffer: true });
    renderer.setSize(container.offsetWidth, container.offsetHeight);
    renderer.setClearColor(0x00ffff, 1); //Cyan clear color
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    if ( ! renderer.extensions.get( "OES_texture_float" ) ) {
        console.log("No OES_texture_float support for float textures.");
    }

    if ( renderer.capabilities.maxVertexTextures === 0 ) {
        console.log("No support for vertex shader textures.");
    }

    //Set the resolution of the display shader, minding that it is screen space and is affected by the device pixel ratio.

    //computeUniforms.resolution.value.x = renderer.getSize().width;
    //computeUniforms.resolution.value.y = renderer.getSize().height;

    internalWidth = renderer.getSize().width;
    internalHeight = renderer.getSize().height;

    initMaterials();

    scene = new THREE.Scene();
    var planeSize = 1.0;

    //camera = new THREE.PerspectiveCamera( 50, container.offsetWidth / container.offsetHeight, 1, 1000 );
    camera = new THREE.OrthographicCamera(-0.5,
        0.5,
        0.5,
        -0.5,
        150, 1000);
    camera.position.y = 0;
    camera.position.z = 500;
    camera.lookAt(scene.position);

    //var testMaterial = new THREE.MeshBasicMaterial( {color: 0x00ff00} );

    //Make plane primitive
    var planeGeometry = new THREE.PlaneGeometry(1.0, 1.0);

    planeMesh = new THREE.Mesh(planeGeometry, planeMaterial);
    scene.add(planeMesh);

    //Add a wireframe to help see the borders of the mesh
    //var helper = new THREE.WireframeHelper(planeMesh);
    //helper.material.color.set(0xff0000);
    //scene.add( helper );

    //Set up GUI
    initGUI();

    //Set up listener events
    container.onmousedown = onDocumentMouseDown;
    container.onmouseup = onDocumentMouseUp;
    container.onmousemove = onDocumentMouseMove;

    stats = new Stats();
    container.appendChild(stats.dom);

    resize(container.clientWidth, container.clientHeight);

    //seedCircle(texture1, 256, 256, 200, 50);
    console.log(planeMaterial);
    console.log(computeMaterial);

    seedRenderTarget(computeRenderTargets[0]);

    //animate();
    //doRenderPass(0);
    //requestAnimationFrame(render); //Add to increase FPS to 120
    renderLoop();
}

function initMaterials(){
    planeMaterialUniforms = {
        time: { type: "f", value: 1.0 },
        resolution: { type: "v2", value: new THREE.Vector2() },
        displayTexture: { value: null }
    };

    planeMaterial = new THREE.ShaderMaterial({
        uniforms: planeMaterialUniforms,
        vertexShader: display_vert_source,
        fragmentShader: display_frag_source
    });
    planeMaterial.blending = THREE.NoBlending;

    computeUniforms = {
        chemicalTexture: { type: "t", value: undefined },
        resolution: { type: "v2", value: new THREE.Vector2() },
        time: { type: "f", value: 1.0 },
        d_a: { type: "f", value: 1.0 },
        d_b: { type: "f", value: 1.0 },
        feed: { type: "f", value: 1.0 },
        kill: { type: "f", value: 1.0 },
        biasStrength: { type: "f", value: 1.0 },
        timestep: { type: "f", value: 1.0 },
        interactPos: { type: "v2", value: new THREE.Vector2(-1, -1) },
        doPass: { type: "f", value: 1.0 }
    }

    computeMaterial = new THREE.ShaderMaterial({
        uniforms: computeUniforms,
        vertexShader: display_vert_source,
        fragmentShader: compute_frag_source,
    });
    computeMaterial.blending = THREE.NoBlending;

    passThroughUniforms = {
		texture: { value: null }
	};
    passThroughMaterial = new THREE.ShaderMaterial({
        uniforms: passThroughUniforms,
        vertexShader: getPassThroughVertexShader(),
        fragmentShader: getPassThroughFragmentShader()
    });
    passThroughMaterial.blending = THREE.NoBlending;
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
    var primaryTarget = new THREE.WebGLRenderTarget(canvasWidth * internalResolutionMultiplier, canvasHeight * internalResolutionMultiplier,
                        {
                            wrapS: THREE.ClampToEdgeWrapping,
		                    wrapT: THREE.ClampToEdgeWrapping,
                            minFilter: filterType,
                            magFilter: filterType,
                            format: THREE.RGBAFormat,
                            type: THREE.FloatType});
    var alternateTarget = new THREE.WebGLRenderTarget(canvasWidth * internalResolutionMultiplier, canvasHeight * internalResolutionMultiplier,
                        {
                            wrapS: THREE.ClampToEdgeWrapping,
		                    wrapT: THREE.ClampToEdgeWrapping,
                            minFilter: filterType,
                            magFilter: filterType,
                            format: THREE.RGBAFormat,
                            type: THREE.FloatType});

    computeRenderTargets.push(primaryTarget);
    computeRenderTargets.push(alternateTarget);

    planeMaterialUniforms.resolution.value = new THREE.Vector2(canvasWidth * internalResolutionMultiplier, canvasHeight * internalResolutionMultiplier);
    console.log("Display plane sized to (" + planeMaterialUniforms.resolution.value.x + ", " + planeMaterialUniforms.resolution.value.y + ")");

    computeUniforms.resolution.value = new THREE.Vector2(canvasWidth * internalResolutionMultiplier, canvasHeight * internalResolutionMultiplier);
    console.log("Compute texture sized to (" + computeUniforms.resolution.value.x + ", " + computeUniforms.resolution.value.y + ")");
}

//function initCompute() {
//
//    gpuCompute = new GPUComputationRenderer(internalWidth, internalHeight, renderer); //use power of 2 textures instead?
//
//    //Make the texture
//    rdTexture = gpuCompute.createTexture();
//    prepareComputeTexture(rdTexture);
//
//    //Seed the texture
//    seedCircle(rdTexture, internalWidth * 0.5, internalHeight * 0.5, Math.min(internalWidth, internalHeight) * 0.33, Math.min(internalWidth, internalHeight) * 0.125);
//    //seedFilledCircle(rdTexture, width * 0.5, height * 0.5, Math.min(width, height) * 0.25);
//    //seedSquare(rdTexture, 0, 0, 100);
//    //Add some bias in the blue channel
//    seedFilledCircle(rdTexture, internalWidth * 0.5, internalHeight * 0.5, Math.min(internalWidth, internalHeight) * 0.25, 2);
//
//    //Assign the texture
//    computeVariable = gpuCompute.addVariable("chemicalTexture", compute_frag_source, rdTexture);
//    gpuCompute.setVariableDependencies(computeVariable, [computeVariable]);
//
//    //Need to initialize uniforms here if you want to change them later
//    computeVariable.material.uniforms.time = { value: 0.0 };
//    computeVariable.material.uniforms.interactPos = { value: new THREE.Vector2( -1, -1 ) };
//    computeVariable.material.uniforms.doPass = { value: 1.0 };
//
//    //Check for completeness
//    var error = gpuCompute.init();
//    if (error !== null) {
//        console.error("Error initializing compute: " + error);
//    } else {
//        console.info("Compute initialized.");
//    }
//
//}

function initGUI() {
    var computeOptions = function () {
        this.timestep = 1.0; //Keep at 1.0
        this.d_a = 0.82; //Diffusion rate of A //1
        this.d_b = 0.41; //Diffusion rate of B //0.5
        this.feed = 0.035; //0.0372 //0.025
        this.kill = 0.064; //How fast b gets removed
        this.biasStrength = 0.005;
        this.selectedPresetName = presets[0].name;

        this.iterationsPerFrame = 20;
        this.dropperSize = 20.0;
    }

    var currentOptions = new computeOptions();

    function updateValuesFromGUI() {
    //heightmapVariable.material.uniforms.erosionConstant.value = effectController.erosionConstant;
        computeUniforms.timestep = { value: currentOptions.timestep };
        computeUniforms.d_a = { value: currentOptions.d_a };
        computeUniforms.d_b = { value: currentOptions.d_b };
        computeUniforms.feed = { value: currentOptions.feed };
        computeUniforms.kill = { value: currentOptions.kill };
        computeUniforms.biasStrength = { value: currentOptions.biasStrength };

        computeUniforms.dropperSize = { value: currentOptions.dropperSize };

        computeStepsPerFrame = currentOptions.iterationsPerFrame;
    }

    function applyPreset(){
        //Find the preset by the selected name
        var preset = presets.filter(function( obj ) {
            return obj.name == currentOptions.selectedPresetName;
        })[0];

        //Apply the preset
        currentOptions.d_a = preset.d_a;
        currentOptions.d_b = preset.d_b;
        currentOptions.feed = preset.feed;
        currentOptions.kill = preset.kill;
        currentOptions.biasStrength = preset.biasStrength;

//        for (var property in preset) {
//            currentOptions[property] = property;
//        }

        updateValuesFromGUI();
    }

    var gui = new dat.GUI();

    //Preset control
    var names = presets.map( function(preset) {return preset.name;} );
    gui.add( currentOptions, "selectedPresetName", names ).onChange( applyPreset );

    //Folder for preset variables
    var presetFolder = gui.addFolder('Preset Options');
    presetFolder.add( currentOptions, "timestep", 0.001, 2.0, 0.001 ).onChange( updateValuesFromGUI ).listen();
    presetFolder.add( currentOptions, "d_a", 0.001, 1.0, 0.001 ).onChange( updateValuesFromGUI ).listen();
    presetFolder.add( currentOptions, "d_b", 0.001, 1.0, 0.001 ).onChange( updateValuesFromGUI ).listen();
    presetFolder.add( currentOptions, "feed", 0.001, 0.1, 0.001 ).onChange( updateValuesFromGUI ).listen();
    presetFolder.add( currentOptions, "kill", 0.001, 0.1, 0.001 ).onChange( updateValuesFromGUI ).listen();
    presetFolder.add( currentOptions, "biasStrength", 0.0, 0.1, 0.001 ).onChange( updateValuesFromGUI ).listen();

    gui.add( currentOptions, "dropperSize", 0.0, 100.0, 0.5).onFinishChange( updateValuesFromGUI ).listen();
    gui.add( currentOptions, "iterationsPerFrame", 0, 50, 1).onChange( updateValuesFromGUI ).listen();

    var obj = { clear:function(){ clear(); }};

    gui.add(obj,'clear');

    applyPreset();
    updateValuesFromGUI();

}

var renderLoop = function(time)
{

    doRenderPass(time);

    stats.update();
    requestAnimationFrame(renderLoop);
}

var doRenderPass = function(time) {
    //    var dt = (time - mLastTime)/20.0;
    //    if(dt > 0.8 || dt<=0)
    //        dt = 0.8;
    //    mLastTime = time;
    //    mUniforms.delta.value = dt;

    planeMesh.material = computeMaterial;
    var elapsedSeconds = (Date.now() - startTime) / 1000.0;
    planeMaterialUniforms.time.value = 60.0 * elapsedSeconds;
    computeUniforms.time.value = 60.0 * elapsedSeconds;

    var output;

    for(var i=0; i<computeStepsPerFrame; i++) {

		var nextTargetIndex = currentTargetIndex === 0 ? 1 : 0;

        computeUniforms.chemicalTexture.value = computeRenderTargets[currentTargetIndex].texture; //Put texture1 in
        renderer.render(scene, camera, computeRenderTargets[nextTargetIndex], true); //Render the scene to texture2
        computeUniforms.chemicalTexture.value = computeRenderTargets[nextTargetIndex].texture; //Put texture2 in
        output = computeRenderTargets[nextTargetIndex].texture; //Assign to plane material

        currentTargetIndex = nextTargetIndex;
    }

    planeMaterialUniforms.displayTexture.value = output;

    planeMesh.material = planeMaterial;
    renderer.render(scene, camera);
}

function seedRenderTarget(renderTarget) {
    //Make a data texture
    var sizeX = computeUniforms.resolution.value.x;
    var sizeY = computeUniforms.resolution.value.y;

    var a = new Float32Array( sizeX * sizeY * 4 );
    var texture = new THREE.DataTexture( a, sizeX, sizeY, THREE.RGBAFormat, THREE.FloatType );
    texture.needsUpdate = true;

    //Seed it with the variables we want
    prepareComputeTexture(texture);
    seedCircle(texture, sizeX * 0.5, sizeY * 0.5, 200, 50);
    seedCircle(texture, sizeX * 0.5, sizeY * 0.5, Math.min(sizeX, sizeY) * 0.33, Math.min(sizeX, sizeY) * 0.125);

    //Render it to the rendertarget
    //renderer.renderTexture( texture, renderTarget );
    passThroughUniforms.texture.value = texture;
    planeMesh.material = passThroughMaterial;
    renderer.render(scene, camera, renderTarget);
}

function prepareComputeTexture(texture) {
    var width = texture.image.width;
    var height = texture.image.height;
    var pixels = texture.image.data;
    var px = 0;
    for (var i = 0; i < texture.image.width; i++) {
        for (var j = 0; j < texture.image.height; j++) {
            pixels[px + 0] = 1.0; //1.0; //texture is float type (0 - 1)
            //pixels[ px + 0 ] = i.toFixed(4) / texture.image.width.toFixed(4);//1.0; //texture is float type (0 - 1)
            pixels[px + 1] = 0.0;
            pixels[px + 2] = 0.0;
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

function seedCircle(texture, x, y, radius = 100, thickness = 1) {
    var pixels = texture.image.data;
    var width = texture.image.width;
    var height = texture.image.height;

    for (var reps = 0; reps < thickness; reps++) {
        var currentRadius = radius - reps;
        var currentOpacity = 1.0; //1.0 - (reps / thickness);

        seedRing(texture, x, y, currentRadius, currentOpacity);

    }

}

function seedRing(texture, x, y, radius, seedAmount = 1.0) {
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
            pixels[index + 1] = seedAmount;
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

            //
            if ((i * i + j * j) < (r * r)) {
                var index = ((row + j) + (col + i) * texture.image.width) * 4;
                pixels[index + channel] = 1.0;
            }
        }
    }

}

function clear() {
    computeUniforms.doPass.value = 0.0;
    doRenderPass(0);
    doRenderPass(0);
    computeUniforms.doPass.value = 1.0;
}

function onDocumentMouseDown( event ) {
    var rect = container.getBoundingClientRect();
    mousePos.set(event.clientX - rect.left,
                 rect.bottom - event.clientY); //(event.clientY - rect.top) to invert
    mousePos.x *= internalResolutionMultiplier;
    mousePos.y *= internalResolutionMultiplier;

    //console.log("Clicked at (" + mousePos.x + ", " + mousePos.y + ")");

    computeUniforms.interactPos.value = mousePos;

//    console.log("Uniforms");
//    console.log(computeVariable.material.uniforms);

    mouseIsDown = true;

}

function onDocumentMouseUp( event ) {
    //Put the interaction position offscreen.

    mousePos.set(-1.0, -1.0);

    computeUniforms.interactPos.value = mousePos;
    mouseIsDown = false;
}

function onDocumentMouseMove( event ) {
    //Only update if the mouse is held down
    if(mouseIsDown){
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
function getSourceString(obj){
    var output = '';
    for (var property in obj) {
      output += property + ': ' + obj[property]+';\n';
    }
    return output;
}

function getPassThroughVertexShader() {

    return	"varying vec2 vUv;\n" +
            "void main() {\n" +
            "   \n" +
            "   vUv = uv;\n" +
            //"	gl_Position = vec4( position, 1.0 );\n" +
            "   gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);\n" +
            "   \n" +
            "}\n";

}

function getPassThroughFragmentShader() {

    return	"varying vec2 vUv;\n" +
            "uniform sampler2D texture;\n" +
            "\n" +
            "void main() {\n" +
            "\n" +
            //"	vec2 uv = gl_FragCoord.xy / resolution.xy;\n" +
            " vec2 uv = vUv;\n" +
            "\n" +
            "	gl_FragColor = texture2D( texture, uv );\n" +
            "\n" +
            "}\n";

}
