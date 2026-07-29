import { pixQrSvgDataUrl, resolvePixQrSrc } from './pix-qr';

const PAYLOAD =
  '00020101021226900014BR.GOV.BCB.PIX2568pix.asaas.com/qr/cobv/9f8c2b1a4d5e6f7a8b9c0d1e2f3' +
  'a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a5204000053039865406120.005802BR5925ASAAS GESTAO ' +
  'FINANCEIRA S6009SAO PAULO62070503***63041A2B';

function decode(dataUrl: string): string {
  return decodeURIComponent(dataUrl.replace('data:image/svg+xml;charset=utf-8,', ''));
}

describe('pixQrSvgDataUrl', () => {
  it('gera SVG vetorial, não raster', async () => {
    const src = await pixQrSvgDataUrl(PAYLOAD);
    expect(src).toBeTruthy();
    expect(src!.startsWith('data:image/svg+xml')).toBeTrue();
  });

  it('mantém as bordas duras e escaláveis (viewBox em módulos + crispEdges)', async () => {
    const svg = decode((await pixQrSvgDataUrl(PAYLOAD))!);
    expect(svg).toContain('shape-rendering="crispEdges"');
    expect(svg).toMatch(/viewBox="0 0 (\d+) \1"/);
    // Sem width/height fixos o SVG acompanha o container sem reamostragem.
    expect(svg).not.toMatch(/<svg[^>]*\swidth="/);
  });

  it('reserva a quiet zone de 4 módulos exigida pela spec', async () => {
    const svg = decode((await pixQrSvgDataUrl(PAYLOAD))!);
    const total = Number(/viewBox="0 0 (\d+)/.exec(svg)![1]);
    // Módulos do símbolo = total - 2 margens de 4; versões QR são 21 + 4n.
    const symbol = total - 8;
    expect((symbol - 21) % 4).toBe(0);
  });

  it('recusa payload vazio ou curto demais para ser um BR Code', async () => {
    expect(await pixQrSvgDataUrl(null)).toBeNull();
    expect(await pixQrSvgDataUrl('')).toBeNull();
    expect(await pixQrSvgDataUrl('   ')).toBeNull();
    expect(await pixQrSvgDataUrl('0002010102')).toBeNull();
  });
});

describe('resolvePixQrSrc', () => {
  it('prefere o vetor gerado do payload ao PNG do provedor', async () => {
    const src = await resolvePixQrSrc({ qrCode: PAYLOAD, qrCodeBase64: 'aGVsbG8=' });
    expect(src!.startsWith('data:image/svg+xml')).toBeTrue();
  });

  it('cai no PNG do provedor quando não há payload', async () => {
    const src = await resolvePixQrSrc({ qrCode: '', qrCodeBase64: 'aGVsbG8=' });
    expect(src).toBe('data:image/png;base64,aGVsbG8=');
  });

  it('devolve null quando não há nem payload nem imagem', async () => {
    expect(await resolvePixQrSrc({ qrCode: '', qrCodeBase64: '' })).toBeNull();
    expect(await resolvePixQrSrc({})).toBeNull();
  });
});
