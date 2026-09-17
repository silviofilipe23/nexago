import 'package:nexago_app/core/ui/app_status_views.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

import '../../domain/tournament_ops/tournament_ops_providers.dart';
import '../../domain/tournament_staff/my_tournament_staff_providers.dart';
import 'tabs/organizer_tournament_financial_tab.dart';
import 'widgets/organizer_tournament_subpage_scaffold.dart';

class OrganizerTournamentFinancialPage extends ConsumerWidget {
  const OrganizerTournamentFinancialPage({
    super.key,
    required this.tournamentId,
  });

  final String tournamentId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final detailAsync = ref.watch(organizerTournamentDetailProvider(tournamentId));

    // A entrada para esta tela já é escondida de quem não é dono, mas a rota
    // fica sob `/organizer/tournaments/...`, que é operável por staff — quem
    // chegar aqui por link direto passava reto e via o repasse líquido do
    // evento. Esconder o atalho não é fronteira; a verificação de papel é.
    if (!ref.watch(organizerSeesTournamentMoneyProvider(tournamentId))) {
      return const OrganizerTournamentSubpageScaffold(
        title: 'Financeiro',
        slivers: [
          SliverFillRemaining(
            hasScrollBody: false,
            child: AppEmptyView(
              icon: Icons.lock_outline_rounded,
              title: 'O caixa é de quem responde pelo dinheiro',
              subtitle: 'Quem é administrador do evento organiza tudo — '
                  'inscrições, chaves, agenda e placar — e não acessa o caixa. '
                  'Arrecadação e repasse ficam com o dono do evento e com os '
                  'gestores da equipe dele.',
            ),
          ),
        ],
      );
    }

    return detailAsync.when(
      loading: () => const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      ),
      error: (e, _) => Scaffold(body: AppInlineErrorView(error: e)),
      data: (state) {
        if (state.summary == null) {
          return const Scaffold(
            body: Center(child: Text('Torneio não encontrado')),
          );
        }
        return OrganizerTournamentSubpageScaffold(
          title: 'Financeiro',
          trailing: Material(
            color: context.themeColors.surfaceRaised,
            borderRadius: BorderRadius.circular(12),
            child: InkWell(
              onTap: () {},
              borderRadius: BorderRadius.circular(12),
              child: const SizedBox(
                width: 44,
                height: 44,
                child: Icon(Icons.description_outlined, size: 22),
              ),
            ),
          ),
          slivers: [
            SliverFillRemaining(
              hasScrollBody: true,
              child: OrganizerTournamentFinancialTab(
                summary: state.summary!,
                categories: state.categories,
              ),
            ),
          ],
        );
      },
    );
  }
}
