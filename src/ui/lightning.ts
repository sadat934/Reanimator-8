// Lightning overlay shown while a game is being reanimated. Procedural bolts (random midpoint
// displacement) on a 2D overlay canvas. With reduced motion nothing is drawn: the page shows a
// static "Reanimating..." badge instead.

export interface LightningOptions {
  reducedMotion: boolean;
}

export interface Lightning {
  start(): void;
  stop(): void;
  setReducedMotion(reduced: boolean): void;
}

export type Point = { x: number; y: number };

/** Returns a jagged polyline from a to b. `rand` returns values in [0, 1). */
export function boltPath(a: Point, b: Point, depth: number, rand: () => number): Point[] {
  if (depth <= 0) return [a, b];
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  const offset = (rand() - 0.5) * length * 0.5;
  // Perpendicular unit vector scaled by the offset.
  const nx = length === 0 ? 0 : -(b.y - a.y) / length;
  const ny = length === 0 ? 0 : (b.x - a.x) / length;
  const mid: Point = { x: (a.x + b.x) / 2 + nx * offset, y: (a.y + b.y) / 2 + ny * offset };
  const left = boltPath(a, mid, depth - 1, rand);
  const right = boltPath(mid, b, depth - 1, rand);
  return [...left, ...right.slice(1)];
}

interface Bolt {
  path: Point[];
  born: number;
  life: number;
}

const BOLT_LIFE_MS = 260;

export function createLightning(overlay: HTMLCanvasElement, options: LightningOptions): Lightning {
  let reduced = options.reducedMotion;
  let handle = 0;
  let running = false;
  let nextStrike = 0;
  let bolts: Bolt[] = [];
  const ctx = overlay.getContext('2d');

  function resize(): void {
    const w = Math.max(1, overlay.clientWidth);
    const h = Math.max(1, overlay.clientHeight);
    if (overlay.width !== w || overlay.height !== h) {
      overlay.width = w;
      overlay.height = h;
    }
  }

  function clear(): void {
    ctx?.clearRect(0, 0, overlay.width, overlay.height);
  }

  function strike(now: number): void {
    const count = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      const x0 = overlay.width * (0.1 + Math.random() * 0.8);
      const x1 = x0 + (Math.random() - 0.5) * overlay.width * 0.3;
      const path = boltPath({ x: x0, y: 0 }, { x: x1, y: overlay.height }, 6, Math.random);
      bolts.push({ path, born: now, life: BOLT_LIFE_MS });
    }
    nextStrike = now + 350 + Math.random() * 600;
  }

  function frame(now: number): void {
    if (!running || !ctx) return;
    resize();
    if (now >= nextStrike) strike(now);
    bolts = bolts.filter((bolt) => now - bolt.born < bolt.life);
    clear();
    const flash = bolts.reduce((max, bolt) => Math.max(max, 1 - (now - bolt.born) / bolt.life), 0);
    if (flash > 0) {
      ctx.fillStyle = `rgba(190, 255, 210, ${(flash * 0.12).toFixed(3)})`;
      ctx.fillRect(0, 0, overlay.width, overlay.height);
    }
    ctx.lineJoin = 'round';
    for (const bolt of bolts) {
      const alpha = 1 - (now - bolt.born) / bolt.life;
      ctx.shadowColor = `rgba(80, 255, 140, ${alpha.toFixed(3)})`;
      ctx.shadowBlur = 14;
      ctx.strokeStyle = `rgba(235, 255, 240, ${alpha.toFixed(3)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      bolt.path.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
    }
    handle = requestAnimationFrame(frame);
  }

  function halt(): void {
    running = false;
    cancelAnimationFrame(handle);
    bolts = [];
    clear();
    overlay.dataset.lightning = 'off';
  }

  overlay.dataset.lightning = 'off';

  return {
    start() {
      if (running || reduced || !ctx) return;
      running = true;
      nextStrike = 0;
      overlay.dataset.lightning = 'running';
      handle = requestAnimationFrame(frame);
    },
    stop: halt,
    setReducedMotion(value) {
      reduced = value;
      if (value && running) halt();
    },
  };
}
