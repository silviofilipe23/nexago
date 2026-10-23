import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../core/formatting/app_currency_format.dart';
import '../../../../core/formatting/br_phone_format.dart';
import '../../../../core/profiles/app_user_profile.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/validation/cpf_cnpj.dart';
import '../../data/arena_class_enrollment_repository.dart';
import '../../data/arena_class_repository.dart';
import '../../domain/arena_schedule_providers.dart';
import '../../domain/aulas/arena_class.dart';
import '../../domain/aulas/arena_class_billing_logic.dart';
import '../../domain/aulas/arena_class_enrollment.dart';
import '../../domain/aulas/arena_class_enrollment_providers.dart';
import '../../domain/aulas/arena_class_logic.dart';
import '../../domain/aulas/arena_class_providers.dart';
import '../../domain/aulas/arena_class_session.dart';
import '../widgets/arena_async_state.dart';
import 'widgets/arena_class_atoms.dart';
import 'widgets/arena_class_contact.dart';
import 'widgets/arena_class_form_atoms.dart';

/// Aluno já conhecido ao abrir a matrícula (vindo da página do aluno).
class ArenaClassEnrollSeed {
  const ArenaClassEnrollSeed({
    this.athleteId,
    this.studentId,
    required this.name,
    this.phone,
    this.photoUrl,
  });

  final String? athleteId;

  /// Doc existente em `classStudents` (aluno sem conta da fase 1).
  final String? studentId;
  final String name;
  final String? phone;
  final String? photoUrl;
}

/// Nova matrícula (A8–A12): aluno → plano → horários → pagamento →
/// confirmação. Prévia com `previewArenaClassEnrollment`, grava com
/// `createArenaClassEnrollment`.
///
/// Com a regra `onlineBillingEnabled`, o pagamento escolhe Online (padrão:
/// fatura Asaas, PIX ou cartão, com CPF de quem paga) ou Manual (a cobrança
/// fica em aberto em Mensalidades e a arena registra ao receber).
class ArenaClassEnrollPage extends ConsumerStatefulWidget {
  const ArenaClassEnrollPage({super.key, this.seed});

  final ArenaClassEnrollSeed? seed;

  @override
  ConsumerState<ArenaClassEnrollPage> createState() =>
      _ArenaClassEnrollPageState();
}

class _ArenaClassEnrollPageState extends ConsumerState<ArenaClassEnrollPage> {
  int _step = 1;

  // Passo 1 — aluno.
  ArenaClassEnrollSeed? _seed;
  AppUserProfile? _athlete;
  bool _guest = false;
  final _guestName = TextEditingController();
  final _phone = TextEditingController();

  /// Telefone que veio do cadastro do atleta (`null` = o campo é da arena).
  String? _accountPhone;
  int _contactRequest = 0;

  // Passo 2 — plano.
  String? _planId;

  // Passo 3 — horários.
  final Set<ArenaClassEnrollmentSlot> _slots = {};
  String? _slotHint;

  // Passo 4 — pagamento.
  ArenaClassPaymentMethod _method = ArenaClassPaymentMethod.pix;

  /// Online ou Manual; `null` = o padrão da regra (online quando ligada).
  ArenaClassBillingMode? _billingMode;

  /// CPF/CNPJ de quem paga a fatura online.
  final _cpf = TextEditingController();
  int? _dueDay;
  bool _waiveFee = false;
  ArenaClassEnrollmentPreview? _preview;
  String? _previewError;
  bool _previewLoading = false;
  int _previewRequest = 0;

  bool _submitting = false;
  String? _error;

  // Confirmação.
  ArenaClassEnrollmentCreated? _created;

  @override
  void initState() {
    super.initState();
    _applySeed(widget.seed);
    final athleteId = widget.seed?.athleteId;
    if (athleteId != null && _phone.text.isEmpty) {
      // Vindo da ficha do aluno o id da arena pode ainda estar carregando.
      var asked = false;
      ref.listenManual<AsyncValue<String?>>(
        managedArenaIdProvider,
        (_, next) {
          if (asked || (next.valueOrNull ?? '').isEmpty) return;
          asked = true;
          if (_seed?.athleteId == athleteId) _fillAccountPhone(athleteId);
        },
        fireImmediately: true,
      );
    }
  }

  void _applySeed(ArenaClassEnrollSeed? seed) {
    _seed = seed;
    if (seed?.phone != null) {
      _phone.text = formatPhoneBrDisplay(seed!.phone) ?? seed.phone!;
    }
  }

  bool get _phoneFromAccount =>
      _accountPhone != null && _phone.text == _accountPhone;

  /// Preenche o telefone com o do cadastro do atleta (`null` = nenhum atleta,
  /// ou "Sem conta"). O que veio do cadastro de outro atleta sai; o que a
  /// arena digitou fica. Sem resposta o campo fica para digitar — e a
  /// matrícula com telefone em branco usa o do cadastro no servidor.
  Future<void> _fillAccountPhone(String? athleteId) async {
    final request = ++_contactRequest;
    if (_phoneFromAccount) _phone.clear();
    _accountPhone = null;
    final arenaId = ref.read(managedArenaIdProvider).valueOrNull ?? '';
    if (athleteId == null || arenaId.isEmpty || _phone.text.trim().isNotEmpty) {
      return;
    }
    try {
      final raw = await ref
          .read(arenaClassEnrollmentRepositoryProvider)
          .fetchAthleteContactPhone(arenaId: arenaId, athleteId: athleteId);
      final phone = arenaClassAccountPhone(raw);
      if (!mounted ||
          request != _contactRequest ||
          phone == null ||
          _phone.text.trim().isNotEmpty) {
        return;
      }
      setState(() {
        _phone.text = phone;
        _accountPhone = phone;
      });
    } catch (_) {
      // Segue sem pré-preenchimento.
    }
  }

