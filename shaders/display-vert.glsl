//Just a simple pass-through vertex shader.

#include <common>

uniform float time;
uniform vec2 resolution;

void main() {
    gl_Position = projectionMatrix *
                modelViewMatrix *
                vec4(position,1.0);
    //gl_Position = vec4( position, 1.0 ); //Ignores scale
}
