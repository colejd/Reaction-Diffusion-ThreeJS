//Just a simple pass-through vertex shader.

#include <common>

varying vec2 vUv;

void main() {
    vUv = uv;
    gl_Position = projectionMatrix *
                modelViewMatrix *
                vec4(position,1.0);
    //gl_Position = vec4( position, 1.0 ); //Ignores scale
}
