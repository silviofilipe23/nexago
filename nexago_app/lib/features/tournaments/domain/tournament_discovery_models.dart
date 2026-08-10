/// Modelos de descoberta de ligas e torneios (paridade com athlete web).
import 'league_ranking_models.dart';
import 'tournament_payment_mode.dart';
import 'tournament_uniform_selection.dart';

enum TournamentGenderCat { m, f, mix }

enum TournamentFormat { dupla, individual }

enum TournamentListingStatus {
  scheduled,
  open,
  bracketsReady,
  almostFull,
  live,
  completed,
  ended,
}

class DiscoveryLeague {
  const DiscoveryLeague({
    required this.id,
    required this.name,
    required this.stages,
    this.seasonLabel,
    this.city,
    this.state,
    this.organizationName,
    this.description,
    this.coverUrl,
    this.listingStatus,
    this.seasonStartAt,
    this.seasonEndAt,
    this.categories = const [],
    this.countingStagesMode = LeaguePointsCountingMode.best4Of6,
    this.plannedStagesCount,
    this.grandFinalEnabled = false,
    this.grandFinalSpots = 16,
  });

  final String id;
  final String name;
  final String? seasonLabel;
  final String? city;
  final String? state;
  final String? organizationName;
  final String? description;
  final List<DiscoveryLeagueStage> stages;
  final String? coverUrl;
  final String? listingStatus;
  final DateTime? seasonStartAt;
  final DateTime? seasonEndAt;
  final List<DiscoveryLeagueCategory> categories;
  final LeaguePointsCountingMode countingStagesMode;
  final int? plannedStagesCount;
  final bool grandFinalEnabled;
  final int grandFinalSpots;

  int get totalStagesCount => plannedStagesCount ?? stages.length;
}

class DiscoveryLeagueStage {
  const DiscoveryLeagueStage({
    required this.id,
    required this.name,
    required this.order,
    required this.tournamentIds,
    this.dateLabel,
  });

  final String id;
  final String name;
  final int order;
  final String? dateLabel;
  final List<String> tournamentIds;
}

class DiscoveryTournament {
  const DiscoveryTournament({
    required this.id,
    required this.name,
    required this.location,
    required this.city,
    required this.dateLabel,
    required this.startDate,
    required this.categories,
    required this.format,
    required this.priceLabel,
    required this.priceValue,
    required this.spotsLeft,
    required this.spotsTotal,
    required this.status,
    required this.featured,
    required this.enrolledCount,
    required this.liveMatchesNow,
    this.offerEndsAt,
    this.leagueId,
    this.leagueStageId,
    this.imageUrl,
    this.categoryOffers = const [],
    this.createdAt,
  });

  final String id;
  final String name;
  final String location;
  final String city;
  final String dateLabel;
  final DateTime startDate;
  final List<TournamentGenderCat> categories;
  final TournamentFormat format;
  final String priceLabel;
  final double priceValue;
  final int spotsLeft;
  final int spotsTotal;
  final TournamentListingStatus status;
  final bool featured;
  final int enrolledCount;
  final int liveMatchesNow;
  final DateTime? offerEndsAt;
  final String? leagueId;
  final String? leagueStageId;

  /// Capa do torneio (`coverUrl`, `imageUrl`, etc. no Firestore).
  final String? imageUrl;

  /// Categorias para inscrição (espelha Firestore `categories[]`).
  final List<TournamentCategoryOffer> categoryOffers;

  /// Data de criação do documento (`createdAt` no Firestore).
  final DateTime? createdAt;
}

class TournamentCategoryOffer {
  const TournamentCategoryOffer({
    required this.id,
    required this.name,
    required this.entryFee,
    this.spotsLeft = 0,
    this.maxTeams = 0,
    this.spotsTotal = 0,
    this.level = '',
    this.ageBand = '',
    this.ageRestrictionMode = '',
    this.ageMinYears,
    this.ageMaxYears,
    this.ageReference = '',
    this.genderType = '',
    this.bracketFormat = '',
    this.registrationClosed = false,
    this.isCompleted = false,
    this.prizes = const [],
    this.uniformType,
    this.uniformNameOnShirt = false,
    this.uniformNumberOnShirt = false,
    this.uniformSizeOptionsTop = const [],
    this.uniformSizeOptionsShorts = const [],
    this.waitlistEnabled = true,
    this.qualifiersPerGroup = 2,
    this.teamSize,
    this.genderFree = false,
    this.genderCompositionMen,
    this.genderCompositionWomen,
  });

  /// Id da categoria no Firestore (`categories[].id`); legado usa `categoryName`.
  final String id;
  final String name;
  final double entryFee;
  final int spotsLeft;
  /// Capacidade máxima da categoria (duplas ou vagas individuais).
  final int maxTeams;
  /// Legado / agregação; alinhado a [maxTeams] quando o Firestore envia `maxTeams`.
  final int spotsTotal;
  final String level;

  /// Restrição etária (espelha `categories[].ageRestriction`/`ageBand`).
  final String ageBand;
  final String ageRestrictionMode; // 'none'|'min'|'max'|'range' (vazio = derivar)
  final int? ageMinYears;
  final int? ageMaxYears;
  final String ageReference; // 'tournamentStart'|'yearEnd'|'registration'

  final String genderType;
  final String bracketFormat;
  final bool registrationClosed;
  final bool isCompleted;
  final List<TournamentCategoryPrize> prizes;

