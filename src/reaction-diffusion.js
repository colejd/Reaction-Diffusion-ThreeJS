import * as THREE from 'three';
import { ReactionDiffusionRenderer } from "./rd-renderer";
import Stats from "./vendor/stats.js";

export class ReactionDiffusion {
    constructor(container) {
        this.container = container;
    }

    async Init() {

        this.rdView = new ReactionDiffusionRenderer();
        await this.rdView.Init(this.container.clientWidth, this.container.clientHeight, this.GetOptionalParamsFromContainerAttributes(this.container));
        this.container.appendChild(this.rdView.renderer.domElement);

        // Set up event listeners
        this.rdView.renderer.domElement.addEventListener("mousedown", event => this.OnMouseDown(event));
        document.addEventListener("mouseup", event => this.OnMouseUp(event));
        this.rdView.renderer.domElement.addEventListener("mousemove", event => this.OnMouseMove(event));
        this.rdView.renderer.domElement.addEventListener("mouseout", event => this.OnMouseOut(event));
        this.rdView.renderer.domElement.addEventListener("touchstart", event => this.OnTouchStart(event));
        this.rdView.renderer.domElement.addEventListener("touchend", event => this.OnTouchEnd(event));
        this.rdView.renderer.domElement.addEventListener("touchmove", event => this.OnTouchMove(event));

        this.rdView.renderer.domElement.style.width = "100%";
        this.rdView.renderer.domElement.style.height = "100%";

        // Set the default cursor for the renderer element
        this.rdView.renderer.domElement.style.cursor = "default";

        window.addEventListener("resize", event => {
            this.rdView.ReformRenderTargets(this.container.offsetWidth, this.container.offsetHeight);
        });

        // Add Stats module
        this.stats = new Stats();
        this.container.appendChild(this.stats.dom);
        this.stats.dom.style.display = "none";

        // Set up clock for timing
        this.clock = new THREE.Clock();




        // Call last
        this.RenderLoop();
    }

    RenderLoop() {

        this.rdView.Render(this.clock);

        this.stats.update();

        requestAnimationFrame( this.RenderLoop.bind(this) );
    }

    ToggleDebug() {
        this.stats.dom.style.display = this.stats.dom.style.display == "none" ? "block" : "none";
    }

    // Gives a dictionary holding the optional attributes a user might add
    // to the container in HTML-land.
    GetOptionalParamsFromContainerAttributes(container) {
        let params = new Object();

        let stepsPerFrame = container.getAttribute("steps-per-iteration");
        if (stepsPerFrame) params["stepsPerIteration"] = parseInt(stepsPerFrame);

        let feed = container.getAttribute("feed");
        if (feed) params["feed"] = parseFloat(feed);

        let kill = container.getAttribute("kill");
        if (kill) params["kill"] = parseFloat(kill);

        let resolutionScale = container.getAttribute("resolution-scale");
        if (resolutionScale) params["resolutionScale"] = parseFloat(resolutionScale);

        let timeScale = container.getAttribute("time-scale");
        if (timeScale) params["timeScale"] = parseFloat(timeScale);

        let seedFrequency = container.getAttribute("seed-frequency");
        if (seedFrequency) params["seedFrequency"] = parseFloat(seedFrequency);

        let allowInteraction = container.getAttribute("allow-interaction");
        if (allowInteraction) params["allowInteraction"] = allowInteraction == "true";

        return params;
    }

    // INPUT HANDLING ---------------------------------------------------- //

    OnMouseDown(event) {
        var rect = this.container.getBoundingClientRect();
        this.rdView.SetInteractPos(event.clientX - rect.left, rect.bottom - event.clientY);
        this.mouseIsDown = true;
    }

    OnMouseUp(event) {
        //Put the interaction position offscreen.
        this.rdView.SetInteractPos(-1000.0, -1000.0);
        this.mouseIsDown = false;
    }

    OnMouseOut(event) {
        //Put the interaction position offscreen.
        this.rdView.SetInteractPos(-1000.0, -1000.0);
    }

    OnMouseMove(event) {
        //Only update if the mouse is held down
        if (this.mouseIsDown === true) {
            let rect = this.container.getBoundingClientRect();
            this.rdView.SetInteractPos(event.clientX - rect.left, rect.bottom - event.clientY);
        }
    }

    OnTouchStart(event) {
        if(!this.mouseIsDown){
            var rect = this.container.getBoundingClientRect();
            var touches = event.changedTouches;
            this.rdView.SetInteractPos(touches[0].clientX - rect.left, rect.bottom - touches[0].clientY);
            this.mouseIsDown = true;
        }
    }

    OnTouchOut(event) {
        this.rdView.SetInteractPos(-1000.0, -1000.0);
    }

    OnTouchEnd(event) {
        this.mouseIsDown = false;
        this.rdView.SetInteractPos(-1000.0, -1000.0);
    }

    OnTouchMove(event){
        event.preventDefault();
        if(this.mouseIsDown === true){
            var rect = this.container.getBoundingClientRect();
            var touches = event.changedTouches;
            if(touches.length > 0){
                this.rdView.SetInteractPos(touches[0].clientX - rect.left, rect.bottom - touches[0].clientY);
            }
        }
    }


}