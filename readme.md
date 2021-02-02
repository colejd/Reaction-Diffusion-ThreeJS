# Reaction-Diffusion Simulation in Three.js

<p align="center">
   <a href="https://jons.website/projects/reaction-diffusion">
      <img src="/misc/images/reaction-diffusion.png" alt="Image of Reaction-Diffusion Simulator" width="75%">
   </a>
   </br>
   </br>
   <a href="https://jons.website/projects/reaction-diffusion">Try it out here!</a>
   </br>
   </br>
</p>

This project is a reaction-diffusion simulator based on the [Gray-Scott model](https://groups.csail.mit.edu/mac/projects/amorphous/GrayScott/). Reaction-Diffusion is an interesting model for pattern formation, and variations of it have been proposed for such phenomena as [pigment formations in animals and plants](https://www.biorxiv.org/content/10.1101/403600v1), the [Belousov-Zhabotinsky reaction](https://en.wikipedia.org/wiki/Belousov%E2%80%93Zhabotinsky_reaction), and [the formation of patterns on various corals](https://www.tandfonline.com/doi/full/10.1080/23311835.2018.1426524).

The simulator is driven by [three.js](threejs.org). It's GPU-accelerated, it works on mobile, it's easy to embed on your website, and it's easy to customize for your own needs.

If you want to try out a much more robust version of this, [I have an app on the App Store you might be interested in](https://jons.website/apps/liquid-math/).

## Usage

1. Grab the [latest release](https://github.com/colejd/Reaction-Diffusion-ThreeJS/releases) and unzip it wherever you want. Make sure the file structure is intact!
2. Import the JS in your HTML: `<script src="some-folder/reaction-diffusion.js"></script>`
3. Create a div on the same page with the id `reaction-diffusion-container`. We'll call this the *container* from here on. A canvas that shows the simulation will be injected as a child of the container.
    * The simulation canvas will automatically resize to fill the container, so make sure the container gets sized somehow.
    * If there's an error loading, the container div will get the class `rd-init-failed` added. If it succeeds, the class `rd-init-success` will be added. You can use that for styling.

### Optional attributes

* If you don't want the GUI, you can add a "no-gui" attribute to the container, e.g. `<div class="reaction-diffusion-container" no-gui="true"></div>`
* You can set values for `feed` and `kill` like so: `<div class="reaction-diffusion-container" feed="0.01" kill="0.05"></div>`
* This program can be very intensive at high resolutions, so an optional resolution multiplier is included. You can set to any value between 0 and 1, where 1 is native resolution and 0 is no resolution (don't do that).
    - For example, for half resolution, you can do `<div class="reaction-diffusion-container" resolution-scale="0.5"></div>`
    - This value is 0.5 by default.
* You can also control the number of steps taken per frame. This makes the simulation go faster at the expense of performance. Set it to a lower value to improve performance.
    - `<div class="reaction-diffusion-container" steps-per-iteration="8"></div>`
    - This is an integer value greater than 0. Default is 16.
* You can also set a multiplier for the time scale if you want to slow things down.
    - `<div class="reaction-diffusion-container" time-scale="1.0"></div>`
    - This is a float value between 0 and 1. Default is 1.0.
* Disallow user interaction with `allow-interaction="false"`.
    - `<div class="reaction-diffusion-container" allow-interaction="false"></div>`
    - Valid values are "true" or "false". If you don't specify, it'll default to "true".
* You can make the simulation seed with noise at a given frequency with "seed-frequency".
    - `<div class="reaction-diffusion-container" seed-frequency="4.0"></div>`
    - This is a float value greater than 0. Higher numbers mean the peaks are closer together.
    - If you don't set this value, a circular non-random seed is used instead.
    - A good way to debug this is to set the time scale to 0. That way, the simulation will stay with whatever the initial seed is.
* You can force half-precision floats by setting `force-half-precision="true"`. This will give a consistent experience on all platforms, though it will make some presets behave unpredictably.
    - `<div class="reaction-diffusion-container" force-half-precision="true"></div>`
    - Valid values are "true" or "false". If you don't specify, it'll default to "false".

## Building

* Pull this repo
* In the root, run `npm install`
* `npm run build_dev` will build `reaction-diffusion.js` and the required resources into the `dist` folder. Put these all into your page and follow the usage instructions.
* `npm run build_prod` will build a minified version of the library as `reaction-diffusion.min.js` into the `dist` folder.
* You can run `npm run dev:watch` to serve the simulation on a bundled example page. When you make changes to the HTML or JS, the page will reload.

## License

This repo is provided under the [MIT License](LICENSE.md). If you use my code, please tell me! I'd love to see what you're working on.

## Acknowledgments

* Daniel Shiffman - [The Coding Train](http://thecodingtrain.com/) (see https://www.youtube.com/watch?v=BV9ny785UNc)
* [jsexp by Pmneila](https://github.com/pmneila/jsexp) - A great Reaction-Diffusion simulator in three.js
