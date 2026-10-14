import { notFound } from "next/navigation";

/** The language roots (`/en`, `/fr`) and any address that is not one of the three pages: a 404 in the page's language. */
export default function Missing(): never {
  notFound();
}
