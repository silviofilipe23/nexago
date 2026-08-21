import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_spacing.dart';
import '../../../../../core/theme/app_typography.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../domain/focus/focus_match_card_view.dart';
import '../../../domain/tournament_match_card_row.dart';
import '../../../domain/tournament_match_card_view_model.dart';
import '../../widgets/match_card_symmetric_parts.dart';
import '../../widgets/tournament_match_card_premium_skin.dart';

/// Card de partida do Modo Focus: dupla à esquerda, placar no meio, dupla à
/// direita — o desenho dos protótipos do Focus.
///
/// É OUTRO card, e não uma variante do [TournamentMatchCard] compartilhado, de
/// propósito. Aquele é desenho à mão espelhado no portal do atleta (`mexeu
/// aqui, replica lá`), e o Focus quis um layout simétrico que o portal não tem.
/// Ramificar o card compartilhado faria as duas superfícies divergirem em
/// silêncio a cada ajuste daqui.
///
/// O que os dois COMPARTILHAM é o que importa não divergir: o estado da
/// partida, os nomes, o lado do atleta e a casca ouro/bronze da final e do 3º
/// lugar saem de [buildTournamentMatchRow] e [TournamentMatchCardSkin].
class FocusMatchCard extends StatelessWidget {
  const FocusMatchCard({
    super.key,
    required this.viewModel,
    this.athleteTeamIds = const {},
    this.categoryName = '',
    this.onTap,
  });

  final TournamentMatchCardViewModel viewModel;

  /// Equipes do atleta logado — marcam o card e o lado dele.
  final Set<String> athleteTeamIds;

  /// Só nas listas do torneio INTEIRO (seção Arena). Vazio numa lista já
  /// recortada por categoria, onde a informação é redundante.
  final String categoryName;

  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final match = viewModel.match;
    final row = buildTournamentMatchRow(
      viewModel: viewModel,
      athleteTeamIds: athleteTeamIds,
    );
    final score = focusMatchCardScoreOf(match, row.state);

    return TournamentMatchCardSkin(
      stage: row.stage,
      isLive: row.state == TournamentMatchRowState.live,
      isMine: row.isMine,
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          MatchCardHead(
            row: row,
            contextLabel: focusMatchCardContext(
              match: match,
              categoryName: categoryName,
            ),
          ),
          const SizedBox(height: AppSpacing.lg),
          // Sem `IntrinsicHeight`: as três colunas alinham pelo TOPO, e o custo
          // de medir duas vezes por quadro não compraria nada aqui.
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(child: MatchCardSide(side: row.sideA)),
              _Score(
                center: score.center,
                detail: score.detail,
                state: row.state,
                stage: row.stage,
              ),
              Expanded(child: MatchCardSide(side: row.sideB)),
            ],
          ),
        ],
      ),
    );
  }
}

/// O placar no meio: sets em número grande e a linha fina embaixo.
class _Score extends StatelessWidget {
  const _Score({
    required this.center,
    required this.detail,
    required this.state,
    required this.stage,
  });

  final String center;
  final String? detail;
  final TournamentMatchRowState state;
  final TournamentMatchRowStage? stage;

  /// Largura FIXA, e é o que segura o layout de pé.
  ///
  /// A coluna do meio não é `Expanded`: o `Row` mede os filhos sem flex
  /// primeiro, com largura livre, e só reparte o que sobra entre as duplas.
  /// Uma linha de parciais de 3 sets ("21-14 · 21-18 · 15-13") media ~230px e
  /// espremia os avatares de 68px para OITO — sem lançar exceção, porque
  /// `NexaDuoAvatars` é um `Stack` com `Clip.none` e os rostos simplesmente
  /// vazavam por cima do vizinho.
  ///
  /// 96 é o maior valor que ainda deixa 68px por dupla num aparelho de 320pt.
  static const double _width = 96;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    final color = switch (state) {
      TournamentMatchRowState.live => AppColors.brand,
      TournamentMatchRowState.done => switch (stage) {
          TournamentMatchRowStage.grandFinal => kMatchCardGold,
          TournamentMatchRowStage.thirdPlace => kMatchCardBronze,
          null => colors.onSurface,
        },
      _ => colors.onSurfaceMuted.withValues(alpha: 0.5),
    };

    return SizedBox(
      width: _width,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Alinha o número grande com os rostos das duplas, não com o topo do
          // bloco: sem isto ele flutuaria acima dos avatares.
          const SizedBox(height: 4),
          Text(
            center,
            style: AppTypography.mono(
              fontSize: 26,
              fontWeight: FontWeight.w800,
              color: color,
              letterSpacing: 0.5,
            ),
          ),
          if (detail != null) ...[
            const SizedBox(height: 5),
            Text(
              detail!,
              textAlign: TextAlign.center,
              // Duas linhas porque as parciais de um jogo de 3 sets não cabem
              // em uma só — e truncar placar é pior do que quebrar linha.
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: AppTypography.mono(
                fontSize: 11,
                fontWeight: FontWeight.w500,
                color: colors.onSurfaceMuted,
                letterSpacing: 1.1,
              ),
            ),
          ],
        ],
      ),
    );
  }
}
