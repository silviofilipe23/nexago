import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

import '../../../domain/arena_plan.dart';
import '../../../domain/arena_plan_providers.dart';

/// Aviso no painel quando a assinatura está em atraso (`overdue`) ou em
/// cancelamento (`canceling`). Silencioso quando `active`/`none`.
class ArenaPlanStatusBanner extends ConsumerWidget {
  const ArenaPlanStatusBanner({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final status =
        ref.watch(managedArenaPlanStatusProvider).valueOrNull ??
            ArenaPlanStatus.none;

    if (!status.isOverdue && !status.isCanceling) {
      return const SizedBox.shrink();
    }

    final until = status.activeUntil;
    final entitled = status.entitled;

    final ({String title, String message, Color color, IconData icon}) content;
    if (status.isOverdue) {
      final deadline = until?.add(arenaOverdueGrace);
      content = entitled
          ? (
              title: 'Pagamento em atraso',
              message:
                  'Regularize${deadline != null ? ' até ${_fmt(deadline)}' : ''} '
                  'para manter os recursos Pro.',
              color: AppColors.pending,
              icon: Icons.warning_amber_rounded,
            )
          : (
              title: 'Recursos Pro suspensos',
              message: 'O pagamento não foi regularizado. Reative para voltar '
                  'a usar PDV, estoque e promoções.',
              color: AppColors.live,
              icon: Icons.lock_clock_rounded,
            );
    } else {
      // canceling: só mostra enquanto ainda tem titularidade.
      if (!entitled) return const SizedBox.shrink();
      content = (
        title: 'Assinatura cancelada',
        message:
            'Você mantém os recursos Pro${until != null ? ' até ${_fmt(until)}' : ''}. '
            'Reative quando quiser.',
        color: AppColors.pending,
        icon: Icons.info_outline_rounded,
      );
    }

    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: Material(
        color: content.color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(14),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: () => context.pushNamed(AppRouteNames.arenaPlan),
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(content.icon, color: content.color, size: 22),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        content.title,
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          fontWeight: FontWeight.w800,
                          color: context.themeColors.onSurface,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        content.message,
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: context.themeColors.onSurfaceMuted,
                          height: 1.35,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Icon(
                  Icons.chevron_right_rounded,
                  color: context.themeColors.onSurfaceMuted,
                  size: 22,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  static String _fmt(DateTime d) =>
      '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}';
}
