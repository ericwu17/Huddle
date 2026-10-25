import { commonCities } from "../../../shared/geography";
import { membersOf } from "./util";
import type { ReadDb } from "./types";
export function huddleLocation(db: ReadDb, groupId: string) {
  return commonCities(membersOf(db, groupId).map(m => ({ city: db.member_location.memberId.find(m.id)?.city, lat: m.originLat, lng: m.originLng })));
}
