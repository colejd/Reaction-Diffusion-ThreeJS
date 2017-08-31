require("babel-polyfill");
import { Detector } from "./utils/webgl-detect";
import { gui } from "./gui";
import { ReactionDiffusion } from "./reaction-diffusion.js";

let Init = () => {
    let container = document.getElementById("reaction-diffusion-container");
    if(!container) throw new Error("No #reaction-diffusion-container found!");

    if (!Detector.HasWebGL()) {
        throw new Error("WebGL is not supported on this browser.");
        container.innerHTML = Detector.GetErrorHTML();
        container.classList.add("no-webgl");
    }
    else {
        let rd = new ReactionDiffusion(container)
        rd.Init().then(() => {
            gui.Init(rd, container);
        }).catch(error => {
            console.error(error);
            container.innerHTML = Detector.GetErrorHTML(error);
            container.classList.add("no-webgl");
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
