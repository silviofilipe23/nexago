import 'package:cloud_firestore/cloud_firestore.dart';

import '../../arena/domain/aulas/arena_class_logic.dart'
    show arenaClassDateKeyWeekday, arenaClassWeekdayShort;
import 'professor_agenda.dart';
import 'professor_students_logic.dart' show professorShortDate;

/// Plano de aula do professor (canvas H1–H5, H8;
/// `functions/src/professor-lesson-plans.ts`).
///
/// O plano completo (`lessonPlans/{planId}`) só o professor lê e só a
/// callable grava. Publicado, o servidor gera uma visão por aluno
/// (`lessonPlanViews/{planId}_{athleteId}`) sem as notas privadas e só com o
/// foco daquele aluno. Modelos e exercícios próprios o cliente grava direto
/// (`professors/{uid}/lessonTemplates` e `/exercises`, só o dono).

// ── categorias ───────────────────────────────────────────────────────────

/// Fundamento do bloco/exercício (mesma lista do servidor).
enum LessonPlanCategory {
  fisico('Físico', 0xFFB48CFF),
  toque('Toque', 0xFF5B9BFF),
  saque('Saque', 0xFFFF8A4A),
  devolucao('Devolução', 0xFF2BD17E),
  voleio('Voleio', 0xFF5BD6E0),
  smash('Smash', 0xFFFF6B8A),
  jogo('Jogo', 0xFFF4C543),
  outro('Outro', 0xFF9A9AA6);

  const LessonPlanCategory(this.label, this.argb);

  final String label;

  /// Cor do desenho (`PL_CAT`); "Outro" é neutro.
  final int argb;

  static LessonPlanCategory parse(Object? raw) {
    for (final c in values) {
      if (c.name == raw) return c;
    }
    return outro;
  }
}

// ── identidade ───────────────────────────────────────────────────────────

/// A aula que o plano cobre: turma da arena, aula da carteira, particular do
/// app ou ocorrência de turma própria.
enum LessonPlanKind {
  session('session'),
  lesson('lesson'),
  privateLesson('private'),
  booking('booking');

  const LessonPlanKind(this.id);

  final String id;

  static LessonPlanKind? parse(Object? raw) {
    for (final k in values) {
      if (k.id == raw) return k;
    }
    return null;
  }
}

/// `{uid}_{kind}_{refId}`.
String lessonPlanId(String uid, LessonPlanKind kind, String refId) =>
    '${uid}_${kind.id}_$refId';

/// `{planId}_{athleteId}` — a visão do aluno.
String lessonPlanViewId(String planId, String athleteId) =>
    '${planId}_$athleteId';

/// Turma da aula de turma: o id é `class_{classId}_{YYYY-MM-DD}`.
String? lessonPlanSessionClassId(String sessionId) {
  final m = RegExp(r'^class_(.+)_\d{4}-\d{2}-\d{2}$').firstMatch(sessionId);
  return m?.group(1);
}

// ── limites (os do servidor) ─────────────────────────────────────────────

const int kLessonPlanMaxBlocks = 20;
const int kLessonPlanMaxTotalMin = 240;
const int kLessonPlanMaxFocus = 40;
const int kLessonPlanBlockMinMin = 1;
const int kLessonPlanBlockMaxMin = 120;
const int kLessonPlanDefaultDurationMin = 60;
const int kLessonPlanObjectiveMax = 200;
const int kLessonPlanNoteMax = 500;
const int kLessonPlanFocusTextMax = 200;
const int kLessonPlanMaxTags = 6;

/// Níveis do modelo e do exercício.
const List<String> kLessonPlanLevels = [
  'Todos',
  'Iniciante',
  'Intermediário',
  'Avançado',
];

// ── bloco e foco ─────────────────────────────────────────────────────────

class LessonPlanBlock {
  const LessonPlanBlock({
    required this.id,
    required this.name,
    required this.category,
    required this.minutes,
    this.exerciseId,
    this.detail = '',
    this.note = '',
    this.notePublic = false,
  });

  factory LessonPlanBlock.fromMap(Map<String, Object?> map, int index) =>
      LessonPlanBlock(
        id: _str(map['id']).isEmpty ? 'b${index + 1}' : _str(map['id']),
        exerciseId:
            _str(map['exerciseId']).isEmpty ? null : _str(map['exerciseId']),
        name: _str(map['name']),
        detail: _str(map['detail']),
        category: LessonPlanCategory.parse(map['category']),
        minutes: _int(map['minutes'], 10),
        note: _str(map['note']),
        notePublic: map['notePublic'] == true,
      );

  final String id;
  final String? exerciseId;
  final String name;
  final String detail;
  final LessonPlanCategory category;
  final int minutes;

  /// Comentário do bloco; [notePublic] = a turma vê.
  final String note;
  final bool notePublic;

  bool get hasNote => note.trim().isNotEmpty;

  LessonPlanBlock copyWith({
    String? id,
    String? name,
    String? detail,
    LessonPlanCategory? category,
    int? minutes,
    String? note,
    bool? notePublic,
  }) =>
      LessonPlanBlock(
        id: id ?? this.id,
        exerciseId: exerciseId,
        name: name ?? this.name,
        detail: detail ?? this.detail,
        category: category ?? this.category,
        minutes: minutes ?? this.minutes,
        note: note ?? this.note,
        notePublic: notePublic ?? this.notePublic,
      );

  Map<String, Object?> toMap() => {
        'id': id,
        'exerciseId': exerciseId,
        'name': name.trim(),
        'detail': detail.trim(),
        'category': category.name,
        'minutes': minutes,
        'note': note.trim(),
        'notePublic': notePublic,
      };
}

/// Foco individual de um aluno no plano (privado ou o aluno vê).
class LessonPlanFocus {
  const LessonPlanFocus({
    required this.athleteId,
    required this.name,
    required this.text,
    this.public = false,
  });

  factory LessonPlanFocus.fromMap(Map<String, Object?> map) => LessonPlanFocus(
        athleteId: _str(map['athleteId']),
        name: _str(map['name'], 'Aluno'),
        text: _str(map['text']),
        public: map['public'] == true,
      );

