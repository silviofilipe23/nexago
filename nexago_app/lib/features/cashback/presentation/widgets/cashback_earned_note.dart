import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../application/cashback_providers.dart';
import '../cashback_copy.dart';

/// Nota de cashback na tela de sucesso de um PIX pago pelo app.
///
/// Ouve `lots/{paymentId}` enquanto a tela está aberta: o webhook cria o lote
/// logo depois de confirmar o pagamento — às vezes segundos depois da
/// navegação —, então a nota passa do texto genérico para "+R$ X pendente"
/// sozinha. Com o recurso desligado, nada.
class CashbackEarnedNote extends ConsumerWidget {
  const CashbackEarnedNote({
    super.key,
    required this.paymentId,
    this.padding = const EdgeInsets.only(top: AppSpacing.lg),
    this.onOpenCashback,
  });

  /// Id do pagamento no Asaas — é o id do lote.
  final String paymentId;
  final EdgeInsetsGeometry padding;

  /// Injetável para teste; em produção abre Meu cashback.
  final VoidCallback? onOpenCashback;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!ref.watch(cashbackEnabledProvider)) return const SizedBox.shrink();
    final lot = ref.watch(cashbackLotProvider(paymentId)).valueOrNull;
    final earnedCents =
        lot != null && lot.isPendingEarn ? lot.earnedCents : null;
    final accent = earnedCents != null ? AppColors.pending : AppColors.win;
    final colors = context.themeColors;
    return Padding(
      padding: padding,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: colors.surfaceCard,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: accent.withValues(alpha: 0.4)),
        ),
        child: Row(
          children: [
            Icon(Icons.savings_rounded, size: 20, color: accent),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                earnedCents != null
                    ? CashbackCopy.earnedNote(earnedCents)
                    : CashbackCopy.genericSuccessNote,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: colors.onSurface,
                      fontWeight: FontWeight.w600,
                      height: 1.35,
                    ),
              ),
            ),
            if (earnedCents == null)
              TextButton(
                onPressed: onOpenCashback ??
                    () => context.pushNamed(AppRouteNames.athleteCashback),
                child: const Text(CashbackCopy.openCashbackAction),
              ),
          ],
        ),
      ),
    );
  }
}
