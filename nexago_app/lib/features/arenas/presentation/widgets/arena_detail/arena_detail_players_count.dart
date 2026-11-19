import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

import '../../../domain/arena_popular_times_providers.dart';
import 'arena_detail_info_sections.dart';

/// "Quem joga aqui": só o total de atletas distintos que jogaram na arena nas
/// últimas semanas (regra de privacidade do dono: nenhum nome, foto ou
/// amigo). Some sem atleta no período.
class ArenaDetailPlayersCount extends ConsumerWidget {
  const ArenaDetailPlayersCount({super.key, required this.arenaId});

  /// Mesma janela do resumo de movimento (`POPULAR_TIMES_WEEKS`).
  static const int weeks = 8;

  final String arenaId;

  static String label(int count) => count == 1
      ? '1 atleta jogou aqui nas últimas $weeks semanas'
      : '$count atletas jogaram aqui nas últimas $weeks semanas';

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final count = ref
            .watch(arenaPopularTimesProvider(arenaId))
            .valueOrNull
            ?.athletesCount ??
        0;
    if (count <= 0) return const SizedBox.shrink();
    final colors = context.themeColors;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 28),
        const ArenaDetailSectionTitle('Quem joga aqui'),
        const SizedBox(height: 10),
        Row(
          children: [
            Icon(Icons.groups_2_outlined, size: 22, color: colors.brandText),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                label(count),
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: colors.onSurface,
                      fontWeight: FontWeight.w700,
                    ),
              ),
            ),
          ],
        ),
      ],
    );
  }
}