  final String athleteId;
  final String name;
  final String text;
  final bool public;

  LessonPlanFocus copyWith({String? text, bool? public}) => LessonPlanFocus(
        athleteId: athleteId,
        name: name,
        text: text ?? this.text,
        public: public ?? this.public,
      );

  Map<String, Object?> toPayload() =>
      {'athleteId': athleteId, 'text': text.trim(), 'public': public};
}

// ── plano ────────────────────────────────────────────────────────────────

enum LessonPlanStatus { draft, ready }

/// `lessonPlans/{planId}` (só o professor lê).
class LessonPlan {
  const LessonPlan({
    required this.id,
    required this.kind,
    required this.refId,
    required this.title,
    required this.date,
    this.professorUid = '',
    this.startTime = '',
    this.endTime = '',
    this.arenaName = '',
    this.place = '',
    this.objective = '',
    this.tags = const [],
    this.blocks = const [],
    this.focus = const [],
    this.published = false,
    this.status = LessonPlanStatus.draft,
    this.review,
    this.ratings = const {},
  });

  static LessonPlan? fromMap(String id, Map<String, Object?> map) {
    final kind = LessonPlanKind.parse(map['kind']);
    final refId = _str(map['refId']);
    if (kind == null || refId.isEmpty) return null;
    final blocks = map['blocks'];
    final focus = map['focus'];
    return LessonPlan(
      id: id,
      professorUid: _str(map['professorUid']),
      kind: kind,
      refId: refId,
      title: _str(map['title'], 'Aula'),
      date: _str(map['date']),
      startTime: _str(map['startTime']),
      endTime: _str(map['endTime']),
      arenaName: _str(map['arenaName']),
      place: _str(map['place']),
      objective: _str(map['objective']),
      tags: _tags(map['tags']),
      blocks: blocks is List
          ? [
              for (var i = 0; i < blocks.length; i++)
                if (blocks[i] is Map)
                  LessonPlanBlock.fromMap(_map(blocks[i]), i),
            ]
          : const [],
      focus: focus is List
          ? [
              for (final f in focus)
                if (f is Map) LessonPlanFocus.fromMap(_map(f)),
            ]
          : const [],
      published: map['published'] == true,
      status: map['status'] == 'ready'
          ? LessonPlanStatus.ready
          : LessonPlanStatus.draft,
      review: map['review'] is Map
          ? LessonReview.fromMap(_map(map['review']))
          : null,
      ratings: map['ratings'] is Map
          ? {
              for (final e in _map(map['ratings']).entries)
                if (e.value is num) e.key: (e.value! as num).toInt(),
            }
          : const {},
    );
  }

  final String id;
  final String professorUid;
  final LessonPlanKind kind;
  final String refId;
  final String title;

  /// `YYYY-MM-DD`.
  final String date;
  final String startTime;
  final String endTime;
  final String arenaName;
  final String place;
  final String objective;
  final List<LessonPlanCategory> tags;
  final List<LessonPlanBlock> blocks;
  final List<LessonPlanFocus> focus;
  final bool published;
  final LessonPlanStatus status;

  /// Registro pós-aula (H7), só do professor.
  final LessonReview? review;

  /// Estrelas que cada aluno deu ao feedback (athleteId → 1..5).
  final Map<String, int> ratings;

  bool get isReady => status == LessonPlanStatus.ready;
  bool get hasReview => review != null;
  int get totalMinutes => lessonPlanTotalMinutes(blocks);
  int get lessonDurationMin => lessonDurationFromTimes(startTime, endTime);

  LessonPlanContent get content =>
      LessonPlanContent(objective: objective, tags: tags, blocks: blocks);
}

/// Objetivo, fundamentos e blocos — o que um modelo ou o plano anterior
/// preenche no editor.
class LessonPlanContent {
  const LessonPlanContent({
    this.objective = '',
    this.tags = const [],
    this.blocks = const [],
  });

  final String objective;
  final List<LessonPlanCategory> tags;
  final List<LessonPlanBlock> blocks;
}

/// O que o editor manda a `saveLessonPlan`.
class LessonPlanDraft {
  const LessonPlanDraft({
    required this.kind,
    required this.refId,
    this.objective = '',
    this.tags = const [],
    this.blocks = const [],
    this.focus = const [],
    this.published = false,
    this.status = LessonPlanStatus.ready,
  });

  final LessonPlanKind kind;
  final String refId;
  final String objective;
  final List<LessonPlanCategory> tags;
  final List<LessonPlanBlock> blocks;
  final List<LessonPlanFocus> focus;
  final bool published;
  final LessonPlanStatus status;

  /// Plano sem bloco é sempre rascunho.
  LessonPlanStatus get effectiveStatus =>
      blocks.isEmpty ? LessonPlanStatus.draft : status;

  Map<String, Object?> toPayload() => {
        'kind': kind.id,
        'refId': refId,
        'objective': objective.trim(),
        'tags': [for (final t in tags.toSet()) t.name],
        'blocks': [for (final b in blocks) b.toMap()],
        'focus': [
          for (final f in focus)
            if (f.text.trim().isNotEmpty) f.toPayload(),
        ],
        // Rascunho nunca vai para os alunos.
        'published': published && effectiveStatus == LessonPlanStatus.ready,
        'status': effectiveStatus.name,
      };
}

/// Erro do plano antes de chamar o servidor (ou `null`).
String? validateLessonPlanDraft(LessonPlanDraft d) {
  if (d.blocks.length > kLessonPlanMaxBlocks) {
    return 'Até $kLessonPlanMaxBlocks blocos por aula.';
  }
  for (var i = 0; i < d.blocks.length; i++) {
    final b = d.blocks[i];
    if (b.name.trim().isEmpty) return 'Dê um nome ao bloco ${i + 1}.';
    if (b.minutes < kLessonPlanBlockMinMin ||
        b.minutes > kLessonPlanBlockMaxMin) {
      return 'Tempo do bloco ${i + 1}: de 1 a 120 minutos.';
    }
  }
  if (lessonPlanTotalMinutes(d.blocks) > kLessonPlanMaxTotalMin) {
    return 'O plano passa de 4 horas.';
  }
  return null;
}

