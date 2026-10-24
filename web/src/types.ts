// Contract types from docs/CONTRACT.md S5.2-S5.5. data.ts builds these from
// the SpacetimeDB views (server/src/views.ts); keep the three in sync.

export type Category = "meal" | "activity" | "dessert";
export type PlanKind = "safe" | "bold" | "budget";
export type GroupStatus = "lobby" | "eliciting" | "planned" | "voting" | "booked";

export const FEATURES = [
  "noise",
  "crowd",
  "wait",
  "value",
  "romance",
  "service",
  "outdoor",
  "novelty",
  "cuisine_asian",
  "cuisine_latin",
  "cuisine_mediterranean",
  "cuisine_american",
  "cuisine_cafe_dessert",
] as const;

export type LatLng = { lat: number; lng: number };

// Public subset of a Place (S5.2), read from the place list in places.ts.
export type Place = {
  id: string;
  name: string;
  category: Category;
  cuisine: string;
  address: string;
  lat: number;
  lng: number;
  priceLevel: number;
  costPerPerson: number;
  dietary: string[];
  rating: number;
  reviewCount: number;
  googlePlaceId?: string;
  sources?: string[];
};

export type Hard = {
  vetoCuisines: string[] | null;
  vetoCategories: string[] | null;
  budgetMaxPerPerson: number | null;
  dietary: string[] | null;
  maxTravelMinutes: number | null;
};

export type PlanStop = {
  placeId: string;
  name: string;
  category: Category;
  start: string;
  end: string;
  lat: number;
  lng: number;
  costPerPerson: number;
};

export type Plan = {
  id: string;
  kind: PlanKind;
  stops: PlanStop[];
  costPerPerson: number;
  robustness: number;
  // Stripped unless showWhoCompromised.
  perMember?: { memberId: string; ratioMean: number; ratioP10: number }[];
  whyLine: string;
  gaveUp?: { memberId: string; feature: string; text: string }[];
};

export type ParetoPoint = {
  planId: string;
  meanRatio: number;
  minRatio: number;
  robustness: number;
};

export type PosteriorSummary = {
  memberId: string;
  features: { name: string; mean: number; sd: number }[];
};

export type PlanResult = {
  runId: string;
  plans: Plan[];
  pareto: ParetoPoint[];
  stats: {
    candidatePlans: number;
    feasiblePlans: number;
    samples: number;
    elapsedMs: number;
  };
  relaxationHints: unknown[];
  warnings: string[];
};

export type CouncilOutcome = {
  chosenPlanId: string;
  rationale: string;
  fallbackUsed: boolean;
  agreesWithSolver: boolean;
};

export type PlanRun = {
  runId: string;
  status: "running" | "done" | "error";
  result: PlanResult | null;
  council: CouncilOutcome | null;
  error: string | null;
};

export type GroupMember = {
  id: string;
  name: string;
  ready: boolean;
  swipeCount: number;
};

export type GroupState = {
  id: string;
  status: GroupStatus;
  code: string;
  date: string;
  window: { start: string; end: string };
  demoMode: boolean;
  showWhoCompromised: boolean;
  isHost: boolean;
  members: GroupMember[];
  confidence: number | null;
  latestRunId: string | null;
  replanFor: string | null;
};

export type Offer = {
  offerId: string;
  type: "budget" | "travel";
  amount: number;
  unit: "usd" | "min";
  plan: Plan;
  text: string;
  robustnessGain: number;
  minRatioGain: number;
  status: "open" | "accepted" | "declined";
};

export type MyPrivate = {
  text: string | null;
  hard: Hard | null;
  warnings: string[];
  posteriorSummary: PosteriorSummary | null;
  nextPair: { a: string; b: string; category: Category } | null;
  offers: Offer[];
};

export type Stance = "support" | "accept" | "oppose";

export type CouncilMessage = {
  id: string;
  runId: string;
  round: 1 | 2 | 3;
  speaker: "advocate" | "chair";
  label: string;
  memberId?: string;
  planId: string | null;
  stance: Record<string, Stance> | null;
  text: string;
  cited: { tool: string; field: string; value: number }[];
  ts: number;
};

export type ScoutCheck = {
  placeId: string;
  openNow: boolean | null;
  vegetarianOptions: boolean | null;
  checkedAt: number;
  source: string;
  cached: boolean;
};

export type Votes = {
  counts: Record<string, number>;
  total: number;
  myVote: string | null;
};

export type FailReason = "full" | "closed" | "no_answer" | "refused" | "error";

export type CallEvent = {
  id: string;
  bookingId: string;
  type:
    | "dialing"
    | "connected"
    | "transcript"
    | "slot_offered"
    | "confirmed"
    | "failed"
    | "ended";
  text: string | null;
  textEn?: string | null;
  speaker?: "agent" | "restaurant";
  lang?: string;
  slot: string | null;
  reason?: FailReason;
  ts: number;
};

export type Booking = {
  bookingId: string;
  runId: string;
  planId: string;
  stopIndex: number;
  placeId: string;
  restaurantName: string;
  partySize: number;
  time: string;
  status: "pending" | "calling" | "confirmed" | "failed";
  slot: string | null;
  failReason: FailReason | null;
};
