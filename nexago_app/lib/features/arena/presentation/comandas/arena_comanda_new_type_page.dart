import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/ui/app_snackbar.dart';

import '../../domain/comandas/arena_comanda.dart';
import '../../domain/comandas/arena_comanda_logic.dart';
import '../../domain/comandas/arena_comanda_providers.dart';
import 'widgets/arena_comanda_stepper.dart';
import 'widgets/arena_comanda_wizard_scaffold.dart';

class ArenaComandaNewTypePage extends ConsumerWidget {
  const ArenaComandaNewTypePage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final draft = ref.watch(arenaComandaDraftProvider);

    return ArenaComandaWizardScaffold(
      stepLabel: 'NOVA COMANDA · PASSO 1 DE 4',
      title: 'Que tipo?',
      currentStep: 0,
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const ArenaComandaStepper(currentStep: 0),
          const SizedBox(height: 24),
          for (final type in ArenaComandaType.values) ...[
            _TypeOptionCard(
              type: type,
              selected: draft.type == type,
              onTap: () {
                if (type != ArenaComandaType.individual) {
                  showAppSnackBar(context, 'Em breve.');
                  return;
                }
                ref.read(arenaComandaDraftProvider.notifier).setType(type);
              },
            ),
            const SizedBox(height: 10),
          ],
        ],
      ),
      footer: ArenaComandaWizardContinueButton(
        label: '→ Continuar',
        enabled: draft.canContinueFromType,
        onPressed: () {
          context.pushNamed(AppRouteNames.arenaComandaNewLink);
        },
      ),
    );
  }
}

class _TypeOptionCard extends StatelessWidget {
  const _TypeOptionCard({
    required this.type,
    required this.selected,
    required this.onTap,
  });

  final ArenaComandaType type;
  final bool selected;
  final VoidCallback onTap;

  String get _title => comandaTypeLabel(type);

  String get _subtitle => switch (type) {
        ArenaComandaType.shared =>
          'Vários atletas dividem a conta da quadra',
        ArenaComandaType.individual =>
          'Um atleta avulso, conta própria',
        ArenaComandaType.table =>
          'Grupo numa mesa do bar ou lounge',
        ArenaComandaType.event =>
          'Aula, clínica ou torneio com turma',
      };

  IconData get _icon => switch (type) {
        ArenaComandaType.shared => Icons.groups_rounded,
        ArenaComandaType.individual => Icons.person_outline_rounded,
        ArenaComandaType.table => Icons.table_bar_rounded,
        ArenaComandaType.event => Icons.emoji_events_outlined,
      };

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: context.themeColors.surfaceRaised,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: selected
                  ? AppColors.brand
                  : context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
              width: selected ? 1.5 : 1,
            ),
          ),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: selected
                      ? AppColors.brand.withValues(alpha: 0.15)
                      : context.themeColors.surfaceSheet,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(_icon, color: AppColors.brand),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _title,
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.w800,
                            color: context.themeColors.onSurface,
                          ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      _subtitle,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: context.themeColors.onSurfaceMuted,
                            height: 1.35,
                          ),
                    ),
                  ],
                ),
              ),
              Icon(
                selected ? Icons.check_circle_rounded : Icons.circle_outlined,
                color: selected
                    ? AppColors.brand
                    : context.themeColors.onSurfaceMuted,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
