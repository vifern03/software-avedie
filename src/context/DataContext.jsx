import { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabase';

const DataContext = createContext(null);

const today = () => new Date().toISOString().split('T')[0];

export function DataProvider({ children }) {
  const { currentUser, users } = useAuth();

  const [clientes,    setClientes]    = useState([]);
  const [actividades, setActividades] = useState([]);
  const [visitas,     setVisitas]     = useState([]);
  const [isLoading,   setIsLoading]   = useState(true);

  useEffect(() => {
    async function loadAll() {
      const [
        { data: clientesData   },
        { data: actividadesData },
        { data: visitasData    },
      ] = await Promise.all([
        supabase.from('clientes').select('*').order('created_at', { ascending: false }),
        supabase.from('actividades').select('*').order('created_at', { ascending: false }),
        supabase.from('visitas').select('*').order('created_at', { ascending: false }),
      ]);

      setClientes(clientesData    || []);
      setActividades(actividadesData || []);
      setVisitas(visitasData      || []);
      setIsLoading(false);
    }
    loadAll();
  }, []);

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
    supabase.from('actividades').delete().not('id', 'is', null)
      .then(({ error }) => { if (error) console.error('clearActividades:', error); });
  };

  // ── Visitas ─────────────────────────────────────────────────────────────────

  const addVisita = (data) => {
    const newVisita = {
      id:             Date.now(),
      fecha:          data.fecha,
      hora:           data.hora,
      dni:            data.dni,
      nombre:         data.nombre,
      telefono:       data.telefono,
      mail:           data.mail      || '',
      tipo:           data.tipo,
      tipo_otro:      data.tipo_otro || '',
      registrado_por: currentUser?.username || 'Sistema',
    };
    setVisitas(prev => [newVisita, ...prev]);
    supabase.from('visitas').insert([newVisita])
      .then(({ error }) => {
        if (error) {
          console.error('addVisita:', error);
          setVisitas(prev => prev.filter(v => v.id !== newVisita.id));
        }
      });
  };

  const updateVisita = (id, data) => {
    setVisitas(prev => prev.map(v => v.id === id ? { ...v, ...data } : v));
    supabase.from('visitas').update(data).eq('id', id)
      .then(({ error }) => { if (error) console.error('updateVisita:', error); });
  };

  const deleteVisita = (id) => {
    setVisitas(prev => prev.filter(v => v.id !== id));
    supabase.from('visitas').delete().eq('id', id)
      .then(({ error }) => { if (error) console.error('deleteVisita:', error); });
  };

  // ── Clientes ────────────────────────────────────────────────────────────────

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
    setClientes(prev => [newCliente, ...prev]);
    supabase.from('clientes').insert([newCliente])
      .then(({ error }) => {
        if (error) {
          console.error('addCliente:', error);
          setClientes(prev => prev.filter(c => c.id !== newCliente.id));
        }
      });
    addActivity(
      tipo === 'B2B' ? 'Alta B2B' : 'Alta B2C',
      `${currentUser?.username} ha tramitado un nuevo contrato ${tipo} para el cliente ${data.nombre}`,
      currentUser?.username
    );
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
      ...(data.dni_escaneado  !== undefined && { dni_escaneado:  data.dni_escaneado  }),
      ...(data.ultima_factura !== undefined && { ultima_factura: data.ultima_factura }),
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
    supabase.from('clientes').delete().eq('id', id)
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
    const map = {};
    users.forEach((u) => {
      const initials = (u.displayName || u.username)
        .split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
      map[u.username] = { id: u.username, nombre: u.displayName || u.username, avatar: initials, cerrados: 0, pendientes: 0 };
    });
    clientes.forEach((c) => {
      if (!map[c.comercial]) {
        map[c.comercial] = { id: c.comercial, nombre: c.comercial, avatar: c.comercial.slice(0, 2).toUpperCase(), cerrados: 0, pendientes: 0 };
      }
      if (c.estado === 'Formalizado') map[c.comercial].cerrados++;
      else if (c.estado === 'Tramitado' || c.estado === 'Pendiente Firma') map[c.comercial].pendientes++;
    });
    return Object.values(map).sort((a, b) => b.cerrados - a.cerrados || b.pendientes - a.pendientes);
  }, [clientes, users]);

  return (
    <DataContext.Provider value={{
      clientes,
      clientesB2C: clientes.filter(c => c.tipo === 'B2C'),
      clientesB2B: clientes.filter(c => c.tipo === 'B2B'),
      actividades,
      visitas,
      rankingComerciales,
      isLoading,
      addCliente,
      updateCliente,
      firmarContrato,
      formalizarContrato,
      renovarContrato,
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
