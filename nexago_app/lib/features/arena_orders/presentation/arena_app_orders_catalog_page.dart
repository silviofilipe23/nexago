import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../../core/ui/app_status_views.dart';
import '../../arena/domain/comandas/arena_comanda.dart';
import '../../arena/domain/comandas/arena_comanda_logic.dart';
import '../../arena/domain/comandas/arena_comanda_providers.dart';
import '../../arena/domain/products/arena_product.dart';
import '../../arena/domain/products/arena_product_logic.dart';
import '../../arena/domain/products/arena_product_providers.dart';
import '../domain/arena_app_orders_providers.dart';

/// Peça na quadra — catálogo de produtos da arena (lado atleta), com botão
/// para lançar consumo direto na comanda em andamento vinculada à reserva.
/// Fechamento/pagamento da comanda continua sendo feito no balcão pelo
/// gestor; esta tela só ADICIONA itens.
class ArenaAppOrdersCatalogPage extends ConsumerStatefulWidget {
  const ArenaAppOrdersCatalogPage({
    super.key,
    required this.arenaId,
    required this.bookingId,
    required this.arenaName,
  });

  final String arenaId;
  final String bookingId;
  final String arenaName;

  @override
  ConsumerState<ArenaAppOrdersCatalogPage> createState() =>
      _ArenaAppOrdersCatalogPageState();
}

class _ArenaAppOrdersCatalogPageState
    extends ConsumerState<ArenaAppOrdersCatalogPage> {
  String? _addingProductId;

  Future<void> _addProduct(ArenaProduct product) async {
    if (_addingProductId != null) return;
    setState(() => _addingProductId = product.id);
    try {
      final comanda = await ref.read(
        arenaComandaByBookingIdStreamProvider(widget.bookingId).future,
      );
      if (comanda == null) {
        throw StateError('Nenhuma comanda aberta para esta reserva ainda.');
      }
      await ref.read(arenaAppOrdersServiceProvider).addItem(
            arenaId: widget.arenaId,
            comandaId: comanda.id,
            productId: product.id,
            quantity: 1,
          );
      if (!mounted) return;
      showAppSnackBar(context, '${product.name} adicionado à comanda.');
    } catch (e) {
      if (!mounted) return;
      showAppSnackBar(context, 'Não foi possível pedir: $e', isError: true);
    } finally {
      if (mounted) setState(() => _addingProductId = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final comandaAsync = ref.watch(
      arenaComandaByBookingIdStreamProvider(widget.bookingId),
    );
    final productsAsync = ref.watch(
      arenaProductsStreamProvider(widget.arenaId),
    );

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      appBar: AppBar(
        title: Text(
          widget.arenaName.trim().isNotEmpty
              ? 'Peça na quadra · ${widget.arenaName.trim()}'
              : 'Peça na quadra',
        ),
      ),
      body: comandaAsync.when(
        loading: () => const AppLoadingView(message: 'Carregando comanda...'),
        error: (e, _) => AppErrorView(
          title: 'Não foi possível carregar sua comanda',
          message: e.toString().replaceFirst('Exception: ', ''),
          onRetry: () =>
              ref.invalidate(arenaComandaByBookingIdStreamProvider(widget.bookingId)),
        ),
        data: (comanda) {
          if (comanda == null) {
            return const AppEmptyView(
              icon: Icons.receipt_long_outlined,
              title: 'Nenhuma comanda aberta',
              subtitle:
                  'Peça ao balcão para abrir sua comanda vinculada a esta '
                  'reserva. Depois disso você pode pedir direto pelo app.',
            );
          }
          if (!comanda.allowAppOrders) {
            return const AppEmptyView(
              icon: Icons.block_outlined,
              title: 'Pedidos pelo app desativados',
              subtitle:
                  'Esta comanda não está liberada para pedidos pelo app. '
                  'Chame o garçom para lançar seu consumo no balcão.',
            );
          }
          if (!comanda.status.isActive) {
            return const AppEmptyView(
              icon: Icons.lock_clock_outlined,
              title: 'Comanda fechada',
              subtitle: 'Esta comanda já foi fechada no balcão.',
            );
          }

          return Column(
            children: [
              Expanded(
                child: productsAsync.when(
                  loading: () =>
                      const AppLoadingView(message: 'Carregando cardápio...'),
                  error: (e, _) => AppErrorView(
                    title: 'Não foi possível carregar o cardápio',
                    message: e.toString().replaceFirst('Exception: ', ''),
                    onRetry: () =>
                        ref.invalidate(arenaProductsStreamProvider(widget.arenaId)),
                  ),
                  data: (products) {
                    final active = sortProductsByName(
                      products.where((p) => p.active).toList(),
                    );
                    if (active.isEmpty) {
                      return const AppEmptyView(
                        icon: Icons.storefront_outlined,
                        title: 'Cardápio vazio',
                        subtitle: 'Esta arena ainda não cadastrou produtos.',
                      );
                    }
                    return ListView.separated(
                      padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
                      itemCount: active.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 10),
                      itemBuilder: (context, index) {
                        final product = active[index];
                        return _ProductTile(
                          product: product,
                          adding: _addingProductId == product.id,
                          onAdd: () => _addProduct(product),
                        );
                      },
                    );
                  },
                ),
              ),
              _ComandaTotalBar(comanda: comanda),
            ],
          );
        },
      ),
    );
  }
}

class _ProductTile extends StatelessWidget {
  const _ProductTile({
    required this.product,
    required this.adding,
    required this.onAdd,
  });

  final ArenaProduct product;
  final bool adding;
  final VoidCallback onAdd;

  @override
  Widget build(BuildContext context) {
    final outOfStock = productStockStatus(product) == ArenaProductStockStatus.out;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
        ),
      ),
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: AppColors.brand.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text(
              product.emoji?.trim().isNotEmpty == true
                  ? product.emoji!.trim()
                  : '🧺',
              style: const TextStyle(fontSize: 20),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  product.name,
                  style: Theme.of(context).textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w700,
                        color: context.themeColors.onSurface,
                      ),
                ),
                const SizedBox(height: 2),
                Text(
                  outOfStock ? 'Sem estoque' : formatPriceReais(product.priceCents),
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: outOfStock
                            ? Theme.of(context).colorScheme.error
                            : context.themeColors.onSurfaceMuted,
                        fontWeight: outOfStock ? FontWeight.w700 : null,
                      ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          SizedBox(
            height: 36,
            child: FilledButton(
              onPressed: (adding || outOfStock) ? null : onAdd,
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.brand,
                foregroundColor: AppColors.black,
                padding: const EdgeInsets.symmetric(horizontal: 14),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10),
                ),
              ),
              child: adding
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: AppColors.black,
                      ),
                    )
                  : const Text(
                      'Adicionar',
                      style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13),
                    ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ComandaTotalBar extends StatelessWidget {
  const _ComandaTotalBar({required this.comanda});

  final ArenaComanda comanda;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(20, 14, 20, 18),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceCard,
        border: Border(
          top: BorderSide(
            color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
          ),
        ),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Comanda ${formatComandaNumber(comanda.displayNumber)}',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: context.themeColors.onSurfaceMuted,
                      ),
                ),
                Text(
                  'Total até agora',
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                        color: context.themeColors.onSurface,
                      ),
                ),
              ],
            ),
          ),
          Text(
            formatComandaReais(comanda.totalCents),
            style: Theme.of(context).textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: AppColors.brand,
                ),
          ),
        ],
      ),
    );
  }
}
