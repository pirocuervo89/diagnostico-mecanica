# Informe · Jornada GPS / 3D / ADAS — 22/11/2026

Trabajo realizado sobre `diagnostico-mecanica` (HADAS), sin cambiar de proyecto ni tocar tienda, pagos, DTC o Mi Garaje.

## 1. Trabajo realizado

- Auditoría del GPS, los tres modos (clásico, 3D exterior, ADAS), cámara, sensores, carriles, señales, HUD y MAYA.
- Reconstrucción visual del **modo 3D exterior** manteniendo el GT4 y la navegación reales.
- Corrección de perspectiva y rumbo de la carretera para curvas.
- Optimización del dibujado del asfalto.
- Suavizado del avance de cámara 3D.
- Filtro de jitter del GPS a baja velocidad.
- Aviso de soporte movido en AR.
- HUD con hora de llegada y avisos de pérdida de GPS/ruta.
- Avisos de voz de curva, estrechamiento, cambio de carril e incorporación; intermitente manual con histéresis.

## 2. Archivos modificados

- `public/js/ruta.js` (GPS, 3D, ADAS, carriles, HUD, voz).
- `public/js/app.js` (comandos de MAYA: modos, demo, calibrar, ancho).
- `public/js/cabina3d.js` (cabina GT4 en Three.js).
- `public/index.html` (canvas 3D/AR, botones, panel de ancho, intermitentes, versiones).
- `public/css/ruta.css` (HUD, cabina, panel de ancho, intermitentes).
- `public/sw.js` (cache `dm-app-v77`).

## 3. Mejoras implementadas

- **3D exterior**: cielo con sol, nubes y montañas con paralaje; vegetación, edificios, arcén, guardarraíles y paso elevado; ruta azul, flechas y línea central animada; GT4 recortado con bordes difuminados.
- **Carretera**: rumbo limitado por tramo (evita que un giro lejano saque la calzada de pantalla) y ribbon continuo.
- **Rendimiento**: asfalto con color plano alterno en lugar de 64 degradados por fotograma; cámara 3D suavizada.
- **GPS**: filtro de microsaltos (<1,5 m a baja velocidad); aviso “SIN SEÑAL GPS” tras 20 s sin posición; “SIN RUTA ACTIVA” si no hay ruta.
- **HUD 3D**: hora estimada de llegada, límite de vía (dato de mapa) y etiqueta de modo.
- **ADAS**: aviso de recalibración si el soporte se inclina >22° durante 1,5 s.
- **Carriles**: ajuste cuadrático, búfer temporal para discontinuas, emparejado por ancho/centro, histéresis y calibración del cero y del ancho.
- **Voz**: curva cerrada, carril estrecho en metros, cambio de carril confirmado por intermitente, posible incorporación.

## 4. Errores encontrados y corregidos

- La carretera 3D se convertía en líneas horizontales en curvas fuertes por un rumbo sin límite.
- El HUD 3D mostraba la distancia con decimales largos.
- Los carteles de pasos ocupaban media pantalla y tapaban la calzada.
- El coche mostraba el rectángulo de fondo de la foto.
- El aviso de salida de carril se disparaba al volver al centro tras un cambio señalizado.
- El intermitente se apagaba antes de completar la maniobra y provocaba un aviso falso.

## 5. Pruebas ejecutadas

- `node --check` de `ruta.js`, `app.js` y `cabina3d.js`.
- `npm test`: **201/201 OK**.
- Playwright con GPS y cámara simulados: navegación, AR, cabina 3D, carriles sintéticos (recto, curva, discontinuas), cambio de carril, incorporación, panel de ancho, avisos de voz y captura del 3D exterior.
- Inspección visual de capturas del 3D y del HUD.

## 6. Resultados

- 3D exterior visible y dibujado, 0 errores de consola.
- Enganche de carriles ≈0,38 s; recto 0,00; curva −0,30 con confianza >0,84.
- Ancho: 3,5 m por defecto, 3,0 m calibrado, 2,3 m al estrecharse.
- Cambio de carril confirmado una sola vez y autoapagado al centrar.

## 7. Rendimiento

- Eliminados 64 degradados por fotograma en el asfalto.
- Cámara 3D suavizada para evitar saltos entre segmentos.
- Visión de carriles a 160×120 cada 200–300 ms.
- Sin dependencias nuevas.

## 8. Pendiente

- Pruebas con GPS y cámara **reales** en el Redmi.
- Medición real de FPS, batería y temperatura en gama media.
- Lectura OCR de señales solo si el navegador expone `TextDetector`.
- Alineación AR por sensores, aproximada (no ARCore/WebXR).
- No hay mapas ni navegación offline implementados; no se simulan.

