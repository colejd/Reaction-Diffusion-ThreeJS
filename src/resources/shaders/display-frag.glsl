// Reaction-diffusion simulation
// By Jonathan Cole
//
// This shader transforms the color output from compute-frag
// into something nicer to look at.
//

varying vec2 v_uv;

uniform sampler2D displayTexture;
uniform vec2 resolution;
uniform vec2 texelSize;

vec4 classic() {
  vec4 pixel = texture2D( displayTexture, v_uv );

  // Black on white
  float c = pixel.r - pixel.g;
  return vec4(c, c, c, 1.0);
}

vec4 twoTone() {
  vec4 pixel = texture2D( displayTexture, v_uv ); // Color at the current pixel (r, g, b, a), each channel from 0 to 1

  // pixel.r represents concentration of chemical A
  // pixel.g represents concentration of chemical B
  vec3 bgColor = vec3(1, 1, 1); // White
  vec3 fgColor = vec3(139.0 / 255.0, 69.0 / 255.0, 19.0 / 255.0); // Saddle brown

  //// Determine final color
  float mixProgress = pixel.r - pixel.g; // Intensity of progress between fgColor and bgColor. This can be any value between 0 and 1.
  if (mixProgress < 0.3) mixProgress = 0.0;
  // if (mixProgress >= 0.3) mixProgress = 1.0;
  vec3 finalColor = mix(fgColor, bgColor, mixProgress); // Linearly interpolates between the two colors. mixProgress of 0 means fgColor is used, 1 means bgColor is used.

  //Apply the final color
  return vec4(finalColor, 1.0);
}

vec4 sigmoid() {
  vec4 pixel = texture2D( displayTexture, v_uv );
  float displayedValue = pixel.x;

  // Sigmoid-like function for nice edges
  const float edginess = 20.0;
  float sigmoid = 1.0 / (1.0+exp(-displayedValue * edginess + edginess * 0.5));

  return vec4(sigmoid);
}

void main() {
  //Apply the final color
  gl_FragColor = classic();
}
