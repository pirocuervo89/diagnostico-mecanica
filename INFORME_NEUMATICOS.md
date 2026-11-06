# Neumáticos y llantas · informe de entrega

Fecha: 6 de noviembre de 2026
Ruta en la web: `/#neumaticos` (menú **Neumáticos**, entre Luz y multimedia y Productos)

---

## 1. Qué se ha construido

### Buscador por medida
Formulario de anchura, perfil y diámetro de llanta (205 / 55 / 16) con filtro de
temporada. Devuelve las fichas del catálogo con marca, modelo, medida, índices de
carga y velocidad, temporada, etiqueta europea disponible, precio con fecha de
consulta, tienda y enlace de compra con etiqueta de afiliación si está configurada.

Cuando no hay fichas para una medida, **no se rellena con nada**: aparece un estado
vacío que lo dice y ofrece la calculadora de equivalencias como alternativa.

### Calculadora de equivalencias
Compara todas las combinaciones de anchura (135–355 mm) y perfil (25–85 %) para
llantas de 13″ a 24″, descartando lo que se aleje más del 3 % del diámetro original
y lo que cambie la anchura en más de 30 mm. Por cada medida muestra:

- diámetro exterior y diferencia en mm y en porcentaje;
- variación de anchura;
- garganta de llanta orientativa (ETRTO aproximado);
- avisos por fila (cerca del límite del 3 %, anchura al límite, etc.).

Agrupa por diámetro de llanta y pone primero la llanta original.

> No se afirma que una medida sea legal: se explica que la equivalencia válida es
> la de la ficha técnica o la que confirme la ITV, y se recuerda que cambia
> velocímetro, consumo y presión.

### Comparador
Hasta tres fichas a la vez. Enfrenta precio (marca el más bajo), medida, temporada,
índices, eficiencia, agarre en mojado, ruido (marca el más bajo) y tienda. Donde no
hay dato publicado pone **«Sin dato»**; no se estima ni se puntúa.

### Llantas
Comprobador de cotas entre la llanta actual y la candidata:

| Cota | Qué valida |
|---|---|
| PCD | Que coincida tornillería (5x112, 5x114.3…) |
| Buje | Buje menor = no entra; buje mayor = anillos centradores |
| ET | Cambio de vía en mm y riesgo de roce interior/exterior |
| Garganta | Diferencia de anchura y avisos de estirado/roce |
| Diámetro | Aviso de que el neumático debe compensar |

Veredicto en tres niveles: *encaja en las cotas*, *requiere comprobación* o
*no compatible*. Se recalca que valida cotas, no homologación.

---

## 2. Datos reales, no inventados

- **48 neumáticos** en **8 medidas**: 195/60 R15, 195/65 R15, 205/50 R17,
  205/55 R16, 205/60 R16, 215/55 R16, 225/40 R18 y 225/45 R17.
- Cada ficha tiene **ASIN de Amazon.es**, precio visto, enlace directo y **foto real
  descargada** al proyecto (`public/img/neumaticos/`, 33 KB de media). Nada de
  imágenes remotas que puedan caerse.
- **13 fichas** incluyen etiqueta europea (combustible / mojado / ruido) porque el
  anuncio la publica. Las demás muestran «Sin dato» en esos campos.
- Los precios llevan fecha (`priceSeen`) y el aviso de que prevalece el de la tienda.
- **No se publican fichas de llantas** porque no hay forma de verificar PCD, ET y
  buje de cada referencia concreta. Se ofrece el comprobador y la guía, que es lo
  que sí se puede sostener sin inventar.

### Afiliación
Todos los enlaces pasan por `withAffiliateTag`. Basta poner
`AFFILIATE_TAG_AMAZON=tuetiqueta-21` en `.env` para que salgan con `?tag=` y
generen comisión. Sin etiqueta, los enlaces funcionan igual.

---

## 3. API

| Método | Ruta | Uso |
|---|---|---|
| GET | `/api/tyres?w=205&p=55&r=16&season=verano` | Buscar fichas |
| GET | `/api/tyres/meta` | Marcas, medidas y recuentos |
| GET | `/api/tyres/equivalents?w=205&p=55&r=16` | Medidas alternativas |
| POST | `/api/wheels/fit` | Comprobar llanta (`{current, candidate}`) |

Lógica pura en `src/lib/tyres.js`; rutas en `src/routes/api.js`; vista en
`public/js/tyres.js`; datos en `data/tyres.json`.

---

## 4. Pruebas ejecutadas

### Automáticas
`npm test` → **134/134** (23 nuevas en `tests/tyres.test.mjs`): medidas válidas e
inválidas, diámetro 631,9 mm de 205/55 R16, rango de garganta, límites del 3 % y
30 mm, ausencia de medidas desproporcionadas, PCD, buje, ET y vía.

### Navegador real (Firefox, servidor local)

| Comprobación | 1360×1000 | 390×844 |
|---|---|---|
| Vista activa y hash `#neumaticos` | sí | sí |
| Fichas 205/55 R16 | 6 | 6 |
| Fotos cargadas | 6/6 | 6/6 |
| Enlaces Amazon | 6 | 6 |
| Cabecera de fichas verificadas | 48 | 48 |
| Grupos de equivalencias / filas | 5 / 60 | 5 / 60 |
| Medida sin catálogo → estado vacío | sí | sí |
| Cambio a 225/45 R17 y recálculo | sí | sí |
| Comparador: columnas / filas | 4 / 9 | 4 / 9 |
| Cuarta ficha rechazada | sí | sí |
| Llantas: veredicto / comprobaciones | requiere comprobación / 5 | igual |
| PCD 5x114.3 → incompatible | sí | sí |
| Desbordamiento horizontal | 1354/1354 | 384/384 |
| Errores de consola | ninguno | ninguno |

---

## 5. Límites conocidos y siguiente paso

- El catálogo cubre 8 medidas. Ampliarlo es repetir el escaneo con más medidas:
  `node .tmp/tyre-scan.mjs "225/40 R18"` y `node .tmp/tyre-build.mjs`.
- La etiqueta europea solo aparece cuando el anuncio la publica; no se deduce del
  modelo.
- Los precios son una foto del día de consulta. Para «precio actualizado» de verdad
  hace falta una API de tienda (Amazon PA-API u otra), no scraping continuo.
- No hay catálogo de llantas verificadas: solo comprobador de cotas.
- Falta decidir si se enlaza este módulo desde el buscador universal de la home.

---

## 6. Estado del resto del proyecto

Este informe cubre el módulo de neumáticos. Quedan pendientes de la lista anterior,
sin tocar en esta entrega: retirar el simulador OBD de la interfaz, terminar la
segunda pasarela de pago y el informe global del proyecto.
