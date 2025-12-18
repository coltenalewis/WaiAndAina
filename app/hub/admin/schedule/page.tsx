"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { loadSession } from "@/lib/session";

type Slot = { id: string; label: string; timeRange?: string; isMeal?: boolean };
type ScheduleResponse = {
  people: string[];
  slots: Slot[];
  cells: string[][];
  scheduleDate?: string;
  message?: string;
};
type TaskCatalogItem = {
  id: string;
  name: string;
  type?: string;
  typeColor?: string;
  status?: string;
};
type TaskTypeOption = { name: string; color: string };
type StatusOption = { name: string; color: string };
type TaskDetail = { name: string; description: string; taskType?: { name: string; color: string } };
type DragPayload = {
  taskName: string;
  fromPerson?: string;
  fromSlotId?: string;
  fromIndex?: number;
};
type CellContent = { tasks: string[]; note: string };
type ChatMessage = { role: "user" | "assistant"; content: string; status?: "thinking" };

const DRAG_DATA_TYPE = "application/json/task";

function parseCell(value: string): CellContent {
  if (!value?.trim()) return { tasks: [], note: "" };
  const [firstLine, ...rest] = value.split("\n");
  const note = rest.join("\n").trim();
  const tasks = firstLine
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  return { tasks, note };
}

function serializeCell(content: CellContent): string {
  const line = content.tasks.join(", ").trim();
  const note = content.note.trim();
  const parts = [] as string[];
  if (line) parts.push(line);
  if (note) parts.push(note);
  return parts.join("\n");
}

function taskBaseName(task: string): string {
  return task.split("\n")[0].trim();
}

function typeColorClasses(color?: string) {
  const map: Record<string, string> = {
    default: "bg-[#f7f7ef] border-[#e3e6d2] text-[#3f4630]",
    gray: "bg-slate-50 border-slate-200 text-slate-800",
    brown: "bg-amber-50 border-amber-200 text-amber-900",
    orange: "bg-orange-50 border-orange-200 text-orange-900",
    yellow: "bg-amber-100 border-amber-200 text-amber-900",
    green: "bg-green-50 border-green-200 text-green-900",
    blue: "bg-sky-50 border-sky-200 text-sky-900",
    purple: "bg-violet-50 border-violet-200 text-violet-900",
    pink: "bg-pink-50 border-pink-200 text-pink-900",
    red: "bg-rose-50 border-rose-200 text-rose-900",
  };

  return map[color || "default"] || map.default;
}

function safeIndex(length: number, index?: number) {
  if (index === undefined || Number.isNaN(index)) return length;
  return Math.min(Math.max(index, 0), length);
}

