export function manilaYear(now = new Date()): number {
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
  }).format(now);
  const year = Number.parseInt(formatted, 10);
  if (!Number.isInteger(year)) {
    throw new Error('Unable to determine the current barangay year.');
  }
  return year;
}