int lessonPlanTotalMinutes(Iterable<LessonPlanBlock> blocks) =>
    blocks.fold(0, (s, b) => s + b.minutes);

/// Duração da aula pelo horário (fim − início); sem horário, 60.
int lessonDurationFromTimes(String start, String end) {
  final s = professorParseMinutes(start);
  final e = professorParseMinutes(end);
  if (s == null || e == null || e <= s) return kLessonPlanDefaultDurationMin;
  return e - s;
}

/// Os blocos cabem na aula?
bool lessonPlanFits(int totalMin, int durationMin) => totalMin <= durationMin;

/// Fundamentos dos blocos, na ordem em que aparecem.
List<LessonPlanCategory> lessonPlanCategoriesOf(
  Iterable<LessonPlanBlock> blocks,
) =>
    {for (final b in blocks) b.category}.toList();

/// "QUI 22 OUT".
String lessonPlanDayLabel(String dateKey) {
  final w = arenaClassDateKeyWeekday(dateKey);
  final day = professorShortDate(dateKey);
  return (w == null ? day : '${arenaClassWeekdayShort(w)} $day').toUpperCase();
}

/// Ids novos para blocos copiados (modelo, plano anterior, biblioteca).
List<LessonPlanBlock> lessonPlanFreshBlocks(
  Iterable<LessonPlanBlock> blocks, {
  required String Function() nextId,
}) =>
    [for (final b in blocks) b.copyWith(id: nextId())];

// ── visão do aluno ───────────────────────────────────────────────────────

class LessonPlanViewBlock {
  const LessonPlanViewBlock({
    required this.name,
    required this.category,
    required this.minutes,
    this.note = '',
  });

  factory LessonPlanViewBlock.fromMap(Map<String, Object?> map) =>
      LessonPlanViewBlock(
        name: _str(map['name']),
        category: LessonPlanCategory.parse(map['category']),
        minutes: _int(map['minutes'], 0),
        note: _str(map['note']),
      );

  final String name;
  final LessonPlanCategory category;
  final int minutes;

  /// Vazia quando a nota é privada (o servidor apaga).
  final String note;
}

/// `lessonPlanViews/{viewId}` — o que o aluno vê.
class LessonPlanView {
  const LessonPlanView({
    required this.id,
    required this.planId,
    required this.professorName,
    required this.lessonTitle,
    required this.date,
    this.athleteId = '',
    this.professorUid = '',
    this.kind,
    this.startTime = '',
    this.endTime = '',
    this.arenaName = '',
    this.place = '',
    this.objective = '',
    this.tags = const [],
    this.blocks = const [],
    this.durationMin = 0,
    this.myFocus,
    this.planVisible = true,
    this.feedback,
    this.ratingStars,
  });

  factory LessonPlanView.fromMap(String id, Map<String, Object?> map) {
    final blocks = map['blocks'];
    final focus = _str(map['myFocus']);
    return LessonPlanView(
      id: id,
      planId: _str(map['planId']),
      athleteId: _str(map['athleteId']),
      professorUid: _str(map['professorUid']),
      kind: LessonPlanKind.parse(map['kind']),
      professorName: _str(map['professorName'], 'Seu professor'),
      lessonTitle: _str(map['lessonTitle'], 'Aula'),
      date: _str(map['date']),
      startTime: _str(map['startTime']),
      endTime: _str(map['endTime']),
      arenaName: _str(map['arenaName']),
      place: _str(map['place']),
      objective: _str(map['objective']),
      tags: _tags(map['tags']),
      blocks: blocks is List
          ? [
              for (final b in blocks)
                if (b is Map) LessonPlanViewBlock.fromMap(_map(b)),
            ]
          : const [],
      durationMin: _int(map['durationMin'], 0),
      myFocus: focus.isEmpty ? null : focus,
      // Visão antiga (sem o campo) só existia com o plano publicado.
      planVisible: map['planVisible'] != false,
      feedback: map['feedback'] is Map
          ? LessonViewFeedback.fromMap(_map(map['feedback']))
          : null,
      ratingStars: map['rating'] is Map
          ? switch (_map(map['rating'])['stars']) {
              final num n when n >= 1 && n <= 5 => n.toInt(),
              _ => null,
            }
          : null,
    );
  }

  final String id;
  final String planId;
  final String athleteId;
  final String professorUid;
  final LessonPlanKind? kind;
  final String professorName;
  final String lessonTitle;
  final String date;
  final String startTime;
  final String endTime;
  final String arenaName;
  final String place;
  final String objective;
  final List<LessonPlanCategory> tags;
  final List<LessonPlanViewBlock> blocks;
  final int durationMin;

  /// `null` sem foco ou com o foco privado.
  final String? myFocus;

  /// `false` = só o feedback (plano não publicado, despublicado ou apagado).
  final bool planVisible;

  /// Feedback do professor depois da aula (H9).
  final LessonViewFeedback? feedback;

  /// Estrelas que o aluno deu ao feedback.
  final int? ratingStars;

  int get totalMinutes => blocks.fold(0, (s, b) => s + b.minutes);
  int get lessonDurationMin => lessonDurationFromTimes(startTime, endTime);

  /// A visão é desta aula? (`planId` termina em `_{kind}_{refId}`).
  bool isFor(LessonPlanKind kind, String refId) =>
      planId.endsWith('_${kind.id}_$refId');
}

/// A visão do aluno para a aula (ou `null`).
LessonPlanView? lessonPlanViewFor(
  Iterable<LessonPlanView> views,
  LessonPlanKind kind,
  String refId,
) {
  for (final v in views) {
    if (v.isFor(kind, refId)) return v;
  }
  return null;
}

// ── modelos ──────────────────────────────────────────────────────────────

