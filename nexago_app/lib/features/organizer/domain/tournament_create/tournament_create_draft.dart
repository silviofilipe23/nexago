import 'package:flutter/foundation.dart';

enum TournamentSport { beachVolleyball, indoorVolleyball, footvolley }

enum TournamentBracketSystem {
  groupsThenKnockout,
  singleElimination,
  roundRobin,
  groupsWithRepechage,
  doubleElimination,
}

enum TournamentBestOf { singleSet, bestOf3, bestOf5 }

enum TournamentPaymentMode { appPixCard, directWithOrganizer }

enum TournamentVisibility { publicListing, linkOnly }

enum TournamentCategoryGender { male, female, mixed }

/// `team` é legado (nunca foi oferecido na UI); os formatos de equipe reais
/// são `trio`/`quarteto`/`quinteto` — categorias de EQUIPE nomeada, criadas
/// pelo portal do organizador. O app precisa conhecê-los para não corromper
/// o doc ao reeditar (parse desconhecido caía em `dupla` e regravava).
enum TournamentCategoryDispute { individual, dupla, trio, quarteto, quinteto, team }

/// Tamanho do elenco por disputa (dupla=2, trio=3…; `team` legado conta como 2).
int disputeTeamSize(TournamentCategoryDispute dispute) {
  switch (dispute) {
    case TournamentCategoryDispute.individual:
      return 1;
    case TournamentCategoryDispute.trio:
      return 3;
    case TournamentCategoryDispute.quarteto:
      return 4;
    case TournamentCategoryDispute.quinteto:
      return 5;
    case TournamentCategoryDispute.dupla:
    case TournamentCategoryDispute.team:
      return 2;
  }
}

/// Categoria de equipe nomeada (trio+) — dupla segue o fluxo clássico.
bool isTeamDispute(TournamentCategoryDispute dispute) =>
    disputeTeamSize(dispute) >= 3;

enum TournamentAgeBand {
  open,
  sub13,
  sub15,
  sub17,
  sub19,
  sub21,
  sub23,
  plus30,
  plus35,
  plus40,
  plus45,
  plus50,
  plus55,
  plus60,
}

/// Nível da categoria. `beginner`/`intermediate` são a escada legada de 3
/// níveis (mantidos para parse de categorias antigas e para esportes sem
/// escada própria); `iniciante1..avancado2` + `open` formam a escada de
/// 7 níveis do vôlei (ranks unificados com o perfil do atleta).
enum TournamentSkillLevel {
  beginner,
  intermediate,
  open,
  iniciante1,
  iniciante2,
  intermediario1,
  intermediario2,
  avancado1,
  avancado2,
}

/// Referência usada para calcular a idade do atleta nas restrições etárias.
enum TournamentAgeReference { tournamentStart, yearEnd, registration }

/// Prêmio de uma colocação dentro de uma categoria.
@immutable
class TournamentCategoryPrizeDraft {
  const TournamentCategoryPrizeDraft({
    required this.position,
    required this.valueCents,
    this.label,
  });

  final String position;
  final int valueCents;
  final String? label;

  TournamentCategoryPrizeDraft copyWith({
    String? position,
    int? valueCents,
    String? label,
  }) {
    return TournamentCategoryPrizeDraft(
      position: position ?? this.position,
      valueCents: valueCents ?? this.valueCents,
      label: label ?? this.label,
    );
  }
}

/// Categoria configurada no wizard (B3 / B3.1).
@immutable
class TournamentCategoryDraft {
  const TournamentCategoryDraft({
    required this.id,
    this.name = '',
    this.gender = TournamentCategoryGender.male,
    this.dispute = TournamentCategoryDispute.dupla,
    this.ageBand = TournamentAgeBand.open,
    this.skillLevel = TournamentSkillLevel.open,
    this.ageReference = TournamentAgeReference.tournamentStart,
    this.ageCustomEnabled = false,
    this.ageMinYears,
    this.ageMaxYears,
    this.spots = 16,
    this.useDefaultPrice = true,
    this.priceCents = 18000,
    this.bracketSystem = TournamentBracketSystem.groupsThenKnockout,
    this.teamsPerGroup = 4,
    this.qualifiersPerGroup = 2,
    this.bestOf = TournamentBestOf.bestOf3,
    this.finalBestOf5 = true,
    this.maxRegistrationsPerAthlete = 2,
    this.prizes = const [],
    this.genderFree = false,
    this.menCount,
    this.womenCount,
    this.minLevel = '',
  });

