/**
 * calculos.js
 * Funciones puras: reciben objetos planos, devuelven números.
 * No importan Firebase ni tocan el DOM. Todo indicador nuevo entra aquí,
 * sin riesgo sobre los datos guardados.
 */

const suma = (obj, ids, campo = "real") =>
  ids.reduce((s, id) => s + (obj?.[id]?.[campo] ?? 0), 0);

const idsPorGrupo = (config, grupo) =>
  config.categorias.filter((c) => c.grupo === grupo).map((c) => c.id);

const idsVivienda = (config) =>
  config.categorias.filter((c) => c.vivienda).map((c) => c.id);

const idsIngreso = (config) => config.ingresos.map((i) => i.id);

/* ------------------------------------------------------------------ */

/**
 * Indicadores del mes.
 *
 * ahorroEfectivo = lo que realmente sobró (ingresos menos gastos).
 * ahorroMovido   = lo que efectivamente transferiste a fondo o inversión.
 * La brecha entre ambos es plata que sobró pero quedó suelta en la cuenta
 * corriente, que es donde tiende a evaporarse.
 */
export function indicadores(mes, config) {
  const ing = idsIngreso(config);
  const nec = idsPorGrupo(config, "necesidad");
  const des = idsPorGrupo(config, "deseo");
  const aho = idsPorGrupo(config, "ahorro");

  const ingresosReal = suma(mes.ingresos, ing);
  const ingresosPlan = suma(mes.ingresos, ing, "plan");

  const necesidades = suma(mes.gastos, nec);
  const deseos = suma(mes.gastos, des);
  const ahorroMovido = suma(mes.gastos, aho);
  const gastos = necesidades + deseos;

  const vivienda = suma(mes.gastos, idsVivienda(config));
  const ahorroEfectivo = ingresosReal - gastos;
  const sobre = (n) => (ingresosReal > 0 ? n / ingresosReal : 0);

  return {
    ingresosReal,
    ingresosPlan,
    gastos,
    gastosPlan: suma(mes.gastos, [...nec, ...des], "plan"),
    necesidades,
    deseos,
    ahorroMovido,
    ahorroEfectivo,
    ahorroOcioso: Math.max(0, ahorroEfectivo - ahorroMovido),
    vivienda,
    tasaAhorro: sobre(ahorroEfectivo),
    pctVivienda: sobre(vivienda),
    pctNecesidades: sobre(necesidades),
    pctDeseos: sobre(deseos),
    viviendaSobreTecho: sobre(vivienda) > (config.parametros?.techoVivienda ?? 0.30),
    cumpleMetaAhorro: sobre(ahorroEfectivo) >= (config.parametros?.metaTasaAhorro ?? 0.20),
  };
}

/**
 * Desvíos por categoría, ordenados por magnitud.
 * En el grupo 'ahorro' lo malo es el desvío negativo; en el resto, el positivo.
 */
export function desvios(mes, config) {
  return config.categorias
    .filter((c) => mes.gastos?.[c.id])
    .map((c) => {
      const { plan = 0, real = 0 } = mes.gastos[c.id];
      const delta = real - plan;
      return {
        id: c.id,
        nombre: c.nombre,
        grupo: c.grupo,
        plan,
        real,
        delta,
        pct: plan > 0 ? delta / plan : null,
        problema: c.grupo === "ahorro" ? delta < 0 : delta > 0,
      };
    })
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

/**
 * Conciliación contra la cartola bancaria.
 *
 * Todo lo que salió de la cuenta = saldo inicial + ingresos − saldo final.
 * Lo que no calza con lo registrado es el gasto variable sin clasificar.
 * Esto reemplaza anotar cada compra chica.
 */
export function conciliar(mes, config) {
  const k = indicadores(mes, config);
  const inicio = mes.saldos?.inicio ?? 0;
  const cierre = mes.saldos?.cierre ?? 0;
  const disponible = inicio > 0 && k.ingresosReal > 0;

  const salidas = inicio + k.ingresosReal - cierre;
  const registrado = k.gastos + k.ahorroMovido;
  const brecha = salidas - registrado;

  return {
    disponible,
    salidas,
    registrado,
    brecha,
    cuadrado: Math.abs(brecha) < 15000,
    pctSinClasificar: salidas > 0 ? brecha / salidas : 0,
  };
}

/* ------------------------------------------------------------------ */

/** Serie histórica para gráficos. `meses` es un array de documentos de mes. */
export function serieHistorica(meses, config) {
  return [...meses]
    .sort((a, b) => a.clave.localeCompare(b.clave))
    .map((m) => {
      const k = indicadores(m, config);
      return {
        clave: m.clave,
        ingresos: k.ingresosReal,
        gastos: k.gastos,
        ahorro: k.ahorroEfectivo,
        tasaAhorro: k.tasaAhorro,
        pctVivienda: k.pctVivienda,
        cerrado: !!m.cerrado,
      };
    })
    .filter((r) => r.ingresos > 0 || r.gastos > 0);
}

/** Gasto mensual promedio de los últimos N meses con datos. */
export function gastoPromedio(meses, config, n = 3) {
  const serie = serieHistorica(meses, config).slice(-n);

  if (!serie.length) {
    const ids = [...idsPorGrupo(config, "necesidad"), ...idsPorGrupo(config, "deseo")];
    return ids.reduce((s, id) => {
      const c = config.categorias.find((x) => x.id === id);
      return s + (c?.planPorDefecto || 0);
    }, 0);
  }

  return serie.reduce((s, r) => s + r.gastos, 0) / serie.length;
}

/** Cobertura del fondo de emergencia, en meses de gasto. */
export function coberturaFondo(saldoFondo, meses, config) {
  const p = config.parametros || {};
  const promedio = gastoPromedio(meses, config, p.mesesPromedioGasto ?? 3);
  const cobertura = promedio > 0 ? saldoFondo / promedio : 0;
  const objetivo = p.mesesFondoObjetivo ?? 6;

  return {
    cobertura,
    gastoPromedio: promedio,
    objetivoMeses: objetivo,
    faltante: Math.max(0, promedio * objetivo - saldoFondo),
    suficiente: cobertura >= 3,
  };
}

/**
 * Tendencia simple: compara el promedio de los últimos `n` meses contra los
 * `n` anteriores. Útil para detectar deriva del gasto.
 */
export function tendencia(meses, config, n = 3) {
  const serie = serieHistorica(meses, config);
  if (serie.length < n * 2) return null;

  const prom = (arr) => arr.reduce((s, r) => s + r.gastos, 0) / arr.length;
  const reciente = prom(serie.slice(-n));
  const previo = prom(serie.slice(-n * 2, -n));

  return {
    reciente,
    previo,
    delta: reciente - previo,
    pct: previo > 0 ? (reciente - previo) / previo : 0,
  };
}

/* ------------------------------------------------------------------ */

export const clp = (n) =>
  new Intl.NumberFormat("es-CL", {
    style: "currency", currency: "CLP", maximumFractionDigits: 0,
  }).format(Math.round(n || 0));

export const miles = (n) => new Intl.NumberFormat("es-CL").format(Math.round(n || 0));

export const pct = (n, dec = 1) => `${(n * 100).toFixed(dec).replace(".", ",")}%`;
