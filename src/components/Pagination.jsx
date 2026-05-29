function getPageRange(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const range = [1];
  if (current > 3) range.push('ellipsis-start');
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) range.push(p);
  if (current < total - 2) range.push('ellipsis-end');
  range.push(total);
  return range;
}

export default function Pagination({ currentPage, totalPages, onPageChange }) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-center gap-1 py-3 px-5 border-t border-google-border bg-google-bg">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        className="px-3 py-1.5 text-xs font-medium rounded-lg border border-google-border bg-white text-google-gray hover:bg-white hover:border-google-blue hover:text-google-blue disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        ← Anterior
      </button>

      {getPageRange(currentPage, totalPages).map((p, i) =>
        typeof p === 'string' ? (
          <span key={p} className="w-8 text-center text-xs text-google-gray select-none">…</span>
        ) : (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            className={`w-8 h-8 text-xs font-semibold rounded-lg transition-colors ${
              p === currentPage
                ? 'bg-google-blue text-white border border-google-blue shadow-sm'
                : 'border border-google-border bg-white text-google-gray hover:bg-white hover:border-google-blue hover:text-google-blue'
            }`}
          >
            {p}
          </button>
        )
      )}

      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        className="px-3 py-1.5 text-xs font-medium rounded-lg border border-google-border bg-white text-google-gray hover:bg-white hover:border-google-blue hover:text-google-blue disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        Siguiente →
      </button>
    </div>
  );
}
