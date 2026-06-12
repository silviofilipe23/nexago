import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';
import '../../domain/products/arena_product.dart';
import '../../domain/products/arena_product_logic.dart';
import '../../domain/products/arena_product_providers.dart';

enum ArenaProductDeleteSheetResult { cancel, deactivate, delete }

/// Bottom sheet para confirmar exclusão de produto (mock 05).
class ArenaProductDeleteSheet extends ConsumerStatefulWidget {
  const ArenaProductDeleteSheet({
    super.key,
    required this.arenaId,
    required this.product,
  });

  final String arenaId;
  final ArenaProduct product;

  static Future<ArenaProductDeleteSheetResult?> show(
    BuildContext context, {
    required String arenaId,
    required ArenaProduct product,
  }) {
    return showModalBottomSheet<ArenaProductDeleteSheetResult>(
      context: context,
      isScrollControlled: true,
      backgroundColor: context.themeColors.surfaceSheet,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) =>
          ArenaProductDeleteSheet(arenaId: arenaId, product: product),
    );
  }

  @override
  ConsumerState<ArenaProductDeleteSheet> createState() =>
      _ArenaProductDeleteSheetState();
}

class _ArenaProductDeleteSheetState
    extends ConsumerState<ArenaProductDeleteSheet> {
  bool _busy = false;

  Future<void> _deactivate() async {
    setState(() => _busy = true);
    try {
      await ref
          .read(arenaProductsRepositoryProvider)
          .deactivateProduct(
            arenaId: widget.arenaId,
            productId: widget.product.id,
          );
      if (!mounted) return;
      Navigator.pop(context, ArenaProductDeleteSheetResult.deactivate);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Erro ao desativar: $e')));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final product = widget.product;
    final inventoryValue = formatInventoryValueReais(
      product.inventoryValueCents,
    );
    final stockLabel = product.stockQuantity == 1
        ? '1 un em estoque'
        : '${product.stockQuantity} un em estoque';

    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: context.themeColors.onSurfaceMuted.withValues(
                    alpha: 0.35,
                  ),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 18),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: context.themeColors.surfaceRaised,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: AppColors.live.withValues(alpha: 0.55),
                    ),
                  ),
                  child: const Icon(
                    Icons.delete_outline_rounded,
                    color: AppColors.live,
                    size: 22,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Excluir produto?',
                        style: theme.textTheme.titleLarge?.copyWith(
                          fontWeight: FontWeight.w800,
                          color: context.themeColors.onSurface,
                          height: 1.2,
                        ),
                      ),
                      const SizedBox(height: 6),
                      RichText(
                        text: TextSpan(
                          style: theme.textTheme.bodyMedium?.copyWith(
                            color: context.themeColors.onSurfaceMuted,
                            fontWeight: FontWeight.w500,
                            height: 1.4,
                          ),
                          children: const [
                            TextSpan(
                              text: 'Sai do catálogo e do cardápio de vendas. ',
                            ),
                            TextSpan(
                              text: 'Não dá pra reverter.',
                              style: TextStyle(
                                color: AppColors.live,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 20),
            _ProductSummaryCard(product: product, stockLabel: stockLabel),
            const SizedBox(height: 20),
            Text(
              'O QUE ACONTECE',
              style: AppTypography.mono(
                color: context.themeColors.onSurfaceMuted,
                fontSize: 10,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.8,
              ),
            ),
            const SizedBox(height: 12),
            _ConsequenceRow(
              icon: Icons.close_rounded,
              iconColor: AppColors.live,
              iconBackground: AppColors.live.withValues(alpha: 0.14),
              title: 'Sai do cardápio na hora',
              subtitle: 'Não poderá mais ser adicionado a comandas',
            ),
            const SizedBox(height: 12),
            _ConsequenceRow(
              icon: Icons.warning_amber_rounded,
              iconColor: AppColors.pending,
              iconBackground: AppColors.pending.withValues(alpha: 0.14),
              title:
                  '${product.stockQuantity} un ($inventoryValue) serão zeradas',
              subtitle: 'O valor em estoque sai do inventário',
            ),
            const SizedBox(height: 12),
            _ConsequenceRow(
              icon: Icons.history_rounded,
              iconColor: AppColors.win,
              iconBackground: AppColors.win.withValues(alpha: 0.14),
              title: 'Histórico de vendas preservado',
              subtitle: 'As vendas passadas continuam nos relatórios',
            ),
            const SizedBox(height: 20),
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(16),
                color: AppColors.brand.withValues(alpha: 0.05),
                border: Border.all(
                  color: AppColors.brand.withValues(alpha: 0.35),
                ),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Prefere só desativar?',
                          style: theme.textTheme.bodyMedium?.copyWith(
                            fontWeight: FontWeight.w800,
                            color: context.themeColors.onSurface,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'Some do cardápio, mas mantém estoque e dados. Dá pra religar quando quiser.',
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: context.themeColors.onSurfaceMuted,
                            fontWeight: FontWeight.w500,
                            height: 1.35,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 12),
                  FilledButton(
                    onPressed: _busy ? null : _deactivate,
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.brand,
                      foregroundColor: AppColors.black,
                      padding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 12,
                      ),
                      minimumSize: const Size(0, 44),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    child: const Text(
                      'Desativar',
                      style: TextStyle(fontWeight: FontWeight.w800),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: _busy
                        ? null
                        : () => Navigator.pop(
                            context,
                            ArenaProductDeleteSheetResult.cancel,
                          ),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: context.themeColors.onSurface,
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      side: BorderSide(
                        color: context.themeColors.onSurfaceMuted.withValues(
                          alpha: 0.3,
                        ),
                      ),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14),
                      ),
                    ),
                    child: const Text(
                      'Voltar',
                      style: TextStyle(fontWeight: FontWeight.w700),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: FilledButton.icon(
                    onPressed: _busy
                        ? null
                        : () => Navigator.pop(
                            context,
                            ArenaProductDeleteSheetResult.delete,
                          ),
                    icon: const Icon(Icons.delete_outline_rounded, size: 18),
                    label: const Text('Excluir produto'),
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.live,
                      foregroundColor: AppColors.white,
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _ProductSummaryCard extends StatelessWidget {
  const _ProductSummaryCard({required this.product, required this.stockLabel});

  final ArenaProduct product;
  final String stockLabel;

  @override
  Widget build(BuildContext context) {
    final emoji = product.emoji?.trim();
    final imageUrl = product.imageUrl?.trim();

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceRaised,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
        ),
      ),
      child: Row(
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(10),
            child: SizedBox(
              width: 48,
              height: 48,
              child: imageUrl != null && imageUrl.isNotEmpty
                  ? CachedNetworkImage(imageUrl: imageUrl, fit: BoxFit.cover)
                  : ColoredBox(
                      color: context.themeColors.surfaceSheet,
                      child: Center(
                        child: Text(
                          emoji == null || emoji.isEmpty ? '📦' : emoji,
                          style: const TextStyle(fontSize: 22),
                        ),
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
                  product.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: context.themeColors.onSurface,
                    fontWeight: FontWeight.w700,
                    fontSize: 15,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  formatPriceReais(product.priceCents),
                  style: const TextStyle(
                    color: AppColors.brand,
                    fontWeight: FontWeight.w700,
                    fontSize: 14,
                  ),
                ),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: context.themeColors.surfaceSheet,
              borderRadius: BorderRadius.circular(999),
            ),
            child: Text(
              stockLabel,
              style: AppTypography.mono(
                color: AppColors.pending,
                fontSize: 11,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ConsequenceRow extends StatelessWidget {
  const _ConsequenceRow({
    required this.icon,
    required this.iconColor,
    required this.iconBackground,
    required this.title,
    required this.subtitle,
  });

  final IconData icon;
  final Color iconColor;
  final Color iconBackground;
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 36,
          height: 36,
          decoration: BoxDecoration(
            color: iconBackground,
            shape: BoxShape.circle,
          ),
          child: Icon(icon, color: iconColor, size: 18),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: TextStyle(
                  color: context.themeColors.onSurface,
                  fontWeight: FontWeight.w700,
                  fontSize: 14,
                  height: 1.25,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                subtitle,
                style: TextStyle(
                  color: context.themeColors.onSurfaceMuted,
                  fontWeight: FontWeight.w500,
                  fontSize: 13,
                  height: 1.35,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
