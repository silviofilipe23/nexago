import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/router/navigation_helpers.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/time/nexago_event_timezone.dart';
import '../../../arena/presentation/aulas/widgets/arena_class_form_atoms.dart';
import '../../../professor_links/application/professor_links_providers.dart';
import '../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../application/professor_agenda_providers.dart';
import '../../domain/professor_agenda.dart';
import '../../domain/professor_students_logic.dart' show professorShortDate;
import '../../infrastructure/professor_agenda_repository.dart';
import '../wallet/professor_wallet_widgets.dart';
import '../widgets/professor_students_widgets.dart';
import 'professor_agenda_widgets.dart';

/// "Qui 22 out · 14:00" de uma parede de SP.
String professorWallLabel(DateTime wall) {
  const days = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
  final key = '${wall.year.toString().padLeft(4, '0')}-'
      '${wall.month.toString().padLeft(2, '0')}-'
      '${wall.day.toString().padLeft(2, '0')}';
  return '${days[wall.weekday - 1]} ${professorShortDate(key)} · '
      '${wall.hour.toString().padLeft(2, '0')}:'
      '${wall.minute.toString().padLeft(2, '0')}';
}

DateTime _instantOf(DateTime wall) => nexagoEventDateTime(
      year: wall.year,
      month: wall.month,
      day: wall.day,
      hour: wall.hour,
      minute: wall.minute,
    );

String _keyOf(DateTime wall) => '${wall.year.toString().padLeft(4, '0')}-'
    '${wall.month.toString().padLeft(2, '0')}-'
    '${wall.day.toString().padLeft(2, '0')}';

/// E7 Bloquear período (criar, editar e apagar): motivo, de/até e as aulas
/// que caem no período — só informativo: o bloqueio não cancela nem remarca
/// nada, o professor avisa os alunos. Aparece nas três visões da Agenda.
class ProfessorBlockPage extends ConsumerStatefulWidget {
  const ProfessorBlockPage({super.key, this.blockId});

  /// `null` = novo.
  final String? blockId;

  @override
  ConsumerState<ProfessorBlockPage> createState() => _ProfessorBlockPageState();
}

class _ProfessorBlockPageState extends ConsumerState<ProfessorBlockPage> {
  final _note = TextEditingController();
  ProfessorBlockReason _reason = ProfessorBlockReason.folga;

  /// Paredes de SP (sem fuso).
  DateTime? _start;
  DateTime? _end;
  DateTime? _createdAt;
  bool _loaded = false;
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  void _back() => popOrGo(context, AppRoutes.professorAgenda);

  /// Novo: o dia escolhido na Agenda, das 8h às 18h.
  void _initNew() {
    final key = ref.read(professorAgendaSelectedDateProvider);
    final d = DateTime.parse(key);
    _start = DateTime(d.year, d.month, d.day, 8);
    _end = DateTime(d.year, d.month, d.day, 18);
    _loaded = true;
  }

  void _initFrom(ProfessorBlock b) {
    _reason = b.reason;
    _start = toNexagoEventLocal(b.startAt);
    _end = toNexagoEventLocal(b.endAt);
    _note.text = b.note ?? '';
    _createdAt = b.createdAt;
    _loaded = true;
  }

