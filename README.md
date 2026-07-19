# VitalCowork 🩺

Plataforma de reservas para el coworking médico **VitalCowork** (Guayaquil,
Ecuador): un cardiólogo alquila por horas los consultorios de su centro a otros
profesionales de la salud (**co-meds**), administrado por el propietario
(**co-manager**).

> “Tu prestigio y experiencia médica, ahora respaldados por el espacio perfecto”

## Stack

| Capa | Tecnología | Por qué |
|---|---|---|
| App | **Next.js 16** (App Router, TypeScript) como **PWA instalable** | Un solo código para iOS, Android, web y modo kiosco; sin costo de tiendas |
| Backend | **Supabase** (Postgres + RLS + Auth + Realtime + Storage) | Relacional, seguridad por rol en la base, tiempo real y tier gratuito |
| Estilos | Tailwind CSS v4 + design system propio | Paleta sobria tipo salud |
| Pagos | **Payphone** (Botón de Pagos) + transferencia + efectivo | Pasarela ecuatoriana |
| Push | Web Push (VAPID) — Android e iOS ≥16.4 instalada | Sin costo |
| Correo | Resend | Tier gratuito |
| Tests | Vitest + test de concurrencia contra Postgres | Requisito del negocio |

**Anti-colisión de reservas**: índice único parcial en Postgres sobre
`(space_id, fecha, hora)` para reservas activas + funciones SQL transaccionales
(`SECURITY DEFINER`). Dos usuarios no pueden reservar el mismo bloque ni en
condición de carrera (ver `tests/concurrencia.test.ts`).

## Modelo de datos (ER)

```mermaid
erDiagram
    profiles ||--o{ accreditations : "carga"
    profiles ||--o{ reservations : "reserva"
    profiles ||--o{ packages : "contrata"
    profiles ||--o{ wallet_ledger : "monedero"
    profiles ||--o{ referrals : "deriva"
    profiles ||--o| ratings : "calificado por co-manager"
    profiles ||--o{ payments : "paga"
    profiles ||--o{ tnc_acceptances : "acepta"
    profiles ||--o{ push_subscriptions : "dispositivos"
    profiles ||--o{ notifications : "recibe"
    specialties ||--o{ profiles : "especialidad"
    spaces ||--o{ reservations : "aloja"
    spaces ||--o{ space_availability : "habilitación satélite"
    spaces ||--o{ holidays_blocks : "bloqueo opcional"
    plans ||--o{ packages : "define"
    plans ||--o{ reservations : "tarifa"
    packages ||--o{ wallet_ledger : "horas"
    reservations ||--o| sessions : "check-in/out"
    reservations ||--o{ reservation_events : "auditoría"
    reservations }o--o| payments : "pago"
    payments }o--o| packages : "compra"
    reward_catalog ||--o{ referrals : "estudio"
    referrals ||--o{ wallet_ledger : "acredita horas"
    tnc_versions ||--o{ tnc_acceptances : "versión"

    profiles {
        uuid id PK
        rol comed_o_comanager
        estado pendiente_aprobado_suspendido
        text nombre_completo
        text cedula
        text alias "único dato visible a otros co-meds"
        int reincidencias_excedente
        bool suspension_proxima_reserva
    }
    reservations {
        uuid id PK
        date fecha
        int hora "bloque de 1h; índice único parcial anti-colisión"
        estado pendiente_confirmada_en_curso_completada_cancelada_no_show
        origen app_ventanilla_whatsapp_telefono
        int reagendamientos
        bool es_hora_extra "Art. 9"
    }
    wallet_ledger {
        bigint id PK
        numeric delta_horas "libro mayor inmutable"
        origen compra_recompensa_consumo_penalizacion_expiracion
        date vence_en
    }
    packages {
        uuid id PK
        numeric horas_total
        date inicio
        date fin "vigencia 30 dias, no acumulable"
    }
    sessions {
        uuid id PK
        timestamptz checkin_at
        timestamptz checkout_at
        int minutos_excedente
        bool alerta_franja_ocupada
    }
```

Lógica crítica en funciones SQL (`supabase/migrations/0003_funciones.sql`):
`fn_reservar_bloques`, `fn_reagendar`, `fn_cancelar` (Art. 4),
`fn_checkin`/`fn_checkout` (Art. 9: 8 min de gracia, hora extra, suspensión),
`fn_confirmar_pago`, `fn_comprar_paquete`, `fn_acreditar_recompensa`,
`fn_expirar_vigencias`.

## Puesta en marcha (desarrollo local)

Requisitos: Node.js ≥ 20 (ideal 22), Docker (para Supabase local).

```bash
cd vitalcowork
npm install

# 1) Supabase local (aplica migraciones y seed automáticamente)
npx supabase init          # solo la primera vez, acepta valores por defecto
npx supabase start
#    → copia la API URL y anon key que imprime en .env.local

# 2) Variables de entorno
cp .env.example .env.local  # completa NEXT_PUBLIC_SUPABASE_URL y ANON_KEY

# 3) App
npm run dev                 # http://localhost:3000
```

Cuentas demo del seed (`supabase/seed.sql`), contraseña `demo123456`:

| Rol | Correo |
|---|---|
| Co-manager | `admin@vitalcowork.ec` |
| Co-med aprobada (paquete Estancia Plus activo) | `dra.paredes@demo.ec` |
| Co-med aprobado (2 h de recompensa) | `dr.molina@demo.ec` |
| Co-med pendiente de aprobación | `lic.andrade@demo.ec` |

