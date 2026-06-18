import { useState, useRef, useEffect } from 'react';
import { Calendar } from 'lucide-react';

const toDisplay = (iso) => {
  if (!iso) return '';
  const parts = iso.split('-');
  if (parts.length !== 3) return '';
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
};

const toISO = (disp) => {
  const parts = disp.split('/');
  if (parts.length !== 3) return null;
  const [d, m, y] = parts;
  if (y.length === 4 && m.length >= 1 && d.length >= 1) {
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return null;
};

export default function DateInput({ value, onChange, className, style: propStyle, ...props }) {
  const [display, setDisplay] = useState(() => toDisplay(value || ''));
  const prevRef  = useRef(value);
  const nativeRef = useRef(null);

  useEffect(() => {
    if (value !== prevRef.current) {
      prevRef.current = value;
      setDisplay(toDisplay(value || ''));
    }
  }, [value]);

  const handleChange = (e) => {
    const raw = e.target.value.replace(/[^0-9/]/g, '');
    let next = raw;

    if (next.length > display.length) {
      const digits = next.replace(/\//g, '');
      if (digits.length === 2 && next.length === 2) {
        next = digits + '/';
      } else if (digits.length === 4 && next.length === 5) {
        next = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/`;
      } else if (digits.length >= 8 && next === digits) {
        next = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)}`;
      }
    }

    if (next.length > 10) return;
    setDisplay(next);

    if (!next) {
      prevRef.current = '';
      onChange('');
      return;
    }
    const iso = toISO(next);
    if (iso) {
      prevRef.current = iso;
      onChange(iso);
    }
  };

  const handleBlur = () => {
    const iso = toISO(display);
    if (!iso && display) {
      setDisplay(toDisplay(value || ''));
    }
  };

  const handleNativeChange = (e) => {
    const iso = e.target.value;
    if (!iso) {
      prevRef.current = '';
      setDisplay('');
      onChange('');
      return;
    }
    prevRef.current = iso;
    setDisplay(toDisplay(iso));
    onChange(iso);
  };

  const openPicker = () => {
    try { nativeRef.current?.showPicker(); } catch {}
  };

  return (
    <div className="relative inline-flex items-center">
      <input
        type="text"
        inputMode="numeric"
        placeholder="DD/MM/YYYY"
        maxLength={10}
        value={display}
        onChange={handleChange}
        onBlur={handleBlur}
        className={className}
        style={{ paddingRight: '1.75rem', ...propStyle }}
        {...props}
      />
      <button
        type="button"
        onClick={openPicker}
        tabIndex={-1}
        title="Abrir calendario"
        className="absolute right-1.5 top-1/2 -translate-y-1/2 text-google-gray hover:text-google-blue transition-colors p-0.5 rounded"
      >
        <Calendar size={12} />
      </button>
      <input
        ref={nativeRef}
        type="date"
        value={value || ''}
        onChange={handleNativeChange}
        className="absolute inset-0 opacity-0 pointer-events-none"
        tabIndex={-1}
        aria-hidden="true"
      />
    </div>
  );
}
