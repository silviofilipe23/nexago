/** Configuração fixa dos cards de doação e patrocinadores do overlay.
 *
 *  Até 01/10/2026 isto morava em `window.NXOverlay`, ajustável no console do OBS, junto com
 *  atalhos de teclado e botões invisíveis. Saiu tudo da tela do ar a pedido do dono: o overlay
 *  só EXIBE, e o que liga, desliga e mostra agora vem do painel do organizador (tela
 *  Transmissão → `tournaments/{id}/broadcast/control`). */

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
  card: {
    /** Ciclo ligado. Desligado, só aparece com "Mostrar agora" do painel. */
    enabled: boolean;
    /** Segundos entre aparições (e antes da 1ª). */
    intervaloSeg: number;
    /** Segundos no ar — divididos entre os logos. */
    visivelSeg: number;
  };
}

export const DEFAULT_OVERLAY_DOACAO: OverlayDoacaoConfig = {
  enabled: true,
  atrasoSeg: 3,
  visivelSeg: 20,
  intervaloSeg: 90,
  // Chave comercial nexaGO (mesmo WhatsApp de vendas).
  pixKey: '9368f0d9-98df-4ec0-afcd-99487219182f',
  pixKeyType: 'Aleatória',
  recipientName: 'NEXAGO',
  city: 'BRASIL',
  kicker: 'Doe via Pix',
  titulo: 'Apoie o nexaGO',
  apoio: 'Aponte a câmera e doe qualquer valor para manter o projeto vivo.',
};

export const DEFAULT_OVERLAY_PATRO: OverlayPatroConfig = {
  card: { enabled: true, intervaloSeg: 300, visivelSeg: 15 },
};