  void _resetPhone() {
    _contactRequest++;
    _accountPhone = null;
    _phone.clear();
  }

  @override
  void dispose() {
    _guestName.dispose();
    _phone.dispose();
    _cpf.dispose();
    super.dispose();
  }

  // ---------------------------------------------------------------- aluno

  String? get _studentName {
    if (_seed != null) return _seed!.name;
    if (_athlete != null) return arenaClassAthleteName(_athlete!);
    final typed = _guestName.text.trim();
    return _guest && typed.length >= 2 ? typed : null;
  }

  String? get _athleteId => _seed?.athleteId ?? _athlete?.uid;

  String get _phoneDigits => _phone.text.replaceAll(RegExp(r'\D'), '');

  bool get _studentReady {
    if (_seed != null || _athlete != null) {
      return _phoneDigits.isEmpty || _phoneDigits.length >= 10;
    }
    return _guest && _studentName != null && _phoneDigits.length >= 10;
  }

  ArenaClassPlan? _plan(List<ArenaClassPlan> plans) =>
      plans.where((p) => p.id == _planId).firstOrNull;

  /// Com a regra desligada é sempre manual — mesmo que a escolha tenha sido
  /// online antes de a arena desligar.
  ArenaClassBillingMode _billingModeFor(ArenaClassRules rules) =>
      rules.onlineBillingEnabled
          ? _billingMode ?? ArenaClassBillingMode.asaas
          : ArenaClassBillingMode.manual;

  /// Atleta NexaGO: o servidor pode usar o CPF do cadastro.
  bool get _hasAccount => _athleteId != null;

  bool _cpfReady(ArenaClassRules rules) =>
      _billingModeFor(rules) != ArenaClassBillingMode.asaas ||
      arenaClassEnrollmentCpfOk(_cpf.text, hasAccount: _hasAccount);

  ArenaClassEnrollmentRequest? _request({
    required String arenaId,
    required ArenaClassRules rules,
  }) {
    final planId = _planId;
    if (planId == null || _slots.isEmpty) return null;
    final athleteId = _athleteId;
    final billingMode = _billingModeFor(rules);
    // Só vai CPF completo e válido: incompleto derrubaria a prévia.
    final cpf = billingMode == ArenaClassBillingMode.asaas &&
            CpfCnpjValidator.isValid(_cpf.text)
        ? CpfCnpjValidator.normalize(_cpf.text)
        : null;
    return ArenaClassEnrollmentRequest(
      arenaId: arenaId,
      planId: planId,
      slots: _slots.toList(),
      dueDay: _dueDay ?? rules.defaultDueDay,
      paymentMethod: _method,
      billingMode: billingMode,
      cpfCnpj: cpf,
      waiveFee: _waiveFee,
      athleteId: athleteId,
      studentId: athleteId == null ? _seed?.studentId : null,
      name: athleteId == null ? _studentName : null,
      phone: _phoneDigits.isEmpty ? null : _phoneDigits,
    );
  }

  Future<void> _loadPreview(ArenaClassEnrollmentRequest request) async {
    final id = ++_previewRequest;
    setState(() {
      _previewLoading = true;
      _previewError = null;
    });
    try {
      final preview = await ref
          .read(arenaClassEnrollmentRepositoryProvider)
          .previewEnrollment(request);
      if (!mounted || id != _previewRequest) return;
      setState(() {
        _preview = preview;
        _previewLoading = false;
      });
    } on ArenaClassException catch (e) {
      if (!mounted || id != _previewRequest) return;
      setState(() {
        _preview = null;
        _previewError = e.message;
        _previewLoading = false;
      });
    } catch (_) {
      if (!mounted || id != _previewRequest) return;
      setState(() {
        _preview = null;
        _previewError = 'Não foi possível calcular a cobrança. Tente de novo.';
        _previewLoading = false;
      });
    }
  }

