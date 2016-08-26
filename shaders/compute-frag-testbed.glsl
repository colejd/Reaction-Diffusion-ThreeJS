// Reaction-diffusion simulation
// By Jonathan Cole
//
// Uses the following convolution for Laplacian function:
// [[0.05,  0.2,  0.05],
//  [0.20, -1.0,  0.20],
//  [0.05,  0.2,  0.05]]
//
// Red channel represents A concentration (0.0 - 1.0).
// Green channel is represents B concentration (0.0 - 1.0).
// Blue channel is used for bias; once inside, B will try not to
//  spread beyond the blue areas, depending on biasStrength.
//
// http://mrob.com/pub/comp/xmorphia/

#include <common>

varying vec2 v_uv;
varying vec2 v_uvs[9];

uniform sampler2D sourceTexture;
uniform vec2 resolution;
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

// Get the result of the 3x3 laplacian convolution around the texel at the specified uv.
vec4 laplace9Point(vec4 centerPixel) {
    vec4 result = vec4(0.0, 0.0, 0.0, 1.0);

    //Center texel
    result += centerPixel * -1.0;
    //Orthogonal texels
    result += texture2D( sourceTexture, v_uvs[1] ) * 0.2;
    result += texture2D( sourceTexture, v_uvs[2] ) * 0.2;
    result += texture2D( sourceTexture, v_uvs[3] ) * 0.2;
    result += texture2D( sourceTexture, v_uvs[4] ) * 0.2;
    //Diagonal texels
    result += texture2D( sourceTexture, v_uvs[5] ) * 0.05;
    result += texture2D( sourceTexture, v_uvs[6] ) * 0.05;
    result += texture2D( sourceTexture, v_uvs[7] ) * 0.05;
    result += texture2D( sourceTexture, v_uvs[8] ) * 0.05;

    return result;
}

vec4 laplace9Point2(vec4 centerPixel) {
    vec4 result = vec4(0.0, 0.0, 0.0, 1.0);

    //Center texel
    result += centerPixel * -6.0;
    //Orthogonal texels
    result += texture2D( sourceTexture, v_uvs[1] );
    result += texture2D( sourceTexture, v_uvs[2] );
    result += texture2D( sourceTexture, v_uvs[3] );
    result += texture2D( sourceTexture, v_uvs[4] );
    //Diagonal texels
    result += texture2D( sourceTexture, v_uvs[5] ) * 0.5;
    result += texture2D( sourceTexture, v_uvs[6] ) * 0.5;
    result += texture2D( sourceTexture, v_uvs[7] ) * 0.5;
    result += texture2D( sourceTexture, v_uvs[8] ) * 0.5;

    return result;
}

// Get the laplacian using a 5-point stencil
vec4 laplace5Point(vec4 centerPixel) {
    vec4 result = vec4(0.0, 0.0, 0.0, 1.0);

    //Center texel
    result += centerPixel * -4.0;
    //Orthogonal texels
    result += texture2D( sourceTexture, v_uvs[1] );
    result += texture2D( sourceTexture, v_uvs[2] );
    result += texture2D( sourceTexture, v_uvs[3] );
    result += texture2D( sourceTexture, v_uvs[4] );

    return result;
}

// Reaction-diffusion
vec4 react(vec4 pixel, vec4 convolution) {
    float a = pixel.r; //Swap G and R for fun times
    float b = pixel.g;
    float c = 1.0 * when_gt(pixel.b, 0.5); //Keep blue only if it's significant

    float reactionRate = a * b * b;

    float deltaA = (d_a * convolution.r) //Diffusion term
                    - reactionRate //Reaction Rate
                    + (feed * (1.0 - a)); //Replenishment term, f is scaled so A <= 1.0

    float finalA = a + (deltaA * timestep);
    //finalA = clamp(finalA, 0.0, 1.0);

    float deltaB = (d_b * convolution.g) //Diffusion term
                    + reactionRate //Reaction rate
                    - (((kill + feed) - (c * biasStrength)) * b); //Diminishment term, scaled so b >= 0, must not be greater than replenishment
                    //- ((kill + feed) * b);

    float finalB = b + (deltaB * timestep);
    //finalB = clamp(finalB, 0.0, 1.0);

    return vec4(finalA, finalB, pixel.b, 1.0);
}

//Based on jsexp implementation. Doesn't use d_a or d_b
vec4 react2(vec4 pixel, vec4 convolution) {
    float delta = 1.0;

    //Magic values seem to work with 5-point stencil
    float da = 0.2097;
    float db = 0.105;

    float a = pixel.r;
    float b = pixel.g;
    float abb = pixel.r * pixel.g * pixel.g;

    float du = da *convolution.r
                - abb
                + feed*(1.0 - a);
    float dv = db *convolution.g
                + abb
                - (feed+kill)*b;
    vec4 dst = pixel + delta*vec4(du, dv, 0.0, 1.0);

    return dst;

}

vec4 react3(vec4 pixel, vec4 convolution){
    //slider[minimum, default, maximum]
    //uniform vec2 Diffusion; slider[(0,0),(0.082,0.041),(0.2,0.2)]
    //uniform float timeStep; slider[0,1.,2]
    //uniform float k; slider[0,0.064,0.1]
    //uniform float f; slider[0,0.035,0.1]
    float k = 0.064;
    float f = 0.035;
    float timeStep = 1.0;

    vec4 v = pixel;
	v.z = 0.0;
	vec2 lv = convolution.xy;
	float xyy = v.x*v.y*v.y;
	vec2 dV = vec2( 0.082 * lv.x - xyy + f*(1.-v.x), 0.041 * lv.y + xyy - (f+k)*v.y);
	v.xy+= timeStep*dV;
	return vec4(v.xyz, 1.0);
}

void main() {

    vec2 texelSize = 1.0 / resolution.xy;
    vec2 offset = texelSize * 1.0; //Default 1.0. Change the multiplier for fun times
    vec4 pixel = texture2D(sourceTexture, v_uv);

    //// Perform Laplace convolution for pixel
    vec4 convolution = laplace9Point2(pixel);

    vec4 reaction = react3(pixel, convolution);

    vec4 final = reaction;

    //// Draw a circle around interactPos
    float newB = 0.0;
    float droppedValue = 0.5; //Value placed within circle
    float dist = distance(v_uv / texelSize, interactPos);

    float distBranch = when_gt(dropperSize, dist);
    newB = mix(final.g, droppedValue, distBranch);

    //Secondary "inner" brush
//    float distBranchInner = when_lt(dist, dropperSize * 0.75);
//    newB = mix(newB, 0.0, distBranchInner);

    float mouseBranch = when_ge(interactPos.x, 0.0);
    final.g = mix(final.g, newB, mouseBranch);


    //// Apply the final color
    gl_FragColor = final * doPass;

    //// Destroy any chemicals near the border (oh, my)
    if(gl_FragCoord.x == 0.5 || gl_FragCoord.y == 0.5 || gl_FragCoord.x == resolution.x - 0.5 || gl_FragCoord.y == resolution.y - 0.5){
        gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
    }


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
