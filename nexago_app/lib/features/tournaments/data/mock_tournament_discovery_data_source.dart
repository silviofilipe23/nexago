import 'dart:async';

import '../domain/tournament_detail_model.dart';
import '../domain/tournament_discovery_models.dart';
import 'mock_tournament_discovery_data.dart';
import 'tournament_discovery_data_source.dart';

class MockTournamentDiscoveryDataSource implements TournamentDiscoveryDataSource {
  MockTournamentDiscoveryDataSource({
    List<DiscoveryTournament>? tournaments,
    List<TournamentDetail>? tournamentDetails,
    List<DiscoveryLeague>? leagues,
  }) : _leagues = leagues ?? mockDiscoveryLeagues {
    if (tournamentDetails != null) {
      _details = tournamentDetails;
      _tournaments = tournamentDetails.map((d) => d.toDiscovery()).toList();
    } else if (tournaments != null) {
      _tournaments = tournaments;
      _details = null;
    } else {
      _details = buildMockTournamentDetails();
      _tournaments = _details!.map((d) => d.toDiscovery()).toList();
    }
  }

  List<TournamentDetail>? _details;
  late final List<DiscoveryTournament> _tournaments;
  final List<DiscoveryLeague> _leagues;

  List<TournamentDetail> get _detailList =>
      _details ?? _tournaments.map(_discoveryToDetail).toList();

  static TournamentDetail _discoveryToDetail(DiscoveryTournament t) {
    return TournamentDetail(
      id: t.id,
      name: t.name,
      location: t.location,
      city: t.city,
      dateLabel: t.dateLabel,
      startDate: t.startDate,
      endDate: null,
      categories: t.categories,
      format: t.format,
      priceLabel: t.priceLabel,
      priceValue: t.priceValue,
      spotsLeft: t.spotsLeft,
      spotsTotal: t.spotsTotal,
      status: t.status,
      featured: t.featured,
      enrolledCount: t.enrolledCount,
      liveMatchesNow: t.liveMatchesNow,
      offerEndsAt: t.offerEndsAt,
      leagueId: t.leagueId,
      leagueStageId: t.leagueStageId,
      imageUrl: t.imageUrl,
      categoryOffers: t.categoryOffers,
    );
  }

  @override
  Stream<List<DiscoveryTournament>> watchTournaments() =>
      Stream.value(List<DiscoveryTournament>.from(_tournaments));

  @override
  Stream<List<DiscoveryLeague>> watchLeagues() =>
      Stream.value(List<DiscoveryLeague>.from(_leagues));

  @override
  Stream<DiscoveryTournament?> watchTournament(String id) {
    return watchTournamentDetail(id).map((d) => d?.toDiscovery());
  }

  @override
  Stream<TournamentDetail?> watchTournamentDetail(String id) {
    for (final t in _detailList) {
      if (t.id == id) return Stream.value(t);
    }
    return Stream.value(null);
  }

  @override
  Stream<DiscoveryLeague?> watchLeague(String id) {
    for (final l in _leagues) {
      if (l.id == id) return Stream.value(l);
    }
    return Stream.value(null);
  }
}
