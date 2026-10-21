import { courtQrFileName, courtQrSvgDataUrl } from './court-checkin-qr';

describe('court-checkin-qr', () => {
  it('nome do arquivo sem acento nem espaço', () => {
    expect(courtQrFileName('Quadra 2')).toBe('qr-checkin-quadra-2.png');
    expect(courtQrFileName('Areia Coberta (Central)')).toBe('qr-checkin-areia-coberta-central.png');
    expect(courtQrFileName('  ')).toBe('qr-checkin-quadra.png');
  });

  it('QR do payload vira SVG', async () => {
    const url = await courtQrSvgDataUrl('nexago-checkin:v1:AbCdEfGhIjKlMnOpQrStUv');
    expect(url.startsWith('data:image/svg+xml')).toBeTrue();
  });
});
