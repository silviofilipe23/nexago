/// Modelos de descoberta de ligas e torneios (paridade com athlete web).
import 'league_ranking_models.dart';

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
    this.coverUrl,
    this.listingStatus,
    this.seasonStartAt,
    this.seasonEndAt,
    this.categories = const [],
    this.countingStagesMode = LeaguePointsCountingMode.best4Of6,
  });

  final String id;
  final String name;
  final String? seasonLabel;
  final String? city;
  final List<DiscoveryLeagueStage> stages;
  final String? coverUrl;
  final String? listingStatus;
  final DateTime? seasonStartAt;
  final DateTime? seasonEndAt;
  final List<DiscoveryLeagueCategory> categories;
  final LeaguePointsCountingMode countingStagesMode;
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
}
