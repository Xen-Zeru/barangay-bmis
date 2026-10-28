const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('en-PH', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Manila',
});

const DATE_FORMATTER = new Intl.DateTimeFormat('en-PH', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'Asia/Manila',
});

const NUMBER_FORMATTER = new Intl.NumberFormat('en-PH');

export function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return 'No previous sign-in';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown';
  }

  return DATE_TIME_FORMATTER.format(date);
}

export function formatToday(now: Date = new Date()): string {
  return DATE_FORMATTER.format(now);
}

export function formatNumber(value: number): string {
  return NUMBER_FORMATTER.format(value);
}

export function initials(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

export function greetingForNow(now: Date = new Date()): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hourCycle: 'h23',
      timeZone: 'Asia/Manila',
    }).format(now),
  );

  if (hour < 12) {
    return 'Good morning';
  }
  if (hour < 18) {
    return 'Good afternoon';
  }
  return 'Good evening';
}

const BIRTH_DATE_FORMATTER = new Intl.DateTimeFormat('en-PH', {
  dateStyle: 'medium',
  timeZone: 'UTC',
});

export function formatBirthDate(value: string | null | undefined): string {
  if (!value) {
    return 'Not recorded';
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown';
  }
  return BIRTH_DATE_FORMATTER.format(date);
}
