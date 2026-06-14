import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';
import '../../../../core/ui/fade_slide_in.dart';
import '../../domain/products/arena_product_logic.dart';
import '../../domain/products/arena_stock_movement.dart';
import '../../domain/products/arena_stock_movement_registered_args.dart';
import '../widgets/arena_dashboard_tokens.dart';

/// Tela pós-registro de movimentação (mock 07).
class ArenaStockMovementRegisteredPage extends StatefulWidget {
  const ArenaStockMovementRegisteredPage({
    super.key,
    required this.args,
  });

  final ArenaStockMovementRegisteredArgs args;

  @override
  State<ArenaStockMovementRegisteredPage> createState() =>
      _ArenaStockMovementRegisteredPageState();
}

class _ArenaStockMovementRegisteredPageState
    extends State<ArenaStockMovementRegisteredPage>
    with SingleTickerProviderStateMixin {
  late final AnimationController _pulseController;

  @override
  void initState() {
    super.initState();
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2400),
    )..repeat();
  }

  @override
  void dispose() {
    _pulseController.dispose();
    super.dispose();
  }

  void _finish() {
    context.goNamed(AppRouteNames.arenaProductStock);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final args = widget.args;
    final accent = restockActionAccent(
      type: args.type,
      quantity: args.quantityDelta,
    );
    final actionColors = _SuccessActionColors.of(accent);
    final showCost = args.type == ArenaStockMovementType.purchase;
    final quantityLabel = formatSignedQuantityDelta(args.quantityDelta);

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
                        onTap: _finish,
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
                        'Movimentação',
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
                      _SuccessHeroIcon(
                        controller: _pulseController,
                        accentColor: actionColors.hero,
                        iconColor: actionColors.heroIcon,
                        icon: Icons.check_rounded,
                      ),
                      const SizedBox(height: 24),
                      Text(
                        stockMovementSuccessHeadline(args.type),
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
                            const TextSpan(text: 'O estoque do '),
                            TextSpan(
                              text: args.productName,
                              style: TextStyle(
                                color: context.themeColors.onSurface,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                            TextSpan(
                              text: ' ${stockMovementSuccessMessage(args.type)}',
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 32),
                      _StockChangeCard(
                        emoji: args.productEmoji,
                        imageUrl: args.productImageUrl,
                        quantityBefore: args.quantityBefore,
                        quantityAfter: args.quantityAfter,
                        accentColor: actionColors.hero,
                      ),
                      const SizedBox(height: 16),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 16,
                          vertical: 4,
                        ),
                        decoration: ArenaDashboardTokens.cardDecoration(context),
                        child: Column(
                          children: [
                            _DetailRow(
                              label: 'Produto',
                              value: args.productName,
                            ),
                            _DetailDivider(),
                            _DetailRow(
                              label: 'Tipo',
                              value: stockMovementTypeDetailLabel(
                                args.type,
                                quantityDelta: args.quantityDelta,
                              ),
                              valueColor: actionColors.hero,
                            ),
                            _DetailDivider(),
                            _DetailRow(
                              label: 'Quantidade',
                              value: '$quantityLabel un',
                              valueColor: actionColors.hero,
                            ),
                            if (showCost) ...[
                              _DetailDivider(),
                              _DetailRow(
                                label: 'Custo unitário',
                                value: formatPriceReais(args.priceCents),
                              ),
                              _DetailDivider(),
                              _DetailRow(
                                label: 'Total da nota',
                                value: formatPriceReais(args.totalNoteCents),
                              ),
                            ],
                            _DetailDivider(),
                            _DetailRow(
                              label: 'Registrado por',
                              value: formatStockMovementRegisteredAt(
                                args.registeredAt,
                              ),
                            ),
                          ],
                        ),
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
                    onPressed: _finish,
                    style: FilledButton.styleFrom(
                      backgroundColor: actionColors.background,
                      foregroundColor: actionColors.foreground,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14),
                      ),
                    ),
                    child: const Text(
                      'Concluir',
                      style: TextStyle(
                        fontWeight: FontWeight.w800,
                        fontSize: 15,
                      ),
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

class _SuccessActionColors {
  const _SuccessActionColors({
    required this.hero,
    required this.heroIcon,
    required this.background,
    required this.foreground,
  });

  final Color hero;
  final Color heroIcon;
  final Color background;
  final Color foreground;

  static _SuccessActionColors of(RestockActionAccent accent) {
    return switch (accent) {
      RestockActionAccent.inbound => const _SuccessActionColors(
          hero: AppColors.win,
          heroIcon: AppColors.black,
          background: AppColors.win,
          foreground: AppColors.black,
        ),
      RestockActionAccent.adjustment => const _SuccessActionColors(
          hero: AppColors.brand,
          heroIcon: AppColors.black,
          background: AppColors.brand,
          foreground: AppColors.black,
        ),
      RestockActionAccent.outbound => const _SuccessActionColors(
          hero: AppColors.live,
          heroIcon: AppColors.white,
          background: AppColors.live,
          foreground: AppColors.white,
        ),
    };
  }
}

class _SuccessHeroIcon extends StatelessWidget {
  const _SuccessHeroIcon({
    required this.controller,
    required this.accentColor,
    required this.iconColor,
    required this.icon,
  });

  final AnimationController controller;
  final Color accentColor;
  final Color iconColor;
  final IconData icon;

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
                          color: accentColor.withValues(alpha: 0.35),
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
            decoration: BoxDecoration(
              color: accentColor,
              shape: BoxShape.circle,
            ),
            child: Icon(
              icon,
              color: iconColor,
              size: 32,
            ),
          ),
        ),
      ),
    );
  }
}

