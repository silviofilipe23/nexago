import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/ui/fade_slide_in.dart';

import '../../domain/comandas/arena_comanda_created_args.dart';
import '../../domain/comandas/arena_comanda_logic.dart';
import '../widgets/arena_dashboard_tokens.dart';

class ArenaComandaOpenedPage extends StatefulWidget {
  const ArenaComandaOpenedPage({
    super.key,
    required this.args,
  });

  final ArenaComandaCreatedArgs args;

  @override
  State<ArenaComandaOpenedPage> createState() => _ArenaComandaOpenedPageState();
}

class _ArenaComandaOpenedPageState extends State<ArenaComandaOpenedPage>
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

  void _viewComanda() {
    context.goNamed(
      AppRouteNames.arenaComandaDetail,
      pathParameters: {'comandaId': widget.args.comanda.id},
    );
  }

  void _launchFirstItem() {
    context.pushNamed(
      AppRouteNames.arenaComandaQuickAdd,
      pathParameters: {'comandaId': widget.args.comanda.id},
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final comanda = widget.args.comanda;
    final number = formatComandaNumber(comanda.displayNumber);
    final location = comanda.locationLabel ?? comanda.customerName;

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      body: SafeArea(
        child: FadeSlideIn(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
                child: Text(
                  'Comanda criada',
                  textAlign: TextAlign.center,
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                    color: context.themeColors.onSurface,
                  ),
                ),
              ),
              Expanded(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(24, 32, 24, 16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      _SuccessHeroIcon(controller: _pulseController),
                      const SizedBox(height: 24),
                      Text(
                        'Comanda $number aberta.',
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
                            TextSpan(text: '$location · individual com '),
                            TextSpan(
                              text: comanda.customerName,
                              style: TextStyle(
                                color: context.themeColors.onSurface,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                            TextSpan(
                              text: comanda.rentalCents > 0
                                  ? '. A locação já entrou.'
                                  : '.',
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 32),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 16,
                          vertical: 4,
                        ),
                        decoration: ArenaDashboardTokens.cardDecoration(context),
                        child: Column(
                          children: [
                            if (comanda.rentalCents > 0) ...[
                              _SummaryRow(
                                label: 'Locação ${comanda.locationLabel ?? ''}'
                                    .trim(),
                                value: formatComandaReais(comanda.rentalCents),
                              ),
                              _SummaryDivider(),
                            ],
                            _SummaryRow(
                              label: 'Itens lançados',
                              value: '${comanda.itemsCount}',
                            ),
                            _SummaryDivider(),
                            _SummaryRow(
                              label: 'Total atual',
                              value: formatComandaReais(comanda.totalCents),
                              valueColor: AppColors.brand,
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 10),
                child: SizedBox(
                  width: double.infinity,
                  height: 52,
                  child: FilledButton(
                    onPressed: _launchFirstItem,
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.brand,
                      foregroundColor: AppColors.black,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14),
                      ),
                    ),
                    child: const Text(
                      '+ Lançar primeiro item',
                      style: TextStyle(
                        fontWeight: FontWeight.w800,
                        fontSize: 15,
                      ),
                    ),
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
                child: OutlinedButton(
                  onPressed: _viewComanda,
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
                  child: const Text('Ver comanda'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SuccessHeroIcon extends StatelessWidget {
  const _SuccessHeroIcon({required this.controller});

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
                          color: AppColors.brand.withValues(alpha: 0.35),
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
              color: AppColors.brand,
              shape: BoxShape.circle,
            ),
            child: const Icon(
              Icons.check_rounded,
              color: AppColors.black,
              size: 32,
            ),
          ),
        ),
      ),
    );
  }
}

class _SummaryRow extends StatelessWidget {
  const _SummaryRow({
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
        children: [
          Expanded(
            child: Text(
              label,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: context.themeColors.onSurfaceMuted,
                  ),
            ),
          ),
          Text(
            value,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: valueColor ?? context.themeColors.onSurface,
                ),
          ),
        ],
      ),
    );
  }
}

class _SummaryDivider extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Divider(
      height: 1,
      color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
    );
  }
}
