import assert from "node:assert/strict";
import {test} from "node:test";

import {
  buildFcmMessage,
  coerceNotificationData,
  isInvalidFcmTokenError,
  parseStoredFcmTokens,
} from "./notification-delivery";

test("parseStoredFcmTokens ignores docs without token field", () => {
  const tokens = parseStoredFcmTokens([
    {
      id: "installation-1",
      data: () => ({token: "fcm-abc", platform: "ios"}),
    },
    {
      id: "installation-2",
      data: () => ({}),
    },
    {
      id: "installation-3",
      data: () => ({token: "   "}),
    },
  ]);

  assert.equal(tokens.length, 1);
  assert.equal(tokens[0]?.token, "fcm-abc");
  assert.equal(tokens[0]?.docId, "installation-1");
  assert.equal(tokens[0]?.platform, "ios");
});

test("parseStoredFcmTokens deduplicates by token value", () => {
  const tokens = parseStoredFcmTokens([
    {id: "a", data: () => ({token: "same-token"})},
    {id: "b", data: () => ({token: "same-token"})},
  ]);

  assert.equal(tokens.length, 1);
});

test("coerceNotificationData stringifies all values", () => {
  const data = coerceNotificationData(
    {inviteId: "inv-1"},
    "booking_invite",
    true
  );

  assert.equal(data.type, "booking_invite");
  assert.equal(data.requireInteraction, "true");
  assert.equal(data.inviteId, "inv-1");
});

test("buildFcmMessage includes APNS alert and apns-push-type header", () => {
  const message = buildFcmMessage({
    title: "Convite",
    body: "Você foi convidado",
    type: "tournament_partner_invite",
    data: {inviteId: "x1"},
    requireInteraction: true,
  });

  assert.deepEqual(message.notification, {
    title: "Convite",
    body: "Você foi convidado",
  });
  assert.equal(message.apns.headers["apns-push-type"], "alert");
  assert.equal(message.apns.headers["apns-priority"], "10");
  assert.deepEqual(message.apns.payload.aps.alert, {
    title: "Convite",
    body: "Você foi convidado",
  });
  assert.equal(message.apns.payload.aps.sound, "default");
  assert.equal(message.fcmOptions.analyticsLabel, "tournament_partner_invite");
  assert.equal(message.data.inviteId, "x1");
});

test("isInvalidFcmTokenError recognizes stale token codes", () => {
  assert.equal(isInvalidFcmTokenError("messaging/registration-token-not-registered"), true);
  assert.equal(isInvalidFcmTokenError("messaging/unknown-error"), false);
});
