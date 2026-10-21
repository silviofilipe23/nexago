import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../professor_links/application/professor_links_providers.dart';
import '../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../../professor_mode/presentation/availability/availability_widgets.dart';
import '../../application/athlete_training_providers.dart';
import '../../domain/athlete_training.dart';
import '../../domain/class_presence.dart';
import '../../infrastructure/class_presence_repository.dart';

/// Presença do aluno nas aulas da turma (T1, T3, T6): botão do "Próximo
/// treino", "Vou / Não vou" na lista e a folha do "Não vou".

void openTrainingCheckIn(BuildContext context, TrainingSession t) {
  context.pushNamed(
    AppRouteNames.athleteTrainingCheckIn,
    pathParameters: {'sessionId': t.id},
  );
}

void openTrainingMakeup(BuildContext context, {String? creditId}) {
  context.pushNamed(
    AppRouteNames.athleteTrainingMakeup,
    queryParameters: {if (creditId != null) 'credito': creditId},
  );
}

void _toast(BuildContext context, String text) {
  ScaffoldMessenger.maybeOf(context)
    ?..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(text)));
}

/// "Vou" — confirma (ou volta atrás no "Não vou").
Future<bool> confirmTrainingPresence(
  BuildContext context,
  WidgetRef ref,
  TrainingSession t,
) async {
  try {
    await ref
        .read(classPresenceRepositoryProvider)
        .respond(sessionId: t.id, going: true);
    refreshAthleteClassPresence(ref);
    if (context.mounted) _toast(context, 'Presença confirmada.');
    return true;
  } on ClassPresenceException catch (e) {
    if (context.mounted) _toast(context, e.message);
    return false;
  }
}

/// Folha "Não vou à aula" (T6). Fecha com o resultado — e, em "Avisar e
/// repor" com crédito, abre a escolha da reposição.
Future<void> showTrainingNotGoingSheet(
  BuildContext context,
  TrainingSession t,
) async {
  final result = await showProfessorLinksSheet<(ClassRsvpResult, bool)>(
    context,
    builder: (_) => TrainingNotGoingSheet(training: t),
  );
  if (result == null || !context.mounted) return;
  final (outcome, repor) = result;
  _toast(context, notGoingResultMessage(outcome));
  if (repor && outcome.granted) {
    openTrainingMakeup(context, creditId: outcome.creditId);
  }
}

class TrainingNotGoingSheet extends ConsumerStatefulWidget {
  const TrainingNotGoingSheet({super.key, required this.training});

  final TrainingSession training;

  @override
  ConsumerState<TrainingNotGoingSheet> createState() =>
      _TrainingNotGoingSheetState();
}

class _TrainingNotGoingSheetState extends ConsumerState<TrainingNotGoingSheet> {
  String _reason = kNotGoingReasons.first.$1;
  final _message = TextEditingController();
  bool? _sending; // true = "Avisar e repor"
  String? _error;

  @override
  void dispose() {
    _message.dispose();
    super.dispose();
  }

