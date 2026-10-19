import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'arena_dashboard_tokens.dart';

/// Bloqueio de quadra de uma aula (detalhe da reserva e do horário na agenda).
///
/// No lugar de "Cancelar reserva" e check-in, leva à aula: a chamada e o
/// cancelamento (que libera a quadra) moram lá — a rule recusa à equipe mudar
/// o `status` desse booking. Mesmo comportamento do portal.
class ArenaBookingClassBlockCard extends StatelessWidget {
  const ArenaBookingClassBlockCard({
    super.key,
    required this.classSessionId,
    this.className,
  });

  /// Id em `arenaClassSessions` (igual ao id do booking).
  final String classSessionId;

  /// Rótulo do bloqueio ("Aula · Vôlei Avançado"), quando houver.
  final String? className;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;
    final name = className?.trim();

    return DecoratedBox(
      decoration: ArenaDashboardTokens.cardDecoration(context),
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Text(
                  'Tipo',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: colors.onSurfaceMuted,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    'Aula (bloqueio da quadra)',
                    textAlign: TextAlign.end,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: colors.onSurface,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ],
            ),
            if (name != null && name.isNotEmpty) ...[
              const SizedBox(height: 10),
              Row(
                children: [
                  Text(
                    'Aula',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: colors.onSurfaceMuted,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      name,
                      textAlign: TextAlign.end,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: colors.onSurface,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ],
              ),
            ],
            const SizedBox(height: 12),
            Text(
              'A chamada e o cancelamento ficam na própria aula. Cancelar a '
              'aula libera a quadra na agenda e avisa os alunos.',
              style: theme.textTheme.bodySmall?.copyWith(
                color: colors.onSurfaceMuted,
                height: 1.4,
              ),
            ),
            const SizedBox(height: 14),
            FilledButton.icon(
              onPressed: () => context.pushNamed(
                AppRouteNames.arenaClassSession,
                pathParameters: {'sessionId': classSessionId},
              ),
              icon: const Icon(Icons.school_rounded, size: 18),
              label: const Text('Abrir aula'),
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.brand,
                foregroundColor: AppColors.black,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
