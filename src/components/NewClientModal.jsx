import { useState, useRef } from 'react';
import { X, User, Building2, Phone, Zap, FileText, CheckCircle, AlertCircle, Mail, CreditCard, Upload, Pencil, Calendar, UserCheck, Briefcase, Hash, AlignLeft } from 'lucide-react';
import DateInput from './DateInput';
import { useAuth } from '../context/AuthContext';

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

export default function NewClientModal({ tipo, onClose, onSave, initialData, existingCups, editId }) {
  const { currentUser, users } = useAuth();
  const isB2B = tipo === 'B2B';
  const isEdit = !!initialData;

  const initialAgenteGestorValue = initialData?.agente_gestor || currentUser?.username || '';
  const isKnownUser = !initialAgenteGestorValue || users.some(u => u.username === initialAgenteGestorValue);

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
    creado_por:        initialData?.creado_por        || '',
    descripcion:       initialData?.descripcion       || '',
    estado:            initialData?.estado            || 'Pendiente Firma',
    mail:              initialData?.mail              || '',
    cuenta_bancaria:   initialData?.cuenta_bancaria   || '',
    fecha_tramitacion: initialData?.fecha_tramitacion || todayStr(),
    agente_gestor:     isKnownUser ? initialAgenteGestorValue : '__otro__',
    fecha_firma:       initialData?.fecha_firma       ?? null,
    fecha_formalizada: initialData?.fecha_formalizada ?? null,
  });
  const [agenteGestorOtro, setAgenteGestorOtro] = useState(isKnownUser ? '' : initialAgenteGestorValue);
  const [errors,       setErrors]       = useState({});
  const [saved,        setSaved]        = useState(false);
  const [cupsDbError,  setCupsDbError]  = useState(null);

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

  const dniInputRef          = useRef(null);
  const cifAutonomoInputRef  = useRef(null);
  const justoTituloInputRef  = useRef(null);
  const facturaB2bInputRef   = useRef(null);
  // M-1: bandera de control para bloquear doble envío antes del re-render
  const submittingRef        = useRef(false);

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
    setErrors((e) => {
      const next = { ...e, [field]: false };
      if (field === 'cups') { next.cups_duplicate = false; setCupsDbError(null); }
      return next;
    });
  };

  // M-2: validar tamaño antes de FileReader (máx. 5 MB para adjuntos de contrato)
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
    if (!form.cups.trim()) {
      e.cups = true;
    } else if (existingCups?.size) {
      const cupsVal     = form.cups.trim().toUpperCase();
      const originalCups = (initialData?.cups || '').toUpperCase().trim();
      if (existingCups.has(cupsVal) && cupsVal !== originalCups) {
        e.cups_duplicate = true;
      }
    }
    if (!form.tarifa)                e.tarifa             = true;
    if (!form.estado)                e.estado             = true;
    if (!form.fecha_tramitacion)     e.fecha_tramitacion  = true;
    if ((form.estado === 'Tramitado' || form.estado === 'Formalizado') && !form.fecha_firma)
      e.fecha_firma = true;
    if (form.estado === 'Formalizado' && !form.fecha_formalizada)
      e.fecha_formalizada = true;
    if (form.agente_gestor === '__otro__' && !agenteGestorOtro.trim())
      e.agente_gestor_otro = true;
    if (isB2B && !isEdit && !cifAutonomoBase64) e.cif_autonomo  = true;
    if (isB2B && !isEdit && !dniBase64)         e.dni_b2b       = true;
    if (isB2B && !isEdit && !facturaB2bBase64)  e.factura_b2b   = true;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // M-1: submittingRef bloquea el segundo disparo antes de que React deshabilite el botón
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submittingRef.current || !validate()) return;
    submittingRef.current = true;
    setCupsDbError(null);

    const efectiveAgenteGestor = form.agente_gestor === '__otro__' ? agenteGestorOtro.trim() : form.agente_gestor;
    const result = await onSave({
      ...form,
      agente_gestor:    efectiveAgenteGestor,
      tipo,
      dni_escaneado:    dniBase64,
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
                {isEdit ? `Editar ${isB2B ? 'Empresa B2B' : 'Cliente B2C'}` : isB2B ? 'Nueva Alta B2B (Empresa)' : 'Nueva Alta B2C (Particular)'}
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

          {/* Tramitado por (editable select) */}
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
          </div>

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
                  className={`${(errors.cups || errors.cups_duplicate) ? 'input-field !border-red-400 focus:!ring-red-300' : 'input-field'} pl-9`} />
              </div>
              {errors.cups && <p className="text-red-500 text-xs mt-1">Obligatorio</p>}
              {errors.cups_duplicate && <p className="text-red-500 text-xs mt-1">Este CUPS ya está registrado en otro contrato</p>}
            </div>
          </div>

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
            <label className="block text-xs font-medium text-google-gray mb-1.5">Cuenta Bancaria (IBAN)</label>
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-google-gray"><CreditCard size={15} /></div>
              <input type="text" placeholder="Ej: ES91 2100 0418 4502 0005 1332" value={form.cuenta_bancaria}
                onChange={(e) => set('cuenta_bancaria', e.target.value)} className="input-field pl-9" />
            </div>
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

          {/* Fecha de Firma — visible cuando estado es Tramitado o Formalizado */}
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
                  title="Rellenar automáticamente con la fecha de tramitación"
                >
                  Coincide con fecha anterior
                </button>
              </div>
              {errors.fecha_firma && <p className="text-red-500 text-xs mt-1">Este campo es obligatorio para este estado</p>}
            </div>
          )}

          {/* Fecha de Formalización — visible solo cuando estado es Formalizado */}
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
                  title="Rellenar automáticamente con la fecha de firma"
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
              <Hash size={13} /> Id Producto
            </label>
            <input
              type="text"
              placeholder="Ej: PROD-2024-ELEC-01"
              value={form.id_producto}
              onChange={(e) => set('id_producto', e.target.value)}
              className="input-field"
            />
          </div>

          {/* Creado por */}
          <div>
            <label className="block text-xs font-medium text-google-gray mb-1.5 flex items-center gap-1.5">
              <User size={13} /> Creado por
            </label>
            <input
              type="text"
              placeholder="Ej: Esgvxpa00301"
              value={form.creado_por}
              onChange={(e) => set('creado_por', e.target.value)}
              className="input-field"
            />
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

          {/* Documentos adjuntos */}
          <div className="pt-2 border-t border-google-border space-y-3">
            <p className="text-xs font-semibold text-google-gray uppercase tracking-wide">Documentos adjuntos</p>

            {isB2B ? (
              <>
                {/* CIF / Recibo Autónomos — OBLIGATORIO en nuevas altas B2B */}
                <div>
                  <label className="block text-xs font-medium text-google-gray mb-1.5">
                    CIF / Recibo Autónomos <span className="text-red-500 font-semibold">*</span>
                  </label>
                  <input ref={cifAutonomoInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
                    onChange={(e) => handleFileChange(e, setCifAutonomoFileName, setCifAutonomoBase64)} />
                  <button type="button" onClick={() => cifAutonomoInputRef.current?.click()}
                    className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border text-xs transition-colors ${
                      cifAutonomoFileName ? 'border-green-300 bg-green-50 text-green-700'
                      : errors.cif_autonomo ? 'border-red-300 bg-red-50 text-red-600'
                      : 'border-dashed border-gray-300 bg-google-bg text-google-gray hover:border-google-blue hover:text-google-blue'}`}>
                    <Upload size={14} className="flex-shrink-0" />
                    <span className="truncate">{cifAutonomoFileName || 'Seleccionar archivo (PDF, JPG, PNG)...'}</span>
                  </button>
                  {errors.cif_autonomo && <p className="text-red-500 text-xs mt-1">Este documento es obligatorio</p>}
                </div>

                {/* DNI — OBLIGATORIO en nuevas altas B2B */}
                <div>
                  <label className="block text-xs font-medium text-google-gray mb-1.5">
                    DNI <span className="text-red-500 font-semibold">*</span>
                  </label>
                  <input ref={dniInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
                    onChange={(e) => handleFileChange(e, setDniFileName, setDniBase64)} />
                  <button type="button" onClick={() => dniInputRef.current?.click()}
                    className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border text-xs transition-colors ${
                      dniFileName ? 'border-green-300 bg-green-50 text-green-700'
                      : errors.dni_b2b ? 'border-red-300 bg-red-50 text-red-600'
                      : 'border-dashed border-gray-300 bg-google-bg text-google-gray hover:border-google-blue hover:text-google-blue'}`}>
                    <Upload size={14} className="flex-shrink-0" />
                    <span className="truncate">{dniFileName || 'Seleccionar archivo (PDF, JPG, PNG)...'}</span>
                  </button>
                  {errors.dni_b2b && <p className="text-red-500 text-xs mt-1">Este documento es obligatorio</p>}
                </div>

                {/* Factura — OBLIGATORIO en nuevas altas B2B */}
                <div>
                  <label className="block text-xs font-medium text-google-gray mb-1.5">
                    Factura <span className="text-red-500 font-semibold">*</span>
                  </label>
                  <input ref={facturaB2bInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
                    onChange={(e) => handleFileChange(e, setFacturaB2bFileName, setFacturaB2bBase64)} />
                  <button type="button" onClick={() => facturaB2bInputRef.current?.click()}
                    className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border text-xs transition-colors ${
                      facturaB2bFileName ? 'border-green-300 bg-green-50 text-green-700'
                      : errors.factura_b2b ? 'border-red-300 bg-red-50 text-red-600'
                      : 'border-dashed border-gray-300 bg-google-bg text-google-gray hover:border-google-blue hover:text-google-blue'}`}>
                    <Upload size={14} className="flex-shrink-0" />
                    <span className="truncate">{facturaB2bFileName || 'Seleccionar archivo (PDF, JPG, PNG)...'}</span>
                  </button>
                  {errors.factura_b2b && <p className="text-red-500 text-xs mt-1">Este documento es obligatorio</p>}
                </div>

                {/* Justo Título — OPCIONAL */}
                <div>
                  <label className="block text-xs font-medium text-google-gray mb-1.5">
                    Justo Título <span className="font-normal text-google-gray">(Opcional)</span>
                  </label>
                  <input ref={justoTituloInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
                    onChange={(e) => handleFileChange(e, setJustoTituloFileName, setJustoTituloBase64)} />
                  <button type="button" onClick={() => justoTituloInputRef.current?.click()}
                    className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border text-xs transition-colors ${
                      justoTituloFileName ? 'border-green-300 bg-green-50 text-green-700'
                      : 'border-dashed border-gray-300 bg-google-bg text-google-gray hover:border-google-blue hover:text-google-blue'}`}>
                    <Upload size={14} className="flex-shrink-0" />
                    <span className="truncate">{justoTituloFileName || 'Seleccionar archivo (PDF, JPG, PNG)...'}</span>
                  </button>
                </div>
              </>
            ) : (
              /* B2C: DNI/CIF único opcional */
              <div>
                <label className="block text-xs font-medium text-google-gray mb-1.5">
                  Escanear DNI/CIF <span className="font-normal">(Opcional)</span>
                </label>
                <input ref={dniInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
                  onChange={(e) => handleFileChange(e, setDniFileName, setDniBase64)} />
                <button type="button" onClick={() => dniInputRef.current?.click()}
                  className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border text-xs transition-colors ${
                    dniFileName ? 'border-green-300 bg-green-50 text-green-700'
                    : 'border-dashed border-gray-300 bg-google-bg text-google-gray hover:border-google-blue hover:text-google-blue'}`}>
                  <Upload size={14} className="flex-shrink-0" />
                  <span className="truncate">{dniFileName || 'Seleccionar archivo (PDF, JPG, PNG)...'}</span>
                </button>
              </div>
            )}
          </div>

          {/* Banner error base de datos (p.ej. CUPS duplicado que pasó el pre-check) */}
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
