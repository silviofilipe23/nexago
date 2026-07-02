import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/organizer/domain/tournament_staff/tournament_staff_models.dart';

void main() {
  group('TournamentStaffRole', () {
    test('parses known values and defaults to manager', () {
      expect(
        TournamentStaffRole.fromValue('scorer'),
        TournamentStaffRole.scorer,
      );
      expect(
        TournamentStaffRole.fromValue('manager'),
        TournamentStaffRole.manager,
      );
      expect(TournamentStaffRole.fromValue(null), TournamentStaffRole.manager);
      expect(
        TournamentStaffRole.fromValue('unknown'),
        TournamentStaffRole.manager,
      );
    });

    test('exposes pt-BR labels', () {
      expect(TournamentStaffRole.manager.label, 'Gestor');
      expect(TournamentStaffRole.scorer.label, 'Mesário');
    });

    test('serializes to rules-compatible values', () {
      expect(TournamentStaffRole.manager.value, 'manager');
      expect(TournamentStaffRole.scorer.value, 'scorer');
    });
  });

  group('TournamentStaffMember', () {
    test('displayLabel prefers nickname, then name, then fallback', () {
      const withNickname = TournamentStaffMember(
        uid: 'u1',
        role: TournamentStaffRole.manager,
        status: 'active',
        displayName: 'Fulano da Silva',
        nickname: 'Fu',
      );
      expect(withNickname.displayLabel, 'Fu');

      const withName = TournamentStaffMember(
        uid: 'u2',
        role: TournamentStaffRole.scorer,
        status: 'active',
        displayName: 'Fulano da Silva',
      );
      expect(withName.displayLabel, 'Fulano da Silva');

      const bare = TournamentStaffMember(
        uid: 'u3',
        role: TournamentStaffRole.scorer,
        status: 'active',
      );
      expect(bare.displayLabel, 'Usuário');
    });

    test('isActive reflects status', () {
      const active = TournamentStaffMember(
        uid: 'u1',
        role: TournamentStaffRole.manager,
        status: 'active',
      );
      const inactive = TournamentStaffMember(
        uid: 'u1',
        role: TournamentStaffRole.manager,
        status: 'removed',
      );
      expect(active.isActive, isTrue);
      expect(inactive.isActive, isFalse);
    });
  });
}
