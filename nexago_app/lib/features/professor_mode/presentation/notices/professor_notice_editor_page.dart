import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/router/navigation_helpers.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/time/nexago_event_timezone.dart';
import '../../../../core/ui/app_snackbar.dart';
import '../../../arena/presentation/aulas/widgets/arena_class_form_atoms.dart';
import '../../../professor_links/application/professor_links_providers.dart';
import '../../../professor_links/domain/arena_professor_link.dart';
import '../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../application/professor_notices_providers.dart';
import '../../application/professor_students_providers.dart';
import '../../application/professor_wallet_providers.dart';
import '../../domain/professor_notices.dart';
import '../../infrastructure/professor_students_repository.dart';
import '../agenda/professor_block_page.dart' show professorWallLabel;
import '../widgets/professor_students_widgets.dart';
import '../wallet/professor_wallet_widgets.dart';
import 'professor_notice_widgets.dart';

/// Parede de SP → instante.
DateTime _instant(DateTime wall) => nexagoEventDateTime(
      year: wall.year,
      month: wall.month,
      day: wall.day,
      hour: wall.hour,
      minute: wall.minute,
    );

/// Quando enviar (F4).
typedef ProfessorNoticeTiming = ({DateTime? scheduledAt, DateTime? remindAt});

/// F2 Novo comunicado → F3 Para quem → F4 Quando enviar. Um editor só, em
/// dois passos (conteúdo e destinatários) e a folha do envio. Também edita
/// rascunho/agendado ([noticeId]) e salva rascunho a qualquer momento.
class ProfessorNoticeEditorPage extends ConsumerStatefulWidget {
  const ProfessorNoticeEditorPage({super.key, this.noticeId});

  final String? noticeId;

  @override
  ConsumerState<ProfessorNoticeEditorPage> createState() =>
      _ProfessorNoticeEditorPageState();
}

