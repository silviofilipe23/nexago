import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';
import 'package:nexago_app/core/ui/app_snackbar.dart';

import '../../domain/comandas/arena_comanda.dart';
import '../../domain/comandas/arena_comanda_item.dart';
import '../../domain/comandas/arena_comanda_logic.dart';
import '../../domain/comandas/arena_comanda_providers.dart';
import '../../domain/products/arena_product.dart';
import '../../domain/products/arena_product_logic.dart';
import '../../domain/products/arena_product_providers.dart';
import '../widgets/arena_async_state.dart';
import 'widgets/arena_comanda_product_tile.dart';

class ArenaComandaQuickAddPage extends ConsumerStatefulWidget {
  const ArenaComandaQuickAddPage({
    super.key,
    required this.comandaId,
  });

  final String comandaId;

  @override
  ConsumerState<ArenaComandaQuickAddPage> createState() =>
      _ArenaComandaQuickAddPageState();
}

class _ArenaComandaQuickAddPageState
    extends ConsumerState<ArenaComandaQuickAddPage> {
  ArenaComandaQuickAddCategory _category = ArenaComandaQuickAddCategory.all;
  String _search = '';
  bool _submitting = false;
  bool _searchExpanded = false;
  final _searchController = TextEditingController();
  final _searchFocusNode = FocusNode();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(arenaComandaQuickAddDraftProvider.notifier).reset();
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    _searchFocusNode.dispose();
    super.dispose();
  }

  void _toggleSearch() {
    setState(() {
      _searchExpanded = !_searchExpanded;
      if (!_searchExpanded) {
        _search = '';
        _searchController.clear();
        _searchFocusNode.unfocus();
      }
    });
    if (_searchExpanded) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _searchFocusNode.requestFocus();
      });
    }
  }

  List<ArenaProduct> _filterProducts(List<ArenaProduct> products) {
    final category = quickAddCategoryFilter(_category);
    var filtered = products.where((p) => p.active).toList(growable: false);
    filtered = filterProductsByCategory(filtered, category);
    filtered = sortProductsByName(filtered);
    final query = _search.trim().toLowerCase();
    if (query.isEmpty) return filtered;
    return filtered
        .where((p) => p.name.toLowerCase().contains(query))
        .toList(growable: false);
  }

  int _draftTotalCents(List<ArenaProduct> products, Map<String, int> draft) {
    var total = 0;
    for (final entry in draft.entries) {
      ArenaProduct? product;
      for (final p in products) {
        if (p.id == entry.key) {
          product = p;
          break;
        }
      }
      if (product != null) {
        total += product.priceCents * entry.value;
      }
    }
    return total;
  }

  Future<void> _submit(
    ArenaComanda comanda,
    List<ArenaProduct> products,
    Map<String, int> draft,
  ) async {
    if (draft.isEmpty || _submitting) return;

    setState(() => _submitting = true);
    try {
      final lines = draft.entries
          .map(
            (e) => ArenaComandaAddItemLine(
              productId: e.key,
              quantity: e.value,
            ),
          )
          .toList(growable: false);

      await ref.read(arenaComandasRepositoryProvider).addItemsBatch(
            arenaId: comanda.arenaId,
            comandaId: comanda.id,
            lines: lines,
          );

      ref.read(arenaComandaQuickAddDraftProvider.notifier).reset();
      if (!mounted) return;
      context.pop();
    } catch (e) {
      if (mounted) {
        showAppSnackBar(context, _submitErrorMessage(e));
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final comandaAsync = ref.watch(arenaComandaStreamProvider(widget.comandaId));
    final draft = ref.watch(arenaComandaQuickAddDraftProvider);

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

            final productsAsync =
                ref.watch(arenaProductsStreamProvider(comanda.arenaId));
            final products = productsAsync.valueOrNull ?? const [];
            final filtered = _filterProducts(products);
            final totalItems = draft.values.fold(0, (s, q) => s + q);
            final totalCents = _draftTotalCents(products, draft);

            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(8, 4, 8, 0),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _HeaderIconButton(
                        onTap: () => context.pop(),
                        icon: Icons.arrow_back_rounded,
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              formatComandaContextLabel(comanda),
                              style: AppTypography.mono(
                                color: AppColors.brand,
                                fontSize: 10,
                                fontWeight: FontWeight.w700,
                                letterSpacing: 0.8,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              'Lançamento rápido',
                              style: Theme.of(context)
                                  .textTheme
                                  .headlineSmall
                                  ?.copyWith(
                                    fontWeight: FontWeight.w800,
                                    color: context.themeColors.onSurface,
                                    letterSpacing: -0.3,
                                    height: 1.1,
                                  ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 8),
                      _HeaderIconButton(
                        onTap: _toggleSearch,
                        icon: _searchExpanded
                            ? Icons.close_rounded
                            : Icons.search_rounded,
                      ),
                    ],
                  ),
                ),
                AnimatedSize(
                  duration: const Duration(milliseconds: 200),
                  curve: Curves.easeOutCubic,
                  alignment: Alignment.topCenter,
                  child: _searchExpanded
                      ? Padding(
                          padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
                          child: TextField(
                            controller: _searchController,
                            focusNode: _searchFocusNode,
                            onChanged: (value) =>
                                setState(() => _search = value),
                            style: TextStyle(
                              color: context.themeColors.onSurface,
                              fontSize: 14,
                            ),
                            decoration: InputDecoration(
                              hintText: 'Buscar produto',
                              hintStyle: TextStyle(
                                color: context.themeColors.onSurfaceMuted,
                              ),
                              prefixIcon: Icon(
                                Icons.search_rounded,
                                color: context.themeColors.onSurfaceMuted,
                                size: 20,
                              ),
                              isDense: true,
                              contentPadding: const EdgeInsets.symmetric(
                                vertical: 10,
                              ),
                              filled: true,
                              fillColor: context.themeColors.surfaceRaised,
                              border: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(12),
                                borderSide: BorderSide.none,
                              ),
                            ),
                          ),
                        )
                      : const SizedBox.shrink(),
                ),
                const SizedBox(height: 12),
                SizedBox(
                  height: 36,
                  child: ListView(
                    scrollDirection: Axis.horizontal,
                    padding: const EdgeInsets.symmetric(horizontal: 20),
                    children: [
                      for (final chip in ArenaComandaQuickAddCategory.values)
                        Padding(
                          padding: const EdgeInsets.only(right: 8),
                          child: _CategoryChip(
                            label: quickAddCategoryLabel(chip),
                            selected: _category == chip,
                            onTap: () => setState(() => _category = chip),
                          ),
                        ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                Expanded(
                  child: productsAsync.when(
                    data: (_) {
                      if (filtered.isEmpty) {
                        return const ArenaEmptyState(
                          title: 'Nenhum produto',
                          message: 'Cadastre produtos ou ajuste o filtro.',
                          icon: Icons.inventory_2_outlined,
                        );
                      }
                      return GridView.builder(
                        padding: const EdgeInsets.fromLTRB(20, 0, 20, 160),
                        gridDelegate:
                            const SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: 2,
                          mainAxisSpacing: 12,
                          crossAxisSpacing: 12,
                          childAspectRatio: 0.72,
                        ),
                        itemCount: filtered.length,
                        itemBuilder: (context, index) {
                          final product = filtered[index];
                          final qty = draft[product.id] ?? 0;
                          return ArenaComandaProductTile(
                            product: product,
                            quantity: qty,
                            onIncrement: () {
                              ref
                                  .read(
                                    arenaComandaQuickAddDraftProvider.notifier,
                                  )
                                  .increment(product.id);
                            },
                            onDecrement: qty > 0
                                ? () {
                                    ref
                                        .read(
                                          arenaComandaQuickAddDraftProvider
                                              .notifier,
                                        )
                                        .decrement(product.id);
                                  }
                                : null,
                          );
                        },
                      );
                    },
                    loading: () => const ArenaLoadingState(
                      label: 'Carregando produtos...',
                    ),
                    error: (e, _) => ArenaErrorState(message: '$e'),
                  ),
                ),
                if (totalItems > 0)
                  _DraftPanel(
                    products: products,
                    draft: draft,
                    totalItems: totalItems,
                    totalCents: totalCents,
                    submitting: _submitting,
                    onSubmit: () => _submit(comanda, products, draft),
                    onDecrementProduct: (productId) {
                      ref
                          .read(arenaComandaQuickAddDraftProvider.notifier)
                          .decrement(productId);
                    },
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

String _submitErrorMessage(Object error) {
  if (error is FirebaseException) {
    final detail = error.message?.trim();
    if (error.code == 'permission-denied') {
      return detail?.isNotEmpty == true
          ? detail!
          : 'Sem permissão para lançar itens. Confirme que você é gestor '
              'desta arena.';
    }
    if (detail != null && detail.isNotEmpty) {
      return detail;
    }
  }
  return '$error';
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

class _CategoryChip extends StatelessWidget {
  const _CategoryChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected
          ? AppColors.brand.withValues(alpha: 0.18)
          : context.themeColors.surfaceRaised,
      borderRadius: BorderRadius.circular(999),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          child: Text(
            label,
            style: TextStyle(
              color: selected ? AppColors.brand : context.themeColors.onSurface,
              fontWeight: FontWeight.w700,
              fontSize: 13,
            ),
          ),
        ),
      ),
    );
  }
}

class _DraftPanel extends StatelessWidget {
  const _DraftPanel({
    required this.products,
    required this.draft,
    required this.totalItems,
    required this.totalCents,
    required this.submitting,
    required this.onSubmit,
    required this.onDecrementProduct,
  });

  final List<ArenaProduct> products;
  final Map<String, int> draft;
  final int totalItems;
  final int totalCents;
  final bool submitting;
  final VoidCallback onSubmit;
  final ValueChanged<String> onDecrementProduct;

  @override
  Widget build(BuildContext context) {
    final chips = <Widget>[];
    for (final entry in draft.entries) {
      ArenaProduct? product;
      for (final p in products) {
        if (p.id == entry.key) {
          product = p;
          break;
        }
      }
      if (product == null) continue;
      final resolved = product;
      chips.add(
        _DraftChip(
          label: '${entry.value}x ${resolved.name}',
          onRemove: () => onDecrementProduct(resolved.id),
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.fromLTRB(20, 14, 20, 16),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceRaised,
        border: Border(
          top: BorderSide(
            color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
          ),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Text(
                'A lançar',
                style: Theme.of(context).textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w800,
                      color: context.themeColors.onSurface,
                    ),
              ),
              const SizedBox(width: 8),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: AppColors.brand.withValues(alpha: 0.18),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  '$totalItems itens',
                  style: AppTypography.mono(
                    color: AppColors.brand,
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
          if (chips.isNotEmpty) ...[
            const SizedBox(height: 10),
            SizedBox(
              height: 32,
              child: ListView(
                scrollDirection: Axis.horizontal,
                children: chips,
              ),
            ),
          ],
          const SizedBox(height: 14),
          FilledButton(
            onPressed: submitting ? null : onSubmit,
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.brand,
              foregroundColor: AppColors.black,
              padding: const EdgeInsets.symmetric(vertical: 16),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14),
              ),
            ),
            child: submitting
                ? const SizedBox(
                    width: 22,
                    height: 22,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : Text(
                    'Lançar na comanda · ${formatComandaReais(totalCents)}',
                    style: const TextStyle(fontWeight: FontWeight.w800),
                  ),
          ),
        ],
      ),
    );
  }
}

class _DraftChip extends StatelessWidget {
  const _DraftChip({
    required this.label,
    required this.onRemove,
  });

  final String label;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(right: 8),
      padding: const EdgeInsets.fromLTRB(10, 6, 4, 6),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceCard,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            label,
            style: TextStyle(
              color: context.themeColors.onSurface,
              fontWeight: FontWeight.w600,
              fontSize: 12,
            ),
          ),
          const SizedBox(width: 2),
          Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: onRemove,
              borderRadius: BorderRadius.circular(999),
              child: Padding(
                padding: const EdgeInsets.all(4),
                child: Icon(
                  Icons.remove_circle_outline_rounded,
                  size: 16,
                  color: context.themeColors.onSurfaceMuted,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
