import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';
import 'package:nexago_app/core/ui/app_snackbar.dart';

import '../../../domain/comandas/arena_comanda.dart';
import '../../../domain/comandas/arena_comanda_item.dart';
import '../../../domain/comandas/arena_comanda_logic.dart';
import '../../../domain/comandas/arena_comanda_providers.dart';
import '../../widgets/arena_dashboard_tokens.dart';

class ArenaComandaItemsSection extends ConsumerStatefulWidget {
  const ArenaComandaItemsSection({
    super.key,
    required this.comanda,
    required this.items,
  });

  final ArenaComanda comanda;
  final List<ArenaComandaItem> items;

  @override
  ConsumerState<ArenaComandaItemsSection> createState() =>
      _ArenaComandaItemsSectionState();
}

class _ArenaComandaItemsSectionState
    extends ConsumerState<ArenaComandaItemsSection> {
  final _reversingIds = <String>{};

  bool get _canReverseAny =>
      widget.items.any((item) => canReverseComandaItem(widget.comanda, item));

  Future<bool> _confirmReverse(ArenaComandaItem item) async {
    final blockReason = comandaItemReverseBlockReason(widget.comanda, item);
    if (blockReason != null) {
      showAppSnackBar(context, blockReason);
      return false;
    }

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: const Text('Estornar item'),
          content: Text(
            'Remover ${item.quantity}x ${item.productName} '
            '(${formatComandaReais(item.lineTotalCents)}) da comanda?\n\n'
            'O estoque será devolvido quando o produto ainda existir.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancelar'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, true),
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.live,
                foregroundColor: Colors.white,
              ),
              child: const Text('Estornar'),
            ),
          ],
        );
      },
    );

    if (confirmed != true) return false;

    setState(() => _reversingIds.add(item.id));
    try {
      await ref.read(arenaComandasRepositoryProvider).reverseComandaItem(
            arenaId: widget.comanda.arenaId,
            comandaId: widget.comanda.id,
            itemId: item.id,
          );
      if (mounted) {
        showAppSnackBar(context, 'Item estornado.');
      }
      return true;
    } catch (error) {
      if (mounted) {
        showAppSnackBar(context, '$error');
      }
      return false;
    } finally {
      if (mounted) {
        setState(() => _reversingIds.remove(item.id));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final launchCount = widget.items.length;

    return Container(
      decoration: ArenaDashboardTokens.cardDecoration(context),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
            child: Row(
              children: [
                Text(
                  'Consumo',
                  style: theme.textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: context.themeColors.onSurface,
                  ),
                ),
                const Spacer(),
                Text(
                  '$launchCount LANÇAMENTO${launchCount == 1 ? '' : 'S'}',
                  style: AppTypography.mono(
                    color: context.themeColors.onSurfaceMuted,
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.6,
                  ),
                ),
              ],
            ),
          ),
          if (widget.items.isEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 20),
              child: Text(
                'Nenhum item lançado ainda.',
                textAlign: TextAlign.center,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: context.themeColors.onSurfaceMuted,
                ),
              ),
            )
          else
            ...widget.items.map(
              (item) => _ComandaItemTile(
                item: item,
                showDivider: item != widget.items.last,
                canReverse: canReverseComandaItem(widget.comanda, item),
                isReversing: _reversingIds.contains(item.id),
                onConfirmReverse: () => _confirmReverse(item),
              ),
            ),
          if (widget.items.isNotEmpty && _canReverseAny)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 14),
              child: Text(
                'Deslize para estornar um item',
                textAlign: TextAlign.center,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: context.themeColors.onSurfaceMuted.withValues(
                    alpha: 0.7,
                  ),
                  fontStyle: FontStyle.italic,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _ComandaItemTile extends StatelessWidget {
  const _ComandaItemTile({
    required this.item,
    required this.showDivider,
    required this.canReverse,
    required this.isReversing,
    required this.onConfirmReverse,
  });

  final ArenaComandaItem item;
  final bool showDivider;
  final bool canReverse;
  final bool isReversing;
  final Future<bool> Function() onConfirmReverse;

  @override
  Widget build(BuildContext context) {
    final row = _ItemRow(item: item, showDivider: showDivider);

    if (!canReverse) return row;

    return Dismissible(
      key: ValueKey(item.id),
      direction: DismissDirection.endToStart,
      confirmDismiss: (_) => onConfirmReverse(),
      background: Container(
        alignment: Alignment.centerRight,
        padding: const EdgeInsets.only(right: 20),
        color: AppColors.live.withValues(alpha: 0.92),
        child: isReversing
            ? const SizedBox(
                width: 22,
                height: 22,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: Colors.white,
                ),
              )
            : const Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  Icon(Icons.undo_rounded, color: Colors.white),
                  SizedBox(width: 8),
                  Text(
                    'Estornar',
                    style: TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ],
              ),
      ),
      child: row,
    );
  }
}

class _ItemRow extends StatelessWidget {
  const _ItemRow({
    required this.item,
    required this.showDivider,
  });

  final ArenaComandaItem item;
  final bool showDivider;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 14),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 28,
                height: 28,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: AppColors.brand.withValues(alpha: 0.16),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  '${item.quantity}',
                  style: const TextStyle(
                    color: AppColors.brand,
                    fontWeight: FontWeight.w800,
                    fontSize: 13,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      item.productName,
                      style: theme.textTheme.bodyMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                        color: context.themeColors.onSurface,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      formatItemMeta(item),
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: context.themeColors.onSurfaceMuted,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    formatComandaReais(item.lineTotalCents),
                    style: theme.textTheme.bodyMedium?.copyWith(
                      fontWeight: FontWeight.w800,
                      color: context.themeColors.onSurface,
                    ),
                  ),
                  Text(
                    formatItemUnitPrice(item.unitPriceCents),
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: context.themeColors.onSurfaceMuted,
                      fontSize: 11,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
        if (showDivider)
          Divider(
            height: 1,
            indent: 56,
            endIndent: 16,
            color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.1),
          ),
      ],
    );
  }
}
