import * as THREE from 'three';

import { Detector } from "./utils/webgl-detect";

import { FileLoader } from './utils/file-loader.js';
import computeFragURL from './resources/shaders/compute-frag.glsl';
import computeVertURL from './resources/shaders/compute-vert.glsl';
import displayFragURL from './resources/shaders/display-frag.glsl';
import presets from './presets.json';

import { baseVertexShader, baseFragmentShader } from './utils/shaders.js';

export class ReactionDiffusionRenderer {
    constructor() {
        this.filterType = THREE.LinearFilter; //THREE.NearestFilter
        this.internalResolutionMultiplier = 0.5;

        this.computeRenderTargets = [];
        this.computeStepsPerFrame = 16;
        this.currentTargetIndex = 0;
        // Use half float type if on mobile (iOS in particular)
        this.imageType = (Detector.IsMobile() && !this.renderer.extensions.get("WEBGL_color_buffer_float")) ? THREE.HalfFloatType : THREE.FloatType;

    }

    async Init(width, height) {
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
            preserveDrawingBuffer: true
        });

        // Check for the GL extensions we need to run
        // if (!this.renderer.extensions.get("OES_texture_float")) {
        //     throw new Error("System does not support OES_texture_float!");
        // }
        // if (this.renderer.capabilities.maxVertexTextures === 0) {
        //     throw new Error("System does not support vertex shader textures!");
        // }
        // if (!this.renderer.extensions.get("OES_texture_float_linear")){
        //     throw new Error("System does not support OES_texture_float_linear!");
        // }
        // if (this.renderer.capabilities.maxVaryings < 5){
        //     throw new Error("System does not support the number of varying vectors (>= 5) needed to function!");
        // }

        this.renderer.setSize(width, height);
        this.renderer.setClearColor(0x00ffff, 1); //Cyan clear color
        this.renderer.setPixelRatio(window.devicePixelRatio);

        this.CreateMaterials();

        this.scene = new THREE.Scene();
        //Set up 1x1 orthographic camera looking along the negative z axis
        this.camera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 10, 100);
        this.camera.position.z = 50; //Scoot backward 50 units

        //Make plane primitive
        let displayGeometry = new THREE.PlaneGeometry(1.0, 1.0);
        this.displayMesh = new THREE.Mesh(displayGeometry, this.displayMaterial);
        this.scene.add(this.displayMesh);

        this.SetPreset("Coral");
        this.ReformRenderTargets(width, height);
        this.Reset();

    }

    Render(clock) {
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
            this.renderer.render(this.scene, this.camera, this.computeRenderTargets[nextTargetIndex], true); //Render the scene to next target
            this.computeUniforms.sourceTexture.value = this.computeRenderTargets[nextTargetIndex].texture; //Put next target texture into material
            this.displayMaterialUniforms.displayTexture.value = this.computeRenderTargets[nextTargetIndex].texture; //Assign to display material

            this.currentTargetIndex = nextTargetIndex;
        }

        //Set the display mesh to use the display material and render the final frame
        this.displayMesh.material = this.displayMaterial;
        this.renderer.render(this.scene, this.camera);
    }

    SetPreset(presetName) {
        this.selectedPreset = presetName;
        let preset = presets[presetName];
        this.computeUniforms.feed.value = preset.feed;
        this.computeUniforms.kill.value = preset.kill;
        this.computeUniforms.biasStrength = preset.biasStrength;
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

            this.SeedFilledCircle(texture, sizeX * 0.5, sizeY * 0.5, 5.0);
        }
        this.ApplyFunctionToRenderTarget(this.computeRenderTargets[0], Seed);
        this.ApplyFunctionToRenderTarget(this.computeRenderTargets[1], Seed);

    }

    ReformRenderTargets(width, height) {

        this.computeRenderTargets = null; // Force the elements to delete
        this.computeRenderTargets = [];

        this.renderer.setSize(width, height);
        //console.log("Renderer resized to (" + width + ", " + height + ")");

        // Make the two render targets
        for(let i = 0; i < 2; i++){
            let newTarget = new THREE.WebGLRenderTarget(width * this.internalResolutionMultiplier, height * this.internalResolutionMultiplier, {
                minFilter: this.filterType,
                magFilter: this.filterType,
                format: THREE.RGBAFormat,
                type: this.imageType
            });
            newTarget.texture.wrapS = THREE.RepeatWrapping;
            newTarget.texture.wrapT = THREE.RepeatWrapping;
            newTarget.texture.name = `render texture ${i}`;
            this.computeRenderTargets.push(newTarget);
        }

        this.displayMaterialUniforms.resolution.value = new THREE.Vector2(width * this.internalResolutionMultiplier, height * this.internalResolutionMultiplier);
        console.log(`Display texture sized to (${this.displayMaterialUniforms.resolution.value.x}, ${this.displayMaterialUniforms.resolution.value.y})`);

        this.computeUniforms.resolution.value = new THREE.Vector2(width * this.internalResolutionMultiplier, height * this.internalResolutionMultiplier);
        //console.log(`Compute texture sized to (${this.computeUniforms.resolution.value.x}, ${this.computeUniforms.resolution.value.y})`);
    
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
            texture: {
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

    ApplyFunctionToRenderTarget(renderTarget, callback) {
        //Read renderTarget into a DataTexture
        var buffer = new Float32Array(renderTarget.width * renderTarget.height * 4);
        this.renderer.readRenderTargetPixels(renderTarget, 0, 0, renderTarget.width, renderTarget.height, buffer);
        var texture = new THREE.DataTexture(buffer, renderTarget.width, renderTarget.height, THREE.RGBAFormat, THREE.FloatType);
        texture.needsUpdate = true;

        //Run the callback with the DataTexture
        callback(texture);

        //Render DataTexture into renderTarget
        this.passThroughUniforms.texture.value = texture;

        //var oldMaterial = displayMesh.material;
        this.displayMesh.material = this.passThroughMaterial;
        this.renderer.render(this.scene, this.camera, renderTarget);
        //displayMesh.material = oldMaterial;

        var gl = this.renderer.context;
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

    SetInteractPos(x, y) {
        // console.log(`(${x}, ${y})`);
        this.computeUniforms.interactPos.value = new THREE.Vector2(x * this.internalResolutionMultiplier, y * this.internalResolutionMultiplier);
    }
}