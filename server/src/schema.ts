// SpacetimeDB schema for Huddle. Shapes follow docs/CONTRACT.md (S5.5).
// Every table is private (the default); clients read only through the views in views.ts.
// Contract objects owned by the api (posterior, hard constraints, plan results) are
// stored as JSON strings in *Json columns.
import { schema, table, t } from "spacetimedb/server";

export const group = table(
  { name: "group" },
  {
    id: t.string().primaryKey(),
    code: t.string().unique(),
    hostIdentity: t.identity().index("btree"),
    name: t.option(t.string()),
    status: t.string(), // lobby | eliciting | planned | voting | booked
    date: t.string(), // YYYY-MM-DD
    windowStart: t.string(), // HH:MM
    windowEnd: t.string(),
    demoMode: t.bool(),
    showWhoCompromised: t.bool(),
    confidence: t.option(t.f64()),
    latestRunId: t.option(t.string()),
    runCounter: t.u32(),
    excludedPlaceIds: t.array(t.string()),
    replanFor: t.option(t.string()), // bookingId
    previewNonce: t.option(t.string()), // debounce token for the preview job
    createdAt: t.f64(), // ms since epoch
  },
);

export const member = table(
  { name: "member" },
  {
    id: t.string().primaryKey(),
    groupId: t.string().index("btree"),
    identity: t.identity().index("btree"),
    name: t.string(),
    originLat: t.option(t.f64()),
    originLng: t.option(t.f64()),
    ready: t.bool(),
    swipeCount: t.u32(),
    joinedAt: t.f64(),
  },
);

// A chosen city is separate from a real GPS origin; never fabricate a city-center starting point.
export const member_location = table({ name: "member_location" }, {
  memberId: t.string().primaryKey(), city: t.string(), source: t.string(),
});

// Readable only by the owner, through the my_private view.
export const private_prefs = table(
  { name: "private_prefs" },
  {
    memberId: t.string().primaryKey(),
    text: t.string(),
    hardJson: t.option(t.string()),
    priorJson: t.option(t.string()),
    posteriorJson: t.option(t.string()), // {mean: number[13], cov: number[13][13]}
    nextPairA: t.option(t.string()),
    nextPairB: t.option(t.string()),
    nextPairCategory: t.option(t.string()),
    warningsJson: t.string(),
    updatedAt: t.f64(),
  },
);

export const swipe = table(
  { name: "swipe" },
  {
    id: t.u64().primaryKey().autoInc(),
    memberId: t.string().index("btree"),
    winnerPlaceId: t.string(),
    loserPlaceId: t.string(),
    ts: t.f64(),
  },
);

export const plan_run = table(
  { name: "plan_run" },
  {
    runId: t.string().primaryKey(),
    groupId: t.string().index("btree"),
    status: t.string(), // running | done | error
    resultJson: t.option(t.string()), // /plan response
    error: t.option(t.string()),
    councilJson: t.option(t.string()), // {chosenPlanId, rationale, fallbackUsed, agreesWithSolver}
    rouletteJson: t.option(t.string()), // {planId, weights}
    stub: t.bool(),
    createdAt: t.f64(),
  },
);

// Readable only by toMemberId, through the my_offers view.
export const offer = table(
  { name: "offer" },
  {
    id: t.string().primaryKey(),
    runId: t.string().index("btree"),
    toMemberId: t.string().index("btree"),
    type: t.string(), // budget | travel
    amount: t.f64(),
    unit: t.string(), // usd | min
    planId: t.string(),
    planJson: t.string(),
    robustnessGain: t.f64(),
    minRatioGain: t.f64(),
    text: t.string(),
    status: t.string(), // open | accepted | declined
  },
);

export const vote = table(
  { name: "vote" },
  {
    id: t.string().primaryKey(), // `${runId}:${memberId}`, so re-voting overwrites
    runId: t.string().index("btree"),
    memberId: t.string(),
    planId: t.string(),
  },
);

export const booking = table(
  { name: "booking" },
  {
    id: t.string().primaryKey(),
    groupId: t.string().index("btree"),
    runId: t.string(),
    planId: t.string(),
    stopIndex: t.u32(),
    placeId: t.string(),
    restaurantName: t.string(),
    time: t.string(),
    partySize: t.u32(),
    status: t.string(), // pending | calling | confirmed | failed
    slot: t.option(t.string()),
    failReason: t.option(t.string()), // full | closed | no_answer | refused | error
    createdAt: t.f64(),
  },
);

