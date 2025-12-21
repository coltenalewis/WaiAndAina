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
  reportFlags?: boolean[];
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

function taskBaseName(task: string) {
  return task.split("\n")[0].trim();
}

function splitCellEntries(cell: string) {
  if (!cell.trim()) return [];
  const [firstLine, ...rest] = cell.split("\n");
  const note = rest.join("\n").trim();
  return firstLine
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => (note ? `${t}\n${note}` : t))
    .filter((entry) => !isOffPlaceholder(entry));
}

export default function WorkDashboardPage() {
  const router = useRouter();
  const [name, setName] = useState<string | null>(null);
  const [userType, setUserType] = useState<string | null>(null);
  const [miniLoading, setMiniLoading] = useState(false);
  const [alerts, setAlerts] = useState<string[]>([]);
  const [mySlots, setMySlots] = useState<Slot[]>([]);
  const [myCells, setMyCells] = useState<string[]>([]);

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
      return;
    }
    const normalizedName = name.toLowerCase();
    const snapshotKey = `hub-dashboard-snapshot-${normalizedName}`;

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
          setMySlots([]);
          setMyCells([]);
          return;
        }

        const tasks: MiniTask[] = [];
        const slotList: Slot[] = [];
        const cellList: string[] = [];
        data.slots.forEach((slot, col) => {
          if (isExternalVolunteer && !/weekend/i.test(slot.label)) return;
          const cell = data.cells[rowIndex]?.[col] || "";
          slotList.push(slot);
          cellList.push(cell);
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

        setMySlots(slotList);
        setMyCells(cellList);

        const uniqueTaskNames = Array.from(
          new Set(tasks.map((entry) => taskBaseName(entry.task)))
        ).filter(Boolean);

        const [taskListRes, detailResults] = await Promise.all([
          fetch("/api/task?list=1"),
          Promise.all(
            uniqueTaskNames.map(async (taskName) => {
              const detailRes = await fetch(`/api/task?name=${encodeURIComponent(taskName)}`);
              if (!detailRes.ok) return { name: taskName, status: "", commentCount: 0 };
              const detail = await detailRes.json();
              return {
                name: taskName,
                status: detail.status || "",
                commentCount: Array.isArray(detail.comments) ? detail.comments.length : 0,
              };
            })
          ),
        ]);

        const taskListJson = taskListRes.ok ? await taskListRes.json() : { tasks: [] };
        const statusMap = new Map(
          (taskListJson.tasks || []).map((task: { name: string; status?: string }) => [
            task.name,
            task.status || "",
          ])
        );
        const detailMap = new Map(detailResults.map((item) => [item.name, item]));

        const currentSnapshot = tasks.map((entry) => {
          const base = taskBaseName(entry.task);
          const detail = detailMap.get(base);
          return {
            task: base,
            slot: entry.slot,
            timeRange: entry.timeRange,
            status: detail?.status || statusMap.get(base) || "",
            commentCount: detail?.commentCount || 0,
          };
        });

        const previousRaw = typeof window !== "undefined" ? localStorage.getItem(snapshotKey) : null;
        let previous: { tasks?: any[] } | null = null;
        if (previousRaw) {
          try {
            previous = JSON.parse(previousRaw);
          } catch (err) {
            console.warn("Failed to parse schedule snapshot", err);
          }
        }
        const nextAlerts: string[] = [];

        if (previous?.tasks) {
          const prevMap = new Map(
            previous.tasks.map((task: any) => [task.task, task])
          );

          currentSnapshot.forEach((task) => {
            const prev = prevMap.get(task.task);
            if (!prev) {
              nextAlerts.push(`New task added: ${task.task} (${task.slot}).`);
              return;
            }
            if (prev.status !== task.status) {
              nextAlerts.push(`Status updated: ${task.task} is now "${task.status || "Unassigned"}".`);
            }
            if (task.commentCount > (prev.commentCount || 0)) {
              nextAlerts.push(`New comments on ${task.task}.`);
            }
          });

          previous.tasks.forEach((task: any) => {
            const stillAssigned = currentSnapshot.some((entry) => entry.task === task.task);
            if (!stillAssigned) {
              nextAlerts.push(`Task removed: ${task.task}.`);
            }
          });
        }

        setAlerts(nextAlerts);
        if (typeof window !== "undefined") {
          localStorage.setItem(snapshotKey, JSON.stringify({ tasks: currentSnapshot, updatedAt: Date.now() }));
        }
      } finally {
        setMiniLoading(false);
      }
    }

    loadMiniSchedule();
  }, [isExternalVolunteer, name]);

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-[#d0c9a4] bg-gradient-to-br from-white via-[#f9f6e7] to-[#f1edd8] shadow-sm p-6 flex flex-col gap-3">
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
      <div className="space-y-4">
        <div className="rounded-3xl border border-[#c8c49c] bg-gradient-to-br from-[#fefcf3] via-[#f7f4e6] to-[#e8eccd] p-6 shadow-md">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <span className="text-3xl">📆</span>
              <div className="flex flex-col">
                <span className="text-2xl font-semibold text-[#3b4224]">Open schedule</span>
                <span className="text-xs uppercase tracking-[0.16em] text-[#7a7f54]">Main workspace</span>
              </div>
            </div>
            <Link
              href="/hub"
              className="rounded-full bg-[#8fae4c] px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#f9f9ec] shadow-sm transition hover:bg-[#7e9c44]"
            >
              View full schedule
            </Link>
          </div>
          <p className="mt-3 text-sm text-[#4b5133] leading-relaxed">
            View shifts, tasks, and live updates with status changes, notes, and comments. Your personal schedule preview lives right below.
          </p>

          <div className="mt-4 overflow-auto rounded-xl border border-[#e2dbc0] bg-[#f7f4e6] shadow-inner">
            {miniLoading && (
              <p className="p-4 text-sm text-[#7a7f54]">Refreshing your schedule…</p>
            )}
            {!miniLoading && mySlots.length === 0 && (
              <p className="p-4 text-sm text-[#4b5133]">
                No schedule found for you yet.
              </p>
            )}
            {!miniLoading && mySlots.length > 0 && (
              <table className="min-w-full border-collapse text-sm">
                <thead className="bg-[#efe7cf]">
                  <tr>
                    <th className="min-w-[140px] border border-[#e0d6b8] px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-[#6b7247]">
                      Name
                    </th>
                    {mySlots.map((slot) => (
                      <th
                        key={slot.id}
                        className="min-w-[140px] border border-[#e0d6b8] px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-[#6b7247]"
                      >
                        <div className="flex flex-col gap-1">
                          <span>{slot.label}</span>
                          {slot.timeRange && (
                            <span className="text-[10px] text-[#7a7f54] normal-case">
                              {slot.timeRange}
                            </span>
                          )}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="bg-white">
                    <td className="border border-[#e0d6b8] px-3 py-2 text-sm font-semibold text-[#3b4224]">
                      {name || "You"}
                    </td>
                    {myCells.map((cell, idx) => {
                      const entries = splitCellEntries(cell);
                      return (
                        <td
                          key={`${mySlots[idx]?.id || idx}-cell`}
                          className="border border-[#e0d6b8] px-3 py-2 align-top text-[12px] text-[#4b5133]"
                        >
                          {entries.length === 0 ? (
                            <span className="text-[11px] italic text-[#7a7f54]">
                              —
                            </span>
                          ) : (
                            <ul className="space-y-1">
                              {entries.map((entry, entryIdx) => (
                                <li key={`${entry}-${entryIdx}`} className="rounded-md bg-white/70 px-2 py-1">
                                  <span className="font-semibold text-[#3b4224]">
                                    {taskBaseName(entry)}
                                  </span>
                                  {entry.split("\n")[1] && (
                                    <span className="mt-1 block whitespace-pre-line text-[11px] text-[#4b5133]">
                                      {entry.split("\n").slice(1).join("\n")}
                                    </span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          {quickLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="group rounded-2xl border border-[#d0c9a4] bg-white/80 p-5 shadow-sm hover:-translate-y-0.5 transition"
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

        {alerts.length > 0 && (
          <div className="rounded-2xl border border-[#d0c9a4] bg-white/80 p-5 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-lg font-semibold text-[#3b4224]">Schedule updates</h3>
              <span className="text-[11px] uppercase tracking-[0.12em] text-[#7a7f54]">
                Since last visit
              </span>
            </div>
            <ul className="mt-3 space-y-2 text-sm text-[#4b5133]">
              {alerts.map((alert, idx) => (
                <li key={`${alert}-${idx}`} className="flex items-start gap-2">
                  <span className="mt-1 h-2 w-2 rounded-full bg-[#8fae4c]" />
                  <span>{alert}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
