import 'package:flutter/material.dart';

import '../../../../../core/theme/app_spacing.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../tournament_registration/tournament_registration_header.dart';

/// Casca comum das telas do wizard de inscrição: cabeçalho com voltar,
/// corpo rolável e barra fixa opcional.
///
/// Todas as telas do fluxo usam esta casca para o cabeçalho e o espaçamento
/// não divergirem tela a tela — foi o que aconteceu com a tela única, que
/// acumulou 1656 linhas justamente por ser a dona de tudo.
class RegistrationWizardScaffold extends StatelessWidget {
  const RegistrationWizardScaffold({
    super.key,
    required this.title,
    required this.onBack,
    required this.children,
    this.subtitle,
    this.stickyBar,
  });

  final String title;
  final String? subtitle;
  final VoidCallback onBack;
  final List<Widget> children;
  final Widget? stickyBar;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            TournamentRegistrationHeader(
              onBack: onBack,
              title: title,
              tournamentName: subtitle,
              showTournamentInfo: subtitle != null,
            ),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.screenH,
                  AppSpacing.lg,
                  AppSpacing.screenH,
                  AppSpacing.xxl,
                ),
                children: children,
              ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: stickyBar,
    );
  }
}
