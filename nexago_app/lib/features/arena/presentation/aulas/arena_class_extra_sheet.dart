import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

import '../../../../core/formatting/br_phone_format.dart';
import '../../../../core/profiles/app_user_profile.dart';
import '../../data/arena_class_repository.dart';
import '../../domain/aulas/arena_class.dart';
import '../../domain/aulas/arena_class_billing_logic.dart';
import '../../domain/aulas/arena_class_enrollment_providers.dart';
import '../../domain/aulas/arena_class_logic.dart';
import '../../domain/aulas/arena_class_providers.dart';
import '../../domain/aulas/arena_class_session.dart';
import 'widgets/arena_class_atoms.dart';
import 'widgets/arena_class_form_atoms.dart';

/// Abre "Encaixar na aula" (A3) sobre a chamada. Devolve a mensagem de
/// sucesso quando alguém foi encaixado; `null` se o gestor desistiu.
Future<String?> showArenaClassExtraSheet(
  BuildContext context, {
  required ArenaClassSession session,
  required List<ArenaClassStudent> students,
}) {
  return showModalBottomSheet<String>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: context.themeColors.surfaceSheet,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(26)),
    ),
    builder: (_) => ArenaClassExtraSheet(session: session, students: students),
  );
}

enum _ExtraTab { makeup, trial }

/// Reposição (aluno com crédito da arena) ou experimental (atleta NexaGO ou
/// só o nome). O encaixe ocupa a vaga do dia — o backend confere de novo.
class ArenaClassExtraSheet extends ConsumerStatefulWidget {
  const ArenaClassExtraSheet({
    super.key,
    required this.session,
    required this.students,
  });

  final ArenaClassSession session;
  final List<ArenaClassStudent> students;

  @override
  ConsumerState<ArenaClassExtraSheet> createState() =>
      _ArenaClassExtraSheetState();
}

class _ArenaClassExtraSheetState extends ConsumerState<ArenaClassExtraSheet> {
  _ExtraTab _tab = _ExtraTab.makeup;
  final _filter = TextEditingController();
  final _guestName = TextEditingController();
  final _guestPhone = TextEditingController();
  String? _creditId;
  AppUserProfile? _athlete;
  bool _guest = false;
  bool _sending = false;
  String? _error;

  @override
  void dispose() {
    _filter.dispose();
    _guestName.dispose();
    _guestPhone.dispose();
    super.dispose();
  }

  /// Quem já está na aula hoje (aluno do dia ou encaixe) — não aparece.
  Set<String> get _inSession {
    final weekday = arenaClassDateKeyWeekday(widget.session.date);
    return {
      for (final s in arenaClassRegularsOn(widget.students, weekday)) s.id,
      ...widget.session.extras.keys,
    };
  }

