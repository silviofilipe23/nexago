import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/review/app_review_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  final now = DateTime(2026, 8, 28, 12);

  AppReviewService buildService({
    Map<String, Object> initialPrefs = const {},
    bool prefsAvailable = true,
    bool reviewAvailable = true,
    Object? requestError,
    DateTime? clock,
    void Function()? onRequest,
  }) {
    SharedPreferences.setMockInitialValues(initialPrefs);
    return AppReviewService(
      loadPreferences: () async =>
          prefsAvailable ? await SharedPreferences.getInstance() : null,
      isReviewAvailable: () async => reviewAvailable,
      requestReview: () async {
        if (requestError != null) throw requestError;
        onRequest?.call();
      },
      now: () => clock ?? now,
    );
  }

  group('AppReviewService.maybeRequestReview', () {
    test('pede avaliação e grava o timestamp quando nunca pediu', () async {
      var requested = false;
      final service = buildService(onRequest: () => requested = true);

      final asked = await service.maybeRequestReview();

      expect(asked, isTrue);
      expect(requested, isTrue);
      final prefs = await SharedPreferences.getInstance();
      expect(
        prefs.getInt(AppReviewService.lastPromptKey),
        now.millisecondsSinceEpoch,
      );
    });

    test('não pede dentro do cooldown', () async {
      var requested = false;
      final lastAsked = now.subtract(const Duration(days: 30));
      final service = buildService(
        initialPrefs: {
          AppReviewService.lastPromptKey: lastAsked.millisecondsSinceEpoch,
        },
        onRequest: () => requested = true,
      );

      final asked = await service.maybeRequestReview();

      expect(asked, isFalse);
      expect(requested, isFalse);
    });

    test('pede de novo depois do cooldown', () async {
      var requested = false;
      final lastAsked = now.subtract(AppReviewService.cooldown);
      final service = buildService(
        initialPrefs: {
          AppReviewService.lastPromptKey: lastAsked.millisecondsSinceEpoch,
        },
        onRequest: () => requested = true,
      );

      final asked = await service.maybeRequestReview();

      expect(asked, isTrue);
      expect(requested, isTrue);
    });

    test('não pede quando a API de review não está disponível', () async {
      var requested = false;
      final service = buildService(
        reviewAvailable: false,
        onRequest: () => requested = true,
      );

      final asked = await service.maybeRequestReview();

      expect(asked, isFalse);
      expect(requested, isFalse);
      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getInt(AppReviewService.lastPromptKey), isNull);
    });

    test('engole erro do requestReview sem gravar timestamp', () async {
      final service = buildService(requestError: Exception('plugin falhou'));

      final asked = await service.maybeRequestReview();

      expect(asked, isFalse);
      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getInt(AppReviewService.lastPromptKey), isNull);
    });

    test('não pede quando as preferências estão indisponíveis', () async {
      var requested = false;
      final service = buildService(
        prefsAvailable: false,
        onRequest: () => requested = true,
      );

      final asked = await service.maybeRequestReview();

      expect(asked, isFalse);
      expect(requested, isFalse);
    });
  });
}
