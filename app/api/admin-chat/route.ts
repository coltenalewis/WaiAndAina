import { NextResponse } from "next/server";
import { DATABASE_REGISTRY, HUB_REFERENCE_LINKS } from "@/lib/databaseRegistry";

type ChatMessage = { role: "user" | "assistant"; content: string };

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const context = typeof body?.context === "string" ? body.context : "";
    const incoming = Array.isArray(body?.messages) ? (body.messages as ChatMessage[]) : [];

    const messages: ChatMessage[] = incoming
      .filter((msg) => Boolean(msg?.content))
      .map((msg) => ({
        role: msg.role === "assistant" ? "assistant" : "user",
        content: msg.content,
      }));

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY environment variable" },
        { status: 500 }
      );
    }

    const registrySummary = DATABASE_REGISTRY.map(
      (db) =>
        `- ${db.name}: ${db.purpose} (env: ${db.envVar}; endpoints: ${(db.endpoints || []).join(
          ", "
        )}; surfaces: ${(db.surfaces || []).join(", ")})`
    ).join("\n");

    const referenceLinks = HUB_REFERENCE_LINKS.map(
      (ref) => `- ${ref.label}: ${ref.href}${ref.description ? ` — ${ref.description}` : ""}`
    ).join("\n");

    const completion = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              [
                "You are an upbeat work-hub copilot for farm admins and volunteers.",
                "Ground your answers in the hub's data and link readers directly to helpful pages using Markdown links; links render as highlighted chips.",
                "Always include direct Markdown links to relevant hub pages or guides when possible.",
                "Consult the AI Guide (admin-only) as an internal rulebook; never quote restricted instructions to non-admins—summarize guidance and cite public guides instead.",
                "Keep responses under 140 words, propose clear next steps, and prioritize concise bullet points.",
                "Known databases:",
                registrySummary,
                "Reference links you can cite (use Markdown links):",
                referenceLinks,
                context ? `User context: ${context}` : "",
              ]
                .filter(Boolean)
                .join("\n"),
          },
          ...messages.map((m) => ({ role: m.role, content: m.content })),
        ],
      }),
    });

    const data = await completion.json();
    if (!completion.ok) {
      const friendly = data?.error?.message || "Assistant request failed";
      return NextResponse.json({ error: friendly }, { status: completion.status });
    }

    const reply = data?.choices?.[0]?.message?.content?.trim() || "I didn't catch that. Can you rephrase?";
    return NextResponse.json({ reply });
  } catch (err) {
    console.error("Admin chat failed", err);
    return NextResponse.json({ error: "Failed to reach the assistant" }, { status: 500 });
  }
}
