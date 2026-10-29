import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_WEATHER_POLICY,
  addDaysToDateKey,
  allocateWeatherCredit,
  bookingPaidReais,
  bookingWindow,
  classifyBookingForRain,
  normalizeWeatherPolicy,
  parseOpenMeteoHourly,
  parseWeatherApiHourly,
  remainingFraction,
  rescheduleSettlement,
  spWallTimeToEpochMs,
  summarizeWeather,
  weatherCreditToApply,
  weatherHoursInWindow,
  weatherMeetsAutoThreshold,
  weatherRequestWindow,
} from "./arena-weather-model";
import {computeSlotLockIds} from "./arena-booking-waitlist";
import {hourLockId, hoursInRange} from "./arena-weather";

const period = {start: 17 * 60, end: 20 * 60};
const policy = {midGame: "proportional" as const};

function paidPix(extra: Record<string, unknown> = {}) {
  return {
    status: "active",
    athleteId: "u1",
    source: "platform",
    courtId: "q1",
    startTime: "18:00",
    endTime: "19:00",
    paymentChannel: "pix",
    paymentFraction: 1,
    amountPaidOnlineReais: 70,
    ...extra,
  };
}

describe("normalizeWeatherPolicy", () => {
  it("doc ausente vira o padrão (desligada, arena aciona, 30 dias, crédito 90)", () => {
    assert.deepEqual(normalizeWeatherPolicy(undefined), DEFAULT_WEATHER_POLICY);
  });

  it("valor fora das opções cai no padrão; null de validade = sem validade", () => {
    const p = normalizeWeatherPolicy({
      enabled: true,
      rescheduleDays: 45,
      creditValidityDays: null,
      trigger: "magic",
      courtIds: ["q1", "q1", " q2 ", 3],
    });
    assert.equal(p.enabled, true);
    assert.equal(p.rescheduleDays, 30);
    assert.equal(p.creditValidityDays, null);
    assert.equal(p.trigger, "arena");
    assert.deepEqual(p.courtIds, ["q1", "q2"]);
  });
});

describe("classifyBookingForRain", () => {
  it("paga e dentro do período: atleta escolhe, crédito integral", () => {
    const c = classifyBookingForRain("b1", paidPix(), period, policy);
    assert.equal(c?.treatment, "release");
    assert.equal(c?.creditableReais, 70);
    assert.equal(c?.fraction, 1);
  });

  it("começa dentro e termina depois do período: ainda é liberação integral", () => {
    const c = classifyBookingForRain("b1", paidPix({startTime: "19:30", endTime: "20:30"}), period, policy);
    assert.equal(c?.treatment, "release");
  });

  it("chuva no meio do jogo: crédito proporcional ao que faltava", () => {
    const c = classifyBookingForRain("b1", paidPix({startTime: "16:30", endTime: "18:00", amountPaidOnlineReais: 90}),
      period, policy);
    assert.equal(c?.treatment, "partial");
    assert.equal(c?.fraction, 0.6667);
    assert.equal(c?.creditableReais, 60);
  });

  it("chuva no meio do jogo com a política 'não se aplica': fora", () => {
    const c = classifyBookingForRain("b1", paidPix({startTime: "16:30", endTime: "18:00"}), period,
      {midGame: "none"});
    assert.equal(c, null);
  });

  it("não paga (na arena): só cancela", () => {
    const c = classifyBookingForRain("b1",
      paidPix({paymentChannel: "onsite", amountPaidOnlineReais: 0}), period, policy);
    assert.equal(c?.treatment, "cancel");
    assert.equal(c?.creditableReais, 0);
  });

  it("sinal de 50% conta só o que foi pago", () => {
    const c = classifyBookingForRain("b1", paidPix({paymentFraction: 0.5, amountPaidOnlineReais: 35}), period, policy);
    assert.equal(c?.creditableReais, 35);
  });

  it("paga com crédito de chuva conta o crédito como pago", () => {
    assert.equal(bookingPaidReais({amountPaidOnlineReais: 10, weatherCreditReais: 60}), 70);
  });

  it("aula, clubinho, horário fixo, manual, Pix pendente e já liberada ficam para tratar à parte", () => {
    const cases: [string, Record<string, unknown>, string][] = [
      ["b1", {classSessionId: "s1"}, "class"],
      ["club_x_2026-10-29_q1", {athleteId: null, source: "club"}, "club"],
      ["b1", {isRecurring: true, recurringBookingId: "r1"}, "recurring"],
      ["b1", {source: "manual"}, "manual"],
      ["b1", {status: "pending_payment", amountPaidOnlineReais: 0}, "pending_payment"],
      ["b1", {paymentStatus: "split_pending"}, "split"],
      ["b1", {weatherRelease: {status: "pending_choice"}}, "already_released"],
    ];
    for (const [id, extra, reason] of cases) {
      const c = classifyBookingForRain(id, paidPix(extra), period, policy);
      assert.equal(c?.treatment, "manual", reason);
      assert.equal(c?.manualReason, reason);
    }
  });

  it("fora do período, cancelada ou concluída: não é afetada", () => {
    assert.equal(classifyBookingForRain("b1", paidPix({startTime: "20:00", endTime: "21:00"}), period, policy), null);
    assert.equal(classifyBookingForRain("b1", paidPix({startTime: "16:00", endTime: "17:00"}), period, policy), null);
    assert.equal(classifyBookingForRain("b1", paidPix({status: "canceled"}), period, policy), null);
    assert.equal(classifyBookingForRain("b1", paidPix({status: "completed"}), period, policy), null);
  });
});