/// `professors/{uid}/lessonTemplates/{id}`.
class LessonTemplate {
  const LessonTemplate({
    required this.id,
    required this.name,
    this.level = 'Todos',
    this.objective = '',
    this.tags = const [],
    this.blocks = const [],
    this.uses = 0,
  });

  factory LessonTemplate.fromMap(String id, Map<String, Object?> map) {
    final blocks = map['blocks'];
    return LessonTemplate(
      id: id,
      name: _str(map['name'], 'Modelo'),
      level: _str(map['level'], 'Todos'),
      objective: _str(map['objective']),
      tags: _tags(map['tags']),
      blocks: blocks is List
          ? [
              for (var i = 0; i < blocks.length; i++)
                if (blocks[i] is Map)
                  LessonPlanBlock.fromMap(_map(blocks[i]), i),
            ]
          : const [],
      uses: _int(map['uses'], 0),
    );
  }

  final String id;
  final String name;
  final String level;
  final String objective;
  final List<LessonPlanCategory> tags;
  final List<LessonPlanBlock> blocks;
  final int uses;

  int get durationMin => lessonPlanTotalMinutes(blocks);

  /// Fundamentos para as etiquetas: os dos blocos (ou as tags).
  List<LessonPlanCategory> get categories {
    final fromBlocks = lessonPlanCategoriesOf(blocks);
    return fromBlocks.isEmpty ? tags : fromBlocks;
  }

  LessonPlanContent get content =>
      LessonPlanContent(objective: objective, tags: tags, blocks: blocks);
}

const int kLessonTemplateNameMax = 60;

/// Documento do modelo (só as chaves que a rule aceita).
Map<String, Object?> lessonTemplateDocument({
  required String name,
  required String level,
  required LessonPlanContent content,
  int uses = 0,
}) {
  final n = name.trim();
  return {
    'name': n.length > kLessonTemplateNameMax
        ? n.substring(0, kLessonTemplateNameMax)
        : n,
    'level': level,
    'objective': content.objective.trim(),
    'tags': [for (final t in content.tags.toSet()) t.name],
    'blocks': [
      for (final b in content.blocks.take(kLessonPlanMaxBlocks)) b.toMap(),
    ],
    'uses': uses,
  };
}

// ── exercícios ───────────────────────────────────────────────────────────

/// Exercício da biblioteca: da NexaGO (fixo no app) ou do professor
/// (`professors/{uid}/exercises/{id}`).
class LessonExercise {
  const LessonExercise({
    required this.id,
    required this.name,
    required this.category,
    required this.minutes,
    this.players = '',
    this.level = 'Todos',
    this.equipment = '',
    this.steps = const [],
    this.easier = '',
    this.harder = '',
    this.attention = '',
    this.videoUrl = '',
    this.uses = 0,
    this.builtIn = false,
  });

  factory LessonExercise.fromMap(String id, Map<String, Object?> map) {
    final steps = map['steps'];
    return LessonExercise(
      id: id,
      name: _str(map['name'], 'Exercício'),
      category: LessonPlanCategory.parse(map['category']),
      minutes: _int(map['minutes'], 10),
      players: _str(map['players']),
      level: _str(map['level'], 'Todos'),
      equipment: _str(map['equipment']),
      steps: steps is List
          ? [
              for (final s in steps)
                if (s is String && s.trim().isNotEmpty) s.trim(),
            ]
          : const [],
      easier: _str(map['easier']),
      harder: _str(map['harder']),
      attention: _str(map['attention']),
      videoUrl: _str(map['videoUrl']),
      uses: _int(map['uses'], 0),
    );
  }

  final String id;
  final String name;
  final LessonPlanCategory category;

  /// Duração sugerida.
  final int minutes;

  /// "2–6".
  final String players;
  final String level;
  final String equipment;
  final List<String> steps;
  final String easier;
  final String harder;
  final String attention;
  final String videoUrl;
  final int uses;
  final bool builtIn;

  bool get isOwn => !builtIn;
  String get sourceLabel => builtIn ? 'Biblioteca NexaGO' : 'Meu exercício';

  /// "2–6 jogadores · 6 cones" (o detalhe do bloco).
  String get detail => [
        if (players.isNotEmpty) '$players jogadores',
        if (equipment.isNotEmpty) equipment,
      ].join(' · ');

  /// O bloco do plano com [minutesInPlan] (ou a duração sugerida).
  LessonPlanBlock toBlock({required String blockId, int? minutesInPlan}) =>
      LessonPlanBlock(
        id: blockId,
        exerciseId: id,
        name: name,
        detail: detail,
        category: category,
        minutes: (minutesInPlan ?? minutes)
            .clamp(kLessonPlanBlockMinMin, kLessonPlanBlockMaxMin),
      );

  /// Busca por nome, fundamento, nível ou material (sem acento).
  bool matches(String query) {
    final q = _fold(query.trim());
    if (q.isEmpty) return true;
    return _fold('$name ${category.label} $level $equipment').contains(q);
  }
}

const int kLessonExerciseNameMax = 80;
const int kLessonExerciseMaxSteps = 12;

/// Formulário do exercício próprio.
class LessonExerciseInput {
  const LessonExerciseInput({
    required this.name,
    required this.category,
    required this.minutes,
    this.players = '',
    this.level = 'Todos',
    this.equipment = '',
    this.steps = const [],
    this.easier = '',
    this.harder = '',
    this.attention = '',
  });

  final String name;
  final LessonPlanCategory category;
  final int minutes;
  final String players;
  final String level;
  final String equipment;
  final List<String> steps;
  final String easier;
  final String harder;
  final String attention;

  List<String> get cleanSteps => [
        for (final s in steps)
          if (s.trim().isNotEmpty) s.trim(),
      ];
}

String? validateLessonExercise(LessonExerciseInput i) {
  final n = i.name.trim();
  if (n.isEmpty) return 'Dê um nome ao exercício.';
  if (n.length > kLessonExerciseNameMax) {
    return 'O nome vai até $kLessonExerciseNameMax caracteres.';
  }
  if (i.minutes < kLessonPlanBlockMinMin ||
      i.minutes > kLessonPlanBlockMaxMin) {
    return 'Duração de 1 a 120 minutos.';
  }
  if (i.cleanSteps.length > kLessonExerciseMaxSteps) {
    return 'Até $kLessonExerciseMaxSteps passos.';
  }
  return null;
}

