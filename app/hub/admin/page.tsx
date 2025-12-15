"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { loadSession } from "@/lib/session";

type ReportItem = { id: string; title: string; date?: string };
type UserItem = { id: string; name: string; userType: string; goats: number };
type Slot = { id: string; label: string };
type ScheduleResponse = {
  people: string[];
  slots: { id: string; label: string; timeRange?: string; isMeal?: boolean }[];
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

function toNotionUrl(id: string) {
  return `https://www.notion.so/${id.replace(/-/g, "")}`;
}

function parseTasks(cell: string) {
  if (!cell) return [] as string[];
  return cell
    .split(/,|\n/)
    .map((t) => t.trim())
    .filter(Boolean);
}

export default function AdminPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [reportFilter, setReportFilter] = useState("");
  const [users, setUsers] = useState<UserItem[]>([]);
  const [newUser, setNewUser] = useState({ name: "", userType: "Volunteer" });
  const [scheduleData, setScheduleData] = useState<ScheduleResponse | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [taskBank, setTaskBank] = useState<TaskCatalogItem[]>([]);
  const [selectedCell, setSelectedCell] = useState<{
    person: string;
    slotId: string;
    slotLabel: string;
    tasks: string[];
  } | null>(null);
  const [customTask, setCustomTask] = useState("");
  const [goatUpdate, setGoatUpdate] = useState({ userId: "", goats: "" });

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
      setMessage("You need admin access to generate reports.");
    }
  }, [router]);

  useEffect(() => {
    if (!authorized) return;

    (async () => {
      try {
        const res = await fetch("/api/reports?list=1");
        const json = await res.json();
        setReports(json.reports || []);
      } catch (err) {
        console.error("Failed to load reports", err);
      }

      try {
        const res = await fetch("/api/users");
        const json = await res.json();
        setUsers(json.users || []);
      } catch (err) {
        console.error("Failed to load users", err);
      }

      try {
        const res = await fetch("/api/schedule");
        if (res.ok) {
          const json = await res.json();
          setScheduleData(json);
          setSlots((json.slots || []).map((s: any) => ({ id: s.id, label: s.label })));
        }
      } catch (err) {
        console.error("Failed to load schedule options", err);
      }

      try {
        const res = await fetch("/api/task?list=1");
        if (res.ok) {
          const json = await res.json();
          setTaskBank(json.tasks || []);
        }
      } catch (err) {
        console.error("Failed to load task bank", err);
      }
    })();
  }, [authorized]);

  async function refreshSchedule() {
    try {
      const res = await fetch("/api/schedule");
      if (res.ok) {
        const json = await res.json();
        setScheduleData(json);
      }
    } catch (err) {
      console.error("Failed to refresh schedule", err);
    }
  }

  async function handleCreateReport() {
    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch("/api/reports", { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to create report");
      }
      setMessage("Daily report created successfully. Check Notion to review it.");
    } catch (err: any) {
      setMessage(err?.message || "Failed to create report.");
    } finally {
      setLoading(false);
    }
  }

  const filteredReports = useMemo(() => {
    if (!reportFilter.trim()) return reports;
    const needle = reportFilter.toLowerCase();
    return reports.filter(
      (r) =>
        r.title.toLowerCase().includes(needle) ||
        (r.date || "").toLowerCase().includes(needle)
    );
  }, [reportFilter, reports]);

  async function handleCreateUser(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newUser),
      });
      if (!res.ok) throw new Error("Failed to create user");
      setMessage("User created with default passcode WAIANDAINA.");
      setNewUser({ name: "", userType: "Volunteer" });
      const refreshed = await fetch("/api/users");
      const json = await refreshed.json();
      setUsers(json.users || []);
    } catch (err: any) {
      setMessage(err?.message || "Could not create user.");
    }
  }

  async function handleGoatUpdateSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!goatUpdate.userId) {
      setMessage("Choose a user to update goats.");
      return;
    }
    try {
      await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: goatUpdate.userId, goats: Number(goatUpdate.goats) }),
      });
      setMessage("Goat balance updated.");
      setGoatUpdate({ userId: "", goats: "" });
      const refreshed = await fetch("/api/users");
      const json = await refreshed.json();
      setUsers(json.users || []);
    } catch (err: any) {
      setMessage(err?.message || "Could not update goats");
    }
  }

  async function addTaskToSlot(person: string, slotId: string, taskName: string) {
    if (!person || !slotId || !taskName) return;
    setMessage(null);
    try {
      const res = await fetch("/api/schedule/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ person, slotId, addTask: taskName }),
      });
      if (!res.ok) throw new Error("Failed to update schedule");
      setMessage(`Assigned ${taskName} to ${person}.`);
      await refreshSchedule();
      setSelectedCell((prev) =>
        prev && prev.person === person && prev.slotId === slotId
          ? { ...prev, tasks: [...prev.tasks, taskName] }
          : prev
      );
    } catch (err: any) {
      setMessage(err?.message || "Could not assign task.");
    }
  }

  async function removeTaskFromSlot(person: string, slotId: string, taskName: string) {
    try {
      const res = await fetch("/api/schedule/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ person, slotId, removeTask: taskName }),
      });
      if (!res.ok) throw new Error("Failed to update schedule");
      setMessage(`Removed ${taskName} from ${person}.`);
      await refreshSchedule();
      setSelectedCell((prev) =>
        prev && prev.person === person && prev.slotId === slotId
          ? { ...prev, tasks: prev.tasks.filter((t) => t !== taskName) }
          : prev
      );
    } catch (err: any) {
      setMessage(err?.message || "Could not remove task.");
    }
  }

  function handleDrop(
    e: React.DragEvent<HTMLDivElement>,
    person: string,
    slotId: string,
    slotLabel: string
  ) {
    e.preventDefault();
    const taskName = e.dataTransfer.getData("text/task-name");
    if (taskName) {
      addTaskToSlot(person, slotId, taskName);
      setSelectedCell({
        person,
        slotId,
        slotLabel,
        tasks: parseTasks(
          scheduleData?.cells?.[scheduleData.people.indexOf(person)]?.[
            scheduleData.slots.findIndex((s) => s.id === slotId)
          ] || ""
        ),
      });
    }
  }

  function slotClass(typeColor?: string) {
    return !typeColor || typeColor === "default" ? "bg-white/80" : "bg-white/80";
  }

  function slotStyle(typeColor?: string) {
    if (!typeColor || typeColor === "default") return {} as React.CSSProperties;
    return { backgroundColor: typeColor, opacity: 0.18 } as React.CSSProperties;
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6">
      <div className="rounded-2xl border border-[#d0c9a4] bg-white/70 p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-[#7a7f54]">Reports</p>
            <h1 className="text-2xl font-semibold text-[#314123]">Daily Report Builder</h1>
            <p className="text-sm text-[#5f5a3b]">
              Generate archive-ready reports for the selected schedule and browse recent ones below.
            </p>
          </div>
          <button
            type="button"
            disabled={!authorized || loading}
            onClick={handleCreateReport}
            className="rounded-md bg-[#a0b764] px-4 py-2 text-sm font-semibold uppercase tracking-[0.12em] text-[#f9f9ec] shadow-md transition hover:bg-[#93a95d] disabled:opacity-50"
          >
            {loading ? "Creating…" : "Create Daily Report"}
          </button>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-lg bg-[#f6f1dd] p-4 text-sm text-[#4b5133]">
            <ul className="list-disc space-y-1 pl-5">
              <li>Uses the schedule date configured in Notion Settings.</li>
              <li>Captures assignments, statuses, descriptions, extra notes, and comments.</li>
              <li>Auto-creates when the Notion "Report Time" clock hits in Hawaii time.</li>
            </ul>
          </div>
          <div className="rounded-lg border border-[#e2d7b5] bg-white/70 p-4 text-sm text-[#4b5133]">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="font-semibold text-[#3c4b2a]">Recent reports</span>
              <input
                value={reportFilter}
                onChange={(e) => setReportFilter(e.target.value)}
                placeholder="Filter by date or title"
                className="w-40 rounded-md border border-[#d0c9a4] px-2 py-1 text-xs focus:border-[#8fae4c] focus:outline-none"
              />
            </div>
            <div className="max-h-48 space-y-2 overflow-y-auto pr-1 text-xs">
              {filteredReports.map((r) => (
                <div
                  key={r.id}
                  className="rounded-md border border-[#dcd5b5] bg-white/80 px-3 py-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-[#344223]">{r.title}</div>
                      <div className="text-[11px] text-[#6b6d4b]">
                        {r.date ? new Date(r.date).toLocaleString() : "No date"}
                      </div>
                    </div>
                    <a
                      className="rounded-md bg-[#e6edcc] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#3c4b2a] shadow-sm transition hover:bg-[#d6e4ad]"
                      href={toNotionUrl(r.id)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View
                    </a>
                  </div>
                </div>
              ))}
              {!filteredReports.length && (
                <p className="text-[11px] text-[#7a7f54]">No reports found yet.</p>
              )}
            </div>
          </div>
        </div>
        {message ? (
          <p className="mt-3 text-sm font-semibold text-[#4b5133]">{message}</p>
        ) : null}
      </div>

        {!authorized ? (
          <div className="rounded-xl border border-[#e2d7b5] bg-[#f9f6e7] p-4 text-sm text-[#7a7f54]">
            Only administrators can create reports. If you need access, please contact a site admin.
          </div>
        ) : (
          <>
            <div className="grid gap-5 md:grid-cols-2">
              <div className="rounded-2xl border border-[#d0c9a4] bg-white/70 p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-[#314123]">Manage users</h2>
                <form className="mt-3 space-y-3" onSubmit={handleCreateUser}>
                  <div className="space-y-1 text-sm">
                    <label className="text-[#5f5a3b]">Name</label>
                    <input
                      value={newUser.name}
                      onChange={(e) => setNewUser((prev) => ({ ...prev, name: e.target.value }))}
                      className="w-full rounded-md border border-[#d0c9a4] px-3 py-2 text-sm focus:border-[#8fae4c] focus:outline-none"
                      placeholder="New teammate"
                    />
                  </div>
                  <div className="space-y-1 text-sm">
                    <label className="text-[#5f5a3b]">Role</label>
                    <select
                      value={newUser.userType}
                      onChange={(e) => setNewUser((prev) => ({ ...prev, userType: e.target.value }))}
                      className="w-full rounded-md border border-[#d0c9a4] px-3 py-2 text-sm focus:border-[#8fae4c] focus:outline-none"
                    >
                      <option>Admin</option>
                      <option>Volunteer</option>
                      <option>External Volunteer</option>
                      <option>Inactive Volunteer</option>
                    </select>
                  </div>
                  <p className="text-xs text-[#7a7f54]">Default passcode is set to WAIANDAINA for new accounts.</p>
                  <button
                    type="submit"
                    className="w-full rounded-md bg-[#8fae4c] px-4 py-2 text-sm font-semibold uppercase tracking-[0.12em] text-[#f9f9ec] shadow-md transition hover:bg-[#7e9c44]"
                  >
                    Add user
                  </button>
                </form>

                <div className="mt-5 rounded-lg border border-[#e2d7b5] bg-[#f9f6e7] p-4">
                  <h3 className="text-sm font-semibold text-[#314123]">Set goat balance</h3>
                  <form className="mt-2 space-y-2 text-sm" onSubmit={handleGoatUpdateSubmit}>
                    <select
                      value={goatUpdate.userId}
                      onChange={(e) => setGoatUpdate((prev) => ({ ...prev, userId: e.target.value }))}
                      className="w-full rounded-md border border-[#d0c9a4] px-3 py-2 text-sm focus:border-[#8fae4c] focus:outline-none"
                    >
                      <option value="">Choose user</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} — {u.goats} 🐐
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      value={goatUpdate.goats}
                      onChange={(e) => setGoatUpdate((prev) => ({ ...prev, goats: e.target.value }))}
                      className="w-full rounded-md border border-[#d0c9a4] px-3 py-2 text-sm focus:border-[#8fae4c] focus:outline-none"
                      placeholder="New goat balance"
                    />
                    <button
                      type="submit"
                      className="w-full rounded-md bg-[#a0b764] px-4 py-2 text-sm font-semibold text-[#f9f9ec] shadow-sm transition hover:bg-[#93a95d]"
                    >
                      Update balance
                    </button>
                  </form>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-[#d0c9a4] bg-white/70 p-5 shadow-sm">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-[#314123]">Schedule sandbox</h2>
                  <p className="text-sm text-[#5f5a3b]">
                    Drag tasks from the bank into any slot. This mirrors Today&apos;s Schedule with every shift included.
                  </p>
                  <p className="text-xs text-[#6a6c4d]">
                    {scheduleData?.scheduleDate
                      ? `Schedule date: ${scheduleData.scheduleDate}`
                      : scheduleData?.message || ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={refreshSchedule}
                    className="rounded-md bg-[#e6edcc] px-3 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-[#314123] shadow-sm transition hover:bg-[#d6e4ad]"
                  >
                    Refresh schedule
                  </button>
                </div>
              </div>
              <div className="mt-4 grid gap-4 lg:grid-cols-3">
                <div className="lg:col-span-2">
                  <div className="overflow-auto rounded-xl border border-[#e2d7b5] bg-[#faf7eb]">
                    <table className="min-w-full border-collapse text-sm">
                      <thead className="bg-[#f0ead4] text-[#4b5133]">
                        <tr>
                          <th className="min-w-[120px] border-b border-[#dcd3ad] px-3 py-2 text-left">Person</th>
                          {scheduleData?.slots.map((slot) => (
                            <th key={slot.id} className="border-b border-l border-[#dcd3ad] px-3 py-2 text-left">
                              <div className="text-xs font-semibold text-[#3c4b2a]">{slot.label}</div>
                              {slot.timeRange ? (
                                <div className="text-[10px] text-[#6b6d4b]">{slot.timeRange}</div>
                              ) : null}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {scheduleData?.people.map((person, rowIdx) => (
                          <tr key={person} className="border-t border-[#e5dcba]">
                            <td className="border-r border-[#e5dcba] px-3 py-3 text-left text-[#2f3b21] font-semibold">
                              {person}
                            </td>
                            {scheduleData.slots.map((slot, colIdx) => {
                              const cell = scheduleData.cells?.[rowIdx]?.[colIdx] || "";
                              const tasks = parseTasks(cell);
                              const isSelected =
                                selectedCell?.person === person && selectedCell?.slotId === slot.id;

                              return (
                                <td key={`${person}-${slot.id}`} className="border-r border-[#e5dcba] px-2 py-2 align-top">
                                  <div
                                    className={`min-h-[78px] rounded-lg border border-dashed border-[#d0c9a4] p-2 shadow-sm transition hover:border-[#9fb668] ${slotClass(
                                      taskBank.find((t) => t.name === tasks[0])?.typeColor
                                    )} ${isSelected ? "ring-2 ring-[#9fb668]" : ""}`}
                                    style={slotStyle(taskBank.find((t) => t.name === tasks[0])?.typeColor)}
                                    onDragOver={(e) => e.preventDefault()}
                                    onDrop={(e) => handleDrop(e, person, slot.id, slot.label)}
                                    onClick={() =>
                                      setSelectedCell({
                                        person,
                                        slotId: slot.id,
                                        slotLabel: slot.label,
                                        tasks,
                                      })
                                    }
                                  >
                                    <div className="flex flex-wrap gap-2">
                                      {tasks.map((task) => (
                                        <span
                                          key={task}
                                          className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2 py-[2px] text-[11px] font-semibold text-[#3e4c24] shadow-sm"
                                        >
                                          {task}
                                        </span>
                                      ))}
                                    </div>
                                    {!tasks.length && (
                                      <p className="text-[11px] italic text-[#7a7f54]">Drop tasks here</p>
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
                              No schedule found.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="rounded-lg border border-[#e2d7b5] bg-[#f9f6e7] p-3">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-[#314123]">Task bank</h3>
                      <span className="text-[11px] text-[#6b6d4b]">Drag to assign</span>
                    </div>
                    <div className="mt-2 max-h-64 space-y-2 overflow-y-auto pr-1">
                      {taskBank.map((task) => (
                        <button
                          key={task.id}
                          draggable
                          onDragStart={(e) => e.dataTransfer.setData("text/task-name", task.name)}
                          className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm text-[#2f3b21] shadow-sm transition hover:border-[#9fb668] ${slotClass(task.typeColor)}`}
                          style={slotStyle(task.typeColor)}
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
                      {!taskBank.length && (
                        <p className="text-[12px] text-[#7a7f54]">No tasks loaded yet.</p>
                      )}
                    </div>
                  </div>

                  <div className="rounded-lg border border-[#e2d7b5] bg-white/70 p-3">
                    <h3 className="text-sm font-semibold text-[#314123]">Task editor</h3>
                    {selectedCell ? (
                      <div className="mt-2 space-y-2 text-sm text-[#4b5133]">
                        <p className="text-[12px] text-[#6b6d4b]">
                          {selectedCell.person} • {selectedCell.slotLabel}
                        </p>
                        <div className="space-y-1">
                          {selectedCell.tasks.map((task) => (
                            <div
                              key={task}
                              className="flex items-center justify-between rounded-md border border-[#e2d7b5] bg-[#f6f1dd] px-2 py-1"
                            >
                              <span className="text-[12px] font-semibold text-[#2f3b21]">{task}</span>
                              <button
                                type="button"
                                onClick={() => removeTaskFromSlot(selectedCell.person, selectedCell.slotId, task)}
                                className="text-[11px] font-semibold text-[#a05252] hover:underline"
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                          {!selectedCell.tasks.length && (
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
                              onClick={() => {
                                if (customTask.trim()) {
                                  addTaskToSlot(selectedCell.person, selectedCell.slotId, customTask.trim());
                                  setCustomTask("");
                                }
                              }}
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
                </div>
              </div>
            </div>
          </>
        )}
    </div>
  );
}
