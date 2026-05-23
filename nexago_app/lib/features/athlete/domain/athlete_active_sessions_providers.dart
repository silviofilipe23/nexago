import 'dart:io' show Platform;

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_providers.dart';
import '../../../core/notifications/notification_providers.dart';
import 'athlete_profile_providers.dart';

class AthleteDeviceToken {
  const AthleteDeviceToken({
    required this.id,
    required this.platform,
    required this.isCurrent,
    this.updatedAt,
  });

  final String id;
  final String platform;
  final bool isCurrent;
  final DateTime? updatedAt;

  String get platformLabel => switch (platform) {
        'ios' => 'iPhone',
        'android' => 'Android',
        'web' => 'Web',
        'macos' => 'Mac',
        _ => platform,
      };
}

class AthleteActiveSessionsState {
  const AthleteActiveSessionsState({
    this.tokens = const [],
    this.currentDeviceLabel = 'este dispositivo',
    this.isLoading = true,
    this.errorMessage,
  });

  final List<AthleteDeviceToken> tokens;
  final String currentDeviceLabel;
  final bool isLoading;
  final String? errorMessage;

  int get deviceCount => tokens.length;

  String get sessionsSubtitle {
    if (isLoading) return 'Carregando...';
    final n = deviceCount;
    if (n == 0) return 'Nenhum dispositivo';
    final suffix = tokens.any((t) => t.isCurrent)
        ? ' · $currentDeviceLabel'
        : '';
    return '$n dispositivo${n == 1 ? '' : 's'}$suffix';
  }
}

final athleteActiveSessionsProvider =
    AutoDisposeAsyncNotifierProvider<AthleteActiveSessionsNotifier,
        AthleteActiveSessionsState>(
  AthleteActiveSessionsNotifier.new,
);

class AthleteActiveSessionsNotifier
    extends AutoDisposeAsyncNotifier<AthleteActiveSessionsState> {
  @override
  Future<AthleteActiveSessionsState> build() async {
    final uid = ref.watch(authProvider).valueOrNull?.uid;
    if (uid == null) {
      return const AthleteActiveSessionsState(isLoading: false);
    }

    final installationId =
        await ref.read(firebaseInstallationsProvider).getId();
    final currentLabel = _currentDeviceLabel();

    final repo = ref.watch(athleteProfileRepositoryProvider);
    final tokens = await repo.watchUserTokens(uid).first;

    final mapped = tokens.map((data) {
      final id = (data['id'] as String?) ?? '';
      final platform = (data['platform'] as String?)?.trim() ?? 'unknown';
      final updated = data['updatedAt'];
      final DateTime? updatedAt = updated is Timestamp ? updated.toDate() : null;
      return AthleteDeviceToken(
        id: id,
        platform: platform,
        isCurrent: id == installationId,
        updatedAt: updatedAt,
      );
    }).toList()
      ..sort((a, b) {
        if (a.isCurrent != b.isCurrent) return a.isCurrent ? -1 : 1;
        final au = a.updatedAt;
        final bu = b.updatedAt;
        if (au == null && bu == null) return 0;
        if (au == null) return 1;
        if (bu == null) return -1;
        return bu.compareTo(au);
      });

    return AthleteActiveSessionsState(
      tokens: mapped,
      currentDeviceLabel: currentLabel,
      isLoading: false,
    );
  }

  Future<void> revokeToken(String tokenId) async {
    final uid = ref.read(authProvider).valueOrNull?.uid;
    if (uid == null || tokenId.isEmpty) return;

    final current = state.valueOrNull;
    if (current == null) return;

    await ref.read(athleteProfileRepositoryProvider).deleteUserToken(
          uid: uid,
          tokenId: tokenId,
        );
    ref.invalidateSelf();
  }

  static String _currentDeviceLabel() {
    if (kIsWeb) return 'este navegador';
    if (Platform.isIOS) return 'este iPhone';
    if (Platform.isAndroid) return 'este Android';
    if (Platform.isMacOS) return 'este Mac';
    return 'este dispositivo';
  }
}
