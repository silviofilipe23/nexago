import '../../tournaments/domain/tournament_detail_model.dart';

/// Estado de listagem bruto do evento — os três que contam como "listado" na spec.
enum OrganizerEventListing { open, closed, completed }

/// Campeão registrado em `tournaments/{id}.categoryOps.{categoryId}.championTeamId`.
class OrganizerEventChampion {
  const OrganizerEventChampion({
    required this.categoryId,
    required this.categoryName,
    required this.teamId,
  });

  final String categoryId;
  final String categoryName;
  final String teamId;
}

/// Evento listado de um organizador, como o perfil público o mostra.
class OrganizerEvent {
  const OrganizerEvent({
    required this.detail,
    required this.listing,
    this.champions = const [],
  });

  final TournamentDetail detail;
  final OrganizerEventListing listing;

  /// Na ordem das categorias do torneio: o primeiro é o da "primeira categoria".
  final List<OrganizerEventChampion> champions;

  String get id => detail.id;
}

/// Espelho de `isListedTournament` do backend (`functions/src/organizer-public-profile.ts`):
/// `listingStatus` (ou `status`) em open/closed/completed e `visibility` diferente de
/// `linkOnly`. Doc sem `visibility` é anterior ao seletor e conta como público. Usar a MESMA
/// regra do servidor faz "Ver os N" bater com `stats.eventsCompleted`.
OrganizerEventListing? organizerEventListingOf(Map<String, dynamic> data) {
  final listing = data['listingStatus'];
  final status = data['status'];
  final raw =
      (listing is String && listing.trim().isNotEmpty
              ? listing
              : (status is String ? status : ''))
          .trim()
          .toLowerCase();
  final parsed = switch (raw) {
    'open' => OrganizerEventListing.open,
    'closed' => OrganizerEventListing.closed,
    'completed' => OrganizerEventListing.completed,
    _ => null,
  };
  if (parsed == null) return null;
  final visibility = data['visibility'];
  if (visibility is String && visibility.trim() == 'linkOnly') return null;
  return parsed;
}

bool isOrganizerListedEventDoc(Map<String, dynamic> data) =>
    organizerEventListingOf(data) != null;