describe("horário", () => {
  it("fim 00:00 é meia-noite", () => {
    assert.deepEqual(bookingWindow("23:00", "00:00"), {start: 1380, end: 1440});
  });

  it("parede de São Paulo é UTC−3", () => {
    assert.equal(new Date(spWallTimeToEpochMs("2026-10-29", 18 * 60)).toISOString(), "2026-10-29T21:00:00.000Z");
  });

  it("soma dias atravessando o mês", () => {
    assert.equal(addDaysToDateKey("2026-10-29", 30), "2026-11-28");
  });

  it("fração restante", () => {
    assert.equal(remainingFraction({start: 1020, end: 1080}, 1050), 0.5);
    assert.equal(remainingFraction({start: 1020, end: 1080}, 1000), 1);
    assert.equal(remainingFraction({start: 1020, end: 1080}, 1100), 0);
  });

  it("id do lock bate com o de createArenaBooking", () => {
    const ids = computeSlotLockIds({arenaId: "a/1", courtId: "q1", dateKey: "2026-10-29", startTime: "17:30",
      endTime: "19:00"});
    assert.deepEqual(hoursInRange(17 * 60 + 30, 19 * 60).map((h) => hourLockId("a/1", "q1", "2026-10-29", h)), ids);
  });
});

describe("weatherRequestWindow", () => {
  const start = spWallTimeToEpochMs("2026-10-29", 18 * 60);
  const hour = 3600_000;

  it("abre 24h antes", () => {
    assert.deepEqual(weatherRequestWindow({requestDeadline: "start", midGame: "proportional"}, start, start - 25 * hour),
      {open: false, reason: "too_early"});
    assert.deepEqual(weatherRequestWindow({requestDeadline: "start", midGame: "proportional"}, start, start - hour),
      {open: true, afterStart: false});
  });

  it("prazo: 2h antes, no início, 30 min depois", () => {
    assert.equal(weatherRequestWindow({requestDeadline: "before_2h", midGame: "proportional"}, start, start - hour).open,
      false);
    assert.equal(weatherRequestWindow({requestDeadline: "start", midGame: "proportional"}, start, start + 60_000).open,
      false);
    assert.deepEqual(
      weatherRequestWindow({requestDeadline: "after_30m", midGame: "proportional"}, start, start + 20 * 60_000),
      {open: true, afterStart: true},
    );
  });

  it("depois do início só com crédito proporcional ligado", () => {
    assert.equal(weatherRequestWindow({requestDeadline: "after_30m", midGame: "none"}, start, start + 60_000).open,
      false);
  });
});

