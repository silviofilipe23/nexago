import QRCode from 'qrcode';
import { httpsCallable, type Functions } from 'firebase/functions';

/**
 * QR de check-in da quadra (aulas da turma): o aluno lê no app, na tela de check-in. O conteúdo
 * (`nexago-checkin:v1:{token}`) vem pronto da callable `getArenaCourtCheckinQr` — o token só
 * existe no servidor, então o QR não se monta a partir dos ids da quadra.
 */

export interface CourtCheckinQr {
  payload: string;
  courtName: string;
  rotated: boolean;
}

export class CourtCheckinQrError extends Error {}

export async function fetchCourtCheckinQr(
  functions: Functions,
  input: { arenaId: string; courtId: string; rotate?: boolean },
): Promise<CourtCheckinQr> {
  try {
    const call = httpsCallable<typeof input, CourtCheckinQr>(functions, 'getArenaCourtCheckinQr');
    return (await call({ ...input, rotate: input.rotate === true })).data;
  } catch (err) {
    const message = err instanceof Error && err.message ? err.message : 'Não foi possível carregar o QR da quadra.';
    throw new CourtCheckinQrError(message);
  }
}

/** Quiet zone da spec do QR (4 módulos) e sempre escuro sobre claro — o painel é dark. */
const QR_OPTIONS = { errorCorrectionLevel: 'M', margin: 4, color: { dark: '#000000', light: '#ffffff' } } as const;

/** SVG na tela (PNG reamostrado borra os módulos); PNG grande no download/impressão. */
export async function courtQrSvgDataUrl(payload: string): Promise<string> {
  const svg = await QRCode.toString(payload, { ...QR_OPTIONS, type: 'svg' });
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function courtQrPngDataUrl(payload: string): Promise<string> {
  return QRCode.toDataURL(payload, { ...QR_OPTIONS, width: 1024 });
}

/** Nome do arquivo baixado: `qr-checkin-quadra-2.png`. */
export function courtQrFileName(courtName: string): string {
  const slug = courtName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `qr-checkin-${slug || 'quadra'}.png`;
}
