import 'tournament_discovery_models.dart';
import 'tournament_payment_mode.dart';

/// Prêmio do torneio ou categoria (`prizes[]` no Firestore).
class TournamentPrize {
  const TournamentPrize({
    required this.position,
    required this.value,
    this.label,
  });

  final String position;
  final double value;
  final String? label;
}

/// Torneio com campos completos para a tela de detalhe.
class TournamentDetail {
  const TournamentDetail({
    required this.id,
    required this.name,
    required this.location,
    required this.city,
    required this.dateLabel,
    required this.startDate,
    required this.endDate,
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
    this.locationAddress,
    this.regulationsText,
    this.managerId,
    this.leagueStageOrder,
    this.leagueStageName,
    this.tournamentPrizes = const [],
    this.createdAt,
    this.listingStatusRaw,
    this.sport = '',
    this.paymentMode = TournamentPaymentMode.appPixCard,
  });

  final String id;
  final String name;
  final String location;
  final String city;
  final String dateLabel;
  final DateTime startDate;
  final DateTime? endDate;
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
  final String? imageUrl;
  final List<TournamentCategoryOffer> categoryOffers;
  final String? locationAddress;
  final String? regulationsText;
  final String? managerId;
  final int? leagueStageOrder;
  final String? leagueStageName;
  final List<TournamentPrize> tournamentPrizes;
  final DateTime? createdAt;
  final String? listingStatusRaw;

  /// Esporte do torneio (`tournaments/{id}.sport`, nome do enum:
  /// `beachVolleyball` | `indoorVolleyball` | `footvolley`). Usado para resolver
  /// o nível do atleta por esporte na elegibilidade de categoria.
  final String sport;

  final TournamentPaymentMode paymentMode;

  DiscoveryTournament toDiscovery() {
    return DiscoveryTournament(
      id: id,
      name: name,
      location: location,
      city: city,
      dateLabel: dateLabel,
      startDate: startDate,
      categories: categories,
      format: format,
      priceLabel: priceLabel,
      priceValue: priceValue,
      spotsLeft: spotsLeft,
      spotsTotal: spotsTotal,
      status: status,
      featured: featured,
      enrolledCount: enrolledCount,
      liveMatchesNow: liveMatchesNow,
      offerEndsAt: offerEndsAt,
      leagueId: leagueId,
      leagueStageId: leagueStageId,
      imageUrl: imageUrl,
      categoryOffers: categoryOffers,
      createdAt: createdAt,
    );
  }
}
