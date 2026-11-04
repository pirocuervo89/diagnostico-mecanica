/**
 * Construye data/tuning-products.json: catálogo de piezas y accesorios de tuning para
 * coches europeos. Cada ficha lleva compatibilidad, nota técnica y enlaces de
 * búsqueda reales (AliExpress, Temu y, cuando existe, la marca).
 *
 * Los enlaces de AliExpress y Temu son búsquedas funcionales sin identificador
 * de afiliado: cuando exista cuenta, basta con añadir el parámetro de tracking
 * en el campo `links` de cada ficha.
 */
import fs from 'node:fs';

const CARS = [
  ['vw-golf-7-gti', 'VW Golf VII GTI', '2.0 TSI EA888 Gen3 · 2013-2020'],
  ['vw-golf-7-r', 'VW Golf VII R', '2.0 TSI EA888 Gen3 · 2013-2020'],
  ['vw-golf-6-gti', 'VW Golf VI GTI', '2.0 TSI EA888 Gen2 · 2009-2013'],
  ['vw-golf-5-gti', 'VW Golf V GTI', '2.0 TFSI EA113 · 2004-2009'],
  ['vw-polo-6c-gti', 'VW Polo 6C GTI', '1.8 TSI EA888 · 2014-2017'],
  ['audi-s3-8v', 'Audi S3 8V', '2.0 TFSI EA888 Gen3 · 2013-2020'],
  ['audi-a3-8v', 'Audi A3 8V', '1.8 / 2.0 TFSI · 2012-2020'],
  ['seat-leon-5f-cupra', 'Seat León 5F Cupra', '2.0 TSI EA888 Gen3 · 2014-2020'],
  ['skoda-octavia-5e-rs', 'Škoda Octavia III RS', '2.0 TSI EA888 Gen3 · 2013-2020'],
  ['bmw-m135i-f20', 'BMW M135i F20', '3.0 turbo N55 · 2012-2016'],
  ['bmw-335i-f30', 'BMW 335i F30', '3.0 turbo N55 · 2012-2019'],
  ['bmw-320d-f30', 'BMW 320d F30', '2.0 diésel N47 · 2012-2019'],
  ['mercedes-a45-w176', 'Mercedes-AMG A45 W176', '2.0 turbo M133 · 2013-2018'],
  ['renault-megane-4-rs', 'Renault Mégane IV RS', '1.8 turbo · 2017-2023'],
  ['peugeot-308-gti', 'Peugeot 308 GTI', '1.6 THP · 2015-2021'],
  ['ford-focus-st-mk3', 'Ford Focus ST Mk3', '2.0 EcoBoost · 2012-2018'],
  ['ford-fiesta-st-mk7', 'Ford Fiesta ST Mk7', '1.6 EcoBoost · 2013-2017'],
  ['opel-astra-j-opc', 'Opel Astra J OPC', '2.0 turbo · 2012-2018'],
  ['alfa-giulietta-qv', 'Alfa Romeo Giulietta QV', '1750 TBi · 2010-2020'],
  ['mini-cooper-s-f56', 'Mini Cooper S F56', '2.0 turbo B48 · 2014-2023'],
  ['fiat-500-abarth', 'Abarth 500 / 595', '1.4 T-Jet · 2008-2023']
];

const CAR_LABEL = Object.fromEntries(CARS.map(([id, name, engine]) => [id, `${name} · ${engine}`]));

const CATEGORIES = [
  ['turbo', 'Turbos', 'turbo.jpg', 'Soplado y caudal: la pieza que más cambia el coche y la que más exige alrededor.'],
  ['intercooler', 'Intercoolers', 'intercooler.jpg', 'Bajar la temperatura de admisión es la forma más barata de no perder lo ganado.'],
  ['blow-off', 'Válvulas de descarga', 'blow-off.jpg', 'Recirculación o ambiente: sonido, respuesta y estanqueidad del circuito.'],
  ['manguitos', 'Manguitos y abrazaderas', 'manguitos.jpg', 'Con más presión, la goma de serie es el punto débil más barato de arreglar.'],
  ['admision', 'Admisión y filtros', 'admision.jpg', 'Aire frío, caudal medido y una caja que no coja calor del motor.'],
  ['escape', 'Escape y downpipes', 'escape.jpg', 'Menos contrapresión sin saltarse el catalizador ni el sonido legal.'],
  ['bombillas-led', 'Bombillas LED', 'bombillas-led.jpg', 'Luz blanca con consumo bajo: comprueba homologación y CANBUS.'],
  ['xenon', 'Xenon / HID', 'xenon.jpg', 'Lámparas y balastros D1S-D4S: potencia de luz sin deslumbrar.'],
  ['carroceria', 'Carrocería y aerodinámica', 'carroceria.jpg', 'Paragolpes, taloneras, alerones y difusores: estética y algo de apoyo.'],
  ['llantas', 'Llantas', 'llantas.jpg', 'Peso no suspendido, medida legal y neumático correcto.'],
  ['espejos', 'Espejos', 'espejos.jpg', 'Carcasas, intermitentes dinámicos y cristales asféricos.'],
  ['suspension', 'Suspensión', 'suspension.jpg', 'Altura, amortiguación y geometría: la potencia necesita apoyo.'],
  ['frenos', 'Frenos', 'frenos.jpg', 'Discos, pastillas, líquido y latiguillos: lo primero que sube si sube la potencia.'],
  ['electronica', 'Electrónica y diagnosis', 'electronica.jpg', 'Medir antes de comprar: interfaces, sensores y centralitas adicionales.'],
  ['interior', 'Interior y volantes', 'interior.jpg', 'Volantes, pomos y mandos: lo que tocas en cada cambio de marcha.'],
  ['lubricantes', 'Aceites y fluidos', 'lubricantes.jpg', 'El aceite correcto sostiene toda la preparación; el equivocado la rompe.'],
  ['transmision', 'Transmisión y embrague', 'transmision.jpg', 'Si sube el par, el embrague y el cambio son el siguiente límite.']
];

