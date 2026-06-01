import 'tournament_detail_logic.dart';
import 'tournament_detail_model.dart';

enum TournamentDetailTab {
  overview,
  categories,
  bracket,
  groups,
  prizes,
}

extension TournamentDetailTabX on TournamentDetailTab {
  String get label => switch (this) {
        TournamentDetailTab.overview => 'Visão geral',
        TournamentDetailTab.categories => 'Categorias',
        TournamentDetailTab.bracket => 'Chave',
        TournamentDetailTab.groups => 'Grupos',
        TournamentDetailTab.prizes => 'Premiação',
      };
}

List<TournamentDetailTab> visibleTournamentDetailTabs(
  TournamentDetail tournament,
) {
  final tabs = <TournamentDetailTab>[
    TournamentDetailTab.overview,
    TournamentDetailTab.categories,
    TournamentDetailTab.bracket,
  ];
  if (tournamentShouldShowGroupsTab(tournament)) {
    tabs.add(TournamentDetailTab.groups);
  }
  tabs.add(TournamentDetailTab.prizes);
  return tabs;
}
