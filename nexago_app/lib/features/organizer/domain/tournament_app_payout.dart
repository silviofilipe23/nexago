import 'package:flutter/foundation.dart';

import 'category_ops/category_ops_logic.dart';
import 'category_ops/category_ops_models.dart';
import 'tournament_ops/tournament_ops_logic.dart';

/// Reais (double do Firestore) em centavos, arredondando por lançamento: somar
/// os doubles e arredondar no fim acumula o erro de ponto flutuante.
int _reaisToCents(Object? v) => v is num ? (v * 100).round() : 0;

/// Um crédito do extrato do caixa do torneio
/// (`tournamentWallets/{tournamentId}/ledger`, `type: credit`), gravado pelo
/// webhook Asaas quando o dinheiro de uma inscrição paga pelo app cai no caixa.
///
/// É a fonte do repasse real: a taxa já vem calculada pela cascata do torneio
/// (exceção > comissão do cadastro > padrão) e repartida por "Quem paga". O app
/// não refaz essa conta.
@immutable
class TournamentLedgerCredit {
  const TournamentLedgerCredit({
    required this.registrationId,
    required this.grossCents,
    required this.netCents,
    this.organizerFeeCents = 0,
    this.athleteFeeCents = 0,
    this.gatewayFeeCents = 0,
  });

  final String registrationId;

  /// `grossReais`: o preço da inscrição. A parte da taxa que o atleta pagou
  /// por cima não entra aqui.
  final int grossCents;

  /// `netReais`: o que entrou no caixa (bruto − taxa do organizador − cartão).
  final int netCents;

  /// `platformFeeReais`: a parte da taxa nexaGO descontada do organizador.
  final int organizerFeeCents;

  /// `serviceFeeReais`: a parte da taxa que o atleta pagou ("Quem paga" =
  /// atleta ou dividido). Ausente no lançamento = 0.
  final int athleteFeeCents;

  /// `gatewayFeeReais`: taxa do cartão; PIX é 0.
  final int gatewayFeeCents;

  /// `null` para lançamento que não é crédito. Sem `type` conta como crédito:
  /// o extrato do caixa só tem créditos.
  static TournamentLedgerCredit? fromMap(Map<String, dynamic> data) {
    final type = data['type'];
    if (type is String && type != 'credit') return null;
    final registrationId = data['registrationId'];
    return TournamentLedgerCredit(
      registrationId: registrationId is String ? registrationId.trim() : '',
      grossCents: _reaisToCents(data['grossReais']),
      netCents: _reaisToCents(data['netReais']),
      organizerFeeCents: _reaisToCents(data['platformFeeReais']),
      athleteFeeCents: _reaisToCents(data['serviceFeeReais']),
      gatewayFeeCents: _reaisToCents(data['gatewayFeeReais']),
    );
  }
}

/// Quem pagou a taxa nexaGO nos créditos somados.
enum OrganizerFeePayer { none, organizer, athlete, split }

/// Repasse real das inscrições pagas pelo app, tirado do extrato do caixa.
///
/// Nada aqui é estimativa: o que já caiu no caixa vem do extrato, o "a
/// liberar" vem do caixa (`awaitingSettlementReais`, cartão aprovado ainda
/// sem liquidar), e o que não está em nenhum dos dois aparece pelo valor pago
/// ([outsideCashBoxCents]), sem taxa inventada.
@immutable
class OrganizerAppPayout {
  const OrganizerAppPayout({
    this.creditCount = 0,
    this.creditedGrossCents = 0,
    this.creditedNetCents = 0,
    this.organizerFeeCents = 0,
    this.athleteFeeCents = 0,
    this.gatewayFeeCents = 0,
    this.awaitingSettlementCents = 0,
    this.outsideCashBoxCents = 0,
  });

  final int creditCount;
  final int creditedGrossCents;

  /// Líquido já creditado no caixa (inclui o que já foi sacado).
  final int creditedNetCents;
  final int organizerFeeCents;
  final int athleteFeeCents;
  final int gatewayFeeCents;