const SHOPS = {
  garrett: ['Garrett', 'https://www.garrettmotion.com/'],
  borgwarner: ['BorgWarner', 'https://www.borgwarner.com/'],
  wagner: ['Wagner Tuning', 'https://www.wagner-tuning.com/'],
  forge: ['Forge Motorsport', 'https://www.forgemotorsport.co.uk/'],
  supersprint: ['Supersprint', 'https://www.supersprint.com/'],
  ragazzon: ['Ragazzon', 'https://www.ragazzon.com/'],
  osram: ['Osram', 'https://www.osram.com/'],
  philips: ['Philips', 'https://www.philips.com/'],
  maxton: ['Maxton Design', 'https://maxtondesign.com/'],
  oz: ['OZ Racing', 'https://www.ozracing.com/'],
  bbs: ['BBS', 'https://www.bbs.com/'],
  ronal: ['Ronal', 'https://www.ronal-wheels.com/'],
  sparco: ['Sparco', 'https://www.sparco-official.com/'],
  kw: ['KW Suspensions', 'https://www.kwsuspensions.com/'],
  bilstein: ['Bilstein', 'https://www.bilstein.com/en/'],
  eibach: ['Eibach', 'https://www.eibach.com/'],
  hr: ['H&R', 'https://www.h-r.com/'],
  stsusp: ['ST Suspensions', 'https://www.stsuspensions.com/'],
  brembo: ['Brembo', 'https://www.brembo.com/en/car'],
  ebc: ['EBC Brakes', 'https://www.ebcbrakes.com/'],
  ferodo: ['Ferodo', 'https://www.ferodo.com/'],
  tarox: ['Tarox', 'https://www.tarox.com/'],
  eventuri: ['Eventuri', 'https://www.eventuri.net/'],
  ramair: ['Ramair', 'https://www.ramair-filters.co.uk/'],
  bmc: ['BMC', 'https://www.bmcairfilters.com/'],
  samco: ['Samco Sport', 'https://www.samcosport.com/'],
  mishimoto: ['Mishimoto', 'https://www.mishimoto.com/'],
  airtec: ['Airtec Motorsport', 'https://www.airtecmotorsport.com/'],
  do88: ['do88', 'https://www.do88.se/'],
  bailey: ['Bailey Motorsport', 'https://www.baileymotorsport.co.uk/'],
  ngk: ['NGK', 'https://www.ngk.de/en/'],
  bosch: ['Bosch', 'https://www.bosch-mobility.com/en/'],
  mahle: ['MAHLE', 'https://www.mahle-aftermarket.com/eu/en/'],
  hella: ['Hella', 'https://www.hella.com/']
};

const VAG_GEN3 = ['vw-golf-7-gti', 'vw-golf-7-r', 'audi-s3-8v', 'seat-leon-5f-cupra', 'skoda-octavia-5e-rs'];
const VAG_GEN2 = ['vw-golf-6-gti', 'vw-golf-5-gti', 'audi-a3-8v'];
const UNIVERSAL = ['universal'];

