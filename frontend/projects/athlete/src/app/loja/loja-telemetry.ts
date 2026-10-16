import { environment } from '../../environments/environment';

/** Eventos da vitrine — mesmos nomes do app (`docs/business-rules/loja-vitrine.md`). */
export type LojaEvent =
  | 'loja_vitrine_view'
  | 'loja_banner_click'
  | 'loja_categoria_select'
  | 'loja_busca'
  | 'loja_produto_click'
  | 'loja_add_rapido'
  | 'loja_favoritar'
  | 'loja_arena_trocar';

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
