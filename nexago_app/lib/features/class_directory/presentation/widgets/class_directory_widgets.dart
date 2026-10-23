import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../arena/domain/aulas/arena_class_logic.dart';
import '../../../arena/presentation/aulas/widgets/arena_class_atoms.dart';
import '../../../athlete_training/domain/public_professor.dart';
import '../../../athlete_training/presentation/widgets/training_origin_widgets.dart'
    show trainingCenterColor;
import '../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../domain/class_directory.dart';
import '../../domain/class_directory_logic.dart';

/// Peças do diretório de aulas (protótipo `hb-aulas-locais.jsx`), no kit
/// visual dos treinos (`ProfessorLinks*`). Cor fixa por origem, a mesma dos
/// Treinos: arena laranja, CT lilás, professor azul.

Color classProviderColor(ClassProviderKind kind) => switch (kind) {
      ClassProviderKind.arena => AppColors.brand,
      ClassProviderKind.center => trainingCenterColor,
      ClassProviderKind.professor => ProfessorLinksStyle.blue,
    };

/// "ARENA", "CENTRO DE TREINAMENTO", "PROFESSOR INDEPENDENTE".
class ClassProviderKindTag extends StatelessWidget {
  const ClassProviderKindTag(this.kind, {super.key});

  final ClassProviderKind kind;

  @override
  Widget build(BuildContext context) {
    return ArenaClassTag(
      label: kind.tagLabel,
      color: context.themeColors.readableTone(classProviderColor(kind)),
      background: classProviderColor(kind).withValues(alpha: 0.13),
    );
  }
}

/// Marca quadrada do local: logo, ou as iniciais na cor da origem.
class ClassProviderMark extends StatelessWidget {
  const ClassProviderMark({
    super.key,
    required this.kind,
    required this.name,
    this.logoUrl,
    this.size = 50,
  });

  final ClassProviderKind kind;
  final String name;
  final String? logoUrl;
  final double size;

  @override
  Widget build(BuildContext context) {
    if (kind == ClassProviderKind.professor) {
      return ArenaClassAvatar(
        initials: arenaClassInitials(name),
        photoUrl: logoUrl,
        size: size,
        color: ProfessorLinksStyle.blue,
      );
    }
    final colors = context.themeColors;
    final c = classProviderColor(kind);
    final fallback = Center(
      child: Text(
        _initials(name),
        style: ProfessorLinksStyle.display(
          size * 0.28,
          color: colors.readableTone(c),
        ),
      ),
    );
    final url = logoUrl;
    return Container(
      width: size,
      height: size,
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: c.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(size * 0.28),
        border: Border.all(color: c.withValues(alpha: 0.33)),
      ),
      child: url == null
          ? fallback
          : CachedNetworkImage(
              imageUrl: url,
              fit: BoxFit.cover,
              errorWidget: (_, __, ___) => fallback,
              placeholder: (_, __) => fallback,
            ),
    );
  }

  /// "Arena CFC" → "CFC"; "CT Elevação Beach" → "EB"; uma palavra → 2 letras.
  static String _initials(String name) {
    const skip = {'arena', 'ct', 'centro', 'de', 'do', 'da', 'treinamento'};
    final words = name
        .trim()
        .split(RegExp(r'\s+'))
        .where((w) => w.isNotEmpty && !skip.contains(w.toLowerCase()))
        .toList();
    if (words.isEmpty) return arenaClassInitials(name);
    if (words.length == 1) {
      final w = words.first;
      return (w.length <= 3 ? w : w.substring(0, 2)).toUpperCase();
    }
    return words.take(3).map((w) => w[0]).join().toUpperCase();
  }
}

/// Avatares sobrepostos (professores do local).
class DirectoryAvatarStack extends StatelessWidget {
  const DirectoryAvatarStack(this.people, {super.key, this.size = 22});

