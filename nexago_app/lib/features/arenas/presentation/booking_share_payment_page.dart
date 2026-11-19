import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../core/errors/friendly_error_message.dart';
import '../../../core/formatting/app_currency_format.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/ui/app_snackbar.dart';
import '../domain/booking_providers.dart';
import '../domain/booking_split.dart';
import '../domain/booking_split_providers.dart';
import '../domain/my_booking_item.dart';
import 'widgets/booking_pix/booking_pix_copy_button.dart';
import 'widgets/booking_pix/booking_pix_qr_card.dart';

/// `/reservas/:bookingId/parcela/:shareId` — o CONVIDADO de uma reserva
/// dividida paga a sua fatia. É onde cai o toque no push
/// `arena_booking_share_payment_pending`.
///
/// Lê só a fatia dele (as rules não deixam o convidado listar as outras) e o
/// resumo da reserva. O status é ao vivo: o webhook do Asaas marca `paid` e a
/// tela vira "Pago" sozinha; fatia não paga até o prazo vira
/// `covered_by_organizer` (soma ao que quem reservou paga na arena).
class BookingSharePaymentPage extends ConsumerWidget {
  const BookingSharePaymentPage({
    super.key,
    required this.bookingId,
    required this.shareId,
  });

  final String bookingId;
  final String shareId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final shareAsync = ref.watch(
      bookingPaymentShareProvider((bookingId: bookingId, shareId: shareId)),
    );
    final bookingDoc =
        ref.watch(arenaBookingDocProvider(bookingId)).valueOrNull;
    final booking = bookingDoc != null && bookingDoc.exists
        ? MyBookingItem.fromFirestore(bookingDoc)
        : null;

    return Scaffold(
      appBar: AppBar(title: const Text('Sua parte da quadra')),
      body: SafeArea(
        child: shareAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => _Message(
            icon: Icons.error_outline_rounded,
            title: 'Não foi possível abrir a cobrança',
            body: friendlyErrorMessage(
              e,
              action: 'Não foi possível abrir a sua parte da reserva',
              logReason: 'booking:share-open',
            ),
          ),
          data: (share) => share == null
              ? const _Message(
                  icon: Icons.search_off_rounded,
                  title: 'Cobrança não encontrada',
                  body: 'Ela pode ter sido desfeita por quem reservou. '
                      'Confira com quem te chamou para jogar.',
                )
              : _ShareBody(share: share, booking: booking),
        ),
      ),
    );
  }
}

class _ShareBody extends StatelessWidget {
  const _ShareBody({required this.share, required this.booking});

  final BookingPaymentShare share;
  final MyBookingItem? booking;

  static final _deadlineFmt = DateFormat("dd/MM 'às' HH:mm", 'pt_BR');

