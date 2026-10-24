"""Swipe learning (build-brief C5, C6): Bradley-Terry with a Laplace approximation."""

from itertools import combinations
import random

import numpy as np

from .catalog import Catalog
from .models import NextRequest, NextResponse, Posterior, UpdateRequest, UpdateResponse
from .solver import seed_for

NEWTON_STEPS = 5
MAX_PAIRS = 200


class ElicitError(ValueError):
    def __init__(self, detail: str, status: int = 422):
        super().__init__(detail)
        self.status = status


def sigmoid(z):
    return 1 / (1 + np.exp(-z))


def known(cat: Catalog, ids) -> list[int]:
    missing = sorted({pid for pid in ids if pid not in cat.index})
    if missing:
        # Usually the module still runs STUB_MODE=true and sends stub_* IDs.
        raise ElicitError(f"Unknown place IDs {missing[:3]}; the module and API must use the same STUB_MODE")
    return [cat.index[pid] for pid in ids]


def update(cat: Catalog, request: UpdateRequest) -> UpdateResponse:
    """C5: MAP by Newton steps, then covariance = (Sigma^-1 + s(1-s) d d^T)^-1."""
    winner, loser = known(cat, [request.winnerPlaceId, request.loserPlaceId])
    if cat.category[winner] != cat.category[loser]:
        raise ElicitError("Swipe places must share a category")
    d = cat.X[winner] - cat.X[loser]
    m = np.array(request.posterior.mean)
    sigma = np.array(request.posterior.cov)
    precision = np.linalg.pinv(sigma, hermitian=True)
    theta = m.copy()
    for _ in range(NEWTON_STEPS):
        s = sigmoid(theta @ d)
        gradient = (1 - s) * d - precision @ (theta - m)
        hessian = -s * (1 - s) * np.outer(d, d) - precision
        theta = theta - np.linalg.solve(hessian, gradient)
    s = sigmoid(theta @ d)
    cov = np.linalg.pinv(precision + s * (1 - s) * np.outer(d, d), hermitian=True)
    cov = (cov + cov.T) / 2  # exact symmetry for the contract validator
    return UpdateResponse(posterior=Posterior(mean=theta.tolist(), cov=cov.tolist()))


def next_pair(cat: Catalog, request: NextRequest) -> NextResponse:
    """C6: the unseen same-category pair maximizing (d^T Sigma d) p (1 - p)."""
    ids = sorted(set(request.candidatePlaceIds))
    known(cat, ids + request.focusPlaceIds)
    seen = {tuple(sorted(pair)) for pair in request.alreadySeen}
    pairs = [(a, b) for a, b in combinations(ids, 2)
             if (a, b) not in seen and cat.category[cat.index[a]] == cat.category[cat.index[b]]]
    if not pairs:
        raise ElicitError("No unseen same-category pair left; the exhausted response shape is undefined", 409)
    rng = random.Random(seed_for(request.memberId, len(request.alreadySeen)))
    focus = set(request.focusPlaceIds)
    preferred = [pair for pair in pairs if focus & set(pair)]
    pool = preferred or pairs
    if len(pool) > MAX_PAIRS:
        pool = rng.sample(pool, MAX_PAIRS)
    m = np.array(request.posterior.mean)
    sigma = np.array(request.posterior.cov)
    D = np.array([cat.X[cat.index[a]] - cat.X[cat.index[b]] for a, b in pool])
    p = sigmoid(D @ m)
    score = np.einsum("pi,ij,pj->p", D, sigma, D) * p * (1 - p)
    a, b = pool[int(np.argmax(score))]  # argmax keeps the first of equal scores: deterministic
    if rng.random() < 0.5:
        a, b = b, a
    return NextResponse(a=a, b=b, category=cat.category[cat.index[a]])
