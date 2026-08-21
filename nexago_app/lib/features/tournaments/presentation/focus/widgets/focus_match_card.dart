import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_spacing.dart';
import '../../../../../core/theme/app_typography.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../domain/focus/focus_match_card_view.dart';
import '../../../domain/tournament_match_card_row.dart';
import '../../../domain/tournament_match_card_view_model.dart';
import '../../widgets/nexa_duo_avatars.dart';
import '../../widgets/tournament_match_card_premium_skin.dart';
import '../../widgets/tournament_match_live_badge.dart';

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
          _Head(
            row: row,
            context: focusMatchCardContext(
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
              Expanded(child: _Side(side: row.sideA)),
              _Score(
                center: score.center,
                detail: score.detail,
                state: row.state,
                stage: row.stage,
              ),
              Expanded(child: _Side(side: row.sideB)),
            ],
          ),
        ],
      ),
    );
  }
}

/// "#14 ● AO VIVO" à esquerda, "MISTO B · GRUPO B · Q3" à direita.
///
/// O nº abre a linha e não encolhe: é por ele que o organizador chama o jogo na
/// quadra. O contexto é quem quebra — em até duas linhas, como no protótipo.
class _Head extends StatelessWidget {
  const _Head({required this.row, required this.context});

  final TournamentMatchRow row;
  final String context;

  @override
  Widget build(BuildContext ctx) {
    final colors = ctx.themeColors;

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (row.number.isNotEmpty) ...[
          Text(
            row.number,
            style: AppTypography.mono(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: colors.onSurfaceMuted,
              letterSpacing: 0.66,
            ),
          ),
          const SizedBox(width: 7),
        ],
        _StateMark(row: row),
        const SizedBox(width: AppSpacing.sm),
        Expanded(
          child: Text(
            context.toUpperCase(),
            textAlign: TextAlign.right,
            style: AppTypography.mono(
              fontSize: 11,
              fontWeight: FontWeight.w400,
              color: colors.onSurfaceMuted.withValues(alpha: 0.85),
              letterSpacing: 1.32,
            ),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ],
    );
  }
}

/// O estado, em texto — nunca só cor.
///
/// Agendada mostra o HORÁRIO no lugar do rótulo: é o que o atleta procura, e
/// é o que mantém a hora na tela nas listas de "a seguir", onde toda partida
/// está agendada.
class _StateMark extends StatelessWidget {
  const _StateMark({required this.row});

  final TournamentMatchRow row;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final isLive = row.state == TournamentMatchRowState.live;

    final color = switch (row.state) {
      TournamentMatchRowState.live => AppColors.live,
      TournamentMatchRowState.done => AppColors.win,
      TournamentMatchRowState.scheduled ||
      TournamentMatchRowState.tbd =>
        AppColors.pending,
      TournamentMatchRowState.canceled => colors.onSurfaceMuted,
    };

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (isLive) ...[
          const TournamentMatchCardLiveDot(),
          const SizedBox(width: 5),
        ],
        Text(
          row.stateLabel.toUpperCase(),
          style: AppTypography.mono(
            fontSize: 11,
            fontWeight: FontWeight.w700,
            color: color,
            letterSpacing: 1.32,
          ),
        ),
      ],
    );
  }
}

/// Uma dupla: os dois rostos sobrepostos e o nome centralizado embaixo.
class _Side extends StatelessWidget {
  const _Side({required this.side});

  final TournamentMatchRowSide side;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        NexaDuoAvatars(players: side.players, size: 40),
        const SizedBox(height: AppSpacing.sm),
        Text(
          side.name,
          textAlign: TextAlign.center,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: AppTypography.soraRegular(
            fontSize: 14,
            fontWeight: side.mine
                ? FontWeight.w700
                : side.lost || side.tbd
                    ? FontWeight.w500
                    : FontWeight.w600,
            color: side.tbd
                ? colors.onSurfaceMuted.withValues(alpha: 0.85)
                : side.lost
                    ? colors.onSurfaceMuted
                    : colors.onSurface,
          ).copyWith(
            fontStyle: side.tbd ? FontStyle.italic : FontStyle.normal,
          ),
        ),
      ],
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
