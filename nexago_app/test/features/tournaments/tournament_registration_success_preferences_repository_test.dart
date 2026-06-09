import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/data/tournament_registration_success_preferences_repository.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  group('TournamentRegistrationSuccessPreferencesRepository', () {
    test('persists handled registration ids per uid', () async {
      SharedPreferences.setMockInitialValues({});
      final repo =
          await TournamentRegistrationSuccessPreferencesRepository.create();

      expect(repo.loadHandledIds('user-a'), isEmpty);

      await repo.addHandledId('user-a', 'reg-1');
      await repo.addHandledId('user-a', 'reg-2');
      await repo.addHandledId('user-a', 'reg-1');

      expect(repo.loadHandledIds('user-a'), {'reg-1', 'reg-2'});
      expect(repo.loadHandledIds('user-b'), isEmpty);
    });

    test('loads previously saved ids', () async {
      SharedPreferences.setMockInitialValues({
        'tournament_reg_success_handled_user-a': ['reg-x', 'reg-y'],
      });
      final repo =
          await TournamentRegistrationSuccessPreferencesRepository.create();

      expect(repo.loadHandledIds('user-a'), {'reg-x', 'reg-y'});
    });
  });
}
