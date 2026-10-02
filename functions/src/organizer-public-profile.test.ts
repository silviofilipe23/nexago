import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp} from "firebase-admin/firestore";
import {
  buildOrganizerIdentity,
  computeOrganizerStats,
  isRealizedListedTournament,
  followerCountDelta,
  isListedTournament,
  isOrganizerListed,
  normalizeVenueKey,
  normalizeWhatsappDigits,
  organizerStatsRelevantChange,
  sameOrganizerIdentity,
  realizedListedTournamentIds,
  touchesRealizedTournament,
  type TournamentRow,
} from "./organizer-public-profile";

const ts = (iso: string) => Timestamp.fromDate(new Date(iso));
const NOW = Date.UTC(2026, 9, 2, 15, 0, 0);
const HOUR = 3_600_000;

function row(id: string, data: Record<string, unknown>): TournamentRow {
  return {id, data: {managerId: "org-1", listingStatus: "open", visibility: "publicListing", ...data}};
}

describe("buildOrganizerIdentity", () => {
  it("usa a marca e só expõe o WhatsApp com opt-in", () => {
    const identity = buildOrganizerIdentity({
      roles: ["athlete", "organizer"],
      displayName: "Fulano",
      organizerProfile: {
        orgName: "  Liga Amadora Goiânia ",
        logoUrl: "https://x/logo.jpg",
        coverUrl: "https://x/capa.jpg",
        bio: "Ligas de areia",
        city: "Goiânia",
        state: "go",
        contactPhone: "(62) 99999-1234",
        contactEmail: "nao@expor.com",
        publicWhatsapp: true,
      },
    });
    assert.deepEqual(identity, {
      name: "Liga Amadora Goiânia",
      logoUrl: "https://x/logo.jpg",
      coverUrl: "https://x/capa.jpg",
      bio: "Ligas de areia",
      city: "Goiânia",
      state: "GO",
      whatsapp: "5562999991234",
      isOrganizer: true,
    });
  });

  it("sem opt-in não há WhatsApp; nome cai para displayName e depois fullName", () => {
    const a = buildOrganizerIdentity({roles: ["organizer"], displayName: "Resp", organizerProfile: {contactPhone: "62999991234"}});
    assert.equal(a.whatsapp, null);
    assert.equal(a.name, "Resp");
    const b = buildOrganizerIdentity({roles: ["organizer"], fullName: "Nome Completo"});
    assert.equal(b.name, "Nome Completo");
    const c = buildOrganizerIdentity({roles: ["athlete"]});
    assert.equal(c.name, "Organizador");
    assert.equal(c.isOrganizer, false);
  });

  it("corta a bio em 280 e ignora telefone curto", () => {
    const identity = buildOrganizerIdentity({
      roles: ["organizer"],
      organizerProfile: {bio: "x".repeat(400), contactPhone: "1234", publicWhatsapp: true},
    });
    assert.equal(identity.bio?.length, 280);
    assert.equal(identity.whatsapp, null);
  });

  it("nome até 60 e só URL https nas imagens", () => {
    const identity = buildOrganizerIdentity({
      roles: ["organizer"],
      organizerProfile: {orgName: "N".repeat(90), logoUrl: "http://x/logo.jpg", coverUrl: "javascript:alert(1)"},
    });
    assert.equal(identity.name.length, 60);
    assert.equal(identity.logoUrl, null);
    assert.equal(identity.coverUrl, null);
  });

  it("sameOrganizerIdentity compara campo a campo", () => {
    const base = {roles: ["organizer"], organizerProfile: {orgName: "A"}, lastActiveAt: 1};
    assert.equal(sameOrganizerIdentity(buildOrganizerIdentity(base), buildOrganizerIdentity({...base, lastActiveAt: 2})), true);
    assert.equal(
      sameOrganizerIdentity(buildOrganizerIdentity(base), buildOrganizerIdentity({...base, organizerProfile: {orgName: "B"}})),
      false,
    );
  });
});