  final String id;
  final String name;
  final TournamentCategoryGender gender;
  final TournamentCategoryDispute dispute;
  final TournamentAgeBand ageBand;
  final TournamentSkillLevel skillLevel;

  /// Restrição etária configurável. Quando [ageCustomEnabled] é falso, a
  /// restrição deriva de [ageBand] (Sub-N→idade máx N, +N→idade mín N, Livre→
  /// nenhuma). Quando true, usa [ageMinYears]/[ageMaxYears] (modo inferido:
  /// só mín, só máx, ou faixa). [ageReference] vale em ambos os casos.
  final TournamentAgeReference ageReference;
  final bool ageCustomEnabled;
  final int? ageMinYears;
  final int? ageMaxYears;

  final int spots;
  final bool useDefaultPrice;
  final int priceCents;
  final TournamentBracketSystem bracketSystem;
  final int teamsPerGroup;
  final int qualifiersPerGroup;
  final TournamentBestOf bestOf;
  final bool finalBestOf5;
  final int maxRegistrationsPerAthlete;
  final List<TournamentCategoryPrizeDraft> prizes;

  /// Categoria de EQUIPE (trio+) sem restrição de gênero (`genderMode: 'free'`).
  /// O editor do app não oferece esses campos — eles existem para o roundtrip
  /// de edição preservar o que o portal gravou.
  final bool genderFree;

  /// Composição exata da equipe mista (homens + mulheres = tamanho da equipe).
  final int? menCount;
  final int? womenCount;

  /// Faixa de nível (label, ex.: "Avançado 1") gravada pelo portal web em
  /// `minLevel` — piso da categoria (`''` = sem piso). O editor do app não
  /// oferece esse campo — ele existe só para o roundtrip de edição preservar
  /// o que o portal gravou (mesmo contrato de [genderFree]/[menCount]).
  final String minLevel;

  TournamentCategoryDraft copyWith({
    String? id,
    String? name,
    TournamentCategoryGender? gender,
    TournamentCategoryDispute? dispute,
    TournamentAgeBand? ageBand,
    TournamentSkillLevel? skillLevel,
    TournamentAgeReference? ageReference,
    bool? ageCustomEnabled,
    int? ageMinYears,
    int? ageMaxYears,
    bool clearAgeMinYears = false,
    bool clearAgeMaxYears = false,
    int? spots,
    bool? useDefaultPrice,
    int? priceCents,
    TournamentBracketSystem? bracketSystem,
    int? teamsPerGroup,
    int? qualifiersPerGroup,
    TournamentBestOf? bestOf,
    bool? finalBestOf5,
    int? maxRegistrationsPerAthlete,
    List<TournamentCategoryPrizeDraft>? prizes,
    bool? genderFree,
    int? menCount,
    int? womenCount,
    String? minLevel,
  }) {
    return TournamentCategoryDraft(
      id: id ?? this.id,
      name: name ?? this.name,
      gender: gender ?? this.gender,
      dispute: dispute ?? this.dispute,
      ageBand: ageBand ?? this.ageBand,
      skillLevel: skillLevel ?? this.skillLevel,
      ageReference: ageReference ?? this.ageReference,
      ageCustomEnabled: ageCustomEnabled ?? this.ageCustomEnabled,
      ageMinYears: clearAgeMinYears ? null : (ageMinYears ?? this.ageMinYears),
      ageMaxYears: clearAgeMaxYears ? null : (ageMaxYears ?? this.ageMaxYears),
      spots: spots ?? this.spots,
      useDefaultPrice: useDefaultPrice ?? this.useDefaultPrice,
      priceCents: priceCents ?? this.priceCents,
      bracketSystem: bracketSystem ?? this.bracketSystem,
      teamsPerGroup: teamsPerGroup ?? this.teamsPerGroup,
      qualifiersPerGroup: qualifiersPerGroup ?? this.qualifiersPerGroup,
      bestOf: bestOf ?? this.bestOf,
      finalBestOf5: finalBestOf5 ?? this.finalBestOf5,
      maxRegistrationsPerAthlete:
          maxRegistrationsPerAthlete ?? this.maxRegistrationsPerAthlete,
      prizes: prizes ?? this.prizes,
      genderFree: genderFree ?? this.genderFree,
      menCount: menCount ?? this.menCount,
      womenCount: womenCount ?? this.womenCount,
      minLevel: minLevel ?? this.minLevel,
    );
  }
}

