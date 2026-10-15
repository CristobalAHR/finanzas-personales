# Finanzas personales

PWA personal para registrar ingresos y gastos mes a mes. Un solo usuario: el dueño del repo.
Reemplaza una app anterior de gastos compartidos que ya no se usa. **No hay datos que migrar.**

## Stack

- HTML, CSS y JavaScript puro. **Sin frameworks, sin bundler, sin paso de build.**
- Módulos ES nativos (`<script type="module">`), Firebase importado desde el CDN de gstatic.
- Firestore para persistencia. Firebase Auth con Google como único método de login.
- `sw.js` + `manifest.json` para que sea instalable y funcione offline.
- Se publica con GitHub Pages desde la rama `main`.

No agregues dependencias npm, TypeScript ni un paso de compilación sin preguntar antes.
La ausencia de build es una decisión, no una deuda: permite editar y publicar sin herramientas.

## Estructura

```
index.html      shell, login y contenedor de vistas          PENDIENTE
estilos.css     estilos globales, sin preprocesador          PENDIENTE
app.js          conecta datos e interfaz, estado de vista    PENDIENTE
esquema.js      forma de los datos, migraciones versionadas  listo
calculos.js     funciones puras de cálculo                   listo
db.js           única capa que habla con Firebase            listo
sw.js           service worker                               listo
manifest.json   manifiesto PWA                               listo
```

## Modelo de datos

```
usuarios/{uid}/config/actual      categorías, ingresos, parámetros, fondo de emergencia
usuarios/{uid}/meses/{YYYY-MM}    un documento por mes
```

Documento de mes:

```js
{
  v: 1,
  clave: "2026-10",
  ingresos: { [id]: { plan, real } },
  gastos:   { [id]: { plan, real } },
  saldos:   { inicio, cierre },
  nota: "", cerrado: false, creado, actualizado
}
```

## Reglas de arquitectura

Salieron de problemas reales en la app anterior. No las cambies sin discutirlo.

1. **El monto presupuestado (`plan`) vive dentro del documento del mes**, nunca en la definición de
   la categoría. La categoría solo tiene `planPorDefecto`, que siembra meses nuevos. Si el plan
   viviera en la categoría, cambiarlo recalcularía el historial y falsearía los desvíos pasados.

2. **Las categorías no se borran, se archivan** (`activa: false`). Un ID eliminado deja meses
   antiguos apuntando a la nada.

3. **`calculos.js` es puro.** Recibe objetos planos, devuelve números. No importa Firebase ni toca
   el DOM. Todo indicador nuevo entra ahí. Es el único archivo trivialmente testeable.

4. **`db.js` es el único archivo que importa Firebase.** El resto de la app no sabe que Firestore
   existe.

5. **El service worker cachea solo assets estáticos, jamás datos de Firestore.** La persistencia
   offline de los datos la maneja `persistentLocalCache` en `db.js`. Dos cachés compitiendo por los
   mismos datos fue la causa raíz de pérdidas de información en la app anterior.

6. **Sube `CACHE` en `sw.js` en cada despliegue.** Sin eso quedan sesiones corriendo código antiguo
   contra datos nuevos.

7. **Versión de esquema en el dato, migración al leer.** Si cambias la forma de `config` o de un mes,
   sube `ESQUEMA_VERSION` y agrega la migración. **Nunca edites una migración ya publicada**; solo
   agregas la siguiente.

8. **Nada de login anónimo.** Los UID anónimos se pierden al limpiar el navegador y los datos quedan
   huérfanos bajo un dueño inaccesible. Google Auth da un UID estable.

## Convenciones de código

- Identificadores, comentarios y textos de interfaz **en español**.
- Moneda con `Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP" })`, sin decimales.
  Los montos se guardan como enteros de pesos.
- Claves de mes siempre `YYYY-MM`, ordenables como texto.
- Sin librerías de fecha; `Date` nativo basta.
- Indentación de 2 espacios, comillas dobles, punto y coma.

## Cómo probar

Todavía no hay suite de tests.

- Servidor local: `python3 -m http.server 8000`. Los módulos ES no funcionan con `file://`.
- `calculos.js` se ejercita desde la consola del navegador con objetos de mes inventados.
- Antes de dar por buena una tarea que toque `db.js`, confirma en la consola de Firebase que el
  documento quedó con la forma esperada.

Si agregas tests, que sean sobre `calculos.js` primero: es puro y ahí está la lógica de negocio.

## Estado

`esquema.js` y `calculos.js` se ejecutaron con datos de ejemplo y dan resultados coherentes:
indicadores, conciliación, desvíos y cobertura del fondo. No hay tests automatizados todavía.

`db.js` **nunca se ha ejecutado** — requiere un proyecto de Firebase real. Asume que tiene bugs
hasta que corra. Sospechoso conocido: la consulta por `__name__` en `cargarRango`; si Firestore
reclama, agrega un campo `clave` explícito al documento y consulta por ahí.

Las credenciales de Firebase en `db.js` son marcadores de posición. Faltan los íconos que declara
`manifest.json`.

## Contexto del producto

El método no es anotar cada compra. Es un cierre mensual de unos quince minutos: se cargan los gastos
fijos conocidos y los grandes, y lo variable se obtiene por diferencia contra la cartola bancaria
(saldo inicial + ingresos − saldo final). Esa brecha va completa a la categoría
"Variable sin clasificar". Diseña la interfaz para ese flujo, no para captura de transacciones.

Indicadores que importan: tasa de ahorro (meta 20%), costo de vivienda sobre el ingreso (techo 30%)
y cobertura del fondo de emergencia en meses de gasto (objetivo 6, mínimo aceptable 3).
