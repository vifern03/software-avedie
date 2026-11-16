# Tarifas pendientes de aplicar — PDF Endesa 2026-11-16

Comparación de los PDF oficiales de Endesa del 16/11/2026 con `src/data` (estado de `main`, commit 4292023).
**No se ha tocado nada en `src/`, ni en Supabase, ni en `historicoTarifas.js`.**

| PDF | Objeto en el CRM | Resultado |
|---|---|---|
| `20261116 3.0TD_OPEN_12_V1.pdf` | `OPEN_30TD` (tarifasB2B.js) | **Incorrecta**: energía y "Y además" (18 % → 12 %) |
| `20261116 6.1TD_OPEN_12_V1.pdf` | `OPEN_61TD` (tarifasB2B.js) | **Incorrecta**: energía y "Y además" (18 % → 12 %) |
| `20261116 2.0TD_TEMPO24H_16_V1.pdf` | `TEMPO_2_0TD` (**tarifasB2B.js**, no tarifasB2C.js) | **Incorrecta**: energía y descuento (28 % → 16 %) |
| `20261116 RL4_RL5_RL6_GAS ESTABLE_22_V1.pdf` | `GAS_EMPRESA` (tarifasGas.js) | **Incorrecta**: término variable y descuento (20 % → 22 %) |

En las cuatro, el **término de potencia** (o el término fijo, en gas) **coincide** con el PDF. Lo que cambia es el término de energía/variable, el porcentaje de descuento y la ventana de contratación: **31/10/2026 – 16/11/2026** (en el CRM pone 19/10/2026 – 28/10/2026). La ventana nueva termina hoy (16/11/2026).

Todos los precios son sin impuestos, en €/kWh (energía), €/kW·año (potencia) y €/mes (término fijo de gas), igual que en el CRM.

## Ficheros preparados

- `tarifasB2B.js`: copia completa de `src/data/tarifasB2B.js` con Open 3.0TD, Open 6.1TD y TEMPO 2.0TD actualizados.
- `tarifasGas.js`: copia completa de `src/data/tarifasGas.js` con Gas Estable RL.4–RL.6 actualizado.
- `tarifasB2C.js`: **no hay copia** porque no cambia. TEMPO está en `tarifasB2B.js` y ninguno de los cuatro PDF afecta a las tarifas B2C.

Solo se han cambiado precios, porcentajes, nombres de documento, fechas y textos de descuento (`duracionDescuento`, `descuentos`, `validez`). La estructura, los tramos, las modalidades y las ventanas horarias quedan igual. Se ha comprobado que los ficheros nuevos cumplen la validación de `src/lib/tarifas/actualizador.js`: matriz = base × (1 − promo − modalidad), Horas No Open = base × (1 − promo) y TEMPO promo = base × (1 − dto), con tolerancia de 0,000002. Ninguno da error.

## Diferencias (valor CRM → PDF)

### Open 3.0TD

| Campo | CRM | PDF |
|---|---|---|
| extraAnyo ("Y además", 1 año) | 18 | **12** |
| modalidades dto (Plana/Día/Laboral/Finde/Noche) | 15/20/25/45/55 | 15/20/25/45/55 (sin cambio, ver nota) |
| baseEnergia 15–30 / 30–50 | 0,251588 | **0,302223** |
| baseEnergia 50–100 / >100 | 0,251088 | **0,301723** |
| Plana 15–50 / 50+ | 0,168564 / 0,168229 | **0,220623 / 0,220258** |
| Día 15–50 / 50+ | 0,155985 / 0,155675 | **0,205512 / 0,205172** |
| Laboral 15–50 / 50+ | 0,143405 / 0,143120 | **0,190401 / 0,190086** |
| Fin de Semana 15–50 / 50+ | 0,093088 / 0,092903 | **0,129956 / 0,129741** |
| Noche 15–50 / 50+ | 0,067929 / 0,067794 | **0,099734 / 0,099569** |
| Horas No Open 15–50 / 50+ | 0,206302 / 0,205892 | **0,265956 / 0,265516** |
| Potencia P1–P6 €/kW·año | 21,876927 · 12,117621 · 5,981534 · 5,386333 · 4,013851 · 2,942287 | igual |
| Vigencia | 19/10–28/10/2026 | **31/10–16/11/2026** |

Nota: en el PDF de 3.0TD los porcentajes de cada modalidad están en una imagen y no se pueden extraer como texto. Los valores 15/20/25/45/55 salen de la matriz publicada, que cuadra exactamente con base × (1 − 12 % − dto). En 6.1TD sí aparecen como texto.

### Open 6.1TD

