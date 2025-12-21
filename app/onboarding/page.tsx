"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { saveSession, UserSession } from "@/lib/session";

const DEFAULT_PASSCODE = "WAIANDAINA";

function formatSession(session: UserSession | null): UserSession | null {
  if (!session) return null;
  const type = session.userType?.toLowerCase();
  return { ...session, userType: type || null };
}

function OnboardingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [selectedName, setSelectedName] = useState<string>("");
  const [currentPass, setCurrentPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [capabilityOptions, setCapabilityOptions] = useState<string[]>([]);
  const [selectedCapabilities, setSelectedCapabilities] = useState<string[]>([]);
  const [capabilityError, setCapabilityError] = useState<string | null>(null);
  const [capabilityLoading, setCapabilityLoading] = useState(false);
  const lastFetchedName = useRef<string>("");

  const presetName = searchParams.get("name") || "";
  const capabilitiesOnly = searchParams.get("capabilities") === "1";
  const isNameLocked = !!presetName;
  useEffect(() => {
    if (presetName) {
      setSelectedName(presetName);
    }
  }, [presetName]);

  async function loadCapabilities(nameValue: string) {
    setCapabilityLoading(true);
    setCapabilityError(null);
    try {
      const search = nameValue ? `?name=${encodeURIComponent(nameValue)}` : "";
      const res = await fetch(`/api/user-settings${search}`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const json = await res.json();
      setCapabilityOptions(json.capabilityOptions || []);
      if (Array.isArray(json.capabilities)) {
        setSelectedCapabilities(json.capabilities);
      }
      lastFetchedName.current = nameValue;
    } catch (err) {
      console.error("Failed to load capabilities", err);
      setCapabilityError("Unable to load capabilities right now.");
    } finally {
      setCapabilityLoading(false);
    }
  }

  useEffect(() => {
    loadCapabilities(presetName || "");
  }, [presetName]);

  useEffect(() => {
    const trimmed = selectedName.trim();
    if (!trimmed || trimmed === lastFetchedName.current) return;
    loadCapabilities(trimmed);
  }, [selectedName]);

  const canSubmit = useMemo(() => {
    const nameValue = selectedName.trim();
    if (!nameValue || submitting) return false;
    if (capabilitiesOnly) {
      return currentPass.trim().length > 0;
    }
    return newPass.trim().length >= 4 && newPass === confirmPass;
  }, [capabilitiesOnly, confirmPass, currentPass, newPass, selectedName, submitting]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    const nameValue = selectedName.trim();

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/user-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: nameValue,
          currentPassword: capabilitiesOnly ? currentPass : DEFAULT_PASSCODE,
          newPassword: capabilitiesOnly ? null : newPass,
          capabilities: selectedCapabilities,
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        const msg = json.error || "Unable to save your new passcode.";
        setError(msg);
        return;
      }

      setSuccess(
        capabilitiesOnly
          ? "Capabilities updated! Taking you to the dashboard…"
          : "Passcode updated! Signing you in…"
      );

      const loginRes = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: nameValue,
          password: capabilitiesOnly ? currentPass : newPass,
        }),
      });

      if (loginRes.ok) {
        const loginJson = await loginRes.json();
        const session: UserSession = {
          name: nameValue,
          userType: loginJson.userType || null,
          userTypeColor: loginJson.userTypeColor || null,
        };
        const formatted = formatSession(session);
        saveSession(formatted as UserSession);
        router.push("/hub/dashboard");
      } else {
        router.push("/welcome");
      }
    } catch (e) {
      console.error("Onboarding error", e);
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function toggleCapability(capability: string) {
    setSelectedCapabilities((prev) =>
      prev.includes(capability)
        ? prev.filter((c) => c !== capability)
        : [...prev, capability]
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#f6f2e6] via-[#f1edd8] to-[#e8e1c7] text-[#3b4224]">
      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-3 rounded-2xl border border-[#d0c9a4] bg-white/80 p-5 shadow-sm backdrop-blur">
          <div className="flex items-center gap-3 text-sm uppercase tracking-[0.2em] text-[#7a7f54]">
            <span className="text-lg">🌱</span>
            <span>Welcome to Wai &amp; Aina</span>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-[#33401e]">
                {capabilitiesOnly ? "Select your capabilities" : "Set your new passcode"}
              </h1>
              <p className="text-sm text-[#5a5f3b]">
                {capabilitiesOnly
                  ? "Choose the areas you can help with so we can match you to the right tasks."
                  : `Use your starter code (${DEFAULT_PASSCODE}) once, then pick a secure passcode to unlock the Work Dashboard and future onboarding resources.`}
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#556036]">
              <span className="rounded-full bg-[#a0b764] px-3 py-1 text-white shadow">
                {capabilitiesOnly ? "Step 2" : "Step 1"}
              </span>
              <span className="rounded-full border border-[#d0c9a4] bg-white px-3 py-1 text-[#5d7f3b] shadow-sm">
                {capabilitiesOnly ? "Capabilities" : "Credentials"}
              </span>
              <span className="rounded-full border border-[#d0c9a4] bg-white px-3 py-1 text-[#5d7f3b] shadow-sm">
                Guides (soon)
              </span>
            </div>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <section className="rounded-2xl border border-[#d0c9a4] bg-white/90 p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-[#354427]">Secure your account</h2>
              <span className="rounded-full bg-[#f0eddc] px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#6b6f4c]">
                Required
              </span>
            </div>

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6b6f4c]">
                  Your name
                </label>
                <input
                  value={selectedName}
                  onChange={(e) => !isNameLocked && setSelectedName(e.target.value)}
                  disabled={isNameLocked}
                  placeholder="Type your name exactly as it appears in Notion"
                  className="w-full rounded-md border border-[#c8cba0] bg-white px-4 py-3 text-sm font-medium text-[#3b4224] shadow-inner focus:outline-none focus:ring-2 focus:ring-[#8fae4c] focus:border-[#8fae4c] disabled:cursor-not-allowed disabled:bg-[#f7f3df]"
                />
                {isNameLocked ? (
                  <p className="text-[11px] text-[#7a7f54]">
                    This onboarding link is locked to <strong>{presetName}</strong>. Return home to switch profiles.
                  </p>
                ) : (
                  <p className="text-[11px] text-[#7a7f54]">
                    {capabilitiesOnly
                      ? "Enter your name to update your capabilities. New users should contact an admin for access."
                      : "Enter your own name to update your passcode. New users should contact an admin for access."}
                  </p>
                )}
              </div>

              {capabilitiesOnly ? (
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6b6f4c]">
                    Current passcode
                  </label>
                  <input
                    type="password"
                    value={currentPass}
                    onChange={(e) => setCurrentPass(e.target.value)}
                    className="w-full rounded-md border border-[#c8cba0] bg-[#f1edd8] px-3 py-2 text-sm text-[#3b4224] shadow-inner focus:outline-none focus:ring-2 focus:ring-[#8fae4c]"
                    placeholder="Enter your current passcode"
                  />
                  <p className="text-[11px] text-[#7a7f54]">
                    We&apos;ll keep your existing passcode and only update your capabilities.
                  </p>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6b6f4c]">
                      New passcode
                    </label>
                    <input
                      type="password"
                      value={newPass}
                      onChange={(e) => setNewPass(e.target.value)}
                      className="w-full rounded-md border border-[#c8cba0] bg-[#f1edd8] px-3 py-2 text-sm text-[#3b4224] shadow-inner focus:outline-none focus:ring-2 focus:ring-[#8fae4c]"
                      placeholder="Create a passcode"
                    />
                    <p className="text-[11px] text-[#7a7f54]">At least 4 characters.</p>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6b6f4c]">
                      Confirm passcode
                    </label>
                    <input
                      type="password"
                      value={confirmPass}
                      onChange={(e) => setConfirmPass(e.target.value)}
                      className="w-full rounded-md border border-[#c8cba0] bg-[#f1edd8] px-3 py-2 text-sm text-[#3b4224] shadow-inner focus:outline-none focus:ring-2 focus:ring-[#8fae4c]"
                      placeholder="Re-enter passcode"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-2 rounded-lg border border-[#e2d7b5] bg-[#f9f6e7] px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6b6f4c]">
                      Capabilities
                    </p>
                    <p className="text-[12px] text-[#6f754f]">
                      Choose everything you can confidently help with. You can edit this anytime in Settings.
                    </p>
                  </div>
                  {capabilityLoading && (
                    <span className="text-[11px] text-[#7a7f54]">Loading…</span>
                  )}
                </div>
                {capabilityError && (
                  <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">
                    {capabilityError}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {capabilityOptions.length === 0 && !capabilityLoading ? (
                    <span className="text-[11px] text-[#7a7f54] italic">
                      No capabilities available yet.
                    </span>
                  ) : (
                    capabilityOptions.map((cap) => {
                      const active = selectedCapabilities.includes(cap);
                      return (
                        <button
                          key={cap}
                          type="button"
                          onClick={() => toggleCapability(cap)}
                          className={`rounded-full border px-3 py-1 text-[12px] font-semibold shadow-sm transition ${
                            active
                              ? "border-[#8fae4c] bg-[#a0b764] text-white"
                              : "border-[#d0c9a4] bg-white text-[#4f5730] hover:bg-[#f1edd8]"
                          }`}
                        >
                          {cap}
                        </button>
                      );
                    })
                  )}
                </div>
                {selectedCapabilities.length > 0 && (
                  <p className="text-[11px] text-[#6b6f4c]">
                    Selected: {selectedCapabilities.join(", ")}
                  </p>
                )}
              </div>

              {error && (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
              )}
              {success && (
                <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800">{success}</div>
              )}

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pt-1">
                <div className="text-xs text-[#6b6f4c]">
                  Using a shared device? Keep your passcode private for future onboarding modules.
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    href="/"
                    className="rounded-full border border-[#c8cba0] bg-white px-4 py-2 text-sm font-semibold text-[#3b4224] hover:bg-[#f1edd8]"
                  >
                    Back to home
                  </Link>
                  <button
                    type="submit"
                    disabled={!canSubmit}
                    className="inline-flex items-center gap-2 rounded-full bg-[#a0b764] text-white px-5 py-2.5 text-sm font-semibold shadow hover:bg-[#8ba450] disabled:opacity-60"
                  >
                    {submitting ? "Saving…" : "Save & continue"}
                  </button>
                </div>
              </div>
            </form>
          </section>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-[#d0c9a4] bg-white/70 p-4 shadow-sm">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#7a7f54]">
                <span className="text-lg">📂</span>
                <span>Onboarding modules</span>
              </div>
              <p className="mt-2 text-sm text-[#4b5133]">
                We&apos;ll add farm documents, safety notes, and quick links here soon. For now, setting your passcode unlocks the Work Dashboard.
              </p>
              <ul className="mt-3 space-y-2 text-sm text-[#4b5133]">
                <li className="flex items-center gap-2 rounded-lg bg-[#f5f1dd] px-3 py-2">
                  <span className="text-lg">✅</span>
                  <div>
                    <p className="font-semibold text-[#384328]">Passcode setup</p>
                    <p className="text-xs text-[#6f754f]">Secure your login to access schedules and requests.</p>
                  </div>
                </li>
                <li className="flex items-center gap-2 rounded-lg bg-[#f5f1dd] px-3 py-2 opacity-80">
                  <span className="text-lg">📑</span>
                  <div>
                    <p className="font-semibold text-[#384328]">Farm docs (coming soon)</p>
                    <p className="text-xs text-[#6f754f]">Policies, FAQs, and starter guides will appear here.</p>
                  </div>
                </li>
                <li className="flex items-center gap-2 rounded-lg bg-[#f5f1dd] px-3 py-2 opacity-80">
                  <span className="text-lg">🎥</span>
                  <div>
                    <p className="font-semibold text-[#384328]">Walkthrough videos</p>
                    <p className="text-xs text-[#6f754f]">Watch quick demos for tasks and requests (coming soon).</p>
                  </div>
                </li>
              </ul>
            </div>

            <div className="rounded-2xl border border-[#d0c9a4] bg-gradient-to-br from-[#e9f3d8] via-white to-[#f8f1df] p-4 shadow-sm">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#567438]">
                <span className="text-lg">✨</span>
                <span>Tips</span>
              </div>
              <ul className="mt-3 space-y-2 text-sm text-[#4b5133]">
                <li className="rounded-lg bg-white/80 px-3 py-2 shadow-inner">
                  Use a memorable phrase with numbers or emojis 🐐 for your passcode.
                </li>
                <li className="rounded-lg bg-white/80 px-3 py-2 shadow-inner">
                  You can update your passcode anytime from Settings after logging in.
                </li>
                <li className="rounded-lg bg-white/80 px-3 py-2 shadow-inner">
                  Questions? Tap the farm map or guides from the main navigation once you sign in.
                </li>
              </ul>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-[#3b4224]">Loading onboarding…</div>}>
      <OnboardingContent />
    </Suspense>
  );
}
