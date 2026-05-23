import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/auth/auth_providers.dart';
import '../../../../core/biometric/biometric_providers.dart';
import '../../../../core/ui/app_snackbar.dart';
import '../../domain/athlete_profile.dart';
import '../../domain/athlete_profile_providers.dart';

/// Persiste preferência de Face ID / biometria no perfil do atleta.
Future<bool> setAthleteBiometricEnabled({
  required BuildContext context,
  required WidgetRef ref,
  required bool value,
}) async {
  final user = ref.read(authProvider).valueOrNull;
  if (user == null) return false;

  if (value) {
    final svc = ref.read(biometricServiceProvider);
    final supported = await svc.isDeviceSupported();
    final enrolled = await svc.hasEnrolledBiometrics();
    if (!supported || !enrolled) {
      if (context.mounted) {
        showAppSnackBar(
          context,
          'Cadastre Face ID ou impressão digital nas configurações do aparelho.',
          isError: true,
        );
      }
      return false;
    }
  }

  try {
    final base =
        ref.read(athleteProfileProvider).valueOrNull ?? AthleteProfile.draft(user);
    await ref.read(athleteProfileRepositoryProvider).saveProfile(
          base.copyWith(useBiometric: value),
        );
    return true;
  } catch (e) {
    if (context.mounted) {
      showAppSnackBar(
        context,
        'Não foi possível salvar: $e',
        isError: true,
      );
    }
    return false;
  }
}
