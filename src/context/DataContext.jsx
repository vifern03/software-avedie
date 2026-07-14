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
// Los campos Base64 se excluyen del SELECT principal: con 99+ registros el
// payload supera el límite de Supabase y produce statement timeout (57014).
// En su lugar se almacenan flags booleanos (docsFlags) indicando si existe
// cada documento. El Base64 real se descarga SOLO al hacer clic (fetch-on-click).
const BINARY_FIELDS = [
  'dni_escaneado', 'dni_reverso', 'ultima_factura',
  'cif_autonomo_url', 'justo_titulo_url', 'factura_b2b_url',
];

// compartido_con se fetch en query separada (así el SELECT principal no falla
// si la columna aún no existe en BD)
const CLIENTES_SELECT = [
  'id', 'tipo', 'nombre', 'cif_dni', 'telefono', 'mail', 'cuenta_bancaria',
  'cups', 'tarifa', 'linea_negocio', 'subtipo', 'subtipo_otro', 'id_producto',
  'creado_por', 'vendido_por', 'descripcion', 'estado', 'comercial', 'equipo',
  'fecha_tramitacion', 'fecha_firma', 'fecha_formalizada', 'created_at',
  'deleted_at', 'consumo_anual_est',
].join(',');

// registro_pendientes: ledger independiente de TODAS las filas de los Excels de
// incidencias (existan o no como contrato en `clientes`). Ver [[project_pendientes]].
const REGISTRO_PENDIENTES_SELECT = [
  'id', 'cups', 'nombre', 'numero_caso', 'fecha_creacion_excel', 'origen_excel',
  'raw_data', 'estado_incidencia', 'fecha_formalizacion', 'created_at',
].join(',');

// Descarga ÚNICAMENTE el campo Base64 de UN cliente concreto (fetch-on-click)
export const fetchSingleDoc = async (clientId, campo) => {
  const { data, error } = await supabase
    .from('clientes')
    .select(`id,${campo}`)
    .eq('id', clientId)
    .single();
  if (error || !data) return null;
  return data[campo] || null;
};

// Campos de archivo (URLs de Supabase Storage) excluidos del SELECT principal de
// visitas / visitas_pymes — se piden SOLO al hacer clic (fetch-on-click), igual
// que fetchSingleDoc para clientes.
const VISITAS_SELECT = [
  'id', 'fecha', 'hora', 'dni', 'nombre', 'telefono', 'mail', 'tipo', 'tipo_otro',
  'punto_venta', 'registrado_por', 'equipo',
].join(',');

const VISITAS_PYMES_SELECT = [
  'id', 'fecha', 'hora', 'persona_autorizada', 'correo', 'telefono_contacto_cliente',
  'correo_electronico_cliente', 'comentarios_visita', 'registrado_por', 'nombre_empresa',
  'ubicacion', 'estado', 'fecha_enviada_comparativa', 'fecha_resolucion', 'latitud', 'longitud',
].join(',');

// Descarga ÚNICAMENTE la URL de UN archivo de UNA visita concreta (fetch-on-click)
export const fetchVisitaDoc = async (visitaId, campo) => {
  const { data, error } = await supabase
    .from('visitas')
    .select(`id,${campo}`)
    .eq('id', visitaId)
    .single();
  if (error || !data) return null;
  return data[campo] || null;
};

export const fetchVisitaPymeDoc = async (visitaId, campo) => {
  const { data, error } = await supabase
    .from('visitas_pymes')
    .select(`id,${campo}`)
    .eq('id', visitaId)
    .single();
  if (error || !data) return null;
  return data[campo] || null;
};

const cacheKey = (username) => `dashboard_cache_${username}`;

