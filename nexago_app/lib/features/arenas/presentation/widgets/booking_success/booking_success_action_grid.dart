import 'package:flutter/material.dart';

import 'booking_success_action_tile.dart';

class BookingSuccessActionGrid extends StatelessWidget {
  const BookingSuccessActionGrid({
    super.key,
    required this.onCalendar,
    required this.onShare,
    required this.onWhatsApp,
    required this.onDirections,
  });

  final VoidCallback onCalendar;
  final VoidCallback onShare;
  final VoidCallback onWhatsApp;
  final VoidCallback onDirections;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Row(
          children: [
            Expanded(
              child: BookingSuccessActionTile(
                icon: Icons.calendar_month_outlined,
                label: 'Calendário',
                onTap: onCalendar,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: BookingSuccessActionTile(
                icon: Icons.ios_share_rounded,
                label: 'Compartilhar',
                onTap: onShare,
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(
              child: BookingSuccessActionTile(
                icon: Icons.chat_outlined,
                label: 'Grupo no WhatsApp',
                onTap: onWhatsApp,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: BookingSuccessActionTile(
                icon: Icons.near_me_outlined,
                label: 'Como chegar',
                onTap: onDirections,
              ),
            ),
          ],
        ),
      ],
    );
  }
}
