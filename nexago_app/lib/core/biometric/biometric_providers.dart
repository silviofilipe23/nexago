import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'biometric_service.dart';

final biometricServiceProvider = Provider<BiometricService>((ref) {
  return BiometricService();
});
