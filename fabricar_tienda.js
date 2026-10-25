import fs from 'fs';

const htmlDefinitivo = `<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width,initial-scale=1.0">
    <title>Plataforma Automotriz</title>
    <style>
        body { font-family: sans-serif; background: #121212; color: #e0e0e0; margin: 0; padding: 10px; }
        .container { max-width: 500px; margin: 0 auto; text-align: center; }
        h1 { color: #f39c12; font-size: 22px; margin: 5px 0; }
        .subtitle { font-size: 13px; color: #aaa; margin-bottom: 15px; }
        .stats-bar { display: flex; justify-content: space-between; background: #1e1e1e; padding: 10px; border-radius: 6px; margin-bottom: 15px; border: 1px solid #333; font-size: 11px; }
        .stat-num { color: #f39c12; font-weight: bold; }
        .tabs-bar { display: flex; background: #1e1e1e; border-radius: 6px; margin-bottom: 15px; border: 1px solid #333; overflow: hidden; flex-wrap: wrap; }
        .tab-btn { flex: 1; min-width: 30%; padding: 10px; background: none; border: none; color: #aaa; font-weight: bold; font-size: 12px; cursor: pointer; text-align: center; }
        .tab-btn.active { background: #f39c12; color: #000; }
        .tab-content { display: none; text-align: left; }
        .tab-content.active { display: block; }
        input[type="text"] { width: 100%; padding: 12px; border-radius: 6px; border: 1px solid #444; background: #222; color: #fff; box-sizing: border-box; margin-bottom: 10px; font-size: 15px; }
        button.btn-buscar { width: 100%; padding: 12px; border-radius: 6px; border: none; background: #f39c12; color: #000; font-weight: bold; font-size: 15px; cursor: pointer; }
        #resultado { background: #1e1e1e; border-radius: 8px; padding: 15px; border: 1px solid #333; min-height: 60px; font-size: 14px; }
        .productos-grid { display: flex; flex-direction: column; gap: 10px; margin-top: 10px; }
        .producto-tarjeta { background: #1e1e1e; border: 1px solid #333; border-radius: 6px; padding: 12px; }
        .producto-tarjeta h5 { margin: 0 0 5px 0; color: #fff; font-size: 14px; }
        .producto-tarjeta p { margin: 0 0 8px 0; color: #bbb; font-size: 12px; }
        .price-tag { font-weight: bold; color: #2ecc71; font-size: 14px; margin-right: 15px; }
        .btn-link { background: #2ecc71; color: #fff; text-decoration: none; padding: 5px 10px; border-radius: 4px; font-size: 12px; font-weight: bold; display: inline-block; }
        .advertencia { font-size: 11px; color: #e74c3c; margin-top: 20px; background: #2c1a1a; padding: 8px; border-radius: 6px; border: 1px solid #5c2424; text-align: center; }
    </style>
</head>
<body>
    <div class="container">
        <h1>DIAGNOSTICO Y MECANICA</h1>
        <div class="subtitle">Encuentra la causa. Comprueba antes de cambiar.</div>
        
        <div class="stats-bar">
            <div>DTCs: <span id="count-dtc" class="stat-num">9201</span></div>
            <div>Sintomas: <span id="count-symptoms" class="stat-num">219</span></div>
            <div>Productos: <span id="count-products" class="stat-num">300</span></div>
        </div>

        <div class="tabs-bar">
            <button class="tab-btn active" id="btn-ia">Buscador IA</button>
            <button class="tab-btn" id="btn-herramientas">Herramientas</button>
            <button class="tab-btn" id="btn-diagnosis">Diagnosis</button>
            <button class="tab-btn" id="btn-ropa">Ropa Trabajo</button>
            <button class="tab-btn" id="btn-maquinaria">Maquinaria</button>
            <button class="tab-btn" id="btn-repuestos">Repuestos</button>
            <button class="tab-btn" id="btn-quimicos">Quimicos</button>
        </div>
        
        <div id="pestana-ia" class="tab-content active">
            <form id="chat-form">
                <input type="text" id="chat-input" placeholder="Introduce codigo DTC o sintoma..." required>
                <button type="submit" class="btn-buscar">Consultar al Asistente IA</button>
            </form>
            <br>
            <div id="resultado">Introduce una averia para iniciar el diagnostico inteligente.</div>
        </div>

        <div id="pestana-herramientas" class="tab-content"><div class="productos-grid"></div></div>
        <div id="pestana-diagnosis" class="tab-content"><div class="productos-grid"></div></div>
        <div id="pestana-ropa" class="tab-content"><div class="productos-grid"></div></div>
        <div id="pestana-maquinaria" class="tab-content"><div class="productos-grid"></div></div>
        <div id="pestana-repuestos" class="tab-content"><div class="productos-grid"></div></div>
        <div id="pestana-quimicos" class="tab-content"><div class="productos-grid"></div></div>

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
    </script>
    <script src="/js/app.js"></script>
</body>
</html>`;

