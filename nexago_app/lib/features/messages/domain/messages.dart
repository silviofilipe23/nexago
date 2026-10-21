import 'package:cloud_firestore/cloud_firestore.dart';

import '../../../core/search/search_keywords.dart';
import '../../../core/time/nexago_event_timezone.dart';

/// Mensagens professor ↔ aluno (D1–D3, D5–D7): conversa direta e grupo da
/// turma. A conversa é das functions (`functions/src/professor-messages.ts`);
/// a mensagem o MEMBRO grava direto (rules validam remetente, campos e
/// tamanho). Respostas rápidas e horário de atendimento são do professor.

enum ConversationKind { direct, classGroup }

/// Última mensagem (resumo na caixa).
class ConversationPreview {
  const ConversationPreview({
    required this.text,
    required this.senderUid,
    this.senderName = '',
  });

  static ConversationPreview? fromMap(Object? raw) {
    if (raw is! Map) return null;
    return ConversationPreview(
      text: _str(raw['text']),
      senderUid: _str(raw['senderUid']),
      senderName: _str(raw['senderName']),
    );
  }

  final String text;
  final String senderUid;
  final String senderName;
}

/// `conversations/{id}`.
class Conversation {
  const Conversation({
    required this.id,
    required this.kind,
    required this.professorUid,
    required this.memberIds,
    this.athleteUid,
    this.classId,
    this.arenaId,
    this.arenaName,
    this.title,
    this.memberNames = const {},
    this.memberPhotos = const {},
    this.lastMessage,
    this.lastAt,
    this.unread = const {},
    this.closed = false,
  });

  factory Conversation.fromMap(String id, Map<String, Object?> map) {
    Map<String, T> mapOf<T>(Object? raw, T? Function(Object?) read) {
      final out = <String, T>{};
      if (raw is Map) {
        raw.forEach((k, v) {
          final value = read(v);
          if (value != null) out[k.toString()] = value;
        });
      }
      return out;
    }

    final members = map['memberIds'];
    return Conversation(
      id: id,
      kind: map['kind'] == 'class'
          ? ConversationKind.classGroup
          : ConversationKind.direct,
      professorUid: _str(map['professorUid']),
      athleteUid: _strOrNull(map['athleteUid']),
      classId: _strOrNull(map['classId']),
      arenaId: _strOrNull(map['arenaId']),
      arenaName: _strOrNull(map['arenaName']),
      title: _strOrNull(map['title']),
      memberIds:
          members is List ? members.whereType<String>().toList() : const [],
      memberNames: mapOf<String>(map['memberNames'], _strOrNull),
      memberPhotos: mapOf<String>(map['memberPhotos'], _strOrNull),
      lastMessage: ConversationPreview.fromMap(map['lastMessage']),
      lastAt: _date(map['lastAt']),
      unread: mapOf<int>(map['unread'], (v) => v is num ? v.toInt() : null),
      closed: map['closed'] == true,
    );
  }

  final String id;
  final ConversationKind kind;
  final String professorUid;
  final String? athleteUid;
  final String? classId;
  final String? arenaId;
  final String? arenaName;

  /// Nome da turma (grupo).
  final String? title;
  final List<String> memberIds;
  final Map<String, String> memberNames;
  final Map<String, String> memberPhotos;
  final ConversationPreview? lastMessage;
  final DateTime? lastAt;
  final Map<String, int> unread;

  /// Encerrada (aluno saiu da turma/carteira ou o professor perdeu o
  /// vínculo): histórico só leitura, sem composer.
  final bool closed;

  bool get isGroup => kind == ConversationKind.classGroup;

  /// Alunos no grupo (sem o professor).
  int get studentCount => memberIds.where((m) => m != professorUid).length;

  int unreadFor(String uid) => unread[uid] ?? 0;

  /// O outro lado da conversa direta.
  String? otherUid(String viewerUid) {
    for (final m in memberIds) {
      if (m != viewerUid) return m;
    }
    return null;
  }

