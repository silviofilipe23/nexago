/**
 * PIX copia-e-cola (BR Code estático, EMV® MPM / BCB) a partir da chave do
 * organizador — espelho de `nexago_app/.../pix_brcode.dart`.
 */

const PIX_GUI = 'br.gov.bcb.pix';

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
}): string {
  const cleanKey = opts.key.trim();
  const name = sanitizeText(opts.recipientName, 'RECEBEDOR', 25);
  const town = sanitizeText(opts.city ?? 'BRASIL', 'BRASIL', 15);
  const tx = sanitizeTxid(opts.txid ?? '***');
  const amount = opts.amount ?? 0;

  const mai = tlv('00', PIX_GUI) + tlv('01', cleanKey);
  let payload =
    tlv('00', '01') +
    tlv('26', mai) +
    tlv('52', '0000') +
    tlv('53', '986');

  if (amount > 0) {
    payload += tlv('54', amount.toFixed(2));
  }

  payload +=
    tlv('58', 'BR') +
    tlv('59', name) +
    tlv('60', town) +
    tlv('62', tlv('05', tx)) +
    '6304';

  return `${payload}${crc16(payload)}`;
}