export const call_event = table(
  { name: "call_event" },
  {
    id: t.u64().primaryKey().autoInc(),
    bookingId: t.string().index("btree"),
    type: t.string(), // dialing | connected | transcript | slot_offered | confirmed | failed | ended
    text: t.option(t.string()),
    speaker: t.option(t.string()), // agent | restaurant
    textEn: t.option(t.string()),
    lang: t.option(t.string()),
    slot: t.option(t.string()),
    reason: t.option(t.string()),
    ts: t.f64(),
  },
);

export const council_message = table(
  { name: "council_message" },
  {
    id: t.u64().primaryKey().autoInc(),
    runId: t.string().index("btree"),
    round: t.u32(), // 1, 2, or 3 (chair)
    speaker: t.string(), // advocate | chair
    label: t.string(),
    memberId: t.option(t.string()), // stripped by views unless showWhoCompromised
    planId: t.option(t.string()),
    stanceJson: t.option(t.string()),
    text: t.string(),
    citedJson: t.option(t.string()),
    ts: t.f64(),
  },
);

export const scout_check = table(
  { name: "scout_check" },
  {
    id: t.u64().primaryKey().autoInc(),
    runId: t.string().index("btree"),
    placeId: t.string(),
    openNow: t.option(t.bool()),
    vegetarianOptions: t.option(t.bool()),
    checkedAt: t.f64(),
    source: t.string(),
    cached: t.bool(),
  },
);

// Used by Haydn's geo.ts. key = hash of the request.
export const geo_cache = table(
  { name: "geo_cache" },
  {
    key: t.string().primaryKey(),
    valueJson: t.string(),
    createdAt: t.f64(),
  },
);

// Additive coordinator storage. Existing rows/contracts remain intact for
// legacy huddles. Private prompts are exposed only through the owner's view.
export const agent_session = table({ name: "agent_session" }, {
  groupId: t.string().primaryKey(), revision: t.u32(), status: t.string(),
  activeRunId: t.option(t.string()), error: t.option(t.string()),
});
export const agent_need = table({ name: "agent_need" }, {
  memberId: t.string().primaryKey(), groupId: t.string().index("btree"),
  text: t.string(), revision: t.u32(), resultJson: t.option(t.string()),
  confirmed: t.bool(), error: t.option(t.string()),
});
export const agent_preference_input = table({ name: "agent_preference_input" }, {
  memberId: t.string().primaryKey(), structuredJson: t.string(), revision: t.u32(),
});
export const agent_order = table({ name: "agent_order" }, {
  id: t.string().primaryKey(), runId: t.string().index("btree"), memberId: t.string().index("btree"),
  planId: t.string(), itemsJson: t.string(), total: t.f64(),
});
// Explicitly shared public result snapshots are accessed through procedures;
// the token table is private and never grants membership or private context.
export const result_share = table({ name: "result_share" }, {
  id: t.string().primaryKey(), groupId: t.string().index("btree"), runId: t.string(),
  planId: t.string(), inputRevision: t.u32(), createdAt: t.f64(),
});

// Live venue catalog pushed by data/reviews/collect.py through POST /catalog (lib/catalog.ts).
// placeJson is a contract Place (docs/CONTRACT.md S5.2); evidenceJson holds source URLs and
// fetched-at times. Rows are never deleted, only deactivated, so earlier runs still resolve.
// With no active rows the bundled data/places.json stays the catalog.
export const venue = table({ name: "venue" }, {
  id: t.string().primaryKey(), placeJson: t.string(), evidenceJson: t.string(),
  active: t.bool(), version: t.string(), updatedAt: t.f64(),
});
export const catalog_state = table({ name: "catalog_state" }, {
  id: t.u32().primaryKey(), // always 0: one row
  version: t.string(), generatedAt: t.string(), venueCount: t.u32(), updatedAt: t.f64(),
});

// ---- schedule tables: one per background job (jobs.ts). Functions scheduled this way
// are private, so phones cannot call them directly. ----

const job = <C extends Record<string, any>>(name: string, cols: C) =>
  table({ name }, { scheduledId: t.u64().primaryKey().autoInc(), scheduledAt: t.scheduleAt(), ...cols });