## 9. Pruebas físicas pendientes (Redmi 12)

- Permiso de cámara y enfoque en conducción real.
- Calibración 🎯 en el soporte definitivo y comprobación de deriva.
- Calibración del ancho con referencia medida.
- Cambio de carril con intermitente real.
- Visibilidad del HUD con sol directo y de noche.

## 9-bis. Ciclo 2 (misma jornada)

- **3D a ~30 fps**: se evita redibujar en cada fotograma de 60 Hz para ahorrar CPU y batería.
- **Señales de cámara con estabilidad temporal**: una caja roja debe mantenerse ~0,65 s en la misma zona antes de mostrarse; desaparece a los 1,2 s y el OCR se etiqueta como “cámara (OCR)” para no confundirlo con el límite del mapa.
- **Recalculando ruta**: indicador en el HUD 3D mientras se pide una ruta nueva.
- **Recarga del 3D** cuando cambia la geometría de la ruta, aunque tenga el mismo número de puntos.
- **Filtro de jitter** más seguro: solo se aplica cuando el marcador del mapa ya existe.
- Pruebas: señal sintética confirmada y retirada correctamente; 201/201 tests.

## 9-ter. Ciclo 3 (pulido visual)

- Las líneas de carril, la ruta y las flechas AR se recortan al 62 % superior: ya no se dibujan sobre el volante, el salpicadero ni la consola.
- Las líneas se ocultan por debajo de confianza 0,22, usan extremos redondeados y grosor proporcional a la pantalla.
- En 3D y AR se ocultan los controles de giro del mapa (izquierda/derecha/norte), que no se usan en esos modos.
- En 3D exterior solo quedan los controles de conducción: 3D, cámara, detener, voz y demo.
- Verificado con capturas de ambos modos y 201/201 tests.

## 9-quater. Ciclo 4 · Prueba real en Redmi 23053RN02Y

Probado en el teléfono con Chrome 158 sobre el servidor local (`adb reverse`), no en un navegador de escritorio.

- **GPS real**: fix de 14 m de precisión en Ciudad Real; el aviso de «sin señal» desaparece en cuanto llega un fix real.
- **Cámara real**: la cámara trasera entrega 480×640 a 30 fps y el modo AR se activa con la cabina y las líneas.
- **Buscador**: la lista de resultados quedaba debajo de «Recientes» y de la alerta de GPS; se ocultan ambos al buscar y los resultados pasan a la capa superior.
- **Botón de iniciar tapado**: la barra inferior de la app y una cabecera fija se comían el pie del mapa. En la vista Ruta se ocultan cabecera y barra en móvil, y el panel queda por encima del área segura.
- **Botón de parar invisible**: `display: grid` anulaba el atributo `hidden`, así que el botón de parar (oculto) interceptaba los toques del de iniciar. Se corrige con `[hidden] { display: none }` para todos los FAB.
- **Lienzo 3D/AR cortado**: `100vh` era mayor que el alto visible del móvil. Ahora ocupan el 100 % de la vista y el coche deja libre el HUD inferior.
- **Coche del 3D**: se recorta por la silueta real de la foto (sin el fondo azul de estudio), se respeta su proporción y se sube por encima del aviso de maniobra.
- **Panel de ruta**: con el panel abierto se ocultan GPS y modo noche (vuelven al navegar) para no tapar la ETA ni «Iniciar navegación».
- Probado en el dispositivo: buscar → elegir → iniciar → parar → 3D → AR → calibrar ancho (3,6 m) → calibrar AR → demo, sin errores de JavaScript.
- `npm test`: 195/195 correctos.

### Pendiente de prueba física

- Detección de carriles y señales con la cámara apuntando a una carretera real (en la prueba la cámara miraba a una pared).
- Precisión del GPS en movimiento y recalculo real al desviarse.
- Visibilidad del HUD con sol directo y de noche.

## 10. Cuota de Freebuff

No verificable desde el entorno de ejecución.

## 9-quinquies. Ciclo 5 · Carretera y habitáculo GT4

