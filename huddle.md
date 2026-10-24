# Huddle: Task Split (v3)

> Local file only. Not published or committed anywhere.
>
> **Time labels:** H0 = Fri 9 PM (assumed; shift if kickoff differs).
> **Gates:** L1 = H13 (Sat 10 AM), L2 = H19 (Sat 4 PM), L3 = H24 (Sat 9 PM, freeze).
> **Target submit** Sun 7:30 AM; hard deadline 9 AM; checked in by 8 AM.

## What changed in v3 (agent decisions folded in)

- **Council:** four advocates plus a chair, built as plain model calls in Max's solver service. Advocates on the fast model, chair on the smart model. The validator, the acceptable set, and the Safe fallback are our code. Fetch.ai wrapper only if the booth confirms a real prize, decided at H19.
- **Scout agent:** Bright Data live check on each plan's restaurant (Eric Chen), with a cached fallback.
- **Re-plan loop:** if the restaurant says it is full, the app excludes it and plans again; one tap to call the replacement. Haydn writes the replan action, Eric Wu writes the call's failure report, Eric Chen wires the trigger.
- **Vote** among the three named plans; the council's pick is highlighted, not forced.
- **Stretch only (cut first):** live slot approval, language lock, English line, latency display, advocate voices, calendar export. Built before the H24 freeze or not at all.
- **Not used:** Wajo, Factory, Grok multi-agent, Apple Wallet.

Full specs for all of this are in [huddle-build-brief-v2.md](build-brief.md).

## What changed in v2

Frontend is no longer one person's job. Haydn becomes the patch-things-up person: data, routing, glue, and the end-to-end smoke tests. A bare-bones UI goes up early so the product always runs; the polished screens are split three ways and built later (H19 to H24).

### Roles

Proposed from your LinkedIn PDFs, not confirmed by anyone yet:

| Role | Owner |
| --- | --- |
| A, data + routing + glue | Haydn |
| B, SpacetimeDB + submission | Eric Chen |
| C, solver + council | Max |
| D, voice | Eric Wu |

### Assumptions (tell me if wrong)

- Eric Chen is unavailable roughly H9 to H15 (Sat 6 AM to noon). Haydn is awake from H9 and covers that gap.
- Max misses a short stretch tonight. If he isn't there at kickoff, Eric Wu writes the stub solver.
- Sleep shifts stay as in the playbook: A+C H5-9; B+D H9-13; A+D H26-30; B+C H30-34. At least two awake at all times, hand-off note before sleeping.
- Council logic (prompts, tools, validator) lives in Max's solver service. The SpacetimeDB module only stores the messages.

---

## Tonight, before kickoff (accounts and paper only, no code)

| Who | Do |
| --- | --- |
| Haydn | Mapbox token. Bright Data account. Read the council-and-math file. |
| Eric Chen | SpacetimeDB, Google Places, Vultr accounts and keys. Ask the Bright Data booth the four questions in the council-and-math file. |
| Max | Claude API key. Decide the stub /plan shape from the contract. |
| Eric Wu | Upgrade Twilio and buy a number. Cartesia account. Ask Cartesia about Cantonese speech. |

**Booths:** Meta: Haydn. Cartesia: Eric Wu. Bright Data: Eric Chen. Microsoft, Fetch.ai: Max. Everyone asks: "What does a winning project look like, and is there an extra form or post at submission?"

---

## A. Haydn: data, routing, glue

| Phase | Deliverable |
| --- | --- |
| H0-H2 | Check the contract works across all four services with stubs. Own the end-to-end smoke-test script. |
| H2-H5 | Bare-bones UI, timeboxed to 3 hours: join, wants, swipe, plan list with basic map pins, vote. Default shadcn styling, no polish. Fake data first, then the live SpacetimeDB module. |
| H5-H9 | Sleep. Hand-off note first. |
| H9-H13 | Read Eric Chen's hand-off note. Bright Data review pull for the 45 places. Aspect extraction with Claude (evidence spans, 13-feature order from the brief). Result: places.json v2 with review scores. |
| H13 | Switch the UI from stubs to the live SpacetimeDB module. |
| H13-H15 | Cover anything Eric Chen left half-done. |
| H15-H19 (L2) | Mapbox route geometry and leg-time actions with caching (display and warnings only), plus the replan action. Run the smoke test every 2 hours and fix what breaks. |
| H19-H24 (L3) | Polished screens, pass 1: confidence ring, Safe/Bold/Budget plan cards with the scout badge, vote screen with the council's pick highlighted, Consensus Map scatter and slider, trade-offer card, re-plan banner. Freeze at H24. |
| H24-H34 | Demo video and pitch lead (with Eric Wu). Project image. Rehearsal. |

**Cut first:** Consensus Map slider polish, then Mapbox isochrone, then review scoring (use star ratings).
**Depends on:** Eric Chen's SpacetimeDB module (stubbed by H2), Max's plan shape, places.json v1 at H8.

## B. Eric Chen: SpacetimeDB and submission

