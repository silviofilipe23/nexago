import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../core/auth/auth_providers.dart';
import '../../../../core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../core/ui/app_snackbar.dart';
import '../../../../core/ui/app_status_views.dart';
import '../../../../core/ui/fade_slide_in.dart';
import '../../../athlete/domain/achievements/achievement_catalog.dart';
import '../../../athlete/domain/athlete_profile_providers.dart';
import '../../domain/arena_booking_cancellation_policy.dart';
import '../../domain/arenas_providers.dart';
import '../../domain/booking_providers.dart';
import '../../domain/my_booking_item.dart';
import '../../domain/arena_search_providers.dart';
import '../../domain/my_bookings_providers.dart';
import 'my_bookings_details_sheet.dart';
import 'my_bookings_logic.dart';
import 'widgets/my_bookings_app_bar.dart';
import 'widgets/my_bookings_booking_card.dart';
import 'widgets/my_bookings_date_header.dart';
import 'widgets/my_bookings_empty_hero.dart';
import 'widgets/my_bookings_nearby_section.dart';
import 'widgets/my_bookings_streak_banner.dart';
import 'widgets/my_bookings_tabs.dart';

/// Lista de reservas do atleta — layout escuro (protótipos 05/06).
class MyBookingsPage extends ConsumerStatefulWidget {
  const MyBookingsPage({super.key});

  @override
  ConsumerState<MyBookingsPage> createState() => _MyBookingsPageState();
}

class _MyBookingsPageState extends ConsumerState<MyBookingsPage> {
  MyBookingsTab _tab = MyBookingsTab.upcoming;

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(myBookingsStreamProvider);
    final profile = ref.watch(athleteProfileProvider).valueOrNull;
    final sportLabel = profile?.sport.trim().isNotEmpty == true
        ? profile!.sport.trim()
        : 'vôlei de praia';
    final firstBookingXp =
        AchievementCatalog.byId('FIRST_BOOKING')?.xpReward ?? 30;

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      appBar: MyBookingsAppBar(
        onBack: () {
          if (context.canPop()) {
            context.pop();
          } else {
            context.go(AppRoutes.discover);
          }
        },
        showReserveAction: async.valueOrNull?.isNotEmpty ?? false,
      ),
      body: SafeArea(
        child: async.when(
          data: (items) {
            if (items.isEmpty) {
              return _EmptyBookingsBody(
                sportLabel: sportLabel,
                firstBookingXp: firstBookingXp,
              );
            }
            return _BookingsListBody(
              items: items,
              sportLabel: sportLabel,
              tab: _tab,
              onTabChanged: (t) => setState(() => _tab = t),
            );
          },
          loading: () =>
              const AppLoadingView(message: 'Carregando suas reservas…'),
          error: (e, _) => AppErrorView(
            title: 'Não foi possível carregar',
            message: e.toString().replaceFirst('Exception: ', ''),
            onRetry: () {
              showAppSnackBar(context, 'Atualizando lista…');
              ref.invalidate(myBookingsStreamProvider);
            },
          ),
        ),
      ),
    );
  }
}

class _EmptyBookingsBody extends ConsumerWidget {
  const _EmptyBookingsBody({
    required this.sportLabel,
    required this.firstBookingXp,
  });

  final String sportLabel;
  final int firstBookingXp;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final nearbyAsync = ref.watch(myBookingsNearbyTodayProvider);
    final snapshot = nearbyAsync.valueOrNull;
    final nearbyCount = snapshot?.totalAvailableToday ?? 0;
    final proximityPhrase = snapshot?.proximityPhrase ?? 'perto de você';

    return ListView(
      physics: const BouncingScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
      children: [
        staggeredFadeSlide(
          index: 0,
          child: MyBookingsEmptyHero(
            nearbyCountToday: nearbyCount,
            firstBookingXp: firstBookingXp,
            proximityPhrase: proximityPhrase,
          ),
        ),
        SizedBox(height: 28),
        staggeredFadeSlide(
          index: 1,
          child: MyBookingsNearbySection(sportLabel: sportLabel),
        ),
      ],
    );
  }
}

class _BookingsListBody extends ConsumerWidget {
  const _BookingsListBody({
    required this.items,
    required this.sportLabel,
    required this.tab,
    required this.onTabChanged,
  });

  final List<MyBookingItem> items;
  final String sportLabel;
  final MyBookingsTab tab;
  final ValueChanged<MyBookingsTab> onTabChanged;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final split = splitMyBookings(items);
    final streakWeeks = consecutiveBookingWeeks(items);
    final showStreak =
        tab == MyBookingsTab.upcoming &&
        streakWeeks >= myBookingsStreakWeeksThreshold;

    final listItems = tab == MyBookingsTab.upcoming
        ? split.upcoming
        : split.history;

    final children = <Widget>[
      MyBookingsTabs(
        selected: tab,
        upcomingCount: split.upcoming.length,
        historyCount: split.history.length,
        onChanged: onTabChanged,
      ),
    ];

