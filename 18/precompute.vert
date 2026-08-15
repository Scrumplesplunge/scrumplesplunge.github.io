#version 300 es

precision highp float;

layout(location = 0) in vec2 vertex;

uniform float size;

out vec2 position;

void main() {
  position = 0.5 * size * vertex;
  gl_Position = vec4(vertex, 0, 1);
}
