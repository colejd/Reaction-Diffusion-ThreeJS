// Reaction-diffusion simulation
// By Jonathan Cole
//
// Red channel represents A concentration (0.0 - 1.0).
// Green channel is represents B concentration (0.0 - 1.0).
// Blue channel is used for bias; B will be attracted to it depending on biasStrength.
//
// For more reading, see http://mrob.com/pub/comp/xmorphia/
//

varying vec2 v_uv;

uniform vec2 resolution;
uniform vec2 texelSize;

uniform sampler2D sourceTexture;
uniform float time;

uniform float feed; // Growth rate for B
uniform float kill; // Kill rate for B
uniform float da;
uniform float db;
uniform float biasStrength;
uniform float timestep;

uniform vec2 interactPos;
uniform float dropperSize;

uniform float doPass;

float rando(vec2 co){
  return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
}

// http://theorangeduck.com/page/avoiding-shader-conditionals
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

// Convolves ignoring corner neighbors. Useful if the corner
// values of the kernel are 0.
vec4 convolve5(vec4 centerPixel, vec3[3] kernel) {
    vec4 result = vec4(0.0, 0.0, 0.0, 1.0);

    result += texture2D( sourceTexture, v_uv + vec2( 0.0, texelSize.y ) ) * kernel[0][1];
    result += texture2D( sourceTexture, v_uv + vec2( 0.0, -texelSize.y ) ) * kernel[2][1];
    result += texture2D( sourceTexture, v_uv + vec2( texelSize.x, 0.0 ) ) * kernel[1][0];
    result += texture2D( sourceTexture, v_uv + vec2( -texelSize.x, 0.0 ) ) * kernel[1][2];

    // Center texel
    result += centerPixel * kernel[1][1];

    return result;
}

// 3x3 kernel convolution
vec4 convolve(vec4 centerPixel, vec3[3] kernel) {
    vec4 result = convolve5(centerPixel, kernel);

    // Diagonal texels
    result += texture2D (sourceTexture, v_uv + vec2(-texelSize.x, -texelSize.y)) * kernel[0][0];
    result += texture2D (sourceTexture, v_uv + vec2( texelSize.x, -texelSize.y)) * kernel[2][0];
    result += texture2D (sourceTexture, v_uv + vec2(-texelSize.x,  texelSize.y)) * kernel[0][2];
    result += texture2D (sourceTexture, v_uv + vec2( texelSize.x,  texelSize.y)) * kernel[2][2];

    return result;
}

// Get the laplacian using a 9-point stencil and the terms from
// http://www.karlsims.com/rd.html
vec4 laplace9Point_Sims(vec4 centerPixel) {
    vec3 kernel[3];
    kernel[0] = vec3(0.2 , 0.05, 0.2 );
    kernel[1] = vec3(0.05,   -1, 0.05);
    kernel[2] = vec3(0.2 , 0.05, 0.2 );

    return convolve(centerPixel, kernel);
}

//Get the laplacian using a 9-point stencil
//https://en.wikipedia.org/wiki/Discrete_Laplace_operator
vec4 laplace9Point(vec4 centerPixel) {
    vec3 kernel[3];
    kernel[0] = vec3(0.25, 0.5, 0.25);
    kernel[1] = vec3(0.5 ,  -3, 0.5 );
    kernel[2] = vec3(0.25, 0.5, 0.25);

    return convolve(centerPixel, kernel);
}

// Get the laplacian using a 5-point stencil
vec4 laplace5Point(vec4 centerPixel) {
    vec3 kernel[3];
    kernel[0] = vec3(0, 1, 0);
    kernel[1] = vec3(1, -4, 1);
    kernel[2] = vec3(0, 1, 0);

    return convolve5(centerPixel, kernel);
}

vec4 drawBrush(vec2 v_uv_pixel_coord, vec4 pixel, vec4 color) {

    vec4 final = pixel;

    //// Draw a circle around interactPos
    float dist = distance(v_uv_pixel_coord, interactPos);

    // If the distance is inside the ring area, set the color as the brush
    float distBranch = when_lt(dist, dropperSize);
    float innerDistBranch = when_gt(dist, dropperSize * 0.75);
    float inBrush = distBranch * innerDistBranch;

    // Mix in each channel of the brush if it's greater than 0
    float newR = mix(pixel.r, color.r, inBrush);
    final.r = mix(final.r, newR, when_ge(color.r, 0.0));

    float newG = mix(pixel.g, color.g, inBrush);
    final.g = mix(final.g, newG, when_ge(color.g, 0.0));

    float newB = mix(pixel.b, color.b, inBrush);
    final.b = mix(final.b, newB, when_ge(color.b, 0.0));


    // Turn off the brush if interactPos is negative (outside the screen)
    final = mix(pixel, final, when_ge(interactPos.x, 0.0));

    return final;
}

// Reaction-Diffusion
vec4 react(vec4 pixel, vec4 convolution) {
    float a = pixel.r;
    float b = pixel.g;
    float c = pixel.b;

    float reactionRate = a * b * b;

    float du = da*convolution.r // Diffusion term
                - reactionRate
                + feed * (1.0 - a); // Replenishment term, f is scaled so A <= 1.0

    float dv = db * convolution.g // Diffusion term
                + reactionRate
                - ((feed + kill) - (c * biasStrength)) * b; // Diminishment term, scaled so b >= 0, must not be greater than replenishment

    vec2 dst = pixel.rg + timestep*vec2(du, dv);
    return vec4(dst.rg, c, 1.0);
}

void main() {

    //vec2 texelSize = 1.0 / resolution.xy;

    vec4 pixel = texture2D(sourceTexture, v_uv);

    // Get the result of convolution on the pixel
    vec4 conv = laplace5Point(pixel);
    // Get the Reaction-Diffusion result using the convolution
    vec4 final = react(pixel, conv);

    // Apply the brush based on interactPos (set by touch or mouse click externally)
    final = drawBrush(v_uv * resolution.xy, final, vec4(-1, 0.9, -1, -1));

    // Saturate to prevent values from exceeding natural limits
    final = clamp(final, 0.0, 1.0);

    // Output the final color
    gl_FragColor = final * doPass;
}