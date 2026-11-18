import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'arena_access_providers.dart';
import 'arena_staff_role.dart';

/// Abas internas do Painel da arena.
enum ArenaHomeTab { now, business, clients }

extension ArenaHomeTabX on ArenaHomeTab {
  String get label => switch (this) {
    ArenaHomeTab.now => 'Agora',
    ArenaHomeTab.business => 'Negócio',
    ArenaHomeTab.clients => 'Clientes',
  };
}

/// Aba em que o Painel abre: o financeiro cai direto nos números; os demais
/// cargos (e o dono) começam pela operação do momento.
ArenaHomeTab arenaHomeDefaultTab(ArenaStaffRole? role) {
  return role == ArenaStaffRole.financeiro
      ? ArenaHomeTab.business
      : ArenaHomeTab.now;
}

/// Escolha manual do usuário nesta sessão; `null` = usar a do cargo.
final arenaHomeTabChoiceProvider = StateProvider<ArenaHomeTab?>((ref) => null);

/// Aba visível agora.
final arenaHomeTabProvider = Provider<ArenaHomeTab>((ref) {
  final chosen = ref.watch(arenaHomeTabChoiceProvider);
  if (chosen != null) return chosen;
  final role = ref.watch(arenaAccessProvider).valueOrNull?.role;
  return arenaHomeDefaultTab(role);
});
