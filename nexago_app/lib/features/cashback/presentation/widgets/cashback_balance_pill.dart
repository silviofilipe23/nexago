import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/formatting/app_currency_format.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_typography.dart';
import '../../application/cashback_providers.dart';
import '../cashback_copy.dart';

/// Pílula "R$ 12,40" do herói da home. Fundo escuro próprio, como a de XP: o
/// canto inferior direito das artes é claro (ver `AthleteHomeHero`).
class CashbackBalancePill extends StatelessWidget {
  const CashbackBalancePill({
    super.key,
    required this.balanceCents,
    required this.onTap,
  });

  final int balanceCents;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: CashbackCopy.pillTooltip,
      child: Material(
        color: AppColors.black.withValues(alpha: 0.55),
        borderRadius: AppRadii.pillAll,
        child: InkWell(
          onTap: onTap,
          borderRadius: AppRadii.pillAll,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            decoration: BoxDecoration(
              borderRadius: AppRadii.pillAll,
              border: Border.all(color: AppColors.win.withValues(alpha: 0.55)),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(
                  Icons.savings_rounded,
                  size: 16,
                  color: AppColors.win,
                ),
                const SizedBox(width: 5),
                Text(
                  formatBRLFromCents(balanceCents),
                  style: AppTypography.titleS.copyWith(
                    color: AppColors.white,
                    fontSize: 13,
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

/// Encaixe da pílula ao lado da de XP: some com o recurso desligado ou sem
/// saldo (disponível + pendente), levando o espaçamento junto.
class CashbackHeroPillSlot extends ConsumerWidget {
  const CashbackHeroPillSlot({super.key, this.onTap});

  /// Injetável para teste; em produção abre Meu cashback.
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cents = ref.watch(cashbackPillCentsProvider);
    if (cents == null) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(right: AppSpacing.sm),
      child: CashbackBalancePill(
        balanceCents: cents,
        onTap: onTap ?? () => context.pushNamed(AppRouteNames.athleteCashback),
      ),
    );
  }
}
