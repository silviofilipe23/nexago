import 'package:flutter/foundation.dart';
import 'package:nexago_app/core/profiles/app_user_profile.dart';

enum OrganizerTeamRegistrationStatus { confirmed, pending, waitlist }

/// Pagamento de UM atleta da inscrição, na visão do organizador.
///
/// A dupla/equipe paga em partes (`sharePaidUids`): o organizador confirma
/// atleta por atleta e a inscrição só fecha (`isPaid`) quando todos estão lá.
enum OrganizerAthletePaymentState {
  /// Ninguém deu baixa na parte deste atleta.
  pending,

  /// O próprio atleta declarou ter pago ("Já paguei") — falta a conferência.
  declared,

  /// O organizador confirmou manualmente. Só essa confirmação pode ser
  /// desfeita por atleta; a declaração do atleta, não.
  organizerConfirmed,
}

enum OrganizerCategoryTeamFilter { all, seeds, pending, waitlist }

enum OrganizerTeamSort { registrationOrder, ranking }

@immutable
class OrganizerCategoryPlayerInfo {
  const OrganizerCategoryPlayerInfo({
    required this.uid,
    this.name = '',
    this.city = '',
    this.state = '',
    this.rankingPoints = 0,
    this.phoneNumber = '',
    this.profilePhotoUrl = '',
  });

  final String uid;
  final String name;
  final String city;
  final String state;
  final int rankingPoints;
  final String phoneNumber;
  final String profilePhotoUrl;

  String get initials => initialsFromDisplayName(name);
}

@immutable
class OrganizerCategoryTeamRow {
  const OrganizerCategoryTeamRow({
    required this.registrationId,
    required this.teamId,
    required this.player1,
    required this.player2,
    this.status = OrganizerTeamRegistrationStatus.pending,
    this.seedRank,
    this.paidAmountCents = 0,
    this.expectedAmountCents = 0,
    this.registeredAt,
    this.paymentMethod = '',
    this.partnerPending = false,
    this.lgpdAcceptedUids = const [],
    this.cancellationRequestReason,
    this.sharePaidUids = const [],
    this.organizerConfirmedShareUids = const [],
    this.declaredPaidAt,
    this.paymentVerifiedByOrganizer = false,
  });

  final String registrationId;
  final String teamId;
  final OrganizerCategoryPlayerInfo player1;
  final OrganizerCategoryPlayerInfo player2;
  final OrganizerTeamRegistrationStatus status;
  final int? seedRank;
  final int paidAmountCents;
  final int expectedAmountCents;
  final DateTime? registeredAt;
  final String paymentMethod;
  /// Solo pagou o total e ainda aguarda parceiro — não entra na chave.
  final bool partnerPending;

  /// Uids que aceitaram o termo de uso de imagem/LGPD na inscrição
  /// (inscrições antigas, de antes do termo existir no fluxo: vazio).
  final List<String> lgpdAcceptedUids;

  /// Motivo do pedido de cancelamento PENDENTE escrito pelo atleta — `null`
  /// quando não há pedido aberto. A plataforma não estorna: aprovar só libera
  /// a vaga, a devolução é combinada fora dela.
  final String? cancellationRequestReason;

  /// Atletas que já quitaram a própria parte da inscrição. No pagamento pelo
  /// app é dinheiro recebido; no modo direto é a declaração do atleta OU a
  /// baixa manual deste atleta pelo organizador.
  final List<String> sharePaidUids;

  /// Subconjunto de [sharePaidUids] cuja parte o organizador confirmou na mão —
  /// só ela pode ser desfeita por atleta.
  final List<String> organizerConfirmedShareUids;

  /// Quando a inscrição inteira declarou o pagamento direto ("Já paguei").
  /// `null` em inscrição paga pelo app e nas diretas anteriores a este fluxo —
  /// essas NUNCA entram na fila de conferência (senão o organizador herdaria
  /// uma conferência retroativa que ninguém vai fazer).
  final DateTime? declaredPaidAt;

  /// O organizador já deu baixa na declaração (`paymentVerifiedByOrganizer`).
  final bool paymentVerifiedByOrganizer;

  bool get hasCancellationRequest => cancellationRequestReason != null;

  /// Copia mudando só o que foi passado. Existe para quem precisa alterar UM
  /// campo (`applySeedOrder` muda o `seedRank`) não reconstruir a linha campo a
  /// campo — o que já derrubou `partnerPending`, `lgpdAcceptedUids` e o pedido
  /// de cancelamento das duplas cabeça de chave.
  OrganizerCategoryTeamRow copyWith({int? seedRank}) {
    return OrganizerCategoryTeamRow(
      registrationId: registrationId,
      teamId: teamId,
      player1: player1,
      player2: player2,
      status: status,
      seedRank: seedRank ?? this.seedRank,
      paidAmountCents: paidAmountCents,
      expectedAmountCents: expectedAmountCents,
      registeredAt: registeredAt,
      paymentMethod: paymentMethod,
      partnerPending: partnerPending,
      lgpdAcceptedUids: lgpdAcceptedUids,
      cancellationRequestReason: cancellationRequestReason,
      sharePaidUids: sharePaidUids,
      organizerConfirmedShareUids: organizerConfirmedShareUids,
      declaredPaidAt: declaredPaidAt,
      paymentVerifiedByOrganizer: paymentVerifiedByOrganizer,
    );
  }

