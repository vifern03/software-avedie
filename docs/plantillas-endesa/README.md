# Plantillas originales Endesa — Contrato B2B (3.0TD / 6.1TD)

Copia de referencia de los `.docx` oficiales de Endesa. Los ficheros
`*-ejemplo-original.docx` de aquí son **solo consulta** (para comparar si
Endesa cambia el clausulado); las plantillas realmente usadas por la app,
con las etiquetas de `docxtemplater` ya insertadas en los mismos huecos,
viven en `public/templates/`:

- `public/templates/contrato-endesa-fijo.docx`
- `public/templates/contrato-endesa-indexado.docx`

El generador (`src/components/ContratoB2BModal.jsx`) carga el `.docx`
correspondiente según el producto contratado, inyecta los datos del
formulario en las etiquetas (`{razon_social}`, `{cups}`, `{p1}`, etc.) con
`docxtemplater` + `pizzip`, y descarga el resultado como `.docx` real — el
documento oficial de Endesa relleno, no una réplica visual.

Confirmado comparando línea a línea ambos ejemplos: las 15 Condiciones
Generales + Protección de Datos son texto idéntico en fijo e indexado; solo
difieren en los datos del cliente de ejemplo. Las condiciones económicas
(precio fijo vs. indexado a OMIE) no forman parte de este generador — Endesa
las gestiona aparte en la "hoja anexa al contrato".

## Si Endesa cambia la plantilla en el futuro

1. Guarda el `.docx` nuevo aquí como `*-ejemplo-original.docx` (referencia).
2. Vuelve a insertar las etiquetas en los mismos huecos (ver la lista de
   tags en `ContratoB2BModal.jsx`) y guarda el resultado en
   `public/templates/`. No hay script automático de re-etiquetado — se hizo
   a mano localizando cada campo por posición en el XML del `.docx`
   (`word/document.xml`, dentro del zip).

## Ficheros de ejemplo originales (sin etiquetar, solo consulta)

- `Contrato-energia-endesa-fijo-ejemplo-original.docx`
- `Contrato-energia-endesa-indexado-ejemplo-original.docx`
- `Contrato-energia-endesa-fijas-a0uWi00000WD9vtIAD.docx` / `...-indexadas-a0uWi00000WZTZyIAP.docx`
  — primeros ejemplos recibidos, mismo contenido.
