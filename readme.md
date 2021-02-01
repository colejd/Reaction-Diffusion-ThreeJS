# Reaction-Diffusion Simulation in Three.js

This project is a [three.js](threejs.org)-based GPGPU simulation of chemicals reacting and diffusing on a 2D plane based on the [Gray-Scott model](https://groups.csail.mit.edu/mac/projects/amorphous/GrayScott/).

Demo at [jons.website/projects/reaction-diffusion](https://jons.website/projects/reaction-diffusion).


## Usage

Create a div on your page with the class `reaction-diffusion-container`. We'll call this the *container* from here on. A canvas that shows the simulation will be injected as a child of the container.
    * The simulation canvas will automatically resize to fill the container, so make sure the container gets sized somehow.
    * If there's an error loading, the container div will get the class `rd-init-failed` added. If it succeeds, the class `rd-init-success` will be added. You can use that for styling.
    * If you don't want the GUI, you can add a "no-gui" attribute to the container, e.g. `<div class="reaction-diffusion-container" no-gui="true"></div>`


## License

This project is given under the MIT License - see [LICENSE.md](LICENSE.md) for details.

## Acknowledgments

* Daniel Shiffman - [The Coding Train](http://thecodingtrain.com/) (see https://www.youtube.com/watch?v=BV9ny785UNc)
* [jsexp by Pmneila](https://github.com/pmneila/jsexp) - A great Reaction-Diffusion simulator in three.js
