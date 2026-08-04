import QRCode from 'qrcode';

/**
 * QR do link de inscrição — vetor na tela, raster no download.
 *
 * A exibição usa SVG pelo mesmo motivo do QR do Pix no portal do atleta (`pix-qr.ts`): PNG de
 * largura fixa reamostrado pelo browser borra os módulos e a câmera não fecha a leitura. Já o
 * download precisa ser PNG — é o que cola em cartaz, story e grupo de WhatsApp.
 */

/** Quiet zone exigida pela spec do QR (ISO/IEC 18004): 4 módulos de cada lado. */
const QUIET_ZONE_MODULES = 4;

/** Largura do PNG baixado. Generosa de propósito: o arquivo costuma virar cartaz impresso. */
const DOWNLOAD_WIDTH_PX = 1024;

/** Sempre escuro sobre claro — QR invertido não é lido pela maioria das câmeras, e o painel
 *  é dark, então o branco vem no próprio QR (o template só encosta ele num tile claro). */
const COLORS = { dark: '#000000', light: '#ffffff' } as const;

/** QR como data URL de SVG, pra `<img>` na tela. */
export async function shareQrSvgDataUrl(url: string): Promise<string | null> {
  if (!url.trim()) return null;
  try {
    const svg = await QRCode.toString(url, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: QUIET_ZONE_MODULES,
      color: COLORS,
    });
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  } catch {
    return null;
  }
}

/** QR como data URL de PNG em alta resolução, pro download. */
export async function shareQrPngDataUrl(url: string): Promise<string | null> {
  if (!url.trim()) return null;
  try {
    return await QRCode.toDataURL(url, {
      errorCorrectionLevel: 'M',
      margin: QUIET_ZONE_MODULES,
      width: DOWNLOAD_WIDTH_PX,
      color: COLORS,
    });
  } catch {
    return null;
  }
}
