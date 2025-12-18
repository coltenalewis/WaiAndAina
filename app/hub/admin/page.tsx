"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { loadSession } from "@/lib/session";

type ReportItem = { id: string; title: string; date?: string };
type UserItem = { id: string; name: string; userType: string; goats: number };
type Slot = { id: string; label: string };
type TaskTypeOption = { name: string; color: string };
type StatusOption = { name: string; color: string };
type ScheduleResponse = {
  people: string[];
  slots: { id: string; label: string; timeRange?: string; isMeal?: boolean }[];
  cells: string[][];
  scheduleDate?: string;
  reportTime?: string;
  taskResetTime?: string;
  message?: string;
};
type TaskCatalogItem = {
  id: string;
  name: string;
  type?: string;
  typeColor?: string;
  status?: string;
};
type TaskDetail = {
  name: string;
  description: string;
  taskType?: { name: string; color: string };
};
type ReportBlock = {
  id: string;
  type: string;
  richText?: { plain: string; href?: string; annotations?: any }[];
  checked?: boolean;
  url?: string;
  caption?: { plain: string; href?: string; annotations?: any }[];
  children?: ReportBlock[];
};

function toNotionUrl(id: string) {
  return `https://www.notion.so/${id.replace(/-/g, "")}`;
}

function splitCellTasks(cell: string) {
  if (!cell.trim()) return [] as string[];

  const [firstLine, ...rest] = cell.split("\n");
  const note = rest.join("\n").trim();

  return firstLine
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => (note ? `${t}\n${note}` : t))
    .filter((t) => taskBaseName(t) && taskBaseName(t) !== "-");
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

function renderRichText(nodes?: { plain: string; href?: string; annotations?: any }[]) {
  if (!nodes?.length) return null;
  return nodes.map((t, idx) => {
    const classNames = ["text-[#3e4c24]"];
    if (t.annotations?.bold) classNames.push("font-semibold");
    if (t.annotations?.italic) classNames.push("italic");
    if (t.annotations?.underline) classNames.push("underline");
    if (t.annotations?.code) classNames.push("font-mono bg-[#f3f0e2] px-1 rounded");

    const content = t.href ? (
      <a
        key={`${t.plain}-${idx}`}
        href={t.href}
        className="text-[#2f5ba0] underline underline-offset-2"
        target="_blank"
        rel="noreferrer"
      >
        {t.plain}
      </a>
    ) : (
      <span key={`${t.plain}-${idx}`}>{t.plain}</span>
    );

    return (
      <span key={`${t.plain}-${idx}`} className={classNames.join(" ")}>
        {content}
      </span>
    );
  });
}

