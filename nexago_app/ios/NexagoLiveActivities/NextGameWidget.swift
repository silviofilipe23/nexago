import SwiftUI
import WidgetKit

/// Widget "Próximo jogo" (W1). Lê o snapshot que o app grava no App Group e
/// se redesenha sozinho: a timeline traz as viradas (janela de 24h, início e
/// fim) e, durante a contagem, um ponto por minuto ("1h52", sem segundos).
///
/// Layout pela HIG de widgets: um dado principal (contagem ou "Agora" com a
/// barra do jogo), o lugar embaixo, rótulos de 11 pt no mínimo, estilos de
/// texto do sistema, a marca da Nexa discreta no canto e, no médio, atalhos de
/// verdade (`Link`) em vez de botão desenhado.
struct NextGameWidget: Widget {
  static let kind = "NexagoNextGame"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: Self.kind, provider: NextGameProvider()) { entry in
      NextGameView(entry: entry)
        .widgetURL(NextGameLinks.agenda)
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
    let dates = NextGameFormat.timelineDates(snapshot, now: now)
    let entries = dates.map { NextGameTimelineEntry(date: $0, snapshot: snapshot) }
    // Com compromisso à frente, pede outra timeline no fim do horizonte; sem
    // nada, volta a perguntar em 30 min (como o Android). O app também pede
    // redesenho ao gravar dados novos.
    let hasUpcoming = !(snapshot?.upcoming(now: now).isEmpty ?? true)
    let reload = hasUpcoming
      ? now.addingTimeInterval(NextGameFormat.timelineHorizon)
      : now.addingTimeInterval(30 * 60)
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

/// Destinos dos toques (rotas em `app_deep_link_logic.dart`).
enum NextGameLinks {
  static let agenda = URL(string: "nexago://agenda")
  static let reservar = URL(string: "nexago://reservar")
  static let torneios = URL(string: "nexago://torneios")
}

private enum Palette {
  static let card = Color(red: 0x0B / 255, green: 0x0B / 255, blue: 0x0C / 255)
  static let text = Color(red: 0xF5 / 255, green: 0xF5 / 255, blue: 0xF7 / 255)
  static let muted = Color(red: 0x9A / 255, green: 0x9A / 255, blue: 0xA3 / 255)
  static let brand = Color(red: 0xFF / 255, green: 0x6A / 255, blue: 0x1A / 255)
  static let chip = Color.white.opacity(0.08)

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

  private var signedIn: Bool { entry.snapshot?.signedIn ?? false }

  var body: some View {
    content.nexagoWidgetBackground(family: family)
  }

  @ViewBuilder
  private var content: some View {
    switch family {
    case .accessoryInline:
      Text(inlineText)
    case .accessoryRectangular:
      LockScreenCard(first: signedIn ? upcoming.first : nil, signedIn: signedIn, now: entry.date)
    case .systemMedium:
      medium
    default:
      small
    }
  }

  @ViewBuilder
  private var small: some View {
    if signedIn, let first = upcoming.first {
      Headline(entry: first, now: entry.date, showsMark: true)
    } else {
      EmptyState(signedIn: signedIn, wide: false)
    }
  }

  @ViewBuilder
  private var medium: some View {
    if signedIn, let first = upcoming.first {
      HStack(alignment: .top, spacing: 16) {
        Headline(entry: first, now: entry.date, showsMark: false)
        Later(entries: Array(upcoming.dropFirst().prefix(2)), now: entry.date)
      }
    } else {
      EmptyState(signedIn: signedIn, wide: true)
    }
  }

  private var inlineText: String {
    guard signedIn, let first = upcoming.first else { return "nexaGO · Agenda livre" }
    let when = first.startsAt <= entry.date
      ? "agora"
      : NextGameFormat.showsCountdown(first, now: entry.date)
        ? "em \(NextGameFormat.countdown(until: first.startsAt, now: entry.date))"
        : NextGameFormat.whenLine(first, now: entry.date)
    return NextGameFormat.join("\(first.label) \(when)", first.title)
  }
}

// MARK: - Peças

/// O "N" laranja da Nexa, pequeno, no canto do card.
private struct BrandMark: View {
  var size: CGFloat = 14

  var body: some View {
    Image("NexaMark")
      .resizable()
      .nexagoAccentedFullColor()
      .scaledToFit()
      .frame(width: size, height: size)
      .accessibilityHidden(true)
  }
}

/// Rótulo da categoria ("RESERVA · HOJE") na cor do tipo. Com letra grande
/// (tamanho de texto do sistema) fica só a categoria, em vez de cortar.
private struct Eyebrow: View {
  let text: String
  var day: String? = nil
  let color: Color

  var body: some View {
    ViewThatFits(in: .horizontal) {
      if let day { label("\(text) · \(day)") }
      label(text)
    }
    .foregroundStyle(color)
    .widgetAccentable()
  }

  private func label(_ value: String) -> some View {
    Text(value.uppercased())
      .font(.caption2.weight(.semibold))
      .tracking(0.6)
      .lineLimit(1)
  }
}

/// O compromisso principal: rótulo, o dado grande e o lugar embaixo.
private struct Headline: View {
  let entry: NextGameEntry
  let now: Date
  let showsMark: Bool

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      HStack(spacing: 6) {
        Eyebrow(
          text: entry.label,
          day: NextGameFormat.dayWord(entry.startsAt, now: now),
          color: Palette.argb(entry.color)
        )
        Spacer(minLength: 4)
        if showsMark { BrandMark() }
      }
      Primary(entry: entry, now: now)
        .padding(.top, 6)
      Spacer(minLength: 4)
      PlaceLines(title: entry.title, detail: entry.detail)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

/// "Agora" com a barra do jogo, a contagem ("1h52") ou o dia.
private struct Primary: View {
  let entry: NextGameEntry
  let now: Date

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      if entry.startsAt <= now {
        big("Agora")
        ProgressView(
          timerInterval: entry.startsAt...entry.endsAt,
          countsDown: false,
          label: { EmptyView() },
          currentValueLabel: { EmptyView() }
        )
        .progressViewStyle(.linear)
        .tint(Palette.brand)
        .widgetAccentable()
        caption(entry.allDay ? "dia inteiro" : "até \(NextGameFormat.time(entry.endsAt))")
      } else if NextGameFormat.showsCountdown(entry, now: now) {
        big(NextGameFormat.countdown(until: entry.startsAt, now: now))
        caption("começa às \(NextGameFormat.time(entry.startsAt))")
      } else {
        big(NextGameFormat.whenLine(entry, now: now))
        caption(entry.allDay ? "dia inteiro" : "próximo compromisso")
      }
    }
  }

  private func big(_ text: String) -> some View {
    Text(text)
      .font(.title.weight(.bold))
      .monospacedDigit()
      .foregroundStyle(Palette.text)
      .lineLimit(1)
      .minimumScaleFactor(0.6)
      .widgetAccentable()
  }

  private func caption(_ text: String) -> some View {
    Text(text)
      .font(.footnote)
      .foregroundStyle(Palette.muted)
      .lineLimit(1)
  }
}

