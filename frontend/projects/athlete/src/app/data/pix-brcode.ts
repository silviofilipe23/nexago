/**
 * PIX copia-e-cola (BR Code estático, EMV® MPM / BCB) a partir da chave do
 * organizador — espelho de `nexago_app/.../pix_brcode.dart`.
 *
 * Importante: a chave no campo 26-01 precisa seguir o Manual do DICT
 * (telefone com +55, CPF/CNPJ só dígitos, EVP em minúsculas). Sem isso o
 * app do banco rejeita o QR / copia-e-cola.
 */

const PIX_GUI = 'br.gov.bcb.pix';
const EVP_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type PixKeyKind = 'phone' | 'cpf' | 'cnpj' | 'email' | 'random' | 'raw';

function tlv(id: string, value: string): string {
  return `${id}${String(value.length).padStart(2, '0')}${value}`;
}

/** CRC16-CCITT (poly 0x1021, init 0xFFFF), 4 hex maiúsculos. */
function crc16(payload: string): string {
  const polynomial = 0x1021;
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ polynomial) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function stripDiacritics(input: string): string {
  const from = 'àáâãäçèéêëìíîïñòóôõöùúûüýÿÀÁÂÃÄÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝ';
  const to = 'aaaaaceeeeiiiinooooouuuuyyAAAAACEEEEIIIINOOOOOUUUUY';
  let result = input;
  for (let i = 0; i < from.length; i++) {
    result = result.replaceAll(from[i]!, to[i]!);
  }
  return result;
}

function sanitizeText(raw: string, fallback: string, maxLen: number): string {
  const stripped = stripDiacritics(raw)
    .replace(/[^A-Za-z0-9 ]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
  const value = stripped.length === 0 ? fallback : stripped;
  return value.length > maxLen ? value.slice(0, maxLen) : value;
}

function sanitizeTxid(raw: string): string {
  const cleaned = stripDiacritics(raw).replace(/[^A-Za-z0-9]/g, '');
  if (cleaned.length === 0) return '***';
  return cleaned.length > 25 ? cleaned.slice(0, 25) : cleaned;
}

function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, '');
}

function resolveKeyKind(raw: string, keyType?: string): PixKeyKind {
  const type = (keyType ?? '').trim().toLowerCase();
  if (type === 'phone' || type === 'telefone' || type === 'celular') return 'phone';
  if (type === 'cpf') return 'cpf';
  if (type === 'cnpj') return 'cnpj';
  if (type === 'email' || type === 'e-mail') return 'email';
  if (type === 'random' || type === 'evp' || type === 'aleatoria' || type === 'aleatória') return 'random';

  const key = raw.trim();
  if (key.includes('@')) return 'email';
  if (EVP_PATTERN.test(key)) return 'random';
  const digits = digitsOnly(key);
  if (digits.length === 14) return 'cnpj';
  if (key.startsWith('+') || (digits.length >= 10 && digits.length <= 13 && digits.startsWith('55'))) {
    return 'phone';
  }
  // Celular BR: DDD + 9 + 8 dígitos (11). Sem keyType, preferimos telefone se o 3º dígito for 9.
  if (digits.length === 11 && digits[2] === '9') return 'phone';
  if (digits.length === 11) return 'cpf';
  if (digits.length === 10) return 'phone';
  return 'raw';
}

/**
 * Normaliza a chave para o formato DICT exigido no BR Code.
 * Telefone → +55DDDNÚMERO; CPF/CNPJ → só dígitos; EVP → minúsculas.
 */
export function normalizePixKeyForBrCode(raw: string, keyType?: string): string {
  const key = raw.trim();
  if (!key) return key;
  const kind = resolveKeyKind(key, keyType);

  switch (kind) {
    case 'phone': {
      let d = digitsOnly(key);
      if (d.startsWith('55') && (d.length === 12 || d.length === 13)) {
        d = d.slice(2);
      }
      if (d.length < 10 || d.length > 11) return key;
      return `+55${d}`;
    }
    case 'cpf': {
      const d = digitsOnly(key);
      return d.length === 11 ? d : key;
    }
    case 'cnpj': {
      const d = key.toUpperCase().replace(/[^0-9A-Z]/g, '');
      return d.length === 14 ? d : key;
    }
    case 'email':
      return key;
    case 'random':
      return key.toLowerCase();
    default:
      return key;
  }
}

export function isLikelyValidPixKey(key: string | null | undefined): boolean {
  return key != null && key.trim().length > 0;
}

/** Monta o BR Code. `amount` em reais; ≤ 0 omite o valor (pagador digita no banco). */
export function buildPixBrCode(opts: {
  key: string;
  recipientName: string;
  city?: string;
  amount?: number;
  txid?: string;
  keyType?: string;
}): string {
  const cleanKey = normalizePixKeyForBrCode(opts.key, opts.keyType);
  const name = sanitizeText(opts.recipientName, 'RECEBEDOR', 25);
  const town = sanitizeText(opts.city ?? 'BRASIL', 'BRASIL', 15);
  const tx = sanitizeTxid(opts.txid ?? '***');
  const amount = opts.amount ?? 0;
  const amountFixed = amount > 0 ? (Math.round(amount * 100) / 100).toFixed(2) : null;

  const mai = tlv('00', PIX_GUI) + tlv('01', cleanKey);
  let payload =
    tlv('00', '01') +
    tlv('26', mai) +
    tlv('52', '0000') +
    tlv('53', '986');

  if (amountFixed) {
    payload += tlv('54', amountFixed);
  }

  payload +=
    tlv('58', 'BR') +
    tlv('59', name) +
    tlv('60', town) +
    tlv('62', tlv('05', tx)) +
    '6304';

  return `${payload}${crc16(payload)}`;
}
