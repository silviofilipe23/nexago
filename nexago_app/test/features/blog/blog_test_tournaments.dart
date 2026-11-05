import 'package:nexago_app/features/tournaments/domain/tournament_detail_model.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';

/// Torneio de teste para os blocos do blog.
TournamentDetail blogTestTournament({
  String id = 't1',
  TournamentListingStatus status = TournamentListingStatus.open,
  String? listingStatusRaw = 'open',
  DateTime? registrationOpensAt,
  DateTime? registrationClosesAt,
  List<TournamentCategoryOffer> categoryOffers = const [
    TournamentCategoryOffer(
      id: 'c1',
      name: 'Misto',
      entryFee: 100,
      maxTeams: 16,
    ),
    TournamentCategoryOffer(id: 'c2', name: 'Fem', entryFee: 100, maxTeams: 8),
  ],
}) => TournamentDetail(
  id: id,
  name: 'Liga nexaGO · 2ª etapa',
  location: 'Arena Errejota',
  city: 'Goiânia',
  dateLabel: '24 out – 26 out',
  startDate: DateTime(2026, 11, 24),
  endDate: DateTime(2026, 11, 26),
  categories: const [],
  format: TournamentFormat.dupla,
  priceLabel: 'R\$ 100',
  priceValue: 100,
  spotsLeft: 24,
  spotsTotal: 24,
  status: status,
  featured: false,
  enrolledCount: 0,
  liveMatchesNow: 0,
  listingStatusRaw: listingStatusRaw,
  registrationOpensAt: registrationOpensAt,
  registrationClosesAt: registrationClosesAt,
  categoryOffers: categoryOffers,
);
