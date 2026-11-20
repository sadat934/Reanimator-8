// CRT view for the 64x32 display. Preferred path: a small WebGL 1 shader (curvature, glow,
// scanlines, phosphor tint, vignette, flicker). Fallback: a plain 2D canvas that CSS dresses up
// (class `crt--css` on the wrapper, rules in styles.css). Shader code is written for this project.
import { DISPLAY_HEIGHT, DISPLAY_WIDTH } from '../emulator';

export type RendererKind = 'webgl' | 'css';

export interface CrtOptions {
  /** Use the CSS fallback even when WebGL works (the `?renderer=css` switch). */
  forceCss: boolean;
  reducedMotion: boolean;
}

export interface CrtView {
  readonly kind: RendererKind;
  paint(display: Uint8Array, timeSec: number): void;
  setReducedMotion(reduced: boolean): void;
  destroy(): void;
}

export function pickRenderer(input: { webglAvailable: boolean; forceCss: boolean }): RendererKind {
  return input.webglAvailable && !input.forceCss ? 'webgl' : 'css';
}

const FLICKER_AMPLITUDE = 0.03;

const VERTEX_SOURCE = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = vec2(a_pos.x * 0.5 + 0.5, 0.5 - a_pos.y * 0.5);
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const FRAGMENT_SOURCE = `
precision mediump float;
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform float u_time;
uniform float u_flicker;
varying vec2 v_uv;
const vec2 GRID = vec2(${DISPLAY_WIDTH}.0, ${DISPLAY_HEIGHT}.0);

vec2 curve(vec2 uv) {
  vec2 c = uv * 2.0 - 1.0;
  c *= 1.0 + 0.07 * vec2(c.y * c.y, c.x * c.x);
  return c * 0.5 + 0.5;
}

float lit(vec2 c) {
  if (c.x < 0.0 || c.y < 0.0 || c.x >= GRID.x || c.y >= GRID.y) return 0.0;
  return texture2D(u_tex, (c + 0.5) / GRID).r;
}

void main() {
  vec2 uv = curve(v_uv);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  vec2 pos = uv * GRID;
  vec2 cell = floor(pos);
  vec2 f = fract(pos);

  float glow = 0.0;
  for (int dy = -1; dy <= 1; dy++) {
    for (int dx = -1; dx <= 1; dx++) {
      vec2 c = cell + vec2(float(dx), float(dy));
      float d = distance(pos, c + 0.5);
      glow += lit(c) * exp(-d * d * 1.4);
    }
  }
  glow *= 0.3;

  vec2 edge = smoothstep(0.0, 0.14, f) * (1.0 - smoothstep(0.86, 1.0, f));
  float body = lit(cell) * edge.x * edge.y;

  vec3 background = vec3(0.0, 0.04, 0.018);
  vec3 phosphor = vec3(0.2, 1.0, 0.4);
  vec3 color = background + phosphor * (body + glow * 0.7);

  float scan = 0.84 + 0.16 * sin(gl_FragCoord.y * 2.0944);
  color *= scan;
  color *= 1.0 - u_flicker * sin(u_time * 60.0);

  vec2 q = v_uv * 2.0 - 1.0;
  color *= 1.0 - 0.3 * dot(q, q) * 0.5;
  gl_FragColor = vec4(color, 1.0);
}
`;

interface GlPipeline {
  gl: WebGLRenderingContext;
  program: WebGLProgram;
  texture: WebGLTexture;
  uniforms: { res: WebGLUniformLocation | null; time: WebGLUniformLocation | null; flicker: WebGLUniformLocation | null };
}

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

/** Builds the program, quad buffer and texture on `gl`, or returns null if anything fails. */
function buildPipeline(gl: WebGLRenderingContext): GlPipeline | null {
  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SOURCE);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SOURCE);
  const program = gl.createProgram();
  const buffer = gl.createBuffer();
  const texture = gl.createTexture();
  if (!vertex || !fragment || !program || !buffer || !texture) return null;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  gl.useProgram(program);

  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'a_pos');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.uniform1i(gl.getUniformLocation(program, 'u_tex'), 0);

  return {
    gl,
    program,
    texture,
    uniforms: {
      res: gl.getUniformLocation(program, 'u_res'),
      time: gl.getUniformLocation(program, 'u_time'),
      flicker: gl.getUniformLocation(program, 'u_flicker'),
    },
  };
}