| Phase | Deliverable |
| --- | --- |
| H0-H2 | SpacetimeDB module, schema, create_group / join_group / my_group returning fake data. |
| H2-H8 | Every table, view, reducer and job in section S5.5 of the build brief. callApi helper. POST /call-event. New: council_message table and POST /council-message. data/places.json v1 from Google Places (coordinates, price, hours, phone) for about 45 Berkeley places. |
| H8 | Hand-off note: what's done, half-done, where the files are. Then sleep. |
| H9-H15 | Away. Nothing critical owed. |
| H15-H19 (L2) | runPlan, runOffers, acceptOffer end to end against Max's real solver. Health pings and demo-mode switch. |
| H19-H24 (L3) | runScout (Bright Data live check on each plan's restaurant, cached fallback) and runCouncil, then the council panel UI (advocates stream in from the council messages, chair's pick at the end). Test the re-plan loop with Eric Wu. |
| H19-H34 | Experiment harness on simulated groups (fairness method vs simple average, council vs solver agreement). Slide numbers, labeled as simulated. |
| H24-H34 | Devpost writeup, README, repo cleanup, honesty list, submission checklist. Eric Chen owns submission. |

**Cut first:** experiments, then the Bright Data live check, then the council panel (show only the chair's rationale text).
**Depends on:** Max's endpoint shapes.

## C. Max: solver and council

| Phase | Deliverable |
| --- | --- |
| H0-H2 | FastAPI stubs for every endpoint in the contract. If Max is away, Eric Wu writes these. |
| H2-H13 (L1) | Real /parse-prefs, the 13-feature vector, the taste update (Laplace approximation), next-swipe selection, plan enumeration with per-person ratios, and a plain "protect the worst-off" pick. |
| H13-H19 (L2) | Robustness replay (300 draws, tau = 0.6), Safe/Bold/Budget plans, Pareto data for the Consensus Map, confidence for the ring. |
| H19-H24 (L3) | Trade offers (/offers). Council: each role a plain function behind one llm_call adapter; advocate prompts and tools (my_score, my_dealbreakers, my_slack), chair prompt, validator (pick inside the acceptable set, cited numbers match, else fall back to Safe), each message posted to /council-message. Roulette among the top plans on ties. |
| H24-H34 | Help Eric Wu make the call reliable. Help Eric Chen with experiment numbers. |

**Cut first:** council (keep trade offers), then Bold plan.
**Depends on:** places.json v1 at H8 and review scores at H13.

## D. Eric Wu: voice

| Phase | Deliverable |
| --- | --- |
| H0-H2 | POST /book stub that posts a fake call sequence to /call-event. |
| H2-H13 (L1) | Twilio number dials the demo phone only. Pipecat loop: Twilio media stream, speech-to-text, Claude, Cartesia voice. Agent opens in Mandarin and states it is an AI. |
| H13-H19 (L2) | Real booking conversation: ask for a table, handle a counter-offer slot, confirm. Understands Cantonese. Latency target about 1.5 s per turn. Transcript events streamed. |
| H19-H24 (L3) | Fallback decision at the H19 gate: if S1-S3 aren't passing 9 of 10, record a labeled call and play that. "Full" scenario posts a failure with a reason so the re-plan loop can be tested. Call screen UI (live transcript, status stepper, confirmation card). Guidelines in place: says it's an AI, dials only the demo number, only confirms agreed details. Optional extras only if ahead and only before the freeze, in order: language lock, English translation line, latency display, a distinct voice per advocate. |
| H24-H34 | No new features after the freeze. Record the final call. Demo video with Haydn. Rehearsal. |

**Restaurant actor:** Eric Chen is the only Cantonese speaker, so he plays the restaurant for the Cantonese and Mandarin tests (before H8 or after he's back). Not whoever is driving the demo.
**Cut first:** extras, then live call (use the labeled recording), never fake it live.

---

## Who builds which screen

| Screen | Owner | When |
| --- | --- | --- |
| Join, wants, swipe, plan list, vote (bare-bones) | Haydn | H2-H5 |
| Confidence ring, plan cards, Consensus Map, trade-offer card | Haydn | H19-H24 |
| Council panel | Eric Chen | H19-H24 |
| Call screen | Eric Wu | H19-H24 |

## The seven agents (decided)

| Agent | What it does | Owner |
| --- | --- | --- |
| Four advocates | One per person; argue over the three plans using only their own person's numbers | Max |
| Chair | Reads the debate, recommends one of the three approved plans; invalid pick falls back to Safe | Max |
| Scout | Live-checks each plan's restaurant (open now, vegetarian options) through Bright Data | Eric Chen |
| Caller | The voice agent; speaks Mandarin, understands Cantonese, reports why a call failed | Eric Wu |

The re-plan loop ties the caller back to the solver: a "full" result excludes that place and a replacement plan is offered with one tap.

## Cross-person hand-offs

- **H2:** all stubs live (SpacetimeDB views and reducers, FastAPI endpoints, voice /book).
- **H8:** places.json v1 and Eric Chen's hand-off note.
- **H13:** Haydn switches the UI to the live SpacetimeDB module; Max's real /plan replaces the stub.
- **H19:** gate check, cut decisions, council go or no-go.
- **H24:** freeze.

## Global cut order

1. Optional extras (language lock, translation line, area packs, calendar or Wallet export)
2. Experiments
3. Consensus Map slider polish
4. Council panel (keep the plain rationale)
5. Live call (use labeled recording)
6. Review scoring (use star ratings)

**Never cut:** join, private preferences, swipes, a fair plan on a map, voting.
