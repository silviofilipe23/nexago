import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/ui/app_snackbar.dart';
import 'package:nexago_app/core/ui/fade_slide_in.dart';

import '../../domain/arena_providers.dart';
import '../../domain/products/arena_product_logic.dart';
import '../../domain/products/arena_product_providers.dart';
import '../../domain/products/arena_stock_movement.dart';
import '../widgets/arena_async_state.dart';
import '../widgets/arena_dashboard_tokens.dart';
import 'widgets/arena_stock_status_badge.dart';

class ArenaRestockPage extends ConsumerStatefulWidget {
  const ArenaRestockPage({
    super.key,
    required this.productId,
  });

  final String productId;

  @override
  ConsumerState<ArenaRestockPage> createState() => _ArenaRestockPageState();
}

class _ArenaRestockPageState extends ConsumerState<ArenaRestockPage> {
  ArenaStockMovementType _type = ArenaStockMovementType.purchase;
  int _quantity = 1;
  bool _saving = false;

  @override
  Widget build(BuildContext context) {
    final managed = ref.watch(managedArenaIdProvider);

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      body: SafeArea(
        child: FadeSlideIn(
          child: managed.when(
            data: (id) {
              if (id == null || id.isEmpty) {
                return const ArenaEmptyState(
                  title: 'Arena não encontrada',
                  message: 'Nenhuma arena vinculada.',
                  icon: Icons.inventory_2_outlined,
                );
              }
              final productAsync = ref.watch(
                arenaProductProvider(
                  (arenaId: id, productId: widget.productId),
                ),
              );
              final movementsAsync = ref.watch(
                arenaProductMovementsProvider(
                  (arenaId: id, productId: widget.productId),
                ),
              );

              return productAsync.when(
                data: (product) {
                  if (product == null) {
                    return const ArenaEmptyState(
                      title: 'Produto não encontrado',
                      message: 'Este item pode ter sido removido.',
                      icon: Icons.inventory_2_outlined,
                    );
                  }

                  final delta = signedDeltaForMovementType(
                    type: _type,
                    quantity: _quantity,
                  );
                  final newTotal = previewRestock(
                    currentQuantity: product.stockQuantity,
                    delta: delta,
                  );
                  final status = productStockStatus(product);

                  return Column(
                    children: [
                      Padding(
                        padding: const EdgeInsets.fromLTRB(8, 4, 20, 0),
                        child: Row(
                          children: [
                            Material(
                              color: context.themeColors.surfaceRaised,
                              borderRadius: BorderRadius.circular(12),
                              clipBehavior: Clip.antiAlias,
                              child: InkWell(
                                onTap: () => context.pop(),
                                child: const SizedBox(
                                  width: 44,
                                  height: 44,
                                  child: Icon(Icons.arrow_back_rounded),
                                ),
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Text(
                                'REPOR · ${product.name.toUpperCase()}',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  color: context.themeColors.onSurfaceMuted,
                                  fontSize: 11,
                                  fontWeight: FontWeight.w700,
                                  letterSpacing: 0.4,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                      Expanded(
                        child: SingleChildScrollView(
                          padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              Text(
                                'Movimentação',
                                style: TextStyle(
                                  color: context.themeColors.onSurface,
                                  fontSize: 24,
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                              const SizedBox(height: 16),
                              Container(
                                padding: const EdgeInsets.all(16),
                                decoration: ArenaDashboardTokens.cardDecoration(
                                  context,
                                ),
                                child: Row(
                                  children: [
                                    Text(
                                      product.emoji == null ||
                                              product.emoji!.isEmpty
                                          ? '📦'
                                          : product.emoji!,
                                      style: const TextStyle(fontSize: 28),
                                    ),
                                    const SizedBox(width: 12),
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          if (status ==
                                              ArenaProductStockStatus.low)
                                            const ArenaStockStatusBadge
                                                .lowStock(),
                                          if (status ==
                                              ArenaProductStockStatus.out)
                                            const ArenaStockStatusBadge
                                                .outOfStock(),
                                          Text(
                                            '${product.stockQuantity} un · mín ${product.minStockQuantity}',
                                            style: TextStyle(
                                              color: context
                                                  .themeColors.onSurface,
                                              fontWeight: FontWeight.w600,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              const SizedBox(height: 20),
                              Text(
                                'Tipo de movimentação',
                                style: TextStyle(
                                  color: context.themeColors.onSurfaceMuted,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                              const SizedBox(height: 10),
                              Wrap(
                                spacing: 8,
                                children: [
                                  ArenaStockMovementType.purchase,
                                  ArenaStockMovementType.adjustment,
                                  ArenaStockMovementType.loss,
                                ].map((type) {
                                  final selected = _type == type;
                                  return ChoiceChip(
                                    label: Text(type.label),
                                    selected: selected,
                                    onSelected: (_) =>
                                        setState(() => _type = type),
                                    selectedColor: AppColors.brand
                                        .withValues(alpha: 0.25),
                                  );
                                }).toList(),
                              ),
                              const SizedBox(height: 20),
                              Text(
                                _type == ArenaStockMovementType.purchase
                                    ? 'Quantidade a entrar'
                                    : 'Quantidade',
                                style: TextStyle(
                                  color: context.themeColors.onSurfaceMuted,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                              const SizedBox(height: 8),
                              Text(
                                'novo total: $newTotal un',
                                style: TextStyle(
                                  color: newTotal < 0
                                      ? AppColors.live
                                      : AppColors.win,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                              const SizedBox(height: 12),
                              Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  _StepButton(
                                    icon: Icons.remove,
                                    onTap: _quantity > 1
                                        ? () => setState(() => _quantity--)
                                        : null,
                                  ),
                                  Padding(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 24,
                                    ),
                                    child: Text(
                                      '$_quantity',
                                      style: TextStyle(
                                        color: context.themeColors.onSurface,
                                        fontSize: 32,
                                        fontWeight: FontWeight.w800,
                                      ),
                                    ),
                                  ),
                                  _StepButton(
                                    icon: Icons.add,
                                    onTap: () =>
                                        setState(() => _quantity++),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 28),
                              Text(
                                'Histórico',
                                style: TextStyle(
                                  color: context.themeColors.onSurface,
                                  fontSize: 18,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                              const SizedBox(height: 12),
                              movementsAsync.when(
                                data: (movements) {
                                  if (movements.isEmpty) {
                                    return Text(
                                      'Nenhuma movimentação registrada.',
                                      style: TextStyle(
                                        color:
                                            context.themeColors.onSurfaceMuted,
                                      ),
                                    );
                                  }
                                  return Column(
                                    children: movements
                                        .map(
                                          (m) => _MovementTile(movement: m),
                                        )
                                        .toList(),
                                  );
                                },
                                loading: () => const Padding(
                                  padding: EdgeInsets.all(16),
                                  child: CircularProgressIndicator(),
                                ),
                                error: (e, _) => Text('$e'),
                              ),
                            ],
                          ),
                        ),
                      ),
                      Padding(
                        padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
                        child: SizedBox(
                          width: double.infinity,
                          height: 52,
                          child: FilledButton(
                            onPressed: _saving || newTotal < 0
                                ? null
                                : () => _submit(id),
                            style: FilledButton.styleFrom(
                              backgroundColor: AppColors.brand,
                              foregroundColor: AppColors.white,
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(14),
                              ),
                            ),
                            child: _saving
                                ? const SizedBox(
                                    width: 22,
                                    height: 22,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                    ),
                                  )
                                : Text(
                                    restockActionLabel(
                                      type: _type,
                                      quantity: delta,
                                    ),
                                    textAlign: TextAlign.center,
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                          ),
                        ),
                      ),
                    ],
                  );
                },
                loading: () =>
                    const ArenaLoadingState(label: 'Carregando produto...'),
                error: (e, _) => ArenaErrorState(message: '$e'),
              );
            },
            loading: () =>
                const ArenaLoadingState(label: 'Carregando arena...'),
            error: (e, _) => ArenaErrorState(message: '$e'),
          ),
        ),
      ),
    );
  }

  Future<void> _submit(String arenaId) async {
    setState(() => _saving = true);
    try {
      await ref.read(arenaProductsRepositoryProvider).registerStockMovement(
            arenaId: arenaId,
            productId: widget.productId,
            type: _type,
            quantity: _quantity,
            note: _type == ArenaStockMovementType.purchase
                ? 'compra fornecedor'
                : null,
          );
      if (!mounted) return;
      showAppSnackBar(context, 'Movimentação registrada.');
      context.pop();
    } catch (e) {
      if (mounted) {
        showAppSnackBar(context, 'Erro: $e', isError: true);
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }
}

class _StepButton extends StatelessWidget {
  const _StepButton({
    required this.icon,
    required this.onTap,
  });

  final IconData icon;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: context.themeColors.surfaceRaised,
      borderRadius: BorderRadius.circular(12),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: SizedBox(
          width: 48,
          height: 48,
          child: Icon(
            icon,
            color: onTap == null
                ? context.themeColors.onSurfaceMuted
                : context.themeColors.onSurface,
          ),
        ),
      ),
    );
  }
}

class _MovementTile extends StatelessWidget {
  const _MovementTile({required this.movement});

  final ArenaStockMovement movement;

  @override
  Widget build(BuildContext context) {
    final dateLabel = movement.createdAt == null
        ? ''
        : _formatMovementDate(movement.createdAt!);

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  movementHistoryTitle(movement),
                  style: TextStyle(
                    color: context.themeColors.onSurface,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                if (dateLabel.isNotEmpty)
                  Text(
                    dateLabel,
                    style: TextStyle(
                      color: context.themeColors.onSurfaceMuted,
                      fontSize: 12,
                    ),
                  ),
              ],
            ),
          ),
          Text(
            formatMovementDelta(movement),
            style: TextStyle(
              color: movement.isInbound ? AppColors.win : AppColors.live,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }

  String _formatMovementDate(DateTime date) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final day = DateTime(date.year, date.month, date.day);
    final time = DateFormat('HH:mm').format(date);
    if (day == today) return 'Hoje · $time';
    if (day == today.subtract(const Duration(days: 1))) {
      return 'Ontem · $time';
    }
    return '${DateFormat('d MMM', 'pt_BR').format(date)} · $time';
  }
}
