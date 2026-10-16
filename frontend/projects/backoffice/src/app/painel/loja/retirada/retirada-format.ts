const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function formatBrl(cents: number): string {
  // O Intl usa NBSP entre "R$" e o valor; o resto do painel usa espaço comum.
  return BRL.format(cents / 100).replace(/ /g, ' ');
}

/** "399,00" → 39900. Aceita vírgula ou ponto; inválido → null. */
export function parseBrlToCents(text: string): number | null {
  const clean = text.replace(/[^\d,.]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
  const n = Number(clean);
  return clean !== '' && Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

/** Máscara 00000-000, só dígitos. */
export function maskCep(text: string): string {
  const d = text.replace(/\D/g, '').slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

export function isValidCep(text: string): boolean {
  return /^\d{5}-\d{3}$/.test(text);
}
