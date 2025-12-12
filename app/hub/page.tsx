"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadSession } from "@/lib/session";
import type { TaskMeta } from "./types";

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
  message?: string;
};

type MealAssignment = {
  slotId: string;
  label: string;
  timeRange: string;
  task: string;
  people: string[];
};

type TaskClickPayload = {
  person: string;
  slot: Slot;
  task: string;          // full cell text
  groupNames: string[];  // all people sharing that merged box
};

type TaskComment = {
  id: string;
  text: string;
  createdTime: string;
  author: string;
};

type TaskDetails = {
  name: string;
  description: string;
  status: string;
  comments: TaskComment[];
  media: { name: string; url: string; kind: "image" | "video" | "audio" | "file" }[];
  links?: { label: string; url: string }[];
  taskType?: { name: string; color: string };
  estimatedTime?: string;
};

type TaskTypeOption = { name: string; color: string };
type StatusOption = { name: string; color: string };

function splitCellTasks(cell: string): string[] {
  if (!cell.trim()) return [];

  const [firstLine, ...rest] = cell.split("\n");
  const note = rest.join("\n").trim();

  return firstLine
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => (note ? `${t}\n${note}` : t));
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

export default function HubSchedulePage() {
  const [data, setData] = useState<ScheduleResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState<string | null>(null);
  const [currentUserType, setCurrentUserType] = useState<string | null>(null);
  const [currentSlotId, setCurrentSlotId] = useState<string | null>(null);
  const scheduleScrollRef = useRef<HTMLDivElement | null>(null);

  const [activeView, setActiveView] = useState<"schedule" | "myTasks">(
    "schedule"
  );

  const [taskMetaMap, setTaskMetaMap] = useState<Record<string, TaskMeta>>({});
  const [taskTypes, setTaskTypes] = useState<TaskTypeOption[]>([]);
  const [statusOptions, setStatusOptions] = useState<StatusOption[]>([]);
  
  // Modal state
  const [modalTask, setModalTask] = useState<TaskClickPayload | null>(null);
  const [modalDetails, setModalDetails] = useState<TaskDetails | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);

  const statusColorLookup = useMemo(() => {
    const map: Record<string, string> = {};
    statusOptions.forEach((opt) => {
      map[opt.name] = opt.color;
    });
    return map;
  }, [statusOptions]);

  const isExternalVolunteer =
    (currentUserType || "").toLowerCase() === "external volunteer";

  // Get logged-in user from session
  useEffect(() => {
    const session = loadSession();
    if (session?.name) setCurrentUserName(session.name);
    if (session?.userType) setCurrentUserType(session.userType);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/task-types");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (Array.isArray(json.types)) {
          setTaskTypes(json.types as TaskTypeOption[]);
        }
        if (Array.isArray(json.statuses)) {
          setStatusOptions(json.statuses as StatusOption[]);
        }
        if (Array.isArray(json.types) || Array.isArray(json.statuses)) return;
      } catch (err) {
        console.error("Failed to load task types", err);
      }

      setTaskTypes([
        { name: "General", color: "default" },
        { name: "Animal Care", color: "green" },
        { name: "Field Work", color: "orange" },
        { name: "Maintenance", color: "blue" },
      ]);
      setStatusOptions([
        { name: "Not Started", color: "gray" },
        { name: "In Progress", color: "blue" },
        { name: "Completed", color: "green" },
      ]);
    })();
  }, []);

  // Load schedule data from Notion-backed API (with auto-refresh)
  const loadSchedule = useCallback(
    async (opts: { showLoading?: boolean } = {}) => {
      const { showLoading = false } = opts;
      if (showLoading) setLoading(true);
      setError(null);

      try {
        const res = await fetch("/api/schedule");
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const json = await res.json();
        setData(json);
        setError(json.message || null);
      } catch (e) {
        console.error(e);
        setError("Unable to load schedule. Please refresh.");
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    loadSchedule({ showLoading: true });
    const interval = setInterval(() => loadSchedule(), 45_000);
    return () => clearInterval(interval);
  }, [loadSchedule]);

  // Preload task status/description for tagging
  useEffect(() => {
    if (!data) return;

    const uniqueTasks = new Set<string>();
    data.cells.forEach((row) => {
      row.forEach((cell) => {
        splitCellTasks(cell).forEach((task) => {
          const primary = taskBaseName(task);
          if (primary) uniqueTasks.add(primary);
        });
      });
    });

    const missing = Array.from(uniqueTasks).filter(
      (name) => !taskMetaMap[name]
    );
    if (missing.length === 0) return;

    (async () => {
      const results = await Promise.all(
        missing.map(async (name) => {
          try {
            const res = await fetch(
              `/api/task?name=${encodeURIComponent(name)}`
            );
            if (!res.ok) return null;
            const json = await res.json();
            return {
              key: json.name || name,
              original: name,
              status: json.status || "",
              description: json.description || "",
              typeName: json.taskType?.name || "",
              typeColor: json.taskType?.color || "default",
            } as const;
          } catch (err) {
            console.error("Failed to preload task meta", err);
            return null;
          }
        })
      );

      setTaskMetaMap((prev) => {
        const next = { ...prev } as Record<string, TaskMeta>;
        results.forEach((item) => {
          if (item) {
            next[item.key] = {
              status: item.status,
              description: item.description,
              typeName: item.typeName,
              typeColor: item.typeColor,
            };
            next[item.original] = {
              status: item.status,
              description: item.description,
              typeName: item.typeName,
              typeColor: item.typeColor,
            };
          }
        });
        return next;
      });
    })();
  }, [data, taskMetaMap]);

  // Split slots
  const mealSlots = useMemo(
    () => data?.slots.filter((s) => s.isMeal) ?? [],
    [data]
  );
  const workSlots = useMemo(
    () => data?.slots.filter((s) => !s.isMeal) ?? [],
    [data]
  );

  const standardWorkSlots = useMemo(
    () =>
      workSlots.filter(
        (slot) => !/evening/i.test(slot.label) && !/weekend/i.test(slot.label)
      ),
    [workSlots]
  );

  const eveningSlots = useMemo(
    () =>
      workSlots.filter(
        (slot) => /evening/i.test(slot.label) && !/weekend/i.test(slot.label)
      ),
    [workSlots]
  );

  const weekendSlots = useMemo(
    () => workSlots.filter((slot) => /weekend/i.test(slot.label)),
    [workSlots]
  );

  type CombinedCell = {
    slot: Slot;
    names: string[];
    tasks: { task: string; people: string[] }[];
  };

  const combineSlotAssignments = useCallback(
    (targetSlots: Slot[]): CombinedCell[] => {
      if (!data) return [];

      return targetSlots.map((slot) => {
        const slotIdx = data.slots.findIndex((s) => s.id === slot.id);
        if (slotIdx === -1) {
          return { slot, names: [], tasks: [] };
        }

        const nameSet = new Set<string>();
        const taskMap: Record<string, Set<string>> = {};

        data.people.forEach((person, rowIdx) => {
          const cell = (data.cells[rowIdx]?.[slotIdx] ?? "").trim();
          if (!cell) return;

          const tasks = splitCellTasks(cell);
          tasks.forEach((task) => {
            const key = taskBaseName(task);
            if (!key) return;
            nameSet.add(person);
            if (!taskMap[key]) taskMap[key] = new Set();
            taskMap[key].add(person);
          });
        });

        return {
          slot,
          names: Array.from(nameSet),
          tasks: Object.entries(taskMap).map(([task, people]) => ({
            task,
            people: Array.from(people),
          })),
        };
      });
    },
    [data]
  );

  const eveningCombined = useMemo(
    () => combineSlotAssignments(eveningSlots),
    [combineSlotAssignments, eveningSlots]
  );

  const weekendCombined = useMemo(
    () => combineSlotAssignments(weekendSlots),
    [combineSlotAssignments, weekendSlots]
  );

  const userHasTasksForSlots = useCallback(
    (slots: Slot[]) => {
      if (!data || !currentUserName) return false;

      const me = currentUserName.trim().toLowerCase();
      const rowIdx = data.people.findIndex(
        (person) => person.trim().toLowerCase() === me
      );

      if (rowIdx === -1) return false;

      return slots.some((slot) => {
        const slotIdx = data.slots.findIndex((s) => s.id === slot.id);
        if (slotIdx === -1) return false;

        const cell = (data.cells[rowIdx]?.[slotIdx] ?? "").trim();
        return splitCellTasks(cell).length > 0;
      });
    },
    [data, currentUserName]
  );

  const showEveningSection =
    !isExternalVolunteer &&
    eveningCombined.length > 0 &&
    userHasTasksForSlots(eveningSlots);
  const showWeekendSection =
    weekendCombined.length > 0 && userHasTasksForSlots(weekendSlots);

  const myTasks = useMemo(() => {
    if (!data || !currentUserName) return [] as {
      slot: Slot;
      task: string;
      groupNames: string[];
    }[];

    const rowIndex = data.people.findIndex(
      (p) => p.toLowerCase() === currentUserName.toLowerCase()
    );
    if (rowIndex === -1) return [];

    return (
      workSlots
        .map((slot) => {
          const slotIdx = data.slots.findIndex((s) => s.id === slot.id);
          const cell = (data.cells[rowIndex]?.[slotIdx] ?? "").trim();
          const tasks = splitCellTasks(cell);
          if (tasks.length === 0) return [];

          return tasks.map((task) => {
            const groupNames = data.people.filter((_, idx) => {
              const candidate = (data.cells[idx]?.[slotIdx] ?? "").trim();
              const candidateTasks = splitCellTasks(candidate);
              return candidateTasks.some(
                (ct) => taskBaseName(ct) === taskBaseName(task)
              );
            });

            return { slot, task, groupNames };
          });
        })
        .flat()
        .filter(Boolean) as {
        slot: Slot;
        task: string;
        groupNames: string[];
      }[]
    );
  }, [data, currentUserName, workSlots]);

  // Meal assignments
  const mealAssignments: MealAssignment[] = useMemo(() => {
    if (!data) return [];
    const result: MealAssignment[] = [];
    const { people, slots, cells } = data;

    slots.forEach((slot, slotIndex) => {
      if (!slot.isMeal) return;

      const taskMap: Record<string, Set<string>> = {};
      people.forEach((person, rowIndex) => {
        const cell = cells[rowIndex]?.[slotIndex] ?? "";
        const tasks = splitCellTasks(cell);
        tasks.forEach((task) => {
          const key = taskBaseName(task);
          if (!taskMap[key]) taskMap[key] = new Set();
          taskMap[key].add(person);
        });
      });

      for (const [task, ps] of Object.entries(taskMap)) {
        result.push({
          slotId: slot.id,
          label: slot.label,
          timeRange: slot.timeRange,
          task,
          people: Array.from(ps),
        });
      }
    });

    return result;
  }, [data]);

  const visibleMealSlots = useMemo(
    () =>
      mealSlots.filter((slot) =>
        mealAssignments.some((assignment) => assignment.slotId === slot.id)
      ),
    [mealAssignments, mealSlots]
  );

  const scrollSchedule = (direction: "left" | "right") => {
    const node = scheduleScrollRef.current;
    if (!node) return;
    const delta = direction === "left" ? -320 : 320;
    node.scrollBy({ left: delta, behavior: "smooth" });
  };

  useEffect(() => {
    function updateCurrentSlot(schedule: ScheduleResponse | null) {
      const minutesNow = getNowMinutes();
      let activeId: string | null = null;

      if (!schedule) {
        setCurrentSlotId(null);
        return;
      }

      for (const slot of schedule.slots) {
        if (!slot.timeRange) continue;
        const range = parseTimeRange(slot.timeRange);
        if (!range) continue;

        if (
          minutesNow >= range.startMinutes &&
          minutesNow < range.endMinutes
        ) {
          activeId = slot.id;
          break;
        }
      }

      setCurrentSlotId(activeId);
    }

    // run once immediately with the latest data
    updateCurrentSlot(data);

    // then update every minute, using the latest data from this effect
    const interval = setInterval(() => updateCurrentSlot(data), 60_000);
    return () => clearInterval(interval);
  }, [data]);

  async function loadTaskDetails(
    taskName: string,
    opts: { quiet?: boolean } = {}
  ) {
    const { quiet = false } = opts;
    if (!quiet) setModalLoading(true);

    try {
      const res = await fetch(`/api/task?name=${encodeURIComponent(taskName)}`);
      if (!res.ok) {
        setModalDetails({
          name: taskName,
          description: "",
          status: "",
          comments: [],
          media: [],
          links: [],
          taskType: { name: "", color: "default" },
          estimatedTime: "",
        });
        return;
      }

      const json = await res.json();
      setModalDetails({
        name: json.name || taskName,
        description: json.description || "",
        status: json.status || "",
        comments: json.comments || [],
        media: json.media || json.photos || [],
        links: json.links || [],
        taskType: json.taskType || { name: "", color: "default" },
        estimatedTime: json.estimatedTime || "",
      });
      const metaPayload = {
        status: json.status || "",
        description: json.description || "",
        typeName: json.taskType?.name,
        typeColor: json.taskType?.color,
      };
      setTaskMetaMap((prev) => ({
        ...prev,
        [json.name || taskName]: metaPayload,
        [taskName]: metaPayload,
      }));
    } catch (e) {
      console.error("Failed to load task details:", e);
      setModalDetails({
        name: taskName,
        description: "",
        status: "",
        comments: [],
        media: [],
        links: [],
        taskType: { name: "", color: "default" },
        estimatedTime: "",
      });
    } finally {
      if (!quiet) setModalLoading(false);
    }
  }

  async function updateTaskStatus(newStatus: string, taskName: string) {
    setModalDetails((prev) =>
      prev ? { ...prev, status: newStatus } : prev
    );
    setTaskMetaMap((prev) => ({
      ...prev,
      [taskName]: {
        status: newStatus,
        description: prev[taskName]?.description || "",
        typeName: prev[taskName]?.typeName,
        typeColor: prev[taskName]?.typeColor,
      },
    }));

    try {
      await fetch("/api/task", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: taskName, status: newStatus }),
      });
    } catch (e) {
      console.error("Failed to update task status:", e);
    }
  }

  async function submitTaskComment(taskName: string) {
    if (!commentDraft.trim()) return;
    setCommentSubmitting(true);

    try {
      const comment = currentUserName
        ? `${currentUserName} : ${commentDraft.trim()}`
        : commentDraft.trim();
      const res = await fetch("/api/task", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: taskName, comment }),
      });

      if (res.ok) {
        setCommentDraft("");
        await loadTaskDetails(taskName);
      }
    } catch (e) {
      console.error("Failed to add comment:", e);
    } finally {
      setCommentSubmitting(false);
    }
  }

  // When a task box is clicked
  async function handleTaskClick(taskPayload: TaskClickPayload) {
    setModalTask(taskPayload);
    setModalDetails(null);
    setCommentDraft("");

    const baseTitle = taskBaseName(taskPayload.task || "");
    if (!baseTitle) {
      setModalDetails({
        name: taskPayload.task,
        description: "",
        status: "",
        comments: [],
        media: [],
        links: [],
        taskType: { name: "", color: "default" },
        estimatedTime: "",
      });
      return;
    }

    await loadTaskDetails(baseTitle);
  }

  function closeModal() {
    setModalTask(null);
    setModalDetails(null);
    setCommentDraft("");
  }

  // Auto-refresh task details while the modal is open
  useEffect(() => {
    if (!modalTask) return undefined;
    const taskName = modalTask.task.split("\n")[0].trim();
    if (!taskName) return undefined;

    const interval = setInterval(
      () => loadTaskDetails(taskName, { quiet: true }),
      15_000
    );
    return () => clearInterval(interval);
  }, [modalTask]);

  return (
    <>
      <div className="space-y-8">
        <div className="rounded-lg border border-[#d0c9a4] bg-white/80 px-4 py-3 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#5d7f3b]">
            Schedule date
          </p>
          <p className="text-sm text-[#4b5133]">
            {loading
              ? "Loading schedule…"
              : data?.scheduleDate
              ? `Showing schedule for ${data.scheduleDate}`
              : "No schedule date is configured in Notion yet."}
          </p>
        </div>

        {!isExternalVolunteer && taskTypes.length > 0 && (
          <section className="rounded-lg border border-[#d0c9a4] bg-white/80 px-4 py-3 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#5d7f3b]">
                  Task type guide
                </p>
                <p className="text-xs text-[#7a7f54]">
                  Colors are softened to help you spot categories at a glance.
                </p>
              </div>
            </div>
            <TaskTypeLegend taskTypes={taskTypes} />
          </section>
        )}

        {!isExternalVolunteer && (
          <section>
            <h2 className="text-2xl font-semibold tracking-[0.18em] uppercase text-[#5d7f3b] mb-4">
              Meal Assignments
            </h2>

            {loading && (
              <p className="text-sm text-[#7a7f54]">Loading schedule…</p>
            )}
            {error && <p className="text-sm text-red-700">{error}</p>}

            {!loading && !error && visibleMealSlots.length === 0 && (
              <p className="text-sm text-[#7a7f54]">No meal assignments found.</p>
            )}

            <div className="space-y-4">
              {visibleMealSlots.map((slot) => (
                <MealBlock
                  key={slot.id}
                  slot={slot}
                  assignments={mealAssignments.filter(
                    (a) => a.slotId === slot.id
                  )}
                  currentUserName={currentUserName}
                  taskMetaMap={taskMetaMap}
                />
              ))}
            </div>
          </section>
        )}

        {!isExternalVolunteer && (
          <section className="space-y-3">
            <h2 className="text-2xl font-semibold tracking-[0.18em] uppercase text-[#5d7f3b]">
              Todays Schedule
            </h2>
            <p className="text-sm text-[#7a7f54]">
              Click any task to see its details, description, and who you are
              assigned with.
            </p>

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={() => setActiveView("schedule")}
                className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] border transition ${
                  activeView === "schedule"
                    ? "bg-[#a0b764] text-white border-[#8fae4c]"
                    : "bg-white text-[#5d7f3b] border-[#d0c9a4]"
                }`}
              >
                Schedule
              </button>
              <button
                type="button"
                onClick={() => setActiveView("myTasks")}
                className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] border transition ${
                  activeView === "myTasks"
                    ? "bg-[#a0b764] text-white border-[#8fae4c]"
                    : "bg-white text-[#5d7f3b] border-[#d0c9a4]"
                }`}
              >
                My Tasks
              </button>
            </div>

            <div className="mt-3 rounded-lg bg-[#a0b764] px-3 py-3">
              <div className="rounded-md bg-[#f8f4e3]">
                {loading && (
                  <div className="px-4 py-6 text-sm text-center text-[#7a7f54]">
                    Loading schedule…
                  </div>
                )}
                {error && (
                  <div className="px-4 py-6 text-sm text-center text-red-700">
                    {error}
                  </div>
                )}

                {!loading &&
                  !error &&
                  data &&
                  standardWorkSlots.length > 0 &&
                  activeView === "schedule" && (
                    <>
                      <div className="relative">
                        <div className="pointer-events-none absolute inset-y-0 left-0 right-0 z-10 flex items-center justify-between px-2 sm:hidden">
                          <button
                            type="button"
                            onClick={() => scrollSchedule("left")}
                            className="pointer-events-auto rounded-full bg-white/90 border border-[#d0c9a4] shadow px-2 py-2 text-[#4b522d] hover:-translate-x-0.5 transition"
                            aria-label="Scroll schedule left"
                          >
                            ←
                          </button>
                          <button
                            type="button"
                            onClick={() => scrollSchedule("right")}
                            className="pointer-events-auto rounded-full bg-white/90 border border-[#d0c9a4] shadow px-2 py-2 text-[#4b522d] hover:translate-x-0.5 transition"
                            aria-label="Scroll schedule right"
                          >
                            →
                          </button>
                        </div>
                        <div
                          ref={scheduleScrollRef}
                          className="overflow-x-auto scroll-smooth pb-2"
                        >
                          <ScheduleGrid
                            data={data}
                            workSlots={standardWorkSlots}
                            currentUserName={currentUserName}
                            currentSlotId={currentSlotId}
                            onTaskClick={handleTaskClick}
                            statusMap={taskMetaMap}
                            statusColors={statusColorLookup}
                          />
                        </div>
                      </div>
                    </>
                  )}

                {!loading &&
                  !error &&
                  data &&
                  activeView === "myTasks" && (
                    <div className="px-4 py-4">
                      <MyTasksList
                        tasks={myTasks}
                        onTaskClick={handleTaskClick}
                        statusMap={taskMetaMap}
                        statusColors={statusColorLookup}
                        currentUserName={currentUserName}
                      />
                    </div>
                  )}

                {!loading &&
                  !error &&
                  data &&
                  standardWorkSlots.length === 0 &&
                  activeView === "schedule" && (
                  <div className="px-4 py-6 text-sm text-center text-[#7a7f54]">
                    No work slots defined in this schedule.
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {isExternalVolunteer && (
          <section className="space-y-3">
            <div className="rounded-lg bg-[#a0b764] px-3 py-3 text-sm text-[#f8f4e3] shadow">
              Weekend assignments available for External Volunteers are listed below.
            </div>
          </section>
        )}

        {!loading &&
          !error &&
          data &&
          showEveningSection && (
            <section className="space-y-3">
              <h3 className="text-xl font-semibold tracking-[0.16em] uppercase text-[#5d7f3b]">
                Evening Schedule
              </h3>
              <p className="text-sm text-[#7a7f54]">
                Section for anyone assigned to Evening Shift, task can be completed anytime between 5:30 PM to 10 PM
              </p>
              <div className="rounded-lg bg-[#a0b764] px-3 py-3">
                <div className="rounded-md bg-[#f8f4e3] overflow-x-auto">
                  <table className="min-w-full table-auto border-collapse">
                    <thead>
                      <tr>
                        {eveningCombined.map((cell) => (
                          <th
                            key={cell.slot.id}
                            className="border border-[#e2d7b5] px-3 py-2 text-left text-xs uppercase tracking-[0.12em] text-[#6f7a40]"
                          >
                            <div className="flex flex-col gap-1">
                              <span className="font-semibold text-[#42502d]">{cell.slot.label}</span>
                              {cell.slot.timeRange && (
                                <span className="text-[11px] text-[#8a8256]">{cell.slot.timeRange}</span>
                              )}
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        {eveningCombined.map((cell) => (
                          <td
                            key={cell.slot.id}
                            className="align-top border border-[#e2d7b5] px-3 py-3"
                          >
                            <div className="space-y-2">
                              <p className="text-xs text-[#5d7f3b] font-semibold">
                                Assigned: {cell.names.length ? cell.names.join(", ") : "No one yet"}
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {cell.tasks.length === 0 && (
                                  <span className="text-xs italic text-[#7a7f54]">No tasks listed</span>
                                )}
                                {cell.tasks.map((task) => {
                                  const participants =
                                    task.people.length > 0 ? task.people : cell.names;
                                  const primaryPerson = participants[0] || "Team";
                                  const meta =
                                    taskMetaMap[taskBaseName(task.task)];
                                  const typeClass = typeColorClasses(
                                    meta?.typeColor
                                  );

                                  return (
                                    <button
                                      key={`${cell.slot.id}-${task.task}`}
                                      type="button"
                                      onClick={() =>
                                        handleTaskClick({
                                          person: primaryPerson,
                                          slot: cell.slot,
                                          task: task.task,
                                          groupNames: participants,
                                        })
                                      }
                                      className={`rounded-md border px-3 py-2 text-left shadow-sm hover:shadow transition text-xs ${typeClass}`}
                                    >
                                      <div className="font-semibold text-[#42502d]">{task.task}</div>
                                      <div className="text-[11px] text-[#7a7f54]">
                                        {participants.length ? participants.join(", ") : "No names yet"}
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}

        {!loading &&
          !error &&
          data &&
          showWeekendSection && (
            <section className="space-y-3">
              <h3 className="text-xl font-semibold tracking-[0.16em] uppercase text-[#5d7f3b]">
                Weekend Schedule
              </h3>
              <p className="text-sm text-[#7a7f54]">
                Section for anyone assgined to the Weekend Shift, task can be completed anytime wiithin the specified itme ranges below.
              </p>
              <div className="rounded-lg bg-[#a0b764] px-3 py-3">
                <div className="rounded-md bg-[#f8f4e3] overflow-x-auto">
                  <table className="min-w-full table-auto border-collapse">
                    <thead>
                      <tr>
                        {weekendCombined.map((cell) => (
                          <th
                            key={cell.slot.id}
                            className="border border-[#e2d7b5] px-3 py-2 text-left text-xs uppercase tracking-[0.12em] text-[#6f7a40]"
                          >
                            <div className="flex flex-col gap-1">
                              <span className="font-semibold text-[#42502d]">{cell.slot.label}</span>
                              {cell.slot.timeRange && (
                                <span className="text-[11px] text-[#8a8256]">{cell.slot.timeRange}</span>
                              )}
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        {weekendCombined.map((cell) => (
                          <td
                            key={cell.slot.id}
                            className="align-top border border-[#e2d7b5] px-3 py-3"
                          >
                            <div className="space-y-2">
                              <p className="text-xs text-[#5d7f3b] font-semibold">
                                Assigned: {cell.names.length ? cell.names.join(", ") : "No one yet"}
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {cell.tasks.length === 0 && (
                                  <span className="text-xs italic text-[#7a7f54]">No tasks listed</span>
                                )}
                                {cell.tasks.map((task) => {
                                  const participants =
                                    task.people.length > 0 ? task.people : cell.names;
                                  const primaryPerson = participants[0] || "Team";
                                  const meta =
                                    taskMetaMap[taskBaseName(task.task)];
                                  const typeClass = typeColorClasses(
                                    meta?.typeColor
                                  );

                                  return (
                                    <button
                                      key={`${cell.slot.id}-${task.task}`}
                                      type="button"
                                      onClick={() =>
                                        handleTaskClick({
                                          person: primaryPerson,
                                          slot: cell.slot,
                                          task: task.task,
                                          groupNames: participants,
                                        })
                                      }
                                      className={`rounded-md border px-3 py-2 text-left shadow-sm hover:shadow transition text-xs ${typeClass}`}
                                    >
                                      <div className="font-semibold text-[#42502d]">{task.task}</div>
                                      <div className="text-[11px] text-[#7a7f54]">
                                        {participants.length ? participants.join(", ") : "No names yet"}
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}

        {isExternalVolunteer &&
          !showWeekendSection &&
          !loading &&
          !error &&
          data && (
            <p className="text-sm text-[#7a7f54]">
              No weekend assignments are currently listed for you.
            </p>
          )}
      </div>

      {/* Task detail modal */}
      {modalTask && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={closeModal}
        >
          <div
            className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl bg-[#f8f4e3] border border-[#d0c9a4] px-6 py-5 shadow-2xl transform transition-all duration-200 ease-out scale-100 opacity-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <div className="text-xs uppercase tracking-[0.16em] text-[#7a7f54]">
                  {modalTask.slot.label}
                  {modalTask.slot.timeRange
                    ? ` • ${modalTask.slot.timeRange}`
                    : ""}
                </div>
                <h3 className="mt-1 text-lg font-semibold text-[#3e4c24]">
                  {modalTask.task.split("\n")[0].trim()}
                </h3>
                <p className="mt-1 text-xs text-[#86815a]">
                  For <span className="font-semibold">{modalTask.person}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-full border border-[#d0c9a4] bg-white/80 px-2 py-1 text-xs text-[#6b6b4a] hover:bg-[#ece7d0]"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              {(() => {
                const fallbackMeta =
                  taskMetaMap[taskBaseName(modalTask.task)] || {};
                const typeName =
                  modalDetails?.taskType?.name || fallbackMeta.typeName;
                const typeColor =
                  modalDetails?.taskType?.color || fallbackMeta.typeColor;

                if (!typeName) return null;

                return (
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-2 rounded-full border px-3 py-[4px] text-[11px] font-semibold shadow-sm ${typeColorClasses(
                        typeColor
                      )}`}
                    >
                      <span className="h-2 w-2 rounded-full bg-current opacity-70" />
                      {typeName}
                    </span>
                  </div>
                );
              })()}

              <div className="rounded-lg border border-[#e2d7b5] bg-white/70 px-4 py-3 space-y-3">
                {modalTask.task.includes("\n") && (
                  <div className="whitespace-pre-line text-[11px] leading-snug text-[#44422f] bg-[#f1edd8] border border-[#dfd6b3] rounded-md px-3 py-2">
                    {modalTask.task
                      .split("\n")
                      .slice(1)
                      .join("\n")
                      .trim() || "No additional notes."}
                  </div>
                )}

                <div className="space-y-1">
                  <p className="text-[10px] uppercase tracking-[0.12em] text-[#8a8256]">
                    Task description
                  </p>
                  {modalLoading ? (
                    <p className="text-[11px] italic text-[#8e875d]">
                      Loading task details…
                    </p>
                  ) : modalDetails?.description ? (
                    <p className="text-[12px] leading-snug text-[#4f4b33]">
                      {modalDetails.description}
                    </p>
                  ) : (
                    <p className="text-[11px] italic text-[#a19a70]">
                      No extra description available yet.
                    </p>
                  )}
                </div>

                {!modalLoading && modalDetails?.estimatedTime ? (
                  <div className="space-y-1">
                    <p className="text-[10px] uppercase tracking-[0.12em] text-[#8a8256]">
                      Estimated Time for Completion
                    </p>
                    <p className="text-[12px] font-semibold text-[#3e4c24]">
                      {modalDetails.estimatedTime}
                    </p>
                  </div>
                ) : null}

                  {!modalLoading && modalDetails?.links?.length ? (
                    <div className="space-y-2">
                      <p className="text-[10px] uppercase tracking-[0.12em] text-[#8a8256]">
                        Relevant Links
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {modalDetails.links.map((link) => (
                        <a
                          key={`${link.url}-${link.label}`}
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-full border border-[#cdd7ab] bg-white/80 px-3 py-1 text-[12px] font-semibold text-[#2f5ba0] underline underline-offset-2 hover:bg-[#f1edd8]"
                        >
                          {link.label || link.url}
                        </a>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="text-[11px] text-[#666242]">
                  {(() => {
                    const me = modalTask.person.toLowerCase();
                    const others = modalTask.groupNames.filter(
                      (n) => n.toLowerCase() !== me
                    );

                    if (others.length === 0) {
                      return (
                        <span>
                          <span className="font-semibold">Assigned with:</span>{" "}
                          (no one else – solo task)
                        </span>
                      );
                    }

                    return (
                      <span>
                        <span className="font-semibold">Assigned with:</span>{" "}
                        {others.join(", ")}
                      </span>
                    );
                  })()}
                </div>
              </div>

              <div className="rounded-lg border border-[#e2d7b5] bg-white/70 px-4 py-3 space-y-3">
                <div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.12em] text-[#8a8256]">
                        Comments
                      </p>
                      <p className="text-[11px] text-[#6a6748]">
                        This is for comments, feedback, concerns, and request.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="max-h-40 space-y-2 overflow-y-auto pr-1">
                  {modalLoading && (
                    <p className="text-[11px] italic text-[#8e875d]">
                      Loading comments…
                    </p>
                  )}
                  {!modalLoading && modalDetails?.comments?.length === 0 && (
                    <p className="text-[11px] text-[#7a7f54] italic">
                      No comments yet.
                    </p>
                  )}
                  {!modalLoading &&
                    modalDetails?.comments?.map((comment) => (
                      <div
                        key={comment.id}
                        className="rounded-md border border-[#e1d8b6] bg-[#f7f3de] px-3 py-2"
                      >
                        <p className="text-[12px] text-[#3f3c2d] leading-snug">
                          {comment.text || "(No text)"}
                        </p>
                        <p className="mt-1 text-[10px] text-[#8a8256]">
                          {comment.author || "Unknown"} • {new Date(comment.createdTime).toLocaleString()}
                        </p>
                      </div>
                    ))}
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    type="text"
                    value={commentDraft}
                    onChange={(e) => setCommentDraft(e.target.value)}
                    placeholder="Add a comment"
                    className="flex-1 rounded-md border border-[#d0c9a4] bg-white px-3 py-2 text-sm text-[#3f3c2d] shadow-inner focus:outline-none focus:ring-2 focus:ring-[#8fae4c]"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      submitTaskComment(modalDetails?.name || modalTask.task)
                    }
                    disabled={commentSubmitting || !commentDraft.trim()}
                    className="w-full sm:w-auto rounded-md bg-[#a0b764] px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#f9f9ec] shadow-md hover:bg-[#95ad5e] disabled:opacity-60"
                  >
                    {commentSubmitting ? "Posting…" : "Post"}
                  </button>
                </div>
              </div>

              <div className="rounded-lg border border-[#e2d7b5] bg-white/70 px-4 py-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.12em] text-[#8a8256]">
                      Task Media
                    </p>
                    <p className="text-[11px] text-[#6a6748]">
                      Existing media for this task.
                    </p>
                  </div>
                </div>
                <div className="space-y-2">
                  {modalDetails?.media?.length ? (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {modalDetails.media.map((item) => {
                        if (item.kind === "video") {
                          return (
                            <div
                              key={item.url}
                              className="overflow-hidden rounded-md border border-[#e2d7b5] bg-[#f7f3de]"
                            >
                              <video
                                src={item.url}
                                controls
                                className="h-36 w-full object-cover"
                              />
                              <p className="truncate px-2 py-1 text-[10px] text-[#5b593c]">
                                {item.name}
                              </p>
                            </div>
                          );
                        }

                        if (item.kind === "audio") {
                          return (
                            <div
                              key={item.url}
                              className="rounded-md border border-[#e2d7b5] bg-[#f7f3de] p-2"
                            >
                              <p className="truncate text-[11px] font-semibold text-[#5b593c]">
                                {item.name}
                              </p>
                              <audio src={item.url} controls className="mt-2 w-full" />
                            </div>
                          );
                        }

                        return (
                          <a
                            key={item.url}
                            href={item.url}
                            target="_blank"
                            rel="noreferrer"
                            className="group block overflow-hidden rounded-md border border-[#e2d7b5] bg-[#f7f3de]"
                          >
                            <div className="aspect-square w-full overflow-hidden">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={item.url}
                                alt={item.name}
                                className="h-full w-full object-cover transition group-hover:scale-105"
                              />
                            </div>
                            <p className="truncate px-2 py-1 text-[10px] text-[#5b593c]">
                              {item.name}
                            </p>
                          </a>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-[11px] text-[#7a7f54] italic">
                      No media uploaded for this task yet.
                    </p>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-[#e2d7b5] bg-white/70 px-4 py-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.12em] text-[#8a8256]">
                      Status update
                    </p>
                    <p className="text-[11px] text-[#6a6748]">
                      Update Task Status
                    </p>
                  </div>
                  <StatusBadge
                    status={modalDetails?.status}
                    color={statusColorLookup[modalDetails?.status || ""]}
                  />
                </div>
                <select
                  value={modalDetails?.status || ""}
                  onChange={(e) =>
                    updateTaskStatus(
                      e.target.value,
                      modalDetails?.name || modalTask.task
                    )
                  }
                  className="w-full rounded-md border border-[#d0c9a4] bg-white px-3 py-2 text-sm text-[#3f3c2d] shadow-inner focus:outline-none focus:ring-2 focus:ring-[#8fae4c]"
                  disabled={!modalDetails || modalLoading}
                >
                  <option value="" disabled>
                    Select a status
                  </option>
                  {statusOptions.map((option, idx) => (
                    <option key={option.name} value={option.name}>
                      {idx + 1}. {option.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-md border border-[#d0c9a4] bg-white/80 px-4 py-2 text-xs font-medium text-[#6b6b4a] hover:bg-[#ece7d0]"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ---------- Meal block ---------- */

function MealBlock({
  slot,
  assignments,
  currentUserName,
  taskMetaMap,
}: {
  slot: Slot;
  assignments: MealAssignment[];
  currentUserName: string | null;
  taskMetaMap?: Record<string, TaskMeta>;
}) {
  const icon = getMealIcon(slot.label);
  const normalizedUser = currentUserName?.toLowerCase() ?? "";

  return (
    <div className="rounded-lg bg-[#f5f0cd] border border-[#efe4b1] shadow-sm">
      <div className="flex items-center gap-2 border-b border-[#f1e6b9] px-4 py-2">
        <span className="text-lg">{icon}</span>
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-[#5d7f3b]">
            {slot.label}
          </span>
          {slot.timeRange && (
            <span className="text-xs text-[#9b8e4e]">{slot.timeRange}</span>
          )}
        </div>
      </div>

      <div className="px-4 py-3 space-y-2">
        {assignments.map((a) => {
          const includesUser = a.people.some(
            (p) => p.toLowerCase() === normalizedUser
          );
          const meta = taskMetaMap?.[taskBaseName(a.task)];
          const typeClass = typeColorClasses(meta?.typeColor);

          return (
            <button
              key={a.task}
              type="button"
              className={`w-full text-left rounded-md border px-3 py-2 flex items-center justify-between text-sm shadow-sm transition ${typeClass} ${
                includesUser ? "ring-2 ring-[#f0d38d]" : "hover:shadow"
              }`}
            >
              <span className="text-[#5b5a3a]">{a.task}</span>
              <span className="text-[#7c7a4a] text-xs font-medium">
                {a.people.map((p, idx) => {
                  const isMe = p.toLowerCase() === normalizedUser;
                  return (
                    <span key={p}>
                      {idx > 0 && ", "}
                      {isMe ? (
                        <span className="font-semibold underline">{p}</span>
                      ) : (
                        p
                      )}
                    </span>
                  );
                })}
              </span>
            </button>
          );
        })}

        {assignments.length === 0 && (
          <p className="text-xs text-[#7a7f54] italic">
            No assignments in this time block.
          </p>
        )}
      </div>
    </div>
  );
}

function getMealIcon(label: string): string {
  if (/breakfast/i.test(label)) return "🥚";
  if (/lunch/i.test(label)) return "🍱";
  if (/dinner/i.test(label)) return "🍽️";
  return "🍽️";
}

function StatusBadge({ status, color }: { status?: string; color?: string }) {
  if (!status) return null;

  const badgeClass = typeColorClasses(color);

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-[2px] text-[10px] font-semibold uppercase tracking-[0.12em] ${badgeClass}`}
    >
      <span className="h-2 w-2 rounded-full bg-current opacity-80" />
      {status}
    </span>
  );
}

function TaskTypeLegend({ taskTypes }: { taskTypes: TaskTypeOption[] }) {
  if (!taskTypes.length) return null;

  return (
    <div className="flex flex-wrap gap-2 pt-1">
      {taskTypes.map((type) => (
        <span
          key={type.name}
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-[4px] text-[11px] font-semibold shadow-sm ${typeColorClasses(
            type.color
          )}`}
        >
          <span className="h-2 w-2 rounded-full bg-current opacity-70" />
          {type.name}
        </span>
      ))}
    </div>
  );
}

function MyTasksList({
  tasks,
  onTaskClick,
  statusMap = {},
  statusColors = {},
  currentUserName,
}: {
  tasks: { slot: Slot; task: string; groupNames: string[] }[];
  onTaskClick?: (payload: TaskClickPayload) => void;
  statusMap?: Record<string, TaskMeta>;
  statusColors?: Record<string, string>;
  currentUserName?: string | null;
}) {
  if (tasks.length === 0) {
    return (
      <p className="text-sm text-[#7a7f54] italic">
        No tasks assigned to you for this schedule.
      </p>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {tasks.map(({ slot, task, groupNames }) => {
        const primary = taskBaseName(task);
        const meta = statusMap[primary];
        const status = meta?.status || "";
        const description = meta?.description || "";
        const typeClass = typeColorClasses(meta?.typeColor);

        return (
          <button
            key={`${primary}-${slot.id}`}
            type="button"
            onClick={() =>
              onTaskClick?.({
                person: currentUserName || "Me",
                slot,
                task,
                groupNames,
              })
            }
            className={`w-full rounded-lg border px-4 py-3 text-left shadow-sm hover:border-[#b8c98a] hover:shadow ${typeClass}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[11px] uppercase tracking-[0.12em] text-[#7a7f54]">
                  {slot.label}
                  {slot.timeRange ? ` • ${slot.timeRange}` : ""}
                </p>
                <p className="text-sm font-semibold text-[#3e4c24]">{primary}</p>
                {description && (
                  <p className="mt-1 text-[12px] text-[#4f4b33] leading-snug">
                    {description}
                  </p>
                )}
              </div>
              <StatusBadge
                status={status}
                color={statusColors[status || ""]}
              />
            </div>
            {task.includes("\n") && (
              <p className="mt-1 whitespace-pre-line text-[11px] text-[#5b593c]">
                {task
                  .split("\n")
                  .slice(1)
                  .join("\n")}
              </p>
            )}
            <p className="mt-2 text-[11px] text-[#6a6748]">
              {groupNames.length > 1
                ? `With ${groupNames
                    .filter(
                      (g) =>
                        currentUserName &&
                        g.toLowerCase() !== currentUserName.toLowerCase()
                    )
                    .join(", ")}`
                : "Solo shift"}
            </p>
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Grid schedule ---------- */

function ScheduleGrid({
  data,
  workSlots,
  currentUserName,
  currentSlotId,
  onTaskClick,
  statusMap = {},
  statusColors = {},
}: {
  data: ScheduleResponse;
  workSlots: Slot[];
  currentUserName: string | null;
  currentSlotId: string | null;
  onTaskClick?: (payload: TaskClickPayload) => void;
  statusMap?: Record<string, TaskMeta>;
  statusColors?: Record<string, string>;
}) {
  const { people, slots, cells } = data;

  const workSlotIndices = workSlots
    .map((slot) => slots.findIndex((s) => s.id === slot.id))
    .filter((idx) => idx !== -1);

  const numRows = people.length;
  const numCols = workSlotIndices.length;

  const normalizedUser = currentUserName?.toLowerCase() ?? "";
  const baseRowHeight = 72;
  const baseIndex = people.findIndex(
    (p) => p.toLowerCase() === normalizedUser
  );
  const originalIndices = people.map((_, idx) => idx);

  const similarity = (a: number, b: number) => {
    let score = 0;
    let streak = 0;
    let bestStreak = 0;
    workSlotIndices.forEach((slotIdx) => {
      const taskA = (cells[a]?.[slotIdx] ?? "").trim();
      const taskB = (cells[b]?.[slotIdx] ?? "").trim();
      if (taskA && taskA === taskB) {
        score++;
        streak++;
        if (streak > bestStreak) bestStreak = streak;
      } else {
        streak = 0;
      }
    });
    return score + bestStreak * 0.5;
  };

  const remaining = [...originalIndices];
  const rowOrder: number[] = [];

  if (baseIndex !== -1) {
    const basePos = remaining.indexOf(baseIndex);
    if (basePos !== -1) remaining.splice(basePos, 1);
    rowOrder.push(baseIndex);
  } else if (remaining.length) {
    rowOrder.push(remaining.shift()!);
  }

  while (remaining.length) {
    let bestIdx = 0;
    let bestScore = -1;

    remaining.forEach((idx, i) => {
      const sharedWithPlaced = rowOrder.reduce(
        (sum, existing) => sum + similarity(existing, idx),
        0
      );
      const userBoost = baseIndex !== -1 ? similarity(baseIndex, idx) : 0;
      const score = sharedWithPlaced + userBoost;

      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    });

    rowOrder.push(remaining.splice(bestIdx, 1)[0]);
  }

  const orderedPeople = rowOrder.map((i) => people[i]);

  // Merge data
  const rowSpan: number[][] = Array.from({ length: numRows }, () =>
    Array(numCols).fill(1)
  );
  const colSpan: number[][] = Array.from({ length: numRows }, () =>
    Array(numCols).fill(1)
  );
  const showCell: boolean[][] = Array.from({ length: numRows }, () =>
    Array(numCols).fill(true)
  );

  for (let c = 0; c < numCols; c++) {
    const slotIndex = workSlotIndices[c];
    let r = 0;
    while (r < numRows) {
      const baseRow = rowOrder[r];
      const task = (cells[baseRow]?.[slotIndex] ?? "").trim();

      if (!task) {
        rowSpan[r][c] = 1;
        r++;
        continue;
      }

      let end = r + 1;
      while (end < numRows) {
        const nextRow = rowOrder[end];
        const nextTask = (cells[nextRow]?.[slotIndex] ?? "").trim();
        if (nextTask !== task) break;
        end++;
      }

      const span = end - r;
      rowSpan[r][c] = span;
      for (let rr = r + 1; rr < end; rr++) {
        showCell[rr][c] = false;
      }

      r = end;
    }
  }

  // Merge horizontally across consecutive shifts for the same task
  for (let r = 0; r < numRows; r++) {
    let c = 0;
    while (c < numCols) {
      if (!showCell[r][c]) {
        c++;
        continue;
      }

      const slotIndex = workSlotIndices[c];
      const baseRow = rowOrder[r];
      const baseTask = (cells[baseRow]?.[slotIndex] ?? "").trim();
      if (!baseTask) {
        c++;
        continue;
      }

      const spanDown = rowSpan[r][c];
      let colSpanCount = 1;
      let nextCol = c + 1;

      while (nextCol < numCols) {
        if (!showCell[r][nextCol]) break;
        if (rowSpan[r][nextCol] !== spanDown) break;

        const nextSlotIndex = workSlotIndices[nextCol];
        let allMatch = true;
        for (let offset = 0; offset < spanDown; offset++) {
          const vr = r + offset;
          const realRow = rowOrder[vr];
          const compareBase = (cells[realRow]?.[slotIndex] ?? "").trim();
          const compareNext = (cells[realRow]?.[nextSlotIndex] ?? "").trim();
          if (!compareBase || compareBase !== compareNext) {
            allMatch = false;
            break;
          }
        }

        if (!allMatch) break;

        colSpanCount++;
        showCell[r][nextCol] = false;
        nextCol++;
      }

      colSpan[r][c] = colSpanCount;
      c += colSpanCount;
    }
  }

  return (
    <table className="w-full min-w-[720px] border-collapse text-xs">
      <thead>
        <tr className="bg-[#e5e7c5]">
          <th className="border border-[#d1d4aa] px-3 py-2 text-left w-40 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#5d7f3b]">
            Person
          </th>
          {workSlots.map((slot) => {
            const isCurrent = slot.id === currentSlotId;
            return (
              <th
                key={slot.id}
                className={`border border-[#d1d4aa] px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.12em]
                  ${
                    isCurrent
                      ? "bg-[#cfe4ac] text-[#365120] shadow-inner"
                      : "bg-[#e5e7c5] text-[#5d7f3b]"
                  }`}
              >
                <div className="flex items-center gap-2">
                  <div>
                    <div>{slot.label}</div>
                    {slot.timeRange && (
                      <div className="text-[10px] text-[#7a7f54] normal-case">
                        {slot.timeRange}
                      </div>
                    )}
                  </div>
                  {isCurrent && (
                    <span className="inline-flex items-center rounded-full bg-white/80 px-2 py-[1px] text-[9px] font-semibold text-[#476524]">
                      Now
                    </span>
                  )}
                </div>
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {orderedPeople.map((person, visualRow) => {
          const realRow = rowOrder[visualRow];
          const isCurrentUser =
            person.toLowerCase() === normalizedUser && !!normalizedUser;

          return (
            <tr
              key={person}
              className={
                visualRow % 2 === 0 ? "bg-[#faf8ea]" : "bg-[#f4f2df]"
              }
            >
              <td className="border border-[#d1d4aa] px-3 py-2 align-top">
                <span
                  className={
                    "text-sm " +
                    (isCurrentUser
                      ? "font-bold text-[#3e4c24]"
                      : "font-semibold text-[#4f5730]")
                  }
                >
                  {person}
                </span>
              </td>

              {workSlotIndices.map((slotIndex, cIdx) => {
                if (!showCell[visualRow][cIdx]) return null;

                const slot = slots[slotIndex];
                const isCurrentCol = slot.id === currentSlotId;
                const task = (cells[realRow]?.[slotIndex] ?? "").trim();

                if (!task) {
                  return (
                    <td
                      key={`${visualRow}-${slotIndex}`}
                      rowSpan={rowSpan[visualRow][cIdx]}
                      style={{
                        minHeight: `${rowSpan[visualRow][cIdx] * baseRowHeight}px`,
                      }}
                    className={`border border-[#d1d4aa] p-1 align-top h-full ${
                      isCurrentCol ? "bg-[#f0f4de]" : ""
                    }`}
                  />
                );
              }

                const span = rowSpan[visualRow][cIdx];
                const spanHeight = span * baseRowHeight;

                // Collect all people in this merged box
                const groupNames: string[] = [];
                for (let offset = 0; offset < span; offset++) {
                  const vr = visualRow + offset;
                  const realIndex = rowOrder[vr];
                  groupNames.push(people[realIndex]);
                }

                const sharedCount = groupNames.length;
                const taskEntries = splitCellTasks(task);
                const displayTasks = taskEntries.length ? taskEntries : [task];

                return (
                  <td
                    key={`${visualRow}-${slotIndex}`}
                    rowSpan={span}
                    colSpan={colSpan[visualRow][cIdx]}
                    style={{ minHeight: `${spanHeight}px` }}
                    className={`border border-[#d1d4aa] p-1 align-top h-full ${
                      isCurrentCol ? "bg-[#f0f4de]" : ""
                    }`}
                  >
                    <div className="flex h-full w-full flex-col gap-2">
                      {displayTasks.map((taskText, idx) => {
                        const primaryTitle = taskBaseName(taskText);
                        const meta = statusMap[primaryTitle];
                        const note = taskText
                          .split("\n")
                          .slice(1)
                          .join("\n");
                        const perHeight = Math.max(
                          spanHeight / displayTasks.length,
                          baseRowHeight * 0.7
                        );

                        return (
                          <button
                            key={`${visualRow}-${slotIndex}-${primaryTitle}-${idx}`}
                            type="button"
                            onClick={() =>
                              onTaskClick?.({
                                person,
                                slot,
                                task: taskText,
                                groupNames,
                              })
                            }
                            style={{ minHeight: `${perHeight}px` }}
                            className={`flex h-full min-h-full w-full flex-col justify-between gap-2 text-left rounded-md border p-2 text-[11px] leading-snug shadow-sm focus:outline-none focus:ring-2 focus:ring-[#8fae4c] ${typeColorClasses(
                              meta?.typeColor
                            )}`}
                          >
                            <div className="flex justify-between items-start gap-2">
                              <span className="font-semibold">{primaryTitle}</span>
                              {sharedCount > 1 && (
                                <span className="text-[9px] text-[#4f4f31] bg-white/70 rounded-full px-2 py-[1px]">
                                  {sharedCount} people
                                </span>
                              )}
                            </div>
                            <div className="mt-1">
                              <StatusBadge
                                status={meta?.status}
                                color={statusColors[meta?.status || ""]}
                              />
                            </div>
                            {note && (
                              <div className="mt-1 whitespace-pre-line opacity-90">
                                {note}
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function ScheduleGridMobile({
  data,
  workSlots,
  currentSlotId,
  onTaskClick,
  statusMap = {},
}: {
  data: ScheduleResponse;
  workSlots: Slot[];
  currentSlotId: string | null;
  onTaskClick?: (payload: TaskClickPayload) => void;
  statusMap?: Record<string, TaskMeta>;
}) {
  const slotIndexMap: Record<string, number> = {};
  data.slots.forEach((slot, idx) => {
    slotIndexMap[slot.id] = idx;
  });

  return (
    <div className="space-y-3">
      {data.people.map((person, rowIdx) => (
        <div
          key={person}
          className="rounded-lg border border-[#d1d4aa] bg-[#faf8ea] shadow-sm"
        >
          <div className="flex items-center justify-between border-b border-[#d1d4aa] px-3 py-2">
            <p className="text-sm font-semibold text-[#4f5730]">{person}</p>
            <span className="text-[11px] uppercase tracking-[0.12em] text-[#7a7f54]">
              Tasks
            </span>
          </div>
          <div className="space-y-2 px-3 pb-3 pt-2">
            {workSlots.map((slot) => {
              const slotIndex = slotIndexMap[slot.id];
              const task = (data.cells[rowIdx]?.[slotIndex] ?? "").trim();
              if (!task) return null;

              const groupNames = data.people.filter((_, idx) => {
                const candidate = (data.cells[idx]?.[slotIndex] ?? "").trim();
                return candidate && candidate === task;
              });

              const isCurrent = slot.id === currentSlotId;
              const primaryTitle = task.split("\n")[0].trim();
              const status = statusMap[primaryTitle]?.status || "";

              return (
                <button
                  key={`${person}-${slot.id}`}
                  type="button"
                  onClick={() =>
                    onTaskClick?.({
                      person,
                      slot,
                      task,
                      groupNames,
                    })
                  }
                  className={`w-full rounded-md border px-3 py-2 text-left shadow-sm transition bg-white ${
                    isCurrent ? "border-[#b8c98a]" : "border-[#e2d7b5]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                        <p className="text-[11px] uppercase tracking-[0.12em] text-[#7a7f54]">
                          {slot.label}
                        </p>
                        {slot.timeRange && (
                          <p className="text-[10px] text-[#8a8256]">{slot.timeRange}</p>
                        )}
                      </div>
                      <StatusBadge status={status} />
                    {isCurrent && (
                      <span className="mt-1 inline-flex items-center rounded-full bg-[#eef5dd] px-2 py-[1px] text-[10px] font-semibold text-[#476524]">
                        Now
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-sm font-semibold text-[#3f4630]">
                    {task.split("\n")[0].trim()}
                  </div>
                  {task.includes("\n") && (
                    <div className="mt-1 whitespace-pre-line text-[11px] text-[#55513a]">
                      {task
                        .split("\n")
                        .slice(1)
                        .join("\n")}
                    </div>
                  )}
                  <p className="mt-1 text-[11px] text-[#6a6748]">
                    With {groupNames.join(", ")}
                  </p>
                </button>
              );
            })}

            {workSlots.every((slot) => {
              const idx = slotIndexMap[slot.id];
              const task = (data.cells[rowIdx]?.[idx] ?? "").trim();
              return !task;
            }) && (
              <p className="text-[11px] text-[#7a7f54] italic">
                No tasks scheduled for this person.
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------- Time helpers ---------- */

function getNowMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function parseTimeRange(
  range: string
): { startMinutes: number; endMinutes: number } | null {
  const pattern =
    /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*[-–]\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i;
  const match = range.match(pattern);
  if (!match) return null;

  const [, h1Str, m1Str, ampm1, h2Str, m2Str, ampm2] = match;

  const h1 = parseInt(h1Str, 10);
  const m1 = m1Str ? parseInt(m1Str, 10) : 0;
  const h2 = parseInt(h2Str, 10);
  const m2 = m2Str ? parseInt(m2Str, 10) : 0;

  const startMinutes = toMinutes(h1, m1, ampm1 as string | undefined);
  const endMinutes = toMinutes(h2, m2, ampm2 as string | undefined, ampm1);

  return { startMinutes, endMinutes };
}

function toMinutes(
  hour: number,
  minute: number,
  ampm?: string,
  fallbackAmpm?: string
): number {
  let h = hour;
  let meridiem = ampm?.toLowerCase() as "am" | "pm" | undefined;

  if (!meridiem && fallbackAmpm) {
    meridiem = fallbackAmpm.toLowerCase() as "am" | "pm";
  }

  if (meridiem === "pm" && h < 12) h += 12;
  if (meridiem === "am" && h === 12) h = 0;

  return h * 60 + minute;
}