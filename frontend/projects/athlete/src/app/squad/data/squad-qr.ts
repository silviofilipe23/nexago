import QRCode from 'qrcode';

/**
 * QR do link do embaixador (`?squad=CODIGO&via=qr`): vetor na tela, PNG no download e no card.
 *
 * Mesmo motivo do QR do Pix (`data/pix-qr.ts`): PNG de largura fixa reamostrado pelo browser
 * borra os módulos e a câmera não fecha a leitura. Sempre escuro sobre claro.
 */
const QUIET_ZONE_MODULES = 4;
const COLORS = { dark: '#000000', light: '#ffffff' } as const;

export async function squadQrSvgDataUrl(url: string): Promise<string | null> {
  if (!url.trim()) return null;
  try {
    const svg = await QRCode.toString(url, { type: 'svg', errorCorrectionLevel: 'M', margin: QUIET_ZONE_MODULES, color: COLORS });
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  } catch {
    return null;
  }
}

/** PNG em alta resolução: vira cartaz impresso e entra no card do story. */
export async function squadQrPngDataUrl(url: string, width = 1024): Promise<string | null> {
  if (!url.trim()) return null;
  try {
    return await QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: QUIET_ZONE_MODULES, width, color: COLORS });
  } catch {
    return null;
  }
}
