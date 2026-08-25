import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_spacing.dart';
import '../../../../../core/theme/app_typography.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../domain/focus/focus_double_elimination.dart';

/// "SUAS VIDAS" e "ONDE VOCÊ ESTÁ" — os dois blocos que a dupla eliminação
/// acrescenta ao Agora.
///
/// Existem porque a pergunta "eu ainda estou no torneio?" não se responde
/// sozinha na dupla eliminação: perder uma partida não elimina, e um atleta que
/// acabou de perder precisa ler isso em letra grande, não deduzir da chave.
class FocusLivesCard extends StatelessWidget {
  const FocusLivesCard({super.key, required this.standing});

  final FocusDoubleEliminationStanding standing;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    final (Color accent, String title, String body) = switch (standing.side) {
      FocusBracketSide.winners => (
          colors.win,
          'Duas vidas',
          'Invicto na chave dos vencedores. Se perder, você cai para a '
              'repescagem — não está eliminado.',
        ),
      FocusBracketSide.losers => (
          AppColors.live,
          'Última vida',
          'Você está na repescagem. Uma derrota agora encerra o seu torneio.',
        ),
      FocusBracketSide.eliminated => (
          colors.onSurfaceMuted,
          'Torneio encerrado',
          'Foram duas derrotas. Sua campanha nesta categoria acabou.',
        ),
    };

    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenH,
        0,
        AppSpacing.screenH,
        AppSpacing.lg,
      ),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(AppSpacing.lg),
        decoration: BoxDecoration(
          color: accent.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: accent.withValues(alpha: 0.55)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                _Pips(lives: standing.lives, accent: accent),
                const SizedBox(width: AppSpacing.sm),
                Text(
                  title,
                  style: AppTypography.titleM.copyWith(color: accent),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.xs),
            Text(
              body,
              style: AppTypography.bodyM.copyWith(color: colors.onSurfaceMuted),
            ),
          ],
        ),
      ),
    );
  }
}

/// Dois pontos: cheio para vida que resta, vazado para vida perdida.
class _Pips extends StatelessWidget {
  const _Pips({required this.lives, required this.accent});

  final int lives;
  final Color accent;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (var i = 0; i < 2; i++)
          Padding(
            padding: const EdgeInsets.only(right: 5),
            child: Container(
              width: 10,
              height: 10,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: i < lives ? colors.win : Colors.transparent,
                border: Border.all(
                  color: i < lives ? colors.win : accent,
                  width: 1.5,
                ),
              ),
            ),
          ),
      ],
    );
  }
}

/// "ONDE VOCÊ ESTÁ": os dois lados da chave, com o do atleta aceso.
class FocusBracketSideCards extends StatelessWidget {
  const FocusBracketSideCards({
    super.key,
    required this.standing,
    required this.winnersLabel,
    required this.losersLabel,
  });

  final FocusDoubleEliminationStanding standing;

  /// "Você está aqui · QF" ou "Eliminado desta chave".
  final String winnersLabel;
  final String losersLabel;

  @override
  Widget build(BuildContext context) {
    final inWinners = standing.side == FocusBracketSide.winners;
    final inLosers = standing.side == FocusBracketSide.losers;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.screenH),
      // `IntrinsicHeight` é o que torna o `stretch` abaixo legal. Os dois cards
      // precisam terminar na MESMA linha de base — "Você está aqui · QF" e
      // "Eliminado desta chave" têm alturas diferentes, e sem isso um card
      // ficaria mais curto que o vizinho.
      //
      // Só que `stretch` manda a altura do Row como restrição APERTADA para os
      // filhos, e o Row aqui mora num `ListView` (seção Agora), que dá altura
      // ILIMITADA. Sem medir antes, a restrição saía infinita e o layout
      // estourava — a seção Agora quebrava em toda categoria de dupla
      // eliminação.
      child: IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(
              child: _SideCard(
                title: 'VENCEDORES',
                body: winnersLabel,
                active: inWinners,
                accent: AppColors.brand,
              ),
            ),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: _SideCard(
                title: 'REPESCAGEM',
                body: losersLabel,
                active: inLosers,
                accent: AppColors.pending,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SideCard extends StatelessWidget {
  const _SideCard({
    required this.title,
    required this.body,
    required this.active,
    required this.accent,
  });

  final String title;
  final String body;
  final bool active;
  final Color accent;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: active ? accent.withValues(alpha: 0.08) : null,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: active ? accent : colors.outline,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: AppTypography.eyebrow.copyWith(
              color: active ? accent : colors.onSurfaceMuted,
            ),
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(
            body,
            style: AppTypography.bodyM.copyWith(
              color: active ? colors.onSurface : colors.onSurfaceMuted,
              fontWeight: active ? FontWeight.w700 : FontWeight.w400,
            ),
          ),
        ],
      ),
    );
  }
}
