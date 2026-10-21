import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/formatting/app_currency_format.dart';
import '../../../../core/router/navigation_helpers.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../../core/ui/app_snackbar.dart';
import '../../../arena/domain/aulas/arena_class_logic.dart'
    show arenaClassWeekdayShort;
import '../../../arena/presentation/aulas/widgets/arena_class_form_atoms.dart';
import '../../../arenas/domain/arena_court.dart';
import '../../../professor_links/domain/arena_professor_link.dart';
import '../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../application/professor_own_classes_providers.dart';
import '../../domain/professor_own_classes.dart';
import '../../domain/professor_wallet_logic.dart';
import '../../infrastructure/professor_students_repository.dart'
    show ProfessorStudentsException;
import '../actions/professor_action_widgets.dart' show ProfessorActionHint;
import '../wallet/professor_wallet_widgets.dart';
import '../widgets/professor_students_widgets.dart';
import 'professor_own_class_widgets.dart';

/// Espera depois da última mudança antes de pedir a prévia ao servidor.
const Duration kProfessorOwnClassPreviewDebounce = Duration(milliseconds: 500);

/// B10 Nova turma própria (professor INDEPENDENTE com "Horário fixo"):
/// nome, dias, horário, vagas, quadra e mensalidade. Com tudo preenchido, a
/// prévia do servidor mostra o custo da reserva recorrente, a receita com a
/// turma cheia e as datas que já estão ocupadas.
class ProfessorOwnClassNewPage extends ConsumerStatefulWidget {
  const ProfessorOwnClassNewPage({super.key, this.arenaId});

  /// Arena já escolhida (com mais de uma liberada).
  final String? arenaId;

  @override
  ConsumerState<ProfessorOwnClassNewPage> createState() =>
      _ProfessorOwnClassNewPageState();
}