### Tests

```bash
npm test                                   # unitarios (precios, Art. 4/9, feriados, calendario)
# Test de concurrencia (requiere supabase local levantado):
TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm test
```

## Despliegue a producción (costo inicial ≈ $0)

### 1. Supabase (backend)

1. Crea un proyecto en [supabase.com](https://supabase.com) (plan Free).
2. **SQL Editor** → ejecuta en orden el contenido de
   `supabase/migrations/0001…0004` y luego `supabase/seed.sql`
   (⚠ en producción borra del seed el bloque de *cuentas demo* si no las quieres,
   pero conserva catálogos, planes, settings, feriados y T&C).
3. Crea tu usuario co-manager real: regístrate desde la app y luego en
   **Table Editor → profiles** cambia `rol` a `comanager` y `estado` a `aprobado`.
4. **Authentication → Providers**:
   - **Google**: crea credenciales OAuth en Google Cloud Console
     (tipo "Web", redirect: `https://TU-PROYECTO.supabase.co/auth/v1/callback`).
   - **Azure (Microsoft/Hotmail)**: registra una app en Microsoft Entra
     (soporte para cuentas personales), mismo redirect.
   - **Email**: activa confirmación de correo.
5. **Authentication → URL Configuration**: agrega tu dominio de Vercel a
   *Site URL* y *Redirect URLs* (`https://tu-app.vercel.app/auth/callback`).

### 2. Vercel (frontend)

1. Sube el repo a GitHub e importa el proyecto en [vercel.com](https://vercel.com).
2. En **Environment Variables** copia todas las de `.env.example` con valores reales.
3. Deploy. La app queda instalable como PWA:
   - **Android/Chrome**: menú → “Instalar aplicación”.
   - **iPhone/Safari**: Compartir → “Agregar a pantalla de inicio”
     (necesario para recibir push en iOS).

### 3. Payphone (tarjetas)

1. Cuenta de comercio en [Payphone Business](https://www.payphone.app) →
   consola de desarrolladores → aplicación **Botón de Pagos**.
2. Copia `PAYPHONE_TOKEN` y `PAYPHONE_STORE_ID` a Vercel.
3. En la configuración de la app Payphone registra la URL de respuesta:
   `https://tu-app.vercel.app/pago/respuesta`.

Sin credenciales, la app funciona igual con transferencia y efectivo.

### 4. Notificaciones

- **Push**: `npx web-push generate-vapid-keys` → copia ambas llaves a Vercel.
- **Correo**: crea una cuenta en [resend.com](https://resend.com), verifica tu
  dominio y copia `RESEND_API_KEY`.
- **Cron** (recordatorios 24h/1h, expiraciones, avisos): crea un job gratuito en
  [cron-job.org](https://cron-job.org) que llame cada 5–10 min a
  `https://tu-app.vercel.app/api/cron/tareas?clave=TU_CRON_SECRET`.

### 5. Después del despliegue

- Panel **⚙ Configuración**: pon los números reales de cuentas bancarias,
  verifica el WhatsApp (0983936496 → formato `593983936496`) y revisa precios.
- Carpeta `public/assets/fotos`: sube las fotos reales (`foto1.jpg`…`foto5.jpg`).
- Cada diciembre: botón “Cargar feriados de Ecuador <año>” en Configuración.

## Estructura del proyecto

```
vitalcowork/
├── app/                    # rutas (App Router)
│   ├── (comed)/            # inicio, calendario, reservas, planes, recompensas, perfil, pago
│   ├── admin/              # panel co-manager (dashboard, aprobaciones, ventanilla, config)
│   ├── kiosco/             # modo recepción (PC del establecimiento)
│   ├── registro/           # onboarding en 3 pasos (cuenta → perfil → T&C)
│   └── api/                # Payphone, recibos, export CSV, cron
├── components/             # UI (design system, calendario, tensiómetro, admin…)
├── lib/
│   ├── negocio/            # lógica pura testeable (precios, Art. 4/9, calendario)
│   ├── supabase/           # clientes browser/server/admin
│   └── feriados-ecuador.ts # feriados con traslados según ley
├── supabase/
│   ├── migrations/         # esquema + RLS + funciones transaccionales
│   └── seed.sql            # catálogos, reglamento v1.0, feriados, demo
├── tests/                  # unitarios + concurrencia
└── docs/guia-admin.md      # guía no técnica para el co-manager
```

## Seguridad

- **RLS en todas las tablas**: un co-med solo ve sus datos; las reservas ajenas
  se exponen únicamente por `calendar_slots` (alias + especialidad, sin datos
  personales — cumplimiento LOPDP).
- Acreditaciones y comprobantes en **buckets privados** (solo dueño + co-manager).
- Reglas de negocio en funciones `SECURITY DEFINER`: no se pueden burlar desde
  el cliente. Triggers de defensa impiden auto-aprobación de perfiles y
  manipulación de montos de pago.
- `SUPABASE_SERVICE_ROLE_KEY` solo vive en el servidor (webhook Payphone y cron).

## Módulo futuro

La tabla `payments` (con `numero_recibo` secuencial y `payphone_tx`) deja lista
la base para el módulo de **facturación electrónica SRI**.
