# Finanzas personales

PWA para registrar ingresos y gastos mes a mes. Un solo usuario.

El método no es anotar cada compra: es un cierre mensual de unos quince minutos. Se cargan los
gastos fijos y los grandes, y el gasto variable se obtiene por diferencia contra la cartola
bancaria (saldo inicial + ingresos − saldo final).

## Puesta en marcha

1. **Crear el proyecto en Firebase.** En la consola, habilita Authentication con el proveedor
   Google, y crea una base de datos Firestore en modo producción.

2. **Pegar las credenciales.** Copia la config web del proyecto en `firebaseConfig`, dentro de
   `db.js`. Esa config no es secreta: la seguridad vive en las reglas, no en la clave.

3. **Aplicar las reglas de Firestore.** En la consola, pestaña Rules:

   ```js
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /usuarios/{uid}/{documento=**} {
         allow read, write: if request.auth != null && request.auth.uid == uid;
       }
     }
   }
   ```

4. **Publicar con GitHub Pages** desde la rama `main`. Agrega el dominio que te asigne GitHub
   a los dominios autorizados en Authentication → Settings, o el login con Google va a fallar.

5. **Crear los íconos** que declara `manifest.json`: `icono-192.png`, `icono-512.png` y
   `icono-512-maskable.png`.

## Desarrollo local

```bash
python3 -m http.server 8000
```

Los módulos ES no funcionan con `file://`, así que hay que servir por HTTP.
Agrega `localhost` a los dominios autorizados en Firebase Authentication.

Para no pelear con el service worker mientras desarrollas, marca
"Update on reload" en la pestaña Application de las herramientas del navegador.

## Antes de cada despliegue

Sube la constante `CACHE` en `sw.js`. Sin eso quedan sesiones corriendo código viejo.

## Archivos

| Archivo | Rol |
|---|---|
| `esquema.js` | Forma de los datos, valores iniciales, migraciones versionadas |
| `calculos.js` | Funciones puras: indicadores, desvíos, conciliación, serie histórica, fondo |
| `db.js` | Única capa que habla con Firebase |
| `app.js` | Conecta datos e interfaz *(pendiente)* |
| `index.html` | Shell, login y vistas *(pendiente)* |
| `estilos.css` | Estilos *(pendiente)* |

Las decisiones de arquitectura y las convenciones están en `CLAUDE.md`.
