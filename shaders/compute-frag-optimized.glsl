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

float rando(vec2 co){
  return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
}

void main() {

    float timestep = 1.0; //1.1
    float d_a = 1.0; //Diffusion rate of A //1
    float d_b = 0.5; //Diffusion rate of B //0.5
    float feed = 0.055; //0.0372 //0.025
    float k = 0.062; //How fast b gets removed

    //Presets (feed, k):
    //Default   (  f = 0.055 ,   k = 0.062  )
    //Mitosis   (  f = 0.0367,   k = 0.0649 )
    //Coral     (  f = 0.0545,   k = 0.062  )

    //vec2 cellSize = vec2(1.0, 1.0);
    vec2 cellSize = 1.0 / resolution.xy;
    vec2 uv = gl_FragCoord.xy * cellSize;

    vec4 pixel = texture2D( chemicalTexture, uv );
    //vec4 pixel = texture2D( chemicalTexture, gl_FragCoord.xy);
    //gl_FragColor = vec4(pixel.r, pixel.g, 0.0, 1.0); //Correct
    //gl_FragColor = vec4(pixel.r, pixel.g, pixel.b, 1.0); //White?
    gl_FragColor = pixel; //White?
    //gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);


    vec4 laplacePixel = vec4(0.0, 0.0, 0.0, 1.0);
    //vec4 laplacePixel = texture2D( chemicalTexture, uv );

    vec2 offset = cellSize * 1.0; //Change the multiplier for fun times
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

    // /r/theydidthemath
    vec4 originalPixel = texture2D( chemicalTexture, uv );
    float a = originalPixel.r; //Swap G and R for fun times
    float b = originalPixel.g;
    float c = originalPixel.b;

    float deltaA = (d_a * laplacePixel.r) -
                    (a * b * b) +
                    (feed * (1.0 - a));

    float finalA = a + deltaA * timestep;
    //finalA = clamp(finalA, 0.0, 1.0);

    float deltaB = (d_b * laplacePixel.g) +
                    (a * b * b) -
                    (((k + feed) - (c * 0.02)) * b);//((k + feed) * b)

    float finalB = b + deltaB * timestep;
    //finalB = clamp(finalB, 0.0, 1.0);

    //Apply the color
    gl_FragColor = vec4(finalA, finalB, 0.0, 1.0);


    //White noise test
//    float r = rando(uv.xy * time);
//    gl_FragColor = vec4(r, r, r, 1);

    //Pretty rainbow thing
//    gl_FragColor = vec4(uv.xy, 0, 1);
//    gl_FragColor = vec4(uv.xy * time, 0, 1);


}
