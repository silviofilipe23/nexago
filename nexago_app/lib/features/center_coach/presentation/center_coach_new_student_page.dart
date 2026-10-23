import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/profiles/app_user_profile.dart';
import '../../../core/router/navigation_helpers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../professor_mode/presentation/widgets/professor_students_widgets.dart';
import '../application/center_coach_providers.dart';
import '../application/center_management_providers.dart';
import '../domain/center_coach.dart';
import '../domain/center_coach_repository.dart';
import '../domain/center_management.dart';
import '../infrastructure/firebase_center_management_repository.dart';
import 'widgets/center_management_widgets.dart';

/// Novo aluno no centro (W10 do portal): vincular uma conta NexaGO que já
/// existe (nasce ativo) ou convidar por e-mail (nasce "Convidado" e vira
/// ativo quando a pessoa aceita pelo app). Menor pede o responsável legal.
/// Quem tem "Matricular alunos" (gestão e recepção) cadastra.
class CenterCoachNewStudentPage extends ConsumerStatefulWidget {
  const CenterCoachNewStudentPage({
    super.key,
    required this.centerId,
    this.thenEnroll = false,
  });

  final String centerId;

  /// Veio do Matricular: depois de salvar, volta para matricular o aluno.
  final bool thenEnroll;

  @override
  ConsumerState<CenterCoachNewStudentPage> createState() =>
      _CenterCoachNewStudentPageState();
}