  /// Líquido dos cartões aprovados que ainda não caíram no caixa. Só existe no
  /// escopo do torneio: o caixa guarda o total, não a inscrição.
  final int awaitingSettlementCents;

  /// Pago pelo app (pelas inscrições) e ainda sem crédito no extrato.
  final int outsideCashBoxCents;

  int get netTransferCents => creditedNetCents + awaitingSettlementCents;

  OrganizerFeePayer get feePayer {
    final organizer = organizerFeeCents > 0;
    final athlete = athleteFeeCents > 0;
    if (organizer && athlete) return OrganizerFeePayer.split;
    if (athlete) return OrganizerFeePayer.athlete;
    if (organizer) return OrganizerFeePayer.organizer;
    return OrganizerFeePayer.none;
  }
}

OrganizerAppPayout _sumCredits(
  Iterable<TournamentLedgerCredit> credits, {
  required int outsideCashBoxCents,
  int awaitingSettlementCents = 0,
}) {
  var count = 0;
  var gross = 0;
  var net = 0;
  var organizerFee = 0;
  var athleteFee = 0;
  var gatewayFee = 0;
  for (final credit in credits) {
    count++;
    gross += credit.grossCents;
    net += credit.netCents;
    organizerFee += credit.organizerFeeCents;
    athleteFee += credit.athleteFeeCents;
    gatewayFee += credit.gatewayFeeCents;
  }
  return OrganizerAppPayout(
    creditCount: count,
    creditedGrossCents: gross,
    creditedNetCents: net,
    organizerFeeCents: organizerFee,
    athleteFeeCents: athleteFee,
    gatewayFeeCents: gatewayFee,
    awaitingSettlementCents: awaitingSettlementCents,
    outsideCashBoxCents: outsideCashBoxCents,
  );
}

/// Repasse do torneio inteiro: o caixa é o evento, então todo crédito do
/// extrato conta, inclusive o de inscrição removida depois de paga (o dinheiro
/// continua no caixa). [viaAppCents] é o pago pelo app segundo as inscrições;
/// a diferença para o bruto creditado é o que ainda não caiu no caixa — no
/// agregado, porque o resumo do torneio não guarda a inscrição.
OrganizerAppPayout buildTournamentAppPayout({
  required int viaAppCents,
  required List<TournamentLedgerCredit> credits,
  double awaitingSettlementReais = 0,
}) {
  final creditedGross = credits.fold<int>(0, (sum, c) => sum + c.grossCents);
  final awaiting = _reaisToCents(awaitingSettlementReais);
  return _sumCredits(
    credits,
    outsideCashBoxCents: viaAppCents > creditedGross
        ? viaAppCents - creditedGross
        : 0,
    awaitingSettlementCents: awaiting > 0 ? awaiting : 0,
  );
}

/// Repasse de uma categoria: só os créditos das inscrições dela, casados pelo
/// `registrationId`. O que falta cair no caixa é medido inscrição a inscrição
/// (pago pelo app − bruto creditado dela), então a dupla que pagou em duas
/// partes com só uma creditada aparece com a parte que falta.
OrganizerAppPayout buildCategoryAppPayout({
  required List<OrganizerCategoryTeamRow> teams,
  required List<TournamentLedgerCredit> credits,
}) {
  final registrationIds = {for (final t in teams) t.registrationId};
  final scoped = credits
      .where((c) => registrationIds.contains(c.registrationId))
      .toList(growable: false);
  final creditedGrossByRegistration = <String, int>{};
  for (final credit in scoped) {
    creditedGrossByRegistration[credit.registrationId] =
        (creditedGrossByRegistration[credit.registrationId] ?? 0) +
        credit.grossCents;
  }
  var outside = 0;
  for (final team in teams) {
    if (team.status != OrganizerTeamRegistrationStatus.confirmed) continue;
    if (teamPaymentChannel(team) != OrganizerPaymentChannel.viaApp) continue;
    final missing =
        teamCollectedCents(team) -
        (creditedGrossByRegistration[team.registrationId] ?? 0);
    if (missing > 0) outside += missing;
  }
  return _sumCredits(scoped, outsideCashBoxCents: outside);
}

