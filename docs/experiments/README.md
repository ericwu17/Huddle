# Experiments (SIMULATED)

> **Everything here is SIMULATED.** Groups, tastes, constraints, and swipes are synthetic; ground truth is the synthetic taste vector. Only place features come from real data (`data/places.json`). Regenerate with `python docs/experiments/sim.py`.

Seed 7; 1000 groups of 3-5; generated 2026-10-23 19:33.

**Caveat:** these features are identical for every place in this file, so they carry no signal: noise, crowd, wait, value, romance, service, outdoor, novelty. Rerun once `data/places.json` v2 (real review aspects) lands.

## Headline numbers (Experiment A)

- maximin: worst member at 83.7% of ideal; 0.0% of groups leave someone below 50%.
- utilitarian: worst member at 83.1% of ideal; 0.0% of groups leave someone below 50%.
- plurality: worst member at 78.9% of ideal; 0.0% of groups leave someone below 50%.
- random: worst member at 69.5% of ideal; 0.0% of groups leave someone below 50%.

Baselines are oracles: they see each synthetic member's true taste. "ours" sees it only through a posterior (mean = true taste, sd 0.3) and plans under uncertainty.

## Experiment A: choice rules

| method | groups | worst ratio (95% CI) | Gini (95% CI) | share with someone < 50% (95% CI) | mean ratio |
| --- | --- | --- | --- | --- | --- |
| random | 1000 | 0.695 [0.685, 0.705] | 0.059 [0.056, 0.062] | 0.0% [0.0%, 0.0%] | 0.808 |
| plurality | 1000 | 0.789 [0.777, 0.801] | 0.053 [0.050, 0.056] | 0.0% [0.0%, 0.0%] | 0.913 |
| utilitarian | 1000 | 0.831 [0.821, 0.841] | 0.039 [0.036, 0.041] | 0.0% [0.0%, 0.0%] | 0.945 |
| maximin | 1000 | 0.837 [0.828, 0.847] | 0.037 [0.035, 0.040] | 0.0% [0.0%, 0.0%] | 0.941 |
| nash | 1000 | 0.833 [0.822, 0.843] | 0.038 [0.036, 0.040] | 0.0% [0.0%, 0.0%] | 0.945 |

Paired differences (method minus reference, same groups, bootstrap 95% CI over groups):

| method | vs | metric | diff | 95% CI |
| --- | --- | --- | --- | --- |
| random | maximin | minRatio | -0.142 | [-0.152, -0.132] |
| random | maximin | gini | +0.022 | [+0.020, +0.024] |
| random | maximin | below50 | +0.000 | [+0.000, +0.000] |
| plurality | maximin | minRatio | -0.048 | [-0.054, -0.043] |
| plurality | maximin | gini | +0.015 | [+0.014, +0.017] |
| plurality | maximin | below50 | +0.000 | [+0.000, +0.000] |
| utilitarian | maximin | minRatio | -0.006 | [-0.008, -0.004] |
| utilitarian | maximin | gini | +0.001 | [+0.001, +0.002] |
| utilitarian | maximin | below50 | +0.000 | [+0.000, +0.000] |
| nash | maximin | minRatio | -0.004 | [-0.006, -0.003] |
| nash | maximin | gini | +0.001 | [+0.000, +0.001] |
| nash | maximin | below50 | +0.000 | [+0.000, +0.000] |

## Experiment B: swipe selection

Not run yet (see notes).

## Notes

- ours SKIPPED: FASTAPI_BASE_URL is not set (the solver is not ready). No ours numbers were produced.
- Experiment B SKIPPED: FASTAPI_BASE_URL is not set (/elicit/* not available). Scaffolding only.

## Method

- Taste: theta_i = sqrt(rho) * shared + sqrt(1 - rho) * noise_i, all N(0, I) over the 13 contract features; rho ~ U(0.2, 0.8) per group.
- Hard constraints per member: cuisine veto p=0.25 (second p=0.1), dessert-category veto p=0.05, cap of 2 vetoes; budget p=0.3 from [12, 15, 20, 25]; vegetarian p=0.15; travel cap p=0.25 from [10, 15, 20, 30] min, origin uniform within 1.5 km of the places' centroid. Groups with no feasible plan are redrawn.
- Hard filter: build-brief C4, except the dietary check applies to meals and desserts only (activities have no dietary tags, so the literal rule leaves any group with a vegetarian zero plans; flagged to C).
- Utility, per-member per-category range normalization, plan utility (mean over stops), ratio to the member's best feasible plan: build-brief C3. A category where a member's utility is flat gives every place 1.0.
- Plans: build-brief C4 templates, 15-min start grid in Sat 17:00-23:00, each stop starts on the grid after travel (haversine x1.3; 4.5 km/h up to 1.2 km, else 18 km/h), all stops open for their dwell, first leg within each member's travel cap.
- Rules: random feasible plan; plurality (each member votes one favorite, most votes wins); utilitarian (max sum of ratios); maximin (max min ratio, tie-break sum); Nash (max product of ratios). Ties broken at random.
- Metrics per group: min ratio, Gini of ratios, whether min ratio < 0.5. Means with bootstrap 95% CIs (2,000 resamples).

Files: `results/exp_a_groups.csv`, `results/exp_a_summary.csv`, `results/exp_a_paired.csv`, `results/summary.json`, `results/chart.png`

![SIMULATED results](results/chart.png)