// prettier-ignore
const ITEMS = [
  // ---------- TURBOS ----------
  ['turbo-garrett-g25-550', 'Garrett G25-550', 'Garrett', 'turbo', VAG_GEN3, 'Turbo de 550 CV de techo con respuesta muy buena para 2.0. Exige colector, downpipe, inyectores y calibración a medida.', '€€€', 'garrett'],
  ['turbo-garrett-g25-660', 'Garrett G25-660', 'Garrett', 'turbo', ['vw-golf-7-r', 'audi-s3-8v', 'seat-leon-5f-cupra'], 'Salto de caudal para objetivos por encima de 500 CV. Con 2.0 pierde respuesta abajo y obliga a reforzar transmisión.', '€€€', 'garrett'],
  ['turbo-garrett-gtx2867r', 'Garrett GTX2867R Gen II', 'Garrett', 'turbo', ['vw-golf-6-gti', 'vw-golf-7-gti', 'audi-s3-8v'], 'Clásico de los 2.0 TFSI para 450-500 CV. Necesita colector T25/T3 y gestión de wastegate.', '€€€', 'garrett'],
  ['turbo-borgwarner-efr6258', 'BorgWarner EFR6258', 'BorgWarner', 'turbo', ['vw-golf-7-gti', 'audi-s3-8v', 'ford-focus-st-mk3'], 'Turbo pequeño con respuesta de serie y techo alto. Wastegate y válvula integradas simplifican el montaje.', '€€€', 'borgwarner'],
  ['turbo-borgwarner-efr7163', 'BorgWarner EFR7163', 'BorgWarner', 'turbo', ['vw-golf-7-r', 'audi-s3-8v', 'seat-leon-5f-cupra'], 'Más techo que el 6258 a costa de algo de respuesta. Pensado para circuito y calibración dedicada.', '€€€', 'borgwarner'],
  ['turbo-ihi-is38', 'IHI IS38 (Golf R de serie)', 'IHI', 'turbo', ['vw-golf-7-gti', 'audi-s3-8v', 'seat-leon-5f-cupra'], 'El turbo del Golf R como mejora directa del GTI: pieza de intercambio y calibración específica.', '€€', 'wagner'],
  ['turbo-ihi-is20', 'IHI IS20 (GTI de serie)', 'IHI', 'turbo', ['vw-golf-7-gti', 'audi-a3-8v'], 'Repuesto o punto de partida para Stage 3 contenido. Verifica referencia antes de comprar.', '€€', 'wagner'],
  ['turbo-k04-064', 'K04-064 híbrido', 'BorgWarner', 'turbo', ['vw-golf-5-gti', 'vw-golf-6-gti', 'audi-a3-8v'], 'Actualización clásica del 2.0 TFSI EA113. Requiere inyectores, bomba y mapa propio.', '€€€', 'borgwarner'],
  ['turbo-td04l-13t', 'Mitsubishi TD04L-13T', 'Mitsubishi', 'turbo', UNIVERSAL, 'Turbo de origen japonés muy usado en proyectos compactos. Comprueba bridas y giro antes de montar.', '€€', null],
  ['turbo-garrett-gt2871r', 'Garrett GT2871R', 'Garrett', 'turbo', UNIVERSAL, 'Turbo de bolas con techo alto y respuesta tardía en motores pequeños. Solo con objetivo claro.', '€€€', 'garrett'],
  ['turbo-cartucho-hibrido', 'Cartucho híbrido de turbo (intercambio)', 'Varios', 'turbo', ['vw-golf-7-gti', 'bmw-335i-f30', 'ford-focus-st-mk3'], 'Se reutiliza la carcasa y se cambia el núcleo. Más barato, pero depende de la calidad del montaje y del equilibrado.', '€€', null],
  ['turbo-kit-linea-aceite', 'Kit de línea de aceite y retorno para turbo', 'Varios', 'turbo', UNIVERSAL, 'Latiguillos, racores y restrictores. Una línea mal hecha mata el turbo nuevo en pocos kilómetros.', '€', null],

  // ---------- INTERCOOLERS ----------
  ['ic-wagner-competition', 'Wagner Tuning Competition (EA888 Gen3)', 'Wagner Tuning', 'intercooler', VAG_GEN3, 'Núcleo de gran volumen con depósitos de fundición. Referencia en VAG para Stage 2 y 3.', '€€€', 'wagner'],
  ['ic-wagner-evo2', 'Wagner Tuning EVO 2', 'Wagner Tuning', 'intercooler', ['vw-golf-6-gti', 'vw-golf-5-gti', 'audi-a3-8v'], 'Versión para plataformas anteriores con buen equilibrio entre volumen y caída de presión.', '€€€', 'wagner'],
  ['ic-forge-vag', 'Forge Motorsport para VAG', 'Forge Motorsport', 'intercooler', VAG_GEN3, 'Alternativa con núcleo de barra y aleta y acabado de tuberías propio.', '€€€', 'forge'],
  ['ic-airtec-focus', 'Airtec Stage 2 para Focus ST', 'Airtec Motorsport', 'intercooler', ['ford-focus-st-mk3', 'ford-fiesta-st-mk7'], 'Pensado para el EcoBoost con montaje directo y buen caudal.', '€€', 'airtec'],
  ['ic-do88-bmw', 'do88 para BMW N55', 'do88', 'intercooler', ['bmw-m135i-f20', 'bmw-335i-f30'], 'Núcleo de mayor espesor para el seis cilindros; mejora la recuperación entre tiradas.', '€€€', 'do88'],
  ['ic-mishimoto-universal', 'Intercooler universal barra y aleta', 'Mishimoto', 'intercooler', UNIVERSAL, 'Para proyectos a medida: elige por caudal y por espacio real, no por tamaño.', '€€', 'mishimoto'],
  ['ic-320d', 'Intercooler para BMW 320d', 'Varios', 'intercooler', ['bmw-320d-f30'], 'Repuesto de mayor espesor para uso exigente con repro.', '€€', null],
  ['ic-tuberias-kit', 'Kit de tuberías de intercooler', 'Varios', 'intercooler', ['vw-golf-7-gti', 'ford-focus-st-mk3', 'audi-s3-8v'], 'Sustituye plásticos y gomas por aluminio o silicona rígida.', '€€', null],
  ['ic-nucleo-medida', 'Núcleo de intercooler a medida', 'Varios', 'intercooler', UNIVERSAL, 'Para fabricar el intercooler al hueco disponible. Requiere soldadura y cálculo de caudal.', '€€', null],
  ['ic-sensores-map', 'Sensor MAP de mayor rango', 'Bosch', 'intercooler', VAG_GEN3, 'Necesario cuando la presión de trabajo supera el rango del sensor de serie.', '€', 'bosch'],

  // ---------- VÁLVULAS DE DESCARGA ----------
  ['bov-forge-fmdv008', 'Forge FMDV008 de recirculación', 'Forge Motorsport', 'blow-off', VAG_GEN3, 'Mantiene el comportamiento de serie y aguanta presión alta sin romper la membrana.', '€€', 'forge'],
  ['bov-forge-fmdvkv', 'Forge FMDVKV ambiente', 'Forge Motorsport', 'blow-off', ['vw-golf-5-gti', 'vw-golf-6-gti', 'audi-a3-8v'], 'Válvula de descarga a la atmósfera para 1.8T/2.0T. Ruido característico y ajuste de muelle.', '€€', 'forge'],
  ['bov-gfb-dvplus', 'GFB DV+', 'GFB', 'blow-off', VAG_GEN3, 'Convierte la válvula de serie en una de pistón. Mejora la respuesta al soltar gas.', '€€', null],
  ['bov-turbosmart-kompact', 'Turbosmart Kompact', 'Turbosmart', 'blow-off', UNIVERSAL, 'Válvula compacta con muelles intercambiables. Ajusta según presión real.', '€€', null],
  ['bov-bailey-dv26', 'Bailey DV26', 'Bailey Motorsport', 'blow-off', ['vw-golf-5-gti', 'audi-a3-8v', 'seat-leon-5f-cupra'], 'Recirculación reforzada para motores con presión por encima de serie.', '€€', 'bailey'],
  ['bov-reparacion-dv', 'Kit de reparación de válvula de descarga', 'Varios', 'blow-off', VAG_GEN3, 'Membrana y juntas: la solución barata cuando la de serie pierde presión.', '€', null],
  ['bov-silenciador', 'Silenciador de descarga', 'Varios', 'blow-off', UNIVERSAL, 'Reduce el ruido de la válvula atmosférica para pasar menos desapercibido.', '€', null],
  ['bov-manguito-recirculacion', 'Manguito de recirculación', 'Varios', 'blow-off', VAG_GEN3, 'Evita fugas y tomas de aire falso en la recirculación.', '€', null],

  // ---------- MANGUITOS ----------
  ['hose-forge-boost', 'Forge manguitos de presión (EA888)', 'Forge Motorsport', 'manguitos', VAG_GEN3, 'Kit de silicona reforzada con abrazaderas. Evita el hinchado de la goma de serie.', '€€', 'forge'],
  ['hose-samco-golf6', 'Samco Sport para Golf VI GTI', 'Samco Sport', 'manguitos', ['vw-golf-6-gti', 'audi-a3-8v'], 'Silicona de varias capas con color a elegir. Verifica diámetros y codos.', '€€', 'samco'],
  ['hose-mishimoto-universal', 'Manguito de silicona universal', 'Mishimoto', 'manguitos', UNIVERSAL, 'Corta a medida. Refuerzo interior y rango de temperatura alto.', '€', 'mishimoto'],
  ['hose-focus-st', 'Kit de manguitos Focus ST', 'Varios', 'manguitos', ['ford-focus-st-mk3', 'ford-fiesta-st-mk7'], 'Sustituye los manguitos de admisión y presión del EcoBoost.', '€€', null],
  ['hose-n55', 'Manguitos de presión BMW N55', 'Varios', 'manguitos', ['bmw-m135i-f20', 'bmw-335i-f30'], 'Punto habitual de fuga en el seis cilindros turbo.', '€€', null],
  ['hose-mini-f56', 'Manguitos Mini Cooper S F56', 'Varios', 'manguitos', ['mini-cooper-s-f56'], 'Kit específico para el B48 con abrazaderas incluidas.', '€€', null],
  ['hose-abrazaderas-tbolt', 'Abrazaderas T-bolt', 'Varios', 'manguitos', UNIVERSAL, 'Cierran mucho mejor que las de tornillo sin fin en alta presión.', '€', null],
  ['hose-tuberia-aluminio', 'Tubería de aluminio para admisión', 'Varios', 'manguitos', UNIVERSAL, 'Sustituye plástico por aluminio y elimina deformaciones con presión alta.', '€€', null],

  // ---------- ADMISIÓN ----------
  ['int-eventuri-vag', 'Eventuri admisión de carbono (EA888)', 'Eventuri', 'admision', VAG_GEN3, 'Caja cerrada con toma frontal y conducto de carbono. Lo que se paga es el diseño de flujo.', '€€€', 'eventuri'],
  ['int-ramair-vag', 'Ramair caja cerrada para Golf 7 GTI', 'Ramair', 'admision', ['vw-golf-7-gti', 'vw-golf-7-r', 'audi-s3-8v'], 'Alternativa de precio medio con filtro lavable y toma de aire frontal.', '€€', 'ramair'],
  ['int-bmc-cda', 'BMC CDA caja cerrada', 'BMC', 'admision', UNIVERSAL, 'Filtro de algodón en caja de carbono. Admite montaje universal con conducto.', '€€', 'bmc'],
  ['int-filtro-conico', 'Filtro cónico universal', 'Varios', 'admision', UNIVERSAL, 'Barato y ruidoso: sin caja ni aire frío puede perder potencia por calor.', '€', null],
  ['int-panel-bmc', 'Filtro de panel BMC', 'BMC', 'admision', VAG_GEN3, 'Sustituye el filtro de serie sin cambiar la caja. Mantenimiento lavable.', '€', 'bmc'],
  ['int-focus-st', 'Admisión Focus ST Mk3', 'Varios', 'admision', ['ford-focus-st-mk3'], 'Caja cerrada o cónico con escudo térmico según uso.', '€€', null],
  ['int-fiesta-st', 'Admisión Fiesta ST Mk7', 'Varios', 'admision', ['ford-fiesta-st-mk7'], 'Mejora la respuesta del 1.6 EcoBoost con mapa adecuado.', '€€', null],
  ['int-toma-aire', 'Toma de aire frontal universal', 'Varios', 'admision', UNIVERSAL, 'Lleva aire del exterior a la caja: barato y a menudo más efectivo que cambiar el filtro.', '€', null],
  ['int-manguito-maf', 'Adaptador de MAF', 'Varios', 'admision', ['vw-golf-7-gti', 'audi-s3-8v'], 'Necesario al montar tuberías de mayor diámetro; sin calibración desajusta la mezcla.', '€', null],
  ['int-filtro-lavable', 'Kit de limpieza de filtro lavable', 'Varios', 'admision', UNIVERSAL, 'Aceite y limpiador para filtros de algodón. Un filtro sucio pierde caudal.', '€', null],

  // ---------- ESCAPE ----------
  ['exh-supersprint-vag', 'Supersprint línea para Golf 7 GTI', 'Supersprint', 'escape', ['vw-golf-7-gti', 'audi-s3-8v'], 'Acero inoxidable con opciones homologadas y válvula de sonido.', '€€€', 'supersprint'],
  ['exh-ragazzon-abarth', 'Ragazzon para Abarth 500', 'Ragazzon', 'escape', ['fiat-500-abarth'], 'Línea italiana específica para el 1.4 T-Jet, con versión homologada.', '€€', 'ragazzon'],
  ['exh-downpipe-ea888', 'Downpipe deportivo EA888 Gen3', 'Varios', 'escape', VAG_GEN3, 'La pieza que más nota el turbo. Exige catalizador homologado para circular.', '€€', null],
  ['exh-catback-golf-r', 'Cat-back Golf 7 R', 'Varios', 'escape', ['vw-golf-7-r', 'audi-s3-8v'], 'Sonido y estética sin tocar la sección catalizada.', '€€', null],
  ['exh-downpipe-focus', 'Downpipe Focus ST Mk3', 'Varios', 'escape', ['ford-focus-st-mk3'], 'Comprueba la sonda lambda y el catalizador antes de montar.', '€€', null],
  ['exh-320d', 'Escape deportivo BMW 320d', 'Varios', 'escape', ['bmw-320d-f30'], 'Cambio de sonido y salida; la ganancia es pequeña sin calibrar.', '€€', null],
  ['exh-colector-4-1', 'Colector 4-1 de acero inoxidable', 'Varios', 'escape', UNIVERSAL, 'Para proyectos con turbo externo o atmosféricos preparados.', '€€', null],
  ['exh-valvula-sonido', 'Válvula de escape eléctrica', 'Varios', 'escape', UNIVERSAL, 'Abre o cierra el paso según modo. En vía pública debe cumplir el nivel sonoro.', '€€', null],
  ['exh-silencioso-abarth', 'Silencioso trasero Abarth', 'Varios', 'escape', ['fiat-500-abarth'], 'Cambio directo con salida doble, versión homologada disponible.', '€€', null],
  ['exh-juntas-abrazaderas', 'Kit de juntas y abrazaderas de escape', 'Varios', 'escape', UNIVERSAL, 'Evita fugas y ruidos después de montar la línea.', '€', null],

  // ---------- BOMBILLAS LED ----------
  ['led-osram-h7', 'Osram LEDriving H7', 'Osram', 'bombillas-led', UNIVERSAL, 'Retrofit LED homologado para uso en vía pública en algunas referencias. Comprueba la lista del fabricante.', '€€', 'osram'],
  ['led-osram-h4', 'Osram LEDriving H4', 'Osram', 'bombillas-led', UNIVERSAL, 'Versión H4 con disipador compacto. Verifica espacio en el faro.', '€€', 'osram'],
  ['led-philips-h7', 'Philips Ultinon Pro6000 H7', 'Philips', 'bombillas-led', UNIVERSAL, 'LED de retrofit con corte de haz cuidado; revisa homologación por país.', '€€', 'philips'],
  ['led-philips-h4', 'Philips Ultinon Pro6000 H4', 'Philips', 'bombillas-led', UNIVERSAL, 'Alternativa directa al halógeno con temperatura más neutra.', '€€', 'philips'],
  ['led-h11', 'Bombilla LED H11 / H8', 'Varios', 'bombillas-led', UNIVERSAL, 'Antiniebla y luz de cruce en muchos modelos. Cuidado con el CANBUS.', '€', null],
  ['led-w5w', 'LED W5W interior y matrícula', 'Varios', 'bombillas-led', UNIVERSAL, 'Cambio barato y visible. Elige luz cálida o blanca según el interior.', '€', null],
  ['led-p21w', 'LED P21W / PY21W', 'Varios', 'bombillas-led', UNIVERSAL, 'Intermitentes y marcha atrás: necesita resistencia si da error de bombilla.', '€', null],
  ['led-canbus', 'Resistencia CANBUS para LED', 'Varios', 'bombillas-led', UNIVERSAL, 'Evita el parpadeo y el aviso de lámpara fundida.', '€', null],
  ['led-h7-6000k', 'Kit H7 LED 6000K', 'Varios', 'bombillas-led', UNIVERSAL, 'Opción económica: la calidad del corte de haz varía mucho entre vendedores.', '€', null],
  ['led-interior-kit', 'Kit de luces LED de interior', 'Varios', 'bombillas-led', UNIVERSAL, 'Conjunto por modelo con todas las bombillas del habitáculo.', '€', null],

  // ---------- XENON ----------
  ['xen-osram-d1s', 'Osram Xenarc D1S', 'Osram', 'xenon', UNIVERSAL, 'Lámpara de descarga con balastro integrado. Sustitución directa con mismo casquillo.', '€€', 'osram'],
  ['xen-osram-d2s', 'Osram Xenarc D2S', 'Osram', 'xenon', UNIVERSAL, 'Referencia habitual en faros proyectores. No tocar el vidrio con los dedos.', '€€', 'osram'],
  ['xen-osram-d3s', 'Osram Xenarc D3S', 'Osram', 'xenon', UNIVERSAL, 'Versión sin mercurio para faros más modernos.', '€€', 'osram'],
  ['xen-philips-d2s', 'Philips X-tremeVision D2S', 'Philips', 'xenon', UNIVERSAL, 'Más luminosidad que la lámpara de serie manteniendo el casquillo.', '€€', 'philips'],
  ['xen-d4s', 'Lámpara D4S', 'Varios', 'xenon', UNIVERSAL, 'Comprueba la referencia exacta del faro antes de pedir.', '€€', null],
  ['xen-balastro', 'Balastro / centralita de xenon', 'Varios', 'xenon', UNIVERSAL, 'El fallo de encendido intermitente suele estar aquí, no en la lámpara.', '€€', null],
  ['xen-kit-h7', 'Kit de conversión xenon H7', 'Varios', 'xenon', UNIVERSAL, 'No es legal en vía pública sin faro homologado. Solo para exposición o circuito.', '€', null],
  ['xen-d2r', 'Lámpara D2R para faro reflector', 'Varios', 'xenon', UNIVERSAL, 'Distinta de la D2S: el casquillo y el apantallado no son intercambiables.', '€€', null],

  // ---------- CARROCERÍA ----------
  ['body-maxton-splitter', 'Maxton Design splitter Golf 7 GTI', 'Maxton Design', 'carroceria', ['vw-golf-7-gti', 'vw-golf-7-r'], 'ABS de buen ajuste y acabado. Se monta con tornillos y adhesivo.', '€€', 'maxton'],
  ['body-maxton-faldones', 'Maxton Design faldones laterales', 'Maxton Design', 'carroceria', ['vw-golf-7-gti', 'seat-leon-5f-cupra'], 'Le bajan la línea al coche sin tocar anclajes originales.', '€€', 'maxton'],
  ['body-difusor-golf7', 'Difusor trasero Golf 7 R', 'Varios', 'carroceria', ['vw-golf-7-r', 'vw-golf-7-gti'], 'Pieza de ABS con salidas para escape doble. Comprueba versión de paragolpes.', '€€', null],
  ['body-aleron-techo', 'Alerón de techo Golf 7', 'Varios', 'carroceria', ['vw-golf-7-gti', 'vw-golf-7-r'], 'Estético en su mayoría; sujeta bien y sella los taladros.', '€€', null],
  ['body-paragolpes-r', 'Paragolpes delantero R look', 'Varios', 'carroceria', ['vw-golf-7-gti', 'vw-golf-6-gti'], 'Requiere pintura y traslado de sensores y rejillas.', '€€€', null],
  ['body-taloneras', 'Taloneras universales', 'Varios', 'carroceria', UNIVERSAL, 'Se recortan a medida. La calidad del ajuste depende de la instalación.', '€', null],
  ['body-splitter-universal', 'Splitter frontal universal', 'Varios', 'carroceria', UNIVERSAL, 'Vinilo rígido o ABS. Barato y reversible.', '€', null],
  ['body-aleron-gt', 'Alerón GT universal', 'Varios', 'carroceria', UNIVERSAL, 'Soporta más carga aerodinámica, pero añade peso y ruido.', '€€', null],
  ['body-rejillas', 'Rejillas y parrilla deportiva', 'Varios', 'carroceria', ['vw-golf-7-gti', 'ford-focus-st-mk3', 'bmw-335i-f30'], 'Cambio de estética y algo de flujo. Verifica sensores y radar.', '€€', null],
  ['body-embellecedor-escape', 'Embellecedor de salida de escape', 'Varios', 'carroceria', UNIVERSAL, 'Detalle barato que cambia la trasera. Sujeción con tornillos.', '€', null],
  ['body-faldones-focus', 'Faldones laterales Focus ST', 'Varios', 'carroceria', ['ford-focus-st-mk3'], 'Pieza específica con ajuste al paragolpes original.', '€€', null],
  ['body-cubrecarter', 'Cubrecarter de aluminio', 'Varios', 'carroceria', UNIVERSAL, 'Protege el cárter en coches bajados. Comprueba tornillería y drenajes.', '€€', null],

  // ---------- LLANTAS ----------
  ['wheel-oz-ultraleggera', 'OZ Racing Ultraleggera 18"', 'OZ Racing', 'llantas', ['vw-golf-7-gti', 'audi-s3-8v', 'seat-leon-5f-cupra'], 'Ligera y resistente, el clásico de los track days. Verifica ET y tornillería.', '€€€', 'oz'],
  ['wheel-oz-superturismo', 'OZ Superturismo GT', 'OZ Racing', 'llantas', ['vw-golf-7-gti', 'fiat-500-abarth'], 'Estética de competición con buen compromiso de peso.', '€€€', 'oz'],
  ['wheel-bbs-chr', 'BBS CH-R 19"', 'BBS', 'llantas', ['vw-golf-7-r', 'audi-s3-8v', 'bmw-335i-f30'], 'Forjada de referencia. Comprueba buje y centraje antes de pedir.', '€€€', 'bbs'],
  ['wheel-bbs-cir', 'BBS CI-R', 'BBS', 'llantas', ['bmw-m135i-f20', 'bmw-335i-f30'], 'Diseño de radios finos, muy ligera en medida 19".', '€€€', 'bbs'],
  ['wheel-ronal-r62', 'Ronal R62', 'Ronal', 'llantas', ['vw-golf-7-gti', 'skoda-octavia-5e-rs'], 'Fabricante de equipo original: buen equilibrio precio/resistencia.', '€€', 'ronal'],
  ['wheel-sparco-assetto', 'Sparco Assetto Gara', 'Sparco', 'llantas', ['vw-polo-6c-gti', 'ford-fiesta-st-mk7'], 'Ligera y económica para medidas pequeñas.', '€€', 'sparco'],
  ['wheel-replica-18', 'Llanta réplica 18" estilo GTI', 'Varios', 'llantas', ['vw-golf-7-gti', 'vw-golf-6-gti'], 'Precio bajo; revisa carga admisible y homologación.', '€€', null],
  ['wheel-19-golf-r', 'Llanta 19" estilo Golf R', 'Varios', 'llantas', ['vw-golf-7-r', 'audi-s3-8v'], 'Neumático más caro y perfil más bajo: menos confort.', '€€', null],
  ['wheel-tuercas', 'Tuercas antirrobo', 'Varios', 'llantas', UNIVERSAL, 'Barato y útil. Guarda la llave en un sitio que no sea la guantera.', '€', null],
  ['wheel-separadores', 'Separadores de rueda 20 mm', 'Varios', 'llantas', ['vw-golf-7-gti', 'bmw-335i-f30'], 'Cambian la vía y pueden afectar a la ITV. Usa tornillos de la longitud correcta.', '€€', null],

  // ---------- ESPEJOS ----------
  ['mirror-m-style', 'Espejos M style BMW F30', 'Varios', 'espejos', ['bmw-335i-f30', 'bmw-m135i-f20'], 'Carcasa completa o tapas. Comprueba si tu coche lleva cámara o sensor.', '€€', null],
  ['mirror-carbono-golf', 'Tapas de espejo carbono Golf 7', 'Varios', 'espejos', ['vw-golf-7-gti', 'vw-golf-7-r'], 'Adhesivo o recambio directo. El acabado varía mucho de precio.', '€€', null],
  ['mirror-dinamico-golf', 'Intermitente dinámico de espejo Golf 7', 'Varios', 'espejos', ['vw-golf-7-gti', 'vw-golf-7-r'], 'Secuencial en lugar del fijo. Comprueba conectores.', '€€', null],
  ['mirror-cristal-asferico', 'Cristal asférico calefactable', 'Varios', 'espejos', UNIVERSAL, 'Amplía el campo de visión y reduce el ángulo muerto.', '€€', null],
  ['mirror-focus-st', 'Carcasa de espejo Focus ST', 'Varios', 'espejos', ['ford-focus-st-mk3'], 'Repuesto o cambio estético con la misma fijación.', '€€', null],
  ['mirror-a3-carbono', 'Tapas de espejo Audi A3 8V', 'Varios', 'espejos', ['audi-a3-8v', 'audi-s3-8v'], 'Acabado tipo carbono o aluminio cepillado.', '€€', null],
  ['mirror-universal', 'Espejo retrovisor universal', 'Varios', 'espejos', UNIVERSAL, 'Para remolque o sustitución. Verifica homologación.', '€', null],
  ['mirror-kit-reparacion', 'Kit de reparación de espejo', 'Varios', 'espejos', UNIVERSAL, 'Mecanismo plegable y motor. Más barato que el espejo completo.', '€€', null],

  // ---------- SUSPENSIÓN ----------
  ['susp-kw-v2', 'KW Variante 2', 'KW Suspensions', 'suspension', ['vw-golf-7-gti', 'audi-s3-8v'], 'Altura y rebote ajustables. Homologación disponible según referencia.', '€€€', 'kw'],
  ['susp-kw-v3', 'KW Variante 3', 'KW Suspensions', 'suspension', ['vw-golf-7-r', 'bmw-m135i-f20'], 'Añade ajuste de compresión. Para uso mixto calle/circuito.', '€€€', 'kw'],
  ['susp-bilstein-b14', 'Bilstein B14', 'Bilstein', 'suspension', ['vw-golf-7-gti', 'seat-leon-5f-cupra'], 'Altura ajustable con amortiguación fija bien calibrada.', '€€€', 'bilstein'],
  ['susp-bilstein-b16', 'Bilstein B16', 'Bilstein', 'suspension', ['vw-golf-7-r', 'audi-s3-8v'], 'Dureza y altura regulables con calidad de fabricante.', '€€€', 'bilstein'],
  ['susp-eibach-pro-street', 'Eibach Pro-Street', 'Eibach', 'suspension', ['vw-golf-6-gti', 'audi-a3-8v'], 'Rosca de acero inoxidable con ajuste sencillo.', '€€€', 'eibach'],
  ['susp-hr-cup', 'H&R Cup Kit', 'H&R', 'suspension', ['vw-golf-5-gti', 'bmw-335i-f30'], 'Muelle y amortiguador combinados para bajar sin perder uso diario.', '€€€', 'hr'],
  ['susp-st-x', 'ST X coilover', 'ST Suspensions', 'suspension', ['vw-golf-7-gti', 'ford-focus-st-mk3'], 'Gama de entrada del grupo KW con garantía y ajuste de altura.', '€€', 'stsusp'],
  ['susp-eibach-pro-kit', 'Muelles Eibach Pro-Kit', 'Eibach', 'suspension', ['vw-golf-7-gti', 'skoda-octavia-5e-rs'], 'Bajada moderada manteniendo amortiguadores de serie.', '€€', 'eibach'],
  ['susp-barras', 'Barras estabilizadoras', 'Varios', 'suspension', ['vw-golf-7-gti', 'bmw-335i-f30'], 'Ajustan el equilibrio del chasis. Montaje con silentblocks nuevos.', '€€', null],
  ['susp-silentblocks', 'Kit de silentblocks de suspensión', 'Varios', 'suspension', UNIVERSAL, 'Reemplaza gomas viejas antes de culpar a los amortiguadores.', '€€', null],

  // ---------- FRENOS ----------
  ['brake-brembo-gt', 'Brembo GT 4 pistones', 'Brembo', 'frenos', ['vw-golf-7-gti', 'audi-s3-8v'], 'Kit completo con pinza, disco y latiguillo. Requiere llanta compatible.', '€€€', 'brembo'],
  ['brake-discos-rayados', 'Discos Brembo rayados', 'Brembo', 'frenos', ['vw-golf-7-r', 'seat-leon-5f-cupra'], 'Sustitución directa. Monta pastillas acordes al uso.', '€€', 'brembo'],
  ['brake-ebc-yellow', 'Pastillas EBC Yellowstuff', 'EBC Brakes', 'frenos', ['ford-focus-st-mk3', 'vw-golf-7-gti'], 'Buen mordiente en caliente con uso en calle. Más polvo de freno.', '€€', 'ebc'],
  ['brake-ferodo-ds2500', 'Pastillas Ferodo DS2500', 'Ferodo', 'frenos', ['renault-megane-4-rs', 'peugeot-308-gti'], 'Compuesto de competición suave para uso mixto.', '€€', 'ferodo'],
  ['brake-tarox-g88', 'Discos Tarox G88', 'Tarox', 'frenos', ['bmw-m135i-f20', 'alfa-giulietta-qv'], 'Rayado profundo y tratamiento térmico. Ruido en frío es normal.', '€€€', 'tarox'],
  ['brake-dot51', 'Líquido de frenos DOT 5.1', 'Varios', 'frenos', UNIVERSAL, 'Cambio barato que evita el fading por líquido viejo.', '€', null],
  ['brake-latiguillos', 'Latiguillos metálicos', 'Varios', 'frenos', ['vw-golf-7-gti', 'ford-focus-st-mk3'], 'Pedal más firme. Deben estar homologados para ITV.', '€€', null],
  ['brake-pastillas-traseras', 'Pastillas traseras', 'Varios', 'frenos', ['bmw-320d-f30', 'audi-a3-8v'], 'Cambia siempre por eje y revisa el freno de mano eléctrico.', '€€', null],
  ['brake-kit-6p', 'Kit de pinzas 6 pistones universal', 'Varios', 'frenos', UNIVERSAL, 'Proyecto serio: requiere adaptadores, disco y cálculo de reparto.', '€€€', null],
  ['brake-discos-perforados', 'Discos perforados Golf R', 'Varios', 'frenos', ['vw-golf-7-r', 'audi-s3-8v'], 'Más ventilación con riesgo de grietas si se abusa en circuito.', '€€', null],

  // ---------- ELECTRÓNICA ----------
  ['elec-racechip', 'RaceChip GTS', 'RaceChip', 'electronica', ['vw-golf-7-gti', 'bmw-320d-f30', 'ford-focus-st-mk3'], 'Centralita adicional: se conecta entre sensores y no toca el archivo original. Menos margen que una repro real.', '€€€', null],
  ['elec-pedalbox', 'Pedal Box', 'Varios', 'electronica', UNIVERSAL, 'Cambia la curva del acelerador, no la potencia. Sensación más viva.', '€€', null],
  ['elec-elm327', 'Interfaz OBD2 ELM327', 'Varios', 'electronica', UNIVERSAL, 'Para leer y borrar códigos y registrar parámetros. Compra versión con chip decente.', '€', null],
  ['elec-carly', 'Adaptador Carly', 'Varios', 'electronica', ['bmw-335i-f30', 'audi-a3-8v', 'vw-golf-7-gti'], 'Diagnosis por app con codificación y lectura de módulos.', '€€', null],
  ['elec-wideband', 'Sonda wideband AFR', 'Bosch', 'electronica', UNIVERSAL, 'Imprescindible para calibrar con seguridad en Stage 3.', '€€', 'bosch'],
  ['elec-boost-gauge', 'Manómetro de presión digital', 'Varios', 'electronica', UNIVERSAL, 'Verifica la presión real frente a la del mapa.', '€€', null],
  ['elec-datalogger', 'Datalogger CAN', 'Varios', 'electronica', UNIVERSAL, 'Registra RPM, presión y temperatura para comparar tiradas.', '€€', null],
  ['elec-sensor-iat', 'Sensor de temperatura de admisión', 'Bosch', 'electronica', ['vw-golf-7-gti', 'bmw-335i-f30'], 'Permite ver si el intercooler está haciendo su trabajo.', '€', 'bosch']
];