class _ProfessorNoticeEditorPageState
    extends ConsumerState<ProfessorNoticeEditorPage> {
  final _title = TextEditingController();
  final _body = TextEditingController();
  final _options = <TextEditingController>[
    TextEditingController(text: 'Vou'),
    TextEditingController(text: 'Não vou'),
  ];
  ProfessorNoticeKind _kind = ProfessorNoticeKind.aviso;
  ProfessorNoticeAudience _audience = const ProfessorNoticeAudience();
  ProfessorNotice? _original;
  int _step = 0;
  bool _loaded = false;
  bool _busy = false;
  String? _error;
  int? _count;
  int _countToken = 0;

  @override
  void dispose() {
    _title.dispose();
    _body.dispose();
    for (final c in _options) {
      c.dispose();
    }
    super.dispose();
  }

  void _close() => popOrGo(context, AppRoutes.professorNotices);

  void _initFrom(ProfessorNotice n) {
    _original = n;
    _kind = n.kind;
    _title.text = n.title;
    _body.text = n.body;
    if (n.pollOptions.isNotEmpty) {
      for (final c in _options) {
        c.dispose();
      }
      _options
        ..clear()
        ..addAll(
            [for (final o in n.pollOptions) TextEditingController(text: o)]);
    }
    _audience = n.audience;
    _loaded = true;
  }

  ProfessorNoticeInput _input({ProfessorNoticeTiming? timing}) =>
      ProfessorNoticeInput(
        noticeId: widget.noticeId,
        kind: _kind,
        title: _title.text,
        body: _body.text,
        pollOptions: [for (final c in _options) c.text],
        audience: _audience,
        scheduledAt: timing?.scheduledAt,
        remindAt: timing?.remindAt,
      );

  Future<void> _refreshCount() async {
    final token = ++_countToken;
    if (_audience.isEmpty) {
      setState(() => _count = 0);
      return;
    }
    setState(() => _count = null);
    try {
      final n = await ref
          .read(professorNoticesRepositoryProvider)
          .previewAudience(_audience);
      if (mounted && token == _countToken) setState(() => _count = n);
    } catch (_) {
      if (mounted && token == _countToken) setState(() => _count = -1);
    }
  }

  void _setAudience(ProfessorNoticeAudience a) {
    setState(() => _audience = a);
    _refreshCount();
  }

  Future<void> _saveDraft() async {
    final input = _input();
    final error = validateProfessorNoticeContent(input);
    setState(() => _error = error);
    if (error != null) return;
    setState(() => _busy = true);
    final ok = await runProfessorWalletAction(
      context,
      () => ref.read(professorNoticesRepositoryProvider).save(input),
      message: 'Rascunho salvo.',
    );
    if (!mounted) return;
    setState(() => _busy = false);
    if (ok) _close();
  }

  void _toAudience() {
    final error = validateProfessorNoticeContent(_input());
    setState(() => _error = error);
    if (error != null) return;
    setState(() => _step = 1);
    _refreshCount();
  }

  Future<void> _openTiming() async {
    final timing = await showProfessorLinksSheet<ProfessorNoticeTiming>(
      context,
      builder: (_) => _TimingSheet(
        title: _title.text.trim(),
        count: _count,
        isPoll: _kind == ProfessorNoticeKind.enquete,
        now: toNexagoEventLocal(ref.read(professorLinksClockProvider)()),
        initialScheduled: _original?.scheduledAt == null
            ? null
            : toNexagoEventLocal(_original!.scheduledAt!),
      ),
    );
    if (timing == null || !mounted) return;
    final input = _input(timing: timing);
    final error = validateProfessorNoticeSend(
      input,
      ref.read(professorLinksClockProvider)().toUtc(),
    );
    if (error != null) {
      showAppSnackBar(context, error, isError: true);
      return;
    }
    setState(() => _busy = true);
    try {
      final r = await ref.read(professorNoticesRepositoryProvider).send(input);
      if (!mounted) return;
      ref.read(professorNoticesTabProvider.notifier).state = r.status;
      showAppSnackBar(
        context,
        r.status == ProfessorNoticeStatus.scheduled
            ? 'Comunicado agendado.'
            : 'Enviado para ${r.recipientCount} aluno'
                '${r.recipientCount == 1 ? '' : 's'}.',
      );
      _close();
    } catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      showAppSnackBar(
        context,
        e is ProfessorStudentsException
            ? e.message
            : 'Não foi possível enviar o comunicado.',
        isError: true,
      );
    }
  }

  Future<void> _delete() async {
    final ok = await confirmProfessorWalletAction(
      context,
      title: 'Apagar comunicado?',
      body: _original?.status == ProfessorNoticeStatus.scheduled
          ? 'O envio agendado é cancelado.'
          : 'O rascunho é apagado.',
      confirmLabel: 'Apagar',
    );
    if (!ok || !mounted) return;
    final done = await runProfessorWalletAction(
      context,
      () =>
          ref.read(professorNoticesRepositoryProvider).delete(widget.noticeId!),
      message: 'Comunicado apagado.',
    );
    if (done && mounted) _close();
  }

  void _preview() {
    final name = _original?.professorName ?? 'Seu professor';
    showProfessorLinksSheet<void>(
      context,
      builder: (_) => ProfessorLinksSheetBody(
        title: 'Prévia',
        children: [
          const SizedBox(height: 12),
          ProfessorNoticeContent(
            key: const Key('professor-notice-preview'),
            preview: true,
            professorName: name,
            kind: _kind,
            title: _title.text,
            body: _body.text,
            pollOptions: _input().cleanOptions,
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final editing = widget.noticeId != null;
    if (editing && !_loaded) {
      final async = ref.watch(professorNoticesProvider);
      ProfessorNotice? found;
      for (final n in async.valueOrNull ?? const <ProfessorNotice>[]) {
        if (n.id == widget.noticeId) found = n;
      }
      if (found == null || found.status == ProfessorNoticeStatus.sent) {
        return ProfessorLinksScaffold(
          title: 'Comunicado',
          onBack: _close,
          body: ListView(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
            children: [
              if (!async.hasValue && !async.hasError)
                const ProfessorWalletLoading()
              else
                const ProfessorLinksCard(
                  key: Key('professor-notice-missing'),
                  child: ProfessorMutedText(
                    'Este comunicado não pode mais ser editado.',
                  ),
                ),
            ],
          ),
        );
      }
      _initFrom(found);
    }
    return _step == 0 ? _contentStep(editing) : _audienceStep();
  }

  Widget _contentStep(bool editing) {
    const gap = SizedBox(height: 14);
    return ProfessorLinksScaffold(
      title: editing ? 'Editar comunicado' : 'Novo comunicado',
      subtitle: _original?.status == ProfessorNoticeStatus.scheduled
          ? 'AGENDADO'
          : 'RASCUNHO',
      onBack: _close,
      trailing: editing
          ? ProfessorLinksRoundButton(
              key: const Key('professor-notice-delete'),
              icon: Icons.delete_outline_rounded,
              semanticLabel: 'Apagar comunicado',
              onTap: _delete,
            )
          : null,
      body: Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
              children: [
                const ProfessorLinksKicker('Tipo'),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    for (final k in ProfessorNoticeKind.values)
                      ArenaClassChip(
                        key: Key('professor-notice-kind-${k.name}'),
                        label: k.label,
                        selected: _kind == k,
                        onTap: () => setState(() => _kind = k),
                      ),
                  ],
                ),
                gap,
                ProfessorWalletField(
                  key: const Key('professor-notice-title'),
                  label: 'Título',
                  hint: 'Ex.: Aulão de sábado · quem vem?',
                  controller: _title,
                  maxLength: kProfessorNoticeTitleMax,
                  textCapitalization: TextCapitalization.sentences,
                ),
                gap,
                _BodyField(controller: _body),
                if (_kind == ProfessorNoticeKind.enquete) ...[
                  gap,
                  const ProfessorLinksKicker('Opções da enquete'),
                  const SizedBox(height: 8),
                  for (var i = 0; i < _options.length; i++)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 6),
                      child: Row(
                        children: [
                          Expanded(
                            child: ProfessorWalletField(
                              key: Key('professor-notice-option-field-$i'),
                              label: 'Opção ${i + 1}',
                              controller: _options[i],
                              maxLength: kProfessorNoticeOptionMax,
                            ),
                          ),
                          if (_options.length > kProfessorNoticeMinOptions)
                            IconButton(
                              key: Key('professor-notice-option-remove-$i'),
                              tooltip: 'Tirar opção',
                              icon: const Icon(Icons.close_rounded),
                              onPressed: () => setState(() {
                                _options.removeAt(i).dispose();
                              }),
                            ),
                        ],
                      ),
                    ),
                  if (_options.length < kProfessorNoticeMaxOptions)
                    Align(
                      alignment: Alignment.centerLeft,
                      child: TextButton.icon(
                        key: const Key('professor-notice-option-add'),
                        onPressed: () => setState(
                          () => _options.add(TextEditingController()),
                        ),
                        icon: const Icon(Icons.add_rounded),
                        label: const Text('Adicionar opção'),
                      ),
                    ),
                ],
                if (_error != null) ...[
                  gap,
                  ProfessorLinksNote(
                    _error!,
                    key: const Key('professor-notice-error'),
                    tone: ProfessorLinksNoteTone.red,
                  ),
                ],
                gap,
                ProfessorLinksGhostButton(
                  key: const Key('professor-notice-preview-button'),
                  label: 'Prévia como o aluno vê',
                  height: 42,
                  onPressed: _preview,
                ),
              ],
            ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
              child: Row(
                children: [
                  Expanded(
                    child: ProfessorLinksGhostButton(
                      key: const Key('professor-notice-save-draft'),
                      label: 'Rascunho',
                      height: 52,
                      loading: _busy,
                      onPressed: _saveDraft,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    flex: 2,
                    child: ProfessorLinksPrimaryButton(
                      key: const Key('professor-notice-next'),
                      label: 'Escolher destinatários',
                      onPressed: _busy ? null : _toAudience,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _audienceStep() {
    final colors = context.themeColors;
    final classes = ref.watch(professorNoticeClassesProvider);
    final snap = ref.watch(professorStudentsProvider).valueOrNull;
    final walletCount =
        (ref.watch(professorWalletStudentsProvider).valueOrNull ?? const [])
            .where((s) => s.active)
            .length;
    final byArena = <String, List<ProfessorNoticeClass>>{};
    for (final c in classes) {
      (byArena[c.arenaId] ??= []).add(c);
    }
    final allIds = [for (final c in classes) c.classId];
    final allSelected = allIds.every(_audience.classIds.contains) &&
        (walletCount == 0 || _audience.wallet);
    final count = _count;

    Widget check({
      required Key key,
      required String title,
      required String trailing,
      required bool value,
      required VoidCallback onTap,
      bool first = false,
    }) =>
        InkWell(
          key: key,
          onTap: onTap,
          child: Container(
            height: 48,
            decoration: BoxDecoration(
              border: first
                  ? null
                  : Border(
                      top: BorderSide(color: ProfessorLinksStyle.line(colors)),
                    ),
            ),
            child: Row(
              children: [
                Container(
                  width: 20,
                  height: 20,
                  decoration: BoxDecoration(
                    color: value ? AppColors.brand : Colors.transparent,
                    borderRadius: BorderRadius.circular(6),
                    border: Border.all(
                      width: 1.5,
                      color: value
                          ? AppColors.brand
                          : ProfessorLinksStyle.line2(colors),
                    ),
                  ),
                  child: value
                      ? const Icon(Icons.check_rounded,
                          size: 14, color: ProfessorLinksStyle.onBrand)
                      : null,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    title,
                    style: ProfessorLinksStyle.display(
                      13.5,
                      weight: FontWeight.w600,
                      color: colors.onSurface,
                    ),
                  ),
                ),
                Text(
                  trailing,
                  style: ProfessorLinksStyle.mono(
                    10.5,
                    color: ProfessorLinksStyle.dim(colors),
                  ),
                ),
              ],
            ),
          ),
        );

    void toggleClass(String id) {
      final ids = [..._audience.classIds];
      ids.contains(id) ? ids.remove(id) : ids.add(id);
      _setAudience(_audience.copyWith(classIds: ids));
    }

    return ProfessorLinksScaffold(
      title: 'Para quem',
      subtitle: count == null
          ? 'CONTANDO ALUNOS…'
          : count < 0
              ? 'NÃO FOI POSSÍVEL CONTAR'
              : '$count ALUNO${count == 1 ? '' : 'S'} SELECIONADO'
                  '${count == 1 ? '' : 'S'}',
      onBack: () => setState(() => _step = 0),
      body: Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
              children: [
                Wrap(
                  spacing: 6,
                  children: [
                    ArenaClassChip(
                      key: const Key('professor-notice-audience-all'),
                      label: 'Todos',
                      selected: allSelected && !_audience.isEmpty,
                      onTap: () => _setAudience(ProfessorNoticeAudience(
                        classIds: allIds,
                        wallet: walletCount > 0,
                      )),
                    ),
                    ArenaClassChip(
                      key: const Key('professor-notice-audience-none'),
                      label: 'Limpar',
                      selected: false,
                      onTap: () =>
                          _setAudience(const ProfessorNoticeAudience()),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                if (classes.isEmpty && walletCount == 0)
                  const ProfessorLinksCard(
                    key: Key('professor-notice-audience-empty'),
                    child: ProfessorMutedText(
                      'Você ainda não tem alunos que possa avisar: as turmas '
                      'entram quando a arena libera "Gerenciar as próprias '
                      'aulas", e a carteira quando o aluno aceita o convite.',
                    ),
                  ),
                for (final e in byArena.entries) ...[
                  Row(
                    children: [
                      Expanded(
                          child: ProfessorLinksKicker(e.value.first.arenaName)),
                      if (snap?.arena(e.key)?.type case final t?)
                        ProfessorLinkTypeTag(t, small: true),
                    ],
                  ),
                  const SizedBox(height: 8),
                  ProfessorRowsBlock(
                    children: [
                      for (var i = 0; i < e.value.length; i++)
                        check(
                          key: Key(
                              'professor-notice-class-${e.value[i].classId}'),
                          title: e.value[i].name,
                          trailing: '${e.value[i].students}',
                          value:
                              _audience.classIds.contains(e.value[i].classId),
                          first: i == 0,
                          onTap: () => toggleClass(e.value[i].classId),
                        ),
                    ],
                  ),
                  const SizedBox(height: 14),
                ],
                if (walletCount > 0) ...[
                  const Row(
                    children: [
                      Expanded(child: ProfessorLinksKicker('Carteira própria')),
                      ProfessorLinkTypeTag(
                        ArenaProfessorLinkType.independent,
                        small: true,
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  ProfessorRowsBlock(
                    children: [
                      check(
                        key: const Key('professor-notice-wallet'),
                        title: 'Alunos da carteira',
                        trailing: '$walletCount',
                        value: _audience.wallet,
                        first: true,
                        onTap: () => _setAudience(
                          _audience.copyWith(wallet: !_audience.wallet),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),
                ],
                const ProfessorLinksNote(
                  'Quem está em mais de uma turma recebe uma vez só. Só '
                  'alunos com conta nexaGO recebem.',
                ),
              ],
            ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
              child: ProfessorLinksPrimaryButton(
                key: const Key('professor-notice-continue'),
                label: count == null || count < 0
                    ? 'Continuar'
                    : 'Continuar · $count aluno${count == 1 ? '' : 's'}',
                loading: _busy,
                onPressed: _audience.isEmpty || count == 0 ? null : _openTiming,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _BodyField extends StatelessWidget {
  const _BodyField({required this.controller});

  final TextEditingController controller;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const ProfessorLinksKicker('Mensagem'),
        const SizedBox(height: 7),
        TextField(
          key: const Key('professor-notice-body'),
          controller: controller,
          minLines: 4,
          maxLines: 10,
          maxLength: kProfessorNoticeBodyMax,
          textCapitalization: TextCapitalization.sentences,
          decoration: InputDecoration(
            counterText: '',
            filled: true,
            fillColor: ProfessorLinksStyle.soft(colors),
            hintText: 'Escreva para seus alunos…',
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: BorderSide(color: ProfessorLinksStyle.line2(colors)),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: BorderSide(color: ProfessorLinksStyle.line2(colors)),
            ),
          ),
        ),
      ],
    );
  }
}

/// F4: agora ou agendado, e o lembrete de quem não respondeu.
class _TimingSheet extends StatefulWidget {
  const _TimingSheet({
    required this.title,
    required this.count,
    required this.isPoll,
    required this.now,
    this.initialScheduled,
  });

  final String title;
  final int? count;
  final bool isPoll;

  /// Parede de SP.
  final DateTime now;
  final DateTime? initialScheduled;

  @override
  State<_TimingSheet> createState() => _TimingSheetState();
}

class _TimingSheetState extends State<_TimingSheet> {
  late bool _schedule = widget.initialScheduled != null;
  late DateTime _at = widget.initialScheduled ??
      DateTime(widget.now.year, widget.now.month, widget.now.day + 1, 8);
  bool _remind = false;
  late DateTime _remindAt = _defaultRemind();

  DateTime _defaultRemind() {
    final base = _schedule ? _at : widget.now;
    return DateTime(base.year, base.month, base.day + 2, 18);
  }

  Future<DateTime?> _pick(DateTime current) async {
    final date = await showDatePicker(
      context: context,
      initialDate: current,
      firstDate: DateTime(widget.now.year, widget.now.month, widget.now.day),
      lastDate: widget.now.add(const Duration(days: 60)),
    );
    if (date == null || !mounted) return null;
    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay(hour: current.hour, minute: current.minute),
    );
    if (time == null) return null;
    return DateTime(date.year, date.month, date.day, time.hour, time.minute);
  }

  @override
  Widget build(BuildContext context) {
    final n = widget.count;
    Widget when(String label, DateTime value, Key key, VoidCallback onTap) =>
        ArenaClassChoiceCard(
          key: key,
          title: label,
          subtitle: professorWallLabel(value),
          selected: false,
          onTap: onTap,
          trailing: const Icon(Icons.edit_calendar_outlined, size: 18),
        );
    return ProfessorLinksSheetBody(
      title: 'Quando enviar',
      subtitle: [
        if (widget.title.isNotEmpty) widget.title,
        if (n != null && n >= 0) '$n aluno${n == 1 ? '' : 's'}',
      ].join(' · '),
      children: [
        const SizedBox(height: 14),
        ArenaClassChoiceCard(
          key: const Key('professor-notice-when-now'),
          title: 'Agora',
          subtitle: 'Push + app',
          selected: !_schedule,
          onTap: () => setState(() => _schedule = false),
        ),
        const SizedBox(height: 8),
        ArenaClassChoiceCard(
          key: const Key('professor-notice-when-schedule'),
          title: 'Agendar',
          subtitle: professorWallLabel(_at),
          selected: _schedule,
          onTap: () => setState(() => _schedule = true),
        ),
        if (_schedule) ...[
          const SizedBox(height: 8),
          when('Dia e hora do envio', _at,
              const Key('professor-notice-when-pick'), () async {
            final v = await _pick(_at);
            if (v != null) setState(() => _at = v);
          }),
        ],
        const SizedBox(height: 12),
        ProfessorLinksCard(
          padding: const EdgeInsets.fromLTRB(14, 4, 6, 4),
          child: ProfessorWalletToggleRow(
            key: const Key('professor-notice-remind'),
            title: widget.isPoll
                ? 'Lembrar quem não respondeu'
                : 'Lembrar quem não leu',
            subtitle: _remind ? professorWallLabel(_remindAt) : null,
            value: _remind,
            onChanged: (v) => setState(() {
              _remind = v;
              if (v && !_remindAt.isAfter(_schedule ? _at : widget.now)) {
                _remindAt = _defaultRemind();
              }
            }),
          ),
        ),
        if (_remind) ...[
          const SizedBox(height: 8),
          when('Lembrete em', _remindAt,
              const Key('professor-notice-remind-pick'), () async {
            final v = await _pick(_remindAt);
            if (v != null) setState(() => _remindAt = v);
          }),
        ],
        const SizedBox(height: 18),
        ProfessorLinksPrimaryButton(
          key: const Key('professor-notice-send'),
          label: _schedule ? 'Agendar comunicado' : 'Enviar agora',
          onPressed: () => Navigator.of(context).pop((
            scheduledAt: _schedule ? _instant(_at) : null,
            remindAt: _remind ? _instant(_remindAt) : null,
          )),
        ),
      ],
    );
  }
}