  String titleFor(String viewerUid) {
    if (isGroup) return title ?? 'Turma';
    final other = otherUid(viewerUid);
    return (other == null ? null : memberNames[other]) ?? 'Conversa';
  }

  String? photoFor(String viewerUid) {
    if (isGroup) return null;
    final other = otherUid(viewerUid);
    return other == null ? null : memberPhotos[other];
  }

  String nameOf(String uid) => memberNames[uid] ?? 'Aluno';
}

/// `conversations/{id}/messages/{id}`.
class ChatMessage {
  const ChatMessage({
    required this.id,
    required this.senderUid,
    required this.text,
    this.senderName = '',
    this.createdAt,
    this.auto = false,
  });

  factory ChatMessage.fromMap(String id, Map<String, Object?> map) =>
      ChatMessage(
        id: id,
        senderUid: _str(map['senderUid']),
        senderName: _str(map['senderName']),
        text: _str(map['text']),
        createdAt: _date(map['createdAt']),
        auto: map['auto'] == true,
      );

  final String id;
  final String senderUid;
  final String senderName;
  final String text;

  /// `null` enquanto o servidor não carimba (mensagem que acabei de mandar).
  final DateTime? createdAt;

  /// Resposta automática do horário de atendimento.
  final bool auto;
}

/// `users/{uid}/messageTemplates/{id}` (D6).
class MessageTemplate {
  const MessageTemplate({
    required this.id,
    required this.title,
    required this.body,
    this.uses = 0,
    this.updatedAt,
  });

  factory MessageTemplate.fromMap(String id, Map<String, Object?> map) =>
      MessageTemplate(
        id: id,
        title: _str(map['title']),
        body: _str(map['body']),
        uses: map['uses'] is num ? (map['uses'] as num).toInt() : 0,
        updatedAt: _date(map['updatedAt']),
      );

  final String id;
  final String title;
  final String body;
  final int uses;
  final DateTime? updatedAt;
}

/// `users/{uid}/messagingPrefs/settings` (D7).
class MessagingPrefs {
  const MessagingPrefs({
    this.quietEnabled = false,
    this.from = '06:00',
    this.to = '22:00',
    this.days = const [1, 2, 3, 4, 5, 6],
    this.autoReplyEnabled = false,
    this.autoReplyText = '',
  });

  factory MessagingPrefs.fromMap(Map<String, Object?>? map) {
    if (map == null) return const MessagingPrefs();
    String hhmm(Object? v, String d) =>
        v is String && kHhMm.hasMatch(v) ? v : d;
    final days = map['days'];
    return MessagingPrefs(
      quietEnabled: map['quietEnabled'] == true,
      from: hhmm(map['from'], '06:00'),
      to: hhmm(map['to'], '22:00'),
      days: days is List
          ? (days.whereType<num>().map((n) => n.toInt()).where(
                (n) => n >= 1 && n <= 7,
              )).toList()
          : const [1, 2, 3, 4, 5, 6],
      autoReplyEnabled: map['autoReplyEnabled'] == true,
      autoReplyText: _str(map['autoReplyText']),
    );
  }

  final bool quietEnabled;
  final String from;
  final String to;

  /// ISO 1–7 (seg–dom) em que atende.
  final List<int> days;
  final bool autoReplyEnabled;
  final String autoReplyText;

  /// Campos exatos da rule (sem `updatedAt`: o repositório soma).
  Map<String, Object?> toMap() => {
        'quietEnabled': quietEnabled,
        'from': from,
        'to': to,
        'days': [...days]..sort(),
        'autoReplyEnabled': autoReplyEnabled,
        'autoReplyText': autoReplyText.trim().length > kAutoReplyMax
            ? autoReplyText.trim().substring(0, kAutoReplyMax)
            : autoReplyText.trim(),
      };
}