  Future<void> _submit(ArenaClassEnrollmentRequest request) async {
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final created = await ref
          .read(arenaClassEnrollmentRepositoryProvider)
          .createEnrollment(request);
      if (!mounted) return;
      setState(() {
        _created = created;
        _submitting = false;
      });
    } on ArenaClassException catch (e) {
      if (!mounted) return;
      setState(() {
        _submitting = false;
        _error = e.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _submitting = false;
        _error = 'Não foi possível matricular. Tente novamente.';
      });
    }
  }

  void _restart() {
    setState(() {
      _step = 1;
      _applySeed(null);
      _athlete = null;
      _guest = false;
      _guestName.clear();
      _resetPhone();
      _planId = null;
      _slots.clear();
      _slotHint = null;
      _method = ArenaClassPaymentMethod.pix;
      _billingMode = null;
      _cpf.clear();
      _dueDay = null;
      _waiveFee = false;
      _preview = null;
      _previewError = null;
      _error = null;
      _created = null;
    });
  }

  void _back() {
    if (_step > 1 && _created == null && !_submitting) {
      setState(() {
        _step -= 1;
        _error = null;
      });
    } else {
      context.pop();
    }
  }

  // ---------------------------------------------------------------- build

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final arenaId = ref.watch(managedArenaIdProvider).valueOrNull ?? '';
    final rules = ref.watch(arenaClassRulesProvider).valueOrNull ??
        ArenaClassRules.defaults;
    final plansAsync = ref.watch(arenaClassPlansProvider);
    final plans = arenaClassEnrollablePlans(plansAsync.valueOrNull ?? const []);
    final classes = ref.watch(managedArenaClassesProvider).valueOrNull ??
        const <ArenaClass>[];
    final plan = _plan(plans);
    final todayKey = ref.watch(arenaClassTodayKeyProvider);

    final created = _created;
    if (created != null) {
      return _ConfirmationView(
        created: created,
        studentName: _studentName ?? 'Aluno',
        athleteId: _athleteId,
        arenaId: arenaId,
        // O servidor devolve o telefone gravado (o do cadastro quando o
        // campo foi em branco).
        phone: created.phone ?? (_phoneDigits.isEmpty ? null : _phoneDigits),
        plan: plan,
        slots: _slots.toList(),
        classes: classes,
        totalReais: _preview?.totalReais,
        method: _method,
        todayKey: todayKey,
        arenaName: ref.watch(managedArenaDetailProvider).valueOrNull?.name,
        onNew: _restart,
      );
    }

    final request = _request(arenaId: arenaId, rules: rules);
    final (title, body, canContinue) = switch (_step) {
      1 => ('Quem é o aluno?', _studentStep(context), _studentReady),
      2 => ('Qual plano?', _planStep(context, plansAsync, plans), plan != null),
      3 => (
          arenaClassSlotsTitle(plan),
          _slotsStep(context, arenaId, classes, plan),
          plan != null && _slotsValid(plan),
        ),
      _ => (
          'Pagamento',
          _paymentStep(context, plan, rules),
          request != null &&
              _preview != null &&
              !_previewLoading &&
              _previewError == null &&
              _cpfReady(rules),
        ),
    };

    return PopScope(
      canPop: _step == 1 || _created != null,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _back();
      },
      child: Scaffold(
        backgroundColor: colors.canvas,
        body: SafeArea(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              ArenaClassHeader(
                eyebrow: 'AULAS',
                title: 'Nova matrícula',
                subtitle: 'PASSO $_step DE 4',
                onBack: _back,
              ),
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                  children: [
                    ArenaClassStepBar(step: _step),
                    const SizedBox(height: 16),
                    Text(
                      title,
                      style: AppTypography.soraRegular(
                        fontSize: 22,
                        fontWeight: FontWeight.w800,
                        letterSpacing: -0.6,
                        color: colors.onSurface,
                      ),
                    ),
                    const SizedBox(height: 14),
                    body,
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
                decoration: BoxDecoration(
                  color: colors.canvas,
                  border: Border(
                    top: BorderSide(
                      color: colors.onSurface.withValues(alpha: 0.06),
                    ),
                  ),
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
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
                      const SizedBox(height: 8),
                    ],
                    ArenaClassPrimaryButton(
                      label: _step == 4 ? 'Matricular' : 'Continuar',
                      busy: _submitting,
                      onPressed: !canContinue
                          ? null
                          : () {
                              if (_step < 4) {
                                setState(() {
                                  _step += 1;
                                  _error = null;
                                });
                                if (_step == 4) {
                                  final r = _request(
                                    arenaId: arenaId,
                                    rules: rules,
                                  );
                                  if (r != null) _loadPreview(r);
                                }
                              } else if (request != null) {
                                _submit(request);
                              }
                            },
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  // ----------------------------------------------------------- passo 1

  Widget _studentStep(BuildContext context) {
    final colors = context.themeColors;
    final seed = _seed;
    final phoneField = TextField(
      controller: _phone,
      keyboardType: TextInputType.phone,
      inputFormatters: [BrPhoneInputFormatter()],
      onChanged: (_) => setState(() {}),
      style: TextStyle(fontSize: 14, color: colors.onSurface),
      decoration: arenaClassInputDecoration(
        context,
        hint: _guest && seed == null && _athlete == null
            ? 'WhatsApp do aluno'
            : 'WhatsApp para cobrança (opcional)',
        icon: Icons.phone_outlined,
      ),
    );

    if (seed != null || _athlete != null) {
      final name = _studentName!;
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          ArenaClassChoiceCard(
            title: name,
            subtitle: _athleteId != null ? 'Atleta NexaGO' : 'Aluno sem conta',
            selected: true,
            onTap: null,
            trailing: ArenaClassAvatar(
              initials: arenaClassInitials(name),
              photoUrl: seed?.photoUrl ?? _athlete?.profilePhotoUrl,
              size: 32,
              zoomName: name,
            ),
          ),
          const SizedBox(height: 10),
          phoneField,
          const SizedBox(height: 6),
          Text(
            _phoneFromAccount
                ? 'Telefone do cadastro do atleta no NexaGO — confira antes '
                    'de cobrar.'
                : 'Usado no "Cobrar" das mensalidades.',
            style: TextStyle(fontSize: 11.5, color: colors.onSurfaceMuted),
          ),
          const SizedBox(height: 10),
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              onPressed: () => setState(() {
                // O telefone do aluno da ficha é dele; o do atleta buscado
                // sai só se veio do cadastro.
                if (_seed != null) {
                  _resetPhone();
                } else {
                  _fillAccountPhone(null);
                }
                _seed = null;
                _athlete = null;
              }),
              icon: const Icon(Icons.swap_horiz_rounded, size: 16),
              label: const Text('Trocar aluno'),
            ),
          ),
        ],
      );
    }

    if (_guest) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextField(
            controller: _guestName,
            autofocus: true,
            maxLength: 80,
            textCapitalization: TextCapitalization.words,
            onChanged: (_) => setState(() {}),
            style: TextStyle(fontSize: 14, color: colors.onSurface),
            decoration: arenaClassInputDecoration(
              context,
              hint: 'Nome completo do aluno',
              icon: Icons.person_outline_rounded,
            ),
          ),
          const SizedBox(height: 8),
          phoneField,
          const SizedBox(height: 6),
          Text(
            'Sem conta NexaGO o aluno não recebe aviso no app — a arena fala '
            'com ele pelo WhatsApp.',
            style: TextStyle(
              fontSize: 11.5,
              height: 1.4,
              color: colors.onSurfaceMuted,
            ),
          ),
          const SizedBox(height: 10),
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              onPressed: () => setState(() => _guest = false),
              icon: const Icon(Icons.search_rounded, size: 16),
              label: const Text('Buscar atleta NexaGO'),
            ),
          ),
        ],
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ArenaClassAthleteSearch(
          selectedUid: _athlete?.uid,
          autofocus: true,
          onSelect: (u) {
            setState(() => _athlete = u);
            _fillAccountPhone(u.uid);
          },
        ),
        const SizedBox(height: 12),
        ArenaClassGhostButton(
          label: 'Cadastrar aluno sem conta',
          icon: Icons.add_rounded,
          height: 44,
          onPressed: () => setState(() {
            // O número do cadastro é do atleta — não vira o do sem conta.
            _fillAccountPhone(null);
            _guest = true;
          }),
        ),
      ],
    );
  }

  // ----------------------------------------------------------- passo 2

  Widget _planStep(
    BuildContext context,
    AsyncValue<List<ArenaClassPlan>> plansAsync,
    List<ArenaClassPlan> plans,
  ) {
    final colors = context.themeColors;
    if (plansAsync.isLoading && !plansAsync.hasValue) {
      return const ArenaLoadingState(label: 'Carregando planos...');
    }
    if (plans.isEmpty) {
      return const ArenaEmptyState(
        title: 'Nenhum plano ativo',
        message: 'Crie os planos mensais e pacotes no portal da arena '
            '(Aulas › Planos).',
        icon: Icons.sell_outlined,
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final p in plans) ...[
          ArenaClassChoiceCard(
            title: p.name,
            subtitle: arenaClassPlanDetail(p),
            selected: p.id == _planId,
            onTap: () => setState(() {
              if (_planId != p.id) _slotHint = null;
              _planId = p.id;
            }),
            trailing: Text(
              arenaClassPlanPrice(p),
              style: AppTypography.soraRegular(
                fontSize: 14,
                fontWeight: FontWeight.w800,
                color: p.id == _planId ? AppColors.brand : colors.onSurface,
              ),
            ),
          ),
          const SizedBox(height: 8),
        ],
      ],
    );
  }

  // ----------------------------------------------------------- passo 3

  bool _slotsValid(ArenaClassPlan plan) {
    final need = arenaClassSlotsRequired(plan);
    return _slots.length >= need.min && _slots.length <= need.max;
  }

  Widget _slotsStep(
    BuildContext context,
    String arenaId,
    List<ArenaClass> classes,
    ArenaClassPlan? plan,
  ) {
    final colors = context.themeColors;
    if (plan == null) return const SizedBox.shrink();
    final recurring = classes.where((c) => c.isActive && !c.isSingle).toList();
    final studentsByClass = <String, List<ArenaClassStudent>>{};
    var loading = false;
    for (final c in recurring) {
      final async = ref
          .watch(arenaClassStudentsProvider((arenaId: arenaId, classId: c.id)));
      if (!async.hasValue) loading = true;
      studentsByClass[c.id] = async.valueOrNull ?? const [];
    }
    final options = arenaClassSlotOptions(
      classes: recurring,
      studentsByClass: studentsByClass,
      excludeStudentId: _athleteId ?? _seed?.studentId,
    );
    final need = arenaClassSlotsRequired(plan);
    // Horário que sumiu (turma pausada/encerrada) não fica escolhido.
    _slots.retainWhere((s) => options.any((o) => o.slot == s));

    if (recurring.isEmpty) {
      return const ArenaEmptyState(
        title: 'Nenhuma turma ativa',
        message: 'Crie as turmas no portal da arena para matricular alunos.',
        icon: Icons.school_outlined,
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          plan.kind == ArenaClassPlanKind.monthly
              ? '${plan.name}: escolha ${need.min} horário'
                  '${need.min == 1 ? '' : 's'} fixo${need.min == 1 ? '' : 's'} '
                  '· ${_slots.length} de ${need.min}'
              : 'Pacote: escolha os horários em que o aluno vai fazer aula '
                  '· ${_slots.length} escolhido${_slots.length == 1 ? '' : 's'}',
          style: TextStyle(fontSize: 12.5, color: colors.onSurfaceMuted),
        ),
        // O aviso fica junto do contador: tocado no topo da lista, no fim
        // ele ficaria fora da tela.
        if (_slotHint != null) ...[
          const SizedBox(height: 6),
          Text(
            _slotHint!,
            style: TextStyle(
              color: colors.pending,
              fontSize: 12.5,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
        if (loading) ...[
          const SizedBox(height: 8),
          const LinearProgressIndicator(minHeight: 2),
        ],
        const SizedBox(height: 10),
        for (final o in options) ...[
          ArenaClassChoiceCard(
            multi: true,
            title: o.cls.name,
            subtitle: '${arenaClassWeekdayShort(o.weekday)} · '
                '${o.cls.startTime} · '
                '${o.cls.teacherName.split(' ').first} · ${o.cls.courtName}',
            selected: _slots.contains(o.slot),
            dimmed: o.isFull && !_slots.contains(o.slot),
            onTap: () => _toggleSlot(o, need.max),
            trailing: Text(
              o.isFull ? 'Lotada' : '${o.free} vaga${o.free == 1 ? '' : 's'}',
              style: AppTypography.mono(
                fontSize: 10.5,
                fontWeight: FontWeight.w700,
                color: o.isFull ? colors.live : colors.win,
              ),
            ),
          ),
          const SizedBox(height: 8),
        ],
        Text(
          'Turma lotada nesse dia? A lista de espera fica no portal da arena.',
          style: TextStyle(
            fontSize: 12,
            height: 1.45,
            color: colors.onSurfaceMuted,
          ),
        ),
      ],
    );
  }

  void _toggleSlot(ArenaClassSlotOption o, int max) {
    setState(() {
      if (_slots.remove(o.slot)) {
        _slotHint = null;
        return;
      }
      if (_slots.length >= max) {
        _slotHint = max == 1
            ? 'Este plano tem 1 aula por semana — desmarque o horário atual '
                'para trocar.'
            : 'Este plano tem $max aulas por semana — desmarque um horário '
                'para trocar.';
        return;
      }
      _slotHint = null;
      _slots.add(o.slot);
    });
  }

  // ----------------------------------------------------------- passo 4

  Widget _paymentStep(
    BuildContext context,
    ArenaClassPlan? plan,
    ArenaClassRules rules,
  ) {
    final colors = context.themeColors;
    final arenaId = ref.read(managedArenaIdProvider).valueOrNull ?? '';
    final monthly = plan?.kind == ArenaClassPlanKind.monthly;
    final dueDay = _dueDay ?? rules.defaultDueDay;
    final preview = _preview;
    final online = _billingModeFor(rules) == ArenaClassBillingMode.asaas;

    void refresh() {
      final r = _request(arenaId: arenaId, rules: rules);
      if (r != null) _loadPreview(r);
    }

    void setMode(ArenaClassBillingMode mode) {
      if (mode == _billingModeFor(rules)) return;
      setState(() => _billingMode = mode);
      // O servidor confere a regra na prévia: refaz com o modo novo.
      refresh();
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (rules.onlineBillingEnabled) ...[
          const ArenaClassKicker('Como cobrar'),
          const SizedBox(height: 8),
          ArenaClassChoiceCard(
            title: 'Online',
            subtitle: 'PIX ou cartão pelo link · baixa automática',
            selected: online,
            onTap: () => setMode(ArenaClassBillingMode.asaas),
          ),
          const SizedBox(height: 8),
          ArenaClassChoiceCard(
            title: 'Manual',
            subtitle: 'Você registra ao receber',
            selected: !online,
            onTap: () => setMode(ArenaClassBillingMode.manual),
          ),
          const SizedBox(height: 16),
        ],
        if (online)
          _PayerCpfField(
            controller: _cpf,
            hasAccount: _hasAccount,
            onChanged: () => setState(() {}),
          )
        else ...[
          const ArenaClassKicker('Como o aluno paga'),
          for (final m in ArenaClassPaymentMethod.values) ...[
            const SizedBox(height: 8),
            ArenaClassChoiceCard(
              title: m.label,
              subtitle: switch (m) {
                ArenaClassPaymentMethod.pix => 'Chave PIX da arena',
                ArenaClassPaymentMethod.cash => 'Na recepção',
                ArenaClassPaymentMethod.cardMachine =>
                  'Débito ou crédito no balcão',
                ArenaClassPaymentMethod.transfer =>
                  'TED/DOC para a conta da arena',
              },
              selected: m == _method,
              onTap: () => setState(() => _method = m),
            ),
          ],
        ],
        if (monthly) ...[
          const SizedBox(height: 16),
          const ArenaClassKicker('Vencimento da mensalidade'),
          const SizedBox(height: 8),
          ArenaClassPanel(
            padding: const EdgeInsets.fromLTRB(14, 6, 6, 6),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    'Todo dia $dueDay',
                    style: AppTypography.soraRegular(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: colors.onSurface,
                    ),
                  ),
                ),
                IconButton(
                  tooltip: 'Dia anterior',
                  onPressed: dueDay > 1
                      ? () => setState(() => _dueDay = dueDay - 1)
                      : null,
                  icon: const Icon(Icons.remove_rounded),
                ),
                IconButton(
                  tooltip: 'Próximo dia',
                  onPressed: dueDay < 28
                      ? () => setState(() => _dueDay = dueDay + 1)
                      : null,
                  icon: const Icon(Icons.add_rounded),
                ),
              ],
            ),
          ),
        ],
        if (rules.enrollmentFeeReais > 0) ...[
          const SizedBox(height: 12),
          ArenaClassPanel(
            padding: const EdgeInsets.fromLTRB(14, 6, 6, 6),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    'Dispensar taxa de matrícula '
                    '(${formatBRL(rules.enrollmentFeeReais)})',
                    style: AppTypography.soraRegular(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: colors.onSurface,
                    ),
                  ),
                ),
                Switch.adaptive(
                  value: _waiveFee,
                  activeTrackColor: AppColors.brand,
                  onChanged: (v) {
                    setState(() => _waiveFee = v);
                    refresh();
                  },
                ),
              ],
            ),
          ),
        ],
        const SizedBox(height: 16),
        ArenaClassPanel(
          child: _previewLoading
              ? const Padding(
                  padding: EdgeInsets.symmetric(vertical: 16),
                  child: Center(child: CircularProgressIndicator()),
                )
              : _previewError != null || preview == null
                  ? Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text(
                          _previewError ?? 'Calculando a cobrança...',
                          style: TextStyle(
                            color: colors.live,
                            fontWeight: FontWeight.w600,
                            fontSize: 12.5,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Align(
                          alignment: Alignment.centerLeft,
                          child: TextButton(
                            onPressed: refresh,
                            child: const Text('Tentar de novo'),
                          ),
                        ),
                      ],
                    )
                  : _PreviewSummary(
                      plan: plan,
                      preview: preview,
                      waived: _waiveFee && rules.enrollmentFeeReais > 0,
                      dueDay: monthly ? dueDay : null,
                    ),
        ),
        const SizedBox(height: 10),
        Text(
          online
              ? 'Cada mensalidade vira uma fatura (PIX ou cartão). O link vai '
                  'no "Cobrar" e por push para quem tem conta; o valor cai no '
                  'caixa da arena com a taxa do pagamento online.'
              : 'A cobrança fica em aberto em Mensalidades. Quando o aluno '
                  'pagar direto à arena, registre o pagamento por lá.',
          style: TextStyle(
            fontSize: 11.5,
            height: 1.45,
            color: colors.onSurfaceMuted,
          ),
        ),
      ],
    );
  }
}

