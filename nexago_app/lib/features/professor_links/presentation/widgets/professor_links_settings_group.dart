import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/routes.dart';
import '../../../athlete/presentation/widgets/athlete_settings/athlete_settings_group.dart';
import '../../../professor_mode/application/professor_mode_providers.dart';
import '../../application/professor_links_providers.dart';
import '../../domain/professor_link_rules.dart';

/// Grupo "PROFESSOR" dos ajustes do atleta: a entrada de Minhas arenas. Só
/// aparece para quem tem algum vínculo (convite, pedido, ativo ou encerrado) —
/// o atleta que só joga não vê nada de professor. A porta antes do primeiro
/// vínculo é o card "Você é professor?" na página da arena e o convite da
/// arena (que já cria o vínculo e faz o grupo aparecer). Traz o próprio
/// espaçamento inferior para não deixar um vão quando some.
class ProfessorLinksSettingsGroup extends ConsumerWidget {
  const ProfessorLinksSettingsGroup({super.key, this.onTap});

  /// Injetável para teste; em produção abre Minhas arenas.
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final links = ref.watch(myProfessorLinksProvider).valueOrNull ?? const [];
    // Vínculo aprovado com o app aberto: o modo Professor aparece em
    // "Trocar papel" sem relogar.
    ref.watch(professorRoleSyncProvider);
    final now = ref.watch(professorLinksClockProvider)();
    if (links.isEmpty) return const SizedBox.shrink();
    final invites = professorOpenInvites(links, now).length;
    return Padding(
      padding: EdgeInsets.only(bottom: AthleteSettingsTokens.sectionGap),
      child: AthleteSettingsGroup(
        sectionLabel: 'PROFESSOR',
        children: [
          AthleteSettingsTile(
            key: const Key('professor-links-settings-tile'),
            icon: Icons.school_outlined,
            title: 'Minhas arenas',
            subtitle: professorLinksEntrySubtitle(links, now),
            trailingBadge: invites > 0
                ? AthleteSettingsOrangeBadge(
                    label: invites == 1 ? '1 CONVITE' : '$invites CONVITES',
                  )
                : null,
            onTap:
                onTap ?? () => context.pushNamed(AppRouteNames.professorArenas),
            showDivider: false,
          ),
        ],
      ),
    );
  }
}
