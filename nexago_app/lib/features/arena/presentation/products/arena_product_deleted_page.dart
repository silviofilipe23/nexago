import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../core/ui/app_snackbar.dart';
import '../../../../core/ui/feedback/feedback_page.dart';
import '../../../../core/ui/fade_slide_in.dart';
import '../../domain/products/arena_product_delete_args.dart';
import '../../domain/products/arena_product_providers.dart';

/// Tela pós-exclusão com desfazer (mock 06).
class ArenaProductDeletedPage extends ConsumerStatefulWidget {
  const ArenaProductDeletedPage({
    super.key,
    required this.args,
  });

  final ArenaProductDeleteArgs args;

  static const undoSeconds = 5;

  @override
  ConsumerState<ArenaProductDeletedPage> createState() =>
      _ArenaProductDeletedPageState();
}

class _ArenaProductDeletedPageState
    extends ConsumerState<ArenaProductDeletedPage> {
  int _secondsLeft = ArenaProductDeletedPage.undoSeconds;
  Timer? _timer;
  bool _restoring = false;

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted || _secondsLeft <= 0) return;
      setState(() => _secondsLeft--);
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _restore() async {
    setState(() => _restoring = true);
    try {
      await ref.read(arenaProductsRepositoryProvider).restoreProduct(
            arenaId: widget.args.arenaId,
            product: widget.args.product,
          );
      if (!mounted) return;
      showAppSnackBar(context, 'Produto restaurado.');
      context.goNamed(AppRouteNames.arenaProducts);
    } catch (e) {
      if (mounted) {
        showAppSnackBar(context, 'Erro ao desfazer: $e', isError: true);
      }
    } finally {
      if (mounted) setState(() => _restoring = false);
    }
  }

  void _backToCatalog() {
    context.goNamed(AppRouteNames.arenaProducts);
  }

  @override
  Widget build(BuildContext context) {
    final product = widget.args.product;
    final canUndo = _secondsLeft > 0 && !_restoring;
    final stockLabel = product.stockQuantity == 1
        ? '1 un em estoque'
        : '${product.stockQuantity} un em estoque';

    return FeedbackPage.error(
      title: 'Produto excluído.',
      description:
          '${product.name} saiu do catálogo e do cardápio. O histórico de vendas foi preservado.',
      showCloseButton: true,
      onClose: _backToCatalog,
      extraContent: FadeSlideIn(
        child: _UndoCard(
          secondsLeft: _secondsLeft,
          canUndo: canUndo,
          restoring: _restoring,
          stockLabel: stockLabel,
          onUndo: _restore,
        ),
      ),
      primaryAction: FeedbackAction(
        label: 'Voltar ao catálogo',
        onPressed: _backToCatalog,
      ),
    );
  }
}

class _UndoCard extends StatelessWidget {
  const _UndoCard({
    required this.secondsLeft,
    required this.canUndo,
    required this.restoring,
    required this.stockLabel,
    required this.onUndo,
  });

  final int secondsLeft;
  final bool canUndo;
  final bool restoring;
  final String stockLabel;
  final VoidCallback onUndo;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final progress = canUndo
        ? secondsLeft / ArenaProductDeletedPage.undoSeconds
        : 0.0;

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: AppColors.brand.withValues(alpha: canUndo ? 0.45 : 0.2),
        ),
      ),
      child: Row(
        children: [
          SizedBox(
            width: 48,
            height: 48,
            child: Stack(
              alignment: Alignment.center,
              children: [
                CircularProgressIndicator(
                  value: progress,
                  strokeWidth: 2.5,
                  backgroundColor: context.themeColors.onSurfaceMuted.withValues(
                    alpha: 0.15,
                  ),
                  color: canUndo
                      ? AppColors.brand
                      : context.themeColors.onSurfaceMuted,
                ),
                Text(
                  canUndo ? '${secondsLeft}s' : '0s',
                  style: TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 13,
                    color: canUndo
                        ? AppColors.brand
                        : context.themeColors.onSurfaceMuted,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Desfazer exclusão',
                  style: theme.textTheme.bodyMedium?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: context.themeColors.onSurface,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  'Restaura o produto com $stockLabel',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: context.themeColors.onSurfaceMuted,
                    fontWeight: FontWeight.w500,
                    height: 1.3,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          FilledButton(
            onPressed: canUndo && !restoring ? onUndo : null,
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.brand,
              foregroundColor: AppColors.black,
              disabledBackgroundColor: AppColors.brand.withValues(alpha: 0.35),
              disabledForegroundColor: AppColors.black.withValues(alpha: 0.45),
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              minimumSize: const Size(0, 44),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
            child: restoring
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: AppColors.black,
                    ),
                  )
                : const Text(
                    'Desfazer',
                    style: TextStyle(fontWeight: FontWeight.w800),
                  ),
          ),
        ],
      ),
    );
  }
}