/// CPF/CNPJ de quem paga a fatura online. Opcional para atleta com conta (o
/// servidor usa o do cadastro); o que for digitado fica só no servidor.
class _PayerCpfField extends StatelessWidget {
  const _PayerCpfField({
    required this.controller,
    required this.hasAccount,
    required this.onChanged,
  });

  final TextEditingController controller;
  final bool hasAccount;
  final VoidCallback onChanged;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final text = controller.text;
    final error = CpfCnpjValidator.hasCompleteLength(text)
        ? CpfCnpjValidator.validationMessage(text)
        : null;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ArenaClassKicker(
          hasAccount ? 'CPF de quem paga · opcional' : 'CPF de quem paga',
        ),
        const SizedBox(height: 8),
        TextField(
          controller: controller,
          keyboardType: TextInputType.number,
          inputFormatters: [CpfCnpjInputFormatter()],
          onChanged: (_) => onChanged(),
          style: TextStyle(fontSize: 14, color: colors.onSurface),
          decoration: arenaClassInputDecoration(
            context,
            hint: hasAccount
                ? 'Vazio = CPF do cadastro NexaGO'
                : '000.000.000-00',
            icon: Icons.badge_outlined,
          ),
        ),
        if (error != null) ...[
          const SizedBox(height: 6),
          Text(
            error,
            style: TextStyle(
              color: colors.live,
              fontWeight: FontWeight.w600,
              fontSize: 12,
            ),
          ),
        ],
        const SizedBox(height: 6),
        Text(
          'O CPF fica guardado só no servidor, para emitir a fatura — não '
          'aparece na tela nem no cadastro do atleta.',
          style: TextStyle(
            fontSize: 11.5,
            height: 1.4,
            color: colors.onSurfaceMuted,
          ),
        ),
      ],
    );
  }
}