class _CenterCoachNewStudentPageState
    extends ConsumerState<CenterCoachNewStudentPage> {
  /// `search` (conta NexaGO) ou `invite` (por e-mail).
  String _mode = 'search';

  final _term = TextEditingController();
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _phone = TextEditingController();
  final _gName = TextEditingController();
  final _gRelation = TextEditingController();
  final _gEmail = TextEditingController();
  final _gPhone = TextEditingController();

  Timer? _debounce;
  int _searchSeq = 0;
  bool _searching = false;
  String? _searchError;
  List<AppUserProfile> _hits = const [];
  AppUserProfile? _selected;

  bool _isMinor = false;
  String? _birthDate;
  bool _busy = false;
  bool _tried = false;
  String? _error;

  @override
  void dispose() {
    _debounce?.cancel();
    for (final c in [
      _term,
      _name,
      _email,
      _phone,
      _gName,
      _gRelation,
      _gEmail,
      _gPhone,
    ]) {
      c.dispose();
    }
    super.dispose();
  }

  void _onTerm(String value) {
    _debounce?.cancel();
    final seq = ++_searchSeq;
    setState(() => _selected = null);
    if (value.trim().length < 2) {
      setState(() {
        _hits = const [];
        _searching = false;
        _searchError = null;
      });
      return;
    }
    setState(() => _searching = true);
    // Só busca 350 ms depois da última tecla e descarta resposta velha.
    _debounce = Timer(const Duration(milliseconds: 350), () async {
      try {
        final hits = await ref.read(centerAccountSearchProvider)(value);
        if (!mounted || seq != _searchSeq) return;
        setState(() {
          _hits = hits;
          _searchError = null;
        });
      } catch (_) {
        if (!mounted || seq != _searchSeq) return;
        setState(() => _searchError = 'Não foi possível buscar agora.');
      } finally {
        if (mounted && seq == _searchSeq) setState(() => _searching = false);
      }
    });
  }

  CenterNewStudentInput _input() {
    final hit = _mode == 'search' ? _selected : null;
    return CenterNewStudentInput(
      uid: hit?.uid,
      name: hit == null ? _name.text : centerAccountName(hit),
      email: _email.text,
      phone: _phone.text,
      isMinor: _isMinor,
      birthDate: _isMinor ? _birthDate : null,
      guardian: _isMinor
          ? (
              name: _gName.text,
              relation: _gRelation.text,
              email: _gEmail.text,
              phone: _gPhone.text,
            )
          : null,
    );
  }

  List<String> _problems(Iterable<CenterCoachStudent> existing) {
    if (_mode == 'search' && _selected == null) {
      return const ['Escolha uma conta na busca.'];
    }
    return centerNewStudentProblems(input: _input(), existing: existing);
  }

  Future<void> _save(Iterable<CenterCoachStudent> existing) async {
    setState(() => _tried = true);
    if (_busy || _problems(existing).isNotEmpty) return;
    final input = _input();
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final id = await ref.read(centerManagementRepositoryProvider).addStudent(
            centerId: widget.centerId,
            input: input,
            actor: ref.read(centerActorProvider(widget.centerId)),
          );
      if (!mounted) return;
      ScaffoldMessenger.maybeOf(context)?.showSnackBar(
        SnackBar(
          content: Text(
            input.linked
                ? '${input.name.trim()} agora é aluno do centro.'
                : 'Convite enviado para ${input.email.trim()}.',
          ),
        ),
      );
      final params = {'centerId': widget.centerId};
      // Do Matricular, segue para a matrícula do aluno novo (convidado
      // também matricula); senão, cai no perfil.
      if (widget.thenEnroll) {
        context.pushReplacementNamed(
          AppRouteNames.centerCoachEnroll,
          pathParameters: params,
          queryParameters: {'aluno': id},
        );
      } else {
        context.pushReplacementNamed(
          AppRouteNames.centerCoachStudent,
          pathParameters: {...params, 'studentId': id},
        );
      }
    } on CenterCoachException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _pickBirth() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _birthDate == null
          ? DateTime(now.year - 10, now.month, now.day)
          : DateTime.parse(_birthDate!),
      firstDate: DateTime(now.year - 19),
      lastDate: now,
      initialEntryMode: DatePickerEntryMode.input,
    );
    if (picked == null || !mounted) return;
    setState(
      () => _birthDate = '${picked.year.toString().padLeft(4, '0')}-'
          '${picked.month.toString().padLeft(2, '0')}-'
          '${picked.day.toString().padLeft(2, '0')}',
    );
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final centerId = widget.centerId;
    final member = ref.watch(centerMembershipProvider(centerId));
    final existing = (ref.watch(coachStudentsProvider(centerId)).valueOrNull ??
            const <String, CenterCoachStudent>{})
        .values;
    final linkedUids = {
      for (final s in existing)
        if (s.uid.isNotEmpty) s.uid,
    };
    final problems = _tried ? _problems(existing) : const <String>[];
    final dim = AppTypography.bodyS.copyWith(
      fontSize: 11.5,
      color: ProfessorLinksStyle.dim(colors),
    );

    return ProfessorLinksScaffold(
      title: 'Novo aluno',
      subtitle: member?.centerName.toUpperCase(),
      onBack: () => popOrGo(context, AppRoutes.centerCoachAgenda),
      body: member == null || !member.has('enroll_students')
          ? const Padding(
              padding: EdgeInsets.fromLTRB(20, 8, 20, 40),
              child: ProfessorLinksCard(
                child: ProfessorMutedText(
                  'Sem permissão para cadastrar alunos neste centro.',
                ),
              ),
            )
          : ListView(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
              children: [
                CenterSegmented<String>(
                  options: const [
                    ('search', 'Conta NexaGO'),
                    ('invite', 'Por e-mail'),
                  ],
                  value: _mode,
                  onChanged: (m) => setState(() {
                    _mode = m;
                    _selected = null;
                    _tried = false;
                    _error = null;
                  }),
                ),
                const SizedBox(height: 14),
                if (_mode == 'search') ...[
                  CenterTextField(
                    key: const Key('center-new-student-term'),
                    controller: _term,
                    hint: 'Nome do atleta no NexaGO',
                    icon: Icons.search_rounded,
                    onChanged: _onTerm,
                  ),
                  const SizedBox(height: 10),
                  if (_searching)
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 16),
                      child: Center(
                        child: CircularProgressIndicator(
                          color: AppColors.brand,
                        ),
                      ),
                    )
                  else if (_searchError != null)
                    ProfessorLinksNote(
                      _searchError!,
                      tone: ProfessorLinksNoteTone.red,
                    )
                  else if (_term.text.trim().length >= 2 && _hits.isEmpty)
                    ProfessorLinksCard(
                      key: const Key('center-new-student-no-hits'),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const ProfessorMutedText(
                            'Nenhuma conta encontrada. Se a pessoa ainda não '
                            'usa o NexaGO, convide por e-mail.',
                          ),
                          const SizedBox(height: 10),
                          ProfessorLinksGhostButton(
                            key: const Key('center-new-student-to-invite'),
                            label: 'Convidar por e-mail',
                            height: 40,
                            onPressed: () => setState(() {
                              _mode = 'invite';
                              if (_name.text.isEmpty) _name.text = _term.text;
                            }),
                          ),
                        ],
                      ),
                    )
                  else if (_hits.isNotEmpty)
                    ProfessorLinksCard(
                      padding: EdgeInsets.zero,
                      child: Column(
                        children: [
                          for (final (i, h) in _hits.indexed)
                            CenterAccountRow(
                              key: Key('center-new-student-hit-${h.uid}'),
                              profile: h,
                              first: i == 0,
                              linked: linkedUids.contains(h.uid),
                              selected: _selected?.uid == h.uid,
                              onTap: () => setState(() => _selected = h),
                            ),
                        ],
                      ),
                    ),
                  if (_selected != null) ...[
                    const SizedBox(height: 12),
                    Text(
                      '${centerAccountName(_selected!)} usa a mesma conta NexaGO no '
                      'centro e nos torneios. O centro não lê os dados '
                      'pessoais da conta — informe o contato que o centro vai '
                      'usar (opcional).',
                      style: dim,
                    ),
                    const SizedBox(height: 10),
                    CenterTextField(
                      key: const Key('center-new-student-email'),
                      controller: _email,
                      hint: 'E-mail de contato',
                      icon: Icons.mail_outline_rounded,
                      keyboardType: TextInputType.emailAddress,
                      onChanged: (_) => setState(() {}),
                    ),
                    const SizedBox(height: 10),
                    CenterTextField(
                      key: const Key('center-new-student-phone'),
                      controller: _phone,
                      hint: 'Telefone',
                      icon: Icons.phone_outlined,
                      keyboardType: TextInputType.phone,
                    ),
                  ],
                ] else ...[
                  CenterTextField(
                    key: const Key('center-new-student-name'),
                    controller: _name,
                    hint: 'Nome completo',
                    icon: Icons.person_outline_rounded,
                    onChanged: (_) => setState(() {}),
                  ),
                  const SizedBox(height: 10),
                  CenterTextField(
                    key: const Key('center-new-student-email'),
                    controller: _email,
                    hint: 'E-mail',
                    icon: Icons.mail_outline_rounded,
                    keyboardType: TextInputType.emailAddress,
                    onChanged: (_) => setState(() {}),
                  ),
                  const SizedBox(height: 10),
                  CenterTextField(
                    key: const Key('center-new-student-phone'),
                    controller: _phone,
                    hint: 'Telefone / WhatsApp',
                    icon: Icons.phone_outlined,
                    keyboardType: TextInputType.phone,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'O aluno entra como "Convidado" e vira ativo quando aceitar '
                    'pelo app com esse e-mail.',
                    style: dim,
                  ),
                ],
                const SizedBox(height: 16),
                ProfessorLinksCard(
                  padding: const EdgeInsets.fromLTRB(14, 6, 8, 6),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Menor de 18 anos',
                              style: ProfessorLinksStyle.display(
                                13.5,
                                weight: FontWeight.w700,
                                color: colors.onSurface,
                              ),
                            ),
                            Text(
                              'Pede o responsável legal e o consentimento',
                              style: dim,
                            ),
                          ],
                        ),
                      ),
                      Switch.adaptive(
                        key: const Key('center-new-student-minor'),
                        value: _isMinor,
                        activeTrackColor: AppColors.brand,
                        onChanged: (v) => setState(() => _isMinor = v),
                      ),
                    ],
                  ),
                ),
                if (_isMinor) ...[
                  const SizedBox(height: 14),
                  const CenterKicker(
                    'Responsável legal · pagador e contato principal',
                  ),
                  const SizedBox(height: 8),
                  ProfessorLinksCard(
                    key: const Key('center-new-student-birth'),
                    onTap: _pickBirth,
                    child: Row(
                      children: [
                        Icon(
                          Icons.cake_outlined,
                          size: 18,
                          color: ProfessorLinksStyle.dim(colors),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            _birthDate == null
                                ? 'Nascimento do aluno'
                                : _formatDay(_birthDate!),
                            style: AppTypography.bodyS.copyWith(
                              color: _birthDate == null
                                  ? ProfessorLinksStyle.dim(colors)
                                  : colors.onSurface,
                            ),
                          ),
                        ),
                        Icon(
                          Icons.calendar_today_outlined,
                          size: 16,
                          color: ProfessorLinksStyle.dim(colors),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 10),
                  CenterTextField(
                    key: const Key('center-new-student-guardian-name'),
                    controller: _gName,
                    hint: 'Nome do responsável',
                    icon: Icons.person_outline_rounded,
                  ),
                  const SizedBox(height: 10),
                  CenterTextField(
                    key: const Key('center-new-student-guardian-relation'),
                    controller: _gRelation,
                    hint: 'Parentesco (mãe, pai, tutor…)',
                    icon: Icons.family_restroom_rounded,
                  ),
                  const SizedBox(height: 10),
                  CenterTextField(
                    key: const Key('center-new-student-guardian-email'),
                    controller: _gEmail,
                    hint: 'E-mail do responsável',
                    icon: Icons.mail_outline_rounded,
                    keyboardType: TextInputType.emailAddress,
                  ),
                  const SizedBox(height: 10),
                  CenterTextField(
                    key: const Key('center-new-student-guardian-phone'),
                    controller: _gPhone,
                    hint: 'Telefone do responsável',
                    icon: Icons.phone_outlined,
                    keyboardType: TextInputType.phone,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'O consentimento LGPD fica pendente até ser registrado na '
                    'ficha do aluno.',
                    style: dim,
                  ),
                ],
                const SizedBox(height: 16),
                if (problems.isNotEmpty) ...[
                  ProfessorLinksNote(
                    problems.first,
                    key: const Key('center-new-student-problem'),
                    tone: ProfessorLinksNoteTone.red,
                  ),
                  const SizedBox(height: 10),
                ],
                if (_error != null) ...[
                  ProfessorLinksNote(
                    _error!,
                    tone: ProfessorLinksNoteTone.red,
                  ),
                  const SizedBox(height: 10),
                ],
                ProfessorLinksPrimaryButton(
                  key: const Key('center-new-student-save'),
                  label: _mode == 'search'
                      ? 'Vincular ao centro'
                      : 'Enviar convite',
                  loading: _busy,
                  onPressed: () => _save(existing),
                ),
              ],
            ),
    );
  }
}

String _formatDay(String key) {
  final p = key.split('-');
  return p.length == 3 ? '${p[2]}/${p[1]}/${p[0]}' : key;
}

