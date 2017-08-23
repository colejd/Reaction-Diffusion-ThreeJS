#define PI 3.1415926535897932384626433832795

varying vec2 v_uv;

uniform sampler2D displayTexture;
uniform float time;
uniform vec2 resolution;

float rando(vec2 co){
  return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
}

//http://krazydad.com/tutorials/makecolors.php
vec4 rainbow(vec2 uv){
    float center = 0.5; //0.5
    float width = 1.0; //0.5
    float frequency = 5.0;
    float r1 = sin(frequency*uv.x + 0.0) * width + center;
    float g1 = sin(frequency*uv.x + 2.0*PI/3.0) * width + center;
    float b1 = sin(frequency*uv.x + 4.0*PI/3.0) * width + center;

    return vec4 (r1, g1, b1, 1.0);

//    float r2 = sin(frequency*uv.y + 0.0) * width + center;
//    float g2 = sin(frequency*uv.y + 2.0*PI/3.0) * width + center;
//    float b2 = sin(frequency*uv.y + 4.0*PI/3.0) * width + center;
//
//    return vec4(vec3(r1, g1, b1) * vec3(r2, g2, b2), 1.0);
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
    vec2 uv = v_uv;
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

    vec4 finalColor = vec4(c, c, c, 1.0);

      //Static effect on blue pixels for no reason
//    float noise = rando(uv.xy * time);
//    //add noise value to c if pixel.b > 0
//    float blueBranch = when_gt(pixel.b, 0.5);
//    float newC = mix(c, c + noise, blueBranch);
//    finalColor = vec4(newC, newC, newC, 1.0);

    //Throw in some static wherever we have some B (green)
//    float noise = rando(uv.xy + (time * 0.005));
//    float gBranch = when_gt(pixel.g, 0.0);
//    float newC = mix(c, c - noise, gBranch);
//    finalColor = vec4(newC, newC, newC, 1.0);

    //Replace B with rainbow
//    vec4 rain = rainbow(uv.xy + (time * 0.005));
//    float gBranch = when_gt(pixel.g, 0.01);
//    finalColor = mix(finalColor, finalColor - rain, gBranch);

    //vec4 tint = vec4(0.5, 0.0, 1.0, 1.0); //Firefly red
    vec4 tint = vec4(1.0, 1.0, 1.0, 1.0);

    //Apply the final color
    gl_FragColor = finalColor * tint;

    //Test (passthrough)
    //gl_FragColor = pixel.rgba;

    //Test (same as final result but display bias field as blue)
    //gl_FragColor = vec4(c, c, pixel.b, 1.0);

    //Test grid
  //  float x = mod(time + gl_FragCoord.x, 100.) < 50. ? 1. : 0.;
  //  float y = mod(time + gl_FragCoord.y, 100.) < 50. ? 1. : 0.;
  //  gl_FragColor = vec4(vec3(min(x, y)), 1.); //*= for passthrough
}
