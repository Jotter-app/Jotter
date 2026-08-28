import { format } from "date-fns";
import { TZDate } from "@date-fns/tz";

/**
 * date-fns's `format` renders using whichever timezone the executing JS
 * runtime is in -- correct once a component has hydrated in the browser,
 * but wrong during the server render that produces the initial HTML (the
 * server's runtime timezone, e.g. UTC on Vercel, is essentially never the
 * viewer's). Wrapping the input in a TZDate makes every getter `format`
 * reads (year/month/day/hour/...) report components in `timeZone` instead
 * of the runtime's own -- so the server render and the client hydration
 * render produce identical text regardless of which machine executes them.
 */
export function formatInTimeZone(date: Date | string, timeZone: string, formatStr: string): string {
  // Normalized to a Date first -- TZDate's overloads resolve cleanly
  // against a single concrete type, not the `Date | string` union this
  // function accepts for caller convenience.
  return format(new TZDate(new Date(date), timeZone), formatStr);
}