  final List<DirectoryPerson> people;
  final double size;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final shown = people.take(3).toList();
    if (shown.isEmpty) return const SizedBox.shrink();
    return SizedBox(
      height: size + 4,
      width: size + (shown.length - 1) * (size - 7) + 4,
      child: Stack(
        children: [
          for (var i = 0; i < shown.length; i++)
            Positioned(
              left: i * (size - 7),
              child: Container(
                padding: const EdgeInsets.all(2),
                decoration: BoxDecoration(
                  color: colors.surfaceCard,
                  shape: BoxShape.circle,
                ),
                child: ArenaClassAvatar(
                  initials: arenaClassInitials(shown[i].name),
                  photoUrl: shown[i].photoUrl,
                  size: size,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// Linha "★ 4,8 (312) · 3,1 km".
class _RatingLine extends StatelessWidget {
  const _RatingLine({this.rating, this.ratingCount = 0, this.trailing = ''});

  final double? rating;
  final int ratingCount;
  final String trailing;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final rest = [
      if (rating != null && ratingCount > 0) '($ratingCount)',
      if (trailing.isNotEmpty) trailing,
    ].join(' · ');
    return Row(
      children: [
        if (rating != null) ...[
          Icon(Icons.star_rounded, size: 13, color: colors.brandText),
          const SizedBox(width: 3),
          Text(
            professorRatingLabel(rating!),
            style: ProfessorLinksStyle.mono(11.5, color: colors.onSurface),
          ),
          const SizedBox(width: 4),
        ],
        Flexible(
          child: Text(
            rest,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: AppTypography.bodyS.copyWith(
              fontSize: 11.5,
              color: ProfessorLinksStyle.dim(colors),
            ),
          ),
        ),
      ],
    );
  }
}

/// Pé do card: horário/condição à esquerda e "A PARTIR DE R$ X/mês" à direita.
class _CardFooter extends StatelessWidget {
  const _CardFooter({
    required this.line1,
    required this.line2,
    required this.line2Color,
    this.price,
    this.unit = '/mês',
  });

  final String line1;
  final String line2;
  final Color line2Color;
  final double? price;
  final String unit;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      margin: const EdgeInsets.only(top: 12),
      padding: const EdgeInsets.only(top: 12),
      decoration: BoxDecoration(
        border: Border(
          top: BorderSide(color: ProfessorLinksStyle.line(colors)),
        ),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (line1.isNotEmpty)
                  Row(
                    children: [
                      Icon(
                        Icons.schedule_rounded,
                        size: 13,
                        color: ProfessorLinksStyle.mute(colors),
                      ),
                      const SizedBox(width: 5),
                      Expanded(
                        child: Text(
                          line1,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: AppTypography.bodyS.copyWith(
                            fontSize: 11.5,
                            color: colors.onSurface,
                          ),
                        ),
                      ),
                    ],
                  ),
                if (line2.isNotEmpty) ...[
                  const SizedBox(height: 3),
                  Text(
                    line2,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.bodyS.copyWith(
                      fontSize: 11.5,
                      fontWeight: FontWeight.w600,
                      color: colors.readableTone(line2Color),
                    ),
                  ),
                ],
              ],
            ),
          ),
          if (price != null) ...[
            const SizedBox(width: 10),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  'A PARTIR DE',
                  style: ProfessorLinksStyle.mono(
                    9,
                    color: ProfessorLinksStyle.dim(colors),
                  ),
                ),
                const SizedBox(height: 2),
                Text.rich(
                  TextSpan(
                    children: [
                      TextSpan(
                        text: directoryPrice(price!),
                        style: ProfessorLinksStyle.display(
                          15,
                          weight: FontWeight.w700,
                          color: colors.onSurface,
                        ),
                      ),
                      TextSpan(
                        text: unit,
                        style: AppTypography.bodyS.copyWith(
                          fontSize: 10.5,
                          color: ProfessorLinksStyle.dim(colors),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

/// "Intermediário · Seg 19:00".
String directorySlotLabel(DirectorySlot s) {
  final day =
      s.weekdays.isEmpty ? '' : arenaClassWeekdayShort(s.weekdays.first);
  return [
    s.className,
    [day, s.startTime].where((x) => x.isNotEmpty).join(' '),
  ].where((x) => x.isNotEmpty).join(' · ');
}

/// Card de arena ou CT na lista (H2).
class ClassPlaceCard extends StatelessWidget {
  const ClassPlaceCard({
    super.key,
    required this.item,
    required this.slot,
    required this.onTap,
  });

  final ClassProvider item;

  /// Turma em destaque (já escolhida conforme os filtros).
  final DirectorySlot? slot;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final where = [
      if (item.distanceKm != null) directoryDistance(item.distanceKm!),
      if (item.city.isNotEmpty) item.city,
    ].join(' · ');
    final classesLabel = item.kind == ClassProviderKind.center
        ? '${item.classCount} ${item.classCount == 1 ? 'turma' : 'turmas'} '
            'nos programas'
        : '${item.classCount} ${item.classCount == 1 ? 'turma' : 'turmas'}';
    final profLabel = item.professorCount == 0
        ? ''
        : '${item.professorCount} '
            '${item.professorCount == 1 ? 'professor' : 'professores'} · ';
    final s = slot;
    final spots = s == null ? item.openSpots : s.openSpots;
    return ProfessorLinksCard(
      key: Key('class-directory-${item.kind.wireId}-${item.id}'),
      onTap: onTap,
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ClassProviderMark(
                kind: item.kind,
                name: item.name,
                logoUrl: item.logoUrl,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      item.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: ProfessorLinksStyle.display(
                        15,
                        weight: FontWeight.w700,
                        color: colors.onSurface,
                      ),
                    ),
                    const SizedBox(height: 3),
                    _RatingLine(trailing: where),
                    const SizedBox(height: 8),
                    ClassProviderKindTag(item.kind),
                  ],
                ),
              ),
            ],
          ),
          if (item.sports.isNotEmpty) ...[
            const SizedBox(height: 10),
            Text(
              item.sports.join(' · '),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: AppTypography.bodyS.copyWith(
                fontSize: 11.5,
                color: ProfessorLinksStyle.mute(colors),
              ),
            ),
          ],
          const SizedBox(height: 10),
          Row(
            children: [
              DirectoryAvatarStack(item.professors),
              if (item.professors.isNotEmpty) const SizedBox(width: 8),
              Expanded(
                child: Text(
                  '$profLabel$classesLabel',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.bodyS.copyWith(
                    fontSize: 11.5,
                    color: ProfessorLinksStyle.dim(colors),
                  ),
                ),
              ),
            ],
          ),
          _CardFooter(
            line1: s == null ? '' : directorySlotLabel(s),
            line2: spots > 0
                ? '${directorySpotsLabel(spots)}'
                    '${s == null ? ' no total' : ''}'
                : 'Turmas lotadas · lista de espera',
            line2Color: spots > 0 ? colors.win : colors.pending,
            price: item.priceFromReais,
          ),
        ],
      ),
    );
  }
}

/// Card de professor independente na lista (H2).
class ClassProfessorCard extends StatelessWidget {
  const ClassProfessorCard({
    super.key,
    required this.item,
    required this.onTap,
  });

  final ClassProvider item;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final places = item.places;
    return ProfessorLinksCard(
      key: Key('class-directory-professor-${item.id}'),
      onTap: onTap,
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ClassProviderMark(
                kind: item.kind,
                name: item.name,
                logoUrl: item.logoUrl,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      item.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: ProfessorLinksStyle.display(
                        15,
                        weight: FontWeight.w700,
                        color: colors.onSurface,
                      ),
                    ),
                    const SizedBox(height: 3),
                    _RatingLine(
                      rating: item.rating,
                      ratingCount: item.ratingCount,
                      trailing: item.distanceKm == null
                          ? item.city
                          : directoryDistance(item.distanceKm!),
                    ),
                    const SizedBox(height: 8),
                    ClassProviderKindTag(item.kind),
                  ],
                ),
              ),
            ],
          ),
          if (item.sports.isNotEmpty) ...[
            const SizedBox(height: 10),
            Text(
              item.sports.join(' · '),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: AppTypography.bodyS.copyWith(
                fontSize: 11.5,
                color: ProfessorLinksStyle.mute(colors),
              ),
            ),
          ],
          if (places.isNotEmpty) ...[
            const SizedBox(height: 8),
            Row(
              children: [
                Icon(
                  Icons.place_outlined,
                  size: 13,
                  color: ProfessorLinksStyle.dim(colors),
                ),
                const SizedBox(width: 5),
                Expanded(
                  child: Text(
                    'Dá aula em ${places.take(2).join(' · ')}'
                    '${places.length > 2 ? ' +${places.length - 2}' : ''}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.bodyS.copyWith(
                      fontSize: 11.5,
                      color: ProfessorLinksStyle.dim(colors),
                    ),
                  ),
                ),
              ],
            ),
          ],
          _CardFooter(
            line1: 'Particular',
            line2: item.acceptsPrivate
                ? 'Horários abertos para agendar'
                : 'Pedir contato pelo perfil',
            line2Color: item.acceptsPrivate
                ? colors.win
                : ProfessorLinksStyle.mute(colors),
            price: item.priceFromReais,
            unit: '/aula',
          ),
        ],
      ),
    );
  }
}

