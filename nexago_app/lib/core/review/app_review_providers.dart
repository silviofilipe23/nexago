import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:in_app_review/in_app_review.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app_review_service.dart';

Future<SharedPreferences?> _loadPreferences() async {
  try {
    return await SharedPreferences.getInstance();
  } on PlatformException {
    // Canal indisponível (hot restart).
    return null;
  } catch (_) {
    return null;
  }
}

final appReviewServiceProvider = Provider<AppReviewService>((ref) {
  final inAppReview = InAppReview.instance;
  return AppReviewService(
    loadPreferences: _loadPreferences,
    isReviewAvailable: inAppReview.isAvailable,
    requestReview: inAppReview.requestReview,
  );
});
