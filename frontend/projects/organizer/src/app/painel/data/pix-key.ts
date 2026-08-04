/** Chave PIX: espelho de `PayoutPixKeyType`
 *  (nexago_app/lib/features/arena/domain/payout_pix_key_type.dart), o mesmo tipo que o
 *  organizador usa (organizer_financial_page.dart importa esse enum). O algoritmo de checksum de
 *  CPF/CNPJ é a mesma porta já usada em
 *  frontend/projects/arena/src/app/painel/finance/arena-wallet.model.ts:100-133.
 *
 *  Vivia privado dentro de `financeiro.component.ts`; virou módulo próprio quando o card de
 *  Pagamentos das Configurações passou a precisar da mesma validação (chave de RECEBIMENTO
 *  direto, que é outra chave — a do Financeiro é a de SAQUE). Duas telas, uma regra só. */

export type PixKeyType = 'CPF' | 'CNPJ' | 'EMAIL' | 'PHONE' | 'EVP';

export const PIX_KEY_TYPES: PixKeyType[] = ['CPF', 'CNPJ', 'EMAIL', 'PHONE', 'EVP'];

/** payout_pix_key_type.dart:4-9 (rótulos). */
export const PIX_KEY_TYPE_LABEL: Record<PixKeyType, string> = {
  CPF: 'CPF',
  CNPJ: 'CNPJ',
  EMAIL: 'E-mail',
  PHONE: 'Celular (com DDD)',
  EVP: 'Chave aleatória',
};

/** payout_pix_key_type.dart:80-93 (`hintForField`). */
export const PIX_KEY_TYPE_HINT: Record<PixKeyType, string> = {
  CPF: 'Somente números do CPF',
  CNPJ: 'Somente números do CNPJ',
  EMAIL: 'ex.: organizador@email.com',
  PHONE: 'DDD + número, só dígitos (11)',
  EVP: 'UUID da chave aleatória',
};

export function digitsOnly(v: string): string {
  return v.replace(/\D/g, '');
}

function isValidCpf(d: string): boolean {
  if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false;
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

function charValue(c: string): number {
  return c.charCodeAt(0) - 48;
}

function isValidCnpj(s: string): boolean {
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(s) || /^(\d)\1{13}$/.test(s)) return false;
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

const EVP_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** payout_pix_key_type.dart:45-77 (`validateKey`) — `null` = válido (ou vazio, sem erro ainda). */
export function validatePixKeyForType(type: PixKeyType, raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  switch (type) {
    case 'CPF': {
      const d = digitsOnly(trimmed);
      if (d.length !== 11) return 'CPF deve ter 11 dígitos';
      return isValidCpf(d) ? null : 'CPF inválido';
    }
    case 'CNPJ': {
      const d = trimmed.toUpperCase().replace(/[^0-9A-Z]/g, '');
      if (d.length !== 14) return 'CNPJ deve ter 14 caracteres';
      return isValidCnpj(d) ? null : 'CNPJ inválido';
    }
    case 'EMAIL':
      return trimmed.includes('@') && trimmed.length >= 5 ? null : 'E-mail inválido';
    case 'PHONE': {
      const d = digitsOnly(trimmed);
      return d.length >= 10 && d.length <= 11 ? null : 'Telefone com DDD: 10 ou 11 dígitos (ex.: 62999853983)';
    }
    case 'EVP':
      return EVP_PATTERN.test(trimmed) ? null : 'Chave aleatória inválida';
  }
}

/** payout_pix_key_type.dart:16-23 (`fromAsaas`). */
export function pixKeyTypeFromStored(raw: string): PixKeyType | null {
  const v = raw.trim().toUpperCase();
  return (PIX_KEY_TYPES as string[]).includes(v) ? (v as PixKeyType) : null;
}

/** payout_pix_key_type.dart:26-39 (`inferFromKey`). */
export function inferPixKeyType(pixKey: string): PixKeyType {
  const key = pixKey.trim();
  if (key.includes('@')) return 'EMAIL';
  const digits = digitsOnly(key);
  if (digits.length === 11) return 'CPF';
  if (digits.length === 14) return 'CNPJ';
  if (EVP_PATTERN.test(key)) return 'EVP';
  if (digits.length >= 10 && digits.length <= 13) return 'PHONE';
  return 'EMAIL';
}

/** payout_pix_key_type.dart:41-43 (`initial`) — usado no prefill único (organizer_financial_page.dart:166-174). */
export function resolveInitialPixKeyType(storedType: string, pixKey: string): PixKeyType {
  return pixKeyTypeFromStored(storedType) ?? inferPixKeyType(pixKey);
}

export function maskPixKey(key: string): string {
  const trimmed = key.trim();
  return trimmed.length <= 12 ? trimmed : `${trimmed.slice(0, 8)}…`;
}
