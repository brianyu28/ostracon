/**
 * A link that opens a place in a maps app: Google Maps' universal URL, which phones hand to the
 * installed maps app. Coordinates win over the address when present.
 */
export function mapsUrl(place: {
  text: string;
  lat?: number | undefined;
  lng?: number | undefined;
}): string {
  const query =
    place.lat !== undefined && place.lng !== undefined
      ? `${String(place.lat)},${String(place.lng)}`
      : place.text;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
