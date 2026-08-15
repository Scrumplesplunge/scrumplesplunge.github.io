#version 300 es

precision highp float;
precision highp int;

in vec2 position;

layout(location = 0) out highp vec4 color;

uniform float r;
uniform float unfocus_factor;
uniform sampler2D aperture;

void main() {
  vec2 v2 = position * position;
  float z = sqrt(r * r - v2.x - v2.y) + unfocus_factor;
  color = vec4(z, 0, 0, 1);
}
