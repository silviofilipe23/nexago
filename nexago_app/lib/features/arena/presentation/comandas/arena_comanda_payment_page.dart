import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';
import 'package:nexago_app/core/ui/app_snackbar.dart';

import '../../domain/comandas/arena_comanda.dart';
import '../../domain/comandas/arena_comanda_closed_args.dart';
import '../../domain/comandas/arena_comanda_logic.dart';
import '../../domain/comandas/arena_comanda_payment.dart';
import '../../domain/comandas/arena_comanda_providers.dart';
import '../widgets/arena_async_state.dart';
import '../widgets/arena_dashboard_tokens.dart';

class ArenaComandaPaymentPage extends ConsumerStatefulWidget {
  const ArenaComandaPaymentPage({
    super.key,
    required this.comandaId,
  });

  final String comandaId;

  @override
  ConsumerState<ArenaComandaPaymentPage> createState() =>
      _ArenaComandaPaymentPageState();
}

class _ArenaComandaPaymentPageState extends ConsumerState<ArenaComandaPaymentPage> {
  ArenaComandaPaymentMethod _method = ArenaComandaPaymentMethod.pix;
  bool _submitting = false;

  static const _methods = <({
    ArenaComandaPaymentMethod method,
    IconData icon,
    String label,
  })>[
    (method: ArenaComandaPaymentMethod.pix, icon: Icons.pix, label: 'Pix'),
    (
      method: ArenaComandaPaymentMethod.credit,
      icon: Icons.credit_card_rounded,
      label: 'Crédito'
    ),
    (
      method: ArenaComandaPaymentMethod.debit,
      icon: Icons.payment_rounded,
      label: 'Débito'
    ),
    (
      method: ArenaComandaPaymentMethod.cash,
      icon: Icons.payments_outlined,
      label: 'Dinheiro'
    ),
    (
      method: ArenaComandaPaymentMethod.wallet,
      icon: Icons.account_balance_wallet_outlined,
      label: 'Carteira'
    ),
    (
      method: ArenaComandaPaymentMethod.other,
      icon: Icons.more_horiz_rounded,
      label: 'Mais'
    ),
  ];

  Future<void> _receivePayment({
    required ArenaComanda comanda,
    required int amountCents,
  }) async {
    if (_submitting || amountCents <= 0) return;

    final payerNameInput = await showDialog<String>(
      context: context,
      builder: (context) =>
          _PayerNameDialog(initialName: comanda.customerName),
    );

    if (payerNameInput == null || !mounted) return;

    setState(() => _submitting = true);
    try {
      final result = await ref
          .read(arenaComandasRepositoryProvider)
          .registerPayment(
            comandaId: comanda.id,
            method: _method,
            amountCents: amountCents,
            payerName: payerNameInput.isEmpty
                ? comanda.customerName
                : payerNameInput,
          );

      if (!mounted) return;

      if (result.comanda.isFullyPaid) {
        final previous = ref
                .read(arenaComandaPaymentsStreamProvider(widget.comandaId))
                .valueOrNull ??
            const [];
        context.pushReplacementNamed(
          AppRouteNames.arenaComandaClosed,
          pathParameters: {'comandaId': widget.comandaId},
          extra: ArenaComandaClosedArgs(
            comanda: result.comanda,
            payments: [result.payment, ...previous],
          ),
        );
      }
    } catch (e) {
      if (mounted) showAppSnackBar(context, '$e');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final comandaAsync = ref.watch(arenaComandaStreamProvider(widget.comandaId));
    final paymentsAsync =
        ref.watch(arenaComandaPaymentsStreamProvider(widget.comandaId));

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

            final payments = paymentsAsync.valueOrNull ?? const [];
            final remaining = comanda.remainingCents;
            final progress = comanda.totalCents > 0
                ? comanda.paidCents / comanda.totalCents
                : 0.0;

            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
                  child: Column(
                    children: [
                      Text(
                        formatComandaContextLabel(comanda),
                        style: AppTypography.mono(
                          color: AppColors.brand,
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 0.6,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        'Pagamento',
                        style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                              fontWeight: FontWeight.w800,
                              color: context.themeColors.onSurface,
                            ),
                      ),
                    ],
                  ),
                ),
                Expanded(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.fromLTRB(20, 20, 20, 16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Container(
                          padding: const EdgeInsets.all(18),
                          decoration:
                              ArenaDashboardTokens.cardDecoration(context),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              Text(
                                'FALTA RECEBER',
                                style: AppTypography.mono(
                                  color: context.themeColors.onSurfaceMuted,
                                  fontSize: 10,
                                  fontWeight: FontWeight.w700,
                                  letterSpacing: 0.8,
                                ),
                              ),
                              const SizedBox(height: 8),
                              Text(
                                formatComandaReais(remaining),
                                style: Theme.of(context)
                                    .textTheme
                                    .headlineMedium
                                    ?.copyWith(
                                      fontWeight: FontWeight.w900,
                                      color: AppColors.brand,
                                    ),
                              ),
                              const SizedBox(height: 14),
                              ClipRRect(
                                borderRadius: BorderRadius.circular(999),
                                child: LinearProgressIndicator(
                                  value: progress.clamp(0, 1),
                                  minHeight: 8,
                                  backgroundColor: context
                                      .themeColors.onSurfaceMuted
                                      .withValues(alpha: 0.12),
                                  color: AppColors.win,
                                ),
                              ),
                              const SizedBox(height: 12),
                              Row(
                                children: [
                                  Text(
                                    'Pago ${formatComandaReais(comanda.paidCents)}',
                                    style: Theme.of(context)
                                        .textTheme
                                        .bodySmall
                                        ?.copyWith(
                                          color: AppColors.win,
                                          fontWeight: FontWeight.w700,
                                        ),
                                  ),
                                  const Spacer(),
                                  Text(
                                    'Total ${formatComandaReais(comanda.totalCents)}',
                                    style: Theme.of(context)
                                        .textTheme
                                        .bodySmall
                                        ?.copyWith(
                                          color: context
                                              .themeColors.onSurfaceMuted,
                                          fontWeight: FontWeight.w600,
                                        ),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                        if (payments.isNotEmpty) ...[
                          const SizedBox(height: 20),
                          Text(
                            'HISTÓRICO',
                            style: AppTypography.mono(
                              color: context.themeColors.onSurfaceMuted,
                              fontSize: 10,
                              fontWeight: FontWeight.w700,
                              letterSpacing: 0.8,
                            ),
                          ),
                          const SizedBox(height: 10),
                          ...payments.map(
                            (payment) => _PaymentHistoryTile(payment: payment),
                          ),
                        ],
                        const SizedBox(height: 20),
                        Text(
                          'FORMA DE PAGAMENTO',
                          style: AppTypography.mono(
                            color: context.themeColors.onSurfaceMuted,
                            fontSize: 10,
                            fontWeight: FontWeight.w700,
                            letterSpacing: 0.8,
                          ),
                        ),
                        const SizedBox(height: 12),
                        GridView.count(
                          crossAxisCount: 3,
                          shrinkWrap: true,
                          physics: const NeverScrollableScrollPhysics(),
                          mainAxisSpacing: 10,
                          crossAxisSpacing: 10,
                          childAspectRatio: 1.05,
                          children: [
                            for (final item in _methods)
                              _MethodTile(
                                icon: item.icon,
                                label: item.label,
                                selected: _method == item.method,
                                onTap: () =>
                                    setState(() => _method = item.method),
                              ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
                  child: FilledButton(
                    onPressed: remaining > 0 && !_submitting
                        ? () => _receivePayment(
                              comanda: comanda,
                              amountCents: remaining,
                            )
                        : null,
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.brand,
                      foregroundColor: AppColors.black,
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14),
                      ),
                    ),
                    child: _submitting
                        ? const SizedBox(
                            width: 22,
                            height: 22,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : Text(
                            'Receber ${formatComandaReais(remaining)} em '
                            '${paymentMethodLabel(_method)}',
                            style: const TextStyle(fontWeight: FontWeight.w800),
                          ),
                  ),
                ),
              ],
            );
          },
          loading: () =>
              const ArenaLoadingState(label: 'Carregando pagamento...'),
          error: (e, _) => ArenaErrorState(message: '$e'),
        ),
      ),
    );
  }
}

