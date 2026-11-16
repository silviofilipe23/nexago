/**
 * CSV do clube (métricas e leads): `;` como separador e vírgula decimal, que é o que o Excel em
 * pt-BR abre direto. O BOM vai na frente do arquivo, senão o Excel lê UTF-8 como Latin-1.
 */

export const CSV_BOM = '﻿';

export type CsvValue = string | number | null | undefined;

/**
 * Uma célula. Texto que começa com `=`, `+`, `-`, `@` ganha um apóstrofo: nome e bairro vêm do
 * atleta, e a planilha não pode executar fórmula digitada por ele. Número sai com vírgula.
 */
export function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value).replace('.', ',') : '';
  }
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[;"\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: ReadonlyArray<ReadonlyArray<CsvValue>>): string {
  return rows.map((cells) => cells.map(csvCell).join(';')).join('\n');
}

/** `clube-leads-2026-11-16.csv`, com a data local de hoje. */
export function csvFileName(prefix: string, now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${prefix}-${y}-${m}-${d}.csv`;
}

/** Baixa o arquivo pelo navegador (BOM incluído). */
export function downloadCsv(doc: Document, fileName: string, content: string): void {
  const blob = new Blob([CSV_BOM, content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = doc.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