class _StockChangeCard extends StatelessWidget {
  const _StockChangeCard({
    required this.emoji,
    required this.imageUrl,
    required this.quantityBefore,
    required this.quantityAfter,
    required this.accentColor,
  });

  final String? emoji;
  final String? imageUrl;
  final int quantityBefore;
  final int quantityAfter;
  final Color accentColor;

  @override
  Widget build(BuildContext context) {
    final resolvedEmoji = emoji?.trim();
    final resolvedImageUrl = imageUrl?.trim();

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: ArenaDashboardTokens.cardDecoration(context),
      child: Row(
        children: [
          Container(
            width: 48,
            height: 48,
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
            child: resolvedImageUrl != null && resolvedImageUrl.isNotEmpty
                ? CachedNetworkImage(
                    imageUrl: resolvedImageUrl,
                    fit: BoxFit.cover,
                  )
                : Center(
                    child: Text(
                      resolvedEmoji == null || resolvedEmoji.isEmpty
                          ? '📦'
                          : resolvedEmoji,
                      style: const TextStyle(fontSize: 24),
                    ),
                  ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Row(
              children: [
                Expanded(
                  child: _StockQuantityColumn(
                    label: 'ANTES',
                    quantity: quantityBefore,
                    labelColor: context.themeColors.onSurfaceMuted,
                  ),
                ),
                Icon(
                  Icons.arrow_forward_rounded,
                  color: accentColor,
                  size: 22,
                ),
                Expanded(
                  child: _StockQuantityColumn(
                    label: 'AGORA',
                    quantity: quantityAfter,
                    labelColor: accentColor,
                    alignEnd: true,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _StockQuantityColumn extends StatelessWidget {
  const _StockQuantityColumn({
    required this.label,
    required this.quantity,
    required this.labelColor,
    this.alignEnd = false,
  });

  final String label;
  final int quantity;
  final Color labelColor;
  final bool alignEnd;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment:
          alignEnd ? CrossAxisAlignment.end : CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: AppTypography.mono(
            color: labelColor,
            fontSize: 10,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.6,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          '$quantity',
          style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                fontWeight: FontWeight.w800,
                color: context.themeColors.onSurface,
                fontSize: 28,
                height: 1,
              ),
        ),
      ],
    );
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({
    required this.label,
    required this.value,
    this.valueColor,
  });

  final String label;
  final String value;
  final Color? valueColor;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            flex: 2,
            child: Text(
              label,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: context.themeColors.onSurfaceMuted,
                    fontWeight: FontWeight.w500,
                  ),
            ),
          ),
          Expanded(
            flex: 3,
            child: Text(
              value,
              textAlign: TextAlign.end,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: valueColor ?? context.themeColors.onSurface,
                    fontWeight: FontWeight.w700,
                  ),
            ),
          ),
        ],
      ),
    );
  }
}

class _DetailDivider extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Divider(
      height: 1,
      thickness: 1,
      color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
    );
  }
}
