import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../domain/match_win_probability_providers.dart';
import '../../domain/tournament_match_card_row.dart';
import '../../domain/tournament_match_card_view_model.dart';
import 'nexa_duo_avatars.dart';
import '../../domain/tournament_match_display.dart';
import 'tournament_match_card_premium_skin.dart';
import 'tournament_match_live_badge.dart';

/// Card de partida no desenho da Copa VH, o mesmo do portal do atleta
/// (`category-matches.component`): linha mono no topo (nº do jogo + contexto à
/// esquerda, selo de estado à direita), uma linha por dupla com o par de
/// avatares sobrepostos e o placar à direita, e as parciais em pílulas no
/// rodapé. Final e 3º lugar ganham o tratamento ouro/bronze.
///
/// As duas superfícies são desenhos à mão que geram o mesmo card: mexeu aqui,
/// replica no portal (e vice-versa), senão as telas divergem em silêncio.
class TournamentMatchCard extends ConsumerWidget {
  const TournamentMatchCard({
    super.key,
    required this.viewModel,
    this.athleteTeamIds = const {},
    this.onTap,
  });

  final TournamentMatchCardViewModel viewModel;

  /// Equipes do atleta logado no torneio — marcam o card e o lado dele.
  final Set<String> athleteTeamIds;

  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final match = viewModel.match;
    final row = buildTournamentMatchRow(
      viewModel: viewModel,
      athleteTeamIds: athleteTeamIds,
    );

    // Probabilidade de vitória pré-partida: só busca quando faz sentido
    // (partida agendada, ainda sem placar) — nunca para partidas ao vivo ou
    // finalizadas, que já mostram o placar real.
    final showWinProbability = row.state == TournamentMatchRowState.scheduled &&
        !matchHasScoreData(match);
    final winProbability = showWinProbability
        ? ref
            .watch(
              matchWinProbabilityProvider((
                tournamentId: match.tournamentId,
                teamAId: match.teamAId,
                teamBId: match.teamBId,
              )),
            )
            .valueOrNull
        : null;
    final teamAProbability = winProbability != null
        ? (winProbability * 100).round().clamp(1, 99)
        : null;

    return TournamentMatchCardSkin(
      stage: row.stage,
      isLive: row.state == TournamentMatchRowState.live,
      isMine: row.isMine,
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _Head(row: row),
          const SizedBox(height: 12),
          _TeamRow(
            side: row.sideA,
            probabilityLabel:
                teamAProbability != null ? '$teamAProbability%' : null,
          ),
          _TeamRow(
            side: row.sideB,
            probabilityLabel:
                teamAProbability != null ? '${100 - teamAProbability}%' : null,
          ),
          if (row.pills.isNotEmpty) _Pills(pills: row.pills),
        ],
      ),
    );
  }
}

/// Nº do jogo + contexto à esquerda, selo de estado à direita. O nº abre a
/// linha e não encolhe: é por ele que o organizador chama o jogo na quadra,
/// então o resto do contexto trunca antes dele.
class _Head extends StatelessWidget {
  const _Head({required this.row});

  final TournamentMatchRow row;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final isLive = row.state == TournamentMatchRowState.live;
    final accent = switch (row.stage) {
      TournamentMatchRowStage.grandFinal => kMatchCardGold,
      TournamentMatchRowStage.thirdPlace => kMatchCardBronze,
      null => isLive ? AppColors.brand : null,
    };

    return Row(
      children: [
        if (row.number.isNotEmpty) ...[
          Text(
            row.number,
            style: AppTypography.mono(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: accent ?? colors.onSurfaceMuted,
              letterSpacing: 0.66,
            ),
          ),
          const SizedBox(width: 7),
        ],
        Expanded(
          child: Text(
            row.head.toUpperCase(),
            style: AppTypography.mono(
              fontSize: 11,
              fontWeight: FontWeight.w400,
              color: accent ?? colors.onSurfaceMuted.withValues(alpha: 0.85),
              letterSpacing: 1.32,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ),
        const SizedBox(width: 8),
        _StateChip(row: row),
      ],
    );
  }
}

/// Selo de estado. O tom nunca é a única informação: cada estado carrega o
/// próprio texto, então quem não distingue as cores não perde nada.
class _StateChip extends StatelessWidget {
  const _StateChip({required this.row});

  final TournamentMatchRow row;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final isLive = row.state == TournamentMatchRowState.live;

    // Agendada/a definir na final e no 3º lugar viram selo metálico cheio: é o
    // jogo que decide o torneio, o âmbar genérico não dá conta.
    final metal = switch (row.stage) {
      TournamentMatchRowStage.grandFinal
          when row.state == TournamentMatchRowState.scheduled ||
              row.state == TournamentMatchRowState.tbd =>
        (
          gradient: const [Color(0xFFFFE9A8), kMatchCardGold],
          text: const Color(0xFF241A00),
        ),
      TournamentMatchRowStage.thirdPlace
          when row.state == TournamentMatchRowState.scheduled ||
              row.state == TournamentMatchRowState.tbd =>
        (
          gradient: const [Color(0xFFF3C9A8), kMatchCardBronze],
          text: const Color(0xFF2A1608),
        ),
      _ => null,
    };

