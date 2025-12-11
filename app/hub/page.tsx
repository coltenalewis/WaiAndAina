"use client";

import { useEffect, useMemo, useState } from "react";
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
};

export default function HubSchedulePage() {
  const [data, setData] = useState<ScheduleResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState<string | null>(null);
  const [currentSlotId, setCurrentSlotId] = useState<string | null>(null);

  // Modal state
  const [modalTask, setModalTask] = useState<TaskClickPayload | null>(null);
  const [modalDetails, setModalDetails] = useState<TaskDetails | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);

  const statusOptions = [
    "Not Started",
    "Incomplete",
    "In Progress",
    "Completed",
  ];

  // Get logged-in user from session
  useEffect(() => {
    const session = loadSession();
    if (session?.name) setCurrentUserName(session.name);
  }, []);

  // Load schedule data from Notion-backed API
  useEffect(() => {
    async function loadSchedule() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/schedule");
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const json = await res.json();
        setData(json);
      } catch (e) {
        console.error(e);
        setError("Unable to load schedule. Please refresh.");
      } finally {
        setLoading(false);
      }
    }

    loadSchedule();
  }, []);

  // Split slots
  const mealSlots = useMemo(
    () => data?.slots.filter((s) => s.isMeal) ?? [],
    [data]
  );
  const workSlots = useMemo(
    () => data?.slots.filter((s) => !s.isMeal) ?? [],
    [data]
  );

  // Meal assignments
  const mealAssignments: MealAssignment[] = useMemo(() => {
    if (!data) return [];
    const result: MealAssignment[] = [];
    const { people, slots, cells } = data;

    slots.forEach((slot, slotIndex) => {
      if (!slot.isMeal) return;

      const taskMap: Record<string, string[]> = {};
      people.forEach((person, rowIndex) => {
        const task = cells[rowIndex]?.[slotIndex] ?? "";
        if (!task.trim()) return;
        const key = task.trim();
        if (!taskMap[key]) taskMap[key] = [];
        taskMap[key].push(person);
      });

      for (const [task, ps] of Object.entries(taskMap)) {
        result.push({
          slotId: slot.id,
          label: slot.label,
          timeRange: slot.timeRange,
          task,
          people: ps,
        });
      }
    });

    return result;
  }, [data]);

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

  async function loadTaskDetails(taskName: string) {
    setModalLoading(true);

    try {
      const res = await fetch(`/api/task?name=${encodeURIComponent(taskName)}`);
      if (!res.ok) {
        setModalDetails({
          name: taskName,
          description: "",
          status: "",
          comments: [],
        });
        return;
      }

      const json = await res.json();
      setModalDetails({
        name: json.name || taskName,
        description: json.description || "",
        status: json.status || "",
        comments: json.comments || [],
      });
    } catch (e) {
      console.error("Failed to load task details:", e);
      setModalDetails({
        name: taskName,
        description: "",
        status: "",
        comments: [],
      });
    } finally {
      setModalLoading(false);
    }
  }

  async function updateTaskStatus(newStatus: string, taskName: string) {
    setModalDetails((prev) =>
      prev ? { ...prev, status: newStatus } : prev
    );

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
      const comment = commentDraft.trim();
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
  async function handleTaskClick(payload: TaskClickPayload) {
    setModalTask(payload);
    setModalDetails(null);
    setCommentDraft("");

    const primaryTitle = payload.task.split("\n")[0].trim();
    if (!primaryTitle) {
      setModalDetails({
        name: payload.task,
        description: "",
        status: "",
        comments: [],
      });
      return;
    }

    await loadTaskDetails(primaryTitle);
  }

  function closeModal() {
    setModalTask(null);
    setModalDetails(null);
    setCommentDraft("");
  }

  return (
    <>
      <div className="space-y-8">
        {/* Meal Assignments */}
        <section>
          <h2 className="text-2xl font-semibold tracking-[0.18em] uppercase text-[#5d7f3b] mb-4">
            Meal Assignments
          </h2>

          {loading && (
            <p className="text-sm text-[#7a7f54]">Loading schedule…</p>
          )}
          {error && <p className="text-sm text-red-700">{error}</p>}

          {!loading && !error && mealSlots.length === 0 && (
            <p className="text-sm text-[#7a7f54]">No meal assignments found.</p>
          )}

          <div className="space-y-4">
            {mealSlots.map((slot) => (
              <MealBlock
                key={slot.id}
                slot={slot}
                assignments={mealAssignments.filter(
                  (a) => a.slotId === slot.id
                )}
                currentUserName={currentUserName}
              />
            ))}
          </div>
        </section>

        {/* Grid schedule */}
        <section className="space-y-3">
          <h2 className="text-2xl font-semibold tracking-[0.18em] uppercase text-[#5d7f3b]">
            Todays Schedule
          </h2>
          <p className="text-sm text-[#7a7f54]">
            Click any task to see its details, description, and who you are
            assigned with.
          </p>

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

              {!loading && !error && data && workSlots.length > 0 && (
                <>
                  <div className="hidden md:block overflow-x-auto">
                    <ScheduleGrid
                      data={data}
                      workSlots={workSlots}
                      currentUserName={currentUserName}
                      currentSlotId={currentSlotId}
                      onTaskClick={handleTaskClick}
                    />
                  </div>
                  <div className="md:hidden">
                    <ScheduleGridMobile
                      data={data}
                      workSlots={workSlots}
                      currentSlotId={currentSlotId}
                      onTaskClick={handleTaskClick}
                    />
                  </div>
                </>
              )}

              {!loading && !error && data && workSlots.length === 0 && (
                <div className="px-4 py-6 text-sm text-center text-[#7a7f54]">
                  No work slots defined in this schedule.
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* Task detail modal */}
      {modalTask && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={closeModal}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-[#f8f4e3] border border-[#d0c9a4] px-6 py-5 shadow-2xl transform transition-all duration-200 ease-out scale-100 opacity-100"
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
                      Status update
                    </p>
                    <p className="text-[11px] text-[#6a6748]">
                      Choose a status to update this task in Notion.
                    </p>
                  </div>
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
                  {statusOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
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
}: {
  slot: Slot;
  assignments: MealAssignment[];
  currentUserName: string | null;
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

          return (
            <button
              key={a.task}
              type="button"
              onClick={() =>
                console.log("Meal task clicked", {
                  slot: slot.label,
                  task: a.task,
                  people: a.people,
                })
              }
              className={`w-full text-left rounded-md border px-3 py-2 flex items-center justify-between text-sm shadow-sm transition
                ${
                  includesUser
                    ? "bg-[#ffeec5] border-[#f0d38d]"
                    : "bg-[#f9f2d8] border-[#f1e6b9] hover:bg-[#f3ebcf]"
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
  return "🍽️";
}

/* ---------- Grid schedule ---------- */

function ScheduleGrid({
  data,
  workSlots,
  currentUserName,
  currentSlotId,
  onTaskClick,
}: {
  data: ScheduleResponse;
  workSlots: Slot[];
  currentUserName: string | null;
  currentSlotId: string | null;
  onTaskClick?: (payload: TaskClickPayload) => void;
}) {
  const { people, slots, cells } = data;

  const workSlotIndices = slots
    .map((s, idx) => ({ s, idx }))
    .filter(({ s }) => !s.isMeal)
    .map(({ idx }) => idx);

  const numRows = people.length;
  const numCols = workSlotIndices.length;

  const normalizedUser = currentUserName?.toLowerCase() ?? "";
  const baseIndex = people.findIndex(
    (p) => p.toLowerCase() === normalizedUser
  );
  const originalIndices = people.map((_, idx) => idx);

  let rowOrder: number[];
  if (baseIndex === -1) {
    rowOrder = originalIndices;
  } else {
    const others = originalIndices.filter((i) => i !== baseIndex);
    const scored = others.map((i) => {
      let score = 0;
      workSlotIndices.forEach((slotIdx) => {
        const baseTask = (cells[baseIndex]?.[slotIdx] ?? "").trim();
        const otherTask = (cells[i]?.[slotIdx] ?? "").trim();
        if (baseTask && baseTask === otherTask) score++;
      });
      return { i, score };
    });
    scored.sort((a, b) =>
      b.score !== a.score ? b.score - a.score : a.i - b.i
    );
    rowOrder = [baseIndex, ...scored.map((s) => s.i)];
  }

  const orderedPeople = rowOrder.map((i) => people[i]);

  // Merge data
  const rowSpan: number[][] = Array.from({ length: numRows }, () =>
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

  return (
    <table className="w-full border-collapse text-xs">
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
                      className={`border border-[#d1d4aa] px-3 py-2 align-top ${
                        isCurrentCol ? "bg-[#f0f4de]" : ""
                      }`}
                    />
                  );
                }

                const span = rowSpan[visualRow][cIdx];

                // Collect all people in this merged box
                const groupNames: string[] = [];
                for (let offset = 0; offset < span; offset++) {
                  const vr = visualRow + offset;
                  const realIndex = rowOrder[vr];
                  groupNames.push(people[realIndex]);
                }

                const sharedCount = groupNames.length;

                return (
                  <td
                    key={`${visualRow}-${slotIndex}`}
                    rowSpan={span}
                    className={`border border-[#d1d4aa] px-2 py-2 align-top ${
                      isCurrentCol ? "bg-[#f0f4de]" : ""
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        onTaskClick?.({
                          person,
                          slot,
                          task,
                          groupNames,
                        })
                      }
                      className="w-full text-left rounded-md bg-[#e3e6bf] border border-[#cfd2a1] px-2 py-2 text-[11px] leading-snug text-[#3f4630] shadow-sm hover:bg-[#dde1b7] focus:outline-none focus:ring-2 focus:ring-[#8fae4c]"
                    >
                      <div className="flex justify-between items-start gap-2">
                        <span className="font-semibold">
                          {task.split("\n")[0].trim()}
                        </span>
                        {sharedCount > 1 && (
                          <span className="text-[9px] text-[#6e7544] bg-white/70 rounded-full px-2 py-[1px]">
                            {sharedCount} people
                          </span>
                        )}
                      </div>
                      {task.includes("\n") && (
                        <div className="mt-1 whitespace-pre-line opacity-90">
                          {task
                            .split("\n")
                            .slice(1)
                            .join("\n")}
                        </div>
                      )}
                    </button>
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
}: {
  data: ScheduleResponse;
  workSlots: Slot[];
  currentSlotId: string | null;
  onTaskClick?: (payload: TaskClickPayload) => void;
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