  Future<void> _send({required bool repor}) async {
    setState(() {
      _sending = repor;
      _error = null;
    });
    try {
      final r = await ref.read(classPresenceRepositoryProvider).respond(
            sessionId: widget.training.id,
            going: false,
            reason: _reason,
            message: _message.text,
          );
      refreshAthleteClassPresence(ref);
      if (mounted) Navigator.of(context).pop((r, repor));
    } on ClassPresenceException catch (e) {
      if (mounted) {
        setState(() {
          _sending = null;
          _error = e.message;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final t = widget.training;
    final now = ref.watch(professorLinksClockProvider)();
    final credit = trainingNoticeGivesCredit(t, now);
    final isMakeup = t.isMakeup || t.isTrial;
    final professor = trainingFirstName(t.professorName);
    return ProfessorLinksSheetBody(
      key: const Key('training-not-going-sheet'),
      title: 'Não vou à aula',
      subtitle: trainingSheetSubtitle(t),
      children: [
        Text(
          professor.isEmpty
              ? 'MOTIVO · O PROFESSOR VÊ'
              : 'MOTIVO · O ${professor.toUpperCase()} VÊ',
          style: ProfessorLinksStyle.mono(
            9.5,
            color: ProfessorLinksStyle.dim(colors),
          ).copyWith(letterSpacing: 0.6),
        ),
        Wrap(
          spacing: 6,
          runSpacing: 6,
          children: [
            for (final (id, label) in kNotGoingReasons)
              AvailabilityChoiceChip(
                key: Key('training-not-going-reason-$id'),
                label: label,
                selected: _reason == id,
                onTap: () => setState(() => _reason = id),
              ),
          ],
        ),
        TextField(
          key: const Key('training-not-going-message'),
          controller: _message,
          maxLength: 280,
          minLines: 1,
          maxLines: 3,
          textCapitalization: TextCapitalization.sentences,
          style: AppTypography.bodyS.copyWith(color: colors.onSurface),
          decoration: InputDecoration(
            hintText: 'Mensagem opcional para o professor…',
            counterText: '',
            filled: true,
            fillColor: ProfessorLinksStyle.soft(colors),
            contentPadding:
                const EdgeInsets.symmetric(horizontal: 13, vertical: 12),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(13),
              borderSide: BorderSide(color: ProfessorLinksStyle.line2(colors)),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(13),
              borderSide: BorderSide(color: ProfessorLinksStyle.line2(colors)),
            ),
          ),
        ),
        if (!isMakeup)
          _CreditInfo(
            credit: credit,
            noticeHours: trainingNoticeHours(t),
            arenaName: t.arenaName,
          )
        else
          ProfessorLinksNote(
            t.isMakeup
                ? 'Você sai desta reposição e o crédito volta para usar em '
                    'outro horário.'
                : 'Você sai desta aula experimental.',
            tone: ProfessorLinksNoteTone.blue,
          ),
        if (_error != null)
          ProfessorLinksNote(_error!, tone: ProfessorLinksNoteTone.red),
        Row(
          children: [
            Expanded(
              flex: 10,
              child: ProfessorLinksGhostButton(
                key: const Key('training-not-going-notify'),
                label: 'Só avisar',
                loading: _sending == false,
                onPressed: _sending != null ? null : () => _send(repor: false),
              ),
            ),
            if (credit && !isMakeup) ...[
              const SizedBox(width: 8),
              Expanded(
                flex: 14,
                child: ProfessorLinksPrimaryButton(
                  key: const Key('training-not-going-makeup'),
                  label: 'Avisar e repor',
                  height: 48,
                  loading: _sending == true,
                  onPressed: _sending != null ? null : () => _send(repor: true),
                ),
              ),
            ],
          ],
        ),
      ],
    );
  }
}

class _CreditInfo extends StatelessWidget {
  const _CreditInfo({
    required this.credit,
    required this.noticeHours,
    required this.arenaName,
  });

  final bool credit;
  final int noticeHours;
  final String arenaName;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    const blue = ProfessorLinksStyle.blue;
    final where = arenaName.isEmpty ? 'na arena' : 'na $arenaName';
    final tone = credit ? blue : AppColors.pending;
    return Container(
      key: Key(credit ? 'training-credit-yes' : 'training-credit-no'),
      padding: const EdgeInsets.fromLTRB(13, 12, 13, 12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        color: tone.withValues(alpha: 0.08),
        border: Border.all(color: tone.withValues(alpha: 0.3)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(top: 1),
            child: Icon(
              credit ? Icons.autorenew_rounded : Icons.schedule_rounded,
              size: 15,
              color: colors.readableTone(tone),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  credit
                      ? 'Você ganha 1 crédito de reposição'
                      : 'Sem crédito de reposição',
                  style: ProfessorLinksStyle.display(
                    13,
                    weight: FontWeight.w700,
                    color: colors.readableTone(tone),
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  credit
                      ? 'Avisando com mais de ${noticeHours}h de antecedência. '
                          'Vale em qualquer turma do seu nível $where.'
                      : 'O crédito vale para avisos com mais de '
                          '${noticeHours}h de antecedência. O professor '
                          'ainda recebe o seu aviso.',
                  style: AppTypography.bodyS.copyWith(
                    fontSize: 12,
                    height: 1.4,
                    color: ProfessorLinksStyle.mute(colors),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Botão de presença do cartão "Próximo treino" (T1/T2): "Fazer check-in"
/// na janela da aula, "Confirmar presença" ↔ "✓ Vou", "Não vou" (tocar
/// desfaz) e "Presença registrada" depois do check-in.
class TrainingPresenceButton extends ConsumerStatefulWidget {
  const TrainingPresenceButton({super.key, required this.training});

  final TrainingSession training;

  /// Tem o que mostrar para este treino?
  static bool appliesTo(TrainingSession t, DateTime now) =>
      trainingCheckedIn(t) ||
      trainingCanCheckIn(t, now) ||
      trainingCanRespond(t, now);

  @override
  ConsumerState<TrainingPresenceButton> createState() =>
      _TrainingPresenceButtonState();
}

class _TrainingPresenceButtonState
    extends ConsumerState<TrainingPresenceButton> {
  bool _busy = false;

  Future<void> _confirm() async {
    setState(() => _busy = true);
    await confirmTrainingPresence(context, ref, widget.training);
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final t = widget.training;
    final now = ref.watch(professorLinksClockProvider)();
    if (trainingCheckedIn(t)) {
      return _StateButton(
        key: const Key('training-presence-checked-in'),
        label: 'Presente',
        icon: Icons.check_rounded,
        color: colors.win,
        onTap: null,
      );
    }
    if (trainingCanCheckIn(t, now)) {
      return ProfessorLinksPrimaryButton(
        key: const Key('training-presence-checkin'),
        label: 'Fazer check-in',
        height: 44,
        onPressed: () => openTrainingCheckIn(context, t),
      );
    }
    return switch (trainingRsvp(t)) {
      ClassRsvp.going => _StateButton(
          key: const Key('training-presence-going'),
          label: 'Vou',
          icon: Icons.check_rounded,
          color: colors.win,
          onTap: () => showTrainingNotGoingSheet(context, t),
        ),
      ClassRsvp.notGoing => _StateButton(
          key: const Key('training-presence-not-going'),
          label: 'Não vou',
          icon: Icons.close_rounded,
          color: colors.live,
          loading: _busy,
          onTap: _busy ? null : _confirm,
        ),
      null => _StateButton(
          key: const Key('training-presence-confirm'),
          label: 'Confirmar presença',
          color: AppColors.brand,
          filled: true,
          loading: _busy,
          onTap: _busy ? null : _confirm,
        ),
    };
  }
}

/// Botão de estado (verde "Vou", vermelho "Não vou").
class _StateButton extends StatelessWidget {
  const _StateButton({
    super.key,
    required this.label,
    required this.color,
    required this.onTap,
    this.icon,
    this.filled = false,
    this.loading = false,
  });

  final String label;
  final IconData? icon;
  final Color color;
  final VoidCallback? onTap;

  /// Fundo cheio (laranja do "Confirmar presença").
  final bool filled;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final fg =
        filled ? ProfessorLinksStyle.onBrand : colors.readableTone(color);
    return Material(
      color: filled ? color : color.withValues(alpha: 0.12),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: filled
            ? BorderSide.none
            : BorderSide(color: color.withValues(alpha: 0.45)),
      ),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: SizedBox(
          height: 44,
          child: Center(
            child: loading
                ? SizedBox.square(
                    dimension: 18,
                    child: CircularProgressIndicator(strokeWidth: 2, color: fg),
                  )
                : Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 8),
                    child: FittedBox(
                      fit: BoxFit.scaleDown,
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          if (icon != null) ...[
                            Icon(icon, size: 16, color: fg),
                            const SizedBox(width: 6),
                          ],
                          Text(
                            label,
                            style: AppTypography.labelL
                                .copyWith(fontSize: 13.5, color: fg),
                          ),
                        ],
                      ),
                    ),
                  ),
          ),
        ),
      ),
    );
  }
}

/// Rodapé da linha em Minhas aulas (T3): "Vou / Não vou" enquanto não
/// respondeu; depois, o que ficou e como mudar.
class TrainingRsvpFooter extends ConsumerStatefulWidget {
  const TrainingRsvpFooter({super.key, required this.training});

  final TrainingSession training;

  /// Tem o que mostrar para este treino?
  static bool appliesTo(TrainingSession t, DateTime now) =>
      trainingCanCheckIn(t, now) || trainingCanRespond(t, now);

  @override
  ConsumerState<TrainingRsvpFooter> createState() => _TrainingRsvpFooterState();
}

class _TrainingRsvpFooterState extends ConsumerState<TrainingRsvpFooter> {
  bool _busy = false;

  Future<void> _going() async {
    setState(() => _busy = true);
    await confirmTrainingPresence(context, ref, widget.training);
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final t = widget.training;
    final now = ref.watch(professorLinksClockProvider)();
    final id = t.id;
    if (trainingCanCheckIn(t, now)) {
      return _MiniButton(
        key: Key('training-row-checkin-$id'),
        label: 'Fazer check-in',
        icon: Icons.location_on_outlined,
        color: AppColors.brand,
        on: true,
        onTap: () => openTrainingCheckIn(context, t),
      );
    }
    final rsvp = trainingRsvp(t);
    if (rsvp == null) {
      return Row(
        children: [
          Expanded(
            child: _MiniButton(
              key: Key('training-row-going-$id'),
              label: 'Vou',
              icon: Icons.check_rounded,
              color: colors.win,
              on: true,
              loading: _busy,
              onTap: _busy ? null : _going,
            ),
          ),
          const SizedBox(width: 6),
          Expanded(
            child: _MiniButton(
              key: Key('training-row-not-going-$id'),
              label: 'Não vou',
              onTap: _busy ? null : () => showTrainingNotGoingSheet(context, t),
            ),
          ),
        ],
      );
    }
    final credits = ref.watch(athleteClassCreditsProvider).valueOrNull;
    final credit = credits != null && creditForTraining(credits, t) != null;
    final (String text, Color tone, String action, VoidCallback onAction) =
        switch (rsvp) {
      ClassRsvp.going => (
          'Presença confirmada',
          colors.win,
          'Não vou',
          () => showTrainingNotGoingSheet(context, t),
        ),
      ClassRsvp.notGoing when credit => (
          '+1 crédito de reposição · escolher horário',
          ProfessorLinksStyle.blue,
          'Vou',
          _going,
        ),
      ClassRsvp.notGoing => (
          'Você avisou que não vai',
          colors.live,
          'Vou',
          _going,
        ),
    };
    final makeupLink = rsvp == ClassRsvp.notGoing && credit;
    return Row(
      children: [
        Expanded(
          child: GestureDetector(
            key: Key('training-row-status-$id'),
            behavior: HitTestBehavior.opaque,
            onTap: makeupLink
                ? () => openTrainingMakeup(
                      context,
                      creditId: creditForTraining(credits, t)?.creditId,
                    )
                : null,
            child: Text(
              text,
              maxLines: 2,
              style: AppTypography.bodyS.copyWith(
                fontSize: 11.5,
                fontWeight: FontWeight.w600,
                color: colors.readableTone(tone),
              ),
            ),
          ),
        ),
        const SizedBox(width: 8),
        TextButton(
          key: Key('training-row-change-$id'),
          onPressed: _busy ? null : onAction,
          style: TextButton.styleFrom(
            minimumSize: const Size(0, 32),
            padding: const EdgeInsets.symmetric(horizontal: 10),
            foregroundColor: ProfessorLinksStyle.mute(colors),
          ),
          child: _busy
              ? const SizedBox.square(
                  dimension: 14,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : Text(action),
        ),
      ],
    );
  }
}

/// Botão pequeno do protótipo (`AtMini`).
class _MiniButton extends StatelessWidget {
  const _MiniButton({
    super.key,
    required this.label,
    required this.onTap,
    this.icon,
    this.color,
    this.on = false,
    this.loading = false,
  });

  final String label;
  final IconData? icon;
  final Color? color;
  final bool on;
  final bool loading;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final c = color ?? AppColors.brand;
    final fg = on ? colors.readableTone(c) : colors.onSurface;
    return Material(
      color: on ? c.withValues(alpha: 0.12) : ProfessorLinksStyle.soft(colors),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(10),
        side: BorderSide(
          color: on
              ? c.withValues(alpha: 0.47)
              : ProfessorLinksStyle.line2(colors),
        ),
      ),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: SizedBox(
          height: 34,
          child: Center(
            child: loading
                ? SizedBox.square(
                    dimension: 14,
                    child: CircularProgressIndicator(strokeWidth: 2, color: fg),
                  )
                : Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (icon != null) ...[
                        Icon(icon, size: 13, color: fg),
                        const SizedBox(width: 6),
                      ],
                      Text(
                        label,
                        style: AppTypography.bodyS.copyWith(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: fg,
                        ),
                      ),
                    ],
                  ),
          ),
        ),
      ),
    );
  }
}