| Campo | CRM | PDF |
|---|---|---|
| extraAnyo | 18 | **12** |
| modalidades dto | 15/20/25/45/35 | 15/20/25/45/35 (sin cambio) |
| baseEnergia ≤30 / 30–50 | 0,225162 | **0,259430** |
| baseEnergia 50–100 / 100–450 | 0,221662 | **0,255930** |
| Plana ≤50 / 50+ | 0,150859 / 0,148514 | **0,189384 / 0,186829** |
| Día ≤50 / 50+ | 0,139601 / 0,137431 | **0,176413 / 0,174033** |
| Laboral ≤50 / 50+ | 0,128342 / 0,126347 | **0,163441 / 0,161236** |
| Fin de Semana ≤50 / 50+ | 0,083310 / 0,082015 | **0,111555 / 0,110050** |
| Noche ≤50 / 50+ | 0,105826 / 0,104181 | **0,137498 / 0,135643** |
| Horas No Open ≤50 / 50+ | 0,184633 / 0,181763 | **0,228299 / 0,225219** |
| Potencia P1–P6 €/kW·año | 31,095368 · 17,014709 · 8,301881 · 6,893829 · 3,625113 · 2,504181 | igual |
| Vigencia | 19/10–28/10/2026 | **31/10–16/11/2026** |

### TEMPO 2.0TD (24h, ≤ 15 kW)

| Campo | CRM | PDF |
|---|---|---|
| descuento (1er año, energía) | 28 | **16** |
| energia.base | 0,206585 | **0,241281** |
| energia.promo | 0,148741 | **0,202676** |
| Potencia P1 €/kW·año (€/kW·mes) | 44,704416 (3,725368) | igual |
| Potencia P2 €/kW·año (€/kW·mes) | 17,725428 (1,477119) | igual |
| Vigencia | 19/10–28/10/2026 | **31/10–16/11/2026** |

### Gas Estable RL.4 – RL.6

| Campo | CRM | PDF |
|---|---|---|
| Descuento sobre el término variable (1 año) | 20 % | **22 %** |
| RL.4 término fijo €/mes | 43,313 | igual |
| RL.4 variable base / con dto €/kWh | 0,128080 / 0,102464 | **0,146686 / 0,114415** |
| RL.5 término fijo €/mes | 242,632 | igual |
| RL.5 variable base / con dto | 0,127993 / 0,102394 | **0,146598 / 0,114346** |
| RL.6 término fijo €/mes | 1.168,049 | igual |
| RL.6 variable base / con dto | 0,116511 / 0,093209 | **0,135117 / 0,105391** |
| Impuesto de hidrocarburos | 0,00234 €/kWh | igual |
| Vigencia | 19/10–28/10/2026 | **31/10–16/11/2026** |

En gas, `conMant` repite los valores de `sinMant` porque Gas Estable no tiene mantenimiento (`hasMant: false`), igual que antes.

## Campos del PDF que el CRM no modela (o modela solo como texto)

- **Servicios de Ajuste** (luz): valor de referencia 0,017 €/kWh, con banda de 0,014 a 0,020 €/kWh y revisión cada 1 de enero. El CRM no lo modela, y el PDF tampoco lo cambia.
- **Actualización por IPC** cada 1 de enero, y revisión de precios a los 12 meses con aviso de 30 días. Solo es una condición contractual.
- **Impuesto eléctrico 5,11269632 %**, IVA, IGIC e IPSI: el motor los aplica aparte, no forman parte de estos objetos.
- **Penalización**: se guarda solo como texto (`penalizacion`) y coincide con los PDF.
- Columnas **€/kW·mes y €/kW·día** de Open: están en `potenciaTerminos` y coinciden. TEMPO solo publica €/kW·año y €/kW·mes, y también coinciden.
- **Alquiler del equipo de medida** (gas): según el PDF lo factura la distribuidora y no se modela.

## Cómo aplicarlo

**Opción A: ficheros (cambia la base en código)**

1. Copiar los ficheros sobre los de producción:
   ```
   copy docs\tarifas_pendientes_2026-11-16\tarifasB2B.js src\data\tarifasB2B.js
   copy docs\tarifas_pendientes_2026-11-16\tarifasGas.js src\data\tarifasGas.js
   ```
2. Ejecutar `npm run build` (o arrancar el dev server) y revisar Consulta de Tarifas y las comparativas 3.0 / 6.1 / Gas.
3. No añadir los precios antiguos a `historicoTarifas.js`.
4. Commit y despliegue solo cuando se pida.

**Opción B: sistema de versiones (Documentación B2B → "Actualizar tarifa")**

`src/lib/tarifas/obtenerTarifa.js` aplica al arrancar la versión **activa** de la tabla `tarifas_versiones` de Supabase sobre los objetos de `src/data`, y solo en las rutas que permite `registro.js`. Esas rutas son `baseEnergia`, `horasNoOpen`, `matrix`, `extraAnyo`, `modalidades.N.dto`, `energia.*`, `descuento`, `terFijo`, `sinMant.*` y `conMant.*`, además de la vigencia. Subiendo cada PDF con "Actualizar tarifa" se crea la versión nueva, que pasa la misma validación.

El sistema de versiones **no** cambia `fuente`, `duracionDescuento` ni `descuentos` (texto). Esos textos solo se actualizan con la opción A.

**Aviso**: si en Supabase ya hay una versión activa para `open30`, `open61`, `tempo`, `rl4`, `rl5` o `rl6`, esa versión se aplica **por encima** de `src/data`, aunque se copien estos ficheros. No se ha consultado Supabase, así que esta comparación es solo contra `src/data`.
