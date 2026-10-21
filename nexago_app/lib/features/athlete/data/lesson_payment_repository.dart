import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/firebase/firebase_providers.dart';
import '../../professor_mode/domain/professor_lessons.dart';
import '../domain/lesson_payment/lesson_payment.dart';

/// Leituras do atleta para "Pagamento confirmado" e o comprovante (B17/B19).
/// Tudo direto do Firestore: as rules deixam o aluno ler a cobrança dele, o
/// próprio registro na carteira do professor e as aulas ligadas a ele.
class LessonPaymentRepository {
  LessonPaymentRepository(this._firestore);

  final FirebaseFirestore _firestore;

  /// A cobrança, ao vivo — a tela pode abrir antes de o webhook dar baixa.
  Stream<LessonPayment?> watchPayment(String chargeId) => _firestore
      .collection('professorCharges')
      .doc(chargeId)
      .snapshots()
      .map((d) => d.exists ? LessonPayment.fromMap(d.id, d.data()!) : null);

  Future<LessonPaymentRecurrence?> fetchRecurrence({
    required String professorUid,
    required String athleteId,
  }) async {
    final doc = await _firestore
        .collection('professors')
        .doc(professorUid)
        .collection('students')
        .doc(athleteId)
        .get();
    return LessonPaymentRecurrence.fromStudentMap(doc.data());
  }

  /// Próxima aula com o professor: as aulas futuras e, uma a uma, a situação
  /// da reserva (cancelada não conta). Só igualdades na consulta (sem índice).
  Future<ProfessorLesson?> fetchNextLesson({
    required String professorUid,
    required String athleteId,
    required DateTime now,
  }) async {
    final snap = await _firestore
        .collection('professorLessons')
        .where('athleteId', isEqualTo: athleteId)
        .where('professorUid', isEqualTo: professorUid)
        .get();
    final upcoming = lessonPaymentUpcoming(
      [for (final d in snap.docs) ProfessorLesson.fromMap(d.id, d.data())],
      now,
    );
    for (final lesson in upcoming.take(5)) {
      final booking = await _firestore
          .collection('arenaBookings')
          .doc(lesson.bookingId)
          .get();
      final status = booking.data()?['status'];
      if (!professorBookingIsVoid(status is String ? status : null)) {
        return lesson;
      }
    }
    return null;
  }
}

final lessonPaymentRepositoryProvider = Provider<LessonPaymentRepository>(
  (ref) => LessonPaymentRepository(ref.watch(firestoreProvider)),
);