/// Documento do exercício (só as chaves que a rule aceita; `minutes` int).
Map<String, Object?> lessonExerciseDocument(
  LessonExerciseInput i, {
  int uses = 0,
}) =>
    {
      'name': i.name.trim(),
      'category': i.category.name,
      'minutes': i.minutes,
      'players': i.players.trim(),
      'level': i.level,
      'equipment': i.equipment.trim(),
      'steps': i.cleanSteps.take(kLessonExerciseMaxSteps).toList(),
      'easier': i.easier.trim(),
      'harder': i.harder.trim(),
      'attention': i.attention.trim(),
      'videoUrl': '',
      'uses': uses,
    };

/// Biblioteca NexaGO: exercícios de beach tennis prontos para usar.
const List<LessonExercise> kNexagoExerciseLibrary = [
  LessonExercise(
    id: 'nexago-aquecimento-dinamico',
    builtIn: true,
    name: 'Aquecimento dinâmico',
    category: LessonPlanCategory.fisico,
    minutes: 8,
    players: '2–12',
    level: 'Todos',
    equipment: '4 cones',
    steps: [
      'Trote leve em volta da quadra por 2 minutos, pisando na areia fofa.',
      'Deslocamento lateral entre dois cones, mantendo os joelhos flexionados.',
      'Skipping alto e baixo na largura da quadra, ida e volta.',
      'Giros de tronco e de ombro com a raquete na mão.',
    ],
    easier: 'Só trote e mobilidade, sem skipping.',
    harder: 'Acrescentar sprints curtos de 5 metros ao sinal do professor.',
    attention: 'Areia exige mais do tornozelo: aumente a intensidade aos '
        'poucos e peça que avisem qualquer dor.',
  ),
  LessonExercise(
    id: 'nexago-agilidade-escada',
    builtIn: true,
    name: 'Agilidade com reação',
    category: LessonPlanCategory.fisico,
    minutes: 10,
    players: '2–8',
    level: 'Intermediário',
    equipment: '6 cones coloridos',
    steps: [
      'Montar um semicírculo de cones a 3 metros do aluno.',
      'O professor fala uma cor e o aluno toca o cone e volta ao centro.',
      'Séries de 30 segundos com 30 segundos de pausa.',
    ],
    easier: 'Usar só três cones e cores fixas na ordem.',
    harder: 'Sinal visual em vez de voz e devolver uma bola ao voltar.',
    attention: 'Voltar sempre de frente para a rede, em posição de espera.',
  ),
  LessonExercise(
    id: 'nexago-mini-tenis',
    builtIn: true,
    name: 'Mini-tênis de controle',
    category: LessonPlanCategory.toque,
    minutes: 7,
    players: '2–8',
    level: 'Todos',
    equipment: 'Bolas',
    steps: [
      'Dupla frente a frente, cada um perto da rede, em meia quadra.',
      'Trocar bolas suaves sem deixar cair, só com toque.',
      'Contar quantas trocas seguidas a dupla consegue.',
    ],
    easier: 'Permitir que a bola seja controlada com dois toques.',
    harder: 'Alternar forehand e backhand obrigatórios a cada bola.',
    attention: 'Sem smash: o objetivo é controle e sensibilidade.',
  ),
  LessonExercise(
    id: 'nexago-rali-fundo',
    builtIn: true,
    name: 'Rali de consistência no fundo',
    category: LessonPlanCategory.toque,
    minutes: 10,
    players: '2–4',
    level: 'Iniciante',
    equipment: 'Bolas',
    steps: [
      'Alunos no fundo de quadra, um de cada lado.',
      'Trocar bolas altas e profundas pelo meio da quadra.',
      'Cada dupla tenta bater o recorde de trocas da turma.',
    ],
    easier: 'Começar do meio da quadra e recuar a cada 10 trocas.',
    harder: 'Alvo de profundidade: a bola precisa cair depois da linha de '
        'cones.',
    attention: 'Raquete preparada cedo e batida à frente do corpo.',
  ),
  LessonExercise(
    id: 'nexago-saque-zonas',
    builtIn: true,
    name: 'Saque em zonas-alvo',
    category: LessonPlanCategory.saque,
    minutes: 15,
    players: '2–6',
    level: 'Intermediário',
    equipment: '6 cones · 20 bolas',
    steps: [
      'Dividir a quadra do recebedor em 3 zonas com cones (paralela, meio e '
          'cruzada).',
      'Cada aluno saca 5 bolas por rodada, anunciando a zona antes de sacar.',
      'O parceiro anota os acertos e eles trocam a cada rodada.',
    ],
    easier: 'Só 2 zonas e sacar de dentro da quadra.',
    harder: 'O parceiro sorteia a zona depois do lançamento da bola.',
    attention: 'Lançamento sempre à frente do corpo. Quem errar 3 seguidos '
        'volta para o saque por baixo.',
  ),
  LessonExercise(
    id: 'nexago-saque-ataque',
    builtIn: true,
    name: 'Saque curto + ataque',
    category: LessonPlanCategory.saque,
    minutes: 10,
    players: '2–4',
    level: 'Avançado',
    equipment: 'Bolas',
    steps: [
      'Sacar curto, perto da rede adversária.',
      'Subir à rede logo depois do saque.',
      'Finalizar a devolução com voleio ou smash.',
    ],
    easier: 'O recebedor devolve sempre alto, no meio.',
    harder: 'Devolução livre: o sacador precisa ler e se posicionar.',
    attention: 'Não parar de andar depois do saque: o primeiro passo decide '
        'a jogada.',
  ),
  LessonExercise(
    id: 'nexago-devolucao-cruzada',
    builtIn: true,
    name: 'Devolução cruzada em fila',
    category: LessonPlanCategory.devolucao,
    minutes: 15,
    players: '4–8',
    level: 'Intermediário',
    equipment: 'Bolas · 2 cones',
    steps: [
      'Fila de recebedores atrás da linha de fundo.',
      'O professor saca e o aluno devolve cruzado, entre os cones.',
      'Rodízio a cada 5 bolas.',
    ],
    easier: 'Saque por baixo, mais lento e no meio.',
    harder: 'Devolver e subir à rede para o voleio seguinte.',
    attention: 'Sair do saque já posicionado: base aberta e raquete à frente.',
  ),
  LessonExercise(
    id: 'nexago-devolucao-rede',
    builtIn: true,
    name: 'Devolução e subida à rede',
    category: LessonPlanCategory.devolucao,
    minutes: 12,
    players: '2–4',
    level: 'Avançado',
    equipment: 'Bolas',
    steps: [
      'O sacador alterna saques longos e curtos.',
      'O recebedor devolve no pé do adversário e sobe para a rede.',
      'Ponto jogado até o fim depois da devolução.',
    ],
    easier: 'Só saques longos e sem precisar subir.',
    harder: 'Ponto vale dobrado se a devolução for direto no pé.',
    attention: 'Devolução baixa antes de pensar em subir.',
  ),
  LessonExercise(
    id: 'nexago-voleio-bloqueio',
    builtIn: true,
    name: 'Voleio de bloqueio a dois',
    category: LessonPlanCategory.voleio,
    minutes: 10,
    players: '2',
    level: 'Todos',
    equipment: 'Bolas',
    steps: [
      'Um aluno na rede e o outro no meio da quadra.',
      'O do meio ataca em direção ao corpo do parceiro.',
      'O da rede bloqueia com raquete firme, sem balançar.',
      'Trocar de função a cada 10 bolas.',
    ],
    easier: 'Bolas mais lentas e na altura do peito.',
    harder: 'Ataques alternando lados e alturas.',
    attention: 'Raquete à frente do rosto e punho firme: é bloqueio, não '
        'golpe.',
  ),
  LessonExercise(
    id: 'nexago-smash-recuo',
    builtIn: true,
    name: 'Smash com recuo',
    category: LessonPlanCategory.smash,
    minutes: 12,
    players: '2–4',
    level: 'Intermediário',
    equipment: 'Bolas',
    steps: [
      'Aluno começa tocando a rede com a raquete.',
      'O professor lança uma bola alta (lob).',
      'O aluno recua de lado e finaliza com smash.',
    ],
    easier: 'Lob mais baixo e sem precisar tocar a rede antes.',
    harder: 'Escolher a direção do smash que o professor anunciar.',
    attention: 'Recuar de lado, nunca de costas. Braço esquerdo aponta a bola.',
  ),
  LessonExercise(
    id: 'nexago-jogo-reduzido',
    builtIn: true,
    name: 'Jogo reduzido 2×2 · só cruzado',
    category: LessonPlanCategory.jogo,
    minutes: 10,
    players: '4',
    level: 'Intermediário',
    equipment: 'Cones de meia quadra',
    steps: [
      'Usar só a diagonal da quadra (meia quadra cruzada).',
      'Pontos normais, sempre na diagonal.',
      'Ponto vale 2 se a devolução cair na zona marcada.',
    ],
    easier: 'Sem smash e saque por baixo.',
    harder: 'Liberar a paralela só para o voleio.',
    attention: 'Comunicação da dupla: quem fica com a bola do meio.',
  ),
  LessonExercise(
    id: 'nexago-rei-da-quadra',
    builtIn: true,
    name: 'Rei da quadra',
    category: LessonPlanCategory.jogo,
    minutes: 15,
    players: '6–10',
    level: 'Todos',
    equipment: 'Bolas',
    steps: [
      'Uma dupla é a "rei", do lado da realeza.',
      'As desafiantes entram uma por vez do outro lado.',
      'Ponto único: quem vence fica (ou sobe para o lado rei).',
    ],
    easier: 'Pontos de dois toques, sem saque.',
    harder: 'A dupla rei precisa vencer 2 pontos seguidos para pontuar.',
    attention: 'Fila andando rápido: todo mundo joga muito em pouco tempo.',
  ),
];

