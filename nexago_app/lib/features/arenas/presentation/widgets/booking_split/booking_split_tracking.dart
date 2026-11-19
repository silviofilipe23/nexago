import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../../../core/formatting/app_currency_format.dart';
import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_theme_colors.dart';
import '../../../domain/booking_split.dart';
import '../booking_pix/booking_pix_copy_button.dart';
import '../booking_pix/booking_pix_qr_card.dart';

/// Acompanhamento da divisão na tela do Pix: quem já pagou, o Pix da sua
/// própria parte e, para cada convidado que ainda não pagou, como mandar o
/// Pix dele (o convidado também recebe o aviso por push).
class BookingSplitTracking extends StatelessWidget {
  const BookingSplitTracking({
    super.key,
    required this.shares,
    required this.selfUid,
    required this.payerNames,
    required this.onCopyPix,
    required this.onSharePix,
  });

  /// Fatias ao vivo, na ordem de criação.
  final List<BookingPaymentShare> shares;
  final String? selfUid;

  /// Nome de cada pagador (o dono vem como "Você").
  final Map<String, String> payerNames;
  final ValueChanged<String> onCopyPix;
  final ValueChanged<BookingPaymentShare> onSharePix;

  static final _timeFmt = DateFormat("dd/MM 'às' HH:mm", 'pt_BR');

  String _nameOf(BookingPaymentShare share) {
    if (share.payerAthleteId == selfUid) return 'Você';
    final name = payerNames[share.payerAthleteId]?.trim() ?? '';
    return name.isNotEmpty ? name : 'Jogador convidado';
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;
    final progress = BookingSplitProgress(shares);
    final own = shares
        .where((s) => s.payerAthleteId == selfUid && s.isPending)
        .firstOrNull;
    final deadline =
        shares.map((s) => s.expiresAt).whereType<DateTime>().firstOrNull;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _StatusBanner(progressLabel: progress.label),
        if (own != null && (own.pixCopyPaste ?? '').isNotEmpty) ...[
          const SizedBox(height: 20),
          Text(
            'Sua parte: ${formatBRL(own.amountReais)}',
            style: theme.textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.w800,
              color: colors.onSurface,
            ),
          ),
          const SizedBox(height: 12),
          BookingPixQrCard(
            base64: own.qrCodeBase64 ?? '',
            payload: own.pixCopyPaste!,
          ),
          const SizedBox(height: 12),
          BookingPixCopyButton(onPressed: () => onCopyPix(own.pixCopyPaste!)),
        ],
        const SizedBox(height: 22),
        Text(
          'QUEM JÁ PAGOU',
          style: theme.textTheme.labelSmall?.copyWith(
            fontWeight: FontWeight.w800,
            letterSpacing: 0.8,
            color: colors.onSurfaceMuted,
          ),
        ),
        const SizedBox(height: 6),
        for (final share in shares)
          _ShareRow(
            name: _nameOf(share),
            share: share,
            canShare: share.isPending &&
                share.payerAthleteId != selfUid &&
                (share.pixCopyPaste ?? '').isNotEmpty,
            onShare: () => onSharePix(share),
          ),
        if (progress.coveredReais > 0) ...[
          const SizedBox(height: 10),
          Text(
            '${formatBRL(progress.coveredReais)} de quem não pagou a tempo '
            'ficou para você pagar na arena.',
            style: theme.textTheme.bodySmall?.copyWith(
              color: colors.readableTone(AppColors.pending),
              fontWeight: FontWeight.w700,
              height: 1.35,
            ),
          ),
        ],
        const SizedBox(height: 12),
        Text(
          deadline == null
              ? 'Quem não pagar a tempo tem a parte somada ao valor a pagar '
                  'na arena — sua reserva não é cancelada por isso.'
              : 'Quem não pagar até ${_timeFmt.format(deadline)} tem a parte '
                  'somada ao valor a pagar na arena — sua reserva não é '
                  'cancelada por isso.',
          style: theme.textTheme.bodySmall?.copyWith(
            color: colors.onSurfaceMuted,
            height: 1.35,
          ),
        ),
      ],
    );
  }
}

class _StatusBanner extends StatelessWidget {
  const _StatusBanner({required this.progressLabel});

  final String progressLabel;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;
    final tone = colors.readableTone(AppColors.win);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: tone.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: tone.withValues(alpha: 0.35)),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          children: [
            Icon(Icons.event_available_rounded, color: tone),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Reserva confirmada',
                    style: theme.textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w800,
                      color: colors.onSurface,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    progressLabel.isEmpty
                        ? 'Gerando o Pix de cada jogador…'
                        : 'Pix enviado para cada jogador · $progressLabel',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: colors.onSurfaceMuted,
                    ),
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

class _ShareRow extends StatelessWidget {
  const _ShareRow({
    required this.name,
    required this.share,
    required this.canShare,
    required this.onShare,
  });

  final String name;
  final BookingPaymentShare share;
  final bool canShare;
  final VoidCallback onShare;

  Color _toneOf(BookingShareStatus status) => switch (status) {
        BookingShareStatus.paid => AppColors.win,
        BookingShareStatus.pending => AppColors.pending,
        BookingShareStatus.expired => AppColors.live,
        BookingShareStatus.coveredByOrganizer => AppColors.live,
      };

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;
    final tone = colors.readableTone(_toneOf(share.status));
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                    color: colors.onSurface,
                  ),
                ),
                Text(
                  formatBRL(share.amountReais),
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: colors.onSurfaceMuted,
                  ),
                ),
              ],
            ),
          ),
          DecoratedBox(
            decoration: BoxDecoration(
              color: tone.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(999),
            ),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              child: Text(
                share.status.label,
                style: theme.textTheme.labelSmall?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: tone,
                ),
              ),
            ),
          ),
          if (canShare)
            IconButton(
              tooltip: 'Enviar o Pix de $name',
              onPressed: onShare,
              icon: Icon(Icons.ios_share_rounded, color: colors.brandText),
            )
          else
            const SizedBox(width: 48),
        ],
      ),
    );
  }
}
