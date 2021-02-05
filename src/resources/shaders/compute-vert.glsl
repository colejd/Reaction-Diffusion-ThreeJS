varying vec2 v_uv;

varying vec2 left_coord;
varying vec2 right_coord;
varying vec2 top_coord;
varying vec2 bottom_coord;

uniform vec2 texelSize;
uniform vec2 resolution;

// Provided by Three.js:
// attribute vec3 position;
// uniform mat4 projectionMatrix;
// uniform mat4 modelViewMatrix;

void main() {
    v_uv = uv;

    // Compute coordinates of neighbor texels here to save on perf
    // (If many pixels correspond to one texel we save on texture reads)
    //Orthogonal texels
    bottom_coord = uv + vec2( 0.0, texelSize.y );
    top_coord = uv + vec2( 0.0, -texelSize.y );
    right_coord = uv + vec2( texelSize.x, 0.0 );
    left_coord = uv + vec2( -texelSize.x, 0.0 );

    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
