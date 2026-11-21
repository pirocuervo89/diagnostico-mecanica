# Etapa 1: pruebas obligatorias. Si alguna falla, la imagen no se construye y
# el despliegue (Render, Oracle o cualquier Docker) se cancela antes de publicar.
FROM node:22.23-slim AS test

ENV NODE_ENV=test
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# Chromium y sus librerías para la prueba móvil de la tienda.
RUN npx playwright install --with-deps chromium

COPY . .

# Una prueba a la vez: así también cabe en servidores pequeños (Oracle 1 GB).
RUN node --test --test-concurrency=1 tests/*.test.mjs

# Etapa 2: imagen de producción para Render (y cualquier host con Docker).
# Node 22.23 coincide con la versión usada en desarrollo y ya trae `node:sqlite`
# estable, que es lo que usan el foro y los tutoriales.
FROM node:22.23-slim AS production

ENV NODE_ENV=production
WORKDIR /app

# Dependencias primero: así el `npm ci` se cachea y solo se repite si cambian.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY . .

# Los datos de idioma del OCR están en .gitignore, así que en el contenedor no
# vienen del repositorio. Si faltan, se descargan las versiones ligeras para que
# el escaneo de documentos siga funcionando en el servidor.
RUN node --input-type=module -e "\
import fs from 'node:fs/promises';\
const dir = 'data/ocr';\
await fs.mkdir(dir, { recursive: true });\
for (const lang of ['spa', 'eng']) {\
  const target = dir + '/' + lang + '.traineddata';\
  try { await fs.access(target); console.log('OCR ya presente:', lang); continue; } catch {}\
  const url = 'https://github.com/tesseract-ocr/tessdata_fast/raw/main/' + lang + '.traineddata';\
  const res = await fetch(url);\
  if (!res.ok) throw new Error('No se pudo descargar ' + lang + ': ' + res.status);\
  await fs.writeFile(target, Buffer.from(await res.arrayBuffer()));\
  console.log('OCR descargado:', lang);\
}"

# Render inyecta PORT; server.js escucha en 0.0.0.0.
ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
