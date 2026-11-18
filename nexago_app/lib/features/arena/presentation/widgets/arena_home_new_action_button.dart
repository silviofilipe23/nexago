import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

import '../../domain/arena_access_providers.dart';
import '../../domain/arena_staff_role.dart';

/// Uma ação do botão "+" do Painel.
class ArenaHomeNewAction {
  const ArenaHomeNewAction({
    required this.icon,
    required this.label,
    required this.hint,
    required this.run,
  });

  final IconData icon;
  final String label;
  final String hint;
  final void Function(BuildContext context) run;
}

/// Ações do "+" que o cargo pode usar: some quem não pode escrever (ou, nas
/// aulas, ler) a área — sem nenhuma, o botão nem aparece.
final arenaHomeNewActionsProvider =
    Provider.autoDispose<List<ArenaHomeNewAction>>((ref) {
  final canComandas = ref.watch(arenaCanWriteProvider(ArenaArea.comandas));
  final canAgenda = ref.watch(arenaCanWriteProvider(ArenaArea.agenda));
  final canSeeAgenda = ref.watch(arenaCanReadProvider(ArenaArea.agenda));
  return [
    if (canAgenda)
      ArenaHomeNewAction(
        icon: Icons.add_circle_outline_rounded,
        label: 'Reservar ou bloquear horário',
        hint: 'Escolha o horário na agenda',
        run: (c) => c.go(AppRoutes.arenaSchedule),
      ),
    if (canComandas)
      ArenaHomeNewAction(
        icon: Icons.receipt_long_rounded,
        label: 'Abrir comanda',
        hint: 'Avulsa, de mesa ou ligada a uma reserva',
        run: (c) => c.pushNamed(AppRouteNames.arenaComandaNewType),
      ),
    if (canSeeAgenda)
      ArenaHomeNewAction(
        icon: Icons.school_rounded,
        label: 'Aulas de hoje',
        hint: 'Chamada e turmas',
        run: (c) => c.pushNamed(AppRouteNames.arenaClasses),
      ),
  ];
});

/// Botão "+" flutuante do Painel (acima da barra inferior do shell).
class ArenaHomeNewActionButton extends ConsumerWidget {
  const ArenaHomeNewActionButton({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final actions = ref.watch(arenaHomeNewActionsProvider);
    if (actions.isEmpty) return const SizedBox.shrink();
    return FloatingActionButton(
      tooltip: 'Nova ação',
      backgroundColor: AppColors.brand,
      foregroundColor: AppColors.black,
      elevation: 2,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
      onPressed: () => _open(context, actions),
      child: const Icon(Icons.add_rounded, size: 28),
    );
  }

  Future<void> _open(
    BuildContext context,
    List<ArenaHomeNewAction> actions,
  ) async {
    final picked = await showModalBottomSheet<ArenaHomeNewAction>(
      context: context,
      showDragHandle: true,
      backgroundColor: context.themeColors.surfaceSheet,
      builder: (sheet) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (final a in actions)
              ListTile(
                leading: Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: AppColors.brand.withValues(alpha: 0.14),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(a.icon, color: sheet.themeColors.brandText),
                ),
                title: Text(
                  a.label,
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
                subtitle: Text(a.hint),
                onTap: () => Navigator.of(sheet).pop(a),
              ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
    if (picked == null || !context.mounted) return;
    picked.run(context);
  }
}
