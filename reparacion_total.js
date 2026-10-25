import fs from 'fs';
import path from 'path';

const htmlLimpio = `<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width,initial-scale=1.0">
    <title>Plataforma de Diagnostico Automotriz</title>
    <style>
        body { font-family: sans-serif; background: #121212; color: #e0e0e0; margin: 0; padding: 10px; }
        .container { max-width: 500px; margin: 0 auto; text-align: center; }
        .header-box { padding: 15px 0; }
        h1 { color: #f39c12; font-size: 22px; margin: 5px 0; }
        .subtitle { font-size: 13px; color: #aaa; margin-bottom: 15px; }
        .stats-bar { display: flex; justify-content: space-between; background: #1e1e1e; padding: 10px; border-radius: 6px; margin-bottom: 15px; border: 1px solid #333; font-size: 12px; }
        .stat-num { color: #f39c12; font-weight: bold; }
        .tabs-bar { display: flex; background: #1e1e1e; border-radius: 6px; margin-bottom: 15px; border: 1px solid #333; overflow: hidden; }
        .tab-btn { flex: 1; padding: 12px; background: none; border: none; color: #aaa; font-weight: bold; font-size: 13px; cursor: pointer; text-align: center; }
        .tab-btn.active { background: #f39c12; color: #000; }
        .tab-content { display: none; text-align: left; }
        .tab-content.active { display: block; }
        input[type="text"] { width: 100%; padding: 12px; border-radius: 6px; border: 1px solid #444; background: #222; color: #fff; box-sizing: border-box; margin-bottom: 10px; font-size: 15px; }
        button.btn-buscar { width: 100%; padding: 12px; border-radius: 6px; border: none; background: #f39c12; color: #000; font-weight: bold; font-size: 15px; cursor: pointer; }
        #resultado { background: #1e1e1e; border-radius: 8px; padding: 15px; border: 1px solid #333; min-height: 80px; font-size: 14px; }
        .bloque-titulo { color: #f39c12; border-left: 4px solid #f39c12; padding-left: 8px; margin: 20px 0 10px 0; font-size: 16px; }
        .productos-grid { display: flex; flex-direction: column; gap: 10px; }
        .producto-tarjeta { background: #1e1e1e; border: 1px solid #333; border-radius: 6px; padding: 12px; position: relative; }
        .producto-tarjeta h5 { margin: 0 0 5px 0; color: #fff; font-size: 14px; }
        .producto-tarjeta p { margin: 0 0 8px 0; color: #bbb; font-size: 12px; }
        .price-tag { font-weight: bold; color: #2ecc71; font-size: 14px; margin-right: 15px; }
        .btn-link { background: #2ecc71; color: #fff; text-decoration: none; padding: 5px 10px; border-radius: 4px; font-size: 12px; font-weight: bold; display: inline-block; }
        .informe-box { background: #1e1e1e; border: 1px solid #333; padding: 15px; border-radius: 6px; text-align: center; }
        .btn-premium { color: white; border: none; padding: 12px; width: 100%; font-weight: bold; border-radius: 6px; cursor: pointer; font-size: 15px; margin-top: 10px; }
        .advertencia { font-size: 11px; color: #e74c3c; margin-top: 20px; background: #2c1a1a; padding: 8px; border-radius: 6px; border: 1px solid #5c2424; text-align: center; }
    </style>
</head>
<body>
    <div class="container">
        
        <div class="header-box">
            <h1>DIAGNOSTICO Y MECANICA</h1>
            <div class="subtitle">Encuentra la causa. Comprueba antes de cambiar.</div>
        </div>

        <div class="stats-bar">
            <div>DTCs: <span id="count-dtc" class="stat-num">9201</span></div>
            <div>Sintomas: <span id="count-symptoms" class="stat-num">219</span></div>
            <div>Productos: <span id="count-products" class="stat-num">200</span></div>
        </div>

        <div class="tabs-bar">
            <button class="tab-btn active" id="btn-ia">Buscador IA</button>
            <button class="tab-btn" id="btn-herramientas">Herramientas</button>
            <button class="tab-btn" id="btn-ropa">Ropa Trabajo</button>
            <button class="tab-btn" id="btn-informes">Informes</button>
        </div>

        <div id="pestana-ia" class="tab-content active">
            <form id="chat-form">
                <input type="text" id="chat-input" placeholder="Introduce codigo DTC o sintoma..." required>
                <button type="submit" class="btn-buscar">Consultar al Asistente IA</button>
            </form>
            <br>
            <div id="resultado">Introduce una averia para iniciar el diagnostico inteligente.</div>
        </div>

        <div id="pestana-herramientas" class="tab-content">
            <div class="bloque-titulo">Maletines de Herramientas</div>
            <div class="productos-grid">
                <div class="producto-tarjeta">
                    <h5>Maletin Profesional Cromo-Vanadio</h5>
                    <p>Juego completo de llaves de vaso y carracas de alta resistencia para taller automotriz.</p>
                    <span class="price-tag">45.99 EUR</span><a href="https://amazon.es" target="_blank" class="btn-link">Ver Oferta</a>
                </div>
            </div>

            <div class="bloque-titulo">Pistolas de Impacto</div>
            <div class="productos-grid">
                <div class="producto-tarjeta">
                    <h5>Pistola Neumatica de Alto Par</h5>
                    <p>Ideal para aflojar tuercas de ruedas duras y tornillos de suspension oxidada.</p>
                    <span class="price-tag">89.50 EUR</span><a href="https://amazon.es" target="_blank" class="btn-link">Ver Oferta</a>
                </div>
            </div>

            <div class="bloque-titulo">Maquinaria de Taller</div>
            <div class="productos-grid">
                <div class="producto-tarjeta">
                    <h5>Gato Hidraulico de Perfil Bajo 3 Toneladas</h5>
                    <p>Elevacion totalmente segura para vehiculos deportivos bajos o furgonetas ligeras.</p>
                    <span class="price-tag">69.99 EUR</span><a href="https://amazon.es" target="_blank" class="btn-link">Ver Oferta</a>
                </div>
            </div>
        </div>

        <div id="pestana-ropa" class="tab-content">
            <div class="bloque-titulo">Monos e Indumentaria de Seguridad</div>
            <div class="productos-grid">
                <div class="producto-tarjeta">
                    <h5>Mono de Trabajo Reforzado</h5>
                    <p>Tejido duradero con triple costura y multibolsillos tecnicos protectores.</p>
                    <span class="price-tag">29.99 EUR</span><a href="https://amazon.es" target="_blank" class="btn-link">Ver Oferta</a>
                </div>
                <div class="producto-tarjeta">
                    <h5>Guantes de Nitrilo Mecanico de Alta Resistencia</h5>
                    <p>Proteccion total contra aceites de motor, combustibles y disolventes de taller.</p>
                    <span class="price-tag">12.50 EUR</span><a href="https://amazon.es" target="_blank" class="btn-link">Ver Oferta</a>
                </div>
            </div>
        </div>

        <div id="pestana-informes" class="tab-content">
            <div class="informe-box">
                <h3>Generador de Informes Tecnicos</h3>
                <p>Descarga el historial completo, esquema de comprobaciones y la hoja de taller en formato PDF para entregar a tu cliente.</p>
                
                <div style="background: #252525; padding: 15px; border-radius: 6px; margin-bottom: 15px; border: 1px solid #444;">
                    <h4>Informe Basico</h4>
                    <p style="font-size: 12px; color: #bbb;">Incluye interpretacion del codigo DTC y causas probables.</p>
                    <p style="font-weight: bold; color: #f39c12; font-size: 18px; margin: 5px 0;">10.00 EUR</p>
                    <button class="btn-premium" id="btn-pagar-basico" style="background: #3498db; margin-top: 5px; color: white; border: none; padding: 10px; width: 100%; border-radius: 4px; font-weight: bold; cursor: pointer;">Contratar Informe Basico</button>
                </div>

                <div style="background: #252525; padding: 15px; border-radius: 6px; border: 1px solid #444;">
                    <h4>Informe Completo Premium</h4>
                    <p style="font-size: 12px; color: #bbb;">Incluye guia de comprobacion con multimetro, datos en vivo y consejos preventivos.</p>
                    <p style="font-weight: bold; color: #2ecc71; font-size: 18px; margin: 5px 0;">15.00 EUR</p>
                    <button class="btn-premium" id="btn-pagar-completo" style="background: #2ecc71; margin-top: 5px; color: white; border: none; padding: 10px; width: 100%; border-radius: 4px; font-weight: bold; cursor: pointer;">Contratar Informe Completo</button>
                </div>
            </div>
        </div>

        <div class="advertencia">
            Advertencia: esta plataforma ofrece orientacion. Confirma siempre con pruebas de taller.
        </div>
    </div>
    <script>
        const botones = document.querySelectorAll(".tab-btn");
        const contenidos = document.querySelectorAll(".tab-content");
        botones.forEach(btn => {
            btn.addEventListener("click", () => {
                botones.forEach(b => b.classList.remove("active"));
                contenidos.forEach(c => c.classList.remove("active"));
                btn.classList.add("active");
                const idTab = btn.id.replace("btn-", "pestana-");
                document.getElementById(idTab).classList.add("active");
            });
        });
        
        const btnBasico = document.getElementById("btn-pagar-basico");
        if(btnBasico) {
            btnBasico.addEventListener("click", () => {
                alert("Conectando pasarela de pago para el Informe Basico de 10 EUR");
            });
        }
        const btnCompleto = document.getElementById("btn-pagar-completo");
        if(btnCompleto) {
            btnCompleto.addEventListener("click", () => {
alert("Conectando pasarela de pago para el Informe Completo de 15 EUR");});} </script><script src="/js/app.js"></script></body></html>`; const publicDir = path.join(process.cwd(), "public"); fs.writeFileSync(path.join(publicDir, "index.html"), htmlLimpio, "utf8"); console.log("Reparacion exitosa");