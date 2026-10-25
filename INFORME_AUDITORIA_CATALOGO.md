# Auditoría del catálogo — Diagnóstico Mecánica

Fecha de auditoría: **23/10/2026**  
Fuente: `data/products.json`, `public/img/productos/` y comprobación HTTP de los enlaces de Amazon.es.  
Informe máquina: `data/auditoria-catalogo.json`.

## Resultado ejecutivo

| Métrica | Resultado |
|---|---:|
| Registros originales | 242 |
| Duplicados consolidados en la auditoría previa | 7 |
| Productos activos | 235 |
| Duplicados restantes por ID, nombre o ASIN | 0 |
| Productos con foto local verificada | 235 |
| Productos con enlace verificado | 235 |
| Enlaces con HTTP 200 y título coincidente | 235/235 (100 %) |
| Imágenes activas presentes en disco | 235/235 |
| Imágenes activas válidas como JPEG | 235/235 |
| Productos con referencia OEM/modelo/año verificable | 0 |
| Marcas placeholder | 94 |

Las 199 fichas que estaban pendientes se completaron con el listado real de Amazon.es. No se inventaron fotos, enlaces, precios ni compatibilidades: la foto es la imagen principal del anuncio y el enlace apunta al ASIN comprobado.

## Verificación masiva de las 199 fichas pendientes

- 199/199 páginas de producto respondieron HTTP 200.
- 199/199 ASIN son distintos entre sí y distintos de los 36 ya verificados.
- 199/199 fichas incorporan `asin`, `affiliateUrl`, `listingTitle`, `image`, `imageSource`, `imageStatus: verified`, `linkStatus: verified`, `seller: Amazon.es`, `verifiedAt` y `verificationScore: 100`.
- 199/199 imágenes se descargaron en local desde la imagen principal del anuncio y se validaron como JPEG.
- Cuando el nombre o el fabricante del listado difería del dato interno, se normalizó la ficha y se conservó el valor anterior en `legacyName`, `legacyManufacturer` o `legacyCategory`.
- Se conservaron 99 nombres originales, 85 fabricantes originales y 1 categoría original como campos `legacy*`.
- `estacion-fap-pro` se reclasificó de Herramientas a **Líquidos y Químicos**, con subcategoría `Limpieza DPF/FAP`.
- Se resolvieron dos ASIN repetidos con fichas ya verificadas: `pro-add-6` pasó a `B07PBZQMSW` y `pro-muelles` a `B0HLFST33W`.
- El único producto sin resultados iniciales (`liq-atf-dsg`) se cerró con `B00KYL5YSI`, aceite DSG original VW.
- `liq-wynns-octane` se sustituyó por un listado real de Motul para no atribuir a Wynn's un producto que no lo era.
- `pro-mal-1` se sustituyó por la bolsa Facom BS.T20CM1PG con 27 herramientas, en lugar de una maleta vacía.
- Navegador real: 235 tarjetas renderizadas, 235/235 imágenes cargadas y 0 errores de consola.

## Duplicados consolidados previamente

Se conservó la ficha con más información verificable y se retiró la repetida. Los originales permanecen en la copia previa a la auditoría.

| Retirado | Motivo |
|---|---|
| `maletin-108-eco` | Nombre duplicado; se conserva la ficha `man-108`. |
| `fac-nano` | Mismo ASIN (`B00M2IDYBA`) y producto que `maletin-facom-pro`. |
| `dina-digi` | Nombre y descripción duplicados de `dinamometrica-digital-pro`. |
| `pro-add-2` | Nombre duplicado de `pro-calado`. |
| `diag-eco-47` | Nombre duplicado de `diag-eco-21`. |
| `liq-castrol-5w30` | Mismo ASIN (`B0C813MMJ4`) y producto que `castrol-5w30-5l`. |
| `liq-liquimoly-egr` | Mismo ASIN (`B0054Z8DFK`) y producto que `liqui-moly-egr`. |

Las tres imágenes de las fichas verificadas retiradas (`fac-nano.jpg`, `liq-castrol-5w30.jpg`, `liq-liquimoly-egr.jpg`) siguen en disco como archivos huérfanos. No se borraron para no destruir material original.

## Imágenes

- 235 imágenes activas, todas locales en `public/img/productos/` y todas presentes en disco.
- 235/235 son JPEG válidos; ninguna baja de 300 px en su lado mayor.
- 0 hashes duplicados entre imágenes activas.
- 238 archivos en el directorio: 235 activos y 3 huérfanos de la consolidación anterior.
- No se usaron imágenes genéricas ni imágenes de otro producto para rellenar huecos.
- Tamaño del directorio de imágenes: aproximadamente 27 MB.

## Enlaces y destino

- 235 productos activos con `imageStatus: verified` y `linkStatus: verified`.
- 235/235 ASIN coinciden con la estructura `/dp/<ASIN>` del enlace guardado.
- 235/235 enlaces respondieron HTTP 200 en la comprobación del 23/10/2026.
- 235/235 títulos obtenidos de Amazon coinciden con el `listingTitle` almacenado tras normalizar mayúsculas, acentos y puntuación (100 %).
- Los precios de listado no se fijaron: Amazon devuelve precio dinámico; `listingPrice` está vacío en las 235 fichas. El catálogo muestra “Consultar”, no una cifra inventada.
- La comprobación acredita destino y título en la fecha indicada; no garantiza stock, precio ni disponibilidad futura.

## Calidad e integridad

- 235 IDs únicos, 235 nombres únicos y 235 ASIN únicos.
- Descripción, fabricante, categoría, subcategoría y precio presentes en el 100 % de las fichas.
- 94 fichas usan marcas placeholder: 54 “Genérico”, 31 “Línea Económica”, 6 “Profesional” y 3 etiquetas técnicas. No deben presentarse como marcas verificadas.
- 223 fichas no tienen etiquetas; no impide la búsqueda, pero reduce la clasificación fina.
- 147 fichas son universales, 86 requieren verificación manual y 2 son específicas de vehículo.
- Ninguna ficha contiene una lista verificable de referencia OEM, motor, año o modelo compatible. Por tanto, la compatibilidad verificable real es **0**.
- Distribución por tipo: 96 herramientas, 48 diagnosis, 87 líquidos/químicos, 2 maquinaria y 2 repuestos.
- Distribución por categoría: 96 Herramientas, 48 Diagnosis, 87 Líquidos y Químicos, 2 Maquinaria y 2 Repuestos.

## Copias de seguridad

- Catálogo previo a la verificación masiva: `backups/catalogo-pre-verificacion-amazon-20261023-000211.json`
  - SHA256: `af46439c37ae22f5a85aed5201933b6e43c2d5429893d97ef471212ab4b33da0`
- Catálogo previo a la auditoría anterior: `backups/catalogo-pre-auditoria-20261022-220728.json`
  - SHA256: `a36813124a8d8c281f892ecf979552b1fdf0815364f8df4ca36fea2acd8090fc`
- Proyecto previo al rediseño: `backups/pre-redesign-20261022-213226.tar.gz`
  - SHA256: `9e68fa3b75f7ca303ace1b8e578f835d240b15bca1eea2c51f4a2f53b8359316`

## Limitaciones de esta auditoría

- No se pudo validar compatibilidad real por vehículo: el catálogo no contiene referencias OEM ni tablas de aplicación.
- No se pudieron verificar precios, stock ni disponibilidad en tiempo real.
- La verificación acredita el anuncio y su imagen principal en la fecha indicada; no certifica que el vendedor mantenga la misma variante en el futuro.
- La misión `avance 2` está truncada; este informe cubre la sección 10 hasta el punto disponible del documento.
