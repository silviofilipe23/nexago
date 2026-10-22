import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../professor_links/application/professor_links_providers.dart';
import '../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../application/athlete_training_providers.dart';
import '../../domain/athlete_training.dart';
import '../../domain/training_center.dart';
import '../../infrastructure/class_presence_repository.dart'
    show ClassPresenceException;
import '../../infrastructure/training_centers_repository.dart';
import 'training_origin_widgets.dart';

/// Ainda dá para responder à aula do centro: marcada, sem chamada da equipe
/// (presente/falta) e antes de começar.
bool centerSessionCanRespond(
  CenterSession s,
  TrainingSession t,
  DateTime now,
) =>
    s.status == 'scheduled' &&
    s.myMark != 'present' &&
    s.myMark != 'absent' &&
    t.startAt.isAfter(now);

/// Avisar agora ainda está dentro do prazo do centro (vira reposição)?
bool centerNoticeInTime(
  TrainingCenterLink c,
  TrainingSession t,
  DateTime now,
) =>
    c.policies.excusedAbsenceMakeup &&
    t.startAt.difference(now) >= Duration(hours: c.policies.excusedNoticeHours);

/// O7 · "Confirmar presença" / "Não vou" na aula do centro, com o estado da
/// resposta do aluno.
class CenterSessionPresence extends ConsumerStatefulWidget {
  const CenterSessionPresence({
    super.key,
    required this.center,
    required this.session,
    required this.training,
  });

  final TrainingCenterLink center;
  final CenterSession session;
  final TrainingSession training;

  @override
  ConsumerState<CenterSessionPresence> createState() =>
      _CenterSessionPresenceState();
}

class _CenterSessionPresenceState extends ConsumerState<CenterSessionPresence> {
  bool? _sending; // true = vou, false = não vou

  Future<void> _respond({required bool going}) async {
    setState(() => _sending = going);
    try {
      final excused = await ref
          .read(trainingCentersRepositoryProvider)
          .respond(
            centerId: widget.center.centerId,
            sessionId: widget.session.sessionId,
            going: going,
          );
      refreshAthleteTrainingCenters(ref);
      if (!mounted) return;
      _toast(
        going
            ? 'Presença confirmada.'
            : excused
            ? 'Falta avisada. Vira reposição quando o professor fechar a chamada.'
            : 'Aviso enviado ao centro.',
      );
    } on ClassPresenceException catch (e) {
      if (mounted) _toast(e.message);
    } finally {
      if (mounted) setState(() => _sending = null);
    }
  }

  void _toast(String text) {
    ScaffoldMessenger.maybeOf(context)
      ?..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(text)));
  }

  Future<void> _notGoing() async {
    final now = ref.read(professorLinksClockProvider)();
    final inTime = centerNoticeInTime(widget.center, widget.training, now);
    final ok = await showProfessorLinksSheet<bool>(
      context,
      builder: (sheet) => ProfessorLinksSheetBody(
        key: const Key('center-not-going-sheet'),
        title: 'Não vou à aula',
        subtitle:
            '${trainingWeekdayDay(widget.training.dateKey)} · '
            '${widget.training.startTime} · ${widget.session.className}',
        children: [
          ProfessorLinksNote(
            inTime
                ? 'Avisando agora, a falta fica justificada e vira um crédito '
                      'de reposição (vale '
                      '${widget.center.policies.makeupValidityDays} dias), '
                      'pela regra do ${widget.center.name}.'
                : widget.center.policies.excusedAbsenceMakeup
                ? 'Faltam menos de ${widget.center.policies.excusedNoticeHours}h '
                      'para a aula: o professor fica sabendo, mas pela regra '
                      'do centro não gera reposição.'
                : 'O professor fica sabendo. Neste centro, falta não gera '
                      'reposição.',
            tone: inTime
                ? ProfessorLinksNoteTone.blue
                : ProfessorLinksNoteTone.yellow,
          ),
          Row(
            children: [
              Expanded(
                child: ProfessorLinksGhostButton(
                  label: 'Voltar',
                  onPressed: () => Navigator.of(sheet).pop(false),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: ProfessorLinksPrimaryButton(
                  key: const Key('center-not-going-confirm'),
                  label: 'Avisar',
                  height: 48,
                  onPressed: () => Navigator.of(sheet).pop(true),
                ),
              ),
            ],
          ),
        ],
      ),
    );
    if (ok == true && mounted) await _respond(going: false);
  }

  @override
  Widget build(BuildContext context) {
    final now = ref.watch(professorLinksClockProvider)();
    final s = widget.session;
    if (!centerSessionCanRespond(s, widget.training, now)) {
      return const SizedBox.shrink();
    }
    final rsvp = s.myRsvp;
    if (rsvp == 'going') {
      return _Answered(
        key: const Key('center-presence-going'),
        color: AppColors.win,
        title: 'Presença confirmada',
        text: 'O professor vê que você vai.',
        action: 'Não vou mais',
        loading: _sending == false,
        onAction: _sending != null ? null : _notGoing,
      );
    }
    if (rsvp == 'not_going') {
      return _Answered(
        key: const Key('center-presence-not-going'),
        color: AppColors.pending,
        title: s.myMark == 'excused'
            ? 'Falta avisada · vira reposição'
            : 'Você avisou que não vai',
        text: s.myMark == 'excused'
            ? 'O crédito sai quando o professor fechar a chamada.'
            : 'O professor fica sabendo.',
        action: 'Vou, sim',
        loading: _sending == true,
        onAction: _sending != null ? null : () => _respond(going: true),
      );
    }
    return Row(
      children: [
        Expanded(
          flex: 10,
          child: ProfessorLinksGhostButton(
            key: const Key('center-presence-not-going-button'),
            label: 'Não vou',
            loading: _sending == false,
            onPressed: _sending != null ? null : _notGoing,
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          flex: 14,
          child: ProfessorLinksPrimaryButton(
            key: const Key('center-presence-going-button'),
            label: 'Confirmar presença',
            height: 48,
            loading: _sending == true,
            onPressed: _sending != null ? null : () => _respond(going: true),
          ),
        ),
      ],
    );
  }
}

class _Answered extends StatelessWidget {
  const _Answered({
    super.key,
    required this.color,
    required this.title,
    required this.text,
    required this.action,
    required this.loading,
    required this.onAction,
  });

  final Color color;
  final String title;
  final String text;
  final String action;
  final bool loading;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TrainingOriginNote(
          color: color,
          icon: Icons.check_circle_outline_rounded,
          title: title,
          text: text,
        ),
        const SizedBox(height: 8),
        ProfessorLinksGhostButton(
          label: action,
          height: 44,
          loading: loading,
          onPressed: onAction,
        ),
      ],
    );
  }
}