class _ProfessorOwnClassNewPageState
    extends ConsumerState<ProfessorOwnClassNewPage> {
  final _name = TextEditingController();
  final _price = TextEditingController();
  String? _arenaId;
  final Set<int> _weekdays = {};
  String? _start;
  String? _end;
  int _capacity = 4;
  String? _courtId;
  bool _saving = false;

  /// Arenas liberadas na última montagem (a prévia lê daqui).
  List<ArenaProfessorLink> _arenas = const [];

  Timer? _debounce;
  int _requestSeq = 0;
  ProfessorOwnClassInput? _previewFor;
  ProfessorOwnClassPreview? _preview;
  String? _previewError;
  bool _previewLoading = false;

  @override
  void initState() {
    super.initState();
    _arenaId = widget.arenaId;
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _name.dispose();
    _price.dispose();
    super.dispose();
  }

  String? get _effectiveArenaId {
    final picked = _arenaId;
    if (picked != null && _arenas.any((a) => a.arenaId == picked)) {
      return picked;
    }
    return _arenas.length == 1 ? _arenas.first.arenaId : null;
  }

  ArenaProfessorLink? get _arena {
    final id = _effectiveArenaId;
    for (final a in _arenas) {
      if (a.arenaId == id) return a;
    }
    return null;
  }

  double? get _priceValue => professorParseMoney(_price.text);

  String? get _blocker => professorOwnClassBlocker(
        arenaId: _effectiveArenaId,
        name: _name.text,
        weekdays: _weekdays.toList(),
        startTime: _start,
        endTime: _end,
        capacity: _capacity,
        courtId: _courtId,
        monthlyPriceReais: _priceValue,
        minPrice: kProfessorPriceMinReais,
        maxPrice: kProfessorPriceMaxReais,
      );

  ProfessorOwnClassInput? get _input => _blocker != null
      ? null
      : ProfessorOwnClassInput(
          arenaId: _effectiveArenaId!,
          courtId: _courtId!,
          name: _name.text.trim(),
          weekdays: _weekdays.toList()..sort(),
          startTime: _start!,
          endTime: _end!,
          capacity: _capacity,
          monthlyPriceReais: _priceValue!,
        );

  /// Muda o formulário e reagenda a prévia.
  void _update(VoidCallback change) {
    setState(change);
    _schedulePreview();
  }

  void _schedulePreview() {
    _debounce?.cancel();
    final input = _input;
    if (input == null) {
      if (_previewFor != null || _previewLoading || _previewError != null) {
        setState(() {
          _requestSeq++;
          _previewFor = null;
          _preview = null;
          _previewError = null;
          _previewLoading = false;
        });
      }
      return;
    }
    if (input == _previewFor && _preview != null) {
      // Voltou ao que já foi calculado: descarta o pedido em voo.
      if (_previewLoading || _previewError != null) {
        setState(() {
          _requestSeq++;
          _previewLoading = false;
          _previewError = null;
        });
      }
      return;
    }
    setState(() {
      _requestSeq++;
      _previewLoading = true;
      _previewError = null;
    });
    final seq = _requestSeq;
    _debounce = Timer(
      kProfessorOwnClassPreviewDebounce,
      () => _load(input, seq),
    );
  }

  Future<void> _load(ProfessorOwnClassInput input, int seq) async {
    try {
      final preview =
          await ref.read(professorOwnClassesRepositoryProvider).preview(input);
      if (!mounted || seq != _requestSeq) return;
      setState(() {
        _previewFor = input;
        _preview = preview;
        _previewLoading = false;
      });
    } catch (e) {
      if (!mounted || seq != _requestSeq) return;
      setState(() {
        _previewFor = null;
        _preview = null;
        _previewLoading = false;
        _previewError = e is ProfessorStudentsException
            ? e.message
            : 'Não foi possível calcular a reserva agora.';
      });
    }
  }

  Future<void> _pickArena() async {
    final id = await pickProfessorOwnClassArena(context, _arenas);
    if (id == null || !mounted || id == _effectiveArenaId) return;
    _update(() {
      _arenaId = id;
      _courtId = null;
    });
  }

  Future<void> _submit(
    ProfessorOwnClassInput input,
    ProfessorOwnClassPreview preview,
  ) async {
    if (preview.conflicts.isNotEmpty) {
      final dates = professorOwnClassConflictsLabel(preview.conflicts);
      final ok = await confirmProfessorWalletAction(
        context,
        title: 'Algumas datas ficam de fora',
        body: 'A quadra não está livre em $dates. Essas datas não serão '
            'reservadas; as demais, sim.',
        confirmLabel: 'Criar mesmo assim',
      );
      if (!ok || !mounted) return;
    }
    setState(() => _saving = true);
    try {
      final created =
          await ref.read(professorOwnClassesRepositoryProvider).create(input);
      if (!mounted) return;
      showAppSnackBar(context, professorOwnClassCreatedMessage(created));
      if (created.classId.isEmpty) {
        popOrGo(context, AppRoutes.professorClasses);
      } else {
        context.pushReplacementNamed(
          AppRouteNames.professorOwnClass,
          pathParameters: {'classId': created.classId},
        );
      }
    } catch (e) {
      if (!mounted) return;
      setState(() => _saving = false);
      showAppSnackBar(
        context,
        e is ProfessorStudentsException
            ? e.message
            : 'Não deu certo agora. Tente de novo.',
        isError: true,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final arenas = ref.watch(professorOwnClassArenasProvider);
    _arenas = arenas ?? const [];
    final arena = _arena;
    final arenaId = _effectiveArenaId;

    return ProfessorLinksScaffold(
      title: 'Nova turma própria',
      subtitle: arena == null
          ? 'INDEPENDENTE'
          : '${arena.arenaName.toUpperCase()} · INDEPENDENTE',
      onBack: () => popOrGo(context, AppRoutes.professorClasses),
      body: arenas == null
          ? const ProfessorWalletLoading()
          : arenas.isEmpty
              ? ListView(
                  padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
                  children: [
                    ProfessorLinksNote(
                      professorOwnClassLockedHint(
                        ref.watch(professorOwnClassLockedArenasProvider),
                      ),
                      key: const Key('professor-own-class-locked'),
                      tone: ProfessorLinksNoteTone.yellow,
                    ),
                  ],
                )
              : Column(
                  children: [
                    Expanded(child: _form(context, arena, arenaId)),
                    SafeArea(
                      top: false,
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
                        child: _footer(),
                      ),
                    ),
                  ],
                ),
    );
  }

  Widget _footer() {
    final input = _input;
    final preview = _preview;
    final ready = input != null &&
        preview != null &&
        input == _previewFor &&
        !_previewLoading;
    return ProfessorLinksPrimaryButton(
      key: const Key('professor-own-class-submit'),
      label: 'Criar turma e reservar quadras',
      loading: _saving,
      onPressed: ready ? () => _submit(input, preview) : null,
    );
  }

  Widget _form(
    BuildContext context,
    ArenaProfessorLink? arena,
    String? arenaId,
  ) {
    final colors = context.themeColors;
    final courtsAsync = arenaId == null
        ? const AsyncValue<List<ArenaCourt>>.data([])
        : ref.watch(professorOwnClassCourtsProvider(arenaId));
    final courts = courtsAsync.valueOrNull;
    final ends =
        _start == null ? const <String>[] : professorOwnClassEndTimes(_start!);
    final children = <Widget>[
      if (arena != null)
        ProfessorOwnClassCtx(
          key: const Key('professor-own-class-ctx'),
          arenaName: arena.arenaName,
          logoUrl: arena.arenaLogoUrl,
          onTap: _arenas.length > 1 ? _pickArena : null,
        )
      else
        ProfessorLinksGhostButton(
          key: const Key('professor-own-class-pick-arena'),
          label: 'Escolher a arena',
          onPressed: _pickArena,
        ),
      ProfessorWalletField(
        key: const Key('professor-own-class-name'),
        label: 'Nome da turma',
        hint: 'Ex.: Manhã Intermediário',
        controller: _name,
        maxLength: kProfessorOwnClassNameMax,
        textCapitalization: TextCapitalization.sentences,
        onChanged: (_) => _update(() {}),
      ),
      const ProfessorLinksKicker('Dias'),
      Row(
        children: [
          for (var d = 1; d <= 7; d++) ...[
            if (d > 1) const SizedBox(width: 6),
            Expanded(
              child: _DayChip(
                key: Key('professor-own-class-day-$d'),
                label: arenaClassWeekdayShort(d),
                selected: _weekdays.contains(d),
                onTap: () => _update(() {
                  if (!_weekdays.remove(d)) _weekdays.add(d);
                }),
              ),
            ),
          ],
        ],
      ),
      const ProfessorLinksKicker('Início'),
      _TimeStrip(
        keyPrefix: 'professor-own-class-start',
        options: kProfessorOwnClassStartTimes,
        selected: _start,
        onSelect: (t) => _update(() {
          _start = t;
          final options = professorOwnClassEndTimes(t);
          if (_end == null || !options.contains(_end)) {
            _end = options.isEmpty ? null : options.first;
          }
        }),
      ),
      if (_start != null) ...[
        const ProfessorLinksKicker('Fim'),
        _TimeStrip(
          keyPrefix: 'professor-own-class-end',
          options: ends,
          selected: _end,
          onSelect: (t) => _update(() => _end = t),
        ),
      ],
      _CapacityStepper(
        value: _capacity,
        onChanged: (v) => _update(() => _capacity = v),
      ),
      const ProfessorLinksKicker('Quadra'),
      if (arenaId == null)
        const ProfessorActionHint('Escolha a arena para ver as quadras.')
      else if (courts == null && courtsAsync.hasError)
        const ProfessorActionHint('Não foi possível carregar as quadras.')
      else if (courts == null)
        const ProfessorWalletLoading()
      else if (courts.isEmpty)
        const ProfessorActionHint('A arena não tem quadra disponível.')
      else
        Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            for (var i = 0; i < courts.length; i++) ...[
              if (i > 0) const SizedBox(height: 8),
              ArenaClassChoiceCard(
                key: Key('professor-own-class-court-${courts[i].id}'),
                title: courts[i].name,
                subtitle: courts[i].basePricePerHourReais == null
                    ? null
                    : '${professorOwnClassMoney(courts[i].basePricePerHourReais!)}/h',
                selected: _courtId == courts[i].id,
                onTap: () => _update(() => _courtId = courts[i].id),
              ),
            ],
          ],
        ),
      ProfessorWalletField(
        key: const Key('professor-own-class-price'),
        label: 'Mensalidade por aluno',
        hint: 'Ex.: 260',
        controller: _price,
        keyboardType: const TextInputType.numberWithOptions(decimal: true),
        onChanged: (_) => _update(() {}),
        trailing: Text(
          'SEU PREÇO',
          style: ProfessorLinksStyle.mono(
            10,
            color: ProfessorLinksStyle.dim(colors),
          ),
        ),
      ),
      ..._summary(),
      ProfessorLinksNote(
        'A reserva recorrente segue as regras da '
        '${arena?.arenaName ?? 'arena'}. Se a quadra não estiver livre em '
        'algum dia, você é avisado antes de confirmar.',
        key: const Key('professor-own-class-rule'),
        tone: ProfessorLinksNoteTone.blue,
      ),
    ];
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
      children: [
        for (var i = 0; i < children.length; i++) ...[
          if (i > 0) const SizedBox(height: 12),
          children[i],
        ],
      ],
    );
  }

  List<Widget> _summary() {
    final input = _input;
    if (input == null) {
      final reason = _blocker;
      final touched = _name.text.isNotEmpty ||
          _weekdays.isNotEmpty ||
          _start != null ||
          _courtId != null ||
          _price.text.isNotEmpty;
      return [
        if (touched && reason != null)
          ProfessorActionHint(reason,
              key: const Key('professor-own-class-blocker')),
      ];
    }
    final preview = _preview;
    if (_previewError != null) {
      return [
        ProfessorLinksNote(
          _previewError!,
          key: const Key('professor-own-class-preview-error'),
          tone: ProfessorLinksNoteTone.red,
        ),
      ];
    }
    if (preview == null || _previewLoading || input != _previewFor) {
      return [
        const Padding(
          key: Key('professor-own-class-preview-loading'),
          padding: EdgeInsets.symmetric(vertical: 12),
          child: Center(
            child: SizedBox.square(
              dimension: 20,
              child: CircularProgressIndicator(
                strokeWidth: 2.2,
                color: AppColors.brand,
              ),
            ),
          ),
        ),
      ];
    }
    return [
      ProfessorRowsBlock(
        key: const Key('professor-own-class-summary'),
        children: [
          ProfessorInfoRow(
            key: const Key('professor-own-class-court-cost'),
            label: 'Reserva recorrente',
            value: '− ${formatBRL(preview.courtMonthlyReais)}',
            valueColor: ProfessorLinksStyle.dim(context.themeColors),
            sub:
                '${professorOwnClassOccurrencesLabel(preview.occurrencesPerMonth)}'
                ' · ${preview.courtName}'
                ' · ${professorOwnClassMoney(preview.hourlyReais)}/h',
          ),
          ProfessorInfoRow(
            key: const Key('professor-own-class-revenue'),
            label: 'Receita com turma cheia',
            value: formatBRL(preview.revenueFullReais),
            sub: '${input.capacity} × '
                '${professorOwnClassMoney(input.monthlyPriceReais)}',
          ),
          ProfessorInfoRow(
            key: const Key('professor-own-class-net'),
            label: 'Líquido estimado',
            value: formatBRL(preview.netEstimateReais),
            valueColor: AppColors.win,
            last: true,
          ),
        ],
      ),
      if (preview.conflicts.isNotEmpty)
        ProfessorLinksNote(
          'A quadra já está ocupada em '
          '${professorOwnClassConflictsLabel(preview.conflicts)}. '
          '${preview.conflicts.length == 1 ? 'Essa data não será reservada' : 'Essas datas não serão reservadas'}'
          ' — as demais, sim.',
          key: const Key('professor-own-class-conflicts'),
          tone: ProfessorLinksNoteTone.yellow,
        ),
    ];
  }
}

