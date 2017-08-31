varying vec2 v_uv;
varying vec2 v_uvs[5];
varying vec2 texelSize;

uniform vec2 resolution;

void main() {
    texelSize = 1.0 / resolution.xy;
    texelSize *= 1.0; //Default 1.0. Change the multiplier for fun times

    v_uv = uv;

    // Precalculate neighbor texel positions here so we don't incur extra cost
    // by doing them in the fragment shader(s).

    // Orthogonal texels
    v_uvs[0] = uv + vec2( 0.0, texelSize.y ); // Top
    v_uvs[1] = uv + vec2( 0.0, -texelSize.y ); // Bottom
    v_uvs[2] = uv + vec2( texelSize.x, 0.0 ); // Left
    v_uvs[3] = uv + vec2( -texelSize.x, 0.0 ); // Right

    v_uvs[4] = uv; // Center

    // Could add diagonal texels here but the host GPU might not support so many varyings in a vector.
    // Safer to just calculate in compute-frag.

    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);

}
