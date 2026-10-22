/**
 * CSV gerado no cliente. Separador `;` e BOM porque é o que o Excel em pt-BR abre direto
 * (vírgula é separador decimal aqui).
 */
export type CsvCell = string | number | null | undefined;

function cell(v: CsvCell): string {
  const s = v == null ? '' : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: CsvCell[][]): string {
  return '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n');
}

/** Dispara o download no navegador (efeito colateral, fora dos testes). */
export function downloadCsv(filename: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
