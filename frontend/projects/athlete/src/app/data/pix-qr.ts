import QRCode from 'qrcode';

/**
 * QR do Pix como **SVG vetorial**.
 *
 * O QR era gerado como PNG de 440px e exibido num box de ~194px: a lib encaixa
 * os módulos num raster de largura fixa com escala fracionária (ex.: 7,7 px por
 * módulo, uns com 7 outros com 8 px) e o browser ainda reamostra tudo em 0,44x
 * com interpolação. O resultado são módulos borrados de ~3 px — a câmera não
 * fecha a leitura. Vetor não tem nenhuma dessas duas etapas: o browser rasteriza
 * na resolução real do dispositivo, e `shape-rendering="crispEdges"` (vem da
 * própria lib) mantém as bordas duras em qualquer tamanho.
 */

/** Quiet zone exigida pela spec do QR (ISO/IEC 18004): 4 módulos de cada lado.
 *  Era 2 aqui — margem curta atrapalha a leitura, ainda mais sobre fundo escuro. */
const QUIET_ZONE_MODULES = 4;

/** Payload EMV do Pix é sempre bem maior que isso; abaixo disso é lixo/vazio. */
const MIN_PAYLOAD_LENGTH = 20;

/** Gera o QR do payload EMV (copia e cola) como data URL de SVG. */
export async function pixQrSvgDataUrl(payload: string | null | undefined): Promise<string | null> {
  const trimmed = payload?.trim() ?? '';
  if (trimmed.length < MIN_PAYLOAD_LENGTH) return null;
  try {
    const svg = await QRCode.toString(trimmed, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: QUIET_ZONE_MODULES,
      color: { dark: '#000000', light: '#ffffff' },
    });
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  } catch {
    return null;
  }
}

export interface PixQrSource {
  /** Payload EMV (copia e cola) — fonte da verdade do que o QR codifica. */
  qrCode?: string | null;
  /** PNG pronto do provedor (Asaas), quando vier. */
  qrCodeBase64?: string | null;
}

/**
 * Prefere gerar o QR localmente a partir do payload: o PNG do provedor vem em
 * resolução fixa e desconhecida, e qualquer redimensionamento borra os módulos.
 * O base64 fica de fallback pra quando o payload não vier — os dois codificam
 * exatamente a mesma cobrança.
 */
export async function resolvePixQrSrc(source: PixQrSource): Promise<string | null> {
  const vector = await pixQrSvgDataUrl(source.qrCode);
  if (vector) return vector;
  const base64 = source.qrCodeBase64?.trim();
  return base64 ? `data:image/png;base64,${base64}` : null;
}
