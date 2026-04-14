import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/routes.dart';
import '../../../core/ui/success_page.dart';

/// Confirmação após gerar horários nas quadras (via [GoRouter]).
class ArenaAvailabilitySlotsSuccessPage extends StatelessWidget {
  const ArenaAvailabilitySlotsSuccessPage({super.key});

  @override
  Widget build(BuildContext context) {
    return SuccessPage(
      title: 'Horários gerados',
      message:
          'Os slots foram aplicados em todas as quadras conforme a disponibilidade configurada.',
      primaryActionLabel: 'Ir aos ajustes',
      onPrimaryAction: () => context.go(AppRoutes.arenaSettings),
    );
  }
}
