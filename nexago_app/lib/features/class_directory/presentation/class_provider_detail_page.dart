import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/links/open_external_url.dart';
import '../../../core/router/navigation_helpers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/time/nexago_event_timezone.dart';
import '../../arena/domain/aulas/arena_class_logic.dart';
import '../../arena/presentation/aulas/widgets/arena_class_atoms.dart';
import '../../arenas/domain/arena_booking_success_actions.dart';
import '../../athlete_training/presentation/athlete_training_find_professor_page.dart'
    show openProfessorProfile;
import '../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../professor_mode/presentation/availability/availability_widgets.dart';
import '../../professor_mode/presentation/widgets/professor_students_widgets.dart'
    show ProfessorRetryCard;
import '../../tournaments/presentation/widgets/compete_hub/compete_hub_menu_card.dart'
    show CompeteHubArt;
import '../application/class_directory_providers.dart';
import '../domain/class_directory.dart';
import '../domain/class_directory_logic.dart';
import 'widgets/class_directory_widgets.dart';

/// Mensagem do WhatsApp ao local, com a turma escolhida quando houver.
String classDirectoryContactMessage(
  ClassProviderDetail d,
  DirectoryClass? c,
) {
  if (c == null) {
    return 'Olá! Vi as aulas de ${d.name} no NexaGO e quero saber mais.';
  }
  final days = c.weekdays.map(arenaClassWeekdayShort).join('/');
  final when = [days, c.startTime].where((s) => s.isNotEmpty).join(' ');
  return 'Olá! Vi no NexaGO a turma ${c.name}'
      '${when.isEmpty ? '' : ' ($when)'} de ${d.name}. '
      '${c.isFull ? 'Ela está lotada — dá para entrar na lista de espera?' : 'Quero saber como entrar.'}';
}

/// H4 (arena) e H5 (CT) · o local no detalhe: turmas por dia com ocupação,
/// planos, professores, onde fica e o contato. Sem matrícula pelo app — a
/// arena/CT matricula pelo painel depois do contato.
class ClassProviderDetailPage extends ConsumerStatefulWidget {
  const ClassProviderDetailPage({
    super.key,
    required this.kind,
    required this.id,
  });

  final ClassProviderKind kind;
  final String id;

  @override
  ConsumerState<ClassProviderDetailPage> createState() =>
      _ClassProviderDetailPageState();
}

