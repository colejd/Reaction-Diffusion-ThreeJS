// Reaction-diffusion simulation
// By Jonathan Cole
//
// Uses the following convolution for Laplacian function:
// [[0.05,  0.2,  0.05],
//  [0.20, -1.0,  0.20],
//  [0.05,  0.2,  0.05]]

#include <common>

//"resolution" is added by GPUComputationRenderer automatically
//chemicalTexture is added automatically
uniform float time;

uniform float d_a; //Diffusion rate of A
uniform float d_b; //Diffusion rate of B
uniform float feed; //Growth rate for B
uniform float kill;    //Kill rate for B
uniform float biasStrength;
uniform float timestep;

uniform vec2 interactPos;
uniform float dropperSize;

uniform float doPass;

float rando(vec2 co){
  return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
}

// Get the result of the 3x3 laplacian convolution around the texel at the specified uv.
vec4 laplace(vec2 uv, vec2 offset){
    vec4 laplacePixel = vec4(0.0, 0.0, 0.0, 1.0);

    //Center texel
    laplacePixel += texture2D( chemicalTexture, uv ) * -1.0;
    //Orthogonal texels
    laplacePixel += texture2D( chemicalTexture, uv + vec2( 0.0, offset.y )  ) * 0.2;
    laplacePixel += texture2D( chemicalTexture, uv + vec2( 0.0, - offset.y )) * 0.2;
    laplacePixel += texture2D( chemicalTexture, uv + vec2( offset.x, 0.0 )  ) * 0.2;
    laplacePixel += texture2D( chemicalTexture, uv + vec2( - offset.x, 0.0 )) * 0.2;
    //Diagonal texels
    laplacePixel += texture2D( chemicalTexture, uv + vec2( offset.x,   offset.y ) ) * 0.05;
    laplacePixel += texture2D( chemicalTexture, uv + vec2( offset.x,  -offset.y ) ) * 0.05;
    laplacePixel += texture2D( chemicalTexture, uv + vec2( -offset.x,  offset.y ) ) * 0.05;
    laplacePixel += texture2D( chemicalTexture, uv + vec2( -offset.x, -offset.y ) ) * 0.05;

    return laplacePixel;
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
    vec4 pixel = texture2D( chemicalTexture, uv );
    vec2 offset = texelSize * 1.0; //Change the multiplier for fun times


    //// Perform Laplace convolution

    vec4 laplacePixel = laplace(uv, offset);


    //// Do the reaction-diffusion math
    vec4 currentPixel = texture2D( chemicalTexture, uv );
    float a = currentPixel.r; //Swap G and R for fun times
    float b = currentPixel.g;
    float c = currentPixel.b;

    float deltaA = (d_a * laplacePixel.r) -
                    (a * b * b) +
                    (feed * (1.0 - a));

    float finalA = a + (deltaA * timestep);
    //finalA = clamp(finalA, 0.0, 1.0);

    float deltaB = (d_b * laplacePixel.g) +
                    (a * b * b) -
                    (((kill + feed) - (c * biasStrength)) * b);//((k + feed) * b)

    float finalB = b + (deltaB * timestep);
    //finalB = clamp(finalB, 0.0, 1.0);


    //// Draw a circle around interactPos
    // Only applies color if the pixels are <=

//    if(mousePos.x >= 0.0) {
//        vec2 diff = (uv - mousePos) / texelSize;
//        //vec2 diff = uv - (interactPos * texelSize);
//        //vec2 diff = uv - mousePos;
//        //vec2 diff =
//
//        float dist = length(diff);
//        if(dist < dropperSize)
//            finalB = 0.55;
//    }

    float newB = 0.0;
    float droppedValue = 0.55; //Value placed within circle
    float dist = distance(uv / texelSize, interactPos);

    //if dist < dropperSize return 0, else return 1
    //float distBranch = clamp(sign(dropperSize - dist), 0.0, 1.0);
    float distBranch = when_gt(dropperSize, dist);
    //if distBranch == 0 keep original value, otherwise assign droppedValue
    newB = mix(finalB, droppedValue, distBranch);

    //if mousePos is < 0 return 0, else return 1
    //float mouseBranch = clamp(sign(interactPos.x), 0.0, 1.0);
    float mouseBranch = when_ge(interactPos.x, 0.0);
    //if mouseBranch == 0 keep finalB as original value, otherwise set finalB to newB
    finalB = mix(finalB, newB, mouseBranch);


    //// Apply the final color
    gl_FragColor = vec4(finalA, finalB, pixel.b, 1.0) * doPass;


    //// Optionally do test stuff
    //Passthrough test
    //gl_FragColor = pixel;


    //White noise test (need to enable passthrough on display-frag)
//    float r = rando(uv.xy * time);
//    gl_FragColor = vec4(r, r, r, 1);

    //Pretty rainbow thing
//    gl_FragColor = vec4(uv.xy, 0, 1);
//    gl_FragColor = vec4(uv.xy * time, 0, 1);


}
