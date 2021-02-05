import * as THREE from 'three';

import { Detector } from "./utils/webgl-detect";

import { FileLoader } from './utils/file-loader.js';
import computeFragURL from './resources/shaders/compute-frag.glsl';
import computeVertURL from './resources/shaders/compute-vert.glsl';
import displayFragURL from './resources/shaders/display-frag.glsl';
import presets from './presets.json';

var SimplexNoise = require('simplex-noise');

import { baseVertexShader, baseFragmentShader } from './utils/shaders.js';

export class ReactionDiffusionRenderer {
    constructor() {
        this.filterType = THREE.LinearFilter; //THREE.NearestFilter
        this.internalResolutionMultiplier = 0.5;

        this.computeRenderTargets = [];
        this.computeStepsPerFrame = 16;
        this.currentTargetIndex = 0;
        this.imageType = THREE.FloatType;

        this.resize = null;

        this.seedType = "Circle";
    }

    async Init(width, height, optionalParams) {
        // Load shaders
        await FileLoader.LoadFiles(computeFragURL, computeVertURL, displayFragURL)
            .then((responses) => {
                [this.computeFrag, this.computeVert, this.displayFrag] = responses;
            })
            .catch((error) => {
                throw error;
            });

        this.renderer = new THREE.WebGLRenderer({
            premultipliedAlpha: false,
            preserveDrawingBuffer: false,
            powerPreference: "high-performance"
        });


        // Check for WebGL support needed for the program to run
        if (this.renderer.capabilities.maxVertexTextures === 0) {
            throw new Error("System does not support vertex shader textures!");
        }

        // Configure renderer based on available texture float precision
        let fallbackToHalfPrecision = this.forceHalfPrecision;
        // https://developer.mozilla.org/en-US/docs/Web/API/OES_texture_float
        let supportsTextureFloat = this.renderer.capabilities.isWebGL2 ? true : this.renderer.extensions.get("OES_texture_float");
        // https://developer.mozilla.org/en-US/docs/Web/API/OES_texture_half_float
        let supportsTextureHalfFloat = this.renderer.capabilities.isWebGL2 ? true : this.renderer.extensions.get("OES_texture_half_float");
        // https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices#support_for_float_textures_doesnt_mean_you_can_render_into_them!
        let supportsFullPrecisionRenderToTexture = this.renderer.capabilities.isWebGL2 ? this.renderer.extensions.get("EXT_color_buffer_float") : this.renderer.extensions.get("WEBGL_color_buffer_float");
        let supportsHalfPrecisionRenderToTexture = this.renderer.capabilities.isWebGL2 ? this.renderer.extensions.get("EXT_color_buffer_float") : this.renderer.extensions.get("EXT_color_buffer_half_float");

        // Try to use full precision if available and not manually forced to half precision
        if (supportsTextureFloat && !fallbackToHalfPrecision) {
            console.log("Trying to use full-precision float textures...");
            this.imageType = THREE.FloatType;

            // Detect support for rendering into float textures
            if (supportsFullPrecisionRenderToTexture) {
                if (!this.renderer.extensions.get("OES_texture_float_linear")) {
                    console.log("OES_texture_float_linear not supported. Falling back on nearest-neighbor filtering.");
                    this.filterType = THREE.NearestFilter;
                }
                console.log("Successfully using full-precision float textures.");
            } else {
                console.log("WebGL 2 highp context does not support render-to-texture! Falling back to halfp...");
                fallbackToHalfPrecision = true;
            }
        } else {
            fallbackToHalfPrecision = true;
        }

        if (fallbackToHalfPrecision) {
            console.log("Trying to use half-precision float textures...");
            this.imageType = THREE.HalfFloatType;

            if (supportsHalfPrecisionRenderToTexture) {
                if (!this.renderer.extensions.get("OES_texture_half_float_linear")) {
                    console.log("OES_texture_half_float_linear not supported. Falling back on nearest-neighbor filtering.");
                    this.filterType = THREE.NearestFilter;
                }
                console.log("Successfully using half-precision float textures.");
            } else {
                throw new Error("WebGL context does not support float textures!");
            }
        }

        this.renderer.setSize(width, height);
        this.renderer.setClearColor(0x00ffff, 1); //Cyan clear color
        this.renderer.setPixelRatio(window.devicePixelRatio);

        this.CreateMaterials();

        this.scene = new THREE.Scene();
        //Set up 1x1 orthographic camera looking along the negative z axis
        this.camera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 1, 100);
        this.camera.position.z = 10; //Scoot backward some arbitrary amount to fit in camera near/far range