    final (background, border, foreground) = switch (row.state) {
      TournamentMatchRowState.live => (
          AppColors.live,
          Colors.transparent,
          AppColors.white,
        ),
      TournamentMatchRowState.done => (
          AppColors.win.withValues(alpha: 0.16),
          AppColors.win.withValues(alpha: 0.3),
          AppColors.win,
        ),
      TournamentMatchRowState.scheduled || TournamentMatchRowState.tbd => (
          AppColors.pending.withValues(alpha: 0.12),
          AppColors.pending.withValues(alpha: 0.3),
          AppColors.pending,
        ),
      TournamentMatchRowState.canceled => (
          Colors.transparent,
          colors.onSurfaceMuted.withValues(alpha: 0.3),
          colors.onSurfaceMuted,
        ),
    };

    return Container(
      height: 22,
      padding: const EdgeInsets.symmetric(horizontal: 9),
      decoration: BoxDecoration(
        color: metal == null ? background : null,
        gradient: metal != null
            ? LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: metal.gradient,
                stops: const [0, 0.65],
              )
            : null,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(
          color: metal != null ? Colors.transparent : border,
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (isLive) ...[
            const TournamentMatchCardLiveDot(color: AppColors.white),
            const SizedBox(width: 5),
          ],
          Text(
            row.stateLabel.toUpperCase(),
            style: AppTypography.soraRegular(
              fontSize: 10,
              fontWeight: FontWeight.w700,
              color: metal?.text ?? foreground,
              letterSpacing: 0.6,
            ),
          ),
        ],
      ),
    );
  }
}

class _TeamRow extends StatelessWidget {
  const _TeamRow({required this.side, this.probabilityLabel});

  final TournamentMatchRowSide side;

  /// Probabilidade de vitória pré-partida ("62%"), exibida no lugar do traço
  /// enquanto a partida não tem placar. `null` quando não há dado suficiente
  /// (regra dura: nunca mostrar sem dado).
  final String? probabilityLabel;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final isIdle = side.score == '—';

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 7),
      child: Row(
        children: [
          NexaDuoAvatars(players: side.players),
          const SizedBox(width: 12),
          Expanded(
            child: Text.rich(
              TextSpan(
                text: side.name,
                children: [
                  if (side.mine)
                    TextSpan(
                      text: ' · você',
                      style: TextStyle(color: AppColors.brandHover),
                    ),
                ],
              ),
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
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
          const SizedBox(width: 12),
          if (isIdle && probabilityLabel != null)
            Text(
              probabilityLabel!,
              style: AppTypography.mono(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: colors.onSurfaceMuted,
                letterSpacing: 0.2,
              ),
            )
          else
            Text(
              side.score,
              style: AppTypography.mono(
                fontSize: 20,
                fontWeight: FontWeight.w700,
                color: side.won
                    ? AppColors.win
                    : side.lost
                        ? colors.onSurfaceMuted
                        : side.leading
                            ? AppColors.brand
                            : isIdle
                                ? colors.onSurface.withValues(alpha: 0.35)
                                : colors.onSurface,
              ),
            ),
        ],
      ),
    );
  }
}

/// Parciais de cada set (`21·15`), com o set em andamento contornado.
class _Pills extends StatelessWidget {
  const _Pills({required this.pills});

  final List<TournamentMatchRowPill> pills;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    return Container(
      margin: const EdgeInsets.only(top: 8),
      padding: const EdgeInsets.only(top: 12),
      decoration: BoxDecoration(
        border: Border(
          top: BorderSide(
            color: colors.onSurfaceMuted.withValues(alpha: 0.12),
          ),
        ),
      ),
      child: Wrap(
        spacing: 6,
        runSpacing: 6,
        children: [
          for (final pill in pills)
            Container(
              padding: const EdgeInsets.symmetric(
                horizontal: 10,
                vertical: 3,
              ),
              decoration: BoxDecoration(
                color: pill.current
                    ? Colors.transparent
                    : AppColors.win.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(999),
                border:
                    pill.current ? Border.all(color: AppColors.brand) : null,
              ),
              child: Text(
                pill.label,
                style: AppTypography.mono(
                  fontSize: 11,
                  fontWeight: FontWeight.w500,
                  color: pill.current ? AppColors.brand : AppColors.win,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// Par de avatares sobrepostos que identifica a dupla — mesmo desenho do portal
/// (`duo-avatars`): gradiente laranja→rosa no primeiro atleta, verde no
/// segundo, iniciais brancas e aro do fundo separando as fotos.
