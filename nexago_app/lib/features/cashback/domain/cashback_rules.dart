import 'cashback_models.dart';

/// Reais (como chegam das callables e dos args) → centavos sem erro de ponto
/// flutuante: `19.99 * 100` é `1998.9999…`, e truncar daria um centavo a menos.
int reaisToCents(double reais) => (reais * 100).round();

/// Espelho de `computeRedeemableCents` do servidor: quanto do saldo cabe nesta
/// cobrança deixando sempre o mínimo em dinheiro. É só a PRÉVIA — o servidor
/// recalcula e devolve o valor aplicado de verdade.
int redeemablePreviewCents({
  required int availableCents,
  required int priceCents,
  required int minCashCents,
}) {
  final cap = priceCents - minCashCents;
  final usable = availableCents < cap ? availableCents : cap;
  return usable > 0 ? usable : 0;
}

/// Valor da pílula da home, ou `null` para escondê-la: só com o recurso ligado
/// e saldo (disponível + pendente) positivo.
int? cashbackPillCents({CashbackConfig? config, CashbackWallet? wallet}) {
  if (config == null || !config.enabled || wallet == null) return null;
  final total = wallet.balanceCents;
  return total > 0 ? total : null;
}

/// O que um checkout precisa saber do cashback: a config e o disponível.
class CashbackCheckoutContext {
  const CashbackCheckoutContext({
    required this.config,
    required this.availableCents,
  });

  final CashbackConfig config;
  final int availableCents;
}

/// Os três estados do toggle no checkout.
enum CashbackToggleMode {
  /// Recurso desligado (ou ainda carregando): nada aparece.
  hidden,

  /// Ligado, mas nada do saldo cabe nesta cobrança: só "Ganhe até X%".
  earnHint,

  /// Ligado com saldo usável: o switch "Usar meu cashback".
  toggle,
}

/// Prévia do cashback num checkout, para um preço e a escolha do atleta.
class CashbackCheckoutQuote {
  const CashbackCheckoutQuote({
    required this.mode,
    required this.priceCents,
    required this.availableCents,
    required this.redeemableCents,
    required this.useCashback,
  });

  final CashbackToggleMode mode;
  final int priceCents;
  final int availableCents;
  final int redeemableCents;
  final bool useCashback;

  /// Saldo que a tela promete usar (zero com o switch desligado).
  int get appliedPreviewCents =>
      mode == CashbackToggleMode.toggle && useCashback ? redeemableCents : 0;

  /// Total que a prévia manda para o PIX.
  int get chargePreviewCents => priceCents - appliedPreviewCents;

  /// O mínimo em dinheiro segurou parte do saldo ("o mínimo de R$ 5 vai no
  /// PIX").
  bool get minCashHoldsBack => redeemableCents < availableCents;

  /// Manda `useCashback: true` na callable só com o switch ligado e algo a
  /// usar.
  bool get sendUseCashback => appliedPreviewCents > 0;
}

CashbackCheckoutQuote quoteCheckoutCashback({
  required int priceCents,
  required CashbackCheckoutContext? checkout,
  required bool useCashback,
}) {
  final available = checkout?.availableCents ?? 0;
  if (checkout == null || !checkout.config.enabled || priceCents <= 0) {
    return CashbackCheckoutQuote(
      mode: CashbackToggleMode.hidden,
      priceCents: priceCents,
      availableCents: available,
      redeemableCents: 0,
      useCashback: useCashback,
    );
  }
  final redeemable = redeemablePreviewCents(
    availableCents: available,
    priceCents: priceCents,
    minCashCents: checkout.config.minCashCents,
  );
  return CashbackCheckoutQuote(
    mode: redeemable > 0
        ? CashbackToggleMode.toggle
        : CashbackToggleMode.earnHint,
    priceCents: priceCents,
    availableCents: available,
    redeemableCents: redeemable,
    useCashback: useCashback,
  );
}

const List<String> _monthNames = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

/// "outubro de 2026" — sem depender dos dados de locale do intl.
String cashbackMonthTitle(DateTime at) =>
    '${_monthNames[at.month - 1]} de ${at.year}';

/// "12/10".
String cashbackShortDate(DateTime at) {
  final dd = at.day.toString().padLeft(2, '0');
  final mm = at.month.toString().padLeft(2, '0');
  return '$dd/$mm';
}

/// Grupo de lançamentos sem data (o servidor sempre grava; é defesa).
const String cashbackUndatedMonthTitle = 'Sem data';

class CashbackLedgerMonth {
  const CashbackLedgerMonth({required this.title, required this.entries});

  final String title;
  final List<CashbackLedgerEntry> entries;
}

/// Agrupa por mês mantendo a ordem de chegada (o extrato vem do mais recente
/// para o mais antigo).
List<CashbackLedgerMonth> groupLedgerByMonth(
  List<CashbackLedgerEntry> entries,
) {
  final titles = <String>[];
  final byTitle = <String, List<CashbackLedgerEntry>>{};
  final undated = <CashbackLedgerEntry>[];
  for (final entry in entries) {
    final at = entry.createdAt;
    if (at == null) {
      undated.add(entry);
      continue;
    }
    final title = cashbackMonthTitle(at);
    final bucket = byTitle[title];
    if (bucket == null) {
      titles.add(title);
      byTitle[title] = [entry];
    } else {
      bucket.add(entry);
    }
  }
  return [
    for (final title in titles)
      CashbackLedgerMonth(title: title, entries: byTitle[title]!),
    if (undated.isNotEmpty)
      CashbackLedgerMonth(title: cashbackUndatedMonthTitle, entries: undated),
  ];
}

/// "2" para 2.0, "2,5" para 2.5.
String formatCashbackRate(double ratePercent) {
  if (ratePercent == ratePercent.roundToDouble()) {
    return ratePercent.round().toString();
  }
  return ratePercent.toString().replaceAll('.', ',');
}
