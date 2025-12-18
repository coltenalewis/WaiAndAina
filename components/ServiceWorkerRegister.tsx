"use client";

import { useEffect, useRef } from "react";

export function ServiceWorkerRegister() {
  const registeredRef = useRef(false);

  useEffect(() => {
    if (registeredRef.current) return;
    if (!("serviceWorker" in navigator)) return;

    const register = async () => {
      try {
        await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        registeredRef.current = true;
      } catch (err) {
        console.error("Service worker registration failed", err);
      }
    };

    window.addEventListener("load", register);
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
