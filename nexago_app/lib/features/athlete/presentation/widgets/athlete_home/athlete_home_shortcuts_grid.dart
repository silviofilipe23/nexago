import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../../core/router/routes.dart';
import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_radii.dart';
import '../../../../../core/theme/app_typography.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../athlete_training/application/athlete_training_providers.dart';

/// Linha de atalhos da Home: Reservar, Ranking, Treinos, Torneios e Meus
/// torneios. O atalho
/// com novidade (contador > 0) ganha destaque laranja e o selo do contador.
class AthleteHomeShortcutsGrid extends ConsumerWidget {
  const AthleteHomeShortcutsGrid({
    super.key,
    required this.onReserveTap,
    required this.onCompeteTap,
  });

  /// Abas do shell — atalho troca de aba em vez de empilhar rota.
  final VoidCallback onReserveTap;
  final VoidCallback onCompeteTap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final trainingBadge = ref.watch(athleteTrainingNewFeedbackCountProvider);
    final shortcuts = <_Shortcut>[
      _Shortcut(
        key: const Key('home-shortcut-reserve'),
        icon: Icons.add_circle_outline_rounded,
        label: 'Reservar',
        onTap: onReserveTap,
      ),
      _Shortcut(
        key: const Key('home-shortcut-ranking'),
        icon: Icons.leaderboard_outlined,
        label: 'Ranking',
        onTap: () => context.pushNamed(AppRouteNames.athleteRanking),
      ),
      _Shortcut(
        key: const Key('home-shortcut-trainings'),
        icon: Icons.sports_rounded,
        label: 'Treinos',
        badge: trainingBadge,
        onTap: () => context.pushNamed(AppRouteNames.athleteTrainings),
      ),
      _Shortcut(
        key: const Key('home-shortcut-tournaments'),
        icon: Icons.emoji_events_outlined,
        label: 'Torneios',
        onTap: onCompeteTap,
      ),
      _Shortcut(
        key: const Key('home-shortcut-my-tournaments'),
        icon: Icons.confirmation_number_outlined,
        label: 'Meus torneios',
        onTap: () => context.pushNamed(AppRouteNames.myTournaments),
      ),
    ];

    return Row(
      children: [
        for (var i = 0; i < shortcuts.length; i++) ...[
          if (i > 0) const SizedBox(width: 6),
          Expanded(child: _ShortcutTile(shortcut: shortcuts[i])),
        ],
      ],
    );
  }
}

class _Shortcut {
  const _Shortcut({
    required this.key,
    required this.icon,
    required this.label,
    required this.onTap,
    this.badge = 0,
  });

  final Key key;
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final int badge;
}

class _ShortcutTile extends StatelessWidget {
  const _ShortcutTile({required this.shortcut});

  final _Shortcut shortcut;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final highlighted = shortcut.badge > 0;
    final foreground = highlighted ? colors.brandText : colors.onSurface;
    return Semantics(
      button: true,
      label: highlighted
          ? '${shortcut.label}, ${shortcut.badge} novidades'
          : shortcut.label,
      excludeSemantics: true,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Material(
            color: highlighted
                ? AppColors.brand.withValues(alpha: 0.14)
                : colors.surfaceRaised.withValues(alpha: 0.55),
            shape: RoundedRectangleBorder(
              borderRadius: AppRadii.mdAll,
              side: BorderSide(
                color: highlighted
                    ? AppColors.brand.withValues(alpha: 0.7)
                    : colors.onSurface.withValues(alpha: 0.08),
              ),
            ),
            clipBehavior: Clip.antiAlias,
            child: InkWell(
              key: shortcut.key,
              onTap: shortcut.onTap,
              // Altura fixa: com cinco na linha o tile não é quadrado, e
              // "Meus torneios" quebra em duas linhas.
              child: SizedBox(
                width: double.infinity,
                height: 84,
                // Tile estreito (telas de 320px) cai para 10px: "Reservar" e
                // "Torneios" medem ~52px a 11px na Sora.
                child: LayoutBuilder(
                  builder: (context, box) => Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(shortcut.icon, size: 22, color: foreground),
                      const SizedBox(height: 6),
                      Text(
                        shortcut.label,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        textAlign: TextAlign.center,
                        style: AppTypography.labelS.copyWith(
                          color: foreground,
                          fontSize: box.maxWidth < 56 ? 10 : 11,
                          height: 1.15,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
          if (highlighted)
            Positioned(
              top: 6,
              right: 6,
              child: Container(
                key: Key('${(shortcut.key as ValueKey<String>).value}-badge'),
                constraints: const BoxConstraints(minWidth: 18),
                height: 18,
                padding: const EdgeInsets.symmetric(horizontal: 5),
                alignment: Alignment.center,
                decoration: const BoxDecoration(
                  color: AppColors.brand,
                  borderRadius: BorderRadius.all(Radius.circular(9)),
                ),
                child: Text(
                  shortcut.badge > 9 ? '9+' : '${shortcut.badge}',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    height: 1,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
