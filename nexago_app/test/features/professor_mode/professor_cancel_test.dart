import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/professor_mode/domain/professor_cancel.dart';

void main() {
  test('motivos usam os ids do servidor', () {
    expect(ProfessorCancelReason.values.map((r) => r.id),
        ['rain', 'personal', 'health', 'maintenance', 'other']);
  });

  test('resposta do servidor antigo: só avisados e créditos', () {
    final r = ProfessorSessionCancelResult.fromMap({
      'sessionId': 's1',
      'notified': 4,
      'credited': 0,
    });
    expect(r.recipients, isNull);
    expect(r.creditValidityDays, isNull);
    final rows = professorSessionCanceledRows(court: 'Quadra 2', result: r);
    expect(rows.map((x) => x.title), ['Avisados', 'Quadra 2']);
    expect(rows.first.value, '4');
    expect(rows.last.sub, 'Volta para a agenda da arena');
  });

  test('confirmação completa: n/total, validade e gestão', () {
    final r = ProfessorSessionCancelResult.fromMap({
      'notified': 6,
      'credited': 6,
      'recipients': 6,
      'creditValidityDays': 45,
      'managerNotified': true,
    });
    final rows = professorSessionCanceledRows(court: 'Quadra 2', result: r);
    expect(rows[0].value, '6/6');
    expect(rows[0].tone, ProfessorCancelTone.win);
    expect(rows[1].sub, 'Valem 45 dias');
    expect(rows[2].sub, 'Gestão da arena avisada');
    expect(
      professorSessionCanceledMessage(
          className: 'Intermediário B', when: 'hoje 19:00', result: r),
      'Intermediário B · hoje 19:00. Os 6 alunos foram avisados e '
      'receberam 1 crédito de reposição.',
    );
    expect(
      professorSessionCanceledMessage(
        className: 'Turma',
        when: 'qui 22 06:00',
        result: const ProfessorSessionCancelResult(notified: 0, credited: 0),
      ),
      'Turma · qui 22 06:00. Nenhum aluno com conta foi avisado.',
    );
  });

  test('começa em', () {
    final now = DateTime(2026, 10, 22, 12);
    expect(professorStartsInLabel(DateTime(2026, 10, 22, 12, 40), now),
        'começa em 40 min');
    expect(professorStartsInLabel(DateTime(2026, 10, 22, 14, 10), now),
        'começa em 2h');
    expect(professorStartsInLabel(DateTime(2026, 10, 24, 12), now),
        'começa em 2 dias');
    expect(
        professorStartsInLabel(DateTime(2026, 10, 22, 11), now), 'já começou');
  });
}
