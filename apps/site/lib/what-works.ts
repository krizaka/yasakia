/**
 * What already runs in Yasakia, read by the home page: an id and a status per item; the words are messages
 * (`home.works.<id>.{title,text}`). A status is "working" only when the code runs it today (tests name the code).
 */
export const WHAT_WORKS = [
  { id: "location", status: "working" },
  { id: "radius", status: "working" },
  { id: "signin", status: "working" },
  { id: "batches", status: "development" },
] as const;

export type WorksStatus = (typeof WHAT_WORKS)[number]["status"];
