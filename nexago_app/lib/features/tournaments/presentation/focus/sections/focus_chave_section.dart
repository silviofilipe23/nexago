import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../domain/tournament_detail_model.dart';
import '../../widgets/tournament_detail/tournament_detail_bracket_tab.dart';
import '../../widgets/tournament_detail/tournament_matches_filter_toggle.dart';

/// Seção "Chave" do Focus — embrulho do desenho que o detalhe do torneio já
/// faz. Não redesenha nada: a arte da chave (incluindo a dupla eliminação) tem
/// UMA implementação, e duplicá-la significaria duas versões divergindo a cada
/// ajuste.
///
/// `showCategoryChips: false` porque dentro do Focus a categoria é a em foco —
/// trocar de categoria aqui contradiz a premissa da casca.
class FocusChaveSection extends ConsumerStatefulWidget {
  const FocusChaveSection({
    super.key,
    required this.tournament,
    required this.categoryId,
  });

  final TournamentDetail tournament;
  final String categoryId;

  @override
  ConsumerState<FocusChaveSection> createState() => _FocusChaveSectionState();
}

class _FocusChaveSectionState extends ConsumerState<FocusChaveSection> {
  // Entra filtrado nas partidas do atleta: no Focus a pergunta é "onde EU
  // estou na chave", não "quem mais está jogando".
  TournamentMatchesFilter _filter = TournamentMatchesFilter.mine;
  String? _round;

  @override
  Widget build(BuildContext context) {
    return TournamentDetailBracketTab(
      tournament: widget.tournament,
      categoryId: widget.categoryId,
      filter: _filter,
      showCategoryChips: false,
      selectedRound: _round,
      onRoundChanged: (value) => setState(() => _round = value),
      onFilterChanged: (value) => setState(() => _filter = value),
      onCategorySelected: (_) {},
    );
  }
}
