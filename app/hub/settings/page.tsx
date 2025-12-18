"use client";

import { useEffect, useRef, useState } from "react";
import { loadSession } from "@/lib/session";

export default function HubSettingsPage() {
  const [currentUserName, setCurrentUserName] = useState<string | null>(null);

  // form state
  const [currentPass, setCurrentPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [phone, setPhone] = useState("");
  const [capabilityOptions, setCapabilityOptions] = useState<string[]>([]);
  const [selectedCapabilities, setSelectedCapabilities] = useState<string[]>([]);

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [capabilityError, setCapabilityError] = useState<string | null>(null);
  const [capabilityLoading, setCapabilityLoading] = useState(false);
  const lastFetchedName = useRef<string | null>(null);

  // Load current user from session
  useEffect(() => {
    const session = loadSession();
    if (session?.name) {
      setCurrentUserName(session.name);
    }
  }, []);

  async function loadCapabilities(nameValue: string) {
    setCapabilityLoading(true);
    setCapabilityError(null);
    try {
      const res = await fetch(
        `/api/user-settings?name=${encodeURIComponent(nameValue)}`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
    if (!currentUserName) return;
    if (lastFetchedName.current === currentUserName) return;
    loadCapabilities(currentUserName);
  }, [currentUserName]);

  const passwordsMismatch =
    newPass.length > 0 && confirmPass.length > 0 && newPass !== confirmPass;

  function toggleCapability(capability: string) {
    setSelectedCapabilities((prev) =>
      prev.includes(capability)
        ? prev.filter((c) => c !== capability)
        : [...prev, capability]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    if (!currentUserName) {
      setFormError("You must be logged in to change settings.");
      return;
    }

    if (!currentPass) {
      setFormError("Please enter your current passcode.");
      return;
    }

    if (newPass && passwordsMismatch) {
      setFormError("New passcode and confirmation do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/user-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: currentUserName,
          currentPassword: currentPass,
          newPassword: newPass || null, // null → do not change
          phone: phone || null,
          capabilities: selectedCapabilities,
        }),
      });

      if (!res.ok) {
        if (res.status === 401) {
          setFormError("Current passcode is incorrect.");
        } else {
          const data = await res.json().catch(() => null);
          setFormError(
            data?.error || "Unable to update settings. Please try again."
          );
        }
        return;
      }

      setFormSuccess("Settings updated.");
      setCurrentPass("");
      setNewPass("");
      setConfirmPass("");
    } catch (err) {
      console.error("Settings update failed:", err);
      setFormError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-[0.18em] uppercase text-[#5d7f3b]">
        Settings
      </h1>
      <p className="text-sm text-[#7a7f54]">
        Update your passcode and add a phone number for future features.
      </p>

      <div className="mt-4 rounded-lg bg-[#d3d6b0] px-6 py-6 text-[#4f5730] text-sm shadow-sm border border-[#c8cba0]/70">
        {currentUserName && (
          <div className="mb-4 text-xs text-[#666242]">
            Logged in as{" "}
            <span className="font-semibold">{currentUserName}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Current passcode */}
          <div className="space-y-1.5">
            <label
              htmlFor="currentPass"
              className="block text-sm font-medium text-[#4f5730]"
            >
              Current passcode
            </label>
            <div className="relative">
              <input
                id="currentPass"
                type={showCurrent ? "text" : "password"}
                value={currentPass}
                onChange={(e) => setCurrentPass(e.target.value)}
                className="w-full rounded-md border border-[#c8cba0] bg-[#f1edd8] px-3 py-2 text-sm text-[#3b4224] shadow-inner focus:outline-none focus:ring-2 focus:ring-[#8fae4c] focus:border-[#8fae4c] pr-16"
                placeholder="Enter current passcode"
              />
              <button
                type="button"
                onClick={() => setShowCurrent((v) => !v)}
                className="absolute inset-y-0 right-0 px-3 text-[11px] text-[#6b6b4a] hover:text-[#4f5730]"
              >
                {showCurrent ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          {/* New passcode */}
          <div className="space-y-1.5">
            <label
              htmlFor="newPass"
              className="block text-sm font-medium text-[#4f5730]"
            >
              New passcode
            </label>
            <div className="relative">
              <input
                id="newPass"
                type={showNew ? "text" : "password"}
                value={newPass}
                onChange={(e) => setNewPass(e.target.value)}
                className="w-full rounded-md border border-[#c8cba0] bg-[#f1edd8] px-3 py-2 text-sm text-[#3b4224] shadow-inner focus:outline-none focus:ring-2 focus:ring-[#8fae4c] focus:border-[#8fae4c] pr-16"
                placeholder="Leave blank to keep current"
              />
              <button
                type="button"
                onClick={() => setShowNew((v) => !v)}
                className="absolute inset-y-0 right-0 px-3 text-[11px] text-[#6b6b4a] hover:text-[#4f5730]"
              >
                {showNew ? "Hide" : "Show"}
              </button>
            </div>
            <p className="text-[11px] text-[#8e875d]">
              If you leave this empty, your passcode will not be changed.
            </p>
          </div>

          {/* Confirm new passcode */}
          <div className="space-y-1.5">
            <label
              htmlFor="confirmPass"
              className="block text-sm font-medium text-[#4f5730]"
            >
              Confirm new passcode
            </label>
            <div className="relative">
              <input
                id="confirmPass"
                type={showConfirm ? "text" : "password"}
                value={confirmPass}
                onChange={(e) => setConfirmPass(e.target.value)}
                className="w-full rounded-md border border-[#c8cba0] bg-[#f1edd8] px-3 py-2 text-sm text-[#3b4224] shadow-inner focus:outline-none focus:ring-2 focus:ring-[#8fae4c] focus:border-[#8fae4c] pr-16"
                placeholder="Re-enter new passcode"
              />
              <button
                type="button"
                onClick={() => setShowConfirm((v) => !v)}
                className="absolute inset-y-0 right-0 px-3 text-[11px] text-[#6b6b4a] hover:text-[#4f5730]"
              >
                {showConfirm ? "Hide" : "Show"}
              </button>
            </div>
            {passwordsMismatch && (
              <p className="text-[11px] text-red-700">
                New passcode and confirmation do not match.
              </p>
            )}
          </div>

          {/* Phone number */}
          <div className="space-y-1.5">
            <label
              htmlFor="phone"
              className="block text-sm font-medium text-[#4f5730]"
            >
              Phone number
            </label>
            <input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-md border border-[#c8cba0] bg-[#f1edd8] px-3 py-2 text-sm text-[#3b4224] shadow-inner focus:outline-none focus:ring-2 focus:ring-[#8fae4c] focus:border-[#8fae4c]"
              placeholder="Optional – for future features"
            />
            <p className="text-[11px] text-[#8e875d]">
              Not used yet, but we will store it with your profile.
            </p>
          </div>

          <div className="space-y-2 rounded-lg border border-[#d0c9a4] bg-white/80 px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#6b6f4c]">
                  Capabilities
                </p>
                <p className="text-[12px] text-[#6f754f]">
                  Update the skills and areas you can cover. This overwrites your profile in Notion.
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

          {/* Messages */}
          {formError && (
            <div className="rounded-md border border-red-500/80 bg-red-500/10 px-3 py-2 text-xs text-red-800">
              {formError}
            </div>
          )}
          {formSuccess && (
            <div className="rounded-md border border-[#8fae4c] bg-[#e2f0c8] px-3 py-2 text-xs text-[#476524]">
              {formSuccess}
            </div>
          )}

          {/* Submit */}
          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={isSubmitting || !currentUserName}
              className="rounded-md bg-[#a0b764] px-5 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#f9f9ec] shadow-md hover:bg-[#95ad5e] disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
