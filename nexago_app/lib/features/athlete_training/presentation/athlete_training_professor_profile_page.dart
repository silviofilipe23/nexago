import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/formatting/app_currency_format.dart';
import '../../../core/router/navigation_helpers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../arena/domain/aulas/arena_class_logic.dart';
import '../../arena/presentation/aulas/widgets/arena_class_atoms.dart';
import '../../messages/application/messages_providers.dart';
import '../../messages/presentation/messages_widgets.dart';
import '../../professor_links/domain/arena_professor_link.dart';
import '../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../professor_mode/presentation/availability/athlete_private_lessons_pages.dart'
    show openPrivateLessonBooking;
import '../../professor_mode/presentation/widgets/professor_students_widgets.dart';
import '../application/athlete_training_providers.dart';
import '../domain/public_professor.dart';
import '../domain/athlete_training.dart' show trainingFirstName;
import '../infrastructure/class_presence_repository.dart'
    show ClassPresenceException;
import '../infrastructure/public_professor_repository.dart';
import 'widgets/training_widgets.dart';

/// T11 · Perfil do professor visto pelo atleta: onde dá aula (equipe da arena
/// × independente, porque muda quem cobra), nota dos feedbacks e os planos
/// de particular (só com a disponibilidade publicada no perfil).
///
/// Aluno dele: Mensagem e Agendar. Quem ainda não é aluno: "Pedir contato" —
/// o professor recebe o perfil e decide se convida para a carteira.
class AthleteTrainingProfessorProfilePage extends ConsumerStatefulWidget {
  const AthleteTrainingProfessorProfilePage({
    super.key,
    required this.professorUid,
  });

  final String professorUid;

  @override
  ConsumerState<AthleteTrainingProfessorProfilePage> createState() =>
      _AthleteTrainingProfessorProfilePageState();
}

