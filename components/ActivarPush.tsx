"use client";

// Activa las notificaciones push (Web Push / VAPID). En iOS requiere tener
// la app instalada en la pantalla de inicio (iOS 16.4+).

import { useEffect, useMemo, useState } from "react";
import { crearClienteNavegador } from "@/lib/supabase/client";

function base64AUint8(base64: string): Uint8Array {
  const relleno = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + relleno).replace(/-/g, "+").replace(/_/g, "/");
  const crudo = atob(b64);
  return Uint8Array.from([...crudo].map((c) => c.charCodeAt(0)));
}

export function ActivarPush() {
  const supabase = useMemo(() => crearClienteNavegador(), []);
  const [estado, setEstado] = useState<"no-soportado" | "inactivo" | "activo" | "sin-llaves">("inactivo");

  const llave = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setEstado("no-soportado");
      return;
    }
    if (!llave) {
      setEstado("sin-llaves");
      return;
    }
    navigator.serviceWorker.ready.then(async (reg) => {
      const sub = await reg.pushManager.getSubscription();
      setEstado(sub ? "activo" : "inactivo");
    });
  }, [llave]);

  const activar = async () => {
    try {
      const permiso = await Notification.requestPermission();
      if (permiso !== "granted") return;
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64AUint8(llave!) as BufferSource,
      });
      const json = sub.toJSON();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      await supabase.from("push_subscriptions").upsert(
        {
          profile_id: user!.id,
          endpoint: sub.endpoint,
          p256dh: json.keys!.p256dh,
          auth: json.keys!.auth,
        },
        { onConflict: "endpoint" }
      );
      setEstado("activo");
    } catch {
      // usuario canceló o navegador bloqueó
    }
  };

  if (estado === "no-soportado" || estado === "sin-llaves") return null;
  if (estado === "activo")
    return (
      <p className="text-xs font-semibold text-exito">🔔 Notificaciones push activas en este dispositivo</p>
    );
  return (
    <button onClick={activar} className="btn-secundario w-full">
      🔔 Activar notificaciones push
    </button>
  );
}
