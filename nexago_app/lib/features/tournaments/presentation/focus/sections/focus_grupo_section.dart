import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../domain/tournament_detail_model.dart';
import '../../widgets/tournament_detail/tournament_detail_groups_tab.dart';
import '../../widgets/tournament_detail/tournament_matches_filter_toggle.dart';

/// Seção "Grupo" do Focus — embrulho da aba de grupos do detalhe.
///
/// A categoria vem travada de fora ([categoryId], a categoria em foco). Isso
/// não é detalhe de navegação: `poolId` só é único DENTRO da categoria — os
/// grupos são 'A', 'B', 'C'… em todas elas —, então sem esse recorte o Grupo A
/// do atleta aparece fundido com o Grupo A das outras categorias.
class FocusGrupoSection extends ConsumerStatefulWidget {
  const FocusGrupoSection({
    super.key,
    required this.tournament,
    required this.categoryId,
  });

  final TournamentDetail tournament;
  final String categoryId;

  @override
  ConsumerState<FocusGrupoSection> createState() => _FocusGrupoSectionState();
}

class _FocusGrupoSectionState extends ConsumerState<FocusGrupoSection> {
  TournamentMatchesFilter _filter = TournamentMatchesFilter.mine;

  @override
  Widget build(BuildContext context) {
    return TournamentDetailGroupsTab(
      tournament: widget.tournament,
      categoryId: widget.categoryId,
      filter: _filter,
      showCategoryChips: false,
      onFilterChanged: (value) => setState(() => _filter = value),
      onCategorySelected: (_) {},
    );
  }
}
