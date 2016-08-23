"use strict";

//Define THREE globally so that autocomplete uses it
var THREE;

var container, stats;
var camera, scene, renderer, planeMesh;
var frustumSize = 1;
var planeMaterial;

var gpuCompute;
var computeVariable;
var planeMaterialUniforms;

var display_vert_source;
var display_frag_source;
var compute_frag_source;

var computeStepsPerFrame = 8;
var internalResolutionMultiplier = 1.0;
var internalWidth;
var internalHeight;

var startTime = Date.now();

var rdTexture;

var mousePos = new THREE.Vector2();
var mouseIsDown = false;

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
    container = document.getElementById('reaction-diffusion-container');
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

        planeMaterialUniforms = {
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
            } //texture: { type: "t", value: makeSeedTexture() }
        };

        planeMaterial = new THREE.ShaderMaterial({
            uniforms: planeMaterialUniforms,
            vertexShader: display_vert_source,
            fragmentShader: display_frag_source
        });

        //Run the rest of the program
        init();
    }, function (url) {
        alert('Failed to fetch "' + url + '"');
    });
}

function init() {

    //Set up renderer and embed in HTML
    renderer = new THREE.WebGLRenderer({ premultipliedAlpha : false });
    renderer.setSize(container.offsetWidth, container.offsetHeight);
    renderer.setClearColor(0xf0f000, 1);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    //Set the resolution of the display shader, minding that it is screen space and is affected by the device pixel ratio.
    planeMaterialUniforms.resolution.value.x = renderer.getSize().width * renderer.getPixelRatio();
    planeMaterialUniforms.resolution.value.y = renderer.getSize().height * renderer.getPixelRatio();

    console.log("Set screen space resolution to (" + planeMaterialUniforms.resolution.value.x + ", " + planeMaterialUniforms.resolution.value.y + ")");

    internalWidth = renderer.getSize().width;
    internalHeight = renderer.getSize().height;

    scene = new THREE.Scene();

    var aspect = renderer.getSize().width / renderer.getSize().height;
    var planeSize = 1.0;

    //camera = new THREE.PerspectiveCamera( 50, container.offsetWidth / container.offsetHeight, 1, 1000 );
    camera = new THREE.OrthographicCamera(planeSize * frustumSize * aspect / -2,
        planeSize * frustumSize * aspect / 2,
        planeSize * frustumSize / 2,
        planeSize * frustumSize / -2,
        150, 1000);
    camera.position.y = 0;
    camera.position.z = 500;
    camera.lookAt(scene.position);

    //var testMaterial = new THREE.MeshBasicMaterial( {color: 0x00ff00} );

    var planeGeometry = new THREE.Geometry();
    planeGeometry.vertices.push(new THREE.Vector3(-planeSize * aspect / 2, -planeSize / 2, 0));
    planeGeometry.vertices.push(new THREE.Vector3(planeSize * aspect / 2, -planeSize / 2, 0));
    planeGeometry.vertices.push(new THREE.Vector3(planeSize * aspect / 2, planeSize / 2, 0));
    planeGeometry.vertices.push(new THREE.Vector3(-planeSize * aspect / 2, planeSize / 2, 0));
    //Push triangles
    planeGeometry.faces.push(new THREE.Face3(0, 1, 2));
    planeGeometry.faces.push(new THREE.Face3(0, 2, 3));
    //Construct and add mesh
    var planeMesh = new THREE.Mesh(planeGeometry, planeMaterial);
    planeMesh.dynamic = true;
    scene.add(planeMesh);

    //planeMesh.material.wireframe = true;
    //planeMesh.material.needsUpdate = true;

    //Add a wireframe to help see the borders of the mesh
    //var helper = new THREE.WireframeHelper(planeMesh);
    //helper.material.color.set(0xff0000);
    //scene.add( helper );

    //Set up compute shaders
    initCompute();

    //Set up GUI
    initGUI();

    //Set up listener events
    container.onmousedown = onDocumentMouseDown;
    container.onmouseup = onDocumentMouseUp;
    container.onmousemove = onDocumentMouseMove;

    stats = new Stats();
    container.appendChild(stats.dom);

    animate();
}