class _ClassProviderDetailPageState
    extends ConsumerState<ClassProviderDetailPage> {
  int? _day;
  String? _program;
  String? _selectedClassId;

  ({ClassProviderKind kind, String id}) get _key =>
      (kind: widget.kind, id: widget.id);

  void _back() => popOrGo(context, AppRoutes.classDirectory);

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final async = ref.watch(classProviderDetailProvider(_key));
    final d = async.valueOrNull;

    if (d == null) {
      return Scaffold(
        backgroundColor: colors.canvas,
        body: SafeArea(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
                child: ProfessorLinksRoundButton(
                  icon: Icons.arrow_back_rounded,
                  semanticLabel: 'Voltar',
                  onTap: _back,
                ),
              ),
              Expanded(
                child: Center(
                  child: async.hasError
                      ? Padding(
                          padding: const EdgeInsets.all(20),
                          child: ProfessorRetryCard(
                            message: async.error is Exception
                                ? '${async.error}'
                                : 'Não foi possível carregar as aulas.',
                            onRetry: () => ref
                                .invalidate(classProviderDetailProvider(_key)),
                          ),
                        )
                      : const CircularProgressIndicator(
                          color: AppColors.brand,
                        ),
                ),
              ),
            ],
          ),
        ),
      );
    }

    final accent = colors.readableTone(classProviderColor(d.kind));
    final today = toNexagoEventLocal(DateTime.now()).weekday;
    final programClasses = _program == null
        ? d.classes
        : [
            for (final c in d.classes)
              if (c.programId == _program) c,
          ];
    final days = directoryWeekdays(programClasses);
    final day = _day != null && days.contains(_day)
        ? _day!
        : directoryInitialWeekday(days, today);
    final dayClasses = directoryClassesOn(programClasses, day);
    DirectoryClass? selected;
    for (final c in dayClasses) {
      if (c.classId == _selectedClassId) selected = c;
    }
    selected ??= dayClasses.where((c) => !c.isFull).firstOrNull;
    final plans = _program == null
        ? d.plans
        : [
            for (final p in d.plans)
              if (p.programIds.isEmpty || p.programIds.contains(_program)) p,
          ];

    return Scaffold(
      backgroundColor: colors.canvas,
      body: Stack(
        children: [
          CustomScrollView(
            key: const Key('class-provider-detail'),
            slivers: [
              SliverToBoxAdapter(
                child: _Hero(detail: d, accent: accent, onBack: _back),
              ),
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(22, 6, 22, 150),
                sliver: SliverList.list(
                  children: [
                    _Stats(items: _stats(d)),
                    const SizedBox(height: 30),
                    _Label(d.isCenter ? 'PROGRAMAS E TURMAS' : 'TURMAS'),
                    const SizedBox(height: 14),
                    if (d.programs.length > 1) ...[
                      SingleChildScrollView(
                        scrollDirection: Axis.horizontal,
                        clipBehavior: Clip.none,
                        child: Row(
                          children: [
                            AvailabilityChoiceChip(
                              label: 'Todos',
                              selected: _program == null,
                              onTap: () => setState(() => _program = null),
                            ),
                            for (final p in d.programs) ...[
                              const SizedBox(width: 6),
                              AvailabilityChoiceChip(
                                key: Key('class-program-${p.programId}'),
                                label: p.name,
                                selected: _program == p.programId,
                                onTap: () =>
                                    setState(() => _program = p.programId),
                              ),
                            ],
                          ],
                        ),
                      ),
                      const SizedBox(height: 14),
                    ],
                    if (days.isEmpty)
                      Text(
                        'Nenhuma turma aberta no momento.',
                        style: AppTypography.bodyS.copyWith(
                          fontSize: 13,
                          color: ProfessorLinksStyle.dim(colors),
                        ),
                      )
                    else ...[
                      _DayTabs(
                        days: days,
                        value: day,
                        accent: accent,
                        onChanged: (v) => setState(() {
                          _day = v;
                          _selectedClassId = null;
                        }),
                      ),
                      for (var i = 0; i < dayClasses.length; i++)
                        _ClassRow(
                          key: Key('class-row-${dayClasses[i].classId}'),
                          item: dayClasses[i],
                          selected: dayClasses[i].classId == selected?.classId,
                          divider: i > 0,
                          accent: accent,
                          onTap: () => setState(
                            () => _selectedClassId = dayClasses[i].classId,
                          ),
                        ),
                    ],
                    if (plans.isNotEmpty) ...[
                      const SizedBox(height: 30),
                      const _Label('PLANOS'),
                      const SizedBox(height: 14),
                      _Plans(plans: plans, accent: accent),
                      const SizedBox(height: 10),
                      Text(
                        _plansNote(d),
                        style: AppTypography.bodyS.copyWith(
                          fontSize: 12,
                          height: 1.5,
                          color: ProfessorLinksStyle.dim(colors),
                        ),
                      ),
                    ],
                    if (d.professors.isNotEmpty) ...[
                      const SizedBox(height: 30),
                      _Label(d.isCenter ? 'EQUIPE TÉCNICA' : 'PROFESSORES'),
                      const SizedBox(height: 14),
                      _Staff(people: d.professors, accent: accent),
                    ],
                    if (d.places.isNotEmpty) ...[
                      const SizedBox(height: 30),
                      _Label(d.isCenter ? 'ONDE ACONTECE' : 'ONDE FICA'),
                      const SizedBox(height: 6),
                      for (var i = 0; i < d.places.length; i++)
                        _PlaceRow(place: d.places[i], divider: i > 0),
                    ],
                  ],
                ),
              ),
            ],
          ),
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: _Footer(
              detail: d,
              selected: selected,
              dayLabel: arenaClassWeekdayShort(day),
            ),
          ),
        ],
      ),
    );
  }

  static List<(String, String)> _stats(ClassProviderDetail d) {
    final perWeek = d.classes.fold<int>(0, (s, c) => s + c.weekdays.length);
    final spots = d.classes.fold<int>(0, (s, c) => s + c.openSpots);
    final place = d.places.isEmpty ? null : d.places.first;
    return [
      if (d.isCenter)
        (
          '${d.programs.isEmpty ? d.classes.length : d.programs.length}',
          d.programs.isEmpty ? 'turmas' : 'programas'
        )
      else
        ('$perWeek', 'aulas por semana'),
      ('$spots', spots == 1 ? 'vaga aberta' : 'vagas abertas'),
      if (place?.distanceKm != null)
        (
          directoryDistance(place!.distanceKm!),
          d.city.isEmpty ? 'de você' : d.city
        )
      else if (d.isCenter && d.places.length > 1)
        ('${d.places.length}', 'locais')
      else
        (d.city.isEmpty ? '—' : d.city, d.state.isEmpty ? 'cidade' : d.state),
    ];
  }

  static String _plansNote(ClassProviderDetail d) {
    final who = d.isCenter
        ? 'Cobrado pelo centro de treinamento.'
        : 'Cobrado pela arena.';
    final h = d.makeupNoticeHours;
    return h == null || h <= 0
        ? who
        : '$who Falta avisada com ${h}h de antecedência vira crédito de '
            'reposição.';
  }
}

