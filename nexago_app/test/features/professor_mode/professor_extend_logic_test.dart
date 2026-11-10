import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/professor_mode/domain/professor_extend.dart';

void main() {
  test('fim depois de emendar: +1h; passaria da meia-noite → null', () {
    expect(professorExtendedEnd('19:00'), '20:00');
    expect(professorExtendedEnd('19:30'), '20:30');
    expect(professorExtendedEnd('23:00'), '24:00');
    expect(professorExtendedEnd('23:30'), isNull);
    expect(professorExtendedEnd('00:00'), isNull);
    expect(professorExtendedEnd(''), isNull);
  });

  test('resultado do servidor', () {
    final r = ProfessorSessionExtendResult.fromMap(
        {'endTime': '20:00', 'previousEndTime': '19:00', 'relocatedBookings': 1});
    expect(r.endTime, '20:00');
    expect(r.previousEndTime, '19:00');
    expect(r.relocatedBookings, 1);
  });
}