- **Ruta desde el GPS real**: al pedir un destino nada más abrir, el GPS aún no tenía fix y se calculaba desde el centro del mapa (rutas falsas de 190-351 km). Ahora espera hasta 9 s a una posición real; si no llega, avisa y no disfraza el resultado.
- **Carretera 3D**: proyección con reparto no lineal de profundidad para que las curvas de ciudad no queden aplastadas contra el horizonte; calzada continua por trazos (los rellenos poligonales se cruzaban en curvas cerradas), arcén, líneas, huellas, guardarraíles, flechas y ruta comparten el mismo trazado.
- **Primeros 32 m enderezados** bajo el coche para que el vehículo quede sobre su carril; a partir de ahí manda la geometría real de OSRM.
- **Entorno**: silueta de ciudad con ventanas, árboles, farolas, pórtico de señal con dos postes y señal de límite acotada para que no tape el HUD.
- **Coche**: se usa el GLB real `golf-r-75.glb` (no una foto), orientado de espaldas, escalado a la anchura del carril, con sombra, halo y encuadre bajo para no comerse el HUD. El lienzo WebGL se redimensiona con `ResizeObserver` (antes se quedaba a 450×225 y borroso).
- **Habitáculo ADAS**: cámara de conductor más atrás y nivelada, salpicadero, cuadro digital con velocidad/marcha, volante GT4 más pequeño, consola central, pantalla de ruta, rejillas, embellecedor, botón de arranque, piso, mampara y pedales. Se retiran techo y espejo que tapaban el parabrisas en vertical.
- **AR**: la cinta de ruta se reduce al 24 % del ancho y baja de opacidad; deja ver la cámara.
- Pruebas: `npm test` 195/195. En el Redmi, vía CDP: ruta de 1,7 km, 3D activo, GLB cargado, lienzos 393×801 y sin errores de JavaScript. AR probado con vídeo sintético: vídeo listo, cabina montada y HUD alineado.

### Limitación de esta prueba

La pantalla del Redmi estaba bloqueada y MIUI no permite inyectar el botón de encendido por ADB. Por eso la cámara física no pudo arrancar (`NotReadableError`) y la prueba de AR se hizo con una señal de vídeo sintética. Falta la comprobación visual con cámara real y con el móvil desbloqueado.

## 9-sexies. Ciclo 6 · Prueba real en el Redmi y corrección de escala

- El usuario desbloqueó el móvil y se pudo probar de verdad, sin cámara sintética.
- **Fallo grave encontrado**: el GLB del Golf mide 167 × 57 × 79 unidades y se escalaba con `0.0115`, dejando el coche en **0,91 m de ancho**. Se normaliza por el ancho real (`1,55 / size.z`): ahora mide 1,55 m y se ve como un coche, no como una miniatura.
- **Encuadre**: cámara trasera más baja y objetivo recalibrado; el aviso de maniobra pasa de la parte inferior (tapaba el coche) a la franja superior. El botón de detener se mueve a la izquierda y se oculta el botón de demostración durante 3D/AR para no tapar el vehículo.
- **Calzada**: ancho reducido a 8,2 m y tope de escala a 46 para que el asfalto no invada toda la pantalla; el degradado de asfalto ahora se aplica de verdad (antes se creaba y no se usaba).
- **ADAS real**: vídeo de cámara `480×640`, `readyState 4`, cabina 3D montada y sin errores. Se sube el cuadro, se agranda y se baja el salpicadero para que no corte los dígitos; la cinta de ruta se recorta al 50,5 % de la altura para que no se dibuje sobre el cuadro ni el volante.
- Comprobado en el Redmi con Chrome 158 por CDP y capturas `adb screencap`: 3D activo con coche cargado, AR con cámara real y botones recolocados. `npm test` 195/195.

Nota: la cámara del móvil estaba apuntando al techo durante la prueba, así que la imagen es gris; lo validado es que el stream real arranca y que la composición 3D/ADAS se monta encima sin errores.

## 9-septies. Ciclo 7 · Cabina GT4 de la referencia y más campo de cámara

- Se tomó como referencia `Escritorio/Cabina GT4 con navegación neón.png` y se rehizo `cabina3d.js` entero para acercarse a ese interior: volante grueso de Alcantara con franja amarilla a las 12, costuras, dos mandos redondos con botones, pinza central GT4, salidas de aire redondas con aro cian, cuadro digital con arco de velocidad azul, consola central inclinada con pantalla de navegación, clima con mandos, palanca de cambios con pomo rojo y botón de arranque rojo.
- **Más campo de visión**: la cámara 3D pasa de 64° a 78° y el objetivo baja; entran las dos salidas, el volante completo y parte de las puertas, y el parabrisas gana superficie. En la cámara real se pide 1280×960 (4:3) y el vídeo se muestra con `object-fit: contain`, de modo que entra el fotograma completo en horizontal en vez del recorte 9:16; las bandas superior/inferior quedan detrás del HUD y de la cabina.
- La cinta AR se recorta al 50,5 % de la altura para terminar justo encima del cuadro.
- Validado con Chromium + WebGL local a 480×753 y capturas: la cabina se monta sin errores, el cuadro y la consola quedan completos y la cinta no invade el cuadro. `npm test` 195/195 y `node --check` de `cabina3d.js`/`ruta.js`.
- **Pendiente de verificación real**: el Redmi se bloqueó durante la prueba y no se pudo desbloquear por ADB (`INJECT_EVENTS` denegado). Falta abrir el móvil, activar ADAS AR y comprobar el encuadre con la cámara de la calle.

