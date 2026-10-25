import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let productsData = [];

try {
    const productsPath = path.join(__dirname, 'data', 'products.json');

    if (fs.existsSync(productsPath)) {
        const parsed = JSON.parse(
            fs.readFileSync(productsPath, 'utf8')
        );
        productsData = Array.isArray(parsed) ? parsed : (parsed.productos || []);
    }
} catch (error) {
    console.error("Error cargando products.json:", error);
}

function obtenerSystemPrompt() {
    return `Eres un Ingeniero Mecánico Experto
y especialista en Diagnóstico OBD-II Automotriz.

Analiza conjuntamente los síntomas, los códigos DTC, el vehículo,
el motor y las comprobaciones ya realizadas. Ofrece un diagnóstico
técnico razonado y verificable.

Reglas obligatorias:
- No inventes códigos DTC, averías, valores, pares de apriete, enlaces,
  productos ni compatibilidades.
- Un código DTC indica una anomalía registrada por la ECU; no demuestra
  que el componente mencionado esté averiado.
- Distingue entre posible, probable y confirmada.
- Si faltan datos, indícalo y solicita solo los imprescindibles.
- Prioriza comprobaciones antes de recomendar sustituir piezas.
- No recomiendes eliminar DPF, EGR ni catalizador para uso en carretera.
- Si existe riesgo para la seguridad, avísalo con claridad.
- Usa el contexto del vehículo solo si está identificado; no atribuyas
  especificaciones de otra versión.
- No generes informes de pago automáticamente.

Estructura la respuesta con estas secciones:
1. Síntomas observados y datos de partida.
2. Posibles causas (separando hipótesis de hechos).
3. Causas más probables, solo si hay fundamento.
4. Comprobaciones necesarias, en orden.
5. Herramientas que pueden ayudar.
6. Valores técnicos de referencia, solo si están documentados.
7. Riesgo de continuar circulando.
8. Posibles reparaciones.
9. Repuestos pertinentes, sin afirmar compatibilidad no verificada.
10. Documentación y tutoriales relacionados.

Usa lenguaje técnico pero fácil de entender. Si no hay fundamento para
una cifra o una compatibilidad, escribe "no verificado".`;
}

const norm = s => String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const GREETINGS = new Set([
    'hola', 'buenas', 'buenos dias', 'buenas tardes', 'buenas noches',
    'que tal', 'saludos', 'hola buenas', 'gracias', 'muchas gracias',
    'adios', 'hasta luego', 'ok', 'vale', 'si', 'no'
]);

// Texto normalizado de un producto: nombre, categoría, subcategoría, descripción y etiquetas.
function productText(p) {
    return norm(
        (p.name || '') + ' ' +
        (p.category || '') + ' ' +
        (p.subcategory || '') + ' ' +
        (p.description || '') + ' ' +
        (Array.isArray(p.tags) ? p.tags.join(' ') : '')
    );
}

function nameText(p) {
    return norm((p.name || '') + ' ' + (p.subcategory || ''));
}

const TYPE_GROUPS = {
    herramienta: 'herramienta',
    diagnostico: 'diagnostico',
    maquinaria: 'herramienta',
    accesorio: 'herramienta',
    repuesto: 'repuesto',
    tuning: 'repuesto',
    limpieza_quimico: 'limpieza_quimico'
};

function isOil(p) {
    if (p.productType !== 'limpieza_quimico') return false;
    const t = norm((p.name || '') + ' ' + (p.subcategory || '') + ' ' + (Array.isArray(p.tags) ? p.tags.join(' ') : ''));
    if (/freno|dot|aditivo|limpiador|protector|antifriccion|grasa|spray|teflon|wd-?40/.test(t)) return false;
    return /aceite|lubricante|motor oil/.test(t);
}

function groupFor(p) {
    if (p.productType === 'limpieza_quimico' && isOil(p)) return 'mantenimiento';
    return TYPE_GROUPS[p.productType] || 'herramienta';
}

function viscositySet(text) {
    return new Set([...norm(text).matchAll(/\b\d{1,2}w[\s-]?\d{1,2}\b/g)].map(m => m[0].replace(/[^0-9w]/g, '')));
}

