import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../professor_links/domain/arena_professor_link.dart';
import '../../../professor_links/domain/professor_link_rules.dart';
import '../../data/arena_professionals_repository.dart';
import '../arena_access_providers.dart';
import '../arena_staff_role.dart';

export '../../data/arena_professionals_repository.dart'
    show arenaProfessionalsRepositoryProvider;

/// Arena da tela Profissionais: a ativa, quando o usuário lê a área `perfil`
/// (dono + gestor — mesma fronteira das rules de `arenaProfessors`).
class ArenaProfessionalsScope {
  const ArenaProfessionalsScope({
    required this.arenaId,
    required this.arenaName,
    required this.canManage,
  });

  final String arenaId;
  final String arenaName;

  /// Escreve na área `perfil`: convida, aprova, suspende, mexe em permissão.
  final bool canManage;
}

/// `null` = sem arena ou sem acesso à área (a tela some dos Ajustes e a rota é
/// barrada pelo guard). Testes e o harness de QA sobrescrevem só este, o
/// repositório e o relógio.
final arenaProfessionalsScopeProvider =
    Provider<AsyncValue<ArenaProfessionalsScope?>>((ref) {
  return ref.watch(arenaAccessProvider).whenData((access) {
    final arenaId = access.arenaId?.trim() ?? '';
    if (arenaId.isEmpty || !access.canRead(ArenaArea.perfil)) return null;
    return ArenaProfessionalsScope(
      arenaId: arenaId,
      arenaName: access.arenaName,
      canManage: access.canWrite(ArenaArea.perfil),
    );
  });
});

/// Arenas em que o usuário administra professores. O detalhe vale para
/// qualquer uma delas — o push de uma arena que não é a selecionada abre o
/// vínculo certo, com as ações liberadas.
final arenaProfessionalsManagedArenaIdsProvider = Provider<Set<String>>((ref) {
  final memberships = ref.watch(arenaMembershipsProvider).valueOrNull;
  return {
    for (final m in memberships ?? const <ArenaMembership>[])
      if (m.canWrite(ArenaArea.perfil)) m.arenaId,
  };
});

/// Relógio das telas (convite vencido, "expira em N dias"). Injetável em teste.
final arenaProfessionalsClockProvider = Provider<DateTime Function()>(
  (ref) => DateTime.now,
);

/// Vínculos da arena (tempo real), todos os estados.
final arenaProfessionalLinksProvider = StreamProvider.autoDispose
    .family<List<ArenaProfessorLink>, String>((ref, arenaId) {
  if (arenaId.isEmpty) return Stream.value(const []);
  return ref
      .watch(arenaProfessionalsRepositoryProvider)
      .watchArenaLinks(arenaId);
});

/// Um vínculo pelo id (detalhe, folha de análise ao vivo).
final arenaProfessionalLinkProvider = StreamProvider.autoDispose
    .family<ArenaProfessorLink?, String>((ref, linkId) {
  if (linkId.isEmpty) return Stream.value(null);
  return ref.watch(arenaProfessionalsRepositoryProvider).watchLink(linkId);
});

/// Histórico do vínculo, do mais recente para o mais antigo.
final arenaProfessionalEventsProvider = StreamProvider.autoDispose
    .family<List<ArenaProfessorLinkEvent>, String>((ref, linkId) {
  if (linkId.isEmpty) return Stream.value(const []);
  return ref
      .watch(arenaProfessionalsRepositoryProvider)
      .watchEvents(linkId)
      .map(sortProfessorLinkEvents);
});