export const parse_job = job("parse_job", { memberId: t.string() });
export const swipe_job = job("swipe_job", { memberId: t.string(), winnerPlaceId: t.string(), loserPlaceId: t.string() });
export const preview_job = job("preview_job", { groupId: t.string(), nonce: t.string() });
export const plan_job = job("plan_job", { groupId: t.string(), runId: t.string() });
export const offers_job = job("offers_job", { runId: t.string() });
export const scout_job = job("scout_job", { runId: t.string() });
export const council_job = job("council_job", { runId: t.string() });
export const voting_cap_job = job("voting_cap_job", { runId: t.string() });
export const call_job = job("call_job", { bookingId: t.string() });
export const fake_event_job = job("fake_event_job", { kind: t.string(), payloadJson: t.string() });
// Unused: the re-plan runs inline (replan.ts). Kept because Maincloud cannot drop or
// re-schedule an existing table without wiping the database.
export const replan_job = job("replan_job", { groupId: t.string(), bookingId: t.string() });
export const agent_needs_job = job("agent_needs_job", { memberId: t.string(), revision: t.u32() });
export const agent_plan_job = job("agent_plan_job", { groupId: t.string(), runId: t.string(), revision: t.u32() });

export const account = table({ name: "account" }, {
  id: t.string().primaryKey(), username: t.string().unique(), displayName: t.string(),
  principal: t.identity().unique(), passwordHash: t.string(), createdAt: t.f64(),
});
export const account_session = table({ name: "account_session" }, {
  identity: t.identity().primaryKey(), accountId: t.option(t.string()), nonce: t.string(),
  activeGroupId: t.option(t.string()), expiresAt: t.f64(),
});
export const account_membership = table({ name: "account_membership" }, {
  id: t.string().primaryKey(), accountId: t.string().index("btree"), groupId: t.string(),
  memberId: t.string(), role: t.string(),
});
export const account_auth_attempt = table({ name: "account_auth_attempt" }, {
  key: t.string().primaryKey(), count: t.u32(), windowStartedAt: t.f64(),
});
export const account_expiry_job = job("account_expiry_job", { identity: t.identity(), nonce: t.string() });

