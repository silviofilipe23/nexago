import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';
import 'package:nexago_app/core/ui/app_snackbar.dart';

import '../../domain/arena_plan.dart';
import '../../domain/arena_plan_providers.dart';
import '../../domain/comandas/arena_comanda.dart';
import '../../domain/comandas/arena_comanda_closed_args.dart';
import '../../domain/comandas/arena_comanda_logic.dart';
import '../../domain/comandas/arena_comanda_providers.dart';
import '../plan/widgets/arena_plan_gate.dart';
import '../widgets/arena_async_state.dart';
import 'widgets/arena_comanda_items_section.dart';
import 'widgets/arena_comanda_summary_card.dart';

class ArenaComandaDetailPage extends ConsumerWidget {
  const ArenaComandaDetailPage({
    super.key,
    required this.comandaId,
  });

  final String comandaId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final comandaAsync = ref.watch(arenaComandaStreamProvider(comandaId));
    final itemsAsync = ref.watch(arenaComandaItemsStreamProvider(comandaId));

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      body: SafeArea(
        child: comandaAsync.when(
          data: (comanda) {
            if (comanda == null) {
              return const ArenaEmptyState(
                title: 'Comanda não encontrada',
                message: 'Este registro pode ter sido removido.',
                icon: Icons.receipt_long_outlined,
              );
            }

            final items = itemsAsync.valueOrNull ?? const [];
            final canClose = comanda.totalCents > 0;
            final canCloseEmpty = canCloseEmptyComanda(comanda);

            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(8, 4, 8, 0),
                  child: Row(
                    children: [
                      _HeaderIconButton(
                        icon: Icons.arrow_back_rounded,
                        onTap: () {
                          if (context.canPop()) {
                            context.pop();
                          } else {
                            context.goNamed(AppRouteNames.arenaComandas);
                          }
                        },
                      ),
                      Expanded(
                        child: Column(
                          children: [
                            Text(
                              formatComandaHeaderSubtitle(comanda),
                              style: AppTypography.mono(
                                color: AppColors.brand,
                                fontSize: 10,
                                fontWeight: FontWeight.w700,
                                letterSpacing: 0.8,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              'Comanda ${formatComandaNumber(comanda.displayNumber)}',
                              style: Theme.of(context)
                                  .textTheme
                                  .titleMedium
                                  ?.copyWith(
                                    fontWeight: FontWeight.w800,
                                    color: context.themeColors.onSurface,
                                  ),
                            ),
                          ],
                        ),
                      ),
                      _HeaderIconButton(
                        icon: Icons.more_horiz_rounded,
                        onTap: () {
                          showAppSnackBar(context, 'Em breve.');
                        },
                      ),
                    ],
                  ),
                ),
                Expanded(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.fromLTRB(20, 20, 20, 16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        ArenaComandaSummaryCard(comanda: comanda),
                        const SizedBox(height: 16),
                        ArenaComandaItemsSection(comanda: comanda, items: items),
                      ],
                    ),
                  ),
                ),
                Container(
                  padding: const EdgeInsets.fromLTRB(20, 12, 20, 16),
                  decoration: BoxDecoration(
                    color: context.themeColors.surfaceRaised,
                    border: Border(
                      top: BorderSide(
                        color: context.themeColors.onSurfaceMuted.withValues(
                          alpha: 0.12,
                        ),
                      ),
                    ),
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: OutlinedButton(
                          onPressed: () {
                            final entitled = ref
                                .read(managedArenaCapabilitiesProvider)
                                .contains(ArenaCapability.pdvComandas);
                            if (!entitled) {
                              showArenaPlanUpsellSheet(
                                context,
                                capability: ArenaCapability.pdvComandas,
                              );
                              return;
                            }
                            context.pushNamed(
                              AppRouteNames.arenaComandaQuickAdd,
                              pathParameters: {'comandaId': comandaId},
                            );
                          },
                          style: OutlinedButton.styleFrom(
                            foregroundColor: context.themeColors.onSurface,
                            padding: const EdgeInsets.symmetric(vertical: 16),
                            side: BorderSide(
                              color: context.themeColors.onSurfaceMuted
                                  .withValues(alpha: 0.3),
                            ),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(14),
                            ),
                          ),
                          child: const Text(
                            'Adicionar',
                            style: TextStyle(fontWeight: FontWeight.w800),
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: FilledButton(
                          onPressed: canClose
                              ? () {
                                  context.pushNamed(
                                    AppRouteNames.arenaComandaPayment,
                                    pathParameters: {'comandaId': comandaId},
                                  );
                                }
                              : canCloseEmpty
                                  ? () => _closeEmptyComanda(
                                        context,
                                        ref,
                                        comandaId: comandaId,
                                        comanda: comanda,
                                      )
                                  : null,
                          style: FilledButton.styleFrom(
                            backgroundColor: AppColors.brand,
                            foregroundColor: AppColors.black,
                            disabledBackgroundColor:
                                AppColors.brand.withValues(alpha: 0.35),
                            padding: const EdgeInsets.symmetric(vertical: 16),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(14),
                            ),
                          ),
                          child: Text(
                            canCloseEmpty && !canClose
                                ? 'Fechar comanda'
                                : 'Fechar conta →',
                            style: const TextStyle(fontWeight: FontWeight.w800),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            );
          },
          loading: () =>
              const ArenaLoadingState(label: 'Carregando comanda...'),
          error: (e, _) => ArenaErrorState(message: '$e'),
        ),
      ),
    );
  }
}

Future<void> _closeEmptyComanda(
  BuildContext context,
  WidgetRef ref, {
  required String comandaId,
  required ArenaComanda comanda,
}) async {
  final confirmed = await showDialog<bool>(
    context: context,
    builder: (context) {
      return AlertDialog(
        title: const Text('Fechar comanda sem consumo?'),
        content: Text(
          'Nenhum item foi lançado em "${comanda.customerName}". '
          'Ela será marcada como fechada e sai da lista de comandas abertas.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Fechar comanda'),
          ),
        ],
      );
    },
  );

  if (confirmed != true || !context.mounted) return;

  try {
    final updated = await ref
        .read(arenaComandasRepositoryProvider)
        .closeEmptyComanda(comandaId: comandaId);

    if (!context.mounted) return;
    context.pushReplacementNamed(
      AppRouteNames.arenaComandaClosed,
      pathParameters: {'comandaId': comandaId},
      extra: ArenaComandaClosedArgs(comanda: updated, payments: const []),
    );
  } catch (e) {
    if (context.mounted) showAppSnackBar(context, '$e');
  }
}

class _HeaderIconButton extends StatelessWidget {
  const _HeaderIconButton({
    required this.icon,
    required this.onTap,
  });

  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: context.themeColors.surfaceRaised,
      borderRadius: BorderRadius.circular(12),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: SizedBox(
          width: 44,
          height: 44,
          child: Icon(icon, color: context.themeColors.onSurface),
        ),
      ),
    );
  }
}