/// Dia da semana (protótipo: 38 de altura, laranja quando ligado).
class _DayChip extends StatelessWidget {
  const _DayChip({
    super.key,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Semantics(
      button: true,
      selected: selected,
      child: Material(
        color: selected ? AppColors.brand : ProfessorLinksStyle.soft(colors),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(11),
          side: BorderSide(
            color: selected
                ? Colors.transparent
                : ProfessorLinksStyle.line(colors),
          ),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: SizedBox(
            height: 38,
            child: Center(
              child: Text(
                label,
                style: ProfessorLinksStyle.mono(
                  10.5,
                  color: selected
                      ? ProfessorLinksStyle.onBrand
                      : ProfessorLinksStyle.mute(colors),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Faixa rolável de horários (de meia em meia hora).
class _TimeStrip extends StatelessWidget {
  const _TimeStrip({
    required this.keyPrefix,
    required this.options,
    required this.selected,
    required this.onSelect,
  });

  final String keyPrefix;
  final List<String> options;
  final String? selected;
  final ValueChanged<String> onSelect;

  @override
  Widget build(BuildContext context) => SizedBox(
        height: 34,
        child: ListView(
          scrollDirection: Axis.horizontal,
          children: [
            for (final t in options) ...[
              ArenaClassChip(
                key: Key('$keyPrefix-$t'),
                label: t,
                selected: selected == t,
                onTap: () => onSelect(t),
              ),
              const SizedBox(width: 6),
            ],
          ],
        ),
      );
}

/// Vagas: − N +, de 1 a 30.
class _CapacityStepper extends StatelessWidget {
  const _CapacityStepper({required this.value, required this.onChanged});

  final int value;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    Widget button(IconData icon, String key, int? next) => IconButton(
          key: Key(key),
          onPressed: next == null ? null : () => onChanged(next),
          icon: Icon(icon, size: 18),
          style: IconButton.styleFrom(
            backgroundColor: ProfessorLinksStyle.soft(colors),
            side: BorderSide(color: ProfessorLinksStyle.line2(colors)),
          ),
        );
    return Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const ProfessorLinksKicker('Vagas'),
              const SizedBox(height: 2),
              Text(
                'Até $kProfessorOwnClassMaxCapacity alunos da sua carteira',
                style: AppTypography.bodyS.copyWith(
                  fontSize: 11.5,
                  color: ProfessorLinksStyle.dim(colors),
                ),
              ),
            ],
          ),
        ),
        button(
          Icons.remove_rounded,
          'professor-own-class-capacity-minus',
          value > 1 ? value - 1 : null,
        ),
        SizedBox(
          width: 40,
          child: Text(
            '$value',
            key: const Key('professor-own-class-capacity'),
            textAlign: TextAlign.center,
            style: ProfessorLinksStyle.display(17, color: colors.onSurface),
          ),
        ),
        button(
          Icons.add_rounded,
          'professor-own-class-capacity-plus',
          value < kProfessorOwnClassMaxCapacity ? value + 1 : null,
        ),
      ],
    );
  }
}
