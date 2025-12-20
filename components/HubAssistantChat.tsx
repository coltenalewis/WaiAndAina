"use client";

import React, { useEffect, useMemo, useState } from "react";

export type ChatMessage = { role: "user" | "assistant"; content: string; status?: "thinking" };

function renderMessageContent(text: string) {
  const parts: React.ReactNode[] = [];
  const lines = text.split("\n");

  lines.forEach((line, lineIdx) => {
    if (lineIdx > 0) {
      parts.push(<br key={`br-${lineIdx}`} />);
    }

    const regex = /\[([^\]]+)\]\(([^)]+)\)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(line)) !== null) {
      if (match.index > lastIndex) {
        parts.push(
          <span key={`${lineIdx}-text-${match.index}`}>{line.slice(lastIndex, match.index)}</span>
        );
      }

      parts.push(
        <a
          key={`${lineIdx}-link-${match.index}`}
          href={match[2]}
          className="inline-flex items-center gap-1 rounded-full bg-[#eef2e0] px-2 py-[3px] text-[#2e3b1c] underline decoration-[#8fae4c] decoration-2 hover:bg-[#e3e9ce]"
          target="_blank"
          rel="noreferrer"
        >
          <span className="text-xs">🔗</span>
          <span className="font-semibold">{match[1]}</span>
        </a>
      );

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < line.length) {
      parts.push(<span key={`${lineIdx}-tail`}>{line.slice(lastIndex)}</span>);
    }
  });

  return parts;
}

export function HubAssistantChat({
  variant = "floating",
  title = "Hub AI assistant",
  subtitle = "Ask about schedules, guides, or farm workflow",
  storageKey = "hub-assistant",
  contextHint = "",
  placeholder = "Ask for help with tasks, guides, or schedules",
}: {
  variant?: "floating" | "panel";
  title?: string;
  subtitle?: string;
  storageKey?: string;
  contextHint?: string;
  placeholder?: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: "Hi! I’m your hub companion. Ask me to reorganize shifts, link guides, or surface the right database entry.",
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [open, setOpen] = useState(variant === "panel");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const cached = window.localStorage.getItem(storageKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as ChatMessage[];
        if (Array.isArray(parsed) && parsed.length) {
          setMessages(parsed);
        }
      } catch (err) {
        console.warn("Failed to parse cached assistant chat", err);
      }
    }
  }, [storageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(storageKey, JSON.stringify(messages));
  }, [messages, storageKey]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = chatInput.trim();
    if (!trimmed) return;

    const userMessage: ChatMessage = { role: "user", content: trimmed };
    const thinkingMessage: ChatMessage = { role: "assistant", content: "", status: "thinking" };
    const nextMessages = [...messages, userMessage, thinkingMessage];
    setMessages(nextMessages);
    setChatInput("");
    setChatLoading(true);

    try {
      const res = await fetch("/api/admin-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages.filter((m) => m.role !== "assistant" || !m.status),
          context: contextHint,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Assistant request failed");

      setMessages((prev) => {
        const clone = [...prev];
        clone[clone.length - 1] = {
          role: "assistant",
          content: json.reply || "I couldn’t find an answer, but I’m here!",
        };
        return clone;
      });
    } catch (err) {
      console.error(err);
      setMessages((prev) => {
        const clone = [...prev];
        clone[clone.length - 1] = {
          role: "assistant",
          content: err instanceof Error ? err.message : "The assistant is busy. Try again.",
        };
        return clone;
      });
    } finally {
      setChatLoading(false);
    }
  };

  const assistantCard = useMemo(
    () => (
      <div className="flex flex-col gap-3 rounded-2xl border border-[#d0c9a4] bg-white/95 p-4 shadow-xl ring-1 ring-[#e9e3c3] backdrop-blur">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-[11px] uppercase tracking-[0.12em] text-[#7a7f54]">{title}</p>
            <h3 className="text-base font-semibold text-[#314123]">{subtitle}</h3>
          </div>
          {variant === "floating" && (
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full bg-[#f4f7de] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#4b5133] shadow-sm hover:bg-[#ebf0d2]"
            >
              Close
            </button>
          )}
        </div>

        <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1 text-sm">
          {messages.map((msg, idx) => (
            <div
              key={`${msg.role}-${idx}-${msg.status || ""}`}
              className={`flex flex-col gap-1 rounded-lg border px-3 py-2 shadow-sm ${
                msg.role === "user"
                  ? "border-[#c4d48c] bg-[#f4f8e6] text-[#394628]"
                  : "border-[#d0c9a4] bg-white text-[#3f4630]"
              }`}
            >
              <span className="text-[10px] uppercase tracking-[0.1em] text-[#7a7f54]">{msg.role}</span>
              <p className="whitespace-pre-line leading-relaxed">
                {msg.content ? renderMessageContent(msg.content) : "Thinking…"}
              </p>
              {msg.status === "thinking" && (
                <div className="flex items-center gap-1 text-[11px] text-[#7a7f54]">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-[#8fae4c]" />
                  <span>Thinking…</span>
                </div>
              )}
            </div>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-2">
          <textarea
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            className="min-h-[70px] w-full rounded-md border border-[#d0c9a4] px-3 py-2 text-sm focus:border-[#8fae4c] focus:outline-none"
            placeholder={placeholder}
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="submit"
              disabled={chatLoading}
              className="w-full sm:w-auto rounded-md bg-[#8fae4c] px-4 py-2 text-sm font-semibold uppercase tracking-[0.12em] text-[#f9f9ec] shadow-md transition hover:bg-[#7e9c44] disabled:opacity-60"
            >
              {chatLoading ? "Thinking…" : "Send"}
            </button>
          </div>
        </form>
      </div>
    ),
    [chatInput, chatLoading, handleSubmit, messages, placeholder, subtitle, title, variant]
  );

  if (variant === "panel") {
    return assistantCard;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
      <div
        className={`w-[min(420px,calc(100vw-2rem))] transition-all duration-200 ${
          open ? "opacity-100 translate-y-0" : "pointer-events-none opacity-0 translate-y-2"
        }`}
      >
        {assistantCard}
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full bg-[#314123] px-4 py-3 text-sm font-semibold uppercase tracking-[0.12em] text-[#f9f9ec] shadow-lg transition hover:bg-[#3f522b]"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#8fae4c] text-[#1f2b12] shadow-inner">
          {open ? "✕" : "🤖"}
        </span>
        <div className="flex flex-col leading-tight text-left">
          <span>{open ? "Hide hub assistant" : "Ask the hub assistant"}</span>
          <span className="text-[11px] font-normal text-[#dce7bc]">Chats follow you across the work dashboard</span>
        </div>
      </button>
    </div>
  );
}
