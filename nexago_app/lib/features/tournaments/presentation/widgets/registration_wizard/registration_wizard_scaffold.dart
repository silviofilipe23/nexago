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
    this.closeIcon = false,
  });

  final String title;
  final String? subtitle;
  final VoidCallback onBack;
  final List<Widget> children;
  final Widget? stickyBar;

  /// Repassado a [TournamentRegistrationHeader]: `true` troca a seta de
  /// voltar por um "X" de fechar, para telas terminais cujo `onBack` não
  /// desfaz um passo (ver doc lá). Default `false` — preserva a seta nas
  /// demais telas do wizard.
  final bool closeIcon;

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
              closeIcon: closeIcon,
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
