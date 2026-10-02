import '../../../core/formatting/app_currency_format.dart';
import '../domain/cashback_models.dart';
import '../domain/cashback_rules.dart';

/// Textos do cashback no app — um lugar só.
///
/// O bloco "Como funciona" é o REGULAMENTO da promoção (validade, mínimo em
/// dinheiro, sem saque): o dono revisa este arquivo antes de ligar
/// `appConfig/cashback.enabled`. O portal tem o seu equivalente — mudou aqui,
/// muda lá.
abstract final class CashbackCopy {
  static const String pageTitle = 'Meu cashback';
  static const String availableLabel = 'Disponível';
  static const String howItWorksTitle = 'Como funciona';
  static const String ledgerTitle = 'Extrato';
  static const String ledgerError = 'Não foi possível carregar o extrato.';
  static const String toggleTitle = 'Usar meu cashback';
  static const String summaryLabel = 'Cashback';
  static const String settingsFallbackSubtitle = 'Saldo e extrato';
  static const String pillTooltip = 'Ver meu cashback';
  static const String genericSuccessNote =
      'Pagamentos pelo app geram cashback — veja em Meu cashback';
  static const String openCashbackAction = 'Ver';

  /// As 5 linhas do "Como funciona", com os valores da config.
  static List<String> howItWorks(CashbackConfig config) {
    final months = config.expiryMonths == 1
        ? '1 mês'
        : '${config.expiryMonths} meses';
    return [
      'Ganhe até ${formatCashbackRate(config.ratePercent)}% de volta em '
          'reservas, inscrições e clubinho pagos pelo app.',
      'O cashback fica pendente e libera depois que o jogo acontece.',
      'Vale por $months depois de liberado.',
      'Use como desconto no próximo pagamento pelo app — sempre fica um '
          'mínimo de ${formatBRLFromCents(config.minCashCents)} no PIX.',
      'Não pode ser sacado nem transferido.',
    ];
  }

  static String pendingLine(int cents) =>
      'Pendente ${formatBRLFromCents(cents)} · libera depois do jogo';

  static String expiringLine(int cents, DateTime at) =>
      '${formatBRLFromCents(cents)} vencem em ${cashbackShortDate(at)}';

  static String heldLine(int cents) =>
      'Reservado ${formatBRLFromCents(cents)} · em um pagamento em andamento';

  static String emptyLedger(CashbackConfig config) =>
      'Você ainda não tem cashback. Pague reservas, inscrições e clubinho '
      'pelo app e ganhe até ${formatCashbackRate(config.ratePercent)}% de '
      'volta.';

  /// "+R$ 2,40" / "−R$ 15,00" (sinal de menos tipográfico, U+2212).
  static String signedAmount(CashbackLedgerEntry entry) {
    final sign = entry.isCredit ? '+' : '−';
    return '$sign${formatBRLFromCents(entry.amountCents)}';
  }

  /// Linha miúda sob o valor: "pendente · 28/09" no ganho, só a data no resto.
  static String ledgerMeta(CashbackLedgerEntry entry) {
    final createdAt = entry.createdAt;
    return [
      if (entry.type == CashbackLedgerType.earn) 'pendente',
      if (createdAt != null) cashbackShortDate(createdAt),
    ].join(' · ');
  }

  static String availableToUse(int cents) =>
      '${formatBRLFromCents(cents)} disponível';

  static String using(int cents) => 'Usando ${formatBRLFromCents(cents)}';

  static String minCashNote(int minCashCents) =>
      '(o mínimo de ${formatBRLFromCents(minCashCents)} vai no PIX)';

  static String summaryAmount(int cents) =>
      '−${formatBRLFromCents(cents)}';

  static String earnHint(CashbackConfig config) =>
      'Ganhe até ${formatCashbackRate(config.ratePercent)}% de volta neste '
      'pagamento';

  static String earnedNote(int cents) =>
      '+${formatBRLFromCents(cents)} de cashback pendente · libera depois do '
      'jogo';

  static String appliedNote(int cents) =>
      '${formatBRLFromCents(cents)} do seu cashback neste pagamento';
}
