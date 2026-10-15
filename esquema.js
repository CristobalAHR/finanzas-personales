/**
 * esquema.js
 * Define la forma de los datos y cómo migrarlos entre versiones.
 *
 * Regla: cada vez que cambies la forma de `config` o de un mes, sube
 * ESQUEMA_VERSION en 1 y agrega la función de migración correspondiente.
 * Nunca edites una migración ya publicada: solo agregas la siguiente.
 */

export const ESQUEMA_VERSION = 1;

/* ------------------------------------------------------------------ */
/* Configuración inicial                                               */
/* ------------------------------------------------------------------ */

export const CONFIG_INICIAL = {
  v: ESQUEMA_VERSION,
  moneda: "CLP",

  ingresos: [
    { id: "sueldo", nombre: "Sueldo líquido", planPorDefecto: 2400000, activa: true, orden: 1 },
    { id: "extra",  nombre: "Ingresos extra", planPorDefecto: 0,       activa: true, orden: 2 },
  ],

  // grupo: 'necesidad' | 'deseo' | 'ahorro'
  // vivienda: true si el monto cuenta para el techo del 30% del ingreso
  categorias: [
    { id: "arriendo",      nombre: "Arriendo",                     grupo: "necesidad", vivienda: true,  planPorDefecto: 430000, activa: true, orden: 1 },
    { id: "gc",            nombre: "Gastos comunes",               grupo: "necesidad", vivienda: true,  planPorDefecto: 100000, activa: true, orden: 2 },
    { id: "servicios",     nombre: "Luz, agua, gas e internet",    grupo: "necesidad", vivienda: false, planPorDefecto: 75000,  activa: true, orden: 3 },
    { id: "super",         nombre: "Supermercado y hogar",         grupo: "necesidad", vivienda: false, planPorDefecto: 220000, activa: true, orden: 4 },
    { id: "guarderia",     nombre: "Guardería de Bonnie",          grupo: "necesidad", vivienda: false, planPorDefecto: 180000, activa: true, orden: 5 },
    { id: "bonnie",        nombre: "Bonnie: comida y veterinario", grupo: "necesidad", vivienda: false, planPorDefecto: 60000,  activa: true, orden: 6 },
    { id: "transporte",    nombre: "Transporte",                   grupo: "necesidad", vivienda: false, planPorDefecto: 50000,  activa: true, orden: 7 },
    { id: "salud",         nombre: "Salud y seguros",              grupo: "necesidad", vivienda: false, planPorDefecto: 60000,  activa: true, orden: 8 },
    { id: "anuales",       nombre: "Gastos anuales prorrateados",  grupo: "necesidad", vivienda: false, planPorDefecto: 50000,  activa: true, orden: 9 },

    { id: "gimnasio",      nombre: "Gimnasio",                     grupo: "deseo", vivienda: false, planPorDefecto: 40000,  activa: true, orden: 20 },
    { id: "comer",         nombre: "Comer fuera y delivery",       grupo: "deseo", vivienda: false, planPorDefecto: 100000, activa: true, orden: 21 },
    { id: "suscripciones", nombre: "Suscripciones",                grupo: "deseo", vivienda: false, planPorDefecto: 25000,  activa: true, orden: 22 },
    { id: "ocio",          nombre: "Ocio, compras y regalos",      grupo: "deseo", vivienda: false, planPorDefecto: 80000,  activa: true, orden: 23 },
    { id: "variable",      nombre: "Variable sin clasificar",      grupo: "deseo", vivienda: false, planPorDefecto: 60000,  activa: true, orden: 24 },

    { id: "fondo",         nombre: "Fondo de emergencia",          grupo: "ahorro", vivienda: false, planPorDefecto: 200000, activa: true, orden: 40 },
    { id: "inversion",     nombre: "Inversión",                    grupo: "ahorro", vivienda: false, planPorDefecto: 150000, activa: true, orden: 41 },
  ],

  parametros: {
    techoVivienda: 0.30,     // alerta si el costo de vivienda supera esto
    metaTasaAhorro: 0.20,
    mesesFondoObjetivo: 6,
    mesesPromedioGasto: 3,   // ventana para calcular cobertura del fondo
  },

  fondoEmergencia: { saldo: 0, actualizado: null },
};

