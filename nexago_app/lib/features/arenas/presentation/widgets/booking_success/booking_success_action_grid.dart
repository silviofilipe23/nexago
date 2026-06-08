import 'package:flutter/material.dart';

import 'booking_success_action_tile.dart';

class BookingSuccessActionGrid extends StatelessWidget {
  const BookingSuccessActionGrid({
    super.key,
    required this.onShare,
    required this.onDirections,
  });

  final VoidCallback onShare;
  final VoidCallback onDirections;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: BookingSuccessActionTile(
            icon: Icons.ios_share_rounded,
            label: 'Compartilhar',
            onTap: onShare,
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
    );
  }
}
