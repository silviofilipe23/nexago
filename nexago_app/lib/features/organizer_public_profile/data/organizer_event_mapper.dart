import '../../tournaments/data/tournament_document_mapper.dart';
import '../domain/organizer_event.dart';

/// `tournaments/{id}` → [OrganizerEvent]. Devolve `null` para evento não listado (rascunho,
/// cancelado, "por link"), que nunca aparece no perfil público.
OrganizerEvent? organizerEventFromMap(String id, Map<String, dynamic> data) {
  final listing = organizerEventListingOf(data);
  if (listing == null) return null;
  final detail = TournamentDocumentMapper.detailFromMap(id, data);
  return OrganizerEvent(
    detail: detail,
    listing: listing,
    champions: organizerEventChampions(
      data['categoryOps'],
      categoryOrder: [
        for (final offer in detail.categoryOffers)
          (id: offer.id, name: offer.name),
      ],
    ),
  );
}

/// Campeões de `categoryOps.{categoryId}.championTeamId`, na ordem das categorias do torneio.
/// Categoria que não está mais em `categories[]` vai para o fim, sem nome.
List<OrganizerEventChampion> organizerEventChampions(
  Object? categoryOps, {
  required List<({String id, String name})> categoryOrder,
}) {
  if (categoryOps is! Map) return const [];
  final champions = <OrganizerEventChampion>[];
  for (final entry in categoryOps.entries) {
    final raw = entry.value;
    if (raw is! Map) continue;
    final teamId = raw['championTeamId'];
    if (teamId is! String || teamId.trim().isEmpty) continue;
    final categoryId = '${entry.key}'.trim();
    String name = '';
    for (final category in categoryOrder) {
      if (category.id == categoryId) name = category.name;
    }
    champions.add(
      OrganizerEventChampion(
        categoryId: categoryId,
        categoryName: name,
        teamId: teamId.trim(),
      ),
    );
  }
  int rank(OrganizerEventChampion c) {
    final index = categoryOrder.indexWhere((cat) => cat.id == c.categoryId);
    return index < 0 ? categoryOrder.length : index;
  }

  champions.sort((a, b) {
    final byRank = rank(a).compareTo(rank(b));
    return byRank != 0 ? byRank : a.categoryId.compareTo(b.categoryId);
  });
  return champions;
}
