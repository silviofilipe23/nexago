/**
 * PIX copia-e-cola (BR Code estático) pra doação no overlay.
 *
 * Espelho enxuto de `athlete/.../pix-brcode.ts` — o projeto organizer não
 * importa o athlete; duplicar o gerador aqui evita acoplar dois apps pelo QR
 * de doação. Se a regra DICT mudar, atualizar os dois.
 */

const PIX_GUI = 'br.gov.bcb.pix';
const EVP_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function tlv(id: string, value: string): string {
  return `${id}${String(value.length).padStart(2, '0')}${value}`;
}

function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
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

function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, '');
}

function normalizeKey(raw: string, keyType?: string): string {
  const key = raw.trim();
  if (!key) return key;
  const type = (keyType ?? '').trim().toLowerCase();
  if (type === 'email' || key.includes('@')) return key;
  if (type === 'random' || type === 'evp' || EVP_PATTERN.test(key)) return key.toLowerCase();
  const digits = digitsOnly(key);
  if (type === 'cpf' || (digits.length === 11 && digits[2] !== '9' && !type)) {
    return digits.length === 11 ? digits : key;
  }
  if (type === 'cnpj' || digits.length === 14) {
    return digits.length === 14 ? digits : key;
  }
  // Telefone
  let d = digits;
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) d = d.slice(2);
  if (d.length >= 10 && d.length <= 11) return `+55${d}`;
  return key;
}

/** Monta BR Code estático sem valor — o doador digita no banco. */
export function buildDonationPixBrCode(opts: {
  key: string;
  recipientName: string;
  city?: string;
  keyType?: string;
}): string | null {
  const cleanKey = normalizeKey(opts.key, opts.keyType);
  if (!cleanKey) return null;
  const name = sanitizeText(opts.recipientName, 'NEXAGO', 25);
  const town = sanitizeText(opts.city ?? 'BRASIL', 'BRASIL', 15);
  const mai = tlv('00', PIX_GUI) + tlv('01', cleanKey);
  const payload =
    tlv('00', '01') +
    tlv('26', mai) +
    tlv('52', '0000') +
    tlv('53', '986') +
    tlv('58', 'BR') +
    tlv('59', name) +
    tlv('60', town) +
    tlv('62', tlv('05', 'DOACAO')) +
    '6304';
  return `${payload}${crc16(payload)}`;
}
