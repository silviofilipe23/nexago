import 'package:flutter/material.dart';

import '../../../domain/tournament_detail_model.dart';
import '../../widgets/bracket/double_elimination_bracket_view.dart';
import '../focus_bottom_clearance.dart';

/// Seção "Chave" do Focus — a chave navegável da dupla eliminação, desenhada
/// DENTRO da casca.
///
/// Não redesenha nada: a arte da chave tem UMA implementação
/// ([DoubleEliminationBracketView]), a mesma da rota `/chave-interativa`.
/// Duplicá-la significaria duas versões divergindo a cada ajuste.
///
/// Antes esta seção embrulhava a aba de chave do detalhe do torneio, que
/// listava os jogos por fase e oferecia um card "Ver chave interativa" — e
/// aquele card EMPURRAVA outra rota, tirando o atleta da casca imersiva do
/// Focus. Aqui a chave é o conteúdo da seção, então a única saída continua
/// sendo o × do cabeçalho.
class FocusChaveSection extends StatelessWidget {
  const FocusChaveSection({
    super.key,
    required this.tournament,
    required this.categoryId,
  });

  final TournamentDetail tournament;
  final String categoryId;

  @override
  Widget build(BuildContext context) {
    return DoubleEliminationBracketView(
      tournamentId: tournament.id,
      categoryId: categoryId,
      bottomPadding: focusBottomClearance(context),
    );
  }
}
