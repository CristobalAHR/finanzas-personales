/**
 * db.js
 * Única capa que habla con Firebase. El resto de la app no importa Firestore.
 *
 * Estructura en Firestore:
 *   usuarios/{uid}/config/actual
 *   usuarios/{uid}/meses/{YYYY-MM}
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, getDoc, setDoc, collection, getDocs, query, where, orderBy, onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import {
  ESQUEMA_VERSION, CONFIG_INICIAL, migrarConfig, migrarMes,
  mesVacio, completarCategorias, desplazarMes,
} from "./esquema.js";

// La config web de Firebase no es secreta: la seguridad está en las reglas de
// Firestore, que solo permiten a cada uid leer y escribir su propio subárbol.
const firebaseConfig = {
  apiKey: "AIzaSyC-WyZze5CDAEnXAcHRQ_TIC6gDpru1GKQ",
  authDomain: "finanzas-personales-b75db.firebaseapp.com",
  projectId: "finanzas-personales-b75db",
  storageBucket: "finanzas-personales-b75db.firebasestorage.app",
  messagingSenderId: "832984917097",
  appId: "1:832984917097:web:e5adc43d408f09d16aaef8"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Caché persistente: la app funciona sin red y sincroniza al volver.
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

/* ------------------------------------------------------------------ */
/* Sesión                                                              */
/* ------------------------------------------------------------------ */

export const entrar = () => signInWithPopup(auth, new GoogleAuthProvider());
export const salir = () => signOut(auth);
export const alCambiarSesion = (cb) => onAuthStateChanged(auth, cb);
export const uidActual = () => auth.currentUser?.uid ?? null;

const refConfig = (uid) => doc(db, "usuarios", uid, "config", "actual");
const refMes = (uid, clave) => doc(db, "usuarios", uid, "meses", clave);
const colMeses = (uid) => collection(db, "usuarios", uid, "meses");

/* ------------------------------------------------------------------ */
/* Configuración                                                       */
/* ------------------------------------------------------------------ */

/**
 * Lee la config, la migra si viene de una versión anterior y devuelve la
 * versión al día. Si migró, la reescribe para no repetir el trabajo.
 */
export async function cargarConfig(uid) {
  const snap = await getDoc(refConfig(uid));

  if (!snap.exists()) {
    const inicial = { ...CONFIG_INICIAL, creado: new Date().toISOString() };
    await setDoc(refConfig(uid), inicial);
    return inicial;
  }

  const crudo = snap.data();
  const migrada = migrarConfig(crudo);
  if ((crudo.v ?? 1) !== ESQUEMA_VERSION) {
    await setDoc(refConfig(uid), migrada);
  }
  return migrada;
}

export async function guardarConfig(uid, config) {
  await setDoc(refConfig(uid), {
    ...config,
    v: ESQUEMA_VERSION,
    actualizado: new Date().toISOString(),
  });
}

/* ------------------------------------------------------------------ */
/* Meses                                                               */
/* ------------------------------------------------------------------ */

/**
 * Abre un mes. Si no existe, lo crea heredando el plan del mes anterior.
 * Si existe pero le faltan categorías nuevas, las agrega sin tocar montos.
 */
export async function abrirMes(uid, clave, config) {
  const snap = await getDoc(refMes(uid, clave));

  if (!snap.exists()) {
    const previoSnap = await getDoc(refMes(uid, desplazarMes(clave, -1)));
    const previo = previoSnap.exists() ? migrarMes(previoSnap.data()) : null;
    const nuevo = mesVacio(clave, config, previo);
    await setDoc(refMes(uid, clave), nuevo);
    return nuevo;
  }

  const { mes, cambio } = completarCategorias(migrarMes(snap.data()), config);
  if (cambio) await setDoc(refMes(uid, clave), mes);
  return mes;
}

/**
 * Guarda un mes. Rechaza la escritura si el mes está cerrado, salvo que se
 * pase `forzar: true` (para el botón de reabrir).
 */
export async function guardarMes(uid, mes, { forzar = false } = {}) {
  if (mes.cerrado && !forzar) {
    throw new Error(`El mes ${mes.clave} está cerrado. Reábrelo para editarlo.`);
  }
  await setDoc(refMes(uid, mes.clave), {
    ...mes,
    v: ESQUEMA_VERSION,
    actualizado: new Date().toISOString(),
  });
}

export const cerrarMes = (uid, mes) =>
  guardarMes(uid, { ...mes, cerrado: true }, { forzar: true });

export const reabrirMes = (uid, mes) =>
  guardarMes(uid, { ...mes, cerrado: false }, { forzar: true });

/** Escucha cambios en vivo. Útil si abres la app en el celular y el notebook. */
export function escucharMes(uid, clave, cb) {
  return onSnapshot(refMes(uid, clave), (s) => {
    if (s.exists()) cb(migrarMes(s.data()));
  });
}

/** Todos los meses entre dos claves, inclusive. Para el histórico. */
export async function cargarRango(uid, desde, hasta) {
  const q = query(
    colMeses(uid),
    where("__name__", ">=", desde),
    where("__name__", "<=", hasta),
    orderBy("__name__"),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => migrarMes(d.data()));
}

export async function cargarTodosLosMeses(uid) {
  const snap = await getDocs(query(colMeses(uid), orderBy("__name__")));
  return snap.docs.map((d) => migrarMes(d.data()));
}

/* ------------------------------------------------------------------ */
/* Respaldo                                                            */
/* ------------------------------------------------------------------ */

export async function exportarTodo(uid) {
  const [config, meses] = await Promise.all([
    cargarConfig(uid),
    cargarTodosLosMeses(uid),
  ]);
  return { exportado: new Date().toISOString(), v: ESQUEMA_VERSION, config, meses };
}

/** Descarga el respaldo como archivo. Llámalo desde un botón en Ajustes. */
export async function descargarRespaldo(uid) {
  const datos = await exportarTodo(uid);
  const blob = new Blob([JSON.stringify(datos, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `respaldo-finanzas-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Restaura desde un respaldo. Sobrescribe config y los meses incluidos. */
export async function importarRespaldo(uid, datos) {
  await setDoc(refConfig(uid), migrarConfig(datos.config));
  for (const m of datos.meses || []) {
    await setDoc(refMes(uid, m.clave), migrarMes(m));
  }
}
