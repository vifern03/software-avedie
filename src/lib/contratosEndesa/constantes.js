/** Constantes de la documentación Endesa B2B. Todo lo configurable está aquí. */

// false → volver a bloquear la generación con una tarifa fuera de vigencia.
export const PERMITIR_TARIFA_CADUCADA = true;

export const PRODUCTO_TEXTO = {
  '3.0TD': 'TEL3T - TEMPO OPEN 3.0TD',
  '6.1TD': 'TEMPO OPEN 6.1TD',
};

export const TRAMO_POTENCIA = {
  '3.0TD': '> 15kW (3.0TD)',
  '6.1TD': '> 15kW (6.1TD)',
};

export const TARIFA_ID = { '3.0TD': 'open30', '6.1TD': 'open61' };

export const TENSION_POR_DEFECTO_30TD = '3X400/230';
export const TENSIONES_30TD = ['3X400/230', '3X380/220'];

export const OFERTA_POR_DEFECTO = '0000000';

export const MODALIDADES = [
  { id: 'plana', label: 'Plana', generador: 'plana' },
  { id: 'dia', label: 'Día', generador: 'dia' },
  { id: 'laboral', label: 'Laboral', generador: 'laboral' },
  { id: 'finde', label: 'Fin de Semana', generador: 'fin_de_semana' },
  { id: 'noche', label: 'Noche', generador: 'noche' },
];

// Campos que se editan solo con selección (el resto es texto libre).
export const OPCIONES_CAMPO = {
  tipo_documento: ['IDENTIFICADOR FISCAL', 'NIF', 'NIE'],
  idioma: ['CASTELLANO', 'CATALÁN', 'EUSKERA', 'GALLEGO'],
  equipo_medida: ['ICP Instalado'],
  tipo_solicitud: ['Nuevo Suministro'],
};

// Endesa no suele rellenarlos: se quedan vacíos y se listan en el Aviso 2.
export const CAMPOS_VACIOS_ENDESA = [
  { id: 'cnae', label: 'CNAE' },
  { id: 'horario_contacto', label: 'horario de contacto' },
  { id: 'fecha_nacimiento', label: 'fecha de nacimiento' },
  { id: 'telefono2', label: 'teléfono 2' },
  { id: 'email', label: 'email del titular' },
  { id: 'fiscal_escalera', label: 'escalera (domicilio fiscal)' },
  { id: 'sum_escalera', label: 'escalera (suministro)', suministro: true },
  { id: 'sum_piso', label: 'piso (suministro)', suministro: true },
  { id: 'sum_puerta', label: 'puerta (suministro)', suministro: true },
  { id: 'sum_ref_catastral', label: 'referencia catastral', suministro: true },
  { id: 'contacto_cargo', label: 'cargo del contacto' },
  { id: 'contacto_idioma', label: 'idioma del contacto' },
  { id: 'contacto_horario', label: 'horario del contacto' },
  { id: 'direccion_alternativa', label: 'dirección alternativa' },
];

export const MOTIVO = {
  DEFECTO: 'Valor por defecto',
  NO_LEIDO: 'No se pudo leer: complétalo',
  OFERTA: 'Número de oferta pendiente',
  CADUCADA: 'Tarifa fuera de vigencia: revisa estas fechas',
};