/// Professor com quem o aluno pode conversar (`getMyProfessors`).
class MyProfessor {
  const MyProfessor({
    required this.professorUid,
    required this.name,
    this.photoUrl,
  });

  factory MyProfessor.fromMap(Map<String, Object?> map) => MyProfessor(
        professorUid: _str(map['professorUid']),
        name: _str(map['name']).isEmpty ? 'Professor' : _str(map['name']),
        photoUrl: _strOrNull(map['photoUrl']),
      );

  final String professorUid;
  final String name;
  final String? photoUrl;
}

// ── limites (rules) ──────────────────────────────────────────────────────

const int kMessageTextMax = 2000;
const int kTemplateTitleMax = 60;
const int kTemplateBodyMax = 1000;
const int kAutoReplyMax = 500;
final RegExp kHhMm = RegExp(r'^[0-2][0-9]:[0-5][0-9]$');

// ── caixa (D1) ───────────────────────────────────────────────────────────

enum InboxFilter { all, unread, classes }

/// Mais recentes primeiro; conversa sem mensagem vai para o fim.
List<Conversation> sortInbox(List<Conversation> list) =>
    [...list]..sort((a, b) {
        final x = a.lastAt, y = b.lastAt;
        if (x == null && y == null) return 0;
        if (x == null) return 1;
        if (y == null) return -1;
        return y.compareTo(x);
      });

List<Conversation> filterInbox(
  List<Conversation> list, {
  required String viewerUid,
  InboxFilter filter = InboxFilter.all,
  String query = '',
}) {
  final term = normalizeSearchTerm(query);
  return [
    for (final c in sortInbox(list))
      if (switch (filter) {
            InboxFilter.all => true,
            InboxFilter.unread => c.unreadFor(viewerUid) > 0,
            InboxFilter.classes => c.isGroup,
          } &&
          (term.isEmpty ||
              normalizeSearchTerm(c.titleFor(viewerUid)).contains(term)))
        c,
  ];
}

/// Não lidas somadas (badge da aba).
int totalUnread(List<Conversation> list, String viewerUid) =>
    list.fold(0, (s, c) => s + c.unreadFor(viewerUid));

/// Conversas com algo não lido.
int unreadConversations(List<Conversation> list, String viewerUid) =>
    list.where((c) => c.unreadFor(viewerUid) > 0).length;

/// Linha de baixo da caixa: "Você: …", no grupo "Marina: …".
String inboxPreview(Conversation c, String viewerUid) {
  final m = c.lastMessage;
  if (m == null || m.text.isEmpty) {
    return c.isGroup ? 'Grupo criado' : 'Nova conversa';
  }
  if (m.senderUid == viewerUid) return 'Você: ${m.text}';
  if (c.isGroup) {
    final name =
        firstName(m.senderName.isEmpty ? c.nameOf(m.senderUid) : m.senderName);
    return '$name: ${m.text}';
  }
  return m.text;
}

/// "Paulo" de "Paulo Viana".
String firstName(String full) {
  final t = full.trim();
  if (t.isEmpty) return '';
  return t.split(RegExp(r'\s+')).first;
}

// ── horários ─────────────────────────────────────────────────────────────

const _weekdays = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const _months = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
];

DateTime _day(DateTime d) => DateTime(d.year, d.month, d.day);

/// Caixa: "17:32" hoje, "Ontem", "Ter" na semana, "05 out" antes (parede SP).
String inboxTimeLabel(DateTime? at, DateTime now) {
  if (at == null) return '';
  final w = toNexagoEventLocal(at);
  final today = _day(toNexagoEventLocal(now));
  final diff = today.difference(_day(w)).inDays;
  if (diff <= 0) {
    return '${w.hour.toString().padLeft(2, '0')}:'
        '${w.minute.toString().padLeft(2, '0')}';
  }
  if (diff == 1) return 'Ontem';
  if (diff < 7) return _weekdays[w.weekday - 1];
  return '${w.day.toString().padLeft(2, '0')} ${_months[w.month - 1]}';
}

