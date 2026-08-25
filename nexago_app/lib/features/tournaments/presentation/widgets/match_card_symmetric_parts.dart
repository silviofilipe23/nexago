import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_typography.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../domain/tournament_match_card_row.dart';
import 'nexa_duo_avatars.dart';
import 'tournament_match_live_badge.dart';

/// As peças do card SIMÉTRICO de partida — dupla à esquerda, centro, dupla à
/// direita.
///
/// Moram aqui, e não dentro do card do Modo Focus, porque são duas telas que
/// desenham o mesmo card: a de partida do Focus e a de palpite (que troca o
/// placar do meio por "vs" e faz de cada lado um alvo de toque). Copiar o
/// desenho faria os dois divergirem em silêncio a cada ajuste — foi o que este
/// arquivo existe para impedir.
///
/// O que NÃO mora aqui é a casca ([TournamentMatchCardSkin]) nem o centro: a
/// casca já é compartilhada, e o centro é o que muda entre os dois cards.

/// "#14 ● AO VIVO" à esquerda, "MISTO B · GRUPO B · Q3" à direita.
///
/// O nº abre a linha e não encolhe: é por ele que o organizador chama o jogo na
/// quadra. O contexto é quem quebra — em até duas linhas, como no protótipo.
class MatchCardHead extends StatelessWidget {
  const MatchCardHead({
    super.key,
    required this.row,
    required this.contextLabel,
    this.trailing,
  });

  final TournamentMatchRow row;
  final String contextLabel;

  /// Entra à direita, DEPOIS do contexto. O card de palpite pendura aqui o
  /// "VALE CAMPEÃO" e o cadeado, que o card de partida não tem.
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

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
            contextLabel.toUpperCase(),
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
        if (trailing != null) ...[
          const SizedBox(width: 6),
          trailing!,
        ],
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
class MatchCardSide extends StatelessWidget {
  const MatchCardSide({super.key, required this.side, this.emphasized = false});

  final TournamentMatchRowSide side;

  /// Realce por escolha (o palpite do atleta), e não por resultado — o card de
  /// partida nunca liga isto.
  final bool emphasized;

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
            fontWeight: side.mine || emphasized
                ? FontWeight.w700
                : side.lost || side.tbd
                    ? FontWeight.w500
                    : FontWeight.w600,
            color: emphasized
                ? AppColors.brand
                : side.tbd
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
