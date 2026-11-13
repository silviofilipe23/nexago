/**
 * Caminhos das imagens da arena no Storage — nome NOVO a cada envio (`cover-{ms}`).
 *
 * Sobrescrever o mesmo arquivo pelo SDK do cliente troca o token de download na hora: a URL que
 * está no Firestore passa a responder 403 antes de a nova ser gravada. Na capa/logo o upload
 * acontece ao escolher a imagem e a URL só vai pro Firestore no "Salvar": quem escolhia outra capa
 * e saía sem salvar quebrava a capa publicada. Com um nome por envio, a imagem anterior segue
 * válida até a nova ser gravada (mesma solução do avatar do atleta, `profileImagePath`).
 */

/** Imagens soltas na pasta da arena: capa, logo, mini-site e capa da vitrine de aulas. */
export type ArenaImageName = 'cover' | 'logo' | 'site-hero' | 'site-about-1' | 'site-about-2' | 'site-about-3' | 'classes-cover';

/** `arenas/{arenaId}/{name}-{ms}`. O storage.rules aceita `cover-{ms}`/`logo-{ms}` do gestor. */
export function arenaImagePath(arenaId: string, name: ArenaImageName, now = Date.now()): string {
  return `arenas/${arenaId}/${name}-${now}`;
}

/** `arenas/{arenaId}/products/{productId}-{ms}.jpg` — mesmo formato do app
 *  (`arenaProductImageFileName`). */
export function productImagePath(arenaId: string, productId: string, now = Date.now()): string {
  return `arenas/${arenaId}/products/${productId}-${now}.jpg`;
}

/** Caminho do objeto dentro do bucket a partir da download URL do Firebase Storage
 *  (`.../o/arenas%2Fa1%2Fcover?alt=media&token=...`). `null` se não for uma. */
export function storagePathFromDownloadUrl(url: string | null | undefined): string | null {
  const match = /^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/[^/]+\/o\/([^?#]+)/.exec((url ?? '').trim());
  if (!match) {
    return null;
  }
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

/** A foto antiga do produto que pode ser apagada depois que o doc passou a apontar para outra
 *  (ou para nenhuma): só arquivo da pasta de produtos DESTA arena e diferente do novo. Emoji, URL
 *  externa ou arquivo de outra pasta nunca entram. */
export function replacedProductImagePath(
  arenaId: string,
  previousUrl: string | null | undefined,
  nextUrl: string | null | undefined,
): string | null {
  const previous = storagePathFromDownloadUrl(previousUrl);
  if (!previous || !previous.startsWith(`arenas/${arenaId}/products/`)) {
    return null;
  }
  return previous === storagePathFromDownloadUrl(nextUrl) ? null : previous;
}
