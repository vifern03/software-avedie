import { useState, useMemo } from 'react';
import { X, Plus, Trash2, Pencil, Check, AlertCircle, CheckCircle, Users } from 'lucide-react';

export default function PrescriptoresModal({
  onClose,
  allClientes,
  prescriptores,       // [{id, nombre}] desde DataContext
  addPrescriptor,
  renamePrescriptor,
  deletePrescriptor,
  bulkReasignPrescriptor,
}) {
  // ── Conteo de contratos por nombre (creado_por + vendido_por) ────────────
  const counts = useMemo(() => {
    const c = {};
    allClientes.forEach(cli => {
      const names = [cli.creado_por, cli.vendido_por].filter(n => n && n !== 'Canal Directo');
      names.forEach(n => { c[n] = (c[n] || 0) + 1; });
    });
    return c; // {nombre: count}
  }, [allClientes]);

  // ── Nombres orgánicos (en contratos pero no en la tabla prescriptores) ───
  const canonicalNames = useMemo(() => new Set(prescriptores.map(p => p.nombre)), [prescriptores]);
  const organicNames   = useMemo(() =>
    [...new Set(Object.keys(counts))].filter(n => !canonicalNames.has(n)).sort()
  , [counts, canonicalNames]);

  // ── Añadir prescriptor ────────────────────────────────────────────────────
  const [newName, setNewName]   = useState('');
  const [adding,  setAdding]    = useState(false);
  const [addErr,  setAddErr]    = useState('');

  const handleAdd = async () => {
    const trimmed = newName.trim().toUpperCase();
    if (!trimmed) { setAddErr('Escribe un nombre'); return; }
    if (canonicalNames.has(trimmed)) { setAddErr('Ese nombre ya existe'); return; }
    setAdding(true); setAddErr('');
    const { error } = await addPrescriptor(trimmed);
    if (error) setAddErr('Error al guardar: ' + (error.message || error));
    else setNewName('');
    setAdding(false);
  };

  // ── Edición inline ────────────────────────────────────────────────────────
  const [editingId,   setEditingId]   = useState(null);
  const [editingName, setEditingName] = useState('');
  const [savingEdit,  setSavingEdit]  = useState(false);

  const startEdit = (p) => { setEditingId(p.id); setEditingName(p.nombre); };
  const cancelEdit = ()  => { setEditingId(null); setEditingName(''); };

  const handleRename = async (id) => {
    setSavingEdit(true);
    const { error } = await renamePrescriptor(id, editingName);
    if (!error) { setEditingId(null); setEditingName(''); }
    setSavingEdit(false);
  };

  // ── Eliminar ──────────────────────────────────────────────────────────────
  const handleDelete = async (p) => {
    const msg = counts[p.nombre]
      ? `"${p.nombre}" aparece en ${counts[p.nombre]} contrato(s). ¿Eliminar de la lista? Los contratos NO se modificarán.`
      : `¿Eliminar "${p.nombre}" de la lista?`;
    if (!window.confirm(msg)) return;
    await deletePrescriptor(p.id);
  };

  // ── Reasignación masiva ───────────────────────────────────────────────────
  const [reasignTarget, setReasignTarget] = useState(null); // nombre origen
  const [reasignTo,     setReasignTo]     = useState('');
  const [reasigning,    setReasigning]    = useState(false);
  const [doneBanner,    setDoneBanner]    = useState(null); // {from, to, count}

  const allNames = useMemo(() => {
    const s = new Set([...prescriptores.map(p => p.nombre), ...Object.keys(counts)]);
    return [...s].filter(n => n !== 'Canal Directo').sort();
  }, [prescriptores, counts]);

  const handleReasign = async () => {
    if (!reasignTo || reasignTo === reasignTarget) return;
    const cnt = counts[reasignTarget] || 0;
    setReasigning(true);
    const { error } = await bulkReasignPrescriptor(reasignTarget, reasignTo);
    setReasigning(false);
    if (!error) {
      setDoneBanner({ from: reasignTarget, to: reasignTo, count: cnt });
      setReasignTarget(null); setReasignTo('');
      setTimeout(() => setDoneBanner(null), 5000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop bg-black/30">
      <div className="bg-white rounded-2xl shadow-google w-full max-w-lg mx-4 flex flex-col max-h-[92vh] overflow-hidden">

        {/* Header */}
        <div className="px-6 py-5 flex items-center justify-between border-b border-google-border flex-shrink-0 bg-amber-50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-amber-500">
              <Users size={18} className="text-white" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-google-dark">Gestión de Prescriptores</h2>
              <p className="text-xs text-google-gray">Añade, edita y reasigna · cambios en tiempo real</p>
            </div>
          </div>
          <button onClick={onClose} className="text-google-gray hover:text-google-dark transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 overflow-y-auto space-y-5">

          {/* Banner éxito reasignación */}
          {doneBanner && (
            <div className="flex items-start gap-2 bg-green-50 border border-green-300 rounded-xl px-4 py-3">
              <CheckCircle size={16} className="text-green-500 flex-shrink-0 mt-0.5" />
              <p className="text-green-800 text-sm">
                <strong>{doneBanner.count}</strong> registro(s) reasignados de <strong>"{doneBanner.from}"</strong> → <strong>"{doneBanner.to}"</strong>. El ranking se ha actualizado automáticamente.
              </p>
            </div>
          )}

          {/* Añadir nuevo */}
          <div>
            <p className="text-xs font-semibold text-google-gray uppercase tracking-wide mb-2">Añadir prescriptor</p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Nombre en mayúsculas..."
                value={newName}
                onChange={e => { setNewName(e.target.value.toUpperCase()); setAddErr(''); }}
                onKeyDown={e => e.key === 'Enter' && handleAdd()}
                className={`input-field flex-1 ${addErr ? '!border-red-400' : ''}`}
              />
              <button
                onClick={handleAdd}
                disabled={adding || !newName.trim()}
                className="btn-primary flex items-center gap-1.5 whitespace-nowrap text-sm px-3"
              >
                <Plus size={14} /> Añadir
              </button>
            </div>
            {addErr && <p className="text-red-500 text-xs mt-1">{addErr}</p>}
          </div>

          {/* Lista canónica (desde tabla prescriptores) */}
          <div>
            <p className="text-xs font-semibold text-google-gray uppercase tracking-wide mb-2">
              Lista canónica ({prescriptores.length})
            </p>
            {prescriptores.length === 0 ? (
              <p className="text-center text-google-gray text-sm py-4">Sin prescriptores. Añade el primero arriba.</p>
            ) : (
              <div className="space-y-1.5">
                {prescriptores.map(p => (
                  <div key={p.id} className="rounded-xl border border-google-border bg-google-bg px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      {/* Vista normal / modo edición */}
                      {editingId === p.id ? (
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <input
                            autoFocus
                            type="text"
                            value={editingName}
                            onChange={e => setEditingName(e.target.value.toUpperCase())}
                            onKeyDown={e => { if (e.key === 'Enter') handleRename(p.id); if (e.key === 'Escape') cancelEdit(); }}
                            className="input-field flex-1 h-8 text-sm py-0"
                          />
                          <button onClick={() => handleRename(p.id)} disabled={savingEdit}
                            className="p-1.5 rounded-lg bg-google-blue text-white hover:bg-blue-700 transition-colors flex-shrink-0">
                            <Check size={13} />
                          </button>
                          <button onClick={cancelEdit}
                            className="p-1.5 rounded-lg border border-google-border text-google-gray hover:bg-red-50 hover:text-red-500 transition-colors flex-shrink-0">
                            <X size={13} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-sm font-medium text-google-dark truncate">{p.nombre}</span>
                          {counts[p.nombre] ? (
                            <span className="text-xs text-google-gray bg-white border border-google-border px-1.5 py-0.5 rounded-full flex-shrink-0">
                              {counts[p.nombre]} contrato{counts[p.nombre] !== 1 ? 's' : ''}
                            </span>
                          ) : (
                            <span className="text-xs text-google-gray italic flex-shrink-0">sin contratos</span>
                          )}
                        </div>
                      )}

                      {editingId !== p.id && (
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button onClick={() => startEdit(p)} title="Renombrar"
                            className="p-1.5 rounded hover:bg-blue-50 transition-colors">
                            <Pencil size={13} className="text-google-blue" />
                          </button>
                          <button onClick={() => handleDelete(p)} title="Eliminar"
                            className="p-1.5 rounded hover:bg-red-50 transition-colors">
                            <Trash2 size={13} className="text-red-400" />
                          </button>
                          {(counts[p.nombre] ?? 0) > 0 && (
                            <button
                              onClick={() => {
                                setReasignTarget(reasignTarget === p.nombre ? null : p.nombre);
                                setReasignTo('');
                              }}
                              className={`px-2 py-0.5 rounded-lg border text-xs font-semibold transition-colors ml-1 ${
                                reasignTarget === p.nombre
                                  ? 'bg-amber-500 text-white border-amber-500'
                                  : 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
                              }`}
                            >
                              Reasignar
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Panel reasignación inline */}
                    {reasignTarget === p.nombre && (
                      <div className="mt-2.5 pt-2.5 border-t border-google-border space-y-2">
                        <p className="text-xs text-google-gray">
                          Mover <strong>{counts[p.nombre]}</strong> registro(s) de <strong>"{p.nombre}"</strong> a:
                        </p>
                        <div className="flex gap-2">
                          <select value={reasignTo} onChange={e => setReasignTo(e.target.value)}
                            className="input-field flex-1 text-sm">
                            <option value="">Seleccionar destino...</option>
                            {allNames.filter(n => n !== p.nombre).map(n => (
                              <option key={n} value={n}>{n}</option>
                            ))}
                          </select>
                          <button onClick={handleReasign} disabled={reasigning || !reasignTo}
                            className="btn-primary text-xs px-3 whitespace-nowrap">
                            {reasigning ? 'Procesando...' : 'Confirmar'}
                          </button>
                        </div>
                        {reasignTo && (
                          <p className="text-xs text-amber-700 flex items-center gap-1">
                            <AlertCircle size={12} />
                            Se actualizarán {counts[p.nombre]} registro(s) en Supabase (creado_por + vendido_por)
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Nombres orgánicos (solo en contratos, no en lista canónica) */}
          {organicNames.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-google-gray uppercase tracking-wide mb-1">
                Nombres en contratos sin canonizar ({organicNames.length})
              </p>
              <p className="text-xs text-google-gray mb-2">Aparecen en contratos existentes pero no están en la lista. Usa "Reasignar" para unificarlos.</p>
              <div className="space-y-1.5">
                {organicNames.map(name => (
                  <div key={name} className="rounded-xl border border-dashed border-amber-300 bg-amber-50 px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-amber-900">{name}</span>
                        <span className="text-xs text-amber-700 bg-white border border-amber-300 px-1.5 py-0.5 rounded-full">
                          {counts[name]} contrato{counts[name] !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          setReasignTarget(reasignTarget === name ? null : name);
                          setReasignTo('');
                        }}
                        className={`px-2 py-0.5 rounded-lg border text-xs font-semibold transition-colors ${
                          reasignTarget === name
                            ? 'bg-amber-500 text-white border-amber-500'
                            : 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
                        }`}
                      >
                        Reasignar
                      </button>
                    </div>
                    {reasignTarget === name && (
                      <div className="mt-2.5 pt-2.5 border-t border-amber-200 space-y-2">
                        <p className="text-xs text-amber-800">
                          Mover <strong>{counts[name]}</strong> registro(s) de <strong>"{name}"</strong> a:
                        </p>
                        <div className="flex gap-2">
                          <select value={reasignTo} onChange={e => setReasignTo(e.target.value)}
                            className="input-field flex-1 text-sm">
                            <option value="">Seleccionar destino...</option>
                            {allNames.filter(n => n !== name).map(n => (
                              <option key={n} value={n}>{n}</option>
                            ))}
                          </select>
                          <button onClick={handleReasign} disabled={reasigning || !reasignTo}
                            className="btn-primary text-xs px-3 whitespace-nowrap">
                            {reasigning ? 'Procesando...' : 'Confirmar'}
                          </button>
                        </div>
                        {reasignTo && (
                          <p className="text-xs text-amber-700 flex items-center gap-1">
                            <AlertCircle size={12} />
                            Se actualizarán {counts[name]} registro(s) en Supabase
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-google-border bg-google-bg flex justify-end">
          <button onClick={onClose} className="btn-secondary">Cerrar</button>
        </div>
      </div>
    </div>
  );
}