## 10-septies. Ciclo 8 · Cabina fotorrealista desde la foto GT4

- Se sustituye la cabina procedural por un **recorte con transparencia de la propia foto** `Cabina GT4 con navegación neón.png`: se conservan volante, cuadro, consola, salidas, puertas y espejo, y se hace transparente el parabrisas para que detrás se vea la cámara real.
- El asset resultante es `public/img/cabina-gt4.webp` (1440×810, 154 KB) con alfa; la versión 3D queda solo como respaldo si la foto no carga.
- Al entrar en AR se bloquea la orientación **horizontal** (si el navegador lo permite) porque la cabina de la foto es 16:9 y así se ve entera, como la referencia. Al salir se libera.
- El vídeo de cámara pasa a `object-fit: cover`: en la prueba real el móvil entregó **1280×960** y la cámara llena todo el parabrisas, sin la tira vertical intermedia.
- En modo foto se ocultan chat, 3D, calibrar y ancho para no tapar el volante; quedan cámara y stop.
- **Probado en el Redmi** (Chrome 158, cámara real): la foto carga (`naturalWidth 1440`), el AR queda activo, la orientación pasa a landscape y el vídeo entrega 1280×960 con `cover`. La calle no se pudo comprobar porque el móvil estaba apuntando al techo/interior, pero el encuadre y la capa transparente funcionan.

## 10-decies. Ajuste panorámico · habitáculo completo

- El recorte 16:9 se ampliaba para llenar el móvil en horizontal y se comía la parte superior (espejo retrovisor). Se genera `public/img/cabina-gt4-wide.webp` (2292×810, 174 KB): la foto original se mantiene **a altura completa** y se añaden laterales sintéticos oscuros y desenfocados, con sombra en las uniones, hasta la relación 2.83 del móvil.
- Así se ven enteros el **espejo, el cuadro, el volante, los botones, la pantalla central, la consola y la palanca**, sin recorte vertical.
- Probado en el Redmi en horizontal (847×299): imagen `naturalWidth 2292`, AR activo y cabina completa; la cámara sigue viéndose por el parabrisas transparente.
- En pantalla completa (2.28) la imagen recorta solo los laterales sintéticos, nunca el habitáculo.

## 10-undecies. Encuadre de conducción · volante bajo y cámara al cristal

- Se corrige el exceso de protagonismo del volante: la cabina se reduce al **80%** y se ancla abajo dentro de un marco de habitáculo oscuro (`public/img/cabina-gt4-seat.webp`, 2292×810, 125 KB).
- El marco tapa la cámara fuera del coche; el vídeo real solo se ve por el **parabrisas transparente**, ajustado al cristal, y el espejo queda colgado del techo en vez de flotar.
- Se conserva el coche completo: espejo, cuadro, volante, botones, pantalla central, consola y palanca. No se recorta ninguna parte del habitáculo.
- Probado en el Redmi en horizontal (847×299): AR activo, imagen `naturalWidth 2292`, cabina completa y cámara asomando por el cristal.

## 10-duodecies. Sin espejo, sin franja y a pantalla completa

- Se elimina de la foto el **espejo retrovisor completo** (cuerpo, soporte y reflejo) y la franja del techo que cortaba la parte superior; el cristal queda limpio.
- Se usa la foto original **sin marco ni bandas**: `cabina-gt4-float.webp`, con bordes superior y laterales desvanecidos para que la cámara no se corte en seco.
- La cabina se reduce al **86% de alto**, centrada abajo: el volante queda bajo, se ve la carretera por el cristal y alrededor, y se conservan cuadro, botones, pantalla, consola y palanca.
- La imagen se guarda en WebP **sin pérdida** y se muestra a resolución nativa reducida, sin reescalados que la emborronen.
- Al activar AR se pide **pantalla completa** dentro del gesto del botón, además del bloqueo horizontal, para quitar la barra del navegador que cortaba la cámara.
- Probado en el Redmi en horizontal (847×299): AR activo, `fullscreenElement` verdadero, imagen `naturalWidth 1440`, sin espejo y sin franja. La cámara sigue apuntando al techo, así que falta validar la carretera real.
