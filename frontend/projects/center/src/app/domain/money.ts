/** Valores sempre em centavos (inteiro). */

export function formatBRL(cents: number): string {
  const value = (cents / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: cents % 100 ? 2 : 0,
    maximumFractionDigits: 2,
  });
  return `R$ ${value}`;
}

/** '1.234,56' | '1234.56' | '320' → centavos; inválido → null. */
export function parseBRL(raw: string): number | null {
  const clean = raw.replace(/[R$\s]/g, '');
  if (!clean) {
    return null;
  }
  const normalized = clean.includes(',') ? clean.replace(/\./g, '').replace(',', '.') : clean;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    return null;
  }
  return Math.round(Number(normalized) * 100);
}

/** Centavos → '320,00' (valor de campo de formulário). */
export function centsToInput(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
