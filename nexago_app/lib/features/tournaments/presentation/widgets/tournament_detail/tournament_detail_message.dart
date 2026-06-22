import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'tournament_detail_tab_slivers.dart';

class TournamentDetailMessageList extends StatelessWidget {
  const TournamentDetailMessageList({
    super.key,
    required this.title,
    required this.message,
  });

  final String title;
  final String message;

  List<Widget> buildSlivers() {
    return tournamentDetailTabSliversFromChildren(
      padding: const EdgeInsets.fromLTRB(20, 24, 20, 32),
      children: [TournamentDetailMessageBody(title: title, message: message)],
    );
  }

  @override
  Widget build(BuildContext context) {
    return CustomScrollView(slivers: buildSlivers());
  }
}

class TournamentDetailMessageBody extends StatelessWidget {
  const TournamentDetailMessageBody({
    super.key,
    required this.title,
    required this.message,
  });

  final String title;
  final String message;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: AppTypography.soraRegular(
            fontSize: 16,
            fontWeight: FontWeight.w800,
            color: context.themeColors.onSurface,
          ),
        ),
        SizedBox(height: 8),
        Text(
          message,
          style: AppTypography.soraRegular(
            fontSize: 14,
            color: context.themeColors.onSurfaceMuted,
            fontWeight: FontWeight.w500,
            height: 1.5,
          ),
        ),
      ],
    );
  }
}
