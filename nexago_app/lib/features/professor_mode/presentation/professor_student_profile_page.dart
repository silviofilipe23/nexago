import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/routes.dart';
import '../../athlete/presentation/public_profile/athlete_public_profile_page.dart';

/// I2–I6 · Perfil público do aluno aberto pelo professor, dentro do shell
/// `/professor/...`. É a MESMA tela que outro atleta vê
/// ([AthletePublicProfilePage]) em modo professor — sem acesso extra: perfil
/// privado aparece restrito, como para qualquer pessoa.
class ProfessorStudentProfilePage extends StatelessWidget {
  const ProfessorStudentProfilePage({super.key, required this.athleteId});

  final String athleteId;

  @override
  Widget build(BuildContext context) {
    return AthletePublicProfilePage(
      userId: athleteId,
      professorView: true,
      onProfessorEvaluate: () => context.pushNamed(
        AppRouteNames.professorEvaluate,
        pathParameters: {'athleteId': athleteId},
      ),
    );
  }
}
