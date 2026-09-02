import 'dart:async';

import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/formatting/app_currency_format.dart';

/// Card de expiração com countdown MM:SS (protótipo pós-QR).
class BookingPixExpiryCard extends StatefulWidget {
  const BookingPixExpiryCard({
    super.key,
    required this.expiresAt,
    required this.amountReais,
    this.statusLabel = 'aguardando',
  });

  final DateTime expiresAt;
  final double amountReais;
  final String statusLabel;

  @override
  State<BookingPixExpiryCard> createState() => _BookingPixExpiryCardState();
}

class _BookingPixExpiryCardState extends State<BookingPixExpiryCard> {
  Timer? _ticker;

  @override
  void initState() {
    super.initState();
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      setState(() {});
    });
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final remaining = widget.expiresAt.difference(DateTime.now());
    if (remaining.inSeconds <= 0) return const SizedBox.shrink();

    // Minutos TOTAIS, sem dar a volta na hora: a cobrança de inscrição vence
    // junto com o prazo da vaga, que pode ser de horas — 2h05 é "125:00", não
    // "05:00". Mesmo formato do relógio da vaga (`RegistrationWizardNotice`).
    final totalSeconds = remaining.inSeconds.clamp(0, 99 * 3600 + 59 * 60 + 59);
    final minutes = totalSeconds ~/ 60;
    final seconds = totalSeconds % 60;
    final countdown =
        '${minutes.toString().padLeft(2, '0')}:${seconds.toString().padLeft(2, '0')}';

    final amount = formatBRL(widget.amountReais);

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: AppColors.brand.withValues(alpha: 0.45),
          width: 1.5,
        ),
      ),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: AppColors.brand.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(
              Icons.schedule_rounded,
              color: AppColors.brand,
              size: 22,
            ),
          ),
          SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Pagamento expira em',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: context.themeColors.onSurfaceMuted,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                SizedBox(height: 2),
                Text(
                  countdown,
                  style: theme.textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.w900,
                    color: AppColors.brand,
                    letterSpacing: 1,
                  ),
                ),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                amount,
                style: theme.textTheme.labelMedium?.copyWith(
                  color: context.themeColors.onSurfaceMuted,
                  fontWeight: FontWeight.w700,
                ),
              ),
              SizedBox(height: 2),
              Text(
                widget.statusLabel,
                style: theme.textTheme.labelSmall?.copyWith(
                  color: AppColors.brand,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
