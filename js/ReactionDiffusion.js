"use strict";

//Define THREE globally so that autocomplete uses it
var THREE;

var container, stats;
var $container;
var camera, scene, renderer;

var display_frag_source;
var compute_frag_source;

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

var startTime = Date.now();

var mousePos = new THREE.Vector2();
var mouseIsDown = false;

var filterType = THREE.LinearFilter; //THREE.NearestFilter

var importedBias;

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
        d_a: 0.82,
        d_b: 0.41,
        feed: 0.035,
        kill: 0.064,
        biasStrength: 0.005
    },
    {
        name: "Nameplate",
        d_a: 0.82,
        d_b: 0.41,
        feed: 0.035,
        kill: 0.063, //0.06 to 0.064
        biasStrength: 0.01 //0.005
    }

];

function setup() {
    //Find the container
    $container = $("#reaction-diffusion-container");
    container = $container.get(0);

    //Early out if we don't have WebGL
    if (!Detector.webgl) {
        Detector.addGetWebGLMessage(container);
        return;
    }
    loadFiles(['shaders/display-frag.glsl', 'shaders/compute-frag.glsl'], function (shaderText) {
        display_frag_source = shaderText[0];
        compute_frag_source = shaderText[1];

        var loader = new THREE.TextureLoader();
        loader.load('bias-image.png', function ( texture ) {
            importedBias = texture;
            //Run the rest of the program
            init();
        });

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

    initMaterials();

    scene = new THREE.Scene();

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
    var displayGeometry = new THREE.PlaneGeometry(1.0, 1.0);

    displayMesh = new THREE.Mesh(displayGeometry, displayMaterial);
    scene.add(displayMesh);

    //Add a wireframe to help see the borders of the mesh
    //var helper = new THREE.WireframeHelper(displayMesh);
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

    seedRenderTarget(computeRenderTargets[0]);
    applyFunctionToRenderTarget(computeRenderTargets[0], function(texture){
        //Seed it with the variables we want
        //seedInitial(texture);
        //seedCircle(texture, sizeX * 0.5, sizeY * 0.5, 200, 50);
        seedCircle(texture, texture.width * 0.5, texture.height * 0.5, Math.min(texture.width, texture.height) * 0.33, Math.min(texture.width, texture.height) * 0.125);

        //Add some bias in the center
        seedFilledCircle(texture, texture.width * 0.5, texture.height * 0.5, Math.min(texture.width, texture.height) * 0.25, 2);
    });

    renderLoop();
}

function initMaterials(){
    displayMaterialUniforms = {
        time: { type: "f", value: 1.0 },
        resolution: { type: "v2", value: new THREE.Vector2() },
        displayTexture: { value: null }
    };

    displayMaterial = new THREE.ShaderMaterial({
        uniforms: displayMaterialUniforms,
        vertexShader: getPassThroughVertexShader(),
        fragmentShader: display_frag_source
    });
    displayMaterial.blending = THREE.NoBlending;

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
        vertexShader: getPassThroughVertexShader(),
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

    var clearFn = { clear: function(){ clear(); }};
    gui.add(clearFn, "clear");

    var resetFn = { reset: function(){ reset(); }}
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

    displayMaterialUniforms.resolution.value = new THREE.Vector2(canvasWidth * internalResolutionMultiplier, canvasHeight * internalResolutionMultiplier);
    console.log("Display texture sized to (" + displayMaterialUniforms.resolution.value.x + ", " + displayMaterialUniforms.resolution.value.y + ")");

    computeUniforms.resolution.value = new THREE.Vector2(canvasWidth * internalResolutionMultiplier, canvasHeight * internalResolutionMultiplier);
    console.log("Compute texture sized to (" + computeUniforms.resolution.value.x + ", " + computeUniforms.resolution.value.y + ")");
}

var renderLoop = function(time)
{

    if(mouseIsDown){
        computeUniforms.interactPos.value = mousePos;
//        applyFunctionToRenderTarget(computeRenderTargets[currentTargetIndex], function(texture) {
//            seedCircle(texture, mousePos.x, mousePos.y, 25, 5);
//        });
    }

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

    //Update uniforms
    var elapsedSeconds = (Date.now() - startTime) / 1000.0;
    displayMaterialUniforms.time.value = 60.0 * elapsedSeconds;
    computeUniforms.time.value = 60.0 * elapsedSeconds;

    //Set the display mesh to use the compute shader
    displayMesh.material = computeMaterial;

    // Render from the current RenderTarget into the other RenderTarget, then swap.
    // Repeat however many times per frame we desire.
    for(var i=0; i<computeStepsPerFrame; i++) {

		var nextTargetIndex = currentTargetIndex === 0 ? 1 : 0;

        computeUniforms.chemicalTexture.value = computeRenderTargets[currentTargetIndex].texture; //Put current target texture into material
        renderer.render(scene, camera, computeRenderTargets[nextTargetIndex], true); //Render the scene to next target
        computeUniforms.chemicalTexture.value = computeRenderTargets[nextTargetIndex].texture; //Put next target texture into material
        displayMaterialUniforms.displayTexture.value = computeRenderTargets[nextTargetIndex].texture; //Assign to display material

        currentTargetIndex = nextTargetIndex;
    }

    //Set the display mesh to use the display material and render
    displayMesh.material = displayMaterial;
    renderer.render(scene, camera);
}

function seedRenderTarget(renderTarget) {
    var sizeX = renderTarget.width;// / internalResolutionMultiplier;
    var sizeY = renderTarget.height;// / internalResolutionMultiplier;

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
    passThroughUniforms.texture.value = importedBias;
    displayMesh.material = passThroughMaterial;
    renderer.render(scene, camera, renderTarget);
}

function applyFunctionToRenderTarget(renderTarget, callback){
    var sizeX = renderTarget.width;// / internalResolutionMultiplier;
    var sizeY = renderTarget.height;// / internalResolutionMultiplier;

    //Read renderTarget into a DataTexture
    var buffer = new Float32Array( sizeX * sizeY * 4 );
    renderer.readRenderTargetPixels(renderTarget, 0, 0, sizeX, sizeY, buffer);
    var texture = new THREE.DataTexture( buffer, sizeX, sizeY, THREE.RGBAFormat, THREE.FloatType );
    texture.needsUpdate = true;

    //Alter the DataTexture
    callback(texture);

    //Render DataTexture into renderTarget
    passThroughUniforms.texture.value = texture;
    displayMesh.material = passThroughMaterial;
    renderer.render(scene, camera, renderTarget);
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

function seedCircle(texture, x, y, radius = 100, thickness = 1, channel = 1) {
    var pixels = texture.image.data;
    var width = texture.image.width;
    var height = texture.image.height;

    for (var reps = 0; reps < thickness; reps++) {
        var currentRadius = radius - reps;
        var currentOpacity = 1.0; //1.0 - (reps / thickness);

        seedRing(texture, x, y, currentRadius, currentOpacity, channel);

    }

}

function seedRing(texture, x, y, radius, seedAmount = 1.0, channel = 1) {
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
            pixels[index + channel] = seedAmount;
        }


    }

}

function seedFilledCircle(texture, x, y, radius, channel = 1) {
    seedCircle(texture, x, y, radius, radius, channel);
}

function clear() {
    computeUniforms.doPass.value = 0.0;
    doRenderPass(0);
    doRenderPass(0);
    computeUniforms.doPass.value = 1.0;
}

function reset() {
    seedRenderTarget(computeRenderTargets[0]);
}


// INPUT HANDLING ---------------------------------------------------- //

function onDocumentMouseDown( event ) {
    var rect = container.getBoundingClientRect();
    mousePos.set(event.clientX - rect.left,
                 rect.bottom - event.clientY); //(event.clientY - rect.top) to invert
    mousePos.x *= internalResolutionMultiplier;
    mousePos.y *= internalResolutionMultiplier;

    //computeUniforms.interactPos.value = mousePos;
    mouseIsDown = true;

    //console.log("Clicked at (" + mousePos.x + ", " + mousePos.y + ")");

}

function onDocumentMouseUp( event ) {
    //Put the interaction position offscreen.

    mousePos.set(-1.0, -1.0);

    //computeUniforms.interactPos.value = mousePos;
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