// ── próximas aulas (H1) ──────────────────────────────────────────────────

/// Uma aula do professor que pode ter plano.
class PlannableLesson {
  const PlannableLesson({
    required this.kind,
    required this.refId,
    required this.date,
    required this.startMin,
    required this.endMin,
    required this.title,
    required this.typeLabel,
    this.classId,
    this.place = '',
    this.arenaName,
  });

  final LessonPlanKind kind;
  final String refId;

  /// Turma (só nas aulas de turma): o "Repetir anterior".
  final String? classId;
  final String date;
  final int startMin;
  final int endMin;
  final String title;
  final String typeLabel;
  final String place;
  final String? arenaName;

  int get durationMin =>
      endMin > startMin ? endMin - startMin : kLessonPlanDefaultDurationMin;
  String get startLabel => professorMinutesLabel(startMin);
  String planId(String uid) => lessonPlanId(uid, kind, refId);
}

/// As aulas (sem bloqueio e sem canceladas) de [fromKey] a [toKey].
List<PlannableLesson> plannableLessonsFrom(
  Iterable<ProfessorAgendaItem> items, {
  required String fromKey,
  required String toKey,
}) {
  final out = <PlannableLesson>[];
  for (final i in items) {
    if (i.isBlock || i.canceled) continue;
    if (i.date.compareTo(fromKey) < 0 || i.date.compareTo(toKey) > 0) continue;
    final (LessonPlanKind kind, String refId, String? classId) =
        switch (i.kind) {
      ProfessorAgendaKind.session => (
          LessonPlanKind.session,
          i.session!.sessionId,
          i.session!.classId,
        ),
      ProfessorAgendaKind.lesson => (
          LessonPlanKind.lesson,
          i.lesson!.bookingId,
          null,
        ),
      ProfessorAgendaKind.privateLesson => (
          LessonPlanKind.privateLesson,
          i.privateLesson!.id,
          null,
        ),
      ProfessorAgendaKind.block => (LessonPlanKind.session, '', null),
    };
    if (refId.isEmpty) continue;
    out.add(PlannableLesson(
      kind: kind,
      refId: refId,
      classId: classId,
      date: i.date,
      startMin: i.startMin,
      endMin: i.endMin,
      title: i.title,
      typeLabel: i.typeLabel,
      place: i.place,
      arenaName: i.arenaName,
    ));
  }
  return out;
}

