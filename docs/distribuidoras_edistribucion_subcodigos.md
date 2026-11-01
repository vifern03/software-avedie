# e-distribución: ¿subcódigos tras 0031? (ES003110, ES003140, ES003150…)

Fecha: 2026-10-31. Fuentes: webs públicas y licitaciones públicas, consultadas con WebSearch/WebFetch. No he encontrado ninguna fuente oficial (CNMC/REE/MITECO/BOE) que defina estos subcódigos.

## 1. Conclusión breve

- **Código oficial de distribuidora = 4 caracteres.** La especificación SIPS de la CNMC define `codigoEmpresaDistribuidora` como "Código alfanumérico de longitud 4 que identifica el agente distribuidor", formato X(4), con referencia a la "CNMC Tabla 1" (valores en e·sios). Fuente: https://www.cnmc.es/sites/default/files/editor_contenidos/Energia/Cambio%20comercializador/20171115_CNMC%20-%20SIPS%20-%20V3_0RevD.pdf
- Endesa explica la estructura así: ES + **4 dígitos de la distribuidora (asignados por el Ministerio)** + **12 dígitos que asigna la propia distribuidora** al punto de suministro + letras de control. Fuente: https://www.endesa.com/es/conoce-la-energia/blog/cups-donde-encontrar.html
- Por tanto, el "ES003150" que imprime Endesa son los 8 primeros caracteres del CUPS. Los dígitos 5-6 ("50") ya forman parte de la numeración interna de 12 dígitos de e-distribución. **No son otro código de distribuidora.** Para el CRM: **distribuidora = dígitos 3-6 (0031)**. Los dígitos 7-8 se pueden guardar aparte como "zona e-distribución" (dato informativo, sin respaldo oficial).

## 2. Qué se ha observado (evidencia)

### 2.1 Webs especializadas que citan los prefijos de 6 dígitos (no dan la zona)
| Prefijo citado | Fuente | Zona indicada |
|---|---|---|
| ES003110, ES003150, ES003160 (y "ES040", probable errata) | https://roams.es/energia/luz/distribucion-electrica/ | Ninguna |
| ES003110, ES003150, ES003160, "ES040" | https://comparadorluz.com/faq/distribucion-electrica | Ninguna |

Ninguna de las dos menciona ES003140, aunque es el prefijo que aparece en Cataluña (ver 2.2).

### 2.2 CUPS reales en licitaciones públicas (evidencia primaria de la zona)
Ningún pliego nombra la distribuidora junto a cada CUPS. La zona se deduce de la ubicación de los suministros, que está en territorio de e-distribución.

| Prefijo (8 car.) | Zona observada | Nº CUPS | Fuente |
|---|---|---|---|
| **ES003110** | Andalucía: Granada | ~400 | https://web.granada.org/contrata.nsf/2d451ae6f1f390ffc125787f00331360/adcc11b922380cc2c1257e0b00383b37/$FILE/1.%20Pliego%20t%C3%A9cnico%20.pdf |
| **ES003110** | Andalucía: Sevilla (Estadio La Cartuja) | n/d | https://www.estadiolacartuja.es/wp-content/uploads/2024/02/Expte-20240215-Pliego-Prescripciones-Tecnicas-suministro-electricidad.pdf |
| **ES003110** | Extremadura (Junta de Extremadura) | 129 (todos los ES0031 del documento) | https://juntaex.es/documents/77055/34116362/01+Pliego+de+Prescripciones+T%C3%A9cnicas.pdf |
| **ES003110** | Castilla-La Mancha: Albacete | 1 | https://contratacion.castillalamancha.es/sites/default/files/2025-02/PPT.pdf |
| **ES003140** | Cataluña: Barcelona (Aigües de Barcelona) | 178 (todos) | https://procediments-contractacio.aiguesdebarcelona.cat/document/downloadFile/2067 |
| **ES003140** | Cataluña: Barcelona (Fira de Barcelona) | 5 | https://prd-webrepository.firabarcelona.com/wp-content/uploads/2022/09/13092355/Pliego-Condiciones-Tecnicas.pdf |
| **ES003150** | Baleares: Esporles (Mallorca), BOIB 2018 | 40 de 41 (el otro es una errata, "ES000315") | https://intranet.caib.es/eboibfront/pdf/es/2018/7/998556 |
| **ES003150** | Baleares: Esporles, BOIB 2016 (mismo ayuntamiento) | 37 + 1 errata | https://intranet.caib.es/eboibfront/pdf/es/2016/107/958743 |

### 2.3 Lo que no he podido confirmar
- **ES003160**: lo citan Roams y comparadorluz, pero no he encontrado ningún CUPS real con ese prefijo ni la zona a la que corresponde.
- **Aragón, Canarias y la zona de e-distribución en Castilla y León**: he buscado licitaciones de Zaragoza, Huesca, Teruel, Tenerife y Gran Canaria, pero los documentos que encontré no traían el listado de CUPS. Para estas zonas no hay prefijo de 8 caracteres verificado.
- No he encontrado ninguna fuente que explique de forma explícita qué significan los dígitos 5-6.

## 3. Hipótesis (NO verificada)
Las dos cifras tras 0031 podrían corresponder a las antiguas empresas o territorios que se integraron en Endesa Distribución:
- 10: Andalucía/Extremadura/C-LM (antigua Sevillana)
- 40: Cataluña (antigua FECSA-ENHER)
- 50: Baleares (antigua GESA)

Encaja con que los agregadores citen códigos heredados por región:
- 0023: Andalucía/Extremadura
- 0024 y 0396: Cataluña
- 0288: Baleares
- 0363: Canarias
- 0029: Aragón y otras zonas

Lo publican Roams (https://roams.es/energia/companias-energeticas/endesa/cups/) y otros. Ninguna fuente lo confirma, y los agregadores se contradicen entre sí (ver contraste.csv). Esta hipótesis no debe usarse como dato en el CRM.

## 4. Recomendación para el CRM
1. Identificar la distribuidora siempre por los **4 dígitos** (caracteres 3-6 del CUPS) y la tabla oficial (CNMC Tabla 1 / e·sios).
2. Si interesa, guardar un campo informativo `zona_edistribucion` con los caracteres 7-8 cuando el código sea 0031. Valores con evidencia: 10 (Andalucía/Extremadura/C-LM), 40 (Cataluña), 50 (Baleares). 60 queda pendiente.
3. Para la operativa en Baleares, todos los CUPS observados de e-distribución empiezan por ES003150.
