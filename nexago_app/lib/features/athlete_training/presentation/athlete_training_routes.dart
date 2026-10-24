import 'package:go_router/go_router.dart';

import '../../../core/router/routes.dart';
import 'athlete_training_add_page.dart';
import 'athlete_training_agenda_page.dart';
import 'athlete_training_arena_class_page.dart';
import 'athlete_training_center_contract_pages.dart';
import 'athlete_training_center_enrollment_pages.dart';
import 'athlete_training_center_invoice_page.dart';
import 'athlete_training_center_page.dart';
import 'athlete_training_center_session_page.dart';
import 'athlete_training_checkin_page.dart';
import 'athlete_training_classes_page.dart';
import 'athlete_training_evolution_page.dart';
import 'athlete_training_feedbacks_page.dart';
import 'athlete_training_find_professor_page.dart';
import 'athlete_training_homework_page.dart';
import 'athlete_training_hub_page.dart';
import 'athlete_training_makeup_page.dart';
import 'athlete_training_plans_page.dart';
import 'athlete_training_private_link_page.dart';
import 'athlete_training_professor_profile_page.dart';
import 'athlete_training_professors_page.dart';
import 'athlete_training_review_pages.dart';
import 'training_shell_page.dart';

/// Rotas de Meus treinos.
///
/// O shell ([TrainingShellPage]) tem as abas Treinos · Agenda · Feedbacks ·
/// Evolução · Professores (a ordem dos branches é a da barra). O resto de
/// `/treinos/...` são rotas de topo com o caminho completo: empilham por cima
/// do shell (de qualquer aba, sem a barra) e o voltar devolve à aba de onde
/// saíram.
List<RouteBase> athleteTrainingRoutes() => [
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) =>
            TrainingShellPage(navigationShell: navigationShell),
        branches: [
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: AppRoutes.athleteTrainings,
                name: AppRouteNames.athleteTrainings,
                builder: (context, state) => const AthleteTrainingHubPage(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: AppRoutes.athleteTrainingAgenda,
                name: AppRouteNames.athleteTrainingAgenda,
                builder: (context, state) => const AthleteTrainingAgendaPage(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: AppRoutes.athleteTrainingFeedbacks,
                name: AppRouteNames.athleteTrainingFeedbacks,
                builder: (context, state) =>
                    const AthleteTrainingFeedbacksPage(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: AppRoutes.athleteTrainingEvolution,
                name: AppRouteNames.athleteTrainingEvolution,
                builder: (context, state) =>
                    const AthleteTrainingEvolutionPage(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: AppRoutes.athleteTrainingProfessors,
                name: AppRouteNames.athleteTrainingProfessors,
                builder: (context, state) =>
                    const AthleteTrainingProfessorsPage(),
              ),
            ],
          ),
        ],
      ),
      GoRoute(
        path: AppRoutes.athleteTrainingClasses,
        name: AppRouteNames.athleteTrainingClasses,
        builder: (context, state) => const AthleteTrainingClassesPage(),
      ),
      GoRoute(
        path: AppRoutes.athleteTrainingReviewStart,
        name: AppRouteNames.athleteTrainingReviewStart,
        builder: (context, state) => const AthleteTrainingReviewStartPage(),
      ),
      GoRoute(
        path: AppRoutes.athleteTrainingReview,
        name: AppRouteNames.athleteTrainingReview,
        builder: (context, state) => AthleteTrainingReviewPage(
          reviewKey: state.pathParameters['key'] ?? '',
          initialStars: int.tryParse(state.uri.queryParameters['n'] ?? '') ?? 0,
        ),
      ),
      GoRoute(
        path: AppRoutes.athleteTrainingReviews,
        name: AppRouteNames.athleteTrainingReviews,
        builder: (context, state) => const AthleteTrainingReviewsPage(),
      ),
      GoRoute(
        path: AppRoutes.athleteTrainingFindProfessor,
        name: AppRouteNames.athleteTrainingFindProfessor,
        builder: (context, state) => const AthleteTrainingFindProfessorPage(),
      ),
      GoRoute(
        path: AppRoutes.athleteTrainingProfessorProfile,
        name: AppRouteNames.athleteTrainingProfessorProfile,
        builder: (context, state) => AthleteTrainingProfessorProfilePage(
          professorUid: state.pathParameters['professorUid']?.trim() ?? '',
        ),
      ),
      GoRoute(
        path: AppRoutes.athleteTrainingHomework,
        name: AppRouteNames.athleteTrainingHomework,
        builder: (context, state) => AthleteTrainingHomeworkPage(
          viewId: state.pathParameters['viewId']?.trim() ?? '',
        ),
      ),
      GoRoute(
        path: AppRoutes.athleteTrainingPlans,
        name: AppRouteNames.athleteTrainingPlans,
        builder: (context, state) => const AthleteTrainingPlansPage(),
      ),
      GoRoute(
        path: AppRoutes.athleteTrainingMakeup,
        name: AppRouteNames.athleteTrainingMakeup,
        builder: (context, state) => AthleteTrainingMakeupPage(
          creditId: state.uri.queryParameters['credito']?.trim(),
        ),
      ),
      GoRoute(
        path: AppRoutes.athleteTrainingCheckIn,
        name: AppRouteNames.athleteTrainingCheckIn,
        builder: (context, state) => AthleteTrainingCheckInPage(
          sessionId: state.pathParameters['sessionId']?.trim() ?? '',
        ),
      ),
      GoRoute(
        path: AppRoutes.athleteTrainingAdd,
        name: AppRouteNames.athleteTrainingAdd,
        builder: (context, state) => const AthleteTrainingAddPage(),
      ),
      GoRoute(
        path: AppRoutes.athleteTrainingPrivateLink,
        name: AppRouteNames.athleteTrainingPrivateLink,
        builder: (context, state) => AthleteTrainingPrivateLinkPage(
          professorUid: state.pathParameters['professorUid']?.trim() ?? '',
        ),
      ),
      GoRoute(
        path: AppRoutes.athleteTrainingArenaClass,
        name: AppRouteNames.athleteTrainingArenaClass,
        builder: (context, state) => AthleteTrainingArenaClassPage(
          enrollmentId: state.pathParameters['enrollmentId']?.trim() ?? '',
        ),
      ),
      GoRoute(
        path: AppRoutes.athleteTrainingCenter,
        name: AppRouteNames.athleteTrainingCenter,
        builder: (context, state) => AthleteTrainingCenterPage(
          centerId: state.pathParameters['centerId']?.trim() ?? '',
          initialTab: state.uri.queryParameters['aba']?.trim(),
        ),
        routes: [
          GoRoute(
            path: 'aula/:sessionId',
            name: AppRouteNames.athleteTrainingCenterSession,
            builder: (context, state) => AthleteTrainingCenterSessionPage(
              centerId: state.pathParameters['centerId']?.trim() ?? '',
              sessionId: state.pathParameters['sessionId']?.trim() ?? '',
            ),
          ),
          GoRoute(
            path: 'fatura/:invoiceId',
            name: AppRouteNames.athleteTrainingCenterInvoice,
            builder: (context, state) => AthleteTrainingCenterInvoicePage(
              centerId: state.pathParameters['centerId']?.trim() ?? '',
              invoiceId: state.pathParameters['invoiceId']?.trim() ?? '',
            ),
          ),
          GoRoute(
            path: 'contratos',
            name: AppRouteNames.athleteTrainingCenterContracts,
            builder: (context, state) => AthleteTrainingCenterContractsPage(
              centerId: state.pathParameters['centerId']?.trim() ?? '',
            ),
          ),
          // As duas antes de `contrato/:contractId` (mais específicas).
          GoRoute(
            path: 'contrato/:contractId/assinar',
            name: AppRouteNames.athleteTrainingCenterContractSign,
            builder: (context, state) => AthleteTrainingCenterContractSignPage(
              centerId: state.pathParameters['centerId']?.trim() ?? '',
              contractId: state.pathParameters['contractId']?.trim() ?? '',
              readSeconds: int.tryParse(
                state.uri.queryParameters['leitura'] ?? '',
              ),
            ),
          ),
          GoRoute(
            path: 'contrato/:contractId/assinado',
            name: AppRouteNames.athleteTrainingCenterContractSigned,
            builder: (context, state) =>
                AthleteTrainingCenterContractSignedPage(
              centerId: state.pathParameters['centerId']?.trim() ?? '',
              contractId: state.pathParameters['contractId']?.trim() ?? '',
              result: CenterContractSignedArgs.fromQuery(
                state.uri.queryParameters,
              ),
            ),
          ),
          GoRoute(
            path: 'contrato/:contractId',
            name: AppRouteNames.athleteTrainingCenterContract,
            builder: (context, state) => AthleteTrainingCenterContractPage(
              centerId: state.pathParameters['centerId']?.trim() ?? '',
              contractId: state.pathParameters['contractId']?.trim() ?? '',
            ),
          ),
          GoRoute(
            path: 'matricula/:enrollmentId',
            name: AppRouteNames.athleteTrainingCenterEnrollment,
            builder: (context, state) => AthleteCenterEnrollmentPage(
              centerId: state.pathParameters['centerId']?.trim() ?? '',
              enrollmentId:
                  state.pathParameters['enrollmentId']?.trim() ?? '',
            ),
            routes: [
              GoRoute(
                path: 'trancar',
                name: AppRouteNames.athleteTrainingCenterEnrollmentPause,
                builder: (context, state) => AthleteCenterPausePage(
                  centerId: state.pathParameters['centerId']?.trim() ?? '',
                  enrollmentId:
                      state.pathParameters['enrollmentId']?.trim() ?? '',
                ),
              ),
              GoRoute(
                path: 'lesao',
                name: AppRouteNames.athleteTrainingCenterEnrollmentInjury,
                builder: (context, state) => AthleteCenterInjuryPage(
                  centerId: state.pathParameters['centerId']?.trim() ?? '',
                  enrollmentId:
                      state.pathParameters['enrollmentId']?.trim() ?? '',
                ),
              ),
              GoRoute(
                path: 'cancelar',
                name: AppRouteNames.athleteTrainingCenterEnrollmentCancel,
                builder: (context, state) => AthleteCenterCancelPage(
                  centerId: state.pathParameters['centerId']?.trim() ?? '',
                  enrollmentId:
                      state.pathParameters['enrollmentId']?.trim() ?? '',
                ),
              ),
            ],
          ),
        ],
      ),
    ];