  /// `none` | `top_only` | `full` (backoffice UniformType).
  final String? uniformType;
  final bool uniformNameOnShirt;
  final bool uniformNumberOnShirt;
  final List<String> uniformSizeOptionsTop;
  final List<String> uniformSizeOptionsShorts;
  /// Herdado do torneio (`waitlistEnabled` na raiz do documento).
  final bool waitlistEnabled;

  /// Duplas que avançam por grupo (`categories[].qualifiersPerGroup`).
  final int qualifiersPerGroup;

  /// Categoria de EQUIPE nomeada (trio/quarteto/quinteto): 3–5.
  /// `null` = dupla clássica. Gravado pelo portal do organizador.
  final int? teamSize;

  /// Equipe sem restrição de gênero (`genderMode: 'free'`) — o `genderType`
  /// fica `mixed` só para exibição legada.
  final bool genderFree;

  /// Composição exata da equipe mista (homens + mulheres = [teamSize]).
  final int? genderCompositionMen;
  final int? genderCompositionWomen;

  /// Categoria de equipe nomeada (trio+) — dupla segue o fluxo clássico.
  bool get isTeamCategory => teamSize != null;

  /// Elenco por inscrição: 2 na dupla, 3–5 na equipe.
  int get rosterSize => teamSize ?? 2;

  /// "Dupla" / "Trio" / "Quarteto" / "Quinteto" — pill de formato.
  String get formatLabel => switch (teamSize) {
    3 => 'Trio',
    4 => 'Quarteto',
    5 => 'Quinteto',
    _ => 'Dupla',
  };

  /// Unidade das vagas ("duplas"/"equipes").
  String get unitLabel => isTeamCategory ? 'equipes' : 'duplas';
  String get unitSingular => isTeamCategory ? 'equipe' : 'dupla';

  /// Detalhe de gênero da equipe: "Livre" ou "2H + 2M" (misto exato).
  String? get genderDetail {
    if (!isTeamCategory) return null;
    if (genderFree) return 'Livre';
    final men = genderCompositionMen;
    final women = genderCompositionWomen;
    if (men == null || women == null || men == 0 || women == 0) return null;
    return '${men}H + ${women}M';
  }
}

class TournamentCategoryPrize {
  const TournamentCategoryPrize({
    required this.position,
    required this.value,
    this.label,
  });

  final String position;
  final double value;
  final String? label;
}

class TournamentDiscoveryLiveStats {
  const TournamentDiscoveryLiveStats({
    required this.activeTournaments,
    required this.matchesLiveNow,
    required this.openRegistrations,
  });

  final int activeTournaments;
  final int matchesLiveNow;
  final int openRegistrations;
}

enum TournamentDiscoveryCategoryFilter { all, m, f, mix }

class MyTournamentRegistration {
  const MyTournamentRegistration({
    required this.registrationId,
    required this.tournamentId,
    required this.tournamentName,
    required this.dateLabel,
    required this.statusLabel,
    required this.isPaid,
    required this.categoryId,
    this.startDate,
    this.endDate,
    this.listingStatus,
    this.locationLine,
    this.listingStatusRaw,
    this.teamId,
    this.isWaitlist = false,
    this.athleteHasReserved = false,
    this.partnerPending = false,
    this.hasPartialPayment = false,
    this.participantUids = const [],
    this.player1Id,
    this.teamSize,
    this.teamName,
    this.uniformPlayer1,
    this.uniformPlayer2,
    this.uniformByUid = const {},
    this.category,
    this.paymentMode = TournamentPaymentMode.appPixCard,
    this.tournamentIsCancelled = false,
  });

  final String registrationId;
  final String tournamentId;
  final String tournamentName;
  final String dateLabel;
  final String statusLabel;
  final bool isPaid;
  final String categoryId;
  final DateTime? startDate;
  final DateTime? endDate;
  final TournamentListingStatus? listingStatus;
  final String? locationLine;
  final String? listingStatusRaw;
  final String? teamId;
  final bool isWaitlist;
  final bool athleteHasReserved;

  /// Inscrição solo com vaga de parceiro em aberto (sem player2 confirmado).
  final bool partnerPending;

  /// Alguém da dupla já pagou uma parcela (`sharePaidUids` não vazio) —
  /// cancelamento pelo atleta fica bloqueado (exigiria estorno).
  final bool hasPartialPayment;

  /// Elenco da inscrição. Pode vir vazio em doc legado (`registerSolo` antigo
  /// grava só `player1Id`; o convidado entra por `arrayUnion` depois).
  final List<String> participantUids;
  final String? player1Id;

  /// Categoria de equipe nomeada (trio+): 3–5. `null` = dupla clássica.
  final int? teamSize;
  final String? teamName;

  /// Uniformes por slot (dupla) ou por uid (equipe trio+) — mesmo formato do
  /// doc da inscrição. `null`/vazio = atleta ainda não escolheu.
  final TournamentUniformSelection? uniformPlayer1;
  final TournamentUniformSelection? uniformPlayer2;
  final Map<String, TournamentUniformSelection> uniformByUid;

  /// Categoria resolvida no torneio (`categories[].id`, legado por nome) —
  /// `null` quando o torneio não resolve ou a categoria sumiu do doc.
  final TournamentCategoryOffer? category;
  final TournamentPaymentMode paymentMode;

  /// Torneio cancelado pelo organizador (`listingStatus` bruto).
  final bool tournamentIsCancelled;
}
