import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';
import 'package:nexago_app/core/ui/app_snackbar.dart';
import 'package:nexago_app/core/ui/fade_slide_in.dart';

import '../../domain/arena_providers.dart';
import '../../../../core/router/routes.dart';
import '../../domain/products/arena_product.dart';
import '../../domain/products/arena_product_logic.dart';
import '../../domain/products/arena_product_providers.dart';
import '../../domain/products/arena_stock_movement.dart';
import '../../domain/products/arena_stock_movement_registered_args.dart';
import '../widgets/arena_async_state.dart';
import '../widgets/arena_dashboard_tokens.dart';

class ArenaRestockPage extends ConsumerStatefulWidget {
  const ArenaRestockPage({super.key, required this.productId});

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
                arenaProductProvider((
                  arenaId: id,
                  productId: widget.productId,
                )),
              );
              final movementsAsync = ref.watch(
                arenaProductMovementsProvider((
                  arenaId: id,
                  productId: widget.productId,
                )),
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
                  final actionAccent = restockActionAccent(
                    type: _type,
                    quantity: delta,
                  );
                  final actionColors = _RestockActionColors.of(actionAccent);

                  return Column(
                    children: [
                      Padding(
                        padding: const EdgeInsets.fromLTRB(8, 4, 20, 0),
                        child: _RestockHeader(
                          productName: product.name,
                          onBack: () => context.pop(),
                        ),
                      ),
                      Expanded(
                        child: SingleChildScrollView(
                          padding: const EdgeInsets.fromLTRB(
                            ArenaDashboardTokens.horizontalPadding,
                            16,
                            ArenaDashboardTokens.horizontalPadding,
                            24,
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              _ProductStockCard(
                                product: product,
                                status: status,
                              ),
                              const SizedBox(height: 24),
                              const _SectionLabel('TIPO DE MOVIMENTAÇÃO'),
                              const SizedBox(height: 10),
                              Row(
                                children: [
                                  for (final type in const [
                                    ArenaStockMovementType.purchase,
                                    ArenaStockMovementType.adjustment,
                                    ArenaStockMovementType.loss,
                                  ]) ...[
                                    Expanded(
                                      child: _MovementTypeChip(
                                        label: type.label,
                                        selected: _type == type,
                                        onTap: () =>
                                            setState(() => _type = type),
                                      ),
                                    ),
                                    if (type != ArenaStockMovementType.loss)
                                      const SizedBox(width: 8),
                                  ],
                                ],
                              ),
                              const SizedBox(height: 20),
                              Container(
                                padding: const EdgeInsets.all(16),
                                decoration: ArenaDashboardTokens.cardDecoration(
                                  context,
                                ),
                                child: Column(
                                  crossAxisAlignment:
                                      CrossAxisAlignment.stretch,
                                  children: [
                                    Text(
                                      _quantityLabel(_type),
                                      style: TextStyle(
                                        color: context.themeColors.onSurface,
                                        fontWeight: FontWeight.w700,
                                        fontSize: 15,
                                      ),
                                    ),
                                    const SizedBox(height: 6),
                                    Text(
                                      'novo total: $newTotal un',
                                      style: TextStyle(
                                        color: newTotal < 0
                                            ? AppColors.live
                                            : AppColors.win,
                                        fontWeight: FontWeight.w700,
                                        fontSize: 14,
                                      ),
                                    ),
                                    const SizedBox(height: 16),
                                    Row(
                                      mainAxisAlignment:
                                          MainAxisAlignment.center,
                                      children: [
                                        _StepButton(
                                          icon: Icons.remove_rounded,
                                          onTap: _quantity > 1
                                              ? () =>
                                                    setState(() => _quantity--)
                                              : null,
                                        ),
                                        Padding(
                                          padding: const EdgeInsets.symmetric(
                                            horizontal: 28,
                                          ),
                                          child: Text(
                                            '$_quantity',
                                            style: TextStyle(
                                              color:
                                                  context.themeColors.onSurface,
                                              fontSize: 36,
                                              fontWeight: FontWeight.w800,
                                              height: 1,
                                            ),
                                          ),
                                        ),
                                        _StepButton(
                                          icon: Icons.add_rounded,
                                          accent: true,
                                          onTap: () =>
                                              setState(() => _quantity++),
                                        ),
                                      ],
                                    ),
                                  ],
                                ),
                              ),
                              const SizedBox(height: 28),
                              const _SectionLabel('HISTÓRICO'),
                              const SizedBox(height: 10),
                              movementsAsync.when(
                                data: (movements) {
                                  if (movements.isEmpty) {
                                    return Text(
                                      'Nenhuma movimentação registrada.',
                                      style: TextStyle(
                                        color:
                                            context.themeColors.onSurfaceMuted,
                                        fontSize: 13,
                                      ),
                                    );
                                  }
                                  return Container(
                                    decoration:
                                        ArenaDashboardTokens.cardDecoration(
                                          context,
                                        ),
                                    clipBehavior: Clip.antiAlias,
                                    child: Column(
                                      children: [
                                        for (
                                          var i = 0;
                                          i < movements.length;
                                          i++
                                        ) ...[
                                          _MovementTile(movement: movements[i]),
                                          if (i < movements.length - 1)
                                            Divider(
                                              height: 1,
                                              color: context
                                                  .themeColors
                                                  .onSurfaceMuted
                                                  .withValues(alpha: 0.12),
                                            ),
                                        ],
                                      ],
                                    ),
                                  );
                                },
                                loading: () => const Padding(
                                  padding: EdgeInsets.all(16),
                                  child: Center(
                                    child: CircularProgressIndicator(),
                                  ),
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
                                : () => _submit(id, product),
                            style: FilledButton.styleFrom(
                              backgroundColor: actionColors.background,
                              foregroundColor: actionColors.foreground,
                              disabledBackgroundColor: actionColors.background
                                  .withValues(alpha: 0.4),
                              disabledForegroundColor: actionColors.foreground
                                  .withValues(alpha: 0.45),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(14),
                              ),
                            ),
                            child: _saving
                                ? SizedBox(
                                    width: 22,
                                    height: 22,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                      color: actionColors.foreground,
                                    ),
                                  )
                                : Text(
                                    _restockButtonLabel(
                                      type: _type,
                                      quantity: delta,
                                    ),
                                    textAlign: TextAlign.center,
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w800,
                                      fontSize: 15,
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

  String _quantityLabel(ArenaStockMovementType type) {
    return switch (type) {
      ArenaStockMovementType.purchase => 'Quantidade a entrar',
      ArenaStockMovementType.loss => 'Quantidade a sair',
      ArenaStockMovementType.adjustment => 'Quantidade do ajuste',
      ArenaStockMovementType.sale => 'Quantidade',
    };
  }

  String _restockButtonLabel({
    required ArenaStockMovementType type,
    required int quantity,
  }) {
    final label = restockActionLabel(type: type, quantity: quantity);
    return switch (type) {
      ArenaStockMovementType.purchase => '+ $label',
      _ => label,
    };
  }

  Future<void> _submit(String arenaId, ArenaProduct product) async {
    setState(() => _saving = true);
    final delta = signedDeltaForMovementType(type: _type, quantity: _quantity);
    final quantityBefore = product.stockQuantity;
    final quantityAfter = previewRestock(
      currentQuantity: quantityBefore,
      delta: delta,
    );
    try {
      await ref
          .read(arenaProductsRepositoryProvider)
          .registerStockMovement(
            arenaId: arenaId,
            productId: widget.productId,
            type: _type,
            quantity: _quantity,
            note: _type == ArenaStockMovementType.purchase
                ? 'compra fornecedor'
                : null,
          );
      if (!mounted) return;
      context.pushReplacementNamed(
        AppRouteNames.arenaStockMovementRegistered,
        extra: ArenaStockMovementRegisteredArgs(
          productName: product.name,
          productEmoji: product.emoji,
          productImageUrl: product.imageUrl,
          type: _type,
          quantityDelta: delta,
          quantityBefore: quantityBefore,
          quantityAfter: quantityAfter,
          priceCents: product.priceCents,
          registeredAt: DateTime.now(),
        ),
      );
    } catch (e) {
      if (mounted) {
        showAppSnackBar(context, 'Erro: $e', isError: true);
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }
}

class _RestockActionColors {
  const _RestockActionColors({
    required this.background,
    required this.foreground,
  });

  final Color background;
  final Color foreground;

  static _RestockActionColors of(RestockActionAccent accent) {
    return switch (accent) {
      RestockActionAccent.inbound => const _RestockActionColors(
        background: AppColors.win,
        foreground: AppColors.black,
      ),
      RestockActionAccent.adjustment => const _RestockActionColors(
        background: AppColors.brand,
        foreground: AppColors.black,
      ),
      RestockActionAccent.outbound => const _RestockActionColors(
        background: AppColors.live,
        foreground: AppColors.white,
      ),
    };
  }
}

class _RestockHeader extends StatelessWidget {
  const _RestockHeader({required this.productName, required this.onBack});

  final String productName;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Material(
          color: context.themeColors.surfaceRaised,
          borderRadius: BorderRadius.circular(12),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: onBack,
            child: SizedBox(
              width: 44,
              height: 44,
              child: Icon(
                Icons.arrow_back_rounded,
                color: context.themeColors.onSurface,
              ),
            ),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'REPOR · ${productName.toUpperCase()}',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppTypography.mono(
                  color: AppColors.brand,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.8,
                  fontSize: 11,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                'Movimentação',
                style: theme.textTheme.headlineMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.5,
                  color: context.themeColors.onSurface,
                  fontSize: 26,
                  height: 1.05,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: AppTypography.mono(
        color: context.themeColors.onSurfaceMuted,
        fontSize: 10,
        fontWeight: FontWeight.w700,
        letterSpacing: 0.8,
      ),
    );
  }
}

class _ProductStockCard extends StatelessWidget {
  const _ProductStockCard({required this.product, required this.status});

  final ArenaProduct product;
  final ArenaProductStockStatus status;

  @override
  Widget build(BuildContext context) {
    final emoji = product.emoji?.trim();
    final imageUrl = product.imageUrl?.trim();
    final statusLabel = switch (status) {
      ArenaProductStockStatus.out => 'ESGOTADO',
      ArenaProductStockStatus.low => 'ESTOQUE BAIXO',
      ArenaProductStockStatus.ok => null,
    };
    final statusColor = switch (status) {
      ArenaProductStockStatus.out => AppColors.live,
      ArenaProductStockStatus.low => AppColors.pending,
      ArenaProductStockStatus.ok => AppColors.win,
    };

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: ArenaDashboardTokens.cardDecoration(context),
      child: Row(
        children: [
          Container(
            width: 56,
            height: 56,
            decoration: BoxDecoration(
              color: context.themeColors.surfaceRaised,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: context.themeColors.onSurfaceMuted.withValues(
                  alpha: 0.12,
                ),
              ),
            ),
            clipBehavior: Clip.antiAlias,
            child: Stack(
              fit: StackFit.expand,
              children: [
                if (imageUrl == null || imageUrl.isEmpty)
                  CustomPaint(
                    painter: _ThumbStripesPainter(
                      color: context.themeColors.onSurfaceMuted.withValues(
                        alpha: 0.08,
                      ),
                    ),
                  ),
                if (imageUrl != null && imageUrl.isNotEmpty)
                  CachedNetworkImage(imageUrl: imageUrl, fit: BoxFit.cover)
                else
                  Center(
                    child: Text(
                      emoji == null || emoji.isEmpty ? '📦' : emoji,
                      style: const TextStyle(fontSize: 28),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (statusLabel != null) ...[
                  Text(
                    statusLabel,
                    style: AppTypography.mono(
                      color: statusColor,
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.6,
                    ),
                  ),
                  const SizedBox(height: 6),
                ],
                Row(
                  crossAxisAlignment: CrossAxisAlignment.baseline,
                  textBaseline: TextBaseline.alphabetic,
                  children: [
                    Text(
                      '${product.stockQuantity}',
                      style: TextStyle(
                        color: context.themeColors.onSurface,
                        fontSize: 32,
                        fontWeight: FontWeight.w800,
                        height: 1,
                      ),
                    ),
                    const SizedBox(width: 6),
                    Text(
                      'un · mín ${product.minStockQuantity}',
                      style: TextStyle(
                        color: context.themeColors.onSurfaceMuted,
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _MovementTypeChip extends StatelessWidget {
  const _MovementTypeChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final borderColor = selected
        ? AppColors.win
        : colors.onSurfaceMuted.withValues(alpha: 0.22);

    return Material(
      color: colors.surfaceRaised,
      shape: StadiumBorder(
        side: BorderSide(color: borderColor, width: selected ? 1.5 : 1),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 10),
          child: Center(
            child: Text(
              label,
              style: AppTypography.soraRegular(
                color: selected ? AppColors.win : colors.onSurfaceMuted,
                fontSize: 13,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _StepButton extends StatelessWidget {
  const _StepButton({
    required this.icon,
    required this.onTap,
    this.accent = false,
  });

  final IconData icon;
  final VoidCallback? onTap;
  final bool accent;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: accent ? AppColors.win : context.themeColors.surfaceRaised,
      borderRadius: BorderRadius.circular(12),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: SizedBox(
          width: 52,
          height: 52,
          child: Icon(
            icon,
            size: 24,
            color: accent
                ? AppColors.black
                : onTap == null
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
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
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
                    fontSize: 14,
                  ),
                ),
                if (dateLabel.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(
                    dateLabel,
                    style: AppTypography.mono(
                      color: context.themeColors.onSurfaceMuted,
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ],
            ),
          ),
          Text(
            formatMovementDelta(movement),
            style: AppTypography.mono(
              color: _deltaColor(movement),
              fontSize: 14,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }

  Color _deltaColor(ArenaStockMovement movement) {
    if (movement.isInbound) return AppColors.win;
    if (movement.type == ArenaStockMovementType.sale) {
      return AppColors.onSurfaceMuted;
    }
    return AppColors.live;
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

class _ThumbStripesPainter extends CustomPainter {
  const _ThumbStripesPainter({required this.color});

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = 1.2;

    const spacing = 10.0;
    for (var x = -size.height; x < size.width + size.height; x += spacing) {
      canvas.drawLine(
        Offset(x, size.height),
        Offset(x + size.height, 0),
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _ThumbStripesPainter oldDelegate) {
    return oldDelegate.color != color;
  }
}
