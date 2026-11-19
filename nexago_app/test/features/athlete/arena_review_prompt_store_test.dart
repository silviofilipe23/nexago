import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/data/arena_review_prompt_store.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('"Agora não" fica gravado e sobrevive a um store novo (app reaberto)',
      () async {
    await SharedPrefsArenaReviewPromptStore().dismiss('uid1', 'b1');

    final reopened = SharedPrefsArenaReviewPromptStore();
    expect(await reopened.dismissed('uid1'), {'b1'});
  });

  test('cada conta no aparelho tem a sua lista', () async {
    final store = SharedPrefsArenaReviewPromptStore();
    await store.dismiss('uid1', 'b1');
    expect(await store.dismissed('uid2'), isEmpty);
  });

  test('guarda só as dispensas mais recentes', () async {
    final store = SharedPrefsArenaReviewPromptStore();
    for (var i = 0; i < arenaReviewPromptStoreLimit + 5; i++) {
      await store.dismiss('uid1', 'b$i');
    }
    final ids = await SharedPrefsArenaReviewPromptStore().dismissed('uid1');
    expect(ids, hasLength(arenaReviewPromptStoreLimit));
    expect(ids, contains('b${arenaReviewPromptStoreLimit + 4}'));
    expect(ids, isNot(contains('b0')));
  });
}
