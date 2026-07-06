// en-US is fixed intentionally throughout; PDGM/OASIS is US Medicare.

const DOB_FORMAT: Intl.DateTimeFormatOptions = {
  timeZone: "UTC",
  year: "numeric",
  month: "short",
  day: "numeric",
};

// `iso` is a date-only string ("YYYY-MM-DD"). Parse and format are both pinned to UTC so the
// calendar day can't drift between them (a UTC+ device would otherwise show the previous day).
export function formatDob(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString("en-US", DOB_FORMAT);
}

export function formatToday(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export const titleCase = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