function dotSet(text) {
    return new Set([...norm(text).matchAll(/\bdot\s?([345](?:\.\d)?)\b/g)].map(m => m[1]));
}

function hasAny(text, words) {
    return words.some(w => text.includes(w));
}

function fuelKind(text) {
    const t = norm(text);
    const gasoline = /\b(gasolina|gasolinas|petrol|gasoline|bujia|bujias)\b/.test(t);
    const diesel = /\b(diesel|gasoil|common rail|tdi|hdi|cdi|bluehdi)\b/.test(t);
    if (gasoline && diesel) return 'both';
    if (gasoline) return 'gasoline';
    if (diesel) return 'diesel';
    return 'unknown';
}

function productViscosities(p) {
    return viscositySet(productText(p));
}

const TOPIC_RULES = [
    {
        id: 'frenos',
        label: 'frenos',
        triggers: ['freno', 'frenos', 'frena', 'frenan', 'frenar', 'frenada', 'pastilla', 'pastillas', 'disco', 'discos', 'pinza', 'pinzas', 'alabeo', 'alabeado', 'c0035', 'pedal blando', 'chirrido al frenar', 'liquido de frenos', 'abs', 'dot 4', 'dot4', 'dot 5.1'],
        match: p => /freno|dot ?[345]|purgador|sangrado|reposicionador|comprobador.*freno/.test(productText(p)),
        types: ['herramienta', 'diagnostico', 'limpieza_quimico'],
        chemical: p => /liquido de frenos|dot ?[345]|limpiador.*freno|desengrasante.*freno/.test(productText(p)),
        spec: p => {
            if (p.productType !== 'limpieza_quimico') return true;
            const t = productText(p);
            // Limpiadores y grasas de frenos no llevan especificación DOT.
            if (!/liquido de frenos|\bdot\b/.test(t)) return true;
            const wanted = dotSet(currentQuery);
            const found = dotSet(t);
            if (wanted.size) return [...wanted].every(d => found.has(d));
            return found.has('4');
        },
        subgroups: [
            { q: /\b(abs|c0035)\b/, p: /\babs\b|osciloscop|multimetr|escaner|obd/ },
            { q: /\b(liquido|dot|pedal|purgar|sangrar)\b/, p: /liquido de frenos|\bdot\b|probador.*freno|comprobador.*freno/ },
            { q: /\b(pastilla|disco|chirrido|ruido)\b/, p: /^(?!.*(liquido|dot|probador|comprobador|humedad|termometro)).*(pastilla|disco|reposicionador|pistones|limpiador.*freno|desengrasante.*freno|herramienta.*freno)/ }
        ],
        groupLimits: { diagnostico: 1 },
        reason: 'Relacionado con la comprobación y el mantenimiento del sistema de frenos.'
    },
    {
        id: 'bateria_arranque',
        label: 'batería y arranque',
        triggers: ['bateria', 'baterias', 'arranc', 'arranque', 'no arranca', 'alternador', 'borne', 'bornes', 'descarga', 'descargada', 'voltaje', 'tension', 'motor de arranque', 'p0562', 'p0335', 'multimetro', 'voltimetro'],
        match: p => {
            const t = productText(p);
            if (/ a bateria/.test(' ' + t) && !/comprobador|multimetr|voltimetr|amperimetr/.test(t)) return false;
            return /bateria|borne|alternador|arranque|voltimetr|multimetr|amperimetr|comprobador.*carga|densimetro/.test(t);
        },
        types: ['herramienta', 'diagnostico'],
        reason: 'Útil para medir carga, continuidad y consumo antes de cambiar batería o alternador.'
    },
    {
        id: 'turbo_sobrealimentacion',
        label: 'turbo y sobrealimentación',
        triggers: ['turbo', 'p0299', 'p0234', 'intercooler', 'sobrealimentacion', 'n75', 'geometria variable', 'silbido turbo', 'falta de potencia'],
        match: p => /turbo|intercooler|sobrealiment|endoscop|camara.*inspecc|lampara.*inspecc|alicates.*(abrazadera|clic|manguito)|vacuometr|manometro.*vacio/.test(productText(p)),
        types: ['herramienta', 'diagnostico'],
        groupLimits: { diagnostico: 1 },
        reason: 'Sirve para inspeccionar admisión, manguitos, geometría y fugas; no confirma por sí solo un turbo averiado.'
    },
    {
        id: 'encendido_inyeccion_tirones',
        label: 'encendido e inyección',
        triggers: ['tiron', 'tirones', 'bujia', 'bujias', 'bobina', 'bobinas', 'inyector', 'inyectores', 'inyeccion', 'misfire', 'p0300', 'p0301', 'p0302', 'p0303', 'p0304', 'ralenti inestable', 'cabeceo'],
        match: p => /bujia|inyector|inyeccion|osciloscop|compresimetr|estetoscop|manometro.*presion|probador.*inyeccion|multimetr/.test(productText(p)),
        types: ['herramienta', 'diagnostico', 'limpieza_quimico'],
        chemical: p => /limpiador.*inyect|limpia inyect|inyectores/.test(productText(p)) && !/turbo/.test(productText(p)),
        subgroups: [
            { q: /\b(bujia|bujias|bobina|bobinas|chispa|misfire|p030)\b/, p: /bujia|bobina|chispa|osciloscop|multimetr|escaner|obd/ },
            { q: /\b(inyector|inyectores|inyeccion|p020|p026|ralenti)\b/, p: /inyect|compresimetr|estetoscop|multimetr|manometro.*presion/ },
            { q: /\b(compresion|p0300)\b/, p: /compresimetr|manometro/ }
        ],
        reason: 'Ayuda a medir compresión, presión, chispa y a limpiar inyección cuando el diagnóstico ya apunta a ese sistema.'
    },
    {
        id: 'humo_emisiones_escape',
        label: 'emisiones y escape',
        triggers: ['humo', 'gases', 'fap', 'dpf', 'egr', 'adblue', 'p0401', 'p0420', 'p2002', 'catalizador', 'sonda lambda', 'hollin', 'carbonilla', 'opacidad'],
        match: p => /\b(dpf|fap|egr|emisiones?|descarboniz\w*|particulas?|adblue|sonda lambda|catalizador|opacimetro)\b/.test(productText(p)),
        types: ['diagnostico', 'limpieza_quimico'],
        subgroups: [
            { q: /\begr\b/, p: /\begr\b/ },
            { q: /\b(dpf|fap)\b/, p: /\b(dpf|fap)\b/ },
            { q: /\badblue\b/, p: /\badblue\b/ }
        ],
        chemical: p => !isOil(p) && /\b(egr|dpf|fap|adblue|admision|descarboniz\w*)\b/.test(productText(p)) && !/inyect/.test(productText(p)),
        groupLimits: { diagnostico: 1 },
        reason: 'Relacionado con EGR, DPF/FAP o admisión; úsalo solo si el DTC y las pruebas lo justifican.'
    },
    {
        id: 'aceite_filtros',
        label: 'aceite y filtros',
        triggers: ['aceite', 'lubricante', 'filtro', 'filtros', 'filtro de aceite', 'filtro de aire', 'filtro de combustible', 'filtro de habitaculo', '5w30', '5w-30', '5w40', '5w-40', '10w40', '0w20', 'cambio de aceite', 'p0180', 'p0190'],
        match: p => {
            const t = productText(p);
            return isOil(p) || (/(^|\s)filtro/.test(t) && !/particula|dpf|fap/.test(t));
        },
        types: ['herramienta', 'diagnostico', 'limpieza_quimico'],
        chemical: p => isOil(p),
        spec: p => {
            // La viscosidad solo se exige al aceite, no a las llaves/embudos.
            if (!isOil(p)) return true;
            const wanted = viscositySet(currentQuery + ' ' + norm(context.engine || ''));
            const found = productViscosities(p);
            return wanted.size > 0 && [...wanted].every(v => found.has(v));
        },
        subgroups: [
            { q: /\b(filtro de aire|filtro aire)\b/, p: /filtro.*aire|aire.*filtro/, nameOnly: true },
            { q: /\b(filtro de combustible|filtro combustible)\b/, p: /filtro.*combustible|combustible.*filtro/, nameOnly: true },
            { q: /\b(filtro de habitaculo|filtro habitaculo)\b/, p: /habitaculo/, nameOnly: true },
            { q: /\b(filtro de aceite|filtro aceite)\b/, p: /filtro.*aceite|aceite.*filtro|llave.*filtro|extractor.*filtro/, nameOnly: true },
            { q: /\b(aceite|lubricante)\b/, p: /aceite|lubricante|filtro/, nameOnly: true }
        ],
        reason: 'Solo se recomienda si coincide la viscosidad indicada; falta verificar norma ACEA/OEM y capacidad.'
    },
    {
        id: 'temperatura_refrigeracion',
        label: 'refrigeración',
        triggers: ['temperatura', 'calienta', 'calentamiento', 'refrigerante', 'anticongelante', 'radiador', 'termostato', 'p0128', 'sobrecalienta'],
        match: p => /refrigerante|anticongelante|radiad|termometro|refractometr|manometro|manguito/.test(productText(p)),
        types: ['diagnostico', 'limpieza_quimico'],
        chemical: p => /refrigerante|anticongelante|radiador/.test(productText(p)),
        reason: 'Útil para medir temperatura o verificar el refrigerante; no sustituye la prueba de fugas ni del termostato.'
    },
    {
        id: 'suspension_direccion_vibracion',
        label: 'suspensión y dirección',
        triggers: ['suspension', 'amortiguador', 'amortiguadores', 'direccion', 'cremallera', 'rotula', 'rotulas', 'silentblock', 'silentblocks', 'muelle', 'muelles', 'copela', 'vibracion al rodar', 'clonk'],
        match: p => /suspension|amortiguador|rotula|muelle|direccion|silentblock|compresor.*muelle/.test(productText(p)),
        types: ['herramienta'],
        reason: 'Herramienta de desmontaje o comprobación; sustituir una pieza exige prueba de holguras y ruidos.'
    },
    {
        id: 'diagnostico_obd_general',
        label: 'diagnóstico OBD',
        triggers: ['obd', 'obd2', 'dtc', 'check engine', 'escaner', 'scanner', 'luz de motor', 'testigo motor', 'averia', 'diagnosis'],
        match: p => /obd|diagnosis|escaner|scanner|multimetr|osciloscop|estetoscop|compresimetr/.test(productText(p)),
        types: ['herramienta', 'diagnostico'],
        reason: 'Equipo de lectura o comprobación para confirmar el fallo antes de cambiar piezas.'
    }
];