  Future<void> _submit(List<ArenaClassMakeupOption> options) async {
    if (_sending) return;
    final repo = ref.read(arenaClassRepositoryProvider);
    String who;
    Future<String> call;
    if (_tab == _ExtraTab.makeup) {
      final option = options.where((o) => o.credit.id == _creditId).firstOrNull;
      if (option == null) return;
      who = option.name;
      call = repo.addExtra(
        sessionId: widget.session.id,
        kind: ArenaClassExtraKind.makeup,
        creditId: option.credit.id,
      );
    } else if (_guest) {
      final name = _guestName.text.trim();
      if (name.length < 2) {
        setState(() => _error = 'Informe o nome de quem vai fazer a aula.');
        return;
      }
      who = name;
      call = repo.addExtra(
        sessionId: widget.session.id,
        kind: ArenaClassExtraKind.trial,
        name: name,
        phone: _guestPhone.text,
      );
    } else {
      final athlete = _athlete;
      if (athlete == null) return;
      who = arenaClassAthleteName(athlete);
      call = repo.addExtra(
        sessionId: widget.session.id,
        kind: ArenaClassExtraKind.trial,
        athleteId: athlete.uid,
      );
    }
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      await call;
      if (!mounted) return;
      Navigator.of(context).pop(
        _tab == _ExtraTab.makeup
            ? '$who entrou na aula como reposição.'
            : '$who entrou na aula experimental.',
      );
    } on ArenaClassException catch (e) {
      if (!mounted) return;
      setState(() {
        _sending = false;
        _error = e.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _sending = false;
        _error = 'Não foi possível encaixar. Tente novamente.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final session = widget.session;
    final free = arenaClassSessionFreeSpots(session, widget.students);
    final creditsAsync = ref.watch(arenaClassAvailableCreditsProvider);
    final classNames = <String, String>{
      for (final c in ref.watch(managedArenaClassesProvider).valueOrNull ??
          const <ArenaClass>[])
        c.id: c.name,
    };
    final options = arenaClassMakeupOptions(
      credits: creditsAsync.valueOrNull ?? const [],
      session: session,
      inSession: _inSession,
    );
    final query = _filter.text.trim().toLowerCase();
    final visible = query.isEmpty
        ? options
        : options.where((o) => o.name.toLowerCase().contains(query)).toList();

    final selectedName = switch (_tab) {
      _ExtraTab.makeup =>
        options.where((o) => o.credit.id == _creditId).firstOrNull?.name,
      _ExtraTab.trial => _guest
          ? (_guestName.text.trim().length >= 2 ? _guestName.text.trim() : null)
          : (_athlete == null ? null : arenaClassAthleteName(_athlete!)),
    };
    final canSubmit = free > 0 && selectedName != null && !_sending;

    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.sizeOf(context).height * 0.88,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
              child: ArenaClassSheetHeader(
                title: 'Encaixar na aula',
                subtitle: free > 0
                    ? '$free vaga${free == 1 ? '' : 's'} livre'
                        '${free == 1 ? '' : 's'} · ${session.className} '
                        '${session.startTime}'
                    : 'Aula sem vaga · ${session.className} '
                        '${session.startTime}',
                subtitleColor: free > 0 ? null : AppColors.live,
                onClose: _sending ? () {} : null,
              ),
            ),
            const SizedBox(height: 12),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Row(
                children: [
                  ArenaClassChip(
                    label: 'Reposição',
                    selected: _tab == _ExtraTab.makeup,
                    onTap: _sending
                        ? null
                        : () => setState(() {
                              _tab = _ExtraTab.makeup;
                              _error = null;
                            }),
                  ),
                  const SizedBox(width: 6),
                  ArenaClassChip(
                    label: 'Experimental',
                    selected: _tab == _ExtraTab.trial,
                    onTap: _sending
                        ? null
                        : () => setState(() {
                              _tab = _ExtraTab.trial;
                              _error = null;
                            }),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            Flexible(
              child: ListView(
                shrinkWrap: true,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                children: _tab == _ExtraTab.makeup
                    ? _makeupChildren(
                        context,
                        loading:
                            creditsAsync.isLoading && !creditsAsync.hasValue,
                        options: options,
                        visible: visible,
                        classNames: classNames,
                      )
                    : _trialChildren(context),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (_error != null) ...[
                    Text(
                      _error!,
                      style: TextStyle(
                        color: colors.live,
                        fontWeight: FontWeight.w600,
                        fontSize: 12.5,
                      ),
                    ),
                    const SizedBox(height: 10),
                  ],
                  Text(
                    _tab == _ExtraTab.makeup
                        ? 'O crédito é usado ao confirmar. Tirar o encaixe '
                            'da chamada devolve o crédito.'
                        : 'A aula experimental não usa crédito nem gera '
                            'cobrança — ocupa uma vaga só neste dia.',
                    style: TextStyle(
                      fontSize: 11.5,
                      height: 1.45,
                      color: colors.onSurfaceMuted,
                    ),
                  ),
                  const SizedBox(height: 12),
                  ArenaClassPrimaryButton(
                    label: free <= 0
                        ? 'Aula sem vaga'
                        : selectedName == null
                            ? (_tab == _ExtraTab.makeup
                                ? 'Escolha o aluno'
                                : 'Escolha quem vai fazer a aula')
                            : 'Encaixar $selectedName',
                    busy: _sending,
                    onPressed: canSubmit ? () => _submit(options) : null,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  List<Widget> _makeupChildren(
    BuildContext context, {
    required bool loading,
    required List<ArenaClassMakeupOption> options,
    required List<ArenaClassMakeupOption> visible,
    required Map<String, String> classNames,
  }) {
    final colors = context.themeColors;
    if (loading) {
      return const [
        Padding(
          padding: EdgeInsets.symmetric(vertical: 24),
          child: Center(child: CircularProgressIndicator()),
        ),
      ];
    }
    if (options.isEmpty) {
      return [
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 16),
          child: Text(
            'Nenhum aluno com crédito de reposição válido para esta aula. '
            'O crédito nasce da falta avisada na chamada fechada ou da aula '
            'cancelada pela arena.',
            style: TextStyle(
              fontSize: 12.5,
              height: 1.45,
              color: colors.onSurfaceMuted,
            ),
          ),
        ),
      ];
    }
    return [
      TextField(
        controller: _filter,
        enabled: !_sending,
        onChanged: (_) => setState(() {}),
        style: TextStyle(fontSize: 14, color: colors.onSurface),
        decoration: arenaClassInputDecoration(
          context,
          hint: 'Buscar aluno com crédito',
          icon: Icons.search_rounded,
        ),
      ),
      for (final o in visible) ...[
        const SizedBox(height: 8),
        ArenaClassChoiceCard(
          title: o.name,
          subtitle: arenaClassMakeupSubtitle(
            o,
            sourceClassName: classNames[o.credit.classId],
          ),
          selected: o.credit.id == _creditId,
          onTap: _sending
              ? null
              : () => setState(() {
                    _creditId = o.credit.id;
                    _error = null;
                  }),
          trailing: ArenaClassAvatar(
            initials: arenaClassInitials(o.name),
            size: 32,
          ),
        ),
      ],
      if (visible.isEmpty)
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 16),
          child: Text(
            'Ninguém com crédito chamado "${_filter.text.trim()}".',
            style: TextStyle(fontSize: 12.5, color: colors.onSurfaceMuted),
          ),
        ),
    ];
  }

  List<Widget> _trialChildren(BuildContext context) {
    final colors = context.themeColors;
    if (_guest) {
      return [
        TextField(
          controller: _guestName,
          enabled: !_sending,
          autofocus: true,
          maxLength: 80,
          textCapitalization: TextCapitalization.words,
          onChanged: (_) => setState(() => _error = null),
          style: TextStyle(fontSize: 14, color: colors.onSurface),
          decoration: arenaClassInputDecoration(
            context,
            hint: 'Nome de quem vai fazer a aula',
            icon: Icons.person_outline_rounded,
          ),
        ),
        const SizedBox(height: 8),
        TextField(
          controller: _guestPhone,
          enabled: !_sending,
          keyboardType: TextInputType.phone,
          inputFormatters: [BrPhoneInputFormatter()],
          style: TextStyle(fontSize: 14, color: colors.onSurface),
          decoration: arenaClassInputDecoration(
            context,
            hint: 'WhatsApp (opcional)',
            icon: Icons.phone_outlined,
          ),
        ),
        const SizedBox(height: 10),
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            onPressed: _sending ? null : () => setState(() => _guest = false),
            icon: const Icon(Icons.search_rounded, size: 16),
            label: const Text('Buscar atleta NexaGO'),
          ),
        ),
      ];
    }
    return [
      ArenaClassAthleteSearch(
        selectedUid: _athlete?.uid,
        excludeUids: _inSession,
        enabled: !_sending,
        onSelect: (u) => setState(() {
          _athlete = u;
          _error = null;
        }),
      ),
      const SizedBox(height: 10),
      Align(
        alignment: Alignment.centerLeft,
        child: TextButton.icon(
          onPressed: _sending
              ? null
              : () => setState(() {
                    _guest = true;
                    _athlete = null;
                  }),
          icon: const Icon(Icons.person_add_alt_rounded, size: 16),
          label: const Text('Não tem conta? Encaixar só pelo nome'),
        ),
      ),
    ];
  }
}