// Fotos propias por pieza (scripts/fetch-part-photos.mjs). Si una pieza no tiene
// foto propia se usa la de su categoría, para que nunca quede un hueco.
let ownPhotos = {};
if (fs.existsSync('data/recambios-images.json')) {
  ownPhotos = JSON.parse(fs.readFileSync('data/recambios-images.json', 'utf8')).images || {};
}
const photoFor = (id, category) =>
  ownPhotos[id]?.path || `/img/products/${CATEGORIES.find(c => c[0] === category)[2]}`;
// De dónde sale la foto de cada ficha, para poder decirlo en la tarjeta:
//  - 'referencia': foto propia de esa pieza (Wikimedia Commons, libre).
//  - 'categoria' : Commons no tiene foto libre de esa pieza concreta, se usa la de su categoría.
//  - 'tienda'    : la del vendedor (catálogo de tienda).
const photoKindFor = (id, category) => ownPhotos[id] ? 'referencia' : 'categoria';

const slug = s =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const searchLinks = (name, brand) => {
  const addBrand = brand && brand !== 'Varios' && !name.toLowerCase().includes(brand.toLowerCase());
  const q = `${addBrand ? brand + ' ' : ''}${name}`.trim();
  // Cuatro tiendas reales buscando la pieza por su nombre completo (marca incluida),
  // para que el enlace lleve a fichas del producto y no a una portada.
  const links = [
    { shop: 'Amazon', label: 'Buscar en Amazon', url: `https://www.amazon.es/s?k=${encodeURIComponent(q)}` },
    { shop: 'eBay', label: 'Buscar en eBay', url: `https://www.ebay.es/sch/i.html?_nkw=${encodeURIComponent(q)}` },
    { shop: 'AliExpress', label: 'Buscar en AliExpress', url: `https://es.aliexpress.com/w/wholesale-${encodeURIComponent(slug(q))}.html` },
    { shop: 'Temu', label: 'Buscar en Temu', url: `https://www.temu.com/search_result.html?search_key=${encodeURIComponent(q)}` }
  ];
  return { links, query: q };
};

