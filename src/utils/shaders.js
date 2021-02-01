export const baseVertexShader = `
    varying vec2 v_uv;
    void main() {
        v_uv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
    }
`;

export const baseFragmentShader = `
    varying vec2 v_uv;
    uniform sampler2D tex;
    void main() {
        vec2 uv = v_uv;
        gl_FragColor = texture2D( tex, uv );
    }
`;