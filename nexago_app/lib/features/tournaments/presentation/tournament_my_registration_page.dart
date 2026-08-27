import 'package:flutter/material.dart';

import '../../../core/layout/nexa_app_bar.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'widgets/tournament_detail/tournament_detail_my_registration_tab.dart';

/// "Minha inscrição" do torneio — trilha de passos + inscrições confirmadas
/// (aberto pelo card correspondente da Visão geral).
class TournamentMyRegistrationPage extends StatelessWidget {
  const TournamentMyRegistrationPage({super.key, required this.tournamentId});

  final String tournamentId;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    return Scaffold(
      backgroundColor: colors.canvas,
      appBar: const NexaAppBar(title: Text('Minha inscrição')),
      body: TournamentDetailMyRegistrationTab(tournamentId: tournamentId),
    );
  }
}
