import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/router/navigation_helpers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../arena/presentation/aulas/widgets/arena_class_form_atoms.dart';
import '../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../professor_mode/presentation/wallet/professor_wallet_widgets.dart';
import '../../professor_mode/presentation/widgets/professor_students_widgets.dart';
import '../application/messages_providers.dart';
import '../domain/messages.dart';

// ---------------------------------------------------------------------------
// D6 Respostas rápidas
// ---------------------------------------------------------------------------

/// D6 Respostas rápidas: modelos com campos (`{nome}` é preenchido sozinho
/// na conversa com o aluno; os outros o professor completa). Viram os chips
/// do composer.
class MessageTemplatesPage extends ConsumerWidget {
  const MessageTemplatesPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final async = ref.watch(messageTemplatesProvider);
    final list = async.valueOrNull;
    return ProfessorLinksScaffold(
      title: 'Respostas rápidas',
      subtitle: 'MODELOS COM CAMPOS AUTOMÁTICOS',
      onBack: () => popOrGo(context, AppRoutes.professorMessages),
      trailing: ProfessorLinksRoundButton(
        key: const Key('templates-new'),
        icon: Icons.add_rounded,
        filled: true,
        semanticLabel: 'Novo modelo',
        onTap: () => showTemplateEditor(context),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
        children: [
          const ProfessorLinksNote(
            'Use {nome} para o primeiro nome do aluno — preenchido sozinho '
            'na conversa. Outros campos, como {data} ou {link}, você completa '
            'antes de enviar.',
            tone: ProfessorLinksNoteTone.blue,
          ),
          const SizedBox(height: 12),
          if (list == null && async.hasError)
            ProfessorRetryCard(
              message: 'Não foi possível carregar seus modelos.',
              onRetry: () => ref.invalidate(messageTemplatesProvider),
            )
          else if (list == null)
            const ProfessorWalletLoading()
          else if (list.isEmpty)
            const ProfessorLinksCard(
              key: Key('templates-empty'),
              child: ProfessorMutedText(
                'Nenhum modelo ainda. Toque em "+" para criar o aviso de '
                'chuva, o lembrete de pagamento ou as boas-vindas.',
              ),
            )
          else
            for (final t in list) ...[
              ProfessorLinksCard(
                key: Key('template-${t.id}'),
                onTap: () => showTemplateEditor(context, template: t),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            t.title,
                            style: ProfessorLinksStyle.display(
                              14,
                              color: colors.onSurface,
                            ),
                          ),
                        ),
                        Text(
                          '${t.uses} USO${t.uses == 1 ? '' : 'S'}',
                          style: ProfessorLinksStyle.mono(
                            10,
                            color: ProfessorLinksStyle.dim(colors),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 7),
                    Text.rich(
                      TextSpan(children: [
                        for (final part
                            in t.body.split(RegExp(r'(?=\{)|(?<=\})')))
                          TextSpan(
                            text: part,
                            style: part.startsWith('{') && part.endsWith('}')
                                ? ProfessorLinksStyle.mono(
                                    11.5,
                                    weight: FontWeight.w600,
                                    color: AppColors.brand,
                                  )
                                : null,
                          ),
                      ]),
                      style: AppTypography.bodyS.copyWith(
                        fontSize: 12.5,
                        height: 1.5,
                        color: ProfessorLinksStyle.mute(colors),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 10),
            ],
        ],
      ),
    );
  }
}

Future<void> showTemplateEditor(
  BuildContext context, {
  MessageTemplate? template,
}) =>
    showProfessorLinksSheet<void>(
      context,
      builder: (_) => _TemplateEditor(template: template),
    );

class _TemplateEditor extends ConsumerStatefulWidget {
  const _TemplateEditor({this.template});

  final MessageTemplate? template;

  @override
  ConsumerState<_TemplateEditor> createState() => _TemplateEditorState();
}

class _TemplateEditorState extends ConsumerState<_TemplateEditor> {
  late final _title = TextEditingController(text: widget.template?.title ?? '');
  late final _body = TextEditingController(text: widget.template?.body ?? '');
  String? _error;
  bool _saving = false;

