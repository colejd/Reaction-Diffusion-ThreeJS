varying vec2 v_uv;

uniform vec2 texelSize;
uniform vec2 resolution;

// Provided by Three.js:
// attribute vec3 position;
// uniform mat4 projectionMatrix;
// uniform mat4 modelViewMatrix;

void main() {
    v_uv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
