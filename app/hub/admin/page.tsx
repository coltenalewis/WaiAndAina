"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { loadSession } from "@/lib/session";

type ReportItem = { id: string; title: string; date?: string };
type UserItem = { id: string; name: string; userType: string; goats: number };
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
  const [goatUpdate, setGoatUpdate] = useState({ userId: "", goats: "" });
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
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-[#314123]">Scheduling tools</h2>
                  <p className="text-sm text-[#5f5a3b]">
                    The drag-and-drop schedule editor now lives on its own admin page for more breathing room and smoother updates.
                  </p>
                  <p className="text-xs text-[#6a6c4d]">
                    Reorder tasks, move work between shifts, and chat with the AI assistant directly inside the new workspace.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href="/hub/admin/schedule"
                    className="rounded-md bg-[#8fae4c] px-4 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-[#f9f9ec] shadow-md transition hover:bg-[#7e9c44]"
                  >
                    Open schedule editor
                  </Link>
                  <Link
                    href="/hub"
                    className="rounded-md border border-[#d0c9a4] bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-[#314123] shadow-sm transition hover:bg-[#f1edd8]"
                  >
                    View live schedule
                  </Link>
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
