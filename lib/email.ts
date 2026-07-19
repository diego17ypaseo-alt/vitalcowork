// Correo transaccional con Resend — solo servidor.
// Sin RESEND_API_KEY el envío se omite (útil en desarrollo local).

export async function enviarCorreo(opts: {
  para: string;
  asunto: string;
  html: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(`[correo omitido] ${opts.para}: ${opts.asunto}`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM ?? "VitalCowork <notificaciones@vitalcowork.ec>",
      to: [opts.para],
      subject: opts.asunto,
      html: opts.html,
    }),
  });
  if (!res.ok) console.error(`Resend falló (${res.status}): ${await res.text()}`);
}

export function plantillaCorreo(titulo: string, cuerpo: string): string {
  return `<!doctype html><html lang="es"><body style="margin:0;background:#f0f7f7;font-family:Segoe UI,Roboto,Arial,sans-serif">
  <div style="max-width:560px;margin:24px auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #d8e7e7">
    <div style="background:#0e7490;color:#fff;padding:20px 28px">
      <div style="font-size:20px;font-weight:700">Vital<span style="color:#7dd3fc">Cowork</span></div>
      <div style="font-size:12px;opacity:.85">Coworking médico · Guayaquil</div>
    </div>
    <div style="padding:28px">
      <h2 style="margin:0 0 12px;color:#134e4a;font-size:18px">${titulo}</h2>
      <div style="color:#334155;font-size:14px;line-height:1.6">${cuerpo}</div>
    </div>
    <div style="padding:16px 28px;background:#f8fafc;color:#94a3b8;font-size:11px">
      Tu prestigio y experiencia médica, ahora respaldados por el espacio perfecto.
    </div>
  </div></body></html>`;
}