// ── peças ────────────────────────────────────────────────────────────────

class _Hero extends StatelessWidget {
  const _Hero({
    required this.detail,
    required this.accent,
    required this.onBack,
  });

  final ClassProviderDetail detail;
  final Color accent;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    final d = detail;
    final top = MediaQuery.paddingOf(context).top;
    final cover = d.coverUrl;
    const fallback = Image(
      image: AssetImage(CompeteHubArt.classes),
      fit: BoxFit.cover,
      color: Color(0xFF8A8A8A),
      colorBlendMode: BlendMode.multiply,
    );
    final description = d.description.isNotEmpty
        ? d.description
        : [
            if (d.sports.isNotEmpty) d.sports.join(' · '),
            if (d.city.isNotEmpty) d.city,
          ].join(' — ');
    return SizedBox(
      height: 360 + top * 0.5,
      child: Stack(
        fit: StackFit.expand,
        children: [
          if (cover == null)
            fallback
          else
            CachedNetworkImage(
              imageUrl: cover,
              fit: BoxFit.cover,
              errorWidget: (_, __, ___) => fallback,
            ),
          // Véu: escurece o topo (botões) e funde o pé no fundo da tela.
          DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [
                  const Color(0x8C050505),
                  const Color(0x00050505),
                  const Color(0x33050505),
                  const Color(0xEB050505),
                  context.themeColors.canvas,
                ],
                stops: const [0, 0.22, 0.5, 0.84, 1],
              ),
            ),
          ),
          Positioned(
            top: top + 8,
            left: 16,
            child: _GlassButton(
              icon: Icons.arrow_back_rounded,
              label: 'Voltar',
              onTap: onBack,
            ),
          ),
          Positioned(
            left: 22,
            right: 22,
            bottom: 18,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  d.kind.tagLabel.toUpperCase(),
                  style: ProfessorLinksStyle.mono(
                    9.5,
                    weight: FontWeight.w600,
                    color: accent,
                  ).copyWith(letterSpacing: 2.2),
                ),
                const SizedBox(height: 10),
                Text(
                  d.name,
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                  style: ProfessorLinksStyle.display(
                    32,
                    weight: FontWeight.w700,
                    color: AppColors.white,
                  ).copyWith(height: 1.04, letterSpacing: -1.1),
                ),
                if (description.isNotEmpty) ...[
                  const SizedBox(height: 10),
                  ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 320),
                    child: Text(
                      description,
                      maxLines: 3,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.bodyS.copyWith(
                        fontSize: 13,
                        height: 1.45,
                        color: AppColors.white.withValues(alpha: 0.7),
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _GlassButton extends StatelessWidget {
  const _GlassButton({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: label,
      child: Material(
        color: const Color(0x66000000),
        shape: CircleBorder(
          side: BorderSide(color: AppColors.white.withValues(alpha: 0.16)),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: SizedBox(
            width: 42,
            height: 42,
            child: Icon(icon, size: 20, color: AppColors.white),
          ),
        ),
      ),
    );
  }
}

class _Label extends StatelessWidget {
  const _Label(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: ProfessorLinksStyle.mono(
        9.5,
        weight: FontWeight.w600,
        color: ProfessorLinksStyle.dim(context.themeColors),
      ).copyWith(letterSpacing: 2),
    );
  }
}

class _Stats extends StatelessWidget {
  const _Stats({required this.items});

  final List<(String, String)> items;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final line = BorderSide(color: ProfessorLinksStyle.line(colors));
    return Container(
      decoration: BoxDecoration(border: Border(top: line, bottom: line)),
      child: IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            for (var i = 0; i < items.length; i++)
              Expanded(
                child: Container(
                  padding: EdgeInsets.fromLTRB(i == 0 ? 0 : 14, 16, 4, 16),
                  decoration: BoxDecoration(
                    border: i == 0 ? null : Border(left: line),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        items[i].$1,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: ProfessorLinksStyle.display(
                          20,
                          weight: FontWeight.w600,
                          color: colors.onSurface,
                        ),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        items[i].$2,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.bodyS.copyWith(
                          fontSize: 11,
                          color: ProfessorLinksStyle.dim(colors),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// Abas dos dias com turma (sublinhado na cor da origem).
class _DayTabs extends StatelessWidget {
  const _DayTabs({
    required this.days,
    required this.value,
    required this.accent,
    required this.onChanged,
  });

  final List<int> days;
  final int value;
  final Color accent;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      decoration: BoxDecoration(
        border: Border(
          bottom: BorderSide(color: ProfessorLinksStyle.line(colors)),
        ),
      ),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: [
            for (final d in days)
              InkWell(
                key: Key('class-day-$d'),
                onTap: () => onChanged(d),
                child: Container(
                  padding: const EdgeInsets.fromLTRB(0, 4, 0, 11),
                  margin: const EdgeInsets.only(right: 22),
                  decoration: BoxDecoration(
                    border: Border(
                      bottom: BorderSide(
                        width: 1.5,
                        color: d == value ? accent : Colors.transparent,
                      ),
                    ),
                  ),
                  child: Text(
                    arenaClassWeekdayShort(d),
                    style: ProfessorLinksStyle.display(
                      13.5,
                      weight: d == value ? FontWeight.w600 : FontWeight.w500,
                      color: d == value
                          ? colors.onSurface
                          : ProfessorLinksStyle.dim(colors),
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _ClassRow extends StatelessWidget {
  const _ClassRow({
    super.key,
    required this.item,
    required this.selected,
    required this.divider,
    required this.accent,
    required this.onTap,
  });

  final DirectoryClass item;
  final bool selected;
  final bool divider;
  final Color accent;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final c = item;
    final full = c.isFull;
    final spotsColor = full
        ? colors.readableTone(colors.pending)
        : selected
            ? accent
            : colors.readableTone(colors.win);
    final ratio = c.capacity <= 0 ? 0.0 : c.taken / c.capacity;
    final sub = [
      c.professorName,
      if (c.level.isNotEmpty) directoryLevelLabel(c.level),
      if (c.place.isNotEmpty) c.place,
    ].where((s) => s.isNotEmpty).join(' · ');
    return Opacity(
      opacity: full ? 0.6 : 1,
      child: Container(
        decoration: BoxDecoration(
          border: divider && !selected
              ? Border(
                  top: BorderSide(color: ProfessorLinksStyle.line(colors)),
                )
              : null,
        ),
        child: Material(
          color: selected ? accent.withValues(alpha: 0.08) : Colors.transparent,
          borderRadius: BorderRadius.circular(14),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 14),
              child: Row(
                children: [
                  SizedBox(
                    width: 56,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          c.startTime,
                          style: ProfessorLinksStyle.mono(
                            13,
                            weight: FontWeight.w600,
                            color: colors.onSurface,
                          ),
                        ),
                        if (c.endTime.isNotEmpty) ...[
                          const SizedBox(height: 2),
                          Text(
                            'até ${c.endTime}',
                            style: ProfessorLinksStyle.mono(
                              10.5,
                              weight: FontWeight.w500,
                              color: ProfessorLinksStyle.dim(colors),
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          c.name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: ProfessorLinksStyle.display(
                            13.5,
                            weight: FontWeight.w600,
                            color: colors.onSurface,
                          ),
                        ),
                        if (sub.isNotEmpty) ...[
                          const SizedBox(height: 2),
                          Text(
                            sub,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: AppTypography.bodyS.copyWith(
                              fontSize: 11.5,
                              color: ProfessorLinksStyle.dim(colors),
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                  const SizedBox(width: 10),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(
                        directorySpotsLabel(c.openSpots).toUpperCase(),
                        style: ProfessorLinksStyle.mono(
                          10,
                          weight: FontWeight.w600,
                          color: spotsColor,
                        ),
                      ),
                      const SizedBox(height: 7),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(2),
                        child: SizedBox(
                          width: 56,
                          height: 3,
                          child: LinearProgressIndicator(
                            value: ratio.clamp(0, 1).toDouble(),
                            backgroundColor: ProfessorLinksStyle.line(colors),
                            valueColor: AlwaysStoppedAnimation(
                              full
                                  ? colors.readableTone(colors.pending)
                                  : selected
                                      ? accent
                                      : colors.onSurface.withValues(alpha: 0.4),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _Plans extends StatelessWidget {
  const _Plans({required this.plans, required this.accent});

  final List<DirectoryPlan> plans;
  final Color accent;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    // Destaque: o marcado pelo CT, senão o do meio (como no protótipo).
    final featured = plans.indexWhere((p) => p.featured);
    final highlight = featured >= 0
        ? featured
        : plans.length >= 3
            ? 1
            : -1;
    Widget cell(int i) => Container(
          padding: const EdgeInsets.fromLTRB(12, 14, 10, 14),
          color: i == highlight
              ? Color.alphaBlend(
                  accent.withValues(alpha: 0.08),
                  colors.surfaceCard,
                )
              : colors.surfaceCard,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                plans[i].name,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: AppTypography.bodyS.copyWith(
                  fontSize: 10.5,
                  height: 1.25,
                  color:
                      i == highlight ? accent : ProfessorLinksStyle.dim(colors),
                ),
              ),
              const SizedBox(height: 5),
              Text.rich(
                TextSpan(
                  children: [
                    TextSpan(
                      text: directoryPrice(plans[i].priceReais),
                      style: ProfessorLinksStyle.display(
                        17,
                        weight: FontWeight.w600,
                        color: colors.onSurface,
                      ),
                    ),
                    TextSpan(
                      text: plans[i].unit,
                      style: AppTypography.bodyS.copyWith(
                        fontSize: 10,
                        color: ProfessorLinksStyle.dim(colors),
                      ),
                    ),
                  ],
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              if (_detail(plans[i]).isNotEmpty) ...[
                const SizedBox(height: 2),
                Text(
                  _detail(plans[i]),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.bodyS.copyWith(
                    fontSize: 10,
                    color: ProfessorLinksStyle.dim(colors),
                  ),
                ),
              ],
            ],
          ),
        );
    // Linhas de até 3, cada uma com a altura da célula mais alta: a linha
    // fina entre as células é o fundo aparecendo pelo espaço de 1px.
    const cols = 3;
    final rows = <Widget>[
      for (var r = 0; r < plans.length; r += cols)
        IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              for (var i = r; i < r + cols && i < plans.length; i++) ...[
                if (i > r) const SizedBox(width: 1),
                Expanded(child: cell(i)),
              ],
              // Linha incompleta: completa com vazio para manter as colunas.
              for (var i = plans.length;
                  i < r + cols && plans.length > cols;
                  i++) ...[
                const SizedBox(width: 1),
                Expanded(child: ColoredBox(color: colors.surfaceCard)),
              ],
            ],
          ),
        ),
    ];
    return ClipRRect(
      borderRadius: BorderRadius.circular(16),
      child: ColoredBox(
        color: ProfessorLinksStyle.line(colors),
        child: Column(
          children: [
            for (var i = 0; i < rows.length; i++) ...[
              if (i > 0) const SizedBox(height: 1),
              rows[i],
            ],
          ],
        ),
      ),
    );
  }

  static String _detail(DirectoryPlan p) {
    if (p.classesPerWeek != null && p.classesPerWeek! > 0) {
      return '${p.classesPerWeek}× por semana';
    }
    if (p.credits != null && p.credits! > 0) {
      return '${p.credits} ${p.credits == 1 ? 'aula' : 'aulas'}';
    }
    return '';
  }
}

class _Staff extends StatelessWidget {
  const _Staff({required this.people, required this.accent});

  final List<DirectoryStaff> people;
  final Color accent;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return SizedBox(
      height: 178,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        clipBehavior: Clip.none,
        itemCount: people.length,
        separatorBuilder: (_, __) => const SizedBox(width: 12),
        itemBuilder: (context, i) {
          final p = people[i];
          final uid = p.professorUid;
          final tile = SizedBox(
            width: 118,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  height: 132,
                  width: 118,
                  clipBehavior: Clip.antiAlias,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: ProfessorLinksStyle.line(colors)),
                    gradient: LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [
                        accent.withValues(alpha: 0.16),
                        colors.onSurface.withValues(alpha: 0.02),
                      ],
                    ),
                  ),
                  child: p.photoUrl == null
                      ? Center(
                          child: Text(
                            arenaClassInitials(p.name),
                            style: ProfessorLinksStyle.display(
                              26,
                              weight: FontWeight.w600,
                              color: accent,
                            ),
                          ),
                        )
                      : CachedNetworkImage(
                          imageUrl: p.photoUrl!,
                          fit: BoxFit.cover,
                          errorWidget: (_, __, ___) => ArenaClassAvatar(
                            initials: arenaClassInitials(p.name),
                          ),
                        ),
                ),
                const SizedBox(height: 9),
                Text(
                  p.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: ProfessorLinksStyle.display(
                    12.5,
                    weight: FontWeight.w600,
                    color: colors.onSurface,
                  ),
                ),
                if (p.role.isNotEmpty || uid != null) ...[
                  const SizedBox(height: 2),
                  Text(
                    p.role.isNotEmpty ? p.role : 'Ver perfil',
                    maxLines: 1,
                    style: AppTypography.bodyS.copyWith(
                      fontSize: 11,
                      color: uid != null
                          ? accent
                          : ProfessorLinksStyle.dim(colors),
                    ),
                  ),
                ],
              ],
            ),
          );
          if (uid == null) return tile;
          return GestureDetector(
            key: Key('class-staff-$uid'),
            behavior: HitTestBehavior.opaque,
            onTap: () => openProfessorProfile(context, uid),
            child: tile,
          );
        },
      ),
    );
  }
}

class _PlaceRow extends StatelessWidget {
  const _PlaceRow({required this.place, required this.divider});

  final DirectoryPlace place;
  final bool divider;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final sub =
        [place.address, place.notes].where((s) => s.isNotEmpty).join(' · ');
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 14),
      decoration: BoxDecoration(
        border: divider
            ? Border(top: BorderSide(color: ProfessorLinksStyle.line(colors)))
            : null,
      ),
      child: Row(
        children: [
          Icon(
            Icons.place_outlined,
            size: 18,
            color: ProfessorLinksStyle.dim(colors),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  place.name,
                  style: ProfessorLinksStyle.display(
                    13.5,
                    weight: FontWeight.w600,
                    color: colors.onSurface,
                  ),
                ),
                if (sub.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(
                    sub,
                    style: AppTypography.bodyS.copyWith(
                      fontSize: 11.5,
                      color: ProfessorLinksStyle.dim(colors),
                    ),
                  ),
                ],
              ],
            ),
          ),
          if (place.distanceKm != null)
            Text(
              directoryDistance(place.distanceKm!),
              style: ProfessorLinksStyle.mono(
                11,
                weight: FontWeight.w500,
                color: ProfessorLinksStyle.mute(colors),
              ),
            ),
        ],
      ),
    );
  }
}

/// Barra fixa no pé: a turma escolhida e o contato pelo WhatsApp.
class _Footer extends StatelessWidget {
  const _Footer({
    required this.detail,
    required this.selected,
    required this.dayLabel,
  });

  final ClassProviderDetail detail;
  final DirectoryClass? selected;
  final String dayLabel;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final c = selected;
    final url = ArenaBookingSuccessActions.buildWhatsAppUrl(
      phone: detail.contactPhone,
      message: classDirectoryContactMessage(detail, c),
    );
    final kicker =
        c == null ? detail.name : '${c.name} · $dayLabel ${c.startTime}';
    final value = url == null
        ? 'Sem contato publicado'
        : c == null
            ? 'Fale com ${detail.isCenter ? 'o centro' : 'a arena'}'
            : c.isFull
                ? 'Turma lotada · lista de espera'
                : directorySpotsLabel(c.openSpots);
    final bottom = MediaQuery.paddingOf(context).bottom;
    return Container(
      padding: EdgeInsets.fromLTRB(18, 16, 18, 14 + bottom),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.bottomCenter,
          end: Alignment.topCenter,
          colors: [
            colors.canvas,
            colors.canvas,
            colors.canvas.withValues(alpha: 0),
          ],
          stops: const [0, 0.7, 1],
        ),
      ),
      child: Container(
        padding: const EdgeInsets.fromLTRB(18, 10, 10, 10),
        decoration: BoxDecoration(
          color: colors.surfaceRaised,
          borderRadius: BorderRadius.circular(22),
          border: Border.all(color: ProfessorLinksStyle.line2(colors)),
        ),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    kicker,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.bodyS.copyWith(
                      fontSize: 11,
                      color: ProfessorLinksStyle.dim(colors),
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    value,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: ProfessorLinksStyle.display(
                      14.5,
                      weight: FontWeight.w600,
                      color: colors.onSurface,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 12),
            SizedBox(
              height: 46,
              child: FilledButton.icon(
                key: const Key('class-provider-contact'),
                onPressed: url == null
                    ? null
                    : () async {
                        final ok = await openExternalUrl(url);
                        if (!ok && context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                              content:
                                  Text('Não foi possível abrir o WhatsApp.'),
                            ),
                          );
                        }
                      },
                style: FilledButton.styleFrom(
                  backgroundColor: colors.onSurface,
                  foregroundColor: colors.canvas,
                  padding: const EdgeInsets.symmetric(horizontal: 18),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(15),
                  ),
                  textStyle: AppTypography.labelL.copyWith(fontSize: 13.5),
                ),
                icon: const Icon(Icons.chat_bubble_outline_rounded, size: 17),
                label: Text(
                    c?.isFull == true ? 'Lista de espera' : 'Quero entrar'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
