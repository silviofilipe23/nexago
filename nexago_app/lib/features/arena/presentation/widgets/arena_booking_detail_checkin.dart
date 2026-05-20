import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/ui/app_snackbar.dart';
import '../../domain/arena_booking_labels.dart';
import '../../domain/arena_slot_detail_providers.dart';
import '../../../arenas/domain/booking_providers.dart';

class ArenaBookingDetailCheckin extends ConsumerStatefulWidget {
  const ArenaBookingDetailCheckin({
    super.key,
    required this.bookingId,
    required this.athleteId,
    required this.bookingData,
  });

  final String bookingId;
  final String athleteId;
  final Map<String, dynamic>? bookingData;

  @override
  ConsumerState<ArenaBookingDetailCheckin> createState() =>
      _ArenaBookingDetailCheckinState();
}

class _ArenaBookingDetailCheckinState
    extends ConsumerState<ArenaBookingDetailCheckin> {
  bool _busy = false;

  @override
  Widget build(BuildContext context) {
    if (!arenaBookingShowsCheckInAction(widget.bookingData)) {
      return const SizedBox.shrink();
    }

    return SizedBox(
      width: double.infinity,
      child: FilledButton.icon(
        onPressed: _busy || widget.athleteId.isEmpty ? null : _checkIn,
        icon: _busy
            ? const SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(strokeWidth: 2),
              )
            : const Icon(Icons.qr_code_scanner_rounded),
        label: const Text('Check-in'),
        style: FilledButton.styleFrom(
          backgroundColor: AppColors.brand,
          foregroundColor: AppColors.black,
          padding: const EdgeInsets.symmetric(vertical: 16),
        ),
      ),
    );
  }

  Future<void> _checkIn() async {
    setState(() => _busy = true);
    try {
      await ref.read(bookingServiceProvider).checkIn(
            bookingId: widget.bookingId,
            athleteId: widget.athleteId,
            locationVerified: true,
          );
      if (!mounted) return;
      ref.invalidate(arenaBookingDetailMapProvider(widget.bookingId));
      showAppSnackBar(context, 'Check-in registrado.');
    } catch (e) {
      if (!mounted) return;
      showAppSnackBar(context, '$e', isError: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}
