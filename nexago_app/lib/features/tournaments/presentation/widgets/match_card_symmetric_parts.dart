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

/// "#14 ● AO VIVO" + categoria na primeira linha; grupo/fase · quadra embaixo.
///
/// O nº abre a linha e não encolhe: é por ele que o organizador chama o jogo na
/// quadra. A categoria (quando a lista é do torneio inteiro) fica à direita do
/// status; o restante do contexto sobra sozinho na linha de baixo.
class MatchCardHead extends StatelessWidget {
  const MatchCardHead({
    super.key,
    required this.row,
    this.categoryLabel = '',
    this.contextLabel = '',
    this.trailing,
  });

  final TournamentMatchRow row;

  /// Nome da categoria — só nas listas do torneio inteiro (Arena).
  final String categoryLabel;

  /// Grupo/fase · quadra, na linha de baixo.
  final String contextLabel;

  /// Entra à direita da linha de cima. O card de palpite pendura aqui o
  /// "VALE CAMPEÃO" e o cadeado, que o card de partida não tem.
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final mutedStyle = AppTypography.mono(
      fontSize: 10,
      fontWeight: FontWeight.w400,
      color: colors.onSurfaceMuted.withValues(alpha: 0.85),
      letterSpacing: 1.32,
    );
    final category = categoryLabel.trim();
    final meta = contextLabel.trim();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
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
            if (category.isNotEmpty) ...[
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Text(
                  category.toUpperCase(),
                  textAlign: TextAlign.right,
                  style: mutedStyle.copyWith(fontWeight: FontWeight.w600),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ] else if (trailing != null)
              const Spacer(),
            if (trailing != null) ...[
              if (category.isNotEmpty) const SizedBox(width: 6),
              trailing!,
            ],
          ],
        ),
        if (meta.isNotEmpty) ...[
          const SizedBox(height: 4),
          Text(
            meta.toUpperCase(),
            style: mutedStyle,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
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
      TournamentMatchRowState.tbd => AppColors.pending,
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
  const MatchCardSide({
    super.key,
    required this.side,
    this.emphasized = false,
    this.avatarSize = 40,
    this.nameFontSize = 14,
    this.namesOnePerLine = false,
  });

  final TournamentMatchRowSide side;

  /// Realce por escolha (o palpite do atleta), e não por resultado — o card de
  /// partida nunca liga isto.
  final bool emphasized;

  /// Diâmetro de cada rosto. O card de palpite sobe pra 56; o de partida
  /// mantém 40.
  final double avatarSize;

  /// Tamanho do nome sob os avatares.
  final double nameFontSize;

  /// No palpite cada atleta fica em uma linha; no card de partida o nome da
  /// dupla continua numa só.
  final bool namesOnePerLine;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final nameStyle = AppTypography.soraRegular(
      fontSize: nameFontSize,
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
    ).copyWith(fontStyle: side.tbd ? FontStyle.italic : FontStyle.normal);
    final playerNames = side.players
        .map((p) => p.name.trim())
        .where((n) => n.isNotEmpty)
        .take(2)
        .toList();

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        NexaDuoAvatars(players: side.players, size: avatarSize),
        const SizedBox(height: AppSpacing.sm),
        if (namesOnePerLine && playerNames.isNotEmpty)
          Column(
            children: [
              for (var i = 0; i < playerNames.length; i++) ...[
                if (i > 0) const SizedBox(height: 2),
                Text(
                  playerNames[i],
                  textAlign: TextAlign.center,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: nameStyle,
                ),
              ],
            ],
          )
        else
          Text(
            side.name,
            textAlign: TextAlign.center,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: nameStyle,
          ),
      ],
    );
  }
}