/* ------------------------------------------------------------------ */
/* Migraciones                                                         */
/* ------------------------------------------------------------------ */

/**
 * Cada clave N transforma un objeto de versión N a versión N+1.
 * Deben ser puras y dar siempre el mismo resultado.
 *
 * Ejemplo para cuando llegue el momento:
 *   2: (cfg) => ({
 *        ...cfg,
 *        categorias: cfg.categorias.map((c) => ({ ...c, deducible: false })),
 *      }),
 */
export const MIGRACIONES_CONFIG = {};

export const MIGRACIONES_MES = {};

function aplicar(obj, migraciones, etiqueta) {
  let d = { ...obj };
  let v = typeof d.v === "number" ? d.v : 1;
  while (v < ESQUEMA_VERSION) {
    const paso = migraciones[v];
    if (!paso) {
      console.warn(`[esquema] Falta migración ${etiqueta} de v${v} a v${v + 1}`);
      break;
    }
    d = paso(d);
    v += 1;
  }
  return { ...d, v: ESQUEMA_VERSION };
}

export const migrarConfig = (cfg) =>
  cfg ? aplicar(cfg, MIGRACIONES_CONFIG, "config") : { ...CONFIG_INICIAL };

export const migrarMes = (mes) => aplicar(mes, MIGRACIONES_MES, "mes");

/* ------------------------------------------------------------------ */
/* Utilidades de mes                                                   */
/* ------------------------------------------------------------------ */

export const claveMes = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

export const desplazarMes = (clave, n) => {
  const [a, m] = clave.split("-").map(Number);
  return claveMes(new Date(a, m - 1 + n, 1));
};

const MESES_ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio",
                  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export const nombreMes = (clave) => {
  const [a, m] = clave.split("-");
  return `${MESES_ES[Number(m) - 1]} ${a}`;
};

/**
 * Crea un mes vacío. El plan se hereda del mes anterior si existe, y si no,
 * del planPorDefecto de cada categoría.
 *
 * Importante: el plan queda congelado dentro del mes. Cambiar el
 * planPorDefecto en config no altera meses ya creados.
 */
export function mesVacio(clave, config, mesAnterior = null) {
  const sembrar = (items, previo) => {
    const out = {};
    for (const it of items) {
      if (!it.activa) continue;
      const heredado = previo?.[it.id]?.plan;
      out[it.id] = {
        plan: typeof heredado === "number" ? heredado : (it.planPorDefecto || 0),
        real: 0,
      };
    }
    return out;
  };

  const ahora = new Date().toISOString();

  return {
    v: ESQUEMA_VERSION,
    clave,
    ingresos: sembrar(config.ingresos, mesAnterior?.ingresos),
    gastos: sembrar(config.categorias, mesAnterior?.gastos),
    saldos: { inicio: 0, cierre: 0 },
    nota: "",
    cerrado: false,
    creado: ahora,
    actualizado: ahora,
  };
}

/**
 * Agrega al mes las categorías creadas después de que el mes existía, sin
 * tocar los montos ya registrados. Se llama al abrir un mes.
 */
export function completarCategorias(mes, config) {
  const out = { ...mes, ingresos: { ...mes.ingresos }, gastos: { ...mes.gastos } };
  let cambio = false;

  for (const c of config.categorias) {
    if (c.activa && !out.gastos[c.id]) {
      out.gastos[c.id] = { plan: c.planPorDefecto || 0, real: 0 };
      cambio = true;
    }
  }
  for (const i of config.ingresos) {
    if (i.activa && !out.ingresos[i.id]) {
      out.ingresos[i.id] = { plan: i.planPorDefecto || 0, real: 0 };
      cambio = true;
    }
  }

  return { mes: out, cambio };
}
