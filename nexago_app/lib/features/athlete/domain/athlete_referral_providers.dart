import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/athlete_referral_service.dart';

final athleteReferralServiceProvider = Provider<AthleteReferralService>((ref) {
  return AthleteReferralService();
});