// Para contratos antiguos sin vendido_por, usar creado_por como fallback (excepto Canal Directo)
const normalizeCliente = (c) => ({
  ...c,
  vendido_por: c.vendido_por || (c.creado_por && c.creado_por !== 'Canal Directo' && c.creado_por !== 'Directo' ? c.creado_por : ''),
});

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
      // docsFlags se guarda tal cual (solo booleanos, muy ligero)
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

  const [clientes,      setClientes]      = useState([]);
  const [actividades,   setActividades]   = useState([]);
  const [visitas,       setVisitas]       = useState([]);
  const [visitasPymes,  setVisitasPymes]  = useState([]);
  const [registroPendientes, setRegistroPendientes] = useState([]);
  // CUPS de TODA la empresa (sin el scoping por equipo/vendedor que aplica al
  // array `clientes` para roles no-admin/no-manager). Se usa exclusivamente
  // para el punto verde/rojo de Gestión de Pendientes — ese indicador debe
  // reflejar si el CUPS existe en el CRM en general, no solo en la cartera
  // visible del usuario actual. Ver [[project_pendientes]].
  const [clientesCupsTodos, setClientesCupsTodos] = useState(new Set());
  const [docsFlags,     setDocsFlags]     = useState({});
  const [visitasDocsFlags,      setVisitasDocsFlags]      = useState({});
  const [visitasPymesDocsFlags, setVisitasPymesDocsFlags] = useState({});
  const [isLoading,     setIsLoading]     = useState(true);
  const [prescriptores,    setPrescriptores]    = useState([]); // [{id, nombre}]
  const [prescriptorLinks, setPrescriptorLinks] = useState({}); // {nombre_prescriptor: username_crm}

  // ── Carga de prescriptores + vínculos CRM ────────────────────────────────────
  useEffect(() => {
    if (!currentUser) { setPrescriptores([]); setPrescriptorLinks({}); return; }
    Promise.all([
      supabase.from('prescriptores').select('id,nombre').order('nombre'),
      supabase.from('configuracion').select('valor').eq('clave', 'prescriptor_links').maybeSingle(),
    ]).then(([presResp, linksResp]) => {
      if (presResp.data) setPrescriptores(presResp.data);
      if (linksResp.data?.valor) {
        try { setPrescriptorLinks(JSON.parse(linksResp.data.valor)); } catch {}
      }
    });
  }, [currentUser?.username]);

  // ── Clave de la última carga completada: evita el double-fetch cuando
  // AuthContext revalida currentUser con los mismos datos de BD.
  const lastFetchKey = useRef(null);

  useEffect(() => {
    // Si no hay usuario, limpiar estado (cambio de cuenta o logout)
    if (!currentUser) {
      setClientes([]);
      setActividades([]);
      setVisitas([]);
      setVisitasPymes([]);
      setRegistroPendientes([]);
      setClientesCupsTodos(new Set());
      setVisitasDocsFlags({});
      setVisitasPymesDocsFlags({});
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
      setClientes(userCache.clientes       || []);
      setActividades(userCache.actividades || []);
      setVisitas(userCache.visitas         || []);
      setVisitasPymes(userCache.visitasPymes || []);
      setRegistroPendientes(userCache.registroPendientes || []);
      setDocsFlags(userCache.docsFlags     || {});
      setVisitasDocsFlags(userCache.visitasDocsFlags         || {});
      setVisitasPymesDocsFlags(userCache.visitasPymesDocsFlags || {});
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
      // Las URLs de archivo (dni_cif_escaneado_url/reverso) se excluyen del SELECT
      // principal — se piden bajo demanda con fetchVisitaDoc (ver docsFlags abajo).
      let visitasQuery = supabase
        .from('visitas')
        .select(VISITAS_SELECT)
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
      // Igual que arriba: foto_negocio_url/factura_url/comparativa_url se piden
      // bajo demanda con fetchVisitaPymeDoc (ver docsFlags abajo).
      let visitasPymesQuery = supabase
        .from('visitas_pymes')
        .select(VISITAS_PYMES_SELECT)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (!isAdmin && !isManager) {
        visitasPymesQuery = visitasPymesQuery.eq('registrado_por', currentUser.username);
      }

      // ── compartido_con / shared_by (query separada, falla silenciosamente si no existen las columnas)
      const compartidoQuery = supabase
        .from('clientes')
        .select('id,compartido_con,shared_by')
        .is('deleted_at', null);

      // ── Contratos compartidos con el usuario (solo para no-admin/manager)
      // IMPORTANTE: compartido_con almacena displayName ("CARMEN BALLESTEROS"),
      // no username ("CARMENBALLESTEROS") — filtrar siempre por displayName.
      const userDisplayName = (currentUser.displayName || currentUser.username).trim();
      const sharedQuery = (!isAdmin && !isManager)
        ? supabase
            .from('clientes')
            .select(CLIENTES_SELECT)
            .is('deleted_at', null)
            .filter('compartido_con', 'cs', `{"${userDisplayName}"}`)
            .order('created_at', { ascending: false })
        : null;

      // ── Contratos donde el usuario es vendedor/prescriptor ────────────────────
      // Busca por:
      //   1. Nombres de prescriptor vinculados a este usuario en prescriptorLinks
      //      (ej: ANGELGARCIA → "ANGEL LUIS", displayName "ANGEL LUIS GARCIA")
      //   2. El displayName propio como fallback (ej: OSCARFERNANDEZ → "OSCAR FERNANDEZ")
      // Esto cubre todos los casos sin depender de que displayName == nombre prescriptor.
      let vendedorQuery = null;
      if (!isAdmin && !isManager) {
        // Cargar prescriptorLinks frescos desde BD para tener los vínculos actualizados
        const { data: freshLinksData } = await supabase
          .from('configuracion').select('valor').eq('clave', 'prescriptor_links').maybeSingle();
        let freshLinks = {};
        if (freshLinksData?.valor) { try { freshLinks = JSON.parse(freshLinksData.valor); } catch {} }
        setPrescriptorLinks(freshLinks);

        // Nombres de prescriptor vinculados a este usuario (ej: ["ANGEL LUIS", "OSCAR FERNANDEZ"])
        const linkedNames = Object.entries(freshLinks)
          .filter(([, uname]) => uname === currentUser.username)
          .map(([nombre]) => nombre);

        // Unión de linked names + displayName (sin duplicados)
        const vendedorNames = [...new Set([...linkedNames, userDisplayName])].filter(Boolean);

        if (vendedorNames.length > 0) {
          const orClause = vendedorNames
            .flatMap(n => [`vendido_por.eq.${n}`, `creado_por.eq.${n}`])
            .join(',');
          vendedorQuery = supabase
            .from('clientes')
            .select(CLIENTES_SELECT)
            .is('deleted_at', null)
            .or(orClause)
            .order('created_at', { ascending: false });
        }
      }

      // Consultas de existencia de documentos — builders independientes
      const mkFlag = (col) => supabase.from('clientes').select('id').is('deleted_at', null).not(col, 'is', null);
      // visitas/visitas_pymes guardan '' (no NULL) cuando no hay archivo adjunto,
      // así que hay que excluir ambos casos para no marcar falsos positivos.
      const mkFlagFor = (table, col) => supabase.from(table).select('id').is('deleted_at', null).not(col, 'is', null).neq(col, '');

      // registro_pendientes: TODAS las filas no borradas, sin filtrar por
      // estado_incidencia — los contratos "Formalizado" NUNCA deben ocultarse,
      // se quedan como histórico visible en la tabla (ver [[project_pendientes]]).
      // Falla silenciosamente (error tolerado) si la tabla aún no existe en BD.
      const registroPendientesQuery = supabase
        .from('registro_pendientes')
        .select(REGISTRO_PENDIENTES_SELECT)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      // CUPS de TODA la empresa, sin el scoping por equipo/vendedor que aplica
      // a `clientesQuery` — solo para el indicador verde/rojo de Pendientes.
      const clientesCupsTodosQuery = supabase.from('clientes').select('cups').is('deleted_at', null);

      const [
        { data: clientesData,     error: clientesErr  },
        { data: actividadesData },
        { data: visitasData },
        { data: visitasPymesData },
        { data: registroPendientesData, error: registroPendientesErr },
        { data: clientesCupsTodosData },
        { data: compartidoData,   error: compartidoErr },
        { data: sharedRaw },
        { data: vendedorRaw },
        { data: dniData    },
        { data: factData   },
        { data: cifData    },
        { data: justoData  },
        { data: fb2bData   },
        { data: anversoData    },
        { data: reversoData    },
        { data: fotoNegocioData },
        { data: facturaPymeData },
        { data: comparativaPymeData },
      ] = await Promise.all([
        clientesQuery,
        supabase.from('actividades').select('*').is('deleted_at', null).order('created_at', { ascending: false }),
        visitasQuery,
        visitasPymesQuery,
        registroPendientesQuery,
        clientesCupsTodosQuery,
        compartidoQuery,
        sharedQuery    || Promise.resolve({ data: [], error: null }),
        vendedorQuery  || Promise.resolve({ data: [], error: null }),
        mkFlag('dni_escaneado'),
        mkFlag('ultima_factura'),
        mkFlag('cif_autonomo_url'),
        mkFlag('justo_titulo_url'),
        mkFlag('factura_b2b_url'),
        mkFlagFor('visitas',       'dni_cif_escaneado_url'),
        mkFlagFor('visitas',       'dni_cif_reverso_url'),
        mkFlagFor('visitas_pymes', 'foto_negocio_url'),
        mkFlagFor('visitas_pymes', 'factura_url'),
        mkFlagFor('visitas_pymes', 'comparativa_url'),
      ]);

      // ── 3. Evitar race condition: descartar si el usuario cambió ──────────
      if (lastFetchKey.current !== fetchKey) return;

      if (clientesErr) {
        if (!userCache) setIsLoading(false);
        return;
      }

      // Construir mapa de compartido_con/shared_by (vacío si las columnas no existen aún)
      const compartidoMap = {};
      if (!compartidoErr && compartidoData) {
        compartidoData.forEach(r => {
          compartidoMap[r.id] = { compartido_con: r.compartido_con || [], shared_by: r.shared_by || null };
        });
      }
      const compartidoFor = (id) => compartidoMap[id] || { compartido_con: [], shared_by: null };

      // Fusionar compartido_con/shared_by en los registros principales y normalizar vendido_por
      const mainClientes = (clientesData || []).map(c => normalizeCliente({
        ...c,
        ...compartidoFor(c.id),
      }));

      // Añadir contratos compartidos y contratos vendidos/prescritos que no estén ya en mainClientes
      const ownIds = new Set(mainClientes.map(c => c.id));
      const extraShared = (sharedRaw || [])
        .filter(c => !ownIds.has(c.id))
        .map(c => normalizeCliente({ ...c, ...compartidoFor(c.id) }));

      const sharedIds = new Set([...ownIds, ...extraShared.map(c => c.id)]);
      const extraVendedor = (vendedorRaw || [])
        .filter(c => !sharedIds.has(c.id))
        .map(c => normalizeCliente({ ...c, ...compartidoFor(c.id) }));

      const newClientes     = [...mainClientes, ...extraShared, ...extraVendedor];
      const newActividades  = actividadesData  || [];
      const newVisitas      = visitasData      || [];
      const newVisitasPymes = visitasPymesData || [];
      // Tolerante a que la tabla aún no exista (antes de ejecutar supabase_pendientes_v2.sql)
      const newRegistroPendientes = registroPendientesErr ? [] : (registroPendientesData || []);
      const newClientesCupsTodos = new Set(
        (clientesCupsTodosData || []).map(c => (c.cups || '').toUpperCase().trim()).filter(Boolean)
      );

      // Construir mapa de flags booleanos
      const dniSet     = new Set((dniData    || []).map(r => r.id));
      const factSet    = new Set((factData   || []).map(r => r.id));
      const cifSet     = new Set((cifData    || []).map(r => r.id));
      const justoSet   = new Set((justoData  || []).map(r => r.id));
      const fb2bSet    = new Set((fb2bData   || []).map(r => r.id));

      const newDocsFlags = {};
      newClientes.forEach(c => {
        newDocsFlags[c.id] = {
          tiene_dni:         dniSet.has(c.id),
          tiene_factura:     factSet.has(c.id),
          tiene_cif:         cifSet.has(c.id),
          tiene_justo:       justoSet.has(c.id),
          tiene_factura_b2b: fb2bSet.has(c.id),
        };
      });

      // Flags booleanos de archivos de visitas (igual patrón que docsFlags de clientes)
      const anversoSet     = new Set((anversoData     || []).map(r => r.id));
      const reversoSet     = new Set((reversoData     || []).map(r => r.id));
      const fotoNegocioSet = new Set((fotoNegocioData || []).map(r => r.id));
      const facturaPymeSet = new Set((facturaPymeData || []).map(r => r.id));
      const compPymeSet    = new Set((comparativaPymeData || []).map(r => r.id));

      const newVisitasDocsFlags = {};
      newVisitas.forEach(v => {
        newVisitasDocsFlags[v.id] = {
          tiene_anverso: anversoSet.has(v.id),
          tiene_reverso: reversoSet.has(v.id),
        };
      });

      const newVisitasPymesDocsFlags = {};
      newVisitasPymes.forEach(v => {
        newVisitasPymesDocsFlags[v.id] = {
          tiene_foto:        fotoNegocioSet.has(v.id),
          tiene_factura:     facturaPymeSet.has(v.id),
          tiene_comparativa: compPymeSet.has(v.id),
        };
      });

      setClientes(newClientes);
      setActividades(newActividades);
      setVisitas(newVisitas);
      setVisitasPymes(newVisitasPymes);
      setRegistroPendientes(newRegistroPendientes);
      setClientesCupsTodos(newClientesCupsTodos);
      setDocsFlags(newDocsFlags);
      setVisitasDocsFlags(newVisitasDocsFlags);
      setVisitasPymesDocsFlags(newVisitasPymesDocsFlags);

      writeCache(currentUser.username, {
        clientes:     newClientes,
        actividades:  newActividades,
        visitas:      newVisitas,
        visitasPymes: newVisitasPymes,
        registroPendientes: newRegistroPendientes,
        docsFlags:    newDocsFlags,
        visitasDocsFlags:      newVisitasDocsFlags,
        visitasPymesDocsFlags: newVisitasPymesDocsFlags,
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

  const updateVisita = async (id, data, dniAnverso, dniReverso) => {
    // El anverso/reverso actual ya no viaja en el estado local (fetch-on-click),
    // así que si no se sube un archivo nuevo se recupera el valor vigente en BD
    // para no perder la referencia al documento existente.
    const dni_cif_escaneado_url = dniAnverso
      ? (await _uploadDniFile(dniAnverso)) || (await fetchVisitaDoc(id, 'dni_cif_escaneado_url')) || ''
      : (await fetchVisitaDoc(id, 'dni_cif_escaneado_url')) || '';
    const dni_cif_reverso_url = dniReverso
      ? (await _uploadDniFile(dniReverso)) || (await fetchVisitaDoc(id, 'dni_cif_reverso_url')) || ''
      : (await fetchVisitaDoc(id, 'dni_cif_reverso_url')) || '';
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
      latitud:                      data.latitud                   ?? null,
      longitud:                     data.longitud                  ?? null,
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

  // El foto/factura/comparativa actuales ya no viajan en el estado local
  // (fetch-on-click), así que si no hay archivo nuevo ni se pide borrar, se
  // recupera el valor vigente en BD para no perder la referencia existente.
  const updateVisitaPyme = async (id, data, fotoFile, facturaFile, comparativaFile, clearFactura = false, clearComparativa = false) => {
    let foto_url;
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
        foto_url = (await fetchVisitaPymeDoc(id, 'foto_negocio_url')) || '';
      }
    } else {
      foto_url = (await fetchVisitaPymeDoc(id, 'foto_negocio_url')) || '';
    }

    const factura_url = facturaFile
      ? (await _uploadPymeDoc(facturaFile, 'factura')) || (await fetchVisitaPymeDoc(id, 'factura_url')) || ''
      : (clearFactura ? null : (await fetchVisitaPymeDoc(id, 'factura_url')) || '');
    const comparativa_url = comparativaFile
      ? (await _uploadPymeDoc(comparativaFile, 'comparativa')) || (await fetchVisitaPymeDoc(id, 'comparativa_url')) || ''
      : (clearComparativa ? null : (await fetchVisitaPymeDoc(id, 'comparativa_url')) || '');

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
      ...(data.latitud  !== undefined && { latitud:  data.latitud  ?? null }),
      ...(data.longitud !== undefined && { longitud: data.longitud ?? null }),
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
      vendido_por:      data.vendido_por     || '',
      descripcion:      data.descripcion     || '',
      estado:           data.estado          || 'Pendiente Firma',
      comercial:        data.agente_gestor   || currentUser?.username || 'Desconocido',
      equipo:           currentUser?.equipo  || 'Ambos',
      fecha_tramitacion: tramitacion,
      fecha_firma:       data.fecha_firma       || null,
      fecha_formalizada: data.fecha_formalizada || null,
      compartido_con:    data.compartido_con    || [],
      shared_by:         (data.compartido_con || []).length > 0 ? (currentUser?.username || null) : null,
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
    setDocsFlags(prev => ({
      ...prev,
      [newCliente.id]: {
        tiene_dni:         !!(data.dni_escaneado),
        tiene_factura:     !!(data.ultima_factura),
        tiene_cif:         !!(data.cif_autonomo_url),
        tiene_justo:       !!(data.justo_titulo_url),
        tiene_factura_b2b: !!(data.factura_b2b_url),
      },
    }));
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
        ['VENDIDO POR',       data.vendido_por     ?? '',   original.vendido_por     ?? ''],
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
      vendido_por:       data.vendido_por       !== undefined ? data.vendido_por       : original?.vendido_por,
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

    const flagPatch = {};
    if (data.dni_escaneado)    flagPatch.tiene_dni         = true;
    if (data.ultima_factura)   flagPatch.tiene_factura     = true;
    if (data.cif_autonomo_url) flagPatch.tiene_cif         = true;
    if (data.justo_titulo_url) flagPatch.tiene_justo       = true;
    if (data.factura_b2b_url)  flagPatch.tiene_factura_b2b = true;
    if (Object.keys(flagPatch).length > 0) {
      setDocsFlags(prev => ({ ...prev, [id]: { ...(prev[id] || {}), ...flagPatch } }));
    }

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

  // Actualiza la lista de trabajadores con acceso a un contrato específico.
  // shared_by registra quién compartió (se limpia si la lista queda vacía).
  const updateCompartidoCon = async (id, compartidoCon, sharedByUsername) => {
    const arr = Array.isArray(compartidoCon) ? compartidoCon : [];
    const shared_by = arr.length > 0 ? (sharedByUsername || currentUser?.username || null) : null;
    setClientes(prev => prev.map(c => c.id === id ? { ...c, compartido_con: arr, shared_by } : c));
    const { error } = await supabase.from('clientes').update({ compartido_con: arr, shared_by }).eq('id', id);
    if (error) { console.error('updateCompartidoCon:', error); return { error }; }
    return { error: null };
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

  // ── Gestión de Pendientes (registro_pendientes — ledger independiente) ──────
  // Ver [[project_pendientes]]: cada fila del Excel se conserva SIEMPRE aquí,
  // exista o no (todavía) como contrato en `clientes`. El cruce con `clientes`
  // (círculo verde/rojo) se hace en el cliente (Pendientes.jsx), no aquí.

  // Inserta TODAS las filas leídas del/de los Excel(s), sin filtrar por si el
  // CUPS existe en `clientes` — así no se pierde ningún registro. `rows` es
  // [{ cups, nombre, numero_caso, fecha_creacion_excel, origen_excel, raw_data }].
  const ingestExcelPendientes = async (rows) => {
    const limpias = (rows || [])
      .map(r => ({ ...r, cups: String(r.cups ?? '').trim() }))
      .filter(r => r.cups);
    if (limpias.length === 0) return { inserted: 0, error: null };

    const registros = limpias.map((r, i) => ({
      id:                   Date.now() + i,
      cups:                 r.cups,
      nombre:               r.nombre               || null,
      numero_caso:          r.numero_caso          || null,
      fecha_creacion_excel: r.fecha_creacion_excel || null,
      origen_excel:         r.origen_excel         || null,
      raw_data:             r.raw_data             || null,
      estado_incidencia:    'Pendiente de tareas',
    }));

    const { data, error } = await supabase.from('registro_pendientes').insert(registros).select('id');
    if (error) { console.error('ingestExcelPendientes:', error); return { inserted: 0, error }; }

    // Recargar desde BD en vez de fusionar en memoria: más simple y evita
    // desincronizar el estado local si la inserción parcial falla en algún punto.
    const { data: fresh } = await supabase
      .from('registro_pendientes')
      .select(REGISTRO_PENDIENTES_SELECT)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (fresh) setRegistroPendientes(fresh);

    addActivity(
      'Pendientes',
      `${currentUser?.username} ha subido Excel(s) de incidencias: ${data?.length || 0} fila(s) registradas en el embudo de Pendientes`,
      currentUser?.username
    );
    return { inserted: data?.length || 0, error: null };
  };

  // Cambia el estado de un registro de Pendientes a cualquiera de los 3
  // posibles: 'Pendiente de tareas' | 'Tramitado' | 'Formalizado'. Sustituye a
  // las antiguas tramitarPendiente/formalizarPendiente — ahora el comercial
  // elige el estado desde el modal de edición (lápiz) y puede incluso revertir
  // un Formalizado/Tramitado de vuelta a Pendiente si se marcó por error.
  //
  // Al pasar A 'Formalizado' se fija fecha_formalizacion = NOW(); en cualquier
  // otro estado se limpia a null. Además, SI Y SOLO SI existe EXACTAMENTE UN
  // contrato en `clientes` con ese mismo CUPS, se refleja también ahí
  // actualizando fecha_formalizada (mismo formato ISO que ya usa
  // formalizarContrato()). Esa comprobación se hace con una consulta en vivo a
  // Supabase (no contra el array `clientes` en memoria, que para roles no-
  // admin/no-manager viene recortado por equipo/vendedor y daría un recuento
  // de coincidencias incorrecto). Con 0 o 2+ coincidencias, o al revertir
  // desde Formalizado, NO se toca `clientes` — sería ambiguo o inesperado
  // modificar automáticamente la fecha real de formalización del contrato.
  const actualizarEstadoPendiente = async (id, nuevoEstado) => {
    const esFormalizado = nuevoEstado === 'Formalizado';
    const fechaHoy = today();
    const updateObj = {
      estado_incidencia: nuevoEstado,
      fecha_formalizacion: esFormalizado ? new Date().toISOString() : null,
    };

    setRegistroPendientes(prev => prev.map(r => r.id === id ? { ...r, ...updateObj } : r));
    const registro = registroPendientes.find(r => r.id === id);

    const { error } = await supabase.from('registro_pendientes').update(updateObj).eq('id', id);
    if (error) { console.error('actualizarEstadoPendiente:', error); return { error }; }

    if (esFormalizado && registro?.cups) {
      const { data: matches } = await supabase
        .from('clientes').select('id').eq('cups', registro.cups).is('deleted_at', null);
      if (matches?.length === 1) {
        const clienteId = matches[0].id;
        setClientes(prev => prev.map(c => c.id === clienteId ? { ...c, fecha_formalizada: fechaHoy } : c));
        await supabase.from('clientes').update({ fecha_formalizada: fechaHoy }).eq('id', clienteId);
      }
    }

    if (registro) {
      const verbo = nuevoEstado === 'Formalizado' ? 'formalizado'
        : nuevoEstado === 'Tramitado' ? 'tramitado'
        : 'revertido a pendiente';
      addActivity('Pendientes', `${currentUser?.username} ha ${verbo} la incidencia de ${registro.nombre || registro.cups}`, currentUser?.username);
    }
    return { error: null };
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
    setDocsFlags(prev => { const next = { ...prev }; delete next[id]; return next; });
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

  // ── CRUD de prescriptores ───────────────────────────────────────────────────

  const addPrescriptor = async (nombre) => {
    const trimmed = nombre.trim().toUpperCase();
    if (!trimmed) return { error: 'Nombre vacío' };
    const { data, error } = await supabase
      .from('prescriptores').insert([{ nombre: trimmed }]).select().single();
    if (!error && data) {
      setPrescriptores(prev => [...prev, data].sort((a, b) => a.nombre.localeCompare(b.nombre)));
    }
    return { error };
  };

  const renamePrescriptor = async (id, newNombre) => {
    const trimmed = newNombre.trim().toUpperCase();
    if (!trimmed) return { error: 'Nombre vacío' };
    const { error } = await supabase
      .from('prescriptores').update({ nombre: trimmed }).eq('id', id);
    if (!error) {
      setPrescriptores(prev =>
        prev.map(p => p.id === id ? { ...p, nombre: trimmed } : p)
            .sort((a, b) => a.nombre.localeCompare(b.nombre))
      );
    }
    return { error };
  };

  const deletePrescriptor = async (id) => {
    const { error } = await supabase.from('prescriptores').delete().eq('id', id);
    if (!error) setPrescriptores(prev => prev.filter(p => p.id !== id));
    return { error };
  };

  // ── Reasignación masiva de prescriptor ─────────────────────────────────────

  const bulkReasignPrescriptor = async (oldName, newName) => {
    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      supabase.from('clientes').update({ creado_por: newName }).eq('creado_por', oldName),
      supabase.from('clientes').update({ vendido_por: newName }).eq('vendido_por', oldName),
    ]);
    const error = e1 || e2;
    if (!error) {
      setClientes(prev => prev.map(c => ({
        ...c,
        creado_por:  c.creado_por  === oldName ? newName : c.creado_por,
        vendido_por: c.vendido_por === oldName ? newName : c.vendido_por,
      })));
    }
    return { error };
  };

  // ── Vinculación prescriptor ↔ cuenta CRM ──────────────────────────────────────
  const linkPrescriptor = async (nombre, username) => {
    const updated = username
      ? { ...prescriptorLinks, [nombre]: username }
      : (() => { const c = { ...prescriptorLinks }; delete c[nombre]; return c; })();
    const { error } = await supabase
      .from('configuracion')
      .upsert({ clave: 'prescriptor_links', valor: JSON.stringify(updated) }, { onConflict: 'clave' });
    if (!error) setPrescriptorLinks(updated);
    return { error };
  };

  // ── Rankings ─────────────────────────────────────────────────────────────────

  const { rankingComerciales, rankingB2C, rankingB2B } = useMemo(() => {
    const now = new Date();
    const curMonth = now.getMonth();
    const curYear  = now.getFullYear();

    const enMesActual = (fechaStr) => {
      const [y, m] = (fechaStr || '').split('-').map(Number);
      return m - 1 === curMonth && y === curYear;
    };

    const makeMap = () => {
      const m = {};
      users.forEach((u) => {
        const initials = (u.displayName || u.username)
          .split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
        m[u.username] = { id: u.username, nombre: u.displayName || u.username, avatar: initials, cerrados: 0, pendientes: 0 };
      });
      return m;
    };

    const addEntry = (map, key, c) => {
      if (!map[key]) {
        const knownUser = users.find(u => u.username === key);
        const av = knownUser
          ? (knownUser.displayName || knownUser.username).split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
          : key.slice(0, 2).toUpperCase();
        map[key] = { id: key, nombre: knownUser?.displayName || key, avatar: av, cerrados: 0, pendientes: 0 };
      }
      if (c.estado === 'Formalizado') map[key].cerrados++;
      else if (c.estado === 'Tramitado' || c.estado === 'Pendiente Firma') map[key].pendientes++;
    };

    const mapAll = makeMap();
    const mapB2C = makeMap();
    const mapB2B = makeMap();

    clientes.forEach((c) => {
      if (!enMesActual(c.fecha_tramitacion)) return;
      const key = c.vendido_por || '';
      if (!key) return;
      addEntry(mapAll, key, c);
      if (c.tipo === 'B2C' || c.tipo === 'CUR')     addEntry(mapB2C, key, c);
      if (c.tipo === 'B2B' || c.tipo === 'CUR_B2B') addEntry(mapB2B, key, c);
    });

    const toRanking = (map) =>
      Object.values(map).sort((a, b) => b.cerrados - a.cerrados || b.pendientes - a.pendientes);

    const toRankingFiltered = (map) =>
      Object.values(map)
        .filter(e => e.cerrados > 0 || e.pendientes > 0)
        .sort((a, b) => b.cerrados - a.cerrados || b.pendientes - a.pendientes);

    return {
      rankingComerciales: toRanking(mapAll),
      rankingB2C:         toRankingFiltered(mapB2C),
      rankingB2B:         toRankingFiltered(mapB2B),
    };
  }, [clientes, users]);

  return (
    <DataContext.Provider value={{
      clientes,
      clientesB2C: clientes.filter(c => c.tipo === 'B2C' || c.tipo === 'CUR'),
      clientesB2B: clientes.filter(c => c.tipo === 'B2B' || c.tipo === 'CUR_B2B'),
      actividades,
      visitas,
      visitasPymes,
      docsFlags,
      visitasDocsFlags,
      visitasPymesDocsFlags,
      rankingComerciales,
      rankingB2C,
      rankingB2B,
      isLoading,
      addCliente,
      updateCliente,
      updateCompartidoCon,
      setConsumoAnualEst,
      firmarContrato,
      formalizarContrato,
      renovarContrato,
      deleteCliente,
      registroPendientes,
      clientesCupsTodos,
      ingestExcelPendientes,
      actualizarEstadoPendiente,
      prescriptores,
      prescriptorLinks,
      addPrescriptor,
      renamePrescriptor,
      deletePrescriptor,
      bulkReasignPrescriptor,
      linkPrescriptor,
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