/// Separador de dia na conversa: "HOJE", "ONTEM", "TER, 20 OUT".
String messageDayLabel(DateTime at, DateTime now) {
  final w = toNexagoEventLocal(at);
  final today = _day(toNexagoEventLocal(now));
  final diff = today.difference(_day(w)).inDays;
  if (diff <= 0) return 'HOJE';
  if (diff == 1) return 'ONTEM';
  return '${_weekdays[w.weekday - 1]}, ${w.day.toString().padLeft(2, '0')} '
          '${_months[w.month - 1]}'
      .toUpperCase();
}

/// "17:32" (parede SP).
String messageTimeLabel(DateTime? at) {
  if (at == null) return '';
  final w = toNexagoEventLocal(at);
  return '${w.hour.toString().padLeft(2, '0')}:'
      '${w.minute.toString().padLeft(2, '0')}';
}

/// Chave do dia (SP) para o separador; mensagem sem carimbo é "agora".
String messageDayKey(DateTime? at, DateTime now) =>
    nexagoEventDayKey(at ?? now);

// ── envio e modelos ──────────────────────────────────────────────────────

/// Texto pronto para mandar (`null` se vazio). Corta no teto da rule.
String? cleanMessageText(String raw) {
  final t = raw.trim();
  if (t.isEmpty) return null;
  return t.length > kMessageTextMax ? t.substring(0, kMessageTextMax) : t;
}

/// Preenche o modelo: `{nome}` vira o primeiro nome do aluno na conversa
/// direta; os demais campos (`{data}`, `{link}`…) ficam para o professor
/// completar antes de mandar.
String applyTemplate(String body, {String? recipientName}) {
  final name = recipientName == null ? '' : firstName(recipientName);
  if (name.isEmpty) return body;
  return body.replaceAll('{nome}', name);
}

/// Campos `{…}` que ainda faltam preencher.
List<String> templatePlaceholders(String text) => [
      for (final m in RegExp(r'\{[^}\s]+\}').allMatches(text)) m.group(0)!,
    ];

String? validateTemplate({required String title, required String body}) {
  final t = title.trim(), b = body.trim();
  if (t.isEmpty || t.length > kTemplateTitleMax) {
    return 'Dê um nome ao modelo (até $kTemplateTitleMax caracteres).';
  }
  if (b.isEmpty || b.length > kTemplateBodyMax) {
    return 'Escreva o texto (até $kTemplateBodyMax caracteres).';
  }
  return null;
}

/// Mais usados primeiro (chips do composer e a lista).
List<MessageTemplate> sortTemplates(List<MessageTemplate> list) => [...list]
  ..sort((a, b) {
    final u = b.uses.compareTo(a.uses);
    return u != 0 ? u : a.title.toLowerCase().compareTo(b.title.toLowerCase());
  });

/// "Das" igual a "Até" = o dia inteiro.
bool prefsWholeDay(MessagingPrefs p) => p.from == p.to;

String? validatePrefs(MessagingPrefs p) {
  if (!kHhMm.hasMatch(p.from) || !kHhMm.hasMatch(p.to)) {
    return 'Use o formato 00:00.';
  }
  if (p.days.isEmpty) return 'Escolha pelo menos um dia.';
  if (p.autoReplyEnabled && p.autoReplyText.trim().isEmpty) {
    return 'Escreva a resposta automática.';
  }
  if (p.autoReplyText.trim().length > kAutoReplyMax) {
    return 'A resposta automática vai até $kAutoReplyMax caracteres.';
  }
  return null;
}

String _str(Object? v) => v is String ? v.trim() : '';

String? _strOrNull(Object? v) =>
    v is String && v.trim().isNotEmpty ? v.trim() : null;

DateTime? _date(Object? v) => switch (v) {
      Timestamp t => t.toDate(),
      DateTime d => d,
      String s => DateTime.tryParse(s),
      _ => null,
    };
