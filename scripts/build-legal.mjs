/**
 * Genera las páginas legales como HTML estático en public/legal/.
 *
 * Los textos viven aquí y los datos del titular en data/legal.json, para que
 * rellenar nombre, NIF o correo sea editar un solo fichero.
 *
 * Uso: node scripts/build-legal.mjs
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const DATA = path.join(ROOT, 'data', 'legal.json');
const OUT = path.join(ROOT, 'public', 'legal');

const legal = JSON.parse(await fs.readFile(DATA, 'utf8'));
const missing = Object.entries(legal)
  .filter(([, value]) => typeof value === 'string' && value.startsWith('PENDIENTE'))
  .map(([key]) => key);

const site = legal.siteUrl.replace(/\/+$/, '');
const value = (key, fallback) => {
  const raw = String(legal[key] || '').trim();
  return raw && !raw.startsWith('PENDIENTE') ? raw : `<span class="pending">[${fallback}]</span>`;
};
const esc = text => String(text).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const updated = new Date(`${legal.updated}T12:00:00`).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });

const NAV = [
  ['aviso-legal', 'Aviso legal'],
  ['privacidad', 'Privacidad'],
  ['cookies', 'Cookies'],
  ['afiliacion', 'Afiliación'],
  ['terminos', 'Términos y compra']
];

const page = ({ slug, title, description, body }) => `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="theme-color" content="#08090b">
  <title>${esc(title)} · ${esc(legal.brand)}</title>
  <meta name="description" content="${esc(description)}">
  <link rel="canonical" href="${site}/legal/${slug}.html">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="${esc(legal.brand)}">
  <meta property="og:title" content="${esc(title)} · ${esc(legal.brand)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${site}/legal/${slug}.html">
  <meta property="og:locale" content="es_ES">
  <meta name="robots" content="index,follow">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/fonts/fonts.css">
  <link rel="stylesheet" href="/css/legal.css?v=20261108a">
</head>
<body>
  <a class="skip" href="#contenido">Saltar al contenido</a>
  <header class="legal-top">
    <a class="legal-brand" href="/">
      <span class="mark" aria-hidden="true"></span>
      <strong>${esc(legal.brand)}</strong>
    </a>
    <nav class="legal-nav" aria-label="Páginas legales">
      ${NAV.map(([id, label]) => `<a href="/legal/${id}.html"${id === slug ? ' aria-current="page"' : ''}>${label}</a>`).join('')}
    </nav>
  </header>
  <main id="contenido" class="legal-wrap">
    <p class="legal-kicker">Información legal</p>
    <h1>${esc(title)}</h1>
    <p class="legal-updated">Última actualización: ${updated}</p>
    ${body}
    <p class="legal-back"><a href="/">← Volver a ${esc(legal.brand)}</a></p>
  </main>
  <footer class="legal-foot">
    <p>© ${new Date().getFullYear()} ${esc(legal.brand)} · ${value('address', 'domicilio del titular')}</p>
    <nav aria-label="Enlaces legales del pie">
      ${NAV.map(([id, label]) => `<a href="/legal/${id}.html">${label}</a>`).join('')}
    </nav>
    <p class="legal-affiliate">Como Afiliado de Amazon, obtengo ingresos por las compras adscritas que cumplen los requisitos aplicables.</p>
  </footer>
  <script src="/js/consent.js?v=20261108a" defer></script>
</body>
</html>
`;

const aviso = page({
  slug: 'aviso-legal',
  title: 'Aviso legal',
  description: 'Datos identificativos del titular, condiciones de uso y responsabilidad de la plataforma.',
  body: `
<section>
  <h2>1. Datos identificativos del titular</h2>
  <p>En cumplimiento del artículo 10 de la Ley 34/2002, de Servicios de la Sociedad de la Información y de Comercio Electrónico (LSSI-CE), se informa:</p>
  <dl class="legal-data">
    <dt>Titular</dt><dd>${value('ownerName', 'nombre y apellidos o razón social')}</dd>
    <dt>NIF</dt><dd>${value('nif', 'NIF/NIE/CIF')}</dd>
    <dt>Domicilio</dt><dd>${value('address', 'dirección completa')}</dd>
    <dt>Correo electrónico</dt><dd>${value('email', 'correo de contacto')}</dd>
    ${legal.phone ? `<dt>Teléfono</dt><dd>${esc(legal.phone)}</dd>` : ''}
    <dt>Sitio web</dt><dd><a href="${site}">${esc(site.replace(/^https?:\/\//, ''))}</a></dd>
    <dt>Actividad</dt><dd>${esc(legal.activity)}</dd>
  </dl>
</section>

<section>
  <h2>2. Objeto</h2>
  <p>Este sitio web ofrece contenidos técnicos sobre diagnóstico, mantenimiento y reparación de automóviles, un catálogo de productos de terceros, un foro, herramientas de lectura OBD-II y un informe técnico de pago. La información tiene carácter divulgativo y <strong>no sustituye</strong> el manual del fabricante, la diagnosis oficial ni el criterio de un profesional colegiado.</p>
</section>

<section>
  <h2>3. Condiciones de uso</h2>
  <p>El acceso es gratuito salvo el informe técnico de pago. Al utilizar la web te comprometes a:</p>
  <ul>
    <li>No emplear los contenidos para fines ilícitos o contrarios a la buena fe.</li>
    <li>No intentar acceder a áreas restringidas, ni sobrecargar, ni interferir en el funcionamiento del servicio.</li>
    <li>No reproducir masivamente los contenidos sin autorización.</li>
    <li>Aportar datos veraces en el foro, el garaje y el formulario de contacto.</li>
  </ul>
</section>

<section>
  <h2>4. Propiedad intelectual e industrial</h2>
  <p>Los textos, guías, bases de datos, diseño, código y elementos gráficos propios son titularidad del titular del sitio o se usan con licencia. Las marcas, fotografías de producto y fichas de terceros pertenecen a sus respectivos titulares y se muestran con fines informativos y de enlace. Las fotografías de referencia procedentes de Wikimedia Commons conservan su licencia y autoría, indicada en la ficha correspondiente.</p>
  <p>No se autoriza la extracción automatizada masiva de contenidos sin permiso escrito.</p>
</section>

<section>
  <h2>5. Exactitud de los contenidos técnicos</h2>
  <p>Las fichas de averías, códigos DTC, pares de apriete, intervalos de mantenimiento y compatibilidades se elaboran a partir de fuentes técnicas y se revisan periódicamente, pero pueden contener errores o quedar desactualizadas. Cada ficha indica su nivel de confianza y sus fuentes. Antes de intervenir en un vehículo, verifica siempre la información con la documentación oficial del fabricante.</p>
  <p>Las reparaciones implican riesgo. El titular no responde de daños derivados de un uso incorrecto de la información, de la manipulación del vehículo sin medios ni formación adecuados, ni del incumplimiento de la normativa de seguridad o de homologación.</p>
</section>

<section>
  <h2>6. Enlaces a terceros y enlaces de afiliado</h2>
  <p>La web incluye enlaces a tiendas y servicios de terceros, algunos de ellos de afiliación. El titular no controla esos sitios ni responde de sus contenidos, precios, disponibilidad o políticas. Las condiciones de cada compra se rigen por las del vendedor correspondiente. Consulta la <a href="/legal/afiliacion.html">política de afiliación</a>.</p>
</section>

<section>
  <h2>7. Protección de datos y cookies</h2>
  <p>El tratamiento de datos personales se describe en la <a href="/legal/privacidad.html">política de privacidad</a> y el uso de cookies en la <a href="/legal/cookies.html">política de cookies</a>.</p>
</section>

<section>
  <h2>8. Legislación aplicable y resolución de conflictos</h2>
  <p>Este aviso se rige por la legislación española. Para cualquier controversia, las partes se someten a los juzgados y tribunales del domicilio del consumidor cuando este tenga la condición de consumidor, y a los del domicilio del titular en los demás casos.</p>
  <p>Los consumidores pueden acudir a la Junta Arbitral de Consumo o a la autoridad de consumo de su comunidad autónoma, y a la plataforma europea de resolución de litigios en línea.</p>
</section>`
});

const privacidad = page({
  slug: 'privacidad',
  title: 'Política de privacidad',
  description: 'Qué datos tratamos, para qué, con qué base jurídica, cuánto tiempo y cómo ejercer tus derechos.',
  body: `
<section>
  <h2>1. Responsable del tratamiento</h2>
  <dl class="legal-data">
    <dt>Responsable</dt><dd>${value('ownerName', 'nombre y apellidos o razón social')}</dd>
    <dt>NIF</dt><dd>${value('nif', 'NIF/NIE/CIF')}</dd>
    <dt>Domicilio</dt><dd>${value('address', 'dirección completa')}</dd>
    <dt>Contacto</dt><dd>${value('email', 'correo de contacto')}</dd>
  </dl>
  <p>No se ha designado delegado de protección de datos por no ser obligatorio para esta actividad. Para cualquier cuestión sobre privacidad, escribe al correo indicado.</p>
</section>

<section>
  <h2>2. Qué datos tratamos</h2>
  <ul>
    <li><strong>Contacto:</strong> nombre, correo electrónico y el mensaje que escribes.</li>
    <li><strong>Foro y garaje:</strong> nombre de usuario, correo, contraseña cifrada, vehículos guardados y fotos o documentos que decidas subir.</li>
    <li><strong>Asistente IA:</strong> el texto de tu consulta y, si adjuntas una foto, la imagen. No envíes datos personales de terceros ni documentación identificativa.</li>
    <li><strong>Informe técnico PRO:</strong> correo de entrega, matrícula o datos del vehículo que incluyas y los datos de la transacción. <strong>Los datos de tarjeta no pasan por este sitio</strong>: los trata directamente Stripe.</li>
    <li><strong>Datos técnicos:</strong> dirección IP, fecha y hora, navegador y páginas solicitadas, en los registros del servidor, para seguridad y diagnóstico de fallos.</li>
  </ul>
</section>

<section>
  <h2>3. Finalidades y bases jurídicas</h2>
  <table class="legal-table">
    <thead><tr><th>Finalidad</th><th>Base jurídica</th></tr></thead>
    <tbody>
      <tr><td>Responder a tu consulta de contacto</td><td>Consentimiento y medidas precontractuales (art. 6.1.a y b RGPD)</td></tr>
      <tr><td>Gestionar tu cuenta, el foro y el garaje</td><td>Ejecución del servicio solicitado (art. 6.1.b RGPD)</td></tr>
      <tr><td>Generar la respuesta del asistente IA</td><td>Consentimiento al enviar la consulta (art. 6.1.a RGPD)</td></tr>
      <tr><td>Vender y entregar el informe PRO y cumplir obligaciones fiscales</td><td>Ejecución del contrato y obligación legal (art. 6.1.b y c RGPD)</td></tr>
      <tr><td>Seguridad, prevención de abuso y registros técnicos</td><td>Interés legítimo (art. 6.1.f RGPD)</td></tr>
      <tr><td>Cookies no necesarias y vídeos incrustados</td><td>Consentimiento (art. 6.1.a RGPD y art. 22.2 LSSI)</td></tr>
    </tbody>
  </table>
  <p>No se elaboran perfiles publicitarios ni se toman decisiones automatizadas con efectos jurídicos sobre ti.</p>
</section>

<section>
  <h2>4. Cuánto tiempo conservamos los datos</h2>
  <ul>
    <li>Mensajes de contacto: el tiempo necesario para responder y, después, un máximo de 12 meses.</li>
    <li>Cuenta de foro y garaje: mientras la cuenta esté activa; si la borras, se eliminan sus datos salvo obligación legal.</li>
    <li>Consultas al asistente IA: no se almacenan como historial permanente; se procesan para generar la respuesta.</li>
    <li>Facturación del informe PRO: 6 años por obligación mercantil y fiscal (art. 30 Código de Comercio).</li>
    <li>Registros del servidor: 30 días, salvo investigación de un incidente de seguridad.</li>
  </ul>
</section>

<section>
  <h2>5. Destinatarios y encargados del tratamiento</h2>
  <p>No se venden datos personales. Para prestar el servicio se usan proveedores que actúan como encargados o responsables independientes:</p>
  <ul>
    <li><strong>Alojamiento web:</strong> ${value('hostingName', 'proveedor de alojamiento')}${legal.hostingAddress && !legal.hostingAddress.startsWith('PENDIENTE') ? ` (${esc(legal.hostingAddress)})` : ''}.</li>
    <li><strong>Asistente IA:</strong> ${esc(legal.aiProvider)}. El texto y las imágenes que envíes se procesan en sus servidores para devolver la respuesta.</li>
    <li><strong>Pagos:</strong> ${esc(legal.paymentProvider)}, que trata los datos de la tarjeta como responsable independiente.</li>
    <li><strong>Afiliación:</strong> Amazon Europe Core S.à r.l. y sociedades del grupo, cuando haces clic en un enlace de afiliado.</li>
    <li><strong>Autoridades:</strong> cuando exista una obligación legal.</li>
  </ul>
  <p>Algunos proveedores pueden tratar datos fuera del Espacio Económico Europeo. En tal caso se amparan en decisiones de adecuación (como el Marco de Privacidad de Datos UE-EE. UU.) o en cláusulas contractuales tipo aprobadas por la Comisión Europea.</p>
</section>

<section>
  <h2>6. Tus derechos</h2>
  <p>Puedes ejercer los derechos de acceso, rectificación, supresión, oposición, limitación del tratamiento, portabilidad y retirada del consentimiento escribiendo a ${value('email', 'correo de contacto')} e indicando el derecho que ejercitas. Responderemos en el plazo máximo de un mes.</p>
  <p>Si consideras que no se ha atendido correctamente, puedes reclamar ante la Agencia Española de Protección de Datos (www.aepd.es).</p>
</section>

<section>
  <h2>7. Seguridad</h2>
  <p>Se aplican medidas técnicas y organizativas razonables: conexión cifrada HTTPS, contraseñas almacenadas con función de derivación, cookies de sesión <em>HttpOnly</em>, control de accesos y copias de seguridad. Ningún sistema es infalible: si detectas un incidente, comunícalo de inmediato.</p>
</section>

<section>
  <h2>8. Menores</h2>
  <p>El registro en el foro está reservado a mayores de ${esc(legal.minAge)} años. Si eres menor de esa edad, necesitas la autorización de tu padre, madre o tutor legal.</p>
</section>

<section>
  <h2>9. Cambios en esta política</h2>
  <p>Esta política puede actualizarse para adaptarse a cambios normativos o del servicio. La fecha de la última revisión aparece al inicio de la página.</p>
</section>`
});

const cookies = page({
  slug: 'cookies',
  title: 'Política de cookies',
  description: 'Cookies y almacenamiento local que usa la web, para qué sirven y cómo aceptarlas, rechazarlas o eliminarlas.',
  body: `
<section>
  <h2>1. Qué son las cookies y el almacenamiento local</h2>
  <p>Una cookie es un pequeño archivo que el navegador guarda al visitar una web. El almacenamiento local (<em>localStorage</em>) cumple una función parecida, pero no se envía al servidor. Ambos permiten recordar tus preferencias y mantener la sesión iniciada.</p>
</section>

<section>
  <h2>2. Base legal</h2>
  <p>Las cookies estrictamente necesarias están exentas de consentimiento. Para el resto se aplica el artículo 22.2 de la LSSI-CE y la guía de la AEPD: <strong>no se instalan antes de que aceptes</strong>, y rechazarlas es tan fácil como aceptarlas.</p>
</section>

<section>
  <h2>3. Cookies y almacenamiento que usamos</h2>
  <table class="legal-table">
    <thead><tr><th>Nombre</th><th>Tipo</th><th>Finalidad</th><th>Duración</th></tr></thead>
    <tbody>
      <tr><td><code>dym_forum_session</code></td><td>Necesaria (propia)</td><td>Mantener tu sesión iniciada en el foro y el garaje. Es <em>HttpOnly</em> y no se usa para publicidad.</td><td>30 días</td></tr>
      <tr><td><code>dym_consent_v1</code></td><td>Necesaria (almacenamiento local)</td><td>Guardar tu decisión sobre cookies para no volver a preguntarte.</td><td>Hasta que la borres</td></tr>
      <tr><td><code>dym_tutorials_v1</code></td><td>Preferencias (almacenamiento local)</td><td>Recordar tus tutoriales favoritos y el historial de vistos en este dispositivo.</td><td>Hasta que la borres</td></tr>
      <tr><td>YouTube (<code>youtube-nocookie.com</code>)</td><td>Terceros, solo con consentimiento</td><td>Reproducir los vídeos de los tutoriales. Hasta que aceptes, el vídeo no se carga.</td><td>Según YouTube</td></tr>
      <tr><td>Amazon</td><td>Terceros, solo al pulsar un enlace</td><td>Atribuir la compra a la etiqueta de afiliado. Se instalan en el dominio de Amazon, no en este.</td><td>Según Amazon</td></tr>
      <tr><td>Stripe</td><td>Terceros, solo al pagar</td><td>Procesar el pago del informe técnico y prevenir el fraude.</td><td>Según Stripe</td></tr>
    </tbody>
  </table>
  <p>No usamos cookies publicitarias propias ni herramientas de analítica. Si en el futuro se añaden, aparecerán en esta tabla y solo se activarán con tu consentimiento.</p>
</section>

<section>
  <h2>4. Cómo aceptar, rechazar o cambiar tu decisión</h2>
  <p>La primera vez que entras verás un aviso con tres opciones: aceptar todas, aceptar solo las necesarias o configurar por categorías. Puedes cambiar tu elección en cualquier momento con este botón:</p>
  <p><button class="legal-btn" type="button" data-consent-open>Configurar cookies</button></p>
</section>

<section>
  <h2>5. Cómo eliminar las cookies de tu navegador</h2>
  <p>Puedes borrarlas o bloquearlas desde la configuración de privacidad de tu navegador:</p>
  <ul>
    <li><a href="https://support.mozilla.org/es/kb/borrar-cookies-y-datos-de-sitios-en-firefox" target="_blank" rel="noopener">Firefox</a></li>
    <li><a href="https://support.google.com/chrome/answer/95647?hl=es" target="_blank" rel="noopener">Chrome</a></li>
    <li><a href="https://support.microsoft.com/es-es/microsoft-edge/eliminar-las-cookies-en-microsoft-edge-168dab11-0753-043d-7c16-ede5947fc64d" target="_blank" rel="noopener">Edge</a></li>
    <li><a href="https://support.apple.com/es-es/guide/safari/sfri11471/mac" target="_blank" rel="noopener">Safari</a></li>
  </ul>
  <p>Si bloqueas las cookies necesarias, el inicio de sesión y el garaje dejarán de funcionar.</p>
</section>`
});

const afiliacion = page({
  slug: 'afiliacion',
  title: 'Política de afiliación',
  description: 'Cómo se financian los enlaces a tiendas, qué comisión recibimos y por qué el precio no cambia para ti.',
  body: `
<section class="legal-highlight">
  <p><strong>Como Afiliado de Amazon, obtengo ingresos por las compras adscritas que cumplen los requisitos aplicables.</strong></p>
  <p>La web participa en el Programa de Afiliados de Amazon.es y puede participar en programas similares de otras tiendas.</p>
</section>

<section>
  <h2>1. Qué significa para ti</h2>
  <ul>
    <li>Los enlaces marcados como «Ver oferta» pueden ser enlaces de afiliado.</li>
    <li>Si compras después de hacer clic, la tienda puede abonarnos una comisión.</li>
    <li><strong>El precio que pagas es el mismo</strong> que si entraras directamente en la tienda.</li>
    <li>La comisión no condiciona la selección: no cobramos por colocar un producto en una posición.</li>
  </ul>
</section>

<section>
  <h2>2. Precios y disponibilidad</h2>
  <p>Los importes que se muestran se consultan automáticamente en la tienda y llevan fecha. Pueden cambiar en cualquier momento, y la referencia válida es siempre la ficha del vendedor en el momento de la compra. No garantizamos stock, plazo de entrega ni condiciones del vendedor.</p>
</section>

<section>
  <h2>3. Cómo elegimos los productos</h2>
  <p>Las fichas se incorporan cuando se puede verificar el producto, su fotografía y su enlace. Cada ficha indica si la foto y el enlace están verificados y el grado de compatibilidad con un vehículo concreto. Cuando no hay datos suficientes, se indica expresamente en lugar de rellenarlo con una suposición.</p>
</section>

<section>
  <h2>4. Responsabilidad</h2>
  <p>La compra se formaliza con la tienda, no con esta web. Reclamaciones sobre envíos, devoluciones, garantías o facturas deben dirigirse al vendedor. Podemos ayudarte a localizar el producto, pero no somos parte del contrato de compraventa.</p>
</section>

<section>
  <h2>5. Otros programas</h2>
  <p>Si en el futuro se añaden enlaces de otros programas de afiliación, se identificarán del mismo modo y esta página se actualizará.</p>
</section>

<section>
  <h2>6. Contacto</h2>
  <p>Para cualquier duda sobre esta política, escribe a ${value('email', 'correo de contacto')}.</p>
</section>`
});

const terminos = page({
  slug: 'terminos',
  title: 'Términos de uso y condiciones de compra',
  description: 'Condiciones de uso de la plataforma, compra del informe técnico, pago, entrega y derecho de desistimiento.',
  body: `
<section>
  <h2>1. Objeto</h2>
  <p>Estas condiciones regulan el uso de ${esc(legal.brand)} y la compra del informe técnico digital. Al usar la web aceptas estas condiciones; si no estás de acuerdo, no utilices el servicio.</p>
</section>

<section>
  <h2>2. Uso de la plataforma</h2>
  <ul>
    <li>El acceso a guías, códigos DTC, catálogo y foro es gratuito.</li>
    <li>Debes usar la información de forma responsable y verificar los datos técnicos con la documentación del fabricante.</li>
    <li>No está permitido el scraping masivo, la reventa de contenidos ni el uso que dañe el servicio.</li>
  </ul>
</section>

<section>
  <h2>3. Cuenta de foro</h2>
  <p>Debes ser mayor de ${esc(legal.minAge)} años y proporcionar un correo válido. Eres responsable de mantener la confidencialidad de tu contraseña y de la actividad de tu cuenta. Podemos suspender cuentas que incumplan las normas de convivencia, publiquen contenido ilícito o suplanten a terceros.</p>
</section>

<section>
  <h2>4. Contenidos que publicas</h2>
  <p>Conservas la titularidad de tus textos y fotos. Al publicarlos autorizas a mostrarlos en la web y en los resultados de búsqueda interna, y declaras que tienes derecho a hacerlo. No publiques datos personales de terceros ni documentación identificativa. Puedes solicitar la retirada de tu contenido escribiendo a ${value('email', 'correo de contacto')}.</p>
</section>

<section>
  <h2>5. Informe técnico PRO</h2>
  <h3>Qué incluye</h3>
  <p>Un documento digital personalizado con el análisis del vehículo y del problema descritos, orientado a la diagnosis. Es un documento informativo: no es un presupuesto de reparación ni una garantía de resultado.</p>
  <h3>Precio y pago</h3>
  <p>El precio aplicable es el que se muestra en el momento de iniciar la compra, con los impuestos incluidos. El pago se procesa mediante ${esc(legal.paymentProvider)}; no almacenamos datos de tarjeta. La pasarela puede aplicar verificación reforzada (3-D Secure).</p>
  <h3>Entrega</h3>
  <p>La entrega es digital, en el correo indicado y/o mediante descarga, en cuanto se confirma el pago. Si en 24 horas no lo recibes, revisa la carpeta de spam y escríbenos.</p>
  <h3>Derecho de desistimiento</h3>
  <p>Al tratarse de contenido digital suministrado de forma inmediata, al iniciar la descarga aceptas la ejecución inmediata y reconoces que <strong>pierdes el derecho de desistimiento</strong>, conforme al artículo 103.m del Texto Refundido de la Ley General para la Defensa de los Consumidores y Usuarios. Si el documento no se ha generado o no se ha entregado, puedes solicitar la devolución.</p>
  <h3>Garantía de contenido</h3>
  <p>Si el informe contiene un error manifiesto o no se corresponde con los datos que aportaste, lo corregiremos sin coste o devolveremos el importe.</p>
</section>

<section>
  <h2>6. Responsabilidad</h2>
  <p>La información técnica se ofrece «tal cual», con indicación de sus fuentes y su nivel de confianza. No respondemos de daños indirectos, lucro cesante ni de los daños derivados de reparaciones realizadas sin medios o formación adecuados. Nada en estas condiciones limita los derechos que la ley reconoce a los consumidores.</p>
</section>

<section>
  <h2>7. Enlaces de afiliado</h2>
  <p>Algunos enlaces a tiendas son de afiliación. Consulta la <a href="/legal/afiliacion.html">política de afiliación</a>.</p>
</section>

<section>
  <h2>8. Ley aplicable y resolución de conflictos</h2>
  <p>Estas condiciones se rigen por la legislación española. Como consumidor, puedes acudir a los tribunales de tu domicilio y a la Junta Arbitral de Consumo. También existe la plataforma europea de resolución de litigios en línea.</p>
</section>`
});

const pages = { 'aviso-legal': aviso, privacidad, cookies, afiliacion, terminos };

await fs.mkdir(OUT, { recursive: true });
for (const [slug, html] of Object.entries(pages)) {
  await fs.writeFile(path.join(OUT, `${slug}.html`), html);
}

// robots.txt y sitemap.xml: ayudan a que las páginas legales se indexen.
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[['', '1.0'], ...NAV.map(([id]) => [`legal/${id}.html`, '0.4'])]
  .map(([loc, priority]) => `  <url>\n    <loc>${site}/${loc}</loc>\n    <lastmod>${legal.updated}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>${priority}</priority>\n  </url>`).join('\n')}
</urlset>
`;
await fs.writeFile(path.join(ROOT, 'public', 'sitemap.xml'), sitemap);
await fs.writeFile(path.join(ROOT, 'public', 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${site}/sitemap.xml\n`);

console.log(`Páginas legales generadas en public/legal: ${Object.keys(pages).join(', ')}`);
console.log('robots.txt y sitemap.xml actualizados.');
if (missing.length) {
  console.warn(`\nATENCIÓN: faltan datos del titular en data/legal.json → ${missing.join(', ')}`);
  console.warn('Mientras estén vacíos, las páginas muestran marcadores entre corchetes.');
}
