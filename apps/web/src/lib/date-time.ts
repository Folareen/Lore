const date = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});
const time = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZone: 'UTC',
  timeZoneName: 'short',
});
/** Explicit UTC keeps SSR, public links and cross-time-zone audit records consistent. */
export function formatDate(value: string | Date) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? 'Date unavailable'
    : date.format(parsed);
}
export function formatDateTime(value: string | Date) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? 'Date unavailable'
    : `${date.format(parsed)} · ${time.format(parsed)}`;
}
