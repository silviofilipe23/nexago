import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { PhoneAppShell } from '../../../shared/ui/phone-app-shell';
import {
  AGENDA,
  ARENA,
  ARENA_BEATS,
  CLUB,
  CLUB_PLAYERS,
  QUICK_ITEMS,
  TAB,
  TAB_ITEMS,
  WALLET_AVAILABLE,
  barRevenue,
  bookingsCount,
  courtRevenue,
  formatMoney,
  formatPrice,
  isYours,
  lastSevenDays,
  occupancy,
  peakTime,
  revenue,
  tabTotal,
  type ArenaStep,
  type BlockKind,
} from './arena-beats';

/** Hora do celular em um passo. */
const clockAt = (step: ArenaStep) => ARENA_BEATS.find((beat) => beat.step === step)?.clock ?? '';

/** Os blocos de um tipo, na ordem do relógio, como as listas do painel mostram. */
const byTime = (kind: BlockKind) =>
  AGENDA.filter((block) => block.kind === kind)
    .sort((a, b) => a.time.localeCompare(b.time))
    .map((block) => ({ ...block, key: `${block.court}/${block.time}` }));

/**
 * A tela do painel do gestor da arena em cada passo do dia, com os rótulos do app de verdade
 * ("Pago online", "Check-in pendente", "Horários fixos", "Mensalista", "Confirmados", "Paga na
 * arena", "Lançamento rápido", "Itens lançados", "Falta receber", "Fechar conta →", "Últimos 7
 * dias", "Saldo disponível", "Solicitar saque"). São telas de gestão, sem as abas do atleta.
 * Reservas, clubinho, comanda e números do dia vêm de `arena-beats.ts`, a mesma fonte da agenda
 * ao lado.
 */
@Component({
  selector: 'app-arena-phone',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PhoneAppShell],
  host: { class: 'block h-full' },
  templateUrl: './arena-phone.html',
  styles: `
    .screen {
      animation: fade 420ms ease both;
    }

    @keyframes fade {
      from {
        opacity: 0;
      }
      to {
        opacity: 1;
      }
    }
  `,
})
export class ArenaPhone {
  readonly step = input.required<ArenaStep>();

  protected readonly arena = ARENA;
  protected readonly club = CLUB;
  protected readonly players = CLUB_PLAYERS;
  protected readonly morePlayers = CLUB.spots - CLUB_PLAYERS.length;
  protected readonly perAthlete = formatMoney(CLUB.perAthlete);
  protected readonly hourPrice = formatMoney(ARENA.hourPrice);

  /** Reservas avulsas do dia. O check-in só aparece feito em quem já chegou quando a tela abre. */
  protected readonly bookings = byTime('booking').map((block) => ({
    ...block,
    yours: isYours(block),
    checkedIn: block.time < clockAt('booking'),
  }));
  protected readonly fixed = byTime('fixed');
  protected readonly fixedPerWeek = formatMoney(byTime('fixed').reduce((total, block) => total + block.value, 0));
  /** A semana de um horário fixo, de segunda a domingo: na cena todos caem na quinta. */
  protected readonly weekdays = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map((letter, index) => ({ letter, on: index === 3 }));

  protected readonly tab = TAB;
  protected readonly tabItems = TAB_ITEMS.map((item) => ({ ...item, total: formatPrice(item.quantity * item.price) }));
  protected readonly tabTotal = formatPrice(tabTotal());
  protected readonly rental = formatPrice(ARENA.hourPrice);
  protected readonly quickItems = QUICK_ITEMS.map((item) => ({ name: item.name, price: formatMoney(item.price) }));
  protected readonly methods = ['Pix', 'Crédito', 'Débito', 'Dinheiro'];

  /** O dia fechado, como o painel resume. */
  protected readonly day = {
    revenue: formatMoney(revenue('close')),
    bookings: bookingsCount('close'),
    occupancy: occupancy('close'),
    peak: `${Number(peakTime('close').slice(0, 2))}h`,
    courts: formatMoney(courtRevenue('close')),
    bar: formatMoney(barRevenue('close')),
  };
  protected readonly week = lastSevenDays();
  protected readonly wallet = formatPrice(WALLET_AVAILABLE);

  protected readonly clock = computed(() => clockAt(this.step()));
}
