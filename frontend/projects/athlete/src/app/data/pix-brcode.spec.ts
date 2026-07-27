import { buildPixBrCode, normalizePixKeyForBrCode } from './pix-brcode';

/** CRC-16/CCITT-FALSE independente (tabela) pra conferir o CRC emitido pelo builder. */
function crc16Check(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** Decompõe o payload em TLVs de topo (id → valor), validando os comprimentos. */
function parseTlv(payload: string): Map<string, string> {
  const fields = new Map<string, string>();
  let i = 0;
  while (i < payload.length) {
    const id = payload.slice(i, i + 2);
    const len = Number(payload.slice(i + 2, i + 4));
    const value = payload.slice(i + 4, i + 4 + len);
    expect(value.length).withContext(`campo ${id}`).toBe(len);
    fields.set(id, value);
    i += 4 + len;
  }
  return fields;
}

const BASE = {
  key: '62981512439',
  keyType: 'cpf',
  recipientName: 'Rayssa Suel Ramos',
  amount: 90,
};

describe('buildPixBrCode', () => {
  it('usa a cidade informada no campo 60, saneada pro formato EMV', () => {
    const fields = parseTlv(buildPixBrCode({ ...BASE, city: 'Goiânia' }));
    expect(fields.get('60')).toBe('GOIANIA');
  });

  it('só cai em BRASIL sem nenhuma cidade', () => {
    const fields = parseTlv(buildPixBrCode({ ...BASE }));
    expect(fields.get('60')).toBe('BRASIL');
  });

  it('carrega o txid no campo 62-05, saneado e truncado a 25', () => {
    const code = buildPixBrCode({ ...BASE, city: 'Goiânia', txid: 'INSC-abc123XYZ' });
    expect(parseTlv(code).get('62')).toBe('0513INSCabc123XYZ');
    const longo = buildPixBrCode({ ...BASE, city: 'Goiânia', txid: 'X'.repeat(40) });
    expect(parseTlv(longo).get('62')).toBe(`0525${'X'.repeat(25)}`);
  });

  it('emite CRC válido (recomputado por implementação independente)', () => {
    const code = buildPixBrCode({ ...BASE, city: 'Goiânia', txid: 'INSCtorneio1' });
    const semCrc = code.slice(0, -4);
    expect(semCrc.endsWith('6304')).toBeTrue();
    expect(code.slice(-4)).toBe(crc16Check(semCrc));
  });

  it('monta os campos obrigatórios do BR Code estático', () => {
    const fields = parseTlv(buildPixBrCode({ ...BASE, city: 'Goiânia' }));
    expect(fields.get('00')).toBe('01');
    expect(fields.get('26')).toBe('0014br.gov.bcb.pix011162981512439');
    expect(fields.get('52')).toBe('0000');
    expect(fields.get('53')).toBe('986');
    expect(fields.get('54')).toBe('90.00');
    expect(fields.get('58')).toBe('BR');
    expect(fields.get('59')).toBe('RAYSSA SUEL RAMOS');
  });

  it('omite o valor quando amount ≤ 0 (pagador digita no banco)', () => {
    const fields = parseTlv(buildPixBrCode({ ...BASE, amount: 0, city: 'Goiânia' }));
    expect(fields.has('54')).toBeFalse();
  });
});

describe('normalizePixKeyForBrCode', () => {
  it('CPF vira só dígitos; telefone ganha +55; EVP em minúsculas', () => {
    expect(normalizePixKeyForBrCode('629.815.124-39', 'cpf')).toBe('62981512439');
    expect(normalizePixKeyForBrCode('(62) 98151-2439', 'phone')).toBe('+5562981512439');
    expect(normalizePixKeyForBrCode('123E4567-E89B-12D3-A456-426655440000', 'random')).toBe(
      '123e4567-e89b-12d3-a456-426655440000',
    );
  });
});
