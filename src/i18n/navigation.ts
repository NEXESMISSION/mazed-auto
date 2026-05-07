import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

// Use these in place of `next/link`, `next/navigation`'s `redirect`, and
// `useRouter()` so locale prefixes stay consistent (`/fr/auctions` from a
// French page, `/auctions` from an Arabic page).
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
