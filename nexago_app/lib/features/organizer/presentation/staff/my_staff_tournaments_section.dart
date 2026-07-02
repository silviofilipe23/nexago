import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../domain/tournament_staff/my_tournament_staff_providers.dart';
import '../../domain/tournament_staff/tournament_staff_models.dart';
import '../category_ops/organizer_tournament_navigation.dart';

/// Lista os torneios em que o usuário atua como staff (gestor/mesário).
/// Renderiza nada quando não há torneios — seguro de embutir em qualquer tela.
class MyStaffTournamentsSection extends ConsumerWidget {
  const MyStaffTournamentsSection({super.key, this.horizontalPadding = 20});

  /// Zere quando a tela hospedeira já aplica padding horizontal próprio.
  final double horizontalPadding;

  void _open(BuildContext context, MyTournamentStaffEntry entry) {
    final router = GoRouter.of(context);
    if (entry.role == TournamentStaffRole.scorer) {
      pushOrganizerTournamentOperations(
        router,
        tournamentId: entry.tournamentId,
      );
    } else {
      pushOrganizerTournamentDetail(router, entry.tournamentId);
    }
  }

  static String _formatDate(DateTime date) {
    final dd = date.day.toString().padLeft(2, '0');
    final mm = date.month.toString().padLeft(2, '0');
    return '$dd/$mm/${date.year}';
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final entries =
        ref.watch(myTournamentStaffEntriesProvider).valueOrNull ?? const [];
    if (entries.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: EdgeInsets.fromLTRB(horizontalPadding, 20, horizontalPadding, 10),
          child: Text(
            'TORNEIOS QUE EU OPERO',
            style: AppTypography.mono(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: context.themeColors.onSurfaceMuted,
              letterSpacing: 1.2,
            ),
          ),
        ),
        for (final entry in entries)
          Padding(
            padding: EdgeInsets.fromLTRB(
              horizontalPadding,
              0,
              horizontalPadding,
              10,
            ),
            child: Material(
              color: context.themeColors.surfaceRaised,
              borderRadius: BorderRadius.circular(16),
              child: InkWell(
                onTap: () => _open(context, entry),
                borderRadius: BorderRadius.circular(16),
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 14,
                  ),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(
                      color: context.themeColors.onSurfaceMuted
                          .withValues(alpha: 0.12),
                    ),
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 40,
                        height: 40,
                        decoration: BoxDecoration(
                          color: AppColors.brand.withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Icon(
                          entry.role == TournamentStaffRole.scorer
                              ? Icons.scoreboard_rounded
                              : Icons.manage_accounts_rounded,
                          size: 20,
                          color: AppColors.brand,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              entry.tournamentName.isNotEmpty
                                  ? entry.tournamentName
                                  : 'Torneio',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                fontWeight: FontWeight.w700,
                                fontSize: 15,
                                color: context.themeColors.onSurface,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              [
                                entry.role.label,
                                if (entry.startAt != null)
                                  _formatDate(entry.startAt!),
                              ].join(' · '),
                              style: TextStyle(
                                fontSize: 12,
                                color: context.themeColors.onSurfaceMuted,
                              ),
                            ),
                          ],
                        ),
                      ),
                      Icon(
                        Icons.chevron_right_rounded,
                        color: context.themeColors.onSurfaceMuted,
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}
