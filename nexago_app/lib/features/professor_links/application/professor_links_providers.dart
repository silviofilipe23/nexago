import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_providers.dart';
import '../domain/arena_professor_link.dart';
import '../domain/professor_link_rules.dart';
import '../infrastructure/firebase_professor_links_repository.dart';

export '../infrastructure/firebase_professor_links_repository.dart'
    show professorLinksRepositoryProvider;

/// Uid da sessão; vazio deslogado (nenhuma leitura é feita). Tudo da feature
/// lê o uid daqui — o harness de QA sobrescreve só este e o repositório.
final professorLinksUidProvider = Provider<String>((ref) {
  return ref.watch(authProvider).valueOrNull?.uid.trim() ?? '';
});

/// Relógio das telas (convite vencido, "Expira em N dias"). Injetável em teste.
final professorLinksClockProvider = Provider<DateTime Function()>(
  (ref) => DateTime.now,
);

/// Vínculos do professor da sessão (tempo real).
final myProfessorLinksProvider =
    StreamProvider.autoDispose<List<ArenaProfessorLink>>((ref) {
  final uid = ref.watch(professorLinksUidProvider);
  if (uid.isEmpty) return Stream.value(const []);
  return ref.watch(professorLinksRepositoryProvider).watchMyLinks(uid);
});

/// Um vínculo pelo id (detalhe, sucesso do pedido, folha de duplicado).
final professorLinkProvider = StreamProvider.autoDispose
    .family<ArenaProfessorLink?, String>((ref, linkId) {
  if (ref.watch(professorLinksUidProvider).isEmpty || linkId.isEmpty) {
    return Stream.value(null);
  }
  return ref.watch(professorLinksRepositoryProvider).watchLink(linkId);
});

/// Histórico do vínculo, do mais recente para o mais antigo.
final professorLinkEventsProvider = StreamProvider.autoDispose
    .family<List<ArenaProfessorLinkEvent>, String>((ref, linkId) {
  if (ref.watch(professorLinksUidProvider).isEmpty || linkId.isEmpty) {
    return Stream.value(const []);
  }
  return ref
      .watch(professorLinksRepositoryProvider)
      .watchEvents(linkId)
      .map(sortProfessorLinkEvents);
});

/// Vínculo do professor da sessão com ESTA arena (`{arenaId}_{uid}`), para o
/// card da página da arena. Deslogado ou sem acesso = `null` (sem vínculo):
/// o card nunca quebra a página.
final myArenaProfessorLinkProvider = StreamProvider.autoDispose
    .family<ArenaProfessorLink?, String>((ref, arenaId) {
  final uid = ref.watch(professorLinksUidProvider);
  if (uid.isEmpty || arenaId.isEmpty) return Stream.value(null);
  return ref
      .watch(professorLinksRepositoryProvider)
      .watchLink(arenaProfessorLinkIdFor(arenaId, uid))
      .transform(
        StreamTransformer<ArenaProfessorLink?,
            ArenaProfessorLink?>.fromHandlers(
          handleError: (error, stackTrace, sink) => sink.add(null),
        ),
      );
});

/// "Professores" da página pública da arena (leitura pública), já ordenados.
/// Erro de leitura = lista vazia: a seção some.
final arenaPublicProfessorsProvider = StreamProvider.autoDispose
    .family<List<PublicArenaProfessor>, String>((ref, arenaId) {
  if (arenaId.isEmpty) return Stream.value(const []);
  return ref
      .watch(professorLinksRepositoryProvider)
      .watchPublicProfessors(arenaId)
      .map(sortPublicArenaProfessors)
      .transform(
        StreamTransformer<List<PublicArenaProfessor>,
            List<PublicArenaProfessor>>.fromHandlers(
          handleError: (error, stackTrace, sink) => sink.add(const []),
        ),
      );
});
