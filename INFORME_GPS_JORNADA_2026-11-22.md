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

## 10. Cuota de Freebuff

No verificable desde el entorno de ejecución.
