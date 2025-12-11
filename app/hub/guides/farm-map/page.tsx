"use client";

export default function FarmMapPage() {
  return (
    <div className="space-y-4">
      <header className="rounded-xl bg-[#a0b764] text-white px-4 py-3 shadow">
        <h1 className="text-2xl font-semibold tracking-[0.14em] uppercase">Farm Map</h1>
        <p className="text-sm text-white/90">A cozy overview of the fields, barns, and shared spaces.</p>
      </header>
      <div className="rounded-xl border border-[#d0c9a4] bg-[#f8f4e3] p-4 shadow-sm">
        <p className="text-sm text-[#4b522d]">
          Map visuals will live here. For now, use this space to drop in the latest plot sketches
          or link out to your preferred map tool. Add paths, water lines, and barns so everyone can
          orient quickly.
        </p>
      </div>
    </div>
  );
}
