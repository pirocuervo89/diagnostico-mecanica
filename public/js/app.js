const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

async function api(url, options) {
  const r = await fetch(url, options);
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
  return r.json();
}

function showView(name) {
  $$('.view').forEach(v => v.classList.toggle('active', v.id === `view-${name}`));
  $$('[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  $('#nav').classList.remove('open');
  window.scrollTo({top:0,behavior:'smooth'});
}

$$('[data-view]').forEach(b => b.addEventListener('click', () => showView(b.dataset.view)));
$('#menuBtn').addEventListener('click', () => $('#nav').classList.toggle('open'));

async function loadStats() {
  try {
    const s = await api('/api/stats');
    $('#statDtc').textContent = s.dtc;
    $('#statSymptoms').textContent = s.symptoms;
    $('#statProducts').textContent = s.products;
  } catch {}
}

async function loadSymptoms() {
  const list = await api('/api/symptoms');
  $('#symptomGrid').innerHTML = list.map(s => `
    <button class="symptom" data-id="${s.id}">
      <span class="ico">${s.icon}</span>
      <b>${esc(s.name)}</b>
      <small>${esc(s.description)}</small>
    </button>`).join('');
  $$('.symptom').forEach(b => b.addEventListener('click', () => renderSymptom(list.find(s => s.id === b.dataset.id))));
}

function renderSymptom(s) {
  const d = $('#symptomDetail');
  d.classList.remove('hidden');
  d.innerHTML = `
    <h3>${s.icon} ${esc(s.name)}</h3>
    <p>${esc(s.description)}</p>
    <p><b>Urgencia:</b> ${esc(s.urgency)} · <b>Riesgo:</b> ${esc(s.driveRisk)}</p>
    <h4>Causas habituales</h4><ul>${s.commonCauses.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>
    <h4>Comprobaciones rápidas</h4><ol>${s.quickChecks.map(x=>`<li>${esc(x)}</li>`).join('')}</ol>
    <div class="chips">${s.relatedDtc.map(x=>`<button class="chip dtc-chip" data-code="${x}">${x}</button>`).join('')}</div>`;
  $$('.dtc-chip').forEach(b => b.addEventListener('click', () => { showView('dtc'); $('#dtcSearch').value=b.dataset.code; searchDtc(); }));
  d.scrollIntoView({behavior:'smooth',block:'start'});
}

async function searchDtc() {
  const q = $('#dtcSearch').value.trim();
  const list = await api(`/api/dtc?q=${encodeURIComponent(q)}&limit=100`);
  $('#dtcResults').innerHTML = list.length ? list.map(d => `
    <article class="result">
      <div class="result-head"><div><div class="code">${esc(d.code)}</div><b>${esc(d.title)}</b></div><span class="chip">${esc(d.severity)}</span></div>
      <p class="muted">${esc(d.description)}</p>
      <details><summary>Ver comprobaciones</summary>
        <ol>${(d.checks||[]).map(c=>`<li>${esc(c.text||c)}</li>`).join('')}</ol>
        <b>Posibles causas</b><ul>${(d.causes||[]).map(c=>`<li>${esc(c.text||c)}</li>`).join('')}</ul>
      </details>
    </article>`).join('') : `<div class="notice">No se han encontrado resultados.</div>`;
}
$('#dtcSearchBtn').addEventListener('click', searchDtc);
$('#dtcSearch').addEventListener('keydown', e => { if(e.key === 'Enter') searchDtc(); });

let todosLosProductos = [];
async function loadProducts() {
  try {
    todosLosProductos = await api('/api/products');
    renderCatalogo('Todos');
  } catch(e) { console.error(e); }
}

function renderCatalogo(c) { let list = todosLosProductos; if (c !== "Todos") list = list.filter(p => p.category === c); if (typeof subCat !== "undefined" && c === "Herramientas" && subCat !== "Todas") { if (subCat === "Maletines") list = list.filter(p => String(p.subcategory).toLowerCase().includes("malet")); if (subCat === "Pistolas") list = list.filter(p => String(p.subcategory).toLowerCase().includes("pistola") || String(p.subcategory).toLowerCase().includes("impact")); if (subCat === "Utiles") list = list.filter(p => String(p.subcategory).toLowerCase().includes("malet") === false && String(p.subcategory).toLowerCase().includes("pistola") === false && String(p.subcategory).toLowerCase().includes("impact") === false); } document.querySelector("#productGrid").innerHTML = list.map(p => `<article class="product"><div style="text-align:center;margin-bottom:10px;">${p.image ? `<img src="${p.image}" style="max-width:100%;height:120px;object-fit:contain;border-radius:8px;">` : "🧰"}</div><small>${p.subcategory}</small><h3>${p.name}</h3><p class="muted">${p.description}</p><div style="display:flex;justify-content:space-between;align-items:center;margin-top:15px;border-top:1px solid var(--line);padding-top:10px;"><span>${p.price||"Mejor Precio"}</span><a class="btn primary" href="${p.affiliateUrl}" target="_blank">Comprar 🛒</a></div></article>`).join(""); }

document.body.addEventListener('click', e => {
  if (e.target.classList.contains('cat-tab')) {
    $$('.cat-tab').forEach(t => t.classList.remove('active'));
    e.target.classList.add('active');
    renderCatalogo(e.target.dataset.cat);
  }
});

$('#chatForm').addEventListener('submit', async e => {
  e.preventDefault();
  const input = $('#chatInput');
  const message = input.value.trim();
  if (!message) return;
  addBubble(message,'user'); input.value='';
  const thinking = addBubble('Analizando...','assistant');
  try {
    const data = await api('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message})});
    thinking.remove(); addBubble(data.reply,'assistant');
  } catch(err) { thinking.remove(); addBubble(`Error: ${err.message}`,'assistant'); }
});

function addBubble(text, type) {
  const d = document.createElement('div');
  d.className=`bubble ${type}`; d.textContent=text; $('#chatBox').appendChild(d);
  $('#chatBox').scrollTop=$('#chatBox').scrollHeight; return d;
}

$('#generateReport').addEventListener('click', () => {
  const brand=$('#fBrand').value, model=$('#fModel').value, year=$('#fYear').value, engine=$('#fEngine').value, km=$('#fKm').value, dtc=$('#fDtc').value, symptoms=$('#fSymptoms').value;
  const date=new Date().toLocaleString('es-ES');
  $('#report').innerHTML=`
    <h3>INFORME DE DIAGNÓSTICO</h3>
    <p><b>Fecha:</b> ${esc(date)}</p>
    <p><b>Vehículo:</b> ${esc([brand,model,year].filter(Boolean).join(' ')) || 'No indicado'} · <b>Motor:</b> ${esc(engine)||'No indicado'} · <b>Kilómetros:</b> ${esc(km)||'No indicado'}</p>
    <h4>Síntomas / observaciones</h4><p>${esc(symptoms).replace(/\n/g,`<br>`) || 'No indicado'}</p>
    <h4>DTC</h4><p>${esc(dtc)||'No indicado'}</p>
    <h4>Conclusión</h4><p>Este informe es orientativo. Las causas deben confirmarse mediante inspection, mediciones y pruebas específicas del vehículo.</p>`;
});
$('#printReport').addEventListener('click',()=>window.print());

function esc(v='') {
  return String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}

Promise.all([loadStats(),loadSymptoms(),loadProducts(),searchDtc()]).catch(console.error);
showView('home');
let subCat="Todas";document.body.addEventListener("click", e => {if (e.target.classList.contains("cat-tab")) {const s = document.querySelector("#subTabsContainer");if (e.target.dataset.cat === "Herramientas") { s.classList.remove("hidden"); } else { s.classList.add("hidden"); subCat = "Todas"; document.querySelectorAll(".sub-tab").forEach(t => t.classList.toggle("active", t.dataset.sub === "Todas")); }}if (e.target.classList.contains("sub-tab")) {document.querySelectorAll(".sub-tab").forEach(t => t.classList.remove("active")); e.target.classList.add("active"); subCat = e.target.dataset.sub;const c = document.querySelector(".cat-tab.active")?.dataset.cat || "Todos";let list = todosLosProductos; if (c !== "Todos") list = list.filter(p => p.category === c);if (c === "Herramientas" && subCat !== "Todas") {if (subCat === "Maletines") list = list.filter(p => String(p.subcategory).toLowerCase().includes("malet"));if (subCat === "Pistolas") list = list.filter(p => String(p.subcategory).toLowerCase().includes("pistola") || String(p.subcategory).toLowerCase().includes("impacto"));if (subCat === "Utiles") list = list.filter(p => String(p.subcategory).toLowerCase().includes("malet")===false && String(p.subcategory).toLowerCase().includes("pistola")===false && String(p.subcategory).toLowerCase().includes("impacto")===false);}document.querySelector("#productGrid").innerHTML = list.map(p => `<article class="product"><small>${p.subcategory}</small><h3>${p.name}</h3><p class="muted">${p.description}</p><div style="display:flex; justify-content:space-between; align-items:center; margin-top:15px; border-top:1px solid var(--line); padding-top:10px;"><span>${p.price||""}</span><a class="btn primary" href="${p.affiliateUrl}" target="_blank">Comprar 🛒</a></div></article>`).join("");} });