function renderReportBlock(block: ReportBlock): React.ReactNode {
  const children = block.children?.length ? (
    <div className="ml-4 space-y-2">{block.children.map(renderReportBlock)}</div>
  ) : null;

  switch (block.type) {
    case "heading_1":
    case "heading_2":
      return (
        <h2 key={block.id} className="text-xl font-semibold text-[#3b4224]">
          {renderRichText(block.richText)}
          {children}
        </h2>
      );
    case "heading_3":
      return (
        <h3 key={block.id} className="text-lg font-semibold text-[#445330]">
          {renderRichText(block.richText)}
          {children}
        </h3>
      );
    case "paragraph":
      return (
        <p key={block.id} className="text-sm leading-relaxed text-[#3e4c24]">
          {renderRichText(block.richText)}
          {children}
        </p>
      );
    case "bulleted_list_item":
      return (
        <ul key={block.id} className="list-disc pl-5 text-sm text-[#3e4c24] space-y-1">
          <li>
            {renderRichText(block.richText)}
            {children}
          </li>
        </ul>
      );
    case "numbered_list_item":
      return (
        <ol key={block.id} className="list-decimal pl-5 text-sm text-[#3e4c24] space-y-1">
          <li>
            {renderRichText(block.richText)}
            {children}
          </li>
        </ol>
      );
    case "to_do":
      return (
        <div key={block.id} className="flex items-start gap-2 text-sm text-[#3e4c24]">
          <input type="checkbox" checked={block.checked} readOnly className="mt-1" />
          <div>
            {renderRichText(block.richText)}
            {children}
          </div>
        </div>
      );
    case "quote":
      return (
        <blockquote
          key={block.id}
          className="border-l-4 border-[#d0c9a4] bg-white/70 px-4 py-2 text-sm italic text-[#4b522d]"
        >
          {renderRichText(block.richText)}
          {children}
        </blockquote>
      );
    case "callout":
      return (
        <div
          key={block.id}
          className="rounded-md border border-[#e2d7b5] bg-[#f9f6e7] px-4 py-2 text-sm text-[#4b5133]"
        >
          {renderRichText(block.richText)}
          {children}
        </div>
      );
    case "image":
      return (
        <div key={block.id} className="space-y-1">
          <img
            src={block.url}
            alt="Report attachment"
            className="max-h-64 w-full rounded-lg object-cover"
          />
          {block.caption && (
            <div className="text-xs text-[#6b6d4b]">{renderRichText(block.caption)}</div>
          )}
        </div>
      );
    case "bookmark":
      return (
        <a
          key={block.id}
          href={block.url}
          target="_blank"
          rel="noreferrer"
          className="block rounded-md border border-[#d0c9a4] bg-white/70 px-3 py-2 text-sm text-[#2f5ba0] underline underline-offset-2"
        >
          {block.url}
        </a>
      );
    case "divider":
      return <hr key={block.id} className="border-t border-[#dcd5b5]" />;
    default:
      return (
        <p key={block.id} className="text-sm text-[#6b6d4b]">
          {renderRichText(block.richText) || "Unsupported block"}
          {children}
        </p>
      );
  }
}