  @override
  void dispose() {
    _title.dispose();
    _body.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final error = validateTemplate(title: _title.text, body: _body.text);
    setState(() => _error = error);
    if (error != null) return;
    setState(() => _saving = true);
    final nav = Navigator.of(context);
    final ok = await runProfessorWalletAction(
      context,
      () => ref.read(messagesRepositoryProvider).saveTemplate(
            ref.read(messagesUidProvider),
            templateId: widget.template?.id,
            title: _title.text,
            body: _body.text,
            uses: widget.template?.uses,
          ),
      message: 'Modelo salvo.',
    );
    if (!mounted) return;
    if (ok) {
      nav.pop();
    } else {
      setState(() => _saving = false);
    }
  }

  Future<void> _delete() async {
    final ok = await confirmProfessorWalletAction(
      context,
      title: 'Apagar modelo?',
      body: '"${widget.template!.title}" sai das respostas rápidas.',
      confirmLabel: 'Apagar',
    );
    if (!ok || !mounted) return;
    final nav = Navigator.of(context);
    final done = await runProfessorWalletAction(
      context,
      () => ref.read(messagesRepositoryProvider).deleteTemplate(
            ref.read(messagesUidProvider),
            widget.template!.id,
          ),
      message: 'Modelo apagado.',
    );
    if (done && mounted) nav.pop();
  }

