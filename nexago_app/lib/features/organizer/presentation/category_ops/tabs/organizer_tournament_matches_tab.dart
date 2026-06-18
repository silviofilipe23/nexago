import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../domain/match_ops/match_ops_providers.dart';
import '../../match_ops/organizer_match_navigation.dart';

/// Aba "Partidas" do detalhe do torneio — a operação do dia integrada ao
/// detalhe: atalho para a programação (grade) e para a central de partidas,
/// com um resumo do estado das partidas.
class OrganizerTournamentMatchesTab extends ConsumerWidget {
  const OrganizerTournamentMatchesTab({super.key, required this.tournamentId});

  final String tournamentId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final matchesAsync =
        ref.watch(organizerTournamentMatchesProvider(tournamentId));

    return matchesAsync.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(child: Text('Erro: $e')),
      data: (matches) {
        if (matches.isEmpty) {
          return const _MatchesEmptyState();
        }
        final live = matches.where((m) => m.isInProgress).length;
        final done = matches.where((m) => m.isCompleted).length;
        final total = matches.length;

        return ListView(
          padding: const EdgeInsets.fromLTRB(20, 4, 20, 24),
          children: [
            Row(
              children: [
                Expanded(child: _StatChip(value: '$total', label: 'Partidas')),
                const SizedBox(width: 10),
                Expanded(
                  child: _StatChip(
                    value: '$live',
                    label: 'Ao vivo',
                    accent: AppColors.live,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _StatChip(
                    value: '$done',
                    label: 'Concluídas',
                    accent: AppColors.win,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            _ActionTile(
              icon: Icons.calendar_month_rounded,
              title: 'Programação do dia',
              subtitle: 'Grade de horários e quadras · agendar partidas',
              accent: true,
              onTap: () =>
                  context.push(organizerMatchSchedulePath(tournamentId)),
            ),
            const SizedBox(height: 10),
            _ActionTile(
              icon: Icons.sports_volleyball_rounded,
              title: 'Central de partidas',
              subtitle: 'Check-in, fila e operação ao vivo',
              onTap: () => context.push(organizerMatchCenterPath(tournamentId)),
            ),
          ],
        );
      },
    );
  }
}

class _StatChip extends StatelessWidget {
  const _StatChip({required this.value, required this.label, this.accent});

  final String value;
  final String label;
  final Color? accent;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            value,
            style: Theme.of(context).textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: accent ?? context.themeColors.onSurface,
                  letterSpacing: -0.3,
                ),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            style: Theme.of(context).textTheme.labelSmall?.copyWith(
                  color: context.themeColors.onSurfaceMuted,
                  fontWeight: FontWeight.w600,
                ),
          ),
        ],
      ),
    );
  }
}

class _ActionTile extends StatelessWidget {
  const _ActionTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
    this.accent = false,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  final bool accent;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: accent
          ? AppColors.brand.withValues(alpha: 0.1)
          : context.themeColors.surfaceCard,
      borderRadius: BorderRadius.circular(16),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: accent
                  ? AppColors.brand.withValues(alpha: 0.35)
                  : context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
            ),
          ),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: accent
                      ? AppColors.brand
                      : context.themeColors.surfaceRaised,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(
                  icon,
                  color: accent ? AppColors.black : AppColors.brand,
                  size: 22,
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: Theme.of(context).textTheme.titleSmall?.copyWith(
                            fontWeight: FontWeight.w800,
                          ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: context.themeColors.onSurfaceMuted,
                            height: 1.3,
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
    );
  }
}

class _MatchesEmptyState extends StatelessWidget {
  const _MatchesEmptyState();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.sports_volleyball_outlined,
              size: 44,
              color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.5),
            ),
            const SizedBox(height: 16),
            Text(
              'Nenhuma partida ainda',
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
            ),
            const SizedBox(height: 8),
            Text(
              'Gere a chave nas categorias para montar a programação dos jogos.',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: context.themeColors.onSurfaceMuted,
                    height: 1.45,
                  ),
            ),
            const SizedBox(height: 4),
            Text(
              'A aba Categorias mostra o que falta.',
              textAlign: TextAlign.center,
              style: AppTypography.mono(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.8),
                letterSpacing: 0.3,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
