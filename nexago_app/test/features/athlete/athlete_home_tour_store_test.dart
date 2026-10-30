import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/data/athlete_home_tour_store.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('nunca viu: versão 0', () async {
    SharedPreferences.setMockInitialValues({});
    expect(await AthleteHomeTourStore().seenVersion('u1'), 0);
  });

  test('chave antiga de antes da v4 conta como a versão vista', () async {
    SharedPreferences.setMockInitialValues({'athlete_home_tour_v3_u1': true});
    expect(await AthleteHomeTourStore().seenVersion('u1'), 3);
    expect(await AthleteHomeTourStore().seenVersion('outro'), 0);
  });

  test('marcar grava a versão atual e sobrevive a outro store', () async {
    SharedPreferences.setMockInitialValues({'athlete_home_tour_v3_u1': true});
    await AthleteHomeTourStore().markSeen('u1');
    expect(
      await AthleteHomeTourStore().seenVersion('u1'),
      AthleteHomeTourStore.version,
    );
  });
}
