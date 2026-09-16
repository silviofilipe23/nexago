import 'dart:ui';

import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_spacing.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../domain/focus/focus_double_elimination.dart';

/// "ONDE VOCÊ ESTÁ" — vidas restantes + os dois lados da chave, com o do
/// atleta aceso. Em dupla eliminação a pergunta "ainda estou no torneio?"
/// precisa aparecer junto do lado da chave, não num card separado.
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
    final (Color livesAccent, String livesTitle, String livesBody) =
        switch (standing.side) {
          FocusBracketSide.winners => (
              AppColors.win,
              'Duas vidas',
              'Se perder, cai na repescagem — não está eliminado.',
            ),
          FocusBracketSide.losers => (
              AppColors.live,
              'Última vida',
              'Uma derrota agora encerra o seu torneio.',
            ),
          FocusBracketSide.eliminated => (
              Colors.white.withValues(alpha: 0.45),
              'Torneio encerrado',
              'Foram duas derrotas nesta categoria.',
            ),
        };

    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenH,
        0,
        AppSpacing.screenH,
        AppSpacing.md,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _LivesStrip(
            lives: standing.lives,
            accent: livesAccent,
            title: livesTitle,
            body: livesBody,
          ),
          const SizedBox(height: AppSpacing.sm),
          // `IntrinsicHeight` é o que torna o `stretch` abaixo legal. Os dois
          // cards precisam terminar na MESMA linha de base — labels diferentes
          // têm alturas diferentes, e sem isso um card ficaria mais curto.
          //
          // Só que `stretch` manda a altura do Row como restrição APERTADA
          // para os filhos, e o Row mora num `ListView` (seção Agora), que dá
          // altura ILIMITADA. Sem medir antes, a restrição saía infinita.
          IntrinsicHeight(
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
        ],
      ),
    );
  }
}

class _LivesStrip extends StatelessWidget {
  const _LivesStrip({
    required this.lives,
    required this.accent,
    required this.title,
    required this.body,
  });

  final int lives;
  final Color accent;
  final String title;
  final String body;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(12),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 14, sigmaY: 14),
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.md,
            vertical: 10,
          ),
          decoration: BoxDecoration(
            color: accent.withValues(alpha: 0.10),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: accent.withValues(alpha: 0.45)),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: _Pips(lives: lives, accent: accent),
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: AppTypography.titleS.copyWith(
                        color: accent,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      body,
                      style: AppTypography.bodyS.copyWith(
                        color: Colors.white.withValues(alpha: 0.62),
                        height: 1.25,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
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
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (var i = 0; i < 2; i++)
          Padding(
            padding: const EdgeInsets.only(right: 4),
            child: Container(
              width: 8,
              height: 8,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: i < lives ? AppColors.win : Colors.transparent,
                border: Border.all(
                  color: i < lives ? AppColors.win : accent,
                  width: 1.5,
                ),
              ),
            ),
          ),
      ],
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
    return ClipRRect(
      borderRadius: BorderRadius.circular(10),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 14, sigmaY: 14),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
          decoration: BoxDecoration(
            color: active
                ? accent.withValues(alpha: 0.12)
                : Colors.white.withValues(alpha: 0.05),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
              color: active
                  ? accent.withValues(alpha: 0.7)
                  : Colors.white.withValues(alpha: 0.10),
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: AppTypography.eyebrow.copyWith(
                  color: active
                      ? accent
                      : Colors.white.withValues(alpha: 0.45),
                  fontSize: 9,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                body,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: AppTypography.bodyS.copyWith(
                  color: active
                      ? Colors.white.withValues(alpha: 0.92)
                      : Colors.white.withValues(alpha: 0.5),
                  fontWeight: active ? FontWeight.w700 : FontWeight.w400,
                  height: 1.2,
                  fontSize: 12,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