fs.writeFileSync('public/index.html', htmlDefinitivo, 'utf8');

const categorias = ['herramientas', 'diagnosis', 'ropa', 'maquinaria', 'repuestos', 'quimicos'];
const listadoCompleto = [];

const muestras = {
  herramientas: 'Llave de vaso o calado profesional',
  diagnosis: 'Escaner Launch OBD2 o Autel',
  ropa: 'Mono de taller o botas reforzadas',
  maquinaria: 'Elevador de columnas o gato de foso',
  repuestos: 'Aceite Castrol o filtros de motor',
  quimicos: 'Limpia inyectores o aditivo FAP AdBlue'
};

categorias.forEach(cat => {
  const nombreBase = muestras[cat];
  for (let i = 1; i <= 50; i++) {
    listadoCompleto.push({
      id: cat + '-' + i,
      name: nombreBase + ' N' + i,
      description: 'Articulo homologado para talleres mecanicos europeos numero ' + i,
      category: cat,
      price: (10 + i).toFixed(2) + ' EUR',
      link: 'https://amazon.es',
      image: '/img/productos/' + cat + '-' + i + '.webp'
    });
  }
});

fs.writeFileSync('data/products.json', JSON.stringify({ productos: listadoCompleto }, null, 2), 'utf8');

const appCode = `document.addEventListener('DOMContentLoaded', () => {
  const chatForm = document.getElementById('chat-form');
  const chatInput = document.getElementById('chat-input');
  const responseContainer = document.getElementById('resultado');

  const dtcCountEl = document.getElementById('count-dtc');
  const symptomsCountEl = document.getElementById('count-symptoms');
  const productsCountEl = document.getElementById('count-products');

  async function cargarTodo() {
    try {
      const res = await fetch('/api/stats');
      const stats = await res.json();
      if (dtcCountEl) dtcCountEl.textContent = stats.dtc || '9201';
      if (symptomsCountEl) symptomsCountEl.textContent = stats.symptoms || '219';
      if (productsCountEl) productsCountEl.textContent = '300';
      
      const resProd = await fetch('/api/products');
      const dataProd = await resProd.json();
      const lista = Array.isArray(dataProd) ? dataProd : (dataProd.productos || []);
      
      const categorias = ['herramientas', 'diagnosis', 'ropa', 'maquinaria', 'repuestos', 'quimicos'];
      categorias.forEach(c => {
        const grid = document.querySelector('#pestana-' + c + ' .productos-grid');
        if (grid) {
          grid.innerHTML = '';
          const filtrados = lista.filter(p => p.category === c);
          filtrados.forEach(p => {
            grid.innerHTML += '<div class="producto-tarjeta"><h5>' + p.name + '</h5><p>' + p.description + '</p><span class="price-tag">' + p.price + '</span><a href="' + p.link + '" target="_blank" class="btn-link">Ver Oferta</a></div>';
          });
        }
      });
    } catch (e) {}
  }

  cargarTodo();

  if (chatForm) {
    chatForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const mensaje = chatInput.value.trim();
      if (!mensaje) return;

      responseContainer.innerHTML = '<div>La IA esta analizando tu averia...</div>';
      chatInput.value = '';

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: mensaje, context: {} })
        });
        const data = await response.json();
        responseContainer.innerHTML = '<div class="diagnostico-ia">' + data.reply + '</div>';
      } catch (err) {
        responseContainer.innerHTML = '<div>Error al conectar con la IA</div>';
      }
    });
  }
});`;

fs.writeFileSync('public/js/app.js', appCode, 'utf8');
console.log('Tienda_creada_correctamente');