  /// Atletas da inscrição com uid resolvido — solo aguardando parceiro tem um só.
  List<OrganizerCategoryPlayerInfo> get participants => [
        if (player1.uid.trim().isNotEmpty) player1,
        if (player2.uid.trim().isNotEmpty) player2,
      ];

  List<String> get participantUids =>
      participants.map((p) => p.uid).toList(growable: false);

  /// Todos os atletas da inscrição aceitaram o termo LGPD.
  bool get lgpdAcceptedByAll {
    final uids = participantUids;
    return uids.isNotEmpty && uids.every(lgpdAcceptedUids.contains);
  }

  /// Só parte da dupla aceitou o termo LGPD.
  bool get lgpdPartiallyAccepted =>
      !lgpdAcceptedByAll && participantUids.any(lgpdAcceptedUids.contains);

  String get displayName {
    final n1 = player1.name.trim();
    final n2 = player2.name.trim();
    if (n1.isEmpty && n2.isEmpty) return 'Dupla';
    if (n2.isEmpty) return n1;
    return '$n1 / $n2';
  }

  String get subtitle {
    final level = 'Open';
    final city = player1.city.trim().isNotEmpty
        ? player1.city.trim()
        : player2.city.trim();
    final state = player1.state.trim().isNotEmpty
        ? player1.state.trim()
        : player2.state.trim();
    final location = [
      if (city.isNotEmpty) city,
      if (state.isNotEmpty) state,
    ].join(' ');
    final pts = player1.rankingPoints + player2.rankingPoints;
    final parts = <String>[
      level,
      if (location.isNotEmpty) location,
      if (pts > 0) '$pts pts',
    ];
    return parts.join(' · ');
  }
}

enum OrganizerPaymentChannel { viaApp, viaOrganizer }

/// Arrecadação da categoria/torneio separada por canal (app vs direto).
@immutable
class OrganizerPaymentsBreakdown {
  const OrganizerPaymentsBreakdown({
    this.viaAppCents = 0,
    this.viaOrganizerCents = 0,
    this.expectedCents = 0,
    this.pendingCount = 0,
    this.paidCount = 0,
    this.totalSlots = 0,
    this.feeRate = 0.06,
  });

  final int viaAppCents;
  final int viaOrganizerCents;
  final int expectedCents;
  final int pendingCount;
  final int paidCount;
  final int totalSlots;
  final double feeRate;

  int get totalCollectedCents => viaAppCents + viaOrganizerCents;

  /// Compatível com o resumo anterior.
  int get collectedCents => totalCollectedCents;

  int get netTransferCents => (viaAppCents * (1 - feeRate)).round();

  int get outstandingCents =>
      (expectedCents - totalCollectedCents).clamp(0, expectedCents);

  double get progress =>
      expectedCents > 0 ? totalCollectedCents / expectedCents : 0.0;

  OrganizerPaymentsBreakdown operator +(OrganizerPaymentsBreakdown other) {
    return OrganizerPaymentsBreakdown(
      viaAppCents: viaAppCents + other.viaAppCents,
      viaOrganizerCents: viaOrganizerCents + other.viaOrganizerCents,
      expectedCents: expectedCents + other.expectedCents,
      pendingCount: pendingCount + other.pendingCount,
      paidCount: paidCount + other.paidCount,
      totalSlots: totalSlots + other.totalSlots,
      feeRate: feeRate,
    );
  }
}

typedef OrganizerCategoryPaymentsSummary = OrganizerPaymentsBreakdown;

enum CategoryBracketStatus { none, draft, published }

@immutable
class CategoryOpsState {
  const CategoryOpsState({
    this.seeds = const [],
    this.seedByRanking = true,
    this.bracketStatus = CategoryBracketStatus.none,
    this.bracketFormatOverride = '',
    this.winnersAdvantage = true,
    this.phaseBestOf = 'md3',
    this.finalBestOf5 = true,
    this.groupsPreview = const [],
  });

  final List<String> seeds;
  final bool seedByRanking;
  final CategoryBracketStatus bracketStatus;
  final String bracketFormatOverride;
  final bool winnersAdvantage;
  final String phaseBestOf;
  final bool finalBestOf5;
  final List<CategoryGroupPreview> groupsPreview;
}

@immutable
class CategoryGroupPreview {
  const CategoryGroupPreview({required this.id, required this.teamIds});

  final String id;
  final List<String> teamIds;
}
