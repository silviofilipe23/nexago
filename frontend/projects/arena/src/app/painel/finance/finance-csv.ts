import type { FinanceMovement } from './finance.model';

const CSV_DELIMITER = ';'; // pt-BR usa vírgula como separador decimal — ; evita conflito ao abrir no Excel.
const CSV_HEADER = ['Data', 'Tipo', 'Descrição', 'Detalhe', 'Status', 'Valor (R$)'];

function csvEscape(value: string): string {
  if (value.includes(CSV_DELIMITER) || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

const MOVEMENT_STATUS_LABEL: Record<FinanceMovement['status'], string> = {
  ok: 'Concluído',
  pend: 'Pendente',
  fail: 'Falhou',
};

/** Monta o CSV do extrato — pura, sem tocar no DOM (o download em si fica em `downloadCsv`). */
export function buildMovementsCsv(movements: readonly FinanceMovement[]): string {
  const rows = movements.map((m) => [
    m.dateLabel,
    m.type === 'credit' ? 'Recebimento' : 'Saque',
    m.label,
    m.sub,
    MOVEMENT_STATUS_LABEL[m.status],
    m.amountReais.toFixed(2).replace('.', ','),
  ]);
  return [CSV_HEADER, ...rows].map((row) => row.map(csvEscape).join(CSV_DELIMITER)).join('\n');
}

/** Dispara o download de um CSV no navegador — efeito colateral, fora do escopo de teste unitário. */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
