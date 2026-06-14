import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';
import 'package:nexago_app/core/ui/app_snackbar.dart';

import '../../domain/comandas/arena_comanda_closed_args.dart';
import '../../domain/comandas/arena_comanda_logic.dart';
import '../widgets/arena_dashboard_tokens.dart';

class ArenaComandaClosedPage extends StatelessWidget {
  const ArenaComandaClosedPage({
    super.key,
    required this.args,
  });

  final ArenaComandaClosedArgs args;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final comanda = args.comanda;
    final cashback = computeCashbackCents(comanda.totalCents);

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(24, 40, 24, 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Center(
                      child: Container(
                        width: 72,
                        height: 72,
                        decoration: BoxDecoration(
                          color: AppColors.win.withValues(alpha: 0.16),
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(
                          Icons.check_rounded,
                          color: AppColors.win,
                          size: 36,
                        ),
                      ),
                    ),
                    const SizedBox(height: 24),
                    Text(
                      'Comanda fechada',
                      textAlign: TextAlign.center,
                      style: theme.textTheme.headlineSmall?.copyWith(
                        fontWeight: FontWeight.w900,
                        color: context.themeColors.onSurface,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      formatComandaClosedSubtitle(comanda),
                      textAlign: TextAlign.center,
                      style: theme.textTheme.bodyLarge?.copyWith(
                        color: context.themeColors.onSurfaceMuted,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    const SizedBox(height: 28),
                    Text(
                      formatComandaReais(comanda.totalCents),
                      textAlign: TextAlign.center,
                      style: theme.textTheme.displaySmall?.copyWith(
                        fontWeight: FontWeight.w900,
                        color: AppColors.brand,
                        letterSpacing: -0.5,
                      ),
                    ),
                    const SizedBox(height: 24),
                    Container(
                      padding: const EdgeInsets.all(18),
                      decoration: ArenaDashboardTokens.cardDecoration(context),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Text(
                            'PAGAMENTOS',
                            style: AppTypography.mono(
                              color: context.themeColors.onSurfaceMuted,
                              fontSize: 10,
                              fontWeight: FontWeight.w700,
                              letterSpacing: 0.8,
                            ),
                          ),
                          const SizedBox(height: 12),
                          ...args.payments.map(
                            (payment) => Padding(
                              padding: const EdgeInsets.only(bottom: 10),
                              child: Row(
                                children: [
                                  Expanded(
                                    child: Text(
                                      formatPaymentHistoryLabel(payment),
                                      style: theme.textTheme.bodyMedium?.copyWith(
                                        fontWeight: FontWeight.w600,
                                        color: context.themeColors.onSurface,
                                      ),
                                    ),
                                  ),
                                  Text(
                                    formatComandaReais(payment.amountCents),
                                    style: theme.textTheme.bodyMedium?.copyWith(
                                      fontWeight: FontWeight.w800,
                                      color: AppColors.win,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                          Divider(
                            color: context.themeColors.onSurfaceMuted
                                .withValues(alpha: 0.12),
                          ),
                          Row(
                            children: [
                              Expanded(
                                child: Text(
                                  'Cashback (3%)',
                                  style: theme.textTheme.bodyMedium?.copyWith(
                                    color: context.themeColors.onSurfaceMuted,
                                  ),
                                ),
                              ),
                              Text(
                                formatComandaReais(cashback),
                                style: theme.textTheme.bodyMedium?.copyWith(
                                  fontWeight: FontWeight.w700,
                                  color: AppColors.brand,
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                    if (comanda.bookingDisplayCode != null &&
                        comanda.bookingDisplayCode!.isNotEmpty) ...[
                      const SizedBox(height: 20),
                      Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: AppColors.win.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(14),
                        ),
                        child: Row(
                          children: [
                            const Icon(
                              Icons.sports_tennis_rounded,
                              color: AppColors.win,
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Text(
                                'Quadra liberada · reserva '
                                '${comanda.bookingDisplayCode}',
                                style: theme.textTheme.bodyMedium?.copyWith(
                                  color: context.themeColors.onSurface,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 10),
              child: OutlinedButton(
                onPressed: () {
                  showAppSnackBar(context, 'Comprovante em breve.');
                },
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
                child: const Text('Comprovante'),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
              child: FilledButton(
                onPressed: () {
                  context.goNamed(AppRouteNames.arenaComandas);
                },
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.brand,
                  foregroundColor: AppColors.black,
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                ),
                child: const Text(
                  'Voltar ao painel',
                  style: TextStyle(fontWeight: FontWeight.w800),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
