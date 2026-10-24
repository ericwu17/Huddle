"""Invitation resolution and shared time checks; no external accounts or writes."""
from datetime import datetime, timezone
import json
import unittest
from fastapi.testclient import TestClient
from fastapi import HTTPException
from pydantic import ValidationError
from api.main import Settings, create_app
from api.invitations import InviteIntentRequest, interpret_invitation
from api.scheduling import CalendarScheduleRequest, free_slots, choose_time, MeetupRequest
from api.connectors_models import CalendarAvailabilityResponse

class Model:
    available = True
    def __init__(self, data=None): self.data=data; self.calls=0; self.context=None
    async def call(self, role, system, user, schema, model, timeout, **kwargs):
        self.calls+=1; self.context=json.loads(user)
        data=self.data or {"slotId": next(iter(self.context['openings']))}
        kwargs['check'](data)
        return data

class Calendar:
    def __init__(self, availability): self.value=availability
    async def availability(self, request): return CalendarAvailabilityResponse.model_validate({'availability':self.value,'updatedConnections':[]})

def schedule(**changes):
    data={'connections':[{'accountId':a,'tokenCiphertext':'synthetic-only'}for a in ['a','b']],
          'members':[{'accountId':a,'prompt':'PRIVATE_REQUEST'}for a in ['a','b']],
          'timeMin':'2030-01-01T16:00:00Z','timeMax':'2030-01-02T04:00:00Z',
          'dayStart':'09:00','dayEnd':'20:00','durationMinutes':60,'timeZone':'America/Los_Angeles'}
    return CalendarScheduleRequest.model_validate({**data,**changes})

def availability(): return [{'accountId':'a','busy':[]},{'accountId':'b','busy':[]}]

class InviteTests(unittest.IsolatedAsyncioTestCase):
    async def test_contacts_closed_set_preview_never_sends_preferences(self):
        contacts=[{'accountId':'alex','username':'alex','displayName':'Alex'},{'accountId':'mark','username':'mark','displayName':'Mark'}]
        body=InviteIntentRequest(text='Dinner with Alex and Mark',contacts=contacts)
        model=Model({'friendAccountIds':['alex','mark'],'ambiguousNames':[],'unknownNames':[],'outingKind':'meal'})
        result=await interpret_invitation(model,body)
        self.assertEqual(result.friendAccountIds,['alex','mark'])
        self.assertEqual(result.summary,'A meal together')
        self.assertNotIn('preferences',result.model_dump())
        model=Model({'friendAccountIds':['outsider'],'ambiguousNames':[],'unknownNames':[],'outingKind':'meal'})
        with self.assertRaises(HTTPException): await interpret_invitation(model,body)
    async def test_blank_is_picker_only_and_ambiguity_is_not_guessed(self):
        model=Model(); result=await interpret_invitation(model,InviteIntentRequest(text='',contacts=[]))
        self.assertFalse(result.friendAccountIds);self.assertEqual(model.calls,0)
        result=await interpret_invitation(Model({'friendAccountIds':[],'ambiguousNames':['Alex'],'unknownNames':['Pat'],'outingKind':'hangout'}),InviteIntentRequest(text='Alex and Pat',contacts=[]))
        self.assertEqual(result.ambiguousNames,['Alex']);self.assertFalse(result.friendAccountIds)

class ScheduleTests(unittest.IsolatedAsyncioTestCase):
    async def test_half_open_busy_intervals_and_no_private_details_to_model(self):
        busy=availability();busy[0]['busy']=[{'start':'2030-01-01T17:00:00Z','end':'2030-01-01T19:00:00Z'}]
        model=Model(); result=await choose_time(Calendar(busy),model,schedule())
        self.assertTrue(result.ok)
        self.assertGreaterEqual(datetime.fromisoformat(result.chosen.start).astimezone(timezone.utc),datetime(2030,1,1,19,tzinfo=timezone.utc))
        self.assertNotIn('busy',model.context);self.assertNotIn('PRIVATE_REQUEST',result.model_dump_json())
        self.assertEqual(result.chosen.windowStart,'11:00')
    async def test_missing_calendar_is_never_assumed_free(self):
        with self.assertRaises(HTTPException): await choose_time(Calendar(availability()[:1]),Model(),schedule())
    async def test_duration_limits_and_no_common_slot_never_call_model(self):
        body=schedule();body.members[0].maxOutingMinutes=45
        model=Model();result=await choose_time(Calendar(availability()),model,body)
        self.assertFalse(result.ok);self.assertEqual(model.calls,0)
        busy=[{'accountId':a,'busy':[{'start':'2030-01-01T00:00:00Z','end':'2030-01-03T00:00:00Z'}]}for a in ['a','b']]
        self.assertFalse((await choose_time(Calendar(busy),model,schedule())).ok)
    def test_dst_slots_use_real_utc_intervals(self):
        body=schedule(timeMin='2030-03-10T08:00:00Z',timeMax='2030-03-11T07:00:00Z',dayStart='01:00',dayEnd='04:00')
        rows=CalendarAvailabilityResponse.model_validate({'availability':availability(),'updatedConnections':[]}).availability
        slots=free_slots(body,rows,datetime(2030,3,1,tzinfo=timezone.utc))
        self.assertTrue(slots)
        self.assertTrue(all('T02:' not in s.start for s in slots))
        self.assertTrue(all((datetime.fromisoformat(s.end).astimezone(timezone.utc)-datetime.fromisoformat(s.start).astimezone(timezone.utc)).total_seconds()==3600 for s in slots))
    def test_meetup_nonexistent_and_ambiguous_clock_rejected(self):
        common=dict(meetingId='meeting',connections=[{'accountId':'a','tokenCiphertext':'fake'}],summary='Huddle meetup',location='Park',timeZone='America/Los_Angeles')
        for values in [dict(date='2030-03-10',startTime='02:15',endTime='03:30'),dict(date='2030-11-03',startTime='01:15',endTime='03:00')]:
            with self.assertRaises(ValidationError):MeetupRequest(**common,**values)
    def test_bounds_unique_accounts_and_timezones(self):
        for changes in [dict(timeZone='not/a-zone'),dict(timeMax='2030-03-01T00:00:00Z'),dict(dayEnd='08:00'),dict(connections=[]),dict(durationMinutes=0)]:
            with self.assertRaises(ValidationError): schedule(**changes)

class NewRouteAuth(unittest.TestCase):
    def test_new_operations_all_service_protected_except_state_callback(self):
        with TestClient(create_app(Settings('unit-secret'))) as client:
            paths=['/agent/invite-intent','/connectors/status','/connectors/google/start','/connectors/google/revoke',
                '/connectors/calendar/availability','/connectors/calendar/events','/connectors/calendar/schedule','/connectors/calendar/meetup','/connectors/messages/send','/connectors/contacts/search']
            for path in paths:
                self.assertEqual(client.post(path,json={}).status_code,401,path)
                self.assertEqual(client.post(path,json={},headers={'X-Huddle-Secret':'wrong'}).status_code,401,path)
            response=client.get('/connectors/google/callback',follow_redirects=False)
            self.assertNotEqual(response.status_code,401)
            self.assertNotIn('unit-secret',response.text)
