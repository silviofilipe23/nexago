import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';
import '../../../../../core/formatting/app_currency_format.dart';
import '../../../../../core/ui/app_snackbar.dart';
import '../../../../arenas/presentation/widgets/booking_pix/booking_pix_copy_button.dart';
import '../../../../arenas/presentation/widgets/booking_pix/booking_pix_qr_card.dart';
import '../../../data/arena_subscription_repository.dart';

/// "Próxima mensalidade" / "Mensalidade vencida" na tela do plano: o Pix que a
/// recorrência gerou (QR + copia-e-cola) ou a fatura quando o cartão recusou.
class ArenaPlanOpenChargeCard extends StatefulWidget {
  const ArenaPlanOpenChargeCard({
    super.key,
    required this.charge,
    required this.onOpenInvoice,
  });

  final ArenaPlanOpenCharge charge;
  final Future<void> Function(String url) onOpenInvoice;

  @override
  State<ArenaPlanOpenChargeCard> createState() => _ArenaPlanOpenChargeCardState();
}

class _ArenaPlanOpenChargeCardState extends State<ArenaPlanOpenChargeCard> {
  bool _showPix = false;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final charge = widget.charge;
    final accent = charge.overdue ? colors.pending : colors.brand;
    final title = charge.overdue ? 'Mensalidade vencida' : 'Próxima mensalidade';
    final due = charge.overdue
        ? 'Venceu em ${charge.dueDateLabel}'
        : 'Vence em ${charge.dueDateLabel}';
    final dueLine = charge.cardDeclined ? '$due · o cartão foi recusado' : due;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: accent.withValues(alpha: 0.45)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  title,
                  style: AppTypography.soraRegular(
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                    color: charge.overdue ? colors.readableTone(colors.pending) : colors.onSurface,
                  ),
                ),
              ),
              Text(
                formatBRL(charge.valueCents / 100),
                style: AppTypography.soraRegular(
                  fontSize: 17,
                  fontWeight: FontWeight.w900,
                  color: colors.onSurface,
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            dueLine,
            style: AppTypography.soraRegular(
              fontSize: 13,
              fontWeight: FontWeight.w500,
              color: colors.onSurfaceMuted,
            ),
          ),
          const SizedBox(height: 14),
          if (charge.hasPix && _showPix) ...[
            if ((charge.qrCodeBase64 ?? '').isNotEmpty)
              BookingPixQrCard(base64: charge.qrCodeBase64!, payload: charge.qrCode!),
            const SizedBox(height: 12),
            BookingPixCopyButton(
              onPressed: () async {
                await Clipboard.setData(ClipboardData(text: charge.qrCode!));
                if (context.mounted) showAppSnackBar(context, 'Código PIX copiado.');
              },
            ),
            const SizedBox(height: 8),
            Text(
              'O plano é renovado assim que o Pix for confirmado.',
              textAlign: TextAlign.center,
              style: AppTypography.soraRegular(
                fontSize: 12,
                fontWeight: FontWeight.w500,
                color: colors.onSurfaceMuted,
              ),
            ),
          ] else if (charge.hasPix)
            _PayButton(
              label: 'Pagar com Pix',
              icon: Icons.pix_rounded,
              onPressed: () => setState(() => _showPix = true),
            )
          else if (charge.invoiceUrl != null)
            _PayButton(
              label: 'Pagar mensalidade',
              icon: Icons.open_in_new_rounded,
              onPressed: () => widget.onOpenInvoice(charge.invoiceUrl!),
            ),
        ],
      ),
    );
  }
}

class _PayButton extends StatelessWidget {
  const _PayButton({required this.label, required this.icon, required this.onPressed});

  final String label;
  final IconData icon;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return FilledButton.icon(
      onPressed: onPressed,
      icon: Icon(icon, size: 18),
      label: Text(label),
      style: FilledButton.styleFrom(
        backgroundColor: colors.brand,
        foregroundColor: colors.black,
        padding: const EdgeInsets.symmetric(vertical: 14),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
    );
  }
}
