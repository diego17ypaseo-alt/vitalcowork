// Notificaciones Web Push (VAPID) — solo servidor.
// Genera las llaves con: npx web-push generate-vapid-keys

import webpush from "web-push";
import { crearClienteAdmin } from "@/lib/supabase/admin";

let configurado = false;

function configurar(): boolean {
  if (configurado) return true;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(
    `mailto:${process.env.VAPID_CONTACT_EMAIL ?? "admin@vitalcowork.ec"}`,
    pub,
    priv
  );
  configurado = true;
  return true;
}

/** Envía un push a todos los dispositivos registrados de un perfil */
export async function enviarPush(
  profileId: string,
  payload: { titulo: string; cuerpo: string; url?: string }
): Promise<void> {
  if (!configurar()) return; // sin llaves VAPID: se omite silenciosamente
  const admin = crearClienteAdmin();
  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("profile_id", profileId);
  if (!subs?.length) return;

  await Promise.allSettled(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({
            title: payload.titulo,
            body: payload.cuerpo,
            url: payload.url ?? "/inicio",
          })
        );
      } catch (e: unknown) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await admin.from("push_subscriptions").delete().eq("id", s.id);
        }
      }
    })
  );
}