class _AthleteTrainingProfessorProfilePageState
    extends ConsumerState<AthleteTrainingProfessorProfilePage> {
  bool _busy = false;

  /// Pedido feito nesta tela (o servidor confirma na próxima leitura).
  bool _requested = false;

  Future<void> _message() async {
    setState(() => _busy = true);
    await openConversationWith(
      context,
      () => ref
          .read(messagesRepositoryProvider)
          .openStudentConversation(widget.professorUid),
      professorMode: false,
    );
    if (mounted) setState(() => _busy = false);
  }

  Future<void> _requestContact(PublicProfessor p) async {
    final message = await showProfessorLinksSheet<String>(
      context,
      builder: (_) => _ContactSheet(name: p.name),
    );
    if (message == null || !mounted) return;
    setState(() => _busy = true);
    try {
      await ref
          .read(publicProfessorRepositoryProvider)
          .requestContact(widget.professorUid, message: message);
      if (!mounted) return;
      setState(() => _requested = true);
      showAppSnackBar(
        context,
        '${trainingFirstName(p.name)} recebeu seu perfil. Se aceitar, você '
        'recebe o convite no app.',
      );
    } catch (e) {
      if (!mounted) return;
      if (e is ClassPresenceException && e.code == 'already-exists') {
        setState(() => _requested = true);
      }
      showAppSnackBar(
        context,
        e is ClassPresenceException
            ? e.message
            : 'Não deu certo agora. Tente de novo.',
        isError: e is! ClassPresenceException || e.code != 'already-exists',
      );
    }
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final async = ref.watch(publicProfessorProvider(widget.professorUid));
    final p = async.valueOrNull;

    if (p == null) {
      return ProfessorLinksScaffold(
        title: 'Professor',
        onBack: () => popOrGo(context, AppRoutes.athleteTrainingProfessors),
        body: ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
          children: [
            if (async.hasError)
              ProfessorRetryCard(
                message: async.error is ClassPresenceException
                    ? (async.error! as ClassPresenceException).message
                    : 'Não foi possível abrir o perfil.',
                onRetry: () => ref
                    .invalidate(publicProfessorProvider(widget.professorUid)),
              )
            else
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 40),
                child: Center(
                  child: CircularProgressIndicator(color: AppColors.brand),
                ),
              ),
          ],
        ),
      );
    }

    final requested = _requested || p.contactRequested;
    final subtitle = [
      ...p.modalities.take(2),
      if (p.since != null) professorSinceLabel(p.since!),
    ].join(' · ');

    return ProfessorLinksScaffold(
      title: '',
      onBack: () => popOrGo(context, AppRoutes.athleteTrainingProfessors),
      body: Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
              children: [
                Center(
                  child: ArenaClassAvatar(
                    initials: arenaClassInitials(p.name),
                    photoUrl: p.photoUrl,
                    size: 84,
                    zoomName: p.name,
                    zoomRole: 'Professor',
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  p.name,
                  textAlign: TextAlign.center,
                  style:
                      ProfessorLinksStyle.display(23, color: colors.onSurface),
                ),
                if (subtitle.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text(
                    subtitle,
                    textAlign: TextAlign.center,
                    style: AppTypography.bodyS.copyWith(
                      fontSize: 13,
                      color: ProfessorLinksStyle.mute(colors),
                    ),
                  ),
                ],
                const SizedBox(height: 6),
                Text.rich(
                  key: const Key('professor-profile-rating'),
                  textAlign: TextAlign.center,
                  p.rating == null
                      ? TextSpan(
                          text: 'Sem avaliações ainda',
                          style: AppTypography.bodyS.copyWith(
                            fontSize: 12,
                            color: ProfessorLinksStyle.dim(colors),
                          ),
                        )
                      : TextSpan(
                          children: [
                            WidgetSpan(
                              alignment: PlaceholderAlignment.middle,
                              child: Padding(
                                padding: const EdgeInsets.only(right: 4),
                                child: Icon(Icons.star_rounded,
                                    size: 15, color: colors.brandText),
                              ),
                            ),
                            TextSpan(
                              text: professorRatingLabel(p.rating!),
                              style: ProfessorLinksStyle.mono(
                                12.5,
                                color: colors.onSurface,
                              ),
                            ),
                            TextSpan(
                              text: ' · ${p.ratingCount} '
                                  '${p.ratingCount == 1 ? 'avaliação' : 'avaliações'} '
                                  'de aula',
                              style: AppTypography.bodyS.copyWith(
                                fontSize: 12,
                                color: ProfessorLinksStyle.dim(colors),
                              ),
                            ),
                          ],
                        ),
                ),
                if (p.isMyProfessor) ...[
                  const SizedBox(height: 16),
                  const ProfessorLinksNote(
                    'É seu professor: mande mensagem ou agende pelo app.',
                    key: Key('professor-profile-mine'),
                    tone: ProfessorLinksNoteTone.blue,
                  ),
                ],
                if (p.arenas.isNotEmpty) ...[
                  const TrainingSectionTitle('Onde dá aula'),
                  for (final a in p.arenas) ...[
                    ProfessorLinksCard(
                      key: Key('professor-profile-arena-${a.arenaId}'),
                      padding: const EdgeInsets.all(12),
                      onTap: () => context.pushNamed(
                        AppRouteNames.arenaDetail,
                        pathParameters: {'arenaId': a.arenaId},
                      ),
                      child: Row(
                        children: [
                          ProfessorArenaMark(
                            name: a.arenaName,
                            logoUrl: a.logoUrl,
                            size: 38,
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  a.arenaName,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: ProfessorLinksStyle.display(
                                    13.5,
                                    weight: FontWeight.w700,
                                    color: colors.onSurface,
                                  ),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  [
                                    a.independent
                                        ? 'Particulares · cobradas pelo professor'
                                        : 'Turmas · cobradas pela arena',
                                    if (a.distanceKm != null)
                                      professorDistanceLabel(a.distanceKm!)
                                    else if (a.city.isNotEmpty)
                                      a.city,
                                  ].join(' · '),
                                  maxLines: 2,
                                  style: AppTypography.bodyS.copyWith(
                                    fontSize: 11.5,
                                    color: ProfessorLinksStyle.dim(colors),
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 8),
                          ProfessorLinkTypeTag(
                            a.independent
                                ? ArenaProfessorLinkType.independent
                                : ArenaProfessorLinkType.arenaStaff,
                            small: true,
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 8),
                  ],
                ],
                if (p.plans.isNotEmpty) ...[
                  const TrainingSectionTitle('Particular'),
                  ProfessorLinksCard(
                    key: const Key('professor-profile-plans'),
                    padding: const EdgeInsets.symmetric(horizontal: 13),
                    child: Column(
                      children: [
                        for (final (i, plan) in p.plans.indexed)
                          Container(
                            padding: const EdgeInsets.symmetric(vertical: 10),
                            decoration: BoxDecoration(
                              border: i == 0
                                  ? null
                                  : Border(
                                      top: BorderSide(
                                        color: ProfessorLinksStyle.line(colors),
                                      ),
                                    ),
                            ),
                            child: Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    [
                                      plan.name,
                                      if (plan.classes != null)
                                        '${plan.classes} aulas',
                                    ].join(' · '),
                                    style: AppTypography.bodyS.copyWith(
                                      fontSize: 12.5,
                                      color: ProfessorLinksStyle.mute(colors),
                                    ),
                                  ),
                                ),
                                Text(
                                  '${formatBRL(plan.priceReais)}'
                                  '${plan.kind == 'monthly' ? '/mês' : ''}',
                                  style: ProfessorLinksStyle.display(
                                    12.5,
                                    weight: FontWeight.w600,
                                    color: colors.onSurface,
                                  ),
                                ),
                              ],
                            ),
                          ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'Cobrados direto pelo professor, por Pix ou cartão.',
                    style: AppTypography.bodyS.copyWith(
                      fontSize: 11.5,
                      color: ProfessorLinksStyle.dim(colors),
                    ),
                  ),
                ],
              ],
            ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
              child: p.isMyProfessor
                  ? Row(
                      children: [
                        Expanded(
                          child: ProfessorLinksGhostButton(
                            key: const Key('professor-profile-message'),
                            label: 'Mensagem',
                            loading: _busy,
                            onPressed: _busy ? null : _message,
                          ),
                        ),
                        if (p.acceptsPrivate) ...[
                          const SizedBox(width: 8),
                          Expanded(
                            flex: 2,
                            child: ProfessorLinksPrimaryButton(
                              key: const Key('professor-profile-book'),
                              label: 'Agendar particular',
                              onPressed: () => openPrivateLessonBooking(
                                context,
                                professorUid: p.professorUid,
                                professorName: p.name,
                              ),
                            ),
                          ),
                        ],
                      ],
                    )
                  : ProfessorLinksPrimaryButton(
                      key: const Key('professor-profile-contact'),
                      label: requested ? 'Contato pedido' : 'Pedir contato',
                      loading: _busy,
                      onPressed:
                          requested || _busy ? null : () => _requestContact(p),
                    ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Mensagem opcional do "Pedir contato".
class _ContactSheet extends StatefulWidget {
  const _ContactSheet({required this.name});

  final String name;

  @override
  State<_ContactSheet> createState() => _ContactSheetState();
}

class _ContactSheetState extends State<_ContactSheet> {
  final _message = TextEditingController();

  @override
  void dispose() {
    _message.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return ProfessorLinksSheetBody(
      title: 'Pedir contato',
      subtitle: '${trainingFirstName(widget.name)} recebe seu perfil e decide '
          'se convida você para a carteira de alunos.',
      children: [
        TextField(
          key: const Key('professor-contact-message'),
          controller: _message,
          maxLength: 300,
          maxLines: 3,
          style: AppTypography.bodyS.copyWith(
            fontSize: 13,
            color: colors.onSurface,
          ),
          decoration: InputDecoration(
            hintText: 'Mensagem opcional (ex.: quero melhorar o saque)',
            hintStyle: AppTypography.bodyS.copyWith(
              fontSize: 13,
              color: ProfessorLinksStyle.dim(colors),
            ),
            filled: true,
            fillColor: colors.surfaceRaised,
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(13),
              borderSide: BorderSide(color: ProfessorLinksStyle.line2(colors)),
            ),
          ),
        ),
        ProfessorLinksPrimaryButton(
          key: const Key('professor-contact-send'),
          label: 'Enviar meu perfil',
          onPressed: () => Navigator.pop(context, _message.text.trim()),
        ),
      ],
    );
  }
}
