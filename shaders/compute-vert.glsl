varying vec2 v_uv;
varying vec2 v_uvs[9];

uniform vec2 resolution;

void main() {
    v_uv = uv;

    vec2 texelSize = 1.0 / resolution.xy;
    //Center texel
    v_uvs[4] = uv;
    //Orthogonal texels
    v_uvs[1] = uv + vec2( 0.0, texelSize.y );
    v_uvs[7] = uv + vec2( 0.0, - texelSize.y );
    v_uvs[5] = uv + vec2( texelSize.x, 0.0 );
    v_uvs[3] = uv + vec2( - texelSize.x, 0.0 );
    //Diagonal texels
    v_uvs[2] = uv + vec2( texelSize.x,   texelSize.y );
    v_uvs[8] = uv + vec2( texelSize.x,  -texelSize.y );
    v_uvs[0] = uv + vec2( -texelSize.x,  texelSize.y );
    v_uvs[6] = uv + vec2( -texelSize.x, -texelSize.y );

    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);

}
