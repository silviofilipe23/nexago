import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/formatting/app_currency_format.dart';
import '../../../core/router/navigation_helpers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../application/athlete_training_providers.dart';
import '../domain/athlete_training.dart';
import '../domain/training_center.dart';
import '../domain/training_plans.dart';
import '../infrastructure/class_presence_repository.dart'
    show ClassPresenceException;
import '../infrastructure/training_centers_repository.dart';
import 'widgets/training_origin_widgets.dart';
import 'widgets/training_widgets.dart';

/// O3 · Adicionar treino — o convite do centro de treinamento (cadastro
/// feito pelo e-mail da conta) e por onde começar com cada origem.
class AthleteTrainingAddPage extends ConsumerWidget {
  const AthleteTrainingAddPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final data = ref.watch(athleteTrainingCentersDataProvider).valueOrNull;
    final invites = data?.invites ?? const <CenterInvite>[];
    return ProfessorLinksScaffold(
      title: 'Adicionar treino',
      subtitle: 'COMO VOCÊ QUER TREINAR?',
      onBack: () => popOrGo(context, AppRoutes.athleteTrainings),
      body: RefreshIndicator(
        color: AppColors.brand,
        onRefresh: () async {
          refreshAthleteTrainingCenters(ref);
          await ref.read(athleteTrainingCentersDataProvider.future);
        },
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
          children: [
            for (final i in invites) ...[
              CenterInviteCard(
                key: Key('center-invite-${i.studentId}'),
                invite: i,
              ),
              const SizedBox(height: 10),
            ],
            if ((data?.unverifiedInvites ?? 0) > 0) ...[
              const TrainingOriginNote(
                key: Key('center-invite-unverified'),
                color: trainingCenterColor,
                icon: Icons.mark_email_unread_outlined,
                title: 'Tem um convite de centro para você',
                text:
                    'Confirme o e-mail da sua conta (link no seu e-mail) '
                    'para ver e aceitar o convite.',
              ),
              const SizedBox(height: 10),
            ],
            const TrainingSectionTitle('Começar algo novo'),
            _Option(
              key: const Key('training-add-private'),
              origin: TrainingOrigin.private,
              icon: Icons.person_search_outlined,
              title: 'Professor particular',
              subtitle: 'Encontre um professor e agende aula avulsa ou pacote',
              onTap: () =>
                  context.pushNamed(AppRouteNames.athleteTrainingFindProfessor),
            ),
            const SizedBox(height: 8),
            _Option(
              key: const Key('training-add-arena'),
              origin: TrainingOrigin.arena,
              icon: Icons.place_outlined,
              title: 'Turma de arena',
              subtitle:
                  'Turmas fixas com professores da equipe da arena — veja as '
                  'arenas perto de você',
              onTap: () => context.go(AppRoutes.discover),
            ),
            const SizedBox(height: 8),
            _Option(
              key: const Key('training-add-center'),
              origin: TrainingOrigin.center,
              icon: Icons.sports_rounded,
              title: 'Centro de treinamento',
              subtitle:
                  'Programas com matrícula, níveis e mensalidade. Peça ao '
                  'centro para cadastrar você pelo e-mail da sua conta: o '
                  'convite aparece aqui.',
            ),
            const SizedBox(height: 16),
            Text(
              'Cada origem cobra separado: o professor particular cobra '
              'direto de você, a turma é paga à arena e o centro cobra a '
              'mensalidade dele.',
              style: AppTypography.bodyS.copyWith(
                fontSize: 11.5,
                height: 1.45,
                color: ProfessorLinksStyle.dim(colors),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Option extends StatelessWidget {
  const _Option({
    super.key,
    required this.origin,
    required this.icon,
    required this.title,
    required this.subtitle,
    this.onTap,
  });

  final TrainingOrigin origin;
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final color = trainingOriginColor(origin);
    return ProfessorLinksCard(
      onTap: onTap,
      child: Row(
        children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(13),
              border: Border.all(color: color.withValues(alpha: 0.3)),
            ),
            child: Icon(icon, size: 19, color: colors.readableTone(color)),
          ),
          const SizedBox(width: 13),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: ProfessorLinksStyle.display(
                    14,
                    weight: FontWeight.w700,
                    color: colors.onSurface,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  subtitle,
                  style: AppTypography.bodyS.copyWith(
                    fontSize: 12,
                    height: 1.35,
                    color: ProfessorLinksStyle.dim(colors),
                  ),
                ),
              ],
            ),
          ),
          if (onTap != null) ...[
            const SizedBox(width: 8),
            Icon(
              Icons.chevron_right_rounded,
              size: 18,
              color: ProfessorLinksStyle.dim(colors),
            ),
          ],
        ],
      ),
    );
  }
}