  Future<void> _copy(BuildContext context, String code) async {
    await Clipboard.setData(ClipboardData(text: code));
    if (!context.mounted) return;
    showAppSnackBar(
      context,
      'Código Pix copiado. Cole no app do seu banco.',
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;
    final code = share.pixCopyPaste ?? '';
    final deadline = share.expiresAt;

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
      children: [
        if (booking != null) ...[
          _BookingSummary(booking: booking!),
          const SizedBox(height: 20),
        ],
        Row(
          children: [
            Expanded(
              child: Text(
                'Sua parte: ${formatBRL(share.amountReais)}',
                style: theme.textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: colors.onSurface,
                ),
              ),
            ),
            _StatusPill(status: share.status),
          ],
        ),
        const SizedBox(height: 16),
        ...switch (share.status) {
          BookingShareStatus.paid => const [
              _Note(
                icon: Icons.check_circle_rounded,
                tone: AppColors.win,
                text: 'Pagamento confirmado. Bom jogo!',
              ),
            ],
          BookingShareStatus.coveredByOrganizer => const [
              _Note(
                icon: Icons.info_outline_rounded,
                tone: AppColors.live,
                text: 'O prazo para pagar pelo app acabou e o valor passou '
                    'para a conta de quem reservou, paga na arena. '
                    'Acerte a sua parte direto com essa pessoa.',
              ),
            ],
          BookingShareStatus.expired => const [
              _Note(
                icon: Icons.timer_off_outlined,
                tone: AppColors.live,
                text: 'Esta cobrança expirou e não aceita mais pagamento.',
              ),
            ],
          BookingShareStatus.pending when code.isEmpty => const [
              _Note(
                icon: Icons.hourglass_top_rounded,
                tone: AppColors.pending,
                text: 'O Pix ainda está sendo gerado. Volte em instantes.',
              ),
            ],
          BookingShareStatus.pending => [
              if (deadline != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Text(
                    'Pague até ${_deadlineFmt.format(deadline)}. Depois disso, '
                    'o valor vira conta de quem reservou.',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: colors.onSurfaceMuted,
                    ),
                  ),
                ),
              BookingPixQrCard(
                base64: share.qrCodeBase64 ?? '',
                payload: code,
              ),
              const SizedBox(height: 12),
              BookingPixCopyButton(onPressed: () => _copy(context, code)),
              const SizedBox(height: 12),
              Text(
                'Assim que o banco confirmar, esta tela muda para "Pago".',
                textAlign: TextAlign.center,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: colors.onSurfaceMuted,
                ),
              ),
            ],
        },
      ],
    );
  }
}

class _BookingSummary extends StatelessWidget {
  const _BookingSummary({required this.booking});

  final MyBookingItem booking;

  static final _dayFmt = DateFormat('EEE, dd/MM', 'pt_BR');

  String get _whenLabel {
    final day = DateTime.tryParse(booking.dateRaw);
    final hours = booking.endTime.isEmpty
        ? booking.startTime
        : '${booking.startTime}–${booking.endTime}';
    if (day == null) return hours;
    return '${_dayFmt.format(day)} · $hours';
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;
    final court = booking.courtName ?? '';
    return DecoratedBox(
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: colors.surfaceRaised),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              booking.arenaName,
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w800,
                color: colors.onSurface,
              ),
            ),
            if (court.isNotEmpty)
              Text(
                court,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: colors.onSurfaceMuted,
                ),
              ),
            const SizedBox(height: 8),
            Row(
              children: [
                Icon(
                  Icons.event_rounded,
                  size: 16,
                  color: colors.onSurfaceMuted,
                ),
                const SizedBox(width: 6),
                Text(
                  _whenLabel,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: colors.onSurface,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _StatusPill extends StatelessWidget {
  const _StatusPill({required this.status});

  final BookingShareStatus status;

  @override
  Widget build(BuildContext context) {
    final tone = context.themeColors.readableTone(_toneOf(status));
    return DecoratedBox(
      decoration: BoxDecoration(
        color: tone.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        child: Text(
          status.guestLabel,
          style: Theme.of(context).textTheme.labelSmall?.copyWith(
                fontWeight: FontWeight.w800,
                color: tone,
              ),
        ),
      ),
    );
  }
}

Color _toneOf(BookingShareStatus status) => switch (status) {
      BookingShareStatus.paid => AppColors.win,
      BookingShareStatus.pending => AppColors.pending,
      BookingShareStatus.expired => AppColors.live,
      BookingShareStatus.coveredByOrganizer => AppColors.live,
    };

class _Note extends StatelessWidget {
  const _Note({required this.icon, required this.tone, required this.text});

  final IconData icon;
  final Color tone;
  final String text;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final readable = colors.readableTone(tone);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: readable.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, color: readable),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                text,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: colors.onSurface,
                    ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Message extends StatelessWidget {
  const _Message({required this.icon, required this.title, required this.body});

  final IconData icon;
  final String title;
  final String body;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 40, color: colors.onSurfaceMuted),
            const SizedBox(height: 12),
            Text(
              title,
              textAlign: TextAlign.center,
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w800,
                color: colors.onSurface,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              body,
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: colors.onSurfaceMuted,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