describe("crédito", () => {
  const now = Date.UTC(2026, 9, 29);

  it("usa primeiro o que vence antes; sem validade por último; ignora vencido", () => {
    const r = allocateWeatherCredit([
      {id: "sem", balanceReais: 50, expiresAtMs: null},
      {id: "logo", balanceReais: 30, expiresAtMs: now + 1000},
      {id: "vencido", balanceReais: 99, expiresAtMs: now - 1},
    ], 60, now);
    assert.equal(r.appliedReais, 60);
    assert.deepEqual(r.uses, [{creditId: "logo", amountReais: 30}, {creditId: "sem", amountReais: 30}]);
  });

  it("conta em centavos", () => {
    const r = allocateWeatherCredit([
      {id: "a", balanceReais: 0.1, expiresAtMs: null},
      {id: "b", balanceReais: 0.2, expiresAtMs: null},
    ], 10, now);
    assert.equal(r.appliedReais, 0.3);
  });

  it("Pix deixa pelo menos R$ 5 em dinheiro (ou cobre tudo)", () => {
    assert.equal(weatherCreditToApply({amountReais: 70, availableReais: 68, paymentMode: "pix"}), 65);
    assert.equal(weatherCreditToApply({amountReais: 70, availableReais: 60, paymentMode: "pix"}), 60);
    assert.equal(weatherCreditToApply({amountReais: 70, availableReais: 90, paymentMode: "pix"}), 70);
    assert.equal(weatherCreditToApply({amountReais: 70, availableReais: 68, paymentMode: "onsite"}), 68);
    assert.equal(weatherCreditToApply({amountReais: 8, availableReais: 4, paymentMode: "pix"}), 3);
    assert.equal(weatherCreditToApply({amountReais: 4, availableReais: 3, paymentMode: "pix"}), 0);
  });

  it("remarcação: mais caro paga a diferença na arena, mais barato sobra crédito", () => {
    assert.deepEqual(rescheduleSettlement(60, 70), {coveredReais: 60, dueOnsiteReais: 10, leftoverReais: 0});
    assert.deepEqual(rescheduleSettlement(70, 60), {coveredReais: 60, dueOnsiteReais: 0, leftoverReais: 10});
    assert.deepEqual(rescheduleSettlement(60, 60), {coveredReais: 60, dueOnsiteReais: 0, leftoverReais: 0});
  });
});

describe("previsão", () => {
  const json = {
    hourly: {
      time: ["2026-10-29T16:00", "2026-10-29T17:00", "2026-10-29T18:00", "2026-10-30T18:00"],
      precipitation_probability: [40, 85, 92, 10],
      precipitation: [0.8, 4.24, 6.1, 0],
    },
  };

  it("lê só as horas do dia pedido", () => {
    const hours = parseOpenMeteoHourly(json, "2026-10-29");
    assert.deepEqual(hours.map((h) => h.time), ["16:00", "17:00", "18:00"]);
    assert.equal(hours[1]?.precipitationMm, 4.2);
  });

  it("resume a pior hora da janela e aplica o limite do automático", () => {
    const hours = parseOpenMeteoHourly(json, "2026-10-29");
    const inWin = weatherHoursInWindow(hours, 17 * 60 + 30, 18 * 60 + 30);
    assert.deepEqual(inWin.map((h) => h.time), ["17:00", "18:00"]);
    const s = summarizeWeather(inWin);
    assert.deepEqual(s, {probability: 92, precipitationMm: 6.1});
    assert.equal(weatherMeetsAutoThreshold(s), true);
    assert.equal(weatherMeetsAutoThreshold({probability: 90, precipitationMm: 1.5}), false);
    assert.equal(weatherMeetsAutoThreshold({probability: null, precipitationMm: null}), false);
  });

  it("WeatherAPI: lê as horas do dia, volume com uma casa e a condição", () => {
    const json = {forecast: {forecastday: [
      {date: "2026-10-28", hour: [{time: "2026-10-28 18:00", chance_of_rain: 100, precip_mm: 1.6,
        condition: {text: "Chuva passageira moderada ou forte"}}]},
      {date: "2026-10-29", hour: [
        {time: "2026-10-29 17:00", chance_of_rain: 56, precip_mm: 0.42, condition: {text: " Chuva fraca "}},
        {time: "2026-10-29 18:00", chance_of_rain: null, precip_mm: "x", condition: {}},
      ]},
    ]}};
    assert.deepEqual(parseWeatherApiHourly(json, "2026-10-29"), [
      {time: "17:00", probability: 56, precipitationMm: 0.4, condition: "Chuva fraca"},
      {time: "18:00", probability: null, precipitationMm: null, condition: null},
    ]);
    assert.deepEqual(parseWeatherApiHourly(json, "2026-10-30"), []);
    assert.deepEqual(parseWeatherApiHourly({error: {code: 1006}}, "2026-10-29"), []);
  });

  it("resposta torta vira lista vazia", () => {
    assert.deepEqual(parseOpenMeteoHourly(null, "2026-10-29"), []);
    assert.deepEqual(parseOpenMeteoHourly({hourly: {time: "x"}}, "2026-10-29"), []);
  });
});
