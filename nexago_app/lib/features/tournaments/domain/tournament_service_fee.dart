import 'dart:math' as math;

/// Quem paga a taxa da nexaGO sobre a inscrição ("Quem paga" no backoffice).
///
/// Espelho de `FeePayer` em `functions/src/tournament-fees.ts`: `organizador`
/// (desconto no repasse; o atleta paga só o preço), `atleta` (preço + taxa) ou
/// `dividido` (metade da taxa por cima do preço).
enum TournamentServiceFeePayer { organizer, athlete, split }

/// Regra da taxa visível ao atleta no checkout (`getTournamentServiceFee`).
///
/// É só prévia: a cobrança refaz a conta no servidor e devolve a parte do
/// atleta em `serviceFeeReais`. Com o organizador pagando a regra vem zerada.
class TournamentServiceFeeRule {
  const TournamentServiceFeeRule({
    required this.percent,
    required this.floorReais,
    required this.payer,
  });

  /// Sem taxa para o atleta — o organizador paga (o caso de sempre).
  static const none = TournamentServiceFeeRule(
    percent: 0,
    floorReais: 0,
    payer: TournamentServiceFeePayer.organizer,
  );

  final double percent;
  final double floorReais;
  final TournamentServiceFeePayer payer;

  /// Lê a resposta da callable. Qualquer coisa fora do contrato vale como
  /// sem taxa: melhor não prever do que prever errado.
  factory TournamentServiceFeeRule.fromMap(Object? data) {
    if (data is! Map) return none;
    final payer = parseTournamentServiceFeePayer(data['payer']);
    final percent = (data['percent'] as num?)?.toDouble() ?? 0;
    final floorReais = (data['floorReais'] as num?)?.toDouble() ?? 0;
    if (payer == TournamentServiceFeePayer.organizer ||
        !percent.isFinite ||
        percent <= 0 ||
        !floorReais.isFinite ||
        floorReais < 0) {
      return none;
    }
    return TournamentServiceFeeRule(
      percent: percent,
      floorReais: floorReais,
      payer: payer,
    );
  }
}

TournamentServiceFeePayer parseTournamentServiceFeePayer(Object? raw) {
  switch (raw) {
    case 'atleta':
      return TournamentServiceFeePayer.athlete;
    case 'dividido':
      return TournamentServiceFeePayer.split;
    default:
      return TournamentServiceFeePayer.organizer;
  }
}

/// `Math.round` do JS: meio arredonda para +∞ (o `round` do Dart afasta do
/// zero). Só muda em negativos, mas a conta tem que ser a do servidor.
int _jsRound(double x) {
  final r = x.roundToDouble();
  return (r - x == -0.5 ? r + 1 : r).toInt();
}

double _round2(double x) => _jsRound(x * 100) / 100;

/// Taxa inteira desta cobrança, sobre o PREÇO (nunca sobre o valor já com
/// desconto ou cashback). Espelho de `computePlatformFeeReais`
/// (`functions/src/platform-fees.ts`): % com piso, no máximo o preço menos
/// um centavo.
double tournamentServiceFeeReais(
  double priceReais,
  TournamentServiceFeeRule rule,
) {
  if (!(priceReais > 0) || !(rule.percent > 0)) return 0;
  final pct = _round2(priceReais * rule.percent / 100);
  final withFloor = math.max(rule.floorReais, pct);
  final capped = math.min(_round2(priceReais - 0.01), _round2(withFloor));
  return math.max(0, capped);
}

/// Parte da taxa que o atleta paga por cima do preço: toda (atleta), metade
/// arredondada para baixo (dividido; o centavo ímpar fica com o organizador)
/// ou nada (organizador). Espelho de `athleteFeeReais`
/// (`functions/src/tournament-fees.ts`).
double athleteServiceFeeReais(
  double priceReais,
  TournamentServiceFeeRule rule,
) {
  if (rule.payer == TournamentServiceFeePayer.organizer) return 0;
  final feeCents = _jsRound(tournamentServiceFeeReais(priceReais, rule) * 100);
  final athleteCents = rule.payer == TournamentServiceFeePayer.athlete
      ? feeCents
      : (feeCents / 2).floor();
  return athleteCents / 100;
}

/// [athleteServiceFeeReais] em centavos, para somar às prévias do checkout.
int athleteServiceFeeCents(double priceReais, TournamentServiceFeeRule rule) =>
    _jsRound(athleteServiceFeeReais(priceReais, rule) * 100);