const items = ITEMS.map(([id, name, brand, category, cars, note, price, shopKey]) => {
  const { links, query } = searchLinks(name, brand);
  if (shopKey && SHOPS[shopKey]) {
    const [shopName, url] = SHOPS[shopKey];
    links.push({ shop: shopName, label: `Web oficial de ${shopName}`, url });
  }
  return {
    id,
    name,
    brand,
    category,
    cars,
    fitment: cars.map(c => c === 'universal' ? 'Universal / varios modelos' : CAR_LABEL[c]).filter(Boolean),
    note,
    price,
    query,
    image: photoFor(id, category),
    photoKind: photoKindFor(id, category),
    photoCredit: ownPhotos[id] ? { author: ownPhotos[id].artist, license: ownPhotos[id].license, source: ownPhotos[id].page } : null,
    links
  };
});

// Piezas de tuning que ya estaban en el catálogo de tienda (data/products.json).
// Se incorporan al mismo listado para que no se pierda nada de lo que había.
const SHOP_CATEGORY_MAP = {
  'admision': 'admision', 'admisión': 'admision',
  'escape': 'escape',
  'intercooler': 'intercooler',
  'suspension': 'suspension', 'suspensión': 'suspension',
  'muelles': 'suspension',
  'frenos': 'frenos',
  'bujias': 'electronica', 'bujías': 'electronica',
  'iluminacion': 'bombillas-led', 'iluminación': 'bombillas-led',
  'llantas': 'llantas',
  'volante': 'interior',
  'aceites': 'lubricantes',
  'transmision': 'transmision', 'transmisión': 'transmision'
};

