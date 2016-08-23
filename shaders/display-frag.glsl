#include <common>

uniform sampler2D displayTexture;

uniform float time;
uniform vec2 resolution;

vec4 when_eq(vec4 x, vec4 y) {
  return 1.0 - abs(sign(x - y));
}

void main() {
    bool useHighPass = false;
    vec2 cellSize = 1.0 / resolution.xy;
    vec2 uv = gl_FragCoord.xy * cellSize;
    vec4 pixel = texture2D( displayTexture, uv );

    //vec4 pixel = texture2D( displayTexture, gl_FragCoord.xy );

    //White on black
    float c = clamp(1.0 - pixel.r + pixel.g, 0.0, 1.0); //a - b adds a bit of thickness to the center of blobs

    //Black on white
    //float c = clamp(pixel.r - pixel.g, 0.0, 1.0); //a - b adds a bit of thickness to the center of blobs

//    if(c < 0.5 || !useHighPass){
//        gl_FragColor = vec4(c, c, c, 1.0);
//    }
//    else {
//        gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);
//    }

    gl_FragColor = vec4(c, c, c, 1.0);


    //Test (same as final result but display bias field as blue)
    //gl_FragColor = vec4(c, c, pixel.b, 1.0);

    //Test (passthrough)
    //gl_FragColor = pixel.rgba;

    //Test grid
//    float x = mod(time + gl_FragCoord.x, 100.) < 50. ? 1. : 0.;
//    float y = mod(time + gl_FragCoord.y, 100.) < 50. ? 1. : 0.;
//    gl_FragColor = vec4(vec3(min(x, y)), 1.);
}
