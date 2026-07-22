import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../../core/formatting/app_currency_format.dart';
import '../../../../../core/router/routes.dart';
import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../domain/arena_club_providers.dart';
import '../../../domain/arena_club_session.dart';

/// Seção "Clubinho" no detalhe da arena: próximas sessões abertas com vagas.
/// Não renderiza nada quando a arena não tem sessões futuras.
class ArenaDetailClubSection extends ConsumerWidget {
  const ArenaDetailClubSection({super.key, required this.arenaId});

  final String arenaId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sessions =
        ref.watch(arenaUpcomingClubSessionsProvider(arenaId)).valueOrNull ??
            const <ArenaClubSession>[];
    if (sessions.isEmpty) return const SizedBox.shrink();

    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 28),
        Text(
          'Clubinho',
          style: theme.textTheme.titleMedium?.copyWith(
            fontWeight: FontWeight.w800,
            color: context.themeColors.onSurface,
            letterSpacing: -0.3,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          'Jogo aberto: coloque seu nome na lista e pague por sessão.',
          style: theme.textTheme.bodySmall?.copyWith(
            color: context.themeColors.onSurfaceMuted,
          ),
        ),
        const SizedBox(height: 12),
        for (var i = 0; i < sessions.length; i++) ...[
          if (i > 0) const SizedBox(height: 10),
          _ClubSessionCard(session: sessions[i]),
        ],
      ],
    );
  }
}

class _ClubSessionCard extends StatelessWidget {
  const _ClubSessionCard({required this.session});

  final ArenaClubSession session;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isFull = session.isFull;
    final spotsLabel = isFull
        ? 'Lista cheia'
        : '${session.spotsLeft} vaga${session.spotsLeft == 1 ? '' : 's'}';

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: () => context.pushNamed(
          AppRouteNames.clubSession,
          pathParameters: {'sessionId': session.id},
        ),
        borderRadius: BorderRadius.circular(16),
        child: Ink(
          decoration: BoxDecoration(
            color: context.themeColors.surfaceCard,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color:
                  context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
            ),
          ),
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(
              children: [
                Container(
                  width: 42,
                  height: 42,
                  decoration: BoxDecoration(
                    color: AppColors.brand.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Icon(
                    Icons.groups_rounded,
                    color: AppColors.brand,
                    size: 22,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        session.clubName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w800,
                          color: context.themeColors.onSurface,
                        ),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        '${session.dateShortLabel} · '
                        '${session.timeRangeLabel} · $spotsLabel',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: isFull
                              ? AppColors.live
                              : context.themeColors.onSurfaceMuted,
                          fontWeight:
                              isFull ? FontWeight.w700 : FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      formatBRL(session.priceReais),
                      style: theme.textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w800,
                        color: context.themeColors.onSurface,
                      ),
                    ),
                    Text(
                      'por atleta',
                      style: theme.textTheme.labelSmall?.copyWith(
                        color: context.themeColors.onSurfaceMuted,
                      ),
                    ),
                  ],
                ),
                const SizedBox(width: 2),
                Icon(
                  Icons.chevron_right_rounded,
                  color: context.themeColors.onSurfaceMuted,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