enum LessonPlanRowStatus {
  ready('PRONTO'),
  draft('RASCUNHO'),
  none('SEM PLANO');

  const LessonPlanRowStatus(this.label);

  final String label;
}

/// Linha da aba Próximas: a aula, o plano dela e o plano anterior da mesma
/// turma (para "Repetir anterior").
class LessonPlanRow {
  const LessonPlanRow({required this.lesson, this.plan, this.previous});

  final PlannableLesson lesson;
  final LessonPlan? plan;
  final LessonPlan? previous;

  LessonPlanRowStatus get status => plan == null
      ? LessonPlanRowStatus.none
      : plan!.isReady
          ? LessonPlanRowStatus.ready
          : LessonPlanRowStatus.draft;
}

/// O plano mais recente de outra aula da mesma turma antes de [lesson]
/// (com blocos). Só aulas de turma.
LessonPlan? previousLessonPlanFor(
  PlannableLesson lesson,
  Iterable<LessonPlan> plans,
) {
  final classId = lesson.classId;
  if (lesson.kind != LessonPlanKind.session || classId == null) return null;
  LessonPlan? best;
  for (final p in plans) {
    if (p.kind != LessonPlanKind.session || p.refId == lesson.refId) continue;
    if (p.blocks.isEmpty || p.date.compareTo(lesson.date) > 0) continue;
    if (lessonPlanSessionClassId(p.refId) != classId) continue;
    if (best == null || p.date.compareTo(best.date) > 0) best = p;
  }
  return best;
}

List<LessonPlanRow> lessonPlanRows({
  required List<PlannableLesson> lessons,
  required List<LessonPlan> plans,
  required String uid,
}) {
  final byId = {for (final p in plans) p.id: p};
  return [
    for (final l in lessons)
      LessonPlanRow(
        lesson: l,
        plan: byId[l.planId(uid)],
        previous: byId[l.planId(uid)] == null
            ? previousLessonPlanFor(l, plans)
            : null,
      ),
  ];
}

/// "5 PRÓXIMAS · 2 SEM PLANO".
String lessonPlanRowsSummary(List<LessonPlanRow> rows) {
  final without =
      rows.where((r) => r.status == LessonPlanRowStatus.none).length;
  return '${rows.length} PRÓXIMA${rows.length == 1 ? '' : 'S'} · '
      '$without SEM PLANO';
}

// ── alunos da aula (getLessonStudents) ───────────────────────────────────

class LessonPlanStudent {
  const LessonPlanStudent({required this.athleteId, required this.name});

  final String athleteId;
  final String name;
}

/// Dados da aula e alunos (retorno de `getLessonStudents`).
class LessonPlanLesson {
  const LessonPlanLesson({
    required this.planId,
    required this.title,
    required this.date,
    this.startTime = '',
    this.endTime = '',
    this.arenaName = '',
    this.place = '',
    this.students = const [],
  });

  factory LessonPlanLesson.fromMap(Map<String, Object?> map) {
    final students = map['students'];
    return LessonPlanLesson(
      planId: _str(map['planId']),
      title: _str(map['title'], 'Aula'),
      date: _str(map['date']),
      startTime: _str(map['startTime']),
      endTime: _str(map['endTime']),
      arenaName: _str(map['arenaName']),
      place: _str(map['place']),
      students: students is List
          ? [
              for (final s in students)
                if (s is Map && _str(s['athleteId']).isNotEmpty)
                  LessonPlanStudent(
                    athleteId: _str(s['athleteId']),
                    name: _str(s['name'], 'Aluno'),
                  ),
            ]
          : const [],
    );
  }

  final String planId;
  final String title;
  final String date;
  final String startTime;
  final String endTime;
  final String arenaName;
  final String place;
  final List<LessonPlanStudent> students;

  int get durationMin => lessonDurationFromTimes(startTime, endTime);
}

// ── pós-aula (H7) e feedback (H9) ────────────────────────────────────────

/// Como foi cada bloco.
enum LessonBlockRating {
  ok('Funcionou'),
  adjust('Ajustar'),
  no('Não rolou'),
  skipped('Pulado');

  const LessonBlockRating(this.label);

  final String label;

  static LessonBlockRating? parse(Object? raw) {
    for (final r in values) {
      if (r.name == raw) return r;
    }
    return null;
  }
}

/// "Para treinar até a próxima".
class LessonHomework {
  const LessonHomework({required this.name, this.detail = ''});

  static LessonHomework? fromMap(Object? raw) {
    if (raw is! Map) return null;
    final m = _map(raw);
    final name = _str(m['name']);
    return name.isEmpty
        ? null
        : LessonHomework(name: name, detail: _str(m['detail']));
  }

  final String name;
  final String detail;

  Map<String, Object?> toMap() =>
      {'name': name.trim(), 'detail': detail.trim()};
}

/// Feedback de um aluno no registro (H7).
class LessonFeedbackEntry {
  const LessonFeedbackEntry({
    required this.athleteId,
    required this.name,
    this.text = '',
    this.send = true,
    this.homework,
    this.sentAt,
  });

  factory LessonFeedbackEntry.fromMap(Map<String, Object?> map) =>
      LessonFeedbackEntry(
        athleteId: _str(map['athleteId']),
        name: _str(map['name'], 'Aluno'),
        text: _str(map['text']),
        send: map['send'] == true,
        homework: LessonHomework.fromMap(map['homework']),
        sentAt: _instant(map['sentAt']),
      );

  final String athleteId;
  final String name;
  final String text;
  final bool send;
  final LessonHomework? homework;