// Account context and social state are private. Only scoped views below the
// authenticated account boundary are subscribable by browser clients.
export const account_context = table({ name: "account_context" }, {
  accountId: t.string().primaryKey(), contextJson: t.string(), revision: t.u32(), updatedAt: t.f64(),
});
export const account_friend = table({ name: "account_friend" }, {
  id: t.string().primaryKey(), accountId: t.string().index("btree"), friendAccountId: t.string(), createdAt: t.f64(),
});
export const friend_request = table({ name: "friend_request" }, {
  id: t.string().primaryKey(), fromAccountId: t.string().index("btree"),
  toAccountId: t.string().index("btree"), status: t.string(), createdAt: t.f64(),
});
export const huddle_invitation = table({ name: "huddle_invitation" }, {
  id: t.string().primaryKey(), groupId: t.string().index("btree"),
  fromAccountId: t.string().index("btree"), toAccountId: t.string().index("btree"),
  status: t.string(), createdAt: t.f64(), expiresAt: t.f64(),
});
// Which invitations an account has cleared from its own Inbox. Hiding is per
// person: the invitation, the other side's view and any membership stay intact.
export const invitation_dismissal = table({ name: "invitation_dismissal" }, {
  id: t.string().primaryKey(), accountId: t.string().index("btree"), invitationId: t.string(),
});
export const invitation_expiry_job = job("invitation_expiry_job", { invitationId: t.string() });
export const invitation_start = table({ name: "invitation_start" }, {
  requestId: t.string().primaryKey(), accountId: t.string(), groupId: t.string(),
  memberId: t.string(), code: t.string(), fingerprint: t.string(),
});
export const message_connector = table({ name: "message_connector" }, {
  accountId: t.string().primaryKey(), enabled: t.bool(), destination: t.string(), updatedAt: t.f64(),
});
export const friend_contact_destination = table({ name: "friend_contact_destination" }, {
  id: t.string().primaryKey(), ownerAccountId: t.string().index("btree"), friendAccountId: t.string(),
  contactId: t.string(), contactName: t.string(), destination: t.string(), updatedAt: t.f64(),
});
export const calendar_connection = table({ name: "calendar_connection" }, {
  accountId: t.string().primaryKey(), provider: t.string(), status: t.string(), generation: t.string(),
  tokenCiphertext: t.option(t.string()), email: t.option(t.string()), scopesJson: t.string(),
  expiresAt: t.option(t.f64()), eventConsent: t.bool(), error: t.option(t.string()), updatedAt: t.f64(),
});
export const calendar_oauth_state = table({ name: "calendar_oauth_state" }, {
  stateId: t.string().primaryKey(), accountId: t.string().index("btree"), generation: t.string(),
  ownerIdentity: t.identity(), sessionNonce: t.string(), status: t.string(),
  claimNonce: t.option(t.string()), expiresAt: t.f64(), createdAt: t.f64(),
});
export const calendar_oauth_expiry_job = job("calendar_oauth_expiry_job", { stateId: t.string() });
export const calendar_revoke_job = job("calendar_revoke_job", {
  accountId: t.string(), tokenCiphertext: t.string(), generation: t.string(),
});
export const calendar_revocation = table({ name: "calendar_revocation" }, {
  generation: t.string().primaryKey(), accountId: t.string(), status: t.string(),
});
export const invitation_delivery = table({ name: "invitation_delivery" }, {
  invitationId: t.string().primaryKey(), status: t.string(), error: t.option(t.string()),
  destination: t.option(t.string()), message: t.option(t.string()), updatedAt: t.f64(),
});
export const invitation_delivery_job = job("invitation_delivery_job", { invitationId: t.string() });
export const meetup = table({ name: "meetup" }, {
  runId: t.string().primaryKey(), groupId: t.string().index("btree"), planId: t.string(),
  inputRevision: t.u32(), status: t.string(), message: t.string(), createdAt: t.f64(),
});
export const meetup_job = job("meetup_job", { runId: t.string() });
export const group_schedule = table({ name: "group_schedule" }, {
  groupId: t.string().primaryKey(), timeZone: t.string(), start: t.string(), end: t.string(), checkedAt: t.f64(),
});
export const huddle_timing = table({ name: "huddle_timing" }, {
  groupId: t.string().primaryKey(), timeOfDay: t.string(), source: t.string(), membersKey: t.string(),
});

const spacetimedb = schema(
  {
    group, member, member_location, private_prefs, swipe, plan_run, offer, vote, booking, call_event,
    council_message, scout_check, geo_cache,
    parse_job, swipe_job, preview_job, plan_job, offers_job, scout_job,
    council_job, voting_cap_job, call_job, fake_event_job, replan_job,
    agent_session, agent_need, agent_preference_input, agent_order, result_share, agent_needs_job, agent_plan_job,
    account, account_session, account_membership, account_auth_attempt, account_expiry_job,
    account_context, account_friend, friend_request, huddle_invitation, invitation_dismissal, invitation_expiry_job, invitation_start,
    message_connector, friend_contact_destination, calendar_connection, calendar_oauth_state, calendar_oauth_expiry_job, calendar_revoke_job, calendar_revocation,
    invitation_delivery, invitation_delivery_job, meetup, meetup_job, group_schedule, huddle_timing,
    venue, catalog_state,
  },
  {
    // Set at publish time. Unset service URLs mean "use fakes" (lib/fakes.ts).
    env: {
      HUDDLE_SHARED_SECRET: t.option(t.string()),
      FASTAPI_BASE_URL: t.option(t.string()),
      STUB_MODE: t.option(t.string()), // default true; false only with a future real solver
      VOICE_BASE_URL: t.option(t.string()),
      COUNCIL_ENABLED: t.option(t.string()),
      AGENT_LANGUAGE: t.option(t.string()),
      STUB_SCENARIO: t.option(t.string()), // confirm | full (fake call only)
      MESSAGES_ENABLED: t.option(t.string()), // permitted recipient address and API enablement are also required
      PUBLIC_FRONTEND_BASE_URL: t.option(t.string()), // public HTTPS UI for this database
      MAC_CONTACTS_OWNER_USERNAME: t.option(t.string()), // canonical account allowed to search this host Mac's Contacts
    },
  },
);
export default spacetimedb;
