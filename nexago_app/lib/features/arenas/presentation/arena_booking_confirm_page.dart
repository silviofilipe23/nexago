import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/auth/auth_providers.dart';
import '../../../core/layout/app_scaffold.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../../core/ui/app_status_views.dart';
import '../../../core/ui/fade_slide_in.dart';
import '../data/booking_service.dart';
import '../data/payment_service.dart';
import '../domain/arena_booking_confirm_args.dart';
import '../domain/booking_providers.dart';
import '../domain/payment_providers.dart';
import 'booking_success_page.dart';

/// Confirmação da reserva (paridade com `ArenaBookConfirmComponent` no web).
class ArenaBookingConfirmPage extends ConsumerStatefulWidget {
  const ArenaBookingConfirmPage({
    super.key,
    required this.arenaId,
    this.args,
  });

  final String arenaId;
  final ArenaBookingConfirmArgs? args;

  @override
      ConsumerState<ArenaBookingConfirmPage> createState() =>
      _ArenaBookingConfirmPageState();
}

enum _PaymentChoice {
  /// Pagamento combinado na arena.
  atVenue,

  /// Mercado Pago (link de checkout).
  payNow,
}

class _ArenaBookingConfirmPageState extends ConsumerState<ArenaBookingConfirmPage> {
  bool _submitting = false;
  _PaymentChoice _paymentChoice = _PaymentChoice.atVenue;

  static final _currency = NumberFormat.currency(
    locale: 'pt_BR',
    symbol: r'R$',
    decimalDigits: 2,
  );

  static final _dateFmt = DateFormat('d MMM yyyy', 'pt_BR');