let shopItems = [];
if (fs.existsSync('data/products.json')) {
  const shopCatalog = JSON.parse(fs.readFileSync('data/products.json', 'utf8'));
  shopItems = (Array.isArray(shopCatalog) ? shopCatalog : shopCatalog.productos || [])
    .filter(p => String(p.category || '').toLowerCase() === 'tuning')
    .map(p => {
      const sub = String(p.subcategory || '').trim();
      const category = SHOP_CATEGORY_MAP[sub.toLowerCase()] || 'carroceria';
      const url = String(p.affiliateUrl || '');
      const links = /^https?:\/\//i.test(url) ? [{ shop: 'Amazon', label: 'Ver en Amazon', url }] : [];
      const photoKind = 'tienda';
      return {
        id: `tienda-${p.id}`,
        name: p.name,
        brand: p.manufacturer || 'Varios',
        category,
        cars: [],
        fitment: [`${sub || 'Tuning'} · revisa referencia y motor en la ficha`],
        note: p.description || 'Ficha verificada del vendedor.',
        price: p.price || '€€',
        query: p.name,
        source: 'tienda',
        image: p.image || `/img/products/${CATEGORIES.find(c => c[0] === category)[2]}`,
        photoKind,
        photoCredit: null,
        links
      };
    })
    .filter(i => i.links.length && i.image);
  items.push(...shopItems);
}

