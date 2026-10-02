import { formatCentsBRL, formatRatePercent, type CashbackConfig } from '../data/cashback-model';

/**
 * REGULAMENTO da promoção — o dono revisa este texto antes de ligar
 * `appConfig/cashback.enabled`. Único lugar do portal com estas frases; os números vêm da
 * config ao vivo. O app (fase 3) tem o seu equivalente.
 */
export function cashbackHowItWorks(config: CashbackConfig): readonly string[] {
  const months = config.expiryMonths === 1 ? '1 mês' : `${config.expiryMonths} meses`;
  return [
    `Ganhe até ${formatRatePercent(config.ratePercent)}% de volta em reservas, inscrições e clubinho pagos pelo app.`,
    'O cashback fica pendente e libera depois que o jogo acontece.',
    `Vale por ${months} depois de liberado.`,
    `Use como desconto no próximo pagamento pelo app — sempre fica um mínimo de ${formatCentsBRL(config.minCashCents)} no PIX.`,
    'Não pode ser sacado nem transferido.',
  ];
}

export function cashbackEmptyText(config: CashbackConfig): string {
  return `Você ainda não tem cashback. Pague reservas, inscrições e clubinho pelo app e ganhe até ${formatRatePercent(config.ratePercent)}% de volta.`;
}