class _PreviewSummary extends StatelessWidget {
  const _PreviewSummary({
    required this.plan,
    required this.preview,
    required this.waived,
    required this.dueDay,
  });

  final ArenaClassPlan? plan;
  final ArenaClassEnrollmentPreview preview;
  final bool waived;
  final int? dueDay;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    Widget line(String k, String v, {Color? color}) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 5),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(
                  k,
                  style:
                      TextStyle(fontSize: 12.5, color: colors.onSurfaceMuted),
                ),
              ),
              const SizedBox(width: 10),
              Text(
                v,
                style: AppTypography.mono(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w700,
                  color: color ?? colors.onSurface,
                ),
              ),
            ],
          ),
        );
    final p = plan;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (p != null) line(p.name, arenaClassPlanPrice(p)),
        for (final c in preview.charges)
          line(c.description, formatBRL(c.amountReais)),
        if (waived) line('Taxa de matrícula', 'Isenta', color: colors.win),
        Container(
          margin: const EdgeInsets.only(top: 8),
          padding: const EdgeInsets.only(top: 10),
          decoration: BoxDecoration(
            border: Border(
              top: BorderSide(
                color: colors.onSurfaceMuted.withValues(alpha: 0.15),
              ),
            ),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Expanded(
                child: Text(
                  'Cobrar hoje',
                  style: AppTypography.soraRegular(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: colors.onSurface,
                  ),
                ),
              ),
              Text(
                formatBRL(preview.totalReais),
                style: AppTypography.soraRegular(
                  fontSize: 22,
                  fontWeight: FontWeight.w800,
                  color: AppColors.brand,
                ),
              ),
            ],
          ),
        ),
        if (dueDay != null) ...[
          const SizedBox(height: 6),
          Text(
            'As próximas mensalidades saem sozinhas, vencendo todo dia '
            '$dueDay.',
            style: TextStyle(fontSize: 11.5, color: colors.onSurfaceMuted),
          ),
        ],
      ],
    );
  }
}

