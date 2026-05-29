import { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { useAuth } from './AuthContext';

const DataContext = createContext(null);

const LS_CLIENTES    = 'crm_avedie_clientes';
const LS_ACTIVIDADES = 'crm_avedie_actividades';
const LS_VISITAS     = 'crm_avedie_visitas';
const LS_VERSION     = 'crm_avedie_data_version';
const DATA_VERSION   = '4';

// Migration: v3 → v4 (preserve data, adapt schema)
try {
  const stored = localStorage.getItem(LS_VERSION);
  if (stored !== DATA_VERSION) {
    if (stored === '3') {
      const raw = localStorage.getItem(LS_CLIENTES);
      if (raw) {
        try {
          const old = JSON.parse(raw);
          const migrated = old.map((c) => ({
            ...c,
            estado: c.estado === 'Activo'
              ? 'Formalizado'
              : c.estado === 'Pendiente de Activación'
                ? 'Pendiente Firma'
                : (c.estado || 'Pendiente Firma'),
            fecha_formalizada: c.fecha_formalizada || c.fecha_alta || null,
            fecha_firma:       c.fecha_firma       || null,
            linea_negocio:     c.linea_negocio     || '',
            subtipo:           c.subtipo           || '',
            subtipo_otro:      c.subtipo_otro      || '',
            id_producto:       c.id_producto       || '',
            creado_por:        c.creado_por        || '',
            descripcion:       c.descripcion       || '',
          }));
          localStorage.setItem(LS_CLIENTES, JSON.stringify(migrated));
        } catch {}
      }
    } else {
      // unknown / older version → wipe
      localStorage.removeItem(LS_CLIENTES);
      localStorage.removeItem(LS_ACTIVIDADES);
    }
    localStorage.setItem(LS_VERSION, DATA_VERSION);
  }
} catch {}

function loadLS(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

const today = () => new Date().toISOString().split('T')[0];

export function DataProvider({ children }) {
  const { currentUser, users } = useAuth();

  const [clientes,    setClientes]    = useState(() => loadLS(LS_CLIENTES,    []));
  const [actividades, setActividades] = useState(() => loadLS(LS_ACTIVIDADES, []));
  const [visitas,     setVisitas]     = useState(() => loadLS(LS_VISITAS,     []));

  useEffect(() => { localStorage.setItem(LS_CLIENTES,    JSON.stringify(clientes));    }, [clientes]);
  useEffect(() => { localStorage.setItem(LS_ACTIVIDADES, JSON.stringify(actividades)); }, [actividades]);
  useEffect(() => { localStorage.setItem(LS_VISITAS,     JSON.stringify(visitas));     }, [visitas]);

  const addActivity = (tipo, descripcion, comercial) => {
    const now = new Date();
    setActividades((prev) => [{
      id:          Date.now(),
      tipo,
      descripcion,
      comercial:   comercial || currentUser?.username || 'Sistema',
      fecha:       now.toISOString().split('T')[0],
      hora:        now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
    }, ...prev]);
  };

  const clearActividades = () => setActividades([]);

  const addVisita = (data) => {
    setVisitas((prev) => [{
      id:             Date.now(),
      fecha:          data.fecha,
      hora:           data.hora,
      dni:            data.dni,
      nombre:         data.nombre,
      telefono:       data.telefono,
      mail:           data.mail       || '',
      tipo:           data.tipo,
      tipo_otro:      data.tipo_otro  || '',
      registrado_por: currentUser?.username || 'Sistema',
    }, ...prev]);
  };

  const updateVisita = (id, data) => {
    setVisitas((prev) => prev.map((v) => v.id === id ? { ...v, ...data } : v));
  };

  const deleteVisita = (id) => {
    setVisitas((prev) => prev.filter((v) => v.id !== id));
  };

  const addCliente = (data, tipo) => {
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
      fecha_tramitacion: tramitacion,
      fecha_firma:       null,
      fecha_formalizada: null,
      dni_escaneado:    data.dni_escaneado   || '',
      ultima_factura:   data.ultima_factura  || '',
    };
    setClientes((prev) => [newCliente, ...prev]);
    addActivity(
      tipo === 'B2B' ? 'Alta B2B' : 'Alta B2C',
      `${currentUser?.username} ha tramitado un nuevo contrato ${tipo} para el cliente ${data.nombre}`,
      currentUser?.username
    );
  };

  const updateCliente = (id, data) => {
    const original = clientes.find((c) => c.id === id);
    const changes = [];

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
    }

    setClientes((prev) =>
      prev.map((c) =>
        c.id === id ? {
          ...c,
          nombre:            data.nombre,
          cif_dni:           data.identificacion   !== undefined ? data.identificacion   : c.cif_dni,
          telefono:          data.telefono,
          cups:              data.cups,
          tarifa:            data.tarifa,
          estado:            data.estado,
          mail:              data.mail              !== undefined ? data.mail              : c.mail,
          cuenta_bancaria:   data.cuenta_bancaria   !== undefined ? data.cuenta_bancaria   : c.cuenta_bancaria,
          fecha_tramitacion: data.fecha_tramitacion !== undefined ? data.fecha_tramitacion : c.fecha_tramitacion,
          linea_negocio:     data.linea_negocio     !== undefined ? data.linea_negocio     : c.linea_negocio,
          subtipo:           data.subtipo           !== undefined ? data.subtipo           : c.subtipo,
          subtipo_otro:      data.subtipo_otro      !== undefined ? data.subtipo_otro      : c.subtipo_otro,
          id_producto:       data.id_producto       !== undefined ? data.id_producto       : c.id_producto,
          creado_por:        data.creado_por        !== undefined ? data.creado_por        : c.creado_por,
          descripcion:       data.descripcion       !== undefined ? data.descripcion       : c.descripcion,
          fecha_firma:       data.fecha_firma       !== undefined ? data.fecha_firma       : c.fecha_firma,
          fecha_formalizada: data.fecha_formalizada !== undefined ? data.fecha_formalizada : c.fecha_formalizada,
          ...(data.agente_gestor  !== undefined && { comercial:      data.agente_gestor  }),
          ...(data.dni_escaneado  !== undefined && { dni_escaneado:  data.dni_escaneado  }),
          ...(data.ultima_factura !== undefined && { ultima_factura: data.ultima_factura }),
        } : c
      )
    );

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

  const firmarContrato = (id) => {
    const fechaHoy = today();
    const cliente  = clientes.find((c) => c.id === id);
    setClientes((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, estado: 'Tramitado', fecha_firma: fechaHoy } : c
      )
    );
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
    const cliente  = clientes.find((c) => c.id === id);
    setClientes((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, estado: 'Formalizado', fecha_formalizada: fechaHoy } : c
      )
    );
    if (cliente) {
      addActivity(
        'Activación',
        `${currentUser?.username} ha formalizado el contrato de ${cliente.nombre} (F. Formalizada: ${fechaHoy})`,
        currentUser?.username
      );
    }
  };

  const deleteCliente = (id) => {
    const cliente = clientes.find((c) => c.id === id);
    setClientes((prev) => prev.filter((c) => c.id !== id));
    if (cliente) {
      addActivity(
        'Eliminación',
        `${currentUser?.username} ha eliminado el contrato de ${cliente.nombre}`,
        currentUser?.username
      );
    }
  };

  const rankingComerciales = useMemo(() => {
    const map = {};
    users.forEach((u) => {
      const initials = (u.displayName || u.username)
        .split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
      map[u.username] = { id: u.username, nombre: u.displayName || u.username, avatar: initials, cerrados: 0, pendientes: 0 };
    });
    clientes.forEach((c) => {
      if (!map[c.comercial]) {
        map[c.comercial] = { id: c.comercial, nombre: c.comercial, avatar: c.comercial.slice(0, 2).toUpperCase(), cerrados: 0, pendientes: 0 };
      }
      if (c.estado === 'Formalizado')                                   map[c.comercial].cerrados++;
      else if (c.estado === 'Tramitado' || c.estado === 'Pendiente Firma') map[c.comercial].pendientes++;
    });
    return Object.values(map).sort((a, b) => b.cerrados - a.cerrados || b.pendientes - a.pendientes);
  }, [clientes, users]);

  return (
    <DataContext.Provider value={{
      clientes,
      clientesB2C: clientes.filter((c) => c.tipo === 'B2C'),
      clientesB2B: clientes.filter((c) => c.tipo === 'B2B'),
      actividades,
      visitas,
      rankingComerciales,
      addCliente,
      updateCliente,
      firmarContrato,
      formalizarContrato,
      deleteCliente,
      addActivity,
      clearActividades,
      addVisita,
      updateVisita,
      deleteVisita,
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
