// Tipos de dominio de VitalCowork (reflejan el esquema Postgres)

export type Rol = "comed" | "comanager";
export type EstadoPerfil = "pendiente" | "aprobado" | "suspendido";
export type EstadoReserva =
  | "pendiente_pago"
  | "confirmada"
  | "en_curso"
  | "completada"
  | "cancelada"
  | "no_show";
export type OrigenReserva = "app" | "ventanilla" | "whatsapp" | "telefono";
export type MetodoPago = "payphone" | "transferencia" | "efectivo";
export type EstadoPago = "pendiente" | "confirmado" | "rechazado";
export type PlanId = "triaje" | "estancia" | "vip";

export interface Perfil {
  id: string;
  rol: Rol;
  estado: EstadoPerfil;
  nombre_completo: string;
  cedula: string | null;
  alias: string;
  especialidad_id: number | null;
  telefono: string | null;
  email: string;
  reincidencias_excedente: number;
  suspension_proxima_reserva: boolean;
  creado_en: string;
}

export interface Plan {
  id: PlanId;
  nivel: string;
  nombre: string;
  precio_hora: number;
  min_horas_semana: number | null;
  min_horas_mes: number | null;
  reagendamientos_por_reserva: number | null; // null = ilimitado
  color: string;
  badge: string | null;
  copy_comercial: string | null;
  orden: number;
  activo: boolean;
}

export interface Espacio {
  id: string;
  nombre: string;
  descripcion: string | null;
  es_principal: boolean;
  reservable_publico: boolean;
  activo: boolean;
}

export interface Reserva {
  id: string;
  profile_id: string;
  space_id: string;
  fecha: string; // YYYY-MM-DD
  hora: number; // hora de inicio del bloque de 1h
  estado: EstadoReserva;
  origen: OrigenReserva;
  package_id: string | null;
  plan_id: PlanId | null;
  precio: number;
  pago_id: string | null;
  reagendamientos: number;
  es_hora_extra: boolean;
  notas: string | null;
  creado_en: string;
}

/** Fila de la tabla espejo pública del calendario (sin datos personales) */
export interface SlotCalendario {
  reservation_id: string;
  space_id: string;
  fecha: string;
  hora: number;
  estado: EstadoReserva;
  alias: string;
  especialidad: string | null;
  es_hora_extra: boolean;
}

export interface Paquete {
  id: string;
  profile_id: string;
  plan_id: PlanId;
  horas_total: number;
  precio_total: number;
  estado: "pendiente_pago" | "activo" | "agotado" | "expirado";
  inicio: string | null;
  fin: string | null;
}

export interface Pago {
  id: string;
  numero_recibo: number;
  profile_id: string;
  package_id: string | null;
  monto: number;
  metodo: MetodoPago;
  estado: EstadoPago;
  comprobante_path: string | null;
  confirmado_en: string | null;
  creado_en: string;
}

export interface BloqueoFeriado {
  id: string;
  fecha: string;
  tipo: "feriado" | "manual";
  motivo: string;
  space_id: string | null;
  hora_inicio: number | null;
  hora_fin: number | null;
}

export interface ResumenMonedero {
  saldo_total: number;
  saldo_general: number;
  paquete: {
    id: string;
    plan: PlanId;
    horas_total: number;
    saldo: number;
    inicio: string;
    fin: string;
    dias_restantes: number;
  } | null;
}

export interface Notificacion {
  id: number;
  profile_id: string;
  tipo: string;
  titulo: string;
  cuerpo: string;
  datos: Record<string, unknown>;
  leido_en: string | null;
  creado_en: string;
}

export interface Bloque {
  fecha: string;
  hora: number;
}