    if (listItems.isEmpty) {
      children.add(
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 32),
          child: AppEmptyView(
            icon: tab == MyBookingsTab.upcoming
                ? Icons.event_outlined
                : Icons.history_rounded,
            title: tab == MyBookingsTab.upcoming
                ? 'Nenhuma reserva próxima'
                : 'Nenhuma reserva no histórico',
            subtitle: tab == MyBookingsTab.upcoming
                ? 'Suas próximas reservas aparecerão aqui.'
                : 'Reservas passadas aparecerão aqui.',
          ),
        ),
      );
    } else if (tab == MyBookingsTab.upcoming) {
      final grouped = groupUpcomingByDate(listItems);
      final keys = grouped.keys.toList()..sort();
      var animationIndex = 0;
      for (final dateKey in keys) {
        children.add(
          staggeredFadeSlide(
            index: animationIndex++,
            child: MyBookingsDateHeader(dateRaw: dateKey),
          ),
        );
        for (final item in grouped[dateKey]!) {
          children.add(
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: staggeredFadeSlide(
                index: animationIndex++,
                child: MyBookingsBookingCard(
                  item: item,
                  sportLabel: sportLabel,
                  onTap: () => _openDetails(context, ref, item),
                ),
              ),
            ),
          );
        }
        children.add(SizedBox(height: 4));
      }
    } else {
      var animationIndex = 0;
      for (final item in listItems) {
        children.add(
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: staggeredFadeSlide(
              index: animationIndex++,
              child: MyBookingsBookingCard(
                item: item,
                sportLabel: sportLabel,
                onTap: () => _openDetails(context, ref, item),
              ),
            ),
          ),
        );
      }
    }

    if (showStreak) {
      children.add(SizedBox(height: 8));
      children.add(
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
          child: MyBookingsStreakBanner(consecutiveWeeks: streakWeeks),
        ),
      );
    }

    return ListView(
      physics: const BouncingScrollPhysics(),
      padding: EdgeInsets.zero,
      children: children,
    );
  }

  Future<void> _openDetails(
    BuildContext context,
    WidgetRef ref,
    MyBookingItem item,
  ) async {
    final bookingService = ref.read(bookingServiceProvider);
    final currentUser = ref.read(authProvider).valueOrNull;
    final arenaAsync = item.arenaId == null
        ? null
        : ref.read(arenaByIdProvider(item.arenaId!));
    final arena = arenaAsync?.valueOrNull;
    final locationQuery = arena?.locationLabel ?? item.arenaName;
    final startAt = _bookingStartDateTime(item);
    final canCancelByTime =
        startAt != null &&
        ArenaBookingCancellationPolicy.canCancelBookingForFree(
          startAt,
          DateTime.now(),
        );

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      backgroundColor: Colors.transparent,
      builder: (sheetContext) {
        return BookingDetailsSheet(
          item: item,
          dateLabel: formatBookingDateHeader(item.dateRaw),
          onOpenMaps: () async {
            final q = Uri.encodeComponent(locationQuery);
            final uri = Uri.parse(
              'https://www.google.com/maps/search/?api=1&query=$q',
            );
            if (await canLaunchUrl(uri)) {
              await launchUrl(uri, mode: LaunchMode.externalApplication);
            } else if (context.mounted) {
              showAppSnackBar(context, 'Não foi possível abrir o Google Maps.');
            }
          },
          onPayNow: () {
            showAppSnackBar(context, 'Fluxo de pagamento em breve.');
          },
          onCancelBooking: () async {
            if (!canCancelByTime) {
              if (context.mounted) {
                showAppSnackBar(
                  context,
                  ArenaBookingCancellationPolicy.blockedCancellationMessage(
                    arenaName: arena?.name ?? item.arenaName,
                  ),
                );
              }
              return;
            }
            final uid = currentUser?.uid;
            if (uid == null) {
              if (context.mounted) {
                showAppSnackBar(context, 'Faça login para cancelar.');
              }
              return;
            }
            try {
              await bookingService.cancelBooking(
                bookingId: item.id,
                athleteId: uid,
              );
              if (context.mounted) {
                Navigator.of(sheetContext).pop();
                showAppSnackBar(context, 'Reserva cancelada com sucesso.');
                ref.invalidate(myBookingsStreamProvider);
              }
            } catch (e) {
              if (context.mounted) {
                showAppSnackBar(
                  context,
                  e.toString().replaceFirst('Exception: ', ''),
                );
              }
            }
          },
          canCancelBooking: canCancelByTime,
        );
      },
    );
  }

  DateTime? _bookingStartDateTime(MyBookingItem item) {
    if (item.dateRaw.length < 10) return null;
    final date = DateTime.tryParse(item.dateRaw.substring(0, 10));
    if (date == null) return null;
    final parts = item.startTime.split(':');
    if (parts.length < 2) return null;
    final h = int.tryParse(parts[0]) ?? 0;
    final m = int.tryParse(parts[1]) ?? 0;
    return DateTime(date.year, date.month, date.day, h, m);
  }
}