  Future<void> _payNowWithMercadoPago(ArenaBookingConfirmArgs args) async {
    final user = ref.read(authServiceProvider).currentUser;
    if (user == null) {
      if (!mounted) return;
      showAppSnackBar(context, 'Faça login para pagar.', isError: true);
      return;
    }

    setState(() => _submitting = true);
    try {
      final bookingId = await ref.read(bookingServiceProvider).createBookingAtomically(
            args: args,
            athleteId: user.uid,
          );
      if (!mounted) return;

      final payment = ref.read(paymentServiceProvider);
      final checkout = await payment.createArenaBookingMercadoPagoPayment(
        bookingId: bookingId,
        userId: user.uid,
        valor: args.amountReais,
      );
      if (!mounted) return;

      await payment.openMercadoPagoCheckout(checkout.initPoint);
      if (!mounted) return;

      final timeRange = '${args.startTime} – ${args.endTime}';
      final dateLabel = _dateFmt.format(args.date);
      final uri = Uri(
        path: AppRoutes.arenaBookingSuccess.replaceAll(':arenaId', widget.arenaId),
        queryParameters: <String, String>{
          'date': args.dateKey,
          'startTime': args.startTime,
          'endTime': args.endTime,
          'amountReais': args.amountReais.toString(),
          'payment': 'mp_ok',
          'bookingId': bookingId,
          'arenaName': args.arenaName,
        },
      );
      context.go(
        uri.toString(),
        extra: BookingSuccessArgs(
          arenaName: args.arenaName,
          dateLabel: dateLabel,
          timeRangeLabel: timeRange,
          bookingIds: <String>[bookingId],
          amountLabel: 'Total: ${_currency.format(args.amountReais)}',
          headline: 'Pagamento confirmado',
        ),
      );
    } on BookingException catch (e) {
      if (!mounted) return;
      showAppSnackBar(
        context,
        e.message,
        isError: e.isSlotConflict,
      );
    } on PaymentException catch (e) {
      if (!mounted) return;
      showAppSnackBar(context, e.message, isError: true);
    } catch (e) {
      if (!mounted) return;
      showAppSnackBar(context, 'Erro ao iniciar pagamento: $e', isError: true);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  /// Reserva criada; pagamento combinado na arena (sem Mercado Pago).
  Future<void> _finalizeBookingPayAtArena(ArenaBookingConfirmArgs args) async {
    final user = ref.read(authServiceProvider).currentUser;
    if (user == null) {
      if (!mounted) return;
      showAppSnackBar(context, 'Faça login para confirmar a reserva.', isError: true);
      return;
    }

    setState(() => _submitting = true);
    try {
      final bookingId = await ref.read(bookingServiceProvider).createBookingAtomically(
            args: args,
            athleteId: user.uid,
          );
      if (!mounted) return;

      final timeRange = '${args.startTime} – ${args.endTime}';
      final dateLabel = _dateFmt.format(args.date);
      final uri = Uri(
        path: AppRoutes.arenaBookingSuccess
            .replaceAll(':arenaId', widget.arenaId),
        queryParameters: <String, String>{
          'date': args.dateKey,
          'startTime': args.startTime,
          'endTime': args.endTime,
          'amountReais': args.amountReais.toString(),
          'payment': 'paid',
          'bookingId': bookingId,
          'arenaName': args.arenaName,
        },
      );
      context.go(
        uri.toString(),
        extra: BookingSuccessArgs(
          arenaName: args.arenaName,
          dateLabel: dateLabel,
          timeRangeLabel: timeRange,
          bookingIds: <String>[bookingId],
          amountLabel: 'Total: ${_currency.format(args.amountReais)}',
          headline: 'Reserva registrada',
          paymentLabel: 'Pagamento no local na arena.',
        ),
      );
    } on BookingException catch (e) {
      if (!mounted) return;
      showAppSnackBar(
        context,
        e.message,
        isError: e.isSlotConflict,
      );
    } catch (e) {
      if (!mounted) return;
      showAppSnackBar(context, 'Erro ao reservar: $e', isError: true);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final state = GoRouterState.of(context);
    final fromExtra = widget.args ??
        (state.extra is ArenaBookingConfirmArgs ? state.extra! as ArenaBookingConfirmArgs : null);
    final fromQuery = ArenaBookingConfirmArgs.tryParseQuery(state.uri);
    final args = fromExtra ?? fromQuery;

    if (args == null || !args.isValid || args.arenaId != widget.arenaId) {
      return AppScaffold(
        title: 'Confirmar',
        body: AppEmptyView(
          icon: Icons.event_busy_rounded,
          title: 'Dados incompletos',
          subtitle: 'Volte à seleção de horários e escolha arena, data e quadra novamente.',
          actionLabel: 'Voltar aos horários',
          onAction: () {
            if (context.canPop()) {
              context.pop();
            } else {
              context.go(AppRoutes.arenaSlots.replaceAll(':arenaId', widget.arenaId));
            }
          },
        ),
      );
    }

    final timeRange = '${args.startTime} – ${args.endTime}';
    final dateLabel = _dateFmt.format(args.date);

    return AppScaffold(
      title: 'Confirmar reserva',
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) {
            final maxW = constraints.maxWidth > 560 ? 480.0 : constraints.maxWidth;
            return Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(24, 16, 24, 24),
                child: ConstrainedBox(
                  constraints: BoxConstraints(maxWidth: maxW),
                  child: FadeSlideIn(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                      Text(
                        args.arenaName,
                        style: theme.textTheme.titleLarge?.copyWith(
                          fontWeight: FontWeight.w800,
                          letterSpacing: -0.3,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        args.courtName,
                        style: theme.textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.w600,
                          color: theme.colorScheme.onSurface.withValues(alpha: 0.85),
                        ),
                      ),
                      const SizedBox(height: 20),
                      _SummaryRow(
                        icon: Icons.calendar_today_rounded,
                        label: 'Data',
                        value: dateLabel,
                      ),
                      const SizedBox(height: 12),
                      _SummaryRow(
                        icon: Icons.schedule_rounded,
                        label: 'Horário',
                        value: timeRange,
                      ),
                      const SizedBox(height: 12),
                      _SummaryRow(
                        icon: Icons.payments_outlined,
                        label: 'Total',
                        value: _currency.format(args.amountReais),
                        emphasize: true,
                      ),
                      const SizedBox(height: 24),
                      Text(
                        'Forma de pagamento',
                        style: theme.textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w700,
                          letterSpacing: -0.2,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        'Escolha pagar no local ou iniciar o pagamento online (Mercado Pago).',
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.colorScheme.onSurface.withValues(alpha: 0.55),
                          height: 1.35,
                        ),
                      ),
                      const SizedBox(height: 14),
                      SegmentedButton<_PaymentChoice>(
                        showSelectedIcon: false,
                        segments: const <ButtonSegment<_PaymentChoice>>[
                          ButtonSegment<_PaymentChoice>(
                            value: _PaymentChoice.atVenue,
                            label: Text('Pagar no local'),
                            icon: Icon(Icons.storefront_outlined, size: 20),
                          ),
                          ButtonSegment<_PaymentChoice>(
                            value: _PaymentChoice.payNow,
                            label: Text('Pagar agora'),
                            icon: Icon(Icons.payment_outlined, size: 20),
                          ),
                        ],
                        selected: <_PaymentChoice>{_paymentChoice},
                        onSelectionChanged: _submitting
                            ? null
                            : (Set<_PaymentChoice> next) {
                                if (next.isEmpty) return;
                                setState(() => _paymentChoice = next.first);
                              },
                      ),
                      const SizedBox(height: 28),
                      SizedBox(
                        height: 54,
                        child: FilledButton(
                          onPressed: _submitting
                              ? null
                              : () {
                                  if (_paymentChoice == _PaymentChoice.payNow) {
                                    _payNowWithMercadoPago(args);
                                  } else {
                                    _finalizeBookingPayAtArena(args);
                                  }
                                },
                          style: FilledButton.styleFrom(
                            backgroundColor: AppColors.brand,
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(16),
                            ),
                          ),
                          child: _submitting
                              ? SizedBox(
                                  width: 26,
                                  height: 26,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2.5,
                                    color: theme.colorScheme.onPrimary,
                                  ),
                                )
                              : const Text(
                                  'Confirmar reserva',
                                  style: TextStyle(
                                    fontSize: 16,
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                        ),
                      ),
                      const SizedBox(height: 12),
                      OutlinedButton(
                        onPressed: _submitting
                            ? null
                            : () {
                                if (context.canPop()) {
                                  context.pop();
                                } else {
                                  context.go(
                                    AppRoutes.arenaSlots.replaceAll(':arenaId', widget.arenaId),
                                  );
                                }
                              },
                        child: const Text('Alterar horário'),
                      ),
                    ],
                    ),
                  ),
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}

class _SummaryRow extends StatelessWidget {
  const _SummaryRow({
    required this.icon,
    required this.label,
    required this.value,
    this.emphasize = false,
  });

  final IconData icon;
  final String label;
  final String value;
  final bool emphasize;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: theme.colorScheme.outline.withValues(alpha: 0.2),
        ),
        color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.35),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, size: 22, color: AppColors.brand.withValues(alpha: 0.9)),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label.toUpperCase(),
                    style: theme.textTheme.labelSmall?.copyWith(
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.6,
                      color: theme.colorScheme.onSurface.withValues(alpha: 0.45),
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    value,
                    style: (emphasize ? theme.textTheme.titleMedium : theme.textTheme.bodyLarge)
                        ?.copyWith(fontWeight: emphasize ? FontWeight.w800 : FontWeight.w600),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
