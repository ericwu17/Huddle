import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { FeatureCollection } from "geojson";
import type { Plan } from "../types";

const token = import.meta.env.NEXT_PUBLIC_MAPBOX_TOKEN as string | undefined;

// `lines` are [lng, lat] polylines: Mapbox route legs when routeGeometry
// returned, otherwise straight lines between stops.
type Props = { plan: Plan; lines: [number, number][][] };

export default function PlanMap(props: Props) {
  return token ? <MapboxMap {...props} /> : <SvgMap {...props} />;
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

// No Mapbox token: plot stops on a plain box so the screen still works.
function SvgMap({ plan, lines }: Props) {
  const W = 360;
  const H = 240;
  const pad = 24;
  const pts = [...plan.stops.map((s) => [s.lng, s.lat] as [number, number]), ...lines.flat()];
  if (pts.length === 0) return null;
  const lngs = pts.map((p) => p[0]);
  const lats = pts.map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [
    Math.min(...lngs),
    Math.max(...lngs),
    Math.min(...lats),
    Math.max(...lats),
  ];
  const sx = (lng: number) => pad + ((lng - minX) / (maxX - minX || 1)) * (W - 2 * pad);
  const sy = (lat: number) => H - pad - ((lat - minY) / (maxY - minY || 1)) * (H - 2 * pad);

  return (
    <div className="card">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        {lines.map((line, i) => (
          <polyline
            key={i}
            fill="none"
            stroke="#ff5fb4"
            strokeWidth={4}
            strokeDasharray="2 7"
            strokeLinecap="round"
            points={line.map(([lng, lat]) => `${sx(lng)},${sy(lat)}`).join(" ")}
          />
        ))}
        {plan.stops.map((s, i) => (
          <g key={s.placeId}>
            <circle cx={sx(s.lng)} cy={sy(s.lat)} r={13} fill="#ffd23a" stroke="#16152b" strokeWidth={3} />
            <text x={sx(s.lng)} y={sy(s.lat)} textAnchor="middle" dominantBaseline="central" fontSize={14} fontFamily="Anton, Impact, sans-serif" fill="#16152b">
              {i + 1}
            </text>
          </g>
        ))}
      </svg>
      <p className="muted">No NEXT_PUBLIC_MAPBOX_TOKEN set: schematic map, north up.</p>
    </div>
  );
}