/// Confirmação (A12): resumo e próximos passos. Manual: "Cobrar por
/// mensagem" (chat do app, aluno com conta) ou "Cobrar no WhatsApp" (sem
/// conta) manda o valor e o pagamento é registrado em Mensalidades. Online:
/// escuta as mensalidades do aluno até o worker gravar o link da 1ª fatura e
/// então mostra "Copiar link" e a cobrança com o link.
class _ConfirmationView extends ConsumerWidget {
  const _ConfirmationView({
    required this.created,
    required this.studentName,
    required this.athleteId,
    required this.arenaId,
    required this.phone,
    required this.plan,
    required this.slots,
    required this.classes,
    required this.totalReais,
    required this.method,
    required this.todayKey,
    required this.arenaName,
    required this.onNew,
  });

  final ArenaClassEnrollmentCreated created;
  final String studentName;

  /// Conta NexaGO do aluno: com ela, a cobrança vai pelo chat do app.
  final String? athleteId;
  final String arenaId;
  final String? phone;
  final ArenaClassPlan? plan;
  final List<ArenaClassEnrollmentSlot> slots;
  final List<ArenaClass> classes;
  final double? totalReais;
  final ArenaClassPaymentMethod method;
  final String todayKey;
  final String? arenaName;
  final VoidCallback onNew;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final groupId = created.asaasGroupId;
    final online = groupId != null;
    final groupCharge = groupId == null
        ? null
        : arenaClassGroupCharge(
            ref
                    .watch(arenaClassStudentChargesProvider(created.studentId))
                    .valueOrNull ??
                const <ArenaClassCharge>[],
            groupId,
          );
    final invoiceUrl =
        groupCharge == null ? null : arenaClassChargeInvoiceUrl(groupCharge);
    final onlineStatus =
        groupCharge == null ? null : arenaClassOnlineChargeStatus(groupCharge);
    // O aluno pagou com a tela aberta: o webhook grava e o listener mostra.
    final paidOnline = groupCharge?.isPaidOnline ?? false;
    // Mensalidade ainda não chegou, ou o worker ainda não gravou o link.
    final generating = groupCharge == null ||
        switch (groupCharge.asaas?.state) {
          ArenaClassAsaasState.pending ||
          ArenaClassAsaasState.creating ||
          ArenaClassAsaasState.voiding =>
            true,
          _ => false,
        };
    final byId = {for (final c in classes) c.id: c};
    final named = [
      for (final s in slots)
        ArenaClassEnrollmentSlot(
          classId: s.classId,
          weekday: s.weekday,
          className: byId[s.classId]?.name ?? 'Turma',
          startTime: byId[s.classId]?.startTime ?? '',
        ),
    ];
    final classNames = {for (final s in named) s.className}.join(', ');
    final teachers = {
      for (final s in named)
        if (byId[s.classId] != null) byId[s.classId]!.teacherName,
    }.join(', ');
    final now = TimeOfDay.now();
    final first = arenaClassFirstLesson(
      named,
      todayKey,
      nowHm: '${now.hour.toString().padLeft(2, '0')}:'
          '${now.minute.toString().padLeft(2, '0')}',
    );
    final total = totalReais ?? 0;
    // Com conta, a cobrança vai pelo chat do app; sem, pelo WhatsApp.
    final hasChat = arenaClassStudentHasChat(athleteId);
    // Online: a cobrança só sai depois do link — a mensagem leva o link.
    final canCharge = (hasChat || phone != null) &&
        total > 0 &&
        plan != null &&
        (!online || invoiceUrl != null);
    final who = arenaClassFirstName(studentName);

