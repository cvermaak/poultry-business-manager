export type PreTransportProtocolInput = {
  collectionDate: string;
  collectionTime: string;
  feedWithdrawalHours: number;
  stressSupportDays?: number;
};

const pad = (value: number) => String(value).padStart(2, "0");

function formatUtc(date: Date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:00`;
}

/** Uses an explicit SAST offset so protocol milestones remain stable across server timezones. */
export function calculatePreTransportSchedule(input: PreTransportProtocolInput) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.collectionDate)) throw new Error("Collection date must be YYYY-MM-DD");
  if (!/^\d{2}:\d{2}$/.test(input.collectionTime)) throw new Error("Collection time must be HH:MM");
  if (!Number.isInteger(input.feedWithdrawalHours) || input.feedWithdrawalHours < 1 || input.feedWithdrawalHours > 24) {
    throw new Error("Feed withdrawal must be between 1 and 24 hours");
  }
  const collectionAt = new Date(`${input.collectionDate}T${input.collectionTime}:00+02:00`);
  if (Number.isNaN(collectionAt.getTime())) throw new Error("Collection date or time is invalid");
  const stressSupportDays = input.stressSupportDays ?? 3;
  const feedWithdrawalAt = new Date(collectionAt.getTime() - input.feedWithdrawalHours * 60 * 60 * 1000);
  const stressSupportAt = new Date(collectionAt.getTime() - stressSupportDays * 24 * 60 * 60 * 1000);
  return {
    collectionAt: formatUtc(collectionAt),
    feedWithdrawalAt: formatUtc(feedWithdrawalAt),
    stressSupportAt: formatUtc(stressSupportAt),
  };
}
