/** Sistema de feedback do portal do atleta — transcrito do projeto de design
 *  claude.ai/design "nexago" (telas 12 / 12b / 12c, "Mensagens de alerta e erro").
 *
 *  Quatro superfícies, cada uma com um papel fixo:
 *  - toast   → feedback de uma AÇÃO que o atleta acabou de fazer (some sozinho);
 *  - banner  → ESTADO do sistema (persiste enquanto a condição durar);
 *  - inline  → erro de formulário ou card (fica colado no que precisa de conserto);
 *  - dialog  → erro CRÍTICO que interrompe o fluxo e exige uma escolha.
 *
 *  Regra de copy do design, válida pras quatro: o que houve → consequência →
 *  próxima ação. Sem culpa, sem jargão, sempre dizendo o próximo passo. */

/** Semântica da mensagem. Define cor, ícone e urgência do anúncio a leitores de tela. */
export type NxFeedbackTone = 'success' | 'error' | 'warning' | 'info';

/** Ação opcional de uma mensagem — sempre um verbo no infinitivo ("Tentar novamente"). */
export interface NxFeedbackAction {
  readonly label: string;
  readonly run: () => void;
}
