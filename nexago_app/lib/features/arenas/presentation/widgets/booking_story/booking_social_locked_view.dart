import 'package:flutter/material.dart';

import '../../../../../core/layout/nexa_app_bar.dart';
import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_theme_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../domain/booking_social_unlock.dart';

/// Pós-jogo de reserva sem metade paga pelo app: explica como liberar o
/// placar, o story e as artes do resultado. Quando o pagamento confirma, o doc
/// da reserva muda e a tela troca sozinha pelo editor.
class BookingSocialLockedView extends StatelessWidget {
  const BookingSocialLockedView({
    super.key,
    required this.unlock,
    required this.isOwner,
    this.title = 'Pós-jogo',
  });

  final BookingSocialUnlock unlock;
  final bool isOwner;
  final String title;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Scaffold(
      key: const Key('booking-social-locked'),
      backgroundColor: colors.canvas,
      appBar: NexaAppBar(
        backgroundColor: colors.canvas,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        centerTitle: true,
        title: Text(
          title,
          style: Theme.of(context).textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w800,
                color: colors.onSurface,
              ),
        ),
      ),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(28, 24, 28, 32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 64,
                  height: 64,
                  decoration: BoxDecoration(
                    color: AppColors.brand.withValues(alpha: 0.14),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(
                    Icons.lock_outline_rounded,
                    size: 30,
                    color: AppColors.brand,
                  ),
                ),
                const SizedBox(height: 18),
                Text(
                  isOwner
                      ? 'Pague pelo app para registrar o placar'
                      : 'Resultado ainda não liberado',
                  textAlign: TextAlign.center,
                  style: AppTypography.soraRegular(
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                    color: colors.onSurface,
                  ),
                ),
                const SizedBox(height: 10),
                Text(
                  bookingSocialLockedMessage(unlock, isOwner: isOwner),
                  key: const Key('booking-social-locked-message'),
                  textAlign: TextAlign.center,
                  style: AppTypography.soraRegular(
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                    height: 1.45,
                    color: colors.onSurface.withValues(alpha: 0.78),
                  ),
                ),
                if (isOwner) ...[
                  const SizedBox(height: 14),
                  Text(
                    'Na próxima reserva, escolha "Pagar online — Pix ou '
                    'cartão" (o sinal de 50% já libera). A liberação é '
                    'automática assim que o pagamento confirma.',
                    textAlign: TextAlign.center,
                    style: AppTypography.soraRegular(
                      fontSize: 12.5,
                      fontWeight: FontWeight.w500,
                      height: 1.45,
                      color: colors.onSurfaceMuted,
                    ),
                  ),
                ],
                const SizedBox(height: 24),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton(
                    key: const Key('booking-social-locked-close'),
                    onPressed: () => Navigator.of(context).maybePop(),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: colors.onSurface,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      side: BorderSide(
                        color: colors.onSurface.withValues(alpha: 0.18),
                      ),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    child: const Text('Entendi'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
