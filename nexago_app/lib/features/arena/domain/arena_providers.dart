import 'package:flutter_riverpod/flutter_riverpod.dart';

export 'arena_access_provider.dart';
export 'arena_booking_view_mode.dart';
export 'arena_bookings_providers.dart';
export 'arena_bookings_ui_models.dart';
export 'arena_court_providers.dart';
export 'arena_manager_booking.dart';
export '../data/arena_dashboard_insights.dart';
export '../data/arena_dashboard_service.dart';
export '../data/court_service.dart' show CourtService, CourtServiceException;
export '../data/slot_service.dart' show SlotService, SlotServiceException;
export 'arena_dashboard_providers.dart';
export 'arena_profile_edit_providers.dart';
export 'court_type_options.dart';
export 'arena_dashboard_summary.dart';
export 'arena_date_utils.dart' show arenaDateKey, arenaDateKeyFromDynamic, arenaDateOnly, arenaTodayDateOnly;
export 'arena_schedule_providers.dart';
export 'arena_settings_providers.dart';
export 'arena_settings_schedule.dart';
export 'arena_role.dart';
export 'arena_route_guard.dart';
export 'arena_booking_labels.dart' show
    arenaBookingBusinessStatusLabel,
    arenaBookingPaymentLabel,
    arenaBookingStatusLabel;
export 'arena_slot_detail_providers.dart' show
    athleteDisplayLabelProvider,
    arenaBookingDetailMapProvider,
    arenaSlotLiveProvider;

/// Flags e configuração do painel da arena (expandir com repositórios depois).
class ArenaModuleConfig {
  const ArenaModuleConfig({this.title = 'Arena'});

  final String title;
}

final arenaModuleConfigProvider = Provider<ArenaModuleConfig>((ref) {
  return const ArenaModuleConfig();
});
