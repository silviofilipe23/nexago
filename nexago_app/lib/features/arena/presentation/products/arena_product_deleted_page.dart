import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../core/ui/app_snackbar.dart';
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
    extends ConsumerState<ArenaProductDeletedPage>
    with SingleTickerProviderStateMixin {
  late final AnimationController _pulseController;
  int _secondsLeft = ArenaProductDeletedPage.undoSeconds;
  Timer? _timer;
  bool _restoring = false;

  @override
  void initState() {
    super.initState();
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2400),
    )..repeat();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted || _secondsLeft <= 0) return;
      setState(() => _secondsLeft--);
    });
  }

  @override
  void dispose() {
    _pulseController.dispose();
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
    final theme = Theme.of(context);
    final product = widget.args.product;
    final canUndo = _secondsLeft > 0 && !_restoring;
    final stockLabel = product.stockQuantity == 1
        ? '1 un em estoque'
        : '${product.stockQuantity} un em estoque';

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      body: SafeArea(
        child: FadeSlideIn(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
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
                        onTap: _backToCatalog,
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
                    Expanded(
                      child: Text(
                        'Produto excluído',
                        textAlign: TextAlign.center,
                        style: theme.textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.w700,
                          color: context.themeColors.onSurface,
                        ),
                      ),
                    ),
                    const SizedBox(width: 44),
                  ],
                ),
              ),
              Expanded(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(24, 32, 24, 16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      _DeletedHeroIcon(controller: _pulseController),
                      const SizedBox(height: 24),
                      Text(
                        'Produto excluído.',
                        textAlign: TextAlign.center,
                        style: theme.textTheme.headlineSmall?.copyWith(
                          fontWeight: FontWeight.w800,
                          color: context.themeColors.onSurface,
                          letterSpacing: -0.3,
                        ),
                      ),
                      const SizedBox(height: 12),
                      RichText(
                        textAlign: TextAlign.center,
                        text: TextSpan(
                          style: theme.textTheme.bodyLarge?.copyWith(
                            color: context.themeColors.onSurfaceMuted,
                            fontWeight: FontWeight.w500,
                            height: 1.45,
                          ),
                          children: [
                            TextSpan(
                              text: product.name,
                              style: TextStyle(
                                color: context.themeColors.onSurface,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                            const TextSpan(
                              text:
                                  ' saiu do catálogo e do cardápio. O histórico de vendas foi preservado.',
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 32),
                      _UndoCard(
                        secondsLeft: _secondsLeft,
                        canUndo: canUndo,
                        restoring: _restoring,
                        stockLabel: stockLabel,
                        onUndo: _restore,
                      ),
                    ],
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
                child: OutlinedButton.icon(
                  onPressed: _backToCatalog,
                  icon: const Icon(Icons.arrow_back_rounded, size: 18),
                  label: const Text('Voltar ao catálogo'),
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
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _DeletedHeroIcon extends StatelessWidget {
  const _DeletedHeroIcon({required this.controller});

  final AnimationController controller;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: SizedBox(
        width: 120,
        height: 120,
        child: AnimatedBuilder(
          animation: controller,
          builder: (context, child) {
            return Stack(
              alignment: Alignment.center,
              children: [
                for (var i = 0; i < 3; i++)
                  Opacity(
                    opacity: (1 - ((controller.value + i * 0.33) % 1.0))
                        .clamp(0.0, 1.0),
                    child: Container(
                      width: 72 + (i * 18),
                      height: 72 + (i * 18),
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        border: Border.all(
                          color: AppColors.live.withValues(alpha: 0.35),
                          width: 1.5,
                        ),
                      ),
                    ),
                  ),
                child!,
              ],
            );
          },
          child: Container(
            width: 72,
            height: 72,
            decoration: const BoxDecoration(
              color: AppColors.live,
              shape: BoxShape.circle,
            ),
            child: const Icon(
              Icons.delete_outline_rounded,
              color: AppColors.white,
              size: 32,
            ),
          ),
        ),
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
