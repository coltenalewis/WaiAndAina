"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { loadSession } from "@/lib/session";

type Slot = {
  id: string;
  label: string;
  timeRange: string;
  isMeal: boolean;
};

type ScheduleResponse = {
  people: string[];
  slots: Slot[];
  cells: string[][];
  scheduleDate?: string;
  reportTime?: string;
  taskResetTime?: string;
};

type MiniTask = {
  slot: string;
  timeRange: string;
  task: string;
};

const quickLinks = [
  {
    href: "/hub",
    title: "Schedule",
    description: "View shifts, tasks, and live updates with status and comments.",
    icon: "📆",
  },
  {
    href: "/hub/request",
    title: "Requests",
    description: "Submit or edit supply and task requests, plus follow comments.",
    icon: "📝",
  },
  {
    href: "/hub/goat",
    title: "Arcade",
    description: "Relax with Goat Run or Goat Dice and see team leaderboards.",
    icon: "🐐",
  },
  {
    href: "/hub/guides/how-to",
    title: "Guides",
    description: "Browse the how-to library for step-by-step farm workflows.",
    icon: "📘",
  },
];

function isOffPlaceholder(task: string) {
  const base = task.split("\n")[0].trim();
  return base === "-";
}

export default function WorkDashboardPage() {
  const router = useRouter();
  const [name, setName] = useState<string | null>(null);
  const [userType, setUserType] = useState<string | null>(null);
  const [miniTasks, setMiniTasks] = useState<MiniTask[]>([]);
  const [miniLoading, setMiniLoading] = useState(false);

  useEffect(() => {
    const session = loadSession();
    if (!session?.name) {
      router.replace("/");
      return;
    }
    setName(session.name);
    setUserType(session.userType ?? null);
  }, [router]);

  const isExternalVolunteer = useMemo(
    () => (userType || "").toLowerCase() === "external volunteer",
    [userType]
  );

  useEffect(() => {
    if (!name) {
      setMiniTasks([]);
      return;
    }
    const normalizedName = name.toLowerCase();

    async function loadMiniSchedule() {
      setMiniLoading(true);
      try {
        const res = await fetch("/api/schedule");
        if (!res.ok) return;
        const data: ScheduleResponse = await res.json();
        const rowIndex = data.people.findIndex(
          (p) => p.toLowerCase() === normalizedName
        );
        if (rowIndex === -1) {
          setMiniTasks([]);
          return;
        }

        const tasks: MiniTask[] = [];
        data.slots.forEach((slot, col) => {
          if (isExternalVolunteer && !/weekend/i.test(slot.label)) return;
          const cell = data.cells[rowIndex]?.[col] || "";
          if (!cell.trim()) return;
          const [firstLine, ...rest] = cell.split("\n");
          const note = rest.join("\n").trim();
          const entries = firstLine
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
            .map((t) => (note ? `${t}\n${note}` : t))
            .filter((entry) => !isOffPlaceholder(entry));
          entries.forEach((entry) => {
            tasks.push({
              slot: slot.label,
              timeRange: slot.timeRange,
              task: entry,
            });
          });
        });

        setMiniTasks(tasks.slice(0, 6));
      } finally {
        setMiniLoading(false);
      }
    }

    loadMiniSchedule();
  }, [isExternalVolunteer, name]);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[#d0c9a4] bg-white shadow-sm p-6 flex flex-col gap-3">
        <p className="text-xs uppercase tracking-[0.2em] text-[#7a7f54]">Work dashboard</p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold text-[#3b4224]">Welcome{ name ? `, ${name.split(" ")[0]}` : "" }</h1>
          <span className="rounded-full bg-[#eef2d9] text-[#4f5730] px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em]">
            Central Hub
          </span>
        </div>
        <p className="text-sm text-[#4b5133] max-w-3xl leading-relaxed">
          Use the shortcuts below to jump between schedules, requests, guides, and games. The quick toggles above the page also let you swap views instantly.
        </p>
      </div>
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            {quickLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="group rounded-2xl border border-[#d0c9a4] bg-[#f7f4e6] p-5 shadow-sm hover:-translate-y-0.5 transition"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{link.icon}</span>
                  <div className="flex flex-col">
                    <span className="text-lg font-semibold text-[#3b4224]">{link.title}</span>
                    <span className="text-xs uppercase tracking-[0.14em] text-[#7a7f54]">Open {link.title}</span>
                  </div>
                </div>
                <p className="mt-3 text-sm text-[#4b5133] leading-relaxed">{link.description}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[#5d7f3b] underline underline-offset-4">
                  Go to {link.title} →
                </span>
              </Link>
            ))}
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-[#d0c9a4] bg-white p-5 shadow-sm">
              <h3 className="text-lg font-semibold text-[#3b4224]">Today at a glance</h3>
              <p className="mt-2 text-sm text-[#4b5133] leading-relaxed">
                Check the schedule view to see live task boxes, meal shifts, and comments. Status updates sync with Notion instantly.
              </p>
            </div>
            <div className="rounded-2xl border border-[#d0c9a4] bg-white p-5 shadow-sm">
              <h3 className="text-lg font-semibold text-[#3b4224]">Requests</h3>
              <p className="mt-2 text-sm text-[#4b5133] leading-relaxed">
                Submit new needs, edit pending requests, and track approvals. Comment threads mirror task comment handling.
              </p>
            </div>
            <div className="rounded-2xl border border-[#d0c9a4] bg-white p-5 shadow-sm">
              <h3 className="text-lg font-semibold text-[#3b4224]">Arcade rewards</h3>
              <p className="mt-2 text-sm text-[#4b5133] leading-relaxed">
                Earn goats in Goat Run and bet them in Goat Dice. Leaderboards update automatically after each game.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-[#d0c9a4] bg-white p-5 shadow-sm h-full flex flex-col">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-[#7a7f54]">Mini schedule</p>
              <h3 className="text-lg font-semibold text-[#3b4224]">Your tasks</h3>
            </div>
            {miniLoading && (
              <span className="text-[11px] text-[#7a7f54]">Refreshing...</span>
            )}
          </div>
          <div className="mt-3 space-y-3 overflow-y-auto max-h-[420px] pr-1">
            {miniTasks.length === 0 && !miniLoading && (
              <p className="text-sm text-[#4b5133] leading-relaxed">
                No tasks found in your schedule preview.
              </p>
            )}
            {miniTasks.map((item, idx) => (
              <div
                key={`${item.slot}-${idx}-${item.task}`}
                className="rounded-xl border border-[#e2dbc0] bg-[#f7f4e6] px-4 py-3 shadow-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs uppercase tracking-[0.14em] text-[#6b7247]">
                    {item.slot}
                  </span>
                  <span className="text-[11px] text-[#7a7f54]">{item.timeRange}</span>
                </div>
                <p className="mt-2 text-sm font-semibold text-[#3b4224] leading-snug">
                  {item.task.split("\n")[0]}
                </p>
                {item.task.split("\n")[1] && (
                  <p className="mt-1 text-xs text-[#4b5133] whitespace-pre-line">
                    {item.task.split("\n").slice(1).join("\n")}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
