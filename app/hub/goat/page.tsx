"use client";

import { useEffect, useRef, useState } from "react";
import { loadSession } from "@/lib/session";

type LeaderboardEntry = {
  name: string;
  goats: number;
  bestRun: number;
};

type StatsState = {
  goats: number;
  bestRun: number;
  goatLeaderboard: LeaderboardEntry[];
  runLeaderboard: LeaderboardEntry[];
};

type DiceResult = {
  roll?: number[];
  sum?: number;
  payout?: number;
  win?: boolean;
  betType?: BetType;
  betAmount?: number;
  error?: string;
};

type RunSummary = {
  score: number;
  earned: number;
  bestRun: number;
};

type BetType = "LOW" | "SEVEN" | "HIGH";

const GRAVITY = 1800;
const JUMP_VELOCITY = -720;
const BASE_SPEED = 260;
const SPEED_INCREMENT = 8;
const MIN_GAP = 280;
const MAX_GAP = 520;
const GROUND_HEIGHT = 52;
const GOAT_SIZE = 46;
const MIN_HEIGHT = 280;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

const pipLayout: Record<number, Array<[number, number]>> = {
  1: [[50, 50]],
  2: [
    [30, 30],
    [70, 70],
  ],
  3: [
    [30, 30],
    [50, 50],
    [70, 70],
  ],
  4: [
    [30, 30],
    [70, 30],
    [30, 70],
    [70, 70],
  ],
  5: [
    [30, 30],
    [70, 30],
    [50, 50],
    [30, 70],
    [70, 70],
  ],
  6: [
    [30, 25],
    [70, 25],
    [30, 50],
    [70, 50],
    [30, 75],
    [70, 75],
  ],
};

function DiceFace({ value, animate }: { value: number; animate?: boolean }) {
  const clampedValue = Math.max(1, Math.min(6, Math.round(value)));
  const pips = pipLayout[clampedValue] || pipLayout[1];
  return (
    <div
      className={`relative w-16 h-16 rounded-2xl border-2 border-[#d6dfc3] bg-white shadow-[0_10px_30px_rgba(96,117,61,0.12)] flex items-center justify-center transition-transform ${
        animate ? "dice-shake" : "dice-pop"
      }`}
    >
      {pips.map((pip, idx) => (
        <span
          key={`${clampedValue}-${idx}`}
          className="absolute w-3 h-3 rounded-full bg-[#3f4a23] shadow-[0_1px_3px_rgba(0,0,0,0.2)]"
          style={{ left: `${pip[0]}%`, top: `${pip[1]}%`, transform: "translate(-50%, -50%)" }}
        />
      ))}
    </div>
  );
}

