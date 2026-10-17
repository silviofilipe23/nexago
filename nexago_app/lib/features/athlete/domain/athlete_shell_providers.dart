import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/ui/shell_scroll_registry.dart';

/// Índice da aba ativa no [AthleteShellPage] (0 = Início … 4 = Loja ou
/// Comunidade — ver [athleteShellStoreTabIndex]).
final athleteShellTabIndexProvider = StateProvider<int>((ref) => 0);

/// Controllers de scroll das abas do shell do atleta.
final athleteShellScrollRegistryProvider = Provider<ShellScrollRegistry>((ref) {
  final registry = ShellScrollRegistry(5);
  ref.onDispose(registry.dispose);
  return registry;
});

/// Aba Reservar — lista de arenas.
const athleteShellReservarTabIndex = 2;

/// Aba Agenda — timeline unificada.
const athleteShellAgendaTabIndex = 1;

/// Aba Competir / torneios.
const athleteShellCompeteTabIndex = 3;

/// Aba Comunidade — a última, enquanto a Loja está desligada.
const athleteShellCommunityTabIndex = 4;

/// Aba Loja: ocupa o lugar da Comunidade com `appConfig/store.enabled`
/// ligado. A Comunidade continua pela Home ("Ver todos" → `/comunidade`).
const athleteShellStoreTabIndex = 4;
