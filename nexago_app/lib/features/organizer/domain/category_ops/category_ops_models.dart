import 'package:flutter/foundation.dart';

enum OrganizerTeamRegistrationStatus { confirmed, pending, waitlist }

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

  String get initials {
    final parts = name.trim().split(RegExp(r'\s+'));
    if (parts.isEmpty || parts.first.isEmpty) return '?';
    if (parts.length == 1) {
      return parts.first.substring(0, 1).toUpperCase();
    }
    return '${parts.first[0]}${parts.last[0]}'.toUpperCase();
  }
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

  bool get hasCancellationRequest => cancellationRequestReason != null;

  List<String> get _participantUids => [
        if (player1.uid.trim().isNotEmpty) player1.uid,
        if (player2.uid.trim().isNotEmpty) player2.uid,
      ];

  /// Todos os atletas da inscrição aceitaram o termo LGPD.
  bool get lgpdAcceptedByAll {
    final uids = _participantUids;
    return uids.isNotEmpty && uids.every(lgpdAcceptedUids.contains);
  }

  /// Só parte da dupla aceitou o termo LGPD.
  bool get lgpdPartiallyAccepted =>
      !lgpdAcceptedByAll && _participantUids.any(lgpdAcceptedUids.contains);

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