function initCompute() {

    gpuCompute = new GPUComputationRenderer(internalWidth, internalHeight, renderer); //use power of 2 textures instead?

    //Make the texture
    rdTexture = gpuCompute.createTexture();
    prepareComputeTexture(rdTexture);

    //Seed the texture
    seedCircle(rdTexture, internalWidth * 0.5, internalHeight * 0.5, Math.min(internalWidth, internalHeight) * 0.33, Math.min(internalWidth, internalHeight) * 0.125);
    //seedFilledCircle(rdTexture, width * 0.5, height * 0.5, Math.min(width, height) * 0.25);
    //seedSquare(rdTexture, 0, 0, 100);
    //Add some bias in the blue channel
    seedFilledCircle(rdTexture, internalWidth * 0.5, internalHeight * 0.5, Math.min(internalWidth, internalHeight) * 0.25, 2);

    //Assign the texture
    computeVariable = gpuCompute.addVariable("chemicalTexture", compute_frag_source, rdTexture);
    gpuCompute.setVariableDependencies(computeVariable, [computeVariable]);

    //Need to initialize uniforms here if you want to change them later
    computeVariable.material.uniforms.time = { value: 0.0 };
    computeVariable.material.uniforms.interactPos = { value: new THREE.Vector2( -1, -1 ) };
    computeVariable.material.uniforms.doPass = { value: 1.0 };

    //Check for completeness
    var error = gpuCompute.init();
    if (error !== null) {
        console.error("Error initializing compute: " + error);
    } else {
        console.info("Compute initialized.");
    }

}

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
        computeVariable.material.uniforms.timestep = { value: currentOptions.timestep };
        computeVariable.material.uniforms.d_a = { value: currentOptions.d_a };
        computeVariable.material.uniforms.d_b = { value: currentOptions.d_b };
        computeVariable.material.uniforms.feed = { value: currentOptions.feed };
        computeVariable.material.uniforms.kill = { value: currentOptions.kill };
        computeVariable.material.uniforms.biasStrength = { value: currentOptions.biasStrength };

        computeVariable.material.uniforms.dropperSize = { value: currentOptions.dropperSize };

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

//Repeats automatically after being called the first time.
function animate() {
    requestAnimationFrame(animate);

    for (var i = 0; i < computeStepsPerFrame; i++) {
        gpuCompute.compute();
    }

    //Transfer the result of the compute shader to the display shader
    planeMaterialUniforms.displayTexture.value = gpuCompute.getCurrentRenderTarget(computeVariable).texture;

    render();
    stats.update();

}

function render() {
    var elapsedSeconds = (Date.now() - startTime) / 1000.0;

    //Update display shader
    planeMaterialUniforms.time.value = 60.0 * elapsedSeconds;

    //Update compute shader
    computeVariable.material.uniforms.time = { value: 60.0 * elapsedSeconds };

    //Render the scene last
    renderer.render(scene, camera);
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
    computeVariable.material.uniforms.doPass.value = 0.0;
    gpuCompute.compute();
    computeVariable.material.uniforms.doPass.value = 1.0;
}

function onDocumentMouseDown( event ) {
    var rect = container.getBoundingClientRect();
    mousePos.set(event.clientX - rect.left,
                 rect.bottom - event.clientY); //(event.clientY - rect.top) to invert

    //console.log("Clicked at (" + mousePos.x + ", " + mousePos.y + ")");

    computeVariable.material.uniforms.interactPos.value = mousePos;

//    console.log("Uniforms");
//    console.log(computeVariable.material.uniforms);

    mouseIsDown = true;

}

function onDocumentMouseUp( event ) {
    //Put the interaction position offscreen.

    mousePos.set(-1.0, -1.0);

    computeVariable.material.uniforms.interactPos.value = mousePos;
    mouseIsDown = false;
}

function onDocumentMouseMove( event ) {
    //Only update if the mouse is held down
    if(mouseIsDown){
        var rect = container.getBoundingClientRect();
        mousePos.set(event.clientX - rect.left,
                     rect.bottom - event.clientY); //(event.clientY - rect.top) to invert
    }


}

function getPixelWidth(){
    return renderer.getSize().width * renderer.getPixelRatio();
}

function getPixelHeight(){
    renderer.getSize().height * renderer.getPixelRatio();
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