/// Convite pendente do centro: turma, horário e mensalidade, com
/// "Recusar" / "Aceitar". Aceitar vincula a conta ao cadastro do centro.
class CenterInviteCard extends ConsumerStatefulWidget {
  const CenterInviteCard({super.key, required this.invite});

  final CenterInvite invite;

  @override
  ConsumerState<CenterInviteCard> createState() => _CenterInviteCardState();
}

class _CenterInviteCardState extends ConsumerState<CenterInviteCard> {
  bool? _sending; // true = aceitar

  Future<void> _answer(bool accept) async {
    setState(() => _sending = accept);
    try {
      await ref
          .read(trainingCentersRepositoryProvider)
          .answerInvite(
            centerId: widget.invite.centerId,
            studentId: widget.invite.studentId,
            accept: accept,
          );
      refreshAthleteTrainingCenters(ref);
      if (!mounted) return;
      ScaffoldMessenger.maybeOf(context)
        ?..hideCurrentSnackBar()
        ..showSnackBar(
          SnackBar(
            content: Text(
              accept
                  ? 'Pronto! Você agora é aluno do ${widget.invite.centerName}.'
                  : 'Convite recusado.',
            ),
          ),
        );
      if (accept) {
        context.pushNamed(
          AppRouteNames.athleteTrainingCenter,
          pathParameters: {'centerId': widget.invite.centerId},
        );
      }
    } on ClassPresenceException catch (e) {
      if (mounted) {
        ScaffoldMessenger.maybeOf(context)
          ?..hideCurrentSnackBar()
          ..showSnackBar(SnackBar(content: Text(e.message)));
      }
    } finally {
      if (mounted) setState(() => _sending = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final i = widget.invite;
    final tone = colors.readableTone(trainingCenterColor);
    final lines = [
      for (final e in i.enrollments)
        [
          e.className,
          arenaPlanScheduleLabel([
            for (final w in e.weekdays)
              ArenaPlanSlot(
                className: e.className,
                weekday: w,
                startTime: e.startTime,
              ),
          ]),
          '${formatBRLFromCents(e.priceCents)}${e.isPack ? '' : '/mês'}',
        ].where((s) => s.isNotEmpty).join(' · '),
    ];
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: trainingCenterColor.withValues(alpha: 0.07),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: trainingCenterColor.withValues(alpha: 0.32)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Text(
                'CONVITE PENDENTE',
                style: ProfessorLinksStyle.mono(9.5, color: tone),
              ),
              const Spacer(),
              if (i.invitedAt != null)
                Text(
                  trainingPlanShortDate(i.invitedAt!).toUpperCase(),
                  style: ProfessorLinksStyle.mono(
                    9.5,
                    color: ProfessorLinksStyle.dim(colors),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 11),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              TrainingOriginMark(
                origin: TrainingOrigin.center,
                name: i.centerName,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      i.centerName,
                      style: ProfessorLinksStyle.display(
                        14,
                        weight: FontWeight.w700,
                        color: colors.onSurface,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      lines.isEmpty
                          ? (i.placeLabel.isEmpty
                                ? 'O centro cadastrou você pelo seu e-mail.'
                                : i.placeLabel)
                          : lines.join('\n'),
                      style: AppTypography.bodyS.copyWith(
                        fontSize: 12,
                        height: 1.35,
                        color: ProfessorLinksStyle.mute(colors),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            'Ao aceitar, o centro passa a ver sua conta NexaGO e você '
            'concorda com o uso dos seus dados para as aulas e cobranças '
            '(LGPD).',
            style: AppTypography.bodyS.copyWith(
              fontSize: 11,
              height: 1.4,
              color: ProfessorLinksStyle.dim(colors),
            ),
          ),
          const SizedBox(height: 11),
          Row(
            children: [
              Expanded(
                flex: 10,
                child: ProfessorLinksGhostButton(
                  key: Key('center-invite-decline-${i.studentId}'),
                  label: 'Recusar',
                  height: 42,
                  loading: _sending == false,
                  onPressed: _sending != null ? null : () => _answer(false),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                flex: 14,
                child: ProfessorLinksPrimaryButton(
                  key: Key('center-invite-accept-${i.studentId}'),
                  label: 'Aceitar convite',
                  height: 42,
                  loading: _sending == true,
                  onPressed: _sending != null ? null : () => _answer(true),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