  /// Quando o texto atual foi enviado (`null` = nunca).
  final DateTime? sentAt;
}

/// `lessonPlans/{planId}.review`.
class LessonReview {
  const LessonReview({
    this.blockRatings = const {},
    this.generalNote = '',
    this.feedback = const [],
    this.reviewedAt,
  });

  factory LessonReview.fromMap(Map<String, Object?> map) {
    final ratings = map['blockRatings'];
    final feedback = map['feedback'];
    return LessonReview(
      blockRatings: ratings is Map
          ? {
              for (final e in _map(ratings).entries)
                if (LessonBlockRating.parse(e.value) case final r?) e.key: r,
            }
          : const {},
      generalNote: _str(map['generalNote']),
      feedback: feedback is List
          ? [
              for (final f in feedback)
                if (f is Map) LessonFeedbackEntry.fromMap(_map(f)),
            ]
          : const [],
      reviewedAt: _instant(map['reviewedAt']),
    );
  }

  final Map<String, LessonBlockRating> blockRatings;
  final String generalNote;
  final List<LessonFeedbackEntry> feedback;
  final DateTime? reviewedAt;

  LessonFeedbackEntry? feedbackOf(String athleteId) {
    for (final f in feedback) {
      if (f.athleteId == athleteId) return f;
    }
    return null;
  }
}

/// O que o registro manda a `saveLessonReview`.
class LessonReviewDraft {
  const LessonReviewDraft({
    required this.planId,
    this.blockRatings = const {},
    this.generalNote = '',
    this.feedback = const [],
  });

  final String planId;
  final Map<String, LessonBlockRating> blockRatings;
  final String generalNote;
  final List<LessonFeedbackEntry> feedback;

  Map<String, Object?> toPayload() => {
        'planId': planId,
        'blockRatings': {
          for (final e in blockRatings.entries) e.key: e.value.name,
        },
        'generalNote': generalNote.trim(),
        'feedback': [
          for (final f in feedback)
            if (f.text.trim().isNotEmpty)
              {
                'athleteId': f.athleteId,
                'text': f.text.trim(),
                'send': f.send,
                'homework': f.homework?.toMap(),
              },
        ],
      };
}

/// O feedback de [entry] sai agora? Marcado para enviar, com texto, e o
/// texto mudou desde o último envio ([previous]).
bool lessonFeedbackWillSend(
  LessonFeedbackEntry entry,
  LessonFeedbackEntry? previous,
) =>
    entry.send &&
    entry.text.trim().isNotEmpty &&
    !(previous?.sentAt != null && previous!.text == entry.text.trim());

/// Quantos feedbacks o "Salvar e enviar" manda.
int lessonReviewSendCount(LessonReviewDraft draft, LessonReview? previous) =>
    draft.feedback
        .where(
            (f) => lessonFeedbackWillSend(f, previous?.feedbackOf(f.athleteId)))
        .length;

/// `lessonPlanViews/{viewId}.feedback`.
class LessonViewFeedback {
  const LessonViewFeedback({required this.text, this.homework, this.sentAt});

  factory LessonViewFeedback.fromMap(Map<String, Object?> map) =>
      LessonViewFeedback(
        text: _str(map['text']),
        homework: LessonHomework.fromMap(map['homework']),
        sentAt: _instant(map['sentAt']),
      );

  final String text;
  final LessonHomework? homework;
  final DateTime? sentAt;
}

/// "há 12 min", "há 3 h", "há 2 dias", "agora".
String lessonRelativeAgo(DateTime at, DateTime now) {
  final d = now.difference(at);
  if (d.inMinutes < 1) return 'agora';
  if (d.inMinutes < 60) return 'há ${d.inMinutes} min';
  if (d.inHours < 24) return 'há ${d.inHours} h';
  final days = d.inDays;
  return 'há $days dia${days == 1 ? '' : 's'}';
}

/// "QUI 22".
String lessonPlanWeekdayDay(String dateKey) {
  final w = arenaClassDateKeyWeekday(dateKey);
  final d = DateTime.tryParse(dateKey);
  if (w == null || d == null) return dateKey;
  return '${arenaClassWeekdayShort(w)} ${d.day}'.toUpperCase();
}

// ── modo aula (H6) ───────────────────────────────────────────────────────

/// Quanto falta no bloco (negativo = passou do tempo).
Duration lessonLiveRemaining(int blockMinutes, Duration elapsed) =>
    Duration(minutes: blockMinutes) - elapsed;

/// "12:47" ou, passado do tempo, "+01:05".
String lessonLiveClockLabel(Duration remaining) {
  final over = remaining.isNegative;
  final s = remaining.abs().inSeconds;
  final mm = (s ~/ 60).toString().padLeft(2, '0');
  final ss = (s % 60).toString().padLeft(2, '0');
  return '${over ? '+' : ''}$mm:$ss';
}

// ── auxiliares ───────────────────────────────────────────────────────────

String _str(Object? v, [String fallback = '']) =>
    v is String && v.trim().isNotEmpty ? v.trim() : fallback;

int _int(Object? v, int fallback) => switch (v) {
      int i => i,
      num n => n.round(),
      String s => int.tryParse(s) ?? fallback,
      _ => fallback,
    };

Map<String, Object?> _map(Object? v) =>
    (v as Map).map((k, value) => MapEntry(k.toString(), value));

List<LessonPlanCategory> _tags(Object? v) => v is List
    ? {
        for (final t in v)
          if (t is String) LessonPlanCategory.parse(t),
      }.toList()
    : const [];

String _fold(String s) {
  const from = 'áàâãäéèêëíìîïóòôõöúùûüç';
  const to = 'aaaaaeeeeiiiiooooouuuuc';
  final lower = s.toLowerCase();
  final b = StringBuffer();
  for (final ch in lower.split('')) {
    final i = from.indexOf(ch);
    b.write(i < 0 ? ch : to[i]);
  }
  return b.toString();
}

DateTime? _instant(Object? v) => switch (v) {
      Timestamp t => t.toDate().toUtc(),
      DateTime d => d.toUtc(),
      _ => null,
    };
