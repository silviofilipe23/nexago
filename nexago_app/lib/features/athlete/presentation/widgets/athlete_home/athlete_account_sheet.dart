import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../../core/auth/active_role_providers.dart';
import '../../../../../core/observability/analytics_log.dart';
import '../../../../../core/router/routes.dart';
import '../../../../../core/theme/app_theme_colors.dart';
import '../../../../auth/presentation/role_selection_page.dart';
import '../../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../../domain/athlete_display_name.dart';
import '../../../domain/athlete_profile_providers.dart';
import '../athlete_profile_avatar.dart';

enum AthleteAccountAction { profile, settings, switchRole }

/// O que o leitor de tela anuncia em toda entrada do menu da conta.
const athleteAccountMenuSemanticLabel =
    'Sua conta: perfil, configurações e trocar papel';

/// Avatar com a seta ⌄ no canto, à esquerda do título das abas do atleta,
/// abrindo [openAthleteAccountMenu].
///
/// Antes o menu da conta só existia no avatar do topo da Início, sem nada que
/// dissesse que ele abria um menu: em Agenda, Reservar, Hub e Loja o atleta
/// não tinha caminho pro perfil nem pras configurações. Mesmo lugar (canto
/// esquerdo do header) e mesmo desenho em todas as abas.
class AthleteAccountButton extends ConsumerWidget {
  const AthleteAccountButton({super.key, required this.origin});

  /// A aba onde o botão está (`agenda`, `reservar`, `hub`…), para o analytics.
  final String origin;

  static const double _avatarSize = 36;

  /// Alvo de toque mínimo de 44 (HIG) em volta do avatar de 36.
  static const double _slotSize = 44;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final profile = ref.watch(athleteProfileProvider).valueOrNull;

    return Semantics(
      button: true,
      label: athleteAccountMenuSemanticLabel,
      excludeSemantics: true,
      child: Tooltip(
        message: 'Sua conta',
        child: InkWell(
          key: const Key('athlete-account-button'),
          onTap: () => openAthleteAccountMenu(context, ref, origin: origin),
          customBorder: const CircleBorder(),
          child: SizedBox(
            width: _slotSize,
            height: _slotSize,
            child: Stack(
              alignment: Alignment.center,
              clipBehavior: Clip.none,
              children: [
                AthleteProfileAvatar(
                  size: _avatarSize,
                  initials: profile != null ? athleteInitials(profile) : '?',
                  imageUrl: profile?.avatarUrl,
                ),
                Positioned(
                  right: 0,
                  bottom: 0,
                  child: Container(
                    width: 18,
                    height: 18,
                    decoration: BoxDecoration(
                      color: colors.surfaceRaised,
                      shape: BoxShape.circle,
                      border: Border.all(color: colors.canvas, width: 2),
                    ),
                    child: Icon(
                      Icons.expand_more_rounded,
                      size: 14,
                      color: colors.onSurface,
                    ),
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

/// Menu do avatar da Home do atleta: Meu perfil, Configurações e — com mais
/// de um papel — Trocar papel. Mesmo padrão da folha do modo Professor.
///
/// A folha só devolve a escolha; quem navega é o [context]/[ref] da Home, que
/// continuam vivos depois que a folha fecha.
///
/// [origin] é a aba de onde o avatar foi tocado (`inicio`, `agenda`…): vai
/// para o analytics, junto da escolha, para medir se o menu passou a ser
/// achado fora da Início.
Future<void> openAthleteAccountMenu(
  BuildContext context,
  WidgetRef ref, {
  required String origin,
}) async {
  logAnalytics(ref, (a) => a.logAccountMenuOpened(origin));
  final action = await showProfessorLinksSheet<AthleteAccountAction>(
    context,
    builder: (_) => const _AthleteAccountSheet(),
  );
  if (!context.mounted) return;
  logAnalytics(
    ref,
    (a) => a.logAccountMenuAction(
      origin: origin,
      action: switch (action) {
        AthleteAccountAction.profile => 'perfil',
        AthleteAccountAction.settings => 'configuracoes',
        AthleteAccountAction.switchRole => 'trocar_papel',
        null => 'fechou',
      },
    ),
  );
  if (action == null) return;
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
