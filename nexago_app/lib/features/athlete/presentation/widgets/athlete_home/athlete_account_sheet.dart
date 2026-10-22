import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../../core/auth/active_role_providers.dart';
import '../../../../../core/router/routes.dart';
import '../../../../auth/presentation/role_selection_page.dart';
import '../../../../professor_links/presentation/widgets/professor_links_ui.dart';

enum AthleteAccountAction { profile, settings, switchRole }

/// Menu do avatar da Home do atleta: Meu perfil, Configurações e — com mais
/// de um papel — Trocar papel. Mesmo padrão da folha do modo Professor.
///
/// A folha só devolve a escolha; quem navega é o [context]/[ref] da Home, que
/// continuam vivos depois que a folha fecha.
Future<void> openAthleteAccountMenu(BuildContext context, WidgetRef ref) async {
  final action = await showProfessorLinksSheet<AthleteAccountAction>(
    context,
    builder: (_) => const _AthleteAccountSheet(),
  );
  if (action == null || !context.mounted) return;
  switch (action) {
    case AthleteAccountAction.profile:
      context.pushNamed(AppRouteNames.athleteProfile);
    case AthleteAccountAction.settings:
      context.pushNamed(AppRouteNames.athleteSettings);
    case AthleteAccountAction.switchRole:
      await navigateToRoleSelection(context, ref);
  }
}

class _AthleteAccountSheet extends ConsumerWidget {
  const _AthleteAccountSheet();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final canSwitchRole = ref.watch(hasMultipleMobileRolesProvider);
    void choose(AthleteAccountAction a) => Navigator.of(context).pop(a);
    // O corpo da folha já põe 12 entre os itens: espaçador aqui somava 34.
    return ProfessorLinksSheetBody(
      title: 'Sua conta',
      children: [
        ProfessorLinksSheetRow(
          key: const Key('athlete-account-profile'),
          icon: Icons.person_outline_rounded,
          title: 'Meu perfil',
          subtitle: 'Seus dados, níveis e histórico',
          onTap: () => choose(AthleteAccountAction.profile),
        ),
        ProfessorLinksSheetRow(
          key: const Key('athlete-account-settings'),
          icon: Icons.settings_outlined,
          title: 'Configurações',
          subtitle: 'Conta, notificações e privacidade',
          onTap: () => choose(AthleteAccountAction.settings),
        ),
        if (canSwitchRole) ...[
          ProfessorLinksSheetRow(
            key: const Key('athlete-account-switch-role'),
            icon: Icons.swap_horiz_rounded,
            title: 'Trocar papel',
            subtitle: 'Professor, gestor de arena ou organizador',
            onTap: () => choose(AthleteAccountAction.switchRole),
          ),
        ],
      ],
    );
  }
}
