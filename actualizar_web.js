import fs from 'fs';
import path from 'path';

const htmlContent = `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Plataforma de Diagnóstico Automotriz</title>
    <style>
        body { font-family: sans-serif; background: #121212; color: #e0e0e0; margin: 0; padding: 15px; }
        .container { max-width: 500px; margin: 0 auto; text-align: center; }
        h1 { color: #f39c12; font-size: 24px; margin-bottom: 5px; }
        .subtitle { font-size: 14px; color: #aaa; margin-bottom: 25px; }
        .stats-box { background: #1e1e1e; border-radius: 8px; padding: 15px; margin-bottom: 25px; border: 1px solid #333; }
        .stat-item { padding: 10px 0; border-bottom: 1px solid #2a2a2a; font-size: 16px; }
        .stat-item:last-child { border-bottom: none; }
        .stat-number { font-weight: bold; color: #f39c12; font-size: 18px; margin-right: 5px; }
        form { margin-bottom: 25px; }
        input[type="text"] { width: 100%; padding: 12px; border-radius: 6px; border: 1px solid #444; background: #222; color: #fff; box-sizing: border-box; margin-bottom: 10px; font-size: 16px; }
        button { width: 100%; padding: 12px; border-radius: 6px; border: none; background: #f39c12; color: #000; font-weight: bold; font-size: 16px; cursor: pointer; }
        #resultado { background: #1e1e1e; border-radius: 8px; padding: 15px; text-align: left; line-height: 1.5; border: 1px solid #333; }
        .advertencia { font-size: 12px; color: #e74c3c; margin-top: 25px; background: #2c1a1a; padding: 10px; border-radius: 6px; border: 1px solid #5c2424; }
        .footer { font-size: 11px; color: #666; margin-top: 30px; }
        /* Estilos para las tarjetas de productos inyectados */
        .productos-titulo { color: #f39c12; margin-top: 25px; border-top: 1px solid #333; padding-top: 15px; }
        .producto-tarjeta { background: #252525; border: 1px solid #444; border-radius: 6px; padding: 12px; margin-bottom: 12px; }
        .producto-tarjeta h5 { margin: 0 0 5px 0; color: #fff; font-size: 15px; }
        .producto-tarjeta p { margin: 0 0 10px 0; color: #bbb; font-size: 13px; }
        .producto-tarjeta span { font-weight: bold; color: #2ecc71; display: inline-block; margin-right: 15px; }
        .producto-tarjeta a { background: #2ecc71; color: #fff; text-decoration: none; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; }
    </style>
</head>
<body>
    <div class="container">
        <div>🔧</div>
        <h1>DIAGNÓSTICO Y MECÁNICA</h1>
        <div class="subtitle">Plataforma de Diagnóstico Automotriz. Encuentra la causa. Comprueba antes de cambiar.</div>

        <!-- Bloque de Contadores Automáticos -->
        <div class="stats-box">
            <div class="stat-item"><span id="count-dtc">...</span> códigos DTC cargados</div>
            <div class="stat-item"><span id="count-symptoms">...</span> síntomas indexados</div>
            <div class="stat-item"><span id="count-products">...</span> casilleros de herramientas y ropa</div>
        </div>

        <!-- Formulario de Consulta para la IA -->
        <form id="chat-form">
            <input type="text" id="chat-input" placeholder="Ej: P0300 o el motor da tirones..." required>
            <button type="submit">Buscar en Modo IA</button>
        </form>

        <!-- Aquí se pinta la respuesta de la IA y los productos de Amazon -->
        <div id="resultado">Introduce una avería o código arriba para iniciar el diagnóstico con el asistente de IA.</div>

        <div class="advertencia">
            ⚠️ Importante: esta plataforma ofrece orientación. Una pieza no debe sustituirse únicamente por un código o síntoma; confirma con mediciones y pruebas de taller.
        </div>

        <div class="footer">
            Diagnóstico y Mecánica - Herramienta informativa · Comprueba antes de sustituir
        </div>
    </div>

    <!-- Carga del script del frontend -->
    <script src="/js/app.js"></script>
</body>
</html>`;

const publicDir = path.join(process.cwd(), 'public');
fs.writeFileSync(path.join(publicDir, 'index.html'), htmlContent, 'utf8');
console.log('Archivo index.html reescrito correctamente con casilleros activos.');
