/**
 * Server-side timezone utilities for converting UTC timestamps to user's timezone
 */

/**
 * Format a UTC timestamp in the user's timezone
 * @param timestamp - UTC timestamp in milliseconds or ISO string
 * @param timezone - IANA timezone string (e.g., 'Africa/Johannesburg')
 * @param format - 'time' for HH:mm:ss or 'datetime' for YYYY-MM-DD HH:mm:ss
 * @returns Formatted timestamp string
 */
export function formatTimestampInTimezone(
  timestamp: number | string,
  timezone: string,
  format: 'time' | 'datetime' = 'datetime'
): string {
  try {
    const date = typeof timestamp === 'string' ? new Date(timestamp) : new Date(timestamp);
    
    // Create formatter for the specified timezone
    const formatter = new Intl.DateTimeFormat('en-ZA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    const parts = formatter.formatToParts(date);
    const values: Record<string, string> = {};
    
    for (const part of parts) {
      if (part.type !== 'literal') {
        values[part.type] = part.value;
      }
    }

    if (format === 'time') {
      return `${values.hour}:${values.minute}:${values.second}`;
    } else {
      return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}:${values.second}`;
    }
  } catch (error) {
    console.error(`Error formatting timestamp in timezone ${timezone}:`, error);
    // Fallback to UTC
    const date = typeof timestamp === 'string' ? new Date(timestamp) : new Date(timestamp);
    if (format === 'time') {
      return date.toISOString().slice(11, 19);
    } else {
      return date.toISOString().slice(0, 19).replace('T', ' ');
    }
  }
}

/**
 * Get the current time in the user's timezone as a formatted string
 * @param timezone - IANA timezone string
 * @param format - 'time' or 'datetime'
 * @returns Formatted current time in the user's timezone
 */
export function getNowInTimezone(
  timezone: string,
  format: 'time' | 'datetime' = 'datetime'
): string {
  return formatTimestampInTimezone(Date.now(), timezone, format);
}
