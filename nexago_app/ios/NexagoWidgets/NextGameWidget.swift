import SwiftUI
import WidgetKit

/// Widget "Próximo jogo" (W1), desenhado no canvas (página App do Atleta,
/// `agenda-widget-live/Agenda-widget-w1`). Lê o snapshot que o app grava no
/// App Group e se redesenha sozinho: a contagem é `Text(timerInterval:)` e a
/// timeline já traz as viradas (janela de 24h, início e fim do próximo).
struct NextGameWidget: Widget {
  static let kind = "NexagoNextGame"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: Self.kind, provider: NextGameProvider()) { entry in
      NextGameView(entry: entry)
        .widgetURL(URL(string: "nexago://agenda"))
    }
    .configurationDisplayName("Próximo jogo")
    .description("Seu próximo jogo, aula ou torneio com a contagem até ele.")
    .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular, .accessoryInline])
  }
}

struct NextGameTimelineEntry: TimelineEntry {
  let date: Date
  let snapshot: NextGameSnapshot?
}

struct NextGameProvider: TimelineProvider {
  func placeholder(in context: Context) -> NextGameTimelineEntry {
    NextGameTimelineEntry(date: Date(), snapshot: Self.sample)
  }

  func getSnapshot(in context: Context, completion: @escaping (NextGameTimelineEntry) -> Void) {
    let snapshot = context.isPreview ? Self.sample : NextGameStore.load()
    completion(NextGameTimelineEntry(date: Date(), snapshot: snapshot))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<NextGameTimelineEntry>) -> Void) {
    let now = Date()
    let snapshot = NextGameStore.load()
    // Um ponto agora e um em cada virada próxima: o widget troca de estado
    // sem gastar atualização. O app pede um redesenho ao gravar dados novos.
    var dates = [now]
    var cursor = now
    for _ in 0..<6 {
      guard let snapshot,
            let next = NextGameFormat.nextRefresh(snapshot.upcoming(now: cursor), now: cursor)
      else { break }
      dates.append(next)
      cursor = next.addingTimeInterval(1)
    }
    let entries = dates.map { NextGameTimelineEntry(date: $0, snapshot: snapshot) }
    // Depois da última virada, volta a perguntar em 30 min (como o Android).
    let reload = (dates.last ?? now).addingTimeInterval(30 * 60)
    completion(Timeline(entries: entries, policy: .after(reload)))
  }

  static let sample = NextGameSnapshot(
    signedIn: true,
    entries: [
      NextGameEntry(
        id: "sample",
        label: "Reserva",
        title: "Arena",
        detail: "Quadra 2",
        startsAt: Date().addingTimeInterval(2 * 60 * 60),
        endsAt: Date().addingTimeInterval(3 * 60 * 60),
        allDay: false,
        color: 0xFF6E_B5FF
      ),
    ]
  )
}

private enum Palette {
  static let card = Color(red: 0x0B / 255, green: 0x0B / 255, blue: 0x0C / 255)
  static let text = Color(red: 0xF5 / 255, green: 0xF5 / 255, blue: 0xF7 / 255)
  static let muted = Color(red: 0x9A / 255, green: 0x9A / 255, blue: 0xA3 / 255)
  static let brand = Color(red: 0xFF / 255, green: 0x6A / 255, blue: 0x1A / 255)

  static func argb(_ value: UInt32) -> Color {
    Color(
      red: Double((value >> 16) & 0xFF) / 255,
      green: Double((value >> 8) & 0xFF) / 255,
      blue: Double(value & 0xFF) / 255
    )
  }
}

struct NextGameView: View {
  let entry: NextGameTimelineEntry
  @Environment(\.widgetFamily) private var family

  private var upcoming: [NextGameEntry] {
    entry.snapshot?.upcoming(now: entry.date) ?? []
  }

  var body: some View {
    content.nexagoWidgetBackground(family: family)
  }

  @ViewBuilder
  private var content: some View {
    let signedIn = entry.snapshot?.signedIn ?? false
    switch family {
    case .accessoryInline:
      Text(inlineText(signedIn: signedIn))
    case .accessoryRectangular:
      rectangular(signedIn: signedIn)
    default:
      if !signedIn {
        EmptyCard(
          label: "nexaGO",
          title: "Entre no nexaGO",
          caption: "para ver sua agenda",
          button: "Abrir nexaGO"
        )
      } else if let first = upcoming.first {
        if family == .systemMedium {
          HStack(alignment: .top, spacing: 14) {
            Headline(entry: first, now: entry.date, compact: false)
            Rectangle().fill(Color.white.opacity(0.1)).frame(width: 1)
            Later(entries: Array(upcoming.dropFirst().prefix(2)), now: entry.date)
          }
        } else {
          Headline(entry: first, now: entry.date, compact: true)
        }
      } else {
        EmptyCard(
          label: "Agenda livre",
          title: "Nada marcado",
          caption: "Bora jogar?",
          button: "Abrir Agenda"
        )
      }
    }
  }

  private func inlineText(signedIn: Bool) -> String {
    guard signedIn, let first = upcoming.first else { return "nexaGO · Agenda livre" }
    return NextGameFormat.join("\(first.label) \(NextGameFormat.whenLine(first, now: entry.date))", first.title)
  }

