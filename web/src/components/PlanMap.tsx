import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { PlanStop } from "../types";
import { displayTime } from "../venueFormatting";
import { useCatalogListings } from "../catalogData";
import { DIRECTIONS_MODES, directionsLabels, googleMapsEmbedUrl, mapsSegments } from "../googleMaps";
import { useDirectionsMode } from "../directionsMode";
import { distanceKm, displayDistance } from "../routeDistance";

const embedKey = import.meta.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_API_KEY as string | undefined;
type MapStop = Pick<PlanStop, "placeId" | "name" | "lat" | "lng"> & Partial<Pick<PlanStop, "start" | "end">>;
type Props = { plan: { stops: MapStop[] }; lines: [number, number][][] };

export default function PlanMap(props: Props) {
  return embedKey ? <GoogleRouteMap {...props} /> : <StreetMap {...props} />;
}

function GoogleRouteMap({ plan }: Props) {
  const listings = useCatalogListings();
  const [mode, setMode] = useDirectionsMode(plan.stops);
  const [leg, setLeg] = useState(0);
  const segments = mapsSegments(plan.stops, mode);
  const distance = plan.stops.slice(1).reduce((sum, stop, index) => sum + distanceKm(plan.stops[index], stop), 0);
  const selected = Math.min(leg, segments.length - 1);
  const url = googleMapsEmbedUrl(segments[selected] ?? [], listings, mode, embedKey!);
  if (!url) return <p className="muted">Map unavailable for these stops.</p>;
  return <section className="card map-card" aria-label="Route directions">
    {plan.stops.length > 1 ? <div className="directions-controls">
      <div className="directions-heading"><strong>Preview your route</strong><span className="muted text-sm">{distance <= .1 ? `${displayDistance(distance)} apart · straight-line` : "Google Maps directions"}</span></div>
      <div className="directions-modes" role="group" aria-label="Travel mode">{DIRECTIONS_MODES.map(value =>
        <button key={value} type="button" className="directions-mode" aria-pressed={mode === value} onClick={() => { setMode(value); setLeg(0); }}>{directionsLabels[value]}</button>)}</div>
      {segments.length > 1 ? <div className="directions-legs" role="group" aria-label="Transit legs">{segments.map((_, index) =>
        <button key={index} className="directions-mode" aria-pressed={selected === index} onClick={() => setLeg(index)}>Stop {index + 1} → {index + 2}</button>)}</div> : null}
    </div> : null}
    <iframe className="google-route-map" title={plan.stops.length === 1 ? `Map of ${plan.stops[0].name}` : `${directionsLabels[mode]} route${segments.length > 1 ? `, leg ${selected + 1}` : ""}`}
      src={url} loading="lazy" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen />
    {plan.stops.length > 1 ? <p className="muted directions-note text-sm">Directions preview. Switching transport doesn’t change your outing’s scheduled times.</p> : null}
  </section>;
}

function StreetMap({ plan, lines }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const boundsRef = useRef<L.LatLngBounds | null>(null);
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
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
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
    // A guide between public venue pins, not a claimed walking/driving path.
    for (const line of lines) {
      const pts = line.map(([lng, lat]) => [lat, lng] as L.LatLngTuple);
      L.polyline(pts, { color: "#6b6880", weight: 3, dashArray: "4 8", opacity: 0.8 }).addTo(layer);
    }
    plan.stops.forEach((s, i) => {
      const icon = L.divIcon({
        className: "map-pin",
        html: `<span>${i + 1}</span>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });
      L.marker([s.lat, s.lng], { icon, title: `${i + 1}. ${s.name}` })
        .bindPopup(`<b>${i + 1}. ${escapeHtml(s.name)}</b><br>${s.start && s.end ? `${escapeHtml(displayTime(s.start))}–${escapeHtml(displayTime(s.end))}` : "Time not set"}`)
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
  }, [plan, lines]);

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
                {s.start && s.end ? `${displayTime(s.start)}–${displayTime(s.end)}` : "Time not set"}
                {i < plan.stops.length - 1 ? ` · ${displayDistance(distanceKm(s, plan.stops[i + 1]))} to next stop` : ""}
              </span>
            </span>
          </li>
        ))}
      </ol>
      {plan.stops.length > 1 ? <p className="muted px-4 pb-3 text-sm">Distances and dashed lines are straight-line guides, not road directions.</p> : null}
    </div>
  );
}

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
