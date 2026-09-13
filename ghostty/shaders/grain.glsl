// Fine static grain, not another terminal background. Keep animation disabled.
// 0.006 coverage changes a 92% host backdrop to about 92.05%, not 99.4%.
const float GRAIN_OPACITY = 0.006;

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec4 terminal = texture(iChannel0, fragCoord / iResolution.xy);
    float noise = fract(sin(dot(floor(fragCoord), vec2(12.9898, 78.233))) * 43758.5453);
    vec4 grain = vec4(vec3(noise * GRAIN_OPACITY), GRAIN_OPACITY);

    // Premultiplied source-over: terminal content sits ABOVE the faint grain.
    // Opaque text stays byte-for-byte unchanged; transparent pixels reveal it.
    fragColor = terminal + grain * (1.0 - terminal.a);
}