/// Arena em destaque e a quadra (ou o detalhe) em cinza.
private struct PlaceLines: View {
  let title: String
  let detail: String

  var body: some View {
    VStack(alignment: .leading, spacing: 1) {
      Text(title)
        .font(.subheadline.weight(.semibold))
        .foregroundStyle(Palette.text)
        .lineLimit(1)
      if !detail.trimmingCharacters(in: .whitespaces).isEmpty {
        Text(detail)
          .font(.footnote)
          .foregroundStyle(Palette.muted)
          .lineLimit(1)
      }
    }
  }
}

/// Coluna "A seguir" do médio: até dois compromissos ou o atalho de reservar.
private struct Later: View {
  let entries: [NextGameEntry]
  let now: Date

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(spacing: 6) {
        Text("A SEGUIR")
          .font(.caption2.weight(.semibold))
          .tracking(0.6)
          .foregroundStyle(Palette.muted)
        Spacer(minLength: 4)
        BrandMark()
      }
      if entries.isEmpty {
        VStack(alignment: .leading, spacing: 2) {
          Text("Nada mais marcado")
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(Palette.text)
          Text("Quer marcar outro jogo?")
            .font(.footnote)
            .foregroundStyle(Palette.muted)
        }
        Spacer(minLength: 0)
        ActionChip(symbol: "plus", title: "Reservar quadra", url: NextGameLinks.reservar)
      } else {
        ForEach(entries, id: \.id) { LaterRow(entry: $0, now: now) }
        Spacer(minLength: 0)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

private struct LaterRow: View {
  let entry: NextGameEntry
  let now: Date

  var body: some View {
    HStack(alignment: .top, spacing: 8) {
      RoundedRectangle(cornerRadius: 1.5)
        .fill(Palette.argb(entry.color))
        .frame(width: 3, height: 32)
        .widgetAccentable()
      VStack(alignment: .leading, spacing: 1) {
        Text(NextGameFormat.whenLine(entry, now: now))
          .font(.subheadline.weight(.semibold))
          .foregroundStyle(Palette.text)
          .lineLimit(1)
        Text(NextGameFormat.join(entry.label, entry.title))
          .font(.footnote)
          .foregroundStyle(Palette.muted)
          .lineLimit(1)
      }
    }
  }
}

/// Atalho do médio (o pequeno só tem um toque, o do card inteiro).
private struct ActionChip: View {
  let symbol: String
  let title: String
  let url: URL?

  var body: some View {
    if let url {
      Link(destination: url) { label }
    } else {
      label
    }
  }

  private var label: some View {
    HStack(spacing: 6) {
      Image(systemName: symbol)
        .font(.footnote.weight(.bold))
        .foregroundStyle(Palette.brand)
        .widgetAccentable()
      Text(title)
        .font(.footnote.weight(.semibold))
        .foregroundStyle(Palette.text)
        .lineLimit(1)
    }
    .padding(.horizontal, 10)
    .padding(.vertical, 6)
    .background(Capsule().fill(Palette.chip))
  }
}

/// Agenda livre ou sem login: ícone, título e uma frase; no médio, atalhos.
private struct EmptyState: View {
  let signedIn: Bool
  let wide: Bool

  var body: some View {
    HStack(alignment: .top, spacing: 16) {
      VStack(alignment: .leading, spacing: 0) {
        HStack(spacing: 6) {
          Eyebrow(text: signedIn ? "Agenda" : "nexaGO", color: Palette.brand)
          Spacer(minLength: 4)
          if !wide { BrandMark() }
        }
        Spacer(minLength: 4)
        Image(systemName: signedIn ? "calendar" : "person.crop.circle")
          .font(.title3)
          .foregroundStyle(Palette.muted)
          .padding(.bottom, 6)
        Text(signedIn ? "Nada marcado" : "Entre no nexaGO")
          .font(.headline)
          .foregroundStyle(Palette.text)
          .lineLimit(1)
        Text(signedIn ? "Seus jogos, aulas e torneios aparecem aqui." : "Para ver seus próximos jogos.")
          .font(.footnote)
          .foregroundStyle(Palette.muted)
          .lineLimit(3)
          .fixedSize(horizontal: false, vertical: true)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      if wide {
        VStack(alignment: .leading, spacing: 8) {
          HStack {
            Spacer()
            BrandMark()
          }
          Spacer(minLength: 0)
          if signedIn {
            ActionChip(symbol: "plus", title: "Reservar quadra", url: NextGameLinks.reservar)
            ActionChip(symbol: "trophy.fill", title: "Ver torneios", url: NextGameLinks.torneios)
          } else {
            ActionChip(symbol: "arrow.right", title: "Entrar", url: NextGameLinks.agenda)
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
      }
    }
  }
}

/// Tela bloqueada (retangular): o "N" + o quando, depois o lugar.
private struct LockScreenCard: View {
  let first: NextGameEntry?
  let signedIn: Bool
  let now: Date

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      HStack(spacing: 4) {
        Image("NexaMark")
          .renderingMode(.template)
          .resizable()
          .scaledToFit()
          .frame(width: 12, height: 12)
          .accessibilityHidden(true)
        Text(headline)
          .lineLimit(1)
      }
      .font(.headline)
      .widgetAccentable()
      if let first {
        Text(first.title)
          .font(.subheadline)
          .lineLimit(1)
        Text(first.detail.isEmpty ? first.label : first.detail)
          .font(.subheadline)
          .foregroundStyle(.secondary)
          .lineLimit(1)
      } else {
        Text(signedIn ? "Nada marcado" : "Entre para ver sua agenda")
          .font(.subheadline)
          .foregroundStyle(.secondary)
          .lineLimit(2)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private var headline: String {
    guard let first else { return signedIn ? "Agenda livre" : "nexaGO" }
    if first.startsAt <= now {
      return first.allDay ? "Agora" : "Agora · até \(NextGameFormat.time(first.endsAt))"
    }
    if NextGameFormat.showsCountdown(first, now: now) {
      return "\(first.label) em \(NextGameFormat.countdown(until: first.startsAt, now: now))"
    }
    return "\(first.label) \(NextGameFormat.whenLine(first, now: now))"
  }
}

private extension View {
  /// Fundo escuro do app na tela de início; os acessórios da tela bloqueada
  /// usam o fundo do sistema. iOS 17+ pede `containerBackground` (que some
  /// sozinho nos modos tingido e transparente).
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
      padding(16).background(Palette.card)
    }
  }
}

private extension Image {
  /// No modo tingido (iOS 18+) a marca segue a cor do sistema em vez de virar
  /// um borrão cinza.
  @ViewBuilder
  func nexagoAccentedFullColor() -> some View {
    if #available(iOS 18.0, *) {
      self.widgetAccentedRenderingMode(.accentedDesaturated)
    } else {
      self
    }
  }
}
