import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/formatting/app_currency_format.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../application/athlete_billing_providers.dart';
import 'athlete_billing_widgets.dart';

/// C0 · Card vermelho da Início quando há cobrança vencida. Antes do
/// vencimento não aparece (o push já avisa); sem nada vencido, some sem
/// deixar vão. "Pagar" abre a mais antiga; "Ver cobranças", a lista.
class AthleteBillingHomeAlert extends ConsumerWidget {
  const AthleteBillingHomeAlert({super.key, this.bottomGap = 12});

  final double bottomGap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final overdue = [
      for (final c in ref.watch(athleteOpenChargesProvider) ?? const [])
        if (c.isOverdue) c,
    ];
    if (overdue.isEmpty) return const SizedBox.shrink();
    final colors = context.themeColors;
    final red = colors.readableTone(AppColors.live);
    final first = overdue.first;
    final total = overdue.fold<double>(0, (a, c) => a + c.amountReais);
    return Padding(
      key: const Key('athlete-billing-home-alert'),
      padding: EdgeInsets.fromLTRB(
        AppSpacing.screenH,
        0,
        AppSpacing.screenH,
        bottomGap,
      ),
      child: ProfessorLinksCard(
        backgroundColor: AppColors.live.withValues(alpha: 0.07),
        borderColor: AppColors.live.withValues(alpha: 0.35),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Icon(Icons.warning_amber_rounded, size: 18, color: red),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    overdue.length == 1
                        ? '1 cobrança vencida'
                        : '${overdue.length} cobranças vencidas',
                    style: ProfessorLinksStyle.display(
                      13.5,
                      weight: FontWeight.w700,
                      color: red,
                    ),
                  ),
                ),
                Text(
                  formatBRL(total),
                  style: ProfessorLinksStyle.mono(13, color: colors.onSurface),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              overdue.length == 1
                  ? '${first.title} · ${first.payee}'
                  : 'A mais antiga: ${first.title} · ${first.payee}',
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: AppTypography.bodyS.copyWith(
                fontSize: 12.5,
                height: 1.4,
                color: ProfessorLinksStyle.mute(colors),
              ),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: FilledButton(
                    key: const Key('athlete-billing-home-pay'),
                    onPressed: () => openAthleteCharge(context, first),
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.brand,
                      foregroundColor: ProfessorLinksStyle.onBrand,
                      minimumSize: const Size.fromHeight(44),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    child: const Text(
                      'Pagar',
                      style: TextStyle(fontWeight: FontWeight.w800),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: OutlinedButton(
                    key: const Key('athlete-billing-home-open'),
                    onPressed: () =>
                        context.pushNamed(AppRouteNames.athleteBilling),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: colors.onSurface,
                      minimumSize: const Size.fromHeight(44),
                      side: BorderSide(
                        color: ProfessorLinksStyle.line2(colors),
                      ),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    child: const Text(
                      'Ver cobranças',
                      style: TextStyle(fontWeight: FontWeight.w700),
                    ),
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
