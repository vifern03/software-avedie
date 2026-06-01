import { useState, useRef, useEffect } from 'react';

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

export default function DateInput({ value, onChange, className, ...props }) {
  const [display, setDisplay] = useState(() => toDisplay(value || ''));
  const prevRef = useRef(value);

  useEffect(() => {
    if (value !== prevRef.current) {
      prevRef.current = value;
      setDisplay(toDisplay(value || ''));
    }
  }, [value]);

  const handleChange = (e) => {
    const raw = e.target.value.replace(/[^0-9/]/g, '');
    let next = raw;

    // Auto-insert slashes when typing forward
    if (next.length > display.length) {
      const digits = next.replace(/\//g, '');
      if (digits.length === 2 && next.length === 2) {
        next = digits + '/';
      } else if (digits.length === 4 && next.length === 5) {
        next = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/`;
      } else if (digits.length >= 8 && next === digits) {
        // Paste of pure digits: auto-format
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

  return (
    <input
      type="text"
      inputMode="numeric"
      placeholder="DD/MM/YYYY"
      maxLength={10}
      value={display}
      onChange={handleChange}
      onBlur={handleBlur}
      className={className}
      {...props}
    />
  );
}
