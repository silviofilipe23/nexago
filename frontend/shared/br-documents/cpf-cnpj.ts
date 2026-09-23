/** Validação e formatação de CPF/CNPJ — port fiel de `core/validation/cpf_cnpj.dart` (Flutter).
 *
 *  Suporta o **novo CNPJ alfanumérico** (Receita Federal, vigência 2026): 14 posições, as 12
 *  primeiras alfanuméricas (0-9/A-Z) e os 2 dígitos verificadores numéricos. O cálculo dos DVs
 *  usa `valor = charCode - 48` ('0'..'9' → 0..9, 'A'..'Z' → 17..42). CPF e CNPJ numérico
 *  legado continuam funcionando. */

/** Normaliza para o padrão do documento: maiúsculas, mantém `[0-9A-Z]`. */
export function normalizeCpfCnpj(raw: string): string {
  return raw.toUpperCase().replace(/[^0-9A-Z]/g, '');
}

function isValidCpf(d: string): boolean {
  if (/^(\d)\1{10}$/.test(d)) return false;
  const n = d.split('').map(Number);
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += n[i]! * (10 - i);
  let r = sum % 11;
  const d1 = r < 2 ? 0 : 11 - r;
  if (n[9] !== d1) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += n[i]! * (11 - i);
  r = sum % 11;
  const d2 = r < 2 ? 0 : 11 - r;
  return n[10] === d2;
}

/** Valor do caractere no cálculo alfanumérico: '0'→0 … '9'→9, 'A'→17 … 'Z'→42. */
function charValue(c: string): number {
  return c.charCodeAt(0) - 48;
}

function isValidCnpj(s: string): boolean {
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(s)) return false;
  if (/^(\d)\1{13}$/.test(s)) return false;

  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  let sum = 0;
  for (let i = 0; i < 12; i++) sum += charValue(s[i]!) * w1[i]!;
  let r = sum % 11;
  const d1 = r < 2 ? 0 : 11 - r;
  if (Number(s[12]) !== d1) return false;

  sum = 0;
  for (let i = 0; i < 13; i++) sum += charValue(s[i]!) * w2[i]!;
  r = sum % 11;
  const d2 = r < 2 ? 0 : 11 - r;
  return Number(s[13]) === d2;
}

/** `true` para CPF (11 dígitos) ou CNPJ (14, alfanumérico) com DV válido. */
export function isValidCpfCnpj(raw: string): boolean {
  const s = normalizeCpfCnpj(raw);
  if (s.length === 11 && /^\d{11}$/.test(s)) return isValidCpf(s);
  if (s.length === 14) return isValidCnpj(s);
  return false;
}

/** Mensagem de erro (null = ok ou ainda incompleto demais pra reclamar). */
export function cpfCnpjValidationMessage(raw: string): string | null {
  const s = normalizeCpfCnpj(raw);
  if (!s) return null;
  const hasLetter = /[A-Z]/.test(s);
  if (!hasLetter) {
    if (s.length < 11) return null;
    if (s.length === 11) return isValidCpf(s) ? null : 'CPF inválido';
    if (s.length < 14) return 'CNPJ incompleto (14 caracteres)';
    if (s.length > 14) return 'Documento inválido';
    return isValidCnpj(s) ? null : 'CNPJ inválido';
  }
  if (s.length < 14) return 'CNPJ incompleto (14 caracteres)';
  if (s.length > 14) return 'Documento inválido';
  return isValidCnpj(s) ? null : 'CNPJ inválido';
}

function formatCpfPartial(d: string): string {
  let out = '';
  for (let i = 0; i < d.length && i < 11; i++) {
    if (i === 3 || i === 6) out += '.';
    if (i === 9) out += '-';
    out += d[i]!;
  }
  return out;
}

function formatCnpjPartial(d: string): string {
  let out = '';
  for (let i = 0; i < d.length && i < 14; i++) {
    if (i === 2 || i === 5) out += '.';
    if (i === 8) out += '/';
    if (i === 12) out += '-';
    out += d[i]!;
  }
  return out;
}

/** Máscara parcial pra exibição enquanto digita (CPF `000.000.000-00` / CNPJ `00.000.000/0000-00`). */
export function formatCpfCnpjDisplay(raw: string): string {
  const s = normalizeCpfCnpj(raw);
  const looksCnpj = s.length > 11 || /[A-Z]/.test(s);
  return looksCnpj ? formatCnpjPartial(s) : formatCpfPartial(s);
}
