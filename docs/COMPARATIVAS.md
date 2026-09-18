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

## Open: horas Open ≠ periodos

`energía = kWh horas Open × precio Open + kWh resto × precio No Open`, con los precios de
la matriz publicada (ya incluyen descuentos; No Open = base × 0,82, no el precio base).

P1–P5 son siempre laborables de 8 a 24 h. Con los totales P1–P6:

- **Plana** y **Laboral**: calculables.
- **Día, Fin de Semana y Noche**: reparten el P6 (noches laborables y fines de semana). Se
  necesita la curva horaria (CSV) o el desglose del P6 en 4 franjas. Sin esos datos, la
  modalidad queda como "Faltan datos": no se calcula ni se recomienda.

Con curva, se usa la fracción Open de cada periodo aplicada al kWh **facturado**.

Tramo de potencia: el PDF no concreta qué potencia lo rige si varía por periodo. Si P1 y la
máxima caen en tramos distintos se usa el de precio más alto y se avisa.
Open 6.1TD: "hasta 450 kW". Un suministro con alguna potencia > 450 kW no es elegible.

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
