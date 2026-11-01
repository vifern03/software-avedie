# Carga inicial: distribuidoras eléctricas

`distribuidoras_seed.csv` contiene 357 filas, en UTF-8 y con todos los campos entre comillas.

| estado | filas | origen |
|---|---|---|
| ACTIVA | 325 + 1 (prefijo `003150`) | Tabla maestra oficial de la CNMC `DISTRIBUIDORAS_ELECTRICIDAD` (https://api.cnmc.gob.es/maestras/v1/tabla/DISTRIBUIDORAS_ELECTRICIDAD), consultada el 31-10-2026 |
| BAJA | 24 | Misma tabla. Distribuidoras extinguidas o absorbidas (sirven para CUPS antiguos) |
| NO_OFICIAL | 7 | Códigos heredados que las webs comparadoras atribuyen a e-distribución o UFD. No figuran en la CNMC; `verificado = false` |

## Columnas

- `prefijo_cups`: los dígitos que van tras "ES". Normalmente son 4. Hay 6 solo cuando Endesa imprime un texto distinto por zona (de momento solo `003150`).
- `nombre_oficial`: el nombre literal de la CNMC (puede tener espacios dobles). `nombre_mostrar`: el mismo nombre limpio, para la interfaz.
- `codigo_endesa` / `texto_endesa`: solo en las 3 filas comprobadas en contratos reales de Endesa (0021, 0022 y 003150). **No se rellenan en ninguna otra fila.**

## Reglas de búsqueda

1. Validar el CUPS.
2. Buscar primero por 6 dígitos y, si no hay fila, por 4.
3. Si la fila no tiene `texto_endesa`, o tiene `verificado = false` o el estado BAJA, el generador muestra el triángulo amarillo. Si falta `texto_endesa`, no deja generar hasta que alguien lo introduzca.
4. Para e-distribución (0031) Endesa imprime 6 dígitos. Están vistas las zonas 10 (Andalucía, Extremadura, Albacete), 40 (Cataluña) y 50 (Baleares). Solo conocemos el texto de Endesa de la zona 50.

En `edistribucion_subcodigos.md` está la investigación sobre las zonas de e-distribución, con sus fuentes.