describe("normalizeWhatsappDigits", () => {
  it("põe o DDI quando falta, tira zero de tronco e respeita DDD 55", () => {
    assert.equal(normalizeWhatsappDigits("(62) 99999-1234"), "5562999991234");
    assert.equal(normalizeWhatsappDigits("+55 62 99999-1234"), "5562999991234");
    assert.equal(normalizeWhatsappDigits("(55) 99999-8888"), "5555999998888");
    assert.equal(normalizeWhatsappDigits("011 99999-8888"), "5511999998888");
    assert.equal(normalizeWhatsappDigits("(62) 3333-4444"), "556233334444");
  });

  it("número curto ou longo demais não vira WhatsApp", () => {
    assert.equal(normalizeWhatsappDigits("1234"), null);
    assert.equal(normalizeWhatsappDigits("12345678901234"), null);
    assert.equal(normalizeWhatsappDigits("446299991234"), null);
  });
});

describe("eventos listados", () => {
  it("rascunho, cancelado e linkOnly não contam; sem visibility conta", () => {
    assert.equal(isListedTournament({listingStatus: "draft"}), false);
    assert.equal(isListedTournament({listingStatus: "cancelled"}), false);
    assert.equal(isListedTournament({listingStatus: "open", visibility: "linkOnly"}), false);
    assert.equal(isListedTournament({listingStatus: "open"}), true);
    assert.equal(isListedTournament({status: "completed"}), true);
    assert.equal(isListedTournament(null), false);
  });

  it("realizado = completed ou fim + 12 h no passado (endAt, senão startAt)", () => {
    const open = {listingStatus: "open", visibility: "publicListing"};
    assert.equal(isRealizedListedTournament({...open, listingStatus: "completed"}, NOW), true);
    assert.equal(isRealizedListedTournament({...open, endAt: Timestamp.fromMillis(NOW - 13 * HOUR)}, NOW), true);
    assert.equal(isRealizedListedTournament({...open, endAt: Timestamp.fromMillis(NOW - 11 * HOUR)}, NOW), false);
    assert.equal(isRealizedListedTournament({...open, startAt: Timestamp.fromMillis(NOW - 13 * HOUR)}, NOW), true);
    assert.equal(
      isRealizedListedTournament({...open, startAt: Timestamp.fromMillis(NOW - 48 * HOUR), endAt: Timestamp.fromMillis(NOW + HOUR)}, NOW),
      false,
    );
    assert.equal(isRealizedListedTournament({...open, listingStatus: "cancelled", endAt: Timestamp.fromMillis(0)}, NOW), false);
    assert.equal(isRealizedListedTournament({...open}, NOW), false);
  });

  it("realizedListedTournamentIds devolve ids ordenados", () => {
    const rows = [
      row("b", {listingStatus: "completed"}),
      row("a", {listingStatus: "completed"}),
      row("c", {listingStatus: "completed", visibility: "linkOnly"}),
      row("d", {listingStatus: "open"}),
    ];
    assert.deepEqual(realizedListedTournamentIds(rows, NOW), ["a", "b"]);
  });
});

