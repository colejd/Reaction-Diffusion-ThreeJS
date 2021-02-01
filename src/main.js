// For polyfilling js
import "core-js/stable";
import "regenerator-runtime/runtime";

import { Detector } from "./utils/webgl-detect";
import { gui } from "./gui";
import { ReactionDiffusion } from "./reaction-diffusion.js";

let Init = () => {
    let container = document.getElementById("reaction-diffusion-container");
    if(!container) throw new Error("No #reaction-diffusion-container found!");

    if (!Detector.HasWebGL()) {
        container.innerHTML = Detector.GetErrorHTML();
        container.classList.add("no-webgl");
        container.classList.add("rd-init-failed");
        throw new Error("WebGL is not supported on this browser.");
    }
    else {
        let rd = new ReactionDiffusion(container);

        rd.Init().then(() => {
            // Add GUI on top if requested
            if (container.getAttribute("no-gui") != "true") {
                gui.Init(rd, container);
            }
            container.classList.add("rd-init-success");
        }).catch(error => {
            console.error(error);
            container.classList.add("no-webgl");
            container.classList.add("rd-init-failed");
        });
    }

}

if (document.readyState === 'complete') {
    Init();
} else {
    window.onload = () => {
        Init();
    }
}