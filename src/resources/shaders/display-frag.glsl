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

void main() {
    vec2 uv = v_uv;
    vec4 pixel = texture2D( displayTexture, uv );

    //// Determine final color

    // Black on white
    float c = pixel.r - pixel.g;
    vec4 finalColor = vec4(c, c, c, 1.0);

    vec4 tint = vec4(1.0, 1.0, 1.0, 1.0);

    //Apply the final color
    gl_FragColor = finalColor * tint;
}

void mainNew() {
  vec2 texelSize = 1.0 / resolution.xy;
  vec2 uv = v_uv;
  vec4 pixel = texture2D( displayTexture, uv );
  float displayedValue = pixel.x;

  // Sigmoid-like function for nice edges
  const float edginess = 20.0;
  float sigmoid = 1.0 / (1.0+exp(-displayedValue * edginess + edginess * 0.5));

  gl_FragColor = vec4(sigmoid);
}

