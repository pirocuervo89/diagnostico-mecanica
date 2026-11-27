#!/usr/bin/env node
/** Añade categorías y fichas curadas de tuning, con búsquedas reales en las tiendas afiliadas. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'data/tuning-products.json');
const TODAY = new Date().toISOString().slice(0, 10);
const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const existing = new Set((data.items || []).map(item => String(item.name).toLowerCase().trim()));
const existingIds = new Set((data.items || []).map(item => item.id));

const NEW_CATEGORIES = [
  ['filtros-deportivos', 'Filtros deportivos', 'Filtros de alto caudal y admisiones cerradas para medir bien el aire.', '/img/recambios/int-filtro-conico.jpg'],
  ['downpipes', 'Downpipes', 'Bajada de escape y catalizadores deportivos: caudal, temperatura y legalidad.', '/img/recambios/exh-downpipe-ea888.jpg'],
  ['asientos-baket', 'Asientos bucket', 'Baquets y asientos deportivos: sujeción, anclajes y airbag.', '/img/products/interior.jpg'],
  ['volantes-deportivos', 'Volantes deportivos', 'Volantes de competición y carretera: diámetro, piña y mandos.', '/img/recambios/int-fiesta-st.jpg'],
  ['alfombrillas', 'Alfombrillas', 'Alfombrillas a medida y universales para proteger el habitáculo.', '/img/products/interior.jpg'],
  ['modulos-llave', 'Llaves y arranque', 'Módulos de llave a distancia, arranque por botón y cierre centralizado.', '/img/products/electronica.jpg'],
  ['body-kits', 'Body kits y paragolpes', 'Paragolpes, faldones, splitters y kits de carrocería.', '/img/recambios/body-paragolpes-r.jpg'],
  ['taloneras', 'Taloneras y difusores', 'Taloneras, faldones laterales y difusores para cerrar la línea.', '/img/recambios/body-taloneras.jpg'],
  ['colas-escape', 'Colas de escape', 'Colas, terminales y embellecedores de escape.', '/img/recambios/exh-supersprint-vag.jpg'],
  ['reprogramacion', 'Máquinas de reprogramación', 'Herramientas profesionales y alternativas económicas para leer y escribir ECU. Uso legal y con copia de seguridad.', '/img/products/electronica.jpg']
];

for (const [id, name, blurb, image] of NEW_CATEGORIES) {
  if (!data.categories.some(category => category.id === id)) data.categories.push({ id, name, blurb, image });
}

function slug(text) {
  return String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 54);
}

function linksFor(query, official = '', tutorial = '') {
  const q = encodeURIComponent(query);
  const links = [
    { shop: 'Amazon', label: 'Buscar en Amazon', url: `https://www.amazon.es/s?k=${q}` },
    { shop: 'eBay', label: 'Buscar en eBay', url: `https://www.ebay.es/sch/i.html?_nkw=${q}` },
    { shop: 'AliExpress', label: 'Buscar en AliExpress', url: `https://es.aliexpress.com/w/wholesale-${q}.html` },
    { shop: 'Temu', label: 'Buscar en Temu', url: `https://www.temu.com/search_result.html?search_key=${q}` }
  ];
  if (official) links.push({ shop: 'Oficial', label: 'Ver fabricante', url: official });
  if (tutorial) links.push({ shop: 'Tutorial', label: 'Ver tutoriales', url: tutorial });
  return links;
}

function add(category, rows, image, fitmentNote = 'Universal · comprueba medida, referencia y compatibilidad antes de comprar.') {
  for (const row of rows) {
    const [name, brand, note, price, query, official = '', tutorial = '', customImage = ''] = row;
    if (existing.has(name.toLowerCase().trim())) continue;
    const id = `t2026-${category}-${slug(name)}`;
    if (existingIds.has(id)) continue;
    existing.add(name.toLowerCase().trim());
    existingIds.add(id);
    data.items.push({
      id,
      name,
      brand,
      category,
      cars: [],
      fitment: [fitmentNote],
      note,
      price,
      query,
      source: 'curado',
      image: customImage || image,
      photoKind: customImage ? 'referencia' : 'categoria',
      photoCredit: null,
      verifiedAt: TODAY,
      links: linksFor(query, official, tutorial)
    });
  }
}

const TUT = q => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
const AMZ = q => `https://www.amazon.es/s?k=${encodeURIComponent(q)}`;

add('filtros-deportivos', [
  ['K&N 57i Induction Kit', 'K&N', 'Kit de admisión directa con filtro lavable. Comprueba diámetro MAF y homologación.', '€€', 'K&N 57i induction kit', 'https://www.knfilters.com/', TUT('K&N 57i instalar')],
  ['BMC CDA Carbon Dynamic Airbox', 'BMC', 'Caja de admisión cerrada de carbono; reduce el calor del vano.', '€€€', 'BMC CDA airbox', 'https://www.bmcairfilters.com/', TUT('BMC CDA instalacion')],
  ['Pipercross Viper Induction Kit', 'Pipercross', 'Admisión cerrada con filtro de espuma de alto caudal.', '€€', 'Pipercross Viper induction kit', 'https://www.pipercross.net/', TUT('Pipercross Viper install')],
  ['ITG Maxogen Induction Kit', 'ITG', 'Admisión de competición con filtro de espuma y toma de aire.', '€€€', 'ITG Maxogen induction kit', 'https://www.itgairfilters.com/', TUT('ITG Maxogen install')],
  ['Ramair ProRam Induction Kit', 'Ramair', 'Filtro cónico y adaptador para motores turbo de serie.', '€', 'Ramair ProRam induction kit', 'https://www.ramair-filters.co.uk/', TUT('Ramair induction kit install')],
  ['Eventuri Carbon Intake', 'Eventuri', 'Admisión de carbono con diseño de flujo validado.', '€€€€', 'Eventuri carbon intake', 'https://www.eventuri.net/', TUT('Eventuri intake install')],
  ['MST Performance Intake', 'MST', 'Admisión cerrada con tubo de silicona y filtro lavable.', '€€', 'MST Performance intake', 'https://www.mst-performance.com/', TUT('MST intake install')],
  ['APR Carbonio Intake', 'APR', 'Admisión de carbono para motores EA888 y similares.', '€€€', 'APR Carbonio intake', 'https://www.goapr.com/', TUT('APR Carbonio install')],
  ['Airtec Enclosed Induction Kit', 'Airtec', 'Caja cerrada de aluminio con filtro de alto flujo.', '€€', 'Airtec enclosed induction kit', 'https://www.airtecmotorsport.com/', TUT('Airtec induction kit install')],
  ['Filtro cónico universal 76 mm', 'Genérico', 'Opción económica; mide el cuello y evita coger aire caliente.', '€', 'filtro conico universal 76mm', '', TUT('instalar filtro conico coche')]
], '/img/recambios/int-filtro-conico.jpg');

add('downpipes', [
  ['Milltek Downpipe deportivo', 'Milltek', 'Downpipe de mayor diámetro; confirma catalizador y homologación.', '€€€', 'Milltek downpipe', 'https://www.millteksport.com/', TUT('Milltek downpipe install')],
  ['Scorpion Downpipe deportivo', 'Scorpion', 'Bajada de escape en acero inoxidable para motores turbo.', '€€€', 'Scorpion downpipe', 'https://www.scorpion-exhausts.com/', TUT('Scorpion downpipe install')],
  ['Cobra Sport Downpipe', 'Cobra Sport', 'Downpipe con opción de catalizador deportivo.', '€€€', 'Cobra Sport downpipe', 'https://www.cobrasport.com/', TUT('Cobra Sport downpipe install')],
  ['Akrapovic Downpipe Evolution', 'Akrapovic', 'Bajada de titanio para preparaciones de alto nivel.', '€€€€', 'Akrapovic downpipe', 'https://www.akrapovic.com/', TUT('Akrapovic downpipe install')],
  ['HJS Catalizador deportivo 200 celdas', 'HJS', 'Catalizador de alto flujo; revisa homologación de emisiones.', '€€€', 'HJS sport cat 200 cell', 'https://www.hjs-motorsport.de/', TUT('HJS sport cat install')],
  ['Wagner Tuning Downpipe', 'Wagner Tuning', 'Downpipe de gran diámetro para motores VAG.', '€€€', 'Wagner Tuning downpipe', 'https://www.wagnertuning.com/', TUT('Wagner Tuning downpipe install')],
  ['Downpipe EA888 Gen3', 'Genérico', 'Bajada para 2.0 TSI EA888; comprueba variante y brida.', '€€', 'downpipe EA888 Gen3', '', TUT('downpipe EA888 install')],
  ['Downpipe Focus ST Mk3', 'Genérico', 'Bajada específica para Focus ST; verifica año y motor.', '€€', 'downpipe Focus ST Mk3', '', TUT('downpipe Focus ST install')],
  ['Downpipe BMW 320d F30', 'Genérico', 'Bajada para N47/N57; confirma referencia del motor.', '€€', 'downpipe BMW 320d F30', '', TUT('downpipe 320d install')],
  ['Downpipe universal 2.5 pulgadas', 'Genérico', 'Tubo y bridas para adaptar; requiere soldadura y medición.', '€', 'downpipe universal 2.5', '', TUT('fabricar downpipe coche')]
], '/img/recambios/exh-downpipe-ea888.jpg', 'Comprueba brida, diámetro, sensor lambda y legalidad de emisiones.');

add('asientos-baket', [
  ['Sparco Grid Q', 'Sparco', 'Baquet de fibra de vidrio con buena sujeción para calle y circuito.', '€€€', 'Sparco Grid Q', 'https://www.sparco-official.com/', TUT('Sparco Grid Q install')],
  ['Sparco Rev', 'Sparco', 'Baquet ligero; comprueba anchura y arnés.', '€€€', 'Sparco Rev seat', 'https://www.sparco-official.com/', TUT('Sparco Rev install')],
  ['OMP TRS-E', 'OMP', 'Baquet de competición con carcasas laterales.', '€€', 'OMP TRS-E', 'https://www.ompracing.com/', TUT('OMP TRS-E install')],
  ['OMP WRC-R', 'OMP', 'Baquet de competición; revisa fecha de homologación FIA.', '€€€', 'OMP WRC-R', 'https://www.ompracing.com/', TUT('OMP WRC-R install')],
  ['Recaro Pole Position', 'Recaro', 'Baquet de carretera y circuito muy popular; comprueba anclajes.', '€€€', 'Recaro Pole Position', 'https://www.recaro-automotive.com/', TUT('Recaro Pole Position install')],
  ['Recaro Sportster CS', 'Recaro', 'Asiento deportivo reclinable con airbag opcional.', '€€€€', 'Recaro Sportster CS', 'https://www.recaro-automotive.com/', TUT('Recaro Sportster CS install')],
  ['Bride Zeta III', 'Bride', 'Baquet japonés de competición; mide el habitáculo.', '€€€', 'Bride Zeta III', 'https://www.bride-jp.com/', TUT('Bride Zeta III install')],
  ['Cobra Monaco Pro', 'Cobra', 'Baquet de competición con tapizado resistente.', '€€', 'Cobra Monaco Pro', 'https://www.cobraseats.com/', TUT('Cobra Monaco Pro install')],
  ['Corbeau FX1 Pro', 'Corbeau', 'Baquet ligero para track day; revisa soportes.', '€€', 'Corbeau FX1 Pro', 'https://corbeau.com/', TUT('Corbeau FX1 install')],
  ['NRG FRP Bucket Seat', 'NRG', 'Opción económica de fibra; comprueba calidad y anclajes.', '€', 'NRG FRP bucket seat', 'https://www.nrginnovations.com/', TUT('NRG bucket seat install')]
], '/img/products/interior.jpg', 'Los asientos deportivos pueden afectar airbag, anclajes y homologación; usa soportes específicos.');

add('volantes-deportivos', [
  ['Sparco R100', 'Sparco', 'Volante deportivo de calle con aro de 350 mm.', '€€', 'Sparco R100 steering wheel', 'https://www.sparco-official.com/', TUT('Sparco R100 install')],
  ['Sparco L575', 'Sparco', 'Volante de competición con piña y botones.', '€€€', 'Sparco L575', 'https://www.sparco-official.com/', TUT('Sparco L575 install')],
  ['OMP Velocita', 'OMP', 'Volante de competición con aro de 350 mm.', '€€', 'OMP Velocita steering wheel', 'https://www.ompracing.com/', TUT('OMP Velocita install')],
  ['OMP Trecento', 'OMP', 'Volante de 300 mm para espacio reducido.', '€€', 'OMP Trecento', 'https://www.ompracing.com/', TUT('OMP Trecento install')],
  ['Momo Mod.78', 'Momo', 'Clásico de competición con aro de 350 mm.', '€€€', 'Momo Mod 78', 'https://www.momo.com/', TUT('Momo Mod 78 install')],
  ['Momo Prototipo', 'Momo', 'Volante clásico de cuero; requiere piña compatible.', '€€', 'Momo Prototipo', 'https://www.momo.com/', TUT('Momo Prototipo install')],
  ['NRG RST-036', 'NRG', 'Volante deportivo con quick release opcional.', '€€', 'NRG RST-036', 'https://www.nrginnovations.com/', TUT('NRG steering wheel install')],
  ['OCC Motorsport OCCVOL009', 'OCC Motorsport', 'Volante económico de 3 brazos.', '€', 'OCC Motorsport OCCVOL009', '', TUT('instalar volante deportivo')],
  ['Simoni Racing Racing Line', 'Simoni Racing', 'Volante deportivo de calle; comprueba airbag y mandos.', '€', 'Simoni Racing steering wheel', 'https://www.simoniracing.com/', TUT('Simoni Racing steering wheel install')],
  ['Personal Fitti', 'Personal', 'Volante de competición italiano; revisa piña.', '€€€', 'Personal Fitti steering wheel', '', TUT('Personal steering wheel install')]
], '/img/recambios/int-fiesta-st.jpg', 'Cambiar el volante puede afectar airbag y mandos: usa piña y cableado específicos.');

add('alfombrillas', [
  ['Alfombrillas de goma universales', 'Michelin', 'Juego de 4 piezas recortables y lavables.', '€', 'alfombrillas goma universales coche', 'https://www.michelin.es/', TUT('alfombrillas coche instalar')],
  ['Alfombrillas de moqueta premium', 'Armor All', 'Juego de 4 con base antideslizante.', '€', 'alfombrillas moqueta premium coche', 'https://www.armorall.eu/', TUT('alfombrillas coche instalar')],
  ['Alfombrillas a medida VW Golf VII', 'A medida', 'Corte específico; confirma año y versión.', '€€', 'alfombrillas Golf 7 a medida', '', TUT('alfombrillas a medida coche')],
  ['Alfombrillas a medida BMW Serie 3', 'A medida', 'Corte para F30/G20; elige la generación correcta.', '€€', 'alfombrillas BMW Serie 3 a medida', '', TUT('alfombrillas a medida coche')],
  ['Alfombrillas a medida Seat León 5F', 'A medida', 'Corte específico para León 5F.', '€€', 'alfombrillas Seat Leon 5F', '', TUT('alfombrillas a medida coche')],
  ['Alfombrillas a medida Audi A3 8V', 'A medida', 'Juego delantero y trasero para A3 8V.', '€€', 'alfombrillas Audi A3 8V', '', TUT('alfombrillas a medida coche')],
  ['Alfombrillas a medida Renault Clio IV', 'A medida', 'Corte específico y fijaciones originales.', '€€', 'alfombrillas Renault Clio IV', '', TUT('alfombrillas a medida coche')],
  ['Alfombrillas a medida Peugeot 208', 'A medida', 'Confirma generación I o II.', '€€', 'alfombrillas Peugeot 208', '', TUT('alfombrillas a medida coche')],
  ['Alfombrillas a medida Opel Corsa', 'A medida', 'Juego para Corsa D/E/F según año.', '€€', 'alfombrillas Opel Corsa', '', TUT('alfombrillas a medida coche')],
  ['Alfombrillas a medida Ford Focus', 'A medida', 'Corte para Focus Mk3/Mk4; revisa año.', '€€', 'alfombrillas Ford Focus', '', TUT('alfombrillas a medida coche')]
], '/img/products/interior.jpg', 'Comprueba el corte, las fijaciones y que no interfieran con los pedales.');

add('modulos-llave', [
  ['Kit universal de llave a distancia', 'Genérico', 'Receptor y mando para cierre centralizado; requiere instalación eléctrica.', '€', 'kit llave a distancia coche universal', '', TUT('instalar llave a distancia coche')],
  ['Módulo de arranque por botón', 'Genérico', 'Kit push start con inmovilizador y mando.', '€€', 'modulo arranque por boton coche', '', TUT('instalar arranque por boton')],
  ['Módulo de cierre centralizado', 'Genérico', 'Actuadores y mando para coches sin cierre remoto.', '€', 'modulo cierre centralizado coche', '', TUT('instalar cierre centralizado')],
  ['Receptor de mando 433 MHz', 'Genérico', 'Receptor universal para mando de garaje o puerta.', '€', 'receptor mando 433 mhz 12v', '', TUT('programar mando 433')],
  ['Llave plegable con mando', 'Genérico', 'Carcasa y electrónica para sustituir la llave original.', '€', 'llave plegable mando coche', '', TUT('cambiar carcasa llave coche')],
  ['Inmovilizador con llave RFID', 'Genérico', 'Corte de arranque por proximidad; úsalo con instalación profesional.', '€€', 'inmovilizador coche rfid', '', TUT('instalar inmovilizador coche')],
  ['Módulo CANbus keyless', 'Genérico', 'Integración con red CAN; imprescindible comprobar protocolo.', '€€€', 'modulo keyless canbus coche', '', TUT('instalar keyless coche')],
  ['Alarma con arranque remoto', 'Genérico', 'Alarma y mando bidireccional; revisa consumo en reposo.', '€€', 'alarma coche arranque remoto', '', TUT('instalar alarma coche')],
  ['Mando de garaje universal', 'Genérico', 'Clonación de mando fijo; no sirve para todos los sistemas.', '€', 'mando garaje universal', '', TUT('copiar mando garaje')],
  ['Kit push start con llavero', 'Genérico', 'Botón de arranque y detección de llavero; instalación profesional.', '€€€', 'kit push start coche llavero', '', TUT('instalar push start coche')]
], '/img/products/electronica.jpg', 'Los módulos de llave y arranque afectan al inmovilizador: la instalación debe ser profesional y legal.');

add('body-kits', [
  ['Maxton Design Body Kit', 'Maxton Design', 'Splitter, faldones y difusor; elige la referencia exacta del coche.', '€€', 'Maxton Design body kit', 'https://www.maxtondesign.com/', TUT('Maxton Design install')],
  ['Rieger Body Kit', 'Rieger', 'Kit completo de paragolpes y faldones con homologación según pieza.', '€€€', 'Rieger body kit', 'https://www.rieger-tuning.de/', TUT('Rieger body kit install')],
  ['Prior Design Widebody Kit', 'Prior Design', 'Ensanchamiento y paragolpes; requiere pintura y homologación.', '€€€€', 'Prior Design widebody kit', 'https://www.priordesign.com/', TUT('Prior Design widebody install')],
  ['Liberty Walk Body Kit', 'Liberty Walk', 'Kit de estilo japonés; revisa plazos, aduanas y homologación.', '€€€€', 'Liberty Walk body kit', 'https://www.libertywalk.co.jp/', TUT('Liberty Walk body kit install')],
  ['Kerscher Body Kit', 'Kerscher', 'Paragolpes y faldones para modelos concretos.', '€€€', 'Kerscher body kit', 'https://www.kerscher-tuning.de/', TUT('Kerscher body kit install')],
  ['Ingo Noak Body Kit', 'Ingo Noak', 'Kits de carrocería y difusores; comprueba disponibilidad.', '€€€', 'Ingo Noak body kit', 'https://www.ingo-noak.com/', TUT('Ingo Noak body kit install')],
  ['Splitter universal de carbono', 'Genérico', 'Labio frontal universal; atornillar o pegar según paragolpes.', '€', 'splitter universal carbono', '', TUT('instalar splitter coche')],
  ['Paragolpes delantero tipo R', 'Genérico', 'Réplica o recambio; confirma sensores y lavafaros.', '€€', 'paragolpes delantero tipo R', '', TUT('instalar paragolpes coche')],
  ['Faldones laterales universales', 'Genérico', 'Faldones recortables; requieren ajuste y pintura.', '€', 'faldones laterales universales', '', TUT('instalar faldones coche')],
  ['Difusor trasero universal', 'Genérico', 'Difusor para paragolpes de serie; mide y comprueba salida de escape.', '€', 'difusor trasero universal', '', TUT('instalar difusor coche')]
], '/img/recambios/body-paragolpes-r.jpg', 'Las reformas de carrocería pueden requerir homologación y modificar sensores o airbags.');

add('taloneras', [
  ['Maxton Design Taloneras', 'Maxton Design', 'Taloneras específicas por modelo; revisa referencia y acabado.', '€€', 'Maxton Design side skirts', 'https://www.maxtondesign.com/', TUT('Maxton side skirts install')],
  ['Rieger Taloneras', 'Rieger', 'Faldones laterales con opción de pintura.', '€€', 'Rieger side skirts', 'https://www.rieger-tuning.de/', TUT('Rieger side skirts install')],
  ['Taloneras universales ABS', 'Genérico', 'Recortables y atornilladas; requieren ajuste.', '€', 'taloneras universales ABS', '', TUT('instalar taloneras coche')],
  ['Taloneras Golf VII', 'Genérico', 'Corte específico para Golf VII; confirma 3 o 5 puertas.', '€€', 'taloneras Golf 7', '', TUT('instalar taloneras Golf')],
  ['Taloneras Focus ST', 'Genérico', 'Faldones para Focus ST Mk3; revisa anclajes.', '€€', 'taloneras Focus ST', '', TUT('instalar taloneras Focus')],
  ['Taloneras Seat León 5F', 'Genérico', 'Taloneras para León 5F; comprueba acabado.', '€€', 'taloneras Seat Leon 5F', '', TUT('instalar taloneras Leon')],
  ['Taloneras BMW Serie 3', 'Genérico', 'Faldones para F30/G20; elige generación.', '€€', 'taloneras BMW Serie 3', '', TUT('instalar taloneras BMW')],
  ['Taloneras Audi A3 8V', 'Genérico', 'Faldones para A3 8V; revisa versión S line.', '€€', 'taloneras Audi A3 8V', '', TUT('instalar taloneras Audi')],
  ['Taloneras Mercedes Clase A', 'Genérico', 'Faldones para W176/W177; confirma año.', '€€', 'taloneras Mercedes Clase A', '', TUT('instalar taloneras Mercedes')],
  ['Taloneras carbono universal', 'Genérico', 'Acabado carbono; puede requerir pintura y adhesivo.', '€', 'taloneras carbono universales', '', TUT('instalar taloneras coche')]
], '/img/recambios/body-taloneras.jpg', 'Comprueba largo, altura y fijaciones; una talonera mal montada puede desprenderse.');

add('colas-escape', [
  ['Akrapovic Carbon Tail Pipe', 'Akrapovic', 'Cola de carbono para sistemas Akrapovic; confirma diámetro.', '€€€', 'Akrapovic carbon tail pipe', 'https://www.akrapovic.com/', TUT('Akrapovic tail pipe install')],
  ['Milltek GT Tailpipe', 'Milltek', 'Terminal de acero inoxidable; elige acabado y diámetro.', '€€', 'Milltek tailpipe', 'https://www.millteksport.com/', TUT('Milltek tailpipe install')],
  ['Remus Racing Tail Pipe', 'Remus', 'Cola deportiva con acabado cromado o negro.', '€€', 'Remus tail pipe', 'https://www.remus.eu/', TUT('Remus tail pipe install')],
  ['Supersprint Tail Pipe', 'Supersprint', 'Terminal específico para sistemas Supersprint.', '€€€', 'Supersprint tail pipe', 'https://www.supersprint.com/', TUT('Supersprint tail pipe install')],
  ['Ragazzon Cola de escape', 'Ragazzon', 'Terminal italiano en acero inoxidable.', '€€', 'Ragazzon tail pipe', 'https://www.ragazzon.com/', TUT('Ragazzon tail pipe install')],
  ['Cola de escape universal 63 mm', 'Genérico', 'Abrazadera y terminal; mide el tubo original.', '€', 'cola escape universal 63mm', '', TUT('instalar cola escape')],
  ['Cola de escape carbono 89 mm', 'Genérico', 'Acabado carbono; revisa diámetro de entrada.', '€', 'cola escape carbono 89mm', '', TUT('instalar cola escape')],
  ['Cola ovalada cromada', 'Genérico', 'Terminal ovalado para paragolpes con hueco específico.', '€', 'cola escape ovalada cromada', '', TUT('instalar cola escape')],
  ['Doble salida de escape', 'Genérico', 'Adaptador de doble salida; puede requerir modificar paragolpes.', '€€', 'doble salida escape universal', '', TUT('instalar doble salida escape')],
  ['Abrazadera de escape inoxidable', 'Genérico', 'Recambio de fijación; evita fugas y vibraciones.', '€', 'abrazadera escape inoxidable', '', TUT('cambiar abrazadera escape')]
], '/img/recambios/exh-supersprint-vag.jpg', 'Mide el diámetro y evita sistemas que superen los límites de sonido.');

add('reprogramacion', [
  ['Alientech KESS3', 'Alientech', 'Herramienta profesional OBD, bench y boot; licencias y protocolos aparte.', '€€€€', 'Alientech KESS3', 'https://www.alientech-tools.com/', TUT('Alientech KESS3 tutorial')],
  ['Alientech Powergate', 'Alientech', 'Programador de mano para mapas autorizados; ideal para talleres que delegan la calibración.', '€€€', 'Alientech Powergate', 'https://www.alientech-tools.com/', TUT('Alientech Powergate tutorial')],
  ['Autotuner', 'Autotuner', 'Herramienta profesional con lectura virtual y protocolos ampliados.', '€€€€', 'Autotuner ECU tool', 'https://www.autotuner.com/', TUT('Autotuner tutorial')],
  ['Magicmotorsport Flex', 'Magicmotorsport', 'Plataforma profesional OBD/bench/boot con módulos por protocolo.', '€€€€', 'Magicmotorsport Flex', 'https://www.magicmotorsport.com/', TUT('Magicmotorsport Flex tutorial')],
  ['Dimsport Genius', 'Dimsport', 'Herramienta de reprogramación profesional para talleres.', '€€€€', 'Dimsport Genius', 'https://www.dimsport.it/', TUT('Dimsport Genius tutorial')],
  ['CMD Flash', 'CMD', 'Herramienta de lectura/escritura profesional; revisa licencias.', '€€€€', 'CMD Flash ECU', 'https://www.cmdflash.com/', TUT('CMD Flash tutorial')],
  ['PCMFlash', 'PCMFlash', 'Software y adaptadores por protocolo; requiere conocimientos técnicos.', '€€', 'PCMFlash', 'https://www.pcmflash.com/', TUT('PCMFlash tutorial')],
  ['HP Tuners MPVI3', 'HP Tuners', 'Interfaz de calibración y datalogging para vehículos compatibles.', '€€€', 'HP Tuners MPVI3', 'https://www.hptuners.com/', TUT('HP Tuners MPVI3 tutorial')],
  ['KT200', 'KT200', 'Programador multimarca OBD/bench; comprueba licencias y soporte.', '€€€', 'KT200 ECU programmer', '', TUT('KT200 tutorial')],
  ['Foxflash', 'Foxflash', 'Programador OBD/bench/boot con protocolos ampliados.', '€€€', 'Foxflash ECU programmer', 'https://www.foxflash.com/', TUT('Foxflash tutorial')],
  ['MPPS V18', 'MPPS', 'Interfaz económica para vehículos compatibles; no cubre todos los protocolos.', '€', 'MPPS V18', '', TUT('MPPS V18 tutorial')],
  ['KESS V2 clon', 'Genérico', 'Alternativa económica; sin soporte oficial y con riesgo de bloquear la ECU.', '€', 'KESS V2 clone', '', TUT('KESS V2 tutorial')],
  ['Cable bench y fuente estabilizada', 'Genérico', 'Cableado y alimentación para lectura en banco; imprescindible medir estable.', '€€', 'bench cable ECU power supply', '', TUT('bench ECU reading tutorial')],
  ['Adaptador boot y zócalo ECU', 'Genérico', 'Zócalos y cables boot para centralitas compatibles; verifica pinout.', '€€', 'ECU boot cable socket', '', TUT('boot mode ECU tutorial')]
], '/img/products/electronica.jpg', 'La reprogramación debe respetar emisiones, homologación y garantía. Haz copia de la ECU original y usa herramientas originales.');

add('turbo', [
  ['Garrett G25-660', 'Garrett', 'Turbo de alto caudal para objetivos de más de 500 CV; exige hardware y calibración.', '€€€', 'Garrett G25-660', 'https://www.garrettmotion.com/', TUT('Garrett G25-660 install')],
  ['Garrett GTX2867R Gen II', 'Garrett', 'Turbo de bolas para 2.0 con respuesta y margen de potencia.', '€€€', 'Garrett GTX2867R Gen II', 'https://www.garrettmotion.com/', TUT('GTX2867R install')],
  ['BorgWarner EFR6258', 'BorgWarner', 'Turbo de titanio con wastegate integrada; revisa colector.', '€€€', 'BorgWarner EFR6258', 'https://www.borgwarner.com/', TUT('EFR6258 install')],
  ['BorgWarner EFR7163', 'BorgWarner', 'Turbo de mayor caudal para motores con preparación interna.', '€€€', 'BorgWarner EFR7163', 'https://www.borgwarner.com/', TUT('EFR7163 install')],
  ['Turbo K04-064', 'Genérico', 'Recambio de origen para 2.0 TFSI; confirma referencia y actuador.', '€€', 'turbo K04-064', '', TUT('K04 install')],
  ['Turbo IHI IS38', 'IHI', 'Turbo de Golf R/S3; comprueba referencia y estado del motor.', '€€€', 'IHI IS38 turbo', '', TUT('IS38 turbo install')],
  ['Turbo TD04L-13T', 'Mitsubishi', 'Opción de reposición para motores turbo gasolina.', '€€', 'TD04L-13T turbo', '', TUT('TD04L install')],
  ['Cartucho híbrido de turbo', 'Genérico', 'Recambio interno de mayor caudal; requiere rectificado y equilibrado.', '€€', 'cartucho turbo hibrido', '', TUT('cartucho turbo hibrido')],
  ['Kit de línea de aceite para turbo', 'Genérico', 'Latiguillos y restrictores; fundamental para no romper el turbo.', '€', 'kit linea aceite turbo', '', TUT('instalar linea aceite turbo')],
  ['Wastegate ajustable', 'Genérico', 'Actuador de presión; requiere ajuste en banco y diagnóstico.', '€', 'wastegate ajustable turbo', '', TUT('ajustar wastegate turbo')]
], '/img/recambios/turbo-garrett-gt2871r.jpg', 'Un turbo mayor exige combustible, admisión, escape, embrague y calibración; no es plug and play.');

add('llantas', [
  ['OZ Superturismo GT', 'OZ Racing', 'Llanta de competición clásica; elige ET y buje correctos.', '€€€', 'OZ Superturismo GT', 'https://www.ozracing.com/', TUT('OZ Superturismo install')],
  ['OZ Ultraleggera', 'OZ Racing', 'Llanta ligera de 17-19 pulgadas; confirma tornillería.', '€€€', 'OZ Ultraleggera', 'https://www.ozracing.com/', TUT('OZ Ultraleggera install')],
  ['BBS CH-R', 'BBS', 'Llanta forjada de alta resistencia; revisa medidas.', '€€€€', 'BBS CH-R', 'https://www.bbs.com/', TUT('BBS CH-R install')],
  ['BBS CI-R', 'BBS', 'Diseño de competición con acabados premium.', '€€€€', 'BBS CI-R', 'https://www.bbs.com/', TUT('BBS CI-R install')],
  ['Sparco Assetto Gara', 'Sparco', 'Llanta deportiva de 17-18 pulgadas.', '€€', 'Sparco Assetto Gara', 'https://www.sparco-official.com/', TUT('Sparco Assetto Gara install')],
  ['Ronal R62', 'Ronal', 'Llanta de diseño y uso diario; comprueba homologación.', '€€', 'Ronal R62', 'https://www.ronal-wheels.com/', TUT('Ronal R62 install')],
  ['Llanta 19 pulgadas Golf R', 'Genérico', 'Réplica o recambio; verifica peso y homologación.', '€€', 'llanta 19 Golf R', '', TUT('instalar llantas Golf')],
  ['Llanta 18 pulgadas universal 5x112', 'Genérico', 'Opción económica; mide ET, anchura y buje.', '€', 'llanta 18 5x112', '', TUT('elegir llantas coche')],
  ['Separadores de rueda 15 mm', 'Genérico', 'Separadores con tornillería; requieren bujes y tuercas correctas.', '€', 'separadores rueda 15mm 5x112', '', TUT('instalar separadores rueda')],
  ['Tuercas de rueda antirrobo', 'Genérico', 'Juego de tuercas de seguridad; guarda el adaptador.', '€', 'tuercas rueda antirrobo', '', TUT('instalar tuercas antirrobo')]
], '/img/recambios/wheel-oz-superturismo.jpg', 'La medida debe ser equivalente y legal; revisa ET, buje, neumático y homologación.');

add('bombillas-led', [
  ['Osram LEDriving HL H7', 'Osram', 'LED homologado para faros compatibles; comprueba la lista del fabricante.', '€€€', 'Osram LEDriving H7', 'https://www.osram.es/', TUT('Osram LEDriving H7 install')],
  ['Philips Ultinon Pro6000 H7', 'Philips', 'LED de alta luminosidad; verifica homologación y casquillo.', '€€€', 'Philips Ultinon Pro6000 H7', 'https://www.philips.es/', TUT('Philips Ultinon H7 install')],
  ['Auxito H7 LED', 'Auxito', 'Opción económica CANBUS; comprueba errores y enfoque.', '€', 'Auxito H7 LED', '', TUT('instalar bombillas LED H7')],
  ['SEALIGHT H7 LED', 'SEALIGHT', 'Kit LED económico; revisa homologación antes de circular.', '€', 'SEALIGHT H7 LED', '', TUT('instalar bombillas LED H7')],
  ['Osram Night Breaker H4', 'Osram', 'Halógena de alto rendimiento; no deslumbra si el faro está bien.', '€€', 'Osram Night Breaker H4', 'https://www.osram.es/', TUT('cambiar bombilla H4')],
  ['Philips X-tremeVision H4', 'Philips', 'Halógena de larga duración y luz más blanca.', '€€', 'Philips X-tremeVision H4', 'https://www.philips.es/', TUT('cambiar bombilla H4')],
  ['Bombilla H11 LED', 'Genérico', 'Para antiniebla o cruce según coche; comprueba CANBUS.', '€', 'bombilla H11 LED coche', '', TUT('cambiar bombilla H11')],
  ['Kit LED interior 6000K', 'Genérico', 'Set de bombillas interiores; elige casquillos correctos.', '€', 'kit LED interior coche', '', TUT('instalar LED interior coche')]
], '/img/recambios/led-osram-h7.jpg', 'Para circular, usa solo bombillas homologadas para tu faro; una LED no homologada puede ser rechazada en ITV.');

const byCategory = {};
for (const item of data.items) byCategory[item.category] = (byCategory[item.category] || 0) + 1;
data.updated = TODAY;
data.disclaimer = 'Catálogo curado de tuning y reprogramación. Cada ficha enlaza a búsquedas reales en Amazon, eBay, AliExpress y Temu, y a la web oficial cuando existe. Los precios son orientativos por gama (€ a €€€€), no ofertas cerradas: comprueba vendedor, referencia, medidas y homologación antes de comprar.';
data.affiliate = {
  status: 'activo',
  note: 'Los enlaces de Amazon reciben la etiqueta de afiliado configurada en el servidor; AliExpress y Temu usan su plantilla cuando está disponible.'
};
data.stats = {
  ...(data.stats || {}),
  items: data.items.length,
  categories: data.categories.length,
  cars: (data.cars || []).length,
  shopItems: data.items.length,
  photos: data.items.filter(item => item.image).length,
  store: data.items.length,
  byCategory,
  lastSync: new Date().toISOString()
};
fs.writeFileSync(FILE, JSON.stringify(data, null, 2) + '\n');
console.log(JSON.stringify({ items: data.items.length, categories: data.categories.length, byCategory }, null, 2));
