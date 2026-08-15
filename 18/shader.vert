#version 300 es

precision highp float;

layout(location = 0) in vec2 vertex;

uniform float aspect;

out vec2 position;

void main() {
  float x, y;
  vec2 scale = aspect > 1.0 ? vec2(aspect, 1) : vec2(1, 1.0 / aspect);
  position = (1.0 + 1.5 * vertex * scale) / 2.0;
  gl_Position = vec4(vertex, 0, 1);
}
