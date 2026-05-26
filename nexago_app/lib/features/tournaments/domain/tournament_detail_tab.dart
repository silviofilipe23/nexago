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