    return Scaffold(
      backgroundColor: colors.canvas,
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(24, 56, 24, 24),
          children: [
            Center(
              child: Container(
                width: 84,
                height: 84,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: AppColors.win.withValues(alpha: 0.12),
                  border: Border.all(
                    color: AppColors.win.withValues(alpha: 0.35),
                  ),
                ),
                child: Icon(
                  Icons.check_rounded,
                  size: 40,
                  color: colors.win,
                ),
              ),
            ),
            const SizedBox(height: 22),
            Text(
              'Matrícula feita',
              textAlign: TextAlign.center,
              style: AppTypography.soraRegular(
                fontSize: 26,
                fontWeight: FontWeight.w800,
                letterSpacing: -0.8,
                color: colors.onSurface,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              total <= 0
                  ? '$who já entra na chamada dos dias escolhidos.'
                  : online
                      ? '$who já entra na chamada dos dias escolhidos. A '
                          'cobrança de hoje vai por link: o aluno paga com PIX '
                          'ou cartão e a baixa é automática.'
                      : '$who já entra na chamada dos dias escolhidos. A '
                          'cobrança de hoje ficou em aberto em Mensalidades — '
                          'registre quando receber.',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 14,
                height: 1.5,
                color: colors.onSurfaceMuted,
              ),
            ),
            const SizedBox(height: 26),
            ArenaClassPanel(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  ArenaClassInfoRow(label: 'Aluno', value: studentName),
                  if (plan != null)
                    ArenaClassInfoRow(label: 'Plano', value: plan!.name),
                  ArenaClassInfoRow(
                    label: 'Turma${named.length > 1 ? 's' : ''}',
                    value: classNames,
                  ),
                  ArenaClassInfoRow(
                    label: 'Horários',
                    value: arenaClassSlotsLabel(named),
                  ),
                  if (teachers.isNotEmpty)
                    ArenaClassInfoRow(label: 'Professor', value: teachers),
                  if (first != null)
                    ArenaClassInfoRow(
                      label: '1ª aula',
                      value: '${arenaClassWeekdayDate(first.date)}'
                          '${first.slot.startTime.isEmpty ? '' : ' · ${first.slot.startTime}'}',
                    ),
                  ArenaClassInfoRow(
                    label: 'Pagamento',
                    value: total <= 0
                        ? 'Nada a cobrar hoje'
                        : paidOnline
                            ? '${onlineStatus?.label ?? 'Pago online'} · '
                                '${formatBRL(total)}'
                            : online
                                ? 'Online · ${formatBRL(total)}'
                                : 'Em aberto · ${formatBRL(total)}',
                    valueColor: total > 0 && !paidOnline
                        ? AppColors.pending
                        : AppColors.win,
                  ),
                ],
              ),
            ),
            const SizedBox(height: 26),
            if (online && invoiceUrl == null && !paidOnline) ...[
              _InvoicePending(
                label: generating
                    ? 'Gerando o link de pagamento…'
                    : onlineStatus?.label ?? 'Cobrança manual',
                busy: generating,
              ),
              const SizedBox(height: 12),
            ],
            if (canCharge) ...[
              ArenaClassPrimaryButton(
                key: const Key('arena-class-enroll-charge'),
                label: hasChat ? 'Cobrar por mensagem' : 'Cobrar no WhatsApp',
                icon: hasChat
                    ? Icons.forum_outlined
                    : Icons.chat_bubble_outline_rounded,
                onPressed: () => contactArenaClassStudent(
                  context,
                  ref,
                  arenaId: arenaId,
                  athleteId: athleteId,
                  phone: phone,
                  message: arenaClassEnrollmentChargeMessage(
                    studentName: studentName,
                    planName: plan!.name,
                    totalReais: total,
                    method: method,
                    arenaName: arenaName,
                    invoiceUrl: invoiceUrl,
                  ),
                ),
              ),
              const SizedBox(height: 8),
            ],
            if (invoiceUrl != null) ...[
              ArenaClassGhostButton(
                label: 'Copiar link',
                icon: Icons.link_rounded,
                height: 50,
                onPressed: () => copyArenaClassInvoiceLink(context, invoiceUrl),
              ),
              const SizedBox(height: 8),
            ],
            SizedBox(
              height: 50,
              child: ArenaClassGhostButton(
                label: 'Ver aluno',
                height: 50,
                onPressed: () => context.pushReplacementNamed(
                  AppRouteNames.arenaClassStudent,
                  pathParameters: {'studentId': created.studentId},
                ),
              ),
            ),
            const SizedBox(height: 8),
            ArenaClassGhostButton(
              label: 'Nova matrícula',
              height: 50,
              onPressed: onNew,
            ),
          ],
        ),
      ),
    );
  }
}

/// Enquanto o worker não grava o link da 1ª fatura (ou quando ele falha).
class _InvoicePending extends StatelessWidget {
  const _InvoicePending({required this.label, required this.busy});

  final String label;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return ArenaClassPanel(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      child: Row(
        children: [
          if (busy)
            const SizedBox.square(
              dimension: 16,
              child: CircularProgressIndicator(strokeWidth: 2),
            )
          else
            Icon(
              Icons.info_outline_rounded,
              size: 18,
              color: colors.pending,
            ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              label,
              style: TextStyle(
                fontSize: 12.5,
                height: 1.4,
                color: colors.onSurfaceMuted,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
