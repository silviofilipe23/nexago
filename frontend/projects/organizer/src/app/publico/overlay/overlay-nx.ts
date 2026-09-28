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

/** Um patrocinador como o overlay mostra: `logo` vazio vira espaço reservado com o nome. */
export interface OverlayPatroItem {
  nome: string;
  logo: string;
}

export interface OverlayPatroConfig {
  /** Sobrescreve a lista do torneio. Vazia = patrocinadores cadastrados no torneio. */
  lista: OverlayPatroItem[];
  card: {
    /** Ciclo ligado ("patroc. on/off"). Desligado, só aparece com "patroc. agora". */
    enabled: boolean;
    /** Segundos entre aparições (e antes da 1ª). */
    intervaloSeg: number;
    /** Segundos no ar — divididos entre os logos. */
    visivelSeg: number;
  };
}

export interface OverlayNxSettings {
  doacao: OverlayDoacaoConfig;
  patro: OverlayPatroConfig;
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

export const DEFAULT_OVERLAY_PATRO: OverlayPatroConfig = {
  lista: [],
  card: { enabled: true, intervaloSeg: 300, visivelSeg: 15 },
};

export const DEFAULT_OVERLAY_SETTINGS: OverlayNxSettings = {
  doacao: { ...DEFAULT_OVERLAY_DOACAO },
  patro: structuredClone(DEFAULT_OVERLAY_PATRO),
};

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

type Listener = (settings: OverlayNxSettings) => void;

let settings: OverlayNxSettings = structuredClone(DEFAULT_OVERLAY_SETTINGS);
const listeners = new Set<Listener>();
let showHandler: (() => void) | null = null;
let hideHandler: (() => void) | null = null;
let patroShowHandler: (() => void) | null = null;

function notify(): void {
  const snap = snapshot();
  for (const fn of listeners) fn(snap);
}

export function snapshot(): OverlayNxSettings {
  return {
    doacao: { ...settings.doacao },
    patro: { lista: settings.patro.lista.map((i) => ({ ...i })), card: { ...settings.patro.card } },
  };
}

export function getOverlaySettings(): OverlayNxSettings {
  return snapshot();
}

export function setOverlaySettings(partial: DeepPartial<OverlayNxSettings>): OverlayNxSettings {
  if (partial.doacao) {
    settings = { ...settings, doacao: { ...settings.doacao, ...partial.doacao } };
  }
  if (partial.patro) {
    const lista = partial.patro.lista;
    settings = {
      ...settings,
      patro: {
        // Lista é trocada inteira, não mesclada item a item.
        lista: Array.isArray(lista)
          ? lista.map((i) => ({ nome: String(i?.nome ?? ''), logo: String(i?.logo ?? '') }))
          : settings.patro.lista,
        card: { ...settings.patro.card, ...partial.patro.card },
      },
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

/** Ligado pelo overlay-page: "patroc. agora". */
export function bindOverlayPatroControls(show: () => void): () => void {
  patroShowHandler = show;
  return () => {
    if (patroShowHandler === show) patroShowHandler = null;
  };
}

export interface NxOverlayApi {
  get(): OverlayNxSettings;
  set(partial: DeepPartial<OverlayNxSettings>): OverlayNxSettings;
  /** Mostra o card na hora (reinicia o timer de visível). */
  showDoacao(): void;
  /** Esconde o card e para o ciclo até `showDoacao` ou `set({doacao:{enabled:true}})`. */
  hideDoacao(): void;
  /** "patroc. agora": mostra o card de patrocinadores na hora. */
  showPatro(): void;
  /** "patroc. on/off": liga ou desliga o ciclo automático. Devolve o estado novo. */
  togglePatro(): boolean;
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
    showPatro: () => patroShowHandler?.(),
    togglePatro: () => togglePatroCard(),
  };
  if (typeof window !== 'undefined') {
    window.NXOverlay = api;
  }
  return api;
}

export function togglePatroCard(): boolean {
  const enabled = !settings.patro.card.enabled;
  setOverlaySettings({ patro: { card: { enabled } } });
  return enabled;
}

/** Só pra teste: volta ao default e limpa listeners. */
export function resetOverlaySettingsForTests(): void {
  settings = structuredClone(DEFAULT_OVERLAY_SETTINGS);
  listeners.clear();
  showHandler = null;
  hideHandler = null;
  patroShowHandler = null;
}
