import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

import '../../domain/arena_access_providers.dart';
import '../../domain/arena_staff_role.dart';

/// Ações rápidas operacionais no topo do Painel — o gestor age sem caçar a aba
/// certa (abrir comanda, bloquear horário, ver as reservas de hoje).
///
/// Cada atalho só aparece pra quem tem a permissão correspondente: some quem
/// não pode escrever (ou, no caso das reservas, nem ler) na área — a linha
/// inteira some quando nenhum atalho sobra.
class ArenaDashboardQuickActions extends ConsumerWidget {
  const ArenaDashboardQuickActions({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final canComandas = ref.watch(arenaCanWriteProvider(ArenaArea.comandas));
    final canAgenda = ref.watch(arenaCanWriteProvider(ArenaArea.agenda));
    final canSeeBookings = ref.watch(arenaCanReadProvider(ArenaArea.agenda));

    final actions = <Widget>[
      if (canComandas)
        _QuickAction(
          icon: Icons.receipt_long_rounded,
          label: 'Abrir\ncomanda',
          accent: true,
          onTap: () => context.pushNamed(AppRouteNames.arenaComandaNewType),
        ),
      if (canAgenda)
        _QuickAction(
          icon: Icons.event_busy_rounded,
          label: 'Bloquear\nhorário',
          onTap: () => context.go(AppRoutes.arenaSchedule),
        ),
      if (canSeeBookings)
        _QuickAction(
          icon: Icons.today_rounded,
          label: 'Reservas\nde hoje',
          onTap: () => context.go(AppRoutes.arenaBookings),
        ),
    ];
    if (actions.isEmpty) return const SizedBox.shrink();
    return Row(
      children: [
        for (var i = 0; i < actions.length; i++) ...[
          if (i > 0) const SizedBox(width: 10),
          Expanded(child: actions[i]),
        ],
      ],
    );
  }
}

class _QuickAction extends StatelessWidget {
  const _QuickAction({
    required this.icon,
    required this.label,
    required this.onTap,
    this.accent = false,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool accent;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Material(
      color: accent
          ? AppColors.brand.withValues(alpha: 0.12)
          : colors.surfaceCard,
      borderRadius: BorderRadius.circular(16),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: accent
                  ? AppColors.brand.withValues(alpha: 0.3)
                  : colors.onSurfaceMuted.withValues(alpha: 0.12),
            ),
          ),
          child: Column(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: accent ? AppColors.brand : colors.surfaceRaised,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(
                  icon,
                  size: 20,
                  color: accent ? AppColors.black : AppColors.brand,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                label,
                textAlign: TextAlign.center,
                maxLines: 2,
                style: Theme.of(context).textTheme.labelSmall?.copyWith(
                      fontWeight: FontWeight.w700,
                      height: 1.2,
                      color: colors.onSurface,
                    ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