  Future<void> _pick({required bool start}) async {
    final current = (start ? _start : _end) ?? DateTime.now();
    final date = await showDatePicker(
      context: context,
      initialDate: current,
      firstDate: DateTime(current.year - 1),
      lastDate: DateTime(current.year + 2),
    );
    if (date == null || !mounted) return;
    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay(hour: current.hour, minute: current.minute),
    );
    if (time == null || !mounted) return;
    final picked =
        DateTime(date.year, date.month, date.day, time.hour, time.minute);
    setState(() {
      if (start) {
        // Mantém a duração ao mexer no início.
        final span = (_end != null && _start != null)
            ? _end!.difference(_start!)
            : const Duration(hours: 4);
        _start = picked;
        _end = picked.add(span.isNegative ? const Duration(hours: 1) : span);
      } else {
        _end = picked;
      }
      _error = null;
    });
  }

  Future<void> _save() async {
    final start = _start == null ? null : _instantOf(_start!);
    final end = _end == null ? null : _instantOf(_end!);
    final error =
        validateProfessorBlock(startAt: start, endAt: end, note: _note.text);
    setState(() => _error = error);
    if (error != null) return;
    setState(() => _saving = true);
    final ok = await runProfessorWalletAction(
      context,
      () => ref.read(professorAgendaRepositoryProvider).saveBlock(
            ref.read(professorLinksUidProvider),
            ProfessorBlockInput(
              reason: _reason,
              startAt: start!,
              endAt: end!,
              note: _note.text,
            ),
            blockId: widget.blockId,
            createdAt: _createdAt,
          ),
      message:
          widget.blockId == null ? 'Período bloqueado.' : 'Bloqueio salvo.',
    );
    if (!mounted) return;
    if (ok) {
      _back();
    } else {
      setState(() => _saving = false);
    }
  }

  Future<void> _delete() async {
    final ok = await confirmProfessorWalletAction(
      context,
      title: 'Apagar bloqueio?',
      body: 'O período volta a ficar livre na sua agenda.',
      confirmLabel: 'Apagar',
    );
    if (!ok || !mounted) return;
    final done = await runProfessorWalletAction(
      context,
      () => ref
          .read(professorAgendaRepositoryProvider)
          .deleteBlock(ref.read(professorLinksUidProvider), widget.blockId!),
      message: 'Bloqueio apagado.',
    );
    if (done && mounted) _back();
  }

  @override
  Widget build(BuildContext context) {
    final editing = widget.blockId != null;
    if (!_loaded) {
      if (!editing) {
        _initNew();
      } else {
        final async = ref.watch(professorBlocksProvider);
        ProfessorBlock? block;
        for (final b in async.valueOrNull ?? const <ProfessorBlock>[]) {
          if (b.id == widget.blockId) block = b;
        }
        if (block != null) {
          _initFrom(block);
        } else {
          return ProfessorLinksScaffold(
            title: 'Bloqueio',
            onBack: _back,
            body: ListView(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
              children: [
                if (!async.hasValue && !async.hasError)
                  const ProfessorWalletLoading()
                else
                  const ProfessorLinksCard(
                    key: Key('professor-block-missing'),
                    child: ProfessorMutedText('Este bloqueio não existe mais.'),
                  ),
              ],
            ),
          );
        }
      }
    }

    final start = _start!;
    final end = _end!;
    final valid = end.isAfter(start) &&
        _instantOf(end).difference(_instantOf(start)) <
            kProfessorBlockMaxDuration;
    final affected = valid ? _affected(start, end) : null;

    return ProfessorLinksScaffold(
      title: editing ? 'Bloqueio' : 'Bloquear período',
      subtitle: 'FOLGA, TORNEIO OU VIAGEM',
      onBack: _back,
      trailing: editing
          ? ProfessorLinksRoundButton(
              key: const Key('professor-block-delete'),
              icon: Icons.delete_outline_rounded,
              semanticLabel: 'Apagar bloqueio',
              onTap: _delete,
            )
          : null,
      body: Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
              children: [
                const ProfessorLinksKicker('Motivo'),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    for (final r in ProfessorBlockReason.values)
                      ArenaClassChip(
                        key: Key('professor-block-reason-${r.name}'),
                        label: r.label,
                        selected: _reason == r,
                        onTap: () => setState(() => _reason = r),
                      ),
                  ],
                ),
                const SizedBox(height: 18),
                Row(
                  children: [
                    Expanded(
                      child: _WhenField(
                        key: const Key('professor-block-start'),
                        label: 'De',
                        value: professorWallLabel(start),
                        onTap: () => _pick(start: true),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: _WhenField(
                        key: const Key('professor-block-end'),
                        label: 'Até',
                        value: professorWallLabel(end),
                        onTap: () => _pick(start: false),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                ProfessorWalletField(
                  key: const Key('professor-block-note'),
                  label: 'Observação (opcional)',
                  hint: 'Só você vê',
                  controller: _note,
                  maxLength: kProfessorBlockNoteMax,
                ),
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  ProfessorLinksNote(
                    _error!,
                    key: const Key('professor-block-error'),
                    tone: ProfessorLinksNoteTone.red,
                  ),
                ],
                const SizedBox(height: 22),
                if (affected != null) ..._affectedSection(affected),
              ],
            ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
              child: ProfessorLinksPrimaryButton(
                key: const Key('professor-block-save'),
                label: editing ? 'Salvar bloqueio' : 'Bloquear período',
                loading: _saving,
                onPressed: _save,
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// Aulas no período (`null` = carregando).
  List<ProfessorAgendaItem>? _affected(DateTime start, DateTime end) {
    final range = (fromKey: _keyOf(start), toKey: _keyOf(end));
    final items = ref.watch(professorAgendaItemsProvider(range)).valueOrNull;
    if (items == null) return null;
    return professorItemsAffectedBy(
      items,
      startAt: _instantOf(start),
      endAt: _instantOf(end),
    );
  }

  List<Widget> _affectedSection(List<ProfessorAgendaItem> affected) {
    final palette = ref.watch(professorArenaPaletteProvider);
    final todayKey = ref.watch(professorAgendaNowProvider).todayKey;
    return [
      ProfessorLinksKicker(
        'Aulas no período · ${affected.length}',
        key: const Key('professor-block-affected-count'),
      ),
      const SizedBox(height: 8),
      if (affected.isEmpty)
        const ProfessorMutedText('Nenhuma aula sua neste período.')
      else ...[
        for (final i in affected) ...[
          ProfessorAgendaCard(
            key: Key('professor-block-affected-${i.id}'),
            item: i,
            color: professorItemColor(palette, i),
          ),
          Padding(
            padding: const EdgeInsets.only(left: 4, top: 2, bottom: 8),
            child: Text(
              professorAgendaWhen(i, todayKey),
              style: ProfessorLinksStyle.mono(
                9.5,
                color: ProfessorLinksStyle.dim(context.themeColors),
              ),
            ),
          ),
        ],
        const ProfessorLinksNote(
          'O bloqueio não cancela nem remarca essas aulas. Avise seus alunos '
          'e, se for o caso, cancele cada uma pela agenda.',
          key: Key('professor-block-warning'),
          tone: ProfessorLinksNoteTone.yellow,
        ),
      ],
    ];
  }
}

class _WhenField extends StatelessWidget {
  const _WhenField({
    super.key,
    required this.label,
    required this.value,
    required this.onTap,
  });

  final String label;
  final String value;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ProfessorLinksKicker(label),
        const SizedBox(height: 7),
        Material(
          color: ProfessorLinksStyle.soft(colors),
          borderRadius: BorderRadius.circular(13),
          child: InkWell(
            borderRadius: BorderRadius.circular(13),
            onTap: onTap,
            child: Container(
              height: 46,
              padding: const EdgeInsets.symmetric(horizontal: 12),
              alignment: Alignment.centerLeft,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(13),
                border: Border.all(color: ProfessorLinksStyle.line2(colors)),
              ),
              child: Text(
                value,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: ProfessorLinksStyle.display(
                  12.5,
                  weight: FontWeight.w600,
                  color: colors.onSurface,
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}
