"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getHubLandingPath, loadSession } from "@/lib/session";

export default function WelcomePage() {
  const router = useRouter();
  const [name, setName] = useState<string>("");

  useEffect(() => {
    const session = loadSession();
    if (!session || !session.name) {
      router.replace("/");
      return;
    }
    setName(session.name);

    const timeout = setTimeout(() => {
      router.replace(getHubLandingPath(session.userType));
    }, 2500);

    return () => clearTimeout(timeout);
  }, [router]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#f8f4e3] text-[#3b4224] px-4">
      <div className="text-center animate-[fadeIn_0.8s_ease-out] max-w-md w-full">
        <div className="mx-auto mb-4 h-14 w-14 sm:h-16 sm:w-16 rounded-full bg-[#f1e4b5] flex items-center justify-center shadow-md">
          <span className="text-xl sm:text-2xl">🐐</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-[0.16em] sm:tracking-[0.25em] text-[#5d7f3b] uppercase leading-snug">
          Welcome{ name ? `, ${name}` : "" }
        </h1>
        <p className="mt-3 text-[11px] sm:text-xs text-[#7a7f54] tracking-wide">
          Loading your Wai &amp; Aina hub&hellip;
        </p>
      </div>

      {/* Simple keyframes for fade in */}
      <style jsx global>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </main>
  );
}
