// Test de concurrencia de reservas (obligatorio por requisito):
// N clientes intentan reservar EL MISMO bloque en paralelo → exactamente 1 gana.
//
// Requiere una base Postgres con las migraciones aplicadas (Supabase local):
//   npx supabase start
//   TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm test
// Sin TEST_DATABASE_URL el test se omite (no falla en CI sin base).

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";

const URL_BD = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL_BD)("concurrencia de reservas (bloqueo transaccional)", () => {
  let pool: Pool;
  const comeds: string[] = [];
  let espacio: string;
  // Un martes lejano para no chocar con seeds ni feriados
  const FECHA = "2031-03-11";
  const HORA = 10;

  beforeAll(async () => {
    pool = new Pool({ connectionString: URL_BD, max: 15 });
    const { rows: esp } = await pool.query(
      "select id from spaces where es_principal limit 1"
    );
    espacio = esp[0].id;

    // 10 co-meds aprobados de prueba
    for (let i = 0; i < 10; i++) {
      const { rows } = await pool.query(
        `insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
         values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
           'concurrencia' || $1 || '@test.ec', 'x', now(), '{}', '{}', now(), now(), '', '', '', '')
         returning id`,
        [i + "-" + Date.now()]
      );
      const id = rows[0].id;
      await pool.query(
        `insert into profiles (id, rol, estado, nombre_completo, alias, email)
         values ($1, 'comed', 'aprobado', 'Test Concurrencia ' || $2, 'T.C.', 'c@test.ec')`,
        [id, i]
      );
      comeds.push(id);
    }
  });

  afterAll(async () => {
    if (!pool) return;
    await pool.query(`delete from auth.users where email like 'concurrencia%@test.ec'`);
    await pool.end();
  });

  async function reservarComo(profileId: string): Promise<"ok" | string> {
    const cliente = await pool.connect();
    try {
      await cliente.query("begin");
      // Simula la sesión del usuario (auth.uid() = sub del JWT)
      await cliente.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: profileId, role: "authenticated" }),
      ]);
      await cliente.query(`select fn_reservar_bloques($1::jsonb, $2::uuid, false, 'app')`, [
        JSON.stringify([{ fecha: FECHA, hora: HORA }]),
        espacio,
      ]);
      await cliente.query("commit");
      return "ok";
    } catch (e) {
      await cliente.query("rollback");
      return (e as Error).message;
    } finally {
      cliente.release();
    }
  }

  it("de 10 intentos simultáneos sobre el mismo bloque, exactamente 1 tiene éxito", async () => {
    const resultados = await Promise.all(comeds.map((id) => reservarComo(id)));
    const exitos = resultados.filter((r) => r === "ok");
    const rechazos = resultados.filter((r) => r !== "ok");

    expect(exitos.length).toBe(1);
    expect(rechazos.length).toBe(9);
    for (const r of rechazos) {
      expect(r).toMatch(/BLOQUE_OCUPADO/);
    }

    const { rows } = await pool.query(
      `select count(*)::int as n from reservations
       where space_id = $1 and fecha = $2 and hora = $3
         and estado in ('pendiente_pago','confirmada','en_curso')`,
      [espacio, FECHA, HORA]
    );
    expect(rows[0].n).toBe(1);
  });

  it("un segundo intento posterior sobre el bloque ocupado también es rechazado", async () => {
    const r = await reservarComo(comeds[5]);
    expect(r).toMatch(/BLOQUE_OCUPADO/);
  });
});
