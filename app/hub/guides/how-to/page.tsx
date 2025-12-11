"use client";

export default function HowToGuidesPage() {
  return (
    <div className="space-y-4">
      <header className="rounded-xl bg-[#a0b764] text-white px-4 py-3 shadow">
        <h1 className="text-2xl font-semibold tracking-[0.14em] uppercase">How To Guides</h1>
        <p className="text-sm text-white/90">Step-by-step walkthroughs for common farm tasks.</p>
      </header>
      <div className="rounded-xl border border-[#d0c9a4] bg-[#f8f4e3] p-4 shadow-sm">
        <p className="text-sm text-[#4b522d]">
          Share your best practices here—fence fixes, feed prep, or equipment tune-ups. Break things
          into short steps so teammates can jump in with confidence on any device.
        </p>
      </div>
    </div>
  );
}
