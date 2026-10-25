"""Offline coverage regressions; no scrapes, paid provider calls or publication."""
from collections import Counter
import copy
import json
from pathlib import Path
import unittest

from api.agent_models import AgentCatalog, PublishedCatalog
from api.catalog import CatalogCache
from api.geography import area, balanced_candidates, balanced_venues, city
from api.menu_catalog import enrich_catalog
from api.agent import candidates, eligible
from api.eval.test_menu_planner import scenario, MenuModel
from api.agent import coordinate
from scripts.build_city_catalog import build_pool


def read(name):
    return json.loads(Path('data/brightdata', name).read_text())


class PoolTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.base, cls.details = read('catalog.json'), read('details.json')
        cls.rows, cls.snaps, cls.prices = read('places.json'), read('snapshots.json'), read('google_places.json')
        cls.pool = build_pool(cls.base, cls.details, cls.rows, cls.snaps, cls.prices)

    def test_all_original_ids_menus_and_photos_survive_exactly(self):
        enriched = enrich_catalog(self.base, self.details)
        self.assertEqual(self.pool['venues'][:len(enriched['venues'])], enriched['venues'])
        self.assertEqual(sum(len(v['evidence']['menu']['items']) for v in self.pool['venues']), 950)
        self.assertGreaterEqual(sum(len(v['evidence']['photos']) for v in self.pool['venues']), 386)
        # Publishing with missing sidecars cannot erase previously sourced data.
        again = enrich_catalog(self.pool, [])
        self.assertEqual(again['venues'], self.pool['venues'])

    def test_three_cities_have_real_hours_photos_and_no_invented_menus(self):
        model = PublishedCatalog.model_validate({'version': self.pool['version'],
            'places': [v['place'] for v in self.pool['venues']],
            'evidence': {v['place']['id']: v['evidence'] for v in self.pool['venues']}})
        self.assertEqual(len(model.places), 200)
        counts = Counter((city(p), p.category) for p in model.places)
        for name in ('San Francisco', 'Oakland'):
            for category in ('meal', 'activity', 'dessert'):
                self.assertGreaterEqual(counts[name, category], 7)
        for p in model.places[140:]:
            self.assertTrue(any(p.hours.values()))
            self.assertGreaterEqual(p.reviewCount, 50)
            self.assertTrue(model.evidence[p.id].sources)
            self.assertEqual(model.evidence[p.id].menu.items, [])
        # Publication can grow while coordinator payload stays bounded.
        with self.assertRaises(ValueError):
            AgentCatalog.model_validate(model.model_dump())

    def test_deterministic_build_and_closed_duplicate_rows_cannot_enter(self):
        self.assertEqual(self.pool, build_pool(self.base, self.details, list(reversed(self.rows)), self.snaps, self.prices))
        candidate = next(r for r in self.rows if ', San Francisco, CA' in (r.get('address') or '') and r.get('google'))
        bad = copy.deepcopy(candidate)
        bad.update(bdId='synthetic-closed-test', name='SYNTHETIC CLOSED TEST')
        bad['google'].update(permanently_closed=True, rating=5, reviews_count=999999)
        result = build_pool(self.base, self.details, self.rows + [bad], self.snaps, self.prices)
        self.assertEqual(result, self.pool)


class BalancedContextTests(unittest.IsolatedAsyncioTestCase):
    async def test_city_facts_and_compact_candidates_reach_the_coordinator(self):
        snapshot, body = scenario()
        places = []
        evidence = {}
        for i, (name, lat, lng) in enumerate((('Berkeley', 37.87, -122.27), ('Oakland', 37.80, -122.27), ('San Francisco', 37.77, -122.42))):
            for p in snapshot.places:
                place = p.model_copy(deep=True)
                place.id = f'{i}_{p.id}'
                place.address = f'1 Test St, {name}, CA 00000, United States'
                place.lat, place.lng = lat, lng
                places.append(place)
                if p.id in snapshot.evidence:
                    evidence[place.id] = snapshot.evidence[p.id]
        model = AgentCatalog(version='synthetic-three-cities', places=places, evidence=evidence)
        body.catalog = model
        cache = CatalogCache().get(model)
        offered = balanced_candidates(candidates(cache, body), cache)
        self.assertEqual({area(cache.places[cache.index[p.stops[0].placeId]]) for p in offered.values()}, {'sf', 'oakland', 'berkeley'})
        self.assertTrue(all(len({area(cache.places[cache.index[s.placeId]]) for s in p.stops}) == 1 for p in offered.values()))
        self.assertEqual({area(p) for p in balanced_venues(places)[:3]}, {'sf', 'oakland', 'berkeley'})
        class Capture(MenuModel):
            async def call(self, role, system, user, schema, model, timeout, **kwargs):
                self.context = json.loads(user)
                raise ValueError('synthetic capture, no provider call')
        llm = Capture()
        await coordinate(llm, cache, body)
        self.assertEqual({v['city'] for v in llm.context['venues'].values()}, {'San Francisco', 'Oakland', 'Berkeley'})
        self.assertTrue(all('address' in v and 'lat' in v and 'lng' in v for v in llm.context['venues'].values()))
        self.assertLessEqual(len(llm.context['candidates']), 120)