/// Estado completo do wizard de criação de torneio (7 passos).
@immutable
class TournamentCreateDraft {
  const TournamentCreateDraft({
    this.tournamentId,
    this.sport = TournamentSport.beachVolleyball,
    this.name = '',
    this.coverImagePath,
    this.coverImageUrl,
    this.description = '',
    this.arenaId,
    this.locationName = '',
    this.locationAddress = '',
    this.city = '',
    this.state = '',
    this.startAt,
    this.endAt,
    this.firstMatchAt,
    this.courtsCount = 4,
    this.categories = const [],
    this.defaultPriceCents = 22000,
    this.registrationOpensAt,
    this.registrationClosesAt,
    this.paymentMode = TournamentPaymentMode.appPixCard,
    this.organizerPixKey = '',
    this.organizerPixKeyType = '',
    this.organizerPixRecipientName = '',
    this.organizerPixCity = '',
    this.waitlistEnabled = true,
    this.inviteConfirmEnabled = false,
    this.cashPrizesEnabled = true,
    this.regulationPdfPath,
    this.regulationNotes = '',
    this.uniformRequired = true,
    this.uniformNumberOnShirt = true,
    this.uniformNameOnShirt = true,
    this.rankingEnabled = true,
    this.rankingTableId = 'nexago_standalone',
    this.visibility = TournamentVisibility.publicListing,
  });

  final String? tournamentId;
  final TournamentSport sport;
  final String name;
  final String? coverImagePath;
  final String? coverImageUrl;
  final String description;
  final String? arenaId;
  final String locationName;
  final String locationAddress;
  final String city;
  final String state;
  final DateTime? startAt;
  final DateTime? endAt;
  final DateTime? firstMatchAt;
  final int courtsCount;
  final List<TournamentCategoryDraft> categories;
  final int defaultPriceCents;
  final DateTime? registrationOpensAt;
  final DateTime? registrationClosesAt;
  final TournamentPaymentMode paymentMode;

  /// Dados PIX do organizador (usados quando [paymentMode] é directWithOrganizer).
  final String organizerPixKey;
  final String organizerPixKeyType;
  final String organizerPixRecipientName;
  final String organizerPixCity;

  final bool waitlistEnabled;
  final bool inviteConfirmEnabled;
  final bool cashPrizesEnabled;
  final String? regulationPdfPath;
  final String regulationNotes;
  final bool uniformRequired;
  final bool uniformNumberOnShirt;
  final bool uniformNameOnShirt;
  final bool rankingEnabled;
  final String rankingTableId;
  final TournamentVisibility visibility;

  int get totalSpots => categories.fold<int>(0, (sum, c) => sum + c.spots);

  int get totalPrizeCents => categories.fold<int>(
    0,
    (sum, c) => sum + c.prizes.fold<int>(0, (pSum, p) => pSum + p.valueCents),
  );

