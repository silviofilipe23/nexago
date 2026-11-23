import Foundation

/// Onde o app grava o snapshot da Agenda (`AppDelegate.swift`, canal
/// `nexago/home_widget`) e o widget lê. Mesmo JSON do widget Android
/// (`encodeAgendaWidgetSnapshot` no Dart).
enum NextGameStore {
  static let appGroup = "group.br.com.nexago.nexagoApp"
  static let key = "agenda_snapshot"

  static func load() -> NextGameSnapshot? {
    guard let json = UserDefaults(suiteName: appGroup)?.string(forKey: key) else { return nil }
    return NextGameSnapshot.parse(json)
  }
}

/// Um compromisso do snapshot. Datas em milissegundos no JSON.
struct NextGameEntry: Equatable {
  let id: String
  let label: String
  let title: String
  let detail: String
  let startsAt: Date
  let endsAt: Date
  let allDay: Bool
  let color: UInt32
}

struct NextGameSnapshot: Equatable {
  let signedIn: Bool
  let entries: [NextGameEntry]

  private struct Raw: Decodable {
    let signedIn: Bool?
    let items: [RawItem]?
  }

  private struct RawItem: Decodable {
    let id: String?
    let label: String?
    let title: String?
    let detail: String?
    let startsAt: Double?
    let endsAt: Double?
    let allDay: Bool?
    let color: Double?
  }

  static func parse(_ json: String) -> NextGameSnapshot? {
    guard let data = json.data(using: .utf8),
          let raw = try? JSONDecoder().decode(Raw.self, from: data) else { return nil }
    let entries = (raw.items ?? []).compactMap { item -> NextGameEntry? in
      guard let start = item.startsAt, let end = item.endsAt else { return nil }
      return NextGameEntry(
        id: item.id ?? "",
        label: item.label ?? "",
        title: item.title ?? "",
        detail: item.detail ?? "",
        startsAt: Date(timeIntervalSince1970: start / 1000),
        endsAt: Date(timeIntervalSince1970: end / 1000),
        allDay: item.allDay ?? false,
        color: UInt32(truncatingIfNeeded: Int64(item.color ?? 0xFF6E_B5FF))
      )
    }
    return NextGameSnapshot(signedIn: raw.signedIn ?? false, entries: entries)
  }

  /// O que ainda não acabou, na ordem do relógio.
  func upcoming(now: Date) -> [NextGameEntry] {
    entries.filter { $0.endsAt > now }.sorted { $0.startsAt < $1.startsAt }
  }
}

/// Regras de exibição do widget "Próximo jogo" (W1), as mesmas do
/// `NextGameWidgetModel.kt` do Android.
enum NextGameFormat {
  /// Até aqui a contagem é regressiva; mais longe, mostra o dia e a hora.
  static let countdownWindow: TimeInterval = 24 * 60 * 60

  private static let ptBR = Locale(identifier: "pt_BR")

  /// Até onde vai uma timeline com contagem: depois disso o widget pede outra
  /// (≈ 8 recargas por dia, dentro do orçamento do WidgetKit).
  static let timelineHorizon: TimeInterval = 3 * 60 * 60

  /// Quando o widget precisa se redesenhar: ao entrar na janela da contagem,
  /// no início (vira "Agora") e no fim (passa ao seguinte).
  static func nextRefresh(_ entries: [NextGameEntry], now: Date) -> Date? {
    guard let first = entries.first else { return nil }
    return [first.startsAt.addingTimeInterval(-countdownWindow), first.startsAt, first.endsAt]
      .filter { $0 > now }
      .min()
  }

  /// Se a contagem aparece para este compromisso neste instante.
  static func showsCountdown(_ entry: NextGameEntry, now: Date) -> Bool {
    let untilStart = entry.startsAt.timeIntervalSince(now)
    return !entry.allDay && untilStart > 0 && untilStart <= countdownWindow
  }

  /// Pontos da timeline até [timelineHorizon]: agora, as viradas e, enquanto a
  /// contagem aparece, cada minuto cheio — a contagem é "1h52", sem segundos.
  static func timelineDates(_ snapshot: NextGameSnapshot?, now: Date) -> [Date] {
    let limit = now.addingTimeInterval(timelineHorizon)
    var dates: Set<Date> = [now]
    var cursor = now
    while let snapshot,
          let next = nextRefresh(snapshot.upcoming(now: cursor), now: cursor),
          next <= limit {
      dates.insert(next)
      cursor = next.addingTimeInterval(1)
    }
    if let snapshot {
      let calendar = Calendar(identifier: .gregorian)
      var minute = calendar.nextDate(
        after: now,
        matching: DateComponents(second: 0),
        matchingPolicy: .nextTime
      ) ?? now
      while minute <= limit {
        if let first = snapshot.upcoming(now: minute).first, showsCountdown(first, now: minute) {
          dates.insert(minute)
        }
        minute = minute.addingTimeInterval(60)
      }
    }
    return dates.sorted()
  }

  /// "1h52" ou "38 min" até [start] — minutos arredondados para cima, como a
  /// Agenda do app ("começa em 1 min" até o último segundo).
  static func countdown(until start: Date, now: Date) -> String {
    let minutes = max(1, Int((start.timeIntervalSince(now) / 60).rounded(.up)))
    if minutes < 60 { return "\(minutes) min" }
    return "\(minutes / 60)h\(String(format: "%02d", minutes % 60))"
  }

  /// "Hoje", "Amanhã" ou o dia da semana ("Sex").
  static func dayWord(_ date: Date, now: Date, calendar: Calendar = .current) -> String {
    let days = calendar.dateComponents(
      [.day],
      from: calendar.startOfDay(for: now),
      to: calendar.startOfDay(for: date)
    ).day ?? 0
    switch days {
    case 0: return "Hoje"
    case 1: return "Amanhã"
    default:
      let f = DateFormatter()
      f.locale = ptBR
      f.dateFormat = "EEE"
      let raw = f.string(from: date).replacingOccurrences(of: ".", with: "")
      return raw.prefix(1).uppercased() + raw.dropFirst()
    }
  }

  static func time(_ date: Date) -> String {
    let f = DateFormatter()
    f.locale = ptBR
    f.dateFormat = "HH:mm"
    return f.string(from: date)
  }

  /// Torneio de dia inteiro: "Sáb–Dom", ou o dia só.
  static func dayRange(_ entry: NextGameEntry, now: Date) -> String {
    let first = dayWord(entry.startsAt, now: now)
    let last = dayWord(entry.endsAt, now: now)
    return first == last ? first : "\(first)–\(last)"
  }

  /// "Hoje 19:00", "Sex 07:00" ou "Sáb–Dom".
  static func whenLine(_ entry: NextGameEntry, now: Date) -> String {
    entry.allDay ? dayRange(entry, now: now) : "\(dayWord(entry.startsAt, now: now)) \(time(entry.startsAt))"
  }

  static func join(_ parts: String...) -> String {
    parts.filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }.joined(separator: " · ")
  }
}
