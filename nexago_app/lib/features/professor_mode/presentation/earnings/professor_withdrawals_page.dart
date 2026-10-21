import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/formatting/app_currency_format.dart';
import '../../../../core/router/navigation_helpers.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../application/professor_earnings_providers.dart';
import '../../domain/professor_earnings.dart';
import '../widgets/professor_students_widgets.dart';
import '../wallet/professor_wallet_widgets.dart';
import 'professor_earnings_page.dart';

/// C8 Histórico de saques, com a situação de cada um.
class ProfessorWithdrawalsPage extends ConsumerWidget {
  const ProfessorWithdrawalsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final async = ref.watch(professorWithdrawalsProvider);
    final list = async.valueOrNull;
    final year = DateTime.now().year;
    return ProfessorLinksScaffold(
      title: 'Saques',
      subtitle: 'HISTÓRICO',
      onBack: () => popOrGo(context, AppRoutes.professorEarnings),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
        children: [
          if (list == null && async.hasError)
            ProfessorRetryCard(
              message: 'Não foi possível carregar seus saques.',
              onRetry: () => ref.invalidate(professorWithdrawalsProvider),
            )
          else if (list == null)
            const ProfessorWalletLoading()
          else ...[
            ProfessorLinksCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    formatBRL(professorWithdrawnInYear(list, year)),
                    key: const Key('professor-withdrawals-year-total'),
                    style: ProfessorLinksStyle.display(
                      17,
                      color: colors.onSurface,
                    ),
                  ),
                  Text(
                    'sacado em $year · sem tarifa',
                    style: AppTypography.bodyS.copyWith(
                      fontSize: 11,
                      color: ProfessorLinksStyle.dim(colors),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 10),
            if (list.isEmpty)
              const ProfessorMutedText('Nenhum saque ainda.')
            else
              for (final w in list)
                ProfessorWithdrawalRow(
                  key: Key('professor-withdrawal-${w.id}'),
                  withdrawal: w,
                ),
          ],
        ],
      ),
    );
  }
}
