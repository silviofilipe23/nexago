import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../professor_links/application/professor_links_providers.dart';
import '../domain/professor_notices.dart';
import '../infrastructure/professor_notices_repository.dart';
import 'professor_students_providers.dart';
import 'professor_wallet_providers.dart';

export '../infrastructure/professor_notices_repository.dart'
    show professorNoticesRepositoryProvider;

/// Comunicados do professor, em tempo real.
final professorNoticesProvider =
    StreamProvider.autoDispose<List<ProfessorNotice>>((ref) {
  final uid = ref.watch(professorLinksUidProvider);
  if (uid.isEmpty) return Stream.value(const []);
  return ref.watch(professorNoticesRepositoryProvider).watchMyNotices(uid);
});

final professorNoticeRecipientsProvider = StreamProvider.autoDispose
    .family<List<ProfessorNoticeRecipient>, String>((ref, noticeId) {
  return ref
      .watch(professorNoticesRepositoryProvider)
      .watchRecipients(noticeId);
});

/// Aba da lista (F1).
final professorNoticesTabProvider =
    StateProvider<ProfessorNoticeStatus>((ref) => ProfessorNoticeStatus.sent);

/// Turmas que podem receber (F3): as das arenas em que o professor vê os
/// alunos — a mesma régua do servidor.
final professorNoticeClassesProvider =
    Provider.autoDispose<List<ProfessorNoticeClass>>((ref) {
  final snap = ref.watch(professorStudentsProvider).valueOrNull;
  if (snap == null) return const [];
  return [
    for (final c in snap.classes)
      if (snap.arena(c.arenaId)?.canSeeStudents ?? false)
        (
          classId: c.classId,
          name: c.name,
          arenaId: c.arenaId,
          arenaName: c.arenaName,
          students: c.activeCount,
        ),
  ];
});

/// Nome de cada aluno (turmas + carteira) para o relatório; sem nome, "Aluno".
final professorStudentNamesProvider =
    Provider.autoDispose<Map<String, ({String name, String? photoUrl})>>((ref) {
  final out = <String, ({String name, String? photoUrl})>{};
  for (final s in ref.watch(professorStudentsProvider).valueOrNull?.students ??
      const []) {
    final id = s.athleteId;
    if (id != null && id.isNotEmpty) {
      out.putIfAbsent(id, () => (name: s.name, photoUrl: s.photoUrl));
    }
  }
  for (final s in ref.watch(professorWalletAllStudentsProvider).valueOrNull ??
      const []) {
    out.putIfAbsent(s.athleteId, () => (name: s.name, photoUrl: s.photoUrl));
  }
  return out;
});

// ── lado do aluno ──

final professorNoticeForStudentProvider = StreamProvider.autoDispose
    .family<ProfessorNotice?, String>((ref, noticeId) {
  if (ref.watch(professorLinksUidProvider).isEmpty || noticeId.isEmpty) {
    return Stream.value(null);
  }
  return ref.watch(professorNoticesRepositoryProvider).watchNotice(noticeId);
});

final professorNoticeMyReplyProvider = StreamProvider.autoDispose
    .family<ProfessorNoticeRecipient?, String>((ref, noticeId) {
  final uid = ref.watch(professorLinksUidProvider);
  if (uid.isEmpty || noticeId.isEmpty) return Stream.value(null);
  return ref
      .watch(professorNoticesRepositoryProvider)
      .watchMyReply(noticeId, uid);
});
