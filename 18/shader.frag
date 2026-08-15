#version 300 es

precision highp float;
precision highp int;

in vec2 position;

layout(location = 0) out lowp vec4 color;

uniform float brightness;
uniform float r;
uniform float lambda;
uniform float unfocus_factor;
uniform float size;
uniform sampler2D aperture;
uniform sampler2D z_map;

const int NUM_COLORS = 16;
const float PI = 3.1415926536;
const float CLR_STEP = 1.04427378242741;

vec3 wavelength_to_rgb(float wavelength, float range_low, float range_high) {
  vec3 result = vec3(0, 0, 0);
  wavelength = (wavelength - range_low) / (range_high - range_low) / 1.3;

  if (wavelength < 0.0) {
    result = vec3(0, 0, 0);
  } else if (wavelength < 0.15) {
    result = vec3(-(wavelength - 0.15) / 0.15, 0, 1);
  } else if (wavelength < 0.275) {
    result = vec3(0, (wavelength - 0.15) / (0.275 - 0.15), 1.0);
  } else if (wavelength < 0.325) {
    result = vec3(0, 1, -(wavelength - 0.325) / (0.325 - 0.275));
  } else if (wavelength < 0.5) {
    result = vec3((wavelength - 0.325) / (0.5 - 0.325), 1, 0);
  } else if (wavelength < 0.6625f) {
    result = vec3(1, -(wavelength - 0.6625) / (0.6625 - 0.5), 0);
  } else if (wavelength <= 1.0) {
    result = vec3(1, 0, 0);
  } else {
    result = vec3(0, 0, 0);
  }

  float factor = 1.0;
  if (wavelength < 0.0) {
    factor = 0.0;
  } else if (wavelength < 0.1) {
    factor = 0.3 + 0.7 * wavelength / 0.1;
  } else if (wavelength < 0.7) {
    factor = 1.0;
  } else if (wavelength <= 1.0) {
    factor = 0.3 + 0.7 * (1.0 / 1.3 - wavelength) / (1.0 / 1.3 - 0.7);
  } else {
    factor = 0.0;
  }

  const float GAMMA = 0.8;
  if (result.r != 0.0) result.r = pow(result.r * factor, GAMMA);
  if (result.g != 0.0) result.g = pow(result.g * factor, GAMMA);
  if (result.b != 0.0) result.b = pow(result.b * factor, GAMMA);
  return result;
}

void main() {
  // l[i] = lambda_profiles[i].lambda
  float l[NUM_COLORS];
  // k[i] = lambda_profiles[i].two_pi_inverse_lambda
  float k[NUM_COLORS];
  float wl_min = lambda, wl_max = lambda;
  int rand = int(65536.0 * fract(sin(1000.0 * position.x))) ^
             int(65536.0 * fract(cos(1000.0 * position.y)));
  for (int i = 0; i < NUM_COLORS; i++) {
    float exponent = 16.0 * (float(rand % 256) / 256.0) - 8.0;
    rand = (rand * 9823763 + 2973657) % 65536;
    l[i] = lambda * pow(CLR_STEP, exponent);
    k[i] = 2.0 * PI / l[i];
    wl_min = min(l[i], wl_min);
    wl_max = max(l[i], wl_max);
  }

  // Accumulators for each wavelength.
  vec2 accum[NUM_COLORS];
  vec2 comp[NUM_COLORS];
  for (int i = 0; i < NUM_COLORS; i++) {
    accum[i] = vec2(0, 0);
    comp[i] = vec2(0, 0);
  }

  for (float y = 0.0; y < size; y++) {
    for (float x = 0.0; x < size; x++) {
      // Calculations that are the same for every pixel.
      vec2 a = vec2(x, y);
      float z = texelFetch(z_map, ivec2(x, y), 0).r;
      float intensity = texelFetch(aperture, ivec2(x, y), 0).r;

      // Calculations which are specific to this pixel.
      vec3 delta = vec3(a - position * size, z);
      float l_sqr = dot(delta, delta);
      float l = sqrt(l_sqr);
      float inv_l_sqr = 1.0 / l_sqr;
      for (int i = 0; i < NUM_COLORS; i++) {
        float d_tv = l * k[i];

        vec2 inc = intensity * inv_l_sqr * vec2(cos(d_tv), sin(d_tv));
        // Kahan summation.
        vec2 y = inc - comp[i];
        vec2 t = accum[i] + y;
        comp[i] = (t - accum[i]) - y;
        accum[i] = t;
      }
    }
  }

  vec3 result = vec3(0, 0, 0);
  for (int i = 0; i < NUM_COLORS; i++) {
    float total = brightness * dot(accum[i], accum[i]);
    result += wavelength_to_rgb(l[i], wl_min, wl_max) * total;
  }
  color = vec4(result, 1);
}