const byCat = Object.fromEntries(CATEGORIES.map(([id]) => [id, 0]));
items.forEach(i => { byCat[i.category] += 1; });

const out = {
  updated: '2026-10-26',
  disclaimer: 'Catálogo de referencia: los enlaces son búsquedas o fichas de tienda reales (Amazon para las piezas del catálogo de tienda), no una garantía de ajuste. Verifica referencia, homologación y compatibilidad con tu motor antes de comprar. Las piezas de preparación llevan una foto de referencia libre de esa pieza (Wikimedia Commons; autoría y licencia en data/recambios-images.json) o, cuando Commons no tiene ninguna de esa pieza concreta, la imagen de su categoría; cada tarjeta dice de dónde sale la suya. Ninguna foto representa el producto exacto: verifica referencia y acabado antes de comprar.',
  affiliate: {
    status: 'sin_cuenta',
    note: 'Los enlaces no llevan identificador de afiliado. Al dar de alta AliExpress Portals o Temu Affiliate, añade el parámetro de seguimiento en cada enlace desde data/tuning-products.json.'
  },
  categories: CATEGORIES.map(([id, name, image, blurb]) => ({ id, name, blurb, image: `/img/products/${image}` })),
  cars: CARS.map(([id, name, engine]) => ({ id, name, engine })),
  stats: {
    items: items.length,
    categories: CATEGORIES.length,
    cars: CARS.length,
    shopItems: shopItems.length,
    byCategory: byCat
  },
  items
};

fs.writeFileSync('data/tuning-products.json', JSON.stringify(out, null, 2));
console.log(`products.json -> ${items.length} piezas en ${CATEGORIES.length} categorías (${shopItems.length} del catálogo de tienda)`);
console.log(byCat);
