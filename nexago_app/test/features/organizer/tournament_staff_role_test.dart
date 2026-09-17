import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/organizer/domain/tournament_staff/tournament_staff_models.dart';

void main() {
  group('TournamentStaffRole.fromValue', () {
    test('gestor', () {
      expect(TournamentStaffRole.fromValue('manager'),
          TournamentStaffRole.manager);
    });

    test('administrador do evento tem papel próprio, não cai em gestor', () {
      expect(TournamentStaffRole.fromValue('eventAdmin'),
          TournamentStaffRole.eventAdmin);
    });

    test('mesário', () {
      expect(
          TournamentStaffRole.fromValue('scorer'), TournamentStaffRole.scorer);
    });

    test('papel ausente conta como gestor, igual ao backend', () {
      expect(TournamentStaffRole.fromValue(null), TournamentStaffRole.manager);
    });

    test('papel desconhecido conta como gestor, igual ao backend', () {
      expect(
          TournamentStaffRole.fromValue('viewer'), TournamentStaffRole.manager);
    });
  });

  group('TournamentStaffRole.label', () {
    test('cada papel tem rótulo próprio em português', () {
      expect(TournamentStaffRole.manager.label, 'Gestor');
      expect(TournamentStaffRole.eventAdmin.label, 'Administrador');
      expect(TournamentStaffRole.scorer.label, 'Mesário');
    });
  });
}