  TournamentCreateDraft copyWith({
    String? tournamentId,
    bool clearTournamentId = false,
    TournamentSport? sport,
    String? name,
    String? coverImagePath,
    bool clearCoverImagePath = false,
    String? coverImageUrl,
    bool clearCoverImageUrl = false,
    String? description,
    String? arenaId,
    bool clearArenaId = false,
    String? locationName,
    String? locationAddress,
    String? city,
    String? state,
    DateTime? startAt,
    DateTime? endAt,
    DateTime? firstMatchAt,
    int? courtsCount,
    List<TournamentCategoryDraft>? categories,
    int? defaultPriceCents,
    DateTime? registrationOpensAt,
    DateTime? registrationClosesAt,
    TournamentPaymentMode? paymentMode,
    String? organizerPixKey,
    String? organizerPixKeyType,
    String? organizerPixRecipientName,
    String? organizerPixCity,
    bool? waitlistEnabled,
    bool? inviteConfirmEnabled,
    bool? cashPrizesEnabled,
    String? regulationPdfPath,
    bool clearRegulationPdfPath = false,
    String? regulationNotes,
    bool? uniformRequired,
    bool? uniformNumberOnShirt,
    bool? uniformNameOnShirt,
    bool? rankingEnabled,
    String? rankingTableId,
    TournamentVisibility? visibility,
  }) {
    return TournamentCreateDraft(
      tournamentId: clearTournamentId
          ? null
          : (tournamentId ?? this.tournamentId),
      sport: sport ?? this.sport,
      name: name ?? this.name,
      coverImagePath: clearCoverImagePath
          ? null
          : (coverImagePath ?? this.coverImagePath),
      coverImageUrl: clearCoverImageUrl
          ? null
          : (coverImageUrl ?? this.coverImageUrl),
      description: description ?? this.description,
      arenaId: clearArenaId ? null : (arenaId ?? this.arenaId),
      locationName: locationName ?? this.locationName,
      locationAddress: locationAddress ?? this.locationAddress,
      city: city ?? this.city,
      state: state ?? this.state,
      startAt: startAt ?? this.startAt,
      endAt: endAt ?? this.endAt,
      firstMatchAt: firstMatchAt ?? this.firstMatchAt,
      courtsCount: courtsCount ?? this.courtsCount,
      categories: categories ?? this.categories,
      defaultPriceCents: defaultPriceCents ?? this.defaultPriceCents,
      registrationOpensAt: registrationOpensAt ?? this.registrationOpensAt,
      registrationClosesAt: registrationClosesAt ?? this.registrationClosesAt,
      paymentMode: paymentMode ?? this.paymentMode,
      organizerPixKey: organizerPixKey ?? this.organizerPixKey,
      organizerPixKeyType: organizerPixKeyType ?? this.organizerPixKeyType,
      organizerPixRecipientName:
          organizerPixRecipientName ?? this.organizerPixRecipientName,
      organizerPixCity: organizerPixCity ?? this.organizerPixCity,
      waitlistEnabled: waitlistEnabled ?? this.waitlistEnabled,
      inviteConfirmEnabled: inviteConfirmEnabled ?? this.inviteConfirmEnabled,
      cashPrizesEnabled: cashPrizesEnabled ?? this.cashPrizesEnabled,
      regulationPdfPath: clearRegulationPdfPath
          ? null
          : (regulationPdfPath ?? this.regulationPdfPath),
      regulationNotes: regulationNotes ?? this.regulationNotes,
      uniformRequired: uniformRequired ?? this.uniformRequired,
      uniformNumberOnShirt: uniformNumberOnShirt ?? this.uniformNumberOnShirt,
      uniformNameOnShirt: uniformNameOnShirt ?? this.uniformNameOnShirt,
      rankingEnabled: rankingEnabled ?? this.rankingEnabled,
      rankingTableId: rankingTableId ?? this.rankingTableId,
      visibility: visibility ?? this.visibility,
    );
  }
}

enum TournamentCreateStep {
  identity,
  location,
  categories,
  registration,
  prizes,
  rules,
  review,
}

extension TournamentCreateStepX on TournamentCreateStep {
  int get index => TournamentCreateStep.values.indexOf(this);
  int get number => index + 1;
  static int get total => TournamentCreateStep.values.length;
}
