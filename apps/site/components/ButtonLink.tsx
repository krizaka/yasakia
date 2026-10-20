import { Button, type ButtonProps } from "@krizaka/ui/button";
import Link from "next/link";
import type { ReactNode } from "react";

/** Every action is the @krizaka/ui `Button` on a link: internal paths through next/link, anything else in the same tab. */
export function ButtonLink({ href, children, variant = "secondary", size = "lg", shimmer }: { href: string; children: ReactNode; variant?: ButtonProps["variant"]; size?: ButtonProps["size"]; shimmer?: boolean }) {
  const internal = href.startsWith("/");
  return (
    <Button asChild variant={variant} size={size} shimmer={shimmer}>
      {internal ? <Link href={href}>{children}</Link> : <a href={href}>{children}</a>}
    </Button>
  );
}
