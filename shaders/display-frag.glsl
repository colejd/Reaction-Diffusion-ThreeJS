#include <common>

varying vec2 vUv;

uniform sampler2D displayTexture;
uniform float time;
uniform vec2 resolution;

float rando(vec2 co){
  return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
}

//http://theorangeduck.com/page/avoiding-shader-conditionals
float when_eq(float x, float y) {
  return 1.0 - abs(sign(x - y));
}
float when_neq(float x, float y) {
  return abs(sign(x - y));
}
float when_gt(float x, float y) {
  return max(sign(x - y), 0.0);
}
float when_lt(float x, float y) {
  return max(sign(y - x), 0.0);
}
float when_le(float x, float y) {
  return 1.0 - max(sign(x - y), 0.0);
}
float when_ge(float x, float y) {
  return 1.0 - max(sign(y - x), 0.0);
}

void main() {
    vec2 texelSize = 1.0 / resolution.xy;
    vec2 uv = vUv;
    vec4 pixel = texture2D( displayTexture, uv );
    bool useHighPass = false;

    //// Determine final color

    //White on black
    //If r has no value then render as black
    float start = 1.0 * when_gt(pixel.r, 0.0);
    float c = clamp(start - (pixel.r - pixel.g), 0.0, 1.0); //a - b adds a bit of thickness to the center of blobs

    //High pass threshold
//    float highPassThreshold = 0.5;
//    float highPassBranch = clamp(sign(c - highPassThreshold), 0.0, 1.0);
//    c = mix(0.0, c, highPassBranch);

    //vec4 tint = vec4(1.0, 0.7294, 0.302, 1.0); //Firefly red
    vec4 tint = vec4(1.0, 1.0, 1.0, 1.0);
    vec4 finalColor = vec4(c, c, c, 1.0) * tint;

    //Apply the final color
    gl_FragColor = finalColor;

    //Test (passthrough)
    //gl_FragColor = pixel.rgba;

    //Test (same as final result but display bias field as blue)
    //gl_FragColor = vec4(c, c, pixel.b, 1.0);

    //Test grid
//    float x = mod(time + gl_FragCoord.x, 100.) < 50. ? 1. : 0.;
//    float y = mod(time + gl_FragCoord.y, 100.) < 50. ? 1. : 0.;
//    gl_FragColor = vec4(vec3(min(x, y)), 1.); //*= for passthrough
}
