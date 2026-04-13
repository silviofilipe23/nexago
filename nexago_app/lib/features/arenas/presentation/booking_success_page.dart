import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/layout/app_scaffold.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/ui/fade_slide_in.dart';

/// Argumentos opcionais para [BookingSuccessPage] (via `GoRouterState.extra`).
class BookingSuccessArgs {
  const BookingSuccessArgs({
    required this.arenaName,
    required this.dateLabel,
    required this.timeRangeLabel,
    this.bookingIds = const [],
    this.amountLabel,
    this.paymentLabel,
    /// Ex.: `Pagamento confirmado` (Mercado Pago) ou `Reserva registrada` (pagamento no local).
    this.headline,
  });

  final String arenaName;
  final String dateLabel;
  final String timeRangeLabel;
  final List<String> bookingIds;
  final String? amountLabel;
  final String? paymentLabel;
  final String? headline;
}

/// Confirmação após `createBookingAtomically` (paridade com `/arenas/:id/book/success` no web).
class BookingSuccessPage extends StatelessWidget {
  const BookingSuccessPage({
    super.key,
    this.args,
  });

  final BookingSuccessArgs? args;

  static final _currency = NumberFormat.currency(
    locale: 'pt_BR',
    symbol: r'R$',
    decimalDigits: 2,
  );

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final state = GoRouterState.of(context);
    final q = state.uri.queryParameters;
    final extraFromState =
        state.extra is BookingSuccessArgs ? state.extra! as BookingSuccessArgs : null;
    final merged = _mergeDisplay(extra: extraFromState ?? args, query: q);

    return AppScaffold(
      title: 'Reserva',
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: FadeSlideIn(
            child: Column(
              children: [
              const SizedBox(height: 24),
              Container(
                width: 88,
                height: 88,
                decoration: BoxDecoration(
                  color: const Color(0xFFE8F5E9),
                  shape: BoxShape.circle,
                  boxShadow: [
                    BoxShadow(
                      color: AppColors.brand.withValues(alpha: 0.2),
                      blurRadius: 24,
                      offset: const Offset(0, 8),
                    ),
                  ],
                ),
                child: Icon(
                  Icons.check_rounded,
                  size: 52,
                  color: AppColors.brand,
                ),
              ),
              const SizedBox(height: 28),
              Text(
                merged.headline ?? 'Reserva registrada',
                style: theme.textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.5,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 12),
              Text(
                merged.bodyText,
                style: theme.textTheme.bodyLarge?.copyWith(
                  color: theme.colorScheme.onSurface.withValues(alpha: 0.75),
                  height: 1.45,
                ),
                textAlign: TextAlign.center,
              ),
              if (merged.bookingId != null && merged.bookingId!.isNotEmpty) ...[
                const SizedBox(height: 16),
                Text(
                  'Código: ${merged.bookingId}',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.onSurface.withValues(alpha: 0.5),
                    fontWeight: FontWeight.w600,
                  ),
                  textAlign: TextAlign.center,
                ),
              ],
              if (merged.paymentLabel != null) ...[
                const SizedBox(height: 8),
                Text(
                  merged.paymentLabel!,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.onSurface.withValues(alpha: 0.55),
                  ),
                  textAlign: TextAlign.center,
                ),
              ],
              const Spacer(),
              SizedBox(
                width: double.infinity,
                height: 54,
                child: FilledButton(
                  onPressed: () => context.go(AppRoutes.discover),
                  style: FilledButton.styleFrom(
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16),
                    ),
                  ),
                  child: const Text(
                    'Ir para início',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 12),
              TextButton(
                onPressed: () {
                  if (context.canPop()) {
                    context.pop();
                  } else {
                    context.go(AppRoutes.discover);
                  }
                },
                child: const Text('Fechar'),
              ),
            ],
            ),
          ),
        ),
      ),
    );
  }

  _SuccessDisplay _mergeDisplay({
    required BookingSuccessArgs? extra,
    required Map<String, String> query,
  }) {
    if (extra != null) {
      final pay = extra.paymentLabel ??
          (query['payment'] == 'paid'
              ? 'Pagamento: combinado na arena'
              : query['payment'] == 'mp_pending'
                  ? 'Pagamento Mercado Pago: ao concluir, volte ao app.'
                  : null);
      final headline = extra.headline ??
          (query['payment'] == 'mp_ok' ? 'Pagamento confirmado' : null);
      return _SuccessDisplay(
        headline: headline,
        bodyText:
            '${extra.arenaName}\n${extra.dateLabel} · ${extra.timeRangeLabel}${extra.amountLabel != null ? '\n${extra.amountLabel}' : ''}',
        bookingId: extra.bookingIds.isNotEmpty ? extra.bookingIds.first : query['bookingId'],
        paymentLabel: pay,
      );
    }

    final arena = query['arenaName'] ?? 'Arena';
    final dateRaw = query['date'] ?? '';
    final start = query['startTime'] ?? '';
    final end = query['endTime'] ?? '';
    final bookingId = query['bookingId'];
    final amountRaw = query['amountReais'];
    final payment = query['payment'];

    String dateLabel = dateRaw;
    if (dateRaw.length >= 10) {
      final d = DateTime.tryParse(dateRaw.substring(0, 10));
      if (d != null) {
        dateLabel = DateFormat('d MMM yyyy', 'pt_BR').format(d);
      }
    }

    final timeRange = (start.isNotEmpty && end.isNotEmpty) ? '$start – $end' : '';
    final amount = amountRaw != null ? double.tryParse(amountRaw) : null;
    final amountStr = amount != null ? _currency.format(amount) : null;

    final buf = StringBuffer()..write(arena);
    if (dateLabel.isNotEmpty) {
      buf.write('\n$dateLabel');
      if (timeRange.isNotEmpty) buf.write(' · $timeRange');
    }
    if (amountStr != null) buf.write('\n$amountStr');

    return _SuccessDisplay(
      headline: payment == 'mp_ok'
          ? 'Pagamento confirmado'
          : payment == 'paid'
              ? 'Reserva registrada'
              : null,
      bodyText: buf.toString().trim(),
      bookingId: bookingId,
      paymentLabel: payment == 'paid'
          ? 'Pagamento: combinado na arena'
          : payment == 'mp_pending'
              ? 'Pagamento Mercado Pago: ao concluir, volte ao app.'
              : null,
    );
  }
}

class _SuccessDisplay {
  const _SuccessDisplay({
    required this.bodyText,
    this.headline,
    this.bookingId,
    this.paymentLabel,
  });

  final String? headline;
  final String bodyText;
  final String? bookingId;
  final String? paymentLabel;
}