/// Taxa efetiva do organizador sobre o bruto creditado, com no máximo uma
/// casa: o mínimo por inscrição (R$ 1,50 no padrão) faz a taxa real de uma
/// inscrição barata passar da porcentagem da regra.
String _feePercentLabel(int feeCents, int grossCents) {
  if (grossCents <= 0) return '0%';
  final tenths = (feeCents * 1000 / grossCents).round();
  final whole = tenths ~/ 10;
  final fraction = tenths % 10;
  return fraction == 0 ? '$whole%' : '$whole,$fraction%';
}

/// Selo do card "Pelo app". Sem crédito no caixa não há taxa real para
/// mostrar, então o selo não arrisca número.
String appFeeBadgeLabel(OrganizerAppPayout? payout) {
  if (payout == null || payout.creditCount == 0) return 'TAXA NEXAGO';
  return switch (payout.feePayer) {
    OrganizerFeePayer.organizer =>
      '${_feePercentLabel(payout.organizerFeeCents, payout.creditedGrossCents)} TAXA',
    OrganizerFeePayer.athlete => 'TAXA PAGA PELO ATLETA',
    OrganizerFeePayer.split => 'TAXA DIVIDIDA',
    OrganizerFeePayer.none => 'SEM TAXA',
  };
}

/// Linhas do card "Pelo app" do Financeiro do torneio, abaixo do repasse.
List<String> tournamentAppPayoutDetails(OrganizerAppPayout payout) {
  return [
    if (payout.awaitingSettlementCents > 0)
      '${formatOrganizerMoneyDetail(payout.creditedNetCents)} no caixa · '
          '${formatOrganizerMoneyDetail(payout.awaitingSettlementCents)} a liberar',
    if (payout.feePayer == OrganizerFeePayer.athlete)
      'A taxa nexaGO foi paga pelo atleta, por cima da inscrição',
    if (payout.feePayer == OrganizerFeePayer.split)
      'Taxa nexaGO dividida: '
          '${formatOrganizerMoneyDetail(payout.organizerFeeCents)} sua, '
          '${formatOrganizerMoneyDetail(payout.athleteFeeCents)} do atleta',
    if (payout.gatewayFeeCents > 0)
      'Taxa do cartão de '
          '${formatOrganizerMoneyDetail(payout.gatewayFeeCents)} já descontada',
    if (payout.outsideCashBoxCents > 0)
      '${formatOrganizerMoneyDetail(payout.outsideCashBoxCents)} pagos pelo '
          'app ainda não caíram no caixa'
          '${payout.awaitingSettlementCents > 0 ? ', cartões a liberar incluídos' : ''}',
  ];
}

/// Linhas do card de repasse da aba Pagamentos da categoria. Aqui o repasse é
/// só o que já está no caixa: o "a liberar" é do caixa inteiro, não dá para
/// saber quanto dele é desta categoria.
List<String> categoryAppPayoutDetails(OrganizerAppPayout payout) {
  final gateway = payout.gatewayFeeCents > 0
      ? ' · cartão ${formatOrganizerMoneyDetail(payout.gatewayFeeCents)}'
      : '';
  final fee = payout.creditCount == 0
      ? 'Nada desta categoria caiu no caixa ainda'
      : switch (payout.feePayer) {
          OrganizerFeePayer.organizer =>
            'Já no caixa · ${_feePercentLabel(payout.organizerFeeCents, payout.creditedGrossCents)} '
                'de taxa nexaGO$gateway',
          OrganizerFeePayer.athlete =>
            'Já no caixa · taxa nexaGO paga pelo atleta$gateway',
          OrganizerFeePayer.split =>
            'Já no caixa · taxa nexaGO dividida com o atleta$gateway',
          OrganizerFeePayer.none => 'Já no caixa · sem taxa nexaGO$gateway',
        };
  return [
    fee,
    if (payout.outsideCashBoxCents > 0)
      '${formatOrganizerMoneyDetail(payout.outsideCashBoxCents)} pagos pelo '
          'app ainda não caíram no caixa (no cartão, cerca de 32 dias após a '
          'aprovação)',
  ];
}
