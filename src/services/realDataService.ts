/**
 * realDataService.ts
 *
 * Pulls live crisis signals from three free public APIs:
 *   1. Open-Meteo  — real weather for Karachi (no key needed)
 *   2. USGS        — real earthquakes near Pakistan (no key needed)
 *   3. GDACS       — global disaster alerts (no key needed)
 *
 * Every POLL_INTERVAL_MS it checks for new events and injects qualifying
 * ones into the Antigravity pipeline as real signals.
 */

import { IncidentService } from "./incidentService.js";

const POLL_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

// Karachi bounding box
const KARACHI = { lat: 24.8607, lng: 67.0011 };
const PAKISTAN_BBOX = { minLat: 23.0, maxLat: 37.5, minLng: 60.0, maxLng: 77.5 };

let lastIngestedEqIds  = new Set<string>();
let lastIngestedGdacsIds = new Set<string>();

// ─── 1. Open-Meteo — Karachi weather ─────────────────────────────────────────

async function fetchKarachiWeather(): Promise<void> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${KARACHI.lat}&longitude=${KARACHI.lng}` +
      `&current=temperature_2m,precipitation,windspeed_10m,weathercode` +
      `&hourly=precipitation&timezone=Asia%2FKarachi&forecast_days=1`;

    const res  = await fetch(url);
    const data = await res.json();
    const cur  = data.current;

    if (!cur) return;

    const temp     = cur.temperature_2m ?? 0;
    const precip   = cur.precipitation  ?? 0;
    const wind     = cur.windspeed_10m  ?? 0;
    const wCode    = cur.weathercode    ?? 0;

    // Trigger flood signal if heavy precipitation
    if (precip > 20) {
      console.log(`[RealData] Open-Meteo: ${precip}mm rain → injecting flood signal`);
      await IncidentService.processNewSignal({
        source:    "weather",
        type:      "flood_alert",
        data:      {
          rainfall_mm:    precip,
          windspeed_kmh:  wind,
          weathercode:    wCode,
          description:    `Live weather alert: ${precip}mm precipitation in Karachi (Open-Meteo)`,
          source_api:     "open-meteo",
        },
        location:  KARACHI,
        urgency:   precip > 60 ? 9 : precip > 40 ? 7 : 5,
        timestamp: new Date(),
      });
    }

    // Trigger heatwave signal if extreme temperature
    if (temp > 44) {
      console.log(`[RealData] Open-Meteo: ${temp}°C → injecting heatwave signal`);
      await IncidentService.processNewSignal({
        source:  "sensor",
        type:    "heatwave_alert",
        data:    {
          temperature_c:  temp,
          description:    `Live heatwave alert: ${temp}°C in Karachi (Open-Meteo)`,
          source_api:     "open-meteo",
        },
        location: KARACHI,
        urgency:  temp > 48 ? 9 : temp > 46 ? 7 : 5,
        timestamp: new Date(),
      });
    }

    console.log(`[RealData] Open-Meteo: ${temp}°C, ${precip}mm — ${precip > 20 || temp > 44 ? "signal injected" : "no threshold breached"}`);
  } catch (err: any) {
    console.error("[RealData] Open-Meteo fetch failed:", err.message);
  }
}

// ─── 2. USGS — Earthquakes near Pakistan ─────────────────────────────────────

async function fetchUSGSEarthquakes(): Promise<void> {
  try {
    const since = new Date(Date.now() - POLL_INTERVAL_MS).toISOString();
    const url   = `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson` +
      `&starttime=${since}` +
      `&minlatitude=${PAKISTAN_BBOX.minLat}&maxlatitude=${PAKISTAN_BBOX.maxLat}` +
      `&minlongitude=${PAKISTAN_BBOX.minLng}&maxlongitude=${PAKISTAN_BBOX.maxLng}` +
      `&minmagnitude=4.5&orderby=time&limit=5`;

    const res  = await fetch(url);
    const data = await res.json();

    for (const feature of data.features ?? []) {
      const id  = feature.id;
      if (lastIngestedEqIds.has(id)) continue;
      lastIngestedEqIds.add(id);

      const props = feature.properties;
      const [lng, lat] = feature.geometry.coordinates;
      const mag   = props.mag;
      const place = props.place ?? "Near Pakistan";

      console.log(`[RealData] USGS: M${mag} earthquake — ${place} → injecting signal`);

      await IncidentService.processNewSignal({
        source:  "sensor",
        type:    "earthquake_alert",
        data:    {
          magnitude:   mag,
          place,
          usgs_id:     id,
          tsunami_warning: props.tsunami === 1,
          description: `LIVE: M${mag} earthquake detected near ${place} (USGS)`,
          source_api:  "usgs",
        },
        location:  { lat, lng },
        urgency:   mag >= 6.5 ? 10 : mag >= 5.5 ? 8 : 6,
        timestamp: new Date(props.time),
      });
    }

    // Keep set bounded
    if (lastIngestedEqIds.size > 200) lastIngestedEqIds = new Set([...lastIngestedEqIds].slice(-100));
  } catch (err: any) {
    console.error("[RealData] USGS fetch failed:", err.message);
  }
}

// ─── 3. GDACS — Global disaster alerts ───────────────────────────────────────

async function fetchGDACS(): Promise<any[]> {
  try {
    const url = "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH" +
      "?eventlist=FL,EQ,TC,VO,DR&alertlevel=Orange,Red&limit=20";

    const res  = await fetch(url, { headers: { Accept: "application/json" } });
    const data = await res.json();
    const events = data.features ?? [];

    const southAsiaEvents = events.filter((f: any) => {
      const [lng, lat] = f.geometry?.coordinates ?? [0, 0];
      return lat >= 5 && lat <= 40 && lng >= 55 && lng <= 100;
    });

    for (const f of southAsiaEvents) {
      const id = String(f.properties?.eventid ?? f.properties?.id ?? "");
      if (!id || lastIngestedGdacsIds.has(id)) continue;
      lastIngestedGdacsIds.add(id);

      const props = f.properties;
      const [lng, lat] = f.geometry?.coordinates ?? [KARACHI.lng, KARACHI.lat];
      const eventType = props.eventtype ?? "FL";
      const alert     = props.alertlevel ?? "Orange";

      const typeMap: Record<string, string> = {
        FL: "flood_alert", EQ: "earthquake_alert",
        TC: "cyclone_alert", VO: "volcano_alert", DR: "drought_alert",
      };

      console.log(`[RealData] GDACS: ${alert} ${eventType} — ${props.name ?? id} → injecting signal`);

      await IncidentService.processNewSignal({
        source:   "social",
        type:     typeMap[eventType] ?? "flood_alert",
        data:     {
          gdacs_id:     id,
          alert_level:  alert,
          event_name:   props.name,
          country:      props.country,
          description:  `LIVE GDACS ${alert} Alert: ${props.name ?? eventType} (${props.country})`,
          source_api:   "gdacs",
        },
        location:  { lat, lng },
        urgency:   alert === "Red" ? 9 : 6,
        timestamp: new Date(props.fromdate ?? Date.now()),
      });
    }

    if (lastIngestedGdacsIds.size > 200) lastIngestedGdacsIds = new Set([...lastIngestedGdacsIds].slice(-100));
    return southAsiaEvents;
  } catch (err: any) {
    console.error("[RealData] GDACS fetch failed:", err.message);
    return [];
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

let pollingTimer: ReturnType<typeof setInterval> | null = null;

export async function fetchAllLiveData(): Promise<{ weather: string; usgs: string; gdacs: string }> {
  console.log("[RealData] Manual fetch triggered");
  const [, , gdacsEvents] = await Promise.allSettled([
    fetchKarachiWeather(),
    fetchUSGSEarthquakes(),
    fetchGDACS(),
  ]);
  return {
    weather: "Open-Meteo checked",
    usgs:    "USGS earthquakes checked",
    gdacs:   `GDACS: ${(gdacsEvents as PromiseFulfilledResult<any[]>).value?.length ?? 0} South Asia events found`,
  };
}

export function startLiveDataPolling(): void {
  if (pollingTimer) return;
  console.log(`[RealData] Starting live data polling every ${POLL_INTERVAL_MS / 60000} minutes`);

  // Run immediately on start
  fetchAllLiveData().catch(console.error);

  pollingTimer = setInterval(() => {
    fetchAllLiveData().catch(console.error);
  }, POLL_INTERVAL_MS);
}

export function stopLiveDataPolling(): void {
  if (pollingTimer) { clearInterval(pollingTimer); pollingTimer = null; }
}

export { fetchGDACS, fetchKarachiWeather, fetchUSGSEarthquakes };
