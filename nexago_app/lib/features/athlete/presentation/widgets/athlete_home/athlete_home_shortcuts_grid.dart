import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../../core/router/routes.dart';
import '../../../../../core/theme/app_radii.dart';
import '../../../../../core/theme/app_spacing.dart';
import '../../../../../core/theme/app_typography.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/ui/nexa_card.dart';
import 'athlete_home_section_header.dart';

/// Grid de atalhos da Home (paridade com o painel web). O portal tem
/// "Clubinho" na lista; o app não tem tela de lista do Clubinho, então o
/// slot vira Ranking.
class AthleteHomeShortcutsGrid extends StatelessWidget {
  const AthleteHomeShortcutsGrid({
    super.key,
    required this.onReserveTap,
    required this.onCompeteTap,
  });

  /// Abas do shell — atalho troca de aba em vez de empilhar rota.
  final VoidCallback onReserveTap;
  final VoidCallback onCompeteTap;

  @override
  Widget build(BuildContext context) {
    final shortcuts = <_Shortcut>[
      _Shortcut(
        icon: Icons.add_rounded,
        label: 'Reservar quadra',
        onTap: onReserveTap,
      ),
      _Shortcut(
        icon: Icons.sports_volleyball_outlined,
        label: 'Bora Jogar',
        onTap: () => context.pushNamed(AppRouteNames.friendlyMatchHub),
      ),
      _Shortcut(
        icon: Icons.emoji_events_outlined,
        label: 'Ver torneios',
        onTap: onCompeteTap,
      ),
      _Shortcut(
        icon: Icons.leaderboard_outlined,
        label: 'Ranking',
        onTap: () => context.pushNamed(AppRouteNames.athleteRanking),
      ),
      _Shortcut(
        icon: Icons.history_rounded,
        label: 'Histórico',
        onTap: () => context.pushNamed(AppRouteNames.athleteMatchHistory),
      ),
      // "Compartilhar perfil" (nome do painel) trunca no chip de celular.
      _Shortcut(
        icon: Icons.share_outlined,
        label: 'Meu perfil',
        onTap: () => context.pushNamed(AppRouteNames.athleteProfile),
      ),
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const AthleteHomeSectionHeader(title: 'Atalhos'),
        const SizedBox(height: 10),
        NexaCard(
          padding: const EdgeInsets.all(AppSpacing.md),
          child: Column(
            children: [
              for (var row = 0; row * 2 < shortcuts.length; row++) ...[
                if (row > 0) const SizedBox(height: AppSpacing.sm),
                Row(
                  children: [
                    Expanded(child: _ShortcutChip(shortcut: shortcuts[row * 2])),
                    const SizedBox(width: AppSpacing.sm),
                    Expanded(
                      child: row * 2 + 1 < shortcuts.length
                          ? _ShortcutChip(shortcut: shortcuts[row * 2 + 1])
                          : const SizedBox.shrink(),
                    ),
                  ],
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _Shortcut {
  const _Shortcut({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
}

class _ShortcutChip extends StatelessWidget {
  const _ShortcutChip({required this.shortcut});

  final _Shortcut shortcut;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Material(
      color: colors.surfaceRaised.withValues(alpha: 0.55),
      borderRadius: AppRadii.mdAll,
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: shortcut.onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.md,
            vertical: AppSpacing.md,
          ),
          child: Row(
            children: [
              Icon(shortcut.icon, size: 16, color: colors.brand),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Text(
                  shortcut.label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.labelS.copyWith(
                    color: colors.onSurface,
                    fontSize: 12,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