/** Tries the whole shader on a throwaway canvas, so a failure leaves the real canvas usable for 2D. */
function probeWebgl(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const scratch = document.createElement('canvas');
    const gl = scratch.getContext('webgl');
    if (!gl) return false;
    const ok = buildPipeline(gl) !== null;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return ok;
  } catch {
    return false;
  }
}

function markWrapper(canvas: HTMLCanvasElement, kind: RendererKind): void {
  canvas.dataset.renderer = kind;
  const wrapper = canvas.parentElement;
  if (!wrapper) return;
  wrapper.classList.toggle('crt--css', kind === 'css');
  wrapper.classList.toggle('crt--webgl', kind === 'webgl');
}

function createWebglView(canvas: HTMLCanvasElement, options: CrtOptions): CrtView {
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false });
  const pipeline = gl ? buildPipeline(gl) : null;
  if (!gl || !pipeline) throw new Error('WebGL setup failed after the probe succeeded');
  let reduced = options.reducedMotion;
  const texels = new Uint8Array(DISPLAY_WIDTH * DISPLAY_HEIGHT);
  let width = 0;

  const onLost = (event: Event): void => event.preventDefault();
  canvas.addEventListener('webglcontextlost', onLost);

  function resize(): void {
    const css = canvas.clientWidth;
    if (css <= 0) {
      if (width === 0) width = 640;
    } else {
      width = Math.min(1600, Math.max(256, Math.round(css * (window.devicePixelRatio || 1))));
    }
    const height = Math.round(width / 2);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  }

  return {
    kind: 'webgl',
    paint(display, timeSec) {
      if (gl.isContextLost()) return;
      resize();
      for (let i = 0; i < texels.length; i++) texels[i] = display[i] ? 255 : 0;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.bindTexture(gl.TEXTURE_2D, pipeline.texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, DISPLAY_WIDTH, DISPLAY_HEIGHT, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, texels);
      gl.uniform2f(pipeline.uniforms.res, canvas.width, canvas.height);
      gl.uniform1f(pipeline.uniforms.time, timeSec % 1000);
      gl.uniform1f(pipeline.uniforms.flicker, reduced ? 0 : FLICKER_AMPLITUDE);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
    setReducedMotion(value) {
      reduced = value;
    },
    destroy() {
      canvas.removeEventListener('webglcontextlost', onLost);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}

const LIT = [0x33, 0xff, 0x66] as const;
const OFF = [0x00, 0x1a, 0x08] as const;

function createCssView(canvas: HTMLCanvasElement): CrtView {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  canvas.width = DISPLAY_WIDTH;
  canvas.height = DISPLAY_HEIGHT;
  const image = ctx.createImageData(DISPLAY_WIDTH, DISPLAY_HEIGHT);
  return {
    kind: 'css',
    paint(display) {
      for (let i = 0; i < display.length; i++) {
        const color = display[i] ? LIT : OFF;
        image.data[i * 4] = color[0];
        image.data[i * 4 + 1] = color[1];
        image.data[i * 4 + 2] = color[2];
        image.data[i * 4 + 3] = 255;
      }
      ctx.putImageData(image, 0, 0);
    },
    // The CSS flicker is switched off by the prefers-reduced-motion media query in styles.css.
    setReducedMotion() {},
    destroy() {},
  };
}

export function createCrtView(canvas: HTMLCanvasElement, options: CrtOptions): CrtView {
  const kind = pickRenderer({ webglAvailable: options.forceCss ? false : probeWebgl(), forceCss: options.forceCss });
  const view = kind === 'webgl' ? createWebglView(canvas, options) : createCssView(canvas);
  markWrapper(canvas, view.kind);
  return view;
}
