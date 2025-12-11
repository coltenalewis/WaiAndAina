"use client";

import { useEffect, useRef, useState } from "react";

const GRAVITY = 1800; // px/s^2
const JUMP_VELOCITY = -720; // px/s
const BASE_SPEED = 260; // px/s
const SPEED_INCREMENT = 8; // px/s^2 scaled over time
const MIN_GAP = 280;
const MAX_GAP = 520;
const GROUND_HEIGHT = 52;
const GOAT_SIZE = 46;
const MIN_HEIGHT = 280;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export default function GoatRunPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);
  const goatYRef = useRef<number>(0);
  const goatVelRef = useRef<number>(0);
  const obstaclesRef = useRef<Array<{ x: number; width: number; height: number }>>([]);
  const speedRef = useRef<number>(BASE_SPEED);
  const scoreRef = useRef<number>(0);
  const statusRef = useRef<"idle" | "running" | "over">("idle");
  const [status, setStatus] = useState<"idle" | "running" | "over">("idle");
  const [score, setScore] = useState<number>(0);
  const [message, setMessage] = useState<string>("Tap or press space to leap fences!");
  const [canvasSize, setCanvasSize] = useState({ width: 760, height: MIN_HEIGHT });

  useEffect(() => {
    const resize = () => {
      if (!wrapperRef.current) return;
      const width = clamp(wrapperRef.current.clientWidth, 360, 960);
      setCanvasSize({ width, height: MIN_HEIGHT });
    };

    resize();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
    };
  }, []);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.code === "Space") {
        event.preventDefault();
        if (status === "idle" || status === "over") {
          startGame();
        } else {
          jump();
        }
      }
    };

    const handlePointer = () => {
      if (status === "idle" || status === "over") {
        startGame();
      } else {
        jump();
      }
    };

    window.addEventListener("keydown", handleKey);
    window.addEventListener("pointerdown", handlePointer);
    return () => {
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener("pointerdown", handlePointer);
      stopGame();
    };
  }, [status]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = canvasSize.width;
    canvas.height = canvasSize.height;
    drawScene(canvas.getContext("2d"));
  }, [canvasSize]);

  const jump = () => {
    if (goatYRef.current >= groundY(canvasSize.height)) {
      goatVelRef.current = JUMP_VELOCITY;
    }
  };

  const startGame = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    obstaclesRef.current = [];
    speedRef.current = BASE_SPEED;
    scoreRef.current = 0;
    goatYRef.current = groundY(canvasSize.height);
    goatVelRef.current = 0;
    lastTimeRef.current = null;
    statusRef.current = "running";
    setStatus("running");
    setMessage("Catch the rhythm and hop the fences!");
    rafRef.current = requestAnimationFrame(step);
  };

  const stopGame = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }
    rafRef.current = null;
    lastTimeRef.current = null;
  };

  const step = (timestamp: number) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    if (lastTimeRef.current === null) {
      lastTimeRef.current = timestamp;
      rafRef.current = requestAnimationFrame(step);
      return;
    }

    const delta = (timestamp - lastTimeRef.current) / 1000;
    lastTimeRef.current = timestamp;

    updatePhysics(delta, canvas.width, canvas.height);
    drawScene(ctx);

    if (statusRef.current === "running") {
      rafRef.current = requestAnimationFrame(step);
    }
  };

  const groundY = (height: number) => height - GROUND_HEIGHT;

  const spawnObstacle = (width: number, height: number, canvasWidth: number) => {
    const last = obstaclesRef.current[obstaclesRef.current.length - 1];
    const gap = MIN_GAP + Math.random() * (MAX_GAP - MIN_GAP);
    const startX = last ? Math.max(canvasWidth, last.x + last.width + gap) : canvasWidth + 120;
    obstaclesRef.current.push({ x: startX, width, height });
  };

  const updatePhysics = (delta: number, canvasWidth: number, canvasHeight: number) => {
    speedRef.current += SPEED_INCREMENT * delta;
    scoreRef.current += delta * 10;
    setScore(Math.floor(scoreRef.current));

    goatVelRef.current += GRAVITY * delta;
    goatYRef.current += goatVelRef.current * delta;

    const ground = groundY(canvasHeight);
    if (goatYRef.current > ground) {
      goatYRef.current = ground;
      goatVelRef.current = 0;
    }

    const shouldSpawn =
      obstaclesRef.current.length === 0 ||
      (obstaclesRef.current[obstaclesRef.current.length - 1]?.x ?? 0) < canvasWidth - MIN_GAP;
    if (shouldSpawn) {
      const height = 40 + Math.random() * 22;
      const width = 36 + Math.random() * 20;
      spawnObstacle(width, height, canvasWidth);
    }

    obstaclesRef.current = obstaclesRef.current
      .map((obstacle) => ({ ...obstacle, x: obstacle.x - speedRef.current * delta }))
      .filter((obstacle) => obstacle.x + obstacle.width > -80);

    if (checkCollision(canvasHeight)) {
      statusRef.current = "over";
      setStatus("over");
      setMessage("Ouch! Tap start to run again.");
      stopGame();
    }
  };

  const checkCollision = (canvasHeight: number) => {
    const goatX = canvasSize.width * 0.14;
    const goatY = goatYRef.current;
    const goatTop = goatY - GOAT_SIZE;
    const goatBottom = goatY;
    const goatLeft = goatX - GOAT_SIZE * 0.3;
    const goatRight = goatX + GOAT_SIZE * 0.5;

    return obstaclesRef.current.some((obs) => {
      const obsTop = canvasHeight - GROUND_HEIGHT - obs.height;
      const obsBottom = canvasHeight - GROUND_HEIGHT;
      const obsLeft = obs.x;
      const obsRight = obs.x + obs.width;

      const overlapX = goatLeft < obsRight && goatRight > obsLeft;
      const overlapY = goatBottom > obsTop && goatTop < obsBottom;
      return overlapX && overlapY;
    });
  };

  const drawScene = (ctx: CanvasRenderingContext2D | null) => {
    if (!ctx) return;
    const { width, height } = canvasSize;

    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "#f7fbff");
    gradient.addColorStop(1, "#d7f3d1");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // subtle clouds
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    for (let i = 0; i < 4; i++) {
      const cx = (width / 4) * i + (i % 2 === 0 ? 40 : -20);
      const cy = 50 + i * 8;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 60, 22, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    const groundTop = height - GROUND_HEIGHT;
    ctx.fillStyle = "#a3cf72";
    ctx.fillRect(0, groundTop, width, GROUND_HEIGHT);
    ctx.fillStyle = "#86b85a";
    for (let i = 0; i < width; i += 26) {
      ctx.fillRect(i, groundTop + 32, 18, 10);
    }

    obstaclesRef.current.forEach((obs) => {
      const obsTop = height - GROUND_HEIGHT - obs.height;
      ctx.fillStyle = "#c28f51";
      ctx.fillRect(obs.x, obsTop, obs.width, obs.height);
      ctx.fillStyle = "#d9b07c";
      ctx.fillRect(obs.x + 4, obsTop + 6, obs.width - 8, obs.height - 12);
      ctx.strokeStyle = "#9d6b3d";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(obs.x, obsTop + obs.height * 0.35);
      ctx.lineTo(obs.x + obs.width, obsTop + obs.height * 0.35);
      ctx.moveTo(obs.x, obsTop + obs.height * 0.7);
      ctx.lineTo(obs.x + obs.width, obsTop + obs.height * 0.7);
      ctx.moveTo(obs.x + obs.width * 0.25, obsTop);
      ctx.lineTo(obs.x + obs.width * 0.25, obsTop + obs.height);
      ctx.moveTo(obs.x + obs.width * 0.5, obsTop);
      ctx.lineTo(obs.x + obs.width * 0.5, obsTop + obs.height);
      ctx.moveTo(obs.x + obs.width * 0.75, obsTop);
      ctx.lineTo(obs.x + obs.width * 0.75, obsTop + obs.height);
      ctx.stroke();
    });

    const goatX = width * 0.14;
    const goatY = goatYRef.current;

    ctx.font = `${GOAT_SIZE}px "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
    ctx.textBaseline = "bottom";
    ctx.fillText("🐐", goatX, goatY - 6);

    // shadow
    ctx.fillStyle = "rgba(0,0,0,0.12)";
    ctx.beginPath();
    ctx.ellipse(goatX + 10, groundTop + 36, 36, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#4f6b2d";
    ctx.font = "16px 'Inter', system-ui, sans-serif";
    ctx.fillText(`Score: ${Math.floor(scoreRef.current)}`, width - 140, 28);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-full bg-white shadow flex items-center justify-center text-3xl">
          🐐
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-[#3b4224]">Goat Run</h1>
          <p className="text-sm text-[#556133]">A playful take on the offline dino dash — now with a spry goat and friendly fences.</p>
        </div>
      </div>

      <div className="rounded-2xl bg-white shadow-lg p-4 sm:p-5">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-2 text-[#4f5d2a]">
              <span className="text-xl">🌿</span>
              <span className="text-sm sm:text-base font-medium">Tap the start button or hit space to begin. Jump with space or a tap.</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="px-3 py-1 rounded-full bg-[#f2f6e6] text-xs font-semibold text-[#4f5d2a] shadow-inner">Score: {score}</div>
              <button
                onClick={startGame}
                className="rounded-full bg-[#a2c867] text-white px-4 py-2 text-sm font-semibold shadow-md hover:bg-[#8db153] transition-colors"
              >
                {status === "running" ? "Restart" : "Start"}
              </button>
            </div>
          </div>
          <div ref={wrapperRef} className="relative w-full">
            <canvas
              ref={canvasRef}
              className="w-full rounded-xl border border-[#d9e5c2] bg-[#eaf5dd] shadow-inner touch-pan-y"
            />
            {status !== "running" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center rounded-xl bg-white/70 backdrop-blur-[1px] text-center px-6">
                <div className="text-5xl mb-3">🐐</div>
                <p className="text-base sm:text-lg font-semibold text-[#3f4a23]">{message}</p>
                <p className="text-sm text-[#65734c] mt-2">Press space on desktop or tap anywhere to hop.</p>
              </div>
            )}
          </div>
          <div className="text-xs text-[#6b744d] text-center">Heads-up: leaving this page will gently pause the run until you hop back in.</div>
        </div>
      </div>
    </div>
  );
}