export default function AdminScheduleEditorPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [scheduleData, setScheduleData] = useState<ScheduleResponse | null>(null);
  const [taskBank, setTaskBank] = useState<TaskCatalogItem[]>([]);
  const [taskTypes, setTaskTypes] = useState<TaskTypeOption[]>([]);
  const [statusOptions, setStatusOptions] = useState<StatusOption[]>([]);
  const [taskSearch, setTaskSearch] = useState("");
  const [taskTypeFilter, setTaskTypeFilter] = useState("");
  const [taskStatusFilter, setTaskStatusFilter] = useState("");
  const [selectedCell, setSelectedCell] = useState<{ person: string; slotId: string; slotLabel: string } | null>(null);
  const [customTask, setCustomTask] = useState("");
  const [draggingTask, setDraggingTask] = useState<DragPayload | null>(null);
  const [pendingInsert, setPendingInsert] = useState<{ person: string; slotId: string; index: number } | null>(null);
  const [pendingCells, setPendingCells] = useState<Set<string>>(new Set());
  const [taskDetail, setTaskDetail] = useState<TaskDetail | null>(null);
  const [taskDetailLoading, setTaskDetailLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: "Hi! I can help you massage schedules, juggle tasks, or explain what belongs where.",
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [dockPosition, setDockPosition] = useState({ x: 24, y: 140 });
  const [isDraggingDock, setIsDraggingDock] = useState(false);
  const dockOffsetRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const session = loadSession();
    if (!session || !session.name) {
      router.replace("/");
      return;
    }

    const userType = (session.userType || "").toLowerCase();
    if (userType === "admin") {
      setAuthorized(true);
    } else {
      setMessage("You need admin access to adjust the schedule.");
    }
  }, [router]);

  useEffect(() => {
    if (!authorized) return;

    const loadAll = async () => {
      try {
        const [scheduleRes, taskRes, typeRes] = await Promise.all([
          fetch("/api/schedule"),
          fetch("/api/task?list=1"),
          fetch("/api/task-types"),
        ]);

        if (scheduleRes.ok) {
          setScheduleData(await scheduleRes.json());
        }
        if (taskRes.ok) {
          const json = await taskRes.json();
          setTaskBank(json.tasks || []);
        }
        if (typeRes.ok) {
          const json = await typeRes.json();
          setTaskTypes(json.types || []);
          setStatusOptions(json.statuses || []);
        }
      } catch (err) {
        console.error("Failed to load schedule editor data", err);
        setMessage("Could not load schedule tools. Please refresh.");
      }
    };

    loadAll();
  }, [authorized]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setDockPosition((prev) => ({ x: Math.max(12, window.innerWidth - 420), y: prev.y }));
  }, []);

  const filteredTaskBank = useMemo(() => {
    return taskBank.filter((task) => {
      const matchesSearch = task.name.toLowerCase().includes(taskSearch.toLowerCase());
      const matchesType = taskTypeFilter
        ? (task.type || "").toLowerCase() === taskTypeFilter.toLowerCase()
        : true;
      const matchesStatus = taskStatusFilter
        ? (task.status || "").toLowerCase() === taskStatusFilter.toLowerCase()
        : true;
      return matchesSearch && matchesType && matchesStatus;
    });
  }, [taskBank, taskSearch, taskStatusFilter, taskTypeFilter]);

  const scheduleTitle = useMemo(() => {
    if (!scheduleData?.scheduleDate) return "Schedule editor";
    return `Editing ${scheduleData.scheduleDate}`;
  }, [scheduleData?.scheduleDate]);

  const findCoord = useCallback(
    (person: string | undefined, slotId: string | undefined, data: ScheduleResponse | null) => {
      if (!person || !slotId || !data) return null;
      const row = data.people.indexOf(person);
      const col = data.slots.findIndex((s) => s.id === slotId);
      if (row < 0 || col < 0) return null;
      return { row, col };
    },
    []
  );

  const persistCell = useCallback(async (person: string, slotId: string, content: CellContent) => {
    const key = `${person}-${slotId}`;
    setPendingCells((prev) => new Set(prev).add(key));
    try {
      const res = await fetch("/api/schedule/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ person, slotId, replaceValue: serializeCell(content) }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Failed to save schedule update");
      }
    } catch (err: any) {
      console.error(err);
      setMessage(err?.message || "Unable to save this drop. Please retry.");
    } finally {
      setPendingCells((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }, []);

  const handleTaskMove = useCallback(
    (payload: DragPayload, target: { person: string; slotId: string; slotLabel: string; targetIndex?: number }) => {
      if (!payload.taskName) return;
      const updates: { person: string; slotId: string; content: CellContent }[] = [];

      setScheduleData((prev) => {
        if (!prev) return prev;
        const nextCells = prev.cells.map((row) => [...row]);

        const targetCoord = findCoord(target.person, target.slotId, prev);
        if (!targetCoord) return prev;
        const targetContent = parseCell(nextCells[targetCoord.row][targetCoord.col]);

        let insertionIndex = safeIndex(targetContent.tasks.length, target.targetIndex);

        if (payload.fromPerson && payload.fromSlotId) {
          const sourceCoord = findCoord(payload.fromPerson, payload.fromSlotId, prev);
          if (sourceCoord) {
            const sourceContent = parseCell(nextCells[sourceCoord.row][sourceCoord.col]);
            const idx = payload.fromIndex ?? sourceContent.tasks.findIndex((t) => taskBaseName(t) === payload.taskName);
            if (idx > -1) {
              sourceContent.tasks.splice(idx, 1);
              if (sourceCoord.row === targetCoord.row && sourceCoord.col === targetCoord.col && insertionIndex > idx) {
                insertionIndex -= 1;
              }
              nextCells[sourceCoord.row][sourceCoord.col] = serializeCell(sourceContent);
              updates.push({ person: payload.fromPerson, slotId: payload.fromSlotId, content: sourceContent });
            }
          }
        }

        targetContent.tasks.splice(insertionIndex, 0, payload.taskName);
        nextCells[targetCoord.row][targetCoord.col] = serializeCell(targetContent);
        updates.push({ person: target.person, slotId: target.slotId, content: targetContent });

        return { ...prev, cells: nextCells };
      });

      updates.forEach((u) => persistCell(u.person, u.slotId, u.content));
      setSelectedCell({ person: target.person, slotId: target.slotId, slotLabel: target.slotLabel });
      setPendingInsert(null);
      setDraggingTask(null);
    },
    [findCoord, persistCell]
  );

  const removeTaskFromCell = useCallback(
    (cell: { person: string; slotId: string }, task: string, index?: number) => {
      const updates: { person: string; slotId: string; content: CellContent }[] = [];

      setScheduleData((prev) => {
        if (!prev) return prev;
        const coord = findCoord(cell.person, cell.slotId, prev);
        if (!coord) return prev;
        const nextCells = prev.cells.map((row) => [...row]);
        const content = parseCell(nextCells[coord.row][coord.col]);
        const idx = index ?? content.tasks.findIndex((t) => taskBaseName(t) === taskBaseName(task));
        if (idx < 0) return prev;

        content.tasks.splice(idx, 1);
        nextCells[coord.row][coord.col] = serializeCell(content);
        updates.push({ person: cell.person, slotId: cell.slotId, content });

        return { ...prev, cells: nextCells };
      });

      updates.forEach((u) => persistCell(u.person, u.slotId, u.content));
    },
    [findCoord, persistCell]
  );

  const handleDropEvent = useCallback(
    (e: React.DragEvent, person: string, slot: Slot, targetIndex?: number) => {
      e.preventDefault();
      const jsonPayload = e.dataTransfer.getData(DRAG_DATA_TYPE);
      const textPayload = e.dataTransfer.getData("text/task-name");
      let parsed: DragPayload = { taskName: textPayload };

      if (jsonPayload) {
        try {
          parsed = { ...parsed, ...JSON.parse(jsonPayload) };
        } catch (err) {
          console.error("Failed to parse drag payload", err);
        }
      }

      if (!parsed.taskName) return;
      handleTaskMove(parsed, { person, slotId: slot.id, slotLabel: slot.label, targetIndex });
    },
    [handleTaskMove]
  );

  const getCellValue = (cell: { person: string; slotId: string } | null) => {
    if (!cell || !scheduleData) return null;
    const coord = findCoord(cell.person, cell.slotId, scheduleData);
    if (!coord) return null;
    const value = scheduleData.cells?.[coord.row]?.[coord.col] || "";
    return { value, content: parseCell(value) };
  };

  const handleCustomAdd = () => {
    if (!customTask.trim() || !selectedCell) return;
    const existing = getCellValue(selectedCell)?.content.tasks.length || 0;
    handleTaskMove(
      { taskName: customTask.trim() },
      { ...selectedCell, targetIndex: existing }
    );
    setCustomTask("");
  };

  const loadTaskDetail = async (taskName: string) => {
    const base = taskBaseName(taskName);
    if (!base) return;
    setTaskDetailLoading(true);
    try {
      const res = await fetch(`/api/task?name=${encodeURIComponent(base)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load task details");
      setTaskDetail({ name: json.name || base, description: json.description || "", taskType: json.taskType });
    } catch (err: any) {
      console.error(err);
      setMessage(err?.message || "Unable to load that task right now.");
      setTaskDetail(null);
    } finally {
      setTaskDetailLoading(false);
    }
  };

  const refreshSchedule = async () => {
    try {
      const res = await fetch("/api/schedule");
      if (res.ok) {
        const json = await res.json();
        setScheduleData(json);
        setMessage(null);
      }
    } catch (err) {
      console.error("Refresh failed", err);
      setMessage("Unable to refresh schedule. Try again soon.");
    }
  };

  const handleChatSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = chatInput.trim();
    if (!trimmed) return;
    const nextMessages = [...chatMessages, { role: "user", content: trimmed }, { role: "assistant", content: "", status: "thinking" }];
    setChatMessages(nextMessages);
    setChatInput("");
    setChatLoading(true);

    try {
      const res = await fetch("/api/admin-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages.filter((m) => m.role !== "assistant" || !m.status) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Chat request failed");
      setChatMessages((prev) => {
        const clone = [...prev];
        clone[clone.length - 1] = { role: "assistant", content: json.reply || "I couldn’t find an answer, but I’m here!" };
        return clone;
      });
    } catch (err: any) {
      console.error(err);
      setChatMessages((prev) => {
        const clone = [...prev];
        clone[clone.length - 1] = { role: "assistant", content: err?.message || "The assistant is busy. Try again." };
        return clone;
      });
    } finally {
      setChatLoading(false);
    }
  };

  useEffect(() => {
    if (!isDraggingDock) return undefined;

    const handleMove = (event: PointerEvent) => {
      const x = event.clientX - dockOffsetRef.current.x;
      const y = event.clientY - dockOffsetRef.current.y;
      const maxX = typeof window !== "undefined" ? window.innerWidth - 260 : x;
      const maxY = typeof window !== "undefined" ? window.innerHeight - 100 : y;
      setDockPosition({ x: Math.max(8, Math.min(x, maxX)), y: Math.max(8, Math.min(y, maxY)) });
    };

    const handleUp = () => setIsDraggingDock(false);

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [isDraggingDock]);

  if (!authorized) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10 text-center text-sm text-[#7a7f54]">
        {message || "Checking admin access…"}
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.14em] text-[#7a7f54]">Admin schedule</p>
          <h1 className="text-2xl font-semibold text-[#314123]">{scheduleTitle}</h1>
          <p className="text-sm text-[#5f5a3b]">
            Drag tasks anywhere, reorder inside a shift, and keep context with the built-in assistant.
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#6a6c4d]">
            <button
              type="button"
              onClick={refreshSchedule}
              className="rounded-md border border-[#d0c9a4] bg-white px-3 py-1 font-semibold uppercase tracking-[0.08em] text-[#314123] shadow-sm transition hover:bg-[#f1edd8]"
            >
              Refresh schedule
            </button>
            <Link
              href="/hub/admin"
              className="rounded-md border border-[#d0c9a4] bg-[#f6f1dd] px-3 py-1 font-semibold uppercase tracking-[0.08em] text-[#4b5133] shadow-sm transition hover:bg-[#ede6c6]"
            >
              Back to admin
            </Link>
          </div>
        </div>
        <div className="rounded-xl border border-[#d0c9a4] bg-white/80 px-4 py-3 text-sm text-[#4b5133] shadow-sm">
          <p className="font-semibold">Quick tips</p>
          <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-[#6a6c4d]">
            <li>Drop between tasks to reorder within the same shift.</li>
            <li>Use the floating task dock to assign from anywhere.</li>
            <li>The side chat uses a lightweight GPT-3.5 assistant.</li>
          </ul>
        </div>
      </div>

      {message && (
        <div className="rounded-xl border border-[#e2d7b5] bg-[#f9f6e7] px-4 py-3 text-sm text-[#4b5133] shadow-sm">
          {message}
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[2fr_minmax(340px,1fr)]">
        <div className="rounded-2xl border border-[#d0c9a4] bg-white/70 p-4 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-[#314123]">Schedule canvas</h2>
              <p className="text-xs text-[#6a6c4d]">Drag from anywhere, drop anywhere. Saving happens in the background.</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-[#6a6c4d]">
              <span className="inline-flex items-center gap-1 rounded-full bg-[#f6f1dd] px-3 py-1 font-semibold text-[#4b5133]">
                {scheduleData?.slots.length || 0} shifts
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-[#f0f4de] px-3 py-1 font-semibold text-[#4b5133]">
                {scheduleData?.people.length || 0} teammates
              </span>
            </div>
          </div>

          <div className="mt-3 overflow-auto rounded-xl border border-[#e2d7b5] bg-[#faf7eb] shadow-inner">
            <table className="min-w-full border-collapse text-sm">
              <thead className="bg-[#e5e7c5]">
                <tr>
                  <th className="min-w-[160px] border border-[#d1d4aa] px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-[#5d7f3b]">
                    Person
                  </th>
                  {scheduleData?.slots.map((slot) => (
                    <th
                      key={slot.id}
                      className="border border-[#d1d4aa] px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-[#5d7f3b]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div>{slot.label}</div>
                          {slot.timeRange && (
                            <div className="text-[10px] text-[#7a7f54] normal-case">{slot.timeRange}</div>
                          )}
                        </div>
                        {slot.isMeal && <span className="text-lg">🍽️</span>}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {scheduleData?.people.map((person, rowIdx) => (
                  <tr key={person} className={rowIdx % 2 === 0 ? "bg-[#faf8ea]" : "bg-[#f4f2df]"}>
                    <td className="border border-[#d1d4aa] px-3 py-2 align-top text-sm font-semibold text-[#4f5730]">
                      <div className="flex items-center justify-between gap-2">
                        <span>{person}</span>
                        <span className="text-[10px] text-[#7a7f54]">{rowIdx + 1}</span>
                      </div>
                    </td>
                    {scheduleData.slots.map((slot, colIdx) => {
                      const cell = scheduleData.cells?.[rowIdx]?.[colIdx] || "";
                      const content = parseCell(cell);
                      const isSelected =
                        selectedCell?.person === person && selectedCell?.slotId === slot.id;
                      const saving = pendingCells.has(`${person}-${slot.id}`);

                      const dropLine = (index: number) => (
                        <div
                          key={`${person}-${slot.id}-drop-${index}`}
                          onDragOver={(e) => {
                            e.preventDefault();
                            setPendingInsert({ person, slotId: slot.id, index });
                          }}
                          onDrop={(e) => handleDropEvent(e, person, slot, index)}
                          className={`h-2 rounded-full transition-all duration-150 ${
                            pendingInsert?.person === person && pendingInsert.slotId === slot.id && pendingInsert.index === index
                              ? "bg-[#c8d99a] shadow-[0_0_0_2px_rgba(200,217,154,0.6)]"
                              : "bg-transparent"
                          }`}
                        />
                      );

                      return (
                        <td
                          key={`${person}-${slot.id}`}
                          className={`border border-[#d1d4aa] p-2 align-top transition-colors duration-150 ${
                            isSelected ? "bg-[#f0f4de]" : ""
                          } ${saving ? "animate-pulse" : ""}`}
                          onClick={() => setSelectedCell({ person, slotId: slot.id, slotLabel: slot.label })}
                        >
                          <div className="flex h-full w-full flex-col gap-2">
                            {dropLine(0)}
                            {content.tasks.map((task, idx) => {
                              const base = taskBaseName(task);
                              const meta = taskBank.find((t) => t.name === base);
                              const isDraggingThis =
                                draggingTask?.taskName === base &&
                                draggingTask?.fromPerson === person &&
                                draggingTask?.fromSlotId === slot.id;

                              return (
                                <React.Fragment key={`${person}-${slot.id}-${task}-${idx}`}>
                                  <button
                                    type="button"
                                    draggable
                                    onDragStart={(e) => {
                                      setDraggingTask({ taskName: base, fromPerson: person, fromSlotId: slot.id, fromIndex: idx });
                                      e.dataTransfer.setData("text/task-name", base);
                                      e.dataTransfer.setData(DRAG_DATA_TYPE, JSON.stringify({
                                        taskName: base,
                                        fromPerson: person,
                                        fromSlotId: slot.id,
                                        fromIndex: idx,
                                      }));
                                      e.dataTransfer.effectAllowed = "move";
                                    }}
                                    onDragEnd={() => {
                                      setDraggingTask(null);
                                      setPendingInsert(null);
                                    }}
                                    onClick={() => {
                                      setSelectedCell({ person, slotId: slot.id, slotLabel: slot.label });
                                      loadTaskDetail(base);
                                    }}
                                    className={`flex w-full flex-col gap-2 rounded-lg border p-2 text-left text-[11px] leading-snug shadow-sm transition duration-150 ease-out focus:outline-none focus:ring-2 focus:ring-[#8fae4c] ${typeColorClasses(
                                      meta?.typeColor
                                    )} ${isDraggingThis ? "scale-[1.02] shadow-md ring-2 ring-[#c8d99a]" : "hover:-translate-y-[1px]"}`}
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <span className="font-semibold">{base}</span>
                                      {meta?.status && (
                                        <span className="rounded-full bg-white/80 px-2 py-[1px] text-[9px] font-semibold text-[#4f4f31]">
                                          {meta.status}
                                        </span>
                                      )}
                                    </div>
                                    {content.note && (
                                      <p className="text-[11px] text-[#4f4b33] opacity-90">{content.note}</p>
                                    )}
                                  </button>
                                  {dropLine(idx + 1)}
                                </React.Fragment>
                              );
                            })}

                            {!content.tasks.length && (
                              <div
                                onDragOver={(e) => {
                                  e.preventDefault();
                                  setPendingInsert({ person, slotId: slot.id, index: 0 });
                                }}
                                onDrop={(e) => handleDropEvent(e, person, slot, 0)}
                                className="flex min-h-[68px] items-center justify-center rounded-md border border-dashed border-[#d0c9a4] bg-white/60 text-[11px] italic text-[#7a7f54]"
                              >
                                Drop tasks here
                              </div>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {!scheduleData?.people?.length && (
                  <tr>
                    <td
                      colSpan={(scheduleData?.slots?.length || 0) + 1}
                      className="px-3 py-4 text-center text-sm text-[#7a7f54]"
                    >
                      No schedule found. Try refreshing.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="relative space-y-4">
          <div
            className="fixed z-30 w-[320px] max-w-full rounded-2xl border border-[#d0c9a4] bg-white/90 shadow-lg backdrop-blur"
            style={{ left: dockPosition.x, top: dockPosition.y }}
          >
            <div
              className="flex cursor-grab items-center justify-between gap-2 rounded-t-2xl bg-[#f0f4de] px-3 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-[#4b5133]"
              onPointerDown={(e) => {
                e.preventDefault();
                setIsDraggingDock(true);
                dockOffsetRef.current = { x: e.clientX - dockPosition.x, y: e.clientY - dockPosition.y };
              }}
            >
              <span>Task dock</span>
              <button
                type="button"
                onClick={() => setDockPosition({ x: Math.max(12, typeof window !== "undefined" ? window.innerWidth - 420 : 24), y: 140 })}
                className="rounded-md border border-[#d0c9a4] bg-white px-2 py-[2px] text-[10px] font-semibold text-[#4b5133] hover:bg-[#f6f1dd]"
              >
                Reset
              </button>
            </div>
            <div className="space-y-2 p-3 text-sm">
              <div className="grid gap-2 md:grid-cols-2">
                <input
                  value={taskSearch}
                  onChange={(e) => setTaskSearch(e.target.value)}
                  placeholder="Search tasks"
                  className="w-full rounded-md border border-[#d0c9a4] px-2 py-2 text-sm focus:border-[#8fae4c] focus:outline-none"
                />
                <select
                  value={taskTypeFilter}
                  onChange={(e) => setTaskTypeFilter(e.target.value)}
                  className="w-full rounded-md border border-[#d0c9a4] px-2 py-2 text-sm focus:border-[#8fae4c] focus:outline-none"
                >
                  <option value="">All types</option>
                  {taskTypes.map((opt) => (
                    <option key={opt.name} value={opt.name}>
                      {opt.name}
                    </option>
                  ))}
                </select>
              </div>
              <select
                value={taskStatusFilter}
                onChange={(e) => setTaskStatusFilter(e.target.value)}
                className="w-full rounded-md border border-[#d0c9a4] px-2 py-2 text-sm focus:border-[#8fae4c] focus:outline-none"
              >
                <option value="">All statuses</option>
                {statusOptions.map((opt) => (
                  <option key={opt.name} value={opt.name}>
                    {opt.name}
                  </option>
                ))}
              </select>

              <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                {filteredTaskBank.map((task) => (
                  <button
                    key={task.id}
                    draggable
                    onDragStart={(e) => {
                      setDraggingTask({ taskName: task.name });
                      e.dataTransfer.setData("text/task-name", task.name);
                      e.dataTransfer.setData(DRAG_DATA_TYPE, JSON.stringify({ taskName: task.name }));
                      e.dataTransfer.effectAllowed = "copyMove";
                    }}
                    onDragEnd={() => {
                      setDraggingTask(null);
                      setPendingInsert(null);
                    }}
                    onClick={() => loadTaskDetail(task.name)}
                    className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm text-[#2f3b21] shadow-sm transition hover:-translate-y-[1px] hover:border-[#9fb668] ${typeColorClasses(
                      task.typeColor
                    )}`}
                  >
                    <div>
                      <div className="font-semibold">{task.name}</div>
                      <div className="text-[11px] text-[#5f5a3b]">
                        {task.type || "Uncategorized"}
                        {task.status ? ` • ${task.status}` : ""}
                      </div>
                    </div>
                    <span className="text-lg">🐐</span>
                  </button>
                ))}
                {!filteredTaskBank.length && (
                  <p className="text-[12px] text-[#7a7f54]">No tasks loaded yet.</p>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[#d0c9a4] bg-white/80 p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-[#314123]">Selected slot</h3>
            {selectedCell ? (
              <div className="mt-2 space-y-2 text-sm text-[#4b5133]">
                <p className="text-[12px] text-[#6b6d4b]">
                  {selectedCell.person} • {selectedCell.slotLabel}
                </p>
                <div className="space-y-1">
                  {getCellValue(selectedCell)?.content.tasks.map((task, idx) => (
                    <div
                      key={`${task}-${idx}`}
                      className="flex items-center justify-between rounded-md border border-[#e2d7b5] bg-[#f6f1dd] px-2 py-1"
                    >
                      <button
                        type="button"
                        onClick={() => loadTaskDetail(task)}
                        className="text-[12px] font-semibold text-[#2f3b21] underline-offset-2 hover:underline"
                      >
                        {task}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeTaskFromCell(selectedCell, task, idx)}
                        className="text-[11px] font-semibold text-[#a05252] hover:underline"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  {!getCellValue(selectedCell)?.content.tasks.length && (
                    <p className="text-[12px] text-[#7a7f54]">No tasks yet. Drag one in or add below.</p>
                  )}
                </div>
                <div className="space-y-1">
                  <label className="text-[12px] text-[#5f5a3b]">Add a custom task</label>
                  <div className="flex items-center gap-2">
                    <input
                      value={customTask}
                      onChange={(e) => setCustomTask(e.target.value)}
                      className="flex-1 rounded-md border border-[#d0c9a4] px-2 py-2 text-sm focus:border-[#8fae4c] focus:outline-none"
                      placeholder="e.g., Cow Milking"
                    />
                    <button
                      type="button"
                      onClick={handleCustomAdd}
                      className="rounded-md bg-[#8fae4c] px-3 py-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-[#f9f9ec] shadow-sm transition hover:bg-[#7e9c44]"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-[12px] text-[#7a7f54]">Select a cell to edit tasks.</p>
            )}
          </div>

          <div className="rounded-2xl border border-[#d0c9a4] bg-white/80 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#314123]">AI side chat</h3>
              <span className="text-[11px] text-[#6b6d4b]">Powered by GPT-3.5</span>
            </div>
            <div className="mt-3 max-h-[320px] space-y-2 overflow-y-auto pr-1 text-sm">
              {chatMessages.map((msg, idx) => (
                <div
                  key={`${msg.role}-${idx}`}
                  className={`flex flex-col gap-1 rounded-lg border px-3 py-2 shadow-sm ${
                    msg.role === "user"
                      ? "border-[#c4d48c] bg-[#f4f8e6] text-[#394628]"
                      : "border-[#d0c9a4] bg-white text-[#3f4630]"
                  }`}
                >
                  <span className="text-[10px] uppercase tracking-[0.1em] text-[#7a7f54]">{msg.role}</span>
                  <p className="whitespace-pre-line">{msg.content || "Thinking…"}</p>
                  {msg.status === "thinking" && (
                    <div className="flex items-center gap-1 text-[11px] text-[#7a7f54]">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-[#8fae4c]" />
                      <span>Thinking…</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <form onSubmit={handleChatSubmit} className="mt-3 space-y-2">
              <textarea
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                className="min-h-[70px] w-full rounded-md border border-[#d0c9a4] px-3 py-2 text-sm focus:border-[#8fae4c] focus:outline-none"
                placeholder="Ask for a schedule cleanup, task ideas, or sequencing help"
              />
              <button
                type="submit"
                disabled={chatLoading}
                className="w-full rounded-md bg-[#8fae4c] px-4 py-2 text-sm font-semibold uppercase tracking-[0.12em] text-[#f9f9ec] shadow-md transition hover:bg-[#7e9c44] disabled:opacity-60"
              >
                {chatLoading ? "Thinking…" : "Send"}
              </button>
            </form>
          </div>

          {taskDetail && (
            <div className="rounded-2xl border border-[#d0c9a4] bg-white/80 p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.12em] text-[#7a7f54]">Task detail</p>
                  <h3 className="text-base font-semibold text-[#314123]">{taskDetail.name}</h3>
                </div>
                {taskDetailLoading && (
                  <span className="text-[11px] text-[#6b6d4b]">Loading…</span>
                )}
              </div>
              <p className="mt-2 whitespace-pre-line text-sm text-[#4b5133]">{taskDetail.description || "No description yet."}</p>
              {taskDetail.taskType?.name && (
                <span className="mt-2 inline-block rounded-full bg-[#f6f1dd] px-3 py-1 text-[11px] font-semibold text-[#4b5133]">
                  {taskDetail.taskType.name}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
