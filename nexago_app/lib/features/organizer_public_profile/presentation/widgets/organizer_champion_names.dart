import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../domain/organizer_public_profile_providers.dart';

/// Nomes das duplas campeãs como a tela os vê: carregando, com erro ou prontos. Carregando não
/// é "sem campeões" — a tela mostra o esqueleto, não "Campeões ainda não registrados".
class OrganizerChampionNames {
  const OrganizerChampionNames({
    this.names = const {},
    this.loading = false,
    this.failed = false,
  });

  final Map<String, String> names;
  final bool loading;
  final bool failed;

  static const ready = OrganizerChampionNames();

  static OrganizerChampionNames fromAsync(
    AsyncValue<Map<String, String>> value,
  ) {
    if (value.hasValue) return OrganizerChampionNames(names: value.value!);
    if (value.hasError) return const OrganizerChampionNames(failed: true);
    return const OrganizerChampionNames(loading: true);
  }
}

/// Observa a busca de nomes para a chave dada — no build DESTE widget, não no builder de outro
/// (o `ref.watch` fica no ciclo do consumidor certo). Chave vazia não lê nada.
class OrganizerChampionNamesScope extends ConsumerWidget {
  const OrganizerChampionNamesScope({
    super.key,
    required this.teamIdsKey,
    required this.builder,
  });

  final String teamIdsKey;
  final Widget Function(BuildContext context, OrganizerChampionNames names)
  builder;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (teamIdsKey.isEmpty) {
      return builder(context, OrganizerChampionNames.ready);
    }
    return builder(
      context,
      OrganizerChampionNames.fromAsync(
        ref.watch(championTeamNamesByKeyProvider(teamIdsKey)),
      ),
    );
  }
}
