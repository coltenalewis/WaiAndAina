"use client";

import { useEffect, useMemo, useState } from "react";
import { loadSession } from "@/lib/session";

const STATUS_COLORS: Record<string, string> = {
  Pending: "bg-amber-100 text-amber-800 border-amber-200",
  Approved: "bg-emerald-100 text-emerald-800 border-emerald-200",
  Denied: "bg-rose-100 text-rose-800 border-rose-200",
};

const MAX_NAME_WORDS = 8;
const MAX_NAME_CHARS = 80;
const MAX_DESCRIPTION_CHARS = 500;

type RequestSummary = {
  id: string;
  name: string;
  description: string;
  user: string;
  status: string;
  createdTime: string;
};

type RequestComment = {
  id: string;
  text: string;
  author: string;
  createdTime: string;
};

type RequestDetail = RequestSummary & {
  comments: RequestComment[];
};

export default function HubRequestPage() {
  const [requests, setRequests] = useState<RequestSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [sessionName, setSessionName] = useState("");
  const [onlyMine, setOnlyMine] = useState(false);
  const [statusFilter, setStatusFilter] = useState("All");
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [createError, setCreateError] = useState("");
  const [createBusy, setCreateBusy] = useState(false);

  const [activeRequest, setActiveRequest] = useState<RequestDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [commentBusy, setCommentBusy] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState("");

  useEffect(() => {
    const session = loadSession();
    if (session?.name) {
      setSessionName(session.name);
    }
    fetchRequests();
  }, []);

  async function fetchRequests() {
    setLoading(true);
    try {
      const res = await fetch("/api/request");
      const data = await res.json();
      if (res.ok) {
        setRequests(data.requests || []);
      }
    } catch (err) {
      console.error("Failed to load requests", err);
    } finally {
      setLoading(false);
    }
  }

  async function openRequest(id: string) {
    setDetailLoading(true);
    setEditMode(false);
    try {
      const res = await fetch(`/api/request?id=${encodeURIComponent(id)}`);
      const data = await res.json();
      if (res.ok) {
        const detail: RequestDetail = {
          comments: [],
          ...data,
        };
        setActiveRequest(detail);
        setEditName(detail.name);
        setEditDesc(detail.description);
      }
    } catch (err) {
      console.error("Failed to load request detail", err);
    } finally {
      setDetailLoading(false);
    }
  }

  const filteredRequests = useMemo(() => {
    return requests.filter((r) => {
      const mine = onlyMine && sessionName
        ? r.user.trim().toLowerCase() === sessionName.trim().toLowerCase()
        : true;
      const statusMatch =
        statusFilter === "All" || r.status.toLowerCase() === statusFilter.toLowerCase();
      return mine && statusMatch;
    });
  }, [requests, onlyMine, sessionName, statusFilter]);

  const nameWordCount = useMemo(
    () => createName.trim().split(/\s+/).filter(Boolean).length,
    [createName]
  );
  const editNameWordCount = useMemo(
    () => editName.trim().split(/\s+/).filter(Boolean).length,
    [editName]
  );

  async function handleCreate() {
    if (!sessionName) {
      setCreateError("Please log in again to submit a request.");
      return;
    }

    if (!createName.trim() || !createDesc.trim()) {
      setCreateError("Name and description are required.");
      return;
    }

    if (nameWordCount > MAX_NAME_WORDS) {
      setCreateError(`Request name must be ${MAX_NAME_WORDS} words or fewer.`);
      return;
    }
    if (createName.length > MAX_NAME_CHARS) {
      setCreateError(`Request name must be ${MAX_NAME_CHARS} characters or fewer.`);
      return;
    }
    if (createDesc.length > MAX_DESCRIPTION_CHARS) {
      setCreateError(`Description must be ${MAX_DESCRIPTION_CHARS} characters or fewer.`);
      return;
    }

    setCreateBusy(true);
    setCreateError("");
    try {
      const res = await fetch("/api/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createName.trim(),
          description: createDesc.trim(),
          user: sessionName,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCreateError(data.error || "Failed to create request.");
        return;
      }

      setRequests((prev) => [data.request, ...prev]);
      setCreateName("");
      setCreateDesc("");
      setCreateOpen(false);
    } catch (err) {
      console.error("Failed to submit request", err);
      setCreateError("Something went wrong. Please try again.");
    } finally {
      setCreateBusy(false);
    }
  }

  async function handleAddComment() {
    if (!activeRequest || !sessionName || !commentText.trim()) return;
    setCommentBusy(true);
    try {
      const res = await fetch("/api/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "comment",
          id: activeRequest.id,
          comment: commentText.trim(),
          user: sessionName,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        console.error(data.error || "Failed to post comment");
        return;
      }
      setCommentText("");
      await openRequest(activeRequest.id);
    } catch (err) {
      console.error("Failed to post comment", err);
    } finally {
      setCommentBusy(false);
    }
  }

  async function handleEditSave() {
    if (!activeRequest) return;
    setEditError("");

    if (!editName.trim() || !editDesc.trim()) {
      setEditError("Name and description are required.");
      return;
    }
    if (editNameWordCount > MAX_NAME_WORDS) {
      setEditError(`Request name must be ${MAX_NAME_WORDS} words or fewer.`);
      return;
    }
    if (editName.length > MAX_NAME_CHARS) {
      setEditError(`Request name must be ${MAX_NAME_CHARS} characters or fewer.`);
      return;
    }
    if (editDesc.length > MAX_DESCRIPTION_CHARS) {
      setEditError(`Description must be ${MAX_DESCRIPTION_CHARS} characters or fewer.`);
      return;
    }

    setEditBusy(true);
    try {
      const res = await fetch("/api/request", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: activeRequest.id,
          name: editName.trim(),
          description: editDesc.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEditError(data.error || "Unable to save edits.");
        return;
      }

      setActiveRequest((prev) => (prev ? { ...prev, ...data.request } : prev));
      setRequests((prev) =>
        prev.map((req) => (req.id === data.request.id ? data.request : req))
      );
      setEditMode(false);
    } catch (err) {
      console.error("Failed to edit request", err);
      setEditError("Something went wrong.");
    } finally {
      setEditBusy(false);
    }
  }

  async function handleCancelRequest() {
    if (!activeRequest) return;
    setEditBusy(true);
    try {
      const res = await fetch("/api/request", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: activeRequest.id, action: "cancel" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEditError(data.error || "Unable to cancel.");
        return;
      }

      setActiveRequest((prev) => (prev ? { ...prev, ...data.request } : prev));
      setRequests((prev) =>
        prev.map((req) => (req.id === data.request.id ? data.request : req))
      );
    } catch (err) {
      console.error("Failed to cancel request", err);
      setEditError("Something went wrong.");
    } finally {
      setEditBusy(false);
    }
  }

  function statusBadge(status: string) {
    const classes = STATUS_COLORS[status] || "bg-slate-100 text-slate-700 border-slate-200";
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] ${classes}`}
      >
        <span className="h-2 w-2 rounded-full bg-current opacity-80" />
        {status || "Unknown"}
      </span>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-[0.18em] uppercase text-[#5d7f3b]">Requests</h1>
          <p className="text-sm text-[#7a7f54] max-w-2xl">
            Submit item needs, task-specific asks, or farm suggestions. Track status, adjust pending submissions,
            and chat with the team directly on each request.
          </p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="self-start rounded-full bg-[#a0b764] px-4 py-2 text-sm font-semibold uppercase tracking-[0.14em] text-white shadow-md hover:bg-[#8da55a] transition-colors"
        >
          + New Request
        </button>
      </div>

      <div className="rounded-xl border border-[#d5d7bc] bg-white/70 p-4 shadow-sm space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#556036]">
              <input
                type="checkbox"
                checked={onlyMine}
                onChange={(e) => setOnlyMine(e.target.checked)}
                className="h-4 w-4 rounded border-[#b5bf90] text-[#5d7f3b] focus:ring-[#7a8c43]"
              />
              Only my requests
            </label>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#556036]">
              Status
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-full border border-[#cdd7ab] bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#4a5b2a] focus:outline-none focus:ring-2 focus:ring-[#a0b764]"
              >
                <option>All</option>
                <option>Pending</option>
                <option>Approved</option>
                <option>Denied</option>
              </select>
            </div>
          </div>
          {sessionName && (
            <span className="text-[11px] uppercase tracking-[0.14em] text-[#6b7348]">
              Viewing as <span className="font-semibold">{sessionName}</span>
            </span>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {filteredRequests.map((req) => (
            <button
              key={req.id}
              onClick={() => openRequest(req.id)}
              className="w-full rounded-lg border border-[#d5d7bc] bg-[#f7f5ec] p-4 text-left shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold text-[#3b4224]">{req.name}</h3>
                    {statusBadge(req.status)}
                  </div>
                  <p className="text-sm text-[#5b6240] line-clamp-2">{req.description}</p>
                  <div className="text-[11px] uppercase tracking-[0.14em] text-[#777f57] flex items-center gap-2">
                    <span className="font-semibold">{req.user}</span>
                    <span className="h-1 w-1 rounded-full bg-[#b6bb9c]" />
                    <span>{new Date(req.createdTime).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
            </button>
          ))}
          {!filteredRequests.length && (
            <div className="col-span-full rounded-lg border border-dashed border-[#d5d7bc] bg-white/70 p-6 text-center text-sm text-[#737b54]">
              {loading ? "Loading requests..." : "No requests match your filters yet."}
            </div>
          )}
        </div>
      </div>

      {createOpen && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-[#3b4224]">Submit a new request</h2>
                <p className="text-sm text-[#5b6240]">
                  Name your request (up to {MAX_NAME_WORDS} words, {MAX_NAME_CHARS} characters) and describe what you need.
                </p>
              </div>
              <button
                onClick={() => setCreateOpen(false)}
                className="text-sm font-semibold text-[#7a7f54] hover:text-[#56652f]"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <div className="flex items-center justify-between text-xs text-[#6b7348]">
                  <label className="font-semibold uppercase tracking-[0.14em]">Request Name</label>
                  <span>
                    {nameWordCount}/{MAX_NAME_WORDS} words · {createName.length}/{MAX_NAME_CHARS} chars
                  </span>
                </div>
                <input
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  className="mt-1 w-full rounded-md border border-[#d5d7bc] bg-white px-3 py-2 text-sm text-[#3b4224] focus:outline-none focus:ring-2 focus:ring-[#a0b764]"
                  placeholder="Short title for your request"
                />
              </div>

              <div>
                <div className="flex items-center justify-between text-xs text-[#6b7348]">
                  <label className="font-semibold uppercase tracking-[0.14em]">Description</label>
                  <span>{createDesc.length}/{MAX_DESCRIPTION_CHARS} chars</span>
                </div>
                <textarea
                  value={createDesc}
                  onChange={(e) => setCreateDesc(e.target.value)}
                  className="mt-1 w-full rounded-md border border-[#d5d7bc] bg-white px-3 py-2 text-sm text-[#3b4224] focus:outline-none focus:ring-2 focus:ring-[#a0b764]"
                  rows={4}
                  placeholder="Share details, context, or timing"
                />
              </div>

              {createError && <p className="text-sm text-rose-600">{createError}</p>}

              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={() => setCreateOpen(false)}
                  className="rounded-md px-3 py-2 text-sm font-semibold text-[#6b7348] hover:text-[#4a5b2a]"
                  disabled={createBusy}
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={createBusy}
                  className="rounded-md bg-[#a0b764] px-4 py-2 text-sm font-semibold uppercase tracking-[0.14em] text-white shadow hover:bg-[#8da55a] disabled:opacity-60"
                >
                  {createBusy ? "Submitting..." : "Submit Request"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeRequest && (
        <div className="fixed inset-0 z-30 bg-black/40 px-4 py-6 flex items-center justify-center">
          <div className="w-full max-w-3xl max-h-[85vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-[11px] uppercase tracking-[0.14em] text-[#777f57]">
                  Submitted by <span className="font-semibold">{activeRequest.user}</span> · {new Date(activeRequest.createdTime).toLocaleString()}
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-xl font-semibold text-[#3b4224]">{activeRequest.name}</h2>
                  {statusBadge(activeRequest.status)}
                </div>
              </div>
              <button
                onClick={() => setActiveRequest(null)}
                className="text-sm font-semibold text-[#7a7f54] hover:text-[#56652f]"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-6">
              <section className="rounded-lg border border-[#d5d7bc] bg-[#f7f5ec] p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-[#556036]">Details</h3>
                  {activeRequest.status === "Pending" && activeRequest.user.trim().toLowerCase() === sessionName.trim().toLowerCase() && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setEditMode((v) => !v)}
                        className="rounded-full border border-[#c9d3ab] px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#4a5b2a] hover:bg-white"
                      >
                        {editMode ? "Stop Editing" : "Edit"}
                      </button>
                      <button
                        onClick={handleCancelRequest}
                        disabled={editBusy}
                        className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                      >
                        Cancel Request
                      </button>
                    </div>
                  )}
                </div>

                {!editMode && <p className="mt-2 text-sm text-[#4c5331] whitespace-pre-line">{activeRequest.description}</p>}

                {editMode && (
                  <div className="mt-3 space-y-3">
                    <div className="flex items-center justify-between text-xs text-[#6b7348]">
                      <label className="font-semibold uppercase tracking-[0.14em]">Request Name</label>
                      <span>
                        {editNameWordCount}/{MAX_NAME_WORDS} words · {editName.length}/{MAX_NAME_CHARS} chars
                      </span>
                    </div>
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full rounded-md border border-[#d5d7bc] bg-white px-3 py-2 text-sm text-[#3b4224] focus:outline-none focus:ring-2 focus:ring-[#a0b764]"
                    />

                    <div className="flex items-center justify-between text-xs text-[#6b7348]">
                      <label className="font-semibold uppercase tracking-[0.14em]">Description</label>
                      <span>{editDesc.length}/{MAX_DESCRIPTION_CHARS} chars</span>
                    </div>
                    <textarea
                      value={editDesc}
                      onChange={(e) => setEditDesc(e.target.value)}
                      className="w-full rounded-md border border-[#d5d7bc] bg-white px-3 py-2 text-sm text-[#3b4224] focus:outline-none focus:ring-2 focus:ring-[#a0b764]"
                      rows={4}
                    />

                    {editError && <p className="text-sm text-rose-600">{editError}</p>}

                    <div className="flex items-center justify-end gap-3">
                      <button
                        onClick={() => setEditMode(false)}
                        className="rounded-md px-3 py-2 text-sm font-semibold text-[#6b7348] hover:text-[#4a5b2a]"
                        disabled={editBusy}
                      >
                        Close
                      </button>
                      <button
                        onClick={handleEditSave}
                        disabled={editBusy}
                        className="rounded-md bg-[#a0b764] px-4 py-2 text-sm font-semibold uppercase tracking-[0.14em] text-white shadow hover:bg-[#8da55a] disabled:opacity-60"
                      >
                        {editBusy ? "Saving..." : "Save Changes"}
                      </button>
                    </div>
                  </div>
                )}
              </section>

              <section className="rounded-lg border border-[#d5d7bc] bg-[#f7f5ec] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-[#556036]">Comments</h3>
                  <span className="text-[11px] uppercase tracking-[0.14em] text-[#7a7f54]">Live discussion</span>
                </div>

                <div className="space-y-3 max-h-48 overflow-y-auto pr-1">
                  {activeRequest.comments?.length ? (
                    activeRequest.comments.map((c) => (
                      <div key={c.id} className="rounded-md bg-white p-3 shadow-sm border border-[#e3e5d2]">
                        <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.12em] text-[#7a7f54]">
                          <span className="font-semibold">{c.author || "Unknown"}</span>
                          <span>{new Date(c.createdTime).toLocaleString()}</span>
                        </div>
                        <p className="mt-1 text-sm text-[#4c5331] whitespace-pre-line">{c.text}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-[#7a7f54]">No comments yet.</p>
                  )}
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="Add a comment"
                    className="flex-1 rounded-md border border-[#d5d7bc] bg-white px-3 py-2 text-sm text-[#3b4224] focus:outline-none focus:ring-2 focus:ring-[#a0b764]"
                  />
                  <button
                    onClick={handleAddComment}
                    disabled={commentBusy || !commentText.trim()}
                    className="rounded-md bg-[#a0b764] px-4 py-2 text-sm font-semibold uppercase tracking-[0.14em] text-white shadow hover:bg-[#8da55a] disabled:opacity-60"
                  >
                    {commentBusy ? "Posting..." : "Post"}
                  </button>
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