let currentQuery = '';
let context = {};

function allowedByGlobalRules(p, rule, fullNorm) {
    if (p.productType === 'repuesto' || p.productType === 'tuning') {
        return Boolean(context.partConfirmed || context.confirmedPart);
    }
    if (p.productType === 'limpieza_quimico') {
        if (rule.chemical && !rule.chemical(p)) return false;
        if (/turbo/.test(fullNorm) && /limpia inyect|limpiador.*inyect|inyectores/.test(productText(p))) return false;
    }
    return true;
}

function compatibilityFor(p, rule) {
    if (p.productType === 'repuesto') {
        return 'No sustituir sin prueba directa (medición, DTC específico o desmontaje). Verifica referencia OEM, motor y año.';
    }
    if (groupFor(p) === 'mantenimiento') {
        const v = [...productViscosities(p)].join(', ');
        return `Viscosidad ${v || 'no indicada'}; verifica norma ACEA/OEM, capacidad y especificación del fabricante antes de comprar.`;
    }
    if (p.productType === 'limpieza_quimico' && /freno|dot/.test(productText(p))) {
        return 'Verifica la especificación DOT del vehículo; no mezclar DOT 4 con DOT 5 de silicona.';
    }
    if (rule.id === 'turbo_sobrealimentacion') {
        return 'Inspección y medición previas; un silbido o una pérdida de potencia no confirman por sí solos la avería del turbo.';
    }
    if (p.productType === 'limpieza_quimico') {
        return 'Comprueba que el producto es adecuado para ese sistema y sigue la dosificación del fabricante.';
    }
    return (p.compatibility && p.compatibility.note) || 'Herramienta universal; comprueba medidas y conexiones antes de comprar.';
}

