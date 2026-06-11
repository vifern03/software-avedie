import { createContext, useContext, useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabase';

const DataContext = createContext(null);

const today = () => new Date().toISOString().split('T')[0];

const formatDateDDMMYYYY = (dateStr) => {
  if (!dateStr) return '—';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
};

// ── Stale-while-revalidate cache ──────────────────────────────────────────────
// Campos Base64 excluidos del caché y del SELECT principal: pueden pesar varios
// MB por registro y provocan timeout en Supabase con SELECT *. HistoricaDB los
// obtiene por separado bajo demanda.
const BINARY_FIELDS = ['dni_escaneado', 'ultima_factura', 'cif_autonomo_url', 'justo_titulo_url', 'factura_b2b_url'];

// Columnas que sí se descargan en el fetch principal (sin binarios)
const CLIENTES_SELECT = [
  'id', 'tipo', 'nombre', 'cif_dni', 'telefono', 'mail', 'cuenta_bancaria',
  'cups', 'tarifa', 'linea_negocio', 'subtipo', 'subtipo_otro', 'id_producto',
  'creado_por', 'descripcion', 'estado', 'comercial', 'equipo',
  'fecha_tramitacion', 'fecha_firma', 'fecha_formalizada', 'created_at',
  'deleted_at', 'consumo_anual_est',
].join(',');

const cacheKey = (username) => `dashboard_cache_${username}`;

const readCache = (username) => {
  if (!username) return null;
  try {
    const raw = localStorage.getItem(cacheKey(username));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
};

const writeCache = (username, data) => {
  if (!username) return;
  try {
    const payload = {
      ...data,
      clientes: data.clientes.map(c => {
        const r = { ...c };
        BINARY_FIELDS.forEach(f => delete r[f]);
        return r;
      }),
    };
    localStorage.setItem(cacheKey(username), JSON.stringify(payload));
  } catch { /* cuota agotada — ignorar silenciosamente */ }
};


export function DataProvider({ children }) {
  const { currentUser, users } = useAuth();

  const [clientes,     setClientes]     = useState([]);
  const [actividades,  setActividades]  = useState([]);
  const [visitas,      setVisitas]      = useState([]);
  const [visitasPymes, setVisitasPymes] = useState([]);
  const [isLoading,    setIsLoading]    = useState(true);

  // Clave de la última carga completada: evita el double-fetch cuando
  // AuthContext revalida currentUser con los mismos datos de BD.
  const lastFetchKey = useRef(null);

  useEffect(() => {
    // Si no hay usuario, limpiar estado (cambio de cuenta o logout)
    if (!currentUser) {
      setClientes([]);
      setActividades([]);
      setVisitas([]);
      setVisitasPymes([]);
      setIsLoading(false);
      lastFetchKey.current = null;
      return;
    }

    // Guard: si la identidad relevante para los filtros no cambió, no re-fetchar
    const fetchKey = `${currentUser.username}|${currentUser.role}|${currentUser.equipo}`;
    if (fetchKey === lastFetchKey.current) return;
    lastFetchKey.current = fetchKey;

    // ── 1. Inyectar caché INMEDIATAMENTE (pintura instantánea) ───────────────
    const userCache = readCache(currentUser.username);
    if (userCache) {
      setClientes(userCache.clientes     || []);
      setActividades(userCache.actividades  || []);
      setVisitas(userCache.visitas       || []);
      setVisitasPymes(userCache.visitasPymes || []);
      setIsLoading(false);
    } else {
      setIsLoading(true);
    }

    // ── 2. Revalidación asíncrona en segundo plano ───────────────────────────
    async function loadAll() {
      const isAdmin   = currentUser.role?.toLowerCase() === 'admin';
      const isManager = currentUser.role?.toLowerCase() === 'manager';
      const userEquipo = currentUser.equipo || 'Ambos';

      // ── Clientes (B2C / B2B) ──────────────────────────────────────────────────
      // Admin y Manager: acceso GLOBAL sin restricción de equipo.
      // Comercial: acotado a su equipo, o a sus propios registros si equipo='Ninguno'.
      let clientesQuery = supabase
        .from('clientes')
        .select(CLIENTES_SELECT)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (!isAdmin && !isManager) {
        if (userEquipo !== 'Ambos' && userEquipo !== 'Ninguno') {
          clientesQuery = clientesQuery.eq('equipo', userEquipo);
        } else if (userEquipo === 'Ninguno') {
          clientesQuery = clientesQuery.or(`comercial.eq.${currentUser.username},creado_por.eq.${currentUser.username}`);
        }
      }

      // ── Visitas Tienda ────────────────────────────────────────────────────────
      // Admin: acceso GLOBAL. Manager: solo su sede. Comercial: su sede o sus registros.
      let visitasQuery = supabase
        .from('visitas')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (!isAdmin) {
        if (userEquipo !== 'Ambos' && userEquipo !== 'Ninguno') {
          visitasQuery = visitasQuery.eq('punto_venta', userEquipo);
        } else if (userEquipo === 'Ninguno') {
          visitasQuery = visitasQuery.eq('registrado_por', currentUser.username);
        }
      }

      // ── Visitas Pymes ─────────────────────────────────────────────────────────
      // Admin y Manager: acceso GLOBAL. Comercial: solo las suyas.
      let visitasPymesQuery = supabase
        .from('visitas_pymes')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (!isAdmin && !isManager) {
        visitasPymesQuery = visitasPymesQuery.eq('registrado_por', currentUser.username);
      }

      const [
        { data: clientesData,     error: clientesErr },
        { data: actividadesData },
        { data: visitasData },
        { data: visitasPymesData },
      ] = await Promise.all([
        clientesQuery,
        supabase.from('actividades').select('*').is('deleted_at', null).order('created_at', { ascending: false }),
        visitasQuery,
        visitasPymesQuery,
      ]);

      // ── 3. Evitar race condition: descartar si el usuario cambió ──────────
      if (lastFetchKey.current !== fetchKey) return;

      if (clientesErr) {
        // Error de red/BD: mantener datos del caché si existen
        if (!userCache) setIsLoading(false);
        return;
      }

      const newClientes     = clientesData     || [];
      const newActividades  = actividadesData  || [];
      const newVisitas      = visitasData      || [];
      const newVisitasPymes = visitasPymesData || [];

      setClientes(newClientes);
      setActividades(newActividades);
      setVisitas(newVisitas);
      setVisitasPymes(newVisitasPymes);

      // Persistir datos frescos para la próxima carga
      writeCache(currentUser.username, {
        clientes:     newClientes,
        actividades:  newActividades,
        visitas:      newVisitas,
        visitasPymes: newVisitasPymes,
      });

      setIsLoading(false);
    }

    loadAll();
  }, [currentUser]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Actividades ─────────────────────────────────────────────────────────────

  const addActivity = (tipo, descripcion, comercial) => {
    const now = new Date();
    const newAct = {
      id:          Date.now(),
      tipo,
      descripcion,
      comercial:   comercial || currentUser?.username || 'Sistema',
      fecha:       now.toISOString().split('T')[0],
      hora:        now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
    };
    setActividades(prev => [newAct, ...prev]);
    supabase.from('actividades').insert([newAct])
      .then(({ error }) => {
        if (error) {
          console.error('addActivity:', error);
          setActividades(prev => prev.filter(a => a.id !== newAct.id));
        }
      });
  };

  const clearActividades = () => {
    setActividades([]);
    supabase.from('actividades').update({ deleted_at: new Date().toISOString() }).is('deleted_at', null)
      .then(({ error }) => { if (error) console.error('clearActividades:', error); });
  };

  // ── Visitas ─────────────────────────────────────────────────────────────────

  const _uploadDniFile = async (file) => {
    const ext      = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const fileName = `${Date.now()}_${currentUser?.username || 'anon'}_${Math.random().toString(36).slice(2,5)}.${ext}`;
    const { error } = await supabase.storage.from('visitas-dni').upload(fileName, file, { upsert: false });
    if (error) { console.error('upload dni:', error); return null; }
    return supabase.storage.from('visitas-dni').getPublicUrl(fileName).data.publicUrl;
  };

  const addVisita = async (data, dniAnverso, dniReverso) => {
    const dni_cif_escaneado_url = dniAnverso ? (await _uploadDniFile(dniAnverso)) || '' : '';
    const dni_cif_reverso_url   = dniReverso ? (await _uploadDniFile(dniReverso)) || '' : '';
    const newVisita = {
      id:                   Date.now(),
      fecha:                data.fecha,
      hora:                 data.hora,
      dni:                  data.dni,
      nombre:               data.nombre,
      telefono:             data.telefono    || '',
      mail:                 data.mail        || '',
      tipo:                 data.tipo,
      tipo_otro:            data.tipo_otro   || '',
      punto_venta:          data.punto_venta || '',
      registrado_por:       currentUser?.username || 'Sistema',
      equipo:               currentUser?.equipo   || 'Ambos',
      dni_cif_escaneado_url,
      dni_cif_reverso_url,
    };
    setVisitas(prev => [newVisita, ...prev]);
    const { error } = await supabase.from('visitas').insert([newVisita]);
    if (error) {
      console.error('addVisita:', error);
      setVisitas(prev => prev.filter(v => v.id !== newVisita.id));
      return { error };
    }
    addActivity(
      'Visita',
      `${currentUser?.username || 'Sistema'} ha registrado una visita de ${newVisita.nombre} en el punto de venta ${newVisita.punto_venta}`,
      currentUser?.username
    );
    return { error: null };
  };

  const updateVisita = async (id, data, dniAnverso, dniReverso, existingAnverso, existingReverso) => {
    const dni_cif_escaneado_url = dniAnverso
      ? (await _uploadDniFile(dniAnverso)) || existingAnverso || ''
      : (existingAnverso || '');
    const dni_cif_reverso_url = dniReverso
      ? (await _uploadDniFile(dniReverso)) || existingReverso || ''
      : (existingReverso || '');
    const updateObj = { ...data, dni_cif_escaneado_url, dni_cif_reverso_url };
    setVisitas(prev => prev.map(v => v.id === id ? { ...v, ...updateObj } : v));
    const { error } = await supabase.from('visitas').update(updateObj).eq('id', id);
    if (error) { console.error('updateVisita:', error); return { error }; }
    return { error: null };
  };

  const deleteVisita = (id) => {
    setVisitas(prev => prev.filter(v => v.id !== id));
    supabase.from('visitas').update({ deleted_at: new Date().toISOString() }).eq('id', id)
      .then(({ error }) => { if (error) console.error('deleteVisita:', error); });
  };

  // ── Visitas PYMES ────────────────────────────────────────────────────────────

  const _uploadPymeDoc = async (file, prefix) => {
    const ext      = (file.name.split('.').pop() || 'pdf').toLowerCase();
    const fileName = `${prefix}_${Date.now()}_${currentUser?.username || 'anon'}.${ext}`;
    const { error } = await supabase.storage.from('pymes-fotos').upload(fileName, file, { upsert: false });
    if (error) { console.error('_uploadPymeDoc:', error); return null; }
    return supabase.storage.from('pymes-fotos').getPublicUrl(fileName).data.publicUrl;
  };

  const addVisitaPyme = async (data, fotoFile, facturaFile, comparativaFile) => {
    let foto_url = '';
    if (fotoFile) {
      const ext      = fotoFile.name.split('.').pop() || 'jpg';
      const fileName = `${Date.now()}_${currentUser?.username || 'anon'}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('pymes-fotos')
        .upload(fileName, fotoFile, { upsert: false });
      if (!upErr) {
        const { data: urlData } = supabase.storage.from('pymes-fotos').getPublicUrl(fileName);
        foto_url = urlData.publicUrl;
      } else {
        console.error('addVisitaPyme upload:', upErr);
      }
    }
    const factura_url    = facturaFile    ? (await _uploadPymeDoc(facturaFile,    'factura'))    || '' : '';
    const comparativa_url = comparativaFile ? (await _uploadPymeDoc(comparativaFile, 'comparativa')) || '' : '';

    const newVisita = {
      id:                           Date.now(),
      fecha:                        data.fecha,
      hora:                         data.hora,
      persona_autorizada:           data.persona_autorizada,
      correo:                       data.correo_persona            || '',
      telefono_contacto_cliente:    data.telefono_cliente          || '',
      correo_electronico_cliente:   data.correo_cliente            || '',
      foto_negocio_url:             foto_url,
      comentarios_visita:           data.comentarios               || '',
      registrado_por:               currentUser?.username          || 'Sistema',
      nombre_empresa:               data.nombre_empresa            || '',
      ubicacion:                    data.ubicacion                 || '',
      estado:                       data.estado                    || 'Solicitado Factura',
      fecha_enviada_comparativa:    data.fecha_enviada_comparativa || null,
      fecha_resolucion:             data.fecha_resolucion          || null,
      factura_url,
      comparativa_url,
    };
    setVisitasPymes(prev => [newVisita, ...prev]);
    const { error } = await supabase.from('visitas_pymes').insert([newVisita]);
    if (error) {
      console.error('addVisitaPyme error:', error.message, error.details, error.hint);
      setVisitasPymes(prev => prev.filter(v => v.id !== newVisita.id));
      return { error };
    }
    addActivity(
      'Visita PYME',
      `${currentUser?.username || 'Sistema'} ha registrado una visita PYME a ${newVisita.persona_autorizada}`,
      currentUser?.username
    );
    return { error: null };
  };

  const updateVisitaPyme = async (id, data, fotoFile, existingFotoUrl, facturaFile, comparativaFile) => {
    let foto_url = existingFotoUrl || '';
    if (fotoFile) {
      const ext      = fotoFile.name.split('.').pop() || 'jpg';
      const fileName = `${Date.now()}_${currentUser?.username || 'anon'}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('pymes-fotos')
        .upload(fileName, fotoFile, { upsert: false });
      if (!upErr) {
        const { data: urlData } = supabase.storage.from('pymes-fotos').getPublicUrl(fileName);
        foto_url = urlData.publicUrl;
      } else {
        console.error('updateVisitaPyme upload:', upErr);
      }
    }
    const factura_url    = facturaFile    ? (await _uploadPymeDoc(facturaFile,    'factura'))    || data.factura_url    || '' : (data.factura_url    === null ? null : (data.factura_url    || ''));
    const comparativa_url = comparativaFile ? (await _uploadPymeDoc(comparativaFile, 'comparativa')) || data.comparativa_url || '' : (data.comparativa_url === null ? null : (data.comparativa_url || ''));

    const updateObj = {
      fecha:                        data.fecha,
      hora:                         data.hora,
      persona_autorizada:           data.persona_autorizada,
      correo:                       data.correo_persona            || '',
      telefono_contacto_cliente:    data.telefono_cliente          || '',
      correo_electronico_cliente:   data.correo_cliente            || '',
      foto_negocio_url:             foto_url,
      comentarios_visita:           data.comentarios               || '',
      nombre_empresa:               data.nombre_empresa            || '',
      ubicacion:                    data.ubicacion                 || '',
      factura_url,
      comparativa_url,
      ...(data.estado                    !== undefined && { estado:                    data.estado                    }),
      ...(data.fecha_enviada_comparativa !== undefined && { fecha_enviada_comparativa: data.fecha_enviada_comparativa }),
      ...(data.fecha_resolucion          !== undefined && { fecha_resolucion:          data.fecha_resolucion          }),
    };
    setVisitasPymes(prev => prev.map(v => v.id === id ? { ...v, ...updateObj } : v));
    const { error } = await supabase.from('visitas_pymes').update(updateObj).eq('id', id);
    if (error) { console.error('updateVisitaPyme error:', error.message, error.details); return { error }; }
    return { error: null };
  };

  const updateEstadoVisitaPyme = async (id, nuevoEstado, extraFields = {}) => {
    const updateObj = { estado: nuevoEstado, ...extraFields };
    setVisitasPymes(prev => prev.map(v => v.id === id ? { ...v, ...updateObj } : v));
    const { error } = await supabase.from('visitas_pymes').update(updateObj).eq('id', id);
    if (error) { console.error('updateEstadoVisitaPyme:', error); return { error }; }
    return { error: null };
  };

  const transicionEstadoPyme = async (id, nuevoEstado, extraFields = {}, facturaFile = null, comparativaFile = null) => {
    const updateObj = { estado: nuevoEstado, ...extraFields };
    if (facturaFile) {
      const url = await _uploadPymeDoc(facturaFile, 'factura');
      if (url) updateObj.factura_url = url;
    }
    if (comparativaFile) {
      const url = await _uploadPymeDoc(comparativaFile, 'comparativa');
      if (url) updateObj.comparativa_url = url;
    }
    setVisitasPymes(prev => prev.map(v => v.id === id ? { ...v, ...updateObj } : v));
    const { error } = await supabase.from('visitas_pymes').update(updateObj).eq('id', id);
    if (error) { console.error('transicionEstadoPyme:', error); return { error }; }
    return { error: null };
  };

  const deleteVisitaPyme = (id) => {
    setVisitasPymes(prev => prev.filter(v => v.id !== id));
    supabase.from('visitas_pymes').update({ deleted_at: new Date().toISOString() }).eq('id', id)
      .then(({ error }) => { if (error) console.error('deleteVisitaPyme:', error); });
  };

  // ── Clientes ────────────────────────────────────────────────────────────────

  const addCliente = async (data, tipo) => {
    const tramitacion = data.fecha_tramitacion || today();
    const newCliente = {
      id:               Date.now(),
      tipo,
      nombre:           data.nombre,
      cif_dni:          data.identificacion,
      telefono:         data.telefono,
      mail:             data.mail            || '',
      cuenta_bancaria:  data.cuenta_bancaria || '',
      cups:             data.cups,
      tarifa:           data.tarifa,
      linea_negocio:    data.linea_negocio   || '',
      subtipo:          data.subtipo         || '',
      subtipo_otro:     data.subtipo_otro    || '',
      id_producto:      data.id_producto     || '',
      creado_por:       data.creado_por      || '',
      descripcion:      data.descripcion     || '',
      estado:           data.estado          || 'Pendiente Firma',
      comercial:        data.agente_gestor   || currentUser?.username || 'Desconocido',
      equipo:           currentUser?.equipo  || 'Ambos',
      fecha_tramitacion: tramitacion,
      fecha_firma:       data.fecha_firma       || null,
      fecha_formalizada: data.fecha_formalizada || null,
      ...(data.dni_escaneado    ? { dni_escaneado:    data.dni_escaneado    } : {}),
      ...(data.ultima_factura   ? { ultima_factura:   data.ultima_factura   } : {}),
      ...(data.cif_autonomo_url ? { cif_autonomo_url: data.cif_autonomo_url } : {}),
      ...(data.justo_titulo_url ? { justo_titulo_url: data.justo_titulo_url } : {}),
      ...(data.factura_b2b_url  ? { factura_b2b_url:  data.factura_b2b_url  } : {}),
      consumo_anual_est: (data.consumo_anual_est !== '' && data.consumo_anual_est != null)
        ? Number(data.consumo_anual_est)
        : null,
    };
    setClientes(prev => [newCliente, ...prev]);
    const { error } = await supabase.from('clientes').insert([newCliente]);
    if (error) {
      console.error('addCliente:', error);
      setClientes(prev => prev.filter(c => c.id !== newCliente.id));
      return { error };
    }
    addActivity(
      tipo === 'B2B' ? 'Alta B2B' : 'Alta B2C',
      `${currentUser?.username} ha tramitado un contrato para el cliente ${data.nombre} (${data.estado} - ${formatDateDDMMYYYY(data.fecha_tramitacion || today())})`,
      currentUser?.username
    );
    return { error: null };
  };

  const updateCliente = (id, data) => {
    const original = clientes.find(c => c.id === id);
    const changes  = [];

    if (original) {
      const checks = [
        ['CLIENTE',           data.nombre,                  original.nombre              ],
        ['DNI/CIF',           data.identificacion,          original.cif_dni             ],
        ['TELÉFONO',          data.telefono,                original.telefono            ],
        ['EMAIL',             data.mail         ?? '',      original.mail       ?? ''    ],
        ['CUENTA BANCARIA',   data.cuenta_bancaria ?? '',   original.cuenta_bancaria ?? ''],
        ['CUPS',              data.cups,                    original.cups                ],
        ['TARIFA',            data.tarifa,                  original.tarifa              ],
        ['LÍNEA DE NEGOCIO',  data.linea_negocio   ?? '',   original.linea_negocio   ?? ''],
        ['SUBTIPO',           data.subtipo         ?? '',   original.subtipo         ?? ''],
        ['ID PRODUCTO',       data.id_producto     ?? '',   original.id_producto     ?? ''],
        ['CREADO POR',        data.creado_por      ?? '',   original.creado_por      ?? ''],
        ['DESCRIPCIÓN',       data.descripcion     ?? '',   original.descripcion     ?? ''],
        ['ESTADO',            data.estado,                  original.estado              ],
        ['FECHA TRAMITACIÓN', data.fecha_tramitacion ?? '', original.fecha_tramitacion ?? ''],
        ['TRAMITADO POR',     data.agente_gestor   ?? '',   original.comercial       ?? ''],
        ['F. FIRMA',          data.fecha_firma     ?? '',   original.fecha_firma     ?? ''],
        ['F. FORMALIZADA',    data.fecha_formalizada ?? '', original.fecha_formalizada ?? ''],
      ];
      checks.forEach(([label, newVal, oldVal]) => {
        const nv = String(newVal ?? '');
        const ov = String(oldVal ?? '');
        if (nv !== ov) changes.push({ campo: label, de: ov, a: nv });
      });
      const hadDni  = !!original.dni_escaneado?.startsWith?.('data:');
      const hasDni  = !!data.dni_escaneado?.startsWith?.('data:');
      if (hadDni !== hasDni) changes.push({ campo: 'DNI ESCANEADO', de: hadDni ? 'Con archivo' : 'Sin archivo', a: hasDni ? 'Con archivo' : 'Sin archivo' });
      const hadFact = !!original.ultima_factura?.startsWith?.('data:');
      const hasFact = !!data.ultima_factura?.startsWith?.('data:');
      if (hadFact !== hasFact) changes.push({ campo: 'FACTURA', de: hadFact ? 'Con archivo' : 'Sin archivo', a: hasFact ? 'Con archivo' : 'Sin archivo' });
      const hadCifAut = !!original.cif_autonomo_url?.startsWith?.('data:');
      const hasCifAut = !!data.cif_autonomo_url?.startsWith?.('data:');
      if (hadCifAut !== hasCifAut) changes.push({ campo: 'CIF AUTÓNOMO', de: hadCifAut ? 'Con archivo' : 'Sin archivo', a: hasCifAut ? 'Con archivo' : 'Sin archivo' });
      const hadJustoT = !!original.justo_titulo_url?.startsWith?.('data:');
      const hasJustoT = !!data.justo_titulo_url?.startsWith?.('data:');
      if (hadJustoT !== hasJustoT) changes.push({ campo: 'JUSTO TÍTULO', de: hadJustoT ? 'Con archivo' : 'Sin archivo', a: hasJustoT ? 'Con archivo' : 'Sin archivo' });
      const hadFactB2b = !!original.factura_b2b_url?.startsWith?.('data:');
      const hasFactB2b = !!data.factura_b2b_url?.startsWith?.('data:');
      if (hadFactB2b !== hasFactB2b) changes.push({ campo: 'FACTURA B2B', de: hadFactB2b ? 'Con archivo' : 'Sin archivo', a: hasFactB2b ? 'Con archivo' : 'Sin archivo' });
    }

    const updateObj = {
      nombre:            data.nombre,
      cif_dni:           data.identificacion   !== undefined ? data.identificacion   : original?.cif_dni,
      telefono:          data.telefono,
      cups:              data.cups,
      tarifa:            data.tarifa,
      estado:            data.estado,
      mail:              data.mail              !== undefined ? data.mail              : original?.mail,
      cuenta_bancaria:   data.cuenta_bancaria   !== undefined ? data.cuenta_bancaria   : original?.cuenta_bancaria,
      fecha_tramitacion: data.fecha_tramitacion !== undefined ? data.fecha_tramitacion : original?.fecha_tramitacion,
      linea_negocio:     data.linea_negocio     !== undefined ? data.linea_negocio     : original?.linea_negocio,
      subtipo:           data.subtipo           !== undefined ? data.subtipo           : original?.subtipo,
      subtipo_otro:      data.subtipo_otro      !== undefined ? data.subtipo_otro      : original?.subtipo_otro,
      id_producto:       data.id_producto       !== undefined ? data.id_producto       : original?.id_producto,
      creado_por:        data.creado_por        !== undefined ? data.creado_por        : original?.creado_por,
      descripcion:       data.descripcion       !== undefined ? data.descripcion       : original?.descripcion,
      fecha_firma:       data.fecha_firma       !== undefined ? data.fecha_firma       : original?.fecha_firma,
      fecha_formalizada: data.fecha_formalizada !== undefined ? data.fecha_formalizada : original?.fecha_formalizada,
      comercial:         data.agente_gestor     !== undefined ? data.agente_gestor     : original?.comercial,
      ...(data.dni_escaneado    ? { dni_escaneado:    data.dni_escaneado    } : {}),
      ...(data.ultima_factura   ? { ultima_factura:   data.ultima_factura   } : {}),
      ...(data.cif_autonomo_url ? { cif_autonomo_url: data.cif_autonomo_url } : {}),
      ...(data.justo_titulo_url ? { justo_titulo_url: data.justo_titulo_url } : {}),
      ...(data.factura_b2b_url  ? { factura_b2b_url:  data.factura_b2b_url  } : {}),
      ...(data.consumo_anual_est !== undefined && {
        consumo_anual_est: (data.consumo_anual_est === '' || data.consumo_anual_est === null)
          ? null
          : Number(data.consumo_anual_est),
      }),
    };

    setClientes(prev => prev.map(c => c.id === id ? { ...c, ...updateObj } : c));

    supabase.from('clientes').update(updateObj).eq('id', id)
      .then(({ error }) => { if (error) console.error('updateCliente:', error); });

    const clientName = original?.nombre || data.nombre;
    const desc = changes.length > 0
      ? JSON.stringify({
          type:    'structured',
          header:  `${currentUser?.username} ha actualizado los datos del cliente ${clientName}`,
          changes,
        })
      : `${currentUser?.username} ha revisado el expediente de ${clientName}`;
    addActivity('Actualización', desc, currentUser?.username);
  };

  const setConsumoAnualEst = (id, valor) => {
    const v = (valor === '' || valor == null) ? null : Number(valor);
    setClientes(prev => prev.map(c => c.id === id ? { ...c, consumo_anual_est: v } : c));
    supabase.from('clientes').update({ consumo_anual_est: v }).eq('id', id)
      .then(({ error }) => { if (error) console.error('setConsumoAnualEst:', error); });
  };

  const firmarContrato = (id) => {
    const fechaHoy = today();
    const cliente  = clientes.find(c => c.id === id);
    setClientes(prev => prev.map(c => c.id === id ? { ...c, estado: 'Tramitado', fecha_firma: fechaHoy } : c));
    supabase.from('clientes').update({ estado: 'Tramitado', fecha_firma: fechaHoy }).eq('id', id)
      .then(({ error }) => { if (error) console.error('firmarContrato:', error); });
    if (cliente) {
      addActivity(
        'Activación',
        `${currentUser?.username} ha registrado la firma del contrato de ${cliente.nombre} (F. Firma: ${fechaHoy})`,
        currentUser?.username
      );
    }
  };

  const formalizarContrato = (id) => {
    const fechaHoy = today();
    const cliente  = clientes.find(c => c.id === id);
    setClientes(prev => prev.map(c => c.id === id ? { ...c, estado: 'Formalizado', fecha_formalizada: fechaHoy } : c));
    supabase.from('clientes').update({ estado: 'Formalizado', fecha_formalizada: fechaHoy }).eq('id', id)
      .then(({ error }) => { if (error) console.error('formalizarContrato:', error); });
    if (cliente) {
      addActivity(
        'Activación',
        `${currentUser?.username} ha formalizado el contrato de ${cliente.nombre} (F. Formalizada: ${fechaHoy})`,
        currentUser?.username
      );
    }
  };

  const renovarContrato = (id, nuevaFechaRef, nuevaFechaVenc, extraData = {}) => {
    const cliente = clientes.find(c => c.id === id);
    const updateObj = {
      fecha_formalizada: nuevaFechaRef,
      renovado:          true,
      fecha_renovacion:  nuevaFechaRef,
      ...extraData,
    };
    setClientes(prev => prev.map(c => c.id === id ? { ...c, ...updateObj } : c));
    supabase.from('clientes').update(updateObj).eq('id', id)
      .then(({ error }) => { if (error) console.error('renovarContrato:', error); });
    if (cliente) {
      addActivity(
        'Renovación',
        `${currentUser?.username} ha renovado el contrato de ${cliente.nombre} (Nueva ref.: ${nuevaFechaRef} · Vence: ${nuevaFechaVenc})`,
        currentUser?.username
      );
    }
  };

  const deleteCliente = (id) => {
    const cliente = clientes.find(c => c.id === id);
    setClientes(prev => prev.filter(c => c.id !== id));
    supabase.from('clientes').update({ deleted_at: new Date().toISOString() }).eq('id', id)
      .then(({ error }) => { if (error) console.error('deleteCliente:', error); });
    if (cliente) {
      addActivity(
        'Eliminación',
        `${currentUser?.username} ha eliminado el contrato de ${cliente.nombre}`,
        currentUser?.username
      );
    }
  };

  // ── Ranking ─────────────────────────────────────────────────────────────────

  const rankingComerciales = useMemo(() => {
    const now = new Date();
    const curMonth = now.getMonth();
    const curYear  = now.getFullYear();

    // Comparación directa sobre YYYY-MM-DD para evitar saltos de día por UTC
    const enMesActual = (fechaStr) => {
      const [y, m] = (fechaStr || '').split('-').map(Number);
      return m - 1 === curMonth && y === curYear;
    };

    const map = {};
    users.forEach((u) => {
      const initials = (u.displayName || u.username)
        .split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
      map[u.username] = { id: u.username, nombre: u.displayName || u.username, avatar: initials, cerrados: 0, pendientes: 0 };
    });
    clientes.forEach((c) => {
      if (!enMesActual(c.fecha_tramitacion)) return;
      const key = c.creado_por || '';
      if (!key) return;
      if (!map[key]) {
        const knownUser = users.find(u => u.username === key);
        const av = knownUser
          ? (knownUser.displayName || knownUser.username).split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
          : key.slice(0, 2).toUpperCase();
        map[key] = { id: key, nombre: knownUser?.displayName || key, avatar: av, cerrados: 0, pendientes: 0 };
      }
      if (c.estado === 'Formalizado') map[key].cerrados++;
      else if (c.estado === 'Tramitado' || c.estado === 'Pendiente Firma') map[key].pendientes++;
    });
    return Object.values(map).sort((a, b) => b.cerrados - a.cerrados || b.pendientes - a.pendientes);
  }, [clientes, users]);

  return (
    <DataContext.Provider value={{
      clientes,
      clientesB2C: clientes.filter(c => c.tipo === 'B2C' || c.tipo === 'CUR'),
      clientesB2B: clientes.filter(c => c.tipo === 'B2B' || c.tipo === 'CUR_B2B'),
      actividades,
      visitas,
      visitasPymes,
      rankingComerciales,
      isLoading,
      addCliente,
      updateCliente,
      setConsumoAnualEst,
      firmarContrato,
      formalizarContrato,
      renovarContrato,
      deleteCliente,
      addActivity,
      clearActividades,
      addVisita,
      updateVisita,
      deleteVisita,
      addVisitaPyme,
      updateVisitaPyme,
      updateEstadoVisitaPyme,
      transicionEstadoPyme,
      deleteVisitaPyme,
    }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used inside DataProvider');
  return ctx;
}
