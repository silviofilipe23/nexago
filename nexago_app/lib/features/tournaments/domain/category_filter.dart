import 'tournament_detail_logic.dart';
import 'tournament_discovery_models.dart';

/// Filtro da aba de categorias, derivado das ofertas do próprio torneio.
///
/// Nada de lista fixa: um torneio só masculino não mostra "Feminino", e um
/// chip que devolveria exatamente a mesma lista que "Todas" não aparece.
typedef CategoryFilterOption = ({String id, String label});

const String categoryFilterAllId = 'all';
const String categoryFilterGroupsId = 'groups';

/// Ordem canônica dos chips de gênero — a leitura não muda com a ordem em que
/// o organizador cadastrou as categorias.
const List<String> _genderTagOrder = [
  'MASCULINO',
  'FEMININO',
  'MISTO',
  'LIVRE'
];

/// Opções de filtro para [offers]. Vazio quando só sobraria "Todas".
List<CategoryFilterOption> categoryFilterOptions(
  List<TournamentCategoryOffer> offers,
) {
  if (offers.isEmpty) return const [];

  final genders = <String>{
    for (final offer in offers)
      if (_genderTagOrder.contains(tournamentCategoryGenderTag(offer)))
        tournamentCategoryGenderTag(offer),
  };

  final withGroups = offers.where(categoryHasGroupsPhase).length;
  final groupsSplits = withGroups > 0 && withGroups < offers.length;

  final narrowing = <CategoryFilterOption>[
    if (genders.length > 1)
      for (final tag in _genderTagOrder)
        if (genders.contains(tag))
          (id: tag, label: categoryGenderDisplayLabelFromTag(tag)),
    if (groupsSplits) (id: categoryFilterGroupsId, label: 'Grupos'),
  ];

  if (narrowing.isEmpty) return const [];
  return [(id: categoryFilterAllId, label: 'Todas'), ...narrowing];
}

/// Aplica [filterId] em [offers]. Filtro desconhecido (ou "Todas") devolve a
/// lista inteira — a categoria selecionada pode ter sido removida.
List<TournamentCategoryOffer> applyCategoryFilter(
  List<TournamentCategoryOffer> offers,
  String filterId,
) {
  if (filterId == categoryFilterGroupsId) {
    return offers.where(categoryHasGroupsPhase).toList();
  }
  if (_genderTagOrder.contains(filterId)) {
    return offers
        .where((offer) => tournamentCategoryGenderTag(offer) == filterId)
        .toList();
  }
  return offers;
}
