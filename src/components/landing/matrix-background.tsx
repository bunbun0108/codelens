"use client";

import { useEffect, useRef, useCallback } from "react";

// ─── Landing-page-only palette exception (recorded in docs/DECISIONS.md) ──────
// Background: #030504 (near-black, not Pitch Black – avoids yellow-brown cast)
// Matrix chars: neon hacker green #39FF14
// Click flash:  Icy Aqua #AFFDF0 (from main palette)
const NEON_GREEN = "#39FF14";
const ICY_AQUA   = "#AFFDF0";

const CELL_SIZE      = 60;    // logical px
const IDLE_OPACITY   = 0.14;
const NEAR_OPACITY   = 1.0;
const NEAR_SCALE_MAX = 1.2;
const NEAR_GLOW_BLUR = 12;
const FLASH_DURATION = 200;   // ms

const CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789<>/?;:[]{}\\|!@#$%^&*()_+-=";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Cell {
  char: string;
  scrambleUntil: number;
  flashing: boolean;
  flashUntil: number;
}

interface Rgb { r: number; g: number; b: number }

function hexRgb(hex: string): Rgb {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function rgba(c: Rgb, a: number): string {
  return `rgba(${c.r},${c.g},${c.b},${a.toFixed(3)})`;
}

const GREEN_RGB = hexRgb(NEON_GREEN);
const AQUA_RGB  = hexRgb(ICY_AQUA);

function randomChar(): string {
  return CHARS[Math.floor(Math.random() * CHARS.length)]!;
}

// ─── Component ────────────────────────────────────────────────────────────────
export function MatrixBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cellsRef  = useRef<Cell[]>([]);
  const colsRef   = useRef(0);
  const rowsRef   = useRef(0);
  const mouseRef  = useRef({ x: -9999, y: -9999, active: false });
  const rafIdRef  = useRef<number>(0);
  const dirtyRef  = useRef(true);
  const reducedRef = useRef(false);

  // ── Grid ──────────────────────────────────────────────────────────────────
  const buildGrid = useCallback((cols: number, rows: number) => {
    const prev = cellsRef.current;
    cellsRef.current = Array.from({ length: cols * rows }, (_, i) => ({
      char:          prev[i]?.char ?? randomChar(),
      scrambleUntil: 0,
      flashing:      false,
      flashUntil:    0,
    }));
    colsRef.current = cols;
    rowsRef.current = rows;
  }, []);

  // ── Resize ────────────────────────────────────────────────────────────────
  const handleResize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr  = window.devicePixelRatio || 1;
    const w    = window.innerWidth;
    const h    = window.innerHeight;
    canvas.width  = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width  = `${w}px`;
    canvas.style.height = `${h}px`;
    buildGrid(Math.ceil(w / CELL_SIZE), Math.ceil(h / CELL_SIZE));
    dirtyRef.current = true;
  }, [buildGrid]);

  // ── Draw ──────────────────────────────────────────────────────────────────
  const draw = useCallback((now: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr     = window.devicePixelRatio || 1;
    const cols    = colsRef.current;
    const rows    = rowsRef.current;
    const cells   = cellsRef.current;
    const mouse   = mouseRef.current;
    const reduced = reducedRef.current;
    const vpW     = window.innerWidth;
    const vpH     = window.innerHeight;
    const radius  = vpW * 0.25;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, vpW, vpH);

    const fontSize = Math.round(CELL_SIZE * 0.45);
    ctx.font         = `${fontSize}px ui-monospace, monospace`;
    ctx.textAlign    = "center";
    ctx.textBaseline = "middle";

    let stillAnimating = false;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const idx  = row * cols + col;
        const cell = cells[idx];
        if (!cell) continue;

        const cx = col * CELL_SIZE + CELL_SIZE * 0.5;
        const cy = row * CELL_SIZE + CELL_SIZE * 0.5;

        // Scramble tick
        if (cell.scrambleUntil > 0) {
          if (now < cell.scrambleUntil) {
            cell.char = randomChar();
            stillAnimating = true;
          } else {
            cell.scrambleUntil = 0;
          }
        }

        // Flash expiry
        if (cell.flashing && now >= cell.flashUntil) {
          cell.flashing = false;
        }
        if (cell.flashing) stillAnimating = true;

        // Proximity
        const dx  = cx - mouse.x;
        const dy  = cy - mouse.y;
        const t   = reduced ? 0 : Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) / radius);
        const ts  = t * t * (3 - 2 * t); // smoothstep

        let color: string;
        let scale  = 1;
        let glow   = false;
        let glowColor = "";
        let glowBlur  = 0;

        if (cell.flashing) {
          color     = rgba(AQUA_RGB, NEAR_OPACITY);
          scale     = NEAR_SCALE_MAX;
          glow      = true;
          glowColor = rgba(AQUA_RGB, 0.7);
          glowBlur  = NEAR_GLOW_BLUR;
          stillAnimating = true;
        } else if (ts > 0 && mouse.active) {
          const opacity = IDLE_OPACITY + (NEAR_OPACITY - IDLE_OPACITY) * ts;
          color    = rgba(GREEN_RGB, opacity);
          scale    = 1 + (NEAR_SCALE_MAX - 1) * ts;
          glow     = ts > 0.15;
          glowColor = rgba(GREEN_RGB, ts * 0.8);
          glowBlur  = NEAR_GLOW_BLUR * ts;
        } else {
          color = rgba(GREEN_RGB, IDLE_OPACITY);
        }

        ctx.save();
        ctx.translate(cx, cy);
        if (scale !== 1) ctx.scale(scale, scale);

        if (glow) {
          ctx.shadowColor = glowColor;
          ctx.shadowBlur  = glowBlur;
        } else {
          ctx.shadowColor = "transparent";
          ctx.shadowBlur  = 0;
        }

        ctx.fillStyle = color;
        ctx.fillText(cell.char, 0, 0);
        ctx.restore();
      }
    }

    dirtyRef.current = stillAnimating;
    ctx.restore();
  }, []);

  // ── RAF loop ──────────────────────────────────────────────────────────────
  // Stored in a ref so the callback can reschedule itself without being listed
  // in its own dependency array (avoids react-hooks/immutability).
  const startLoop = useCallback(() => {
    const tick: FrameRequestCallback = (now) => {
      if (dirtyRef.current) draw(now);
      rafIdRef.current = requestAnimationFrame(tick);
    };
    rafIdRef.current = requestAnimationFrame(tick);
  }, [draw]);


  // ── Mount ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedRef.current = mq.matches;
    const onMq = (e: MediaQueryListEvent) => { reducedRef.current = e.matches; dirtyRef.current = true; };
    mq.addEventListener("change", onMq);

    const isTouch = window.matchMedia("(hover: none) and (pointer: coarse)").matches;
    if (isTouch) reducedRef.current = true;

    handleResize();
    const onResize = () => { handleResize(); dirtyRef.current = true; };
    window.addEventListener("resize", onResize, { passive: true });

    const onMouseMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY, active: true };
      dirtyRef.current = true;
    };
    const onMouseLeave = () => { mouseRef.current.active = false; dirtyRef.current = true; };

    const onWindowClick = (e: MouseEvent) => {
      if (reducedRef.current) return;
      const now = performance.now();
      const radius = window.innerWidth * 0.25;
      for (let row = 0; row < rowsRef.current; row++) {
        for (let col = 0; col < colsRef.current; col++) {
          const cx = col * CELL_SIZE + CELL_SIZE * 0.5;
          const cy = row * CELL_SIZE + CELL_SIZE * 0.5;
          const dx = cx - e.clientX;
          const dy = cy - e.clientY;
          if (Math.sqrt(dx * dx + dy * dy) < radius) {
            const cell = cellsRef.current[row * colsRef.current + col];
            if (!cell) continue;
            cell.flashing      = true;
            cell.flashUntil    = now + FLASH_DURATION;
            cell.scrambleUntil = now + FLASH_DURATION;
          }
        }
      }
      dirtyRef.current = true;
    };

    if (!isTouch) {
      window.addEventListener("mousemove",  onMouseMove,  { passive: true });
      window.addEventListener("mouseleave", onMouseLeave, { passive: true });
      window.addEventListener("click",      onWindowClick);
    }

    startLoop();

    return () => {
      cancelAnimationFrame(rafIdRef.current);
      window.removeEventListener("resize",     onResize);
      window.removeEventListener("mousemove",  onMouseMove);
      window.removeEventListener("mouseleave", onMouseLeave);
      window.removeEventListener("click",      onWindowClick);
      mq.removeEventListener("change", onMq);
    };
  }, [handleResize, startLoop]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }}
    />
  );
}
