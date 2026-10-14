import { Button, type ButtonProps } from "@krizaka/ui/button";
import Link from "next/link";

/** A link that looks like a @krizaka/ui Button — Next's router link inside `asChild`. */
export function ButtonLink({ href, children, ...props }: Omit<ButtonProps, "asChild"> & { href: string }) {
  return (
    <Button asChild {...props}>
      <Link href={href}>{children}</Link>
    </Button>
  );
}