  @ViewBuilder
  private func rectangular(signedIn: Bool) -> some View {
    if signedIn, let first = upcoming.first {
      VStack(alignment: .leading, spacing: 1) {
        HStack(spacing: 4) {
          Text("nexaGO ·").font(.system(size: 11, weight: .bold))
          Countdown(entry: first, now: entry.date).font(.system(size: 11, weight: .bold))
        }
        Text("\(first.label) \(NextGameFormat.whenLine(first, now: entry.date))")
          .font(.system(size: 13, weight: .bold))
          .lineLimit(1)
        Text(NextGameFormat.join(first.title, first.detail))
          .font(.system(size: 11))
          .lineLimit(1)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    } else {
      VStack(alignment: .leading, spacing: 1) {
        Text("nexaGO").font(.system(size: 11, weight: .bold))
        Text(signedIn ? "Nada marcado" : "Entre no app").font(.system(size: 13, weight: .bold))
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
  }
}

/// "Em 1:52:10" nas 24h antes, "Agora" em andamento, senão o dia.
private struct Countdown: View {
  let entry: NextGameEntry
  let now: Date

  var body: some View {
    let untilStart = entry.startsAt.timeIntervalSince(now)
    if !entry.allDay && untilStart > 0 && untilStart <= NextGameFormat.countdownWindow {
      Text(timerInterval: now...entry.startsAt, countsDown: true)
        .monospacedDigit()
    } else if untilStart <= 0 {
      Text("Agora")
    } else {
      Text(NextGameFormat.whenLine(entry, now: now))
    }
  }
}

private struct Headline: View {
  let entry: NextGameEntry
  let now: Date
  let compact: Bool

  var body: some View {
    let untilStart = entry.startsAt.timeIntervalSince(now)
    VStack(alignment: .leading, spacing: 2) {
      Text("\(entry.label) · \(NextGameFormat.dayWord(entry.startsAt, now: now))".uppercased())
        .font(.system(size: 9.5, weight: .bold, design: .monospaced))
        .foregroundStyle(Palette.argb(entry.color))
        .lineLimit(1)
      Countdown(entry: entry, now: now)
        .font(.system(size: 28, weight: .heavy))
        .foregroundStyle(Palette.text)
        .lineLimit(1)
        .minimumScaleFactor(0.6)
      Text(caption(untilStart: untilStart))
        .font(.system(size: 11))
        .foregroundStyle(Palette.muted)
      Spacer(minLength: 0)
      Text(NextGameFormat.whenLine(entry, now: now))
        .font(.system(size: 13, weight: .bold))
        .foregroundStyle(Palette.text)
        .lineLimit(1)
      Text(NextGameFormat.join(entry.title, entry.detail))
        .font(.system(size: 11))
        .foregroundStyle(Palette.muted)
        .lineLimit(1)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private func caption(untilStart: TimeInterval) -> String {
    if untilStart <= 0 { return "acontecendo" }
    if entry.allDay { return "dia inteiro" }
    return untilStart <= NextGameFormat.countdownWindow ? "até o jogo" : "próximo compromisso"
  }
}

private struct Later: View {
  let entries: [NextGameEntry]
  let now: Date

  var body: some View {
    VStack(alignment: .leading, spacing: 7) {
      Text("DEPOIS")
        .font(.system(size: 9.5, weight: .bold, design: .monospaced))
        .foregroundStyle(Palette.muted)
      ForEach(entries, id: \.id) { e in
        VStack(alignment: .leading, spacing: 1) {
          HStack(spacing: 5) {
            Circle().fill(Palette.argb(e.color)).frame(width: 7, height: 7)
            Text(NextGameFormat.whenLine(e, now: now))
              .font(.system(size: 13, weight: .bold))
              .foregroundStyle(Palette.text)
              .lineLimit(1)
          }
          Text(NextGameFormat.join(e.label, e.title))
            .font(.system(size: 11))
            .foregroundStyle(Palette.muted)
            .lineLimit(1)
        }
      }
      Spacer(minLength: 0)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

private struct EmptyCard: View {
  let label: String
  let title: String
  let caption: String
  let button: String

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(label.uppercased())
        .font(.system(size: 9.5, weight: .bold, design: .monospaced))
        .foregroundStyle(Palette.brand)
      Text(title)
        .font(.system(size: 16, weight: .bold))
        .foregroundStyle(Palette.text)
        .padding(.top, 4)
      Text(caption)
        .font(.system(size: 11))
        .foregroundStyle(Palette.muted)
      Spacer(minLength: 0)
      Text(button)
        .font(.system(size: 12, weight: .bold))
        .foregroundStyle(Palette.card)
        .padding(.horizontal, 11)
        .padding(.vertical, 7)
        .background(Palette.brand, in: RoundedRectangle(cornerRadius: 10))
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

private extension View {
  /// Fundo escuro do app na tela de início; os acessórios da tela bloqueada
  /// usam o fundo do sistema. iOS 17+ pede `containerBackground`.
  @ViewBuilder
  func nexagoWidgetBackground(family: WidgetFamily) -> some View {
    let isAccessory = family == .accessoryInline || family == .accessoryRectangular
    if #available(iOS 17.0, *) {
      if isAccessory {
        containerBackground(for: .widget) { Color.clear }
      } else {
        containerBackground(for: .widget) { Palette.card }
      }
    } else if isAccessory {
      self
    } else {
      padding(14).background(Palette.card)
    }
  }
}
