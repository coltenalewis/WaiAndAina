import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const messages = (body?.messages || []) as { role: string; content: string }[];

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY environment variable" },
        { status: 500 }
      );
    }

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
              "You are an upbeat scheduling copilot for farm admins. Be concise, propose clear next steps, and keep responses under 120 words.",
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