  @override
  Widget build(BuildContext context) {
    return ProfessorLinksSheetBody(
      title: widget.template == null ? 'Novo modelo' : 'Editar modelo',
      children: [
        const SizedBox(height: 14),
        ProfessorWalletField(
          key: const Key('template-title'),
          label: 'Nome',
          hint: 'Ex.: Aviso de chuva',
          controller: _title,
          maxLength: kTemplateTitleMax,
          textCapitalization: TextCapitalization.sentences,
        ),
        const SizedBox(height: 14),
        ProfessorWalletField(
          key: const Key('template-body'),
          label: 'Texto',
          hint: 'Oi {nome}! …',
          controller: _body,
          maxLength: kTemplateBodyMax,
          textCapitalization: TextCapitalization.sentences,
        ),
        if (_error != null) ...[
          const SizedBox(height: 12),
          ProfessorLinksNote(
            _error!,
            key: const Key('template-error'),
            tone: ProfessorLinksNoteTone.red,
          ),
        ],
        const SizedBox(height: 18),
        ProfessorLinksPrimaryButton(
          key: const Key('template-save'),
          label: 'Salvar modelo',
          loading: _saving,
          onPressed: _save,
        ),
        if (widget.template != null) ...[
          const SizedBox(height: 10),
          ProfessorLinksGhostButton(
            key: const Key('template-delete'),
            label: 'Apagar modelo',
            color: AppColors.live,
            onPressed: _delete,
          ),
        ],
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// D7 Horário de atendimento
// ---------------------------------------------------------------------------

/// D7 Horário de atendimento: fora dele o servidor silencia o push e (se
/// ligado) manda a resposta automática na conversa direta — uma por
/// conversa a cada 12h. "Das" igual a "Até" = o dia inteiro.
class ServiceHoursPage extends ConsumerStatefulWidget {
  const ServiceHoursPage({super.key});

  @override
  ConsumerState<ServiceHoursPage> createState() => _ServiceHoursPageState();
}

class _ServiceHoursPageState extends ConsumerState<ServiceHoursPage> {
  static const _dayLabels = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

  final _autoText = TextEditingController();
  MessagingPrefs? _prefs;
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _autoText.dispose();
    super.dispose();
  }

  MessagingPrefs _copy({
    bool? quietEnabled,
    String? from,
    String? to,
    List<int>? days,
    bool? autoReplyEnabled,
  }) {
    final p = _prefs!;
    return MessagingPrefs(
      quietEnabled: quietEnabled ?? p.quietEnabled,
      from: from ?? p.from,
      to: to ?? p.to,
      days: days ?? p.days,
      autoReplyEnabled: autoReplyEnabled ?? p.autoReplyEnabled,
      autoReplyText: _autoText.text,
    );
  }

  Future<void> _pickTime({required bool from}) async {
    final current = from ? _prefs!.from : _prefs!.to;
    final parts = current.split(':');
    final picked = await showTimePicker(
      context: context,
      initialTime: TimeOfDay(
        hour: int.parse(parts[0]),
        minute: int.parse(parts[1]),
      ),
    );
    if (picked == null || !mounted) return;
    final v = '${picked.hour.toString().padLeft(2, '0')}:'
        '${picked.minute.toString().padLeft(2, '0')}';
    setState(() => _prefs = from ? _copy(from: v) : _copy(to: v));
  }

  Future<void> _save() async {
    final p = _copy();
    final error = validatePrefs(p);
    setState(() => _error = error);
    if (error != null) return;
    setState(() => _saving = true);
    final ok = await runProfessorWalletAction(
      context,
      () => ref
          .read(messagesRepositoryProvider)
          .savePrefs(ref.read(messagesUidProvider), p),
      message: 'Horário salvo.',
    );
    if (!mounted) return;
    setState(() => _saving = false);
    if (ok) popOrGo(context, AppRoutes.professorMessages);
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final async = ref.watch(messagingPrefsProvider);
    if (_prefs == null && async.hasValue) {
      _prefs = async.value;
      _autoText.text = _prefs!.autoReplyText;
    }
    final p = _prefs;
    return ProfessorLinksScaffold(
      title: 'Horário de atendimento',
      subtitle: 'MENSAGENS E NOTIFICAÇÕES',
      onBack: () => popOrGo(context, AppRoutes.professorMessages),
      body: p == null
          ? const ProfessorWalletLoading()
          : Column(
              children: [
                Expanded(
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
                    children: [
                      ProfessorRowsBlock(
                        children: [
                          ProfessorWalletToggleRow(
                            key: const Key('hours-quiet'),
                            title: 'Silenciar fora do horário',
                            subtitle: 'Sem push de aluno fora do horário',
                            value: p.quietEnabled,
                            onChanged: (v) => setState(
                              () => _prefs = _copy(quietEnabled: v),
                            ),
                          ),
                          ProfessorWalletToggleRow(
                            key: const Key('hours-auto'),
                            title: 'Resposta automática',
                            subtitle: 'Uma vez por conversa a cada 12h',
                            value: p.autoReplyEnabled,
                            onChanged: (v) => setState(
                              () => _prefs = _copy(autoReplyEnabled: v),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),
                      Row(
                        children: [
                          Expanded(
                            child: _TimeField(
                              key: const Key('hours-from'),
                              label: 'Das',
                              value: p.from,
                              onTap: () => _pickTime(from: true),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: _TimeField(
                              key: const Key('hours-to'),
                              label: 'Até',
                              value: p.to,
                              onTap: () => _pickTime(from: false),
                            ),
                          ),
                        ],
                      ),
                      if (prefsWholeDay(p)) ...[
                        const SizedBox(height: 6),
                        Text(
                          'Mesmo horário em "Das" e "Até": o dia inteiro.',
                          key: const Key('hours-whole-day'),
                          style: AppTypography.bodyS.copyWith(
                            fontSize: 11.5,
                            color: ProfessorLinksStyle.dim(colors),
                          ),
                        ),
                      ],
                      const SizedBox(height: 16),
                      const ProfessorLinksKicker('Dias'),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          for (var i = 0; i < 7; i++) ...[
                            if (i > 0) const SizedBox(width: 4),
                            Expanded(
                              child: ArenaClassChip(
                                key: Key('hours-day-${i + 1}'),
                                label: _dayLabels[i],
                                selected: p.days.contains(i + 1),
                                onTap: () => setState(() {
                                  final days = [...p.days];
                                  days.contains(i + 1)
                                      ? days.remove(i + 1)
                                      : days.add(i + 1);
                                  _prefs = _copy(days: days);
                                }),
                              ),
                            ),
                          ],
                        ],
                      ),
                      const SizedBox(height: 16),
                      ProfessorWalletField(
                        key: const Key('hours-auto-text'),
                        label: 'Resposta automática',
                        hint: 'Oi! Respondo a partir das 06:00.',
                        controller: _autoText,
                        maxLength: kAutoReplyMax,
                        textCapitalization: TextCapitalization.sentences,
                      ),
                      if (_error != null) ...[
                        const SizedBox(height: 12),
                        ProfessorLinksNote(
                          _error!,
                          key: const Key('hours-error'),
                          tone: ProfessorLinksNoteTone.red,
                        ),
                      ],
                    ],
                  ),
                ),
                SafeArea(
                  top: false,
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
                    child: ProfessorLinksPrimaryButton(
                      key: const Key('hours-save'),
                      label: 'Salvar',
                      loading: _saving,
                      onPressed: _save,
                    ),
                  ),
                ),
              ],
            ),
    );
  }
}

class _TimeField extends StatelessWidget {
  const _TimeField({
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
              alignment: Alignment.centerLeft,
              padding: const EdgeInsets.symmetric(horizontal: 13),
              child: Text(
                value,
                style: ProfessorLinksStyle.display(
                  14,
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
