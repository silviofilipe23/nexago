import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../professor_links/application/professor_links_providers.dart';
import '../domain/professor_students.dart';
import '../domain/professor_students_logic.dart';
import '../infrastructure/professor_students_repository.dart';

export '../infrastructure/professor_students_repository.dart'
    show professorStudentsRepositoryProvider;

/// Alunos, turmas e arenas do professor (`getMyProfessorStudents`). Um
/// resultado só serve Alunos, Aluno e Minhas turmas — a tela do aluno lê
/// daqui, sem outra ida ao servidor. O erro chega à tela (com "tentar de
/// novo"): "nenhum aluno" por falha de rede enganaria. Fica vivo entre as
/// abas e a tela do aluno; atualiza puxando a lista (ou trocando de conta).
final professorStudentsProvider =
    FutureProvider<ProfessorStudentsSnapshot>((ref) async {
  if (ref.watch(professorLinksUidProvider).isEmpty) {
    return ProfessorStudentsSnapshot.empty;
  }
  return ref.watch(professorStudentsRepositoryProvider).fetchMyStudents();
});

/// Arena escolhida em "Ver alunos de…" (`null` = todas).
final professorStudentsArenaProvider = StateProvider<String?>((ref) => null);

/// Chip da lista de alunos.
final professorStudentsFilterProvider =
    StateProvider<ProfessorStudentFilter>((ref) => ProfessorStudentFilter.all);

/// Anotação privada do professor sobre o aluno (tempo real, '' sem nada).
final professorStudentNoteProvider = StreamProvider.autoDispose
    .family<String, ({String arenaId, String studentId})>((ref, key) {
  final uid = ref.watch(professorLinksUidProvider);
  if (uid.isEmpty) return Stream.value('');
  return ref.watch(professorStudentsRepositoryProvider).watchNote(
        uid: uid,
        arenaId: key.arenaId,
        studentId: key.studentId,
      );
});
