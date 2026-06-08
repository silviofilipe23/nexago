import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../domain/booking_attendance_providers.dart';
import 'booking_details_section_card.dart';
import 'booking_details_view_model.dart';

class BookingDetailsAttendanceCard extends StatelessWidget {
  const BookingDetailsAttendanceCard({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return BookingDetailsSectionCard(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: context.themeColors.surfaceRaised,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(
              Icons.fact_check_outlined,
              color: context.themeColors.onSurfaceMuted,
              size: 22,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Confirmação de presença',
                  style: Theme.of(context).textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: context.themeColors.onSurface,
                  ),
                ),
                const SizedBox(height: 6),
                child,
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class BookingDetailsCancellationCard extends StatelessWidget {
  const BookingDetailsCancellationCard({super.key, required this.arenaName});

  final String arenaName;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return BookingDetailsSectionCard(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: const Color(0xFF2E7D32).withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Icon(
              Icons.shield_outlined,
              color: Color(0xFF2E7D32),
              size: 22,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  bookingDetailsCancellationTitle(),
                  style: theme.textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: context.themeColors.onSurface,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  bookingDetailsCancellationSubtitle(arenaName),
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: context.themeColors.onSurfaceMuted,
                    height: 1.35,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Conteúdo dinâmico de presença (extraído da página).
class BookingDetailsAttendanceContent extends StatelessWidget {
  const BookingDetailsAttendanceContent({
    super.key,
    required this.attendance,
    required this.bookingStatus,
    required this.startAt,
    required this.confirmedParticipantsFallback,
    required this.confirmingAttendance,
    required this.checkingIn,
    required this.attendancePulse,
    required this.locationVerified,
    required this.onConfirmAttendance,
    required this.onLocationVerifiedChanged,
    required this.onCheckIn,
  });

  final BookingAttendanceState? attendance;
  final BookingDetailsStatus bookingStatus;
  final DateTime startAt;
  final int confirmedParticipantsFallback;
  final bool confirmingAttendance;
  final bool checkingIn;
  final bool attendancePulse;
  final bool locationVerified;
  final VoidCallback onConfirmAttendance;
  final ValueChanged<bool> onLocationVerifiedChanged;
  final VoidCallback onCheckIn;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final deadline =
        attendance?.confirmationDeadline ??
        startAt.subtract(const Duration(hours: 2));
    final now = DateTime.now();
    final isBeforeWindow = now.isBefore(deadline);
    final status = attendance?.attendanceStatus ?? 'pending';
    final confirmed =
        attendance?.attendanceConfirmed == true ||
        status == 'confirmed' ||
        status == 'checked_in';
    final isCheckedIn = status == 'checked_in';
    final isFinished =
        bookingStatus == BookingDetailsStatus.past ||
        bookingStatus == BookingDetailsStatus.canceled;
    final confirmedPlayers =
        attendance?.confirmedPlayers ?? confirmedParticipantsFallback;
    final canCheckIn = attendance?.checkInAllowed == true && !isCheckedIn;

    Widget body;
    if (isCheckedIn) {
      body = Text(
        'Check-in realizado com sucesso${attendance?.locationVerified == true ? ' (local validado)' : ''}.',
        style: theme.textTheme.bodySmall?.copyWith(
          fontWeight: FontWeight.w600,
          color: const Color(0xFF2E7D32),
        ),
      );
    } else if (confirmed) {
      body = Text(
        'Presença confirmada. Jogadores comprometidos fazem o jogo acontecer.',
        style: theme.textTheme.bodySmall?.copyWith(
          fontWeight: FontWeight.w600,
          color: const Color(0xFF2E7D32),
        ),
      );
    } else if (isFinished) {
      body = Text(
        bookingStatus == BookingDetailsStatus.canceled
            ? 'Reserva cancelada.'
            : 'Reserva encerrada.',
        style: theme.textTheme.bodySmall?.copyWith(
          color: context.themeColors.onSurfaceMuted,
        ),
      );
    } else if (isBeforeWindow) {
      body = Text(
        'Você poderá confirmar sua presença mais perto do horário.',
        style: theme.textTheme.bodySmall?.copyWith(
          color: context.themeColors.onSurfaceMuted,
        ),
      );
    } else {
      body = Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Confirme sua presença',
            style: theme.textTheme.labelLarge?.copyWith(
              color: AppColors.brand,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            '$confirmedPlayers jogadores já confirmaram.',
            style: theme.textTheme.bodySmall?.copyWith(
              color: context.themeColors.onSurfaceMuted,
            ),
          ),
          const SizedBox(height: 10),
          AnimatedScale(
            scale: attendancePulse ? 1.02 : 1.0,
            duration: const Duration(milliseconds: 220),
            child: SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: confirmingAttendance ? null : onConfirmAttendance,
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.brand,
                  foregroundColor: AppColors.black,
                ),
                child: confirmingAttendance
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Text('Confirmar presença'),
              ),
            ),
          ),
          if (canCheckIn) ...[
            const SizedBox(height: 10),
            SwitchListTile.adaptive(
              contentPadding: EdgeInsets.zero,
              title: const Text('Estou próximo da arena'),
              subtitle: const Text('Opcional: validar localização'),
              value: locationVerified,
              onChanged: checkingIn ? null : onLocationVerifiedChanged,
            ),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: checkingIn ? null : onCheckIn,
                style: FilledButton.styleFrom(
                  backgroundColor: const Color(0xFF2E7D32),
                  foregroundColor: Colors.white,
                ),
                child: checkingIn
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Text('Fazer check-in'),
              ),
            ),
          ],
        ],
      );
    }

    return BookingDetailsAttendanceCard(child: body);
  }
}
