#include <common>

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
    vec2 uv = gl_FragCoord.xy * texelSize;
    vec4 pixel = texture2D( displayTexture, uv );
    bool useHighPass = false;

    //// Determine final color

    //White on black
    float c = clamp(1.0 - pixel.r + pixel.g, 0.0, 1.0); //a - b adds a bit of thickness to the center of blobs

    //Black on white
    //float c = clamp(pixel.r - pixel.g, 0.0, 1.0); //a - b adds a bit of thickness to the center of blobs

    //High pass threshold
//    float highPassThreshold = 0.5;
//    float highPassBranch = clamp(sign(c - highPassThreshold), 0.0, 1.0);
//    c = mix(0.0, c, highPassBranch);


    vec4 finalColor = vec4(c, c, c, 1.0);

    //Static effect on blue pixels for no reason
    float noise = rando(uv.xy * time);
    //add noise value to c if pixel.b > 0
    float blueBranch = when_gt(pixel.b, 0.0);
    float newC = mix(c, c + noise, blueBranch);
    finalColor = vec4(newC, newC, newC, 1.0);
    //clamp between 0 and 1?


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
