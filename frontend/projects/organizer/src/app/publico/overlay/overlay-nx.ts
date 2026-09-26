/** Configuração pública do overlay — ajustável no console do OBS via `NXOverlay.set(...)`.
 *
 *  Mora em `window.NXOverlay` porque o Browser Source não tem UI: o operador abre
 *  "Interagir" e digita no console. Sem isto, mudar duração da doação exigiria
 *  redeploy. */

export interface OverlayDoacaoConfig {
  /** Ciclo ligado. `false` esconde e não agenda. */
  enabled: boolean;
  /** Segundos após abrir o overlay antes da 1ª aparição. */
  atrasoSeg: number;
  /** Segundos visível a cada ciclo. */
  visivelSeg: number;
  /** Segundos escondido entre aparições. */
  intervaloSeg: number;
  /** Chave PIX (EVP/e-mail/telefone/CPF/CNPJ). Vazia = card não aparece. */
  pixKey: string;
  /** Tipo DICT opcional — ajuda a normalizar telefone/EVP. */
  pixKeyType: string;
  /** Nome do recebedor no BR Code (máx. 25, sem acento). */
  recipientName: string;
  city: string;
  kicker: string;
  titulo: string;
  apoio: string;
}

export interface OverlayNxSettings {
  doacao: OverlayDoacaoConfig;
}

export const DEFAULT_OVERLAY_DOACAO: OverlayDoacaoConfig = {
  enabled: true,
  atrasoSeg: 3,
  visivelSeg: 20,
  intervaloSeg: 90,
  // Chave comercial nexaGO (mesmo WhatsApp de vendas). Override no ar:
  // NXOverlay.set({ doacao: { pixKey: '...' } }).
  pixKey: '9368f0d9-98df-4ec0-afcd-99487219182f',
  pixKeyType: 'Aleatória',
  recipientName: 'NEXAGO',
  city: 'BRASIL',
  kicker: 'Doe via Pix',
  titulo: 'Apoie o nexaGO',
  apoio: 'Aponte a câmera e doe qualquer valor para manter o projeto vivo.',
};

export const DEFAULT_OVERLAY_SETTINGS: OverlayNxSettings = {
  doacao: { ...DEFAULT_OVERLAY_DOACAO },
};

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

type Listener = (settings: OverlayNxSettings) => void;

let settings: OverlayNxSettings = structuredClone(DEFAULT_OVERLAY_SETTINGS);
const listeners = new Set<Listener>();
let showHandler: (() => void) | null = null;
let hideHandler: (() => void) | null = null;

function notify(): void {
  const snap = snapshot();
  for (const fn of listeners) fn(snap);
}

export function snapshot(): OverlayNxSettings {
  return {
    doacao: { ...settings.doacao },
  };
}

export function getOverlaySettings(): OverlayNxSettings {
  return snapshot();
}

export function setOverlaySettings(partial: DeepPartial<OverlayNxSettings>): OverlayNxSettings {
  if (partial.doacao) {
    settings = {
      doacao: { ...settings.doacao, ...partial.doacao },
    };
  }
  notify();
  return snapshot();
}

export function subscribeOverlaySettings(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Ligado pelo overlay-page: show força o card agora; hide para o ciclo. */
export function bindOverlayDoacaoControls(handlers: {
  show: () => void;
  hide: () => void;
}): () => void {
  showHandler = handlers.show;
  hideHandler = handlers.hide;
  return () => {
    if (showHandler === handlers.show) showHandler = null;
    if (hideHandler === handlers.hide) hideHandler = null;
  };
}

export interface NxOverlayApi {
  get(): OverlayNxSettings;
  set(partial: DeepPartial<OverlayNxSettings>): OverlayNxSettings;
  /** Mostra o card na hora (reinicia o timer de visível). */
  showDoacao(): void;
  /** Esconde o card e para o ciclo até `showDoacao` ou `set({doacao:{enabled:true}})`. */
  hideDoacao(): void;
}

declare global {
  interface Window {
    NXOverlay?: NxOverlayApi;
  }
}

/** Instala `window.NXOverlay` uma vez — idempotente. */
export function installNxOverlay(): NxOverlayApi {
  const api: NxOverlayApi = {
    get: getOverlaySettings,
    set: setOverlaySettings,
    showDoacao: () => showHandler?.(),
    hideDoacao: () => hideHandler?.(),
  };
  if (typeof window !== 'undefined') {
    window.NXOverlay = api;
  }
  return api;
}

/** Só pra teste: volta ao default e limpa listeners. */
export function resetOverlaySettingsForTests(): void {
  settings = structuredClone(DEFAULT_OVERLAY_SETTINGS);
  listeners.clear();
  showHandler = null;
  hideHandler = null;
}
