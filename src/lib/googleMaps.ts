/** Google Maps API key for dashboard map components (Vite client env). */
export function getGoogleMapsApiKey(): string {
  return (import.meta as ImportMeta & { env?: { VITE_GOOGLE_MAPS_API_KEY?: string } }).env
    ?.VITE_GOOGLE_MAPS_API_KEY ?? "";
}