function selectRecommendations(rule, fullNorm, productos) {
    const scored = [];
    for (const p of productos) {
        if (!rule.match(p)) continue;
        if (!rule.types.includes(p.productType)) continue;
        if (!allowedByGlobalRules(p, rule, fullNorm)) continue;
        if (rule.spec && !rule.spec(p)) continue;
        const qFuel = fuelKind(fullNorm);
        const pFuel = fuelKind(productText(p));
        if (qFuel === 'gasoline' && pFuel === 'diesel') continue;
        if (qFuel === 'diesel' && pFuel === 'gasoline') continue;
        if (rule.subgroups) {
            const active = rule.subgroups.filter(sg => sg.q.test(fullNorm));
            if (active.length && !active.some(sg => sg.p.test(sg.nameOnly ? nameText(p) : productText(p)))) continue;
        }
        const n = nameText(p);
        const t = productText(p);
        let score = 4;
        for (const w of rule.triggers) {
            if (n.includes(w)) score += 4;
            else if (t.includes(w)) score += 1;
        }
        if (p.linkStatus === 'verified') score += 10;
        if (p.imageStatus === 'verified') score += 2;
        scored.push({ p, score });
    }

    scored.sort((a, b) => b.score - a.score || String(a.p.name).localeCompare(String(b.p.name)));

    const limits = Object.assign({ herramienta: 2, diagnostico: 2, repuesto: 1, limpieza_quimico: 1, mantenimiento: 1 }, rule.groupLimits || {});
    const counts = { herramienta: 0, diagnostico: 0, repuesto: 0, limpieza_quimico: 0, mantenimiento: 0 };
    const chosen = [];
    const seenIds = new Set();
    const seenNames = new Set();

    for (const { p } of scored) {
        const group = groupFor(p);
        if (!limits[group] || counts[group] >= limits[group]) continue;
        const key = norm(p.name).replace(/[^a-z0-9]/g, '').slice(0, 55);
        if (seenIds.has(p.id) || (key && seenNames.has(key))) continue;
        seenIds.add(p.id);
        if (key) seenNames.add(key);
        counts[group]++;
        chosen.push({
            id: p.id,
            name: p.name,
            category: p.category,
            subcategory: p.subcategory,
            price: p.price || 'Consultar',
            image: p.image || null,
            imageStatus: p.imageStatus || 'missing',
            affiliateUrl: p.affiliateUrl || null,
            linkStatus: p.linkStatus || 'missing',
            productType: p.productType,
            group,
            reason: rule.reason,
            compatibilityNote: compatibilityFor(p, rule)
        });
        if (chosen.length >= 4) break;
    }
    return chosen;
}