describe("computeOrganizerStats", () => {
  it("conta, ordena esportes por frequência, agrupa locais e acha o primeiro evento", () => {
    const stats = computeOrganizerStats([
      row("t1", {listingStatus: "completed", sport: "beach_tennis", startAt: ts("2021-05-01T12:00:00Z"), locationName: "Arena ErreJota", city: "Goiânia"}),
      row("t2", {listingStatus: "completed", sport: "beach_volleyball", startAt: ts("2022-01-01T12:00:00Z"), locationName: "arena  errejota", city: "Goiânia"}),
      row("t3", {listingStatus: "open", sport: "beach_tennis", startAt: ts("2026-11-01T12:00:00Z"), locationName: "Garden Beach"}),
      row("t4", {listingStatus: "closed", sport: "padel", startAt: ts("2026-10-20T12:00:00Z"), arenaId: "arena-9", locationName: "Arena Central"}),
      row("t5", {listingStatus: "draft", sport: "padel", startAt: ts("2019-01-01T12:00:00Z")}),
      row("t6", {listingStatus: "open", visibility: "linkOnly", sport: "padel"}),
    ], 42, NOW);
    assert.equal(stats.listedEvents, 4);
    assert.equal(stats.eventsCompleted, 2);
    assert.equal(stats.openEvents, 1);
    assert.equal(stats.athletes, 42);
    assert.equal(stats.organizerSince?.toMillis(), ts("2021-05-01T12:00:00Z").toMillis());
    assert.deepEqual(stats.sports, ["beach_tennis", "beach_volleyball", "padel"]);
    assert.equal(stats.venues.length, 3);
    assert.deepEqual(stats.venues[0], {name: "arena  errejota", arenaId: null, city: "Goiânia", count: 2});
  });

  it("sem eventos listados: zeros e organizerSince nulo", () => {
    const stats = computeOrganizerStats([row("t1", {listingStatus: "draft"})], 0, NOW);
    assert.deepEqual(stats, {
      listedEvents: 0, eventsCompleted: 0, openEvents: 0, athletes: 0,
      organizerSince: null, sports: [], venues: [],
    });
  });

  it("evento que acabou sem completed conta como realizado e sai dos abertos", () => {
    const stats = computeOrganizerStats([
      row("t1", {listingStatus: "open", startAt: Timestamp.fromMillis(NOW - 72 * HOUR), endAt: Timestamp.fromMillis(NOW - 48 * HOUR)}),
      row("t2", {listingStatus: "open", startAt: Timestamp.fromMillis(NOW + 72 * HOUR)}),
    ], 0, NOW);
    assert.equal(stats.eventsCompleted, 1);
    assert.equal(stats.openEvents, 1);
  });

  it("organizerSince ignora evento futuro", () => {
    const stats = computeOrganizerStats([
      row("t1", {listingStatus: "open", startAt: ts("2027-01-10T12:00:00Z")}),
    ], 0, NOW);
    assert.equal(stats.organizerSince, null);
  });

  it("normalizeVenueKey tira acento, caixa e espaço duplicado", () => {
    assert.equal(normalizeVenueKey("  Arena  Goiânia "), "arena goiania");
  });
});

describe("isOrganizerListed", () => {
  it("exige papel e ao menos um evento listado", () => {
    assert.equal(isOrganizerListed(true, {listedEvents: 1}), true);
    assert.equal(isOrganizerListed(true, {listedEvents: 0}), false);
    assert.equal(isOrganizerListed(false, {listedEvents: 3}), false);
    assert.equal(isOrganizerListed(true, undefined), false);
  });
});

describe("organizerStatsRelevantChange", () => {
  const base = {managerId: "org-1", listingStatus: "open", startAt: ts("2026-11-01T12:00:00Z"), categoryOps: {a: 1}};
  it("placar e categoryOps não disparam", () => {
    assert.equal(organizerStatsRelevantChange(base, {...base, categoryOps: {a: 2}, liveMatchesNow: 3}), false);
  });
  it("status, data, local e visibilidade disparam", () => {
    assert.equal(organizerStatsRelevantChange(base, {...base, listingStatus: "closed"}), true);
    assert.equal(organizerStatsRelevantChange(base, {...base, startAt: ts("2026-11-02T12:00:00Z")}), true);
    assert.equal(organizerStatsRelevantChange(base, {...base, locationName: "Outra"}), true);
    assert.equal(organizerStatsRelevantChange(base, {...base, visibility: "linkOnly"}), true);
  });
  it("Timestamp igual com instância nova não dispara", () => {
    assert.equal(organizerStatsRelevantChange(base, {...base, startAt: ts("2026-11-01T12:00:00Z")}), false);
  });
  it("criação e exclusão disparam", () => {
    assert.equal(organizerStatsRelevantChange(null, base), true);
    assert.equal(organizerStatsRelevantChange(base, null), true);
    assert.equal(organizerStatsRelevantChange(null, null), false);
  });
});

describe("touchesRealizedTournament / followerCountDelta", () => {
  it("só recontar atletas quando há evento realizado no antes ou no depois", () => {
    assert.equal(touchesRealizedTournament({listingStatus: "open"}, {listingStatus: "completed"}, NOW), true);
    assert.equal(touchesRealizedTournament({listingStatus: "completed"}, null, NOW), true);
    assert.equal(touchesRealizedTournament({listingStatus: "open"}, {listingStatus: "closed"}, NOW), false);
  });
  it("delta de seguidores", () => {
    assert.equal(followerCountDelta(false, true), 1);
    assert.equal(followerCountDelta(true, false), -1);
    assert.equal(followerCountDelta(true, true), 0);
  });
});
