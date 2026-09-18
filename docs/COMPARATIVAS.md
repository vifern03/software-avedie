# Comparativas y tarifas — criterios de cálculo

Actualización del 18/09/2026 con los documentos Endesa fechados el 17/09/2026.

## Fuente única de precios

| Archivo | Contenido |
|---|---|
| `src/data/tarifasB2B.js` | Open 3.0TD / 6.1TD, Simply 3.0TD / 6.1TD, TEMPO 2.0TD, Indexadas 3.0/6.1 |
| `src/data/tarifasGas.js` | Gas RL.1–RL.3 (B2C) y Gas Estable RL.4–RL.6 (B2B), impuesto de hidrocarburos |
| `src/data/tarifasB2C.js` | Luz residencial 2.0TD, Solar, Indexada 2.0TD, bono social |
| `src/data/historicoTarifas.js` | Valores sustituidos (solo trazabilidad) |

La Consulta de Tarifas, las tres comparativas y el informe PDF leen de estos archivos.

### Vigencias (ventana de contratación)

| Producto | Ventana | Origen |
|---|---|---|
| Open 3.0TD, Open 6.1TD, Simply 3.0TD, TEMPO 2.0TD | 17/09/2026 – 27/09/2026 | PDF Endesa |
| Gas Estable RL.4–RL.6 | 17/09/2026 – 20/09/2026 | PDF Endesa |
| Simply 6.1TD | 17/09/2026 – 17/09/2026 | PDF Endesa. **Pendiente de confirmación** (posible errata, no corregida): el comparador no la ofrece |
| Luz B2C (Luz Fija, Tu Otra Casa, Solar) | 17/09/2026 – 27/09/2026 | **Extensión interna** (instrucción del responsable), referencia B2B luz. Precios sin cambios |
| Gas B2C RL.1–RL.3 | 17/09/2026 – 20/09/2026 | **Extensión interna**, referencia B2B gas. Precios sin cambios |
| Indexadas 2.0/3.0/6.1 | Vencidas | Sin documento nuevo; se muestran como no contratables |

Se distinguen la ventana de contratación, la duración del contrato (1 año con permanencia)
y la duración del descuento (18 % Open y 28 % TEMPO: primer año).

## Calendario regulado

`src/lib/energia/calendario.js`. Fuente: Circular 3/2020 CNMC, art. 7 (BOE-A-2020-1066).
Solo el sistema peninsular. Fechas civiles y hora local del suministro, sin depender de la
zona horaria del ordenador. Días D: sábados, domingos, 6 de enero y festivos nacionales
de fecha fija no sustituibles (Viernes Santo no cuenta).

Cada factura se calcula con el calendario de **sus fechas de consumo**, no con el de la
fecha de emisión ni el mes actual.

## Open: reparto por periodos

`energía = kWh a precio Open + kWh a precio No Open`, con los precios de la matriz
publicada (ya incluyen descuentos; No Open = base × 0,82, no el precio base).

Criterio comercial (responsable, 18/09/2026), por periodos:

| Modalidad | Precio Open en | Precio No Open en |
|---|---|---|
| Plana | P1–P6 | — |
| Día | P1–P5 | P6 |
| Laboral | P1–P5 | P6 |
| Fin de Semana | P6 | P1–P5 |
| Noche | P6 | P1–P5 |

Opcional: con curva horaria (CSV) o desglose del P6 en 4 franjas se calcula hora a hora con
las franjas exactas del PDF (p. ej. Noche 3.0TD = 0–8 h todos los días).

Tramo comercial de potencia: los PDF solo dicen "Potencia contratada (Pc)" con estos
intervalos y **no documentan qué potencia P1–P6 lo determina** cuando son distintas:

- Open 3.0TD: 15 < Pc ≤ 30 · 30 < Pc ≤ 50 · 50 < Pc ≤ 100 · Pc > 100 kW
- Open 6.1TD: Pc ≤ 30 · 30 < Pc ≤ 50 · 50 < Pc ≤ 100 · 100 < Pc ≤ 450 kW

Por eso el tramo se **selecciona manualmente** (los 4 se ofrecen aunque compartan precio).
Elegirlo no modifica las potencias P1–P6 ni los maxímetros. La pantalla indica a qué tramo
corresponde cada potencia y el informe señala las potencias que quedan fuera del tramo elegido.
Sin tramo seleccionado, Open no se calcula.

Fuera de ámbito (p. ej. P6 = 451 kW frente a Open 6.1TD "hasta 450 kW"): la oferta no es
elegible con ningún tramo, se explica el motivo y se puede seguir con otro producto. No se
reducen potencias ni se asigna ningún tramo automáticamente.

Números: "1.200" se interpreta como mil doscientos (formato español).

## Qué entra en la comparación

- Precios Endesa sin impuestos que incluyen peajes y cargos: no se suman aparte.
- Excesos de potencia, reactiva, alquiler del contador y financiación del bono social se
  mantienen de la factura actual en los dos lados (marcados †, no recalculados).
- IE 5,11269632 % sobre potencia + energía − excedentes + excesos + reactiva + bono social.
- Gas: fijo €/mes × 12/365 × días + variable + IEH 0,00234 €/kWh + alquiler, más IVA.
- `ahorro € = coste actual comparable − coste ofertado`; `ahorro % = ahorro € / coste actual`.
  Puede ser negativo; con coste actual 0 no hay porcentaje.
- La anualización es una extrapolación lineal de un único periodo y se rotula como tal.

## Extracción con Gemini

Modelo: `gemini-2.5-pro` (estable; https://ai.google.dev/gemini-api/docs/models, consultado
18/09/2026) con `thinkingBudget: 128` y salida JSON. Medido con la integración real: 17–22 s
por factura, 25/25 campos correctos en las 3 facturas, en dos tandas.

Tiempos: el servidor tiene un presupuesto de 40 s para los reintentos y el navegador corta a
los 45 s ofreciendo reintentar o introducir los datos a mano (un corte no cuenta como
extracción). Una sola llamada por factura: cambiar tramo, modalidad, potencia o exportar no
llama a la IA. Caché en memoria de la pestaña (no en disco: contiene datos personales) con
clave SHA-256 del documento + `EXTRACTOR_VERSION` (`src/lib/energia/geminiCliente.js`).
Las tarifas no se envían a la IA: están estructuradas en `src/data/`.

No implementado: extracción local de texto del PDF antes de la IA (necesitaría una
dependencia nueva, pdf.js). Con Pro acotado ya se cumple el objetivo de tiempo sin
renunciar a la lectura visual de tablas.

`src/lib/energia/extraccion.js`. Gemini solo transcribe valores y unidades impresos
(fechas de emisión y de consumo por separado, lecturas y consumo facturado por separado,
maxímetros del periodo y del año móvil por separado, cada componente de energía). El
código convierte unidades (c€ → €, W → kW, €/kW·año → €/kW·día), comprueba sumas e
impuestos y devuelve incidencias. No es un entrenamiento del modelo.

Evaluación con la integración real: `node scripts/eval_gemini_facturas.mjs <carpeta> <salida>`
(carpeta y salida fuera del repositorio; `casos.json` en la carpeta de facturas).
Referencias anonimizadas en `tests/fixtures/`.

## Pruebas

`npm test` (node:test, sin dependencias nuevas).