function filtrarProductosRecomendados(consulta, ctx = {}) {
    if (!Array.isArray(productsData) || !productsData.length) {
        try {
            const productsPath = path.join(__dirname, 'data', 'products.json');
            if (fs.existsSync(productsPath)) {
                const parsed = JSON.parse(fs.readFileSync(productsPath, 'utf8'));
                productsData = Array.isArray(parsed) ? parsed : (parsed.productos || []);
            }
        } catch (e) {
            console.error('Error cargando products.json:', e);
        }
    }

    const productos = Array.isArray(productsData) ? productsData : (productsData.productos || []);
    if (!productos.length) return [];

    context = ctx || {};
    const fullText = [
        consulta,
        context.dtc,
        context.symptoms,
        context.engine,
        context.brand,
        context.model,
        context.vehicleSystems,
        context.vehicleInspection,
        context.vehicleLabel
    ].filter(Boolean).join(' ');

    const fullNorm = norm(fullText);
    currentQuery = fullNorm;
    const cleanQ = norm(consulta).replace(/[^a-z0-9\s]/g, '').trim();

    if ((GREETINGS.has(cleanQ) || cleanQ.length < 3) && !context.dtc && !context.symptoms) {
        return [];
    }

    const topics = TOPIC_RULES.filter(rule => rule.triggers.some(t => fullNorm.includes(t)));
    if (!topics.length && /[pcbu]\d{4}/i.test(fullNorm)) {
        topics.push(TOPIC_RULES.find(r => r.id === 'diagnostico_obd_general'));
    }

    for (const rule of topics) {
        const selected = selectRecommendations(rule, fullNorm, productos);
        if (selected.length) return selected;
    }

    return [];
}

export {
    obtenerSystemPrompt,
    filtrarProductosRecomendados
};
