/** The zone every date of the console is shown in: the server renders in UTC and the browser in its own zone, so a machine's zone would differ between the two and break hydration. */
export const PRODUCT_TIME_ZONE = "America/Montreal";

export function dateFormat(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: PRODUCT_TIME_ZONE });
}