export default function AdminPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [reportFilter, setReportFilter] = useState("");
  const [reportPreview, setReportPreview] = useState<ReportItem | null>(null);
  const [reportBlocks, setReportBlocks] = useState<ReportBlock[]>([]);
  const [reportLoading, setReportLoading] = useState(false);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [newUser, setNewUser] = useState({ name: "", userType: "Volunteer" });
  const [scheduleData, setScheduleData] = useState<ScheduleResponse | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [taskBank, setTaskBank] = useState<TaskCatalogItem[]>([]);
  const [taskTypes, setTaskTypes] = useState<TaskTypeOption[]>([]);
  const [statusOptions, setStatusOptions] = useState<StatusOption[]>([]);
  const [taskSearch, setTaskSearch] = useState("");
  const [taskTypeFilter, setTaskTypeFilter] = useState("");
  const [taskStatusFilter, setTaskStatusFilter] = useState("");
  const [selectedCell, setSelectedCell] = useState<{
    person: string;
    slotId: string;
    slotLabel: string;
    tasks: string[];
  } | null>(null);
  const [customTask, setCustomTask] = useState("");
  const [goatUpdate, setGoatUpdate] = useState({ userId: "", goats: "" });
  const [selectedTaskName, setSelectedTaskName] = useState<string | null>(null);
  const [selectedTaskDetail, setSelectedTaskDetail] = useState<TaskDetail | null>(null);
  const [taskDetailLoading, setTaskDetailLoading] = useState(false);
  const [resettingTasks, setResettingTasks] = useState(false);

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

      try {
        const res = await fetch("/api/task-types");
        if (res.ok) {
          const json = await res.json();
          setTaskTypes(json.types || []);
          setStatusOptions(json.statuses || []);
        }
      } catch (err) {
        console.error("Failed to load task type options", err);
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

  async function handleResetRecurringTasks() {
    setResettingTasks(true);
    setMessage(null);

    try {
      const res = await fetch("/api/tasks/reset-recurring", { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to reset recurring tasks");
      }
      const count = json.updated ?? 0;
      setMessage(`Reset ${count} recurring tasks to Not Started.`);
    } catch (err: any) {
      setMessage(err?.message || "Failed to reset recurring tasks.");
    } finally {
      setResettingTasks(false);
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

  const filteredTaskBank = useMemo(() => {
    return taskBank.filter((task) => {
      const matchesSearch = task.name
        .toLowerCase()
        .includes(taskSearch.toLowerCase());
      const matchesType = taskTypeFilter
        ? (task.type || "").toLowerCase() === taskTypeFilter.toLowerCase()
        : true;
      const matchesStatus = taskStatusFilter
        ? (task.status || "").toLowerCase() === taskStatusFilter.toLowerCase()
        : true;
      return matchesSearch && matchesType && matchesStatus;
    });
  }, [taskBank, taskSearch, taskStatusFilter, taskTypeFilter]);

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

  async function loadReport(item: ReportItem) {
    setReportPreview(item);
    setReportLoading(true);
    setReportBlocks([]);
    try {
      const res = await fetch(`/api/reports?id=${encodeURIComponent(item.id)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load report");
      setReportBlocks(json.blocks || []);
    } catch (err: any) {
      setMessage(err?.message || "Unable to load report");
    } finally {
      setReportLoading(false);
    }
  }

  async function loadTaskDetailForEdit(taskName: string) {
    const base = taskBaseName(taskName);
    if (!base) return;
    setSelectedTaskName(base);
    setTaskDetailLoading(true);
    try {
      const res = await fetch(`/api/task?name=${encodeURIComponent(base)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load task");
      setSelectedTaskDetail({
        name: json.name || base,
        description: json.description || "",
        taskType: json.taskType,
      });
    } catch (err: any) {
      setMessage(err?.message || "Unable to load task details");
      setSelectedTaskDetail(null);
    } finally {
      setTaskDetailLoading(false);
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

  async function handleTaskDetailSave() {
    if (!selectedTaskName) return;
    try {
      const res = await fetch("/api/task", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: selectedTaskName,
          description: selectedTaskDetail?.description ?? "",
          taskType: selectedTaskDetail?.taskType?.name || "",
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to save task");
      setMessage("Task updated.");
    } catch (err: any) {
      setMessage(err?.message || "Unable to update task");
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
    const jsonPayload = e.dataTransfer.getData("application/json/task");
    let taskName = e.dataTransfer.getData("text/task-name");
    let fromPerson: string | null = null;
    let fromSlotId: string | null = null;

    if (jsonPayload) {
      try {
        const parsed = JSON.parse(jsonPayload);
        taskName = parsed.taskName || taskName;
        fromPerson = parsed.fromPerson || null;
        fromSlotId = parsed.fromSlotId || null;
      } catch (err) {
        console.error("Failed to parse drag payload", err);
      }
    }

    if (taskName) {
      addTaskToSlot(person, slotId, taskName);
      if (
        fromPerson &&
        fromSlotId &&
        (fromPerson !== person || fromSlotId !== slotId)
      ) {
        removeTaskFromSlot(fromPerson, fromSlotId, taskName);
      }

      const rowIdx = scheduleData?.people.indexOf(person) ?? -1;
      const colIdx = scheduleData?.slots.findIndex((s) => s.id === slotId) ?? -1;
      const cellValue =
        rowIdx > -1 && colIdx > -1
          ? scheduleData?.cells?.[rowIdx]?.[colIdx] || ""
          : "";

      setSelectedCell({
        person,
        slotId,
        slotLabel,
        tasks: splitCellTasks(cellValue),
      });
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
          <div className="flex flex-col items-stretch gap-2 md:items-end">
            <button
              type="button"
              disabled={!authorized || loading}
              onClick={handleCreateReport}
              className="rounded-md bg-[#a0b764] px-4 py-2 text-sm font-semibold uppercase tracking-[0.12em] text-[#f9f9ec] shadow-md transition hover:bg-[#93a95d] disabled:opacity-50"
            >
              {loading ? "Creating…" : "Create Daily Report"}
            </button>
            <button
              type="button"
              disabled={!authorized || resettingTasks}
              onClick={handleResetRecurringTasks}
              className="rounded-md border border-[#d0c9a4] bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#3f4b29] shadow-sm transition hover:bg-[#f1edd8] disabled:opacity-50"
            >
              {resettingTasks ? "Resetting…" : "Reset Recurring Tasks"}
            </button>
            <p className="text-[11px] text-[#7a7f54] text-right">
              Clears completed recurring tasks back to Not Started.
            </p>
          </div>
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
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => loadReport(r)}
                        className="rounded-md bg-[#dce6b8] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#3c4b2a] shadow-sm transition hover:bg-[#ccd89f]"
                      >
                        Preview
                      </button>
                      <a
                        className="rounded-md bg-[#e6edcc] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#3c4b2a] shadow-sm transition hover:bg-[#d6e4ad]"
                        href={toNotionUrl(r.id)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Notion
                      </a>
                    </div>
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
                      <thead className="bg-[#e5e7c5]">
                        <tr>
                          <th className="min-w-[140px] border border-[#d1d4aa] px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-[#5d7f3b]">
                            Person
                          </th>
                          {scheduleData?.slots.map((slot) => (
                            <th
                              key={slot.id}
                              className="border border-[#d1d4aa] px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-[#5d7f3b]"
                            >
                              <div className="flex items-center gap-2">
                                <div>
                                  <div>{slot.label}</div>
                                  {slot.timeRange && (
                                    <div className="text-[10px] text-[#7a7f54] normal-case">{slot.timeRange}</div>
                                  )}
                                </div>
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {scheduleData?.people.map((person, rowIdx) => (
                          <tr
                            key={person}
                            className={rowIdx % 2 === 0 ? "bg-[#faf8ea]" : "bg-[#f4f2df]"}
                          >
                            <td className="border border-[#d1d4aa] px-3 py-2 align-top text-sm font-semibold text-[#4f5730]">
                              {person}
                            </td>
                            {scheduleData.slots.map((slot, colIdx) => {
                              const cell = scheduleData.cells?.[rowIdx]?.[colIdx] || "";
                              const tasks = splitCellTasks(cell);
                              const isSelected =
                                selectedCell?.person === person && selectedCell?.slotId === slot.id;
                              const minHeight = 72;

                              return (
                                <td
                                  key={`${person}-${slot.id}`}
                                  className={`border border-[#d1d4aa] p-1 align-top ${
                                    isSelected ? "bg-[#f0f4de]" : ""
                                  }`}
                                  style={{ minHeight: `${minHeight}px` }}
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
                                  <div className="flex h-full w-full flex-col gap-2">
                                    {tasks.map((task) => {
                                      const base = taskBaseName(task);
                                      const meta = taskBank.find((t) => t.name === base);
                                      return (
                                        <button
                                          key={`${person}-${slot.id}-${task}`}
                                          type="button"
                                          draggable
                                          onDragStart={(e) => {
                                            e.dataTransfer.setData("text/task-name", base);
                                            e.dataTransfer.setData(
                                              "application/json/task",
                                              JSON.stringify({
                                                taskName: base,
                                                fromPerson: person,
                                                fromSlotId: slot.id,
                                              })
                                            );
                                          }}
                                          onClick={() => {
                                            setSelectedCell({
                                              person,
                                              slotId: slot.id,
                                              slotLabel: slot.label,
                                              tasks,
                                            });
                                            loadTaskDetailForEdit(task);
                                          }}
                                          className={`flex h-full min-h-full w-full flex-col justify-between gap-2 rounded-md border p-2 text-left text-[11px] leading-snug shadow-sm transition focus:outline-none focus:ring-2 focus:ring-[#8fae4c] ${typeColorClasses(
                                            meta?.typeColor
                                          )}`}
                                          style={{ minHeight: `${minHeight * 0.9}px` }}
                                        >
                                          <div className="flex items-start justify-between gap-2">
                                            <span className="font-semibold">{base}</span>
                                            {meta?.status && (
                                              <span className="rounded-full bg-white/80 px-2 py-[1px] text-[9px] font-semibold text-[#4f4f31]">
                                                {meta.status}
                                              </span>
                                            )}
                                          </div>
                                          {task.includes("\n") && (
                                            <div className="whitespace-pre-line text-[11px] text-[#4f4b33] opacity-90">
                                              {task.split("\n").slice(1).join("\n")}
                                            </div>
                                          )}
                                        </button>
                                      );
                                    })}

                                    {!tasks.length && (
                                      <div className="flex h-full min-h-[60px] items-center justify-center rounded-md border border-dashed border-[#d0c9a4] bg-white/60 text-[11px] italic text-[#7a7f54]">
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
                    <div className="mt-2 grid gap-2 md:grid-cols-3">
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
                    </div>
                    <div className="mt-2 max-h-64 space-y-2 overflow-y-auto pr-1">
                      {filteredTaskBank.map((task) => (
                        <button
                          key={task.id}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData("text/task-name", task.name);
                            e.dataTransfer.setData(
                              "application/json/task",
                              JSON.stringify({ taskName: task.name })
                            );
                          }}
                          onClick={() => loadTaskDetailForEdit(task.name)}
                          className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm text-[#2f3b21] shadow-sm transition hover:border-[#9fb668] ${typeColorClasses(task.typeColor)}`}
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
                              <button
                                type="button"
                                onClick={() => loadTaskDetailForEdit(task)}
                                className="text-[12px] font-semibold text-[#2f3b21] underline-offset-2 hover:underline"
                              >
                                {task}
                              </button>
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
                        {selectedTaskDetail && (
                          <div className="rounded-md border border-[#e2d7b5] bg-[#f9f6e7] p-3 space-y-2">
                            <div className="flex items-center justify-between text-[12px] text-[#4f4b33]">
                              <span className="font-semibold">Editing {selectedTaskDetail.name}</span>
                              {taskDetailLoading && (
                                <span className="text-[11px] text-[#7a7f54]">Loading…</span>
                              )}
                            </div>
                            <div className="space-y-1 text-[12px]">
                              <label className="text-[#5f5a3b]">Description</label>
                              <textarea
                                value={selectedTaskDetail.description}
                                onChange={(e) =>
                                  setSelectedTaskDetail((prev) =>
                                    prev ? { ...prev, description: e.target.value } : prev
                                  )
                                }
                                className="min-h-[80px] w-full rounded-md border border-[#d0c9a4] px-2 py-2 text-sm focus:border-[#8fae4c] focus:outline-none"
                              />
                            </div>
                            <div className="space-y-1 text-[12px]">
                              <label className="text-[#5f5a3b]">Task type</label>
                              <select
                                value={selectedTaskDetail.taskType?.name || ""}
                                onChange={(e) =>
                                  setSelectedTaskDetail((prev) =>
                                    prev
                                      ? {
                                          ...prev,
                                          taskType: {
                                            name: e.target.value,
                                            color:
                                              taskTypes.find((t) => t.name === e.target.value)?.color ||
                                              "default",
                                          },
                                        }
                                      : prev
                                  )
                                }
                                className="w-full rounded-md border border-[#d0c9a4] px-2 py-2 text-sm focus:border-[#8fae4c] focus:outline-none"
                              >
                                <option value="">Uncategorized</option>
                                {taskTypes.map((opt) => (
                                  <option key={opt.name} value={opt.name}>
                                    {opt.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={handleTaskDetailSave}
                                className="rounded-md bg-[#8fae4c] px-3 py-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-[#f9f9ec] shadow-sm transition hover:bg-[#7e9c44]"
                                disabled={taskDetailLoading}
                              >
                                Save changes
                              </button>
                            </div>
                          </div>
                        )}
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

      {reportPreview && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4 py-8">
          <div className="relative w-full max-w-3xl rounded-2xl border border-[#d0c9a4] bg-[#fdfaf1] p-5 shadow-xl">
            <button
              type="button"
              onClick={() => {
                setReportPreview(null);
                setReportBlocks([]);
              }}
              className="absolute right-3 top-3 text-sm font-semibold text-[#4b5133] hover:text-[#2f3b21]"
            >
              Close
            </button>
            <div className="space-y-3">
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-[#7a7f54]">Daily report</p>
                <h2 className="text-xl font-semibold text-[#314123]">{reportPreview.title}</h2>
                <p className="text-[11px] text-[#6b6d4b]">
                  {reportPreview.date ? new Date(reportPreview.date).toLocaleString() : "Undated report"}
                </p>
              </div>
              <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-2">
                {reportLoading && (
                  <p className="text-sm text-[#7a7f54]">Loading report content…</p>
                )}
                {!reportLoading && reportBlocks.map((block) => renderReportBlock(block))}
                {!reportLoading && !reportBlocks.length && (
                  <p className="text-sm text-[#7a7f54]">No content found for this report.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
