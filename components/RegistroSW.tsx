"use client";

import { useEffect } from "react";

/** Registra el service worker de la PWA (offline + push) */
export function RegistroSW() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => null);
    }
  }, []);
  return null;
}
