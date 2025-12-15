"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { loadSession } from "@/lib/session";

type ReportItem = { id: string; title: string; date?: string };
type UserItem = { id: string; name: string; userType: string; goats: number };
type Slot = { id: string; label: string };

export default function AdminPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [reportFilter, setReportFilter] = useState("");
  const [users, setUsers] = useState<UserItem[]>([]);
  const [newUser, setNewUser] = useState({ name: "", userType: "Volunteer" });
  const [schedulePeople, setSchedulePeople] = useState<string[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [taskEdit, setTaskEdit] = useState({ person: "", slotId: "", task: "", mode: "add" });
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
          setSchedulePeople(json.people || []);
          setSlots((json.slots || []).map((s: any) => ({ id: s.id, label: s.label })));
        }
      } catch (err) {
        console.error("Failed to load schedule options", err);
      }
    })();
  }, [authorized]);

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

  async function handleTaskEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!taskEdit.person || !taskEdit.slotId || !taskEdit.task) {
      setMessage("Please select a person, slot, and task name.");
      return;
    }

    try {
      const res = await fetch("/api/schedule/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          person: taskEdit.person,
          slotId: taskEdit.slotId,
          addTask: taskEdit.mode === "add" ? taskEdit.task : undefined,
          removeTask: taskEdit.mode === "remove" ? taskEdit.task : undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed to update schedule");
      setMessage("Schedule updated.");
    } catch (err: any) {
      setMessage(err?.message || "Could not update schedule");
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
                  <div className="font-semibold text-[#344223]">{r.title}</div>
                  <div className="text-[11px] text-[#6b6d4b]">{r.date ? new Date(r.date).toLocaleString() : "No date"}</div>
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

          <div className="rounded-2xl border border-[#d0c9a4] bg-white/70 p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-[#314123]">Adjust schedule</h2>
            <p className="text-sm text-[#5f5a3b]">Add or remove tasks directly from the current schedule.</p>
            <form className="mt-3 space-y-3" onSubmit={handleTaskEdit}>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1 text-sm">
                  <label className="text-[#5f5a3b]">Person</label>
                  <select
                    value={taskEdit.person}
                    onChange={(e) => setTaskEdit((prev) => ({ ...prev, person: e.target.value }))}
                    className="w-full rounded-md border border-[#d0c9a4] px-3 py-2 text-sm focus:border-[#8fae4c] focus:outline-none"
                  >
                    <option value="">Choose</option>
                    {schedulePeople.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1 text-sm">
                  <label className="text-[#5f5a3b]">Slot</label>
                  <select
                    value={taskEdit.slotId}
                    onChange={(e) => setTaskEdit((prev) => ({ ...prev, slotId: e.target.value }))}
                    className="w-full rounded-md border border-[#d0c9a4] px-3 py-2 text-sm focus:border-[#8fae4c] focus:outline-none"
                  >
                    <option value="">Choose</option>
                    {slots.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-1 text-sm">
                <label className="text-[#5f5a3b]">Task name</label>
                <input
                  value={taskEdit.task}
                  onChange={(e) => setTaskEdit((prev) => ({ ...prev, task: e.target.value }))}
                  className="w-full rounded-md border border-[#d0c9a4] px-3 py-2 text-sm focus:border-[#8fae4c] focus:outline-none"
                  placeholder="Task to add or remove"
                />
              </div>
              <div className="flex items-center gap-3 text-sm">
                <label className="inline-flex items-center gap-1 text-[#4b5133]">
                  <input
                    type="radio"
                    name="task-mode"
                    checked={taskEdit.mode === "add"}
                    onChange={() => setTaskEdit((prev) => ({ ...prev, mode: "add" }))}
                  />
                  Add
                </label>
                <label className="inline-flex items-center gap-1 text-[#4b5133]">
                  <input
                    type="radio"
                    name="task-mode"
                    checked={taskEdit.mode === "remove"}
                    onChange={() => setTaskEdit((prev) => ({ ...prev, mode: "remove" }))}
                  />
                  Remove
                </label>
              </div>
              <button
                type="submit"
                className="w-full rounded-md bg-[#8fae4c] px-4 py-2 text-sm font-semibold uppercase tracking-[0.12em] text-[#f9f9ec] shadow-md transition hover:bg-[#7e9c44]"
              >
                Apply change
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
