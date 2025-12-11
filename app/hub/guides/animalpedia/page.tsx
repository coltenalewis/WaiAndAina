"use client";

export default function AnimalpediaPage() {
  return (
    <div className="space-y-4">
      <header className="rounded-xl bg-[#a0b764] text-white px-4 py-3 shadow">
        <h1 className="text-2xl font-semibold tracking-[0.14em] uppercase">Animalpedia</h1>
        <p className="text-sm text-white/90">Quick care notes, feed schedules, and gentle reminders.</p>
      </header>
      <div className="rounded-xl border border-[#d0c9a4] bg-[#f8f4e3] p-4 shadow-sm">
        <p className="text-sm text-[#4b522d]">
          Fill this page with your herd&apos;s greatest hits: care tips, favorite snacks, and common
          chores. Use sections for goats, chickens, and future friends so everyone stays in sync.
        </p>
      </div>
    </div>
  );
}
