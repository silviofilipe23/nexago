import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../arena/presentation/aulas/widgets/arena_class_form_atoms.dart';
import '../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../application/professor_students_providers.dart';
import '../../domain/professor_actions.dart';
import '../../domain/professor_actions_logic.dart';
import '../widgets/professor_students_widgets.dart';
import 'professor_action_widgets.dart';

/// B13 Comunicado: aviso aos alunos das aulas de hoje e amanhã do professor.
/// Com "Cancelar as aulas" ligado, cancela cada uma (libera a quadra, crédito
/// pela regra da arena) e o recado vai junto do aviso de cancelamento.
class ProfessorNoticePage extends ConsumerStatefulWidget {
  const ProfessorNoticePage({super.key, required this.arenaId});

  final String arenaId;

  @override
  ConsumerState<ProfessorNoticePage> createState() =>
      _ProfessorNoticePageState();
}

class _ProfessorNoticePageState extends ConsumerState<ProfessorNoticePage> {
  ProfessorNoticeTemplate _template = ProfessorNoticeTemplate.rain;
  late final TextEditingController _text =
      TextEditingController(text: ProfessorNoticeTemplate.rain.text);
  final Set<String> _selected = {};
  bool _cancel = true;
  bool? _credits;
  bool _saving = false;

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  void _pickTemplate(ProfessorNoticeTemplate t) {
    setState(() {
      _template = t;
      _cancel = t.cancels;
      _text.text = t.text;
    });
  }

  Future<void> _submit(ProfessorActionsContext ctx) async {
    final message = _text.text.trim();
    final ids = _selected.toList();
    final credits = _credits ?? ctx.cancelGeneratesCredit;
    final confirmed = !_cancel ||
        await showDialog<bool>(
              context: context,
              builder: (dialogContext) => AlertDialog(
                title: Text(
                    'Cancelar ${ids.length} aula${ids.length == 1 ? '' : 's'}?'),
                content: const Text(
                  'A quadra volta para a agenda da arena e os alunos são '
                  'avisados. Não dá para desfazer.',
                ),
                actions: [
                  TextButton(
                    onPressed: () => Navigator.of(dialogContext).pop(false),
                    child: const Text('Voltar'),
                  ),
                  TextButton(
                    key: const Key('professor-notice-cancel-confirm'),
                    onPressed: () => Navigator.of(dialogContext).pop(true),
                    child: const Text('Cancelar aulas'),
                  ),
                ],
              ),
            ) ==
            true;
    if (!confirmed || !mounted) return;
    setState(() => _saving = true);
    final repo = ref.read(professorActionsRepositoryProvider);
    final ok = await runProfessorAction(
      context,
      ref,
      arenaId: widget.arenaId,
      action: () async {
        if (_cancel) {
          for (final id in ids) {
            await repo.cancelSession(
              sessionId: id,
              reason: _template.cancelReason,
              generateCredits: credits,
              message: message,
            );
          }
          return '${ids.length} aula${ids.length == 1 ? '' : 's'} '
              'cancelada${ids.length == 1 ? '' : 's'} e alunos avisados.';
        }
        final n = await repo.sendNotice(sessionIds: ids, message: message);
        return 'Aviso enviado para $n aluno${n == 1 ? '' : 's'}.';
      },
    );
    if (!ok && mounted) setState(() => _saving = false);
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return ProfessorActionPage(
      title: 'Comunicado',
      subtitle: 'AULAS DE HOJE E AMANHÃ',
      arenaId: widget.arenaId,
      builder: (context, ctx) {
        final sessions = professorNoticeSessions(ctx);
        final reach = professorNoticeReach(sessions, _selected);
        return [
          const ProfessorLinksKicker('Modelo'),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              for (final t in ProfessorNoticeTemplate.values)
                ArenaClassChip(
                  key: Key('professor-notice-template-${t.name}'),
                  label: t.label,
                  selected: _template == t,
                  onTap: () => _pickTemplate(t),
                ),
            ],
          ),
          const ProfessorLinksKicker('Para'),
          if (sessions.isEmpty)
            const ProfessorMutedText('Você não tem aula hoje nem amanhã.'),
          for (final s in sessions)
            ArenaClassChoiceCard(
              key: Key('professor-notice-session-${s.sessionId}'),
              title: s.className,
              subtitle: '${professorDayLabel(s.date, ctx.todayKey)} '
                  '${s.startTime} · ${s.taken} aluno${s.taken == 1 ? '' : 's'}',
              multi: true,
              selected: _selected.contains(s.sessionId),
              onTap: () => setState(() {
                _selected.contains(s.sessionId)
                    ? _selected.remove(s.sessionId)
                    : _selected.add(s.sessionId);
              }),
            ),
          TextField(
            key: const Key('professor-notice-message'),
            controller: _text,
            minLines: 3,
            maxLines: 6,
            maxLength: 300,
            onChanged: (_) => setState(() {}),
            textCapitalization: TextCapitalization.sentences,
            style: AppTypography.bodyM.copyWith(color: colors.onSurface),
            decoration: arenaClassInputDecoration(
              context,
              hint: 'Escreva o recado para os alunos',
            ),
          ),
          ProfessorLinksCard(
            padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
            child: Column(
              children: [
                SwitchListTile.adaptive(
                  key: const Key('professor-notice-cancel'),
                  value: _cancel,
                  onChanged: ctx.permissions.canCancelLessons
                      ? (v) => setState(() => _cancel = v)
                      : null,
                  title: const Text('Cancelar as aulas selecionadas'),
                  subtitle: const Text('Libera a quadra na agenda da arena'),
                ),
                if (_cancel)
                  SwitchListTile.adaptive(
                    key: const Key('professor-notice-credits'),
                    value: _credits ?? ctx.cancelGeneratesCredit,
                    onChanged: (v) => setState(() => _credits = v),
                    title: const Text('Gerar crédito de reposição'),
                    subtitle: Text(
                      '$reach aluno${reach == 1 ? '' : 's'} · validade '
                      '${ctx.makeupValidityDays} dias',
                    ),
                  ),
              ],
            ),
          ),
        ];
      },
      footer: (context, ctx) {
        final reach =
            professorNoticeReach(professorNoticeSessions(ctx), _selected);
        final ready = _selected.isNotEmpty && _text.text.trim().isNotEmpty;
        return ProfessorLinksPrimaryButton(
          key: const Key('professor-notice-submit'),
          label: _cancel
              ? 'Cancelar e avisar $reach aluno${reach == 1 ? '' : 's'}'
              : 'Enviar para $reach aluno${reach == 1 ? '' : 's'}',
          loading: _saving,
          onPressed: ready ? () => _submit(ctx) : null,
        );
      },
    );
  }
}
