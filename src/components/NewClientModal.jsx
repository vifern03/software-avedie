import { useState, useRef, useEffect } from 'react';
import { X, User, Building2, Phone, Zap, FileText, CheckCircle, AlertCircle, Mail, CreditCard, Upload, Pencil, Calendar, UserCheck, Briefcase, Hash, AlignLeft, BarChart2, Users, Check, ShoppingBag } from 'lucide-react';
import DateInput from './DateInput';
import { useAuth } from '../context/AuthContext';
import { useData, fetchSingleDoc } from '../context/DataContext';
import { getShareTargets } from './ShareButton';

const tarifas  = ['2.0TD', '3.0TD', '3.1A', '6.1TD', '6.1A', '6.2', '6.3', '6.4', 'RL.1', 'RL.2', 'RL.3'];
const estados  = ['Pendiente Firma', 'Tramitado', 'Formalizado'];
const subtipos = [
  'Cambio de Comercializadora',
  'Camb. Comer. con CT',
  'Alta directa no 1ª ocupación',
  'Camb. Comer. con Cambios ATR',
  'Cambio de titular con Subrogación',
  'Baja Fin de suministro',
  'Modificación condiciones económicas',
  'Otro',
];

const todayStr = () => new Date().toISOString().split('T')[0];

export default function NewClientModal({ tipo, onClose, onSave, initialData, editId }) {
  const { currentUser, users, sharePermissions } = useAuth();
  const shareTargets = getShareTargets(currentUser, users, sharePermissions);
  const { prescriptores: prescriptoresDB, clientes: clientesCtx } = useData();
  const prescriptoresList = prescriptoresDB.map(p => p.nombre);
  const isB2B       = tipo === 'B2B' || tipo === 'CUR_B2B';
  const isEdit      = !!initialData;
  const isPrivileged = currentUser?.role === 'admin' || currentUser?.role === 'manager';

  const initialAgenteGestorValue = initialData?.agente_gestor || currentUser?.username || '';
  const isKnownUser = !initialAgenteGestorValue || users.some(u => u.username === initialAgenteGestorValue);

  const initialCreadoPorValue = initialData?.creado_por || '';
  const isCreadoPorKnown = !initialCreadoPorValue
    || initialCreadoPorValue === 'Canal Directo'
    || initialCreadoPorValue === 'Directo'
    || prescriptoresDB.some(p => p.nombre === initialCreadoPorValue)
    || users.some(u => u.username === initialCreadoPorValue);
  const initialTipoVenta = isB2B
    ? 'prescriptor'
    : ((!initialCreadoPorValue || initialCreadoPorValue === 'Canal Directo' || initialCreadoPorValue === 'Directo') ? 'directo' : 'prescriptor');

  const initialVendidoPorValue = initialData?.vendido_por || '';
  const isVendidoPorKnown = !initialVendidoPorValue || prescriptoresDB.some(p => p.nombre === initialVendidoPorValue);

  const [form, setForm] = useState({
    nombre:            initialData?.nombre            || '',
    identificacion:    initialData?.identificacion    || '',
    telefono:          initialData?.telefono          || '',
    cups:              initialData?.cups              || '',
    tarifa:            initialData?.tarifa            || '',
    linea_negocio:     initialData?.linea_negocio     || '',
    subtipo:           initialData?.subtipo           || '',
    subtipo_otro:      initialData?.subtipo_otro      || '',
    id_producto:       initialData?.id_producto       || '',
    creado_por:        isB2B
      ? (isCreadoPorKnown ? initialCreadoPorValue : '__otro__')
      : (initialTipoVenta === 'directo' ? 'Canal Directo' : (isCreadoPorKnown ? initialCreadoPorValue : '__otro__')),
    vendido_por:       isVendidoPorKnown ? initialVendidoPorValue : '__vendido_otro__',
    descripcion:       initialData?.descripcion       || '',
    consumo_anual_est: initialData?.consumo_anual_est != null ? String(initialData.consumo_anual_est) : '',
    estado:            initialData?.estado            || 'Pendiente Firma',
    mail:              initialData?.mail              || '',
    cuenta_bancaria:   initialData?.cuenta_bancaria   || '',
    fecha_tramitacion: initialData?.fecha_tramitacion || todayStr(),
    agente_gestor:     isKnownUser ? initialAgenteGestorValue : '__otro__',
    fecha_firma:       initialData?.fecha_firma       ?? null,
    fecha_formalizada: initialData?.fecha_formalizada ?? null,
  });
  const [tipoVenta,         setTipoVenta]          = useState(initialTipoVenta);
  const [agenteGestorOtro,  setAgenteGestorOtro]  = useState(isKnownUser     ? '' : initialAgenteGestorValue);
  const [prescriptorOtro,   setPrescriptorOtro]   = useState((isCreadoPorKnown || initialTipoVenta === 'directo') ? '' : initialCreadoPorValue);
  const [vendidoPorOtro,    setVendidoPorOtro]    = useState(isVendidoPorKnown ? '' : initialVendidoPorValue);
  const [errors,       setErrors]       = useState({});
  const [saved,        setSaved]        = useState(false);
  const [cupsDbError,  setCupsDbError]  = useState(null);

  // ── CUPS duplicado (flujo CURP: alta con otra compañía + alta propia sobre
  // el mismo suministro) — alerta inline no bloqueante con autorelleno opcional,
  // en vez de un modal. El envío del formulario nunca se bloquea por esto (la
  // restricción UNIQUE de clientes.cups ya se eliminó en BD).
  const [cupsMatch,         setCupsMatch]         = useState(null); // cliente existente encontrado, o null
  const [cupsDupAction,     setCupsDupAction]     = useState(null); // null | 'pending' | 'accepted' | 'rejected'
  const [autorellenando,    setAutorellenando]    = useState(false); // true mientras se descarga el DNI escaneado
  const [cupsDupResolvedFor, setCupsDupResolvedFor] = useState(''); // valor de CUPS ya resuelto (Sí/No)

  // ── Documento duplicado (DNI/NIE en B2C, CIF en B2B — mismo campo `identificacion`) ──
  // Sistema gemelo al de CUPS: alerta inline, autorelleno de datos de CONTACTO y
  // documentos (nunca del suministro nuevo: CUPS/Tarifa/Id Producto/Línea de
  // Negocio/Subtipo/Factura/Justo Título quedan intocados pase lo que pase).
  const [docMatch,          setDocMatch]          = useState(null);
  const [docDupAction,      setDocDupAction]      = useState(null); // null | 'pending' | 'accepted' | 'rejected'
  const [autorellenandoDoc, setAutorellenandoDoc] = useState(false);
  const [docDupResolvedFor, setDocDupResolvedFor] = useState('');

  // ── Compartir contrato ─────────────────────────────────────────────────────
  const [quiereCompartir, setQuiereCompartir] = useState(false);
  const [compartidoCon,   setCompartidoCon]   = useState([]);

  const toggleCompartido = (u) =>
    setCompartidoCon(prev => prev.includes(u) ? prev.filter(x => x !== u) : [...prev, u]);

  const [dniBase64,   setDniBase64]   = useState(initialData?.dni_escaneado || '');
  const [dniFileName, setDniFileName] = useState(
    initialData?.dni_escaneado?.startsWith?.('data:') ? 'Archivo existente' : ''
  );

  const [cifAutonomoBase64,   setCifAutonomoBase64]   = useState(initialData?.cif_autonomo_url || '');
  const [cifAutonomoFileName, setCifAutonomoFileName] = useState(
    initialData?.cif_autonomo_url?.startsWith?.('data:') ? 'Archivo existente' : ''
  );
  const [justoTituloBase64,   setJustoTituloBase64]   = useState(initialData?.justo_titulo_url || '');
  const [justoTituloFileName, setJustoTituloFileName] = useState(
    initialData?.justo_titulo_url?.startsWith?.('data:') ? 'Archivo existente' : ''
  );
  const [facturaB2bBase64,   setFacturaB2bBase64]   = useState(initialData?.factura_b2b_url || '');
  const [facturaB2bFileName, setFacturaB2bFileName] = useState(
    initialData?.factura_b2b_url?.startsWith?.('data:') ? 'Archivo existente' : ''
  );

  const [ultimaFacturaBase64,   setUltimaFacturaBase64]   = useState(initialData?.ultima_factura || '');
  const [ultimaFacturaFileName, setUltimaFacturaFileName] = useState(
    initialData?.ultima_factura?.startsWith?.('data:') ? 'Archivo existente' : ''
  );

  const dniInputRef           = useRef(null);
  const cifAutonomoInputRef   = useRef(null);
  const justoTituloInputRef   = useRef(null);
  const facturaB2bInputRef    = useRef(null);
  const ultimaFacturaInputRef = useRef(null);
  const submittingRef         = useRef(false);

  const set = (field, value) => {
    setForm((f) => {
      const updated = { ...f, [field]: value };
      if (field === 'estado') {
        if (value === 'Pendiente Firma') {
          updated.fecha_firma = null;
          updated.fecha_formalizada = null;
        } else if (value === 'Tramitado') {
          updated.fecha_formalizada = null;
        }
      }
      return updated;
    });
    setErrors((e) => ({ ...e, [field]: false }));
    if (field === 'cups') setCupsDbError(null);
  };

  // ── Detección de CUPS duplicado (debounce 500ms tras dejar de escribir) ──────
  // No hace una consulta nueva a Supabase: `clientesCtx` ya viene sincronizado
  // en tiempo real desde DataContext, así que buscar ahí es más inmediato y
  // evita una llamada de red redundante en cada pausa de escritura.
  useEffect(() => {
    const cupsVal      = form.cups.trim().toUpperCase();
    const originalCups = (initialData?.cups || '').toUpperCase().trim();

    if (!cupsVal || cupsVal === originalCups) {
      setCupsMatch(null);
      setCupsDupAction(null);
      return;
    }
    if (cupsVal === cupsDupResolvedFor) return; // ya se respondió Sí/No para este valor exacto

    const timer = setTimeout(() => {
      const match = clientesCtx.find(c => (c.cups || '').toUpperCase().trim() === cupsVal);
      if (match) {
        setCupsMatch(match);
        setCupsDupAction('pending');
      } else {
        setCupsMatch(null);
        setCupsDupAction(null);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [form.cups, clientesCtx, initialData, cupsDupResolvedFor]);

  const handleAutorellenarCups = async () => {
    if (!cupsMatch) return;
    setForm((f) => ({
      ...f,
      nombre:          cupsMatch.nombre          || f.nombre,
      identificacion:  cupsMatch.cif_dni         || f.identificacion,
      telefono:        cupsMatch.telefono        || f.telefono,
      mail:            cupsMatch.mail            || f.mail,
      cuenta_bancaria: cupsMatch.cuenta_bancaria || f.cuenta_bancaria,
    }));
    setErrors((e) => ({ ...e, nombre: false, identificacion: false, telefono: false, cuenta_bancaria: false }));

    // dni_escaneado es un campo Base64 (BINARY_FIELDS) excluido del SELECT
    // principal de clientes por su tamaño — hay que pedirlo aparte (fetch-on-
    // click), igual que ya hace el resto del CRM al ver/editar un DNI existente.
    setAutorellenando(true);
    try {
      const dniExistente = await fetchSingleDoc(cupsMatch.id, 'dni_escaneado');
      if (dniExistente) {
        setDniBase64(dniExistente);
        setDniFileName('Archivo existente');
        setErrors((e) => ({ ...e, dni_b2c: false, dni_b2b: false }));
      }
      // Si el cliente antiguo no tenía DNI guardado (null), no se toca nada:
      // el campo de archivo queda vacío tal cual estaba, sin romper el formulario.
    } catch (err) {
      console.error('[NewClientModal] Error al recuperar el DNI escaneado del cliente existente:', err);
    } finally {
      setAutorellenando(false);
    }

    setCupsDupResolvedFor(form.cups.trim().toUpperCase());
    setCupsDupAction('accepted');
  };

  const handleRechazarAutorelleno = () => {
    setCupsDupResolvedFor(form.cups.trim().toUpperCase());
    setCupsDupAction('rejected');
  };

  // ── Detección de documento duplicado (DNI/NIE o CIF, campo `identificacion`) ──
  // Mismo patrón de debounce que el de CUPS, pero comparando contra `cif_dni`.
  useEffect(() => {
    const identVal      = form.identificacion.trim().toUpperCase();
    const originalIdent = (initialData?.identificacion || '').toUpperCase().trim();

    if (!identVal || identVal === originalIdent) {
      setDocMatch(null);
      setDocDupAction(null);
      return;
    }
    if (identVal === docDupResolvedFor) return; // ya se respondió Sí/No para este valor exacto

    const timer = setTimeout(() => {
      const match = clientesCtx.find(c => (c.cif_dni || '').toUpperCase().trim() === identVal);
      if (match) {
        setDocMatch(match);
        setDocDupAction('pending');
      } else {
        setDocMatch(null);
        setDocDupAction(null);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [form.identificacion, clientesCtx, initialData, docDupResolvedFor]);

  // Autorrelleno por documento: SOLO datos de contacto + documentos de identidad
  // del titular. NUNCA toca CUPS, Tarifa, Id Producto, Línea de Negocio,
  // Subtipo, Factura ni Justo Título — esos pertenecen al suministro nuevo.
  const handleAutorellenarDoc = async () => {
    if (!docMatch) return;
    setForm((f) => ({
      ...f,
      nombre:          docMatch.nombre          || f.nombre,
      telefono:        docMatch.telefono        || f.telefono,
      mail:            docMatch.mail            || f.mail,
      cuenta_bancaria: docMatch.cuenta_bancaria || f.cuenta_bancaria,
    }));
    setErrors((e) => ({ ...e, nombre: false, telefono: false, cuenta_bancaria: false }));

    setAutorellenandoDoc(true);
    try {
      if (isB2B) {
        // B2B: dos documentos — "CIF / Recibo Autónomos" y "DNI" del representante.
        const [cifDoc, dniDoc] = await Promise.all([
          fetchSingleDoc(docMatch.id, 'cif_autonomo_url'),
          fetchSingleDoc(docMatch.id, 'dni_escaneado'),
        ]);
        if (cifDoc) {
          setCifAutonomoBase64(cifDoc);
          setCifAutonomoFileName('Archivo existente');
          setErrors((e) => ({ ...e, cif_autonomo: false }));
        }
        if (dniDoc) {
          setDniBase64(dniDoc);
          setDniFileName('Archivo existente');
          setErrors((e) => ({ ...e, dni_b2b: false }));
        }
      } else {
        // B2C: un único documento — "Escanear DNI/CIF".
        const dniDoc = await fetchSingleDoc(docMatch.id, 'dni_escaneado');
        if (dniDoc) {
          setDniBase64(dniDoc);
          setDniFileName('Archivo existente');
          setErrors((e) => ({ ...e, dni_b2c: false }));
        }
      }
      // Si el cliente antiguo no tenía alguno de estos documentos (null), ese
      // campo concreto se deja tal cual estaba, sin romper el formulario.
    } catch (err) {
      console.error('[NewClientModal] Error al recuperar documentos del cliente existente (por DNI/CIF):', err);
    } finally {
      setAutorellenandoDoc(false);
    }

    setDocDupResolvedFor(form.identificacion.trim().toUpperCase());
    setDocDupAction('accepted');
  };

  const handleRechazarAutorellenoDoc = () => {
    setDocDupResolvedFor(form.identificacion.trim().toUpperCase());
    setDocDupAction('rejected');
  };

  const handleFileChange = (e, setFileName, setBase64) => {
    const file = e.target.files[0];
    if (!file) { setFileName(''); setBase64(''); return; }
    if (file.size > 5 * 1024 * 1024) {
      alert('El archivo supera el límite de 5 MB. Adjunta un documento más pequeño.');
      e.target.value = '';
      setFileName('');
      setBase64('');
      return;
    }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => setBase64(ev.target.result);
    reader.readAsDataURL(file);
  };

  const validate = () => {
    const e = {};
    if (!form.nombre.trim())         e.nombre            = true;
    if (!form.identificacion.trim()) e.identificacion     = true;
    if (!form.telefono.trim())       e.telefono           = true;
    // El CUPS duplicado ya NO bloquea el envío (flujo CURP): se gestiona con un
    // modal de confirmación en handleSubmit, no como error de validación aquí.
    if (!form.cups.trim()) e.cups = true;
    if (!form.tarifa)                e.tarifa             = true;
    if (!form.estado)                e.estado             = true;
    if (!form.fecha_tramitacion)     e.fecha_tramitacion  = true;
    if ((form.estado === 'Tramitado' || form.estado === 'Formalizado') && !form.fecha_firma)
      e.fecha_firma = true;
    if (form.estado === 'Formalizado' && !form.fecha_formalizada)
      e.fecha_formalizada = true;
    if (form.agente_gestor === '__otro__' && !agenteGestorOtro.trim())
      e.agente_gestor_otro = true;
    if (tipoVenta === 'prescriptor' && !form.creado_por)
      e.creado_por = true;
    if (tipoVenta === 'prescriptor' && form.creado_por === '__otro__' && !prescriptorOtro.trim())
      e.prescriptor_otro = true;
    if (!form.vendido_por)
      e.vendido_por = true;
    else if (form.vendido_por === '__vendido_otro__' && !vendidoPorOtro.trim())
      e.vendido_por_otro = true;
    if (!form.cuenta_bancaria.trim())             e.cuenta_bancaria = true;
    if (!form.id_producto.trim())                 e.id_producto     = true;
    if (!isB2B && !isEdit && !dniBase64)         e.dni_b2c       = true;
    if (isB2B && !isEdit && !cifAutonomoBase64) e.cif_autonomo  = true;
    if (isB2B && !isEdit && !dniBase64)         e.dni_b2b       = true;
    if (isB2B && !isEdit && !facturaB2bBase64)  e.factura_b2b   = true;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // El CUPS duplicado (flujo CURP) ya nunca bloquea el envío: es solo una
  // alerta informativa con autorelleno opcional (ver efecto de detección más
  // abajo). La BD ya admite CUPS repetidos (restricción UNIQUE eliminada).
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submittingRef.current || !validate()) return;

    submittingRef.current = true;
    setCupsDbError(null);

    const efectiveAgenteGestor = form.agente_gestor === '__otro__' ? agenteGestorOtro.trim() : form.agente_gestor;
    const efectivePrescriptor  = tipoVenta === 'directo'
      ? 'Canal Directo'
      : (form.creado_por === '__otro__' ? prescriptorOtro.trim() : form.creado_por);
    const result = await onSave({
      ...form,
      agente_gestor:    efectiveAgenteGestor,
      creado_por:       efectivePrescriptor,
      vendido_por:      form.vendido_por === '__vendido_otro__' ? vendidoPorOtro.trim() : form.vendido_por.trim(),
      tipo,
      compartido_con:   !isEdit && quiereCompartir ? compartidoCon : [],
      dni_escaneado:    dniBase64,
      ultima_factura:   ultimaFacturaBase64 || null,
      cif_autonomo_url: cifAutonomoBase64,
      justo_titulo_url: justoTituloBase64,
      factura_b2b_url:  facturaB2bBase64,
    });

    submittingRef.current = false;

    if (result?.error) {
      const isCupsDup = result.error.code === '23505';
      setCupsDbError(
        isCupsDup
          ? 'Error: Este CUPS ya está registrado en otro contrato.'
          : `Error al guardar: ${result.error.message || 'inténtalo de nuevo.'}`
      );
      return;
    }

    setSaved(true);
    setTimeout(() => onClose(), 900);
  };

  const inputClass = (field) =>
    `input-field ${errors[field] ? '!border-red-400 focus:!ring-red-300' : ''}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop bg-black/30">
      <div className="bg-white rounded-2xl shadow-google w-full max-w-lg mx-4 flex flex-col max-h-[92vh] overflow-hidden">

        {/* Header */}
        <div className={`px-6 py-5 flex items-center justify-between border-b border-google-border flex-shrink-0 ${isB2B ? 'bg-indigo-50' : 'bg-blue-50'}`}>
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${isB2B ? 'bg-indigo-500' : 'bg-google-blue'}`}>
              {isEdit ? <Pencil size={16} className="text-white" /> : isB2B ? <Building2 size={18} className="text-white" /> : <User size={18} className="text-white" />}
            </div>
            <div>
              <h2 className="text-base font-semibold text-google-dark">
                {isEdit ? `Editar ${isB2B ? 'Empresa B2B' : 'Cliente B2C'}` : isB2B ? 'Nueva Empresa B2B' : 'Nueva Alta B2C (Particular)'}
              </h2>
              <p className="text-xs text-google-gray">
                {isEdit ? 'Modifica los campos y guarda los cambios' : 'Completa todos los campos obligatorios'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-google-gray hover:text-google-dark transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Scrollable form body */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4 overflow-y-auto">

          {/* Tramitado por */}
          <div>
            <label className="block text-xs font-medium text-google-gray mb-1.5 flex items-center gap-1.5">
              <UserCheck size={13} /> Tramitado por
            </label>
            <select value={form.agente_gestor} onChange={(e) => set('agente_gestor', e.target.value)} className="input-field">
              {users.map((u) => (
                <option key={u.username} value={u.username}>{u.displayName || u.username}</option>
              ))}
              <option value="__otro__">Otro (especificar)</option>
            </select>
            {form.agente_gestor === '__otro__' && (
              <input
                type="text"
                placeholder="Nombre completo del tramitador..."
                value={agenteGestorOtro}
                onChange={(e) => { setAgenteGestorOtro(e.target.value); setErrors(er => ({ ...er, agente_gestor_otro: false })); }}
                className={`input-field mt-2 ${errors.agente_gestor_otro ? '!border-red-400 focus:!ring-red-300' : ''}`}
              />
            )}
            {errors.agente_gestor_otro && <p className="text-red-500 text-xs mt-1">Debes especificar el nombre del tramitador</p>}
          </div>

          {/* ── Compartir contrato (solo en nuevas altas, no en edición) ────── */}
          {!isEdit && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 space-y-2.5">
              <div className="flex items-center gap-1.5 mb-1">
                <Users size={13} className="text-slate-500" />
                <span className="text-xs font-semibold text-google-dark">
                  ¿Deseas dar acceso a algún otro trabajador para que pueda ver este contrato?
                </span>
              </div>
              <div className="flex gap-4">
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    type="radio"
                    name="quiere_compartir"
                    checked={!quiereCompartir}
                    onChange={() => setQuiereCompartir(false)}
                    className="accent-google-blue"
                  />
                  <span className="text-xs text-google-gray">No</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    type="radio"
                    name="quiere_compartir"
                    checked={quiereCompartir}
                    onChange={() => setQuiereCompartir(true)}
                    className="accent-google-blue"
                  />
                  <span className="text-xs text-google-gray">Sí</span>
                </label>
              </div>

              {quiereCompartir && (
                <div className="pt-1 space-y-1.5">
                  <p className="text-xs text-google-gray">Selecciona los trabajadores con acceso:</p>
                  {shareTargets.length === 0 && (
                    <p className="text-xs text-google-gray italic">
                      No tienes autorización para compartir con nadie. Pídele al administrador que te asigne destinatarios en Gestión de Usuarios.
                    </p>
                  )}
                  {shareTargets.map(u => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => toggleCompartido(u)}
                      className="flex items-center gap-2 w-full text-left group"
                    >
                      <div className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                        compartidoCon.includes(u)
                          ? 'bg-google-blue border-google-blue'
                          : 'border-gray-300 bg-white group-hover:border-google-blue'
                      }`}>
                        {compartidoCon.includes(u) && <Check size={10} className="text-white" strokeWidth={3} />}
                      </div>
                      <span className="text-xs text-google-dark">{u}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Línea de Negocio */}
          <div>
            <label className="block text-xs font-medium text-google-gray mb-1.5 flex items-center gap-1.5">
              <Briefcase size={13} /> Línea de Negocio
            </label>
            <select value={form.linea_negocio} onChange={(e) => set('linea_negocio', e.target.value)} className="input-field">
              <option value="">Seleccionar...</option>
              <option value="Electricidad">Electricidad</option>
              <option value="Gas">Gas</option>
            </select>
          </div>

          {/* Subtipo de Solicitud */}
          <div>
            <label className="block text-xs font-medium text-google-gray mb-1.5 flex items-center gap-1.5">
              <Hash size={13} /> Subtipo de Solicitud
            </label>
            <select value={form.subtipo} onChange={(e) => set('subtipo', e.target.value)} className="input-field">
              <option value="">Seleccionar...</option>
              {subtipos.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            {form.subtipo === 'Otro' && (
              <input
                type="text"
                placeholder="Especifica el subtipo..."
                value={form.subtipo_otro}
                onChange={(e) => set('subtipo_otro', e.target.value)}
                className="input-field mt-2"
              />
            )}
          </div>

          {/* Fecha de Tramitación */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
            <label className="block text-xs font-semibold text-blue-700 mb-1.5 flex items-center gap-1.5">
              <Calendar size={13} /> Fecha de Tramitación *
            </label>
            <DateInput
              value={form.fecha_tramitacion}
              onChange={(iso) => set('fecha_tramitacion', iso)}
              className={`input-field bg-white ${errors.fecha_tramitacion ? '!border-red-400' : '!border-blue-200'}`}
            />
            {errors.fecha_tramitacion && <p className="text-red-500 text-xs mt-1">Este campo es obligatorio</p>}
          </div>

          {/* Cliente (nombre) */}
          <div>
            <label className="block text-xs font-medium text-google-gray mb-1.5">
              {isB2B ? 'Cliente (Razón Social) *' : 'Cliente *'}
            </label>
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-google-gray">
                {isB2B ? <Building2 size={15} /> : <User size={15} />}
              </div>
              <input
                type="text"
                placeholder={isB2B ? 'Ej: Empresa Ejemplo S.L.' : 'Ej: Juan García López'}
                value={form.nombre}
                onChange={(e) => set('nombre', e.target.value)}
                className={`${inputClass('nombre')} pl-9`}
              />
            </div>
            {errors.nombre && <p className="text-red-500 text-xs mt-1">Este campo es obligatorio</p>}
          </div>

          {/* DNI / CIF */}
          <div>
            <label className="block text-xs font-medium text-google-gray mb-1.5">
              {isB2B ? 'CIF *' : 'DNI/NIE *'}
            </label>
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-google-gray"><FileText size={15} /></div>
              <input
                type="text"
                placeholder={isB2B ? 'Ej: B82736451' : 'Ej: 12345678Z'}
                value={form.identificacion}
                onChange={(e) => set('identificacion', e.target.value)}
                className={`${inputClass('identificacion')} pl-9`}
              />
            </div>
            {errors.identificacion && <p className="text-red-500 text-xs mt-1">Este campo es obligatorio</p>}
            {docDupAction === 'rejected' && (
              <p className="text-gray-500 text-xs mt-1">Documento duplicado aceptado — se creará un nuevo registro.</p>
            )}
          </div>

          {/* Alerta inline: documento (DNI/NIE o CIF) ya registrado a nombre de otro cliente */}
          {docDupAction === 'pending' && docMatch && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 flex flex-col gap-2.5">
              <p className="text-sm text-blue-900 leading-snug">
                ⚠️ Este documento ya está registrado a nombre de: <span className="font-semibold">{docMatch.nombre}</span>. ¿Deseas autorellenar sus datos de contacto y documentos?
              </p>
              <div className="flex items-center gap-2">
                <button type="button" onClick={handleAutorellenarDoc} disabled={autorellenandoDoc}
                  className="px-3 py-1.5 rounded-lg bg-google-blue text-white text-xs font-semibold hover:bg-blue-700 transition-colors disabled:opacity-60 disabled:cursor-wait">
                  {autorellenandoDoc ? 'Autorellenando…' : 'Sí, autorellenar'}
                </button>
                <button type="button" onClick={handleRechazarAutorellenoDoc} disabled={autorellenandoDoc}
                  className="px-3 py-1.5 rounded-lg bg-gray-200 text-gray-700 text-xs font-medium hover:bg-gray-300 transition-colors disabled:opacity-60">
                  No
                </button>
              </div>
            </div>
          )}
          {docDupAction === 'accepted' && (
            <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 flex items-center gap-2">
              <CheckCircle size={14} className="text-green-600 flex-shrink-0" />
              <p className="text-xs text-green-700 font-medium">Datos y documentos autorellenados desde el cliente existente.</p>
            </div>
          )}

          {/* Teléfono + CUPS */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-google-gray mb-1.5">Teléfono *</label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-google-gray"><Phone size={15} /></div>
                <input type="tel" placeholder="Ej: 612 345 678" value={form.telefono}
                  onChange={(e) => set('telefono', e.target.value)} className={`${inputClass('telefono')} pl-9`} />
              </div>
              {errors.telefono && <p className="text-red-500 text-xs mt-1">Obligatorio</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-google-gray mb-1.5">CUPS *</label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-google-gray"><Zap size={15} /></div>
                <input type="text" placeholder="Ej: ES1234567890" value={form.cups}
                  onChange={(e) => set('cups', e.target.value.toUpperCase())}
                  className={`${errors.cups ? 'input-field !border-red-400 focus:!ring-red-300' : 'input-field'} pl-9`} />
              </div>
              {errors.cups && <p className="text-red-500 text-xs mt-1">Obligatorio</p>}
              {cupsDupAction === 'rejected' && (
                <p className="text-gray-500 text-xs mt-1">CUPS duplicado aceptado (Alta CURP)</p>
              )}
            </div>
          </div>

          {/* Alerta inline: CUPS ya asignado a otro cliente (flujo CURP) */}
          {cupsDupAction === 'pending' && cupsMatch && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 flex flex-col gap-2.5">
              <p className="text-sm text-blue-900 leading-snug">
                ⚠️ Este CUPS ya está asignado al cliente: <span className="font-semibold">{cupsMatch.nombre}</span>. ¿Deseas autorellenar el formulario con sus datos?
              </p>
              <div className="flex items-center gap-2">
                <button type="button" onClick={handleAutorellenarCups} disabled={autorellenando}
                  className="px-3 py-1.5 rounded-lg bg-google-blue text-white text-xs font-semibold hover:bg-blue-700 transition-colors disabled:opacity-60 disabled:cursor-wait">
                  {autorellenando ? 'Autorellenando…' : 'Sí, autorellenar'}
                </button>
                <button type="button" onClick={handleRechazarAutorelleno} disabled={autorellenando}
                  className="px-3 py-1.5 rounded-lg bg-gray-200 text-gray-700 text-xs font-medium hover:bg-gray-300 transition-colors disabled:opacity-60">
                  No
                </button>
              </div>
            </div>
          )}
          {cupsDupAction === 'accepted' && (
            <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 flex items-center gap-2">
              <CheckCircle size={14} className="text-green-600 flex-shrink-0" />
              <p className="text-xs text-green-700 font-medium">Datos autorellenados desde el cliente existente.</p>
            </div>
          )}

          {/* Mail */}
          <div>
            <label className="block text-xs font-medium text-google-gray mb-1.5">Mail</label>
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-google-gray"><Mail size={15} /></div>
              <input type="email" placeholder="Ej: cliente@email.com" value={form.mail}
                onChange={(e) => set('mail', e.target.value)} className="input-field pl-9" />
            </div>
          </div>

          {/* Cuenta Bancaria */}
          <div>
            <label className="block text-xs font-medium text-google-gray mb-1.5">Cuenta Bancaria (IBAN) *</label>
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-google-gray"><CreditCard size={15} /></div>
              <input type="text" placeholder="Ej: ES91 2100 0418 4502 0005 1332" value={form.cuenta_bancaria}
                onChange={(e) => set('cuenta_bancaria', e.target.value)} className={`${inputClass('cuenta_bancaria')} pl-9`} />
            </div>
            {errors.cuenta_bancaria && <p className="text-red-500 text-xs mt-1">Este campo es obligatorio</p>}
          </div>

          {/* Tarifa + Estado */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-google-gray mb-1.5">Tarifa *</label>
              <select value={form.tarifa} onChange={(e) => set('tarifa', e.target.value)} className={inputClass('tarifa')}>
                <option value="">Seleccionar...</option>
                <optgroup label="Electricidad">
                  {['2.0TD', '3.0TD', '3.1A', '6.1TD', '6.1A', '6.2', '6.3', '6.4'].map((t) => <option key={t} value={t}>{t}</option>)}
                </optgroup>
                <optgroup label="Gas">
                  {['RL.1', 'RL.2', 'RL.3'].map((t) => <option key={t} value={t}>{t}</option>)}
                </optgroup>
              </select>
              {errors.tarifa && <p className="text-red-500 text-xs mt-1">Obligatorio</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-google-gray mb-1.5">Estado *</label>
              <select value={form.estado} onChange={(e) => set('estado', e.target.value)} className={inputClass('estado')}>
                <option value="">Seleccionar...</option>
                {estados.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              {errors.estado && <p className="text-red-500 text-xs mt-1">Obligatorio</p>}
            </div>
          </div>

          {/* Fecha de Firma */}
          {(form.estado === 'Tramitado' || form.estado === 'Formalizado') && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3">
              <label className="block text-xs font-semibold text-orange-700 mb-1.5 flex items-center gap-1.5">
                <Calendar size={13} /> Fecha de Firma *
              </label>
              <div className="flex items-center gap-2">
                <DateInput
                  value={form.fecha_firma || ''}
                  onChange={(iso) => set('fecha_firma', iso || null)}
                  className={`input-field bg-white flex-1 ${errors.fecha_firma ? '!border-red-400' : '!border-orange-200'}`}
                />
                <button
                  type="button"
                  onClick={() => set('fecha_firma', form.fecha_tramitacion)}
                  className="text-xs text-orange-600 hover:text-orange-800 whitespace-nowrap px-2 py-1.5 border border-orange-200 rounded-lg bg-white hover:bg-orange-100 transition-colors"
                >
                  Coincide con fecha anterior
                </button>
              </div>
              {errors.fecha_firma && <p className="text-red-500 text-xs mt-1">Este campo es obligatorio para este estado</p>}
            </div>
          )}

          {/* Fecha de Formalización */}
          {form.estado === 'Formalizado' && (
            <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3">
              <label className="block text-xs font-semibold text-green-700 mb-1.5 flex items-center gap-1.5">
                <Calendar size={13} /> Fecha de Formalización *
              </label>
              <div className="flex items-center gap-2">
                <DateInput
                  value={form.fecha_formalizada || ''}
                  onChange={(iso) => set('fecha_formalizada', iso || null)}
                  className={`input-field bg-white flex-1 ${errors.fecha_formalizada ? '!border-red-400' : '!border-green-200'}`}
                />
                <button
                  type="button"
                  onClick={() => set('fecha_formalizada', form.fecha_firma || form.fecha_tramitacion)}
                  className="text-xs text-green-600 hover:text-green-800 whitespace-nowrap px-2 py-1.5 border border-green-200 rounded-lg bg-white hover:bg-green-100 transition-colors"
                >
                  Coincide con fecha anterior
                </button>
              </div>
              {errors.fecha_formalizada && <p className="text-red-500 text-xs mt-1">Este campo es obligatorio para este estado</p>}
            </div>
          )}

          {/* Id Producto */}
          <div>
            <label className="block text-xs font-medium text-google-gray mb-1.5 flex items-center gap-1.5">
              <Hash size={13} /> Id Producto *
            </label>
            <input
              type="text"
              placeholder="Ej: Tarifa Libre 50 Endesa"
              value={form.id_producto}
              onChange={(e) => set('id_producto', e.target.value)}
              className={inputClass('id_producto')}
            />
            {errors.id_producto && <p className="text-red-500 text-xs mt-1">Este campo es obligatorio</p>}
          </div>

          {/* Prescriptor / Tipo de Venta */}
          {isB2B ? (
            <div>
              <label className="block text-xs font-medium text-google-gray mb-2 flex items-center gap-1.5">
                <User size={13} /> Prescriptor *
              </label>
              <select
                value={form.creado_por}
                onChange={(e) => { set('creado_por', e.target.value); setErrors(er => ({ ...er, prescriptor_otro: false })); }}
                className={inputClass('creado_por')}
              >
                <option value="">Seleccionar prescriptor...</option>
                {prescriptoresList.map((nombre) => (
                  <option key={nombre} value={nombre}>{nombre}</option>
                ))}
                <option value="__otro__">Otro (especificar)</option>
              </select>
              {form.creado_por === '__otro__' && (
                <input
                  type="text"
                  placeholder="Escribe el nombre del prescriptor..."
                  value={prescriptorOtro}
                  onChange={(e) => { setPrescriptorOtro(e.target.value); setErrors(er => ({ ...er, prescriptor_otro: false })); }}
                  className={`input-field mt-2 ${errors.prescriptor_otro ? '!border-red-400 focus:!ring-red-300' : ''}`}
                />
              )}
              {errors.creado_por       && <p className="text-red-500 text-xs mt-1">Este campo es obligatorio</p>}
              {errors.prescriptor_otro && <p className="text-red-500 text-xs mt-1">Debes especificar el nombre del prescriptor</p>}
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium text-google-gray mb-2 flex items-center gap-1.5">
                <User size={13} /> Tipo de Venta *
              </label>
              <div className="flex gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => {
                    setTipoVenta('directo');
                    set('creado_por', 'Directo');
                    setErrors(er => ({ ...er, creado_por: false, prescriptor_otro: false }));
                  }}
                  className={`flex-1 py-2 px-3 rounded-lg border text-xs font-semibold transition-colors ${
                    tipoVenta === 'directo'
                      ? 'bg-google-blue text-white border-google-blue shadow-sm'
                      : 'bg-white text-google-gray border-google-border hover:border-google-blue hover:text-google-blue'
                  }`}
                >
                  Canal Directo
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTipoVenta('prescriptor');
                    set('creado_por', '');
                    setErrors(er => ({ ...er, creado_por: false }));
                  }}
                  className={`flex-1 py-2 px-3 rounded-lg border text-xs font-semibold transition-colors ${
                    tipoVenta === 'prescriptor'
                      ? 'bg-google-blue text-white border-google-blue shadow-sm'
                      : 'bg-white text-google-gray border-google-border hover:border-google-blue hover:text-google-blue'
                  }`}
                >
                  Con Prescriptor
                </button>
              </div>
              {tipoVenta === 'prescriptor' && (
                <>
                  <p className="text-xs text-google-gray mb-1.5">Seleccione de la lista:</p>
                  <select
                    value={form.creado_por}
                    onChange={(e) => { set('creado_por', e.target.value); setErrors(er => ({ ...er, prescriptor_otro: false })); }}
                    className={inputClass('creado_por')}
                  >
                    <option value="">Seleccionar prescriptor...</option>
                    {prescriptoresList.map((nombre) => (
                      <option key={nombre} value={nombre}>{nombre}</option>
                    ))}
                    <option value="__otro__">Otro (especificar)</option>
                  </select>
                  {form.creado_por === '__otro__' && (
                    <input
                      type="text"
                      placeholder="Escribe el nombre del prescriptor..."
                      value={prescriptorOtro}
                      onChange={(e) => { setPrescriptorOtro(e.target.value); setErrors(er => ({ ...er, prescriptor_otro: false })); }}
                      className={`input-field mt-2 ${errors.prescriptor_otro ? '!border-red-400 focus:!ring-red-300' : ''}`}
                    />
                  )}
                  {errors.creado_por       && <p className="text-red-500 text-xs mt-1">Este campo es obligatorio</p>}
                  {errors.prescriptor_otro && <p className="text-red-500 text-xs mt-1">Debes especificar el nombre del prescriptor</p>}
                </>
              )}
            </div>
          )}

          {/* Vendido por — B2C y B2B (independiente del prescriptor) */}
          <div>
            <label className="block text-xs font-medium text-google-gray mb-1.5 flex items-center gap-1.5">
              <ShoppingBag size={13} /> Vendido por *
            </label>
            <select
              value={form.vendido_por}
              onChange={(e) => { set('vendido_por', e.target.value); setErrors(er => ({ ...er, vendido_por: false, vendido_por_otro: false })); }}
              className={inputClass('vendido_por')}
            >
              <option value="">Seleccionar vendedor...</option>
              {prescriptoresList.map((nombre) => (
                <option key={nombre} value={nombre}>{nombre}</option>
              ))}
              <option value="__vendido_otro__">Otro (especificar)</option>
            </select>
            {form.vendido_por === '__vendido_otro__' && (
              <input
                type="text"
                placeholder="Escribe el nombre del vendedor..."
                value={vendidoPorOtro}
                onChange={(e) => { setVendidoPorOtro(e.target.value); setErrors(er => ({ ...er, vendido_por_otro: false })); }}
                className={`input-field mt-2 ${errors.vendido_por_otro ? '!border-red-400 focus:!ring-red-300' : ''}`}
              />
            )}
            {errors.vendido_por      && <p className="text-red-500 text-xs mt-1">Este campo es obligatorio</p>}
            {errors.vendido_por_otro && <p className="text-red-500 text-xs mt-1">Debes especificar el nombre del vendedor</p>}
          </div>

          {/* Descripción */}
          <div>
            <label className="block text-xs font-medium text-google-gray mb-1.5 flex items-center gap-1.5">
              <AlignLeft size={13} /> Descripción
            </label>
            <textarea
              placeholder="Ej: Aportado por inmobiliaria, cliente interesado en..."
              value={form.descripcion}
              onChange={(e) => set('descripcion', e.target.value)}
              rows={3}
              className="input-field resize-none"
            />
          </div>

          {/* Consumo Anual Estimado — solo B2B, bloqueado para comerciales */}
          {isB2B && (
            <div>
              <label className="block text-xs font-medium text-google-gray mb-1.5 flex items-center gap-1.5">
                <BarChart2 size={13} /> Consumo Anual Estimado (kWh)
              </label>
              {isPrivileged ? (
                <input
                  type="number"
                  min="0"
                  step="1"
                  placeholder="Ej: 45000"
                  value={form.consumo_anual_est}
                  onChange={(e) => set('consumo_anual_est', e.target.value)}
                  className="input-field"
                />
              ) : (
                <input
                  type="text"
                  value="—"
                  disabled
                  className="input-field bg-gray-50 text-gray-400 cursor-not-allowed"
                />
              )}
              <p className="text-xs text-google-gray mt-1">Solo visible y editable para Admins y Managers</p>
            </div>
          )}

          {/* Documentos adjuntos */}
          <div className="pt-2 border-t border-google-border space-y-3">
            <p className="text-xs font-semibold text-google-gray uppercase tracking-wide">Documentos adjuntos</p>

            {isB2B ? (
              <>
                {/* CIF / Recibo Autónomos */}
                <div>
                  <label className="block text-xs font-medium text-google-gray mb-1.5">
                    CIF / Recibo Autónomos <span className="text-red-500 font-semibold">*</span>
                  </label>
                  <input ref={cifAutonomoInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
                    onChange={(e) => handleFileChange(e, setCifAutonomoFileName, setCifAutonomoBase64)} />
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => cifAutonomoInputRef.current?.click()}
                      className={`flex-1 flex items-center gap-2 px-3 py-2.5 rounded-lg border text-xs transition-colors ${
                        cifAutonomoFileName ? 'border-green-300 bg-green-50 text-green-700'
                        : errors.cif_autonomo ? 'border-red-300 bg-red-50 text-red-600'
                        : 'border-dashed border-gray-300 bg-google-bg text-google-gray hover:border-google-blue hover:text-google-blue'}`}>
                      <Upload size={14} className="flex-shrink-0" />
                      <span className="truncate">{cifAutonomoFileName || 'Seleccionar archivo (PDF, JPG, PNG)...'}</span>
                    </button>
                    {cifAutonomoFileName && (
                      <button type="button" title="Eliminar archivo"
                        onClick={() => { setCifAutonomoFileName(''); setCifAutonomoBase64(''); if (cifAutonomoInputRef.current) cifAutonomoInputRef.current.value = ''; }}
                        className="p-1.5 rounded-lg border border-red-200 bg-red-50 text-red-500 hover:bg-red-100 transition-colors flex-shrink-0">
                        <X size={13} />
                      </button>
                    )}
                  </div>
                  {errors.cif_autonomo && <p className="text-red-500 text-xs mt-1">Este documento es obligatorio</p>}
                </div>

                {/* DNI B2B */}
                <div>
                  <label className="block text-xs font-medium text-google-gray mb-1.5">
                    DNI <span className="text-red-500 font-semibold">*</span>
                  </label>
                  <input ref={dniInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
                    onChange={(e) => handleFileChange(e, setDniFileName, setDniBase64)} />
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => dniInputRef.current?.click()}
                      className={`flex-1 flex items-center gap-2 px-3 py-2.5 rounded-lg border text-xs transition-colors ${
                        dniFileName ? 'border-green-300 bg-green-50 text-green-700'
                        : errors.dni_b2b ? 'border-red-300 bg-red-50 text-red-600'
                        : 'border-dashed border-gray-300 bg-google-bg text-google-gray hover:border-google-blue hover:text-google-blue'}`}>
                      <Upload size={14} className="flex-shrink-0" />
                      <span className="truncate">{dniFileName || 'Seleccionar archivo (PDF, JPG, PNG)...'}</span>
                    </button>
                    {dniFileName && (
                      <button type="button" title="Eliminar archivo"
                        onClick={() => { setDniFileName(''); setDniBase64(''); if (dniInputRef.current) dniInputRef.current.value = ''; }}
                        className="p-1.5 rounded-lg border border-red-200 bg-red-50 text-red-500 hover:bg-red-100 transition-colors flex-shrink-0">
                        <X size={13} />
                      </button>
                    )}
                  </div>
                  {errors.dni_b2b && <p className="text-red-500 text-xs mt-1">Este documento es obligatorio</p>}
                </div>

                {/* Factura B2B */}
                <div>
                  <label className="block text-xs font-medium text-google-gray mb-1.5">
                    Factura <span className="text-red-500 font-semibold">*</span>
                  </label>
                  <input ref={facturaB2bInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
                    onChange={(e) => handleFileChange(e, setFacturaB2bFileName, setFacturaB2bBase64)} />
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => facturaB2bInputRef.current?.click()}
                      className={`flex-1 flex items-center gap-2 px-3 py-2.5 rounded-lg border text-xs transition-colors ${
                        facturaB2bFileName ? 'border-green-300 bg-green-50 text-green-700'
                        : errors.factura_b2b ? 'border-red-300 bg-red-50 text-red-600'
                        : 'border-dashed border-gray-300 bg-google-bg text-google-gray hover:border-google-blue hover:text-google-blue'}`}>
                      <Upload size={14} className="flex-shrink-0" />
                      <span className="truncate">{facturaB2bFileName || 'Seleccionar archivo (PDF, JPG, PNG)...'}</span>
                    </button>
                    {facturaB2bFileName && (
                      <button type="button" title="Eliminar archivo"
                        onClick={() => { setFacturaB2bFileName(''); setFacturaB2bBase64(''); if (facturaB2bInputRef.current) facturaB2bInputRef.current.value = ''; }}
                        className="p-1.5 rounded-lg border border-red-200 bg-red-50 text-red-500 hover:bg-red-100 transition-colors flex-shrink-0">
                        <X size={13} />
                      </button>
                    )}
                  </div>
                  {errors.factura_b2b && <p className="text-red-500 text-xs mt-1">Este documento es obligatorio</p>}
                </div>

                {/* Justo Título */}
                <div>
                  <label className="block text-xs font-medium text-google-gray mb-1.5">
                    Justo Título <span className="font-normal text-google-gray">(Opcional)</span>
                  </label>
                  <input ref={justoTituloInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
                    onChange={(e) => handleFileChange(e, setJustoTituloFileName, setJustoTituloBase64)} />
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => justoTituloInputRef.current?.click()}
                      className={`flex-1 flex items-center gap-2 px-3 py-2.5 rounded-lg border text-xs transition-colors ${
                        justoTituloFileName ? 'border-green-300 bg-green-50 text-green-700'
                        : 'border-dashed border-gray-300 bg-google-bg text-google-gray hover:border-google-blue hover:text-google-blue'}`}>
                      <Upload size={14} className="flex-shrink-0" />
                      <span className="truncate">{justoTituloFileName || 'Seleccionar archivo (PDF, JPG, PNG)...'}</span>
                    </button>
                    {justoTituloFileName && (
                      <button type="button" title="Eliminar archivo"
                        onClick={() => { setJustoTituloFileName(''); setJustoTituloBase64(''); if (justoTituloInputRef.current) justoTituloInputRef.current.value = ''; }}
                        className="p-1.5 rounded-lg border border-red-200 bg-red-50 text-red-500 hover:bg-red-100 transition-colors flex-shrink-0">
                        <X size={13} />
                      </button>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-medium text-google-gray mb-1.5">
                    Escanear DNI/CIF <span className="text-red-500 font-semibold">*</span>
                  </label>
                  <input ref={dniInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
                    onChange={(e) => handleFileChange(e, setDniFileName, setDniBase64)} />
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => dniInputRef.current?.click()}
                      className={`flex-1 flex items-center gap-2 px-3 py-2.5 rounded-lg border text-xs transition-colors ${
                        dniFileName ? 'border-green-300 bg-green-50 text-green-700'
                        : errors.dni_b2c ? 'border-red-300 bg-red-50 text-red-600'
                        : 'border-dashed border-gray-300 bg-google-bg text-google-gray hover:border-google-blue hover:text-google-blue'}`}>
                      <Upload size={14} className="flex-shrink-0" />
                      <span className="truncate">{dniFileName || 'Seleccionar archivo (PDF, JPG, PNG)...'}</span>
                    </button>
                    {dniFileName && (
                      <button type="button" title="Eliminar archivo"
                        onClick={() => { setDniFileName(''); setDniBase64(''); if (dniInputRef.current) dniInputRef.current.value = ''; }}
                        className="p-1.5 rounded-lg border border-red-200 bg-red-50 text-red-500 hover:bg-red-100 transition-colors flex-shrink-0">
                        <X size={13} />
                      </button>
                    )}
                  </div>
                  {errors.dni_b2c && <p className="text-red-500 text-xs mt-1">Este documento es obligatorio</p>}
                </div>

                <div>
                  <label className="block text-xs font-medium text-google-gray mb-1.5">
                    Adjuntar Última Factura <span className="font-normal text-google-gray">(Opcional)</span>
                  </label>
                  <input ref={ultimaFacturaInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
                    onChange={(e) => handleFileChange(e, setUltimaFacturaFileName, setUltimaFacturaBase64)} />
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => ultimaFacturaInputRef.current?.click()}
                      className={`flex-1 flex items-center gap-2 px-3 py-2.5 rounded-lg border text-xs transition-colors ${
                        ultimaFacturaFileName ? 'border-green-300 bg-green-50 text-green-700'
                        : 'border-dashed border-gray-300 bg-google-bg text-google-gray hover:border-google-blue hover:text-google-blue'}`}>
                      <Upload size={14} className="flex-shrink-0" />
                      <span className="truncate">{ultimaFacturaFileName || 'Seleccionar archivo (PDF, JPG, PNG)...'}</span>
                    </button>
                    {ultimaFacturaFileName && (
                      <button type="button" title="Eliminar archivo"
                        onClick={() => { setUltimaFacturaFileName(''); setUltimaFacturaBase64(''); if (ultimaFacturaInputRef.current) ultimaFacturaInputRef.current.value = ''; }}
                        className="p-1.5 rounded-lg border border-red-200 bg-red-50 text-red-500 hover:bg-red-100 transition-colors flex-shrink-0">
                        <X size={13} />
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Error BD */}
          {cupsDbError && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <AlertCircle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-red-700 text-sm font-medium">{cupsDbError}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-google-border">
            <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
            <button type="submit" disabled={saved}
              className={`btn-primary flex items-center gap-2 ${saved ? 'bg-green-500 hover:bg-green-500' : ''}`}>
              {saved ? <><CheckCircle size={15} /><span>Guardado</span></> : <span>{isEdit ? 'Guardar Cambios' : 'Guardar Cliente'}</span>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
