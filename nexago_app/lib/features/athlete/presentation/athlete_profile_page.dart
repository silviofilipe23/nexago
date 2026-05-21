import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/auth/auth_providers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../arenas/domain/my_booking_item.dart';
import '../../arenas/domain/my_bookings_providers.dart';
import '../domain/athlete_profile.dart';
import '../domain/athlete_profile_providers.dart';
import '../domain/gamification_models.dart';
import '../domain/gamification_providers.dart';
import 'widgets/athlete_profile_main_view.dart';

/// Perfil do atleta.
///
/// Se [embedded] for true (ex.: aba do shell), não usa [Scaffold] próprio —
/// o pai fornece o layout; o conteúdo usa [AppColors.canvas].
class AthleteProfilePage extends ConsumerWidget {
  const AthleteProfilePage({
    super.key,
    this.embedded = false,
    this.viewedUserId,
  });

  final bool embedded;
  final String? viewedUserId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authProvider).valueOrNull;
    final viewed = viewedUserId?.trim();

    Widget bodyNotSignedIn(BuildContext ctx) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(
            'Faça login para ver seu perfil.',
            textAlign: TextAlign.center,
            style: Theme.of(ctx).textTheme.bodyLarge?.copyWith(
                  color: AppColors.onSurfaceMuted,
                ),
          ),
        ),
      );
    }

    if (viewed != null && viewed.isNotEmpty) {
      final profileAsync = ref.watch(athleteProfileByIdProvider(viewed));
      final emailAsync = ref.watch(athleteUserEmailProvider(viewed));

      Widget bodyOther() {
        if (user == null) return bodyNotSignedIn(context);
        return profileAsync.when(
          data: (doc) {
            final profile = doc ??
                AthleteProfile(
                  id: viewed,
                  name: 'Atleta',
                  sport: '',
                  level: '',
                  city: '',
                );
            final email = emailAsync.maybeWhen(
              data: (e) => e,
              orElse: () => null,
            );
            return _AthleteProfileBody(
              embedded: embedded,
              profile: profile,
              email: email,
              totalBookings: 0,
              nextBooking: null,
              gamificationSummary: GamificationSummary.initial(),
              badges: const <UserBadgeProgress>[],
              readOnly: true,
              onEdit: () {},
              onOpenAgenda: () {},
              onOpenSettings: () {},
            );
          },
          loading: () => const Center(
            child: CircularProgressIndicator(color: AppColors.brand),
          ),
          error: (e, _) => Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Text(
                'Não foi possível carregar o perfil.\n$e',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                      color: AppColors.live,
                    ),
              ),
            ),
          ),
        );
      }

      if (embedded) {
        return ColoredBox(
          color: AppColors.canvas,
          child: bodyOther(),
        );
      }

      return Scaffold(
        backgroundColor: AppColors.canvas,
        body: MediaQuery.removePadding(
          context: context,
          removeTop: true,
          child: bodyOther(),
        ),
      );
    }

    final profileAsync = ref.watch(athleteProfileProvider);
    final bookingsAsync = ref.watch(myBookingsStreamProvider);
    final gamificationSummaryAsync = ref.watch(gamificationSummaryProvider);
    final badgesAsync = ref.watch(gamificationBadgesProvider);

    Widget bodyContent() {
      if (user == null) return bodyNotSignedIn(context);
      return profileAsync.when(
        data: (doc) {
          final profile = doc ?? AthleteProfile.draft(user);
          return bookingsAsync.when(
            data: (bookings) => _AthleteProfileBody(
              embedded: embedded,
              profile: profile,
              email: user.email,
              totalBookings: _countCompletedBookings(bookings),
              nextBooking: _findNextBooking(bookings),
              gamificationSummary: gamificationSummaryAsync.valueOrNull ??
                  GamificationSummary.initial(),
              badges: badgesAsync.valueOrNull ?? const <UserBadgeProgress>[],
              readOnly: false,
              onEdit: () => context.pushNamed(AppRouteNames.athleteProfileEdit),
              onOpenAgenda: () => context.pushNamed(AppRouteNames.myBookings),
              onOpenSettings: () =>
                  context.pushNamed(AppRouteNames.athleteSettings),
            ),
            loading: () => const Center(
              child: CircularProgressIndicator(color: AppColors.brand),
            ),
            error: (e, _) => Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Text(
                  'Não foi possível carregar reservas.\n$e',
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                        color: AppColors.live,
                      ),
                ),
              ),
            ),
          );
        },
        loading: () => const Center(
          child: CircularProgressIndicator(color: AppColors.brand),
        ),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text(
              'Não foi possível carregar o perfil.\n$e',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                    color: AppColors.live,
                  ),
            ),
          ),
        ),
      );
    }

    if (embedded) {
      return ColoredBox(
        color: AppColors.canvas,
        child: bodyContent(),
      );
    }

    if (user == null) {
      return Scaffold(
        backgroundColor: AppColors.canvas,
        body: bodyNotSignedIn(context),
      );
    }

    return Scaffold(
      backgroundColor: AppColors.canvas,
      body: MediaQuery.removePadding(
        context: context,
        removeTop: true,
        child: bodyContent(),
      ),
    );
  }
}

