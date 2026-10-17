import { environment } from '../../environments/environment';

/** Eventos da Loja — mesmos nomes do app (`docs/business-rules/loja-vitrine.md`). */
export type LojaEvent =
  | 'loja_vitrine_view'
  | 'loja_banner_click'
  | 'loja_categoria_select'
  | 'loja_busca'
  | 'loja_produto_click'
  | 'loja_add_rapido'
  | 'loja_favoritar'
  | 'loja_arena_trocar'
  // Página do produto (tela 02, `docs/business-rules/loja-produto.md`).
  | 'loja_produto_view'
  | 'loja_foto_swipe'
  | 'loja_variacao_select'
  | 'loja_avise_me'
  | 'loja_add_carrinho'
  | 'loja_entrega_select'
  | 'loja_personalizar_open'
  // Personalizar (tela 02b, `docs/business-rules/loja-personalizar.md`).
  | 'loja_personalizar_nome'
  | 'loja_personalizar_imagem'
  // Favoritos (tela 07, `docs/business-rules/loja-favoritos.md`).
  | 'loja_favoritos_view'
  | 'loja_relacionado_click';

/**
 * Ponto único dos eventos da Loja no portal. O portal ainda não tem coletor de analytics
 * (mesmo caso de `trackAuthEvent`): em dev loga no console; ligar GA4/Firebase Analytics é
 * trocar só este corpo.
 */
export function trackLojaEvent(event: LojaEvent, params: Record<string, unknown> = {}): void {
  if (!environment.production && typeof console !== 'undefined' && console.debug) {
    console.debug('[nexago-loja]', event, params);
  }
}
