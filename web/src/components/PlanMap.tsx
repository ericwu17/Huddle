import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { FeatureCollection } from "geojson";
import type { Plan } from "../types";
import { walkRoute, type WalkRoute } from "../walkRoute";
import { displayTime } from "../venueFormatting";

const token = import.meta.env.NEXT_PUBLIC_MAPBOX_TOKEN as string | undefined;

// `lines` are [lng, lat] polylines: Mapbox route legs when routeGeometry
// returned, otherwise straight lines between stops.
type Props = { plan: Pick<Plan, "stops">; lines: [number, number][][] };

export default function PlanMap(props: Props) {
  return token ? <MapboxMap {...props} /> : <StreetMap {...props} />;
}

function MapboxMap({ plan, lines }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const map = new mapboxgl.Map({
      container: container.current!,
      accessToken: token,
      style: "mapbox://styles/mapbox/streets-v12",
      center: [-122.2727, 37.8716], // Berkeley
      zoom: 14,
    });
    map.on("load", () => setLoaded(true));
    mapRef.current = map;
    return () => map.remove();
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;

    const markers = plan.stops.map((s, i) =>
      new mapboxgl.Marker()
        .setLngLat([s.lng, s.lat])
        .setPopup(new mapboxgl.Popup().setText(`${i + 1}. ${s.name}`))
        .addTo(map),
    );

    const data: FeatureCollection = {
      type: "FeatureCollection",
      features: lines.map((coordinates) => ({
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates },
      })),
    };
    const source = map.getSource("route") as mapboxgl.GeoJSONSource | undefined;
    if (source) {
      source.setData(data);
    } else {
      map.addSource("route", { type: "geojson", data });
      map.addLayer({
        id: "route",
        type: "line",
        source: "route",
        paint: { "line-color": "#ff5fb4", "line-width": 5, "line-dasharray": [1, 1.4] },
      });
    }

    if (plan.stops.length > 0) {
      const bounds = new mapboxgl.LngLatBounds();
      plan.stops.forEach((s) => bounds.extend([s.lng, s.lat]));
      map.fitBounds(bounds, { padding: 40, maxZoom: 16 });
    }

    return () => markers.forEach((m) => m.remove());
  }, [plan, lines, loaded]);

  return <div ref={container} className="card h-64 w-full overflow-hidden !p-0" />;
}

// No Mapbox token: a free OpenStreetMap street map (no key needed)
// with big numbered pins, a cased route line and a legend, so it reads on a phone.
function StreetMap({ plan, lines }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const boundsRef = useRef<L.LatLngBounds | null>(null);
  // Walking geometry along streets; "none" means the router failed and the
  // straight `lines` are drawn as a labeled guide instead.
  const routeKey = plan.stops.map((s) => `${s.lng},${s.lat}`).join(";");
  const [walk, setWalk] = useState<{ key: string; route: WalkRoute | null } | null>(null);
  const route = walk?.key === routeKey ? walk.route : undefined;

  useEffect(() => {
    let live = true;
    const points = routeKey.split(";").map((p) => { const [lng, lat] = p.split(",").map(Number); return { lat, lng }; });
    void walkRoute(points).then((r) => { if (live) setWalk({ key: routeKey, route: r }); });
    return () => { live = false; };
  }, [routeKey]);

  useEffect(() => {
    const map = L.map(container.current!, {
      center: [37.8716, -122.2727], // Berkeley
      zoom: 15,
      scrollWheelZoom: false, // let the page scroll past the map
      dragging: !L.Browser.mobile, // one finger scrolls the page; pinch still zooms
      zoomControl: true,
      zoomAnimation: false,
      markerZoomAnimation: false,
    });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · routes <a href="https://routing.openstreetmap.de/">FOSSGIS OSRM</a>',
    }).addTo(map);
    mapRef.current = map;
    // The layout can widen after mount (sidebar, fonts); re-measure and refit.
    const resize = new ResizeObserver(() => {
      if (mapRef.current !== map) return;
      map.stop();
      map.invalidateSize({ animate: false });
      if (boundsRef.current) map.fitBounds(boundsRef.current, { padding: [48, 48], maxZoom: 16, animate: false });
    });
    resize.observe(container.current!);
    return () => {
      resize.disconnect();
      mapRef.current = null;
      map.stop();
      map.remove();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const layer = L.layerGroup().addTo(map);
    if (route) {
      const pts = route.line.map(([lng, lat]) => [lat, lng] as L.LatLngTuple);
      // A white casing under the line keeps it visible over busy streets.
      L.polyline(pts, { color: "#fffdf7", weight: 10, opacity: 0.95, lineCap: "round", lineJoin: "round" }).addTo(layer);
      L.polyline(pts, { color: "#ff5fb4", weight: 5, lineCap: "round", lineJoin: "round" }).addTo(layer);
    } else if (route === null) {
      // No walking route: a thin grey guide, labeled in the legend as straight-line.
      for (const line of lines) {
        const pts = line.map(([lng, lat]) => [lat, lng] as L.LatLngTuple);
        L.polyline(pts, { color: "#6b6880", weight: 3, dashArray: "4 8", opacity: 0.8 }).addTo(layer);
      }
    }
    plan.stops.forEach((s, i) => {
      const icon = L.divIcon({
        className: "map-pin",
        html: `<span>${i + 1}</span>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });
      L.marker([s.lat, s.lng], { icon, title: `${i + 1}. ${s.name}` })
        .bindPopup(`<b>${i + 1}. ${escapeHtml(s.name)}</b><br>${escapeHtml(displayTime(s.start))}–${escapeHtml(displayTime(s.end))}`)
        .addTo(layer);
    });
    if (plan.stops.length > 0) {
      const bounds = L.latLngBounds(plan.stops.map((s) => [s.lat, s.lng] as L.LatLngTuple));
      boundsRef.current = bounds;
      // Bounds can update immediately before navigation removes the map. Do not
      // leave a pan/zoom frame targeting a pane that has already been detached.
      map.stop();
      map.fitBounds(bounds, { padding: [48, 48], maxZoom: 16, animate: false });
    }
    return () => {
      if (mapRef.current === map) { map.stop(); layer.remove(); }
    };
  }, [plan, lines, route]);

  return (
    <div className="card map-card">
      <div ref={container} className="map-canvas" role="img" aria-label={`Map of ${plan.stops.length} stops`} />
      <ol className="map-legend">
        {plan.stops.map((s, i) => (
          <li key={s.placeId}>
            <span className="plan-dot">{i + 1}</span>
            <span className="min-w-0">
              <b>{s.name}</b>
              <span className="muted block">
                {displayTime(s.start)}–{displayTime(s.end)}
                {route && i < route.legMinutes.length ? ` · then ~${route.legMinutes[i]} min walk` : ""}
              </span>
            </span>
          </li>
        ))}
      </ol>
      {plan.stops.length > 1 ? (
        <p className="muted px-4 pb-3 text-sm">
          {route === undefined ? "Finding the walking route…"
            : route ? "Walking route and times: OpenStreetMap estimate (FOSSGIS OSRM)."
            : "Walking route unavailable. Grey dashes are a straight-line guide, not a path."}
        </p>
      ) : null}
    </div>
  );
}

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
