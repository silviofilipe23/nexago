import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/firebase/firebase_providers.dart';
import '../../../core/firebase/functions_region.dart';
import '../../tournaments/data/tournament_partner_invite_service.dart'
    show callableErrorMessage;
import '../domain/professor_availability.dart';
import 'professor_students_repository.dart' show ProfessorStudentsException;

/// Disponibilidade e particulares: leitura direta (a rule libera o dono, ou
/// qualquer logado quando publicada; a particular para os dois lados) e
/// escrita só por callable. Falhas como [ProfessorStudentsException], com a
/// mensagem do servidor ("Este horário não está mais livre…").
abstract class ProfessorAvailabilityRepository {
  /// `null` = sem documento.
  Stream<ProfessorAvailability?> watchAvailability(String professorUid);

  Future<void> saveAvailability(Map<String, Object?> payload);

  /// Do professor, a partir de [since] (início mais cedo primeiro).
  Stream<List<PrivateLesson>> watchProfessorLessons(
    String professorUid, {
    required DateTime since,
  });

  /// Do aluno (mais recente primeiro).
  Stream<List<PrivateLesson>> watchAthleteLessons(String athleteUid);

  Future<ProfessorOpenSlots> fetchOpenSlots(
    String professorUid, {
    int days = kPrivateLessonWindowDays,
  });

  Future<PrivateLessonRequestResult> requestLesson(PrivateLessonRequest r);

  Future<void> respond(String lessonId, {required bool accept});

  /// Devolve `lateCancel`.
  Future<bool> cancel(String lessonId, {String? reason});
}

class FirebaseProfessorAvailabilityRepository
    implements ProfessorAvailabilityRepository {
  FirebaseProfessorAvailabilityRepository({
    required FirebaseFirestore firestore,
    FirebaseFunctions? functions,
  })  : _firestore = firestore,
        _functions = functions ?? nexagoFunctions;

  final FirebaseFirestore _firestore;
  final FirebaseFunctions _functions;

  CollectionReference<Map<String, dynamic>> get _lessons =>
      _firestore.collection('professorPrivateLessons');

  List<PrivateLesson> _map(QuerySnapshot<Map<String, dynamic>> q) => [
        for (final d in q.docs)
          if (PrivateLesson.fromMap(d.id, d.data()) case final l?) l,
      ];

  @override
  Stream<ProfessorAvailability?> watchAvailability(String professorUid) =>
      _firestore
          .collection('professorAvailability')
          .doc(professorUid)
          .snapshots()
          .map((d) {
        final data = d.data();
        return data == null ? null : ProfessorAvailability.fromMap(data);
      });

  @override
  Stream<List<PrivateLesson>> watchProfessorLessons(
    String professorUid, {
    required DateTime since,
  }) =>
      _lessons
          .where('professorUid', isEqualTo: professorUid)
          .where('startAt', isGreaterThanOrEqualTo: Timestamp.fromDate(since))
          .orderBy('startAt')
          .snapshots()
          .map(_map);

  @override
  Stream<List<PrivateLesson>> watchAthleteLessons(String athleteUid) => _lessons
      .where('athleteId', isEqualTo: athleteUid)
      .orderBy('startAt', descending: true)
      .limit(100)
      .snapshots()
      .map(_map);

  Future<Map<String, Object?>> _call(
    String name,
    Map<String, Object?> data,
    String fallback,
  ) async {
    try {
      final result = await _functions.httpsCallable(name).call<Object?>(data);
      final raw = result.data;
      return raw is Map
          ? raw.map((k, v) => MapEntry(k.toString(), v))
          : const <String, Object?>{};
    } on FirebaseFunctionsException catch (e) {
      throw ProfessorStudentsException(
        callableErrorMessage(e.code, e.message, fallback),
      );
    }
  }

  @override
  Future<void> saveAvailability(Map<String, Object?> payload) => _call(
        'saveProfessorAvailability',
        payload,
        'Não foi possível publicar seus horários.',
      );

  @override
  Future<ProfessorOpenSlots> fetchOpenSlots(
    String professorUid, {
    int days = kPrivateLessonWindowDays,
  }) async =>
      ProfessorOpenSlots.fromMap(await _call(
        'getProfessorOpenSlots',
        {'professorUid': professorUid, 'days': days},
        'Não foi possível carregar os horários.',
      ));

  @override
  Future<PrivateLessonRequestResult> requestLesson(
    PrivateLessonRequest r,
  ) async {
    final res = await _call(
      'requestPrivateLesson',
      r.toPayload(),
      'Não foi possível agendar a aula.',
    );
    return (
      lessonId: res['lessonId'] is String ? res['lessonId']! as String : '',
      status: res['status'] == 'confirmed'
          ? PrivateLessonStatus.confirmed
          : PrivateLessonStatus.pending,
    );
  }

  @override
  Future<void> respond(String lessonId, {required bool accept}) => _call(
        'respondPrivateLesson',
        {'lessonId': lessonId, 'accept': accept},
        'Não foi possível responder o pedido.',
      );

  @override
  Future<bool> cancel(String lessonId, {String? reason}) async {
    final r = reason?.trim() ?? '';
    final res = await _call(
      'cancelPrivateLesson',
      {'lessonId': lessonId, if (r.isNotEmpty) 'reason': r},
      'Não foi possível cancelar a aula.',
    );
    return res['lateCancel'] == true;
  }
}

final professorAvailabilityRepositoryProvider =
    Provider<ProfessorAvailabilityRepository>((ref) {
  return FirebaseProfessorAvailabilityRepository(
    firestore: ref.watch(firestoreProvider),
  );
});
