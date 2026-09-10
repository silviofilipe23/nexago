import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {PORTAL_CALLABLE_REGIONS} from "./function-regions";
import * as athleteLevelAdmin from "./athlete-level-admin";
import * as cancellationRequestOps from "./tournament-cancellation-request-ops";
import * as categoryOps from "./organizer-category-ops";
import * as createRegistration from "./organizer-create-registration";
import * as drawSessions from "./draw-sessions";
import * as matchOps from "./organizer-match-ops";
import * as signup from "./organizer-signup";
import * as spotPassLink from "./tournament-spot-pass-link";
import * as spotPassOps from "./tournament-spot-pass-ops";
import * as withdrawal from "./organizer-withdrawal";

/**
 * As callables que o portal do organizador chama
 * (`frontend/projects/organizer/src/app/painel/data/organizer-ops.service.ts` e
 * `auth/auth.service.ts`). O portal web pede `southamerica-east1`; o app
 * Flutter e bundles antigos seguem pedindo `us-central1`. Uma callable desta
 * lista sem as duas regiões quebra um dos dois lados.
 */
const PORTAL_CALLABLES: Record<string, unknown> = {
  autoScheduleTournamentDay: matchOps.autoScheduleTournamentDay,
  cancelTournament: categoryOps.cancelTournament,
  clearRevealSpotlight: drawSessions.clearRevealSpotlight,
  closeTournamentRegistrations: categoryOps.closeTournamentRegistrations,
  completeOrganizerSignup: signup.completeOrganizerSignup,
  createDrawSession: drawSessions.createDrawSession,
  declareMatchWalkover: matchOps.declareMatchWalkover,
  drawNextReveal: drawSessions.drawNextReveal,
  generateCategoryBracket: categoryOps.generateCategoryBracket,
  organizerConfirmRegistrationPayment: categoryOps.organizerConfirmRegistrationPayment,
  organizerCreateSpotPassLink: spotPassLink.organizerCreateSpotPassLink,
  organizerCreateTeamRegistration: createRegistration.organizerCreateTeamRegistration,
  organizerGrantTournamentSpotPass: spotPassOps.organizerGrantTournamentSpotPass,
  organizerMoveToWaitlist: categoryOps.organizerMoveToWaitlist,
  organizerRemoveFromCategory: categoryOps.organizerRemoveFromCategory,
  organizerRevertRegistrationPayment: categoryOps.organizerRevertRegistrationPayment,
  organizerRevokeSpotPassLink: spotPassLink.organizerRevokeSpotPassLink,
  organizerRevokeTournamentSpotPass: spotPassOps.organizerRevokeTournamentSpotPass,
  publishDrawSession: drawSessions.publishDrawSession,
  replaceRevealPhrase: drawSessions.replaceRevealPhrase,
  resendRegistrationPayment: categoryOps.resendRegistrationPayment,
  respondRegistrationCancellationRequest:
    cancellationRequestOps.respondRegistrationCancellationRequest,
  revertMatchToScheduled: matchOps.revertMatchToScheduled,
  scheduleMatch: matchOps.scheduleMatch,
  sendCategoryCommunication: categoryOps.sendCategoryCommunication,
  setAthleteLevel: athleteLevelAdmin.setAthleteLevel,
  setOrganizerPayoutPixKey: withdrawal.setOrganizerPayoutPixKey,
  startDrawSession: drawSessions.startDrawSession,
  submitMatchResult: matchOps.submitMatchResult,
  unscheduleMatch: matchOps.unscheduleMatch,
  updateDrawSessionConfig: drawSessions.updateDrawSessionConfig,
  updateDrawSessionSeeds: drawSessions.updateDrawSessionSeeds,
  updateLiveMatchScore: matchOps.updateLiveMatchScore,
  updateMatchOpsSettings: matchOps.updateMatchOpsSettings,
  validateMatchResult: matchOps.validateMatchResult,
  voidDrawSession: drawSessions.voidDrawSession,
};

const regionOf = (fn: unknown): unknown =>
  (fn as {__endpoint?: {region?: unknown}})?.__endpoint?.region;

describe("regiões das callables do portal", () => {
  it("southamerica-east1 encosta o backend no Firestore", () => {
    assert.ok(
      PORTAL_CALLABLE_REGIONS.includes("southamerica-east1"),
      "sem a região do banco, toda leitura volta a atravessar o continente",
    );
  });

  it("us-central1 continua servindo os clientes que ainda não migraram", () => {
    assert.ok(
      PORTAL_CALLABLE_REGIONS.includes("us-central1"),
      "apagar Iowa faz o app publicado receber NOT FOUND",
    );
  });

  for (const [name, fn] of Object.entries(PORTAL_CALLABLES)) {
    it(`${name} deploya nas duas regiões`, () => {
      assert.ok(fn, `${name} não está exportada`);
      assert.deepEqual(regionOf(fn), PORTAL_CALLABLE_REGIONS);
    });
  }
});
