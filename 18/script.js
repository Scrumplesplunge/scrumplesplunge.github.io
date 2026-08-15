const info = document.querySelector('#info');
const canvas = document.querySelector('canvas');
const gl = canvas.getContext('webgl2', {
  alpha: false,
  depth: false,
  antialias: true,
  preserveDrawingBuffer: true,
});
const ext = gl.getExtension('EXT_color_buffer_float');

// Load a script file. Returns the source code of the script.
async function loadScript(name) {
  const response = await fetch(name);
  if (!response.ok) {
    throw new Error(`Failed to load ${name}: ${response.status}`);
  }
  return response.text();
}

// Load an image file.
function loadImage(name) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = e => reject(new Error(`Failed to load image ${name}`));
    image.src = name;
  });
}

// Load an image into a GL texture.
async function loadTexture(name) {
  const image = await loadImage(name);
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, gl.RED, gl.UNSIGNED_BYTE, image);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return {texture, size: image.width};
}

// Create a blank texture.
function createFloatBuffer(width, height) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, width, height, 0, gl.RED, gl.FLOAT,
                null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
}

// Load and compile a shader file.
async function loadShader(type, name) {
  const source = await loadScript(name);
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`${name}: compile error:\n${gl.getShaderInfoLog(shader)}`);
  }
  return shader;
}

// Load and compile a shader program.
async function loadProgram(files) {
  const shaders =
      await Promise.all(files.map(([type, file]) => loadShader(type, file)));
  const program = gl.createProgram();
  for (const shader of shaders) {
    gl.attachShader(program, shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`Shader link error: ${gl.getProgramInfoLog(program)}`);
  }
  return program;
}

// Create a vertex buffer for a full-screen rectangle.
function createBox() {
  return box;
}

async function main() {
  gl.enableVertexAttribArray(0);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);

  // Load resources.
  const [{texture: aperture, size}, precompute, render] = await Promise.all([
    loadTexture('aperture.png'),
    loadProgram([
      [gl.VERTEX_SHADER, 'precompute.vert'],
      [gl.FRAGMENT_SHADER, 'precompute.frag'],
    ]),
    loadProgram([
      [gl.VERTEX_SHADER, 'shader.vert'],
      [gl.FRAGMENT_SHADER, 'shader.frag'],
    ]),
  ]);

  const chunkBuffer = gl.createBuffer();
  let numChunks = 1;
  let drawTimer = 0;

  const zMap = createFloatBuffer(size, size);
  const fb = gl.createFramebuffer();

  function pause() {
    return new Promise((resolve, reject) => {
      drawTimer = setTimeout(resolve, 10);
    });
  }

  function renderChunk(i) {
    gl.drawArrays(gl.TRIANGLE_STRIP, 4 * i, 4);
    gl.finish();
  }

  async function renderChunks(stage) {
    const start = Date.now();
    for (let i = 0; i < numChunks; i++) {
      renderChunk(i);
      const elapsed = (Date.now() - start) / 1000;
      const timePerChunk = elapsed / (i + 1);
      const remaining = Math.ceil((numChunks - i) * timePerChunk);
      info.innerText = `${stage} ${i}/${numChunks} (${remaining}s remaining)`;
      await pause();
    }
    info.innerText = ``;
  }

  async function draw() {
    // Precompute the z buffer. This halves the rendering time versus computing
    // this inline in the render shader.
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D,
                            zMap, 0);
    gl.viewport(0, 0, size, size);
    gl.useProgram(precompute);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, aperture);
    gl.uniform1f(gl.getUniformLocation(precompute, 'r'), 1000);
    gl.uniform1f(gl.getUniformLocation(precompute, 'unfocus_factor'), 0);
    gl.uniform1f(gl.getUniformLocation(precompute, 'size'), size);
    renderChunk(numChunks);

    // Render the main image.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(render);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, aperture);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, zMap);
    gl.uniform1i(gl.getUniformLocation(render, 'aperture'), /*TEXTURE*/0);
    gl.uniform1i(gl.getUniformLocation(render, 'z_map'), /*TEXTURE*/1);
    gl.uniform1f(gl.getUniformLocation(render, 'brightness'), 1e7);
    gl.uniform1f(gl.getUniformLocation(render, 'r'), 1000);
    gl.uniform1f(gl.getUniformLocation(render, 'lambda'), 0.75);
    gl.uniform1f(gl.getUniformLocation(render, 'unfocus_factor'), 0);
    gl.uniform1f(gl.getUniformLocation(render, 'size'), size);
    gl.uniform1f(gl.getUniformLocation(render, 'aspect'),
                 canvas.width / canvas.height);
    await renderChunks('render');
  }

  function restartDrawing() {
    clearTimeout(drawTimer);
    draw();
  }

  function resize() {
    canvas.width = devicePixelRatio * innerWidth;
    canvas.height = devicePixelRatio * innerHeight;
    gl.viewport(0, 0, canvas.width, canvas.height);

    // Create chunks. Chunks won't be exactly 64x64, but will be as close to
    // that as possible while perfectly dividing the available space.
    const CHUNK_SIZE = 64;
    const ROWS = Math.ceil(canvas.height / CHUNK_SIZE);
    const COLUMNS = Math.ceil(canvas.width / CHUNK_SIZE);
    numChunks = ROWS * COLUMNS;
    const chunks = [];
    const aspect = canvas.width / canvas.height;
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLUMNS; x++) {
        const left = 2 * x / COLUMNS - 1;
        const right = 2 * (x + 1) / COLUMNS - 1;
        const top = 2 * y / ROWS - 1;
        const bottom = 2 * (y + 1) / ROWS - 1;
        const cx = aspect * (left + right) / 2, cy = (top + bottom) / 2;
        const r2 = cx * cx + cy * cy;
        chunks.push([
          r2,
          [
            [left, top],
            [left, bottom],
            [right, top],
            [right, bottom],
          ],
        ]);
      }
    }
    // Sort chunks so that central ones are first.
    chunks.sort((a, b) => a[0] - b[0]);
    const fullScreen = [-1, -1, -1, 1, 1, -1, 1, 1];
    const vertices =
        new Float32Array([...chunks.map(a => a[1]).flat(2), ...fullScreen]);

    // Upload the vertex data.
    gl.bindBuffer(gl.ARRAY_BUFFER, chunkBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    console.log(`numChunks=${numChunks}, vertices.length=${vertices.length}`);
    restartDrawing();
  }

  resize();
  addEventListener('resize', resize);
}

main();