class _PayerNameDialog extends StatefulWidget {
  const _PayerNameDialog({required this.initialName});

  final String initialName;

  @override
  State<_PayerNameDialog> createState() => _PayerNameDialogState();
}

class _PayerNameDialogState extends State<_PayerNameDialog> {
  late final TextEditingController _controller;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: widget.initialName);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Confirmar pagamento'),
      content: TextField(
        controller: _controller,
        decoration: const InputDecoration(
          labelText: 'Nome do pagador',
        ),
        autofocus: true,
        textInputAction: TextInputAction.done,
        onSubmitted: (_) => Navigator.pop(context, _controller.text.trim()),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Cancelar'),
        ),
        FilledButton(
          onPressed: () =>
              Navigator.pop(context, _controller.text.trim()),
          child: const Text('Confirmar'),
        ),
      ],
    );
  }
}

class _PaymentHistoryTile extends StatelessWidget {
  const _PaymentHistoryTile({required this.payment});

  final ArenaComandaPayment payment;

  @override
  Widget build(BuildContext context) {
    final time = payment.createdAt != null
        ? DateFormat('HH:mm').format(payment.createdAt!)
        : '--:--';

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(14),
      decoration: ArenaDashboardTokens.cardDecoration(context),
      child: Row(
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: AppColors.win.withValues(alpha: 0.16),
              shape: BoxShape.circle,
            ),
            child: const Icon(Icons.check_rounded, color: AppColors.win, size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  formatPaymentHistoryLabel(payment),
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                        color: context.themeColors.onSurface,
                      ),
                ),
                Text(
                  time,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: context.themeColors.onSurfaceMuted,
                      ),
                ),
              ],
            ),
          ),
          Text(
            formatComandaReais(payment.amountCents),
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: AppColors.win,
                ),
          ),
        ],
      ),
    );
  }
}

class _MethodTile extends StatelessWidget {
  const _MethodTile({
    required this.icon,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: context.themeColors.surfaceCard,
      borderRadius: BorderRadius.circular(14),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 160),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: selected
                  ? AppColors.brand
                  : context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
              width: selected ? 2 : 1,
            ),
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                icon,
                color: selected ? AppColors.brand : context.themeColors.onSurface,
              ),
              const SizedBox(height: 6),
              Text(
                label,
                style: TextStyle(
                  color: selected
                      ? AppColors.brand
                      : context.themeColors.onSurface,
                  fontWeight: FontWeight.w700,
                  fontSize: 12,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
