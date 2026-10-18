/**
 * Compartilhar e copiar no portal: folha nativa quando existe, área de transferência senão.
 * Devolve o que aconteceu para a tela dar o retorno certo (o cancelamento da folha não é erro).
 */
export type ShareOutcome = 'shared' | 'copied' | 'canceled' | 'failed';

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export async function shareLink(input: { title: string; text: string; url: string }): Promise<ShareOutcome> {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share(input);
      return 'shared';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'canceled';
    }
  }
  return (await copyText(`${input.text} ${input.url}`)) ? 'copied' : 'failed';
}

/** Arquivo pela folha nativa (celular) ou download (desktop sem suporte a arquivo). */
export async function shareOrDownloadFile(blob: Blob, fileName: string, title: string): Promise<ShareOutcome | 'downloaded'> {
  const file = new File([blob], fileName, { type: blob.type || 'image/png' });
  if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return 'shared';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'canceled';
    }
  }
  downloadBlob(blob, fileName);
  return 'downloaded';
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return (await fetch(dataUrl)).blob();
}