export default function GoatArcadePage() {
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
  const [activeGame, setActiveGame] = useState<"run" | "dice">("run");
  const [name, setName] = useState<string>("");
  const [stats, setStats] = useState<StatsState>({
    goats: 0,
    bestRun: 0,
    goatLeaderboard: [],
    runLeaderboard: [],
  });
  const [loadingStats, setLoadingStats] = useState(false);
  const [runSummary, setRunSummary] = useState<RunSummary | null>(null);
  const [showLeaders, setShowLeaders] = useState(false);
  const [diceBetType, setDiceBetType] = useState<BetType>("LOW");
  const [diceBetAmount, setDiceBetAmount] = useState<number>(5);
  const [diceResult, setDiceResult] = useState<DiceResult>({});
  const [diceLoading, setDiceLoading] = useState(false);
  const [diceAnimating, setDiceAnimating] = useState(false);
  const [rollingFaces, setRollingFaces] = useState<[number, number]>([1, 1]);

  useEffect(() => {
    const session = loadSession();
    if (session?.name) {
      setName(session.name);
    }
  }, []);

  useEffect(() => {
    if (!name) return;
    void fetchStats();
  }, [name]);

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
      if (event.code === "Space" && activeGame === "run") {
        event.preventDefault();
        if (status === "idle" || status === "over") {
          startGame();
        } else {
          jump();
        }
      }
    };

    const handlePointer = () => {
      if (activeGame !== "run") return;
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
  }, [status, activeGame]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = canvasSize.width;
    canvas.height = canvasSize.height;
    drawScene(canvas.getContext("2d"));
  }, [canvasSize]);

  useEffect(() => {
    if (activeGame !== "run") {
      stopGame();
      setStatus("idle");
      setMessage("Tap or press space to leap fences!");
    }
  }, [activeGame]);

  useEffect(() => {
    if (!diceAnimating) {
      if (diceResult.roll && diceResult.roll.length === 2) {
        setRollingFaces([diceResult.roll[0], diceResult.roll[1]]);
      }
      return;
    }

    const id = setInterval(() => {
      setRollingFaces([
        Math.floor(Math.random() * 6) + 1,
        Math.floor(Math.random() * 6) + 1,
      ]);
    }, 90);

    return () => clearInterval(id);
  }, [diceAnimating, diceResult.roll]);

  const fetchStats = async () => {
    try {
      setLoadingStats(true);
      const res = await fetch("/api/goat-stats", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load stats");
      const data = await res.json();
      const normalized = name.trim().toLowerCase();
      const currentUser = (data.users || []).find(
        (u: LeaderboardEntry) => u.name.trim().toLowerCase() === normalized
      );

      setStats({
        goats: currentUser?.goats ?? 0,
        bestRun: currentUser?.bestRun ?? 0,
        goatLeaderboard: data.goatLeaderboard || [],
        runLeaderboard: data.runLeaderboard || [],
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingStats(false);
    }
  };

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
    setShowLeaders(false);
    setRunSummary(null);
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

  const handleGameOver = async () => {
    statusRef.current = "over";
    setStatus("over");
    setMessage("Ouch! Tap start to run again.");
    stopGame();
    const finalScore = Math.floor(scoreRef.current);
    setScore(finalScore);
    setShowLeaders(true);
    setRunSummary({ score: finalScore, earned: 0, bestRun: finalScore });

    if (!name) return;
    try {
      const res = await fetch("/api/goat-stats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run", name, score: finalScore }),
      });

      if (!res.ok) throw new Error("Failed to record run");
      const data = await res.json();
      setStats((prev) => ({
        goats: data.goats ?? prev.goats,
        bestRun: data.bestRun ?? prev.bestRun,
        goatLeaderboard: data.goatLeaderboard || prev.goatLeaderboard,
        runLeaderboard: data.runLeaderboard || prev.runLeaderboard,
      }));
      setRunSummary({
        score: finalScore,
        earned: data.earned ?? 0,
        bestRun: data.bestRun ?? finalScore,
      });
    } catch (err) {
      console.error(err);
    }
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
    rafRef.current = requestAnimationFrame(step);
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
      void handleGameOver();
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

    ctx.save();
    ctx.scale(-1, 1);
    ctx.font = `${GOAT_SIZE}px "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
    ctx.textBaseline = "bottom";
    ctx.fillText("🐐", -(goatX), goatY - 6);
    ctx.restore();

    ctx.fillStyle = "rgba(0,0,0,0.12)";
    ctx.beginPath();
    ctx.ellipse(goatX + 10, groundTop + 36, 36, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#4f6b2d";
    ctx.font = "16px 'Inter', system-ui, sans-serif";
    ctx.fillText(`Score: ${Math.floor(scoreRef.current)}`, width - 140, 28);
  };

  const handleRoll = async () => {
    if (!name) {
      setDiceResult({ error: "Please log in to play." });
      return;
    }

    const bet = Math.max(1, Math.floor(diceBetAmount));
    if (bet > stats.goats) {
      setDiceResult({ error: "Not enough 🐐 for that bet." });
      return;
    }

    setDiceLoading(true);
    setDiceAnimating(true);
    setDiceResult({});
    try {
      const res = await fetch("/api/goat-stats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "dice",
          name,
          betType: diceBetType,
          betAmount: bet,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDiceResult({ error: data?.error || "Failed to roll" });
        setDiceAnimating(false);
        return;
      }

      setStats((prev) => ({
        goats: data.goats ?? prev.goats,
        bestRun: prev.bestRun,
        goatLeaderboard: data.goatLeaderboard || prev.goatLeaderboard,
        runLeaderboard: data.runLeaderboard || prev.runLeaderboard,
      }));

      setDiceResult({
        roll: data.roll,
        sum: data.sum,
        payout: data.payout,
        win: data.win,
        betType: data.betType,
        betAmount: data.betAmount,
      });
      setTimeout(() => setDiceAnimating(false), 700);
    } catch (err) {
      console.error(err);
      setDiceResult({ error: "Something went wrong." });
      setDiceAnimating(false);
    } finally {
      setDiceLoading(false);
    }
  };

  const displayDice: [number, number] = diceAnimating
    ? rollingFaces
    : diceResult.roll && diceResult.roll.length === 2
    ? [diceResult.roll[0], diceResult.roll[1]]
    : rollingFaces;

  const resolvedSum = diceResult.sum ??
    (diceResult.roll && diceResult.roll.length === 2
      ? diceResult.roll[0] + diceResult.roll[1]
      : undefined);

  const betOptions: { key: BetType; label: string }[] = [
    { key: "LOW", label: "LOW (2-6)" },
    { key: "SEVEN", label: "SEVEN" },
    { key: "HIGH", label: "HIGH (8-12)" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-full bg-white shadow flex items-center justify-center text-3xl">🐐</div>
          <div>
            <h1 className="text-2xl font-semibold text-[#3b4224]">Goat Arcade</h1>
            <p className="text-sm text-[#556133]">
              Hop fences for glory or roll the dice for extra 🐐. Every 200 Run points adds one 🐐 to Goat Dice.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap text-xs text-[#4f5d2a]">
          <span className="px-3 py-1 rounded-full bg-white/80 shadow-inner font-semibold">
            Balance: 🐐 {loadingStats ? "..." : stats.goats}
          </span>
          <span className="px-3 py-1 rounded-full bg-white/80 shadow-inner font-semibold">
            Best Run: {loadingStats ? "..." : stats.bestRun}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            { key: "run", label: "Goat Run" },
            { key: "dice", label: "Goat Dice" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveGame(tab.key)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition shadow ${
              activeGame === tab.key
                ? "bg-[#a2c867] text-white shadow-md"
                : "bg-white text-[#4f5d2a] hover:bg-[#f2f6e6]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          {activeGame === "run" ? (
            <div className="rounded-2xl bg-white shadow-lg p-4 sm:p-5">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="flex items-center gap-2 text-[#4f5d2a]">
                    <span className="text-xl">🌿</span>
                    <span className="text-sm sm:text-base font-medium">
                      Tap start or press space. Jump with space or tap.
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="px-3 py-1 rounded-full bg-[#f2f6e6] text-xs font-semibold text-[#4f5d2a] shadow-inner">
                      Score: {score}
                    </div>
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
                      {showLeaders && (
                        <div className="mt-4 w-full max-w-xl text-left">
                          <div className="flex items-center justify-between text-xs text-[#4f5d2a] font-semibold mb-2">
                            <span>Top Goat Runners</span>
                            <span>Best</span>
                          </div>
                          <div className="bg-white/80 rounded-lg shadow-inner divide-y divide-[#e3ebd2] max-h-48 overflow-y-auto">
                            {stats.runLeaderboard.map((entry, idx) => (
                              <div key={entry.name} className="flex items-center justify-between px-3 py-2 text-sm">
                                <span className="flex items-center gap-2">
                                  <span className="text-[#8db153] font-semibold">#{idx + 1}</span>
                                  {entry.name}
                                </span>
                                <span className="font-semibold text-[#3f4a23]">{entry.bestRun}</span>
                              </div>
                            ))}
                            {stats.runLeaderboard.length === 0 && (
                              <div className="px-3 py-2 text-sm text-[#6b744d]">No runs yet.</div>
                            )}
                          </div>
                          {runSummary && (
                            <div className="mt-3 text-sm text-[#3f4a23]">
                              <p>
                                You scored <strong>{runSummary.score}</strong> and gathered 🐐{runSummary.earned}. Best: {runSummary.bestRun}.
                              </p>
                              <p className="text-xs text-[#6b744d] mt-1">Every 200 points adds one 🐐 to Goat Dice.</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="text-xs text-[#6b744d] text-center">
                  Leaving this page pauses the run until you hop back in. 200 points = 1 goat for Goat Dice.
                </div>
              </div>
            </div>
          ) : (
              <div className="rounded-2xl bg-white shadow-lg p-4 sm:p-5 flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-[#3b4224]">Goat Dice</h2>
                  <p className="text-sm text-[#556133]">Bet your 🐐 on LOW (2–6), SEVEN, or HIGH (8–12). SEVEN pays five 🐐 for every one you wager; the others double you up.</p>
                </div>
                <div className="px-3 py-1 rounded-full bg-[#f2f6e6] text-xs font-semibold text-[#4f5d2a] shadow-inner">
                  Balance: 🐐 {stats.goats}
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="flex flex-col gap-3">
                  <label className="text-sm font-semibold text-[#3f4a23]">Bet amount</label>
                  <input
                    type="number"
                    min={1}
                    value={diceBetAmount}
                    onChange={(e) => setDiceBetAmount(Number(e.target.value))}
                    className="rounded-lg border border-[#d9e5c2] px-3 py-2 text-sm shadow-inner focus:outline-none focus:ring-2 focus:ring-[#a2c867]"
                  />
                  <div className="text-xs text-[#6b744d]">Bet is deducted on roll. Winnings are added immediately to your 🐐 pile.</div>
                </div>
                <div className="flex flex-col gap-3">
                  <label className="text-sm font-semibold text-[#3f4a23]">Pick your fate</label>
                  <div className="flex flex-wrap gap-2">
                    {betOptions.map((opt) => (
                      <button
                        key={opt.key}
                        onClick={() => setDiceBetType(opt.key)}
                        className={`rounded-full px-3 py-2 text-sm font-semibold transition shadow ${
                          diceBetType === opt.key
                            ? "bg-[#a2c867] text-white shadow-md"
                            : "bg-[#f2f6e6] text-[#4f5d2a] hover:bg-[#e5efc8]"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={handleRoll}
                    disabled={diceLoading}
                    className="rounded-full bg-[#3f4a23] text-white px-4 py-2 text-sm font-semibold shadow hover:bg-[#2f3618] disabled:opacity-60"
                  >
                    {diceLoading ? "Rolling..." : "Roll the Dice"}
                  </button>
                  {diceResult.error && (
                    <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                      {diceResult.error}
                    </div>
                  )}
                </div>
              </div>
              <div className="rounded-xl border border-[#d9e5c2] bg-[#f9fbf2] p-4 shadow-inner">
                <div className="flex items-center justify-between text-sm text-[#3f4a23] font-semibold">
                  <span>Outcome</span>
                  <span className="text-[#6b744d]">Multiplier: LOW/HIGH 2×, SEVEN 5×</span>
                </div>
                <div className="mt-4 flex flex-col md:flex-row md:items-center gap-4">
                  <div className="flex items-center justify-center gap-3 md:w-52">
                    <DiceFace value={displayDice[0]} animate={diceAnimating} />
                    <DiceFace value={displayDice[1]} animate={diceAnimating} />
                  </div>
                  <div className="flex-1 grid sm:grid-cols-3 gap-3 text-sm text-[#3f4a23]">
                    <div className="flex flex-col items-center gap-1 bg-white/90 rounded-lg p-3 shadow">
                      <span className="text-xs uppercase tracking-[0.12em] text-[#6b744d]">Sum</span>
                      <span className="text-2xl font-bold">{resolvedSum ?? "--"}</span>
                    </div>
                    <div className="flex flex-col items-center gap-1 bg-white/90 rounded-lg p-3 shadow">
                      <span className="text-xs uppercase tracking-[0.12em] text-[#6b744d]">Bet</span>
                      <span className="text-base font-semibold">
                        🐐 {diceResult.betAmount ?? (diceLoading ? "..." : "--")}
                      </span>
                    </div>
                    <div className="flex flex-col items-center gap-1 bg-white/90 rounded-lg p-3 shadow">
                      <span className="text-xs uppercase tracking-[0.12em] text-[#6b744d]">Payout</span>
                      <span className={`text-2xl font-bold ${diceResult.win ? "text-[#3f7d2e]" : "text-[#a12f2f]"}`}>
                        {diceResult.win === undefined
                          ? "--"
                          : diceResult.win
                          ? `+🐐${diceResult.payout}`
                          : `-🐐${diceResult.betAmount ?? 0}`}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-[#d9e5c2] bg-[#f4f8ea] p-4 shadow-inner text-sm text-[#3f4a23]">
                <div className="font-semibold text-[#2f3618] mb-3">How to play Goat Dice</div>
                <div className="grid sm:grid-cols-2 gap-3">
                  {["Place a bet and pick LOW (2–6), SEVEN, or HIGH (8–12).", "Two dice roll together. LOW/HIGH pay 2×; SEVEN pays 5×.", "Winnings pop right back into your 🐐 balance when you win.", "Treat it like a cozy farm game and enjoy the rolls!"]
                    .map((tip, idx) => (
                      <div
                        key={tip}
                        className="flex items-start gap-2 rounded-lg bg-white/80 border border-[#e3ebd2] p-3 shadow-sm"
                      >
                        <span className="text-xl" aria-hidden>🐐</span>
                        <span className="leading-snug">{tip}</span>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-2xl bg-white shadow-lg p-4 sm:p-5 flex flex-col gap-4">
          <div>
            <h3 className="text-lg font-semibold text-[#3b4224]">Leaderboards</h3>
            <p className="text-xs text-[#6b744d]">Top Goat Dice balances and Goat Run highs.</p>
          </div>
          <div className="grid grid-cols-1 gap-4">
                <div className="rounded-xl border border-[#d9e5c2] bg-[#f9fbf2] p-3 shadow-inner">
                  <div className="flex items-center justify-between text-sm font-semibold text-[#3f4a23] mb-2">
                    <span>Goat Dice</span>
                    <span>🐐</span>
                  </div>
                  <div className="divide-y divide-[#e3ebd2]">
                    {stats.goatLeaderboard.map((entry, idx) => (
                      <div key={entry.name} className="flex items-center justify-between py-2 text-sm text-[#3f4a23]">
                        <span className="flex items-center gap-2">
                          <span className="text-[#8db153] font-semibold">#{idx + 1}</span>
                          {entry.name}
                        </span>
                        <span className="font-semibold">🐐 {entry.goats}</span>
                      </div>
                    ))}
                {stats.goatLeaderboard.length === 0 && (
                  <div className="py-2 text-sm text-[#6b744d]">No Goat Dice games yet.</div>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-[#d9e5c2] bg-[#f9fbf2] p-3 shadow-inner">
              <div className="flex items-center justify-between text-sm font-semibold text-[#3f4a23] mb-2">
                <span>Goat Run</span>
                <span>Best</span>
              </div>
              <div className="divide-y divide-[#e3ebd2]">
                {stats.runLeaderboard.map((entry, idx) => (
                  <div key={entry.name} className="flex items-center justify-between py-2 text-sm text-[#3f4a23]">
                    <span className="flex items-center gap-2">
                      <span className="text-[#8db153] font-semibold">#{idx + 1}</span>
                      {entry.name}
                    </span>
                    <span className="font-semibold">{entry.bestRun}</span>
                  </div>
                ))}
                {stats.runLeaderboard.length === 0 && (
                  <div className="py-2 text-sm text-[#6b744d]">No runs recorded yet.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      <style jsx global>{`
        @keyframes dice-shake {
          0% { transform: translate(0, 0) rotate(0deg); }
          20% { transform: translate(-2px, -2px) rotate(-6deg); }
          40% { transform: translate(3px, 2px) rotate(4deg); }
          60% { transform: translate(-3px, 1px) rotate(-3deg); }
          80% { transform: translate(2px, -2px) rotate(5deg); }
          100% { transform: translate(0, 0) rotate(0deg); }
        }

        @keyframes dice-pop {
          0% { transform: scale(0.94); }
          60% { transform: scale(1.04); }
          100% { transform: scale(1); }
        }

        .dice-shake {
          animation: dice-shake 0.6s ease;
        }

        .dice-pop {
          animation: dice-pop 0.4s ease;
        }
      `}</style>
    </div>
  );
}
