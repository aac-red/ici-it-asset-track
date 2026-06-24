// ============================================================
// CSV EXPORT UTILITY
// Converts an array of row objects into a downloadable CSV file.
// ============================================================

/**
 * @param {Array<object>} rows
 * @param {Array<{key:string, label:string}>} columns
 * @param {string} filename
 */
export function exportToCSV(rows, columns, filename = 'export.csv') {
  const header = columns.map(c => csvEscape(c.label)).join(',');
  const body = rows.map(row =>
    columns.map(c => csvEscape(row[c.key])).join(',')
  ).join('\n');

  const csvContent = `${header}\n${body}`;
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function csvEscape(value) {
  if (value == null) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