/// Chip da linha de filtros rápidos (H2): "Filtros ①", "Com vaga".
class DirectoryQuickChip extends StatelessWidget {
  const DirectoryQuickChip({
    super.key,
    required this.label,
    required this.selected,
    required this.onTap,
    this.icon,
    this.count = 0,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;
  final IconData? icon;
  final int count;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final fg =
        selected ? colors.readableTone(AppColors.brand) : colors.onSurface;
    return Material(
      color: selected
          ? AppColors.brand.withValues(alpha: 0.12)
          : colors.surfaceRaised,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(11),
        side: BorderSide(
          color: selected
              ? AppColors.brand.withValues(alpha: 0.5)
              : ProfessorLinksStyle.line(colors),
        ),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Container(
          height: 34,
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (icon != null) ...[
                Icon(icon, size: 15, color: fg),
                const SizedBox(width: 6),
              ],
              Text(
                label,
                style: AppTypography.bodyS.copyWith(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w600,
                  color: fg,
                ),
              ),
              if (count > 0) ...[
                const SizedBox(width: 6),
                Container(
                  constraints: const BoxConstraints(minWidth: 17),
                  height: 17,
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  decoration: BoxDecoration(
                    color: AppColors.brand,
                    borderRadius: BorderRadius.circular(9),
                  ),
                  alignment: Alignment.center,
                  child: Text(
                    '$count',
                    style: ProfessorLinksStyle.mono(
                      10,
                      color: ProfessorLinksStyle.onBrand,
                      weight: FontWeight.w800,
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
