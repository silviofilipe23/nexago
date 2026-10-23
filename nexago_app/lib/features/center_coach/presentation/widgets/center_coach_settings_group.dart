import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/routes.dart';
import '../../../athlete/presentation/widgets/athlete_settings/athlete_settings_group.dart';
import '../../application/center_coach_providers.dart';

/// Grupo "CENTRO DE TREINAMENTO" dos ajustes do atleta: a agenda de quem é da
/// equipe de algum centro (professor, recepção, gestão). Só aparece com
/// vínculo ativo; traz o próprio espaçamento inferior.
class CenterCoachSettingsGroup extends ConsumerWidget {
  const CenterCoachSettingsGroup({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    ref.watch(centerRoleSyncProvider);
    final active = ref.watch(activeCenterMembershipsProvider);
    if (active.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: EdgeInsets.only(bottom: AthleteSettingsTokens.sectionGap),
      child: AthleteSettingsGroup(
        sectionLabel: 'CENTRO DE TREINAMENTO',
        children: [
          AthleteSettingsTile(
            key: const Key('center-coach-settings-tile'),
            icon: Icons.sports_rounded,
            title: 'Centros onde dou aula',
            subtitle: active.length == 1
                ? '${active.first.centerName} · agenda e chamada'
                : '${active.length} centros · agenda e chamada',
            onTap: () => context.pushNamed(AppRouteNames.centerCoachAgenda),
            showDivider: false,
          ),
        ],
      ),
    );
  }
}