void _showBriefAlert(
  BuildContext context,
  String title,
  String message,
) {
  showDialog<void>(
    context: context,
    builder: (ctx) => AlertDialog(
      backgroundColor: AppColors.surfaceSheet,
      title: Text(
        title,
        style: const TextStyle(color: AppColors.onSurface),
      ),
      content: Text(
        message,
        style: const TextStyle(color: AppColors.onSurfaceMuted),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(ctx).pop(),
          child: const Text(
            'OK',
            style: TextStyle(
              color: AppColors.brand,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
      ],
    ),
  );
}

class _AthleteProfileBody extends StatelessWidget {
  const _AthleteProfileBody({
    required this.embedded,
    required this.profile,
    required this.email,
    required this.totalBookings,
    required this.nextBooking,
    required this.gamificationSummary,
    required this.badges,
    this.readOnly = false,
    required this.onEdit,
    required this.onOpenAgenda,
    required this.onOpenSettings,
  });

  final bool embedded;
  final AthleteProfile profile;
  final String? email;
  final int totalBookings;
  final MyBookingItem? nextBooking;
  final GamificationSummary gamificationSummary;
  final List<UserBadgeProgress> badges;
  final bool readOnly;
  final VoidCallback onEdit;
  final VoidCallback onOpenAgenda;
  final VoidCallback onOpenSettings;

  void _comingSoon(BuildContext context, String title) {
    _showBriefAlert(
      context,
      'Em breve',
      '$title estará disponível em breve.',
    );
  }

  @override
  Widget build(BuildContext context) {
    return AthleteProfileMainView(
      profile: profile,
      embedded: embedded,
      readOnly: readOnly,
      totalBookings: totalBookings,
      nextBooking: nextBooking,
      gamificationSummary: gamificationSummary,
      badges: badges,
      onBack: () {
        if (context.canPop()) {
          context.pop();
        } else {
          context.go(AppRoutes.discover);
        }
      },
      onEdit: onEdit,
      onShare: () => _comingSoon(context, 'Compartilhar perfil'),
      onCompleteProfile: onEdit,
      onOpenAgenda: onOpenAgenda,
      onOpenAchievements: () => _comingSoon(context, 'Conquistas'),
      onOpenPlaysWith: () => _comingSoon(context, 'Parceiros de jogo'),
    );
  }
}

int _countCompletedBookings(List<MyBookingItem> bookings) {
  return bookings.where((b) {
    final s = b.rawStatus.trim().toLowerCase();
    return s != 'canceled' && s != 'cancelled';
  }).length;
}

MyBookingItem? _findNextBooking(List<MyBookingItem> bookings) {
  final now = DateTime.now();
  MyBookingItem? next;
  DateTime? nextStart;
  for (final booking in bookings) {
    final status = booking.rawStatus.trim().toLowerCase();
    if (status == 'canceled' || status == 'cancelled') continue;
    final start = _parseBookingStart(booking);
    if (start == null || !start.isAfter(now)) continue;
    if (nextStart == null || start.isBefore(nextStart)) {
      nextStart = start;
      next = booking;
    }
  }
  return next;
}

DateTime? _parseBookingStart(MyBookingItem item) {
  if (item.dateRaw.length < 10) return null;
  final day = DateTime.tryParse(item.dateRaw.substring(0, 10));
  if (day == null) return null;
  final parts = item.startTime.split(':');
  final hh = parts.isNotEmpty ? int.tryParse(parts[0]) ?? 0 : 0;
  final mm = parts.length > 1 ? int.tryParse(parts[1]) ?? 0 : 0;
  return DateTime(day.year, day.month, day.day, hh, mm);
}