        //Make plane primitive
        let displayGeometry = new THREE.PlaneBufferGeometry(1.0, 1.0);
        this.displayMesh = new THREE.Mesh(displayGeometry, this.displayMaterial);
        this.displayMesh.matrixAutoUpdate = false;
        this.scene.add(this.displayMesh);

        this.SetPreset("Coral");

        // Apply params specified by html attributes on container if present
        this.IngestOptionalHTMLAttributes(optionalParams);

        this.ReformRenderTargets(width, height);
        this.Reset();

    }

    /**
     * Apply params specified by html attributes on the container if present
     */
    IngestOptionalHTMLAttributes(optionalParams) {
        if (optionalParams.stepsPerIteration != null) {
            this.computeStepsPerFrame = optionalParams.stepsPerIteration;
            console.log(`Using iterations-per-frame value from HTML attributes = ${optionalParams.stepsPerIteration}`)
        }
        if (optionalParams.feed != null) {
            this.computeUniforms.feed.value = optionalParams.feed;
            console.log(`Using f value from HTML attributes = ${optionalParams.feed}`);
        }
        if (optionalParams.kill != null) {
            this.computeUniforms.kill.value = optionalParams.kill;
            console.log(`Using k value from HTML attributes = ${optionalParams.kill}`);
        }
        if (optionalParams.timeScale != null) {
            this.computeUniforms.timestep.value = optionalParams.timeScale;
            console.log(`Using time-scale value from HTML attributes = ${optionalParams.timeScale}`);
        }
        if (optionalParams.resolutionScale != null) {
            this.internalResolutionMultiplier = optionalParams.resolutionScale;
            console.log(`Using resolution-scale value from HTML attributes = ${optionalParams.resolutionScale}`);
        }
        if (optionalParams.seedFrequency != null) {
            this.seedFrequency = optionalParams.seedFrequency;
            console.log(`Using seed-frequency value from HTML attributes = ${optionalParams.seedFrequency}`);
        }
        if (optionalParams.allowInteraction != null) {
            this.allowInteraction = optionalParams.allowInteraction;
            console.log(`Using allow-interaction value from HTML attributes = ${optionalParams.allowInteraction}`);
        }
        if (optionalParams.forceHalfPrecision != null) {
            this.forceHalfPrecision = optionalParams.forceHalfPrecision
            console.log(`Using force-half-precision value from HTML attributes = ${optionalParams.forceHalfPrecision}`);
        }
    }

    Render(clock) {
        if (this.resize) {
            this.ReformRenderTargets(this.resize.x,  this.resize.y);
            this.resize = null;
        }

        //Update uniforms
        this.displayMaterialUniforms.time.value = 60.0 * clock.getElapsedTime();
        this.computeUniforms.time.value = 60.0 * clock.getElapsedTime();

        //Set the display mesh to use the compute shader
        this.displayMesh.material = this.computeMaterial;

        // Render from the current RenderTarget into the other RenderTarget, then swap.
        // Repeat however many times per frame we desire.
        for (var i = 0; i < this.computeStepsPerFrame; i++) {
            var nextTargetIndex = this.currentTargetIndex === 0 ? 1 : 0;

            this.computeUniforms.sourceTexture.value = this.computeRenderTargets[this.currentTargetIndex].texture; //Put current target texture into material
            this.renderer.setRenderTarget(this.computeRenderTargets[nextTargetIndex]);
            this.renderer.render(this.scene, this.camera); //Render the scene to next target
            this.computeUniforms.sourceTexture.value = this.computeRenderTargets[nextTargetIndex].texture; //Put next target texture into material
            this.displayMaterialUniforms.displayTexture.value = this.computeRenderTargets[nextTargetIndex].texture; //Assign to display material

            this.currentTargetIndex = nextTargetIndex;
        }

        //Set the display mesh to use the display material and render the final frame
        this.displayMesh.material = this.displayMaterial;
        this.renderer.setRenderTarget(null); // Set canvas as render target
        this.renderer.render(this.scene, this.camera);
    }

    SetPreset(presetName) {
        this.selectedPreset = presetName;
        let preset = presets[presetName];
        this.computeUniforms.feed.value = preset.feed;
        this.computeUniforms.kill.value = preset.kill;
        this.computeUniforms.biasStrength.value = preset.biasStrength;
    }

    Clear() {
        this.ApplyFunctionToRenderTarget(this.computeRenderTargets[0], this.SeedInitial);
        this.ApplyFunctionToRenderTarget(this.computeRenderTargets[1], this.SeedInitial);
    }

    Reset() {
        let Seed = (texture) => {
            let sizeX = texture.image.width;
            let sizeY = texture.image.height;
            this.SeedInitial(texture);
            //this.SeedCircle(texture, sizeX * 0.5, sizeY * 0.5, Math.min(sizeX, sizeY) * 0.33, Math.min(sizeX, sizeY) * 0.125);

            //Add some bias in the center
            //this.SeedFilledCircle(texture, sizeX * 0.5, sizeY * 0.5, Math.min(sizeX, sizeY) * 0.25, 2);

            if (this.seedFrequency != null || this.seedType == "Noise") {
                this.SeedNoise(texture);
            } else if (this.seedType == "Circle") {
                this.SeedFilledCircle(texture, sizeX * 0.5, sizeY * 0.5, 5.0);
            } else {
                throw new Error(`Invalid seedType specified: ${this.seedType}`);
            }
        }
        this.ApplyFunctionToRenderTarget(this.computeRenderTargets[0], Seed);
        this.ApplyFunctionToRenderTarget(this.computeRenderTargets[1], Seed);

    }

    ReformRenderTargets(width, height) {
        console.log("Reforming render targets...");

        // Force size to be even so that resolutionMultiplier can't break things
        if (width % 2 != 0) width -= 1;
        if (height % 2 != 0) height -= 1;

        this.renderer.setSize(width, height);
        this.displayMaterialUniforms.resolution.value = new THREE.Vector2(width, height);
        console.log(`Renderer resized to (${width}, ${height})`);

        let computeResolution = new THREE.Vector2(width * this.internalResolutionMultiplier, height * this.internalResolutionMultiplier);
        if (computeResolution.x % 2 != 0) computeResolution.x -= 1;
        if (computeResolution.y % 2 != 0) computeResolution.y -= 1;

        this.computeUniforms.resolution.value = computeResolution;
        console.log(`Compute texture sized to (${computeResolution.x}, ${computeResolution.y})`);
        //console.log(`Compute texture sized to (${this.computeUniforms.resolution.value.x}, ${this.computeUniforms.resolution.value.y})`);

        // Determine texel size (size of a pixel when resolution is normalized between 0 and 1)
        let texelSize = new THREE.Vector2(1.0 / computeResolution.width, 1.0 / computeResolution.height);
        this.computeUniforms.texelSize.value = texelSize;

        // Make the two render targets
        for (let i = 0; i < 2; i++) {
            // this.computeRenderTargets[i] = null;
            let newTarget = new THREE.WebGLRenderTarget(computeResolution.x, computeResolution.y, {
                wrapS: THREE.RepeatWrapping,
                wrapT: THREE.RepeatWrapping,
                minFilter: this.filterType,
                magFilter: this.filterType,
                format: THREE.RGBAFormat,
                type: this.imageType,
                depthBuffer: false
            });
            newTarget.texture.name = `render texture ${i}`;

            if (this.computeRenderTargets[this.currentTargetIndex]) {
                this.ApplyFunctionToRenderTarget(newTarget, this.SeedInitial);
                this.ResizeRenderTargetIntoNewRenderTarget(this.computeRenderTargets[this.currentTargetIndex], newTarget);
            }
            this.computeRenderTargets[i] = newTarget;
        }

        console.log("Done reforming render targets.");
    }

    CreateMaterials() {
        this.displayMaterialUniforms = {
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

        this.displayMaterial = new THREE.ShaderMaterial({
            uniforms: this.displayMaterialUniforms,
            vertexShader: baseVertexShader,
            fragmentShader: this.displayFrag
        });
        this.displayMaterial.blending = THREE.NoBlending;

        this.computeUniforms = {
            sourceTexture: {
                type: "t",
                value: undefined
            },
            resolution: {
                type: "v2",
                value: new THREE.Vector2()
            },
            texelSize: {
                type: "v2",
                value: new THREE.Vector2()
            },
            time: {
                type: "f",
                value: 1.0
            },
            feed: {
                type: "f",
                value: 0.035
            },
            kill: {
                type: "f",
                value: 0.064
            },
            da: {
                type: "f",
                value: 0.2097
            },
            db: {
                type: "f",
                value: 0.105
            },
            biasStrength: {
                type: "f",
                value: 0.005
            },
            timestep: {
                type: "f",
                value: 1.0
            },
            interactPos: {
                type: "v2",
                value: new THREE.Vector2(-1.0, -1.0) // Place offscreen to prevent drawing
            },
            doPass: {
                type: "f",
                value: 1.0
            },
            dropperSize: {
                type: "f",
                value: 5.0
            }
        }

        this.computeMaterial = new THREE.ShaderMaterial({
            uniforms: this.computeUniforms,
            vertexShader: this.computeVert,
            fragmentShader: this.computeFrag,
        });
        this.computeMaterial.blending = THREE.NoBlending;

        this.passThroughUniforms = {
            tex: {
                value: null
            }
        };
        this.passThroughMaterial = new THREE.ShaderMaterial({
            uniforms: this.passThroughUniforms,
            vertexShader: baseVertexShader,
            fragmentShader: baseFragmentShader
        });
        this.passThroughMaterial.blending = THREE.NoBlending;
    }

    ResizeRenderTargetIntoNewRenderTarget(oldTarget, newTarget) {

        // Bail if the new size is the same as the old size
        if (oldTarget.width == newTarget.width && oldTarget.height == newTarget.height) return;

        console.log(`Resizing target from (${oldTarget.width}, ${oldTarget.height}) to (${newTarget.width}, ${newTarget.height})`)

        //Read oldTarget into a DataTexture
        var oldBuffer = new Float32Array(oldTarget.width * oldTarget.height * 4);
        this.renderer.readRenderTargetPixels(oldTarget, 0, 0, oldTarget.width, oldTarget.height, oldBuffer);

        //Read newTarget into a DataTexture
        var newBuffer = new Float32Array(newTarget.width * newTarget.height * 4);
        this.renderer.readRenderTargetPixels(newTarget, 0, 0, newTarget.width, newTarget.height, newBuffer);

        const componentSize = 4;

        for (var y = 0; y < oldTarget.height; y++) {
            for (var x = 0; x < oldTarget.width; x++) {
                var coordInNewBuffer = (x * componentSize) + ((newTarget.width * componentSize) * y);
                var coordInOldBuffer = (x * componentSize) + ((oldTarget.width * componentSize) * y);
                // if (x < 4 && y < 10) console.log(`(${x}, ${y}) -> old: ${coordInOldBuffer}, new: ${coordInNewBuffer}`);
                newBuffer[coordInNewBuffer + 0] = oldBuffer[coordInOldBuffer + 0];
                newBuffer[coordInNewBuffer + 1] = oldBuffer[coordInOldBuffer + 1];
            }
        }

        var texture = new THREE.DataTexture(newBuffer, newTarget.width, newTarget.height, THREE.RGBAFormat, THREE.FloatType);
        // texture.needsUpdate = true;

        //Render DataTexture into renderTarget
        this.passThroughUniforms.tex.value = texture;

        this.displayMesh.material = this.passThroughMaterial;
        this.renderer.setRenderTarget(newTarget);
        this.renderer.render(this.scene, this.camera);

        // Clean up
        this.passThroughUniforms.tex.value = null;
    }

    ApplyFunctionToRenderTarget(renderTarget, callback) {
        //Read renderTarget into a DataTexture
        var buffer = new Float32Array(renderTarget.width * renderTarget.height * 4);
        this.renderer.readRenderTargetPixels(renderTarget, 0, 0, renderTarget.width, renderTarget.height, buffer);
        var texture = new THREE.DataTexture(buffer, renderTarget.width, renderTarget.height, THREE.RGBAFormat, THREE.FloatType); // TODO: Might need to redo this part for half-precision targets
        texture.needsUpdate = true;

        //Run the callback with the DataTexture
        callback(texture);

        //Render DataTexture into renderTarget
        this.passThroughUniforms.tex.value = texture;

        //var oldMaterial = displayMesh.material;
        this.displayMesh.material = this.passThroughMaterial;
        this.renderer.setRenderTarget(renderTarget);
        // this.renderer.clear();
        this.renderer.render(this.scene, this.camera);
        //displayMesh.material = oldMaterial;
        this.passThroughUniforms.tex.value = null;

        var gl = this.renderer.getContext();
        var status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
        if (status !== gl.FRAMEBUFFER_COMPLETE) {
            throw new Error("Couldn't render into framebuffer (browser likely has no undocumented or explicit support for WEBGL_color_buffer_float)");
        }
    }

    SeedInitial(texture) {
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

    SeedSquare(texture, x, y, size = 100) {
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

    SeedCircle(texture, x, y, radius, thickness = 1, channel = 1, value = 1.0) {
        var pixels = texture.image.data;
        var width = texture.image.width;
        var height = texture.image.height;

        for (var reps = 0; reps < thickness; reps++) {
            var currentRadius = radius - reps;
            var currentOpacity = value; //1.0 - (reps / thickness);

            this.SeedRing(texture, x, y, currentRadius, channel, currentOpacity);

        }

    }

    SeedRing(texture, x, y, radius, channel = 1, value = 1.0) {
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

    SeedFilledCircle(texture, x, y, radius, channel = 1) {
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

    SeedNoise(texture, frequency = 4.0) {
        var simplex = new SimplexNoise(Math.random);

        const width = texture.image.width;
        const height = texture.image.height;
        var pixels = texture.image.data;
        var px = 0;
        for (var i = 0; i < width; i++) {
            for (var j = 0; j < height; j++) {

                let nx = i / width;
                let ny = j / height;

                let r = simplex.noise2D(frequency * nx, frequency * ny) + 1 / 2; // Normalize from [-1, 1] to [0, 1]
                r = Math.pow(r, 20); // Makes peaks more dramatic. See https://www.redblobgames.com/maps/terrain-from-noise/
                if (r > 1.0) r = 1; // Cap value at 1.0
                if (r < 0.5) r = 0; // High pass at 0.5

                pixels[px + 1] = r;

                px += 4;
            }
        }
    }

    SetInteractPos(x, y) {
        // console.log(`(${x}, ${y})`);
        if (this.allowInteraction == null || this.allowInteraction == true) { // As long as false isn't explicitly specified
            this.computeUniforms.interactPos.value = new THREE.Vector2(x * this.internalResolutionMultiplier, y * this.internalResolutionMultiplier);
        }
    }
}