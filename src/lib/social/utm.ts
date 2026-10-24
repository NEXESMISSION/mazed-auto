import { siteUrl } from "@/lib/siteUrl";

export type SocialNetwork = "facebook" | "instagram";

/**
 * The link a social post carries back to the annonce, tagged so a visit can be
 * told apart from any other (brief §9). `utm_content` names the publication
 * job once it exists, so a click is attributed to one post, not just to a
 * network.
 */
export function socialLink(listingId: string, network: SocialNetwork, content?: string): string {
  const u = new URL(`${siteUrl()}/fr/annonces/${listingId}`);
  u.searchParams.set("utm_source", network);
  u.searchParams.set("utm_medium", "social");
  u.searchParams.set("utm_campaign", "social_publisher");
  if (content) u.searchParams.set("utm_content", content);
  return u.toString();
}

/** The tags of an arrival, if it came from the Social Publisher. */
export function readSocialUtm(params: URLSearchParams): { network: SocialNetwork; content: string | null } | null {
  if (params.get("utm_medium") !== "social" || params.get("utm_campaign") !== "social_publisher") return null;
  const source = params.get("utm_source");
  if (source !== "facebook" && source !== "instagram") return null;
  const content = params.get("utm_content");
  return { network: source, content: content && /^[0-9a-f-]{36}$/i.test(content) ? content : null };
}
